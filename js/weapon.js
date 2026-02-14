// ============================================
// Unification of the Nation - 武器クラス
// ============================================

import { COLORS, GRAVITY } from './constants.js?v=53';
import { audio } from './audio.js?v=53';

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
        this.baseDamage = damage;
        this.baseRange = range;
        this.baseCooldown = cooldown;
    }
    
    use(player) {
        // オーバーライド用
    }
    
    render(ctx, player) {
        // オーバーライド用
    }

    getHitbox(player) {
        // 判定を持たない武器（例: 火薬玉）は null を返す
        return null;
    }
}

// 火薬玉（爆弾を忍具として扱う）
export class Firebomb extends SubWeapon {
    constructor() {
        // 範囲制圧寄り: 爆風範囲を維持しつつ連投を抑制
        super('火薬玉', 32, 72, 460);
    }

    render(ctx, player) {
        // 投擲後は Bomb オブジェクトとして飛んでいくため、手元への描画は不要
        return;
    }
    use(player) {
        const g = window.game;
        if (!g) return;

        const direction = player.facingRight ? 1 : -1;
        let vx = direction * 8;
        let vy = -8;
        let bombY = player.y + 10;

        if (player.isCrouching) {
            vx = direction * 8;
            vy = -4.0;
            bombY = player.y + player.height - 15;
        }

        const tier = (player && typeof player.getSubWeaponEnhanceTier === 'function')
            ? player.getSubWeaponEnhanceTier()
            : 0;
        const shotCount = tier >= 2 ? 3 : (tier >= 1 ? 2 : 1);
        const sizeUp = tier >= 3; // Lv3でサイズアップ
        for (let shotIndex = 0; shotIndex < shotCount; shotIndex++) {
            const spread = shotCount === 1 ? 0 : (shotIndex - (shotCount - 1) / 2) * 0.9;
            const bomb = new Bomb(
                player.x + player.width / 2 + direction * (15 + shotIndex * 4),
                bombY - shotIndex * 1.5,
                vx + spread,
                vy - Math.abs(spread) * 0.2
            );
            bomb.damage = sizeUp ? Math.round(this.damage * 1.35) : this.damage;
            bomb.radius = sizeUp ? 13 : 9;
            bomb.explosionRadius = sizeUp ? Math.round(this.range * 1.4) : this.range;
            bomb.explosionDuration = sizeUp ? 420 : 340;
            g.bombs.push(bomb);
        }

        // 奥義分身中は分身位置からも同時投擲
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            const cloneOffsets = player.getSubWeaponCloneOffsets();
            if (Array.isArray(cloneOffsets) && cloneOffsets.length > 0) {
                for (const clone of cloneOffsets) {
                    for (let shotIndex = 0; shotIndex < shotCount; shotIndex++) {
                        const spread = shotCount === 1 ? 0 : (shotIndex - (shotCount - 1) / 2) * 0.9;
                        const cloneBomb = new Bomb(
                            player.x + clone.dx + player.width / 2 + direction * (15 + shotIndex * 4),
                            bombY + clone.dy - shotIndex * 1.5,
                            vx + (clone.index % 2 === 0 ? 0.5 : -0.5) + spread,
                            vy - Math.abs(spread) * 0.2
                        );
                        cloneBomb.damage = sizeUp ? Math.round(this.damage * 1.35) : this.damage;
                        cloneBomb.radius = sizeUp ? 12 : 8.5;
                        cloneBomb.explosionRadius = sizeUp ? Math.round(this.range * 1.4) : this.range;
                        cloneBomb.explosionDuration = sizeUp ? 400 : 320;
                        g.bombs.push(cloneBomb);
                    }
                }
            }
        }
        audio.playDash();
    }
}

// 大槍
export class Spear extends SubWeapon {
    constructor() {
        // 差し込み特化: 先端火力を高め、やや長射程に
        super('大槍', 28, 132, 360);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.thrustPulse = 0;
    }
    
    use(player) {
        this.isAttacking = true;
        this.attackTimer = 250; 
        this.thrustPulse = 180;
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
        if (this.thrustPulse > 0) {
            this.thrustPulse -= deltaTime * 1000;
        }
    }

    getThrustState(player) {
        const direction = player.facingRight ? 1 : -1;
        const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / 250)));
        const centerX = player.x + player.width / 2 + direction * 12;
        const y = player.y + 33;
        const thrust = this.range * (0.72 + 0.28 * Math.sin(progress * Math.PI));
        const spearEnd = centerX + direction * thrust;
        const shaftStartX = centerX - direction * 2;
        const shaftStartY = y + 1;
        const shaftEndX = spearEnd - direction * 15;
        const shaftEndY = y;
        const tipLen = 20;
        const tipWidth = 8;
        const tipBaseX = spearEnd - direction * tipLen;
        const tipBackX = spearEnd - direction * (tipLen + 5);
        return {
            direction,
            progress,
            centerX,
            y,
            thrust,
            spearEnd,
            shaftStartX,
            shaftStartY,
            shaftEndX,
            shaftEndY,
            tipLen,
            tipWidth,
            tipBaseX,
            tipBackX
        };
    }

    getGripAnchors(player) {
        const st = this.getThrustState(player);
        const shaftDX = st.shaftEndX - st.shaftStartX;
        const shaftDY = st.shaftEndY - st.shaftStartY;
        const shaftLen = Math.max(1, Math.hypot(shaftDX, shaftDY));
        const shaftUX = shaftDX / shaftLen;
        const shaftUY = shaftDY / shaftLen;

        const rearDist = 8;
        const frontDist = Math.max(18, Math.min(34, shaftLen * 0.34));

        return {
            progress: st.progress,
            direction: st.direction,
            rear: {
                x: st.shaftStartX + shaftUX * rearDist,
                y: st.shaftStartY + shaftUY * rearDist + 1.0
            },
            front: {
                x: st.shaftStartX + shaftUX * frontDist,
                y: st.shaftStartY + shaftUY * frontDist + 1.5
            }
        };
    }
    
    getHitbox(player) {
        if (!this.isAttacking) return null;

        const st = this.getThrustState(player);
        const shaftThickness = 12;
        const shaftMinX = Math.min(st.shaftStartX, st.shaftEndX) - shaftThickness * 0.5;
        const shaftMinY = Math.min(st.shaftStartY, st.shaftEndY) - shaftThickness * 0.5;
        const mainHitbox = {
            x: shaftMinX,
            y: shaftMinY,
            width: Math.max(10, Math.abs(st.shaftEndX - st.shaftStartX) + shaftThickness),
            height: Math.max(10, Math.abs(st.shaftEndY - st.shaftStartY) + shaftThickness)
        };
        const tipPadding = 5;
        const tipHitbox = {
            x: Math.min(st.spearEnd, st.tipBaseX, st.tipBackX) - tipPadding,
            y: st.y - st.tipWidth - tipPadding,
            width: Math.max(st.tipLen + 9, Math.abs(st.spearEnd - st.tipBackX) + tipPadding * 2),
            height: st.tipWidth * 2 + tipPadding * 2
        };
        return [mainHitbox, tipHitbox];
    }
    
    render(ctx, player) {
        if (!this.isAttacking && (!player || !player.forceSubWeaponRender)) return;

        const st = this.getThrustState(player);
        const tasselSwing = Math.sin(st.progress * Math.PI * 3) * 5;
        
        ctx.save();
        
        // 1. 柄（え）
        ctx.strokeStyle = '#3d2b1f';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(st.shaftStartX, st.shaftStartY);
        ctx.lineTo(st.shaftEndX, st.shaftEndY); // 穂先の手前まで
        ctx.stroke();
        
        // 2. 飾り房（赤い房）
        ctx.fillStyle = '#d32f2f'; // 鮮やかな赤
        ctx.beginPath();
        ctx.arc(st.shaftEndX, st.y + 2, 6, 0, Math.PI, false);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(st.shaftEndX, st.y + 4);
        ctx.lineTo(st.spearEnd - st.direction * (18 + tasselSwing * 0.3), st.y + 13);
        ctx.lineTo(st.spearEnd - st.direction * 12, st.y + 9);
        ctx.closePath();
        ctx.fill();
        
        // 3. 穂先（鋼の鋭い先端）
        ctx.fillStyle = '#e0e0e0'; // 銀色
        ctx.strokeStyle = '#9e9e9e';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.moveTo(st.spearEnd, st.y); // 先端
        ctx.lineTo(st.tipBaseX, st.y - st.tipWidth);
        ctx.lineTo(st.tipBackX, st.y);
        ctx.lineTo(st.tipBaseX, st.y + st.tipWidth);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 4. 柄の芯線で密度を追加
        ctx.strokeStyle = 'rgba(255, 240, 210, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(st.centerX, st.y - 1);
        ctx.lineTo(st.spearEnd - st.direction * 18, st.y - 1);
        ctx.stroke();

        // 5. 突き先のパルス
        if (this.thrustPulse > 0) {
            const pulseRatio = this.thrustPulse / 180;
            ctx.strokeStyle = `rgba(180, 255, 255, ${pulseRatio * 0.9})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(st.spearEnd + st.direction * 6, st.y, 12 + (1 - pulseRatio) * 16, -0.9, 0.9);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // 6. 突きのエフェクト (衝撃波・風切り)
        const remain = this.attackTimer / 250;
        if (st.progress > 0) {
            ctx.save();
            ctx.translate(st.spearEnd, st.y);
            ctx.scale(st.direction, 1); // 常に右向きとして描画し、directionで反転
            
            const alpha = Math.sin(remain * Math.PI); // ふわっと消える
            
            // 鋭い衝撃波 (三角形・コーン状)
            ctx.fillStyle = `rgba(200, 255, 255, ${alpha * 0.8})`;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(60 + remain * 20, -15 * remain); // 上へ広がる
            ctx.lineTo(80 + remain * 40, 0); // 先端 (遠くへ)
            ctx.lineTo(60 + remain * 20, 15 * remain); // 下へ広がる
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
        
        ctx.restore();
    }
}

// 二刀
export class DualBlades extends SubWeapon {
    constructor() {
        // 手数特化: 一撃は軽め、連撃でDPSを出す
        super('二刀流', 18, 64, 180);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackType = 'combined'; // 'main', 'left', 'right', 'combined'
        this.projectiles = []; 
        this.comboIndex = 0; // 連撃パターン用
        this.mainDuration = 204;
        this.mainMotionSpeedScale = 1.7; // 通常Z連撃と近い体感速度に合わせる
        this.attackDirection = 1;
        this.pendingCombinedProjectile = null;
        this.prevMainRightAngle = null;
        this.prevMainLeftAngle = null;
    }

    getMainDurationByStep(step) {
        let base = 220;
        switch (step) {
            case 1: base = 148; break; // 初段: 抜き打ち
            case 2: base = 262; break; // 二段: 逆袈裟
            case 3: base = 186; break; // 三段: クロスステップ薙ぎ
            case 4: base = 304; break; // 四段: 二刀交叉
            default: base = 358; break; // 五段(0): 落下断ち
        }
        return Math.round(base * this.mainMotionSpeedScale);
    }

    getLeftSwingArc() {
        if (this.comboIndex === 1) {
            return { start: -Math.PI * 0.5, end: Math.PI * 0.5 };
        }
        if (this.comboIndex === 2) {
            return { start: Math.PI * 0.28, end: -Math.PI * 0.55 };
        }
        if (this.comboIndex === 3) {
            return { start: 0, end: Math.PI * 2 };
        }
        return { start: -Math.PI * 0.75, end: Math.PI * 0.22 };
    }

    getLeftSwingProgress() {
        return Math.max(0, Math.min(1, this.attackTimer / 150));
    }

    getLeftSwingAngle() {
        const { start, end } = this.getLeftSwingArc();
        const progress = this.getLeftSwingProgress();
        return start + (end - start) * (1 - progress);
    }

    getCombinedSwingProgress() {
        return Math.max(0, Math.min(1, 1 - (this.attackTimer / 220)));
    }

    getMainSwingProgress(options = {}) {
        const timer = options.attackTimer !== undefined ? options.attackTimer : this.attackTimer;
        let duration = this.mainDuration;
        if (options.comboIndex !== undefined) {
            duration = this.getMainDurationByStep(options.comboIndex);
        }
        return Math.max(0, Math.min(1, 1 - (timer / duration)));
    }

    remapMainSwingProgress(step, progress) {
        const p = Math.max(0, Math.min(1, progress));
        if (step === 1) {
            // 初段: ほぼ即出しの抜き打ち
            return p < 0.1
                ? (p / 0.1) * 0.3
                : 0.3 + ((p - 0.1) / 0.9) * 0.7;
        }
        if (step === 2) {
            // 二段: 引きつけて一気に返す
            return p < 0.38
                ? (p / 0.38) * 0.08
                : 0.08 + ((p - 0.38) / 0.62) * 0.92;
        }
        if (step === 3) {
            // 三段: 踏み替えの間を挟んだ二拍子
            if (p < 0.22) return (p / 0.22) * 0.42;
            if (p < 0.4) return 0.42 + ((p - 0.22) / 0.18) * 0.1;
            if (p < 0.84) return 0.52 + ((p - 0.4) / 0.44) * 0.4;
            return 0.92 + ((p - 0.84) / 0.16) * 0.08;
        }
        if (step === 4) {
            // 四段: ため上げ→空中交叉→叩き込み準備
            if (p < 0.24) return (p / 0.24) * 0.12;
            if (p < 0.7) return 0.12 + ((p - 0.24) / 0.46) * 0.66;
            return 0.78 + ((p - 0.7) / 0.3) * 0.22;
        }
        // 五段目(0): 頭上で溜めて落下断ち
        if (p < 0.34) return (p / 0.34) * 0.1;
        if (p < 0.82) return 0.1 + ((p - 0.34) / 0.48) * 0.74;
        return 0.84 + ((p - 0.82) / 0.18) * 0.16;
    }

    getMainSwingArcs(options = {}) {
        const index = options.comboIndex !== undefined ? options.comboIndex : this.comboIndex;
        switch (index) {
            case 1:
                return {
                    rightStart: -2.36, rightEnd: -0.16,
                    leftStart: 2.46, leftEnd: 1.1,
                    effectRadius: 88,
                    hit: 'drawDash'
                };
            case 2:
                return {
                    rightStart: 0.84, rightEnd: 2.46,
                    leftStart: -2.68, leftEnd: -0.26,
                    effectRadius: 98,
                    hit: 'reverseCounter'
                };
            case 3:
                return {
                    rightStart: -0.22, rightEnd: 1.42,
                    leftStart: 2.86, leftEnd: 1.2,
                    effectRadius: 102,
                    hit: 'crossStepSweep'
                };
            case 4:
                return {
                    rightStart: 1.68, rightEnd: -1.52,
                    leftStart: -2.48, leftEnd: 0.96,
                    effectRadius: 112,
                    hit: 'risingX'
                };
            default:
                return {
                    rightStart: -1.82, rightEnd: 1.24,
                    leftStart: -1.08, leftEnd: 1.98,
                    effectRadius: 118,
                    hit: 'fallingBreak'
                };
        }
    }

    getMainSwingPose(options = {}) {
        const progress = this.getMainSwingProgress(options);
        const index = options.comboIndex !== undefined ? options.comboIndex : this.comboIndex;
        const remapped = this.remapMainSwingProgress(index, progress);
        const eased = remapped * remapped * (3 - 2 * remapped);
        const arcs = this.getMainSwingArcs(options);
        return {
            progress,
            remapped,
            eased,
            comboIndex: index,
            arcs,
            rightAngle: arcs.rightStart + (arcs.rightEnd - arcs.rightStart) * eased,
            leftAngle: arcs.leftStart + (arcs.leftEnd - arcs.leftStart) * eased
        };
    }
    
    use(player, type = 'combined') {
        this.isAttacking = true;
        this.attackType = type;
        this.attackDirection = player.facingRight ? 1 : -1;
        this.prevMainRightAngle = null;
        this.prevMainLeftAngle = null;
        
        if (type === 'combined') {
            // X技は常に最新の1発のみを表示して剣筋の二重化を防ぐ
            this.projectiles = [];
            this.attackTimer = 220;
            // 振り下ろしタイミングで発射するため、一旦保留
            this.pendingCombinedProjectile = {
                x: player.x + player.width / 2,
                y: player.y + player.height / 2,
                vx: this.attackDirection * 10,
                life: 600, // 寿命を延ばす (400 -> 600) で射程維持
                maxLife: 600,
                direction: this.attackDirection
            };
            audio.playSlash(2);
        } else if (type === 'main') {
            // 5段ループの多方向コンボ
            this.comboIndex = (this.comboIndex + 1) % 5;
            this.mainDuration = this.getMainDurationByStep(this.comboIndex);
            this.attackTimer = this.mainDuration;
            audio.playSlash(this.comboIndex);
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
            if (this.attackType === 'combined' && this.pendingCombinedProjectile && this.getCombinedSwingProgress() >= 0.58) {
                this.projectiles.push(this.pendingCombinedProjectile);
                this.pendingCombinedProjectile = null;
            }
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.pendingCombinedProjectile = null;
                this.prevMainRightAngle = null;
                this.prevMainLeftAngle = null;
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
            const direction = this.attackDirection;
            const centerX = player.x + player.width / 2;
            const centerY = player.y + player.height / 2;

            if (this.attackType === 'main') {
                const arcs = this.getMainSwingArcs();
                const frontX = player.x + (direction > 0 ? player.width : -this.range * 1.4);
                const backX = player.x + (direction > 0 ? -this.range * 1.35 : player.width);
                const coreW = this.range * 0.75;
                if (arcs.hit === 'drawDash') {
                    hitboxes.push({
                        x: frontX,
                        y: player.y - 24,
                        width: this.range * 1.48,
                        height: 86
                    });
                    hitboxes.push({
                        x: centerX - coreW * 0.5,
                        y: centerY - 54,
                        width: coreW * 0.98,
                        height: 106
                    });
                } else if (arcs.hit === 'reverseCounter') {
                    hitboxes.push({
                        x: frontX - this.range * 0.16,
                        y: player.y - 72,
                        width: this.range * 1.4,
                        height: 118
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.66,
                        y: player.y - 84,
                        width: this.range * 1.26,
                        height: 92
                    });
                } else if (arcs.hit === 'crossStepSweep') {
                    hitboxes.push({
                        x: backX - this.range * 0.16,
                        y: centerY - 30,
                        width: this.range * 1.74,
                        height: 66
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.92,
                        y: centerY - 22,
                        width: this.range * 1.84,
                        height: 56
                    });
                } else if (arcs.hit === 'risingX') {
                    hitboxes.push({
                        x: centerX - this.range * 1.1,
                        y: centerY - this.range * 1.08,
                        width: this.range * 2.2,
                        height: this.range * 2.14
                    });
                    hitboxes.push({
                        x: frontX - this.range * 0.24,
                        y: player.y - 46,
                        width: this.range * 1.62,
                        height: 106
                    });
                } else {
                    const sRange = this.range * 1.82;
                    hitboxes.push({
                        x: centerX - sRange,
                        y: centerY - sRange * 0.98,
                        width: sRange * 2,
                        height: sRange * 2.14
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.48,
                        y: centerY + 4,
                        width: this.range * 0.96,
                        height: this.range * 1.24
                    });
                }
            } else {
            
                // 旧X攻撃（後方）
                if (this.attackType === 'left') {
                    if (this.comboIndex === 3) {
                        const sRange = this.range * 1.5;
                        hitboxes.push({
                            x: player.x + player.width / 2 - sRange,
                            y: player.y + player.height / 2 - sRange,
                            width: sRange * 2,
                            height: sRange * 2
                        });
                    } else {
                        hitboxes.push({
                            x: player.x + (direction > 0 ? -this.range * 1.2 : player.width),
                            y: player.y - 10,
                            width: this.range * 1.2,
                            height: 60
                        });
                    }
                } else {
                    // 前方（右手 or 合体）
                    if (this.comboIndex === 3) {
                        const sRange = this.range * 1.5;
                        hitboxes.push({
                            x: player.x + player.width / 2 - sRange,
                            y: player.y + player.height / 2 - sRange,
                            width: sRange * 2,
                            height: sRange * 2
                        });
                    } else {
                        hitboxes.push({
                            x: player.x + (direction > 0 ? player.width : -this.range * 1.2),
                            y: player.y - 10,
                            width: this.range * 1.2,
                            height: 60
                        });
                    }
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
        const direction = this.isAttacking ? this.attackDirection : (player.facingRight ? 1 : -1);
        
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

        if (!this.isAttacking) {
            this.prevMainRightAngle = null;
            this.prevMainLeftAngle = null;
            return;
        }
        
        const isMain = this.attackType === 'main';
        const isCombined = this.attackType === 'combined';
        if (isMain) {
            const centerX = player.x + player.width / 2;
            const centerY = player.y + player.height / 2;
            const pose = this.getMainSwingPose();
            const alpha = Math.max(0.2, 1 - pose.progress * 0.74);

            const normalizeAngleDelta = (current, previous) => {
                let delta = current - previous;
                const full = Math.PI * 2;
                while (delta > Math.PI) delta -= full;
                while (delta < -Math.PI) delta += full;
                return delta;
            };

            const drawTrackedArcSlash = (
                palette,
                currentAngle,
                swingDelta,
                radius,
                width,
                yOffset = 0,
                spanGain = 1
            ) => {
                const swingSpeed = Math.abs(swingDelta);
                const motionProgress = Math.max(0, Math.min(1, pose.progress));
                const visibilityPhase = Math.max(0, Math.sin(motionProgress * Math.PI));
                if (swingSpeed < 0.004 && visibilityPhase < 0.28) return;

                ctx.save();
                ctx.translate(centerX, centerY + yOffset);
                ctx.scale(direction, 1);
                ctx.lineCap = 'round';
                const movingForward = swingDelta >= 0;
                const dynamicSpan = swingSpeed * 14.6 * spanGain;
                const lingerSpan = (0.18 + visibilityPhase * 0.28) * spanGain;
                const backSpan = Math.min(1.28, Math.max(lingerSpan, dynamicSpan));
                const leadSpan = Math.min(0.18, Math.max(0.018, backSpan * (0.16 + visibilityPhase * 0.08)));
                const start = movingForward ? (currentAngle - backSpan) : (currentAngle - leadSpan);
                const end = movingForward ? (currentAngle + leadSpan) : (currentAngle + backSpan);
                const ccw = end < start;
                const backAlpha = alpha * 0.42;
                const frontAlpha = alpha;

                // 1) 薄い残像（主弧の一歩後ろ）
                const trailStart = movingForward
                    ? (currentAngle - backSpan * 1.55)
                    : (currentAngle + backSpan * 0.38);
                const trailEnd = movingForward
                    ? (currentAngle - backSpan * 0.42)
                    : (currentAngle + backSpan * 1.52);
                const ccwTrail = trailEnd < trailStart;
                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(${palette.back[0]}, ${palette.back[1]}, ${palette.back[2]}, ${backAlpha * 0.7})`;
                ctx.lineWidth = width * 0.52;
                ctx.beginPath();
                ctx.arc(-8.5, -2.8, radius * 0.9, trailStart, trailEnd, ccwTrail);
                ctx.stroke();

                // 2) 中間の弧
                ctx.shadowBlur = 12;
                ctx.shadowColor = `rgba(${palette.front[0]}, ${palette.front[1]}, ${palette.front[2]}, ${frontAlpha * 0.45})`;
                ctx.strokeStyle = `rgba(${palette.back[0]}, ${palette.back[1]}, ${palette.back[2]}, ${backAlpha})`;
                ctx.lineWidth = width * 0.72;
                ctx.beginPath();
                ctx.arc(-6.8, -2.1, radius * 0.94, start + 0.06, end + 0.06, ccw);
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(${palette.front[0]}, ${palette.front[1]}, ${palette.front[2]}, ${frontAlpha})`;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.arc(-5, 0, radius, start, end, ccw);
                ctx.stroke();

                ctx.strokeStyle = `rgba(255, 255, 255, ${frontAlpha * 0.46})`;
                ctx.lineWidth = Math.max(1.4, width * 0.18);
                ctx.beginPath();
                ctx.arc(-3.6, -1.2, Math.max(2, radius - 2.2), start + 0.03, end + 0.03, ccw);
                ctx.stroke();
                ctx.restore();
            };

            const bluePalette = { front: [130, 234, 255], back: [76, 154, 226] };
            const redPalette = { front: [255, 90, 90], back: [214, 74, 74] };
            const sampleStep = 0.055;
            const prevProgress = Math.max(0, pose.progress - sampleStep);
            const prevRemapped = this.remapMainSwingProgress(pose.comboIndex, prevProgress);
            const prevEased = prevRemapped * prevRemapped * (3 - 2 * prevRemapped);
            const prevRightAngle = pose.arcs.rightStart + (pose.arcs.rightEnd - pose.arcs.rightStart) * prevEased;
            const prevLeftAngle = pose.arcs.leftStart + (pose.arcs.leftEnd - pose.arcs.leftStart) * prevEased;
            const rightDelta = normalizeAngleDelta(pose.rightAngle, prevRightAngle);
            const leftDelta = normalizeAngleDelta(pose.leftAngle, prevLeftAngle);
            if (pose.arcs.hit === 'drawDash') {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, pose.arcs.effectRadius + 10, 13.8, -6, 0.82);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, pose.arcs.effectRadius + 2, 10.8, 5, 0.74);
            } else if (pose.arcs.hit === 'reverseCounter') {
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, pose.arcs.effectRadius + 14, 14.4, -9, 0.9);
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, pose.arcs.effectRadius + 7, 12.4, 7, 0.76);
            } else if (pose.arcs.hit === 'crossStepSweep') {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, pose.arcs.effectRadius + 18, 12.0, -3, 0.72);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, pose.arcs.effectRadius + 16, 11.8, 4, 0.72);
            } else if (pose.arcs.hit === 'risingX') {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, pose.arcs.effectRadius + 18, 14.6, -5, 0.92);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, pose.arcs.effectRadius + 14, 14.0, 6, 0.9);
            } else {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, pose.arcs.effectRadius + 16, 14.0, -5, 0.84);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, pose.arcs.effectRadius + 12, 13.4, 5, 0.86);
            }
            return;
        }

        // 合体攻撃(X)は飛翔斬撃のみ表示（手前の剣筋は描かない）
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
            // 1本の剣につき剣筋は常に1本だけ表示する
            ctx.arc(-6, 0, this.range + 10, -0.72, 0.72);
            ctx.stroke();
            
            // 内側の細いハイライト (白)
            ctx.shadowBlur = 5;
            ctx.shadowColor = 'white';
            ctx.strokeStyle = `rgba(255, 255, 255, ${slashAlpha * 0.8})`;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(-3, 0, this.range + 8, -0.68, 0.68);
            ctx.stroke();
            
            ctx.restore();
            
            ctx.restore(); // 【重要】drawAttack冒頭のctx.save()に対するrestore
        };

        // --- 左手攻撃 (Xキー相当) - 後方・赤色 ---
        if (this.attackType === 'left') {
            ctx.save();
            const redSlash = 'rgba(255, 90, 90, 0.9)';
            
            let start = -Math.PI * 0.5;
            let end = Math.PI * 0.2;
            
            const leftArc = this.getLeftSwingArc();
            start = leftArc.start;
            end = leftArc.end;
            
            drawAttack(redSlash, start, end, true, false);
            ctx.restore();
        }

        // --- 右手攻撃 (Zキー相当) - 前方・水色 ---
        if (this.attackType === 'right' && player && player.type === 'boss') {
            // ボス側はプレイヤー本体描画フローがないため、右手斬撃もここで描画する
            drawAttack('rgba(80, 190, 255, 0.9)', -Math.PI * 0.92, Math.PI * 0.2, false, false);
        }
    }
}


// 鎖鎌
export class Kusarigama extends SubWeapon {
    constructor() {
        // 制圧寄り: 間合い管理の武器として中火力を強化
        super('鎖鎌', 20, 245, 480);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.totalDuration = 560;
        this.owner = null;
        this.attackDirection = 1;
        this.extendEnd = 0.24;
        this.orbitEnd = 0.82;
        this.tipX = null;
        this.tipY = null;
    }
    
    use(player) {
        this.isAttacking = true;
        this.owner = player;
        this.attackDirection = player.facingRight ? 1 : -1;
        this.attackTimer = this.totalDuration;
        const init = this.getMotionState(player);
        this.tipX = init.tipX;
        this.tipY = init.tipY;
        audio.playDash(); // 鎖のシュルシュル音代用
    }

    getMotionState(player) {
        const direction = this.attackDirection;
        const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / this.totalDuration)));
        const centerX = player.x + player.width / 2;
        const shoulderX = centerX - direction * 1.5;
        const shoulderY = player.y + 26;

        let radius = 0;
        let angle = 0;
        let phase = 'extend';
        let phaseT = 0;

        if (progress < this.extendEnd) {
            phase = 'extend';
            phaseT = progress / this.extendEnd;
            const easeOut = 1 - Math.pow(1 - phaseT, 2.2);
            radius = this.range * easeOut;
            angle = -0.06 + phaseT * 0.12;
        } else if (progress < this.orbitEnd) {
            phase = 'orbit';
            phaseT = (progress - this.extendEnd) / (this.orbitEnd - this.extendEnd);
            radius = this.range;
            // 前方からキャラ斜め後ろ上へ、減速感のある円弧で旋回
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            angle = -eased * (Math.PI * 1.02);
        } else {
            phase = 'retract';
            phaseT = (progress - this.orbitEnd) / (1 - this.orbitEnd);
            // 縮退も常に円弧上（角度と半径を同時補間）
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            radius = this.range * (1 - eased * 0.9);
            const startAngle = -Math.PI * 1.02;
            const endAngle = -Math.PI * 0.2;
            angle = startAngle + (endAngle - startAngle) * eased;
        }

        const chainDirX = direction * Math.cos(angle);
        const chainDirY = Math.sin(angle);
        const chainHeading = Math.atan2(chainDirY, chainDirX);
        const wristBias =
            phase === 'extend'
                ? (-0.34 + phaseT * 0.12)
                : (phase === 'orbit'
                    ? (-0.40 + Math.sin(phaseT * Math.PI) * 0.16)
                    : (0.06 - phaseT * 0.14));
        const handLen =
            phase === 'extend'
                ? 15.2 + phaseT * 1.5
                : (phase === 'orbit'
                    ? 16.4 + Math.sin(phaseT * Math.PI * 0.7) * 1.2
                    : (15.2 - phaseT * 0.8));
        const handAngle = chainHeading + wristBias;
        const handX = shoulderX + Math.cos(handAngle) * handLen;
        const handY = shoulderY + Math.sin(handAngle) * handLen;
        const tipX = handX + chainDirX * radius;
        const tipY = handY + chainDirY * radius;

        return {
            handX,
            handY,
            tipX,
            tipY,
            radius,
            angle,
            progress,
            direction,
            phase,
            phaseT,
            chainDirX,
            chainDirY,
            chainHeading
        };
    }

    getHandAnchor(player) {
        const st = this.getMotionState(player);
        return {
            x: st.handX,
            y: st.handY,
            direction: st.direction,
            progress: st.progress,
            phase: st.phase,
            phaseT: st.phaseT
        };
    }

    getRenderState(player) {
        return this.getMotionState(player);
    }

    getSickleGeometry(state) {
        const travelHeading = state.phase === 'orbit'
            ? (state.chainHeading - state.direction * Math.PI * 0.5)
            : state.chainHeading;
        const rotation = travelHeading + state.direction * Math.PI * 0.28;
        const reach = 16;
        return { rotation, reach };
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            if (this.owner) {
                const st = this.getMotionState(this.owner);
                // 先端位置は常に円弧式から直接決定（直線ドリフトを防止）
                this.tipX = st.tipX;
                this.tipY = st.tipY;
            }

            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.tipX = null;
                this.tipY = null;
            }
        }
    }
    
    getHitbox(player) {
        if (!this.isAttacking) return null;

        const st = this.getRenderState(player);
        if (st.radius < 16) return null;
        const sickle = this.getSickleGeometry(st);

        const chainThickness = 12;
        const minX = Math.min(st.handX, st.tipX) - chainThickness * 0.5;
        const minY = Math.min(st.handY, st.tipY) - chainThickness * 0.5;
        const width = Math.max(8, Math.abs(st.tipX - st.handX) + chainThickness);
        const height = Math.max(8, Math.abs(st.tipY - st.handY) + chainThickness);
        const chainHitbox = { x: minX, y: minY, width, height };
        const sickleTipX = st.tipX + Math.cos(sickle.rotation) * sickle.reach;
        const sickleTipY = st.tipY + Math.sin(sickle.rotation) * sickle.reach;
        const tipRadius = 15;
        const tipHitbox = {
            x: Math.min(st.tipX, sickleTipX) - tipRadius,
            y: Math.min(st.tipY, sickleTipY) - tipRadius,
            width: Math.max(22, Math.abs(sickleTipX - st.tipX) + tipRadius * 2),
            height: Math.max(22, Math.abs(sickleTipY - st.tipY) + tipRadius * 2)
        };
        return [chainHitbox, tipHitbox];
    }
    
    render(ctx, player) {
        if (!this.isAttacking && (!player || !player.forceSubWeaponRender)) return;

        const st = this.getRenderState(player);
        if (st.radius < 4) return;

        ctx.save();

        const drawSmoothTrail = (points, width, color) => {
            if (!points || points.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length - 1; i++) {
                const next = points[i + 1];
                const midX = (points[i].x + next.x) * 0.5;
                const midY = (points[i].y + next.y) * 0.5;
                ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
            }
            const last = points[points.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
        };

        // 軌跡は円弧のみ。厚みを分けて視認性を上げる
        if (st.progress > this.extendEnd && st.radius > 22) {
            const trailSweep = st.phase === 'orbit' ? Math.PI * 0.58 : Math.PI * 0.34;
            const trailEnd = st.angle;
            const trailStart = Math.min(0.12, trailEnd + trailSweep);
            const samples = st.phase === 'orbit' ? 24 : 16;
            const points = [];
            for (let i = 0; i <= samples; i++) {
                const t = i / samples;
                const a = trailStart + (trailEnd - trailStart) * t;
                points.push({
                    x: st.handX + st.direction * Math.cos(a) * st.radius,
                    y: st.handY + Math.sin(a) * st.radius
                });
            }
            const baseAlpha = st.phase === 'orbit' ? 0.42 : 0.28;
            drawSmoothTrail(points, 10, `rgba(130, 225, 255, ${baseAlpha})`);
            drawSmoothTrail(points, 4.5, `rgba(210, 250, 255, ${baseAlpha * 0.92})`);
            drawSmoothTrail(points, 2, `rgba(255, 255, 255, ${baseAlpha * 0.7})`);
        }

        // 鎖
        const chainGradient = ctx.createLinearGradient(st.handX, st.handY, st.tipX, st.tipY);
        chainGradient.addColorStop(0, 'rgba(170, 176, 188, 0.95)');
        chainGradient.addColorStop(0.55, 'rgba(128, 136, 150, 0.98)');
        chainGradient.addColorStop(1, 'rgba(92, 102, 118, 0.95)');
        ctx.strokeStyle = chainGradient;
        ctx.lineWidth = 3.1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(st.handX, st.handY);
        ctx.lineTo(st.tipX, st.tipY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(230, 245, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(st.handX + st.chainDirY * 1.4, st.handY - st.chainDirX * 1.4);
        ctx.lineTo(st.tipX + st.chainDirY * 1.4, st.tipY - st.chainDirX * 1.4);
        ctx.stroke();

        // 鎌ヘッド
        ctx.save();
        ctx.translate(st.tipX, st.tipY);
        const sickle = this.getSickleGeometry(st);
        ctx.rotate(sickle.rotation);
        ctx.fillStyle = '#d9dde2';
        ctx.strokeStyle = '#8b9299';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(20, -12, 30, -2);
        ctx.quadraticCurveTo(18, 5, 3, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();

        // 鎌先の風切り
        if (st.phase !== 'extend' && st.radius > 20) {
            const sweepAlpha = st.phase === 'orbit' ? 0.34 : 0.22;
            const tangentX = -st.direction * Math.sin(st.angle);
            const tangentY = Math.cos(st.angle);
            ctx.strokeStyle = `rgba(184, 244, 255, ${sweepAlpha})`;
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            for (let i = 0; i < 3; i++) {
                const back = 8 + i * 6;
                const spread = (i - 1) * 2.4;
                const startX = st.tipX - st.chainDirX * back + tangentX * spread;
                const startY = st.tipY - st.chainDirY * back + tangentY * spread;
                const endX = startX + tangentX * (9 + i * 2);
                const endY = startY + tangentY * (9 + i * 2);
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
}

// 大太刀
export class Nodachi extends SubWeapon {
    constructor() {
        // 重撃特化: 遅いが高威力
        super('大太刀', 46, 74, 760);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.totalDuration = 760;
        this.owner = null;
        this.impactX = 0;
        this.impactY = 0;
        this.hasImpacted = false;
        this.impactFlashTimer = 0;
        this.groundWaves = [];
        this.impactDebris = [];
        this.liftEnd = 0.32;
        this.stallEnd = 0.46;
        this.flipEnd = 0.58;
        this.impactStart = 0.9;
        this.attackDirection = 1;
    }
    
    use(player) {
        this.isAttacking = true;
        this.owner = player;
        this.attackTimer = this.totalDuration;
        this.hasImpacted = false;
        this.impactFlashTimer = 0;
        this.groundWaves = [];
        this.impactDebris = [];
        this.attackDirection = player.facingRight ? 1 : -1;

        player.vy = -26;
        player.isGrounded = false;
        player.vx *= 0.35;

        audio.playSlash(4); // 低く重い音
    }

    getProgress() {
        return Math.max(0, Math.min(1, 1 - (this.attackTimer / this.totalDuration)));
    }

    getPose(player) {
        const direction = this.isAttacking ? this.attackDirection : (player.facingRight ? 1 : -1);
        const progress = this.getProgress();
        const centerX = player.x + player.width / 2;
        let rotation = -Math.PI * 0.5; // 上向き
        let phase = 'rise';
        let flipT = 0;

        if (progress < this.liftEnd) {
            phase = 'rise';
            // 上昇中は常に上向き固定（左右向きで反転しないようにする）
            rotation = -Math.PI * 0.5;
        } else if (progress < this.stallEnd) {
            phase = 'stall';
            const t = (progress - this.liftEnd) / (this.stallEnd - this.liftEnd);
            rotation = -Math.PI * 0.5 + Math.sin(t * Math.PI) * 0.03;
        } else if (progress < this.flipEnd) {
            phase = 'flip';
            const t = (progress - this.stallEnd) / (this.flipEnd - this.stallEnd);
            const eased = t * t * (3 - 2 * t);
            flipT = t;
            const startRotation = -Math.PI * 0.5;
            const targetRotation = Math.PI * 0.5; // 落下開始は常に真下
            rotation = startRotation + (targetRotation - startRotation) * eased;
        } else {
            phase = 'plunge';
            rotation = Math.PI * 0.5; // 真下
        }
        const bladeLen = this.range + 44;
        const phaseForwardOffset =
            phase === 'rise' ? 11 :
            phase === 'stall' ? 12 :
            phase === 'flip' ? 10 :
            13;
        const phaseHeightOffset =
            phase === 'plunge' ? 7.5 :
            phase === 'flip' ? 6.2 : 6.8;
        let handX = centerX + direction * phaseForwardOffset;
        let handY = player.y + phaseHeightOffset;

        // 反転中のみ手元を少し前上へ逃がして、胴体との重なりを減らす
        if (phase === 'flip') {
            const lift = Math.sin(flipT * Math.PI);
            handX += direction * lift * 2.2;
            handY -= lift * 1.6;
        }

        // 地面貫通を抑える（先端が深く入りすぎないように）
        const maxTipY = player.groundY + 8;
        const tipY = handY + Math.sin(rotation) * bladeLen;
        if (tipY > maxTipY) {
            handY -= (tipY - maxTipY);
        }

        return { progress, phase, direction, rotation, handX, handY, bladeLen };
    }

    getHandAnchor(player) {
        const pose = this.getPose(player);
        const gripOffset = pose.phase === 'plunge' ? -16 : -10;
        return {
            x: pose.handX + Math.cos(pose.rotation) * gripOffset,
            y: pose.handY + Math.sin(pose.rotation) * gripOffset,
            rotation: pose.rotation,
            direction: pose.direction
        };
    }

    getBladeGeometry(pose) {
        const bladeStart = 22;
        const bladeEnd = pose.bladeLen + 8;
        const cosR = Math.cos(pose.rotation);
        const sinR = Math.sin(pose.rotation);
        const rootX = pose.handX + cosR * bladeStart;
        const rootY = pose.handY + sinR * bladeStart;
        const tipX = pose.handX + cosR * bladeEnd;
        const tipY = pose.handY + sinR * bladeEnd;
        return {
            bladeStart,
            bladeEnd,
            rootX,
            rootY,
            tipX,
            tipY,
            hitThickness: 22
        };
    }

    spawnImpactWaves() {
        this.groundWaves.push(
            { x: this.impactX, y: this.impactY, dir: -1, life: 420, maxLife: 420, speed: 7.8, thickness: 28, core: 11 },
            { x: this.impactX, y: this.impactY, dir: 1, life: 420, maxLife: 420, speed: 7.8, thickness: 28, core: 11 },
            { x: this.impactX, y: this.impactY, dir: -1, life: 320, maxLife: 320, speed: 9.4, thickness: 20, core: 8 },
            { x: this.impactX, y: this.impactY, dir: 1, life: 320, maxLife: 320, speed: 9.4, thickness: 20, core: 8 }
        );
    }

    spawnImpactDebris() {
        for (let i = 0; i < 16; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const speed = 2.8 + Math.random() * 4.8;
            this.impactDebris.push({
                x: this.impactX,
                y: this.impactY - 6,
                vx: side * speed * (0.6 + Math.random() * 0.6),
                vy: -2.8 - Math.random() * 4.2,
                size: 1.8 + Math.random() * 2.8,
                life: 320 + Math.random() * 220,
                maxLife: 520
            });
        }
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            const progress = this.getProgress();
            if (this.owner) {
                if (progress >= this.liftEnd && progress < this.stallEnd) {
                    // 頂点付近で一瞬対空して見せる
                    this.owner.vy *= 0.78;
                    if (Math.abs(this.owner.vy) < 1.2) this.owner.vy = 0;
                }
                if (progress >= this.flipEnd && progress < this.impactStart && this.owner.vy < 18) {
                    this.owner.vy = 24;
                }
                this.owner.vx *= 0.86;
            }

            const landed = this.owner && this.owner.isGrounded;
            const pose = this.owner ? this.getPose(this.owner) : null;
            const bladeGeom = pose ? this.getBladeGeometry(pose) : null;
            const tipTouchedGround = !!(
                this.owner &&
                pose &&
                bladeGeom &&
                pose.phase === 'plunge' &&
                bladeGeom.tipY >= this.owner.groundY - 1
            );
            if (!this.hasImpacted && (tipTouchedGround || landed || progress >= 0.98)) {
                this.hasImpacted = true;
                if (this.owner) {
                    this.impactX = this.owner.x + this.owner.width / 2;
                    this.impactY = this.owner.groundY;
                }
                this.impactFlashTimer = 170;
                this.spawnImpactWaves();
                this.spawnImpactDebris();
                audio.playExplosion();
                if (window.game && typeof window.game.queueHitFeedback === 'function') {
                    window.game.queueHitFeedback(8.8, 92);
                }
            }

            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.attackDirection = this.owner && this.owner.facingRight ? 1 : -1;
            }
        }

        if (this.impactFlashTimer > 0) {
            this.impactFlashTimer -= deltaTime * 1000;
        }

        if (this.groundWaves.length > 0) {
            this.groundWaves = this.groundWaves.filter(w => {
                const lifeRatio = w.life / w.maxLife;
                const speed = w.speed + (1 - lifeRatio) * 3.5;
                w.x += w.dir * speed;
                w.life -= deltaTime * 1000;
                return w.life > 0;
            });
        }

        if (this.impactDebris.length > 0) {
            this.impactDebris = this.impactDebris.filter((p) => {
                p.vy += 0.42;
                p.x += p.vx;
                p.y += p.vy;
                p.life -= deltaTime * 1000;
                return p.life > 0;
            });
        }
    }
    
    getHitbox(player) {
        const hitboxes = [];

        if (this.isAttacking && !this.hasImpacted) {
            const pose = this.getPose(player);
            const blade = this.getBladeGeometry(pose);
            const minX = Math.min(blade.rootX, blade.tipX) - blade.hitThickness * 0.5;
            const minY = Math.min(blade.rootY, blade.tipY) - blade.hitThickness * 0.5;
            hitboxes.push({
                x: minX,
                y: minY,
                width: Math.max(12, Math.abs(blade.tipX - blade.rootX) + blade.hitThickness),
                height: Math.max(12, Math.abs(blade.tipY - blade.rootY) + blade.hitThickness)
            });
        }

        if (this.impactFlashTimer > 0) {
            hitboxes.push({
                x: this.impactX - 52,
                y: this.impactY - 26,
                width: 104,
                height: 52
            });
        }

        if (this.groundWaves.length > 0) {
            for (const sw of this.groundWaves) {
                hitboxes.push({
                    x: sw.x - 26,
                    y: sw.y - 26,
                    width: 52,
                    height: 28
                });
            }
        }

        return hitboxes.length > 0 ? hitboxes : null;
    }
    
    render(ctx, player) {
        if (this.isAttacking) {
            const pose = this.getPose(player);
            const blade = this.getBladeGeometry(pose);
            ctx.save();
            ctx.translate(pose.handX, pose.handY);
            ctx.rotate(pose.rotation);

            // 柄（巻き付き表現）
            const handleBack = -32;
            const handleFront = 21;
            ctx.fillStyle = '#6d4520';
            ctx.beginPath();
            ctx.rect(handleBack, -4.3, handleFront - handleBack, 8.6);
            ctx.fill();
            ctx.strokeStyle = '#3d2310';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(handleBack + 5, -3.5);
            ctx.lineTo(handleBack + 5, 3.5);
            ctx.moveTo(handleBack + 15, -3.5);
            ctx.lineTo(handleBack + 15, 3.5);
            ctx.moveTo(handleBack + 25, -3.5);
            ctx.lineTo(handleBack + 25, 3.5);
            ctx.stroke();

            // 鍔
            ctx.fillStyle = '#d4b260';
            ctx.beginPath();
            ctx.moveTo(16.5, -5.4);
            ctx.quadraticCurveTo(20.8, -7.2, 23.6, -1.1);
            ctx.quadraticCurveTo(21.2, 4.8, 16.2, 4.6);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#a98331';
            ctx.fillRect(13.2, -4.2, 2.4, 8.4);

            // 青龍刀寄りの刀身（厚みはあるが包丁形にしない）
            const bladeStart = blade.bladeStart;
            const bladeEnd = blade.bladeEnd;
            const bladeGrad = ctx.createLinearGradient(bladeStart, -2, bladeEnd, 3);
            bladeGrad.addColorStop(0, '#cfd6de');
            bladeGrad.addColorStop(0.48, '#f1f6fc');
            bladeGrad.addColorStop(1, '#aeb8c5');
            ctx.fillStyle = bladeGrad;
            ctx.beginPath();
            ctx.moveTo(bladeStart, -7.6);
            ctx.quadraticCurveTo(bladeStart + 30, -15.5, bladeStart + 74, -11.6);
            ctx.quadraticCurveTo(bladeEnd - 24, -8.8, bladeEnd + 5, -1.4);
            ctx.quadraticCurveTo(bladeEnd - 10, 6.5, bladeEnd - 29, 9.2);
            ctx.quadraticCurveTo(bladeStart + 42, 11.8, bladeStart + 8, 8.4);
            ctx.quadraticCurveTo(bladeStart - 2, 4.5, bladeStart, -7.6);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#8e9aa8';
            ctx.lineWidth = 1.45;
            ctx.stroke();

            // 切先寄りの返し
            ctx.fillStyle = 'rgba(214, 226, 238, 0.9)';
            ctx.beginPath();
            ctx.moveTo(bladeEnd - 23, -8.6);
            ctx.quadraticCurveTo(bladeEnd - 10, -9.8, bladeEnd + 2.8, -2.5);
            ctx.quadraticCurveTo(bladeEnd - 9.5, -4.5, bladeEnd - 20, -4.2);
            ctx.closePath();
            ctx.fill();

            // 峰ライン
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.05;
            ctx.beginPath();
            ctx.moveTo(bladeStart + 8, -2.9);
            ctx.quadraticCurveTo(bladeStart + 58, -5.9, bladeEnd - 14, -1.3);
            ctx.stroke();

            ctx.restore();
        }

        // 着地インパクト
        if (this.impactFlashTimer > 0) {
            const alpha = Math.max(0, this.impactFlashTimer / 170);
            ctx.save();
            ctx.strokeStyle = `rgba(255, 235, 180, ${alpha})`;
            ctx.lineWidth = 5.6;
            ctx.beginPath();
            ctx.arc(this.impactX, this.impactY - 4, 16 + (1 - alpha) * 34, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 214, 126, ${alpha * 0.8})`;
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.arc(this.impactX, this.impactY - 2, 10 + (1 - alpha) * 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 左右へ走る地震動の衝撃波
        if (this.groundWaves.length > 0) {
            for (const sw of this.groundWaves) {
                const ratio = sw.life / sw.maxLife;
                const px = sw.x;
                const py = sw.y - 3;
                ctx.save();
                ctx.translate(px, py);
                ctx.scale(sw.dir, 1);
                ctx.globalAlpha = ratio;
                ctx.shadowColor = 'rgba(255, 228, 150, 0.88)';
                ctx.shadowBlur = 16;
                const body = sw.thickness || 24;
                const core = sw.core || 10;
                ctx.fillStyle = 'rgba(255, 224, 132, 0.82)';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(18, -body * 0.56, 42, 0);
                ctx.quadraticCurveTo(20, body * 0.32, 0, 2);
                ctx.fill();

                ctx.shadowBlur = 8;
                ctx.fillStyle = 'rgba(255, 245, 205, 0.86)';
                ctx.beginPath();
                ctx.moveTo(0, -0.5);
                ctx.quadraticCurveTo(12, -core * 0.62, 28, -0.5);
                ctx.quadraticCurveTo(12, core * 0.26, 0, 0.8);
                ctx.fill();
                ctx.restore();
            }
        }

        if (this.impactDebris.length > 0) {
            for (const p of this.impactDebris) {
                const life = Math.max(0, p.life / p.maxLife);
                ctx.save();
                ctx.globalAlpha = life;
                ctx.fillStyle = 'rgba(198, 166, 116, 0.72)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (0.75 + life * 0.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
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
        case '火薬玉': return new Firebomb();
        case '大槍': return new Spear();
        case '二刀流': return new DualBlades();
        case '鎖鎌': return new Kusarigama();
        case '大太刀': return new Nodachi();
        default: return null;
    }
}
