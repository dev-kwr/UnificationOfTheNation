// ============================================
// Unification of the Nation - 武器クラス
// ============================================

import { COLORS, GRAVITY } from './constants.js';
import { audio } from './audio.js';

// 爆弾クラス
export class Bomb {
    constructor(x, y, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.vx = velocityX;
        this.vy = velocityY;
        this.radius = 8;
        this.isExploding = false;
        this.explosionTimer = 0;
        this.explosionDuration = 300;
        this.explosionRadius = 60;
        this.damage = 30;
        this.damage = 30;
        this.isDestroyed = false;
        this.id = Math.random().toString(36).substr(2, 9); // 一意なID
    }
    
    update(deltaTime, groundY, enemies = []) {
        if (this.isExploding) {
            this.explosionTimer += deltaTime * 1000;
            if (this.explosionTimer >= this.explosionDuration) {
                this.isDestroyed = true;
            }
            return;
        }
        
        // 物理演算
        this.vy += GRAVITY * 0.5;
        this.x += this.vx;
        this.y += this.vy;
        
        // 地面に当たったら爆発
        if (this.y + this.radius >= groundY) {
            this.explode();
        }
        
        // 敵に当たったら爆発
        for (const enemy of enemies) {
            if (this.intersectsEnemy(enemy)) {
                this.explode();
                break;
            }
        }
    }
    
    intersectsEnemy(enemy) {
        const closestX = Math.max(enemy.x, Math.min(this.x, enemy.x + enemy.width));
        const closestY = Math.max(enemy.y, Math.min(this.y, enemy.y + enemy.height));
        const distanceX = this.x - closestX;
        const distanceY = this.y - closestY;
        return (distanceX * distanceX + distanceY * distanceY) < (this.radius * this.radius);
    }
    
    explode() {
        this.isExploding = true;
        this.explosionTimer = 0;
        this.vx = 0;
        this.vy = 0;
        audio.playExplosion();
    }
    
    // 爆発範囲内の敵を取得
    getEnemiesInExplosion(enemies) {
        if (!this.isExploding) return [];
        
        return enemies.filter(enemy => {
            const centerX = enemy.x + enemy.width / 2;
            const centerY = enemy.y + enemy.height / 2;
            const dx = this.x - centerX;
            const dy = this.y - centerY;
            return Math.sqrt(dx * dx + dy * dy) <= this.explosionRadius;
        });
    }
    
    render(ctx) {
        if (this.isExploding) {
            // 爆発エフェクト
            const progress = this.explosionTimer / this.explosionDuration;
            const currentRadius = this.explosionRadius * (0.5 + progress * 0.5);
            
            // 外側のオレンジ
            ctx.fillStyle = `rgba(255, 102, 0, ${1 - progress})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // 内側の黄色
            ctx.fillStyle = `rgba(255, 255, 0, ${1 - progress})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius * 0.6, 0, Math.PI * 2);
            ctx.fill();
            
            // 中心の白
            ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius * 0.3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 爆弾本体
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            
            // 導火線
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - this.radius);
            ctx.quadraticCurveTo(
                this.x + 5, this.y - this.radius - 8,
                this.x + 3, this.y - this.radius - 12
            );
            ctx.stroke();
            
            // 火花
            ctx.fillStyle = '#FF6600';
            ctx.beginPath();
            ctx.arc(this.x + 3, this.y - this.radius - 12, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// サブ武器ベースクラス
export class SubWeapon {
    constructor(name, damage, range, cooldown) {
        this.name = name;
        this.damage = damage;
        this.range = range;
        this.cooldown = cooldown;
    }
    
    use(player) {
        // オーバーライド用
    }
    
    render(ctx, player) {
        // オーバーライド用
    }
}

// 大槍
export class Spear extends SubWeapon {
    constructor() {
        super('大槍', 25, 120, 400); // リーチを80から120へ
        this.isAttacking = false;
        this.attackTimer = 0;
    }
    
    use(player) {
        this.isAttacking = true;
        this.attackTimer = 250; 
        audio.playSlash(2); 
        
        // 踏み込み距離を大幅に強化 (45 -> 70: 画面端まで届くような突き)
        const direction = player.facingRight ? 1 : -1;
        player.vx += direction * 70;
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }
    }
    
    getHitbox(player) {
        if (!this.isAttacking) return null;
        
        const direction = player.facingRight ? 1 : -1;
        return {
            x: player.x + (player.facingRight ? player.width : -this.range),
            y: player.y + 15,
            width: this.range,
            height: 20
        };
    }
    
    render(ctx, player) {
        if (!this.isAttacking) return;
        
        const centerX = player.x + player.width / 2;
        const y = player.y + 25;
        const direction = player.facingRight ? 1 : -1;
        const spearEnd = centerX + direction * this.range;
        
        ctx.save();
        
        // 1. 柄（え）
        ctx.strokeStyle = '#3d2b1f'; // 暗い木の茶色
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(spearEnd - direction * 15, y); // 穂先の手前まで
        ctx.stroke();
        
        // 2. 飾り房（赤い房）
        ctx.fillStyle = '#d32f2f'; // 鮮やかな赤
        ctx.beginPath();
        ctx.arc(spearEnd - direction * 15, y + 2, 6, 0, Math.PI, false);
        ctx.fill();
        ctx.fillRect(spearEnd - direction * 17, y + 2, 4, 8); // 房の垂れ
        
        // 3. 穂先（鋼の鋭い先端）
        const tipLen = 20;
        const tipWidth = 8;
        ctx.fillStyle = '#e0e0e0'; // 銀色
        ctx.strokeStyle = '#9e9e9e';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.moveTo(spearEnd, y); // 先端
        ctx.lineTo(spearEnd - direction * tipLen, y - tipWidth);
        ctx.lineTo(spearEnd - direction * (tipLen + 5), y);
        ctx.lineTo(spearEnd - direction * tipLen, y + tipWidth);
        ctx.closePath();
        ctx.globalAlpha = 1.0;
        ctx.restore();
        
        // 4. 突きのエフェクト (衝撃波・風切り)
        const progress = this.attackTimer / 250; // 1.0 -> 0.0
        if (progress > 0) {
            ctx.save();
            ctx.translate(spearEnd, y);
            ctx.scale(direction, 1); // 常に右向きとして描画し、directionで反転
            
            const alpha = Math.sin(progress * Math.PI); // ふわっと消える
            
            // 鋭い衝撃波 (三角形・コーン状)
            ctx.fillStyle = `rgba(200, 255, 255, ${alpha * 0.8})`;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(60 + progress * 20, -15 * progress); // 上へ広がる
            ctx.lineTo(80 + progress * 40, 0); // 先端 (遠くへ)
            ctx.lineTo(60 + progress * 20, 15 * progress); // 下へ広がる
            ctx.fill();
            
            // 芯のライン (白く鋭く)
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(100, 0); // 貫通するような長い線
            ctx.stroke();
            
            // 上下の風切り線
            ctx.strokeStyle = `rgba(150, 255, 255, ${alpha * 0.5})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(10, -5);
            ctx.lineTo(70, -20);
            ctx.moveTo(10, 5);
            ctx.lineTo(70, 20);
            ctx.stroke();
            
            ctx.restore();
        }
    }
}

// 二刀
export class DualBlades extends SubWeapon {
    constructor() {
        super('二刀', 20, 60, 200);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackType = 'combined'; // 'left', 'right', 'combined'
        this.projectiles = []; 
        this.comboIndex = 0; // 連撃パターン用
        this.pendingCombinedProjectile = null;
    }
    
    use(player, type = 'combined') {
        this.isAttacking = true;
        this.attackType = type;
        
        if (type === 'combined') {
            this.attackTimer = 220;
            // 振り下ろしタイミングで発射するため、一旦保留
            this.pendingCombinedProjectile = {
                x: player.x + player.width / 2,
                y: player.y + player.height / 2,
                vx: (player.facingRight ? 1 : -1) * 10, // 弾速を遅く (15 -> 10)
                life: 600, // 寿命を延ばす (400 -> 600) で射程維持
                maxLife: 600,
                direction: player.facingRight ? 1 : -1
            };
            audio.playSlash(2);
        } else if (type === 'left') {
            this.attackTimer = 150;
            // 4段コンボのループ (0 -> 1 -> 2 -> 3 -> 0)
            this.comboIndex = (this.comboIndex + 1) % 4;
            audio.playSlash(1);
        } else {
            this.attackTimer = 150;
            audio.playSlash(0);
        }
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            // 合体攻撃は前半を溜め、後半の振り下ろしで飛翔斬撃を出す
            if (this.attackType === 'combined' && this.pendingCombinedProjectile && this.attackTimer <= 70) {
                this.projectiles.push(this.pendingCombinedProjectile);
                this.pendingCombinedProjectile = null;
            }
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.pendingCombinedProjectile = null;
            }
        }
        
        // 飛ぶ斬撃の移動と寿命更新
        if (this.projectiles.length > 0) {
            this.projectiles = this.projectiles.filter(p => {
                p.x += p.vx;
                p.life -= deltaTime * 1000;
                return p.life > 0;
            });
        }
    }
    
    getHitbox(player) {
        const hitboxes = [];
        if (this.isAttacking) {
            const direction = player.facingRight ? 1 : -1;
            
            // Xキー（左手）
            if (this.attackType === 'left') {
                if (this.comboIndex === 3) {
                    // 回転斬り (全方位)
                    const sRange = this.range * 1.5;
                    hitboxes.push({
                        x: player.x + player.width / 2 - sRange,
                        y: player.y + player.height / 2 - sRange,
                        width: sRange * 2,
                        height: sRange * 2
                    });
                } else {
                    // 通常は「後ろ」のみ
                    hitboxes.push({
                        x: player.x + (player.facingRight ? -this.range * 1.2 : player.width), // 背後
                        y: player.y - 10,
                        width: this.range * 1.2,
                        height: 60
                    });
                }
            } else {
                // Zキー（右手）や合体攻撃は「前」
                if (this.comboIndex === 3) {
                     // 回転斬り (全方位)
                    const sRange = this.range * 1.5;
                    hitboxes.push({
                        x: player.x + player.width / 2 - sRange,
                        y: player.y + player.height / 2 - sRange,
                        width: sRange * 2,
                        height: sRange * 2
                    });
                } else {
                    hitboxes.push({
                        x: player.x + (player.facingRight ? player.width : -this.range * 1.2),
                        y: player.y - 10,
                        width: this.range * 1.2,
                        height: 60
                    });
                }
            }
        }
        for (const p of this.projectiles) {
            hitboxes.push({
                x: p.x - 40, y: p.y - 40,
                width: 80, height: 80
            });
        }
        return hitboxes.length > 0 ? hitboxes : null;
    }
    
    render(ctx, player) {
        const direction = player.facingRight ? 1 : -1;
        
        // 1. 飛翔する交差斬撃（高輝度の三日月クロス）
        for (const p of this.projectiles) {
            const alpha = p.life / p.maxLife;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(p.direction * 1.35, 1.35);

            const travelRatio = 1 - alpha;
            const forward = travelRatio * 18;
            const drawCrescent = (color, angle) => {
                ctx.save();
                ctx.translate(forward, 0);
                ctx.rotate(angle);
                ctx.globalAlpha = alpha;
                ctx.shadowColor = color;
                ctx.shadowBlur = 20;
                ctx.fillStyle = color;

                ctx.beginPath();
                ctx.moveTo(0, -46);
                ctx.bezierCurveTo(24, -22, 24, 22, 0, 46);
                ctx.bezierCurveTo(7, 22, 7, -22, 0, -46);
                ctx.fill();

                ctx.restore();
            };

            // 近接の剣筋と色対応を揃える（上: 赤、下: 青）
            drawCrescent('rgba(255, 80, 80, 0.98)', -Math.PI / 4);
            drawCrescent('rgba(80, 200, 255, 0.98)', Math.PI / 4);

            ctx.restore();
        }

        if (!this.isAttacking) return;
        
        const isCombined = this.attackType === 'combined';
        // 合体攻撃(C)は飛翔斬撃のみ表示（手前の剣筋は描かない）
        if (isCombined) return;
        const progress = Math.max(0, this.attackTimer / (isCombined ? 300 : 150));
        const centerX = player.x + player.width / 2;
        const centerY = player.y + player.height / 2;
        
        // 共通描画関数
        const drawAttack = (slashColor, angleStart, angleEnd, isBackwards, drawModel) => {
            ctx.save();
            ctx.translate(centerX, centerY);
            
            // 向き設定 (isBackwardsなら背後を向く)
            const dir = direction * (isBackwards ? -1 : 1);
            ctx.scale(dir, 1);
            
            // 剣の角度
            const currentAngle = angleStart + (angleEnd - angleStart) * (1 - progress);
            
            // --- 1. 剣の描画 (完全に白、発光なし) ---
            // 右手(Z)の場合はプレイヤー本体が描画しているので、ここでは描画しない (重複防止)
            // 左手(X)の場合は描画する
            if (drawModel) {
                ctx.save();
                ctx.rotate(currentAngle);
                
                const swordLen = this.range;
                
                // 鍔
                ctx.fillStyle = '#111';
                ctx.fillRect(10, -2.2, 3.2, 4.4);
                // はばき
                ctx.fillStyle = '#c9a545';
                ctx.fillRect(12.7, -1.9, 1.6, 3.8);
                
                // 刀身（日本刀: 上側は直線、下側は反り）
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(14, -1.35);
                ctx.lineTo(swordLen - 2.2, -1.35); // 上側(棟側)はまっすぐ
                ctx.lineTo(swordLen + 0.8, 0);      // 切先
                ctx.quadraticCurveTo(swordLen - 8.5, 1.95, 14, 1.25); // 下側(刃側)は反る
                ctx.fill();
                
                // 峰
                ctx.fillStyle = '#aaa';
                ctx.beginPath();
                ctx.moveTo(14, -0.55);
                ctx.lineTo(swordLen - 4.8, -0.55);
                ctx.quadraticCurveTo(swordLen - 8.5, 0.15, 14, 0.35);
                ctx.fill();
                
                ctx.restore(); 
            }
            
            // --- 2. 斬撃エフェクト (キャラ手前の円弧) ---
            // ユーザー要望: Zキー(stroke arc)と全く同じ見た目に合わせる
            
            ctx.save();
            ctx.rotate(currentAngle);
            
            const slashAlpha = 0.8 * (1 - progress); // フェードアウト
            
            // 色のセットアップ (alpha適用)
            const baseColorPrefix = slashColor.substring(0, slashColor.lastIndexOf(','));
            const finalColor = `${baseColorPrefix}, ${slashAlpha})`;
            
            ctx.shadowBlur = 10;
            ctx.shadowColor = finalColor;
            
            // 外側の太いライン (色付き)
            ctx.strokeStyle = finalColor;
            ctx.lineWidth = 13;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (Math.abs(angleEnd - angleStart) > 4) {
                // 全方位 (回転)
                ctx.arc(0, 0, this.range + 8, 0, Math.PI * 2);
            } else {
                // 通常の円弧
                ctx.arc(-6, 0, this.range + 10, -0.72, 0.72);
            }
            ctx.stroke();
            

            
            ctx.restore();
            
            ctx.restore(); // 【重要】drawAttack冒頭のctx.save()に対するrestore
        };

        // 合体攻撃は振り下ろしフェーズから剣筋を表示
        const swingPhase = 1 - progress;
        if (isCombined && swingPhase < 0.32) return;

        // --- 右手攻撃 (Zキー相当) - 前方・水色 ---
        // 剣本体はプレイヤーが描画するので、エフェクトのみ (drawModel = false)
        // ★修正: Zキー(attackType='right')の時はプレイヤー側で完全に描画されるので、ここでは何もしない。
        // 合体攻撃(combined)の時だけ、ここで右手分を描画する。
        // --- 左手攻撃 (Xキー相当) - 後方・赤色 ---
        // 左手はプレイヤーが持っていないので、剣も描画する (drawModel = true)
        // 合体時は先に描画 (奥側)
        if (isCombined || this.attackType === 'left') {
            ctx.save();
            if (isCombined) ctx.translate(2, 8); // 交差点を体の前に寄せる
            const redSlash = 'rgba(255, 90, 90, 0.9)';
            
            let start = -Math.PI * 0.5;
            let end = Math.PI * 0.2;
            
            if (!isCombined) {
                // Xキー後方攻撃: 引きつけてから後ろを払う自然な軌道
                if (this.comboIndex === 0) { // 斜め上から斜め下へ
                    start = -Math.PI * 0.75; end = Math.PI * 0.22;
                } else if (this.comboIndex === 1) { // 横薙ぎ
                    start = -Math.PI * 0.5; end = Math.PI * 0.5;
                } else if (this.comboIndex === 2) { // 返し斬り
                    start = Math.PI * 0.28; end = -Math.PI * 0.55;
                } else { // 3: 回転 (全方位)
                    start = 0; end = Math.PI * 2;
                }
            } else {
                // 合体(赤): 振り下ろし軌道
                start = -Math.PI * 0.95; end = Math.PI * 0.18;
            }
            
            // 後ろ判定
            const hitBack = !isCombined; 
            drawAttack(redSlash, start, end, hitBack, false);
            ctx.restore();
        }

        // --- 右手攻撃 (Zキー相当) - 前方・水色 ---
        // 合体時のみここで描画 (手前側)
        if (isCombined) {
            ctx.save();
            ctx.translate(2, -8); // 交差点を体の前に寄せる
            // 青: 逆側からの振り下ろしで交差
            drawAttack('rgba(80, 190, 255, 0.9)', Math.PI * 0.95, -Math.PI * 0.18, false, false);
            ctx.restore();
        }
    }


}

// 鎖鎌
export class Kusarigama extends SubWeapon {
    constructor() {
        super('鎖鎌', 15, 120, 600);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.chainLength = 0;
    }
    
    use(player) {
        this.isAttacking = true;
        this.attackTimer = 400;
        this.chainLength = 0;
        audio.playDash(); // 鎖のシュルシュル音代用
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            // 鎖が伸びる
            const progress = 1 - (this.attackTimer / 400);
            if (progress < 0.5) {
                this.chainLength = this.range * (progress * 2);
            } else {
                this.chainLength = this.range * (1 - (progress - 0.5) * 2);
            }
            
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }
    }
    
    getHitbox(player) {
        if (!this.isAttacking || this.chainLength < 20) return null;
        
        const direction = player.facingRight ? 1 : -1;
        return {
            x: player.x + player.width / 2 + direction * (this.chainLength - 20),
            y: player.y + 20,
            width: 30,
            height: 30
        };
    }
    
    render(ctx, player) {
        if (!this.isAttacking) return;
        
        ctx.save();
        
        const centerX = player.x + player.width / 2;
        const y = player.y + 30;
        const direction = player.facingRight ? 1 : -1;
        
        // 鎖
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX + direction * this.chainLength, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 鎌
        if (this.chainLength > 20) {
            ctx.strokeStyle = '#C0C0C0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(
                centerX + direction * this.chainLength,
                y,
                15,
                direction > 0 ? -Math.PI / 2 : Math.PI / 2,
                direction > 0 ? Math.PI / 2 : -Math.PI / 2
            );
            ctx.stroke();
        }
        
        ctx.restore();
    }
}

// 大太刀
export class Nodachi extends SubWeapon {
    constructor() {
        super('大太刀', 40, 60, 700);
        this.isAttacking = false;
        this.attackTimer = 0;
    }
    
    use(player) {
        this.isAttacking = true;
        this.attackTimer = 300;
        audio.playSlash(4); // 低く重い音
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }
    }
    
    getHitbox(player) {
        if (!this.isAttacking) return null;
        
        // 広い範囲
        return {
            x: player.x + (player.facingRight ? player.width : -this.range),
            y: player.y,
            width: this.range,
            height: player.height
        };
    }
    
    render(ctx, player) {
        if (!this.isAttacking) return;
        
        const centerX = player.x + player.width / 2;
        const direction = player.facingRight ? 1 : -1;
        const swingProgress = 1 - (this.attackTimer / 300);
        const angle = direction * (-Math.PI / 4 + swingProgress * Math.PI / 2);
        
        ctx.save();
        ctx.translate(centerX, player.y + 30);
        ctx.rotate(angle);
        
        // 大太刀
        ctx.strokeStyle = '#C0C0C0';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.range, 0);
        ctx.stroke();
        
        // 柄
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-15, 0);
        ctx.stroke();
        
        ctx.restore();
        
        // 衝撃波エフェクト
        if (swingProgress > 0.3 && swingProgress < 0.7) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 - Math.abs(swingProgress - 0.5)})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(
                centerX + direction * this.range * 0.5,
                player.y + player.height / 2,
                30 + swingProgress * 20,
                0, Math.PI * 2
            );
            ctx.stroke();
        }
    }
}

// 必殺技用：衝撃波クラス（画面端まで届く極太ビーム）
export class Shockwave {
    constructor(x, y, direction) {
        this.width = 1500; // 画面端まで届く長さ
        this.height = 140; // 太さ
        this.dir = direction;
        
        // 当たり判定の中心座標（プレイヤー位置から前方に伸ばす）
        this.x = x + direction * (this.width / 2 - 50); 
        this.y = y; // 高さはそのまま
        
        this.damage = 100; 
        this.isDestroyed = false;
        this.hitEnemies = new Set(); 
        this.particles = [];
        this.timer = 0;
        this.maxLife = 0.4; // 0.4秒で消える（一瞬の閃光）
        
        audio.playSlash(4); 
    }
    
    update(deltaTime) {
        // 移動しない（設置型ビーム）
        this.timer += deltaTime;
        
        // 寿命で消滅
        if (this.timer > this.maxLife) {
            this.isDestroyed = true;
        }
        
        // パーティクル生成（ビームの中にキラキラ）
        if (Math.random() < 0.8) {
            const px = (this.x - this.width/2) + Math.random() * this.width;
            const py = this.y + (Math.random() - 0.5) * this.height;
            this.particles.push({
                x: px,
                y: py,
                vx: this.dir * (Math.random() * 5 + 5),
                vy: (Math.random() - 0.5) * 2,
                life: 1.0
            });
        }
        
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.1;
        });
        this.particles = this.particles.filter(p => p.life > 0);
    }
    
    getHitbox() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
    
    render(ctx) {
        const remainingRatio = 1 - (this.timer / this.maxLife);
        if (remainingRatio <= 0) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // ビームの明滅
        const flicker = Math.random() * 0.2 + 0.8;
        const width = this.width;
        const height = this.height * remainingRatio * flicker; // 徐々に細くなる
        
        // 1. アウターグロー（青）
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#00ffff';
        ctx.fillStyle = `rgba(0, 255, 255, ${0.5 * remainingRatio})`;
        ctx.fillRect(-width/2, -height/2, width, height);
        
        // 2. インナーコア（白・高輝度）
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * remainingRatio})`;
        ctx.fillRect(-width/2, -height/4, width, height/2);
        
        // 3. 上下のエネルギーライン
        ctx.strokeStyle = `rgba(100, 255, 255, ${remainingRatio})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-width/2, -height/2);
        ctx.lineTo(width/2, -height/2);
        ctx.moveTo(-width/2, height/2);
        ctx.lineTo(width/2, height/2);
        ctx.stroke();

        ctx.restore();

        // パーティクル
        ctx.save();
        this.particles.forEach(p => {
            ctx.fillStyle = `rgba(200, 255, 255, ${p.life})`;
            ctx.fillRect(p.x, p.y, 4, 4);
        });
        ctx.restore();
    }
    
    getHitbox() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
}

// 武器ファクトリー
export function createSubWeapon(type) {
    switch (type) {
        case '大槍': return new Spear();
        case '二刀': return new DualBlades();
        case '鎖鎌': return new Kusarigama();
        case '大太刀': return new Nodachi();
        default: return null;
    }
}
