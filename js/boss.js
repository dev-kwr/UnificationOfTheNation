// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { CANVAS_WIDTH, LANE_OFFSET, PLAYER, GRAVITY, GAME_STATE } from './constants.js?v=screen-safe-20260815g';
import { Enemy } from './enemy.js?v=screen-safe-20260815g';
import { createSubWeapon } from './weapon.js?v=screen-safe-20260815g';
import { audio } from './audio.js?v=screen-safe-20260815g';
import { Player } from './player.js?v=screen-safe-20260815g';
import {
    applyNormalComboActiveMotion,
    applyNormalComboStartMotion,
    freezeNormalComboFinisherTrailCurve,
    prepareNormalComboFinisherProfile
} from './normalComboMotion.js?v=screen-safe-20260815g';
import {
    SHOGUN_ACTOR_BASE_HEIGHT,
    SHOGUN_ACTOR_BASE_WIDTH,
    SHOGUN_ARM_REACH_SCALE,
    SHOGUN_CROUCH_INTENSITY,
    SHOGUN_HEAD_SCALE,
    SHOGUN_HIP_LIFT_PX,
    SHOGUN_SCALE
} from './shogunConstants.js?v=screen-safe-20260815g';
import {
    BOSS_DESIGNS,
    renderBossActor,
    dualBladeStance,
    drawDualKatana,
    bombStance,
    drawCarriedBomb,
    spearStance,
    kusarigamaStance,
    drawCarriedKusarigama,
    odachiStance
} from './bossRenderer.js?v=screen-safe-20260815g';

// weaponReplica の攻撃進行度(0..1)。体の所作を実体のタイムラインへ同期させる。
function replicaProgress(replica) {
    if (!replica || !replica.isAttacking) return undefined;
    const dur = replica.attackDuration || replica.totalDuration;
    if (!Number.isFinite(dur) || dur <= 0) return undefined;
    return Math.max(0, Math.min(1, 1 - ((replica.attackTimer || 0) / dur)));
}


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
        // --- 立ち回り(連打をやめて「読み合い」に見せるための状態) ---
        this.attackStreak = 0;        // 仕切り直しを挟まずに続けた攻撃回数
        this.poiseTimerMs = 0;        // 様子見(攻撃を控えて間合いを計る)
        this.poiseKind = 'watch';     // 'watch'(その場で見る) / 'space'(下がる)
        this.spacingCooldownMs = 0;   // 仕切り直しの再発火待ち

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
        if (this.poiseTimerMs > 0) this.poiseTimerMs = Math.max(0, this.poiseTimerMs - deltaMs);
        if (this.spacingCooldownMs > 0) this.spacingCooldownMs = Math.max(0, this.spacingCooldownMs - deltaMs);
        // 忍具モーションの残時間。Player.update と違いボスは誰も減らしていなかったため、
        // 大槍の getThrustState が playerPoseActive のまま progress=0 に張り付き、
        // 突きが一切伸び縮みしていなかった(=「槍を掴めていない」幽霊のような絵)。
        if (this.subWeaponTimer > 0) {
            this.subWeaponTimer = Math.max(0, this.subWeaponTimer - deltaMs);
            if (this.subWeaponTimer === 0) this.subWeaponAction = null;
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

        // 攻めっ気(0=待ち / 1=詰め)。得物の性格ごとにボス側で宣言する
        const agg = Number.isFinite(this.aggression) ? this.aggression : 0.5;

        let desiredVX = 0;
        if (absX > this.attackRange * 1.05) {
            desiredVX = this.speed * (1.06 + agg * 0.22) * dirToPlayer;
        } else if (absX > this.attackRange * 0.55) {
            desiredVX = this.speed * (0.80 + agg * 0.26) * dirToPlayer;
        }
        // 揺さぶりの横歩き。攻めっ気の強いボスほど小さくする
        //(そうしないと「間合いの外を意味なく歩き回っている」ようにしか見えない)
        if (absX <= this.attackRange * 2.0) {
            desiredVX += this.feintDir * this.speed * 0.44 * (1 - agg);
        }
        desiredVX = Math.max(-this.speed * 1.42, Math.min(this.speed * 1.42, desiredVX));
        this.applyDesiredVx(desiredVX, 0.46);

        // --- 様子見/仕切り直し中は攻撃せず、間合いだけ動かす ---
        if (this.poiseTimerMs > 0) {
            const wantX = this.poiseKind === 'space' ? -dirToPlayer * this.speed * 0.95  // 離れて仕切り直す
                        : this.poiseKind === 'close' ?  dirToPlayer * this.speed * 1.30  // 一気に踏み込む
                        :                               this.feintDir * this.speed * 0.30; // 揺さぶりながら見る
            this.applyDesiredVx(wantX, 0.5);
            return;
        }

        if (this.attackCooldown <= 0 && absX <= this.attackRange + 104) {
            // プレイヤーの隙(攻撃硬直・忍具モーション中)は迷わず差し込む
            const punish = !!(player.isAttacking || (player.subWeaponTimer || 0) > 0);
            // 近すぎ/遠すぎは一度間合いを直す
            const tooClose = absX < this.attackRange * 0.42;
            const tooFar   = absX > this.attackRange * 0.96;
            const maxStreak = 2 + Math.round(agg * 2);   // 攻めっ気ぶん連撃を許す

            if (!punish && this.spacingCooldownMs <= 0 &&
                (this.attackStreak >= maxStreak || ((tooClose || tooFar) && Math.random() < 0.6))) {
                // 連打をやめて仕切り直す。近すぎたら引き、【遠すぎたら踏み込む】。
                // 以前は遠すぎでも後退していたため、間合いの外をうろつくだけになっていた。
                this.poiseKind = tooFar && !tooClose ? 'close' : 'space';
                this.poiseTimerMs = (this.poiseKind === 'close' ? 150 : 260) + Math.random() * 260;
                this.spacingCooldownMs = this.poiseKind === 'close' ? 240 : 900 + Math.random() * 600;
                this.attackStreak = 0;
                this.attackCooldown = Math.max(this.attackCooldown, this.poiseKind === 'close' ? 0 : 120);
                return;
            }
            if (!punish && Math.random() < 0.42 * (1 - agg)) {
                // 一手見送って様子を見る(即座に撃ち返さない)
                this.poiseKind = 'watch';
                this.poiseTimerMs = 170 + Math.random() * 260;
                return;
            }
            this.attackStreak = punish ? this.attackStreak : this.attackStreak + 1;
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
        this.bossName = '火薬玉の足軽頭';
        this.aggression = 0.30;   // 投擲役。間合いを取りたがる
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
        // 素体・具足は bossRenderer。
        // 1回の攻撃で throwCount 個を throwInterval ごとに投げるので、
        // 腕は【1投ぶんの周期 u】で一往復させる(u=1 の瞬間に手を離す)。
        const interval = this.throwInterval || 280;
        const remaining = this.throwCount || 0;
        const attacking = !!this.isAttacking;
        // throwTimer は interval → 0 へ減り、0 で投擲。u = 1 - timer/interval。
        const u = (attacking && remaining > 0)
            ? Math.max(0, Math.min(1, 1 - ((this.throwTimer || 0) / interval)))
            : 1;   // 投げ終わり(余韻)は振り抜いた姿勢で保持
        // 手の中の玉は「次に投げる分を掴んでから離すまで」だけ見せる。
        // 投げ切った後(remaining=0)や振り抜き直後は手ぶら。
        const holding = attacking && remaining > 0 && u >= 0.25;   // 溜めに入ってから離すまで
        renderBossActor(ctx, this, BOSS_DESIGNS.kayaku, {
            hands: (rig) => bombStance(rig),
            front: (rig, h) => {
                if (!attacking) { drawCarriedBomb(rig, h.front, rig.mt); return; }
                if (holding) drawCarriedBomb(rig, h.front, rig.mt);
            }
        }, { attackProgress: u });
    }
}

// ステージ2ボス: 槍持ちの侍大将
export class YariTaisho extends Boss {
    init() {
        super.init();
        this.bossName = '大槍の武者';
        this.weaponDrop = '大槍';
        this.hp = 360;
        this.maxHp = 360;
        this.incomingDamageScale = 0.71;
        this.speed = 3.35;
        this.attackRange = 135;
        this.attackPatterns = ['thrust'];
        // 柄の高さ。Spear 既定の 27 は素体60px向けで、108pxのボスでは膝下になる
        this.spearGripLift = Math.round(this.height * 0.45);   // 49
        // 長柄は「差し込んで突く」のが持ち味。様子見を減らして間合いを詰めさせる
        this.aggression = 0.82;
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
        // 素体・具足は bossRenderer。槍そのものは本編の Spear 実体が world 座標で描き、
        // 両手は実体の握り(getGripAnchors)へ追従させる。
        /* 槍は【待機中も攻撃中も】本編の Spear 実体が world 座標で描き、
           両手は実体の握り(getGripAnchors)へ追従させる。
           forceSubWeaponRender=true なので待機中も render() が通る。
           以前は待機だけ素体側の drawCarriedSpear(realSpear の移植)で描いており、
           攻撃時と別のグラフィック・別の握り位置になっていた(ユーザー指摘)。 */
        const spear = this.weaponReplica;
        const grips = (spear && typeof spear.getGripAnchors === 'function')
            ? spear.getGripAnchors(this) : null;
        renderBossActor(ctx, this, BOSS_DESIGNS.yari, {
            hands: (rig) => spearStance(rig, grips),
            front: (rig, h) => {
                rig.world(() => {
                    if (spear && typeof spear.render === 'function') spear.render(ctx, this);
                });
            }
        }, { attackProgress: replicaProgress(spear) });
    }
}

// ステージ3ボス: 二刀流の剣豪
export class NitoryuKengo extends Boss {
    init() {
        super.init();
        this.bossName = '二刀流の剣豪';
        this.aggression = 0.72;   // 手数の近接。踏み込んで切り込む
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
        const w = this.weaponReplica;
        /* プレイヤーと同じ出し方にする:
             Z連撃(main) は mainComboLinkTimer が生きている間チェーンして段が進み、
             最終段まで出し切ったら X(飛翔斬撃 = combined)を1回挟んでリンクを切る。
           旧: dualAttackCycle % 4 の固定4拍で、段は tier に縛られて 2段で頭打ちだった。 */
        const maxSteps = w && Array.isArray(w.comboDamages) ? Math.max(1, w.comboDamages.length) : 2;
        const linked = !!(w && (w.mainComboLinkTimer || 0) > 0);
        const step = w ? (w.comboIndex === 0 ? maxSteps : w.comboIndex) : 0;
        const finished = linked && step >= maxSteps;
        // 飛翔斬撃の直後は必ず連撃へ戻す(combined が2連発すると溜めだけの間が続く)
        const justX = this._lastDualType === 'combined';
        const type = (!justX && (finished || (!linked && this.dualAttackCycle % 2 === 1)))
            ? 'combined' : 'main';
        this._lastDualType = type;
        if (type === 'combined') this.dualAttackCycle++;
        this.currentPattern = type;

        if (this.startWeaponReplicaAttack(type)) {
            if (type === 'combined') {
                // モーション長(activeCombinedDuration)より短いと二重発動する
                const dur = (w && w.activeCombinedDuration) || 470;
                this.attackCooldown = Math.max(dur, 260 - toolTier * 30);
            } else {
                // 次の段へリンクさせるため、猶予(mainDuration + 170ms)内に収める
                this.attackCooldown = Math.max(65, 110 - toolTier * 15);
                this.attackStreak = 0;      // 連撃は「1手」として数える(AIの仕切り直しで途切れさせない)
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
        /* 素体・具足は bossRenderer。刀身は playerRenderer と同じ形状関数
           (katanaShape.drawKatanaShape)で素体側が描く。
           DualBlades.render は待機中も main 中も combined 中も刀身を一切描かず、
           飛翔斬撃の弾(renderProjectiles)しか描かないため、ここで描かないと
           攻撃に入った瞬間に両刀が消える。 */
        const replica = this.weaponReplica;
        const attacking = !!(replica && replica.isAttacking);
        const isCombined = attacking && replica.attackType === 'combined';

        // 実体のタイムラインから構えを決める。ボス独自の振り付けは持たない。
        // (旧コードは存在しない replica.attackDuration を見ていて常に undefined だった)
        let st = null, progress;
        if (attacking && isCombined && typeof replica.getCombinedSwingProgress === 'function') {
            progress = Math.max(0, Math.min(1, replica.getCombinedSwingProgress()));
            st = { mode: 'combined', progress };
        } else if (attacking && typeof replica.getMainSwingPose === 'function') {
            const pose = replica.getMainSwingPose({});
            progress = Math.max(0, Math.min(1, pose.progress || 0));
            st = { mode: 'main', pose };
        }

        renderBossActor(ctx, this, BOSS_DESIGNS.nito, {
            backIsFarHand: true,
            hands: (rig) => dualBladeStance(rig, st),
            // 奥刀は奥腕と同じ最背面
            back: (rig, h) => drawDualKatana(rig, h.back, h.a2, 'all', h.blend),
            // 手前刀の柄は手前腕の後(=手首が柄の背後に隠れる)。プレイヤーと同じ分割。
            front: (rig, h) => {
                drawDualKatana(rig, h.front, h.a1, 'handle', h.blend);
                // 飛翔斬撃の弾は world 座標。攻撃終了後も life が残るので常に描く
                rig.world(() => {
                    if (!replica) return;
                    if (attacking && typeof replica.render === 'function') replica.render(ctx, this);
                    else if (typeof replica.renderWorldEffects === 'function') replica.renderWorldEffects(ctx);
                });
            },
            // 刃は掌より前(プレイヤーの 'handle'→手→'blade' と同じ順)
            frontTop: (rig, h) => drawDualKatana(rig, h.front, h.a1, 'blade', h.blend)
        }, { attackProgress: progress });
    }
}

// ステージ4ボス: 鎖鎌使いの暗殺者
export class KusarigamaAssassin extends Boss {
    init() {
        super.init();
        this.forceSubWeaponRender = true;   // 待機中も鎌を携行して見せる(描画のみ)
        this.bossName = '鎖鎌の暗殺者';
        this.aggression = 0.42;   // 一撃離脱。揺さぶりを残す
        this.weaponDrop = '鎖鎌';
        this.hp = 620;
        this.maxHp = 620;
        this.incomingDamageScale = 0.66;
        this.speed = 4.6;
        this.attackRange = 225;
        this.attackPatterns = ['kusa'];
        this.chainX = 0;
        this.chainY = 0;
        /* 鎖の起点を素体の【手前肩】に合わせる。既定値(y+17×ownerScale)は 60px 素体向けで、
           108px のボスでは肩が頭の高さに来てしまい、腕のリーチ(38.9)を超えて
           鎖が手から離れて見えていた。dx/ratio は bossRenderer の shF の実測値。 */
        this.kusaShoulder = { dx: 8.7, ratio: 0.374 };
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
        /* 素体・装束は bossRenderer。鎌と鎖は本編の Kusarigama 実体が描く。
           役割分担は playerRenderer と同じ:
             手前手 = 実体アンカー追従で鎖を【回す】(playerRenderer:4703 swingShoulder=右肩)
             奥手   = 片刀アイドルのまま固定(playerRenderer:1675 kusaKeepIdleBackArm)
           以前はアンカーを奥手に入れていたため鎖が奥腕から生え、手前手は何も握らずに
           空中で円を描いていた(ボス独自モーション)。 */
        const kusa = this.weaponReplica;
        const attacking = !!(kusa && kusa.isAttacking);
        const anchor = (kusa && typeof kusa.getHandAnchor === 'function')
            ? kusa.getHandAnchor(this) : null;
        const st = (attacking && kusa && typeof kusa.getRenderState === 'function')
            ? kusa.getRenderState(this) : null;
        /* Kusarigama.render は鎖が短い区間(radius<4 = 振りかぶり〜投げ出し直前)と
           巻き取り終盤のフェードで【何も描かない】。そのままだと得物が一瞬消え、
           次に別の位置から現れるので「持つ腕が入れ替わった」ように見える。
           その区間は素体側の携行描画で橋渡しする。 */
        const bridged = attacking && (!st || !(st.radius >= 4));
        renderBossActor(ctx, this, BOSS_DESIGNS.kusa, {
            hands: (rig) => kusarigamaStance(rig, attacking ? anchor : null),
            // 鎖・軌跡・柄は手前腕/掌より奥
            front: (rig, h) => {
                if (!attacking || bridged) {
                    drawCarriedKusarigama(rig, h, rig.t, st ? st.chainHeading : undefined, 'under');
                    return;
                }
                rig.world(() => {
                    if (kusa && typeof kusa.render === 'function') kusa.render(ctx, this, 'behind');
                });
            },
            // 刃は掌より前(プレイヤーの 柄→手→刃 と同じ順)
            frontTop: (rig, h) => {
                if (!attacking || bridged) {
                    drawCarriedKusarigama(rig, h, rig.t, st ? st.chainHeading : undefined, 'over');
                    return;
                }
                rig.world(() => {
                    if (kusa && typeof kusa.render === 'function') kusa.render(ctx, this, 'front');
                });
            }
        }, { attackProgress: replicaProgress(kusa) });
    }
}

// ステージ5ボス: 大太刀の武将
export class OdachiBusho extends Boss {
    init() {
        super.init();
        this.bossName = '大太刀の武将';
        this.aggression = 0.55;   // 重い一撃。詰めるが撃つ前に溜める
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
        /* 旧: this.weaponReplica.range = 100 —— applyWeaponReplicaEnhancement が
           baseRange(74) から毎回再計算するため初回攻撃で消える死にコードだった。
           待機描画にも実体を使うようになったので、消えると初回攻撃で刃渡りがポップする。
           実際に遊ばれてきたのは再計算後の 74〜101(刃渡り 122〜149)なのでそれに揃え、
           代入自体を削除する。 */
        if (this.weaponReplica) this.applyWeaponReplicaEnhancement();
        /* 待機の構えは提案書で合意した立て太刀(切先を前上へ)。
           実体既定の ready(-π*0.10 ≒ ほぼ水平)だと突き出したように見える。描画専用。 */
        this.odachiReadyAngle = -1.02;
        this.odachiReadyHandXRatio = 0.30;
        this.odachiReadyHandYRatio = 0.34;
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
        /* 素体・黒具足・陣羽織は bossRenderer。大太刀そのものは【待機中も攻撃中も】
           本編の Odachi 実体が world 座標で描き、両手は実体のアンカーへ追従させる。
           forceSubWeaponRender=true なので待機中は 'ready' ポーズが描かれる。
           以前は待機だけ素体側の drawCarriedOdachi(刃の半幅 4.4 = 実体 10.5 の 42%)を
           使っていたため、待機の忍具が細身の打刀に見えていた(ユーザー指摘)。
           これで刺さり刀のフェードアウト(350ms)も途切れずに描かれる。 */
        const odachi = this.weaponReplica;
        const anchor = (odachi && typeof odachi.getHandAnchor === 'function')
            ? odachi.getHandAnchor(this) : null;
        renderBossActor(ctx, this, BOSS_DESIGNS.odachi, {
            hands: (rig) => odachiStance(rig, anchor),
            front: (rig, h) => {
                rig.world(() => {
                    if (odachi && typeof odachi.render === 'function') odachi.render(ctx, this);
                });
            }
        }, {
            attackProgress: replicaProgress(odachi),
            // 体の所作は実体のフェーズ(rise/stall/flip/plunge/planted)に追従させる
            phase: (odachi && typeof odachi.getPose === 'function' && odachi.isAttacking)
                ? (odachi.getPose(this) || {}).phase : null
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

function renderInactiveBossWeaponPayloads(owner, ctx) {
    for (const weapon of owner.subWeapons || []) {
        if (!weapon || weapon === owner.currentSubWeapon || !hasLiveWeaponPayload(weapon)) continue;
        if (typeof weapon.render === 'function') {
            weapon.render(ctx, owner);
        } else if (typeof weapon.renderWorldEffects === 'function') {
            weapon.renderWorldEffects(ctx, owner);
        }
    }
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

/** 高い段に居る相手へは斬撃が届かないので投げで削る。 */
function startShogunBossThrow(owner) {
    const pool = ['手裏剣', '鎖鎌'];
    const action = pool[Math.floor(Math.random() * pool.length)];
    owner.attackFacingRight = owner.facingRight;
    owner._lastAttackType = action;
    return startBossSubWeapon(owner, action);
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

    // 将軍は身長が2倍あり手裏剣の発射高度も高いため、追尾になる Lv3 未満では
    // 接地している忍者の背丈に当たらない。当たらない攻撃で手数を浪費しないよう、
    // 「忍具Lv3」または「相手が空中(ジャンプ中)」のときだけ手裏剣を選ぶ。
    // 相手が高い段(金鯱の上など)に居る場合も、高い発射高度が活きるので有効。
    const targetAboveBy = target
        ? (owner.y + getWorldHeight(owner)) - (target.y + getWorldHeight(target))
        : 0;
    const shurikenUseful = (owner.getSubWeaponEnhanceTier
        ? owner.getSubWeaponEnhanceTier() >= 3
        : false)
        || !!(target && target.isGrounded === false)
        || targetAboveBy > 60;

    let action;
    if (dist >= 900) {
        action = '大槍';
    } else if (dist > 300) {
        action = pickFrom(shurikenUseful
            ? ['手裏剣', '二刀流_合体', '鎖鎌']
            : ['二刀流_合体', '鎖鎌']);
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

// これより離れたら牽制をやめて全速で間合いを詰める(画面の約半分)。
// 大屋根アリーナが広くなり、300px帯の牽制歩き(0.28倍)では追いつけなくなったため。
const SHOGUN_CLOSE_IN_RANGE = 620;
// 地上の斬撃が届く高さ差。金鯱のコライダー(頭の上=大棟から116px)に乗られると
// これを超えるため、真下で当たらないコンボを繰り返してしまう(実測)。
const SHOGUN_VERTICAL_REACH_PX = 72;
// 踏み切り(-17.6 / GRAVITY 0.8)で届く高さ。これを超える段(鯱の背など)は跳んでも無駄。
const SHOGUN_JUMP_REACH_PX = 190;
// これより遠いと投擲を控えて前へ出る(攻撃モーション中は足が止まるため)。
const SHOGUN_PRESS_RANGE = 340;

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

    // 【上に居る相手には跳んで当てに行く】。金鯱の上に乗られたとき、真下で
    // 届かない斬撃を繰り返すのが一番みっともないので、高さ差で行動を分ける。
    //   届く高さ  → 真下へ寄って踏み切り、高さが合ったところで斬る
    //   届かない段 → 少し離れて投げで削る(真下で棒立ちにしない)
    const targetAboveBy = (this.y + getWorldHeight(this))
        - (target.y + getWorldHeight(target));
    // 踏み切った後は、跳び上がりながら寄せて【高さが合った瞬間に斬る】。
    // 高さ差の条件を「相手が上」の分岐の内側に置くと、跳んで並んだ時点で
    // 分岐から外れてしまい永久に発火しない(実測: 空中斬り0回)。
    if (!this.isGrounded && this._shogunAerialHunt
        && !this.isAttacking && this.subWeaponTimer <= 0) {
        this.applyDesiredVx(dirToTarget * this.speed * 0.9, 0.4);
        if (absX <= this.attackRange * 1.2 && targetAboveBy <= SHOGUN_VERTICAL_REACH_PX) {
            this._shogunAerialHunt = false;
            this.attackFacingRight = this.facingRight;
            this.currentSubWeapon = null;
            this.attack();
            this._lastAttackType = '空中斬り';
        }
        return;
    }
    if (targetAboveBy > SHOGUN_VERTICAL_REACH_PX && this.isGrounded) {
        // 【必要な上昇量は高さ差そのものではない】。跳んだ先で斬撃の縦リーチ
        // (SHOGUN_VERTICAL_REACH_PX)まで詰めれば当たるので、差し引いた残りが
        // 踏み切りで届くかを見る。旧条件(高さ差 <= 190)だと鯱の背びれ(尾)=大棟から
        // 239px上に乗られた時に「届かない段」と誤判定し、投げに逃げていた
        // (実測: 15秒で跳躍0・被弾0＝完全な安全地帯。実際は239-72=167pxの上昇で足りる)。
        const riseNeeded = targetAboveBy - SHOGUN_VERTICAL_REACH_PX;
        if (riseNeeded <= SHOGUN_JUMP_REACH_PX) {
            // 真下へ寄ってから踏み切る。横に離れたまま跳んでも届かない。
            if (absX > 190) {
                this.applyDesiredVx(dirToTarget * this.speed * 1.26, 0.52);
            } else {
                this.applyDesiredVx(dirToTarget * this.speed * 0.72, 0.5);
                if (this.tryJump(0.5, -17.6, 560)) this._shogunAerialHunt = true;
            }
            return;
        }
        // 跳んでも届かない段(鯱の背など)。真下で棒立ちにせず投げで削る。
        if (this.attackCooldown <= 0 && startShogunBossThrow(this)) return;
        this.applyDesiredVx(
            (absX < 260 ? -dirToTarget : dirToTarget) * this.speed * 0.62,
            0.42
        );
        return;
    }
    if (this.isGrounded) this._shogunAerialHunt = false;

    if (this.attackCooldown <= 0) {
        // 遠距離では一手見送って間合いを詰める。クールダウンが空くたびに投擲すると
        // 攻撃モーション中は足が止まるため、離れたまま棒立ちで撒くだけになる(実測)。
        const skipForPressing = absX > SHOGUN_PRESS_RANGE
            && Math.random() < (absX > SHOGUN_CLOSE_IN_RANGE ? 0.72 : 0.5);
        if (skipForPressing) {
            this.attackCooldown = 220 + Math.random() * 200;
        } else {
            startShogunBossPlayerAttack(this, target);
            return;
        }
    }

    let desiredVX = 0;
    if (absX > SHOGUN_CLOSE_IN_RANGE) {
        // 遠距離は牽制ではなく【詰め寄る】。0.28倍の牽制歩きだと、広い大屋根で
        // 後退するプレイヤーに置いていかれて「全然近づいてこない」状態になる(実測)。
        desiredVX = dirToTarget * this.speed * 1.30;
    } else if (absX > 300) {
        // 中距離。牽制の揺さぶりは残すが、正味は必ず前へ出る量にする
        // (0.28倍+牽制±0.35だと相殺して間合いが縮まらない)
        desiredVX = this.feintDir * this.speed * 0.16 + dirToTarget * this.speed * 0.85;
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
    // 連撃/忍具Lvは固定ではなく、他ボス(Boss.getSubWeaponEnhanceTier)と同じHP段階式で上げる。
    // 【ラスボスはLv1スタート】。上限が3なので、開始1のまま25%刻み(75/50/25%)にすると
    // 75%の昇格が素通りになる。1/3ずつの等間隔にして 1 → 2(残り2/3) → 3(残り1/3) と
    // 2回昇格させる。hardは従来どおり下限2(=開始からLv2)。
    // progression の初期値は 0 のままにしておくこと: 1 で初期化すると
    // syncHpPhaseProgression の「変化したら再スケール」条件を満たさず、
    // 忍具がtier0のスケールのまま Lv1 として振る舞ってしまう。
    boss.progression = { normalCombo: 0, subWeapon: 0, specialClone: 0 };
    boss.getHpPhaseTier = function() {
        const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
        let tierFromHp = 1;
        if (hpRatio < 1 / 3) tierFromHp = 3;
        else if (hpRatio < 2 / 3) tierFromHp = 2;
        const difficultyId = window.game && window.game.difficulty ? window.game.difficulty.id : 'normal';
        return Math.max(tierFromHp, difficultyId === 'hard' ? 2 : 0);
    };
    // 登場演出(金鯱から5連コンボで降りてくる)の間だけ段数を固定するための上書き。
    // 通常は syncHpPhaseProgression が毎フレーム progression.normalCombo を
    // HP段階Lvへ書き戻すので、progression を直接触っても効かない。
    const baseGetNormalComboMax = boss.getNormalComboMax.bind(boss);
    boss.entranceComboMax = 0;
    boss.getNormalComboMax = function() {
        return this.entranceComboMax > 0 ? this.entranceComboMax : baseGetNormalComboMax();
    };
    boss.syncHpPhaseProgression = function() {
        const tier = this.getHpPhaseTier();
        this.progression.normalCombo = tier; // 連撃段数は都度参照のため代入だけで即反映
        if (this.progression.subWeapon !== tier) {
            this.progression.subWeapon = tier;
            // 忍具tierは武器インスタンスへ焼き込まれるため、変更時は再スケール必須
            if (typeof this.refreshSubWeaponScaling === 'function') this.refreshSubWeaponScaling();
        }
    };
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
    // 難易度確定後に初期段階を反映(hardはここでLv2に上がり忍具も再スケールされる)
    boss.syncHpPhaseProgression();

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
            // ボスは横にも押されない(当て続けると後退し続けるため)。既定0
            knockbackX: attackData && Number.isFinite(attackData.knockbackX) ? attackData.knockbackX : 0,
            // ボスは重量級なので通常打では浮かせない(縦ノックバック0)。
            // 打ち上げ技(isLaunch)など明示指定がある場合のみ従う
            knockbackY: attackData && Number.isFinite(attackData.knockbackY) ? attackData.knockbackY : 0,
            invincibleMs: attackData && attackData.isLaunch ? 120 : 80,
            flashMs: 140,
            disableHitFeedback: true
        });
        this.hitTimer = 140;
        // 通常打では動じず、ダメージが一定量たまったときだけ大きくよろける
        // (enemy.js のボス共通ルールと同じ閾値7%。将軍は Player 実装なので個別に持つ)
        this.staggerAccum = (this.staggerAccum || 0) + scaledDamage;
        if (this.staggerAccum >= Math.max(1, this.maxHp * 0.07)) {
            this.staggerAccum = 0;
            this.staggerTimer = 420;
        }
        if (attackData && Number.isFinite(attackData.slowDurationMs) && attackData.slowDurationMs > 0) {
            this.slowMultiplier = Math.min(this.slowMultiplier || 1, attackData.slowMultiplier || 0.7);
            this.slowTimer = Math.max(this.slowTimer || 0, attackData.slowDurationMs);
        }
        if (killed) {
            this.hp = 0;
            this.isDying = true;
            this.deathTimer = 0;
            this.isAlive = true;
            // 撃破時は忍具の居残りを消す。刺さった大太刀・振り中の刀・鎖などが
            // 本体消滅後も画面に残ると「武器だけ浮いている」不自然な絵になる
            this.subWeaponTimer = 0;
            this.subWeaponAction = null;
            this.isAttacking = false;
            this.currentAttack = null;
            for (const w of this.subWeapons || []) {
                if (!w) continue;
                w.isAttacking = false;
                w.plantedTimer = 0;
                w.fadeOutTimer = 0;
                w.hasImpacted = false;
                if (Array.isArray(w.groundWaves)) w.groundWaves.length = 0;
                if (Array.isArray(w.impactDebris)) w.impactDebris.length = 0;
                if (typeof w.attackTimer === 'number') w.attackTimer = 0;
            }
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
        // 被弾表現(雑魚と差別化): 通常打は薄い白ティント＋微振動で動じず、
        // ダメージ蓄積で発火する「よろけ」だけ全身白フラッシュ＋大きく後傾する
        let shogunHitShake = 0;
        let shogunStaggerLean = 0;
        // 【技を出している間は傾けない】。よろけは体ごと回すので、攻撃モーションが
        // その中で再生されると「斬撃が斜めに出る」絵になる(実機フィードバック 2026-08-12)。
        // 押し込み(shogunHitShake)は方向を持たない平行移動なので手応えとして残す。
        const shogunSwinging = !!(this.isAttacking || (this.attackTimer || 0) > 0
            || (this.subWeaponTimer || 0) > 0);
        if (this.staggerTimer > 0 && !shogunSwinging) {
            // よろけだけ全身白フラッシュ＋大きく後傾(色変化はこの1種類のみ)。
            // 白は最初の100msだけにして長引かせない(残りは後傾のみ)
            const st = Math.max(0, Math.min(1, this.staggerTimer / 420));
            if (this.staggerTimer > 360) ctx.filter = 'brightness(0) invert(1)';
            shogunStaggerLean = -(this.facingRight ? 1 : -1) * 0.22 * st;
        } else if (this.hitTimer > 0) {
            // 通常打は色を変えず微振動のみ(薄いティントは装飾の色を奪い
            // 「グレーに点滅」して見えるため入れない)
            // 実座標は動かさず「描画だけ」押し込んですぐ戻す(累積しないので後退しない)。
            // 巨躯なので押し込み量は雑魚ボスより大きめ
            const hitRatio = Math.max(0, Math.min(1, this.hitTimer / 90));
            const dirS = this.facingRight ? 1 : -1;
            shogunHitShake = -dirS * 8.0 * hitRatio + Math.sin(this.hitTimer * 1.15) * 3.2 * hitRatio;
        }
        if (shogunStaggerLean !== 0) {
            const pivotX = this.x + this.getWorldWidth() * 0.5;
            const footY = this.y + this.getWorldHeight();
            ctx.save();
            ctx.translate(pivotX, footY);
            ctx.rotate(shogunStaggerLean);
            ctx.translate(-pivotX, -footY);
        }
        if (shogunHitShake !== 0) ctx.translate(shogunHitShake, 0);
        playerRender(ctx, { skipGlow: true });
        if (shogunHitShake !== 0) ctx.translate(-shogunHitShake, 0);
        if (shogunStaggerLean !== 0) ctx.restore();
        if (typeof this.renderCombatEffectLayer === 'function') {
            this.renderCombatEffectLayer(ctx);
        }
        renderInactiveBossWeaponPayloads(this, ctx);
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
        if (this.staggerTimer > 0) this.staggerTimer = Math.max(0, this.staggerTimer - deltaMs);
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

        // HP段階(連撃/忍具Lv)を毎フレーム同期(閾値クロス時のみ忍具再スケールが走る)
        this.syncHpPhaseProgression();

        this._aiDeltaTime = deltaTime;
        // 足場(Stage6最上階の金鯱など)はプレイヤー・雑魚と同じコライダーで踏ませる。
        // stage 側が毎フレーム _stageObstacles に入れる(登場演出中だけは渡さない)。
        playerUpdate(deltaTime, this._stageObstacles || [], targetPlayer ? [targetPlayer] : []);
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
