// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { COLORS, GRAVITY, CANVAS_WIDTH, LANE_OFFSET } from './constants.js';
import { Enemy } from './enemy.js';
import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { Player, ANIM_STATE } from './player.js';

// ラスボス（将軍）の全体スケール。ここだけ変更すれば倍率調整できる。
const SHOGUN_SCALE = 2.2;
// ラスボス（将軍）の頭サイズ係数。少し小さくして頭身を上げる。
const SHOGUN_HEAD_SCALE = 0.80;
// ラスボス（将軍）の腰上げ量(px)。上げるほど胴が短く脚が長く見える。
const SHOGUN_HIP_LIFT_PX = 8.00;
// ラスボス（将軍）の腕リーチ係数。少しだけ長く見せる。
const SHOGUN_ARM_REACH_SCALE = 1.08;

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
        if (!shouldRemove && !this.isEntering && this.isAlive && !this.isDying) {
            const scrollX = window.game ? window.game.scrollX : 0;
            const minX = scrollX;
            const maxX = scrollX + CANVAS_WIDTH - this.width;
            if (this.x < minX) {
                this.x = minX;
                if (this.vx < 0) this.vx = 0;
            } else if (this.x > maxX) {
                this.x = maxX;
                if (this.vx > 0) this.vx = 0;
            }
        }
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

    /**
     * ボス専用の撃破エフェクト。
     * 通常敵の白粒子ではなく、衝撃波リング・炎粒子・光の爆発で演出する。
     */
    renderAscensionEffect(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const t  = this.deathTimer;
        const p  = Math.min(1, t / this.deathDuration);
        const invP = 1 - p;

        ctx.save();
        ctx.globalAlpha = 1.0;

        // ─── 1. 衝撃波リング（複数段）───
        ctx.globalCompositeOperation = 'lighter';

        const waveParams = [
            { delay: 0.00, maxR:  80, baseWidth: 12, color: [255, 245, 120], alphaScale: 1.00 },
            { delay: 0.18, maxR: 128, baseWidth:  8, color: [255, 190,  40], alphaScale: 0.78 },
            { delay: 0.34, maxR: 176, baseWidth:  6, color: [255, 120,  10], alphaScale: 0.58 },
            { delay: 0.50, maxR: 230, baseWidth:  4, color: [255,  60,   0], alphaScale: 0.40 },
        ];

        // radialGradientでリングを描画（アンチエイリアシングの黒アーティファクトを回避）
        const drawGlowRing = (centerX, centerY, radius, halfWidth, r, g, b, alpha) => {
            if (radius <= 0 || halfWidth <= 0 || alpha < 0.005) return;
            const innerR = Math.max(0, radius - halfWidth);
            const outerR = radius + halfWidth;
            const peakPos = halfWidth > 0 ? (radius - innerR) / (outerR - innerR) : 0.5;
            const grd = ctx.createRadialGradient(centerX, centerY, innerR, centerX, centerY, outerR);
            grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
            grd.addColorStop(Math.max(0.01, peakPos * 0.5), `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
            grd.addColorStop(peakPos, `rgba(${r}, ${g}, ${b}, ${alpha})`);
            grd.addColorStop(Math.min(0.99, peakPos + (1 - peakPos) * 0.5), `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
            grd.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerR, 0, Math.PI * 2);
            ctx.fill();
        };

        for (const wp of waveParams) {
            const waveP = Math.max(0, Math.min(1, (p - wp.delay) / (1 - wp.delay)));
            if (waveP <= 0) continue;

            const r = waveP * wp.maxR;
            if (r < 1) continue;
            const alpha = Math.pow(1 - waveP, 1.3) * wp.alphaScale;
            if (alpha < 0.01) continue;
            const lw = Math.max(0.5, wp.baseWidth * (1 - waveP * 0.7));
            const [cr, cg, cb] = wp.color;

            // 外グロー
            drawGlowRing(cx, cy, r, lw * 2.5, cr, cg, cb, alpha * 0.25);

            // 中グロー
            drawGlowRing(cx, cy, r, lw * 1.25, cr, cg, cb, alpha * 0.50);

            // コア
            drawGlowRing(cx, cy, r, lw * 0.4,
                255, 255, Math.min(255, cb + 80), alpha * 0.95);
        }

        // ─── 2. 中心フラッシュ（序盤だけ強く光る）───
        if (p < 0.45) {
            const flashP = 1 - p / 0.45;
            const flashR = 55 + (1 - flashP) * 30;
            const flashGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
            flashGrd.addColorStop(0, `rgba(255, 255, 220, ${0.9 * flashP})`);
            flashGrd.addColorStop(0.35, `rgba(255, 200, 80, ${0.6 * flashP})`);
            flashGrd.addColorStop(1, `rgba(255, 100, 0, 0)`);
            ctx.fillStyle = flashGrd;
            ctx.beginPath();
            ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
            ctx.fill();
        }

        // ─── 3. 炎のスパーク粒子（上昇しながら拡散）───
        const sparkCount = 20;
        for (let i = 0; i < sparkCount; i++) {
            const seed1 = Math.sin(i * 127.1) * 43758.5453;
            const seed2 = Math.sin(i * 311.7 + 9.1) * 21943.2;
            const rndX  = (seed1 - Math.floor(seed1)) * 2 - 1;
            const rndY  = (seed2 - Math.floor(seed2));

            const lifespan  = 0.45 + rndY * 0.55;
            const born      = (i / sparkCount) * 0.4;
            const localP    = Math.max(0, Math.min(1, (p - born) / lifespan));
            if (localP <= 0 || localP >= 1) continue;

            const spread   = 50 + rndY * 45;
            const px       = cx + rndX * spread * localP;
            const py       = cy - localP * (60 + rndY * 50);
            const size     = (2.5 + rndY * 3.5) * (1 - localP);
            const sparkAlpha = (1 - localP) * 0.9;

            const pGrd = ctx.createRadialGradient(px, py, 0, px, py, size * 2.2);
            pGrd.addColorStop(0,   `rgba(255, 255, 200, ${sparkAlpha})`);
            pGrd.addColorStop(0.4, `rgba(255, 160, 30,  ${sparkAlpha * 0.8})`);
            pGrd.addColorStop(1,   `rgba(255, 40,  0,   0)`);

            ctx.fillStyle = pGrd;
            ctx.beginPath();
            ctx.arc(px, py, size * 2.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // ─── 4. 残光オーラ（ボス全体を包む発光）───
        if (p < 0.7) {
            const auraAlpha = invP * 0.35;
            const auraR     = this.height * 0.65 + (1 - invP) * 12;
            const auraGrd   = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
            auraGrd.addColorStop(0,   `rgba(255, 230, 100, ${auraAlpha})`);
            auraGrd.addColorStop(0.6, `rgba(255, 120, 20,  ${auraAlpha * 0.5})`);
            auraGrd.addColorStop(1,   `rgba(255, 60,  0,   0)`);
            ctx.fillStyle = auraGrd;
            ctx.beginPath();
            ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
            ctx.fill();
        }

        // ─── 5. 灰燼パーティクル（後半に浮遊する黒い灰）───
        if (p > 0.3) {
            ctx.globalCompositeOperation = 'source-over';
            const ashCount = 12;
            for (let i = 0; i < ashCount; i++) {
                const s1   = Math.sin(i * 91.3 + 3.7) * 58312.4;
                const s2   = Math.sin(i * 47.1 + 1.1) * 34821.6;
                const rX   = (s1 - Math.floor(s1)) * 2 - 1;
                const rY   = (s2 - Math.floor(s2));
                const ashP = Math.max(0, (p - 0.3) / 0.7);
                const drift = ashP * (30 + rY * 30);
                const px    = cx + rX * (35 + rY * 25) + Math.sin(t * 0.002 + i) * 4;
                const py    = cy - drift;
                const sz    = (1.2 + rY * 1.8) * (1 - ashP);
                const ashAlpha = (1 - ashP) * 0.55;
                ctx.fillStyle = `rgba(60, 50, 40, ${ashAlpha})`;
                ctx.beginPath();
                ctx.arc(px, py, sz, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
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
            // enemy.render()で適用されたyawSkew変換を逆算してキャンセルし、剣が垂直に描画されるようにする
            const dir = this.facingRight ? 1 : -1;
            const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
            const attackBias = this.isAttacking ? 0.013 : 0;
            const yawSkew = dir * (0.046 + moveBias + attackBias);
            const pivotX = this.x + this.width * 0.5;
            const pivotY = this.y + this.height * 0.62;
            ctx.save();
            ctx.translate(pivotX, pivotY);
            ctx.scale(1 / 0.982, 1);
            ctx.transform(1, 0, -yawSkew, 1, 0, 0);
            ctx.translate(-pivotX, -pivotY);
            this.weaponReplica.render(ctx, this);
            ctx.restore();
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
        this.scaleMultiplier = SHOGUN_SCALE;
        this.hp = 4500;
        this.maxHp = 4500;
        this.damage = 6;
        this.speed = 3.8;
        this.attackRange = Math.round(120 * this.scaleMultiplier);
        this.incomingDamageScale = 0.55;
        this.weaponReplica = null;

        this.actorBaseWidth = 40;
        this.actorBaseHeight = 60;
        this.width  = Math.round(this.actorBaseWidth * this.scaleMultiplier);
        this.height = Math.round(this.actorBaseHeight * this.scaleMultiplier);

        this.actor = new Player(0, 0, this.groundY);
        this.actor.width  = this.actorBaseWidth;
        this.actor.height = this.actorBaseHeight;
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
        this._shurikenVisualTimer = 0;

        this._subWeaponInstances = {
            shuriken:   createSubWeapon('手裏剣'),
            bomb:       createSubWeapon('火薬玉'),
            spear:      createSubWeapon('大槍'),
            dual:       createSubWeapon('二刀流'),
            kusarigama: createSubWeapon('鎖鎌'),
            odachi:     createSubWeapon('大太刀'),
        };
        this.applyScaleToSubWeapons();

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

    applyScaleToSubWeapons() {
        const scale = Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1;
        if (Math.abs(scale - 1) < 0.001 || !this._subWeaponInstances) return;

        const scaleNum = (obj, key) => {
            if (!obj || !Number.isFinite(obj[key])) return;
            obj[key] *= scale;
        };

        for (const inst of Object.values(this._subWeaponInstances)) {
            if (!inst) continue;
            scaleNum(inst, 'range');
            scaleNum(inst, 'baseRange');
        }

        const shuriken = this._subWeaponInstances.shuriken;
        if (shuriken) {
            scaleNum(shuriken, 'projectileRadius');
            scaleNum(shuriken, 'projectileRadiusHoming');
        }
    }

    updateAI(deltaTime, player) {
        if (!player) return;
        const scrollX = window.game ? window.game.scrollX : 0;
        const screenRight = scrollX + CANVAS_WIDTH;
        const selfCX = this.x + this.width / 2;
        const playerCX = player.x + player.width / 2;
        const diffX = playerCX - selfCX;
        const absX = Math.abs(diffX);
        const dir = diffX >= 0 ? 1 : -1;

        if (!this.isAttacking && this.hitTimer <= 0 && absX > 16) {
            this.facingRight = dir > 0;
        }
        if (this.x > screenRight - 16) {
            this.facingRight = false;
            this.applyDesiredVx(-Math.max(2.1, this.speed * 1.22), 0.58);
            return;
        }
        if (!this.isAttacking && this.evasionCooldownMs <= 0 &&
            absX <= this.attackRange * 1.55 &&
            (player.isAttacking || (player.subWeaponTimer || 0) > 0) &&
            Math.random() < 1.25 * deltaTime) {
            this.startEvasionManeuver(dir, absX);
        }
        if (this.evasionTimerMs > 0) {
            const evadeSpeed = this.speed * (1.52 + Math.min(0.72, absX / Math.max(1, this.attackRange * 3.5)));
            this.applyDesiredVx(this.evasionDir * evadeSpeed, 0.64);
            if (!this.evasionJumped && this.isGrounded && absX < this.attackRange * 1.05 && Math.random() < 0.22) {
                this.vy = -16.5; this.isGrounded = false; this.evasionJumped = true;
            }
            return;
        }
        if (this.isAttacking) {
            if (typeof this.attackFacingRight === 'boolean') this.facingRight = this.attackFacingRight;
            if (Math.abs(this.vx) < this.speed * 1.8) this.applyDesiredVx(0, 0.34);
            return;
        }
        // クールダウン終了 → 距離に関係なく攻撃（技選択はstartAttack内で距離判定）
        if (this.attackCooldown <= 0) {
            this.attackFacingRight = this.facingRight;
            this.startAttack();
            return;
        }
        // 遠距離(>300)ではフェイントのみ、中近距離では接近
        let desiredVX = 0;
        if (absX > 300) {
            desiredVX = this.feintDir * this.speed * 0.35;
        } else if (absX > this.attackRange * 1.05) {
            desiredVX = this.speed * 1.14 * dir;
        } else if (absX > this.attackRange * 0.55) {
            desiredVX = this.speed * 0.92 * dir;
        }
        if (absX <= this.attackRange * 2.0) desiredVX += this.feintDir * this.speed * 0.44;
        desiredVX = Math.max(-this.speed * 1.42, Math.min(this.speed * 1.42, desiredVX));
        this.applyDesiredVx(desiredVX, 0.46);
        if (absX > this.attackRange * 1.08 && absX <= 300) this.tryJump(0.022, -15, 400);
    }

    update(deltaTime, player) {
        // サブ技タイマーが残っている間は必ず攻撃更新を継続する
        // （isAttackingが先にfalseになると_subTimerが減らず行動停止するため）
        if (this._attackTimer > 0 || this._subTimer > 0) {
            this.isAttacking = true;
        }

        const shouldRemove = super.update(deltaTime, player);
        if (shouldRemove) return true;

        const deltaMs = deltaTime * 1000;
        if (this._shurikenVisualTimer > 0) {
            this._shurikenVisualTimer = Math.max(0, this._shurikenVisualTimer - deltaMs);
        }

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
        this.actor.width      = this.actorBaseWidth;
        this.actor.height     = this.actorBaseHeight;

        this.actor.currentSubWeapon = (this._subWeaponKey === 'dual')
            ? this._subWeaponInstances['dual']
            : null;

        this.actor.updateSpecialCloneSlashTrails(deltaMs);

        if (this._subTimer > 0 && this._subWeaponKey) {
            const subInst = this._subWeaponInstances[this._subWeaponKey];
            if (subInst && typeof subInst.update === 'function') {
                if (this._subWeaponKey === 'shuriken') {
                    // enemies引数にプレイヤーを渡してhomingさせる（当たり判定は別途自前処理）
                    const enemyArg = this.targetPlayer ? [this.targetPlayer] : [];
                    subInst.update(deltaTime, enemyArg);
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

        // 手裏剣: projectilesの当たり判定（ShurikenProjectileはdamageを与えないため自前実装）
        {
            const shurikenInst = this._subWeaponInstances['shuriken'];
            if (shurikenInst && Array.isArray(shurikenInst.projectiles)) {
                const p = this.targetPlayer;
                if (p && (p.invincibleTimer || 0) <= 0) {
                    for (const proj of shurikenInst.projectiles) {
                        if (proj.isDestroyed) continue;
                        const px = p.x + p.width / 2;
                        const py = p.y + p.height / 2;
                        const dx = px - proj.x;
                        const dy = py - proj.y;
                        const hitR = (proj.radius || 8) + Math.min(p.width, p.height) * 0.5;
                        if (dx * dx + dy * dy < hitR * hitR) {
                            proj.isDestroyed = true;
                            if (typeof p.takeDamage === 'function') {
                                p.takeDamage(this.damage, {
                                    sourceX: proj.x,
                                    knockbackX: proj.vx > 0 ? 6 : -6,
                                    knockbackY: -4
                                });
                            }
                        }
                    }
                }
                // _subTimerが切れた後もprojectilesが残っていれば更新を継続
                // （_subWeaponKey==='shuriken'のままでも寿命を進めないと空中で停止する）
                const shouldTickShuriken = shurikenInst.projectiles.length > 0
                    && (this._subWeaponKey !== 'shuriken' || this._subTimer <= 0);
                if (shouldTickShuriken) {
                    const enemyArg = this.targetPlayer ? [this.targetPlayer] : [];
                    shurikenInst.update(deltaTime, enemyArg);
                }
                // projectilesが全消滅したらキーをクリア
                if (this._subWeaponKey === 'shuriken' && shurikenInst.projectiles.length === 0
                    && this._subTimer <= 0) {
                    this._subAction    = null;
                    this._subWeaponKey = null;
                }
            }
        }

        // 二刀流X: _subTimer終了後も飛翔斬撃の寿命を進め、消えたら構えを解除
        {
            const dualInst = this._subWeaponInstances['dual'];
            if (dualInst && typeof dualInst.update === 'function') {
                if (this._subWeaponKey === 'dual' && this._subTimer <= 0) {
                    dualInst.update(deltaTime);
                    const hasDualProjectiles = Array.isArray(dualInst.projectiles) && dualInst.projectiles.length > 0;
                    if (!hasDualProjectiles && !dualInst.isAttacking) {
                        this._subAction = null;
                        this._subWeaponKey = null;
                        this._dualZPendingSteps = null;
                    }
                }
            }
        }

        return false;
    }

    startAttack() {
        if (this._attackTimer > 0 || this._subTimer > 0) return;

        this.isAttacking = true;
        this.attackFacingRight = this.facingRight;

        // プレイヤーとの距離で技を使い分け
        const player = this.targetPlayer;
        const selfCX   = this.x + this.width * 0.5;
        const playerCX = player ? player.x + player.width * 0.5 : selfCX;
        const dist = Math.abs(playerCX - selfCX);

        const actionMap = {
            shuriken: 'throw', bomb: 'throw',
            spear: '大槍', kusarigama: '鎖鎌',
            odachi: '大太刀', dual: '二刀_合体', dual_z: '二刀_Z',
        };
        const getDuration = (key) => {
            const inst = this._subWeaponInstances[key];
            if (!inst) return 300;
            if (inst.totalDuration && inst.plantedDuration) return inst.totalDuration + inst.plantedDuration + 60;
            if (inst.totalDuration) return inst.totalDuration + 60;
            if (inst.attackDuration) return inst.attackDuration + 60;
            return 300;
        };
        const getDualCombinedDuration = () => {
            const inst = this._subWeaponInstances['dual'];
            if (!inst) return 900;
            const projLife = 600 + (inst.enhanceTier || 3) * 60;
            const activeCombined = Math.max(124, Math.round(inst.combinedDuration * 0.76));
            return activeCombined + projLife + 60;
        };
        const durationMap = {
            shuriken: 150, bomb: 150,
            spear:    getDuration('spear'),
            kusarigama: getDuration('kusarigama'),
            odachi:   getDuration('odachi'),
            dual:     getDualCombinedDuration(),
        };

        let type;
        if (dist > 300) {
            // 遠距離: 手裏剣・二刀流X斬撃で牽制
            type = Math.random() < 0.55 ? 'shuriken' : 'dual';
        } else if (dist > 150) {
            // 中距離: 爆弾・大槍・鎖鎌
            const choices = ['bomb', 'bomb', 'spear', 'kusarigama', 'shuriken'];
            type = choices[Math.floor(Math.random() * choices.length)];
        } else {
            // 近距離: 通常Zコンボ・二刀流Z・大太刀・鎖鎌
            const r = Math.random();
            if (r < 0.38) {
                this._comboPendingSteps = [1, 2, 3, 4, 5];
                this._startNextComboStep();
                return;
            }
            const choices = ['dual_z', 'dual_z', 'odachi', 'kusarigama', 'bomb'];
            type = choices[Math.floor(Math.random() * choices.length)];
        }

        if (type === 'shuriken' || type === 'bomb') {
            this._fireSubWeapon(type);
            this.subWeaponAction = null;
            if (type === 'shuriken') {
                // _subWeaponKey='shuriken'を維持してupdate内でhit判定・renderを機能させる
                this._subAction    = 'throw';
                this._subWeaponKey = 'shuriken';
                this._subTimer     = 1400; // 手裏剣の寿命より長く（projectiles消滅で終了）
                this._shurikenVisualTimer = 150;
                this.attackTimer   = 200;
                this._attackTimer  = 200;
            } else {
                this._subAction    = null;
                this._subWeaponKey = null;
                this._subTimer     = 0;
                this._shurikenVisualTimer = 0;
                this.attackTimer   = 150;
                this._attackTimer  = 150;
            }
            this.attackCooldown = 400;
            audio.playSlash(0);
            return;
        } else if (type === 'dual_z') {
            // 二刀流Zコンボ: 5段を1段ずつ_fireDualZNextStepで連続発動
            this._subAction    = '二刀_Z';
            this._subWeaponKey = 'dual';
            this._shurikenVisualTimer = 0;
            this.attackCooldown = 500;
            this._dualZPendingSteps = [1, 2, 3, 4, 5];
            this._fireDualZNextStep();
        } else {
            const duration     = durationMap[type] || 300;
            this._subWeaponKey = type;
            this._subTimer     = duration;
            this._shurikenVisualTimer = 0;
            this.attackTimer   = duration;
            this.attackCooldown = 400;
            this._fireSubWeapon(type);
            // _fireSubWeapon呼び出し後にactionをセット（dualの場合はcombinedを保証）
            this._subAction = (type === 'dual') ? '二刀_合体' : (actionMap[type] || null);
            audio.playSlash(2);
        }
    }

    // 二刀流Zコンボの次段を発動
    _fireDualZNextStep() {
        const dual = this._subWeaponInstances['dual'];
        if (!dual) return;
        const step = this._dualZPendingSteps && this._dualZPendingSteps.length > 0
            ? this._dualZPendingSteps.shift() : null;
        if (step == null) {
            // 全5段終了 → projectile消滅まで待機
            this._dualZPendingSteps = null;
            if (!dual.projectiles || dual.projectiles.length === 0) {
                this._subTimer     = 0;
                this._subAction    = null;
                this._subWeaponKey = null;
                this.isAttacking   = false;
            }
            return;
        }
        if (typeof dual.applyEnhanceTier === 'function') dual.applyEnhanceTier(3, this);
        const prevSubWeapon = this.currentSubWeapon;
        this.currentSubWeapon = dual;
        dual.use(this, 'main'); // 1段発動（内部でcomboIndexを進める）
        this.currentSubWeapon = prevSubWeapon;
        // この段のduration分だけ_subTimerをセット
        const dur = Math.max(112, dual.mainDuration || 204);
        this._subTimer   = dur;
        this.attackTimer = dur;
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
        // player.jsのattack()と同じstepごとのvx/vyを再現
        const dir = this.facingRight ? 1 : -1;
        const impulse = this.speed;
        if (step === 1) {
            this.vx = this.vx * 0.2 + dir * impulse * 0.94;
            if (this.isGrounded) { this.vy = 0; }
            else { this.vy = Math.max(this.vy, -0.8); }
        } else if (step === 2) {
            this.vx = this.vx * 0.16 + dir * impulse * 0.9;
            if (this.isGrounded) { this.vy = 0; }
            else { this.vy = Math.min(this.vy, -1.2); }
        } else if (step === 3) {
            this.vx = this.vx * 0.12 + dir * impulse;
            this.vy = Math.min(this.vy, -8.2);
            this.isGrounded = false;
        } else if (step === 4) {
            this.vx = this.vx * 0.24 + dir * impulse * 0.42;
            this.vy = Math.min(this.vy, -14.4);
            this.isGrounded = false;
        } else if (step === 5) {
            this.vx = this.vx * 0.18;
            this.vy = Math.max(this.vy, 3.4); // 落下断ち: 下に飛ぶ
            this.isGrounded = false;
        }
        audio.playSlash(Math.min(4, step));
    }

    updateAttack(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const dir = this.facingRight ? 1 : -1;

        if (this._attackTimer > 0) {
            // vx/vyはstep開始時に_startNextComboStepで設定済み
            this.vx *= 0.92;
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
                this._subTimer = 0;
                // 二刀流Z: 次段があれば連続発動
                if (this._dualZPendingSteps && this._dualZPendingSteps.length > 0) {
                    this._fireDualZNextStep();
                    return;
                }
                // 二刀流Zの全段終了チェック
                if (this._dualZPendingSteps !== null && this._dualZPendingSteps !== undefined
                    && this._dualZPendingSteps.length === 0) {
                    this._fireDualZNextStep(); // 終了処理
                    return;
                }
                // 二刀流X: projectile飛翔中は描画キーを維持
                const dualInst = this._subWeaponInstances['dual'];
                const keepForDual = this._subWeaponKey === 'dual'
                    && dualInst && dualInst.projectiles.length > 0;
                // 手裏剣: projectile飛翔中は維持（update内でキーをクリアする）
                const keepForShuriken = this._subWeaponKey === 'shuriken';
                if (!keepForDual && !keepForShuriken) {
                    this._subAction    = null;
                    this._subWeaponKey = null;
                    this._dualZPendingSteps = null;
                }
                this.isAttacking   = false;
                this.attackCooldown = Math.max(this.attackCooldown, 300);
            }
        } else if (this._subWeaponKey === 'dual') {
            // subTimer=0でもprojectile残存中は描画キー保持（寿命更新はupdate()側で継続）
            const dualInst = this._subWeaponInstances['dual'];
            if (!dualInst || !Array.isArray(dualInst.projectiles) || dualInst.projectiles.length === 0) {
                this._subAction    = null;
                this._subWeaponKey = null;
                this._dualZPendingSteps = null;
            }
            this.isAttacking = false;
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

        // bomb発射前のg.bombs長さを記録
        const bombsBefore = (resolvedKey === 'bomb' && window.game && window.game.bombs)
            ? window.game.bombs.length : -1;

        subInst.use(this, useMode);

        if (isSpear) {
            const dir = this.facingRight ? 1 : -1;
            this.vx = prevVx + dir * this.speed * 3.5;
        }

        // bomb: 新しく追加されたbombに敵弾フラグとgetHitboxを付ける
        // （game.jsのupdateBombsはisEnemyProjectile===trueのbombにgetHitbox()を呼ぶため必須）
        if (resolvedKey === 'bomb' && bombsBefore >= 0 && window.game && window.game.bombs) {
            const owner = this;
            for (let bi = bombsBefore; bi < window.game.bombs.length; bi++) {
                const b = window.game.bombs[bi];
                if (!b) continue;
                if (Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 1) {
                    if (Number.isFinite(b.radius)) b.radius *= this.scaleMultiplier;
                    if (Number.isFinite(b.explosionRadius)) b.explosionRadius *= this.scaleMultiplier;
                }
                b.isEnemyProjectile = true;
                b.owner = owner;
                // game.jsがisEnemyProjectile===trueのbombに呼ぶgetHitbox()を追加
                b.getHitbox = function() {
                    if (this.isExploding) {
                        return {
                            x: this.x - this.explosionRadius,
                            y: this.y - this.explosionRadius,
                            width: this.explosionRadius * 2,
                            height: this.explosionRadius * 2
                        };
                    }
                    return {
                        x: this.x - this.radius,
                        y: this.y - this.radius,
                        width: this.radius * 2,
                        height: this.radius * 2
                    };
                };
                // updateはそのまま（game.jsがenemies=[]で呼んでくれるので敵には当たらない）
                // game.jsのupdateBombs内でプレイヤーへのダメージはisEnemyProjectileブロックで処理される
            }
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

        const saved = {
            isAttacking:          this.actor.isAttacking,
            currentAttack:        this.actor.currentAttack,
            attackTimer:          this.actor.attackTimer,
            attackCombo:          this.actor.attackCombo,
            width:                this.actor.width,
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

        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        const actorRenderW = this.actorBaseWidth || Math.max(1, Math.round(this.width / renderScale));
        const actorRenderH = this.actorBaseHeight || Math.max(1, Math.round(this.height / renderScale));
        // 2Dモデルを等比拡大した後も足元が地面に合うよう、元モデル座標を補正
        const actorRenderX = this.x + (this.width - actorRenderW) * 0.5;
        const actorRenderY = this.y + (this.height - actorRenderH) * 0.62;

        this.actor.x           = actorRenderX;
        this.actor.y           = actorRenderY;
        this.actor.vx          = this.vx;
        this.actor.vy          = this.vy;
        this.actor.isGrounded  = this.isGrounded;
        this.actor.isCrouching = false;
        this.actor.isDashing   = false;
        this.actor.motionTime  = this.motionTime;
        this.actor.width       = actorRenderW;
        this.actor.height      = actorRenderH;
        this.actor.facingRight = this.facingRight;

        const renderOpts = {
            renderHeadbandTail: false,
            renderHeadband:     false,
            useLiveAccessories: false,
            headScale: SHOGUN_HEAD_SCALE,
            hipLiftPx: SHOGUN_HIP_LIFT_PX,
            armReachScale: SHOGUN_ARM_REACH_SCALE,
            // throw時は通常のプレイヤー投擲姿勢（奥手の刀＋手前手投擲）を使う
            forceSubWeaponRender: (this._subTimer > 0 && this._subAction != null && this._subAction !== 'throw'),
        };

        // 将軍は戦闘判定レンジを拡大しているため、
        // 描画時だけ逆補正しないと槍/鎖鎌/大太刀の見た目が過剰に伸びる。
        const scaledRangeBackups = [];
        if (Math.abs(renderScale - 1) > 0.001 && this._subWeaponInstances) {
            for (const inst of Object.values(this._subWeaponInstances)) {
                if (!inst || !Number.isFinite(inst.range)) continue;
                scaledRangeBackups.push([inst, inst.range]);
                inst.range = inst.range / renderScale;
            }
        }

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
            const isThrowAction = this._subAction === 'throw';
            const throwPoseActive = isThrowAction && this._shurikenVisualTimer > 0;
            const displaySubTimer = throwPoseActive
                ? Math.max(1, this._shurikenVisualTimer)
                : Math.max(1, this._subTimer);
            this.actor.subWeaponTimer  = throwPoseActive ? displaySubTimer : (isThrowAction ? 0 : displaySubTimer);
            this.actor.subWeaponAction = throwPoseActive ? 'throw' : (isThrowAction ? null : this._subAction);
            // throw時に手持ち忍具アイコンが残らないよう、モデル上は通常刀扱いにする
            this.actor.currentSubWeapon = isThrowAction ? null : (subInst || null);

            if (subInst) {
                const isDualBlade = subInst.name === '二刀流';
                if (isDualBlade) {
                    // DualBladesはuse()でisAttacking/attackTimerが正しくセット済み。
                    // renderBodyからは一切上書きしない（forceActiveも付けない）
                } else if (!subInst.isAttacking) {
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

        const renderWithShogunTransform = (drawFn) => {
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
            if (Math.abs(renderScale - 1) > 0.001) {
                ctx.translate(pivotX, pivotY);
                ctx.scale(renderScale, renderScale);
                ctx.translate(-pivotX, -pivotY);
            }
            drawFn();
            ctx.restore();
        };

        const trailPoints = this.actor.specialCloneSlashTrailPoints[i];
        if (trailPoints && trailPoints.length > 1) {
            const trailScale = typeof this.actor.getXAttackTrailWidthScale === 'function'
                ? this.actor.getXAttackTrailWidthScale()
                : 1.0;
            renderWithShogunTransform(() => {
                this.actor.renderComboSlashTrail(ctx, {
                    points: trailPoints,
                    centerX: this.x + this.width * 0.5,
                    centerY: this.y + this.height * 0.5,
                    trailWidthScale: trailScale,
                    boostActive: trailScale > 1.01 && this._attackTimer > 0,
                });
            });
        }

        renderWithShogunTransform(() => {
            this.actor.renderModel(ctx, actorRenderX, actorRenderY, this.facingRight, 1.0, true, renderOpts);
        });

        if (this._subTimer > 0 && this._subWeaponKey === 'kusarigama') {
            const kusaInst = this._subWeaponInstances['kusarigama'];
            if (kusaInst && typeof kusaInst.render === 'function') {
                const wasAttacking = kusaInst.isAttacking;
                if (!wasAttacking) kusaInst.isAttacking = true;
                renderWithShogunTransform(() => {
                    kusaInst.render(ctx, this.actor);
                });
                if (!wasAttacking) kusaInst.isAttacking = false;
            }
        }

        // 手裏剣のprojectilesを描画
        if (this._subWeaponKey === 'shuriken') {
            const shurikenInst = this._subWeaponInstances['shuriken'];
            if (shurikenInst && typeof shurikenInst.render === 'function') {
                shurikenInst.render(ctx, this.actor);
            }
        }

        if (this._subWeaponKey === 'dual') {
            const dualInst = this._subWeaponInstances['dual'];
            if (dualInst && typeof dualInst.render === 'function') {
                const wasAttacking = dualInst.isAttacking;
                if (!wasAttacking) dualInst.isAttacking = true;
                renderWithShogunTransform(() => {
                    dualInst.render(ctx, this.actor);
                });
                if (!wasAttacking) dualInst.isAttacking = false;
            }
        }

        if (this._subWeaponKey) {
            const subInstForRestore = this._subWeaponInstances[this._subWeaponKey];
            if (subInstForRestore && subInstForRestore._renderForceActive
                && subInstForRestore.name !== '二刀流') {
                subInstForRestore.isAttacking = false;
                delete subInstForRestore._renderForceActive;
            }
        }

        if (scaledRangeBackups.length > 0) {
            for (const [inst, rangeValue] of scaledRangeBackups) {
                inst.range = rangeValue;
            }
        }

        this.actor.isAttacking          = saved.isAttacking;
        this.actor.currentAttack        = saved.currentAttack;
        this.actor.attackTimer          = saved.attackTimer;
        this.actor.attackCombo          = saved.attackCombo;
        this.actor.width                = saved.width;
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
