// mats.js — procedural textures and the shared material library. No image files: everything is drawn at boot.
import { rng } from './util.js';
const T = window.THREE;
export const M = {};   // materials
export const TX = {};  // textures

function tex(w, h, draw, rx = 1, ry = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function speckle(g, w, h, r, n, a, lo = 0, hi = 255) {
  for (let i = 0; i < n; i++) {
    const v = (lo + r() * (hi - lo)) | 0;
    g.fillStyle = `rgba(${v},${v},${v},${a * (0.4 + r() * 0.6)})`;
    const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s);
  }
}
function blotch(g, w, h, r, n, col, a, rad) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, R = rad * (0.4 + r());
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - R, y + oy - R, R * 2, R * 2);
    }
  }
}

export function initMaterials() {
  const r = rng(9);
  // --- fish-scale height map for dragon hide (tileable)
  TX.scales = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h);
    const sx = 16, sy = 12;
    for (let row = -1; row <= h / sy + 1; row++) for (let col = -1; col <= w / sx + 1; col++) {
      const x = col * sx + (row & 1 ? sx / 2 : 0), y = row * sy;
      const gr = g.createRadialGradient(x, y - 3, 1, x, y, 10.5);
      gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(0.75, '#a8a8a8'); gr.addColorStop(1, '#161616');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 10.5, 0, Math.PI); g.arc(x, y, 10.5, Math.PI, 0); g.fill();
    }
  }, 5, 5, false);
  // --- parallel ribs for armour plates and pauldrons
  TX.ribs = tex(64, 64, (g, w, h) => {
    g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#303030'; g.fillRect(i * 16 + 7, 0, 2, h); g.fillStyle = '#d8d8d8'; g.fillRect(i * 16 + 9, 0, 1, h); }
  }, 2, 1, false);
  // --- corrugated sheet
  TX.corr = tex(64, 64, (g, w, h) => {
    for (let x = 0; x < w; x++) { const v = (150 + Math.sin(x / 8 * Math.PI * 2) * 70) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, h); }
  }, 6, 1, false);
  TX.corrCol = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#d2d0cb'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) { g.fillStyle = `rgba(0,0,0,${0.05 + (Math.sin(x / 16 * Math.PI) > 0 ? 0.1 : 0)})`; g.fillRect(x, 0, 4, h); }
    blotch(g, w, h, r, 9, '120,62,28', 0.2, 40); blotch(g, w, h, r, 10, '40,34,30', 0.16, 34);
    for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(96,48,22,${0.05 + r() * 0.1})`; const x = r() * w; g.fillRect(x, r() * h * 0.5, 2 + r() * 3, 30 + r() * 120); }
    speckle(g, w, h, r, 900, 0.1);
  }, 1, 1);
  // --- concrete apron
  TX.concrete = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#7d7972'; g.fillRect(0, 0, w, h);
    blotch(g, w, h, r, 16, '60,56,50', 0.16, 110); blotch(g, w, h, r, 14, '150,142,130', 0.14, 100);
    speckle(g, w, h, r, 9000, 0.12);
    g.strokeStyle = 'rgba(30,26,22,.4)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(1, 0); g.lineTo(1, h); g.moveTo(0, 1); g.lineTo(w, 1); g.stroke();
    g.strokeStyle = 'rgba(24,20,18,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
    blotch(g, w, h, r, 4, '20,18,16', 0.22, 36);
  }, 1, 1);
  // --- salt pan
  TX.salt = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#b8ad98'; g.fillRect(0, 0, w, h);
    blotch(g, w, h, r, 50, '236,228,212', 0.3, 90); blotch(g, w, h, r, 40, '168,150,124', 0.22, 80);
    speckle(g, w, h, r, 7000, 0.1, 120, 255);
    g.strokeStyle = 'rgba(110,94,74,.5)'; g.lineWidth = 1.4;
    const pts = []; for (let i = 0; i < 46; i++) pts.push([r() * w, r() * h]);
    for (const [x, y] of pts) {
      const near = pts.map((p) => [Math.hypot(p[0] - x, p[1] - y), p]).sort((a, b) => a[0] - b[0]).slice(1, 4);
      for (const [, p] of near) { g.beginPath(); g.moveTo(x, y); g.lineTo((x + p[0]) / 2 + (r() - 0.5) * 14, (y + p[1]) / 2 + (r() - 0.5) * 14); g.lineTo(p[0], p[1]); g.stroke(); }
    }
  }, 1, 1);
  // --- plaza paving
  TX.paving = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#9c8e7a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 138 + r() * 40; g.fillStyle = `rgb(${v | 0},${(v * 0.92) | 0},${(v * 0.8) | 0})`;
      g.fillRect(x * 32 + (y & 1 ? 16 : 0) - 32 + 1, y * 32 + 1, 30, 30); g.fillRect(x * 32 + (y & 1 ? 16 : 0) + 1, y * 32 + 1, 30, 30);
    }
    speckle(g, w, h, r, 2500, 0.1);
  }, 1, 1);
  // --- planks, generic grime, pixel-style tiles
  TX.planks = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#8a6a44'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const v = r() * 30; g.fillStyle = `rgb(${(120 + v) | 0},${(90 + v) | 0},${(56 + v * 0.6) | 0})`; g.fillRect(0, i * 32 + 1, w, 30); }
    g.strokeStyle = 'rgba(40,26,14,.5)'; for (let i = 0; i < 50; i++) { const y = r() * h; g.beginPath(); g.moveTo(r() * w, y); g.lineTo(r() * w, y + (r() - 0.5) * 3); g.stroke(); }
  }, 1, 1);
  TX.grime = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    blotch(g, w, h, r, 30, '120,96,70', 0.28, 60); blotch(g, w, h, r, 16, '40,34,30', 0.25, 40); speckle(g, w, h, r, 2500, 0.1, 0, 120);
  }, 1, 1);

  const std = (o) => new T.MeshStandardMaterial(o);
  // --- the dragon
  M.scale = std({ color: 0xb9b2a4, roughness: 0.62, bumpMap: TX.scales, bumpScale: 1.1 });
  M.scaleDark = std({ color: 0x8f887b, roughness: 0.75, bumpMap: TX.scales, bumpScale: 1.1 });
  M.armor = new T.MeshPhysicalMaterial({ color: 0xcfcbc2, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.12 });
  M.armorRib = new T.MeshPhysicalMaterial({ color: 0xcfcbc2, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.14, bumpMap: TX.ribs, bumpScale: 1.2, side: T.DoubleSide });
  M.horn = std({ color: 0xa89f8c, roughness: 0.42, side: T.DoubleSide });
  M.claw = std({ color: 0xc9c3b6, roughness: 0.3 });
  M.eye = std({ color: 0x1a0d00, emissive: 0xffa21a, emissiveIntensity: 5, roughness: 0.3 });
  M.socket = std({ color: 0x3a2e24, roughness: 0.9 });
  // --- world
  M.salt = std({ map: TX.salt, roughness: 0.95 });
  M.concrete = std({ map: TX.concrete, roughness: 0.88 });
  M.paving = std({ map: TX.paving, roughness: 0.9 });
  M.canal = std({ color: 0x5c564e, roughness: 0.95, map: TX.grime });
  M.corr = (hex) => std({ color: hex, map: TX.corrCol, bumpMap: TX.corr, bumpScale: 2.2, roughness: 0.62, metalness: 0.35 });
  M.metal = (hex, rough = 0.5, metal = 0.6) => std({ color: hex, roughness: rough, metalness: metal });
  M.paint = (hex, rough = 0.7) => std({ color: hex, roughness: rough, map: TX.grime });
  M.flat = (hex, rough = 0.85) => std({ color: hex, roughness: rough });
  M.wood = std({ map: TX.planks, roughness: 0.85 });
  M.glow = (hex, k = 3) => std({ color: 0x000000, emissive: hex, emissiveIntensity: k, roughness: 0.4 });
  M.water = new T.MeshPhysicalMaterial({ color: 0x2f6f86, roughness: 0.08, metalness: 0, transmission: 0, clearcoat: 1, emissive: 0x0b3040, emissiveIntensity: 0.6 });
  // --- the Tithing Throne's people: graphite and violet
  M.legion = std({ color: 0x24222b, roughness: 0.45, metalness: 0.7 });
  M.legionLite = std({ color: 0x4a4658, roughness: 0.5, metalness: 0.6 });
  M.robe = std({ color: 0x1b1722, roughness: 0.85 });
  M.violet = M.glow(0x9a6bff, 4);
  M.violetHot = M.glow(0xc9a8ff, 7);
  M.amber = M.glow(0xffb040, 5);
  M.gold = std({ color: 0xc9a253, roughness: 0.35, metalness: 0.9 });
}
