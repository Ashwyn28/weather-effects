import { createWeatherEffects } from './index.js';
import type { WeatherEffects, WeatherEffectsOptions } from './index.js';
import type { WeatherCondition } from './conditions.js';
import type { Surface, WeatherReading } from './physics.js';

/** Where `attachWeather` finds surfaces for rain to splash on and snow to settle on. */
export type SurfacesOption = string | Element[] | (() => Surface[]);

export interface AttachWeatherOptions {
  /** Element the weather covers. Default `document.body`. */
  target?: HTMLElement;
  /** Initial condition. Default `'clear'`. */
  condition?: WeatherCondition;
  /** Default false. */
  night?: boolean;
  /** Live readings such as wind and cloud cover. */
  reading?: WeatherReading;
  /** The `three` module namespace. Omit to use the 2D fallback. */
  three?: WeatherEffectsOptions['three'];
  /** Draw clouds, fog and stars on a canvas behind the content. Default true. */
  backdrop?: boolean;
  /** `'clouds'` (default) or `'sky'`. */
  backdropStyle?: WeatherEffectsOptions['backdropStyle'];
  /**
   * A CSS selector, a list of elements, or a function returning surfaces.
   * Elements and selector matches use the top edge of each client rect. Default none.
   */
  surfaces?: SurfacesOption;
  /** Snow and leaves move away from the mouse. Default true. */
  pointer?: boolean;
  /** Seed for particle randomness. Default 0. */
  seed?: number;
  /** Default true. */
  autoplay?: boolean;
  /** z-index of the overlay canvas. Default 20. */
  zIndex?: number;
}

export interface AttachedWeather {
  /** The underlying effects, for `seek`, `setBackground` and the rest. */
  readonly effects: WeatherEffects;
  setWeather: WeatherEffects['setWeather'];
  play(): void;
  pause(): void;
  /** Re-read surfaces before the next frame. Clears settled snow by default. */
  invalidate: WeatherEffects['invalidate'];
  /** Removes both canvases, listeners and observers. Safe to call twice. */
  destroy(): void;
}

const MUTATION_DEBOUNCE_MS = 100;

function elementSurfaces(elements: Iterable<Element>, win: Window): Surface[] {
  const surfaces: Surface[] = [];
  for (const el of elements) {
    for (const r of el.getClientRects()) {
      const offscreen =
        r.bottom < 0 || r.top > win.innerHeight || r.right < 0 || r.left > win.innerWidth;
      if (r.width <= 0 || r.height <= 0 || offscreen) continue;
      surfaces.push({
        points: [
          { x: r.left, y: r.top },
          { x: r.right, y: r.top },
        ],
        visible: () => el.isConnected && el.getClientRects().length > 0,
      });
    }
  }
  return surfaces;
}

function styleCanvas(canvas: HTMLCanvasElement, css: Record<string, string>) {
  canvas.setAttribute('aria-hidden', 'true');
  for (const [name, value] of Object.entries(css)) canvas.style.setProperty(name, value);
}

/**
 * One-call setup: creates and positions an overlay canvas (fixed over the
 * viewport, `pointer-events: none`) and, by default, a backdrop canvas behind
 * the content that scrolls with the page. Wires resize, scroll, observers and
 * mouse movement. Call `destroy()` to undo everything.
 *
 * @example
 * const weather = attachWeather({ condition: 'rain', surfaces: 'h1, h2, .card', three });
 * weather.setWeather('snow', { night: true });
 * weather.destroy();
 */
export function attachWeather(options: AttachWeatherOptions = {}): AttachedWeather {
  const {
    condition = 'clear',
    night = false,
    reading,
    three,
    backdrop = true,
    backdropStyle,
    surfaces,
    pointer = true,
    seed,
    autoplay,
    zIndex = 20,
  } = options;
  const doc = options.target?.ownerDocument ?? document;
  const win = doc.defaultView ?? window;
  const target = options.target ?? doc.body;

  const overlay = doc.createElement('canvas');
  styleCanvas(overlay, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    'pointer-events': 'none',
    'z-index': String(zIndex),
  });
  doc.body.appendChild(overlay);

  let backdropCanvas: HTMLCanvasElement | undefined;
  let restorePosition: string | null = null;
  if (backdrop) {
    backdropCanvas = doc.createElement('canvas');
    styleCanvas(backdropCanvas, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      'pointer-events': 'none',
      'z-index': '-1',
    });
    if (target !== doc.body && win.getComputedStyle(target).position === 'static') {
      restorePosition = target.style.position;
      target.style.position = 'relative';
    }
    target.prepend(backdropCanvas);
  }

  const effects = createWeatherEffects({
    canvas: overlay,
    backdropCanvas,
    backdropStyle,
    three,
    seed,
    autoplay,
  });
  effects.setSurfaces(
    typeof surfaces === 'string'
      ? () => elementSurfaces(doc.querySelectorAll(surfaces), win)
      : Array.isArray(surfaces)
        ? () => elementSurfaces(surfaces, win)
        : (surfaces ?? null),
    { clearDeposits: false },
  );
  effects.setWeather(condition, { night, reading });

  const size = () => {
    effects.resize(Math.max(1, win.innerWidth), Math.max(1, win.innerHeight));
  };
  const refresh = () => {
    effects.invalidate();
  };
  const onResize = () => {
    size();
    refresh();
  };
  const onScroll = () => {
    effects.invalidate({ clearDeposits: true });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') effects.setPointer(e.clientX, e.clientY);
  };
  const onPointerLeave = () => {
    effects.setPointer(null);
  };
  size();

  win.addEventListener('resize', onResize);
  win.addEventListener('scroll', onScroll, { passive: true });
  if (pointer) {
    win.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.documentElement.addEventListener('pointerleave', onPointerLeave);
  }

  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : undefined;
  resizeObserver?.observe(target);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const mutationObserver =
    typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(refresh, MUTATION_DEBOUNCE_MS);
        })
      : undefined;
  mutationObserver?.observe(target, { childList: true, subtree: true, attributes: true });

  let fontsCancelled = false;
  void (doc.fonts as FontFaceSet | undefined)?.ready.then(() => {
    if (!fontsCancelled) refresh();
  });

  let destroyed = false;
  return {
    effects,
    setWeather: (c, o) => {
      effects.setWeather(c, o);
    },
    play: () => {
      effects.play();
    },
    pause: () => {
      effects.pause();
    },
    invalidate: (o) => {
      effects.invalidate(o);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      fontsCancelled = true;
      clearTimeout(timer);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('pointermove', onPointerMove);
      doc.documentElement.removeEventListener('pointerleave', onPointerLeave);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      effects.dispose();
      effects.canvas.remove();
      overlay.remove();
      backdropCanvas?.remove();
      if (restorePosition !== null) target.style.position = restorePosition;
    },
  };
}
