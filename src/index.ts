import { createSimulation } from './simulation.js';
import { createThreeRenderer } from './three-renderer.js';
import { createCanvasRenderer } from './canvas-renderer.js';
import { createSkyRenderer } from './sky.js';
import { isCondition } from './conditions.js';
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

const FRAME = 1000 / 30;

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
  const simulation = createSimulation({ seed });
  let created: WeatherRenderer | undefined,
    night = false,
    reading: WeatherReading = {},
    surfaces: Surface[] = [],
    surfaceSource: SurfaceSource = null,
    surfacesDirty = false;
  let pointer: Point | null = null,
    playing = autoplay,
    disposed = false,
    frame = 0,
    last = 0,
    width = 1,
    height = 1;

  if (THREE) {
    try {
      created = createThreeRenderer(canvas, THREE, {
        pixelRatio,
        atmosphere: !skyCanvas,
        lightRain: !!skyCanvas && skyStyle === 'full',
        onRestored: () => {
          invalidate();
          restart();
        },
      });
    } catch {
      /* fall through to 2D */
    }
  }
  if (!created) {
    // A canvas that refused a WebGL context cannot hand out a 2D one.
    if (THREE && canvas.parentNode) {
      const replacement = canvas.ownerDocument.createElement('canvas');
      replacement.className = canvas.className;
      for (const name of ['aria-hidden', 'role']) {
        const value = canvas.getAttribute(name);
        if (value !== null) replacement.setAttribute(name, value);
      }
      canvas.replaceWith(replacement);
      canvas = replacement;
    }
    created = createCanvasRenderer(canvas, { pixelRatio });
  }
  const renderer: WeatherRenderer = created;
  canvas.dataset.renderer = renderer.backend;
  // Clouds are soft, so the backdrop renders at CSS pixel density at most.
  const sky: SkyRenderer | null = skyCanvas
    ? createSkyRenderer(skyCanvas, {
        pixelRatio: Math.min(pixelRatio, 1),
        starPixelRatio: pixelRatio,
        style: skyStyle,
        onRestored: () => {
          skyTime = -1;
          restart();
        },
      })
    : null;
  if (sky && skyCanvas) skyCanvas.dataset.renderer = sky.backend;
  let skyTime = -1,
    skyCondition: WeatherCondition | undefined,
    skyNight: boolean | undefined;

  const doc = (globalThis as { document?: Document }).document;
  const reduced = () => reducedMotion?.matches === true;
  const isStatic = () => !playing || reduced();
  const hidden = () => doc?.hidden;

  function readSurfaces() {
    if (surfacesDirty) {
      surfaces = (typeof surfaceSource === 'function' ? surfaceSource() : surfaceSource) ?? [];
      surfacesDirty = false;
    }
    return surfaces;
  }

  function paint() {
    const condition = simulation.condition;
    const time = simulation.elapsed;
    const skyDt = skyTime < 0 || isStatic() ? 0 : Math.max(0, time - skyTime);
    // Clouds drift slowly; ~20 fps is plenty and halves the backdrop's cost.
    const skipSky = skyDt > 0 && skyDt < 0.05 && condition === skyCondition && night === skyNight;
    if (sky && !skipSky) {
      skyTime = time;
      skyCondition = condition;
      skyNight = night;
      const dt = skyDt;
      const pulse = Math.max(0, Math.sin((time * Math.PI) / 9));
      const flash = condition === 'thunderstorm' && !isStatic() ? Math.pow(pulse, 100) * 0.8 : 0;
      sky.render({
        condition,
        night,
        time,
        dt,
        wind: simulation.wind,
        cloudCover: reading.cloudCover,
        flash,
      });
    }
    renderer.begin(condition, night, simulation.elapsed * 1000, {
      wind: simulation.wind,
      cloudCover: reading.cloudCover,
      reduced: isStatic(),
    });
    for (const p of simulation.particles) renderer.particle(p, condition, night);
    for (const impact of simulation.impacts) renderer.splash(impact);
    for (const drop of simulation.droplets) renderer.droplet(drop);
    for (const deposit of simulation.deposits) renderer.deposit(deposit);
    renderer.render();
  }

  function draw(time: number) {
    frame = 0;
    if (disposed || hidden() || !renderer.available) {
      last = 0;
      return;
    }
    const still = isStatic();
    if (!still && last && time - last < FRAME) {
      frame = requestAnimationFrame(draw);
      return;
    }
    const dt = still ? 0 : Math.min((time - (last || time)) / 1000, 0.04);
    last = time;
    simulation.step(dt, { surfaces: readSurfaces(), pointer, saveData });
    paint();
    if (!still) frame = requestAnimationFrame(draw);
  }

  function restart() {
    if (disposed) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    draw(performance.now());
  }

  // Re-read surfaces and background before the next frame; redraw if static.
  function invalidate({ clearDeposits = false } = {}) {
    surfacesDirty = true;
    renderer.invalidateBackground();
    if (clearDeposits) simulation.clearDeposits();
    if (!frame) restart();
  }

  const onVisibility = () => {
    restart();
  };
  doc?.addEventListener('visibilitychange', onVisibility);
  reducedMotion?.addEventListener?.('change', restart);

  const api: WeatherEffects = {
    get canvas() {
      return canvas;
    },
    get backend() {
      return renderer.backend;
    },
    get skyBackend() {
      return sky?.backend ?? null;
    },
    get playing() {
      return playing;
    },
    get condition() {
      return simulation.condition;
    },
    get time() {
      return simulation.elapsed;
    },
    get simulation() {
      return simulation;
    },
    /** condition: one of CONDITIONS. reading: optional wind/precipitation/cloud values. */
    setWeather(condition, { night: isNight = night, reading: nextReading = {} } = {}) {
      if (!isCondition(condition))
        throw new RangeError(`Unknown weather condition: ${String(condition)}`);
      night = isNight;
      reading = nextReading;
      simulation.setCondition(condition, reading);
      restart();
    },
    /** Line segments or polygons ({ points: [{x,y}...], room?, visible?() }), or a function returning them. */
    setSurfaces(source, { clearDeposits = true } = {}) {
      surfaceSource = source;
      invalidate({ clearDeposits });
    },
    /** Drawable or paint function used for droplet refraction; null removes it. */
    setBackground(source, options) {
      renderer.setBackground(source, options);
      invalidate();
    },
    setPointer(x, y) {
      pointer =
        x !== null && y !== undefined && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    },
    invalidate,
    play() {
      playing = true;
      restart();
    },
    pause() {
      playing = false;
      restart();
    },
    /** Deterministic: replay from the seed at a fixed 30 fps step, then draw that frame. */
    seek(seconds) {
      if (!(seconds >= 0)) throw new RangeError('seek expects a non-negative number of seconds');
      const condition = simulation.condition;
      simulation.reset(seed);
      simulation.setCondition(condition, reading);
      const steps = Math.round(seconds * 30),
        options = { surfaces: readSurfaces(), pointer: null, saveData };
      simulation.step(0, options);
      for (let i = 0; i < steps; i++) simulation.step(1 / 30, options);
      skyTime = -1;
      if (renderer.available) paint();
    },
    resize(w, h) {
      if (!(w > 0 && h > 0)) throw new RangeError('resize expects positive dimensions');
      width = w;
      height = h;
      renderer.resize(w, h);
      // The backdrop follows its own CSS box, so it can scroll with the page.
      if (sky && skyCanvas) sky.resize(skyCanvas.clientWidth || w, skyCanvas.clientHeight || h);
      simulation.resize(w, h);
      invalidate();
      restart();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      doc?.removeEventListener('visibilitychange', onVisibility);
      reducedMotion?.removeEventListener?.('change', restart);
      renderer.dispose();
      sky?.dispose();
    },
  };
  api.resize(Math.max(1, canvas.clientWidth || width), Math.max(1, canvas.clientHeight || height));
  return api;
}
