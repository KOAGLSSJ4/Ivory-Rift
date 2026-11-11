// ui.js — HUD, world labels, dialogue, cards, screens and touch controls.
import { G } from './sim.js';
import { I, set as setKey } from './input.js';
import { screenPos, R } from './render.js';
import { play } from './audio.js';
import { clamp, dist } from './util.js';

const $ = (id) => document.getElementById(id);
export const UI = { markers: [], interacts: [], dialog: null, hintKey: '', subT: 0, onTruthClick: null, holdK: 0 };
const el = {};
const ICON = {
  beam: '<svg viewBox="0 0 32 32"><path d="M5 27 L27 5"/><path d="M19 5h8v8"/><circle cx="7" cy="25" r="2.5"/></svg>',
  claw: '<svg viewBox="0 0 32 32"><path d="M7 27 C9 17 12 10 16 4"/><path d="M14 28 C16 19 19 12 23 6"/><path d="M21 28 C23 21 25 16 28 11"/></svg>',
  burst: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="5"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.5 3.5M21.5 21.5 25 25M25 7l-3.5 3.5M10.5 21.5 7 25"/></svg>',
  blink: '<svg viewBox="0 0 32 32"><path d="M4 22 L12 22"/><path d="M4 16 L9 16"/><path d="M15 26 L20 14 L15 14 L19 5"/><circle cx="25" cy="22" r="3.5"/></svg>',
  tk: '<svg viewBox="0 0 32 32"><path d="M9 20v-9M13 19V7M17 19V8M21 20v-8"/><path d="M9 20c0 5 3 8 7 8s6-3 6-7"/><path d="M11 3h10" stroke-dasharray="2 3"/></svg>',
  rewrite: '<svg viewBox="0 0 32 32"><path d="M6 26 L8 19 L22 5 L27 10 L13 24 Z"/><path d="M4 29h24"/><path d="M19 8l5 5"/></svg>',
};
const ABIL = [['beam', 'Lance', 'L-Click'], ['claw', 'Claws', 'R-Click'], ['burst', 'Burst', 'Q'], ['blink', 'Blink', 'Space'], ['tk', 'Grip', 'E'], ['rewrite', 'Rewrite', 'R']];
const KEYS = [['WASD', 'Move'], ['Mouse', 'Aim'], ['L-Click', 'Lance: a precise beam (hold)'], ['R-Click', 'Claws: third strike is the tail'], ['Q', 'Burst: hold to gather, release'], ['Space', 'Blink to where you look'], ['E', 'Grip: lift, carry, L-Click to throw'], ['R', 'Rewrite, when Authority is full'], ['F', 'Talk'], ['V', 'Switch look'], ['Esc', 'Pause']];
const TKEYS = [['Left pad', 'Move'], ['Claws', 'Strike; third is the tail'], ['Lance', 'Hold to fire'], ['Burst', 'Hold, then release'], ['Blink', 'Jump where you face'], ['Grip', 'Lift; Lance button throws'], ['Rewrite', 'When Authority is full']];

export function initUI(handlers) {
  for (const id of ['app', 'hud', 'labels', 'hp', 'en', 'au', 'auTxt', 'boss', 'objHead', 'objText', 'objList', 'sub', 'hint', 'abil', 'toast', 'card', 'dlg', 'fade', 'title', 'pause', 'ending', 'touch', 'pad', 'stick', 'styleName']) el[id] = $(id);
  el.abil.innerHTML = ABIL.map(([k, n, key]) => `<div class="ab" data-k="${k}"><span>${n}</span>${ICON[k]}<i class="cool"></i>${k === 'blink' ? '<div class="pips"><b></b><b></b></div>' : ''}<kbd>${key}</kbd></div>`).join('');
  el.ab = {}; for (const d of el.abil.children) el.ab[d.dataset.k] = d;
  const keysHtml = (list) => list.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('');
  $('keysTitle').innerHTML = keysHtml(KEYS.slice(2, 8)); $('keysPause').innerHTML = keysHtml(KEYS);
  UI.setTouchKeys = () => { $('keysTitle').innerHTML = keysHtml(TKEYS.slice(1)); $('keysPause').innerHTML = keysHtml(TKEYS); };
  const on = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); play('tick'); fn(); });
  on('btnStart', () => handlers.start(false)); on('btnContinue', () => handlers.start(true));
  on('optReal', () => handlers.style('real')); on('optPixel', () => handlers.style('pixel'));
  on('btnStyle', handlers.toggleStyle); on('btnStyle2', handlers.toggleStyle); on('btnPause', handlers.pause); on('btnResume', handlers.pause);
  on('btnSound', handlers.mute); on('btnCheckpoint', handlers.checkpoint); on('btnRestart', handlers.restart); on('btnChoice', handlers.choice); on('btnAgain', handlers.restart);
  el.dlg.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); advance(); });
  initTouch();
}
export function setStyleUI(s) { el.app.classList.toggle('pixel', s === 'pixel'); el.app.classList.toggle('real', s !== 'pixel'); el.styleName.textContent = s === 'pixel' ? 'Pixel' : 'Realistic'; $('optReal').classList.toggle('sel', s !== 'pixel'); $('optPixel').classList.toggle('sel', s === 'pixel'); }
export const show = (id, on) => { el[id].hidden = !on; };
export const hud = (on) => el.hud.classList.toggle('off', !on);
export const cinema = (on) => el.app.classList.toggle('cinema', on);
export function fade(on, white = false, instant = false) { el.fade.classList.toggle('white', white); el.fade.style.transition = instant ? 'none' : ''; el.fade.style.opacity = on ? 1 : 0; }
export function card(html, big = false) { const d = el.card.firstElementChild; d.className = big ? 'big' : ''; d.innerHTML = html || ''; el.card.classList.toggle('on', !!html); }
export function toast(text) { el.toast.textContent = text; el.toast.classList.add('on'); clearTimeout(UI.toastT); UI.toastT = setTimeout(() => el.toast.classList.remove('on'), 2600); }
export function objective(head, text, list) {
  el.objHead.textContent = head || ''; el.objText.textContent = text || '';
  el.objList.innerHTML = (list || []).map((l) => `<li class="${l.done ? 'done' : ''} ${l.warn ? 'warn' : ''}">${l.text}${l.val !== undefined ? `<b>${l.val}</b>` : ''}</li>`).join('');
}
export function hint(html, key = html) { if (UI.hintKey === key) return; UI.hintKey = key; el.hint.hidden = !html; if (html) el.hint.innerHTML = I.touch && UI.touchHints[key] ? UI.touchHints[key] : html; }
UI.touchHints = {};
export function sub(who, text, secs = 4) { el.sub.innerHTML = text ? `${who ? `<b>${who}</b>` : ''}${text}` : ''; UI.subT = text ? secs : 0; }
export function setBoss(b) { el.boss.hidden = !b; if (b) { el.boss.querySelector('i').style.transform = `scaleX(${clamp(b.hp / b.maxHp, 0, 1)})`; el.boss.classList.toggle('ward', !!b.warded); } }
export function ending(o) {
  $('endEyebrow').textContent = o.eyebrow; $('endTitle').textContent = o.title; $('endText').textContent = o.text; $('endTease').textContent = o.tease || '';
  $('endStats').innerHTML = o.stats.map(([k, v]) => `<span>${k}<b>${v}</b></span>`).join(''); $('btnChoice').hidden = !o.retry; if (o.retry) $('btnChoice').textContent = o.retry;
  show('ending', true);
}

// ---------------- dialogue ----------------
let dq = null;
export function say(lines) {
  return new Promise((resolve) => { dq = { lines: lines.slice(), i: -1, shown: 0, t: 0, resolve }; el.dlg.hidden = false; nextLine(); });
}
function nextLine() {
  dq.i++; if (dq.i >= dq.lines.length) { const r = dq.resolve; dq = null; el.dlg.hidden = true; r(); return; }
  const [who, text, cls] = dq.lines[dq.i]; dq.text = text; dq.shown = 0; dq.t = 0;
  const w = el.dlg.querySelector('.who'); w.textContent = who; w.className = 'who ' + (cls || (who === 'Vellum' ? 'self' : who.includes('Vasht') || who === 'The Gate' ? 'legion' : ''));
  el.dlg.querySelector('.txt').textContent = '';
  el.dlg.querySelector('.face').hidden = who !== 'Vellum';
}
export function advance() {
  if (!dq) return false;
  if (dq.shown < dq.text.length) { dq.shown = dq.text.length; el.dlg.querySelector('.txt').textContent = dq.text; } else if (dq.t > 0.12) nextLine();
  return true;
}
export const talking = () => !!dq;
export function cancelDialogue() { if (dq) { dq = null; el.dlg.hidden = true; } }

// ---------------- world labels ----------------
const pool = [];
function label(i) { let d = pool[i]; if (!d) { d = document.createElement('div'); d.className = 'lab'; el.labels.appendChild(d); pool.push(d); d.addEventListener('pointerdown', (e) => { if (d._truth && UI.onTruthClick) { e.preventDefault(); e.stopPropagation(); UI.onTruthClick(d._truth); } }); } d.hidden = false; return d; }
function place(d, cls, html, x, y) { if (d._cls !== cls) { d.className = 'lab ' + cls; d._cls = cls; } if (d._html !== html) { d.innerHTML = html; d._html = html; } d.style.transform = `translate(-50%,-50%) translate(${Math.round(x)}px,${Math.round(y)}px)`; }

export function update(rdt) {
  const p = G.player; if (!p) return;
  el.hp.firstElementChild.style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
  el.en.firstElementChild.style.transform = `scaleX(${clamp(p.en / p.maxEn, 0, 1)})`;
  const awake = !!G.flags.awake;
  el.au.style.visibility = awake ? 'visible' : 'hidden'; el.auTxt.style.visibility = awake ? 'visible' : 'hidden';
  el.au.firstElementChild.style.transform = `scaleX(${clamp(p.auth / 100, 0, 1)})`; el.au.classList.toggle('full', p.auth >= 100);
  el.auTxt.textContent = p.auth >= 100 ? 'Authority · ready' : 'Authority';
  const A = el.ab;
  A.beam.classList.toggle('on', p.beam.on); A.claw.classList.toggle('on', p.atk.step >= 0); A.burst.classList.toggle('on', p.burst.charging); A.tk.classList.toggle('on', !!p.tk.ent);
  A.burst.classList.toggle('no', p.en < 18); A.blink.classList.toggle('no', p.blink.n <= 0);
  const pips = A.blink.querySelectorAll('.pips b'); pips.forEach((b, i) => b.classList.toggle('off', i >= p.blink.n));
  A.blink.querySelector('.cool').style.transform = `scaleY(${p.blink.n < p.blink.max ? clamp(p.blink.cd / 1.7, 0, 1) * (p.blink.n === 0 ? 1 : 0.4) : 0})`;
  A.rewrite.style.display = awake ? '' : 'none'; A.rewrite.classList.toggle('ready', p.auth >= 100); A.rewrite.classList.toggle('no', p.auth < 100);
  A.rewrite.querySelector('.cool').style.transform = `scaleY(${1 - clamp(p.auth / 100, 0, 1)})`;
  if (el.tb) { el.tb.rewrite.hidden = !awake; el.tb.rewrite.classList.toggle('ready', p.auth >= 100); el.tb.tk.classList.toggle('on', !!p.tk.ent); el.tb.act.hidden = !G.nearInteract; if (G.nearInteract) el.tb.act.textContent = G.nearInteract.short || 'Talk'; }
  setBoss(G.bossRef && !G.bossRef.dead && G.bossRef.fighting ? G.bossRef : null);
  if (UI.subT > 0) { UI.subT -= rdt; if (UI.subT <= 0) el.sub.innerHTML = ''; }
  if (dq) { dq.t += rdt; if (dq.shown < dq.text.length) { const n = Math.min(dq.text.length, dq.shown + rdt * 62); if (Math.floor(n) > Math.floor(dq.shown) && Math.floor(n) % 3 === 0) play('text'); dq.shown = n; el.dlg.querySelector('.txt').textContent = dq.text.slice(0, Math.floor(n)); } }

  // labels
  let n = 0; const W = R.w, H = R.h, playing = G.mode === 'play' && !talking();
  if (G.rewrite.active) {
    for (const t of G.rewrite.list) {
      const s = screenPos(t.x, t.y || 2, t.z); if (!s.on) continue;
      const d = label(n++), hot = G.rewrite.hover === t, locked = t.locked && (typeof t.locked !== 'function' || t.locked());
      place(d, 'truth' + (hot ? ' hot' : '') + (locked ? ' locked' : ''), `${t.from}${t.to ? ` <i>→</i> <em>${t.to}</em>` : ''}${hot ? `<small>${locked ? (typeof t.locked === 'function' ? t.locked() : t.locked) : I.touch ? 'Tap to rewrite' : 'Click to rewrite'}</small>` : ''}`, s.x, clamp(s.y, 60, H - 60));
      d._truth = t; d.style.pointerEvents = 'auto';
    }
  } else if (playing) {
    for (const m of UI.markers) {
      const x = m.ent ? m.ent.x : m.x, z = m.ent ? m.ent.z : m.z, y = (m.ent ? (m.ent.y || 0) : m.y || 0) + (m.h || 3.4);
      const d0 = dist(p.x, p.z, x, z); if (d0 < (m.hide || 3)) continue;
      const s = screenPos(x, y, z); let sx = s.x, sy = s.y;
      if (!s.on) { const cx = W / 2, cy = H / 2; let dx = sx - cx, dy = sy - cy; const k = Math.min((W / 2 - 70) / Math.abs(dx || 1), (H / 2 - 90) / Math.abs(dy || 1)); sx = cx + dx * k; sy = cy + dy * k; }
      const d = label(n++); place(d, 'mark' + (m.warn ? ' warn' : ''), `${m.label}<small>${Math.round(d0)} m</small>`, sx, sy); d._truth = null; d.style.pointerEvents = 'none';
    }
    const it = G.nearInteract;
    if (it) { const s = screenPos(it.x, (it.y || 0) + (it.h || 2.6), it.z); const d = label(n++); const pct = it.hold && UI.holdK > 0 ? ` · ${Math.round(UI.holdK * 100)}%` : ''; place(d, 'talk', `${I.touch ? '' : `<kbd>F</kbd>`}${it.label}${pct}`, s.x, s.y); d._truth = null; d.style.pointerEvents = 'none'; }
  }
  for (let i = n; i < pool.length; i++) pool[i].hidden = true;
}

// ---------------- touch ----------------
function initTouch() {
  const pad = el.pad, defs = [['claw', 'big', 76, 122, ICON.claw], ['beam', '', 4, 150, ICON.beam], ['burst', '', 14, 76, ICON.burst], ['blink', '', 84, 34, ICON.blink], ['tk', '', 162, 60, ICON.tk], ['rewrite', '', 170, 0, ICON.rewrite]];
  el.tb = {};
  for (const [k, cls, x, y, icon] of defs) {
    const b = document.createElement('div'); b.className = 'tb ' + cls; b.style.left = x + 'px'; b.style.top = y + 'px'; b.innerHTML = icon; pad.appendChild(b); el.tb[k] = b;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); setKey(k, true); b.classList.add('on'); });
    const up = (e) => { e.preventDefault(); setKey(k, false); b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  const act = document.createElement('div'); act.className = 'tb act'; act.textContent = 'Talk'; act.hidden = true; pad.appendChild(act); el.tb.act = act;
  act.addEventListener('pointerdown', (e) => { e.preventDefault(); setKey('interact', true); }); act.addEventListener('pointerup', () => setKey('interact', false)); act.addEventListener('pointercancel', () => setKey('interact', false));
  const st = el.stick, nub = st.firstElementChild; let id = null;
  const move = (e) => { const r = st.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } I.stick.x = Math.abs(x) < 0.12 ? 0 : x; I.stick.y = Math.abs(y) < 0.12 ? 0 : y; I.stick.on = true; nub.style.transform = `translate(${x * 40}px,${y * 40}px)`; };
  st.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; st.setPointerCapture(id); move(e); });
  st.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; I.stick.x = I.stick.y = 0; nub.style.transform = ''; };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
}
export function setTouch(on) { el.touch.hidden = !on; if (on && UI.setTouchKeys) { UI.setTouchKeys(); UI.setTouchKeys = null; } }
