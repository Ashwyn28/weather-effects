import * as THREE from 'three';
import { attachWeather, isCondition } from 'weather-effects';
import type { AttachedWeather } from 'weather-effects';

/** <weather-effect condition="rain" night></weather-effect> */
class WeatherElement extends HTMLElement {
  static observedAttributes = ['condition', 'night'];
  private handle: AttachedWeather | null = null;

  connectedCallback() {
    this.handle = attachWeather({ ...this.read(), three: THREE });
  }

  disconnectedCallback() {
    this.handle?.destroy();
    this.handle = null;
  }

  attributeChangedCallback() {
    const { condition, night } = this.read();
    this.handle?.setWeather(condition, { night });
  }

  private read() {
    const id = this.getAttribute('condition');
    return {
      condition: isCondition(id) ? id : 'clear',
      night: this.hasAttribute('night'),
    } as const;
  }
}

customElements.define('weather-effect', WeatherElement);
