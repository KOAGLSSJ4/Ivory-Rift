import { build } from 'esbuild';
import fs from 'fs';
const entry = process.argv[2] || 'src/main.js';
const out = await build({ entryPoints: [entry], bundle: true, format: 'iife', write: false, minify: true, target: 'es2020', legalComments: 'none', charset: 'utf8' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const tpl = fs.readFileSync('template.html', 'utf8').replaceAll('__ART_TITLE__', fs.readFileSync('art_title.b64', 'utf8')).replaceAll('__ART_FACE__', fs.readFileSync('art_face.b64', 'utf8'));
const glb = `<script id="glb" type="application/octet-stream">${fs.readFileSync('assets/IvoryDragon.glb').toString('base64')}</script>`;
fs.mkdirSync('dist', { recursive: true });
// 1) the artifact page: a fragment (the host adds the document skeleton)
fs.writeFileSync('dist/pale-sovereign-artifact.html', `${tpl}\n${glb}\n<script>\n${js}\n</script>\n`);
// 2) a standalone document that also runs offline from a double-click
fs.writeFileSync('pale-sovereign.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n${tpl}\n${glb}\n<script>\n${js}\n</script>\n</body>\n</html>\n`);
console.log('built', entry, (js.length / 1024).toFixed(0) + 'KB js');
