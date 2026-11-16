// bots.js — the nine AI combatants. Each bot navigates the waypoint graph,
// perceives through a vision cone + line of sight + hearing, fights in
// bursts with human-like reaction delays, and plays the objective: the
// Breakers push a site behind their carrier, the Wardens hold angles and
// rotate on information, and after a plant both sides play the clock.

import * as THREE from 'three';
import { NODES, NODE, SITES, findPath, nearestNode } from './mapdata.js';
import { collideMove, lineOfSight } from './collision.js';
import { WEAPONS, traceShot, damageAt, ammoFor } from './weapons.js';
import { eyeHeight } from './actor.js';
import { clamp, angleLerp, angleDiff } from './util.js';

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _aim = new THREE.Vector3();

export function makeBotRuntime(rng, skill) {
  return {
    skill, // 0.75..1.15: reaction time and aim error scale
    node: 0, path: null, pathI: 0,
    goal: -1, goalX: 0, goalZ: 0,
    role: 'push', holdNode: -1,
    enemy: null, firstSeenAt: 0, lastSeenAt: -99, lastSeenPos: new THREE.Vector3(),
    alertPos: null, alertAt: -99,
    nextThink: Math.random() * 0.2,
    fireNext: 0, burstLeft: 0, burstPauseUntil: 0,
    strafeDir: 1, strafeAt: 0,
    stuckAt: 0, lastX: 0, lastZ: 0,
    wantPlant: false, wantDefuse: false,
    threwUtility: false,
    offX: rng.range(-0.9, 0.9), offZ: rng.range(-0.9, 0.9),
  };
}

// Round plans, assigned by main at round start.
export function planRound(G) {
  const rng = G.rng;
  const atkBots = G.actors.filter((a) => a.team === 'atk' && !a.isPlayer && a.alive);
  const defBots = G.actors.filter((a) => a.team === 'def' && a.alive);
  const site = rng.chance(0.52) ? 'A' : 'B';
  G.planSite = site;
  const siteNode = site === 'A' ? NODE.siteA : NODE.siteB;
  // Carrier: a bot, so the player is free to lurk or entry.
  const carrier = atkBots[0];
  if (carrier && G.charge.state === 'carried') G.charge.carrier = carrier;
  atkBots.forEach((bot, i) => {
    const b = bot.bot;
    b.role = bot === carrier ? 'carrier' : 'push';
    b.threwUtility = false;
    if (i === atkBots.length - 1 && atkBots.length > 2) {
      // The last attacker takes the other lane as a lurk, then joins.
      b.role = 'lurk';
      b.goal = site === 'A' ? NODE.siteB : NODE.siteA;
      b.joinAt = G.time + rng.range(16, 24);
    } else {
      b.goal = siteNode;
    }
  });
  // Defenders: two per site, one mid. Hold the named nodes.
  const holds = site === 'A'
    ? [NODE.siteA, NODE.aApproach, NODE.siteB, NODE.stalls, NODE.eastAlley]
    : [NODE.siteB, NODE.stalls, NODE.siteA, NODE.aApproach, NODE.plazaE];
  defBots.forEach((bot, i) => {
    const b = bot.bot;
    b.role = 'hold';
    b.holdNode = holds[i % holds.length];
    b.goal = b.holdNode;
    b.threwUtility = false;
  });
}

function setGoal(bot, nodeIdx) {
  const b = bot.bot;
  if (b.goal === nodeIdx && b.path) return;
  b.goal = nodeIdx;
  const from = nearestNode(bot.pos.x, bot.pos.z);
  b.path = findPath(from, nodeIdx);
  b.pathI = 0;
}

function forwardOf(a, out) {
  out.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
  return out;
}

// Can this bot see that actor right now? Vision cone, range, line of sight,
// and smoke all count.
function canSee(G, bot, other) {
  const dx = other.pos.x - bot.pos.x;
  const dz = other.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 58) return false;
  forwardOf(bot, _v);
  const dot = dist > 0.01 ? (_v.x * dx + _v.z * dz) / dist : 1;
  if (dot < 0.35 && dist > 4.5) return false;
  const eyeY = bot.pos.y + eyeHeight(bot);
  if (!lineOfSight(bot.pos.x, eyeY, bot.pos.z, other.pos.x, other.pos.y + 1.15, other.pos.z)) return false;
  if (G.smokeBlocks(bot.pos.x, eyeY, bot.pos.z, other.pos.x, other.pos.y + 1.15, other.pos.z)) return false;
  return true;
}

function think(G, bot) {
  const b = bot.bot;
  const now = G.time;
  // Perception: nearest visible enemy.
  let seen = null;
  let seenDist = Infinity;
  for (const other of G.actors) {
    if (!other.alive || other.team === bot.team) continue;
    const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
    if (d < seenDist && canSee(G, bot, other)) { seen = other; seenDist = d; }
  }
  if (seen) {
    if (b.enemy !== seen) { b.enemy = seen; b.firstSeenAt = now; }
    b.lastSeenAt = now;
    b.lastSeenPos.copy(seen.pos);
    // Shout it out: teammates learn the position (information play).
    for (const mate of G.actors) {
      if (mate.alive && mate.team === bot.team && mate.bot && mate !== bot) {
        mate.bot.alertPos = b.lastSeenPos;
        mate.bot.alertAt = now;
      }
    }
  } else if (now - b.lastSeenAt > 2.6) {
    b.enemy = null;
  }
  // Hearing: fresh noise from the enemy team pulls attention.
  for (const n of G.noise) {
    if (n.team === bot.team) continue;
    const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
    if (d < n.r) {
      b.alertPos = _v.set(n.x, 0, n.z).clone();
      b.alertAt = now;
    }
  }

  // Role logic: where should this bot be heading?
  const charge = G.charge;
  if (bot.team === 'def') {
    if (charge.state === 'planted') {
      b.role = 'retake';
      b.goal = nearestNode(charge.pos.x, charge.pos.z);
    } else if (charge.state === 'dropped' && now - b.alertAt < 6) {
      b.role = 'rotate';
      b.goal = nearestNode(charge.pos.x, charge.pos.z);
    } else if (b.role === 'hold') {
      // Rotate toward a fresh alert when holding the *other* site.
      if (b.alertPos && now - b.alertAt < 5) {
        const alertNode = nearestNode(b.alertPos.x, b.alertPos.z);
        const mySite = b.holdNode === NODE.siteA || b.holdNode === NODE.aApproach ? 'A' : b.holdNode === NODE.siteB || b.holdNode === NODE.stalls ? 'B' : null;
        const alertSite = alertNode === NODE.siteA || alertNode === NODE.aApproach ? 'A' : alertNode === NODE.siteB || alertNode === NODE.stalls ? 'B' : null;
        if (alertSite && mySite && alertSite !== mySite && G.rng.chance(0.6)) {
          b.role = 'rotate';
          b.goal = alertNode;
        }
      }
    } else if (b.role === 'rotate' && !b.enemy && now - b.alertAt > 9) {
      b.role = 'hold';
      b.goal = b.holdNode;
    }
  } else {
    // Attackers.
    const siteNode = G.planSite === 'A' ? NODE.siteA : NODE.siteB;
    if (charge.state === 'planted') {
      b.role = 'guard';
      b.goal = nearestNode(charge.pos.x, charge.pos.z);
    } else if (charge.state === 'dropped') {
      // Whoever is free converges on the drop; the first there picks it up.
      if (!b.enemy) b.goal = nearestNode(charge.pos.x, charge.pos.z);
    } else if (b.role === 'lurk' && now > (b.joinAt || 0)) {
      b.role = 'push';
      b.goal = siteNode;
    } else if (b.role === 'push' || b.role === 'carrier') {
      b.goal = siteNode;
    }
  }
  if (b.goal >= 0) setGoal(bot, b.goal);
}

function moveAlongPath(G, bot, dt, speedMul = 1) {
  const b = bot.bot;
  if (!b.path || b.pathI >= b.path.length) { bot.speed = 0; return true; }
  const nodeIdx = b.path[b.pathI];
  const tx = NODES[nodeIdx][0] + (b.pathI === b.path.length - 1 ? b.offX * 0.6 : 0);
  const tz = NODES[nodeIdx][1] + (b.pathI === b.path.length - 1 ? b.offZ * 0.6 : 0);
  const dx = tx - bot.pos.x;
  const dz = tz - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.75) { b.pathI++; return b.pathI >= b.path.length; }
  const def = WEAPONS[bot.weapon] || WEAPONS.kestrel;
  const speed = 4.35 * def.speed * speedMul;
  const wantYaw = Math.atan2(-dx, -dz);
  bot.yaw = angleLerp(bot.yaw, wantYaw, dt * 7);
  bot.pos.x += (dx / dist) * speed * dt;
  bot.pos.z += (dz / dist) * speed * dt;
  bot.speed = speed;
  // Stuck? Repath from the nearest node.
  if (Math.hypot(bot.pos.x - b.lastX, bot.pos.z - b.lastZ) < 0.05) {
    if (now0(G) - b.stuckAt > 1.4) {
      b.path = null;
      if (b.goal >= 0) setGoal(bot, b.goal);
      b.stuckAt = now0(G);
    }
  } else {
    b.lastX = bot.pos.x; b.lastZ = bot.pos.z;
    b.stuckAt = now0(G);
  }
  return false;
}
function now0(G) { return G.time; }

// Firing solution: aim at the target's chest (sometimes head) with an error
// that shrinks the longer the bot has tracked the target.
function botShoot(G, bot, dt) {
  const b = bot.bot;
  const target = b.enemy;
  const rt = bot.rt;
  const def = WEAPONS[bot.weapon];
  if (!def || !target || !target.alive) return;
  const now = G.time;
  const ammo = ammoFor(bot.loadout, bot.weapon);
  if (rt.reloadEnd > now) return;
  if (ammo.mag <= 0) { G.startReload(bot); return; }
  const reaction = 0.34 / b.skill;
  if (now - b.firstSeenAt < reaction) return;
  if (now < b.burstPauseUntil || now < rt.nextShot) return;

  // Aim point: chest, drifting to the head for skilled bots at close range.
  const dist = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
  const headChance = clamp(0.34 - dist * 0.004, 0.08, 0.3) * b.skill;
  const aimY = target.pos.y + (G.rng.chance(headChance) ? 1.5 - target.crouchAmt * 0.4 : 1.12 - target.crouchAmt * 0.35);
  _eye.set(bot.pos.x, bot.pos.y + eyeHeight(bot), bot.pos.z);
  _aim.set(target.pos.x, aimY, target.pos.z);
  // Tracking error: big on first sight, tightening while the target is held.
  const trackedFor = clamp((now - b.firstSeenAt - reaction) * 1.4, 0, 1);
  const err = (1 - trackedFor * 0.72) * 0.055 / b.skill + (bot.speed > 0.5 ? 0.05 : 0);
  _aim.x += G.rng.range(-err, err) * dist * 0.4;
  _aim.y += G.rng.range(-err, err) * dist * 0.3;
  _aim.z += G.rng.range(-err, err) * dist * 0.4;
  _dir.copy(_aim).sub(_eye).normalize();

  // Face the shot.
  bot.yaw = angleLerp(bot.yaw, Math.atan2(-_dir.x, -_dir.z), 0.65);
  bot.pitch = Math.asin(clamp(_dir.y, -1, 1));

  const hit = traceShot(G.actors, bot, _eye, _dir);
  ammo.mag--;
  rt.nextShot = now + 60 / def.rpm;
  rt.bloom = Math.min(2.4, rt.bloom + def.bloom);
  if (def.auto) {
    b.burstLeft--;
    if (b.burstLeft <= 0) {
      b.burstLeft = G.rng.int(3, 6);
      b.burstPauseUntil = now + G.rng.range(0.24, 0.5);
    }
  } else {
    b.burstPauseUntil = now + G.rng.range(0.3, 0.55);
  }
  const distToPlayer = Math.hypot(G.player.pos.x - bot.pos.x, G.player.pos.z - bot.pos.z);
  G.sound.shot(bot.weapon, distToPlayer);
  G.onShotFired(bot, _eye, hit, def);
  if (hit.actor) {
    // Armour penetration is applied once, inside applyDamage.
    const dmg = damageAt(def, hit.part, hit.mult, hit.dist, false);
    G.applyDamage(hit.actor, bot, dmg, hit.part, bot.weapon);
  }
  G.emitNoise(bot.pos.x, bot.pos.z, 30, bot.team);
}

export function updateBot(G, bot, dt) {
  const b = bot.bot;
  const now = G.time;
  bot.rt.bloom = Math.max(0, bot.rt.bloom - dt * 2.2);
  if (now >= b.nextThink) {
    b.nextThink = now + 0.14;
    think(G, bot);
  }
  const fighting = b.enemy && b.enemy.alive && now - b.lastSeenAt < 0.4;
  b.wantPlant = false;
  b.wantDefuse = false;

  if (fighting) {
    // Combat stance: stop, strafe in place, shoot.
    const dist = Math.hypot(b.enemy.pos.x - bot.pos.x, b.enemy.pos.z - bot.pos.z);
    const dx = b.enemy.pos.x - bot.pos.x;
    const dz = b.enemy.pos.z - bot.pos.z;
    bot.yaw = angleLerp(bot.yaw, Math.atan2(-dx, -dz), dt * 9);
    if (now > b.strafeAt) { b.strafeAt = now + G.rng.range(0.6, 1.3); b.strafeDir = G.rng.chance(0.5) ? 1 : -1; }
    if (dist > 7) {
      const px = -dz / (dist || 1) * b.strafeDir;
      const pz = dx / (dist || 1) * b.strafeDir;
      bot.pos.x += px * 1.5 * dt;
      bot.pos.z += pz * 1.5 * dt;
      bot.speed = 1.5;
    } else bot.speed = 0;
    bot.crouchAmt += (((b.holdNode >= 0 && b.role === 'hold') ? 0.6 : 0) - bot.crouchAmt) * Math.min(1, dt * 6);
    botShoot(G, bot, dt);
  } else {
    bot.crouchAmt += (0 - bot.crouchAmt) * Math.min(1, dt * 6);
    // Objective intents.
    const charge = G.charge;
    if (bot.team === 'atk' && charge.carrier === bot && charge.state === 'carried') {
      const site = SITES[G.planSite];
      if (bot.pos.x > site.x0 && bot.pos.x < site.x1 && bot.pos.z > site.z0 && bot.pos.z < site.z1) {
        b.wantPlant = true;
        bot.speed = 0;
      }
    }
    if (bot.team === 'def' && charge.state === 'planted') {
      const d = Math.hypot(charge.pos.x - bot.pos.x, charge.pos.z - bot.pos.z);
      if (d < 1.6) { b.wantDefuse = true; bot.speed = 0; }
    }
    if (!b.wantPlant && !b.wantDefuse) {
      const arrived = moveAlongPath(G, bot, dt, fighting ? 0 : 1);
      if (arrived && b.role === 'hold') {
        // Settle onto the angle: face the likeliest approach.
        bot.speed = 0;
        bot.crouchAmt += (0.55 - bot.crouchAmt) * Math.min(1, dt * 4);
      }
      // Utility: smoke the site entry as the push arrives.
      if (!b.threwUtility && bot.team === 'atk' && (b.role === 'push' || b.role === 'carrier')) {
        const siteNode = G.planSite === 'A' ? NODE.siteA : NODE.siteB;
        const d = Math.hypot(NODES[siteNode][0] - bot.pos.x, NODES[siteNode][1] - bot.pos.z);
        if (d < 13 && bot.loadout.grenades.smoke > 0) {
          b.threwUtility = true;
          G.throwGrenade(bot, 'smoke', NODES[siteNode][0], NODES[siteNode][1]);
        } else if (d < 16 && bot.loadout.grenades.flash > 0 && G.rng.chance(0.5)) {
          b.threwUtility = true;
          G.throwGrenade(bot, 'flash', NODES[siteNode][0], NODES[siteNode][1]);
        }
      }
      if (!b.threwUtility && b.enemy === null && now - b.lastSeenAt < 3 && bot.loadout.grenades.frag > 0) {
        // Frag a known position behind cover.
        if (Math.hypot(b.lastSeenPos.x - bot.pos.x, b.lastSeenPos.z - bot.pos.z) < 24 && G.rng.chance(0.4)) {
          b.threwUtility = true;
          G.throwGrenade(bot, 'frag', b.lastSeenPos.x, b.lastSeenPos.z);
        }
      }
    }
  }
  collideMove(bot.pos, 0.42);
  // Reload when safe and low.
  const ammo = ammoFor(bot.loadout, bot.weapon);
  if (ammo.mag < WEAPONS[bot.weapon].mag * 0.3 && !fighting && bot.rt.reloadEnd <= now) G.startReload(bot);
}
