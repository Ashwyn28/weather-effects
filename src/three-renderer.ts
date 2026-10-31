// Page-wide weather overlay drawn with Three.js on the caller's transparent
// canvas: rain, snow, hail and leaf particles, impact splashes and, when no
// backdrop canvas draws them, a sun/mist/cloud atmosphere plane. It owns the
// WebGL renderer, scene, camera, instanced batches and the refraction layer.
// Three.js is injected by the caller, never imported.

import type * as ThreeNS from 'three';
import { createRefractionLayer } from './refraction.js';
import type { WeatherRenderer, RenderState } from './canvas-renderer.js';
import type { WeatherCondition } from './conditions.js';
import { PROFILES } from './profiles.js';
import type { Particle, Impact, Droplet, Deposit } from './simulation.js';
import { ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX } from './shaders/atmosphere.js';
import { PARTICLE_VERTEX, particleFragment } from './shaders/particles.js';
import type { ShapeKind } from './shaders/particles.js';

export interface ThreeRendererOptions {
  pixelRatio?: number;
  onLost?: () => void;
  onRestored?: () => void;
  atmosphere?: boolean;
  lightRain?: boolean;
}

type ShapeBatch = ThreeNS.InstancedMesh<ThreeNS.PlaneGeometry, ThreeNS.ShaderMaterial>;
type InstanceFn = (
  mesh: ThreeNS.InstancedMesh,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  angle: number,
  opacity?: number,
  g?: number,
  b?: number,
) => void;

// Instance capacities per batch.
const CAPACITY = {
  rain: 660,
  snow: 300,
  wind: 240,
  splash: 200,
  cap: 450,
  bead: 240,
  trail: 40,
  hail: 240,
};

// Scene lighting (only the hail meshes are lit).
const SKY_LIGHT = '#ffffff';
const GROUND_LIGHT = '#748b9b';
const SUN_LIGHT = '#d9edf8';
const HAIL_COLOR = '#d5e5eb';

// Particle colours: [day, night/light-backdrop] variants.
const COLORS = {
  rain: { dark: '#dfe8f2', day: '#566b7b' },
  splash: { dark: '#d6e6ee', day: '#4f6b80' },
  bead: { dark: '#e2eff7', day: '#58758a' },
  flake: { dark: '#f6f9fb', day: '#ffffff' },
  flakeRim: { dark: '#c3d0db', day: '#7c8fa1' },
  trail: { dark: '#9fb2bf', day: '#8a9ca8' },
  leaf: { dark: '#7d8d63', day: '#6c8a45' },
  leafAutumn: { dark: '#9b8257', day: '#c08b3a' },
  cap: '#f6fafb',
};

// Depth (0 far .. 1 near) maps to particle scale and z order.
const DEPTH_SCALE_BASE = 0.45;
const DEPTH_SCALE_RANGE = 1.15;
const DEPTH_Z = 30;
// Z of impact effects, in front of particles.
const SPLASH_Z = 40;
const BEAD_Z = 41;
// Snow nearer than this is out of focus; farther than the far limit is hazy.
const FOCUS_NEAR_DEPTH = 0.72;
const FOCUS_NEAR_RANGE = 0.28;
const FOCUS_FAR_DEPTH = 0.12;
const FOCUS_FAR_SOFTNESS = 0.3;
// Streak length limits in pixels.
const MIN_STREAK = 4;
const MAX_STREAK = 120;
// Below this viewport width (px) drizzle is drawn thicker and brighter.
const NARROW_WIDTH = 700;
// Lightning flash peaks once every 18 s (sin period) and lasts a brief spike.
const STORM_PERIOD_S = 18;
const FLASH_SHARPNESS = 100;
const FLASH_STRENGTH = 0.7;

function createBatch(
  THREE: typeof ThreeNS,
  scene: ThreeNS.Scene,
  kind: ShapeKind,
  capacity: number,
): ShapeBatch {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: { color: { value: new THREE.Color() }, color2: { value: new THREE.Color() } },
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: particleFragment(kind),
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  // Allocate instance colours before the shader compiles.
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

function createHail(THREE: typeof ThreeNS, scene: ThreeNS.Scene): ThreeNS.InstancedMesh {
  const hail = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      color: HAIL_COLOR,
      roughness: 0.3,
      transparent: true,
      opacity: 0.8,
    }),
    CAPACITY.hail,
  );
  hail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hail.frustumCulled = false;
  hail.count = 0;
  scene.add(hail);
  return hail;
}

function createBatches(THREE: typeof ThreeNS, scene: ThreeNS.Scene) {
  const drops = createBatch(THREE, scene, 'rain', CAPACITY.rain),
    flakes = createBatch(THREE, scene, 'snow', CAPACITY.snow),
    wind = createBatch(THREE, scene, 'wind', CAPACITY.wind);
  const splashes = createBatch(THREE, scene, 'splash', CAPACITY.splash),
    caps = createBatch(THREE, scene, 'deposit', CAPACITY.cap),
    beads = createBatch(THREE, scene, 'deposit', CAPACITY.bead),
    trails = createBatch(THREE, scene, 'trail', CAPACITY.trail);
  const hail = createHail(THREE, scene);
  return {
    drops,
    flakes,
    wind,
    hail,
    splashes,
    caps,
    beads,
    trails,
    all: [drops, flakes, wind, hail, splashes, caps, beads, trails],
  };
}
type Batches = ReturnType<typeof createBatches>;

function createAtmosphere(THREE: typeof ThreeNS, scene: ThreeNS.Scene, visible: boolean) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      time: { value: 0 },
      kind: { value: 0 },
      night: { value: 0 },
      strength: { value: 1 },
      aspect: { value: 1 },
      wind: { value: 0 },
      flash: { value: 0 },
    },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = -1;
  mesh.visible = visible;
  scene.add(mesh);
  return { mesh, material };
}

function setColor(mesh: ShapeBatch, uniform: 'color' | 'color2', hex: string) {
  (mesh.material.uniforms[uniform].value as ThreeNS.Color).set(hex);
}

// Pick the day or light-on-dark variant of each particle colour.
function applyPalette(b: Batches, dark: boolean, lightRain: boolean) {
  const lightStreaks = lightRain || dark;
  const pick = (c: { dark: string; day: string }, light: boolean) => (light ? c.dark : c.day);
  setColor(b.drops, 'color', pick(COLORS.rain, lightStreaks));
  setColor(b.splashes, 'color', pick(COLORS.splash, lightStreaks));
  setColor(b.beads, 'color', pick(COLORS.bead, lightStreaks));
  setColor(b.flakes, 'color', pick(COLORS.flake, dark || lightRain));
  setColor(b.flakes, 'color2', pick(COLORS.flakeRim, dark || lightRain));
  setColor(b.trails, 'color', pick(COLORS.trail, dark));
  setColor(b.wind, 'color', pick(COLORS.leaf, dark));
  setColor(b.wind, 'color2', pick(COLORS.leafAutumn, dark));
  setColor(b.caps, 'color', COLORS.cap);
}

function updateAtmosphere(
  material: ThreeNS.ShaderMaterial,
  condition: WeatherCondition,
  dark: boolean,
  time: number,
  state: RenderState,
) {
  const u = material.uniforms;
  const { atmosphere, lightning } = PROFILES[condition];
  u.kind.value = atmosphere.kind;
  u.strength.value = atmosphere.strength;
  // Kind 4 is the broad cloud ceiling, which thins with the reported cloud cover.
  if (state.cloudCover !== undefined && Number.isFinite(state.cloudCover) && u.kind.value === 4)
    u.strength.value *= 0.5 + state.cloudCover / 200;
  u.wind.value = state.wind ?? 0;
  const stormPulse = Math.max(0, Math.sin(((time / 1000) * Math.PI) / (STORM_PERIOD_S / 2)));
  u.flash.value =
    lightning && !state.reduced ? Math.pow(stormPulse, FLASH_SHARPNESS) * FLASH_STRENGTH : 0;
  u.night.value = Number(dark);
  u.time.value = time / 1000;
}

function disposeScene(THREE: typeof ThreeNS, scene: ThreeNS.Scene) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as ThreeNS.Mesh;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      material.dispose();
  });
}

function addSnow(
  instance: InstanceFn,
  flakes: ShapeBatch,
  p: Particle,
  depth: number,
  scale: number,
) {
  // Near flakes are out of focus: larger, softer, fainter.
  const soft =
    depth > FOCUS_NEAR_DEPTH
      ? (depth - FOCUS_NEAR_DEPTH) / FOCUS_NEAR_RANGE
      : depth < FOCUS_FAR_DEPTH
        ? FOCUS_FAR_SOFTNESS
        : 0;
  const size = (2.2 + p.size * 2) * scale * (1 + soft * 0.9);
  instance(
    flakes,
    p.x,
    p.y,
    depth * DEPTH_Z,
    size,
    size,
    0,
    (0.55 + depth * 0.4) * (1 - soft * 0.4),
    soft,
  );
}

function addLeaf(instance: InstanceFn, b: Batches, p: Particle, depth: number, scale: number) {
  // Leaves turn over as they tumble: width follows the flip angle.
  const flip = p.flip ?? p.phase,
    side = 0.5 + 0.5 * Math.cos(flip);
  const length = 17 * scale * (0.18 + 0.82 * Math.abs(Math.cos(flip)));
  instance(b.wind, p.x, p.y, depth * DEPTH_Z, length, 8 * scale, p.phase, 0.92, p.hue ?? 0.3, side);
  // Fast leaves near the camera leave a faint gust line behind them.
  if (depth < 0.3 && Math.abs(p.vx) > 60)
    instance(b.trails, p.x - Math.sign(p.vx) * 70, p.y + 6, 0, 150 * scale, 14, 0, 0.1);
}

function addRain(
  instance: InstanceFn,
  drops: ShapeBatch,
  p: Particle,
  depth: number,
  opts: { drizzle: boolean; exposure: number; light: boolean; narrow: boolean },
) {
  const { drizzle, exposure, light, narrow } = opts;
  // Streak length is the distance a drop covers during a short exposure.
  const length = Math.max(MIN_STREAK, Math.min(MAX_STREAK, Math.hypot(p.vx, p.vy) * exposure));
  const blur = depth > 0.8 ? (depth - 0.8) * 5 : 0;
  const angle = Math.atan2(p.vx, p.vy);
  // Drizzle drops are fine, so each streak is thinner but a little more opaque.
  const opacity =
    (light ? 0.12 + depth * 0.38 : 0.16 + depth * 0.36) * (1 - blur * 0.35) * (drizzle ? 1.15 : 1);
  const shown = drizzle ? Math.max(opacity, narrow ? 0.34 : 0.24) : opacity;
  const thickness = Math.max(
    drizzle && narrow ? 0.85 : 0,
    (0.55 + depth * 0.75) * (1 + blur * 0.8) * (drizzle ? 0.75 : 1),
  );
  instance(
    drops,
    p.x - (Math.sin(angle) * length) / 2,
    p.y - (Math.cos(angle) * length) / 2,
    depth * DEPTH_Z,
    thickness,
    length,
    angle,
    shown,
    blur,
  );
}

interface Overlay {
  THREE: typeof ThreeNS;
  canvas: HTMLCanvasElement;
  renderer: ThreeNS.WebGLRenderer;
  scene: ThreeNS.Scene;
  camera: ThreeNS.OrthographicCamera;
  refraction: ReturnType<typeof createRefractionLayer>;
  batches: Batches;
  atmosphere: ReturnType<typeof createAtmosphere>;
  instance: InstanceFn;
  lightRain: boolean;
  width: number;
  height: number;
  lost: boolean;
  unlisten: () => void;
}

function createOverlay(
  canvas: HTMLCanvasElement,
  THREE: typeof ThreeNS,
  showAtmosphere: boolean,
  pixelRatio: number,
  lightRain: boolean,
): Overlay {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const refraction = createRefractionLayer(scene, THREE);
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000);
  camera.position.z = 500;
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 2));
  const light = new THREE.DirectionalLight(SUN_LIGHT, 2);
  light.position.set(-100, 300, 250);
  scene.add(light);
  const batches = createBatches(THREE, scene);
  const o: Overlay = {
    THREE,
    canvas,
    renderer,
    scene,
    camera,
    refraction,
    batches,
    atmosphere: createAtmosphere(THREE, scene, showAtmosphere),
    instance: () => undefined,
    lightRain,
    width: 1,
    height: 1,
    lost: false,
    unlisten: () => undefined,
  };
  o.instance = createInstancer(THREE, batches.hail, () => o.height);
  return o;
}

// Writes one instance into a batch. Viewport coordinates (CSS pixels, y down)
// map onto the y-up scene.
function createInstancer(
  THREE: typeof ThreeNS,
  hail: ThreeNS.InstancedMesh,
  height: () => number,
): InstanceFn {
  const transform = new THREE.Object3D(),
    tint = new THREE.Color();
  return (mesh, x, y, z, sx, sy, angle, opacity = 1, g = 0, b = 0) => {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    transform.position.set(x, height() - y, z);
    transform.rotation.set(0, 0, angle);
    transform.scale.set(sx, sy, mesh === hail ? sx : 1);
    transform.updateMatrix();
    mesh.setMatrixAt(mesh.count, transform.matrix);
    if (mesh !== hail) {
      tint.setRGB(Math.max(0, Math.min(1, opacity)), g, b);
      mesh.setColorAt(mesh.count, tint);
    }
    mesh.count++;
  };
}

function resize(o: Overlay, w: number, h: number) {
  o.refraction.resize(w, h);
  o.width = w;
  o.height = h;
  o.renderer.setSize(w, h, false);
  o.camera.right = w;
  o.camera.top = h;
  o.camera.updateProjectionMatrix();
  o.atmosphere.mesh.position.set(w / 2, h / 2, -10);
  o.atmosphere.mesh.scale.set(w, h, 1);
  o.atmosphere.material.uniforms.aspect.value = w / h;
}

function begin(
  o: Overlay,
  condition: WeatherCondition,
  dark: boolean,
  time: number,
  state: RenderState,
) {
  o.refraction.update(condition, dark, time, state.reduced);
  o.batches.all.forEach((mesh) => {
    mesh.count = 0;
  });
  applyPalette(o.batches, dark, o.lightRain);
  updateAtmosphere(o.atmosphere.material, condition, dark, time, state);
}

function particle(o: Overlay, p: Particle, condition: WeatherCondition, dark: boolean) {
  const { instance, batches, lightRain } = o;
  const depth = p.depth || 0,
    scale = DEPTH_SCALE_BASE + depth * DEPTH_SCALE_RANGE;
  const { kind, fine, streakExposure } = PROFILES[condition].precipitation;
  if (kind === 'snow') addSnow(instance, batches.flakes, p, depth, scale);
  else if (kind === 'hail')
    instance(batches.hail, p.x, p.y, depth * DEPTH_Z, p.size * scale, p.size * scale, p.phase);
  else if (kind === 'leaves') addLeaf(instance, batches, p, depth, scale);
  else
    addRain(instance, batches.drops, p, depth, {
      drizzle: fine,
      exposure: streakExposure * (lightRain ? 1.5 : 1),
      light: lightRain || dark,
      narrow: o.width < NARROW_WIDTH,
    });
}

// A crown that opens out from the impact, with spray thrown up around it.
function addSplash(o: Overlay, p: Impact) {
  const r = (1 - p.life) * 11 + 2;
  const opacity = Math.min(1, p.life * 1.3) * 0.62;
  o.instance(o.batches.splashes, p.x, p.y, SPLASH_Z, r * 2, r * 0.5, -p.angle, opacity);
}

function addBead(o: Overlay, p: Droplet) {
  const angle = Math.atan2(p.vx, p.vy);
  o.instance(o.batches.beads, p.x, p.y, BEAD_Z, p.size * 2, p.size * 2.6, angle, p.life * 0.75);
}

function addCap(o: Overlay, p: Deposit) {
  const y = p.y - p.size * 0.22;
  o.instance(
    o.batches.caps,
    p.x,
    y,
    SPLASH_Z,
    p.size * 3.6,
    p.size * 1.25,
    -p.angle,
    p.life * 0.95,
  );
}

function render(o: Overlay) {
  if (o.lost) return;
  o.batches.all.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  o.renderer.render(o.scene, o.camera);
}

function listenForContextLoss(
  o: Overlay,
  api: WeatherRenderer,
  onLost?: () => void,
  onRestored?: () => void,
): () => void {
  const { canvas } = o;
  const lose = (event: Event) => {
    event.preventDefault();
    o.lost = true;
    canvas.hidden = true;
    onLost?.();
  };
  const restore = () => {
    o.lost = false;
    canvas.hidden = false;
    o.refraction.invalidate();
    api.resize(o.width, o.height);
    onRestored?.();
  };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);
  return () => {
    canvas.removeEventListener('webglcontextlost', lose);
    canvas.removeEventListener('webglcontextrestored', restore);
  };
}

function buildApi(o: Overlay): WeatherRenderer {
  const { refraction } = o;
  return {
    backend: 'threejs',
    setBackground(source, options) {
      refraction.setBackground(source, options);
    },
    invalidateBackground() {
      refraction.invalidate();
    },
    resize(w, h) {
      resize(o, w, h);
    },
    begin(condition: WeatherCondition, dark: boolean, time: number, state: RenderState = {}) {
      begin(o, condition, dark, time, state);
    },
    particle(p, condition, dark) {
      particle(o, p, condition, dark);
    },
    splash(p) {
      addSplash(o, p);
    },
    droplet(p) {
      addBead(o, p);
    },
    deposit(p) {
      addCap(o, p);
    },
    render() {
      render(o);
    },
    get available() {
      return !o.lost;
    },
    dispose() {
      o.unlisten();
      refraction.dispose();
      disposeScene(o.THREE, o.scene);
      o.renderer.dispose();
    },
  };
}

export function createThreeRenderer(
  canvas: HTMLCanvasElement,
  THREE: typeof ThreeNS,
  {
    pixelRatio = 1,
    onLost,
    onRestored,
    atmosphere: showAtmosphere = true,
    lightRain = false,
  }: ThreeRendererOptions = {},
): WeatherRenderer {
  const o = createOverlay(canvas, THREE, showAtmosphere, pixelRatio, lightRain);
  const api = buildApi(o);
  o.unlisten = listenForContextLoss(o, api, onLost, onRestored);
  return api;
}
