/**
 * Type definitions for bazi-solar-time.
 * The implementation is plain JavaScript so that it runs anywhere without a build step.
 */

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface WallTimeWithSeconds extends WallTime {
  second: number;
}

export interface TrueSolarResult {
  /** UTC instant the wall time resolves to */
  utc: Date;
  /** The corrected local time — feed this to your pillar calculation */
  wall: WallTimeWithSeconds;
  /** Offset in effect at that instant, daylight saving included */
  tzOffsetMinutes: number;
  /** The zone's standard offset, without daylight saving */
  standardOffsetMinutes: number;
  /** standard − actual: negative during summer time, and must be added to the clock reading */
  daylightSavingMinutes: number;
  /** Equation of time in minutes; positive means the sundial runs ahead */
  equationOfTimeMinutes: number;
  /** (longitude − standard meridian) × 4 minutes */
  longitudeCorrectionMinutes: number;
  /** Total correction: equation of time + longitude + daylight saving */
  correctionMinutes: number;
}

export function tzOffsetMinutes(timeZone: string, at: Date): number;

export function equationOfTimeMinutes(at: Date): number;

export function wallToUtc(wall: WallTime, timeZone: string): Date;

export function utcToWall(at: Date, timeZone: string): WallTimeWithSeconds;

export function standardOffsetMinutes(timeZone: string, near: Date): number;

export function resolveTrueSolarTime(
  wall: WallTime,
  timeZone: string,
  longitude: number | null | undefined,
): TrueSolarResult;
