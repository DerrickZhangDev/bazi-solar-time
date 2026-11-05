/**
 * True solar time (真太阳时) resolution — reference implementation.
 *
 * Pipeline: entered wall time in an IANA zone → UTC instant (historical offsets and
 * daylight saving resolved by Intl) → true solar time = clock time + equation of time
 * + longitude correction − daylight saving.
 *
 * Zero dependencies. Uses only Intl.DateTimeFormat, which carries each zone's full
 * historical rules — including China's 1986–1991 summer time and the pre-1949 offsets.
 *
 * There are three places where this is easy to get wrong, and all three are load-bearing:
 *
 *   1. Daylight saving must be subtracted from the clock reading, not added to UTC.
 *   2. The longitude term must use the zone's *standard* offset, never the offset in
 *      effect. The standard meridian is a geographic constant; a zone does not move
 *      east for the summer. Using the in-effect offset silently inserts a whole hour
 *      into every DST birth.
 *   3. The correction must be applied in clock space (wall time + correction), not by
 *      adding it to the UTC instant and reading the zone back. A correction can cross a
 *      DST switch, and the second read returns the post-switch offset — the hour comes
 *      back in through the window you just closed.
 *
 * Runs on any Node ≥ 18. No build step.
 */

/**
 * Offset of `timeZone` at instant `at`, in minutes, daylight saving included.
 * Derived from Intl so that the IANA database supplies the history.
 */
export function tzOffsetMinutes(timeZone, at) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`Intl parts missing ${type} for ${timeZone}`);
    return Number(p.value);
  };
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  // Drop sub-minute jitter; offsets are whole minutes in every zone we care about.
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Equation of time, in minutes. Positive means the sundial runs ahead of the clock.
 * Astronomical-almanac series (B = 2π(N−1)/365, N = day of year); error < ~15 s
 * across the year. Sanity checks: ≈ −14.2 min around 11 February, ≈ +16.4 min
 * around 3 November.
 */
export function equationOfTimeMinutes(at) {
  const start = Date.UTC(at.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((at.getTime() - start) / 86400000) + 1;
  const B = (2 * Math.PI * (dayOfYear - 1)) / 365;
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(B) -
      0.032077 * Math.sin(B) -
      0.014615 * Math.cos(2 * B) -
      0.040849 * Math.sin(2 * B))
  );
}

/**
 * Resolve a wall-clock time in `timeZone` to a UTC instant.
 * Two-pass fixed point: utc = wallAsUtc − offset(utc). Two passes cross a DST switch;
 * a difference-based iteration oscillates inside the spring-forward gap instead.
 */
export function wallToUtc(wall, timeZone) {
  const target = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let utc = target;
  for (let i = 0; i < 2; i++) {
    utc = target - tzOffsetMinutes(timeZone, new Date(utc)) * 60000;
  }
  return new Date(utc);
}

/** Wall-clock components of a UTC instant, in `timeZone`. */
export function utcToWall(at, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`Intl parts missing ${type} for ${timeZone}`);
    return Number(p.value);
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * The zone's standard offset in minutes, ignoring daylight saving: the smaller of the
 * January and July offsets for that year.
 *
 * Summer time always moves the offset further from zero (UTC+8 → UTC+9 in the east,
 * UTC−5 → UTC−4 in the west), so the standard offset is the smaller of the two — not
 * the one with the smaller absolute value. Comparing absolute values happens to work
 * east of Greenwich and is wrong west of it: New York would be read as −240 instead of
 * −300, putting the standard meridian 15° east and shifting the longitude term by a
 * flat −60 minutes.
 */
export function standardOffsetMinutes(timeZone, near) {
  const y = near.getUTCFullYear();
  const jan = tzOffsetMinutes(timeZone, new Date(Date.UTC(y, 0, 15, 12)));
  const jul = tzOffsetMinutes(timeZone, new Date(Date.UTC(y, 6, 15, 12)));
  return Math.min(jan, jul);
}

/**
 * Resolve true solar time.
 *
 * @param {{year:number,month:number,day:number,hour:number,minute:number}} wall
 * @param {string} timeZone IANA zone name
 * @param {number|null} longitude degrees east of Greenwich; null applies the equation
 *   of time only
 * @returns {{
 *   utc: Date,
 *   wall: {year:number,month:number,day:number,hour:number,minute:number,second:number},
 *   tzOffsetMinutes: number,
 *   standardOffsetMinutes: number,
 *   daylightSavingMinutes: number,
 *   equationOfTimeMinutes: number,
 *   longitudeCorrectionMinutes: number,
 *   correctionMinutes: number
 * }}
 */
export function resolveTrueSolarTime(wall, timeZone, longitude) {
  const utc = wallToUtc(wall, timeZone);
  const offset = tzOffsetMinutes(timeZone, utc);
  const stdOffset = standardOffsetMinutes(timeZone, utc);
  // How far the clock is ahead of standard time (negative during summer time).
  const dst = stdOffset - offset;
  const eot = equationOfTimeMinutes(utc);
  const stdMeridian = (stdOffset / 60) * 15;
  // Both null and undefined mean "no longitude given". Without this check the
  // correction becomes NaN and surfaces much later as Intl's "Invalid time value",
  // with a stack that points at nothing useful.
  const lonCorr = longitude == null ? 0 : (longitude - stdMeridian) * 4;
  const correction = eot + lonCorr + dst;

  // True solar time is UTC + longitude × 4 min + equation of time, independent of the
  // zone's rules. Applying the correction in clock space keeps that identity; applying
  // it to the UTC instant and re-reading the zone would not (see note 3 at the top).
  const wallMs = utc.getTime() + offset * 60000 + Math.round(correction * 60000);

  return {
    utc,
    wall: msToWall(wallMs),
    tzOffsetMinutes: offset,
    standardOffsetMinutes: stdOffset,
    daylightSavingMinutes: dst,
    equationOfTimeMinutes: eot,
    longitudeCorrectionMinutes: lonCorr,
    correctionMinutes: correction,
  };
}

/** Wall-clock parts of a plain epoch-ms value, with no zone lookup. */
function msToWall(ms) {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}
