# Harborlight — a three.js tactical FPS

`threejs-fps-02` · three.js 0.187.0 · no build step, no network

**Harborlight** is a round-based tactical FPS for two teams of five, set in a
sunlit coastal port town: whitewashed plaster blocks with terracotta roofs,
a lighthouse watching over Site A, a market square for Site B, and a fountain
plaza at mid. The **Breakers** (teal) carry a Charge to a site and plant it;
the **Wardens** (rust) hold the harbour and defuse. First to 5 rounds, sides
swap after 4.

It is an original game in the Counter-Strike style — its own map, names,
palette and synthesized sounds; nothing is copied from a commercial title.

## How it plays

- **Rounds** — 15 s buy phase, 100 s rounds, 40 s post-plant fuse. Win by
  elimination, detonation, defuse, or the clock.
- **Economy** — start at $800; kills pay $250, round wins $2,650–$3,000,
  losses pay a rising bonus. Buy rifles, an SMG, a shotgun, a scoped sniper,
  armour and grenades with **B** and the number keys.
- **Gunplay** — five weapons with distinct roles. Spread blooms as you move
  and tightens when you stop, crouch and aim; headshots multiply damage up
  to ×4. Recoil, tracers, hitmarkers and directional damage feedback.
- **Grenades** — frag (blast with cover falloff), smoke (a real
  line-of-sight blocker the AI respects), flash (facing-based blindness).
- **Bots** — nine AI combatants navigate a waypoint graph, hold angles,
  rotate on callouts and gunfire noise, push sites behind their carrier,
  throw utility, guard the plant and retake with a defuser.
- **The map** — three lanes (promenade, plaza, east alley) through ten
  buildings, crates and stalls: long lighthouse sightlines, close market
  corners, a mid fountain that splits both.

## Controls

WASD move · Shift quiet-walk · Ctrl crouch · Space jump · Mouse aim ·
Click fire · RMB aim down sights (Harpoon scopes) · R reload · 1/2 guns ·
3/4 grenades · G throw grenade · F plant / defuse / take the Charge ·
B buy menu · Tab scoreboard · M mute · Esc pause

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # hand-in: writes out/
```

## Layout

- `game/index.html` — HUD, menus, import map (`three` → vendored module)
- `game/src/main.js` — the single state home and the fixed-step (60 Hz) loop
- `game/src/mapdata.js` — map data, sites, spawns, the waypoint graph
- `game/src/collision.js` — movement collision and raycasts against the map
- `game/src/world.js` — builds the port town scene
- `game/src/weapons.js` — weapon tables, ballistics, viewmodels
- `game/src/actor.js` — combatant bodies and poses
- `game/src/player.js` — the local player's movement and camera
- `game/src/bots.js` — perception, navigation, combat and objective AI
- `game/src/objective.js` — the Charge: plant, fuse, defuse, blast
- `game/src/effects.js` — pooled tracers, sparks, smoke and light flashes
- `game/src/audio.js` — synthesized WebAudio gunfire, beeps and the sea
- `game/src/hud.js` — HUD, buy menu, scoreboard, killfeed, minimap
- `game/src/util.js`, `game/src/palette.js`, `game/src/input.js` — helpers
- `game/vendor/` — three.js 0.187.0, byte for byte as the kit ships it
