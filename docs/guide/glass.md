# Drops on glass

`createGlassDroplets` draws running water drops and frost on a pane of glass, on a canvas you own. It works on its own, without Three.js or the page-wide layer, so it suits a window in an illustration. It needs WebGL2.

```js
import { createGlassDroplets } from 'weather-effects';

const glass = createGlassDroplets({ canvas: windowCanvas, dropSize: 70, side: 'inside' });
glass.setBackground((ctx, { width, height }) => ctx.drawImage(windowImage, 0, 0, width, height));
glass.resize(windowCanvas.clientWidth, windowCanvas.clientHeight);
glass.setWeather('rain', { night: false });
```

## Inside and outside

- `'inside'` (default): drops sit on the near surface, as if you were looking at a pane in front of you.
- `'outside'`: rain falling on a window, seen through the glass.

## Options

- `dropSize`: CSS pixels per drop-grid unit. Small panes want small values. Default 90.
- `seed`: seed for the drop pattern. Default 7.
- `pixelRatio` and `reducedMotion`: see [Performance](/guide/performance) and [Accessibility](/guide/accessibility).

The background is what the drops refract. Call `invalidate()` after the source changes. See [`GlassDropletsOptions`](/api/index/interfaces/GlassDropletsOptions) and [`GlassDroplets`](/api/index/interfaces/GlassDroplets).
