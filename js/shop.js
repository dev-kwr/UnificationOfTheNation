// ============================================
// Unification of the Nation - ショップ機能
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { drawScreenManualLine, drawWafuCard, drawWafuHeading, drawWafuDivider, drawNumMixedText } from './ui.js';

// 背景画像キャッシュ
let _shopBgImg = null;
function getShopBgImage() {
    if (!_shopBgImg) {
        _shopBgImg = new Image();
        _shopBgImg.src = './images/shop_bg.png';
    }
    return _shopBgImg;
}

function formatMoneyValue(amount) {
    const safe = Math.max(0, Math.floor(Number(amount) || 0));
    return safe.toLocaleString('ja-JP');
}

// ショップアイテム
const SHOP_ITEMS = [
    // ステータス強化
    { id: 'hp_up', name: '活力の秘薬', description: '最大HPを+5', price: 100, type: 'upgrade', stat: 'maxHp', value: 5 },
    { id: 'attack_up', name: '剛力の秘薬', description: '攻撃力が段階的に上昇（最大3回: 1.2→1.5→2.0倍）', price: 500, type: 'upgrade', stat: 'attackPower', value: 1 },
    { id: 'speed_up', name: '韋駄天の秘術', description: '常時ダッシュ状態で移動可能になる', price: 2000, type: 'upgrade', stat: 'speed', value: 1.5 },
    
    // スキル
    { id: 'double_jump', name: '二段跳び', description: '空中で一回追加跳躍が可能になる', price: 500, type: 'skill', skill: 'doubleJump' },
    { id: 'triple_jump', name: '三段跳び', description: '空中跳躍が合計三回可能になる', price: 1000, type: 'skill', skill: 'tripleJump' },
];

export class Shop {
    constructor() {
        this.isOpen = false;
        this.selectedIndex = 0;
        this.footerButtonIndex = 0; // 0:購入, 1:戻る
        this.items = [...SHOP_ITEMS];
        this.purchasedSkills = new Set();
        this.purchasedUpgrades = { hp_up: 0, attack_up: 0 };
        this.message = '';
        this.messageTimer = 0;
    }

    reset() {
        this.purchasedSkills = new Set();
        this.purchasedUpgrades = { hp_up: 0, attack_up: 0 };
        this.selectedIndex = 0;
        this.footerButtonIndex = 0;
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
        const listTop = shopY + 102;
        const rowH = 54;
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
        const h = 52;
        const w = 154;
        const gap = 20;
        const totalW = w * 2 + gap;
        const startX = shopX + (shopW - totalW) * 0.5;
        const y = shopY + shopH - h - 30;
        return {
            buy: { x: startX, y, w, h },
            back: { x: startX + w + gap, y, w, h }
        };
    }
    
    open(player) {
        this.isOpen = true;
        this.updateItemList(player);
        this.selectedIndex = 0;
        this.footerButtonIndex = 0;
        this.message = '';
    }
    
    updateItemList() {
        this.items = SHOP_ITEMS.map((item) => ({
            ...item,
            price: this.getItemPrice(item)
        }));
    }

    getItemPrice(itemOrId) {
        const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
        if (id === 'attack_up') {
            // 500 -> 1000 -> 1500
            return 500 + this.purchasedUpgrades.attack_up * 500;
        }
        if (id === 'hp_up') {
            return 100;
        }
        const item = SHOP_ITEMS.find((row) => row.id === id);
        return item ? item.price : 0;
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
        let movedSelectionThisFrame = false;
        if (input.isActionJustPressed('UP')) {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            audio.playSelect();
            input.consumeAction('UP');
            movedSelectionThisFrame = true;
        }
        
        if (input.isActionJustPressed('DOWN')) {
            this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
            audio.playSelect();
            input.consumeAction('DOWN');
            movedSelectionThisFrame = true;
        }

        if (input.isActionJustPressed('LEFT')) {
            this.footerButtonIndex = Math.max(0, this.footerButtonIndex - 1);
            audio.playSelect();
            input.consumeAction('LEFT');
        }

        if (input.isActionJustPressed('RIGHT')) {
            this.footerButtonIndex = Math.min(1, this.footerButtonIndex + 1);
            audio.playSelect();
            input.consumeAction('RIGHT');
        }
        
        if (!movedSelectionThisFrame && input.isActionJustPressed('CONFIRM')) {
            if (this.footerButtonIndex === 1) {
                this.close();
            } else {
                this.purchase(player);
            }
            input.consumeAction('CONFIRM');
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
                this.footerButtonIndex = 0;
                this.purchase(player);
            }

            if (
                tx > buttons.back.x &&
                tx < buttons.back.x + buttons.back.w &&
                ty > buttons.back.y &&
                ty < buttons.back.y + buttons.back.h
            ) {
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
        
        const price = this.getItemPrice(item);
        if (player.money < price) {
            this.showMessage('お金が足りません！');
            return;
        }

        if (typeof player.addMoney === 'function') {
            player.addMoney(-price);
        } else {
            player.money -= price;
        }
        
        switch (item.type) {
            case 'upgrade':
                if (item.stat === 'maxHp') {
                    player.maxHp += item.value;
                    player.hp = player.maxHp;
                    this.purchasedUpgrades.hp_up++;
                    this.showMessage(`最大HPが${item.value}増えた！`);
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
        
        audio.playItemPurchase();
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
        // 呼び出し側の影/合成状態に影響されないようリセット（自己完結描画）
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 1;
        ctx.textBaseline = 'alphabetic';

        const pulse = (Math.sin(Date.now() * 0.0026) + 1) * 0.5;
        const { shopX, shopY, shopW, shopH } = this.getLayout();

        // 背景画像（フォールバック：暗幕）
        const _bg = getShopBgImage();
        if (_bg.complete && _bg.naturalWidth > 0) {
            ctx.drawImage(_bg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
            ctx.fillStyle = '#020610';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        // 見出し「よろず屋」＋区切り線
        drawWafuHeading(ctx, CANVAS_WIDTH / 2, shopY + 58, 'よろず屋', { size: 30, ls: 0.14, ruleLen: 48, color: '#f4f9ff' });
        drawWafuDivider(ctx, CANVAS_WIDTH / 2, shopY + 80, (shopW - 96) / 2);

        // 小判（右上）：数字=サンセリフ／和文=明朝
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd96b';
        drawNumMixedText(ctx, `小判 ${formatMoneyValue(player.money)}枚`, shopX + shopW - 32, shopY + 48, 700, 15, 'right');

        // アイテム行
        this.items.forEach((item, i) => {
            const rect = this.getItemRect(i);
            const isSelected = i === this.selectedIndex;

            // 完売判定
            let isPurchased = this.purchasedSkills.has(item.id);
            if (item.id === 'attack_up' && this.purchasedUpgrades.attack_up >= 3) isPurchased = true;
            const isLocked = item.id === 'triple_jump' && !this.purchasedSkills.has('double_jump');
            const dim = isPurchased || isLocked;

            // 選択行のみ発光＋上辺アクセント、非選択はフラット（外カードと重なって立体感が出ないよう）
            drawWafuCard(ctx, rect.x, rect.y, rect.w, rect.h, {
                radius: 9, selected: isSelected, pulse, accent: isSelected, shadow: isSelected, flat: !isSelected
            });

            if (isSelected) {
                ctx.fillStyle = '#8ec8ff';
                ctx.font = '700 15px "Zen Old Mincho", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('◆', rect.x + 26, rect.y + rect.h / 2);
            }

            // 名前
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = dim ? 'rgba(150, 165, 196, 0.6)' : (isSelected ? '#ffffff' : 'rgba(230, 240, 255, 0.92)');
            let titleSize = 18;
            while (titleSize > 14) {
                ctx.font = `700 ${titleSize}px "Zen Old Mincho", serif`;
                if (ctx.measureText(item.name).width <= rect.w - 228) break;
                titleSize -= 1;
            }
            ctx.fillText(item.name, rect.x + 58, rect.y + 20);

            // 説明
            ctx.fillStyle = dim ? 'rgba(140, 154, 182, 0.6)' : 'rgba(196, 214, 247, 0.78)';
            ctx.font = '500 11px "Zen Old Mincho", serif';
            const desc = isLocked ? '前提となる術の習得が必要' : item.description;
            ctx.fillText(desc, rect.x + 58, rect.y + 40);

            // 価格：数字=サンセリフ／単位「枚」=明朝
            const price = this.getItemPrice(item);
            let priceText = `${formatMoneyValue(price)}枚`;
            let priceColor = '#ffd96b';
            if (isPurchased) { priceText = '習得済'; priceColor = 'rgba(150, 165, 196, 0.7)'; }
            else if (isLocked) { priceText = '禁制'; priceColor = 'rgba(150, 165, 196, 0.7)'; }
            ctx.fillStyle = priceColor;
            drawNumMixedText(ctx, priceText, rect.x + rect.w - 22, rect.y + rect.h / 2, 700, 15, 'right');
        });

        // メッセージ
        const buttons = this.getFooterButtons();
        if (this.message) {
            const msgW = shopW - 220;
            const msgX = shopX + (shopW - msgW) * 0.5;
            const msgH = 34;
            const lastRect = this.getItemRect(this.items.length - 1);
            const midY = (lastRect.y + lastRect.h + buttons.buy.y) * 0.5;
            const msgY = midY - msgH * 0.5;
            drawWafuCard(ctx, msgX, msgY, msgW, msgH, { radius: 8, accent: false, shadow: false });
            ctx.fillStyle = '#dbe8ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let messageSize = 15;
            while (messageSize > 12) {
                ctx.font = `700 ${messageSize}px "Zen Old Mincho", serif`;
                if (ctx.measureText(this.message).width <= msgW - 24) break;
                messageSize -= 1;
            }
            ctx.fillText(this.message, msgX + msgW / 2, msgY + msgH / 2);
        }

        // ボタン（購入／戻る）
        const buySelected = this.footerButtonIndex === 0;
        const backSelected = this.footerButtonIndex === 1;
        [['購入', buttons.buy, buySelected], ['戻る', buttons.back, backSelected]].forEach(([label, b, sel]) => {
            drawWafuCard(ctx, b.x, b.y, b.w, b.h, { radius: 10, selected: sel, pulse });
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = sel ? '#ffffff' : 'rgba(224, 234, 255, 0.82)';
            let fsize = 18;
            while (fsize > 14) {
                ctx.font = `700 ${fsize}px "Zen Old Mincho", serif`;
                if (ctx.measureText(label).width <= b.w - 24) break;
                fsize -= 1;
            }
            ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
        });

        // 操作説明はタイトル画面と同じ見た目・位置に統一
        drawScreenManualLine(ctx, '↑↓：術選択 | ←→：購入/戻る | SPACE：決定 | X・ESC：戻る');

        ctx.restore();
    }
}

export const shop = new Shop();
