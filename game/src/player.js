// player.js — the local player's body, in two halves. applyLook runs once
// per rendered frame: mouse look (slower while aiming, as a held breath
// does) and, when dead, the slumped death camera. stepPlayer runs per
// fixed step: crouch, acceleration movement with a quiet walk and jumping,
// footsteps the bots can hear, and the eye camera with bob and landing
// dip. Movement speed feeds the gun's spread, so the tactical choice —
// stop, crouch, aim — is a real one.

import * as THREE from 'three';
import { clamp } from './util.js';
import { collideMove } from './collision.js';
import { WEAPONS } from './weapons.js';
import { eyeHeight } from './actor.js';

const SENS = 0.0021;
const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export function applyLook(G) {
  const p = G.player;
  const input = G.input;
  const adsFactor = G.adsAmt > 0.5 ? 0.55 : 1;
  p.yaw -= input.mouseDX * SENS * adsFactor;
  p.pitch -= input.mouseDY * SENS * adsFactor;
  p.pitch = clamp(p.pitch, -1.45, 1.45);
  if (!p.alive) {
    // Death camera: down at the body, still able to look around.
    G.camera.position.set(p.pos.x, p.pos.y + 0.42, p.pos.z);
    G.camera.rotation.order = 'YXZ';
    G.camera.rotation.y = p.yaw;
    G.camera.rotation.x = p.pitch * 0.5 - 0.12;
    G.camera.rotation.z = 0.38;
  }
}

export function stepPlayer(G, dt) {
  const p = G.player;
  const input = G.input;
  if (!p.alive) { p.speed = 0; return; }

  // Crouch.
  const wantCrouch = input.down('ControlLeft') || input.down('KeyC');
  p.crouchAmt += ((wantCrouch ? 1 : 0) - p.crouchAmt) * Math.min(1, dt * 11);

  const playing = G.phase === 'live' || G.phase === 'planted';
  if (playing) {
    // Wish direction in world space.
    _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    _wish.set(0, 0, 0);
    if (input.down('KeyW')) _wish.add(_fwd);
    if (input.down('KeyS')) _wish.sub(_fwd);
    if (input.down('KeyD')) _wish.add(_right);
    if (input.down('KeyA')) _wish.sub(_right);
    const hasWish = _wish.lengthSq() > 0;
    if (hasWish) _wish.normalize();

    const def = WEAPONS[p.weapon] || WEAPONS.kestrel;
    const quiet = input.down('ShiftLeft');
    let maxSpeed = 4.6 * def.speed;
    if (p.crouchAmt > 0.4) maxSpeed *= 0.45;
    else if (quiet) maxSpeed *= 0.52;
    if (G.adsAmt > 0.5) maxSpeed *= 0.55;
    if (G.chargeBusy) maxSpeed = 0;

    // Accelerate / friction, Counter-Strike-flavoured: snappy stops.
    const accel = p.onGround ? 42 : 5;
    const friction = p.onGround ? 11 : 0.4;
    p.vel.x -= p.vel.x * Math.min(1, friction * dt);
    p.vel.z -= p.vel.z * Math.min(1, friction * dt);
    if (hasWish && !G.chargeBusy) {
      p.vel.x += _wish.x * accel * dt;
      p.vel.z += _wish.z * accel * dt;
    }
    const hSpeed = Math.hypot(p.vel.x, p.vel.z);
    if (hSpeed > maxSpeed) {
      p.vel.x *= maxSpeed / hSpeed;
      p.vel.z *= maxSpeed / hSpeed;
    }

    // Jump and gravity (the map is flat; y is feet height).
    if (p.onGround && input.hit('Space') && !G.chargeBusy) {
      p.vel.y = 4.6;
      p.onGround = false;
      G.sound.jump();
    }
    p.vel.y -= 14.5 * dt;

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.pos.y += p.vel.y * dt;
    if (p.pos.y <= 0) {
      if (!p.onGround && p.vel.y < -3.4) G.landDip = Math.min(0.09, -p.vel.y * 0.012);
      p.pos.y = 0;
      p.vel.y = 0;
      p.onGround = true;
    }
    collideMove(p.pos, 0.42);
    p.speed = Math.hypot(p.vel.x, p.vel.z);

    // Footsteps: audible to bots and to the player's own ears.
    if (p.onGround && p.speed > 0.6) {
      p.stepPhase += dt * p.speed * 1.9;
      const stride = Math.floor(p.stepPhase / Math.PI);
      if (stride !== (p._lastStride || 0)) {
        p._lastStride = stride;
        const run = p.speed > 3;
        G.sound.step(run);
        G.emitNoise(p.pos.x, p.pos.z, run ? 15 : quiet || p.crouchAmt > 0.4 ? 2.5 : 7, p.team);
      }
    }
  } else {
    p.speed = 0;
  }

  // Camera: eye point + bob + landing dip (also in buy/over, for looking).
  G.landDip = Math.max(0, (G.landDip || 0) - dt * 0.35);
  const bob = p.onGround && p.speed > 0.5 ? Math.sin(p.stepPhase) * 0.028 * Math.min(1, p.speed / 4) : 0;
  G.camera.position.set(p.pos.x, p.pos.y + eyeHeight(p) + bob - (G.landDip || 0), p.pos.z);
  G.camera.rotation.order = 'YXZ';
  G.camera.rotation.y = p.yaw;
  G.camera.rotation.x = p.pitch + (G.recoilPitch || 0);
  G.camera.rotation.z = (G.recoilRoll || 0);
}
