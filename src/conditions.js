// Condition ids understood by the effects engine. Callers map their own
// weather data (WMO codes, API responses) onto these ids.
export const CONDITIONS = Object.freeze([
  'clear', 'mainly-clear', 'partly-cloudy', 'overcast', 'fog',
  'drizzle', 'freezing-drizzle', 'rain', 'freezing-rain', 'showers',
  'snow', 'snow-showers', 'thunderstorm', 'hail', 'wind'
]);

const RAIN = new Set(['drizzle', 'freezing-drizzle', 'rain', 'freezing-rain', 'showers', 'thunderstorm']);
const SNOW = new Set(['snow', 'snow-showers']);
const FROZEN = new Set(['freezing-rain', 'freezing-drizzle', 'snow', 'snow-showers']);

export const isCondition = id => CONDITIONS.includes(id);
export const isRain = id => RAIN.has(id);
export const isSnow = id => SNOW.has(id);
export const isFrozen = id => FROZEN.has(id);
export const hasPrecipitation = id => RAIN.has(id) || SNOW.has(id) || id === 'hail' || id === 'wind';
