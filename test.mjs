import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  equationOfTimeMinutes,
  resolveTrueSolarTime,
  standardOffsetMinutes,
  wallToUtc,
} from './src/true-solar-time.js';

const vectors = JSON.parse(readFileSync(new URL('./test-vectors.json', import.meta.url), 'utf8'));

/** Values carry three decimals; anything within half a second is agreement. */
const near = (actual, expected, tol = 0.01, label = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} expected ${expected}, got ${actual} (tolerance ${tol})`,
  );

for (const v of vectors) {
  test(`vector: ${v.id}`, () => {
    const r = resolveTrueSolarTime(v.input.wall, v.input.timeZone, v.input.longitude);
    const e = v.expected;

    assert.equal(r.utc.toISOString(), e.utc, 'UTC instant');
    assert.deepEqual(r.wall, e.wall, 'corrected wall time');
    assert.equal(r.tzOffsetMinutes, e.tzOffsetMinutes, 'zone offset');
    assert.equal(r.standardOffsetMinutes, e.standardOffsetMinutes, 'standard offset');
    assert.equal(r.daylightSavingMinutes, e.daylightSavingMinutes, 'daylight saving term');
    near(r.equationOfTimeMinutes, e.equationOfTimeMinutes, 0.01, 'equation of time');
    near(r.longitudeCorrectionMinutes, e.longitudeCorrectionMinutes, 0.01, 'longitude term');
    near(r.correctionMinutes, e.correctionMinutes, 0.01, 'total correction');
  });
}

test('invariant: true solar time equals UTC + longitude x 4 + equation of time', () => {
  // The identity this whole module exists to preserve, independent of zone rules.
  for (const v of vectors) {
    if (v.input.longitude == null) continue;
    const r = resolveTrueSolarTime(v.input.wall, v.input.timeZone, v.input.longitude);
    const fromUtc =
      r.utc.getTime() + v.input.longitude * 4 * 60000 + r.equationOfTimeMinutes * 60000;
    const truth = Date.UTC(r.wall.year, r.wall.month - 1, r.wall.day, r.wall.hour, r.wall.minute, r.wall.second);
    near(truth - fromUtc, 0, 60000, `${v.id}: net correction`);
  }
});

test('equation of time extremes land where the almanac puts them', () => {
  near(equationOfTimeMinutes(new Date('2024-02-11T12:00:00Z')), -14.2, 0.4, '11 February');
  near(equationOfTimeMinutes(new Date('2024-11-03T12:00:00Z')), 16.4, 0.4, '3 November');
});

test('standard offset is the smaller of January and July, both hemispheres', () => {
  assert.equal(standardOffsetMinutes('America/New_York', new Date('1990-07-15T12:00:00Z')), -300);
  assert.equal(standardOffsetMinutes('America/New_York', new Date('1990-01-15T12:00:00Z')), -300);
  // Southern hemisphere: January is the summer month.
  assert.equal(standardOffsetMinutes('Australia/Sydney', new Date('2020-01-15T12:00:00Z')), 600);
  assert.equal(standardOffsetMinutes('Asia/Kathmandu', new Date('2020-07-15T12:00:00Z')), 345);
});

test('a missing longitude degrades to equation-of-time only, never NaN', () => {
  const wall = { year: 1990, month: 2, day: 4, hour: 10, minute: 0 };
  for (const lon of [null, undefined]) {
    const r = resolveTrueSolarTime(wall, 'Asia/Taipei', lon);
    assert.equal(r.longitudeCorrectionMinutes, 0);
    assert.ok(Number.isFinite(r.correctionMinutes));
    assert.ok(Number.isFinite(r.wall.minute));
  }
});

test('wall time round-trips through UTC across a DST switch', () => {
  for (const [wall, tz] of [
    [{ year: 1988, month: 6, day: 15, hour: 12, minute: 0 }, 'Asia/Shanghai'],
    [{ year: 1990, month: 7, day: 15, hour: 12, minute: 0 }, 'America/New_York'],
    [{ year: 2020, month: 1, day: 15, hour: 12, minute: 0 }, 'Australia/Sydney'],
    [{ year: 2020, month: 12, day: 31, hour: 23, minute: 59 }, 'Asia/Shanghai'],
  ]) {
    const utc = wallToUtc(wall, tz);
    const back = resolveTrueSolarTime(wall, tz, null);
    assert.equal(back.tzOffsetMinutes, Math.round((Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - utc.getTime()) / 60000));
  }
});
