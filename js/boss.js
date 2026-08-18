// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { CANVAS_WIDTH, LANE_OFFSET, PLAYER, GRAVITY, GAME_STATE } from './constants.js?v=screen-safe-20260819a';
import { Enemy } from './enemy.js?v=screen-safe-20260819a';
import { createSubWeapon, drawFirebombBall, makeFirebombFuseSeed } from './weapon.js?v=screen-safe-20260819a';
import { audio } from './audio.js?v=screen-safe-20260819a';
import { applyDualComboMotion } from './dualComboMotion.js?v=screen-safe-20260819a';
import { Player } from './player.js?v=screen-safe-20260819a';
import { applySlashTrailMixin } from './playerSlashTrail.js?v=screen-safe-20260819a';
import {
    applyNormalComboActiveMotion,
    applyNormalComboStartMotion,
    freezeNormalComboFinisherTrailCurve,
    prepareNormalComboFinisherProfile
} from './normalComboMotion.js?v=screen-safe-20260819a';
import {
    SHOGUN_ACTOR_BASE_HEIGHT,
    SHOGUN_ACTOR_BASE_WIDTH,
    SHOGUN_ARM_REACH_SCALE,
    SHOGUN_CROUCH_INTENSITY,
    SHOGUN_HEAD_SCALE,
    SHOGUN_HIP_LIFT_PX,
    SHOGUN_SCALE
} from './shogunConstants.js?v=screen-safe-20260819a';
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
} from './bossRenderer.js?v=screen-safe-20260819a';

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
        this.attackLungeMs = 0;       // 技が自前で速度を作っている残り時間(AIの減速を止める)
        this.poiseTimerMs = 0;        // 様子見(攻撃を控えて間合いを計る)
        this.poiseKind = 'watch';     // 'watch'(その場で見る) / 'space'(下がる)
        this.spacingCooldownMs = 0;   // 仕切り直しの再発火待ち

        // ボスは右側から現れるため、初期方向をプレイヤー側（左）にする
        this.facingRight = false;
        /* 向きは updateAI が【相手基準】で決める。Enemy.update の
           「移動方向を向く」既定を切らないと、間合いを取って下がる場面で
           相手向き(AI)と進行方向(既定)が毎フレーム殴り合って痙攣する。 */
        this.faceMovementDirection = false;
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
        if (this.attackLungeMs > 0) this.attackLungeMs = Math.max(0, this.attackLungeMs - deltaMs);
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

        /* 観測値は【攻撃中も】最新に保つ。以前は移動計算の直前(攻撃中は
           early return で通らない位置)で代入していたため、踏み込み中に
           距離を見ようとすると1手前の値しか無かった。 */
        this._aiAbsX = absX;
        this._aiDirToPlayer = dirToPlayer;

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
            /* 技が自前で速度を作っている間は AI の減速を掛けない。
               掛けると、プレイヤーから移植した段別の踏み込み(speed×0.32〜0.92 =
               最大でも 3.9 で speed*1.8 の 7.65 未満)が毎フレーム 0 へ寄せられ、
               コンボが【その場で振っているだけ】になる。 */
            if (!(this.attackLungeMs > 0) && Math.abs(this.vx) < this.speed * 1.8) {
                this.applyDesiredVx(0, 0.34);
            }
            return;
        }

        // 攻めっ気(0=待ち / 1=詰め)。得物の性格ごとにボス側で宣言する
        const agg = Number.isFinite(this.aggression) ? this.aggression : 0.5;

        /* 保ちたい間合い。0 なら従来どおり「とにかく詰める」。
           遠距離技を持つボスが【撃てる距離に留まる】ために使う(0以外を返すと
           近すぎれば下がり、遠すぎれば寄る、という往復になる)。 */
        const standoff = (typeof this.getDesiredStandoff === 'function')
            ? (this.getDesiredStandoff(absX) || 0) : 0;

        let desiredVX = 0;
        if (standoff > 0) {
            const err = absX - standoff;
            if (err > standoff * 0.14) desiredVX = this.speed * (0.92 + agg * 0.20) * dirToPlayer;
            else if (err < -standoff * 0.14) desiredVX = -this.speed * 0.88 * dirToPlayer;
        } else if (absX > this.attackRange * 1.05) {
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

        const engageRange = (typeof this.getEngageRange === 'function')
            ? this.getEngageRange(absX) : (this.attackRange + 104);
        if (this.attackCooldown <= 0 && absX <= engageRange) {
            // プレイヤーの隙(攻撃硬直・忍具モーション中)は迷わず差し込む
            const punish = !!(player.isAttacking || (player.subWeaponTimer || 0) > 0);
            // 近すぎ/遠すぎは一度間合いを直す
            /* 保ちたい間合いがあるボスは、その間合いの前後で判定する
               (attackRange 基準のままだと、狙って離れているのに毎回「遠すぎ」で
                仕切り直してしまい、撃つ前に詰め直す往復になる) */
            const spaceRef = standoff > 0 ? standoff : this.attackRange;
            const tooClose = standoff > 0 ? absX < spaceRef * 0.52 : absX < spaceRef * 0.42;
            const tooFar   = standoff > 0 ? absX > spaceRef * 1.55 : absX > spaceRef * 0.96;
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
            /* 得物が仕事をしない間合い(長柄の懐、投擲役の密着)では振らない。
               空振りを見せるより、置き直してから出したほうが強く見える。 */
            if (typeof this.canAttackAt === 'function' && !this.canAttackAt(absX)) {
                this.poiseKind = 'space';
                this.poiseTimerMs = 190 + Math.random() * 240;
                this.attackStreak = 0;
                return;
            }
            /* 溜め(見切りの間)。重い得物は振る前に一拍置くと、
               読んで避けられる=駆け引きになる。0 を返せば従来どおり即座に振る。 */
            const tellMs = (typeof this.getPreAttackTellMs === 'function')
                ? (this.getPreAttackTellMs(absX) || 0) : 0;
            if (tellMs > 0 && !this._tellArmed) {
                this._tellArmed = true;
                this.poiseKind = 'watch';
                this.poiseTimerMs = tellMs;
                return;
            }
            this._tellArmed = false;
            /* 溜め切ったあとに【出すかどうか】をボス側で決めさせる。
               false を返したらフェイント —— 溜めだけ見せて技は出さない。
               重量級は「出るはずの一撃が出ない」ぶんだけ読み合いになる。 */
            if (typeof this.onTellResolved === 'function' && this.onTellResolved(absX) === false) {
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
        /* --- 投擲役の間合い ---
           近接手段を持たないので、密着されたら「投げずに退がる」のが正解。
           玉が落ちる距離(bombStandoff)を保ち、そこから狙って投げる。 */
        this.bombStandoff = 285;
        this.bombMinRange = 145;
        this.bombVolley = 0;          // 山なり/速球を交互に振る
        this.pinnedMs = 0;            // 密着され続けた時間
        this.escapeCooldownMs = 0;
        /* 手に持つ玉は【実体 Firebomb.renderHeld】で描く(素体側に別グラフィックを
           持つと待機と投擲で違う玉になる)。このボスは攻撃で実体を使わず g.bombs へ
           直接積む作りなので、描画専用のインスタンスを1つ持つ。判定には一切関与しない。 */
        this._bombArt = createSubWeapon('火薬玉');
    }

    /* 常に投げられる間合いを保つ(近ければ退がり、遠ければ寄る) */
    getDesiredStandoff() { return this.bombStandoff; }
    getEngageRange() { return 420; }
    /* 密着では投げない。爆風は自分も巻き込む間合いなので置き直す */
    canAttackAt(absX) { return absX >= this.bombMinRange; }

    update(deltaTime, player, obstacles = []) {
        const dt = deltaTime * 1000;
        if (this.escapeCooldownMs > 0) this.escapeCooldownMs = Math.max(0, this.escapeCooldownMs - dt);
        /* 張り付かれたら投げられないまま何もできない(実測: 密着され続けると
           40秒で攻撃0回)。詰められた時間を測り、一定を超えたら
           【後方へ跳んで離脱し、跳びながら1発落とす】。投擲役の逃げ手。 */
        if (player && !this.isAttacking && this.isAlive) {
            const pw = (typeof player.getWorldWidth === 'function') ? player.getWorldWidth() : player.width;
            const d = Math.abs((player.x + pw / 2) - (this.x + this.width / 2));
            if (d < this.bombMinRange) this.pinnedMs += dt; else this.pinnedMs = 0;
            if (this.pinnedMs > 420 && this.escapeCooldownMs <= 0 && this.isGrounded) {
                const toP = (player.x + pw / 2) >= (this.x + this.width / 2) ? 1 : -1;
                const away = -toP;
                this.evasionDir = away;
                this.evasionTimerMs = 420;
                this.evasionCooldownMs = 520;
                this.evasionJumped = true;
                this.vy = -14.5;
                this.isGrounded = false;
                this.escapeCooldownMs = 2600 + Math.random() * 1200;
                this.pinnedMs = 0;
                /* 落とす玉は【プレイヤー側へ】。throwBomb は自分の向きへしか
                   投げないので、投げる瞬間だけ振り向かせる(退がる向きとは逆) */
                this.facingRight = toP > 0;
                this.throwBomb();
                audio.playDash();
            }
        }
        return super.update(deltaTime, player, obstacles);
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
        /* --- 狙って投げる ---
           従来は vx 固定だったので玉は【常に同じ距離】に落ちた。
           プレイヤーは一歩ずれて立つだけで安全になり、投擲役として機能していない。
           落下までのフレーム数を実際の更新式(vy += 0.45 / y += vy)で解き、
           プレイヤーの足元へ落ちる vx を逆算する。
           山なり(滞空長い)と速球(早く着く)を交互に投げて読みを崩す。 */
        const lob = (this.bombVolley++ % 2) === 0;
        const vy = (lob ? -9.4 : -5.6) - toolTier * 0.35;
        const bombR = (toolTier >= 3) ? 14 : 11;
        const dropY = this.groundY - bombR - startY;   // 玉は groundY - radius で炸裂する
        let frames = 0, py = 0, vyy = vy;
        while (py < dropY && frames < 240) { vyy += 0.45; py += vyy; frames++; }
        frames = Math.max(8, frames);
        /* 狙いは【足元ぴったり】にしない。3発を前後に散らして挟み込む。
           完全に正確だと棒立ちに必中で理不尽、外しっぱなしだと無害。 */
        const jitter = ((this.bombVolley % 3) - 1) * 48 + (Math.random() - 0.5) * 36;
        const target = (window.game && window.game.player
            ? window.game.player.x + window.game.player.getWorldWidth() / 2
            : startX + direction * 260) + jitter;
        const need = (target - startX) / frames;
        const vxMax = 9.5 + toolTier * 0.9;
        const vx = Math.max(-vxMax, Math.min(vxMax,
            (Math.sign(need) === direction || need === 0) ? need : direction * 2.2));
        
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
                        /* 玉そのものは【プレイヤーの火薬玉と同じ絵】。
                           ここに独自の球グラデを持っていたので、ボスが手に持つ玉
                           (Firebomb.renderHeld)と投げた玉が別物になっていた
                           (ユーザー指摘 2026-08-16)。 */
                        if (!this._fuseSeed) this._fuseSeed = makeFirebombFuseSeed();
                        drawFirebombBall(ctx, this.x, this.y, this.radius, {
                            seeds: this._fuseSeed,
                            time: performance.now()
                        });
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
            /* 玉は【実体 Firebomb.renderHeld】で描く。素体側に別グラフィックを持つと
               待機と投擲で違う玉になる(大槍と同じ問題)。手の位置だけ渡す。 */
            front: (rig, h) => {
                if (attacking && !holding) return;
                const art = this._bombArt;
                if (art && typeof art.renderHeld === 'function') {
                    // 投げる玉と同じ強化段で描く(tier3 で一回り大きくなる)
                    if (art.enhanceTier !== this.getSubWeaponEnhanceTier()
                        && typeof art.applyEnhanceTier === 'function') {
                        art.applyEnhanceTier(this.getSubWeaponEnhanceTier());
                    }
                    /* 大きさも投げる玉に合わせる。renderHeld の基準半径(9.4/12)は
                       プレイヤーの手の大きさ向けで、throwBomb が積む玉(11/14)より小さい。
                       絵を共通化しても寸法が違うと「持ち替えた」ように見える。 */
                    const tier = this.getSubWeaponEnhanceTier();
                    const heldBaseR = (tier >= 3) ? 12 : 9.4;
                    const thrownR = (tier >= 3) ? 14 : 11;
                    art.renderHeld(rig.c, h.front.x + 2, h.front.y - 8, thrownR / heldBaseR);
                } else {
                    drawCarriedBomb(rig, h.front, rig.mt);
                }
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
        /* --- 長柄の間合い ---
           穂先が届く距離に置き続けるのが強い。懐(spearMinRange 内)は槍が仕事を
           しないので、突かずに引いて置き直す。突きは「小突き(速い)」と
           「踏み込み(遠くから一気に)」の二種を距離で撃ち分ける。 */
        this.spearTipRange = 152;
        this.spearMinRange = 74;
        this._yariChain = false;        // 二段突きの予約(Lv2以上)
        this.setupWeaponReplica('大槍');
        this.forceSubWeaponRender = true;
    }
    
    getDesiredStandoff() { return this._yariChain ? 0 : this.spearTipRange; }
    /* 飛び込み突きは遠間から出す技。忍具Lvが上がるほど遠くから踏み切る
       (Lv0 は穂先の間合いでの小突き中心、Lv3 は画面端から突っ込んでくる)。 */
    getEngageRange() {
        return 218 + this.getSubWeaponEnhanceTier() * 42;    // 218 → 344
    }
    canAttackAt(absX) { return absX >= this.spearMinRange; }

    startAttack() {
        this.currentPattern = 'thrust';
        const toolTier = this.getSubWeaponEnhanceTier();
        const absX = Number.isFinite(this._aiAbsX) ? this._aiAbsX : this.attackRange;
        /* 遠め = 踏み込みの大突き(深く入る/隙も大きい)
           近め = 小突き(踏み込み浅く手数が出る)。同じ突きでも二拍に分かれて見える。
           --- 忍具Lv(=蓄積ダメージ)で配分そのものを変える ---
             Lv0: 小突き主体で様子を見る      Lv1: 大突きが増える
             Lv2: 大突きのあと二段目を繋ぐ    Lv3: 遠間から連発してくる */
        const chained = !!this._yariChain;
        this._yariChain = false;
        const heavyGate = 118 - toolTier * 16;               // Lv3 は 70 から大突きを選ぶ
        const heavyChance = 0.42 + toolTier * 0.15;          // 0.42 → 0.87
        let heavy = !chained && absX > heavyGate && Math.random() < heavyChance;
        /* 小突きは【踏み込まない】ので、穂先の届く範囲(実測リーチ192)を超えたら
           空を切る。届かない距離で小突きを選んだら大突きへ振り替える
           —— Lv0 で 49手中11手が空振りになっていた。 */
        if (!heavy && !chained && absX > 186) heavy = true;
        this.spearHeavy = heavy;
        // Lv2 以上は大突きのあとに小突きを繋いで押し込む(二段突き)
        if (heavy && toolTier >= 2 && Math.random() < 0.30 + toolTier * 0.16) {
            this._yariChain = true;
        }
        this.attackCooldown = chained
            ? Math.max(90, 150 - toolTier * 18)
            : heavy
                ? Math.max(250, 390 - toolTier * 30)
                : Math.max(115, 205 - toolTier * 22);
        if (this.startWeaponReplicaAttack()) {
            const dir = this.facingRight ? 1 : -1;
            /* 小突きは【踏み込まない】。長柄は立ったまま突くのが持ち味で、
               毎回押し込むと自分から懐へ入って背後まで突き抜けてしまう。
               踏み込むのは大突きだけ。量は空いている距離から出す。 */
            const gap = Math.max(0, absX - this.spearTipRange + 26);
            /* 飛び込みの上限も Lv で伸ばす。遠間から踏み切れるようにしないと、
               交戦距離だけ伸ばしても「歩いて近づいてから跳ぶ」ままになる。 */
            const cap = 15.2 + toolTier * 2.9;               // 15.2 → 23.9
            this.vx = dir * (heavy ? Math.min(cap, 5.2 + gap * 0.175) : 0);
            return;
        }
        this.isAttacking = true;
        this.attackTimer = 280;
        audio.playSpear();
    }
    
    updateAttack(deltaTime) {
        const wasAttacking = this.isAttacking;
        /* 相手を【突き抜けない】。詰まったら踏み込みを殺す。
           抜けてしまうと向きが反転し、引き足も逆向きになって
           プレイヤーの周りで前後に往復し続ける(実測 背後取り38回)。 */
        if (this.isAttacking && Number.isFinite(this._aiAbsX) && this._aiAbsX < 86) {
            const d = this.facingRight ? 1 : -1;
            if (Math.sign(this.vx) === d) this.vx *= 0.26;
        }
        this.updateWeaponReplicaAttack(deltaTime);
        if (!this.isAttacking) {
            /* 【突いて引く】。長柄は差し込んだら戻して間合いを作り直す。
               これが無いと、突き終わりに立ち止まったまま次を突いてしまい、
               自分から懐(小突きしか出ない距離)に沈み込んでいく
               —— 実測で 99 手中 98 手が小突きになっていた。
               引きは攻撃より先に評価される回避スロットへ乗せる(攻撃中の
               applyDesiredVx(0) に打ち消されないため)。 */
            if (wasAttacking && !this._yariChain) {
                // 二段突きを繋ぐ時は引かない(引くと二段目が届かない)
                const dir = this.facingRight ? 1 : -1;
                this.evasionDir = -dir;
                this.evasionTimerMs = this.spearHeavy ? 265 : 170;
                this.evasionCooldownMs = 0;
                this.evasionJumped = true;      // 引き足で跳ばせない
            }
            if (Math.abs(this.vx) < 0.35) this.vx = 0;
        }
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
/* 剣筋アンカー用の刃渡り(world px)。drawDualKatana は KATANA_SC 倍で
   bladeLength=80 を描くので、手から切先は (80-5) × 1.536 ≒ 115。 */
const DUAL_TIP = 115;
/* 二刀コンボの縦運動の倍率。
   基準は【忍者と将軍の間のどこに立つか】——「自分の身長の何倍跳ぶか」ではない。
   身長そのまま(108/70.32=1.536)を掛けると 238px 上がり、将軍(≒232px)より高く跳ぶ。

     忍者   world身長  72 / scaleMultiplier 1.0 / vScale 1.00 → 実測 149px
     将軍   world身長 120 / scaleMultiplier 2.0 / vScale 1.56 → ≒232px
     二刀ボス world身長 108 —— 忍者と将軍の 75% の位置

   なので scaleMultiplier 相当を 1 + 0.75 = 1.75 と置き、
   プレイヤーが将軍に使うのと【同じ式】 1 + (scale-1)*0.56 を通す。 */
const DUAL_BODY_T = (108 - 72) / (120 - 72);        // 0.75 (忍者→将軍の位置)
const DUAL_V_SCALE = 1 + ((1 + DUAL_BODY_T * (2 - 1)) - 1) * 0.56;   // ≒1.42
/* 奥刀の切先が頭より上へ抜けているか(描画レイヤーの判定のみ。当たり判定とは無関係) */
function dualBackBladeRaised(rig, h) {
    const blend = (h.blend === undefined) ? 0.28 : h.blend;
    const adj = h.a2 + (-Math.PI / 2 - h.a2) * blend;
    const tipY = h.back.y + Math.sin(adj) * DUAL_TIP;
    const headTop = rig.headY - (rig.headR || 20);
    return tipY < headTop || h.back.y < headTop;
}

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
        /* --- 間合いで戦い方を変える ---
           press = 詰めて二刀コンボ(Z) / zone = 離れて飛翔斬撃(X)。
           旧実装は距離を見ずに「コンボ→X→コンボ→X」を機械的に繰り返すだけで、
           どの間合いでも同じ絵になっていた(ユーザー指摘 2026-08-15)。 */
        this.dualStance = 'press';
        this.dualStanceTimerMs = 0;
        this.dualXStreak = 0;                 // 飛翔斬撃の連発数
        this.dualZoneGraceMs = 0;             // zone へ移った直後の「離れ切る」猶予
        this.dualMeleeReach = 138;            // ここまでなら Z が届く(attackRange×1.15)
        this.dualZoneStandoff = 264;          // zone で保ちたい間合い(attackRange×2.2)
        this.dualZoneFireRange = 430;         // 飛翔斬撃を撃ってよい最大距離(弾の飛距離 約480)
        this.setupWeaponReplica('二刀流');
        /* 剣筋。NitoryuKengo は Enemy 派生で applySlashTrailMixin を受けていないため
           コンボの剣筋が構造的に出せなかった(ユーザー指摘)。ミックスインを当て、
           playerRenderer が作るのと同じ dualBladeTrailAnchors を素体側から供給して
           同じパイプラインへ流す。描画専用=判定不変。 */
        this.dualBladeBackTrailPoints = [];
        this.dualBladeFrontTrailPoints = [];
        this.currentSubWeapon = this.weaponReplica;   // 剣筋側が段/進行度を読む
        /* 飛翔斬撃(X)の大きさ。scaleMultiplier を持たないので既定は等倍になり、
           108px のボスに対して弾だけプレイヤー基準(72px相当)で小さく浮いていた。
           倍率は刀と同じ【描画上の身長比】= 108 / 70.32 ≒ 1.536。
           判定(half=42×sizeScale)も同じ倍率で広がる。 */
        this.dualProjectileSizeScale = 108 / 70.32;
    }
    
    /* 4段目の切り上げは【一撃のインパルスではなく、振っている間ずっと上へ引く
       持続加速】。初速だけでは上昇量がプレイヤーの 1/4 にしかならない
       (実測: プレイヤー 149px = 身長の2.07倍 / 初速のみのボス 37px = 0.34倍)。
       player.js と同じ dualComboMotion を毎フレーム回す。 */
    updateDualComboMotion(deltaTime) {
        const w = this.weaponReplica;
        if (!w || w.name !== '二刀流') return;
        if (this.subWeaponAction !== '二刀_Z' || !(this.subWeaponTimer > 0)) return;
        if (typeof w.getMainSwingPose !== 'function') return;
        const pose = w.getMainSwingPose();
        if (!pose) return;
        applyDualComboMotion(this, pose.comboIndex || 0,
            Math.max(0, Math.min(1, pose.progress || 0)), {
                deltaTime,
                vScale: DUAL_V_SCALE,
                footY: this.y + this.height,
                groundY: this.groundY
            });
        // 体移動を AI の減速から守る
        this.attackLungeMs = Math.max(this.attackLungeMs, 60);
    }

    /* 二刀Zの段別の踏み込み・跳び。player.js:1403-1441 からの移植で、
       段ごとの vx/vy はプレイヤーと同じ数値をそのまま使う。
       ボスは素体が高い(108 : プレイヤー描画 70.32)ので、縦初速だけ
       プレイヤーが将軍に使うのと同じ縮小係数(0.56)で身長比に合わせる。
       これが無いと段が進んでもボスだけ地面に張り付いたままになる(ユーザー指摘)。 */
    applyDualComboStepMotion(w) {
        const step = (w && w.comboIndex) || 0;      // 1..4 = 各段 / 0 = 5段目
        const dir = this.facingRight ? 1 : -1;
        const wasGrounded = this.isGrounded;
        const vScale = DUAL_V_SCALE;
        if (step === 1) {
            this.vx = dir * this.speed * 0.32;
            if (wasGrounded) { this.vy = 0; this.isGrounded = true; }
        } else if (step === 2) {
            this.vx = dir * this.speed * 0.48;
            if (wasGrounded) { this.vy = 0; this.isGrounded = true; }
            else this.vy = Math.min(this.vy, -0.4 * vScale);
        } else if (step === 3) {
            // 3段目: 交差薙ぎ — 深い踏み込みと軽いホップ
            this.vx = dir * this.speed * 0.88;
            if (wasGrounded) { this.vy = -0.6 * vScale; this.isGrounded = false; }
        } else if (step === 4) {
            // 4段目: 並行切り上げで大きく上昇
            this.vx = dir * this.speed * 0.92;
            if (wasGrounded) { this.vy = -6.2 * vScale; this.isGrounded = false; }
            else this.vy = Math.min(this.vy, -5.1 * vScale);
        } else {
            // 5段目: 叩きつけ(軽く浮いてから落ちる)
            this.vx = dir * this.speed * 0.22;
            this.vy = Math.min(this.vy, -1.8 * vScale);
            this.isGrounded = false;
        }
        // AI の減速からこの速度を守る(mainDuration ぶん)
        this.attackLungeMs = Math.max(this.attackLungeMs, (w && w.mainDuration) || 204);
    }

    /* zone のときだけ間合いを保つ。press は従来どおり詰める(0を返す) */
    getDesiredStandoff() {
        return this.dualStance === 'zone' ? this.dualZoneStandoff : 0;
    }
    /* 飛翔斬撃は弾なので、近接の交戦距離より遠くから撃たせる */
    getEngageRange() {
        /* press でも、離れている相手には歩いて詰める前に飛翔斬撃を撃つ。
           近接の交戦距離(224)で止めると「離れれば安全」になってしまう。 */
        return this.dualStance === 'zone'
            ? this.dualZoneFireRange
            : Math.max(this.attackRange + 104, 320);
    }

    /* 撃った/斬った直後に次の構えを決める。ここで「寄る・離れる」の波を作る。 */
    pickDualStance(type, absX, finishedCombo) {
        const desperate = this.hp <= this.maxHp * 0.35;   // 終盤は張り付いて手数で押す
        if (type === 'combined') {
            // X を2連発したら必ず詰める(溜めの間だけが続いて手持ち無沙汰に見える)
            if (this.dualXStreak >= 2 || desperate) return 'press';
            return (absX <= this.dualMeleeReach || Math.random() < 0.58) ? 'press' : 'zone';
        }
        // 連撃を出し切ったら一度離れて撃つ。張り付き続けると単調になる
        if (finishedCombo && !desperate && Math.random() < 0.55) return 'zone';
        return 'press';
    }

    startAttack() {
        const toolTier = this.getSubWeaponEnhanceTier();
        const w = this.weaponReplica;
        /* Z連撃(main) は mainComboLinkTimer が生きている間チェーンして段が進む。
           プレイヤーと同じ出し方。 */
        const maxSteps = w && Array.isArray(w.comboDamages) ? Math.max(1, w.comboDamages.length) : 2;
        const linked = !!(w && (w.mainComboLinkTimer || 0) > 0);
        const step = w ? (w.comboIndex === 0 ? maxSteps : w.comboIndex) : 0;
        const finished = linked && step >= maxSteps;

        /* --- 技は【間合い】で決める ---
             Z が届かない距離(dualMeleeReach 超)は必ず飛翔斬撃。空振りを振らない。
             届く距離では連撃を主軸にし、連撃を出し切った時だけ締めに X を混ぜる。 */
        const absX = Number.isFinite(this._aiAbsX) ? this._aiAbsX : this.attackRange;
        const inMelee = absX <= this.dualMeleeReach;
        let type;
        if (!inMelee) {
            type = 'combined';
        } else if (linked && !finished) {
            type = 'main';                                   // 連撃の途中は振り切る
        } else if (finished) {
            /* 連撃を出し切った締めの X。ただし密着(attackRange の 2/3 未満)では
               撃たずに斬り続ける —— 近い間合いはコンボの領分にする。 */
            type = (this.dualXStreak === 0 && absX >= this.attackRange * 0.66
                    && Math.random() < 0.32) ? 'combined' : 'main';
        } else {
            type = 'main';
        }
        // X の連発は2回まで。3発目は必ず斬りに行く
        if (type === 'combined' && this.dualXStreak >= 2 && inMelee) type = 'main';

        this.dualXStreak = (type === 'combined') ? this.dualXStreak + 1 : 0;
        this._lastDualType = type;
        if (type === 'combined') this.dualAttackCycle++;
        this.currentPattern = type;

        const nextStance = this.pickDualStance(type, absX, finished);
        if (nextStance !== this.dualStance) {
            this.dualStance = nextStance;
            this.dualStanceTimerMs = nextStance === 'zone'
                ? 1600 + Math.random() * 1100      // 離れて撃つ時間は短く区切る
                : 2200 + Math.random() * 1400;
            /* zone へ移る瞬間は後ろへ跳んで距離を作る(歩いて下がると
               「間合いの外をうろつく」だけに見える)。
               vx を直接入れても、攻撃中の updateAI が |vx| < speed*1.8 を 0 へ寄せて
               打ち消してしまうので、攻撃中でも効く回避スロットに乗せる。 */
            if (nextStance === 'zone') {
                this.evasionDir = this.facingRight ? -1 : 1;
                this.evasionTimerMs = Math.max(this.evasionTimerMs, 330);
                this.evasionCooldownMs = Math.max(this.evasionCooldownMs, 560);
                this.evasionJumped = true;              // 跳び上がりはさせない(撃つ姿勢を保つ)
                /* 離れ切る前に「近すぎる」判定で press へ戻されないよう猶予を持たせる。
                   これが無いと zone は生成された次のフレームに必ず取り消される。 */
                this.dualZoneGraceMs = 620;
            }
        }

        if (this.startWeaponReplicaAttack(type)) {
            if (type === 'combined') {
                // モーション長(activeCombinedDuration)より短いと二重発動する
                const dur = (w && w.activeCombinedDuration) || 470;
                /* 離れて撃ち続けるときは一拍置く。連射すると弾幕になって
                   「近づけば斬られる/離れれば撃たれる」の駆け引きが消える。 */
                this.attackCooldown = Math.max(dur, 260 - toolTier * 30)
                    + (this.dualStance === 'zone' ? 240 : 0);
                this.subWeaponAction = null; this.subWeaponTimer = 0;   // Z の剣筋は止める
            } else {
                // 次の段へリンクさせるため、猶予(mainDuration + 170ms)内に収める
                this.attackCooldown = Math.max(65, 110 - toolTier * 15);
                this.attackStreak = 0;      // 連撃は「1手」として数える(AIの仕切り直しで途切れさせない)
                /* 剣筋パイプラインは subWeaponAction/subWeaponTimer で発火する
                   (playerSlashTrail:6741)。Boss.update が Timer を減らす。 */
                this.subWeaponAction = '二刀_Z';
                this.subWeaponTimer = (w && w.mainDuration) || 204;
                this.applyDualComboStepMotion(w);
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

    update(deltaTime, player, obstacles = []) {
        this.updateDualComboMotion(deltaTime);
        const removed = super.update(deltaTime, player, obstacles);
        // 剣筋バッファは前フレームのアンカーを使って進める(プレイヤーと同順)
        if (typeof this.updateDualBladeSlashTrails === 'function') {
            this.updateDualBladeSlashTrails(deltaTime * 1000);
        }
        // 構えには寿命を持たせる。遠距離戦だけで固まると結局それが単調になる
        if (this.dualStanceTimerMs > 0) {
            this.dualStanceTimerMs = Math.max(0, this.dualStanceTimerMs - deltaTime * 1000);
            if (this.dualStanceTimerMs === 0 && this.dualStance === 'zone') this.dualStance = 'press';
        }
        if (this.dualZoneGraceMs > 0) {
            this.dualZoneGraceMs = Math.max(0, this.dualZoneGraceMs - deltaTime * 1000);
        }
        // 踏み込まれたら間合い戦は成立しない。斬りへ切り替える(離れ切る猶予の後)
        if (this.dualStance === 'zone' && this.dualZoneGraceMs <= 0 && player) {
            const pw = (typeof player.getWorldWidth === 'function') ? player.getWorldWidth() : player.width;
            const d = Math.abs((player.x + pw / 2) - (this.x + this.width / 2));
            if (d <= this.dualMeleeReach * 0.85) {
                this.dualStance = 'press';
                this.dualStanceTimerMs = 0;
                this.dualXStreak = 0;
            }
        }
        return removed;
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

        const cxWorld = this.x + this.width * 0.5;
        const footYWorld = this.y + this.height;
        renderBossActor(ctx, this, BOSS_DESIGNS.nito, {
            backIsFarHand: true,
            hands: (rig) => dualBladeStance(rig, st),
            /* 奥刀は本来「奥腕と同じ最背面」だが、頭上へ振り上げた刃まで頭の裏に
               回すと真っ黒な頭の円に刃が飲まれ、左右から生えて見える(=頭に
               突き刺さって見える)。切先が頭より上にある間だけ刃を頭の【前】へ出す。 */
            back: (rig, h) => {
                drawDualKatana(rig, h.back, h.a2, 'handle', h.blend);
                if (!dualBackBladeRaised(rig, h)) drawDualKatana(rig, h.back, h.a2, 'blade', h.blend);
            },
            backTop: (rig, h) => {
                if (dualBackBladeRaised(rig, h)) drawDualKatana(rig, h.back, h.a2, 'blade', h.blend);
            },
            // 柄は【手前腕の上・掌の下】(frontGrip)、刃は掌の上(frontTop)。
            // playerRenderer の 腕 → 柄 → 手 → 刃 と同じ順。
            frontGrip: (rig, h) => drawDualKatana(rig, h.front, h.a1, 'handle', h.blend),
            front: (rig, h) => {
                // 飛翔斬撃の弾は world 座標。攻撃終了後も life が残るので常に描く
                rig.world(() => {
                    if (!replica) return;
                    if (attacking && typeof replica.render === 'function') replica.render(ctx, this);
                    else if (typeof replica.renderWorldEffects === 'function') replica.renderWorldEffects(ctx);
                });
            },
            // 刃は掌より前(プレイヤーの 'handle'→手→'blade' と同じ順)
            frontTop: (rig, h) => {
                drawDualKatana(rig, h.front, h.a1, 'blade', h.blend);
                /* 剣筋アンカー(world 座標)を毎フレーム更新する。
                   playerRenderer が dualBladeTrailAnchors を作るのと同じ形。
                   切先 = 手 + 極座標(uprightBlend 補正後の角度)×刃渡り。 */
                const dir = rig.dir;
                /* 素体は接地合わせで GROUND_LIFT ぶん持ち上がっているので、
                   自前の式ではなくリグの逆写像を使う(自前だと剣筋が数px下へずれる)。 */
                const toWorld = (lx, ly) => rig.toWorld(lx, ly);
                const tip = (hand, angRaw) => {
                    const adj = angRaw + (-Math.PI / 2 - angRaw) * (h.blend === undefined ? 0.28 : h.blend);
                    return toWorld(hand.x + Math.cos(adj) * DUAL_TIP,
                                   hand.y + Math.sin(adj) * DUAL_TIP);
                };
                const bw = toWorld(h.back.x, h.back.y), fw = toWorld(h.front.x, h.front.y);
                const bt = tip(h.back, h.a2), ft = tip(h.front, h.a1);
                this.dualBladeTrailAnchors = {
                    direction: dir,
                    back:  { handX: bw.x, handY: bw.y, tipX: bt.x, tipY: bt.y, angle: h.a2 },
                    front: { handX: fw.x, handY: fw.y, tipX: ft.x, tipY: ft.y, angle: h.a1 }
                };
            }
        }, { attackProgress: progress });

        // 剣筋は world 座標で素体の上に重ねる
        if (typeof this.renderDualBladeSlashTrails === 'function') {
            this.renderDualBladeSlashTrails(ctx, { isAttacking: attacking && !isCombined });
        }
    }
}

/* 剣筋パイプラインをボスへ移植(描画専用)。Player と同じメソッド群が生える。
   ミックスインは大薙(X攻撃ブースト)まわりの Player 専用メソッドを呼ぶので、
   ボスには「効果なし」の既定値を返すスタブを先に生やしておく。 */
Object.assign(NitoryuKengo.prototype, {
    // Player 側が持つ寸法アクセサ。ボスは箱そのまま
    getWorldWidth(){ return this.width; },
    getWorldHeight(){ return this.height; },
    getXAttackTrailWidthScale(){ return 1; },
    getXAttackRangeEffectScale(){ return 1; },
    getXAttackHitboxScale(){ return 1; },
    isXAttackBoostActive(){ return false; },
    isXAttackActionActive(){ return false; }
});
applySlashTrailMixin(NitoryuKengo);

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
        /* --- 暗殺者の間合い ---
           鎖の届く距離に浮いて、当てたら必ず離脱する(一撃離脱)。
           ときどきプレイヤーを飛び越えて背後を取り、正面の読みを崩す。 */
        this.kusaHold = 172;
        this.kusaMinRange = 88;
        this.crossoverCooldownMs = 0;
        this.setupWeaponReplica('鎖鎌');
    }

    getDesiredStandoff() { return this.kusaHold; }
    getEngageRange() { return 288; }
    canAttackAt(absX) { return absX >= this.kusaMinRange; }

    update(deltaTime, player, obstacles = []) {
        if (this.crossoverCooldownMs > 0) {
            this.crossoverCooldownMs = Math.max(0, this.crossoverCooldownMs - deltaTime * 1000);
        }
        return super.update(deltaTime, player, obstacles);
    }

    startAttack() {
        this.currentPattern = 'kusa';
        const toolTier = this.getSubWeaponEnhanceTier();
        this.attackCooldown = Math.max(190, 368 - toolTier * 30);
        const absX = Number.isFinite(this._aiAbsX) ? this._aiAbsX : this.attackRange;
        const toPlayer = this._aiDirToPlayer || (this.facingRight ? 1 : -1);
        const started = this.startWeaponReplicaAttack();

        /* 一撃離脱。振った直後に必ず間合いを切る。
           vx 直接指定は攻撃中の updateAI に打ち消されるので回避スロットに乗せる。 */
        if (this.crossoverCooldownMs <= 0 && this.isGrounded
            && absX < 235 && Math.random() < 0.32) {
            // 攪乱の跳び越え: プレイヤーの頭上を越えて背後へ回る
            this.evasionDir = toPlayer;
            this.evasionTimerMs = 380;
            this.vy = -17.2;
            this.isGrounded = false;
            this.evasionJumped = true;
            this.crossoverCooldownMs = 3200 + Math.random() * 1800;
        } else if (Math.random() < 0.58) {
            /* 毎回下がると間合いが開きっぱなしで詰め直せない(実測:
               平均間合 252 まで離れて跳び越えの条件にも入らなくなった)。
               離脱は半々にして、残りは踏み込んだまま次を狙う。 */
            this.evasionDir = -toPlayer;
            this.evasionTimerMs = Math.max(this.evasionTimerMs, 200);
            this.evasionJumped = true;
            this.evasionCooldownMs = Math.max(this.evasionCooldownMs, 380);
        }

        if (started) return;
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
        /* 刺さり(planted)の柄位置。既定値は【当たり判定の幅/高さ】基準なので、
           判定が素体より一回り大きいこのボス(84×120 に対し素体は 108 のリグ)では
           柄が腕リーチ(38.9)の外に立ち、手が柄から 22px 離れていた。
           実測に合わせて前方 0.35→0.17、ぶら下がり 0.125→0.27 へ。 */
        this.odachiPlantedHandXRatio = 0.24;
        this.odachiPlantedHangRatio = 0.34;
        this.odachiHold = 172;          // 構え直す間合い(ここから跳びかかる)
        this._odachiChain = false;      // 追撃(二段跳び)の予約
        this._odachiFeints = 0;
        this.forceSubWeaponRender = true;
    }
    
    /* 大太刀は跳び上がって落とす一撃。踏み込む距離が要るので密着では振らない */
    canAttackAt(absX) { return absX >= 66; }
    getEngageRange() { return 300; }
    /* 張り付いて振り続けるのではなく、一度離れた位置から跳びかかる。
       重量級は「間合いの外にいる時間」があるほど一撃が重く見える。
       ただし追撃(二段跳び)を予約している間は離れない —— そこは畳みかける。 */
    getDesiredStandoff() { return this._odachiChain ? 0 : this.odachiHold; }
    /* 重い得物は振る前に一拍置く。読める溜めがあるほうが駆け引きになる
       (HPが減るほど短くなり、終盤は畳みかけてくる)。
       溜めの間は【前へ摺り足】で寄る。その場で揺れるだけだと圧が出ない。 */
    getPreAttackTellMs() {
        const late = this.hp <= this.maxHp * 0.4;
        if (Number.isFinite(this._aiDirToPlayer)) this.feintDir = this._aiDirToPlayer;
        return (late ? 130 : 250) + Math.random() * (late ? 90 : 170);
    }

    /* 溜めの結末。技が1種類しかない得物なので、
       「出す / 出さない(フェイント)」の択と、そのあとの「追撃 / 引き」で緩急を作る。
       ・序盤(HP高い)= 慎重。フェイントが多く、出したら引く。
       ・終盤(HP低い)= 畳みかける。フェイントは減り、追撃(二段跳び)が増える。 */
    onTellResolved(absX) {
        const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
        // 追撃の途中はフェイントしない(繋ぎが途切れて間延びする)
        if (this._odachiChain) return true;
        const feintChance = 0.30 * Math.max(0.25, hpRatio) + (absX > 220 ? 0.08 : 0);
        if (Math.random() >= feintChance) return true;
        /* フェイント: 踏み込みだけ見せて下がる。溜めと同じ所作から入るので、
           プレイヤーは出るものと思って回避を切らされる。 */
        const dir = this._aiDirToPlayer || (this.facingRight ? 1 : -1);
        this.vx = dir * this.speed * 1.15;
        this.attackLungeMs = 150;
        this.evasionDir = -dir;
        this.evasionTimerMs = 260;
        this.evasionCooldownMs = 0;
        this.evasionJumped = true;
        this.attackCooldown = Math.max(this.attackCooldown, 260 + Math.random() * 220);
        this.attackStreak = 0;
        this._odachiFeints = (this._odachiFeints || 0) + 1;
        return false;
    }

    startAttack() {
        const toolTier = this.getSubWeaponEnhanceTier();
        const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
        /* 旧 useSpecial は startWeaponReplicaAttack と【完全に同じ処理】を書いた
           重複分岐で、クールダウンが 400ms 長いだけだった(=技の種類は増えていない)。
           ここを「追撃(二段跳び)」に置き換える。同じ跳びでも
           単発+引き / 二連続 の二拍になれば、1種類の技でも緩急が出る。 */
        const chaining = !!this._odachiChain;
        this._odachiChain = false;
        if (chaining) {
            this.currentPattern = 'odachi_chase';
            this.attackCooldown = Math.max(200, 300 - toolTier * 20);
        } else {
            this.currentPattern = 'odachi';
            this.attackCooldown = Math.max(240, 420 - toolTier * 24);
            // 終盤ほど二段跳びが出る(HP25%以下で約半分)
            this._odachiChain = Math.random() < (0.52 - Math.max(0, hpRatio - 0.25) * 0.42);
        }

        const started = this.startWeaponReplicaAttack();
        /* 刺さり(planted)の長さを技ごとに変える。刀を地面に残してぶら下がる間が
           このボス唯一の【確定反撃の窓】なので、ここが毎回同じだと戦いが単調になる。
           追撃は短く(圧をかけ続ける)、単発は長め(大きな隙を見せる)。
           モーション自体は変えていない —— 見せる長さだけを変える。 */
        const w = this.weaponReplica;
        if (w && Number.isFinite(w.basePlantedDuration)) {
            const tierScale = 1 + this.getSubWeaponEnhanceTier() * 0.12;
            const shape = chaining ? 0.62 : (0.95 + Math.random() * 0.55);
            w.plantedDuration = Math.round(w.basePlantedDuration * tierScale * shape);
        }
        /* 跳びかかりの踏み込み。大太刀は落下位置がほぼ自分の足元(実体側が
           着地位置を安定させるため owner.vx を毎フレーム 0.86 倍に落とす)なので、
           踏み込みで詰められるのは数十px。それでも【落ちる頃の相手の位置】へ
           寄せておくと、走って逃げる相手に置きにいける。 */
        const dir = this.facingRight ? 1 : -1;
        const p = this.targetPlayer || (typeof window !== 'undefined' && window.game ? window.game.player : null);
        let aim = Number.isFinite(this._aiAbsX) ? this._aiAbsX : 0;
        if (p) {
            const pw = (typeof p.getWorldWidth === 'function') ? p.getWorldWidth() : p.width;
            const lead = (p.vx || 0) * 14;      // 跳んでいる間に相手が進むぶん
            aim = Math.abs((p.x + pw * 0.5 + lead) - (this.x + this.width * 0.5));
        }
        const gap = Math.max(0, aim - 88);
        this.vx = dir * Math.min(13.8, 6.1 + gap * 0.115);
        if (started) return;
        this.isAttacking = true;
        this.attackTimer = 680;
        audio.playSlash(4);
    }
    
    getAttackHitbox() {
        return this.getWeaponReplicaHitbox();
    }

    updateAttack(deltaTime) {
        const wasAttacking = this.isAttacking;
        // 跳びかかりも相手を通り過ぎない(踏み込みが残ると背後へ抜ける)
        if (this.isAttacking && Number.isFinite(this._aiAbsX) && this._aiAbsX < 92) {
            const d = this.facingRight ? 1 : -1;
            if (Math.sign(this.vx) === d) this.vx *= 0.3;
        }
        this.updateWeaponReplicaAttack(deltaTime);
        if (!this.isAttacking) {
            /* 一撃を振り切ったら間合いを切って構え直す。重量級は
               「撃ったあとの隙」が読めるほうが戦って気持ちがいい。 */
            if (wasAttacking && !this._odachiChain) {
                // 追撃を予約している時は引かない(引くと二段目が届かない)
                const dir = this.facingRight ? 1 : -1;
                this.evasionDir = -dir;
                this.evasionTimerMs = 340;
                this.evasionCooldownMs = 0;
                this.evasionJumped = true;
            }
            if (Math.abs(this.vx) < 0.35) this.vx = 0;
        }
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
