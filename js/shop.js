// ============================================
// Unification of the Nation - ショップ機能
// ============================================

import { SCREEN_WIDTH, CANVAS_HEIGHT, getUiScale, getFontScale } from './constants.js?v=screen-safe-20260815c';
import { input } from './input.js?v=screen-safe-20260815c';
import { audio } from './audio.js?v=screen-safe-20260815c';
import { drawScreenManualLine, drawWafuCard, drawWafuHeading, drawWafuDivider, drawNumMixedText, drawBgCover } from './ui.js?v=screen-safe-20260815c';

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
// 決定の長押しリピート(まとめ買い)。押した直後は1回だけで、
// この時間だけ押し続けてからリピートに入る＝1回買うつもりの押下では暴発しない。
const SHOP_REPEAT_DELAY_MS = 380;
// リピートの初速と、押し続けたときの最短間隔
const SHOP_REPEAT_START_MS = 150;
const SHOP_REPEAT_MIN_MS = 70;

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
        // タッチ端末では一様スケール s で拡大（PC は s=1 で従来値と数値同一）。
        // 縦収まり上限でクランプ（上下に約20px 確保）。s=1 で shopY=62 を再現。
        // shopH=596 は行高 62 化に伴い拡張（旧 556）。
        const s = Math.max(1, Math.min(getUiScale(), (CANVAS_HEIGHT - 40) / 596));
        // fs: フォント専用スケール。s はパネル縦収まりで ~1.14 に頭打ちになるため、
        // 文字だけは実寸アンカー getFontScale() を使って視認性を確保する。PC は fs=1。
        // 上限 1.30*s は行内の縦収まり: 品名(18*fs)と説明(13*fs)の中心間隔が 22*s
        // しかないので、(18+13)/2*fs <= 22*s ⇔ fs <= 1.41*s を割らないと2行が重なる。
        // 余白を見て 1.30*s で止める。
        const fs = Math.max(s, Math.min(getFontScale(), s * 1.30));
        const shopW = 760 * s;
        const shopH = 596 * s;
        const shopX = SCREEN_WIDTH / 2 - shopW / 2;
        const shopY = (CANVAS_HEIGHT - shopH) / 2;
        return { shopX, shopY, shopW, shopH, s, fs };
    }

    getItemRect(index) {
        const { shopX, shopY, shopW, s } = this.getLayout();
        const listTop = shopY + 102 * s;
        // 行高は説明文を読める大きさにするため 54→62 へ拡張（名前と説明の縦余白を確保）。
        const rowH = 62 * s;
        const rowGap = 8 * s;
        return {
            x: shopX + 30 * s,
            y: listTop + index * (rowH + rowGap),
            w: shopW - 60 * s,
            h: rowH
        };
    }

    getFooterButtons() {
        const { shopX, shopY, shopW, shopH, s } = this.getLayout();
        const h = 52 * s;
        const w = 154 * s;
        const gap = 20 * s;
        const totalW = w * 2 + gap;
        const startX = shopX + (shopW - totalW) * 0.5;
        const y = shopY + shopH - h - 30 * s;
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
        
        // 決定。【押しっぱなしで連続購入】できる ― 活力の秘薬をまとめ買いするのに
        // 連打はしんどい(実機フィードバック 2026-08-12)。
        // 誤爆しないよう、押した直後は1回だけ。長押しに入ってから間隔を詰めていく。
        // 「閉じる」側は取り消しなので連続させない(押しっぱなしで閉じ続けない)。
        if (!movedSelectionThisFrame) {
            const confirmHeld = input.isAction('CONFIRM');
            if (!confirmHeld) {
                this.confirmHoldMs = 0;
                this.confirmRepeatTimerMs = 0;
            }
            let fire = false;
            if (input.isActionJustPressed('CONFIRM')) {
                fire = true;
                this.confirmHoldMs = 0;
                this.confirmRepeatTimerMs = 0;
                input.consumeAction('CONFIRM');
            } else if (confirmHeld && this.footerButtonIndex === 0) {
                this.confirmHoldMs = (this.confirmHoldMs || 0) + deltaTime * 1000;
                // 最初の1回から 380ms 置いてリピート開始。以後は 150ms→最短 70ms へ加速
                if (this.confirmHoldMs >= SHOP_REPEAT_DELAY_MS) {
                    this.confirmRepeatTimerMs = (this.confirmRepeatTimerMs || 0) - deltaTime * 1000;
                    if (this.confirmRepeatTimerMs <= 0) {
                        fire = true;
                        const over = this.confirmHoldMs - SHOP_REPEAT_DELAY_MS;
                        this.confirmRepeatTimerMs = Math.max(
                            SHOP_REPEAT_MIN_MS,
                            SHOP_REPEAT_START_MS - over * 0.06
                        );
                    }
                }
            }
            if (fire) {
                if (this.footerButtonIndex === 1) {
                    this.close();
                } else {
                    this.purchase(player);
                }
            }
        }
        
        // 戻るは ESC だけ。X(忍具)は戦闘の手癖で押しやすく、買い物中に
        // 意図せず店を出てしまうため外した(指定 2026-08-12)。
        if (input.isActionJustPressed('PAUSE')) {
            this.close();
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
        const { shopX, shopY, shopW, shopH, s, fs } = this.getLayout();

        // 背景画像（フォールバック：暗幕）
        const _bg = getShopBgImage();
        if (_bg.complete && _bg.naturalWidth > 0) {
            drawBgCover(ctx, _bg, 0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
        } else {
            ctx.fillStyle = '#020610';
            ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
        }

        // 見出し「よろず屋」＋区切り線
        drawWafuHeading(ctx, SCREEN_WIDTH / 2, shopY + 58 * s, 'よろず屋', { size: 30 * fs, ls: 0.14, ruleLen: 48 * s, color: '#f4f9ff' });
        drawWafuDivider(ctx, SCREEN_WIDTH / 2, shopY + 80 * s, (shopW - 96 * s) / 2);

        // 小判（右上）：数字=サンセリフ／和文=明朝
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd96b';
        drawNumMixedText(ctx, `小判 ${formatMoneyValue(player.money)}枚`, shopX + shopW - 32 * s, shopY + 48 * s, 700, 15 * fs, 'right');

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
                radius: 9 * s, selected: isSelected, pulse, accent: isSelected, shadow: isSelected, flat: !isSelected
            });

            if (isSelected) {
                ctx.fillStyle = '#8ec8ff';
                ctx.font = `700 ${15 * fs}px "Zen Old Mincho", serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('◆', rect.x + 26 * s, rect.y + rect.h / 2);
            }

            // 名前
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = dim ? 'rgba(150, 165, 196, 0.6)' : (isSelected ? '#ffffff' : 'rgba(230, 240, 255, 0.92)');
            let titleSize = 18 * fs;
            while (titleSize > 14 * fs) {
                ctx.font = `700 ${titleSize}px "Zen Old Mincho", serif`;
                if (ctx.measureText(item.name).width <= rect.w - 228 * s) break;
                titleSize -= 1;
            }
            ctx.fillText(item.name, rect.x + 58 * s, rect.y + 22 * s);

            // 説明：13px 基準（全項目が行幅に収まることを確認済み）。
            ctx.fillStyle = dim ? 'rgba(140, 154, 182, 0.6)' : 'rgba(196, 214, 247, 0.78)';
            ctx.font = `500 ${13 * fs}px "Zen Old Mincho", serif`;
            const desc = isLocked ? '前提となる術の習得が必要' : item.description;
            ctx.fillText(desc, rect.x + 58 * s, rect.y + 44 * s);

            // 価格：数字=サンセリフ／単位「枚」=明朝
            const price = this.getItemPrice(item);
            let priceText = `${formatMoneyValue(price)}枚`;
            let priceColor = '#ffd96b';
            if (isPurchased) { priceText = '習得済'; priceColor = 'rgba(150, 165, 196, 0.7)'; }
            else if (isLocked) { priceText = '禁制'; priceColor = 'rgba(150, 165, 196, 0.7)'; }
            ctx.fillStyle = priceColor;
            drawNumMixedText(ctx, priceText, rect.x + rect.w - 22 * s, rect.y + rect.h / 2, 700, 15 * fs, 'right');
        });

        // メッセージ
        const buttons = this.getFooterButtons();
        if (this.message) {
            const msgW = shopW - 220 * s;
            const msgX = shopX + (shopW - msgW) * 0.5;
            const msgH = 34 * s;
            const lastRect = this.getItemRect(this.items.length - 1);
            const midY = (lastRect.y + lastRect.h + buttons.buy.y) * 0.5;
            const msgY = midY - msgH * 0.5;
            drawWafuCard(ctx, msgX, msgY, msgW, msgH, { radius: 8 * s, accent: false, shadow: false });
            ctx.fillStyle = '#dbe8ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let messageSize = 15 * fs;
            while (messageSize > 12 * fs) {
                ctx.font = `700 ${messageSize}px "Zen Old Mincho", serif`;
                if (ctx.measureText(this.message).width <= msgW - 24 * s) break;
                messageSize -= 1;
            }
            ctx.fillText(this.message, msgX + msgW / 2, msgY + msgH / 2);
        }

        // ボタン（購入／戻る）
        const buySelected = this.footerButtonIndex === 0;
        const backSelected = this.footerButtonIndex === 1;
        [['購入', buttons.buy, buySelected], ['戻る', buttons.back, backSelected]].forEach(([label, b, sel]) => {
            drawWafuCard(ctx, b.x, b.y, b.w, b.h, { radius: 10 * s, selected: sel, pulse });
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = sel ? '#ffffff' : 'rgba(224, 234, 255, 0.82)';
            let fsize = 18 * fs;
            while (fsize > 14 * fs) {
                ctx.font = `700 ${fsize}px "Zen Old Mincho", serif`;
                if (ctx.measureText(label).width <= b.w - 24 * s) break;
                fsize -= 1;
            }
            ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
        });

        // 操作説明はタイトル画面と同じ見た目・位置に統一
        drawScreenManualLine(ctx, '↑↓：術選択 | ←→：購入/戻る | SPACE：決定 | ESC：戻る');

        ctx.restore();
    }
}

export const shop = new Shop();
