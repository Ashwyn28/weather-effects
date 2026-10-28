# weather-effects

A transparent weather layer for a web page. Rain, drizzle, showers, storms, snow, hail and wind-blown leaves fall over the page, splash on or settle on surfaces you supply, and refract a background you supply. Sun, moon, stars, fog banks and a cloud ceiling are drawn behind the particles.

**[Live demo](https://ashwyn28.github.io/weather-effects/demo.html)** · No build step: plain ES modules. Three.js is optional and injected, so pages with a strict `script-src 'self'` policy need no import map.

```js
import * as THREE from 'three';
import { createWeatherEffects } from './weather-effects/src/index.js';

const canvas = document.querySelector('canvas.weather'); // position: fixed; inset: 0; pointer-events: none
const effects = createWeatherEffects({ canvas, THREE, seed: 1 });
effects.resize(innerWidth, innerHeight);
effects.setSurfaces(() => [...document.querySelectorAll('h2')].map(el => {
  const r = el.getBoundingClientRect();
  return { points: [{ x: r.left, y: r.top }, { x: r.right, y: r.top }] };
}));
effects.setBackground(document.querySelector('img.hero')); // droplets refract this
effects.setWeather('rain', { night: false, reading: { windSpeed: 20, windDirection: 250 } });
addEventListener('resize', () => effects.resize(innerWidth, innerHeight));
addEventListener('scroll', () => effects.invalidate({ clearDeposits: true }), { passive: true });
```

See [`index.d.ts`](index.d.ts) for the full API and [`demo.html`](demo.html) for a standalone page.

## Sky mode

For a full weather backdrop, like a weather app, pass a second canvas that sits behind your content:

```html
<canvas class="sky"></canvas>      <!-- position: fixed; inset: 0; z-index: 0 -->
<main style="position: relative; z-index: 1">…</main>
<canvas class="weather"></canvas>  <!-- position: fixed; inset: 0; z-index: 2; pointer-events: none -->
```

```js
const effects = createWeatherEffects({ canvas: weatherCanvas, skyCanvas, THREE });
```

The sky draws a day or night gradient for the condition, twinkling stars on clear nights, long drifting wisps, heavy clouds lit from above, low fog banks, a sun glow and lightning. Changes between conditions ease over about a second and a half. Rain becomes long, thin, light streaks. Frosted-glass cards (`backdrop-filter: blur()`) over the sky give the look in the demo.

## Behaviour

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

Copy `src/` into your site, or add the repository as a Git submodule, and import `src/index.js`. There are no runtime dependencies; Three.js (r160 or later) is optional.

To try the demo locally:

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
