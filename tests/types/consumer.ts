// Compiled against dist/index.d.ts by tests/types.test.mjs; mirrors the README example.
import * as THREE from 'three';
import {
  createWeatherEffects,
  createSimulation,
  createGlassDroplets,
  CONDITIONS,
  isCondition,
  isRain,
  isSnow,
  isFrozen,
  hasPrecipitation,
  windAt,
  surfaceHit,
  settleSnow,
  hash32,
  particleRandom,
  particleVariant,
} from '../../dist/index.js';
import type {
  WeatherEffects,
  WeatherEffectsOptions,
  WeatherCondition,
  WeatherReading,
  Surface,
  Point,
  BackgroundSource,
  BackgroundPainter,
  Simulation,
  GlassDroplets,
} from '../../dist/index.js';

const canvas = document.querySelector('canvas.weather') as HTMLCanvasElement;
const options: WeatherEffectsOptions = { canvas, THREE, seed: 1 };
const effects: WeatherEffects = createWeatherEffects(options);
effects.resize(innerWidth, innerHeight);
effects.setSurfaces(() =>
  [...document.querySelectorAll('h2')].map((el): Surface => {
    const r = el.getBoundingClientRect();
    return {
      points: [
        { x: r.left, y: r.top },
        { x: r.right, y: r.top },
      ],
    };
  }),
);
const painter: BackgroundPainter = (ctx, info) => {
  ctx.fillRect(0, 0, info.width, info.height);
};
const source: BackgroundSource = painter;
effects.setBackground(source);
const reading: WeatherReading = { windSpeed: 20, windDirection: 250 };
effects.setWeather('rain', { night: false, reading });
effects.invalidate({ clearDeposits: true });

const sim: Simulation = createSimulation({ seed: 1 });
const condition: WeatherCondition = CONDITIONS[0]!;
const point: Point = { x: 0, y: 0 };
const surface: Surface = { points: [point, { x: 10, y: 0 }] };
sim.step(1 / 30, { surfaces: [surface], pointer: point });
const hit = surfaceHit(0, -5, 0, 5, [surface]);
if (hit) settleSnow(sim.deposits, hit, 2);
const flags: boolean[] = [
  isCondition('rain'),
  isRain(condition),
  isSnow(condition),
  isFrozen(condition),
  hasPrecipitation(condition),
];
const numbers: number[] = [
  windAt(reading, condition, 0),
  hash32(1),
  particleRandom(1),
  particleVariant(1),
];
const glass: GlassDroplets | null = createGlassDroplets({ canvas, side: 'outside' });
void [flags, numbers, glass];
