// drives the real game headless: usage node test/play.mjs '<async js body using PS and helpers>' [shotname] [style]
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'path'; import fs from 'fs';
const [body = '', shot = '', w = '1280', h = '720'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await p.route('**/fonts.g*/**', (r) => r.abort());
await p.goto('file://' + path.resolve('pale-sovereign.html') + '?q=0');
await p.waitForTimeout(1500);
await p.evaluate(fs.readFileSync('test/helpers.js', 'utf8'));
const res = await p.evaluate(`(async () => { ${body} })()`).catch((e) => 'EVAL ERROR ' + e.message);
if (res !== undefined) console.log('result:', typeof res === 'string' ? res : JSON.stringify(res));
if (shot) { await p.evaluate(() => { window.__noRender = false; }); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/${shot}.png`, timeout: 120000 }); }
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 10).join('\n'));
await b.close();
