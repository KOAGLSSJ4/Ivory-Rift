# Pale Sovereign — Chapter One: The Tithe

A browser action RPG prototype built by Claude Code from David's two white-armoured dragon references.
This folder is a **working build parked on a feature branch**, not David OS context. It belongs in its own repository.

## Play
The game loads its 3D models from `assets/`, so it must be served over http: opening `index.html` by double-click will not work.
Run `npx serve .` (or `python3 -m http.server`) in this folder and open the address it prints. Any static host works, including GitHub Pages.

| Input | Power |
| --- | --- |
| WASD / mouse | Move / aim |
| Left click (hold) | Lance: precise beam |
| Right click | Claws: three strikes, the third is the tail |
| Q (hold, release) | Burst: heavy blast |
| Space | Blink to where he is looking: rooftops, or behind an enemy |
| E | Grip: lift objects, enemies and people. Left click throws |
| R | Rewrite, when Authority is full |
| F / V / Esc | Talk / switch Realistic and Pixel / pause |

Touch controls appear automatically on phones and tablets.

## Build
`npm install && npm run build` regenerates `pale-sovereign.html` from `src/` and `template.html`.
`test/play.mjs` drives the game headlessly through Playwright (see `test/helpers.js`).

## Assets
`assets/` holds the GPT-made GLB pack: nine rigged characters, buildings, props and world pieces. `src/assets.js` loads them,
`src/actors.js` maps game entities and structures onto them, `src/hero.js` drives the dragon. If a model fails to load,
the procedural version in `src/models.js` is used instead.

## Known limits
- Still procedural: the ground, the canal, Vellum's nest, hangar shelving and stairs, string lights, and all effects.
- Weapon and shield attachment angles on soldiers were set by eye and need checking in play.
- Tested by scripted playthrough in headless Chromium. Not yet tuned by a human hand on real hardware.
