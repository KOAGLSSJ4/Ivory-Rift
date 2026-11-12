// assets.js — loads the GLB pack once; hands out fitted instances. Anything that fails to load falls back to the procedural model.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skinClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
const T = window.THREE;
export const A = {};   // name -> { scene, clips, skinned }
export const NAMES = ['IvoryDragon', 'Pip', 'Mara', 'Tobe', 'Townsperson', 'ChildTownsperson', 'Soldier', 'Bailiff', 'Vasht', 'Blade', 'Lance', 'TowerShield',
  'HangarNine', 'WorkshopShed', 'WaterTower', 'Well', 'HouseA', 'HouseB', 'ControlTower', 'MarketStall', 'StreetLamp', 'ShippingContainer', 'WreckedFuselage', 'ScrapHeap',
  'GlassCrater', 'CrashedPod', 'DeadTree', 'BlossomingTree', 'CanalBridge', 'WindSpinner', 'FlatbedTruck', 'EngineBlock', 'Crate', 'OilDrum', 'SteelGirder', 'AircraftPanel',
  'ShelterPod', 'ScrapTick', 'SeekerDrone', 'WardStake', 'MandateCrest', 'LostPage', 'TickNest'];

export async function loadAll(onProgress) {
  const loader = new GLTFLoader(); let done = 0;
  const one = async (name) => {
    try {
      let buf, res = await fetch(`assets/${name}.glb`).catch(() => null);
      if (res && res.ok) buf = await res.arrayBuffer();
      else {   // hosts that only serve text: the same file, base64-encoded
        res = await fetch(`assets/${name}.glb.txt`); if (!res.ok) throw new Error(res.status);
        buf = await (await fetch('data:application/octet-stream;base64,' + (await res.text()).trim())).arrayBuffer();
      }
      const gltf = await new Promise((ok, bad) => loader.parse(buf, '', ok, bad));
      let skinned = false;
      gltf.scene.traverse((o) => { if (o.isSkinnedMesh) skinned = true; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; const m = o.material; if (m.map) m.map.anisotropy = 4; m.envMapIntensity = 0.7; } });
      A[name] = { scene: gltf.scene, clips: gltf.animations, skinned };
    } catch (e) { console.warn('asset not loaded:', name, e && e.message); }
    done++; if (onProgress) onProgress(done / NAMES.length);
  };
  const queue = NAMES.slice(); const workers = [];
  for (let i = 0; i < 5; i++) workers.push((async () => { while (queue.length) await one(queue.shift()); })());
  await Promise.all(workers);
}
export const has = (n) => !!A[n];
export function inst(name) { const a = A[name]; if (!a) return null; const s = a.skinned ? skinClone(a.scene) : a.scene.clone(true); s.traverse((o) => { if (o.isMesh) o.userData.m0 = o.material; }); return s; }
const box = new T.Box3(), size = new T.Vector3(), ctr = new T.Vector3();
// wrap an instance in a group, scaled and placed so it stands on y=0 centred on the origin.
// o: { h } uniform to height, { w } to width, { d } to depth, { box:[w,h,d] } stretched to fit, { centre:true } centre vertically too, { ry } pre-rotation
export function fitted(name, o = {}) {
  const s = inst(name); if (!s) return null;
  const g = new T.Group(), pivot = new T.Group(); pivot.add(s); g.add(pivot);
  if (o.ry) s.rotation.y = o.ry; if (o.rx) s.rotation.x = o.rx;
  pivot.updateMatrixWorld(true); box.setFromObject(pivot); box.getSize(size); box.getCenter(ctr);
  let sx, sy, sz;
  if (o.box) { sx = o.box[0] / size.x; sy = o.box[1] / size.y; sz = o.box[2] / size.z; }
  else { const k = o.h ? o.h / size.y : o.w ? o.w / size.x : o.d ? o.d / size.z : 1; sx = sy = sz = k; }
  pivot.scale.set(sx, sy, sz);
  pivot.position.set(-ctr.x * sx, o.centre ? -ctr.y * sy : -box.min.y * sy, -ctr.z * sz);
  g.userData.inner = s; g.userData.pivot = pivot; g.userData.k = sy;
  return g;
}
export function mixerFor(name, root) {
  const a = A[name]; if (!a || !a.clips.length) return null;
  const mixer = new T.AnimationMixer(root), act = {};
  for (const c of a.clips) act[c.name] = mixer.clipAction(c);
  return { mixer, act, cur: null };
}
const ONCE = new Set(['Windup', 'Lunge', 'Charge', 'Kneel', 'Sit', 'Stagger', 'Sweep', 'Cast', 'Aim', 'Pinned', 'ClawR', 'ClawL', 'TailSpin', 'Hit', 'AimHold']);
export function playClip(an, name, fade = 0.16, speed = 1) {
  if (!an) return; const a = an.act[name]; if (!a) return;
  a.timeScale = speed;
  if (an.cur === a) return;
  a.reset(); if (ONCE.has(name)) { a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; }
  a.play(); if (an.cur) a.crossFadeFrom(an.cur, fade, false); an.cur = a; an.name = name;
}
export function bone(root, ...names) { let f = null; root.traverse((o) => { if (!f && names.includes(o.name)) f = o; }); return f; }
