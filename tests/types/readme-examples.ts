// Compiled against dist/ by tests/types.test.mjs; mirrors the code examples in README.md.
import * as THREE from 'three';
import { attachWeather, createWeatherEffects, createGlassDroplets } from '../../dist/index.js';

// Quick start
const weather = attachWeather({ condition: 'rain', surfaces: 'h1, h2, .card', three: THREE });
weather.setWeather('snow', { night: true });
weather.destroy();

// Full control
const canvas = document.querySelector('canvas.weather') as HTMLCanvasElement;
const effects = createWeatherEffects({ canvas, three: THREE, seed: 1 });
effects.resize(innerWidth, innerHeight);
effects.setSurfaces(() =>
  [...document.querySelectorAll('h2')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      points: [
        { x: r.left, y: r.top },
        { x: r.right, y: r.top },
      ],
    };
  }),
);
effects.setBackground(document.querySelector('img.hero') as HTMLImageElement);
effects.setWeather('rain', { night: false, reading: { windSpeed: 20, windDirection: 250 } });
addEventListener('resize', () => {
  effects.resize(innerWidth, innerHeight);
});
addEventListener(
  'scroll',
  () => {
    effects.invalidate({ clearDeposits: true });
  },
  { passive: true },
);

// Backdrop
const cloudsCanvas = document.querySelector('canvas.clouds') as HTMLCanvasElement;
const withBackdrop = createWeatherEffects({ canvas, backdropCanvas: cloudsCanvas, three: THREE });

// Glass drops
const windowCanvas = document.querySelector('canvas.window') as HTMLCanvasElement;
const windowImage = document.querySelector('img.window') as HTMLImageElement;
const glass = createGlassDroplets({ canvas: windowCanvas, dropSize: 70 });
glass?.setBackground((ctx, { width, height }) => {
  ctx.drawImage(windowImage, 0, 0, width, height);
});
glass?.resize(windowCanvas.clientWidth, windowCanvas.clientHeight);
glass?.setWeather('rain', { night: false });

void withBackdrop;
