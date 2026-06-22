// ============================================
// Unification of the Nation - UIクラス
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, VIRTUAL_PAD } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { saveManager } from './save.js';

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
const TITLE_STAR_COUNT = 100;
let _titleLogoImage = null;   // プロ制作の金紺ロゴ画像（英字＋天下統一＋筆＋装飾を内包）
let _openingBgImage = null;   // オープニング背景画像
let _endingBgImage = null;    // エンディング背景画像

// オープニング/エンディングのフルスクリーン背景画像を遅延ロードして描画（読込前は false を返す）
function drawCinematicBgImage(ctx, phase) {
    let img;
    if (phase === 'ending') {
        if (!_endingBgImage) { _endingBgImage = new Image(); _endingBgImage.src = 'images/ending_bg.png'; }
        img = _endingBgImage;
    } else {
        if (!_openingBgImage) { _openingBgImage = new Image(); _openingBgImage.src = 'images/opening_bg.png'; }
        img = _openingBgImage;
    }
    if (!img.complete || !img.naturalWidth) return false;
    // 画像は16:9でcanvasとほぼ同アスペクト → そのまま全面に
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
    return true;
}

const KANJI_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function formatMoney(value) {
    const safe = Math.max(0, Math.floor(Number(value) || 0));
    return safe.toLocaleString('ja-JP');
}

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
    const textColor = options.textColor || (focused ? '#ffffff' : 'rgba(224, 234, 255, 0.82)');

    const left = x - width * 0.5;
    const top = y - height * 0.5;

    drawWafuCard(ctx, left, top, width, height, { radius, selected: focused, pulse, accent: !accentColor });

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

function drawControlManualLine(ctx, y = CANVAS_HEIGHT - 20) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px "Zen Old Mincho", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(CONTROL_MANUAL_TEXT, CANVAS_WIDTH / 2, y);
    ctx.restore();
}

export function drawScreenManualLine(ctx, text, y = CANVAS_HEIGHT - 20) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px "Zen Old Mincho", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, CANVAS_WIDTH / 2, y);
    ctx.restore();
}

// タイトルロゴ：画像(images/title_logo.png)を描画。背後の月(後光)は renderTitleScreen 側。
function drawRichTitleLogo(ctx, timeMs) {
    const titleX = CANVAS_WIDTH / 2;
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
    const drawW = Math.round(CANVAS_WIDTH * 0.78);
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
            const travel = ((timeMs * layer.speed * 0.001) + i * (layer.w * 0.72)) % (CANVAS_WIDTH + layer.w * 1.35);
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
    ctx.fillRect(0, CANVAS_HEIGHT * 0.54, CANVAS_WIDTH, CANVAS_HEIGHT * 0.46);
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
        for (let x = -layer.step - shift; x <= CANVAS_WIDTH + layer.step * 1.5; x += layer.step) {
            const peak = layer.baseY - layer.heightBase
                - Math.sin((x + 160) * 0.011 + t * 0.33) * layer.heightAmp
                - Math.cos((x + 70) * 0.018 + t * 0.21) * (layer.heightAmp * 0.42);
            ctx.lineTo(x + layer.step * 0.38, peak);
            ctx.lineTo(x + layer.step, layer.baseY);
        }
        ctx.lineTo(CANVAS_WIDTH + layer.step * 2, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();
    }

    const shrineY = CANVAS_HEIGHT * 0.74;
    ctx.fillStyle = 'rgba(16, 9, 24, 0.82)';
    ctx.fillRect(0, shrineY, CANVAS_WIDTH, CANVAS_HEIGHT - shrineY);
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
    const centerX = CANVAS_WIDTH / 2;
    const diffY = CANVAS_HEIGHT / 2 + 64;
    const startY = diffY + 108;
    const buttonGap = 64;
    const isGameCleared = typeof saveManager !== 'undefined' && saveManager.loadGlobal().isGameCleared;
    
    return {
        centerX,
        diffY,
        characterY: isGameCleared ? diffY + 54 : null,
        startY: startY + buttonGap * 0.5,
        newGameY: startY + buttonGap * 0.5 + buttonGap,
        singleStartY: startY + buttonGap * 0.5,
        diffButton: { width: 230, height: 44 },
        actionButton: { width: 280, height: 48 }
    };
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
        const hpBarWidth = 300;
        const hpBarHeight = 18;
        const panelPadding = 18;
        const panelX = 26;
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
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        drawNumMixedText(ctx, hpStr, x + 1, y - 7, 700, 16, 'left');
        drawNumMixedText(ctx, lvStr, x + hpBarWidth + 1, y - 7, 700, 16, 'right');
        // 本体
        ctx.fillStyle = '#fff';
        drawNumMixedText(ctx, hpStr, x, y - 8, 700, 16, 'left');
        drawNumMixedText(ctx, lvStr, x + hpBarWidth, y - 8, 700, 16, 'right');
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

        ctx.font = '700 15px "Zen Old Mincho", serif';
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

        ctx.font = '700 15px "Zen Old Mincho", serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText('熟練', x + 1, expY + expBarHeight / 2 + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText('熟練', x, expY + expBarHeight / 2);
        
        // --- Stage Info + マネー（右上） ---
        const stageFloorKanji = toKanjiNumber(stage?.stageNumber || 1);
        const stageLabel = (stage && stage.name) ? stage.name : `第${stageFloorKanji}階層`;
        const stageFontPx = 16;
        const moneyFontPx = 16;
        const bgmCenterX = CANVAS_WIDTH - VIRTUAL_PAD.BGM_BUTTON_MARGIN_RIGHT;
        const bgmCenterY = VIRTUAL_PAD.BGM_BUTTON_MARGIN_TOP;
        const bgmLeftX = bgmCenterX - VIRTUAL_PAD.BGM_BUTTON_RADIUS;
        const stageRightX = bgmLeftX - 12; // BGMボタン左側に余白を確保
        const stageTextY = bgmCenterY;
        const moneyText = formatMoney(player.money);
        const coinSize = 9;

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.font = `900 ${stageFontPx}px "Zen Old Mincho", serif`;

        // ステージ名（BGMボタン左側）影を軽量化
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillText(stageLabel, stageRightX + 1, stageTextY + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(stageLabel, stageRightX, stageTextY);
        
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
            drawRoundedRectPath(slotX, slotY, slotSize, slotSize, 10);
            ctx.strokeStyle = 'rgba(180, 204, 255, 0.38)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            
            // 武器アイコン（変形なしで描画）
            this.drawWeaponIcon(ctx, slotX + slotSize/2, slotY + slotSize/2, slotSize * 0.6, player.currentSubWeapon.name);
            ctx.restore();
            
            // 武器名 (大きく)
            ctx.fillStyle = '#fff';
            ctx.font = '700 15px "Zen Old Mincho", serif';
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
                ctx.font = '700 12px "Zen Old Mincho", serif';
                ctx.fillStyle = row.color;
                ctx.fillText(row.label, boxX + insetX, yy);
                ctx.font = '800 12px "Helvetica Neue", Arial, sans-serif';
                ctx.fillStyle = 'rgba(235, 245, 255, 0.95)';
                ctx.textAlign = 'right';
                ctx.fillText(`${row.sec}s`, boxX + boxW - insetX, yy);
                ctx.textAlign = 'left';
            });
            ctx.restore();
        }
        
        // 仮想パッド
        this.renderVirtualPad(ctx, player);
    }
    
    // 小判アイコンの描画
    drawKoban(ctx, x, y, size) {
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
        if (this.isTouchOverlayEnabled() && !input.hasPhysicalKeyboard) return;
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
        const isTouchDevice = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return isTouchDevice || isMobile || CANVAS_WIDTH <= 800;
    }

    renderGlobalTouchButtons(ctx) {
        const pad = VIRTUAL_PAD;
        const bgmButtonX = CANVAS_WIDTH - pad.BGM_BUTTON_MARGIN_RIGHT;
        const bgmButtonY = pad.BGM_BUTTON_MARGIN_TOP;
        this.drawBgmToggleButton(ctx, bgmButtonX, bgmButtonY, pad.BGM_BUTTON_RADIUS, !!audio.isMuted);
    }
    
    renderVirtualPad(ctx, player) {
        // PC（タッチ非対応かつ幅広）は非表示
        if (!this.isTouchOverlayEnabled()) return;

        ctx.save();
        ctx.setLineDash([]);
        
        const pad = VIRTUAL_PAD;
        const bottomY = CANVAS_HEIGHT - pad.BOTTOM_MARGIN;
        
        // --- 左側：アナログスティック ---
        const leftX = pad.SAFE_MARGIN_X;
        const stickCenterX = leftX + pad.STICK.x;
        const stickCenterY = bottomY + pad.STICK.y;
        const stickState = input.getVirtualStickState();
        this.drawAnalogStick(
            ctx,
            stickCenterX,
            stickCenterY,
            pad.STICK_BASE_RADIUS,
            pad.STICK_KNOB_RADIUS,
            stickState.knobX,
            stickState.knobY,
            stickState.active
        );

        // 左スティック左下：一時停止ボタン（小）
        const pauseX = stickCenterX + (pad.PAUSE_BUTTON?.x || 0);
        const pauseY = stickCenterY + (pad.PAUSE_BUTTON?.y || 0);
        const pauseRadius = pad.PAUSE_BUTTON_RADIUS || 22;
        this.drawActionCircleButton(
            ctx, pauseX, pauseY, pauseRadius, 'pause', input.isAction('PAUSE')
        );
        
        // --- 右側：アクションキー（ダイヤ配置・円ボタン） ---
        const rightX = CANVAS_WIDTH - pad.SAFE_MARGIN_X;
        const attackRadius = pad.ATTACK_BUTTON_RADIUS || pad.BUTTON_SIZE;
        const auxRadius = pad.AUX_BUTTON_RADIUS || pad.BUTTON_SIZE;
        const isSpecialReady = !!player && Number.isFinite(player.specialGauge) && Number.isFinite(player.maxSpecialGauge)
            ? player.specialGauge >= player.maxSpecialGauge
            : true;

        this.drawActionCircleButton(
            ctx, rightX + pad.ATTACK.x, bottomY + pad.ATTACK.y, attackRadius, 'attack', input.isAction('ATTACK')
        );
        this.drawActionCircleButton(
            ctx, rightX + pad.SUB_WEAPON.x, bottomY + pad.SUB_WEAPON.y, auxRadius, 'sub', input.isAction('SUB_WEAPON')
        );
        
        if (isSpecialReady) {
            const t = Date.now() * 0.005;
            const pulse = (Math.sin(t) + 1) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(rightX + pad.SPECIAL.x, bottomY + pad.SPECIAL.y, auxRadius + 4 + pulse * 6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 210, 80, ${0.15 + pulse * 0.25})`;
            ctx.fill();
            ctx.restore();
        }

        this.drawActionCircleButton(
            ctx, rightX + pad.SPECIAL.x, bottomY + pad.SPECIAL.y, auxRadius, 'special', input.isAction('SPECIAL'), !isSpecialReady
        );
        this.drawActionCircleButton(
            ctx, rightX + pad.SWITCH.x, bottomY + pad.SWITCH.y, auxRadius, 'switch', input.isAction('SWITCH_WEAPON')
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

    // 武器アイコンの簡略化描画
    drawWeaponIcon(ctx, x, y, size, name) {
        ctx.save();
        ctx.translate(x, y);

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

    // 背景（夜空 + 光彩）
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#081328');
    gradient.addColorStop(0.26, '#12274f');
    gradient.addColorStop(0.58, '#1d3a64');
    gradient.addColorStop(1, '#0b1626');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const skyGlow = ctx.createRadialGradient(
        CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.28, 24,
        CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.28, CANVAS_WIDTH * 0.66
    );
    skyGlow.addColorStop(0, 'rgba(150, 196, 255, 0.26)');
    skyGlow.addColorStop(0.45, 'rgba(92, 142, 228, 0.14)');
    skyGlow.addColorStop(1, 'rgba(58, 98, 180, 0)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // フィルムグレイン（空のバンディングを抑え質感を出す・軽量）
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.globalCompositeOperation = 'overlay';
    const grain = getTitleGrainCanvas();
    const gs = grain.width * 3;
    for (let gx = 0; gx < CANVAS_WIDTH; gx += gs) {
        for (let gy = 0; gy < CANVAS_HEIGHT; gy += gs) ctx.drawImage(grain, gx, gy, gs, gs);
    }
    ctx.restore();

    // 天頂の薄い光帯
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const skyBandCount = 3;
    for (let i = 0; i < skyBandCount; i++) {
        const bandY = CANVAS_HEIGHT * (0.16 + i * 0.1);
        const bandW = CANVAS_WIDTH * (1.25 - i * 0.1);
        const drift = Math.sin(t * (0.22 + i * 0.08) + i * 1.4) * 90;
        const bandGrad = ctx.createLinearGradient(0, bandY - 36, 0, bandY + 36);
        bandGrad.addColorStop(0, 'rgba(130, 181, 255, 0)');
        bandGrad.addColorStop(0.5, `rgba(130, 181, 255, ${0.1 - i * 0.02})`);
        bandGrad.addColorStop(1, 'rgba(130, 181, 255, 0)');
        ctx.fillStyle = bandGrad;
        ctx.beginPath();
        ctx.moveTo(-120 + drift, bandY);
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.34, bandY - 34, CANVAS_WIDTH * 0.64, bandY - 8);
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.88, bandY + 26, bandW + drift, bandY - 8);
        ctx.lineTo(bandW + drift, bandY + 44);
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.88, bandY + 56, CANVAS_WIDTH * 0.6, bandY + 20);
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.3, bandY - 8, -120 + drift, bandY + 28);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // 星空（旧挙動: 右上→左下）
    for (let i = 0; i < TITLE_STAR_COUNT; i++) {
        const x = (i * 137.5 - time * 0.02) % CANVAS_WIDTH;
        const y = (i * 219.7 + time * 0.01) % CANVAS_HEIGHT;
        const finalX = x < 0 ? x + CANVAS_WIDTH : x;
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
    const starStartX = (starSeed * 543) % (CANVAS_WIDTH + 400);
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

    // 月（中央上に大きく配置：ロゴの後光。天下統一に被らないよう高めに）
    drawTitleMoon(ctx, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 160, 150, time);  // ロゴと相対固定のままグループごと下げ(上下の余白を揃える)

    // 靄・前景
    drawTitleMistLayers(ctx, time);

    // ビネット（周辺減光で中央へ視線誘導・映画的な没入感）
    {
        const vig = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.44, CANVAS_HEIGHT * 0.46, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.82);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(0.82, 'rgba(0, 0, 0, 0.05)');
        vig.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // タイトルロゴ
    drawRichTitleLogo(ctx, time);

    // 難易度選択
    const layout = getTitleScreenLayout(hasSave);
    const diffY = layout.diffY;
    
    // 左右の矢印 (削除済み)

    
    // 現在の難易度ボタン（紺カード＋難易度色のアクセント／文字色）
    const pulse = (Math.sin(time * 0.0026) + 1) * 0.5;
    let diffColor = '#e7c45a'; // Normal（金）
    if (currentDifficulty && currentDifficulty.id === 'easy') diffColor = '#7fd08a';
    if (currentDifficulty && currentDifficulty.id === 'hard') diffColor = '#e08a8a';
    const globalData = saveManager.loadGlobal();
    drawRoundedFlatTitleButton(
        ctx,
        layout.centerX,
        diffY,
        layout.diffButton.width,
        layout.diffButton.height,
        currentDifficulty ? currentDifficulty.name : '普 (NORMAL)',
        { accentColor: diffColor, textColor: diffColor, font: '700 21px "Zen Old Mincho", serif', pulse }
    );

    // 開始ボタン
    const startY = layout.startY;
    const actionW = layout.actionButton.width;
    const actionH = layout.actionButton.height;
    const isCleared = globalData.isGameCleared;

    if (hasSave) {
        drawRoundedFlatTitleButton(ctx, layout.centerX, startY,          actionW, actionH, '続きから', { focused: titleMenuIndex === 0, pulse });
        drawRoundedFlatTitleButton(ctx, layout.centerX, layout.newGameY, actionW, actionH, '最初から', { focused: titleMenuIndex === 1, pulse });
    } else if (isCleared) {
        drawRoundedFlatTitleButton(ctx, layout.centerX, startY,          actionW, actionH, '出陣', { focused: titleMenuIndex === 0, pulse });
        drawRoundedFlatTitleButton(ctx, layout.centerX, layout.newGameY, actionW, actionH, '出陣', { focused: titleMenuIndex === 1, pulse });
    } else {
        drawRoundedFlatTitleButton(ctx, layout.centerX, layout.singleStartY, actionW, actionH, '出陣', { focused: true, pulse });
    }
    
    // 不要な描画コード削除
    

    
    // 右下デバッグモードヒント（⚙アイコン）
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(time * 0.002) * 0.08;
    ctx.font = '24px "Zen Old Mincho", serif';
    ctx.fillStyle = '#aabbcc';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('⚙', CANVAS_WIDTH - 18, CANVAS_HEIGHT - 14);
    ctx.restore();

    // タイトル画面用の操作説明
    drawScreenManualLine(ctx, TITLE_MANUAL_TEXT);
}

export function renderTitleDebugWindow(ctx, entries = [], cursor = 0) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const panelW = 540;
    const panelX = CANVAS_WIDTH - panelW - 40;
    const rowH = 26;
    const headerH = 40;
    const spacingH = 10;
    const entriesCount = entries.length;
    const panelH = headerH + spacingH + entriesCount * rowH + 10;
    const panelY = Math.max(10, Math.round((CANVAS_HEIGHT - panelH) / 2));
    const maxRows = entriesCount; 
    const clampedCursor = Math.max(0, Math.min(entries.length - 1, cursor));
    const start = Math.max(0, Math.min(clampedCursor - Math.floor(maxRows / 2), Math.max(0, entries.length - maxRows)));
    const end = Math.min(entries.length, start + maxRows);

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 18, 0.88)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const bg = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    bg.addColorStop(0, 'rgba(24, 38, 84, 0.96)');
    bg.addColorStop(1, 'rgba(10, 18, 42, 0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(178, 205, 255, 0.6)';
    ctx.lineWidth = 1.8;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    
    // タイトルを削除し、操作説明のみを上部に小さく表示
    ctx.font = '500 12px "Zen Old Mincho", serif';
    ctx.fillStyle = 'rgba(212, 228, 255, 0.85)';
    ctx.fillText('↑↓：項目 | ←→：変更 | SPACE：決定 | ESC：閉じる', panelX + 24, panelY + 28);

    // 操作説明と最初の項目の間の境界線/余白
    ctx.strokeStyle = 'rgba(212, 228, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(panelX + 20, panelY + 40);
    ctx.lineTo(panelX + panelW - 20, panelY + 40);
    ctx.stroke();

    const listStartY = panelY + 65; // 余白をもう少し設ける
    const boxH = rowH - 4;

    ctx.textBaseline = 'middle';
    for (let i = start; i < end; i++) {
        const row = i - start;
        const y = listStartY + row * rowH;
        const selected = i === clampedCursor;
        if (selected) {
            // アクティブ枠
            ctx.fillStyle = 'rgba(98, 142, 235, 0.42)';
            ctx.fillRect(panelX + 16, y - boxH / 2, panelW - 32, boxH);
            ctx.strokeStyle = 'rgba(211, 228, 255, 0.92)';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(panelX + 16, y - boxH / 2, panelW - 32, boxH);
        }
        const entry = entries[i];
        
        ctx.textAlign = 'left';
        ctx.fillStyle = selected ? '#ffffff' : 'rgba(225, 236, 255, 0.92)';
        ctx.font = selected ? '700 13px "Zen Old Mincho", serif' : '500 13px "Zen Old Mincho", serif';
        ctx.fillText(entry.label || '', panelX + 30, y);

        ctx.textAlign = 'right';
        const valText = (typeof entry.getValue === 'function') ? entry.getValue() : (entry.value || '');
        const isActionRow = entry.action || valText === '実行';
        ctx.fillStyle = isActionRow ? '#ffe08d' : (selected ? '#dff0ff' : 'rgba(198, 216, 246, 0.92)');
        ctx.font = selected ? '700 13px "Zen Old Mincho", serif' : '500 13px "Zen Old Mincho", serif';
        ctx.fillText(valText, panelX + panelW - 30, y);
    }

    ctx.restore();
}

// ゲームオーバー画面（リッチ化）
export function renderGameOverScreen(ctx, player, stageNumber, fadeTimer = 0) {
    // 表示開始からの経過時間を使用（ループさせない）
    const time = fadeTimer;
    
    // 背景はgame.js側で制御
    
    // GAME OVER テキスト（一度きりのフェードイン）
    const fadeDuration = 1500;
    const fadeProgress = Math.min(1, time / fadeDuration);
    
    // パーティクルエフェクト（散りゆく灰 - 滑らかにループ）
    const loopTime = Date.now();
    for (let i = 0; i < 15; i++) {
        const cycleDuration = 4000;
        const offset = i * (cycleDuration / 15);
        const cycleProgress = ((loopTime + offset) % cycleDuration) / cycleDuration;
        
        const px = CANVAS_WIDTH/2 + Math.sin(loopTime * 0.001 + i * 0.7) * 200;
        const py = CANVAS_HEIGHT/2 - 100 + Math.cos(loopTime * 0.0008 + i * 0.9) * 100 + cycleProgress * 120;
        const size = 2 + Math.sin(i * 0.5) * 1.5;
        
        // sin波で滑らかにフェードイン・アウト
        const particleAlpha = Math.sin(cycleProgress * Math.PI) * 0.4;
        
        ctx.fillStyle = 'rgba(150, 50, 50, ' + (particleAlpha * fadeProgress) + ')';
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.globalAlpha = fadeProgress;
    ctx.fillStyle = 'rgba(255, 51, 51, 1)';
    ctx.font = 'bold 80px serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#500';
    ctx.shadowBlur = 20;
    ctx.fillText('無 念', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    
    ctx.font = 'bold 40px serif';
    ctx.fillStyle = 'rgba(204, 0, 0, 1)';
    ctx.shadowBlur = 0;
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    
    // 続行メッセージ（画面中央寄りに配置）
    if (fadeProgress >= 1.0) {
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        if (blink) {
            ctx.font = 'bold 20px "Zen Old Mincho", serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText('Press SPACE or Tap Screen to Return to Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80);
            ctx.shadowBlur = 0;
        }
    }
    ctx.globalAlpha = 1.0;

    // タップ用ボタン
    drawFlatButton(ctx, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80, 400, 60, '', 'rgba(0, 0, 0, 0)');
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
    const { radius = 10, selected = false, pulse = 0, accent = true, shadow = true } = opts;

    // 影／グロー（モダン：大きめブラー・低不透明・浮かせすぎない）
    if (shadow || selected) {
        ctx.save();
        ctx.shadowColor = selected ? `rgba(74, 134, 236, ${0.24 + pulse * 0.12})` : 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = selected ? 30 : 18;
        ctx.shadowOffsetY = selected ? 0 : 5;
        wafuRoundRectPath(ctx, x, y, w, h, radius);
        ctx.fillStyle = 'rgba(18, 24, 44, 1)';
        ctx.fill();
        ctx.restore();
    }

    // 本体（控えめ・やや低彩度の縦グラデ）
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(33, 42, 68, 0.96)');
    bg.addColorStop(1, 'rgba(23, 30, 52, 0.97)');
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
    ctx.strokeStyle = selected ? `rgba(150, 196, 255, ${0.6 + pulse * 0.25})` : 'rgba(146, 172, 226, 0.22)';
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();

    // 上辺の細い青アクセント
    if (accent) {
        ctx.save();
        wafuRoundRectPath(ctx, x, y, w, h, radius);
        ctx.clip();
        const a = ctx.createLinearGradient(x, 0, x + w, 0);
        a.addColorStop(0, 'rgba(142, 200, 255, 0)');
        a.addColorStop(0.5, `rgba(142, 200, 255, ${selected ? 0.9 : 0.5})`);
        a.addColorStop(1, 'rgba(142, 200, 255, 0)');
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

    const panelW = CANVAS_WIDTH;
    const rightColX = 880;
    const rightColW = panelW - rightColX - 40;

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
            // モダンな紺：少し明るめの下地＋広いアンビエント光（暗くなりすぎない）
            ctx.fillStyle = '#141d34';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            const glow = ctx.createRadialGradient(CANVAS_WIDTH * 0.44, CANVAS_HEIGHT * 0.34, 0, CANVAS_WIDTH * 0.44, CANVAS_HEIGHT * 0.34, CANVAS_WIDTH * 0.92);
            glow.addColorStop(0, 'rgba(66, 96, 168, 0.42)');
            glow.addColorStop(1, 'rgba(66, 96, 168, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        if (!drawUi) {
            return;
        }

        // --- 右：情報パネル ---
        const infoPanelX = rightColX - 18;
        const infoPanelY = 96;
        const infoPanelW = rightColW + 4;
        const rowInset = 18;
        const rowX = infoPanelX + rowInset;
        const rowW = infoPanelW - rowInset * 2;
        const rowStartY = infoPanelY + 30;
        const rowH = 38;
        const menuY = CANVAS_HEIGHT - 140;

        const statRows = [
            { label: '段位', value: `${toKanjiNumber(player.level)}段`, color: '#ffffff' },
            { label: '体力', value: `${player.maxHp}`, color: '#ff8a8a' },
            { label: '小判', value: `${formatMoney(player.money)}枚`, color: '#ffd96b' },
            { label: '剛力', value: `${(player.attackPower || 1.0).toFixed(1)}倍`, color: '#ffbe8a' },
            { label: '韋駄天', value: player.permanentDash ? '習得済' : '未習得', color: '#8ef0b6' },
            { label: '跳躍', value: `${toKanjiNumber(player.maxJumps || 1)}段`, color: '#8ec8ff' }
        ];

        const statsBottomY = rowStartY + statRows.length * rowH;
        const cardY = statsBottomY + 18;
        const cardGap = 12;
        const cardW = (rowW - cardGap * 2) / 3;
        const cardH = 110;
        const infoPanelBottom = Math.min(cardY + cardH + 18, menuY - 22);
        const infoPanelH = infoPanelBottom - infoPanelY;

        drawWafuCard(ctx, infoPanelX, infoPanelY, infoPanelW, infoPanelH, { radius: 12, pulse });

        // ステータス行（ラベル左／値右＋細い区切り線）
        statRows.forEach((row, i) => {
            const centerY = rowStartY + i * rowH + rowH / 2;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(206, 222, 255, 0.7)';
            ctx.font = '500 16px "Zen Old Mincho", serif';
            ctx.fillText(row.label, rowX + 4, centerY);

            ctx.fillStyle = row.color;
            drawNumMixedText(ctx, row.value, rowX + rowW - 4, centerY, 700, 19, 'right');

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
            drawWafuCard(ctx, x, cardY, cardW, cardH, { radius: 8, accent: false, shadow: false });

            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(216, 230, 255, 0.9)';
            ctx.font = '700 14px "Zen Old Mincho", serif';
            ctx.fillText(card.title, x + cardW / 2, cardY + 28);

            ctx.fillStyle = '#cfe2ff';
            ctx.font = '700 18px "Zen Old Mincho", serif';
            ctx.fillText(card.detail, x + cardW / 2, cardY + 58);

            const pipW = 20, pipH = 6, pipGap = 7;
            const pipsW = 3 * pipW + 2 * pipGap;
            drawWafuPips(ctx, x + cardW / 2 - pipsW / 2, cardY + 78, pipW, pipH, pipGap, card.level, 3);
        });

        // --- 下部：メニュー ---
        const menuStartX = 40;
        const menuRightX = infoPanelX + infoPanelW;
        const menuGap = 20;
        const menuW = (menuRightX - menuStartX - menuGap * 2) / 3;
        const menuH = 80;

        menuItems.forEach((item, i) => {
            const selected = i === menuIndex;
            const x = menuStartX + i * (menuW + menuGap);
            const y = menuY - (selected ? 4 : 0);
            drawWafuCard(ctx, x, y, menuW, menuH, { radius: 10, selected, pulse });

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = selected ? '#ffffff' : 'rgba(224, 234, 255, 0.82)';
            ctx.font = `700 22px "Zen Old Mincho", serif`;
            ctx.fillText(item.title, x + menuW / 2, y + menuH / 2);
        });
        ctx.textBaseline = 'alphabetic';

        // 操作説明はタイトル画面と同じ見た目・位置に統一
        drawScreenManualLine(ctx, '←→：選択 | SPACE：決定 | ↑↓：装備切替');

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
 *   そのため全寸法を「design-px(1920基準)」で記述し、S=CANVAS_WIDTH/1920 で一様スケールして描く
 *   （= どの解像度でも案1と同じ比率になる）。見出し＋カードは1ブロックとして画面上下中央へ。
 * - カードは CARD_K 倍に拡大（中身の寸法・文字も比例。dk()/lwk() を使用）。
 * - 選択/解除は CSS transition 相当を _levelUpCardAnim でフレーム間イージング（持ち上げ・枠・影・発光）。
 * - Canvas には letter-spacing が無いため、字間は文字ごと描画(fillLS)で再現。
 * - CANVAS_WIDTH / CANVAS_HEIGHT は constants.js からの import を利用。
 */
export function renderLevelUpChoiceScreen(ctx, player, choices, selectedIndex = 0) {
    const time = Date.now();
    const pulse = (Math.sin(time * 0.0026) + 1) * 0.5; // 選択枠のゆっくりした明滅

    const list = Array.isArray(choices) ? choices : [];

    // デザイン正本(1920×1080)→実キャンバスへの一様スケール（16:9前提）。
    const S = CANVAS_WIDTH / 1920;
    const d = (v) => v * S;            // design-px → canvas-px（見出し・全体レイアウト）
    const CXD = 960;                   // デザイン中心X(1920/2)
    const lw = (v) => Math.max(1, d(v)); // 罫線は最低1px

    // カードだけ「一回り大きく」＋中身も比例拡大。dk/lwk はカード内寸法・文字用。
    const CARD_K = 1.5;
    const dk = (v) => v * S * CARD_K;
    const lwk = (v) => Math.max(1, dk(v));
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

    // --- レイアウト寸法（design-px / 1920基準。カードは CARD_K 倍。GAP/見出しは据え置き） ---
    const GAP = 40, HEAD_H = 116, GAP_HEAD_CARD = 50;
    const CARD_W = 300 * CARD_K, CARD_H = 284 * CARD_K; // design-px（拡大後）
    const totalWD = list.length * CARD_W + Math.max(0, list.length - 1) * GAP;
    const startXD = CXD - totalWD / 2;
    const BLOCK_H = HEAD_H + GAP_HEAD_CARD + CARD_H;
    const blockTopD = (1080 - BLOCK_H) / 2;       // 見出し＋カードを画面上下中央へ
    const cardTopD = blockTopD + HEAD_H + GAP_HEAD_CARD;

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
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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
    fillLS('昇段', d(CXD), d(blockTopD + 66), d(0.16 * 80), 'center');
    ctx.restore();

    // 強化を選択（500 / 22px / 字間.42em）＋ 左右の細い罫線
    ctx.font = `500 ${d(22)}px "Zen Old Mincho", serif`;
    ctx.fillStyle = 'rgba(206, 226, 255, 0.88)';
    const subLs = d(0.42 * 22);
    const subBaseY = d(blockTopD + 110);
    const subHalf = measureLS('強化を選択', subLs) / 2;
    fillLS('強化を選択', d(CXD), subBaseY, subLs, 'center');

    const ruleW = d(48), ruleGapX = d(16);
    const ruleY = subBaseY - d(5); // 15px テキストの視覚中心あたり
    const cxc = d(CXD);
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
        const x = d(xD), w = dk(300), h = dk(284), r = dk(9);
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
        ctx.font = `500 ${dk(15)}px "Zen Old Mincho", serif`;
        ctx.fillStyle = 'rgba(216, 230, 255, 0.82)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lineH = dk(15 * 1.7);
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
            const labelLs = dk(0.12 * 13);
            ctx.font = `500 ${dk(13)}px "Zen Old Mincho", serif`;
            const labelW = measureLS(label, labelLs);
            ctx.font = `700 ${dk(21)}px "Zen Old Mincho", serif`;
            const numW = ctx.measureText(valNum).width;
            ctx.font = `500 ${dk(13)}px "Zen Old Mincho", serif`;
            const unitW = ctx.measureText(valUnit).width;
            const innerGap = dk(10), unitGap = dk(2);
            const totalRowW = labelW + innerGap + numW + unitGap + unitW;
            let tx = cx - totalRowW / 2;

            ctx.font = `500 ${dk(13)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = 'rgba(180, 200, 236, 0.7)';
            fillLS(label, tx, footMid, labelLs, 'left');
            tx += labelW + innerGap;

            ctx.textAlign = 'left';
            ctx.font = `700 ${dk(21)}px "Zen Old Mincho", serif`;
            ctx.fillStyle = '#c4e8ff';
            ctx.fillText(valNum, tx, footMid);
            tx += numW + unitGap;

            ctx.font = `500 ${dk(13)}px "Zen Old Mincho", serif`;
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
            ctx.font = `700 ${dk(16)}px "Zen Old Mincho", serif`;
            const cur = tierLabels[Math.min(level, 3)];
            const nxt = tierLabels[Math.min(level + 1, 3)];
            fillLS(`${cur} → ${nxt}`, cx, pipsY + pipH + dk(15) + dk(13), dk(0.05 * 16), 'center');
        }

    });

    // ===== 操作説明（通常マニュアルと同サイズ・カード直下に配置） =====
    drawScreenManualLine(ctx, '←→：選択 | SPACE：決定', d(cardTopD + CARD_H + GAP_HEAD_CARD));

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
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const upperGlow = ctx.createRadialGradient(
        CANVAS_WIDTH * 0.72, CANVAS_HEIGHT * 0.12, 30,
        CANVAS_WIDTH * 0.72, CANVAS_HEIGHT * 0.12, CANVAS_WIDTH * 0.78
    );
    upperGlow.addColorStop(0, palette.upperGlow);
    upperGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = upperGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const horizonGlow = ctx.createLinearGradient(0, CANVAS_HEIGHT * 0.42, 0, CANVAS_HEIGHT);
    horizonGlow.addColorStop(0, 'rgba(255,255,255,0)');
    horizonGlow.addColorStop(0.5, palette.horizonGlow);
    horizonGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, CANVAS_HEIGHT * 0.42, CANVAS_WIDTH, CANVAS_HEIGHT * 0.58);

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
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.32, y - 34, CANVAS_WIDTH * 0.64, y - 6);
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.94, y + 28, CANVAS_WIDTH + 140 + drift, y - 8);
        ctx.lineTo(CANVAS_WIDTH + 140 + drift, y + 40);
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.86, y + 58, CANVAS_WIDTH * 0.54, y + 18);
        ctx.quadraticCurveTo(CANVAS_WIDTH * 0.24, y - 2, -160 + drift, y + 26);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // 天体表現（stage準拠を大きめで表示）
    if (variant === 'ending') {
        drawStageStyleCelestialBody(
            ctx,
            CANVAS_WIDTH * 0.23,
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
            CANVAS_WIDTH * 0.78,
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
        const px = (seedA * (CANVAS_WIDTH + 180) - 90 + timer * (0.002 + depth * 0.0014)) % (CANVAS_WIDTH + 180) - 90;
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
        for (let x = -step - shift; x <= CANVAS_WIDTH + step * 1.4; x += step) {
            const peak = baseY - heightBase
                - Math.sin((x + 80) * 0.012 + time * 0.29) * heightAmp
                - Math.cos((x + 30) * 0.018 + time * 0.18) * (heightAmp * 0.45);
            ctx.lineTo(x + step * 0.34, peak);
            ctx.lineTo(x + step, baseY);
        }
        ctx.lineTo(CANVAS_WIDTH + step * 2, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();
    };

    drawMountainLayer(CANVAS_HEIGHT * 0.62, 250, 130, 34, 0.014, palette.farMountain);
    drawMountainLayer(CANVAS_HEIGHT * 0.71, 210, 104, 26, 0.02, palette.nearMountain);

    ctx.strokeStyle = palette.ridgeLine;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT * 0.64);
    for (let x = 0; x <= CANVAS_WIDTH; x += 16) {
        const y = CANVAS_HEIGHT * 0.64 + Math.sin(x * 0.012 + time * 0.2) * 10 + Math.cos(x * 0.02 + time * 0.15) * 5;
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 地平線の鳥居シルエット
    const shrineY = CANVAS_HEIGHT * 0.63;
    ctx.fillStyle = palette.shrine;
    ctx.fillRect(0, shrineY, CANVAS_WIDTH, 20);
    ctx.fillStyle = palette.shrineEdge;
    ctx.fillRect(0, shrineY - 2, CANVAS_WIDTH, 2);
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

        const spanX = CANVAS_WIDTH + 260;
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
        CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.14,
        CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.82
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, variant === 'ending' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.44)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function renderWafuuMessagePanel(ctx, timer, variant = 'opening') {
    // テキスト配置ガイドのみ返す（パネル背景・枠は描画しない）
    const panelY = CANVAS_HEIGHT * 0.14;
    const panelW = CANVAS_WIDTH * 0.74;
    const panelH = CANVAS_HEIGHT * 0.7;
    const panelX = (CANVAS_WIDTH - panelW) * 0.5;
    void ctx;
    void timer;
    void variant;
    return { panelX, panelY, panelW, panelH };
}

// イントロ（ストーリー紹介）画面
export function renderIntro(ctx, timer) {
    if (!drawCinematicBgImage(ctx, 'opening')) renderWafuuCinematicBackdrop(ctx, timer, 'opening');  // 画像背景（読込前は従来の和風背景）
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
        ctx.fillText(line, CANVAS_WIDTH / 2, textTop + i * lineHeight + rise);
    });
    ctx.shadowBlur = 0;

    if (timer > 1000) {
        const blink = Math.sin(Date.now() / 170) > 0;
        if (blink) {
            ctx.font = 'bold 20px "Zen Old Mincho", serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Press SPACE or Tap Screen to Skip', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 66);
        }
    }
}

// エンディング画面
export function renderEnding(ctx, timer) {
    if (!drawCinematicBgImage(ctx, 'ending')) renderWafuuCinematicBackdrop(ctx, timer, 'ending');  // 画像背景（読込前は従来の和風背景）
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
        ctx.fillText(line, CANVAS_WIDTH / 2, textTop + i * lineHeight + rise);
    });
    ctx.shadowBlur = 0;

    if (timer > 1200) {
        const blink = Math.sin(Date.now() / 170) > 0;
        if (blink) {
            ctx.font = 'bold 20px "Zen Old Mincho", serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Press SPACE or Tap Screen to Return to Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 66);
        }
    }
}

// ポーズ画面
export function renderPauseScreen() {
    // ... (既存のコード) ...
}

// 全クリア画面（通常ステージクリアと同等の透け感で重ねる）
export function renderGameClearScreen(ctx, timerMs = 0) {
    const time = Number.isFinite(timerMs) ? timerMs : 0;
    const pulse = 0.5 + Math.sin(time * 0.003) * 0.5;

    // 通常ステージクリア寄りの半透明オーバーレイ
    ctx.fillStyle = `rgba(180, 132, 54, ${0.2 + pulse * 0.06})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const grad = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.72
    );
    grad.addColorStop(0, `rgba(255, 226, 146, ${0.24 + pulse * 0.08})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();

    // 金粉パーティクル（透け感を維持）
    for (let i = 0; i < 15; i++) {
        const cycleDuration = 4000;
        const offset = i * (cycleDuration / 15);
        const cycleProgress = ((time + offset) % cycleDuration) / cycleDuration;
        const px = CANVAS_WIDTH / 2 + Math.sin(time * 0.001 + i * 0.72) * 200;
        const py = CANVAS_HEIGHT / 2 - 100 + Math.cos(time * 0.0008 + i * 0.9) * 100 + cycleProgress * 120;
        const size = 2 + Math.sin(i * 0.5) * 1.5;
        const particleAlpha = Math.sin(cycleProgress * Math.PI) * 0.28;
        ctx.fillStyle = `rgba(238, 190, 78, ${particleAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.58)';
    ctx.shadowBlur = 10;

    ctx.fillStyle = 'rgba(255, 247, 224, 0.98)';
    ctx.font = 'bold 80px serif';
    ctx.fillText('天下統一', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);

    ctx.font = 'bold 40px serif';
    ctx.fillStyle = 'rgba(255, 218, 108, 0.98)';
    ctx.fillText('GAME CLEAR', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

    if (Math.floor(time / 500) % 2 === 0) {
        ctx.font = 'bold 20px "Zen Old Mincho", serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
        ctx.fillText('Press SPACE or Tap Screen to Continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80);
    }
    ctx.shadowBlur = 0;
}

/**
 * 階層クリア時の演出画面（緑色の明るいオーバーレイと大きな文字）
 */
export function renderStageClearAnnouncement(ctx, stageNumber, weaponUnlocked, stage) {
    const time = Date.now();
    const g = (typeof window !== 'undefined' && window.game) ? window.game : null;
    const timer = (g && Number.isFinite(g.stageClearAnnounceTimer)) ? g.stageClearAnnounceTimer : 9999;
    const stageStr = Number.isFinite(stageNumber) ? toKanjiNumber(stageNumber) : stageNumber;

    // 各要素の表示タイミング（ms）
    const stageNameDelay = 300;
    const clearDelay = 800;
    const weaponDelay = 1400;
    const pressDelay = 2400;

    ctx.save();

    // 緑っぽく明るい背景
    ctx.fillStyle = 'rgba(60, 180, 100, 0.25)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const grad = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7
    );
    grad.addColorStop(0, 'rgba(120, 255, 180, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = grad;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;

    const centerY = CANVAS_HEIGHT / 2 - 40;

    // ステージ名（バン！）
    if (timer >= stageNameDelay) {
        const stageName = (stage && stage.name) ? stage.name : `第${stageStr}階層`;
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 42px serif';
        ctx.fillText(stageName, CANVAS_WIDTH / 2, centerY - 100);
    }

    // 「突破」（バン！）
    if (timer >= clearDelay) {
        ctx.font = '700 110px serif';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('突 破', CANVAS_WIDTH / 2, centerY);
    }

    // 新忍具獲得テキスト（バン！）
    if (weaponUnlocked && timer >= weaponDelay) {
        ctx.font = '700 30px "Zen Old Mincho", serif';
        ctx.fillStyle = '#ffeb3b';
        ctx.fillText(`新忍具「${weaponUnlocked}」を獲得！`, CANVAS_WIDTH / 2, centerY + 120);
    }

    ctx.shadowBlur = 0;

    // 続行メッセージ（演出完了後に表示）
    if (timer >= pressDelay) {
        const blink = Math.floor(time / 500) % 2 === 0;
        if (blink) {
            ctx.font = '600 20px "Zen Old Mincho", serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillText('Press SPACE or Tap to View Status', CANVAS_WIDTH / 2, centerY + 200);
        }
    }

    ctx.restore();
}
