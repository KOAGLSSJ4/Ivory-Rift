// test helpers: run the simulation without rendering, press keys, skip dialogue
window.H = {
  sim(secs, fn) { window.__noRender = true; const n = Math.ceil(secs / 0.033); for (let i = 0; i < n; i++) { if (fn) fn(i); PS.step(0.033); } },
  async run(secs, fn) { const n = Math.ceil(secs / 0.033); window.__noRender = true; for (let i = 0; i < n; i++) { if (fn && fn(i) === true) return true; if (document.getElementById('dlg').hidden === false) { PS.G.input.pressed.confirm = true; } PS.step(0.033); if (i % 12 === 0) await new Promise((r) => setTimeout(r, 0)); } return false; },
  key(k, on = true) { const I = PS.G.input; if (on) { I.pressed[k] = true; I.down[k] = true; } else { I.down[k] = false; I.released[k] = true; } },
  go(x, z) { const p = PS.G.player; p.x = x; p.z = z; p.level = null; p.y = 0; },
  state() { const p = PS.G.player, S = PS.Story.S; return { beat: S.beat, cp: S.checkpoint, mode: PS.G.mode, hp: Math.round(p.hp), auth: Math.round(p.auth), obj: document.getElementById('objText').textContent, hint: document.getElementById('hint').textContent.slice(0, 60), foes: PS.G.ents.filter((e) => e.team === 'legion' && !e.dead).map((e) => e.kind).join(','), pos: [Math.round(p.x), Math.round(p.z)] }; },
};
H.S = () => { const s = H.state(); return s.beat + '|' + s.obj + '|' + s.foes + '|hp' + s.hp + '|' + s.mode; };
H.god = () => { PS.G.player.iframes = 1; PS.G.player.en = 100; };
H.killAll = () => { for (const e of PS.G.ents) if (e.team === 'legion' && !e.dead && e.kind !== 'boss') { e.hp = 0; e.dead = true; PS.G.stats.kills++; } };
H.aim = (x, z, level) => { const a = PS.G.aim; a.x = x; a.z = z; a.level = level || null; a.y = level ? level.h : 0; };
// press R, pick the first unlocked truth, confirm
H.rewrite = async () => { H.key('rewrite'); await H.run(0.5); const t = PS.G.rewrite.list.find((t) => !t.locked) || PS.G.rewrite.list[0]; if (!t) return 'no truth'; await H.run(0.4, () => { H.aim(t.x, t.z); }); H.aim(t.x, t.z); H.key('confirm'); await H.run(0.3, (i) => { if (i < 2) H.aim(t.x, t.z); }); return t.from; };
// grip entity e and carry to (x,z), then set down
H.carry = async (e, x, z) => { H.aim(e.x, e.z, e.level); H.key('tk'); await H.run(0.2, () => { H.god(); H.aim(e.x, e.z, e.level); }); if (!e.held) return 'not held'; await H.run(3, () => { H.god(); H.aim(x, z); return Math.hypot(e.x - x, e.z - z) < 0.6; }); H.key('tk'); await H.run(1.5, () => H.god()); return 'ok ' + Math.round(e.x) + ',' + Math.round(e.z) + ',' + e.y.toFixed(1); };
