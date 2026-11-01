# Getting started

## Install

```sh
npm install weather-effects three
```

Three.js r160 or later is optional. Without it (or without WebGL) a 2D canvas fallback draws
precipitation, splashes, snow and simple fog and cloud gradients.

## `attachWeather`

`attachWeather` is the one-call setup. It creates an overlay canvas (fixed over the viewport,
`pointer-events: none`) and, by default, a backdrop canvas behind your content. It wires resize,
scroll, mutation and pointer handling for you.

```js
import * as THREE from 'three';
import { attachWeather } from 'weather-effects';

const weather = attachWeather({
  condition: 'rain',
  night: false,
  surfaces: 'h1, h2, .card', // CSS selector, elements, or a function
  three: THREE,
});

weather.setWeather('snow', { night: true });
weather.pause();
weather.play();
weather.destroy();
```

See [`AttachWeatherOptions`](/api/index/interfaces/AttachWeatherOptions) for every option.

## CDN usage

Use ES modules straight from a CDN, with no bundler:

```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js" } }
</script>
<script type="module">
  import * as THREE from 'three';
  import { attachWeather } from 'https://cdn.jsdelivr.net/npm/weather-effects/dist/index.js';
  attachWeather({ condition: 'rain', three: THREE });
</script>
```

Pages with a strict `script-src 'self'` policy can omit Three.js and use the 2D fallback.

## Next steps

- Browse all [conditions](/guide/conditions).
- Use it in [React, Svelte, Vue or plain HTML](/recipes).
- Read [how it works](/how-it-works).
