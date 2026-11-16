// hud.js — everything drawn over the 3D view: vitals, ammo, money, timer,
// score, killfeed, banners, the buy menu, the scoreboard and the minimap.
// Text nodes are only rewritten when their value changes.

import { WEAPONS, GRENADES, ammoFor } from './weapons.js';
import { BUILDINGS, SITES } from './mapdata.js';
import { clockText } from './util.js';

export const BUY_ITEMS = [
  { key: 'Digit1', kind: 'weapon', id: 'longbow', label: 'Longbow Rifle', price: 2700 },
  { key: 'Digit2', kind: 'weapon', id: 'dart', label: 'Dart SMG', price: 1400 },
  { key: 'Digit3', kind: 'weapon', id: 'breaker', label: 'Breaker Shotgun', price: 1100 },
  { key: 'Digit4', kind: 'weapon', id: 'harpoon', label: 'Harpoon Sniper', price: 4300 },
  { key: 'Digit5', kind: 'armor', id: 'armor', label: 'Kevlar Weave (armor)', price: 650 },
  { key: 'Digit6', kind: 'grenade', id: 'frag', label: 'Frag Grenade', price: 300 },
  { key: 'Digit7', kind: 'grenade', id: 'smoke', label: 'Smoke Grenade', price: 300 },
  { key: 'Digit8', kind: 'grenade', id: 'flash', label: 'Flash Grenade', price: 200 },
];

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.hp = $('hp'); this.hpBar = $('hpBar'); this.armorVal = $('armorVal');
    this.weaponName = $('weaponName'); this.ammo = $('ammo'); this.money = $('money');
    this.grenades = $('grenades');
    this.timer = $('timer'); this.scoreLine = $('scoreLine'); this.aliveLine = $('aliveLine');
    this.objective = $('objective'); this.feedEl = $('feed');
    this.bannerEl = $('banner'); this.bannerTitle = $('bannerTitle'); this.bannerSub = $('bannerSub');
    this.toastEl = $('toast');
    this.channelWrap = $('channelWrap'); this.channelBar = $('channelBar'); this.channelLabel = $('channelLabel');
    this.crosshair = $('crosshair'); this.hitmarker = $('hitmarker');
    this.dmg = $('dmgVignette'); this.dirHit = $('dirHit'); this.flash = $('flashOverlay'); this.scope = $('scopeOverlay');
    this.buyMenu = $('buymenu'); this.buyGrid = $('buyGrid'); this.buyMoney = $('buyMoney');
    this.scoreboard = $('scoreboard'); this.sbBody = $('sbBody');
    this.mapCtx = $('minimap').getContext('2d');
    this._cache = {};
    this.feedItems = [];
    this.bannerUntil = 0;
    this.toastUntil = 0;
    this.hitUntil = 0;
  }

  set(id, value) {
    if (this._cache[id] !== value) { this._cache[id] = value; return true; }
    return false;
  }

  banner(title, sub, kind = 'win', seconds = 2.6) {
    this.bannerTitle.textContent = title;
    this.bannerTitle.className = kind;
    this.bannerSub.textContent = sub || '';
    this.bannerEl.classList.add('show');
    this.bannerUntil = performance.now() + seconds * 1000;
  }

  toast(text, seconds = 3) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastUntil = performance.now() + seconds * 1000;
  }

  feed(html) {
    this.feedItems.unshift({ html, until: performance.now() + 5200 });
    if (this.feedItems.length > 5) this.feedItems.pop();
    this.renderFeed();
  }

  renderFeed() {
    const now = performance.now();
    this.feedItems = this.feedItems.filter((f) => f.until > now);
    this.feedEl.innerHTML = this.feedItems.map((f) => `<div class="kill">${f.html}</div>`).join('');
  }

  hitmark(head) {
    this.hitmarker.className = head ? 'head' : '';
    this.hitmarker.style.opacity = 1;
    this.hitUntil = performance.now() + 110;
  }

  openBuy(G) {
    this.buyMenu.classList.remove('hidden');
    this.renderBuy(G);
  }
  closeBuy() { this.buyMenu.classList.add('hidden'); }
  buyOpen() { return !this.buyMenu.classList.contains('hidden'); }

  renderBuy(G) {
    const p = G.player;
    this.buyMoney.textContent = `$${p.money}`;
    this.buyGrid.innerHTML = BUY_ITEMS.map((item, i) => {
      let owned = false;
      if (item.kind === 'weapon') owned = p.loadout.primary === item.id || p.loadout.sidearm === item.id;
      if (item.kind === 'armor') owned = p.loadout.armor;
      if (item.kind === 'grenade') owned = (p.loadout.grenades[item.id] || 0) >= (GRENADES[item.id]?.max || 1);
      const cant = !owned && p.money < item.price;
      const price = owned ? 'OWNED' : `$${item.price}`;
      return `<div class="buyItem ${owned ? 'owned' : ''} ${cant ? 'cant' : ''}">
        <span><span class="key">${i + 1}</span>${item.label}</span><span class="price">${price}</span></div>`;
    }).join('');
  }

  toggleScoreboard(G, show) {
    if (show) {
      const rows = (team, label, cls) => {
        let html = `<tr class="teamhead"><td colspan="4" style="color:${cls}">${label}</td></tr>`;
        for (const a of G.actors.filter((x) => x.team === team)) {
          html += `<tr class="${a.alive ? '' : 'dead'} ${a.isPlayer ? 'me' : ''}">
            <td>${a.name}</td><td>${a.kills} K</td><td>${a.deaths} D</td><td>$${a.money}</td></tr>`;
        }
        return html;
      };
      this.sbBody.innerHTML = `<table><tr><th>PLAYER</th><th>KILLS</th><th>DEATHS</th><th>MONEY</th></tr>
        ${rows('atk', 'BREAKERS', '#2ee6c8')}${rows('def', 'WARDENS', '#ff7a52')}</table>`;
      this.scoreboard.classList.remove('hidden');
    } else {
      this.scoreboard.classList.add('hidden');
    }
  }

  update(G, spreadPx) {
    const p = G.player;
    const now = performance.now();
    if (now > this.bannerUntil) this.bannerEl.classList.remove('show');
    if (now > this.toastUntil) this.toastEl.classList.remove('show');
    if (now > this.hitUntil) this.hitmarker.style.opacity = 0;
    if (this.feedItems.length && this.feedItems[this.feedItems.length - 1].until <= now) this.renderFeed();

    // Vitals.
    const hp = Math.max(0, Math.ceil(p.hp));
    if (this.set('hp', hp)) {
      this.hp.textContent = hp;
      this.hp.className = hp <= 30 ? 'low' : '';
      this.hpBar.style.width = `${hp}%`;
      this.hpBar.className = hp <= 30 ? 'low' : '';
    }
    const armor = p.loadout.armor ? `🛡 ${Math.ceil(p.armorHp)}` : '';
    if (this.set('armor', armor)) this.armorVal.textContent = armor;

    // Weapon + ammo.
    const isGrenade = typeof p.weapon === 'string' && p.weapon.startsWith('grenade:');
    const wname = isGrenade ? `${GRENADES[p.weapon.slice(8)].name}` : (WEAPONS[p.weapon]?.name || '');
    if (this.set('wname', wname)) this.weaponName.textContent = wname;
    let ammoText;
    if (isGrenade) ammoText = `${p.loadout.grenades[p.weapon.slice(8)]} <span class="reserve">held</span>`;
    else {
      const a = ammoFor(p.loadout, p.weapon);
      ammoText = `${a.mag} <span class="reserve">/ ${a.reserve}</span>`;
    }
    if (this.set('ammo', ammoText)) {
      this.ammo.innerHTML = ammoText;
      this.ammo.className = !isGrenade && ammoFor(p.loadout, p.weapon).mag <= 3 ? 'low' : '';
    }
    if (this.set('money', p.money)) this.money.textContent = `$${p.money}`;
    const gtxt = `FRAG ${p.loadout.grenades.frag} · SMOKE ${p.loadout.grenades.smoke} · FLASH ${p.loadout.grenades.flash}`;
    if (this.set('gren', gtxt)) this.grenades.textContent = gtxt;

    // Timer + score.
    let t = '--:--';
    let warn = false;
    if (G.phase === 'buy') { t = `BUY ${Math.max(0, Math.ceil(G.phaseT))}`; }
    else if (G.charge.state === 'planted') { t = clockText(Math.max(0, G.charge.fuse)); warn = G.charge.fuse < 10; }
    else if (G.phase === 'live') { t = clockText(Math.max(0, G.phaseT)); warn = G.phaseT < 15; }
    if (this.set('timer', t)) this.timer.textContent = t;
    this.timer.className = warn ? 'warn' : '';
    const score = `${G.wins.atk}|${G.wins.def}`;
    if (this.set('score', score)) {
      this.scoreLine.innerHTML = `<span class="atk">Breakers ${G.wins.atk}</span> — <span class="def">${G.wins.def} Wardens</span>`;
    }
    const aliveAtk = G.actors.filter((a) => a.team === 'atk' && a.alive).length;
    const aliveDef = G.actors.filter((a) => a.team === 'def' && a.alive).length;
    const pips = '●'.repeat(aliveAtk) + '○'.repeat(5 - aliveAtk) + '  ' + '●'.repeat(aliveDef) + '○'.repeat(5 - aliveDef);
    if (this.set('pips', pips)) this.aliveLine.textContent = pips;

    // Objective line.
    let obj = '';
    if (G.phase === 'buy') obj = `Round ${G.round} — buy phase (B)`;
    else if (G.charge.state === 'planted') obj = `Charge planted at ${G.charge.site} — ${G.player.team === 'atk' ? 'defend it' : 'it must not blow'}`;
    else if (G.charge.state === 'dropped') obj = 'The Charge is down — recover it';
    else if (G.charge.carrier === p) obj = 'You carry the Charge — plant at A (Lighthouse) or B (Market)';
    else if (G.phase === 'live') obj = 'Plant the Charge at A or B — or eliminate the Wardens';
    if (this.set('obj', obj)) this.objective.textContent = obj;

    // Crosshair spread + overlays.
    this.crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
    this.crosshair.style.opacity = G.scoped ? 0 : 1;
    this.scope.style.opacity = G.scoped ? 1 : 0;
    this.flash.style.opacity = Math.min(0.96, p.flashT * 1.4).toFixed(2);
    this.dmg.style.opacity = (G.dmgVignette || 0).toFixed(2);
    if (G.dirHitA !== undefined && G.dirHitA !== null) {
      this.dirHit.style.opacity = Math.min(1, (G.dmgVignette || 0) * 1.6).toFixed(2);
      this.dirHit.style.transform = `rotate(${G.dirHitA}rad)`;
    } else this.dirHit.style.opacity = 0;

    // Channel bar (plant / defuse).
    const prog = G.plantProgress > 0 ? G.plantProgress : G.defuseProgress > 0 ? G.defuseProgress : 0;
    if (prog > 0) {
      this.channelWrap.classList.remove('hidden');
      this.channelLabel.textContent = G.plantProgress > 0 ? 'PLANTING THE CHARGE' : 'DEFUSING';
      this.channelBar.style.width = `${Math.round(prog * 100)}%`;
    } else this.channelWrap.classList.add('hidden');

    this.drawMinimap(G);
  }

  drawMinimap(G) {
    const ctx = this.mapCtx;
    const W = 196, H = 160;
    const sx = (x) => (x + 45) * (W / 90);
    const sz = (z) => (z + 37) * (H / 74);
    ctx.fillStyle = '#0c2a33';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#14425e'; // the sea, beyond the west quay
    ctx.fillRect(0, 0, 5, H);
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      ctx.fillStyle = 'rgba(255,176,46,0.20)';
      ctx.fillRect(sx(s.x0), sz(s.z0), sx(s.x1) - sx(s.x0), sz(s.z1) - sz(s.z0));
      ctx.fillStyle = '#ffb02e';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(key, sx((s.x0 + s.x1) / 2) - 3, sz((s.z0 + s.z1) / 2) + 4);
    }
    ctx.fillStyle = '#51786d';
    for (const b of BUILDINGS) {
      // BUILDINGS rows are [x0, z0, x1, z1, height, plaster].
      ctx.fillRect(sx(b[0]), sz(b[1]), Math.max(2, sx(b[2]) - sx(b[0])), Math.max(2, sz(b[3]) - sz(b[1])));
    }
    // The Charge.
    const c = G.charge;
    if (c.state === 'dropped' || c.state === 'planted') {
      ctx.fillStyle = '#ffb02e';
      ctx.fillRect(sx(c.pos.x) - 3, sz(c.pos.z) - 3, 6, 6);
    }
    // Teammates.
    for (const a of G.actors) {
      if (!a.alive || a.isPlayer || a.team !== G.player.team) continue;
      ctx.fillStyle = '#2ee6c8';
      ctx.beginPath();
      ctx.arc(sx(a.pos.x), sz(a.pos.z), 2.6, 0, 7);
      ctx.fill();
    }
    // The player, with a facing tick.
    const p = G.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx(p.pos.x), sz(p.pos.z), 3.4, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(sx(p.pos.x), sz(p.pos.z));
    ctx.lineTo(sx(p.pos.x) - Math.sin(p.yaw) * 8, sz(p.pos.z) - Math.cos(p.yaw) * 8);
    ctx.stroke();
  }
}
