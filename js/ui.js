// ============================================
// Unification of the Nation - UIクラス
// ============================================

import { SCREEN_WIDTH, CANVAS_HEIGHT, COLORS, VIRTUAL_PAD, HUD_PANEL_X, getDeviceProfile, getPadLayout, getUiScale, getFontScale, getFitScale, getScreenSafeArea, getUiLeftEdge, getFullHeightSideInset, isTouchOverlayMode, setVirtualPadVisible } from './constants.js?v=screen-safe-20260815o';

import { isUpdateAvailable } from './appUpdate.js?v=screen-safe-20260815o';

// 左上HUDの文字だけ、実寸アンカー(getFontScale)からさらに落とす係数。
// 実測 16.0css-px は情報量の割に大きいという実機フィードバック(2026-08-09)。
// 幾何(uiScale)は変えないので枠・ゲージの寸法は不変。
const HUD_TEXT_SCALE = 0.88;

// タイトル背景(title_bg.png 1672x941)の月中心の縦位置比率。実測 bbox y80..349 → 中心 214.5/941。
// スマホ(wide)の縦クロップでも月がPCと同じ画面比率に来るよう drawBgCover のアンカーに使う。
// PC/iPad はアスペクトが画像とほぼ同じでクロップが発生しないため、この値に関係なく従来と同一。
const TITLE_BG_MOON_FOCUS_Y = 214.5 / 941;

// 更新モーダルの文言。世界観より分かりやすさ優先（「版」は硬いので通じる言い方に）。
// 文字数がカード幅の元になるので定数で持つ。
const UPDATE_MODAL_TITLE = '新しいバージョンがあります';
const UPDATE_MODAL_BODY = '最新の状態に更新してください';
const UPDATE_MODAL_BUTTON_TOUCH = 'タップして更新';
const UPDATE_MODAL_BUTTON_KEY = 'クリックまたはSPACEで更新';
import { input } from './input.js?v=screen-safe-20260815o';
import { audio } from './audio.js?v=screen-safe-20260815o';
import { saveManager } from './save.js?v=screen-safe-20260815o';

const CONTROL_MANUAL_TEXT = '←→：移動 | ↓：しゃがみ | ↑・SPACE：ジャンプ | Z：攻撃 | X：忍具 | C：切り替え | S：奥義 | SHIFT：ダッシュ | ESC：ポーズ';
const TITLE_MANUAL_TEXT = '↑↓：選択 | ←→：難易度 | SPACE：決定';
const PAD_ICON_PATHS = {
    attack: './icon/attack.svg',
    sub: './icon/sub_weapon.svg',
    special: './icon/special.svg',
    switch: './icon/switch_weapon.svg',
    pause: './icon/pause.svg'
};
const PAD_ICON_FALLBACK = {
    attack: 'Z',
    sub: 'X',
    special: 'S',
    switch: 'C',
    pause: 'Ⅱ'
};
const BGM_ICON_PATHS = {
    unmuted: './icon/volume_on.svg',
    muted: './icon/volume_off.svg'
};
const WEAPON_ICON_PATHS = {
    '手裏剣': './images/hud_weapons/shuriken.png?v=20260718-6',
    '火薬玉': './images/hud_weapons/bomb.png?v=20260811-6',
    '大槍': './images/hud_weapons/spear.png?v=20260718-6',
    '二刀流': './images/hud_weapons/dual.png?v=20260718-3',
    '鎖鎌': './images/hud_weapons/kusarigama.png?v=20260719-1',
    '大太刀': './images/hud_weapons/odachi.png?v=20260718-6'
};
const TITLE_STAR_COUNT = 100;
let _titleLogoImage = null;   // プロ制作の金紺ロゴ画像（英字＋天下統一＋筆＋装飾を内包）
let _openingBgImage = null;   // オープニング背景画像
let _endingBgImage = null;    // エンディング背景画像
let _statusBgImage = null;    // ステータス画面背景画像
let _titleBgImage = null;     // タイトル画面背景画像

// オープニング/エンディングのフルスクリーン背景画像を描画。
// 読込前も旧背景は出さず、各シーンの平均的な暗色で下地を塗る（フラッシュ防止）。
// 全画面背景画像の cover-crop 描画（短辺フィット+中央クロップ、ソース矩形指定）。
// 可変スクリーン幅でも非一様ストレッチ（月の楕円化など）を起こさない。
// dest がソースと同アスペクトのときはソース全面≒従来描画。
// cover 描画。focusY は「画像内の縦位置(0..1)の点を、描画先でも同じ比率の位置に置く」
// ためのアンカー（CSS の object-position 相当。0.5=従来の上下中央クロップ）。
// 横長スクリーン(スマホの wide)では縦がクロップされるため、中央クロップだと
// 構図の主役(タイトルの月など)が画面ごとに上下へ動いてしまう。クロップが
// 発生しない環境(PC/iPad)ではアンカーに関係なく全体が写る＝従来と同一。
export function drawBgCover(ctx, img, dx, dy, dw, dh, focusY = 0.5) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!(iw > 0 && ih > 0 && dw > 0 && dh > 0)) return;
    const s = Math.max(dw / iw, dh / ih);
    const sw = dw / s, sh = dh / s;
    const sy = Math.max(0, Math.min(ih - sh, focusY * (ih - sh)));
    ctx.drawImage(img, (iw - sw) / 2, sy, sw, sh, dx, dy, dw, dh);
}

function drawCinematicBgImage(ctx, phase, timer) {
    let img;
    if (phase === 'ending') {
        if (!_endingBgImage) { _endingBgImage = new Image(); _endingBgImage.src = 'images/ending_bg.png'; }
        img = _endingBgImage;
    } else {
        if (!_openingBgImage) { _openingBgImage = new Image(); _openingBgImage.src = 'images/opening_bg.png'; }
        img = _openingBgImage;
    }
    ctx.save();
    ctx.fillStyle = (phase === 'ending') ? '#b3855f' : '#0b1430';  // 読込前/保険の下地（旧背景は出さない）
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
    if (img.complete && img.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        // Ken Burns：シーン経過に沿った一方向のゆっくり押し込み（はっきり分かる）＋微細な揺れ。
        // オーバースキャン分だけ拡大し、パンしても端が見えないようにする。
        const t = Date.now() * 0.001;
        const prog = Math.min(1, Math.max(0, (timer || 0) / 14000));  // 0→1 を約14秒で
        const zoom = 1.05 + prog * 0.10 + Math.sin(t * 0.5) * 0.006;  // 1.05→1.15 へ押し込み
        const panX = prog * 18 + Math.sin(t * 0.09) * 12;             // 右へドリフト
        const panY = -prog * 12 + Math.cos(t * 0.07) * 9;             // やや上へ
        const dw = SCREEN_WIDTH * zoom, dh = CANVAS_HEIGHT * zoom;
        drawBgCover(ctx, img, (SCREEN_WIDTH - dw) / 2 + panX, (CANVAS_HEIGHT - dh) / 2 + panY, dw, dh);
        // 重ねるモーション（すべて控えめ・本文の下）：光源グロー→霧→花びら→蛍/光の粒
        drawCinematicGlow(ctx, t, phase);
        drawCinematicMist(ctx, t, phase);
        drawDriftingPetals(ctx, t, phase);
        drawCinematicMotes(ctx, t, phase);
    }
    ctx.restore();
}

// 背景の上に舞う花びら（少数・低α・ループ）
function drawDriftingPetals(ctx, t, phase) {
    const N = 12;
    const tint = (phase === 'ending') ? '255, 214, 206' : '226, 224, 240';  // 夜明け=桜色 / 夜=淡い白
    const rnd = (x) => { const v = Math.sin(x) * 43758.5453; return v - Math.floor(v); };  // 疑似乱数 0..1
    ctx.save();
    for (let i = 0; i < N; i++) {
        const s = (i + 1) * 12.9898;
        const fx = rnd(s);
        const fall = 16 + rnd(s * 1.7) * 20;        // 落下速度 px/s
        const sway = 16 + rnd(s * 2.3) * 26;        // 横揺れ幅
        const size = 3 + rnd(s * 3.1) * 3.5;
        const ph = s * 1.3;
        const y = ((t * fall + i * 71) % (CANVAS_HEIGHT + 40)) - 20;
        const x = fx * SCREEN_WIDTH + Math.sin(t * 0.5 + ph) * sway;
        ctx.globalAlpha = 0.22 + rnd(s * 4.7) * 0.2;
        ctx.fillStyle = `rgba(${tint}, 1)`;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 0.58, Math.sin(t * 0.4 + ph), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// 光源(夜=月/夜明け=朝日)の柔らかいグロー明滅
function drawCinematicGlow(ctx, t, phase) {
    const cx = (phase === 'ending') ? SCREEN_WIDTH * 0.19 : SCREEN_WIDTH * 0.80;
    const cy = CANVAS_HEIGHT * 0.13;
    const pulse = 0.5 + Math.sin(t * 0.5) * 0.5;
    const a = 0.06 + pulse * 0.10;
    const r = ((phase === 'ending') ? 160 : 135) * (1 + pulse * 0.08);
    const col = (phase === 'ending') ? '255, 196, 132' : '250, 244, 220';
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${col}, ${a.toFixed(3)})`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
}

// 下部に薄く流れる霧（2バンドをゆっくり横流し）
function drawCinematicMist(ctx, t, phase) {
    const tint = (phase === 'ending') ? '255, 212, 184' : '178, 198, 234';
    const bands = [
        { y: 0.64, h: 64, sp: 13, a: 0.05, amp: 9 },
        { y: 0.78, h: 86, sp: 9, a: 0.045, amp: 13 }
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const b of bands) {
        const cy = CANVAS_HEIGHT * b.y + Math.sin(t * 0.2 + b.y) * b.amp;
        const base = (t * b.sp) % (SCREEN_WIDTH + 520);
        for (let k = -1; k < 3; k++) {
            const cx = base - 260 + k * 520;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 330);
            g.addColorStop(0, `rgba(${tint}, ${b.a})`);
            g.addColorStop(1, `rgba(${tint}, 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 330, b.h, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

// 蛍/光の粒（ゆっくり漂い、明滅）。夜=蛍の緑黄、夜明け=金粉
function drawCinematicMotes(ctx, t, phase) {
    const N = 9;
    const col = (phase === 'ending') ? '255, 238, 206' : '198, 240, 170';
    const rnd = (x) => { const v = Math.sin(x) * 43758.5453; return v - Math.floor(v); };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
        const s = (i + 1) * 7.317;
        const x = rnd(s) * SCREEN_WIDTH + Math.sin(t * (0.15 + rnd(s * 1.3) * 0.2) + s) * 55;
        const y = (0.28 + rnd(s * 1.7) * 0.55) * CANVAS_HEIGHT + Math.cos(t * (0.12 + rnd(s * 2.1) * 0.13) + s * 1.4) * 36;
        const tw = 0.5 + 0.5 * Math.sin(t * (1.0 + rnd(s * 3.0) * 1.4) + s * 2.0);
        const a = 0.08 + tw * 0.30;
        const rad = (1.6 + rnd(s * 4.0) * 2.2) * 4;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${col}, ${a.toFixed(3)})`);
        g.addColorStop(1, `rgba(${col}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// 起動時にオープニング/エンディング背景を先読み（intro/endingで読込前の下地が見えるのを防ぐ）
export function preloadCinematicBgImages() {
    if (!_openingBgImage) { _openingBgImage = new Image(); _openingBgImage.src = 'images/opening_bg.png'; }
    if (!_endingBgImage) { _endingBgImage = new Image(); _endingBgImage.src = 'images/ending_bg.png'; }
    if (!_statusBgImage) { _statusBgImage = new Image(); _statusBgImage.src = 'images/status_bg.png'; }
    if (!_titleBgImage) { _titleBgImage = new Image(); _titleBgImage.src = 'images/title_bg.png'; }
    if (!_titleLogoImage) { _titleLogoImage = new Image(); _titleLogoImage.src = 'images/title_logo.png'; }
    const wait = (img) => new Promise((resolve) => {
        if (img.complete && img.naturalWidth) { resolve(); return; }
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
    });
    return Promise.all([wait(_openingBgImage), wait(_endingBgImage), wait(_statusBgImage), wait(_titleBgImage), wait(_titleLogoImage)]);
}

const KANJI_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 小判の絵（HUDのアイコンと蔵の落ちている小判で同じものを使う）。
// 生成画像は黒背景なので、透過へ抜いた koban.png を読む。まだ無い/読めない
// 場合は false を返し、呼び出し側のコード描画へ落ちる。
const KOBAN_IMAGE_SRC = 'images/koban.png';
let _kobanImg = null;
// 小判は【縦長が標準の向き】。立てた姿のまま描き、回転や横倒しはしない
// (実機フィードバック 2026-08-11)。
export function drawKobanImage(ctx, cx, cy, w, h) {
    if (typeof Image === 'undefined') return false;
    if (!_kobanImg) {
        _kobanImg = new Image();
        _kobanImg.src = KOBAN_IMAGE_SRC;
    }
    if (!(_kobanImg.complete && _kobanImg.naturalWidth)) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(_kobanImg, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
    return true;
}

// 位取りのカンマ付き整数。小判・討伐数など画面に出る計数はすべてこれを通す。
export function formatCount(value) {
    const safe = Math.max(0, Math.floor(Number(value) || 0));
    return safe.toLocaleString('ja-JP');
}
const formatMoney = formatCount;

function toKanjiSection(value) {
    if (value <= 0) return '';
    const units = [
        { value: 1000, label: '千' },
        { value: 100, label: '百' },
        { value: 10, label: '十' }
    ];
    let n = value;
    let result = '';
    for (const unit of units) {
        const d = Math.floor(n / unit.value);
        if (d > 0) {
            if (!(d === 1 && unit.value >= 10)) result += KANJI_DIGITS[d];
            result += unit.label;
            n %= unit.value;
        }
    }
    if (n > 0) result += KANJI_DIGITS[n];
    return result;
}

function toKanjiNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '?';
    const intVal = Math.max(0, Math.floor(Math.abs(n)));
    if (intVal === 0) return KANJI_DIGITS[0];
    const man = Math.floor(intVal / 10000);
    const rest = intVal % 10000;
    let result = '';
    if (man > 0) result += `${toKanjiSection(man)}万`;
    if (rest > 0) result += toKanjiSection(rest);
    return result || KANJI_DIGITS[0];
}

/**
 * 汎用フラットボタン描画ヘルパー
 */
export function drawFlatButton(ctx, x, y, width, height, label, color) {
    ctx.save();
    ctx.fillStyle = color || 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - width / 2, y - height / 2, width, height);
    
    // 不要な枠線描画(strokeRect)を削除
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px "Zen Old Mincho", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function drawRoundedFlatTitleButton(ctx, x, y, width, height, label, options = {}) {
    // 昇段トンマナの和風カードボタン（選択でグロー）。難易度ボタンは色アクセントで区別。
    const focused = !!options.focused;
    const pulse = options.pulse || 0;
    const radius = Number.isFinite(options.radius) ? options.radius : 12;
    const font = options.font || '700 22px "Zen Old Mincho", serif';
    const accentColor = options.accentColor || null;
    // royal: 将軍の出陣。通常（忍者）と差をつけるため金の気配をまとわせる
    const royal = !!options.royal;
    const textColor = options.textColor
        || (royal
            ? (focused ? '#fdefc9' : 'rgba(236, 214, 158, 0.88)')
            : (focused ? '#ffffff' : 'rgba(224, 234, 255, 0.82)'));

    const left = x - width * 0.5;
    const top = y - height * 0.5;

    // royal は通常と同一の描画経路。差は色（グロー／枠／上辺アクセント／文字）だけ
    drawWafuCard(ctx, left, top, width, height, {
        radius, selected: focused, pulse,
        accent: !accentColor,
        glowRGB: royal ? '214, 176, 92' : undefined,
        borderSelRGB: royal ? '232, 202, 120' : undefined,
        accentRGB: royal ? '240, 210, 120' : undefined
    });

    if (accentColor) {
        // 難易度色などの色帯アクセント（青アクセントの代わり）
        ctx.save();
        wafuRoundRectPath(ctx, left, top, width, height, radius);
        ctx.clip();
        const a = ctx.createLinearGradient(left, 0, left + width, 0);
        a.addColorStop(0, 'rgba(0, 0, 0, 0)');
        a.addColorStop(0.5, accentColor);
        a.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = a;
        ctx.fillRect(left, top, width, 2);
        ctx.restore();
    }

    if (label) {
        ctx.save();
        ctx.fillStyle = textColor;
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.restore();
    }
}

// タッチUI（仮想パッド）が有効なモードか（端末判定）
// 矩形の上下中央へ文字を置く。textBaseline='middle' は em ボックス基準のため、
// 和文は文字列ごとにインク（実際に塗られる範囲）の中心がずれる
// （実測: 同じボタンで「タイトルに戻る」は3px下、「もう一度タップ」はほぼ中央）。
// measureText の実インクで測って合わせると、どのラベルでも見た目が中央になる。
// actualBoundingBox 非対応環境では従来の middle にフォールバック。
export function fillTextInkCentered(ctx, text, cx, cy) {
    const prev = ctx.textBaseline;
    // actualBoundingBox* は「現在の textBaseline からの距離」なので、
    // 計測と描画で同じ alphabetic を使う（middle のまま測ると em ボックスぶんずれる）。
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    const asc = m.actualBoundingBoxAscent;
    const desc = m.actualBoundingBoxDescent;
    if (Number.isFinite(asc) && Number.isFinite(desc)) {
        ctx.fillText(text, cx, cy + (asc - desc) / 2);
    } else {
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy);
    }
    ctx.textBaseline = prev;
}

// キーボード操作マニュアルを隠すべきか（タップモード かつ 物理キーボード未検知）。
// 外部キーボードを繋いで keydown が検知されたら表示する。
function shouldHideKeyboardManual() {
    return isTouchOverlayMode() && !(input && input.hasPhysicalKeyboard);
}

function drawControlManualLine(ctx, y = CANVAS_HEIGHT - 20) {
    drawScreenManualLine(ctx, CONTROL_MANUAL_TEXT, y);
}

export function drawScreenManualLine(ctx, text, y = CANVAS_HEIGHT - 20) {
    if (shouldHideKeyboardManual()) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `${12 * getFontScale()}px "Zen Old Mincho", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // 画面最下端はホームインジケータ/角丸に食われるので退避分だけ持ち上げる
    ctx.fillText(text, SCREEN_WIDTH / 2, y - getScreenSafeArea().bottom);
    ctx.restore();
}

// タイトルロゴ：画像(images/title_logo.png)を描画。背後の月(後光)は renderTitleScreen 側。
function drawRichTitleLogo(ctx, timeMs) {
    const titleX = SCREEN_WIDTH / 2;
    const titleY = CANVAS_HEIGHT / 2 - 145;
    const titleRenderY = titleY;   // 固定（±0.5pxの揺れ＋Math.roundで1px単位にカクつく「ピクピク」を防止）

    // プロ制作のロゴ画像を遅延ロード（英字＋天下統一＋筆＋装飾を1枚に内包）
    if (!_titleLogoImage) {
        _titleLogoImage = new Image();
        _titleLogoImage.src = 'images/title_logo.png';
    }
    const img = _titleLogoImage;
    if (!img.complete || !img.naturalWidth) return; // 読込前は何も描かない（ポップインのみ）

    const aspect = img.naturalWidth / img.naturalHeight;   // ≈3.02
    // 可変スクリーン幅でも難易度ボタンへめり込まないよう上限1000pxでクランプ
    const drawW = Math.min(Math.round(SCREEN_WIDTH * 0.78), 1000);
    const drawH = Math.round(drawW / aspect);
    const lx = Math.round(titleX - drawW / 2);
    const ly = Math.round(titleRenderY - drawH * 0.5);     // 画像中心を titleRenderY に

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // 大月の上でも沈まないよう柔らかい影で浮かせる
    ctx.shadowColor = 'rgba(6, 10, 24, 0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(img, lx, ly, drawW, drawH);
    ctx.restore();
}

function drawTitleMistLayers(ctx, timeMs) {
    const t = timeMs * 0.001;
    const layers = [
        { y: CANVAS_HEIGHT * 0.5, amp: 10, speed: 42, alpha: 0.1, w: 300, h: 88, tint: '188, 211, 255' },
        { y: CANVAS_HEIGHT * 0.64, amp: 14, speed: 30, alpha: 0.08, w: 400, h: 112, tint: '168, 194, 245' },
        { y: CANVAS_HEIGHT * 0.78, amp: 10, speed: 20, alpha: 0.06, w: 500, h: 132, tint: '148, 176, 228' }
    ];

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const densityStep = 1;
    for (const layer of layers) {
        for (let i = -2; i < 5; i += densityStep) {
            const travel = ((timeMs * layer.speed * 0.001) + i * (layer.w * 0.72)) % (SCREEN_WIDTH + layer.w * 1.35);
            const cx = travel - layer.w * 0.65;
            const cy = layer.y + Math.sin(t * (0.82 + i * 0.14) + i * 1.23) * layer.amp;
            const grad = ctx.createRadialGradient(cx, cy, layer.w * 0.06, cx, cy, layer.w * 0.58);
            grad.addColorStop(0, `rgba(${layer.tint}, ${layer.alpha})`);
            grad.addColorStop(0.52, `rgba(${layer.tint}, ${layer.alpha * 0.46})`);
            grad.addColorStop(1, 'rgba(110, 140, 210, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(cx, cy, layer.w, layer.h, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const depthFog = ctx.createLinearGradient(0, CANVAS_HEIGHT * 0.54, 0, CANVAS_HEIGHT);
    depthFog.addColorStop(0, 'rgba(166, 194, 246, 0)');
    depthFog.addColorStop(0.45, 'rgba(146, 176, 236, 0.06)');
    depthFog.addColorStop(1, 'rgba(120, 154, 214, 0.11)');
    ctx.fillStyle = depthFog;
    ctx.fillRect(0, CANVAS_HEIGHT * 0.54, SCREEN_WIDTH, CANVAS_HEIGHT * 0.46);
    ctx.restore();
}

function drawStageStyleCelestialBody(ctx, x, y, radius, coreTop, coreBottom, glowColor, alpha = 1, glowScale = 3.2) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= alpha;

    const glowR = radius * glowScale;
    const peakStop = radius / glowR;
    const midStop = Math.min(peakStop + (1 - peakStop) * 0.45, 0.98);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    glow.addColorStop(0, glowColor.replace('ALPHA', '0.15'));
    glow.addColorStop(peakStop, glowColor.replace('ALPHA', '0.75'));
    glow.addColorStop(midStop, glowColor.replace('ALPHA', '0.18'));
    glow.addColorStop(1, glowColor.replace('ALPHA', '0'));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    const coreGrad = ctx.createLinearGradient(0, -radius, 0, radius);
    coreGrad.addColorStop(0, coreTop);
    coreGrad.addColorStop(1, coreBottom);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// タイトル専用の満月。発光する球＋淡い海＋縁の艶。
// グローは月中心の真円・控えめな呼吸（マスクは使わない＝形が歪まない）。
function drawTitleMoon(ctx, cx, cy, r, timeMs) {
    // 月中心の円形グロー（穏やかに呼吸。激しくしない）
    const breath = 0.5 + 0.5 * Math.sin(timeMs * 0.0014); // 0..1, 約4.5s周期
    const haloA = 0.10 + 0.18 * breath;                   // 0.10..0.28（もう少し強い呼吸）
    const haloR = r * (2.0 + 0.28 * breath);              // 2.0r..2.28r（広がりも呼吸。中心一致＝真円維持）
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, haloR);
    halo.addColorStop(0, `rgba(255, 243, 214, ${haloA.toFixed(3)})`);
    halo.addColorStop(0.5, `rgba(250, 240, 214, ${(haloA * 0.34).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(210, 222, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill();

    // --- 本体ディスク（発光する暖アイボリーの放射グラデ。光源は中心やや上） ---
    ctx.globalCompositeOperation = 'source-over';
    const lgx = cx, lgy = cy - r * 0.20;
    const disc = ctx.createRadialGradient(lgx, lgy, r * 0.05, lgx, lgy, r * 1.08);
    disc.addColorStop(0.00, '#fcf8f0');
    disc.addColorStop(0.55, '#f4eede');
    disc.addColorStop(0.85, '#ebe1cd');
    disc.addColorStop(1.00, '#ded2ba');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // 月の海（淡い斑：のっぺり防止。暖グレーを控えめに乗算）
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    const maria = [
        [-0.28, -0.16, 0.36, 0.06],
        [ 0.24, -0.28, 0.22, 0.05],
        [ 0.08,  0.26, 0.40, 0.055],
        [-0.32,  0.30, 0.20, 0.045],
        [ 0.34,  0.14, 0.16, 0.04]
    ];
    for (const m of maria) {
        const mx = cx + m[0] * r, my = cy + m[1] * r, mr = m[2] * r;
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, `rgba(168, 156, 132, ${m[3]})`);
        mg.addColorStop(1, 'rgba(168, 156, 132, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 縁の艶（リムライト：上側を明るく細く）
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = Math.max(1.5, r * 0.012);
    const rim = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    rim.addColorStop(0, 'rgba(255, 250, 236, 0.55)');
    rim.addColorStop(0.5, 'rgba(255, 250, 236, 0.06)');
    rim.addColorStop(1, 'rgba(255, 250, 236, 0)');
    ctx.strokeStyle = rim;
    ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
}

function drawTitleBackdropSilhouettes(ctx, timeMs) {
    const t = timeMs * 0.001;
    const layers = [
        {
            baseY: CANVAS_HEIGHT * 0.62,
            step: 250,
            color: 'rgba(18, 26, 56, 0.5)',
            heightBase: 118,
            heightAmp: 36,
            drift: 0.016
        },
        {
            baseY: CANVAS_HEIGHT * 0.72,
            step: 205,
            color: 'rgba(9, 14, 33, 0.78)',
            heightBase: 96,
            heightAmp: 28,
            drift: 0.022
        }
    ];

    ctx.save();
    for (const layer of layers) {
        ctx.fillStyle = layer.color;
        const shift = (timeMs * layer.drift) % layer.step;
        ctx.beginPath();
        ctx.moveTo(-layer.step - shift, CANVAS_HEIGHT);
        for (let x = -layer.step - shift; x <= SCREEN_WIDTH + layer.step * 1.5; x += layer.step) {
            const peak = layer.baseY - layer.heightBase
                - Math.sin((x + 160) * 0.011 + t * 0.33) * layer.heightAmp
                - Math.cos((x + 70) * 0.018 + t * 0.21) * (layer.heightAmp * 0.42);
            ctx.lineTo(x + layer.step * 0.38, peak);
            ctx.lineTo(x + layer.step, layer.baseY);
        }
        ctx.lineTo(SCREEN_WIDTH + layer.step * 2, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();
    }

    const shrineY = CANVAS_HEIGHT * 0.74;
    ctx.fillStyle = 'rgba(16, 9, 24, 0.82)';
    ctx.fillRect(0, shrineY, SCREEN_WIDTH, CANVAS_HEIGHT - shrineY);
    for (let i = -1; i < 6; i++) {
        const gateX = i * 240 - ((timeMs * 0.021) % 240) + 40;
        ctx.fillRect(gateX, shrineY - 10, 120, 10);
        ctx.fillRect(gateX + 8, shrineY, 10, 120);
        ctx.fillRect(gateX + 98, shrineY, 10, 120);
        ctx.fillRect(gateX - 2, shrineY - 18, 134, 8);
    }
    ctx.restore();
}

export function getTitleScreenLayout() {
    const centerX = SCREEN_WIDTH / 2;
    const diffY = CANVAS_HEIGHT / 2 + 64;
    const isGameCleared = typeof saveManager !== 'undefined' && saveManager.loadGlobal().isGameCleared;

    // ボタンは幾何(uiScale)で拡大する。s=1 のPCでは従来値と数値同一。
    // 縦位置も同じ倍率で開かないと、背が伸びたぶんボタン同士が重なる。
    const s = getUiScale();
    const diffButton = { width: 230 * s, height: 44 * s };
    const actionButton = { width: 280 * s, height: 48 * s };
    let startY = diffY + 140 * s;          // s=1 で従来の 564
    let newGameY = startY + 64 * s;        // s=1 で従来の 628
    // 拡大で下端からはみ出す場合は、2つまとめて上へ寄せる（間隔は保つ）。
    const bottomLimit = CANVAS_HEIGHT - getScreenSafeArea().bottom - 20 - actionButton.height * 0.5;
    const overflow = newGameY - bottomLimit;
    if (overflow > 0) { startY -= overflow; newGameY -= overflow; }

    // 右下⚙（デバッグ入口）。セーフエリア/角丸で内側へ退避するため位置が動的。
    // 描画(renderTitleScreen)とタップ判定(game.updateTitle)は必ずここを読むこと
    // （判定側を画面の角の固定矩形にすると、退避した見た目とヒットが必ずズレる）。
    // anchorX/anchorY は fillText(right/bottom 揃え)へ渡す座標。
    const safe = getScreenSafeArea();
    const gearFont = 24 * getFontScale();
    // ⚙は右上のBGMボタンと右端を揃える（別々の基準で置くと実機で縦のラインが
    // 揃わず目立つ）。fillText は右揃えなので anchorX がそのまま右端。
    const bgmBtn = getPadLayout().bgm;
    const gearAnchorX = bgmBtn.x + bgmBtn.r;
    // 画面下端の共通ライン。左下の更新通知と右下の⚙はこの線で下揃えする
    // （別々の余白で置くと左右の隅で高さが食い違って見える）。
    const bottomLine = CANVAS_HEIGHT - safe.bottom - 14;
    const gearAnchorY = bottomLine;
    const gearHitHalf = Math.max(52, gearFont); // 小さな⚙でも指で押せる寛容半径

    return {
        centerX,
        diffY,
        characterY: isGameCleared ? diffY + 54 : null,
        startY,
        newGameY,
        singleStartY: startY,
        diffButton,
        actionButton,
        // 文字は「幾何より少しだけ大きく、ただし fontScale ほどは上げない」。
        // 実寸アンカー(fontScale=最大1.9)をそのまま掛けると枠に対して大きすぎた
        // （実機フィードバック 2026-08-09）。上限を uiScale に紐付けておけば
        // 文字がボタンの高さを追い越さない。PC(s=1)は従来値と同一。
        actionFontPx: 22 * Math.min(getFontScale(), s * 1.05),
        diffFontPx: 21 * Math.min(getFontScale(), s * 1.05),
        gear: {
            anchorX: gearAnchorX,
            anchorY: gearAnchorY,
            font: gearFont,
            hit: {
                x: gearAnchorX - gearFont * 0.5 - gearHitHalf,
                y: gearAnchorY - gearFont * 0.5 - gearHitHalf,
                w: gearHitHalf * 2,
                h: gearHitHalf * 2
            }
        }
    };
}

// 更新モーダル（画面中央）。新しいバージョンを検知したらこれで更新を促す。
// PC/スマホ問わず全デバイスで出す。描画(renderUpdateModal)とタップ判定
// (game.updateTitle)は必ずこの導出を共有すること。
export function getUpdateModalLayout() {
    // 文字は幾何より少し大きく、ただし fontScale ほどは上げない（タイトルボタンと同方針）。
    const tf = Math.min(getFontScale(), getUiScale() * 1.15);
    const titleFont = 22 * tf;
    const bodyFont = 15 * tf;
    const btnFont = 18 * tf;
    const btnLabel = isTouchOverlayMode() ? UPDATE_MODAL_BUTTON_TOUCH : UPDATE_MODAL_BUTTON_KEY;

    const pad = titleFont * 1.2;
    const em = (text, font) => text.length * font;   // 全角1文字≒1em
    const innerW = Math.max(
        em(UPDATE_MODAL_TITLE, titleFont),
        em(UPDATE_MODAL_BODY, bodyFont),
        em(btnLabel, btnFont)
    );
    const cardW = Math.min(SCREEN_WIDTH - getFullHeightSideInset() * 2 - pad, innerW + pad * 2);

    const padY = titleFont * 0.9;
    const titleH = titleFont * 1.4;
    const bodyH = bodyFont * 1.5;
    const gapA = titleFont * 0.5;
    const gapB = titleFont * 0.7;
    const btnH = btnFont * 2.3;
    const cardH = padY * 2 + titleH + gapA + bodyH + gapB + btnH;

    const cardX = SCREEN_WIDTH / 2 - cardW / 2;
    const cardY = Math.max(getScreenSafeArea().top + 8, (CANVAS_HEIGHT - cardH) / 2);
    const titleY = cardY + padY + titleH / 2;
    const bodyY = titleY + titleH / 2 + gapA + bodyH / 2;
    const btnY = bodyY + bodyH / 2 + gapB;

    return {
        card: { x: cardX, y: cardY, w: cardW, h: cardH },
        titleY, bodyY,
        titleFont, bodyFont, btnFont, btnLabel,
        button: { x: cardX + pad, y: btnY, w: cardW - pad * 2, h: btnH }
    };
}

export function renderUpdateModal(ctx, timeMs = 0) {
    const L = getUpdateModalLayout();
    const c = L.card, b = L.button;
    const pulse = 0.5 + Math.sin(timeMs * 0.004) * 0.5;

    ctx.save();
    // 背面を落として「これを片付けないと進めない」ことを見せる
    ctx.fillStyle = 'rgba(2, 6, 18, 0.78)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    drawWafuCard(ctx, c.x, c.y, c.w, c.h, { radius: 14, selected: false, pulse: 0, bgAlpha: 0.96 });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2f7ff';
    ctx.font = `700 ${Math.round(L.titleFont)}px "Zen Old Mincho", serif`;
    fillTextInkCentered(ctx, UPDATE_MODAL_TITLE, c.x + c.w / 2, L.titleY);

    ctx.fillStyle = 'rgba(214, 228, 255, 0.92)';
    ctx.font = `500 ${Math.round(L.bodyFont)}px "Zen Old Mincho", serif`;
    fillTextInkCentered(ctx, UPDATE_MODAL_BODY, c.x + c.w / 2, L.bodyY);

    // 更新ボタン（この1つだけが押せる＝迷わせない）
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x, b.y, b.w, b.h, 10);
    else ctx.rect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(46, 68, 122, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(231, 196, 90, ${(0.6 + pulse * 0.4).toFixed(3)})`;
    ctx.stroke();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = `700 ${Math.round(L.btnFont)}px "Zen Old Mincho", serif`;
    fillTextInkCentered(ctx, L.btnLabel, b.x + b.w / 2, b.y + b.h / 2);
    ctx.restore();
}

export class UI {
    constructor() {
        this.hudPadding = 20;
        this.padActionIcons = {
            attack: this.createUiImage(PAD_ICON_PATHS.attack),
            sub: this.createUiImage(PAD_ICON_PATHS.sub),
            special: this.createUiImage(PAD_ICON_PATHS.special),
            switch: this.createUiImage(PAD_ICON_PATHS.switch),
            pause: this.createUiImage(PAD_ICON_PATHS.pause)
        };
        this.bgmToggleIcons = {
            unmuted: this.createUiImage(BGM_ICON_PATHS.unmuted),
            muted: this.createUiImage(BGM_ICON_PATHS.muted)
        };
        this.weaponIcons = Object.fromEntries(
            Object.entries(WEAPON_ICON_PATHS).map(([name, src]) => [name, this.createUiImage(src)])
        );
    }

    createUiImage(src) {
        const image = new Image();
        image.src = src;
        return image;
    }
    
    // HUD描画
    renderHUD(ctx, player, stage) {
        const drawRoundedRectPath = (px, py, w, h, r) => {
            const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
            ctx.beginPath();
            ctx.moveTo(px + rr, py);
            ctx.lineTo(px + w - rr, py);
            ctx.arcTo(px + w, py, px + w, py + rr, rr);
            ctx.lineTo(px + w, py + h - rr);
            ctx.arcTo(px + w, py + h, px + w - rr, py + h, rr);
            ctx.lineTo(px + rr, py + h);
            ctx.arcTo(px, py + h, px, py + h - rr, rr);
            ctx.lineTo(px, py + rr);
            ctx.arcTo(px, py, px + rr, py, rr);
            ctx.closePath();
        };

        const drawModernGauge = (gx, gy, gw, gh, ratio, colorStops, radius = Math.floor(gh / 2)) => {
            const clamped = Math.max(0, Math.min(1, ratio));
            const trackGrad = ctx.createLinearGradient(gx, gy, gx, gy + gh);
            trackGrad.addColorStop(0, 'rgba(23, 30, 52, 0.88)');
            trackGrad.addColorStop(1, 'rgba(11, 16, 30, 0.9)');
            drawRoundedRectPath(gx, gy, gw, gh, radius);
            ctx.fillStyle = trackGrad;
            ctx.fill();

            if (clamped > 0) {
                const fillW = Math.max(2, gw * clamped);
                const fillGrad = ctx.createLinearGradient(gx, gy, gx + fillW, gy);
                for (const stop of colorStops) fillGrad.addColorStop(stop[0], stop[1]);
                drawRoundedRectPath(gx + 1, gy + 1, Math.max(1, fillW - 2), gh - 2, Math.max(2, radius - 1));
                ctx.fillStyle = fillGrad;
                ctx.fill();
            }

            // 上端の控えめなシーン（強い光沢は古いので薄く）
            drawRoundedRectPath(gx + 1.5, gy + 1.5, gw - 3, Math.max(1, gh * 0.4), Math.max(2, radius - 2));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
            ctx.fill();
            drawRoundedRectPath(gx, gy, gw, gh, radius);
            ctx.strokeStyle = 'rgba(150, 178, 232, 0.26)';
            ctx.lineWidth = 1;
            ctx.stroke();
        };

        // --- 左上HUD（刷新） ---
        // uiScale>1(スマホ)のとき原点アンカーで一様拡大。加えてノッチ/角丸に
        // 食われる分だけ内側へ寄せる(退避量は scale の外＝等倍論理pxで平行移動)。
        // s=1 かつ退避0の端末では save 自体を行わず既存描画と完全同一のパスを通す。
        // 文字だけは fx 倍して実寸を確保する（uiS は幾何、fontScale は文字のアンカー。
        // fx は wrap の内側で使うので uiS で割って二重掛けを打ち消す）。
        const uiS = getUiScale();
        const fx = getFontScale() * HUD_TEXT_SCALE / uiS;
        const panelX = HUD_PANEL_X;
        // パネル左端を画面左の共通ライン(getUiLeftEdge)へ。仮想パッドのポーズボタンも
        // 同じラインに左揃えする。ラインは「角丸クリアランス＋この余白」と
        // 「ノッチ帯」の大きい方＝HUDは縦に大きく Dynamic Island に掛かるため。
        const hudSafe = {
            left: getUiLeftEdge() - panelX * uiS,
            top: getScreenSafeArea().top
        };
        const hudWrap = (uiS !== 1) || hudSafe.left > 0 || hudSafe.top > 0;
        if (hudWrap) {
            ctx.save();
            if (hudSafe.left > 0 || hudSafe.top > 0) ctx.translate(hudSafe.left, hudSafe.top);
            if (uiS !== 1) ctx.scale(uiS, uiS);
        }
        const hpBarWidth = 300;
        const hpBarHeight = 18;
        const panelPadding = 18;
        const panelY = 24;
        const panelW = hpBarWidth + panelPadding * 2;
        const panelH = 182;
        const x = panelX + panelPadding;
        const y = panelY + 36;

        ctx.save();
        const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        panelGrad.addColorStop(0, 'rgba(25, 35, 64, 0.5)');
        panelGrad.addColorStop(1, 'rgba(9, 13, 28, 0.56)');
        drawRoundedRectPath(panelX, panelY, panelW, panelH, 15);
        ctx.fillStyle = panelGrad;
        ctx.fill();
        drawRoundedRectPath(panelX, panelY, panelW, panelH, 15);
        ctx.strokeStyle = 'rgba(170, 195, 255, 0.28)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();

        const hpRatio = Math.max(0, player.hp / player.maxHp);
        // HP残量に応じた単一色（左右の虹グラデは古いので廃止）：緑→橙→赤
        const hpHexLerp = (a, b, t) => {
            const tt = Math.max(0, Math.min(1, t));
            const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
            const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
            const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * tt));
            return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
        };
        const hpColor = hpRatio > 0.5
            ? hpHexLerp('#ffc24a', '#46d98a', (hpRatio - 0.5) * 2)
            : hpHexLerp('#ff5566', '#ffc24a', hpRatio * 2);
        drawModernGauge(x, y, hpBarWidth, hpBarHeight, hpRatio, [[0, hpColor], [1, hpColor]]);

        const levelKanji = toKanjiNumber(player.level);
        const hpStr = `体力：${player.hp} / ${player.maxHp}`;
        const lvStr = `${levelKanji}段`;

        // 影（軽量化）：体力ラベル=明朝／数字=サンセリフ、段位の漢数字=明朝
        const hudTextPx = 16 * fx;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        drawNumMixedText(ctx, hpStr, x + 1, y - 7, 700, hudTextPx, 'left');
        drawNumMixedText(ctx, lvStr, x + hpBarWidth + 1, y - 7, 700, hudTextPx, 'right');
        // 本体
        ctx.fillStyle = '#fff';
        drawNumMixedText(ctx, hpStr, x, y - 8, 700, hudTextPx, 'left');
        drawNumMixedText(ctx, lvStr, x + hpBarWidth, y - 8, 700, hudTextPx, 'right');
        ctx.textAlign = 'left';

        const spBarWidth = 250;
        const spBarHeight = 15;
        const spY = y + 38;
        const barX = x + 50;
        const spRatio = Math.max(0, player.specialGauge / player.maxSpecialGauge);
        const isSpReady = spRatio >= 1;
        drawModernGauge(
            barX,
            spY,
            spBarWidth,
            spBarHeight,
            spRatio,
            isSpReady
                ? [[0, '#ffe177'], [0.55, '#ffd14e'], [1, '#ff9d3a']]
                : [[0, '#dec06c'], [1, '#9d8644']]
        );

        const hudLabelFont = `700 ${15 * fx}px "Zen Old Mincho", serif`;
        ctx.font = hudLabelFont;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        if (isSpReady) {
            const timeSinceReady = typeof window !== 'undefined' && window.game && window.game.specialReadyFlashTime 
                ? Date.now() - window.game.specialReadyFlashTime 
                : Infinity;
            const burstAlpha = Math.max(0, 1 - timeSinceReady / 500); // 500ms flash

            const t = Date.now() * 0.005;
            const pulse = (Math.sin(t) + 1) / 2; // 0.0 ~ 1.0
            
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            
            // iPad等での重いshadowBlurを避け、半透明の太線で発光を軽量に表現
            ctx.strokeStyle = `rgba(255, 210, 80, ${0.3 + pulse * 0.3})`;
            ctx.lineWidth = 4 + pulse * 2;
            drawRoundedRectPath(barX, spY, spBarWidth, spBarHeight, Math.floor(spBarHeight / 2));
            ctx.stroke();

            // ゲージ上に輝くオーバーレイを重ねる
            if (burstAlpha > 0) {
                ctx.fillStyle = `rgba(255, 255, 255, ${burstAlpha})`;
            } else {
                ctx.fillStyle = `rgba(255, 210, 80, ${0.25 + pulse * 0.45})`;
            }
            drawRoundedRectPath(barX, spY, spBarWidth, spBarHeight, Math.floor(spBarHeight / 2));
            ctx.fill();
            ctx.restore();
        }

        // テキストは光らせず常に通常表示（影も軽量化）
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText('奥義', x + 1, spY + spBarHeight / 2 + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText('奥義', x, spY + spBarHeight / 2);

        const expBarWidth = 250;
        const expBarHeight = 15;
        const expY = spY + 30;
        const expRatio = Math.max(0, player.exp / player.expToNext);
        const expColors = [[0, '#53e87d'], [0.58, '#41d0b8'], [1, '#2f9dd9']];

        drawModernGauge(barX, expY, expBarWidth, expBarHeight, expRatio, expColors);

        ctx.font = hudLabelFont;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText('熟練', x + 1, expY + expBarHeight / 2 + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText('熟練', x, expY + expBarHeight / 2);
        
        // --- Stage Info + マネー（右上） ---
        // ステージ名は右端アンカーのため uiScale ラップの外(後段)で描く。
        // 宣言のみここで行う(moneyText/coinSize はサブ武器行が使用)。
        const stageFloorKanji = toKanjiNumber(stage?.stageNumber || 1);
        const stageLabel = (stage && stage.name) ? stage.name : `第${stageFloorKanji}階層`;
        const stageFontPx = 16 * getFontScale();
        const moneyFontPx = 16 * fx;
        const moneyText = formatMoney(player.money);
        const coinSize = 9;

        // --- 装備中のサブ武器表示 (Icon Slot Style) ---
        if (player.currentSubWeapon) {
            const slotX = x;
            const slotY = expY + 32;
            const slotSize = 30;
            
            // 武器スロットの枠
            ctx.save();
            const slotGrad = ctx.createLinearGradient(slotX, slotY, slotX, slotY + slotSize);
            slotGrad.addColorStop(0, 'rgba(23, 30, 52, 0.88)');
            slotGrad.addColorStop(1, 'rgba(11, 16, 30, 0.9)');
            drawRoundedRectPath(slotX, slotY, slotSize, slotSize, 10);
            ctx.fillStyle = slotGrad;
            ctx.fill();
            drawRoundedRectPath(slotX + 1.2, slotY + 1.2, slotSize - 2.4, Math.max(1, slotSize * 0.32), 8);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.fill();
            // 武器アイコンは角丸内へクリップし、画像が枠線へ被らないようにする。
            ctx.save();
            drawRoundedRectPath(slotX + 0.8, slotY + 0.8, slotSize - 1.6, slotSize - 1.6, 9.2);
            ctx.clip();
            this.drawWeaponIcon(ctx, slotX + slotSize/2, slotY + slotSize/2, slotSize * 0.88, player.currentSubWeapon.name);
            ctx.restore();

            // 枠線は必ず画像の後に描き、前面の輪郭として見せる。
            drawRoundedRectPath(slotX, slotY, slotSize, slotSize, 10);
            ctx.strokeStyle = 'rgba(180, 204, 255, 0.38)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
            
            // 武器名 (大きく)
            ctx.fillStyle = '#fff';
            ctx.font = hudLabelFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(player.currentSubWeapon.name, slotX + slotSize + 15, slotY + slotSize / 2);

            // 小判＋所持金（サブ武器行の右端）
            const panelRightX = panelX + panelW;
            const moneyRightX = panelRightX - panelPadding;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${moneyFontPx}px "Helvetica Neue", Arial, sans-serif`;
            const moneyWidth = ctx.measureText(moneyText).width;
            const coinGap = 9;
            const coinHalfW = coinSize * 0.7;
            const coinX = moneyRightX - moneyWidth - coinGap - coinHalfW;

            // 影（軽量化）
            ctx.fillStyle = 'rgba(0,0,0,0.62)';
            drawNumMixedText(ctx, moneyText, moneyRightX + 1, slotY + slotSize / 2 + 1, 800, moneyFontPx, 'right');

            // 小判は影なしで描画
            this.drawKoban(ctx, coinX, slotY + slotSize / 2, coinSize);

            // テキスト本体
            ctx.fillStyle = COLORS.MONEY;
            drawNumMixedText(ctx, moneyText, moneyRightX, slotY + slotSize / 2, 800, moneyFontPx, 'right');
            
            // 武器切替ヒントの個別表示は廃止（下部マニュアルへ統一）
        }

        const getRemainSec = (key) => {
            if (!player.getTempNinjutsuRemainingMs) return 0;
            const ms = player.getTempNinjutsuRemainingMs(key);
            return ms > 0 ? Math.ceil(ms / 1000) : 0;
        };
        const activeNinjutsu = [
            { key: 'expMagnet', label: '引き寄せ', color: '#8fd6ff' },
            { key: 'xAttack', label: '大薙ぎ', color: '#9ec7ff' },
            { key: 'ghostVeil', label: '隠れ身', color: '#b7d5ff' }
        ]
            .map((row) => ({ ...row, sec: getRemainSec(row.key) }))
            .filter((row) => row.sec > 0);
        if (activeNinjutsu.length > 0) {
            const boxX = panelX;
            const boxY = panelY + panelH + 8;
            const rowH = 16;
            const insetX = 10;
            const boxW = 132;
            const boxH = 8 + activeNinjutsu.length * rowH + 4;
            ctx.save();
            drawRoundedRectPath(boxX, boxY, boxW, boxH, 10);
            ctx.fillStyle = 'rgba(14, 24, 48, 0.78)';
            ctx.fill();
            drawRoundedRectPath(boxX, boxY, boxW, boxH, 10);
            ctx.strokeStyle = 'rgba(170, 196, 238, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            activeNinjutsu.forEach((row, i) => {
                const yy = boxY + 6 + i * rowH + rowH * 0.5;
                ctx.font = `700 ${12 * fx}px "Zen Old Mincho", serif`;
                ctx.fillStyle = row.color;
                ctx.fillText(row.label, boxX + insetX, yy);
                ctx.font = `800 ${12 * fx}px "Helvetica Neue", Arial, sans-serif`;
                ctx.fillStyle = 'rgba(235, 245, 255, 0.95)';
                ctx.textAlign = 'right';
                ctx.fillText(`${row.sec}s`, boxX + boxW - insetX, yy);
                ctx.textAlign = 'left';
            });
            ctx.restore();
        }

        // 左上HUDの uiScale/セーフエリア ラップをここで閉じる（以降は等倍スクリーン座標）
        if (hudWrap) ctx.restore();

        // 右上ステージ名（右端アンカー・BGMボタン左）。BGMボタンと同じ getPadLayout を
        // 参照するため、uiScale 拡大時もボタンとの相対位置が保たれる。
        {
            const B = getPadLayout().bgm;
            const stageRightX = (B.x - B.r) - 12 * uiS;
            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'right';
            ctx.font = `900 ${Math.round(stageFontPx)}px "Zen Old Mincho", serif`;
            // ステージ名（BGMボタン左側）影を軽量化
            ctx.fillStyle = 'rgba(0,0,0,0.62)';
            ctx.fillText(stageLabel, stageRightX + 1, B.y + 1);
            ctx.fillStyle = '#fff';
            ctx.fillText(stageLabel, stageRightX, B.y);
            ctx.restore();
        }

        // 寄り道(小判蔵/道場)の刻限（画面上端中央・時間だけ）と、
        // 獲得のたびに画面中央へ出る合計数
        if (stage && typeof stage.getHudTimerSec === 'function') {
            this.renderSideStageTimer(ctx, stage);
            this.renderSideScoreBurst(ctx, stage);
        }

        // 仮想パッド（getPadLayout で自己スケールするためラップ外に置く）
        this.renderVirtualPad(ctx, player);
    }

    // 寄り道の刻限バナー（画面上端中央）。残り時間だけを置く。
    // スコアは同居させない ― 数字が2つ並ぶと的が絞れず、獲得の手応えも出ない
    // （実機フィードバック 2026-08-11）。合計は renderSideScoreBurst が中央に出す。
    renderSideStageTimer(ctx, stage) {
        const sec = Math.max(0, stage.getHudTimerSec());
        const limit = Math.max(1, stage.timeLimit || 60);
        const fs = getFontScale();
        const uiS = getUiScale();
        const cx = SCREEN_WIDTH / 2;
        // 円形プログレス。矩形カード+バーは残量が読み取りづらかった(実機フィードバック)。
        // 【上辺】は左上HUDパネル(safe.top + 24*uiS)に揃える。
        const R = 27 * uiS;
        const top = getScreenSafeArea().top + 24 * uiS;
        const cy = top + R;
        const ratio = Math.max(0, Math.min(1, sec / limit));
        const urgent = sec <= 10;
        const blink = urgent ? (0.72 + Math.sin(Date.now() * 0.012) * 0.28) : 1;

        ctx.save();
        // 背景の円盤(他の上端UIと同じ紺の半透明)
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 20, 38, 0.82)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(170, 196, 238, 0.35)';
        ctx.stroke();

        // 残量リング: 12時位置から時計回りに「残り」を描く(減っていくのが見える)
        const ringR = R - 4 * uiS;
        ctx.lineWidth = 4.5 * uiS;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(8, 14, 30, 0.8)';
        ctx.stroke();
        if (ratio > 0.002) {
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
            ctx.strokeStyle = urgent
                ? `rgba(255, 132, 104, ${(0.95 * blink).toFixed(3)})`
                : 'rgba(158, 200, 255, 0.95)';
            if (urgent) {
                ctx.shadowColor = 'rgba(255, 110, 80, 0.7)';
                ctx.shadowBlur = 12 * uiS;
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 中央に残り秒(整数)。小数は円形だと騒がしい
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.round(19 * fs)}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = urgent
            ? `rgba(255, 150, 124, ${blink.toFixed(3)})`
            : 'rgba(238, 246, 255, 0.96)';
        ctx.fillText(String(Math.ceil(sec)), cx, cy + 1 * uiS);
        ctx.restore();
    }

    // 獲得のたびに画面中央へ「今の合計」を大きく出す。
    // 数字は実値へ回りながら（カウントアップ）弾み、少し置いて静かに消える。
    // 連続で取り続けている間は出っぱなしになり、それが手応えになる。
    renderSideScoreBurst(ctx, stage) {
        const score = (typeof stage.getScore === 'function') ? Math.floor(stage.getScore()) : 0;
        // 表示値は実値へ追いつくカウントアップ（一気に飛ばず数字が回る）
        if (this._sideScoreShown === undefined || stage !== this._sideScoreStage) {
            this._sideScoreShown = score;
            this._sideScoreStage = stage;
        }
        const diff = score - this._sideScoreShown;
        if (diff !== 0) {
            const step = Math.max(1, Math.ceil(Math.abs(diff) * 0.3));
            this._sideScoreShown += Math.sign(diff) * Math.min(step, Math.abs(diff));
        }
        const shown = Math.round(this._sideScoreShown);

        const gain = stage.lastGain;
        if (!gain) return;
        const since = Math.max(0, (stage.time || 0) - gain.at);
        const HOLD = 0.75;    // はっきり出ている時間
        const FADE = 0.55;    // 消えるまで
        if (since > HOLD + FADE) return;

        const isBonus = stage.sideKind === 'bonus';
        const fs = getFontScale();
        const uiS = getUiScale();
        const cx = SCREEN_WIDTH / 2;
        const cy = CANVAS_HEIGHT * 0.42;   // 中央やや上（足元の攻防に被せない）
        const punch = Math.max(0, 1 - since / 0.32);
        const fade = since <= HOLD ? 1 : Math.max(0, 1 - (since - HOLD) / FADE);
        const pop = 1 + punch * punch * 0.35;

        ctx.save();
        ctx.globalAlpha = fade * 0.94;
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        ctx.textBaseline = 'alphabetic';

        const unit = isBonus ? '両' : '人';
        const numFont = `900 ${Math.round(76 * fs)}px "Helvetica Neue", Arial, sans-serif`;
        const unitFont = `700 ${Math.round(28 * fs)}px "Zen Old Mincho", serif`;
        // 【数字だけ】を画面中央に置き、単位はその右へ添える。
        // 数字＋単位をひとまとまりで中央寄せすると、主役の数字が左へ寄って見える。
        const shownText = formatCount(shown);
        ctx.font = numFont;
        const numW = ctx.measureText(shownText).width;

        // 数字（縁取り＋発光。背景がどんな明度でも読める）
        ctx.textAlign = 'left';
        ctx.lineWidth = 9 * uiS;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(6, 10, 22, 0.85)';
        ctx.strokeText(shownText, -numW / 2, 0);
        ctx.shadowColor = isBonus ? 'rgba(255, 206, 120, 0.9)' : 'rgba(150, 195, 255, 0.85)';
        ctx.shadowBlur = (18 + punch * 34) * uiS;
        ctx.fillStyle = punch > 0.55 ? '#ffffff' : (isBonus ? '#f4d484' : '#e6efff');
        ctx.fillText(shownText, -numW / 2, 0);
        ctx.shadowBlur = 0;

        // 単位
        const unitX = numW / 2 + 10 * uiS;
        ctx.font = unitFont;
        ctx.lineWidth = 6 * uiS;
        ctx.strokeStyle = 'rgba(6, 10, 22, 0.85)';
        ctx.strokeText(unit, unitX, 0);
        ctx.fillStyle = 'rgba(230, 240, 255, 0.95)';
        ctx.fillText(unit, unitX, 0);

        // 直近の加算（数字の下に小さく「+n」）
        if (since < 0.6) {
            ctx.globalAlpha = fade * Math.max(0, 1 - since / 0.6);
            ctx.textAlign = 'center';
            ctx.font = `900 ${Math.round(22 * fs)}px "Helvetica Neue", Arial, sans-serif`;
            ctx.lineWidth = 5 * uiS;
            ctx.strokeStyle = 'rgba(6, 10, 22, 0.8)';
            const gy = 50 * uiS + (1 - punch) * 6 * uiS;
            ctx.strokeText(`+${formatCount(gain.value)}`, 0, gy);
            ctx.fillStyle = isBonus ? '#ffd970' : '#cfe2ff';
            ctx.fillText(`+${formatCount(gain.value)}`, 0, gy);
        }
        ctx.restore();
    }
    
    // 小判アイコンの描画
    drawKoban(ctx, x, y, size) {
        // 生成画像があればそれを使う（HUDと蔵で同じ絵にする。共通入口は drawKobanImage）
        if (drawKobanImage(ctx, x, y, size * 1.35, size * 2.05)) return;
        ctx.save();
        ctx.beginPath();
        // 縦長の楕円（小判型）
        ctx.ellipse(x, y, size * 0.7, size, 0, 0, Math.PI * 2);
        
        // グラデーションで金色の質感
        const grad = ctx.createLinearGradient(x - size, y - size, x + size, y + size);
        grad.addColorStop(0, '#FFD700'); // Gold
        grad.addColorStop(0.5, '#FFCC00'); 
        grad.addColorStop(1, '#DBA100');
        ctx.fillStyle = grad;
        ctx.fill();
        
        // 縁取り
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // 小判特有の横溝（茣蓙目）
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(184, 134, 11, 0.5)';
        for (let i = -size + 4; i < size - 2; i += 4) {
            ctx.moveTo(x - size * 0.4, y + i);
            ctx.lineTo(x + size * 0.4, y + i);
        }
        ctx.stroke();
        
        ctx.restore();
    }
    
    // 操作説明（キーボード操作マニュアル）
    // タップボタンモード（仮想パッド表示中）はキーボード説明を隠す。
    // ただし物理キーボードの入力が検知されている場合（外部キーボード接続など）は表示する。
    renderControls(ctx) {
        // 非表示判定は drawControlManualLine 内（shouldHideKeyboardManual）に集約
        drawControlManualLine(ctx);
    }
    
    // ダメージ数値表示用
    renderDamageNumber(ctx, x, y, damage, isCritical = false, alpha = 1) {
        if (alpha <= 0) return;
        ctx.save();
        if (alpha < 1) ctx.globalAlpha *= alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const text = `${damage}`;
        // 数字はクリーンなサンセリフ（明朝＋縁取りは古く見えるため）。和文はMincho、数字はSans。
        ctx.font = isCritical
            ? '800 italic 36px "Helvetica Neue", Arial, sans-serif'
            : '800 27px "Helvetica Neue", Arial, sans-serif';

        // 安価なドロップシャドウ（太い黒縁取りをやめ奥行きで視認性を出す）
        ctx.fillStyle = 'rgba(6, 10, 22, 0.4)';
        ctx.fillText(text, x + 1.5, y + 2);

        // 細い暗色アウトライン（明るい背景でも沈まない・主張しすぎない）
        ctx.lineJoin = 'round';
        ctx.lineWidth = isCritical ? 2.6 : 2;
        ctx.strokeStyle = 'rgba(8, 12, 24, 0.55)';
        ctx.strokeText(text, x, y);

        // 本体（縦グラデ：通常=白→淡青／会心=黄金→橙）
        if (isCritical) {
            const grad = ctx.createLinearGradient(x, y - 26, x, y + 4);
            grad.addColorStop(0, '#fff1a6');
            grad.addColorStop(0.55, '#ffd24a');
            grad.addColorStop(1, '#ff6a2e');
            ctx.fillStyle = grad;
        } else {
            const grad = ctx.createLinearGradient(x, y - 18, x, y + 4);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(1, '#cfe0ff');
            ctx.fillStyle = grad;
        }
        ctx.fillText(text, x, y);
        ctx.restore();
    }
    
    // レベルアップ表示
    renderLevelUp(ctx, x, y) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 28px "Zen Old Mincho", serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText('LEVEL UP!', x, y);
        ctx.fillText('LEVEL UP!', x, y);
    }

    isTouchOverlayEnabled() {
        return isTouchOverlayMode();
    }

    renderGlobalTouchButtons(ctx) {
        // ヒット判定(input.getBgmButtonHitArea)と同一の幾何導出を共有
        const B = getPadLayout().bgm;
        this.drawBgmToggleButton(ctx, B.x, B.y, B.r, !!audio.isMuted);
    }
    
    // ポーズボタンだけを描く。仮想パッドを出さない画面(ステージセレクト)から
    // タイトルへ戻る導線として使う。判定は input.getTouchActions が
    // setVirtualPadVisible(true) を前提に同じ getPadLayout を読む。
    renderPauseButtonOnly(ctx) {
        if (!this.isTouchOverlayEnabled()) return;
        setVirtualPadVisible(true);
        const L = getPadLayout();
        ctx.save();
        ctx.setLineDash([]);
        this.drawActionCircleButton(ctx, L.pause.x, L.pause.y, L.pause.r, 'pause', input.isAction('PAUSE'));
        ctx.restore();
    }

    renderVirtualPad(ctx, player) {
        // PC（タッチ非対応かつ幅広）は非表示
        if (!this.isTouchOverlayEnabled()) return;

        // 「今このフレームでパッドを描いた」＝当たり判定を有効にしてよい、を入力側へ申告
        setVirtualPadVisible(true);

        ctx.save();
        ctx.setLineDash([]);

        // ヒット判定(input.getTouchActions)と同一の幾何導出を共有(constants.getPadLayout)
        const L = getPadLayout();

        // --- 左側：アナログスティック ---
        const stickState = input.getVirtualStickState();
        this.drawAnalogStick(
            ctx,
            L.stick.x,
            L.stick.y,
            L.stick.baseRadius,
            L.stick.knobRadius,
            stickState.knobX,
            stickState.knobY,
            stickState.active
        );

        // 左スティック左下：一時停止ボタン（小）
        this.drawActionCircleButton(
            ctx, L.pause.x, L.pause.y, L.pause.r, 'pause', input.isAction('PAUSE')
        );

        // --- 右側：アクションキー（ダイヤ配置・円ボタン） ---
        const isSpecialReady = !!player && Number.isFinite(player.specialGauge) && Number.isFinite(player.maxSpecialGauge)
            ? player.specialGauge >= player.maxSpecialGauge
            : true;

        this.drawActionCircleButton(
            ctx, L.attack.x, L.attack.y, L.attack.r, 'attack', input.isAction('ATTACK')
        );
        this.drawActionCircleButton(
            ctx, L.sub.x, L.sub.y, L.sub.r, 'sub', input.isAction('SUB_WEAPON')
        );

        if (isSpecialReady) {
            const t = Date.now() * 0.005;
            const pulse = (Math.sin(t) + 1) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(L.special.x, L.special.y, L.special.r + (4 + pulse * 6) * L.s, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 210, 80, ${0.15 + pulse * 0.25})`;
            ctx.fill();
            ctx.restore();
        }

        this.drawActionCircleButton(
            ctx, L.special.x, L.special.y, L.special.r, 'special', input.isAction('SPECIAL'), !isSpecialReady
        );
        this.drawActionCircleButton(
            ctx, L.switch.x, L.switch.y, L.switch.r, 'switch', input.isAction('SWITCH_WEAPON')
        );

        ctx.restore();
    }

    drawBgmToggleButton(ctx, x, y, radius, isMuted) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const buttonFillAlpha = isMuted ? 0.24 : 0.34;
        ctx.fillStyle = `rgba(0, 0, 0, ${buttonFillAlpha})`;
        ctx.fill();
        const buttonStrokeAlpha = isMuted ? 0.5 : 0.65;
        ctx.strokeStyle = `rgba(255, 255, 255, ${buttonStrokeAlpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        this.drawBgmToggleIcon(ctx, x, y, radius, isMuted);

        ctx.restore();
    }

    drawBgmToggleIcon(ctx, x, y, radius, isMuted) {
        const icon = isMuted ? this.bgmToggleIcons.muted : this.bgmToggleIcons.unmuted;
        const iconSize = radius * 1.05;
        const iconX = x - iconSize / 2;
        const iconY = y - iconSize / 2;

        if (icon && icon.complete && icon.naturalWidth > 0) {
            this.drawTintedIcon(ctx, icon, iconX, iconY, iconSize, isMuted ? 0.58 : 0.84);
            return;
        }

        // 画像未読込時のフォールバック
        const fallbackAlpha = isMuted ? 0.72 : 0.88;
        ctx.fillStyle = `rgba(255, 255, 255, ${fallbackAlpha})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(radius * 0.9)}px "Zen Old Mincho", serif`;
        ctx.fillText(isMuted ? '×' : '♪', x, y + 1);
    }

    drawActionCircleButton(ctx, x, y, radius, iconType, isPressed, isDisabled = false) {
        const isPauseMuted = iconType === 'pause' && typeof window !== 'undefined' && window.game && window.game.state === 'paused';
        const activePressed = isPressed && !isDisabled;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const fillAlpha = isDisabled ? 0.16 : (activePressed ? 0.24 : (isPauseMuted ? 0.24 : 0.34));
        ctx.fillStyle = activePressed
            ? `rgba(255, 255, 255, ${fillAlpha})`
            : `rgba(0, 0, 0, ${fillAlpha})`;
        ctx.fill();
        const strokeAlpha = isDisabled ? 0.32 : (activePressed ? 0.96 : (isPauseMuted ? 0.5 : 0.65));
        ctx.strokeStyle = `rgba(255,255,255,${strokeAlpha})`;
        ctx.lineWidth = activePressed ? 3 : 2;
        ctx.stroke();

        this.drawPadActionIcon(ctx, x, y, radius, iconType, activePressed, isDisabled);
        ctx.restore();
    }

    drawPadActionIcon(ctx, x, y, radius, iconType, isPressed, isDisabled = false) {
        const isPauseMuted = iconType === 'pause' && typeof window !== 'undefined' && window.game && window.game.state === 'paused';
        const alpha = isDisabled ? 0.34 : (isPauseMuted ? 0.58 : (isPressed ? 0.96 : 0.86));
        const icon = this.padActionIcons[iconType];
        const iconSize = Math.round(radius * 1.16);
        const iconX = x - iconSize / 2;
        const iconY = y - iconSize / 2;

        if (icon && icon.complete && icon.naturalWidth > 0) {
            this.drawTintedIcon(ctx, icon, iconX, iconY, iconSize, alpha);
            return;
        }

        const glyph = PAD_ICON_FALLBACK[iconType] || '?';
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(radius * 0.8)}px "Zen Old Mincho", serif`;
        ctx.fillText(glyph, x, y + 1);
        ctx.restore();
    }

    drawTintedIcon(ctx, image, x, y, size, alpha = 0.88) {
        ctx.save();
        const previousAlpha = ctx.globalAlpha;
        ctx.globalAlpha = alpha;
        ctx.drawImage(image, x, y, size, size);
        ctx.globalAlpha = previousAlpha;
        ctx.restore();
    }

    drawAnalogStick(ctx, baseX, baseY, baseRadius, knobRadius, knobX, knobY, isActive) {
        // ベース（フラット）
        ctx.beginPath();
        ctx.arc(baseX, baseY, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.12)';
        ctx.fill();
        ctx.strokeStyle = isActive ? 'rgba(255, 255, 255, 0.86)' : 'rgba(255, 255, 255, 0.62)';
        ctx.lineWidth = isActive ? 3 : 2;
        ctx.stroke();

        // ノブ（フラット）
        ctx.beginPath();
        ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.64)' : 'rgba(255, 255, 255, 0.46)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.82)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // 四角いボタン描画 (丸みを持たせる)
    drawSquareButton(ctx, x, y, size, label, isPressed) {
        ctx.save();
        
        // sizeは「中心から端までの距離」として扱う(Roundと同じサイズ感にするため)
        // w = size*2, h = size*2.
        
        const w = size * 2;
        const h = size * 2;
        const left = x - size;
        const top = y - size;
        const r = 10; // 角丸半径

        // --- 塗り設定 ---
        if (isPressed) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        }
        
        // 正方形(角丸)を描画
        ctx.beginPath();
        ctx.moveTo(left + r, top);
        ctx.lineTo(left + w - r, top);
        ctx.quadraticCurveTo(left + w, top, left + w, top + r);
        ctx.lineTo(left + w, top + h - r);
        ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
        ctx.lineTo(left + r, top + h);
        ctx.quadraticCurveTo(left, top + h, left, top + h - r);
        ctx.lineTo(left, top + r);
        ctx.quadraticCurveTo(left, top, left + r, top);
        ctx.closePath();
        
        ctx.fill();
        
        // --- 枠線設定 ---
        ctx.strokeStyle = isPressed ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = isPressed ? 3 : 2;
        ctx.stroke();
        
        // ラベル描画
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 改行対応
        const lines = label.split('\n');
        if (lines.length > 1) {
            ctx.font = 'bold 14px "Zen Old Mincho", serif';
            ctx.fillText(lines[0], x, y - 8);
            ctx.font = '12px "Zen Old Mincho", serif';
            ctx.fillText(lines[1], x, y + 8);
        } else {
            ctx.font = 'bold 20px "Zen Old Mincho", serif';
            ctx.fillText(label, x, y);
        }
        
        ctx.restore();
    }

    // 武器アイコン画像を優先し、読込前・読込失敗時だけ旧Canvas描画へフォールバックする。
    drawWeaponIcon(ctx, x, y, size, name) {
        ctx.save();
        ctx.translate(x, y);

        const icon = this.weaponIcons?.[name];
        if (icon && icon.complete && icon.naturalWidth > 0) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.48)';
            ctx.shadowBlur = Math.max(1, size * 0.12);
            ctx.shadowOffsetY = Math.max(0.5, size * 0.025);
            ctx.drawImage(icon, -size / 2, -size / 2, size, size);
            ctx.restore();
            return;
        }

        const half = size / 2;
        const bladeGrad = ctx.createLinearGradient(-half, -half, half, half);
        bladeGrad.addColorStop(0, '#eef6ff');
        bladeGrad.addColorStop(0.45, '#aebccf');
        bladeGrad.addColorStop(1, '#465466');
        const ironGrad = ctx.createLinearGradient(-half, -half, half, half);
        ironGrad.addColorStop(0, '#dce5ef');
        ironGrad.addColorStop(0.5, '#7e8c9e');
        ironGrad.addColorStop(1, '#364354');
        const woodGrad = ctx.createLinearGradient(-half, half, half, -half);
        woodGrad.addColorStop(0, '#3f2617');
        woodGrad.addColorStop(0.45, '#7a4d2e');
        woodGrad.addColorStop(1, '#b07a4f');
        const wrapGrad = ctx.createLinearGradient(-half, -half, half, half);
        wrapGrad.addColorStop(0, '#151922');
        wrapGrad.addColorStop(0.5, '#3d4657');
        wrapGrad.addColorStop(1, '#161b24');

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.42)';
        ctx.shadowBlur = 4;

        switch (name) {
            case '手裏剣':
                ctx.fillStyle = ironGrad;
                ctx.strokeStyle = '#2d3948';
                ctx.lineWidth = 1.1;
                ctx.beginPath();
                for (let i = 0; i < 4; i++) {
                    const angle = (Math.PI / 2) * i;
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    const cos45 = Math.cos(angle + Math.PI / 4);
                    const sin45 = Math.sin(angle + Math.PI / 4);
                    if (i === 0) {
                        ctx.moveTo(cos * half * 0.85, sin * half * 0.85);
                    } else {
                        ctx.lineTo(cos * half * 0.85, sin * half * 0.85);
                    }
                    ctx.lineTo(cos45 * half * 0.3, sin45 * half * 0.3);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                ctx.lineWidth = 0.7;
                for (let i = 0; i < 4; i++) {
                    const angle = (Math.PI / 2) * i;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(angle) * half * 0.22, Math.sin(angle) * half * 0.22);
                    ctx.lineTo(Math.cos(angle) * half * 0.68, Math.sin(angle) * half * 0.68);
                    ctx.stroke();
                }
                ctx.fillStyle = '#20242d';
                ctx.beginPath();
                ctx.arc(0, 0, half * 0.15, 0, Math.PI * 2);
                ctx.fill();
                break;
            case '火薬玉':
                ctx.fillStyle = '#14171d';
                ctx.beginPath();
                ctx.arc(0, 0, half * 0.62, 0, Math.PI * 2);
                ctx.fill();
                const bombGlow = ctx.createRadialGradient(-half * 0.12, -half * 0.18, 0, -half * 0.12, -half * 0.18, half * 0.75);
                bombGlow.addColorStop(0, 'rgba(255,255,255,0.26)');
                bombGlow.addColorStop(0.35, 'rgba(255,255,255,0.08)');
                bombGlow.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = bombGlow;
                ctx.beginPath();
                ctx.arc(0, 0, half * 0.62, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#6d7685';
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.strokeStyle = '#b6854e';
                ctx.lineWidth = 1.7;
                ctx.beginPath();
                ctx.moveTo(half * 0.02, -half * 0.54);
                ctx.quadraticCurveTo(half * 0.16, -half * 0.84, half * 0.34, -half * 0.9);
                ctx.stroke();
                ctx.fillStyle = '#ffcf6b';
                ctx.beginPath();
                ctx.arc(half * 0.38, -half * 0.96, 2.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,160,70,0.65)';
                ctx.beginPath();
                ctx.arc(half * 0.48, -half * 1.06, 1.3, 0, Math.PI * 2);
                ctx.fill();
                break;
            case '大槍':
                ctx.strokeStyle = woodGrad;
                ctx.lineWidth = 3.4;
                ctx.beginPath();
                ctx.moveTo(-half * 0.82, half * 0.8);
                ctx.lineTo(half * 0.34, -half * 0.28);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,236,210,0.2)';
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                ctx.moveTo(-half * 0.72, half * 0.68);
                ctx.lineTo(half * 0.22, -half * 0.2);
                ctx.stroke();
                ctx.fillStyle = '#b8262b';
                ctx.beginPath();
                ctx.moveTo(half * 0.08, -half * 0.16);
                ctx.lineTo(half * 0.26, -half * 0.03);
                ctx.lineTo(half * 0.14, half * 0.11);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = bladeGrad;
                ctx.beginPath();
                ctx.moveTo(half * 0.82, -half * 0.74);
                ctx.lineTo(half * 0.16, -half * 0.44);
                ctx.lineTo(half * 0.42, -half * 0.02);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#435062';
                ctx.lineWidth = 0.9;
                ctx.stroke();
                break;
            case '二刀流':
                for (const dir of [-1, 1]) {
                    ctx.save();
                    ctx.rotate(dir * 0.72);
                    ctx.strokeStyle = bladeGrad;
                    ctx.lineWidth = 2.2;
                    ctx.beginPath();
                    ctx.moveTo(0, half * 0.8);
                    ctx.quadraticCurveTo(half * 0.08, half * 0.1, 0, -half * 0.78);
                    ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
                    ctx.lineWidth = 0.7;
                    ctx.beginPath();
                    ctx.moveTo(half * 0.02, half * 0.5);
                    ctx.quadraticCurveTo(half * 0.1, 0, half * 0.02, -half * 0.55);
                    ctx.stroke();
                    ctx.strokeStyle = wrapGrad;
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.moveTo(0, half * 0.84);
                    ctx.lineTo(0, half * 0.46);
                    ctx.stroke();
                    ctx.restore();
                }
                break;
            case '鎖鎌':
                ctx.strokeStyle = 'rgba(176,188,204,0.98)';
                ctx.lineWidth = 1.15;
                ctx.beginPath();
                ctx.moveTo(-half * 0.62, half * 0.44);
                ctx.quadraticCurveTo(-half * 0.08, -half * 0.54, half * 0.48, -half * 0.06);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(232,242,255,0.35)';
                ctx.lineWidth = 0.55;
                ctx.beginPath();
                ctx.moveTo(-half * 0.56, half * 0.36);
                ctx.quadraticCurveTo(-half * 0.02, -half * 0.58, half * 0.5, -half * 0.1);
                ctx.stroke();
                ctx.fillStyle = '#7a8596';
                ctx.beginPath();
                ctx.arc(-half * 0.68, half * 0.52, half * 0.17, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = bladeGrad;
                ctx.beginPath();
                ctx.moveTo(half * 0.08, -half * 0.06);
                ctx.quadraticCurveTo(half * 0.46, -half * 0.52, half * 0.78, -half * 0.2);
                ctx.quadraticCurveTo(half * 0.5, -half * 0.06, half * 0.2, half * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#3f4d5f';
                ctx.lineWidth = 0.9;
                ctx.stroke();
                ctx.strokeStyle = woodGrad;
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(half * 0.04, half * 0.28);
                ctx.lineTo(-half * 0.18, half * 0.62);
                ctx.stroke();
                break;
            case '大太刀':
                ctx.strokeStyle = bladeGrad;
                ctx.lineWidth = 3.3;
                ctx.beginPath();
                ctx.moveTo(-half * 0.56, half * 0.78);
                ctx.quadraticCurveTo(-half * 0.16, 0, half * 0.52, -half * 0.8);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                ctx.lineWidth = 0.75;
                ctx.beginPath();
                ctx.moveTo(-half * 0.3, half * 0.52);
                ctx.quadraticCurveTo(0, 0, half * 0.38, -half * 0.56);
                ctx.stroke();
                ctx.strokeStyle = woodGrad;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(-half * 0.74, half * 0.88);
                ctx.lineTo(-half * 0.44, half * 0.42);
                ctx.stroke();
                ctx.strokeStyle = '#b59656';
                ctx.lineWidth = 1.1;
                ctx.beginPath();
                ctx.moveTo(-half * 0.36, half * 0.54);
                ctx.lineTo(-half * 0.22, half * 0.32);
                ctx.stroke();
                break;
            default:
                ctx.fillStyle = '#666';
                ctx.font = 'bold 20px "Zen Old Mincho", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', 0, 0);
        }
        
        ctx.restore();
    }
}

// タイトル背景のフィルムグレイン（空のバンディング低減＋質感）。一度だけ生成しキャッシュ。
let _titleGrainCanvas = null;
function getTitleGrainCanvas() {
    if (_titleGrainCanvas) return _titleGrainCanvas;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const gctx = c.getContext('2d');
    const img = gctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const v = 110 + Math.floor(Math.random() * 70);
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    _titleGrainCanvas = c;
    return c;
}

// タイトルロゴ文字面の「墨かすれ／金箔の斑」テクスチャ。一度だけ生成しキャッシュ。
let _titleInkTex = null;
function getTitleInkTexture() {
    if (_titleInkTex) return _titleInkTex;
    const w = 480, h = 140;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    // 墨/かすれ：暗い横ストリーク
    for (let i = 0; i < 120; i++) {
        const yy = Math.random() * h;
        const x0 = Math.random() * w;
        const len = 16 + Math.random() * 110;
        x.strokeStyle = `rgba(20, 13, 6, ${0.05 + Math.random() * 0.22})`;
        x.lineWidth = 0.5 + Math.random() * 1.5;
        x.beginPath();
        x.moveTo(x0, yy);
        x.lineTo(x0 + len, yy + (Math.random() - 0.5) * 2.5);
        x.stroke();
    }
    // 乾いた粒（かすれ）
    for (let i = 0; i < 900; i++) {
        x.fillStyle = `rgba(16, 10, 4, ${0.05 + Math.random() * 0.22})`;
        const s = 0.5 + Math.random() * 1.4;
        x.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    // 箔の輝き（明るい微粒）
    for (let i = 0; i < 240; i++) {
        x.fillStyle = `rgba(255, 246, 222, ${0.06 + Math.random() * 0.18})`;
        const s = 0.5 + Math.random() * 1.2;
        x.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    _titleInkTex = c;
    return c;
}

// タイトル画面描画
export function renderTitleScreen(ctx, currentDifficulty, titleMenuIndex = 0, hasSave = false) {
    const time = Date.now();
    const t = time * 0.001;

    // 背景画像（夜空＋月を内包。読込前は紺下地でフォールバック）
    if (!_titleBgImage) { _titleBgImage = new Image(); _titleBgImage.src = 'images/title_bg.png'; }
    ctx.fillStyle = '#0b1626';
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
    if (_titleBgImage.complete && _titleBgImage.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        drawBgCover(ctx, _titleBgImage, 0, 0, SCREEN_WIDTH, CANVAS_HEIGHT, TITLE_BG_MOON_FOCUS_Y);
    }

    // フィルムグレイン（空のバンディングを抑え質感を出す・軽量）
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.globalCompositeOperation = 'overlay';
    const grain = getTitleGrainCanvas();
    const gs = grain.width * 3;
    for (let gx = 0; gx < SCREEN_WIDTH; gx += gs) {
        for (let gy = 0; gy < CANVAS_HEIGHT; gy += gs) ctx.drawImage(grain, gx, gy, gs, gs);
    }
    ctx.restore();

    // 天頂の薄い光帯
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const skyBandCount = 3;
    for (let i = 0; i < skyBandCount; i++) {
        const bandY = CANVAS_HEIGHT * (0.16 + i * 0.1);
        const bandW = SCREEN_WIDTH * (1.25 - i * 0.1);
        const drift = Math.sin(t * (0.22 + i * 0.08) + i * 1.4) * 90;
        const bandGrad = ctx.createLinearGradient(0, bandY - 36, 0, bandY + 36);
        bandGrad.addColorStop(0, 'rgba(130, 181, 255, 0)');
        bandGrad.addColorStop(0.5, `rgba(130, 181, 255, ${0.1 - i * 0.02})`);
        bandGrad.addColorStop(1, 'rgba(130, 181, 255, 0)');
        ctx.fillStyle = bandGrad;
        ctx.beginPath();
        ctx.moveTo(-120 + drift, bandY);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.34, bandY - 34, SCREEN_WIDTH * 0.64, bandY - 8);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.88, bandY + 26, bandW + drift, bandY - 8);
        ctx.lineTo(bandW + drift, bandY + 44);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.88, bandY + 56, SCREEN_WIDTH * 0.6, bandY + 20);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.3, bandY - 8, -120 + drift, bandY + 28);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // 星空（旧挙動: 右上→左下）
    for (let i = 0; i < TITLE_STAR_COUNT; i++) {
        const x = (i * 137.5 - time * 0.02) % SCREEN_WIDTH;
        const y = (i * 219.7 + time * 0.01) % CANVAS_HEIGHT;
        const finalX = x < 0 ? x + SCREEN_WIDTH : x;
        const finalY = y % CANVAS_HEIGHT;
        const size = (Math.sin(i * 0.5) + 1) * 0.5 + 0.5;
        const alpha = (Math.sin(time * 0.001 + i) + 1) * 0.5;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
        ctx.fillRect(finalX, finalY, size, size);
    }

    // 流れ星（旧挙動）
    const shootingStarSpeed = 0.5;
    const shootingStarInterval = 4000;
    const starCycle = time % shootingStarInterval;
    const starSeed = Math.floor(time / shootingStarInterval);
    const starStartX = (starSeed * 543) % (SCREEN_WIDTH + 400);
    const starStartY = -100;

    if (starCycle < 1500) {
        const progress = starCycle * shootingStarSpeed;
        const sx = starStartX - progress;
        const sy = starStartY + progress;
        const shootingStarGrad1 = ctx.createLinearGradient(sx, sy, sx + 60, sy - 60);
        shootingStarGrad1.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        shootingStarGrad1.addColorStop(1, 'rgba(100, 150, 255, 0)');
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = shootingStarGrad1;
        ctx.lineWidth = 2;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 80, sy - 80);
        ctx.stroke();
        ctx.restore();
    }

    // 月は背景画像に内包（drawTitleMoon は廃止）

    // 靄・前景
    drawTitleMistLayers(ctx, time);

    // ビネット（周辺減光で中央へ視線誘導・映画的な没入感）
    {
        const vig = ctx.createRadialGradient(SCREEN_WIDTH / 2, CANVAS_HEIGHT * 0.44, CANVAS_HEIGHT * 0.46, SCREEN_WIDTH / 2, CANVAS_HEIGHT * 0.5, SCREEN_WIDTH * 0.82);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(0.82, 'rgba(0, 0, 0, 0.05)');
        vig.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
    }

    // タイトルロゴ
    drawRichTitleLogo(ctx, time);

    // 難易度選択
    const layout = getTitleScreenLayout(hasSave);
    const diffY = layout.diffY;
    
    // 左右の矢印 (削除済み)

    
    // 現在の難易度ボタン（紺カード＋難易度色のアクセント／文字色）
    const pulse = (Math.sin(time * 0.0026) + 1) * 0.5;
    const diffColor = getDifficultyColor(currentDifficulty && currentDifficulty.id);
    const globalData = saveManager.loadGlobal();
    drawRoundedFlatTitleButton(
        ctx,
        layout.centerX,
        diffY,
        layout.diffButton.width,
        layout.diffButton.height,
        currentDifficulty ? currentDifficulty.name : '普 (NORMAL)',
        { accentColor: diffColor, textColor: diffColor, font: `700 ${Math.round(layout.diffFontPx)}px "Zen Old Mincho", serif`, pulse, radius: 12 * getUiScale() }
    );

    // 開始ボタン
    const startY = layout.startY;
    const actionW = layout.actionButton.width;
    const actionH = layout.actionButton.height;
    const isCleared = globalData.isGameCleared;
    const actionOpts = {
        font: `700 ${Math.round(layout.actionFontPx)}px "Zen Old Mincho", serif`,
        radius: 12 * getUiScale()
    };

    if (hasSave) {
        drawRoundedFlatTitleButton(ctx, layout.centerX, startY,          actionW, actionH, '続きから', { ...actionOpts, focused: titleMenuIndex === 0, pulse });
        drawRoundedFlatTitleButton(ctx, layout.centerX, layout.newGameY, actionW, actionH, '最初から', { ...actionOpts, focused: titleMenuIndex === 1, pulse });
    } else if (isCleared) {
        drawRoundedFlatTitleButton(ctx, layout.centerX, startY,          actionW, actionH, '出陣', { ...actionOpts, focused: titleMenuIndex === 0, pulse, royal: true });
        drawRoundedFlatTitleButton(ctx, layout.centerX, layout.newGameY, actionW, actionH, '出陣', { ...actionOpts, focused: titleMenuIndex === 1, pulse });
    } else {
        drawRoundedFlatTitleButton(ctx, layout.centerX, layout.singleStartY, actionW, actionH, '出陣', { ...actionOpts, focused: true, pulse });
    }
    
    // 不要な描画コード削除
    

    
    // 右下デバッグモードヒント（⚙アイコン）。画面の角は端末の角丸に食われるため退避する。
    // 位置・タップ判定は getTitleScreenLayout().gear が単一導出。
    {
        const gear = layout.gear;
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(time * 0.002) * 0.08;
        ctx.font = `${gear.font}px "Zen Old Mincho", serif`;
        ctx.fillStyle = '#aabbcc';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('⚙', gear.anchorX, gear.anchorY);
        ctx.restore();
    }

    // タイトル画面用の操作説明
    drawScreenManualLine(ctx, TITLE_MANUAL_TEXT);

    // 新しいバージョンが配信されていれば中央モーダルで更新を促す（最後に描いて最前面）。
    // PWA はリロード手段が無く、PCでも古いまま遊ばれるのを避けたいので全デバイスで出す。
    if (isUpdateAvailable()) renderUpdateModal(ctx, time);
}

// デバッグウィンドウの幾何の単一導出。描画(renderTitleDebugWindow)と
// タップ判定(game.handleTitleDebugTouch)は必ずこれを読むこと（panelYは項目数依存の縦センタリング）。
// 見やすさの上限は「実寸css-px」で決める（論理pxで決めると端末ごとに見え方が変わる）。
const DEBUG_ROW_MAX_CSS = 30;    // 行を無駄に間延びさせない上限
const DEBUG_FONT_MAX_CSS = 15;   // 文字の上限（PC 1列時の従来値 13 を少し上回る程度）
const DEBUG_COL_MAX = 3;
const DEBUG_FONT_PER_ROW = 0.6;  // 行高に対する文字サイズ比
// 列幅の必要量を見積もるための最長行（全角1文字=1em換算）。
// ラベル「アイテム:韋駄天の秘術」＋値「デフォルト」＋間隔。
const DEBUG_ROW_EM = 11 + 5 + 1.5;

export function getTitleDebugLayout(entriesCount) {
    const count = Math.max(1, entriesCount || 1);
    const safe = getScreenSafeArea();
    const fit = getFitScale() || 1;
    const px = (css) => css / fit;   // 実寸css → スクリーン論理px

    // 使ってよい矩形。縦いっぱいのパネルなので左右はノッチ帯も避ける
    // （横持ちの向きで帯が左右どちらにも来るため両側）。
    const side = getFullHeightSideInset();
    const availX = side + px(10);
    const availW = SCREEN_WIDTH - side * 2 - px(20);
    const availY = safe.top + px(8);
    const availH = CANVAS_HEIGHT - safe.top - safe.bottom - px(16);

    const padTop = px(10);
    // 操作説明はパネル最下部に中央揃えで置く（タイトルの操作説明と同じサイズ感
    // = 12*fontScale。ヘッダに大きめ・左寄せで出していたのを実機で差し戻された）。
    const manualFont = 12 * getFontScale();
    const footerH = manualFont * 2.0;
    const listH = Math.max(px(40), availH - padTop - footerH);
    const colGap = px(10);
    const fontMax = px(DEBUG_FONT_MAX_CSS);

    // 列数は「文字が一番大きくなる数」を選ぶ。列を増やすと行が背高くなって縦は
    // 得をするが、1列が細くなって横で損をする。両方の制約から出た小さい方が
    // その列数での文字サイズなので、それが最大になる列数が最良。
    // （スマホは縦が足りず2列、PCは1列に落ち着く）
    let best = null;
    for (let cols = 1; cols <= DEBUG_COL_MAX; cols++) {
        const rowsPerCol = Math.ceil(count / cols);
        const rowH = Math.min(px(DEBUG_ROW_MAX_CSS), listH / rowsPerCol);
        const singleColW = Math.min(540, availW);
        const panelW = cols === 1 ? singleColW : availW;
        const colW = (panelW - colGap * (cols - 1)) / cols;
        const fontByHeight = rowH * DEBUG_FONT_PER_ROW;
        const fontByWidth = Math.max(1, (colW - rowH * 1.2) / DEBUG_ROW_EM); // 左右インセット分を引く
        const fontPx = Math.min(fontMax, fontByHeight, fontByWidth);
        if (!best || fontPx > best.fontPx + 1e-6) best = { cols, rowsPerCol, rowH, panelW, colW, fontPx };
    }
    const { cols, rowsPerCol, rowH, panelW, colW, fontPx } = best;

    // 1列のときは従来どおり右寄せパネル（PCの見た目を変えない）。
    const panelX = cols === 1
        ? SCREEN_WIDTH - side - panelW - 40
        : availX;

    const panelH = Math.min(availH, padTop + rowsPerCol * rowH + footerH);
    const panelY = Math.max(availY, Math.round((CANVAS_HEIGHT - panelH) / 2));

    return {
        panelX, panelY, panelW, panelH,
        rowH, fontPx, cols, rowsPerCol, colW, colGap,
        listStartY: panelY + padTop + rowH * 0.5,
        manualFont,
        footerTopY: panelY + panelH - footerH,           // 区切り線
        manualCenterY: panelY + panelH - footerH * 0.5,  // 説明文の中心
        // 行インデックス ⇄ 座標の相互変換（描画とタップ判定で必ず共有する）
        cellOf(index) {
            const col = Math.floor(index / rowsPerCol);
            const row = index - col * rowsPerCol;
            return {
                x: panelX + col * (colW + colGap),
                y: panelY + padTop + rowH * 0.5 + row * rowH,
                w: colW
            };
        },
        indexAt(tx, ty) {
            const col = Math.floor((tx - panelX) / (colW + colGap));
            if (col < 0 || col >= cols) return -1;
            const row = Math.round((ty - (panelY + padTop + rowH * 0.5)) / rowH);
            if (row < 0 || row >= rowsPerCol) return -1;
            const index = col * rowsPerCol + row;
            return index < count ? index : -1;
        }
    };
}

export function renderTitleDebugWindow(ctx, entries = [], cursor = 0) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const L = getTitleDebugLayout(entries.length);
    const { panelX, panelY, panelW, panelH, rowH, fontPx } = L;
    const clampedCursor = Math.max(0, Math.min(entries.length - 1, cursor));

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 18, 0.88)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    const bg = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    bg.addColorStop(0, 'rgba(24, 38, 84, 0.96)');
    bg.addColorStop(1, 'rgba(10, 18, 42, 0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(178, 205, 255, 0.6)';
    ctx.lineWidth = 1.8;

    const boxH = rowH - Math.max(2, rowH * 0.14);
    const inset = rowH * 0.6;
    const labelFont = (sel) => `${sel ? 700 : 500} ${Math.round(fontPx)}px "Zen Old Mincho", serif`;

    ctx.textBaseline = 'middle';
    for (let i = 0; i < entries.length; i++) {
        const cell = L.cellOf(i);
        const y = cell.y;
        const selected = i === clampedCursor;
        if (selected) {
            ctx.fillStyle = 'rgba(98, 142, 235, 0.42)';
            ctx.fillRect(cell.x + inset * 0.5, y - boxH / 2, cell.w - inset, boxH);
            ctx.strokeStyle = 'rgba(211, 228, 255, 0.92)';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(cell.x + inset * 0.5, y - boxH / 2, cell.w - inset, boxH);
        }
        const entry = entries[i];

        ctx.textAlign = 'left';
        ctx.fillStyle = selected ? '#ffffff' : 'rgba(225, 236, 255, 0.92)';
        ctx.font = labelFont(selected);
        ctx.fillText(entry.label || '', cell.x + inset, y);

        ctx.textAlign = 'right';
        const valText = (typeof entry.getValue === 'function') ? entry.getValue() : (entry.value || '');
        const isActionRow = entry.action || entry.isAction || valText === '実行';
        ctx.fillStyle = isActionRow ? '#ffe08d' : (selected ? '#dff0ff' : 'rgba(198, 216, 246, 0.92)');
        ctx.font = labelFont(selected);
        ctx.fillText(valText, cell.x + cell.w - inset, y);
    }

    // 操作説明（パネル最下部・中央揃え）。タイトルの操作説明と同じサイズ感(12*fontScale)。
    // タップ端末はキー表記が意味を持たないので出し分ける。
    const manualText = isTouchOverlayMode()
        ? 'タップ：左半分で戻す／右半分で進める | 枠外タップ：閉じる'
        : '↑↓：項目 | ←→：変更 | SPACE：決定 | ESC：閉じる';
    ctx.strokeStyle = 'rgba(212, 228, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + rowH * 0.75, L.footerTopY);
    ctx.lineTo(panelX + panelW - rowH * 0.75, L.footerTopY);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `${Math.round(L.manualFont)}px "Zen Old Mincho", serif`;
    fillTextInkCentered(ctx, manualText, panelX + panelW / 2, L.manualCenterY);

    ctx.restore();
}

// 戦闘結果画面の共通骨格。
// 階層突破・GAME CLEAR・GAME OVERで「中央の印章枠＋下端の英語操作ガイド」を共有し、
// 色と輪の状態だけで勝利／敗北を描き分ける。
const OUTCOME_MAIN_FONT_PX = 78;
const OUTCOME_MAIN_FONT = `900 ${OUTCOME_MAIN_FONT_PX}px "Zen Old Mincho", serif`;
const OUTCOME_GAME_CLEAR_FONT = '900 64px "Zen Old Mincho", serif';

function drawOutcomeSealFrame(ctx, cx, cy, reveal, accentRgb, options = {}) {
    const broken = !!options.broken;
    const time = Number.isFinite(options.time) ? options.time : 0;
    const rOuter = options.radius || 154;
    const rInner = rOuter - 14;
    const eased = 1 - Math.pow(1 - Math.max(0, Math.min(1, reveal)), 3);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((broken ? -0.055 : 0.025) + Math.sin(time * 0.0007) * 0.004);
    ctx.scale(0.88 + eased * 0.12, 0.88 + eased * 0.12);
    ctx.globalAlpha *= eased;

    const strokeRing = (radius, width, alpha, offset = 0) => {
        ctx.strokeStyle = `rgba(${accentRgb}, ${alpha})`;
        ctx.lineWidth = width;
        if (!broken) {
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
            return;
        }

        // 敗北時は同じ印章が砕けた状態として、輪を三つの弧へ分断する。
        const arcs = [
            [-2.84 + offset, -1.44 + offset],
            [-1.18 + offset, 0.58 + offset],
            [0.92 + offset, 2.52 + offset]
        ];
        for (const [start, end] of arcs) {
            ctx.beginPath();
            ctx.arc(0, 0, radius, start, end);
            ctx.stroke();
        }
    };

    strokeRing(rOuter, 2, broken ? 0.50 : 0.72);
    strokeRing(rInner, 1, broken ? 0.34 : 0.55, 0.08);

    // 節点は突破画面と共通。敗北時は一部を落として「未完」を表す。
    for (let i = 0; i < 4; i++) {
        if (broken && i === 1) continue;
        const a = Math.PI * 0.25 + i * Math.PI * 0.5;
        ctx.save();
        ctx.translate(Math.cos(a) * rOuter, Math.sin(a) * rOuter);
        ctx.rotate(a);
        ctx.fillStyle = `rgba(${accentRgb}, ${broken ? 0.54 : 0.76})`;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
    }

    // 勝利側だけ、ごく細い放射線で印章が確定した余韻を加える。
    if (!broken) {
        ctx.strokeStyle = `rgba(${accentRgb}, 0.12)`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (rOuter + 18), Math.sin(a) * (rOuter + 18));
            ctx.lineTo(Math.cos(a) * (rOuter + 52), Math.sin(a) * (rOuter + 52));
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawOutcomePrompt(ctx, text, time, y = CANVAS_HEIGHT - 48, reveal = 1) {
    const a = Math.max(0, Math.min(1, reveal)) * (0.70 + Math.sin(time * 0.006) * 0.12);
    if (a <= 0.002) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 18px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 5;
    ctx.fillText(text, SCREEN_WIDTH * 0.5, y);
    ctx.restore();
}

// ゲームオーバー画面
export function renderGameOverScreen(ctx, player, stageNumber, fadeTimer = 0) {
    const time = Math.max(0, Number(fadeTimer) || 0);
    const fadeProgress = Math.max(0, Math.min(1, time / 780));
    const eased = 1 - Math.pow(1 - fadeProgress, 3);
    const centerX = SCREEN_WIDTH * 0.5;
    const centerY = CANVAS_HEIGHT * 0.46;

    ctx.save();

    // 舞台の色を完全には消さず、中央だけ黒赤の沈みへ落とす。
    const sink = ctx.createRadialGradient(
        centerX, centerY, 20,
        centerX, centerY, SCREEN_WIDTH * 0.58
    );
    sink.addColorStop(0, `rgba(42, 4, 8, ${(0.24 * eased).toFixed(3)})`);
    sink.addColorStop(0.52, `rgba(15, 3, 6, ${(0.30 * eased).toFixed(3)})`);
    sink.addColorStop(1, `rgba(0, 0, 0, ${(0.52 * eased).toFixed(3)})`);
    ctx.fillStyle = sink;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    // 散りゆく灰。突破画面の放射線に対し、敗北側は下へ落ちる動きにする。
    const loopTime = Date.now();
    for (let i = 0; i < 18; i++) {
        const cycleDuration = 4000;
        const offset = i * (cycleDuration / 18);
        const cycleProgress = ((loopTime + offset) % cycleDuration) / cycleDuration;
        const px = centerX + Math.sin(loopTime * 0.001 + i * 0.7) * 220;
        const py = centerY - 150 + Math.cos(loopTime * 0.0008 + i * 0.9) * 70 + cycleProgress * 230;
        const size = 2 + Math.sin(i * 0.5) * 1.5;
        const particleAlpha = Math.sin(cycleProgress * Math.PI) * 0.34 * eased;
        ctx.fillStyle = `rgba(146, 62, 62, ${particleAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }

    drawOutcomeSealFrame(ctx, centerX, centerY, fadeProgress, '174, 72, 72', {
        broken: true,
        time,
        radius: 150
    });

    ctx.globalAlpha = eased;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(232, 205, 197, 0.96)';
    ctx.font = OUTCOME_MAIN_FONT;
    ctx.fillText('無念', centerX, centerY - 22);

    ctx.shadowBlur = 6;
    ctx.font = '700 27px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = 'rgba(196, 77, 77, 0.96)';
    ctx.fillText('GAME OVER', centerX, centerY + 57);
    ctx.restore();

    // タップ用ボタン
    drawOutcomePrompt(
        ctx,
        'Press SPACE or Tap Screen to Return to Title',
        time,
        CANVAS_HEIGHT - 48,
        Math.max(0, Math.min(1, (time - 420) / 280))
    );
    drawFlatButton(ctx, centerX, CANVAS_HEIGHT - 48, 430, 54, '', 'rgba(0, 0, 0, 0)');
}

// ステージクリア画面（ステータス画面）
// ============================================================
//  昇段画面トンマナ 共有ヘルパー（紺カード／字間テキスト）
//  ステータス画面・ショップ画面でも同じ世界観を使うため ui.js に集約。
// ============================================================
// 数字(ASCII)はサンセリフ、和文(ラベル/単位/漢数字)は明朝で混在描画する。
// 「数字＝サンセリフ／和文＝明朝」原則。現在の fillStyle / textBaseline をそのまま使う。総幅を返す。
export function drawNumMixedText(ctx, text, x, y, weight, px, align = 'left') {
    const sans = `${weight} ${px}px "Helvetica Neue", Arial, sans-serif`;
    const mincho = `${weight} ${px}px "Zen Old Mincho", serif`;
    const str = String(text);
    const isNum = (ch) => /[0-9.,:/%\s+\-]/.test(ch);
    const segs = [];
    let cur = '', curNum = null;
    for (const ch of str) {
        const n = isNum(ch);
        if (curNum === null || n === curNum) { cur += ch; curNum = n; }
        else { segs.push({ t: cur, num: curNum }); cur = ch; curNum = n; }
    }
    if (cur) segs.push({ t: cur, num: curNum });
    let total = 0;
    for (const s of segs) { ctx.font = s.num ? sans : mincho; total += ctx.measureText(s.t).width; }
    let sx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const s of segs) {
        ctx.font = s.num ? sans : mincho;
        ctx.fillText(s.t, sx, y);
        sx += ctx.measureText(s.t).width;
    }
    ctx.textAlign = prevAlign;
    return total;
}

function wafuRoundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

// 字間つきテキスト（canvas に letter-spacing が無いので文字ごとに描く）
function wafuFillTextLS(ctx, text, x, y, lsPx, align = 'left') {
    const chars = [...String(text)];
    if (!chars.length) return;
    const ws = chars.map((c) => ctx.measureText(c).width);
    const total = ws.reduce((a, b) => a + b, 0) + lsPx * (chars.length - 1);
    let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (let i = 0; i < chars.length; i++) { ctx.fillText(chars[i], px, y); px += ws[i] + lsPx; }
    ctx.textAlign = prevAlign;
}

// 昇段画面と同じ紺カード：純色グラデ＋上辺の青アクセント＋枠（選択時は青発光＋内リング）
export function drawWafuCard(ctx, x, y, w, h, opts = {}) {
    const { radius = 10, selected = false, pulse = 0, accent = true, shadow = true, flat = false, bgAlpha = 1 } = opts;
    // 選択時のグロー／枠／上辺アクセントの色（既定は青。将軍などの特別ボタンは金へ差し替え可）
    const glowRGB = opts.glowRGB || '74, 134, 236';
    const borderSelRGB = opts.borderSelRGB || '150, 196, 255';
    const accentRGB = opts.accentRGB || '142, 200, 255';

    // flat=true: 外カードの中に収まる内側行用（枠線なし・薄い背景帯のみ）
    if (flat && !selected) {
        wafuRoundRectPath(ctx, x, y, w, h, radius);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fill();
        return;
    }

    // 影／グロー（モダン：大きめブラー・低不透明・浮かせすぎない）
    if (shadow || selected) {
        ctx.save();
        ctx.shadowColor = selected ? `rgba(${glowRGB}, ${0.24 + pulse * 0.12})` : 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = selected ? 30 : 18;
        ctx.shadowOffsetY = selected ? 0 : 5;
        wafuRoundRectPath(ctx, x, y, w, h, radius);
        ctx.fillStyle = `rgba(18, 24, 44, ${bgAlpha})`;
        ctx.fill();
        ctx.restore();
    }

    // 本体（控えめ・やや低彩度の縦グラデ）
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, `rgba(33, 42, 68, ${0.96 * bgAlpha})`);
    bg.addColorStop(1, `rgba(23, 30, 52, ${0.97 * bgAlpha})`);
    wafuRoundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = bg;
    ctx.fill();

    // 上部の淡いシーン（クリスプな上端＝光源感）
    ctx.save();
    wafuRoundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
    const sheenH = Math.min(h * 0.5, 56);
    const sheen = ctx.createLinearGradient(x, y, x, y + sheenH);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, sheenH);
    ctx.restore();

    // ヘアライン枠（選択で明るく）
    wafuRoundRectPath(ctx, x, y, w, h, radius);
    ctx.strokeStyle = selected ? `rgba(${borderSelRGB}, ${0.6 + pulse * 0.25})` : 'rgba(146, 172, 226, 0.22)';
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();

    // 上辺の細いアクセント（既定は青。accentRGB で色のみ差し替え）
    if (accent) {
        ctx.save();
        wafuRoundRectPath(ctx, x, y, w, h, radius);
        ctx.clip();
        const a = ctx.createLinearGradient(x, 0, x + w, 0);
        a.addColorStop(0, `rgba(${accentRGB}, 0)`);
        a.addColorStop(0.5, `rgba(${accentRGB}, ${selected ? 0.9 : 0.5})`);
        a.addColorStop(1, `rgba(${accentRGB}, 0)`);
        ctx.fillStyle = a;
        ctx.fillRect(x, y, w, 2);
        ctx.restore();
    }
}

// 短い水平の青グラデ罫線（昇段画面の区切り線）
export function drawWafuDivider(ctx, cx, y, halfWidth) {
    const g = ctx.createLinearGradient(cx - halfWidth, 0, cx + halfWidth, 0);
    g.addColorStop(0, 'rgba(180, 205, 255, 0)');
    g.addColorStop(0.5, 'rgba(180, 205, 255, 0.5)');
    g.addColorStop(1, 'rgba(180, 205, 255, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, y);
    ctx.lineTo(cx + halfWidth, y);
    ctx.stroke();
}

// 見出し（明朝・字間つき）＋左右の細い青罫線（昇段画面「強化を選択」と同テイスト）
export function drawWafuHeading(ctx, cx, baselineY, text, opts = {}) {
    const { size = 38, weight = 900, ls = 0.14, color = '#f4f9ff', ruleLen = 54, ruleGap = 18, rules = true } = opts;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${weight} ${size}px "Zen Old Mincho", serif`;
    ctx.fillStyle = color;
    const lsPx = ls * size;
    wafuFillTextLS(ctx, text, cx, baselineY, lsPx, 'center');
    if (rules) {
        // 字間込みの可視幅（末尾字間は含めない）
        const chars = [...String(text)];
        let visW = 0;
        for (const c of chars) visW += ctx.measureText(c).width;
        visW += lsPx * Math.max(0, chars.length - 1);
        const half = visW / 2;
        const ruleY = baselineY - size * 0.32;
        ctx.lineWidth = 1;
        let g = ctx.createLinearGradient(cx - half - ruleGap - ruleLen, 0, cx - half - ruleGap, 0);
        g.addColorStop(0, 'rgba(142, 200, 255, 0)');
        g.addColorStop(1, 'rgba(142, 200, 255, 0.65)');
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(cx - half - ruleGap - ruleLen, ruleY); ctx.lineTo(cx - half - ruleGap, ruleY); ctx.stroke();
        g = ctx.createLinearGradient(cx + half + ruleGap, 0, cx + half + ruleGap + ruleLen, 0);
        g.addColorStop(0, 'rgba(142, 200, 255, 0.65)');
        g.addColorStop(1, 'rgba(142, 200, 255, 0)');
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(cx + half + ruleGap, ruleY); ctx.lineTo(cx + half + ruleGap + ruleLen, ruleY); ctx.stroke();
    }
    ctx.restore();
}

// ボスの名乗り短冊（縦書き）。登場演出の「間」を作るための一枚。
// 天井から下がってきて 0.8 秒ほど留まり、開戦で上へ抜ける。
// 背景の色には一切触れない UI レイヤーの表現なので、ボス部屋の
// ボス名はここで一度だけ見せる。戦闘中のHPゲージには名前を再掲しない。
// 横組みに統一し、中央の縦短冊と上部の横ゲージが競合していた旧構成を解消する。
// 名乗り帯の矩形。描画(renderBossNameBanner)と、会敵の立ち位置クランプ
// (game.updatePlaying)が同じ値を読む。座標式を複製すると、帯の大きさを変えた
// ときに「帯を飛び越した位置で開戦する」ずれが戻ってくる。
export function getBossNameBannerBox() {
    const s = getUiScale();
    const w = Math.min(Math.round(590 * s), SCREEN_WIDTH - Math.round(48 * s));
    const h = Math.round(126 * s);
    const cx = SCREEN_WIDTH * 0.5;
    const cy = CANVAS_HEIGHT * 0.39;
    return { x: Math.round(cx - w * 0.5), y: Math.round(cy - h * 0.5), w, h, cx, cy };
}

export function renderBossNameBanner(ctx, name, opts = {}) {
    const text = String(name || '').trim();
    if (!text) return;
    const enterT = Math.max(0, Math.min(1, opts.enterT != null ? opts.enterT : 1));
    const exitT = Math.max(0, Math.min(1, opts.exitT || 0));
    if (exitT >= 1) return;
    const s = getUiScale();
    const stageNumber = Math.max(1, Math.min(6, Number(opts.stageNumber) || 1));
    const accents = ['#91c3a0', '#d9b37a', '#b9c8df', '#e2a06e', '#d4b986', '#e8bac9'];
    const accent = accents[stageNumber - 1];
    const { x, y, w, h, cx, cy } = getBossNameBannerBox();
    const easeOut = 1 - Math.pow(1 - enterT, 3);
    const easeIn = exitT * exitT;
    const alpha = Math.min(1, enterT * 2.6) * (1 - easeIn);
    const open = Math.max(0.02, easeOut * (1 - easeIn));
    if (alpha <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(0.92 + open * 0.08, 0.96 + open * 0.04);
    ctx.translate(-cx, -cy);

    // 中央から開くマスク。名前、罫線、台紙を同じ動きに揃える。
    ctx.beginPath();
    ctx.rect(cx - w * open * 0.5, y - 18 * s, w * open, h + 36 * s);
    ctx.clip();

    const shadow = ctx.createLinearGradient(0, y, 0, y + h);
    shadow.addColorStop(0, 'rgba(7, 11, 20, 0.72)');
    shadow.addColorStop(0.5, 'rgba(15, 19, 29, 0.94)');
    shadow.addColorStop(1, 'rgba(5, 8, 15, 0.72)');
    wafuRoundRectPath(ctx, x, y, w, h, 6 * s);
    ctx.fillStyle = shadow;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
    ctx.shadowBlur = 22 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 金属の細罫とステージ固有色の芯。全画面を染めず、舞台札だけに色を置く。
    for (const yy of [y + 9 * s, y + h - 9 * s]) {
        const line = ctx.createLinearGradient(x, 0, x + w, 0);
        line.addColorStop(0, 'rgba(214, 180, 112, 0)');
        line.addColorStop(0.18, 'rgba(214, 180, 112, 0.55)');
        line.addColorStop(0.5, accent);
        line.addColorStop(0.82, 'rgba(214, 180, 112, 0.55)');
        line.addColorStop(1, 'rgba(214, 180, 112, 0)');
        ctx.strokeStyle = line;
        ctx.lineWidth = Math.max(1, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy);
        ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(15 * s)}px "Zen Old Mincho", serif`;
    ctx.fillStyle = 'rgba(225, 205, 159, 0.88)';
    ctx.fillText('決　戦', cx, y + 32 * s);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 7 * s;
    ctx.font = `900 ${Math.round(38 * s)}px "Zen Old Mincho", serif`;
    ctx.fillStyle = '#f7f3e9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + 79 * s, w - 70 * s);

    // 両端の小さな紋。大きな装飾を足さず、横長の構図を明確にする。
    ctx.shadowBlur = 0;
    ctx.strokeStyle = accent;
    ctx.globalAlpha *= 0.72;
    for (const dx of [x + 31 * s, x + w - 31 * s]) {
        ctx.save();
        ctx.translate(dx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-5 * s, -5 * s, 10 * s, 10 * s);
        ctx.restore();
    }
    ctx.restore();
}

// 青ピップ列（昇段画面の段位表示と同テイスト）。filled=点灯, next=次段リング
export function drawWafuPips(ctx, x, y, pipW, pipH, gap, level, maxLevel) {
    for (let p = 0; p < maxLevel; p++) {
        const gx = x + p * (pipW + gap);
        wafuRoundRectPath(ctx, gx, y, pipW, pipH, 2);
        ctx.fillStyle = 'rgba(210, 225, 255, 0.16)';
        ctx.fill();
        if (p < level) {
            const g = ctx.createLinearGradient(gx, 0, gx + pipW, 0);
            g.addColorStop(0, '#6fb6ff');
            g.addColorStop(1, '#a9d8ff');
            wafuRoundRectPath(ctx, gx, y, pipW, pipH, 2);
            ctx.fillStyle = g;
            ctx.fill();
        } else if (p === level) {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(142, 200, 255, 0.6)';
            wafuRoundRectPath(ctx, gx - 1.5, y - 1.5, pipW + 3, pipH + 3, 3);
            ctx.strokeStyle = '#8ec8ff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }
    }
}

const _statusMenuAnim = { amt: [], last: 0 };

// ステータス画面の選択肢のうち「地図に戻る」の位置。下の3択(忍具/よろず屋/準備完了)の
// 次で、左右キーの輪に入っている。game.js の同名の定数と必ず同じ値にする
// （export して共有しないのは、ui.js を無バージョンで読む経路が生まれたときに
//   「その export だけ無い古いモジュール」で落ちるのを避けるため）。
const STATUS_MENU_MAP_BACK = 3;

// ステータス画面（ステージクリア）の一様スケール・レイアウトの単一導出。
// 描画(renderStatusScreen)とタップ判定(game.updateStageClear)は必ずこれを読むこと。
// s=1 で従来の固定px値と数値同一（ピクセル不変）。
// 方針：ステータスカードは「右上角を固定」して左＝幅・下＝高さへ s 倍で拡大する。
//   右上を動かさないので右上の BGM ボタンと衝突しない（カード上端96 > ボタン下端62u が常に成立）。
//   メニューは下端を固定して上へ s 倍。上限 1.12 はカード下端とメニュー上端が衝突しない範囲。
export function getStatusScreenLayout() {
    const s = Math.max(1, Math.min(getUiScale(), 1.12));
    // 退避は左右のみ。上96px/下60px は既に画面端から十分内側で角丸に掛からないうえ、
    // s=1.12 はカード下端とメニュー上端が接する上限なので、上下を詰めると必ず重なる。
    const safe = getScreenSafeArea();
    const defaultRight = SCREEN_WIDTH - safe.right - 54;  // s=1 の infoPanel 右端
    const defaultTop = 96;                                // s=1 の infoPanel 上端
    const panelBottom = defaultTop + 404 * s;             // 下端は据え置き（s=1 で 500）

    // 右上のBGMボタンと重なるときだけ、パネルを左へ寄せて上端をボタンと揃える
    // （スマホでは BGM ボタンが操作ボタンの右端ラインまで内側に来るため重なる）。
    // PC は BGM ボタンがパネル上端(96)より上にあるので、この分岐に入らず従来のまま。
    const bgm = getPadLayout().bgm;
    const overlapsBgm = (bgm.y + bgm.r > defaultTop) && (bgm.x - bgm.r < defaultRight);
    const anchorRight = overlapsBgm ? (bgm.x - bgm.r - 16) : defaultRight;
    const anchorTop = overlapsBgm ? (bgm.y - bgm.r) : defaultTop;

    const infoPanelW = 364 * s;              // 左へ拡大
    const infoPanelH = panelBottom - anchorTop;   // 上へ伸びたぶんだけ背が高くなる
    const infoPanelX = anchorRight - infoPanelW;
    const infoPanelY = anchorTop;
    const rowInset = 18 * s;
    // 伸びた高さは6行へ均等に配る（＝行間に余裕ができる）。従来配分は
    // 上余白30s + 6行×38s + 間18s + カード110s + 下余白18s = 404s。
    const rowH = 38 * s + Math.max(0, infoPanelH - 404 * s) / 6;
    const rowStartY = infoPanelY + 30 * s;
    const cardY = rowStartY + 6 * rowH + 18 * s;
    const cardH = 110 * s;
    const cardGap = 12 * s;
    const menuH = 80 * s;
    const menuY = (CANVAS_HEIGHT - 60) - menuH;   // 下端 660 を固定して上へ拡大（s=1 で 580）
    // 下部メニューは右端(anchorRight)の内側量をそのまま左にも取り、左右の余白を揃える。
    // 固定の左マージンだと、パネルをBGMボタンから逃がして右端だけ内側へ動いたとき
    // 画面全体が左に寄って見える（実機で指摘 2026-08-09）。幅は3等分なので、
    // 左を合わせるぶんボタンが少し細くなる。
    const menuStartX = SCREEN_WIDTH - anchorRight;
    const menuGap = 20 * s;
    const menuW = (anchorRight - menuStartX - menuGap * 2) / 3;
    // 文字は「行に生まれた余裕のぶんだけ」拡大する。実寸アンカー(fontScale)を
    // 直接掛けると枠に対して大きくなりすぎた（実機で差し戻し 2026-08-09）。
    // 行高比なのでレイアウトとの釣り合いが崩れない。PC(rowH=38)は 1.0＝従来と同一。
    const textScale = rowH / 38;
    return {
        s,
        textScale,
        infoPanel: { x: infoPanelX, y: infoPanelY, w: infoPanelW, h: infoPanelH },
        rowX: infoPanelX + rowInset,
        rowW: infoPanelW - rowInset * 2,
        rowStartY, rowH,
        cardY,
        cardW: (infoPanelW - rowInset * 2 - cardGap * 2) / 3,
        cardH, cardGap,
        menuRects: [0, 1, 2].map((i) => ({ x: menuStartX + i * (menuW + menuGap), y: menuY, w: menuW, h: menuH })),
        menuBottom: menuY + menuH,
        // 「地図に戻る」。下の3択(忍具/よろず屋/準備完了)は等分割なので4つ目を
        // 足すと全部が細くなる。行き先の選び直しは決定系ではなく取り消しなので、
        // 左上へ独立して置く。
        // 左端は【下のメニューの左端(menuStartX)と揃える】。独自マージンで置くと
        // 画面端からの入り方が下のボタンとずれて見える(実機フィードバック 2026-08-11)。
        backButton: {
            x: menuStartX,
            y: safe.top + 20,
            w: 148 * s,
            h: 40 * s
        }
    };
}

export function renderStatusScreen(ctx, stageNumber, player, weaponUnlocked, options = {}) {
    const menuIndex = Number.isFinite(options.menuIndex) ? options.menuIndex : 0;
    const selectedWeaponName = options.selectedWeaponName || (player?.currentSubWeapon?.name || '未装備');
    const layer = options.layer || 'full';
    const drawBackground = layer !== 'ui';
    const drawUi = layer !== 'background';
    const progression = player?.progression || {};
    const normalTier = Math.max(0, Math.min(3, Number(progression.normalCombo) || 0));
    const subTier = Math.max(0, Math.min(3, Number(progression.subWeapon) || 0));
    const specialTier = Math.max(0, Math.min(3, Number(progression.specialClone) || 0));
    const tierLabel = (tier) => ['初級', '中級', '上級', '特級'][Math.max(0, Math.min(3, tier))];
    const pulse = (Math.sin(Date.now() * 0.0026) + 1) * 0.5;

    // レイアウトとスケールの単一導出（タップ判定 game.updateStageClear と共有）
    const L = getStatusScreenLayout();
    const s = L.s;
    const tf = L.textScale;   // 文字だけの倍率（幾何は s。上限は行高に紐付け済み）

    const menuItems = [
        { title: `忍具：${selectedWeaponName}` },
        { title: 'よろず屋' },
        { title: '準備完了' }
    ];

    const progressionCards = [
        { title: '連撃強化', level: normalTier, detail: tierLabel(normalTier) },
        { title: '忍具強化', level: subTier, detail: tierLabel(subTier) },
        { title: '奥義強化', level: specialTier, detail: tierLabel(specialTier) }
    ];

    ctx.save();
    try {
        // 呼び出し側の影/合成状態に影響されないようリセット（自己完結描画）
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 1;

        if (drawBackground) {
            // 背景画像（読込前は紺下地＋アンビエント光でフォールバック）
            if (!_statusBgImage) { _statusBgImage = new Image(); _statusBgImage.src = 'images/status_bg.png'; }
            ctx.fillStyle = '#141d34';
            ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            if (_statusBgImage.complete && _statusBgImage.naturalWidth) {
                ctx.imageSmoothingEnabled = true;
                drawBgCover(ctx, _statusBgImage, 0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            } else {
                const glow = ctx.createRadialGradient(SCREEN_WIDTH * 0.44, CANVAS_HEIGHT * 0.34, 0, SCREEN_WIDTH * 0.44, CANVAS_HEIGHT * 0.34, SCREEN_WIDTH * 0.92);
                glow.addColorStop(0, 'rgba(66, 96, 168, 0.42)');
                glow.addColorStop(1, 'rgba(66, 96, 168, 0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            }
        }

        if (!drawUi) {
            return;
        }

        // --- 右：情報パネル（右上角固定・左下拡大。L から単一導出）---
        const { x: infoPanelX, y: infoPanelY, w: infoPanelW, h: infoPanelH } = L.infoPanel;
        const rowX = L.rowX;
        const rowW = L.rowW;
        const rowStartY = L.rowStartY;
        const rowH = L.rowH;

        const statRows = [
            { label: '段位', value: `${toKanjiNumber(player.level)}段`, color: '#ffffff' },
            { label: '体力', value: `${player.maxHp}`, color: '#ff8a8a' },
            { label: '小判', value: `${formatMoney(player.money)}枚`, color: '#ffd96b' },
            { label: '剛力', value: `${(player.attackPower || 1.0).toFixed(1)}倍`, color: '#ffbe8a' },
            { label: '韋駄天', value: player.permanentDash ? '習得済' : '未習得', color: '#8ef0b6' },
            { label: '跳躍', value: `${toKanjiNumber(player.maxJumps || 1)}段`, color: '#8ec8ff' }
        ];

        const cardY = L.cardY;
        const cardGap = L.cardGap;
        const cardW = L.cardW;
        const cardH = L.cardH;

        drawWafuCard(ctx, infoPanelX, infoPanelY, infoPanelW, infoPanelH, { radius: 12 * s, pulse, bgAlpha: 0.55 });

        // ステータス行（ラベル左／値右＋細い区切り線）
        statRows.forEach((row, i) => {
            const centerY = rowStartY + i * rowH + rowH / 2;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            // 0.7 だと小さい明朝の細い画がアンチエイリアスに食われて沈む。
            // 白まで振らずに一段だけ持ち上げる（全デバイス共通）。
            ctx.fillStyle = 'rgba(212, 226, 255, 0.86)';
            ctx.font = `500 ${16 * tf}px "Zen Old Mincho", serif`;
            ctx.fillText(row.label, rowX + 4 * s, centerY);

            ctx.fillStyle = row.color;
            drawNumMixedText(ctx, row.value, rowX + rowW - 4 * s, centerY, 700, 19 * tf, 'right');

            if (i < statRows.length - 1) {
                ctx.strokeStyle = 'rgba(150, 178, 232, 0.14)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(rowX, rowStartY + (i + 1) * rowH);
                ctx.lineTo(rowX + rowW, rowStartY + (i + 1) * rowH);
                ctx.stroke();
            }
        });
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        // 強化状況カード（ミニ紺カード＋段位＋青ピップ）
        progressionCards.forEach((card, i) => {
            const x = rowX + i * (cardW + cardGap);
            drawWafuCard(ctx, x, cardY, cardW, cardH, { radius: 8 * s, accent: false, shadow: false, flat: true });

            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(216, 230, 255, 0.9)';
            ctx.font = `700 ${14 * tf}px "Zen Old Mincho", serif`;
            ctx.fillText(card.title, x + cardW / 2, cardY + 28 * s);

            ctx.fillStyle = '#cfe2ff';
            ctx.font = `700 ${18 * tf}px "Zen Old Mincho", serif`;
            ctx.fillText(card.detail, x + cardW / 2, cardY + 58 * s);

            const pipW = 20 * s, pipH = 6 * s, pipGap = 7 * s;
            const pipsW = 3 * pipW + 2 * pipGap;
            drawWafuPips(ctx, x + cardW / 2 - pipsW / 2, cardY + 78 * s, pipW, pipH, pipGap, card.level, 3);
        });

        // --- 下部：メニュー（L から単一導出。描画とタップ判定で共有）---
        // 選択 transition（昇段カードと同方式）
        const _sNow = Date.now();
        let _sDt = (_sNow - _statusMenuAnim.last) / 1000;
        _statusMenuAnim.last = _sNow;
        if (_statusMenuAnim.amt.length !== menuItems.length || !(_sDt >= 0) || _sDt > 0.25) {
            _statusMenuAnim.amt = menuItems.map((_, i) => (i === menuIndex ? 1 : 0));
            _sDt = 0;
        }
        const _sEase = 1 - Math.exp(-Math.min(_sDt, 0.1) / 0.07);
        for (let i = 0; i < menuItems.length; i++) {
            _statusMenuAnim.amt[i] += ((i === menuIndex ? 1 : 0) - _statusMenuAnim.amt[i]) * _sEase;
        }

        menuItems.forEach((item, i) => {
            const selected = i === menuIndex;
            const a = _statusMenuAnim.amt[i];
            const r = L.menuRects[i];
            const y = r.y - 4 * s * a;
            drawWafuCard(ctx, r.x, y, r.w, r.h, { radius: 10 * s, selected, pulse });

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = selected ? '#ffffff' : 'rgba(224, 234, 255, 0.82)';
            ctx.font = `700 ${22 * tf}px "Zen Old Mincho", serif`;
            fillTextInkCentered(ctx, item.title, r.x + r.w / 2, y + r.h / 2);
        });
        ctx.textBaseline = 'alphabetic';

        // 行き先へ戻る（全体マップから来たときだけ）。選び直しの導線が無いと
        // 「決めたら引き返せない」画面になる(実機フィードバック 2026-08-11)。
        // 左右キーの輪にも入っている(menuIndex === STATUS_MENU_MAP_BACK で選択中)。
        if (options.canGoBack) {
            const b = L.backButton;
            const selected = menuIndex === STATUS_MENU_MAP_BACK;
            drawWafuCard(ctx, b.x, b.y, b.w, b.h, { radius: 9 * s, bgAlpha: 0.72, selected, pulse });
            const label = '地図に戻る';
            const fontPx = 16 * tf;
            ctx.font = `700 ${fontPx}px "Zen Old Mincho", serif`;
            // 「<」は文字で描かない。明朝の記号は字形・字幅が環境で揺れて、
            // ラベルとの間隔が端末ごとに変わる(指定 2026-08-12)。線で引く。
            const chevW = fontPx * 0.34;
            const chevGap = fontPx * 0.44;
            const textW = ctx.measureText(label).width;
            const groupW = chevW + chevGap + textW;
            const left = b.x + (b.w - groupW) / 2;
            const midY = b.y + b.h / 2;

            ctx.save();
            ctx.strokeStyle = selected ? '#ffffff' : 'rgba(224, 234, 255, 0.9)';
            ctx.lineWidth = Math.max(1.6, fontPx * 0.115);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(left + chevW, midY - chevW * 0.92);
            ctx.lineTo(left, midY);
            ctx.lineTo(left + chevW, midY + chevW * 0.92);
            ctx.stroke();
            ctx.restore();

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = selected ? '#ffffff' : 'rgba(224, 234, 255, 0.9)';
            ctx.fillText(label, left + chevW + chevGap, midY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        // 操作説明はタイトル画面と同じ見た目・位置に統一（メニュー底辺と重ならない位置へ）。
        // 【この画面にいる間、文言は変えない】。canGoBack を毎フレーム計算していた頃は
        // 準備完了を押した瞬間に「ESC：地図に戻る」が消えて行が詰まり、ちらついた
        // (呼び出し側 game.statusCanGoBack が画面に入った時点で確定させている)。
        drawScreenManualLine(
            ctx,
            options.canGoBack
                ? '←→：選択 | SPACE：決定 | ↑↓：装備切替 | ESC：地図に戻る'
                : '←→：選択 | SPACE：決定 | ↑↓：装備切替',
            Math.max(CANVAS_HEIGHT - 20, L.menuBottom + 14)
        );

    } finally {
        ctx.restore();
    }
}

// 昇段画面：カード選択/解除の transition をフレーム間で保持（amt[i]:0..1 を実時間でイージング）。
const _levelUpCardAnim = { amt: [], last: 0 };

/**
 * 案1「紺ベース・中央寄せ整列」昇段（Lvアップ強化選択）画面。
 * --------------------------------------------------------------
 * - choice = { title, subtitle, level?, maxLevel?, durationSec? }
 *     durationSec を持つ＝忍術札（効果時間表示）／持たない＝強化札（ピップ＋段位）
 * - デザイン正本(.dc.html 案1)は 1920×1080 で作成され scale(min(w/1920,h/1080)) で縮小表示される。
 *   そのため全寸法を「design-px(1920基準)」で記述し、S=SCREEN_WIDTH/1920 で一様スケールして描く
 *   （= どの解像度でも案1と同じ比率になる）。見出し＋カードは1ブロックとして画面上下中央へ。
 * - カードは CARD_K 倍に拡大（中身の寸法・文字も比例。dk()/lwk() を使用）。
 * - 選択/解除は CSS transition 相当を _levelUpCardAnim でフレーム間イージング（持ち上げ・枠・影・発光）。
 * - Canvas には letter-spacing が無いため、字間は文字ごと描画(fillLS)で再現。
 * - SCREEN_WIDTH / CANVAS_HEIGHT は constants.js からの import を利用。
 */
// 難易度の色。タイトルの難易度ボタンと寄り道の結果発表の難易度印で共有する。
export function getDifficultyColor(id) {
    if (id === 'easy') return '#7fd08a';
    if (id === 'hard') return '#e08a8a';
    return '#e7c45a';   // 普（金）
}

// 結果発表のレイアウト単一導出。描画(renderSideResultScreen)とタップ判定
// (game.updateSideResult)が同じ矩形を読む（座標式の複製はヒットずれの元）。
// 各値は「カード上端からのベースライン位置」。高さは中身から積み上げる
// （固定値だと記録更新の有無で下に大穴が空く）。
export function getSideResultLayout(isNewRecord) {
    const uiS = getUiScale();
    const cx = SCREEN_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    // 上下の余白は【文字の見た目の端】で揃える。ベースライン基準で同値にすると、
    // 見出しは背が高く最後の行は低いので上が広く見える(実機フィードバック 2026-08-12)。
    // 上=見出し(28px)の字面の上端、下=最後の行(16px/13px)の字面の下端。
    const PAD = 30 * uiS;
    const headBase = PAD + 23 * uiS;          // 見出し(28px)のベースライン＝字面上端が PAD に乗る
    const subBase = headBase + 30 * uiS;      // 小見出し(13px)＋難易度の印を組んだ行
    const scoreBase = subBase + 66 * uiS;     // スコア(56px)
    const dividerY = scoreBase + 26 * uiS;    // 区切り線
    const bestBase = dividerY + 32 * uiS;     // 最高記録 / 更新の報せ
    const prevBase = bestBase + 21 * uiS;     // 更新時のみ「これまで N」
    const contentBottom = (isNewRecord ? prevBase : bestBase) + 1 * uiS;
    const w = 420 * uiS;
    const h = contentBottom + PAD;
    const x = cx - w / 2;
    const y = cy - h / 2;

    // 二択のボタン。もう一度＝主(左)・戻る＝副(右)。カードの直下に並べる。
    const btnH = 46 * uiS;
    const btnGap = 14 * uiS;
    const btnW = (w - btnGap) / 2;
    const btnY = y + h + 18 * uiS;
    return {
        uiS, cx, cy, x, y, w, h,
        headBase, subBase, scoreBase, dividerY, bestBase, prevBase,
        buttons: [
            { id: 'retry', label: 'もう一度', x, y: btnY, w: btnW, h: btnH },
            { id: 'back', label: '戻る', x: x + btnW + btnGap, y: btnY, w: btnW, h: btnH }
        ],
        buttonsBottom: btnY + btnH,
        hitAt(tx, ty) {
            for (const b of this.buttons) {
                if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) return b.id;
            }
            return null;
        }
    };
}

/**
 * 寄り道(小判蔵/道場)の結果発表。刻限切れの直後に出る和風カード。
 * result = { kind:'bonus'|'training', score, prevBest, best, isNewRecord, timer, menuIndex }
 * timer(秒)で段階的に出す: カード → スコア → 最高記録/更新の朱印 → 二択のボタン。
 */
export function renderSideResultScreen(ctx, result) {
    if (!result) return;
    const t = result.timer || 0;
    const isBonus = result.kind === 'bonus';
    const uiS = getUiScale();
    const fs = Math.min(getFontScale(), uiS * 1.15);
    const cx = SCREEN_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;

    // 背後のプレイ画面を沈める暗幕
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 20, 0.72)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    const easeOut = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
    const cardT = easeOut(t / 0.34);

    const L = getSideResultLayout(result.isNewRecord);
    const { headBase, subBase, scoreBase, dividerY, bestBase, prevBase, w, h, x } = L;
    const y = L.y + (1 - cardT) * 18 * uiS;   // せり上がる分だけ描画をずらす

    ctx.globalAlpha = cardT;
    drawWafuCard(ctx, x, y, w, h, { radius: 14 * uiS, bgAlpha: 0.97 });
    ctx.globalAlpha = 1;
    if (cardT < 0.35) { ctx.restore(); return; }

    // 見出し（場の名。「刻限」の語は出さない ― 時間切れは自明、と実機フィードバック）
    drawWafuHeading(ctx, cx, y + headBase, isBonus ? '小 判 蔵' : '修 行 道 場', {
        size: Math.round(28 * fs),
        ls: 0.14,
        ruleLen: 46 * uiS,
        ruleGap: 16 * uiS
    });
    // 見出しの下の行＝「難易度の印 ＋ 何の数字か」。
    // 【印は見出しの行に浮かせない】。カード右上に置いていた頃は、見出しの罫と
    // 同じ高さに一つだけぶら下がって釣り合いが悪かった(実機フィードバック
    // 2026-08-12)。印が掛かるのは下の数字なので、その見出し行へ一緒に組んで
    // 全体を中央寄せする。
    ctx.textBaseline = 'alphabetic';
    const subLabel = isBonus ? '獲得数' : '撃破数';
    const subFont = `500 ${Math.round(13 * fs)}px "Zen Old Mincho", serif`;
    const chipR = 11 * uiS;
    const chipGap = 9 * uiS;
    const hasChip = !!result.difficultyName;
    ctx.font = subFont;
    const subW = ctx.measureText(subLabel).width;
    const groupLeft = cx - (hasChip ? chipR * 2 + chipGap + subW : subW) / 2;
    const subY = y + subBase;
    if (hasChip) {
        const chipCx = groupLeft + chipR;
        const chipCy = subY - 4.5 * uiS;   // 13px 明朝の視覚中心に合わせる
        const color = getDifficultyColor(result.difficultyId);
        ctx.save();
        ctx.beginPath();
        ctx.arc(chipCx, chipCy, chipR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 16, 34, 0.55)';
        ctx.fill();
        ctx.lineWidth = 1.2 * uiS;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.65;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.font = `700 ${Math.round(12 * fs)}px "Zen Old Mincho", serif`;
        ctx.fillStyle = color;
        fillTextInkCentered(ctx, result.difficultyName, chipCx, chipCy);
        ctx.restore();
    }
    ctx.textAlign = 'left';
    ctx.font = subFont;
    ctx.fillStyle = 'rgba(206, 226, 255, 0.82)';
    ctx.fillText(subLabel, groupLeft + (hasChip ? chipR * 2 + chipGap : 0), subY);
    ctx.textAlign = 'center';

    // 今回のスコア（数字だけ大きく）
    const scoreT = easeOut((t - 0.28) / 0.4);
    if (scoreT > 0) {
        const shown = Math.round(result.score * scoreT);
        ctx.save();
        ctx.globalAlpha = Math.min(1, scoreT * 1.4);
        ctx.font = `900 ${Math.round(56 * fs)}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = isBonus ? '#f0cf74' : '#dfeaff';
        ctx.shadowColor = isBonus ? 'rgba(232, 200, 106, 0.45)' : 'rgba(120, 170, 255, 0.4)';
        ctx.shadowBlur = 22 * uiS;
        // 【数字だけ】をカードの中心に置き、単位はその右へ添える。
        // 数字＋単位をひとまとまりで中央寄せすると、主役の数字が左へ寄って見える
        // (実機フィードバック 2026-08-11)。
        const numText = formatCount(shown);
        const baseY = y + scoreBase;
        const numW = ctx.measureText(numText).width;
        ctx.textAlign = 'center';
        ctx.fillText(numText, cx, baseY);
        ctx.shadowBlur = 0;
        // 単位はベースライン揃えだと大きな数字に対して沈むので、少しだけ持ち上げる
        ctx.font = `700 ${Math.round(20 * fs)}px "Zen Old Mincho", serif`;
        ctx.fillStyle = 'rgba(226, 236, 255, 0.9)';
        ctx.textAlign = 'left';
        ctx.fillText(isBonus ? '両' : '人', cx + numW / 2 + 8 * uiS, baseY - 4 * uiS);
        ctx.restore();
    }

    // 区切り
    drawWafuDivider(ctx, cx, y + dividerY, 190 * uiS);

    // 最高記録と更新の報せ
    const bestT = easeOut((t - 0.62) / 0.36);
    if (bestT > 0) {
        ctx.save();
        ctx.globalAlpha = bestT;
        ctx.textAlign = 'center';
        if (result.isNewRecord) {
            const pulse = 0.72 + Math.sin(Date.now() * 0.006) * 0.28;
            ctx.font = `900 ${Math.round(22 * fs)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = `rgba(255, 206, 120, ${pulse.toFixed(3)})`;
            ctx.shadowColor = 'rgba(255, 190, 90, 0.5)';
            ctx.shadowBlur = 18 * uiS;
            ctx.fillText('最 高 記 録 更 新', cx, y + bestBase);
            ctx.shadowBlur = 0;
            ctx.font = `500 ${Math.round(13 * fs)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = 'rgba(206, 226, 255, 0.7)';
            ctx.fillText(`これまで ${formatCount(result.prevBest)}${isBonus ? '両' : '人'}`, cx, y + prevBase);
        } else {
            ctx.font = `700 ${Math.round(16 * fs)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = 'rgba(206, 226, 255, 0.9)';
            ctx.fillText(`最高記録 ${formatCount(result.best)}${isBonus ? '両' : '人'}`, cx, y + bestBase);
        }
        ctx.restore();
    }

    // 二択のボタン（読ませる間を置いてから）。連戦できることを見せるのが主目的。
    const btnT = easeOut((t - 0.9) / 0.3);
    if (btnT > 0) {
        const selected = result.menuIndex === 1 ? 'back' : 'retry';
        ctx.save();
        ctx.globalAlpha = btnT;
        for (const b of L.buttons) {
            const isSel = b.id === selected;
            drawWafuCard(ctx, b.x, b.y + (1 - btnT) * 10 * uiS, b.w, b.h, {
                radius: 10 * uiS,
                selected: isSel,
                pulse: isSel ? (0.5 + Math.sin(Date.now() * 0.005) * 0.5) : 0,
                bgAlpha: 0.95
            });
            ctx.font = `700 ${Math.round(17 * fs)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = isSel ? '#ffffff' : 'rgba(206, 226, 255, 0.8)';
            fillTextInkCentered(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + (1 - btnT) * 10 * uiS);
        }
        ctx.restore();
        // タッチ端末には操作説明を出さない。ボタンが2つ並んでいる画面で
        // 「ボタンに触れて決定」は見れば分かることを言っているだけだった
        // (実機フィードバック 2026-08-11。昇段画面の「札に触れて決定」と同じ)。
        if (!isTouchOverlayMode()) {
            drawScreenManualLine(ctx, '←→：選択 | SPACE：決定', Math.min(CANVAS_HEIGHT - 14, L.buttonsBottom + 46 * uiS));
        }
    }
    ctx.restore();
}

// 昇段画面のレイアウト単一導出。描画(renderLevelUpChoiceScreen)とタップ判定
// (game.updateLevelUpChoice)が同じ矩形を読む（座標式の複製はヒットずれの元）。
// パネルは常に画面上下中央（スマホでも持ち上げない。操作ボタンと重なってよい
// ＝昇段中はタップ選択のみでパッド操作を受けない、と実機フィードバック 2026-08-10）。
// design-px(1920×1080基準)の値と、タップ判定用の canvas-px 矩形の両方を返す。
export function getLevelUpChoiceLayout(count) {
    const S = Math.min(SCREEN_WIDTH / 1920, CANVAS_HEIGHT / 1080);
    const OX = (SCREEN_WIDTH - 1920 * S) / 2;
    const CARD_K = 1.5;
    const GAP = 40, HEAD_H = 116, GAP_HEAD_CARD = 50;
    const CARD_W = 300 * CARD_K, CARD_H = 284 * CARD_K;   // design-px（拡大後）
    const totalWD = count * CARD_W + Math.max(0, count - 1) * GAP;
    const startXD = 960 - totalWD / 2;                     // 960 = デザイン中心X
    const BLOCK_H = HEAD_H + GAP_HEAD_CARD + CARD_H;
    const blockTopD = (1080 - BLOCK_H) / 2;
    const cardTopD = blockTopD + HEAD_H + GAP_HEAD_CARD;
    const cards = [];
    for (let i = 0; i < count; i++) {
        cards.push({
            x: OX + (startXD + i * (CARD_W + GAP)) * S,
            y: cardTopD * S,
            w: CARD_W * S,
            h: CARD_H * S
        });
    }
    return { S, OX, GAP, CARD_W, CARD_H, startXD, blockTopD, cardTopD, cards };
}

export function renderLevelUpChoiceScreen(ctx, player, choices, selectedIndex = 0) {
    const time = Date.now();
    const pulse = (Math.sin(time * 0.0026) + 1) * 0.5; // 選択枠のゆっくりした明滅

    const list = Array.isArray(choices) ? choices : [];

    // デザイン正本(1920×1080)→実キャンバスへの一様スケール。
    // 可変スクリーン幅では高さ律速(=全端末で0.6667固定)にし、1920バンドを水平中央へ置く。
    const S = Math.min(SCREEN_WIDTH / 1920, CANVAS_HEIGHT / 1080);
    const d = (v) => v * S;            // design-px → canvas-px（寸法・縦座標）
    const OX = (SCREEN_WIDTH - 1920 * S) / 2; // 水平センタリングオフセット（W=1280で0）
    const dx = (v) => OX + d(v);       // 水平座標専用（寸法には使わない）
    const CXD = 960;                   // デザイン中心X(1920/2)
    const lw = (v) => Math.max(1, d(v)); // 罫線は最低1px

    // カードだけ「一回り大きく」＋中身も比例拡大。dk/lwk はカード内寸法・文字用。
    const CARD_K = 1.5;
    const dk = (v) => v * S * CARD_K;
    const lwk = (v) => Math.max(1, dk(v));
    // カード内テキストの物理サイズアンカー: スマホ(uiScale>1)では文字だけ拡大する。
    // カードのボックス・位置・pips は dk() のまま据え置き（右の仮想パッドと衝突させない）。
    // PC/iPad は uiScale=1 で dkt===dk＝従来と完全一致。
    const textScale = getUiScale();
    const dkt = (v) => dk(v) * textScale;
    const lerp = (a, b, t) => a + (b - a) * t;

    // --- 角丸パス（キャンバス座標） ---
    const roundedRectPath = (x, y, w, h, r) => {
        const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    };

    // --- 字間つきテキスト（canvas には letter-spacing が無いので文字ごとに描く） ---
    const measureLS = (text, lsPx) => {
        const chars = [...String(text)];
        if (!chars.length) return 0;
        let w = 0;
        for (const c of chars) w += ctx.measureText(c).width;
        return w + lsPx * (chars.length - 1); // 字間は文字間のみ（末尾には付けない）
    };
    const fillLS = (text, x, y, lsPx, align = 'center') => {
        const chars = [...String(text)];
        if (!chars.length) return;
        const ws = chars.map((c) => ctx.measureText(c).width);
        const total = ws.reduce((a, b) => a + b, 0) + lsPx * (chars.length - 1);
        let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
        const prevAlign = ctx.textAlign;
        ctx.textAlign = 'left';
        for (let i = 0; i < chars.length; i++) { ctx.fillText(chars[i], px, y); px += ws[i] + lsPx; }
        ctx.textAlign = prevAlign;
    };

    // --- 説明文の折返し（中央寄せ用に行配列を返す。maxWidth はキャンバスpx） ---
    const wrapTextLines = (text, maxWidth, maxLines = 2) => {
        const src = String(text || '').trim();
        if (!src) return [];
        const chars = [...src];
        const lines = [];
        let line = '';
        for (const ch of chars) {
            const test = line + ch;
            if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
            if (line) lines.push(line);
            line = ch;
            if (lines.length >= maxLines) break;
        }
        if (lines.length < maxLines && line) lines.push(line);
        return lines.slice(0, maxLines);
    };

    // --- レイアウト（getLevelUpChoiceLayout と単一導出。タップ判定も同じ矩形を読む） ---
    const { GAP, CARD_W, CARD_H, startXD, blockTopD, cardTopD } = getLevelUpChoiceLayout(list.length);

    // --- 選択 transition（amt[i]:0..1）を実時間でイージング（≈0.25sで収束） ---
    let dt = (time - _levelUpCardAnim.last) / 1000;
    _levelUpCardAnim.last = time;
    // 初回表示／再表示（描画が途切れた）／枚数変化 は補間せず即座に確定（CSSのmount相当）
    if (_levelUpCardAnim.amt.length !== list.length || !(dt >= 0) || dt > 0.25) {
        _levelUpCardAnim.amt = list.map((_, i) => (i === selectedIndex ? 1 : 0));
        dt = 0;
    }
    const ease = 1 - Math.exp(-Math.min(dt, 0.1) / 0.07);
    const amt = _levelUpCardAnim.amt;
    for (let i = 0; i < list.length; i++) {
        amt[i] += ((i === selectedIndex ? 1 : 0) - amt[i]) * ease;
    }

    ctx.save();

    // ===== 暗幕（没入感・背後の実ゲーム画面が透ける） =====
    ctx.fillStyle = 'rgba(2, 6, 20, 0.66)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    // ===== 見出し =====
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // 昇段（900 / 80px / 字間.16em / 青いソフトシャドウ）
    ctx.fillStyle = '#f7fbff';
    ctx.font = `900 ${d(80)}px "Zen Old Mincho", serif`;
    ctx.save();
    ctx.shadowColor = 'rgba(70, 120, 210, 0.4)';
    ctx.shadowBlur = d(32);
    ctx.shadowOffsetY = d(4);
    fillLS('昇段', dx(CXD), d(blockTopD + 66), d(0.16 * 80), 'center');
    ctx.restore();

    // 強化を選択（500 / 22px / 字間.42em）＋ 左右の細い罫線
    ctx.font = `500 ${d(22)}px "Zen Old Mincho", serif`;
    ctx.fillStyle = 'rgba(206, 226, 255, 0.88)';
    const subLs = d(0.42 * 22);
    const subBaseY = d(blockTopD + 110);
    const subHalf = measureLS('強化を選択', subLs) / 2;
    fillLS('強化を選択', dx(CXD), subBaseY, subLs, 'center');

    const ruleW = d(48), ruleGapX = d(16);
    const ruleY = subBaseY - d(5); // 15px テキストの視覚中心あたり
    const cxc = dx(CXD);
    ctx.lineWidth = lw(1);
    // 左罫線（外→内で透明→水色）
    const lInner = cxc - subHalf - ruleGapX, lOuter = lInner - ruleW;
    let g = ctx.createLinearGradient(lOuter, 0, lInner, 0);
    g.addColorStop(0, 'rgba(142, 200, 255, 0)');
    g.addColorStop(1, 'rgba(142, 200, 255, 0.7)');
    ctx.strokeStyle = g;
    ctx.beginPath(); ctx.moveTo(lOuter, ruleY); ctx.lineTo(lInner, ruleY); ctx.stroke();
    // 右罫線
    const rInner = cxc + subHalf + ruleGapX, rOuter = rInner + ruleW;
    g = ctx.createLinearGradient(rInner, 0, rOuter, 0);
    g.addColorStop(0, 'rgba(142, 200, 255, 0.7)');
    g.addColorStop(1, 'rgba(142, 200, 255, 0)');
    ctx.strokeStyle = g;
    ctx.beginPath(); ctx.moveTo(rInner, ruleY); ctx.lineTo(rOuter, ruleY); ctx.stroke();

    // ===== カード =====
    const tierLabels = ['初級', '中級', '上級', '特級'];

    list.forEach((choice, index) => {
        const a = amt[index];                           // 選択度 0..1（イージング済み）
        const xD = startXD + index * (CARD_W + GAP);
        const x = dx(xD), w = dk(300), h = dk(284), r = dk(9);
        const y = d(cardTopD) - dk(4) * a;              // translateY(-4px) を補間
        const cx = x + w / 2;

        const isDuration = Number.isFinite(choice.durationSec);
        const level = choice.level || 0;
        const maxLevel = choice.maxLevel || 3;

        // 本体（控えめ・低彩度の縦グラデ）
        const bg = ctx.createLinearGradient(x, y, x, y + h);
        bg.addColorStop(0, 'rgba(33, 42, 68, 0.96)');
        bg.addColorStop(1, 'rgba(23, 30, 52, 0.97)');

        // 影／グロー（黒の柔らかい影→青グローを a で補間。浮かせすぎない）
        ctx.save();
        ctx.shadowBlur = dk(lerp(34, 44, a));
        ctx.shadowColor = `rgba(${lerp(0, 74, a) | 0}, ${lerp(0, 134, a) | 0}, ${lerp(0, 236, a) | 0}, ${lerp(0.28, 0.26 + pulse * 0.12, a).toFixed(3)})`;
        ctx.shadowOffsetY = dk(lerp(6, 0, a));
        roundedRectPath(x, y, w, h, r);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.restore();

        // 上部の淡いシーン（クリスプな上端＝光源感）
        ctx.save();
        roundedRectPath(x, y, w, h, r);
        ctx.clip();
        const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.42);
        sheen.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
        sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(x, y, w, h * 0.42);
        ctx.restore();

        // ヘアライン枠（淡→明 を a で補間）
        roundedRectPath(x, y, w, h, r);
        ctx.strokeStyle = `rgba(${lerp(146, 150, a) | 0}, ${lerp(172, 196, a) | 0}, ${lerp(226, 255, a) | 0}, ${lerp(0.22, 0.6 + pulse * 0.25, a).toFixed(3)})`;
        ctx.lineWidth = lwk(lerp(1, 1.5, a));
        ctx.stroke();

        // 上辺の細い青アクセント
        ctx.save();
        roundedRectPath(x, y, w, h, r);
        ctx.clip();
        const acc = ctx.createLinearGradient(x, 0, x + w, 0);
        acc.addColorStop(0, 'rgba(142, 200, 255, 0)');
        acc.addColorStop(0.5, `rgba(142, 200, 255, ${lerp(0.5, 0.9, a).toFixed(3)})`);
        acc.addColorStop(1, 'rgba(142, 200, 255, 0)');
        ctx.fillStyle = acc;
        ctx.fillRect(x, y, w, dk(2));
        ctx.restore();

        // タイトル（900 28px 字間.04em 中央）
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff';
        // タイトルは元々読めるサイズなので拡大しない（dk のまま）
        ctx.font = `900 ${dk(28)}px "Zen Old Mincho", serif`;
        fillLS(choice.title || '', cx, y + dk(60), dk(0.04 * 28), 'center');

        // 区切り線（幅56・中央・青の淡グラデ）
        const divHalf = dk(56) / 2;
        const divY = y + dk(90);
        const dg = ctx.createLinearGradient(cx - divHalf, 0, cx + divHalf, 0);
        dg.addColorStop(0, 'rgba(180, 205, 255, 0)');
        dg.addColorStop(0.5, 'rgba(180, 205, 255, 0.55)');
        dg.addColorStop(1, 'rgba(180, 205, 255, 0)');
        ctx.strokeStyle = dg;
        ctx.lineWidth = lwk(1);
        ctx.beginPath(); ctx.moveTo(cx - divHalf, divY); ctx.lineTo(cx + divHalf, divY); ctx.stroke();

        // 説明（500 15px・中央・最大2行・行高1.7）
        ctx.font = `500 ${dkt(15)}px "Zen Old Mincho", serif`;
        ctx.fillStyle = 'rgba(216, 230, 255, 0.82)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lineH = dkt(15 * 1.7);
        const subMid = y + dk(130);
        const lines = wrapTextLines(choice.subtitle || '', w - dk(60), 2);
        if (lines.length <= 1) {
            ctx.fillText(lines[0] || '', cx, subMid);
        } else {
            lines.forEach((ln, i) => ctx.fillText(ln, cx, subMid - lineH / 2 + i * lineH));
        }
        ctx.textBaseline = 'alphabetic';

        // ===== フッター（上端から固定オフセット：混在しても揃う） =====
        const footLineY = y + dk(171);
        const footMid = y + dk(212);
        ctx.strokeStyle = 'rgba(150, 178, 232, 0.18)';
        ctx.lineWidth = lwk(1);
        ctx.beginPath(); ctx.moveTo(x + dk(30), footLineY); ctx.lineTo(x + w - dk(30), footLineY); ctx.stroke();

        if (isDuration) {
            // 効果時間（ラベル＋数値＋秒 を横1行・中央）
            ctx.textBaseline = 'middle';
            const label = '効果時間', valNum = String(choice.durationSec), valUnit = '秒';
            const labelLs = dkt(0.12 * 13);
            ctx.font = `500 ${dkt(13)}px "Zen Old Mincho", serif`;
            const labelW = measureLS(label, labelLs);
            ctx.font = `700 ${dkt(21)}px "Zen Old Mincho", serif`;
            const numW = ctx.measureText(valNum).width;
            ctx.font = `500 ${dkt(13)}px "Zen Old Mincho", serif`;
            const unitW = ctx.measureText(valUnit).width;
            const innerGap = dk(10), unitGap = dk(2);
            const totalRowW = labelW + innerGap + numW + unitGap + unitW;
            let tx = cx - totalRowW / 2;

            ctx.font = `500 ${dkt(13)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = 'rgba(180, 200, 236, 0.7)';
            fillLS(label, tx, footMid, labelLs, 'left');
            tx += labelW + innerGap;

            ctx.textAlign = 'left';
            ctx.font = `700 ${dkt(21)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = '#c4e8ff';
            ctx.fillText(valNum, tx, footMid);
            tx += numW + unitGap;

            ctx.font = `500 ${dkt(13)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = 'rgba(196, 232, 255, 0.7)';
            ctx.fillText(valUnit, tx, footMid + dk(2));

            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
        } else {
            // ピップ（maxLevel個・48×9・中央）＋段位ラベル（縦に2段、フッター中央寄せ）
            const pipW = dk(48), pipH = dk(9), pipGap = dk(8);
            const pipsTotalW = maxLevel * pipW + (maxLevel - 1) * pipGap;
            const pipsX = cx - pipsTotalW / 2;
            const pipsY = footMid - dk(20);
            for (let p = 0; p < maxLevel; p++) {
                const gx = pipsX + p * (pipW + pipGap);
                roundedRectPath(gx, pipsY, pipW, pipH, dk(2)); // トラック
                ctx.fillStyle = 'rgba(210, 225, 255, 0.16)';
                ctx.fill();
                if (p < level) {
                    // 点灯
                    const gg = ctx.createLinearGradient(gx, 0, gx + pipW, 0);
                    gg.addColorStop(0, '#6fb6ff');
                    gg.addColorStop(1, '#a9d8ff');
                    roundedRectPath(gx, pipsY, pipW, pipH, dk(2));
                    ctx.fillStyle = gg;
                    ctx.fill();
                } else if (p === level) {
                    // 次に上がる枠（リング＋淡いグロー）
                    ctx.save();
                    ctx.shadowBlur = dk(9);
                    ctx.shadowColor = 'rgba(142, 200, 255, 0.6)';
                    roundedRectPath(gx - dk(2), pipsY - dk(2), pipW + dk(4), pipH + dk(4), dk(3));
                    ctx.strokeStyle = '#8ec8ff';
                    ctx.lineWidth = lwk(1.5);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            // 段位ラベル（700 16px 字間.05em・ピップ下 margin15）
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#cfe2ff';
            // 段位ラベルは拡大しない（dk のまま）
            ctx.font = `700 ${dk(16)}px "Zen Old Mincho", serif`;
            const cur = tierLabels[Math.min(level, 3)];
            const nxt = tierLabels[Math.min(level + 1, 3)];
            fillLS(`${cur} → ${nxt}`, cx, pipsY + pipH + dk(15) + dk(13), dk(0.05 * 16), 'center');
        }

    });

    // ===== 操作説明（通常マニュアルと同サイズ・カード直下に配置） =====
    // タッチ端末には出さない。札が3枚並んでいる画面で「札に触れて決定」は
    // 見れば分かることを言っているだけだった(実機フィードバック 2026-08-11)。
    // キーボードは押す先が見えないので残す。
    if (!isTouchOverlayMode()) {
        drawScreenManualLine(ctx, '←→：選択 | SPACE：決定', d(cardTopD + CARD_H + 50 + 24));
    }

    ctx.restore();
}

function renderWafuuCinematicBackdrop(ctx, timer, variant = 'opening') {
    const time = timer * 0.001;
    const hash01 = (n) => {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
        return s - Math.floor(s);
    };

    // 夜（opening）と夜明け（ending）でトーンを切り替える
    const palette = variant === 'ending'
        ? {
            skyTop: '#261d2c',
            skyMid: '#7c5044',
            skyBottom: '#d8ae72',
            upperGlow: 'rgba(255, 182, 122, 0.2)',
            horizonGlow: 'rgba(255, 214, 156, 0.36)',
            orbCore: 'rgba(255, 244, 220, 0.95)',
            orbGlow: 'rgba(255, 228, 170, 0.65)',
            orbRing: 'rgba(255, 236, 200, 0.46)',
            farMountain: 'rgba(56, 34, 38, 0.56)',
            nearMountain: 'rgba(36, 22, 30, 0.78)',
            ridgeLine: 'rgba(230, 184, 132, 0.22)',
            shrine: 'rgba(76, 30, 30, 0.88)',
            shrineEdge: 'rgba(248, 212, 168, 0.2)',
            fog: 'rgba(255, 236, 194, 0.15)',
            petalRgb: '255, 220, 198',
            particleRgb: '255, 214, 164',
            streak: 'rgba(255, 206, 152, 0.14)'
        }
        : {
            skyTop: '#030917',
            skyMid: '#101a39',
            skyBottom: '#1b1734',
            upperGlow: 'rgba(122, 176, 255, 0.16)',
            horizonGlow: 'rgba(122, 160, 240, 0.2)',
            orbCore: 'rgba(238, 246, 255, 0.93)',
            orbGlow: 'rgba(170, 204, 255, 0.44)',
            orbRing: 'rgba(176, 208, 255, 0.32)',
            farMountain: 'rgba(10, 14, 31, 0.62)',
            nearMountain: 'rgba(6, 10, 24, 0.84)',
            ridgeLine: 'rgba(124, 162, 230, 0.16)',
            shrine: 'rgba(38, 16, 24, 0.9)',
            shrineEdge: 'rgba(176, 206, 255, 0.14)',
            fog: 'rgba(170, 196, 250, 0.1)',
            petalRgb: '186, 214, 255',
            particleRgb: '198, 224, 255',
            streak: 'rgba(146, 186, 255, 0.12)'
        };

    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.5, palette.skyMid);
    sky.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    const upperGlow = ctx.createRadialGradient(
        SCREEN_WIDTH * 0.72, CANVAS_HEIGHT * 0.12, 30,
        SCREEN_WIDTH * 0.72, CANVAS_HEIGHT * 0.12, SCREEN_WIDTH * 0.78
    );
    upperGlow.addColorStop(0, palette.upperGlow);
    upperGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = upperGlow;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    const horizonGlow = ctx.createLinearGradient(0, CANVAS_HEIGHT * 0.42, 0, CANVAS_HEIGHT);
    horizonGlow.addColorStop(0, 'rgba(255,255,255,0)');
    horizonGlow.addColorStop(0.5, palette.horizonGlow);
    horizonGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, CANVAS_HEIGHT * 0.42, SCREEN_WIDTH, CANVAS_HEIGHT * 0.58);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
        const y = CANVAS_HEIGHT * (0.2 + i * 0.08);
        const drift = Math.sin(time * (0.24 + i * 0.07) + i * 1.1) * 70;
        const band = ctx.createLinearGradient(0, y - 30, 0, y + 32);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(0.5, palette.streak);
        band.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = band;
        ctx.beginPath();
        ctx.moveTo(-160 + drift, y + 4);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.32, y - 34, SCREEN_WIDTH * 0.64, y - 6);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.94, y + 28, SCREEN_WIDTH + 140 + drift, y - 8);
        ctx.lineTo(SCREEN_WIDTH + 140 + drift, y + 40);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.86, y + 58, SCREEN_WIDTH * 0.54, y + 18);
        ctx.quadraticCurveTo(SCREEN_WIDTH * 0.24, y - 2, -160 + drift, y + 26);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // 天体表現（stage準拠を大きめで表示）
    if (variant === 'ending') {
        drawStageStyleCelestialBody(
            ctx,
            SCREEN_WIDTH * 0.23,
            CANVAS_HEIGHT * 0.22,
            82,
            '#ffd9b4',
            '#ff7a33',
            'rgba(255, 160, 80, ALPHA)',
            1,
            4.1
        );
    } else {
        drawStageStyleCelestialBody(
            ctx,
            SCREEN_WIDTH * 0.78,
            CANVAS_HEIGHT * 0.22,
            74,
            '#f8f9fa',
            '#ced4da',
            'rgba(240, 248, 255, ALPHA)',
            1,
            3.8
        );
    }

    // 星/光塵
    const skyParticleCount = variant === 'ending' ? 36 : 56;
    for (let i = 0; i < skyParticleCount; i++) {
        const seedA = hash01(i + 0.9);
        const seedB = hash01(i * 1.8 + 3.2);
        const depth = i % 3;
        const px = (seedA * (SCREEN_WIDTH + 180) - 90 + timer * (0.002 + depth * 0.0014)) % (SCREEN_WIDTH + 180) - 90;
        const py = (seedB * (CANVAS_HEIGHT * 0.58) + Math.sin(time * (0.7 + depth * 0.22) + i * 0.8) * (6 + depth * 4));
        const twinkle = (Math.sin(time * (1.6 + depth * 0.38) + i * 1.4) + 1) * 0.5;
        const alpha = (variant === 'ending' ? 0.2 : 0.14) + twinkle * (variant === 'ending' ? 0.2 : 0.38);
        const size = 0.8 + depth * 0.6;
        ctx.fillStyle = `rgba(${palette.particleRgb}, ${alpha.toFixed(3)})`;
        ctx.fillRect(px, py, size, size);
    }

    // 遠景/近景の山
    const drawMountainLayer = (baseY, step, heightBase, heightAmp, drift, color) => {
        const shift = (timer * drift) % step;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-step - shift, CANVAS_HEIGHT);
        for (let x = -step - shift; x <= SCREEN_WIDTH + step * 1.4; x += step) {
            const peak = baseY - heightBase
                - Math.sin((x + 80) * 0.012 + time * 0.29) * heightAmp
                - Math.cos((x + 30) * 0.018 + time * 0.18) * (heightAmp * 0.45);
            ctx.lineTo(x + step * 0.34, peak);
            ctx.lineTo(x + step, baseY);
        }
        ctx.lineTo(SCREEN_WIDTH + step * 2, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();
    };

    drawMountainLayer(CANVAS_HEIGHT * 0.62, 250, 130, 34, 0.014, palette.farMountain);
    drawMountainLayer(CANVAS_HEIGHT * 0.71, 210, 104, 26, 0.02, palette.nearMountain);

    ctx.strokeStyle = palette.ridgeLine;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT * 0.64);
    for (let x = 0; x <= SCREEN_WIDTH; x += 16) {
        const y = CANVAS_HEIGHT * 0.64 + Math.sin(x * 0.012 + time * 0.2) * 10 + Math.cos(x * 0.02 + time * 0.15) * 5;
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 地平線の鳥居シルエット
    const shrineY = CANVAS_HEIGHT * 0.63;
    ctx.fillStyle = palette.shrine;
    ctx.fillRect(0, shrineY, SCREEN_WIDTH, 20);
    ctx.fillStyle = palette.shrineEdge;
    ctx.fillRect(0, shrineY - 2, SCREEN_WIDTH, 2);
    ctx.fillStyle = palette.shrine;
    for (let i = -1; i < 6; i++) {
        const gateX = 80 + i * 245 - ((timer * 0.025) % 245);
        ctx.fillRect(gateX + 8, shrineY + 12, 10, 136);
        ctx.fillRect(gateX + 98, shrineY + 12, 10, 136);
        ctx.fillRect(gateX - 3, shrineY - 8, 124, 10);
        ctx.fillRect(gateX + 6, shrineY - 16, 106, 8);
    }

    // 霧レイヤー
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
        const fogY = CANVAS_HEIGHT * (0.64 + i * 0.1);
        const fogShift = Math.sin(time * (0.66 + i * 0.15) + i * 1.1) * 90;
        const fogW = 280 + i * 108;
        const fogH = 76 + i * 12;
        for (let j = -1; j < 5; j++) {
            const cx = j * fogW * 0.72 + fogShift - fogW * 0.28;
            const grad = ctx.createRadialGradient(cx, fogY, fogW * 0.08, cx, fogY, fogW * 0.56);
            grad.addColorStop(0, palette.fog);
            grad.addColorStop(0.54, palette.fog.replace(/[\d.]+\)$/u, `${(i === 0 ? 0.085 : 0.055).toFixed(3)})`));
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(cx, fogY, fogW, fogH, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();

    // 花弁/粉雪の粒子
    const particleCount = variant === 'ending' ? 38 : 52;
    for (let i = 0; i < particleCount; i++) {
        const seedA = hash01(i + 1.3);
        const seedB = hash01(i * 1.7 + 5.1);
        const seedC = hash01(i * 2.3 + 9.7);
        const layer = i % 4;
        const pattern = i % 6;

        const spanX = SCREEN_WIDTH + 260;
        const spanY = CANVAS_HEIGHT + 320;
        const baseX = seedA * spanX - 130;
        const baseY = seedB * spanY - 160;
        const fallSpeed = (variant === 'ending' ? 0.026 : 0.031) + layer * 0.004 + seedC * 0.011;
        const driftSpeed = 0.014 + layer * 0.003 + seedA * 0.006;
        const driftAmp = 20 + layer * 8 + seedB * 13;
        const swirlAmp = 6 + seedC * 10;
        const size = 2.8 + layer * 1.0 + seedA * 1.6;

        const py = (baseY + timer * fallSpeed) % spanY - 160;
        const sway = Math.sin(time * (0.8 + driftSpeed) + i * 0.77) * driftAmp;
        const swirl = Math.cos(time * (1.2 + seedC * 0.7) + i * 0.41) * swirlAmp;
        const px = (baseX + timer * (0.006 + layer * 0.0015) + sway + swirl + spanX) % spanX - 130;
        const rot = (time * (0.45 + seedA * 1.2) + i * 0.61) % (Math.PI * 2);
        const alpha = 0.32 + seedB * 0.48;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.fillStyle = `rgba(${palette.petalRgb}, ${alpha.toFixed(3)})`;
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 0.7;

        if (pattern === 0) {
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 1.2, size * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (pattern === 1) {
            ctx.beginPath();
            ctx.moveTo(-size * 0.9, 0);
            ctx.quadraticCurveTo(-size * 0.12, -size * 0.85, size * 0.95, 0);
            ctx.quadraticCurveTo(-size * 0.06, size * 0.88, -size * 0.9, 0);
            ctx.fill();
        } else if (pattern === 2) {
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 0.9, size * 0.34, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (pattern === 3) {
            ctx.beginPath();
            ctx.ellipse(-size * 0.35, 0, size * 0.7, size * 0.3, -0.2, 0, Math.PI * 2);
            ctx.ellipse(size * 0.35, 0, size * 0.7, size * 0.3, 0.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (pattern === 4) {
            ctx.beginPath();
            ctx.moveTo(-size * 0.8, -size * 0.16);
            ctx.lineTo(size * 0.86, 0);
            ctx.lineTo(-size * 0.8, size * 0.16);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.ellipse(0, 0, size, size * 0.42, 0.32, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-size * 0.7, 0);
            ctx.lineTo(size * 0.7, 0);
            ctx.stroke();
        }

        ctx.restore();
    }

    // 周辺減光
    const vignette = ctx.createRadialGradient(
        SCREEN_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, SCREEN_WIDTH * 0.14,
        SCREEN_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, SCREEN_WIDTH * 0.82
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, variant === 'ending' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.44)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
}

function renderWafuuMessagePanel(ctx, timer, variant = 'opening') {
    // テキスト配置ガイドのみ返す（パネル背景・枠は描画しない）
    const panelY = CANVAS_HEIGHT * 0.14;
    const panelW = SCREEN_WIDTH * 0.74;
    const panelH = CANVAS_HEIGHT * 0.7;
    const panelX = (SCREEN_WIDTH - panelW) * 0.5;
    void ctx;
    void timer;
    void variant;
    return { panelX, panelY, panelW, panelH };
}

// イントロ（ストーリー紹介）画面
export function renderIntro(ctx, timer) {
    drawCinematicBgImage(ctx, 'opening', timer);  // 画像背景（読込前は暗色の下地。旧背景は出さない）
    const panel = renderWafuuMessagePanel(ctx, timer, 'opening');

    const lines = [
        '時は戦国。',
        '群雄割拠の乱世に、一人のくノ一が立ち上がった。',
        '',
        'その名は、カエデ。',
        '亡き主君の遺志を継ぎ、天下を平らげるため、',
        '彼女は難攻不落の城へと向かう。',
        '',
        '立ちふさがるは、六人の強者達。',
        'すべての刃を折り、日の本を一つにせよ。'
    ];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 22px serif';
    const textTop = panel.panelY + 36;
    const textBottom = panel.panelY + panel.panelH - 48;
    const lineHeight = (textBottom - textTop) / Math.max(1, lines.length - 1);

    lines.forEach((line, i) => {
        const lineStartTime = i * 780;
        const alpha = Math.max(0, Math.min(1, (timer - lineStartTime) / 900));
        const rise = Math.max(0, 1 - alpha) * 12;
        ctx.fillStyle = `rgba(244, 248, 255, ${alpha})`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 7;
        ctx.fillText(line, SCREEN_WIDTH / 2, textTop + i * lineHeight + rise);
    });
    ctx.shadowBlur = 0;

    // 締めの一行は「突破」「天下統一」と同じ体裁（drawOutcomePrompt：字格・Y・明滅を共有）。
    drawOutcomePrompt(
        ctx,
        'Press SPACE or Tap Screen to Skip',
        timer,
        CANVAS_HEIGHT - 48,
        Math.max(0, Math.min(1, (timer - 1000) / 260))
    );
}

// エンディング画面
export function renderEnding(ctx, timer) {
    drawCinematicBgImage(ctx, 'ending', timer);  // 画像背景（読込前は暗色の下地。旧背景は出さない）
    const panel = renderWafuuMessagePanel(ctx, timer, 'ending');

    const lines = [
        '幾多の戦を越え、将軍を討ち果たした。',
        '乱世は終わり、城下に朝日が差し込む。',
        '',
        '刃を収めたカエデは、静かに空を見上げた。',
        '名を残さず、ただ平穏だけをこの地に残して。',
        '',
        '天下は一つとなり、新たな時代が始まる。'
    ];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 22px serif';
    const textTop = panel.panelY + 36;
    const textBottom = panel.panelY + panel.panelH - 48;
    const lineHeight = (textBottom - textTop) / Math.max(1, lines.length - 1);

    lines.forEach((line, i) => {
        const lineStartTime = i * 880;
        const alpha = Math.max(0, Math.min(1, (timer - lineStartTime) / 1000));
        const rise = Math.max(0, 1 - alpha) * 10;
        ctx.fillStyle = `rgba(255, 247, 234, ${alpha})`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.58)';
        ctx.shadowBlur = 7;
        ctx.fillText(line, SCREEN_WIDTH / 2, textTop + i * lineHeight + rise);
    });
    ctx.shadowBlur = 0;

    // 締めの一行は「突破」「天下統一」と同じ体裁（drawOutcomePrompt：字格・Y・明滅を共有）。
    drawOutcomePrompt(
        ctx,
        'Press SPACE or Tap Screen to Return to Title',
        timer,
        CANVAS_HEIGHT - 48,
        Math.max(0, Math.min(1, (timer - 1200) / 260))
    );
}

// ポーズ画面
// ポーズ中の「タイトルに戻る」ボタン。ポーズはキャプチャ(スクショ)用途のため、
// 画面中央のキャプチャ対象を邪魔しないよう画面下端中央に控えめに配置する。
// 描画と当たり判定で同じ座標を使うため、この単一の関数を双方が参照する。
export function getPauseReturnButton() {
    // 画面最下端だとセーフエリア等でタップできないため、下部の操作ボタン(攻撃)の
    // 中心Yに合わせて押せる帯に置く。x は中央（操作ボタンは左右端なので中央は空き）。
    // uiScale 追従のため攻撃ボタンと同じ getPadLayout を参照する。
    const L = getPadLayout();
    // 幅はラベルの実寸(fontScale)にも追従させる。幾何スケールだけだと
    // スマホで文字が枠からはみ出す。
    return { x: SCREEN_WIDTH / 2, y: L.attack.y, w: 200 * Math.max(L.s, getFontScale()), h: 40 * L.s };
}

// ポーズの「地図に戻る」。タイトルに戻るの【上】へ積む。
// 中央の空きは縦にしか余裕が無い(左右は操作ボタン)ので横並びにはしない。
// canGoMap が false のときは呼び出し側で描かない/判定しない。
export function getPauseMapButton() {
    const base = getPauseReturnButton();
    const L = getPadLayout();
    return { x: base.x, y: base.y - base.h - 14 * L.s, w: base.w, h: base.h };
}

function drawPauseButton(ctx, btn, label, armed) {
    const x = btn.x - btn.w / 2;
    const y = btn.y - btn.h / 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, btn.w, btn.h, 8);
    else ctx.rect(x, y, btn.w, btn.h);
    ctx.fillStyle = armed ? 'rgba(140, 38, 38, 0.82)' : 'rgba(16, 22, 40, 0.62)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = armed ? 'rgba(255, 196, 196, 0.9)' : 'rgba(220, 200, 150, 0.7)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = `${Math.round(16 * getFontScale())}px "Zen Old Mincho", serif`;
    fillTextInkCentered(ctx, label, btn.x, btn.y);
}

export function renderPauseScreen(ctx, armed = false, options = {}) {
    if (!ctx) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // ラベル（PCはクリック表記。確認は「もう一度〜」で通常と長さを揃える）
    const actionWord = isTouchOverlayMode() ? 'タップ' : 'クリック';
    // 地図へ戻れるのは本編のステージだけ(寄り道やタイトル経由では出さない)
    if (options.canGoMap) {
        drawPauseButton(ctx, getPauseMapButton(), '地図に戻る', false);
    }
    drawPauseButton(
        ctx,
        getPauseReturnButton(),
        armed ? `もう一度${actionWord}` : 'タイトルに戻る',
        armed
    );
    ctx.restore();
}

// 全クリア画面。階層突破の「印章が確定する」構図を最終完成形へ拡張する。
export function renderGameClearScreen(ctx, timerMs = 0) {
    const time = Math.max(0, Number.isFinite(timerMs) ? timerMs : 0);
    const pulse = 0.5 + Math.sin(time * 0.003) * 0.5;
    const reveal = Math.max(0, Math.min(1, time / 760));
    const eased = 1 - Math.pow(1 - reveal, 3);
    const centerX = SCREEN_WIDTH * 0.5;
    const centerY = CANVAS_HEIGHT * 0.46;

    ctx.save();

    // 戦闘画面を残しつつ、最終勝利だけは中央から金色の朝光を広げる。
    ctx.fillStyle = `rgba(154, 104, 31, ${(0.15 + eased * 0.08 + pulse * 0.025).toFixed(3)})`;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    const grad = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, SCREEN_WIDTH * 0.62
    );
    grad.addColorStop(0, `rgba(255, 226, 146, ${(0.22 * eased + pulse * 0.05).toFixed(3)})`);
    grad.addColorStop(0.46, `rgba(233, 181, 78, ${(0.08 * eased).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
    ctx.globalCompositeOperation = 'source-over';

    // 金粉は上昇させ、敗北画面の落ちる灰と動きでも対比させる。
    for (let i = 0; i < 18; i++) {
        const cycleDuration = 4000;
        const offset = i * (cycleDuration / 18);
        const cycleProgress = ((time + offset) % cycleDuration) / cycleDuration;
        const px = centerX + Math.sin(time * 0.001 + i * 0.72) * 230;
        const py = centerY + 170 + Math.cos(time * 0.0008 + i * 0.9) * 54 - cycleProgress * 300;
        const size = 2 + Math.sin(i * 0.5) * 1.5;
        const particleAlpha = Math.sin(cycleProgress * Math.PI) * 0.30 * eased;
        ctx.fillStyle = `rgba(238, 190, 78, ${particleAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }

    drawOutcomeSealFrame(ctx, centerX, centerY, reveal, '231, 198, 123', {
        broken: false,
        time,
        radius: 164
    });

    ctx.globalAlpha = eased;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.58)';
    ctx.shadowBlur = 14;

    // 四文字は一段で読ませる。字格だけを64pxへ落とし、主見出しの中心位置と
    // 英語副題の位置は「無念」「突破」と共通にする。
    ctx.fillStyle = 'rgba(255, 247, 224, 0.98)';
    ctx.font = OUTCOME_GAME_CLEAR_FONT;
    ctx.fillText('天下統一', centerX, centerY - 22);

    ctx.font = '700 28px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 218, 108, 0.98)';
    ctx.shadowBlur = 6;
    ctx.fillText('GAME CLEAR', centerX, centerY + 94);
    ctx.restore();

    drawOutcomePrompt(
        ctx,
        'Press SPACE or Tap Screen to Continue',
        time,
        CANVAS_HEIGHT - 48,
        Math.max(0, Math.min(1, (time - 620) / 260))
    );
}

/**
 * 階層突破。戦闘画面の色を残したまま、金属の輪と印章で勝利を刻む。
 */
export function renderStageClearAnnouncement(ctx, stageNumber, weaponUnlocked, stage) {
    const time = Date.now();
    const g = (typeof window !== 'undefined' && window.game) ? window.game : null;
    const timer = (g && Number.isFinite(g.stageClearAnnounceTimer)) ? g.stageClearAnnounceTimer : 9999;

    // 各要素の表示タイミング（ms）
    // 各要素の表示タイミング(ms)。撃破からここへ来るまでに死亡演出1.25秒＋余韻0.62秒を
    // 使っているので、ここで更に待たせると「間」ではなく「空白」になる。前詰めにする。
    // game.js 側の効果音トリガー(clearDelay)とスキップ解禁(pressDelay)も同じ値に合わせる。
    const clearDelay = 380;
    const weaponDelay = 920;
    const pressDelay = 1650;

    ctx.save();
    const palette = [
        [133, 190, 146], [207, 168, 105], [174, 196, 222],
        [219, 137, 83], [205, 177, 125], [229, 176, 194]
    ][Math.max(0, Math.min(5, (Number(stageNumber) || 1) - 1))];
    const reveal = Math.max(0, Math.min(1, (timer - 80) / 520));
    const ease = 1 - Math.pow(1 - reveal, 3);
    const clearReveal = Math.max(0, Math.min(1, (timer - clearDelay) / 260));
    const centerX = SCREEN_WIDTH * 0.5;
    const centerY = CANVAS_HEIGHT * 0.46;

    // 背景を消さず、端だけ静かに落として撃破地点との連続性を残す。
    ctx.fillStyle = `rgba(4, 7, 12, ${(0.18 + ease * 0.16).toFixed(3)})`;
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    const grad = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, SCREEN_WIDTH * 0.48
    );
    grad.addColorStop(0, `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, ${(0.18 * ease).toFixed(3)})`);
    grad.addColorStop(0.48, `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, ${(0.055 * ease).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

    ctx.globalCompositeOperation = 'source-over';
    // 三種の結果画面で同じ印章骨格を使う。通常突破は銀青、
    // 最終勝利だけを金にすることで「天下統一」の格を残す。
    drawOutcomeSealFrame(ctx, centerX, centerY, reveal, '157, 197, 218', {
        broken: false,
        time,
        radius: 150
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (timer >= clearDelay) {
        const stamp = 0.88 + (1 - Math.pow(1 - clearReveal, 3)) * 0.12;
        ctx.save();
        ctx.translate(centerX, centerY - 22);
        ctx.scale(stamp, stamp);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
        ctx.shadowBlur = 12;
        ctx.font = OUTCOME_MAIN_FONT;
        ctx.fillStyle = 'rgba(232, 243, 249, 0.98)';
        ctx.fillText('突破', 0, 0);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = clearReveal;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
        ctx.shadowBlur = 6;
        ctx.font = '700 27px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'rgba(157, 210, 235, 0.96)';
        ctx.fillText('STAGE CLEAR', centerX, centerY + 57);
        ctx.restore();
    }

    if (weaponUnlocked && timer >= weaponDelay) {
        const itemT = Math.max(0, Math.min(1, (timer - weaponDelay) / 260));
        const itemEase = 1 - Math.pow(1 - itemT, 3);
        const itemW = Math.min(420, SCREEN_WIDTH - 64);
        const itemH = 92;
        const itemX = centerX - itemW * 0.5;
        const sealBottom = centerY + 150;
        const restingTop = Math.min(sealBottom + 22, CANVAS_HEIGHT - 84 - itemH);
        const itemTop = restingTop + (1 - itemEase) * 16;

        // 円とは別の情報カードとして、印章下端から必ず22px以上離す。
        // 1行に情報を詰めず「獲得種別 → 忍具名」の二段へ分ける。
        wafuRoundRectPath(ctx, itemX, itemTop, itemW, itemH, 18);
        ctx.fillStyle = `rgba(8, 13, 23, ${(0.86 * itemT).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(157, 197, 218, ${(0.66 * itemT).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const headerY = itemTop + 24;
        const dividerY = itemTop + 43;
        ctx.font = '700 14px "Zen Old Mincho", serif';
        ctx.fillStyle = `rgba(157, 210, 235, ${(0.96 * itemT).toFixed(3)})`;
        ctx.fillText('新忍具獲得', centerX, headerY);

        const divider = ctx.createLinearGradient(itemX + 34, 0, itemX + itemW - 34, 0);
        divider.addColorStop(0, 'rgba(157, 197, 218, 0)');
        divider.addColorStop(0.5, `rgba(157, 197, 218, ${(0.42 * itemT).toFixed(3)})`);
        divider.addColorStop(1, 'rgba(157, 197, 218, 0)');
        ctx.strokeStyle = divider;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(itemX + 34, dividerY);
        ctx.lineTo(itemX + itemW - 34, dividerY);
        ctx.stroke();

        ctx.font = '900 30px "Zen Old Mincho", serif';
        ctx.fillStyle = `rgba(252, 240, 205, ${itemT.toFixed(3)})`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.68)';
        ctx.shadowBlur = 7;
        ctx.fillText(String(weaponUnlocked), centerX, itemTop + 67);
        ctx.shadowBlur = 0;

        // 両端の小さな印でカード全体を突破印の意匠へ接続する。
        ctx.fillStyle = `rgba(157, 197, 218, ${(0.72 * itemT).toFixed(3)})`;
        for (const dx of [-1, 1]) {
            ctx.save();
            ctx.translate(centerX + dx * (itemW * 0.5 - 24), itemTop + itemH * 0.5);
            ctx.rotate(Math.PI * 0.25);
            ctx.fillRect(-3, -3, 6, 6);
            ctx.restore();
        }
    }

    if (timer >= pressDelay) {
        drawOutcomePrompt(
            ctx,
            'Press SPACE or Tap Screen to Continue',
            time,
            CANVAS_HEIGHT - 42,
            Math.max(0, Math.min(1, (timer - pressDelay) / 220))
        );
    }

    ctx.restore();
}
