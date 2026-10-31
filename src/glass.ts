// Water drops (and frost) on a small pane of glass, independent of the page
// weather layer and of Three.js. Draw it over any element, such as a window in
// an illustration: the background painter supplies what is seen through the
// glass, and transparent areas of it stay clear. It draws on the caller's own
// canvas and owns that canvas's WebGL2 context, program and background texture.

import { buildProgram } from './gl.js';
import { GLASS_FRAGMENT, GLASS_VERTEX } from './shaders/glass.js';
import { isRain, isFrozen } from './conditions.js';
import type { WeatherCondition } from './conditions.js';
import { PROFILES } from './profiles.js';
import type { BackgroundSource } from './refraction.js';

/** A MediaQueryList, or any object with `matches` and optional change listeners. */
export interface ReducedMotion {
  /** Whether reduced motion is currently requested. */
  readonly matches: boolean;
  /**
   * Subscribes to changes of `matches`.
   *
   * @param type - Always `'change'`.
   * @param listener - Called when `matches` changes.
   */
  addEventListener?(type: 'change', listener: () => void): void;
  /**
   * Unsubscribes a listener added with `addEventListener`.
   *
   * @param type - Always `'change'`.
   * @param listener - The listener to remove.
   */
  removeEventListener?(type: 'change', listener: () => void): void;
}

/** Options for {@link createGlassDroplets}. */
export interface GlassDropletsOptions {
  /** The element to draw on (sized by CSS). */
  canvas: HTMLCanvasElement;
  /** CSS pixels per drop-grid unit; small panes want small values. Default 90. */
  dropSize?: number;
  /** Seed for the drop pattern. Default 7. */
  seed?: number;
  /** 'inside' (drops on the near surface) or 'outside' (rain on a window, seen through the glass). Default `'inside'`. */
  side?: 'inside' | 'outside';
  /** Device pixels per CSS pixel. Default `min(devicePixelRatio, 2)`. */
  pixelRatio?: number;
  /** Freezes the animation while `matches` is true. Default `matchMedia('(prefers-reduced-motion: reduce)')`; pass `null` to ignore. */
  reducedMotion?: ReducedMotion | null;
}

/** Water drops and frost on a pane of glass, drawn on the caller's canvas. */
export interface GlassDroplets {
  /** The rendering backend; always `'webgl2'`. */
  readonly backend: 'webgl2';
  /**
   * Sets the weather that drives rain and frost on the glass.
   *
   * @param condition - The weather condition.
   * @param options - `night` selects the night look. Default keeps the current value (initially `false`).
   *
   * @example
   * glass.setWeather('rain', { night: true });
   */
  setWeather(condition: WeatherCondition, options?: { night?: boolean }): void;
  /**
   * Sets what is seen through the glass: a drawable, or a function
   * `(ctx, { width, height, night })` painting in CSS pixels.
   *
   * @param source - The background, or `null` for none.
   */
  setBackground(source: BackgroundSource): void;
  /** Repaints the background before the next frame; call after the source changes. */
  invalidate(): void;
  /**
   * Sets the pane size.
   *
   * @param width - Width in CSS px (at least 1).
   * @param height - Height in CSS px (at least 1).
   */
  resize(width: number, height: number): void;
  /** Starts or resumes the animation. */
  play(): void;
  /** Pauses the animation and draws a still frame. */
  pause(): void;
  /** Stops the animation and frees the GL resources. Safe to call twice. */
  dispose(): void;
}

type UniformName =
  | 'background'
  | 'resolution'
  | 'time'
  | 'rain'
  | 'frost'
  | 'density'
  | 'stillDensity'
  | 'dark'
  | 'dropScale'
  | 'seed'
  | 'outside';
const UNIFORM_NAMES: UniformName[] = [
  'background',
  'resolution',
  'time',
  'rain',
  'frost',
  'density',
  'stillDensity',
  'dark',
  'dropScale',
  'seed',
  'outside',
];

// Frame interval: the animation is capped at 30 fps.
const FRAME_INTERVAL_MS = 1000 / 30;
// Longest time step (s) taken in one frame.
const MAX_STEP_S = 0.05;
// Rate at which rain and frost ease towards their targets.
const EASE_RATE = 1.5;
// Below this amount rain and frost count as off.
const VISIBLE_THRESHOLD = 0.005;
// Frost target: rain on freezing glass frosts heavily, otherwise lightly.
const FROST_WET = 0.85;
const FROST_DRY = 0.5;
// Animation clock start, so frame zero is mid-cycle.
const START_TIME_S = 12;

interface Glass {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  source: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  dropSize: number;
  seed: number;
  side: 'inside' | 'outside';
  pixelRatio: number;
  reducedMotion: ReducedMotion | null;
  program: WebGLProgram | null;
  uniforms: Record<UniformName, WebGLUniformLocation | null>;
  texture: WebGLTexture | null;
  vao: WebGLVertexArrayObject | null;
  lost: boolean;
  painter: BackgroundSource;
  dirty: boolean;
  width: number;
  height: number;
  condition: WeatherCondition;
  night: boolean;
  rain: number;
  frost: number;
  time: number;
  frame: number;
  last: number;
  playing: boolean;
  disposed: boolean;
}

function build(g: Glass) {
  const { gl } = g;
  ({ program: g.program, uniforms: g.uniforms } = buildProgram(
    gl,
    GLASS_VERTEX,
    GLASS_FRAGMENT,
    UNIFORM_NAMES,
  ));
  g.vao = gl.createVertexArray();
  g.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, g.texture);
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, key, value);
  g.dirty = true;
}

// Paint the background into the 2D canvas and upload it as the texture.
function capture(g: Glass) {
  const { gl, ctx, source, width, height, pixelRatio } = g;
  g.dirty = false;
  if (!ctx) return;
  source.width = Math.max(1, Math.round(width * pixelRatio));
  source.height = Math.max(1, Math.round(height * pixelRatio));
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (typeof g.painter === 'function') g.painter(ctx, { width, height, night: g.night });
  else if (g.painter) ctx.drawImage(g.painter, 0, 0, width, height);
  gl.bindTexture(gl.TEXTURE_2D, g.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

const isStill = (g: Glass) => !g.playing || g.reducedMotion?.matches === true;
const isWet = (g: Glass) => isRain(g.condition);
const frostTarget = (g: Glass) => (isFrozen(g.condition) ? (isWet(g) ? FROST_WET : FROST_DRY) : 0);

function resizeCanvas(g: Glass) {
  const { canvas, pixelRatio } = g;
  const cw = Math.max(1, Math.round((canvas.clientWidth || g.width) * pixelRatio)),
    ch = Math.max(1, Math.round((canvas.clientHeight || g.height) * pixelRatio));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
}

function setUniforms(g: Glass) {
  const { gl, uniforms } = g;
  gl.useProgram(g.program);
  gl.bindVertexArray(g.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, g.texture);
  gl.uniform1i(uniforms.background, 0);
  gl.uniform2f(uniforms.resolution, g.width, g.height);
  gl.uniform1f(uniforms.time, g.time);
  gl.uniform1f(uniforms.rain, g.rain);
  gl.uniform1f(uniforms.frost, g.frost);
  // Drizzle: a mist of small beads that rarely run. Heavier rain: more runs.
  const profile = PROFILES[g.condition].glass;
  gl.uniform1f(uniforms.density, profile.density);
  gl.uniform1f(uniforms.stillDensity, profile.stillDensity);
  gl.uniform1f(uniforms.dark, g.night ? 1 : 0);
  gl.uniform1f(uniforms.dropScale, g.dropSize * profile.dropScale);
  gl.uniform1f(uniforms.seed, g.seed);
  gl.uniform1f(uniforms.outside, g.side === 'outside' ? 1 : 0);
}

function draw(g: Glass, dt: number) {
  const { gl } = g;
  const blend = dt > 0 ? 1 - Math.exp(-dt * EASE_RATE) : 1;
  g.rain += (Number(isWet(g)) - g.rain) * blend;
  g.frost += (frostTarget(g) - g.frost) * blend;
  if (!isStill(g)) g.time += dt;
  if (g.lost) return;
  resizeCanvas(g);
  gl.viewport(0, 0, g.canvas.width, g.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (g.rain < VISIBLE_THRESHOLD && g.frost < VISIBLE_THRESHOLD) return;
  if (g.dirty) capture(g);
  setUniforms(g);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function loop(g: Glass, now: number) {
  g.frame = 0;
  if (g.disposed || document.hidden) {
    g.last = 0;
    return;
  }
  if (g.last && now - g.last < FRAME_INTERVAL_MS) {
    g.frame = requestAnimationFrame((t) => {
      loop(g, t);
    });
    return;
  }
  const dt = g.last ? Math.min(MAX_STEP_S, (now - g.last) / 1000) : 0;
  g.last = now;
  draw(g, dt);
  const fading =
    Math.abs(Number(isWet(g)) - g.rain) > VISIBLE_THRESHOLD ||
    Math.abs(frostTarget(g) - g.frost) > VISIBLE_THRESHOLD;
  if ((!isStill(g) && (isWet(g) || g.rain > VISIBLE_THRESHOLD)) || fading)
    g.frame = requestAnimationFrame((t) => {
      loop(g, t);
    });
}

function restart(g: Glass) {
  if (g.disposed) return;
  if (g.frame) cancelAnimationFrame(g.frame);
  g.frame = 0;
  g.last = 0;
  g.frame = requestAnimationFrame((t) => {
    loop(g, t);
  });
}

function createState(options: GlassDropletsOptions, gl: WebGL2RenderingContext): Glass {
  const {
    canvas,
    dropSize = 90,
    seed = 7,
    side = 'inside',
    pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2),
    reducedMotion = typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
      : null,
  } = options;
  const source = document.createElement('canvas');
  return {
    gl,
    canvas,
    source,
    ctx: source.getContext('2d'),
    dropSize,
    seed,
    side,
    pixelRatio,
    reducedMotion,
    program: null,
    uniforms: {} as Record<UniformName, WebGLUniformLocation | null>,
    texture: null,
    vao: null,
    lost: false,
    painter: null,
    dirty: true,
    width: 1,
    height: 1,
    condition: 'clear',
    night: false,
    rain: 0,
    frost: 0,
    time: START_TIME_S,
    frame: 0,
    last: 0,
    playing: true,
    disposed: false,
  };
}

// Listen for context loss, tab visibility and motion preference; returns the
// matching cleanup.
function listen(g: Glass): () => void {
  const { canvas, reducedMotion } = g;
  const again = () => {
    restart(g);
  };
  const lose = (event: Event) => {
    event.preventDefault();
    g.lost = true;
  };
  const restore = () => {
    g.lost = false;
    build(g);
    restart(g);
  };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);
  document.addEventListener('visibilitychange', again);
  reducedMotion?.addEventListener?.('change', again);
  return () => {
    canvas.removeEventListener('webglcontextlost', lose);
    canvas.removeEventListener('webglcontextrestored', restore);
    document.removeEventListener('visibilitychange', again);
    reducedMotion?.removeEventListener?.('change', again);
  };
}

/**
 * Draws water drops and frost on a small pane of glass, independent of the
 * page weather layer and of Three.js. It takes over the canvas's WebGL2 context.
 *
 * @param options - Canvas and appearance options.
 * @returns The controller, or `null` when the canvas cannot provide WebGL2.
 *
 * @example
 * const glass = createGlassDroplets({ canvas: document.querySelector('#window'), side: 'outside' });
 * if (glass) {
 *   glass.setBackground((ctx, { width, height }) => {
 *     ctx.fillStyle = '#6a8caf';
 *     ctx.fillRect(0, 0, width, height);
 *   });
 *   glass.setWeather('rain');
 * }
 */
export function createGlassDroplets(options: GlassDropletsOptions): GlassDroplets | null {
  const context = options.canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
  });
  if (!context) return null;
  const g = createState(options, context);
  build(g);
  const unlisten = listen(g);
  return {
    backend: 'webgl2',
    setWeather(next, { night = g.night } = {}) {
      if (next !== g.condition || night !== g.night) g.dirty = true;
      g.condition = next;
      g.night = night;
      restart(g);
    },
    /** A drawable, or a function (ctx, { width, height, night }) painting in CSS pixels. */
    setBackground(next) {
      g.painter = next ?? null;
      g.dirty = true;
      restart(g);
    },
    invalidate() {
      g.dirty = true;
      restart(g);
    },
    resize(w, h) {
      g.width = Math.max(1, w);
      g.height = Math.max(1, h);
      g.dirty = true;
      restart(g);
    },
    play() {
      g.playing = true;
      restart(g);
    },
    pause() {
      g.playing = false;
      restart(g);
    },
    dispose() {
      if (g.disposed) return;
      g.disposed = true;
      if (g.frame) cancelAnimationFrame(g.frame);
      unlisten();
      g.gl.deleteProgram(g.program);
      g.gl.deleteTexture(g.texture);
      g.gl.deleteVertexArray(g.vao);
    },
  };
}
