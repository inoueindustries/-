// Info.plist に「暗号化は使っていない」を書く（App Store に出すたびの質問が なくなる）。名前は 筋トレクエスト
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(dirname(fileURLToPath(import.meta.url)));
const f = join(here, 'ios', 'App', 'App', 'Info.plist');
if (!existsSync(f)) { console.error('Info.plist が ありません（npx cap add ios の あとに 実行）'); process.exit(1); }
let s = readFileSync(f, 'utf8');
const add = (key, xml) => { if (!s.includes('<key>' + key + '</key>')) s = s.replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>' + key + '</key>\n\t' + xml + '\n</dict>\n</plist>\n'); };
add('ITSAppUsesNonExemptEncryption', '<false/>');
s = s.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, '$1筋トレクエスト$2');
writeFileSync(f, s);
console.log('Info.plist を なおしました');
