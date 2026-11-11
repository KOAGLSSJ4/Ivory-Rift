// fx.js — everything that glows, bursts, streaks or warns. Pooled; driven by events from the simulation.
import { G } from './sim.js';
import { P } from './world.js';
import { clamp, lerp, rand, damp, TAU } from './util.js';
import { buildDragon, poseDragon } from './dragon.js';
const T = window.THREE;

let scene, R;
const AMBER = [1.0, 0.62, 0.2], AMBER_HOT = [1.0, 0.86, 0.6], VIOLET = [0.62, 0.42, 1.0], DANGER = [1.0, 0.22, 0.38];
const hdr = (c, k) => new T.Color(c[0] * k, c[1] * k, c[2] * k);
const addMat = (c, k, op = 1) => new T.MeshBasicMaterial({ color: hdr(c, k), transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide });

// ---------- particles ----------
class Parts {
  constructor(max, additive) {
    this.max = max; this.n = 0; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3)); g.setAttribute('pcol', new T.BufferAttribute(this.col, 4)); g.setAttribute('psize', new T.BufferAttribute(this.size, 1));
    g.boundingSphere = new T.Sphere(new T.Vector3(65, 0, 48), 500);
    this.mat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uPersp: { value: 1 }, uHard: { value: 0 } },
      vertexShader: `attribute vec4 pcol; attribute float psize; varying vec4 vCol; uniform float uScale, uPersp;
        void main(){ vCol = pcol; vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = psize * uScale * mix(1.0, 1.0 / max(0.1, -mv.z), uPersp); }`,
      fragmentShader: `varying vec4 vCol; uniform float uHard;
        void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = mix(smoothstep(1., 0., d), step(d, .85), uHard); a *= vCol.a; if (a < .004) discard;
          gl_FragColor = vec4(vCol.rgb ${additive ? '* a' : ''}, a); }`,
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, fog: false,
    });
    this.points = new T.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 20 : 10;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c, k = 1, a = 1, grav = 0, drag = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.grav[i] = grav; this.drag[i] = drag; this.a0[i] = a;
    this.col[i * 4] = c[0] * k; this.col[i * 4 + 1] = c[1] * k; this.col[i * 4 + 2] = c[2] * k; this.col[i * 4 + 3] = a;
  }
  update(dt) {
    const { pos, vel, life, maxLife, size, s0, s1, grav, drag, col, a0 } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
      life[i] -= dt; const u = 1 - Math.max(0, life[i]) / maxLife[i];
      vel[i * 3 + 1] -= grav[i] * dt; if (drag[i]) { const f = Math.exp(-drag[i] * dt); vel[i * 3] *= f; vel[i * 3 + 1] *= f; vel[i * 3 + 2] *= f; }
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (grav[i] > 0 && pos[i * 3 + 1] < 0.03) { pos[i * 3 + 1] = 0.03; vel[i * 3 + 1] *= -0.35; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; }
      size[i] = life[i] > 0 ? lerp(s0[i], s1[i], u) : 0; col[i * 4 + 3] = a0[i] * (1 - u * u);
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.pcol.needsUpdate = true; g.attributes.psize.needsUpdate = true;
  }
}
let glow, dust;

// ---------- pooled transient meshes ----------
const pool = [];   // {mesh, t, dur, update(u, mesh)}
function transient(mesh, dur, update) { mesh.visible = true; pool.push({ mesh, t: 0, dur, update }); scene.add(mesh); return mesh; }
const GEO = {};
const lights = [];
function flashLight(x, y, z, col, intensity, distance, dur) {
  let L = lights.find((l) => l.t >= l.dur); if (!L) { if (lights.length >= 2) return; L = { light: new T.PointLight(0xffffff, 0, 10, 2), t: 0, dur: 0 }; scene.add(L.light); lights.push(L); }
  L.light.color.setRGB(col[0], col[1], col[2]); L.light.position.set(x, y, z); L.light.distance = distance; L.i0 = intensity; L.t = 0; L.dur = dur; L.light.intensity = intensity;
}
function ring(x, y, z, r0, r1, dur, col, k = 3, width = 1) {
  const m = new T.Mesh(GEO.ring, addMat(col, k)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
  transient(m, dur, (u) => { const r = lerp(r0, r1, 1 - Math.pow(1 - u, 2.2)); m.scale.set(r, r, 1); m.material.opacity = (1 - u) * (1 - u); });
}
function sphereFlash(x, y, z, r, dur, col, k) {
  const m = new T.Mesh(GEO.sph, addMat(col, k)); m.position.set(x, y, z);
  transient(m, dur, (u) => { const s = r * (0.25 + 0.75 * (1 - Math.pow(1 - u, 3))); m.scale.setScalar(s); m.material.opacity = Math.pow(1 - u, 2); });
}
function sparks(x, y, z, n, col, speed = 8, k = 4, size = 0.16) {
  for (let i = 0; i < n; i++) { const a = rand(TAU), e = rand(-0.3, 1.2), s = rand(0.3, 1) * speed; glow.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, rand(0.25, 0.6), size, 0.02, col, k, 1, 14, 1.5); }
}
function smoke(x, y, z, n, col = [0.35, 0.3, 0.26], size = 1.2, up = 1.5, a = 0.35) {
  for (let i = 0; i < n; i++) dust.emit(x + rand(-0.4, 0.4), y + rand(0.3), z + rand(-0.4, 0.4), rand(-1.5, 1.5), rand(0.3, 1) * up, rand(-1.5, 1.5), rand(0.7, 1.5), size * 0.5, size * 1.6, col, 1, a, -0.4, 1.4);
}

// ---------- persistent pieces ----------
let beamCore, beamGlow, beamLight, muzzle, tipFlare, aura, chargeOrb, chargeLight, reticle, reticleIn, tkLine;
let teleLines = [], teleCircles = [], teleRings = [], teleFill = [];
const ghosts = [];
let column, columnCore, gate, gateDisc, gateLight, wellLight, fireLights = [];
export const state = { beamOn: false, charging: false, ghostsOn: true };

export function init(sc, Rref) {
  scene = sc; R = Rref;
  glow = new Parts(2600, true); dust = new Parts(900, false); scene.add(glow.points, dust.points);
  GEO.ring = new T.RingGeometry(0.9, 1, 56); GEO.disc = new T.CircleGeometry(1, 40); GEO.sph = new T.SphereGeometry(1, 20, 14);
  GEO.cyl = new T.CylinderGeometry(1, 1, 1, 10, 1, true); GEO.cyl.rotateX(Math.PI / 2);
  GEO.quad = new T.PlaneGeometry(1, 1); GEO.quad.rotateX(-Math.PI / 2);
  beamCore = new T.Mesh(GEO.cyl, addMat(AMBER_HOT, 7)); beamGlow = new T.Mesh(GEO.cyl, addMat(AMBER, 1.6, 0.5));
  tipFlare = new T.Mesh(GEO.sph, addMat(AMBER_HOT, 10)); muzzle = new T.Mesh(GEO.sph, addMat(AMBER_HOT, 12));
  beamLight = new T.PointLight(0xffb040, 0, 16, 2);
  aura = new T.Mesh(GEO.sph, addMat(AMBER, 1.3, 0.35)); chargeOrb = new T.Mesh(GEO.sph, addMat(AMBER_HOT, 9)); chargeLight = beamLight;
  reticle = new T.Mesh(new T.RingGeometry(0.42, 0.5, 40), addMat(AMBER_HOT, 1.6, 0.8)); reticle.rotation.x = -Math.PI / 2;
  reticleIn = new T.Mesh(new T.CircleGeometry(0.09, 16), addMat(AMBER_HOT, 2.2, 0.9)); reticleIn.rotation.x = -Math.PI / 2;
  for (const m of [beamCore, beamGlow, tipFlare, muzzle, aura, chargeOrb, reticle, reticleIn]) { m.visible = false; m.renderOrder = 30; m.frustumCulled = false; scene.add(m); }
  scene.add(beamLight);
  for (let i = 0; i < 10; i++) { const m = new T.Mesh(GEO.quad, addMat(DANGER, 1.6, 0.4)); m.visible = false; m.renderOrder = 5; scene.add(m); teleLines.push(m); }
  for (let i = 0; i < 14; i++) {
    const m = new T.Mesh(GEO.ring, addMat(DANGER, 2.6, 0.9)); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 6; scene.add(m); teleCircles.push(m);
    const f = new T.Mesh(GEO.disc, addMat(DANGER, 1.2, 0.3)); f.rotation.x = -Math.PI / 2; f.visible = false; f.renderOrder = 5; scene.add(f); teleFill.push(f);
  }
  for (let i = 0; i < 3; i++) { const m = new T.Mesh(new T.RingGeometry(0.93, 1, 96), addMat(DANGER, 5, 0.95)); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 6; scene.add(m); teleRings.push(m); }
  const gm = new T.MeshBasicMaterial({ color: hdr(AMBER_HOT, 1.5), transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, fog: false });
  for (let i = 0; i < 3; i++) { const d = buildDragon(gm.clone()); d.root.visible = false; scene.add(d.root); ghosts.push({ d, t: 1, dur: 0.4 }); }
  // the Tithe-Well and the gate it hangs from
  column = new T.Mesh(new T.CylinderGeometry(2.2, 2.6, 90, 24, 1, true), addMat(VIOLET, 1.1, 0.5)); column.position.set(P.well.x, 45, P.well.z);
  columnCore = new T.Mesh(new T.CylinderGeometry(0.5, 0.7, 90, 12, 1, true), addMat(VIOLET, 5, 0.9)); columnCore.position.copy(column.position);
  gate = new T.Mesh(new T.TorusGeometry(26, 0.9, 10, 80), addMat(VIOLET, 5, 1)); gate.rotation.x = Math.PI / 2; gate.position.set(P.well.x, 86, P.well.z);
  gateDisc = new T.Mesh(new T.CircleGeometry(26, 60), new T.MeshBasicMaterial({ color: 0x05020c, fog: false, side: T.DoubleSide, transparent: true, opacity: 0.95 })); gateDisc.rotation.x = Math.PI / 2; gateDisc.position.copy(gate.position);
  wellLight = new T.PointLight(0x9a6bff, 0, 40, 1.6); wellLight.position.set(P.well.x, 3.5, P.well.z);
  for (const m of [column, columnCore, gate, gateDisc]) { m.visible = false; m.frustumCulled = false; scene.add(m); }
  scene.add(wellLight);
  for (let i = 0; i < 1; i++) { const l = new T.PointLight(0xff7a2a, 0, 16, 2); scene.add(l); fireLights.push(l); }
}

// ---------- event handling ----------
export function handle(ev) {
  const px = R.style === 'pixel';
  switch (ev.k) {
    case 'spark': sparks(ev.x, ev.y, ev.z, ev.n || 6, ev.col ? colOf(ev.col) : AMBER_HOT, ev.speed || 7); break;
    case 'beamHit': if (ev.wall) { sparks(ev.x, ev.y, ev.z, 2, AMBER_HOT, 9, 5, 0.13); if (Math.random() < 0.3) smoke(ev.x, ev.y, ev.z, 1, [0.3, 0.26, 0.22], 0.6, 1, 0.25); } break;
    case 'hit': { sparks(ev.x, ev.y, ev.z, ev.big ? 16 : 8, ev.crit ? AMBER_HOT : [1, 0.9, 0.8], ev.big ? 11 : 8, 5); sphereFlash(ev.x, ev.y, ev.z, ev.big ? 1.3 : 0.8, 0.14, [1, 0.95, 0.85], ev.crit ? 6 : 3.5); if (ev.crit) ring(ev.x, ev.y, ev.z, 0.3, 2.4, 0.3, AMBER_HOT, 4); break; }
    case 'hurt': sparks(ev.x, ev.y, ev.z, 12, DANGER, 8, 4); R.post.hurt = 1; break;
    case 'block': sparks(ev.x, ev.y, ev.z, 6, VIOLET, 9, 6); sphereFlash(ev.x, ev.y, ev.z, 0.9, 0.12, VIOLET, 4); break;
    case 'shatter': sparks(ev.x, ev.y, ev.z, ev.big ? 60 : 30, VIOLET, 13, 6, 0.22); ring(ev.x, 0.1, ev.z, 0.5, ev.big ? 9 : 5, 0.5, VIOLET, 5); sphereFlash(ev.x, ev.y, ev.z, ev.big ? 4 : 2, 0.3, VIOLET, 5); flashLight(ev.x, 2, ev.z, VIOLET, 200, 20, 0.4); break;
    case 'burst': {
      const r = ev.r, c = ev.col === 'violet' ? VIOLET : AMBER, ch = ev.col === 'violet' ? VIOLET : AMBER_HOT;
      sphereFlash(ev.x, ev.y, ev.z, r * 0.9, 0.32, ch, 9); sphereFlash(ev.x, ev.y, ev.z, r * 0.5, 0.45, [1, 1, 1], 12);
      ring(ev.x, 0.08, ev.z, r * 0.2, r * 1.5, 0.5, c, 5); ring(ev.x, 0.1, ev.z, r * 0.1, r * 1.0, 0.7, ch, 3);
      sparks(ev.x, ev.y, ev.z, 26 + r * 5, ch, 9 + r * 2, 6, 0.2); smoke(ev.x, 0.3, ev.z, 8 + r * 2, [0.32, 0.27, 0.23], 1.2 + r * 0.25, 2.5, 0.4);
      for (let i = 0; i < 12; i++) { const a = rand(TAU), s = rand(3, 7 + r); dust.emit(ev.x, 0.2, ev.z, Math.cos(a) * s, rand(4, 9), Math.sin(a) * s, rand(0.6, 1.1), 0.16, 0.1, [0.25, 0.22, 0.2], 1, 0.9, 20, 0.5); }
      flashLight(ev.x, 2, ev.z, c, 600, r * 6, 0.35); scorch(ev.x, ev.z, r * 0.75);
      break;
    }
    case 'debris': { for (let i = 0; i < (ev.n || 14); i++) { const a = rand(TAU), s = rand(2, 7); dust.emit(ev.x, ev.y, ev.z, Math.cos(a) * s, rand(3, 8), Math.sin(a) * s, rand(0.5, 1), 0.22, 0.14, [0.42, 0.32, 0.22], 1, 1, 22, 0.4); } smoke(ev.x, 0.2, ev.z, 5); break; }
    case 'dust': smoke(ev.x, 0.1, ev.z, ev.n ? 3 : 5, [0.6, 0.54, 0.46], 0.9, 0.8, 0.28); break;
    case 'death': {
      const c = ev.kind === 'tick' ? [1, 0.5, 0.2] : VIOLET, y = (ev.y || 0) + 1.1;
      for (let i = 0; i < (ev.kind === 'tick' ? 8 : 34); i++) { const a = rand(TAU), s = rand(0.5, 4); glow.emit(ev.x + rand(-0.4, 0.4), y + rand(-0.9, 0.9), ev.z + rand(-0.4, 0.4), Math.cos(a) * s, rand(1, 5), Math.sin(a) * s, rand(0.5, 1.2), 0.2, 0.02, c, 4, 1, -3, 1.2); }
      if (ev.kind !== 'tick') { sphereFlash(ev.x, y, ev.z, 1.5, 0.25, VIOLET, 5); ring(ev.x, 0.1, ev.z, 0.3, 3, 0.4, VIOLET, 3); }
      break;
    }
    case 'spawn': { ring(ev.x, 0.1, ev.z, 3, 0.4, 0.6, VIOLET, 4); for (let i = 0; i < 16; i++) glow.emit(ev.x + rand(-1, 1), rand(4, 9), ev.z + rand(-1, 1), 0, -rand(8, 14), 0, 0.6, 0.2, 0.05, VIOLET, 5); flashLight(ev.x, 2, ev.z, VIOLET, 120, 14, 0.5); break; }
    case 'slam': { ring(ev.x, 0.1, ev.z, 0.5, 7, 0.6, VIOLET, 5); sphereFlash(ev.x, 1, ev.z, 3, 0.35, VIOLET, 6); smoke(ev.x, 0.2, ev.z, 10, [0.3, 0.26, 0.3], 1.8, 2.5, 0.45); flashLight(ev.x, 3, ev.z, VIOLET, 400, 26, 0.5); scorch(ev.x, ev.z, 2.4); break; }
    case 'slash': slash(ev); break;
    case 'blink': blinkFx(ev); break;
    case 'blinkV': { ring(ev.x, 0.1, ev.z, 2, 0.2, 0.3, VIOLET, 5); sphereFlash(ev.x, 1.6, ev.z, 1.8, 0.25, VIOLET, 6); sparks(ev.x, 1.6, ev.z, 14, VIOLET, 6); break; }
    case 'grip': ring(ev.x, ev.y, ev.z, 1.6, 0.3, 0.25, AMBER_HOT, 4); break;
    case 'throw': ring(ev.x, ev.y, ev.z, 0.3, 2.2, 0.25, AMBER_HOT, 4); break;
    case 'auditBeam': {
      const dx = ev.x1 - ev.x0, dz = ev.z1 - ev.z0, len = Math.hypot(dx, dz);
      for (const [rad, k, col] of [[0.5, 9, [1, 0.8, 1]], [1.1, 2.5, VIOLET]]) { const m = new T.Mesh(GEO.cyl, addMat(col, k)); m.position.set((ev.x0 + ev.x1) / 2, 1.5, (ev.z0 + ev.z1) / 2); m.rotation.y = Math.atan2(dx, dz); transient(m, 0.38, (u) => { const s = rad * (1 - u * u); m.scale.set(s, s, len); m.material.opacity = 1 - u; }); }
      for (let i = 0; i < 30; i++) { const f = Math.random(); sparks(ev.x0 + dx * f, 1.5, ev.z0 + dz * f, 1, VIOLET, 5, 5); }
      break;
    }
    case 'seal': ring(ev.x, 0.1, ev.z, ev.r, ev.r * 0.2, 0.3, DANGER, 6); for (let i = 0; i < 24; i++) { const a = rand(TAU), d = rand(ev.r); glow.emit(ev.x + Math.cos(a) * d, 0.1, ev.z + Math.sin(a) * d, 0, rand(8, 16), 0, 0.45, 0.24, 0.04, VIOLET, 5); } flashLight(ev.x, 2, ev.z, VIOLET, 240, 14, 0.3); break;
    case 'ringStart': sphereFlash(ev.x, 1.5, ev.z, 3.5, 0.3, VIOLET, 7); break;
    case 'sweep': ring(ev.x, 0.6, ev.z, 0.6, ev.r, 0.28, VIOLET, 7); ring(ev.x, 1.2, ev.z, 0.4, ev.r * 0.9, 0.34, [1, 0.8, 1], 4); break;
    case 'rewriteIn': ring(ev.x, 0.1, ev.z, 0.5, 30, 0.9, [1, 1, 1], 2); break;
    case 'rewriteApply': { ring(ev.x, 0.15, ev.z, 0.5, 60, 1.6, AMBER_HOT, 6); ring(ev.x, 0.15, ev.z, 0.2, 34, 1.1, [1, 1, 1], 5); sphereFlash(ev.x, ev.y, ev.z, 6, 0.6, [1, 0.95, 0.85], 9); for (let i = 0; i < 90; i++) { const a = rand(TAU), s = rand(2, 16); glow.emit(ev.x, ev.y + rand(2), ev.z, Math.cos(a) * s, rand(1, 9), Math.sin(a) * s, rand(0.8, 1.8), 0.3, 0.03, AMBER_HOT, 5, 1, 2, 1.2); } R.post.flash = 1; flashLight(ev.x, 3, ev.z, AMBER_HOT, 900, 50, 0.8); break; }
    case 'unwrite': { ring(ev.x, 0.2, ev.z, 0.5, ev.r, 0.5, [1, 1, 1], 6); for (let i = 0; i < 80; i++) { const a = rand(TAU), d = rand(ev.r); glow.emit(ev.x + Math.cos(a) * d, rand(0.2, 2.4), ev.z + Math.sin(a) * d, rand(-1, 1), rand(2, 7), rand(-1, 1), rand(0.7, 1.6), 0.26, 0.02, [1, 0.96, 0.86], 4, 1, -2, 0.8); } break; }
    case 'pickup': { ring(ev.x, 0.2, ev.z, 0.3, 4, 0.6, AMBER_HOT, 5); for (let i = 0; i < 30; i++) { const a = rand(TAU); glow.emit(ev.x, 1.2, ev.z, Math.cos(a) * 3, rand(2, 7), Math.sin(a) * 3, rand(0.6, 1.2), 0.2, 0.02, AMBER_HOT, 5, 1, 4, 1); } break; }
    case 'bigRing': ring(ev.x, ev.y || 0.2, ev.z, ev.r0 || 1, ev.r1 || 40, ev.dur || 1.2, ev.col === 'violet' ? VIOLET : AMBER_HOT, ev.kk || 6); break;
    case 'skyLance': {   // the Tithe paid: light goes up the column and takes the gate with it
      const m = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 16, 1, true), addMat(AMBER_HOT, 14)); m.position.set(P.well.x, 45, P.well.z);
      transient(m, 2.4, (u) => { const s = 3.5 * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85); m.scale.set(s, 90, s); m.material.opacity = 1; });
      flashLight(P.well.x, 6, P.well.z, AMBER_HOT, 3000, 90, 2.2);
      break;
    }
    case 'gateBreak': { for (let i = 0; i < 260; i++) { const a = rand(TAU), rr = 26 + rand(-2, 2); glow.emit(P.well.x + Math.cos(a) * rr, 86 + rand(-1, 1), P.well.z + Math.sin(a) * rr, Math.cos(a) * rand(4, 30), rand(-14, 6), Math.sin(a) * rand(4, 30), rand(1.5, 3.5), 1.6, 0.1, i % 3 ? AMBER_HOT : VIOLET, 6, 1, 6, 0.3); } R.post.flash = 1; break; }
  }
}
const colOf = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

const scorches = [];
function scorch(x, z, r) {
  let s = scorches.length < 14 ? null : scorches.shift();
  if (!s) { s = new T.Mesh(GEO.disc, new T.MeshBasicMaterial({ color: 0x0c0a09, transparent: true, opacity: 0.5, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.renderOrder = 2; scene.add(s); }
  s.position.set(x, 0.045 + scorches.length * 0.001, z); s.scale.set(r, r, 1); s.material.opacity = 0.55; s.userData.t = 0; scorches.push(s);
}

function slash(ev) {
  const tail = ev.step === 2, r = tail ? 3.9 : 3.0;
  const g = new T.RingGeometry(r * 0.45, r, 28, 1, 0, tail ? TAU : 2.5); g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(g, addMat(tail ? AMBER : [1, 0.95, 0.85], tail ? 4 : 3.2, 0.9));
  m.position.set(ev.x, ev.y + (tail ? 0.7 : 1.5), ev.z);
  const base = ev.yaw - Math.PI / 2, dir = ev.step === 1 ? -1 : 1;
  const dur = tail ? 0.36 : 0.2;
  transient(m, dur, (u) => {
    // ring geometry's arc starts on +x; rotate so it sweeps across the aim direction
    if (tail) { m.rotation.y = -u * TAU; m.material.opacity = (1 - u) * 0.9; m.scale.setScalar(0.7 + u * 0.35); }
    else { m.rotation.y = base + 1.25 + dir * lerp(-1.3, 0.2, u) + (dir < 0 ? 0 : 0); m.material.opacity = Math.sin(Math.min(1, u * 1.2) * Math.PI) * 0.9; m.scale.setScalar(0.85 + u * 0.2); }
  });
  if (tail) for (let i = 0; i < 16; i++) { const a = rand(TAU); dust.emit(ev.x + Math.cos(a) * 2.5, 0.15, ev.z + Math.sin(a) * 2.5, Math.cos(a) * 4, rand(0.5, 2), Math.sin(a) * 4, rand(0.4, 0.8), 0.6, 1.4, [0.6, 0.54, 0.46], 1, 0.25, 0, 2); }
}

function blinkFx(ev) {
  const g = ghosts.find((q) => q.t >= q.dur) || ghosts[0];
  g.t = 0; g.dur = 0.42; g.d.root.scale.setScalar(0.92); g.d.root.position.set(ev.x0, ev.y0, ev.z0); g.d.root.rotation.y = R.dragon.root.rotation.y; g.d.root.visible = state.ghostsOn;
  poseDragon(g.d, R.lastPose || {}, R.t);
  const dx = ev.x1 - ev.x0, dy = ev.y1 - ev.y0, dz = ev.z1 - ev.z0, len = Math.hypot(dx, dy, dz);
  const m = new T.Mesh(GEO.cyl, addMat(AMBER_HOT, 7)); m.position.set((ev.x0 + ev.x1) / 2, (ev.y0 + ev.y1) / 2 + 1.5, (ev.z0 + ev.z1) / 2);
  m.lookAt(ev.x1, ev.y1 + 1.5, ev.z1);
  transient(m, 0.22, (u) => { const s = 0.2 * (1 - u); m.scale.set(s, s * 3, len); m.material.opacity = 1 - u; });
  ring(ev.x0, ev.y0 + 0.1, ev.z0, 1.8, 0.2, 0.25, AMBER_HOT, 4); ring(ev.x1, ev.y1 + 0.1, ev.z1, 0.3, 3.2, 0.35, AMBER_HOT, 6);
  sphereFlash(ev.x1, ev.y1 + 1.5, ev.z1, 2.2, 0.22, AMBER_HOT, 7);
  for (let i = 0; i < 22; i++) { const f = Math.random(); glow.emit(ev.x0 + dx * f + rand(-0.4, 0.4), ev.y0 + dy * f + rand(0.4, 2.6), ev.z0 + dz * f + rand(-0.4, 0.4), rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(0.3, 0.7), 0.18, 0.02, AMBER_HOT, 4); }
  flashLight(ev.x1, ev.y1 + 2, ev.z1, AMBER, 220, 14, 0.3);
}

// ---------- per-frame ----------
const v3 = new T.Vector3();
export function update(dt, rdt) {
  const p = G.player, t = R.t, px = R.style === 'pixel';
  glow.mat.uniforms.uHard.value = dust.mat.uniforms.uHard.value = px ? 1 : 0;
  glow.update(dt); dust.update(dt);
  for (let i = pool.length - 1; i >= 0; i--) { const q = pool[i]; q.t += dt; const u = q.t / q.dur; if (u >= 1) { scene.remove(q.mesh); q.mesh.material.dispose(); if (q.mesh.geometry !== GEO.ring && q.mesh.geometry !== GEO.sph && q.mesh.geometry !== GEO.cyl && q.mesh.geometry !== GEO.disc) q.mesh.geometry.dispose(); pool.splice(i, 1); } else q.update(u, q.mesh); }
  for (const L of lights) { if (L.t < L.dur) { L.t += dt; L.light.intensity = L.i0 * Math.max(0, 1 - L.t / L.dur); } else L.light.intensity = 0; }
  for (const g of ghosts) { if (g.t < g.dur) { g.t += rdt; const u = g.t / g.dur; g.d.root.traverse((o) => { if (o.isMesh) o.material.opacity = 0.5 * (1 - u); }); if (u >= 1) g.d.root.visible = false; } }
  for (const s of scorches) { s.userData.t += dt; if (s.userData.t > 14) s.material.opacity = Math.max(0, s.material.opacity - dt * 0.2); }
  if (!p) return;

  // --- the Lance
  const B = p.beam;
  beamCore.visible = beamGlow.visible = tipFlare.visible = muzzle.visible = B.on;
  if (B.on) {
    const hand = R.handPos('R'), x0 = hand.x, y0 = hand.y, z0 = hand.z, x1 = B.x1, y1 = B.y, z1 = B.z1;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), fl = 1 + Math.sin(t * 90) * 0.12;
    for (const [m, r] of [[beamCore, 0.04], [beamGlow, 0.11]]) { m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.lookAt(x1, y1, z1); m.scale.set(r * fl, r * fl, len); }
    tipFlare.position.set(x1, y1, z1); tipFlare.scale.setScalar((B.hitsWall ? 0.36 : 0.14) * fl); muzzle.position.set(x0, y0, z0); muzzle.scale.setScalar(0.13 * fl);
    beamLight.position.set(x1, y1 + 0.3, z1); beamLight.intensity = 60 * fl; beamLight.distance = 12;
    if (Math.random() < 0.5) glow.emit(lerp(x0, x1, Math.random()), lerp(y0, y1, Math.random()), lerp(z0, z1, Math.random()), rand(-0.6, 0.6), rand(-0.2, 0.8), rand(-0.6, 0.6), 0.3, 0.1, 0.01, AMBER_HOT, 4);
  } else if (!p.burst.charging) beamLight.intensity = 0;

  // --- the Burst gathering in his palm
  const c = p.burst.charging ? p.burst.c : 0;
  chargeOrb.visible = p.burst.charging;
  if (p.burst.charging) {
    const h = R.handPos('L'); chargeOrb.position.set(h.x, h.y + 0.25, h.z); chargeOrb.scale.setScalar(0.12 + c * 0.42 + Math.sin(t * 50) * 0.02);
    chargeLight.position.copy(chargeOrb.position); chargeLight.intensity = 30 + c * 160;
    for (let i = 0; i < 2; i++) { const a = rand(TAU), e = rand(-1, 1), d = 1.6 + c; glow.emit(h.x + Math.cos(a) * d, h.y + 0.25 + e * d * 0.6, h.z + Math.sin(a) * d, -Math.cos(a) * d * 4, -e * d * 2.4, -Math.sin(a) * d * 4, 0.24, 0.12, 0.02, AMBER_HOT, 4); }
  }

  // --- the Grip: an aura on what he holds, a thread of light to his hand
  const h = p.tk.ent; aura.visible = !!h;
  if (h) {
    aura.position.set(h.x, h.y + (h.kind === 'npc' ? 0.9 : 0.6), h.z); aura.scale.setScalar((h.r + 0.55) * (1 + Math.sin(t * 9) * 0.05)); aura.material.opacity = 0.2 + Math.sin(t * 7) * 0.06;
    const hp = R.handPos('L');
    for (let i = 0; i < 3; i++) { const f = Math.random(); glow.emit(lerp(hp.x, h.x, f), lerp(hp.y, h.y + 0.6, f) + Math.sin(f * Math.PI) * 0.6, lerp(hp.z, h.z, f), rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), 0.22, 0.1, 0.01, AMBER_HOT, 3.5); }
  }

  // --- aim reticle on the ground (or roof) he is pointing at
  const showR = G.mode === 'play' && !p.locked && !G.input.touch && !p.dead;
  reticle.visible = reticleIn.visible = showR;
  if (showR) { const y = (G.aim.y || 0) + 0.07; reticle.position.set(G.aim.x, y, G.aim.z); reticleIn.position.set(G.aim.x, y, G.aim.z); const s = 1 + Math.sin(t * 5) * 0.06; reticle.scale.set(s, s, 1); reticle.material.opacity = G.rewrite.active ? 0.95 : 0.6; }

  // --- attack tells
  let li = 0, ci = 0, ri = 0;
  for (const tl of G.tele) {
    const u = clamp(tl.t / tl.dur, 0, 1);
    if (tl.type === 'line' && li < teleLines.length) {
      const m = teleLines[li++], dx = tl.x1 - tl.x0, dz = tl.z1 - tl.z0, len = Math.hypot(dx, dz);
      m.visible = true; m.position.set((tl.x0 + tl.x1) / 2, 0.09, (tl.z0 + tl.z1) / 2); m.rotation.y = Math.atan2(dx, dz); m.scale.set(tl.w * 2 * (0.5 + u * 0.5), 1, len); m.material.opacity = 0.25 + u * 0.6;
    } else if (tl.type === 'circle' && ci < teleCircles.length) {
      const m = teleCircles[ci], f = teleFill[ci++]; m.visible = f.visible = true; m.position.set(tl.x, 0.1, tl.z); m.scale.set(tl.r, tl.r, 1); f.position.set(tl.x, 0.09, tl.z); f.scale.set(tl.r * u, tl.r * u, 1); f.material.opacity = 0.2 + u * 0.3;
    } else if (tl.type === 'ring' && ri < teleRings.length) { const m = teleRings[ri++]; m.visible = true; m.position.set(tl.x, 0.5, tl.z); m.scale.set(tl.r, tl.r, 1); }
  }
  for (; li < teleLines.length; li++) teleLines[li].visible = false;
  for (; ci < teleCircles.length; ci++) { teleCircles[ci].visible = false; teleFill[ci].visible = false; }
  for (; ri < teleRings.length; ri++) teleRings[ri].visible = false;

  // --- stake wards: a thread from each stake to what it shields
  for (const e of G.ents) {
    if (e.dead) continue;
    if (e.warded && e.wardBy && Math.random() < 0.5) { const s = e.wardBy, f = Math.random(); glow.emit(lerp(s.x, e.x, f), lerp(2.4, 1.3, f), lerp(s.z, e.z, f), 0, 0.4, 0, 0.3, 0.14, 0.02, VIOLET, 4); }
    if (e.kind === 'boss' && e.warded) for (const s of G.ents) if (s.kind === 'stake' && s.bossStake && !s.dead && !s.inert && Math.random() < 0.6) { const f = Math.random(); glow.emit(lerp(s.x, e.x, f), lerp(2.4, 2, f) + Math.sin(f * 3.14) * 1.5, lerp(s.z, e.z, f), 0, 0.3, 0, 0.35, 0.2, 0.02, VIOLET, 5); }
    if (e.kind === 'bolt' && Math.random() < 0.7) glow.emit(e.x, e.y, e.z, 0, 0, 0, 0.18, 0.2, 0.02, e.mine ? AMBER_HOT : VIOLET, 4);
    if (e.kind === 'orb') glow.emit(e.x + rand(-0.2, 0.2), e.y + rand(-0.2, 0.2), e.z + rand(-0.2, 0.2), 0, 0, 0, 0.3, 0.4, 0.04, AMBER_HOT, 4);
    if (e.thrown > 0 && Math.random() < 0.8) glow.emit(e.x, e.y + 0.5, e.z, 0, 0, 0, 0.25, 0.3, 0.03, AMBER, 2.5);
    if (e.spawnT > 0) glow.emit(e.x + rand(-0.5, 0.5), rand(0, 2.4), e.z + rand(-0.5, 0.5), 0, rand(1, 4), 0, 0.3, 0.16, 0.02, VIOLET, 5);
    if (e.kind === 'crest' && Math.random() < 0.5) glow.emit(e.x + rand(-0.3, 0.3), e.y + rand(-0.2, 0.4), e.z + rand(-0.3, 0.3), 0, rand(0.8, 2), 0, 0.6, 0.16, 0.02, AMBER_HOT, 5);
  }

  // --- set pieces driven by story flags
  const F = G.flags, tithe = F.tithe || 0, paid = F.paid || 0;
  const vis = tithe > 0.01;
  column.visible = columnCore.visible = vis; gate.visible = gateDisc.visible = (F.gate || 0) > 0.01;
  if (vis) {
    const col = paid > 0 ? [lerp(VIOLET[0], AMBER_HOT[0], paid), lerp(VIOLET[1], AMBER_HOT[1], paid), lerp(VIOLET[2], AMBER_HOT[2], paid)] : VIOLET;
    column.material.color.setRGB(col[0] * 1.1, col[1] * 1.1, col[2] * 1.1); columnCore.material.color.setRGB(col[0] * 5, col[1] * 5, col[2] * 5);
    column.material.opacity = 0.34 * tithe * (0.9 + Math.sin(t * 3) * 0.1); columnCore.material.opacity = 0.8 * tithe;
    const sw = 1 + Math.sin(t * 2.3) * 0.06 + (F.hunger || 0) * 0.5; column.scale.set(sw, 1, sw); columnCore.scale.set(sw, 1, sw);
    wellLight.intensity = 45 * tithe; wellLight.color.setRGB(col[0], col[1], col[2]);
    for (let i = 0; i < 3; i++) { const a = rand(TAU), rr = rand(2, 9 + (F.hunger || 0) * 6); glow.emit(P.well.x + Math.cos(a) * rr, rand(0.1, 0.4), P.well.z + Math.sin(a) * rr, -Math.cos(a) * rr * 0.9 - Math.sin(a) * 2, rand(2, 7), -Math.sin(a) * rr * 0.9 + Math.cos(a) * 2, rand(0.7, 1.2), 0.2, 0.03, col, 4 * tithe, 1, -4, 0.2); }
  } else wellLight.intensity = 0;
  if (gate.visible) { const gk = F.gate; gate.material.opacity = gk; gateDisc.material.opacity = 0.93 * gk; gate.rotation.z = t * 0.1; const gy = 86 - (F.descend || 0) * 44; gate.position.y = gateDisc.position.y = gy; const gs = 1 - (F.descend || 0) * 0.45; gate.scale.setScalar(gs); gateDisc.scale.setScalar(gs); }
  if (F.wellFlow) { for (let i = 0; i < 3; i++) { const a = rand(TAU); glow.emit(P.well.x + Math.cos(a) * 0.4, 1.1, P.well.z + Math.sin(a) * 0.4, Math.cos(a) * rand(0.6, 2.2), rand(3, 6.5) * (F.wellFlow > 1 ? 1.8 : 1), Math.sin(a) * rand(0.6, 2.2), rand(0.6, 1), 0.2, 0.08, [0.5, 0.8, 1], 1.6, 0.9, 12, 0.2); } }
  let fi = 0;
  for (const f of F.fires || []) {
    for (let i = 0; i < 3; i++) glow.emit(f.x + rand(-f.r, f.r), 0.2 + rand(0.6), f.z + rand(-f.r, f.r), rand(-0.5, 0.5), rand(2.5, 6), rand(-0.5, 0.5), rand(0.4, 0.9), 0.7, 0.1, [1, rand(0.3, 0.6), 0.1], 4, 1, -2, 0.5);
    if (Math.random() < 0.4) dust.emit(f.x + rand(-f.r, f.r), 2, f.z + rand(-f.r, f.r), rand(-0.6, 0.6), rand(2, 4), rand(-0.6, 0.6), rand(1.5, 2.6), 1.2, 3.4, [0.12, 0.11, 0.1], 1, 0.4, -0.5, 0.3);
    if (fi < 1) { const l = fireLights[fi++]; l.position.set(f.x, 2, f.z); l.intensity = 130 + Math.sin(t * 17) * 40 + Math.sin(t * 31) * 25; }
  }
  for (; fi < 1; fi++) fireLights[fi].intensity = 0;
  // --- motes in the air: gold dust in the morning, embers under the gate
  const cx = R.focus.x, cz = R.focus.z;
  if (Math.random() < (px ? 0.25 : 0.7)) {
    if ((F.gate || 0) > 0.3 && !paid) glow.emit(cx + rand(-22, 22), rand(0, 9), cz + rand(-16, 12), rand(-0.6, 0.6), rand(0.4, 1.6), rand(-0.6, 0.6), rand(2, 4), 0.1, 0.02, Math.random() < 0.5 ? VIOLET : [1, 0.5, 0.25], 3, 0.9, 0, 0);
    else glow.emit(cx + rand(-20, 20), rand(0.3, 6), cz + rand(-14, 10), rand(-0.3, 0.3) + 0.3, rand(-0.1, 0.2), rand(-0.3, 0.3), rand(2.5, 5), 0.07, 0.05, [1, 0.85, 0.6], 0.9, 0.7, 0, 0);
  }
  if (G.rewrite.active || p.rewritePose) for (let i = 0; i < 2; i++) { const a = rand(TAU), d = rand(0.6, 2.2); glow.emit(p.x + Math.cos(a) * d, p.y + 0.1, p.z + Math.sin(a) * d, 0, rand(1.5, 4), 0, rand(0.5, 1), 0.16, 0.02, [1, 0.95, 0.85], 4, 1, 0, 0); }
}

export function setScale(persp, scale) { for (const s of [glow, dust]) { s.mat.uniforms.uPersp.value = persp ? 1 : 0; s.mat.uniforms.uScale.value = scale; } }
export function clear() { for (const s of [glow, dust]) { s.life.fill(0); } for (const q of pool) { scene.remove(q.mesh); } pool.length = 0; for (const s of scorches) s.material.opacity = 0; }
