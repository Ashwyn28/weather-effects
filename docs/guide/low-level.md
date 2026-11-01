# Low-level API

## `createWeatherEffects`

`attachWeather` is built on `createWeatherEffects`, which gives full control with your own canvases. You handle sizing, surfaces and listeners yourself.

```js
import { createWeatherEffects } from 'weather-effects';

const effects = createWeatherEffects({ canvas, backdropCanvas, three: THREE, seed: 1 });
effects.resize(innerWidth, innerHeight);
effects.setSurfaces(() => collectSurfaces());
effects.setBackground(document.querySelector('img.hero'));
effects.setWeather('rain', { reading: { windSpeed: 20, windDirection: 250 } });
addEventListener('resize', () => effects.resize(innerWidth, innerHeight));
effects.dispose();
```

Because of `seed` and `seek(t)`, the same weather can be replayed deterministically. See [`WeatherEffects`](/api/index/interfaces/WeatherEffects) for every method.

## `weather-effects/advanced`

The building blocks behind it: the particle simulation (`createSimulation`), collision and wind helpers (`windAt`, `surfaceHit`, `settleSnow`), deterministic randomness (`hash32`, `particleRandom`, `particleVariant`) and condition predicates (`isRain`, `isSnow`, `isFrozen`, `hasPrecipitation`).

```js
import { createSimulation, isSnow } from 'weather-effects/advanced';
```

See the [advanced API reference](/api/advanced/).
