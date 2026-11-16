// util.js — small shared helpers: a seeded RNG (so staged screenshots and bot
// decisions are reproducible), scalar math, and preallocated scratch vectors
// so the hot loops never allocate.

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return {
    next() {
      // mulberry32: tiny, fast, good enough for game decisions.
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) {
      return a + (b - a) * this.next();
    },
    int(a, b) {
      return Math.floor(this.range(a, b + 1));
    },
    pick(list) {
      return list[Math.floor(this.next() * list.length) % list.length];
    },
    chance(p) {
      return this.next() < p;
    },
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest-path angle lerp, for bot turning.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Format seconds as M:SS for the round timer.
export function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
