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
        
        // 状態
        this.isGrounded = true;
        this.facingRight = true;
        this.isAlive = true;
        this.isDying = false; // 死亡演出中フラグ
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        
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
    }
    
    applyDifficultyScaling() {
        // グローバルな game オブジェクト（または初期化時に渡された値）から難易度取得
        const difficulty = window.game ? window.game.difficulty : { damageMult: 1.0, hpMult: 1.0 };
        this.damage = Math.max(1, Math.floor(this.damage * difficulty.damageMult));
        this.maxHp = Math.max(1, Math.floor(this.maxHp * difficulty.hpMult));
        this.hp = this.maxHp;
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

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(footX, footLocalY + 1.15, width * 0.84 + 1.25, 1.5 + width * 0.12, dir * 0.08, 0, Math.PI * 2);
            ctx.fill();
        };

        drawLeg(1, backColor, backWidth, 0.8);
        drawLeg(-1, frontColor, frontWidth, 0);
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

        ctx.fillStyle = '#dfe5ed';
        ctx.strokeStyle = '#9aa6b4';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipLeftX, tipLeftY);
        ctx.lineTo(tipBaseX - ux * 2.2, tipBaseY - uy * 2.2);
        ctx.lineTo(tipRightX, tipRightY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipBaseX + nx * 0.4, tipBaseY + ny * 0.4);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        return { tipX, tipY, tipBaseX, tipBaseY };
    }

    drawDetailedKatana(ctx, {
        handX,
        handY,
        angle,
        length = 32,
        gripLen = 9,
        bladeWidth = 2.4,
        guardSize = 2.3
    }) {
        ctx.save();
        ctx.translate(handX, handY);
        ctx.rotate(angle);

        const gripBack = -gripLen - 1;
        const gripHeight = 3.6;
        ctx.fillStyle = '#2f2218';
        ctx.fillRect(gripBack, -gripHeight * 0.5, gripLen, gripHeight);
        ctx.strokeStyle = '#5a432d';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const tx = gripBack + (gripLen * i) / 4;
            ctx.beginPath();
            ctx.moveTo(tx, -gripHeight * 0.45);
            ctx.lineTo(tx, gripHeight * 0.45);
            ctx.stroke();
        }

        ctx.fillStyle = '#c7a04d';
        ctx.beginPath();
        ctx.ellipse(0.2, 0, guardSize, guardSize * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();

        const bladeStart = 1.2;
        const tipX = length + 1.9;
        const bladeGrad = ctx.createLinearGradient(bladeStart, -bladeWidth, tipX, bladeWidth);
        bladeGrad.addColorStop(0, '#ced5df');
        bladeGrad.addColorStop(0.45, '#f4f7fb');
        bladeGrad.addColorStop(1, '#a8b3c0');
        ctx.fillStyle = bladeGrad;
        ctx.strokeStyle = '#97a3b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bladeStart, -bladeWidth * 0.56);
        ctx.lineTo(length - 2.4, -bladeWidth * 0.58);
        ctx.lineTo(tipX, 0);
        ctx.quadraticCurveTo(length - 8.6, bladeWidth * 0.92, bladeStart, bladeWidth * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(bladeStart + 2.6, -bladeWidth * 0.16);
        ctx.quadraticCurveTo(length * 0.58, -bladeWidth * 0.44, length - 5.8, -bladeWidth * 0.12);
        ctx.stroke();

        ctx.restore();
        return {
            tipX: handX + Math.cos(angle) * tipX,
            tipY: handY + Math.sin(angle) * tipX
        };
    }

    drawDetailedHeavyBlade(ctx, {
        handX,
        handY,
        angle,
        length = 58,
        gripLen = 12
    }) {
        ctx.save();
        ctx.translate(handX, handY);
        ctx.rotate(angle);

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
        const bladeGrad = ctx.createLinearGradient(0, -4.8, bladeEnd, 5.6);
        bladeGrad.addColorStop(0, '#c9d1da');
        bladeGrad.addColorStop(0.42, '#edf3fa');
        bladeGrad.addColorStop(1, '#a0aab7');
        ctx.fillStyle = bladeGrad;
        ctx.strokeStyle = '#8d99a8';
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

        ctx.restore();
        return {
            tipX: handX + Math.cos(angle) * (bladeEnd + 1.2),
            tipY: handY + Math.sin(angle) * (bladeEnd + 1.2)
        };
    }

    applyDesiredVx(targetVx, responsiveness = 0.22) {
        const blend = Math.max(0, Math.min(1, responsiveness));
        this.vx += (targetVx - this.vx) * blend;
        if (Math.abs(targetVx) < 0.05 && Math.abs(this.vx) < 0.05) {
            this.vx = 0;
        }
    }
    
    updateAI(deltaTime, player) {
        const distanceToPlayer = this.getDistanceToPlayer(player);
        const playerDirection = player.x > this.x ? 1 : -1;
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
                if (distanceToPlayer < this.attackRange) {
                    desiredVX = 0;
                    this.state = 'attack';
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
                if (this.stateTimer > 300) { // 300ms溜め
                    this.startAttack();
                    this.state = 'chase';
                    this.stateTimer = 0;
                }
                
                // プレイヤーが離れたら追いかける
                if (distanceToPlayer > this.attackRange * 1.5) {
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
    
    startAttack() {
        this.isAttacking = true;
        this.attackTimer = 300;
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
    
    // ダメージを受ける
    takeDamage(damage, player, attackData) {
        if (!this.isAlive || this.isDying) return null;
        if (this.invincibleTimer > 0) return null;
        
        this.hp -= damage;
        this.hitTimer = 140; // ヒットエフェクト
        this.invincibleTimer = attackData && attackData.isLaunch ? 120 : 80;
        
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
        
        this.renderBody(ctx);

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
        this.speed = 3.0; // 1.5 -> 3.0 倍速
        this.expReward = 10;
        this.moneyReward = 5;
        this.specialGaugeReward = 5; // 3 -> 5
        this.detectionRange = 800; // 画面端から気づく
        this.attackRange = 40;
    }
    
    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const moveBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const stridePhase = this.motionTime * 0.012;
        const lift = Math.max(0, Math.cos(stridePhase)) * (0.9 + moveBlend * 1.5);
        const bodyLean = dir * (0.7 + this.torsoLean * 0.14 + (this.isAttacking ? 0.55 : 0));
        const hipX = centerX - dir * 0.9;
        const hipY = this.y + 42 + this.bob * 0.1;
        const shoulderX = centerX + dir * 2.5 + bodyLean * 0.15;
        const shoulderY = this.y + 24 - lift * 0.35;
        const headX = shoulderX - dir * 0.3;
        const headY = this.y + 15 - lift * 0.2;

        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 1.5, 11, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase: stridePhase,
            runBlend: moveBlend,
            backColor: '#171717',
            frontColor: '#171717',
            backWidth: 3.6,
            frontWidth: 4.6,
            spread: 2.2,
            stepScale: 6.1,
            liftScale: 3.8
        });

        // 胴体
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 8.6;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 10.8, 0, Math.PI * 2);
        ctx.fill();

        // 編み笠
        ctx.fillStyle = '#2a2320';
        ctx.beginPath();
        ctx.moveTo(headX - dir * 1, headY - 16);
        ctx.lineTo(headX - 18, headY - 3);
        ctx.lineTo(headX + 18, headY - 3);
        ctx.closePath();
        ctx.fill();

        // 腕と槍
        let handX = shoulderX + dir * 6.5;
        let handY = shoulderY + 8.2;
        let spearStartX = handX - dir * 4;
        let spearStartY = handY;
        let spearEndX = handX + dir * 48;
        let spearEndY = handY - 5.5;
        let thrustStrength = 0;

        if (this.isAttacking && !this.isDying) {
            const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / 300)));
            const windup = progress < 0.35 ? progress / 0.35 : 1;
            const strike = progress < 0.35 ? 0 : (progress - 0.35) / 0.65;
            thrustStrength = strike;
            handX = shoulderX + dir * (4.8 + windup * 3 + strike * 18);
            handY = shoulderY + 8.8 - windup * 1.6 + strike * 1.2;
            spearStartX = handX - dir * 6;
            spearStartY = handY;
            spearEndX = handX + dir * (42 + strike * 58);
            spearEndY = handY - 3.8 + strike * 0.7;

            // 槍突きの残像
            ctx.strokeStyle = `rgba(150, 232, 255, ${0.2 + strike * 0.45})`;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(spearEndX - dir * (20 + strike * 10), spearEndY + 2);
            ctx.lineTo(spearEndX + dir * (6 + strike * 12), spearEndY + 2);
            ctx.stroke();
        }

        ctx.strokeStyle = '#191919';
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY + 1.5);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.fillStyle = '#202020';
        ctx.beginPath();
        ctx.arc(handX, handY, 3.9, 0, Math.PI * 2);
        ctx.fill();

        this.drawDetailedSpear(ctx, {
            shaftStartX: spearStartX,
            shaftStartY: spearStartY,
            shaftEndX: spearEndX,
            shaftEndY: spearEndY,
            tipLen: 14,
            tipWidth: 7.4,
            tasselSwing: Math.sin(this.motionTime * 0.018) * 2.4 + thrustStrength * 4,
            showTassel: true
        });
    }
}

// 侍（普通）
export class Samurai extends Enemy {
    init() {
        this.width = 40;
        this.height = 60;
        this.hp = 30;
        this.maxHp = 30;
        this.damage = 2;
        this.speed = 4.0; // 2.0 -> 4.0 高速移動
        this.expReward = 25;
        this.moneyReward = 15;
        this.specialGaugeReward = 12; // 8 -> 12
        this.detectionRange = 900; // 画面外からでも気づく
        this.attackRange = 50;
        
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
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const phase = this.motionTime * 0.0125;
        const bodyLean = dir * (1.1 + this.torsoLean * 0.18 + (this.isAttacking ? 0.55 : 0));
        const shoulderX = centerX + dir * 2.7 + bodyLean * 0.14;
        const shoulderY = this.y + 24 + Math.abs(this.bob) * 0.18;
        const hipX = centerX - dir * 1.2;
        const hipY = this.y + 44;
        const headX = shoulderX - dir * 0.5;
        const headY = this.y + 13;

        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 1.5, 13, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase: phase,
            runBlend,
            backColor: '#141414',
            frontColor: '#141414',
            backWidth: 4.4,
            frontWidth: 5.4,
            spread: 2.6,
            stepScale: 7.6,
            liftScale: 4.5
        });

        // 胴体（袴・上半身）
        ctx.fillStyle = '#23262e';
        ctx.beginPath();
        ctx.moveTo(centerX - 10, footY - 0.4);
        ctx.lineTo(centerX + 10, footY - 0.4);
        ctx.lineTo(centerX + 7 - bodyLean * 0.4, this.y + 29);
        ctx.lineTo(centerX - 8 - bodyLean * 0.4, this.y + 29);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 7.8;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭＋兜
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 13.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3b4350';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(headX, headY - 7, 16.5, Math.PI * 0.96, Math.PI * 0.04, true);
        ctx.stroke();

        // 腕と刀
        const attackProgress = this.isAttacking ? Math.max(0, Math.min(1, 1 - (this.attackTimer / 250))) : 0;
        const windup = attackProgress < 0.32 ? attackProgress / 0.32 : 1;
        const slash = attackProgress < 0.32 ? 0 : (attackProgress - 0.32) / 0.68;
        const armAngle = this.isAttacking
            ? (-1.52 + windup * 0.42 + slash * 2.42) * dir
            : (-0.58 + Math.sin(this.motionTime * 0.008) * 0.08) * dir;
        const armLen = this.isAttacking ? 19 : 16.5;
        const handX = shoulderX + Math.cos(armAngle) * armLen;
        const handY = shoulderY + Math.sin(armAngle) * armLen;

        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = 4.8;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.fillStyle = '#23262e';
        ctx.beginPath();
        ctx.arc(handX, handY, 4.2, 0, Math.PI * 2);
        ctx.fill();

        const bladeLen = 33;
        const bladeAngle = armAngle + dir * 0.16;
        this.drawDetailedKatana(ctx, {
            handX,
            handY,
            angle: bladeAngle,
            length: bladeLen,
            gripLen: 8.6,
            bladeWidth: 2.45,
            guardSize: 2.2
        });

        if (this.isAttacking && !this.isDying && slash > 0) {
            const arcStart = bladeAngle - dir * 0.92;
            const arcEnd = bladeAngle + dir * 0.48;
            ctx.strokeStyle = `rgba(255, 126, 126, ${0.3 + slash * 0.42})`;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(shoulderX + dir * 4, shoulderY + 2, 36 + slash * 8, arcStart, arcEnd, dir < 0);
            ctx.stroke();
        }
    }
}

// 武将（中ボス）
export class Busho extends Enemy {
    init() {
        this.width = 50;
        this.height = 75;
        this.hp = 60;
        this.maxHp = 60;
        this.damage = 3;
        this.speed = 1.5;
        this.expReward = 100;
        this.moneyReward = 50;
        this.specialGaugeReward = 40; // 20 -> 40
        this.detectionRange = 600;
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
            const attackInterval = this.isEnraged ? 600 : 1200;
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
                this.moveTimer = 800 + Math.random() * 1200; // タイマーを短くして俊敏に
            }

            if (this.moveType === 'retreat' && dist < 120) {
                // 距離を取る（少し速く）
                desiredVX = -this.speed * 1.2 * directionToPlayer;
            } else if (this.moveType === 'dash') {
                // 素早く近づく
                desiredVX = this.speed * 1.8 * directionToPlayer;
            } else if (dist > 50) {
                desiredVX = this.speed * directionToPlayer;
            } else {
                desiredVX = 0;
                // 密着時は時々ダッシュで裏回り狙い
                if (Math.random() < 0.02) this.moveType = 'dash';
            }
            
            // 時々ジャンプ（プレイヤーがジャンプ中なら頻度アップ）
            const jumpChance = (!player.isGrounded) ? 0.03 : 0.01;
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
                this.attackTimer = 400;
                this.attackCooldown = 600;
                break;
            case 1: // 突進
                this.attackTimer = 600;
                this.attackCooldown = 1000;
                break;
            case 2: // 回転斬り
                this.attackTimer = 500;
                this.attackCooldown = 800;
                break;
        }
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        
        // 突進パターンは移動を伴う
        if (this.attackPattern === 1 && this.attackTimer > 200) {
            this.vx = (this.facingRight ? 1 : -1) * this.speed * 3;
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
        const dir = this.facingRight ? 1 : -1;
        let bladeAngle = (-0.9 + Math.sin(this.motionTime * 0.007) * 0.07) * dir;
        if (!this.isAttacking) return bladeAngle;

        if (this.attackPattern === 0) {
            const wind = attackProgress < 0.34 ? attackProgress / 0.34 : 1;
            const swing = attackProgress < 0.34 ? 0 : (attackProgress - 0.34) / 0.66;
            bladeAngle = (-1.5 + wind * 0.5 + swing * 2.3) * dir;
        } else if (this.attackPattern === 1) {
            bladeAngle = (-0.35 + attackProgress * 0.25) * dir;
        } else {
            const wind = attackProgress < 0.2 ? attackProgress / 0.2 : 1;
            const spin = attackProgress < 0.2 ? 0 : (attackProgress - 0.2) / 0.8;
            bladeAngle = (-1.5 + wind * 0.36 + spin * Math.PI * 1.86) * dir;
        }
        return bladeAngle;
    }

    getWeaponPose(attackProgress = this.getAttackProgress()) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const shoulderX = centerX + dir * 3.6 + this.torsoLean * dir * 0.25;
        const shoulderY = this.y + 30 + Math.abs(this.bob) * 0.2;
        const bladeAngle = this.getBladeAngleForProgress(attackProgress);
        const weaponAngle = bladeAngle + dir * 0.08;
        const leadArmLen = this.isAttacking ? 23.5 : 18.6;
        const handX = shoulderX + Math.cos(bladeAngle) * leadArmLen;
        const handY = shoulderY + Math.sin(bladeAngle) * leadArmLen;
        const bladeLen = this.attackPattern === 1 ? 64 : 58;
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
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed * 1.2)));
        const phase = this.motionTime * 0.0105;
        const shoulderX = centerX + dir * 3.6 + this.torsoLean * dir * 0.25;
        const shoulderY = this.y + 30 + Math.abs(this.bob) * 0.2;
        const hipX = centerX - dir * 1.8;
        const hipY = this.y + 54;
        const headX = shoulderX - dir * 0.6;
        const headY = this.y + 20;
        const mantleWave = Math.sin(this.motionTime * 0.006) * 4.5;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 2, 20, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // マント
        ctx.fillStyle = '#2b0f14';
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

        // 鎧胴
        ctx.fillStyle = '#2a2e36';
        ctx.beginPath();
        ctx.moveTo(centerX - 18, hipY + 1);
        ctx.lineTo(centerX + 18, hipY + 1);
        ctx.lineTo(centerX + 21, this.y + 32);
        ctx.lineTo(centerX - 21, this.y + 32);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#9f8646';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX - 13, this.y + 39);
        ctx.lineTo(centerX + 13, this.y + 39);
        ctx.lineTo(centerX + 11, this.y + 52);
        ctx.lineTo(centerX - 11, this.y + 52);
        ctx.closePath();
        ctx.stroke();

        // 体幹
        ctx.strokeStyle = '#191919';
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭・兜
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#525b67';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(headX, headY - 9, 21, Math.PI * 0.96, Math.PI * 0.04, true);
        ctx.stroke();
        ctx.fillStyle = '#c6a96a';
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

        const clampArmReach = (shoulderPosX, shoulderPosY, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderPosX;
            const dy = targetY - shoulderPosY;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) return { x: targetX, y: targetY };
            const ratio = maxLen / dist;
            return {
                x: shoulderPosX + dx * ratio,
                y: shoulderPosY + dy * ratio
            };
        };

        const weaponAngle = pose.weaponAngle;
        const leadArmLen = this.isAttacking ? 23.5 : 18.6;
        const leadTargetX = pose.handX;
        const leadTargetY = pose.handY;
        const leadHand = clampArmReach(shoulderX, shoulderY, leadTargetX, leadTargetY, 24.8);

        const weaponDirX = Math.cos(weaponAngle);
        const weaponDirY = Math.sin(weaponAngle);
        const supportTargetX = leadHand.x - weaponDirX * 11.5 - weaponDirY * 1.3;
        const supportTargetY = leadHand.y - weaponDirY * 11.5 + weaponDirX * 1.3;
        const supportShoulderX = shoulderX - dir * 4.8;
        const supportShoulderY = shoulderY + 2.8;
        const supportHand = clampArmReach(supportShoulderX, supportShoulderY, supportTargetX, supportTargetY, 25.5);

        // 奥側の腕（支持腕）
        ctx.strokeStyle = '#191919';
        ctx.lineWidth = 5.4;
        ctx.beginPath();
        ctx.moveTo(supportShoulderX, supportShoulderY);
        ctx.lineTo(supportHand.x, supportHand.y);
        ctx.stroke();
        ctx.fillStyle = '#1f232a';
        ctx.beginPath();
        ctx.arc(supportHand.x, supportHand.y, 4.6, 0, Math.PI * 2);
        ctx.fill();

        // 手前側の腕（主動作）
        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(leadHand.x, leadHand.y);
        ctx.stroke();
        ctx.fillStyle = '#21262f';
        ctx.beginPath();
        ctx.arc(leadHand.x, leadHand.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // 大剣
        const bladeLen = this.attackPattern === 1 ? 64 : 58;
        const heavyBlade = this.drawDetailedHeavyBlade(ctx, {
            handX: leadHand.x,
            handY: leadHand.y,
            angle: weaponAngle,
            length: bladeLen,
            gripLen: 12
        });
        const tipX = heavyBlade.tipX;
        const tipY = heavyBlade.tipY;

        if (this.isAttacking) {
            if (this.attackPattern === 2) {
                const spin = attackProgress < 0.2 ? 0 : (attackProgress - 0.2) / 0.8;
                const trailBack = 0.4 + Math.min(0.34, spin * 0.26);
                const trailFront = 0.07;
                ctx.strokeStyle = `rgba(255, 140, 70, ${0.42 + spin * 0.2})`;
                ctx.lineWidth = 11;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(
                    shoulderX + dir * 2,
                    shoulderY + 2,
                    52,
                    bladeAngle - dir * trailBack,
                    bladeAngle + dir * trailFront,
                    dir < 0
                );
                ctx.stroke();
                ctx.strokeStyle = `rgba(255, 229, 188, ${0.26 + spin * 0.2})`;
                ctx.lineWidth = 4.4;
                ctx.beginPath();
                ctx.arc(
                    shoulderX + dir * 2,
                    shoulderY + 2,
                    52,
                    bladeAngle - dir * (trailBack - 0.08),
                    bladeAngle + dir * 0.02,
                    dir < 0
                );
                ctx.stroke();
            } else if (this.attackPattern === 1) {
                const dashAlpha = 0.25 + attackProgress * 0.35;
                ctx.strokeStyle = `rgba(255, 210, 150, ${dashAlpha})`;
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(leadHand.x - dir * 16, leadHand.y + 1);
                ctx.lineTo(tipX + dir * 18, tipY + 1);
                ctx.stroke();
            } else {
                const swing = attackProgress < 0.34 ? 0 : (attackProgress - 0.34) / 0.66;
                if (swing > 0) {
                    ctx.strokeStyle = `rgba(255, 96, 62, ${0.25 + swing * 0.45})`;
                    ctx.lineWidth = 12;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(shoulderX + dir * 2, shoulderY + 2, 52, bladeAngle - dir * 0.8, bladeAngle + dir * 0.48, dir < 0);
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
        this.speed = 3; // 足が速い
        this.expReward = 20;
        this.moneyReward = 10;
        this.specialGaugeReward = 15; // 10 -> 15
        this.detectionRange = 600; // 索敵範囲拡大
        this.attackRange = 400;    // 遠距離攻撃範囲を大幅に拡大
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
        audio.playNoiseSfx(0.1, 0.05, 4000);
    }

    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const phase = this.motionTime * 0.015;
        const lean = dir * (1.5 + this.torsoLean * 0.2 + (this.isAttacking ? 0.6 : 0));
        const shoulderX = centerX + dir * 2.3 + lean * 0.12;
        const shoulderY = this.y + 23 + this.bob * 0.2;
        const hipX = centerX - dir * 0.7;
        const hipY = this.y + 41;
        const headX = shoulderX - dir * 0.3;
        const headY = this.y + 14;

        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 1.2, 11.5, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase: phase,
            runBlend,
            backColor: '#141414',
            frontColor: '#141414',
            backWidth: 3.8,
            frontWidth: 4.5,
            spread: 2.4,
            stepScale: 7.2,
            liftScale: 4.8
        });

        // 胴体
        ctx.strokeStyle = '#171717';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭（覆面）
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 12, 0, Math.PI * 2);
        ctx.fill();

        // ハチガネ
        ctx.strokeStyle = ENEMY_HEADBAND_BASE;
        ctx.lineWidth = 5.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(headX - 11, headY - 1);
        ctx.quadraticCurveTo(headX, headY - 3.8, headX + 11, headY - 0.2);
        ctx.stroke();

        ctx.strokeStyle = ENEMY_HEADBAND_HIGHLIGHT;
        ctx.lineWidth = 3.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(headX - 11, headY - 1);
        ctx.quadraticCurveTo(headX, headY - 3.8, headX + 11, headY - 0.2);
        ctx.stroke();

        // 背中の短刀
        if (!this.isDying) {
            const backKnifeX = shoulderX - dir * 5.5;
            const backKnifeY = shoulderY - 2;
            const backKnifeAngle = Math.atan2(-8, -dir * 18);
            this.drawDetailedKatana(ctx, {
                handX: backKnifeX,
                handY: backKnifeY,
                angle: backKnifeAngle,
                length: 18,
                gripLen: 5.6,
                bladeWidth: 1.55,
                guardSize: 1.6
            });
        }

        // 手裏剣投擲に合わせた腕
        const attackProgress = this.isAttacking ? Math.max(0, Math.min(1, 1 - (this.attackTimer / 400))) : 0;
        const armAngle = this.isAttacking
            ? (-1.28 + attackProgress * 2.18) * dir
            : (-0.52 + Math.sin(this.motionTime * 0.01) * 0.07) * dir;
        const armLen = this.isAttacking ? 16.8 : 14.5;
        const handX = shoulderX + Math.cos(armAngle) * armLen;
        const handY = shoulderY + Math.sin(armAngle) * armLen;
        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.fillStyle = '#1f1f1f';
        ctx.beginPath();
        ctx.arc(handX, handY, 3.6, 0, Math.PI * 2);
        ctx.fill();

        if (this.isAttacking && !this.isDying) {
            this.drawDetailedKatana(ctx, {
                handX,
                handY,
                angle: armAngle + dir * 0.14,
                length: 22,
                gripLen: 6.2,
                bladeWidth: 1.9,
                guardSize: 1.8
            });
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
        
        // 発光エフェクト（視認性向上）
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ccffff'; // 明るい水色
        
        // 手裏剣の形
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(0, -10); // 少しサイズアップ (8 -> 10)
            ctx.lineTo(4, 0);
            ctx.lineTo(0, 4);
            ctx.lineTo(-4, 0);
            ctx.closePath();
            ctx.fill();
        }
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
