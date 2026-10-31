import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

function setup() {
  const win = new Window({ width: 800, height: 600 });
  const globals = {
    window: win,
    document: win.document,
    ResizeObserver:
      win.ResizeObserver ??
      class {
        observe() {}
        disconnect() {}
      },
    MutationObserver: win.MutationObserver,
  };
  const saved = {};
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  const restore = () => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  };
  return { win, restore };
}

test('attachWeather creates canvases, resolves surfaces, forwards and destroys', async () => {
  const { win, restore } = setup();
  try {
    const { attachWeather } = await import('../dist/index.js');
    win.document.body.innerHTML = '<h1 class="t">Hi</h1>';
    const h1 = win.document.querySelector('h1');
    h1.getClientRects = () => [
      { left: 10, right: 110, top: 20, bottom: 50, width: 100, height: 30 },
    ];
    const added = [];
    const removed = [];
    const add = win.addEventListener.bind(win);
    const rem = win.removeEventListener.bind(win);
    win.addEventListener = (t, ...r) => (added.push(t), add(t, ...r));
    win.removeEventListener = (t, ...r) => (removed.push(t), rem(t, ...r));

    const weather = attachWeather({ condition: 'rain', surfaces: 'h1', autoplay: false });
    const canvases = win.document.querySelectorAll('canvas');
    assert.equal(canvases.length, 2);
    const overlay = weather.effects.canvas;
    assert.equal(overlay.style.position, 'fixed');
    assert.equal(overlay.style.pointerEvents, 'none');
    assert.equal(overlay.style.zIndex, '20');
    for (const c of canvases) assert.equal(c.getAttribute('aria-hidden'), 'true');
    const backdrop = [...canvases].find((c) => c !== overlay);
    assert.equal(backdrop.style.position, 'absolute');

    assert.equal(weather.effects.condition, 'rain');
    weather.setWeather('snow', { night: true });
    assert.equal(weather.effects.condition, 'snow');

    weather.destroy();
    weather.destroy();
    assert.equal(win.document.querySelectorAll('canvas').length, 0);
    for (const t of added) assert.ok(removed.includes(t), `listener ${t} removed`);
    assert.ok(added.length >= 3);
  } finally {
    restore();
  }
});
