import type { WeatherCondition } from './conditions.js';
import { PROFILES } from './profiles.js';
import type { Particle, Impact, Droplet, Deposit } from './simulation.js';
import type { BackgroundSource, BackgroundOptions } from './refraction.js';

export interface RenderState {
  wind?: number;
  cloudCover?: number;
  reduced?: boolean;
}

/** The contract shared by the Three.js and 2D canvas renderers. */
export interface WeatherRenderer {
  readonly backend: 'threejs' | 'canvas';
  readonly available: boolean;
  resize(width: number, height: number): void;
  begin(condition: WeatherCondition, night: boolean, time: number, state?: RenderState): void;
  particle(p: Particle, condition: WeatherCondition, night: boolean): void;
  splash(impact: Impact): void;
  droplet(drop: Droplet): void;
  deposit(deposit: Deposit): void;
  render(): void;
  setBackground(source: BackgroundSource, options?: BackgroundOptions): void;
  invalidateBackground(): void;
  dispose(): void;
}

type Veil = (typeof PROFILES)[WeatherCondition]['canvasVeil'];

// Veil and particle colours: [day, night].
const FOG_WASH = { day: '#dce3e238', night: '#78898c30' };
const FOG_MIST = { day: '#e0e8e799', night: '#89999e55' };
const CLOUD_TINT = {
  overcast: { day: '#9daebd41', night: '#3b4f6132' },
  heavy: { day: '#9daebd90', night: '#3b4f6170' },
};
const STREAK = { day: '#496c808c', night: '#d5e7f09e' };
const FLAKE = { day: '#78919b85', night: '#f5faf5b0' };
const LEAF = { day: '#7c8b57cc', night: '#a7b48acc' };
// Number of fog banks and how far they sway (fraction of the width).
const MIST_BANKS = 4;
const MIST_SWAY = 0.14;

const tone = (pair: { day: string; night: string }, dark: boolean) =>
  dark ? pair.night : pair.day;

function drawVeil(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dark: boolean,
  veil: Veil,
  time: number,
) {
  if (veil === 'fog') {
    ctx.fillStyle = tone(FOG_WASH, dark);
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < MIST_BANKS; i++) {
      const x = (width * i) / (MIST_BANKS - 1) + Math.sin(time / 10000 + i) * width * MIST_SWAY;
      const mist = ctx.createRadialGradient(x, height * 0.55, 0, x, height * 0.55, width * 0.6);
      mist.addColorStop(0, tone(FOG_MIST, dark));
      mist.addColorStop(1, 'transparent');
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, width, height);
    }
  } else if (veil !== 'none') {
    const clouds = ctx.createLinearGradient(0, 0, 0, height * 0.5);
    clouds.addColorStop(
      0,
      tone(veil === 'overcast' ? CLOUD_TINT.overcast : CLOUD_TINT.heavy, dark),
    );
    clouds.addColorStop(1, 'transparent');
    ctx.fillStyle = clouds;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  condition: WeatherCondition,
  dark: boolean,
) {
  ctx.strokeStyle = tone(STREAK, dark);
  ctx.fillStyle = tone(FLAKE, dark);
  ctx.beginPath();
  const { kind, fine } = PROFILES[condition].precipitation;
  if (kind === 'snow' || kind === 'hail') {
    ctx.arc(p.x, p.y, p.size * (0.5 + p.depth), 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'leaves') {
    ctx.fillStyle = tone(LEAF, dark);
    ctx.ellipse(p.x, p.y, 6, 2.5, p.phase, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = fine ? 0.7 : 1;
    const trail = fine ? 0.03 : 0.025;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * trail, p.y - p.vy * trail);
    ctx.stroke();
  }
}

function drawSplash(ctx: CanvasRenderingContext2D, p: Impact) {
  const r = (1 - p.life) * 8 + 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(100,140,160,${Math.max(0, p.life) * 0.45})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r, r * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDroplet(ctx: CanvasRenderingContext2D, p: Droplet) {
  ctx.fillStyle = `rgba(130,165,185,${Math.max(0, p.life) * 0.65})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawDeposit(ctx: CanvasRenderingContext2D, p: Deposit) {
  ctx.fillStyle = `rgba(240,248,250,${Math.max(0, p.life) * 0.85})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 1, p.size * 1.8, p.size * 0.65, p.angle || 0, 0, Math.PI * 2);
  ctx.fill();
}

// 2D fallback on the caller's canvas: precipitation, splashes and settled
// snow, without refraction or frost. It owns only the 2D context.
export function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  { pixelRatio = 1 }: { pixelRatio?: number } = {},
): WeatherRenderer {
  const ctx = canvas.getContext('2d');
  let width = 1,
    height = 1,
    dark = false;
  return {
    backend: 'canvas',
    setBackground() {
      // The canvas renderer draws no backdrop.
    },
    invalidateBackground() {
      // The canvas renderer draws no backdrop.
    },
    dispose() {
      // Nothing to release.
    },
    resize(w: number, h: number) {
      width = w;
      height = h;
      canvas.width = w * pixelRatio;
      canvas.height = h * pixelRatio;
      ctx?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    },
    begin(condition, night, time) {
      dark = night;
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      drawVeil(ctx, width, height, dark, PROFILES[condition].canvasVeil, time);
    },
    particle(p, condition) {
      if (ctx) drawParticle(ctx, p, condition, dark);
    },
    splash(p) {
      if (ctx) drawSplash(ctx, p);
    },
    droplet(p) {
      if (ctx) drawDroplet(ctx, p);
    },
    deposit(p) {
      if (ctx) drawDeposit(ctx, p);
    },
    render() {
      // Particles are drawn immediately; there is nothing to flush.
    },
    get available() {
      return !!ctx;
    },
  };
}
