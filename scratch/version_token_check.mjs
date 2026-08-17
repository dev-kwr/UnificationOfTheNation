#!/usr/bin/env node
// ============================================
// ?v=screen-safe-* が1種類に揃っているかを検査する
// ============================================
//   node scratch/version_token_check.mjs
//
// 【なぜ要るか】
// ブラウザは `constants.js?v=A` と `constants.js?v=B` を【別のモジュール】として
// 読む。両方が読まれると constants.js のモジュールスコープ
// (_uiScale / _fontScale / _cornerInsetX / SCREEN_WIDTH)がインスタンスごとに
// 別々に存在することになる。
//
// 実際に起きた事故(2026-08-17):
//   HEAD で screen-safe-20260815o / 20260815q / 20260817m / 20260817w の4種が混在。
//   setUiScaleFromFitScale() を呼ぶのは game.js(=w のインスタンスを書き換える)だけ。
//   getUiScale() / getFontScale() / getPadLayout() を読むのは ui.js 等(=q の
//   インスタンス。_uiScale は 1 のまま)。
//   → 拡大の指示が誰も読まないインスタンスに書かれ、スマホの拡大表示が効かない。
//     setCornerInsets / setNotchInsetX / setVirtualPadVisible も同じ構図で壊れる。
//
// 各セッションの bump が「その時点で現行だったトークンだけ」を置換すると、
// 古いトークンのファイルが取り残されて必ずこうなる。bump は【全部まとめて】。
//
// 【対象外】
// 画像・BGM の ?v=20260706_front1 等はアセット単位で個別に上げるものなので
// 検査しない。モジュールの ?v=screen-safe-* だけを見る。

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = /screen-safe-[0-9A-Za-z_.-]+/g;

const targets = ['index.html', ...readdirSync(join(root, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join('js', f))];

const found = new Map();   // token -> [{file, line}]
for (const rel of targets) {
    let text;
    try {
        text = readFileSync(join(root, rel), 'utf8');
    } catch {
        continue;   // 消えた直後などは無視
    }
    text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(TOKEN)) {
            if (!found.has(m[0])) found.set(m[0], []);
            found.get(m[0]).push({ file: rel, line: i + 1 });
        }
    });
}

if (found.size === 0) {
    console.log('screen-safe トークンが1つも見つかりません(index.html と js/*.js を確認)');
    process.exit(1);
}

const tokens = [...found.keys()].sort();
if (tokens.length === 1) {
    const [t] = tokens;
    console.log(`OK: ${t} で統一されています (${found.get(t).length}箇所 / ${targets.length}ファイル走査)`);
    process.exit(0);
}

console.error(`NG: ?v=screen-safe-* が ${tokens.length} 種類あります。`);
console.error('ブラウザは別モジュールとして読むので、constants.js が多重に評価されます。');
console.error('');
// 少数派を先に出す(取り残されたトークンが上に来る)
for (const t of tokens.sort((a, b) => found.get(a).length - found.get(b).length)) {
    const hits = found.get(t);
    const files = [...new Set(hits.map((h) => h.file))];
    console.error(`  ${t}  … ${hits.length}箇所 / ${files.length}ファイル`);
    for (const f of files.slice(0, 8)) console.error(`      ${f}`);
    if (files.length > 8) console.error(`      … 他 ${files.length - 8} ファイル`);
}
console.error('');
console.error('直し方: index.html と js/*.js の screen-safe-* を【全部】同じ新しい値へ置換する。');
process.exit(1);
