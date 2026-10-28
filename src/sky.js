// Opaque sky drawn behind page content: gradient, stars, wispy and heavy
// clouds, fog, sun glow and lightning. Raw WebGL2 with a 2D gradient fallback.

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);

// [top, bottom, cloud light, cloud shadow]
const PALETTES = {
  clear:  { day: ['#2a63c4', '#8dbbe9', '#f3f7fc', '#b9cde3'], night: ['#11142e', '#393c6b', '#5f6192', '#24264a'] },
  partly: { day: ['#2f68c4', '#93bfe8', '#ffffff', '#b4c7dc'], night: ['#222347', '#4c4b7c', '#7c7ab0', '#2a2a4c'] },
  cloudy: { day: ['#5b7084', '#a4b3c1', '#e6ebf0', '#6f7d8b'], night: ['#222347', '#4c4b7c', '#7c7ab0', '#2a2a4c'] },
  rain:   { day: ['#3d4955', '#77848f', '#a6b0bb', '#2a323b'], night: ['#181c25', '#373e4b', '#5d6676', '#0b0e13'] },
  storm:  { day: ['#29313b', '#58626d', '#8a95a1', '#1a1f25'], night: ['#111419', '#2b313b', '#4a5260', '#07080b'] },
  snow:   { day: ['#6a7d92', '#a9b8c7', '#e6ecf2', '#8495a7'], night: ['#283041', '#4f596a', '#6d7788', '#232a36'] },
  fog:    { day: ['#7c8891', '#adb5ba', '#d3d8db', '#8f989f'], night: ['#363b42', '#575d64', '#6d737a', '#2c3036'] }
};

// Per condition: palette, wispy clouds, heavy clouds, stars, mist, sun.
const LOOKS = {
  'clear':            ['clear', 0,   0,   1,   0,   1],
  'mainly-clear':     ['partly', .35, 0,   .9,  0,   .8],
  'partly-cloudy':    ['partly', .7, .45, .6,  0,   .5],
  'overcast':         ['cloudy', .45, .9, .15, 0,   0],
  'fog':              ['fog',   0,   .35, 0,   1,   0],
  'drizzle':          ['rain',  .3,  .75, 0,   .2,  0],
  'freezing-drizzle': ['rain',  .3,  .75, 0,   .2,  0],
  'rain':             ['rain',  .2,  .9,  0,   .1,  0],
  'freezing-rain':    ['rain',  .2,  .9,  0,   .1,  0],
  'showers':          ['rain',  .2,  .95, 0,   .1,  0],
  'thunderstorm':     ['storm', 0,   1,   0,   .1,  0],
  'hail':             ['storm', 0,   1,   0,   .1,  0],
  'snow':             ['snow',  .2,  .7,  0,   .25, 0],
  'snow-showers':     ['snow',  .1,  .85, 0,   .3,  0],
  'wind':             ['partly', .85, .2, .5,  0,   .4]
};

const VERTEX = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float time, scale, wispy, heavy, stars, mist, sun, flash, drift;
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

// Point stars on a pixel grid so density holds at any size.
float starField(vec2 px, float cell, float chance, float t) {
  vec2 id = floor(px / cell);
  float r = hash(id * 1.37 + cell);
  if (r > chance) return 0.0;
  vec2 centre = (id + .2 + .6 * vec2(hash(id + 11.0), hash(id + 23.0))) * cell;
  float bright = pow(hash(id + 37.0), 2.5);
  float size = .55 + bright * 1.1;
  float twinkle = .75 + .25 * sin(t * (.6 + 2.0 * hash(id + 51.0)) + r * 60.0);
  float d = length(px - centre);
  return (1.0 - smoothstep(size * .4, size, d)) * (.25 + .75 * bright) * twinkle
       + exp(-d * d / (size * 9.0)) * bright * .25;
}

void main() {
  vec2 px = gl_FragCoord.xy / scale;
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 sky = mix(bottom, top, smoothstep(0.0, 1.0, uv.y));

  // Sun glow, upper right.
  vec2 s = (uv - vec2(.82, 1.02)) * vec2(aspect, 1.0);
  sky += sun * vec3(1.0, .86, .62) * (exp(-dot(s, s) * 5.0) * .32 + exp(-dot(s, s) * 60.0) * .25);

  // Long wisps, stretched sideways and slowly drifting.
  vec2 w = p * vec2(1.1, 4.2) + vec2(time * .012 * drift, 0.0);
  w += .7 * vec2(fbm(w * .5 + vec2(0.0, time * .004)), fbm(w * .5 + 7.3));
  float wisp = smoothstep(.45, .78, fbm(w)) * wispy * (.35 + .65 * uv.y);

  // Heavy clouds: soft masses that gather at the top, lit from above.
  vec2 c = p * 1.2 + vec2(time * .008 * drift, 0.0);
  vec2 warp = vec2(fbm(c * .6 + vec2(time * .003, 1.7)), fbm(c * .6 + 4.1));
  float d = fbm(c + warp * .8);
  float lit = fbm(c + warp * .8 + vec2(-.035, .07));
  float bank = d * (.45 + .75 * smoothstep(.05, .95, uv.y));
  float cloud = smoothstep(.34, .62, bank) * heavy;
  float shade = clamp((lit - d) * 10.0 + .45 + uv.y * .25, 0.0, 1.0);
  vec3 cloudColor = mix(cloudShadow, cloudLight, shade);

  // Low banks of mist.
  vec2 m = p * vec2(1.4, 3.0) + vec2(time * .02, 0.0);
  float fog = smoothstep(.3, .75, fbm(m + fbm(m * .7 + time * .01))) * (1.0 - smoothstep(.15, .85, uv.y)) * mist;

  vec3 col = sky;
  col += stars * (1.0 - cloud) * (1.0 - wisp * .8) * (
    starField(px, 26.0, .42, time) + starField(px, 11.0, .1, time * 1.3) * .6);
  col = mix(col, cloudLight, wisp * .7);
  col = mix(col, cloudColor, cloud * .95);
  col = mix(col, cloudLight, fog * .6);
  col += flash * vec3(.55, .6, .75) * (.25 + cloud * .9);
  col += (hash(gl_FragCoord.xy) - .5) / 255.0;
  color = vec4(col, 1.0);
}`;

function target(condition, night, cloudCover) {
  const [palette, wispy, heavy, stars, mist, sun] = LOOKS[condition] || LOOKS.clear;
  const colors = PALETTES[palette][night ? 'night' : 'day'].map(hex);
  const cover = Number.isFinite(cloudCover) && heavy > 0 && heavy < 1 ? .6 + cloudCover / 250 : 1;
  return {
    top: colors[0], bottom: colors[1], cloudLight: colors[2], cloudShadow: colors[3],
    wispy, heavy: Math.min(1, heavy * cover), stars: night ? stars : 0, mist, sun: night ? 0 : sun
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
function blend(current, next, t) {
  if (!current) return structuredClone(next);
  for (const key of Object.keys(next)) {
    current[key] = Array.isArray(next[key]) ? current[key].map((v, i) => lerp(v, next[key][i], t)) : lerp(current[key], next[key], t);
  }
  return current;
}

export function createSkyRenderer(canvas, { pixelRatio = 1, onRestored } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return createGradientSky(canvas);
  let program, uniforms, vao, lost = false, width = 1, height = 1, state;

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
    uniforms = {};
    for (const name of ['resolution', 'time', 'scale', 'wispy', 'heavy', 'stars', 'mist', 'sun', 'flash', 'drift', 'top', 'bottom', 'cloudLight', 'cloudShadow']) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    vao = gl.createVertexArray();
  }
  build();

  const lose = event => { event.preventDefault(); lost = true; };
  const restore = () => { lost = false; build(); api.resize(width, height); onRestored?.(); };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);

  const api = {
    backend: 'webgl2',
    get available() { return !lost; },
    resize(w, h) {
      width = w; height = h;
      canvas.width = Math.max(1, Math.round(w * pixelRatio));
      canvas.height = Math.max(1, Math.round(h * pixelRatio));
    },
    // dt of 0 jumps straight to the new look; otherwise it eases over ~1.5 s.
    render({ condition, night, time, dt = 0, wind = 0, cloudCover, flash = 0 }) {
      state = blend(state, target(condition, night, cloudCover), dt > 0 ? 1 - Math.exp(-dt * 2) : 1);
      if (lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program); gl.bindVertexArray(vao);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.scale, pixelRatio);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.flash, flash);
      gl.uniform1f(uniforms.drift, 1 + Math.min(3, Math.abs(wind) / 60));
      for (const key of ['wispy', 'heavy', 'stars', 'mist', 'sun']) gl.uniform1f(uniforms[key], state[key]);
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

// Without WebGL2: the same gradients, no clouds or stars.
function createGradientSky(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 1, height = 1;
  return {
    backend: 'canvas',
    available: !!ctx,
    resize(w, h) { width = w; height = h; canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h)); },
    render({ condition, night }) {
      if (!ctx) return;
      const [palette] = LOOKS[condition] || LOOKS.clear;
      const [top, bottom] = PALETTES[palette][night ? 'night' : 'day'];
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    },
    dispose() {}
  };
}
