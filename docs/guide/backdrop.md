# Clouds, sky and backdrop

The _overlay_ canvas sits above your content and draws precipitation. The optional _backdrop_ canvas sits behind your content and draws clouds, fog, stars, sun and moon, so text stays crisp.

`attachWeather` creates both. With `createWeatherEffects`, supply your own:

```html
<canvas class="clouds"></canvas>
<!-- position: fixed; inset: 0; z-index: 0 -->
<main style="position: relative; z-index: 1">…</main>
<!-- transparent background -->
<canvas class="weather"></canvas>
<!-- position: fixed; inset: 0; z-index: 2; pointer-events: none -->
```

```js
const effects = createWeatherEffects({
  canvas: weatherCanvas,
  backdropCanvas: cloudsCanvas,
  backdropStyle: 'clouds',
  three: THREE,
});
```

## Styles

| `backdropStyle` | Look                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `'clouds'`      | Default. Transparent, so your page background shows. Clouds, fog and stars only. |
| `'sky'`         | An opaque sky gradient too. Rain is drawn as long light streaks.                 |

The backdrop uses WebGL2 and falls back to a 2D canvas. `effects.backdropBackend` reports which one is in use, or `null` without a backdrop canvas. In `attachWeather`, pass `backdrop: false` to skip it and `zIndex` to move the overlay.

Cloud cover can follow live data through the `cloudCover` reading; see [Day/night and live data](/guide/live-data).
