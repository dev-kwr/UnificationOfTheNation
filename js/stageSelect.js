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

import { SCREEN_WIDTH, CANVAS_HEIGHT, STAGES, getUiScale, getFontScale, getScreenSafeArea, isTouchOverlayMode } from './constants.js?v=screen-safe-20260810e';
import { drawWafuCard, fillTextInkCentered, drawScreenManualLine } from './ui.js?v=screen-safe-20260810e';

// ノード定義。kind: main=本編 / bonus=小判蔵 / training=道場。
// bonus/training はフェーズ2で解放（データだけ先に持ち、表示は main のみ）。
// 座標は images/world_map.png(Codex/gpt-image 生成)の絵に合わせて調整済み。
// ノードは**ランドマークの真上ではなく、その脇の街道の上**に置く
// （円がランドマークを隠すと絵が見えない、と実機フィードバック）。
// 画像を再生成したらここを目視で微調整する。
export const WORLD_MAP_NODES = [
    { id: 1, kind: 'main', u: 0.165, v: 0.815 },  // 竹林の入口（竹やぶ右下の道）
    { id: 2, kind: 'main', u: 0.300, v: 0.775 },  // 宿場の前の街道
    { id: 3, kind: 'main', u: 0.500, v: 0.475 },  // 峠の頂の道
    { id: 4, kind: 'main', u: 0.655, v: 0.700 },  // 城下町の南の街道
    { id: 5, kind: 'main', u: 0.850, v: 0.565 },  // 城門の前
    // 6 はスマホ(wide)の縦クロップで上へ寄るため、右上のBGMボタンとの重なりに注意
    { id: 6, kind: 'main', u: 0.845, v: 0.345 },  // 天守へ登る坂（天守と月は隠さない）
    { id: 'bonus1', kind: 'bonus', u: 0.410, v: 0.800 },     // 小判蔵（鳥居の脇道）
    { id: 'training1', kind: 'training', u: 0.400, v: 0.435 } // 道場（滝のそば）
];

// 街道のウェイポイント（ノードiからi+1への中間点列・画像内比率）。
// 経路線はノード同士を直線で結ばず、この点列で**絵に描かれた一本道**をなぞる
// （直結だと谷や町を突っ切る線になり「道」に見えない、と実機フィードバック）。
const WORLD_MAP_ROUTE = [
    [{ u: 0.215, v: 0.805 }, { u: 0.255, v: 0.795 }],                                     // 1→2 宿場へ
    [{ u: 0.370, v: 0.755 }, { u: 0.415, v: 0.705 }, { u: 0.437, v: 0.630 },
     { u: 0.455, v: 0.550 }, { u: 0.476, v: 0.500 }],                                     // 2→3 峠越え
    [{ u: 0.522, v: 0.520 }, { u: 0.556, v: 0.585 }, { u: 0.600, v: 0.648 }],             // 3→4 川沿いに下る
    [{ u: 0.712, v: 0.716 }, { u: 0.770, v: 0.705 }, { u: 0.815, v: 0.655 }],             // 4→5 城門へ登る
    [{ u: 0.863, v: 0.510 }, { u: 0.870, v: 0.452 }, { u: 0.860, v: 0.398 }]              // 5→6 天守への坂
];

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

export function getStageSelectLayout() {
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
        .filter(n => n.kind === 'main')
        .map(n => ({ ...n, ...uv(n.u, n.v), r: nodeR, name: STAGES[n.id - 1]?.name || '' }));
    // 経路線用: ノード間の街道ウェイポイントを画面座標へ
    const route = WORLD_MAP_ROUTE.map(seg => seg.map(p => uv(p.u, p.v)));

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
        nodes, nodeR, route, card,
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
    const cursor = Number.isFinite(opts.cursor) ? opts.cursor : 1;
    const maxSelectable = Number.isFinite(opts.maxSelectable) ? opts.maxSelectable : 1;
    const maxCleared = Number.isFinite(opts.maxCleared) ? opts.maxCleared : 0;
    const time = Number.isFinite(opts.timeMs) ? opts.timeMs : 0;
    const L = getStageSelectLayout();
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

    // ---- 経路（絵に描かれた一本道をウェイポイントでなぞる）----
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < L.nodes.length - 1; i++) {
        const a = L.nodes[i], b = L.nodes[i + 1];
        const reachable = b.id <= maxSelectable;   // この区間の先まで進めるか
        const pts = [{ x: a.x, y: a.y }, ...(L.route[i] || []), { x: b.x, y: b.y }];
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length - 1; k++) {
            const mx = (pts[k].x + pts[k + 1].x) / 2;
            const my = (pts[k].y + pts[k + 1].y) / 2;
            ctx.quadraticCurveTo(pts[k].x, pts[k].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        if (reachable) {
            ctx.strokeStyle = 'rgba(231, 196, 90, 0.5)';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = 'rgba(180, 198, 236, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 9]);
        }
        ctx.stroke();
    }
    ctx.restore();

    // ---- ノード ----
    for (const n of L.nodes) {
        const cleared = n.id <= maxCleared;
        const selectable = n.id <= maxSelectable;
        const isCursor = n.id === cursor;
        ctx.save();
        // 台座円（背後の絵が透けるよう控えめな塗り）
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = cleared ? 'rgba(96, 46, 40, 0.82)'
            : selectable ? 'rgba(22, 34, 66, 0.78)'
            : 'rgba(20, 24, 36, 0.58)';
        ctx.fill();
        ctx.lineWidth = isCursor ? 3 : 1.5;
        ctx.strokeStyle = isCursor
            ? `rgba(255, 232, 160, ${(0.75 + pulse * 0.25).toFixed(3)})`
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
        // 中身: 階層番号（クリア済みは朱印風に「済」を重ねる）
        ctx.textAlign = 'center';
        ctx.fillStyle = selectable ? '#f2f7ff' : 'rgba(180, 190, 210, 0.55)';
        ctx.font = `700 ${Math.round(n.r * 0.95)}px "Zen Old Mincho", serif`;
        fillTextInkCentered(ctx, `${n.id}`, n.x, n.y);
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
        fillTextInkCentered(ctx, `第${sel.id}階層　${sel.name}`, c.x + c.w / 2, c.y + c.h / 2);
        ctx.restore();
    }

    // 操作説明（タイトル画面と同じトーン）
    drawScreenManualLine(ctx, isTouchOverlayMode()
        ? 'タップ：選択 | もう一度タップ：出陣準備'
        : '←→：選択 | SPACE：決定');
}
