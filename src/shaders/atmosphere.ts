// In-overlay atmosphere program (Three.js ShaderMaterial): sun or moon, mist and
// cloud ceiling, drawn only when no backdrop canvas does it.

export const ATMOSPHERE_VERTEX = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const ATMOSPHERE_FRAGMENT = `varying vec2 vUv; uniform float time, kind, night, aspect, strength, wind, flash;
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
      `;
