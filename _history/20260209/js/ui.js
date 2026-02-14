// ============================================
// Unification of the Nation - UIクラス
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, VIRTUAL_PAD } from './constants.js';
import { input } from './input.js';

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

export class UI {
    constructor() {
        this.hudPadding = 20;
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
        ctx.textAlign = 'right';
        ctx.fillText(`${player.level} 段`, x + hpBarWidth, y - 5);
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
        
        // --- Stage Info (Wafuu) ---
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px sans-serif'; 
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        ctx.fillText(`第 ${stage.stageNumber || 1} 階層`, CANVAS_WIDTH - 150, 80);
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
        
        // マネー (小判アイコンを独自描画)
        // 右寄せ表示
        const moneyRightX = CANVAS_WIDTH - 40;
        const moneyY = 80;
        
        ctx.fillStyle = COLORS.MONEY;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${player.money}`, moneyRightX, moneyY);
        
        // テキスト幅計測して小判を配置
        const moneyWidth = ctx.measureText(`${player.money}`).width; 
        this.drawKoban(ctx, moneyRightX - moneyWidth - 25, moneyY, 12);
        
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
        const y = CANVAS_HEIGHT - 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
            '←→：移動 | ↓：しゃがみ | ↑・スペース：ジャンプ | Z：攻撃 | X：爆弾 | C：サブ武器 | D：切り替え | S：奥義 | SHIFT：ダッシュ',
            CANVAS_WIDTH / 2,
            y
        );
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
    
    renderVirtualPad(ctx, player) {
        // PC（タッチ非対応 または マウス操作）の場合は表示しない (iPad対応強化)
        // iPadOS 13+ は Macintosh として報告されるが maxTouchPoints > 0
        const isTouchDevice = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        // PCデバッグ(mouse)の場合もタッチ扱いにするため、モバイル判定も併用
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // デスクトップ(マウスのみ) かつ 幅広 なら隠す
        if (!isTouchDevice && !isMobile && CANVAS_WIDTH > 800) return;

        ctx.save();
        ctx.setLineDash([]);
        
        const pad = VIRTUAL_PAD;
        const bottomY = CANVAS_HEIGHT - pad.BOTTOM_MARGIN;
        
        // --- 左側：移動 & ジャンプ (十字配置) ---
        const leftX = pad.SAFE_MARGIN_X;
        const size = pad.BUTTON_SIZE; // 全て統一サイズ
        
        // 十字配置
        this.drawSquareButton(ctx, leftX + pad.LEFT.x, bottomY + pad.LEFT.y, size, '←', input.isAction('LEFT'));
        this.drawSquareButton(ctx, leftX + pad.RIGHT.x, bottomY + pad.RIGHT.y, size, '→', input.isAction('RIGHT'));
        this.drawSquareButton(ctx, leftX + pad.DOWN.x, bottomY + pad.DOWN.y, size, '↓', input.isAction('DOWN'));
        this.drawSquareButton(ctx, leftX + pad.JUMP.x, bottomY + pad.JUMP.y, size, '↑', input.isAction('JUMP'));
            
        // --- 右側：アクションキー (3-2配置) ---
        const rightX = CANVAS_WIDTH - pad.SAFE_MARGIN_X;
        const commonColor = null; 
        
        // 下段 (Z, X, C)
        this.drawSquareButton(ctx, rightX + pad.ATTACK.x, bottomY + pad.ATTACK.y, size, '攻\n(Z)', input.isAction('ATTACK'), commonColor);
        this.drawSquareButton(ctx, rightX + pad.BOMB.x, bottomY + pad.BOMB.y, size, '爆\n(X)', input.isAction('BOMB'), commonColor);
        this.drawSquareButton(ctx, rightX + pad.SUB_WEAPON.x, bottomY + pad.SUB_WEAPON.y, size, '副\n(C)', input.isAction('SUB_WEAPON'), commonColor);
        
        // 上段 (S, D)
        this.drawSquareButton(ctx, rightX + pad.SPECIAL.x, bottomY + pad.SPECIAL.y, size, '奥\n(S)', input.isAction('SPECIAL'), commonColor);
        this.drawSquareButton(ctx, rightX + pad.SWITCH.x, bottomY + pad.SWITCH.y, size, '替\n(D)', input.isAction('SWITCH_WEAPON'), commonColor);
        
        ctx.restore();
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
    
    // 月（輝き強化）
    const moonX = CANVAS_WIDTH - 200;
    const moonY = 150;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 40, moonX, moonY, 100);
    moonGlow.addColorStop(0, 'rgba(255, 255, 230, 0.3)');
    moonGlow.addColorStop(1, 'rgba(255, 255, 230, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(moonX - 100, moonY - 100, 200, 200);
    
    ctx.fillStyle = '#ffffee';
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    
    // タイトル（強調エフェクト）
    const titleY = CANVAS_HEIGHT / 2 - 120; // 下寄りに移動（-120 -> -50）
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 80px serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#4488ff';
    ctx.shadowBlur = 20;
    ctx.strokeText('Unification of the Nation', CANVAS_WIDTH / 2, titleY);
    ctx.fillText('Unification of the Nation', CANVAS_WIDTH / 2, titleY);
    ctx.shadowBlur = 0;
    
    // サブタイトル（座標変換リセット後）
    ctx.font = '32px serif';
    ctx.fillStyle = '#ddddff';
    ctx.shadowBlur = 10;
    ctx.textAlign = 'center';
    ctx.fillText('天下統一', CANVAS_WIDTH / 2, titleY + 60);
    ctx.shadowBlur = 0;
    
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
    

    
    // 操作説明（キャラ操作のみ）
    ctx.font = '14px serif';
    ctx.fillStyle = '#888';
    ctx.textBaseline = 'alphabetic'; // デフォルトに戻す
    ctx.fillText('←→：移動 | ↓：しゃがみ | ↑・スペース：ジャンプ | Z：攻撃 | X：爆弾 | C：サブ武器 | D：武器変更 | S：奥義 | SHIFT：ダッシュ', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
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
    ctx.fillText('到達した階層：第 ' + (stageNumber || '?') + ' 階層', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 80);
    ctx.fillText('集めた金貨：' + player.money + ' 枚', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 110);
    ctx.fillText('到達した段位：' + player.level + ' 段', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 140);
    
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
    ctx.fillText('第 ' + stageNumber + ' 階層 突破', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
    
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

// イントロ（ストーリー紹介）画面
export function renderIntro(ctx, timer) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    const lines = [
        "時は戦国。",
        "群雄割拠の乱世に、一人のくノ一が立ち上がった。",
        "",
        "その名は、カエデ。",
        "亡き主君の遺志を継ぎ、天下を平らげるため、",
        "彼女は難攻不落の城へと向かう。",
        "",
        "立ちふさがるは、五人の侍大将。",
        "すべての刃を折り、日の本を一つにせよ。"
    ];
    
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px serif';
    const lineHeight = 55;
    const totalHeight = lines.length * lineHeight;
    const startY = (CANVAS_HEIGHT - totalHeight) / 2 + 20;
    
    lines.forEach((line, i) => {
        const lineStartTime = i * 800;
        const alpha = Math.max(0, Math.min(1, (timer - lineStartTime) / 1000));
        ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
        ctx.fillText(line, CANVAS_WIDTH / 2, startY + i * lineHeight);
    });
    
    // スキップ案内（微調整スタイル）
    if (timer > 1000) {
        const blink = Math.sin(Date.now() / 150) > 0;
        if (blink) {
            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText('Press SPACE or Tap Screen to Skip', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
            ctx.shadowBlur = 0;
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
        ctx.fillText('Press SPACE to Return to Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 150);
    }
}
