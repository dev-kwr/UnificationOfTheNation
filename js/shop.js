// ============================================
// Unification of the Nation - ショップ機能
// ============================================

import { COLORS, CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { drawScreenManualLine } from './ui.js';

// ショップアイテム
const SHOP_ITEMS = [
    // ステータス強化
    { id: 'hp_up', name: '活力の術', description: '最大HPを+5（最大8回まで）', price: 100, type: 'upgrade', stat: 'maxHp', value: 5 },
    { id: 'attack_up', name: '剛力の術', description: '攻撃力が段階的に上昇（最大3回: 1.2→1.5→2.0倍）', price: 150, type: 'upgrade', stat: 'attackPower', value: 1 },
    { id: 'speed_up', name: '韋駄天の術', description: '常時ダッシュ状態で移動可能になる', price: 150, type: 'upgrade', stat: 'speed', value: 1.5 },
    
    // スキル
    { id: 'double_jump', name: '二段跳び', description: '空中で一回追加跳躍が可能になる', price: 200, type: 'skill', skill: 'doubleJump' },
    { id: 'triple_jump', name: '三段跳び', description: '空中跳躍が合計三回可能になる', price: 500, type: 'skill', skill: 'tripleJump' },
];

export class Shop {
    constructor() {
        this.isOpen = false;
        this.selectedIndex = 0;
        this.focusZone = 'list'; // 'list' | 'footer'
        this.footerButtonIndex = 0; // 0:購入, 1:戻る
        this.items = [...SHOP_ITEMS];
        this.purchasedSkills = new Set();
        this.purchasedUpgrades = { hp_up: 0, attack_up: 0 };
        this.message = '';
        this.messageTimer = 0;
    }

    getLayout() {
        const shopW = 760;
        const shopH = CANVAS_HEIGHT - 164;
        const shopX = CANVAS_WIDTH / 2 - shopW / 2;
        const shopY = 82;
        return { shopX, shopY, shopW, shopH };
    }

    getItemRect(index) {
        const { shopX, shopY, shopW } = this.getLayout();
        const listTop = shopY + 112;
        const rowH = 62;
        const rowGap = 8;
        return {
            x: shopX + 30,
            y: listTop + index * (rowH + rowGap),
            w: shopW - 60,
            h: rowH
        };
    }

    getFooterButtons() {
        const { shopX, shopY, shopW, shopH } = this.getLayout();
        const h = 56;
        const w = 170;
        const gap = 24;
        const totalW = w * 2 + gap;
        const startX = shopX + (shopW - totalW) * 0.5;
        const y = shopY + shopH - h - 26;
        return {
            buy: { x: startX, y, w, h },
            back: { x: startX + w + gap, y, w, h }
        };
    }
    
    open(player) {
        this.isOpen = true;
        this.updateItemList(player);
        this.selectedIndex = 0;
        this.focusZone = 'list';
        this.footerButtonIndex = 0;
        this.message = '';
    }
    
    updateItemList(player) {
        this.items = [...SHOP_ITEMS];
    }

    close() {
        this.isOpen = false;
    }
    
    update(deltaTime, player) {
        if (!this.isOpen) return;
        
        if (this.messageTimer > 0) {
            this.messageTimer -= deltaTime * 1000;
            if (this.messageTimer <= 0) {
                this.message = '';
            }
        }
        
        // --- キーボード操作 ---
        if (input.isActionJustPressed('UP')) {
            if (this.focusZone === 'footer') {
                this.focusZone = 'list';
            } else {
                this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            }
            audio.playSelect();
            input.consumeAction('UP');
            input.consumeAction('JUMP');
        }
        
        if (input.isActionJustPressed('DOWN')) {
            if (this.focusZone === 'footer') {
                // フッターフォーカス中は維持
            } else if (this.selectedIndex >= this.items.length - 1) {
                this.focusZone = 'footer';
            } else {
                this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
            }
            audio.playSelect();
            input.consumeAction('DOWN');
        }

        if (input.isActionJustPressed('LEFT')) {
            this.focusZone = 'footer';
            this.footerButtonIndex = 0;
            audio.playSelect();
            input.consumeAction('LEFT');
        }

        if (input.isActionJustPressed('RIGHT')) {
            this.focusZone = 'footer';
            this.footerButtonIndex = 1;
            audio.playSelect();
            input.consumeAction('RIGHT');
        }
        
        if (input.isActionJustPressed('JUMP')) {
            if (this.focusZone === 'footer' && this.footerButtonIndex === 1) {
                this.close();
            } else {
                this.purchase(player);
            }
            input.consumeAction('JUMP');
        }
        
        if (input.isActionJustPressed('SUB_WEAPON') || input.isActionJustPressed('PAUSE')) {
            this.close();
            input.consumeAction('SUB_WEAPON');
            input.consumeAction('PAUSE');
        }

        // --- タッチ/タップ操作 ---
        if (input.touchJustPressed) {
            const tx = input.lastTouchX;
            const ty = input.lastTouchY;

            this.items.forEach((item, i) => {
                const rect = this.getItemRect(i);
                if (tx > rect.x && tx < rect.x + rect.w && ty > rect.y && ty < rect.y + rect.h) {
                    this.focusZone = 'list';
                    if (this.selectedIndex === i) {
                        this.purchase(player);
                    } else {
                        this.selectedIndex = i;
                        audio.playSelect();
                    }
                }
            });

            const buttons = this.getFooterButtons();
            if (
                tx > buttons.buy.x &&
                tx < buttons.buy.x + buttons.buy.w &&
                ty > buttons.buy.y &&
                ty < buttons.buy.y + buttons.buy.h
            ) {
                this.focusZone = 'footer';
                this.footerButtonIndex = 0;
                this.purchase(player);
            }

            if (
                tx > buttons.back.x &&
                tx < buttons.back.x + buttons.back.w &&
                ty > buttons.back.y &&
                ty < buttons.back.y + buttons.back.h
            ) {
                this.focusZone = 'footer';
                this.footerButtonIndex = 1;
                this.close();
                audio.playSelect();
            }
        }
    }
    
    purchase(player) {
        const item = this.items[this.selectedIndex];
        if (!item) return;

        // 完売チェック
        let isSoldOut = false;
        if (item.id === 'hp_up' && this.purchasedUpgrades.hp_up >= 8) isSoldOut = true;
        if (item.id === 'attack_up' && this.purchasedUpgrades.attack_up >= 3) isSoldOut = true;
        if (this.purchasedSkills.has(item.id)) isSoldOut = true;

        if (isSoldOut) {
            this.showMessage('既に習得済みです');
            return;
        }

        // スキルの前提条件チェック
        if (item.id === 'triple_jump' && !this.purchasedSkills.has('double_jump')) {
            this.showMessage('二段跳びの習得が必要です');
            return;
        }
        
        if (player.money < item.price) {
            this.showMessage('お金が足りません！');
            return;
        }

        if (typeof player.addMoney === 'function') {
            player.addMoney(-item.price);
        } else {
            player.money -= item.price;
        }
        
        switch (item.type) {
            case 'upgrade':
                if (item.stat === 'maxHp') {
                    player.maxHp += item.value;
                    player.hp = player.maxHp;
                    this.purchasedUpgrades.hp_up++;
                    this.showMessage(`最大HPが${item.value}増えた！ (${this.purchasedUpgrades.hp_up}/8)`);
                } else if (item.stat === 'attackPower') {
                    this.purchasedUpgrades.attack_up++;
                    player.atkLv = this.purchasedUpgrades.attack_up;
                    const atkMultipliers = [1.2, 1.5, 2.0];
                    const multiplier = atkMultipliers[this.purchasedUpgrades.attack_up - 1] || 2.0;
                    player.attackPower = (player.baseAttackPower || 1) * multiplier;
                    this.showMessage(`剛力が増した！ (段階:${this.purchasedUpgrades.attack_up}/3)`);
                } else if (item.stat === 'speed') {
                    player.permanentDash = true;
                    this.purchasedSkills.add(item.id);
                    this.showMessage('韋駄天の域に達した！');
                }

                break;
                
            case 'skill':
                this.purchasedSkills.add(item.id);
                if (item.skill === 'doubleJump') {
                    player.maxJumps = 2;
                    this.showMessage('二段跳びを習得！');
                } else if (item.skill === 'tripleJump') {
                    player.maxJumps = 3;
                    this.showMessage('三段跳びを習得！');
                }
                break;
        }
        
        if (item.type === 'skill' || item.id === 'speed_up') {
            audio.playPowerUp();
        } else {
            audio.playHeal();
        }
        this.updateItemList();
        if (this.selectedIndex >= this.items.length) {
            this.selectedIndex = this.items.length - 1;
        }
    }
    
    showMessage(msg) {
        this.message = msg;
        this.messageTimer = 2000;
    }
    
    render(ctx, player) {
        if (!this.isOpen) return;
        
        ctx.save();
        ctx.textBaseline = 'alphabetic';

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

        const drawFrostedPanel = (snapshotCanvas, x, y, w, h, radius = 16, {
            blur = 12,
            tint = 'rgba(30, 54, 108, 0.42)',
            stroke = 'rgba(176, 204, 248, 0.34)',
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

        ctx.fillStyle = 'rgba(6, 10, 24, 0.96)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        const { shopX, shopY, shopW, shopH } = this.getLayout();
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
        
        drawFrostedPanel(snapshotCanvas, shopX, shopY, shopW, shopH, 28, {
            blur: 14,
            tint: 'rgba(15, 32, 74, 0.48)',
            stroke: 'rgba(168, 198, 246, 0.44)',
            lineWidth: 1.3
        });
 
        ctx.fillStyle = '#f0f6ff';
        ctx.font = '700 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('よろず屋', CANVAS_WIDTH / 2, shopY + 72);
        
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(164, 193, 255, 0.26)';
        ctx.beginPath();
        ctx.moveTo(shopX + 42, shopY + 92);
        ctx.lineTo(shopX + shopW - 42, shopY + 92);
        ctx.stroke();
 
        ctx.font = '700 16px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffd96b';
        const moneyLabel = `小判: ${player.money}`;
        ctx.fillText(moneyLabel, shopX + shopW - 32, shopY + 70);
 
        this.items.forEach((item, i) => {
            const rect = this.getItemRect(i);
            const isSelected = this.focusZone === 'list' && i === this.selectedIndex;
            
            // 完売判定
            let isPurchased = this.purchasedSkills.has(item.id);
            if (item.id === 'hp_up' && this.purchasedUpgrades.hp_up >= 8) isPurchased = true;
            if (item.id === 'attack_up' && this.purchasedUpgrades.attack_up >= 3) isPurchased = true;

            const isLocked = item.id === 'triple_jump' && !this.purchasedSkills.has('double_jump');
            
            drawFrostedPanel(snapshotCanvas, rect.x, rect.y, rect.w, rect.h, 14, {
                blur: 10,
                tint: isSelected ? 'rgba(74, 122, 220, 0.42)' : 'rgba(28, 54, 112, 0.3)',
                stroke: isSelected ? 'rgba(204, 225, 255, 0.88)' : 'rgba(158, 189, 240, 0.26)',
                lineWidth: isSelected ? 1.8 : 1.0
            });

            if (isSelected) {
                ctx.fillStyle = 'rgba(205, 228, 255, 0.95)';
                ctx.font = '700 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('◆', rect.x + 28, rect.y + rect.h / 2);
            }
            
            const nameY = rect.y + 22;
            const descY = rect.y + 45;
            const priceY = rect.y + rect.h / 2;

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = (isPurchased || isLocked) ? 'rgba(155, 169, 198, 0.7)' : (isSelected ? '#ffffff' : 'rgba(232, 241, 255, 0.93)');
            let titleSize = 20;
            while (titleSize > 15) {
                ctx.font = `700 ${titleSize}px sans-serif`;
                if (ctx.measureText(item.name).width <= rect.w - 228) break;
                titleSize -= 1;
            }
            ctx.fillText(item.name, rect.x + 62, nameY);
            
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = (isPurchased || isLocked) ? 'rgba(155, 169, 198, 0.7)' : '#ffdb73';
            ctx.font = '700 16px sans-serif';
            let priceText = `${item.price} 枚`;
            if (isPurchased) priceText = '習得済';
            else if (isLocked) priceText = '禁制';
            ctx.fillText(priceText, rect.x + rect.w - 24, priceY);
            
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = (isPurchased || isLocked) ? 'rgba(151, 164, 190, 0.7)' : 'rgba(200, 216, 247, 0.82)';
            ctx.font = '500 11px sans-serif';
            const desc = isLocked ? '前提となる術の習得が必要' : item.description;
            ctx.fillText(desc, rect.x + 62, descY);
        });
        
        const buttons = this.getFooterButtons();
        if (this.message) {
            const msgW = shopW - 140;
            const msgX = shopX + (shopW - msgW) * 0.5;
            const msgH = 36;
            const msgY = shopY + 102;
            drawFrostedPanel(snapshotCanvas, msgX, msgY, msgW, msgH, 10, {
                blur: 10,
                tint: 'rgba(28, 50, 102, 0.42)',
                stroke: 'rgba(183, 209, 255, 0.35)',
                lineWidth: 1.2
            });
            ctx.fillStyle = '#f0f6ff';
            ctx.textBaseline = 'middle';
            ctx.font = '700 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.message, msgX + msgW / 2, msgY + msgH / 2);
        }
        
        const buySelected = this.focusZone === 'footer' && this.footerButtonIndex === 0;
        const backSelected = this.focusZone === 'footer' && this.footerButtonIndex === 1;
        drawFrostedPanel(snapshotCanvas, buttons.buy.x, buttons.buy.y, buttons.buy.w, buttons.buy.h, 16, {
            blur: 10,
            tint: buySelected ? 'rgba(74, 122, 220, 0.54)' : 'rgba(30, 58, 116, 0.42)',
            stroke: buySelected ? 'rgba(230, 242, 255, 0.92)' : 'rgba(165, 194, 243, 0.38)',
            lineWidth: buySelected ? 2.0 : 1.3
        });
        drawFrostedPanel(snapshotCanvas, buttons.back.x, buttons.back.y, buttons.back.w, buttons.back.h, 16, {
            blur: 10,
            tint: backSelected ? 'rgba(74, 122, 220, 0.54)' : 'rgba(30, 58, 116, 0.42)',
            stroke: backSelected ? 'rgba(230, 242, 255, 0.92)' : 'rgba(165, 194, 243, 0.38)',
            lineWidth: backSelected ? 2.0 : 1.3
        });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        let buyFont = 20;
        while (buyFont > 16) {
            ctx.font = `700 ${buyFont}px sans-serif`;
            if (ctx.measureText('購入').width <= buttons.buy.w - 24) break;
            buyFont -= 1;
        }
        ctx.fillText('購入', buttons.buy.x + buttons.buy.w / 2, buttons.buy.y + buttons.buy.h / 2);
        let backFont = 20;
        while (backFont > 16) {
            ctx.font = `700 ${backFont}px sans-serif`;
            if (ctx.measureText('戻る').width <= buttons.back.w - 24) break;
            backFont -= 1;
        }
        ctx.fillText('戻る', buttons.back.x + buttons.back.w / 2, buttons.back.y + buttons.back.h / 2);

        // 操作説明はタイトル画面と同じ見た目・位置に統一
        drawScreenManualLine(ctx, '↑↓：選択 | ←→：購入/戻る | SPACE：決定 | X・ESC：戻る');
        
        ctx.restore();
    }
}

export const shop = new Shop();
