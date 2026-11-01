import { defineComponent, onBeforeUnmount, onMounted, watch } from 'vue';
import type { PropType } from 'vue';
import * as THREE from 'three';
import { attachWeather } from 'weather-effects';
import type { AttachedWeather, WeatherCondition } from 'weather-effects';

export default defineComponent({
  name: 'WeatherEffects',
  props: {
    condition: { type: String as PropType<WeatherCondition>, default: 'clear' },
    night: { type: Boolean, default: false },
  },
  setup(props) {
    let handle: AttachedWeather | null = null;
    onMounted(() => {
      handle = attachWeather({ condition: props.condition, night: props.night, three: THREE });
    });
    onBeforeUnmount(() => {
      handle?.destroy();
      handle = null;
    });
    watch(
      () => [props.condition, props.night] as const,
      ([condition, night]) => handle?.setWeather(condition, { night }),
    );
    return () => null;
  },
});
