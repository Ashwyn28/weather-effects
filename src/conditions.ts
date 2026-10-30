import { PROFILES } from './profiles.js';

// Condition ids understood by the effects engine. Callers map their own
// weather data (WMO codes, API responses) onto these ids.
export type WeatherCondition =
  | 'clear'
  | 'mainly-clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'freezing-drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'showers'
  | 'snow'
  | 'snow-showers'
  | 'thunderstorm'
  | 'hail'
  | 'wind';

export const CONDITIONS: readonly WeatherCondition[] = Object.freeze<WeatherCondition[]>([
  'clear',
  'mainly-clear',
  'partly-cloudy',
  'overcast',
  'fog',
  'drizzle',
  'freezing-drizzle',
  'rain',
  'freezing-rain',
  'showers',
  'snow',
  'snow-showers',
  'thunderstorm',
  'hail',
  'wind',
]);

export const isCondition = (id: unknown): id is WeatherCondition =>
  CONDITIONS.includes(id as WeatherCondition);
export const isRain = (id: WeatherCondition) => PROFILES[id].precipitation.kind === 'rain';
export const isSnow = (id: WeatherCondition) => PROFILES[id].precipitation.kind === 'snow';
export const isFrozen = (id: WeatherCondition) => PROFILES[id].glass.frost > 0;
export const hasPrecipitation = (id: WeatherCondition) =>
  PROFILES[id].precipitation.kind !== 'none';
