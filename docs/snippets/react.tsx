import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { attachWeather } from 'weather-effects';
import type { WeatherCondition } from 'weather-effects';

export function Weather({
  condition,
  night = false,
}: {
  condition: WeatherCondition;
  night?: boolean;
}) {
  const handle = useRef<ReturnType<typeof attachWeather> | null>(null);

  // Mount once, destroy on unmount.
  useEffect(() => {
    handle.current = attachWeather({ condition, night, three: THREE });
    return () => {
      handle.current?.destroy();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow prop changes without recreating the canvases.
  useEffect(() => {
    handle.current?.setWeather(condition, { night });
  }, [condition, night]);

  return null;
}
