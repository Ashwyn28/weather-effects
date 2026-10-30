import { createSimulation } from './simulation.js';
import { createThreeRenderer } from './three-renderer.js';
import { createCanvasRenderer } from './canvas-renderer.js';
import { createSkyRenderer } from './sky.js';
import { isCondition } from './conditions.js';
import { PROFILES } from './profiles.js';
import type { WeatherCondition } from './conditions.js';
import type { Surface, Point, WeatherReading } from './physics.js';
import type { Simulation } from './simulation.js';
import type { WeatherRenderer } from './canvas-renderer.js';
import type { SkyRenderer, SkyStyle } from './sky.js';
import type { BackgroundSource, BackgroundOptions } from './refraction.js';
import type { ReducedMotion } from './glass.js';
import type * as ThreeNS from 'three';

export {
  CONDITIONS,
  isCondition,
  isRain,
  isSnow,
  isFrozen,
  hasPrecipitation,
} from './conditions.js';
export { createSimulation } from './simulation.js';
export { createGlassDroplets } from './glass.js';
export { windAt, surfaceHit, settleSnow } from './physics.js';
export { hash32, particleRandom, particleVariant } from './random.js';
export type { WeatherCondition } from './conditions.js';
export type { Point, Surface, SurfaceHit, WeatherReading } from './physics.js';
export type { Particle, Impact, Droplet, Deposit, StepOptions, Simulation } from './simulation.js';
export type {
  BackgroundInfo,
  BackgroundPainter,
  BackgroundSource,
  BackgroundOptions,
} from './refraction.js';
export type { GlassDroplets, GlassDropletsOptions, ReducedMotion } from './glass.js';
export type { SkyStyle } from './sky.js';

export type SurfaceSource = Surface[] | (() => Surface[]) | null;

export interface WeatherEffectsOptions {
  /** Transparent overlay above the content (pointer-events: none). */
  canvas: HTMLCanvasElement;
  /**
   * Optional canvas behind the content for clouds, fog, stars, sun glow and
   * lightning. The overlay then no longer draws its own cloud tint.
   */
  skyCanvas?: HTMLCanvasElement;
  /** 'clouds' (default): transparent, clouds/fog/stars only. 'full': opaque sky gradient too. */
  skyStyle?: SkyStyle;
  /** The `three` module namespace. Omit to use the 2D fallback. */
  THREE?: typeof ThreeNS;
  /** Seed for particle randomness. Default 0. */
  seed?: number;
  /** Default true. */
  autoplay?: boolean;
  /** Default min(devicePixelRatio, 2). */
  pixelRatio?: number;
  /** Default matchMedia('(prefers-reduced-motion: reduce)'). Pass null to ignore. */
  reducedMotion?: ReducedMotion | null;
  /** Halves particle counts. Default navigator.connection.saveData. */
  saveData?: boolean;
}

export interface WeatherEffects {
  /** The canvas in use. Differs from the one passed when WebGL failed and a fallback canvas replaced it. */
  readonly canvas: HTMLCanvasElement;
  readonly backend: 'threejs' | 'canvas';
  /** null without skyCanvas. */
  readonly skyBackend: 'webgl2' | 'canvas' | null;
  readonly playing: boolean;
  readonly condition: WeatherCondition;
  /** Simulated seconds. */
  readonly time: number;
  readonly simulation: Simulation;
  setWeather(
    condition: WeatherCondition,
    options?: { night?: boolean; reading?: WeatherReading },
  ): void;
  /** Functions are called lazily, at most once per frame after invalidate(). Clears settled snow by default. */
  setSurfaces(source: SurfaceSource, options?: { clearDeposits?: boolean }): void;
  /**
   * Used for droplet refraction and frost (WebGL only). Functions are repainted after invalidate() or a weather change.
   * dropSize: CSS px per drop-grid unit (default 750); smaller gives smaller, denser drops for small targets.
   */
  setBackground(source: BackgroundSource, options?: BackgroundOptions): void;
  /** Pass null to clear. Snow and leaves move away from the pointer. */
  setPointer(x: number | null, y?: number): void;
  /** Re-read surfaces and repaint the background before the next frame. */
  invalidate(options?: { clearDeposits?: boolean }): void;
  play(): void;
  pause(): void;
  /** Replays from the seed at a fixed 30 fps step and draws that frame. */
  seek(seconds: number): void;
  /** CSS pixels. */
  resize(width: number, height: number): void;
  dispose(): void;
}

interface NetworkInformation {
  saveData?: boolean;
}

// Simulation and render step: 30 fps.
const FRAME_MS = 1000 / 30;
const STEP_S = 1 / 30;
// Longest time step (s) taken in one frame.
const MAX_STEP_S = 0.04;
// The backdrop repaints at most every 0.05 s (~20 fps): clouds drift slowly.
const SKY_MIN_INTERVAL_S = 0.05;
// Lightning flashes once per 18 s (sin period), as a brief sharp spike.
const STORM_PERIOD_S = 18;
const FLASH_SHARPNESS = 100;
const FLASH_STRENGTH = 0.8;

/** Everything one weather layer owns; helpers below act on it. */
interface Fx {
  canvas: HTMLCanvasElement;
  skyCanvas?: HTMLCanvasElement;
  renderer: WeatherRenderer;
  sky: SkyRenderer | null;
  simulation: Simulation;
  seed: number;
  saveData: boolean;
  reducedMotion: ReducedMotion | null;
  doc: Document | undefined;
  onChange: () => void;
  night: boolean;
  reading: WeatherReading;
  surfaces: Surface[];
  surfaceSource: SurfaceSource;
  surfacesDirty: boolean;
  pointer: Point | null;
  playing: boolean;
  disposed: boolean;
  frame: number;
  last: number;
  width: number;
  height: number;
  skyTime: number;
  skyCondition: WeatherCondition | undefined;
  skyNight: boolean | undefined;
}

const isStatic = (fx: Fx) => !fx.playing || fx.reducedMotion?.matches === true;

// A canvas that refused a WebGL context cannot hand out a 2D one: swap in a
// fresh element that keeps the class and accessibility attributes.
function replaceCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const replacement = canvas.ownerDocument.createElement('canvas');
  replacement.className = canvas.className;
  for (const name of ['aria-hidden', 'role']) {
    const value = canvas.getAttribute(name);
    if (value !== null) replacement.setAttribute(name, value);
  }
  canvas.replaceWith(replacement);
  return replacement;
}

function readSurfaces(fx: Fx) {
  if (fx.surfacesDirty) {
    const source = fx.surfaceSource;
    fx.surfaces = (typeof source === 'function' ? source() : source) ?? [];
    fx.surfacesDirty = false;
  }
  return fx.surfaces;
}

function paintSky(fx: Fx, sky: SkyRenderer, skyDt: number) {
  const { condition, elapsed: time } = fx.simulation;
  fx.skyTime = time;
  fx.skyCondition = condition;
  fx.skyNight = fx.night;
  const pulse = Math.max(0, Math.sin((time * Math.PI) / (STORM_PERIOD_S / 2)));
  const flash =
    PROFILES[condition].lightning && !isStatic(fx)
      ? Math.pow(pulse, FLASH_SHARPNESS) * FLASH_STRENGTH
      : 0;
  sky.render({
    condition,
    night: fx.night,
    time,
    dt: skyDt,
    wind: fx.simulation.wind,
    cloudCover: fx.reading.cloudCover,
    flash,
  });
}

function paint(fx: Fx) {
  const { simulation, renderer } = fx;
  const condition = simulation.condition;
  const time = simulation.elapsed;
  const skyDt = fx.skyTime < 0 || isStatic(fx) ? 0 : Math.max(0, time - fx.skyTime);
  const skipSky =
    skyDt > 0 &&
    skyDt < SKY_MIN_INTERVAL_S &&
    condition === fx.skyCondition &&
    fx.night === fx.skyNight;
  if (fx.sky && !skipSky) paintSky(fx, fx.sky, skyDt);
  renderer.begin(condition, fx.night, simulation.elapsed * 1000, {
    wind: simulation.wind,
    cloudCover: fx.reading.cloudCover,
    reduced: isStatic(fx),
  });
  for (const p of simulation.particles) renderer.particle(p, condition, fx.night);
  for (const impact of simulation.impacts) renderer.splash(impact);
  for (const drop of simulation.droplets) renderer.droplet(drop);
  for (const deposit of simulation.deposits) renderer.deposit(deposit);
  renderer.render();
}

function draw(fx: Fx, time: number) {
  fx.frame = 0;
  if (fx.disposed || fx.doc?.hidden || !fx.renderer.available) {
    fx.last = 0;
    return;
  }
  const still = isStatic(fx);
  if (!still && fx.last && time - fx.last < FRAME_MS) {
    fx.frame = requestAnimationFrame((t) => {
      draw(fx, t);
    });
    return;
  }
  const dt = still ? 0 : Math.min((time - (fx.last || time)) / 1000, MAX_STEP_S);
  fx.last = time;
  fx.simulation.step(dt, {
    surfaces: readSurfaces(fx),
    pointer: fx.pointer,
    saveData: fx.saveData,
  });
  paint(fx);
  if (!still)
    fx.frame = requestAnimationFrame((t) => {
      draw(fx, t);
    });
}

function restart(fx: Fx) {
  if (fx.disposed) return;
  if (fx.frame) cancelAnimationFrame(fx.frame);
  fx.frame = 0;
  fx.last = 0;
  draw(fx, performance.now());
}

// Re-read surfaces and background before the next frame; redraw if static.
function invalidate(fx: Fx, { clearDeposits = false } = {}) {
  fx.surfacesDirty = true;
  fx.renderer.invalidateBackground();
  if (clearDeposits) fx.simulation.clearDeposits();
  if (!fx.frame) restart(fx);
}

// Deterministic: replay from the seed at a fixed 30 fps step, then draw that frame.
function seek(fx: Fx, seconds: number) {
  if (!(seconds >= 0)) throw new RangeError('seek expects a non-negative number of seconds');
  const { simulation } = fx;
  const condition = simulation.condition;
  simulation.reset(fx.seed);
  simulation.setCondition(condition, fx.reading);
  const steps = Math.round(seconds * 30),
    options = { surfaces: readSurfaces(fx), pointer: null, saveData: fx.saveData };
  simulation.step(0, options);
  for (let i = 0; i < steps; i++) simulation.step(STEP_S, options);
  fx.skyTime = -1;
  if (fx.renderer.available) paint(fx);
}

function resize(fx: Fx, w: number, h: number) {
  if (!(w > 0 && h > 0)) throw new RangeError('resize expects positive dimensions');
  fx.width = w;
  fx.height = h;
  fx.renderer.resize(w, h);
  // The backdrop follows its own CSS box, so it can scroll with the page.
  if (fx.sky && fx.skyCanvas)
    fx.sky.resize(fx.skyCanvas.clientWidth || w, fx.skyCanvas.clientHeight || h);
  fx.simulation.resize(w, h);
  invalidate(fx);
  restart(fx);
}

function dispose(fx: Fx) {
  if (fx.disposed) return;
  fx.disposed = true;
  if (fx.frame) cancelAnimationFrame(fx.frame);
  fx.frame = 0;
  fx.doc?.removeEventListener('visibilitychange', fx.onChange);
  fx.reducedMotion?.removeEventListener?.('change', fx.onChange);
  fx.renderer.dispose();
  fx.sky?.dispose();
}

// Try the Three.js renderer; on failure swap the canvas and use the 2D one.
function chooseRenderer(
  canvas: HTMLCanvasElement,
  THREE: typeof ThreeNS | undefined,
  options: { pixelRatio: number; atmosphere: boolean; lightRain: boolean; onRestored: () => void },
): { renderer: WeatherRenderer; canvas: HTMLCanvasElement } {
  if (THREE) {
    try {
      return { renderer: createThreeRenderer(canvas, THREE, options), canvas };
    } catch {
      /* fall through to 2D */
    }
    if (canvas.parentNode) canvas = replaceCanvas(canvas);
  }
  return { renderer: createCanvasRenderer(canvas, { pixelRatio: options.pixelRatio }), canvas };
}

function createFx(
  parts: Pick<Fx, 'canvas' | 'renderer' | 'sky' | 'skyCanvas'>,
  options: Pick<Fx, 'seed' | 'saveData' | 'reducedMotion'> & { autoplay: boolean },
): Fx {
  const { autoplay, ...kept } = options;
  const fx: Fx = {
    ...parts,
    ...kept,
    simulation: createSimulation({ seed: options.seed }),
    doc: (globalThis as { document?: Document }).document,
    onChange: () => {
      restart(fx);
    },
    night: false,
    reading: {},
    surfaces: [],
    surfaceSource: null,
    surfacesDirty: false,
    pointer: null,
    playing: autoplay,
    disposed: false,
    frame: 0,
    last: 0,
    width: 1,
    height: 1,
    skyTime: -1,
    skyCondition: undefined,
    skyNight: undefined,
  };
  return fx;
}

/**
 * Transparent weather layer drawn into `canvas`. Pass the Three.js module as
 * `THREE` for the WebGL renderer; without it, or without WebGL, a 2D canvas
 * fallback is used. When WebGL fails on the given canvas, a fresh canvas
 * replaces it in the DOM; read `effects.canvas` for the element in use.
 *
 * Pass `skyCanvas`, placed behind the page content, to draw clouds, fog,
 * stars and sun glow there so text stays crisp above them. `skyStyle: 'full'`
 * also paints an opaque sky gradient, like a weather app.
 */
export function createWeatherEffects({
  canvas,
  skyCanvas,
  skyStyle = 'clouds',
  THREE,
  seed = 0,
  autoplay = true,
  pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2),
  reducedMotion = typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
    : null,
  saveData = (globalThis.navigator as (Navigator & { connection?: NetworkInformation }) | undefined)
    ?.connection?.saveData === true,
}: WeatherEffectsOptions): WeatherEffects {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guards plain-JS callers
  if (!canvas) throw new TypeError('createWeatherEffects requires a canvas');
  const chosen = chooseRenderer(canvas, THREE, {
    pixelRatio,
    atmosphere: !skyCanvas,
    lightRain: !!skyCanvas && skyStyle === 'full',
    onRestored: () => {
      invalidate(fx);
      restart(fx);
    },
  });
  chosen.canvas.dataset.renderer = chosen.renderer.backend;
  // Clouds are soft, so the backdrop renders at CSS pixel density at most.
  const sky: SkyRenderer | null = skyCanvas
    ? createSkyRenderer(skyCanvas, {
        pixelRatio: Math.min(pixelRatio, 1),
        starPixelRatio: pixelRatio,
        style: skyStyle,
        onRestored: () => {
          fx.skyTime = -1;
          restart(fx);
        },
      })
    : null;
  if (sky && skyCanvas) skyCanvas.dataset.renderer = sky.backend;
  const fx = createFx({ ...chosen, skyCanvas, sky }, { seed, saveData, reducedMotion, autoplay });
  fx.doc?.addEventListener('visibilitychange', fx.onChange);
  reducedMotion?.addEventListener?.('change', fx.onChange);
  const api = buildApi(fx);
  api.resize(
    Math.max(1, fx.canvas.clientWidth || fx.width),
    Math.max(1, fx.canvas.clientHeight || fx.height),
  );
  return api;
}

function setWeather(
  fx: Fx,
  condition: WeatherCondition,
  { night = fx.night, reading = {} }: { night?: boolean; reading?: WeatherReading } = {},
) {
  if (!isCondition(condition))
    throw new RangeError(`Unknown weather condition: ${String(condition)}`);
  fx.night = night;
  fx.reading = reading;
  fx.simulation.setCondition(condition, reading);
  restart(fx);
}

const pointerAt = (x: number | null, y?: number): Point | null =>
  x !== null && y !== undefined && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;

function setPlaying(fx: Fx, playing: boolean) {
  fx.playing = playing;
  restart(fx);
}

function buildApi(fx: Fx): WeatherEffects {
  return {
    get canvas() {
      return fx.canvas;
    },
    get backend() {
      return fx.renderer.backend;
    },
    get skyBackend() {
      return fx.sky?.backend ?? null;
    },
    get playing() {
      return fx.playing;
    },
    get condition() {
      return fx.simulation.condition;
    },
    get time() {
      return fx.simulation.elapsed;
    },
    get simulation() {
      return fx.simulation;
    },
    setWeather(condition, options) {
      setWeather(fx, condition, options);
    },
    setSurfaces(source, { clearDeposits = true } = {}) {
      fx.surfaceSource = source;
      invalidate(fx, { clearDeposits });
    },
    setBackground(source, options) {
      fx.renderer.setBackground(source, options);
      invalidate(fx);
    },
    setPointer(x, y) {
      fx.pointer = pointerAt(x, y);
    },
    invalidate: (options) => {
      invalidate(fx, options);
    },
    play() {
      setPlaying(fx, true);
    },
    pause() {
      setPlaying(fx, false);
    },
    seek: (seconds) => {
      seek(fx, seconds);
    },
    resize: (w, h) => {
      resize(fx, w, h);
    },
    dispose: () => {
      dispose(fx);
    },
  };
}
