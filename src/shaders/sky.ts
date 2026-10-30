// Backdrop sky program (WebGL2, GLSL ES 3.00): gradient, stars, clouds and fog.

export const SKY_VERTEX = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

export const SKY_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float time, scale, opaque, coverage, wispy, stars, mist, sun, flash, drift, reach;
// 0 on desktop, rising to 1 on phones: slightly denser and brighter stars.
uniform float compact;
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
  vec2 centre = (id + .15 + .7 * vec2(hash(id + 11.0), hash(id + 23.0))) * cell;
  vec2 d = px - centre;
  // Fade everything out before the cell edge, so no glow is cut off square.
  vec2 inCell = centre - id * cell;
  float room = min(min(inCell.x, cell - inCell.x), min(inCell.y, cell - inCell.y));
  float window = 1.0 - smoothstep(room * .55, room * .95, length(d));
  float bright = pow(hash(id + 37.0), 3.0);
  float phase = hash(id + 51.0) * 6.2832, rate = .7 + 1.6 * hash(id + 61.0);
  float twinkle = .72 + .18 * sin(t * rate + phase) + .1 * sin(t * rate * 2.7 + phase * 3.1)
    + pow(max(0.0, sin(t * rate * .37 + phase * 5.0)), 24.0) * .5 * bright;
  float d2 = dot(d, d);
  float core = exp(-d2 / ((.3 + bright * .25) * (1.0 + compact * .15)));
  float glow = exp(-sqrt(d2) / (1.2 + bright * 2.2)) * .2 * (.3 + bright);
  float spikes = max(0.0, bright - .55) * .9 * (
      exp(-abs(d.x) * 2.2 - d.y * d.y / .12) + exp(-abs(d.y) * 2.2 - d.x * d.x / .12));
  float light = (core * (.55 + .45 * bright) + glow + spikes) * twinkle * window;
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
  float starBand = opaque > .5 ? 1.0 : smoothstep(mix(.6, .45, compact), .95, uv.y) * (1.0 + compact * .3);
  vec4 star = starField(px, opaque > .5 ? 24.0 : mix(36.0, 32.0, compact), opaque > .5 ? .45 : .3, time);
  if (opaque > .5) { vec4 faint = starField(px, 11.0, .1, time * 1.3); if (faint.a * .5 > star.a) star = vec4(faint.rgb, faint.a * .5); }
  col = over(col, star.rgb, clamp(stars * starBand * (1.0 - wisp * .8) * (1.0 - cloudAlpha) * star.a, 0.0, 1.0));
  col = over(col, mix(cloudLight, cloudShadow, .25), wisp * .55);
  col = over(col, cloud, cloudAlpha);
  col = over(col, cloudLight, fog * .6);
  col = over(col, vec3(.86, .9, 1.0), flash * (.15 + cloudAlpha * .5));
  if (col.a > 0.0) col.rgb += (hash(gl_FragCoord.xy) - .5) / 255.0 * col.a;
  color = col;
}`;
