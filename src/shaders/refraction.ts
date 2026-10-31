import { dropletFunctions } from './droplets.js';

// Refraction layer program (Three.js ShaderMaterial): droplets and frost over the
// page background.

export const REFRACTION_VERTEX = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const REFRACTION_FRAGMENT = /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D background;
      uniform vec2 resolution;
      uniform float dropScale;
      uniform vec3 pageColor;
      uniform float time, rain, frost, density, dark;
      ${dropletFunctions}
      vec3 sampleScene(vec2 uv) {
        vec4 source = texture2D(background, clamp(uv, vec2(0.0), vec2(1.0)));
        return mix(pageColor, source.rgb, source.a);
      }
      void main() {
        vec4 base = texture2D(background, vUv);
        if (base.a < .01) discard;
        // CSS pixel scale keeps droplets consistent on mobile and retina screens.
        vec2 uv = vUv * resolution / dropScale;
        vec4 moving, still;
        rainLayers(uv, time, 7.0, density, density*.55, moving, still);
        float coverage = saturate(moving.z + still.z);
        vec2 displacement = (moving.xy + still.xy) * (2.0-vUv.y) * .11;
        vec3 refracted = sampleScene(vUv-displacement);
        float highlight = clamp(-(moving.y+still.y)*1.6 + (moving.w+still.w)*.08, -.15, .3);
        vec3 color = mix(sampleScene(vUv), refracted + highlight, rain);
        float alpha = coverage * rain * .7;

        // Procedural frost: heavier at the edges of painted shapes, with
        // six-armed crystals scattered across them.
        vec2 texel = 2.0/resolution;
        float neighbors = texture2D(background,vUv+vec2(texel.x,0)).a
          * texture2D(background,vUv-vec2(texel.x,0)).a
          * texture2D(background,vUv+vec2(0,texel.y)).a
          * texture2D(background,vUv-vec2(0,texel.y)).a;
        vec2 crystalUV = vUv*resolution/10.0;
        float grain = cellHash(floor(crystalUV));
        vec2 p = fract(crystalUV)-.5;
        float branches = pow(abs(cos(atan(p.y,p.x)*3.0+grain*6.28)), 14.0);
        float ice = (1.0-smoothstep(.1,.6,length(p))) * branches;
        float frozen = frost * clamp((1.0-neighbors)*.65 + ice*.38 + grain*.06, 0.0, .7);
        color = mix(color, mix(vec3(.75,.86,.92),vec3(.58,.73,.85),dark), frozen);
        alpha = max(alpha, frozen);
        if (alpha < .002) discard;
        gl_FragColor = vec4(color, alpha * base.a);
        #include <colorspace_fragment>
      }`;
