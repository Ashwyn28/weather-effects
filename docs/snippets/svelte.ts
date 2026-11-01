// weather.ts: a Svelte action. Use it as <div use:weather={{ condition: 'rain' }} />.
import type { Action } from 'svelte/action';
import * as THREE from 'three';
import { attachWeather } from 'weather-effects';
import type { WeatherCondition } from 'weather-effects';

interface Params {
  condition: WeatherCondition;
  night?: boolean;
}

export const weather: Action<HTMLElement, Params> = (node, params) => {
  const handle = attachWeather({ target: node, ...params, three: THREE });
  return {
    update({ condition, night }) {
      handle.setWeather(condition, { night });
    },
    destroy() {
      handle.destroy();
    },
  };
};
