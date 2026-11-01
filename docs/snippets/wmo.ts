import { attachWeather } from 'weather-effects';
import type { WeatherCondition, WeatherReading } from 'weather-effects';

/** Maps a WMO weather code (as returned by Open-Meteo) to a condition id. */
export function wmoToCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1) return 'mainly-clear';
  if (code === 2) return 'partly-cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57) return 'freezing-drizzle';
  if (code >= 61 && code <= 65) return 'rain';
  if (code === 66 || code === 67) return 'freezing-rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code === 85 || code === 86) return 'snow-showers';
  if (code >= 95) return 'thunderstorm';
  return 'clear';
}

interface OpenMeteoResponse {
  current: {
    weather_code: number;
    is_day: 0 | 1;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    wind_direction_10m: number;
    precipitation: number;
    cloud_cover: number;
  };
}

export async function showWeather(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,cloud_cover',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  const { current } = (await res.json()) as OpenMeteoResponse;
  const reading: WeatherReading = {
    windSpeed: current.wind_speed_10m,
    windGust: current.wind_gusts_10m,
    windDirection: current.wind_direction_10m,
    precipitation: current.precipitation,
    cloudCover: current.cloud_cover,
  };
  const weather = attachWeather({});
  weather.setWeather(wmoToCondition(current.weather_code), {
    night: current.is_day === 0,
    reading,
  });
  return weather;
}
