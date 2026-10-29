import { createRefractionLayer } from './refraction.js';

// Viewport coordinates (CSS pixels, y down) keep weather aligned with the
// caller's surfaces. Throws when WebGL is unavailable.
// atmosphere: draw sun, fog and clouds on this layer (off when a backdrop
// canvas draws them). lightRain: light streaks for a dark full sky.
export function createThreeRenderer(canvas, THREE, { pixelRatio, onLost, onRestored, atmosphere: showAtmosphere = true, lightRain = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const refraction = createRefractionLayer(scene, THREE);
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, .1, 1000);
  camera.position.z = 500;
  scene.add(new THREE.HemisphereLight('#ffffff', '#748b9b', 2));
  const light = new THREE.DirectionalLight('#d9edf8', 2); light.position.set(-100, 300, 250); scene.add(light);
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  let height = 1, lost = false, width = 1;
  // Instance colour carries per-particle values: r opacity, g softness or
  // hue, b leaf side.
  const vertexShader = `varying vec2 vUv; varying float vOpacity, vSoft, vSide;
    void main() { vUv = uv; vOpacity = instanceColor.r; vSoft = instanceColor.g; vSide = instanceColor.b;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
  const shapes = {
    // Thin streak, brightest at the leading (lower) end; near drops blur wider.
    rain: `alpha = (1.0 - smoothstep(mix(.15, 0.0, vSoft), 1.0, abs(p.x)))
      * (1.0 - smoothstep(.7, 1.0, abs(p.y))) * mix(.1, 1.0, smoothstep(1.0, -.6, p.y));`,
    // Soft round flake with a faint cool rim so it reads on light pages.
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
      shade *= mix(1.12, .82, vSide) * (1.0 - .25 * (1.0 - smoothstep(.0, .05, abs(p.y))));`
  };
  function batch(kind, capacity) {
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false,
      uniforms: { color: { value: new THREE.Color() }, color2: { value: new THREE.Color() } }, vertexShader,
      fragmentShader: `uniform vec3 color, color2; varying vec2 vUv; varying float vOpacity, vSoft, vSide;
        void main() { vec3 shade = color; vec2 p = vUv * 2.0 - 1.0; float alpha;
          ${shapes[kind]}
          gl_FragColor = vec4(shade, alpha * vOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    // Allocate instance colours before the shader compiles.
    mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.count = 0; scene.add(mesh);
    return mesh;
  }
  const drops = batch('rain', 660), flakes = batch('snow', 300), wind = batch('wind', 240);
  const splashes = batch('splash', 200), caps = batch('deposit', 450), beads = batch('deposit', 240), trails = batch('trail', 40);
  const hail = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#d5e5eb', roughness: .3, transparent: true, opacity: .8 }), 240);
  hail.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hail.frustumCulled = false; hail.count = 0; scene.add(hail);
  const batches = [drops, flakes, wind, hail, splashes, caps, beads, trails];
  const atmosphereMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false,
    uniforms: { time: { value: 0 }, kind: { value: 0 }, night: { value: 0 }, strength: { value: 1 }, aspect: { value: 1 }, wind: { value: 0 }, flash: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float time, kind, night, aspect, strength, wind, flash;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      float cloud(vec2 p) { float n=0.0, weight=.5;
        for(int i=0;i<4;i++) { n += noise(p)*weight; p=p*2.03+vec2(7.1,3.4); weight*=.5; } return n; }
      void main() { float alpha = 0.0; vec3 color = vec3(0.0);
        if (kind == 1.0 || kind == 2.0) {
          vec2 p = (vUv - vec2(.82,.9)) * vec2(aspect,1.0);
          float halo = exp(-dot(p,p) * 6.0);
          float rays = pow(.5+.5*sin(atan(p.y,p.x)*13.0+time*.035), 6.0);
          alpha = halo * (.12 + rays * .045) * (1.0-night);
          color = vec3(.98,.83,.54);
          if (night > .5) {
            float moon = 1.0-smoothstep(.018,.022,length(p));
            float cutout = 1.0-smoothstep(.018,.022,length(p-vec2(.011,.007)));
            vec2 grid = vUv * vec2(aspect * 65.0,65.0);
            vec2 cell = floor(grid);
            float star = (1.0-smoothstep(.01,.075,length(fract(grid)-.5))) * step(.98,hash(cell));
            star *= smoothstep(.48,.9,vUv.y) * (.55+.25*sin(time*.6+hash(cell)*40.0));
            alpha = max(moon*(1.0-cutout)*.7, halo*.065+star*.7);
            color = vec3(.78,.86,1.0);
          }
        }
        if (kind == 3.0) {
          // Two mist banks drift at different speeds, rolling across the entire viewport.
          vec2 q=vUv*vec2(aspect*3.2,2.4);
          float nearMist=cloud(q+vec2(time*.055, time*.012));
          float farMist=cloud(q*1.6+vec2(-time*.024,3.0));
          float bank=smoothstep(.22,.78,nearMist*.65+farMist*.35);
          alpha=(.06+bank*.28) * mix(1.0,.8,night);
          color=mix(vec3(.84,.88,.88),vec3(.39,.45,.48),night);
        } else if (kind >= 2.0) {
          // A broad cloud ceiling with a billowing lower edge, separate from ground fog.
          float speed=wind*.0005+.012;
          vec2 q=vUv*vec2(aspect*3.0,3.6)+vec2(time*speed,0.0);
          float billows=cloud(q), detail=cloud(q*1.7+vec2(5.0,-time*.008));
          float edge=.75+(noise(vec2(q.x*.8,time*.012))-.5)*.2;
          float ceiling=smoothstep(edge-.13,edge+.08,vUv.y);
          float coverage=kind==4.0 ? .8 : kind==5.0 ? .42 : .3;
          alpha+=ceiling*(.28+billows*.6)*coverage;
          if(kind==4.0) alpha += .045 + detail*.035;
          color=mix(mix(vec3(.54,.60,.63),vec3(.80,.83,.84),detail),mix(vec3(.13,.18,.22),vec3(.34,.40,.44),detail),night);
        }
        color=mix(color,vec3(.85,.9,1.0),flash);
        gl_FragColor = vec4(color,min(.5,alpha * strength + flash*.07));
        #include <colorspace_fragment>
      }` });
  const atmosphere = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), atmosphereMaterial); atmosphere.renderOrder = -1; atmosphere.visible = showAtmosphere; scene.add(atmosphere);
  function instance(mesh, x, y, z, sx, sy, angle, opacity = 1, g = 0, b = 0) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    transform.position.set(x, height - y, z); transform.rotation.set(0, 0, angle);
    transform.scale.set(sx, sy, mesh === hail ? sx : 1); transform.updateMatrix();
    mesh.setMatrixAt(mesh.count, transform.matrix);
    if (mesh !== hail) { const alpha = Math.max(0, Math.min(1, opacity)); tint.setRGB(alpha, g, b); mesh.setColorAt(mesh.count, tint); }
    mesh.count++;
  }
  const api = {
    backend: 'threejs',
    setBackground(source) { refraction.setBackground(source); },
    invalidateBackground() { refraction.invalidate(); },
    resize(w, h) { refraction.resize(w,h); width = w; height = h; renderer.setSize(w, h, false); camera.right = w; camera.top = h; camera.updateProjectionMatrix(); atmosphere.position.set(w/2, h/2, -10); atmosphere.scale.set(w, h, 1); atmosphereMaterial.uniforms.aspect.value = w/h; },
    begin(condition, dark, time, state = {}) {
      refraction.update(condition, dark, time, state.reduced);
      batches.forEach(mesh => { mesh.count = 0; });
      const lightStreaks = lightRain || dark;
      drops.material.uniforms.color.value.set(lightStreaks ? '#dfe8f2' : '#566b7b');
      splashes.material.uniforms.color.value.set(lightStreaks ? '#d6e6ee' : '#4f6b80');
      beads.material.uniforms.color.value.set(lightStreaks ? '#e2eff7' : '#58758a');
      flakes.material.uniforms.color.value.set(dark || lightRain ? '#f6f9fb' : '#ffffff');
      flakes.material.uniforms.color2.value.set(dark || lightRain ? '#c3d0db' : '#7c8fa1');
      trails.material.uniforms.color.value.set(dark ? '#9fb2bf' : '#8a9ca8');
      wind.material.uniforms.color.value.set(dark ? '#7d8d63' : '#6c8a45');
      wind.material.uniforms.color2.value.set(dark ? '#9b8257' : '#c08b3a');
      caps.material.uniforms.color.value.set('#f6fafb');
      atmosphereMaterial.uniforms.kind.value = ['clear', 'mainly-clear'].includes(condition) ? 1 : condition === 'fog' ? 3 : ['overcast','thunderstorm','hail','rain','showers','drizzle','freezing-rain','freezing-drizzle','snow','snow-showers'].includes(condition) ? 4 : condition === 'wind' ? 5 : condition === 'partly-cloudy' ? 2 : 0;
      atmosphereMaterial.uniforms.strength.value = ['thunderstorm','hail'].includes(condition) ? .7 : .4;
      if (Number.isFinite(state.cloudCover) && atmosphereMaterial.uniforms.kind.value === 4) atmosphereMaterial.uniforms.strength.value *= .5 + state.cloudCover / 200;
      atmosphereMaterial.uniforms.wind.value = state.wind || 0;
      const stormPulse = Math.max(0, Math.sin(time / 1000 * Math.PI / 9));
      atmosphereMaterial.uniforms.flash.value = condition === 'thunderstorm' && !state.reduced ? Math.pow(stormPulse, 100) * .7 : 0;
      atmosphereMaterial.uniforms.night.value = Number(dark); atmosphereMaterial.uniforms.time.value = time/1000;
    },
    particle(p, condition, dark) {
      const depth = p.depth || 0, scale = .45 + depth * 1.15;
      if (condition === 'snow' || condition === 'snow-showers') {
        // Near flakes are out of focus: larger, softer, fainter.
        const soft = depth > .72 ? (depth - .72) / .28 : depth < .12 ? .3 : 0;
        const size = (2.2 + p.size * 2) * scale * (1 + soft * .9);
        instance(flakes, p.x, p.y, depth*30, size, size, 0, (.55 + depth * .4) * (1 - soft * .4), soft);
      } else if (condition === 'hail') instance(hail, p.x, p.y, depth*30, p.size*scale, p.size*scale, p.phase);
      else if (condition === 'wind') {
        // Leaves turn over as they tumble: width follows the flip angle.
        const flip = p.flip ?? p.phase, side = .5 + .5 * Math.cos(flip);
        instance(wind, p.x, p.y, depth*30, 17*scale*(.18 + .82*Math.abs(Math.cos(flip))), 8*scale, p.phase, .92, p.hue ?? .3, side);
        if (depth < .3 && Math.abs(p.vx) > 60) instance(trails, p.x - Math.sign(p.vx)*70, p.y + 6, 0, 150*scale, 14, 0, .1);
      } else {
        // Streak length is the distance a drop covers during a short exposure.
        const heavy = ['showers','thunderstorm'].includes(condition), drizzle = condition.includes('drizzle');
        const speed = Math.hypot(p.vx, p.vy), exposure = (drizzle ? .04 : heavy ? .045 : .038) * (lightRain ? 1.5 : 1);
        const length = Math.max(4, Math.min(120, speed * exposure));
        const blur = depth > .8 ? (depth - .8) * 5 : 0;
        const angle = Math.atan2(p.vx, p.vy);
        // Drizzle drops are fine, so each streak is thinner but a little more opaque.
        const opacity = (lightRain || dark ? .12 + depth * .38 : .16 + depth * .36) * (1 - blur * .35) * (drizzle ? 1.15 : 1);
        const shown = drizzle ? Math.max(opacity, width < 700 ? .34 : .24) : opacity;
        instance(drops, p.x - Math.sin(angle)*length/2, p.y - Math.cos(angle)*length/2, depth*30, Math.max(drizzle && width < 700 ? .85 : 0, (.55 + depth*.75) * (1 + blur * .8) * (drizzle ? .75 : 1)), length, angle, shown, blur);
      }
    },
    // A crown that opens out from the impact, with spray thrown up around it.
    splash(p) { const r = (1-p.life)*11+2; instance(splashes,p.x,p.y,40,r*2,r*.5,-p.angle,Math.min(1,p.life*1.3)*.62); },
    droplet(p) { instance(beads,p.x,p.y,41,p.size*2,p.size*2.6,Math.atan2(p.vx,p.vy),p.life*.75); },
    deposit(p) { instance(caps,p.x,p.y-p.size*.22,40,p.size*3.6,p.size*1.25,-p.angle,p.life*.95); },
    render() { if (lost) return; batches.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }); renderer.render(scene,camera); },
    get available() { return !lost; },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lose);
      canvas.removeEventListener('webglcontextrestored', restore);
      refraction.dispose();
      scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      renderer.dispose();
    }
  };
  const lose = event => { event.preventDefault(); lost = true; canvas.hidden = true; onLost?.(); };
  const restore = () => { lost = false; canvas.hidden = false; refraction.invalidate(); api.resize(width, height); onRestored?.(); };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);
  return api;
}

