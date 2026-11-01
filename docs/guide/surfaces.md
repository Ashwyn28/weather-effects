# Surfaces and collisions

A _surface_ is something particles hit: rain splashes on it, hail bounces off it and snow settles on it. A surface with two points is a ledge (for example the top edge of a heading). Three or more points make a closed polygon. Collisions are swept, so fast rain cannot tunnel through thin edges.

## With `attachWeather`

Pass a CSS selector, a list of elements or a function. Elements and selector matches use the top edge of each client rect. The surfaces are re-read on resize, scroll and DOM mutation.

```js
attachWeather({ condition: 'rain', surfaces: 'h1, h2, .card', three: THREE });
attachWeather({ surfaces: [document.querySelector('header')] });
attachWeather({ surfaces: () => customSurfaces() });
```

## With `createWeatherEffects`

Supply [`Surface`](/api/index/interfaces/Surface) objects in CSS pixels, or a function that returns a fresh list. Call `invalidate()` after layout changes.

```js
effects.setSurfaces(() =>
  [...document.querySelectorAll('h2')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      points: [
        { x: r.left, y: r.top },
        { x: r.right, y: r.top },
      ],
      visible: () => el.isConnected,
    };
  }),
);
addEventListener('scroll', () => effects.invalidate({ clearDeposits: true }), { passive: true });
```

- `visible()` returns `false` while the surface is hidden, so snow settled on it melts away.
- `room: true` marks a surface that only some rain reaches, like a room interior.
- `invalidate({ clearDeposits: true })` also removes settled snow. `setSurfaces` clears deposits by default.
