// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { COLORS, GRAVITY, CANVAS_WIDTH, LANE_OFFSET } from './constants.js';
import { Enemy } from './enemy.js';
import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { Player, ANIM_STATE } from './player.js';

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

        if (!this.isAttacking && this.hitTimer <= 0 && absX > 16) {
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
                    if (this.y + this.radius >= this.groundY + LANE_OFFSET || this.timer >= this.maxTimer) {
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
                        const grad = ctx.createRadialGradient(
                            this.x - this.radius * 0.3, 
                            this.y - this.radius * 0.3, 
                            this.radius * 0.1, 
                            this.x, 
                            this.y, 
                            this.radius
                        );
                        grad.addColorStop(0, '#666');
                        grad.addColorStop(0.4, '#2d2d2d');
                        grad.addColorStop(1, '#111');
                        
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, this.radius - 1, Math.PI * 1.1, Math.PI * 1.8);
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
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'bomb',
            headStyle: 'kabuto',
            armorRows: 4,
            headRatio: 0.19,
            armScale: 1.14,
            torsoLeanScale: 1.12,
            attackDurationMs: 720,
            weaponScale: 1.08,
            palette: {
                legBack: '#111810',
                legFront: '#1a2418',
                robe: '#25351b',
                robeShade: '#1b2714',
                torsoCore: '#15200f',
                armorA: '#3f562c',
                armorB: '#2a3c1e',
                armorEdge: '#b98b4b',
                shoulder: '#56743f',
                helmTop: '#54331f',
                helmBottom: '#2a1810',
                crest: '#d4782a'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.010;
        const shoulderX = centerX + dir * 4.9 + this.torsoLean * dir * 0.56;
        const shoulderY = this.y + 34 + Math.abs(this.bob) * 0.15;
        const hipX = centerX - dir * 1.9;
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
            backColor: '#111811', frontColor: '#1a2418',
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
        ctx.strokeStyle = '#6b7a50';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
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
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭・兜（銅色の渋い兜）
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(headX, headY, 17, 0.4, Math.PI * 2 - 0.4);
        ctx.fill();
        
        // 兜の鉢（銅色）
        ctx.fillStyle = '#3b2314'; ctx.strokeStyle = '#3b2314';
        ctx.beginPath();
        ctx.arc(headX, headY - 4, 16, Math.PI, 0);
        ctx.fill();

        ctx.strokeStyle = '#3b2314';
        ctx.lineWidth = 4.5;
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
        

        // 腕・手に火薬玉を持った描画
        const armRaw = this.isAttacking
            ? (-0.44 + (this.attackTimer / 500) * 1.06)
            : (-0.36 + Math.sin(this.motionTime * 0.008) * 0.08);
        const armAngle = dir === 1 ? armRaw : Math.PI - armRaw;
        const armTargetX = shoulderX + Math.cos(armAngle) * 24.6;
        const armTargetY = shoulderY + Math.sin(armAngle) * 24.6;
        const armPose = this.drawJointedArm(ctx, {
            shoulderX,
            shoulderY,
            handX: armTargetX,
            handY: armTargetY,
            upperLen: 12.8,
            foreLen: 13.4,
            bendSign: -dir * 0.84,
            upperWidth: 6.4,
            foreWidth: 5.3,
            jointRadius: 3.6,
            baseColor: '#181f15',
            handColor: '#2a2a1a',
            highlightColor: 'rgba(210,230,196,0.12)'
        });
        const handX = armPose.handX;
        const handY = armPose.handY;

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
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'spear',
            headStyle: 'kabuto',
            armorRows: 4,
            headRatio: 0.19,
            armScale: 1.16,
            torsoLeanScale: 1.14,
            attackDurationMs: 280,
            weaponScale: 1.28,
            palette: {
                legBack: '#101010',
                legFront: '#1a1a1a',
                robe: '#2d161a',
                robeShade: '#221115',
                torsoCore: '#171717',
                armorA: '#4a5262',
                armorB: '#333a48',
                armorEdge: '#d1b366',
                shoulder: '#606b7f',
                helmTop: '#2a2e36',
                helmBottom: '#171a20',
                crest: '#d8bd74'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.010;
        const shoulderX = centerX + dir * 5.8 + this.torsoLean * dir * 0.62;
        const shoulderY = this.y + 35 + Math.abs(this.bob) * 0.15;
        const hipX = centerX - dir * 2.3;
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
            backColor: '#111111', frontColor: '#181818',
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
        ctx.strokeStyle = '#808a9c';
        ctx.lineWidth = 1.5;
        ctx.stroke();
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
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // 頭・兜
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 18.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(headX, headY, 18.5, 0.4, Math.PI * 2-0.4);
        ctx.fill();

        ctx.fillStyle = '#1c1f24'; ctx.strokeStyle = '#1c1f24';
        ctx.beginPath();
        ctx.arc(headX, headY - 6, 17.5, Math.PI, 0);
        ctx.fill();

        ctx.strokeStyle = '#1c1f24';
        ctx.lineWidth = 5.5;
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
        let handTargetX = shoulderX + dir * 12;
        let handTargetY = shoulderY + 9;
        let supportTargetX = shoulderX + dir * 28;
        let supportTargetY = shoulderY + 8;
        if (spear && spear.isAttacking && typeof spear.getGripAnchors === 'function') {
            const grips = spear.getGripAnchors(this);
            handTargetX = grips.rear.x;
            handTargetY = grips.rear.y;
            supportTargetX = grips.front.x;
            supportTargetY = grips.front.y;
        }

        const leadArm = this.drawJointedArm(ctx, {
            shoulderX,
            shoulderY,
            handX: handTargetX,
            handY: handTargetY,
            upperLen: 13.2,
            foreLen: 14.8,
            bendSign: -dir * 0.86,
            upperWidth: 7.0,
            foreWidth: 5.8,
            jointRadius: 3.8,
            baseColor: '#111',
            handColor: '#232932',
            highlightColor: 'rgba(215,226,242,0.12)'
        });
        const supportArm = this.drawJointedArm(ctx, {
            shoulderX: shoulderX - dir * 5.0,
            shoulderY: shoulderY + 2.6,
            handX: supportTargetX,
            handY: supportTargetY,
            upperLen: 12.4,
            foreLen: 13.6,
            bendSign: dir * 0.84,
            upperWidth: 6.0,
            foreWidth: 5.0,
            jointRadius: 3.4,
            baseColor: '#15181d',
            handColor: '#232932',
            highlightColor: 'rgba(205,216,232,0.1)'
        });
        const handX = leadArm.handX;
        const handY = leadArm.handY;

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

        ctx.fillStyle = '#232932';
        ctx.beginPath();
        ctx.arc(leadArm.handX, leadArm.handY, 5.3, 0, Math.PI * 2);
        ctx.arc(supportArm.handX, supportArm.handY, 5.0, 0, Math.PI * 2);
        ctx.fill();

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
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'dual',
            headStyle: 'kabuto',
            armorRows: 3,
            headRatio: 0.188,
            armScale: 1.13,
            torsoLeanScale: 1.1,
            attackDurationMs: 260,
            weaponScale: 1.16,
            palette: {
                legBack: '#121212',
                legFront: '#191919',
                robe: '#1f2731',
                robeShade: '#171d25',
                torsoCore: '#131418',
                armorA: '#425164',
                armorB: '#2f3a49',
                armorEdge: '#8a7bc0',
                shoulder: '#55677d',
                helmTop: '#2a2e39',
                helmBottom: '#171922',
                crest: '#8f7ac5',
                accent: '#8c78c4'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.012;
        const shoulderX = centerX + dir * 4.9 + this.torsoLean * dir * 0.56;
        const shoulderY = this.y + 32 + Math.abs(this.bob) * 0.16;
        const hipX = centerX - dir * 1.5;
        const hipY = this.y + 57;
        const headX = shoulderX - dir * 0.5;
        const headY = this.y + 20;

        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath();
        ctx.ellipse(centerX, footY + 2, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 帯
        const scarfWave = Math.sin(this.motionTime * 0.012) * 8;
        ctx.fillStyle = '#4f2f72';
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
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
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
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(headX, headY, 16, 0.3, Math.PI * 2 - 0.3);
        ctx.fill();

        ctx.fillStyle = '#222'; // 髪
        ctx.beginPath();
        ctx.arc(headX, headY - 6, 16.5, Math.PI, 0);
        ctx.fill();

        ctx.strokeStyle = ENEMY_HEADBAND_HIGHLIGHT;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(headX - 16, headY - 3);
        ctx.quadraticCurveTo(headX, headY - 7, headX + 16, headY - 1);
        ctx.stroke();
        // 二刀（プレイヤーが取得する二刀と同一描画）
        const dual = this.weaponReplica;
        let rawRight = -0.72 + Math.sin(this.motionTime * 0.008) * 0.08;
        let rawLeft = -1.14 + Math.sin(this.motionTime * 0.008 + 1.4) * 0.08;
        let rightAngle = 0;
        let keepWorldRightAngle = false;
        if (dual && dual.isAttacking) {
            if (dual.attackType === 'left' && typeof dual.getLeftSwingAngle === 'function') {
                rightAngle = dual.getLeftSwingAngle();
                keepWorldRightAngle = true;
                rawLeft = -1.0 + Math.sin(this.motionTime * 0.008) * 0.06;
            } else if (dual.attackType === 'combined' && typeof dual.getCombinedSwingProgress === 'function') {
                const p = dual.getCombinedSwingProgress();
                rawRight = -1.02 + p * 2.08;
                rawLeft = 1.06 - p * 2.1;
            } else if (dual.attackType === 'right') {
                const p = Math.max(0, Math.min(1, dual.attackTimer / 150));
                const start = -Math.PI * 0.75;
                const end = Math.PI * 0.22;
                rawRight = start + (end - start) * (1 - p);
                rawLeft = -1.0 + Math.sin(this.motionTime * 0.008) * 0.06;
            }
        }
        if (!keepWorldRightAngle) {
            rightAngle = dir === 1 ? rawRight : Math.PI - rawRight;
        }
        let leftAngle = dir === 1 ? rawLeft : Math.PI - rawLeft;

        const rightShoulderX = shoulderX + dir * 2.2;
        const rightShoulderY = shoulderY + 1.5;
        const leftShoulderX = shoulderX - dir * 1.7;
        const leftShoulderY = shoulderY + 2.2;
        const rightTargetX = rightShoulderX + Math.cos(rightAngle) * 23.0;
        const rightTargetY = rightShoulderY + Math.sin(rightAngle) * 23.0;
        const leftTargetX = leftShoulderX + Math.cos(leftAngle) * 21.0;
        const leftTargetY = leftShoulderY + Math.sin(leftAngle) * 21.0;

        const rightArm = this.drawJointedArm(ctx, {
            shoulderX: rightShoulderX,
            shoulderY: rightShoulderY,
            handX: rightTargetX,
            handY: rightTargetY,
            upperLen: 12.2,
            foreLen: 13.0,
            bendSign: -dir * 0.84,
            upperWidth: 5.8,
            foreWidth: 4.9,
            jointRadius: 3.2,
            baseColor: '#171717',
            handColor: '#212832',
            highlightColor: 'rgba(220,230,248,0.12)'
        });
        const leftArm = this.drawJointedArm(ctx, {
            shoulderX: leftShoulderX,
            shoulderY: leftShoulderY,
            handX: leftTargetX,
            handY: leftTargetY,
            upperLen: 11.4,
            foreLen: 12.0,
            bendSign: dir * 0.88,
            upperWidth: 5.0,
            foreWidth: 4.2,
            jointRadius: 3.0,
            baseColor: '#141419',
            handColor: '#1e2430',
            highlightColor: 'rgba(202,216,240,0.1)'
        });

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
        drawBlade(rightArm.handX, rightArm.handY, rightAngle, 49);
        drawBlade(leftArm.handX, leftArm.handY, leftAngle, 45);

        ctx.fillStyle = '#212832';
        ctx.beginPath();
        ctx.arc(rightArm.handX, rightArm.handY, 4.8, 0, Math.PI * 2);
        ctx.arc(leftArm.handX, leftArm.handY, 4.4, 0, Math.PI * 2);
        ctx.fill();

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
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'kusa',
            headStyle: 'ninja',
            armorRows: 3,
            headRatio: 0.19,
            armScale: 1.12,
            torsoLeanScale: 1.12,
            attackDurationMs: 500,
            weaponScale: 1.04,
            palette: {
                legBack: '#131313',
                legFront: '#1a1a1a',
                robe: '#232531',
                robeShade: '#1a1c25',
                torsoCore: '#131318',
                armorA: '#39414f',
                armorB: '#272d38',
                armorEdge: '#7d87a8',
                shoulder: '#4c5567',
                helmTop: '#262a34',
                helmBottom: '#151820',
                crest: '#7a86a8',
                accent: '#ef4d4d'
            }
        });
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.014;
        const shoulderX = centerX + dir * 3.1 + this.torsoLean * dir * 0.36;
        const shoulderY = this.y + 31;
        const hipX = centerX - dir * 1.2;
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
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        ctx.fillStyle = '#191a21';
        ctx.beginPath();
        ctx.moveTo(centerX - 17, hipY + 0.4);
        ctx.lineTo(centerX + 17, hipY + 0.4);
        ctx.lineTo(centerX + 14, this.y + 34);
        ctx.lineTo(centerX - 14, this.y + 34);
        ctx.closePath();
        ctx.fill();

        // 頭・面頬
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(headX, headY, 15.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1b1c21';
        ctx.beginPath();
        ctx.arc(headX, headY, 15.6, 0.2, Math.PI*2 - 0.2);
        ctx.fill();
        
        ctx.fillStyle = '#f53333';
        ctx.beginPath();
        ctx.arc(headX + dir * 6, headY - 1, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // 鎖鎌（プレイヤーが取得する鎖鎌と同一描画）
        const kusa = this.weaponReplica;
        let kusaAngleRaw = -0.58 + Math.sin(this.motionTime * 0.01) * 0.08;
        let kusaAngle = dir === 1 ? kusaAngleRaw : Math.PI - kusaAngleRaw;
        let handX = shoulderX + Math.cos(kusaAngle) * 23.2;
        let handY = shoulderY + Math.sin(kusaAngle) * 23.2;
        if (kusa && kusa.isAttacking && typeof kusa.getHandAnchor === 'function') {
            const handAnchor = kusa.getHandAnchor(this);
            handX = handAnchor.x;
            handY = handAnchor.y;
        }
        const kusaArm = this.drawJointedArm(ctx, {
            shoulderX,
            shoulderY,
            handX,
            handY,
            upperLen: 12.0,
            foreLen: 13.3,
            bendSign: -dir * 0.82,
            upperWidth: 5.4,
            foreWidth: 4.6,
            jointRadius: 3.1,
            baseColor: '#17171b',
            handColor: '#212126',
            highlightColor: 'rgba(210,220,236,0.1)'
        });
        handX = kusaArm.handX;
        handY = kusaArm.handY;
        ctx.fillStyle = '#212126';
        ctx.beginPath();
        ctx.arc(handX, handY, 4.8, 0, Math.PI * 2);
        ctx.fill();

        if (kusa && kusa.isAttacking && typeof kusa.render === 'function') {
            kusa.render(ctx, this);
        } else {
            const rawIdle = -0.4 + Math.sin(this.motionTime * 0.01) * 0.05;
            const idleAngle = dir === 1 ? rawIdle : Math.PI - rawIdle;
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
        this.attackRange = 180; // リーチ拡大
        this.attackPatterns = ['odachi'];
        this.setupWeaponReplica('大太刀');
        if (this.weaponReplica) {
            this.weaponReplica.range = 100; // 巨大化 (デフォルト74)
        }
        this.forceSubWeaponRender = true;
    }
    
    startAttack() {
        const toolTier = this.getSubWeaponEnhanceTier();
        this.attackCooldown = Math.max(240, 420 - toolTier * 24);

        // プレイヤーまでの距離と確率によって特殊攻撃（Xスキル＝上昇斬り＋衝撃波）を使用
        let useSpecial = false;
        if (this.targetPlayer && this.weaponReplica) {
            const dist = Math.abs((this.targetPlayer.x + this.targetPlayer.width/2) - (this.x + this.width/2));
            // 距離が近すぎず遠すぎない、かつ25%の確率で特殊攻撃
            if (dist > 40 && dist < 160 && Math.random() < 0.25) {
                useSpecial = true;
            }
        }

        if (useSpecial) {
            this.currentPattern = 'odachi_special';
            // 武器の .use() を直接呼び出し、Nodachi特有の特殊攻撃を発動
            this.applyWeaponReplicaEnhancement();
            this.weaponReplica.use(this);
            this.isAttacking = true;
            this.attackTimer = this.weaponReplica.attackTimer || this.weaponReplica.totalDuration || 0;
            // Xスキルの後は隙を大きくする
            this.attackCooldown += 400; 
            return;
        }

        this.currentPattern = 'odachi';
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
        // 現在の攻撃パターンが Xスキルの場合は、専用の weaponMode を指定する
        const isSpecial = this.currentPattern === 'odachi_special';
        const currentWeaponMode = isSpecial ? 'odachi_special' : 'odachi';
        // Xスキル時はNodachiの攻撃時間を使用、通常時は680ms
        const currentAttackDuration = isSpecial && this.weaponReplica
            ? (this.weaponReplica.totalDuration || 680)
            : 680;
        
        // プレイヤーと同じ大太刀の見た目・サイズ・エフェクトを実現するため、
        // 共通モデル描画では武器を抑制し、実物の Nodachi クラスに描画を委ねる
        // 武器の実体から正確な手の位置（pose）を取得
        const handPose = this.weaponReplica ? this.weaponReplica.getPose(this) : null;

        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: currentWeaponMode,
            suppressWeaponDraw: true, 
            headStyle: 'kabuto',
            crestVariant: 'mikazuki_major', 
            handPose: handPose, // 正確な座標を渡す
            crestLengthScale: 0.95, // 少し控えめに
            crestArcHeightScale: 0.9,
            armorRows: 5,
            headRatio: 0.175,
            armScale: 1.2,
            torsoLeanScale: 1.15,
            attackDurationMs: currentAttackDuration,
            weaponScale: 1.2, 
            backCape: true, 
// ... (palette remains same)
            palette: {
                legBack: '#111',
                legFront: '#1a1a1a',
                robe: '#2b1f1f',
                robeShade: '#1f1616',
                torsoCore: '#151515',
                armorA: '#222',         // 漆黒の鎧
                armorB: '#111',
                armorEdge: '#d4af37',   // 純金の縁取り
                shoulder: '#333',
                helmTop: '#1a1a1a',
                helmBottom: '#0a0a0a',
                crest: '#ffcc00',       // 黄金の前立て
                accent: '#ef4c4c',
                capeTop: '#4e0b0b',     // 深緋色のマント
                capeMid: '#3a0808',
                capeBottom: '#1a0404'
            }
        });

        // 大太刀実体を描画（これでプレイヤーと完全に同じ見た目・エフェクトになる）
        if (this.weaponReplica) {
            this.weaponReplica.render(ctx, this);
        }
        return;
        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const footY = this.y + this.height;
        const runBlend = Math.max(0, Math.min(1, Math.abs(this.vx) / Math.max(1.2, this.speed)));
        const gaitPhase = this.motionTime * 0.01;
        const shoulderX = centerX + dir * 5.3 + this.torsoLean * dir * 0.38;
        const shoulderY = this.y + 37;
        const hipX = centerX - dir * 2.0;
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
            backColor: '#111111', frontColor: '#171717',
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
        ctx.stroke();

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
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(headX, headY, 20, 0.4, Math.PI * 2 - 0.4);
        ctx.fill();

        ctx.fillStyle = '#261e1a';
        ctx.beginPath();
        ctx.arc(headX, headY - 8, 19, Math.PI, 0);
        ctx.fill();

        ctx.strokeStyle = '#261e1a';
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
        const odachi = this.weaponReplica;
        let gripRotation = (-0.9 + Math.sin(this.motionTime * 0.007) * 0.05) * dir;
        let handX = shoulderX + Math.cos((-0.85 + Math.sin(this.motionTime * 0.007) * 0.06) * dir) * 26.8;
        let handY = shoulderY + Math.sin((-0.85 + Math.sin(this.motionTime * 0.007) * 0.06) * dir) * 26.8;
        if (odachi && odachi.isAttacking && typeof odachi.getHandAnchor === 'function') {
            const anchor = odachi.getHandAnchor(this);
            handX = anchor.x;
            handY = anchor.y;
            if (typeof anchor.rotation === 'number') {
                gripRotation = anchor.rotation;
            }
        }

        const leadArm = this.drawJointedArm(ctx, {
            shoulderX,
            shoulderY,
            handX,
            handY,
            upperLen: 14.0,
            foreLen: 15.6,
            bendSign: -dir * 0.8,
            upperWidth: 6.6,
            foreWidth: 5.5,
            jointRadius: 3.8,
            baseColor: '#1b1b1b',
            handColor: '#272129',
            highlightColor: 'rgba(228,214,236,0.12)'
        });
        handX = leadArm.handX;
        handY = leadArm.handY;

        const supportShoulderX = shoulderX - dir * 4.8;
        const supportShoulderY = shoulderY + 2.8;
        const weaponDirX = Math.cos(gripRotation);
        const weaponDirY = Math.sin(gripRotation);
        const supportTargetX = handX - weaponDirX * 12.5 - weaponDirY * 1.4;
        const supportTargetY = handY - weaponDirY * 12.5 + weaponDirX * 1.4;
        const supportArm = this.drawJointedArm(ctx, {
            shoulderX: supportShoulderX,
            shoulderY: supportShoulderY,
            handX: supportTargetX,
            handY: supportTargetY,
            upperLen: 12.7,
            foreLen: 13.2,
            bendSign: dir * 0.86,
            upperWidth: 5.9,
            foreWidth: 5.0,
            jointRadius: 3.3,
            baseColor: '#171617',
            handColor: '#231f24',
            highlightColor: 'rgba(198,182,210,0.1)'
        });
        ctx.fillStyle = '#231f24';
        ctx.beginPath();
        ctx.arc(supportArm.handX, supportArm.handY, 5.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#272129';
        ctx.beginPath();
        ctx.arc(handX, handY, 5.9, 0, Math.PI * 2);
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
        this.hp = 3000;
        this.maxHp = 3000;
        
        // プレイヤー側で強化した大太刀を装備
        this.weaponReplica = createSubWeapon('大太刀');
        if (this.weaponReplica) {
            this.weaponReplica.isBossWeapon = true;
            this.weaponReplica.scale = 1.6; 
        }
        
        // 攻撃パターン (Zコンボの頻度を上げる)
        this.attackPatterns = [
            'z_combo', 'z_combo', 'z_combo', 'z_combo', // 高確率でZコンボ
            'shuriken', 'bomb', 'spear', 'shuriken'
        ];
        
        // 忍具用の武器インスタンスキャッシュ（描画用）
        this.subWeaponInstances = {
            'shuriken': createSubWeapon('手裏剣'),
            'bomb': createSubWeapon('火薬玉'),
            'spear': createSubWeapon('大槍'),
            'kunai': createSubWeapon('手裏剣'), // クナイは手裏剣モデルで代用
            'kusarigama': createSubWeapon('鎖鎌')
        };
        for (const key in this.subWeaponInstances) {
            const inst = this.subWeaponInstances[key];
            if (inst) {
                inst.scale = 3.2; // 将軍スケールに合わせる
                inst.isBossWeapon = true;
            }
        }

        // --- 独自のアニメーション管理 (Actor) ---
        this.actor = new Player(0, 0, this.groundY);
        this.actor.width = 40;  // 内部的には標準サイズ
        this.actor.height = 60;
        
        // 攻撃パターン: Z連撃と各種忍具
        this.attackPatterns = ['z_combo', 'shuriken', 'bomb', 'spear', 'kunai', 'kusarigama'];
        this.comboStep = 0;
        this.subWeaponAction = '';
    }

    update(deltaTime, player) {
        const shouldRemove = super.update(deltaTime, player);
        if (shouldRemove) return true;

        // internal actor の状態を同期
        this.actor.x = this.x;
        this.actor.y = this.y;
        this.actor.vx = this.vx;
        this.actor.vy = this.vy;
        this.actor.facingRight = this.facingRight;
        this.actor.isGrounded = this.isGrounded;
        this.actor.motionTime = this.motionTime;
        this.actor.targetPlayer = player;
        
        return false;
    }

    startAttack() {
        this.isAttacking = true;
        this.attackFacingRight = this.facingRight;
        this.attackFlags = Object.create(null);
        
        // パターン選択
        const pattern = this.attackPatterns[Math.floor(Math.random() * this.attackPatterns.length)];
        this.currentPattern = pattern;

        if (pattern === 'z_combo') {
            this.comboStep = 1;
            this.startComboStep(1);
        } else {
            // 忍具
            const subWeaponNameMap = {
                'shuriken': '手裏剣', 'bomb': '火薬玉', 'spear': '大槍', 'kunai': 'クナイ', 'kusarigama': '鎖鎌'
            };
            this.subWeaponAction = subWeaponNameMap[pattern] || '手裏剣';
            this.attackDuration = 450;
            this.attackTimer = this.attackDuration;
            this.attackCooldown = 550;
            audio.playSlash(2);
        }
    }

    startComboStep(step) {
        this.comboStep = step;
        // 段数に応じたアニメーション時間
        const durations = [0, 180, 180, 240, 280, 360];
        this.attackDuration = durations[step] || 200;
        this.attackTimer = this.attackDuration;
        this.attackFlags = Object.create(null);
        audio.playSlash(Math.min(4, step));
    }

    updateAttack(deltaTime) {
        const player = this.targetPlayer;
        const progress = 1 - (this.attackTimer / Math.max(1, this.attackDuration));
        const dir = this.facingRight ? 1 : -1;

        if (this.currentPattern === 'z_combo') {
            // 踏み込み
            if (progress < 0.3) {
                this.vx = dir * this.speed * (2.8 + this.comboStep * 0.4);
            } else {
                this.vx *= 0.88;
            }

            // 次の段へ
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                if (this.comboStep < 5 && player && Math.abs(player.x - this.x) < this.attackRange * 1.5) {
                    this.startComboStep(this.comboStep + 1);
                } else {
                    this.isAttacking = false;
                    this.attackCooldown = 400;
                }
            }
        } else {
            // 忍具
            this.vx *= 0.92;
            if (progress > 0.4 && !this.attackFlags.fired) {
                this.fireSubWeapon(this.currentPattern);
                this.attackFlags.fired = true;
            }
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }
    }

    fireSubWeapon(type) {
        const dir = this.facingRight ? 1 : -1;
        const speed = type === 'shuriken' ? 14 : (type === 'spear' ? 18 : 8);
        const vx = dir * speed;
        const vy = type === 'bomb' ? -6 : 0;
        const damage = this.damage * (type === 'bomb' ? 3 : 1.5); // ボーナスダメージ
        
        // 将軍のサイズ（3.2倍）に合わせた調整
        // Player互換の高解像度忍具をスポーン
        const proj = new ShogunProjectile(this.x + this.width / 2 + dir * 60, this.y + this.height * 0.4, vx, vy, damage, type);
        // Playerの武器クラスへの参照を持たせて描画を委譲する
        proj.weaponInstance = this.subWeaponInstances[type]; 
        
        this.projectiles.push(proj);
        audio.playSlash(2);
    }

    getAttackHitbox() {
        if (!this.isAttacking || this.currentPattern !== 'z_combo') return null;
        const dir = this.facingRight ? 1 : -1;
        // 3倍スケールのヒットボックス
        return [{
            x: this.x + (dir > 0 ? this.width * 0.4 : -this.width * 1.2),
            y: this.y + this.height * 0.1,
            width: this.width * 1.8,
            height: this.height * 0.8
        }];
    }

    renderBody(ctx) {
        ctx.save();
        
        // 将軍は最大・最凶のボス。スケールを微調整。
        const scale = 3.2;
        const drawX = this.x / scale;
        const drawY = this.y / scale;

        ctx.scale(scale, scale);
        
        // 将軍用のポーズ取得
        const handPose = this.weaponReplica ? this.weaponReplica.getPose(this) : null;
        
        // 武器モードをアクションに応じて動的に決定
        let currentWeaponMode = 'odachi';
        const actionName = this.subWeaponAction || this.currentPattern || '';
        if (actionName.includes('naginata') || actionName.includes('薙刀')) {
            currentWeaponMode = 'naginata';
        } else if (actionName.includes('spear') || actionName.includes('大槍')) {
            currentWeaponMode = 'spear';
        }

        const renderOptions = {
            weaponMode: currentWeaponMode, 
            suppressWeaponDraw: true,
            headStyle: 'kabuto',
            crestVariant: 'shogun',
            renderHair: false, // 完全に描画されないようにブロック
            renderHeadband: false, // バンド部分もブロック
            renderHeadbandTail: false, // テール部分もブロック
            headScale: 0.85, // 少し頭を小さくして頭身を高く見せる（ユーザー要望）
            handPose: handPose, // 座標を同期
            crestLengthScale: 0.95,
            armorRows: 6,
            backCape: true,
            weaponScale: 1.1,
// ... (palette remains same)
            palette: {
                silhouette: '#000',     // 漆黒
                accent: '#ffd700',      // 黄金
                legBack: '#080808',
                legFront: '#121212',
                robe: '#2b1b1b',
                armorA: '#1a1a1a', 
                armorB: '#0a0a0a',
                armorEdge: '#ffd700',   // 黄金
                crest: '#ffd700',
                capeTop: '#4e1212',
                capeMid: '#3a0d0d',
                capeBottom: '#1a0606'
            },
            state: {
                vx: this.vx / scale,
                vy: this.vy / scale,
                isGrounded: this.isGrounded,
                isAttacking: this.isAttacking,
                currentAttack: this.isAttacking ? {
                    comboStep: this.comboStep || 3,
                    durationMs: this.attackDuration,
                    type: ANIM_STATE.ATTACK_DOWN
                } : null,
                attackTimer: this.attackTimer,
                subWeaponTimer: this.isAttacking && this.currentPattern !== 'z_combo' ? this.attackTimer : 0,
                subWeaponAction: this.subWeaponAction,
                motionTime: this.actor.motionTime
            }
        };

        // プレイヤー互換の高度な描画 (renderModel 内部で renderUnifiedEnemyModel と同等の処理が走る場合も想定)
        this.actor.renderModel(ctx, drawX, drawY, this.facingRight, 1.0, true, renderOptions);
        
        ctx.restore();

        // 大太刀実体を描画
        if (this.weaponReplica) {
            this.weaponReplica.render(ctx, this);
        }
    }

    renderShogunCape(ctx, dx, dy, scale) {
        const dir = this.facingRight ? 1 : -1;
        const time = this.actor.motionTime * 0.002;
        const wave = Math.sin(time) * 2;
        
        ctx.save();
        ctx.translate(dx + 20, dy + 20);
        ctx.globalCompositeOperation = 'destination-over'; // 背中側
        
        ctx.fillStyle = '#4e0b0b'; // 深緋色
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-dir * 25 + wave, 10, -dir * 30 + wave, 60);
        ctx.lineTo(dir * 5 + wave, 65);
        ctx.quadraticCurveTo(dir * 10 + wave, 30, 0, 0);
        ctx.fill();
        
        ctx.strokeStyle = '#1a0505';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
    }
}

// 妖術関連の古いプロジェクタイルクラスを削除し、プレイヤー互換の忍具クラスを実装しました。

class ShogunProjectile {
    constructor(x, y, vx, vy, damage, type = 'spear') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.type = type;
        this.radius = type === 'shuriken' ? 30 : 45; // 大きい当たり判定
        this.isAlive = true;
        this.angle = 0;
        this.life = 3000;
        this.weaponInstance = null; // boss.js側でセットされる
    }

    update(deltaTime, player) {
        this.x += this.vx;
        this.y += this.vy;
        
        // 回転アニメーション（手裏剣など）
        if (this.type === 'shuriken') {
            this.angle += (this.vx > 0 ? 0.35 : -0.35);
        } else if (this.type === 'bomb') {
            this.vy += GRAVITY * deltaTime * 1000; // 重力
            this.angle += (this.vx > 0 ? 0.1 : -0.1);
        } else {
            // スピアなどは進行方向に向く
            this.angle = Math.atan2(this.vy, this.vx);
        }

        this.life -= deltaTime * 1000;
        if (this.life <= 0) return false;

        // プレイヤー衝突判定
        const dx = (player.x + player.width / 2) - this.x;
        const dy = (player.y + player.height / 2) - this.y;
        if (Math.hypot(dx, dy) < this.radius + 15) {
            player.takeDamage(this.damage);
            return false;
        }
        return true;
    }

    render(ctx) {
        if (!this.weaponInstance) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        // 手裏剣以外は角度・向きを適用。手裏剣はweaponManager内で回る想定だが、手動でも回す
        if (this.type !== 'shuriken') {
            ctx.rotate(this.angle);
            if (this.vx < 0) ctx.scale(1, -1);
        }
        
        // プロジェクタイル専用の状態をダミーのプレイヤー構造として渡す
        const dummyAttacker = {
            facingRight: this.type === 'shuriken' ? true : this.vx > 0, // スピアなどはrotateで処理済み
            animState: 'attack',
            x: 0, 
            y: 0,
            width: 0,
            height: 0
        };
        
        // 描画
        if (this.type === 'shuriken') {
            // 回転を適用
            ctx.rotate(this.angle);
            this.weaponInstance.render(ctx, dummyAttacker);
        } else if (this.type === 'bomb') {
            this.weaponInstance.render(ctx, dummyAttacker);
        } else if (this.type === 'spear') {
            // 槍は柄の端ではなく、真ん中あたりで描画されるようオフセット
            ctx.translate(-50, 0);
            this.weaponInstance.render(ctx, dummyAttacker);
        } else {
            this.weaponInstance.render(ctx, dummyAttacker);
        }

        ctx.restore();
    }
}

class SpearProjectile {
    constructor(x, y, vx, vy, damage, type = 'spear') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.type = type;
        this.radius = type === 'shuriken' ? 12 : 18;
        this.isAlive = true;
        this.angle = 0;
        this.life = 3000;
    }

    update(deltaTime, player) {
        this.x += this.vx;
        this.y += this.vy;
        this.angle += 0.25;
        this.life -= deltaTime * 1000;

        if (this.life <= 0) return false;

        // プレイヤー衝突判定
        const dx = (player.x + player.width / 2) - this.x;
        const dy = (player.y + player.height / 2) - this.y;
        if (Math.hypot(dx, dy) < this.radius + 15) {
            player.takeDamage(this.damage);
            return false;
        }
        return true;
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.vx > 0 ? 1 : -1, 1);
        ctx.rotate(this.angle);

        if (this.type === 'shuriken') {
            // 手裏剣描画 (黒金)
            ctx.fillStyle = '#0a0a0a';
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, -this.radius);
                ctx.lineTo(this.radius * 0.3, 0);
                ctx.lineTo(0, this.radius * 0.3);
                ctx.lineTo(-this.radius * 0.3, 0);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        } else {
            // 槍描画 (黒金)
            ctx.strokeStyle = '#3d2b1f';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();
            ctx.fillStyle = '#d4af37';
            ctx.beginPath();
            ctx.moveTo(20, -6);
            ctx.lineTo(35, 0);
            ctx.lineTo(20, 6);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

class BombProjectile {
    constructor(x, y, vx, vy, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.radius = 10;
        this.isAlive = true;
        this.timer = 0;
        this.isExploding = false;
        this.explosionTimer = 0;
        this.explosionRadius = 70;
    }

    update(deltaTime, player) {
        if (this.isExploding) {
            this.explosionTimer += deltaTime * 1000;
            if (this.explosionTimer > 400) return false;
            
            // 爆発ダメージ判定 (一度だけ)
            if (this.explosionTimer < 50) {
                const dx = (player.x + player.width / 2) - this.x;
                const dy = (player.y + player.height / 2) - this.y;
                if (Math.hypot(dx, dy) < this.explosionRadius) {
                    player.takeDamage(this.damage);
                }
            }
            return true;
        }

        this.vy += 0.45;
        this.x += this.vx;
        this.y += this.vy;
        this.timer += deltaTime * 1000;

        if (this.timer > 1500) {
            this.isExploding = true;
            audio.playExplosion();
        }
        return true;
    }

    render(ctx) {
        if (this.isExploding) {
            const p = this.explosionTimer / 400;
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.explosionRadius * Math.sin(p * Math.PI), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 100, 0, ${1 - p})`;
            ctx.fill();
            ctx.restore();
            return;
        }
        ctx.save();
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}

class KunaiProjectile {
    constructor(x, y, vx, vy, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.radius = 8;
        this.angle = Math.atan2(vy, vx);
        this.isAlive = true;
    }

    update(deltaTime, player) {
        this.x += this.vx;
        this.y += this.vy;
        
        const dx = (player.x + player.width / 2) - this.x;
        const dy = (player.y + player.height / 2) - this.y;
        if (Math.hypot(dx, dy) < this.radius + 15) {
            player.takeDamage(this.damage);
            return false;
        }
        return this.x > -100 && this.x < 5000; // 適当な範囲
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#0a0a0a';
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, -3);
        ctx.lineTo(10, 0);
        ctx.lineTo(-10, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

class KusarigamaProjectile {
    constructor(x, y, vx, vy, damage, owner) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.owner = owner;
        this.radius = 15;
        this.isReturning = false;
        this.timer = 0;
    }

    update(deltaTime, player) {
        this.timer += deltaTime * 1000;
        if (!this.isReturning) {
            this.x += this.vx;
            this.y += this.vy;
            if (this.timer > 400) this.isReturning = true;
        } else {
            const dx = (this.owner.x + this.owner.width / 2) - this.x;
            const dy = (this.owner.y + this.owner.height / 2) - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 30) return false;
            this.x += (dx / dist) * 15;
            this.y += (dy / dist) * 15;
        }

        const dx = (player.x + player.width / 2) - this.x;
        const dy = (player.y + player.height / 2) - this.y;
        if (Math.hypot(dx, dy) < this.radius + 15) {
            player.takeDamage(this.damage);
        }
        return true;
    }

    render(ctx) {
        ctx.save();
        // 鎖
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.owner.x + this.owner.width / 2, this.owner.y + this.owner.height / 2);
        ctx.stroke();
        
        // 鎌
        ctx.translate(this.x, this.y);
        ctx.rotate(this.timer * 0.02);
        ctx.fillStyle = '#0a0a0a';
        ctx.strokeStyle = '#d4af37';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI, true);
        ctx.lineTo(0, -this.radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
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
