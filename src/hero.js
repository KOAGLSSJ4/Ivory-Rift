// hero.js — Vellum's real body: the rigged IvoryDragon.glb, driven by the same simulation state as before.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clamp, damp } from './util.js';
const T = window.THREE;
export const HERO = { ready: false, scene: null, mixer: null, act: {}, bones: {}, mesh: null, scale: 1.2, w: { idle: 1, walk: 0, cast: 0 }, castOn: false };

export function loadHero(parent, onReady) {
  const el = document.getElementById('glb'); if (!el) return;
  let buf;
  try { const bin = atob(el.textContent.trim()); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); buf = u8.buffer; } catch (e) { console.warn('hero model missing', e); return; }
  new GLTFLoader().parse(buf, '', (gltf) => {
    const s = gltf.scene; s.scale.setScalar(HERO.scale);
    s.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.m0 = o.material; o.material.envMapIntensity = 0.7; HERO.mesh = o; if (o.material.map) o.material.map.anisotropy = 8; }
      if (o.isBone) HERO.bones[o.name.replace('.', '')] = o;     // three strips dots from node names: Hand.R → HandR
    });
    HERO.scene = s; HERO.mixer = new T.AnimationMixer(s);
    for (const clip of gltf.animations) { const a = HERO.mixer.clipAction(clip); HERO.act[clip.name] = a; a.play(); a.setEffectiveWeight(clip.name === 'Idle' ? 1 : 0); }
    if (HERO.act.Cast) { HERO.act.Cast.setLoop(T.LoopOnce, 1); HERO.act.Cast.clampWhenFinished = true; }
    parent.add(s); HERO.ready = true; if (onReady) onReady();
  }, (e) => console.warn('hero model failed to load', e));
}

const q = new T.Quaternion(), ax = new T.Vector3(0, 1, 0);
// p: player state; dt: animation time step; spin: tail-sweep rotation
export function poseHero(p, dt, t) {
  if (!HERO.ready) return;
  const A = HERO.act, w = HERO.w, a = p.a;
  const casting = Math.max(a.beam, a.charge, a.tk, a.rewrite) > 0.25;
  w.walk = damp(w.walk, clamp(a.run * 1.3, 0, 1), 12, dt); w.cast = damp(w.cast, casting ? 1 : 0, casting ? 16 : 7, dt);
  if (casting && !HERO.castOn) { A.Cast.reset(); A.Cast.play(); }
  HERO.castOn = casting;
  const loco = 1 - w.cast * 0.85;
  A.Idle.setEffectiveWeight((1 - w.walk) * loco); A.Walk.setEffectiveWeight(w.walk * loco); A.Cast.setEffectiveWeight(w.cast);
  A.Walk.timeScale = 0.6 + a.run * 1.5;
  HERO.mixer.update(dt);
  // layered on top of the clips: claw twists, the tail sweep, flinch, kneel, floating while rewriting
  const s = HERO.scene, B = HERO.bones; let spin = 0, twist = 0, lean = 0, drop = a.kneel * 0.75;
  const at = p.atk;
  if (at.step >= 0) {
    const k = clamp(at.t / at.dur, 0, 1), e = k < 0.5 ? k * 2 : 1, out = 1 - clamp((k - 0.7) / 0.3, 0, 1);
    if (at.step === 0) { twist = (-0.9 + e * 1.9) * out; lean = 0.3 * out; }
    else if (at.step === 1) { twist = (0.9 - e * 1.9) * out; lean = 0.3 * out; }
    else { spin = clamp(k * 1.25, 0, 1) * Math.PI * 2; lean = 0.2 * out; drop += 0.12 * out; }
  }
  s.rotation.y = spin; s.position.y = -drop * HERO.scale + a.rewrite * 0.5;
  s.rotation.x = a.kneel * 0.35 - a.hurt * 0.12;
  if (B.Chest) { q.setFromAxisAngle(ax, twist + a.headYaw * 0.25); B.Chest.quaternion.multiply(q); B.Chest.rotateX(lean); }
  if (B.Head) { q.setFromAxisAngle(ax, clamp(a.headYaw, -1, 1) * 0.5); B.Head.quaternion.multiply(q); }
  if (at.step >= 0 && at.step < 2) { const arm = at.step === 0 ? B.ArmR : B.ArmL, k = clamp(at.t / at.dur, 0, 1), sw = Math.sin(Math.min(1, k * 1.4) * Math.PI); if (arm) arm.rotateX(-1.5 * sw); }
  if (HERO.mesh) HERO.mesh.material.color.setScalar(p.powerless ? 0.55 : 1);
}
const hv = new T.Vector3();
export function heroHand(side) { const b = HERO.bones[side === 'R' ? 'HandR' : 'HandL']; if (!b) return null; b.getWorldPosition(hv); return hv; }
