// actors.js — entity and structure views built from the GLB pack. Returns null when a model is missing, so the procedural version is used.
import { A, has, fitted, mixerFor, playClip, bone, inst } from './assets.js';
import { clamp } from './util.js';
const T = window.THREE;

const NPC = { pip: ['Pip', 1.3], mara: ['Mara', 1.68], tobe: ['Tobe', 1.84], t4: ['ChildTownsperson', 1.12], t0: ['Townsperson', 1.74, 0xd8e2c8], t1: ['Townsperson', 1.66, 0xe8c8d8], t2: ['Townsperson', 1.8, 0xf0dcae], t3: ['Townsperson', 1.7, 0xbcdce0] };
const PROP = {   // kind: [model, fit, extra]
  crate: ['Crate', { h: 1 }], drum: ['OilDrum', { h: 1.2 }], engine: ['EngineBlock', { h: 0.95 }], girder: ['SteelGirder', { w: 4.6, ry: Math.PI / 2 }], panel: ['AircraftPanel', { w: 3.4 }],
  pod: ['ShelterPod', { h: 2.3 }], shield: ['TowerShield', { d: 2.05, rx: -Math.PI / 2 }], tick: ['ScrapTick', { w: 0.9 }], drone: ['SeekerDrone', { w: 1.05, centre: true }],
  stake: ['WardStake', { h: 4.3 }], crest: ['MandateCrest', { h: 1.25, centre: true }], page: ['LostPage', { w: 0.6, rx: Math.PI / 2 }], nest: ['TickNest', { w: 3.3 }],
};
function tint(root, hex) { const c = new T.Color(hex); root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(c); o.userData.m0 = o.material; } }); }
function attach(root, model, opt, ...bones) { const b = bone(root, ...bones); if (!b) return null; const w = inst(model); if (!w) return null; const k = 1 / (root.parent ? root.parent.scale.y : 1); w.scale.setScalar(k * (opt.s || 1)); if (opt.r) w.rotation.set(...opt.r); if (opt.p) w.position.set(...opt.p); b.add(w); return w; }

export function modelView(e) {
  let g = null, name = null; const v = { g: new T.Group(), kind: e.kind, model: true, lt: 0 };
  if (e.kind === 'npc') { const d = NPC[e.look] || NPC.t0; name = d[0]; g = fitted(name, { h: d[1] }); if (g && d[2]) tint(g, d[2]); }
  else if (e.kind === 'tally' || e.kind === 'lancer') { name = 'Soldier'; g = fitted(name, { h: e.kind === 'tally' ? 1.98 : 1.9 }); if (g) v.weapon = attach(g.userData.inner, e.kind === 'tally' ? 'Blade' : 'Lance', { s: 1.25 }, 'GripR', 'Grip.R', 'HandR'); }
  else if (e.kind === 'bailiff') { name = 'Bailiff'; g = fitted(name, { h: 2.65 }); if (g) v.shield = attach(g.userData.inner, 'TowerShield', { s: 1.1, p: [0, 0.1, 0.25] }, 'HandL', 'ForearmL'); }
  else if (e.kind === 'boss') {
    name = 'Vasht'; g = fitted(name, { h: 3.5 });
    if (g) { v.ward = new T.Mesh(new T.SphereGeometry(2.2, 20, 14), new T.MeshBasicMaterial({ color: 0x9a6bff, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, fog: false })); v.ward.position.y = 1.9; v.ward.visible = false; v.g.add(v.ward); v.focus = bone(g.userData.inner, 'Focus'); }
  } else if (PROP[e.kind]) { name = PROP[e.kind][0]; g = fitted(name, PROP[e.kind][1]); }
  if (!g) return null;
  v.g.add(g); v.body = g; v.name = name; v.an = mixerFor(name, g.userData.inner);
  if (e.kind === 'stake') { v.band = bone(g, 'Ward_band', 'Ward band'); v.crown = bone(g, 'Crown'); }
  if (e.kind === 'page') g.position.y = 1.2;
  v.g.traverse((o) => { if (o.isMesh && !o.userData.m0) o.userData.m0 = o.material; });
  return v;
}

const NPC_CLIP = { idle: 'Idle', talk: 'Talk', cower: 'Cower', cheer: 'Cheer', pinned: 'Pinned', carried: 'Carried', held: 'Carried', sit: 'Sit', wave: 'Wave', kneel: 'Cower', stagger: 'Cower' };
const SOL_CLIP = { idle: 'Idle', windup: 'Windup', strike: 'Lunge', aim: 'Aim', stagger: 'Stagger', held: 'Held' };
const BAI_CLIP = { idle: 'Idle', windup: 'Windup', strike: 'Charge', stagger: 'Stagger', held: 'Stagger' };
const BOSS_CLIP = { idle: 'Hover', cast: 'Cast', aim: 'Aim', sweep: 'Sweep', stagger: 'Stagger', kneel: 'Kneel' };
export function poseModel(v, e, t) {
  const dt = clamp(t - (v.lt || t), 0, 0.12); v.lt = t; const an = v.an, act = e.act || 'idle', moving = (e.runAmt || 0) > 0.25;
  switch (e.kind) {
    case 'npc': { let c = NPC_CLIP[act] || 'Idle'; if (act === 'idle' && moving) c = an && an.act.Run ? 'Run' : 'Walk'; if (an && !an.act[c]) c = c === 'Sit' || c === 'Wave' ? 'Idle' : an.act.Cower && (c === 'Carried' || c === 'Pinned') ? 'Cower' : 'Idle'; playClip(an, c, 0.2, c === 'Run' ? 1.15 : 1); break; }
    case 'tally': case 'lancer': { let c = SOL_CLIP[act] || 'Idle'; if (e.thrown > 0) c = 'Held'; else if (act === 'idle' && moving) c = 'Run'; playClip(an, c, 0.12); break; }
    case 'bailiff': { let c = BAI_CLIP[act] || 'Idle'; if (act === 'idle' && moving) c = 'Walk'; playClip(an, c, 0.15); if (v.shield) v.shield.visible = e.shield > 0; break; }
    case 'boss': {
      playClip(an, BOSS_CLIP[act] || 'Hover', 0.25);
      v.body.position.y = act === 'kneel' ? 0 : 0.35 + Math.sin(t * 1.8) * 0.12 + (e.rise || 0);
      v.ward.visible = !!e.warded; v.ward.material.opacity = 0.13 + Math.sin(t * 5) * 0.04; if (v.focus) v.focus.visible = !e.noCrest;
      break;
    }
    case 'tick': playClip(an, 'Scuttle', 0.1, 0.4 + (e.runAmt || 0) * 1.6); break;
    case 'drone': playClip(an, 'Spin', 0.1, e.arm > 0 ? 4 : 1); break;
    case 'stake': if (v.band) v.band.visible = !e.inert; if (v.crown) v.crown.visible = !e.inert; break;
    case 'crest': v.body.rotation.y = t * 1.4; break;
    case 'page': v.body.rotation.y = t * 1.5; v.body.position.y = 1.2 + Math.sin(t * 2) * 0.12; break;
  }
  if (an) an.mixer.update(dt);
}

// ---- structures. Returns true when the model version was built into g.
const fade = (root) => { const parts = []; root.traverse((o) => { if (o.isMesh) parts.push(o); }); return parts; };
function put(g, name, x0, z0, x1, z1, h, ry = 0, y = 0) { const m = fitted(name, { box: [x1 - x0, h, z1 - z0], ry }); if (!m) return null; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); g.add(m); return m; }
function at(g, name, x, z, fit, yaw = 0) { const m = fitted(name, fit); if (!m) return null; m.position.set(x, 0, z); m.rotation.y = yaw; g.add(m); return m; }
export function structModel(g, s) {
  switch (s.kind) {
    case 'hangar': {
      const m = put(g, 'HangarNine', s.x0, s.z0, s.x1, s.z1, s.h + 3.2, Math.PI / 2); if (!m) return false;
      const parts = []; m.updateMatrixWorld(true); const b = new T.Box3(), c = new T.Vector3();
      m.traverse((o) => { if (!o.isMesh) return; b.setFromObject(o); b.getCenter(c); let roof = false; for (let n = o; n && n !== m; n = n.parent) if (/roof/i.test(n.name)) roof = true; if (roof || c.y > s.h - 0.6 || (c.z > s.z1 - 1.6 && b.max.z - b.min.z < 3)) parts.push(o); });
      g.userData.occ = { type: 'inside', x0: s.x0, z0: s.z0 - 7, x1: s.x1, z1: s.z1, parts, min: 0.0 };
      return true;
    }
    case 'shed': { const m = put(g, 'WorkshopShed', s.x0 - 0.4, s.z0 - 0.4, s.x1 + 0.4, s.z1 + 0.4, s.h + 0.3); if (!m) return false; const parts = []; m.updateMatrixWorld(true); const b = new T.Box3(); m.traverse((o) => { if (o.isMesh) { b.setFromObject(o); if (b.min.y > s.h - 1.2 || b.max.x - b.min.x > 8 || b.max.z - b.min.z > 8) parts.push(o); } }); g.userData.occ = { type: 'under', x0: s.x0, z0: s.z0 - 3.5, x1: s.x1, z1: s.z1, parts, min: 0.12 }; return true; }
    case 'watertower': { const piv = new T.Group(); piv.position.set(s.x, 0, s.z); const m = fitted('WaterTower', { h: 10.6 }); if (!m) return false; piv.add(m); g.add(piv); g.userData.name = 'tower'; g.userData.pivot = piv; g.userData.occ = { type: 'behind', x0: s.x - 3, z0: s.z - 9, x1: s.x + 3, z1: s.z + 2, parts: fade(m), min: 0.25 }; return true; }
    case 'house': { const m = put(g, s.c % 2 ? 'HouseB' : 'HouseA', s.x0, s.z0, s.x1, s.z1, s.h + 0.2); if (!m) return false; g.userData.occ = { type: 'behind', x0: s.x0 - 0.3, z0: s.z0 - s.h * 1.05, x1: s.x1 + 0.3, z1: s.z1 - 0.5, parts: fade(m), min: 0.22 }; return true; }
    case 'ctower': { const m = put(g, 'ControlTower', s.x0 - 0.6, s.z0 - 0.6, s.x1 + 0.6, s.z1 + 0.6, s.h); if (!m) return false; g.userData.occ = { type: 'behind', x0: s.x0 - 1, z0: s.z0 - s.h, x1: s.x1 + 1, z1: s.z1 - 0.5, parts: fade(m), min: 0.22 }; return true; }
    case 'stall': { const m = put(g, 'MarketStall', s.x0 - 0.2, s.z0 - 0.3, s.x1 + 0.2, s.z1 + 0.3, 2.9); if (!m) return false; g.userData.occ = { type: 'behind', x0: s.x0, z0: s.z0 - 2.4, x1: s.x1, z1: s.z1, parts: fade(m), min: 0.3 }; return true; }
    case 'well': return !!at(g, 'Well', s.x, s.z, { w: 4.0 });
    case 'lamp': return !!at(g, 'StreetLamp', s.x, s.z, { h: 5.2 }, (s.x * 7) % 6.28);
    case 'container': { const n = Math.round(s.h / 2.6), long = s.x1 - s.x0 > s.z1 - s.z0, parts = []; for (let i = 0; i < n; i++) { const m = put(g, 'ShippingContainer', s.x0, s.z0, s.x1, s.z1, 2.6, long ? 0 : Math.PI / 2, i * 2.6); if (!m) return false; parts.push(...fade(m)); } g.userData.occ = { type: 'behind', x0: s.x0 - 0.2, z0: s.z0 - s.h * 1.05, x1: s.x1 + 0.2, z1: s.z1 - 0.4, parts, min: 0.22 }; return true; }
    case 'fuselage': return !!put(g, 'WreckedFuselage', s.x0, s.z0 - 0.4, s.x1, s.z1 + 0.4, 3.6);
    case 'heap': return !!at(g, 'ScrapHeap', s.x, s.z, { w: s.r * 2.3 }, s.x);
    case 'crater': return !!at(g, 'GlassCrater', s.x, s.z, { w: s.r * 2.1 });
    case 'wreckpod': return !!put(g, 'CrashedPod', s.x0, s.z0, s.x1, s.z1, 2.6, 0.5);
    case 'tree': { const d = at(g, 'DeadTree', s.x, s.z, { h: 4.8 }), b = at(g, 'BlossomingTree', s.x, s.z, { h: 5 }); if (!d || !b) return false; b.visible = false; g.userData.name = 'tree'; g.userData.bloom = b; g.userData.dead = d; return true; }
    case 'spinner': return !!at(g, 'WindSpinner', s.x, s.z, { h: 9 }, s.x);
    case 'truck': return !!put(g, 'FlatbedTruck', s.x0, s.z0, s.x1, s.z1, 2.3, -Math.PI / 2);
    case 'bridge': return !!put(g, 'CanalBridge', s.x0, s.z0, s.x1, s.z1, 1.25, s.ry || 0, -0.12);
  }
  return false;
}
export { has };
