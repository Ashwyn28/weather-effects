import { PROFILES } from './profiles.js';

/**
 * A weather condition id understood by the effects engine. Callers map their
 * own weather data (WMO codes, API responses) onto these ids.
 */
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

/** Every {@link WeatherCondition} id, in display order. */
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

/**
 * Checks whether a value is a known weather condition id.
 *
 * @param id - Any value, such as untrusted API data.
 * @returns `true` if `id` is a {@link WeatherCondition}.
 */
export const isCondition = (id: unknown): id is WeatherCondition =>
  CONDITIONS.includes(id as WeatherCondition);
/**
 * Checks whether a condition produces rain-like drops (rain, drizzle, showers, thunderstorm).
 *
 * @param id - The condition to test.
 * @returns `true` if the condition's precipitation is rain.
 */
export const isRain = (id: WeatherCondition) => PROFILES[id].precipitation.kind === 'rain';
/**
 * Checks whether a condition produces snowfall.
 *
 * @param id - The condition to test.
 * @returns `true` if the condition's precipitation is snow.
 */
export const isSnow = (id: WeatherCondition) => PROFILES[id].precipitation.kind === 'snow';
/**
 * Checks whether a condition frosts glass.
 *
 * @param id - The condition to test.
 * @returns `true` if the condition's glass frost amount is above zero.
 */
export const isFrozen = (id: WeatherCondition) => PROFILES[id].glass.frost > 0;
/**
 * Checks whether a condition has any falling particles (including hail and wind-blown leaves).
 *
 * @param id - The condition to test.
 * @returns `true` if the condition's precipitation kind is not `'none'`.
 */
export const hasPrecipitation = (id: WeatherCondition) =>
  PROFILES[id].precipitation.kind !== 'none';
