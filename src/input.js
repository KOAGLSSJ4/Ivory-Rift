// input.js — keyboard, mouse and touch all feed the same set of named actions.
export const I = {
  mx: 0, mz: 0, down: {}, pressed: {}, released: {}, mouse: { x: 0, y: 0 }, touch: false, wheel: 0,
  stick: { x: 0, y: 0, on: false }, aimDrag: null,   // touch: left stick, and a drag off an ability button to aim it
};
const KEY = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'dn', ArrowDown: 'dn', KeyA: 'lf', ArrowLeft: 'lf', KeyD: 'rt', ArrowRight: 'rt',
  Space: 'blink', KeyQ: 'burst', KeyE: 'tk', KeyR: 'rewrite', KeyF: 'interact', ShiftLeft: 'claw', ShiftRight: 'claw', KeyC: 'claw',
  KeyV: 'style', Escape: 'pause', KeyP: 'pause', Enter: 'confirm', KeyM: 'mute',
};
export function set(name, on) {
  if (on) { if (!I.down[name]) I.pressed[name] = true; I.down[name] = true; }
  else { if (I.down[name]) I.released[name] = true; I.down[name] = false; }
}
export function initInput(canvas) {
  const rect = () => canvas.getBoundingClientRect();
  window.addEventListener('keydown', (e) => {
    const k = KEY[e.code]; if (!k) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault(); if (!e.repeat) set(k, true);
  });
  window.addEventListener('keyup', (e) => { const k = KEY[e.code]; if (k) set(k, false); });
  window.addEventListener('mousemove', (e) => { const r = rect(); I.mouse.x = e.clientX - r.left; I.mouse.y = e.clientY - r.top; if (I.touch && e.movementX + e.movementY !== 0 && !I.lastTouch) I.touch = false; });
  canvas.addEventListener('mousedown', (e) => { if (I.lastTouch && performance.now() - I.lastTouch < 800) return; I.touch = false; const r = rect(); I.mouse.x = e.clientX - r.left; I.mouse.y = e.clientY - r.top; set(e.button === 2 ? 'claw' : e.button === 0 ? 'beam' : 'tk', true); e.preventDefault(); canvas.focus(); });
  window.addEventListener('mouseup', (e) => { set(e.button === 2 ? 'claw' : e.button === 0 ? 'beam' : 'tk', false); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { I.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  window.addEventListener('blur', () => { for (const k in I.down) set(k, false); });
  window.addEventListener('touchstart', () => { I.touch = true; I.lastTouch = performance.now(); }, { passive: true, capture: true });
}
export function poll() {
  const d = I.down;
  let x = (d.rt ? 1 : 0) - (d.lf ? 1 : 0), z = (d.dn ? 1 : 0) - (d.up ? 1 : 0);
  if (I.stick.on) { x = I.stick.x; z = I.stick.y; }
  I.mx = x; I.mz = z;
}
export function endFrame() { I.pressed = {}; I.released = {}; I.wheel = 0; }
