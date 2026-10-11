// usage: node render.mjs stills <outdir> t1 t2 ... | node render.mjs video <out.mp4>
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const tl = JSON.parse(readFileSync(path.join(here, 'timeline.json'), 'utf8'));
const [mode, out, ...rest] = process.argv.slice(2);
const FPS = 30, DUR = tl.length;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await page.goto('file://' + path.join(here, 'hype.html'));
await page.evaluate(() => window.ready);
await page.evaluate(tl => window.init(tl), tl);
await page.waitForTimeout(300);
const stage = page.locator('#stage');

if (mode === 'stills') {
  for (const t of rest) {
    await page.evaluate(t => renderAt(t), Number(t));
    await stage.screenshot({ path: path.join(out, `h${t}.png`) });
  }
} else {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-t', String(DUR), out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(FPS * DUR);
  for (let i = 0; i < N; i++) {
    await page.evaluate(t => renderAt(t), i / FPS);
    const buf = await stage.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${N}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
await browser.close();
