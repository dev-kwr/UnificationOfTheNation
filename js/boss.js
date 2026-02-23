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

        // ボスは右側から現れるため、初期方向をプレイヤー側（左）にする
        this.facingRight = false;
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
            this.tryJump(0.022, -15, 400);
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
                timer: 0, maxTimer: 2500, isExploding: false,
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

                    // プレイヤーとの当たり判定（プロパティ直接参照のみ）
                    const player = window.game ? window.game.player : null;
                    if (player && !player.isInvincible && player.width && player.height) {
                        const hb = this.getHitbox();
                        const px = player.x;
                        const py = player.y;
                        const pw = player.width;
                        const ph = player.height;
                        
                        if (hb.x < px + pw && hb.x + hb.width > px &&
                            hb.y < py + ph && hb.y + hb.height > py) {
                            this.explode();
                            return false;
                        }
                    }

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
        this.attackPatterns = ['main', 'combined'];
        this.dualAttackCycle = 0;
        this.setupWeaponReplica('二刀流');
    }
    
    startAttack() {
        const toolTier = this.getSubWeaponEnhanceTier();
        this.dualAttackCycle++;

        // z技（二刀流コンボ=main）と合体斬撃（x技=combined）だけを使用
        // 4回に1回は合体斬撃、それ以外はコンボ
        const type = (this.dualAttackCycle % 4 === 0) ? 'combined' : 'main';
        this.currentPattern = type;

        if (this.startWeaponReplicaAttack(type)) {
            if (type === 'combined') {
                this.attackCooldown = Math.max(130, 260 - toolTier * 30);
            } else {
                this.attackCooldown = Math.max(65, 110 - toolTier * 15);
            }
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
            suppressSlashEffect: true,
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

        // DualBlades の弧エフェクト・飛翔斬撃だけ追加で描画
        if (this.weaponReplica && typeof this.weaponReplica.render === 'function') {
            this.weaponReplica.render(ctx, this);
        }
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
        // 本体描画（武器は weaponMode: 'none' にしてここでは描かない）
        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'none', 
            headStyle: 'ninja',
            armorRows: 3,
            headRatio: 0.19,
            armScale: 1.12,
            torsoLeanScale: 1.12,
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

        const kusa = this.weaponReplica;
        if (!kusa) return;

        // 鎖鎌忍具の描画を直接呼び出す（これで形状とエフェクトが完全に統一される）
        if (typeof kusa.render === 'function') {
            kusa.render(ctx, this);
        }

        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const shoulderY = this.y + this.height * 0.38 + Math.abs(this.bob) * 0.14;
        const leanBase = (1.2 + this.torsoLean * 0.55 + (this.isAttacking ? 0.9 : 0)) * 1.12; // torsoLeanScale: 1.12
        const facingLead = dir * this.width * 0.035;
        const shoulderCenterX = centerX + dir * leanBase + facingLead;
        const bodyScreenTilt = dir * this.width * 0.038;
        const shoulderFrontX = shoulderCenterX + dir * (this.width * 0.12 + bodyScreenTilt * 0.3);
        
        // 忍具の「手元」位置を取得
        let handX, handY;
        if (kusa.isAttacking && typeof kusa.getHandAnchor === 'function') {
            const anchor = kusa.getHandAnchor(this);
            handX = anchor.x;
            handY = anchor.y;
        } else {
            // アイドル時の角度
            const idleAngleRaw = -0.58 + Math.sin(this.motionTime * 0.01) * 0.08;
            const idleAngle = dir === 1 ? idleAngleRaw : Math.PI - idleAngleRaw;
            handX = shoulderFrontX + Math.cos(idleAngle) * 23.2;
            handY = shoulderY + Math.sin(idleAngle) * 23.2;
        }

        // 腕の描画
        this.drawJointedArm(ctx, {
            shoulderX: shoulderFrontX,
            shoulderY: shoulderY,
            handX: handX,
            handY: handY,
            upperLen: this.height * 0.18 * 1.12, // armScale: 1.12
            foreLen: this.height * 0.18 * 1.12,
            bendSign: -dir * 0.82,
            upperWidth: this.width * 0.12,
            foreWidth: this.width * 0.108,
            jointRadius: this.width * 0.078,
            baseColor: '#131318', // torsoCore
            handColor: '#1a1a1a'  // legFront
        });

        // 拳の描画
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(handX, handY, 4.8, 0, Math.PI * 2);
        ctx.fill();
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
        const currentAttackDuration = isSpecial && this.weaponReplica
            ? (this.weaponReplica.totalDuration || 680)
            : 680;
        
        // 大太刀実体から手の位置（pose）を正確に取得し、モデルに伝える
        const handPose = this.weaponReplica ? this.weaponReplica.getPose(this) : null;

        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'none', // 腕と武器は手動で同期描画するため 'none'
            headStyle: 'kabuto',
            crestVariant: 'mikazuki_major', 
            handPose: handPose, 
            crestLengthScale: 0.95, 
            crestArcHeightScale: 0.9,
            armorRows: 5,
            headRatio: 0.175,
            armScale: 1.2,
            torsoLeanScale: 1.15,
            attackDurationMs: currentAttackDuration,
            weaponScale: 1.2, 
            backCape: true, 
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

        if (this.weaponReplica) {
            this.weaponReplica.render(ctx, this);
        }

        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const shoulderY = this.y + this.height * 0.38 + Math.abs(this.bob) * 0.14;
        const leanBase = (1.2 + this.torsoLean * 0.55 + (this.isAttacking ? 0.9 : 0)) * 1.15; // torsoLeanScale: 1.15
        const facingLead = dir * this.width * 0.035;
        const shoulderCenterX = centerX + dir * leanBase + facingLead;
        const bodyScreenTilt = dir * this.width * 0.038;
        const shoulderX = shoulderCenterX + dir * (this.width * 0.12 + bodyScreenTilt * 0.3);
        
        const odachi = this.weaponReplica;
        let handX, handY, gripRotation;
        if (odachi && typeof odachi.getHandAnchor === 'function') {
            const anchor = odachi.getHandAnchor(this);
            handX = anchor.x;
            handY = anchor.y;
            gripRotation = anchor.rotation;
        } else {
            gripRotation = (-0.9 + Math.sin(this.motionTime * 0.007) * 0.05) * dir;
            handX = shoulderX + Math.cos((-0.85 + Math.sin(this.motionTime * 0.007) * 0.06) * dir) * 26.8;
            handY = shoulderY + Math.sin((-0.85 + Math.sin(this.motionTime * 0.007) * 0.06) * dir) * 26.8;
        }

        // 利き腕（手前）
        this.drawJointedArm(ctx, {
            shoulderX,
            shoulderY,
            handX,
            handY,
            upperLen: 14.0 * 1.2, // armScale: 1.2
            foreLen: 15.6 * 1.2,
            bendSign: -dir * 0.82,
            upperWidth: 6.2,
            foreWidth: 5.4,
            jointRadius: 3.8,
            baseColor: '#151515',
            handColor: '#1a1a1a'
        });

        // 添え手（奥）
        const supportShoulderX = shoulderX - dir * 4.8;
        const supportShoulderY = shoulderY + 2.8;
        const weaponDirX = Math.cos(gripRotation);
        const weaponDirY = Math.sin(gripRotation);
        const supportTargetX = handX - weaponDirX * 12.5 - weaponDirY * 1.4;
        const supportTargetY = handY - weaponDirY * 12.5 + weaponDirX * 1.4;
        
        this.drawJointedArm(ctx, {
            shoulderX: supportShoulderX,
            shoulderY: supportShoulderY,
            handX: supportTargetX,
            handY: supportTargetY,
            upperLen: 12.7 * 1.2,
            foreLen: 13.2 * 1.2,
            bendSign: dir * 0.86,
            upperWidth: 5.9,
            foreWidth: 5.0,
            jointRadius: 3.3,
            baseColor: '#171617',
            handColor: '#231f24'
        });

        this.renderPhaseBodyTint(ctx, 9);
    }
}

// ステージ6ボス: 将軍（ラスボス）
export class Shogun extends Boss {
    // ============================================================
    // Lv3分身と完全に同じ仕組みで動く。
    // actor（Playerインスタンス）の状態を直接書き換えてrenderModelを呼ぶ。
    // slashTrail・攻撃プロファイル・AI移動はすべてactorのメソッドを借用。
    // 将軍専用の装飾は一切持たない。
    // ============================================================

    init() {
        super.init();
        this.bossName = '将軍';
        this.hp = 4500;
        this.maxHp = 4500;
        this.damage = 6;
        this.speed = 3.8;
        this.attackRange = 120;
        this.incomingDamageScale = 0.55;
        this.weaponReplica = null;

        // Playerと同じサイズ
        this.width  = 40;
        this.height = 60;

        // ---- actor: renderModel/trail/profileを借りるためのPlayerインスタンス ----
        this.actor = new Player(0, 0, this.groundY);
        this.actor.width  = this.width;
        this.actor.height = this.height;
        // プレイヤーと同等のスキルをフル解放（5段コンボ・忍具Lv3）
        this.actor.progression = {
            normalCombo: 3,  // getNormalComboMax() = 2+3 = 5段フル
            subWeapon:   3,
            specialClone: 3,
        };
        // 奥義分身システムを1スロット分だけ初期化（trailバッファに必要）
        this.actor.specialCloneSlots              = [0];
        this.actor.specialCloneAlive              = [true];
        this.actor.specialClonePositions          = [{ x: this.x, y: this.y, facingRight: false, prevX: this.x }];
        this.actor.specialCloneAttackTimers       = [0];
        this.actor.specialCloneSubWeaponTimers    = [0];
        this.actor.specialCloneSubWeaponActions   = [null];
        this.actor.specialCloneComboSteps         = [0];
        this.actor.specialCloneSlashTrailPoints   = [[]];
        this.actor.specialCloneSlashTrailSampleTimers = [0];
        this.actor.specialCloneAutoAiEnabled      = true;
        this.actor.isUsingSpecial                 = true;
        this.actor.specialCloneCombatStarted      = true;

        // ---- 内部状態（分身のposと同じ役割） ----
        this._attackTimer      = 0;    // Zコンボ残り時間
        this._comboStep        = 0;    // 次回コンボのインデックス（0-4）
        this._currentComboStep = 1;    // 現在攻撃中のコンボ段（1-5、renderBody参照用）
        this._comboPendingSteps = [];  // 残り連続コンボ段キュー
        this._subTimer         = 0;    // 忍具アニメーション残り時間
        this._subAction        = null; // 忍具アクション文字列
        this._subWeaponKey     = null; // 現在使用中の忍具キー ('shuriken','bomb',etc.)

        this._subWeaponInstances = {
            shuriken:   createSubWeapon('手裏剣'),
            bomb:       createSubWeapon('火薬玉'),
            spear:      createSubWeapon('大槍'),
            dual:       createSubWeapon('二刀流'),
            kusarigama: createSubWeapon('鎖鎌'),
            odachi:     createSubWeapon('大太刀'),
        };

        // 武器の use()/update() が Player を期待するため、Shogun 自身に
        // 必要な Player 互換プロパティをスタブとして追加する
        this.isCrouching  = false;
        this.progression  = { subWeapon: 3, normalCombo: 3 };
        this.subWeaponAction  = null;
        this.subWeaponTimer   = 0;
        this.currentSubWeapon = null;
        this.getSubWeaponEnhanceTier  = () => 3;
        this.getSubWeaponCloneOffsets = () => [];
        this.triggerCloneSubWeapon    = () => {};
        this.getFootY = () => this.y + this.height;
    }

    // ---- Boss.update() から呼ばれる ----
    update(deltaTime, player) {
        const shouldRemove = super.update(deltaTime, player);
        if (shouldRemove) return true;

        const deltaMs = deltaTime * 1000;

        // actor のスロット[0]にタイマーを書き戻してupdateSpecialCloneSlashTrailsを動かす
        this.actor.specialClonePositions[0] = {
            x: this.x + this.width * 0.5,
            y: this.y + this.height * 0.62,
            facingRight: this.facingRight,
            prevX: this.x + this.width * 0.5,
            jumping: !this.isGrounded,
            cloneVy: this.vy,
            renderVx: this.vx,
        };
        this.actor.specialCloneAttackTimers[0]     = this._attackTimer;
        this.actor.specialCloneComboSteps[0]       = this._comboStep;
        this.actor.specialCloneSubWeaponTimers[0]  = this._subTimer;
        this.actor.specialCloneSubWeaponActions[0] = this._subAction;
        this.actor.motionTime = this.motionTime;
        this.actor.speed      = this.speed;
        this.actor.width      = this.width;
        this.actor.height     = this.height;

        // slashTrail の dualActionActive 判定に currentSubWeapon が必要なため同期する
        // （二刀流Z技中は dualInst をセット、それ以外は null）
        this.actor.currentSubWeapon = (this._subWeaponKey === 'dual' && this._subAction === '二刀_Z')
            ? this._subWeaponInstances['dual']
            : null;

        // slashTrail 更新（actorのメソッドをそのまま借用）
        this.actor.updateSpecialCloneSlashTrails(deltaMs);

        // X攻撃中：忍具インスタンスのupdate（内部状態・弾道処理を進める）
        if (this._subTimer > 0 && this._subWeaponKey) {
            const subInst = this._subWeaponInstances[this._subWeaponKey];
            if (subInst && typeof subInst.update === 'function') {
                const targetPlayer = this.targetPlayer;
                const enemyArg = targetPlayer ? [targetPlayer] : [];
                if (this._subWeaponKey === 'shuriken') {
                    subInst.update(deltaTime, enemyArg);
                    // _subTimer 中もprojectiles同期（発射直後の最初の150msも描画・当たり判定させる）
                    for (const p of subInst.projectiles) {
                        if (!this.projectiles.includes(p)) {
                            this.projectiles.push(p);
                        }
                    }
                } else {
                    subInst.update(deltaTime);
                }
                // 鎖鎌・大太刀は武器側の終了を検知して即座にタイマーをリセット
                if (
                    (this._subWeaponKey === 'kusarigama' || this._subWeaponKey === 'odachi') &&
                    !subInst.isAttacking
                ) {
                    this._subTimer = 0;
                    this._subAction = null;
                    this._subWeaponKey = null;
                }
            }
        }

        // 手裏剣は _subTimer=150ms が切れた後もprojectileが飛び続けるため
        // _subTimer と切り離して毎フレーム独立してupdateする。
        // （_subTimer=0 になると _subWeaponKey が null になりupdateが止まる問題を解消）
        {
            const shurikenInst = this._subWeaponInstances['shuriken'];
            if (shurikenInst && Array.isArray(shurikenInst.projectiles) && shurikenInst.projectiles.length > 0) {
                const targetPlayer = this.targetPlayer;
                const enemyArg = targetPlayer ? [targetPlayer] : [];
                // _subTimer 中は二重呼び出しになるため、_subWeaponKey=shuriken のときはスキップ
                if (this._subWeaponKey !== 'shuriken') {
                    shurikenInst.update(deltaTime, enemyArg);
                }
                // projectilesをShogunのprojectilesに同期（描画用）
                for (const p of shurikenInst.projectiles) {
                    if (!this.projectiles.includes(p)) {
                        this.projectiles.push(p);
                    }
                }
            }
            // 死んだprojectilesをShogun側からも除去
            this.projectiles = this.projectiles.filter(p => !p.isDestroyed);
        }

        return false;
    }

    // ---- Boss.updateAI() が攻撃範囲に入ったとき呼ぶ ----
    startAttack() {
        if (this._attackTimer > 0 || this._subTimer > 0) return;

        this.isAttacking = true;
        this.attackFacingRight = this.facingRight;

        const roll = Math.random();
        if (roll < 0.40) {
            // Zコンボ：5段連続発動。_comboPendingSteps に残りの段を積んで
            // updateAttack() が1段終わるたびに次段を自動発動する。
            this._comboPendingSteps = [1, 2, 3, 4, 5];
            this._startNextComboStep();
        } else {
            // X攻撃：プレイヤーと同じduration（player.js L516-519参照）
            const weapons   = ['shuriken', 'bomb', 'spear', 'dual', 'dual_z', 'kusarigama', 'odachi'];
            const type      = weapons[Math.floor(Math.random() * weapons.length)];
            const actionMap = {
                shuriken: 'throw', bomb: 'throw',
                spear: '大槍', kusarigama: '鎖鎌',
                odachi: '大太刀', dual: '二刀_合体', dual_z: '二刀_Z',
            };
            // 各武器の実際のアニメーション時間をインスタンスから取得する。
            // 固定値で管理すると武器の totalDuration（tier反映後）とズレて
            // isAttacking=false になった後もタイマーが残り描画が壊れるため。
            const getDuration = (key) => {
                const inst = this._subWeaponInstances[key];
                if (!inst) return 300;
                // Nodachi は totalDuration + plantedDuration が実際の表示時間
                if (inst.totalDuration && inst.plantedDuration) {
                    return inst.totalDuration + inst.plantedDuration + 60;
                }
                if (inst.totalDuration) return inst.totalDuration + 60;
                if (inst.attackDuration) return inst.attackDuration + 60;
                return 300;
            };
            const durationMap = {
                shuriken: 150, bomb: 150,
                spear:    getDuration('spear'),
                kusarigama: getDuration('kusarigama'),
                odachi:     getDuration('odachi'),
                dual: 220,
                dual_z: this._subWeaponInstances.dual
                    ? (this._subWeaponInstances.dual.mainDuration || 204)
                    : 204,
            };
            // dual_z は dual インスタンスを使う
            const weaponKey = type === 'dual_z' ? 'dual' : type;
            const duration     = durationMap[type] || 300;
            this._subAction    = actionMap[type];
            this._subWeaponKey = weaponKey;
            this._subTimer     = duration;
            this.attackTimer   = duration;
            this.attackCooldown = 400;
            this._fireSubWeapon(type);
            audio.playSlash(2);
        }
    }

    // ---- 1コンボ段を開始するヘルパー ----
    _startNextComboStep() {
        const step = this._comboPendingSteps.shift();
        if (step == null) {
            // 全段終了
            this._attackTimer = 0;
            this.isAttacking  = false;
            this.attackCooldown = 480;
            return;
        }
        // attackMotionScale=1 で素のdurationを使う（actorの1.7倍引き伸ばしを回避）
        const COMBO_DURATIONS = [182, 138, 208, 248, 336]; // COMBO_ATTACKSと同期
        const dur = COMBO_DURATIONS[step - 1] || 200;
        this._currentComboStep = step;
        this._comboStep = step % 5;
        this._attackTimer = dur;
        this.attackTimer  = dur;
        this.isAttacking  = true;
        this.attackCooldown = Math.max(100, dur * 0.5);
        audio.playSlash(Math.min(4, step));
    }

    // ---- 攻撃アニメーション更新 ----
    updateAttack(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const dir = this.facingRight ? 1 : -1;

        if (this._attackTimer > 0) {
            // Zコンボ：踏み込み
            const elapsed = (this.attackTimer || this._attackTimer) - this._attackTimer;
            const duration = this.attackTimer || this._attackTimer;
            const progress = duration > 0 ? elapsed / duration : 1;
            if (progress < 0.4) {
                this.vx = dir * this.speed * 3.2;
            } else {
                this.vx *= 0.88;
            }
            this._attackTimer -= deltaMs;
            if (this._attackTimer <= 0) {
                this._attackTimer = 0;
                // 次の段があれば連続発動、なければ終了
                if (this._comboPendingSteps && this._comboPendingSteps.length > 0) {
                    this._startNextComboStep();
                } else {
                    this.isAttacking  = false;
                    this.attackCooldown = Math.max(this.attackCooldown, 480);
                }
            }
        } else if (this._subTimer > 0) {
            this.vx *= 0.92;
            this._subTimer -= deltaMs;
            if (this._subTimer <= 0) {
                this._subTimer     = 0;
                this._subAction    = null;
                this._subWeaponKey = null;
                this.isAttacking   = false;
                this.attackCooldown = Math.max(this.attackCooldown, 300);
            }
        } else {
            this.isAttacking = false;
        }
    }

    _fireSubWeapon(type) {
        // dual_z は dual インスタンスを使う
        const resolvedKey = type === 'dual_z' ? 'dual' : type;
        const subInst = this._subWeaponInstances[resolvedKey];
        if (!subInst) return;
        // apply enhance tier before firing（プレイヤーと同じtier=3）
        if (typeof subInst.applyEnhanceTier === 'function') {
            subInst.applyEnhanceTier(3, this);
        } else {
            subInst.enhanceTier = 3;
        }
        // Shogun 自身を player として渡す（vx/vy/x/y が直接反映される）
        // currentSubWeapon・attackCombo を一時設定して use() 後に戻す
        const prevSubWeapon  = this.currentSubWeapon;
        const prevAttackCombo = this.attackCombo;
        this.currentSubWeapon = subInst;
        this.attackCombo      = this._comboStep;

        // 大槍は use() 内で player.vx += dashBoost(tier3=176) を加算する。
        // Shogun に直接適用すると画面外まで吹っ飛ぶため use 前の vx を保存し、
        // use 後に適切な突進速度（direction * speed * 3.5）に置き換える。
        const prevVx = this.vx;
        const isSpear = (resolvedKey === 'spear');

        // 二刀流のみ type に応じてモードを切り替え（combined=合体技, main=Z連撃）
        const useMode = type === 'dual' ? 'combined' : (type === 'dual_z' ? 'main' : undefined);
        subInst.use(this, useMode);

        if (isSpear) {
            // dashBoost の加算をキャンセルし、Shogun 用の突進速度に上書き
            const dir = this.facingRight ? 1 : -1;
            this.vx = prevVx + dir * this.speed * 3.5;
        }

        this.currentSubWeapon = prevSubWeapon;
        this.attackCombo      = prevAttackCombo;
    }

    // ---- ヒットボックス（Zコンボ＋X攻撃） ----
    getAttackHitbox() {
        if (this._attackTimer > 0) {
            // Zコンボ：分身Lv3と同じ比率
            const dir = this.facingRight ? 1 : -1;
            return [{
                x: this.x + (dir > 0 ? this.width * 0.4 : -this.width * 1.2),
                y: this.y + this.height * 0.1,
                width: this.width * 1.8,
                height: this.height * 0.8,
            }];
        }
        if (this._subTimer > 0 && this._subWeaponKey) {
            // X攻撃：武器インスタンスのヒットボックスを使う
            const subInst = this._subWeaponInstances[this._subWeaponKey];
            if (subInst && typeof subInst.getHitbox === 'function') {
                const hb = subInst.getHitbox(this);
                if (hb) return Array.isArray(hb) ? hb : [hb];
            }
        }
        return null;
    }

    // ---- renderBody：分身Lv3のrenderSpecialと完全に同じパターン ----
    renderBody(ctx) {
        const i = 0;

        // slashTrail 描画（分身と同じ方法）
        const trailPoints = this.actor.specialCloneSlashTrailPoints[i];
        if (trailPoints && trailPoints.length > 1) {
            const trailScale = typeof this.actor.getXAttackTrailWidthScale === 'function'
                ? this.actor.getXAttackTrailWidthScale()
                : 1.0;
            this.actor.renderComboSlashTrail(ctx, {
                points: trailPoints,
                centerX: this.x + this.width * 0.5,
                centerY: this.y + this.height * 0.5,
                trailWidthScale: trailScale,
                boostActive: trailScale > 1.01 && this._attackTimer > 0,
            });
        }

        // actor の状態を一時退避（分身renderSpecialのsaved/restoreパターンと同じ）
        const saved = {
            isAttacking:          this.actor.isAttacking,
            currentAttack:        this.actor.currentAttack,
            attackTimer:          this.actor.attackTimer,
            attackCombo:          this.actor.attackCombo,
            subWeaponTimer:       this.actor.subWeaponTimer,
            subWeaponAction:      this.actor.subWeaponAction,
            currentSubWeapon:     this.actor.currentSubWeapon,
            facingRight:          this.actor.facingRight,
            x:                    this.actor.x,
            y:                    this.actor.y,
            vx:                   this.actor.vx,
            vy:                   this.actor.vy,
            isGrounded:           this.actor.isGrounded,
            isCrouching:          this.actor.isCrouching,
            isDashing:            this.actor.isDashing,
            motionTime:           this.actor.motionTime,
            height:               this.actor.height,
            forceSubWeaponRender: this.actor.forceSubWeaponRender,
        };

        // 描画位置・物理状態を注入
        this.actor.x           = this.x;
        this.actor.y           = this.y;
        this.actor.vx          = this.vx;
        this.actor.vy          = this.vy;
        this.actor.isGrounded  = this.isGrounded;
        this.actor.isCrouching = false;
        this.actor.isDashing   = false;
        this.actor.motionTime  = this.motionTime;
        this.actor.height      = this.height;
        this.actor.facingRight = this.facingRight;

        const renderOpts = {
            renderHeadbandTail: false,
            renderHeadband:     false,
            useLiveAccessories: false,
            forceSubWeaponRender: (this._subTimer > 0 && this._subAction != null),
        };

        if (this._attackTimer > 0) {
            // Zコンボ：分身Lv3の攻撃描画パスと同じ
            const comboStep = this._currentComboStep || ((this._comboStep % 5) + 1);
            const profile   = this.actor.getComboAttackProfileByStep(comboStep);
            this.actor.isAttacking    = true;
            this.actor.attackCombo    = comboStep;
            this.actor.currentAttack  = { ...profile, comboStep };
            this.actor.attackTimer    = this._attackTimer;
            this.actor.subWeaponTimer  = 0;
            this.actor.subWeaponAction = null;
            this.actor.currentSubWeapon = null;

        } else if (this._subTimer > 0 && this._subAction) {
            // X攻撃：プレイヤーと同じ描画パス
            // _subWeaponKeyが保存されていればそれを優先、なければactionからフォールバック
            const subInst = this._subWeaponKey
                ? this._subWeaponInstances[this._subWeaponKey]
                : (() => {
                    const actionToKey = { 'throw': 'shuriken', '大槍': 'spear', '鎖鎌': 'kusarigama', '大太刀': 'odachi', '二刀_合体': 'dual' };
                    const k = actionToKey[this._subAction];
                    return k ? this._subWeaponInstances[k] : null;
                })();
            this.actor.isAttacking     = false;
            this.actor.currentAttack   = null;
            this.actor.attackTimer     = 0;
            this.actor.subWeaponTimer  = Math.max(1, this._subTimer);
            this.actor.subWeaponAction = this._subAction;
            this.actor.currentSubWeapon = subInst || null;

            // 武器インスタンス側の同期処理
            if (subInst) {
                // DualBlades: attackTimer を _subTimer に同期
                // （effectiveSubWeaponTimer が dualBlade.attackTimer を使うため）
                // 鎖鎌・大太刀は自前の attackTimer/totalDuration で動くので上書きしない
                const isDualBlade = subInst.name === '二刀流';
                if (isDualBlade && typeof subInst.attackTimer !== 'undefined') {
                    if (!subInst.isAttacking || subInst.attackTimer <= 0) {
                        subInst.attackTimer = this._subTimer;
                    }
                }
                // 描画中だけ isAttacking=true にして render 内チェックをパス
                if (!subInst.isAttacking) {
                    subInst._renderForceActive = true;
                    subInst.isAttacking = true;
                }
            }
            // 鎖鎌・大太刀など forceSubWeaponRender フラグを必要とする武器向け
            this.actor.forceSubWeaponRender = true;

        } else {
            // 待機・移動
            this.actor.isAttacking     = false;
            this.actor.currentAttack   = null;
            this.actor.attackTimer     = 0;
            this.actor.subWeaponTimer  = 0;
            this.actor.subWeaponAction = null;
            this.actor.currentSubWeapon = null;
        }

        // Enemy.render() は renderBody を呼ぶ前に yawSkew + scale(0.982,1) を
        // ctx に適用する（2.5D奥行き感演出）。この変換は棒人間シルエットには
        // 自然だが、大太刀などの縦長武器の形状を歪める。
        // 逆変換（yawSkewとscaleを打ち消す）を適用してから renderModel を呼ぶ。
        // yawSkew と pivotX/Y は Enemy.render() 内の計算と同じ値を再現する。
        {
            const dir2d = this.facingRight ? 1 : -1;
            const pivotX = this.x + this.width * 0.5;
            const pivotY = this.y + this.height * 0.62;
            const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
            const attackBias = this.isAttacking ? 0.013 : 0;
            const yawSkew = dir2d * (0.046 + moveBias + attackBias);
            // 逆変換を積む：scale(1/0.982) → shear(-yawSkew)
            ctx.save();
            ctx.translate(pivotX, pivotY);
            ctx.transform(1, 0, -yawSkew / 0.982, 1, 0, 0); // shear逆
            ctx.scale(1 / 0.982, 1);                          // scale逆
            ctx.translate(-pivotX, -pivotY);
            this.actor.renderModel(ctx, this.x, this.y, this.facingRight, 1.0, true, renderOpts);
            ctx.restore();
        }

        // DualBladesの飛翔斬撃は renderSubWeaponArm では描画されないため直接呼ぶ。
        // 大太刀・鎖鎌・大槍は renderModel 内ですでに render() が呼ばれるため
        // ここに追加すると二重描画になる。dual のみ。
        if (this._subTimer > 0 && this._subWeaponKey === 'dual') {
            const dualInst = this._subWeaponInstances['dual'];
            if (dualInst && typeof dualInst.render === 'function') {
                const wasAttacking = dualInst.isAttacking;
                if (!wasAttacking) dualInst.isAttacking = true;
                // yawSkew（Enemy.render の 2.5D 変換）を逆変換して打ち消す
                {
                    const dir2d = this.facingRight ? 1 : -1;
                    const pivotX = this.x + this.width * 0.5;
                    const pivotY = this.y + this.height * 0.62;
                    const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
                    const attackBias = this.isAttacking ? 0.013 : 0;
                    const yawSkew = dir2d * (0.046 + moveBias + attackBias);
                    ctx.save();
                    ctx.translate(pivotX, pivotY);
                    ctx.transform(1, 0, -yawSkew / 0.982, 1, 0, 0);
                    ctx.scale(1 / 0.982, 1);
                    ctx.translate(-pivotX, -pivotY);
                    dualInst.render(ctx, this.actor);
                    ctx.restore();
                }
                if (!wasAttacking) dualInst.isAttacking = false;
            }
        }

        // 描画用に一時的に isAttacking=true にした武器インスタンスを元に戻す
        if (this._subWeaponKey) {
            const subInstForRestore = this._subWeaponInstances[this._subWeaponKey];
            if (subInstForRestore && subInstForRestore._renderForceActive) {
                subInstForRestore.isAttacking = false;
                delete subInstForRestore._renderForceActive;
            }
        }

        // actor の状態を復元
        this.actor.isAttacking          = saved.isAttacking;
        this.actor.currentAttack        = saved.currentAttack;
        this.actor.attackTimer          = saved.attackTimer;
        this.actor.attackCombo          = saved.attackCombo;
        this.actor.subWeaponTimer       = saved.subWeaponTimer;
        this.actor.subWeaponAction      = saved.subWeaponAction;
        this.actor.currentSubWeapon     = saved.currentSubWeapon;
        this.actor.facingRight          = saved.facingRight;
        this.actor.x                    = saved.x;
        this.actor.y                    = saved.y;
        this.actor.vx                   = saved.vx;
        this.actor.vy                   = saved.vy;
        this.actor.isGrounded           = saved.isGrounded;
        this.actor.isCrouching          = saved.isCrouching;
        this.actor.isDashing            = saved.isDashing;
        this.actor.motionTime           = saved.motionTime;
        this.actor.height               = saved.height;
        this.actor.forceSubWeaponRender = saved.forceSubWeaponRender;
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