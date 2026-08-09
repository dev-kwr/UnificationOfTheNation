#!/usr/bin/env node
// ============================================
// 画像・音アセットのURLに内容ハッシュを刻む（公開用ビルド手順）
// ============================================
// なぜ必要か:
//   配信サーバ(GitHub Pages 等)はアセットを一定時間ブラウザにキャッシュさせる。
//   URL が同じままだと、画像を差し替えても古い絵が出続ける。
//   逆に URL に内容ハッシュが入っていれば、中身が変われば URL も変わるので
//   「差し替えたのに反映されない」が原理的に起きない。
//
// やること:
//   images/ bgm/ se/ icon/ とルート直下のアイコンを走査し、各ファイルの内容から
//   8桁のハッシュを作って、参照側(index.html / manifest.json / css / js)の
//   `path` または `path?v=旧` を `path?v=<ハッシュ>` へ書き換える。
//
// 対象外:
//   .js の import 指定子（`./game.js?v=...`）は触らない。モジュールは相互に
//   参照し合うため内容ハッシュが循環し、かつ「1モジュール1指定子」の不変条件
//   (AGENTS.md) を機械的に保てないため、従来どおり手動トークンで運用する。
//
// 使い方:
//   node tools/stamp-assets.mjs [--dry-run] [--root <dir>]
//   公開ワークフロー(.github/workflows/deploy-pages.yml)が配信物に対して実行する。
//   リポジトリ本体は書き換えない運用のため、手元で試すときは --dry-run を推奨。

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, posix } from 'node:path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const rootIndex = args.indexOf('--root');
const ROOT = resolve(rootIndex >= 0 ? args[rootIndex + 1] : process.cwd());

// ハッシュを刻む対象。ここに無い拡張子は書き換えない。
const ASSET_EXTENSIONS = /\.(png|jpe?g|webp|gif|svg|ico|mp3|ogg|wav|m4a)$/i;
// 走査するディレクトリ（ルート直下のアイコン類は別途 addRootAssets で拾う）
const ASSET_DIRS = ['images', 'bgm', 'se', 'icon'];
const ROOT_ASSETS = ['favicon.ico', 'favicon-64.png', 'apple-touch-icon.png'];
// 参照側として書き換えるファイル
const REWRITE_TARGETS = ['index.html', 'manifest.json'];
const REWRITE_DIRS = ['js', 'css'];

function listFiles(dir) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) return [];
    const out = [];
    for (const name of readdirSync(abs)) {
        const full = join(abs, name);
        if (statSync(full).isDirectory()) out.push(...listFiles(posix.join(dir, name)));
        else out.push(posix.join(dir, name));
    }
    return out;
}

function hashOf(relPath) {
    const buf = readFileSync(join(ROOT, relPath));
    return createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

// --- アセット表（相対パス → ハッシュ）を作る ---
const hashes = new Map();
for (const dir of ASSET_DIRS) {
    for (const rel of listFiles(dir)) {
        if (ASSET_EXTENSIONS.test(rel)) hashes.set(rel, hashOf(rel));
    }
}
for (const rel of ROOT_ASSETS) {
    if (existsSync(join(ROOT, rel))) hashes.set(rel, hashOf(rel));
}

if (hashes.size === 0) {
    console.error(`[stamp-assets] アセットが1件も見つかりません (root: ${ROOT})`);
    process.exit(1);
}

// --- 参照を書き換える ---
// 引用符/括弧に囲まれた「アセットらしいパス」＋任意の ?クエリ を掴む。
const REFERENCE = new RegExp(
    `((?:${ASSET_DIRS.join('|')})/[A-Za-z0-9_./-]+|${ROOT_ASSETS.map(escapeRe).join('|')})` +
    `(\\?[^'"\\)\\s]*)?`,
    'g'
);
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const targets = [
    ...REWRITE_TARGETS.filter((f) => existsSync(join(ROOT, f))),
    ...REWRITE_DIRS.flatMap((d) => listFiles(d).filter((f) => /\.(js|mjs|css)$/i.test(f))),
];

let stamped = 0;
const missing = new Set();
const changedFiles = [];

for (const file of targets) {
    const abs = join(ROOT, file);
    const before = readFileSync(abs, 'utf8');
    const after = before.replace(REFERENCE, (whole, path, query) => {
        const hash = hashes.get(path);
        if (!hash) {
            // 実体の無い参照はタイプミスの可能性が高いので握り潰さず報告する。
            if (ASSET_EXTENSIONS.test(path)) missing.add(`${file}: ${path}`);
            return whole;
        }
        stamped++;
        return `${path}?v=${hash}`;
    });
    if (after !== before) {
        changedFiles.push(file);
        if (!DRY_RUN) writeFileSync(abs, after);
    }
}

console.log(`[stamp-assets] root=${relative(process.cwd(), ROOT) || '.'}${DRY_RUN ? ' (dry-run)' : ''}`);
console.log(`[stamp-assets] アセット ${hashes.size}件 / 参照 ${stamped}件へハッシュを刻みました`);
console.log(`[stamp-assets] 書き換えたファイル ${changedFiles.length}件: ${changedFiles.join(', ')}`);

if (missing.size > 0) {
    console.error('[stamp-assets] 実体の見つからない参照があります:');
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
}
