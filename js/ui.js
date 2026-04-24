// ============================================
// Unification of the Nation - UIクラス
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, VIRTUAL_PAD } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';

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
let cachedTitleLogoSprite = null;
let cachedTitleLogoCanvasWidth = null;
let cachedTitleLogoMetricWidth = null;

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
    ctx.font = 'bold 20px sans-serif';
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
    const fill = options.fill || 'rgba(30, 34, 46, 0.84)';
    const border = options.border || 'rgba(220, 230, 255, 0.32)';
    const textColor = options.textColor || '#f3f7ff';
    const radius = Number.isFinite(options.radius) ? options.radius : 14;
    const font = options.font || '700 20px sans-serif';

    const left = x - width * 0.5;
    const top = y - height * 0.5;
    ctx.save();
    drawRoundedRectPath(ctx, left, top, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    drawRoundedRectPath(ctx, left, top, width, height, radius);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (label) {
        ctx.fillStyle = textColor;
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
    }
    ctx.restore();
}

function drawControlManualLine(ctx, y = CANVAS_HEIGHT - 20) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(CONTROL_MANUAL_TEXT, CANVAS_WIDTH / 2, y);
    ctx.restore();
}

export function drawScreenManualLine(ctx, text, y = CANVAS_HEIGHT - 20) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, CANVAS_WIDTH / 2, y);
    ctx.restore();
}

function createTitleLogoSprite(measureCtx) {
    if (typeof document === 'undefined') return null;

    const brushFamily = '"Rock Salt","Yuji Boku","Yusei Magic","Hiragino Mincho ProN","Yu Mincho",cursive';
    const subtitleFamily = '"Yuji Mai","Yuji Syuku","Yuji Boku","Yusei Magic","Hiragino Mincho ProN","Yu Mincho",cursive';
    const titleText = 'Unification of the Nation';
    const subtitleText = '天下統一';
    const maxTitleWidth = CANVAS_WIDTH * 0.88;
    const baseTitleSize = 80;
    const minTitleSize = 34;
    const subtitleSize = 44;
    const ornamentLen = 196;
    const subtitleYOffset = 74;
    const ornamentYOffset = subtitleYOffset + 40;

    let titleSize = baseTitleSize;
    measureCtx.save();
    while (titleSize > minTitleSize) {
        measureCtx.font = `700 ${titleSize}px ${brushFamily}`;
        if (measureCtx.measureText(titleText).width <= maxTitleWidth) break;
        titleSize -= 2;
    }
    measureCtx.font = `700 ${titleSize}px ${brushFamily}`;
    const titleMetrics = measureCtx.measureText(titleText);
    const titleWidth = titleMetrics.width;
    const titleAsc = titleMetrics.actualBoundingBoxAscent || titleSize * 0.82;
    const titleDesc = titleMetrics.actualBoundingBoxDescent || titleSize * 0.3;
    const titleStrokeWidth = Math.max(2.8, titleSize * 0.064);

    measureCtx.font = `400 ${subtitleSize}px ${subtitleFamily}`;
    const subtitleMetrics = measureCtx.measureText(subtitleText);
    const subtitleWidth = subtitleMetrics.width;
    const subtitleDesc = subtitleMetrics.actualBoundingBoxDescent || subtitleSize * 0.26;
    measureCtx.restore();

    const spriteW = Math.ceil(Math.max(
        titleWidth + titleStrokeWidth * 2 + 56,
        subtitleWidth + 96,
        ornamentLen * 2 + 76
    ));
    const titleBaselineY = Math.ceil(titleAsc + 28);
    const subtitleY = titleBaselineY + subtitleYOffset;
    const ornamentY = titleBaselineY + ornamentYOffset;
    const spriteH = Math.ceil(Math.max(
        titleBaselineY + titleDesc + 22,
        subtitleY + subtitleDesc + 16,
        ornamentY + 16
    ));

    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1, 2);
    const sprite = document.createElement('canvas');
    sprite.width = Math.max(1, Math.round(spriteW * dpr));
    sprite.height = Math.max(1, Math.round(spriteH * dpr));

    const sctx = sprite.getContext('2d');
    if (!sctx) return null;
    sctx.scale(dpr, dpr);
    sctx.textAlign = 'center';
    sctx.textBaseline = 'alphabetic';

    const drawX = spriteW / 2;
    const titleGradient = sctx.createLinearGradient(0, titleBaselineY - 90, 0, titleBaselineY + 28);
    titleGradient.addColorStop(0, '#fff7df');
    titleGradient.addColorStop(0.42, '#f2d293');
    titleGradient.addColorStop(0.78, '#d8a65b');
    titleGradient.addColorStop(1, '#a47234');

    sctx.font = `700 ${titleSize}px ${brushFamily}`;
    sctx.lineJoin = 'bevel';
    sctx.miterLimit = 1.4;
    sctx.strokeStyle = 'rgba(8, 5, 14, 0.92)';
    sctx.lineWidth = titleStrokeWidth;
    sctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
    sctx.shadowBlur = 8;
    sctx.strokeText(titleText, drawX, titleBaselineY);
    sctx.shadowBlur = 0;

    const jitterPasses = 2;
    for (let i = 0; i < jitterPasses; i++) {
        const jitterX = Math.sin(i * 1.3) * (0.9 + i * 0.22);
        const jitterY = Math.cos(i * 1.6) * (0.7 + i * 0.18);
        const smearAlpha = 0.1 - i * 0.028;
        sctx.fillStyle = `rgba(26, 17, 20, ${Math.max(0.04, smearAlpha)})`;
        sctx.fillText(titleText, drawX + jitterX, titleBaselineY + jitterY);
    }
    sctx.fillStyle = titleGradient;
    sctx.fillText(titleText, drawX, titleBaselineY);
    sctx.strokeStyle = 'rgba(255, 245, 221, 0.38)';
    sctx.lineWidth = 0.8;
    sctx.strokeText(titleText, drawX, titleBaselineY - 1);

    sctx.font = `400 ${subtitleSize}px ${subtitleFamily}`;
    sctx.lineJoin = 'bevel';
    sctx.miterLimit = 1.4;
    sctx.shadowColor = 'rgba(84, 130, 220, 0.28)';
    sctx.shadowBlur = 2;
    sctx.lineWidth = 1.2;
    sctx.strokeStyle = 'rgba(10, 12, 20, 0.72)';
    sctx.strokeText(subtitleText, drawX, subtitleY);
    sctx.fillStyle = '#d9e8ff';
    sctx.fillText(subtitleText, drawX, subtitleY);
    sctx.shadowBlur = 0;

    sctx.strokeStyle = 'rgba(229, 203, 142, 0.78)';
    sctx.lineWidth = 2.4;
    sctx.lineCap = 'round';
    sctx.beginPath();
    sctx.moveTo(drawX - 34, ornamentY);
    sctx.quadraticCurveTo(drawX - 104, ornamentY - 5, drawX - ornamentLen, ornamentY + 2);
    sctx.moveTo(drawX + 34, ornamentY);
    sctx.quadraticCurveTo(drawX + 104, ornamentY + 5, drawX + ornamentLen, ornamentY - 1);
    sctx.stroke();

    sctx.fillStyle = 'rgba(240, 218, 165, 0.92)';
    sctx.beginPath();
    sctx.moveTo(drawX - 20, ornamentY);
    sctx.lineTo(drawX, ornamentY - 10);
    sctx.lineTo(drawX + 20, ornamentY);
    sctx.lineTo(drawX, ornamentY + 10);
    sctx.closePath();
    sctx.fill();

    return {
        image: sprite,
        anchorX: spriteW * 0.5,
        anchorY: titleBaselineY,
        drawWidth: spriteW,
        drawHeight: spriteH
    };
}

function drawRichTitleLogo(ctx, timeMs) {
    const titleX = CANVAS_WIDTH / 2;
    const titleY = CANVAS_HEIGHT / 2 - 120;
    const titleRenderY = titleY + Math.sin(timeMs * 0.0017) * 0.5;
    const probeFont = 80;
    const brushFamily = '"Rock Salt","Yuji Boku","Yusei Magic","Hiragino Mincho ProN","Yu Mincho",cursive';

    ctx.save();
    ctx.font = `700 ${probeFont}px ${brushFamily}`;
    const metricWidth = Math.round(ctx.measureText('Unification of the Nation').width);
    ctx.restore();

    const needsSpriteRebuild = !cachedTitleLogoSprite
        || cachedTitleLogoCanvasWidth !== CANVAS_WIDTH
        || !Number.isFinite(cachedTitleLogoMetricWidth)
        || Math.abs(metricWidth - cachedTitleLogoMetricWidth) >= 2;

    if (needsSpriteRebuild) {
        const sprite = createTitleLogoSprite(ctx);
        if (sprite) {
            cachedTitleLogoSprite = sprite;
            cachedTitleLogoCanvasWidth = CANVAS_WIDTH;
            cachedTitleLogoMetricWidth = metricWidth;
        }
    }

    if (!cachedTitleLogoSprite) return;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
        cachedTitleLogoSprite.image,
        Math.round(titleX - cachedTitleLogoSprite.anchorX),
        Math.round(titleRenderY - cachedTitleLogoSprite.anchorY),
        cachedTitleLogoSprite.drawWidth,
        cachedTitleLogoSprite.drawHeight
    );
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
    return {
        centerX,
        diffY,
        startY,
        newGameY: startY + buttonGap,
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

            drawRoundedRectPath(gx + 1.5, gy + 1.5, gw - 3, Math.max(1, gh * 0.34), Math.max(2, radius - 2));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.fill();
            drawRoundedRectPath(gx, gy, gw, gh, radius);
            ctx.strokeStyle = 'rgba(180, 204, 255, 0.38)';
            ctx.lineWidth = 1.2;
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
        drawModernGauge(x, y, hpBarWidth, hpBarHeight, hpRatio, [
            [0, '#ff4a5b'],
            [0.5, '#ffc955'],
            [1, '#47e08d']
        ]);

        ctx.fillStyle = '#fff';
        ctx.font = '700 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 5;
        ctx.fillText(`体力：${player.hp} / ${player.maxHp}`, x, y - 8);
        ctx.shadowBlur = 0;

        const levelKanji = toKanjiNumber(player.level);
        ctx.textAlign = 'right';
        ctx.fillText(`${levelKanji}段`, x + hpBarWidth, y - 8);
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

        ctx.font = '700 15px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        
        if (isSpReady) {
            const timeSinceReady = typeof window !== 'undefined' && window.game && window.game.specialReadyFlashTime 
                ? Date.now() - window.game.specialReadyFlashTime 
                : Infinity;
            const burstAlpha = Math.max(0, 1 - timeSinceReady / 500); // 500ms flash

            const t = Date.now() * 0.005;
            const pulse = (Math.sin(t) + 1) / 2; // 0.0 ~ 1.0
            
            // ゲージ上に輝くオーバーレイを重ねる
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            if (burstAlpha > 0) {
                ctx.fillStyle = `rgba(255, 255, 255, ${burstAlpha})`;
            } else {
                ctx.fillStyle = `rgba(255, 210, 80, ${0.15 + pulse * 0.35})`;
            }
            drawRoundedRectPath(barX, spY, spBarWidth, spBarHeight, Math.floor(spBarHeight / 2));
            ctx.fill();
            ctx.restore();
            
            // 文字を光らせる
            ctx.shadowColor = `rgba(255, 210, 80, ${0.4 + pulse * 0.6})`;
            ctx.shadowBlur = 8 + pulse * 10;
            ctx.fillStyle = '#fff9e6';
        } else {
            ctx.shadowColor = 'rgba(0,0,0,0.65)';
            ctx.shadowBlur = 5;
            ctx.fillStyle = '#fff';
        }

        ctx.fillText('奥義', x, spY + spBarHeight / 2);
        ctx.shadowBlur = 0;

        const expBarWidth = 250;
        const expBarHeight = 15;
        const expY = spY + 30;
        const expRatio = Math.max(0, player.exp / player.expToNext);
        const expColors = [[0, '#53e87d'], [0.58, '#41d0b8'], [1, '#2f9dd9']];

        drawModernGauge(barX, expY, expBarWidth, expBarHeight, expRatio, expColors);

        ctx.font = '700 15px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#fff';
        ctx.fillText('熟練', x, expY + expBarHeight / 2);
        ctx.shadowBlur = 0;
        
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
        ctx.shadowColor = 'rgba(0,0,0,0.62)';
        ctx.shadowBlur = 5;

        // ステージ名（BGMボタン左側）
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.font = `900 ${stageFontPx}px sans-serif`;
        ctx.fillText(stageLabel, stageRightX, stageTextY);
        ctx.shadowBlur = 0;
        
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
            ctx.font = '700 15px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(player.currentSubWeapon.name, slotX + slotSize + 15, slotY + slotSize / 2);

            // 小判＋所持金（サブ武器行の右端）
            const panelRightX = panelX + panelW;
            const moneyRightX = panelRightX - panelPadding;
            ctx.fillStyle = COLORS.MONEY;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${moneyFontPx}px sans-serif`;
            ctx.shadowColor = 'rgba(0,0,0,0.62)';
            ctx.shadowBlur = 5;
            const moneyWidth = ctx.measureText(moneyText).width;
            const coinGap = 9;
            const coinHalfW = coinSize * 0.7;
            const coinX = moneyRightX - moneyWidth - coinGap - coinHalfW;
            this.drawKoban(ctx, coinX, slotY + slotSize / 2, coinSize);
            ctx.fillText(moneyText, moneyRightX, slotY + slotSize / 2);
            ctx.shadowBlur = 0;
            
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
                ctx.font = '700 12px sans-serif';
                ctx.fillStyle = row.color;
                ctx.fillText(row.label, boxX + insetX, yy);
                ctx.font = '700 12px sans-serif';
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
    
    // 操作説明（常にキャラ操作のみを表示）
    renderControls(ctx) {
        drawControlManualLine(ctx);
    }
    
    // ダメージ数値表示用
    renderDamageNumber(ctx, x, y, damage, isCritical = false, alpha = 1) {
        if (alpha <= 0) return;
        ctx.save();
        if (alpha < 1) ctx.globalAlpha *= alpha;
        ctx.fillStyle = isCritical ? '#ffcc00' : '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.font = isCritical ? 'bold italic 32px sans-serif' : 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        
        // 縁取りをつけることで背景に埋もれないように
        ctx.strokeText(`${damage}`, x, y);
        
        // クリティカルなら黄色～赤のグラデーション
        if (isCritical) {
            const grad = ctx.createLinearGradient(x, y - 20, x, y);
            grad.addColorStop(0, '#ffff00');
            grad.addColorStop(1, '#ff4400');
            ctx.fillStyle = grad;
        }
        
        ctx.fillText(`${damage}`, x, y);
        ctx.restore();
    }
    
    // レベルアップ表示
    renderLevelUp(ctx, x, y) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 28px sans-serif';
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
        ctx.font = `700 ${Math.round(radius * 0.9)}px sans-serif`;
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
        ctx.font = `700 ${Math.round(radius * 0.8)}px sans-serif`;
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
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(lines[0], x, y - 8);
            ctx.font = '12px sans-serif';
            ctx.fillText(lines[1], x, y + 8);
        } else {
            ctx.font = 'bold 20px sans-serif';
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
                ctx.font = 'bold 20px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', 0, 0);
        }
        
        ctx.restore();
    }
}

// タイトル画面描画
export function renderTitleScreen(ctx, currentDifficulty, titleMenuIndex = 0, hasSave = false) {
    const time = Date.now();
    const t = time * 0.001;

    // 背景（夜空 + 光彩）
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#020713');
    gradient.addColorStop(0.26, '#0a1a3a');
    gradient.addColorStop(0.58, '#14284a');
    gradient.addColorStop(1, '#060d1b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const skyGlow = ctx.createRadialGradient(
        CANVAS_WIDTH * 0.68, CANVAS_HEIGHT * 0.1, 24,
        CANVAS_WIDTH * 0.68, CANVAS_HEIGHT * 0.1, CANVAS_WIDTH * 0.72
    );
    skyGlow.addColorStop(0, 'rgba(136, 186, 255, 0.24)');
    skyGlow.addColorStop(0.45, 'rgba(88, 138, 224, 0.14)');
    skyGlow.addColorStop(1, 'rgba(58, 98, 180, 0)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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

    // 月（stage準拠スタイルを大きめ）
    drawStageStyleCelestialBody(
        ctx,
        CANVAS_WIDTH - 188,
        148,
        70,
        '#f8f9fa',
        '#ced4da',
        'rgba(240, 248, 255, ALPHA)',
        1,
        3.4
    );

    // 靄・前景
    drawTitleMistLayers(ctx, time);

    
    // タイトルロゴ
    drawRichTitleLogo(ctx, time);
    
    // 難易度選択
    const layout = getTitleScreenLayout(hasSave);
    const diffY = layout.diffY;
    
    // 左右の矢印 (削除済み)

    
    // 現在の難易度ボタン
    const titleActionFill = 'rgba(74, 122, 220, 0.52)';
    const titleActionStroke = 'rgba(225, 239, 255, 0.92)';
    let diffColor = '#ddaa00'; // Normal
    if (currentDifficulty && currentDifficulty.id === 'easy') diffColor = '#44aa44';
    if (currentDifficulty && currentDifficulty.id === 'hard') diffColor = '#aa4444';
    drawRoundedFlatTitleButton(
        ctx,
        layout.centerX,
        diffY,
        layout.diffButton.width,
        layout.diffButton.height,
        currentDifficulty ? currentDifficulty.name : '普 (NORMAL)',
        {
            fill: diffColor,
            border: 'rgba(245, 246, 255, 0.5)',
            font: '700 21px sans-serif'
        }
    );

    // 開始ボタン（続きから / 最初から）
    const startY = layout.startY;
    const actionW = layout.actionButton.width;
    const actionH = layout.actionButton.height;
    const focusedFill = 'rgba(116, 166, 255, 0.78)';
    const focusedBorder = 'rgba(238, 246, 255, 0.98)';
    if (hasSave) {
        drawRoundedFlatTitleButton(
            ctx,
            layout.centerX,
            startY,
            actionW,
            actionH,
            '続きから',
            {
                fill: titleMenuIndex === 0 ? focusedFill : titleActionFill,
                border: titleMenuIndex === 0 ? focusedBorder : titleActionStroke,
                font: '700 22px sans-serif'
            }
        );
        drawRoundedFlatTitleButton(
            ctx,
            layout.centerX,
            layout.newGameY,
            actionW,
            actionH,
            '最初から',
            {
                fill: titleMenuIndex === 1 ? focusedFill : titleActionFill,
                border: titleMenuIndex === 1 ? focusedBorder : titleActionStroke,
                font: '700 22px sans-serif'
            }
        );
    } else {
        drawRoundedFlatTitleButton(
            ctx,
            layout.centerX,
            layout.singleStartY,
            actionW,
            actionH,
            '出陣',
            {
                fill: focusedFill,
                border: focusedBorder,
                font: '700 22px sans-serif'
            }
        );
    }
    
    // 不要な描画コード削除
    

    
    // 右下デバッグモードヒント（⚙アイコン）
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(time * 0.002) * 0.08;
    ctx.font = '24px sans-serif';
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
    const panelY = 40;
    const rowH = 26; // 少し詰める
    const headerH = 40; // タイトル削除に伴い大幅に削減
    const spacingH = 10;
    const entriesCount = entries.length;
    const panelH = headerH + spacingH + entriesCount * rowH + 10; // 項目数にぴったり合わせる
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
    ctx.font = '500 12px sans-serif';
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
        ctx.font = selected ? '700 13px sans-serif' : '500 13px sans-serif';
        ctx.fillText(entry.label || '', panelX + 30, y);

        ctx.textAlign = 'right';
        const valText = (typeof entry.getValue === 'function') ? entry.getValue() : (entry.value || '');
        const isActionRow = entry.action || valText === '実行';
        ctx.fillStyle = isActionRow ? '#ffe08d' : (selected ? '#dff0ff' : 'rgba(198, 216, 246, 0.92)');
        ctx.font = selected ? '700 13px sans-serif' : '500 13px sans-serif';
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
            ctx.font = 'bold 20px sans-serif';
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

    // レイアウト定数 (全画面化)
    const panelX = 0;
    const panelY = 0;
    const panelW = CANVAS_WIDTH;
    const panelH = CANVAS_HEIGHT;

    const rightColX = 880;
    const rightColW = panelW - rightColX - 40;

    const menuItems = [
        { title: `忍具：${selectedWeaponName}` },
        { title: 'よろず屋' },
        { title: '準備完了' }
    ];

    const subWeaponLabel = '忍具強化';

    const progressionCards = [
        { title: '連撃強化', level: normalTier, detail: tierLabel(normalTier) },
        { title: subWeaponLabel, level: subTier, detail: tierLabel(subTier) },
        { title: '奥義強化', level: specialTier, detail: tierLabel(specialTier) }
    ];

    ctx.save();
    try {
        if (drawBackground) {
            // ★変更: 背景を明るく（紺→藍寄りに）
            const bgGrad = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH);
            bgGrad.addColorStop(0, '#223055');
            bgGrad.addColorStop(1, '#131f39');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            // フラットな薄いオーバーレイ
            ctx.fillStyle = 'rgba(130, 170, 255, 0.1)';
            ctx.fillRect(panelX, panelY, panelW, panelH);
        }

        if (!drawUi) {
            return;
        }

        const roundedRectPath = (x, y, w, h, r) => {
            const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.lineTo(x + w - rr, y);
            ctx.arcTo(x + w, y, x + w, y + rr, rr);
            ctx.lineTo(x + w, y + h - rr);
            ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
            ctx.lineTo(x + rr, y + h);
            ctx.arcTo(x, y + h, x, y + h - rr, rr);
            ctx.lineTo(x, y + rr);
            ctx.arcTo(x, y, x + rr, y, rr);
            ctx.closePath();
        };

        const snapshotCanvas = document.createElement('canvas');
        snapshotCanvas.width = CANVAS_WIDTH;
        snapshotCanvas.height = CANVAS_HEIGHT;
        const snapshotCtx = snapshotCanvas.getContext('2d');
        // DPR環境での拡大ゴーストを防ぐため、実バックバッファを論理解像度へ正規化して取得
        snapshotCtx.drawImage(
            ctx.canvas,
            0, 0, ctx.canvas.width, ctx.canvas.height,
            0, 0, CANVAS_WIDTH, CANVAS_HEIGHT
        );

        const drawFrostedPanel = (x, y, w, h, radius = 20, {
            blur = 12,
            tint = 'rgba(28, 46, 92, 0.42)',
            stroke = 'rgba(190, 216, 255, 0.36)',
            lineWidth = 1.2
        } = {}) => {
            ctx.save();
            roundedRectPath(x, y, w, h, radius);
            ctx.clip();
            ctx.filter = `blur(${blur}px)`;
            ctx.drawImage(snapshotCanvas, 0, 0);
            ctx.filter = 'none';
            ctx.fillStyle = tint;
            ctx.fillRect(x, y, w, h);
            ctx.restore();

            roundedRectPath(x, y, w, h, radius);
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        };

        // --- メインレイアウト構成 ---
        const infoPanelX = rightColX - 18;
        const infoPanelY = 90;
        const infoPanelW = rightColW + 4;
        const rowInset = 16;
        const rowX = infoPanelX + rowInset;
        const rowW = infoPanelW - rowInset * 2;
        const rowStartY = infoPanelY + 24;
        const rowH = 40;
        const rowGap = 7;
        const menuY = CANVAS_HEIGHT - 140;

        ctx.textAlign = 'right';

        const statRows = [
            { label: '段位', value: `${toKanjiNumber(player.level)}段`, color: '#fff' },
            { label: '体力', value: `${player.maxHp}`, color: '#ff7070' },
            { label: '小判', value: `${formatMoney(player.money)} 枚`, color: '#ffd700' },
            { label: '剛力', value: `${(player.attackPower || 1.0).toFixed(1)}倍`, color: '#ffae70' },
            { label: '韋駄天', value: player.permanentDash ? '習得済' : '未習得', color: '#7affae' },
            { label: '跳躍', value: `${player.maxJumps || 1}段`, color: '#7ab5ff' }
        ];

        const statsBottomY = rowStartY + statRows.length * (rowH + rowGap) - rowGap;
        const cardY = statsBottomY + 20;
        const cardGap = 12;
        const cardW = (rowW - cardGap * 2) / 3;
        const cardH = 116;
        const infoPanelBottom = Math.min(cardY + cardH + 18, menuY - 24);
        const infoPanelH = infoPanelBottom - infoPanelY;

        drawFrostedPanel(infoPanelX, infoPanelY, infoPanelW, infoPanelH, 22, {
            blur: 14,
            tint: 'rgba(24, 40, 86, 0.38)',
            stroke: 'rgba(186, 214, 255, 0.34)',
            lineWidth: 1.3
        });

        statRows.forEach((row, i) => {
            const rowY = rowStartY + i * (rowH + rowGap);
            const centerY = rowY + rowH / 2;

            ctx.textBaseline = 'middle';
            drawFrostedPanel(rowX, rowY, rowW, rowH, 10, {
                blur: 9,
                tint: 'rgba(42, 62, 112, 0.3)',
                stroke: 'rgba(168, 198, 246, 0.16)',
                lineWidth: 1.0
            });

            ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.textAlign = 'left';
            ctx.font = '600 17px sans-serif';
            ctx.fillText(row.label, rowX + 14, centerY);

            ctx.textAlign = 'right';
            ctx.fillStyle = row.value === 'undefined段' ? '#fff' : row.color;
            ctx.font = '700 19px sans-serif';
            ctx.fillText(row.value, rowX + rowW - 14, centerY);
            ctx.textAlign = 'left';
        });

        ctx.textBaseline = 'alphabetic';

        // 強化状況カード
        progressionCards.forEach((card, i) => {
            const x = rowX + i * (cardW + cardGap);
            drawFrostedPanel(x, cardY, cardW, cardH, 12, {
                blur: 10,
                tint: 'rgba(30, 54, 108, 0.34)',
                stroke: 'rgba(170, 202, 252, 0.3)',
                lineWidth: 1.1
            });

            ctx.fillStyle = 'rgba(215, 230, 255, 0.95)';
            ctx.font = '700 15px sans-serif';
            ctx.fillText(card.title, x + 12, cardY + 30);

            ctx.fillStyle = '#fff';
            ctx.font = '700 18px sans-serif';
            ctx.fillText(card.detail, x + 12, cardY + 64);

            for (let p = 0; p < 3; p++) {
                const gx = x + 12 + p * 28;
                const gy = cardY + 86;
                ctx.fillStyle = p < card.level ? '#8ec8ff' : 'rgba(255, 255, 255, 0.12)';
                ctx.fillRect(gx, gy, 22, 7);
            }
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
            drawFrostedPanel(x, menuY, menuW, menuH, 16, {
                blur: 10,
                tint: selected ? 'rgba(74, 122, 220, 0.52)' : 'rgba(30, 58, 116, 0.4)',
                stroke: selected ? 'rgba(225, 239, 255, 0.92)' : 'rgba(163, 194, 244, 0.36)',
                lineWidth: selected ? 2.0 : 1.3
            });

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = selected ? '#fff' : 'rgba(255, 255, 255, 0.8)';
            ctx.font = selected ? '700 22px sans-serif' : '600 22px sans-serif';
            ctx.fillText(item.title, x + menuW / 2, menuY + menuH / 2);
        });

        // 操作説明はタイトル画面と同じ見た目・位置に統一
        drawScreenManualLine(ctx, '←→：選択 | SPACE：決定 | ↑↓：装備切替');

    } finally {
        ctx.restore();
    }
}

export function renderLevelUpChoiceScreen(ctx, player, choices, selectedIndex = 0) {
    const time = Date.now();
    const pulse = (Math.sin(time * 0.006) + 1) * 0.5;
    const cardWidth = 300;
    const cardHeight = 260;
    const gap = 36;
    const list = Array.isArray(choices) ? choices : [];
    const totalW = list.length * cardWidth + Math.max(0, list.length - 1) * gap;
    const startX = CANVAS_WIDTH / 2 - totalW / 2;
    const cardY = CANVAS_HEIGHT / 2 - 120;
    const wrapTextLines = (text, maxWidth, maxLines = 3) => {
        const src = String(text || '').trim();
        if (!src) return [];
        const chars = [...src];
        const lines = [];
        let line = '';
        for (const ch of chars) {
            const test = line + ch;
            if (ctx.measureText(test).width <= maxWidth) {
                line = test;
                continue;
            }
            if (line) lines.push(line);
            line = ch;
            if (lines.length >= maxLines) break;
        }
        if (lines.length < maxLines && line) lines.push(line);
        return lines.slice(0, maxLines);
    };

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 20, 0.66)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7fbff';
    ctx.font = '700 46px sans-serif';
    ctx.fillText('昇段', CANVAS_WIDTH / 2, 112);
    ctx.font = '600 20px sans-serif';
    ctx.fillStyle = 'rgba(220, 236, 255, 0.9)';
    ctx.fillText('強化を選択', CANVAS_WIDTH / 2, 166);

    list.forEach((choice, index) => {
        const x = startX + index * (cardWidth + gap);
        const selected = index === selectedIndex;
        const level = choice.level || 0;
        const maxLevel = choice.maxLevel || 3;

        const bg = ctx.createLinearGradient(x, cardY, x, cardY + cardHeight);
        bg.addColorStop(0, selected ? 'rgba(58, 91, 168, 0.92)' : 'rgba(26, 34, 66, 0.92)');
        bg.addColorStop(1, selected ? 'rgba(30, 47, 92, 0.92)' : 'rgba(16, 22, 44, 0.9)');
        ctx.fillStyle = bg;
        ctx.fillRect(x, cardY, cardWidth, cardHeight);
        if (selected) {
            ctx.save();
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(100, 160, 255, 0.4)';
            ctx.restore();
        }
        ctx.strokeStyle = selected ? `rgba(218, 233, 255, ${0.9 + pulse * 0.1})` : 'rgba(145, 171, 223, 0.35)';
        ctx.lineWidth = selected ? 2.0 : 1.2;
        ctx.strokeRect(x, cardY, cardWidth, cardHeight);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 28px sans-serif';
        ctx.fillText(choice.title || '', x + 22, cardY + 54);
        ctx.font = '500 15px sans-serif';
        ctx.fillStyle = 'rgba(224, 236, 255, 0.9)';
        const subtitleLines = wrapTextLines(choice.subtitle || '', cardWidth - 44, 4);
        const subtitleStartY = cardY + 94;
        subtitleLines.forEach((line, i) => {
            ctx.fillText(line, x + 22, subtitleStartY + i * 20);
        });

        const isDurationChoice = Number.isFinite(choice.durationSec);
        const subtitleBottomY = subtitleStartY + subtitleLines.length * 20;
        const pipsY = Math.max(cardY + 164, subtitleBottomY + 10);
        if (!isDurationChoice) {
            for (let pip = 0; pip < maxLevel; pip++) {
                ctx.fillStyle = pip < level ? '#8ec8ff' : 'rgba(210, 225, 255, 0.22)';
                ctx.fillRect(x + 22 + pip * 34, pipsY, 24, 9);
            }
            ctx.font = '600 16px sans-serif';
            ctx.fillStyle = 'rgba(222, 236, 255, 0.84)';
            const tierLabels = ['初級', '中級', '上級', '特級'];
            const currentLabel = tierLabels[Math.min(level, 3)];
            const nextLabel = tierLabels[Math.min(level + 1, 3)];
            ctx.fillText(`${currentLabel} → ${nextLabel}`, x + 22, pipsY + 34);
        } else {
            ctx.font = '700 18px sans-serif';
            ctx.fillStyle = 'rgba(196, 232, 255, 0.94)';
            ctx.fillText(`効果時間 ${choice.durationSec}秒`, x + 22, pipsY + 26);
        }
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(228, 240, 255, 0.84)';
    ctx.font = '600 20px sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('←→：選択 | SPACE：決定', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);
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
    renderWafuuCinematicBackdrop(ctx, timer, 'opening');
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
            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Press SPACE or Tap Screen to Skip', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 66);
        }
    }
}

// エンディング画面
export function renderEnding(ctx, timer) {
    renderWafuuCinematicBackdrop(ctx, timer, 'ending');
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
            ctx.font = 'bold 20px sans-serif';
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
        ctx.font = 'bold 20px sans-serif';
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
        ctx.font = '700 30px sans-serif';
        ctx.fillStyle = '#ffeb3b';
        ctx.fillText(`新忍具「${weaponUnlocked}」を獲得！`, CANVAS_WIDTH / 2, centerY + 120);
    }

    ctx.shadowBlur = 0;

    // 続行メッセージ（演出完了後に表示）
    if (timer >= pressDelay) {
        const blink = Math.floor(time / 500) % 2 === 0;
        if (blink) {
            ctx.font = '600 20px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillText('Press SPACE or Tap to View Status', CANVAS_WIDTH / 2, centerY + 200);
        }
    }

    ctx.restore();
}
