import { createSimulation } from './simulation.js';
import { createThreeRenderer } from './three-renderer.js';
import { createCanvasRenderer } from './canvas-renderer.js';
import { createSkyRenderer } from './sky.js';
import { isCondition } from './conditions.js';

export { CONDITIONS, isCondition, isRain, isSnow, isFrozen, hasPrecipitation } from './conditions.js';
export { createSimulation } from './simulation.js';
export { windAt, surfaceHit, settleSnow } from './physics.js';
export { hash32, particleRandom, particleVariant } from './random.js';

const FRAME = 1000 / 30;

/**
 * Transparent weather layer drawn into `canvas`. Pass the Three.js module as
 * `THREE` for the WebGL renderer; without it, or without WebGL, a 2D canvas
 * fallback is used. When WebGL fails on the given canvas, a fresh canvas
 * replaces it in the DOM; read `effects.canvas` for the element in use.
 *
 * Pass `skyCanvas` (placed behind the page content) for an opaque sky with
 * stars, clouds and fog. Without it, the layer is transparent and tints the
 * page instead.
 */
export function createWeatherEffects({
  canvas, skyCanvas, THREE, seed = 0, autoplay = true,
  pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2),
  reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
  saveData = globalThis.navigator?.connection?.saveData === true
} = {}) {
  if (!canvas) throw new TypeError('createWeatherEffects requires a canvas');
  const simulation = createSimulation({ seed });
  let renderer, night = false, reading = {}, surfaces = [], surfaceSource = null, surfacesDirty = false;
  let pointer = null, playing = autoplay, disposed = false, frame = 0, last = 0, width = 1, height = 1;

  if (THREE) {
    try {
      renderer = createThreeRenderer(canvas, THREE, { pixelRatio, sky: !!skyCanvas, onRestored: () => { invalidate(); restart(); } });
    } catch { /* fall through to 2D */ }
  }
  if (!renderer) {
    // A canvas that refused a WebGL context cannot hand out a 2D one.
    if (THREE && canvas.parentNode) {
      const replacement = canvas.ownerDocument.createElement('canvas');
      replacement.className = canvas.className;
      for (const name of ['aria-hidden', 'role']) if (canvas.hasAttribute(name)) replacement.setAttribute(name, canvas.getAttribute(name));
      canvas.replaceWith(replacement);
      canvas = replacement;
    }
    renderer = createCanvasRenderer(canvas, { pixelRatio });
  }
  canvas.dataset.renderer = renderer.backend;
  // Clouds are soft, so the sky renders at CSS pixel density at most.
  const sky = skyCanvas ? createSkyRenderer(skyCanvas, { pixelRatio: Math.min(pixelRatio, 1.5), onRestored: () => restart() }) : null;
  if (sky) skyCanvas.dataset.renderer = sky.backend;
  let skyTime = -1;

  const reduced = () => reducedMotion?.matches === true;
  const isStatic = () => !playing || reduced();
  const hidden = () => globalThis.document?.hidden === true;

  function readSurfaces() {
    if (surfacesDirty) { surfaces = (typeof surfaceSource === 'function' ? surfaceSource() : surfaceSource) || []; surfacesDirty = false; }
    return surfaces;
  }

  function paint() {
    const condition = simulation.condition;
    if (sky) {
      const time = simulation.elapsed, dt = skyTime < 0 || isStatic() ? 0 : Math.max(0, time - skyTime);
      skyTime = time;
      const pulse = Math.max(0, Math.sin(time * Math.PI / 9));
      const flash = condition === 'thunderstorm' && !isStatic() ? Math.pow(pulse, 100) * .8 : 0;
      sky.render({ condition, night, time, dt, wind: simulation.wind, cloudCover: reading.cloudCover, flash });
    }
    renderer.begin(condition, night, simulation.elapsed * 1000, { wind: simulation.wind, cloudCover: reading.cloudCover, reduced: isStatic() });
    for (const p of simulation.particles) renderer.particle(p, condition, night);
    for (const impact of simulation.impacts) renderer.splash(impact);
    for (const drop of simulation.droplets) renderer.droplet(drop);
    for (const deposit of simulation.deposits) renderer.deposit(deposit);
    renderer.render();
  }

  function draw(time) {
    frame = 0;
    if (disposed || hidden() || !renderer.available) { last = 0; return; }
    const still = isStatic();
    if (!still && last && time - last < FRAME) { frame = requestAnimationFrame(draw); return; }
    const dt = still ? 0 : Math.min((time - (last || time)) / 1000, .04);
    last = time;
    simulation.step(dt, { surfaces: readSurfaces(), pointer, saveData });
    paint();
    if (!still) frame = requestAnimationFrame(draw);
  }

  function restart() {
    if (disposed) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0; last = 0;
    draw(performance.now());
  }

  // Re-read surfaces and background before the next frame; redraw if static.
  function invalidate({ clearDeposits = false } = {}) {
    surfacesDirty = true;
    renderer.invalidateBackground();
    if (clearDeposits) simulation.clearDeposits();
    if (!frame) restart();
  }

  const onVisibility = () => restart();
  globalThis.document?.addEventListener('visibilitychange', onVisibility);
  reducedMotion?.addEventListener?.('change', restart);

  const api = {
    get canvas() { return canvas; },
    get backend() { return renderer.backend; },
    get skyBackend() { return sky?.backend ?? null; },
    get playing() { return playing; },
    get condition() { return simulation.condition; },
    get time() { return simulation.elapsed; },
    get simulation() { return simulation; },
    /** condition: one of CONDITIONS. reading: optional wind/precipitation/cloud values. */
    setWeather(condition, { night: isNight = night, reading: nextReading = {} } = {}) {
      if (!isCondition(condition)) throw new RangeError(`Unknown weather condition: ${condition}`);
      night = !!isNight; reading = nextReading || {};
      simulation.setCondition(condition, reading);
      restart();
    },
    /** Line segments or polygons ({ points: [{x,y}...], room?, visible?() }), or a function returning them. */
    setSurfaces(source, { clearDeposits = true } = {}) { surfaceSource = source; invalidate({ clearDeposits }); },
    /** Drawable or paint function used for droplet refraction; null removes it. */
    setBackground(source) { renderer.setBackground(source); invalidate(); },
    setPointer(x, y) { pointer = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null; },
    invalidate,
    play() { playing = true; restart(); },
    pause() { playing = false; restart(); },
    /** Deterministic: replay from the seed at a fixed 30 fps step, then draw that frame. */
    seek(seconds) {
      if (!(seconds >= 0)) throw new RangeError('seek expects a non-negative number of seconds');
      const condition = simulation.condition;
      simulation.reset(seed);
      simulation.setCondition(condition, reading);
      const steps = Math.round(seconds * 30), options = { surfaces: readSurfaces(), pointer: null, saveData };
      simulation.step(0, options);
      for (let i = 0; i < steps; i++) simulation.step(1 / 30, options);
      skyTime = -1;
      if (renderer.available) paint();
    },
    resize(w, h) {
      if (!(w > 0 && h > 0)) throw new RangeError('resize expects positive dimensions');
      width = w; height = h;
      renderer.resize(w, h);
      sky?.resize(w, h);
      simulation.resize(w, h);
      invalidate();
      restart();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      globalThis.document?.removeEventListener('visibilitychange', onVisibility);
      reducedMotion?.removeEventListener?.('change', restart);
      renderer.dispose();
      sky?.dispose();
    }
  };
  api.resize(Math.max(1, canvas.clientWidth || width), Math.max(1, canvas.clientHeight || height));
  return api;
}
