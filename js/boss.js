// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { COLORS, GRAVITY, CANVAS_WIDTH } from './constants.js?v=48';
import { Enemy } from './enemy.js?v=48';
import { createSubWeapon } from './weapon.js?v=48';

const ENEMY_HEADBAND_BASE = '#4f2f72';
const ENEMY_HEADBAND_HIGHLIGHT = '#7e58a6';

// ボスベースクラス
class Boss extends Enemy {
    init() {
        this.width = 60;
        this.height = 90;
        this.hp = 200;
        this.maxHp = 200;
        this.damage = 4; // 5から下方修正
        this.speed = 2;
        this.expReward = 300;
        this.moneyReward = 200;
        this.specialGaugeReward = 100; // 50 -> 100
        this.deathDuration = 1250;
        this.deathRiseSpeed = 2.5;
        this.detectionRange = 500;
        this.attackRange = 80;
        
        // ボス専用
        this.phase = 1;
        this.maxPhase = 2;
        this.phaseTransitioning = false;
        this.phaseTransitionDuration = 1000;
        this.phaseTransitionTimer = 0;
        this.phaseAuraDuration = 1400;
        this.phaseAuraTimer = 0;
        this.attackPatterns = [];
        this.currentPattern = 0;
        this.bossName = 'Boss';
        this.weaponDrop = null;
        this.weaponReplica = null;
        this.isEnemy = true;
        this.attackFacingRight = this.facingRight;
        this.targetPlayer = null;
    }
    
    update(deltaTime, player) {
        this.targetPlayer = player || null;
        const deltaMs = deltaTime * 1000;

        if (this.phaseTransitioning) {
            this.phaseTransitionTimer -= deltaMs;
            if (this.phaseTransitionTimer <= 0) {
                this.phaseTransitionTimer = 0;
                this.phaseTransitioning = false;
                this.phase = Math.min(this.maxPhase, this.phase + 1);
                this.phaseAuraTimer = this.phaseAuraDuration;
                this.onPhaseChange();
            }
        }

        if (this.phaseAuraTimer > 0) {
            this.phaseAuraTimer = Math.max(0, this.phaseAuraTimer - deltaMs);
        }

        // フェーズ移行チェック
        if (!this.phaseTransitioning && this.phase < this.maxPhase) {
            const hpRatio = this.hp / this.maxHp;
            if (hpRatio <= 0.5 && this.phase === 1) {
                this.startPhaseTransition();
            }
        }

        const shouldRemove = super.update(deltaTime, player);
        const shouldKeepReplicaEffects = this.weaponReplica &&
            typeof this.weaponReplica.update === 'function' &&
            !this.isAttacking;
        if (!shouldRemove && shouldKeepReplicaEffects) {
            this.weaponReplica.update(deltaTime);
        }
        return shouldRemove;
    }

    updateAI(deltaTime, player) {
        if (!player) return;

        const scrollX = window.game ? window.game.scrollX : 0;
        const screenRight = scrollX + CANVAS_WIDTH;
        const selfCenterX = this.x + this.width / 2;
        const playerCenterX = player.x + player.width / 2;
        const diffX = playerCenterX - selfCenterX;
        const absX = Math.abs(diffX);
        const dirToPlayer = diffX >= 0 ? 1 : -1;

        if (!this.isAttacking && absX > 16) {
            this.facingRight = dirToPlayer > 0;
        }

        if (this.phaseTransitioning) {
            this.applyDesiredVx(0, 0.34);
            return;
        }

        // 画面右からの登場時は確実に戦闘エリアへ侵入
        if (this.x > screenRight - 16) {
            this.facingRight = false;
            this.applyDesiredVx(-Math.max(1.6, this.speed), 0.42);
            return;
        }

        // 攻撃中は向きをロックして振動を防ぐ
        if (this.isAttacking) {
            if (typeof this.attackFacingRight === 'boolean') {
                this.facingRight = this.attackFacingRight;
            }
            if (Math.abs(this.vx) < this.speed * 1.4) {
                this.applyDesiredVx(0, 0.28);
            }
            return;
        }

        let desiredVX = 0;
        if (absX > this.attackRange * 1.35) {
            desiredVX = this.speed * dirToPlayer;
        } else if (absX > this.attackRange * 0.9) {
            desiredVX = this.speed * 0.58 * dirToPlayer;
        }
        this.applyDesiredVx(desiredVX, 0.26);

        if (this.attackCooldown <= 0 && absX <= this.attackRange + 26) {
            this.attackFacingRight = this.facingRight;
            this.startAttack();
            return;
        }

        if (absX > this.attackRange * 1.5) {
            this.tryJump(0.006, -23, 780);
        }
    }
    
    startPhaseTransition() {
        this.phaseTransitioning = true;
        this.phaseTransitionTimer = this.phaseTransitionDuration;
        this.isAttacking = false;
        this.attackCooldown = 2000;
        this.phaseAuraTimer = 0;
        if (this.weaponReplica) {
            this.weaponReplica.isAttacking = false;
            this.weaponReplica.attackTimer = 0;
        }
    }
    
    onPhaseChange() {
        // サブクラスでオーバーライド
        this.speed *= 1.2;
        this.damage += 2;
    }

    setupWeaponReplica(weaponName) {
        this.weaponReplica = weaponName ? createSubWeapon(weaponName) : null;
    }

    startWeaponReplicaAttack(type = undefined) {
        if (!this.weaponReplica || typeof this.weaponReplica.use !== 'function') return false;
        this.weaponReplica.use(this, type);
        this.isAttacking = true;
        this.attackTimer = this.weaponReplica.attackTimer || this.weaponReplica.totalDuration || 0;
        return true;
    }

    updateWeaponReplicaAttack(deltaTime) {
        if (!this.weaponReplica || typeof this.weaponReplica.update !== 'function') {
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) this.isAttacking = false;
            return;
        }
        this.weaponReplica.update(deltaTime);
        this.attackTimer = this.weaponReplica.attackTimer || 0;
        if (!this.weaponReplica.isAttacking) {
            this.isAttacking = false;
        }
    }

    getWeaponReplicaHitbox() {
        if (!this.weaponReplica || typeof this.weaponReplica.getHitbox !== 'function') {
            return null;
        }
        return this.weaponReplica.getHitbox(this);
    }
    
    renderBody(ctx) {
        // サブクラスでオーバーライド
    }
    
    renderPhaseTransition(ctx) {
        // ユーザー要望: フェーズ移行リングは表示しない
        return;
    }

    renderPhaseAura(ctx, centerX, centerY, colorRgb, radius = 60, lineWidth = 10) {
        // ユーザー要望: 常時のリングオーラも表示しない
        return;
    }

    renderPhaseBodyTint(ctx, inset = 8) {
        return;
    }
}

// ステージ1ボス: 槍持ちの侍大将
export class YariTaisho extends Boss {
    init() {
        super.init();
        this.bossName = '槍持ちの侍大将';
        this.weaponDrop = '大槍';
        this.hp = 150;    // 250から大幅に下げ、倒しやすく
        this.maxHp = 150;
        this.attackRange = 135;
        this.attackPatterns = ['thrust'];
        this.setupWeaponReplica('大槍');
    }
    
    startAttack() {
        this.currentPattern = 'thrust';
        this.attackCooldown = this.phase >= 2 ? 520 : 620;
        if (this.startWeaponReplicaAttack()) {
            const dir = this.facingRight ? 1 : -1;
            this.vx = dir * (10 + (this.phase - 1) * 1.8);
            return;
        }
        this.isAttacking = true;
        this.attackTimer = 320;
    }
    
    updateAttack(deltaTime) {
        this.updateWeaponReplicaAttack(deltaTime);
        if (!this.isAttacking && Math.abs(this.vx) < 0.35) this.vx = 0;
    }
    
    getAttackHitbox() {
        return this.getWeaponReplicaHitbox();
    }
    
    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.010;
        const shoulderX = centerX + dir * 4.0 + this.torsoLean * dir * 0.22;
        const shoulderY = this.y + 35 + Math.abs(this.bob) * 0.15;
        const hipX = centerX - dir * 2.0;
        const hipY = this.y + 60;
        const headX = shoulderX - dir * 0.8;
        const headY = this.y + 22;

        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 2, 19, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#2a1013';
        ctx.beginPath();
        ctx.moveTo(centerX - 16, this.y + 36);
        ctx.lineTo(centerX + 16, this.y + 36);
        ctx.lineTo(centerX + 24 + Math.sin(this.motionTime * 0.006) * 4, footY - 2);
        ctx.lineTo(centerX - 24 + Math.cos(this.motionTime * 0.005) * 3, footY - 2);
        ctx.closePath();
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase,
            runBlend,
            backColor: '#181818',
            frontColor: '#181818',
            backWidth: 6,
            frontWidth: 7,
            spread: 3.2,
            stepScale: 9.4,
            liftScale: 5.8
        });

        // 胴体
        ctx.fillStyle = '#292f38';
        ctx.beginPath();
        ctx.moveTo(centerX - 20, hipY + 1);
        ctx.lineTo(centerX + 20, hipY + 1);
        ctx.lineTo(centerX + 23, this.y + 36);
        ctx.lineTo(centerX - 23, this.y + 36);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#b69047';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(centerX - 14, this.y + 45);
        ctx.lineTo(centerX + 14, this.y + 45);
        ctx.lineTo(centerX + 11, this.y + 57);
        ctx.lineTo(centerX - 11, this.y + 57);
        ctx.closePath();
        ctx.stroke();

        // 体幹
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭・兜
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath();
        ctx.arc(headX, headY, 18.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#525c67';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(headX, headY - 9, 22, Math.PI * 0.96, Math.PI * 0.04, true);
        ctx.stroke();
        ctx.strokeStyle = '#d1b366';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(headX, headY - 22, 13, Math.PI * 0.16, Math.PI * 0.84);
        ctx.stroke();
        // 槍（プレイヤーが取得する大槍と同一描画）
        const spear = this.weaponReplica;
        let handX = shoulderX + dir * 10;
        let handY = shoulderY + 9;
        if (spear && spear.isAttacking && typeof spear.getGripAnchors === 'function') {
            const grips = spear.getGripAnchors(this);
            handX = grips.rear.x;
            handY = grips.rear.y;
        }

        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.fillStyle = '#232932';
        ctx.beginPath();
        ctx.arc(handX, handY, 5.3, 0, Math.PI * 2);
        ctx.fill();

        if (spear && spear.isAttacking && typeof spear.render === 'function') {
            spear.render(ctx, this);
        } else {
            const shaftStartX = handX - dir * 4;
            const shaftStartY = handY + 1;
            const shaftEndX = handX + dir * 96;
            const shaftEndY = handY + 0.4;
            ctx.strokeStyle = '#3d2b1f';
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(shaftStartX, shaftStartY);
            ctx.lineTo(shaftEndX, shaftEndY);
            ctx.stroke();

            ctx.fillStyle = '#d32f2f';
            ctx.beginPath();
            ctx.arc(shaftEndX, shaftEndY + 2, 6, 0, Math.PI, false);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(shaftEndX, shaftEndY + 4);
            ctx.lineTo(shaftEndX + dir * 14, shaftEndY + 11);
            ctx.lineTo(shaftEndX + dir * 8, shaftEndY + 8);
            ctx.closePath();
            ctx.fill();

            const tipX = shaftEndX + dir * 22;
            const tipBaseX = shaftEndX + dir * 4;
            const tipBackX = shaftEndX - dir * 2;
            ctx.fillStyle = '#e0e0e0';
            ctx.strokeStyle = '#9e9e9e';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tipX, shaftEndY);
            ctx.lineTo(tipBaseX, shaftEndY - 8);
            ctx.lineTo(tipBackX, shaftEndY);
            ctx.lineTo(tipBaseX, shaftEndY + 8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 240, 210, 0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(handX + dir * 12, handY - 0.6);
            ctx.lineTo(shaftEndX - dir * 10, shaftEndY - 0.6);
            ctx.stroke();
        }

        this.renderPhaseAura(ctx, centerX, this.y + 52, '255, 68, 68', 68, 12);
    }
}

// ステージ2ボス: 二刀流の剣豪
export class NitoryuKengo extends Boss {
    init() {
        super.init();
        this.bossName = '二刀流の剣豪';
        this.weaponDrop = '二刀流';
        this.hp = 200;    // 280から調整
        this.maxHp = 200;
        this.speed = 2.5;
        this.attackRange = 120;
        this.attackPatterns = ['left', 'right', 'combined'];
        this.dualAttackCycle = 0;
        this.dualPatternCycle = ['right', 'left', 'combined', 'left', 'right', 'combined'];
        this.dualPatternIndex = 0;
        this.setupWeaponReplica('二刀流');
    }
    
    startAttack() {
        this.dualAttackCycle++;
        // シーケンス主体で読み合いを作り、フェーズ2で崩しを混ぜる
        let pattern = this.dualPatternCycle[this.dualPatternIndex % this.dualPatternCycle.length];
        this.dualPatternIndex++;
        if (this.phase >= 2 && this.dualAttackCycle % 4 === 0) {
            pattern = 'combined';
        } else if (this.phase >= 2 && Math.random() < 0.18) {
            pattern = Math.random() < 0.5 ? 'left' : 'right';
        }
        this.currentPattern = pattern;

        if (this.startWeaponReplicaAttack(pattern)) {
            this.attackCooldown = pattern === 'combined'
                ? (this.phase >= 2 ? 620 : 700)
                : (this.phase >= 2 ? 260 : 320);
            return;
        }
        this.isAttacking = true;
        this.attackTimer = 320;
        this.attackCooldown = 500;
    }
    
    updateAttack(deltaTime) {
        this.updateWeaponReplicaAttack(deltaTime);
        if (!this.isAttacking && Math.abs(this.vx) < 0.35) this.vx = 0;
    }

    getAttackHitbox() {
        return this.getWeaponReplicaHitbox();
    }
    
    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const phase = this.motionTime * 0.012;
        const shoulderX = centerX + dir * 3.0 + this.torsoLean * dir * 0.2;
        const shoulderY = this.y + 32 + Math.abs(this.bob) * 0.16;
        const hipX = centerX - dir * 1.2;
        const hipY = this.y + 57;
        const headX = shoulderX - dir * 0.5;
        const headY = this.y + 20;

        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 2, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 帯
        const scarfWave = Math.sin(this.motionTime * 0.012) * 8;
        ctx.fillStyle = ENEMY_HEADBAND_BASE;
        ctx.beginPath();
        ctx.moveTo(headX - dir * 8, headY + 2);
        ctx.lineTo(headX - dir * 34, headY - 2 + scarfWave * 0.15);
        ctx.lineTo(headX - dir * 30, headY + 8 + scarfWave * 0.15);
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
            backColor: '#141414',
            frontColor: '#141414',
            backWidth: 5.4,
            frontWidth: 6.4,
            spread: 2.9,
            stepScale: 8.8,
            liftScale: 5.2
        });

        // 胴体
        ctx.strokeStyle = '#171717';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();
        ctx.fillStyle = '#1f2730';
        ctx.beginPath();
        ctx.moveTo(centerX - 18, hipY + 1);
        ctx.lineTo(centerX + 18, hipY + 1);
        ctx.lineTo(centerX + 15, this.y + 35);
        ctx.lineTo(centerX - 16, this.y + 35);
        ctx.closePath();
        ctx.fill();

        // 頭
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ENEMY_HEADBAND_HIGHLIGHT;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(headX - 14, headY - 2);
        ctx.quadraticCurveTo(headX, headY - 6, headX + 14, headY - 1);
        ctx.stroke();
        // 二刀（プレイヤーが取得する二刀と同一描画）
        const dual = this.weaponReplica;
        let rightAngle = (-0.72 + Math.sin(this.motionTime * 0.008) * 0.08) * dir;
        let leftAngle = (-1.14 + Math.sin(this.motionTime * 0.008 + 1.4) * 0.08) * dir;
        if (dual && dual.isAttacking) {
            if (dual.attackType === 'left' && typeof dual.getLeftSwingAngle === 'function') {
                // 自キャラX攻撃に合わせ、前側の手が主動作になるように同期
                rightAngle = dual.getLeftSwingAngle();
                leftAngle = (-1.0 + Math.sin(this.motionTime * 0.008) * 0.06) * dir;
            } else if (dual.attackType === 'combined' && typeof dual.getCombinedSwingProgress === 'function') {
                const p = dual.getCombinedSwingProgress();
                rightAngle = (-1.02 + p * 2.08) * dir;
                leftAngle = (1.06 - p * 2.1) * dir;
            } else if (dual.attackType === 'right') {
                const p = Math.max(0, Math.min(1, dual.attackTimer / 150));
                const start = -Math.PI * 0.75;
                const end = Math.PI * 0.22;
                rightAngle = (start + (end - start) * (1 - p)) * dir;
                leftAngle = (-1.0 + Math.sin(this.motionTime * 0.008) * 0.06) * dir;
            }
        }

        const rightShoulderX = shoulderX + dir * 2.2;
        const rightShoulderY = shoulderY + 1.5;
        const leftShoulderX = shoulderX - dir * 1.7;
        const leftShoulderY = shoulderY + 2.2;
        const rightHandX = rightShoulderX + Math.cos(rightAngle) * 20;
        const rightHandY = rightShoulderY + Math.sin(rightAngle) * 20;
        const leftHandX = leftShoulderX + Math.cos(leftAngle) * 18;
        const leftHandY = leftShoulderY + Math.sin(leftAngle) * 18;

        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(rightShoulderX, rightShoulderY);
        ctx.lineTo(rightHandX, rightHandY);
        ctx.moveTo(leftShoulderX, leftShoulderY);
        ctx.lineTo(leftHandX, leftHandY);
        ctx.stroke();
        ctx.fillStyle = '#212832';
        ctx.beginPath();
        ctx.arc(rightHandX, rightHandY, 4.6, 0, Math.PI * 2);
        ctx.arc(leftHandX, leftHandY, 4.2, 0, Math.PI * 2);
        ctx.fill();

        const drawBlade = (handX, handY, angle, len) => {
            const tipX = handX + Math.cos(angle + dir * 0.1) * len;
            const tipY = handY + Math.sin(angle + dir * 0.1) * len;
            ctx.strokeStyle = '#dce2ea';
            ctx.lineWidth = 3.7;
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            return { tipX, tipY };
        };
        drawBlade(rightHandX, rightHandY, rightAngle, 44);
        drawBlade(leftHandX, leftHandY, leftAngle, 40);

        if (dual && dual.isAttacking && typeof dual.render === 'function') {
            dual.render(ctx, this);
        }

        this.renderPhaseBodyTint(ctx, 10);
    }
}

// ステージ3ボス: 鎖鎌使いの暗殺者
export class KusarigamaAssassin extends Boss {
    init() {
        super.init();
        this.bossName = '鎖鎌使いの暗殺者';
        this.weaponDrop = '鎖鎌';
        this.hp = 250;    // 220から少し強化
        this.maxHp = 250;
        this.speed = 3;
        this.attackRange = 225;
        this.attackPatterns = ['kusa'];
        this.chainX = 0;
        this.chainY = 0;
        this.setupWeaponReplica('鎖鎌');
    }
    
    startAttack() {
        this.currentPattern = 'kusa';
        this.attackCooldown = this.phase >= 2 ? 720 : 900;
        if (this.startWeaponReplicaAttack()) return;
        this.isAttacking = true;
        this.attackTimer = 560;
    }

    updateAttack(deltaTime) {
        this.updateWeaponReplicaAttack(deltaTime);
        if (!this.isAttacking && Math.abs(this.vx) < 0.35) this.vx = 0;
    }

    getAttackHitbox() {
        return this.getWeaponReplicaHitbox();
    }
    
    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.014;
        const shoulderX = centerX + dir * 2.2 + this.torsoLean * dir * 0.2;
        const shoulderY = this.y + 31;
        const hipX = centerX - dir * 0.9;
        const hipY = this.y + 56;
        const headX = shoulderX - dir * 0.2;
        const headY = this.y + 20;

        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.23)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 1.5, 16, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase,
            runBlend,
            backColor: '#151515',
            frontColor: '#151515',
            backWidth: 5,
            frontWidth: 5.8,
            spread: 2.6,
            stepScale: 8.1,
            liftScale: 5.1
        });

        // 胴体
        ctx.strokeStyle = '#181818';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();
        ctx.fillStyle = '#1f1f24';
        ctx.beginPath();
        ctx.moveTo(centerX - 17, hipY + 0.4);
        ctx.lineTo(centerX + 17, hipY + 0.4);
        ctx.lineTo(centerX + 14, this.y + 34);
        ctx.lineTo(centerX - 14, this.y + 34);
        ctx.closePath();
        ctx.fill();

        // 頭・面頬
        ctx.fillStyle = '#171717';
        ctx.beginPath();
        ctx.arc(headX, headY, 15.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3d3f49';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(headX - 12, headY - 2);
        ctx.quadraticCurveTo(headX, headY - 6, headX + 12, headY - 2);
        ctx.stroke();
        // 鎖鎌（プレイヤーが取得する鎖鎌と同一描画）
        const kusa = this.weaponReplica;
        let handX = shoulderX + Math.cos((-0.58 + Math.sin(this.motionTime * 0.01) * 0.08) * dir) * 20;
        let handY = shoulderY + Math.sin((-0.58 + Math.sin(this.motionTime * 0.01) * 0.08) * dir) * 20;
        if (kusa && kusa.isAttacking && typeof kusa.getHandAnchor === 'function') {
            const handAnchor = kusa.getHandAnchor(this);
            handX = handAnchor.x;
            handY = handAnchor.y;
        }

        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.fillStyle = '#212126';
        ctx.beginPath();
        ctx.arc(handX, handY, 4.6, 0, Math.PI * 2);
        ctx.fill();

        if (kusa && kusa.isAttacking && typeof kusa.render === 'function') {
            kusa.render(ctx, this);
        } else {
            const idleAngle = (-0.4 + Math.sin(this.motionTime * 0.01) * 0.05) * dir;
            const tipX = handX + Math.cos(idleAngle) * 30;
            const tipY = handY + Math.sin(idleAngle) * 30;
            const chainDirX = Math.cos(idleAngle);
            const chainDirY = Math.sin(idleAngle);

            const chainGradient = ctx.createLinearGradient(handX, handY, tipX, tipY);
            chainGradient.addColorStop(0, 'rgba(170, 176, 188, 0.95)');
            chainGradient.addColorStop(0.55, 'rgba(128, 136, 150, 0.98)');
            chainGradient.addColorStop(1, 'rgba(92, 102, 118, 0.95)');
            ctx.strokeStyle = chainGradient;
            ctx.lineWidth = 3.1;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(230, 245, 255, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(handX + chainDirY * 1.2, handY - chainDirX * 1.2);
            ctx.lineTo(tipX + chainDirY * 1.2, tipY - chainDirX * 1.2);
            ctx.stroke();

            ctx.save();
            ctx.translate(tipX, tipY);
            ctx.rotate(idleAngle + dir * Math.PI * 0.28);
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
        }

        this.renderPhaseBodyTint(ctx, 9);
    }
}

// ステージ4ボス: 大太刀の武将
export class OdachiBusho extends Boss {
    init() {
        super.init();
        this.bossName = '大太刀の武将';
        this.weaponDrop = '大太刀';
        this.hp = 350;    // 据え置き
        this.maxHp = 350;
        this.damage = 6;
        this.speed = 1.6;
        this.width = 70;
        this.height = 100;
        this.attackRange = 120;
        this.attackPatterns = ['odachi'];
        this.setupWeaponReplica('大太刀');
    }
    
    startAttack() {
        this.currentPattern = 'odachi';
        this.attackCooldown = this.phase >= 2 ? 980 : 1150;
        if (this.startWeaponReplicaAttack()) return;
        this.isAttacking = true;
        this.attackTimer = 760;
    }
    
    getAttackHitbox() {
        return this.getWeaponReplicaHitbox();
    }

    updateAttack(deltaTime) {
        this.updateWeaponReplicaAttack(deltaTime);
        if (!this.isAttacking && Math.abs(this.vx) < 0.35) this.vx = 0;
    }
    
    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.01;
        const shoulderX = centerX + dir * 4.4 + this.torsoLean * dir * 0.24;
        const shoulderY = this.y + 37;
        const hipX = centerX - dir * 2.3;
        const hipY = this.y + 68;
        const headX = shoulderX - dir * 0.7;
        const headY = this.y + 26;

        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.31)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 2.5, 23, 6.2, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase,
            runBlend,
            backColor: '#171717',
            frontColor: '#171717',
            backWidth: 7.2,
            frontWidth: 8.4,
            spread: 3.5,
            stepScale: 10.2,
            liftScale: 6.2
        });

        // 胴体
        ctx.fillStyle = '#2b1f23';
        ctx.beginPath();
        ctx.moveTo(centerX - 25, hipY + 1);
        ctx.lineTo(centerX + 25, hipY + 1);
        ctx.lineTo(centerX + 28, this.y + 40);
        ctx.lineTo(centerX - 28, this.y + 40);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#8d5a3a';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(centerX - 16, this.y + 50);
        ctx.lineTo(centerX + 16, this.y + 50);
        ctx.lineTo(centerX + 14, this.y + 64);
        ctx.lineTo(centerX - 14, this.y + 64);
        ctx.closePath();
        ctx.stroke();

        // 体幹
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 13;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭・兜
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5e4a42';
        ctx.lineWidth = 4.8;
        ctx.beginPath();
        ctx.arc(headX, headY - 10, 23, Math.PI * 0.95, Math.PI * 0.05, true);
        ctx.stroke();
        ctx.fillStyle = '#7f3d2a';
        ctx.beginPath();
        ctx.moveTo(headX - 13, headY - 26);
        ctx.lineTo(headX - 28, headY - 45);
        ctx.lineTo(headX - 11, headY - 37);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(headX + 10, headY - 25);
        ctx.lineTo(headX + 27, headY - 43);
        ctx.lineTo(headX + 11, headY - 36);
        ctx.closePath();
        ctx.fill();
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

        const odachi = this.weaponReplica;
        let gripRotation = (-0.9 + Math.sin(this.motionTime * 0.007) * 0.05) * dir;
        let handX = shoulderX + Math.cos((-0.85 + Math.sin(this.motionTime * 0.007) * 0.06) * dir) * 24;
        let handY = shoulderY + Math.sin((-0.85 + Math.sin(this.motionTime * 0.007) * 0.06) * dir) * 24;
        if (odachi && odachi.isAttacking && typeof odachi.getHandAnchor === 'function') {
            const anchor = odachi.getHandAnchor(this);
            handX = anchor.x;
            handY = anchor.y;
            if (typeof anchor.rotation === 'number') {
                gripRotation = anchor.rotation;
            }
        }

        const supportShoulderX = shoulderX - dir * 4.8;
        const supportShoulderY = shoulderY + 2.8;
        const weaponDirX = Math.cos(gripRotation);
        const weaponDirY = Math.sin(gripRotation);
        const supportTargetX = handX - weaponDirX * 12.5 - weaponDirY * 1.4;
        const supportTargetY = handY - weaponDirY * 12.5 + weaponDirX * 1.4;
        const supportHand = clampArmReach(
            supportShoulderX,
            supportShoulderY,
            supportTargetX,
            supportTargetY,
            29
        );

        // 奥側の腕（支持腕）
        ctx.strokeStyle = '#181818';
        ctx.lineWidth = 6.2;
        ctx.beginPath();
        ctx.moveTo(supportShoulderX, supportShoulderY);
        ctx.lineTo(supportHand.x, supportHand.y);
        ctx.stroke();
        ctx.fillStyle = '#231f24';
        ctx.beginPath();
        ctx.arc(supportHand.x, supportHand.y, 5.4, 0, Math.PI * 2);
        ctx.fill();

        // 手前側の腕（主動作）
        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = 7.2;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.fillStyle = '#272129';
        ctx.beginPath();
        ctx.arc(handX, handY, 5.8, 0, Math.PI * 2);
        ctx.fill();

        if (odachi && odachi.isAttacking && typeof odachi.render === 'function') {
            odachi.render(ctx, this);
        } else {
            ctx.save();
            ctx.translate(handX, handY);
            ctx.rotate(gripRotation);

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

            ctx.fillStyle = '#d4b260';
            ctx.beginPath();
            ctx.moveTo(16.5, -5.4);
            ctx.quadraticCurveTo(20.8, -7.2, 23.6, -1.1);
            ctx.quadraticCurveTo(21.2, 4.8, 16.2, 4.6);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#a98331';
            ctx.fillRect(13.2, -4.2, 2.4, 8.4);

            const bladeStart = 22;
            const bladeEnd = 112;
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

            ctx.fillStyle = 'rgba(214, 226, 238, 0.9)';
            ctx.beginPath();
            ctx.moveTo(bladeEnd - 23, -8.6);
            ctx.quadraticCurveTo(bladeEnd - 10, -9.8, bladeEnd + 2.8, -2.5);
            ctx.quadraticCurveTo(bladeEnd - 9.5, -4.5, bladeEnd - 20, -4.2);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.05;
            ctx.beginPath();
            ctx.moveTo(bladeStart + 8, -2.9);
            ctx.quadraticCurveTo(bladeStart + 58, -5.9, bladeEnd - 14, -1.3);
            ctx.stroke();

            ctx.restore();
        }

        this.renderPhaseBodyTint(ctx, 10);
    }
}

// ステージ5ボス: 将軍（ラスボス）
export class Shogun extends Boss {
    init() {
        super.init();
        this.bossName = '将軍';
        this.weaponDrop = null;
        this.hp = 600;    // 500から強化
        this.maxHp = 600;
        this.damage = 8;
        this.speed = 2.2;
        this.width = 80;
        this.height = 110;
        this.attackRange = 120;
        this.maxPhase = 3;
        this.attackDuration = 500;
        this.attackFlags = Object.create(null);
        
        // 全ボスの技を使用可能
        this.attackPatterns = [
            'thrust', 'sweep',           // 槍
            'double', 'dash',             // 二刀
            'throw',                      // 鎖鎌
            'heavy', 'shockwave',         // 大太刀
            'shadow_step',                // 瞬歩
            'sorcery_volley',             // 妖術連射
            'arcane_rush',                // 妖術瞬閃
            'arcane_burst', 'void_pillars', // 妖術
            'ultimate'                    // 固有技
        ];
        this.patternHistory = [];
        this.phaseVisualPulse = 0;
    }
    
    onPhaseChange() {
        super.onPhaseChange();
        // フェーズごとに使える技が増える
        if (this.phase === 3) {
            this.speed *= 1.3;
        }
        this.phaseVisualPulse = 1.0;
    }

    pickPattern(availablePatterns) {
        const recent = this.patternHistory.slice(-2);
        let candidates = availablePatterns.filter(p => !recent.includes(p));
        if (candidates.length === 0) candidates = availablePatterns.slice();

        // 終盤は妖術の比率を引き上げる
        const hpRatio = this.hp / this.maxHp;
        if (this.phase >= 3 && hpRatio <= 0.35) {
            candidates.push('arcane_rush', 'void_pillars', 'ultimate');
        }

        const pattern = candidates[Math.floor(Math.random() * candidates.length)];
        this.patternHistory.push(pattern);
        if (this.patternHistory.length > 6) this.patternHistory.shift();
        return pattern;
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackFlags = Object.create(null);
        this.attackFacingRight = this.facingRight;
        
        // フェーズに応じて使える技が変わる
        let availablePatterns;
        if (this.phase === 1) {
            availablePatterns = ['thrust', 'sweep', 'double', 'dash'];
        } else if (this.phase === 2) {
            availablePatterns = ['thrust', 'double', 'dash', 'throw', 'heavy', 'shockwave', 'arcane_burst', 'shadow_step', 'arcane_rush'];
        } else {
            availablePatterns = [
                'thrust', 'double', 'dash', 'throw', 'heavy', 'shockwave', 'shadow_step',
                'arcane_burst', 'arcane_burst', 'sorcery_volley', 'void_pillars', 'void_pillars', 'arcane_rush',
                'ultimate'
            ];
        }
        
        const pattern = this.pickPattern(availablePatterns);
        this.currentPattern = pattern;
        
        switch (pattern) {
            case 'arcane_burst':
                this.attackDuration = 1100;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 1500;
                break;
            case 'void_pillars':
                this.attackDuration = 1250;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 1700;
                break;
            case 'ultimate':
                this.attackDuration = 1300;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 2000;
                break;
            case 'sorcery_volley':
                this.attackDuration = 1500;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 1750;
                break;
            case 'shadow_step':
                this.attackDuration = 900;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 1100;
                break;
            case 'arcane_rush':
                this.attackDuration = 980;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 1220;
                break;
            case 'dash':
                this.attackDuration = 620;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 820;
                break;
            case 'shockwave':
                this.attackDuration = 760;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 960;
                break;
            default:
                this.attackDuration = 560;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 720;
        }
    }

    updateAttack(deltaTime) {
        const player = this.targetPlayer;
        const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / Math.max(1, this.attackDuration))));

        // 攻撃中の向きを固定してブルブルを抑える
        this.facingRight = !!this.attackFacingRight;
        const dir = this.facingRight ? 1 : -1;

        switch (this.currentPattern) {
            case 'thrust':
                if (!this.attackFlags.thrustDash) {
                    this.vx = dir * this.speed * 2.5;
                    this.attackFlags.thrustDash = true;
                } else if (progress > 0.42) {
                    this.vx *= 0.82;
                }
                break;
            case 'dash':
                if (!this.attackFlags.highDash) {
                    this.vx = dir * this.speed * 3.6;
                    this.attackFlags.highDash = true;
                } else if (progress > 0.6) {
                    this.vx *= 0.8;
                }
                break;
            case 'arcane_burst':
                this.vx *= 0.72;
                if (player && progress >= 0.28 && !this.attackFlags.burstA) {
                    this.spawnArcaneBurst(player, 1);
                    this.attackFlags.burstA = true;
                }
                if (player && progress >= 0.58 && !this.attackFlags.burstB) {
                    this.spawnArcaneBurst(player, this.phase >= 3 ? 3 : 2);
                    this.attackFlags.burstB = true;
                }
                break;
            case 'sorcery_volley':
                this.vx *= 0.64;
                if (player && progress >= 0.18 && !this.attackFlags.volleyA) {
                    this.spawnArcaneBurst(player, 2);
                    this.attackFlags.volleyA = true;
                }
                if (player && progress >= 0.42 && !this.attackFlags.volleyB) {
                    this.spawnArcaneBurst(player, 3);
                    this.attackFlags.volleyB = true;
                }
                if (player && progress >= 0.66 && !this.attackFlags.volleyC) {
                    this.spawnArcaneBurst(player, 4);
                    this.attackFlags.volleyC = true;
                }
                if (player && progress >= 0.78 && !this.attackFlags.volleyPillar) {
                    this.spawnVoidPillars(player, true);
                    this.attackFlags.volleyPillar = true;
                }
                break;
            case 'void_pillars':
                this.vx *= 0.66;
                if (player && progress >= 0.24 && !this.attackFlags.pillarA) {
                    this.spawnVoidPillars(player, false);
                    this.attackFlags.pillarA = true;
                }
                if (player && progress >= 0.62 && !this.attackFlags.pillarB) {
                    this.spawnVoidPillars(player, true);
                    this.attackFlags.pillarB = true;
                }
                break;
            case 'ultimate':
                this.vx *= 0.52;
                if (player && progress >= 0.18 && !this.attackFlags.ultBurstA) {
                    this.spawnArcaneBurst(player, 3);
                    this.attackFlags.ultBurstA = true;
                }
                if (player && progress >= 0.48 && !this.attackFlags.ultPillar) {
                    this.spawnVoidPillars(player, true);
                    this.attackFlags.ultPillar = true;
                }
                if (player && progress >= 0.74 && !this.attackFlags.ultBurstB) {
                    this.spawnArcaneBurst(player, 4);
                    this.attackFlags.ultBurstB = true;
                }
                break;
            case 'shadow_step':
                this.vx *= 0.58;
                if (player && progress >= 0.24 && !this.attackFlags.stepWarp) {
                    const playerCenterX = player.x + player.width / 2;
                    const warpDir = player.facingRight ? -1 : 1;
                    this.x = playerCenterX + warpDir * 72 - this.width / 2;
                    this.y = this.groundY - this.height;
                    this.facingRight = warpDir < 0;
                    this.attackFacingRight = this.facingRight;
                    this.vx = (this.facingRight ? 1 : -1) * this.speed * 3.2;
                    this.attackFlags.stepWarp = true;
                } else if (this.attackFlags.stepWarp && progress > 0.38) {
                    this.vx *= 0.78;
                }
                if (player && progress >= 0.58 && !this.attackFlags.stepBurst) {
                    this.spawnArcaneBurst(player, this.phase >= 3 ? 3 : 2);
                    this.attackFlags.stepBurst = true;
                }
                break;
            case 'arcane_rush':
                this.vx *= 0.62;
                if (player && progress >= 0.2 && !this.attackFlags.rushWarp) {
                    const playerCenterX = player.x + player.width / 2;
                    const backDir = player.facingRight ? -1 : 1;
                    this.x = playerCenterX + backDir * 84 - this.width / 2;
                    this.y = this.groundY - this.height;
                    this.facingRight = backDir < 0;
                    this.attackFacingRight = this.facingRight;
                    this.vx = (this.facingRight ? 1 : -1) * this.speed * 4.2;
                    this.attackFlags.rushWarp = true;
                } else if (this.attackFlags.rushWarp && progress > 0.42) {
                    this.vx *= 0.82;
                }
                if (player && progress >= 0.36 && !this.attackFlags.rushBurstA) {
                    this.spawnArcaneBurst(player, this.phase >= 3 ? 3 : 2);
                    this.attackFlags.rushBurstA = true;
                }
                if (player && progress >= 0.7 && !this.attackFlags.rushBurstB) {
                    this.spawnArcaneBurst(player, this.phase >= 3 ? 4 : 3);
                    this.attackFlags.rushBurstB = true;
                }
                break;
            default:
                this.vx *= 0.76;
                break;
        }

        this.attackTimer -= deltaTime * 1000;
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.attackTimer = 0;
            this.vx *= 0.55;
        }
    }

    getAttackHitbox() {
        const hitboxes = [];
        const dir = this.facingRight ? 1 : -1;
        const progress = this.isAttacking
            ? Math.max(0, Math.min(1, 1 - (this.attackTimer / Math.max(1, this.attackDuration))))
            : 0;

        if (this.isAttacking) {
            switch (this.currentPattern) {
                case 'thrust':
                    hitboxes.push({
                        x: this.x + (dir > 0 ? this.width - 4 : -90),
                        y: this.y + 24,
                        width: 90,
                        height: 34
                    });
                    break;
                case 'sweep':
                case 'double':
                    hitboxes.push({
                        x: this.x - 34,
                        y: this.y + 16,
                        width: this.width + 68,
                        height: this.height - 24
                    });
                    break;
                case 'dash':
                case 'shadow_step':
                    hitboxes.push({
                        x: this.x - 12,
                        y: this.y + 10,
                        width: this.width + 24,
                        height: this.height - 12
                    });
                    break;
                case 'arcane_rush':
                    hitboxes.push({
                        x: this.x - 16,
                        y: this.y + 8,
                        width: this.width + 32,
                        height: this.height - 10
                    });
                    break;
                case 'throw':
                    hitboxes.push({
                        x: this.x + (dir > 0 ? this.width - 12 : -68),
                        y: this.y + 14,
                        width: 68,
                        height: this.height - 26
                    });
                    break;
                case 'heavy':
                    hitboxes.push({
                        x: this.x + (dir > 0 ? this.width - 18 : -102),
                        y: this.y + 4,
                        width: 102,
                        height: this.height - 12
                    });
                    break;
                case 'shockwave':
                    if (progress > 0.44) {
                        hitboxes.push({
                            x: this.x - 180,
                            y: this.groundY - 30,
                            width: this.width + 360,
                            height: 34
                        });
                    }
                    break;
                case 'ultimate':
                    hitboxes.push({
                        x: this.x - 78,
                        y: this.y - 28,
                        width: this.width + 156,
                        height: this.height + 72
                    });
                    break;
                case 'sorcery_volley':
                    hitboxes.push({
                        x: this.x - 30,
                        y: this.y - 16,
                        width: this.width + 60,
                        height: this.height + 20
                    });
                    break;
                default:
                    break;
            }
        }

        for (const projectile of this.projectiles) {
            if (!projectile || typeof projectile.getHitbox !== 'function') continue;
            const hb = projectile.getHitbox();
            if (!hb) continue;
            if (Array.isArray(hb)) hitboxes.push(...hb);
            else hitboxes.push(hb);
        }

        return hitboxes.length > 0 ? hitboxes : null;
    }

    spawnArcaneBurst(player, wave = 1) {
        const originX = this.x + this.width / 2 + (this.facingRight ? 22 : -22);
        const originY = this.y + 36;
        const playerX = player.x + player.width / 2;
        const playerY = player.y + player.height * 0.45;
        const count = 2 + wave;

        for (let i = 0; i < count; i++) {
            const spread = (i - (count - 1) / 2) * (0.16 + wave * 0.02);
            const targetX = playerX + spread * 120;
            const targetY = playerY - Math.abs(spread) * 36;
            const dx = targetX - originX;
            const dy = targetY - originY;
            const len = Math.hypot(dx, dy) || 1;
            const speed = 7.8 + wave * 0.35;
            this.projectiles.push(new ShogunArcaneBolt(
                originX,
                originY,
                (dx / len) * speed,
                (dy / len) * speed,
                this.damage + wave
            ));
        }
    }

    spawnVoidPillars(player, wide = false) {
        const playerX = player.x + player.width / 2;
        const baseOffsets = wide ? [-165, -82, 0, 82, 165] : [-110, 0, 110];
        const spawnDelay = wide ? 210 : 260;
        const damage = this.damage + (wide ? 3 : 2);

        for (let i = 0; i < baseOffsets.length; i++) {
            const jitter = (Math.random() - 0.5) * 20;
            const x = playerX + baseOffsets[i] + jitter;
            this.projectiles.push(new ShogunVoidPillar(
                x,
                this.groundY,
                damage,
                spawnDelay + i * 70,
                wide ? 420 : 340
            ));
        }
    }
    
    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        this.phaseVisualPulse = Math.max(0, this.phaseVisualPulse - 0.012);
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.0095;
        const shoulderX = centerX + dir * 5.0 + this.torsoLean * dir * 0.22;
        const shoulderY = this.y + 40 + Math.abs(this.bob) * 0.18;
        const hipX = centerX - dir * 2.6;
        const hipY = this.y + 73;
        const headX = shoulderX - dir * 0.8;
        const headY = this.y + 29;

        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 3, 26, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX,
            hipX,
            hipY,
            footY,
            dir,
            gaitPhase,
            runBlend,
            backColor: '#171717',
            frontColor: '#171717',
            backWidth: 8,
            frontWidth: 9,
            spread: 3.8,
            stepScale: 11.2,
            liftScale: 6.8
        });

        // 胴体（将軍鎧）
        ctx.fillStyle = '#3a3128';
        ctx.beginPath();
        ctx.moveTo(centerX - 30, hipY + 1);
        ctx.lineTo(centerX + 30, hipY + 1);
        ctx.lineTo(centerX + 34, this.y + 45);
        ctx.lineTo(centerX - 34, this.y + 45);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#c29b3f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX - 20, this.y + 56);
        ctx.lineTo(centerX + 20, this.y + 56);
        ctx.lineTo(centerX + 17, this.y + 69);
        ctx.lineTo(centerX - 17, this.y + 69);
        ctx.closePath();
        ctx.stroke();

        if (this.phase >= 2) {
            const pulse = 0.26 + Math.sin(this.motionTime * 0.012) * 0.1 + this.phaseVisualPulse * 0.28;
            ctx.strokeStyle = `rgba(196, 122, 255, ${Math.max(0.18, pulse)})`;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(centerX - 21, this.y + 50);
            ctx.lineTo(centerX + 21, this.y + 50);
            ctx.moveTo(centerX - 24, this.y + 62);
            ctx.lineTo(centerX + 24, this.y + 62);
            ctx.stroke();
        }

        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭・兜
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7b6a55';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(headX, headY - 11, 25, Math.PI * 0.95, Math.PI * 0.05, true);
        ctx.stroke();
        ctx.strokeStyle = '#ffd76a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(headX, headY - 27, 16, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();

        if (this.phase >= 3) {
            const auraAlpha = 0.2 + Math.sin(this.motionTime * 0.014) * 0.08 + this.phaseVisualPulse * 0.24;
            ctx.fillStyle = `rgba(132, 90, 255, ${Math.max(0.12, auraAlpha)})`;
            ctx.beginPath();
            ctx.moveTo(centerX - 42, this.y + 52);
            ctx.quadraticCurveTo(centerX - 58, this.y + 78, centerX - 34, footY - 6);
            ctx.lineTo(centerX + 34, footY - 6);
            ctx.quadraticCurveTo(centerX + 58, this.y + 78, centerX + 42, this.y + 52);
            ctx.closePath();
            ctx.fill();
        }
        // 武器（覇王太刀）
        const duration = this.attackDuration || (this.currentPattern === 'ultimate' ? 1200 : 500);
        const progress = this.isAttacking ? Math.max(0, Math.min(1, 1 - (this.attackTimer / duration))) : 0;
        let bladeAngle = (-0.72 + Math.sin(this.motionTime * 0.007) * 0.05) * dir;
        if (this.isAttacking) {
            if (this.currentPattern === 'ultimate') {
                bladeAngle = progress * Math.PI * 2.2 * dir;
            } else if (this.currentPattern === 'arcane_burst') {
                bladeAngle = (-Math.PI * 0.53 + Math.sin(progress * Math.PI * 4) * 0.17) * dir;
            } else if (this.currentPattern === 'void_pillars') {
                bladeAngle = (-Math.PI * 0.28 + Math.sin(progress * Math.PI * 3.2) * 0.13) * dir;
            } else {
                const wind = progress < 0.3 ? progress / 0.3 : 1;
                const swing = progress < 0.3 ? 0 : (progress - 0.3) / 0.7;
                bladeAngle = (-1.42 + wind * 0.55 + swing * 2.25) * dir;
            }
        }

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

        const leadShoulderX = shoulderX + dir * 0.9;
        const leadShoulderY = shoulderY + 0.4;
        const leadTargetX = shoulderX + Math.cos(bladeAngle) * 26;
        const leadTargetY = shoulderY + Math.sin(bladeAngle) * 26;
        const leadHand = clampArmReach(leadShoulderX, leadShoulderY, leadTargetX, leadTargetY, 29);

        const weaponAngle = bladeAngle + dir * 0.07;
        const weaponDirX = Math.cos(weaponAngle);
        const weaponDirY = Math.sin(weaponAngle);
        const supportShoulderX = shoulderX - dir * 5.2;
        const supportShoulderY = shoulderY + 3.3;
        const supportTargetX = leadHand.x - weaponDirX * 13.5 - weaponDirY * 1.6;
        const supportTargetY = leadHand.y - weaponDirY * 13.5 + weaponDirX * 1.6;
        const supportHand = clampArmReach(supportShoulderX, supportShoulderY, supportTargetX, supportTargetY, 30);

        // 奥側の腕（支持腕）
        ctx.strokeStyle = '#171717';
        ctx.lineWidth = 6.6;
        ctx.beginPath();
        ctx.moveTo(supportShoulderX, supportShoulderY);
        ctx.lineTo(supportHand.x, supportHand.y);
        ctx.stroke();
        ctx.fillStyle = '#2c271f';
        ctx.beginPath();
        ctx.arc(supportHand.x, supportHand.y, 5.2, 0, Math.PI * 2);
        ctx.fill();

        const bladeTipX = leadHand.x + Math.cos(weaponAngle) * 116;
        const bladeTipY = leadHand.y + Math.sin(weaponAngle) * 116;
        ctx.strokeStyle = '#e7cf86';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(leadHand.x, leadHand.y);
        ctx.lineTo(bladeTipX, bladeTipY);
        ctx.stroke();

        // 手前側の腕（主動作）
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 7.5;
        ctx.beginPath();
        ctx.moveTo(leadShoulderX, leadShoulderY);
        ctx.lineTo(leadHand.x, leadHand.y);
        ctx.stroke();
        ctx.fillStyle = '#322b23';
        ctx.beginPath();
        ctx.arc(leadHand.x, leadHand.y, 6, 0, Math.PI * 2);
        ctx.fill();

        if (this.isAttacking && this.currentPattern === 'ultimate') {
            ctx.strokeStyle = `rgba(255, 214, 106, ${0.45 * (1 - progress)})`;
            ctx.lineWidth = 6;
            for (let i = 0; i < 10; i++) {
                const angle = i * (Math.PI * 2 / 10) + progress * Math.PI;
                ctx.beginPath();
                ctx.moveTo(centerX, this.y + 64);
                ctx.lineTo(centerX + Math.cos(angle) * 150 * progress, this.y + 64 + Math.sin(angle) * 150 * progress);
                ctx.stroke();
            }
        } else if (
            this.isAttacking &&
            this.currentPattern !== 'arcane_burst' &&
            this.currentPattern !== 'void_pillars' &&
            this.currentPattern !== 'arcane_rush'
        ) {
            ctx.strokeStyle = `rgba(255, 178, 96, ${0.28 + progress * 0.35})`;
            ctx.lineWidth = 14;
            ctx.lineCap = 'round';
            const trailRadius = 108;
            ctx.beginPath();
            ctx.arc(
                leadHand.x,
                leadHand.y,
                trailRadius,
                weaponAngle - dir * 0.62,
                weaponAngle + dir * 0.28,
                dir < 0
            );
            ctx.stroke();
        }

        if (this.isAttacking && this.currentPattern === 'arcane_rush') {
            const rushAlpha = 0.24 + (1 - progress) * 0.35;
            ctx.strokeStyle = `rgba(147, 219, 255, ${rushAlpha})`;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(centerX - dir * 56, this.y + 60);
            ctx.lineTo(centerX + dir * 72, this.y + 54);
            ctx.stroke();
            ctx.strokeStyle = `rgba(197, 138, 255, ${rushAlpha * 0.82})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(centerX - dir * 38, this.y + 72);
            ctx.lineTo(centerX + dir * 62, this.y + 66);
            ctx.stroke();
        }

        // 妖術チャージ演出
        if (
            this.isAttacking &&
            (
                this.currentPattern === 'arcane_burst' ||
                this.currentPattern === 'void_pillars' ||
                this.currentPattern === 'ultimate' ||
                this.currentPattern === 'arcane_rush'
            )
        ) {
            const sigilX = centerX + dir * 18;
            const sigilY = this.y + 54;
            const auraAlpha =
                this.currentPattern === 'ultimate' ? (0.28 + progress * 0.24) :
                this.currentPattern === 'void_pillars' ? (0.22 + progress * 0.2) :
                (0.2 + progress * 0.18);

            ctx.strokeStyle = `rgba(135, 194, 255, ${auraAlpha})`;
            ctx.lineWidth = 3.6;
            ctx.beginPath();
            ctx.arc(sigilX, sigilY, 18 + progress * 14, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(201, 128, 255, ${auraAlpha * 0.9})`;
            ctx.lineWidth = 2.4;
            for (let i = 0; i < 6; i++) {
                const a = i * (Math.PI * 2 / 6) + this.motionTime * 0.003;
                ctx.beginPath();
                ctx.moveTo(sigilX + Math.cos(a) * 12, sigilY + Math.sin(a) * 12);
                ctx.lineTo(sigilX + Math.cos(a) * (30 + progress * 12), sigilY + Math.sin(a) * (30 + progress * 12));
                ctx.stroke();
            }
        }

        this.renderPhaseBodyTint(ctx, 12);
    }
}

class ShogunArcaneBolt {
    constructor(x, y, vx, vy, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.life = 900;
        this.maxLife = 900;
        this.radius = 12;
        this.tail = [];
    }

    update(deltaTime) {
        this.life -= deltaTime * 1000;
        this.tail.unshift({ x: this.x, y: this.y });
        if (this.tail.length > 7) this.tail.pop();

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.998;
        this.vy *= 0.998;

        const scrollX = window.game ? window.game.scrollX : 0;
        const outOfBounds =
            this.x < scrollX - 160 || this.x > scrollX + CANVAS_WIDTH + 160 ||
            this.y < -120 || this.y > 1000;
        return this.life > 0 && !outOfBounds;
    }

    getHitbox() {
        if (this.life <= 0) return null;
        return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }

    render(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);

        ctx.strokeStyle = `rgba(134, 196, 255, ${0.24 * alpha})`;
        ctx.lineWidth = 5;
        for (let i = 1; i < this.tail.length; i++) {
            const from = this.tail[i - 1];
            const to = this.tail[i];
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        }

        ctx.fillStyle = `rgba(214, 238, 255, ${0.9 * alpha})`;
        ctx.strokeStyle = `rgba(104, 150, 255, ${0.86 * alpha})`;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(this.x + 11, this.y);
        ctx.lineTo(this.x, this.y - 9);
        ctx.lineTo(this.x - 9, this.y);
        ctx.lineTo(this.x, this.y + 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

class ShogunVoidPillar {
    constructor(x, groundY, damage, delay = 260, activeDuration = 340) {
        this.x = x;
        this.groundY = groundY;
        this.damage = damage;
        this.delay = delay;
        this.activeDuration = activeDuration;
        this.fadeDuration = 160;
        this.timer = 0;
    }

    update(deltaTime) {
        this.timer += deltaTime * 1000;
        return this.timer <= this.delay + this.activeDuration + this.fadeDuration;
    }

    getHitbox() {
        if (this.timer < this.delay || this.timer > this.delay + this.activeDuration) {
            return null;
        }
        return {
            x: this.x - 24,
            y: this.groundY - 172,
            width: 48,
            height: 176
        };
    }

    render(ctx) {
        if (this.timer < this.delay) {
            const t = this.timer / Math.max(1, this.delay);
            ctx.strokeStyle = `rgba(138, 219, 255, ${0.24 + t * 0.22})`;
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.ellipse(this.x, this.groundY - 2, 22 + t * 10, 6 + t * 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            return;
        }

        const activeEnd = this.delay + this.activeDuration;
        const alpha =
            this.timer <= activeEnd
                ? 1
                : Math.max(0, 1 - (this.timer - activeEnd) / this.fadeDuration);

        ctx.fillStyle = `rgba(186, 238, 255, ${0.42 * alpha})`;
        ctx.beginPath();
        ctx.moveTo(this.x - 16, this.groundY - 172);
        ctx.lineTo(this.x + 16, this.groundY - 172);
        ctx.lineTo(this.x + 26, this.groundY);
        ctx.lineTo(this.x - 26, this.groundY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = `rgba(126, 178, 255, ${0.68 * alpha})`;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.groundY - 172);
        ctx.lineTo(this.x, this.groundY - 2);
        ctx.stroke();
    }
}

// ボスファクトリー
export function createBoss(stageNumber, x, y, groundY) {
    switch (stageNumber) {
        case 1: return new YariTaisho(x, y, 'boss', groundY);
        case 2: return new NitoryuKengo(x, y, 'boss', groundY);
        case 3: return new KusarigamaAssassin(x, y, 'boss', groundY);
        case 4: return new OdachiBusho(x, y, 'boss', groundY);
        case 5: return new Shogun(x, y, 'boss', groundY);
        default: return new YariTaisho(x, y, 'boss', groundY);
    }
}
