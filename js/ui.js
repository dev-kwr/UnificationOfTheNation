// ============================================
// Unification of the Nation - UIクラス
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, VIRTUAL_PAD } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';

const CONTROL_MANUAL_TEXT = '←→：移動 | ↓：しゃがみ | ↑・スペース：ジャンプ | Z：攻撃 | X：忍具 | D：切り替え | S：奥義 | SHIFT：ダッシュ';
const PAD_ICON_LIGATURES = {
    attack: 'swords',
    sub: 'bomb',
    special: 'auto_awesome',
    switch: 'swap_horiz'
};
const PAD_ICON_FALLBACK = {
    attack: '⚔',
    sub: '✹',
    special: '✦',
    switch: '⇄'
};
const BGM_ICON_PATHS = {
    unmuted: '../icon/volume-high-solid-full.svg',
    muted: '../icon/volume-xmark-solid-full.svg'
};

function canUseMaterialIconFont() {
    if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.check !== 'function') {
        return false;
    }
    return (
        document.fonts.check('24px "Material Symbols Rounded"') ||
        document.fonts.check('24px "Material Icons"')
    );
}

const KANJI_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

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

function drawControlManualLine(ctx, y = CANVAS_HEIGHT - 20) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(CONTROL_MANUAL_TEXT, CANVAS_WIDTH / 2, y);
    ctx.restore();
}

function drawRichTitleLogo(ctx, timeMs) {
    const titleX = CANVAS_WIDTH / 2;
    const titleY = CANVAS_HEIGHT / 2 - 120;
    const pulse = (Math.sin(timeMs * 0.0023) + 1) * 0.5;
    const bob = Math.sin(timeMs * 0.0017) * 1.2;
    const brushFamily = '"Rock Salt","Yusei Magic","Yuji Boku","Hiragino Mincho ProN","Yu Mincho",cursive';
    const subtitleFamily = '"Yuji Syuku","Yuji Boku","Yusei Magic","Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const titleText = 'Unification of the Nation';
    const titleGradient = ctx.createLinearGradient(0, titleY - 90, 0, titleY + 28);
    titleGradient.addColorStop(0, '#fff7df');
    titleGradient.addColorStop(0.42, '#f2d293');
    titleGradient.addColorStop(0.78, '#d8a65b');
    titleGradient.addColorStop(1, '#a47234');

    const titleRenderY = titleY + bob * 0.42;
    const maxTitleWidth = CANVAS_WIDTH * 0.92;
    let titleSize = 86;
    while (titleSize > 40) {
        ctx.font = `700 ${titleSize}px ${brushFamily}`;
        if (ctx.measureText(titleText).width <= maxTitleWidth) break;
        titleSize -= 2;
    }

    ctx.font = `700 ${titleSize}px ${brushFamily}`;
    ctx.lineJoin = 'bevel';
    ctx.miterLimit = 1.4;
    ctx.strokeStyle = 'rgba(8, 5, 14, 0.92)';
    ctx.lineWidth = Math.max(3.4, titleSize * 0.072);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
    ctx.shadowBlur = 12;
    ctx.strokeText(titleText, titleX, titleRenderY);
    ctx.shadowBlur = 0;

    // にじみ・かすれを先に重ねる
    for (let i = 0; i < 4; i++) {
        const jitterX = Math.sin(timeMs * 0.0028 + i * 1.3) * (0.9 + i * 0.22);
        const jitterY = Math.cos(timeMs * 0.0021 + i * 1.6) * (0.7 + i * 0.18);
        ctx.fillStyle = `rgba(26, 17, 20, ${0.12 - i * 0.02})`;
        ctx.fillText(titleText, titleX + jitterX, titleRenderY + jitterY);
    }

    ctx.fillStyle = titleGradient;
    ctx.fillText(titleText, titleX, titleRenderY);

    ctx.strokeStyle = `rgba(255, 245, 221, ${0.3 + pulse * 0.16})`;
    ctx.lineWidth = 1.0;
    ctx.strokeText(titleText, titleX, titleRenderY - 1);

    const subtitleY = titleY + 78 + bob * 0.2;
    ctx.font = `700 62px ${subtitleFamily}`;
    ctx.fillStyle = '#e3ecff';
    ctx.shadowColor = 'rgba(88, 140, 255, 0.54)';
    ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
        const jitterX = Math.sin(timeMs * 0.003 + i * 2.1) * (1.2 - i * 0.25);
        const jitterY = Math.cos(timeMs * 0.0024 + i * 1.2) * (0.85 - i * 0.18);
        ctx.fillStyle = `rgba(30, 25, 44, ${0.15 - i * 0.04})`;
        ctx.fillText('天下統一', titleX + jitterX, subtitleY + jitterY);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(8, 10, 20, 0.55)';
    ctx.strokeText('天下統一', titleX, subtitleY);
    ctx.fillStyle = '#e3ecff';
    ctx.fillText('天下統一', titleX, subtitleY);
    ctx.shadowBlur = 0;

    const ornamentY = subtitleY + 30;
    const ornamentLen = 206;
    ctx.strokeStyle = 'rgba(229, 203, 142, 0.78)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(titleX - 34, ornamentY);
    ctx.quadraticCurveTo(titleX - 104, ornamentY - 5, titleX - ornamentLen, ornamentY + 2);
    ctx.moveTo(titleX + 34, ornamentY);
    ctx.quadraticCurveTo(titleX + 104, ornamentY + 5, titleX + ornamentLen, ornamentY - 1);
    ctx.stroke();

    ctx.fillStyle = 'rgba(240, 218, 165, 0.92)';
    ctx.beginPath();
    ctx.moveTo(titleX - 20, ornamentY);
    ctx.lineTo(titleX, ornamentY - 10);
    ctx.lineTo(titleX + 20, ornamentY);
    ctx.lineTo(titleX, ornamentY + 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawTitleMistLayers(ctx, timeMs) {
    const t = timeMs * 0.001;
    const layers = [
        { y: CANVAS_HEIGHT * 0.46, amp: 12, speed: 32, alpha: 0.12, w: 330, h: 92 },
        { y: CANVAS_HEIGHT * 0.58, amp: 16, speed: 24, alpha: 0.1, w: 390, h: 108 },
        { y: CANVAS_HEIGHT * 0.7, amp: 11, speed: 18, alpha: 0.08, w: 450, h: 120 }
    ];

    ctx.save();
    for (const layer of layers) {
        for (let i = -1; i < 4; i++) {
            const travel = ((timeMs * layer.speed * 0.001) + i * (layer.w * 0.7)) % (CANVAS_WIDTH + layer.w * 1.2);
            const cx = travel - layer.w * 0.6;
            const cy = layer.y + Math.sin(t * (0.9 + i * 0.18) + i * 1.3) * layer.amp;
            const grad = ctx.createRadialGradient(cx, cy, layer.w * 0.08, cx, cy, layer.w * 0.55);
            grad.addColorStop(0, `rgba(175, 200, 255, ${layer.alpha})`);
            grad.addColorStop(0.55, `rgba(150, 176, 236, ${layer.alpha * 0.42})`);
            grad.addColorStop(1, 'rgba(120, 150, 220, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(cx, cy, layer.w, layer.h, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

export class UI {
    constructor() {
        this.hudPadding = 20;
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
        // --- HP Bar (Modern Style) ---
        const hpBarWidth = 300;
        const hpBarHeight = 20;
        const x = 40;
        const y = 40;
        
        // バー背景（半透明黒）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, hpBarWidth, hpBarHeight);
        
        // HP残量（グラデーション）
        const hpRatio = Math.max(0, player.hp / player.maxHp);
        const grad = ctx.createLinearGradient(x, y, x + hpBarWidth, y);
        grad.addColorStop(0, '#ff3333');
        grad.addColorStop(0.5, '#ffff33');
        grad.addColorStop(1, '#33ff33');
        
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, hpBarWidth * hpRatio, hpBarHeight);
        
        // 体力ラベル (Wafuu)
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(`体力：${player.hp} / ${player.maxHp}`, x, y - 5);
        ctx.shadowBlur = 0;
        
        // 段位 (Level)
        const levelKanji = toKanjiNumber(player.level);
        ctx.textAlign = 'right';
        ctx.fillText(`${levelKanji} 段`, x + hpBarWidth, y - 5);
        ctx.textAlign = 'left'; 

        // --- Special Gauge (Modern) ---
        const spBarWidth = 250;
        const spBarHeight = 20; 
        const spY = y + 30; // ラベルを横にするので詰め直す
        const barX = x + 50; // バーを右へ
        
        // 背景 (コントラスト向上のため不透明度アップ)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX, spY, spBarWidth, spBarHeight);
        
        // ゲージ
        const spRatio = Math.max(0, player.specialGauge / player.maxSpecialGauge);
        const isSpReady = spRatio >= 1;
        
        // 色をより鮮やかに
        ctx.fillStyle = isSpReady ? (Math.sin(Date.now() / 100) > 0 ? '#ffff00' : '#ffa500') : '#d4af37'; // 金色系
        ctx.fillRect(barX, spY, spBarWidth * spRatio, spBarHeight);
        
        // Label (Wafuu) - バーの左に配置
        ctx.font = 'bold 18px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        const spLabel = '奥義';
        ctx.fillStyle = '#fff';
        ctx.fillText(spLabel, x, spY + spBarHeight / 2);
        ctx.shadowBlur = 0;

        // --- EXP Bar (Modern) ---
        const expBarWidth = 250;
        const expBarHeight = 20; 
        const expY = spY + 30; 
        
        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX, expY, expBarWidth, expBarHeight);
        
        // ゲージ
        const expRatio = Math.max(0, player.exp / player.expToNext);
        ctx.fillStyle = '#32cd32'; // ライムグリーン
        ctx.fillRect(barX, expY, expBarWidth * expRatio, expBarHeight);
        
        // Label (Wafuu) - バーの左に配置
        ctx.font = 'bold 18px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        const expLabel = '熟練';
        ctx.fillStyle = '#fff';
        ctx.fillText(expLabel, x, expY + expBarHeight / 2);
        ctx.shadowBlur = 0;
        
        // --- Stage Info + マネー（右上） ---
        const stageFloorKanji = toKanjiNumber(stage.stageNumber || 1);
        const stageLabel = `第 ${stageFloorKanji} 階層`;
        const stageFontPx = 18; // 奥義/熟練と同サイズ
        const moneyFontPx = 18;
        const bgmCenterX = CANVAS_WIDTH - VIRTUAL_PAD.BGM_BUTTON_MARGIN_RIGHT;
        const bgmCenterY = VIRTUAL_PAD.BGM_BUTTON_MARGIN_TOP;
        const bgmLeftX = bgmCenterX - VIRTUAL_PAD.BGM_BUTTON_RADIUS;
        const stageRightX = bgmLeftX - 16; // BGMボタン左側に余白を確保
        const stageTextY = bgmCenterY;
        const displayMoney = Math.max(0, Math.min(9999, Math.floor(Number(player.money) || 0)));
        const moneyText = `${displayMoney}`;
        const coinSize = 9;

        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.62)';
        ctx.shadowBlur = 5;

        // ステージ名（BGMボタン左側）
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.font = `900 ${stageFontPx}px sans-serif`;
        ctx.fillText(stageLabel, stageRightX, stageTextY);

        // 小判＋所持金（ステージ名の左）
        const stageWidth = ctx.measureText(stageLabel).width;
        const moneyRightX = stageRightX - stageWidth - 18;
        ctx.fillStyle = COLORS.MONEY;
        ctx.textAlign = 'right';
        ctx.font = `900 ${moneyFontPx}px sans-serif`;
        const moneyWidth = ctx.measureText(moneyText).width;
        const coinGap = 9;
        const coinHalfW = coinSize * 0.7;
        const coinX = moneyRightX - moneyWidth - coinGap - coinHalfW;
        this.drawKoban(ctx, coinX, stageTextY, coinSize);
        ctx.fillText(moneyText, moneyRightX, stageTextY);
        ctx.shadowBlur = 0;
        
        // --- 装備中のサブ武器表示 (Icon Slot Style) ---
        if (player.currentSubWeapon) {
            const slotX = x;
            const slotY = expY + 55; // 余白を増やす (35 -> 55)
            const slotSize = 48;
            
            // 武器スロットの枠
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            // 斜め変形を削除 (通常の矩形描画)
            ctx.fillRect(slotX, slotY, slotSize, slotSize);
            ctx.strokeRect(slotX, slotY, slotSize, slotSize);
            
            // 武器アイコン（変形なしで描画）
            this.drawWeaponIcon(ctx, slotX + slotSize/2, slotY + slotSize/2, slotSize * 0.6, player.currentSubWeapon.name);
            ctx.restore();
            
            // 武器名 (大きく)
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(player.currentSubWeapon.name, slotX + slotSize + 15, slotY + slotSize / 2);
            
            // [D] 武器切替 の表示は削除
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
    renderDamageNumber(ctx, x, y, damage, isCritical = false) {
        ctx.save();
        ctx.fillStyle = isCritical ? '#ffxx00' : '#ffffff';
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
        
        // --- 右側：アクションキー（ダイヤ配置・円ボタン） ---
        const rightX = CANVAS_WIDTH - pad.SAFE_MARGIN_X;
        const radius = pad.BUTTON_SIZE;

        this.drawActionCircleButton(
            ctx, rightX + pad.ATTACK.x, bottomY + pad.ATTACK.y, radius, 'attack', input.isAction('ATTACK')
        );
        this.drawActionCircleButton(
            ctx, rightX + pad.SUB_WEAPON.x, bottomY + pad.SUB_WEAPON.y, radius, 'sub', input.isAction('SUB_WEAPON')
        );
        this.drawActionCircleButton(
            ctx, rightX + pad.SPECIAL.x, bottomY + pad.SPECIAL.y, radius, 'special', input.isAction('SPECIAL')
        );
        this.drawActionCircleButton(
            ctx, rightX + pad.SWITCH.x, bottomY + pad.SWITCH.y, radius, 'switch', input.isAction('SWITCH_WEAPON')
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
            const previousFilter = typeof ctx.filter === 'string' ? ctx.filter : 'none';
            const previousAlpha = ctx.globalAlpha;
            ctx.globalAlpha = isMuted ? 0.72 : 0.88; // 停止時は少し透過を強める
            if (typeof ctx.filter === 'string') {
                // 黒SVGを白へ変換
                ctx.filter = 'brightness(0) invert(1)';
            }
            ctx.drawImage(icon, iconX, iconY, iconSize, iconSize);
            if (typeof ctx.filter === 'string') {
                ctx.filter = previousFilter;
            }
            ctx.globalAlpha = previousAlpha;
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

    drawActionCircleButton(ctx, x, y, radius, iconType, isPressed) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isPressed ? 'rgba(255, 255, 255, 0.38)' : 'rgba(0, 0, 0, 0.34)';
        ctx.fill();
        ctx.strokeStyle = isPressed ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.65)';
        ctx.lineWidth = isPressed ? 3 : 2;
        ctx.stroke();

        this.drawPadActionIcon(ctx, x, y, radius, iconType, isPressed);
        ctx.restore();
    }

    drawPadActionIcon(ctx, x, y, radius, iconType, isPressed) {
        const alpha = isPressed ? 1.0 : 0.92;
        // iPad Safariでligature文字列がそのまま出るケースを避け、記号アイコンを常用する
        const glyph = PAD_ICON_FALLBACK[iconType] || '?';

        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const iconSize = Math.round(radius * 0.86);
        ctx.font = `700 ${iconSize}px "Segoe UI Symbol","Apple Symbols","Noto Sans Symbols","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.fillText(glyph, x, y + 1);
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
    drawSquareButton(ctx, x, y, size, label, isPressed, color = null) {
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
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        
        switch (name) {
            case '火薬玉':
                ctx.fillStyle = '#2d2d2d';
                ctx.beginPath();
                ctx.arc(0, 0, half * 0.62, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#767676';
                ctx.lineWidth = 1.8;
                ctx.stroke();
                ctx.strokeStyle = '#b07a38';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(half * 0.08, -half * 0.58);
                ctx.lineTo(half * 0.36, -half * 0.84);
                ctx.stroke();
                ctx.fillStyle = '#ffb347';
                ctx.beginPath();
                ctx.arc(half * 0.4, -half * 0.9, 2.2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case '大槍':
                // 柄
                ctx.strokeStyle = '#3d2b1f';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(-half, half);
                ctx.lineTo(half * 0.4, -half * 0.4);
                ctx.stroke();
                
                // 飾り房
                ctx.fillStyle = '#d32f2f';
                ctx.beginPath();
                ctx.arc(half * 0.3, -half * 0.3, 3, 0, Math.PI * 2);
                ctx.fill();
                
                // 穂先
                ctx.fillStyle = '#e0e0e0';
                ctx.beginPath();
                ctx.moveTo(half, -half);
                ctx.lineTo(half * 0.1, -half * 0.6);
                ctx.lineTo(half * 0.6, -half * 0.1);
                ctx.closePath();
                ctx.fill();
                break;
            case '二刀':
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 3;
                // 1本目（右上から左下）
                ctx.beginPath();
                ctx.moveTo(half, -half);
                ctx.lineTo(-half * 0.5, half * 0.5);
                ctx.stroke();
                // 2本目（左上から右下）
                ctx.beginPath();
                ctx.moveTo(-half, -half);
                ctx.lineTo(half * 0.5, half * 0.5);
                ctx.stroke();
                break;
            case '鎖鎌':
                ctx.strokeStyle = '#999';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, half * 0.8, 0, Math.PI * 1.5); // 鎖の輪
                ctx.stroke();
                // 鎌部分
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(-half, -half);
                ctx.lineTo(0, 0);
                ctx.stroke();
                break;
            case '大太刀':
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(-half, half);
                ctx.lineTo(half, -half);
                ctx.stroke();
                // 柄
                ctx.strokeStyle = '#8b4513';
                ctx.beginPath();
                ctx.moveTo(-half, half);
                ctx.lineTo(-half/2, half/2);
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
    // 背景（リッチな夜空グラデーション）
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#0a0522');
    gradient.addColorStop(0.3, '#1a0f3a');
    gradient.addColorStop(0.7, '#0f1a2a');
    gradient.addColorStop(1, '#050a15');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 星空（粒子エフェクト - 流れ星に合わせて右上から左下へ）
    const time = Date.now();
    for (let i = 0; i < 100; i++) {
        const x = (i * 137.5 - time * 0.02) % CANVAS_WIDTH; // 右から左
        const y = (i * 219.7 + time * 0.01) % CANVAS_HEIGHT; // 上から下
        // 範囲外に出た際のラップ処理を確実にする
        const finalX = x < 0 ? x + CANVAS_WIDTH : x;
        const finalY = y % CANVAS_HEIGHT;
        
        const size = (Math.sin(i * 0.5) + 1) * 0.5 + 0.5;
        const alpha = (Math.sin(time * 0.001 + i) + 1) * 0.5;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
        ctx.fillRect(finalX, finalY, size, size);
    }
    
    // 流れ星（斜め上から斜め下へ）
    const shootingStarSpeed = 0.5;
    const shootingStarInterval = 4000; // 出現サイクル
    const starCycle = time % shootingStarInterval;
    
    // サイクルごとに異なる開始位置を生成
    const starSeed = Math.floor(time / shootingStarInterval);
    const starStartX = (starSeed * 543) % (CANVAS_WIDTH + 400); 
    const starStartY = -100;
    
    if (starCycle < 1500) { // 最初の1.5秒間だけ流れる
        const progress = starCycle * shootingStarSpeed;
        const sx = starStartX - progress; // 右から左へ
        const sy = starStartY + progress; // 上から下へ
        
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
    
    // 月（シンプル）
    const moonX = CANVAS_WIDTH - 200;
    const moonY = 150;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 40, moonX, moonY, 100);
    moonGlow.addColorStop(0, 'rgba(210, 226, 255, 0.32)');
    moonGlow.addColorStop(1, 'rgba(210, 226, 255, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(moonX - 100, moonY - 100, 200, 200);

    ctx.fillStyle = '#edf5ff';
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // 靄の流れ
    drawTitleMistLayers(ctx, time);

    
    // タイトルロゴ
    drawRichTitleLogo(ctx, time);
    
    // メインメニュー (ボタン化)
    if (hasSave) {
        // 続きから (少し上に)
        drawFlatButton(ctx, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60, 300, 40, '続きから (CONTINUE)', titleMenuIndex === 0 ? 'rgba(50, 50, 200, 0.8)' : 'rgba(50, 50, 50, 0.6)');
        
        // 最初から
        drawFlatButton(ctx, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 110, 300, 40, '最初から (NEW GAME)', titleMenuIndex === 1 ? 'rgba(200, 50, 50, 0.8)' : 'rgba(50, 50, 50, 0.6)');
    }

    // 難易度選択 (ボタン化)
    // hasSave時は +170 に配置、通常時は +120
    const diffY = hasSave ? CANVAS_HEIGHT / 2 + 170 : CANVAS_HEIGHT / 2 + 120; 
    
    // 左右の矢印 (タッチ領域明示)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀', CANVAS_WIDTH / 2 - 160, diffY);
    ctx.fillText('▶', CANVAS_WIDTH / 2 + 160, diffY);
    
    // 現在の難易度ボタン
    let diffColor = '#ddaa00'; // Normal
    if (currentDifficulty && currentDifficulty.id === 'easy') diffColor = '#44aa44';
    if (currentDifficulty && currentDifficulty.id === 'hard') diffColor = '#aa4444';
    
    drawFlatButton(ctx, CANVAS_WIDTH / 2, diffY, 220, 40, currentDifficulty ? currentDifficulty.name : '普 (NORMAL)', diffColor);

    // 開始ボタンエリア (余白を広げて配置)
    // hasSave時は +240 に配置して重なり回避
    const startY = hasSave ? CANVAS_HEIGHT / 2 + 240 : CANVAS_HEIGHT / 2 + 200; 
    
    // PCの場合(タッチ非対応)はテキスト表示、タッチデバイスはボタン表示
    // デスクトップでタッチ対応の場合(maxTouchPoints > 0)を除外するため、UserAgentチェックを追加
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouchDevice = isMobile && ((navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window));
    
    if (!isTouchDevice) {
         // 点滅エフェクト (PC版の元のスタイル)
         const blink = Math.sin(Date.now() / 150) > 0;
         if (blink) {
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;
            ctx.fillText('Press SPACE to Start', CANVAS_WIDTH / 2, startY);
            ctx.shadowBlur = 0;
         }
    } else {
        // タッチデバイス向け「START」ボタン
        const btnW = 320;
        const btnH = 60;
        
        ctx.save();
        // ボタン背景 (点滅なし・固定)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(CANVAS_WIDTH/2 - btnW/2, startY - btnH/2, btnW, btnH);
        
        // 枠線 (白で固定)
        ctx.strokeStyle = '#ffffff'; 
        ctx.lineWidth = 3;
        ctx.strokeRect(CANVAS_WIDTH/2 - btnW/2, startY - btnH/2, btnW, btnH);
        
        // テキスト
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = 'white';
        // ... (Rest of existing code context match isn't strictly needed for inner replacement but fine)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText('GAME START', CANVAS_WIDTH / 2, startY);
        
        ctx.restore();
    }
    
    // 不要な描画コード削除
    

    
    // 操作説明（ステージ画面と同じ書式）
    drawControlManualLine(ctx);
}

// ゲームオーバー画面（リッチ化）
export function renderGameOverScreen(ctx, player, stageNumber) {
    const time = Date.now();
    
    // 背景（徐々に暗く）
    const alpha = Math.min(1.0, (time % 2000) / 1000 + 0.5); // 簡易フェードイン
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 血痕のような赤黒いエフェクト（四隅）
    const grad = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 100, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
    grad.addColorStop(0, 'rgba(50, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(100, 0, 0, 0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    
    // GAME OVER テキスト（フェードインエフェクト）
    const fadeProgress = Math.min(1, (time % 3000) / 1500);
    
    // パーティクルエフェクト（散りゆく灰）
    if (fadeProgress > 0.3) {
        for (let i = 0; i < 15; i++) {
            const px = CANVAS_WIDTH/2 + Math.sin(time * 0.001 + i) * 200;
            const py = CANVAS_HEIGHT/2 - 100 + Math.cos(time * 0.0008 + i) * 100 + (time % 3000) * 0.02;
            const size = 2 + Math.sin(i * 0.5) * 1.5;
            const particleAlpha = (1 - (time % 3000) / 3000) * 0.4;
            
            ctx.fillStyle = 'rgba(150, 50, 50, ' + particleAlpha + ')';
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.fillStyle = 'rgba(255, 51, 51, ' + fadeProgress + ')';
    ctx.font = 'bold 80px serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#500';
    ctx.shadowBlur = 20;
    ctx.fillText('無 念', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100);
    
    ctx.font = 'bold 40px serif';
    ctx.fillStyle = 'rgba(204, 0, 0, ' + fadeProgress + ')';
    ctx.shadowBlur = 0;
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
    
    // 情報パネル
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // 背景を少し濃くして枠を不要にする
    ctx.fillRect(CANVAS_WIDTH/2 - 200, CANVAS_HEIGHT/2 + 40, 400, 120);
    // 枠線(strokeRect)は削除してスッキリさせる
    
    ctx.font = '20px serif';
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'center';
    const stageKanji = (stageNumber === '?' || stageNumber == null) ? '?' : toKanjiNumber(stageNumber);
    const levelKanji = toKanjiNumber(player.level);
    ctx.fillText('到達した階層：第 ' + stageKanji + ' 階層', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 80);
    ctx.fillText('集めた金貨：' + player.money + ' 枚', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 110);
    ctx.fillText('到達した段位：' + levelKanji + ' 段', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 140);
    
    // 続行メッセージ（英語に戻す）
    const blink = Math.floor(Date.now() / 500) % 2 === 0;
    if (blink) {
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText('Press SPACE or Tap Screen to Return to Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 240);
        ctx.shadowBlur = 0;
    }

    // タップ用ボタン描画（※画面中央に重ならないよう配慮）
    drawFlatButton(ctx, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 240, 400, 60, '', 'rgba(0, 0, 0, 0)');
}

// ステージクリア画面
export function renderStageClearScreen(ctx, stageNumber, player, weaponUnlocked) {
    const time = Date.now();
    
    // 背景（勝利の光）
    const grad = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 50, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
    grad.addColorStop(0, 'rgba(0, 100, 0, 0.8)');
    grad.addColorStop(1, 'rgba(0, 50, 0, 0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 紙吹雪
    const confettiCount = 50;
    for (let i = 0; i < confettiCount; i++) {
        const cx = (Math.sin(time * 0.001 + i) + 1) * CANVAS_WIDTH / 2 + Math.cos(time * 0.002 + i) * 200;
        const cy = (time * 0.1 + i * 50) % (CANVAS_HEIGHT + 100) - 50;
        ctx.fillStyle = 'hsl(' + (i * 20) + ', 100%, 70%)';
        ctx.fillRect(cx, cy, 8, 8);
    }

    // STAGE CLEAR テキスト
    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    const scale = 1 + Math.sin(time / 300) * 0.05;
    ctx.scale(scale, scale);
    
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 100px serif';
    ctx.textAlign = 'center';
    ctx.fillText('勝 利', 0, -40);
    
    ctx.font = 'bold 40px serif';
    ctx.fillStyle = '#dddd00';
    ctx.shadowBlur = 0;
    ctx.fillText('STAGE CLEAR!', 0, 20);
    ctx.restore();
    
    // ステージ情報
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    const stageKanji = toKanjiNumber(stageNumber);
    ctx.fillText('第 ' + stageKanji + ' 階層 突破', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
    
    if (weaponUnlocked) {
        const blink = Math.sin(time / 100) > 0;
        ctx.font = 'bold 32px sans-serif';
        ctx.fillStyle = blink ? '#ffdd00' : '#ffffff';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 10;
        ctx.fillText('新武器獲得：' + weaponUnlocked, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
        ctx.shadowBlur = 0;
    }
    
    // 続行メッセージ（英語に統一）
    const blink = Math.floor(Date.now() / 500) % 2 === 0;
    if (blink) {
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText('Press SPACE or Tap Screen to Continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 180);
        ctx.shadowBlur = 0;
    }
}

function renderWafuuCinematicBackdrop(ctx, timer, variant = 'opening') {
    const time = timer * 0.001;

    // 夜（opening）と夜明け（ending）でトーンを切り替える
    const palette = variant === 'ending'
        ? {
            skyTop: '#2b2032',
            skyMid: '#8a5a48',
            skyBottom: '#d6b078',
            orb: 'rgba(255, 239, 198, 0.72)',
            fog: 'rgba(255, 236, 196, 0.26)',
            mountain: 'rgba(36, 24, 30, 0.62)',
            shrine: 'rgba(92, 34, 30, 0.86)',
            petals: 'rgba(255, 220, 198, 0.9)'
        }
        : {
            skyTop: '#060a1b',
            skyMid: '#12193a',
            skyBottom: '#24162f',
            orb: 'rgba(208, 226, 255, 0.45)',
            fog: 'rgba(170, 190, 255, 0.14)',
            mountain: 'rgba(10, 10, 24, 0.76)',
            shrine: 'rgba(56, 20, 20, 0.88)',
            petals: 'rgba(186, 214, 255, 0.62)'
        };

    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.52, palette.skyMid);
    sky.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 太陽（月）はendingのみ。openingでは月を描画しない。
    if (variant === 'ending') {
        const orbX = CANVAS_WIDTH * 0.24;
        const orbY = CANVAS_HEIGHT * 0.22;
        const orbCoreRadius = 62;
        const orbGlowRadius = 132;
        const orbGlow = ctx.createRadialGradient(orbX, orbY, 6, orbX, orbY, orbGlowRadius);
        orbGlow.addColorStop(0, 'rgba(255, 243, 214, 0.66)');
        orbGlow.addColorStop(0.48, palette.orb);
        orbGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = orbGlow;
        ctx.fillRect(orbX - orbGlowRadius, orbY - orbGlowRadius, orbGlowRadius * 2, orbGlowRadius * 2);

        ctx.save();
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbCoreRadius, 0, Math.PI * 2);
        ctx.clip();
        const orbSurface = ctx.createRadialGradient(
            orbX - orbCoreRadius * 0.32,
            orbY - orbCoreRadius * 0.34,
            orbCoreRadius * 0.1,
            orbX,
            orbY,
            orbCoreRadius
        );
        orbSurface.addColorStop(0, 'rgba(255, 248, 228, 0.96)');
        orbSurface.addColorStop(1, 'rgba(246, 214, 170, 0.9)');
        ctx.fillStyle = orbSurface;
        ctx.fillRect(orbX - orbCoreRadius, orbY - orbCoreRadius, orbCoreRadius * 2, orbCoreRadius * 2);
        ctx.restore();

        ctx.strokeStyle = 'rgba(255, 244, 214, 0.42)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbCoreRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    // 山シルエット
    ctx.fillStyle = palette.mountain;
    for (let i = -1; i < 8; i++) {
        const x = i * 220 - ((timer * 0.018) % 220);
        const h = 120 + Math.sin(i * 0.83 + time * 0.25) * 36;
        ctx.beginPath();
        ctx.moveTo(x, CANVAS_HEIGHT * 0.67);
        ctx.lineTo(x + 80, CANVAS_HEIGHT * 0.67 - h);
        ctx.lineTo(x + 170, CANVAS_HEIGHT * 0.67 - h * 0.55);
        ctx.lineTo(x + 240, CANVAS_HEIGHT * 0.67);
        ctx.closePath();
        ctx.fill();
    }

    // 地平線の鳥居シルエット
    const shrineY = CANVAS_HEIGHT * 0.63;
    ctx.fillStyle = palette.shrine;
    ctx.fillRect(0, shrineY, CANVAS_WIDTH, 18);
    for (let i = 0; i < 5; i++) {
        const gateX = 90 + i * 260 - ((timer * 0.026) % 260);
        ctx.fillRect(gateX, shrineY + 14, 12, 130);
        ctx.fillRect(gateX + 86, shrineY + 14, 12, 130);
        ctx.fillRect(gateX - 10, shrineY - 6, 118, 12);
    }

    // 霧レイヤー（線状に見えないよう縦方向にもフェードさせる）
    for (let i = 0; i < 3; i++) {
        const fogY = CANVAS_HEIGHT * (0.58 + i * 0.09);
        const fogShift = Math.sin(time * (0.7 + i * 0.2) + i) * 70;
        const fogH = 56 + i * 8;
        const fogGrad = ctx.createLinearGradient(0, fogY - fogH * 0.5, 0, fogY + fogH * 0.5);
        fogGrad.addColorStop(0, 'rgba(255,255,255,0)');
        fogGrad.addColorStop(0.35, palette.fog);
        fogGrad.addColorStop(0.65, palette.fog);
        fogGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(-140 + fogShift, fogY - fogH * 0.5, CANVAS_WIDTH + 280, fogH);
    }

    // 花弁/粉雪の粒子（パターン数を増やし、見た目のランダム性を上げる）
    const hash01 = (n) => {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
        return s - Math.floor(s);
    };
    const particleCount = variant === 'ending' ? 30 : 44;
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
        const fallSpeed = (variant === 'ending' ? 0.028 : 0.032) + layer * 0.004 + seedC * 0.012;
        const driftSpeed = 0.014 + layer * 0.003 + seedA * 0.006;
        const driftAmp = 18 + layer * 8 + seedB * 14;
        const swirlAmp = 6 + seedC * 10;
        const size = 2.8 + layer * 0.95 + seedA * 1.6;

        const py = (baseY + timer * fallSpeed) % spanY - 160;
        const sway = Math.sin(time * (0.8 + driftSpeed) + i * 0.77) * driftAmp;
        const swirl = Math.cos(time * (1.25 + seedC * 0.7) + i * 0.41) * swirlAmp;
        const px = (baseX + timer * (0.006 + layer * 0.0015) + sway + swirl + spanX) % spanX - 130;
        const rot = (time * (0.45 + seedA * 1.2) + i * 0.61) % (Math.PI * 2);
        const alpha = 0.34 + seedB * 0.5;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.fillStyle = palette.petals.replace(/[\d.]+\)$/u, `${alpha.toFixed(3)})`);
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
        CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.16,
        CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.78
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, variant === 'ending' ? 'rgba(0,0,0,0.24)' : 'rgba(0,0,0,0.42)');
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
        '立ちふさがるは、五人の侍大将。',
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
export function renderPauseScreen(ctx) {
    // ... (既存のコード) ...
}

// 全クリア画面
export function renderGameClearScreen(ctx, player) {
    // 豪華な背景
    const gradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 2
    );
    gradient.addColorStop(0, '#ffd700');
    gradient.addColorStop(0.5, '#b8860b');
    gradient.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // CONGRATULATIONS
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 56px serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('祝・天下統一！', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    ctx.fillText('祝・天下統一！', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('GAME CLEAR', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    
    // 最終スコア
    ctx.font = '24px sans-serif';
    ctx.fillText('Final Level：' + player.level + '  |  Total Money：' + player.money, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
    
    // THANKS
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#ddd';
    ctx.fillText('Thank you for playing!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
    
    // 続行メッセージ
    const blink = Math.sin(Date.now() / 300) > 0;
    if (blink) {
        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Press SPACE or Tap Screen for Ending', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 150);
    }
}
