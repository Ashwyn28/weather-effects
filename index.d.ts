export type WeatherCondition =
  | 'clear' | 'mainly-clear' | 'partly-cloudy' | 'overcast' | 'fog'
  | 'drizzle' | 'freezing-drizzle' | 'rain' | 'freezing-rain' | 'showers'
  | 'snow' | 'snow-showers' | 'thunderstorm' | 'hail' | 'wind';

export const CONDITIONS: readonly WeatherCondition[];
export function isCondition(id: string): id is WeatherCondition;
export function isRain(id: string): boolean;
export function isSnow(id: string): boolean;
export function isFrozen(id: string): boolean;
export function hasPrecipitation(id: string): boolean;

/** Optional live readings. Wind in km/h, direction in degrees (where it comes from). */
export interface WeatherReading {
  windSpeed?: number;
  windGust?: number;
  windDirection?: number;
  /** mm/h; scales particle density. */
  precipitation?: number;
  /** Percent; scales the cloud ceiling. */
  cloudCover?: number;
}

export interface Point { x: number; y: number; }

/** Two points form a ledge; more form a closed polygon. Coordinates are CSS pixels in the canvas viewport. */
export interface Surface {
  points: Point[];
  /** Room surfaces are skipped by distant rain on narrow (≤760px) viewports. */
  room?: boolean;
  /** Settled snow on this surface is removed once this returns false. */
  visible?: () => boolean;
}

export type SurfaceSource = Surface[] | (() => Surface[]) | null;

export interface BackgroundInfo { width: number; height: number; night: boolean; }
/** Paint in CSS pixels. Transparent areas receive no droplets or frost. */
export type BackgroundPainter = (ctx: CanvasRenderingContext2D, info: BackgroundInfo) => { color?: string } | void;
export type BackgroundSource = CanvasImageSource | BackgroundPainter | null;

export interface WeatherEffectsOptions {
  /** Transparent overlay above the content (pointer-events: none). */
  canvas: HTMLCanvasElement;
  /**
   * Optional canvas behind the content. When given, an opaque sky is drawn
   * there (gradient, stars, wisps, heavy clouds, fog, sun glow, lightning),
   * rain becomes long light streaks, and the overlay no longer tints the page.
   */
  skyCanvas?: HTMLCanvasElement;
  /** The `three` module namespace. Omit to use the 2D fallback. */
  THREE?: typeof import('three');
  /** Seed for particle randomness. Default 0. */
  seed?: number;
  /** Default true. */
  autoplay?: boolean;
  /** Default min(devicePixelRatio, 2). */
  pixelRatio?: number;
  /** Default matchMedia('(prefers-reduced-motion: reduce)'). Pass null to ignore. */
  reducedMotion?: MediaQueryList | { matches: boolean } | null;
  /** Halves particle counts. Default navigator.connection.saveData. */
  saveData?: boolean;
}

export interface Simulation {
  readonly condition: WeatherCondition;
  readonly elapsed: number;
  readonly wind: number;
  readonly particles: ReadonlyArray<{ x: number; y: number; vx: number; vy: number; size: number; phase: number; depth: number; bounced: boolean }>;
  readonly impacts: ReadonlyArray<{ x: number; y: number; angle: number; life: number }>;
  readonly droplets: ReadonlyArray<{ x: number; y: number; vx: number; vy: number; size: number; life: number }>;
  readonly deposits: ReadonlyArray<{ x: number; y: number; angle: number; size: number; life: number; surface: Surface }>;
  setCondition(condition: WeatherCondition, reading?: WeatherReading): void;
  resize(width: number, height: number): void;
  clearDeposits(): void;
  reset(seed?: number): void;
  step(dt: number, options?: { surfaces?: Surface[]; pointer?: Point | null; saveData?: boolean }): void;
}

export interface WeatherEffects {
  /** The canvas in use. Differs from the one passed when WebGL failed and a fallback canvas replaced it. */
  readonly canvas: HTMLCanvasElement;
  readonly backend: 'threejs' | 'canvas';
  /** null without skyCanvas. */
  readonly skyBackend: 'webgl2' | 'canvas' | null;
  readonly playing: boolean;
  readonly condition: WeatherCondition;
  /** Simulated seconds. */
  readonly time: number;
  readonly simulation: Simulation;
  setWeather(condition: WeatherCondition, options?: { night?: boolean; reading?: WeatherReading }): void;
  /** Functions are called lazily, at most once per frame after invalidate(). Clears settled snow by default. */
  setSurfaces(source: SurfaceSource, options?: { clearDeposits?: boolean }): void;
  /** Used for droplet refraction and frost (WebGL only). Functions are repainted after invalidate() or a weather change. */
  setBackground(source: BackgroundSource): void;
  /** Pass null to clear. Snow and leaves move away from the pointer. */
  setPointer(x: number | null, y?: number): void;
  /** Re-read surfaces and repaint the background before the next frame. */
  invalidate(options?: { clearDeposits?: boolean }): void;
  play(): void;
  pause(): void;
  /** Replays from the seed at a fixed 30 fps step and draws that frame. */
  seek(seconds: number): void;
  /** CSS pixels. */
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createWeatherEffects(options: WeatherEffectsOptions): WeatherEffects;
export function createSimulation(options?: { seed?: number }): Simulation;
export function windAt(reading: WeatherReading, condition: WeatherCondition, seconds: number): number;
export function surfaceHit(x1: number, y1: number, x2: number, y2: number, surfaces: Surface[], includeRoom?: boolean):
  { x: number; y: number; t: number; angle: number; surface: Surface } | undefined;
export function settleSnow(deposits: object[], hit: { x: number; y: number; angle: number; surface: Surface }, size: number): void;
export function hash32(x: number): number;
export function particleRandom(seed: number, salt?: number): number;
export function particleVariant(seed: number, bins?: number): number;
