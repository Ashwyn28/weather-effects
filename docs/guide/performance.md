# Performance

- **Particle caps.** Counts are capped per condition (for example 450 rain drops, 240 snow or hail particles and 22 leaves), so heavy weather never runs away.
- **`saveData`.** Halves particle counts. It defaults to `navigator.connection.saveData`; pass `saveData: true` to force it on a slow device.
- **Pixel ratio.** Canvases render at `min(devicePixelRatio, 2)` device pixels per CSS pixel. Pass `pixelRatio: 1` to `createWeatherEffects` or `createGlassDroplets` to trade sharpness for speed.
- **Frame rate.** Rendering runs at about 30 fps, and hidden tabs stop.
- **Refraction texture.** The background used for refraction is capped at 2048px on the long side and refreshed on change, not every frame.
- **Cleanup.** `dispose()` and `destroy()` stop the loop, remove listeners and free GPU resources. Call them when the weather is no longer shown.

```js
const effects = createWeatherEffects({ canvas, three: THREE, pixelRatio: 1, saveData: true });
```

Without Three.js or WebGL, the 2D canvas fallback is lighter still.
