export type ShapeKind = 'rain' | 'snow' | 'splash' | 'deposit' | 'trail' | 'wind';

// Instanced particle programs (Three.js ShaderMaterial). One vertex shader and
// one fragment body per particle shape.

// Instance colour carries per-particle values: r opacity, g softness or
// hue, b leaf side.
export const PARTICLE_VERTEX = `varying vec2 vUv; varying float vOpacity, vSoft, vSide;
    void main() { vUv = uv; vOpacity = instanceColor.r; vSoft = instanceColor.g; vSide = instanceColor.b;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;

export const PARTICLE_SHAPES: Record<ShapeKind, string> = {
  // Thin streak, brightest at the leading (lower) end; near drops blur wider.
  rain: `alpha = (1.0 - smoothstep(mix(.15, 0.0, vSoft), 1.0, abs(p.x)))
      * (1.0 - smoothstep(.7, 1.0, abs(p.y))) * mix(.1, 1.0, smoothstep(1.0, -.6, p.y));`,
  // Solid soft flake with a faint cool halo outside it, so white still
  // reads on a light page.
  snow: `float r = length(p);
      float core = 1.0 - smoothstep(mix(.3, 0.0, vSoft), mix(.6, .9, vSoft), r);
      float halo = (1.0 - smoothstep(.45, 1.0, r)) * .4 * (1.0 - vSoft * .6);
      alpha = max(core, halo);
      shade = mix(color2, color, core / max(alpha, .001));`,
  splash: `float r = length(p); alpha = (1.0 - smoothstep(.06, .2, abs(r - .75))) * (1.0 - smoothstep(.8, 1.0, r)) * step(-.1, p.y);`,
  deposit: `alpha = 1.0 - smoothstep(.65, 1.0, length(p));`,
  // A faint, gently curved gust line that fades at both ends.
  trail: `float curve = sin(p.x * 2.4 + 1.0) * .25; alpha = (1.0 - smoothstep(.0, .1, abs(p.y - curve))) * (1.0 - p.x * p.x);`,
  // Pointed leaf with a midrib; the underside (vSide low) is paler and duller.
  wind: `float x = p.x * .5 + .5;
      float halfWidth = sin(3.14159 * pow(x, .8)) * .95;
      float edge = abs(p.y) / max(.02, halfWidth);
      alpha = 1.0 - smoothstep(.75, 1.0, edge);
      alpha = max(alpha, (1.0 - smoothstep(.0, .06, abs(p.y))) * step(p.x, -.75) * step(-1.0, p.x));
      shade = mix(color, color2, vSoft);
      shade *= mix(1.12, .82, vSide) * (1.0 - .25 * (1.0 - smoothstep(.0, .05, abs(p.y))));`,
};

export const particleFragment = (
  kind: ShapeKind,
): string => `uniform vec3 color, color2; varying vec2 vUv; varying float vOpacity, vSoft, vSide;
        void main() { vec3 shade = color; vec2 p = vUv * 2.0 - 1.0; float alpha;
          ${PARTICLE_SHAPES[kind]}
          gl_FragColor = vec4(shade, alpha * vOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`;
