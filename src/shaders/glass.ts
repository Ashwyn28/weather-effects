import { dropletFunctions } from './droplets.js';

// Glass droplet program (WebGL2, GLSL ES 3.00): drops and frost on a pane.

export const GLASS_VERTEX = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

export const GLASS_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D background;
uniform vec2 resolution;
uniform float time, rain, frost, density, stillDensity, dark, dropScale, seed, outside;
${dropletFunctions}
// Refraction never pulls in what lies outside the glass (transparent areas).
vec3 sampleScene(vec2 uv, vec3 fallback) { vec4 s = texture(background, clamp(uv, vec2(0.0), vec2(1.0))); return mix(fallback, s.rgb, smoothstep(.5, 1.0, s.a)); }
void main() {
  vec4 base = texture(background, vUv);
  if (base.a < .01) discard;
  vec2 uv = vUv * resolution / dropScale;
  vec4 moving, still;
  rainLayers(uv, time, seed, density, stillDensity, moving, still);
  float coverage = saturate(moving.z + still.z);
  vec2 displacement = (moving.xy + still.xy) * .9;
  vec3 refracted = sampleScene(vUv - displacement, base.rgb);
  // Inside the glass, light catches the top of each drop and its rim. Seen
  // through the glass from inside, outside drops are lit from behind: a soft
  // bright lower edge, no crisp rim, and lower contrast overall.
  float shading = -(moving.y + still.y);
  float highlight = outside > .5
    ? clamp(-shading * 1.3, -.08, .2)
    : clamp(shading * 2.2 + (moving.w + still.w) * .12, -.18, .38);
  vec3 color = refracted + highlight * mix(1.0, outside > .5 ? 2.6 : 1.6, dark);
  float alpha = coverage * rain * (outside > .5 ? mix(.62, .85, dark) : 1.0);
  // Against a bright daytime sky a clear drop shows mostly by its rim, which
  // refracts the darker room and ground: shade rims and bodies slightly.
  if (outside > .5) {
    float rim = saturate((moving.w + still.w) * .9);
    color *= 1.0 - (rim * .28 + coverage * .07) * (1.0 - dark);
    alpha = max(alpha, rim * rain * .7 * (1.0 - dark));
  }

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
  alpha = max(alpha, frozen);
  // Outside: a faint reflection on the glass sits in front of the drops.
  if (outside > .5) {
    float sheen = (.05 + .07 * smoothstep(.2, 1.0, vUv.y + vUv.x * .3)) * max(rain, frost) * mix(1.0, .45, dark);
    vec3 reflection = mix(vec3(1.0), vec3(.62, .7, .85), dark);
    color = mix(color, reflection, sheen / max(alpha + sheen, .001));
    alpha = alpha + sheen * (1.0 - alpha);
  }
  alpha *= base.a;
  if (alpha < .002) discard;
  outColor = vec4(color * alpha, alpha);
}`;
