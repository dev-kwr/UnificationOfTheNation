// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { CANVAS_WIDTH, LANE_OFFSET, PLAYER, GRAVITY, GAME_STATE } from './constants.js';
import { Enemy } from './enemy.js';
import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { Player } from './player.js';
import {
    applyNormalComboActiveMotion,
    applyNormalComboStartMotion,
    freezeNormalComboFinisherTrailCurve,
    prepareNormalComboFinisherProfile
} from './normalComboMotion.js';
import {
    SHOGUN_ACTOR_BASE_HEIGHT,
    SHOGUN_ACTOR_BASE_WIDTH,
    SHOGUN_ARM_REACH_SCALE,
    SHOGUN_CROUCH_INTENSITY,
    SHOGUN_HEAD_SCALE,
    SHOGUN_HIP_LIFT_PX,
    SHOGUN_SCALE
} from './shogunConstants.js';


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
        if (!shouldRemove && !this.isEntering && this.isAlive && !this.isDying && !this.previewMode && !this._previewFreeMovement) {
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
        const playerCenterX = player.x + player.getWorldWidth() / 2;
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

        // ─── 1b. 接地ショック（足元から横へ走る地面の衝撃。死が大地へ伝わる接地感）───
        {
            const footY = this.y + this.height;
            const groundP = Math.min(1, p / 0.5); // 前半で走り切る
            if (groundP > 0.001 && groundP < 1) {
                const gr = groundP * 210;
                const gAlpha = Math.pow(1 - groundP, 1.4) * 0.5;
                ctx.strokeStyle = `rgba(255, 180, 70, ${gAlpha.toFixed(3)})`;
                ctx.lineWidth = Math.max(1, 6 * (1 - groundP));
                ctx.beginPath();
                ctx.ellipse(cx, footY, gr, gr * 0.26, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = `rgba(255, 240, 180, ${(gAlpha * 0.7).toFixed(3)})`;
                ctx.lineWidth = Math.max(0.8, 3 * (1 - groundP));
                ctx.beginPath();
                ctx.ellipse(cx, footY, gr * 0.78, gr * 0.78 * 0.26, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

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
                    if (player && !player.isInvincible && player.getWorldWidth() && player.getWorldHeight()) {
                        const hb = this.getHitbox();
                        const px = player.x;
                        const py = player.y;
                        const pw = player.getWorldWidth();
                        const ph = player.getWorldHeight();
                        
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

const SHOGUN_BOSS_WEAPON_NAMES = ['手裏剣', '火薬玉', '大槍', '二刀流', '鎖鎌', '大太刀'];

function getWorldWidth(entity) {
    return typeof entity?.getWorldWidth === 'function' ? entity.getWorldWidth() : (entity?.width || 0);
}

function getWorldHeight(entity) {
    return typeof entity?.getWorldHeight === 'function' ? entity.getWorldHeight() : (entity?.height || 0);
}

function getWeaponByName(owner, weaponName) {
    if (!owner || !Array.isArray(owner.subWeapons)) return null;
    return owner.subWeapons.find(weapon => weapon && weapon.name === weaponName) || null;
}

function setCurrentBossWeapon(owner, weaponName) {
    const weapon = getWeaponByName(owner, weaponName);
    if (!weapon) return null;
    owner.currentSubWeapon = weapon;
    owner.subWeaponIndex = owner.subWeapons.indexOf(weapon);
    return weapon;
}

function hasLiveWeaponPayload(weapon) {
    if (!weapon) return false;
    const hasProjectiles = (Array.isArray(weapon.projectiles) && weapon.projectiles.length > 0) ||
        (Array.isArray(weapon.cloneProjectiles) && weapon.cloneProjectiles.length > 0);
    const hasLingeringOdachi = weapon.name === '大太刀' && (
        (weapon.plantedTimer || 0) > 0 ||
        (weapon.fadeOutTimer || 0) > 0 ||
        (Array.isArray(weapon.groundWaves) && weapon.groundWaves.length > 0) ||
        (Array.isArray(weapon.impactDebris) && weapon.impactDebris.length > 0)
    );
    return hasProjectiles || hasLingeringOdachi || !!weapon.isAttacking;
}

function collectWeaponHitboxes(owner, weapon) {
    if (!owner || !weapon || typeof weapon.getHitbox !== 'function') return [];
    if (weapon !== owner.currentSubWeapon && !hasLiveWeaponPayload(weapon)) return [];
    const hitbox = weapon.getHitbox(owner);
    if (!hitbox) return [];
    return Array.isArray(hitbox) ? hitbox : [hitbox];
}

function markEnemyBombs(owner, startIndex) {
    const bombs = typeof window !== 'undefined' && window.game && Array.isArray(window.game.bombs)
        ? window.game.bombs
        : null;
    if (!bombs || startIndex < 0) return;
    const bombScale = Math.max(1, Math.min(1.35, 1 + ((owner.scaleMultiplier || 1) - 1) * 0.28));
    for (let i = startIndex; i < bombs.length; i++) {
        const bomb = bombs[i];
        if (!bomb) continue;
        bomb.isEnemyProjectile = true;
        bomb.owner = owner;
        if (Number.isFinite(bomb.radius)) {
            bomb.radius = Math.round(bomb.radius * bombScale * 10) / 10;
        }
        if (Number.isFinite(bomb.explosionRadius)) {
            bomb.explosionRadius = Math.round(bomb.explosionRadius * bombScale);
        }
        if (typeof bomb.getHitbox !== 'function') {
            bomb.getHitbox = function() {
                const radius = this.isExploding ? this.explosionRadius : this.radius;
                return {
                    x: this.x - radius,
                    y: this.y - radius,
                    width: radius * 2,
                    height: radius * 2
                };
            };
        }
    }
}


function startBossSubWeapon(owner, weaponName, mode = null) {
    const weapon = setCurrentBossWeapon(owner, weaponName);
    if (!weapon) return false;
    if (typeof weapon.canUse === 'function' && !weapon.canUse()) return false;

    const bombs = typeof window !== 'undefined' && window.game && Array.isArray(window.game.bombs)
        ? window.game.bombs
        : null;
    const bombsBefore = bombs ? bombs.length : -1;

    if (weapon.name === '二刀流') {
        const useMode = mode || 'combined';
        weapon.use(owner, useMode);
        const actionName = useMode === 'main' ? '二刀_Z' : '二刀_合体';
        owner.subWeaponTimer = owner.getSubWeaponActionDurationMs(actionName, weapon);
        owner.subWeaponAction = actionName;
        owner.subWeaponCrouchLock = false;
        owner.vx = useMode === 'combined' ? 0 : owner.vx;
    } else {
        owner.useSubWeapon();
        const isThrow = weapon.name === '火薬玉' || weapon.name === '手裏剣';
        owner.subWeaponTimer = owner.getSubWeaponActionDurationMs(isThrow ? 'throw' : weapon.name, weapon);
        owner.subWeaponAction = isThrow ? 'throw' : weapon.name;
    }

    if (weapon.name === '火薬玉') {
        markEnemyBombs(owner, bombsBefore);
    }

    owner.attackCooldown = Math.max(owner.attackCooldown || 0, 400);
    owner._lastAttackType = weapon.name;
    return true;
}

function startShogunBossPlayerAttack(owner, target) {
    const selfCX = owner.getWorldCenterX();
    const targetCX = target ? target.x + getWorldWidth(target) * 0.5 : selfCX;
    const dist = Math.abs(targetCX - selfCX);
    const pickFrom = (choices) => {
        const filtered = choices.filter(choice => choice !== owner._lastAttackType);
        const pool = filtered.length > 0 ? filtered : choices;
        return pool[Math.floor(Math.random() * pool.length)];
    };

    let action;
    if (dist >= 900) {
        action = '大槍';
    } else if (dist > 300) {
        action = pickFrom(['手裏剣', '二刀流_合体', '鎖鎌']);
    } else if (dist > 150) {
        action = pickFrom(['火薬玉', '大太刀']);
    } else if (owner._lastAttackType === '通常コンボ') {
        action = '二刀流_Z';
    } else if (owner._lastAttackType === '二刀流_Z') {
        action = '通常コンボ';
    } else {
        action = Math.random() < 0.5 ? '通常コンボ' : '二刀流_Z';
    }

    owner.attackFacingRight = owner.facingRight;
    if (action === '通常コンボ') {
        owner.currentSubWeapon = null;
        owner.attack();
        owner._bossWantsCombo = true;
        owner._lastAttackType = action;
        return;
    }
    if (action === '二刀流_Z') {
        if (startBossSubWeapon(owner, '二刀流', 'main')) {
            owner._bossDualChainRemaining = 4;
            owner._lastAttackType = action;
        }
        return;
    }
    if (action === '二刀流_合体') {
        startBossSubWeapon(owner, '二刀流', 'combined');
        owner._lastAttackType = action;
        return;
    }
    startBossSubWeapon(owner, action);
}

function updateShogunBossPlayerAI(deltaTime, target) {
    if (!target || this.aiDisabled) return;
    const scrollX = window.game ? window.game.scrollX : 0;
    const screenRight = scrollX + CANVAS_WIDTH;
    const selfCX = this.getWorldCenterX();
    const targetCX = target.x + getWorldWidth(target) * 0.5;
    const diffX = targetCX - selfCX;
    const absX = Math.abs(diffX);
    const dirToTarget = diffX >= 0 ? 1 : -1;

    if (!this.isAttacking && this.hitTimer <= 0 && absX > 16) {
        this.facingRight = dirToTarget > 0;
    }

    if (this._bossWantsCombo && this.isAttacking && this.currentAttack) {
        const maxStep = this.getNormalComboMax();
        if ((this.currentAttack.comboStep || 0) < maxStep) {
            this.bufferNextAttack();
        } else if (this.attackTimer <= 0) {
            this._bossWantsCombo = false;
        }
    }

    if (
        this._bossDualChainRemaining > 0 &&
        this.currentSubWeapon &&
        this.currentSubWeapon.name === '二刀流' &&
        this.subWeaponAction === '二刀_Z'
    ) {
        if (this.isDualBladeNextSwingReady()) {
            this.attack({ fromBuffer: true });
            this._bossDualChainRemaining--;
        }
        return;
    }

    if (this.x > screenRight - 16) {
        this.facingRight = false;
        this.applyDesiredVx(-Math.max(2.1, this.speed * 1.22), 0.58);
        return;
    }

    if (
        !this.isAttacking &&
        this.subWeaponTimer <= 0 &&
        this.evasionCooldownMs <= 0 &&
        absX <= this.attackRange * 1.55 &&
        (target.isAttacking || (target.subWeaponTimer || 0) > 0) &&
        Math.random() < 1.25 * deltaTime
    ) {
        this.startEvasionManeuver(dirToTarget, absX);
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

    if (this.isAttacking || this.subWeaponTimer > 0) {
        if (typeof this.attackFacingRight === 'boolean') this.facingRight = this.attackFacingRight;
        if (Math.abs(this.vx) < this.speed * 1.8) this.applyDesiredVx(0, 0.34);
        return;
    }

    if (this.attackCooldown <= 0) {
        startShogunBossPlayerAttack(this, target);
        return;
    }

    let desiredVX = 0;
    if (absX > 300) {
        const feintContrib = this.feintDir * dirToTarget > 0
            ? this.feintDir * this.speed * 0.35
            : this.feintDir * this.speed * 0.10;
        desiredVX = feintContrib + dirToTarget * this.speed * 0.28;
    } else if (absX > this.attackRange * 1.05) {
        desiredVX = this.speed * 1.14 * dirToTarget;
    } else if (absX > this.attackRange * 0.55) {
        desiredVX = this.speed * 0.92 * dirToTarget;
    }
    if (absX <= this.attackRange * 2.0) {
        const nearFeint = this.feintDir * dirToTarget > 0
            ? this.feintDir * this.speed * 0.44
            : this.feintDir * this.speed * 0.12;
        desiredVX += nearFeint;
    }
    desiredVX = Math.max(-this.speed * 1.42, Math.min(this.speed * 1.42, desiredVX));
    this.applyDesiredVx(desiredVX, 0.46);
    if (absX > this.attackRange * 1.08 && absX <= 300) {
        this.tryJump(0.022, -15, 400);
    }
}

function createShogunBossPlayer(x, _y, _type, groundY) {
    const boss = new Player(x, groundY + LANE_OFFSET - SHOGUN_ACTOR_BASE_HEIGHT * SHOGUN_SCALE, groundY);
    const playerUpdate = boss.update.bind(boss);
    const playerRender = boss.render.bind(boss);
    const playerTakeDamage = boss.takeDamage.bind(boss);
    const playerGetAttackHitbox = boss.getAttackHitbox.bind(boss);

    boss.type = 'boss';
    boss.bossName = '将軍';
    boss.characterType = 'shogun';
    boss.scaleMultiplier = SHOGUN_SCALE;
    boss.width = SHOGUN_ACTOR_BASE_WIDTH;
    boss.height = SHOGUN_ACTOR_BASE_HEIGHT;
    boss._nativeShogun = true;
    boss.isEnemy = true;
    boss.isAlive = true;
    boss.isDying = false;
    boss.deathTimer = 0;
    boss.deathDuration = 1250;
    boss.hitTimer = 0;
    boss.aiDisabled = false;
    boss.brain = {
        kind: 'ai',
        tick(self, deltaTime, ctx) {
            if (self && typeof self.updateAI === 'function') {
                self.updateAI(deltaTime, ctx && ctx.player);
            }
        }
    };
    boss.hp = 4500;
    boss.maxHp = 4500;
    boss.damage = 6;
    boss.incomingDamageScale = 0.55;
    boss.attackRange = Math.round(120 * boss.scaleMultiplier);
    boss.speed = PLAYER.SPEED * (boss.getWorldHeight() / PLAYER.HEIGHT);
    boss._baseSpeed = boss.speed;
    boss.speedVarianceRange = 0;
    boss.speedVarianceBias = 0;
    boss.movementTempo = 1;
    boss.expReward = 300;
    boss.moneyReward = 200;
    boss.specialGaugeReward = 100;
    boss.progression = { normalCombo: 3, subWeapon: 3, specialClone: 0 };
    boss.subWeapons = SHOGUN_BOSS_WEAPON_NAMES.map(name => createSubWeapon(name)).filter(Boolean);
    boss.unlockedWeapons = SHOGUN_BOSS_WEAPON_NAMES.slice();
    boss.currentSubWeapon = getWeaponByName(boss, '手裏剣');
    boss.subWeaponIndex = 0;
    boss._shogunWeaponsScaled = false;
    if (typeof boss.refreshSubWeaponScaling === 'function') boss.refreshSubWeaponScaling();
    if (typeof boss._applyShogunSubWeaponScale === 'function') boss._applyShogunSubWeaponScale();

    const difficulty = window.game ? window.game.difficulty : null;
    const damageMult = Number.isFinite(difficulty?.damageMult) ? difficulty.damageMult : 1.0;
    const hpMult = Number.isFinite(difficulty?.hpMult) ? difficulty.hpMult : 1.0;
    const bossDamageScaleByDifficulty = { easy: 0.70, normal: 1.00, hard: 1.45 };
    const bossDamageScale = bossDamageScaleByDifficulty[difficulty?.id] || bossDamageScaleByDifficulty.normal;
    boss.damage = Math.max(1, Math.round(boss.damage * damageMult * bossDamageScale));
    boss.maxHp = Math.max(1, Math.floor(boss.maxHp * hpMult));
    boss.hp = boss.maxHp;

    boss.applyDesiredVx = function(targetVx, blend = 1) {
        const t = Math.max(0, Math.min(1, Number.isFinite(blend) ? blend : 1));
        this.vx += (targetVx - this.vx) * t;
    };
    boss.startEvasionManeuver = function(dirToTarget, absX) {
        const awayDir = -dirToTarget;
        this.evasionDir = Math.random() < 0.22 ? -awayDir : awayDir;
        this.evasionTimerMs = 220 + Math.min(190, absX * 0.42);
        this.evasionCooldownMs = 380 + Math.random() * 300;
        this.evasionJumped = false;
    };
    boss.tryJump = function(chance, force, cooldown) {
        if (!this.isGrounded || (this.jumpCooldown || 0) > 0) return false;
        if (Math.random() >= chance) return false;
        this.vy = force;
        this.isGrounded = false;
        this.jumpCount = Math.max(this.jumpCount || 0, 1);
        this.jumpCooldown = cooldown;
        return true;
    };
    boss.updateAI = updateShogunBossPlayerAI;
    boss.handleInput = function() {
        if (this.brain && this.brain.kind === 'ai' && typeof this.brain.tick === 'function') {
            this.brain.tick(this, this._aiDeltaTime || 0, { player: this.targetPlayer || null });
        }
    };
    boss.getSubWeaponHitbox = function() {
        const boxes = [];
        for (const weapon of this.subWeapons || []) {
            boxes.push(...collectWeaponHitboxes(this, weapon));
        }
        return boxes.length > 0 ? boxes : null;
    };
    boss.getAttackHitbox = function(options = {}) {
        const boxes = [];
        const base = playerGetAttackHitbox(options);
        if (base) boxes.push(...(Array.isArray(base) ? base : [base]));
        const sub = this.getSubWeaponHitbox();
        if (sub) boxes.push(...(Array.isArray(sub) ? sub : [sub]));
        return boxes.length > 0 ? boxes : null;
    };
    boss.takeDamage = function(damage, player, attackData = null) {
        if (!this.isAlive || this.isDying) return null;
        if (this.invincibleTimer > 0) return null;
        const source = attackData && attackData.source ? attackData.source : '';
        const sourceScale = source === 'special_shadow' ? 0.72 : 1.0;
        const scaledDamage = Math.max(
            1,
            Math.round(damage * sourceScale * Math.max(0.2, this.incomingDamageScale || 1))
        );
        const sourceX = player && typeof player.getWorldCenterX === 'function'
            ? player.getWorldCenterX()
            : (player ? player.x + getWorldWidth(player) * 0.5 : null);
        const killed = playerTakeDamage(scaledDamage, {
            sourceX,
            knockbackX: attackData && Number.isFinite(attackData.knockbackX) ? attackData.knockbackX : 5,
            knockbackY: attackData && Number.isFinite(attackData.knockbackY) ? attackData.knockbackY : -3,
            invincibleMs: attackData && attackData.isLaunch ? 120 : 80,
            flashMs: 140,
            disableHitFeedback: true
        });
        this.hitTimer = 140;
        if (attackData && Number.isFinite(attackData.slowDurationMs) && attackData.slowDurationMs > 0) {
            this.slowMultiplier = Math.min(this.slowMultiplier || 1, attackData.slowMultiplier || 0.7);
            this.slowTimer = Math.max(this.slowTimer || 0, attackData.slowDurationMs);
        }
        if (killed) {
            this.hp = 0;
            this.isDying = true;
            this.deathTimer = 0;
            this.isAlive = true;
            return true;
        }
        return false;
    };
    boss.render = function(ctx) {
        if (!this.isAlive && !this.isDying) return;
        ctx.save();
        if (this.isDying) {
            const progress = Math.max(0, Math.min(1, this.deathTimer / Math.max(1, this.deathDuration)));
            ctx.globalAlpha *= 0.7 * (1 - progress);
        }
        if (this.hitTimer > 0) {
            const hitRatio = Math.max(0, Math.min(1, this.hitTimer / 140));
            const brightness = 150 + hitRatio * 130;
            const saturation = Math.max(30, 100 - hitRatio * 60);
            ctx.filter = `brightness(${brightness}%) saturate(${saturation}%)`;
        }
        playerRender(ctx, { skipGlow: true });
        for (const weapon of this.subWeapons || []) {
            if (!weapon || typeof weapon.render !== 'function') continue;
            const hasProjectiles = Array.isArray(weapon.projectiles) && weapon.projectiles.length > 0;
            const shouldRenderCurrentProjectile = weapon.name === '手裏剣';
            if (hasProjectiles && (weapon !== this.currentSubWeapon || shouldRenderCurrentProjectile)) {
                weapon.render(ctx, this);
            }
        }
        ctx.restore();
        ctx.filter = 'none';
    };
    boss.update = function(deltaTime, targetPlayer) {
        const deltaMs = deltaTime * 1000;
        this.targetPlayer = targetPlayer || null;
        if (this.isDying) {
            this.deathTimer += deltaMs;
            if (this.deathTimer >= this.deathDuration) {
                this.isDying = false;
                this.isAlive = false;
                return true;
            }
            return false;
        }
        if (!this.isAlive) return true;
        if (this.hitTimer > 0) this.hitTimer = Math.max(0, this.hitTimer - deltaMs);
        if (this.slowTimer > 0) {
            this.slowTimer = Math.max(0, this.slowTimer - deltaMs);
            if (this.slowTimer <= 0) this.slowMultiplier = 1;
        }
        if (this.evasionCooldownMs > 0) this.evasionCooldownMs = Math.max(0, this.evasionCooldownMs - deltaMs);
        if (this.evasionTimerMs > 0) this.evasionTimerMs = Math.max(0, this.evasionTimerMs - deltaMs);
        if (this.jumpCooldown > 0) this.jumpCooldown = Math.max(0, this.jumpCooldown - deltaMs);
        this.feintTimerMs -= deltaMs;
        if (this.feintTimerMs <= 0) {
            this.feintDir *= -1;
            this.feintTimerMs = 180 + Math.random() * 260;
        }

        this._aiDeltaTime = deltaTime;
        playerUpdate(deltaTime, [], targetPlayer ? [targetPlayer] : []);
        this._aiDeltaTime = 0;

        for (const weapon of this.subWeapons || []) {
            if (!weapon || weapon === this.currentSubWeapon || typeof weapon.update !== 'function') continue;
            if (hasLiveWeaponPayload(weapon)) {
                weapon.update(deltaTime, targetPlayer ? [targetPlayer] : []);
            }
        }

        if (!this.isEntering && !this.previewMode && !this._previewFreeMovement) {
            const scrollX = window.game ? window.game.scrollX : 0;
            const minX = scrollX;
            const maxX = scrollX + CANVAS_WIDTH - this.getWorldWidth();
            if (this.x < minX) {
                this.x = minX;
                if (this.vx < 0) this.vx = 0;
            } else if (this.x > maxX) {
                this.x = maxX;
                if (this.vx > 0) this.vx = 0;
            }
        }
        return false;
    };

    boss.facingRight = false;
    boss.attackFacingRight = false;
    boss.evasionCooldownMs = 0;
    boss.evasionTimerMs = 0;
    boss.evasionDir = 0;
    boss.evasionJumped = false;
    boss.feintTimerMs = 220 + Math.random() * 240;
    boss.feintDir = Math.random() < 0.5 ? -1 : 1;
    return boss;
}

// ボスファクトリー
export function createBoss(stageNumber, x, y, groundY) {
    switch (stageNumber) {
        case 1: return new KayakudamaTaisho(x, y, 'boss', groundY);
        case 2: return new YariTaisho(x, y, 'boss', groundY);
        case 3: return new NitoryuKengo(x, y, 'boss', groundY);
        case 4: return new KusarigamaAssassin(x, y, 'boss', groundY);
        case 5: return new OdachiBusho(x, y, 'boss', groundY);
        case 6: return createShogunBossPlayer(x, y, 'boss', groundY);
        default: return new KayakudamaTaisho(x, y, 'boss', groundY);
    }
}
