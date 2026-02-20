// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { COLORS, GRAVITY, CANVAS_WIDTH } from './constants.js';
import { Enemy } from './enemy.js';
import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';

const ENEMY_HEADBAND_BASE = '#4f2f72';
const ENEMY_HEADBAND_HIGHLIGHT = '#7e58a6';

// ボスベースクラス
class Boss extends Enemy {
    init() {
        this.width = 60;
        this.height = 90;
        this.hp = 240;
        this.maxHp = 240;
        this.damage = 4;
        this.speed = 3.05;
        this.speedVarianceRange = 0.08;
        this.speedVarianceBias = 0.1;
        this.expReward = 300;
        this.moneyReward = 200;
        this.specialGaugeReward = 100; // 50 -> 100
        this.deathDuration = 1250;
        this.deathRiseSpeed = 2.5;
        this.detectionRange = 760;
        this.attackRange = 108;
        this.incomingDamageScale = 0.62;
        
        // フェーズ制は廃止。互換のため固定値だけ残す。
        this.phase = 1;
        this.maxPhase = 1;
        this.phaseTransitioning = false;
        this.phaseTransitionDuration = 0;
        this.phaseTransitionTimer = 0;
        this.phaseAuraDuration = 0;
        this.phaseAuraTimer = 0;
        this.attackPatterns = [];
        this.currentPattern = 0;
        this.bossName = 'Boss';
        this.weaponDrop = null;
        this.weaponReplica = null;
        this.weaponReplicaEnhanceTier = 0;
        this.isEnemy = true;
        this.attackFacingRight = this.facingRight;
        this.targetPlayer = null;
        // 火力ではなく被弾を誘うための回避挙動
        this.evasionCooldownMs = 0;
        this.evasionTimerMs = 0;
        this.evasionDir = 0;
        this.evasionJumped = false;
        this.feintTimerMs = 220 + Math.random() * 240;
        this.feintDir = Math.random() < 0.5 ? -1 : 1;
    }

    applyDifficultyScaling() {
        super.applyDifficultyScaling();
        const difficultyId = window.game && window.game.difficulty
            ? window.game.difficulty.id
            : 'normal';
        // 難易度差は維持しつつ、ボスの与ダメだけ極端にならないよう圧縮
        const bossDamageScaleByDifficulty = {
            easy: 0.9,
            normal: 0.76,
            hard: 0.62
        };
        const scale = bossDamageScaleByDifficulty[difficultyId] || bossDamageScaleByDifficulty.normal;
        this.damage = Math.max(1, Math.round(this.damage * scale));
    }
    
    update(deltaTime, player) {
        this.targetPlayer = player || null;
        const deltaMs = deltaTime * 1000;

        if (this.evasionCooldownMs > 0) {
            this.evasionCooldownMs = Math.max(0, this.evasionCooldownMs - deltaMs);
        }
        if (this.evasionTimerMs > 0) {
            this.evasionTimerMs = Math.max(0, this.evasionTimerMs - deltaMs);
        }
        this.feintTimerMs -= deltaMs;
        if (this.feintTimerMs <= 0) {
            this.feintDir *= -1;
            this.feintTimerMs = 180 + Math.random() * 260;
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

        if (
            !this.isAttacking &&
            this.evasionCooldownMs <= 0 &&
            absX <= this.attackRange * 1.55 &&
            (player.isAttacking || (player.subWeaponTimer || 0) > 0) &&
            Math.random() < 1.25 * deltaTime
        ) {
            this.startEvasionManeuver(dirToPlayer, absX);
        }

        if (this.evasionTimerMs > 0) {
            const evadeSpeed = this.speed * (1.52 + Math.min(0.72, absX / Math.max(1, this.attackRange * 3.5)));
            this.applyDesiredVx(this.evasionDir * evadeSpeed, 0.64);
            if (!this.evasionJumped && this.isGrounded && absX < this.attackRange * 1.05 && Math.random() < 0.22) {
                this.vy = -16.5;
                this.isGrounded = false;
                this.evasionJumped = true;
            }
            return;
        }

        // 画面右からの登場時は確実に戦闘エリアへ侵入
        if (this.x > screenRight - 16) {
            this.facingRight = false;
            this.applyDesiredVx(-Math.max(2.1, this.speed * 1.22), 0.58);
            return;
        }

        // 攻撃中は向きをロックして振動を防ぐ
        if (this.isAttacking) {
            if (typeof this.attackFacingRight === 'boolean') {
                this.facingRight = this.attackFacingRight;
            }
            if (Math.abs(this.vx) < this.speed * 1.8) {
                this.applyDesiredVx(0, 0.34);
            }
            return;
        }

        let desiredVX = 0;
        if (absX > this.attackRange * 1.05) {
            desiredVX = this.speed * 1.14 * dirToPlayer;
        } else if (absX > this.attackRange * 0.55) {
            desiredVX = this.speed * 0.92 * dirToPlayer;
        }
        if (absX <= this.attackRange * 2.0) {
            desiredVX += this.feintDir * this.speed * 0.44;
        }
        desiredVX = Math.max(-this.speed * 1.42, Math.min(this.speed * 1.42, desiredVX));
        this.applyDesiredVx(desiredVX, 0.46);

        if (this.attackCooldown <= 0 && absX <= this.attackRange + 104) {
            this.attackFacingRight = this.facingRight;
            this.startAttack();
            return;
        }

        if (absX > this.attackRange * 1.08) {
            this.tryJump(0.022, -25, 400);
        }
    }

    startEvasionManeuver(dirToPlayer, absX) {
        const awayDir = -dirToPlayer;
        this.evasionDir = Math.random() < 0.22 ? -awayDir : awayDir;
        this.evasionTimerMs = 220 + Math.min(190, absX * 0.42);
        this.evasionCooldownMs = 380 + Math.random() * 300;
        this.evasionJumped = false;
    }

    startPhaseTransition() {}
    onPhaseChange() {}

    takeDamage(damage, player, attackData) {
        const source = attackData && attackData.source ? attackData.source : '';
        const sourceScale = source === 'special_shadow' ? 0.72 : 1.0;
        const scaledDamage = Math.max(
            1,
            Math.round(damage * sourceScale * Math.max(0.2, this.incomingDamageScale || 1))
        );
        return super.takeDamage(scaledDamage, player, attackData);
    }

    setupWeaponReplica(weaponName) {
        this.weaponReplica = weaponName ? createSubWeapon(weaponName) : null;
        this.applyWeaponReplicaEnhancement();
    }

    startWeaponReplicaAttack(type = undefined) {
        if (!this.weaponReplica || typeof this.weaponReplica.use !== 'function') return false;
        this.applyWeaponReplicaEnhancement();
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

    getDifficultyReplicaTierBonus() {
        const difficultyId = window.game && window.game.difficulty ? window.game.difficulty.id : 'normal';
        if (difficultyId === 'hard') return 2;
        if (difficultyId === 'normal') return 1;
        return 0;
    }

    getSubWeaponEnhanceTier() {
        return Math.max(0, Math.min(3, this.getDifficultyReplicaTierBonus()));
    }

    applyWeaponReplicaEnhancement() {
        if (!this.weaponReplica) return;
        const tier = this.getSubWeaponEnhanceTier();
        this.weaponReplicaEnhanceTier = tier;

        const baseDamage = Number.isFinite(this.weaponReplica.baseDamage)
            ? this.weaponReplica.baseDamage
            : this.weaponReplica.damage;
        const baseRange = Number.isFinite(this.weaponReplica.baseRange)
            ? this.weaponReplica.baseRange
            : this.weaponReplica.range;

        let damageScale = 1 + tier * 0.08;
        let rangeScale = 1 + tier * 0.1;
        if (this.weaponReplica.name === '大槍') {
            damageScale = 1 + tier * 0.12;
            rangeScale = 1 + tier * 0.2;
        } else if (this.weaponReplica.name === '鎖鎌') {
            damageScale = 1 + tier * 0.12;
            rangeScale = 1 + tier * 0.18;
        } else if (this.weaponReplica.name === '大太刀') {
            damageScale = 1 + tier * 0.15;
            rangeScale = 1 + tier * 0.12;
        } else if (this.weaponReplica.name === '二刀流') {
            damageScale = 1 + tier * 0.09;
            rangeScale = 1 + tier * 0.08;
        }

        this.weaponReplica.damage = Math.max(1, Math.round(baseDamage * damageScale));
        this.weaponReplica.range = Math.max(24, Math.round(baseRange * rangeScale));
        if (typeof this.weaponReplica.applyEnhanceTier === 'function') {
            this.weaponReplica.applyEnhanceTier(tier, this);
        } else {
            this.weaponReplica.enhanceTier = tier;
        }
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

// ステージ1ボス: 火薬玉の武将
export class KayakudamaTaisho extends Boss {
    init() {
        super.init();
        this.bossName = '火薬玉の武将';
        this.weaponDrop = '火薬玉';
        this.hp = 270;
        this.maxHp = 270;
        this.incomingDamageScale = 0.74;
        this.attackRange = 200;
        this.attackPatterns = ['throw'];
        this.throwTimer = 0;
        this.throwCount = 0;
    }

    startAttack() {
        const toolTier = this.getSubWeaponEnhanceTier();
        const baseCooldown = 980;
        const baseThrowCount = 2;
        this.currentPattern = 'throw';
        this.attackCooldown = Math.max(720, baseCooldown - toolTier * 70);
        this.isAttacking = true;
        this.attackFacingRight = this.facingRight;
        this.throwCount = baseThrowCount + (toolTier >= 2 ? 1 : 0);
        this.throwInterval = Math.max(170, 280 - toolTier * 25);
        this.attackTimer = Math.max(680, this.throwCount * this.throwInterval + 260);
        this.throwTimer = 0;
        audio.playSpecial();
    }

    updateAttack(deltaTime) {
        const deltaMs = deltaTime * 1000;
        this.attackTimer -= deltaMs;

        // 投擲タイミング
        if (this.throwCount > 0) {
            this.throwTimer -= deltaMs;
            if (this.throwTimer <= 0) {
                this.throwBomb();
                this.throwCount--;
                this.throwTimer = this.throwInterval || 150; // 連投間隔
            }
        }

        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.throwCount = 0;
        }
    }

    throwBomb() {
        const g = window.game;
        if (!g) return;
        const activeEnemyBombs = Array.isArray(g.bombs)
            ? g.bombs.filter((bomb) => bomb && bomb.isEnemyProjectile && !bomb.isDead).length
            : 0;
        if (activeEnemyBombs >= 4) return;
        const { Bomb } = g.constructor.modules || {};
        const toolTier = this.getSubWeaponEnhanceTier();
        const direction = this.facingRight ? 1 : -1;
        const startX = this.x + this.width / 2 + direction * 20;
        const startY = this.y + 15;
        const vx = direction * (6 + toolTier * 0.75);
        const vy = -7 - toolTier * 0.35;
        const bombRadius = 8 + toolTier * 0.4;
        const bombDamage = Math.max(1, Math.round(this.damage * (1 + toolTier * 0.08)));
        const explosionRadius = 60 + toolTier * 8;
        audio.playShuriken();

        // 簡易的な火薬玉生成（Bombクラスがwindow.gameから利用可能な場合）
        if (g.bombs && typeof g.bombs.push === 'function') {
            // weapon.jsのBombクラスを動的にインポートせず、直接弾を生成
            const bomb = {
                x: startX, y: startY, vx, vy,
                radius: bombRadius, damage: bombDamage,
                explosionRadius, explosionDuration: 300,
                timer: 0, maxTimer: 800, isExploding: false,
                isDead: false, groundY: this.groundY,
                update(dt) {
                    if (this.isDead || this.isExploding) {
                        if (this.isExploding) {
                            this.timer += dt * 1000;
                            if (this.timer >= this.explosionDuration) this.isDead = true;
                        }
                        return this.isDead;
                    }
                    this.vy += 0.45;
                    this.x += this.vx;
                    this.y += this.vy;
                    this.timer += dt * 1000;
                    if (this.y + this.radius >= this.groundY || this.timer >= this.maxTimer) {
                        this.explode();
                    }
                    return false;
                },
                explode() {
                    this.isExploding = true;
                    this.timer = 0;
                    this.vx = 0;
                    this.vy = 0;
                    audio.playExplosion();
                },
                getHitbox() {
                    if (this.isExploding) {
                        return { x: this.x - this.explosionRadius, y: this.y - this.explosionRadius,
                                 width: this.explosionRadius * 2, height: this.explosionRadius * 2 };
                    }
                    return { x: this.x - this.radius, y: this.y - this.radius,
                             width: this.radius * 2, height: this.radius * 2 };
                },
                render(ctx) {
                    if (this.isDead) return;
                    ctx.save();
                    if (this.isExploding) {
                        const progress = this.timer / this.explosionDuration;
                        const r = this.explosionRadius * Math.min(1, progress * 2);
                        const alpha = 1 - progress;
                        ctx.globalAlpha = alpha * 0.7;
                        ctx.fillStyle = '#ff6b35';
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#ffd700';
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, r * 0.5, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.fillStyle = '#2d2d2d';
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = '#767676';
                        ctx.lineWidth = 1.2;
                        ctx.stroke();
                        // 導火線
                        ctx.strokeStyle = '#b07a38';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y - this.radius);
                        ctx.lineTo(this.x + 4, this.y - this.radius - 6);
                        ctx.stroke();
                        ctx.fillStyle = '#ffb347';
                        ctx.beginPath();
                        ctx.arc(this.x + 4, this.y - this.radius - 7, 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                },
                isEnemyProjectile: true,
                owner: this
            };
            g.bombs.push(bomb);
        }
    }

    getAttackHitbox() {
        return null; // 火薬玉は弾として処理
    }

    renderBody(ctx) {
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.010;
        const shoulderX = centerX + dir * 3.0 + this.torsoLean * dir * 0.2;
        const shoulderY = this.y + 34 + Math.abs(this.bob) * 0.15;
        const hipX = centerX - dir * 1.5;
        const hipY = this.y + 59;
        const headX = shoulderX - dir * 0.5;
        const headY = this.y + 22;

        // 地面の影
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 2, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 袴（深い茶色）
        ctx.fillStyle = '#1a2a1a';
        ctx.beginPath();
        ctx.moveTo(centerX - 15, this.y + 36);
        ctx.lineTo(centerX + 15, this.y + 36);
        ctx.lineTo(centerX + 22 + Math.sin(this.motionTime * 0.006) * 3, footY - 2);
        ctx.lineTo(centerX - 22 + Math.cos(this.motionTime * 0.005) * 2, footY - 2);
        ctx.closePath();
        ctx.fill();

        this.drawStylizedLegs(ctx, {
            centerX, hipX, hipY, footY, dir,
            gaitPhase, runBlend,
            backColor: '#1a2418', frontColor: '#1a2418',
            backWidth: 5.5, frontWidth: 6.5,
            spread: 3.0, stepScale: 8.8, liftScale: 5.5
        });

        // 胴体（深緑の甲冑 — 火薬使いらしい渋い色合い）
        ctx.fillStyle = '#2a3a1a';
        ctx.beginPath();
        ctx.moveTo(centerX - 19, hipY + 1);
        ctx.lineTo(centerX + 19, hipY + 1);
        ctx.lineTo(centerX + 22, this.y + 35);
        ctx.lineTo(centerX - 22, this.y + 35);
        ctx.closePath();
        ctx.fill();
        // 胸の火薬紋（ダイヤ型）
        ctx.fillStyle = '#ff8c00';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(centerX, this.y + 38);
        ctx.lineTo(centerX + 6, this.y + 44);
        ctx.moveTo(centerX, this.y + 50);
        ctx.lineTo(centerX - 6, this.y + 44);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        // 肩当て（深緑＋銅色の縁取り）
        ctx.fillStyle = '#3a4a2a';
        ctx.strokeStyle = '#a06030';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(shoulderX + dir * 12, shoulderY - 2, 10, 6, dir * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(shoulderX - dir * 12, shoulderY - 2, 10, 6, -dir * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 体幹
        ctx.strokeStyle = '#1a2a10';
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭・兜（銅色の渋い兜）
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath();
        ctx.arc(headX, headY, 17, 0, Math.PI * 2);
        ctx.fill();
        // 兜の鉢（銅色）
        ctx.strokeStyle = '#a06030';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(headX, headY - 8, 20, Math.PI * 0.96, Math.PI * 0.04, true);
        ctx.stroke();
        // 前立て（火の意匠）
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(headX, headY - 28);
        ctx.lineTo(headX - 5, headY - 18);
        ctx.moveTo(headX, headY - 28);
        ctx.lineTo(headX + 5, headY - 18);
        ctx.stroke();
        // 眼（オレンジの光）
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.arc(headX + dir * 5, headY + 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 腕・手に火薬玉を持った描画
        const armAngle = this.isAttacking
            ? (-0.5 + (this.attackTimer / 500) * 1.2) * dir
            : (-0.4 + Math.sin(this.motionTime * 0.008) * 0.08) * dir;
        const handX = shoulderX + Math.cos(armAngle) * 22;
        const handY = shoulderY + Math.sin(armAngle) * 22;

        ctx.strokeStyle = '#1a2418';
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.fillStyle = '#2a2a1a';
        ctx.beginPath();
        ctx.arc(handX, handY, 5, 0, Math.PI * 2);
        ctx.fill();

        // 手に火薬玉
        if (!this.isAttacking || this.throwCount > 0) {
            ctx.fillStyle = '#2d2d2d';
            ctx.beginPath();
            ctx.arc(handX + dir * 6, handY - 4, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#767676';
            ctx.lineWidth = 1;
            ctx.stroke();
            // 導火線
            ctx.strokeStyle = '#8b7355';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(handX + dir * 6, handY - 11);
            ctx.quadraticCurveTo(handX + dir * 8, handY - 15, handX + dir * 4, handY - 17);
            ctx.stroke();
            // 導火線の火花（明るいオレンジ）
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.arc(handX + dir * 4, handY - 17, 3, 0, Math.PI * 2);
            ctx.fill();
            // 火花のグロー
            ctx.fillStyle = 'rgba(255, 170, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(handX + dir * 4, handY - 17, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        this.renderPhaseAura(ctx, centerX, this.y + 52, '255, 140, 30', 65, 11);
    }
}

// ステージ2ボス: 槍持ちの侍大将
export class YariTaisho extends Boss {
    init() {
        super.init();
        this.bossName = '槍持ちの侍大将';
        this.weaponDrop = '大槍';
        this.hp = 360;
        this.maxHp = 360;
        this.incomingDamageScale = 0.71;
        this.speed = 3.35;
        this.attackRange = 135;
        this.attackPatterns = ['thrust'];
        this.setupWeaponReplica('大槍');
    }
    
    startAttack() {
        this.currentPattern = 'thrust';
        const toolTier = this.getSubWeaponEnhanceTier();
        this.attackCooldown = Math.max(140, 272 - toolTier * 28);
        if (this.startWeaponReplicaAttack()) {
            const dir = this.facingRight ? 1 : -1;
            this.vx = dir * (14.8 + toolTier * 1.2);
            return;
        }
        this.isAttacking = true;
        this.attackTimer = 280;
        audio.playSpear();
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

// ステージ3ボス: 二刀流の剣豪
export class NitoryuKengo extends Boss {
    init() {
        super.init();
        this.bossName = '二刀流の剣豪';
        this.weaponDrop = '二刀流';
        this.hp = 520;
        this.maxHp = 520;
        this.incomingDamageScale = 0.68;
        this.speed = 4.25;
        this.attackRange = 120;
        this.attackPatterns = ['left', 'right', 'combined'];
        this.dualAttackCycle = 0;
        this.dualPatternCycle = ['right', 'left', 'combined', 'left', 'right', 'combined'];
        this.dualPatternIndex = 0;
        this.setupWeaponReplica('二刀流');
    }
    
    startAttack() {
        const toolTier = this.getSubWeaponEnhanceTier();
        this.dualAttackCycle++;
        // シーケンス主体で読み合いを作り、ランダム混ぜで対応を崩す
        let pattern = this.dualPatternCycle[this.dualPatternIndex % this.dualPatternCycle.length];
        this.dualPatternIndex++;
        if (this.dualAttackCycle % 3 === 0) {
            pattern = 'combined';
        } else if (Math.random() < (0.14 + toolTier * 0.05)) {
            pattern = Math.random() < 0.5 ? 'left' : 'right';
        }
        this.currentPattern = pattern;

        if (this.startWeaponReplicaAttack(pattern)) {
            this.attackCooldown = pattern === 'combined'
                ? Math.max(138, 270 - toolTier * 28)
                : Math.max(78, 124 - toolTier * 12);
            return;
        }
        this.isAttacking = true;
        this.attackTimer = 260;
        this.attackCooldown = 180;
        audio.playSlash(3);
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
        const gaitPhase = this.motionTime * 0.012;
        const shoulderX = centerX + dir * 3.0 + this.torsoLean * dir * 0.2;
        const shoulderY = this.y + 32 + Math.abs(this.bob) * 0.16;
        const hipX = centerX - dir * 1.2;
        const hipY = this.y + 57;
        const headX = shoulderX - dir * 0.5;
        const headY = this.y + 20;

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
            gaitPhase,
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

// ステージ4ボス: 鎖鎌使いの暗殺者
export class KusarigamaAssassin extends Boss {
    init() {
        super.init();
        this.bossName = '鎖鎌使いの暗殺者';
        this.weaponDrop = '鎖鎌';
        this.hp = 620;
        this.maxHp = 620;
        this.incomingDamageScale = 0.66;
        this.speed = 4.6;
        this.attackRange = 225;
        this.attackPatterns = ['kusa'];
        this.chainX = 0;
        this.chainY = 0;
        this.setupWeaponReplica('鎖鎌');
    }
    
    startAttack() {
        this.currentPattern = 'kusa';
        const toolTier = this.getSubWeaponEnhanceTier();
        this.attackCooldown = Math.max(190, 368 - toolTier * 30);
        if (this.startWeaponReplicaAttack()) return;
        this.isAttacking = true;
        this.attackTimer = 500;
        audio.playDash();
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

// ステージ5ボス: 大太刀の武将
export class OdachiBusho extends Boss {
    init() {
        super.init();
        this.bossName = '大太刀の武将';
        this.weaponDrop = '大太刀';
        this.hp = 860;
        this.maxHp = 860;
        this.incomingDamageScale = 0.64;
        this.damage = 5;
        this.speed = 3.2;
        this.width = 70;
        this.height = 100;
        this.attackRange = 120;
        this.attackPatterns = ['odachi'];
        this.setupWeaponReplica('大太刀');
    }
    
    startAttack() {
        this.currentPattern = 'odachi';
        const toolTier = this.getSubWeaponEnhanceTier();
        this.attackCooldown = Math.max(240, 420 - toolTier * 24);
        if (this.startWeaponReplicaAttack()) return;
        this.isAttacking = true;
        this.attackTimer = 680;
        audio.playSlash(4);
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

// ステージ6ボス: 将軍（ラスボス）
export class Shogun extends Boss {
    init() {
        super.init();
        this.bossName = '将軍';
        this.weaponDrop = null;
        this.hp = 1520;
        this.maxHp = 1520;
        this.incomingDamageScale = 0.61;
        this.damage = 5;
        this.speed = 4.25;
        this.width = 80;
        this.height = 110;
        this.attackRange = 146;
        this.maxPhase = 1;
        this.attackDuration = 500;
        this.attackFlags = Object.create(null);
        this.weaponTrailPulse = 0;
        
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
    }

    pickPattern(availablePatterns) {
        const recent = this.patternHistory.slice(-2);
        let candidates = availablePatterns.filter(p => !recent.includes(p));
        if (candidates.length === 0) candidates = availablePatterns.slice();
        candidates.push('dash', 'shadow_step', 'arcane_rush');

        const pattern = candidates[Math.floor(Math.random() * candidates.length)];
        this.patternHistory.push(pattern);
        if (this.patternHistory.length > 6) this.patternHistory.shift();
        return pattern;
    }

    playPatternStartSfx(pattern) {
        switch (pattern) {
            case 'thrust':
            case 'heavy':
            case 'shockwave':
            case 'double':
            case 'sweep':
                audio.playSlash(3);
                break;
            case 'dash':
            case 'shadow_step':
            case 'arcane_rush':
                audio.playDash();
                break;
            case 'arcane_burst':
            case 'sorcery_volley':
            case 'void_pillars':
                audio.playSpecial();
                break;
            case 'ultimate':
                audio.playSpecial();
                audio.playDash();
                break;
            default:
                audio.playSlash(2);
                break;
        }
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackFlags = Object.create(null);
        this.attackFacingRight = this.facingRight;
        this.weaponTrailPulse = 280;
        
        const availablePatterns = [
            'thrust', 'double', 'dash', 'throw', 'heavy', 'shockwave', 'shadow_step',
            'arcane_burst', 'arcane_burst', 'sorcery_volley', 'void_pillars', 'void_pillars', 'arcane_rush',
            'ultimate'
        ];
        
        const pattern = this.pickPattern(availablePatterns);
        this.currentPattern = pattern;
        this.playPatternStartSfx(pattern);
        
        switch (pattern) {
            case 'arcane_burst':
                this.attackDuration = 540;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 360;
                break;
            case 'void_pillars':
                this.attackDuration = 610;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 410;
                break;
            case 'ultimate':
                this.attackDuration = 680;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 500;
                break;
            case 'sorcery_volley':
                this.attackDuration = 650;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 430;
                break;
            case 'shadow_step':
                this.attackDuration = 430;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 280;
                break;
            case 'arcane_rush':
                this.attackDuration = 450;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 300;
                break;
            case 'dash':
                this.attackDuration = 270;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 210;
                break;
            case 'shockwave':
                this.attackDuration = 340;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 240;
                break;
            default:
                this.attackDuration = 230;
                this.attackTimer = this.attackDuration;
                this.attackCooldown = 190;
        }
    }

    updateAttack(deltaTime) {
        const player = this.targetPlayer;
        const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / Math.max(1, this.attackDuration))));
        this.weaponTrailPulse = Math.max(0, this.weaponTrailPulse - deltaTime * 1000);

        // 攻撃中の向きを固定してブルブルを抑える
        this.facingRight = !!this.attackFacingRight;
        const dir = this.facingRight ? 1 : -1;

        switch (this.currentPattern) {
            case 'thrust':
                if (!this.attackFlags.thrustDash) {
                    this.vx = dir * this.speed * 4.2;
                    this.attackFlags.thrustDash = true;
                } else if (progress > 0.34) {
                    this.vx *= 0.86;
                }
                if (progress >= 0.22 && !this.attackFlags.thrustSwingSfx) {
                    audio.playSpear();
                    if (window.game && typeof window.game.queueHitFeedback === 'function') {
                        window.game.queueHitFeedback(5.8, 72);
                    }
                    this.attackFlags.thrustSwingSfx = true;
                }
                break;
            case 'dash':
                if (!this.attackFlags.highDash) {
                    this.vx = dir * this.speed * 5.8;
                    this.attackFlags.highDash = true;
                } else if (progress > 0.5) {
                    this.vx *= 0.82;
                }
                if (progress >= 0.28 && !this.attackFlags.dashSwingSfx) {
                    audio.playSlash(4);
                    if (window.game && typeof window.game.queueHitFeedback === 'function') {
                        window.game.queueHitFeedback(6.6, 84);
                    }
                    this.attackFlags.dashSwingSfx = true;
                }
                break;
            case 'arcane_burst':
                this.vx *= 0.72;
                if (player && progress >= 0.22 && !this.attackFlags.burstA) {
                    this.spawnArcaneBurst(player, 1);
                    audio.playSpecial();
                    this.attackFlags.burstA = true;
                }
                if (player && progress >= 0.48 && !this.attackFlags.burstB) {
                    this.spawnArcaneBurst(player, 2);
                    audio.playSpecial();
                    this.attackFlags.burstB = true;
                }
                break;
            case 'sorcery_volley':
                this.vx *= 0.64;
                if (player && progress >= 0.14 && !this.attackFlags.volleyA) {
                    this.spawnArcaneBurst(player, 2);
                    audio.playSpecial();
                    this.attackFlags.volleyA = true;
                }
                if (player && progress >= 0.33 && !this.attackFlags.volleyB) {
                    this.spawnArcaneBurst(player, 3);
                    audio.playSpecial();
                    this.attackFlags.volleyB = true;
                }
                if (player && progress >= 0.55 && !this.attackFlags.volleyC) {
                    this.spawnArcaneBurst(player, 4);
                    audio.playSpecial();
                    this.attackFlags.volleyC = true;
                }
                if (player && progress >= 0.7 && !this.attackFlags.volleyPillar) {
                    this.spawnVoidPillars(player, true);
                    audio.playExplosion();
                    this.attackFlags.volleyPillar = true;
                }
                break;
            case 'void_pillars':
                this.vx *= 0.66;
                if (player && progress >= 0.2 && !this.attackFlags.pillarA) {
                    this.spawnVoidPillars(player, false);
                    audio.playExplosion();
                    this.attackFlags.pillarA = true;
                }
                if (player && progress >= 0.5 && !this.attackFlags.pillarB) {
                    this.spawnVoidPillars(player, true);
                    audio.playExplosion();
                    this.attackFlags.pillarB = true;
                }
                break;
            case 'ultimate':
                this.vx *= 0.52;
                if (player && progress >= 0.14 && !this.attackFlags.ultBurstA) {
                    this.spawnArcaneBurst(player, 3);
                    audio.playSpecial();
                    this.attackFlags.ultBurstA = true;
                }
                if (player && progress >= 0.4 && !this.attackFlags.ultPillar) {
                    this.spawnVoidPillars(player, true);
                    audio.playExplosion();
                    this.attackFlags.ultPillar = true;
                }
                if (player && progress >= 0.64 && !this.attackFlags.ultBurstB) {
                    this.spawnArcaneBurst(player, 4);
                    audio.playSpecial();
                    this.attackFlags.ultBurstB = true;
                }
                break;
            case 'shadow_step':
                this.vx *= 0.58;
                if (player && progress >= 0.16 && !this.attackFlags.stepWarp) {
                    const playerCenterX = player.x + player.width / 2;
                    const warpDir = player.facingRight ? -1 : 1;
                    this.x = playerCenterX + warpDir * 72 - this.width / 2;
                    this.y = this.groundY - this.height;
                    this.facingRight = warpDir < 0;
                    this.attackFacingRight = this.facingRight;
                    this.vx = (this.facingRight ? 1 : -1) * this.speed * 4.7;
                    audio.playDash();
                    this.attackFlags.stepWarp = true;
                } else if (this.attackFlags.stepWarp && progress > 0.3) {
                    this.vx *= 0.82;
                }
                if (player && progress >= 0.44 && !this.attackFlags.stepBurst) {
                    this.spawnArcaneBurst(player, 2);
                    audio.playSpecial();
                    this.attackFlags.stepBurst = true;
                }
                break;
            case 'arcane_rush':
                this.vx *= 0.62;
                if (player && progress >= 0.14 && !this.attackFlags.rushWarp) {
                    const playerCenterX = player.x + player.width / 2;
                    const backDir = player.facingRight ? -1 : 1;
                    this.x = playerCenterX + backDir * 84 - this.width / 2;
                    this.y = this.groundY - this.height;
                    this.facingRight = backDir < 0;
                    this.attackFacingRight = this.facingRight;
                    this.vx = (this.facingRight ? 1 : -1) * this.speed * 5.8;
                    audio.playDash();
                    this.attackFlags.rushWarp = true;
                } else if (this.attackFlags.rushWarp && progress > 0.32) {
                    this.vx *= 0.86;
                }
                if (player && progress >= 0.28 && !this.attackFlags.rushBurstA) {
                    this.spawnArcaneBurst(player, 2);
                    audio.playSpecial();
                    this.attackFlags.rushBurstA = true;
                }
                if (player && progress >= 0.56 && !this.attackFlags.rushBurstB) {
                    this.spawnArcaneBurst(player, 3);
                    audio.playSpecial();
                    this.attackFlags.rushBurstB = true;
                }
                break;
            default:
                this.vx *= 0.82;
                if (progress >= 0.3 && !this.attackFlags.defaultSwingSfx) {
                    audio.playSlash(3);
                    this.attackFlags.defaultSwingSfx = true;
                }
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
            const speed = 8.8 + wave * 0.5;
            this.projectiles.push(new ShogunArcaneBolt(
                originX,
                originY,
                (dx / len) * speed,
                (dy / len) * speed,
                this.damage + wave + 1
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
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.0095;
        const shoulderX = centerX + dir * 5.0 + this.torsoLean * dir * 0.22;
        const shoulderY = this.y + 40 + Math.abs(this.bob) * 0.18;
        const hipX = centerX - dir * 2.6;
        const hipY = this.y + 73;
        const headX = shoulderX - dir * 0.8;
        const headY = this.y + 29;

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

        const pulse = 0.22 + Math.sin(this.motionTime * 0.012) * 0.08;
        ctx.strokeStyle = `rgba(196, 122, 255, ${Math.max(0.14, pulse)})`;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(centerX - 21, this.y + 50);
        ctx.lineTo(centerX + 21, this.y + 50);
        ctx.moveTo(centerX - 24, this.y + 62);
        ctx.lineTo(centerX + 24, this.y + 62);
        ctx.stroke();

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

        const auraAlpha = 0.16 + Math.sin(this.motionTime * 0.014) * 0.06;
        ctx.fillStyle = `rgba(132, 90, 255, ${Math.max(0.1, auraAlpha)})`;
        ctx.beginPath();
        ctx.moveTo(centerX - 42, this.y + 52);
        ctx.quadraticCurveTo(centerX - 58, this.y + 78, centerX - 34, footY - 6);
        ctx.lineTo(centerX + 34, footY - 6);
        ctx.quadraticCurveTo(centerX + 58, this.y + 78, centerX + 42, this.y + 52);
        ctx.closePath();
        ctx.fill();
        // 武器（覇王太刀）
        const duration = this.attackDuration || (this.currentPattern === 'ultimate' ? 1200 : 500);
        const progress = this.isAttacking ? Math.max(0, Math.min(1, 1 - (this.attackTimer / duration))) : 0;
        let bladeAngle = (-0.72 + Math.sin(this.motionTime * 0.007) * 0.05) * dir;
        if (this.isAttacking) {
            if (this.currentPattern === 'ultimate') {
                bladeAngle = progress * Math.PI * 2.7 * dir;
            } else if (this.currentPattern === 'arcane_burst') {
                bladeAngle = (-Math.PI * 0.53 + Math.sin(progress * Math.PI * 4) * 0.17) * dir;
            } else if (this.currentPattern === 'void_pillars') {
                bladeAngle = (-Math.PI * 0.28 + Math.sin(progress * Math.PI * 3.2) * 0.13) * dir;
            } else {
                const wind = progress < 0.14 ? progress / 0.14 : 1;
                const swing = progress < 0.14 ? 0 : (progress - 0.14) / 0.86;
                const quickSwing = 1 - Math.pow(1 - swing, 2.35);
                bladeAngle = (-1.62 + wind * 0.76 + quickSwing * 2.62) * dir;
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

        const bladeLength = 124;
        const bladeTipX = leadHand.x + weaponDirX * bladeLength;
        const bladeTipY = leadHand.y + weaponDirY * bladeLength;
        ctx.save();
        ctx.translate(leadHand.x, leadHand.y);
        ctx.rotate(weaponAngle);

        const hiltBack = -35;
        const guardX = -8;
        ctx.fillStyle = '#5f3a1e';
        ctx.fillRect(hiltBack, -4.8, guardX - hiltBack, 9.6);
        ctx.strokeStyle = '#342013';
        ctx.lineWidth = 1.2;
        for (let x = hiltBack + 4; x < guardX - 2; x += 7) {
            ctx.beginPath();
            ctx.moveTo(x, -3.8);
            ctx.lineTo(x, 3.8);
            ctx.stroke();
        }

        const guardGrad = ctx.createLinearGradient(guardX - 1, -7, guardX + 1, 7);
        guardGrad.addColorStop(0, '#f2d995');
        guardGrad.addColorStop(1, '#8b6630');
        ctx.fillStyle = guardGrad;
        ctx.beginPath();
        ctx.moveTo(guardX - 1.6, -7.0);
        ctx.lineTo(guardX + 2.0, -4.2);
        ctx.lineTo(guardX + 2.0, 4.2);
        ctx.lineTo(guardX - 1.6, 7.0);
        ctx.closePath();
        ctx.fill();

        const bladeStart = guardX + 2.2;
        const bladeEnd = bladeLength;
        const bladeGrad = ctx.createLinearGradient(bladeStart, -2, bladeEnd, 3);
        bladeGrad.addColorStop(0, '#cbd5e2');
        bladeGrad.addColorStop(0.52, '#f8fbff');
        bladeGrad.addColorStop(1, '#afbaca');
        ctx.fillStyle = bladeGrad;
        ctx.beginPath();
        ctx.moveTo(bladeStart, -7.8);
        ctx.quadraticCurveTo(bladeStart + 34, -15.8, bladeStart + 84, -11.8);
        ctx.quadraticCurveTo(bladeEnd - 22, -8.8, bladeEnd + 5.2, -1.2);
        ctx.quadraticCurveTo(bladeEnd - 12, 6.8, bladeEnd - 30, 9.2);
        ctx.quadraticCurveTo(bladeStart + 44, 12.0, bladeStart + 8.5, 8.2);
        ctx.quadraticCurveTo(bladeStart - 1.5, 4.3, bladeStart, -7.8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#8996a7';
        ctx.lineWidth = 1.45;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(bladeStart + 8, -2.8);
        ctx.quadraticCurveTo(bladeStart + 64, -6.1, bladeEnd - 14, -1.2);
        ctx.stroke();
        ctx.restore();

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
            const spinAlpha = 0.58 * (1 - progress);
            ctx.strokeStyle = `rgba(255, 214, 106, ${spinAlpha})`;
            ctx.lineWidth = 8;
            for (let i = 0; i < 12; i++) {
                const angle = i * (Math.PI * 2 / 12) + progress * Math.PI;
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
            const pulseBoost = (this.weaponTrailPulse || 0) / 220;
            const mainAlpha = 0.34 + progress * 0.5 + pulseBoost * 0.24;
            const trailRadius = 126 + pulseBoost * 10;
            ctx.strokeStyle = `rgba(255, 168, 102, ${mainAlpha})`;
            ctx.lineWidth = 22;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(
                leadHand.x,
                leadHand.y,
                trailRadius,
                weaponAngle - dir * 0.94,
                weaponAngle + dir * 0.38,
                dir < 0
            );
            ctx.stroke();

            ctx.strokeStyle = `rgba(255, 234, 190, ${mainAlpha * 0.7})`;
            ctx.lineWidth = 9;
            ctx.beginPath();
            ctx.arc(
                leadHand.x,
                leadHand.y,
                trailRadius - 8,
                weaponAngle - dir * 0.78,
                weaponAngle + dir * 0.24,
                dir < 0
            );
            ctx.stroke();

            ctx.strokeStyle = `rgba(255, 176, 124, ${mainAlpha * 0.54})`;
            ctx.lineWidth = 6;
            for (let i = 0; i < 4; i++) {
                const lag = 14 + i * 11;
                const sx = bladeTipX - weaponDirX * lag - weaponDirY * (i - 1) * 4;
                const sy = bladeTipY - weaponDirY * lag + weaponDirX * (i - 1) * 4;
                const ex = sx - weaponDirX * (30 + i * 7);
                const ey = sy - weaponDirY * (30 + i * 7);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
        }

        if (this.isAttacking && this.currentPattern === 'arcane_rush') {
            const rushAlpha = 0.32 + (1 - progress) * 0.4;
            ctx.strokeStyle = `rgba(147, 219, 255, ${rushAlpha})`;
            ctx.lineWidth = 11;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(centerX - dir * 66, this.y + 60);
            ctx.lineTo(centerX + dir * 84, this.y + 54);
            ctx.stroke();
            ctx.strokeStyle = `rgba(197, 138, 255, ${rushAlpha * 0.82})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(centerX - dir * 48, this.y + 72);
            ctx.lineTo(centerX + dir * 74, this.y + 66);
            ctx.stroke();
        }

        if (this.isAttacking && this.currentPattern !== 'arcane_burst' && this.currentPattern !== 'void_pillars') {
            const tipPulse = 0.22 + Math.sin(this.motionTime * 0.038) * 0.1 + (this.weaponTrailPulse || 0) / 440;
            const flare = ctx.createRadialGradient(bladeTipX, bladeTipY, 0, bladeTipX, bladeTipY, 20);
            flare.addColorStop(0, `rgba(255, 244, 206, ${tipPulse * 0.86})`);
            flare.addColorStop(0.55, `rgba(255, 188, 116, ${tipPulse * 0.44})`);
            flare.addColorStop(1, 'rgba(255, 130, 90, 0)');
            ctx.fillStyle = flare;
            ctx.beginPath();
            ctx.arc(bladeTipX, bladeTipY, 20, 0, Math.PI * 2);
            ctx.fill();
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
        case 1: return new KayakudamaTaisho(x, y, 'boss', groundY);
        case 2: return new YariTaisho(x, y, 'boss', groundY);
        case 3: return new NitoryuKengo(x, y, 'boss', groundY);
        case 4: return new KusarigamaAssassin(x, y, 'boss', groundY);
        case 5: return new OdachiBusho(x, y, 'boss', groundY);
        case 6: return new Shogun(x, y, 'boss', groundY);
        default: return new KayakudamaTaisho(x, y, 'boss', groundY);
    }
}
