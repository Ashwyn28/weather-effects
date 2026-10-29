import { dropletFunctions } from './droplet-shader.js';
import { isRain, isFrozen } from './conditions.js';

// Water drops (and frost) on a small pane of glass, independent of the page
// weather layer and of Three.js. Draw it over any element, such as a window in
// an illustration: the background painter supplies what is seen through the
// glass, and transparent areas of it stay clear.

const VERTEX = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D background;
uniform vec2 resolution;
uniform float time, rain, frost, density, dark, dropScale, seed;
${dropletFunctions}
// Refraction never pulls in what lies outside the glass (transparent areas).
vec3 sampleScene(vec2 uv, vec3 fallback) { vec4 s = texture(background, clamp(uv, vec2(0.0), vec2(1.0))); return mix(fallback, s.rgb, smoothstep(.5, 1.0, s.a)); }
void main() {
  vec4 base = texture(background, vUv);
  if (base.a < .01) discard;
  vec2 uv = vUv * resolution / dropScale;
  vec4 moving, still;
  rainLayers(uv, time, seed, density, density * .55, moving, still);
  float coverage = saturate(moving.z + still.z);
  vec2 displacement = (moving.xy + still.xy) * .9;
  vec3 refracted = sampleScene(vUv - displacement, base.rgb);
  // Light catches the top of each drop and its rim; the underside darkens.
  float highlight = clamp(-(moving.y + still.y) * 2.2 + (moving.w + still.w) * .12, -.18, .38);
  vec3 color = refracted + highlight * mix(1.0, 1.6, dark);
  float alpha = coverage * rain;

  vec2 texel = 2.0 / resolution;
  float neighbors = texture(background, vUv + vec2(texel.x, 0)).a * texture(background, vUv - vec2(texel.x, 0)).a
    * texture(background, vUv + vec2(0, texel.y)).a * texture(background, vUv - vec2(0, texel.y)).a;
  vec2 crystalUV = vUv * resolution / 6.0;
  float grain = cellHash(floor(crystalUV));
  vec2 p = fract(crystalUV) - .5;
  float branches = pow(abs(cos(atan(p.y, p.x) * 3.0 + grain * 6.28)), 14.0);
  float ice = (1.0 - smoothstep(.1, .6, length(p))) * branches;
  float frozen = frost * clamp((1.0 - neighbors) * .7 + ice * .4 + grain * .08, 0.0, .75);
  color = mix(color, mix(vec3(.86, .92, .96), vec3(.6, .72, .84), dark), frozen);
  alpha = max(alpha, frozen) * base.a;
  if (alpha < .002) discard;
  outColor = vec4(color * alpha, alpha);
}`;

const FRAME = 1000 / 30;

/**
 * canvas: the element to draw on (sized by CSS). dropSize: CSS pixels per
 * drop-grid unit; small panes want small values. Returns null without WebGL2.
 */
export function createGlassDroplets({
  canvas, dropSize = 90, seed = 7,
  pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2),
  reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
} = {}) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return null;
  const source = document.createElement('canvas');
  const ctx = source.getContext('2d');
  let program, uniforms, texture, vao, lost = false;
  let painter = null, dirty = true, width = 1, height = 1, condition = 'clear', night = false;
  let rain = 0, frost = 0, time = 12, frame = 0, last = 0, playing = true, disposed = false;

  function build() {
    const compile = (type, text) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    uniforms = Object.fromEntries(['background', 'resolution', 'time', 'rain', 'frost', 'density', 'dark', 'dropScale', 'seed']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    vao = gl.createVertexArray();
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
    dirty = true;
  }
  build();

  function capture() {
    dirty = false;
    source.width = Math.max(1, Math.round(width * pixelRatio));
    source.height = Math.max(1, Math.round(height * pixelRatio));
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (typeof painter === 'function') painter(ctx, { width, height, night });
    else if (painter) ctx.drawImage(painter, 0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  const still = () => !playing || reducedMotion?.matches === true;
  const wet = () => isRain(condition);
  const icy = () => isFrozen(condition);
  const frostTarget = () => icy() ? (wet() ? .85 : .5) : 0;

  function draw(dt) {
    const blend = dt > 0 ? 1 - Math.exp(-dt * 1.5) : 1;
    rain += (Number(wet()) - rain) * blend;
    frost += (frostTarget() - frost) * blend;
    if (!still()) time += dt;
    if (lost) return;
    const cw = Math.max(1, Math.round((canvas.clientWidth || width) * pixelRatio)), ch = Math.max(1, Math.round((canvas.clientHeight || height) * pixelRatio));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (rain < .005 && frost < .005) return;
    if (dirty) capture();
    gl.useProgram(program); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.background, 0);
    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.rain, rain);
    gl.uniform1f(uniforms.frost, frost);
    gl.uniform1f(uniforms.density, condition.includes('drizzle') ? .4 : ['showers', 'thunderstorm'].includes(condition) ? .85 : .65);
    gl.uniform1f(uniforms.dark, night ? 1 : 0);
    gl.uniform1f(uniforms.dropScale, dropSize);
    gl.uniform1f(uniforms.seed, seed);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop(now) {
    frame = 0;
    if (disposed || document.hidden) { last = 0; return; }
    if (last && now - last < FRAME) { frame = requestAnimationFrame(loop); return; }
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    draw(dt);
    const fading = Math.abs(Number(wet()) - rain) > .005 || Math.abs(frostTarget() - frost) > .005;
    if ((!still() && (wet() || rain > .005)) || fading) frame = requestAnimationFrame(loop);
  }

  function restart() {
    if (disposed) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0; last = 0;
    frame = requestAnimationFrame(loop);
  }

  const lose = event => { event.preventDefault(); lost = true; };
  const restore = () => { lost = false; build(); restart(); };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);
  const onVisibility = () => restart();
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion?.addEventListener?.('change', restart);

  return {
    backend: 'webgl2',
    setWeather(next, { night: isNight = night } = {}) {
      if (next !== condition || !!isNight !== night) dirty = true;
      condition = next; night = !!isNight; restart();
    },
    /** A drawable, or a function (ctx, { width, height, night }) painting in CSS pixels. */
    setBackground(next) { painter = next || null; dirty = true; restart(); },
    invalidate() { dirty = true; restart(); },
    resize(w, h) { width = Math.max(1, w); height = Math.max(1, h); dirty = true; restart(); },
    play() { playing = true; restart(); },
    pause() { playing = false; restart(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', lose);
      canvas.removeEventListener('webglcontextrestored', restore);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion?.removeEventListener?.('change', restart);
      gl.deleteProgram(program); gl.deleteTexture(texture); gl.deleteVertexArray(vao);
    }
  };
}
