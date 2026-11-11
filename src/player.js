// player.js — Vellum's hands. Every power is one button: Lance, Burst, Claws, Blink, Grip, Rewrite.
import { G, fx, sfx, damage, blast, launch, kill, isEnemy, spawn } from './sim.js';
import { W, pushOut, blockedAt, platformAt, inVoid, findStandable, rayBlocks, rayCircle } from './world.js';
import { clamp, damp, dampAng, angDiff, dist, lerp, rand } from './util.js';

export const TUNE = {
  speed: 7.6, accel: 16, beamRange: 30, beamDps: 58, beamCost: 15, burstMin: 18, burstMax: 40,
  blinkRange: 14, blinkCd: 1.7, tkRange: 17, tkHold: 12, clawRange: 3.0, tailRange: 3.9,
};

export function updatePlayer(dt, rdt) {
  const p = G.player, I = G.input, a = p.a;
  // ---- timers and regeneration
  p.iframes = Math.max(0, p.iframes - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.blindside = Math.max(0, p.blindside - dt);
  p.faceAimT = Math.max(0, p.faceAimT - dt); p.regenDelay = Math.max(0, p.regenDelay - dt); p.enDelay = Math.max(0, p.enDelay - dt);
  if (!p.powerless) {
    if (p.enDelay <= 0) p.en = Math.min(p.maxEn, p.en + 17 * dt);
    if (p.regenDelay <= 0 && !p.dead) p.hp = Math.min(p.maxHp, p.hp + 7 * dt);
    if (p.blink.n < p.blink.max) { p.blink.cd -= dt; if (p.blink.cd <= 0) { p.blink.n++; p.blink.cd = TUNE.blinkCd; if (p.blink.n === p.blink.max) sfx('ready', 0.25); } }
  }
  const active = G.mode === 'play' && !p.locked && !p.dead && p.stun <= 0 && !G.rewrite.active;
  if (p.stun > 0) p.stun -= dt;
  if (p.liftT > 0) { p.liftT -= dt; if (p.liftT <= 0) { p.lift = 0; p.vy = -4; } }

  // ---- aim
  const ax = G.aim.x - p.x, az = G.aim.z - p.z;
  if (active && ax * ax + az * az > 0.04) p.aimYaw = Math.atan2(ax, az);
  const dirX = Math.sin(p.aimYaw), dirZ = Math.cos(p.aimYaw);

  let mx = 0, mz = 0, speed = TUNE.speed;
  if (active) {
    mx = I.mx; mz = I.mz;
    if (p.powerless) { speed = 4.2; }
    else {
      if (I.pressed.claw) p.atk.buffer = 0.28;
      updateClaws(p, dt, dirX, dirZ);
      updateBeam(p, I, dt, dirX, dirZ);
      updateBurst(p, I, dt, dirX, dirZ);
      if (I.pressed.blink) doBlink(p);
      updateGrip(p, I, dt, dirX, dirZ);
      if (I.pressed.rewrite) enterRewrite();
    }
    if (p.beam.on) speed *= 0.62; if (p.burst.charging) speed *= 0.55; if (p.atk.step >= 0) speed *= 0.35;
  } else {
    stopBeam(p); if (p.burst.charging) { p.burst.charging = false; p.burst.c = 0; }
    if (p.atk.step >= 0) { p.atk.t += dt; if (p.atk.t >= p.atk.dur) p.atk.step = -1; }
    if (p.tk.ent) holdGrip(p, dt);
  }

  // ---- movement
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const k = ml > 0.05 ? TUNE.accel : 13;
  p.vx = damp(p.vx, mx * speed, k, dt); p.vz = damp(p.vz, mz * speed, k, dt);
  const bx = p.x, bz = p.z;
  p.x += p.vx * dt; p.z += p.vz * dt;
  if (p.level) {
    // on a roof: walk off the edge and you drop
    const L = p.level; if (p.x < L.x0 - 0.2 || p.x > L.x1 + 0.2 || p.z < L.z0 - 0.2 || p.z > L.z1 + 0.2) { p.level = null; }
  }
  const floor = p.level ? p.level.h : 0;
  if (p.lift > 0) { p.y = floor + p.lift; }
  else if (p.y > floor) { p.vy -= 30 * dt; p.y += p.vy * dt; if (p.y <= floor) { p.y = floor; p.vy = 0; fx('dust', { x: p.x, z: p.z, n: 10 }); sfx('thud', 0.5); G.shake = Math.max(G.shake, 0.25); } }
  else { p.y = floor; p.vy = 0; }
  pushOut(p, true);
  const moved = Math.hypot(p.x - bx, p.z - bz), sp = moved / Math.max(dt, 1e-4);
  p.moving = damp(p.moving, clamp(sp / TUNE.speed, 0, 1), 12, dt);
  p.phase += moved * 1.55;
  // body faces the aim while fighting, the direction of travel otherwise
  const fighting = p.faceAimT > 0 || p.beam.on || p.burst.charging || p.atk.step >= 0 || p.tk.ent;
  if (active || G.mode === 'play') {
    if (fighting) p.yaw = dampAng(p.yaw, p.atk.step >= 0 ? p.atk.yaw : p.aimYaw, 22, dt);
    else if (sp > 0.6 && ml > 0.05) p.yaw = dampAng(p.yaw, Math.atan2(p.vx, p.vz), 12, dt);
  }
  // ---- animation weights
  a.run = p.moving; a.beam = damp(a.beam, p.beam.on ? 1 : 0, 22, dt); a.charge = damp(a.charge, p.burst.charging ? 1 : p.burst.anim > 0 ? 0.6 : 0, 18, dt);
  p.burst.anim = Math.max(0, p.burst.anim - dt);
  a.tk = damp(a.tk, p.tk.ent ? 1 : 0, 16, dt); a.rewrite = damp(a.rewrite, G.rewrite.active || p.rewritePose ? 1 : 0, 6, rdt);
  a.hurt = damp(a.hurt, p.hurtT > 0 ? 1 : 0, 20, dt); a.kneel = damp(a.kneel, p.dead || p.kneel ? 1 : 0, 5, dt);
  a.headYaw = damp(a.headYaw, active ? angDiff(p.yaw, p.aimYaw) : (p.lookAt ? angDiff(p.yaw, Math.atan2(p.lookAt.x - p.x, p.lookAt.z - p.z)) : 0), 10, dt);
}

// ---------------- CLAWS: three strikes, the third is the tail ----------------
const SWING = [{ dur: 0.26, hit: 0.09, arc: 1.15, dmg: 22, kb: 7 }, { dur: 0.26, hit: 0.09, arc: 1.15, dmg: 22, kb: 7 }, { dur: 0.46, hit: 0.15, arc: 3.2, dmg: 40, kb: 17 }];
function updateClaws(p, dt, dirX, dirZ) {
  const A = p.atk;
  A.buffer = Math.max(0, A.buffer - dt); A.comboT = Math.max(0, A.comboT - dt);
  if (A.step >= 0) {
    A.t += dt;
    const S = SWING[A.step];
    if (!A.hit && A.t >= S.hit) { A.hit = true; strike(p, A.step, S); }
    if (A.t >= S.dur * 0.72 && A.buffer > 0 && A.step < 2) startSwing(p, A.step + 1);
    else if (A.t >= S.dur) { A.comboT = 0.4; A.last = A.step; A.step = -1; }
  } else if (A.buffer > 0) {
    startSwing(p, A.comboT > 0 && A.last < 2 ? A.last + 1 : 0);
  }
}
function startSwing(p, step) {
  const A = p.atk; A.step = step; A.t = 0; A.hit = false; A.buffer = 0; A.dur = SWING[step].dur; A.yaw = p.aimYaw; p.faceAimT = 0.9;
  stopBeam(p);
  const dx = Math.sin(p.aimYaw), dz = Math.cos(p.aimYaw);
  // lunge: close the gap to whatever is in front of him
  let lunge = step === 2 ? 5 : 9;
  for (const e of G.ents) if (isEnemy(e) && Math.abs(e.y - p.y) < 2.5) { const d = dist(p.x, p.z, e.x, e.z); if (d < 2.2 && Math.abs(angDiff(p.aimYaw, Math.atan2(e.x - p.x, e.z - p.z))) < 0.9) lunge = 2; }
  p.vx += dx * lunge; p.vz += dz * lunge;
  sfx(step === 2 ? 'tail' : 'claw');
  fx('slash', { x: p.x, y: p.y, z: p.z, yaw: p.aimYaw, step });
}
function strike(p, step, S) {
  const range = step === 2 ? TUNE.tailRange : TUNE.clawRange; let any = false, n = 0;
  for (const e of G.ents) {
    if (e.dead || e.held || e.ride || e.team === 'town') continue;
    if (Math.abs((e.y || 0) - p.y) > 2.8 && e.kind !== 'bolt') continue;
    const d = dist(p.x, p.z, e.x, e.z); if (d > range + e.r) continue;
    if (step < 2 && d > 0.9 && Math.abs(angDiff(p.atk.yaw, Math.atan2(e.x - p.x, e.z - p.z))) > S.arc) continue;
    if (e.kind === 'bolt') { if (!e.mine) { e.mine = true; const sp = 34; e.vx = Math.sin(p.aimYaw) * sp; e.vz = Math.cos(p.aimYaw) * sp; e.dmg = 34; e.life = 2; fx('spark', { x: e.x, y: e.y, z: e.z, n: 10, col: 0xffc266 }); sfx('parry'); any = true; G.onEvent('parry'); } continue; }
    if (e.hp !== undefined) {
      if (damage(e, S.dmg, { x: p.x, z: p.z, type: step === 2 ? 'tail' : 'claw', kb: S.kb, up: step === 2 ? 6.5 : 0, stun: step === 2 ? 0.7 : 0.25 }) > 0) { any = true; n++; if (isEnemy(e) || e.team === 'legion') p.en = Math.min(p.maxEn, p.en + 5); }
      else if (e.team === 'legion') any = true;
    } else if (e.obj && !e.pinned && !e.fixed) { launch(e, e.x - p.x, e.z - p.z, step === 2 ? 26 : 16, 3); e.thrown = 0.5; e.hitSet = null; any = true; }
  }
  if (any) { G.hitstop = Math.max(G.hitstop, step === 2 ? 0.085 : 0.05); G.shake = Math.max(G.shake, step === 2 ? 0.5 : 0.22); sfx(step === 2 ? 'hitBig' : 'hit'); if (n && p.blindside > 0) { p.blindside = 0; } }
}

// ---------------- LANCE: a precise beam that passes through everything in its line ----------------
function stopBeam(p) { if (p.beam.on) { p.beam.on = false; fx('beamOff'); } }
function updateBeam(p, I, dt, dirX, dirZ) {
  const B = p.beam, want = I.down.beam && !p.tk.ent && p.atk.step < 0 && !p.burst.charging;
  if (!want || p.en <= 0.5) { stopBeam(p); if (want && p.en <= 0.5 && I.pressed.beam) sfx('deny', 0.4); return; }
  if (!B.on) { B.on = true; B.tick = 0; B.hitT = 0; fx('beamOn'); p.en -= 1.5; }
  p.faceAimT = 0.6; p.en -= TUNE.beamCost * dt; p.enDelay = 0.55;
  const ox = p.x + dirX * 1.0, oz = p.z + dirZ * 1.0, y = p.y + 1.75;
  let len = rayBlocks(ox, oz, dirX, dirZ, TUNE.beamRange, y - 0.2);
  // a raised Bailiff shield stops the beam
  const hits = [];
  for (const e of G.ents) {
    if (e.dead || e.hp === undefined || e.team === 'town' || e.held || e.spawnT > 0) continue;
    if (Math.abs((e.y || 0) - p.y) > 3.2) continue;
    const t = rayCircle(ox, oz, dirX, dirZ, e.x, e.z, e.r + 0.28); if (t < 0 || t > len) continue;
    hits.push([t, e]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  for (const [t, e] of hits) {
    if (t > len) break;
    const blocks = (e.kind === 'bailiff' && e.shield > 0 && e.st !== 'recover' && Math.abs(angDiff(e.yaw, Math.atan2(p.x - e.x, p.z - e.z))) < 1.2) || (e.kind === 'boss' && e.warded);
    e.heat = Math.min(1, (e.heat || 0) + dt * 1.6); e.heatT = 0.25;
    damage(e, TUNE.beamDps * (1 + e.heat) * dt, { x: p.x, z: p.z, type: 'beam' });
    if (!e.dead && e.mass < 4 && !e.fixed) { e.vx += dirX * 9 * dt; e.vz += dirZ * 9 * dt; }
    if (blocks) { len = t; break; }
  }
  for (const e of G.ents) if (e.kind === 'bolt' && !e.mine && rayCircle(ox, oz, dirX, dirZ, e.x, e.z, 0.6) >= 0 && dist(ox, oz, e.x, e.z) < len) { e.dead = true; fx('spark', { x: e.x, y: e.y, z: e.z, n: 6, col: 0xffc266 }); }
  B.x0 = ox; B.z0 = oz; B.y = y; B.x1 = ox + dirX * len; B.z1 = oz + dirZ * len; B.len = len; B.hitsWall = len < TUNE.beamRange - 0.01;
  B.tick -= dt; if (B.tick <= 0) { B.tick = 0.035; fx('beamHit', { x: B.x1, y: y - (len < TUNE.beamRange ? 0.2 : 0), z: B.z1, wall: B.hitsWall || hits.length > 0 }); for (const [t, e] of hits) if (t <= len) fx('spark', { x: e.x, y: (e.y || 0) + 1.3, z: e.z, n: 2, col: 0xffd28a }); }
}

// ---------------- BURST: gather, then throw something heavier ----------------
function updateBurst(p, I, dt, dirX, dirZ) {
  const U = p.burst;
  if (!U.charging) {
    if (I.pressed.burst && p.atk.step < 0) { if (p.en < TUNE.burstMin) { sfx('deny', 0.5); fx('deny'); return; } U.charging = true; U.c = 0; stopBeam(p); fx('chargeOn'); }
    return;
  }
  p.faceAimT = 0.8; p.enDelay = 0.6;
  U.c = Math.min(1, U.c + dt / 0.85);
  const maxC = clamp((p.en - TUNE.burstMin) / (TUNE.burstMax - TUNE.burstMin), 0, 1); if (U.c > maxC) U.c = maxC;
  if (!I.down.burst) {
    const c = U.c; U.charging = false; U.c = 0; U.anim = 0.25;
    p.en -= lerp(TUNE.burstMin, TUNE.burstMax, c);
    const tx = G.aim.x, tz = G.aim.z; let d = dist(p.x, p.z, tx, tz); d = clamp(d, 3, 26);
    const o = spawn('orb', p.x + dirX * 1.2, p.z + dirZ * 1.2, { y: p.y + 2.2, charge: c, tx: p.x + dirX * d, tz: p.z + dirZ * d, ty: G.aim.y || 0, vx: dirX * 36, vz: dirZ * 36, life: 1.4 });
    o.dist = d - 1.2;
    fx('chargeOff'); sfx('burstFire', 0.6 + c * 0.5); G.shake = Math.max(G.shake, 0.2 + c * 0.2);
    p.vx -= dirX * (2 + c * 4); p.vz -= dirZ * (2 + c * 4);
  }
}
export function updateOrbs(dt) {
  for (const o of G.ents) {
    if (o.kind !== 'orb' || o.dead) continue;
    const step = 36 * dt, nx = o.vx / 36, nz = o.vz / 36;
    let boom = false;
    if (rayBlocks(o.x, o.z, nx, nz, step + 0.3, o.y - 0.4) < step + 0.3) boom = true;
    o.x += o.vx * dt; o.z += o.vz * dt; o.dist -= step; o.y = damp(o.y, (o.ty || 0) + 1.1, 4, dt);
    for (const e of G.ents) if (!e.dead && e.hp !== undefined && e.team !== 'town' && !e.held && e.spawnT <= 0 && !(e.obj && !e.breakable) && dist(o.x, o.z, e.x, e.z) < e.r + 0.55 && Math.abs((e.y || 0) + 1 - o.y) < 2.6) { boom = true; break; }
    if (o.dist <= 0) boom = true;
    if (boom) { o.dead = true; const c = o.charge; blast(o.x, o.z, 3.3 + 2.9 * c, 46 + 78 * c, { kb: 14 + 10 * c, y: o.y, type: 'burst' }); G.onEvent('burst', o); }
  }
}

// ---------------- BLINK: arrive where you are looking ----------------
function doBlink(p) {
  const B = p.blink;
  if (B.n <= 0) { sfx('deny', 0.5); fx('deny'); return; }
  let tx = G.aim.x, tz = G.aim.z, level = G.aim.level || null, behind = null;
  // looking at an enemy: arrive behind it
  let best = 1.7;
  for (const e of G.ents) if (isEnemy(e) && !e.fixed && e.kind !== 'tick' && e.kind !== 'drone') { const d = dist(tx, tz, e.x, e.z) - e.r; if (d < best && dist(p.x, p.z, e.x, e.z) < TUNE.blinkRange + 3) { best = d; behind = e; } }
  if (behind) { const back = behind.r + 1.5; tx = behind.x - Math.sin(behind.yaw) * back; tz = behind.z - Math.cos(behind.yaw) * back; level = behind.level || null; }
  let dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.3) { dx = Math.sin(p.aimYaw); dz = Math.cos(p.aimYaw); d = 1; tx = p.x + dx * 6; tz = p.z + dz * 6; d = 6; dx *= 6; dz *= 6; }
  const max = TUNE.blinkRange + (behind ? 3 : 0);
  if (d > max) { tx = p.x + (dx / d) * max; tz = p.z + (dz / d) * max; d = max; level = platformAt(tx, tz, -0.3); }
  if (level && !(tx >= level.x0 && tx <= level.x1 && tz >= level.z0 && tz <= level.z1)) level = null;
  let ok = false;
  if (level) { tx = clamp(tx, level.x0 + 0.5, level.x1 - 0.5); tz = clamp(tz, level.z0 + 0.5, level.z1 - 0.5); ok = true; }
  else {
    // walk the landing point back toward him until it is somewhere he can stand
    for (let k = 0; k <= 26; k++) { const f = 1 - k / 26, x = p.x + (tx - p.x) * f, z = p.z + (tz - p.z) * f; if (!blockedAt(x, z, p.r, 0)) { tx = x; tz = z; ok = f > 0.08; break; } }
  }
  if (!ok) { sfx('deny', 0.5); fx('deny'); return; }
  const fromX = p.x, fromZ = p.z, fromY = p.y;
  B.n--; if (B.cd <= 0 || B.n === B.max - 1) B.cd = TUNE.blinkCd;
  p.x = tx; p.z = tz; p.level = level; p.y = level ? level.h : 0; p.vy = 0; p.lift = 0;
  p.vx *= 0.3; p.vz *= 0.3; p.iframes = Math.max(p.iframes, 0.32); p.atk.step = -1; p.atk.comboT = 0.4; stopBeam(p);
  if (behind) { p.yaw = p.aimYaw = Math.atan2(behind.x - p.x, behind.z - p.z); p.blindside = 1.6; p.faceAimT = 1.2; G.slow = Math.max(G.slow, 0.22); }
  else { for (const e of G.ents) if (isEnemy(e) && dist(p.x, p.z, e.x, e.z) < 4.2 && Math.abs(angDiff(e.yaw, Math.atan2(p.x - e.x, p.z - e.z))) > 2.1) { p.blindside = 1.6; break; } }
  const h = p.tk.ent; if (h) { h.x = p.x + (h.x - fromX); h.z = p.z + (h.z - fromZ); }
  fx('blink', { x0: fromX, y0: fromY, z0: fromZ, x1: p.x, y1: p.y, z1: p.z, yaw: p.yaw }); sfx('blink');
  G.onEvent('blink', { level, behind, d });
}

// ---------------- GRIP: telekinesis on objects, enemies and people ----------------
function updateGrip(p, I, dt, dirX, dirZ) {
  const K = p.tk;
  if (K.ent) {
    if (K.ent.dead) { K.ent = null; return; }
    if (I.pressed.tk) { release(p, false); return; }
    if (I.pressed.beam) { release(p, true); return; }
    if (p.en <= 0) { release(p, false); sfx('deny', 0.5); return; }
    holdGrip(p, dt); return;
  }
  if (!I.pressed.tk) return;
  // nearest grabbable thing to where he is looking
  let best = null, bd = 3.4;
  for (const e of G.ents) {
    if (e.dead || e.held || e.ride || e.spawnT > 0) continue;
    const can = e.grab || (e.kind === 'bailiff' && e.shield > 0) || (e.kind === 'npc' && e.rescuable);
    if (!can) continue;
    if (dist(p.x, p.z, e.x, e.z) > TUNE.tkRange) continue;
    let d = dist(G.aim.x, G.aim.z, e.x, e.z) - e.r; if (e.kind === 'npc' || e.kind === 'crest' || e.questItem) d -= 1.2;
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) { sfx('deny', 0.4); fx('deny'); return; }
  if (best.kind === 'bailiff') {      // tear the shield out of his hands
    best.shield = 0; best.stun = 1.8; fx('shatter', { x: best.x, y: 1.4, z: best.z }); sfx('rip');
    const s = spawn('shield', best.x + Math.sin(best.yaw), best.z + Math.cos(best.yaw), { y: 1.2 }); G.onEvent('shieldBroken', best);
    best = s;
  }
  if (best.kind === 'stake') { best.fixed = false; best.inert = true; best.uprooted = true; fx('debris', { x: best.x, y: 0.3, z: best.z, n: 14 }); sfx('rip'); G.shake = Math.max(G.shake, 0.4); G.onEvent('uproot', best); }
  if (best.pinned) { best.pinned = false; fx('debris', { x: best.x, y: 0.3, z: best.z, n: 10 }); G.shake = Math.max(G.shake, 0.3); }
  K.ent = best; best.held = true; best.thrown = 0; best.air = false; best.vx = best.vz = best.vy = 0; best.level = null; best.goal = null;
  if (best.team === 'legion') { best.st = 'held'; best.act = 'held'; }
  if (best.kind === 'npc') best.act = 'carried';
  p.faceAimT = 1; sfx('grip'); fx('grip', { x: best.x, y: best.y + 1, z: best.z });
  G.onEvent('grip', best);
}
function holdGrip(p, dt) {
  const e = p.tk.ent; if (!e) return;
  p.en -= (2.4 + Math.min(e.mass, 8) * 0.3) * dt * (e.kind === 'npc' || e.questItem ? 0.35 : 1); p.enDelay = 0.3;
  let tx = G.aim.x, tz = G.aim.z; const d = dist(p.x, p.z, tx, tz);
  const min = e.r + p.r + 0.6;
  if (d > TUNE.tkHold) { tx = p.x + ((tx - p.x) / d) * TUNE.tkHold; tz = p.z + ((tz - p.z) / d) * TUNE.tkHold; }
  else if (d < min) { tx = p.x + Math.sin(p.aimYaw) * min; tz = p.z + Math.cos(p.aimYaw) * min; }
  const k = 13 / (1 + e.mass * 0.16);
  const ox = e.x, oz = e.z;
  e.x = damp(e.x, tx, k, dt); e.z = damp(e.z, tz, k, dt);
  const base = G.aim.level && dist(G.aim.x, G.aim.z, e.x, e.z) < 3 ? G.aim.level.h : 0;
  e.y = damp(e.y, base + (e.kind === 'npc' ? 1.6 : e.mass > 10 ? 1.2 : 2.1) + Math.sin(G.time * 3 + e.id) * 0.12, 8, dt);
  e.hvx = (e.x - ox) / Math.max(dt, 1e-4); e.hvz = (e.z - oz) / Math.max(dt, 1e-4);
  e.spin = (e.spin || 0) + dt * (e.kind === 'npc' ? 0 : 1.2);
  // a carried girder or pod knocks soldiers aside
  if (e.mass >= 8 && Math.hypot(e.hvx, e.hvz) > 6) for (const o of G.ents) if (isEnemy(o) && dist(o.x, o.z, e.x, e.z) < e.r + o.r && (!o.swatT || G.time - o.swatT > 0.6)) { o.swatT = G.time; damage(o, 30, { x: e.x - e.hvx, z: e.z - e.hvz, type: 'throw', kb: 14, up: 4, stun: 0.6 }); sfx('slam', 0.6); }
}
export function release(p, hurl) {
  const e = p.tk.ent; if (!e) return;
  p.tk.ent = null; e.held = false;
  const gentle = !hurl || e.kind === 'npc' || DEFSnoThrow(e);
  if (gentle) {
    // set it down where it floats, on something that can hold it
    const lvl = platformAt(e.x, e.z, -0.2);
    if (lvl && e.y > lvl.h - 0.4) { e.level = lvl; }
    else { e.level = null; if (e.kind === 'npc' || e.mass > 6 || blockedAt(e.x, e.z, e.r * 0.8, 0)) { const s = findStandable(e.x, e.z, e.r); e.x = s.x; e.z = s.z; } }
    e.air = true; e.vy = 0; e.vx = (e.hvx || 0) * 0.15; e.vz = (e.hvz || 0) * 0.15;
    if (e.team === 'legion') { e.st = 'idle'; e.act = 'idle'; e.stun = 0.5; }
    if (e.kind === 'npc') e.act = 'idle';
    sfx('drop', 0.6); G.onEvent('setDown', e);
  } else {
    let dx = G.aim.x - p.x, dz = G.aim.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    // if he is pointing past the object, throw along object→cursor instead, so close targets get hit
    const ex = G.aim.x - e.x, ez = G.aim.z - e.z, ed = Math.hypot(ex, ez);
    if (ed > 2.5) { dx = ex / ed; dz = ez / ed; }
    const sp = clamp(46 - e.mass * 2.2, 22, 44);
    e.vx = dx * sp; e.vz = dz * sp; e.vy = 2.5; e.thrown = 1.3; e.hitSet = null; e.air = false;
    if (e.team === 'legion') { e.act = 'held'; e.st = 'thrown'; }
    sfx('throw'); fx('throw', { x: e.x, y: e.y, z: e.z }); G.shake = Math.max(G.shake, 0.25); p.faceAimT = 0.8;
    G.onEvent('throw', e);
  }
}
const DEFSnoThrow = (e) => e.kind === 'pod';

// ---------------- REWRITE: stop the world, choose a truth, change it ----------------
export function enterRewrite() {
  const p = G.player, R = G.rewrite;
  if (R.active) return;
  if (p.auth < 100) { sfx('deny', 0.5); fx('deny', { rewrite: true }); G.onEvent('rewriteDenied'); return; }
  stopBeam(p); if (p.tk.ent) release(p, false);
  R.active = true; R.t = 0; R.hover = null; sfx('rewriteIn'); fx('rewriteIn', { x: p.x, z: p.z });
  G.onEvent('rewriteOpen');
}
export function exitRewrite(spent) {
  const R = G.rewrite; if (!R.active) return;
  R.active = false; R.hover = null; R.list = [];
  if (!spent) sfx('rewriteOut', 0.6);
}
// what can be rewritten right now. The story adds its own truths through G.flags.truths.
export function rewriteCandidates() {
  const p = G.player, out = [];
  for (const t of G.flags.truths || []) if (dist(p.x, p.z, t.x, t.z) < (t.range || 30)) out.push(t);
  for (const e of G.ents) {
    if (!isEnemy(e) || e.spawnT > 0 || dist(p.x, p.z, e.x, e.z) > 24) continue;
    if (e.kind === 'boss') out.push({ x: e.x, y: 3.6, z: e.z, from: 'THE RECKONER', to: null, locked: 'The Mandate forbids it.', ent: e });
    else if (e.kind === 'nest') continue;
    else out.push({ x: e.x, y: (e.y || 0) + (e.kind === 'bailiff' ? 3 : 2.3), z: e.z, from: 'HOSTILE', to: 'UNWRITTEN', ent: e, apply: () => unwrite(e) });
  }
  return out;
}
function unwrite(target) {
  // everything hostile near the chosen one is unmade; the heavy ones are stripped and stunned
  const x = target.x, z = target.z;
  fx('unwrite', { x, z, r: 7 }); sfx('unwrite');
  for (const e of G.ents) {
    if (!isEnemy(e) || dist(x, z, e.x, e.z) > 7 + e.r) continue;
    if (e.kind === 'boss') { if (!e.warded) { damage(e, 60, { type: 'unwrite', pierce: true }); e.stagger = Math.max(e.stagger || 0, 2.4); } continue; }
    if (e.kind === 'bailiff') { e.shield = 0; e.stun = 4; damage(e, 90, { type: 'unwrite', pierce: true }); continue; }
    if (e.kind === 'stake') { e.inert = true; }
    e.unwritten = true; kill(e, { type: 'unwrite' });
  }
}
export function updateRewrite(rdt) {
  const R = G.rewrite, I = G.input, p = G.player;
  if (!R.active) return;
  R.t += rdt;
  R.list = rewriteCandidates();
  let best = null, bd = 4.2;
  for (const c of R.list) { const d = dist(G.aim.x, G.aim.z, c.x, c.z); if (d < bd) { bd = d; best = c; } }
  if (best !== R.hover && best) sfx('tick', 0.5);
  R.hover = best;
  if (R.t > 0.25 && (I.pressed.rewrite || I.pressed.pause || I.pressed.claw)) { I.pressed.rewrite = false; I.pressed.pause = false; I.pressed.claw = false; exitRewrite(false); return; }
  if (R.t > 0.2 && (I.pressed.beam || I.pressed.confirm) && best) {
    if (best.locked) { const msg = typeof best.locked === 'function' ? best.locked() : best.locked; if (msg) { sfx('deny'); G.onEvent('rewriteLocked', { truth: best, msg }); return; } }
    p.auth = 0; exitRewrite(true); I.pressed.beam = false; I.down.beam = false;
    fx('rewriteApply', { x: best.x, y: best.y || 1, z: best.z }); sfx('rewriteApply'); G.shake = Math.max(G.shake, 0.6);
    if (best.apply) best.apply();
    G.onEvent('rewrote', best);
  }
}
