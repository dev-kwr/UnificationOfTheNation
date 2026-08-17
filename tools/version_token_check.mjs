#!/usr/bin/env node
// ============================================
// 公開して初めて壊れる類の事故を、push 前に見つける
// ============================================
//   node tools/version_token_check.mjs
//
// 検査は2つ:
//   (1) ?v=screen-safe-* が1種類に揃っているか
//   (2) import している ./*.js が全部 git の管理下にあるか
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
//
// --------------------------------------------
// (2) import 先が git の管理下にあるか
// --------------------------------------------
// 新しいモジュールを切り出して import を足したのに `git add` を忘れると、
// 手元では動くのに公開ビルドだけ 404 になる。ES module は import が1本
// 落ちるとモジュールグラフごと読めないので、画面が真っ黒のまま起動しない。
// ファイルの存在(fs)ではなく【git が追跡しているか】で見るのが要点。
// 手元には在るので fs では絶対に捕まらない。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = /screen-safe-[0-9A-Za-z_.-]+/g;
// import { ... } from './x.js?v=...' と import('./x.js?v=...') の両方
const IMPORT_REF = /(?:from|import\s*\()\s*'\.\/([A-Za-z0-9_.-]+\.js)/g;

const targets = ['index.html', ...readdirSync(join(root, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join('js', f))];

const found = new Map();   // token -> [{file, line}]
const imports = new Map(); // 参照先 -> 参照元ファイルの集合
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
        for (const m of line.matchAll(IMPORT_REF)) {
            if (!imports.has(m[1])) imports.set(m[1], new Set());
            imports.get(m[1]).add(`${rel}:${i + 1}`);
        }
    });
}

let ng = false;

// --- (1) トークンの統一 ---
const tokens = [...found.keys()].sort();
if (tokens.length === 0) {
    console.error('NG: screen-safe トークンが1つも見つかりません(index.html と js/*.js を確認)');
    ng = true;
} else if (tokens.length === 1) {
    console.log(`OK: ?v=${tokens[0]} で統一されています (${found.get(tokens[0]).length}箇所 / ${targets.length}ファイル走査)`);
} else {
    ng = true;
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
}

// --- (2) import 先が git の管理下にあるか ---
let tracked = null;
try {
    tracked = new Set(
        execFileSync('git', ['-C', root, 'ls-files', 'js'], { encoding: 'utf8' })
            .split('\n').filter(Boolean).map((p) => p.replace(/^js\//, ''))
    );
} catch {
    console.log('注意: git が使えないので import 先の追跡検査は飛ばします');
}
if (tracked) {
    const missing = [];
    for (const [mod, from] of imports) {
        if (tracked.has(mod)) continue;
        missing.push({ mod, from: [...from], onDisk: existsSync(join(root, 'js', mod)) });
    }
    if (missing.length === 0) {
        console.log(`OK: import している ./*.js は全部 git 管理下です (${imports.size}モジュール)`);
    } else {
        ng = true;
        console.error('');
        console.error(`NG: git に無いモジュールを import しています (${missing.length}件)。`);
        console.error('公開ビルドで 404 になり、import が1本落ちるだけで画面は真っ黒のまま起動しません。');
        console.error('');
        for (const m of missing) {
            console.error(`  ./${m.mod}  ${m.onDisk ? '(手元には在る = git add 忘れ)' : '(手元にも無い)'}`);
            for (const f of m.from.slice(0, 6)) console.error(`      ${f}`);
            if (m.from.length > 6) console.error(`      … 他 ${m.from.length - 6} 箇所`);
        }
        console.error('');
        console.error('直し方: 切り出したモジュールを、それを import するファイルと【同じコミット】に入れる。');
    }
}

process.exit(ng ? 1 : 0);
