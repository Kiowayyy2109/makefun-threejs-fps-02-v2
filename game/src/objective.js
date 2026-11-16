// objective.js — the Charge: Harborlight's plant objective. A Breaker
// carries it to a site and plants (3.2 s, standing in the ring); it ticks
// for 40 s while the Wardens try to defuse (8 s, 4 s with a kit). If it
// blows, the Breakers take the round whatever the body count says.

import * as THREE from 'three';
import { mat } from './palette.js';
import { SITES } from './mapdata.js';

export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 8;
export const DEFUSE_TIME_KIT = 4;
export const FUSE_TIME = 40;

export function createCharge(scene) {
  const ground = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.22), mat(0x2e3138));
  body.castShadow = true;
  ground.add(body);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb02e });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), lampMat);
  lamp.position.set(0.16, 0.22, 0);
  ground.add(lamp);
  ground.visible = false;
  scene.add(ground);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.18), mat(0x2e3138));
  pack.position.set(0, 1.28, -0.28);
  pack.castShadow = true;
  pack.visible = false;
  scene.add(pack);

  return {
    state: 'carried', // carried | dropped | planted | exploded | defused
    carrier: null,
    pos: new THREE.Vector3(),
    site: null,
    progress: 0, // plant or defuse progress, seconds
    channeler: null, // actor currently planting/defusing
    fuse: 0,
    beepAt: 0,
    mesh: ground,
    lampMat,
    packMesh: pack,
    blinkAt: 0,
  };
}

export function chargeReset(G) {
  const c = G.charge;
  c.state = 'carried';
  c.carrier = null;
  c.site = null;
  c.progress = 0;
  c.channeler = null;
  c.fuse = 0;
  c.mesh.visible = false;
  c.packMesh.visible = false;
  if (c.packMesh.parent) c.packMesh.parent.remove(c.packMesh);
}

function inSite(pos, siteKey) {
  const s = SITES[siteKey];
  return pos.x > s.x0 && pos.x < s.x1 && pos.z > s.z0 && pos.z < s.z1;
}

export function updateCharge(G, dt) {
  const c = G.charge;
  const now = G.time;

  // Blink the lamp; faster once planted.
  const blinkRate = c.state === 'planted' ? Math.max(0.12, c.fuse / FUSE_TIME * 0.9) : 0.7;
  if (now > c.blinkAt) {
    c.blinkAt = now + blinkRate;
    c.lampMat.color.setHex(c.lampMat.color.getHex() === 0xffb02e ? 0x5a3a08 : 0xffb02e);
  }

  if (c.state === 'carried') {
    if (c.carrier && c.carrier.alive) {
      if (!c.packMesh.parent && c.carrier.mesh) {
        c.carrier.mesh.add(c.packMesh);
        c.packMesh.visible = true;
      }
      c.pos.copy(c.carrier.pos);
    }
    return;
  }
  if (c.state === 'dropped') {
    c.mesh.visible = true;
    c.mesh.position.set(c.pos.x, 0.18, c.pos.z);
    // Pick-up: any living Breaker (player included) who walks over it.
    for (const a of G.actors) {
      if (a.alive && a.team === 'atk' && Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) < 1.1) {
        c.state = 'carried';
        c.carrier = a;
        c.mesh.visible = false;
        if (a.mesh) { a.mesh.add(c.packMesh); c.packMesh.visible = true; }
        if (a.isPlayer) G.hud.toast('You have the Charge — plant it at a site (F)');
        break;
      }
    }
    return;
  }
  if (c.state !== 'planted') return;

  // Planted: the fuse runs, beeps accelerate, a defuse can stop it.
  c.fuse -= dt;
  if (now > c.beepAt) {
    c.beepAt = now + Math.max(0.14, (c.fuse / FUSE_TIME) * 1.1);
    G.sound.beep(c.fuse < 5);
  }
  let defuser = null;
  for (const a of G.actors) {
    if (!a.alive || a.team !== 'def') continue;
    const wants = a.isPlayer ? G.playerDefusing : a.bot?.wantDefuse;
    if (wants && Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) < 1.7) { defuser = a; break; }
  }
  if (defuser) {
    if (c.channeler !== defuser) { c.channeler = defuser; c.progress = 0; }
    c.progress += dt;
    G.defuseProgress = c.progress / (defuser.loadout.kit ? DEFUSE_TIME_KIT : DEFUSE_TIME);
    if (c.progress >= (defuser.loadout.kit ? DEFUSE_TIME_KIT : DEFUSE_TIME)) {
      c.state = 'defused';
      G.effects.puff(c.pos.x, 1, c.pos.z, { color: 0xbfd9ea, scale: 2.4, life: 1.2, opacity: 0.5 });
      G.endRound('def', 'Charge defused');
      return;
    }
  } else {
    c.channeler = null;
    c.progress = Math.max(0, c.progress - dt * 2);
    G.defuseProgress = 0;
  }
  if (c.fuse <= 0) {
    c.state = 'exploded';
    c.mesh.visible = false;
    G.effects.sparksBurst(c.pos.x, 1, c.pos.z, { n: 90, color: 0xffa040, speed: 11, life: 0.9, gravity: -3, up: 5 });
    G.effects.puff(c.pos.x, 1.4, c.pos.z, { color: 0x6a5a48, scale: 3.4, life: 1.8, opacity: 0.75, vy: 2.2, grow: 5 });
    G.effects.flashLight(c.pos.x, 2, c.pos.z, 60, 0xffa040);
    const distToPlayer = Math.hypot(G.player.pos.x - c.pos.x, G.player.pos.z - c.pos.z);
    G.sound.explosion(distToPlayer);
    // The blast is lethal in the open nearby, whoever you are.
    for (const a of G.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z);
      if (d < 13) G.applyDamage(a, null, 260 * (1 - d / 14), 'chest', 'explosion', true);
    }
    G.endRound('atk', 'Charge detonated');
  }
}

// The plant channel itself, called during the live phase before planting.
export function updatePlanting(G, dt) {
  const c = G.charge;
  if (c.state !== 'carried' || !c.carrier || !c.carrier.alive) { G.plantProgress = 0; return; }
  const carrier = c.carrier;
  const wants = carrier.isPlayer ? G.playerPlanting : carrier.bot?.wantPlant;
  const siteKey = inSite(carrier.pos, 'A') ? 'A' : inSite(carrier.pos, 'B') ? 'B' : null;
  if (wants && siteKey && carrier.speed < 0.4) {
    c.progress += dt;
    G.plantProgress = c.progress / PLANT_TIME;
    if (c.progress >= PLANT_TIME) {
      c.state = 'planted';
      c.site = siteKey;
      c.pos.set(carrier.pos.x, 0, carrier.pos.z);
      c.fuse = FUSE_TIME;
      c.progress = 0;
      c.mesh.visible = true;
      c.mesh.position.set(c.pos.x, 0.18, c.pos.z);
      c.packMesh.visible = false;
      if (c.packMesh.parent) c.packMesh.parent.remove(c.packMesh);
      G.sound.planted();
      G.emitNoise(c.pos.x, c.pos.z, 20, 'atk');
      G.hud.banner('CHARGE PLANTED', `Site ${siteKey} — ${SITES[siteKey].name}`, 'warn');
      // The planter is paid for the plant, and the team shares a bonus.
      carrier.money += 300;
      for (const mate of G.actors) {
        if (mate.team === carrier.team && mate !== carrier) mate.money += 800;
      }
      G.phase = 'planted';
    }
  } else {
    c.progress = Math.max(0, c.progress - dt * 3);
    G.plantProgress = c.progress / PLANT_TIME;
  }
}
