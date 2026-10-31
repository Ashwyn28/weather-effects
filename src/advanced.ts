// Low-level building blocks behind `createWeatherEffects`: the particle
// simulation, collision/wind helpers, deterministic randomness and condition
// predicates. Imported as `weather-effects/advanced`.
export { createSimulation } from './simulation.js';
export { windAt, surfaceHit, settleSnow } from './physics.js';
export { hash32, particleRandom, particleVariant } from './random.js';
export { isRain, isSnow, isFrozen, hasPrecipitation } from './conditions.js';
export type { Particle, Impact, Droplet, Deposit, StepOptions, Simulation } from './simulation.js';
export type { Point, Surface, SurfaceHit, WeatherReading } from './physics.js';
export type { WeatherCondition } from './conditions.js';
