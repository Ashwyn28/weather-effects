import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32, particleRandom, particleVariant } from '../dist/random.js';
import { surfaceHit, settleSnow, windAt } from '../dist/physics.js';
import { CONDITIONS, isCondition } from '../dist/conditions.js';

test('particle randomness is deterministic, bounded, uniform and wraps uint32 seeds', () => {
  assert.equal(hash32(0), 0);
  assert.equal(particleRandom(12345), particleRandom(12345));
  assert.notEqual(particleRandom(1), particleRandom(2));
  assert.equal(particleRandom(2 ** 32 + 5), particleRandom(5));
  const bins = new Array(10).fill(0);
  for (let seed = 0; seed < 100000; seed++) {
    const value = particleRandom(seed);
    assert.ok(value >= 0 && value < 1);
    bins[Math.floor(value * 10)]++;
  }
  for (const count of bins) assert.ok(Math.abs(count - 10000) < 500, `bin count ${count}`);
  for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
    assert.ok(
      [0.0625, 0.1875, 0.3125, 0.4375, 0.5625, 0.6875, 0.8125, 0.9375].includes(
        particleVariant(seed),
      ),
    );
    assert.ok([0.125, 0.375, 0.625, 0.875].includes(particleVariant(seed, 4)));
  }
});

test('fast particles hit the nearest surface regardless of surface ordering', () => {
  const desk = {
    room: true,
    points: [
      { x: 0, y: 30 },
      { x: 100, y: 30 },
    ],
  };
  const title = {
    room: false,
    points: [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
    ],
  };
  const hit = surfaceHit(50, 0, 50, 80, [desk, title]);
  assert.equal(hit.surface, title);
  assert.equal(hit.y, 10);
  assert.equal(surfaceHit(5, 0, 5, 80, [desk, title], false), undefined);
  assert.equal(surfaceHit(110, 0, 110, 80, [desk, title]), undefined);
  assert.equal(surfaceHit(50, 0, 60, 0, [desk, title]), undefined);
});

test('snow coalesces on the same surface, stays bounded and does not join other surfaces', () => {
  const deposits = [],
    surface = {};
  for (let i = 0; i < 50; i++) settleSnow(deposits, { x: 10, y: 20, angle: 0, surface }, 2);
  assert.equal(deposits.length, 1);
  assert.equal(deposits[0].size, 8);
  settleSnow(deposits, { x: 10, y: 20, angle: 0, surface: {} }, 2);
  assert.equal(deposits.length, 2);
  for (let i = 0; i < 600; i++) settleSnow(deposits, { x: i * 20, y: 20, angle: 0, surface }, 2);
  assert.equal(deposits.length, 450);
});

test('live wind direction moves precipitation correctly and conditions are validated', () => {
  assert.ok(windAt({ windSpeed: 30, windDirection: 90 }, 'rain', 0) < 0);
  assert.ok(windAt({ windSpeed: 30, windDirection: 270 }, 'snow', 0) > 0);
  assert.equal(windAt({ windSpeed: 0, windGust: 0 }, 'rain', 0), 0);
  assert.ok(CONDITIONS.every(isCondition));
  assert.equal(isCondition('sleet'), false);
});

test('simulation is deterministic for a seed and lands rain on supplied surfaces', async () => {
  const { createSimulation } = await import('../dist/simulation.js');
  const shelf = {
    points: [
      { x: 0, y: 300 },
      { x: 800, y: 300 },
    ],
  };
  const run = (seed) => {
    const sim = createSimulation({ seed });
    sim.resize(800, 600);
    sim.setCondition('rain', { windSpeed: 0, windGust: 0 });
    for (let i = 0; i < 90; i++) sim.step(1 / 30, { surfaces: [shelf] });
    return sim;
  };
  const a = run(7),
    b = run(7),
    c = run(8);
  assert.deepEqual(a.particles, b.particles);
  assert.notDeepEqual(a.particles, c.particles);
  assert.ok(a.particles.length > 0 && a.particles.length <= 450);
  assert.ok(a.impacts.length > 0, 'rain splashes on the shelf');
});

test('snow settles on visible surfaces only and static steps do not move particles', async () => {
  const { createSimulation } = await import('../dist/simulation.js');
  const sim = createSimulation({ seed: 3 });
  let shown = true;
  const desk = {
    points: [
      { x: 0, y: 200 },
      { x: 400, y: 200 },
    ],
    visible: () => shown,
  };
  sim.resize(400, 400);
  sim.setCondition('snow');
  for (let i = 0; i < 600; i++) sim.step(1 / 30, { surfaces: [desk] });
  assert.ok(sim.deposits.length > 0);
  const before = JSON.stringify(sim.particles);
  sim.step(0, { surfaces: [desk] });
  assert.equal(JSON.stringify(sim.particles), before);
  shown = false;
  sim.step(0, { surfaces: [desk] });
  assert.equal(sim.deposits.length, 0);
  sim.setCondition('clear');
  sim.step(1 / 30);
  assert.equal(sim.particles.length, 0);
});

test('effects API drives the canvas fallback, seeks deterministically and validates input', async () => {
  const { createWeatherEffects, CONDITIONS } = await import('../dist/index.js');
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'createRadialGradient' || key === 'createLinearGradient'
          ? () => ({ addColorStop() {} })
          : () => calls.push(key),
      set: () => true,
    },
  );
  const canvas = { dataset: {}, clientWidth: 320, clientHeight: 240, getContext: () => ctx };
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const effects = createWeatherEffects({ canvas, autoplay: false, seed: 5 });
    assert.equal(effects.backend, 'canvas');
    assert.equal(canvas.dataset.renderer, 'canvas');
    assert.equal(CONDITIONS.length, 15);
    assert.throws(
      () => effects.setWeather('sleet'),
      new RangeError(
        `Unknown weather condition "sleet". Expected one of: ${CONDITIONS.join(', ')}`,
      ),
    );
    assert.throws(
      () => effects.resize(0, 10),
      new RangeError('resize: "widthPx" and "heightPx" must be numbers > 0. Received 0 and 10.'),
    );
    assert.throws(
      () => createWeatherEffects({ canvas, backdropStyle: 'full' }),
      new RangeError(
        'createWeatherEffects: option "backdropStyle" must be one of: clouds, sky. Received "full".',
      ),
    );
    assert.throws(
      () => createWeatherEffects({}),
      new TypeError(
        'createWeatherEffects: option "canvas" is required. Expected an HTMLCanvasElement.',
      ),
    );
    effects.setWeather('snow', { night: true });
    effects.seek(2);
    const first = JSON.stringify(effects.simulation.particles);
    effects.seek(2);
    assert.equal(JSON.stringify(effects.simulation.particles), first);
    assert.ok(calls.includes('arc'));
    assert.throws(
      () => effects.seek(-1),
      new RangeError('seek: "seconds" must be a number >= 0. Received -1.'),
    );
    effects.dispose();
  } finally {
    globalThis.requestAnimationFrame = raf;
  }
});

test('backdrop falls back to 2D without WebGL2: full style paints a gradient, clouds style stays clear', async () => {
  const { createWeatherEffects } = await import('../dist/index.js');
  const fills = [],
    clears = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'createLinearGradient' || key === 'createRadialGradient'
          ? () => ({ addColorStop: (_, c) => fills.push(c) })
          : key === 'clearRect'
            ? () => clears.push(1)
            : () => {},
      set: () => true,
    },
  );
  const canvas = () => ({
    dataset: {},
    clientWidth: 200,
    clientHeight: 100,
    getContext: (type) => (type === '2d' ? ctx : null),
  });
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const full = createWeatherEffects({
      canvas: canvas(),
      backdropCanvas: canvas(),
      backdropStyle: 'sky',
      autoplay: false,
    });
    assert.equal(full.backdropBackend, 'canvas');
    fills.length = 0;
    full.setWeather('clear', { night: true });
    assert.ok(fills.includes('#11142e'));
    fills.length = 0;
    full.setWeather('rain', { night: false });
    assert.ok(fills.includes('#3d4955'));
    full.dispose();
    const clouds = createWeatherEffects({
      canvas: canvas(),
      backdropCanvas: canvas(),
      autoplay: false,
    });
    fills.length = 0;
    clears.length = 0;
    clouds.setWeather('rain');
    assert.ok(clears.length > 0);
    assert.ok(!fills.includes('#3d4955'));
    clouds.dispose();
  } finally {
    globalThis.requestAnimationFrame = raf;
  }
});

test('every condition has a complete profile', async () => {
  const { PROFILES } = await import('../dist/profiles.js');
  const kinds = ['rain', 'snow', 'hail', 'leaves', 'none'];
  assert.deepEqual(Object.keys(PROFILES).sort(), [...CONDITIONS].sort());
  for (const id of CONDITIONS) {
    const { precipitation, sky, glass, atmosphere, canvasVeil, lightning } = PROFILES[id];
    assert.ok(kinds.includes(precipitation.kind), id);
    for (const n of [precipitation.density, precipitation.cap, precipitation.streakExposure])
      assert.ok(n > 0, id);
    assert.ok(precipitation.fall.base > 0 && precipitation.fall.range >= 0, id);
    assert.equal(typeof precipitation.fine, 'boolean');
    assert.ok(Number.isFinite(precipitation.wind), id);
    assert.equal(typeof sky.palette, 'string', id);
    for (const n of [sky.coverage, sky.wispy, sky.stars, sky.mist, sky.sun, sky.reach, sky.drift])
      assert.ok(Number.isFinite(n), id);
    for (const n of [glass.frost, glass.density, glass.stillDensity, glass.refractionDensity])
      assert.ok(Number.isFinite(n), id);
    assert.ok(glass.dropScale > 0, id);
    assert.ok(Number.isFinite(atmosphere.kind) && atmosphere.strength > 0, id);
    assert.ok(['none', 'fog', 'overcast', 'clouds'].includes(canvasVeil), id);
    assert.equal(typeof lightning, 'boolean');
  }
  assert.ok(Object.isFrozen(PROFILES));
});

test('particle counts per condition are pinned at phone and desktop sizes', async () => {
  const { createSimulation } = await import('../dist/simulation.js');
  const expected = {
    drizzle: [71, 160],
    'freezing-drizzle': [71, 160],
    rain: [78, 229],
    'freezing-rain': [78, 229],
    showers: [103, 300],
    thunderstorm: [118, 343],
    snow: [44, 128],
    'snow-showers': [66, 192],
    hail: [44, 128],
    wind: [6, 17],
  };
  for (const id of CONDITIONS) {
    const counts = [
      [390, 844],
      [1200, 800],
    ].map(([w, h]) => {
      const sim = createSimulation({ seed: 1 });
      sim.resize(w, h);
      sim.setCondition(id, {});
      sim.step(1 / 60);
      return sim.particles.length;
    });
    assert.deepEqual(counts, expected[id] ?? [0, 0], id);
  }
});

test('main entry exports only the public API; advanced holds the rest', async () => {
  const main = await import('../dist/index.js');
  assert.deepEqual(Object.keys(main).sort(), [
    'CONDITIONS',
    'attachWeather',
    'createGlassDroplets',
    'createWeatherEffects',
    'isCondition',
  ]);
  const advanced = await import('../dist/advanced.js');
  assert.deepEqual(Object.keys(advanced).sort(), [
    'createSimulation',
    'hasPrecipitation',
    'hash32',
    'isFrozen',
    'isRain',
    'isSnow',
    'particleRandom',
    'particleVariant',
    'settleSnow',
    'surfaceHit',
    'windAt',
  ]);
});
