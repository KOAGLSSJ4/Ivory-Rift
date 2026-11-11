// story.js — Chapter One: The Tithe. Beats, dialogue, objectives, checkpoints, and the three endings.
import { G, spawn, makePlayer, reset, fx, sfx, isEnemy, kill, updateNpc } from './sim.js';
import { P, platformAt, findStandable } from './world.js';
import { makeBoss } from './enemies.js';
import { setMood } from './render.js';
import * as UIm from './ui.js';
import { UI } from './ui.js';
import { music, play } from './audio.js';
import { dist, clamp, damp, rand } from './util.js';

const KBD = (k) => `<kbd>${k}</kbd>`;
const CANCEL = { cancel: true };
export const S = { gen: 0, checkpoint: 'wake', pages: new Set(), started: false, door: 100, beat: '', waits: [], N: {}, onEnd: null, save: () => {} };
let N = S.N, F = G.flags;

// ---------------- sequencing ----------------
function until(fn) { const g = S.gen; return new Promise((res, rej) => S.waits.push({ fn, res, rej, g })); }
function wait(s) { let t = 0; return until((rdt) => (t += rdt) >= s); }
async function say(lines) { const g = S.gen, p = G.player; p.locked = true; await UIm.say(lines); if (g !== S.gen) throw CANCEL; if (!G.cine.active) p.locked = false; }
function shot(o) { Object.assign(G.cine, { k: 2.5, fov: 36 }, o, { active: true }); G.mode = 'cine'; G.player.locked = true; UIm.cinema(true); UIm.hud(false); }
function endCine() { G.cine.active = false; G.mode = 'play'; G.player.locked = false; UIm.cinema(false); UIm.hud(true); }
const ramp = (key, to, secs) => { const from = F[key] || 0; let t = 0; return until((rdt) => { t += rdt; F[key] = from + (to - from) * clamp(t / secs, 0, 1); return t >= secs; }); };
const obj = (head, text, list) => { S.obj = { head, text, list }; UIm.objective(head, text, typeof list === 'function' ? list() : list); };
const mark = (...m) => { UI.markers = m; };
const hint = (h, key) => UIm.hint(h, key);
const bark = (who, text, secs) => UIm.sub(who, text, secs || Math.max(3, text.length * 0.065));
const mood = (m, secs) => { setMood(m, secs); music(m); S.mood = m; };
const count = (k) => G.ents.filter((e) => e.kind === k && !e.dead).length;
const foes = (tag) => G.ents.filter((e) => isEnemy(e) && (!tag || e.tag === tag) && e.kind !== 'nest').length;
const near = (x, z, r) => dist(G.player.x, G.player.z, x, z) < r;

// ---------------- cast ----------------
const SPOTS = [[21, 41], [23, 45], [18, 43.5], [25, 39.5], [27, 45.5], [20.5, 47.5], [17, 39.5], [26, 42.5], [23, 38]];
function npc(name, look, x, z, o = {}) { const e = spawn('npc', x, z, { look, name, ...o }); N[name] = e; return e; }
function toShelter(e, i, speed = 5) { e.act = 'idle'; e.rescuable = false; e.goal = { x: 40.5, z: 42, near: 1.6, speed, then: () => { e.goal = { x: SPOTS[i][0], z: SPOTS[i][1], near: 0.6, speed: 3.5, yaw: 1.57 }; } }; }
function inShelter(e, i) { e.x = SPOTS[i][0]; e.z = SPOTS[i][1]; e.yaw = 1.57; e.goal = null; e.act = 'idle'; e.level = null; e.y = 0; }
const PAGES = [
  { x: 54.5, z: 12.5, lvl: true, text: 'A Sovereign is the hand of the Throne upon a world. It does not ask. It writes.' },
  { x: 119, z: 15, lvl: true, text: 'The Tithe is paid in Sovereign fire. The Gate does not ask whose.' },
  { x: 23.5, z: 79.5, text: 'Ninth of nine. Sent to tithe the Whitepan. Did not report. Struck from the roll.' },
  { x: 51, z: 65.3, lvl: true, text: 'A Reckoner carries a Mandate: one coal of Sovereign fire, lent by the Throne, to be returned.' },
];
const ORDER = ['wake', 'tithe', 'rescues', 'siege', 'boss', 'choice'];

// build the world as it stands at a checkpoint
function stage(id) {
  const at = ORDER.indexOf(id);
  reset(); UIm.cancelDialogue(); UIm.card(''); UI.markers = []; UI.interacts = []; hint('');
  for (const k in F) delete F[k]; for (const k in N) delete N[k];
  F.truths = []; S.door = 100; S.flags = {};
  const start = { wake: [16, 46, 1.57], tithe: [82, 47, 1.2], rescues: [88, 52, 3.1], siege: [59, 43, -1.57], boss: [72, 45, 1.57], choice: [84, 50, 0.4] }[id];
  const p = (G.player = makePlayer(start[0], start[1])); p.yaw = p.aimYaw = start[2];
  G.cine.active = false; G.mode = 'play'; UIm.cinema(false); UIm.hud(true); UIm.fade(false);
  // props
  for (const [x, z] of [[44, 50], [45.4, 51], [60, 36], [73, 52], [103, 49]]) spawn('crate', x, z);
  for (const [x, z] of [[61, 52], [42, 26], [59.5, 24], [78, 62], [100, 55], [56, 62]]) spawn('drum', x, z);
  spawn('girder', 44, 59, { yaw: 0.3 }); spawn('panel', 36, 84, {});
  const eng = spawn('engine', P.engine.x, P.engine.z, { questItem: true });
  PAGES.forEach((pg, i) => { if (S.pages.has(i)) return; const l = pg.lvl ? platformAt(pg.x, pg.z) : null; spawn('page', pg.x, pg.z, { y: l ? l.h : 0, idx: i }); });
  // people
  const pip = npc('pip', 'pip', 22, 45), mara = npc('mara', 'mara', 49, 18.6, { yaw: 2.6 }), tobe = npc('tobe', 'tobe', 99, 37.4, { yaw: 3.1 });
  tobe.level = platformAt(99, 37.4); tobe.y = tobe.level.h;
  const a = npc('ada', 't1', 84, 51, { yaw: 1 }), kit = npc('kit', 't4', 85.3, 51.6, { yaw: -1 }), o1 = npc('oren', 't0', 79.5, 37, { yaw: 3.1 }), o2 = npc('sefa', 't2', 97, 56, { yaw: 0 }), o3 = npc('bly', 't3', 79, 55.4, { yaw: 0 });
  S.flags.engineIn = at >= 1; if (at >= 1) setEngine(eng);
  if (at >= 1) {
    F.tithe = 1; F.gate = 1; F.awake = true; F.towerLean = 0.8; F.fires = [{ x: 110, z: 36, r: 1.5 }]; mood('tithe', 0.01);
    inShelter(pip, 0); inShelter(o1, 5); inShelter(o2, 6); inShelter(o3, 7);
    a.dead = true; kit.dead = true; tobe.act = 'cower';
  } else mood('morning', 0.01);
  if (at >= 2) { F.towerLean = 0; inShelter(tobe, 1); }
  if (at >= 3) { inShelter(mara, 2); const a2 = npc('ada', 't1', 0, 0), k2 = npc('kit', 't4', 0, 0); inShelter(a2, 3); inShelter(k2, 4); spawn('pod', 43.5, 44.5, {}); }
  if (at >= 5) { F.descend = 0.35; }
  p.auth = 0;
}
function setEngine(e) { e.x = 54.4; e.z = 29.5; e.y = 1.16; e.pinned = true; e.grab = false; e.held = false; e.questItem = false; e.hover = 1.16; }

export function start(id = 'wake') {
  S.gen++; for (const w of S.waits) w.rej(CANCEL); S.waits.length = 0;
  S.checkpoint = id; S.started = true; stage(id);
  run(id).catch((e) => { if (e !== CANCEL) { console.error(e); throw e; } });
}
function checkpoint(id) { S.checkpoint = id; S.save(id); }
async function run(id) {
  let i = ORDER.indexOf(id);
  for (; i < ORDER.length; i++) { S.beat = ORDER[i]; await BEATS[ORDER[i]](); }
}

// ---------------- the beats ----------------
const BEATS = {
  async wake() {
    const p = G.player, pip = N.pip;
    shot({ px: 25, py: 3.0, pz: 53, lx: 17.5, ly: 1.5, lz: 46, cut: true, fov: 34 }); UIm.fade(true, false, true);
    await wait(0.3); UIm.fade(false); UIm.card('<small>Eleven years after the fall</small>Lastwell, on the Whitepan');
    await wait(2.6); UIm.card('');
    pip.goal = { x: 18.6, z: 46.4, speed: 5, near: 0.5 }; pip.face = p;
    await wait(1.1);
    await say([['Pip', "Vel. Vel! You're awake, I can tell. Your tail's doing the thing."], ['Vellum', 'It is not doing a thing.'],
      ['Pip', "Mara says the truck's dead and the scrap-ticks are back. She says, I'm quoting, 'fetch me the lizard.'"], ['Vellum', 'I am not a lizard.'],
      ['Pip', "I told her! I said you're a dragon, and you fell out of the sky, and you can do anything."], ['Pip', "...Can I ride? I'm riding."]]);
    pip.ride = true; pip.goal = null; play('grip', 0.5);
    endCine();
    obj('Morning', "Walk out to Mara's workshop."); mark({ x: 49, z: 20, label: 'Mara' });
    hint(`${KBD('W')}${KBD('A')}${KBD('S')}${KBD('D')} to walk. He looks where the mouse is.`, 'move');
    await until(() => near(50, 19, 7.5));
    hint(''); mark();
    N.mara.face = p;
    await say([['Mara', "There he is. Engine's on the floor, truck's on the apron. Put the one in the other."], ['Mara', 'Gently. That block is older than you are.'], ['Pip', "Nothing's older than him. He's from space."]]);
    const eng = G.ents.find((e) => e.kind === 'engine');
    obj('Chores', 'Put the engine in the truck.'); mark({ ent: eng, label: 'Engine', h: 2.2, hide: 5 }, { x: 54.4, z: 29.5, label: 'Truck', h: 3 });
    hint(`Look at the engine and press ${KBD('E')} to <b>Grip</b> it. Carry it with the mouse. ${KBD('E')} again sets it down.`, 'grip');
    await until(() => (eng.held ? dist(eng.x, eng.z, 54.4, 29.5) < 1.4 : dist(eng.x, eng.z, 54.4, 29.5) < 3.6));
    if (p.tk.ent === eng) p.tk.ent = null; setEngine(eng); S.flags.engineIn = true; play('slam', 0.6); fx('dust', { x: 54.4, z: 29.5 }); mark(); hint('');
    bark('Mara', 'Huh. Gentle. Now the ticks: they have nested in my scrap pile again.');
    const nest = spawn('nest', P.tickNest.x, P.tickNest.z, { active: true, cd: 0.5 });
    for (let i = 0; i < 6; i++) spawn('tick', nest.x + rand(-3, 3), nest.z + rand(-3, 3), { chew: nest });
    let k0 = G.stats.kills;
    obj('Chores', 'Clear the scrap-ticks out of the yard.'); mark({ ent: nest, label: 'Tick nest', h: 3, hide: 6 });
    await until(() => near(nest.x, nest.z, 15));
    hint(`Hold ${KBD('Left click')} for the <b>Lance</b>: a precise beam. Sweep it across them.`, 'lance');
    await until(() => G.stats.kills - k0 >= 3 || nest.dead);
    hint(`${KBD('Right click')} for <b>Claws</b>. Three strikes; the third is his tail.`, 'claws');
    k0 = G.stats.kills; await until(() => G.stats.kills - k0 >= 4 || nest.dead);
    hint(`The nest keeps hatching them. Hold ${KBD('Q')} to gather a <b>Burst</b>, release to throw it.`, 'burst');
    await until(() => nest.dead);
    for (const e of G.ents) if (e.kind === 'tick') kill(e);
    hint(''); mark(); await wait(0.8);
    await say([['Pip', "My kite's still on Mara's roof. You could just... go there. Like you do."]]);
    obj('Chores', 'Blink onto the workshop roof.'); mark({ x: 51, z: 16, y: 4.2, label: 'Roof', h: 1.5, hide: 0 });
    hint(`Look at the roof and press ${KBD('Space')} to <b>Blink</b>. He arrives wherever he is looking.`, 'blink');
    await until(() => p.level && p.level.h > 4 && p.x < 60 && p.z < 24);
    hint(''); mark(); bark('Pip', 'AGAIN. Again again again.');
    await wait(2.2); await until(() => !p.level);
    N.mara.face = p;
    await say([['Mara', 'Truck turns over. First time since the rains. Take the kid to market, will you?'], ['Mara', 'And, Vellum. Eleven years today, since we dug you out of the glass. Thought you should know somebody counted.'], ['Vellum', '...I counted too.']]);
    obj('Morning', 'Take Pip to the well in the market square.'); mark({ x: P.well.x, z: P.well.z, label: 'The well', h: 4 });
    hint('No hurry. Lost pages glint around Lastwell, and rooftops are worth a look.', 'explore');
    await until(() => near(P.well.x, P.well.z, 22)); hint('');
    await until(() => near(P.well.x, P.well.z, 10.5));
    // ---- the Tithe arrives
    mark(); const pip2 = N.pip; const sp = findStandable(p.x + 1.6, p.z + 1.2, 0.5);
    shot({ px: 80, py: 5.5, pz: 60, lx: 92, ly: 3.2, lz: 42, fov: 40, k: 1.6 });
    pip2.ride = false; pip2.x = sp.x; pip2.z = sp.z; pip2.y = 0; pip2.act = 'wave'; pip2.face = N.tobe; N.tobe.face = p;
    await say([['Pip', 'Tobe! Tobe, look, I rode the whole way!'], ['Tobe', 'I see you, small one. Morning, Vellum. Come to stare at a dry hole with the rest of us?'], ['Tobe', "Eleven years I have hauled water up this tower. I still half expect the well to remember what it's for."]]);
    pip2.act = 'idle';
    shot({ px: 84, py: 2.2, pz: 62, lx: 88, ly: 34, lz: 44, fov: 52, k: 1.2 }); mood('tithe', 3.5); play('gate'); G.shake = 0.5;
    await ramp('gate', 1, 2.6);
    shot({ px: 76, py: 7, pz: 62, lx: 88, ly: 5, lz: 45, fov: 42, k: 2.2 });
    F.tithe = 1; fx('slam', { x: P.well.x, z: P.well.z }); fx('bigRing', { x: P.well.x, z: P.well.z, col: 'violet', r1: 46 }); play('boom', 1.2); G.shake = 1.2; F.towerLean = 0.8; F.fires = [{ x: 110, z: 36, r: 1.5 }];
    N.tobe.act = 'cower'; for (const n of ['ada', 'kit', 'oren', 'sefa', 'bly']) N[n].act = 'cower';
    await wait(1.4);
    const v = makeBoss(88, 41.5); v.passive = true; v.invuln = true; v.rise = 2.2; v.yaw = Math.atan2(p.x - 88, p.z - 41.5); fx('blinkV', { x: 88, z: 41.5 }); play('summon');
    await wait(0.9);
    await say([['Reckoner Vasht', 'Lastwell. Eleven years in arrears.'], ['Reckoner Vasht', 'The Tithing Throne is here for what it is owed. And for what it lost.'], ['Reckoner Vasht', 'Sovereign Nine. You are a long way from your leash.'],
      ['Pip', 'His name is VELLUM.'], ['Reckoner Vasht', 'It has a name. How generous of you.'], ['Reckoner Vasht', 'Collect the town. Bring me the Sovereign last. I want it to watch.']]);
    fx('blinkV', { x: v.x, z: v.z }); play('blink'); v.dead = true; G.bossRef = null;
    for (const [x, z] of [[92, 50], [84, 40], [95, 44]]) spawn('tally', x, z, { materialize: true, tag: 'plaza', passive: true });
    await wait(0.8);
    await say([['Vellum', 'Pip. Hangar. Bar the door. Do not open it for anyone who is not me.'], ['Pip', "You're coming back. Say it."], ['Vellum', 'I am coming back.']]);
    toShelter(N.pip, 0, 6.5); toShelter(N.oren, 5, 5.5); toShelter(N.sefa, 6, 5.5); toShelter(N.bly, 7, 5.5);
    N.ada.dead = true; N.kit.dead = true;   // the Okoros ran for the scrapyard pod
    for (const e of G.ents) if (e.tag === 'plaza') e.passive = false;
    endCine(); checkpoint('tithe');
  },

  async tithe() {
    const p = G.player; F.awake = true;
    obj('The Tithe', 'Break the collectors in the square.');
    if (!foes('plaza')) for (const [x, z] of [[92, 50], [84, 40], [95, 44]]) spawn('tally', x, z, { materialize: true, tag: 'plaza' });
    UIm.toast('Authority wakes'); hint('Something old is waking in him. <b>Authority</b> fills as he fights.', 'auth');
    await until(() => foes('plaza') <= 1);
    hint(''); for (const [x, z, k] of [[80, 50, 'tally'], [96, 40, 'tally'], [100, 52, 'lancer']]) spawn(k, x, z, { materialize: true, tag: 'plaza' });
    await wait(1.5); hint(`Lancers draw a line before they fire. Step off it, or send the bolt back with ${KBD('Right click')}.`, 'lancer');
    await until(() => foes('plaza') === 0); hint('');
    // the tower goes
    G.shake = 0.9; play('slam'); F.towerLean = 0.92; bark('Tobe', "Vellum! She's going over!", 5);
    p.auth = 100; UIm.toast('Authority is full');
    obj('The Tithe', 'The water tower is falling. Rewrite it.'); mark({ x: 99, z: 35, y: 6, label: 'Tobe', warn: true, h: 3, hide: 0 });
    hint(`${KBD('R')} <b>Rewrite.</b> The world stops. Choose a truth, and change it.`, 'rewrite');
    let fixed = false;
    F.truths.push({ x: 99, y: 9.5, z: 34, from: 'THE TOWER · FALLING', to: 'STANDING', range: 60, apply: () => { fixed = true; } });
    await until(() => fixed);
    F.truths.length = 0; F.towerLean = 0; play('choir', 0.6); hint('');
    await wait(1.3); N.tobe.act = 'idle';
    await say([['Tobe', '...What did you just do?'], ['Vellum', 'I changed my mind about it.']]);
    N.tobe.rescuable = true;
    obj('The Tithe', 'The ladder is gone. Bring Tobe down.'); mark({ ent: N.tobe, label: 'Tobe', h: 2.6, hide: 0 });
    hint(`Look at Tobe and ${KBD('E')} <b>Grip</b> him. Set him on the ground with ${KBD('E')}. People are carried, never thrown.`, 'carry');
    await until(() => !N.tobe.held && !N.tobe.level && N.tobe.y < 0.3 && !N.tobe.air);
    hint(''); mark(); bark('Tobe', "Feet on the ground. I'll take it. Go, the others need you more!");
    toShelter(N.tobe, 1); checkpoint('rescues');
  },

  async rescues() {
    const p = G.player; let maraDone = false, podDone = false, maraUp = false, podUp = false, harass = false;
    const mara = N.mara, list = () => [{ text: 'Tobe', done: true }, { text: 'Mara, at her workshop', done: maraDone }, { text: 'The Okoros, sealed in a scrapyard pod', done: podDone }];
    const refresh = () => { obj('Lastwell', 'Bring everyone to Hangar Nine.', list); mark(...[!maraDone && { ent: mara, label: 'Mara', warn: true, h: 3.2, hide: 4 }, !podDone && { ent: pod, label: pod.held ? 'The Okoros' : 'Shelter pod', warn: true, h: 3.6, hide: 4 }, !podDone && pod.held && { x: 43.5, z: 43, label: 'Set down here', h: 1 }].filter(Boolean)); };
    mara.x = 48.6; mara.z = 19.2; mara.act = 'pinned'; mara.pinned = true; mara.yaw = 1.2;
    const gird = spawn('girder', 48.9, 19.3, { yaw: 0.5, pinned: true, questItem: true, y: 0.35, hover: 0 });
    const pod = spawn('pod', P.pod.x, P.pod.z, { questItem: true });
    F.fires = [{ x: 110, z: 36, r: 1.5 }, { x: 56.5, z: 12.5, r: 1.4 }];
    refresh();
    const jobs = [
      (async () => {   // Mara's workshop
        await until(() => near(50, 20, 27));
        spawn('bailiff', 53, 25, { tag: 'shop', yaw: 0 }); spawn('tally', 47, 26, { tag: 'shop' }); spawn('tally', 56, 22, { tag: 'shop' }); spawn('lancer', 46, 13, { tag: 'shop' });
        await until(() => near(53, 25, 17));
        hint(`A Bailiff's shield stops the Lance. Look at him and ${KBD('Space')} to arrive behind him, or ${KBD('E')} to take the shield away.`, 'bailiff');
        bark('Mara', "Don't mind me. I'll just lie here under my own roof.", 5);
        await until(() => !gird.pinned || gird.dead); maraUp = true; mara.pinned = false; mara.act = 'kneel'; hint('');
        await until(() => foes('shop') === 0);
        mara.act = 'idle'; mara.face = p;
        await say([['Mara', 'They walked through my wall like it was paper. Thirty years of welds.'], ['Mara', "Go on, I can walk. Don't you dare carry me."]]);
        toShelter(mara, 2, 4.4); maraDone = true; refresh();
      })(),
      (async () => {   // the pod in the scrapyard
        await until(() => near(pod.x, pod.z, 30));
        spawn('stake', 52, 73, { tag: 'yard' });
        for (const [x, z] of [[51, 65.3], [43, 68.3]]) { const l = spawn('lancer', x, z, { tag: 'yard', hold: true }); l.level = platformAt(x, z); l.y = l.level.h; }
        spawn('tally', 53, 78, { tag: 'yard' }); spawn('tally', 44, 78, { tag: 'yard' }); spawn('drone', 56, 82, { tag: 'yard' }); spawn('drone', 42, 82, { tag: 'yard' });
        await until(() => near(pod.x, pod.z, 19));
        hint(`Soldiers near a Stake are warded. ${KBD('E')} rips it out of the ground. ${KBD('Left click')} throws what he holds.`, 'stake');
        bark('Ada Okoro', 'Hello? Is that the dragon? The door has fused. We cannot get out!', 5);
        await until(() => near(pod.x, pod.z, 9) && foes('yard') <= 2);
        hint(`${KBD('E')} Grip the whole pod. Carry it to Hangar Nine and set it down by the door.`, 'pod');
        await until(() => pod.held); podUp = true; refresh(); bark('Kit Okoro', 'We are FLYING. Mama, we are flying!', 4);
        await until(() => pod.z < 66 || (!pod.held && dist(pod.x, pod.z, 43.5, 43) < 7));
        if (!harass) { harass = true; for (const [x, z, k] of [[52, 57, 'tally'], [47, 55, 'tally'], [56, 52, 'tally'], [50, 50, 'drone']]) spawn(k, x, z, { materialize: true, tag: 'yard' }); hint('Set the pod down to fight, or swing it through them.', 'podfight'); }
        await until(() => !pod.held && !pod.air && dist(pod.x, pod.z, 43.5, 43) < 7.5);
        pod.grab = false; pod.questItem = false; hint(''); play('crack'); fx('debris', { x: pod.x, y: 1, z: pod.z + 1.2 });
        const s1 = findStandable(pod.x + 0.6, pod.z + 2.6, 0.5), a = npc('ada', 't1', s1.x, s1.z), k = npc('kit', 't4', s1.x - 1, s1.z + 0.5); a.face = k.face = p; k.act = 'cheer';
        bark('Ada Okoro', 'Never again. Thank you. Never, ever again.', 4);
        await wait(2.2); toShelter(a, 3); toShelter(k, 4); podDone = true; refresh();
      })(),
    ];
    const tick = until(() => { if ((pod.held ? 1 : 0) !== S._ph) { S._ph = pod.held ? 1 : 0; refresh(); } return maraDone && podDone; });
    await Promise.all([...jobs, tick]);
    mark(); checkpoint('siege');
  },

  async siege() {
    const p = G.player, door = { x: 39.5, z: 42, dead: false, r: 1 };
    const list = () => [{ text: 'The hangar door', val: Math.max(0, Math.ceil(S.door)) + '%', warn: S.door < 50 }];
    F.fires = [{ x: 110, z: 36, r: 1.5 }, { x: 56.5, z: 12.5, r: 1.4 }];
    S.door = 100; S.siege = door; obj('Hangar Nine', 'Everyone is inside. Hold the door.', list); mark({ x: 39.5, z: 42, label: 'The door', warn: true, h: 5, hide: 14 });
    bark('Pip', "Vel! They're coming for the door!", 4);
    await until(() => near(42, 42, 24));
    for (const [x, z, k] of [[60, 38, 'tally'], [61, 46, 'tally'], [58, 52, 'tally'], [57, 33, 'tally'], [62, 42, 'drone'], [60, 50, 'drone']]) spawn(k, x, z, { materialize: true, tag: 'siege', target: door });
    await until(() => foes('siege') === 0);
    await wait(1.2);
    spawn('stake', 54, 43, { materialize: true, tag: 'siege' });
    for (const [x, z, k] of [[58, 42, 'bailiff'], [60, 36, 'lancer'], [60, 49, 'lancer'], [56, 38, 'tally'], [56, 47, 'tally']]) spawn(k, x, z, { materialize: true, tag: 'siege', target: k === 'lancer' ? null : door });
    hint(`Anything he Grips can be thrown with ${KBD('Left click')}: drums, crates, girders, soldiers.`, 'throw');
    await until(() => foes('siege') === 0);
    S.siege = null; hint(''); mark(); obj('Hangar Nine', 'The door held.');
    await wait(1.4); play('gate', 0.6); G.shake = 0.6;
    await say([['Pip', 'Vel? Is it over? It got really quiet.'], ['Reckoner Vasht', 'Enough. Bring it to the Well. I will collect it myself.'], ['Vellum', 'Stay inside, Pip.']]);
    checkpoint('boss');
  },

  async boss() {
    const p = G.player;
    F.fires = [{ x: 110, z: 36, r: 1.5 }];
    obj('The Reckoner', 'Go to the well. End this.'); mark({ x: P.well.x, z: P.well.z, label: 'The Well', warn: true, h: 5, hide: 12 });
    await until(() => near(P.well.x, P.well.z, 13.5)); mark();
    const b = makeBoss(90, 39.5); b.passive = true; b.invuln = true; b.rise = 3; b.yaw = Math.atan2(p.x - b.x, p.z - b.z); fx('blinkV', { x: b.x, z: b.z }); play('summon');
    shot({ px: p.x - 5, py: 3.4, pz: p.z + 8, lx: 90, ly: 3.4, lz: 39.5, fov: 38, k: 2 }); p.lookAt = b;
    const drop = until((rdt) => { b.rise = damp(b.rise, 0, 1.2, rdt); return b.rise < 0.05; });
    await say([['Reckoner Vasht', 'Nine Sovereigns the Throne made. Eight still kneel.'], ['Reckoner Vasht', 'You were sent to tithe this world. Instead you slept in its dirt and let it name you.'], ['Vellum', 'It was a good sleep. They are good names.'], ['Reckoner Vasht', 'Then keep the name. I only need the fire.']]);
    await drop; b.rise = 0; b.passive = false; b.invuln = false; b.fighting = true; p.lookAt = null;
    mood('boss', 2); endCine(); obj('The Reckoner', 'Bring him down.');
    hint(`He draws every attack before it lands. Bolts can be sent back with ${KBD('Right click')}.`, 'boss1');
    S.bossHints = true; let down = false; S.onBossDown = () => { down = true; };
    await until(() => down); S.bossHints = false; hint('');
    for (const e of G.ents) if (isEnemy(e) && e.kind !== 'boss') kill(e);
    G.slow = 1.2; play('shatter'); S.vasht = { x: b.x, z: b.z };
    await wait(1.6); checkpoint('choice');
  },

  async choice() {
    const p = G.player; let b = G.bossRef;
    const at = S.vasht || { x: 91, z: 40.5 };
    if (!b || b.dead) { b = makeBoss(at.x, at.z); }
    Object.assign(b, { hp: 1, invuln: true, passive: true, act: 'kneel', warded: false, stagger: 0, fighting: false, noCrest: true, yaw: Math.atan2(P.well.x - b.x, P.well.z - b.z + 6) });
    G.tele.length = 0; mood('boss', 1); F.tithe = 1; F.gate = 1; F.awake = true; F.fires = [{ x: 110, z: 36, r: 1.5 }];
    const crest = spawn('crest', b.x + 1.3, b.z + 0.7, { questItem: true, pinned: true });
    shot({ px: b.x - 7, py: 2.6, pz: b.z + 9, lx: b.x + 0.6, ly: 1.9, lz: b.z, fov: 34, k: 2 }); p.lookAt = b;
    await wait(0.8);
    await say([['Reckoner Vasht', 'It changes nothing. The Gate is open, and the Gate is hungry.'], ['Reckoner Vasht', 'It will drink every fire in this town, down to the smallest. Unless it is paid in Sovereign fire.'],
      ['Reckoner Vasht', 'So. Walk into the Well and burn out, and they live. Or kneel, come home on your leash, and I close it myself.'], ['Reckoner Vasht', 'Those are the only two sums there are.']]);
    const pip = N.pip; pip.x = 72; pip.z = 45; pip.goal = { x: p.x - 2, z: p.z + 1.6, speed: 7, near: 1 }; pip.face = p;
    shot({ px: P.well.x - 16, py: 9, pz: P.well.z + 20, lx: P.well.x, ly: 7, lz: P.well.z, fov: 46, k: 1.4 });
    const hungry = ramp('hunger', 1, 3); ramp('descend', 1, 70).catch(() => {});
    await wait(1.8);
    await say([['Pip', "No. NO. Vel, there's always another thing. You said. You always say."]]);
    await hungry; p.lookAt = null; endCine(); p.auth = 100;
    obj('The Tithe', 'The Gate must be paid.', [{ text: 'Step into the Well: his fire for theirs' }, { text: 'Kneel to Vasht: go home on the leash' }]);
    F.truths.push({ x: P.well.x, y: 6, z: P.well.z, from: 'THE TITHE · OWED', to: 'UNWRITTEN', range: 60, locked: 'A Tithe cannot be unwritten. Only paid.' });
    let pick = null, t = 0, gripped = false;
    UI.interacts = [
      { x: P.well.x, z: P.well.z, r: 5.2, h: 3, label: 'Hold: step into the Well', short: 'Pay', hold: 1.8, fn: () => { pick = 'fire'; } },
      { ent: b, x: b.x, z: b.z, r: 3.6, h: 3.4, label: 'Hold: kneel to him', short: 'Kneel', hold: 1.8, fn: () => { pick = 'leash'; } },
    ];
    await until((rdt) => {
      t += rdt;
      if (!gripped && crest.held) { gripped = true; bark('Reckoner Vasht', 'That is the Mandate of the Throne. Put it down. PUT IT DOWN.', 5); hint(''); obj('The Tithe', 'The Gate must be paid.', [{ text: 'Step into the Well: his fire for theirs' }, { text: 'Kneel to Vasht: go home on the leash' }, { text: 'Sovereign fire. The Gate does not ask whose.' }]); mark({ x: P.well.x, z: P.well.z, label: 'The Well', h: 5, hide: 0 }); }
      if (!gripped) {
        if (t > 22 && !S.flags.h1) { S.flags.h1 = 1; bark('Pip', 'There has to be something else. Look at everything. LOOK.', 5); }
        if (t > 48 && !S.flags.h2) { S.flags.h2 = 1; bark('Pip', "Vel... that light off his staff. It's the same colour as yours.", 6); }
        if (t > 80 && !S.flags.h3) { S.flags.h3 = 1; hint('Sovereign fire. The Gate does not ask whose. And Grip takes things from those who hold them.', 'h3'); }
      }
      if (!crest.dead && dist(crest.x, crest.z, P.well.x, P.well.z) < 3.7) pick = 'true';
      return !!pick;
    });
    UI.interacts = []; mark(); hint(''); F.truths.length = 0;
    await ENDINGS[pick](b, crest, pip);
  },
};

function stats() { const s = G.stats, m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60); return [['Time', `${m}:${String(sec).padStart(2, '0')}`], ['Collectors unmade', s.kills], ['Lost pages', `${S.pages.size} / ${PAGES.length}`]]; }
function closeGate() { fx('skyLance'); fx('bigRing', { x: P.well.x, z: P.well.z, r1: 60, dur: 1.6 }); play('choir'); play('boom', 1.2); G.shake = 1.4; }
function townOut(act) { const ring = [[81, 50], [83, 53.5], [86.5, 55], [90.5, 55], [94, 53], [95.5, 49.5], [80.5, 46]]; ['tobe', 'mara', 'ada', 'kit', 'oren', 'sefa', 'bly'].forEach((n, i) => { const e = N[n]; if (!e || e.dead) return; e.x = ring[i][0]; e.z = ring[i][1]; e.goal = null; e.face = { x: P.well.x, z: P.well.z }; e.yaw = Math.atan2(P.well.x - e.x, P.well.z - e.z); e.act = act; }); }

const ENDINGS = {
  async true(b, crest, pip) {
    const p = G.player; if (p.tk.ent === crest) { p.tk.ent = null; } crest.held = true; crest.pinned = false;
    shot({ px: P.well.x - 13, py: 6, pz: P.well.z + 17, lx: P.well.x, ly: 6, lz: P.well.z, fov: 44, k: 1.6 });
    let t = 0; await until((rdt) => { t += rdt; crest.x = damp(crest.x, P.well.x, 3, rdt); crest.z = damp(crest.z, P.well.z, 3, rdt); crest.y = 1.5 + t * t * 5; return t > 1.5; });
    crest.dead = true; closeGate(); await ramp('paid', 1, 1.0);
    shot({ px: P.well.x - 10, py: 2.5, pz: P.well.z + 22, lx: P.well.x, ly: 40, lz: P.well.z, fov: 55, k: 1.2 });
    await wait(1.2); fx('gateBreak'); play('shatter'); F.gate = 0; F.descend = 0; mood('gold', 4); await ramp('tithe', 0, 2.2); F.hunger = 0; F.fires = [];
    shot({ px: b.x - 6, py: 2.4, pz: b.z + 8, lx: b.x, ly: 1.8, lz: b.z, fov: 36, k: 2 }); p.lookAt = b;
    await say([['Reckoner Vasht', "You paid a world's Tithe with a Reckoner's Mandate."], ['Vellum', 'The Gate did not ask whose fire it was.'], ['Reckoner Vasht', 'Do you understand what the Throne sends, when a Reckoner comes home with empty hands?'], ['Vellum', 'Tell them Lastwell is paid in full. Tell them my name is Vellum.']]);
    fx('blinkV', { x: b.x, z: b.z }); play('blink'); b.dead = true; G.bossRef = null; p.lookAt = pip;
    townOut('idle'); pip.goal = { x: p.x + 1.4, z: p.z + 0.8, speed: 6, near: 0.6 };
    shot({ px: p.x + 5, py: 2.6, pz: p.z + 7, lx: p.x, ly: 1.8, lz: p.z, fov: 34, k: 2 });
    await wait(1.4);
    await say([['Pip', "You're still you. You've still got all of it. I can tell, your eyes are doing the thing."], ['Vellum', 'They are not doing a thing.']]);
    p.lookAt = null; endCine(); p.auth = 100; p.hp = p.maxHp;
    obj('Lastwell', 'One more thing.'); mark({ x: P.well.x, z: P.well.z, label: 'The well', h: 4, hide: 0 });
    hint(`Authority is full. ${KBD('R')}, and look at the well.`, 'well');
    let done = false; F.truths.push({ x: P.well.x, y: 4, z: P.well.z, from: 'THE WELL · DRY', to: 'FLOWING', range: 80, apply: () => { done = true; } });
    await until(() => { if (p.auth < 100 && !G.rewrite.active && !done) p.auth = 100; return done; });
    F.truths.length = 0; hint(''); mark(); F.wellFlow = 2; F.bloom = true; play('bell'); play('choir', 0.8); townOut('cheer');
    shot({ px: P.well.x - 9, py: 4.5, pz: P.well.z + 13, lx: P.well.x, ly: 2.4, lz: P.well.z, fov: 40, k: 1.4 });
    await wait(3.2); F.wellFlow = 1;
    await say([['Tobe', 'Eleven years. Eleven years I hauled that water.'], ['Mara', "Don't just stand there. Somebody get a bucket."], ['Pip', 'Can you do that to anything?'], ['Vellum', 'I do not know yet.'], ['Pip', '...Can I ride?']]);
    pip.ride = true; pip.goal = null; play('grip', 0.5);
    shot({ px: p.x - 7, py: 3.2, pz: p.z + 10, lx: p.x, ly: 2.4, lz: p.z, fov: 30, k: 0.5 });
    await wait(2.2); UIm.card('Pale Sovereign', true); await wait(3.4); UIm.card('');
    finish({ eyebrow: 'Chapter One complete · the best ending', title: 'Paid in Full', text: 'Everyone in Lastwell is alive. The well is running. Vellum kept every power he has, and found one more than he knew about. Somewhere past the broken ring, a Reckoner is explaining himself.', tease: 'Chapter Two · What the Throne Sends', stats: stats() });
  },
  async fire(b, crest, pip) {
    const p = G.player;
    shot({ px: P.well.x - 12, py: 5, pz: P.well.z + 16, lx: P.well.x, ly: 3, lz: P.well.z, fov: 42, k: 1.6 });
    p.rewritePose = true; let t = 0; await until((rdt) => { t += rdt; p.x = damp(p.x, P.well.x - 2.4, 2, rdt); p.z = damp(p.z, P.well.z + 2.4, 2, rdt); p.yaw = Math.atan2(P.well.x - p.x, P.well.z - p.z); return t > 1.8; });
    closeGate(); UIm.fade(true, true); await ramp('paid', 1, 1.0); await wait(0.8);
    p.powerless = true; p.rewritePose = false; p.kneel = true; p.en = 0; p.auth = 0; F.gate = 0; F.descend = 0; F.tithe = 0; F.hunger = 0; F.fires = []; F.awake = false; mood('grey', 0.5); crest.dead = true;
    UIm.fade(false, true); shot({ px: p.x - 5, py: 2.2, pz: p.z + 7, lx: p.x, ly: 1.4, lz: p.z, fov: 34, k: 2, cut: true });
    await wait(1.6);
    await say([['Reckoner Vasht', 'Paid. ...What a waste of a Sovereign.']]);
    fx('blinkV', { x: b.x, z: b.z }); b.dead = true; G.bossRef = null; townOut('idle'); pip.goal = { x: p.x + 1.3, z: p.z + 0.8, speed: 6, near: 0.6 }; pip.face = p;
    await wait(1.6);
    await say([['Pip', 'Your eyes. Vel, your eyes went out.'], ['Vellum', 'I can still see you.']]);
    await wait(1.2);
    finish({ eyebrow: 'An ending · the fire paid', title: 'The Dragon Who Stayed', text: 'Lastwell lives. The well is still dry, and so is he: no Lance, no Blink, no Authority. He would make the same trade again. But the Gate never asked whose fire it was.', retry: 'Return to the choice', stats: stats() });
  },
  async leash(b, crest, pip) {
    const p = G.player;
    shot({ px: b.x - 6, py: 2.4, pz: b.z + 8, lx: b.x, ly: 1.8, lz: b.z, fov: 36, k: 2 }); p.kneel = true; p.yaw = Math.atan2(b.x - p.x, b.z - p.z);
    await wait(1.4);
    await say([['Reckoner Vasht', 'Sensible. Heel, Nine.']]);
    b.act = 'idle'; b.noCrest = false; crest.dead = true; await wait(0.8);
    fx('blinkV', { x: p.x, z: p.z }); fx('blinkV', { x: b.x, z: b.z }); play('blink'); F.hidePlayer = true; b.dead = true; G.bossRef = null;
    play('gate', 0.7); mood('empty', 3); ramp('gate', 0, 2.5).catch(() => {}); await ramp('tithe', 0, 2.5); F.hunger = 0; F.fires = [];
    shot({ px: pip.x + 4, py: 2, pz: pip.z + 6, lx: pip.x, ly: 1.2, lz: pip.z, fov: 32, k: 1.5 });
    await wait(1.5);
    await say([['Pip', 'He said he was coming back.']]);
    await wait(1.2);
    finish({ eyebrow: 'An ending · the leash', title: 'Sovereign Nine', text: 'The Gate closes. Lastwell is spared, this year. In Hangar Nine a girl keeps drawing a white dragon on the wall, a little taller each time, so he will know himself when he sees it. There was another way to pay.', retry: 'Return to the choice', stats: stats() });
  },
};
function finish(o) { G.mode = 'ending'; UIm.hud(false); UIm.ending(o); if (S.onEnd) S.onEnd(o); }

// ---------------- per-frame story logic ----------------
export function update(dt, rdt) {
  const p = G.player; if (!S.started || !p) return;
  for (let i = S.waits.length - 1; i >= 0; i--) {
    const w = S.waits[i]; let ok = false;
    try { ok = w.fn(rdt, dt); } catch (e) { S.waits.splice(i, 1); w.rej(e); continue; }
    if (ok) { S.waits.splice(i, 1); w.res(); }
  }
  if (G.mode === 'play') G.stats.time += rdt;
  for (const e of G.ents) if (e.kind === 'npc' && !e.dead) updateNpc(e, dt);
  // lost pages
  for (const e of G.ents) if (e.kind === 'page' && !e.dead && dist(p.x, p.z, e.x, e.z) < 1.5 && Math.abs(p.y - e.y) < 2.5 && G.mode === 'play') {
    e.dead = true; S.pages.add(e.idx); G.stats.pages = S.pages.size; fx('pickup', { x: e.x, z: e.z }); play('page');
    UIm.toast(`Lost page · ${S.pages.size} of ${PAGES.length}`); bark('', `“${PAGES[e.idx].text}”`, 8); if (F.awake) p.auth = 100;
  }
  // the hangar door under siege
  if (S.siege) {
    for (const e of G.ents) if (isEnemy(e) && e.target === S.siege && e.stun <= 0 && !e.held && dist(e.x, e.z, S.siege.x, S.siege.z) < 3.4 && dist(e.x, e.z, p.x, p.z) > 6) S.door -= (e.kind === 'bailiff' ? 5 : 1.6) * dt;
    if (S.obj && typeof S.obj.list === 'function') UIm.objective(S.obj.head, S.obj.text, S.obj.list());
    if (S.door <= 0 && !p.dead) { p.dead = true; fail('The door of Hangar Nine gave way.'); }
  }
  // talk / hold prompts
  let best = null, bd = 1e9;
  if (G.mode === 'play' && !p.locked && !G.rewrite.active) for (const it of UI.interacts) { const x = it.ent ? it.ent.x : it.x, z = it.ent ? it.ent.z : it.z, d = dist(p.x, p.z, x, z); if (d < it.r && d < bd) { bd = d; best = it; it.x = x; it.z = z; } }
  G.nearInteract = best;
  if (best) { if (best.hold) { if (G.input.down.interact) { UI.holdK += rdt / best.hold; if (UI.holdK >= 1) { UI.holdK = 0; best.fn(); } } else UI.holdK = 0; } else if (G.input.pressed.interact) best.fn(); } else UI.holdK = 0;
}

export function onEvent(name, data) {
  const p = G.player;
  if (name === 'fallen') fail('Vellum falls. The Tithe is collected.');
  else if (name === 'bossDown' && S.onBossDown) S.onBossDown();
  else if (name === 'rewriteLocked') bark('', data.msg, 4);
  else if (name === 'rewriteDenied') { if (F.awake) bark('', 'Authority is not full yet. It fills as he fights.', 3); }
  else if (S.bossHints) {
    if (name === 'bossPhase') hint(`His ward runs through the Stakes. ${KBD('E')} uproot one, then ${KBD('Left click')} to throw it at him.`, 'boss2');
    else if (name === 'bossTell') hint(`A ring is coming. ${KBD('Space')} Blink through it.`, 'boss3');
    else if (name === 'bossWardDown') hint('His ward is down. Everything you have.', 'boss4');
  }
}
async function fail(text) {
  const g = S.gen; G.mode = 'cine'; UIm.hud(false); UIm.card(text); UIm.fade(true);
  setTimeout(() => { if (g === S.gen) start(S.checkpoint); }, 2600);
}
