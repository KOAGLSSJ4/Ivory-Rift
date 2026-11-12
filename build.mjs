import { build } from 'esbuild';
import fs from 'fs';
const entry = process.argv[2] || 'src/main.js';
const out = await build({ entryPoints: [entry], bundle: true, format: 'iife', write: false, minify: true, target: 'es2020', legalComments: 'none', charset: 'utf8' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const tpl = fs.readFileSync('template.html', 'utf8').replaceAll('__ART_TITLE__', fs.readFileSync('art_title.b64', 'utf8')).replaceAll('__ART_FACE__', fs.readFileSync('art_face.b64', 'utf8'));
fs.mkdirSync('dist', { recursive: true });
// 1) the Claude artifact page: a fragment; assets/ is published beside it
fs.mkdirSync('dist/assets', { recursive: true });
for (const f of fs.readdirSync('assets')) fs.writeFileSync(`dist/assets/${f}.txt`, fs.readFileSync('assets/' + f).toString('base64'));
fs.writeFileSync('dist/pale-sovereign-artifact.html', `${tpl}\n<script>\n${js}\n</script>\n`);
// 2) index.html: serve this folder (index.html + assets/) from any static host
fs.writeFileSync('index.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n${tpl}\n<script>\n${js}\n</script>\n</body>\n</html>\n`);
console.log('built', entry, (js.length / 1024).toFixed(0) + 'KB js');
