// render.js — one scene, two lenses.
//   'real'  : perspective camera, soft shadows, HDR bloom, filmic grade.
//   'pixel' : the same world through an oblique low-resolution camera, palette-quantised with dark outlines,
//             so ground tiles land square at 16px like a handheld RPG.
import { G } from './sim.js';
import { W, structs, platforms, P } from './world.js';
import { M, TX, initMaterials } from './mats.js';
import { buildDragon, poseDragon } from './dragon.js';
import { buildStruct, buildEntity, poseEntity, setFlash } from './models.js';
import * as FX from './fx.js';
import { HERO, loadHero, poseHero, heroHand } from './hero.js';
import { BAKED } from './assets.js';
import { clamp, lerp, damp, dampAng, smooth, rand, TAU } from './util.js';
const T = window.THREE;

export const R = {
  style: 'real', renderer: null, scene: null, cam: null, pcam: null, ocam: null, w: 1, h: 1, t: 0,
  views: new Map(), dragon: null, occ: [], named: {}, spinners: [], focus: new T.Vector3(20, 0, 44), zoom: 0.8,
  camPos: new T.Vector3(30, 12, 60), camLook: new T.Vector3(20, 1, 44), fov: 38, post: { flash: 0, hurt: 0, desat: 0, fade: 0 },
  quality: 1, lastPose: null, shakeV: new T.Vector3(), lowW: 480, lowH: 270, pxScale: 3, stepT: 0, ready: false, frameMs: 16,
};

// ---------------- moods: light, sky and grade for each beat of the chapter ----------------
const MOODS = {
  morning: { sun: [0.62, 0.42, -0.45], sunCol: 0xffe6c8, sunI: 2.5, skyCol: 0xc4d0e0, gndCol: 0xa09080, hemiI: 1.45, fog: 0xcfb08e, fogD: 0.0021, top: 0x4f7fb4, hor: 0xf6cfa0, exp: 1.0, bloom: 0.30, tint: [1.020, 1.000, 0.972], sat: 1.06, shafts: 1 },
  noon:    { sun: [0.45, 0.7, -0.35], sunCol: 0xfff0dc, sunI: 3.1, skyCol: 0xa9c4e4, gndCol: 0x6f5f48, hemiI: 0.85, fog: 0xdccdb4, fogD: 0.0021, top: 0x4a84c4, hor: 0xe8dcc4, exp: 1.0, bloom: 0.27, tint: [1.008, 1.000, 0.988], sat: 1.08, shafts: 0.5 },
  tithe:   { sun: [0.5, 0.5, -0.4], sunCol: 0xe9e0ff, sunI: 2.3, skyCol: 0x8d86ad, gndCol: 0x2a2030, hemiI: 0.8, fog: 0x36294f, fogD: 0.0019, top: 0x0e0820, hor: 0x644688, exp: 1.0, bloom: 0.33, tint: [0.992, 0.988, 1.016], sat: 1.0, shafts: 0 },
  boss:    { sun: [0.3, 0.55, -0.5], sunCol: 0xe4daff, sunI: 2.2, skyCol: 0x857ea8, gndCol: 0x221a28, hemiI: 0.75, fog: 0x2a1f40, fogD: 0.0021, top: 0x090514, hor: 0x52386f, exp: 1.0, bloom: 0.36, tint: [0.992, 0.988, 1.016], sat: 1.0, shafts: 0 },
  dusk:    { sun: [-0.7, 0.24, -0.3], sunCol: 0xff9a5a, sunI: 2.0, skyCol: 0x5a4a88, gndCol: 0x3a2a2a, hemiI: 0.9, fog: 0x4a3050, fogD: 0.0042, top: 0x120a26, hor: 0xb8603f, exp: 1.05, bloom: 0.54, tint: [1.016, 0.980, 1.008], sat: 1.02, shafts: 0 },
  gold:    { sun: [0.55, 0.36, -0.5], sunCol: 0xffe2a8, sunI: 3.6, skyCol: 0xb8cce6, gndCol: 0x806a48, hemiI: 0.95, fog: 0xf2d6a0, fogD: 0.0023, top: 0x5a90c8, hor: 0xffe4b0, exp: 1.08, bloom: 0.48, tint: [1.028, 1.008, 0.968], sat: 1.12, shafts: 1 },
  grey:    { sun: [0.4, 0.5, -0.5], sunCol: 0xe6e2dc, sunI: 2.0, skyCol: 0x9aa6b4, gndCol: 0x6a6660, hemiI: 1.2, fog: 0xb4b8bc, fogD: 0.0031, top: 0x7888a0, hor: 0xc8ccd0, exp: 0.98, bloom: 0.21, tint: [0.992, 1.000, 1.012], sat: 0.7, shafts: 0.3 },
  empty:   { sun: [0.4, 0.5, -0.5], sunCol: 0xc8c4d8, sunI: 1.4, skyCol: 0x6a6a80, gndCol: 0x3a3a40, hemiI: 0.9, fog: 0x6a6a78, fogD: 0.0049, top: 0x30303c, hor: 0x80808c, exp: 0.95, bloom: 0.18, tint: [0.984, 0.992, 1.020], sat: 0.25, shafts: 0 },
};
const WHITE = new T.Color(0xffffff), GREY = new T.Color(0x77706a);
const cur = {}; let moodTo = MOODS.morning, moodFrom = null, moodT = 1, moodDur = 1, envDirty = true, envTimer = 0;
const C = (hex) => new T.Color(hex);
function moodLerp(a, b, t) {
  for (const k of ['sunI', 'hemiI', 'fogD', 'exp', 'bloom', 'sat', 'shafts']) cur[k] = lerp(a[k], b[k], t);
  for (const k of ['sunCol', 'skyCol', 'gndCol', 'fog', 'top', 'hor']) { cur[k] = cur[k] || new T.Color(); cur[k].copy(C(a[k])).lerp(C(b[k]), t); }
  cur.sun = [0, 1, 2].map((i) => lerp(a.sun[i], b.sun[i], t)); cur.tint = [0, 1, 2].map((i) => lerp(a.tint[i], b.tint[i], t));
}
export function setMood(name, secs = 2) { const m = MOODS[name]; if (!m || m === moodTo) return; moodFrom = { ...cur, sunCol: cur.sunCol.getHex(), skyCol: cur.skyCol.getHex(), gndCol: cur.gndCol.getHex(), fog: cur.fog.getHex(), top: cur.top.getHex(), hor: cur.hor.getHex(), sun: cur.sun.slice(), tint: cur.tint.slice() }; moodTo = m; moodT = 0; moodDur = Math.max(0.01, secs); R.moodName = name; }

let sun, hemi, sky, skyMat, pmrem, envScene, envSky, rim;
let rtScene, rtLow, bloomRT = [], matBright, matDown, matUp, matFinal, matPixel, fsScene, fsCam, fsMesh;

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const SKY_FRAG = `varying vec3 vDir; uniform vec3 top, hor, sunDir, sunCol; uniform float glow;
  void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, -0.2, 1.);
    vec3 c = mix(hor, top, pow(clamp(h * 1.25, 0., 1.), 0.55)); c = mix(c, hor * 0.82, clamp(-h * 5., 0., 1.));
    float s = max(dot(d, normalize(sunDir)), 0.); c += sunCol * (pow(s, 240.) * 26. + pow(s, 9.) * 0.6 + pow(s, 2.5) * 0.16) * glow;
    gl_FragColor = vec4(c, 1.); }`;
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`;

export function init(canvas) {
  initMaterials();
  const r = (R.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }));
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.toneMapping = T.NoToneMapping; r.outputColorSpace = T.LinearSRGBColorSpace;
  r.setClearColor(0x000000, 1); r.info.autoReset = true;
  const sc = (R.scene = new T.Scene());
  moodLerp(MOODS.morning, MOODS.morning, 1); R.moodName = 'morning';
  sc.fog = new T.FogExp2(cur.fog.getHex(), cur.fogD);
  R.pcam = new T.PerspectiveCamera(38, 1, 0.5, 700); R.ocam = new T.OrthographicCamera(-10, 10, 10, -10, 1, 400); R.cam = R.pcam;

  sun = new T.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc2 = sun.shadow.camera; sc2.left = -42; sc2.right = 42; sc2.top = 42; sc2.bottom = -42; sc2.near = 1; sc2.far = 220;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  sc.add(sun, sun.target);
  hemi = new T.HemisphereLight(0xffffff, 0x444444, 1); sc.add(hemi);
  rim = new T.DirectionalLight(0x9fc0ff, 0.5); rim.position.set(-0.5, 0.6, 0.8); sc.add(rim);

  skyMat = new T.ShaderMaterial({ uniforms: { top: { value: new T.Color() }, hor: { value: new T.Color() }, sunDir: { value: new T.Vector3() }, sunCol: { value: new T.Color() }, glow: { value: 1 } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: T.BackSide, depthWrite: false, fog: false });
  sky = new T.Mesh(new T.SphereGeometry(300, 24, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; sc.add(sky);
  pmrem = new T.PMREMGenerator(r); envScene = new T.Scene(); envSky = new T.Mesh(new T.SphereGeometry(50, 24, 16), skyMat); envScene.add(envSky);

  buildWorld(sc);
  R.dragon = buildDragon(); sc.add(R.dragon.root);
  R.dragon.root.traverse((o) => { if (o.isMesh) o.userData.m0 = o.material; });
  if (loadHero(R.dragon.root)) R.dragon.body.visible = false;
  FX.init(sc, R);

  // ---- post-processing chain
  fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1); fsScene = new T.Scene();
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  fsMesh = new T.Mesh(g, null); fsMesh.frustumCulled = false; fsScene.add(fsMesh);
  const SM = (frag, uniforms) => new T.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  matBright = SM(`varying vec2 vUv; uniform sampler2D tex; uniform vec2 px; uniform float thr;
    void main(){ vec3 c = (texture2D(tex, vUv + px * vec2(-.5,-.5)).rgb + texture2D(tex, vUv + px * vec2(.5,-.5)).rgb + texture2D(tex, vUv + px * vec2(-.5,.5)).rgb + texture2D(tex, vUv + px * vec2(.5,.5)).rgb) * .25;
      c = min(c, vec3(40.)); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thr, thr + 0.9, l), 1.); }`, { tex: { value: null }, px: { value: new T.Vector2() }, thr: { value: 1.25 } });
  matDown = SM(`varying vec2 vUv; uniform sampler2D tex; uniform vec2 px;
    void main(){ vec3 c = texture2D(tex, vUv).rgb * 4.; c += texture2D(tex, vUv + px * vec2(-1.,-1.)).rgb + texture2D(tex, vUv + px * vec2(1.,-1.)).rgb + texture2D(tex, vUv + px * vec2(-1.,1.)).rgb + texture2D(tex, vUv + px * vec2(1.,1.)).rgb; gl_FragColor = vec4(c / 8., 1.); }`, { tex: { value: null }, px: { value: new T.Vector2() } });
  matUp = SM(`varying vec2 vUv; uniform sampler2D tex, add; uniform vec2 px;
    void main(){ vec3 c = texture2D(tex, vUv + px * vec2(-1.,0.)).rgb + texture2D(tex, vUv + px * vec2(1.,0.)).rgb + texture2D(tex, vUv + px * vec2(0.,-1.)).rgb + texture2D(tex, vUv + px * vec2(0.,1.)).rgb;
      c = c * 2. + texture2D(tex, vUv + px * vec2(-1.,-1.)).rgb + texture2D(tex, vUv + px * vec2(1.,-1.)).rgb + texture2D(tex, vUv + px * vec2(-1.,1.)).rgb + texture2D(tex, vUv + px * vec2(1.,1.)).rgb;
      gl_FragColor = vec4(c / 12. + texture2D(add, vUv).rgb, 1.); }`, { tex: { value: null }, add: { value: null }, px: { value: new T.Vector2() } });
  const COMMON = `
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
  matFinal = SM(`varying vec2 vUv; uniform sampler2D tex, bloom; uniform float bloomK, exposure, sat, time, desat, flash, hurt, fade, vig; uniform vec3 tint; uniform vec2 res; ${COMMON}
    void main(){ vec2 d = vUv - .5; float r2 = dot(d, d);
      vec2 ca = vec2(0.);
      vec3 c = vec3(texture2D(tex, vUv + ca).r, texture2D(tex, vUv).g, texture2D(tex, vUv - ca).b);
      c += texture2D(bloom, vUv).rgb * bloomK;
      c *= exposure * tint;
      c = aces(c);
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, sat * (1. - desat * 0.86));
      c = mix(c, c * vec3(1.05, 1.0, 0.9) + vec3(.02,.015,0.), desat * 0.5);
      c = mix(c, smoothstep(0., 1., c), 0.12);                       // a touch of contrast
      c *= 1. - r2 * vig;                                           // vignette
      c += vec3(1., .12, .16) * hurt * r2 * 1.6;
      c = toSRGB(c);
      c += (hash(vUv * res + time) - .5) * 0.008;                   // grain
      c = mix(c, vec3(1., .97, .9), flash);
      c *= 1. - fade;
      gl_FragColor = vec4(c, 1.); }`,
    { tex: { value: null }, bloom: { value: null }, bloomK: { value: 0.6 }, exposure: { value: 1 }, sat: { value: 1 }, time: { value: 0 }, desat: { value: 0 }, flash: { value: 0 }, hurt: { value: 0 }, fade: { value: 0 }, vig: { value: 0.55 }, tint: { value: new T.Vector3(1, 1, 1) }, res: { value: new T.Vector2() } });
  matPixel = SM(`varying vec2 vUv; uniform sampler2D tex, depth; uniform vec2 res; uniform float exposure, sat, desat, flash, hurt, fade, levels; uniform vec3 tint; ${COMMON}
    float bayer(vec2 p){ vec2 q = floor(mod(p, 4.)); float i = q.x + q.y * 4.;
      float m = 0.; if (i < .5) m = 0.; else if (i < 1.5) m = 8.; else if (i < 2.5) m = 2.; else if (i < 3.5) m = 10.; else if (i < 4.5) m = 12.; else if (i < 5.5) m = 4.; else if (i < 6.5) m = 14.; else if (i < 7.5) m = 6.;
      else if (i < 8.5) m = 3.; else if (i < 9.5) m = 11.; else if (i < 10.5) m = 1.; else if (i < 11.5) m = 9.; else if (i < 12.5) m = 15.; else if (i < 13.5) m = 7.; else if (i < 14.5) m = 13.; else m = 5.; return m / 16.; }
    void main(){ vec2 p = floor(vUv * res); vec2 uv = (p + .5) / res; vec2 px = 1. / res;
      vec3 c = texture2D(tex, uv).rgb * exposure * tint;
      c = aces(c * 1.08); float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, sat * 1.12 * (1. - desat * 0.86));
      c = toSRGB(c);
      // outline: darken where a neighbour is much farther away than this pixel
      float d0 = texture2D(depth, uv).r;
      float e = max(max(texture2D(depth, uv + vec2(px.x, 0.)).r, texture2D(depth, uv - vec2(px.x, 0.)).r), max(texture2D(depth, uv + vec2(0., px.y)).r, texture2D(depth, uv - vec2(0., px.y)).r)) - d0;
      float edge = smoothstep(0.004, 0.006, e);
      float lum = dot(c, vec3(.3, .6, .1));
      c = mix(c, c * 0.22, edge * step(0.02, lum) * (1. - smoothstep(1.2, 2.5, max(c.r, max(c.g, c.b)))));
      c = floor(c * levels + 0.5 + (bayer(p) - 0.5) * 0.3) / levels;                    // limited palette with ordered dither
      c += vec3(.35, .02, .04) * hurt * step(.42, length(vUv - .5));
      c = mix(c, vec3(1., .97, .9), flash);
      c *= 1. - fade;
      gl_FragColor = vec4(c, 1.); }`,
    { tex: { value: null }, depth: { value: null }, res: { value: new T.Vector2() }, exposure: { value: 1 }, sat: { value: 1 }, desat: { value: 0 }, flash: { value: 0 }, hurt: { value: 0 }, fade: { value: 0 }, levels: { value: 14 }, tint: { value: new T.Vector3(1, 1, 1) } });
  resize(); R.ready = true;
}

function groundRect(parent, mat, x0, z0, x1, z1, scale) {
  const g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, pos = g.attributes.position, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + cx) / scale, (pos.getZ(i) + cz) / scale);
  const m = new T.Mesh(g, mat); m.position.set(cx, 0, cz); m.receiveShadow = true; parent.add(m); return m;
}
function buildWorld(sc) {
  const world = new T.Group(); sc.add(world);
  // ground, with the canal cut out of it
  const far = 320, cv = structs.find((s) => s.kind === 'canal');
  groundRect(world, M.salt, -far, -far, cv.x0, far, 22); groundRect(world, M.salt, cv.x1, -far, far, far, 22);
  groundRect(world, M.salt, cv.x0, -far, cv.x1, cv.z0, 22); groundRect(world, M.salt, cv.x0, cv.z1, cv.x1, far, 22);
  for (const s of structs) {
    const g = buildStruct(s); world.add(g);
    if (g.userData.occ) { const o = g.userData.occ; for (const m of o.parts) { m.material = m.material.clone(); m.material.transparent = true; } o.a = 1; R.occ.push(o); }
    if (g.userData.name) R.named[g.userData.name] = g;
    if (g.userData.spin) R.spinners.push(g.userData.spin);
    if (g.userData.shafts) R.shafts = g.userData.shafts;
  }
  // far country: mesas on the horizon and the broken ring in the sky
  const r = mulberry(3), mesa = new T.MeshStandardMaterial({ color: 0xb08a66, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + r() * 0.2, d = 170 + r() * 90, w = 20 + r() * 50, h = 8 + r() * 34;
    const m = new T.Mesh(new T.CylinderGeometry(w * 0.72, w, h, 7), mesa); m.position.set(65 + Math.cos(a) * d, h / 2 - 1, 48 + Math.sin(a) * d); m.rotation.y = r() * 3; world.add(m);
  }
  const arc = new T.Mesh(new T.TorusGeometry(260, 1.6, 6, 90, Math.PI * 0.62), new T.MeshBasicMaterial({ color: 0xf2e6d0, fog: false, transparent: true, opacity: 0.55 }));
  arc.position.set(40, -40, -120); arc.rotation.set(0.5, 0.2, 0.55); world.add(arc); R.arc = arc;
  for (let i = 0; i < 9; i++) { const m = new T.Mesh(new T.OctahedronGeometry(1.6 + r() * 2.4, 0), arc.material); const a = Math.PI * (0.64 + i * 0.022); m.position.set(Math.cos(a) * 260 + r() * 8, Math.sin(a) * 260 + r() * 8, r() * 6); arc.add(m); }
}
function mulberry(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function resize() {
  const r = R.renderer, cv = r.domElement, w = Math.max(2, cv.clientWidth), h = Math.max(2, cv.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, R.quality >= 2 ? 2 : R.quality === 1 ? 1.5 : 1) * (R.dynScale || 1);
  R.w = w; R.h = h; r.setPixelRatio(dpr); r.setSize(w, h, false);
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  for (const t of [rtScene, rtLow]) if (t) t.dispose();
  for (const b of bloomRT) { b.d.dispose(); b.u.dispose(); }
  rtScene = new T.WebGLRenderTarget(bw, bh, { type: T.HalfFloatType, samples: R.quality >= 1 ? 4 : 0, depthBuffer: true });
  bloomRT = []; let lw = bw >> 1, lh = bh >> 1;
  for (let i = 0; i < 5; i++) { bloomRT.push({ d: new T.WebGLRenderTarget(Math.max(2, lw), Math.max(2, lh), { type: T.HalfFloatType, depthBuffer: false }), u: new T.WebGLRenderTarget(Math.max(2, lw), Math.max(2, lh), { type: T.HalfFloatType, depthBuffer: false }) }); lw >>= 1; lh >>= 1; }
  // pixel lens: an integer number of screen pixels per low-res pixel
  R.pxScale = Math.max(1, Math.round(bh / 250)); R.lowW = Math.ceil(bw / R.pxScale); R.lowH = Math.ceil(bh / R.pxScale);
  rtLow = new T.WebGLRenderTarget(R.lowW, R.lowH, { type: T.HalfFloatType, depthBuffer: true, minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  rtLow.depthTexture = new T.DepthTexture(R.lowW, R.lowH); rtLow.depthTexture.minFilter = rtLow.depthTexture.magFilter = T.NearestFilter;
  R.pcam.aspect = w / h; R.pcam.updateProjectionMatrix();
  matFinal.uniforms.res.value.set(bw, bh);
  matPixel.uniforms.res.value.set(bw / R.pxScale, bh / R.pxScale);
  R.bw = bw; R.bh = bh;
}

export function setStyle(s) {
  R.style = s; R.cam = s === 'pixel' ? R.ocam : R.pcam;
  const near = s === 'pixel', done = new Set();
  R.scene.traverse((o) => {
    const m = o.material; if (!m) return;
    if (m.isMeshStandardMaterial && m.bumpMap !== undefined) { if (m.userData.bump0 === undefined) m.userData.bump0 = m.bumpScale; m.bumpScale = near ? 0 : m.userData.bump0; }
  });
}

// where the mouse (or touch) is pointing in the world: rooftops first, then the ground
const ray = new T.Raycaster(), ndc = new T.Vector2(), hitV = new T.Vector3(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
export function pickAim(mx, my) {
  ndc.set((mx / R.w) * 2 - 1, -(my / R.h) * 2 + 1); ray.setFromCamera(ndc, R.cam);
  let best = null;
  for (const pl of platforms) {
    plane.constant = -pl.h; if (!ray.ray.intersectPlane(plane, hitV)) continue;
    if (hitV.x >= pl.x0 && hitV.x <= pl.x1 && hitV.z >= pl.z0 && hitV.z <= pl.z1 && (!best || pl.h > best.h)) { best = pl; G.aim.x = hitV.x; G.aim.z = hitV.z; G.aim.y = pl.h; }
  }
  const p = G.player;
  if (best) { G.aim.level = best; return; }
  // otherwise the plane he is standing on, so aiming feels the same on a roof
  const base = p && p.level && G.mode === 'play' ? 0 : 0;
  plane.constant = -base;
  if (ray.ray.intersectPlane(plane, hitV)) { G.aim.x = clamp(hitV.x, -40, W.w + 40); G.aim.z = clamp(hitV.z, -40, W.h + 40); G.aim.y = base; G.aim.level = null; }
}
const sv = new T.Vector3();
export function screenPos(x, y, z) { sv.set(x, y, z).project(R.cam); return { x: (sv.x * 0.5 + 0.5) * R.w, y: (-sv.y * 0.5 + 0.5) * R.h, on: sv.z < 1 && sv.z > -1 && Math.abs(sv.x) < 1.05 && Math.abs(sv.y) < 1.05, behind: sv.z > 1 }; }
const hv = new T.Vector3();
R.handPos = (side) => { const h = HERO.ready && heroHand(side); if (h) return h; const a = side === 'R' ? R.dragon.armR : R.dragon.armL; a.hand.getWorldPosition(hv); hv.y -= 0.12; return hv; };

// ---------------- the frame ----------------
export function frame(dt, rdt) {
  if (!R.ready) return;
  R.t += rdt; const t = R.t, p = G.player, px = R.style === 'pixel';
  // mood
  if (moodT < 1) { moodT = Math.min(1, moodT + rdt / moodDur); moodLerp(moodFrom, moodTo, smooth(moodT)); envDirty = true; }
  const sd = new T.Vector3(cur.sun[0], cur.sun[1], cur.sun[2]).normalize();
  sun.color.copy(cur.sunCol); sun.intensity = px ? 2.0 : cur.sunI; hemi.color.copy(cur.skyCol); hemi.groundColor.copy(cur.gndCol); hemi.intensity = px ? 0.95 : cur.hemiI;
  if (px) { sun.color.lerp(WHITE, 0.8); hemi.color.lerp(WHITE, 0.8); hemi.groundColor.lerp(GREY, 0.8); }
  rim.intensity = px ? 0 : 0.55; rim.color.copy(cur.skyCol);
  R.scene.fog.color.copy(cur.fog); R.scene.fog.density = px ? cur.fogD * 0.25 : cur.fogD;
  skyMat.uniforms.top.value.copy(cur.top); skyMat.uniforms.hor.value.copy(cur.hor); skyMat.uniforms.sunDir.value.copy(sd); skyMat.uniforms.sunCol.value.copy(cur.sunCol);
  envTimer -= rdt;
  if (envDirty && envTimer <= 0) { envDirty = false; envTimer = 0.5; const old = R.scene.environment; skyMat.uniforms.glow.value = 0.35; R.scene.environment = pmrem.fromScene(envScene, 0.03).texture; skyMat.uniforms.glow.value = 1; if (old) old.dispose(); }
  if (R.shafts) for (const m of R.shafts) m.opacity = (px ? 0 : 0.055) * cur.shafts;
  if (R.arc) R.arc.material.opacity = 0.5 * clamp(cur.sunI / 3, 0.2, 1);
  for (const s of R.spinners) s.rotation.z += dt * 1.4;
  { const lvl = clamp((cur.sunI + cur.hemiI * 1.5) / 4.6, 0.35, 1) * (px ? 0.8 : 1); for (const m of BAKED) m.emissiveIntensity = m.userData.baked * lvl; }

  // ---- camera
  const cine = G.cine;
  if (p) {
    const ax = clamp((G.aim.x - p.x) * 0.16, -3.2, 3.2), az = clamp((G.aim.z - p.z) * 0.16, -2.4, 2.4);
    const lead = G.mode === 'play' && !p.locked && !G.input.touch ? 1 : 0;
    const fx = p.x + ax * lead, fz = p.z + az * lead + (px ? 0 : -0.6), fy = p.y;
    if (!cine.active) { R.focus.x = damp(R.focus.x, fx, 7, rdt); R.focus.z = damp(R.focus.z, fz, 7, rdt); R.focus.y = damp(R.focus.y, fy, 4, rdt); }
    else { R.focus.set(cine.lx, 0, cine.lz); }
  }
  if (G.shake > 0) { R.shakeV.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(Math.min(1.2, G.shake) * (px ? 0.25 : 0.5)); G.shake = Math.max(0, G.shake - rdt * 3.2); } else R.shakeV.set(0, 0, 0);
  if (!px) {
    const z = R.zoom, k = cine.active ? cine.k : 9;
    const want = cine.active ? [cine.px, cine.py, cine.pz, cine.lx, cine.ly, cine.lz, cine.fov] : [R.focus.x, R.focus.y + 17.2 * z, R.focus.z + 15.2 * z, R.focus.x, R.focus.y + 1.3, R.focus.z, 38];
    if (cine.cut) { cine.cut = false; R.camPos.set(want[0], want[1], want[2]); R.camLook.set(want[3], want[4], want[5]); R.fov = want[6]; }
    R.camPos.set(damp(R.camPos.x, want[0], k, rdt), damp(R.camPos.y, want[1], k, rdt), damp(R.camPos.z, want[2], k, rdt));
    R.camLook.set(damp(R.camLook.x, want[3], k, rdt), damp(R.camLook.y, want[4], k, rdt), damp(R.camLook.z, want[5], k, rdt));
    R.fov = damp(R.fov, want[6], k, rdt);
    R.pcam.fov = R.fov; R.pcam.updateProjectionMatrix();
    R.pcam.position.copy(R.camPos).add(R.shakeV); R.pcam.lookAt(R.camLook.x + R.shakeV.x * 0.5, R.camLook.y, R.camLook.z);
    FX.setScale(true, R.bh * 0.9);
  } else {
    // oblique lens: pitch 45°, stretched so ground tiles are square and heights read at full scale
    const ppu = 16 * (cine.active && cine.fov < 30 ? 1.5 : 1), hw = R.lowW / ppu / 2, hh = R.lowH / ppu / 2 / Math.SQRT2;
    const snap = 1 / ppu, fx = Math.round((R.focus.x + R.shakeV.x) / snap) * snap, fz = Math.round((R.focus.z + R.shakeV.z) / snap) * snap, fy = Math.round((cine.active ? 0 : R.focus.y) / snap) * snap;
    const o = R.ocam; o.left = -hw; o.right = hw; o.top = hh; o.bottom = -hh; o.near = 1; o.far = 300; o.updateProjectionMatrix();
    o.position.set(fx, fy + 100, fz - (cine.active ? 0 : 1.5) + 100); o.lookAt(fx, fy, fz - (cine.active ? 0 : 1.5));
    FX.setScale(false, R.lowH / (hh * 2) * 0.75);
  }
  const fcx = R.focus.x, fcz = R.focus.z;
  sun.target.position.set(Math.round(fcx), 0, Math.round(fcz - 4)); sun.position.copy(sun.target.position).addScaledVector(sd, 110);
  sky.position.copy(R.cam.position);

  // ---- occluders fade when they would hide him
  const ox = cine.active ? cine.lx : p ? p.x : 0, oz = cine.active ? cine.lz : p ? p.z : 0, onRoof = p && p.level && !cine.active;
  for (const o of R.occ) {
    const inside = ox > o.x0 && ox < o.x1 && oz > o.z0 && oz < o.z1 && !onRoof;
    const target = inside ? o.min : 1; if (Math.abs(o.a - target) < 0.004 && o.applied === target) continue;
    o.a = damp(o.a, target, 9, rdt); if (Math.abs(o.a - target) < 0.004) { o.a = target; o.applied = target; } else o.applied = -1;
    for (const m of o.parts) { m.material.opacity = o.a; m.material.depthWrite = o.a > 0.9; m.visible = o.a > 0.02; m.castShadow = o.a > 0.5 || o.type === 'inside'; }
  }

  // ---- Vellum
  const stepTick = !px || (R.stepT += rdt) > 0.085; if (stepTick) R.stepT = 0;
  if (p) {
    const d = R.dragon; d.root.visible = !p.hidden;
    d.root.position.set(p.x, p.y, p.z);
    if (stepTick) {
      d.root.rotation.y = px ? Math.round(p.yaw / (Math.PI / 4)) * (Math.PI / 4) : p.yaw;
      const A = p.atk, pose = { run: p.a.run, phase: px ? Math.round(p.phase / 0.7) * 0.7 : p.phase, headYaw: p.a.headYaw, beam: p.a.beam, charge: p.a.charge, tk: p.a.tk, rewrite: p.a.rewrite, hurt: p.a.hurt, kneel: p.a.kneel,
        atk: A.step >= 0 ? { step: A.step, k: clamp(A.t / A.dur, 0, 1) } : null };
      poseDragon(d, pose, t); R.lastPose = pose;
    }
    poseHero(p, px ? (stepTick ? 0.085 : 0) : rdt, t);
    R.dragonView = R.dragonView || { g: d.root }; setFlash(R.dragonView, p.hurtT > 0.22);
    const eye = M.eye; eye.emissiveIntensity = p.powerless ? 0.15 : 5 + p.a.rewrite * 14 + p.a.beam * 3; eye.emissive.setHex(p.powerless ? 0x8a8a8a : 0xffa21a);
  }
  // ---- everyone and everything else
  const seen = new Set();
  for (const e of G.ents) {
    if (e.kind === 'marker') continue;
    let v = R.views.get(e.id); if (!v) { v = buildEntity(e); R.views.set(e.id, v); R.scene.add(v.g); }
    seen.add(e.id);
    const g = v.g; g.visible = !e.hidden;
    if (e.ride && p) { const sx = Math.sin(p.yaw), cz = Math.cos(p.yaw); const rs = HERO.ready ? 0.62 : 0.98, ry = HERO.ready ? 2.18 : R.dragon.body.position.y + 1.42; g.position.set(p.x + cz * rs, p.y + ry, p.z - sx * rs); g.rotation.set(0, p.yaw, 0); e.act = 'sit'; }
    else {
      g.position.set(e.x, e.y || 0, e.z);
      const snapYaw = px && (e.kind === 'npc' || e.team === 'legion') && e.kind !== 'drone';
      if (e.kind === 'girder') g.rotation.set(0, (e.yaw || 0) + (e.spin || 0), 0);
      else if (e.obj || e.thrown > 0) g.rotation.set(e.thrown > 0 && e.team === 'legion' ? (e.spin || 0) : 0, (e.yaw || 0) + (e.obj ? (e.spin || 0) * 0.6 : 0), e.thrown > 0 && e.obj ? (e.spin || 0) * 0.5 : 0);
      else g.rotation.set(0, snapYaw ? Math.round(e.yaw / (Math.PI / 4)) * (Math.PI / 4) : e.yaw, 0);
    }
    const s = e.spawnT > 0 ? clamp(1 - e.spawnT / 0.7, 0.05, 1) : 1; g.scale.setScalar(s * (e.scale || 1) * (px && (e.kind === 'npc' || (e.team === 'legion' && e.kind !== 'stake' && e.kind !== 'nest')) ? 1.3 : 1));
    if (stepTick) poseEntity(v, e, t);
    setFlash(v, e.flash > 0);
  }
  for (const [id, v] of R.views) if (!seen.has(id)) { R.scene.remove(v.g); R.views.delete(id); }
  // ---- story-driven props
  const F = G.flags, well = R.named.well, tower = R.named.tower, tree = R.named.tree;
  if (well) { const w = well.userData.water; w.visible = !!F.wellFlow; if (F.wellFlow) w.position.y = damp(w.position.y, 0.95, 1.5, dt); else w.position.y = 0.2; }
  if (tower) tower.userData.pivot.rotation.z = damp(tower.userData.pivot.rotation.z, -(F.towerLean || 0) * 0.5, 4, dt);
  if (tree) { tree.userData.bloom.visible = !!F.bloom; if (tree.userData.dead) tree.userData.dead.visible = !F.bloom; }
  R.dragon.root.visible = R.dragon.root.visible && !F.hidePlayer;

  FX.update(dt, rdt);

  // ---- render
  const r = R.renderer, post = R.post;
  post.flash = Math.max(0, post.flash - rdt * 1.6); post.hurt = Math.max(0, post.hurt - rdt * 2.2);
  post.desat = damp(post.desat, G.rewrite.active || F.greyWorld ? 1 : 0, 9, rdt);
  if (!px) {
    r.setRenderTarget(rtScene); r.render(R.scene, R.pcam);
    // bloom: threshold, walk down the mip chain, walk back up
    let src = rtScene;
    matBright.uniforms.tex.value = src.texture; matBright.uniforms.px.value.set(1 / src.width, 1 / src.height); pass(matBright, bloomRT[0].d);
    for (let i = 1; i < bloomRT.length; i++) { const s = bloomRT[i - 1].d; matDown.uniforms.tex.value = s.texture; matDown.uniforms.px.value.set(1 / s.width, 1 / s.height); pass(matDown, bloomRT[i].d); }
    let low = bloomRT[bloomRT.length - 1].d;
    for (let i = bloomRT.length - 2; i >= 0; i--) { matUp.uniforms.tex.value = low.texture; matUp.uniforms.add.value = bloomRT[i].d.texture; matUp.uniforms.px.value.set(1 / low.width, 1 / low.height); pass(matUp, bloomRT[i].u); low = bloomRT[i].u; }
    const u = matFinal.uniforms; u.tex.value = rtScene.texture; u.bloom.value = low.texture; u.bloomK.value = cur.bloom * 0.16; u.exposure.value = cur.exp; u.sat.value = cur.sat; u.time.value = t % 100;
    u.desat.value = post.desat; u.flash.value = post.flash * 0.85; u.hurt.value = post.hurt; u.fade.value = post.fade; u.tint.value.set(cur.tint[0], cur.tint[1], cur.tint[2]);
    pass(matFinal, null);
  } else {
    r.setRenderTarget(rtLow); r.render(R.scene, R.ocam);
    const u = matPixel.uniforms; u.tex.value = rtLow.texture; u.depth.value = rtLow.depthTexture; u.exposure.value = 0.7; u.sat.value = cur.sat; u.desat.value = post.desat; u.flash.value = post.flash * 0.85; u.hurt.value = post.hurt; u.fade.value = post.fade;
    u.tint.value.set(lerp(1, cur.tint[0], 0.3), lerp(1, cur.tint[1], 0.3), lerp(1, cur.tint[2], 0.3));
    pass(matPixel, null);
  }
}
function pass(mat, target) { fsMesh.material = mat; R.renderer.setRenderTarget(target); R.renderer.render(fsScene, fsCam); }
