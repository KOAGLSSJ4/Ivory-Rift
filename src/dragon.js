// dragon.js — Vellum: built from primitives, posed procedurally.
// Model space: feet at the origin, facing +z. His left arm is at +x.
// The silhouette to protect: four swept-back horns, amber eyes, wide ribbed pauldrons, white hide, long tail.
import { M } from './mats.js';
import { clamp, lerp, smooth } from './util.js';
const T = window.THREE;

let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = {
    sph: new T.SphereGeometry(1, 24, 16),
    sphLo: new T.SphereGeometry(1, 12, 8),
    dome: new T.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    cone: new T.ConeGeometry(1, 1, 8),
    cyl: new T.CylinderGeometry(1, 1, 1, 20),
    box: new T.BoxGeometry(1, 1, 1),
    tor: new T.TorusGeometry(1, 0.08, 8, 28),
  };
  GEO.cone.translate(0, 0.5, 0); // base at origin, tip at +y
  return GEO;
}

// a tube that tapers along a curve: horns, claws
export function taperTube(points, r0, r1, seg = 12, rad = 8, pow = 1) {
  const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(p[0], p[1], p[2])));
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), N = fr.normals[i], B = fr.binormals[i];
    const r = r0 + (r1 - r0) * Math.pow(t, pow);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
      pos.push(c.x + r * (cx * N.x + sy * B.x), c.y + r * (cx * N.y + sy * B.y), c.z + r * (cx * N.z + sy * B.z));
      uv.push(j / rad, t * 3);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildDragon(ghostMat = null) {
  const G = geos();
  const mat = (m) => ghostMat || m;
  const mk = (geo, m, parent, p, s, r) => {
    const o = new T.Mesh(geo, mat(m));
    if (p) o.position.set(p[0], p[1], p[2]);
    if (s) o.scale.set(s[0], s[1], s[2]);
    if (r) o.rotation.set(r[0], r[1], r[2]);
    if (!ghostMat) { o.castShadow = true; o.receiveShadow = true; }
    parent.add(o); return o;
  };
  const grp = (parent, p, r) => { const g = new T.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (r) g.rotation.set(r[0], r[1], r[2]); parent.add(g); return g; };

  const root = new T.Group();
  const body = grp(root, [0, 1.38, 0]);      // hips: everything hangs from here
  const d = { root, body, tail: [], eyes: [] };

  // ---- pelvis, tassets, belt
  mk(G.sph, M.armor, body, [0, -0.02, 0.01], [0.4, 0.3, 0.31]);
  mk(G.sph, M.armor, body, [0, -0.2, 0.05], [0.2, 0.2, 0.22]);
  for (const sx of [1, -1]) mk(G.box, M.armor, body, [0.42 * sx, -0.08, 0.02], [0.09, 0.34, 0.3], [0, 0, -0.22 * sx]);
  mk(G.tor, M.armor, body, [0, 0.2, 0], [0.4, 0.31, 0.5], [Math.PI / 2, 0, 0]);

  // ---- legs
  const leg = (sx) => {
    const hip = grp(body, [0.27 * sx, -0.02, 0]);
    mk(G.sph, M.scale, hip, [0.03 * sx, -0.32, 0.03], [0.235, 0.44, 0.27]);                 // thigh
    mk(G.sph, M.scale, hip, [0.01 * sx, -0.2, -0.09], [0.21, 0.3, 0.2]);                    // hamstring mass
    const knee = grp(hip, [0.03 * sx, -0.66, 0.02]);
    mk(G.sph, M.armor, knee, [0, 0, 0.07], [0.15, 0.17, 0.14]);                             // knee cap
    mk(new T.CylinderGeometry(0.185, 0.15, 0.56, 18), M.armor, knee, [0, -0.31, 0]);          // greave
    mk(G.tor, M.armor, knee, [0, -0.05, 0], [0.19, 0.19, 0.45], [Math.PI / 2, 0, 0]);
    mk(G.tor, M.armor, knee, [0, -0.57, 0], [0.155, 0.155, 0.45], [Math.PI / 2, 0, 0]);
    const foot = grp(knee, [0, -0.6, 0]);
    mk(G.sph, M.scale, foot, [0, -0.02, 0.02], [0.17, 0.13, 0.19]);                         // ankle
    mk(G.sph, M.scale, foot, [0, -0.05, 0.2], [0.19, 0.1, 0.27]);                           // foot
    for (const t of [-1, 0, 1]) {
      const toe = grp(foot, [0.1 * t, -0.07, 0.4], [0, 0.32 * t, 0]);
      mk(G.sph, M.scale, toe, [0, 0, 0], [0.07, 0.065, 0.12]);
      mk(G.cone, M.claw, toe, [0, 0, 0.08], [0.05, 0.2, 0.05], [1.75, 0, 0]);
    }
    mk(G.cone, M.claw, foot, [0, -0.04, -0.12], [0.045, 0.14, 0.045], [-1.9, 0, 0]);         // heel spur
    return { hip, knee, foot };
  };
  d.legL = leg(1); d.legR = leg(-1);

  // ---- tail: a chain that curves down to the ground and curls
  const N = 13, segLen = 0.27;
  let parent = grp(body, [0, -0.08, -0.22], [0, 0, 0]);
  d.tailRoot = parent;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), r0 = lerp(0.23, 0.035, Math.pow(t, 0.8)), r1 = lerp(0.23, 0.035, Math.pow((i + 1) / (N - 1), 0.8));
    const g = grp(parent, [0, 0, i === 0 ? 0 : -segLen]);
    const cg = new T.CylinderGeometry(r0, Math.max(r1, 0.012), segLen, 12, 1, true); cg.rotateX(Math.PI / 2); cg.translate(0, 0, -segLen / 2);
    mk(cg, M.scale, g);
    mk(G.sphLo, M.scale, g, [0, 0, 0], [r0, r0, r0]);
    if (i === N - 1) mk(G.cone, M.scale, g, [0, 0, -segLen], [r1, 0.2, r1], [-Math.PI / 2, 0, 0]);
    d.tail.push(g); parent = g;
  }

  // ---- abdomen: banded plates widening into the chest
  const spine = grp(body, [0, 0.2, 0]); d.spine = spine;
  for (let i = 0; i < 4; i++) {
    const w = 0.33 + i * 0.045;
    const pg = new T.CylinderGeometry(w * 0.93, w * 1.04, 0.155, 22);
    mk(pg, M.armor, spine, [0, 0.07 + i * 0.135, 0.01], [1, 1, 0.74]);
  }
  mk(G.cyl, M.scaleDark, spine, [0, 0.28, 0], [0.31, 0.56, 0.22]);                            // body under the plates

  // ---- chest
  const chest = grp(spine, [0, 0.64, 0]); d.chest = chest;
  mk(G.sph, M.armor, chest, [0, 0.14, 0.03], [0.61, 0.36, 0.4]);                              // cuirass
  mk(G.sph, M.armor, chest, [0.24, 0.17, 0.2], [0.3, 0.22, 0.2]); mk(G.sph, M.armor, chest, [-0.24, 0.17, 0.2], [0.3, 0.22, 0.2]); // pectoral swell
  mk(G.tor, M.armor, chest, [0, -0.02, 0.03], [0.52, 0.36, 0.5], [Math.PI / 2, 0, 0]);         // lower rim
  mk(G.tor, M.armor, chest, [0, 0.4, 0.02], [0.27, 0.24, 0.7], [Math.PI / 2 - 0.25, 0, 0]);    // collar

  // ---- pauldrons: the wide flared plates that make the silhouette
  d.pauldrons = [];
  for (const sx of [1, -1]) {
    const p = grp(chest, [0.4 * sx, 0.3, 0], [0, 0, 0.2 * sx]);
    const dome = mk(G.dome, M.armorRib, p, [0.44 * sx, 0, 0], [0.66, 0.24, 0.43]);
    dome.rotation.y = sx > 0 ? 0 : Math.PI;
    mk(G.tor, M.armor, p, [0.44 * sx, 0, 0], [0.66, 0.43, 0.4], [Math.PI / 2, 0, 0]);         // rim
    mk(G.sph, M.armor, p, [0.04 * sx, 0.02, 0], [0.22, 0.16, 0.28]);                         // root
    d.pauldrons.push(p);
  }

  // ---- arms
  const arm = (sx) => {
    const sh = grp(chest, [0.6 * sx, 0.18, 0]);
    mk(G.sph, M.scale, sh, [0.02 * sx, -0.04, 0], [0.22, 0.24, 0.23]);                        // deltoid
    mk(G.sph, M.scale, sh, [0.03 * sx, -0.3, 0.01], [0.19, 0.3, 0.2]);                        // upper arm
    const el = grp(sh, [0.03 * sx, -0.56, 0]);
    mk(G.sph, M.scale, el, [0, 0, -0.02], [0.14, 0.14, 0.15]);
    mk(G.sph, M.scale, el, [0, -0.16, 0.01], [0.15, 0.24, 0.16]);                             // forearm
    const br = new T.CylinderGeometry(0.185, 0.145, 0.34, 18);
    mk(br, M.armor, el, [0, -0.27, 0]);                                                       // bracer, flared at the elbow end
    mk(G.tor, M.armor, el, [0, -0.1, 0], [0.19, 0.19, 0.4], [Math.PI / 2, 0, 0]);
    mk(G.tor, M.armor, el, [0, -0.44, 0], [0.15, 0.15, 0.4], [Math.PI / 2, 0, 0]);
    const hand = grp(el, [0, -0.52, 0]);
    mk(G.sph, M.scale, hand, [0, -0.07, 0], [0.11, 0.12, 0.07]);
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const fg = grp(hand, [(-0.075 + f * 0.05) * 1, -0.17, 0.01], [0.25, 0, (f - 1.5) * 0.09]);
      mk(G.sph, M.scale, fg, [0, -0.05, 0], [0.03, 0.07, 0.03]);
      mk(G.cone, M.claw, fg, [0, -0.1, 0], [0.027, 0.14, 0.027], [Math.PI, 0, 0]);
      fingers.push(fg);
    }
    const th = grp(hand, [0.11 * -sx, -0.06, 0.03], [0.3, 0, -0.9 * -sx]);
    mk(G.sph, M.scale, th, [0, -0.04, 0], [0.03, 0.06, 0.03]);
    mk(G.cone, M.claw, th, [0, -0.08, 0], [0.026, 0.11, 0.026], [Math.PI, 0, 0]);
    return { sh, el, hand, fingers };
  };
  d.armL = arm(1); d.armR = arm(-1);

  // ---- neck and head
  const neck = grp(chest, [0, 0.42, 0.02], [0.2, 0, 0]); d.neck = neck;
  mk(new T.CylinderGeometry(0.15, 0.22, 0.4, 14), M.scale, neck, [0, 0.16, 0]);
  for (let i = 0; i < 3; i++) mk(G.cone, M.horn, neck, [0, 0.06 + i * 0.12, -0.17 + i * 0.012], [0.035, 0.13, 0.035], [-1.9, 0, 0]);
  const head = grp(neck, [0, 0.44, 0.03], [-0.1, 0, 0]); d.head = head; head.scale.setScalar(1.24);
  mk(G.sph, M.scale, head, [0, 0.03, 0], [0.19, 0.18, 0.23]);                                  // skull
  const sn = new T.CylinderGeometry(0.075, 0.155, 0.34, 8); sn.rotateX(Math.PI / 2);
  mk(sn, M.scale, head, [0, -0.02, 0.3], [1, 0.72, 1]);                                        // snout
  mk(G.sph, M.scale, head, [0, -0.015, 0.46], [0.082, 0.062, 0.07]);                           // nose
  const jw = new T.CylinderGeometry(0.06, 0.13, 0.32, 8); jw.rotateX(Math.PI / 2);
  d.jaw = mk(jw, M.scaleDark, head, [0, -0.115, 0.26], [1, 0.42, 1]);
  mk(G.sph, M.scale, head, [0.13, -0.05, 0.06], [0.07, 0.1, 0.13]); mk(G.sph, M.scale, head, [-0.13, -0.05, 0.06], [0.07, 0.1, 0.13]); // cheeks
  for (const sx of [1, -1]) {
    mk(G.box, M.scale, head, [0.095 * sx, 0.105, 0.17], [0.13, 0.045, 0.22], [0.12, 0.42 * sx, -0.4 * sx]);  // heavy brow
    mk(G.sph, M.socket, head, [0.1 * sx, 0.055, 0.185], [0.05, 0.034, 0.04]);
    d.eyes.push(mk(G.sphLo, M.eye, head, [0.105 * sx, 0.056, 0.205], [0.03, 0.022, 0.026]));
    mk(G.sphLo, M.socket, head, [0.035 * sx, 0.005, 0.5], [0.014, 0.012, 0.012]);                          // nostril
    // upper horn: long, sweeping up and back
    mk(taperTube([[0.09 * sx, 0.13, -0.04], [0.15 * sx, 0.3, -0.24], [0.2 * sx, 0.46, -0.6], [0.22 * sx, 0.66, -1.02]], 0.078, 0.006, 14, 8, 0.85), M.horn, head);
    // lower horn: shorter, sweeping back and out
    mk(taperTube([[0.16 * sx, 0.03, -0.08], [0.3 * sx, 0.07, -0.28], [0.4 * sx, 0.13, -0.56], [0.45 * sx, 0.24, -0.84]], 0.062, 0.005, 12, 8, 0.85), M.horn, head);
    // cheek and jaw spikes
    mk(G.cone, M.horn, head, [0.17 * sx, -0.06, -0.02], [0.035, 0.2, 0.035], [-1.35, 0, -0.75 * sx]);
    mk(G.cone, M.horn, head, [0.15 * sx, -0.12, 0.06], [0.028, 0.14, 0.028], [-1.2, 0, -1.0 * sx]);
  }
  for (let i = 0; i < 3; i++) mk(G.cone, M.horn, head, [0, 0.19 - i * 0.015, -0.02 - i * 0.09], [0.03, 0.12 + i * 0.02, 0.03], [-1.0 - i * 0.2, 0, 0]);

  d.anim = { ry: 0 };
  poseDragon(d, {}, 0);
  return d;
}

// ---------- posing ----------
// a: { run, phase, headYaw, beam, charge, tk, atk:{step,k}|null, rewrite, hurt, kneel, spin, lean, ride }
export function poseDragon(d, a, t) {
  const run = a.run || 0, ph = a.phase || 0, s = Math.sin(ph), c = Math.cos(ph);
  const beam = a.beam || 0, charge = a.charge || 0, tk = a.tk || 0, rw = a.rewrite || 0, kneel = a.kneel || 0, hurt = a.hurt || 0;
  const breathe = Math.sin(t * 1.7);
  let spineY = s * 0.14 * run, spineX = 0.1 * run + hurt * -0.25, bodyY = 1.38 + Math.abs(c) * 0.07 * run - 0.04 * run - kneel * 0.45;
  // legs
  const stride = 0.72 * run;
  let hipL = -s * stride, hipR = s * stride;
  let kneeL = Math.max(0, Math.sin(ph + 1.1)) * 1.0 * run, kneeR = Math.max(0, Math.sin(ph + 1.1 + Math.PI)) * 1.0 * run;
  if (kneel) { hipL = lerp(hipL, -1.3, kneel); kneeL = lerp(kneeL, 1.5, kneel); hipR = lerp(hipR, 0.25, kneel); kneeR = lerp(kneeR, 1.35, kneel); spineX += 0.25 * kneel; }
  // arms: rest pose slightly flared, the way he stands in the hangar
  const L = { sx: 0.12 + s * 0.5 * run, sz: 0.2 + breathe * 0.01, sy: 0, ex: -0.22 - 0.25 * run, ez: 0 };
  const Rt = { sx: 0.12 - s * 0.5 * run, sz: -0.2 - breathe * 0.01, sy: 0, ex: -0.22 - 0.25 * run, ez: 0 };
  const mix = (o, k, v) => { for (const key in v) o[key] = lerp(o[key], v[key], k); };
  // LANCE: one finger forward, the other hand folded behind his back
  if (beam > 0) { mix(Rt, beam, { sx: -1.5, sz: 0.1, ex: -0.06 }); mix(L, beam, { sx: 0.5, sz: 0.0, ex: -0.3, ez: -1.25 }); spineY += -0.22 * beam; }
  // BURST: left palm raised, gathering
  if (charge > 0) { mix(L, charge, { sx: -2.3, sz: 0.5, ex: -0.5 }); mix(Rt, charge, { sx: 0.3, sz: -0.3, ex: -0.5 }); spineX -= 0.1 * charge; }
  // GRIP: left hand out, fingers spread
  if (tk > 0) { mix(L, tk, { sx: -1.25, sz: 0.35, ex: -0.4 }); }
  // REWRITE: arms open, rising
  if (rw > 0) { mix(L, rw, { sx: -0.5, sz: 1.0, ex: -0.3 }); mix(Rt, rw, { sx: -0.5, sz: -1.0, ex: -0.3 }); spineX -= 0.12 * rw; bodyY += rw * 0.5; hipL = lerp(hipL, 0.1, rw); hipR = lerp(hipR, -0.15, rw); kneeL = lerp(kneeL, 0.3, rw); kneeR = lerp(kneeR, 0.5, rw); }
  // CLAWS and TAIL
  let spin = a.spin || 0, tailStraight = 0;
  if (a.atk) {
    const k = a.atk.k, e = smooth(clamp(k * 1.6, 0, 1)), out = 1 - smooth(clamp((k - 0.7) / 0.3, 0, 1));
    if (a.atk.step === 0) { spineY += lerp(-0.75, 0.85, e) * out; mix(Rt, out, { sx: -1.35, sz: lerp(-1.1, 0.7, e), ex: -0.35 }); mix(L, out * 0.6, { sx: 0.5, sz: 0.4, ex: -0.9 }); spineX += 0.18 * out; }
    else if (a.atk.step === 1) { spineY += lerp(0.75, -0.85, e) * out; mix(L, out, { sx: -1.35, sz: lerp(1.1, -0.7, e), ex: -0.35 }); mix(Rt, out * 0.6, { sx: 0.5, sz: -0.4, ex: -0.9 }); spineX += 0.18 * out; }
    else { spin += smooth(clamp(k * 1.25, 0, 1)) * Math.PI * 2; tailStraight = out; mix(L, out, { sx: 0.2, sz: 0.7, ex: -1.1 }); mix(Rt, out, { sx: 0.2, sz: -0.7, ex: -1.1 }); spineX += 0.22 * out; bodyY -= 0.12 * out; }
  }
  d.body.position.y = bodyY + (a.float || 0);
  d.body.rotation.set(0, spin, 0);
  d.spine.rotation.set(spineX, spineY, 0);
  d.chest.rotation.set(-spineX * 0.3 + breathe * 0.012, spineY * 0.4, 0);
  d.chest.scale.setScalar(1 + breathe * 0.008);
  d.legL.hip.rotation.x = hipL; d.legR.hip.rotation.x = hipR;
  d.legL.knee.rotation.x = kneeL; d.legR.knee.rotation.x = kneeR;
  d.legL.foot.rotation.x = -(hipL + kneeL) * 0.6; d.legR.foot.rotation.x = -(hipR + kneeR) * 0.6;
  d.armL.sh.rotation.set(L.sx, L.sy, L.sz); d.armL.el.rotation.set(L.ex, 0, L.ez);
  d.armR.sh.rotation.set(Rt.sx, Rt.sy, Rt.sz); d.armR.el.rotation.set(Rt.ex, 0, -Rt.ez);
  // fingers: spread for grip, a single pointing claw for the lance
  for (let f = 0; f < 4; f++) {
    d.armR.fingers[f].rotation.x = beam > 0.3 && f !== 2 ? 1.5 : 0.25;
    d.armL.fingers[f].rotation.x = tk > 0.3 || charge > 0.3 ? -0.15 : 0.25;
  }
  // head follows where he is aiming
  const hy = clamp(a.headYaw || 0, -1.1, 1.1);
  d.neck.rotation.set(0.2 - spineX * 0.5, hy * 0.45 - spineY * 0.6, 0);
  d.head.rotation.set(-0.1 + (a.headPitch || 0) - rw * 0.25, hy * 0.55, 0);
  // tail: hangs to the ground at rest, streams out when running, whips level in the sweep
  const n = d.tail.length;
  d.tailRoot.rotation.set(0, -spin * 0 - spineY * 0.5, 0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const rest = i < 7 ? [-1.15, 0.1, 0.15, 0.25, 0.3, 0.22, 0.1][i] : 0.004;
    const runUp = i < 7 ? [-0.55, 0.1, 0.1, 0.08, 0.06, 0.04, 0.02][i] : -0.015;
    let rx = lerp(rest, runUp, run);
    let ry = (i > 6 ? lerp(0.24, 0.05, run) : 0.03) + Math.sin(t * 1.3 - i * 0.5) * (0.035 + 0.05 * u) + Math.sin(ph - i * 0.55) * 0.09 * run;
    if (tailStraight) { rx = lerp(rx, i === 0 ? -0.2 : 0.02, tailStraight); ry = lerp(ry, 0.03, tailStraight); }
    if (rw) { rx = lerp(rx, i === 0 ? -0.6 : 0.09, rw); }
    if (kneel) { rx = lerp(rx, i === 0 ? -0.5 : (i < 4 ? 0.14 : 0.02), kneel); }
    d.tail[i].rotation.set(rx, ry, 0);
  }
}
