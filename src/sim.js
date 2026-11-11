// sim.js — game state, entities, damage, physics. Style-agnostic: both visual styles draw this same simulation.
import { W, pushOut, blockedAt, platformAt, inVoid, findStandable, routeToward, rayBlocks } from './world.js';
import { clamp, damp, rand, angDiff, dist, TAU } from './util.js';

export const G = {
  time: 0, mode: 'title', timeScale: 1, slow: 0, hitstop: 0, shake: 0,
  ents: [], fx: [], tele: [], nextId: 1,
  aim: { x: 0, z: 0, y: 0, level: null },
  input: null, player: null,
  rewrite: { active: false, hover: null, t: 0, list: [] },
  flags: {}, stats: { time: 0, falls: 0, pages: 0, kills: 0 },
  cine: { active: false, px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 40, k: 2.5, bars: false },
  nearInteract: null, onEvent: () => {}, bossRef: null,
};

export const DEFS = {
  tick:    { r: 0.35, hp: 10, team: 'legion', mass: 0.5, grab: true, speed: 5.2 },
  tally:   { r: 0.6, hp: 60, team: 'legion', mass: 3, grab: true, speed: 4.9 },
  lancer:  { r: 0.55, hp: 42, team: 'legion', mass: 2.5, grab: true, speed: 4.2 },
  bailiff: { r: 1.05, hp: 240, team: 'legion', mass: 14, grab: false, speed: 2.5, shield: 150 },
  drone:   { r: 0.45, hp: 12, team: 'legion', mass: 1, grab: true, speed: 6.6, fly: true, hover: 1.9 },
  stake:   { r: 0.7, hp: 90, team: 'legion', mass: 4, grab: true, fixed: true },
  boss:    { r: 0.95, hp: 1000, team: 'legion', mass: 60, grab: false },
  nest:    { r: 1.6, hp: 70, team: 'legion', mass: 99, grab: false, fixed: true },
  crate:   { r: 0.62, hp: 18, mass: 2, grab: true, obj: true, breakable: true },
  drum:    { r: 0.5, hp: 8, mass: 2, grab: true, obj: true, breakable: true },
  engine:  { r: 0.75, mass: 5, grab: true, obj: true },
  girder:  { r: 1.3, mass: 8, grab: true, obj: true },
  panel:   { r: 1.3, mass: 5, grab: true, obj: true },
  pod:     { r: 1.75, mass: 16, grab: true, obj: true, noThrow: true },
  shield:  { r: 0.9, mass: 4, grab: true, obj: true },
  crest:   { r: 0.6, mass: 1.5, grab: true, obj: true, noThrowDmg: true, hover: 1.5 },
  npc:     { r: 0.42, mass: 2, team: 'town' },
  page:    { r: 0.5 }, bolt: { r: 0.2 }, orb: { r: 0.4 }, marker: { r: 0.1 },
};

export const fx = (k, d = {}) => { d.k = k; G.fx.push(d); };
export const sfx = (name, vol = 1) => G.fx.push({ k: 'sfx', name, vol });
export const isEnemy = (e) => e.team === 'legion' && !e.dead;
export const enemies = () => G.ents.filter(isEnemy);

export function spawn(kind, x, z, o = {}) {
  const d = DEFS[kind] || {};
  const e = {
    id: G.nextId++, kind, x, z, y: d.fly ? d.hover : (d.hover || 0), vx: 0, vz: 0, vy: 0, yaw: 0, r: d.r || 0.5,
    hp: d.hp, maxHp: d.hp, team: d.team || 'none', mass: d.mass || 1, grab: !!d.grab, obj: !!d.obj, fly: !!d.fly, fixed: !!d.fixed,
    breakable: !!d.breakable, speed: d.speed || 0, shield: d.shield || 0, hover: d.hover || 0,
    act: 'idle', st: 'idle', t: 0, cd: rand(0.4, 1.4), stun: 0, flash: 0, phase: rand(TAU), runAmt: 0, heat: 0, spawnT: 0, kb: 0,
    ...o,
  };
  if (o.materialize) { e.spawnT = 0.7; fx('spawn', { x, z }); }
  G.ents.push(e);
  return e;
}

export function makePlayer(x, z) {
  return {
    x, z, y: 0, vx: 0, vz: 0, vy: 0, r: 0.75, yaw: 1.2, aimYaw: 1.2, level: null,
    hp: 100, maxHp: 100, en: 100, maxEn: 100, auth: 0, enDelay: 0, regenDelay: 0, iframes: 0, hurtT: 0, stun: 0, lift: 0,
    beam: { on: false, x0: 0, z0: 0, x1: 0, z1: 0, len: 0, tick: 0, hitT: 0 }, burst: { charging: false, c: 0, anim: 0 },
    blink: { n: 2, max: 2, cd: 0 }, blindside: 0, tk: { ent: null, tug: 0 },
    atk: { step: -1, t: 0, dur: 0, hit: false, buffer: 0, comboT: 0, yaw: 0 },
    faceAimT: 0, moving: 0, phase: 0, locked: false, dead: false, powerless: false,
    a: { run: 0, beam: 0, charge: 0, tk: 0, rewrite: 0, hurt: 0, kneel: 0, headYaw: 0 },   // animation weights
  };
}

export function reset() {
  G.ents.length = 0; G.fx.length = 0; G.tele.length = 0;
  G.rewrite.active = false; G.rewrite.hover = null; G.timeScale = 1; G.slow = 0; G.hitstop = 0; G.shake = 0; G.bossRef = null;
}

// ---------- damage ----------
export function launch(e, dx, dz, power, up = 0) {
  if (e.fixed || e.kind === 'boss') return;
  const k = power / Math.max(1, Math.sqrt(e.mass));
  const d = Math.hypot(dx, dz) || 1;
  e.vx += (dx / d) * k; e.vz += (dz / d) * k;
  if (up > 0 && e.mass < 10) { e.vy = Math.max(e.vy, up / Math.max(1, Math.sqrt(e.mass) * 0.7)); e.air = true; }
  e.kb = 0.35;
}

export function damage(e, amt, src = {}) {
  if (e.dead || e.hp === undefined || e.spawnT > 0 || e.invuln) return 0;
  const p = G.player;
  if (e.kind === 'boss' && e.warded) { if (!e.wardFx || G.time - e.wardFx > 0.25) { e.wardFx = G.time; fx('block', { x: e.x, y: 1.6, z: e.z }); sfx('block', 0.5); } return 0; }
  if (e.kind === 'bailiff' && e.shield > 0 && e.st !== 'recover' && e.stun <= 0 && src.x !== undefined && !src.pierce) {
    const ang = Math.atan2(src.x - e.x, src.z - e.z);
    if (Math.abs(angDiff(e.yaw, ang)) < 1.2) {
      e.shield -= amt * (src.type === 'beam' ? 1 : 0.7);
      if (!e.blockFx || G.time - e.blockFx > 0.18) { e.blockFx = G.time; fx('block', { x: e.x + Math.sin(e.yaw) * 0.9, y: 1.5, z: e.z + Math.cos(e.yaw) * 0.9 }); sfx('block', 0.6); }
      if (e.shield <= 0) { e.shield = 0; e.stun = 1.6; fx('shatter', { x: e.x, y: 1.4, z: e.z }); sfx('shatter'); G.onEvent('shieldBroken', e); }
      return 0;
    }
  }
  if (e.warded && e.team === 'legion') amt *= 0.4;
  if (e.kind === 'boss') { if (src.type === 'beam') amt *= 0.42; if (e.stagger > 0) amt *= 1.5; }
  if (src.type === 'claw' || src.type === 'tail') { if (p.blindside > 0 || backOf(e, src)) { amt *= 2.2; src.crit = true; } }
  e.hp -= amt; e.flash = 0.1;
  if (e.team === 'legion') {
    const gain = src.type === 'claw' || src.type === 'tail' ? 5 : src.type === 'throw' ? 9 : amt * 0.055;
    p.auth = Math.min(100, p.auth + gain);
  }
  if (src.kb && src.x !== undefined) launch(e, e.x - src.x, e.z - src.z, src.kb, src.up || 0);
  if (src.stun) e.stun = Math.max(e.stun, src.stun);
  if (src.type !== 'beam') fx('hit', { x: e.x, y: (e.y || 0) + 1.2, z: e.z, big: amt > 35 || src.crit, crit: !!src.crit });
  if (e.hp <= 0) kill(e, src);
  return amt;
}
function backOf(e, src) {
  if (src.x === undefined || e.team !== 'legion' || e.kind === 'tick' || e.fixed) return false;
  return Math.abs(angDiff(e.yaw, Math.atan2(src.x - e.x, src.z - e.z))) > 2.2;
}

export function kill(e, src = {}) {
  if (e.dead) return;
  if (e.kind === 'boss') {   // the Reckoner does not die: he kneels
    e.hp = 1; e.invuln = true; e.passive = true; e.act = 'kneel'; e.warded = false; e.stagger = 0; e.line = null; e.ringT && (e.ringT.t = 999);
    G.onEvent('bossDown', e); return;
  }
  e.dead = true; e.hp = 0;
  const p = G.player;
  if (p.tk.ent === e) p.tk.ent = null;
  if (e.kind === 'drone') { blast(e.x, e.z, 3.2, 55, { enemy: src.type === undefined, both: true, y: e.y }); }
  else if (e.kind === 'drum') { blast(e.x, e.z, 4.6, 95, { both: true, y: e.y }); }
  else if (e.kind === 'crate') { fx('debris', { x: e.x, y: e.y + 0.5, z: e.z }); sfx('crack', 0.7); }
  else if (e.kind === 'nest') { blast(e.x, e.z, 3, 0, { visual: true }); fx('debris', { x: e.x, y: 0.8, z: e.z, n: 30 }); }
  else if (e.team === 'legion') { fx('death', { x: e.x, y: e.y, z: e.z, kind: e.kind }); sfx(e.kind === 'tick' ? 'pop' : 'unmake', e.kind === 'tick' ? 0.5 : 0.8); G.stats.kills++; }
  G.onEvent('kill', e);
}

// explosion. opts.enemy: it hurts Vellum; opts.both: hurts everyone except Vellum unless enemy
export function blast(x, z, r, dmg, opts = {}) {
  fx('burst', { x, z, y: opts.y || 0.6, r, col: opts.col });
  sfx('boom', clamp(r / 5, 0.5, 1.2)); G.shake = Math.max(G.shake, r * 0.11);
  if (opts.visual) return;
  const p = G.player;
  if (opts.enemy) { const d = dist(x, z, p.x, p.z); if (d < r + p.r) hurtPlayer(dmg * 0.32, x, z, 7); }
  if (!opts.enemy || opts.both) {
    for (const e of G.ents) {
      if (e.dead || e.hp === undefined || e.team === 'town' || e.held) continue;
      const d = dist(x, z, e.x, e.z); if (d > r + e.r) continue;
      const f = 1 - 0.5 * clamp(d / r, 0, 1);
      damage(e, dmg * f, { x, z, type: opts.type || 'burst', kb: (opts.kb || 15) * f, up: 5.5 * f, pierce: opts.pierce });
    }
    for (const e of G.ents) if (e.obj && !e.dead && e.hp === undefined && !e.held && !e.pinned) { const d = dist(x, z, e.x, e.z); if (d < r) launch(e, e.x - x, e.z - z, 9 * (1 - d / r), 3); }
  }
}

export function hurtPlayer(amt, sx, sz, kb = 5) {
  const p = G.player;
  if (p.iframes > 0 || p.dead || G.mode !== 'play' || p.locked) return false;
  p.hp -= amt; p.hurtT = 0.3; p.iframes = 0.4; p.regenDelay = 4.5; G.shake = Math.max(G.shake, 0.35 + amt * 0.02);
  if (sx !== undefined) { const d = Math.hypot(p.x - sx, p.z - sz) || 1; p.vx += ((p.x - sx) / d) * kb; p.vz += ((p.z - sz) / d) * kb; }
  fx('hurt', { x: p.x, y: p.y + 1.5, z: p.z }); sfx('hurt');
  if (p.burst.charging) { p.burst.charging = false; p.burst.c = 0; }
  if (p.hp <= 0) { p.hp = 0; p.dead = true; G.onEvent('fallen'); }
  return true;
}

// ---------- per-frame physics for everything that is not AI ----------
export function updateEntities(dt) {
  const p = G.player;
  for (const e of G.ents) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    if (e.kind === 'bolt') { updateBolt(e, dt); continue; }
    if (e.kind === 'orb') continue;         // handled by player.js
    if (e.kind === 'page' || e.kind === 'marker') continue;
    if (e.held) continue;                    // positioned by the grip
    if (e.ride) { e.x = p.x; e.z = p.z; e.y = p.y; e.yaw = p.yaw; continue; }
    // thrown objects and launched bodies
    if (e.thrown > 0) { updateThrown(e, dt); continue; }
    const ground = (e.level ? e.level.h : 0) + (e.hover || 0);
    if (e.air || e.y > ground + 0.01 || e.vy > 0) {
      e.vy -= 26 * dt; e.y += e.vy * dt;
      if (e.y <= ground) {
        // landed. Bodies thrown into the canal are gone.
        if (!e.fly && !e.level && inVoid(e.x, e.z, 0)) { if (e.y < -4.2) { fellInCanal(e); continue; } }
        else { e.y = ground; e.vy = 0; if (e.air) { e.air = false; if (e.team === 'legion' && Math.hypot(e.vx, e.vz) > 5) { e.stun = Math.max(e.stun, 0.7); fx('dust', { x: e.x, z: e.z }); } } }
      }
    }
    if (e.fixed || e.pinned) { e.vx = e.vz = 0; continue; }
    if (e.vx || e.vz) {
      e.x += e.vx * dt; e.z += e.vz * dt;
      const fr = e.air ? 0.6 : e.obj ? 5 : 7;
      e.vx = damp(e.vx, 0, fr, dt); e.vz = damp(e.vz, 0, fr, dt);
      if (Math.abs(e.vx) + Math.abs(e.vz) < 0.05) e.vx = e.vz = 0;
    }
    if (e.kb > 0) e.kb -= dt;
    pushOut(e, !(e.air || e.fly));
  }
  // soft separation so nobody stands inside anybody else
  const list = G.ents;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (a.dead || a.held || a.ride || a.fixed || a.kind === 'bolt' || a.kind === 'orb' || a.kind === 'page' || a.kind === 'marker' || a.pinned || a.thrown > 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (b.dead || b.held || b.ride || b.kind === 'bolt' || b.kind === 'orb' || b.kind === 'page' || b.kind === 'marker' || b.thrown > 0) continue;
      if (Math.abs(a.y - b.y) > 1.6) continue;
      const dx = b.x - a.x, dz = b.z - a.z, m = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= m * m || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (m - d) * 0.5, nx = dx / d, nz = dz / d;
      const wa = b.fixed || b.pinned ? 1 : b.mass / (a.mass + b.mass), wb = b.fixed || b.pinned ? 0 : 1 - wa;
      a.x -= nx * push * wa * 1.2; a.z -= nz * push * wa * 1.2; b.x += nx * push * wb * 1.2; b.z += nz * push * wb * 1.2;
    }
    // and not inside Vellum
    if (Math.abs(a.y - p.y) < 1.6 && !p.dead) {
      const dx = a.x - p.x, dz = a.z - p.z, m = a.r + p.r * 0.85, d2 = dx * dx + dz * dz;
      if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = (m - d) / d; if (a.mass > 9) { p.x -= dx * k; p.z -= dz * k; } else { a.x += dx * k; a.z += dz * k; } }
    }
  }
  for (const t of G.tele) {
    t.t += dt; const f = t.follow;
    if (f) {
      if (f.dead || f.stun > 0 || f.held || f.thrown > 0) { t.t = t.dur; continue; }
      if (t.type === 'circle') { t.x = f.x + Math.sin(f.yaw) * t.off; t.z = f.z + Math.cos(f.yaw) * t.off; }
      else if (t.type === 'line' && t.len) { t.x0 = f.x; t.z0 = f.z; t.x1 = f.x + Math.sin(f.yaw) * t.len; t.z1 = f.z + Math.cos(f.yaw) * t.len; }
    }
  }
  G.tele = G.tele.filter((t) => t.t < t.dur);
  if (G.ents.some((e) => e.dead)) G.ents = G.ents.filter((e) => !e.dead);
}

function fellInCanal(e) {
  if (e.team === 'legion') { fx('death', { x: e.x, y: -3, z: e.z, kind: e.kind }); sfx('unmake', 0.6); e.dead = true; G.stats.kills++; G.player.auth = Math.min(100, G.player.auth + 6); G.onEvent('kill', e); }
  else { const s = findStandable(e.x < 66.5 ? 62.5 : 70.5, e.z, e.r); e.x = s.x; e.z = s.z; e.y = 0; e.vy = 0; e.vx = e.vz = 0; e.air = false; }
}

function updateThrown(e, dt) {
  e.thrown -= dt;
  const px = e.x, pz = e.z;
  e.x += e.vx * dt; e.z += e.vz * dt; e.vy -= 14 * dt; e.y += e.vy * dt; e.spin = (e.spin || 0) + dt * 9;
  // strike the first hostile thing in the way
  for (const o of G.ents) {
    if (o === e || o.dead || o.hp === undefined || o.team === 'town' || o.held || (e.hitSet && e.hitSet.has(o.id))) continue;
    if (o.obj && !o.breakable) continue;
    if (dist(e.x, e.z, o.x, o.z) < e.r + o.r + 0.25 && Math.abs((o.y || 0) + 1 - e.y) < 2.6) { impact(e, o); if (e.dead || e.thrown <= 0) return; }
  }
  const y0 = e.y; e.y = Math.max(e.y, 0.6);
  const hitWall = pushOut(e, false); e.y = y0;
  if (hitWall && (Math.abs(e.x - (px + e.vx * dt)) + Math.abs(e.z - (pz + e.vz * dt)) > 0.02)) { impact(e, null); return; }
  if (e.y <= 0) {
    if (inVoid(e.x, e.z, 0)) { if (e.y < -4.2) { e.thrown = 0; if (e.team === 'legion' || e.breakable) { if (e.team === 'legion') fellInCanal(e); else kill(e); } else fellInCanal(e); } return; }
    e.y = 0; impact(e, null);
  } else if (e.thrown <= 0) { e.air = true; }
}

// a thrown thing has struck `o` (or the ground/a wall when o is null)
function impact(e, o) {
  const dmg = e.kind === 'girder' ? 115 : e.kind === 'stake' ? 80 : e.team === 'legion' ? 55 : 30 + e.mass * 10;
  if (e.kind === 'drum' || e.kind === 'drone') { e.thrown = 0; kill(e, { type: 'throw' }); return; }
  if (o) {
    if (!e.hitSet) e.hitSet = new Set(); e.hitSet.add(o.id);
    const shielded = o.kind === 'bailiff' && o.shield > 0;
    damage(o, dmg, { x: e.x - e.vx * 0.05, z: e.z - e.vz * 0.05, type: 'throw', kb: 10 + e.mass * 1.5, up: 4, stun: 0.6 });
    if (o.kind === 'boss' && !o.warded && (e.kind === 'stake' || e.mass >= 4)) { o.stagger = Math.max(o.stagger || 0, 2.6); G.onEvent('bossStagger', o); }
    if (shielded) o.stun = Math.max(o.stun, 0.9);
    G.shake = Math.max(G.shake, 0.4); sfx('slam');
    if (e.kind === 'girder' && !shielded && o.kind !== 'boss') return;                       // a girder keeps going
    if (e.team === 'legion') { damage(e, 45, { type: 'throw', pierce: true }); }
  } else { fx('dust', { x: e.x, z: e.z }); sfx('thud', 0.7); if (e.team === 'legion') { damage(e, 32, { type: 'throw', pierce: true }); e.stun = Math.max(e.stun, 1.4); } }
  if (e.dead) return;
  if (e.kind === 'crate') { kill(e); return; }
  if (e.kind === 'stake') { e.inert = true; kill(e); return; }
  e.thrown = 0; e.vx *= o ? -0.15 : 0.25; e.vz *= o ? -0.15 : 0.25; e.vy = o ? 3 : 0; e.air = true; e.hitSet = null;
}

function updateBolt(e, dt) {
  e.life -= dt; if (e.life <= 0) { e.dead = true; return; }
  const sp = Math.hypot(e.vx, e.vz), nx = e.vx / sp, nz = e.vz / sp;
  if (rayBlocks(e.x, e.z, nx, nz, sp * dt + 0.2, e.y) < sp * dt + 0.2) { e.dead = true; fx('spark', { x: e.x, y: e.y, z: e.z, n: 6, col: e.mine ? 0xffc266 : 0xb48bff }); return; }
  e.x += e.vx * dt; e.z += e.vz * dt; e.yaw = Math.atan2(e.vx, e.vz);
  const p = G.player;
  if (e.mine) {
    for (const o of G.ents) if (isEnemy(o) && o.spawnT <= 0 && dist(e.x, e.z, o.x, o.z) < o.r + 0.35) { damage(o, e.dmg, { x: e.x - nx, z: e.z - nz, type: 'bolt', kb: 6, stun: 0.3 }); e.dead = true; fx('spark', { x: e.x, y: e.y, z: e.z, n: 10, col: 0xffc266 }); return; }
  } else if (!p.dead && Math.abs(p.y + 1.4 - e.y) < 2 && dist(e.x, e.z, p.x, p.z) < p.r + 0.2) {
    if (hurtPlayer(e.dmg, e.x - nx, e.z - nz, 4)) { e.dead = true; fx('spark', { x: e.x, y: e.y, z: e.z, n: 8, col: 0xb48bff }); }
  }
}

// walking helper shared by soldiers and townsfolk
export function walkTo(e, tx, tz, speed, dt, avoid = true) {
  const wp = routeToward(e.x, e.z, tx, tz);
  let dx = wp.x - e.x, dz = wp.z - e.z; const d = Math.hypot(dx, dz);
  if (d < 0.05) return 0;
  dx /= d; dz /= d;
  if (avoid && e.stuck > 0.35) { const s = e.slideDir || (e.slideDir = Math.random() < 0.5 ? 1 : -1); const ox = dx; dx = dx * 0.25 - dz * s; dz = dz * 0.25 + ox * s; const n = Math.hypot(dx, dz); dx /= n; dz /= n; if (e.stuck > 1.5) { e.stuck = 0; e.slideDir = -s; } }
  const bx = e.x, bz = e.z, step = Math.min(speed * dt, d);
  e.x += dx * step; e.z += dz * step;
  pushOut(e, !e.fly);
  const moved = Math.hypot(e.x - bx, e.z - bz);
  if (moved < step * 0.35) e.stuck = (e.stuck || 0) + dt; else if (e.stuck > 0) e.stuck = Math.max(0, e.stuck - dt * 0.5);
  e.yaw = damp(e.yaw, e.yaw + angDiff(e.yaw, Math.atan2(dx, dz)), 10, dt);
  e.phase += moved * 2.6; e.runAmt = damp(e.runAmt, clamp(speed / 4, 0.3, 1), 10, dt);
  return d;
}

// townsfolk: walk to goals, ride a shoulder, wait
export function updateNpc(e, dt) {
  if (e.held || e.ride || e.pinned || e.dead) return;
  if (e.goal) {
    const d = walkTo(e, e.goal.x, e.goal.z, e.goal.speed || 3.6, dt);
    if (d < (e.goal.near || 0.5)) { const g = e.goal; e.goal = null; e.runAmt = 0; if (g.yaw !== undefined) e.yaw = g.yaw; if (g.then) g.then(e); }
  } else {
    e.runAmt = damp(e.runAmt, 0, 10, dt);
    if (e.face) e.yaw = damp(e.yaw, e.yaw + angDiff(e.yaw, Math.atan2(e.face.x - e.x, e.face.z - e.z)), 6, dt);
  }
}
