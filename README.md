# weather-effects

A transparent weather layer for a web page. Rain, drizzle, showers, storms, snow, hail and wind-blown leaves fall over the page, splash on or settle on surfaces you supply, and refract a background you supply. Sun, moon, stars, fog banks and a cloud ceiling are drawn behind the particles.

**[Live demo](https://ashwyn28.github.io/weather-effects/demo.html)** · Written in TypeScript and compiled to plain ES modules in `dist/`. Three.js is optional and injected, so pages with a strict `script-src 'self'` policy need no import map.

```js
import * as THREE from 'three';
import { createWeatherEffects } from './weather-effects/dist/index.js';

const canvas = document.querySelector('canvas.weather'); // position: fixed; inset: 0; pointer-events: none
const effects = createWeatherEffects({ canvas, THREE, seed: 1 });
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
effects.setBackground(document.querySelector('img.hero')); // droplets refract this
effects.setWeather('rain', { night: false, reading: { windSpeed: 20, windDirection: 250 } });
addEventListener('resize', () => effects.resize(innerWidth, innerHeight));
addEventListener('scroll', () => effects.invalidate({ clearDeposits: true }), { passive: true });
```

Types are generated from the TypeScript source into `dist/index.d.ts`, which documents the full API. See [`demo.html`](demo.html) for a standalone page.

## Clouds and sky

Pass a second canvas that sits behind your content, and clouds, fog, stars and sun glow are drawn there, so text stays crisp above them:

```html
<canvas class="clouds"></canvas>
<!-- position: fixed; inset: 0; z-index: 0 -->
<main style="position: relative; z-index: 1">…</main>
<!-- transparent background -->
<canvas class="weather"></canvas>
<!-- position: fixed; inset: 0; z-index: 2; pointer-events: none -->
```

```js
const effects = createWeatherEffects({ canvas: weatherCanvas, skyCanvas: cloudsCanvas, THREE });
```

- `skyStyle: 'clouds'` (default) keeps your page background. Clouds are lit from above with soft tops and grey undersides, gather near the top of the viewport and thin out before the body text.
- `skyStyle: 'full'` paints an opaque sky gradient as well, like a weather app, and draws rain as long light streaks. The demo uses this.

Conditions ease into each other over about a second and a half.

## Glass drops

`createGlassDroplets({ canvas, dropSize })` puts water drops and frost on a small pane of glass, such as a window in an illustration, without Three.js or the page weather layer. Give it what is seen through the glass with `setBackground(painter)`; transparent areas stay clear. Call `setWeather(condition, { night })` to follow the page: drops form and slide in rain, frost gathers at the edges in freezing weather, and both fade out when it is dry.

```js
const glass = createGlassDroplets({ canvas: windowCanvas, dropSize: 70 });
glass.setBackground((ctx, { width, height }) => ctx.drawImage(windowImage, 0, 0, width, height));
glass.resize(windowCanvas.clientWidth, windowCanvas.clientHeight);
glass.setWeather('rain', { night: false });
```

- **Conditions:** `clear`, `mainly-clear`, `partly-cloudy`, `overcast`, `fog`, `drizzle`, `freezing-drizzle`, `rain`, `freezing-rain`, `showers`, `snow`, `snow-showers`, `thunderstorm`, `hail`, `wind`. Mapping API data (for example WMO codes) to these ids is the caller's job.
- **Surfaces:** two points make a ledge, more make a polygon. Swept collision stops fast rain tunnelling through thin edges. Rain splashes, hail bounces, snow settles and melts after the weather changes.
- **Background:** an image, canvas, video or a paint function. It is redrawn only after `invalidate()` or a weather/night change, at most 2048px on the long side. Transparent areas get no droplets. Arbitrary HTML is not captured.
- **Timing:** about 30 fps. Hidden tabs stop. `pause()` and `prefers-reduced-motion` keep a static frame. `seek(t)` replays deterministically from the seed.
- **Fallbacks:** without `THREE` or WebGL, a 2D canvas draws precipitation, splashes, snow and simple fog/cloud gradients, with no refraction or frost. WebGL context loss hides the canvas; restoration redraws.
- **Ownership:** `dispose()` stops the loop, removes listeners and frees GPU resources. The canvas element stays with the caller.

## Limits

- Droplets refract only the background you supply. Other page content shows through unchanged and stays interactive.
- Frost is procedural; it gathers at the edges of painted shapes.
- The refraction texture is capped at 2048px and refreshed on change, not every frame.
- Particle counts are capped (450 rain, 240 snow or hail, 22 leaves) and halve with `saveData`.

## Install

The source in `src/` is TypeScript. Run `npm install && npm run build`, then copy `dist/` into your site (or add the repository as a Git submodule) and import `dist/index.js`. There are no runtime dependencies; Three.js (r160 or later) is optional.

To try the demo locally, build first (`npm run build`), then serve the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000/demo.html
```

## Credits

The integer hash in `random.js` and `droplet-shader.js` is lowbias32 by Chris Wellons (public domain).

## Tests

```sh
npm test
```

## License

[MIT](LICENSE)
