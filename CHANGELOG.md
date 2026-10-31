# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) from 1.0.

## [Unreleased]

### Added

- `attachWeather`: one-call setup that creates the canvases, resolves surfaces and wires resize, scroll, mutation and pointer handling.
- A single `PROFILES` table holding the per-condition settings.
- TSDoc for every public export, enforced by typedoc (`npm run docs:check`).
- README rewrite, hero image (`scripts/hero.mjs`), `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and `SECURITY.md`.

### Changed

- The library is now written in TypeScript and compiled to plain ES modules in `dist/`, with generated type declarations.
- Public API surface and naming tidied for 1.0. Lower-level helpers (`createSimulation`, `windAt`, `surfaceHit`, `settleSnow`, `hash32`, `particleRandom`, `particleVariant`, `isRain`, `isSnow`, `isFrozen`, `hasPrecipitation`) moved to the `weather-effects/advanced` subpath.
- Renderers and shaders cleaned up with no intended visual change.

## [0.1.0]

### Added

- Initial release: rain, drizzle, showers, storms, snow, hail and wind overlay, clouds and sky backdrop, and glass droplets.
