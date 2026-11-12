// models.js — the town, its people, the Throne's soldiers and every prop, all from primitives.
import { M, TX } from './mats.js';
import { rng, lerp, clamp } from './util.js';
import { taperTube } from './dragon.js';
import { modelView, poseModel, structModel } from './actors.js';
const T = window.THREE;

let G = null;
function geos() {
  if (G) return G;
  G = {
    sph: new T.SphereGeometry(1, 16, 12), cyl: new T.CylinderGeometry(1, 1, 1, 16), cyl6: new T.CylinderGeometry(1, 1, 1, 6),
    box: new T.BoxGeometry(1, 1, 1), cone: new T.ConeGeometry(1, 1, 10), tor: new T.TorusGeometry(1, 0.06, 6, 24),
    oct: new T.OctahedronGeometry(1, 0), ico: new T.IcosahedronGeometry(1, 0), plane: new T.PlaneGeometry(1, 1),
  };
  G.plane.rotateX(-Math.PI / 2);
  return G;
}
const mk = (geo, m, parent, p, s, r, shadow = true) => {
  const o = new T.Mesh(geo, m);
  if (p) o.position.set(p[0], p[1], p[2]); if (s) o.scale.set(s[0], s[1], s[2]); if (r) o.rotation.set(r[0], r[1], r[2]);
  o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
};
const grp = (parent, p, r) => { const g = new T.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (r) g.rotation.set(r[0], r[1], r[2]); if (parent) parent.add(g); return g; };
// axis-aligned box from world extents
const bx = (parent, m, x0, y0, z0, x1, y1, z1, shadow = true) => mk(geos().box, m, parent, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], null, shadow);
const corr = (hex, rx = 1, ry = 1) => {
  const m = M.corr(hex); m.map = TX.corrCol.clone(); m.map.repeat.set(rx, ry); m.bumpMap = TX.corr.clone(); m.bumpMap.repeat.set(rx * 6, ry); return m;
};
const HOUSE_COL = [0xb5553a, 0x3f7f86, 0xc79a3a, 0x6d7f4f, 0x8a5a7a, 0x9c9488];
const CONT_COL = [0x9c3b2e, 0x2f5f7a, 0xb8862f, 0x4f6b46];

// ======================= STRUCTURES =======================
export function buildStruct(s) {
  geos();
  const g = new T.Group();
  if (structModel(g, s)) { EXTRA[s.kind] && EXTRA[s.kind](g, s); return g; }
  const B = BUILD[s.kind];
  if (B) B(g, s);
  return g;
}

// what the procedural version still adds on top of a model
const EXTRA = {
  well(g, s) { const water = mk(new T.CircleGeometry(1.35, 24), M.water, g, [s.x, 0.2, s.z], null, [-Math.PI / 2, 0, 0], false); water.visible = false; g.userData.water = water; g.userData.name = 'well'; },
  hangar(g, s) { const fl = M.concrete.clone(); fl.color.setHex(0xa39c90); mk(G.plane, fl, g, [(s.x0 + s.x1) / 2, 0.03, (s.z0 + s.z1) / 2], [s.x1 - s.x0 - 2, 1, s.z1 - s.z0 - 2], null, false); },
  canal(g, s) { },
};
const BUILD = {
  hangar(g, s) {
    const wall = corr(0xaab4ba, 5, 1), roofM = corr(0x8f9a9e, 6, 3);
    const fade = [];
    bx(g, wall, s.x0, 0, s.z0, s.x1, s.h, s.z0 + 1); bx(g, wall, s.x0, 0, s.z0, s.x0 + 1, s.h, s.z1);
    const south = bx(g, corr(0xaab4ba, 5, 1), s.x0, 0, s.z1 - 1, s.x1, s.h, s.z1); fade.push(south);
    bx(g, wall, s.x1 - 1, 0, s.z0, s.x1, s.h, s.doorZ0); bx(g, wall, s.x1 - 1, 0, s.doorZ1, s.x1, s.h, s.z1);
    bx(g, M.metal(0x5d6468, 0.6), s.x1 - 1.1, 6.4, s.doorZ0 - 0.4, s.x1 + 0.1, s.h, s.doorZ1 + 0.4);        // lintel
    for (const z of [s.doorZ0, s.doorZ1]) bx(g, M.metal(0x4e5458, 0.6), s.x1 - 1.15, 0, z - 0.25, s.x1 + 0.15, 6.5, z + 0.25);
    bx(g, M.paint(0xc9a227), s.x1 + 0.02, 0, s.doorZ0 - 0.3, s.x1 + 0.2, 1.0, s.doorZ0 + 0.3); bx(g, M.paint(0xc9a227), s.x1 + 0.02, 0, s.doorZ1 - 0.3, s.x1 + 0.2, 1.0, s.doorZ1 + 0.3);
    // floor
    const fl = M.concrete.clone(); fl.color.setHex(0xa39c90); fl.map = TX.concrete.clone(); fl.map.repeat.set(3, 3);
    mk(G.plane, fl, g, [(s.x0 + s.x1) / 2, 0.03, (s.z0 + s.z1) / 2], [s.x1 - s.x0 - 2, 1, s.z1 - s.z0 - 2], null, false);
    // pitched roof (fades when he is inside)
    const cz = (s.z0 + s.z1) / 2, half = (s.z1 - s.z0) / 2 + 0.6, rise = 3.2, len = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const sg of [1, -1]) {
      const r = mk(G.box, sg > 0 ? roofM : corr(0xa3a8a6, 6, 3), g, [(s.x0 + s.x1) / 2, s.h + rise / 2, cz + (sg * half) / 2], [s.x1 - s.x0 + 1.2, 0.25, len], [sg * ang, 0, 0]);
      fade.push(r);
    }
    for (const x of [s.x0 + 0.5, s.x1 - 0.5]) {
      const sh = new T.Shape(); sh.moveTo(-half + 0.6, 0); sh.lineTo(half - 0.6, 0); sh.lineTo(0, rise - 0.1); sh.closePath();
      const gg = new T.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false }); gg.rotateY(Math.PI / 2);
      const gm = mk(gg, corr(0xb0b5b4, 3, 1), g, [x - 0.3, s.h, cz]); fade.push(gm);
    }
    // roof trusses, visible once the roof fades
    for (let x = s.x0 + 5; x < s.x1; x += 5) bx(g, M.metal(0x4a4f52, 0.7), x - 0.12, s.h - 0.5, s.z0 + 1, x + 0.12, s.h - 0.2, s.z1 - 1, false);
    // a faded numeral on the door post, and light falling through the doorway
    const num = document.createElement('canvas'); num.width = 128; num.height = 128; const c = num.getContext('2d');
    c.fillStyle = 'rgba(240,235,220,.85)'; c.font = '700 110px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('9', 64, 70);
    const nt = new T.CanvasTexture(num); nt.colorSpace = T.SRGBColorSpace;
    const nm = mk(new T.PlaneGeometry(3, 3), new T.MeshStandardMaterial({ map: nt, transparent: true, roughness: 0.9, opacity: 0.7 }), g, [s.x1 + 0.03, 4.4, s.doorZ1 + 3.6], null, [0, Math.PI / 2, 0], false);
    nm.receiveShadow = false;
    const shafts = [];
    for (let i = 0; i < 5; i++) {
      const m = new T.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.05, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
      const p = mk(new T.PlaneGeometry(15, 7.4), m, g, [s.x1 - 8.2, 3.2, s.doorZ0 + 1.4 + i * 2.3], null, [0, 0.0, -0.42], false);
      p.receiveShadow = false; shafts.push(m);
    }
    g.userData.shafts = shafts;
    g.userData.occ = { type: 'inside', x0: s.x0, z0: s.z0 - 7, x1: s.x1, z1: s.z1, parts: fade, min: 0.0 };
  },
  shelf(g, s) {
    bx(g, M.metal(0x5a5f60, 0.7), s.x0, 0, s.z0, s.x1, 2, s.z1);
    const r = rng(4), cols = [0xd9534f, 0x5bc0de, 0xf0ad4e, 0x5cb85c, 0xefe8da, 0x9a6bff];
    for (let i = 0; i < 12; i++) mk(G.box, M.flat(cols[(r() * cols.length) | 0]), g, [s.x0 + 0.5 + r() * (s.x1 - s.x0 - 1), 2.14, s.z0 + 0.6], [0.3 + r() * 0.3, 0.28, 0.3]);
    // Pip's drawings, pinned along the wall
    for (let i = 0; i < 5; i++) mk(new T.PlaneGeometry(0.7, 0.9), M.flat([0xf4efe0, 0xffe9b0, 0xdff0ff][i % 3]), g, [s.x0 + 1 + i * 1.9, 3.3 + (i % 2) * 0.3, s.z0 + 0.02], null, [0, 0, (r() - 0.5) * 0.3], false);
  },
  tug(g, s) {
    const b = grp(g, [s.x, 0, s.z]);
    bx(b, M.paint(0x5f7f95), -1.6, 0.45, -1.05, 1.6, 0.75, 1.05); bx(b, M.paint(0x4d6a7e), -1.6, 0.75, -1.05, -0.5, 1.3, 1.05);
    for (const [x, z] of [[-1.1, -1], [1.1, -1], [-1.1, 1], [1.1, 1]]) mk(G.cyl, M.flat(0x1c1c1c), b, [x, 0.3, z], [0.3, 0.22, 0.3], [Math.PI / 2, 0, 0]);
    bx(b, M.metal(0x333333), 1.6, 0.5, -0.05, 2.5, 0.6, 0.05);
  },
  cylinders(g, s) {
    for (const [dx, c] of [[-0.5, 0xc8432a], [0.5, 0xd9602c]]) {
      mk(G.cyl, M.paint(c, 0.5), g, [s.x + dx, 0.75, s.z], [0.26, 1.5, 0.26]); mk(G.sph, M.paint(c, 0.5), g, [s.x + dx, 1.5, s.z], [0.26, 0.2, 0.26]);
      mk(G.cyl, M.metal(0x777777), g, [s.x + dx, 1.72, s.z], [0.06, 0.2, 0.06]);
    }
  },
  stairs(g, s) {
    const y = M.paint(0xd6a516, 0.6);
    for (let i = 0; i < 8; i++) bx(g, y, s.x0, i * 0.32, s.z0 + i * 0.6, s.x1, i * 0.32 + 0.1, s.z0 + i * 0.6 + 0.62);
    bx(g, y, s.x0, 2.5, s.z1 - 0.3, s.x1, 2.62, s.z1);
    for (const x of [s.x0, s.x1 - 0.1]) { bx(g, y, x, 0, s.z1 - 0.1, x + 0.1, 3.6, s.z1); bx(g, y, x, 0, s.z0, x + 0.1, 1.1, s.z0 + 0.1); }
  },
  nest(g, s) {
    const r = rng(11), cols = [0x8a4f3a, 0x6b6f52, 0xb89a6a, 0x4f5f6f, 0x9a7b5a];
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = r() * 2.6; mk(G.sph, M.flat(cols[i % 5], 0.95), g, [s.x + Math.cos(a) * d, 0.16 + r() * 0.2, s.z + Math.sin(a) * d], [1 + r() * 0.8, 0.22 + r() * 0.14, 0.9 + r() * 0.7], [0, r() * 3, 0]); }
    for (let i = 0; i < 10; i++) { const a = i * 0.628; mk(G.sph, M.glow(0xffc070, 2.2), g, [s.x + Math.cos(a) * 3.3, 0.5 + Math.sin(i * 1.7) * 0.2, s.z + Math.sin(a) * 3.3], [0.07, 0.07, 0.07], null, false); }
    const l = new T.PointLight(0xffb060, 14, 11, 2); l.position.set(s.x, 1.6, s.z); g.add(l);
  },
  shed(g, s) {
    const post = M.metal(0x5b5f5c, 0.7), fade = [];
    for (const [x, z] of [[44.4, 10.4], [57.6, 10.4], [44.4, 21.6], [57.6, 21.6], [51, 10.4], [51, 21.6]]) bx(g, post, x - 0.16, 0, z - 0.16, x + 0.16, s.h, z + 0.16);
    const r = bx(g, corr(0x9d6a4a, 3, 2), s.x0 - 0.5, s.h, s.z0 - 0.5, s.x1 + 0.5, s.h + 0.22, s.z1 + 0.5); fade.push(r);
    bx(g, M.metal(0x4d514f, 0.7), s.x0, s.h - 0.25, s.z0, s.x1, s.h, s.z0 + 0.2); bx(g, M.metal(0x4d514f, 0.7), s.x0, s.h - 0.25, s.z1 - 0.2, s.x1, s.h, s.z1);
    bx(g, M.paint(0xd6a516, 0.6), s.x1 - 0.2, 0, s.z1 + 0.4, s.x1 + 0.3, 1.4, s.z1 + 0.6);      // the ladder that isn't there any more
    g.userData.occ = { type: 'under', x0: s.x0, z0: s.z0 - 3.5, x1: s.x1, z1: s.z1, parts: fade, min: 0.12 };
  },
  bench(g, s) {
    bx(g, M.wood, s.x0, 0.95, s.z0, s.x1, 1.1, s.z1); for (const x of [s.x0 + 0.1, s.x1 - 0.3]) bx(g, M.metal(0x444444), x, 0, s.z0 + 0.1, x + 0.2, 0.95, s.z1 - 0.1);
    bx(g, M.paint(0xb33a2a), s.x0 + 0.6, 1.1, s.z0 + 0.3, s.x0 + 1.5, 1.5, s.z0 + 0.9); mk(G.cyl, M.metal(0x888888, 0.3, 0.9), g, [s.x0 + 3, 1.2, s.z0 + 0.6], [0.2, 0.2, 0.2]);
  },
  truck(g, s) {
    const body = M.paint(0x3f6f5f, 0.55);
    bx(g, body, s.x0, 0.55, s.z0 + 0.1, s.x0 + 2.2, 2.3, s.z1 - 0.1); bx(g, M.metal(0x1d2a30, 0.15, 0.3), s.x0 - 0.02, 1.4, s.z0 + 0.35, s.x0 + 1.2, 2.1, s.z1 - 0.35);
    bx(g, M.wood, s.x0 + 2.2, 0.95, s.z0, s.x1, 1.15, s.z1); bx(g, body, s.x0 + 2.2, 0.6, s.z0 + 0.3, s.x1, 0.95, s.z1 - 0.3);
    for (const z of [s.z0, s.z1 - 0.1]) bx(g, body, s.x0 + 2.2, 1.15, z, s.x1, 1.5, z + 0.1);
    for (const x of [s.x0 + 0.9, s.x1 - 1.1]) for (const z of [s.z0 + 0.15, s.z1 - 0.15]) mk(G.cyl, M.flat(0x161616), g, [x, 0.5, z], [0.5, 0.3, 0.5], [Math.PI / 2, 0, 0]);
    mk(G.sph, M.glow(0xfff0c0, 1.5), g, [s.x0 - 0.02, 1.0, s.z0 + 0.5], [0.05, 0.16, 0.16], null, false); mk(G.sph, M.glow(0xfff0c0, 1.5), g, [s.x0 - 0.02, 1.0, s.z1 - 0.5], [0.05, 0.16, 0.16], null, false);
  },
  canal(g, s) {
    const d = 4.5;
    mk(G.plane, M.canal, g, [(s.x0 + s.x1) / 2, -d, (s.z0 + s.z1) / 2], [s.x1 - s.x0, 1, s.z1 - s.z0], null, false);
    bx(g, M.canal, s.x0 - 0.3, -d, s.z0, s.x0, 0.0, s.z1, false); bx(g, M.canal, s.x1, -d, s.z0, s.x1 + 0.3, 0.0, s.z1, false);
    bx(g, M.canal, s.x0, -d, s.z0 - 0.3, s.x1, 0, s.z0, false); bx(g, M.canal, s.x0, -d, s.z1, s.x1, 0, s.z1 + 0.3, false);
    bx(g, M.concrete, s.x0 - 0.5, 0, s.z0 - 0.5, s.x0 - 0.05, 0.22, s.z1 + 0.5); bx(g, M.concrete, s.x1 + 0.05, 0, s.z0 - 0.5, s.x1 + 0.5, 0.22, s.z1 + 0.5);
    for (const [a, b] of s.bridges) {
      bx(g, M.concrete, s.x0 - 0.6, -0.5, a, s.x1 + 0.6, 0.04, b);
      for (const z of [a + 0.05, b - 0.15]) { bx(g, M.paint(0xc9a227, 0.6), s.x0 - 0.4, 0.95, z, s.x1 + 0.4, 1.05, z + 0.1); for (let x = s.x0 - 0.3; x <= s.x1 + 0.4; x += 1.4) bx(g, M.metal(0x555555), x, 0, z, x + 0.1, 1, z + 0.1); }
    }
  },
  well(g, s) {
    const stone = M.paint(0xa8987f, 0.95), b = grp(g, [s.x, 0, s.z]);
    const ring = new T.CylinderGeometry(1.8, 1.95, 1.1, 20, 1, true);
    const rm = M.paint(0xa8987f, 0.95); rm.side = T.DoubleSide; mk(ring, rm, b, [0, 0.55, 0]);
    mk(new T.RingGeometry(1.35, 1.82, 24), stone, b, [0, 1.1, 0], null, [-Math.PI / 2, 0, 0]);
    mk(new T.CircleGeometry(1.4, 20), M.flat(0x0a0908, 1), b, [0, 0.12, 0], null, [-Math.PI / 2, 0, 0], false);
    const water = mk(new T.CircleGeometry(1.4, 24), M.water, b, [0, 0.2, 0], null, [-Math.PI / 2, 0, 0], false); water.visible = false;
    for (const x of [-1.6, 1.6]) bx(b, M.wood, x - 0.12, 0, -0.12, x + 0.12, 2.9, 0.12);
    bx(b, M.wood, -1.8, 2.8, -0.14, 1.8, 3.02, 0.14); mk(G.cyl, M.wood, b, [0, 2.45, 0], [0.16, 2.6, 0.16], [0, 0, Math.PI / 2]);
    mk(G.cyl, M.metal(0x6a6a66, 0.5), b, [0, 1.6, 0], [0.02, 1.7, 0.02]); mk(G.cyl, M.metal(0x777770, 0.5), b, [0, 0.9, 0], [0.22, 0.34, 0.22]);
    g.userData.water = water; g.userData.name = 'well';
  },
  watertower(g, s) {
    const b = grp(g, [s.x, 0, s.z]); const steel = M.metal(0x6b6258, 0.7, 0.5), fade = [];
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { const l = bx(b, steel, x - 0.18, 0, z - 0.18, x + 0.18, 5.6, z + 0.18); }
    for (const y of [1.9, 3.8]) { bx(b, steel, -2, y, -2.08, 2, y + 0.12, -1.92); bx(b, steel, -2, y, 1.92, 2, y + 0.12, 2.08); bx(b, steel, -2.08, y, -2, -1.92, y + 0.12, 2); bx(b, steel, 1.92, y, -2, 2.08, y + 0.12, 2); }
    const tank = mk(G.cyl, corr(0x8f6a4a, 4, 1), b, [0, 7.5, 0], [2.6, 3.8, 2.6]); fade.push(tank);
    fade.push(mk(G.cone, corr(0x7a5a40, 2, 1), b, [0, 9.9, 0], [2.8, 1.1, 2.8]));
    fade.push(bx(b, M.wood, -2.8, 5.85, 2.2, 2.8, 6.0, 4.6));                                            // the deck Tobe works from
    for (const x of [-2.8, 2.7]) fade.push(bx(b, steel, x, 6, 2.2, x + 0.1, 7, 4.6)); fade.push(bx(b, steel, -2.8, 6.95, 4.5, 2.8, 7.05, 4.6));
    for (let i = 0; i < 12; i++) bx(b, steel, 2.3, i * 0.5, 4.6, 2.9, i * 0.5 + 0.06, 4.7, false);
    g.userData.name = 'tower'; g.userData.pivot = b;
    g.userData.occ = { type: 'behind', x0: s.x - 3, z0: s.z - 9, x1: s.x + 3, z1: s.z + 2, parts: fade, min: 0.25 };
  },
  stall(g, s) {
    const cols = [0xc65a3a, 0x3f8f86, 0xd8a93a], cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    bx(g, M.wood, s.x0, 0, s.z0 + 0.3, s.x1, 1.0, s.z1 - 0.3);
    for (const x of [s.x0 + 0.1, s.x1 - 0.2]) for (const z of [s.z0 + 0.1, s.z1 - 0.2]) bx(g, M.wood, x, 0, z, x + 0.1, 2.5, z + 0.1);
    const aw = mk(G.box, M.flat(cols[s.c], 0.9), g, [cx, 2.6, cz], [s.x1 - s.x0 + 0.6, 0.06, s.z1 - s.z0 + 0.8], [0.12, 0, 0]);
    const r = rng(s.c + 20), pc = [0xd9534f, 0xf0ad4e, 0x7cb342, 0xefe8da];
    for (let i = 0; i < 7; i++) mk(G.sph, M.flat(pc[(r() * 4) | 0]), g, [s.x0 + 0.5 + r() * (s.x1 - s.x0 - 1), 1.12, cz + (r() - 0.5) * 1.2], [0.16, 0.14, 0.16]);
    g.userData.occ = { type: 'behind', x0: s.x0, z0: s.z0 - 2.4, x1: s.x1, z1: s.z1, parts: [aw], min: 0.25 };
  },
  lamp(g, s) { bx(g, M.metal(0x4a4640, 0.7), s.x - 0.08, 0, s.z - 0.08, s.x + 0.08, 5, s.z + 0.08); mk(G.sph, M.glow(0xffd9a0, 2.5), g, [s.x, 5.1, s.z], [0.18, 0.18, 0.18], null, false); },
  lights(g, s) {
    const pts = []; for (let i = 0; i < s.pts.length - 1; i++) { const [ax, az] = s.pts[i], [bxx, bz] = s.pts[i + 1]; for (let k = 1; k < 12; k++) { const t = k / 12; pts.push([lerp(ax, bxx, t), 5 - Math.sin(t * Math.PI) * 1.1, lerp(az, bz, t)]); } }
    const im = new T.InstancedMesh(G.sph, M.glow(0xffc880, 3), pts.length), m4 = new T.Matrix4();
    pts.forEach((p, i) => { m4.makeScale(0.09, 0.09, 0.09); m4.setPosition(p[0], p[1], p[2]); im.setMatrixAt(i, m4); });
    im.castShadow = false; g.add(im);
  },
  house(g, s) {
    const col = HOUSE_COL[s.c % 6], w = s.x1 - s.x0, d = s.z1 - s.z0, fade = [];
    fade.push(bx(g, corr(col, Math.max(1, w / 5), 1), s.x0, 0, s.z0, s.x1, s.h, s.z1));
    fade.push(bx(g, M.metal(0x4b4640, 0.8, 0.3), s.x0 - 0.2, s.h, s.z0 - 0.2, s.x1 + 0.2, s.h + 0.14, s.z1 + 0.2));
    fade.push(bx(g, M.wood, s.x0 + w * 0.2, 0, s.z1, s.x0 + w * 0.2 + 1.1, 2.1, s.z1 + 0.08));                                   // door
    fade.push(bx(g, M.glow(0xffc070, 0.9), s.x0 + w * 0.6, 1.2, s.z1, s.x0 + w * 0.6 + 1.2, 2.0, s.z1 + 0.06, false));           // lit window
    const r = rng(s.x0 * 7 + s.z0);
    fade.push(mk(G.cyl, M.metal(0x777066, 0.6), g, [s.x0 + 1 + r() * (w - 2), s.h + 0.5, s.z0 + 1 + r() * (d - 2)], [0.35, 0.9, 0.35]));   // roof tank
    if (r() > 0.4) fade.push(bx(g, M.wood, s.x1 - 1.6, s.h + 0.14, s.z0 + 0.4, s.x1 - 0.5, s.h + 0.7, s.z0 + 1.4));
    if (s.pump) fade.push(mk(G.cyl, M.metal(0x5a6a70, 0.5), g, [s.x0 - 0.5, 0.7, s.z0 + 1.5], [0.3, 1.4, 0.3]));
    g.userData.occ = { type: 'behind', x0: s.x0 - 0.3, z0: s.z0 - s.h * 1.05, x1: s.x1 + 0.3, z1: s.z1 - 0.5, parts: fade, min: 0.22 };
  },
  ctower(g, s) {
    const fade = [], cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    fade.push(bx(g, M.paint(0xb8ab94, 0.9), s.x0 + 0.6, 0, s.z0 + 0.6, s.x1 - 0.6, s.h - 2.6, s.z1 - 0.6));
    fade.push(bx(g, M.metal(0x2a3a44, 0.2, 0.4), s.x0, s.h - 2.6, s.z0, s.x1, s.h - 0.3, s.z1));
    fade.push(bx(g, M.paint(0x9c8f7a, 0.9), s.x0 - 0.6, s.h - 0.3, s.z0 - 0.6, s.x1 + 0.6, s.h, s.z1 + 0.6));
    fade.push(bx(g, M.metal(0x555555), cx - 0.06, s.h, cz - 0.06, cx + 0.06, s.h + 4, cz + 0.06));
    for (let y = 2; y < s.h - 3; y += 2.2) fade.push(bx(g, M.paint(0xb5553a, 0.8), s.x0 + 0.55, y, s.z0 + 0.55, s.x1 - 0.55, y + 0.5, s.z1 - 0.55));
    g.userData.occ = { type: 'behind', x0: s.x0 - 1, z0: s.z0 - s.h, x1: s.x1 + 1, z1: s.z1 - 0.5, parts: fade, min: 0.22 };
  },
  container(g, s) {
    const col = CONT_COL[s.c % 4], long = s.x1 - s.x0 > s.z1 - s.z0, fade = [];
    const n = Math.round(s.h / 2.6);
    for (let i = 0; i < n; i++) {
      const c = i ? CONT_COL[(s.c + 1) % 4] : col;
      fade.push(bx(g, corr(c, long ? 2 : 1, 1), s.x0 + 0.04 * i, i * 2.6, s.z0 + 0.04 * i, s.x1 - 0.04 * i, i * 2.6 + 2.6, s.z1 - 0.04 * i));
    }
    g.userData.occ = { type: 'behind', x0: s.x0 - 0.2, z0: s.z0 - s.h * 1.05, x1: s.x1 + 0.2, z1: s.z1 - 0.4, parts: fade, min: 0.22 };
  },
  fuselage(g, s) {
    const al = M.metal(0xa9adaf, 0.45, 0.8), cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    mk(G.cyl, al, g, [cx, 1.1, cz], [1.9, s.x1 - s.x0, 1.9], [0, 0, Math.PI / 2]);
    mk(G.sph, al, g, [s.x0, 1.1, cz], [1.6, 1.9, 1.9]); mk(G.box, al, g, [s.x1 - 1.5, 3.6, cz], [3, 3, 0.2], [0, 0, 0.5]);
    mk(G.box, al, g, [cx - 1, 1.0, cz + 3.2], [3.4, 0.18, 5], [0.1, 0.3, 0]);
    for (let x = s.x0 + 2; x < s.x1 - 2; x += 1.6) mk(G.sph, M.flat(0x1a2227, 0.3), g, [x, 1.9, cz + 1.72], [0.26, 0.32, 0.08], null, false);
    mk(G.box, M.paint(0xb5553a, 0.8), g, [cx, 1.1, cz + 1.86], [s.x1 - s.x0 - 3, 0.25, 0.06], null, false);
  },
  heap(g, s) {
    const r = rng((s.x * 31 + s.z) | 0), cols = [0x6a4a3a, 0x7a5a44, 0x4f4a46, 0x8a5a3a, 0x5a5f60];
    for (let i = 0; i < 16; i++) {
      const a = r() * 6.28, d = r() * s.r * 0.8, h = (1 - d / s.r) * 1.5;
      mk(r() > 0.5 ? G.box : G.cyl6, M.metal(cols[(r() * 5) | 0], 0.8, 0.4), g, [s.x + Math.cos(a) * d, r() * h + 0.2, s.z + Math.sin(a) * d], [0.4 + r() * 0.9, 0.3 + r() * 0.7, 0.4 + r() * 0.9], [r() * 2, r() * 3, r() * 2]);
    }
  },
  crater(g, s) {
    const glass = new T.MeshPhysicalMaterial({ color: 0x1c1a20, roughness: 0.12, metalness: 0.2, clearcoat: 1 });
    mk(new T.RingGeometry(s.r * 0.55, s.r, 40), glass, g, [s.x, 0.04, s.z], null, [-Math.PI / 2, 0, 0], false);
    mk(new T.CircleGeometry(s.r * 0.56, 32), M.flat(0x2a2622, 1), g, [s.x, 0.035, s.z], null, [-Math.PI / 2, 0, 0], false);
    const r = rng(77);
    for (let i = 0; i < 22; i++) { const a = r() * 6.28, d = s.r * (0.5 + r() * 0.6); mk(G.oct, glass, g, [s.x + Math.cos(a) * d, 0.1, s.z + Math.sin(a) * d], [0.15 + r() * 0.3, 0.3 + r() * 0.8, 0.15 + r() * 0.3], [r(), r() * 3, r()]); }
  },
  wreckpod(g, s) {
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, m = new T.MeshStandardMaterial({ color: 0x2b2830, roughness: 0.55, metalness: 0.7 });
    mk(G.ico, m, g, [cx, 0.9, cz], [1.9, 1.5, 1.9], [0.3, 0.4, 0.1]);
    mk(G.tor, M.glow(0x6a4acc, 0.7), g, [cx, 1.2, cz], [1.75, 1.75, 1.2], [1.2, 0.3, 0], false);
  },
  tree(g, s) {
    const bark = M.flat(0x4a3f36, 0.95), b = grp(g, [s.x, 0, s.z]);
    mk(taperTube([[0, 0, 0], [0.1, 1.4, 0.05], [-0.1, 2.6, 0], [0.15, 3.6, 0.1]], 0.3, 0.07, 10, 7), bark, b);
    const tips = [];
    const br = (p0, p1, p2) => { mk(taperTube([p0, p1, p2], 0.11, 0.015, 8, 6), bark, b); tips.push(p2, p1); };
    br([0, 2.2, 0], [0.9, 3.0, 0.2], [1.7, 3.3, 0.5]); br([0, 2.6, 0], [-0.8, 3.4, -0.2], [-1.6, 4.0, -0.1]); br([0.1, 3.2, 0], [0.3, 4.0, -0.6], [0.2, 4.6, -1.2]); br([0, 3.0, 0], [-0.3, 3.7, 0.7], [-0.9, 4.2, 1.3]);
    const r = rng(5), bloom = new T.InstancedMesh(G.sph, new T.MeshStandardMaterial({ color: 0xfff1f0, emissive: 0xffb0a0, emissiveIntensity: 0.5, roughness: 0.8 }), 90), m4 = new T.Matrix4();
    for (let i = 0; i < 90; i++) { const t = tips[(r() * tips.length) | 0], sc = 0.12 + r() * 0.16; m4.makeScale(sc, sc, sc); m4.setPosition(t[0] + (r() - 0.5) * 1.3, t[1] + (r() - 0.5) * 0.9, t[2] + (r() - 0.5) * 1.3); bloom.setMatrixAt(i, m4); }
    bloom.visible = false; b.add(bloom);
    g.userData.name = 'tree'; g.userData.bloom = bloom;
  },
  spinner(g, s) {
    bx(g, M.metal(0x8a8a84, 0.6), s.x - 0.1, 0, s.z - 0.1, s.x + 0.1, 8, s.z + 0.1);
    const rot = grp(g, [s.x, 8, s.z + 0.2]);
    for (let i = 0; i < 3; i++) { const bl = grp(rot, null, [0, 0, (i * Math.PI * 2) / 3]); mk(G.box, M.paint(0xe6dfd0, 0.6), bl, [0, 1.4, 0], [0.26, 2.8, 0.05]); }
    g.userData.spin = rot;
  },
  apron(g, s) {
    const m = M.concrete.clone(); m.map = TX.concrete.clone(); m.map.repeat.set((s.x1 - s.x0) / 9, (s.z1 - s.z0) / 9);
    mk(G.plane, m, g, [(s.x0 + s.x1) / 2, 0.015, (s.z0 + s.z1) / 2], [s.x1 - s.x0, 1, s.z1 - s.z0], null, false);
    const line = new T.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.9, transparent: true, opacity: 0.55 });
    mk(G.plane, line, g, [50, 0.025, 42], [22, 1, 0.22], null, false);
    for (let i = 0; i < 6; i++) mk(G.plane, line, g, [41 + i * 4, 0.025, 54], [2.2, 1, 0.22], null, false);
  },
  road(g, s) {
    const m = new T.MeshStandardMaterial({ color: 0xb7a48a, roughness: 1, transparent: true, opacity: 0.6 });
    mk(G.plane, m, g, [72.5, 0.02, 44.5], [8, 1, 5], null, false);
  },
  plaza(g, s) {
    const m = M.paving.clone(); m.map = TX.paving.clone(); m.map.repeat.set(7, 7);
    mk(new T.CircleGeometry(s.r, 48), m, g, [s.x, 0.02, s.z], null, [-Math.PI / 2, 0, 0], false);
    mk(new T.RingGeometry(s.r, s.r + 0.5, 48), M.paint(0x8a7a66, 0.95), g, [s.x, 0.025, s.z], null, [-Math.PI / 2, 0, 0], false);
  },
};

// ======================= PEOPLE =======================
function humanoid(o) {
  geos();
  const k = (o.h || 1.75) / 1.75, bw = o.build || 1, hs = o.head || 1, g = new T.Group();
  const hips = grp(g, [0, 0.93 * k, 0]);
  mk(G.sph, o.legs, hips, null, [0.17 * bw * k, 0.13 * k, 0.12 * bw * k]);
  const leg = (sx) => {
    const hip = grp(hips, [0.09 * sx * bw * k, -0.02 * k, 0]); mk(G.cyl, o.legs, hip, [0, -0.22 * k, 0], [0.078 * bw * k, 0.44 * k, 0.078 * bw * k]);
    const knee = grp(hip, [0, -0.44 * k, 0]); mk(G.cyl, o.legs, knee, [0, -0.21 * k, 0], [0.062 * bw * k, 0.42 * k, 0.062 * bw * k]);
    mk(G.box, o.shoe || o.legs, knee, [0, -0.45 * k, 0.04 * k], [0.1 * bw * k, 0.08 * k, 0.24 * k]);
    return { hip, knee };
  };
  const spine = grp(hips, [0, 0.05 * k, 0]);
  mk(G.cyl, o.top, spine, [0, 0.27 * k, 0], [0.17 * bw * k, 0.5 * k, 0.11 * bw * k]);
  mk(G.sph, o.top, spine, [0, 0.5 * k, 0], [0.21 * bw * k, 0.1 * k, 0.12 * bw * k]);
  const arm = (sx) => {
    const sh = grp(spine, [0.21 * sx * bw * k, 0.5 * k, 0]); mk(G.cyl, o.top, sh, [0, -0.15 * k, 0], [0.052 * bw * k, 0.3 * k, 0.052 * bw * k]);
    const el = grp(sh, [0, -0.3 * k, 0]); mk(G.cyl, o.skin, el, [0, -0.13 * k, 0], [0.042 * bw * k, 0.27 * k, 0.042 * bw * k]); mk(G.sph, o.skin, el, [0, -0.29 * k, 0], [0.045 * k, 0.055 * k, 0.04 * k]);
    return { sh, el };
  };
  const head = grp(spine, [0, 0.62 * k, 0]);
  mk(G.cyl, o.skin, head, null, [0.045 * k, 0.1 * k, 0.045 * k]);
  mk(G.sph, o.skin, head, [0, 0.14 * k * hs, 0.01], [0.105 * k * hs, 0.125 * k * hs, 0.115 * k * hs]);
  if (o.hair) mk(G.sph, o.hair, head, [0, 0.18 * k * hs, -0.02], [0.112 * k * hs, 0.11 * k * hs, 0.118 * k * hs]);
  return { root: g, hips, spine, head, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1), k, baseY: 0.93 * k };
}

export function poseHumanoid(r, a, t) {
  const ph = a.phase || 0, s = Math.sin(ph), run = a.run || 0, act = a.act || 'idle', k = a.k || 0;
  let hl = -s * 0.65 * run, hr = s * 0.65 * run, kl = Math.max(0, Math.sin(ph + 1.1)) * 0.9 * run, kr = Math.max(0, Math.sin(ph + 1.1 + Math.PI)) * 0.9 * run;
  let al = [s * 0.55 * run, 0, 0.08], ar = [-s * 0.55 * run, 0, -0.08], el = -0.15 - 0.4 * run, er = -0.15 - 0.4 * run, sx = 0.06 * run, hy = r.baseY + Math.abs(Math.cos(ph)) * 0.03 * run, tilt = 0;
  if (act === 'windup') { ar = [-2.7, 0, -0.3]; er = -0.6; sx = -0.18; }
  else if (act === 'strike') { ar = [-0.7, 0, 0.2]; er = -0.1; sx = 0.4; }
  else if (act === 'aim') { ar = [-1.45, 0, 0.1]; al = [-1.3, 0, -0.35]; er = -0.1; el = -0.5; }
  else if (act === 'held') { const j = Math.sin(t * 13); al = [-0.4 + j * 0.5, 0, 1.3]; ar = [-0.4 - j * 0.5, 0, -1.3]; hl = j * 0.6; hr = -j * 0.6; kl = 0.6; kr = 0.6; }
  else if (act === 'carried') { al = [-0.3, 0, 0.9]; ar = [-0.3, 0, -0.9]; hl = -0.3; hr = 0.2; kl = 0.5; kr = 0.7; }
  else if (act === 'sit') { hl = -1.5; hr = -1.5; kl = 1.4; kr = 1.4; al = [-0.5, 0, 0.3]; ar = [-0.5, 0, -0.3]; hy = r.baseY * 0.47; }
  else if (act === 'cheer') { const j = Math.abs(Math.sin(t * 7)); al = [-2.8, 0, 0.4]; ar = [-2.8, 0, -0.4]; hy += j * 0.1; }
  else if (act === 'cower') { al = [-2.4, 0, -0.5]; ar = [-2.4, 0, 0.5]; el = -1.6; er = -1.6; hl = -1.1; hr = -1.1; kl = 2; kr = 2; hy = r.baseY * 0.6; sx = 0.5; }
  else if (act === 'pinned') { tilt = -1.45; hy = 0.2; al = [-2.6, 0, 0.5]; ar = [-0.3, 0, -0.6]; }
  else if (act === 'kneel') { hl = -1.3; kl = 1.5; hr = 0.2; kr = 1.3; hy = r.baseY * 0.6; sx = 0.3; al = [0.1, 0, 0.3]; ar = [0.1, 0, -0.3]; }
  else if (act === 'wave') { ar = [-2.7, 0, -0.5 + Math.sin(t * 8) * 0.3]; }
  else if (act === 'talk') { ar = [-0.6 + Math.sin(t * 3) * 0.15, 0, -0.2]; er = -1.0; }
  else if (act === 'stagger') { sx = 0.5; al = [0.3, 0, 0.5]; ar = [0.3, 0, -0.5]; hy = r.baseY * 0.85; }
  r.hips.position.y = hy; r.root.rotation.x = tilt;
  r.spine.rotation.x = sx;
  r.legL.hip.rotation.x = hl; r.legR.hip.rotation.x = hr; r.legL.knee.rotation.x = kl; r.legR.knee.rotation.x = kr;
  r.armL.sh.rotation.set(al[0], al[1], al[2]); r.armR.sh.rotation.set(ar[0], ar[1], ar[2]);
  r.armL.el.rotation.x = el; r.armR.el.rotation.x = er;
}

const LOOKS = {
  pip:  { h: 1.28, head: 1.25, skin: 0x8d5a3c, top: 0xd9a323, legs: 0x4a5a6a, hair: 0x1a1210, extra: 'pip' },
  mara: { h: 1.66, skin: 0x7a4c33, top: 0x4f6b7a, legs: 0x3a3a3f, hair: 0xcfcfcf, extra: 'mara' },
  tobe: { h: 1.8, skin: 0x6b4128, top: 0xb5553a, legs: 0x54493c, hair: 0x14100e, extra: 'tobe' },
  t0:   { h: 1.72, skin: 0xb98a66, top: 0x6d7f4f, legs: 0x3f3a36, hair: 0x3a2a1e },
  t1:   { h: 1.62, skin: 0x8a5a3c, top: 0x8a5a7a, legs: 0x4a4f5a, hair: 0x221a16 },
  t2:   { h: 1.78, skin: 0xd2a67e, top: 0xc79a3a, legs: 0x3a4650, hair: 0x7a6a5a },
  t3:   { h: 1.68, skin: 0x5f3b26, top: 0x3f7f86, legs: 0x504438, hair: 0x101010 },
  t4:   { h: 1.1, head: 1.3, skin: 0xa9744f, top: 0xc65a3a, legs: 0x445066, hair: 0x2a1c14 },
};
function person(look) {
  const L = LOOKS[look] || LOOKS.t0;
  const rig = humanoid({ h: L.h, head: L.head, skin: M.flat(L.skin, 0.7), top: M.flat(L.top, 0.9), legs: M.flat(L.legs, 0.9), hair: M.flat(L.hair, 0.95), shoe: M.flat(0x2a2420) });
  const k = rig.k;
  if (L.extra === 'pip') {   // scarf and goggles pushed up on her head
    mk(G.tor, M.flat(0xc4472c, 0.9), rig.spine, [0, 0.6 * k, 0], [0.11 * k, 0.11 * k, 1.5 * k], [Math.PI / 2, 0, 0]);
    mk(G.box, M.flat(0xc4472c, 0.9), rig.spine, [0.06 * k, 0.45 * k, -0.12 * k], [0.09 * k, 0.32 * k, 0.03 * k], [0.25, 0, 0.1]);
    mk(G.tor, M.metal(0x8a6a2a, 0.4, 0.8), rig.head, [0, 0.29 * k, 0.03], [0.1 * k, 0.1 * k, 0.9 * k], [Math.PI / 2 - 0.3, 0, 0]);
    mk(G.sph, M.flat(0x1a1210, 0.95), rig.head, [0, 0.26 * k, -0.17 * k], [0.09 * k, 0.09 * k, 0.09 * k]);
  } else if (L.extra === 'mara') {
    mk(G.sph, M.flat(0xcfcfcf, 0.95), rig.head, [0, 0.2 * k, -0.13 * k], [0.06 * k, 0.06 * k, 0.06 * k]);
    mk(G.tor, M.flat(0x5a4632, 0.8), rig.hips, [0, 0.08 * k, 0], [0.18 * k, 0.13 * k, 1.1 * k], [Math.PI / 2, 0, 0]);
    mk(G.box, M.metal(0x9a9a94, 0.4, 0.8), rig.hips, [0.19 * k, -0.02, 0.02], [0.04, 0.26 * k, 0.07]);
  } else if (L.extra === 'tobe') {
    mk(G.cyl, M.flat(0xcbb58a, 0.9), rig.head, [0, 0.24 * k, 0], [0.24 * k, 0.02 * k, 0.24 * k]); mk(G.cyl, M.flat(0xcbb58a, 0.9), rig.head, [0, 0.29 * k, 0], [0.12 * k, 0.1 * k, 0.12 * k]);
  }
  return rig;
}

function soldier(kind) {
  const big = kind === 'bailiff';
  const rig = humanoid({ h: big ? 2.55 : kind === 'lancer' ? 1.86 : 1.92, build: big ? 1.75 : kind === 'lancer' ? 1.0 : 1.3, skin: M.legion, top: M.legionLite, legs: M.legion });
  const k = rig.k, bw = big ? 1.75 : kind === 'lancer' ? 1 : 1.3;
  mk(G.sph, M.legion, rig.head, [0, 0.14 * k, 0], [0.135 * k, 0.15 * k, 0.15 * k]);                                     // helm
  mk(G.box, M.violetHot, rig.head, [0, 0.15 * k, 0.125 * k], [kind === 'lancer' ? 0.05 * k : 0.17 * k, 0.03 * k, 0.05 * k], null, false);   // visor
  mk(G.box, M.legion, rig.spine, [0, 0.36 * k, 0.03 * k], [0.36 * bw * k, 0.34 * k, 0.24 * bw * k]);                     // breastplate
  for (const sx of [1, -1]) mk(G.sph, M.legion, rig.spine, [0.23 * sx * bw * k, 0.53 * k, 0], [0.11 * bw * k, 0.08 * k, 0.12 * bw * k]);
  for (let i = 0; i < 4; i++) mk(G.box, M.violet, rig.spine, [(-0.09 + i * 0.06) * bw * k, 0.4 * k, 0.153 * bw * k], [0.018 * k, 0.16 * k, 0.01], null, false);  // tally marks
  const ex = {};
  if (kind === 'tally') {
    ex.blade = mk(G.box, M.violetHot, rig.armR.el, [0, -0.5 * k, 0.03], [0.03, 0.75 * k, 0.1 * k], null, false);
    mk(G.box, M.legion, rig.armR.el, [0, -0.16 * k, 0], [0.1 * k, 0.24 * k, 0.1 * k]);
  } else if (kind === 'lancer') {
    const l = grp(rig.armR.el, [0, -0.28 * k, 0], [Math.PI / 2, 0, 0]);
    mk(G.cyl, M.legion, l, [0, 0.5, 0], [0.035, 2.0, 0.035]); mk(G.cone, M.violetHot, l, [0, 1.65, 0], [0.07, 0.4, 0.07], null, false);
    mk(G.cone, M.legion, rig.head, [0, 0.3 * k, -0.04], [0.1 * k, 0.26 * k, 0.1 * k], [-0.4, 0, 0]);
  } else if (big) {
    const sh = grp(rig.spine, [0.12 * k, 0.2 * k, 0.5 * k]);
    mk(G.box, M.legion, sh, null, [1.5, 2.05, 0.14]);
    for (const [x, y, w, h] of [[0, 1.0, 1.5, 0.07], [0, -1.0, 1.5, 0.07], [0.73, 0, 0.07, 2.05], [-0.73, 0, 0.07, 2.05], [0, 0, 0.08, 1.4]]) mk(G.box, M.violetHot, sh, [x, y, 0.075], [w, h, 0.03], null, false);
    ex.shield = sh;
    const mace = grp(rig.armR.el, [0, -0.3 * k, 0]); mk(G.cyl, M.legion, mace, [0, -0.5, 0], [0.05, 1.1, 0.05]); mk(G.ico, M.legionLite, mace, [0, -1.1, 0], [0.24, 0.24, 0.24]);
    mk(G.box, M.legion, rig.head, [0, 0.32 * k, 0], [0.05, 0.16 * k, 0.26 * k]);
  }
  rig.ex = ex;
  return rig;
}

// ======================= ENTITIES =======================
export function buildEntity(e) {
  geos();
  const mv = modelView(e); if (mv) return mv;
  const v = { g: new T.Group(), kind: e.kind };
  const g = v.g;
  switch (e.kind) {
    case 'npc': v.rig = person(e.look); g.add(v.rig.root); break;
    case 'tally': case 'lancer': case 'bailiff': v.rig = soldier(e.kind); g.add(v.rig.root); break;
    case 'boss': buildBoss(v); break;
    case 'tick': {
      mk(G.sph, M.metal(0x7a4a2a, 0.6, 0.5), g, [0, 0.22, 0], [0.3, 0.2, 0.36]); mk(G.sph, M.glow(0xff5a2a, 4), g, [0, 0.26, 0.3], [0.07, 0.06, 0.05], null, false);
      v.legs = []; for (let i = 0; i < 6; i++) { const s = i < 3 ? 1 : -1, l = grp(g, [0.2 * s, 0.2, (i % 3 - 1) * 0.2]); mk(G.box, M.metal(0x3a2a20), l, [0.16 * s, -0.08, 0], [0.3, 0.035, 0.035], [0, 0, -0.5 * s], false); v.legs.push(l); }
      break;
    }
    case 'drone': {
      v.core = mk(G.ico, M.legion, g, [0, 0, 0], [0.32, 0.32, 0.32]); v.eye = mk(G.sph, M.glow(0x9a6bff, 5), g, [0, 0, 0.26], [0.13, 0.13, 0.1], null, false);
      v.r1 = mk(G.tor, M.legionLite, g, null, [0.5, 0.5, 1]); v.r2 = mk(G.tor, M.violet, g, null, [0.42, 0.42, 1], [Math.PI / 2, 0, 0], false);
      break;
    }
    case 'stake': {
      const ob = new T.CylinderGeometry(0.22, 0.55, 3.6, 4); mk(ob, M.legion, g, [0, 1.8, 0], null, [0, Math.PI / 4, 0]);
      v.band = mk(G.tor, M.violetHot, g, [0, 2.3, 0], [0.5, 0.5, 2], [Math.PI / 2, 0, 0], false);
      v.top = mk(G.oct, M.violetHot, g, [0, 4.1, 0], [0.26, 0.42, 0.26], null, false);
      mk(new T.ConeGeometry(0.5, 1.2, 4), M.legion, g, [0, -0.5, 0], null, [Math.PI, Math.PI / 4, 0], false);
      break;
    }
    case 'crate': mk(G.box, M.wood, g, [0, 0.5, 0], [1, 1, 1]); mk(G.box, M.metal(0x3f3a34, 0.8, 0.3), g, [0, 0.5, 0], [1.04, 0.12, 1.04]); break;
    case 'drum': {
      mk(G.cyl, M.paint(0xc8521f, 0.5), g, [0, 0.6, 0], [0.42, 1.2, 0.42]); for (const y of [0.3, 0.9]) mk(G.tor, M.paint(0xa8441a, 0.5), g, [0, y, 0], [0.43, 0.43, 0.7], [Math.PI / 2, 0, 0]);
      mk(G.cyl, M.paint(0xe6c21f, 0.6), g, [0, 0.6, 0], [0.425, 0.22, 0.425]);
      break;
    }
    case 'engine': {
      const m = M.metal(0x4a4c4e, 0.5, 0.8); mk(G.box, m, g, [0, 0.45, 0], [0.9, 0.7, 1.2]); mk(G.box, M.metal(0x6a6c6e, 0.4, 0.9), g, [0, 0.9, 0], [0.7, 0.24, 1.0]);
      for (let i = 0; i < 4; i++) mk(G.cyl, M.metal(0x8a6a3a, 0.4, 0.9), g, [0.5, 0.6, -0.4 + i * 0.27], [0.06, 0.4, 0.06], [0, 0, 0.9]);
      mk(G.cyl, M.metal(0x2a2a2a), g, [0, 0.45, 0.68], [0.3, 0.12, 0.3], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'girder': {
      const m = M.metal(0x7a4a34, 0.75, 0.5); mk(G.box, m, g, [0, 0.32, 0], [4.6, 0.08, 0.36]); mk(G.box, m, g, [0, 0, 0], [4.6, 0.08, 0.36]); mk(G.box, m, g, [0, 0.16, 0], [4.6, 0.32, 0.07]);
      break;
    }
    case 'panel': mk(G.box, M.metal(0xa9adaf, 0.45, 0.8), g, [0, 0.1, 0], [3.4, 0.14, 1.8], [0, 0.3, 0]); mk(G.box, M.paint(0xb5553a, 0.8), g, [0, 0.18, 0], [3.0, 0.02, 0.3], [0, 0.3, 0], false); break;
    case 'pod': {
      const m = corr(0x4f6b46, 1, 1); mk(G.box, m, g, [0, 1.1, 0], [3.0, 2.2, 2.2]); mk(G.box, M.metal(0x3a3f3c, 0.7), g, [0, 1.1, 1.11], [1.1, 1.8, 0.06]);
      mk(G.box, M.glow(0xffc070, 1.2), g, [0, 1.5, 1.15], [0.5, 0.12, 0.02], null, false);
      break;
    }
    case 'shield': {
      mk(G.box, M.legion, g, [0, 0.1, 0], [1.5, 0.14, 2.05]); mk(G.box, M.violetHot, g, [0, 0.18, 0], [0.08, 0.03, 1.4], null, false);
      break;
    }
    case 'crest': {   // the Reckoner's Mandate: the same fire as Vellum's own
      v.core = mk(G.oct, M.glow(0xffc266, 9), g, [0, 0, 0], [0.3, 0.46, 0.3], null, false);
      v.r1 = mk(G.tor, M.gold, g, null, [0.56, 0.56, 1]); v.r2 = mk(G.tor, M.gold, g, null, [0.7, 0.7, 0.8], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'page': {
      v.core = mk(new T.PlaneGeometry(0.6, 0.8), new T.MeshStandardMaterial({ color: 0xf4ead0, emissive: 0xffc266, emissiveIntensity: 1.6, side: T.DoubleSide, roughness: 0.8 }), g, [0, 1.2, 0], null, null, false);
      break;
    }
    case 'nest': {
      const r = rng(31), cols = [0x6a4a3a, 0x4f4a46, 0x8a5a3a];
      for (let i = 0; i < 12; i++) { const a = r() * 6.28, d = r() * 1.3; mk(r() > 0.5 ? G.box : G.cyl6, M.metal(cols[i % 3], 0.8, 0.4), g, [Math.cos(a) * d, 0.3 + r() * (1.3 - d) * 0.9, Math.sin(a) * d], [0.5 + r() * 0.7, 0.3 + r() * 0.6, 0.5 + r() * 0.7], [r() * 2, r() * 3, r() * 2]); }
      for (let i = 0; i < 4; i++) mk(G.sph, M.glow(0xff5a2a, 3), g, [Math.cos(i * 1.6) * 1.1, 0.4 + (i % 2) * 0.4, Math.sin(i * 1.6) * 1.1], [0.16, 0.16, 0.16], null, false);
      break;
    }
    case 'bolt': {
      v.core = mk(G.sph, e.mine ? M.glow(0xffc266, 8) : M.glow(0xb48bff, 8), g, null, [0.16, 0.16, 0.5], null, false);
      break;
    }
    case 'orb': {
      v.core = mk(G.sph, M.glow(0xffd28a, 10), g, null, [0.4, 0.4, 0.4], null, false);
      break;
    }
    case 'marker': break;
    default: mk(G.box, M.flat(0xff00ff), g, [0, 0.5, 0], [0.6, 1, 0.6]);
  }
  g.traverse((o) => { if (o.isMesh) o.userData.m0 = o.material; });
  return v;
}

function buildBoss(v) {
  const g = v.g, b = grp(g, [0, 0.35, 0]); v.body = b;
  const robeG = new T.CylinderGeometry(0.34, 0.95, 1.9, 14, 1, true); const robeM = M.robe.clone(); robeM.side = T.DoubleSide;
  mk(robeG, robeM, b, [0, 0.95, 0]);
  for (let i = 0; i < 7; i++) mk(G.box, M.violet, b, [Math.sin(i * 0.9) * 0.62, 0.5, Math.cos(i * 0.9) * 0.62], [0.03, 0.5, 0.02], [0, i * 0.9, 0], false);
  mk(G.box, M.legion, b, [0, 2.2, 0.02], [0.72, 0.6, 0.4]); mk(G.sph, M.legionLite, b, [0, 1.95, 0], [0.34, 0.2, 0.25]);
  for (const sx of [1, -1]) { mk(G.box, M.gold, b, [0.5 * sx, 2.55, 0], [0.42, 0.1, 0.44], [0, 0, 0.35 * sx]); mk(G.box, M.legion, b, [0.5 * sx, 2.5, 0], [0.38, 0.14, 0.4], [0, 0, 0.35 * sx]); }
  const head = grp(b, [0, 2.75, 0]); v.head = head;
  mk(G.sph, M.legion, head, [0, 0.12, 0], [0.17, 0.22, 0.19]); mk(G.box, M.violetHot, head, [0, 0.13, 0.17], [0.03, 0.24, 0.03], null, false);
  mk(G.box, M.gold, head, [0, 0.36, 0], [0.4, 0.035, 0.035]);
  v.halo = mk(G.tor, M.gold, head, [0, 0.2, -0.22], [0.42, 0.42, 0.6]);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; mk(G.box, M.violetHot, v.halo, [Math.cos(a), Math.sin(a), 0], [0.05, 0.22, 0.06], [0, 0, a - 1.57], false); }
  const arm = (sx) => { const sh = grp(b, [0.42 * sx, 2.4, 0]); mk(G.cyl, M.robe, sh, [0, -0.3, 0], [0.11, 0.6, 0.11]); const el = grp(sh, [0, -0.6, 0]); mk(G.cyl, M.legion, el, [0, -0.25, 0], [0.07, 0.5, 0.07]); return { sh, el }; };
  v.armL = arm(1); v.armR = arm(-1);
  const staff = grp(v.armR.el, [0, -0.5, 0], [Math.PI / 2, 0, 0]); v.staff = staff;
  mk(G.cyl, M.gold, staff, [0, 0.3, 0], [0.035, 2.6, 0.035]); mk(G.tor, M.gold, staff, [0, 1.85, 0], [0.28, 0.28, 1]);
  v.crest = mk(G.oct, M.glow(0xffc266, 9), staff, [0, 1.85, 0], [0.14, 0.2, 0.14], null, false);
  v.ward = mk(new T.SphereGeometry(1.9, 20, 14), new T.MeshBasicMaterial({ color: 0x9a6bff, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, fog: false }), g, [0, 1.7, 0], null, null, false);
  v.ward.receiveShadow = false; v.ward.visible = false;
}

const FLASH = { m: null };
export function setFlash(v, on) {
  if (!FLASH.m) FLASH.m = new T.MeshBasicMaterial({ color: 0xfff4e0, fog: false });
  if (v.flashOn === on) return; v.flashOn = on;
  v.g.traverse((o) => { if (o.isMesh && o.userData.m0) o.material = on ? FLASH.m : o.userData.m0; });
}

// per-frame animation of an entity's view from its simulation state
export function poseEntity(v, e, t) {
  if (v.model) { poseModel(v, e, t); return; }
  const g = v.g;
  switch (e.kind) {
    case 'npc': case 'tally': case 'lancer': case 'bailiff': {
      poseHumanoid(v.rig, { phase: e.phase || 0, run: e.runAmt || 0, act: e.act || 'idle' }, t + e.id);
      if (v.rig.ex && v.rig.ex.shield) v.rig.ex.shield.visible = e.shield > 0;
      break;
    }
    case 'boss': {
      const st = e.act || 'idle';
      v.body.position.y = st === 'kneel' ? -0.5 : 0.35 + Math.sin(t * 1.8) * 0.12 + (e.rise || 0);
      v.body.rotation.x = st === 'kneel' || st === 'stagger' ? 0.45 : 0;
      v.halo.rotation.z = t * 0.6;
      v.armR.sh.rotation.set(st === 'cast' ? -2.3 : st === 'aim' ? -1.5 : st === 'kneel' ? 0.2 : -0.5, 0, st === 'cast' ? -0.3 : -0.15);
      v.armR.el.rotation.x = st === 'aim' ? -0.1 : -0.5;
      v.armL.sh.rotation.set(st === 'cast' ? -2.3 : st === 'sweep' ? -1.2 : 0.1, 0, st === 'sweep' ? 1.2 : 0.15);
      v.ward.visible = !!e.warded; v.ward.material.opacity = 0.13 + Math.sin(t * 5) * 0.04;
      v.staff.visible = !e.noStaff; v.crest.visible = !e.noCrest;
      break;
    }
    case 'tick': { for (let i = 0; i < 6; i++) v.legs[i].rotation.y = Math.sin(t * 22 + i * 2) * 0.5 * (e.runAmt || 0.2); g.position.y += Math.abs(Math.sin(t * 9 + e.id)) * 0.12 * (e.runAmt || 0); break; }
    case 'drone': { v.r1.rotation.set(t * 3, t * 2, 0); v.r2.rotation.set(Math.PI / 2 + t * 2, 0, t * 4); const arm = e.arm > 0; v.eye.scale.setScalar(arm ? 0.16 + Math.sin(t * 40) * 0.06 : 0.12); break; }
    case 'stake': { v.band.rotation.z = t * 1.5; v.top.rotation.y = t * 2; v.top.position.y = 4.1 + Math.sin(t * 2 + e.id) * 0.15; v.band.visible = v.top.visible = !e.inert; break; }
    case 'crest': { v.r1.rotation.set(t * 1.2, t * 0.7, 0); v.r2.rotation.set(Math.PI / 2 + t * 0.9, t * 1.3, 0); v.core.rotation.y = t * 2; break; }
    case 'page': { v.core.rotation.y = t * 1.5; v.core.position.y = 1.2 + Math.sin(t * 2) * 0.12; break; }
    case 'orb': { const s = 0.3 + (e.charge || 0.5) * 0.35 + Math.sin(t * 40) * 0.03; v.core.scale.setScalar(s); break; }
  }
}
