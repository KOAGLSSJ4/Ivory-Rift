# Pale Sovereign — Chapter One: The Tithe

A browser action RPG prototype built by Claude Code from David's two white-armoured dragon references.
This folder is a **working build parked on a feature branch**, not David OS context. It belongs in its own repository.

## Play
Open `pale-sovereign.html` in a desktop browser. It is one self-contained file and runs offline.

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

## Known limits
- The dragon and every other model are procedural (code-built primitives). A sculpted, rigged model made from the
  reference images is the single biggest visual upgrade available; `src/dragon.js` is the only file it replaces.
- Title art and Vellum's dialogue portrait are David's reference image, embedded as base64 (`art_*.b64`).
- Tested by scripted playthrough in headless Chromium. Not yet tuned by a human hand on real hardware.
