// palette.js — Harborlight's chosen palette and material factory.
// A sunlit port town: warm plaster, terracotta roofs, teal paint and sea.
// Materials are shared Lambert materials (cheap, flat, readable at a glance);
// anything that needs its own tint asks make() for a fresh one.

import * as THREE from 'three';

export const COLORS = {
  sky: 0xcfe4ee,
  fog: 0xd8e6ea,
  sun: 0xfff1d6,
  plaster: [0xf3e5cf, 0xeeddc0, 0xf7efdd, 0xe9d5b0, 0xf0dfc2],
  roof: [0xb65c38, 0xc06a3e, 0xa9502f],
  trim: 0x1f7a72, // teal paint: doors, shutters, the lighthouse bands
  trimDark: 0x155e57,
  stone: 0x9a917f,
  stoneDark: 0x7d7462,
  wood: 0xa97c50,
  woodDark: 0x84603c,
  street: 0xb3a186,
  plaza: 0xdccda6,
  dock: 0x8a6f52,
  sand: 0xe6d3a3,
  sea: 0x2e8b9a,
  seaDeep: 0x1d6a7a,
  leaf: 0x5d8a4a,
  awningRed: 0xc4503c,
  awningCream: 0xf2e3c2,
  lampGlow: 0xffd9a0,
  atk: 0x177e70, // Breakers (attack): teal
  atkDark: 0x0f5a50,
  def: 0xb4502e, // Wardens (defence): rust
  defDark: 0x7e3520,
  charge: 0xffb02e,
};

const cache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? 0}|${opts.flat ? 1 : 0}`;
  if (!cache.has(key)) {
    const m = new THREE.MeshLambertMaterial({ color });
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    cache.set(key, m);
  }
  return cache.get(key);
}

// A canvas texture with a word on it — shop signs and the big site letters
// painted on the ground. Drawn once at build time; no network, no assets.
export function textTexture(text, { w = 256, h = 128, fg = '#ffffff', bg = null, font = 'bold 72px system-ui, sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
