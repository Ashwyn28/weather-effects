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

const RAIN = new Set<WeatherCondition>([
  'drizzle',
  'freezing-drizzle',
  'rain',
  'freezing-rain',
  'showers',
  'thunderstorm',
]);
const SNOW = new Set<WeatherCondition>(['snow', 'snow-showers']);
const FROZEN = new Set<WeatherCondition>([
  'freezing-rain',
  'freezing-drizzle',
  'snow',
  'snow-showers',
]);

export const isCondition = (id: unknown): id is WeatherCondition =>
  CONDITIONS.includes(id as WeatherCondition);
export const isRain = (id: WeatherCondition) => RAIN.has(id);
export const isSnow = (id: WeatherCondition) => SNOW.has(id);
export const isFrozen = (id: WeatherCondition) => FROZEN.has(id);
export const hasPrecipitation = (id: WeatherCondition) =>
  RAIN.has(id) || SNOW.has(id) || id === 'hail' || id === 'wind';
