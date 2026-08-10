// ============================================
// Unification of the Nation - ステージセレクト（全体マップ）
// ============================================
// クリア演出のあと、全体マップから行き先を選ぶ画面。
// 描画(renderStageSelect)とタップ判定(game.updateStageSelect)は必ず
// getStageSelectLayout() を共有すること（座標式の複製はヒットずれの元）。
//
// マップ画像: images/world_map.png（無い間は和紙風のフォールバックを描く）。
// ノード座標は「画像内の比率(u,v)」で持ち、cover 変換で画面座標へ写す。
// 画像を差し替えても u,v を微調整するだけで済む（map_generation_prompt.md 参照）。

import { SCREEN_WIDTH, CANVAS_HEIGHT, STAGES, getUiScale, getFontScale, getScreenSafeArea, isTouchOverlayMode } from './constants.js?v=screen-safe-20260810g';
import { drawWafuCard, fillTextInkCentered, drawScreenManualLine } from './ui.js?v=screen-safe-20260810g';

// ノード定義。kind: main=本編 / bonus=小判蔵(第2階層踏破で解放・実装済み) /
// training=道場(未実装。データだけ先に持つ)。
// 座標は images/world_map.png(Codex/gpt-image 生成)の絵に合わせて調整済み。
// ノードは**ランドマークの真上ではなく、その脇の街道の上**に置く
// （円がランドマークを隠すと絵が見えない、と実機フィードバック）。
// 画像を再生成したらここを目視で微調整する。
export const WORLD_MAP_NODES = [
    { id: 1, kind: 'main', u: 0.115, v: 0.765 },  // 竹林の入口（道の起点近く）
    { id: 2, kind: 'main', u: 0.305, v: 0.655 },  // 宿場の前の街道
    { id: 3, kind: 'main', u: 0.555, v: 0.595 },  // 山道（滝の右下・道の登りの上）
    { id: 4, kind: 'main', u: 0.700, v: 0.615 },  // 城下町の入口（町並みの手前）
    { id: 5, kind: 'main', u: 0.865, v: 0.425 },  // 城門（町の奥・石垣）
    // 6 はスマホ(wide)の縦クロップで上へ寄るため、右上のBGMボタンとの重なりに注意
    { id: 6, kind: 'main', u: 0.868, v: 0.300 },  // 天守閣（月の下）
    { id: 'bonus1', kind: 'bonus', u: 0.405, v: 0.740 },      // 小判蔵（鳥居の脇道・行き止まり）
    { id: 'training1', kind: 'training', u: 0.605, v: 0.415 } // 道場（滝の上の建物）
];
// 経路線は描かない（絵に描かれた街道に任せる。UIの線を重ねると却ってややこしい、
// と実機フィードバック 2026-08-10）。順路はノードの番号で示す。

// カーソルが辿る順序（地図の道なり順）。ボーナスは宿場と峠の間の寄り道。
// game.getStageSelectOrder が解放状況でフィルタして使う。
export const STAGE_SELECT_ORDER = [1, 2, 'bonus1', 3, 4, 5, 6];

// フォールバック座標系（画像未配置のとき）。生成指示と同じ 1536x1024 を仮想画像として
// 使うことで、画像を置いた後もノードの相対配置が変わらない。
const FALLBACK_MAP_W = 1536;
const FALLBACK_MAP_H = 1024;

let _mapImage = null;
function getMapImage() {
    if (!_mapImage) {
        _mapImage = new Image();
        _mapImage.src = 'images/world_map.png';
    }
    return _mapImage;
}

export function getStageSelectLayout(opts = {}) {
    const img = getMapImage();
    const hasImage = !!(img.complete && img.naturalWidth);
    const iw = hasImage ? img.naturalWidth : FALLBACK_MAP_W;
    const ih = hasImage ? img.naturalHeight : FALLBACK_MAP_H;
    // cover 変換（drawBgCover と同式・中央クロップ）。マップは全体が主役なので
    // アンカーは中央のまま、生成側で上下15%を捨て代にしてもらう。
    const s = Math.max(SCREEN_WIDTH / iw, CANVAS_HEIGHT / ih);
    const sw = SCREEN_WIDTH / s, sh = CANVAS_HEIGHT / s;
    const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    const uv = (u, v) => ({ x: (u * iw - sx) * s, y: (v * ih - sy) * s });

    const uiS = getUiScale();
    // ランドマークを隠さないよう控えめな径（道の上に置く前提）
    const nodeR = 19 * uiS;
    const nodes = WORLD_MAP_NODES
        .filter(n => n.kind === 'main' || (n.kind === 'bonus' && opts.bonusUnlocked))
        .map(n => ({
            ...n,
            ...uv(n.u, n.v),
            r: n.kind === 'bonus' ? nodeR * 0.88 : nodeR,
            name: n.kind === 'bonus' ? '小判蔵' : (STAGES[n.id - 1]?.name || '')
        }));

    // 下部中央: 選択中ステージの情報カード（ステージ名のみ・状態はノードの見た目で表現）
    const safe = getScreenSafeArea();
    const fs = Math.min(getFontScale(), uiS * 1.15);
    const cardW = 300 * uiS;
    const cardH = 46 * uiS;
    const card = {
        x: SCREEN_WIDTH / 2 - cardW / 2,
        y: CANVAS_HEIGHT - safe.bottom - 44 - cardH,
        w: cardW,
        h: cardH,
        titleFont: 21 * fs
    };

    return {
        hasImage, img, iw, ih, cover: { s, sx, sy }, uv,
        nodes, nodeR, card,
        headerY: safe.top + 46,
        headerFont: 26 * fs,
        nodeAt(tx, ty) {
            // 指で押しやすいよう見た目より広めに取る（パッドの touchScale と同じ思想）
            for (const n of nodes) {
                if (Math.hypot(tx - n.x, ty - n.y) <= n.r * 2.0) return n;
            }
            return null;
        }
    };
}

// 画像が無い間のフォールバック背景（藍の夜空と山影だけの簡素な絵巻風）。
function drawFallbackMap(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    g.addColorStop(0, '#0d1830');
    g.addColorStop(0.55, '#16244a');
    g.addColorStop(1, '#0a1224');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
    // 遠山の重なり
    ctx.save();
    for (let layer = 0; layer < 3; layer++) {
        const baseY = CANVAS_HEIGHT * (0.55 + layer * 0.14);
        ctx.fillStyle = `rgba(10, 16, 34, ${0.5 + layer * 0.18})`;
        ctx.beginPath();
        ctx.moveTo(0, CANVAS_HEIGHT);
        for (let x = 0; x <= SCREEN_WIDTH; x += 24) {
            const y = baseY
                - Math.sin(x * 0.004 + layer * 2.1) * 46
                - Math.cos(x * 0.011 + layer) * 18;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(SCREEN_WIDTH, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// opts: { cursor, maxSelectable, maxCleared, timeMs }
export function renderStageSelect(ctx, opts = {}) {
    const cursor = opts.cursor ?? 1;
    const maxSelectable = Number.isFinite(opts.maxSelectable) ? opts.maxSelectable : 1;
    const maxCleared = Number.isFinite(opts.maxCleared) ? opts.maxCleared : 0;
    const time = Number.isFinite(opts.timeMs) ? opts.timeMs : 0;
    const L = getStageSelectLayout({ bonusUnlocked: !!opts.bonusUnlocked });
    const pulse = 0.5 + Math.sin(time * 0.004) * 0.5;

    // ---- 背景 ----
    if (L.hasImage) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        const { s, sx, sy } = L.cover;
        ctx.drawImage(L.img, sx, sy, SCREEN_WIDTH / s, CANVAS_HEIGHT / s, 0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
        // UIが読めるよう全体をわずかに沈める
        ctx.fillStyle = 'rgba(4, 8, 20, 0.22)';
        ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
    } else {
        drawFallbackMap(ctx);
    }

    // ---- ノード ----（経路線は描かない: 順路は絵の街道とノード番号に任せる）
    for (const n of L.nodes) {
        const isBonus = n.kind === 'bonus';
        const cleared = !isBonus && n.id <= maxCleared;
        const selectable = isBonus || n.id <= maxSelectable;   // bonus は表示時点で解放済み
        const isCursor = n.id === cursor;
        ctx.save();
        // 台座円（背後の絵が透けるよう控えめな塗り）
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = isBonus ? 'rgba(88, 66, 18, 0.82)'
            : cleared ? 'rgba(96, 46, 40, 0.82)'
            : selectable ? 'rgba(22, 34, 66, 0.78)'
            : 'rgba(20, 24, 36, 0.58)';
        ctx.fill();
        ctx.lineWidth = isCursor ? 3 : 1.5;
        ctx.strokeStyle = isCursor
            ? `rgba(255, 232, 160, ${(0.75 + pulse * 0.25).toFixed(3)})`
            : isBonus ? 'rgba(231, 196, 90, 0.85)'
            : cleared ? 'rgba(224, 160, 130, 0.8)'
            : selectable ? 'rgba(150, 178, 232, 0.8)'
            : 'rgba(120, 132, 160, 0.4)';
        ctx.stroke();
        // カーソルの外環
        if (isCursor) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r + 6 + pulse * 3, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(231, 196, 90, ${(0.35 + pulse * 0.3).toFixed(3)})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        // 中身: 階層番号（ボーナスは小判の「両」。クリア済みは朱印風に「済」を重ねる）
        ctx.textAlign = 'center';
        ctx.fillStyle = isBonus ? '#ffe8a8' : selectable ? '#f2f7ff' : 'rgba(180, 190, 210, 0.55)';
        ctx.font = `700 ${Math.round(n.r * (isBonus ? 0.8 : 0.95))}px "Zen Old Mincho", serif`;
        fillTextInkCentered(ctx, isBonus ? '両' : `${n.id}`, n.x, n.y);
        if (cleared) {
            ctx.fillStyle = 'rgba(255, 214, 170, 0.95)';
            ctx.font = `700 ${Math.round(n.r * 0.52)}px "Zen Old Mincho", serif`;
            fillTextInkCentered(ctx, '済', n.x + n.r * 0.78, n.y - n.r * 0.78);
        }
        // 未解放の錠
        if (!selectable) {
            ctx.fillStyle = 'rgba(190, 200, 220, 0.66)';
            ctx.font = `${Math.round(n.r * 0.6)}px "Zen Old Mincho", serif`;
            fillTextInkCentered(ctx, '🔒', n.x + n.r * 0.78, n.y + n.r * 0.78);
        }
        ctx.restore();
    }

    // ---- 見出しと選択カード ----
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(240, 246, 255, 0.92)';
    ctx.font = `700 ${Math.round(L.headerFont)}px "Zen Old Mincho", serif`;
    fillTextInkCentered(ctx, '行き先を選択', SCREEN_WIDTH / 2, L.headerY);
    ctx.restore();

    // 選択カードはステージ名のみ（踏破/未踏はノードの見た目で表現する）
    const sel = L.nodes.find(n => n.id === cursor);
    if (sel) {
        const c = L.card;
        drawWafuCard(ctx, c.x, c.y, c.w, c.h, { radius: 10 * getUiScale(), selected: true, pulse });
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.round(c.titleFont)}px "Zen Old Mincho", serif`;
        const title = sel.kind === 'bonus' ? `寄り道　${sel.name}` : `第${sel.id}階層　${sel.name}`;
        fillTextInkCentered(ctx, title, c.x + c.w / 2, c.y + c.h / 2);
        ctx.restore();
    }

    // 操作説明（タイトル画面と同じトーン）
    drawScreenManualLine(ctx, isTouchOverlayMode()
        ? 'タップ：選択 | もう一度タップ：出陣準備'
        : '←→：選択 | SPACE：決定');
}
