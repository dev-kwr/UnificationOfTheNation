// ============================================
// Unification of the Nation - ショップ機能
// ============================================

import { COLORS, CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { drawFlatButton } from './ui.js';

// ショップアイテム
const SHOP_ITEMS = [
    // ステータス強化
    { id: 'hp_up', name: '体力増強', description: '最大HPを+5', price: 100, type: 'upgrade', stat: 'maxHp', value: 5 },
    { id: 'attack_up', name: '剛力の秘術', description: '攻撃力が永久に上昇する', price: 150, type: 'upgrade', stat: 'attackPower', value: 1 },
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
        this.message = '';
        this.messageTimer = 0;
    }
    
    open() {
        this.isOpen = true;
        this.updateItemList();
        this.selectedIndex = 0;
        this.message = '';
    }
    
    updateItemList() {
        this.items = SHOP_ITEMS.filter(item => {
            if (item.id === 'quad_jump') {
                return this.purchasedSkills.has('triple_jump');
            }
            return true;
        });
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
        }
        
        if (input.isActionJustPressed('DOWN')) {
            this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
            audio.playSelect();
        }
        
        if (input.isActionJustPressed('ATTACK')) {
            this.purchase(player);
        }
        
        if (input.isActionJustPressed('SPECIAL') || input.isActionJustPressed('SUB_WEAPON') || input.isActionJustPressed('PAUSE')) {
            this.close();
        }

        // --- タッチ/タップ操作 ---
        if (input.touchJustPressed) {
            const tx = input.lastTouchX;
            const ty = input.lastTouchY;

            const shopX = CANVAS_WIDTH / 2 - 250;
            const shopY = 60;
            const shopW = 500;

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
            const footerY = shopY + (CANVAS_HEIGHT - 120) - 60;
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

        // 売り切れチェック (全てのアイテムIDでチェック)
        if (this.purchasedSkills.has(item.id)) {
            this.showMessage('売り切れです');
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
                    this.showMessage(`最大HPが${item.value}増えた！`);
                } else if (item.stat === 'attackPower') {
                    player.attackPower = (player.attackPower || 1) + item.value;
                    this.showMessage('剛力が増した！');
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
        }
        
        if (item.type === 'skill') {
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
        
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)'; // ゲーム画面を完全に隠す
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        const shopX = CANVAS_WIDTH / 2 - 250;
        const shopY = 60;
        const shopW = 500;
        const shopH = CANVAS_HEIGHT - 120;
        
        const grad = ctx.createLinearGradient(shopX, shopY, shopX + shopW, shopY + shopH);
        grad.addColorStop(0, '#f5f5dc');
        grad.addColorStop(1, '#e8e8c8');
        ctx.fillStyle = grad;
        ctx.fillRect(shopX, shopY, shopW, shopH);
        
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = 8;
        ctx.strokeRect(shopX + 4, shopY + 4, shopW - 8, shopH - 8);
        
        ctx.strokeStyle = '#d2691e';
        ctx.lineWidth = 1;
        ctx.strokeRect(shopX + 12, shopY + 12, shopW - 24, shopH - 24);

        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 36px serif';
        ctx.textAlign = 'center';
        ctx.fillText('よろず屋', CANVAS_WIDTH / 2, shopY + 60);
        
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(shopX + 50, shopY + 80);
        ctx.lineTo(shopX + shopW - 50, shopY + 80);
        ctx.stroke();

        ctx.font = 'bold 20px serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#8b4513';
        const moneyLabel = `金貨: ${player.money} 枚`;
        ctx.fillText(moneyLabel, shopX + shopW - 40, shopY + 55);

        this.items.forEach((item, i) => {
            const y = shopY + 130 + i * 65;
            const isSelected = i === this.selectedIndex;
            const isPurchased = this.purchasedSkills.has(item.id);
            
            if (isSelected) {
                ctx.fillStyle = 'rgba(210, 105, 30, 0.2)';
                ctx.fillRect(shopX + 30, y - 25, shopW - 60, 65);
                ctx.strokeStyle = '#d2691e';
                ctx.lineWidth = 2;
                ctx.strokeRect(shopX + 30, y - 25, shopW - 60, 65);
                ctx.fillStyle = '#d2691e';
                ctx.font = '24px serif';
                ctx.textAlign = 'center';
                ctx.fillText('◆', shopX + 55, y + 8);
            }
            
            ctx.textAlign = 'left';
            ctx.fillStyle = isPurchased ? '#888' : (isSelected ? '#cc4400' : '#333');
            ctx.font = 'bold 22px serif';
            ctx.fillText(item.name, shopX + 80, y + 8);
            
            ctx.textAlign = 'right';
            ctx.fillStyle = isPurchased ? '#888' : '#8b0000';
            ctx.font = 'bold 20px serif';
            const priceText = isPurchased ? '済' : `${item.price} 枚`;
            ctx.fillText(priceText, shopX + shopW - 60, y + 8);
            
            ctx.textAlign = 'left';
            ctx.fillStyle = isPurchased ? '#aaa' : '#666';
            ctx.font = '14px serif';
            ctx.fillText(item.description, shopX + 80, y + 30);
        });
        
        if (this.message) {
            ctx.fillStyle = 'rgba(139, 0, 0, 0.9)';
            const msgY = shopY + shopH - 120; // ボタンとかぶらないように上に移動
            ctx.fillRect(shopX + 50, msgY - 25, shopW - 100, 40);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.message, CANVAS_WIDTH / 2, msgY + 4);
        }
        
        // タップ用ボタン群
        const footerY = shopY + shopH - 60;
        // 購入ボタン
        drawFlatButton(ctx, shopX + shopW/2 - 80, footerY, 140, 50, 'Z: 購入', 'rgba(150, 50, 0, 0.6)');
        // 進むボタン
        drawFlatButton(ctx, shopX + shopW/2 + 80, footerY, 140, 50, 'X: 進む', 'rgba(50, 50, 50, 0.6)');
        
        ctx.restore();
    }
}

export const shop = new Shop();
