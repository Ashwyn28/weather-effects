---
layout: home
hero:
  name: weather-effects
  text: Weather for your web page
  tagline: Rain, snow, hail, fog and clouds that fall over your content, splash on your headings and refract your background.
  image:
    src: /assets/hero.png
    alt: Rain over the weather-effects demo page
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Live demo
      link: https://ashwyn28.github.io/weather-effects/demo.html
    - theme: alt
      text: API reference
      link: /api/
features:
  - title: 15 conditions
    details: From clear skies to thunderstorms, hail and wind, easing into each other.
    link: /guide/conditions
  - title: Surfaces and collisions
    details: Rain splashes and snow settles on the elements you choose.
    link: /guide/surfaces
  - title: Drops on glass
    details: Running drops and frost on a pane, refracting a background you supply.
    link: /guide/glass
  - title: No bundler, no dependencies
    details: Plain ES modules. Three.js is optional and injected by you.
    link: /guide/performance
---

## Quick start

```js
import * as THREE from 'three';
import { attachWeather } from 'weather-effects';

const weather = attachWeather({ condition: 'rain', surfaces: 'h1, h2, .card', three: THREE });
weather.setWeather('snow', { night: true });
weather.destroy(); // removes the canvases, listeners and observers
```

See [Getting started](/getting-started) for installation and CDN usage, or try the
[live demo](https://ashwyn28.github.io/weather-effects/demo.html).
