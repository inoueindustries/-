// ../app（スマホ保存版）を www にコピーする。アプリの中には このコピーが入る
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(here, '..', 'app'), dst = join(here, 'www');
if (!existsSync(join(src, 'index.html'))) { console.error('../app/index.html が ありません'); process.exit(1); }
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('manifest.webmanifest') });
console.log('www に コピーしました');
