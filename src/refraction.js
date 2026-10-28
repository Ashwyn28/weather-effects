import { dropletFunctions } from './droplet-shader.js';

// Droplet refraction and frost over a caller-supplied background. The
// background is redrawn into one texture only after invalidate() or a
// condition/theme change, never per frame. Areas left transparent stay clear.
export function createRefractionLayer(scene, THREE) {
  const source = typeof OffscreenCanvas === 'function' && !globalThis.document ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  const ctx = source.getContext('2d');
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const uniforms = {
    background: { value: texture }, resolution: { value: new THREE.Vector2(1, 1) },
    pageColor: { value: new THREE.Color() }, time: { value: 0 },
    rain: { value: 0 }, frost: { value: 0 }, density: { value: .65 }, dark: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, uniforms,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D background;
      uniform vec2 resolution;
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
        vec2 uv = vUv * resolution / 750.0;
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
      }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  scene.add(mesh);
  let width = 1, height = 1, dirty = true, lastTheme = '', previousTime, background = null;

  // background: a drawable (image, canvas, video, ImageBitmap) stretched over
  // the viewport, or a function (ctx, { width, height, night }) that paints in
  // CSS pixels and may return { color } for the page colour behind it.
  function capture(dark) {
    dirty = false;
    if (!ctx) return;
    const scale = Math.min(1.5, 2048 / Math.max(width, height));
    const w = Math.max(1, Math.round(width*scale)), h = Math.max(1, Math.round(height*scale));
    // Three.js allocates fixed-size texture storage; a new size needs a new upload.
    if (w !== source.width || h !== source.height) texture.dispose();
    source.width = w; source.height = h;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    let color;
    if (typeof background === 'function') color = background(ctx, { width, height, night: dark })?.color;
    else if (background) ctx.drawImage(background, 0, 0, width, height);
    uniforms.pageColor.value.set(color || (dark ? '#232426' : '#f4f5f2'));
    texture.needsUpdate = true;
  }
  return {
    setBackground(next) { background = next || null; dirty = true; },
    dispose() { texture.dispose(); material.dispose(); mesh.geometry.dispose(); scene.remove(mesh); },
    invalidate() { dirty = true; },
    resize(w, h) {
      width = w; height = h; dirty = true;
      uniforms.resolution.value.set(w,h);
      mesh.position.set(w/2,h/2,60); mesh.scale.set(w,h,1);
    },
    update(condition, dark, milliseconds, reduced) {
      const wet = ['rain','drizzle','showers','thunderstorm','freezing-rain','freezing-drizzle'].includes(condition);
      const frozen = ['freezing-rain','freezing-drizzle','snow','snow-showers'].includes(condition);
      const dt = previousTime === undefined ? 1 : Math.max(0, Math.min(.04,(milliseconds-previousTime)/1000));
      previousTime = milliseconds;
      const blend = reduced ? 1 : 1-Math.exp(-dt*3);
      uniforms.rain.value += (Number(wet)-uniforms.rain.value)*blend;
      uniforms.frost.value += ((frozen ? (wet ? .85 : .45) : 0)-uniforms.frost.value)*blend;
      mesh.visible = uniforms.rain.value > .005 || uniforms.frost.value > .005;
      if (!mesh.visible) return;
      const theme = `${condition}:${dark}`;
      if (theme !== lastTheme) { dirty = true; lastTheme = theme; }
      if (dirty) capture(dark);
      uniforms.time.value = 12 + milliseconds/1000;
      uniforms.dark.value = Number(dark);
      uniforms.density.value = condition.includes('drizzle') ? .35 : condition === 'thunderstorm' || condition === 'showers' ? .85 : .65;
    }
  };
}
