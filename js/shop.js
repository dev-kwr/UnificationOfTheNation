// ============================================
// Unification of the Nation - ショップ機能
// ============================================

import { COLORS, CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER } from './constants.js?v=53';
import { input } from './input.js?v=53';
import { audio } from './audio.js?v=53';
import { drawFlatButton } from './ui.js?v=53';

// ショップアイテム
const SHOP_ITEMS = [
    // ステータス強化
    { id: 'hp_up', name: '体力増強', description: '最大HPを+5（最大8回まで）', price: 100, type: 'upgrade', stat: 'maxHp', value: 5 },
    { id: 'attack_up', name: '剛力の秘術', description: '攻撃力が段階的に上昇（最大3回: 1.2→1.5→2.0倍）', price: 150, type: 'upgrade', stat: 'attackPower', value: 1 },
    { id: 'speed_up', name: '韋駄天の術', description: '移動速度が永久に上昇する', price: 150, type: 'upgrade', stat: 'speed', value: 1.5 },
    
    // スキル
    { id: 'triple_jump', name: '三段跳び', description: '空中跳躍が合計三回可能になる', price: 300, type: 'skill', skill: 'tripleJump' },
    { id: 'quad_jump', name: '四段跳び', description: '究極の移動術。合計四回跳躍可能', price: 600, type: 'skill', skill: 'quadJump' },
];

export class Shop {
    constructor() {
        this.isOpen = false;
        this.selectedIndex = 0;
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
    
    open(player) {
        this.isOpen = true;
        this.updateItemList(player);
        this.selectedIndex = 0;
        this.message = '';
    }
    
    updateItemList(player) {
        // 全アイテムを常に保持し、描画側で完売状態を判定する方針に変更
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
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            audio.playSelect();
            input.consumeAction('UP');
        }
        
        if (input.isActionJustPressed('DOWN')) {
            this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
            audio.playSelect();
            input.consumeAction('DOWN');
        }
        
        if (input.isActionJustPressed('JUMP')) {
            this.purchase(player);
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

            const { shopX, shopY, shopW, shopH } = this.getLayout();

            // 1. 各アイテムのタップ判定
            this.items.forEach((item, i) => {
                const itemY = shopY + 130 + i * 65;
                // アイテム行全体をタップ判定
                if (tx > shopX + 30 && tx < shopX + shopW - 30 && Math.abs(ty - itemY) < 30) {
                    if (this.selectedIndex === i) {
                        // 既に選択中なら購入
                        this.purchase(player);
                    } else {
                        // 未選択なら選択
                        this.selectedIndex = i;
                        audio.playSelect();
                    }
                }
            });

            // 2. 下部ボタンのタップ判定
            const footerY = shopY + shopH - 60;
            // 購入ボタン (BUY)
            if (Math.abs(tx - (shopX + shopW/2 - 80)) < 70 && Math.abs(ty - footerY) < 25) {
                this.purchase(player);
            }
            // 戻るボタン (EXIT)
            if (Math.abs(tx - (shopX + shopW/2 + 80)) < 70 && Math.abs(ty - footerY) < 25) {
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
            this.showMessage('既に購入済みです');
            return;
        }

        // スキルの前提条件チェック（四段跳びなど）
        if (item.id === 'quad_jump' && !this.purchasedSkills.has('triple_jump')) {
            this.showMessage('三段跳びの会得が必要です');
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
                    player.speed = (player.speed || PLAYER.SPEED) + item.value;
                    this.purchasedSkills.add(item.id); // 韋駄天は一回限り
                    this.showMessage('足が速くなった！');
                }
                break;
                
            case 'skill':
                this.purchasedSkills.add(item.id);
                if (item.skill === 'tripleJump') {
                    player.maxJumps = 3;
                    this.showMessage('三段跳びを会得！');
                } else if (item.skill === 'quadJump') {
                    player.maxJumps = 4;
                    this.showMessage('四段跳びを会得！');
                }
                break;
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
        
        ctx.fillStyle = 'rgba(6, 10, 24, 0.96)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        const { shopX, shopY, shopW, shopH } = this.getLayout();
        
        const grad = ctx.createLinearGradient(shopX, shopY, shopX + shopW, shopY + shopH);
        grad.addColorStop(0, 'rgba(12, 22, 52, 0.9)');
        grad.addColorStop(1, 'rgba(8, 12, 32, 0.92)');
        ctx.fillStyle = grad;
        ctx.fillRect(shopX, shopY, shopW, shopH);
        
        ctx.strokeStyle = 'rgba(164, 193, 255, 0.32)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(shopX, shopY, shopW, shopH);
 
        ctx.fillStyle = '#f0f6ff';
        ctx.font = '700 42px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('よろず屋', CANVAS_WIDTH / 2, shopY + 62);
        
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(164, 193, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(shopX + 50, shopY + 80);
        ctx.lineTo(shopX + shopW - 50, shopY + 80);
        ctx.stroke();
 
        ctx.font = '700 20px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffd96b';
        const moneyLabel = `小判: ${player.money}`;
        ctx.fillText(moneyLabel, shopX + shopW - 32, shopY + 55);
 
        this.items.forEach((item, i) => {
            const y = shopY + 130 + i * 65;
            const isSelected = i === this.selectedIndex;
            
            // 完売判定
            let isPurchased = this.purchasedSkills.has(item.id);
            if (item.id === 'hp_up' && this.purchasedUpgrades.hp_up >= 8) isPurchased = true;
            if (item.id === 'attack_up' && this.purchasedUpgrades.attack_up >= 3) isPurchased = true;

            // スキルの表示制限（三段跳びを持っていない時の四段跳びはグレーアウトまたは非表示検討だが、一旦グレーアウト）
            const isLocked = item.id === 'quad_jump' && !this.purchasedSkills.has('triple_jump');
            
            if (isSelected) {
                const rectY = y - 42; // 行の中央に合わせるように微調整
                ctx.fillStyle = 'rgba(76, 122, 220, 0.38)';
                ctx.fillRect(shopX + 30, rectY, shopW - 60, 68);
                ctx.strokeStyle = 'rgba(196, 219, 255, 0.88)';
                ctx.lineWidth = 2;
                ctx.strokeRect(shopX + 30, rectY, shopW - 60, 68);
                ctx.fillStyle = 'rgba(205, 228, 255, 0.95)';
                ctx.font = '700 22px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('◆', shopX + 58, y - 8);
            }
            
            ctx.textAlign = 'left';
            ctx.fillStyle = (isPurchased || isLocked) ? 'rgba(155, 169, 198, 0.7)' : (isSelected ? '#ffffff' : 'rgba(232, 241, 255, 0.93)');
            ctx.font = '700 22px sans-serif';
            ctx.fillText(item.name, shopX + 85, y - 8);
            
            ctx.textAlign = 'right';
            ctx.fillStyle = (isPurchased || isLocked) ? 'rgba(155, 169, 198, 0.7)' : '#ffdb73';
            ctx.font = '700 20px sans-serif';
            let priceText = `${item.price} 枚`;
            if (isPurchased) priceText = '購入済';
            else if (isLocked) priceText = '禁制';
            ctx.fillText(priceText, shopX + shopW - 60, y - 8);
            
            ctx.textAlign = 'left';
            ctx.fillStyle = (isPurchased || isLocked) ? 'rgba(151, 164, 190, 0.7)' : 'rgba(200, 216, 247, 0.82)';
            ctx.font = '500 14px sans-serif';
            const desc = isPurchased ? '既に手に入れている' : (isLocked ? '前提となる術の会得が必要' : item.description);
            ctx.fillText(desc, shopX + 85, y + 16);
        });
        
        if (this.message) {
            ctx.fillStyle = 'rgba(27, 39, 75, 0.88)';
            const msgY = shopY + shopH - 120; // ボタンとかぶらないように上に移動
            ctx.fillRect(shopX + 50, msgY - 25, shopW - 100, 40);
            ctx.fillStyle = '#f0f6ff';
            ctx.font = '700 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.message, CANVAS_WIDTH / 2, msgY + 4);
        }
        
        // タップ用ボタン群
        const footerY = shopY + shopH - 60;
        // 購入ボタン
        drawFlatButton(ctx, shopX + shopW/2 - 80, footerY, 140, 50, '購入', 'rgba(68, 114, 206, 0.58)');
        // 戻るボタン
        drawFlatButton(ctx, shopX + shopW/2 + 80, footerY, 140, 50, '戻る', 'rgba(45, 57, 94, 0.65)');

        // 操作説明（和風モダンなスタイルに合わせて微調整）
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(236, 244, 255, 0.85)';
        ctx.font = '600 20px sans-serif';
        ctx.fillText('↑↓：選択 | SPACE：購入 | X・ESC：戻る', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 35);
        
        ctx.restore();
    }
}

export const shop = new Shop();
