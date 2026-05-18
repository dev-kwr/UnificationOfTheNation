// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { CANVAS_WIDTH, LANE_OFFSET, PLAYER, GRAVITY } from './constants.js';
import { Enemy } from './enemy.js';
import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { Player } from './player.js';

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
        this.width = 72;
        this.height = 108;
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
            easy: 0.70,   // 弱体化
            normal: 1.00, // 基準
            hard: 1.45    // 大幅強化
        };
        const scale = bossDamageScaleByDifficulty[difficultyId] || bossDamageScaleByDifficulty.normal;
        this.damage = Math.max(1, Math.round(this.damage * scale));
    }
    
    update(deltaTime, player, obstacles = []) {
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

        const shouldRemove = super.update(deltaTime, player, obstacles);
        if (!shouldRemove && !this.isEntering && this.isAlive && !this.isDying && !this.previewMode) {
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
        // 攻撃直前に最新のHP状態や難易度に応じたTierを再計算して反映
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
        if (difficultyId === 'hard') return 2;   // 最初からLv2相当
        if (difficultyId === 'normal') return 0;
        return 0;
    }

    getSubWeaponEnhanceTier() {
        // HP割合に応じて0〜3まで強化（HPが25%減るごとにLv+1）
        const hpRatio = this.hp / this.maxHp;
        let tierFromHp = 0;
        if (hpRatio < 0.25) tierFromHp = 3;
        else if (hpRatio < 0.5) tierFromHp = 2;
        else if (hpRatio < 0.75) tierFromHp = 1;
        
        return Math.max(tierFromHp, this.getDifficultyReplicaTierBonus());
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
    
    renderBody() {
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
        // 誤った効果音(playSpecial)を削除
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
        
        // プレイヤーのFirebomb仕様と同期 (js/weapon.js)
        const sizeUp = toolTier >= 3;
        const bombRadius = sizeUp ? 14 : 11;
        const bombDamages = [1.0, 1.22, 1.33, 1.55]; // プレイヤーの 18, 22, 24, 28 の比率
        let bombDamage = Math.max(1, Math.round(this.damage * (bombDamages[toolTier] || 1.0)));
        if (sizeUp) bombDamage = Math.round(bombDamage * 1.22);
        
        const explosionRadius = sizeUp ? 104 : 70; // プレイヤーの 90 * 1.16 : 70
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
                        // プレイヤーのBombと同様のリッチな多層爆炎エフェクト
                        const progress = this.timer / this.explosionDuration;
                        const currentRadius = this.explosionRadius * Math.pow(progress, 0.4);
                        const alpha = 1 - Math.pow(progress, 1.5);
                        
                        ctx.globalCompositeOperation = 'lighter';

                        // 外側の熱波
                        const outerGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, currentRadius * 1.2);
                        outerGrad.addColorStop(0.3, `rgba(255, 80, 0, ${alpha * 0.7})`);
                        outerGrad.addColorStop(0.8, `rgba(150, 20, 0, ${alpha * 0.4})`);
                        outerGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = outerGrad;
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, currentRadius * 1.2, 0, Math.PI * 2);
                        ctx.fill();
                        
                        // 内側の爆発コア
                        const innerGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, currentRadius);
                        innerGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
                        innerGrad.addColorStop(0.2, `rgba(255, 255, 150, ${alpha})`);
                        innerGrad.addColorStop(0.6, `rgba(255, 120, 0, ${alpha * 0.9})`);
                        innerGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
                        ctx.fillStyle = innerGrad;

                        // 星型の爆発ポリゴン
                        ctx.beginPath();
                        const spikes = 12;
                        for (let i = 0; i < spikes * 2; i++) {
                            const angle = (Math.PI * 2 / (spikes * 2)) * i + progress;
                            const r = (i % 2 === 0) ? currentRadius : currentRadius * 0.5;
                            const px = this.x + Math.cos(angle) * r;
                            const py = this.y + Math.sin(angle) * r;
                            if (i === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        ctx.fill();

                        // 火花パーティクル
                        if (progress < 0.6) {
                            ctx.fillStyle = `rgba(255, 200, 100, ${alpha})`;
                            for(let i=0; i<5; i++) {
                                const sd = currentRadius * (0.5 + Math.random());
                                const sa = Math.random() * Math.PI * 2;
                                ctx.beginPath();
                                ctx.arc(this.x + Math.cos(sa)*sd, this.y + Math.sin(sa)*sd, 1 + Math.random()*2, 0, Math.PI*2);
                                ctx.fill();
                            }
                        }
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
        this.forceSubWeaponRender = true;
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
            weaponMode: 'none',
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

        const spear = this.weaponReplica;
        if (!spear) return;

        const dir = this.facingRight ? 1 : -1;
        const centerX = this.x + this.width * 0.5;
        const shoulderY = this.y + this.height * 0.38 + Math.abs(this.bob) * 0.14;
        const attackPoseActive = !!(spear && spear.isAttacking);
        const spearProgress = (attackPoseActive && Number.isFinite(spear.attackDuration) && spear.attackDuration > 0)
            ? Math.max(0, Math.min(1, 1 - ((spear.attackTimer || 0) / spear.attackDuration)))
            : 0;
        const windup = attackPoseActive ? Math.max(0, 1 - (spearProgress / 0.34)) : 0;
        const thrustDrive = attackPoseActive
            ? Math.max(0, Math.sin(Math.max(0, Math.min(1, (spearProgress - 0.22) / 0.56)) * (Math.PI * 0.5)))
            : 0;
        const shoulderSlide = -windup * 2.6 + thrustDrive * 4.4;
        const handSlide = -windup * 6.4 + thrustDrive * 2.8;
        const leanBase = (1.2 + this.torsoLean * 0.55 + (this.isAttacking ? 0.9 : 0)) * 1.14;
        const facingLead = dir * this.width * 0.035;
        const shoulderCenterX = centerX + dir * (leanBase + shoulderSlide * 0.42) + facingLead;
        const bodyScreenTilt = dir * this.width * 0.038;
        const shoulderFrontX = shoulderCenterX + dir * (this.width * 0.14 + bodyScreenTilt * 0.26 + shoulderSlide * 0.52);
        const shoulderBackX = shoulderCenterX - dir * (this.width * 0.095 + bodyScreenTilt * 0.16 - shoulderSlide * 0.38);
        const shoulderFrontY = shoulderY + this.height * 0.018 + windup * 0.72 - thrustDrive * 0.45;
        const shoulderBackY = shoulderY + this.height * 0.032 + windup * 0.82 - thrustDrive * 0.36;

        const grips = (typeof spear.getGripAnchors === 'function')
            ? spear.getGripAnchors(this)
            : null;
        const tipTarget = grips
            ? { x: grips.rear.x + dir * handSlide * 0.72 + dir * 1.2, y: grips.rear.y + windup * 0.58 - thrustDrive * 0.44 }
            : { x: shoulderFrontX + dir * (this.width * 0.34), y: shoulderFrontY + this.height * 0.12 };
        const rootTarget = grips
            ? { x: grips.front.x + dir * handSlide * 0.44 - dir * 1.1, y: grips.front.y + windup * 0.5 - thrustDrive * 0.36 }
            : { x: shoulderBackX + dir * (this.width * 0.2), y: shoulderBackY + this.height * 0.14 };
        const backReach = Math.hypot(rootTarget.x - shoulderBackX, rootTarget.y - shoulderBackY);
        const frontReach = Math.hypot(tipTarget.x - shoulderFrontX, tipTarget.y - shoulderFrontY);
        const backUpperLen = Math.max(this.height * 0.19, backReach * 0.64);
        const backForeLen = Math.max(this.height * 0.17, backReach * 0.56);
        const frontUpperLen = Math.max(this.height * 0.2, frontReach * 0.66);
        const frontForeLen = Math.max(this.height * 0.18, frontReach * 0.58);

        // 奥腕 -> 槍 -> 手前腕 の順で描画し、プレイヤーと同じ持ち方に寄せる
        this.drawJointedArm(ctx, {
            shoulderX: shoulderBackX,
            shoulderY: shoulderBackY,
            handX: rootTarget.x,
            handY: rootTarget.y,
            upperLen: backUpperLen,
            foreLen: backForeLen,
            bendSign: dir * 0.88,
            upperWidth: 7.8,
            foreWidth: 7.0,
            jointRadius: 4.2,
            baseColor: '#171717',
            handColor: '#1a1a1a'
        });

        if (typeof spear.render === 'function') {
            spear.render(ctx, this);
        }

        this.drawJointedArm(ctx, {
            shoulderX: shoulderFrontX,
            shoulderY: shoulderFrontY,
            handX: tipTarget.x,
            handY: tipTarget.y,
            upperLen: frontUpperLen,
            foreLen: frontForeLen,
            bendSign: -dir * 0.82,
            upperWidth: 8.2,
            foreWidth: 7.4,
            jointRadius: 4.5,
            baseColor: '#171717',
            handColor: '#1a1a1a'
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
        this.width = 84;
        this.height = 120;
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
        this.speedVarianceRange = 0;
        this.speedVarianceBias = 0;
        this.movementTempo = 1;
        this.attackRange = Math.round(120 * this.scaleMultiplier);
        this.incomingDamageScale = 0.55;
        this.weaponReplica = null;

        this.actorBaseWidth = 40;
        this.actorBaseHeight = 60;
        this.width  = Math.round(this.actorBaseWidth * this.scaleMultiplier);
        this.height = Math.round(this.actorBaseHeight * this.scaleMultiplier);

        this.actor = new Player(0, 0, this.groundY);
        this.actor.characterType = 'shogun';
        this.actor.scaleMultiplier = this.scaleMultiplier;
        this.actor.width  = this.actorBaseWidth;
        this.actor.height = this.actorBaseHeight;
        this.actor.progression = {
            normalCombo: 3,
            subWeapon:   3,
            specialClone: 3,
        };
        this.actor.isUsingSpecial                 = true;
        this.actor.specialCloneCombatStarted      = true;
        if (typeof this.actor.rebuildSpecialCloneSlots === 'function') {
            this.actor.rebuildSpecialCloneSlots();
        }

        this._ougiActive    = false;
        this._ougiWasActive = false;

        this._attackTimer      = 0;
        this._comboStep        = 0;
        this._currentComboStep = 0;
        this._currentAttackProfile = null;
        this._comboPendingSteps = [];
        this._comboFinisherAirLockTimer = 0;
        this._comboTrailRenderAnchors = new Map();
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
        this._subWeaponInstances.odachi.isShogunOdachi = true;
        this.applyScaleToSubWeapons();

        this.isCrouching  = false;
        this.progression  = { subWeapon: 3, normalCombo: 3 };
        this.subWeaponAction  = null;
        this.subWeaponTimer   = 0;
        this.currentSubWeapon = null;
        this.getSubWeaponEnhanceTier  = () => this.progression.subWeapon;
        this.getSubWeaponCloneOffsets = () => this.getActorSubWeaponCloneOffsets(this);
        this.triggerCloneSubWeapon    = (index) => {
            if (!Number.isFinite(index) || index < 0) return;
            if (this.getActorSpecialCloneTier() >= 3) return;
            if (this.actor && this.currentSubWeapon) {
                if (this.actor.specialCloneAlive && this.actor.specialCloneAlive[index] === false) return;
                if (this.actor.specialCloneSlots && this.actor.specialCloneSlots[index] === 0) return;
                // ボス本体のcurrentSubWeaponを一時的に分身に渡して初期化
                const prev = this.actor.currentSubWeapon;
                this.actor.currentSubWeapon = this.currentSubWeapon;
                
                // 将軍の分身も忍者と同じ分身用インスタンス経路で起こす
                if (typeof this.actor.activateCloneSubWeaponInstance === 'function') {
                    const actionName = typeof this.actor.getCloneSubWeaponActionName === 'function'
                        ? this.actor.getCloneSubWeaponActionName(this.currentSubWeapon)
                        : (this.currentSubWeapon.name === '火薬玉' || this.currentSubWeapon.name === '手裏剣' ? 'throw' : this.currentSubWeapon.name);
                    const attackType = typeof this.actor.getCloneSubWeaponAttackType === 'function'
                        ? this.actor.getCloneSubWeaponAttackType(actionName, this.currentSubWeapon)
                        : null;
                    // 分身用のタイマーとアクションをセット（updateOugiで上書きされるが発動判定に必要）
                    this.actor.specialCloneSubWeaponTimers[index] = this.actor.getSubWeaponActionDurationMs(
                        actionName,
                        this.currentSubWeapon
                    );
                    this.actor.specialCloneSubWeaponActions[index] = actionName;
                    this.actor.activateCloneSubWeaponInstance(index, attackType);
                }
                
                this.actor.currentSubWeapon = prev;
            }
        };
        this.getFootY = () => this.y + this.height;

        // 直前に使用した攻撃種別（連続同技防止）
        this._lastAttackType = null;
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
            if (inst.name === '大太刀') continue; // 大太刀は描画スケール・接地基準補正が武器側で完結するためレンジ拡大対象外
            scaleNum(inst, 'range');
            scaleNum(inst, 'baseRange');
        }

        const shuriken = this._subWeaponInstances.shuriken;
        if (shuriken) {
            scaleNum(shuriken, 'projectileRadius');
            scaleNum(shuriken, 'projectileRadiusHoming');
        }
    }

    getActorGroundYForRenderScale(_renderScale = this.scaleMultiplier, actorRenderY = null, actorRenderH = this.actorBaseHeight, actorFootGroundOffset = 0) {
        if (this.isEnemy) return this.groundY;

        const modelHeight = Number.isFinite(actorRenderH) && actorRenderH > 0 ? actorRenderH : this.actorBaseHeight;
        const footOffset = Number.isFinite(actorFootGroundOffset) ? actorFootGroundOffset : 0;
        const drawY = Number.isFinite(actorRenderY)
            ? actorRenderY
            : this.y + (this.height - modelHeight) * 0.62 + footOffset;
        return drawY + PLAYER.HEIGHT - footOffset - LANE_OFFSET;
    }

    getActorSpaceState() {
        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        const actorW = this.actorBaseWidth || Math.max(1, Math.round(this.width / renderScale));
        const actorH = this.actorBaseHeight || Math.max(1, Math.round(this.height / renderScale));
        const state = {
            x: this.x + (this.width - actorW) * 0.5,
            y: this.y + (this.height - actorH) * 0.62 + 2,
            width: actorW,
            height: actorH,
            groundY: this.groundY,
            facingRight: this.facingRight,
            isGrounded: this.isGrounded,
            motionTime: this.motionTime,
            bob: 0,
            isEnemy: false,
            getSubWeaponCloneOffsets: () => this.getActorSubWeaponCloneOffsets(state),
            triggerCloneSubWeapon: (idx) => this.triggerCloneSubWeapon(idx),
        };
        return state;
    }

    getActorSubWeaponCloneOffsets(owner = null) {
        if (!this._ougiActive || !this.actor || !Array.isArray(this.actor.specialClonePositions)) return [];
        if (this.getActorSpecialCloneTier() >= 3) return [];
        const ref = owner || this;
        const centerX = ref.x + ref.width * 0.5;
        const centerY = ref.y + ref.height * 0.55;
        const offsets = [];
        for (let index = 0; index < this.actor.specialClonePositions.length; index++) {
            if (this.actor.specialCloneSlots && this.actor.specialCloneSlots[index] === 0) continue;
            if (this.actor.specialCloneAlive && !this.actor.specialCloneAlive[index]) continue;
            const pos = this.actor.specialClonePositions[index];
            if (!pos) continue;
            offsets.push({
                index,
                dx: pos.x - centerX,
                dy: pos.y - centerY
            });
        }
        return offsets;
    }

    getActorSpecialCloneTier() {
        const rawTier = this.actor && this.actor.progression && Number.isFinite(this.actor.progression.specialClone)
            ? this.actor.progression.specialClone
            : (this.progression && Number.isFinite(this.progression.specialClone)
                ? this.progression.specialClone
                : 0);
        return Math.max(0, Math.min(3, Math.floor(rawTier) || 0));
    }

    getThrowOwnerState() {
        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        const actorRenderW = this.actorBaseWidth || Math.max(1, Math.round(this.width / renderScale));
        const actorRenderH = this.actorBaseHeight || Math.max(1, Math.round(this.height / renderScale));
        const actorFootGroundOffset = 0;
        const actorRenderX = this.x + (this.width - actorRenderW) * 0.5;
        const actorRenderY = this.y + (this.height - actorRenderH) * 0.62 + actorFootGroundOffset;
        // しゃがみ時のみY下方オフセット（立ち投げは元の位置）
        const throwLaunchYOffset = this.isCrouching ? (this.height - 60) * 0.25 : 0;
        const state = {
            x: actorRenderX,
            y: actorRenderY + throwLaunchYOffset,
            width: actorRenderW,
            height: PLAYER.HEIGHT,
            groundY: this.groundY,
            facingRight: this.facingRight,
            isGrounded: this.isGrounded,
            motionTime: this.motionTime,
            isEnemy: false,
            getSubWeaponCloneOffsets: () => this.getActorSubWeaponCloneOffsets(state),
            triggerCloneSubWeapon: (idx) => this.triggerCloneSubWeapon(idx),
        };
        return state;
    }

    transformActorProjectilePointToWorld(x, y) {
        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        if (Math.abs(renderScale - 1) <= 0.001) return { x, y };
        const pivotX = this.x + this.width * 0.5;
        const pivotY = this.y + this.height * 0.62;
        return {
            x: pivotX + (x - pivotX) * renderScale,
            y: pivotY + (y - pivotY) * renderScale
        };
    }

    transformActorRenderPointToWorld(x, y, renderScale) {
        const scale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
        const pivotX = this.x + this.width * 0.5;
        const pivotY = this.y + this.height * 0.62;
        const dir2d = this.facingRight ? 1 : -1;
        const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
        const attackBias = this.isAttacking ? 0.013 : 0;
        const yawSkew = dir2d * (0.046 + moveBias + attackBias);

        const scaledX = pivotX + (x - pivotX) * scale;
        const scaledY = pivotY + (y - pivotY) * scale;
        const dx = scaledX - pivotX;
        const dy = scaledY - pivotY;

        return {
            x: pivotX + (dx / 0.982) + ((-yawSkew / 0.982) * dy),
            y: pivotY + dy
        };
    }

    getRenderedOdachiImpactOffset(odachi, renderScale) {
        if (
            !odachi ||
            !this.actor ||
            !Number.isFinite(odachi.impactX) ||
            !Number.isFinite(odachi.impactY) ||
            typeof odachi.getPose !== 'function' ||
            typeof odachi.localToWorldOnPose !== 'function'
        ) {
            return null;
        }
        const pose = odachi.getPose(this.actor);
        if (!pose || pose.phase !== 'planted') return null;
        const bladeEnd = (pose.bladeLen || 0) + 8;
        const visualTip = odachi.localToWorldOnPose(pose, bladeEnd + 5.0, 0);
        const scale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
        const pivotX = this.x + this.width * 0.5;
        const pivotY = this.y + this.height * 0.62;
        // 大太刀本体は playerRenderer 側で将軍の yawSkew をキャンセルして描く。
        // 衝撃波も同じ見た目の切先へ合わせるため、ここでは拡大のみを反映する。
        const renderedTip = {
            x: pivotX + (visualTip.x - pivotX) * scale,
            y: pivotY + (visualTip.y - pivotY) * scale
        };
        const tipVisualNudgeX = 0;
        return {
            x: renderedTip.x + tipVisualNudgeX - odachi.impactX,
            y: renderedTip.y - odachi.impactY
        };
    }

    transformActorTrailPointToWorld(point, renderScale, actorFootGroundOffset = 0) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return point;
        const scale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
        if (Math.abs(scale - 1) <= 0.001) return { ...point };
        const fallbackPivotX = this.x + this.width * 0.5;
        const fallbackPivotY = this.y + this.height * 0.62;
        const pivotX = Number.isFinite(point.playerX) ? point.playerX : fallbackPivotX;
        const pivotY = Number.isFinite(point.playerY)
            ? point.playerY + PLAYER.HEIGHT * (0.62 - 0.5) - actorFootGroundOffset
            : fallbackPivotY;
        return {
            ...point,
            x: pivotX + (point.x - pivotX) * scale,
            y: pivotY + (point.y - pivotY) * scale,
            centerX: Number.isFinite(point.centerX)
                ? pivotX + (point.centerX - pivotX) * scale
                : point.centerX,
            centerY: Number.isFinite(point.centerY)
                ? pivotY + (point.centerY - pivotY) * scale
                : point.centerY
        };
    }

    renderDualBladeSlashTrailsAnchored(ctx, renderScale, actorFootGroundOffset = 0) {
        if (!this.actor || typeof this.actor.renderComboSlashTrail !== 'function') return;
        const bluePalette = { front: [130, 234, 255], back: [76, 154, 226] };
        const redPalette = { front: [255, 90, 90], back: [214, 74, 74] };
        const isDualZActive = !!(
            this.actor.subWeaponAction === '二刀_Z' &&
            this.actor.subWeaponTimer > 0
        );
        const drawTrail = (points, palette, key) => {
            if (!Array.isArray(points) || points.length < 2) return;
            const renderPoints = points.map((p) => this.transformActorTrailPointToWorld(p, renderScale, actorFootGroundOffset));
            this.actor.renderComboSlashTrail(ctx, {
                points: renderPoints,
                palette,
                forceLinearSmooth: true,
                isAttacking: isDualZActive,
                physicalScale: Math.max(1, renderScale),
                getBoostAnchor: () => this[`_${key}BoostAnchor`] || null,
                setBoostAnchor: (_step, value) => { this[`_${key}BoostAnchor`] = value; }
            });
        };
        drawTrail(this.actor.dualBladeBackTrailPoints, bluePalette, 'shogunDualBack');
        drawTrail(this.actor.dualBladeFrontTrailPoints, redPalette, 'shogunDualFront');
    }

    getThrowableVisualScale(type) {
        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        if (type === 'bomb') return Math.max(1, Math.min(1.35, 1 + (renderScale - 1) * 0.28));
        if (type === 'shuriken') return Math.max(1, Math.min(1.42, 1 + (renderScale - 1) * 0.32));
        return 1;
    }

    hasOdachiLingeringVisuals(odachi) {
        return !!(
            odachi && (
                odachi.isAttacking ||
                (odachi.plantedTimer || 0) > 0 ||
                (odachi.fadeOutTimer || 0) > 0 ||
                (odachi.impactFlashTimer || 0) > 0 ||
                (Array.isArray(odachi.groundWaves) && odachi.groundWaves.length > 0) ||
                (Array.isArray(odachi.impactDebris) && odachi.impactDebris.length > 0)
            )
        );
    }

    transformActorHitboxToWorld(box) {
        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        const pivotX = this.x + this.width * 0.5;
        const pivotY = this.y + this.height * 0.62;
        const dir2d = this.facingRight ? 1 : -1;
        const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
        const attackBias = this.isAttacking ? 0.013 : 0;
        const yawSkew = dir2d * (0.046 + moveBias + attackBias);
        const skew = yawSkew / 0.982;
        const xScale = 1 / 0.982;
        const corners = [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x, box.y + box.height],
            [box.x + box.width, box.y + box.height],
        ].map(([x, y]) => {
            let tx = pivotX + (x - pivotX) * renderScale;
            let ty = pivotY + (y - pivotY) * renderScale;
            const dx = tx - pivotX;
            const dy = ty - pivotY;
            tx = pivotX + dx * xScale - skew * dy;
            return { x: tx, y: ty };
        });
        const xs = corners.map(p => p.x);
        const ys = corners.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        return {
            ...box,
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
        };
    }

    getSubWeaponHitbox() {
        if (!this._subWeaponKey) return null;
        const subInst = this._subWeaponInstances[this._subWeaponKey];
        if (!subInst || typeof subInst.getHitbox !== 'function') return null;

        const actorSpaceKeys = new Set(['spear', 'kusarigama', 'dual']);
        const useActorSpace = actorSpaceKeys.has(this._subWeaponKey);
        const owner = useActorSpace ? this.getActorSpaceState() : this;
        let rangeBackup = null;
        // 鎖鎌はビジュアルスケール分の当たり判定をそのまま残す（range除算するとスケール後で相殺されて忍者と同サイズになる）
        if (useActorSpace && this._subWeaponKey !== 'kusarigama' && Number.isFinite(subInst.range) && Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0) {
            rangeBackup = subInst.range;
            subInst.range = subInst.range / this.scaleMultiplier;
        }
        const hb = subInst.getHitbox(owner);
        if (rangeBackup !== null) subInst.range = rangeBackup;
        if (!hb) return null;

        const boxes = Array.isArray(hb) ? hb : [hb];
        return useActorSpace
            ? boxes.map(box => this.transformActorHitboxToWorld(box))
            : boxes;
    }

    applyPhysics(obstacles = []) {
        if (!this.isGrounded) {
            this.vy += GRAVITY;
        }

        this.isGrounded = false;
        this.oldX = this.x;
        this.oldY = this.y;

        let nextX = this.x + this.vx;
        if (this.vx !== 0 && Array.isArray(obstacles)) {
            const sweepTop = Math.min(this.y, this.y + this.vy);
            const sweepBottom = Math.max(this.y + this.height, this.y + this.vy + this.height);
            const edgeTolerance = 2;

            if (this.vx > 0) {
                const currentRight = this.x + this.width;
                for (const obs of obstacles) {
                    if (!obs || obs.isDestroyed) continue;
                    const overlapY = Math.min(sweepBottom, obs.y + obs.height) - Math.max(sweepTop, obs.y);
                    if (overlapY <= edgeTolerance) continue;
                    if (currentRight <= obs.x + 0.5 && nextX + this.width > obs.x) {
                        nextX = Math.min(nextX, obs.x - this.width - 0.01);
                        this.vx = 0;
                    }
                }
            } else {
                const currentLeft = this.x;
                for (const obs of obstacles) {
                    if (!obs || obs.isDestroyed) continue;
                    const overlapY = Math.min(sweepBottom, obs.y + obs.height) - Math.max(sweepTop, obs.y);
                    if (overlapY <= edgeTolerance) continue;
                    const obsRight = obs.x + obs.width;
                    if (currentLeft >= obsRight - 0.5 && nextX < obsRight) {
                        nextX = Math.max(nextX, obsRight + 0.01);
                        this.vx = 0;
                    }
                }
            }
        }

        this.x = nextX;
        this.y += this.vy;

        for (const obs of obstacles) {
            if (!obs || obs.isDestroyed) continue;
            const feetY = this.y + this.height;
            const prevFeetY = this.oldY + this.height;
            // 上着地: intersectsが境界で false になるケースをスナップで吸収
            const hOverlap = this.x + this.width > obs.x + 1 && this.x < obs.x + obs.width - 1;
            if (this.vy >= 0 && prevFeetY <= obs.y + 10 && feetY >= obs.y - 1 && hOverlap) {
                this.y = obs.y - this.height;
                this.vy = 0;
                this.isGrounded = true;
                continue;
            }
            if (!this.intersects(obs)) continue;
            if (this.vy < 0 && this.oldY >= obs.y + obs.height - 10) {
                this.y = obs.y + obs.height;
                this.vy = 0;
            } else if (this.vx > 0 && this.oldX + this.width <= obs.x + 5) {
                this.x = obs.x - this.width;
                this.vx = 0;
            } else if (this.vx < 0 && this.oldX >= obs.x + obs.width - 5) {
                this.x = obs.x + obs.width;
                this.vx = 0;
            }
        }

        if (this.y + this.height >= this.groundY + LANE_OFFSET) {
            this.y = this.groundY + LANE_OFFSET - this.height;
            this.vy = 0;
            this.isGrounded = true;
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
            const normalComboActive = this._attackTimer > 0 && this._currentAttackProfile && this._currentAttackProfile.comboStep;
            if (!normalComboActive && Math.abs(this.vx) < this.speed * 1.8) this.applyDesiredVx(0, 0.34);
            return;
        }
        // クールダウン終了 → 距離に関係なく攻撃（技選択はstartAttack内で距離判定）
        if (this.attackCooldown <= 0) {
            this.attackFacingRight = this.facingRight;
            this.startAttack();
            return;
        }
        // 遠距離(>300)ではフェイントのみ、中近距離では接近
        // feintDirがプレイヤーと逆方向（-dir）の場合は逆方向には向かわず小さく留まる
        let desiredVX = 0;
        if (absX > 300) {
            // フェイントがプレイヤー方向なら通常、逆なら減衰させてプレイヤーと反対側に行かせない
            const feintContrib = this.feintDir * dir > 0
                ? this.feintDir * this.speed * 0.35
                : this.feintDir * this.speed * 0.10;
            desiredVX = feintContrib;
            // 遠距離でもプレイヤー方向に緩やかに近づく
            desiredVX += dir * this.speed * 0.28;
        } else if (absX > this.attackRange * 1.05) {
            desiredVX = this.speed * 1.14 * dir;
        } else if (absX > this.attackRange * 0.55) {
            desiredVX = this.speed * 0.92 * dir;
        }
        // 近距離フェイントも逆方向には行かない
        if (absX <= this.attackRange * 2.0) {
            const nearFeint = this.feintDir * dir > 0
                ? this.feintDir * this.speed * 0.44
                : this.feintDir * this.speed * 0.12;
            desiredVX += nearFeint;
        }
        desiredVX = Math.max(-this.speed * 1.42, Math.min(this.speed * 1.42, desiredVX));
        this.applyDesiredVx(desiredVX, 0.46);
        if (absX > this.attackRange * 1.08 && absX <= 300) this.tryJump(0.022, -15, 400);
    }

    update(deltaTime, player, obstaclesOrEnemies = [], enemiesOrNull = null) {
        const obstacles = Array.isArray(enemiesOrNull)
            ? (Array.isArray(obstaclesOrEnemies) ? obstaclesOrEnemies : [])
            : (this.isEnemy ? (Array.isArray(obstaclesOrEnemies) ? obstaclesOrEnemies : []) : []);
        const enemies = Array.isArray(enemiesOrNull)
            ? enemiesOrNull
            : (this.isEnemy ? [] : (Array.isArray(obstaclesOrEnemies) ? obstaclesOrEnemies : []));
        // サブ技タイマーが残っている間は必ず攻撃更新を継続する
        // （isAttackingが先にfalseになると_subTimerが減らず行動停止するため）
        const odachi = this._subWeaponInstances.odachi;
        const kusa = this._subWeaponInstances.kusarigama;
        const isLingeringSub = (this._subWeaponKey === 'odachi' && this.hasOdachiLingeringVisuals(odachi)) ||
                              (this._subWeaponKey === 'kusarigama' && kusa && kusa.isAttacking);
        const isThrowPoseLingering = this._subAction === 'throw' && this._shurikenVisualTimer > 0;

        if (this._attackTimer > 0 || this._subTimer > 0 || isLingeringSub || isThrowPoseLingering) {
            this.isAttacking = true;
        }
        if (this._comboFinisherAirLockTimer > 0) {
            this._comboFinisherAirLockTimer = Math.max(0, this._comboFinisherAirLockTimer - deltaTime * 1000);
        }

        const shouldRemove = super.update(deltaTime, player, obstacles);
        if (shouldRemove) return true;

        const deltaMs = deltaTime * 1000;
        this._lastDeltaMs = deltaMs;
        if (this._shurikenVisualTimer > 0) {
            this._shurikenVisualTimer = Math.max(0, this._shurikenVisualTimer - deltaMs);
        }

        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0 ? this.scaleMultiplier : 1;
        const actorRenderW = this.actorBaseWidth || Math.max(1, Math.round(this.width / renderScale));
        const actorRenderH = this.actorBaseHeight || Math.max(1, Math.round(this.height / renderScale));
        const actorFootGroundOffset = 0;
        const actorRenderX = this.x + (this.width - actorRenderW) * 0.5;
        const actorRenderY = this.y + (this.height - actorRenderH) * 0.62 + actorFootGroundOffset;

        this.actor.x = actorRenderX;
        this.actor.y = actorRenderY;
        this.actor.width = actorRenderW;
        this.actor.height = PLAYER.HEIGHT;
        this.actor.vx = this.vx;
        this.actor.vy = this.vy;
        this.actor.facingRight = this.facingRight;
        this.actor.isGrounded = this.isGrounded;
        this.actor.motionTime = this.motionTime;
        this.actor.speed = this.speed;

        const _oSpacing  = typeof this.actor.getSpecialCloneSpacing === 'function'
            ? this.actor.getSpecialCloneSpacing()
            : (this.actor.specialCloneSpacing || 180);
        const _oCenterX  = actorRenderX + actorRenderW * 0.5;
        const _oAnchorY  = actorRenderY + PLAYER.HEIGHT * 0.62;
        this.actor.groundY = this.getActorGroundYForRenderScale(renderScale, actorRenderY, actorRenderH, actorFootGroundOffset);
        const _getCloneAnchorY = (x) => {
            const anchorY = typeof this.actor.getSpecialCloneAnchorYAtX === 'function'
                ? this.actor.getSpecialCloneAnchorYAtX(x)
                : (this.groundY + LANE_OFFSET - PLAYER.HEIGHT * 0.38);
            return !this.isEnemy ? anchorY + actorFootGroundOffset : anchorY;
        };

        const _initPos = (unit) => {
            const x = _oCenterX + unit * _oSpacing;
            return {
                x,
                y: !this.isEnemy ? _getCloneAnchorY(x) : _oAnchorY,
                facingRight: this.facingRight,
                prevX: x,
                jumping: this.isEnemy ? !this.isGrounded : false,
                cloneVy: this.isEnemy ? this.vy : 0,
                renderVx: this.vx,
            };
        };

        // 奥義スロット管理（起動/停止イベント駆動 + ゲーム内自動トリガー）
        {
            // 敵ボスの自動奥義発動は無効（分身はプレイヤー将軍のみ使用）

            const _playableOwner = (!this.isEnemy && this._playableOwner && this._playableOwner.isSpecialCloneCombatActive && this._playableOwner.isSpecialCloneCombatActive())
                ? this._playableOwner
                : null;
            const _ougiTierMap = [[1], [-1, 1], [-2, -1, 1, 2], [-2, -1, 1, 2]];
            const _ougiTier = this.getActorSpecialCloneTier();
            const _ougiUnits = _playableOwner && Array.isArray(_playableOwner.specialCloneSlots)
                ? _playableOwner.specialCloneSlots.slice()
                : (_ougiTierMap[_ougiTier] || []);
            const _targetSlots = this._ougiActive ? [0, ..._ougiUnits] : [0];

            if (this._ougiActive !== this._ougiWasActive || this.actor.specialCloneSlots.length !== _targetSlots.length) {
                this.actor.specialCloneSlots                  = _targetSlots;
                this.actor.specialCloneAlive                  = _targetSlots.map(() => true);
                this.actor.specialClonePositions              = _targetSlots.map((unit) => _initPos(unit));
                this.actor.specialCloneAttackTimers           = _targetSlots.map(() => 0);
                this.actor.specialCloneSubWeaponTimers        = _targetSlots.map(() => 0);
                this.actor.specialCloneSubWeaponActions       = _targetSlots.map(() => null);
                this.actor.specialCloneComboSteps             = _targetSlots.map(() => 0);
                this.actor.specialCloneComboResetTimers       = _targetSlots.map(() => 0);
                this.actor.specialCloneCurrentAttacks         = _targetSlots.map(() => null);
                this.actor.specialCloneSlashTrailPoints       = _targetSlots.map(() => []);
                this.actor.specialCloneSlashTrailSampleTimers = _targetSlots.map(() => 0);
                this.actor.specialCloneDualTrailAnchors       = _targetSlots.map(() => null);
                this.actor.specialCloneSubWeaponInstances     = _targetSlots.map(() => null);
                this.actor.specialCloneScarfNodes             = _targetSlots.map(() => null);
                this.actor.specialCloneHairNodes              = _targetSlots.map(() => null);
                this.actor.specialCloneInvincibleTimers       = _targetSlots.map(() => 0);
                this.actor.specialCloneTargets                = _targetSlots.map(() => null);
                this.actor.specialCloneReturnToAnchor         = _targetSlots.map(() => false);

                // 将軍の分身には忍者用のポニーテールは不要なため、初期化を削除

                if (this._ougiActive && !this._ougiWasActive) {
                    audio.playSpecial();
                    if (typeof this.actor.initMistCache === 'function') this.actor.initMistCache();
                    if (typeof this.actor.spawnSpecialSmoke === 'function' && this.actor.specialClonePositions) {
                        // 将軍本体(index 0)には煙を出さず、分身(index 1以降)のみに出す
                        this.actor.spawnSpecialSmoke('appear', this.actor.specialClonePositions.slice(1));
                    }
                }
            } else if (this._ougiActive && !_playableOwner) {
                const _isAutoAiTier = this.getActorSpecialCloneTier() >= 3;
                for (let i = 0; i < this.actor.specialCloneSlots.length; i++) {
                    const pos = this.actor.specialClonePositions[i];
                    if (pos) {
                        pos.prevX = pos.x;
                        pos.x = _oCenterX + this.actor.specialCloneSlots[i] * _oSpacing;
                        pos.y = !this.isEnemy ? _getCloneAnchorY(pos.x) : _oAnchorY;
                        pos.facingRight = this.facingRight;
                        // Lv3+自律クローンは本体の物理状態に連動させない
                        pos.jumping = (!_isAutoAiTier && this.isEnemy) ? !this.isGrounded : false;
                        pos.cloneVy = (!_isAutoAiTier && this.isEnemy) ? this.vy : 0;
                        pos.renderVx = this.vx;
                    }
                }
            }
            this.actor.specialCloneAutoAiEnabled = _playableOwner
                ? !!_playableOwner.specialCloneAutoAiEnabled
                : this.getActorSpecialCloneTier() >= 3;
            this.actor.isUsingSpecial = this._ougiActive;
            this.actor.specialCloneCombatStarted = this._ougiActive;

            if (_playableOwner && this._ougiActive) {
                this.actor.specialCloneAlive[0] = true;
                this.actor.specialClonePositions[0] = _initPos(0);
                const ownerCount = Array.isArray(_playableOwner.specialCloneSlots) ? _playableOwner.specialCloneSlots.length : 0;
                for (let oi = 0; oi < ownerCount; oi++) {
                    const ai = oi + 1;
                    const ownerPos = _playableOwner.specialClonePositions && _playableOwner.specialClonePositions[oi];
                    this.actor.specialCloneAlive[ai] = !_playableOwner.specialCloneAlive || _playableOwner.specialCloneAlive[oi] !== false;
                    this.actor.specialClonePositions[ai] = ownerPos
                        ? {
                            ...ownerPos,
                            y: this.actor.y + PLAYER.HEIGHT * 0.62,
                            jumping: false,
                            cloneVy: 0
                        }
                        : _initPos(_targetSlots[ai] || 0);
                    this.actor.specialCloneAttackTimers[ai] = (_playableOwner.specialCloneAttackTimers && _playableOwner.specialCloneAttackTimers[oi]) || 0;
                    this.actor.specialCloneCurrentAttacks[ai] = (_playableOwner.specialCloneCurrentAttacks && _playableOwner.specialCloneCurrentAttacks[oi]) || null;
                    this.actor.specialCloneComboSteps[ai] = (_playableOwner.specialCloneComboSteps && _playableOwner.specialCloneComboSteps[oi]) || 0;
                    this.actor.specialCloneComboResetTimers[ai] = (_playableOwner.specialCloneComboResetTimers && _playableOwner.specialCloneComboResetTimers[oi]) || 0;
                    this.actor.specialCloneInvincibleTimers[ai] = (_playableOwner.specialCloneInvincibleTimers && _playableOwner.specialCloneInvincibleTimers[oi]) || 0;
                    const shouldMirrorOwnerCloneSubWeapons = this.actor.specialCloneAutoAiEnabled &&
                        !(_playableOwner && _playableOwner.characterType === 'shogun');
                    if (shouldMirrorOwnerCloneSubWeapons) {
                        this.actor.specialCloneSubWeaponTimers[ai] = (_playableOwner.specialCloneSubWeaponTimers && _playableOwner.specialCloneSubWeaponTimers[oi]) || 0;
                        this.actor.specialCloneSubWeaponActions[ai] = (_playableOwner.specialCloneSubWeaponActions && _playableOwner.specialCloneSubWeaponActions[oi]) || null;
                        this.actor.specialCloneSubWeaponInstances[ai] = (_playableOwner.specialCloneSubWeaponInstances && _playableOwner.specialCloneSubWeaponInstances[oi]) || null;
                    } else {
                        this.actor.specialCloneSubWeaponTimers[ai] = 0;
                        this.actor.specialCloneSubWeaponActions[ai] = null;
                        this.actor.specialCloneSubWeaponInstances[ai] = null;
                    }
                }
            }
            this._ougiWasActive = this._ougiActive;
        }

        // 将軍の分身には忍者用のポニーテールは不要なため、更新処理を削除
        const _useIndependentAutoCloneState = !!(!this.isEnemy && this.actor.specialCloneAutoAiEnabled);

        if (this.actor.specialCloneSlots.length > 0) {
            this.actor.specialCloneAttackTimers[0]     = this._attackTimer;
            this.actor.specialCloneComboSteps[0]       = this._comboStep;
            this.actor.specialCloneSubWeaponTimers[0]  = this._subTimer;
            this.actor.specialCloneSubWeaponActions[0] = this._subAction;
            this.actor.specialCloneCurrentAttacks[0]   = this._currentAttackProfile || null;
            this.actor.specialCloneComboResetTimers[0] = this._attackTimer > 0 ? 0 : (this.actor.specialCloneComboResetTimers[0] || 0);
        }

        // 全スロットの攻撃状態を同期（reinit後も含め確実に反映させる）
        if (!_useIndependentAutoCloneState) {
            for (let _si = 1; _si < this.actor.specialCloneSlots.length; _si++) {
                this.actor.specialCloneAttackTimers[_si]     = this._attackTimer;
                this.actor.specialCloneComboSteps[_si]       = this._comboStep;
                this.actor.specialCloneSubWeaponTimers[_si]  = this._subTimer;
                this.actor.specialCloneSubWeaponActions[_si] = this._subAction;
                this.actor.specialCloneCurrentAttacks[_si]   = this._currentAttackProfile || null;
            }
        }

        this.actor.currentSubWeapon = (this._subWeaponKey === 'dual')
            ? this._subWeaponInstances['dual']
            : null;

        // smokeの寿命更新と移動処理（updateSpecialをスキップしたため手動で全て行う）
        if (this.actor.specialSmoke) {
            for (const puff of this.actor.specialSmoke) {
                puff.life -= deltaMs;
                const lifeRatio = Math.max(0, Math.min(1, puff.life / Math.max(1, puff.maxLife)));
                puff.rot = (puff.rot || 0) + (puff.spin || 0);
                const wobble = Math.sin((this.motionTime + (puff.rot || 0) * 60) * (puff.wobbleFreq || 0.01));
                const wobbleScale = 1 + wobble * 0.35;
                puff.vx += Math.cos((puff.rot || 0) * 1.2) * (puff.wobbleAmp || 0.2) * 0.016 * wobbleScale;
                puff.vy += Math.sin((puff.rot || 0) * 1.1) * (puff.wobbleAmp || 0.2) * 0.01 * wobbleScale;
                if (puff.mode === 'appear') {
                    puff.vy -= 0.006 * (0.6 + lifeRatio * 0.8);
                } else {
                    puff.vy -= 0.003 * (0.45 + lifeRatio * 0.5);
                }
                puff.x += puff.vx;
                puff.y += puff.vy;
                puff.vx *= 0.968;
                puff.vy *= 0.972;
            }
            this.actor.specialSmoke = this.actor.specialSmoke.filter((puff) => puff.life > 0);
        }

        // 分身のサブ武器インスタンス（手裏剣などの弾道）を更新する
        if (this.actor.specialCloneSubWeaponInstances && !_useIndependentAutoCloneState) {
            for (const inst of this.actor.specialCloneSubWeaponInstances) {
                if (inst && typeof inst.update === 'function') {
                    const subWeaponScale = inst.name === '二刀流'
                        ? 1
                        : Math.max(1, this.actor.subWeaponMotionScale || 1);
                    inst.update((deltaMs / 1000) / subWeaponScale, enemies);
                }
            }
        }

        // 全てのサブ武器インスタンスを巡回し、弾道や継続中のアクションがあれば更新する
        Object.entries(this._subWeaponInstances).forEach(([key, inst]) => {
            if (!inst || typeof inst.update !== 'function') return;
            
            // 現在選択中のサブ武器、または弾が残っている、または武器自体が動作中の場合に更新
            const isCurrent = (key === this._subWeaponKey);
            const hasProjectiles = (inst.projectiles && inst.projectiles.length > 0);
            const isActing = inst.isAttacking || (key === 'odachi' && this.hasOdachiLingeringVisuals(inst));
            
            if (isCurrent || hasProjectiles || isActing) {
                if (key === 'shuriken') {
                    const filteredEnemies = enemies.filter(e => e !== this && e !== this.actor);
                    const enemyArg = this.isEnemy ? (this.targetPlayer ? [this.targetPlayer] : []) : filteredEnemies;
                    inst.update(deltaTime, enemyArg);
                } else {
                    inst.update(deltaTime);
                }
                
                // 鎖鎌などの個別終了処理
                if (key === 'kusarigama' && !inst.isAttacking && this._subTimer <= 0) {
                    if (isCurrent) {
                        this._subAction = null;
                        this._subWeaponKey = null;
                    }
                }
            }
        });

        // 手裏剣の更新と当たり判定
        {
            const shurikenInst = this._subWeaponInstances['shuriken'];
            if (shurikenInst && Array.isArray(shurikenInst.projectiles)) {
                // ボス（敵）として投げた手裏剣がプレイヤーに当たる処理
                if (this.isEnemy) {
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
                }

                // _subTimerが切れた後もprojectilesが残っていれば更新を継続
                // （_subWeaponKey==='shuriken'のままでも寿命を進めないと空中で停止する）
                const shouldTickShuriken = shurikenInst.projectiles.length > 0
                    && (this._subWeaponKey !== 'shuriken' || this._subTimer <= 0);
                if (shouldTickShuriken) {
                    const filteredEnemies = enemies.filter(e => e !== this && e !== this.actor);
                    const enemyArg = this.isEnemy ? (this.targetPlayer ? [this.targetPlayer] : []) : filteredEnemies;
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

        // 大太刀: _subTimer終了後も isAttacking=true の間（plantedTimer消化中）は
        // update() を継続し、刺さり演出を最後まで再生する
        {
            const odachiInst = this._subWeaponInstances['odachi'];
            if (odachiInst && typeof odachiInst.update === 'function') {
                if (this._subWeaponKey === 'odachi' && this._subTimer <= 0 && this.hasOdachiLingeringVisuals(odachiInst)) {
                    odachiInst.update(deltaTime);
                    if (!this.hasOdachiLingeringVisuals(odachiInst)) {
                        this._subAction    = null;
                        this._subWeaponKey = null;
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
        const durationMap = {
            shuriken: this._getSubActionDurationMs('throw', 'shuriken'),
            bomb:     this._getSubActionDurationMs('throw', 'bomb'),
            spear:    this._getSubActionDurationMs('大槍', 'spear'),
            kusarigama: this._getSubActionDurationMs('鎖鎌', 'kusarigama'),
            odachi:   this._getSubActionDurationMs('大太刀', 'odachi'),
            dual:     this._getSubActionDurationMs('二刀_合体', 'dual'),
        };

        // 重複なし選択ヘルパー: 前回と同じ技を除外してランダム選択
        const pickFrom = (choices) => {
            const filtered = choices.filter(c => c !== this._lastAttackType);
            const pool = filtered.length > 0 ? filtered : choices;
            return pool[Math.floor(Math.random() * pool.length)];
        };

        let type;
        // 画面の端と端ほどの超遠距離（≈900px以上）: 大槍を強制使用
        if (dist >= 900) {
            type = 'spear';
        } else if (dist > 300) {
            // 遠距離: 手裏剣・二刀流X・鎖鎌
            type = pickFrom(['shuriken', 'dual', 'kusarigama']);
        } else if (dist > 150) {
            // 中距離: 爆弾・大太刀
            type = pickFrom(['bomb', 'odachi']);
        } else {
            // 近距離: 通常Zコンボ・二刀流Z（重複防止のため前回がcomboならdual_zを選ぶ）
            const lastWasCombo = this._lastAttackType === 'combo';
            const lastWasDualZ = this._lastAttackType === 'dual_z';
            if (lastWasCombo) {
                type = 'dual_z';
            } else if (lastWasDualZ) {
                this._comboPendingSteps = [1, 2, 3, 4, 5];
                this._lastAttackType = 'combo';
                this._startNextComboStep();
                return;
            } else {
                // 初回またはその他 → ランダム
                if (Math.random() < 0.5) {
                    this._comboPendingSteps = [1, 2, 3, 4, 5];
                    this._lastAttackType = 'combo';
                    this._startNextComboStep();
                    return;
                }
                type = 'dual_z';
            }
        }

        if (type === 'shuriken' || type === 'bomb') {
            const throwDuration = durationMap[type] || 50;
            this._fireSubWeapon(type);
            this.subWeaponAction = null;
            this._subAction    = 'throw';
            this._subWeaponKey = type;
            this._subTimer     = throwDuration;
            this.attackTimer   = throwDuration;
            this._attackTimer  = 0;
            this._shurikenVisualTimer = type === 'shuriken'
                ? (durationMap.bomb || 72)
                : 0;
            this.attackCooldown = 400;
            this._lastAttackType = type;
            return;
        } else if (type === 'dual_z') {
            // 二刀流Zコンボ: 5段を1段ずつ_fireDualZNextStepで連続発動
            this._subAction    = '二刀_Z';
            this._subWeaponKey = 'dual';
            this._shurikenVisualTimer = 0;
            this.attackCooldown = 500;
            this._dualZPendingSteps = [1, 2, 3, 4, 5];
            this._lastAttackType = 'dual_z';
            this._fireDualZNextStep();
        } else {
            this._subWeaponKey = type;
            this._fireSubWeapon(type);
            // _fireSubWeapon呼び出し後にactionとdurationをセット（dualの場合はcombinedを保証し、速度補正を正しく取得）
            this._subAction = (type === 'dual') ? '二刀_合体' : (actionMap[type] || null);
            const duration     = type === 'dual' ? this._getSubActionDurationMs('二刀_合体', 'dual') : (durationMap[type] || 300);
            this._subTimer     = duration;
            this._shurikenVisualTimer = 0;
            this.attackTimer   = duration;
            this.attackCooldown = 400;
            this._lastAttackType = type;
        }
    }

    // 二刀流Zコンボの次段を発動
    _fireDualZNextStep() {
        const dual = this._subWeaponInstances['dual'];
        if (!dual) return;
        
        // アクション名とキーを保証（プレビュー画面からの直接呼び出し時などに必要）
        this._subAction    = '二刀_Z';
        this._subWeaponKey = 'dual';
        this.isAttacking   = true;
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
        const enhanceTier = typeof this.getSubWeaponEnhanceTier === 'function'
            ? Math.max(0, Math.min(3, Math.floor(this.getSubWeaponEnhanceTier())))
            : 3;
        if (typeof dual.applyEnhanceTier === 'function') {
            dual.applyEnhanceTier(enhanceTier, this);
        } else if (Object.prototype.hasOwnProperty.call(dual, 'enhanceTier')) {
            dual.enhanceTier = enhanceTier;
        }
        if (!this.isEnemy && typeof dual.mainMotionSpeedScale === 'number') {
            const ownerMotionScale = (this._playableOwner && this._playableOwner.attackMotionScale) || this.attackMotionScale || 1;
            dual.mainMotionSpeedScale = Math.max(0.78, ownerMotionScale * 0.78);
        }
        const prevSubWeapon = this.currentSubWeapon;
        this.currentSubWeapon = dual;
        this._useSubWeaponAsPlayerStyle(dual, 'main'); // 1段発動（内部でcomboIndexを進める）
        this.currentSubWeapon = prevSubWeapon;
        // この段のduration分だけ_subTimerをセット
        const dur = Math.max(112, dual.mainDuration || 204);
        this._subTimer   = dur;
        this.attackTimer = dur;
        this._applyDualZMotion(dual.comboIndex || 0);
    }

    _startNextComboStep() {
        const step = this._comboPendingSteps.shift();
        if (step == null) {
            this._attackTimer = 0;
            this.isAttacking  = false;
            this._comboStep = 0;
            this._currentComboStep = 0;
            this._currentAttackProfile = null;
            this.actor.specialCloneCurrentAttacks[0] = null;
            this._comboFinisherAirLockTimer = 0;
            this.attackCooldown = 480;
            return;
        }
        const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        const actorFootGroundOffset = 0;
        const actorX = this.x + this.width * 0.5 - this.actorBaseWidth * 0.5;
        const actorY = this.y + this.height * 0.62 - PLAYER.HEIGHT * 0.62 + actorFootGroundOffset;
        const profile = this.actor.buildComboAttackProfileWithTrail(step, {
            x: actorX,
            y: actorY,
            width: this.actorBaseWidth,
            height: PLAYER.HEIGHT,
            facingRight: this.facingRight,
            isCrouching: false,
            vx: this.vx,
            vy: this.vy,
            speed: this.speed
        });
        if ((step === 4 || step === 5) && renderScale > 1.001) {
            const sweepScale = 1 / renderScale;
            const pivotX = actorX + this.actorBaseWidth * 0.5;
            const pivotY = actorY + PLAYER.HEIGHT * 0.62;
            if (Number.isFinite(pivotX) && Number.isFinite(pivotY)) {
                if (Number.isFinite(profile.trailCurveStartX)) {
                    profile.trailCurveStartX = pivotX + (profile.trailCurveStartX - pivotX) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveStartY)) {
                    profile.trailCurveStartY = pivotY + (profile.trailCurveStartY - pivotY) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveControlX)) {
                    profile.trailCurveControlX = pivotX + (profile.trailCurveControlX - pivotX) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveControlY)) {
                    profile.trailCurveControlY = pivotY + (profile.trailCurveControlY - pivotY) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveEndX)) {
                    profile.trailCurveEndX = pivotX + (profile.trailCurveEndX - pivotX) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveEndY)) {
                    profile.trailCurveEndY = pivotY + (profile.trailCurveEndY - pivotY) * sweepScale;
                }
            }
        }
        profile.trailAttackId = ++this.actor.comboSlashTrailAttackSerial;
        const dur = Math.max(1, profile.durationMs || 200);
        this._currentComboStep = step;
        this._comboStep = step;
        this._currentAttackProfile = profile;
        this.actor.specialCloneCurrentAttacks[0] = profile;
        this._attackTimer = dur;
        this.attackTimer  = dur;
        this.isAttacking  = true;
        this.attackCooldown = Math.max(28, dur * (profile.cooldownScale || 1));
        if (step === 5) {
            this._currentAttackProfile.knockbackX = 16;
            this._currentAttackProfile.knockbackY = -7;
            this._currentAttackProfile.range = Math.max(this._currentAttackProfile.range || 0, 128);
            this._comboFinisherAirLockTimer = Math.max(this._comboFinisherAirLockTimer, 2200);
        }
        // player.jsのattack()と同じstepごとの初速を再現
        const dir = this.facingRight ? 1 : -1;
        const impulse = (profile.impulse || 1) * this.speed;
        if (step === 1) {
            const groundedAtStart = this.isGrounded;
            this.vx *= 0.12;
            if (Math.abs(this.vx) < 0.2) this.vx = 0;
            if (groundedAtStart) {
                this.vy = 0;
                this.isGrounded = true;
            } else {
                this.vy = Math.max(this.vy, -0.8);
            }
        } else if (step === 2) {
            this.vx = this.vx * 0.16 + dir * impulse * 0.9;
            if (this.isGrounded) {
                this.vy = 0;
                this.isGrounded = true;
            } else {
                this.vy = Math.min(this.vy, -1.2);
            }
        } else if (step === 3) {
            // 忍者の三段目と同じ式を、将軍の見た目スケール分だけ拡大して突進量を揃える
            const shogunImpulse = impulse * (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1);
            this.vx = this.vx * 0.12 + dir * shogunImpulse * 1.71;
            this.vy = Math.min(this.vy, -8.2);
            this.isGrounded = false;
        } else if (step === 4) {
            this.vx = this.vx * 0.24 + dir * impulse * 0.42;
            this.vy = Math.min(this.vy, -10.6);
            this.isGrounded = false;
        } else if (step === 5) {
            this.vx = this.vx * 0.18;
            this.vy = Math.max(this.vy, 3.4);
            this.isGrounded = false;
        }
        this.animState = this._currentAttackProfile.type;
        audio.playSlash(Math.min(4, step));
    }

    updateAttack(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const activeAttack = this._currentAttackProfile;

        if (this._attackTimer > 0) {
            if (activeAttack) {
                const duration = Math.max(1, activeAttack.durationMs || this._attackTimer);
                const motionCapMs = activeAttack.comboStep === 4
                    ? Math.min(deltaMs, 1000 / 58)
                    : deltaMs;
                const prevMotionElapsed = Number.isFinite(activeAttack.motionElapsedMs) ? activeAttack.motionElapsedMs : 0;
                activeAttack.motionElapsedMs = Math.max(0, Math.min(duration, prevMotionElapsed + motionCapMs));
            }

            if (activeAttack && activeAttack.comboStep && this.isGrounded) {
                this.vx *= 0.965;
            }
            if (activeAttack && activeAttack.comboStep === 1) {
                const direction = this.facingRight ? 1 : -1;
                const targetVx = 0;
                this.vx = this.vx * 0.62 + targetVx * 0.38;
                if (this.vx * direction < 0) this.vx = 0;
                if (Math.abs(this.vx) < 0.18) this.vx = 0;
                if (this.isGrounded) {
                    this.vy = 0;
                } else {
                    this.vy = Math.max(this.vy, 1.2);
                }
            } else if (activeAttack && activeAttack.comboStep === 4) {
                const duration = Math.max(1, activeAttack.durationMs || this._attackTimer);
                const progress = Number.isFinite(activeAttack.motionElapsedMs)
                    ? Math.max(0, Math.min(1, activeAttack.motionElapsedMs / duration))
                    : Math.max(0, Math.min(1, 1 - (this._attackTimer / duration)));
                const direction = this.facingRight ? 1 : -1;
                const z4HeightScale = 0.96;

                if (progress < 0.42) {
                    const t = progress / 0.42;
                    this.vx = this.vx * 0.52 + direction * this.speed * (0.2 - t * 0.08);
                    this.vy = (-20.4 + t * 2.6) * z4HeightScale;
                } else if (progress < 0.9) {
                    const t = (progress - 0.42) / 0.48;
                    const backSpeed = this.speed * (0.66 + t * 0.94);
                    const holdVy = (-0.9 + t * 1.18) * z4HeightScale;
                    this.vx = this.vx * 0.4 + (-direction * backSpeed) * 0.6;
                    this.vy = Math.max(-1.0, Math.min(0.95, holdVy));
                } else {
                    this.vx *= 0.78;
                    this.vy = Math.min(this.vy, 0.55);
                }
                if (progress < 0.72) {
                    const riseLockT = Math.max(0, Math.min(1, progress / 0.72));
                    const minRiseVy = (-18.8 + riseLockT * 14.8) * z4HeightScale;
                    this.vy = Math.min(this.vy, minRiseVy);
                    this.isGrounded = false;
                }
                this.isGrounded = false;
            } else if (activeAttack && activeAttack.comboStep === 5 && (this._attackTimer > 0 || !this.isGrounded)) {
                const duration = Math.max(1, activeAttack.durationMs || this._attackTimer);
                const progress = Math.max(0, Math.min(1, 1 - (this._attackTimer / duration)));
                const direction = this.facingRight ? 1 : -1;
                if (progress < 0.26) {
                    this.vx *= 0.82;
                    this.vy = Math.min(this.vy, -1.2);
                } else if (progress < 0.76) {
                    const fallT = (progress - 0.26) / 0.5;
                    this.vx = this.vx * 0.7 + direction * this.speed * 0.08;
                    this.vy = this.vy * 0.34 + (9.8 + fallT * 19.8) * 0.66;
                } else {
                    this.vx *= 0.64;
                    if (!this.isGrounded) {
                        this.vy = Math.max(this.vy, 13.4);
                    }
                }
            } else if (!(activeAttack && activeAttack.comboStep)) {
                this.vx *= 0.92;
            }

            this._attackTimer -= deltaMs;
            if (this._attackTimer <= deltaMs + 0.001) {
                const minCompletion = (activeAttack && activeAttack.comboStep === 4) ? 0.99 : 0.98;
                const duration = Math.max(1, activeAttack?.durationMs || this._attackTimer || 1);
                const progress = Number.isFinite(activeAttack?.motionElapsedMs)
                    ? activeAttack.motionElapsedMs / duration
                    : 1.0;
                if (progress < minCompletion) {
                    this._attackTimer = deltaMs + 1;
                    return;
                }
            }
            if (this._attackTimer <= 0) {
                if (
                    activeAttack &&
                    activeAttack.comboStep === 4 &&
                    Number.isFinite(activeAttack.motionElapsedMs)
                ) {
                    const duration = Math.max(1, activeAttack.durationMs || 1);
                    if (activeAttack.motionElapsedMs < duration - 0.5) {
                        this._attackTimer = 1;
                        return;
                    }
                }
                if (
                    activeAttack &&
                    activeAttack.comboStep === 5 &&
                    !this.isGrounded &&
                    this._comboFinisherAirLockTimer > 0
                ) {
                    this._attackTimer = 1;
                    return;
                }
                this._attackTimer = 0;
                if (this._comboPendingSteps && this._comboPendingSteps.length > 0) {
                    this._startNextComboStep();
                } else {
                    this.isAttacking  = false;
                    this._comboStep = 0;
                    this._currentComboStep = 0;
                    this._currentAttackProfile = null;
                    this.actor.specialCloneCurrentAttacks[0] = null;
                    this._comboFinisherAirLockTimer = 0;
                    this.attackCooldown = Math.max(this.attackCooldown, 480);
                }
            }
        } else if (this._subTimer > 0) {
            // 二刀流Zコンボ中はプレイヤーと同じプログレスベース移動
            if (this._subAction === '二刀_Z') {
                const dual = this._subWeaponInstances['dual'];
                if (dual && typeof dual.getMainSwingPose === 'function') {
                    const pose = dual.getMainSwingPose();
                    const step = pose.comboIndex || 0;
                    const p = Math.max(0, Math.min(1, pose.progress || 0));
                    const direction = this.facingRight ? 1 : -1;
                    const lerpRate = Math.max(0.08, Math.min(0.42, (deltaMs / 1000) * 13));
                    const blend = (cur, tgt) => cur + (tgt - cur) * lerpRate;

                    if (step === 1) {
                        const targetVx = direction * this.speed * (0.14 + Math.sin(p * Math.PI) * 0.28);
                        this.vx = blend(this.vx, targetVx);
                    } else if (step === 2) {
                        let targetVx;
                        if (p < 0.08) {
                            targetVx = -direction * this.speed * (0.12 + p * 0.2);
                        } else if (p < 0.48) {
                            targetVx = direction * this.speed * (0.24 + (p - 0.08) * 1.8);
                        } else {
                            targetVx = direction * this.speed * (0.96 - (p - 0.48) * 1.6);
                        }
                        this.vx = blend(this.vx, targetVx);
                    } else if (step === 3) {
                        let targetVx;
                        if (p < 0.06) {
                            targetVx = -direction * this.speed * (0.18 - p * 0.3);
                        } else if (p < 0.28) {
                            targetVx = direction * this.speed * (0.22 + (p - 0.06) * 2.8);
                        } else if (p < 0.76) {
                            targetVx = direction * this.speed * (0.84 + (p - 0.28) * 1.6);
                        } else {
                            targetVx = direction * this.speed * (1.60 - (p - 0.76) * 3.2);
                        }
                        this.vx = blend(this.vx, targetVx);
                    } else if (step === 4) {
                        let targetVx;
                        if (p < 0.68) {
                            const t = p / 0.68;
                            targetVx = direction * this.speed * (0.72 + t * 0.2);
                            this.vy = this.vy * 0.42 + (-15.2 + t * 6.2) * 0.58;
                        } else {
                            const t = (p - 0.68) / 0.32;
                            targetVx = direction * this.speed * (0.92 - t * 0.58);
                            this.vy = this.vy * 0.56 + (-3.8 + t * 3.6) * 0.44;
                            if (p > 0.82) this.vy = Math.min(this.vy, 0.65);
                        }
                        this.vx = blend(this.vx, targetVx);
                        this.isGrounded = false;
                    } else {
                        // 五段: 叩きつけ
                        if (p < 0.24) {
                            this.vx = blend(this.vx, direction * this.speed * 0.2);
                            this.vy = Math.min(this.vy, -2.4 + (p / 0.24) * 1.0);
                        } else if (p < 0.78) {
                            const dive = (p - 0.24) / 0.54;
                            this.vx = blend(this.vx, direction * this.speed * (0.36 + dive * 0.46));
                            this.vy = Math.max(this.vy, 9.0 + dive * 20.6);
                        } else {
                            const t = (p - 0.78) / 0.22;
                            this.vx = blend(this.vx, direction * this.speed * (0.8 - t * 0.56));
                            this.vy = Math.max(this.vy, 20.4 - t * 4.4);
                        }
                        if (this.isGrounded && p > 0.58) this.vx *= 0.5;
                    }
                } else {
                    this.vx *= 0.92;
                }
            } else {
                this.vx *= 0.92;
            }
            const isDualZ = (this._subWeaponKey === 'dual' && this._subAction === '二刀_Z');
            // 開始時に既に getSubWeaponActionDurationMs() でスケール済みのため、
            // ここでは生の時間 (deltaMs) で減算し、二重スケール（もっさり化）を防止する
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
                // 二刀流Z: projectile飛翔中も描画キーを維持
                const dualInst = this._subWeaponInstances['dual'];
                const keepForDual = this._subWeaponKey === 'dual'
                    && dualInst && (dualInst.projectiles && dualInst.projectiles.length > 0);
                // 手裏剣: projectile飛翔中は維持（update内でキーをクリアする）
                const shurikenInst = this._subWeaponInstances['shuriken'];
                const keepForShuriken = this._subWeaponKey === 'shuriken'
                    && shurikenInst && shurikenInst.projectiles && shurikenInst.projectiles.length > 0;
                // 大太刀: plantedTimer消化中（isAttacking=true）は維持（update内でキーをクリアする）
                const odachiInst2 = this._subWeaponInstances['odachi'];
                const keepForOdachi = this._subWeaponKey === 'odachi'
                    && this.hasOdachiLingeringVisuals(odachiInst2);
                const keepForThrowPose = this._subAction === 'throw' && this._shurikenVisualTimer > 0;

                if (!keepForDual && !keepForShuriken && !keepForOdachi && !keepForThrowPose) {
                    this._subAction    = null;
                    if (!this._keepSubWeaponKey) {
                        this._subWeaponKey = null;
                    }
                    this._dualZPendingSteps = null;
                    this.isAttacking   = false;
                } else {
                    // 維持する場合でも _subTimer は 0 に固定
                    this._subTimer = 0;
                }
                this._currentAttackProfile = null;
                this.attackCooldown = Math.max(this.attackCooldown, 300);
            }
        } else if (this._subWeaponKey === 'dual') {
            // subTimer=0でもprojectile残存中は描画キー保持（寿命更新はupdate()側で継続）
            const dualInst = this._subWeaponInstances['dual'];
            if (!dualInst || !Array.isArray(dualInst.projectiles) || dualInst.projectiles.length === 0) {
                this._subAction    = null;
                if (!this._keepSubWeaponKey) {
                    this._subWeaponKey = null;
                    this._dualZPendingSteps = null;
                }
            }
            this.isAttacking = false;
        } else if (this._subWeaponKey === 'odachi') {
            // subTimer=0でもplantedTimer消化中（isAttacking=true）は描画キー保持
            // （isAttacking=falseになったらupdate内でキーをクリア済み）
            const odachiInst3 = this._subWeaponInstances['odachi'];
            if (!this.hasOdachiLingeringVisuals(odachiInst3)) {
                this._subAction    = null;
                this._subWeaponKey = null;
            }
            this.isAttacking = this.hasOdachiLingeringVisuals(odachiInst3);
        } else if (this._subAction === 'throw' && this._shurikenVisualTimer > 0) {
            this.isAttacking = true;
        } else {
            this.isAttacking = false;
            // プレビューモード等のために、projectileがなくても _subWeaponKey が明示的にセットされている間はクリアしない
            if (!this._keepSubWeaponKey) {
                this._currentAttackProfile = null;
            }
        }
    }

    _fireSubWeapon(type) {
        const resolvedKey = type === 'dual_z' ? 'dual' : type;
        const subInst = this._subWeaponInstances[resolvedKey];
        if (!subInst) return;
        const enhanceTier = typeof this.getSubWeaponEnhanceTier === 'function'
            ? Math.max(0, Math.min(3, Math.floor(this.getSubWeaponEnhanceTier())))
            : 3;
        if (typeof subInst.applyEnhanceTier === 'function') {
            subInst.applyEnhanceTier(enhanceTier, this);
        } else {
            subInst.enhanceTier = enhanceTier;
        }
        const prevSubWeapon  = this.currentSubWeapon;
        const prevAttackCombo = this.attackCombo;
        this.currentSubWeapon = subInst;
        this.attackCombo      = this._comboStep;

        const useMode = type === 'dual' ? 'combined' : (type === 'dual_z' ? 'main' : undefined);

        const shurikenProjectilesBefore = (resolvedKey === 'shuriken' && subInst && Array.isArray(subInst.projectiles))
            ? subInst.projectiles.length
            : -1;

        // bomb発射前のg.bombs長さを記録
        const bombsBefore = (resolvedKey === 'bomb' && window.game && window.game.bombs)
            ? window.game.bombs.length : -1;

        const useOwner = resolvedKey === 'shuriken' ? this.getThrowOwnerState() : this;
        this._useSubWeaponAsPlayerStyle(subInst, useMode, useOwner);
        if (resolvedKey === 'odachi') {
            // 将軍はサイズが大きい分だけ跳躍力を増やし、視覚的な飛翔の高さを忍者と揃える
            this.vy = -22 * Math.sqrt(this.scaleMultiplier || 1);
        }
        if (resolvedKey === 'dual' && type === 'dual') {
            this.vx = 0;
        }

        if (resolvedKey === 'shuriken' && shurikenProjectilesBefore >= 0 && Array.isArray(subInst.projectiles)) {
            const scale = this.getThrowableVisualScale('shuriken');
            for (let pi = shurikenProjectilesBefore; pi < subInst.projectiles.length; pi++) {
                const proj = subInst.projectiles[pi];
                if (proj && Number.isFinite(proj.x) && Number.isFinite(proj.y)) {
                    const worldPoint = this.transformActorProjectilePointToWorld(proj.x, proj.y);
                    proj.x = worldPoint.x;
                    proj.y = worldPoint.y;
                    proj.prevX = worldPoint.x;
                    proj.prevY = worldPoint.y;
                }
                if (proj && Number.isFinite(proj.radius)) {
                    proj.radius = Math.round(proj.radius * scale * 10) / 10;
                }
            }
        }

        // bomb: 新しく追加されたbombに敵弾フラグとgetHitboxを付ける
        // （game.jsのupdateBombsはisEnemyProjectile===trueのbombにgetHitbox()を呼ぶため必須）
        if (resolvedKey === 'bomb' && bombsBefore >= 0 && window.game && window.game.bombs) {
            const owner = this;
            const bombScale = this.getThrowableVisualScale('bomb');
            for (let bi = bombsBefore; bi < window.game.bombs.length; bi++) {
                const b = window.game.bombs[bi];
                if (!b) continue;
                b.isEnemyProjectile = true;
                b.owner = owner;
                if (Number.isFinite(b.radius)) {
                    b.radius = Math.round(b.radius * bombScale * 10) / 10;
                }
                if (Number.isFinite(b.explosionRadius)) {
                    b.explosionRadius = Math.round(b.explosionRadius * bombScale);
                }
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

    _getSubActionDurationMs(actionName, key) {
        const weapon = key ? this._subWeaponInstances[key] : null;
        if (!weapon || !this.actor || typeof this.actor.getSubWeaponActionDurationMs !== 'function') {
            return 300;
        }
        return this.actor.getSubWeaponActionDurationMs(actionName, weapon);
    }

    _useSubWeaponAsPlayerStyle(subInst, useMode, owner = this) {
        if (!subInst || typeof subInst.use !== 'function') return;
        const prevIsEnemy = this.isEnemy;
        this.isEnemy = false;
        try {
            subInst.use(owner, useMode);
        } finally {
            this.isEnemy = prevIsEnemy;
        }
    }

    _applyDualZMotion(step) {
        const direction = this.facingRight ? 1 : -1;
        const wasGrounded = this.isGrounded;
        if (step === 1) {
            this.vx = direction * this.speed * 0.32;
            if (wasGrounded) {
                this.vy = 0;
                this.isGrounded = true;
            }
        } else if (step === 2) {
            this.vx = direction * this.speed * 0.48;
            if (wasGrounded) {
                this.vy = 0;
                this.isGrounded = true;
            } else {
                this.vy = Math.min(this.vy, -0.4);
            }
        } else if (step === 3) {
            this.vx = direction * this.speed * 0.88;
            if (wasGrounded) {
                this.vy = -0.6;
                this.isGrounded = false;
            }
        } else if (step === 4) {
            this.vx = direction * this.speed * 0.92;
            if (wasGrounded) {
                this.vy = -6.2;
                this.isGrounded = false;
            } else {
                this.vy = Math.min(this.vy, -5.1);
            }
        } else {
            this.vx = direction * this.speed * 0.22;
            this.vy = Math.min(this.vy, -1.8);
            this.isGrounded = false;
        }
    }

    getAttackHitbox() {
        if (this._attackTimer > 0 && this._currentAttackProfile && this._currentAttackProfile.comboStep) {
            const renderScale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
                ? this.scaleMultiplier
                : 1;
            const actorW = this.actorBaseWidth || Math.max(1, Math.round(this.width / renderScale));
            const actorFootGroundOffset = 0;
            const actorX = this.x + this.width * 0.5 - actorW * 0.5;
            const actorY = this.y + this.height * 0.62 - PLAYER.HEIGHT * 0.62 + actorFootGroundOffset;
            const actorBoxes = this.actor.getAttackHitbox({
                state: {
                    isAttacking: true,
                    currentAttack: this._currentAttackProfile,
                    attackTimer: this._attackTimer,
                    x: actorX,
                    y: actorY,
                    width: actorW,
                    height: PLAYER.HEIGHT,
                    facingRight: this.facingRight,
                    isCrouching: false
                }
            });
            if (actorBoxes) {
                const pivotX = actorX + actorW * 0.5;
                const pivotY = actorY + PLAYER.HEIGHT * 0.62;
                const toWorldBox = (box) => ({
                    ...box,
                    x: pivotX + (box.x - pivotX) * renderScale,
                    y: pivotY + (box.y - pivotY) * renderScale,
                    width: box.width * renderScale,
                    height: box.height * renderScale
                });
                const arr = Array.isArray(actorBoxes) ? actorBoxes : [actorBoxes];
                return arr.map(toWorldBox);
            }
        }
        if (this._attackTimer > 0) {
            const dir = this.facingRight ? 1 : -1;
            return [{
                x: this.x + (dir > 0 ? this.width * 0.4 : -this.width * 1.2),
                y: this.y + this.height * 0.1,
                width: this.width * 1.8,
                height: this.height * 0.8,
            }];
        }
        if (this._subWeaponKey) {
            const hb = this.getSubWeaponHitbox();
            if (hb) return Array.isArray(hb) ? hb : [hb];
        }
        return null;
    }

    // Enemy.render() は全敵共通の2.5Dシア変換 (ctx.transform(1,0,yawSkew,1,0,0)) を適用するが、
    // 将軍は renderBody 内で独自のパースペクティブ変換を管理するため、
    // 外部シアをスキップしてプレイヤー将軍と同一の垂直描画を行う。
    render(ctx) {
        if (!this.isAlive && !this.isDying) return;

        ctx.save();

        // 死亡演出中
        if (this.isDying) {
            const progress = this.deathTimer / this.deathDuration;
            ctx.globalAlpha = 0.7 * (1 - progress);
            this.renderAscensionEffect(ctx);
            ctx.restore();
            return;
        }

        // 被弾フラッシュ
        if (this.hitTimer > 0) {
            const hitRatio = Math.max(0, Math.min(1, this.hitTimer / 140));
            const brightness = 150 + hitRatio * 130;
            const saturation = Math.max(30, 100 - hitRatio * 60);
            ctx.filter = `brightness(${brightness}%) saturate(${saturation}%)`;
        }
        // 無敵点滅
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 70) % 2 === 0) {
            ctx.globalAlpha *= 0.75;
        }

        // ── 2.5Dシア変換をスキップし、renderBody を直接呼び出す ──
        this.renderBody(ctx);

        // 成仏エフェクト
        if (this.isDying) {
            this.renderAscensionEffect(ctx);
        }

        // HPバー（ボスは画面上に巨大ゲージがあるため非表示）

        // 飛び道具描画
        if (this.projectiles) {
            for (const p of this.projectiles) p.render(ctx);
        }

        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    renderBody(ctx) {
        const odachi = this._subWeaponInstances.odachi;
        const kusa = this._subWeaponInstances.kusarigama;
        const isLingeringSub = (this._subWeaponKey === 'odachi' && odachi && odachi.isAttacking) ||
                              (this._subWeaponKey === 'kusarigama' && kusa && kusa.isAttacking);
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
        const actorFootGroundOffset = 0;
        const actorRenderX = this.x + (this.width - actorRenderW) * 0.5;
        const actorRenderY = this.y + (this.height - actorRenderH) * 0.62 + actorFootGroundOffset;
        this.actor.x           = actorRenderX;
        this.actor.y           = actorRenderY;
        this.actor.vx          = this.vx;
        this.actor.vy          = this.vy;
        this.actor.isGrounded  = this.isGrounded;
        this.actor.isCrouching = this.isCrouching;
        this.actor.isDashing   = false;
        this.actor.motionTime  = this.motionTime;
        this.actor.width       = actorRenderW;
        this.actor.height      = actorRenderH;
        this.actor.facingRight = this.facingRight;
        
        // 共通分身のanchor計算から出るcloneDrawYを、将軍本体のactorRenderYへ一致させる。
        this.actor.groundY = this.getActorGroundYForRenderScale(renderScale, actorRenderY, actorRenderH, actorFootGroundOffset);
        // 大太刀getPoseのscale補正用：ワールド座標のgroundYと実際のscale pivot高さを渡す
        // （actor.groundYはactor座標系、_worldGroundYはワールド座標系で用途が異なる）
        this.actor._worldGroundY = this.groundY;
        this.actor._scalePivotH = actorRenderH * 0.62; // renderModelの実際のpivot = originalH * 0.62 = 37.2

        const odachiGroundRenderInst = this._subWeaponKey === 'odachi'
            ? this._subWeaponInstances.odachi
            : (this.currentSubWeapon && this.currentSubWeapon.name === '大太刀' ? this.currentSubWeapon : null);

        const dir2d = this.facingRight ? 1 : -1;
        const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
        const attackBias = this.isAttacking ? 0.013 : 0;
        const yawSkew = dir2d * (0.046 + moveBias + attackBias);
        const pivotX = this.x + this.width * 0.5;
        const pivotY = this.y + this.height * 0.62;

        const renderOpts = {
            yawSkewCancel: { pivotX, pivotY, yawSkew, type: 'enemyInverse' },
            _shogunExternalTransform: true,
            renderHeadbandTail: false,
            renderHeadband:     false,
            useLiveAccessories: false,
            headScale: SHOGUN_HEAD_SCALE,
            hipLiftPx: SHOGUN_HIP_LIFT_PX,
            armReachScale: SHOGUN_ARM_REACH_SCALE,
            crouchIntensity: 0.35, // ボスは頭身が高いので控えめにしゃがむ
            // throw時は通常のプレイヤー投擲姿勢（奥手の刀＋手前手投擲）を使う
            subWeaponAction:      this._subAction,
            forceSubWeaponRender: (this._subTimer > 0 && this._subAction != null && this._subAction !== 'throw') || (this.currentSubWeapon && (this.currentSubWeapon.name === '二刀流' || this.currentSubWeapon.name === '鎖鎌')),
            // ── 将軍専用: パーツ単位で素体を鎧・兜の見た目に差し替え ──
            drawTorsoOverride:        (ctx, p) => this._drawShogunTorso(ctx, p),
            drawTorsoOverlayOverride: (ctx, p) => this._drawShogunTorsoOverlay(ctx, p),
            drawHeadOverride:         (ctx, p) => this._drawShogunHead(ctx, p),
            drawArmOverride:          (ctx, p) => this._drawShogunArm(ctx, p),
            drawHandOverride:         (ctx, p) => this._drawShogunHand(ctx, p),
            drawLegOverride:          (ctx, p) => this._drawShogunLeg(ctx, p),
            // fadeOutTimer中はrenderSubWeaponArm内の大太刀render（isAttacking=true強制）を抑制し
            // renderBody末尾の専用フェードアウトブロックのみで描画する
            isOdachiPlantedOrFade: odachiGroundRenderInst ? (odachiGroundRenderInst.fadeOutTimer || 0) > 0 : false,
        };

        // 将軍は戦闘判定レンジを拡大しているため、
        // 描画時だけ逆補正しないと槍/大太刀の見た目が過剰に伸びる。
        // 鎖鎌は除外: renderWithShogunTransform(×2.2)内でそのまま描くと
        // chain が 340×2.2=748px になり、ヒットボックス(748px)とも一致する
        const scaledRangeBackups = [];
        if (Math.abs(renderScale - 1) > 0.001 && this._subWeaponInstances) {
            for (const [key, inst] of Object.entries(this._subWeaponInstances)) {
                if (!inst || !Number.isFinite(inst.range)) continue;
                if (key === 'kusarigama') continue; // 鎖鎌はビジュアルスケールをそのまま利用
                if (key === 'odachi') continue; // 大太刀はmaxTipY制限で地面に揃えるためrange縮小不要
                scaledRangeBackups.push([inst, inst.range]);
                inst.range = inst.range / renderScale;
            }
        }

        if (this._attackTimer > 0) {
            const comboStep = this._currentComboStep || this._comboStep || 1;
            const profile   = this._currentAttackProfile || this.actor.getComboAttackProfileByStep(comboStep);
            this.actor.isAttacking    = true;
            this.actor.attackCombo    = comboStep;
            this.actor.currentAttack  = { ...profile, comboStep };
            this.actor.attackTimer    = this._attackTimer;
            this.actor.subWeaponTimer  = 0;
            this.actor.subWeaponAction = null;
            this.actor.currentSubWeapon = null;

        } else if ((this._subTimer > 0 || isLingeringSub || this._shurikenVisualTimer > 0) && this._subAction) {
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
            const throwPoseActive = isThrowAction && (
                (this._subWeaponKey === 'bomb' && this._subTimer > 0) ||
                this._shurikenVisualTimer > 0
            );
            const displaySubTimer = throwPoseActive
                ? Math.max(1, this._subTimer, this._shurikenVisualTimer)
                : Math.max(1, this._subTimer);
            this.actor.subWeaponTimer  = throwPoseActive ? displaySubTimer : (isThrowAction ? 0 : displaySubTimer);
            this.actor.subWeaponAction = throwPoseActive ? 'throw' : (isThrowAction ? null : this._subAction);
            // throw時に手持ち忍具アイコンが残らないよう、モデル上は通常刀扱いにする
            this.actor.currentSubWeapon = isThrowAction ? null : (subInst || null);
            this.actor.throwSubWeaponInstance = isThrowAction ? (subInst || null) : null;

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
            // 鎖鎌アイドル時: actor.currentSubWeaponを維持してrenderSubWeaponArm内の判定を通す
            if (this.currentSubWeapon && this.currentSubWeapon.name === '鎖鎌') {
                this.actor.currentSubWeapon = this.currentSubWeapon;
            } else {
                this.actor.currentSubWeapon = this._subWeaponKey === 'dual'
                    ? this._subWeaponInstances['dual']
                    : null;
            }
        }

        const bodyTrailPoints = Array.isArray(this.actor.specialCloneSlashTrailPoints)
            ? this.actor.specialCloneSlashTrailPoints[0]
            : null;
        const shouldUpdateBodyTrail = this._ougiActive ||
            this._attackTimer > 0 ||
            (Array.isArray(bodyTrailPoints) && bodyTrailPoints.length > 0);
        if (shouldUpdateBodyTrail && typeof this.actor.updateSpecialCloneSlashTrails === 'function') {
            const trailDeltaMs = (typeof this._lastDeltaMs === 'number') ? this._lastDeltaMs : 16;
            this.actor.updateSpecialCloneSlashTrails(trailDeltaMs);
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


        const renderTrailWithShogunTransform = (drawFn) => {
            const pivotX = this.x + this.width * 0.5;
            const pivotY = this.y + this.height * 0.62;
            ctx.save();
            if (Math.abs(renderScale - 1) > 0.001) {
                ctx.translate(pivotX, pivotY);
                ctx.scale(renderScale, renderScale);
                ctx.translate(-pivotX, -pivotY);
            }
            drawFn();
            ctx.restore();
        };

        // コンボ斬撃トレイル（大太刀等）
        // 将軍のZコンボの軌跡は updateSpecialCloneSlashTrails(deltaMs) を通じて specialCloneSlashTrailPoints[0] に生成されます。
        const trailPoints = bodyTrailPoints;
        if (!this.hideBody && trailPoints && trailPoints.length > 0) {
            // バフによるスケール（通常時は1.0）
            const baseTrailScale = typeof this.actor.getXAttackTrailWidthScale === 'function'
                ? this.actor.getXAttackTrailWidthScale()
                : 1.0;

            const fallbackX = this.x + this.width * 0.5;
            const fallbackY = this.y + this.height * 0.62;
            const getTrailKey = (p) => Number.isFinite(p && p.trailAttackId)
                ? `attack:${p.trailAttackId}`
                : `step:${p && p.step || 0}`;
            const groupedTrails = new Map();
            const activeTrailKeys = new Set();
            for (const p of trailPoints) {
                if (!p) continue;
                const key = getTrailKey(p);
                if (!groupedTrails.has(key)) groupedTrails.set(key, []);
                groupedTrails.get(key).push(p);
                activeTrailKeys.add(key);
            }
            if (!(this._comboTrailRenderAnchors instanceof Map)) {
                this._comboTrailRenderAnchors = new Map();
            }
            for (const key of this._comboTrailRenderAnchors.keys()) {
                if (!activeTrailKeys.has(key)) this._comboTrailRenderAnchors.delete(key);
            }
            const scaleSampledTrailPoints = (points) => {
                if (!Array.isArray(points) || points.length === 0 || Math.abs(renderScale - 1) <= 0.001) {
                    return points;
                }
                const latestStep = points[points.length - 1] && points[points.length - 1].step;
                if (latestStep !== 3) return points;
                return points.map((p) => {
                    if (
                        !p ||
                        !Number.isFinite(p.x) ||
                        !Number.isFinite(p.y)
                    ) {
                        return p;
                    }
                    const originX = Number.isFinite(p.playerX) ? p.playerX : (fallbackX - actorRenderW * 0.5);
                    const originY = Number.isFinite(p.playerY) ? p.playerY : (fallbackY - PLAYER.HEIGHT * 0.62);
                    const pivotX = originX + actorRenderW * 0.5;
                    const pivotY = originY + PLAYER.HEIGHT * 0.62;
                    return {
                        ...p,
                        x: pivotX + (p.x - pivotX) * renderScale,
                        y: pivotY + (p.y - pivotY) * renderScale,
                        centerX: Number.isFinite(p.centerX)
                            ? pivotX + (p.centerX - pivotX) * renderScale
                            : p.centerX,
                        centerY: Number.isFinite(p.centerY)
                            ? pivotY + (p.centerY - pivotY) * renderScale
                            : p.centerY
                    };
                });
            };
            const alignFixedCurveToSampledTip = (points) => {
                if (!Array.isArray(points) || points.length === 0) return points;
                const newest = points[points.length - 1];
                const step = newest && newest.step;
                if (step !== 5) return points;
                if (
                    !Number.isFinite(newest.x) ||
                    !Number.isFinite(newest.y) ||
                    !Number.isFinite(newest.trailCurveStartX) ||
                    !Number.isFinite(newest.trailCurveStartY) ||
                    !Number.isFinite(newest.trailCurveControlX) ||
                    !Number.isFinite(newest.trailCurveControlY) ||
                    !Number.isFinite(newest.trailCurveEndX) ||
                    !Number.isFinite(newest.trailCurveEndY)
                ) {
                    return points;
                }
                const smooth = (v) => {
                    const t = Math.max(0, Math.min(1, v));
                    return t * t * (3 - 2 * t);
                };
                const progress = Number.isFinite(newest.progress) ? Math.max(0, Math.min(1, newest.progress)) : 1;
                let growth = 1;
                if (step === 4) {
                    if (progress <= 0.08) growth = 0;
                    else if (progress >= 0.42) growth = 1;
                    else growth = smooth((progress - 0.08) / 0.34);
                } else {
                    if (progress <= 0.15) growth = 0;
                    else if (progress >= 0.9) growth = 1;
                    else growth = (progress - 0.15) / 0.75;
                }
                if (growth <= 0.001) return points;
                const t = Math.max(0, Math.min(1, growth));
                const u = 1 - t;
                const curveTipX = u * u * newest.trailCurveStartX + 2 * u * t * newest.trailCurveControlX + t * t * newest.trailCurveEndX;
                const curveTipY = u * u * newest.trailCurveStartY + 2 * u * t * newest.trailCurveControlY + t * t * newest.trailCurveEndY;
                const dx = newest.x - curveTipX;
                const dy = newest.y - curveTipY;
                if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01)) {
                    return points;
                }
                return points.map((p) => ({
                    ...p,
                    trailCurveStartX: Number.isFinite(p.trailCurveStartX) ? p.trailCurveStartX + dx : p.trailCurveStartX,
                    trailCurveStartY: Number.isFinite(p.trailCurveStartY) ? p.trailCurveStartY + dy : p.trailCurveStartY,
                    trailCurveControlX: Number.isFinite(p.trailCurveControlX) ? p.trailCurveControlX + dx : p.trailCurveControlX,
                    trailCurveControlY: Number.isFinite(p.trailCurveControlY) ? p.trailCurveControlY + dy : p.trailCurveControlY,
                    trailCurveEndX: Number.isFinite(p.trailCurveEndX) ? p.trailCurveEndX + dx : p.trailCurveEndX,
                    trailCurveEndY: Number.isFinite(p.trailCurveEndY) ? p.trailCurveEndY + dy : p.trailCurveEndY
                }));
            };
            for (const [key, groupPoints] of groupedTrails.entries()) {
                if (!groupPoints || groupPoints.length === 0) continue;
                const anchorPoint = groupPoints[0];
                if (!this._comboTrailRenderAnchors.has(key)) {
                    const originX = Number.isFinite(anchorPoint.playerX) ? anchorPoint.playerX : (fallbackX - actorRenderW * 0.5);
                    const originY = Number.isFinite(anchorPoint.playerY) ? anchorPoint.playerY : (fallbackY - PLAYER.HEIGHT * 0.62);
                    this._comboTrailRenderAnchors.set(key, {
                        pivotX: originX + actorRenderW * 0.5,
                        pivotY: originY + PLAYER.HEIGHT * 0.62
                    });
                }
                const anchor = this._comboTrailRenderAnchors.get(key);
                const pivotX = anchor.pivotX;
                const pivotY = anchor.pivotY;
                const step = groupPoints[groupPoints.length - 1] && groupPoints[groupPoints.length - 1].step;
                const usesPerSampleScale = step === 3;
                ctx.save();
                if (!usesPerSampleScale && Math.abs(renderScale - 1) > 0.001) {
                    ctx.translate(pivotX, pivotY);
                    ctx.scale(renderScale, renderScale);
                    ctx.translate(-pivotX, -pivotY);
                }
                const renderPoints = usesPerSampleScale
                    ? scaleSampledTrailPoints(groupPoints)
                    : alignFixedCurveToSampledTip(groupPoints);
                this.actor.renderComboSlashTrail(ctx, {
                    points: renderPoints,
                    centerX: pivotX,
                    centerY: pivotY,
                    trailWidthScale: baseTrailScale,
                    physicalScale: usesPerSampleScale ? renderScale : 1,
                    boostActive: baseTrailScale > 1.01 && this._attackTimer > 0,
                    attackState: {
                        isAttacking: this.isAttacking,
                        currentAttack: this._currentAttackProfile,
                        attackTimer: this._attackTimer
                    }
                });
                ctx.restore();
            }
        }

        // ── 陣羽織（じんばおり）背面描画 ──
        if (!this.hideBody) {
            renderWithShogunTransform(() => {
                // this._drawJinbaori(...)
            });
        }

        if (odachiGroundRenderInst) {
            odachiGroundRenderInst.suppressGroundEffectsRender = true;
            // fadeout開始前のフレームでpivotとactor位置を保存（fadeout中はbosspivotが変わるため固定が必要）
            if ((odachiGroundRenderInst.fadeOutTimer || 0) <= 0) {
                odachiGroundRenderInst._lastPlantedPivotX = this.x + this.width * 0.5;
                odachiGroundRenderInst._lastPlantedPivotY = this.y + this.height * 0.62;
                odachiGroundRenderInst._lastPlantedActorX = actorRenderX;
                odachiGroundRenderInst._lastPlantedActorY = actorRenderY;
            }
        }

        // キャラ本体描画（hideBody時は hideBodyParts: true で体シルエットのみ非表示）

        this.actor.shogunYawSkew = dir2d * (0.046 + moveBias + attackBias);
        const alpha = typeof this.ghostVeilAlpha === 'number' ? this.ghostVeilAlpha : 1.0;
        this.actor.renderModel(ctx, actorRenderX, actorRenderY, this.facingRight, alpha, true, {
            ...renderOpts,
            hideBodyParts: !!this.hideBody,
        });

        // 二刀流Zコンボのトレイル（本体描画で得た刀アンカーを使って本体と同じ順で描画）
        if (typeof this.actor.updateDualBladeSlashTrails === 'function') {
            const deltaMs = (typeof this._lastDeltaMs === 'number') ? this._lastDeltaMs : 16;
            this.actor.updateDualBladeSlashTrails(deltaMs);
        }
        if (!this.hideBody && typeof this.actor.renderDualBladeSlashTrails === 'function') {
            this.renderDualBladeSlashTrailsAnchored(ctx, renderScale, actorFootGroundOffset);
        }

        // 奥義クローン位置の更新（renderBodyでactorRenderXY確定後に設定）
        if (this._ougiActive && this.actor.specialCloneSlots.length > 1 && !(this._playableOwner && !this.isEnemy)) {
            const _oSpacing  = typeof this.actor.getSpecialCloneSpacing === 'function'
                ? this.actor.getSpecialCloneSpacing()
                : (this.actor.specialCloneSpacing || 180);
            const _oCenterX  = actorRenderX + actorRenderW * 0.5;
            const _oAnchorY  = actorRenderY + PLAYER.HEIGHT * 0.62;
            this.actor.groundY = this.getActorGroundYForRenderScale(renderScale, actorRenderY, actorRenderH, actorFootGroundOffset);
            const _getCloneAnchorY = (x) => {
                const anchorY = typeof this.actor.getSpecialCloneAnchorYAtX === 'function'
                    ? this.actor.getSpecialCloneAnchorYAtX(x)
                    : (this.groundY + LANE_OFFSET - PLAYER.HEIGHT * 0.38);
                return !this.isEnemy ? anchorY + actorFootGroundOffset : anchorY;
            };
            for (let _oi = 0; _oi < this.actor.specialCloneSlots.length; _oi++) {
                const _oUnit = this.actor.specialCloneSlots[_oi];
                const _oPos  = this.actor.specialClonePositions[_oi];
                if (_oPos) {
                    _oPos.x          = _oCenterX + _oUnit * _oSpacing;
                    _oPos.y          = !this.isEnemy ? _getCloneAnchorY(_oPos.x) : _oAnchorY;
                    _oPos.facingRight = this.facingRight;
                    _oPos.prevX      = _oPos.x;
                    // Lv3+自律クローンは本体の物理状態に連動させない（飛翔モーションが伝播しないよう）
                    const _oIsAutoAi = this.actor.specialCloneAutoAiEnabled;
                    _oPos.jumping    = (!_oIsAutoAi && this.isEnemy) ? !this.isGrounded : false;
                    _oPos.cloneVy    = (!_oIsAutoAi && this.isEnemy) ? this.vy : 0;
                    _oPos.renderVx   = 0;
                }
            }
        }

        // 奥義・分身: renderSpecial を使用（忍者と同一システム）
        if (this._ougiActive) {
            const dir2d = this.facingRight ? 1 : -1;
            const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
            const attackBias = this.isAttacking ? 0.013 : 0;
            const _ougiYawSkew    = dir2d * (0.046 + moveBias + attackBias);
            const _ougiPivotY     = this.y + this.height * 0.62;
            const _cloneTransformPivotOffsetY = _ougiPivotY - actorRenderY;
            const _getCloneTransformPivotY = (cloneFootY) => {
                if (!Number.isFinite(cloneFootY)) return _ougiPivotY;
                return cloneFootY - PLAYER.HEIGHT + _cloneTransformPivotOffsetY;
            };
            this.actor.renderSpecial(ctx, {
                skipSlotIndices: [0],
                keepActorHeight: true,
                suppressMist: true,
                scaleEntity: (clonePivotX, _footY, fn) => {
                    ctx.save();
                    ctx.globalAlpha *= 0.72;
                    const clonePivotY = _getCloneTransformPivotY(_footY);
                    ctx.translate(clonePivotX, clonePivotY);
                    // 以前はここで独自に斜めパース(yawSkew)とスケール(1/0.982)をかけていたが、
                    // 現在はrenderModel内部で将軍パースが自動適用されるため、ここでは適用しない。
                    ctx.translate(-clonePivotX, -clonePivotY);
                    // 以前はここでrenderScale(2.2)をかけていたが、
                    // renderModel内部でthis.scaleMultiplier(2.2)が再度かかるため二重拡大(4.84倍)になってしまう。
                    // したがってここではスケールを適用しない。
                    fn();
                    ctx.restore();
                },
                cloneModelOptions: (pos) => {
                    const cloneFootY = typeof this.actor.getSpecialCloneFootY === 'function'
                        ? this.actor.getSpecialCloneFootY(pos.y)
                        : _ougiPivotY;
                    const clonePivotY = _getCloneTransformPivotY(cloneFootY);
                    return {
                        ...renderOpts,
                        yawSkewCancel: { pivotX: pos.x, pivotY: clonePivotY, yawSkew: _ougiYawSkew, type: 'enemyInverse' },
                        forceSubWeaponRender: false,
                        isOdachiPlantedOrFade: false,
                        renderScale: 1.0
                    };
                },
            });
        }

        if (odachiGroundRenderInst && typeof odachiGroundRenderInst.render === 'function') {
            odachiGroundRenderInst.suppressGroundEffectsRender = false;
            odachiGroundRenderInst.renderOnlyGroundEffects = true;
            ctx.save();
            if (renderScale > 1.001) {
                // X は剣と同じ pivot (bossCenter) で scale → fadeout 中の波紋X位置ずれを防ぐ。
                // Y は impactY (地面接触点) で scale → 波紋が地面から大きく外れるのを防ぐ。
                const isFadeOut = (odachiGroundRenderInst.fadeOutTimer || 0) > 0;
                const wavePivotX = (isFadeOut && Number.isFinite(odachiGroundRenderInst._lastPlantedPivotX))
                    ? odachiGroundRenderInst._lastPlantedPivotX
                    : (Number.isFinite(odachiGroundRenderInst.impactFrozen?.pivotX)
                        ? odachiGroundRenderInst.impactFrozen.pivotX
                        : (this.x + this.width * 0.5));
                const wavePivotY = Number.isFinite(odachiGroundRenderInst.impactY)
                    ? odachiGroundRenderInst.impactY
                    : (this.groundY + LANE_OFFSET);
                ctx.translate(wavePivotX, wavePivotY);
                ctx.scale(renderScale, renderScale);
                ctx.translate(-wavePivotX, -wavePivotY);
            }
            odachiGroundRenderInst.render(ctx, this);
            ctx.restore();
            odachiGroundRenderInst.renderOnlyGroundEffects = false;
        }



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

        // 大太刀フェードアウト: plantedTimer終了後のフェード
        // renderSubWeaponArm内の描画はisOdachiPlantedOrFadeで抑制済み。
        // renderWithShogunTransform(shear+scale)とyawSkewCancel(shear逆)は互いにシアが打ち消しあい
        // 結果はscale(renderScale)のみとなる。fadeout時はbossが着地してpivotYが変わるため
        // plantedTimer中に保存したpivotを使いscaleのみ適用することで位置ずれを防ぐ。
        if (odachiGroundRenderInst && (odachiGroundRenderInst.fadeOutTimer || 0) > 0
            && typeof odachiGroundRenderInst.render === 'function') {
            const fadePivotX = odachiGroundRenderInst._lastPlantedPivotX ?? (this.x + this.width * 0.5);
            const fadePivotY = odachiGroundRenderInst._lastPlantedPivotY ?? (this.y + this.height * 0.62);
            odachiGroundRenderInst.suppressGroundEffectsRender = true;
            // fadeout中はactor位置を植え込み時の位置に固定してX/Yずれを防ぐ
            const savedFadeActorX = this.actor.x;
            const savedFadeActorY = this.actor.y;
            if (odachiGroundRenderInst._lastPlantedActorX !== undefined) {
                this.actor.x = odachiGroundRenderInst._lastPlantedActorX;
                this.actor.y = odachiGroundRenderInst._lastPlantedActorY;
            }
            ctx.save();
            if (Math.abs(renderScale - 1) > 0.001) {
                ctx.translate(fadePivotX, fadePivotY);
                ctx.scale(renderScale, renderScale);
                ctx.translate(-fadePivotX, -fadePivotY);
            }
            odachiGroundRenderInst.render(ctx, this.actor);
            ctx.restore();
            this.actor.x = savedFadeActorX;
            this.actor.y = savedFadeActorY;
            odachiGroundRenderInst.suppressGroundEffectsRender = false;
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

    // ═══════════════════════════════════════════════════════
    // 将軍専用: 素体パーツを鎧・兜に差し替える描画メソッド
    // renderModel 内のフック (drawTorsoOverride / drawHeadOverride) から呼ばれる
    // ═══════════════════════════════════════════════════════

    /**
     * 胴体パーツ：黒き巨大な塊と一筋の金
     */
    _drawShogunTorso(ctx, p) {
        const { torsoShoulderX, bodyTopY, torsoHipX, hipY, dir, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, withOutline } = p;
        const cArmor = '#101014'; // 漆黒
        const cGold  = '#dcb854'; // 黄金
        const cCloth = '#202020'; // インナー

        const dx = torsoHipX - torsoShoulderX;
        const dy = hipY - bodyTopY;
        const torsoLen = Math.hypot(dx, dy) || 1;
        const ux = dx / torsoLen;
        const uy = dy / torsoLen;
        const nx = -uy;
        const ny = ux;

        // 威圧的な逆三角形の胴体
        const wF = 6.5; 
        const wB = 4.5; 
        
        // 胴周りのグレーの残骸（素体のアウトライン）は将軍では不要なので描画しない

        // 漆黒の強固な胸当て
        // nx は ~ -1 なので、前方(進行方向 dir)は -nx*dir、後方は +nx*dir となる
        ctx.fillStyle = cArmor;
        ctx.beginPath();
        // 前肩
        ctx.moveTo(torsoShoulderX - nx * wF * dir, bodyTopY - ny * wF * dir);
        // 後肩
        ctx.lineTo(torsoShoulderX + nx * wB * dir, bodyTopY + ny * wB * dir);
        // 後腰
        ctx.lineTo(torsoHipX + nx * wB * dir, hipY + ny * wB * dir);
        // 前腰
        ctx.lineTo(torsoHipX - nx * wF * dir, hipY - ny * wF * dir);
        ctx.fill();

        // 背中の鎧の出っ張り（背板）と金縁：マントなしでも甲冑感がでるように段（だん）を表現する
        const backX = (r) => (torsoShoulderX + nx * wB * dir) * (1 - r) + (torsoHipX + nx * wB * dir) * r;
        const backY = (r) => (bodyTopY + ny * wB * dir) * (1 - r) + (hipY + ny * wB * dir) * r;
        
        // 4つの段を重ねるように描画し、日本甲冑らしい段重ね（板札）の背中を表現
        for (let i = 0; i < 4; i++) {
            const startR = i * 0.25;
            const endR = (i + 1) * 0.25;
            const midR = startR + 0.125;
            
            ctx.fillStyle = '#0a0a0d';
            ctx.beginPath();
            ctx.moveTo(backX(startR), backY(startR));
            // 少し後方（+nx*dir）へ膨らませるカーブ
            ctx.quadraticCurveTo(backX(midR) + nx * dir * 3.5, backY(midR), backX(endR), backY(endR));
            ctx.lineTo(backX(endR) - nx * dir * 0.5, backY(endR));
            ctx.lineTo(backX(startR) - nx * dir * 0.5, backY(startR));
            ctx.fill();
            
            ctx.strokeStyle = '#b09240'; // 金色の縁
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(backX(startR), backY(startR));
            ctx.quadraticCurveTo(backX(midR) + nx * dir * 3.5, backY(midR), backX(endR), backY(endR));
            ctx.stroke();
        }



        // ※ 草摺（腰防具）は _drawShogunTorsoOverlay に移動済み
        //   脚の付け根を隠すため、脚描画後のオーバーレイレイヤーで描画する
    }

    /**
     * 陣羽織（じんばおり）：戦国武将が鎧の上に纏う和風の外套
     * 背中側に垂れ下がる形で描画。西洋マントにならないよう、
     * 直線的で幅広・短めの裾、家紋ラインで和の風格を出す。
     */
    _drawJinbaori(ctx, actorX, actorY, actorW, actorH, facingRight) {
        const dir = facingRight ? 1 : -1;
        const centerX = actorX + actorW * 0.5;
        // マント（陣羽織）の開始位置（低めが良かったとのことなので0.35に戻します）
        const shoulderY = actorY + actorH * 0.35; 
        // 開始位置が下がって短く見えないよう、裾を少し下(0.92)まで伸ばします
        const hemY = actorY + actorH * 0.92;

        // 陣羽織は背中側に見えるので、向きの反対方向にオフセット
        const backDir = -dir;
        // 肩の位置を胴体にぴったり沿わせる
        const shoulderBackX = centerX + backDir * actorW * 0.22;
        const shoulderFrontX = centerX + backDir * actorW * 0.04;

        // 裾は肩より広がる（台形型）
        // 布の面積が減った分、少し広がりを強調してマントらしいシルエットを維持します
        const hemBackX = shoulderBackX + backDir * actorW * 0.12;
        const hemFrontX = shoulderFrontX - backDir * actorW * 0.04;

        // ── 本体（漆黒〜深い藍色のグラデーション）──
        const grad = ctx.createLinearGradient(centerX, shoulderY, centerX, hemY);
        grad.addColorStop(0, '#0c0c12');
        grad.addColorStop(0.6, '#0e1018');
        grad.addColorStop(1, '#12141e');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(shoulderFrontX, shoulderY);
        ctx.lineTo(shoulderBackX, shoulderY - 0.5);
        // 背中の膨らみ（風をはらんだ感じ、ただし控えめ）
        ctx.quadraticCurveTo(
            hemBackX + backDir * 2, shoulderY + (hemY - shoulderY) * 0.5,
            hemBackX, hemY
        );
        // 裾の直線（和風：ケープのような丸みではなく直線的に切る）
        ctx.lineTo(hemFrontX, hemY);
        ctx.closePath();
        ctx.fill();

        // ── 裾の金縁ライン ──
        ctx.strokeStyle = '#dcb854';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hemBackX, hemY);
        ctx.lineTo(hemFrontX, hemY);
        ctx.stroke();

        // ── 背中の家紋（菱形）──
        const monX = (shoulderBackX + shoulderFrontX) * 0.5 + backDir * 1.5;
        const monY = shoulderY + (hemY - shoulderY) * 0.4;
        const monSize = 3.5;
        ctx.fillStyle = 'rgba(220, 184, 84, 0.22)';
        ctx.beginPath();
        ctx.moveTo(monX, monY - monSize);
        ctx.lineTo(monX + monSize * 0.8, monY);
        ctx.lineTo(monX, monY + monSize);
        ctx.lineTo(monX - monSize * 0.8, monY);
        ctx.closePath();
        ctx.fill();

        // ── 縫い目ライン（縦一本）──
        ctx.strokeStyle = 'rgba(220, 184, 84, 0.10)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(monX, shoulderY + 2);
        ctx.lineTo(monX + backDir * 0.3, hemY - 1.5);
        ctx.stroke();
    }

    /**
     * 胴体オーバーレイ：脚描画後に草摺（腰防具）を描画して脚の付け根を覆う
     */
    _drawShogunTorsoOverlay(ctx, p) {
        const { torsoShoulderX, bodyTopY, torsoHipX, hipY, dir } = p;
        const cArmor = '#101014';
        const cGold  = '#dcb854';

        // 胴体の法線ベクトルを再計算（_drawShogunTorsoと同じ座標系）
        const dx = torsoHipX - torsoShoulderX;
        const dy = hipY - bodyTopY;
        const torsoLen = Math.hypot(dx, dy) || 1;
        const nx = -(dy / torsoLen);
        const ny = dx / torsoLen;

        // ── 佩楯・草摺（腰から大腿部を覆う防具） ──
        const skirtLen = 13.0;
        const skirtSpread = 6.0;

        const drawKusazuriPanel = (startX, startY, endXOffset, endY, widthBack, widthFront, color, edgeColor) => {
            const bX = nx * dir;
            const bY = ny * dir;
            const fX = -nx * dir;
            const fY = -ny * dir;
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(startX + bX * widthBack, startY + bY * widthBack);
            ctx.lineTo(startX + fX * widthFront, startY + fY * widthFront);
            ctx.lineTo(startX + endXOffset + fX * (widthFront + 1), startY + endY + fY * widthFront);
            ctx.lineTo(startX + endXOffset + bX * (widthBack + 1), startY + endY + bY * widthBack);
            ctx.closePath();
            ctx.fill();

            // 裾の金縁
            ctx.strokeStyle = edgeColor;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(startX + endXOffset + fX * (widthFront + 1), startY + endY + fY * widthFront);
            ctx.lineTo(startX + endXOffset + bX * (widthBack + 1), startY + endY + bY * widthBack);
            ctx.stroke();
        };

        const baseY = hipY - 4.5;
        
        // 1. 後方の草摺（背中側・隙間を埋めるように幅広に、位置は後方(+nx*dir)へシフト）
        drawKusazuriPanel(
            torsoHipX + nx * dir * 1.5, baseY,
            nx * dir * skirtSpread * 0.4 - dir * 0.5, skirtLen,
            2.0, 2.0,
            cArmor, '#b09240'
        );

        // 2. 側面の草摺（主要パネル・分厚い）
        drawKusazuriPanel(
            torsoHipX, baseY, 
            -nx * dir * skirtSpread * 0.1, skirtLen,
            3.2, 3.2,
            '#0a0a0d', '#b09240'
        );

        // 3. 前方の草摺（手前側・バランスに合わせて、位置は前方(-nx*dir)へシフト）
        drawKusazuriPanel(
            torsoHipX - nx * dir * 1.8, baseY,
            -nx * dir * skirtSpread * 0.3 + dir * 1.0, skirtLen,
            1.5, 1.5,
            cArmor, '#b09240'
        );
    }

    /**
     * 頭部パーツ：戦国武将の兜とのっぺらぼうの顔
     * 黒ベース・兜飾り（三日月前立て）のみ金アクセント
     */
    _drawShogunHead(ctx, p) {
        const { headCenterX, headY, headRadius, dir, silhouetteColor,
                silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand } = p;
        const hx = headCenterX;
        const hy = headY;
        const hr = headRadius;

        // ── 0. 頭ベース（のっぺらぼう）──
        if (silhouetteOutlineEnabled) {
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth   = outlineExpand;
            ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = silhouetteColor;
        ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();

        // 兜としころをここで直接描画し、前面の腕(front arm)よりも奥のレイヤーになるようにする
        this._drawShogunHelmetOverlay(ctx, p);
        return true;
    }

    /**
     * しころと兜全体を最前面（腕より上）に描画するためのオーバーレイ関数
     */
    _drawShogunHelmetOverlay(ctx, p) {
        const { headCenterX, headY, headRadius, dir } = p;
        const hx = headCenterX;
        const hy = headY;
        const hr = headRadius;

        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(dir, 1);

        // ── 基準値 ──
        const helmBaseY = -hr * 0.15; // ドームを高くするので基準位置を少し戻す

        // ── 色（黒ベース） ──
        const cDome   = '#111116'; // 鉢: 黒
        const cEdge   = '#0a0a0e'; // 鉢下縁帯・眉庇
        const cShik   = '#131316'; // しころ
        const cShikLn = '#0a0a0e'; // しころ段線

        const domeW = hr * 1.1; 
        const domeH = hr * 1.1; 
        const domeTopY = helmBaseY - domeH;

        // ═════════════════════════════════
        //  0. 奥の角（画面左側の角）
        // ═════════════════════════════════
        const drawHorn = (isFar) => {
            const cGold = isFar ? '#a08832' : '#dcb854';
            // プレビュー画面のUIからの動的調整用パラメータ（通常はデフォルト値）
            const hp = window.hornParams || {
                farBaseX: -0.03, farBaseY: 0.18, farAngle: 7.00, farTipX: 0.20, farFront: 0.40, farBack: -0.14, farLength: 2.60, farRoot: 2.00,
                nearBaseX: -0.24, nearBaseY: 0.69, nearAngle: -7.00, nearTipX: 0.22, nearFront: -0.10, nearBack: 0.28, nearLength: 2.60, nearRoot: 2.00
            };
            
            // X位置を hp から取得
            const bx = isFar ? domeW * hp.farBaseX : domeW * hp.nearBaseX;
            const by = isFar ? helmBaseY - domeH * hp.farBaseY : helmBaseY - domeH * hp.nearBaseY;
            
            const hw = hr * 0.12; 
            
            ctx.fillStyle = cGold;
            ctx.beginPath();

            // 【曲線美の極致：三日月が側頭部を突き抜けるパース】
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate((isFar ? hp.farAngle : hp.nearAngle) * Math.PI / 180);
            
            if (isFar) {
                // 奥の角
                const tipX = 0 - hr * hp.farTipX;
                const tipY = 0 - hr * hp.farLength;
                ctx.moveTo(0 + hw, 0 + hw * 0.5);
                ctx.quadraticCurveTo(0 + hw + hr * hp.farFront, 0 - hr * 0.8, tipX, tipY);
                ctx.quadraticCurveTo(0 - hr * hp.farBack, 0 - hr * 0.8, 0 - hw, 0 - hw * 0.5);
                // 根元の形状を角丸に（兜の局面に滑らかにフィットさせる）
                ctx.quadraticCurveTo(0, hw * hp.farRoot, 0 + hw, 0 + hw * 0.5);
            } else {
                // 手前の角
                const tipX = 0 + hr * hp.nearTipX;
                const tipY = 0 - hr * hp.nearLength;
                ctx.moveTo(0 + hw, 0 - hw * 0.5);
                ctx.quadraticCurveTo(0 + hr * hp.nearFront, 0 - hr * 0.8, tipX, tipY);
                ctx.quadraticCurveTo(0 - hw - hr * hp.nearBack, 0 - hr * 0.8, 0 - hw, 0 + hw * 0.5);
                // 根元の形状を角丸に
                ctx.quadraticCurveTo(0, hw * hp.nearRoot, 0 + hw, 0 - hw * 0.5);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore(); // 回転・移動をリセット
        };

        // ═════════════════════════════════
        //  0. 奥の角（画面左側）
        // ═════════════════════════════════
        drawHorn(true);

        // ═════════════════════════════════
        //  1. しころ
        // ═════════════════════════════════
        const shkSteps  = 5;              
        const shkStepH  = hr * 0.32;      
        const shkSpreadBack = hr * 0.15;  
        const shkSpreadFwd  = hr * 0.02;  
        const shkFwdBase  = hr * 0.25;    
        const shkBackBase = -hr * 1.15;   
        const shkStartY   = helmBaseY - hr * 0.40;

        for (let s = shkSteps - 1; s >= 0; s--) {
            const y0  = shkStartY + shkStepH * s;
            const y1  = shkStartY + shkStepH * (s + 1);
            const xF0 = shkFwdBase  - shkSpreadFwd * s;
            const xB0 = shkBackBase - shkSpreadBack * s;
            const xF1 = shkFwdBase  - shkSpreadFwd * (s + 1);
            const xB1 = shkBackBase - shkSpreadBack * (s + 1);

            ctx.fillStyle = cShik;
            ctx.beginPath();
            ctx.moveTo(xF0, y0);
            ctx.lineTo(xB0, y0);
            ctx.lineTo(xB1, y1);
            ctx.lineTo(xF1, y1);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = cShikLn;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(xF0, y0);
            ctx.lineTo(xB0, y0);
            ctx.stroke();
        }

        // しころ最下辺
        {
            const yB  = shkStartY + shkStepH * shkSteps;
            const xFB = shkFwdBase  - shkSpreadFwd * shkSteps; 
            const xBB = shkBackBase - shkSpreadBack * shkSteps;
            ctx.strokeStyle = '#22222a'; 
            ctx.lineWidth = 1.0;         
            ctx.beginPath();
            ctx.moveTo(xFB, yB);
            ctx.lineTo(xBB, yB);
            ctx.stroke();
        }

        // ═════════════════════════════════
        //  2. 鉢（ドーム）本体 と 鳥のくちばし状のツバを一体化
        // ═════════════════════════════════
        ctx.fillStyle = cDome;
        ctx.beginPath();
        // 後頭部下からスタート
        ctx.moveTo(-domeW, helmBaseY); 
        // 頭頂部へ丸く登る
        ctx.bezierCurveTo(-domeW * 1.15, helmBaseY - domeH * 0.6, -domeW * 0.4, domeTopY, 0, domeTopY);
        
        // 頭頂部からおでこ〜くちばしの根本上部へ滑らかに降りる
        const beakRootTopX = domeW * 0.90;
        const beakRootTopY = helmBaseY - hr * 0.25;
        // しっかりとおでこを膨らませて顔面をカバーする
        ctx.bezierCurveTo(domeW * 0.6, domeTopY, domeW * 0.95, helmBaseY - domeH * 0.4, beakRootTopX, beakRootTopY);
        
        // くちばし上部エッジ（短めに、少し水平ぎみに前へ）
        const beakTipX = domeW * 1.25;
        const beakTipY = helmBaseY - hr * 0.15;
        ctx.quadraticCurveTo(domeW * 1.1, beakRootTopY - hr * 0.02, beakTipX, beakTipY);
        
        // くちばしの下部エッジ（先端から太く滑らかに兜の顔面へ戻る）
        // 戻る位置は domeW * 0.95 で、顔の輪郭線を確実に覆い隠す
        ctx.bezierCurveTo(domeW * 1.15, beakTipY + hr * 0.08, domeW * 1.05, helmBaseY, domeW * 0.95, helmBaseY);
        
        // ヘルメットの下辺（首元へ向けてまっすぐ閉じる）
        ctx.lineTo(0, helmBaseY);
        ctx.closePath();
        ctx.fill();

        // ═════════════════════════════════
        //  3. 手前の角（画面右側）
        // ═════════════════════════════════
        drawHorn(false);


        ctx.restore(); // dir/hx,hy座標系
    }


    /**
     * 腕パーツ：質実剛健の籠手
     */
    _drawShogunArm(ctx, p) {
        const { shoulderX, shoulderY, handX, handY, bendDir, bendScale, dir, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, optionsInner } = p;
        const dx = handX - shoulderX; const dy = handY - shoulderY;
        const dist = Math.hypot(dx, dy);
        const nx = -dy / dist; const ny = dx / dist;
        const closeT = Math.max(0, Math.min(1, (14.5 - dist) / 14.5));
        const bend = Math.min(2.5, dist * bendScale * (0.38 + closeT * 0.62));
        const bendSign = -bendDir;
        
        let elbowX = shoulderX + dx * 0.54;
        let elbowY = shoulderY + dy * 0.54 + 0.2;
        if (optionsInner && optionsInner.preferUpwardElbow) {
            elbowX += nx * bend * bendSign * 0.22;
            elbowY -= bend * 0.96;
        } else {
            elbowX += nx * bend * bendSign;
            elbowY += ny * bend * bendSign;
        }

        const wristToHandDist = 1.35;
        const wristX = handX - (dx / dist) * wristToHandDist;
        const wristY = handY - (dy / dist) * wristToHandDist;
        const inset = (fx, fy, tx, ty, px) => {
            const l = Math.hypot(tx-fx, ty-fy); if(l < 0.001) return {x:fx, y:fy};
            const r = Math.min(1, px/l); return {x:fx+(tx-fx)*r, y:fy+(ty-fy)*r};
        };
        const armStart = inset(shoulderX, shoulderY, elbowX, elbowY, 1.2);

        const cArmor = '#101014'; const cGold = '#dcb854'; const cCloth = '#202020';

        if (silhouetteOutlineEnabled) {
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = 5.0 + outlineExpand;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(armStart.x, armStart.y); ctx.lineTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.lineTo(handX, handY); ctx.stroke();
        }

        // ベースの下地
        ctx.strokeStyle = cCloth;
        ctx.lineWidth = 5.0;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(armStart.x, armStart.y); ctx.lineTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.stroke();

        // 前腕を覆う籠手（ポリゴンブロック）
        ctx.fillStyle = cArmor;
        ctx.beginPath();
        const hW = 3.0;
        ctx.moveTo(elbowX - nx * hW, elbowY - ny * hW);
        ctx.lineTo(elbowX + nx * hW, elbowY + ny * hW);
        ctx.lineTo(wristX + nx * (hW - 0.5), wristY + ny * (hW - 0.5));
        ctx.lineTo(wristX - nx * (hW - 0.5), wristY - ny * (hW - 0.5));
        ctx.fill();

        // 籠手の手首側に控えめな装飾帯1本
        ctx.strokeStyle = 'rgba(180, 155, 70, 0.5)';
        ctx.lineWidth = 0.8;
        {
            const t = 0.65;
            const lx = elbowX + (wristX - elbowX) * t;
            const ly = elbowY + (wristY - elbowY) * t;
            const bw = hW - 0.3;
            ctx.beginPath();
            ctx.moveTo(lx - nx * bw, ly - ny * bw);
            ctx.lineTo(lx + nx * bw, ly + ny * bw);
            ctx.stroke();
        }

        // ── 大袖（肩当て / 袖）── 腕の付け根から真下へ四角く垂れる段々の鎧
        const sodeSteps = 5;
        const sodeW = 5.0; // 一定の幅（末広がりをやめ、真っ直ぐな四角にする）
        const sodeH = 13.5; // 腕の長さに合わせて真下に長く（上に上げた分少し伸ばす）
        
        // 肩の中心から少しだけ外側・背中側へずらし、肩の上から覆い被せるように高くする
        const padPx = shoulderX - dir * 1.5;
        const padPy = shoulderY - 2.5;

        for (let s = 0; s < sodeSteps; s++) {
            const y0 = padPy + (sodeH / sodeSteps) * s;
            const y1 = padPy + (sodeH / sodeSteps) * (s + 1);
            
            // 鎧の板（しころと同じ黒）
            ctx.fillStyle = '#131316';
            ctx.beginPath();
            ctx.moveTo(padPx - sodeW, y0);
            ctx.lineTo(padPx + sodeW, y0);
            ctx.lineTo(padPx + sodeW, y1);
            ctx.lineTo(padPx - sodeW, y1);
            ctx.closePath();
            ctx.fill();
            
            // 段の下端の線
            if (s === sodeSteps - 1) {
                // 最下段のみ金の装飾線
                ctx.strokeStyle = '#dcb854';
                ctx.lineWidth = 1.5;
            } else {
                ctx.strokeStyle = '#0a0a0e';
                ctx.lineWidth = 1.0;
            }
            
            ctx.beginPath();
            ctx.moveTo(padPx - sodeW, y1);
            ctx.lineTo(padPx + sodeW, y1);
            ctx.stroke();
        }

        if (optionsInner) optionsInner.lastHandConnectFrom = { x: wristX, y: wristY };
        return true;
    }

    /**
     * 手パーツ：丸い手に小手（手甲）を被せる
     */
    _drawShogunHand(ctx, p) {
        const { xPos, yPos, radius, dir, isBackHand } = p;
        const handRad = radius * 0.95; 
        
        ctx.fillStyle = '#101014'; 
        ctx.beginPath();
        ctx.arc(xPos, yPos, handRad, 0, Math.PI * 2);
        ctx.fill();
        
        if (!isBackHand) {
            // 小手の装甲板（菱形ベースの分厚いプレート）
            ctx.fillStyle = '#b3943d';
            ctx.beginPath();
            ctx.moveTo(xPos, yPos - handRad * 0.6);
            ctx.lineTo(xPos + dir * handRad * 0.5, yPos);
            ctx.lineTo(xPos, yPos + handRad * 0.6);
            ctx.lineTo(xPos - dir * handRad * 0.5, yPos);
            ctx.fill();
        }

        return true;
    }

    /**
     * 脚パーツ：一本の金のラインが走る太い袴と臑当
     */
    _drawShogunLeg(ctx, p) {
        // ※ 脚の付け根はオーバーレイの草摺で隠れるため、ここではそのまま描画
        const { hipX, hipYLocal, kneeX, kneeY, footX, footY, isFrontLeg, dir, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand } = p;
        const thighW = isFrontLeg ? 6.0 : 5.5; // 少し太めにしてドッシリと
        const shinW  = isFrontLeg ? 5.5 : 5.0;
        const cArmor = '#101014'; const cGold = '#dcb854'; const cCloth = '#202020';

        // 足首のあたりで線を止めることで、はみ出る丸いカカト（浮遊感の原因）を消す
        const tLen = Math.hypot(footX - kneeX, footY - kneeY) || 1;
        const shorten = 1.5; // 足首より少し上で止める（大き過ぎると脛が短く見える）
        const ankleX = footX - (footX - kneeX) / tLen * shorten;
        const ankleY = footY - (footY - kneeY) / tLen * shorten;

        if (silhouetteOutlineEnabled) {
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = thighW + outlineExpand;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(hipX, hipYLocal); ctx.lineTo(kneeX, kneeY); ctx.lineTo(ankleX, ankleY); ctx.stroke();
        }

        // 袴
        ctx.strokeStyle = cCloth;
        ctx.lineWidth = thighW;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(hipX, hipYLocal); ctx.lineTo(kneeX, kneeY); ctx.stroke();
        ctx.lineWidth = shinW;
        ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.stroke();
        ctx.lineTo(ankleX, ankleY); ctx.stroke();

        // 臑当（脛を覆う装甲ブロック）
        const dxS = ankleX - kneeX; const dyS = ankleY - kneeY;
        const dist = Math.hypot(dxS, dyS) || 1;
        const sNX = -dyS / dist; const sNY = dxS / dist;
        
        ctx.fillStyle = cArmor;
        ctx.beginPath();
        const hw = shinW * 0.6;
        ctx.moveTo(kneeX - sNX * hw, kneeY - sNY * hw);
        ctx.lineTo(kneeX + sNX * hw, kneeY + sNY * hw);
        ctx.lineTo(ankleX + sNX * hw, ankleY + sNY * hw);
        ctx.lineTo(ankleX - sNX * hw, ankleY - sNY * hw);
        ctx.fill();

        // 膝当て
        ctx.beginPath();
        ctx.moveTo(kneeX - sNX * hw, kneeY - sNY * hw);
        ctx.lineTo(kneeX + sNX * (hw + 1.5), kneeY + sNY * (hw + 1.5));
        ctx.lineTo(kneeX - dxS * 0.2 + sNX * hw, kneeY - dyS * 0.2 + sNY * hw);
        ctx.fill();

        // 臑当の中央に控えめな装飾帯1本
        ctx.strokeStyle = 'rgba(180, 155, 70, 0.45)';
        ctx.lineWidth = 0.8;
        {
            const t = 0.45;
            const lx = kneeX + dxS * t;
            const ly = kneeY + dyS * t;
            const bw = hw - 0.2;
            ctx.beginPath();
            ctx.moveTo(lx - sNX * bw, ly - sNY * bw);
            ctx.lineTo(lx + sNX * bw, ly + sNY * bw);
            ctx.stroke();
        }

        // ── 靴（沓：くつ）と足袋の装飾 ──
        // 足首の線（ankleX, ankleY）の下に、自然な丸みと平らな底を両立させた沓を描く
        const bootW = isFrontLeg ? 3.5 : 3.0; // 足の前後幅
        const bootH = 2.0;                    // 足の高さ
        const bootCX = footX + dir * 0.8;
        const bY = footY + 1.8;               // 接地する底面のY
        
        ctx.fillStyle = '#0a0a0e';
        ctx.beginPath();
        // 上半分はきれいな楕円（足の甲・かかと）
        ctx.ellipse(bootCX, bY - bootH, bootW, bootH, 0, Math.PI, Math.PI * 2);
        // 下半分は底面にむけてストンと落ち、平らにする
        ctx.lineTo(bootCX + bootW, bY);
        ctx.lineTo(bootCX - bootW, bY);
        ctx.closePath();
        ctx.fill();

        // つま先部分の金の切り返し（立体装飾）
        // 靴の丸みに合わせてオーバルを描くことでレゴブロック感を無くす
        ctx.fillStyle = '#b3943d';
        ctx.beginPath();
        ctx.ellipse(bootCX + dir * bootW * 0.5, bY - bootH * 0.4, bootW * 0.5, bootH * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // 塗りだけでボーダーをなくす

        return true;
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
