import type * as ThreeNS from 'three';
import { REFRACTION_FRAGMENT, REFRACTION_VERTEX } from './shaders/refraction.js';
import { isRain } from './conditions.js';
import type { WeatherCondition } from './conditions.js';
import { PROFILES } from './profiles.js';

export interface BackgroundInfo {
  width: number;
  height: number;
  night: boolean;
}
/** Paint in CSS pixels. Transparent areas receive no droplets or frost. */
export type BackgroundPainter = (
  ctx: CanvasRenderingContext2D,
  info: BackgroundInfo,
) => { color?: string } | void; // eslint-disable-line @typescript-eslint/no-invalid-void-type -- painters may return nothing
export type BackgroundSource = CanvasImageSource | BackgroundPainter | null;
export interface BackgroundOptions {
  dropSize?: number;
}

export interface RefractionLayer {
  setBackground(source: BackgroundSource, options?: BackgroundOptions): void;
  dispose(): void;
  invalidate(): void;
  resize(width: number, height: number): void;
  update(condition: WeatherCondition, dark: boolean, milliseconds: number, reduced?: boolean): void;
}

// Droplet refraction and frost over a caller-supplied background, drawn into
// the Three.js scene's transparent canvas. The background is redrawn into one
// texture only after invalidate() or a condition/theme change, never per
// frame. Areas left transparent stay clear. It owns an offscreen 2D canvas,
// its texture and one full-viewport mesh.

// Default CSS pixels per drop-grid unit.
const DEFAULT_DROP_SIZE = 750;
// Largest background texture edge, and the highest scale it is painted at.
const MAX_TEXTURE_SIZE = 2048;
const MAX_CAPTURE_SCALE = 1.5;
// Page colour behind transparent background areas.
const PAGE_COLOR = { day: '#f4f5f2', night: '#232426' };
// Longest time step (s) and the rate at which rain/frost ease in and out.
const MAX_STEP_S = 0.04;
const EASE_RATE = 3;
// Below this amount both effects count as off and the mesh is hidden.
const VISIBLE_THRESHOLD = 0.005;
// Offsets the droplet animation clock so frame zero is mid-cycle.
const TIME_OFFSET_S = 12;
const DEFAULT_DENSITY = 0.65;

function createSourceCanvas(): HTMLCanvasElement | OffscreenCanvas {
  return typeof OffscreenCanvas === 'function' && !(globalThis as { document?: Document }).document
    ? new OffscreenCanvas(1, 1)
    : document.createElement('canvas');
}

function createUniforms(THREE: typeof ThreeNS, texture: ThreeNS.Texture) {
  return {
    background: { value: texture },
    resolution: { value: new THREE.Vector2(1, 1) },
    pageColor: { value: new THREE.Color() },
    time: { value: 0 },
    rain: { value: 0 },
    frost: { value: 0 },
    density: { value: DEFAULT_DENSITY },
    dark: { value: 0 },
    dropScale: { value: DEFAULT_DROP_SIZE },
  };
}

type Uniforms = ReturnType<typeof createUniforms>;

interface Layer {
  source: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  texture: ThreeNS.Texture;
  uniforms: Uniforms;
  material: ThreeNS.ShaderMaterial;
  mesh: ThreeNS.Mesh;
  width: number;
  height: number;
  dirty: boolean;
  lastTheme: string;
  previousTime: number | undefined;
  background: BackgroundSource;
}

function createLayer(THREE: typeof ThreeNS): Layer {
  const source = createSourceCanvas();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- needed under TS 7 libs, which the lint-side TS 6 does not need
  const ctx = source.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const uniforms = createUniforms(THREE, texture);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms,
    vertexShader: REFRACTION_VERTEX,
    fragmentShader: REFRACTION_FRAGMENT,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return {
    source,
    ctx,
    texture,
    uniforms,
    material,
    mesh,
    width: 1,
    height: 1,
    dirty: true,
    lastTheme: '',
    previousTime: undefined,
    background: null,
  };
}

// background: a drawable (image, canvas, video, ImageBitmap) stretched over
// the viewport, or a function (ctx, { width, height, night }) that paints in
// CSS pixels and may return { color } for the page colour behind it.
function capture(layer: Layer, dark: boolean) {
  const { ctx, source, texture, width, height, background } = layer;
  layer.dirty = false;
  if (!ctx) return;
  const scale = Math.min(MAX_CAPTURE_SCALE, MAX_TEXTURE_SIZE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)),
    h = Math.max(1, Math.round(height * scale));
  // Three.js allocates fixed-size texture storage; a new size needs a new upload.
  if (w !== source.width || h !== source.height) texture.dispose();
  source.width = w;
  source.height = h;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  let color: string | undefined;
  if (typeof background === 'function')
    color = background(ctx as CanvasRenderingContext2D, { width, height, night: dark })?.color;
  else if (background) ctx.drawImage(background, 0, 0, width, height);
  layer.uniforms.pageColor.value.set(color ?? (dark ? PAGE_COLOR.night : PAGE_COLOR.day));
  texture.needsUpdate = true;
}

// Ease rain and frost towards the condition's targets; returns false when
// both are off and the layer is hidden.
function ease(layer: Layer, condition: WeatherCondition, milliseconds: number, reduced?: boolean) {
  const { uniforms, mesh } = layer;
  const { frost } = PROFILES[condition].glass;
  const dt =
    layer.previousTime === undefined
      ? 1
      : Math.max(0, Math.min(MAX_STEP_S, (milliseconds - layer.previousTime) / 1000));
  layer.previousTime = milliseconds;
  const blend = reduced ? 1 : 1 - Math.exp(-dt * EASE_RATE);
  uniforms.rain.value += (Number(isRain(condition)) - uniforms.rain.value) * blend;
  uniforms.frost.value += (frost - uniforms.frost.value) * blend;
  mesh.visible =
    uniforms.rain.value > VISIBLE_THRESHOLD || uniforms.frost.value > VISIBLE_THRESHOLD;
  return mesh.visible;
}

function update(
  layer: Layer,
  condition: WeatherCondition,
  dark: boolean,
  milliseconds: number,
  reduced?: boolean,
) {
  if (!ease(layer, condition, milliseconds, reduced)) return;
  const theme = `${condition}:${String(dark)}`;
  if (theme !== layer.lastTheme) {
    layer.dirty = true;
    layer.lastTheme = theme;
  }
  if (layer.dirty) capture(layer, dark);
  const { uniforms } = layer;
  uniforms.time.value = TIME_OFFSET_S + milliseconds / 1000;
  uniforms.dark.value = Number(dark);
  uniforms.density.value = PROFILES[condition].glass.refractionDensity;
}

export function createRefractionLayer(
  scene: ThreeNS.Scene,
  THREE: typeof ThreeNS,
): RefractionLayer {
  const layer = createLayer(THREE);
  const { mesh, uniforms } = layer;
  scene.add(mesh);
  return {
    // dropSize: CSS pixels per drop-grid unit (default 750). Smaller values
    // give smaller, closer drops, for small targets such as labels.
    setBackground(next, { dropSize = DEFAULT_DROP_SIZE } = {}) {
      layer.background = next ?? null;
      uniforms.dropScale.value = dropSize;
      layer.dirty = true;
    },
    dispose() {
      layer.texture.dispose();
      layer.material.dispose();
      mesh.geometry.dispose();
      scene.remove(mesh);
    },
    invalidate() {
      layer.dirty = true;
    },
    resize(w, h) {
      layer.width = w;
      layer.height = h;
      layer.dirty = true;
      uniforms.resolution.value.set(w, h);
      mesh.position.set(w / 2, h / 2, 60);
      mesh.scale.set(w, h, 1);
    },
    update(condition, dark, milliseconds, reduced) {
      update(layer, condition, dark, milliseconds, reduced);
    },
  };
}
