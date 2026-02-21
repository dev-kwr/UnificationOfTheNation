// ============================================
// Unification of the Nation - 敵クラス
// ============================================

import { ENEMY_TYPES, COLORS, GRAVITY, CANVAS_WIDTH } from './constants.js';
import { audio } from './audio.js';

const ENEMY_HEADBAND_BASE = '#4f2f72';
const ENEMY_HEADBAND_HIGHLIGHT = '#7e58a6';

// 敵ベースクラス
export class Enemy {
    constructor(x, y, type, groundY) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.groundY = groundY;
        
        // サイズ（タイプによって変更）
        this.width = 40;
        this.height = 60;
        
        // 速度
        this.vx = 0;
        this.vy = 0;
        
        // ステータス
        this.hp = 10;
        this.maxHp = 10;
        this.damage = 1;
        this.speed = 2;
        this.speedVarianceRange = 0.16;
        this.speedVarianceBias = 0;
        this.movementTempo = 1;
        this.isDying = false; 
        this.deathTimer = 0;
        this.deathDuration = 420;
        this.deathRiseSpeed = 8;
        
        // 報酬
        this.expReward = 10;
        this.moneyReward = 5;
        this.specialGaugeReward = 8; // 5 -> 8
        
        // 飛び道具
        this.projectiles = [];
        this.hitTimer = 0; // 追加
        this.slowTimer = 0;
        this.slowMultiplier = 1;
        this.pullStopTimer = 0;
        this.pullStopDistance = 0;
        
        // 状態
        this.isGrounded = true;
        this.facingRight = true;
        this.isAlive = true;
        this.isDying = false; // 死亡演出中フラグ
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.attackWindupMs = 110;
        
        // AI
        this.state = 'idle';  // idle, patrol, chase, attack
        this.stateTimer = 0;
        this.patrolDirection = 1;
        this.detectionRange = 300;
        this.attackRange = 50;
        
        // 無敵時間（ノックバック用など）
        this.invincibleTimer = 0;
        
        // アニメーション
        this.animationTimer = 0;
        this.animationFrame = 0;
        this.legAngle = 0;
        this.bob = 0;
        this.animState = 'idle';
        this.motionTime = Math.random() * 1000;
        this.jumpCooldown = 0;
        this.torsoLean = 0;
        this.armSwing = 0;
        
        // 死亡演出用
        this.deathTimer = 0;
        this.deathDuration = 420;
        
        this.init();
        
        // 難易度によるステータス補正
        this.applyDifficultyScaling();
        this.applySpawnSpeedVariance();
    }
    
    applyDifficultyScaling() {
        // グローバルな game オブジェクト（または初期化時に渡された値）から難易度取得
        const difficulty = window.game ? window.game.difficulty : { damageMult: 1.0, hpMult: 1.0 };
        this.damage = Math.max(1, Math.floor(this.damage * difficulty.damageMult));
        this.maxHp = Math.max(1, Math.floor(this.maxHp * difficulty.hpMult));
        this.hp = this.maxHp;
    }

    applySpawnSpeedVariance() {
        const variance = Number.isFinite(this.speedVarianceRange) ? this.speedVarianceRange : 0;
        const bias = Number.isFinite(this.speedVarianceBias) ? this.speedVarianceBias : 0;
        const roll = (Math.random() * 2 - 1) * variance;
        const tempo = Math.max(0.72, Math.min(1.5, 1 + bias + roll));
        this.movementTempo = tempo;
        this.speed = Math.max(0.6, this.speed * tempo);
    }
    
    init() {
        // サブクラスでオーバーライド
    }
    update(deltaTime, player, obstacles = []) {
        if (!this.isAlive || this.isDying) {
            this.deathTimer += deltaTime * 1000;
            // 昇天モーション削除：上昇処理をコメントアウト
            // this.y -= this.deathRiseSpeed;
            if (this.deathTimer >= this.deathDuration) {
                this.isAlive = false;
                this.isDying = false;
                return true; // 完全に消滅
            }
            return false;
        }

        this.motionTime += deltaTime * 1000;
        if (this.jumpCooldown > 0) {
            this.jumpCooldown -= deltaTime * 1000;
        }

        if (this.slowTimer > 0) {
            this.slowTimer -= deltaTime * 1000;
            if (this.slowTimer <= 0) {
                this.slowTimer = 0;
                this.slowMultiplier = 1;
            }
        }
        
        // ヒットエフェクト
        if (this.hitTimer > 0) {
            this.hitTimer -= deltaTime * 1000;
        }

        // 被弾直後の短い無敵
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= deltaTime * 1000;
        }
        
        // クールダウン
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime * 1000;
        }

        // 攻撃更新
        if (this.isAttacking) {
            this.updateAttack(deltaTime);
        }
        
        // AI更新
        this.updateAI(deltaTime, player);
        
        // 物理演算（障害物判定を含む）
        this.applyPhysics(obstacles);
        this.applyPullStopConstraint(player, deltaTime * 1000);

        // 2.5Dで進行方向を向けるため、攻撃中以外は移動方向に向きを合わせる
        if (!this.isAttacking && Math.abs(this.vx) > 0.18) {
            this.facingRight = this.vx > 0;
        }
        
        // 飛び道具更新
        if (this.projectiles) {
            this.projectiles = this.projectiles.filter(p => p.update(deltaTime, player));
        }
        
        // アニメーション更新
        this.updateAnimation(deltaTime);
        
        return false;
    }
    
    updateAnimation(deltaTime) {
        this.animationTimer += deltaTime * 1000;
        
        // 状態の判定
        if (this.isAttacking) {
            this.animState = 'attack';
        } else if (Math.abs(this.vx) > 0.1) {
            this.animState = 'run';
        } else {
            this.animState = 'idle';
        }
        
        // アニメーション定数
        const frameDuration = 100;
        if (this.animationTimer >= frameDuration) {
            this.animationTimer = 0;
            this.animationFrame++;
        }
        
        // 足の動きとボブ
        if (this.animState === 'run') {
            this.legAngle = Math.sin(this.motionTime * 0.012) * 0.7;
            this.bob = Math.abs(Math.cos(this.motionTime * 0.012)) * 3;
            this.torsoLean = Math.sin(this.motionTime * 0.012) * 2.1;
            this.armSwing = Math.sin(this.motionTime * 0.018) * 0.9;
        } else if (this.animState === 'idle') {
            this.legAngle = 0;
            this.bob = Math.sin(this.motionTime * 0.003) * 2;
            this.torsoLean = Math.sin(this.motionTime * 0.004) * 0.5;
            this.armSwing = Math.sin(this.motionTime * 0.01) * 0.2;
        } else {
            this.legAngle = 0.25 + Math.sin(this.motionTime * 0.02) * 0.1;
            this.bob = 0;
            this.torsoLean = (this.facingRight ? 1 : -1) * (1.1 + Math.sin(this.motionTime * 0.03) * 0.25);
            this.armSwing = 0.6 + Math.sin(this.motionTime * 0.03) * 0.3;
        }
    }

    drawStylizedLegs(ctx, {
        centerX,
        hipX,
        hipY,
        footY,
        dir,
        gaitPhase,
        runBlend,
        backColor = '#151515',
        frontColor = '#171717',
        backWidth = 4,
        frontWidth = 5,
        spread = 2,
        stepScale = 7,
        liftScale = 4
    }) {
        const stride = Math.sin(gaitPhase);
        const strideAmp = stepScale * (0.45 + runBlend * 0.9);
        const liftAmp = liftScale * (0.35 + runBlend * 0.95);
        const legSpanY = footY - hipY;

        const drawLeg = (legSign, color, width, depthShift) => {
            const phase = stride * legSign;
            const forward = phase * strideAmp;
            const lift = Math.max(0, -phase) * liftAmp;
            const plant = Math.max(0, phase) * (0.8 + runBlend * 0.6);

            const footX = centerX + dir * (forward + legSign * spread);
            const footLocalY = footY - lift + depthShift * 0.25;
            const kneeX = hipX + dir * (forward * 0.46 + legSign * (spread * 0.95 + 1.2));
            const kneeY = hipY + legSpanY * (0.5 + runBlend * 0.05) - lift * 0.78 + plant * 0.35 + depthShift;

            ctx.strokeStyle = color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.lineTo(footX, footLocalY);
            ctx.stroke();

            // 足先の立体化（ハイライトと影を追加）
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(footX, footLocalY + 1.15, width * 0.84 + 1.25, 1.5 + width * 0.12, dir * 0.08, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(footX - width*0.5, footLocalY + 0.5);
            ctx.lineTo(footX + width*0.5, footLocalY + 0.5);
            ctx.stroke();
        };

        // 奥の足を暗く、手前の足を明るくする
        drawLeg(1, backColor, backWidth, 0.8);
        drawLeg(-1, frontColor, frontWidth, 0);
    }

    clampLimbReach(anchorX, anchorY, targetX, targetY, maxLen) {
        const dx = targetX - anchorX;
        const dy = targetY - anchorY;
        const dist = Math.hypot(dx, dy);
        if (dist <= maxLen || dist === 0) {
            return { x: targetX, y: targetY };
        }
        const ratio = maxLen / dist;
        return {
            x: anchorX + dx * ratio,
            y: anchorY + dy * ratio
        };
    }

    drawJointedArm(ctx, {
        shoulderX,
        shoulderY,
        handX,
        handY,
        upperLen = 11.5,
        foreLen = 11.5,
        bendSign = 1,
        upperWidth = 5,
        foreWidth = 4.4,
        jointRadius = 3,
        baseColor = '#171717',
        handColor = '#1a1a1a',
        highlightColor = 'rgba(255,255,255,0.12)',
        highlightWidth = 1.2
    }) {
        // 敵腕は視認性重視でシンプル化（肘関節なし・やや短め）
        const maxReach = Math.max(0.1, (upperLen + foreLen) * 0.76);
        const clampedHand = this.clampLimbReach(shoulderX, shoulderY, handX, handY, maxReach);
        let dx = clampedHand.x - shoulderX;
        let dy = clampedHand.y - shoulderY;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.001) {
            dx = 0.001;
            dist = 0.001;
        }
        const ux = dx / dist;
        const uy = dy / dist;
        const nx = -uy;
        const ny = ux;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = (upperWidth * 0.58 + foreWidth * 0.42);
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(clampedHand.x, clampedHand.y);
        ctx.stroke();

        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = highlightWidth;
        ctx.beginPath();
        ctx.moveTo(shoulderX + nx * 0.34, shoulderY + ny * 0.34);
        ctx.lineTo(clampedHand.x + nx * 0.34, clampedHand.y + ny * 0.34);
        ctx.stroke();

        const elbowX = shoulderX + dx * 0.5;
        const elbowY = shoulderY + dy * 0.5;
        const handRadius = Math.max(2.7, jointRadius * 0.92);
        ctx.fillStyle = handColor;
        ctx.beginPath();
        ctx.arc(clampedHand.x, clampedHand.y, handRadius, 0, Math.PI * 2);
        ctx.fill();

        return {
            elbowX,
            elbowY,
            handX: clampedHand.x,
            handY: clampedHand.y
        };
    }

    drawDetailedSpear(ctx, {
        shaftStartX,
        shaftStartY,
        shaftEndX,
        shaftEndY,
        tipLen = 14,
        tipWidth = 7,
        tasselSwing = 0,
        showTassel = true
    }) {
        const dx = shaftEndX - shaftStartX;
        const dy = shaftEndY - shaftStartY;
        const shaftLen = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / shaftLen;
        const uy = dy / shaftLen;
        const nx = -uy;
        const ny = ux;

        const tipBaseX = shaftEndX;
        const tipBaseY = shaftEndY;
        const tipX = tipBaseX + ux * tipLen;
        const tipY = tipBaseY + uy * tipLen;
        const tipHalf = tipWidth * 0.5;
        const tipLeftX = tipBaseX + nx * tipHalf;
        const tipLeftY = tipBaseY + ny * tipHalf;
        const tipRightX = tipBaseX - nx * tipHalf;
        const tipRightY = tipBaseY - ny * tipHalf;

        const shaftGrad = ctx.createLinearGradient(shaftStartX, shaftStartY, shaftEndX, shaftEndY);
        shaftGrad.addColorStop(0, '#6b4a2f');
        shaftGrad.addColorStop(0.55, '#7a5738');
        shaftGrad.addColorStop(1, '#4a3220');
        ctx.strokeStyle = shaftGrad;
        ctx.lineWidth = 3.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shaftStartX, shaftStartY);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 232, 202, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(shaftStartX + nx * 0.6, shaftStartY + ny * 0.6);
        ctx.lineTo(shaftEndX + nx * 0.6, shaftEndY + ny * 0.6);
        ctx.stroke();

        const wrapT = 0.16;
        const wrapX = shaftStartX + ux * shaftLen * wrapT;
        const wrapY = shaftStartY + uy * shaftLen * wrapT;
        ctx.strokeStyle = '#c7a34c';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(wrapX - nx * 2.1, wrapY - ny * 2.1);
        ctx.lineTo(wrapX + nx * 2.1, wrapY + ny * 2.1);
        ctx.stroke();

        if (showTassel) {
            const tasselBaseX = tipBaseX - ux * 1.8;
            const tasselBaseY = tipBaseY - uy * 1.8;
            ctx.fillStyle = '#c43b3b';
            ctx.beginPath();
            ctx.arc(tasselBaseX, tasselBaseY, 2.6, 0, Math.PI * 2);
            ctx.fill();
            const swayX = nx * (1.6 + tasselSwing * 0.18) + ux * 0.9;
            const swayY = ny * (1.6 + tasselSwing * 0.18) + uy * 0.9;
            ctx.beginPath();
            ctx.moveTo(tasselBaseX, tasselBaseY);
            ctx.lineTo(tasselBaseX + swayX, tasselBaseY + swayY);
            ctx.lineTo(tasselBaseX + swayX * 0.35 + ux * 2.2, tasselBaseY + swayY * 0.35 + uy * 2.2);
            ctx.closePath();
            ctx.fill();
        }

        const tipGrad = ctx.createLinearGradient(tipBaseX - ux * 2, tipBaseY - uy * 2, tipX, tipY);
        tipGrad.addColorStop(0, '#e8ebf0');
        tipGrad.addColorStop(0.5, '#ffffff'); // 金属の鋭い反射
        tipGrad.addColorStop(0.8, '#a2adb8');
        tipGrad.addColorStop(1, '#7a8694');
        
        ctx.fillStyle = tipGrad;
        ctx.strokeStyle = '#5c6673';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipLeftX, tipLeftY);
        ctx.lineTo(tipBaseX - ux * 2.2, tipBaseY - uy * 2.2);
        ctx.lineTo(tipRightX, tipRightY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tipBaseX + nx * 0.4, tipBaseY + ny * 0.4);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // 強いハイライト（環境光の反射ピーク）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(tipBaseX + ux * 4, tipBaseY + uy * 4, 1.8, 0, Math.PI * 2);
        ctx.fill();

        return { tipX, tipY, tipBaseX, tipBaseY };
    }

    drawDetailedKatana(ctx, {
        handX,
        handY,
        angle,
        length = 40,
        gripLen = 11,
        bladeWidth = 2.2,
        guardSize = 2.3,
        profileFlipY = 1
    }) {
        ctx.save();
        ctx.translate(handX, handY);
        ctx.rotate(angle);
        ctx.scale(1, profileFlipY < 0 ? -1 : 1);

        const gripBack = -gripLen - 1.8;
        const gripFront = -0.4;
        const gripHeight = 3.7;
        const handleLen = gripFront - gripBack;

        ctx.fillStyle = '#1b1b1d';
        ctx.beginPath();
        ctx.moveTo(gripBack, -gripHeight * 0.52);
        ctx.lineTo(gripFront, -gripHeight * 0.44);
        ctx.lineTo(gripFront, gripHeight * 0.44);
        ctx.lineTo(gripBack, gripHeight * 0.52);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(224, 224, 228, 0.32)';
        ctx.lineWidth = 0.8;
        for (let i = 0; i <= 4; i++) {
            const tx = gripBack + (handleLen * i) / 4;
            ctx.beginPath();
            ctx.moveTo(tx, -gripHeight * 0.46);
            ctx.lineTo(tx + 2.1, gripHeight * 0.46);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(tx, gripHeight * 0.46);
            ctx.lineTo(tx + 2.1, -gripHeight * 0.46);
            ctx.stroke();
        }
        ctx.fillStyle = '#6d6d70';
        ctx.beginPath();
        ctx.ellipse(gripBack - 0.8, 0, 1.4, gripHeight * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();

        const guardGrad = ctx.createLinearGradient(0, -guardSize, 0, guardSize);
        guardGrad.addColorStop(0, '#d3b36a');
        guardGrad.addColorStop(0.45, '#b38943');
        guardGrad.addColorStop(1, '#7b5b2a');
        ctx.fillStyle = guardGrad;
        ctx.beginPath();
        ctx.ellipse(0.25, 0, guardSize, guardSize * 0.88, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5a4220';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        const habakiX = guardSize * 0.95 + 0.6;
        ctx.fillStyle = '#cfac53';
        ctx.fillRect(habakiX, -bladeWidth * 0.68, 2.4, bladeWidth * 1.36);
        ctx.strokeStyle = '#9e782d';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(habakiX, -bladeWidth * 0.68, 2.4, bladeWidth * 1.36);

        const bladeStart = habakiX + 2.2;
        const bladeEnd = Math.max(bladeStart + 16, length + 2.2);
        const tipX = bladeEnd + 2.2;
        const soriLift = Math.max(1.2, (bladeEnd - bladeStart) * 0.085);
        const bladeGrad = ctx.createLinearGradient(bladeStart, -bladeWidth, bladeEnd, bladeWidth);
        bladeGrad.addColorStop(0, '#d7e0ec');
        bladeGrad.addColorStop(0.45, '#f8fbff');
        bladeGrad.addColorStop(1, '#a6b1c0');
        ctx.fillStyle = bladeGrad;
        ctx.strokeStyle = '#5b6777';
        ctx.lineWidth = 1.08;
        ctx.beginPath();
        ctx.moveTo(bladeStart, -bladeWidth * 0.56);
        ctx.quadraticCurveTo(
            bladeStart + (bladeEnd - bladeStart) * 0.5,
            -bladeWidth * 0.92 - soriLift,
            bladeEnd - 2.8,
            -bladeWidth * 0.46
        );
        ctx.lineTo(tipX, -0.05);
        ctx.quadraticCurveTo(
            bladeEnd - 8.8,
            bladeWidth * 0.94 - soriLift * 0.32,
            bladeStart,
            bladeWidth * 0.48
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.78)';
        ctx.lineWidth = 0.95;
        ctx.beginPath();
        ctx.moveTo(bladeStart + 2.8, -bladeWidth * 0.14);
        ctx.quadraticCurveTo(
            bladeStart + (bladeEnd - bladeStart) * 0.56,
            -bladeWidth * 0.54 - soriLift * 0.6,
            bladeEnd - 6.0,
            -bladeWidth * 0.1
        );
        ctx.stroke();
        
        // 刃文（Hamon）はフレーム毎に揺れないよう決定的な波形で描く
        ctx.strokeStyle = 'rgba(230, 240, 255, 0.38)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        let firstHamon = true;
        for (let bx = bladeStart + 4; bx < bladeEnd - 4; bx += 3.0) {
            const nx = (bx - bladeStart) / Math.max(1, (bladeEnd - bladeStart));
            const waveA = Math.sin((bx + bladeEnd * 0.27) * 0.34) * (bladeWidth * 0.16);
            const waveB = Math.sin((bx + bladeEnd * 0.11) * 0.88) * (bladeWidth * 0.06);
            const arc = -Math.pow(nx, 1.55) * soriLift * 0.28;
            const by = bladeWidth * 0.2 + arc + waveA + waveB;
            if (firstHamon) {
                ctx.moveTo(bx, by);
                firstHamon = false;
            } else {
                ctx.lineTo(bx, by);
            }
        }
        ctx.stroke();

        // 強い環境光の反射ピーク
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.ellipse(bladeStart + (bladeEnd - bladeStart) * 0.42, -bladeWidth * 0.24 - soriLift * 0.22, 3.2, 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        return {
            tipX: handX + Math.cos(angle) * tipX,
            tipY: handY + Math.sin(angle) * tipX,
            gripEndX: handX + Math.cos(angle) * gripBack,
            gripEndY: handY + Math.sin(angle) * gripBack
        };
    }

    drawDetailedHeavyBlade(ctx, {
        handX,
        handY,
        angle,
        length = 64,
        gripLen = 12,
        profileFlipY = 1
    }) {
        ctx.save();
        ctx.translate(handX, handY);
        ctx.rotate(angle);
        ctx.scale(1, profileFlipY < 0 ? -1 : 1);

        const gripBack = -gripLen - 2;
        ctx.fillStyle = '#3a2a1f';
        ctx.fillRect(gripBack, -3.2, gripLen + 2, 6.4);
        ctx.strokeStyle = '#725437';
        ctx.lineWidth = 1.2;
        for (let i = 1; i <= 3; i++) {
            const tx = gripBack + i * ((gripLen + 1) / 4);
            ctx.beginPath();
            ctx.moveTo(tx, -2.9);
            ctx.lineTo(tx, 2.9);
            ctx.stroke();
        }

        ctx.fillStyle = '#c8a756';
        ctx.beginPath();
        ctx.moveTo(0, -4.6);
        ctx.lineTo(4.4, -2.9);
        ctx.lineTo(4.4, 2.9);
        ctx.lineTo(0, 4.6);
        ctx.lineTo(-1.6, 0);
        ctx.closePath();
        ctx.fill();

        const bladeEnd = length + 4.5;
        ctx.fillStyle = '#aeb8c5';
        ctx.strokeStyle = '#414d5c';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(1.2, -4.2);
        ctx.quadraticCurveTo(length * 0.36, -8.8, length * 0.78, -6.2);
        ctx.quadraticCurveTo(bladeEnd - 5, -4.8, bladeEnd + 2.2, -0.8);
        ctx.quadraticCurveTo(bladeEnd - 6, 4.6, length * 0.8, 6.4);
        ctx.quadraticCurveTo(length * 0.36, 7.6, 1.2, 4.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.68)';
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(4.2, -1.1);
        ctx.quadraticCurveTo(length * 0.56, -3.9, bladeEnd - 8, -0.8);
        ctx.stroke();

        // 大剣の荒々しい刃文（Hamon）
        ctx.strokeStyle = 'rgba(230, 240, 255, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let firstHamon = true;
        for (let bx = 6; bx < bladeEnd - 4; bx += 3.5) {
            const waveA = Math.sin((bx + length * 0.28) * 0.27) * 1.05;
            const waveB = Math.sin((bx + length * 0.07) * 0.68) * 0.62;
            const by = 2.5 + waveA + waveB;
            if (firstHamon) {
                ctx.moveTo(bx, by);
                firstHamon = false;
            } else {
                ctx.lineTo(bx, by);
            }
        }
        ctx.stroke();

        // 強い環境光の反射ピーク
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.ellipse(length * 0.45, -2, 4, 1.2, -0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        return {
            tipX: handX + Math.cos(angle) * (bladeEnd + 1.2),
            tipY: handY + Math.sin(angle) * (bladeEnd + 1.2)
        };
    }

    getUnifiedAttackProgress(defaultDurationMs = 320, progressResolver = null) {
        if (!this.isAttacking) return 0;
        if (typeof progressResolver === 'function') {
            return Math.max(0, Math.min(1, progressResolver()));
        }
        const duration = Math.max(
            1,
            Number.isFinite(this.attackDuration) ? this.attackDuration : defaultDurationMs
        );
        return Math.max(0, Math.min(1, 1 - ((this.attackTimer || 0) / duration)));
    }

    renderUnifiedEnemyModel(ctx, config = {}) {
        const clamp01 = (v) => Math.max(0, Math.min(1, v));
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = clamp01(Math.abs(this.vx) / Math.max(1, this.speed * 1.12));
        const gaitPhase = this.motionTime * (config.gaitSpeed || 0.0118);
        const scale = Number.isFinite(config.scale) ? config.scale : 1;
        const headRatio = Number.isFinite(config.headRatio) ? config.headRatio : 0.2;
        const armScale = Number.isFinite(config.armScale) ? config.armScale : 1;
        const torsoLeanScale = Number.isFinite(config.torsoLeanScale) ? config.torsoLeanScale : 1;
        const basePalette = {
            shadow: 'rgba(0,0,0,0.28)',
            legBack: '#111111',
            legFront: '#181818',
            robe: '#22262f',
            robeShade: '#1a1d24',
            torsoCore: '#16181d',
            armorA: '#3f4653',
            armorB: '#2a2f3a',
            armorEdge: '#b99a58',
            shoulder: '#474f5f',
            skin: '#1a1a1a',
            helmTop: '#2a2e37',
            helmBottom: '#17191f',
            crest: '#b08f42',
            accent: '#6f5ba2'
        };
        const palette = { ...basePalette, ...(config.palette || {}) };

        const attackProgress = this.getUnifiedAttackProgress(
            Number.isFinite(config.attackDurationMs) ? config.attackDurationMs : 320,
            config.attackProgressResolver || null
        );
        const windup = attackProgress < 0.3 ? attackProgress / 0.3 : 1;
        const swing = attackProgress < 0.3 ? 0 : (attackProgress - 0.3) / 0.7;

        const shoulderY = this.y + this.height * 0.38 + Math.abs(this.bob) * 0.14;
        const hipY = this.y + this.height * 0.68 + this.bob * 0.08;
        const leanBase = (1.2 + this.torsoLean * 0.55 + (this.isAttacking ? 0.9 : 0)) * torsoLeanScale;
        // 進行方向を正面にしつつ、体幹だけわずかに画面側へ振って2.5D化
        const facingLead = dir * this.width * 0.035;
        const bodyScreenTilt = dir * this.width * 0.038;
        const shoulderCenterX = centerX + dir * leanBase + facingLead;
        const shoulderFrontX = shoulderCenterX + dir * (this.width * 0.12 + bodyScreenTilt * 0.3);
        const shoulderBackX = shoulderCenterX - dir * (this.width * 0.1 - bodyScreenTilt * 0.18);
        const hipCenterX = centerX - dir * this.width * 0.04 + facingLead * 0.72 - bodyScreenTilt * 0.16;
        const headRadius = this.height * headRatio * scale;
        const headX = shoulderCenterX + facingLead * 0.38 - dir * this.width * 0.015;
        const headY = shoulderY - headRadius * 0.95;

        const legStep = (config.legStepScale || 9.0) * (0.76 + this.height / 120);
        const legLift = (config.legLiftScale || 5.2) * (0.76 + this.height / 120);
        const legSpread = (config.legSpread || 2.8) * (0.72 + this.width / 58);

        ctx.fillStyle = palette.shadow;
        ctx.beginPath();
        ctx.ellipse(
            centerX,
            footY + Math.max(1.2, this.height * 0.02),
            this.width * 0.38,
            Math.max(3, this.height * 0.06),
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();

        if (config.backCape) {
            const capeTopY = shoulderY + this.height * 0.018;
            const capeBottomY = footY - 1.6;
            const capeWave = Math.sin(this.motionTime * 0.0054 + (config.capePhase || 0)) * (this.width * 0.08);
            const capeSpread = this.width * 0.62;
            const capeGrad = ctx.createLinearGradient(centerX, capeTopY, centerX, capeBottomY);
            capeGrad.addColorStop(0, palette.capeTop || '#8e3446');
            capeGrad.addColorStop(0.5, palette.capeMid || '#47202a');
            capeGrad.addColorStop(1, palette.capeBottom || '#1a0b10');
            ctx.fillStyle = capeGrad;
            ctx.beginPath();
            ctx.moveTo(shoulderBackX - dir * this.width * 0.16, capeTopY);
            ctx.lineTo(shoulderFrontX - dir * this.width * 0.2, capeTopY + this.height * 0.012);
            ctx.lineTo(centerX + dir * (capeSpread + capeWave), capeBottomY);
            ctx.lineTo(centerX - dir * (capeSpread - capeWave * 0.65), capeBottomY);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.moveTo(shoulderBackX - dir * this.width * 0.12, capeTopY + this.height * 0.01);
            ctx.lineTo(centerX + dir * (capeSpread * 0.5 + capeWave * 0.4), capeBottomY - this.height * 0.06);
            ctx.lineTo(centerX + dir * (capeSpread * 0.22), capeBottomY - this.height * 0.01);
            ctx.lineTo(hipCenterX - dir * this.width * 0.08, hipY);
            ctx.closePath();
            ctx.fill();
        }

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX: hipCenterX,
            hipY,
            footY,
            dir,
            gaitPhase,
            runBlend,
            backColor: palette.legBack,
            frontColor: palette.legFront,
            backWidth: Math.max(3.8, this.width * 0.12),
            frontWidth: Math.max(4.4, this.width * 0.14),
            spread: legSpread,
            stepScale: legStep,
            liftScale: legLift
        });

        const drawLowerBodyCover = !!config.lowerBodyCover;
        if (drawLowerBodyCover) {
            const clothSwing = Math.sin(this.motionTime * 0.006 + (config.clothPhase || 0)) * (this.width * 0.08);
            ctx.fillStyle = palette.robe;
            ctx.beginPath();
            ctx.moveTo(centerX - this.width * 0.42, hipY - this.height * 0.04);
            ctx.lineTo(centerX + this.width * 0.42, hipY - this.height * 0.04);
            ctx.lineTo(centerX + this.width * (0.53 + clothSwing * 0.01), footY - 1.5);
            ctx.lineTo(centerX - this.width * (0.54 - clothSwing * 0.008), footY - 1.5);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = palette.robeShade;
            ctx.beginPath();
            ctx.moveTo(centerX - dir * this.width * 0.08, hipY - this.height * 0.02);
            ctx.lineTo(centerX + dir * this.width * 0.42, hipY - this.height * 0.01);
            ctx.lineTo(centerX + dir * this.width * 0.34, footY - 2);
            ctx.lineTo(centerX - dir * this.width * 0.14, footY - 2);
            ctx.closePath();
            ctx.fill();
        }

        // 体幹軸（プレイヤー同等の頭身に合わせた長さ）
        ctx.strokeStyle = palette.torsoCore;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(8, this.width * 0.28);
        ctx.beginPath();
        ctx.moveTo(shoulderCenterX, shoulderY);
        ctx.lineTo(hipCenterX, hipY);
        ctx.stroke();

        const armorTopY = shoulderY + this.height * 0.025;
        const armorBottomY = hipY - this.height * 0.02;
        const simpleOutfit = !!config.simpleOutfit;
        const noFrontArmor = !!config.noFrontArmor;
        const drawShoulderPads = config.shoulderPads !== false && !simpleOutfit && !noFrontArmor;
        if (noFrontArmor) {
            // 頭部アクセのみを強調するため、胴の前面装飾は置かず最小限の体積だけ残す
            const bodyW = this.width * 0.19;
            const skew = dir * this.width * 0.045;
            ctx.fillStyle = palette.torsoCore;
            ctx.beginPath();
            ctx.moveTo(shoulderBackX - bodyW * 0.2 - skew * 0.2, armorTopY + this.height * 0.012);
            ctx.lineTo(shoulderFrontX + bodyW * 0.22 + skew * 0.28, armorTopY + this.height * 0.024);
            ctx.lineTo(hipCenterX + bodyW * 0.28 + skew * 0.18, armorBottomY);
            ctx.lineTo(hipCenterX - bodyW * 0.24 - skew * 0.16, armorBottomY + this.height * 0.008);
            ctx.closePath();
            ctx.fill();
        } else if (simpleOutfit) {
            // 雑魚は複雑な鎧を省き、シンプルな着物シルエットで読みやすくする
            const bodyW = this.width * 0.24;
            ctx.fillStyle = palette.armorA;
            ctx.beginPath();
            ctx.moveTo(shoulderCenterX - bodyW, armorTopY);
            ctx.lineTo(shoulderCenterX + bodyW * 0.9, armorTopY + this.height * 0.01);
            ctx.lineTo(hipCenterX + bodyW * 0.82 + dir * 2.4, armorBottomY);
            ctx.lineTo(hipCenterX - bodyW * 0.94 + dir * 0.9, armorBottomY + this.height * 0.008);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = palette.armorEdge;
            ctx.lineWidth = Math.max(1.0, this.width * 0.024);
            ctx.beginPath();
            ctx.moveTo(shoulderCenterX - bodyW * 0.74, armorTopY + this.height * 0.12);
            ctx.lineTo(shoulderCenterX + bodyW * 0.66, armorTopY + this.height * 0.12);
            ctx.stroke();
        } else {
            // 鎧の面を進行方向に捻って、真正面の平面見えを回避
            const frontInset = this.width * 0.22;
            const backInset = this.width * 0.18;
            ctx.fillStyle = palette.armorA;
            ctx.beginPath();
            ctx.moveTo(shoulderBackX - dir * backInset, armorTopY);
            ctx.lineTo(shoulderFrontX + dir * frontInset, armorTopY + this.height * 0.01);
            ctx.lineTo(hipCenterX + dir * this.width * 0.26, armorBottomY);
            ctx.lineTo(hipCenterX - dir * this.width * 0.25, armorBottomY + this.height * 0.01);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = palette.armorB;
            const plateRows = config.armorRows || 3;
            for (let r = 0; r < plateRows; r++) {
                const t0 = r / plateRows;
                const t1 = (r + 0.86) / plateRows;
                const y0 = armorTopY + (armorBottomY - armorTopY) * t0;
                const y1 = armorTopY + (armorBottomY - armorTopY) * Math.min(1, t1);
                const w0 = this.width * (0.25 + t0 * 0.13);
                const w1 = this.width * (0.24 + Math.min(1, t1) * 0.13);
                const skew = dir * (1.2 + r * 0.45);
                ctx.beginPath();
                ctx.moveTo(shoulderCenterX - w0 - skew, y0);
                ctx.lineTo(shoulderCenterX + w0 - skew * 0.2, y0 + this.height * 0.006);
                ctx.lineTo(shoulderCenterX + w1 + skew * 0.35, y1);
                ctx.lineTo(shoulderCenterX - w1 + skew * 0.55, y1 + this.height * 0.004);
                ctx.closePath();
                ctx.fill();
            }

            ctx.strokeStyle = palette.armorEdge;
            ctx.lineWidth = Math.max(1.2, this.width * 0.03);
            ctx.beginPath();
            ctx.moveTo(shoulderCenterX - this.width * 0.28, armorTopY + this.height * 0.12);
            ctx.lineTo(shoulderCenterX + this.width * 0.24, armorTopY + this.height * 0.12);
            ctx.lineTo(shoulderCenterX + this.width * 0.2, armorBottomY - this.height * 0.02);
            ctx.lineTo(shoulderCenterX - this.width * 0.24, armorBottomY - this.height * 0.02);
            ctx.closePath();
            ctx.stroke();
        }

        if (drawShoulderPads) {
            // 肩当て（楕円を傾けて2.5D化）
            ctx.fillStyle = palette.shoulder;
            ctx.beginPath();
            ctx.ellipse(shoulderFrontX + dir * this.width * 0.12, shoulderY + this.height * 0.01, this.width * 0.16, this.height * 0.06, dir * 0.34, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(shoulderBackX - dir * this.width * 0.1, shoulderY + this.height * 0.02, this.width * 0.145, this.height * 0.055, -dir * 0.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // 頭部
        ctx.fillStyle = palette.skin;
        ctx.beginPath();
        ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        const headShade = ctx.createLinearGradient(headX, headY - headRadius, headX, headY + headRadius);
        headShade.addColorStop(0, 'rgba(255,255,255,0.08)');
        headShade.addColorStop(0.55, 'rgba(0,0,0,0)');
        headShade.addColorStop(1, 'rgba(0,0,0,0.16)');
        ctx.fillStyle = headShade;
        ctx.beginPath();
        ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();

        if (config.headStyle === 'kasa') {
            const kasaGrad = ctx.createLinearGradient(headX, headY - headRadius * 1.7, headX, headY - headRadius * 0.15);
            kasaGrad.addColorStop(0, '#6d4b2e');
            kasaGrad.addColorStop(0.6, '#362316');
            kasaGrad.addColorStop(1, '#1f140d');
            ctx.fillStyle = kasaGrad;
            ctx.beginPath();
            ctx.moveTo(headX - dir * headRadius * 0.18, headY - headRadius * 1.62);
            ctx.lineTo(headX - headRadius * 1.85, headY - headRadius * 0.2);
            ctx.lineTo(headX + headRadius * 1.85, headY - headRadius * 0.2);
            ctx.closePath();
            ctx.fill();
        } else {
            const helmGrad = ctx.createLinearGradient(headX, headY - headRadius * 1.2, headX, headY + headRadius * 0.2);
            helmGrad.addColorStop(0, palette.helmTop);
            helmGrad.addColorStop(1, palette.helmBottom);
            ctx.fillStyle = helmGrad;
            ctx.beginPath();
            ctx.arc(headX, headY - headRadius * 0.33, headRadius * 1.06, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = palette.helmBottom;
            ctx.lineWidth = Math.max(2, this.width * 0.06);
            ctx.beginPath();
            ctx.arc(headX, headY - headRadius * 0.58, headRadius * 1.22, Math.PI * 0.95, Math.PI * 0.05, true);
            ctx.stroke();
            if (config.crest !== false) {
                // 前立ては進行方向を向く
                const crestLengthScale = Number.isFinite(config.crestLengthScale) ? config.crestLengthScale : 1;
                const crestArcHeightScale = Number.isFinite(config.crestArcHeightScale) ? config.crestArcHeightScale : 1;
                const crestTipRiseScale = Number.isFinite(config.crestTipRiseScale) ? config.crestTipRiseScale : 1;
                const crestForwardOffsetScale = Number.isFinite(config.crestForwardOffsetScale) ? config.crestForwardOffsetScale : 1;
                const crestRootLiftScale = Number.isFinite(config.crestRootLiftScale) ? config.crestRootLiftScale : 1;
                const crestVariant = config.crestVariant || 'sweep';
                const crestRootX = headX + dir * headRadius * 0.1 * crestForwardOffsetScale;
                const crestRootY = headY - headRadius * 1.14 * crestRootLiftScale;
                const crestForward = headRadius * 0.84 * crestLengthScale;
                const crestArcLift = headRadius * 0.58 * crestArcHeightScale;
                const crestTipRise = headRadius * 0.22 * crestTipRiseScale;
                ctx.strokeStyle = palette.crest;
                ctx.lineCap = 'round';
                ctx.lineWidth = Math.max(2, this.width * 0.05);
                if (crestVariant === 'crescent') {
                    // 侍用: 中心寄せの三日月板（角度とサイズを安定化）
                    const moonCX = crestRootX + dir * headRadius * 0.12;
                    const moonCY = crestRootY - headRadius * 0.02;
                    const moonTilt = dir * 0.12;
                    const outerRX = headRadius * (0.86 * crestLengthScale);
                    const outerRY = headRadius * (0.66 * crestArcHeightScale);
                    const innerRX = outerRX * 0.68;
                    const innerRY = outerRY * (0.56 + crestTipRiseScale * 0.08);

                    ctx.save();
                    ctx.translate(moonCX, moonCY);
                    ctx.rotate(moonTilt);

                    ctx.fillStyle = palette.crest;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, outerRX, outerRY, 0, Math.PI * 0.98, Math.PI * 0.02, false);
                    ctx.ellipse(0, -headRadius * 0.05, innerRX, innerRY, 0, Math.PI * 0.04, Math.PI * 0.96, true);
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(255,236,182,0.52)';
                    ctx.lineWidth = Math.max(1.0, this.width * 0.02);
                    ctx.beginPath();
                    ctx.ellipse(0, -headRadius * 0.02, innerRX * 0.96, innerRY * 0.9, 0, Math.PI * 0.1, Math.PI * 0.9, false);
                    ctx.stroke();

                    ctx.restore();
                } else if (crestVariant === 'fork') {
                    // 中ボス用: 二股の上向き前立て
                    const baseX = crestRootX + dir * headRadius * 0.18;
                    const baseY = crestRootY - headRadius * 0.06;
                    const forkSpan = headRadius * 0.24;
                    const mainTipX = crestRootX + dir * crestForward;
                    const mainTipY = crestRootY - crestTipRise * 1.18;
                    ctx.beginPath();
                    ctx.moveTo(crestRootX - dir * headRadius * 0.03, crestRootY + headRadius * 0.1);
                    ctx.quadraticCurveTo(
                        crestRootX + dir * headRadius * 0.5,
                        crestRootY - crestArcLift,
                        baseX,
                        baseY
                    );
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(baseX, baseY);
                    ctx.quadraticCurveTo(
                        baseX + dir * headRadius * 0.22,
                        crestRootY - crestArcLift * 1.08,
                        mainTipX,
                        mainTipY
                    );
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(baseX - dir * headRadius * 0.03, baseY + headRadius * 0.03);
                    ctx.quadraticCurveTo(
                        baseX + dir * headRadius * 0.2,
                        crestRootY - crestArcLift * 0.78,
                        mainTipX - dir * forkSpan,
                        mainTipY + headRadius * 0.14
                    );
                    ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,236,182,0.5)';
                    ctx.lineWidth = Math.max(1.2, this.width * 0.022);
                    ctx.beginPath();
                    ctx.moveTo(baseX + dir * headRadius * 0.04, baseY - headRadius * 0.03);
                    ctx.lineTo(mainTipX - dir * headRadius * 0.2, mainTipY + headRadius * 0.08);
                    ctx.stroke();
                } else {
                    // 標準: 上向きに反った前立て
                    ctx.beginPath();
                    ctx.moveTo(crestRootX - dir * headRadius * 0.04, crestRootY + headRadius * 0.1);
                    ctx.quadraticCurveTo(
                        crestRootX + dir * headRadius * 0.52,
                        crestRootY - crestArcLift,
                        crestRootX + dir * crestForward,
                        crestRootY - crestTipRise
                    );
                    ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,236,182,0.48)';
                    ctx.lineWidth = Math.max(1.1, this.width * 0.02);
                    ctx.beginPath();
                    ctx.moveTo(crestRootX + dir * headRadius * 0.16, crestRootY + headRadius * 0.02);
                    ctx.quadraticCurveTo(
                        crestRootX + dir * headRadius * (0.16 + 0.27 * crestLengthScale),
                        crestRootY - headRadius * 0.28 * crestArcHeightScale,
                        crestRootX + dir * headRadius * (0.16 + 0.5 * crestLengthScale),
                        crestRootY - headRadius * 0.1 * crestTipRiseScale
                    );
                    ctx.stroke();
                }
            }
        }

        if (config.headStyle === 'ninja') {
            // 目玉のように見える点は描かない（覆面＋鉢金だけ）
            ctx.save();
            ctx.strokeStyle = palette.accent;
            ctx.lineWidth = Math.max(2.2, this.width * 0.062);
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(headX - headRadius * 0.76, headY - headRadius * 0.3);
            ctx.quadraticCurveTo(headX, headY - headRadius * 0.48, headX + headRadius * 0.78, headY - headRadius * 0.24);
            ctx.stroke();
            ctx.restore();
        }

        const shoulderFrontY = shoulderY + this.height * 0.03;
        const shoulderBackY = shoulderY + this.height * 0.055;
        const upperLen = (this.height * 0.18) * armScale;
        const foreLen = (this.height * 0.19) * armScale;
        const weaponMode = config.weaponMode || 'katana';
        const weaponScale = Number.isFinite(config.weaponScale) ? config.weaponScale : 1;
        const bladeProfileFlipY = Number.isFinite(config.bladeProfileFlipY)
            ? (config.bladeProfileFlipY >= 0 ? 1 : -1)
            : (dir === 1 ? -1 : 1);
        let leadHand = null;
        let supportHand = null;

        const lerp = (a, b, t) => a + (b - a) * t;
        const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
        const easeInOutCubic = (t) => {
            const x = clamp01(t);
            return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        };
        const easeOutExpo = (t) => {
            const x = clamp01(t);
            return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
        };
        const sampleTimeline = (phase, points) => {
            if (!points || points.length === 0) return 0;
            if (phase <= points[0].t) return points[0].v;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                if (phase <= b.t) {
                    const span = Math.max(0.0001, b.t - a.t);
                    const local = clamp01((phase - a.t) / span);
                    const easeName = b.ease || 'inOutCubic';
                    const eased = easeName === 'outExpo'
                        ? easeOutExpo(local)
                        : (easeName === 'outCubic' ? easeOutCubic(local) : easeInOutCubic(local));
                    return lerp(a.v, b.v, eased);
                }
            }
            return points[points.length - 1].v;
        };
        const buildKataPose = (phase, profile = 'samurai') => {
            const templates = {
                samurai: {
                    angle: [
                        // 上段構え -> 振り下ろし
                        { t: 0.0, v: -1.04 },
                        { t: 0.22, v: -2.24, ease: 'outCubic' },
                        { t: 0.56, v: 0.86, ease: 'outExpo' },
                        { t: 0.82, v: 0.18, ease: 'inOutCubic' },
                        { t: 1.0, v: -0.94, ease: 'outCubic' }
                    ],
                    reach: [
                        { t: 0.0, v: 0.8 },
                        { t: 0.22, v: 0.74, ease: 'outCubic' },
                        { t: 0.56, v: 1.2, ease: 'outExpo' },
                        { t: 0.82, v: 1.03, ease: 'inOutCubic' },
                        { t: 1.0, v: 0.86, ease: 'outCubic' }
                    ],
                    bodyDrive: [
                        { t: 0.0, v: 0.0 },
                        { t: 0.22, v: -0.14, ease: 'outCubic' },
                        { t: 0.56, v: 0.52, ease: 'outExpo' },
                        { t: 1.0, v: 0.12, ease: 'outCubic' }
                    ],
                    bodyLift: [
                        { t: 0.0, v: 0.0 },
                        { t: 0.22, v: -0.11, ease: 'outCubic' },
                        { t: 0.56, v: 0.1, ease: 'outExpo' },
                        { t: 1.0, v: 0.03, ease: 'outCubic' }
                    ]
                },
                heavy: {
                    angle: [
                        // 下段構え -> 振り上げ
                        { t: 0.0, v: 0.66 },
                        { t: 0.34, v: 1.94, ease: 'outCubic' },
                        { t: 0.72, v: -0.82, ease: 'outExpo' },
                        { t: 0.9, v: -0.16, ease: 'inOutCubic' },
                        { t: 1.0, v: 0.54, ease: 'outCubic' }
                    ],
                    reach: [
                        { t: 0.0, v: 0.84 },
                        { t: 0.34, v: 0.76, ease: 'outCubic' },
                        { t: 0.72, v: 1.26, ease: 'outExpo' },
                        { t: 0.9, v: 1.06, ease: 'inOutCubic' },
                        { t: 1.0, v: 0.88, ease: 'outCubic' }
                    ],
                    bodyDrive: [
                        { t: 0.0, v: 0.0 },
                        { t: 0.34, v: -0.18, ease: 'outCubic' },
                        { t: 0.72, v: 0.48, ease: 'outExpo' },
                        { t: 1.0, v: 0.14, ease: 'outCubic' }
                    ],
                    bodyLift: [
                        { t: 0.0, v: 0.0 },
                        { t: 0.34, v: 0.05, ease: 'outCubic' },
                        { t: 0.72, v: -0.14, ease: 'outExpo' },
                        { t: 1.0, v: 0.02, ease: 'outCubic' }
                    ]
                },
                odachi: {
                    angle: [
                        { t: 0.0, v: -0.22 },
                        { t: 0.34, v: -2.18, ease: 'outCubic' },
                        { t: 0.72, v: 1.08, ease: 'outExpo' },
                        { t: 0.88, v: 0.38, ease: 'inOutCubic' },
                        { t: 1.0, v: -0.2, ease: 'outCubic' }
                    ],
                    reach: [
                        { t: 0.0, v: 0.94 },
                        { t: 0.34, v: 0.82, ease: 'outCubic' },
                        { t: 0.72, v: 1.3, ease: 'outExpo' },
                        { t: 0.88, v: 1.12, ease: 'inOutCubic' },
                        { t: 1.0, v: 0.96, ease: 'outCubic' }
                    ],
                    bodyDrive: [
                        { t: 0.0, v: 0.0 },
                        { t: 0.34, v: -0.16, ease: 'outCubic' },
                        { t: 0.72, v: 0.62, ease: 'outExpo' },
                        { t: 1.0, v: 0.24, ease: 'outCubic' }
                    ],
                    bodyLift: [
                        { t: 0.0, v: 0.0 },
                        { t: 0.34, v: -0.08, ease: 'outCubic' },
                        { t: 0.72, v: 0.19, ease: 'outExpo' },
                        { t: 1.0, v: 0.07, ease: 'outCubic' }
                    ]
                }
            };
            const tpl = templates[profile] || templates.samurai;
            return {
                rawAngle: sampleTimeline(phase, tpl.angle),
                reachScale: sampleTimeline(phase, tpl.reach),
                bodyDrive: sampleTimeline(phase, tpl.bodyDrive),
                bodyLift: sampleTimeline(phase, tpl.bodyLift)
            };
        };
        const drawKatanaSlash = (pivotX, pivotY, slash = {}) => {
            if (!this.isAttacking) return;
            const alpha = Number.isFinite(slash.alpha) ? slash.alpha : (0.3 + swing * 0.34);
            if (alpha <= 0.01) return;
            const bladeAngle = Number.isFinite(slash.bladeAngle) ? slash.bladeAngle : 0;
            const radiusScale = Number.isFinite(slash.radiusScale) ? slash.radiusScale : 1;
            const fixedRadius = Number.isFinite(slash.radius) ? slash.radius : null;
            const arcBack = Number.isFinite(slash.arcBack) ? slash.arcBack : 1.0;
            const arcFront = Number.isFinite(slash.arcFront) ? slash.arcFront : 0.58;
            const widthScale = Number.isFinite(slash.widthScale) ? slash.widthScale : 1;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const arcRadius = fixedRadius !== null
                ? fixedRadius
                : (this.width * (0.95 + swing * 0.42) * radiusScale);
            const arcStart = bladeAngle - dir * arcBack;
            const arcEnd = bladeAngle + dir * arcFront;
            ctx.strokeStyle = `rgba(255, 188, 158, ${alpha})`;
            ctx.lineWidth = Math.max(4, this.width * 0.14) * widthScale;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(pivotX, pivotY, arcRadius, arcStart, arcEnd, dir < 0);
            ctx.stroke();
            ctx.restore();
        };

        if (weaponMode === 'spear') {
            const spearIdleOsc = Math.sin(this.motionTime * 0.011) * 0.08;
            const thrustCore = this.isAttacking ? clamp01((attackProgress - 0.08) / 0.54) : 0;
            const thrustRecover = this.isAttacking ? clamp01((attackProgress - 0.7) / 0.3) : 0;
            const thrust = Math.max(0, thrustCore - thrustRecover * 0.46);
            const forwardReach = this.width * (0.34 + thrust * 1.02 + spearIdleOsc * 0.22);
            const leadTargetX = shoulderFrontX + dir * forwardReach;
            const leadTargetY = shoulderFrontY + this.height * (0.18 - thrust * 0.08 - spearIdleOsc * 0.06);
            const supportTargetX = shoulderBackX + dir * (this.width * (0.14 + thrust * 0.52 + spearIdleOsc * 0.16));
            const supportTargetY = shoulderBackY + this.height * (0.17 - thrust * 0.02);
            supportHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderBackX,
                shoulderY: shoulderBackY,
                handX: supportTargetX,
                handY: supportTargetY,
                upperLen: upperLen * 0.95,
                foreLen: foreLen * 0.9,
                bendSign: dir * 0.92,
                upperWidth: Math.max(3.8, this.width * 0.11),
                foreWidth: Math.max(3.3, this.width * 0.095),
                jointRadius: Math.max(2.4, this.width * 0.07),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            leadHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderFrontX,
                shoulderY: shoulderFrontY,
                handX: leadTargetX,
                handY: leadTargetY,
                upperLen: upperLen,
                foreLen: foreLen * 1.06,
                bendSign: -dir * 0.84,
                upperWidth: Math.max(4.4, this.width * 0.12),
                foreWidth: Math.max(3.9, this.width * 0.11),
                jointRadius: Math.max(2.6, this.width * 0.075),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            const spearEndX = leadHand.handX + dir * (this.width * (1.26 + thrust * 1.44 + spearIdleOsc * 0.25) * weaponScale);
            const spearEndY = leadHand.handY - this.height * (0.09 - thrust * 0.02);
            this.drawDetailedSpear(ctx, {
                shaftStartX: supportHand.handX - dir * (this.width * 0.06),
                shaftStartY: supportHand.handY + this.height * 0.01,
                shaftEndX: spearEndX,
                shaftEndY: spearEndY,
                tipLen: Math.max(12, this.width * 0.42),
                tipWidth: Math.max(6, this.width * 0.2),
                tasselSwing: Math.sin(this.motionTime * 0.02) * 2.2 + thrust * 4,
                showTassel: true
            });
        } else if (weaponMode === 'bomb') {
            const raise = this.isAttacking ? attackProgress : 0;
            const bombTargetX = shoulderFrontX + dir * (this.width * (0.32 + raise * 0.42));
            const bombTargetY = shoulderFrontY + this.height * (0.12 - raise * 0.36);
            leadHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderFrontX,
                shoulderY: shoulderFrontY,
                handX: bombTargetX,
                handY: bombTargetY,
                upperLen,
                foreLen,
                bendSign: -dir * 0.78,
                upperWidth: Math.max(4.5, this.width * 0.12),
                foreWidth: Math.max(3.9, this.width * 0.11),
                jointRadius: Math.max(2.8, this.width * 0.078),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            supportHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderBackX,
                shoulderY: shoulderBackY,
                handX: shoulderBackX + dir * this.width * 0.12,
                handY: shoulderBackY + this.height * 0.17,
                upperLen: upperLen * 0.92,
                foreLen: foreLen * 0.88,
                bendSign: dir * 0.84,
                upperWidth: Math.max(4, this.width * 0.108),
                foreWidth: Math.max(3.5, this.width * 0.094),
                jointRadius: Math.max(2.5, this.width * 0.072),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            const bombX = leadHand.handX + dir * this.width * 0.16;
            const bombY = leadHand.handY - this.height * 0.1;
            const bombR = Math.max(6, this.width * 0.16);
            const bombGrad = ctx.createRadialGradient(bombX - bombR * 0.3, bombY - bombR * 0.3, bombR * 0.2, bombX, bombY, bombR);
            bombGrad.addColorStop(0, '#787878');
            bombGrad.addColorStop(0.45, '#343434');
            bombGrad.addColorStop(1, '#111');
            ctx.fillStyle = bombGrad;
            ctx.beginPath();
            ctx.arc(bombX, bombY, bombR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.strokeStyle = '#9a6f36';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(bombX, bombY - bombR);
            ctx.lineTo(bombX + dir * bombR * 0.6, bombY - bombR * 1.72);
            ctx.stroke();
        } else if (weaponMode === 'dual') {
            const dualPhase = this.isAttacking ? attackProgress : 0;
            const rightRaw = this.isAttacking
                ? sampleTimeline(dualPhase, [
                    { t: 0.0, v: -0.92 },
                    { t: 0.24, v: -1.92, ease: 'outCubic' },
                    { t: 0.52, v: 1.02, ease: 'outExpo' },
                    { t: 0.72, v: 0.22, ease: 'inOutCubic' },
                    { t: 1.0, v: -0.58, ease: 'outCubic' }
                ])
                : (-0.78 + Math.sin(this.motionTime * 0.008) * 0.08);
            const leftRaw = this.isAttacking
                ? sampleTimeline(dualPhase, [
                    { t: 0.0, v: -1.1 },
                    { t: 0.46, v: -0.86, ease: 'inOutCubic' },
                    { t: 0.68, v: -2.02, ease: 'outCubic' },
                    { t: 0.9, v: 0.96, ease: 'outExpo' },
                    { t: 1.0, v: -0.42, ease: 'outCubic' }
                ])
                : (-1.08 + Math.sin(this.motionTime * 0.007 + 1.2) * 0.05);
            const rightAngle = dir === 1 ? rightRaw : Math.PI - rightRaw;
            const leftAngle = dir === 1 ? leftRaw : Math.PI - leftRaw;
            const rightReach = this.width * (this.isAttacking ? sampleTimeline(dualPhase, [
                { t: 0.0, v: 0.52 },
                { t: 0.24, v: 0.45, ease: 'outCubic' },
                { t: 0.52, v: 0.66, ease: 'outExpo' },
                { t: 1.0, v: 0.56, ease: 'outCubic' }
            ]) : 0.58);
            const leftReach = this.width * (this.isAttacking ? sampleTimeline(dualPhase, [
                { t: 0.0, v: 0.48 },
                { t: 0.68, v: 0.43, ease: 'inOutCubic' },
                { t: 0.9, v: 0.64, ease: 'outExpo' },
                { t: 1.0, v: 0.54, ease: 'outCubic' }
            ]) : 0.54);
            const rightTargetX = shoulderFrontX + Math.cos(rightAngle) * rightReach;
            const rightTargetY = shoulderFrontY + Math.sin(rightAngle) * rightReach;
            const leftTargetX = shoulderBackX + Math.cos(leftAngle) * leftReach;
            const leftTargetY = shoulderBackY + Math.sin(leftAngle) * leftReach;
            leadHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderFrontX,
                shoulderY: shoulderFrontY,
                handX: rightTargetX,
                handY: rightTargetY,
                upperLen,
                foreLen,
                bendSign: -dir * 0.82,
                upperWidth: Math.max(4.6, this.width * 0.12),
                foreWidth: Math.max(4.0, this.width * 0.108),
                jointRadius: Math.max(2.8, this.width * 0.078),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            supportHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderBackX,
                shoulderY: shoulderBackY,
                handX: leftTargetX,
                handY: leftTargetY,
                upperLen: upperLen * 0.95,
                foreLen: foreLen * 0.95,
                bendSign: dir * 0.9,
                upperWidth: Math.max(4.2, this.width * 0.108),
                foreWidth: Math.max(3.7, this.width * 0.1),
                jointRadius: Math.max(2.6, this.width * 0.074),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            this.drawDetailedKatana(ctx, {
                handX: leadHand.handX,
                handY: leadHand.handY,
                angle: rightAngle + dir * 0.08,
                length: Math.max(38, this.width * 1.42 * weaponScale),
                gripLen: Math.max(8, this.width * 0.24),
                bladeWidth: Math.max(2.2, this.width * 0.06),
                guardSize: Math.max(2, this.width * 0.06),
                profileFlipY: bladeProfileFlipY
            });
            this.drawDetailedKatana(ctx, {
                handX: supportHand.handX,
                handY: supportHand.handY,
                angle: leftAngle + dir * 0.06,
                length: Math.max(36, this.width * 1.3 * weaponScale),
                gripLen: Math.max(7, this.width * 0.22),
                bladeWidth: Math.max(2.1, this.width * 0.055),
                guardSize: Math.max(1.9, this.width * 0.055),
                profileFlipY: bladeProfileFlipY
            });
            const rightSlashAlpha = this.isAttacking ? Math.max(0, Math.sin(clamp01((dualPhase - 0.22) / 0.42) * Math.PI)) * 0.62 : 0;
            const leftSlashAlpha = this.isAttacking ? Math.max(0, Math.sin(clamp01((dualPhase - 0.58) / 0.34) * Math.PI)) * 0.54 : 0;
            drawKatanaSlash(shoulderCenterX + dir * this.width * 0.1, shoulderY, {
                bladeAngle: rightAngle,
                alpha: rightSlashAlpha,
                radiusScale: 1.05,
                arcBack: 1.08,
                arcFront: 0.52,
                widthScale: 1.04
            });
            drawKatanaSlash(shoulderCenterX - dir * this.width * 0.04, shoulderY + this.height * 0.02, {
                bladeAngle: leftAngle,
                alpha: leftSlashAlpha,
                radiusScale: 0.96,
                arcBack: 1.0,
                arcFront: 0.48,
                widthScale: 0.94
            });
        } else if (weaponMode === 'kusa') {
            const armRaw = this.isAttacking ? (-1.06 + windup * 0.35 + swing * 2.0) : (-0.56 + Math.sin(this.motionTime * 0.01) * 0.08);
            const armAngle = dir === 1 ? armRaw : Math.PI - armRaw;
            const targetX = shoulderFrontX + Math.cos(armAngle) * this.width * 0.58;
            const targetY = shoulderFrontY + Math.sin(armAngle) * this.width * 0.58;
            leadHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderFrontX,
                shoulderY: shoulderFrontY,
                handX: targetX,
                handY: targetY,
                upperLen,
                foreLen,
                bendSign: -dir * 0.82,
                upperWidth: Math.max(4.6, this.width * 0.12),
                foreWidth: Math.max(4.0, this.width * 0.108),
                jointRadius: Math.max(2.8, this.width * 0.078),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            supportHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderBackX,
                shoulderY: shoulderBackY,
                handX: shoulderBackX + dir * this.width * 0.16,
                handY: shoulderBackY + this.height * 0.17,
                upperLen: upperLen * 0.9,
                foreLen: foreLen * 0.86,
                bendSign: dir * 0.86,
                upperWidth: Math.max(4.0, this.width * 0.108),
                foreWidth: Math.max(3.5, this.width * 0.094),
                jointRadius: Math.max(2.5, this.width * 0.072),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            const kamaAngle = armAngle + dir * 0.12;
            this.drawDetailedKatana(ctx, {
                handX: leadHand.handX,
                handY: leadHand.handY,
                angle: kamaAngle,
                length: Math.max(25, this.width * 0.82 * weaponScale),
                gripLen: Math.max(6, this.width * 0.18),
                bladeWidth: Math.max(2, this.width * 0.052),
                guardSize: Math.max(1.8, this.width * 0.05),
                profileFlipY: bladeProfileFlipY
            });
            const chainLen = this.width * (0.7 + swing * 1.05);
            const ballX = leadHand.handX + Math.cos(kamaAngle) * chainLen;
            const ballY = leadHand.handY + Math.sin(kamaAngle) * chainLen;
            ctx.strokeStyle = '#919ba8';
            ctx.lineWidth = Math.max(2, this.width * 0.055);
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(leadHand.handX, leadHand.handY);
            ctx.lineTo(ballX, ballY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#b8c0cb';
            ctx.beginPath();
            ctx.arc(ballX, ballY, Math.max(5, this.width * 0.14), 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponMode === 'ninja') {
            const throwRaw = this.isAttacking ? (-1.2 + attackProgress * 2.08) : (-0.62 + Math.sin(this.motionTime * 0.01) * 0.06);
            const throwAngle = dir === 1 ? throwRaw : Math.PI - throwRaw;
            leadHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderFrontX,
                shoulderY: shoulderFrontY,
                handX: shoulderFrontX + Math.cos(throwAngle) * this.width * 0.52,
                handY: shoulderFrontY + Math.sin(throwAngle) * this.width * 0.52,
                upperLen: upperLen * 0.92,
                foreLen: foreLen * 0.94,
                bendSign: -dir * 0.86,
                upperWidth: Math.max(4.2, this.width * 0.11),
                foreWidth: Math.max(3.6, this.width * 0.095),
                jointRadius: Math.max(2.4, this.width * 0.07),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            supportHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderBackX,
                shoulderY: shoulderBackY,
                handX: shoulderBackX + dir * this.width * 0.12,
                handY: shoulderBackY + this.height * 0.21,
                upperLen: upperLen * 0.88,
                foreLen: foreLen * 0.9,
                bendSign: dir * 0.9,
                upperWidth: Math.max(3.9, this.width * 0.104),
                foreWidth: Math.max(3.4, this.width * 0.09),
                jointRadius: Math.max(2.3, this.width * 0.068),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });

            // 忍者は主攻撃を投擲に統一し、刀は持たせない
            const throwHandX = leadHand.handX;
            const throwHandY = leadHand.handY;
            const starR = Math.max(4, this.width * 0.11);
            const starSpin = this.motionTime * 0.02 + (this.isAttacking ? attackProgress * 6.8 : 0);
            ctx.save();
            ctx.translate(throwHandX, throwHandY);
            ctx.rotate(starSpin);
            ctx.fillStyle = '#bcc8d8';
            ctx.strokeStyle = '#758196';
            ctx.lineWidth = 1.0;
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, -starR);
                ctx.lineTo(starR * 0.34, -starR * 0.25);
                ctx.lineTo(0, starR * 0.34);
                ctx.lineTo(-starR * 0.34, -starR * 0.25);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.fillStyle = '#15171c';
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(1.6, starR * 0.26), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else {
            const isHeavy = weaponMode === 'heavy' || weaponMode === 'odachi';
            const heavyFactor = isHeavy ? 1.25 : 1;
            const kataProfile = weaponMode === 'odachi' ? 'odachi' : (isHeavy ? 'heavy' : 'samurai');
            const idlePoseByProfile = {
                samurai: { rawAngle: -0.98, reachScale: 0.82, bodyDrive: -0.08, bodyLift: -0.08 },
                heavy: { rawAngle: 0.62, reachScale: 0.84, bodyDrive: -0.1, bodyLift: 0.04 },
                odachi: { rawAngle: 0.5, reachScale: 0.96, bodyDrive: -0.1, bodyLift: -0.04 }
            };
            const idleBase = idlePoseByProfile[kataProfile] || idlePoseByProfile.samurai;
            const idleKataPose = {
                rawAngle: idleBase.rawAngle + Math.sin(this.motionTime * 0.0078) * 0.045,
                reachScale: idleBase.reachScale,
                bodyDrive: idleBase.bodyDrive,
                bodyLift: idleBase.bodyLift
            };
            const kataPose = this.isAttacking
                ? buildKataPose(attackProgress, kataProfile)
                : idleKataPose;
            const raw = kataPose.rawAngle;
            const bladeAngle = dir === 1 ? raw : Math.PI - raw;
            const reachBase = this.width * (0.56 + (isHeavy ? 0.08 : 0));
            const reach = reachBase * kataPose.reachScale;
            const driveX = dir * this.width * kataPose.bodyDrive * 0.34;
            const driveY = -this.height * kataPose.bodyLift * 0.2;
            const idleGuardForward = this.isAttacking
                ? 0
                : this.width * (kataProfile === 'odachi' ? 0.06 : (isHeavy ? 0.09 : 0.13));
            const idleGuardDown = this.isAttacking
                ? 0
                : this.height * (kataProfile === 'odachi' ? 0.14 : (isHeavy ? 0.11 : 0.12));
            const leadTargetX = shoulderFrontX + driveX + Math.cos(bladeAngle) * reach + dir * idleGuardForward;
            const leadTargetY = shoulderFrontY + driveY + Math.sin(bladeAngle) * reach + idleGuardDown;
            leadHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderFrontX,
                shoulderY: shoulderFrontY,
                handX: leadTargetX,
                handY: leadTargetY,
                upperLen: upperLen * heavyFactor,
                foreLen: foreLen * heavyFactor,
                bendSign: -dir * 0.8,
                upperWidth: Math.max(4.5, this.width * 0.12),
                foreWidth: Math.max(3.9, this.width * 0.108),
                jointRadius: Math.max(2.7, this.width * 0.076),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });
            const weaponAngle = this.isAttacking
                ? bladeAngle + dir * 0.08
                : bladeAngle - dir * (kataProfile === 'odachi' ? 0.08 : 0.05);
            const weaponDirX = Math.cos(weaponAngle);
            const weaponDirY = Math.sin(weaponAngle);
            const gripSpacing = this.width * (kataProfile === 'odachi' ? 0.36 : (isHeavy ? 0.3 : 0.24));
            const supportTargetX = leadHand.handX - weaponDirX * gripSpacing - weaponDirY * 1.2;
            const supportTargetY = leadHand.handY - weaponDirY * gripSpacing + weaponDirX * 1.2;
            supportHand = this.drawJointedArm(ctx, {
                shoulderX: shoulderBackX,
                shoulderY: shoulderBackY,
                handX: supportTargetX,
                handY: supportTargetY,
                upperLen: upperLen * (isHeavy ? 1.02 : 0.92),
                foreLen: foreLen * (isHeavy ? 1.06 : 0.92),
                bendSign: dir * 0.88,
                upperWidth: Math.max(4.1, this.width * 0.108),
                foreWidth: Math.max(3.5, this.width * 0.096),
                jointRadius: Math.max(2.5, this.width * 0.072),
                baseColor: palette.torsoCore,
                handColor: palette.legFront
            });

            const heavyBladeLengthScale = Number.isFinite(config.heavyBladeLengthScale) ? config.heavyBladeLengthScale : 1;
            const heavyGripScale = Number.isFinite(config.heavyGripScale) ? config.heavyGripScale : 1;
            const slashPivotXOffset = Number.isFinite(config.slashPivotXOffset) ? config.slashPivotXOffset : 0;
            const slashPivotYOffset = Number.isFinite(config.slashPivotYOffset) ? config.slashPivotYOffset : 0;
            const slashWidthScale = Number.isFinite(config.slashWidthScale) ? config.slashWidthScale : 1;
            let drawnWeaponAngle = weaponAngle;
            let slashBladeAngle = weaponAngle;
            let slashRadius = Math.max(24, this.width * 0.98);
            if (isHeavy) {
                const heavyLen = Math.max(56, this.width * (1.56 + (weaponMode === 'odachi' ? 0.5 : 0.22)) * weaponScale) * heavyBladeLengthScale;
                if (config.preventGroundPenetration) {
                    const groundLimitY = footY - 1.2;
                    const probeTipY = leadHand.handY + Math.sin(drawnWeaponAngle) * (heavyLen + 5.5);
                    if (probeTipY > groundLimitY) {
                        const penetration = probeTipY - groundLimitY;
                        // 刀身が地面へ刺さらないよう角度を引き上げる（見た目のみ補正）
                        const liftAngle = Math.min(0.62, penetration / Math.max(22, heavyLen * 0.62));
                        drawnWeaponAngle -= liftAngle;
                    }
                }
                this.drawDetailedHeavyBlade(ctx, {
                    handX: leadHand.handX,
                    handY: leadHand.handY,
                    angle: drawnWeaponAngle,
                    length: heavyLen,
                    gripLen: Math.max(11, this.width * (weaponMode === 'odachi' ? 0.34 : 0.3)) * heavyGripScale,
                    profileFlipY: bladeProfileFlipY
                });
                slashBladeAngle = drawnWeaponAngle;
                slashRadius = Math.max(36, heavyLen + 2.8);
            } else {
                const katanaLen = Math.max(40, this.width * 1.38 * weaponScale);
                this.drawDetailedKatana(ctx, {
                    handX: leadHand.handX,
                    handY: leadHand.handY,
                    angle: weaponAngle,
                    length: katanaLen,
                    gripLen: Math.max(9, this.width * 0.27),
                    bladeWidth: Math.max(2.0, this.width * 0.052),
                    guardSize: Math.max(2, this.width * 0.058),
                    profileFlipY: bladeProfileFlipY
                });
                slashRadius = Math.max(28, katanaLen + 3.8);
            }
            const slashPhase = isHeavy
                ? clamp01((attackProgress - (weaponMode === 'odachi' ? 0.34 : 0.36)) / (weaponMode === 'odachi' ? 0.46 : 0.42))
                : clamp01((attackProgress - 0.28) / 0.38);
            const slashAlpha = this.isAttacking ? Math.max(0, Math.sin(slashPhase * Math.PI)) * (isHeavy ? 0.72 : 0.62) : 0;
            drawKatanaSlash(leadHand.handX + dir * slashPivotXOffset, leadHand.handY + slashPivotYOffset, {
                bladeAngle: slashBladeAngle,
                alpha: slashAlpha,
                radiusScale: weaponMode === 'odachi' ? 1.28 : (isHeavy ? 1.18 : 1.0),
                arcBack: weaponMode === 'odachi' ? 1.3 : (isHeavy ? 1.2 : 1.04),
                arcFront: weaponMode === 'odachi' ? 0.68 : (isHeavy ? 0.62 : 0.54),
                radius: slashRadius,
                widthScale: (isHeavy ? 1.24 : 1.02) * slashWidthScale
            });
        }

        if (supportHand) {
            ctx.fillStyle = palette.legFront;
            ctx.beginPath();
            ctx.arc(supportHand.handX, supportHand.handY, Math.max(3.2, this.width * 0.09), 0, Math.PI * 2);
            ctx.fill();
        }
        if (leadHand) {
            ctx.fillStyle = palette.legFront;
            ctx.beginPath();
            ctx.arc(leadHand.handX, leadHand.handY, Math.max(3.4, this.width * 0.095), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    applyDesiredVx(targetVx, responsiveness = 0.22) {
        const speedScale = this.slowTimer > 0 ? Math.max(0.35, Math.min(1, this.slowMultiplier || 1)) : 1;
        const scaledTargetVx = targetVx * speedScale;
        const blend = Math.max(0, Math.min(1, responsiveness));
        this.vx += (scaledTargetVx - this.vx) * blend;
        if (Math.abs(scaledTargetVx) < 0.05 && Math.abs(this.vx) < 0.05) {
            this.vx = 0;
        }
    }
    
    updateAI(deltaTime, player) {
        const distanceToPlayer = this.getDistanceToPlayer(player);
        const horizontalDistance = this.getHorizontalDistanceToPlayer(player);
        const playerDirection = player.x > this.x ? 1 : -1;
        const canStartAttack = this.attackCooldown <= 0;
        const inAttackRange = this.isPlayerInAttackRange(player);
        let desiredVX = this.vx;
        
        this.stateTimer += deltaTime * 1000;
        
        // 画面外（右側）にいる場合、索敵範囲に関わらずプレイヤー（左）に向かって進む
        const scrollX = window.game ? window.game.scrollX : 0;
        const screenRight = scrollX + CANVAS_WIDTH;
        if (this.x > screenRight - 20) { // 画面端付近でも追跡開始
            this.state = 'chase';
            desiredVX = -this.speed;
            this.facingRight = false;
            this.applyDesiredVx(desiredVX, 0.4);
            return;
        }

        // 攻撃中または攻撃クールダウン中は移動しない
        if (this.isAttacking || this.attackCooldown > 0) {
            desiredVX = 0;
            this.facingRight = playerDirection > 0;
            this.applyDesiredVx(desiredVX, 0.4);
            return;
        }

        switch (this.state) {
            case 'idle':
                // 待機中でもじわりと前進して、障害物手前で滞留しないようにする
                desiredVX = this.speed * 0.32 * playerDirection;
                this.facingRight = playerDirection > 0;
                if (distanceToPlayer < this.detectionRange) {
                    this.state = 'chase';
                    this.stateTimer = 0;
                } else if (this.stateTimer > 2000) {
                    this.state = 'patrol';
                    this.stateTimer = 0;
                }
                break;
                
            case 'patrol':
                desiredVX = this.speed * 0.5 * this.patrolDirection;
                this.facingRight = this.patrolDirection > 0;
                
                // 画面端で反転
                if (this.x <= 50 || this.x + this.width >= CANVAS_WIDTH - 50) {
                    this.patrolDirection *= -1;
                }
                
                if (this.stateTimer > 3000) {
                    this.patrolDirection *= -1;
                    this.stateTimer = 0;
                }
                
                if (distanceToPlayer < this.detectionRange) {
                    this.state = 'chase';
                    this.stateTimer = 0;
                }
                break;
                
            case 'chase':
                this.facingRight = playerDirection > 0;
                
                // 攻撃範囲内に入ったら停止して攻撃準備
                const inAttackRangeLoose = this.isPlayerInAttackRange(player, 1.18);
                if (canStartAttack && inAttackRangeLoose) {
                    desiredVX = 0;
                    this.startAttack();
                    this.state = 'chase';
                    this.stateTimer = 0;
                } else {
                    // まだ遠いので追いかける
                    desiredVX = this.speed * playerDirection;
                }
                
                // 見失ったら idle に戻る
                if (distanceToPlayer > this.detectionRange * 1.5) {
                    this.state = 'idle';
                    this.stateTimer = 0;
                }
                break;
                
            case 'attack':
                desiredVX = 0;
                this.facingRight = playerDirection > 0;
                
                // 予備動作（少し溜め）後に攻撃
                if (this.stateTimer > this.attackWindupMs && canStartAttack && this.isPlayerInAttackRange(player, 1.12)) {
                    this.startAttack();
                    this.state = 'chase';
                    this.stateTimer = 0;
                }
                
                // プレイヤーが離れたら追いかける
                if (!inAttackRange && horizontalDistance > this.attackRange * 1.5) {
                    this.state = 'chase';
                    this.stateTimer = 0;
                }
                break;
        }

        // 障害物回避AI（岩/スパイク両対応）
        if (this.isGrounded) {
            const checkDist = 64;
            const obstacles = window.game ? window.game.stage.obstacles : [];
            const moveIntent = Math.abs(desiredVX) > 0.08 ? desiredVX : this.vx;
            const dir = moveIntent > 0 ? 1 : (moveIntent < 0 ? -1 : playerDirection);
            const nextLeft = this.x + dir * checkDist;
            const nextRight = this.x + this.width + dir * checkDist;
            const feetY = this.y + this.height;

            for (const obs of obstacles) {
                if (obs.isDestroyed) continue;
                if (obs.type !== 'rock' && obs.type !== 'spike') continue;

                const obsLeft = obs.x - 10;
                const obsRight = obs.x + obs.width + 10;
                const intersectsForward =
                    nextRight > obsLeft &&
                    nextLeft < obsRight;
                if (!intersectsForward) continue;

                // 足元付近の障害物のみを対象にする
                if (obs.y > feetY + 18 || obs.y + obs.height < this.y + this.height * 0.45) continue;

                this.jump(-13, 460);
                break;
            }
        }

        // 共通：時々ジャンプして回避
        if (distanceToPlayer < 200) {
            this.tryJump(0.005, -22, 700);
        }

        this.applyDesiredVx(desiredVX);
    }
    
    tryJump(chance, power = -22, cooldown = 700) {
        if (this.isGrounded && this.jumpCooldown <= 0 && Math.random() < chance) {
            let actualPower = power;
            
            // プレイヤーの位置をチェックしてジャンプ力を調整
            if (window.game && window.game.player) {
                const player = window.game.player;
                // 自分より 50px 以上高い位置にプレイヤーがいないなら、ジャンプ力を抑える
                const isPlayerHigh = player.y < (this.y - 50);
                if (!isPlayerHigh) {
                    // 最低限のジャンプ（障害物回避と同等かそれ以下）
                    actualPower = Math.max(actualPower, -13); 
                }
            }
            
            this.jump(actualPower, cooldown);
            return true;
        }
        return false;
    }

    jump(power = -13, cooldown = 700) {
        if (this.isGrounded) {
            this.vy = power;
            this.isGrounded = false;
            this.jumpCooldown = cooldown;
        }
    }
    
    getDistanceToPlayer(player) {
        const dx = (player.x + player.width / 2) - (this.x + this.width / 2);
        const dy = (player.y + player.height / 2) - (this.y + this.height / 2);
        return Math.sqrt(dx * dx + dy * dy);
    }

    getHorizontalDistanceToPlayer(player) {
        return Math.abs((player.x + player.width / 2) - (this.x + this.width / 2));
    }

    getVerticalDistanceToPlayer(player) {
        return Math.abs((player.y + player.height / 2) - (this.y + this.height / 2));
    }

    isPlayerInAttackRange(player, rangeMultiplier = 1) {
        const horizontalDistance = this.getHorizontalDistanceToPlayer(player);
        const verticalDistance = this.getVerticalDistanceToPlayer(player);
        const effectiveRange = this.attackRange * Math.max(0.2, rangeMultiplier);
        const horizontalReach = effectiveRange + (this.width + player.width) * 0.24;
        const verticalReach = Math.max(34, (this.height + player.height) * 0.5);
        return horizontalDistance <= horizontalReach && verticalDistance <= verticalReach;
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackTimer = 300;
        this.playAttackSfx();
    }

    playAttackSfx() {
        switch (this.type) {
            case ENEMY_TYPES.ASHIGARU:
                audio.playSpear();
                break;
            case ENEMY_TYPES.BUSHO:
                audio.playSlash(3);
                break;
            case ENEMY_TYPES.NINJA:
                audio.playShuriken();
                break;
            default:
                audio.playSlash(1);
                break;
        }
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.attackCooldown = 1000;
        }
    }
    
    applyPhysics(obstacles = []) {
        // 重力
        if (!this.isGrounded) {
            this.vy += GRAVITY;
        }
        
        // 接地判定の初期化（前フレームの状態をリセット）
        // ただし、位置更新前にリセットすると即座に重力がかかるため、
        // 判定処理の中で適切に更新する。
        this.isGrounded = false;
        
        // 位置更新
        this.oldX = this.x;
        this.oldY = this.y;
        this.x += this.vx;
        this.y += this.vy;
        
        // 障害物との当たり判定（進入防止）
        for (const obs of obstacles) {
            if (this.intersects(obs)) {
                // 縦方向の補正（乗る判定を優先）
                if (this.vy >= 0 && this.oldY + this.height <= obs.y + 10) {
                    this.y = obs.y - this.height;
                    this.vy = 0;
                    this.isGrounded = true;
                } else if (this.vy < 0 && this.oldY >= obs.y + obs.height - 10) {
                    this.y = obs.y + obs.height;
                    this.vy = 0;
                } else {
                    // 横方向の補正
                    if (this.vx > 0 && this.oldX + this.width <= obs.x + 5) {
                        this.x = obs.x - this.width;
                        this.vx = 0;
                    } else if (this.vx < 0 && this.oldX >= obs.x + obs.width - 5) {
                        this.x = obs.x + obs.width;
                        this.vx = 0;
                    }
                }
            }
        }
        
        // 地面判定
        if (this.y + this.height >= this.groundY) {
            this.y = this.groundY - this.height;
            this.vy = 0;
            this.isGrounded = true;
        }
        
        // 画面端制限は削除（ワールド座標で自由に動く）
    }

    intersects(rect) {
        return this.x < rect.x + rect.width &&
               this.x + this.width > rect.x &&
               this.y < rect.y + rect.height &&
               this.y + this.height > rect.y;
    }

    applyPullStopConstraint(player, deltaMs = 0) {
        if (!player || this.pullStopTimer <= 0) return;
        const playerCenterX = player.x + player.width * 0.5;
        const selfCenterX = this.x + this.width * 0.5;
        const dx = selfCenterX - playerCenterX;
        const absDx = Math.abs(dx);
        const stopDistance = Math.max(
            6,
            Number.isFinite(this.pullStopDistance)
                ? this.pullStopDistance
                : (player.width + this.width) * 0.5 + 8
        );
        if (absDx < stopDistance) {
            const dir = dx >= 0 ? 1 : -1;
            const targetCenterX = playerCenterX + dir * stopDistance;
            this.x = targetCenterX - this.width * 0.5;
            if (this.vx * dir < 0) this.vx = 0;
        }
        this.pullStopTimer = Math.max(0, this.pullStopTimer - deltaMs);
    }
    
    // ダメージを受ける
    takeDamage(damage, player, attackData) {
        if (!this.isAlive || this.isDying) return null;
        if (this.invincibleTimer > 0) return null;
        
        this.hp -= damage;
        this.hitTimer = 140; // ヒットエフェクト
        this.invincibleTimer = attackData && attackData.isLaunch ? 120 : 80;

        if (attackData && Number.isFinite(attackData.slowDurationMs) && attackData.slowDurationMs > 0) {
            const nextSlow = Number.isFinite(attackData.slowMultiplier)
                ? Math.max(0.35, Math.min(1, attackData.slowMultiplier))
                : 0.7;
            this.slowMultiplier = Math.min(this.slowMultiplier || 1, nextSlow);
            this.slowTimer = Math.max(this.slowTimer || 0, attackData.slowDurationMs);
        }
        
        // プレイヤーの位置に基づいたノックバック
        if (player) {
            const dir = player.x < this.x ? 1 : -1;
            const knockbackX = (attackData && typeof attackData.knockbackX === 'number') ? attackData.knockbackX : 5;
            const knockbackY = (attackData && typeof attackData.knockbackY === 'number') ? attackData.knockbackY : -3;
            this.vx = dir * knockbackX;
            
            // 打ち上げ（ダッシュ斬りなど）
            if (attackData && attackData.isLaunch) {
                this.vy = Math.min(knockbackY, -12); // 空高く打ち上げる
                this.isGrounded = false;
            } else if (this.isGrounded) {
                this.vy = knockbackY;
                this.isGrounded = false;
            }

            if (attackData && Number.isFinite(attackData.pullTowardPlayerStrength) && attackData.pullTowardPlayerStrength > 0) {
                const playerCenterX = player.x + player.width * 0.5;
                const selfCenterX = this.x + this.width * 0.5;
                const pullDir = playerCenterX >= selfCenterX ? 1 : -1;
                const bossLike = this.maxHp >= 120;
                const pullStrength = attackData.pullTowardPlayerStrength * (bossLike ? 0.55 : 1.0);
                this.vx = pullDir * Math.max(Math.abs(this.vx || 0), pullStrength);
                this.vy = Math.min(this.vy || 0, -2.2);
                this.isGrounded = false;
                this.pullStopDistance = Number.isFinite(attackData.pullStopDistance)
                    ? attackData.pullStopDistance
                    : ((player.width + this.width) * 0.5 + 8);
                this.pullStopTimer = Math.max(
                    this.pullStopTimer || 0,
                    Number.isFinite(attackData.pullStopTimerMs) ? attackData.pullStopTimerMs : 260
                );
            }
        }
        
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDying = true; // 死亡演出開始
            return true;
        }
        return false;
    }
    
    getAttackHitbox() {
        if (!this.isAttacking) return null;
        
        const range = this.attackRange;
        if (this.facingRight) {
            return {
                x: this.x + this.width,
                y: this.y + 10,
                width: range,
                height: this.height - 20
            };
        } else {
            return {
                x: this.x - range,
                y: this.y + 10,
                width: range,
                height: this.height - 20
            };
        }
    }
    
    render(ctx) {
        if (!this.isAlive && !this.isDying) return;
        
        ctx.save();
        
        // 死亡演出中（幽体化）
        if (this.isDying) {
            const progress = this.deathTimer / this.deathDuration;
            ctx.globalAlpha = 0.7 * (1 - progress);
            // 黒い棒人間シルエットは残像感が強いため廃止し、粒子のみ残す
            this.renderAscensionEffect(ctx);
            ctx.restore();
            return;
        }

        // 通常の描画
        if (this.hitTimer > 0) {
            // 被弾時は白寄りに発光
            const hitRatio = Math.max(0, Math.min(1, this.hitTimer / 140));
            const brightness = 150 + hitRatio * 130;
            const saturation = Math.max(30, 100 - hitRatio * 60);
            ctx.filter = `brightness(${brightness}%) saturate(${saturation}%)`;
        }
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 70) % 2 === 0) {
            ctx.globalAlpha *= 0.75;
        }

        // 接地影（全敵共通）
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(
            this.x + this.width / 2,
            this.y + this.height + 2,
            Math.max(8, this.width * 0.32),
            4,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        
        // 2.5Dの奥行き感を共通付与（真横シルエットを避ける）
        {
            const dir = this.facingRight ? 1 : -1;
            const pivotX = this.x + this.width * 0.5;
            const pivotY = this.y + this.height * 0.62;
            const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
            const attackBias = this.isAttacking ? 0.013 : 0;
            const yawSkew = dir * (0.046 + moveBias + attackBias);
            ctx.save();
            ctx.translate(pivotX, pivotY);
            ctx.transform(1, 0, yawSkew, 1, 0, 0);
            ctx.scale(0.982, 1);
            ctx.translate(-pivotX, -pivotY);
            this.renderBody(ctx);
            ctx.restore();
        }

        // 成仏エフェクト：周囲に光の粒子
        if (this.isDying) { // isAlive ではなく isDying で判定
            this.renderAscensionEffect(ctx);
        }
        
        // HPバー
        if (this.isAlive && !this.isDying) { // 死亡演出中はHPバー非表示
            this.renderHpBar(ctx);
        }
        
        // 飛び道具描画
        if (this.projectiles) {
            for (const p of this.projectiles) p.render(ctx);
        }
        
        ctx.restore();
    }
    
    renderBody(ctx) {
        // サブクラスでオーバーライド
        ctx.fillStyle = '#888';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    renderAscensionSilhouette(ctx) {
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const shoulderY = this.y + this.height * 0.42;
        const hipY = this.y + this.height * 0.72;
        const headRadius = Math.max(10, this.width * 0.28);
        const torsoWidth = Math.max(8, this.width * 0.26);
        const legSpread = Math.max(4, this.width * 0.12);

        // 胴体
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = torsoWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(centerX, shoulderY);
        ctx.lineTo(centerX, hipY);
        ctx.stroke();

        // 脚（武器なしの簡易シルエット）
        ctx.lineWidth = Math.max(4, torsoWidth * 0.65);
        ctx.beginPath();
        ctx.moveTo(centerX, hipY);
        ctx.lineTo(centerX - legSpread, footY - 1);
        ctx.moveTo(centerX, hipY);
        ctx.lineTo(centerX + legSpread, footY - 1);
        ctx.stroke();

        // 頭
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(centerX, this.y + headRadius, headRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    renderHpBar(ctx) {
        const barWidth = this.width;
        const barHeight = 4;
        const barY = this.y - 10;
        
        // 背景
        ctx.fillStyle = '#400';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        // HP
        ctx.fillStyle = '#f44';
        ctx.fillRect(this.x, barY, barWidth * (this.hp / this.maxHp), barHeight);
    }
    
    renderAscensionEffect(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const progress = this.deathTimer / this.deathDuration;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - progress)})`;
        
        // 上昇する粒子
        for (let i = 0; i < 8; i++) {
            const seed = (i * 123.45 + this.deathTimer * 0.2) % 100;
            const px = centerX + Math.sin(i + this.deathTimer * 0.01) * 20;
            const py = centerY + 30 - (this.deathTimer * 0.05 + i * 10) % 60;
            const size = 2 + Math.sin(this.deathTimer * 0.01 + i) * 1.5;
            
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // ぼんやりとした光
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 40);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${0.4 * (1 - progress)})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 足軽（雑魚）
export class Ashigaru extends Enemy {
    init() {
        this.width = 35;
        this.height = 55;
        this.hp = 8;      // 一撃で倒せるよう調整
        this.maxHp = 8;
        this.damage = 1;
        this.speed = 2.65;
        this.speedVarianceRange = 0.24;
        this.speedVarianceBias = -0.02;
        this.expReward = 10;
        this.moneyReward = 5;
        this.specialGaugeReward = 5; // 3 -> 5
        this.detectionRange = 680;
        this.attackRange = 40;
        this.attackWindupMs = 80;
    }
    
    renderBody(ctx) {
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'spear',
            headStyle: 'kasa',
            crest: false,
            simpleOutfit: true,
            shoulderPads: false,
            noFrontArmor: true,
            armorRows: 2,
            armScale: 1.04,
            torsoLeanScale: 1.02,
            attackDurationMs: 300,
            palette: {
                legBack: '#121212',
                legFront: '#1a1a1a',
                robe: '#2e3440',
                robeShade: '#20252f',
                torsoCore: '#151515',
                armorA: '#3a414f',
                armorB: '#2a303a',
                armorEdge: '#ac9155',
                shoulder: '#4a5262',
                helmTop: '#6e4d30',
                helmBottom: '#24170f',
                crest: '#d1ab66'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const moveBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const stridePhase = this.motionTime * 0.012;
        const bodyLean = dir * (2.08 + this.torsoLean * 0.3 + (this.isAttacking ? 1.05 : 0));
        const shoulderCenterX = centerX + bodyLean * 0.35;
        const shoulderFrontX = shoulderCenterX + dir * 2.8;
        const shoulderBackX = shoulderCenterX - dir * 2.4;
        const shoulderY = this.y + 22.5 - this.bob * 0.08;
        const hipCenterX = centerX - dir * 0.8;
        const hipY = this.y + 37.8 + this.bob * 0.1;
        const headX = shoulderCenterX - dir * 0.2;
        const headY = this.y + 12.8;

        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 1.5, 12, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX: hipCenterX,
            hipY,
            footY,
            dir,
            gaitPhase: stridePhase,
            runBlend: moveBlend,
            backColor: '#121212',
            frontColor: '#1b1b1b',
            backWidth: 3.9,
            frontWidth: 4.9,
            spread: 2.4,
            stepScale: 7.8,
            liftScale: 4.5
        });

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#151515';
        ctx.lineWidth = 13.8;
        ctx.beginPath();
        ctx.moveTo(shoulderCenterX, shoulderY);
        ctx.lineTo(hipCenterX, hipY);
        ctx.stroke();

        ctx.fillStyle = '#2d3440';
        ctx.beginPath();
        ctx.moveTo(shoulderBackX - dir * 0.5, shoulderY + 1.2);
        ctx.lineTo(shoulderFrontX + dir * 0.8, shoulderY + 2.2);
        ctx.lineTo(hipCenterX + dir * 5.8, hipY - 4.2);
        ctx.lineTo(hipCenterX - dir * 4.9, hipY - 3.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(shoulderBackX, shoulderY + 2.6);
        ctx.lineTo(hipCenterX + dir * 4.8, hipY - 4.9);
        ctx.stroke();

        ctx.fillStyle = '#171717';
        ctx.beginPath();
        ctx.arc(headX, headY, 10.9, 0, Math.PI * 2);
        ctx.fill();

        const kasaGrad = ctx.createLinearGradient(headX, headY - 15, headX, headY - 1);
        kasaGrad.addColorStop(0, '#523926');
        kasaGrad.addColorStop(0.55, '#2b1f15');
        kasaGrad.addColorStop(1, '#16100b');
        ctx.fillStyle = kasaGrad;
        ctx.beginPath();
        ctx.moveTo(headX - dir * 1.2, headY - 15.4);
        ctx.lineTo(headX - 19, headY - 3.2);
        ctx.lineTo(headX + 19, headY - 3.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,200,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(headX, headY - 13.5);
        ctx.lineTo(headX - 14.5, headY - 4.2);
        ctx.moveTo(headX, headY - 13.5);
        ctx.lineTo(headX + 14.5, headY - 4.2);
        ctx.stroke();

        const attackProgress = this.isAttacking && !this.isDying
            ? Math.max(0, Math.min(1, 1 - (this.attackTimer / 300)))
            : 0;
        const windup = attackProgress > 0 ? (attackProgress < 0.35 ? attackProgress / 0.35 : 1) : 0;
        const thrustStrength = attackProgress > 0 ? (attackProgress < 0.35 ? 0 : (attackProgress - 0.35) / 0.65) : 0;
        const leadTargetX = shoulderFrontX + dir * (13 + windup * 3.4 + thrustStrength * 18.5);
        const leadTargetY = shoulderY + 8.4 - windup * 1.4 + thrustStrength * 1.15;
        const supportTargetX = shoulderBackX + dir * (4.6 + thrustStrength * 8.4);
        const supportTargetY = shoulderY + 10.2 + thrustStrength * 0.35;

        const supportArm = this.drawJointedArm(ctx, {
            shoulderX: shoulderBackX,
            shoulderY: shoulderY + 2.8,
            handX: supportTargetX,
            handY: supportTargetY,
            upperLen: 10.8,
            foreLen: 10.2,
            bendSign: dir * 0.9,
            upperWidth: 4.6,
            foreWidth: 4.0,
            jointRadius: 2.7,
            baseColor: '#161616',
            handColor: '#181818',
            highlightColor: 'rgba(255,255,255,0.09)'
        });
        const leadArm = this.drawJointedArm(ctx, {
            shoulderX: shoulderFrontX,
            shoulderY: shoulderY + 1.1,
            handX: leadTargetX,
            handY: leadTargetY,
            upperLen: 12.4,
            foreLen: 13.1,
            bendSign: -dir * 0.8,
            upperWidth: 5.3,
            foreWidth: 4.5,
            jointRadius: 3.1,
            baseColor: '#171717',
            handColor: '#1a1a1a',
            highlightColor: 'rgba(255,255,255,0.12)'
        });

        const spearStartX = supportArm.handX - dir * 2.4;
        const spearStartY = supportArm.handY - 0.4;
        const spearEndX = leadArm.handX + dir * (45 + thrustStrength * 57);
        const spearEndY = leadArm.handY - 5.1 + thrustStrength * 0.75;

        if (this.isAttacking && !this.isDying && thrustStrength > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const alpha = 0.3 + thrustStrength * 0.6;
            const coneGrad = ctx.createLinearGradient(
                spearEndX - dir * 44,
                spearEndY,
                spearEndX + dir * (12 + thrustStrength * 22),
                spearEndY
            );
            coneGrad.addColorStop(0, 'rgba(150, 232, 255, 0)');
            coneGrad.addColorStop(0.7, `rgba(200, 255, 255, ${alpha})`);
            coneGrad.addColorStop(1, 'rgba(100, 200, 255, 0)');
            ctx.fillStyle = coneGrad;
            ctx.beginPath();
            const startConeX = spearEndX - dir * (22 + thrustStrength * 15);
            ctx.moveTo(startConeX, spearEndY - 12 * thrustStrength);
            ctx.lineTo(spearEndX + dir * (16 + thrustStrength * 16), spearEndY);
            ctx.lineTo(startConeX, spearEndY + 12 * thrustStrength);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 2 + thrustStrength * 2;
            ctx.beginPath();
            ctx.moveTo(spearEndX - dir * (10 + thrustStrength * 8), spearEndY);
            ctx.lineTo(spearEndX + dir * (16 + thrustStrength * 16), spearEndY);
            ctx.stroke();
            ctx.restore();
        }

        this.drawDetailedSpear(ctx, {
            shaftStartX: spearStartX,
            shaftStartY: spearStartY,
            shaftEndX: spearEndX,
            shaftEndY: spearEndY,
            tipLen: 14,
            tipWidth: 7.4,
            tasselSwing: Math.sin(this.motionTime * 0.018) * 2.4 + thrustStrength * 4.2,
            showTassel: true
        });

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(leadArm.handX, leadArm.handY, 4.1, 0, Math.PI * 2);
        ctx.arc(supportArm.handX, supportArm.handY, 3.8, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 侍（普通）
export class Samurai extends Enemy {
    init() {
        this.width = 40;
        this.height = 60;
        this.hp = 28;
        this.maxHp = 28;
        this.damage = 2;
        this.speed = 3.45;
        this.speedVarianceRange = 0.2;
        this.speedVarianceBias = 0.04;
        this.expReward = 25;
        this.moneyReward = 15;
        this.specialGaugeReward = 12; // 8 -> 12
        this.detectionRange = 760;
        this.attackRange = 50;
        this.attackWindupMs = 95;
        
        // 侍専用
        this.comboCount = 0;
        this.maxCombo = 3;
    }
    
    updateAI(deltaTime, player) {
        // シンプルに親クラスのAIを使用
        super.updateAI(deltaTime, player);
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackTimer = 250;
        this.comboCount++;
        this.playAttackSfx();
        
        if (this.comboCount >= this.maxCombo) {
            this.attackCooldown = 800;
            this.comboCount = 0;
        } else {
            this.attackCooldown = 200;
        }
    }
    
    takeDamage(amount) {
        return super.takeDamage(amount);
    }
    
    renderBody(ctx) {
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'katana',
            headStyle: 'kabuto',
            simpleOutfit: true,
            shoulderPads: false,
            noFrontArmor: true,
            crestVariant: 'crescent',
            crestLengthScale: 1.06,
            crestArcHeightScale: 1.14,
            crestTipRiseScale: 0.96,
            crestForwardOffsetScale: 0.98,
            crestRootLiftScale: 1.0,
            armorRows: 3,
            armScale: 1.08,
            torsoLeanScale: 1.06,
            attackDurationMs: 250,
            weaponScale: 1.2,
            palette: {
                legBack: '#111',
                legFront: '#1a1a1a',
                robe: '#262b34',
                robeShade: '#1b2028',
                torsoCore: '#141519',
                armorA: '#465062',
                armorB: '#303744',
                armorEdge: '#c8a857',
                shoulder: '#556074',
                helmTop: '#2c313c',
                helmBottom: '#171a20',
                crest: '#ccb068'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const phase = this.motionTime * 0.0125;
        const bodyLean = dir * (2.34 + this.torsoLean * 0.36 + (this.isAttacking ? 1.08 : 0));
        const shoulderCenterX = centerX + bodyLean * 0.33;
        const shoulderFrontX = shoulderCenterX + dir * 3.4;
        const shoulderBackX = shoulderCenterX - dir * 3.0;
        const shoulderY = this.y + 22.2 + Math.abs(this.bob) * 0.14;
        const hipCenterX = centerX - dir * 0.9;
        const hipY = this.y + 39.5;
        const headX = shoulderCenterX - dir * 0.35;
        const headY = this.y + 12.2;

        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 1.6, 13.6, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX: hipCenterX,
            hipY,
            footY,
            dir,
            gaitPhase: phase,
            runBlend,
            backColor: '#111111',
            frontColor: '#1a1a1a',
            backWidth: 4.7,
            frontWidth: 5.8,
            spread: 2.8,
            stepScale: 8.8,
            liftScale: 5.2
        });

        ctx.fillStyle = '#1f232b';
        ctx.beginPath();
        ctx.moveTo(centerX - 10.8, footY - 0.4);
        ctx.lineTo(centerX + 10.8, footY - 0.4);
        ctx.lineTo(centerX + dir * 6.9, this.y + 28.2);
        ctx.lineTo(centerX - dir * 7.8, this.y + 28.2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#151515';
        ctx.lineWidth = 14.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shoulderCenterX, shoulderY);
        ctx.lineTo(hipCenterX, hipY);
        ctx.stroke();

        ctx.fillStyle = '#2f3642';
        ctx.beginPath();
        ctx.moveTo(shoulderBackX - dir * 0.8, shoulderY + 1.4);
        ctx.lineTo(shoulderFrontX + dir * 1.2, shoulderY + 2.4);
        ctx.lineTo(hipCenterX + dir * 7.8, hipY - 3.7);
        ctx.lineTo(hipCenterX - dir * 6.5, hipY - 2.8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(shoulderBackX + dir * 0.1, shoulderY + 3.2);
        ctx.lineTo(hipCenterX + dir * 6.2, hipY - 4.6);
        ctx.stroke();

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 13.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#2a2f38';
        ctx.beginPath();
        ctx.arc(headX, headY - 2.2, 14.8, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2a2f38';
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.arc(headX, headY - 7.5, 16.8, Math.PI * 0.96, Math.PI * 0.04, true);
        ctx.stroke();
        ctx.fillStyle = '#c9ab56';
        ctx.beginPath();
        ctx.moveTo(headX + dir * 1.8, headY - 14.4);
        ctx.lineTo(headX + dir * 10.5, headY - 24.6);
        ctx.lineTo(headX + dir * 12.4, headY - 20.4);
        ctx.closePath();
        ctx.fill();

        const attackProgress = this.isAttacking ? Math.max(0, Math.min(1, 1 - (this.attackTimer / 250))) : 0;
        const windup = attackProgress < 0.32 ? attackProgress / 0.32 : 1;
        const slash = attackProgress < 0.32 ? 0 : (attackProgress - 0.32) / 0.68;
        const baseArmAngle = this.isAttacking
            ? (-1.42 + windup * 0.32 + slash * 2.5)
            : (-0.48 + Math.sin(this.motionTime * 0.008) * 0.08);
        const leadArmAngle = dir === 1 ? baseArmAngle : Math.PI - baseArmAngle;
        const leadReach = this.isAttacking ? 25.8 : 22.6;
        const leadTargetX = shoulderFrontX + Math.cos(leadArmAngle) * leadReach;
        const leadTargetY = shoulderY + 1.2 + Math.sin(leadArmAngle) * leadReach;
        const bladeAngle = dir === 1 ? (baseArmAngle + 0.1) : Math.PI - (baseArmAngle + 0.1);
        const bladeDirX = Math.cos(bladeAngle);
        const bladeDirY = Math.sin(bladeAngle);
        const supportTargetX = leadTargetX - bladeDirX * 10.6 - bladeDirY * 1.2;
        const supportTargetY = leadTargetY - bladeDirY * 10.6 + bladeDirX * 1.2;

        const supportArm = this.drawJointedArm(ctx, {
            shoulderX: shoulderBackX,
            shoulderY: shoulderY + 3.2,
            handX: supportTargetX,
            handY: supportTargetY,
            upperLen: 11.2,
            foreLen: 11.8,
            bendSign: dir * 0.86,
            upperWidth: 5.0,
            foreWidth: 4.3,
            jointRadius: 3.0,
            baseColor: '#181818',
            handColor: '#1d2026',
            highlightColor: 'rgba(255,255,255,0.08)'
        });
        const leadArm = this.drawJointedArm(ctx, {
            shoulderX: shoulderFrontX,
            shoulderY: shoulderY + 1.0,
            handX: leadTargetX,
            handY: leadTargetY,
            upperLen: 12.6,
            foreLen: 12.8,
            bendSign: -dir * 0.74,
            upperWidth: 5.6,
            foreWidth: 4.8,
            jointRadius: 3.2,
            baseColor: '#191919',
            handColor: '#21262f',
            highlightColor: 'rgba(255,255,255,0.12)'
        });

        const bladeLen = 41;
        this.drawDetailedKatana(ctx, {
            handX: leadArm.handX,
            handY: leadArm.handY,
            angle: bladeAngle,
            length: bladeLen,
            gripLen: 9.4,
            bladeWidth: 2.6,
            guardSize: 2.3
        });
        ctx.fillStyle = '#21262f';
        ctx.beginPath();
        ctx.arc(supportArm.handX, supportArm.handY, 4.5, 0, Math.PI * 2);
        ctx.arc(leadArm.handX, leadArm.handY, 4.6, 0, Math.PI * 2);
        ctx.fill();

        if (this.isAttacking && !this.isDying && slash > 0) {
            const arcStart = bladeAngle - dir * 1.1;
            const arcEnd = bladeAngle + dir * 0.62;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const r = 39 + slash * 13;
            const cx = shoulderCenterX + dir * 4.2;
            const cy = shoulderY + 2.1;
            ctx.beginPath();
            ctx.arc(cx, cy, r, arcStart, arcEnd, dir < 0);
            ctx.arc(cx, cy, r - 16 - slash * 5.2, arcEnd, arcStart, dir > 0);
            ctx.closePath();
            const slashGrad = ctx.createRadialGradient(cx, cy, r - 20, cx, cy, r);
            slashGrad.addColorStop(0, 'rgba(255, 50, 50, 0)');
            slashGrad.addColorStop(0.6, `rgba(255, 100, 100, ${0.42 + slash * 0.38})`);
            slashGrad.addColorStop(0.9, `rgba(255, 200, 200, ${0.72 + slash * 0.28})`);
            slashGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = slashGrad;
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 220, 220, ${0.62 + slash * 0.38})`;
            ctx.lineWidth = 3.1;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy, r - 4, arcStart, arcEnd, dir < 0);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// 武将（中ボス）
export class Busho extends Enemy {
    init() {
        this.width = 50;
        this.height = 75;
        this.hp = 58;
        this.maxHp = 58;
        this.damage = 2;
        this.speed = 2.1;
        this.speedVarianceRange = 0.18;
        this.speedVarianceBias = 0.06;
        this.expReward = 100;
        this.moneyReward = 50;
        this.specialGaugeReward = 40; // 20 -> 40
        this.detectionRange = 620;
        this.attackRange = 80;
        
        this.attackPattern = 0;
        this.maxPatterns = 3;
        
        // ボス用ステータス
        this.actionTimer = 0;
        this.isEnraged = false;
        this.moveType = 'normal'; // normal, dash, retreat
        this.moveTimer = 0;
    }

    updateAI(deltaTime, player) {
        if (!this.isAlive) return;

        this.actionTimer += deltaTime * 1000;
        this.moveTimer -= deltaTime * 1000;
        
        // HP50%以下で発狂モード
        if (!this.isEnraged && this.hp < this.maxHp * 0.5) {
            this.isEnraged = true;
            this.speed *= 1.3;
        }

        const dist = Math.abs(player.x - this.x);
        const directionToPlayer = player.x > this.x ? 1 : -1;
        let desiredVX = this.vx;
        
        if (!this.isAttacking) {
            this.facingRight = directionToPlayer > 0;
            
            // 攻撃の意思決定
            const attackInterval = this.isEnraged ? 500 : 860;
            if (this.actionTimer > attackInterval) {
                if (dist < this.attackRange) {
                    this.startAttack();
                    this.actionTimer = 0;
                    this.moveType = Math.random() < 0.4 ? 'retreat' : 'normal';
                    this.moveTimer = 1000;
                } else if (dist < 350 && Math.random() < 0.4) {
                    this.startAttack(); // 突進
                    this.actionTimer = 0;
                }
            }
            
            // 移動の意思決定
            if (this.moveTimer <= 0) {
                // 定期的に移動スタイルを変更
                const rand = Math.random();
                if (rand < 0.5) this.moveType = 'normal';
                else if (rand < 0.7) this.moveType = 'retreat';
                else this.moveType = 'dash';
                this.moveTimer = 560 + Math.random() * 780;
            }

            if (this.moveType === 'retreat' && dist < 120) {
                // 距離を取る（少し速く）
                desiredVX = -this.speed * 1.38 * directionToPlayer;
            } else if (this.moveType === 'dash') {
                // 素早く近づく
                desiredVX = this.speed * 2.28 * directionToPlayer;
            } else if (dist > 50) {
                desiredVX = this.speed * directionToPlayer;
            } else {
                desiredVX = 0;
                // 密着時は時々ダッシュで裏回り狙い
                if (Math.random() < 0.02) this.moveType = 'dash';
            }
            
            // 時々ジャンプ（プレイヤーがジャンプ中なら頻度アップ）
            const jumpChance = (!player.isGrounded) ? 0.05 : 0.018;
            this.tryJump(jumpChance, -22, 650);
            
        } else {
            // 突進以外は停止、突進中は updateAttack が設定した速度を維持
            desiredVX = (this.attackPattern === 1) ? this.vx : 0;
        }

        this.applyDesiredVx(desiredVX, this.isAttacking ? 0.35 : 0.24);
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackPattern = Math.floor(Math.random() * this.maxPatterns);
        
        switch (this.attackPattern) {
            case 0: // 通常斬り
                this.attackTimer = 320;
                this.attackCooldown = 460;
                audio.playSlash(2);
                break;
            case 1: // 突進
                this.attackTimer = 480;
                this.attackCooldown = 760;
                audio.playDash();
                audio.playSlash(2);
                break;
            case 2: // 回転斬り
                this.attackTimer = 390;
                this.attackCooldown = 620;
                audio.playSlash(4);
                break;
        }
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        
        // 突進パターンは移動を伴う
        if (this.attackPattern === 1 && this.attackTimer > 200) {
            this.vx = (this.facingRight ? 1 : -1) * this.speed * 4.2;
        }
        
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.vx = 0;
        }
    }

    getAttackPatternDuration() {
        if (this.attackPattern === 1) return 600;
        if (this.attackPattern === 2) return 500;
        return 400;
    }

    getAttackProgress() {
        if (!this.isAttacking) return 0;
        const duration = this.getAttackPatternDuration();
        return Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
    }

    getBladeAngleForProgress(attackProgress) {
        let bladeAngle = -0.9 + Math.sin(this.motionTime * 0.007) * 0.07;
        if (!this.isAttacking) return bladeAngle;
        if (this.attackPattern === 0) {
            const wind = attackProgress < 0.2 ? attackProgress / 0.2 : 1;
            const swing = attackProgress < 0.2 ? 0 : (attackProgress - 0.2) / 0.8;
            const quickSwing = 1 - Math.pow(1 - swing, 2.25);
            bladeAngle = -1.56 + wind * 0.56 + quickSwing * 2.52;
        } else if (this.attackPattern === 1) {
            bladeAngle = -0.35 + attackProgress * 0.25;
        } else {
            const wind = attackProgress < 0.16 ? attackProgress / 0.16 : 1;
            const spin = attackProgress < 0.16 ? 0 : (attackProgress - 0.16) / 0.84;
            const quickArc = 1 - Math.pow(1 - spin, 2.0);
            bladeAngle = -1.46 + wind * 0.42 + quickArc * Math.PI * 1.34;
        }
        return bladeAngle;
    }

    getWeaponPose(attackProgress = this.getAttackProgress()) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const shoulderX = centerX + dir * 4.4 + this.torsoLean * dir * 0.34;
        const shoulderY = this.y + 29 + Math.abs(this.bob) * 0.18;
        const baseBladeAngle = this.getBladeAngleForProgress(attackProgress);
        const bladeAngle = dir === 1 ? baseBladeAngle : Math.PI - baseBladeAngle;
        const weaponAngle = dir === 1 ? (baseBladeAngle + 0.08) : Math.PI - (baseBladeAngle + 0.08);
        const leadArmLen = this.isAttacking ? 25.4 : 21.2;
        const handX = shoulderX + Math.cos(bladeAngle) * leadArmLen;
        const handY = shoulderY + Math.sin(bladeAngle) * leadArmLen;
        const bladeLen = this.attackPattern === 1 ? 66 : 61;
        const tipDistance = bladeLen + 5.7;
        return {
            dir,
            shoulderX,
            shoulderY,
            bladeAngle,
            weaponAngle,
            handX,
            handY,
            tipX: handX + Math.cos(weaponAngle) * tipDistance,
            tipY: handY + Math.sin(weaponAngle) * tipDistance
        };
    }
    
    getAttackHitbox() {
        if (!this.isAttacking) return null;
        
        switch (this.attackPattern) {
            case 0: // 通常斬り
                return {
                    x: this.x + (this.facingRight ? this.width : -this.attackRange),
                    y: this.y + 10,
                    width: this.attackRange,
                    height: this.height - 20
                };
            case 1: // 突進（体全体が当たり判定）
                return {
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height
                };
            case 2: { // 回転斬り（剣先追従＋体幹）
                const pose = this.getWeaponPose();
                const tipRange = 24;
                return [
                    {
                        x: pose.tipX - tipRange,
                        y: pose.tipY - tipRange,
                        width: tipRange * 2,
                        height: tipRange * 2
                    },
                    {
                        x: pose.handX - 15,
                        y: pose.handY - 15,
                        width: 30,
                        height: 30
                    },
                    {
                        x: this.x - 6,
                        y: this.y + 8,
                        width: this.width + 12,
                        height: this.height - 12
                    }
                ];
            }
        }
    }
    
    renderBody(ctx) {
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'heavy',
            headStyle: 'kabuto',
            shoulderPads: false,
            noFrontArmor: true,
            backCape: true,
            crestVariant: 'sweep',
            crestLengthScale: 0.92,
            crestArcHeightScale: 0.68,
            crestTipRiseScale: 0.52,
            crestForwardOffsetScale: 0.96,
            crestRootLiftScale: 0.98,
            armorRows: 4,
            headRatio: 0.185,
            armScale: 1.14,
            torsoLeanScale: 1.12,
            attackDurationMs: this.getAttackPatternDuration(),
            attackProgressResolver: () => this.getAttackProgress(),
            weaponScale: 0.92,
            heavyBladeLengthScale: 0.88,
            heavyGripScale: 0.92,
            preventGroundPenetration: true,
            slashPivotXOffset: 5.5,
            slashPivotYOffset: this.height * 0.08,
            slashWidthScale: 1.12,
            palette: {
                legBack: '#141414',
                legFront: '#1b1b1b',
                robe: '#2f1b22',
                robeShade: '#231319',
                torsoCore: '#161616',
                armorA: '#505867',
                armorB: '#3a404b',
                armorEdge: '#cfaa57',
                shoulder: '#626b7d',
                capeTop: '#8e3348',
                capeMid: '#421b27',
                capeBottom: '#17080f',
                helmTop: '#2d313a',
                helmBottom: '#181a20',
                crest: '#e0b35a'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed * 1.2)));
        const phase = this.motionTime * 0.0105;
        const shoulderX = centerX + dir * 4.2 + this.torsoLean * dir * 0.32;
        const shoulderY = this.y + 29 + Math.abs(this.bob) * 0.18;
        const hipX = centerX - dir * 1.5;
        const hipY = this.y + 53;
        const headX = shoulderX - dir * 0.6;
        const headY = this.y + 20;
        const mantleWave = Math.sin(this.motionTime * 0.006) * 4.5;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 2, 20, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // マント
        const mantleGrad = ctx.createLinearGradient(centerX, this.y + 30, centerX, footY);
        mantleGrad.addColorStop(0, '#942f44'); // より明るく
        mantleGrad.addColorStop(0.4, '#3b1018');
        mantleGrad.addColorStop(1, '#1a0509');
        ctx.fillStyle = mantleGrad;
        ctx.beginPath();
        ctx.moveTo(centerX - 14, this.y + 30);
        ctx.lineTo(centerX + 14, this.y + 30);
        ctx.lineTo(centerX + 25 + mantleWave, footY - 2);
        ctx.lineTo(centerX - 25 + mantleWave * 0.7, footY - 2);
        ctx.closePath();
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase: phase,
            runBlend,
            backColor: '#151515',
            frontColor: '#151515',
            backWidth: 6,
            frontWidth: 7,
            spread: 3.1,
            stepScale: 9.1,
            liftScale: 5.4
        });

        // 体幹の下地
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 鎧胴
        const armorGradB = ctx.createLinearGradient(centerX - 20, hipY, centerX + 20, this.y + 32);
        armorGradB.addColorStop(0, '#858d9e'); // 強いハイライト
        armorGradB.addColorStop(0.5, '#30343f');
        armorGradB.addColorStop(0.8, '#1b1d24'); // コアシャドウ
        armorGradB.addColorStop(1, '#373d4e'); // リムライト
        ctx.fillStyle = armorGradB;
        ctx.beginPath();
        ctx.moveTo(centerX - 18, hipY + 1);
        ctx.lineTo(centerX + 18, hipY + 1);
        ctx.lineTo(centerX + 21, this.y + 32);
        ctx.lineTo(centerX - 21, this.y + 32);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#d4b24c';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(centerX - 13, this.y + 39);
        ctx.lineTo(centerX + 13, this.y + 39);
        ctx.lineTo(centerX + 11, this.y + 52);
        ctx.lineTo(centerX - 11, this.y + 52);
        ctx.closePath();
        ctx.stroke();

        // 頭・兜
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 18, 0, Math.PI * 2);
        ctx.fill();
        

        // 兜本体
        ctx.fillStyle = '#1d1f26';
        ctx.beginPath();
        ctx.arc(headX, headY - 5, 19, Math.PI, 0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#1d1f26';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(headX, headY - 9, 21, Math.PI * 0.96, Math.PI * 0.04, true);
        ctx.stroke();
        
        // 兜の装飾（角）
        ctx.fillStyle = '#a6822e';
        ctx.beginPath();
        ctx.moveTo(headX - 2, headY - 28);
        ctx.lineTo(headX - 15, headY - 44);
        ctx.lineTo(headX + 12, headY - 44);
        ctx.closePath();
        ctx.fill();

        // 武器腕
        const attackProgress = this.getAttackProgress();
        const pose = this.getWeaponPose(attackProgress);
        const bladeAngle = pose.bladeAngle;

        const weaponAngle = pose.weaponAngle;
        const leadTargetX = pose.handX;
        const leadTargetY = pose.handY;
        const leadArm = this.drawJointedArm(ctx, {
            shoulderX,
            shoulderY,
            handX: leadTargetX,
            handY: leadTargetY,
            upperLen: 12.9,
            foreLen: 13.7,
            bendSign: -dir * 0.8,
            upperWidth: 5.8,
            foreWidth: 5.0,
            jointRadius: 3.2,
            baseColor: '#1b1b1b',
            handColor: '#21262f',
            highlightColor: 'rgba(220,232,248,0.12)'
        });
        const leadHandX = leadArm.handX;
        const leadHandY = leadArm.handY;

        const weaponDirX = Math.cos(weaponAngle);
        const weaponDirY = Math.sin(weaponAngle);
        const supportTargetX = leadHandX - weaponDirX * 11.5 - weaponDirY * 1.3;
        const supportTargetY = leadHandY - weaponDirY * 11.5 + weaponDirX * 1.3;
        const supportShoulderX = shoulderX - dir * 5.1;
        const supportShoulderY = shoulderY + 2.8;
        const supportArm = this.drawJointedArm(ctx, {
            shoulderX: supportShoulderX,
            shoulderY: supportShoulderY,
            handX: supportTargetX,
            handY: supportTargetY,
            upperLen: 11.6,
            foreLen: 12.3,
            bendSign: dir * 0.88,
            upperWidth: 5.2,
            foreWidth: 4.4,
            jointRadius: 3.0,
            baseColor: '#191919',
            handColor: '#1f232a',
            highlightColor: 'rgba(198,216,238,0.1)'
        });
        ctx.fillStyle = '#1f232a';
        ctx.beginPath();
        ctx.arc(supportArm.handX, supportArm.handY, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#21262f';
        ctx.beginPath();
        ctx.arc(leadHandX, leadHandY, 5.0, 0, Math.PI * 2);
        ctx.fill();

        // 大剣
        const bladeLen = this.attackPattern === 1 ? 66 : 61;
        const heavyBlade = this.drawDetailedHeavyBlade(ctx, {
            handX: leadHandX,
            handY: leadHandY,
            angle: weaponAngle,
            length: bladeLen,
            gripLen: 12
        });
        const tipX = heavyBlade.tipX;
        const tipY = heavyBlade.tipY;

        if (this.isAttacking) {
            if (this.attackPattern === 2) {
                const spin = attackProgress < 0.2 ? 0 : (attackProgress - 0.2) / 0.8;
                const trailBack = 0.5 + Math.min(0.52, spin * 0.44);
                const trailFront = 0.12;
                ctx.strokeStyle = `rgba(255, 156, 92, ${0.5 + spin * 0.28})`;
                ctx.lineWidth = 14;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(
                    shoulderX + dir * 2,
                    shoulderY + 2,
                    58,
                    bladeAngle - dir * trailBack,
                    bladeAngle + dir * trailFront,
                    dir < 0
                );
                ctx.stroke();
                ctx.strokeStyle = `rgba(255, 239, 206, ${0.34 + spin * 0.2})`;
                ctx.lineWidth = 5.2;
                ctx.beginPath();
                ctx.arc(
                    shoulderX + dir * 2,
                    shoulderY + 2,
                    58,
                    bladeAngle - dir * (trailBack - 0.08),
                    bladeAngle + dir * 0.03,
                    dir < 0
                );
                ctx.stroke();
                ctx.strokeStyle = `rgba(255, 186, 120, ${0.3 + spin * 0.24})`;
                ctx.lineWidth = 3.4;
                ctx.beginPath();
                ctx.arc(
                    shoulderX + dir * 2,
                    shoulderY + 2,
                    64,
                    bladeAngle - dir * (trailBack - 0.2),
                    bladeAngle + dir * 0.01,
                    dir < 0
                );
                ctx.stroke();
            } else if (this.attackPattern === 1) {
                // 斬撃軌跡の描画 (武将の重厚な剣閃)
                if (this.isAttacking && !this.isDying && attackProgress > 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    const sweepProgress = Math.max(0, (attackProgress - 0.25) / 0.75);
                    
                    const arcStart = pose.bladeAngle - dir * 1.6;
                    const arcEnd = pose.bladeAngle + dir * 0.7;
                    const cx = shoulderX + dir * 6;
                    const cy = shoulderY + 8;
                    const r = bladeLen + 15 + sweepProgress * 8;
                    
                    // 分厚い半月状の剣閃
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, arcStart, arcEnd, dir < 0);
                    ctx.arc(cx, cy, r - 35 - sweepProgress*15, arcEnd, arcStart, dir > 0);
                    ctx.closePath();
                    
                    const slashGrad = ctx.createRadialGradient(cx, cy, r - 35, cx, cy, r);
                    slashGrad.addColorStop(0, `rgba(255, 100, 0, 0)`);
                    slashGrad.addColorStop(0.5, `rgba(255, 120, 20, ${0.4 + sweepProgress*0.4})`);
                    slashGrad.addColorStop(0.85, `rgba(255, 200, 100, ${0.7 + sweepProgress*0.3})`);
                    slashGrad.addColorStop(1, `rgba(255, 255, 255, 0)`);
                    
                    ctx.fillStyle = slashGrad;
                    ctx.fill();
                    
                    // コアとなる鋭い一閃
                    ctx.strokeStyle = `rgba(255, 240, 200, ${0.6 + sweepProgress * 0.4})`;
                    ctx.lineWidth = 4 + sweepProgress * 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r - 5 - sweepProgress*5, arcStart, arcEnd, dir < 0);
                    ctx.stroke();

                    ctx.restore();
                }
            } else {
                const swing = attackProgress < 0.34 ? 0 : (attackProgress - 0.34) / 0.66;
                if (swing > 0) {
                    ctx.strokeStyle = `rgba(255, 110, 72, ${0.32 + swing * 0.5})`;
                    ctx.lineWidth = 14;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(shoulderX + dir * 2, shoulderY + 2, 56, bladeAngle - dir * 0.88, bladeAngle + dir * 0.52, dir < 0);
                    ctx.stroke();
                    ctx.strokeStyle = `rgba(255, 233, 204, ${0.24 + swing * 0.32})`;
                    ctx.lineWidth = 4.8;
                    ctx.beginPath();
                    ctx.arc(shoulderX + dir * 2, shoulderY + 2, 56, bladeAngle - dir * 0.74, bladeAngle + dir * 0.34, dir < 0);
                    ctx.stroke();
                }
            }
        }
    }

}

// 忍者（特殊）
export class Ninja extends Enemy {
    init() {
        this.width = 35;
        this.height = 55;
        this.hp = 20;
        this.maxHp = 20;
        this.damage = 1;
        this.speed = 3.15;
        this.speedVarianceRange = 0.28;
        this.speedVarianceBias = 0.03;
        this.expReward = 20;
        this.moneyReward = 10;
        this.specialGaugeReward = 15; // 10 -> 15
        this.detectionRange = 660;
        this.attackRange = 340;
        this.attackWindupMs = 90;
    }

    updateAI(deltaTime, player) {
        const distanceToPlayer = this.getDistanceToPlayer(player);
        const playerDirection = player.x > this.x ? 1 : -1;

        if (this.state === 'chase' && distanceToPlayer < 200) {
            // 近すぎると離れて距離を取る（忍者の立ち回り）
            const desiredVX = -this.speed * playerDirection;
            this.applyDesiredVx(desiredVX, 0.32);
            this.facingRight = playerDirection > 0;
            this.tryJump(0.03, -22, 550);
        } else {
            super.updateAI(deltaTime, player);
            // chase状態でも時々ジャンプしてかく乱
            if (this.state === 'chase') {
                this.tryJump(0.01, -20, 550);
            }
        }
    }

    startAttack() {
        this.isAttacking = true;
        this.attackTimer = 400; 

        // 手裏剣の同時出現数を制限 (最大3)
        if (this.projectiles.length >= 3) return;

        // 手裏剣を投げる
        const direction = this.facingRight ? 1 : -1;
        const vy = 0; // まっすぐ飛ばす
        this.projectiles.push(new EnemyProjectile(
            this.x + (this.facingRight ? this.width : 0),
            this.y + 20,
            direction * 5.2,
            vy,
            this.damage
        ));
        audio.playShuriken();
    }

    getAttackHitbox() {
        // 忍者は投擲主体。近接の見えない当たり判定は持たせない。
        return null;
    }

    renderBody(ctx) {
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'ninja',
            headStyle: 'ninja',
            crest: false,
            simpleOutfit: true,
            shoulderPads: false,
            noFrontArmor: true,
            armorRows: 2,
            armScale: 1.06,
            torsoLeanScale: 1.04,
            attackDurationMs: 400,
            weaponScale: 0.94,
            palette: {
                legBack: '#121212',
                legFront: '#1a1a1a',
                robe: '#1f232b',
                robeShade: '#161a20',
                torsoCore: '#121315',
                armorA: '#313741',
                armorB: '#232830',
                armorEdge: '#6e77a0',
                shoulder: '#3f4654',
                helmTop: '#2a2e37',
                helmBottom: '#171a20',
                crest: '#8d9fcc',
                accent: '#ef4c4c'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const phase = this.motionTime * 0.015;
        const lean = dir * (2.08 + this.torsoLean * 0.26 + (this.isAttacking ? 0.8 : 0));
        const shoulderCenterX = centerX + lean * 0.34;
        const shoulderFrontX = shoulderCenterX + dir * 2.7;
        const shoulderBackX = shoulderCenterX - dir * 2.4;
        const shoulderY = this.y + 21.4 + this.bob * 0.16;
        const hipCenterX = centerX - dir * 0.6;
        const hipY = this.y + 36.8;
        const headX = shoulderCenterX - dir * 0.2;
        const headY = this.y + 12.6;

        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 1.3, 11.9, 3.3, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX: hipCenterX,
            hipY,
            footY,
            dir,
            gaitPhase: phase,
            runBlend,
            backColor: '#121212',
            frontColor: '#1a1a1a',
            backWidth: 4.0,
            frontWidth: 4.9,
            spread: 2.5,
            stepScale: 8.2,
            liftScale: 5.1
        });

        ctx.lineCap = 'round';
        const bodyGrad = ctx.createLinearGradient(shoulderCenterX, shoulderY, hipCenterX, hipY);
        bodyGrad.addColorStop(0, '#4a4d54');
        bodyGrad.addColorStop(0.42, '#1d1f24');
        bodyGrad.addColorStop(0.82, '#0e0f11');
        bodyGrad.addColorStop(1, '#262a31');
        ctx.strokeStyle = bodyGrad;
        ctx.lineWidth = 9.5;
        ctx.beginPath();
        ctx.moveTo(shoulderCenterX, shoulderY);
        ctx.lineTo(hipCenterX, hipY);
        ctx.stroke();

        ctx.fillStyle = '#1d2027';
        ctx.beginPath();
        ctx.moveTo(shoulderBackX - dir * 0.5, shoulderY + 1.2);
        ctx.lineTo(shoulderFrontX + dir * 0.8, shoulderY + 2.0);
        ctx.lineTo(hipCenterX + dir * 5.6, hipY - 2.8);
        ctx.lineTo(hipCenterX - dir * 4.8, hipY - 2.2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 12.2, 0, Math.PI * 2);
        ctx.fill();

        const maskGrad = ctx.createLinearGradient(headX, headY - 12, headX, headY + 12);
        maskGrad.addColorStop(0, '#3f4147');
        maskGrad.addColorStop(0.5, '#111214');
        maskGrad.addColorStop(1, '#1c1e24');
        ctx.fillStyle = maskGrad;
        ctx.beginPath();
        ctx.arc(headX, headY, 12.7, 0.4, Math.PI * 2 - 0.4);
        ctx.fill();

        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath();
        ctx.arc(headX + dir * 5, headY - 1, 1.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = ENEMY_HEADBAND_BASE;
        ctx.lineWidth = 5.2;
        ctx.beginPath();
        ctx.moveTo(headX - 11, headY - 1);
        ctx.quadraticCurveTo(headX, headY - 3.8, headX + 11, headY - 0.2);
        ctx.stroke();
        ctx.strokeStyle = ENEMY_HEADBAND_HIGHLIGHT;
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.moveTo(headX - 11, headY - 1);
        ctx.quadraticCurveTo(headX, headY - 3.8, headX + 11, headY - 0.2);
        ctx.stroke();

        const attackProgress = this.isAttacking ? Math.max(0, Math.min(1, 1 - (this.attackTimer / 400))) : 0;
        const throwBaseAngle = this.isAttacking
            ? (-1.22 + attackProgress * 2.22)
            : (-0.5 + Math.sin(this.motionTime * 0.01) * 0.08);
        const throwArmAngle = dir === 1 ? throwBaseAngle : Math.PI - throwBaseAngle;
        const throwReach = this.isAttacking ? 22.8 : 20.2;
        const throwTargetX = shoulderFrontX + Math.cos(throwArmAngle) * throwReach;
        const throwTargetY = shoulderY + 1.2 + Math.sin(throwArmAngle) * throwReach;
        const throwArm = this.drawJointedArm(ctx, {
            shoulderX: shoulderFrontX,
            shoulderY: shoulderY + 1.1,
            handX: throwTargetX,
            handY: throwTargetY,
            upperLen: 10.9,
            foreLen: 11.4,
            bendSign: -dir * 0.84,
            upperWidth: 4.8,
            foreWidth: 4.1,
            jointRadius: 2.7,
            baseColor: '#121314',
            handColor: '#1a1a1a',
            highlightColor: 'rgba(255,255,255,0.11)'
        });

        const swordPoseAngle = this.isAttacking
            ? (-0.16 + attackProgress * 0.36)
            : (-0.25 + Math.sin(this.motionTime * 0.008) * 0.06);
        const swordArmAngle = dir === 1 ? swordPoseAngle : Math.PI - swordPoseAngle;
        const swordTargetX = shoulderBackX + Math.cos(swordArmAngle) * 17.8;
        const swordTargetY = shoulderY + 3.2 + Math.sin(swordArmAngle) * 17.8;
        const swordArm = this.drawJointedArm(ctx, {
            shoulderX: shoulderBackX,
            shoulderY: shoulderY + 3.2,
            handX: swordTargetX,
            handY: swordTargetY,
            upperLen: 10.2,
            foreLen: 10.5,
            bendSign: dir * 0.88,
            upperWidth: 4.5,
            foreWidth: 3.8,
            jointRadius: 2.5,
            baseColor: '#101112',
            handColor: '#171717',
            highlightColor: 'rgba(255,255,255,0.08)'
        });

        const bladeAngle = dir === 1 ? (swordPoseAngle + 0.1) : Math.PI - (swordPoseAngle + 0.1);
        this.drawDetailedKatana(ctx, {
            handX: swordArm.handX,
            handY: swordArm.handY,
            angle: bladeAngle,
            length: 30.5,
            gripLen: 7.2,
            bladeWidth: 2.15,
            guardSize: 1.95
        });

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(throwArm.handX, throwArm.handY, 3.8, 0, Math.PI * 2);
        ctx.arc(swordArm.handX, swordArm.handY, 3.7, 0, Math.PI * 2);
        ctx.fill();

        if (this.isAttacking && !this.isDying && attackProgress > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const arcStart = throwArmAngle - dir * 0.8;
            const arcEnd = throwArmAngle + dir * 0.42;
            const r = 27;
            ctx.strokeStyle = `rgba(180, 240, 255, ${0.42 + attackProgress * 0.48})`;
            ctx.lineWidth = 2 + attackProgress * 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(shoulderFrontX, shoulderY, r, arcStart, arcEnd, dir < 0);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// 敵の飛び道具クラス
class EnemyProjectile {
    constructor(x, y, vx, vy, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.radius = 5;
        this.isAlive = true;
        this.angle = 0;
    }

    update(deltaTime, player) {
        this.x += this.vx;
        this.y += this.vy;
        this.angle += 0.5;

        // プレイヤーとの衝突
        const dx = (player.x + player.width / 2) - this.x;
        const dy = (player.y + player.height / 2) - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // プレイヤーの攻撃で弾く (メイン武器 + サブ武器)
        const hitboxes = [];
        const mainHitbox = player.getAttackHitbox();
        if (mainHitbox) hitboxes.push(mainHitbox);
        
        if (player.currentSubWeapon) {
            const subHitbox = player.currentSubWeapon.getHitbox(player);
            if (subHitbox) {
                if (Array.isArray(subHitbox)) {
                    hitboxes.push(...subHitbox);
                } else {
                    hitboxes.push(subHitbox);
                }
            }
        }

        for (const attackBox of hitboxes) {
             // 簡易衝突判定
             if (this.x < attackBox.x + attackBox.width &&
                 this.x + 10 > attackBox.x &&
                 this.y < attackBox.y + attackBox.height &&
                 this.y + 10 > attackBox.y) {
                 
                 this.isAlive = false;
                 // キン！ (金属音) - 聞こえやすく専用SE
                 if (typeof audio.playDeflect === 'function') {
                     audio.playDeflect();
                 } else {
                     audio.playSfx(1550, 'square', 0.16, 0.07, 0.82);
                     audio.playNoiseSfx(0.26, 0.06, 4600);
                 }
                 return false;
             }
        }

        if (dist < 25 && player.invincibleTimer <= 0) {
            player.takeDamage(this.damage, {
                sourceX: this.x,
                knockbackX: 6,
                knockbackY: -5
            });
            this.isAlive = false;
        }

        // 画面外（スクロールを考慮）
        const scrollX = window.game ? window.game.scrollX : 0;
        if (this.x < scrollX - 100 || this.x > scrollX + CANVAS_WIDTH + 100) {
            this.isAlive = false;
        }

        return this.isAlive;
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // 残像・発光エフェクト（視認性向上）
        ctx.shadowColor = 'rgba(100, 200, 255, 0.6)';
        ctx.shadowBlur = 8;
        
        const shuriGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
        shuriGrad.addColorStop(0, '#ffffff');
        shuriGrad.addColorStop(0.3, '#bcc6d4');
        shuriGrad.addColorStop(0.7, '#626d7d');
        shuriGrad.addColorStop(1, '#252a33');
        
        ctx.fillStyle = shuriGrad;
        ctx.strokeStyle = '#eef3fc';
        ctx.lineWidth = 0.8;
        
        // 手裏剣の形（少し鋭利に）
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(0, -11); 
            ctx.lineTo(3.5, -2.5);
            ctx.lineTo(0, 4.5);
            ctx.lineTo(-3.5, -2.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        
        // 中心穴
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        
        // 中心のハイライトエッジ
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }
}

// 敵ファクトリー
export function createEnemy(type, x, y, groundY) {
    switch (type) {
        case ENEMY_TYPES.ASHIGARU:
            return new Ashigaru(x, y, type, groundY);
        case ENEMY_TYPES.SAMURAI:
            return new Samurai(x, y, type, groundY);
        case ENEMY_TYPES.BUSHO:
            return new Busho(x, y, type, groundY);
        case ENEMY_TYPES.NINJA:
            return new Ninja(x, y, type, groundY);
        default:
            return new Enemy(x, y, type, groundY);
    }
}
