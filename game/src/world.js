// world.js — builds Harborlight's three.js scene from mapdata: plaster
// blocks with terracotta roofs and teal shutters, the lighthouse, the
// fountain, market stalls, crates, boats on the sea. Static geometry only;
// the one sun casts the shadows. Deterministic (seeded) window placement so
// the staged screenshots always show the same town.

import * as THREE from 'three';
import { COLORS, mat, textTexture } from './palette.js';
import { BUILDINGS, CRATES, BARRELS, STALLS, SITES, LIGHTHOUSE, FOUNTAIN } from './mapdata.js';
import { makeRng } from './util.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
const sphGeo = new THREE.SphereGeometry(1, 12, 9);

function box(parent, material, x, y, z, w, h, d, { shadow = true } = {}) {
  const m = new THREE.Mesh(boxGeo, material);
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, material, x, y, z, r, h, seg = 14) {
  const m = new THREE.Mesh(cylGeo, material);
  m.position.set(x, y, z);
  m.scale.set(r, h, r);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildWorld(scene) {
  const rng = makeRng(20261116);
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 90, 190);

  const hemi = new THREE.HemisphereLight(0xd6e6f2, 0x8a7a5f, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.6);
  sun.position.set(48, 58, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const root = new THREE.Group();
  scene.add(root);

  // Ground: sand base, then the paved zones on top.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), mat(COLORS.sand));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, 0);
  ground.receiveShadow = true;
  root.add(ground);
  const pave = (x0, z0, x1, z1, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
    m.receiveShadow = true;
    root.add(m);
  };
  pave(-45, -37, -25, 37, COLORS.stone); // promenade
  pave(-25, -22, 45, -14, COLORS.street); // north street
  pave(-45, 23, -11, 37, COLORS.dock); // dock
  pave(-11, 22, 31, 30, COLORS.street); // south street
  pave(-11, -3, 15, 9, COLORS.plaza); // plaza
  pave(12, 0, 31, 15, COLORS.plaza); // market square
  pave(-45, -36, -25, -20, COLORS.stone); // A apron

  // The sea, west of the quay, with two fishing boats.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60, 160), mat(COLORS.sea, { emissive: 0x0a3038 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-76, -0.55, 0);
  root.add(sea);
  box(root, mat(COLORS.stoneDark), -45.4, 0.5, 0, 1.2, 1.5, 76); // quay wall
  for (const [bx, bz, rot] of [[-52, -12, 0.4], [-54, 18, -0.3]]) {
    const boat = new THREE.Group();
    boat.position.set(bx, -0.2, bz);
    boat.rotation.y = rot;
    box(boat, mat(COLORS.trim), 0, 0.3, 0, 5.4, 0.9, 1.9);
    box(boat, mat(COLORS.wood), 0, 0.85, 0, 3.6, 0.25, 1.4);
    box(boat, mat(0xf7efdd), -0.6, 1.5, 0, 1.5, 1.1, 1.2);
    cyl(boat, mat(COLORS.woodDark), 1.2, 2.2, 0, 0.07, 4.4, 6);
    root.add(boat);
  }

  // Buildings: plaster block, roof slab + ridge, teal shutters and doors.
  for (const [x0, z0, x1, z1, h, pi] of BUILDINGS) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = new THREE.Group();
    root.add(g);
    box(g, mat(COLORS.plaster[pi]), cx, h / 2, cz, w, h, d);
    const roofMat = mat(COLORS.roof[pi % COLORS.roof.length]);
    box(g, roofMat, cx, h + 0.22, cz, w + 0.7, 0.44, d + 0.7);
    box(g, roofMat, cx, h + 0.62, cz, Math.max(1.2, w * 0.36), 0.5, d * 0.9);
    // Windows on the two long faces.
    const rows = Math.max(1, Math.floor(h / 3.2));
    const cols = Math.max(2, Math.floor(w / 3.4));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = x0 + ((c + 0.5) / cols) * w;
        const wy = 1.9 + r * 3.1;
        if (wy > h - 0.8) continue;
        for (const side of [-1, 1]) {
          if (rng.chance(0.22)) continue;
          const lit = rng.chance(0.18);
          const win = new THREE.Mesh(boxGeo, lit ? mat(0x8a6a3a, { emissive: 0xffb35c }) : mat(COLORS.trimDark));
          win.position.set(wx, wy, cz + side * (d / 2 + 0.06));
          win.scale.set(1.05, 1.5, 0.1);
          g.add(win);
          const shut = new THREE.Mesh(boxGeo, mat(COLORS.trim));
          shut.position.set(wx, wy, cz + side * (d / 2 + 0.03));
          shut.scale.set(1.5, 1.7, 0.05);
          g.add(shut);
        }
      }
    }
    // A door on a random short face.
    const doorSide = rng.chance(0.5) ? -1 : 1;
    box(g, mat(COLORS.trimDark), cx + doorSide * (w / 2 + 0.05), 1.1, cz + rng.range(-d / 4, d / 4), 0.12, 2.2, 1.1, { shadow: false });
  }

  // Crates and barrels (the cover the collision map knows about).
  for (const [x, z, w, d, h] of CRATES) {
    box(root, mat(COLORS.wood), x, h / 2, z, w, h, d);
    box(root, mat(COLORS.woodDark), x, h + 0.04, z, w + 0.08, 0.08, d + 0.08, { shadow: false });
  }
  for (const [x, z, r, h] of BARRELS) {
    cyl(root, mat(COLORS.trim), x, h / 2, z, r, h);
  }

  // The lighthouse on A.
  {
    const { x, z } = LIGHTHOUSE;
    cyl(root, mat(COLORS.stone), x, 0.5, z, 3.6, 1);
    cyl(root, mat(0xf7efdd), x, 3.4, z, 2.5, 4.8);
    cyl(root, mat(COLORS.trim), x, 7.2, z, 2.25, 2.8);
    cyl(root, mat(0xf7efdd), x, 10.6, z, 2.0, 3.6);
    cyl(root, mat(COLORS.stoneDark), x, 12.9, z, 2.5, 1.0);
    const lamp = cyl(root, mat(COLORS.lampGlow, { emissive: 0xffc978 }), x, 14.2, z, 1.05, 1.7);
    lamp.castShadow = false;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.6, 14), mat(COLORS.trimDark));
    cap.position.set(x, 15.9, z);
    cap.castShadow = true;
    root.add(cap);
  }

  // The fountain on the plaza.
  {
    const { x, z } = FOUNTAIN;
    cyl(root, mat(COLORS.stone), x, 0.42, z, 2.6, 0.85);
    const water = cyl(root, mat(COLORS.sea, { emissive: 0x0a3038 }), x, 0.78, z, 2.25, 0.1);
    water.castShadow = false;
    cyl(root, mat(COLORS.stoneDark), x, 1.1, z, 0.32, 2.2);
    const orb = new THREE.Mesh(sphGeo, mat(COLORS.stone));
    orb.position.set(x, 2.5, z);
    orb.scale.setScalar(0.55);
    orb.castShadow = true;
    root.add(orb);
  }

  // Market stalls in B.
  for (const [x, z, rot] of STALLS) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    box(g, mat(COLORS.wood), 0, 0.55, 0, 3.2, 1.1, 1.6);
    for (const [px, pz] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]]) {
      box(g, mat(COLORS.woodDark), px, 1.5, pz, 0.14, 3, 0.14);
    }
    for (let i = 0; i < 5; i++) {
      const seg = box(g, mat(i % 2 ? COLORS.awningCream : COLORS.awningRed), -1.6 + i * 0.8 + 0.4, 3.15, 0, 0.8, 0.09, 2.6, { shadow: false });
      seg.rotation.x = 0.16;
    }
    for (let i = 0; i < 3; i++) {
      box(g, mat([0xd9a441, 0x7ba24a, 0xc4503c][i]), rng.range(-1.1, 1.1), 1.3, rng.range(-0.4, 0.4), 0.55, 0.4, 0.55, { shadow: false });
    }
  }

  // Site markings: a painted ring and letter on the ground of each site.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.4, 5, 40),
      new THREE.MeshBasicMaterial({ color: COLORS.charge, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.04, cz);
    root.add(ring);
    const letterTex = textTexture(s.letter, { w: 256, h: 256, fg: 'rgba(255,176,46,0.9)', font: 'bold 200px system-ui, sans-serif' });
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 5.4),
      new THREE.MeshBasicMaterial({ map: letterTex, transparent: true }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(cx, 0.035, cz);
    root.add(letter);
  }

  // Shop signs over a few doors, and planter trees for life.
  const signs = [['CAFÉ', -18, 3.4, -3.8], ['HOTEL', 2, 4.6, -23.8], ['MARKET', 24, 3.4, -3.8], ['BAKERY', -18, 3.4, 7.8]];
  for (const [word, x, y, z] of signs) {
    const tex = textTexture(word, { w: 512, h: 128, fg: '#f7efdd', bg: '#155e57', font: 'bold 74px system-ui, sans-serif' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.position.set(x, y, z);
    root.add(sign);
  }
  for (const [x, z] of [[-28, 8], [-28, -12], [10, 12], [-14, -20], [30, 24], [12, -20]]) {
    cyl(root, mat(COLORS.stone), x, 0.35, z, 0.8, 0.7);
    cyl(root, mat(COLORS.woodDark), x, 1.2, z, 0.14, 1.8, 6);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), mat(COLORS.leaf));
    crown.position.set(x, 2.9, z);
    crown.castShadow = true;
    root.add(crown);
  }

  // A few soft clouds.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (const [x, y, z, s] of [[-30, 42, -50, 9], [25, 48, -30, 12], [0, 44, 30, 8], [55, 50, 10, 10]]) {
    const c = new THREE.Mesh(sphGeo, cloudMat);
    c.position.set(x, y, z);
    c.scale.set(s, s * 0.28, s * 0.5);
    root.add(c);
  }
  return root;
}
