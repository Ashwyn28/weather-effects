# Accessibility

## Reduced motion

`prefers-reduced-motion: reduce` keeps a static frame instead of animating. The option `reducedMotion` takes a `MediaQueryList` (or any object with `matches` and change listeners); it defaults to `matchMedia('(prefers-reduced-motion: reduce)')`. Pass `null` to ignore the preference. `pause()` also keeps a still frame.

```js
createGlassDroplets({ canvas, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)') });
```

## Hidden from assistive technology

The canvases `attachWeather` creates are decorative and carry `aria-hidden="true"`. If you create your own canvases, set the same attribute:

```html
<canvas class="weather" aria-hidden="true"></canvas>
```

## Pointer events

The overlay uses `pointer-events: none`, so links, buttons and forms underneath stay clickable. Your own canvas needs the same style. Snow and leaves move away from the mouse; pass `pointer: false` to `attachWeather` to turn that off.

Weather is decoration: do not convey information through it alone. Show the temperature or conditions as text as well.
