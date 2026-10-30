import type { WeatherCondition } from './conditions.js';
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

// 2D fallback: precipitation, splashes and settled snow, without refraction or frost.
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
      if (condition === 'fog') {
        ctx.fillStyle = dark ? '#78898c30' : '#dce3e238';
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 4; i++) {
          const x = (width * i) / 3 + Math.sin(time / 10000 + i) * width * 0.14;
          const mist = ctx.createRadialGradient(x, height * 0.55, 0, x, height * 0.55, width * 0.6);
          mist.addColorStop(0, dark ? '#89999e55' : '#e0e8e799');
          mist.addColorStop(1, 'transparent');
          ctx.fillStyle = mist;
          ctx.fillRect(0, 0, width, height);
        }
      } else if (
        ['overcast', 'thunderstorm', 'hail', 'wind', 'partly-cloudy'].includes(condition)
      ) {
        const clouds = ctx.createLinearGradient(0, 0, 0, height * 0.5);
        clouds.addColorStop(
          0,
          condition === 'overcast'
            ? dark
              ? '#3b4f6132'
              : '#9daebd41'
            : dark
              ? '#3b4f6170'
              : '#9daebd90',
        );
        clouds.addColorStop(1, 'transparent');
        ctx.fillStyle = clouds;
        ctx.fillRect(0, 0, width, height);
      }
    },
    particle(p, condition) {
      if (!ctx) return;
      ctx.strokeStyle = dark ? '#d5e7f09e' : '#496c808c';
      ctx.fillStyle = dark ? '#f5faf5b0' : '#78919b85';
      ctx.beginPath();
      if (['snow', 'snow-showers', 'hail'].includes(condition)) {
        ctx.arc(p.x, p.y, p.size * (0.5 + p.depth), 0, Math.PI * 2);
        ctx.fill();
      } else if (condition === 'wind') {
        ctx.fillStyle = dark ? '#a7b48acc' : '#7c8b57cc';
        ctx.ellipse(p.x, p.y, 6, 2.5, p.phase, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = condition.includes('drizzle') ? 0.7 : 1;
        const trail = condition.includes('drizzle') ? 0.03 : 0.025;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * trail, p.y - p.vy * trail);
        ctx.stroke();
      }
    },
    splash(p) {
      if (!ctx) return;
      const r = (1 - p.life) * 8 + 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(100,140,160,${Math.max(0, p.life) * 0.45})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
    droplet(p) {
      if (!ctx) return;
      ctx.fillStyle = `rgba(130,165,185,${Math.max(0, p.life) * 0.65})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    },
    deposit(p) {
      if (!ctx) return;
      ctx.fillStyle = `rgba(240,248,250,${Math.max(0, p.life) * 0.85})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1, p.size * 1.8, p.size * 0.65, p.angle || 0, 0, Math.PI * 2);
      ctx.fill();
    },
    render() {
      // Particles are drawn immediately; there is nothing to flush.
    },
    get available() {
      return !!ctx;
    },
  };
}
