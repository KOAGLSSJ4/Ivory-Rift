// world.js — the town of Lastwell: one map, read by both the simulation and the renderer.
// Axes: x east, z south, y up. One unit is one metre (and one 16px tile in the pixel style).
export const W = { w: 130, h: 96 };
export const solids = [];    // {x0,z0,x1,z1,h}  block walking; block beams when taller than chest height
export const voids = [];     // {x0,z0,x1,z1}    the dry canal: cannot be walked or stood in, can be blinked or thrown across
export const circles = [];   // {x,z,r,h}        round static colliders
export const platforms = []; // {x0,z0,x1,z1,h}  rooftops and decks: reachable by Blink only
export const structs = [];   // visual descriptors, built into meshes by models.js

const solid = (x0, z0, x1, z1, h) => { solids.push({ x0, z0, x1, z1, h }); };
const plat = (x0, z0, x1, z1, h) => { platforms.push({ x0, z0, x1, z1, h, id: platforms.length }); };
const circ = (x, z, r, h = 3) => { circles.push({ x, z, r, h }); };
const S = (kind, o) => { structs.push({ kind, ...o }); };

export const BRIDGES = [44, 74];          // z centre of each canal crossing
export const CANAL = { x0: 64, x1: 69 };
export const P = {                          // named places used by the story
  nest: { x: 16, z: 46 }, hangarDoor: { x: 40, z: 42 }, shelter: { x: 24, z: 42 },
  yard: { x: 50, z: 36 }, truck: { x: 53.4, z: 29.5 }, engine: { x: 47.5, z: 17 },
  tickNest: { x: 57, z: 46 }, shedRoof: { x: 51, z: 16 }, well: { x: 88, z: 46 },
  plaza: { x: 88, z: 46 }, towerDeck: { x: 99, z: 37.4 }, pod: { x: 48, z: 80 },
  crash: { x: 20, z: 76 }, ctower: { x: 119, z: 15 }, workshop: { x: 51, z: 16 },
};

(function build() {
  // ---- Hangar Nine (Vellum's home). Door on the east wall.
  const H = { x0: 8, z0: 28, x1: 38, z1: 56, h: 8, doorZ0: 36, doorZ1: 48 };
  solid(H.x0, H.z0, H.x1, H.z0 + 1, H.h); solid(H.x0, H.z1 - 1, H.x1, H.z1, H.h);
  solid(H.x0, H.z0, H.x0 + 1, H.z1, H.h);
  solid(H.x1 - 1, H.z0, H.x1, H.doorZ0, H.h); solid(H.x1 - 1, H.doorZ1, H.x1, H.z1, H.h);
  S('hangar', H);
  solid(12, 29, 22, 30.3, 2); S('shelf', { x0: 12, z0: 29, x1: 22, z1: 30.3 });
  solid(26, 31.5, 29.2, 33.6, 1.3); S('tug', { x: 27.6, z: 32.5 });
  circ(33.5, 30.6, 0.45, 1.6); circ(34.5, 30.7, 0.45, 1.6); S('cylinders', { x: 34, z: 30.6 });
  solid(10.2, 32, 12.4, 37, 2.6); S('stairs', { x0: 10.2, z0: 32, x1: 12.4, z1: 37 });
  S('nest', { x: P.nest.x, z: P.nest.z });

  // ---- Mara's workshop: an open shed. You can walk under it and Blink onto it.
  const shed = { x0: 44, z0: 10, x1: 58, z1: 22, h: 4.2 };
  for (const [px, pz] of [[44.4, 10.4], [57.6, 10.4], [44.4, 21.6], [57.6, 21.6], [51, 10.4], [51, 21.6]]) circ(px, pz, 0.28, 4.2);
  plat(shed.x0, shed.z0, shed.x1, shed.z1, shed.h); S('shed', shed);
  solid(45, 10.6, 50, 12, 1.1); S('bench', { x0: 45, z0: 10.6, x1: 50, z1: 12 });
  solid(50, 28, 52.2, 31, 2.3); solid(52.2, 28, 56.4, 31, 1.15); S('truck', { x0: 50, z0: 28, x1: 56.4, z1: 31 });

  // ---- The dry canal and its two bridges
  voids.push({ x0: 64, z0: 6, x1: 69, z1: 41 }, { x0: 64, z0: 47, x1: 69, z1: 72 }, { x0: 64, z0: 76, x1: 69, z1: 90 });
  S('canal', { x0: 64, x1: 69, z0: 6, z1: 90, bridges: [[41, 47], [72, 76]] });

  // ---- The plaza and the well
  circ(P.well.x, P.well.z, 1.8, 1.2); S('well', { x: P.well.x, z: P.well.z });
  for (const [px, pz] of [[97, 32], [101, 32], [97, 36], [101, 36]]) circ(px, pz, 0.3, 9);
  plat(96.2, 36.2, 101.8, 38.6, 6); S('watertower', { x: 99, z: 34 });
  for (const s of [{ x0: 77, z0: 33, x1: 81, z1: 35.6, c: 0 }, { x0: 77, z0: 56.4, x1: 81, z1: 59, c: 1 }, { x0: 95, z0: 57, x1: 99, z1: 59.6, c: 2 }]) {
    solid(s.x0, s.z0, s.x1, s.z1, 2.6); S('stall', s);
  }
  for (const [px, pz] of [[76, 40], [100, 44], [80, 54], [94, 54]]) { circ(px, pz, 0.16, 5); S('lamp', { x: px, z: pz }); }
  S('lights', { pts: [[76, 40], [100, 44], [94, 54], [80, 54], [76, 40]] });
  solid(92.5, 48.5, 96, 51.5, 2.8); plat(92.5, 48.5, 96, 51.5, 2.8); S('house', { x0: 92.5, z0: 48.5, x1: 96, z1: 51.5, h: 2.8, c: 5, pump: true });

  // ---- Houses: every flat roof is a place you can Blink to
  const houses = [
    [106, 28, 114, 34, 3.2, 0], [106, 38, 113, 44, 3.0, 1], [108, 48, 116, 55, 3.4, 2], [100, 64, 108, 70, 3.0, 3],
    [84, 66, 92, 72, 3.2, 4], [74, 66, 81, 71, 3.0, 1], [76, 15, 84, 21, 3.2, 2], [88, 13, 95, 19, 3.0, 0],
  ];
  for (const [x0, z0, x1, z1, h, c] of houses) { solid(x0, z0, x1, z1, h); plat(x0, z0, x1, z1, h); S('house', { x0, z0, x1, z1, h, c }); }
  // the old control tower: tall, with something left on top
  solid(116, 12, 122, 18, 11); plat(115.4, 11.4, 122.6, 18.6, 11); S('ctower', { x0: 116, z0: 12, x1: 122, z1: 18, h: 11 });

  // ---- Scrapyard: containers (roofs are platforms), wreck, heaps
  const cont = [[40, 64, 46, 66.6, 2.6, 0], [40, 67, 46, 69.6, 2.6, 1], [48, 64, 54, 66.6, 5.2, 2], [56, 70, 58.6, 76, 2.6, 3], [38, 72, 40.6, 78, 2.6, 1]];
  for (const [x0, z0, x1, z1, h, c] of cont) { solid(x0, z0, x1, z1, h); plat(x0, z0, x1, z1, h); S('container', { x0, z0, x1, z1, h, c }); }
  solid(40, 85, 54, 88, 3); S('fuselage', { x0: 40, z0: 85, x1: 54, z1: 88 });
  for (const [px, pz, r] of [[59, 65.5, 2], [44, 74.5, 1.7], [60, 84, 2.1]]) { circ(px, pz, r, 1.6); S('heap', { x: px, z: pz, r }); }

  // ---- The crash site: where he fell, eleven years ago
  S('crater', { x: P.crash.x, z: P.crash.z, r: 7 });
  solid(17.4, 73.2, 21, 76.8, 2.2); S('wreckpod', { x0: 17.4, z0: 73.2, x1: 21, z1: 76.8 });
  circ(27, 70, 0.4, 4); S('tree', { x: 27, z: 70 });

  // ---- Wind spinners out on the flats, a fence line, the road
  for (const [px, pz] of [[20, 12], [31, 7], [61, 7], [112, 80], [124, 62]]) { circ(px, pz, 0.3, 8); S('spinner', { x: px, z: pz }); }
  S('apron', { x0: 38, z0: 24, x1: 63.6, z1: 60 });
  S('road', { pts: [[38, 42], [64, 44], [69, 44], [76, 45]] });
  S('plaza', { x: P.plaza.x, z: P.plaza.z, r: 15.5 });
})();

// ---------- queries ----------
export function platformAt(x, z, m = 0) {
  let best = null;
  for (const p of platforms) if (x >= p.x0 - m && x <= p.x1 + m && z >= p.z0 - m && z <= p.z1 + m && (!best || p.h > best.h)) best = p;
  return best;
}
export function inVoid(x, z, m = 0) {
  for (const v of voids) if (x > v.x0 - m && x < v.x1 + m && z > v.z0 - m && z < v.z1 + m) return true;
  return false;
}
// is a circle of radius r at height y overlapping anything it cannot stand in?
export function blockedAt(x, z, r, y = 0, withVoid = true) {
  if (x < 1 + r || z < 1 + r || x > W.w - 1 - r || z > W.h - 1 - r) return true;
  for (const b of solids) {
    if (b.h <= y + 0.3) continue;
    const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true;
  }
  for (const c of circles) { if (c.h <= y + 0.3) continue; if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true; }
  if (withVoid && y < 0.5 && inVoid(x, z, r * 0.6)) return true;
  return false;
}
// push a circle entity out of static geometry. Returns true if it was touching anything.
export function pushOut(e, withVoid = true) {
  let hit = false; const r = e.r, y = e.y || 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of solids) { if (b.h <= y + 0.3) continue; if (aabbPush(e, b, r)) hit = true; }
    if (withVoid && y < 0.5) for (const v of voids) if (aabbPush(e, v, r * 0.6)) hit = true;
    for (const c of circles) {
      if (c.h <= y + 0.3) continue;
      const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
      if (d < m) { const k = d > 1e-4 ? (m - d) / d : 0; if (k) { e.x += dx * k; e.z += dz * k; } else e.x += m; hit = true; }
    }
  }
  if (e.x < 1 + r) { e.x = 1 + r; hit = true; } if (e.x > W.w - 1 - r) { e.x = W.w - 1 - r; hit = true; }
  if (e.z < 1 + r) { e.z = 1 + r; hit = true; } if (e.z > W.h - 1 - r) { e.z = W.h - 1 - r; hit = true; }
  return hit;
}
function aabbPush(e, b, r) {
  const cx = Math.max(b.x0, Math.min(e.x, b.x1)), cz = Math.max(b.z0, Math.min(e.z, b.z1));
  const dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; e.x += dx * k; e.z += dz * k; return true; }
  // centre is inside the box: leave by the nearest face
  const l = e.x - b.x0, rr = b.x1 - e.x, t = e.z - b.z0, bt = b.z1 - e.z, m = Math.min(l, rr, t, bt);
  if (m === l) e.x = b.x0 - r; else if (m === rr) e.x = b.x1 + r; else if (m === t) e.z = b.z0 - r; else e.z = b.z1 + r;
  return true;
}
// distance along a ray to the first tall static thing (or maxD)
export function rayBlocks(x, z, dx, dz, maxD, y = 1.4) {
  let best = maxD;
  for (const b of solids) {
    if (b.h <= y) continue;
    let t0 = 0, t1 = best, ok = true;
    for (const [o, d, lo, hi] of [[x, dx, b.x0, b.x1], [z, dz, b.z0, b.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let a = (lo - o) / d, c = (hi - o) / d; if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best) best = t0;
  }
  for (const c of circles) {
    if (c.h <= y) continue;
    const t = rayCircle(x, z, dx, dz, c.x, c.z, c.r);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}
export function rayCircle(x, z, dx, dz, cx, cz, r) {
  const ox = cx - x, oz = cz - z, proj = ox * dx + oz * dz;
  const perp2 = ox * ox + oz * oz - proj * proj;
  if (perp2 > r * r) return -1;
  const th = Math.sqrt(r * r - perp2), t = proj - th;
  return t >= 0 ? t : (proj + th >= 0 ? 0 : -1);
}
// nearest standable ground point to (x,z), searching outward
export function findStandable(x, z, r) {
  if (!blockedAt(x, z, r)) return { x, z };
  for (let d = 0.6; d < 14; d += 0.6) for (let a = 0; a < 12; a++) {
    const px = x + Math.cos(a * 0.5236) * d, pz = z + Math.sin(a * 0.5236) * d;
    if (!blockedAt(px, pz, r)) return { x: px, z: pz };
  }
  return { x, z };
}
// walking routes that respect the canal: returns the point to head for next
export function routeToward(x, z, tx, tz) {
  const west = x < CANAL.x0, east = x > CANAL.x1, tWest = tx < CANAL.x0 + 0.1, tEast = tx > CANAL.x1 - 0.1;
  if ((west && tEast) || (east && tWest) || (!west && !east)) {
    let bz = BRIDGES[0], best = 1e9;
    for (const b of BRIDGES) { const c = Math.abs(z - b) + Math.abs(tz - b); if (c < best) { best = c; bz = b; } }
    if (Math.abs(z - bz) > 1.2 && (west || east)) return { x: west ? CANAL.x0 - 1.4 : CANAL.x1 + 1.4, z: bz };
    return { x: tWest ? CANAL.x0 - 1.6 : CANAL.x1 + 1.6, z: bz };
  }
  return { x: tx, z: tz };
}
