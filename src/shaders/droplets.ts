// Rain on glass: drops that stick, slip and leave beaded trails, plus resting
// drops that appear and evaporate. Original GLSL (WebGL2 / GLSL ES 3.00).
// Integer hash: lowbias32 by Chris Wellons (hash-prospector, public domain).
//
// rainLayers returns, per layer: xy refraction offset, z coverage, w rim.
export const dropletFunctions = /* glsl */ `
float saturate(float x) { return clamp(x, 0.0, 1.0); }

uint lowbias32(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du;
  x ^= x >> 15u; x *= 0x846ca68bu;
  x ^= x >> 16u; return x;
}
float hash3(vec2 cell, float seed) {
  uvec2 q = uvec2(ivec2(floor(cell)) + ivec2(65536));
  uint h = lowbias32(q.x ^ lowbias32(q.y ^ lowbias32(uint(seed * 977.0) + 0x9e3779b9u)));
  return float(h >> 8u) / 16777216.0;
}
float cellHash(vec2 cell) { return hash3(cell, 0.0); }
vec4 hash4(vec2 cell, float seed) {
  return vec4(hash3(cell, seed), hash3(cell, seed + 1.0), hash3(cell, seed + 2.0), hash3(cell, seed + 3.0));
}

// Drops hold still while they gather water, then slip a short way.
float slip(float t, float rate) {
  float k = t * rate;
  float stepped = floor(k) + smoothstep(.55, 1.0, fract(k));
  return stepped / rate;
}

// p: isotropic units, one column wide. Each column carries one drop per
// lane; the lane pattern scrolls down, so drops and their trails move together.
vec4 slidingDrops(vec2 p, float time, float seed, float density) {
  const float LANE = 4.0;
  float column = floor(p.x);
  vec4 r = hash4(vec2(column, 0.0), seed);
  float fall = slip(time * (.12 + r.y * .1) + r.z * 9.0, 1.5 + r.w * 2.0) * 4.0;
  float travel = p.y + fall;
  vec4 s = hash4(vec2(column, floor(travel / LANE)), seed + 7.0);
  if (s.x >= density) return vec4(0.0);
  vec2 local = vec2(fract(p.x) - .5, mod(travel, LANE) - LANE * .5);
  float wander = sin(travel * 1.7 + s.y * 6.28) * .07 + sin(travel * 4.3 + s.z * 6.28) * .025;
  vec2 center = vec2((s.y - .5) * .45 + wander, -1.3 + s.w * .9);
  float radius = .14 + s.z * .08;
  vec2 d = local - center;
  // Slightly taller than wide, with a rounder leading edge.
  vec2 shaped = d * vec2(1.0, d.y < 0.0 ? .85 : .72);
  float dist = length(shaped);
  float body = 1.0 - smoothstep(radius * .8, radius, dist);

  // Beads left in the wake, shrinking with distance behind the drop.
  float behind = d.y;
  float row = local.y * 3.0 + s.y * 5.0;
  vec2 bd = vec2(local.x - center.x + wander * .3, (fract(row) - .5) / 3.0);
  float beadSize = radius * .35 * (1.0 - smoothstep(.2, 2.0, behind)) * (.5 + .5 * hash3(vec2(column, floor(row)), seed + 13.0));
  float bead = behind > radius * 1.4 ? 1.0 - smoothstep(beadSize * .7, beadSize, length(bd)) : 0.0;
  // A faint wet track joining them.
  float track = behind > 0.0 ? (1.0 - smoothstep(0.0, radius * .3, abs(bd.x))) * (1.0 - smoothstep(0.0, 1.6, behind)) * .2 : 0.0;

  float coverage = max(max(body, bead), track);
  vec2 offset = body > 0.0 ? shaped / radius * body : bd / max(beadSize, .001) * bead * .5;
  float rim = smoothstep(radius * .55, radius * .95, dist) * body + bead * .35;
  return vec4(offset * .05, coverage, rim);
}

// Resting drops in a finer grid. Each grows quickly, then shrinks away.
vec4 restingDrops(vec2 uv, float time, float seed, float density) {
  vec2 grid = uv * 20.0, cell = floor(grid);
  vec4 r = hash4(cell, seed);
  if (r.x >= density) return vec4(0.0);
  float age = fract(time * (.05 + r.w * .05) + r.y);
  float size = smoothstep(0.0, .06, age) * mix(1.0, .45, age);
  float fade = 1.0 - smoothstep(.8, 1.0, age);
  vec2 local = fract(grid) - .5;
  float radius = (.12 + r.z * .14) * size;
  vec2 center = (vec2(r.y, r.z) - .5) * (.8 - 2.0 * radius);
  vec2 d = local - center;
  float angle = atan(d.y, d.x);
  float edge = radius * (1.0 + .06 * sin(angle * 3.0 + r.w * 6.28) + .03 * sin(angle * 5.0 + r.y * 6.28));
  float dist = length(d);
  float body = (1.0 - smoothstep(edge * .78, edge, dist)) * fade;
  float rim = smoothstep(edge * .5, edge * .95, dist) * body;
  return vec4(d / max(edge, .001) * body * .03, body, rim);
}

void rainLayers(vec2 uv, float time, float seed,
                float movingDensity, float stillDensity, out vec4 moving, out vec4 still) {
  vec4 near = slidingDrops(uv * 10.0, time, seed, movingDensity);
  vec4 far = slidingDrops(uv * 14.0 + vec2(.5, 0.0), time * .85, seed + 31.0, movingDensity * .8);
  moving = near + far * saturate(1.0 - near.z);
  vec4 large = restingDrops(uv, time, seed + 59.0, stillDensity);
  vec4 small = restingDrops(uv * 1.6 + 3.7, time, seed + 83.0, stillDensity);
  still = large + small * (1.0 - large.z);
}
`;
