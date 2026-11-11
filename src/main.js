// main.js — boot, the frame loop, pause, style switching, checkpoints.
import { G, isEnemy, updateEntities } from './sim.js';
import { I, initInput, poll, endFrame } from './input.js';
import { R, init as initRender, frame, setStyle, resize, pickAim, setMood } from './render.js';
import * as FX from './fx.js';
import { updatePlayer, updateOrbs, updateRewrite, TUNE } from './player.js';
import { updateEnemies } from './enemies.js';
import * as UIm from './ui.js';
import { UI } from './ui.js';
import * as Story from './story.js';
import { initAudio, play, beamSound, chargeSound, setMuted, A, music } from './audio.js';
import { dist, clamp } from './util.js';

const canvas = document.getElementById('view');
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
const qs = new URLSearchParams(location.search);
let paused = false, style = store.get('ps-style') === 'pixel' ? 'pixel' : 'real', last = 0, slowFrames = 0, booted = false;
G.input = I;

function boot() {
  if (qs.get('q') !== null) R.quality = +qs.get('q');
  try { initRender(canvas); } catch (e) { document.getElementById('title').querySelector('p').textContent = 'This game needs WebGL 2, which this browser or device did not provide.'; console.error(e); return; }
  initInput(canvas);
  UIm.initUI({
    start: (cont) => begin(cont ? store.get('ps-checkpoint') || 'wake' : 'wake'),
    style: (s) => applyStyle(s), toggleStyle: () => applyStyle(style === 'pixel' ? 'real' : 'pixel'),
    pause: () => togglePause(), mute: () => { setMuted(!A.muted); document.getElementById('btnSound').textContent = A.muted ? 'Sound off' : 'Sound on'; },
    checkpoint: () => { togglePause(false); Story.start(Story.S.checkpoint); }, restart: () => { togglePause(false); UIm.show('ending', false); Story.S.pages.clear(); G.stats.time = 0; G.stats.kills = 0; begin('wake'); },
    choice: () => { UIm.show('ending', false); begin('choice'); },
  });
  UI.onTruthClick = (t) => { G.aim.x = t.x; G.aim.z = t.z; G.rewrite.hover = t; I.pressed.confirm = true; };
  applyStyle(style);
  const cp = store.get('ps-checkpoint'); if (cp && cp !== 'wake') document.getElementById('btnContinue').hidden = false;
  Story.S.save = (id) => store.set('ps-checkpoint', id);
  G.onEvent = Story.onEvent;
  // the title backdrop: Vellum in the door of Hangar Nine
  Story.start('wake'); Story.S.gen++; Story.S.waits.length = 0; Story.S.started = false; UIm.cancelDialogue(); UIm.card(''); UIm.fade(false, false, true);
  G.mode = 'title'; UIm.hud(false); UIm.cinema(false);
  const p = G.player; p.x = 41.5; p.z = 42; p.yaw = 0.95; p.locked = true;
  Object.assign(G.cine, { active: true, cut: true, px: 49.5, py: 2.1, pz: 49.5, lx: 43.6, ly: 2.0, lz: 42, fov: 30, k: 1 });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);
  booted = true; last = performance.now(); requestAnimationFrame(tick);
}
function begin(id) {
  initAudio(); UIm.show('title', false); UIm.show('ending', false); paused = false; UIm.show('pause', false);
  if (I.touch) UIm.setTouch(true);
  G.mode = 'play'; Story.start(id); canvas.focus();
}
function applyStyle(s) { style = s; setStyle(s); UIm.setStyleUI(s); store.set('ps-style', s); resize(); }
function togglePause(force) {
  if (G.mode === 'title' || G.mode === 'ending') return;
  paused = force === undefined ? !paused : force; UIm.show('pause', paused);
}

// touch has no cursor: aim at what he is most likely to want
function touchAim() {
  const p = G.player; let best = null, bd = 19;
  for (const e of G.ents) if (isEnemy(e) && e.spawnT <= 0 && Math.abs((e.level ? e.level.h : 0) - p.y) < 7) { const d = dist(p.x, p.z, e.x, e.z); if (d < bd) { bd = d; best = e; } }
  const sx = I.stick.x, sz = I.stick.y, moving = Math.hypot(sx, sz) > 0.3;
  const fx = moving ? sx : Math.sin(p.yaw), fz = moving ? sz : Math.cos(p.yaw), n = Math.hypot(fx, fz) || 1;
  if (I.pressed.tk && !p.tk.ent) {   // reach for the nearest thing worth holding
    let g = null, gd = TUNE.tkRange;
    for (const e of G.ents) { if (e.dead || e.held || !(e.grab || (e.kind === 'npc' && e.rescuable) || (e.kind === 'bailiff' && e.shield > 0))) continue; let d = dist(p.x, p.z, e.x, e.z); if (e.questItem || e.kind === 'npc') d -= 8; if (d < gd) { gd = d; g = e; } }
    if (g) { G.aim.x = g.x; G.aim.z = g.z; G.aim.y = g.level ? g.level.h : 0; G.aim.level = g.level || null; return; }
  }
  if (I.pressed.blink && moving) { G.aim.x = p.x + (fx / n) * 9; G.aim.z = p.z + (fz / n) * 9; G.aim.y = 0; G.aim.level = null; return; }
  if (p.tk.ent && !best) { G.aim.x = p.x + (fx / n) * 7; G.aim.z = p.z + (fz / n) * 7; G.aim.y = 0; G.aim.level = null; return; }
  if (best) { G.aim.x = best.x; G.aim.z = best.z; G.aim.y = best.level ? best.level.h : 0; G.aim.level = best.level || null; }
  else { G.aim.x = p.x + (fx / n) * 7; G.aim.z = p.z + (fz / n) * 7; G.aim.y = 0; G.aim.level = null; }
}

function tick(now) {
  requestAnimationFrame(tick);
  const real = (now - last) / 1000; last = now;
  const rdt = Math.min(0.05, Math.max(0.001, real));
  step(rdt, real);
}
function step(rdt, real = rdt) {
  poll();
  if (I.pressed.style) applyStyle(style === 'pixel' ? 'real' : 'pixel');
  if (I.pressed.mute) setMuted(!A.muted);
  if (I.pressed.pause && !G.rewrite.active) togglePause();
  if (UIm.talking() && (I.pressed.interact || I.pressed.confirm || I.pressed.blink || I.pressed.beam)) { UIm.advance(); I.pressed = {}; }
  UIm.setTouch(I.touch && G.mode !== 'title' && G.mode !== 'ending');
  const p = G.player, run = !paused && (G.mode === 'play' || G.mode === 'cine');
  let dt = 0;
  if (run) {
    if (I.touch) touchAim(); else pickAim(I.mouse.x, I.mouse.y);
    if (G.hitstop > 0) G.hitstop -= rdt; if (G.slow > 0) G.slow -= rdt;
    dt = G.rewrite.active ? 0 : G.hitstop > 0 ? rdt * 0.04 : G.slow > 0 ? rdt * 0.3 : rdt;
    G.time += dt;
    updateRewrite(rdt);
    updatePlayer(dt, rdt); updateOrbs(dt);
    if (G.mode === 'play') updateEnemies(dt);
    updateEntities(dt);
    Story.update(dt, rdt);
  } else if (G.mode === 'title' && p) { updatePlayer(0, rdt); }
  // drain simulation events into sound and light
  for (const ev of G.fx) {
    if (ev.k === 'sfx') play(ev.name, ev.vol);
    else if (ev.k === 'beamOn') beamSound(true); else if (ev.k === 'beamOff') beamSound(false);
    else if (ev.k === 'chargeOn') chargeSound(true); else if (ev.k === 'chargeOff') chargeSound(false);
    else if (ev.k !== 'deny') FX.handle(ev);
  }
  G.fx.length = 0;
  if (p && !p.beam.on) beamSound(false); if (p && !p.burst.charging) chargeSound(false);
  if (!window.__noRender) frame(paused ? 0 : dt, paused ? 0 : rdt);
  UIm.update(rdt);
  endFrame();
  // if the machine is struggling, quietly render fewer pixels
  if (real > 0.045 && run) { if (++slowFrames > 50 && (R.dynScale || 1) > 0.55) { R.dynScale = (R.dynScale || 1) * 0.82; slowFrames = 0; resize(); } } else if (slowFrames > 0) slowFrames--;
}
window.PS = { G, R, Story, UI, step, setMood, applyStyle, begin };
boot();
