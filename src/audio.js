// audio.js — every sound is synthesised: no files to load.
let ctx = null, master, sfxBus, musicBus, noiseBuf, muted = false, beam = null, charge = null, pad = null, padMood = '';
export const A = { get muted() { return muted; } };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { ctx = new AC(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }

function tone(type, f0, f1, dur, vol = 0.3, delay = 0, attack = 0.005) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(f0, f1, dur, vol = 0.3, q = 1, delay = 0, type = 'bandpass') {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const SFX = {
  claw: (v) => { noise(2600, 500, 0.13, 0.3 * v, 0.8); tone('triangle', 520, 180, 0.1, 0.1 * v); },
  tail: (v) => { noise(900, 140, 0.32, 0.4 * v, 0.7); tone('sine', 180, 60, 0.3, 0.25 * v); },
  hit: (v) => { noise(1400, 200, 0.1, 0.5 * v, 1); tone('square', 190, 60, 0.09, 0.2 * v); },
  hitBig: (v) => { noise(900, 80, 0.26, 0.6 * v, 0.8); tone('sine', 150, 38, 0.3, 0.5 * v); },
  parry: (v) => { tone('triangle', 1200, 2400, 0.16, 0.3 * v); tone('sine', 1800, 900, 0.2, 0.2 * v); },
  burstFire: (v) => { tone('sawtooth', 300, 90, 0.25, 0.25 * v); noise(1600, 300, 0.2, 0.3 * v); },
  boom: (v) => { noise(500, 40, 0.7, 0.8 * v, 0.6, 0, 'lowpass'); tone('sine', 110, 28, 0.6, 0.7 * v); noise(3000, 400, 0.18, 0.3 * v); },
  blink: (v) => { noise(400, 6000, 0.12, 0.25 * v, 2); tone('sine', 1400, 240, 0.2, 0.2 * v, 0.03); },
  grip: (v) => { tone('sine', 220, 520, 0.22, 0.2 * v); tone('triangle', 330, 780, 0.22, 0.1 * v); },
  drop: (v) => { tone('sine', 420, 180, 0.16, 0.2 * v); },
  throw: (v) => { noise(500, 3000, 0.16, 0.35 * v, 1.2); tone('sine', 260, 90, 0.2, 0.25 * v); },
  rip: (v) => { noise(300, 2400, 0.3, 0.5 * v, 1.5); tone('sawtooth', 90, 300, 0.3, 0.2 * v); },
  slam: (v) => { noise(700, 60, 0.3, 0.7 * v, 0.7, 0, 'lowpass'); tone('sine', 120, 36, 0.3, 0.5 * v); },
  thud: (v) => { tone('sine', 110, 40, 0.18, 0.4 * v); noise(400, 80, 0.12, 0.25 * v, 0.7, 0, 'lowpass'); },
  crack: (v) => { noise(2200, 500, 0.14, 0.4 * v, 1.2); },
  pop: (v) => { tone('square', 640, 160, 0.07, 0.15 * v); },
  unmake: (v) => { tone('sawtooth', 420, 60, 0.4, 0.16 * v); noise(3000, 300, 0.35, 0.2 * v, 2); },
  hurt: (v) => { tone('sawtooth', 240, 70, 0.26, 0.3 * v); noise(800, 200, 0.2, 0.3 * v); },
  block: (v) => { tone('square', 880, 660, 0.09, 0.14 * v); noise(4000, 2000, 0.07, 0.2 * v, 3); },
  shatter: (v) => { noise(5000, 800, 0.5, 0.45 * v, 1.5); tone('triangle', 1600, 300, 0.4, 0.2 * v); },
  swish: (v) => { noise(1200, 3200, 0.12, 0.2 * v, 1.5); },
  tell: (v) => { tone('sine', 660, 990, 0.2, 0.16 * v); },
  bolt: (v) => { tone('sawtooth', 900, 240, 0.16, 0.14 * v); noise(3000, 1200, 0.1, 0.14 * v, 2); },
  beep: (v) => { tone('square', 1320, 1320, 0.07, 0.14 * v); tone('square', 1320, 1320, 0.07, 0.14 * v, 0.14); tone('square', 1760, 1760, 0.1, 0.14 * v, 0.28); },
  summon: (v) => { tone('sawtooth', 60, 180, 0.9, 0.3 * v); noise(200, 2000, 0.8, 0.25 * v, 1); },
  auditFire: (v) => { tone('sawtooth', 1400, 110, 0.4, 0.3 * v); noise(4000, 300, 0.35, 0.35 * v); },
  sealFire: (v) => { tone('square', 220, 880, 0.2, 0.2 * v); noise(600, 3000, 0.25, 0.3 * v); },
  ringFire: (v) => { tone('sawtooth', 80, 320, 0.7, 0.3 * v); noise(300, 1800, 0.7, 0.3 * v, 0.8); },
  rewriteIn: (v) => { tone('sine', 880, 110, 0.6, 0.3 * v); noise(6000, 200, 0.5, 0.2 * v, 0.8, 0, 'lowpass'); },
  rewriteOut: (v) => { tone('sine', 220, 660, 0.25, 0.2 * v); },
  rewriteApply: (v) => { for (const [f, d] of [[196, 0], [294, 0.05], [392, 0.1], [587, 0.16], [784, 0.24]]) tone('triangle', f, f, 1.6, 0.16 * v, d, 0.02); noise(200, 5000, 0.9, 0.3 * v, 0.6); tone('sine', 60, 30, 1.2, 0.5 * v); },
  unwrite: (v) => { noise(6000, 400, 0.6, 0.3 * v, 1); tone('sine', 1200, 200, 0.5, 0.2 * v); },
  tick: (v) => { tone('triangle', 1500, 1500, 0.04, 0.12 * v); },
  deny: (v) => { tone('square', 160, 120, 0.12, 0.14 * v); },
  ready: (v) => { tone('sine', 880, 1320, 0.12, 0.14 * v); },
  text: (v) => { tone('triangle', 520 + Math.random() * 80, 480, 0.03, 0.05 * v); },
  page: (v) => { for (const [f, d] of [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]]) tone('triangle', f, f, 0.5, 0.14 * v, d, 0.01); },
  bell: (v) => { for (const f of [392, 784, 1176.5, 1568]) tone('sine', f, f, 2.2, 0.12 * v, 0, 0.005); },
  gate: (v) => { tone('sawtooth', 40, 55, 3, 0.4 * v, 0, 0.6); noise(100, 900, 3, 0.3 * v, 0.5); tone('sine', 55, 27, 3, 0.5 * v); },
  choir: (v) => { for (const f of [261.6, 329.6, 392, 523.3, 659.3]) { tone('sine', f, f, 4.5, 0.08 * v, 0, 1.2); tone('triangle', f * 2.005, f * 2.005, 4.5, 0.03 * v, 0.2, 1.5); } },
};
export function play(name, vol = 1) { if (!ctx || muted) return; const f = SFX[name]; if (f) try { f(vol); } catch (e) { /* ignore */ } }

// sustained voices for the Lance and a gathering Burst
function loopVoice(type, freq, filt) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
  o.type = type; o.frequency.value = freq; o2.type = 'square'; o2.frequency.value = freq * 2.01; f.type = 'lowpass'; f.frequency.value = filt; g.gain.value = 0;
  l.frequency.value = 31; lg.gain.value = freq * 0.03; l.connect(lg); lg.connect(o.frequency);
  o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus); o.start(); o2.start(); l.start();
  return { o, o2, g, f, stop() { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.03); o.stop(t + 0.2); o2.stop(t + 0.2); l.stop(t + 0.2); } };
}
export function beamSound(on) {
  if (!ctx) return;
  if (on && !beam) { beam = loopVoice('sawtooth', 196, 2400); beam.g.gain.setTargetAtTime(0.11, ctx.currentTime, 0.02); play('bolt', 0.8); }
  else if (!on && beam) { beam.stop(); beam = null; }
}
export function chargeSound(on) {
  if (!ctx) return;
  if (on && !charge) { charge = loopVoice('triangle', 110, 1200); charge.g.gain.setTargetAtTime(0.14, ctx.currentTime, 0.1); charge.o.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.9); charge.o2.frequency.exponentialRampToValueAtTime(662, ctx.currentTime + 0.9); }
  else if (!on && charge) { charge.stop(); charge = null; }
}

// a slow drone that follows the mood of the scene
const PADS = {
  morning: [146.8, 220, 293.7, 370], noon: [146.8, 220, 277.2, 370], tithe: [73.4, 110, 155.6, 207.7], boss: [65.4, 98, 138.6, 185],
  dusk: [98, 146.8, 174.6, 233.1], gold: [130.8, 196, 261.6, 329.6, 392], grey: [110, 164.8, 196, 246.9], empty: [82.4, 123.5, 146.8], silent: [],
};
export function music(mood) {
  if (!ctx || mood === padMood) return; padMood = mood;
  const t = ctx.currentTime;
  if (pad) { const old = pad; old.g.gain.setTargetAtTime(0, t, 1.2); setTimeout(() => old.os.forEach((o) => { try { o.stop(); } catch (e) { /* done */ } }), 5000); pad = null; }
  const notes = PADS[mood] || []; if (!notes.length) return;
  const g = ctx.createGain(), f = ctx.createBiquadFilter(); g.gain.value = 0; f.type = 'lowpass'; f.frequency.value = mood === 'tithe' || mood === 'boss' ? 700 : 1100;
  g.connect(f); f.connect(musicBus); const os = [];
  notes.forEach((n, i) => {
    for (const det of [-4, 5]) { const o = ctx.createOscillator(), og = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); o.type = i === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = n; o.detune.value = det + i * 2; og.gain.value = 0.16 / notes.length * (i === 0 ? 2.2 : 1); l.frequency.value = 0.07 + i * 0.045; lg.gain.value = og.gain.value * 0.7; l.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(g); o.start(); l.start(); os.push(o, l); }
  });
  if (mood === 'tithe' || mood === 'boss') { const o = ctx.createOscillator(), og = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'sine'; o.frequency.value = notes[0] / 2; og.gain.value = 0; l.type = 'square'; l.frequency.value = mood === 'boss' ? 2.4 : 1.2; lg.gain.value = 0.3; l.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(g); o.start(); l.start(); os.push(o, l); }
  g.gain.setTargetAtTime(1, t, 1.5); pad = { g, os };
}
