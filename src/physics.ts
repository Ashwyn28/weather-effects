import type { WeatherCondition } from './conditions.js';
import { PROFILES } from './profiles.js';
import type { Deposit } from './simulation.js';

/** A position in CSS pixels, relative to the viewport. */
export interface Point {
  /** Horizontal position in CSS px. */
  x: number;
  /** Vertical position in CSS px, increasing downwards. */
  y: number;
}

/** A line or polygon that rain splashes on and snow settles on. */
export interface Surface {
  /** Two points make a single segment (such as a top edge); three or more make a closed polygon. */
  points: Point[];
  /** Marks a surface that only some rain reaches, like a room interior. Default `false`. */
  room?: boolean;
  /** Returns `false` while the surface is hidden, so settled snow on it melts away. Omit to treat it as always visible. */
  visible?(): boolean;
}

/** Where a moving point first crosses a {@link Surface}. */
export interface SurfaceHit {
  /** Horizontal position of the hit in CSS px. */
  x: number;
  /** Vertical position of the hit in CSS px. */
  y: number;
  /** How far along the tested movement the hit occurred, from 0 (start) to 1 (end). */
  t: number;
  /** Direction of the surface edge that was hit, in radians. */
  angle: number;
  /** The surface that was hit. */
  surface: Surface;
}

/** Optional live measurements that tune the effects. Missing or non-finite values fall back to the condition's defaults. */
export interface WeatherReading {
  /** Wind speed in km/h, clamped to 0–120. Default depends on the condition. */
  windSpeed?: number;
  /** Peak gust speed in km/h, clamped to between `windSpeed` and 160. Default `windSpeed * 1.5`. */
  windGust?: number;
  /** Meteorological wind direction in degrees: where the wind comes FROM (0 north, 90 east). Default 250. */
  windDirection?: number;
  /** Precipitation rate in mm/h; scales particle density. Default means normal density. */
  precipitation?: number;
  /** Cloud cover as a percentage, 0–100. Default depends on the condition. */
  cloudCover?: number;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Horizontal wind velocity for a screen facing north. Meteorological
 * direction is where the wind comes FROM, so north/south winds stay mostly in
 * depth with a little sideways turbulence.
 *
 * @param reading - Live measurements; missing values fall back to the condition's defaults.
 * @param condition - The active weather condition.
 * @param seconds - Simulated time in seconds, which drives the gust pulse.
 * @returns Horizontal wind in CSS px per second; negative blows left.
 */
export function windAt(
  reading: WeatherReading,
  condition: WeatherCondition,
  seconds: number,
): number {
  const speed =
    reading.windSpeed !== undefined && Number.isFinite(reading.windSpeed)
      ? clamp(reading.windSpeed, 0, 120)
      : PROFILES[condition].precipitation.wind;
  const gust =
    reading.windGust !== undefined && Number.isFinite(reading.windGust)
      ? clamp(reading.windGust, speed, 160)
      : speed * 1.5;
  const direction =
    reading.windDirection !== undefined && Number.isFinite(reading.windDirection)
      ? reading.windDirection
      : 250;
  const pulse = Math.pow((Math.sin(seconds * 0.65) + 1) / 2, 3);
  return -Math.sin((direction * Math.PI) / 180) * (speed + (gust - speed) * pulse) * 3;
}

/**
 * Finds the first surface crossed by the segment from (`x1`, `y1`) to (`x2`, `y2`).
 * Testing the swept segment stops fast rain tunnelling through thin text or desk edges.
 *
 * @param x1 - Start x in CSS px.
 * @param y1 - Start y in CSS px.
 * @param x2 - End x in CSS px.
 * @param y2 - End y in CSS px.
 * @param surfaces - Surfaces to test.
 * @param includeRoom - Whether to test surfaces marked `room`. Default `true`.
 * @returns The nearest hit along the segment, or `undefined` if none.
 */
export function surfaceHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  surfaces: readonly Surface[],
  includeRoom = true,
): SurfaceHit | undefined {
  let hit: SurfaceHit | undefined;
  for (const surface of surfaces) {
    if (surface.room && !includeRoom) continue;
    const points = surface.points;
    for (let i = 0; i < (points.length === 2 ? 1 : points.length); i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const dx = x2 - x1,
        dy = y2 - y1,
        ex = b.x - a.x,
        ey = b.y - a.y;
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 0.001) continue;
      const t = ((a.x - x1) * ey - (a.y - y1) * ex) / denominator;
      const u = ((a.x - x1) * dy - (a.y - y1) * dx) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (!hit || t < hit.t)) {
        hit = { x: x1 + dx * t, y: y1 + dy * t, t, angle: Math.atan2(ey, ex), surface };
      }
    }
  }
  return hit;
}

/**
 * Settles a snowflake on a surface. Flakes landing near an existing deposit
 * grow it; otherwise a new deposit is added (the oldest is dropped past 450).
 *
 * @param deposits - The deposit list to update in place.
 * @param hit - Where the flake landed.
 * @param size - Flake size in CSS px.
 */
export function settleSnow(deposits: Deposit[], hit: SurfaceHit, size: number): void {
  const nearby = deposits.find(
    (p) => p.surface === hit.surface && Math.hypot(p.x - hit.x, p.y - hit.y) < 9,
  );
  if (nearby) {
    nearby.size = Math.min(8, nearby.size + size * 0.18);
    nearby.life = 1;
  } else {
    deposits.push({ ...hit, size: size + 1, life: 1 });
    if (deposits.length > 450) deposits.shift();
  }
}
