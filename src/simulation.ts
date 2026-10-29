import { particleRandom, particleVariant } from './random.js';
import { clamp, windAt, surfaceHit, settleSnow } from './physics.js';
import type { Point, Surface, SurfaceHit, WeatherReading } from './physics.js';
import { isRain, isSnow, hasPrecipitation } from './conditions.js';
import type { WeatherCondition } from './conditions.js';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  depth: number;
  bounced: boolean;
  /** Wind (leaf) particles. */
  flip?: number;
  spin?: number;
  hue?: number;
  /** Snow particles. */
  sway?: number;
  drift?: number;
}

export interface Impact {
  x: number;
  y: number;
  angle: number;
  life: number;
}

export interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
}

export interface Deposit extends SurfaceHit {
  size: number;
  life: number;
}

export interface StepOptions {
  surfaces?: readonly Surface[];
  pointer?: Point | null;
  saveData?: boolean;
}

export interface Simulation {
  readonly condition: WeatherCondition;
  readonly elapsed: number;
  readonly wind: number;
  readonly particles: Particle[];
  readonly impacts: Impact[];
  readonly droplets: Droplet[];
  readonly deposits: Deposit[];
  setCondition(next: WeatherCondition, nextReading?: WeatherReading | null): void;
  resize(w: number, h: number): void;
  clearDeposits(): void;
  reset(nextSeed?: number): void;
  step(dt: number, options?: StepOptions): void;
}

// DOM-free particle state. Positions are CSS pixels in the caller's viewport.
// Given the same seed, surfaces and time steps, the output is deterministic.
export function createSimulation({ seed = 0 }: { seed?: number } = {}): Simulation {
  let serial = seed, width = 1, height = 1, condition: WeatherCondition = 'clear', reading: WeatherReading = {};
  let elapsed = 0, wind = 0;
  let particles: Particle[] = [], impacts: Impact[] = [], droplets: Droplet[] = [], deposits: Deposit[] = [];
  const random = () => particleRandom(++serial);

  function clear() { particles = []; impacts = []; droplets = []; deposits = []; }

  function spawn(initial = false): Particle {
    const snowy = isSnow(condition), windy = condition === 'wind';
    const depth = random(), scale = .45 + depth * 1.15;
    const particle: Particle = {
      x: windy && !initial ? (wind < 0 ? width + 30 : -30) : random() * (width + 240) - 120,
      y: initial || windy ? random() * height : -30,
      vx: wind * scale,
      vy: windy ? 12 : snowy ? (22 + random() * 25) * scale : (condition.includes('drizzle') ? 330 + random() * 90 : 620 + random() * 220) * scale,
      size: snowy ? 1 + random() * 2 : condition === 'hail' ? 2.5 : 1,
      phase: particleVariant(++serial) * Math.PI * 2, depth, bounced: false
    };
    // Each flake sways at its own rhythm; each leaf tumbles at its own rate.
    if (snowy) { particle.sway = .5 + random() * 1.1; particle.drift = (8 + random() * 14) * scale; }
    if (windy) { particle.flip = random() * Math.PI * 2; particle.spin = (1.5 + random() * 3.5) * (random() < .5 ? -1 : 1); particle.hue = random(); }
    return particle;
  }

  // Slow, coherent air movement shared by neighbouring flakes.
  const turbulence = (x: number, y: number, t: number) => Math.sin(x * .011 + t * .37) * Math.cos(y * .009 - t * .23) + .5 * Math.sin((x + y) * .023 + t * .61);

  function splash(hit: SurfaceHit, particle: Particle) {
    impacts.push({ x: hit.x, y: hit.y, angle: hit.angle, life: 1 });
    if (impacts.length > 160) impacts.shift();
    for (let i = 0; i < 3; i++) {
      droplets.push({ x: hit.x, y: hit.y - 1, vx: (i - 1) * (30 + random() * 35) + particle.vx * .12,
        vy: -30 - random() * 65, size: .7 + random() * .6, life: 1 });
    }
    if (droplets.length > 240) droplets.splice(0, droplets.length - 240);
  }

  function targetCount(saveData: boolean) {
    const density = condition === 'wind' ? 55000 : condition === 'snow-showers' ? 5000 : isSnow(condition) ? 7500
      // Drops per pixel area: drizzle is lightest, then rain, then showers and storms.
      : condition.includes('drizzle') ? 6000 : condition === 'showers' ? 3200 : condition === 'thunderstorm' ? 2800 : condition === 'hail' ? 7500 : 4200;
    const intensity = reading.precipitation !== undefined && Number.isFinite(reading.precipitation) ? clamp(.7 + reading.precipitation * .25, .6, 1.6) : 1;
    const cap = isRain(condition) ? 640 : condition === 'wind' ? 30 : isSnow(condition) ? 300 : 240;
    // Drizzle gets a small boost on phones (its streaks are also drawn wider
    // there), kept low enough that it never has more drops than rain.
    const small = condition.includes('drizzle') ? Math.min(1.3, Math.max(1, 760 / Math.max(1, Math.min(width, height)))) : 1;
    return Math.min(cap, Math.round(width * height / density * intensity * small * (saveData ? .5 : 1)));
  }

  // dt of 0 keeps a static scene: particles are filled but do not move.
  function step(dt: number, { surfaces = [], pointer, saveData = false }: StepOptions = {}) {
    elapsed += dt;
    wind = windAt(reading, condition, elapsed);
    const moving = dt > 0, snowy = isSnow(condition), rainy = isRain(condition);
    if (hasPrecipitation(condition)) {
      const count = targetCount(saveData);
      if (particles.length > count) particles.length = count;
      while (particles.length < count) particles.push(spawn(true));
      if (moving) for (let i = 0; i < particles.length; i++) {
        const p = particles[i] as Particle, oldX = p.x, oldY = p.y;
        if (!p.bounced) p.vx += (wind * (.45 + p.depth * 1.15) - p.vx) * Math.min(1, dt * 2);
        // A passing pointer stirs nearby flakes and leaves.
        if (snowy || condition === 'wind') {
          if (pointer) {
            const dx = p.x - pointer.x, dy = p.y - pointer.y, distance = Math.hypot(dx, dy);
            if (distance > 1 && distance < 90) p.vx += dx / distance * (1 - distance / 90) * dt * 220;
          }
          if (snowy) p.phase += dt * (p.sway ?? 0);
        }
        if (snowy) {
          const swing = Math.cos(p.phase) * (p.drift ?? 0) + turbulence(p.x, p.y, elapsed) * 16 * (.4 + p.depth);
          p.x += (p.vx + swing) * dt;
          // Flakes flutter: fall speed rises and falls as they rock.
          p.y += p.vy * (1 + .3 * Math.sin(p.phase * 1.7)) * dt;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        if (condition === 'wind') {
          // Leaves rise and fall on eddies and spin faster in stronger gusts.
          p.y += (Math.sin(elapsed * 1.6 + p.phase * 3) * 34 + Math.sin(p.flip ?? 0) * 18) * dt;
          const gust = Math.min(2.5, Math.abs(p.vx) / 80);
          const spin = p.spin ?? 0;
          p.phase += dt * spin * .45 * (.5 + gust);
          p.flip = (p.flip ?? 0) + dt * spin * (.6 + gust);
        }
        if (p.bounced) p.vy += dt * 500;
        // On narrow screens only near rain reaches the room, so it stays readable.
        const includeRoom = width > 760 || !rainy || p.depth < .35;
        const hit = condition !== 'wind' && !p.bounced ? surfaceHit(oldX, oldY, p.x, p.y, surfaces, includeRoom) : undefined;
        if (hit) {
          if (snowy) settleSnow(deposits, hit, p.size);
          // Distant drops land too small to see a splash.
          else if (p.depth > .2 || condition === 'hail') splash(hit, p);
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
    setCondition(next: WeatherCondition, nextReading: WeatherReading | null = {}) {
      if (next !== condition) { particles = []; impacts = []; droplets = []; }
      condition = next; reading = nextReading || {};
      wind = windAt(reading, condition, elapsed);
    },
    // A height-only change (a mobile address bar showing or hiding) keeps the
    // particles; a new width redistributes them.
    resize(w: number, h: number) { const sameWidth = w === width; width = w; height = h; if (!sameWidth) clear(); },
    clearDeposits() { deposits = []; },
    reset(nextSeed: number = seed) { seed = nextSeed; serial = nextSeed; elapsed = 0; clear(); wind = windAt(reading, condition, 0); },
    step
  };
}
