# bazi-solar-time

True solar time (真太阳时) in JavaScript. No dependencies, no build step.

Chinese astrology — BaZi, Four Pillars, 사주, 四柱推命 — is calculated from the moment of
birth, and that moment is a solar moment, not a civic one. A clock in Urumqi reads the
same hour as a clock in Shanghai, four thousand kilometres east; the sun does not. Two
corrections stand between the birth certificate and the chart:

- **Longitude.** Every time zone has a standard meridian, and almost nobody is born on it.
  The offset is `(longitude − meridian) × 4 minutes`.
- **The equation of time.** The sun runs fast and slow through the year by up to about
  ±16 minutes, because Earth's orbit is elliptical and its axis is tilted.

Together these move a birth time by anything from a couple of minutes to nearly three
hours. That matters because the hour pillar changes on a two-hour boundary and the day
pillar changes at midnight — a correction large enough to cross either one changes the
chart.

```js
import { resolveTrueSolarTime } from 'bazi-solar-time';

const r = resolveTrueSolarTime(
  { year: 1988, month: 6, day: 15, hour: 12, minute: 0 },
  'Asia/Shanghai',
  121.47,
);

r.wall;                 // { year: 1988, month: 6, day: 15, hour: 11, minute: 5, second: 0 }
r.correctionMinutes;    // -54.361
r.daylightSavingMinutes; // -60  (China ran summer time 1986–1991)
r.equationOfTimeMinutes; // -0.241
r.longitudeCorrectionMinutes; // 5.88
```

`wall` is the corrected local time — feed that to your pillar calculation.

## What it handles

- Historical offsets from the IANA database, via `Intl.DateTimeFormat`. China's 1986–1991
  summer time, British Double Summer Time, pre-1949 Chinese offsets, the 2005 change to
  Kazakhstan's zones — all of it comes from the tzdata your runtime ships.
- Zones that are not whole hours from UTC: Kathmandu (+5:45), Adelaide (+9:30), Chatham
  (+12:45).
- Both hemispheres, where the summer month is not July.
- Births where the correction crosses midnight: `1985-02-20 00:10` at 87.6°E resolves to
  `1985-02-19 21:46`.

## The three things that go wrong

This is the part worth reading. Each of these produces plausible-looking output and a
silently wrong chart.

**1. Daylight saving must be subtracted, not ignored.**
A zone at UTC+9 in summer has not moved east; its clocks have. If you treat the read
offset as the standard one, you add an hour to every summer birth, which moves the hour
pillar one or two slots. `daylightSavingMinutes` is `standard − actual`, so it is
negative during summer time — add it and the hour comes back out.

**2. The longitude term uses the *standard* offset, never the offset in effect.**
The standard meridian is a geographic constant. Using the in-effect offset while summer
time is running puts the meridian 15° east and shifts the longitude term by a flat hour.
`standardOffsetMinutes()` takes the smaller of the January and July offsets — smaller,
not smaller in absolute value: summer time always moves the offset away from zero, so
comparing absolute values works east of Greenwich and is wrong west of it. New York read
that way comes out as −240 instead of −300, and every longitude correction in the city is
off by 60 minutes.

**3. Do the arithmetic in clock space, not on the UTC instant.**
True solar time is `UTC + longitude × 4 min + equation of time` — an identity independent
of any zone's rules. It is tempting to add the correction to the UTC instant and then ask
the zone what time that is. Don't: the correction can cross a DST switch, the second read
returns the post-switch offset, and the hour you just removed comes back in through the
window you closed. This implementation adds the correction to the wall time instead, and
the invariant is asserted in the test suite.

## API

| Export | What it does |
| --- | --- |
| `resolveTrueSolarTime(wall, timeZone, longitude)` | The whole pipeline. Returns the corrected wall time plus every intermediate term. |
| `wallToUtc(wall, timeZone)` | Wall time → UTC instant. Two-pass fixed point, so DST boundaries resolve. |
| `utcToWall(date, timeZone)` | UTC instant → wall components in a zone. |
| `tzOffsetMinutes(timeZone, date)` | Offset in effect at that instant, DST included. |
| `standardOffsetMinutes(timeZone, date)` | The zone's standard offset (no DST). |
| `equationOfTimeMinutes(date)` | Equation of time, in minutes. |

`longitude` is degrees east of Greenwich. Pass `null` or `undefined` to apply only the
equation of time — useful when the birthplace is unknown. It will not produce `NaN`.

## Tests

```bash
npm test
```

`test-vectors.json` holds 12 cases with inputs and expected outputs, including the
awkward ones: China 1988 summer time, wartime double summer time in London, the Sydney
autumn overlap where 02:30 happens twice, Urumqi and Kashgar against a UTC+8 meridian, and
a 1901 birth. The vectors were produced by the production engine, not written by hand —
otherwise they would only re-assert whatever this file already does.

There are also property tests: the correction identity above, the equation-of-time
extrema the almanac puts at 11 February and 3 November, and standard offsets in both
hemispheres.

## Provenance

Extracted from the calculation engine behind [BaziPattern](https://bazipattern.com), where
the conventions it feeds into are published in full at
[bazipattern.com/methodology](https://bazipattern.com/methodology). That page also
documents what the surrounding engine does *not* claim: it computes a chart, it does not
predict events.

This package is only the time-normalisation layer. It contains no pillar logic, no solar
terms, and no interpretation — which is why it can be published without reservation.

## License

MIT.
