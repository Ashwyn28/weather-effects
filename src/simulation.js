import { particleRandom, particleVariant } from './random.js';
import { clamp, windAt, surfaceHit, settleSnow } from './physics.js';
import { isRain, isSnow, hasPrecipitation } from './conditions.js';

// DOM-free particle state. Positions are CSS pixels in the caller's viewport.
// Given the same seed, surfaces and time steps, the output is deterministic.
export function createSimulation({ seed = 0 } = {}) {
  let serial = seed, width = 1, height = 1, condition = 'clear', reading = {};
  let elapsed = 0, wind = 0;
  let particles = [], impacts = [], droplets = [], deposits = [];
  const random = () => particleRandom(++serial);

  function clear() { particles = []; impacts = []; droplets = []; deposits = []; }

  function spawn(initial = false) {
    const snowy = isSnow(condition), windy = condition === 'wind';
    const depth = random(), scale = .45 + depth * 1.15;
    return {
      x: windy && !initial ? (wind < 0 ? width + 30 : -30) : random() * (width + 240) - 120,
      y: initial || windy ? random() * height : -30,
      vx: wind * scale,
      vy: windy ? 12 : snowy ? (22 + random() * 25) * scale : (condition.includes('drizzle') ? 210 : 620 + random() * 220) * scale,
      size: snowy ? 1 + random() * 2 : condition === 'hail' ? 2.5 : 1,
      phase: particleVariant(++serial) * Math.PI * 2, depth, bounced: false
    };
  }

  function splash(hit, particle) {
    impacts.push({ x: hit.x, y: hit.y, angle: hit.angle, life: 1 });
    if (impacts.length > 160) impacts.shift();
    for (let i = 0; i < 3; i++) {
      droplets.push({ x: hit.x, y: hit.y - 1, vx: (i - 1) * (25 + random() * 30) + particle.vx * .12,
        vy: -30 - random() * 65, size: .7 + random() * .6, life: 1 });
    }
    if (droplets.length > 240) droplets.splice(0, droplets.length - 240);
  }

  function targetCount(saveData) {
    const density = condition === 'wind' ? 80000 : condition === 'snow-showers' ? 7000 : isSnow(condition) ? 11000
      : condition.includes('drizzle') ? 11000 : ['showers', 'thunderstorm'].includes(condition) ? 5500 : 7500;
    const intensity = Number.isFinite(reading.precipitation) ? clamp(.7 + reading.precipitation * .25, .6, 1.6) : 1;
    const cap = isRain(condition) ? 450 : condition === 'wind' ? 22 : 240;
    return Math.min(cap, Math.round(width * height / density * intensity * (saveData ? .5 : 1)));
  }

  // dt of 0 keeps a static scene: particles are filled but do not move.
  function step(dt, { surfaces = [], pointer, saveData = false } = {}) {
    elapsed += dt;
    wind = windAt(reading, condition, elapsed);
    const moving = dt > 0, snowy = isSnow(condition), rainy = isRain(condition);
    if (hasPrecipitation(condition)) {
      const count = targetCount(saveData);
      if (particles.length > count) particles.length = count;
      while (particles.length < count) particles.push(spawn(true));
      if (moving) for (let i = 0; i < particles.length; i++) {
        const p = particles[i], oldX = p.x, oldY = p.y;
        if (!p.bounced) p.vx += (wind * (.45 + p.depth * 1.15) - p.vx) * Math.min(1, dt * 2);
        // A passing pointer stirs nearby flakes and leaves.
        if (snowy || condition === 'wind') {
          if (pointer) {
            const dx = p.x - pointer.x, dy = p.y - pointer.y, distance = Math.hypot(dx, dy);
            if (distance > 1 && distance < 90) p.vx += dx / distance * (1 - distance / 90) * dt * 220;
          }
          p.phase += dt * (.2 + p.depth * .5);
        }
        p.x += p.vx * dt + (snowy ? Math.sin(elapsed * 1.2 + p.phase) * dt * 18 : 0);
        p.y += p.vy * dt;
        if (condition === 'wind') { p.y += Math.sin(elapsed * 1.6 + p.phase) * dt * 28; p.phase += dt * 1.5; }
        if (p.bounced) p.vy += dt * 500;
        // On narrow screens only near rain reaches the room, so it stays readable.
        const includeRoom = width > 760 || !rainy || p.depth < .35;
        const hit = condition !== 'wind' && !p.bounced && surfaceHit(oldX, oldY, p.x, p.y, surfaces, includeRoom);
        if (hit) {
          if (snowy) settleSnow(deposits, hit, p.size);
          else splash(hit, p);
          if (condition === 'hail') { p.x = hit.x; p.y = hit.y - 2; p.vy = -90; p.vx *= -.4; p.bounced = true; }
          else { particles[i] = spawn(); continue; }
        }
        if (p.y > height + 30 || (p.x < -140 && p.vx <= 0) || (p.x > width + 140 && p.vx >= 0)) particles[i] = spawn();
      }
    }
    impacts = impacts.filter(impact => (impact.life -= dt * 2.5) > 0);
    droplets = droplets.filter(drop => {
      drop.life = Math.max(0, drop.life - dt * 2);
      drop.x += drop.vx * dt; drop.y += drop.vy * dt; drop.vy += 280 * dt;
      return drop.life > 0;
    });
    const melt = snowy ? .003 : rainy ? .16 : .045;
    deposits = deposits.filter(deposit => {
      deposit.life = Math.max(0, deposit.life - dt * melt);
      return deposit.life > 0 && (deposit.surface.visible?.() ?? true);
    });
  }

  return {
    get condition() { return condition; },
    get elapsed() { return elapsed; },
    get wind() { return wind; },
    get particles() { return particles; },
    get impacts() { return impacts; },
    get droplets() { return droplets; },
    get deposits() { return deposits; },
    setCondition(next, nextReading = {}) {
      if (next !== condition) { particles = []; impacts = []; droplets = []; }
      condition = next; reading = nextReading || {};
      wind = windAt(reading, condition, elapsed);
    },
    resize(w, h) { width = w; height = h; clear(); },
    clearDeposits() { deposits = []; },
    reset(nextSeed = seed) { seed = nextSeed; serial = nextSeed; elapsed = 0; clear(); wind = windAt(reading, condition, 0); },
    step
  };
}
