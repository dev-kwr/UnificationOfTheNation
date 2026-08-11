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

import { SCREEN_WIDTH, CANVAS_HEIGHT, STAGES, getUiScale, getFontScale, getScreenSafeArea, isTouchOverlayMode } from './constants.js?v=screen-safe-20260812g';
import { fillTextInkCentered, drawScreenManualLine, formatCount } from './ui.js?v=screen-safe-20260812g';
import { getSideBest } from './sideStageCommon.js?v=screen-safe-20260812g';

// ノード定義。kind: main=本編 / bonus=小判蔵(第2階層踏破で解放) /
// training=修行道場(第3階層踏破で解放)。どちらも実装済み。
// 座標は images/world_map.png(Codex/gpt-image 生成)の絵に合わせて調整済み。
// ノードは**ランドマークの真上ではなく、その脇の街道の上**に置く
// （円がランドマークを隠すと絵が見えない、と実機フィードバック）。
// 画像を再生成したらここを目視で微調整する。
// ノードは**そのエリアの入り口付近の街道の上**に置く(ランドマークの真上に置くと
// 絵が隠れる+場所の意味がずれる、と実機フィードバック)。
// ★ v は「道の上」に乗せること。絵から実測した本道の縦位置は
//    u=0.10→0.775 / u=0.26→0.722 / u=0.45→0.660 / u=0.55→0.624 / u=0.70→0.615。
//    目分量で置くと家や斜面の上に乗って浮くので、必ず絵を切り出して確かめる。
export const WORLD_MAP_NODES = [
    { id: 1, kind: 'main', u: 0.100, v: 0.775 },  // 竹林の入口（道の起点）
    { id: 2, kind: 'main', u: 0.262, v: 0.722 },  // 宿場の西の入口（街道上）
    { id: 3, kind: 'main', u: 0.550, v: 0.624 },  // 山道（杉林を登り始める坂の上）
    { id: 4, kind: 'main', u: 0.700, v: 0.615 },  // 城下町の入口（町並みの手前）
    // 5=城内の最下層からの開始。門の真上(v0.39)だと丸の下半分が門扉に被って
    // 「門の手前」に見える(実機フィードバック)ので、門をくぐった先の坂の中腹
    // (最下層の曲輪の道の上)に置く。
    { id: 5, kind: 'main', u: 0.874, v: 0.368 },  // 城内（門の内側の坂・最下層の曲輪）
    // 6 はスマホ(wide)の縦クロップで上へ寄るため、右上のBGMボタンとの重なりに注意
    // (u を左へ寄せて距離を確保している。動かすときは要再計測)
    { id: 6, kind: 'main', u: 0.860, v: 0.250 },  // 天守閣（本体の胴）
    // 寄り道は実際の建物付近に置く(実機フィードバック 2026-08-10)。
    // 蔵は鳥居(u≈0.355-0.385)と建物(u≈0.393-0.44)の【間】へ。情報カードを
    // 画面上部へ移したので(getStageSelectLayout)、下側へ寄せてもスマホで隠れない。
    { id: 'bonus1', kind: 'bonus', u: 0.390, v: 0.778 },   // 鳥居と蔵の建物の間（足元寄り）
    { id: 'training1', kind: 'training', u: 0.598, v: 0.452 }  // 道場の建物の前庭
];
// 経路線は描かない（絵に描かれた街道に任せる。UIの線を重ねると却ってややこしい、
// と実機フィードバック 2026-08-10）。順路はノードの番号で示す。

// カーソルが辿る順序（地図の道なり順）。寄り道は本道の該当区間の間に挟む。
// game.getStageSelectOrder が解放状況でフィルタして使う。
export const STAGE_SELECT_ORDER = [1, 2, 'bonus1', 3, 'training1', 4, 5, 6];

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
        .filter(n => n.kind === 'main'
            || (n.kind === 'bonus' && opts.bonusUnlocked)
            || (n.kind === 'training' && opts.trainingUnlocked))
        .map(n => ({
            ...n,
            ...uv(n.u, n.v),
            r: n.kind === 'main' ? nodeR : nodeR * 0.88,
            name: n.kind === 'bonus' ? '小判蔵'
                : n.kind === 'training' ? '修行道場'
                : (STAGES[n.id - 1]?.name || '')
        }));

    // 選択中ステージの情報カードは【画面上部・見出しの直下】に置く。
    // 下部中央に置いていた頃は、スマホ(wide)の縦クロップで下側へ寄る小判蔵の
    // ノードとカードが重なって蔵が隠れた(実機フィードバック 2026-08-11)。
    // 地図の下半分には道とランドマークが詰まっているので、UI は上の空へ逃がす。
    const safe = getScreenSafeArea();
    const fs = Math.min(getFontScale(), uiS * 1.15);
    const cardW = 300 * uiS;
    const cardH = 46 * uiS;
    const headerY = safe.top + 40;
    const cardY = headerY + 30 * uiS;
    const card = {
        x: SCREEN_WIDTH / 2 - cardW / 2,
        y: cardY,
        w: cardW,
        h: cardH,
        titleFont: 21 * fs,
        // 最高記録は枠の中に並べず、枠の【下】へ小さく添える
        noteFont: 13 * fs,
        noteY: cardY + cardH + 18 * uiS
    };

    return {
        hasImage, img, iw, ih, cover: { s, sx, sy }, uv,
        nodes, nodeR, card,
        headerY,
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
    const L = getStageSelectLayout({
        bonusUnlocked: !!opts.bonusUnlocked,
        trainingUnlocked: !!opts.trainingUnlocked
    });
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
        const isTraining = n.kind === 'training';
        const isSide = isBonus || isTraining;
        const cleared = !isSide && n.id <= maxCleared;
        const selectable = isSide || n.id <= maxSelectable;   // 寄り道は何度でも挑める
        const isCursor = n.id === cursor;
        ctx.save();
        // 台座円は薄塗り（ランドマークと街道を塗り潰さない。地図が主役、と実機
        // フィードバック 2026-08-11）。数字の可読性は円の色ではなく、文字側の
        // 影(fillTextInkCentered の後に敷く暗いハロー)で担保する。
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = isBonus ? 'rgba(88, 66, 18, 0.5)'
            : isTraining ? 'rgba(46, 30, 66, 0.5)'
            : cleared ? 'rgba(96, 46, 40, 0.5)'
            : selectable ? 'rgba(22, 34, 66, 0.46)'
            : 'rgba(20, 24, 36, 0.34)';
        ctx.fill();
        ctx.lineWidth = isCursor ? 3 : 1.5;
        ctx.strokeStyle = isCursor
            ? `rgba(255, 232, 160, ${(0.75 + pulse * 0.25).toFixed(3)})`
            : isBonus ? 'rgba(231, 196, 90, 0.8)'
            : isTraining ? 'rgba(196, 160, 240, 0.8)'
            : cleared ? 'rgba(224, 160, 130, 0.75)'
            : selectable ? 'rgba(150, 178, 232, 0.75)'
            : 'rgba(120, 132, 160, 0.38)';
        ctx.stroke();
        // カーソルの外環
        if (isCursor) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r + 6 + pulse * 3, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(231, 196, 90, ${(0.35 + pulse * 0.3).toFixed(3)})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        // 中身は【印だけ】。番号や「両/修」の文字は置かない ― 場所は地図の絵と
        // 選択カードの名前で分かる(実機フィードバック 2026-08-11)。
        // 行けるところは芯を灯し、まだ行けないところは輪だけにして差を出す。
        if (selectable) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = isBonus ? 'rgba(255, 232, 168, 0.92)'
                : isTraining ? 'rgba(230, 210, 255, 0.92)'
                : cleared ? 'rgba(240, 186, 164, 0.9)'
                : 'rgba(242, 247, 255, 0.92)';
            ctx.shadowColor = 'rgba(4, 8, 18, 0.9)';
            ctx.shadowBlur = Math.max(3, n.r * 0.3);
            ctx.fill();
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

    // 選択中の行き先は【名前だけ】。「第◯階層」は付けない ― 階層構造では
    // ないので実態と食い違う(実機フィードバック 2026-08-11)。
    // 【札(角丸カード)で囲まない】。下部メニューのボタンと同じ見た目なのに押す対象では
    // ないので、押せると誤解させる(実機フィードバック 2026-08-12)。銘として、
    // 明朝を一段大きく置き、左右へ細い罫を伸ばすだけにする。
    // 最高記録はその下に小さく添える。
    const sel = L.nodes.find(n => n.id === cursor);
    if (sel) {
        const c = L.card;
        const cx = c.x + c.w / 2;
        const midY = c.y + c.h / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.round(c.titleFont * 1.18)}px "Zen Old Mincho", serif`;
        fillTextInkCentered(ctx, sel.name, cx, midY);

        // 左右の罫。名前の実幅から伸ばすので、字数が変わっても間隔が揃う。
        const nameHalf = ctx.measureText(sel.name).width / 2;
        const ruleGap = 16 * getUiScale();
        const ruleLen = Math.max(0, c.w / 2 - nameHalf - ruleGap);
        if (ruleLen > 6) {
            const glow = 0.42 + pulse * 0.24;
            ctx.lineWidth = 1;
            let grad = ctx.createLinearGradient(cx - nameHalf - ruleGap - ruleLen, 0, cx - nameHalf - ruleGap, 0);
            grad.addColorStop(0, 'rgba(190, 214, 255, 0)');
            grad.addColorStop(1, `rgba(190, 214, 255, ${glow.toFixed(3)})`);
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(cx - nameHalf - ruleGap - ruleLen, midY);
            ctx.lineTo(cx - nameHalf - ruleGap, midY);
            ctx.stroke();
            grad = ctx.createLinearGradient(cx + nameHalf + ruleGap, 0, cx + nameHalf + ruleGap + ruleLen, 0);
            grad.addColorStop(0, `rgba(190, 214, 255, ${glow.toFixed(3)})`);
            grad.addColorStop(1, 'rgba(190, 214, 255, 0)');
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(cx + nameHalf + ruleGap, midY);
            ctx.lineTo(cx + nameHalf + ruleGap + ruleLen, midY);
            ctx.stroke();
        }

        // 寄り道は刻限60秒のスコアアタック。記録は難易度別なので、
        // どの難易度のものかを添えて取り違えを防ぐ。
        const best = opts.sideBest || {};
        const diffId = opts.difficultyId || 'normal';
        const diffTag = opts.difficultyName ? `（${opts.difficultyName}）` : '';
        const score = sel.kind === 'bonus' ? getSideBest(best, 'bonus', diffId)
            : sel.kind === 'training' ? getSideBest(best, 'training', diffId)
            : 0;
        if (score > 0) {
            const unit = sel.kind === 'bonus' ? '両' : '人';
            ctx.font = `500 ${Math.round(c.noteFont)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = 'rgba(214, 228, 250, 0.78)';
            fillTextInkCentered(
                ctx,
                `最高 ${formatCount(score)}${unit}${diffTag}`,
                c.x + c.w / 2,
                c.noteY
            );
        }
        ctx.restore();
    }

    // 操作説明（タイトル画面と同じトーン）
    drawScreenManualLine(ctx, isTouchOverlayMode()
        ? 'タップ：選択 | もう一度タップ：出陣準備'
        : '←→：選択 | SPACE：決定');
}
