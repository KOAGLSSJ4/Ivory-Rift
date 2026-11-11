import { build } from 'esbuild';
import fs from 'fs';
const entry = process.argv[2] || 'src/main.js';
const out = await build({ entryPoints: [entry], bundle: true, format: 'iife', write: false, minify: false, target: 'es2020', legalComments: 'none', charset: 'utf8' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const tpl = fs.readFileSync('template.html', 'utf8').replaceAll('__ART_TITLE__', fs.readFileSync('art_title.b64', 'utf8')).replaceAll('__ART_FACE__', fs.readFileSync('art_face.b64', 'utf8'));
const CDN = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>';
fs.mkdirSync('dist', { recursive: true });
// 1) the artifact page: a fragment, three.js from the CDN
fs.writeFileSync('dist/pale-sovereign-artifact.html', `${tpl}\n${CDN}\n<script>\n${js}\n</script>\n`);
// 2) a standalone file that also runs offline: full document, three.js inlined
const three = fs.readFileSync('node_modules/three/build/three.min.js', 'utf8').replace(/<\/script/g, '<\\/script');
fs.writeFileSync('pale-sovereign.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n${tpl}\n<script>\n${three}\n</script>\n<script>\n${js}\n</script>\n</body>\n</html>\n`);
console.log('built', entry, (js.length / 1024).toFixed(0) + 'KB js');
