import { particleRandom, particleVariant } from './random.js';
import { clamp, windAt, surfaceHit, settleSnow } from './physics.js';
import type { Point, Surface, SurfaceHit, WeatherReading } from './physics.js';
import { isRain, isSnow, hasPrecipitation } from './conditions.js';
import type { WeatherCondition } from './conditions.js';
import { PROFILES } from './profiles.js';

/** One falling particle: a raindrop, snowflake, hailstone or leaf. */
export interface Particle {
  /** Horizontal position in CSS px. */
  x: number;
  /** Vertical position in CSS px. */
  y: number;
  /** Horizontal velocity in CSS px per second. */
  vx: number;
  /** Vertical velocity in CSS px per second; positive falls. */
  vy: number;
  /** Radius or width in CSS px. */
  size: number;
  /** Per-particle phase offset in radians. */
  phase: number;
  /** Distance from the viewer, 0 (far) to 1 (near). */
  depth: number;
  /** Whether a hail particle has already bounced. */
  bounced: boolean;
  /** Leaf tumble angle in radians. Wind (leaf) particles only. */
  flip?: number;
  /** Leaf spin rate in radians per second. Wind (leaf) particles only. */
  spin?: number;
  /** Leaf colour variant, 0–1. Wind (leaf) particles only. */
  hue?: number;
  /** Snow sway rate multiplier. Snow particles only. */
  sway?: number;
  /** Snow sideways drift amplitude in CSS px. Snow particles only. */
  drift?: number;
}

/** A splash ring where a raindrop landed on a surface. */
export interface Impact {
  /** Horizontal position in CSS px. */
  x: number;
  /** Vertical position in CSS px. */
  y: number;
  /** Direction of the surface edge in radians. */
  angle: number;
  /** Remaining life, from 1 (new) to 0 (gone). */
  life: number;
}

/** A small drop thrown up by a splash. */
export interface Droplet {
  /** Horizontal position in CSS px. */
  x: number;
  /** Vertical position in CSS px. */
  y: number;
  /** Horizontal velocity in CSS px per second. */
  vx: number;
  /** Vertical velocity in CSS px per second; positive falls. */
  vy: number;
  /** Radius in CSS px. */
  size: number;
  /** Remaining life, from 1 (new) to 0 (gone). */
  life: number;
}

/** Snow settled on a surface. Inherits its position and surface from {@link SurfaceHit}. */
export interface Deposit extends SurfaceHit {
  /** Radius in CSS px; grows as more snow lands nearby. */
  size: number;
  /** Remaining life, from 1 (fresh) to 0 (melted). */
  life: number;
}

/** Inputs for one {@link Simulation.step}. */
export interface StepOptions {
  /** Surfaces that rain splashes on and snow settles on. Default none. */
  surfaces?: readonly Surface[];
  /** Pointer position in CSS px that stirs snow and leaves. Default `null` (none). */
  pointer?: Point | null;
  /** Halves particle counts. Default `false`. */
  saveData?: boolean;
}

/** DOM-free particle state that advances in fixed or variable time steps. */
export interface Simulation {
  /** The active weather condition. */
  readonly condition: WeatherCondition;
  /** Simulated time since the last reset, in seconds. */
  readonly elapsed: number;
  /** Current horizontal wind in CSS px per second; negative blows left. */
  readonly wind: number;
  /** Live falling particles. */
  readonly particles: Particle[];
  /** Live splash rings. */
  readonly impacts: Impact[];
  /** Live splash droplets. */
  readonly droplets: Droplet[];
  /** Snow settled on surfaces. */
  readonly deposits: Deposit[];
  /**
   * Switches condition and clears the particles.
   *
   * @param next - The new condition.
   * @param nextReading - Live measurements. Default none.
   */
  setCondition(next: WeatherCondition, nextReading?: WeatherReading | null): void;
  /**
   * Sets the viewport size. A height-only change keeps the particles; a new width redistributes them.
   *
   * @param w - Width in CSS px.
   * @param h - Height in CSS px.
   */
  resize(w: number, h: number): void;
  /** Removes all settled snow. */
  clearDeposits(): void;
  /**
   * Restarts the simulation from time zero.
   *
   * @param nextSeed - New seed. Default keeps the current seed.
   */
  reset(nextSeed?: number): void;
  /**
   * Advances the simulation.
   *
   * @param dt - Time step in seconds. Use 0 to populate the first frame without moving.
   * @param options - Surfaces, pointer and data-saver mode.
   */
  step(dt: number, options?: StepOptions): void;
}

// Mutable state shared by the module-level helpers below.
interface SimState {
  serial: number;
  width: number;
  height: number;
  condition: WeatherCondition;
  reading: WeatherReading;
  elapsed: number;
  wind: number;
  particles: Particle[];
  impacts: Impact[];
  droplets: Droplet[];
  deposits: Deposit[];
}

// Depth (0 far .. 1 near) maps to particle scale.
const DEPTH_SCALE_BASE = 0.45;
const DEPTH_SCALE_RANGE = 1.15;
// Particles spawn and despawn this far (px) outside the viewport.
const SPAWN_MARGIN = 30;
const SIDE_MARGIN = 140;
// Pointer stirring radius (px) and strength.
const POINTER_RADIUS = 90;
const POINTER_PUSH = 220;
// Width (px) above which room surfaces are hit by all rain.
const WIDE_VIEWPORT = 760;
const NEAR_RAIN_DEPTH = 0.35;
// Distant drops land too small to see a splash.
const MIN_SPLASH_DEPTH = 0.2;
const GRAVITY_BOUNCED = 500;
const MAX_IMPACTS = 160;
const MAX_DROPLETS = 240;
const DROPLET_GRAVITY = 280;
const IMPACT_FADE_RATE = 2.5;
const DROPLET_FADE_RATE = 2;
// Deposit life lost per second, by condition.
const MELT = { snow: 0.003, rain: 0.16, other: 0.045 };

const random = (s: SimState) => particleRandom(++s.serial);
const scaleOf = (depth: number) => DEPTH_SCALE_BASE + depth * DEPTH_SCALE_RANGE;

function clear(s: SimState) {
  s.particles = [];
  s.impacts = [];
  s.droplets = [];
  s.deposits = [];
}

function spawn(s: SimState, initial = false): Particle {
  const { kind, fall } = PROFILES[s.condition].precipitation;
  const snowy = kind === 'snow',
    windy = kind === 'leaves';
  const depth = random(s),
    scale = scaleOf(depth);
  const particle: Particle = {
    x:
      windy && !initial
        ? s.wind < 0
          ? s.width + SPAWN_MARGIN
          : -SPAWN_MARGIN
        : random(s) * (s.width + 240) - 120,
    y: initial || windy ? random(s) * s.height : -SPAWN_MARGIN,
    vx: s.wind * scale,
    vy: windy ? fall.base : (fall.base + random(s) * fall.range) * scale,
    size: snowy ? 1 + random(s) * 2 : kind === 'hail' ? 2.5 : 1,
    phase: particleVariant(++s.serial) * Math.PI * 2,
    depth,
    bounced: false,
  };
  // Each flake sways at its own rhythm; each leaf tumbles at its own rate.
  if (snowy) {
    particle.sway = 0.5 + random(s) * 1.1;
    particle.drift = (8 + random(s) * 14) * scale;
  }
  if (windy) {
    particle.flip = random(s) * Math.PI * 2;
    particle.spin = (1.5 + random(s) * 3.5) * (random(s) < 0.5 ? -1 : 1);
    particle.hue = random(s);
  }
  return particle;
}

// Slow, coherent air movement shared by neighbouring flakes.
const turbulence = (x: number, y: number, t: number) =>
  Math.sin(x * 0.011 + t * 0.37) * Math.cos(y * 0.009 - t * 0.23) +
  0.5 * Math.sin((x + y) * 0.023 + t * 0.61);

function splash(s: SimState, hit: SurfaceHit, particle: Particle) {
  s.impacts.push({ x: hit.x, y: hit.y, angle: hit.angle, life: 1 });
  if (s.impacts.length > MAX_IMPACTS) s.impacts.shift();
  for (let i = 0; i < 3; i++) {
    s.droplets.push({
      x: hit.x,
      y: hit.y - 1,
      vx: (i - 1) * (30 + random(s) * 35) + particle.vx * 0.12,
      vy: -30 - random(s) * 65,
      size: 0.7 + random(s) * 0.6,
      life: 1,
    });
  }
  if (s.droplets.length > MAX_DROPLETS) s.droplets.splice(0, s.droplets.length - MAX_DROPLETS);
}

function targetCount(s: SimState, saveData: boolean) {
  const { density, cap, fine } = PROFILES[s.condition].precipitation;
  const { precipitation } = s.reading;
  const intensity =
    precipitation !== undefined && Number.isFinite(precipitation)
      ? clamp(0.7 + precipitation * 0.25, 0.6, 1.6)
      : 1;
  // Drizzle gets a small boost on phones (its streaks are also drawn wider
  // there), kept low enough that it never has more drops than rain.
  const small = fine
    ? Math.min(1.3, Math.max(1, WIDE_VIEWPORT / Math.max(1, Math.min(s.width, s.height))))
    : 1;
  return Math.min(
    cap,
    Math.round(((s.width * s.height) / density) * intensity * small * (saveData ? 0.5 : 1)),
  );
}

// A passing pointer stirs nearby flakes and leaves.
function stir(p: Particle, pointer: Point | null | undefined, dt: number) {
  if (!pointer) return;
  const dx = p.x - pointer.x,
    dy = p.y - pointer.y,
    distance = Math.hypot(dx, dy);
  if (distance > 1 && distance < POINTER_RADIUS)
    p.vx += (dx / distance) * (1 - distance / POINTER_RADIUS) * dt * POINTER_PUSH;
}

function moveSnow(s: SimState, p: Particle, dt: number) {
  const swing =
    Math.cos(p.phase) * (p.drift ?? 0) + turbulence(p.x, p.y, s.elapsed) * 16 * (0.4 + p.depth);
  p.x += (p.vx + swing) * dt;
  // Flakes flutter: fall speed rises and falls as they rock.
  p.y += p.vy * (1 + 0.3 * Math.sin(p.phase * 1.7)) * dt;
}

function tumbleLeaf(s: SimState, p: Particle, dt: number) {
  // Leaves rise and fall on eddies and spin faster in stronger gusts.
  p.y += (Math.sin(s.elapsed * 1.6 + p.phase * 3) * 34 + Math.sin(p.flip ?? 0) * 18) * dt;
  const gust = Math.min(2.5, Math.abs(p.vx) / 80);
  const spin = p.spin ?? 0;
  p.phase += dt * spin * 0.45 * (0.5 + gust);
  p.flip = (p.flip ?? 0) + dt * spin * (0.6 + gust);
}

// Advance one particle by dt: wind, pointer, motion and (for leaves) tumble.
function moveParticle(s: SimState, p: Particle, dt: number, pointer: Point | null | undefined) {
  const { kind } = PROFILES[s.condition].precipitation;
  const snowy = isSnow(s.condition),
    windy = kind === 'leaves';
  if (!p.bounced) p.vx += (s.wind * (0.45 + p.depth * 1.15) - p.vx) * Math.min(1, dt * 2);
  if (snowy || windy) {
    stir(p, pointer, dt);
    if (snowy) p.phase += dt * (p.sway ?? 0);
  }
  if (snowy) moveSnow(s, p, dt);
  else {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  if (windy) tumbleLeaf(s, p, dt);
  if (p.bounced) p.vy += dt * GRAVITY_BOUNCED;
}

// Handle a surface hit. Returns true when the particle was replaced.
function landParticle(s: SimState, i: number, hit: SurfaceHit): boolean {
  const p = s.particles[i];
  const hail = PROFILES[s.condition].precipitation.kind === 'hail';
  if (isSnow(s.condition)) settleSnow(s.deposits, hit, p.size);
  else if (p.depth > MIN_SPLASH_DEPTH || hail) splash(s, hit, p);
  if (!hail) {
    s.particles[i] = spawn(s);
    return true;
  }
  p.x = hit.x;
  p.y = hit.y - 2;
  p.vy = -90;
  p.vx *= -0.4;
  p.bounced = true;
  return false;
}

function stepParticles(
  s: SimState,
  dt: number,
  surfaces: readonly Surface[],
  pointer?: Point | null,
) {
  const windy = PROFILES[s.condition].precipitation.kind === 'leaves';
  const rainy = isRain(s.condition);
  for (let i = 0; i < s.particles.length; i++) {
    const p = s.particles[i],
      oldX = p.x,
      oldY = p.y;
    moveParticle(s, p, dt, pointer);
    // On narrow screens only near rain reaches the room, so it stays readable.
    const includeRoom = s.width > WIDE_VIEWPORT || !rainy || p.depth < NEAR_RAIN_DEPTH;
    const hit =
      !windy && !p.bounced ? surfaceHit(oldX, oldY, p.x, p.y, surfaces, includeRoom) : undefined;
    if (hit && landParticle(s, i, hit)) continue;
    const off =
      p.y > s.height + SPAWN_MARGIN ||
      (p.x < -SIDE_MARGIN && p.vx <= 0) ||
      (p.x > s.width + SIDE_MARGIN && p.vx >= 0);
    if (off) s.particles[i] = spawn(s);
  }
}

function fadeEffects(s: SimState, dt: number) {
  s.impacts = s.impacts.filter((impact) => (impact.life -= dt * IMPACT_FADE_RATE) > 0);
  s.droplets = s.droplets.filter((drop) => {
    drop.life = Math.max(0, drop.life - dt * DROPLET_FADE_RATE);
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    drop.vy += DROPLET_GRAVITY * dt;
    return drop.life > 0;
  });
  const melt = isSnow(s.condition) ? MELT.snow : isRain(s.condition) ? MELT.rain : MELT.other;
  s.deposits = s.deposits.filter((deposit) => {
    deposit.life = Math.max(0, deposit.life - dt * melt);
    return deposit.life > 0 && (deposit.surface.visible?.() ?? true);
  });
}

// dt of 0 keeps a static scene: particles are filled but do not move.
function step(s: SimState, dt: number, { surfaces = [], pointer, saveData = false }: StepOptions) {
  s.elapsed += dt;
  s.wind = windAt(s.reading, s.condition, s.elapsed);
  if (hasPrecipitation(s.condition)) {
    const count = targetCount(s, saveData);
    if (s.particles.length > count) s.particles.length = count;
    while (s.particles.length < count) s.particles.push(spawn(s, true));
    if (dt > 0) stepParticles(s, dt, surfaces, pointer);
  }
  fadeEffects(s, dt);
}

function setCondition(s: SimState, next: WeatherCondition, nextReading: WeatherReading | null) {
  if (next !== s.condition) {
    s.particles = [];
    s.impacts = [];
    s.droplets = [];
  }
  s.condition = next;
  s.reading = nextReading ?? {};
  s.wind = windAt(s.reading, s.condition, s.elapsed);
}

function resize(s: SimState, w: number, h: number) {
  const sameWidth = w === s.width;
  s.width = w;
  s.height = h;
  if (!sameWidth) clear(s);
}

function reset(s: SimState, seed: number) {
  s.serial = seed;
  s.elapsed = 0;
  clear(s);
  s.wind = windAt(s.reading, s.condition, 0);
}

/**
 * Creates a DOM-free particle simulation. Positions are CSS pixels in the
 * caller's viewport. Given the same seed, surfaces and time steps, the output
 * is deterministic.
 *
 * @param options - Simulation options.
 * @param options.seed - Seed for particle randomness. Default 0.
 * @returns A new {@link Simulation}, initially `'clear'`.
 *
 * @example
 * const sim = createSimulation({ seed: 1 });
 * sim.resize(800, 600);
 * sim.setCondition('rain');
 * sim.step(1 / 30);
 * console.log(sim.particles.length);
 */
export function createSimulation({ seed = 0 }: { seed?: number } = {}): Simulation {
  const s: SimState = {
    serial: seed,
    width: 1,
    height: 1,
    condition: 'clear',
    reading: {},
    elapsed: 0,
    wind: 0,
    particles: [],
    impacts: [],
    droplets: [],
    deposits: [],
  };
  return {
    get condition() {
      return s.condition;
    },
    get elapsed() {
      return s.elapsed;
    },
    get wind() {
      return s.wind;
    },
    get particles() {
      return s.particles;
    },
    get impacts() {
      return s.impacts;
    },
    get droplets() {
      return s.droplets;
    },
    get deposits() {
      return s.deposits;
    },
    setCondition(next: WeatherCondition, nextReading: WeatherReading | null = {}) {
      setCondition(s, next, nextReading);
    },
    // A height-only change (a mobile address bar showing or hiding) keeps the
    // particles; a new width redistributes them.
    resize(w: number, h: number) {
      resize(s, w, h);
    },
    clearDeposits() {
      s.deposits = [];
    },
    reset(nextSeed: number = seed) {
      seed = nextSeed;
      reset(s, nextSeed);
    },
    step(dt: number, options: StepOptions = {}) {
      step(s, dt, options);
    },
  };
}
