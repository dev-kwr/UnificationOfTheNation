// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { COLORS, GRAVITY, CANVAS_WIDTH, LANE_OFFSET } from './constants.js';
import { Enemy } from './enemy.js';
import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { Player, ANIM_STATE } from './player.js';

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
        this.specialGaugeReward = 100;
        this.deathDuration = 1250;
        this.deathRiseSpeed = 2.5;
        this.detectionRange = 760;
        this.attackRange = 108;
        this.incomingDamageScale = 0.62;
        
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

        if (this.throwCount > 0) {
            this.throwTimer -= deltaMs;
            if (this.throwTimer <= 0) {
                this.throwBomb();
                this.throwCount--;
                this.throwTimer = this.throwInterval || 150;
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

        if (g.bombs && typeof g.bombs.push === 'function') {
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
        return null;
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

        if (typeof kusa.render === 'function') {
            kusa.render(ctx, this);
        }

        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const shoulderY = this.y + this.height * 0.38 + Math.abs(this.bob) * 0.14;
        const leanBase = (1.2 + this.torsoLean * 0.55 + (this.isAttacking ? 0.9 : 0)) * 1.12;
        const facingLead = dir * this.width * 0.035;
        const shoulderCenterX = centerX + dir * leanBase + facingLead;
        const bodyScreenTilt = dir * this.width * 0.038;
        const shoulderFrontX = shoulderCenterX + dir * (this.width * 0.12 + bodyScreenTilt * 0.3);
        
        let handX, handY;
        if (kusa.isAttacking && typeof kusa.getHandAnchor === 'function') {
            const anchor = kusa.getHandAnchor(this);
            handX = anchor.x;
            handY = anchor.y;
        } else {
            const idleAngleRaw = -0.58 + Math.sin(this.motionTime * 0.01) * 0.08;
            const idleAngle = dir === 1 ? idleAngleRaw : Math.PI - idleAngleRaw;
            handX = shoulderFrontX + Math.cos(idleAngle) * 23.2;
            handY = shoulderY + Math.sin(idleAngle) * 23.2;
        }

        this.drawJointedArm(ctx, {
            shoulderX: shoulderFrontX,
            shoulderY: shoulderY,
            handX: handX,
            handY: handY,
            upperLen: this.height * 0.18 * 1.12,
            foreLen: this.height * 0.18 * 1.12,
            bendSign: -dir * 0.82,
            upperWidth: this.width * 0.12,
            foreWidth: this.width * 0.108,
            jointRadius: this.width * 0.078,
            baseColor: '#131318',
            handColor: '#1a1a1a'
        });

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(handX, handY, 4.8, 0, Math.PI * 2);
        ctx.fill();
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
        this.attackRange = 180;
        this.attackPatterns = ['odachi'];
        this.setupWeaponReplica('大太刀');
        if (this.weaponReplica) {
            this.weaponReplica.range = 100;
        }
        this.forceSubWeaponRender = true;
    }
    
    startAttack() {
        const toolTier = this.getSubWeaponEnhanceTier();
        this.attackCooldown = Math.max(240, 420 - toolTier * 24);

        let useSpecial = false;
        if (this.targetPlayer && this.weaponReplica) {
            const dist = Math.abs((this.targetPlayer.x + this.targetPlayer.width/2) - (this.x + this.width/2));
            if (dist > 40 && dist < 160 && Math.random() < 0.25) {
                useSpecial = true;
            }
        }

        if (useSpecial) {
            this.currentPattern = 'odachi_special';
            this.applyWeaponReplicaEnhancement();
            this.weaponReplica.use(this);
            this.isAttacking = true;
            this.attackTimer = this.weaponReplica.attackTimer || this.weaponReplica.totalDuration || 0;
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
        const isSpecial = this.currentPattern === 'odachi_special';
        const currentAttackDuration = isSpecial && this.weaponReplica
            ? (this.weaponReplica.totalDuration || 680)
            : 680;
        
        const handPose = this.weaponReplica ? this.weaponReplica.getPose(this) : null;

        this.renderUnifiedEnemyModel(ctx, {
            weaponMode: 'none',
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
                armorA: '#222',
                armorB: '#111',
                armorEdge: '#d4af37',
                shoulder: '#333',
                helmTop: '#1a1a1a',
                helmBottom: '#0a0a0a',
                crest: '#ffcc00',
                accent: '#ef4c4c',
                capeTop: '#4e0b0b',
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
        const leanBase = (1.2 + this.torsoLean * 0.55 + (this.isAttacking ? 0.9 : 0)) * 1.15;
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

        this.drawJointedArm(ctx, {
            shoulderX,
            shoulderY,
            handX,
            handY,
            upperLen: 14.0 * 1.2,
            foreLen: 15.6 * 1.2,
            bendSign: -dir * 0.82,
            upperWidth: 6.2,
            foreWidth: 5.4,
            jointRadius: 3.8,
            baseColor: '#151515',
            handColor: '#1a1a1a'
        });

        const supportShoulderX = shoulderX - dir * 4.8;
        const supportShoulderY = shoulderY + 2.8;
        const weaponDirX = Math.cos(gripRotation);
        const weaponDirY = Math.sin(gripRotation);
        // 副手は主手より柄尻側（約22px後方）をしっかり握る
        const supportGripBack = odachi && !odachi.isAttacking ? 22 : 12.5;
        const supportTargetX = handX - weaponDirX * supportGripBack - weaponDirY * 1.4;
        const supportTargetY = handY - weaponDirY * supportGripBack + weaponDirX * 1.4;
        
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
    }
}

// ステージ6ボス: 将軍（ラスボス）
export class Shogun extends Boss {
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

        this.width  = 40;
        this.height = 60;

        this.actor = new Player(0, 0, this.groundY);
        this.actor.width  = this.width;
        this.actor.height = this.height;
        this.actor.progression = {
            normalCombo: 3,
            subWeapon:   3,
            specialClone: 3,
        };
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

        this._attackTimer      = 0;
        this._comboStep        = 0;
        this._currentComboStep = 1;
        this._comboPendingSteps = [];
        this._subTimer         = 0;
        this._subAction        = null;
        this._subWeaponKey     = null;

        this._subWeaponInstances = {
            shuriken:   createSubWeapon('手裏剣'),
            bomb:       createSubWeapon('火薬玉'),
            spear:      createSubWeapon('大槍'),
            dual:       createSubWeapon('二刀流'),
            kusarigama: createSubWeapon('鎖鎌'),
            odachi:     createSubWeapon('大太刀'),
        };

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

    update(deltaTime, player) {
        const shouldRemove = super.update(deltaTime, player);
        if (shouldRemove) return true;

        const deltaMs = deltaTime * 1000;

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

        this.actor.currentSubWeapon = (this._subWeaponKey === 'dual' && this._subAction === '二刀_Z')
            ? this._subWeaponInstances['dual']
            : null;

        this.actor.updateSpecialCloneSlashTrails(deltaMs);

        if (this._subTimer > 0 && this._subWeaponKey) {
            const subInst = this._subWeaponInstances[this._subWeaponKey];
            if (subInst && typeof subInst.update === 'function') {
                const targetPlayer = this.targetPlayer;
                const enemyArg = targetPlayer ? [targetPlayer] : [];
                if (this._subWeaponKey === 'shuriken') {
                    subInst.update(deltaTime, enemyArg);
                    for (const p of subInst.projectiles) {
                        if (!this.projectiles.includes(p)) {
                            this.projectiles.push(p);
                        }
                    }
                } else {
                    subInst.update(deltaTime);
                }
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

        {
            const shurikenInst = this._subWeaponInstances['shuriken'];
            if (shurikenInst && Array.isArray(shurikenInst.projectiles) && shurikenInst.projectiles.length > 0) {
                const targetPlayer = this.targetPlayer;
                const enemyArg = targetPlayer ? [targetPlayer] : [];
                if (this._subWeaponKey !== 'shuriken') {
                    shurikenInst.update(deltaTime, enemyArg);
                }
                for (const p of shurikenInst.projectiles) {
                    if (!this.projectiles.includes(p)) {
                        this.projectiles.push(p);
                    }
                }
            }
            this.projectiles = this.projectiles.filter(p => !p.isDestroyed);
        }

        return false;
    }

    startAttack() {
        if (this._attackTimer > 0 || this._subTimer > 0) return;

        this.isAttacking = true;
        this.attackFacingRight = this.facingRight;

        const roll = Math.random();
        if (roll < 0.40) {
            this._comboPendingSteps = [1, 2, 3, 4, 5];
            this._startNextComboStep();
        } else {
            const weapons   = ['shuriken', 'bomb', 'spear', 'dual', 'dual_z', 'kusarigama', 'odachi'];
            const type      = weapons[Math.floor(Math.random() * weapons.length)];
            const actionMap = {
                shuriken: 'throw', bomb: 'throw',
                spear: '大槍', kusarigama: '鎖鎌',
                odachi: '大太刀', dual: '二刀_合体', dual_z: '二刀_Z',
            };
            const getDuration = (key) => {
                const inst = this._subWeaponInstances[key];
                if (!inst) return 300;
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

    _startNextComboStep() {
        const step = this._comboPendingSteps.shift();
        if (step == null) {
            this._attackTimer = 0;
            this.isAttacking  = false;
            this.attackCooldown = 480;
            return;
        }
        const COMBO_DURATIONS = [182, 138, 208, 248, 336];
        const dur = COMBO_DURATIONS[step - 1] || 200;
        this._currentComboStep = step;
        this._comboStep = step % 5;
        this._attackTimer = dur;
        this.attackTimer  = dur;
        this.isAttacking  = true;
        this.attackCooldown = Math.max(100, dur * 0.5);
        audio.playSlash(Math.min(4, step));
    }

    updateAttack(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const dir = this.facingRight ? 1 : -1;

        if (this._attackTimer > 0) {
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
        const resolvedKey = type === 'dual_z' ? 'dual' : type;
        const subInst = this._subWeaponInstances[resolvedKey];
        if (!subInst) return;
        if (typeof subInst.applyEnhanceTier === 'function') {
            subInst.applyEnhanceTier(3, this);
        } else {
            subInst.enhanceTier = 3;
        }
        const prevSubWeapon  = this.currentSubWeapon;
        const prevAttackCombo = this.attackCombo;
        this.currentSubWeapon = subInst;
        this.attackCombo      = this._comboStep;

        const prevVx = this.vx;
        const isSpear = (resolvedKey === 'spear');

        const useMode = type === 'dual' ? 'combined' : (type === 'dual_z' ? 'main' : undefined);
        subInst.use(this, useMode);

        if (isSpear) {
            const dir = this.facingRight ? 1 : -1;
            this.vx = prevVx + dir * this.speed * 3.5;
        }

        this.currentSubWeapon = prevSubWeapon;
        this.attackCombo      = prevAttackCombo;
    }

    getAttackHitbox() {
        if (this._attackTimer > 0) {
            const dir = this.facingRight ? 1 : -1;
            return [{
                x: this.x + (dir > 0 ? this.width * 0.4 : -this.width * 1.2),
                y: this.y + this.height * 0.1,
                width: this.width * 1.8,
                height: this.height * 0.8,
            }];
        }
        if (this._subTimer > 0 && this._subWeaponKey) {
            const subInst = this._subWeaponInstances[this._subWeaponKey];
            if (subInst && typeof subInst.getHitbox === 'function') {
                const hb = subInst.getHitbox(this);
                if (hb) return Array.isArray(hb) ? hb : [hb];
            }
        }
        return null;
    }

    renderBody(ctx) {
        const i = 0;

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

            if (subInst) {
                const isDualBlade = subInst.name === '二刀流';
                if (isDualBlade && typeof subInst.attackTimer !== 'undefined') {
                    if (!subInst.isAttacking || subInst.attackTimer <= 0) {
                        subInst.attackTimer = this._subTimer;
                    }
                }
                if (!subInst.isAttacking) {
                    subInst._renderForceActive = true;
                    subInst.isAttacking = true;
                }
            }
            this.actor.forceSubWeaponRender = true;

        } else {
            this.actor.isAttacking     = false;
            this.actor.currentAttack   = null;
            this.actor.attackTimer     = 0;
            this.actor.subWeaponTimer  = 0;
            this.actor.subWeaponAction = null;
            this.actor.currentSubWeapon = null;
        }

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
            this.actor.renderModel(ctx, this.x, this.y, this.facingRight, 1.0, true, renderOpts);
            ctx.restore();
        }

        if (this._subTimer > 0 && this._subWeaponKey === 'dual') {
            const dualInst = this._subWeaponInstances['dual'];
            if (dualInst && typeof dualInst.render === 'function') {
                const wasAttacking = dualInst.isAttacking;
                if (!wasAttacking) dualInst.isAttacking = true;
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

        if (this._subWeaponKey) {
            const subInstForRestore = this._subWeaponInstances[this._subWeaponKey];
            if (subInstForRestore && subInstForRestore._renderForceActive) {
                subInstForRestore.isAttacking = false;
                delete subInstForRestore._renderForceActive;
            }
        }

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