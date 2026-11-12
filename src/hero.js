// hero.js — Vellum's body: the rigged IvoryDragon.glb and its clips, driven by the simulation state.
import { A, mixerFor } from './assets.js';
import { clamp, damp } from './util.js';
const T = window.THREE;
export const HERO = { ready: false, scene: null, an: null, bones: {}, mesh: null, eyes: null, scale: 1.2, cur: '', lock: 0 };

export function loadHero(parent) {
  const a = A.IvoryDragon; if (!a) return false;
  const s = a.scene; s.scale.setScalar(HERO.scale);
  s.traverse((o) => {
    if (o.isMesh) { o.userData.m0 = o.material; HERO.mesh = o; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (/eye/i.test(m.name)) HERO.eyes = m; }
    if (o.isBone) HERO.bones[o.name.replace('.', '')] = o;
  });
  HERO.scene = s; HERO.an = mixerFor('IvoryDragon', s); parent.add(s); HERO.ready = true;
  for (const n of ['Idle', 'Walk']) { HERO.an.act[n].play(); HERO.an.act[n].setEffectiveWeight(n === 'Idle' ? 1 : 0); }
  for (const n of ['Cast', 'ClawR', 'ClawL', 'TailSpin', 'Hit', 'Kneel', 'AimHold']) { const c = HERO.an.act[n]; if (c) { c.setLoop(T.LoopOnce, 1); c.clampWhenFinished = true; } }
  return true;
}
// one overlay clip at a time sits on top of Idle/Walk
function overlay(name, fade = 0.1) {
  const H = HERO, act = H.an.act; if (H.cur === name) return;
  if (H.cur && act[H.cur]) act[H.cur].fadeOut(name ? fade : 0.22);
  if (name && act[name]) { act[name].reset().setEffectiveWeight(1).fadeIn(fade).play(); }
  H.cur = name;
}
const q = new T.Quaternion(), ax = new T.Vector3(0, 1, 0);
let lastStep = -1, wWalk = 0, wOver = 0;
export function poseHero(p, dt, t) {
  if (!HERO.ready) return;
  const act = HERO.an.act, a = p.a, at = p.atk;
  let want = '';
  if (p.dead || p.kneel) want = 'Kneel';
  else if (at.step >= 0) want = ['ClawR', 'ClawL', 'TailSpin'][at.step];
  else if (p.hurtT > 0.12) want = 'Hit';
  else if (p.beam.on) want = 'AimHold';
  else if (p.burst.charging || p.burst.anim > 0 || p.tk.ent || a.rewrite > 0.3) want = 'Cast';
  if (want && !act[want]) want = act.Cast ? 'Cast' : '';
  if (at.step >= 0 && at.step !== lastStep && HERO.cur === want) HERO.cur = '';     // restart the clip on a repeated strike
  lastStep = at.step;
  overlay(want, want === 'Kneel' ? 0.4 : 0.08);
  if (want && act[want] && at.step >= 0) act[want].timeScale = act[want].getClip().duration / Math.max(0.2, at.dur);
  wWalk = damp(wWalk, clamp(a.run * 1.3, 0, 1), 12, dt); wOver = damp(wOver, want ? 1 : 0, 14, dt);
  const loco = 1 - wOver * 0.9;
  act.Idle.setEffectiveWeight((1 - wWalk) * loco); act.Walk.setEffectiveWeight(wWalk * loco); act.Walk.timeScale = 0.6 + a.run * 1.5;
  if (HERO.headBase) HERO.bones.Head.quaternion.copy(HERO.headBase);     // undo last frame's look twist before the clips write
  HERO.an.mixer.update(dt);
  const s = HERO.scene, B = HERO.bones;
  if (B.Head) (HERO.headBase || (HERO.headBase = new T.Quaternion())).copy(B.Head.quaternion);
  s.position.y = a.rewrite * 0.5;
  if (B.Head && !want) { q.setFromAxisAngle(ax, clamp(a.headYaw, -1, 1) * 0.5); B.Head.quaternion.multiply(q); }
  if (HERO.mesh) for (const m of Array.isArray(HERO.mesh.material) ? HERO.mesh.material : [HERO.mesh.material]) if (m !== HERO.eyes && m.color) m.color.setScalar(p.powerless ? 0.5 : 0.8);
  if (HERO.eyes) { HERO.eyes.emissive.setHex(p.powerless ? 0x555555 : 0xffa21a); HERO.eyes.emissiveIntensity = p.powerless ? 0.2 : 3 + a.rewrite * 12 + a.beam * 3 + Math.sin(t * 3) * 0.4; }
}
const hv = new T.Vector3();
export function heroHand(side) { const b = HERO.bones[side === 'R' ? 'HandR' : 'HandL']; if (!b) return null; b.getWorldPosition(hv); return hv; }
