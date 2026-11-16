// collision.js — the solid world as data: axis-aligned boxes (buildings,
// crates) and cylinders (barrels, the lighthouse, the fountain), plus the
// map boundary. Movement resolves a circle against them; gunfire raycasts
// against them. Built once from mapdata; no per-frame allocation (the ray
// result is a caller-owned scratch object).

import { BUILDINGS, CRATES, BARRELS, LIGHTHOUSE, FOUNTAIN, BOUNDS } from './mapdata.js';

export const BOXES = []; // {x0,z0,x1,z1,h}
export const CYLS = []; // {x,z,r,h}

for (const [x0, z0, x1, z1, h] of BUILDINGS) BOXES.push({ x0, z0, x1, z1, h });
for (const [x, z, w, d, h] of CRATES) BOXES.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h });
for (const [x, z, r, h] of BARRELS) CYLS.push({ x, z, r, h });
CYLS.push({ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: LIGHTHOUSE.r, h: LIGHTHOUSE.h });
CYLS.push({ x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r, h: 0.85 });

// Move a circle (x,z,radius) out of every solid. Axis-separated: resolve x,
// then z, so sliding along walls feels right. Mutates and returns the point.
export function collideMove(p, radius) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of BOXES) {
      const nx = Math.max(b.x0, Math.min(p.x, b.x1));
      const nz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x = nx + (dx / d) * radius;
          p.z = nz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = p.x - b.x0, pr = b.x1 - p.x, pt = p.z - b.z0, pb = b.z1 - p.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) p.x = b.x0 - radius;
          else if (m === pr) p.x = b.x1 + radius;
          else if (m === pt) p.z = b.z0 - radius;
          else p.z = b.z1 + radius;
        }
      }
    }
    for (const c of CYLS) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const rr = radius + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * rr;
        p.z = c.z + (dz / d) * rr;
      }
    }
  }
  p.x = Math.max(BOUNDS.x0 + radius, Math.min(BOUNDS.x1 - radius, p.x));
  p.z = Math.max(BOUNDS.z0 + radius, Math.min(BOUNDS.z1 - radius, p.z));
  return p;
}

export function pointSolid(x, z) {
  for (const b of BOXES) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  for (const c of CYLS) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
  return false;
}

// Raycast against the solids and the ground. `out` is filled with
// {dist, x,y,z} of the nearest hit or dist = maxDist when nothing is hit.
export function raycastWorld(o, d, maxDist, out) {
  let best = maxDist;
  // Ground plane y = 0.
  if (d.y < -1e-6) {
    const t = -o.y / d.y;
    if (t > 0 && t < best) best = t;
  }
  for (const b of BOXES) {
    // Slab test against the 3D box (base at y=0, top at y=h).
    let t0 = 0;
    let t1 = best;
    // x slab
    if (Math.abs(d.x) < 1e-9) { if (o.x < b.x0 || o.x > b.x1) continue; }
    else {
      let ta = (b.x0 - o.x) / d.x, tb = (b.x1 - o.x) / d.x;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // y slab
    if (Math.abs(d.y) < 1e-9) { if (o.y < 0 || o.y > b.h) continue; }
    else {
      let ta = (0 - o.y) / d.y, tb = (b.h - o.y) / d.y;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // z slab
    if (Math.abs(d.z) < 1e-9) { if (o.z < b.z0 || o.z > b.z1) continue; }
    else {
      let ta = (b.z0 - o.z) / d.z, tb = (b.z1 - o.z) / d.z;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t0 > 0 && t0 < best) best = t0;
  }
  for (const c of CYLS) {
    // 2D ray-circle, then check the hit height.
    const ox = o.x - c.x, oz = o.z - c.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) continue;
    const bq = 2 * (ox * d.x + oz * d.z);
    const cq = ox * ox + oz * oz - c.r * c.r;
    const disc = bq * bq - 4 * a * cq;
    if (disc < 0) continue;
    const t = (-bq - Math.sqrt(disc)) / (2 * a);
    if (t > 0 && t < best) {
      const y = o.y + d.y * t;
      if (y >= 0 && y <= c.h) best = t;
    }
  }
  out.dist = best;
  out.x = o.x + d.x * best;
  out.y = o.y + d.y * best;
  out.z = o.z + d.z * best;
  return out;
}

// Line of sight between two points at eye height: true when no solid blocks.
const _losO = { x: 0, y: 0, z: 0 };
const _losD = { x: 0, y: 0, z: 0 };
const _losHit = { dist: 0, x: 0, y: 0, z: 0 };
export function lineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  _losO.x = ax; _losO.y = ay; _losO.z = az;
  _losD.x = dx / len; _losD.y = dy / len; _losD.z = dz / len;
  raycastWorld(_losO, _losD, len, _losHit);
  return _losHit.dist >= len - 0.05;
}
