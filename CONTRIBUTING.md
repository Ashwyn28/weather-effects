# Contributing

Thanks for helping. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Setup

Node 18 or later.

```sh
npm install      # also runs the build
npm run demo     # serves the repo at http://127.0.0.1:8000/demo.html
```

## Scripts

| Script               | What it does                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `npm run build`      | Compiles `src/` to `dist/` (ES modules and `.d.ts`).               |
| `npm test`           | Builds, then runs the Node test suite in `tests/`.                 |
| `npm run typecheck`  | Type-checks without emitting.                                      |
| `npm run lint`       | ESLint, Prettier check and `docs:check`.                           |
| `npm run format`     | Applies Prettier and ESLint fixes.                                 |
| `npm run docs:check` | Fails if a public export lacks TSDoc or typedoc reports a warning. |

`node scripts/hero.mjs` regenerates `docs/assets/hero.png` (needs a Chromium; set `CHROME_PATH` if Playwright has none).

## Project layout

- `src/index.ts`: main entry (`createWeatherEffects`, `createGlassDroplets`, `attachWeather`, types).
- `src/advanced.ts`: lower-level helpers, exported as `weather-effects/advanced`.
- `src/profiles.ts`: the `PROFILES` table of per-condition settings.
- `src/conditions.ts`, `physics.ts`, `simulation.ts`: condition ids, collisions and particle simulation.
- `src/three-renderer.ts`, `canvas-renderer.ts`, `sky.ts`, `glass.ts`, `shaders/`: rendering.
- `tests/`: `node:test` suites; `tests/types/` holds files type-checked against `dist/`.
- `demo.html`, `examples/`: the visual reference and a minimal example.

## Conventions

- TypeScript, strict. Prettier formats everything; ESLint uses the strict type-checked config.
- Keep behaviour and visuals unchanged unless the change is meant to alter them; `demo.html` is the visual reference.
- No runtime dependencies, and no bundler required: consumers import the ES modules directly. Three.js is injected through the `three` option and never imported.
- Every public export needs TSDoc. Public API changes need README and type updates.
- Every behavioural change needs a test. README code examples are type-checked in `tests/types/readme-examples.ts`; update both together.

## Adding a weather condition

1. Add the id to the `WeatherCondition` type and the `CONDITIONS` list in `src/conditions.ts`.
2. Add its entry to the `PROFILES` table in `src/profiles.ts` (precipitation, sky and glass settings). The type forces every condition to have one.
3. The helpers in `conditions.ts` (`isRain`, `isSnow`, `isFrozen`, `hasPrecipitation`) read from the profile; check they classify it correctly.
4. Add it to the condition list in `demo.html` and the README, and add tests.

## Pull request checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.
- [ ] New or changed behaviour has tests.
- [ ] Public API changes have TSDoc, README and type updates.
- [ ] `CHANGELOG.md` has an entry under `Unreleased`.
- [ ] Visuals checked against `demo.html` when rendering changed.
