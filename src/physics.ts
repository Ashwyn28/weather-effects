import type { WeatherCondition } from './conditions.js';
import type { Deposit } from './simulation.js';

export interface Point { x: number; y: number }

export interface Surface {
  points: Point[];
  room?: boolean;
  visible?(): boolean;
}

export interface SurfaceHit {
  x: number;
  y: number;
  t: number;
  angle: number;
  surface: Surface;
}

export interface WeatherReading {
  windSpeed?: number;
  windGust?: number;
  windDirection?: number;
  precipitation?: number;
  cloudCover?: number;
}

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

// A screen facing north: meteorological direction is where wind comes FROM.
// Keep north/south winds mostly in depth, with a little sideways turbulence.
export function windAt(reading: WeatherReading, condition: WeatherCondition, seconds: number): number {
  const speed = reading.windSpeed !== undefined && Number.isFinite(reading.windSpeed) ? clamp(reading.windSpeed, 0, 120) : condition === 'wind' ? 38 : 12;
  const gust = reading.windGust !== undefined && Number.isFinite(reading.windGust) ? clamp(reading.windGust, speed, 160) : speed * 1.5;
  const direction = reading.windDirection !== undefined && Number.isFinite(reading.windDirection) ? reading.windDirection : 250;
  const pulse = Math.pow((Math.sin(seconds * .65) + 1) / 2, 3);
  return -Math.sin(direction * Math.PI / 180) * (speed + (gust - speed) * pulse) * 3;
}

// Swept segments prevent fast rain tunnelling through thin text/desk edges.
export function surfaceHit(x1: number, y1: number, x2: number, y2: number, surfaces: readonly Surface[], includeRoom = true): SurfaceHit | undefined {
  let hit: SurfaceHit | undefined;
  for (const surface of surfaces) {
    if (surface.room && !includeRoom) continue;
    const points = surface.points;
    for (let i = 0; i < (points.length === 2 ? 1 : points.length); i++) {
      const a = points[i] as Point, b = points[(i + 1) % points.length] as Point;
      const dx = x2 - x1, dy = y2 - y1, ex = b.x - a.x, ey = b.y - a.y;
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < .001) continue;
      const t = ((a.x - x1) * ey - (a.y - y1) * ex) / denominator;
      const u = ((a.x - x1) * dy - (a.y - y1) * dx) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (!hit || t < hit.t)) {
        hit = { x: x1 + dx * t, y: y1 + dy * t, t, angle: Math.atan2(ey, ex), surface };
      }
    }
  }
  return hit;
}

export function settleSnow(deposits: Deposit[], hit: SurfaceHit, size: number): void {
  const nearby = deposits.find(p => p.surface === hit.surface && Math.hypot(p.x - hit.x, p.y - hit.y) < 9);
  if (nearby) {
    nearby.size = Math.min(8, nearby.size + size * .18);
    nearby.life = 1;
  } else {
    deposits.push({ ...hit, size: size + 1, life: 1 });
    if (deposits.length > 450) deposits.shift();
  }
}
