// mapdata.js — Harborlight, an original port-town map, as data.
// x runs east, z runs south (so -z is north on the minimap). Three lanes —
// the west Promenade to Lighthouse Point (A), the central Plaza with its two
// alleys, and Fisherman's Row to the Market (B) — joined by the north and
// south streets. Buildings are solid boxes; crates and barrels are cover.

export const BOUNDS = { x0: -45, x1: 45, z0: -37, z1: 37 };

// x0, z0, x1, z1, height, plaster index
export const BUILDINGS = [
  [-24, -34, -10, -22, 10, 0], // NW block, behind A
  [-2, -34, 12, -24, 12, 1], // N-centre block
  [20, -34, 34, -22, 9, 2], // NE block, behind the defence spawn
  [-24, -14, -12, -4, 8, 3], // W-mid block
  [-4, -14, 8, -6, 11, 4], // centre block (the mid choke)
  [18, -14, 30, -4, 10, 1], // E-mid block
  [-24, 8, -12, 20, 9, 2], // W-south block
  [-4, 10, 8, 22, 8, 0], // S-centre block
  [16, 16, 28, 28, 10, 3], // SE block
  [32, 8, 42, 22, 8, 4], // E-south block
];

// Low cover crates: x, z, w, d, h
export const CRATES = [
  [-35, -14, 1.7, 1.7, 1.7], [-33, 18, 1.7, 1.7, 3.4], [-30, -25, 1.7, 1.7, 1.7],
  [-41, -33, 1.7, 1.7, 1.7], [-17, -1, 1.7, 1.7, 1.7], [-2, 8, 1.7, 1.7, 1.7],
  [9, 11, 1.7, 1.7, 1.7], [-8, -2, 1.7, 1.7, 1.7], [13, -2, 1.7, 1.7, 1.7],
  [24, 3, 1.7, 1.7, 1.7], [19, 13, 1.7, 1.7, 1.7], [28, 11, 1.7, 1.7, 3.4],
  [0, -17, 1.7, 1.7, 1.7], [22, -19, 1.7, 1.7, 1.7], [35, -1, 1.7, 1.7, 1.7],
  [4, 26, 1.7, 1.7, 1.7], [-24, 29, 1.7, 1.7, 1.7], [2, -4.5, 1.7, 1.7, 1.7],
  [-37, 24, 1.7, 1.7, 1.7], [15, 5, 1.7, 1.7, 1.7],
];

// Round cover: x, z, radius, h (barrels and planters)
export const BARRELS = [
  [-36, 6, 0.55, 1.15], [-28, -30, 0.55, 1.15], [16, 6, 0.55, 1.15],
  [33, 14, 0.55, 1.15], [-14, 26, 0.55, 1.15], [38, -14, 0.55, 1.15],
];

// Plant zones and the lighthouse/fountain landmarks.
export const SITES = {
  A: { name: 'Lighthouse Point', x0: -44, x1: -26, z0: -35, z1: -20, letter: 'A' },
  B: { name: 'Market Square', x0: 14, x1: 31, z0: 0, z1: 15, letter: 'B' },
};
export const LIGHTHOUSE = { x: -38, z: -29, r: 3.1, h: 17 };
export const FOUNTAIN = { x: 2, z: 5, r: 2.6 };

// Market stalls inside B: x, z, rotation
export const STALLS = [
  [17.5, 3.5, 0.3], [26, 13.5, -0.4], [29.5, 5, 1.57], [16.5, 11, 0],
];

export const ATK_SPAWNS = [[-30, 31], [-34, 29], [-27, 33], [-38, 27], [-20, 30]];
export const DEF_SPAWNS = [[39, -20], [36, -24], [42, -22], [33, -19], [40, -27]];

// Waypoint graph the bots navigate by: [x, z] nodes, then undirected edges.
// Every edge was checked to run through open ground.
export const NODES = [
  [-30, 31], [-38, 27], [-38, 12], [-38, -6], [-38, -19], [-35, -28],
  [-18, 2], [-6, 3], [6, 3], [-8, -9], [13, -9], [-8, -18],
  [13, -18], [26, -18], [39, -20], [36, -8], [36, 4], [22, 8],
  [13, 8], [18, 13], [-8, 16], [-8, 27], [14, 26], [-20, 30],
];
export const EDGES = [
  [0, 1], [0, 23], [1, 2], [2, 3], [2, 6], [3, 4], [3, 6], [4, 5], [4, 11],
  [6, 7], [7, 8], [7, 9], [7, 20], [8, 10], [8, 18], [9, 11], [10, 12],
  [11, 12], [12, 13], [13, 14], [13, 15], [14, 15], [15, 16], [16, 17],
  [17, 18], [18, 19], [17, 19], [18, 22], [20, 21], [21, 22], [21, 23],
  [22, 18],
];
// Named nodes for strategies.
export const NODE = {
  atkSpawn: 0, dock: 23, prom2: 2, prom3: 3, aApproach: 4, siteA: 5,
  westSt: 6, plazaW: 7, plazaE: 8, midAlley: 9, eastAlley: 10,
  northW: 11, northC: 12, northE: 13, defSpawn: 14, eastN: 15, eastS: 16,
  siteB: 17, marketW: 18, stalls: 19, southAlley: 20, southW: 21, southE: 22,
};

// Shortest path over the waypoint graph (Dijkstra; the graph is tiny).
const adjacency = NODES.map(() => []);
for (const [a, b] of EDGES) {
  adjacency[a].push(b);
  adjacency[b].push(a);
}
export function findPath(from, to) {
  if (from === to) return [from];
  const dist = new Array(NODES.length).fill(Infinity);
  const prev = new Array(NODES.length).fill(-1);
  const done = new Array(NODES.length).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < NODES.length; i++) {
      if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    }
    if (u === -1 || u === to) break;
    done[u] = true;
    for (const v of adjacency[u]) {
      const w = Math.hypot(NODES[u][0] - NODES[v][0], NODES[u][1] - NODES[v][1]);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  if (prev[to] === -1 && to !== from) return [from];
  const path = [];
  for (let u = to; u !== -1; u = prev[u]) path.push(u);
  return path.reverse();
}

export function nearestNode(x, z) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Smoke clouds live in main's state ({x, y, z, r, until}); this is the
// segment-versus-sphere test every vision check shares: true when the
// sight line passes through any live cloud, so smoke genuinely hides.
export function smokeBlocksLine(smokes, x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-9) return false;
  for (const s of smokes) {
    let t = ((s.x - x0) * dx + (s.y - y0) * dy + (s.z - z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + dx * t - s.x;
    const py = y0 + dy * t - s.y;
    const pz = z0 + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r) return true;
  }
  return false;
}
