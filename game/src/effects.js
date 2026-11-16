// effects.js — pooled visual effects: spark bursts (one THREE.Points cloud),
// dust/smoke puffs (a sprite pool), tracer lines and flash sprites. Pools are
// fixed-size and recycled, so a firefight allocates nothing per frame.

import * as THREE from 'three';

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const MAX_SPARKS = 900;
const MAX_PUFFS = 56;
const MAX_TRACERS = 72;

export class Effects {
  constructor(scene) {
    // Sparks.
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkCol = new Float32Array(MAX_SPARKS * 3);
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkMax = new Float32Array(MAX_SPARKS);
    this.sparkGrav = new Float32Array(MAX_SPARKS);
    this.sparkHead = 0;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkGeo = sg;
    const sm = new THREE.PointsMaterial({
      size: 0.085, vertexColors: true, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true,
    });
    this.sparks = new THREE.Points(sg, sm);
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    for (let i = 0; i < MAX_SPARKS; i++) this.sparkPos[i * 3 + 1] = -50;

    // Puffs (dust, smoke, explosion clouds).
    this.puffTex = radialTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)');
    this.puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      const material = new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(material);
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, fadeIn: 0.12 });
    }
    this.puffHead = 0;

    // Tracers.
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    this.tracerCol = new Float32Array(MAX_TRACERS * 6);
    this.tracerLife = new Float32Array(MAX_TRACERS);
    this.tracerHead = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerGeo = tg;
    const tm = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    tm.frustumCulled = false;
    scene.add(tm);
    for (let i = 0; i < MAX_TRACERS; i++) { this.tracerPos[i * 6 + 1] = -50; this.tracerPos[i * 6 + 4] = -50; }

    // One reusable flash light for muzzles and explosions.
    this.light = new THREE.PointLight(0xffc978, 0, 16, 1.8);
    scene.add(this.light);
    this.lightLife = 0;
  }

  sparksBurst(x, y, z, { n = 10, color = 0xffc978, speed = 3.2, life = 0.4, gravity = -5, up = 1.5 } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.sparkHead;
      this.sparkHead = (this.sparkHead + 1) % MAX_SPARKS;
      this.sparkPos[i * 3] = x; this.sparkPos[i * 3 + 1] = y; this.sparkPos[i * 3 + 2] = z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.75);
      this.sparkVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.sparkVel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.6 + up * Math.random();
      this.sparkVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      const c = new THREE.Color(color);
      this.sparkCol[i * 3] = c.r; this.sparkCol[i * 3 + 1] = c.g; this.sparkCol[i * 3 + 2] = c.b;
      this.sparkLife[i] = this.sparkMax[i] = life * (0.6 + Math.random() * 0.7);
      this.sparkGrav[i] = gravity;
    }
  }

  puff(x, y, z, { color = 0xcfc0a0, scale = 1.2, life = 0.9, opacity = 0.5, vx = 0, vy = 0.5, vz = 0, grow = 1.6 } = {}) {
    const p = this.puffs[this.puffHead];
    this.puffHead = (this.puffHead + 1) % MAX_PUFFS;
    p.s.visible = true;
    p.s.position.set(x, y, z);
    p.s.material.color.setHex(color);
    p.s.material.opacity = 0;
    p.s.scale.setScalar(scale);
    p.life = p.max = life;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.grow = grow;
    p.baseOpacity = opacity;
    return p;
  }

  tracer(x0, y0, z0, x1, y1, z1, color = 0xffd9a0) {
    const i = this.tracerHead;
    this.tracerHead = (this.tracerHead + 1) % MAX_TRACERS;
    this.tracerPos[i * 6] = x0; this.tracerPos[i * 6 + 1] = y0; this.tracerPos[i * 6 + 2] = z0;
    this.tracerPos[i * 6 + 3] = x1; this.tracerPos[i * 6 + 4] = y1; this.tracerPos[i * 6 + 5] = z1;
    const c = new THREE.Color(color);
    for (const o of [0, 3]) {
      this.tracerCol[i * 6 + o] = c.r; this.tracerCol[i * 6 + o + 1] = c.g; this.tracerCol[i * 6 + o + 2] = c.b;
    }
    this.tracerLife[i] = 0.09;
    this.tracerGeo.attributes.color.needsUpdate = true;
  }

  flashLight(x, y, z, intensity = 26, color = 0xffc978) {
    this.light.position.set(x, y, z);
    this.light.color.setHex(color);
    this.light.intensity = intensity;
    this.lightLife = 0.07;
  }

  update(dt) {
    // Sparks.
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) { this.sparkPos[i * 3 + 1] = -50; continue; }
      this.sparkVel[i * 3 + 1] += this.sparkGrav[i] * dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      if (this.sparkPos[i * 3 + 1] < 0.03) { this.sparkPos[i * 3 + 1] = 0.03; this.sparkVel[i * 3 + 1] *= -0.4; }
      const f = this.sparkLife[i] / this.sparkMax[i];
      this.sparkGeo.attributes.color.setXYZ(i, this.sparkCol[i * 3] * f, this.sparkCol[i * 3 + 1] * f, this.sparkCol[i * 3 + 2] * f);
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
    // Puffs.
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; p.s.material.opacity = 0; continue; }
      const t = 1 - p.life / p.max;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.scale.addScalar(p.grow * dt);
      const fadeIn = Math.min(1, (p.max - p.life) / Math.max(0.01, p.fadeIn * p.max));
      p.s.material.opacity = p.baseOpacity * fadeIn * Math.min(1, p.life / (0.45 * p.max));
    }
    // Tracers.
    let anyTracer = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tracerLife[i] <= 0) continue;
      anyTracer = true;
      this.tracerLife[i] -= dt;
      if (this.tracerLife[i] <= 0) {
        this.tracerPos[i * 6 + 1] = -50; this.tracerPos[i * 6 + 4] = -50;
      }
    }
    if (anyTracer) this.tracerGeo.attributes.position.needsUpdate = true;
    // Flash light.
    if (this.lightLife > 0) {
      this.lightLife -= dt;
      if (this.lightLife <= 0) this.light.intensity = 0;
    }
  }
}
