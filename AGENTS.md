# weather-effects agent guide

A browser weather-effects library: plain ES modules today, being converted to TypeScript.

- Keep behaviour and visuals unchanged unless the issue asks otherwise. The demo (`demo.html`) is the visual reference.
- The library must stay usable without a bundler: consumers import ES modules directly, and Three.js is injected by the caller (`THREE` option), never imported.
- No runtime dependencies. Dev dependencies only.
- `npm test` must pass, and must keep covering the public API (`createWeatherEffects`, `createSimulation`, `createGlassDroplets`).
- Public API changes need matching README and type updates.
- `.github/` and `LICENSE` are human-owned.
