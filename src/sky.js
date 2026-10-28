// Weather backdrop drawn behind page content. Raw WebGL2, with a 2D fallback.
//
// style 'clouds' (default): transparent canvas with clouds, fog, stars and
//   sun glow only; the page keeps its own background.
// style 'full': opaque sky gradient as well, like a weather app.

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);

// Full style: [top, bottom, cloud light, cloud shadow]
const SKIES = {
  clear:  { day: ['#2a63c4', '#8dbbe9', '#ffffff', '#b4c7dc'], night: ['#11142e', '#393c6b', '#5f6192', '#24264a'] },
  partly: { day: ['#2f68c4', '#93bfe8', '#ffffff', '#a9bdd3'], night: ['#222347', '#4c4b7c', '#7c7ab0', '#2a2a4c'] },
  cloudy: { day: ['#5b7084', '#a4b3c1', '#e6ebf0', '#6f7d8b'], night: ['#222347', '#4c4b7c', '#7c7ab0', '#2a2a4c'] },
  rain:   { day: ['#3d4955', '#77848f', '#a6b0bb', '#2a323b'], night: ['#181c25', '#373e4b', '#5d6676', '#0b0e13'] },
  storm:  { day: ['#29313b', '#58626d', '#8a95a1', '#1a1f25'], night: ['#111419', '#2b313b', '#4a5260', '#07080b'] },
  snow:   { day: ['#6a7d92', '#a9b8c7', '#e6ecf2', '#8495a7'], night: ['#283041', '#4f596a', '#6d7788', '#232a36'] },
  fog:    { day: ['#7c8891', '#adb5ba', '#d3d8db', '#8f989f'], night: ['#363b42', '#575d64', '#6d737a', '#2c3036'] }
};

// Clouds style, over the caller's page: [lit, shadow]. Day tones suit a light
// page; night tones a dark one.
const TONES = {
  clear:  { day: ['#f1f4f7', '#97a6b4'], night: ['#505b70', '#262e42'] },
  partly: { day: ['#eef2f6', '#8b9bab'], night: ['#535e74', '#262e42'] },
  cloudy: { day: ['#e9edf0', '#8f9ba6'], night: ['#4f5a6f', '#222a3d'] },
  rain:   { day: ['#d3d9df', '#7d8996'], night: ['#4f5a70', '#1f2638'] },
  storm:  { day: ['#c3cbd2', '#6b7682'], night: ['#465066', '#161c2b'] },
  snow:   { day: ['#f3f6f8', '#a7b3be'], night: ['#5a6579', '#2a3245'] },
  fog:    { day: ['#eef1f2', '#c3cacf'], night: ['#4d566a', '#343c50'] }
};

// tones, coverage, wisps, stars, mist, sun, reach (fraction of the height
// that clouds extend down from the top in clouds style), drift speed
const LOOKS = {
  'clear':            ['clear',  0,   0,   1,  0,  1,  .3,  1],
  'mainly-clear':     ['clear',  .38, .22, .7, 0,  .8, .35, 1],
  'partly-cloudy':    ['partly', .6,  .3,  .4, 0,  .5, .45, 1],
  'overcast':         ['cloudy', .9,  .25, .1, 0,  0,  .5,  .8],
  'fog':              ['fog',    .4,  0,   0,  1,  0,  .45, .6],
  'drizzle':          ['rain',   .82, .2,  0,  .2, 0,  .5,  .9],
  'freezing-drizzle': ['rain',   .82, .2,  0,  .2, 0,  .5,  .9],
  'rain':             ['rain',   .9,  .12, 0,  .1, 0,  .46, 1],
  'freezing-rain':    ['rain',   .9,  .12, 0,  .1, 0,  .46, 1],
  'showers':          ['rain',   .74, .1,  0,  .05, 0, .46, 1.4],
  'thunderstorm':     ['storm',  .95, 0,   0,  .1, 0,  .46, 1.3],
  'hail':             ['storm',  .95, 0,   0,  .1, 0,  .46, 1.3],
  'snow':             ['snow',   .84, .15, 0,  .2, 0,  .5,  .7],
  'snow-showers':     ['snow',   .72, .1,  0,  .25, 0, .5,  .9],
  'wind':             ['partly', .5,  .55, .3, 0,  .4, .42, 3]
};

const VERTEX = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float time, scale, opaque, coverage, wispy, stars, mist, sun, flash, drift, reach;
uniform vec3 top, bottom, cloudLight, cloudShadow;
out vec4 color;

uint lowbias32(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x;
}
float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + ivec2(65536));
  return float(lowbias32(q.x ^ lowbias32(q.y + 0x9e3779b9u)) >> 8u) / 16777216.0;
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
const mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
  float sum = 0.0, amp = .5;
  for (int i = 0; i < 5; i++) { sum += amp * noise(p); p = turn * p; amp *= .5; }
  return sum;
}
float fbm3(vec2 p) {
  float sum = 0.0, amp = .5;
  for (int i = 0; i < 3; i++) { sum += amp * noise(p); p = turn * p; amp *= .5; }
  return sum / .875;
}

// Premultiplied "over": paint colour c with coverage a on top of dst.
vec4 over(vec4 dst, vec3 c, float a) { return vec4(c * a, a) + dst * (1.0 - a); }

// Point stars: a pin-sharp core, a faint glow and small cross glints on the
// brightest few. Twinkle mixes two slow waves with an occasional quick glint.
// Returns tint and intensity.
vec4 starField(vec2 px, float cell, float chance, float t) {
  vec2 id = floor(px / cell);
  float r = hash(id * 1.37 + cell);
  if (r > chance) return vec4(0.0);
  vec2 d = px - (id + .15 + .7 * vec2(hash(id + 11.0), hash(id + 23.0))) * cell;
  float bright = pow(hash(id + 37.0), 3.0);
  float phase = hash(id + 51.0) * 6.2832, rate = .7 + 1.6 * hash(id + 61.0);
  float twinkle = .72 + .18 * sin(t * rate + phase) + .1 * sin(t * rate * 2.7 + phase * 3.1)
    + pow(max(0.0, sin(t * rate * .37 + phase * 5.0)), 24.0) * .5 * bright;
  float d2 = dot(d, d);
  float core = exp(-d2 / (.3 + bright * .25));
  float glow = exp(-sqrt(d2) / (1.2 + bright * 2.2)) * .2 * (.3 + bright);
  float spikes = max(0.0, bright - .55) * .9 * (
      exp(-abs(d.x) * 2.2 - d.y * d.y / .12) + exp(-abs(d.y) * 2.2 - d.x * d.x / .12));
  float light = (core * (.55 + .45 * bright) + glow + spikes) * twinkle;
  vec3 tint = mix(vec3(1.0), mix(vec3(.78, .86, 1.0), vec3(1.0, .9, .76), hash(id + 71.0)), .55);
  return vec4(tint, clamp(light, 0.0, 1.0));
}

void main() {
  vec2 px = gl_FragCoord.xy / scale;
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec4 col = opaque > .5 ? vec4(mix(bottom, top, smoothstep(0.0, 1.0, uv.y)), 1.0) : vec4(0.0);

  // Sun glow, upper right.
  vec2 s = (uv - vec2(.82, 1.02)) * vec2(aspect, 1.0);
  float glow = exp(-dot(s, s) * 5.0) * .3 + exp(-dot(s, s) * 60.0) * .25;
  col = over(col, vec3(1.0, .88, .66), sun * glow * opaque);

  // Clouds thin out towards the reach line so the body of the page stays clear.
  float profile = smoothstep(1.0 - reach - .12, 1.0 - reach + .4, uv.y);
  float thin = mix(.8, .36, coverage);

  // Wisps: high, stretched sideways.
  vec2 w = p * vec2(1.1, 4.2) + vec2(time * .006 * drift, 0.0);
  w += .7 * vec2(fbm3(w * .5 + vec2(0.0, time * .003)), fbm3(w * .5 + 7.3));
  float wisp = smoothstep(.5, .85, fbm(w)) * wispy * max(profile, opaque * (.35 + .65 * uv.y));

  // Cumulus: domain-warped noise, flattened, lit from above by a short march.
  vec2 q = p * vec2(1.25, 2.1) + vec2(time * .007 * drift, 0.0);
  vec2 warp = vec2(fbm3(q * .45 + vec2(time * .002, 1.7)), fbm3(q * .45 + 4.1));
  vec2 base = q + warp * 1.1;
  float shapeProfile = opaque > .5 ? .55 + .6 * smoothstep(.05, .95, uv.y) : profile;
  float density = clamp((fbm(base) - thin) / .24, 0.0, 1.0) * shapeProfile * step(.01, coverage);
  float shadow = 0.0;
  for (int i = 1; i <= 3; i++) {
    vec2 o = vec2(.035, .085) * float(i);
    shadow += clamp((fbm3(base + o) - thin) / .24, 0.0, 1.0);
  }
  float light = exp(-shadow * .75);
  vec3 cloud = mix(cloudShadow, cloudLight, light);
  cloud = mix(cloud, cloudLight, (1.0 - smoothstep(0.0, .3, density)) * light * .5);
  float cloudAlpha = (1.0 - exp(-density * 3.2)) * (opaque > .5 ? .95 : .72);

  // Low fog banks.
  vec2 m = p * vec2(1.4, 3.0) + vec2(time * .02, 0.0);
  float fog = smoothstep(.3, .75, fbm(m + fbm3(m * .7 + time * .01))) * (1.0 - smoothstep(.1, .9, uv.y)) * mist;

  // Clouds style: a sparse, dim band of stars near the top that fades out
  // well before the content. Full style: the whole sky.
  float starBand = opaque > .5 ? 1.0 : smoothstep(.6, .95, uv.y);
  vec4 star = starField(px, opaque > .5 ? 24.0 : 36.0, opaque > .5 ? .45 : .3, time);
  if (opaque > .5) { vec4 faint = starField(px, 11.0, .1, time * 1.3); if (faint.a * .5 > star.a) star = vec4(faint.rgb, faint.a * .5); }
  col = over(col, star.rgb, clamp(stars * starBand * (1.0 - wisp * .8) * (1.0 - cloudAlpha) * star.a, 0.0, 1.0));
  col = over(col, mix(cloudLight, cloudShadow, .25), wisp * .55);
  col = over(col, cloud, cloudAlpha);
  col = over(col, cloudLight, fog * .6);
  col = over(col, vec3(.86, .9, 1.0), flash * (.15 + cloudAlpha * .5));
  if (col.a > 0.0) col.rgb += (hash(gl_FragCoord.xy) - .5) / 255.0 * col.a;
  color = col;
}`;

function target(condition, night, cloudCover, style) {
  const [palette, coverage, wispy, stars, mist, sun, reach, drift] = LOOKS[condition] || LOOKS.clear;
  const time = night ? 'night' : 'day';
  const colors = style === 'full' ? SKIES[palette][time] : ['#000000', '#000000', ...TONES[palette][time]];
  const [top, bottom, cloudLight, cloudShadow] = colors.map(hex);
  const cover = Number.isFinite(cloudCover) && coverage > 0 && coverage < .9 ? Math.min(.95, coverage * (.6 + cloudCover / 125)) : coverage;
  return { top, bottom, cloudLight, cloudShadow, coverage: cover, wispy, stars: night ? stars : 0, mist, sun: night ? 0 : sun, reach, drift };
}

const lerp = (a, b, t) => a + (b - a) * t;
function blend(current, next, t) {
  if (!current) return structuredClone(next);
  for (const key of Object.keys(next)) {
    current[key] = Array.isArray(next[key]) ? current[key].map((v, i) => lerp(v, next[key][i], t)) : lerp(current[key], next[key], t);
  }
  return current;
}

// pixelRatio: resolution for clouds (soft, so 1 is enough). starPixelRatio:
// used when only stars are showing, so they stay pin-sharp on dense screens.
export function createSkyRenderer(canvas, { pixelRatio = 1, starPixelRatio = pixelRatio, style = 'clouds', onRestored } = {}) {
  const opaque = style === 'full';
  const gl = canvas.getContext('webgl2', { alpha: !opaque, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return createGradientSky(canvas, opaque);
  let program, uniforms, vao, lost = false, width = 1, height = 1, state, ratio = pixelRatio;
  const names = ['resolution', 'time', 'scale', 'opaque', 'coverage', 'wispy', 'stars', 'mist', 'sun', 'flash', 'drift', 'reach', 'top', 'bottom', 'cloudLight', 'cloudShadow'];

  function build() {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
    vao = gl.createVertexArray();
  }
  build();

  const lose = event => { event.preventDefault(); lost = true; };
  const restore = () => { lost = false; build(); api.resize(width, height); onRestored?.(); };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);

  const api = {
    backend: 'webgl2',
    style,
    get available() { return !lost; },
    resize(w, h) {
      width = w; height = h;
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
    },
    // dt of 0 jumps straight to the new look; otherwise it eases over ~1.5 s.
    render({ condition, night, time, dt = 0, cloudCover, flash = 0 }) {
      const next = target(condition, night, cloudCover, style);
      state = blend(state, next, dt > 0 ? 1 - Math.exp(-dt * 2) : 1);
      const starsOnly = next.coverage < .01 && next.wispy < .01 && next.mist < .01;
      const wanted = starsOnly ? starPixelRatio : pixelRatio;
      if (wanted !== ratio) { ratio = wanted; api.resize(width, height); }
      if (lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program); gl.bindVertexArray(vao);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.scale, ratio);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.opaque, opaque ? 1 : 0);
      gl.uniform1f(uniforms.flash, flash);
      for (const key of ['coverage', 'wispy', 'stars', 'mist', 'sun', 'reach', 'drift']) gl.uniform1f(uniforms[key], state[key]);
      for (const key of ['top', 'bottom', 'cloudLight', 'cloudShadow']) gl.uniform3fv(uniforms[key], state[key]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lose);
      canvas.removeEventListener('webglcontextrestored', restore);
      gl.deleteProgram(program); gl.deleteVertexArray(vao);
    }
  };
  return api;
}

// Without WebGL2: the full style keeps its gradient; clouds style draws nothing.
function createGradientSky(canvas, opaque) {
  const ctx = canvas.getContext('2d');
  let width = 1, height = 1;
  return {
    backend: 'canvas',
    style: opaque ? 'full' : 'clouds',
    available: !!ctx,
    resize(w, h) { width = w; height = h; canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h)); },
    render({ condition, night }) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (!opaque) return;
      const [palette] = LOOKS[condition] || LOOKS.clear;
      const [top, bottom] = SKIES[palette][night ? 'night' : 'day'];
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    },
    dispose() {}
  };
}
