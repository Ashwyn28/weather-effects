import type { WeatherCondition } from './conditions.js';

export type PrecipitationKind = 'rain' | 'snow' | 'hail' | 'leaves' | 'none';
export type SkyPalette = 'clear' | 'partly' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

export interface PrecipitationProfile {
  kind: PrecipitationKind;
  /** Pixels² of viewport per particle; more area per particle means fewer particles. */
  density: number;
  /** Most particles alive at once. */
  cap: number;
  /** Fall speed in px/s before depth scaling: base plus up to `range` more. */
  fall: { base: number; range: number };
  /** Seconds of motion a rain streak covers (its length is speed × exposure). */
  streakExposure: number;
  /** Fine drops: thinner, slightly more opaque streaks, boosted on phones. */
  fine: boolean;
  /** Default wind speed when the caller gives no reading. */
  wind: number;
}

/** tones, coverage, wisps, stars, mist, sun, reach (fraction of the height clouds extend down), drift speed */
export interface SkyProfile {
  palette: SkyPalette;
  coverage: number;
  wispy: number;
  stars: number;
  mist: number;
  sun: number;
  reach: number;
  drift: number;
}

export interface GlassProfile {
  /** Frost level on the glass: 0 none, higher is more frozen over. */
  frost: number;
  /** Share of the glass covered by running drops, and by still beads. */
  density: number;
  stillDensity: number;
  /** Density of the refracting droplet layer drawn by the three.js renderer. */
  refractionDensity: number;
  /** Multiplier on the bead size. */
  dropScale: number;
}

export interface ConditionProfile {
  precipitation: PrecipitationProfile;
  sky: SkyProfile;
  glass: GlassProfile;
  /** Kind of haze the three.js atmosphere layer draws, and how strongly. */
  atmosphere: { kind: number; strength: number };
  /** Tint the 2D canvas paints behind the particles. */
  canvasVeil: 'none' | 'fog' | 'overcast' | 'clouds';
  lightning: boolean;
}

const none = (wind = 12): PrecipitationProfile => ({
  kind: 'none',
  density: 4200,
  cap: 240,
  fall: { base: 620, range: 220 },
  streakExposure: 0.038,
  fine: false,
  wind,
});
const rain = (
  density: number,
  streakExposure: number,
  fine = false,
  fall = fine ? { base: 330, range: 90 } : { base: 620, range: 220 },
): PrecipitationProfile => ({
  kind: 'rain',
  density,
  cap: 640,
  fall,
  streakExposure,
  fine,
  wind: 12,
});
const snow = (density: number): PrecipitationProfile => ({
  kind: 'snow',
  density,
  cap: 300,
  fall: { base: 22, range: 25 },
  streakExposure: 0.038,
  fine: false,
  wind: 12,
});

const glass = (
  frost: number,
  [density, stillDensity, refractionDensity, dropScale]: [number, number, number, number],
): GlassProfile => ({ frost, density, stillDensity, refractionDensity, dropScale });
const LIGHT: [number, number, number, number] = [0.22, 0.95, 0.35, 0.55];
const MEDIUM: [number, number, number, number] = [0.65, 0.36, 0.65, 1];
const HEAVY: [number, number, number, number] = [0.85, 0.47, 0.85, 1];

const sky = (
  palette: SkyPalette,
  coverage: number,
  wispy: number,
  stars: number,
  mist: number,
  sun: number,
  reach: number,
  drift: number,
): SkyProfile => ({ palette, coverage, wispy, stars, mist, sun, reach, drift });

const profile = (
  precipitation: PrecipitationProfile,
  skyProfile: SkyProfile,
  glassProfile: GlassProfile,
  atmosphere: { kind: number; strength: number },
  canvasVeil: ConditionProfile['canvasVeil'] = 'none',
  lightning = false,
): ConditionProfile => ({
  precipitation,
  sky: skyProfile,
  glass: glassProfile,
  atmosphere,
  canvasVeil,
  lightning,
});

const OVERCAST = { kind: 4, strength: 0.4 };
const STORM = { kind: 4, strength: 0.7 };

/** Everything that makes one weather condition look and move differently from another. */
export const PROFILES: Readonly<Record<WeatherCondition, Readonly<ConditionProfile>>> =
  Object.freeze({
    clear: profile(none(), sky('clear', 0.46, 0, 1, 0, 1, 0.3, 0.7), glass(0, MEDIUM), {
      kind: 1,
      strength: 0.4,
    }),
    'mainly-clear': profile(
      none(),
      sky('clear', 0.38, 0.22, 0.7, 0, 0.8, 0.35, 1),
      glass(0, MEDIUM),
      { kind: 1, strength: 0.4 },
    ),
    'partly-cloudy': profile(
      none(),
      sky('partly', 0.6, 0.3, 0.4, 0, 0.5, 0.45, 1),
      glass(0, MEDIUM),
      { kind: 2, strength: 0.4 },
      'clouds',
    ),
    overcast: profile(
      none(),
      sky('cloudy', 0.9, 0.25, 0.1, 0, 0, 0.5, 0.8),
      glass(0, MEDIUM),
      OVERCAST,
      'overcast',
    ),
    fog: profile(
      none(),
      sky('fog', 0.4, 0, 0, 1, 0, 0.45, 0.6),
      glass(0, MEDIUM),
      { kind: 3, strength: 0.4 },
      'fog',
    ),
    drizzle: profile(
      rain(6000, 0.04, true),
      sky('rain', 0.82, 0.2, 0, 0.2, 0, 0.5, 0.9),
      glass(0, LIGHT),
      OVERCAST,
    ),
    'freezing-drizzle': profile(
      rain(6000, 0.04, true),
      sky('rain', 0.82, 0.2, 0, 0.2, 0, 0.5, 0.9),
      glass(0.85, LIGHT),
      OVERCAST,
    ),
    rain: profile(
      rain(4200, 0.038),
      sky('rain', 0.9, 0.12, 0, 0.1, 0, 0.46, 1),
      glass(0, MEDIUM),
      OVERCAST,
    ),
    'freezing-rain': profile(
      rain(4200, 0.038),
      sky('rain', 0.9, 0.12, 0, 0.1, 0, 0.46, 1),
      glass(0.85, MEDIUM),
      OVERCAST,
    ),
    showers: profile(
      rain(3200, 0.045),
      sky('rain', 0.74, 0.1, 0, 0.05, 0, 0.46, 1.4),
      glass(0, HEAVY),
      OVERCAST,
    ),
    thunderstorm: profile(
      rain(2800, 0.045),
      sky('storm', 0.95, 0, 0, 0.1, 0, 0.46, 1.3),
      glass(0, HEAVY),
      STORM,
      'clouds',
      true,
    ),
    hail: profile(
      { ...none(), kind: 'hail', density: 7500 },
      sky('storm', 0.95, 0, 0, 0.1, 0, 0.46, 1.3),
      glass(0, MEDIUM),
      STORM,
      'clouds',
    ),
    snow: profile(
      snow(7500),
      sky('snow', 0.84, 0.15, 0, 0.2, 0, 0.5, 0.7),
      glass(0.45, MEDIUM),
      OVERCAST,
    ),
    'snow-showers': profile(
      snow(5000),
      sky('snow', 0.72, 0.1, 0, 0.25, 0, 0.5, 0.9),
      glass(0.45, MEDIUM),
      OVERCAST,
    ),
    wind: profile(
      {
        kind: 'leaves',
        density: 55000,
        cap: 30,
        fall: { base: 12, range: 0 },
        streakExposure: 0.038,
        fine: false,
        wind: 38,
      },
      sky('partly', 0.5, 0.55, 0.3, 0, 0.4, 0.42, 3),
      glass(0, MEDIUM),
      { kind: 5, strength: 0.4 },
      'clouds',
    ),
  });
