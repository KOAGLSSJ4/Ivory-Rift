// enemies.js — the Tithing Throne's collectors, and the Reckoner who leads them.
// Each one is built to be answered by a different power.
import { G, fx, sfx, spawn, damage, hurtPlayer, blast, walkTo, isEnemy, kill } from './sim.js';
import { pushOut, rayBlocks, blockedAt, findStandable, P } from './world.js';
import { clamp, damp, dampAng, angDiff, dist, rand, TAU } from './util.js';

const tele = (o) => { o.t = 0; G.tele.push(o); return o; };

export function updateEnemies(dt) {
  const p = G.player;
  // stakes ward the soldiers around them
  const stakes = G.ents.filter((e) => e.kind === 'stake' && !e.dead && !e.inert && e.spawnT <= 0);
  for (const e of G.ents) {
    if (e.dead || e.team !== 'legion') continue;
    if (e.heatT > 0) { e.heatT -= dt; } else if (e.heat > 0) e.heat = Math.max(0, e.heat - dt * 2);
    if (e.kind !== 'stake' && e.kind !== 'boss' && e.kind !== 'nest') { e.warded = false; e.wardBy = null; for (const s of stakes) if (dist(e.x, e.z, s.x, s.z) < 10) { e.warded = true; e.wardBy = s; break; } }
    if (e.spawnT > 0 || e.held || e.thrown > 0) continue;
    if (e.stun > 0) { e.stun -= dt; e.act = e.kind === 'boss' ? e.act : 'stagger'; e.runAmt = 0; if (e.stun <= 0 && e.kind !== 'boss') { e.act = 'idle'; e.st = 'chase'; e.t = 0; } if (e.kind !== 'boss') continue; }
    if (e.air) continue;
    if (e.passive || G.mode === 'ending') { e.runAmt = damp(e.runAmt, 0, 8, dt); continue; }
    AI[e.kind] && AI[e.kind](e, p, dt);
  }
}
const face = (e, x, z, k, dt) => { e.yaw = dampAng(e.yaw, Math.atan2(x - e.x, z - e.z), k, dt); };
const targetOf = (e, p) => (e.target && !e.target.dead && dist(e.x, e.z, p.x, p.z) > 6.5 ? e.target : p);
const sameSide = (e, p) => (e.x < 66.5) === (p.x < 66.5);

const AI = {
  // scrap-ticks: vermin. They only matter in numbers.
  tick(e, p, dt) {
    const tg = e.chew && dist(e.x, e.z, p.x, p.z) > 7 ? e.chew : p;
    const d = dist(e.x, e.z, tg.x, tg.z);
    if (tg === p && d < 1.2 && e.cd <= 0) { hurtPlayer(2, e.x, e.z, 1); e.cd = 1.2; }
    e.cd -= dt;
    if (d > (tg === p ? 0.9 : 1.4)) walkTo(e, tg.x + Math.sin(e.id) * 0.8, tg.z + Math.cos(e.id) * 0.8, e.speed * (e.march ? 0.75 : 1), dt); else { e.runAmt = 0.6; face(e, tg.x, tg.z, 8, dt); }
  },
  // Tallymen: blade soldiers. Close, wind up (the tell), lunge.
  tally(e, p, dt) {
    const tg = targetOf(e, p), d = dist(e.x, e.z, tg.x, tg.z);
    e.t += dt;
    if (e.st === 'windup') {
      e.act = 'windup'; e.runAmt = 0; if (e.t < 0.34) face(e, tg.x, tg.z, 14, dt);
      if (e.t >= 0.5) { e.st = 'strike'; e.t = 0; e.hitDone = false; sfx('swish', 0.5); }
    } else if (e.st === 'strike') {
      e.act = 'strike'; const sp = 15; e.x += Math.sin(e.yaw) * sp * dt; e.z += Math.cos(e.yaw) * sp * dt; pushOut(e, true);
      if (!e.hitDone && tg === p && dist(e.x, e.z, p.x, p.z) < 1.75 && Math.abs(p.y - e.y) < 1.5) { e.hitDone = true; hurtPlayer(9, e.x, e.z, 6); }
      if (e.t >= 0.18) { e.st = 'recover'; e.t = 0; }
    } else if (e.st === 'recover') { e.act = 'idle'; e.runAmt = 0; if (e.t > 0.65) { e.st = 'chase'; e.t = 0; } }
    else {
      e.act = 'idle';
      if (d < 2.7 && Math.abs(p.y - e.y) < 1.5) { e.st = 'windup'; e.t = 0; tele({ type: 'circle', x: e.x + Math.sin(e.yaw) * 1.6, z: e.z + Math.cos(e.yaw) * 1.6, r: 1.5, dur: 0.5, follow: e, off: 1.6 }); sfx('tell', 0.35); }
      else { const a = e.id * 2.4, off = d > 5 ? 1.6 : 0; walkTo(e, tg.x + Math.sin(a) * off, tg.z + Math.cos(a) * off, e.speed, dt); }
    }
  },
  // Lancers: hold range, draw a line (the tell), fire a bolt. Claws send the bolt back.
  lancer(e, p, dt) {
    const d = dist(e.x, e.z, p.x, p.z);
    e.t += dt; e.cd -= dt;
    if (e.st === 'aim') {
      e.act = 'aim'; e.runAmt = 0;
      if (e.t < 0.55) { face(e, p.x, p.z, 12, dt); if (e.line) { e.line.x0 = e.x; e.line.z0 = e.z; e.line.x1 = e.x + Math.sin(e.yaw) * 24; e.line.z1 = e.z + Math.cos(e.yaw) * 24; } }
      if (e.t >= 0.8) {
        e.st = 'chase'; e.t = 0; e.cd = rand(2.0, 3.0); e.act = 'idle';
        spawn('bolt', e.x + Math.sin(e.yaw) * 1.2, e.z + Math.cos(e.yaw) * 1.2, { y: e.y + 1.4, vx: Math.sin(e.yaw) * 21, vz: Math.cos(e.yaw) * 21, dmg: 11, life: 2.2, yaw: e.yaw });
        sfx('bolt', 0.6);
      }
      return;
    }
    e.act = 'idle';
    const los = e.hold || rayBlocks(e.x, e.z, (p.x - e.x) / (d || 1), (p.z - e.z) / (d || 1), d, 1.4) >= d - 0.1;
    if (e.cd <= 0 && d < 24 && los) { e.st = 'aim'; e.t = 0; e.line = tele({ type: 'line', x0: e.x, z0: e.z, x1: p.x, z1: p.z, w: 0.14, dur: 0.8 }); sfx('tell', 0.3); return; }
    if (e.hold) { e.runAmt = 0; face(e, p.x, p.z, 6, dt); }
    else if (d < 8) walkTo(e, e.x + (e.x - p.x), e.z + (e.z - p.z), e.speed, dt);
    else if (d > 15 || !los) walkTo(e, p.x, p.z, e.speed, dt);
    else { const s = e.id % 2 ? 1 : -1; walkTo(e, e.x - ((p.z - e.z) / d) * 3 * s, e.z + ((p.x - e.x) / d) * 3 * s, e.speed * 0.5, dt, false); face(e, p.x, p.z, 8, dt); }
  },
  // Bailiffs: a wall with legs. The shield stops everything from the front: get behind it, melt it, or take it away.
  bailiff(e, p, dt) {
    const tg = targetOf(e, p), d = dist(e.x, e.z, tg.x, tg.z);
    e.t += dt;
    const turn = e.shield > 0 ? 1.7 : 3.2;
    if (e.st === 'windup') {
      e.act = 'windup'; e.runAmt = 0; if (e.t < 0.45) face(e, tg.x, tg.z, turn * 2, dt);
      if (e.t >= 0.75) { e.st = 'strike'; e.t = 0; e.hitDone = false; sfx('swish', 0.8); }
    } else if (e.st === 'strike') {
      e.act = 'strike'; const sp = 15; e.x += Math.sin(e.yaw) * sp * dt; e.z += Math.cos(e.yaw) * sp * dt; pushOut(e, true);
      if (!e.hitDone && dist(e.x, e.z, p.x, p.z) < 2.3 && Math.abs(p.y - e.y) < 1.5) { e.hitDone = true; if (hurtPlayer(20, e.x, e.z, 13)) G.shake = 0.8; }
      if (tg !== p && !e.hitDone && d < 2.6) { e.hitDone = true; G.onEvent('bash', tg); fx('hit', { x: tg.x, y: 1.2, z: tg.z, big: true }); sfx('slam'); }
      if (e.t >= 0.3) { e.st = 'recover'; e.t = 0; }
    } else if (e.st === 'recover') { e.act = 'stagger'; e.runAmt = 0; if (e.t > 1.15) { e.st = 'chase'; e.t = 0; } }
    else {
      e.act = 'idle';
      if (d < 3.6 && Math.abs(angDiff(e.yaw, Math.atan2(tg.x - e.x, tg.z - e.z))) < 0.7) { e.st = 'windup'; e.t = 0; tele({ type: 'line', x0: e.x, z0: e.z, x1: e.x + Math.sin(e.yaw) * 6.2, z1: e.z + Math.cos(e.yaw) * 6.2, w: 1.1, dur: 0.75, follow: e, len: 6.2 }); sfx('tell', 0.5); }
      else {
        const want = Math.atan2(tg.x - e.x, tg.z - e.z), diff = angDiff(e.yaw, want);
        e.yaw += clamp(diff, -turn * dt, turn * dt);
        if (Math.abs(diff) < 1.0 && d > 2.4) { const sp = (e.shield > 0 ? e.speed : e.speed * 1.5) * dt, bx = e.x, bz = e.z; e.x += Math.sin(e.yaw) * sp; e.z += Math.cos(e.yaw) * sp; pushOut(e, true); e.phase += Math.hypot(e.x - bx, e.z - bz) * 2; e.runAmt = 0.6; } else e.runAmt = damp(e.runAmt, 0, 8, dt);
      }
    }
  },
  // Seekers: flying mines. Shoot them near their friends, or Grip one and throw it.
  drone(e, p, dt) {
    const d = dist(e.x, e.z, p.x, p.z);
    e.y = damp(e.y, (p.y || 0) + e.hover + Math.sin(G.time * 3 + e.id) * 0.2, 4, dt);
    if (e.arm > 0) { e.arm -= dt; if (e.arm <= 0) { kill(e); } return; }
    face(e, p.x, p.z, 6, dt);
    const sp = e.speed * dt, a = Math.atan2(p.x - e.x, p.z - e.z) + Math.sin(G.time * 2 + e.id) * 0.5;
    e.x += Math.sin(a) * sp; e.z += Math.cos(a) * sp; pushOut(e, false);
    if (d < 2.3) { e.arm = 0.75; tele({ type: 'circle', x: e.x, z: e.z, r: 3.2, dur: 0.75, follow: e, off: 0 }); sfx('beep', 0.6); }
  },
  stake(e, p, dt) { },
  // the scrap-tick nest in Mara's yard keeps a few ticks about until it is burst
  nest(e, p, dt) {
    e.cd -= dt;
    if (e.cd <= 0 && e.active) { e.cd = 1.3; const n = G.ents.filter((o) => o.kind === 'tick' && !o.dead).length; if (n < 5) spawn('tick', e.x + rand(-1.5, 1.5), e.z + rand(-1.5, 1.5), {}); }
  },
  boss: bossAI,
};

// ============================ THE RECKONER ============================
const STAKE_SPOTS = [[80, 40], [96, 52], [82, 54], [95, 41], [88, 36]];
function bossAI(e, p, dt) {
  const d = dist(e.x, e.z, p.x, p.z);
  e.t += dt;
  if (e.stagger > 0) {
    e.stagger -= dt; e.act = 'stagger'; e.rise = 0;
    if (e.stagger <= 0) { e.act = 'idle'; e.st = 'idle'; e.cd = 0.7; }
    return;
  }
  // phase changes: he plants stakes and stands behind their ward
  const frac = e.hp / e.maxHp, wantPhase = frac < 0.34 ? 3 : frac < 0.68 ? 2 : 1;
  if (wantPhase > e.phaseN && e.st === 'idle') {
    e.phaseN = wantPhase; e.warded = true; e.st = 'idle'; e.cd = 2.2; e.act = 'cast';
    const n = wantPhase === 2 ? 2 : 3;
    for (let i = 0; i < n; i++) { const [x, z] = STAKE_SPOTS[(i * 2 + wantPhase) % 5]; const s = spawn('stake', x, z, { materialize: true, bossStake: true }); fx('slam', { x, z }); }
    const adds = wantPhase === 2 ? ['tally', 'tally', 'tally'] : ['tally', 'tally', 'lancer', 'drone', 'drone'];
    adds.forEach((k, i) => { const a = (i / adds.length) * TAU; const s = findStandable(e.x + Math.sin(a) * 6, e.z + Math.cos(a) * 6, 0.7); spawn(k, s.x, s.z, { materialize: true }); });
    sfx('summon'); G.shake = Math.max(G.shake, 0.6); G.onEvent('bossPhase', e);
    return;
  }
  if (e.warded) {
    const left = G.ents.filter((s) => s.kind === 'stake' && s.bossStake && !s.dead && !s.inert).length;
    if (left === 0) { e.warded = false; e.stagger = 3.6; fx('shatter', { x: e.x, y: 1.8, z: e.z, big: true }); sfx('shatter'); G.shake = Math.max(G.shake, 0.8); G.onEvent('bossWardDown', e); return; }
  }
  const hard = e.phaseN, rate = e.warded ? 1.6 : 1;
  switch (e.st) {
    case 'idle': {
      e.act = e.t < 0.4 && e.warded ? 'cast' : 'idle'; face(e, p.x, p.z, 4, dt);
      // drift to keep his distance, staying in the plaza
      const want = 10, ang = Math.atan2(e.x - p.x, e.z - p.z) + 0.5 * dt;
      let tx = p.x + Math.sin(ang) * want, tz = p.z + Math.cos(ang) * want;
      const cd = dist(tx, tz, P.plaza.x, P.plaza.z); if (cd > 12) { tx = P.plaza.x + ((tx - P.plaza.x) / cd) * 12; tz = P.plaza.z + ((tz - P.plaza.z) / cd) * 12; }
      e.x = damp(e.x, tx, 0.9, dt); e.z = damp(e.z, tz, 0.9, dt); pushOut(e, true);
      e.cd -= dt;
      if (e.cd <= 0) {
        const seq = e.warded ? ['audit', 'volley'] : hard === 1 ? ['audit', 'volley', 'distraint', 'audit', 'foreclose'] : ['audit', 'blinkstrike', 'volley', 'distraint', 'foreclose', 'blinkstrike'];
        e.st = seq[e.seq++ % seq.length]; e.t = 0; e.n = 0; e.sub = 0;
        if (e.st === 'foreclose' && !e.toldRing) { e.toldRing = true; G.onEvent('bossTell', 'ring'); }
      }
      break;
    }
    case 'audit': {   // a drawn line, then a beam along it
      e.act = 'aim';
      const shots = e.warded ? 1 : hard >= 2 ? 3 : 1;
      if (!e.line) { face(e, p.x, p.z, 20, dt); e.lockYaw = Math.atan2(p.x - e.x, p.z - e.z) + (shots > 1 ? (e.n - 1) * 0.3 : 0); e.line = tele({ type: 'line', x0: e.x, z0: e.z, x1: e.x, z1: e.z, w: 0.5, dur: 0.85, boss: true }); e.lt = 0; sfx('tell', 0.6); }
      e.lt += dt;
      if (e.lt < 0.5) { e.lockYaw = dampAng(e.lockYaw, Math.atan2(p.x - e.x, p.z - e.z) + (shots > 1 ? (e.n - 1) * 0.3 : 0), 5, dt); }
      e.yaw = e.lockYaw; e.line.x0 = e.x; e.line.z0 = e.z; e.line.x1 = e.x + Math.sin(e.lockYaw) * 42; e.line.z1 = e.z + Math.cos(e.lockYaw) * 42;
      if (e.lt >= 0.85) {
        const dx = Math.sin(e.lockYaw), dz = Math.cos(e.lockYaw);
        fx('auditBeam', { x0: e.x, z0: e.z, x1: e.x + dx * 42, z1: e.z + dz * 42 }); sfx('auditFire'); G.shake = Math.max(G.shake, 0.45);
        const px = p.x - e.x, pz = p.z - e.z, along = px * dx + pz * dz, perp = Math.abs(px * dz - pz * dx);
        if (along > 0 && along < 42 && perp < 1.0 + p.r * 0.5 && Math.abs(p.y) < 2) hurtPlayer(18, p.x - dz * (px * dz - pz * dx > 0 ? 1 : -1), p.z + dx * (px * dz - pz * dx > 0 ? 1 : -1), 9);
        e.line = null; e.n++;
        if (e.n >= shots) { e.st = 'idle'; e.t = 0; e.cd = (hard === 3 ? 0.8 : 1.3) * rate; }
      }
      break;
    }
    case 'volley': {   // fans of bolts; claws send them home
      e.act = 'cast'; face(e, p.x, p.z, 8, dt);
      const bursts = e.warded ? 1 : hard >= 2 ? 3 : 2;
      e.sub -= dt;
      if (e.t > 0.45 && e.sub <= 0) {
        for (let i = -2; i <= 2; i++) { const a = e.yaw + i * 0.2 + (e.n % 2 ? 0.1 : 0); spawn('bolt', e.x + Math.sin(a) * 1.4, e.z + Math.cos(a) * 1.4, { y: 1.5, vx: Math.sin(a) * 17, vz: Math.cos(a) * 17, dmg: 9, life: 2.6, yaw: a }); }
        sfx('bolt', 0.8); e.n++; e.sub = 0.5;
        if (e.n >= bursts) { e.st = 'idle'; e.t = 0; e.cd = (hard === 3 ? 0.9 : 1.4) * rate; }
      }
      break;
    }
    case 'distraint': {   // a seal under your feet: leave it, or be lifted and dropped
      e.act = 'cast'; face(e, p.x, p.z, 6, dt);
      const count = hard >= 2 ? 3 : 1;
      e.sub -= dt;
      if (e.n < count && e.sub <= 0) {
        const c = tele({ type: 'circle', x: p.x + p.vx * 0.25, z: p.z + p.vz * 0.25, r: 2.7, dur: 1.0, boss: true });
        c.fire = true; e.n++; e.sub = 0.55; sfx('tell', 0.6);
        e.seals = e.seals || []; e.seals.push(c);
      }
      if (e.seals) for (const c of e.seals) if (!c.done && c.t >= c.dur - 0.03) {
        c.done = true; fx('seal', { x: c.x, z: c.z, r: c.r }); sfx('sealFire');
        if (dist(c.x, c.z, p.x, p.z) < c.r + 0.2 && p.y < 2 && hurtPlayer(16, c.x, c.z, 0)) { p.stun = 0.75; p.vy = 0; p.lift = 2.6; p.liftT = 0.42; }
      }
      if (e.n >= count && e.seals && e.seals.every((c) => c.done)) { e.seals = null; e.st = 'idle'; e.t = 0; e.cd = 1.2; }
      break;
    }
    case 'foreclose': {   // a ring that sweeps the whole plaza. Blink through it.
      e.act = 'cast';
      const rings = hard >= 3 ? 2 : 1;
      if (e.t < 0.9) { e.rise = damp(e.rise || 0, 1.3, 5, dt); if (!e.fc) { e.fc = tele({ type: 'circle', x: e.x, z: e.z, r: 2.4, dur: 0.9, boss: true }); sfx('tell', 0.8); } break; }
      if (!e.ring) { e.ring = { r: 1.5, hit: false }; fx('ringStart', { x: e.x, z: e.z }); sfx('ringFire'); G.shake = Math.max(G.shake, 0.6); e.fc = null; }
      e.rise = damp(e.rise, 0, 3, dt);
      e.ring.r += 13.5 * dt;
      if (!e.ringT || e.ringT.t >= e.ringT.dur) e.ringT = tele({ type: 'ring', x: e.x, z: e.z, r: e.ring.r, dur: 99, boss: true });
      e.ringT.r = e.ring.r;
      if (!e.ring.hit && Math.abs(d - e.ring.r) < 0.95 && p.y < 2.2) { if (hurtPlayer(16, e.x, e.z, 10)) e.ring.hit = true; }
      if (e.ring.r > 25) { e.ring = null; e.ringT.t = 999; e.ringT = null; e.n++; e.t = 0.35; if (e.n >= rings) { e.st = 'idle'; e.t = 0; e.cd = 1.1; e.rise = 0; } }
      break;
    }
    case 'blinkstrike': {   // he arrives beside you and sweeps. The recovery is the opening.
      if (e.t < 0.3) { e.act = 'cast'; if (!e.gone) { e.gone = true; fx('blinkV', { x: e.x, z: e.z }); sfx('blink', 0.7); } break; }
      if (e.gone) {
        e.gone = false; const a = rand(TAU); const s = findStandable(clamp(p.x + Math.sin(a) * 3.4, 74, 102), clamp(p.z + Math.cos(a) * 3.4, 31, 61), e.r);
        e.x = s.x; e.z = s.z; e.yaw = Math.atan2(p.x - e.x, p.z - e.z); fx('blinkV', { x: e.x, z: e.z });
        tele({ type: 'circle', x: e.x, z: e.z, r: 3.9, dur: 0.6, boss: true }); sfx('tell', 0.7); e.swept = false;
      }
      if (e.t < 0.9) { e.act = 'cast'; break; }
      if (!e.swept) { e.swept = true; e.act = 'sweep'; fx('sweep', { x: e.x, z: e.z, r: 3.9 }); sfx('tail'); if (d < 3.9 + p.r * 0.5 && p.y < 2) hurtPlayer(17, e.x, e.z, 12); }
      e.act = e.t < 1.2 ? 'sweep' : 'stagger';
      if (e.t > 2.1) { e.st = 'idle'; e.t = 0; e.cd = 0.9; e.act = 'idle'; }
      break;
    }
  }
}

export function makeBoss(x, z) {
  const b = spawn('boss', x, z, { phaseN: 1, seq: 0, cd: 1.6, st: 'idle', stagger: 0, warded: false, n: 0, sub: 0, yaw: -1.5 });
  G.bossRef = b; return b;
}
