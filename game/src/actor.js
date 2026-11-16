// actor.js — a combatant: state, a low-poly body built from boxes, and the
// hit spheres gunfire tests against. The player and the nine bots share this
// shape; controllers (player.js, bots.js) move them, main.js owns the rules.
// Head/chest/leg spheres give the headshot its premium.

import * as THREE from 'three';
import { mat } from './palette.js';

const SKIN = [0xd9a066, 0xb87a4a, 0x8a5a34, 0xe8b088];
const PANTS = 0x3c4148;

export function makeActor(id, team, name, isPlayer) {
  return {
    id, team, name, isPlayer,
    pos: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    vel: new THREE.Vector3(),
    hp: 100, alive: true,
    crouchAmt: 0, // 0 standing, 1 fully crouched
    onGround: true,
    money: 800,
    loadout: null,
    weapon: 'kestrel', // currently held weapon id, or 'grenade:<kind>'
    kills: 0, deaths: 0, assists: 0,
    // per-weapon runtime (for the held gun): cooldowns live in main's sim
    mesh: null, parts: null,
    deadT: 0,
    stepPhase: 0,
  };
}

export function eyeHeight(a) {
  return 1.62 - a.crouchAmt * 0.48;
}

// Hit spheres in world space: [cx, cy, cz, r, part]. Crouching lowers them.
const _spheres = [
  [0, 0, 0, 0.23, 'head'],
  [0, 0, 0, 0.36, 'chest'],
  [0, 0, 0, 0.33, 'leg'],
];
export function rayActorHit(a, o, d, maxT) {
  const drop = a.crouchAmt * 0.42;
  _spheres[0][1] = a.pos.y + 1.52 - drop;
  _spheres[1][1] = a.pos.y + 1.14 - drop;
  _spheres[2][1] = a.pos.y + 0.55 - drop * 0.4;
  let bestT = maxT;
  let bestPart = null;
  for (const s of _spheres) {
    const ox = o.x - a.pos.x, oy = o.y - s[1], oz = o.z - a.pos.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const c = ox * ox + oy * oy + oz * oz - s[3] * s[3];
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0.1 && t < bestT) { bestT = t; bestPart = s[4]; }
  }
  return bestPart ? { t: bestT, part: bestPart } : null;
}

function part(parent, material, x, y, z, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Build the body. The model faces +z; main sets group.rotation.y from yaw.
export function buildActorMesh(a, variant) {
  const g = new THREE.Group();
  const teamMat = mat(a.team === 'atk' ? 0x177e70 : 0xb4502e);
  const teamDark = mat(a.team === 'atk' ? 0x0f5a50 : 0x7e3520);
  const skin = mat(SKIN[variant % SKIN.length]);
  const pants = mat(PANTS);

  const legL = new THREE.Group(); legL.position.set(-0.13, 0.92, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.92, 0); g.add(legR);
  part(legL, pants, 0, -0.44, 0, 0.19, 0.9, 0.22);
  part(legR, pants, 0, -0.44, 0, 0.19, 0.9, 0.22);

  const torso = part(g, teamMat, 0, 1.24, 0, 0.54, 0.64, 0.3);
  part(g, teamDark, 0, 1.3, 0.17, 0.4, 0.44, 0.06); // chest rig on the front
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.set(0, 1.56, 0);
  head.castShadow = true;
  g.add(head);
  part(g, teamDark, 0, 1.7, 0, 0.46, 0.12, 0.46); // cap

  // Arms reaching forward to a rifle held at chest height.
  const armL = part(g, skin, -0.24, 1.32, 0.3, 0.13, 0.13, 0.55);
  armL.rotation.x = 0.25;
  const armR = part(g, skin, 0.24, 1.28, 0.26, 0.13, 0.13, 0.5);
  armR.rotation.x = 0.35;
  const gun = part(g, mat(0x2e3138), 0.05, 1.34, 0.48, 0.09, 0.15, 0.72);
  gun.rotation.x = 0.06;

  a.mesh = g;
  a.parts = { legL, legR, torso, head };
  return g;
}

// Pose the body for this frame: walk swing, crouch squash, death fall.
export function poseActor(a, dt, speed) {
  if (!a.mesh) return;
  a.mesh.position.copy(a.pos);
  a.mesh.rotation.y = Math.atan2(Math.sin(a.yaw), Math.cos(a.yaw)) + Math.PI;
  // Model faces +z; yaw here is the three.js camera convention (forward =
  // (-sin yaw, 0, -cos yaw) for the player). Bots store yaw in the same
  // convention, so the body turns its back to its own forward + PI.
  if (!a.alive) {
    a.deadT = Math.min(1, a.deadT + dt * 2.4);
    a.mesh.rotation.x = -Math.PI / 2 * a.deadT;
    a.mesh.position.y = a.pos.y + 0.15 * a.deadT;
    return;
  }
  a.deadT = 0;
  a.mesh.rotation.x = 0;
  const targetScaleY = 1 - a.crouchAmt * 0.24;
  a.mesh.scale.y += (targetScaleY - a.mesh.scale.y) * Math.min(1, dt * 10);
  if (speed > 0.3) {
    a.stepPhase += dt * speed * 1.9;
    const swing = Math.sin(a.stepPhase) * 0.5;
    a.parts.legL.rotation.x = swing;
    a.parts.legR.rotation.x = -swing;
  } else {
    a.parts.legL.rotation.x *= 0.8;
    a.parts.legR.rotation.x *= 0.8;
  }
}
