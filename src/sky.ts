// Weather backdrop drawn behind page content on its own canvas. Raw WebGL2
// (one full-screen triangle, all drawing in the fragment shader), with a 2D
// fallback. It owns the canvas's GL context, program and the eased sky state.
//
// style 'clouds' (default): transparent canvas with clouds, fog, stars and
//   sun glow only; the page keeps its own background.
// style 'full': opaque sky gradient as well, like a weather app.

import type { WeatherCondition } from './conditions.js';
import { PROFILES } from './profiles.js';
import { buildProgram } from './gl.js';
import { SKY_FRAGMENT, SKY_VERTEX } from './shaders/sky.js';
import type { ConditionProfile, SkyPalette, SkyProfile } from './profiles.js';

export type SkyStyle = 'clouds' | 'full';

export interface SkyFrame {
  condition: WeatherCondition;
  night: boolean;
  time: number;
  /** Seconds since the last render; 0 jumps straight to the new look. */
  dt?: number;
  wind?: number;
  cloudCover?: number;
  flash?: number;
}

export interface SkyRenderer {
  readonly backend: 'webgl2' | 'canvas';
  readonly style: SkyStyle;
  readonly available: boolean;
  resize(width: number, height: number): void;
  render(frame: SkyFrame): void;
  dispose(): void;
}

export interface SkyRendererOptions {
  pixelRatio?: number;
  starPixelRatio?: number;
  style?: SkyStyle;
  onRestored?: () => void;
}

type Vec3 = [number, number, number];
type Palette = SkyPalette;
type Colors4 = [string, string, string, string];

interface SkyState {
  top: Vec3;
  bottom: Vec3;
  cloudLight: Vec3;
  cloudShadow: Vec3;
  coverage: number;
  wispy: number;
  stars: number;
  mist: number;
  sun: number;
  reach: number;
  drift: number;
}
type ScalarKey = { [K in keyof SkyState]: SkyState[K] extends number ? K : never }[keyof SkyState];
type VectorKey = Exclude<keyof SkyState, ScalarKey>;

const hex = (value: string): Vec3 =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as Vec3;

// Full style: [top, bottom, cloud light, cloud shadow]
const SKIES: Record<Palette, { day: Colors4; night: Colors4 }> = {
  clear: {
    day: ['#2a63c4', '#8dbbe9', '#ffffff', '#b4c7dc'],
    night: ['#11142e', '#393c6b', '#5f6192', '#24264a'],
  },
  partly: {
    day: ['#2f68c4', '#93bfe8', '#ffffff', '#a9bdd3'],
    night: ['#222347', '#4c4b7c', '#7c7ab0', '#2a2a4c'],
  },
  cloudy: {
    day: ['#5b7084', '#a4b3c1', '#e6ebf0', '#6f7d8b'],
    night: ['#222347', '#4c4b7c', '#7c7ab0', '#2a2a4c'],
  },
  rain: {
    day: ['#3d4955', '#77848f', '#a6b0bb', '#2a323b'],
    night: ['#181c25', '#373e4b', '#5d6676', '#0b0e13'],
  },
  storm: {
    day: ['#29313b', '#58626d', '#8a95a1', '#1a1f25'],
    night: ['#111419', '#2b313b', '#4a5260', '#07080b'],
  },
  snow: {
    day: ['#6a7d92', '#a9b8c7', '#e6ecf2', '#8495a7'],
    night: ['#283041', '#4f596a', '#6d7788', '#232a36'],
  },
  fog: {
    day: ['#7c8891', '#adb5ba', '#d3d8db', '#8f989f'],
    night: ['#363b42', '#575d64', '#6d737a', '#2c3036'],
  },
};

// Clouds style, over the caller's page: [lit, shadow]. Day tones suit a light
// page; night tones a dark one.
const TONES: Record<Palette, { day: [string, string]; night: [string, string] }> = {
  clear: { day: ['#ffffff', '#b7c9da'], night: ['#505b70', '#262e42'] },
  partly: { day: ['#eef2f6', '#8b9bab'], night: ['#535e74', '#262e42'] },
  cloudy: { day: ['#e9edf0', '#8f9ba6'], night: ['#4f5a6f', '#222a3d'] },
  rain: { day: ['#d3d9df', '#7d8996'], night: ['#4f5a70', '#1f2638'] },
  storm: { day: ['#c3cbd2', '#6b7682'], night: ['#465066', '#161c2b'] },
  snow: { day: ['#f3f6f8', '#a7b3be'], night: ['#5a6579', '#2a3245'] },
  fog: { day: ['#eef1f2', '#c3cacf'], night: ['#4d566a', '#343c50'] },
};

// tones, coverage, wisps, stars, mist, sun, reach (fraction of the height
// that clouds extend down from the top in clouds style), drift speed
// Falls back to clear for conditions a plain-JS caller made up.
const lookFor = (condition: WeatherCondition): SkyProfile =>
  (PROFILES as Partial<Record<string, ConditionProfile>>)[condition]?.sky ?? PROFILES.clear.sky;

type UniformName =
  | 'resolution'
  | 'time'
  | 'scale'
  | 'opaque'
  | 'coverage'
  | 'wispy'
  | 'stars'
  | 'mist'
  | 'sun'
  | 'flash'
  | 'drift'
  | 'reach'
  | 'compact'
  | 'top'
  | 'bottom'
  | 'cloudLight'
  | 'cloudShadow';
const UNIFORM_NAMES: UniformName[] = [
  'resolution',
  'time',
  'scale',
  'opaque',
  'coverage',
  'wispy',
  'stars',
  'mist',
  'sun',
  'flash',
  'drift',
  'reach',
  'compact',
  'top',
  'bottom',
  'cloudLight',
  'cloudShadow',
];

// Skies at or above this coverage ignore the reported cloud cover; adjusted
// coverage never exceeds the maximum.
const OVERCAST_COVERAGE = 0.9;
const MAX_COVERAGE = 0.95;

function target(
  condition: WeatherCondition,
  night: boolean,
  cloudCover: number | undefined,
  style: SkyStyle,
): SkyState {
  const { palette, coverage, wispy, stars, mist, sun, reach, drift } = lookFor(condition);
  const time = night ? 'night' : 'day';
  const colors: Colors4 =
    style === 'full' ? SKIES[palette][time] : ['#000000', '#000000', ...TONES[palette][time]];
  const [top, bottom, cloudLight, cloudShadow] = colors.map(hex) as [Vec3, Vec3, Vec3, Vec3];
  const cover =
    cloudCover !== undefined &&
    Number.isFinite(cloudCover) &&
    coverage > 0 &&
    coverage < OVERCAST_COVERAGE
      ? Math.min(MAX_COVERAGE, coverage * (0.6 + cloudCover / 125))
      : coverage;
  // Clear nights stay cloudless so the stars show; clear days get a few small clouds.
  const clearNight =
    night && (PROFILES as Partial<Record<string, ConditionProfile>>)[condition] === PROFILES.clear;
  return {
    top,
    bottom,
    cloudLight,
    cloudShadow,
    coverage: clearNight ? 0 : cover,
    wispy,
    stars: night ? stars : 0,
    mist,
    sun: night ? 0 : sun,
    reach,
    drift,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const SCALARS: ScalarKey[] = ['coverage', 'wispy', 'stars', 'mist', 'sun', 'reach', 'drift'];
const VECTORS: VectorKey[] = ['top', 'bottom', 'cloudLight', 'cloudShadow'];
function blend(current: SkyState | undefined, next: SkyState, t: number): SkyState {
  if (!current) return structuredClone(next);
  for (const key of SCALARS) current[key] = lerp(current[key], next[key], t);
  for (const key of VECTORS)
    current[key] = current[key].map((v, i) => lerp(v, next[key][i], t)) as Vec3;
  return current;
}

// Seconds over which the look eases to a new condition: rate of 2 per second.
const EASE_RATE = 2;
// Viewports narrower than this (CSS px) count as compact; fully compact at
// COMPACT_RANGE below it.
const COMPACT_BELOW = 760;
const COMPACT_RANGE = 370;
// Below this a quantity is treated as absent.
const NEGLIGIBLE = 0.01;

// Only stars are showing: no clouds, wisps or mist.
const isStarsOnly = (look: SkyState) =>
  look.coverage < NEGLIGIBLE && look.wispy < NEGLIGIBLE && look.mist < NEGLIGIBLE;

const compactness = (width: number, height: number) =>
  Math.min(1, Math.max(0, (COMPACT_BELOW - Math.min(width, height)) / COMPACT_RANGE));

interface SkyGl {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  opaque: boolean;
  program: WebGLProgram | null;
  uniforms: Record<UniformName, WebGLUniformLocation | null>;
  vao: WebGLVertexArrayObject | null;
  lost: boolean;
  width: number;
  height: number;
  look: SkyState | undefined;
  ratio: number;
}

function build(s: SkyGl) {
  ({ program: s.program, uniforms: s.uniforms } = buildProgram(
    s.gl,
    SKY_VERTEX,
    SKY_FRAGMENT,
    UNIFORM_NAMES,
  ));
  s.vao = s.gl.createVertexArray();
}

function resize(s: SkyGl, w: number, h: number) {
  const { canvas } = s;
  s.width = w;
  s.height = h;
  const cw = Math.max(1, Math.round(w * s.ratio)),
    ch = Math.max(1, Math.round(h * s.ratio));
  // Reassigning the same size would still clear the canvas.
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
}

// Follow the canvas's own CSS box every frame, so the drawing buffer can
// never be left at another size (or the 300 x 150 default) and stretched.
function syncSize(s: SkyGl, wanted: number) {
  const { canvas } = s;
  const w = canvas.clientWidth || s.width,
    h = canvas.clientHeight || s.height;
  if (
    wanted !== s.ratio ||
    w !== s.width ||
    h !== s.height ||
    canvas.width !== Math.max(1, Math.round(w * wanted)) ||
    canvas.height !== Math.max(1, Math.round(h * wanted))
  ) {
    s.ratio = wanted;
    resize(s, w, h);
  }
}

function draw(s: SkyGl, look: SkyState, time: number, flash: number) {
  const { gl, uniforms, canvas } = s;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(s.program);
  gl.bindVertexArray(s.vao);
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.scale, s.ratio);
  gl.uniform1f(uniforms.compact, compactness(s.width, s.height));
  gl.uniform1f(uniforms.time, time);
  gl.uniform1f(uniforms.opaque, s.opaque ? 1 : 0);
  gl.uniform1f(uniforms.flash, flash);
  for (const key of SCALARS) gl.uniform1f(uniforms[key], look[key]);
  for (const key of VECTORS) gl.uniform3fv(uniforms[key], look[key]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function listenForContextLoss(s: SkyGl, onRestored?: () => void): () => void {
  const { canvas } = s;
  const lose = (event: Event) => {
    event.preventDefault();
    s.lost = true;
  };
  const restore = () => {
    s.lost = false;
    build(s);
    resize(s, s.width, s.height);
    onRestored?.();
  };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);
  return () => {
    canvas.removeEventListener('webglcontextlost', lose);
    canvas.removeEventListener('webglcontextrestored', restore);
  };
}

// pixelRatio: resolution for clouds (soft, so 1 is enough). starPixelRatio:
// used when only stars are showing, so they stay pin-sharp on dense screens.
export function createSkyRenderer(
  canvas: HTMLCanvasElement,
  {
    pixelRatio = 1,
    starPixelRatio = pixelRatio,
    style = 'clouds',
    onRestored,
  }: SkyRendererOptions = {},
): SkyRenderer {
  const opaque = style === 'full';
  const context = canvas.getContext('webgl2', {
    alpha: !opaque,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  });
  if (!context) return createGradientSky(canvas, opaque);
  const s: SkyGl = {
    gl: context,
    canvas,
    opaque,
    program: null,
    uniforms: {} as Record<UniformName, WebGLUniformLocation | null>,
    vao: null,
    lost: false,
    width: 1,
    height: 1,
    look: undefined,
    ratio: pixelRatio,
  };
  build(s);

  const unlisten = listenForContextLoss(s, onRestored);

  return {
    backend: 'webgl2',
    style,
    get available() {
      return !s.lost;
    },
    resize(w, h) {
      resize(s, w, h);
    },
    // dt of 0 jumps straight to the new look; otherwise it eases over ~1.5 s.
    render({ condition, night, time, dt = 0, cloudCover, flash = 0 }) {
      const next = target(condition, night, cloudCover, style);
      const look = (s.look = blend(s.look, next, dt > 0 ? 1 - Math.exp(-dt * EASE_RATE) : 1));
      syncSize(s, isStarsOnly(next) ? starPixelRatio : pixelRatio);
      if (s.lost) return;
      draw(s, look, time, flash);
    },
    dispose() {
      unlisten();
      s.gl.deleteProgram(s.program);
      s.gl.deleteVertexArray(s.vao);
    },
  };
}

// Without WebGL2: the full style keeps its gradient; clouds style draws nothing.
function createGradientSky(canvas: HTMLCanvasElement, opaque: boolean): SkyRenderer {
  const ctx = canvas.getContext('2d');
  let width = 1,
    height = 1;
  return {
    backend: 'canvas',
    style: opaque ? 'full' : 'clouds',
    available: !!ctx,
    resize(w, h) {
      width = w;
      height = h;
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
    },
    render({ condition, night }) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (!opaque) return;
      const { palette } = lookFor(condition);
      const [top, bottom] = SKIES[palette][night ? 'night' : 'day'];
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, bottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    },
    dispose() {
      // Nothing to release: this renderer holds no GPU resources.
    },
  };
}
