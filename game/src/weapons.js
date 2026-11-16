// weapons.js — the armoury: five original guns and three grenades, their
// viewmodels (boxes, no assets), and the hitscan trace every shooter shares.
// Accuracy is the skill: spread grows with movement, bloom and stance, the
// first round of a stopped rifle is nearly straight, and armour soaks a
// weapon-dependent share of every hit.

import * as THREE from 'three';
import { mat } from './palette.js';
import { raycastWorld } from './collision.js';
import { rayActorHit } from './actor.js';

// dmg: per pellet. head/leg: damage multipliers by body part (chest = 1).
// spread: base cone in degrees. bloom: extra cone per shot, decays.
// fall: [start, end] metres of damage falloff to 55%.
export const WEAPONS = {
  kestrel: {
    name: 'Kestrel Pistol', slot: 'sidearm', price: 0, auto: false, rpm: 320,
    dmg: 26, head: 3.4, leg: 0.7, pellets: 1, mag: 12, reserve: 96, reload: 1.5,
    spread: 0.6, bloom: 0.5, recoil: 0.011, fall: [20, 46], pen: 0.5, speed: 1.0, zoom: 1.35,
  },
  breaker: {
    name: 'Breaker Shotgun', slot: 'primary', price: 1100, auto: false, rpm: 66,
    dmg: 13, head: 2.1, leg: 0.7, pellets: 8, mag: 6, reserve: 32, reload: 2.9,
    spread: 3.6, bloom: 0.4, recoil: 0.045, fall: [7, 19], pen: 0.4, speed: 0.96, zoom: 1.3,
  },
  dart: {
    name: 'Dart SMG', slot: 'primary', price: 1400, auto: true, rpm: 780,
    dmg: 19, head: 3.0, leg: 0.7, pellets: 1, mag: 30, reserve: 90, reload: 2.0,
    spread: 1.15, bloom: 0.34, recoil: 0.006, fall: [16, 36], pen: 0.55, speed: 1.0, zoom: 1.35,
  },
  longbow: {
    name: 'Longbow Rifle', slot: 'primary', price: 2700, auto: true, rpm: 600,
    dmg: 34, head: 4.0, leg: 0.75, pellets: 1, mag: 30, reserve: 90, reload: 2.3,
    spread: 0.8, bloom: 0.3, recoil: 0.009, fall: [30, 75], pen: 0.8, speed: 0.94, zoom: 1.5,
  },
  harpoon: {
    name: 'Harpoon Sniper', slot: 'primary', price: 4300, auto: false, rpm: 44,
    dmg: 112, head: 2.0, leg: 0.55, pellets: 1, mag: 5, reserve: 30, reload: 3.0,
    spread: 3.2, bloom: 0.2, recoil: 0.06, fall: [60, 140], pen: 0.95, speed: 0.9, zoom: 5.0, scope: true,
  },
};

export const GRENADES = {
  frag: { name: 'Burst Grenade', price: 300, max: 1 },
  smoke: { name: 'Smoke Grenade', price: 300, max: 1 },
  flash: { name: 'Flash Grenade', price: 200, max: 2 },
};
export const ARMOR_PRICE = 650;
export const KIT_PRICE = 200;

export function freshLoadout() {
  return {
    primary: null,
    sidearm: 'kestrel',
    armor: false,
    kit: false,
    grenades: { frag: 0, smoke: 0, flash: 0 },
    ammo: {}, // per weapon id: {mag, reserve}
  };
}

export function ammoFor(loadout, id) {
  if (!loadout.ammo[id]) {
    const def = WEAPONS[id];
    loadout.ammo[id] = { mag: def.mag, reserve: def.reserve };
  }
  return loadout.ammo[id];
}

// The spread cone (degrees) for a shot right now: stance and movement are
// the shooter's skill, bloom is the gun heating up.
export function currentSpread(def, { moving, crouch, air, ads }, bloom) {
  let s = def.spread + bloom;
  if (ads) s *= def.scope ? 0.02 : 0.45;
  if (crouch) s *= 0.72;
  if (moving) s *= 2.6;
  if (air) s *= 3.4;
  return s;
}

const _worldHit = { dist: 0, x: 0, y: 0, z: 0 };
const _dir = new THREE.Vector3();

// Fire one pellet along (origin, dir-with-spread-applied-by-caller).
// Returns { actor, part, mult, dist, x,y,z } for the nearest thing hit —
// an actor part or the world (actor null). Actors on `shooter`'s team and
// the shooter are skipped (no friendly fire in Harborlight).
export function traceShot(actors, shooter, o, d, maxDist = 160) {
  raycastWorld(o, d, maxDist, _worldHit);
  let best = null;
  for (const a of actors) {
    if (!a.alive || a === shooter || a.team === shooter.team) continue;
    const hit = rayActorHit(a, o, d, _worldHit.dist);
    if (hit && (!best || hit.t < best.dist)) {
      best = { actor: a, part: hit.part, mult: hit.mult, dist: hit.t, x: o.x + d.x * hit.t, y: o.y + d.y * hit.t, z: o.z + d.z * hit.t };
    }
  }
  if (best) return best;
  return { actor: null, part: null, mult: 0, dist: _worldHit.dist, x: _worldHit.x, y: _worldHit.y, z: _worldHit.z };
}

// Damage after range falloff. The body-part multiplier comes from the
// weapon's own table when the trace did not supply one. Armour is applied
// once, centrally, by main's damage resolution — callers pass armored
// false; the parameter stays for the one caller that pre-applies it.
export function damageAt(def, part, mult, dist, armored) {
  const m = typeof mult === 'number' && mult > 0
    ? mult
    : part === 'head' ? def.head : part === 'leg' ? def.leg : 1;
  let dmg = def.dmg * m;
  const [f0, f1] = def.fall;
  if (dist > f0) {
    const t = Math.min(1, (dist - f0) / (f1 - f0));
    dmg *= 1 - 0.45 * t;
  }
  if (armored) dmg *= def.pen;
  return dmg;
}

// --- Viewmodels -------------------------------------------------------------
// One group per weapon, built from boxes in gunmetal and teal; only the
// equipped one is visible. The muzzle Object3D marks the flash/tracer origin.

const gunMat = mat(0x2e3138);
const gunAccent = mat(0x177e70);
const gunWood = mat(0x84603c);

function part(parent, material, x, y, z, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function buildViewmodel(id) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  if (id.startsWith('grenade:')) {
    // A held grenade: a dark canister with a coloured band per kind.
    const kind = id.slice(8);
    const band = { frag: 0xc4503c, smoke: 0x9fb4ba, flash: 0xf2e3c2 }[kind] || 0x888888;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 12), gunMat);
    body.position.set(0, -0.01, -0.2);
    g.add(body);
    const bandMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.035, 12), mat(band));
    bandMesh.position.set(0, 0.01, -0.2);
    g.add(bandMesh);
    part(g, gunAccent, 0, 0.075, -0.2, 0.02, 0.035, 0.02);
    muzzle.position.set(0, 0, -0.2);
  } else if (id === 'kestrel') {
    part(g, gunMat, 0, 0, -0.22, 0.07, 0.11, 0.3);
    part(g, gunMat, 0, -0.09, -0.1, 0.06, 0.14, 0.09);
    part(g, gunAccent, 0, 0.045, -0.36, 0.03, 0.03, 0.03);
    muzzle.position.set(0, 0.02, -0.4);
  } else if (id === 'breaker') {
    part(g, gunMat, 0, 0, -0.42, 0.08, 0.12, 0.62);
    part(g, gunWood, 0, -0.05, -0.2, 0.07, 0.09, 0.3);
    part(g, gunWood, 0, -0.02, 0.08, 0.075, 0.13, 0.22);
    muzzle.position.set(0, 0.02, -0.76);
  } else if (id === 'dart') {
    part(g, gunMat, 0, 0, -0.3, 0.075, 0.13, 0.46);
    part(g, gunMat, 0, -0.1, -0.22, 0.05, 0.16, 0.08);
    part(g, gunAccent, 0, 0.02, -0.55, 0.05, 0.07, 0.12);
    muzzle.position.set(0, 0.02, -0.62);
  } else if (id === 'harpoon') {
    part(g, gunMat, 0, 0, -0.5, 0.08, 0.11, 0.85);
    part(g, gunMat, 0, 0.01, -0.95, 0.045, 0.06, 0.3);
    part(g, gunWood, 0, -0.03, 0.16, 0.08, 0.13, 0.3);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), gunMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.3);
    g.add(scope);
    muzzle.position.set(0, 0.01, -1.12);
  } else {
    // longbow
    part(g, gunMat, 0, 0, -0.38, 0.08, 0.12, 0.58);
    part(g, gunAccent, 0, 0.085, -0.3, 0.05, 0.05, 0.22);
    part(g, gunMat, 0, -0.11, -0.28, 0.05, 0.17, 0.09);
    part(g, gunMat, 0, -0.04, 0.12, 0.07, 0.11, 0.2);
    part(g, gunMat, 0, 0.01, -0.72, 0.04, 0.05, 0.14);
    muzzle.position.set(0, 0.01, -0.8);
  }
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  // Muzzle flash: a small emissive star, hidden unless firing.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  flash.position.copy(muzzle.position);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  return g;
}
