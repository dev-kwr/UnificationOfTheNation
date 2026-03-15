// ============================================
// Unification of the Nation - プレイヤークラス
// ============================================

import { PLAYER, GRAVITY, FRICTION, COLORS, LANE_OFFSET } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { game } from './game.js';
import { drawShurikenShape } from './weapon.js';

// アニメーション状態
export const ANIM_STATE = {
    IDLE: 'idle',
    RUN: 'run',
    JUMP: 'jump',
    FALL: 'fall',
    WALL_SLIDE: 'wall_slide',
    DASH: 'dash',
    ATTACK_SLASH: 'attack_slash',       // 横斬り
    ATTACK_UPPERCUT: 'attack_uppercut', // 斬り上げ
    ATTACK_THRUST: 'attack_thrust',     // 突き
    ATTACK_SPIN: 'attack_spin',         // 回転斬り
    ATTACK_DOWN: 'attack_down',         // 振り下ろし
    SPECIAL: 'special'
};

// 連撃パターン
const COMBO_ATTACKS = [
    { type: ANIM_STATE.ATTACK_SLASH, name: '一ノ太刀・閃返し', damage: 1.02, range: 84, durationMs: 100, cooldownScale: 0.5, chainWindowMs: 98, impulse: -0.66 },
    { type: ANIM_STATE.ATTACK_SLASH, name: '二ノ太刀・影走り袈裟', damage: 1.22, range: 80, durationMs: 140, cooldownScale: 0.46, chainWindowMs: 108, impulse: 1.08 },
    { type: ANIM_STATE.ATTACK_SPIN, name: '三ノ太刀・燕返横薙ぎ', damage: 1.5, range: 96, durationMs: 208, cooldownScale: 0.58, chainWindowMs: 108, impulse: 0.84 },
    { type: ANIM_STATE.ATTACK_UPPERCUT, name: '四ノ太刀・天穿返り', damage: 2.2, range: 96, durationMs: 248, cooldownScale: 0.62, chainWindowMs: 126, impulse: 0.68 },
    { type: ANIM_STATE.ATTACK_DOWN, name: '五ノ太刀・落天水平叩き', damage: 2.52, range: 112, durationMs: 336, cooldownScale: 0.72, chainWindowMs: 136, impulse: 0.2 }
];
const BASE_EXP_TO_NEXT = 100;
const TEMP_NINJUTSU_MAX_STACK_MS = 300000;
const LEVEL_UP_MAX_HP_GAIN = 2;
const PLAYER_HEADBAND_LINE_WIDTH = 4.2;
const PLAYER_SPECIAL_HEADBAND_LINE_WIDTH = 5.4;
const PLAYER_PONYTAIL_CONNECT_LIFT_Y = 2.2;
const PLAYER_PONYTAIL_ROOT_ANGLE_RIGHT = Math.PI * 1.10;
const PLAYER_PONYTAIL_ROOT_ANGLE_LEFT = -Math.PI * 0.10;
const PLAYER_PONYTAIL_ROOT_SHIFT_X = 2.2;
const PLAYER_PONYTAIL_NODE_ROOT_OFFSET_X = 1.0;
const PLAYER_PONYTAIL_NODE_ROOT_OFFSET_Y = 6.0;

function calcExpToNextForLevel(level) {
    const lv = Math.max(1, Math.floor(Number(level) || 1));
    const n = lv - 1;
    // Lvが上がるほど必要経験値を増やす（緩やか）
    return Math.max(
        BASE_EXP_TO_NEXT,
        Math.floor(BASE_EXP_TO_NEXT + n * 10 + n * n * 0.9)
    );
}

export class Player {
    constructor(x, y, groundY) {
        // 位置・サイズ
        this.x = x;
        this.y = y;
        this.width = PLAYER.WIDTH;
        this.height = PLAYER.HEIGHT;
        
        // 速度
        this.vx = 0;
        this.vy = 0;
        this.speed = PLAYER.SPEED;
        
        // 地面の高さ
        this.groundY = groundY;
        
        // 状態
        this.isGrounded = false;
        this.isWallSliding = false;
        this.wallDirection = 0;  // -1: 左壁, 1: 右壁
        this.jumpCount = 0;
        this.maxJumps = 1;  // 一段ジャンプ（二段以上はショップで解禁）
        this.facingRight = true;
        
        // ダッシュ
        this.isDashing = false;
        this.dashCooldown = 0;
        this.dashTimer = 0;
        this.dashDuration = 140;
        this.dashSpeedMultiplier = 1.45;
        this.dashDirection = 1;
        this.permanentDash = false;
        
        // しゃがみ
        this.isCrouching = false;
        
        // 攻撃
        this.isAttacking = false;
        this.attackCombo = 0;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.currentAttack = null;  // 現在の攻撃タイプ
        this.attackBuffered = false;
        this.attackBufferTimer = 0;
        this.comboResetTimer = 0;
        this.comboStrictMiss = false;
        this.comboStep1IdleTransitionTimer = 0;
        this.comboStep5IdleTransitionTimer = 0;
        this.comboStep5RecoveryAttack = null;
        this.finisherLandingSeparationTimer = 0;
        this.finisherAirLockTimer = 0;
        this.justLanded = false;
        // 攻撃全体の見た目速度（大きいほどゆっくり）
        this.attackMotionScale = 1.7;
        
        // 必殺技
        this.specialGauge = 0;
        this.maxSpecialGauge = 100;
        this.isUsingSpecial = false;
        this.specialTimer = 0;
        this.specialCastDurationMs = 320;
        this.specialCastTimer = 0;
        this.specialSmoke = [];
        this.specialCloneSlots = [];
        this.specialCloneAlive = [];
        this.specialCloneSpacing = 180;
        this.specialCloneSpawnInvincibleMs = 680;
        this.specialCloneInvincibleTimers = [];
        this.specialCloneAutoAiEnabled = false;
        this.specialCloneAutoStrikeCooldownMs = 280;
        this.specialCloneAutoCooldowns = [];
        this.specialCloneDurability = [];
        this.specialCloneDurabilityLv3 = 3;
        this.specialCloneHitInvincibleMs = 260;
        this.specialCloneCombatStarted = false;
        this.progression = {
            normalCombo: 0,
            subWeapon: 0,
            specialClone: 0,
            ninjutsuUnlockStage: 0
        };
        this.tempNinjutsuTimers = {
            expMagnet: 0,
            xAttack: 0,
            ghostVeil: 0
        };
        this.tempNinjutsuDurations = {
            expMagnet: 60000,
            xAttack: 60000,
            ghostVeil: 30000
        };
        
        // ステータス
        this.hp = PLAYER.MAX_HP;
        this.maxHp = PLAYER.MAX_HP;
        this.level = 1;
        this.exp = 0;
        this.expToNext = calcExpToNextForLevel(1);
        this.money = 0;
        this.maxMoney = PLAYER.MONEY_MAX || 9999;
        this.attackPower = 1;
        this.baseAttackPower = 1;
        this.atkLv = 0;
        
        // 武器
        this.currentSubWeapon = null;
        this.subWeapons = []; // 取得済みのサブ武器インスタンスを格納
        this.subWeaponIndex = 0;
        this.unlockedWeapons = [];
        this.stageEquip = {};
        this.subWeaponCooldown = 0;
        this.subWeaponTimer = 0;
        this.subWeaponAction = null;
        this.subWeaponCrouchLock = false;
        // サブ武器モーション速度（大きいほどゆっくり）
        this.subWeaponMotionScale = 1.35;
        
        // 無敵時間
        this.invincibleTimer = 0;
        this.damageFlashTimer = 0;
        this.isDefeated = false;
        this.burstVanished = false;
        this.trapDamageCooldown = 0;
        
        // アニメーション
        this.animState = ANIM_STATE.IDLE;
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.legAngle = 0;  // 足の角度（走りアニメ用）
        this.legPhase = 0;
        this.armAngle = 0;  // 腕の角度（攻撃用）
        this.motionTime = 0;
        
        // 残像用
        this.afterImages = [];
        this.subWeaponRenderedInModel = false;
        this.subWeaponPoseOverride = null;
        this.dualBladeTrailAnchors = null;
        this.comboSlashTrailPoints = [];
        this.comboSlashTrailSampleTimer = 0;
        this.comboSlashTrailBoostAnchor = null;
        this.specialCloneSlashTrailPoints = [];
        this.specialCloneSlashTrailSampleTimers = [];
        this.specialCloneSlashTrailBoostAnchors = [];
        this.comboSlashTrailSampleIntervalMs = 14;
        this.comboSlashTrailActiveLifeMs = 950;
        // 攻撃終了後は形を保ったまま緩やかにフェードアウトさせる
        this.comboSlashTrailFadeLifeMs = 480;
        // 凍結ベジェ曲線: 各段の攻撃終了時にベジェパラメータを独立保存しフェードさせる
        this.comboSlashTrailFrozenCurves = [];
        
        // 奥義分身関連
        this.specialClonePositions = []; // 各分身の現在の世界座標 {x, y, facingRight}
        this.specialCloneTargets = [];   // 各分身の追尾対象（Enemyオブジェクト）
        this.specialCloneReturnToAnchor = []; // 待機位置へ戻るフラグ
        this.specialCloneComboSteps = []; // 分身ごとのコンボ段数
        this.specialCloneAttackTimers = []; // 各分身の攻撃アニメーション用タイマー
        this.specialCloneSubWeaponTimers = []; // 各分身のサブ武器アニメーション用タイマー
        this.specialCloneSubWeaponActions = []; // 各分身のサブ武器アクション内容
        this.specialCloneScarfNodes = [];
        this.specialCloneHairNodes = [];

        this.rebuildSpecialCloneSlots();

        // プレビュー画面専用のアクセサリ物理ノード
        this.previewScarfNodes = [];
        this.previewHairNodes = [];
        this.previewMode = false;
    }

    getHitbox() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }

    calculateAccessoryAnchor(posX, groundY, height, motionTime, isMoving, isDashing, isCrouching, legPhase, facingRight = this.facingRight) {
        const bottomY = groundY;
        const drawY = groundY - height;

        let modelBob = 0;
        if (isCrouching) {
            const phase = isMoving ? Math.sin(legPhase || motionTime * 0.012) : 0;
            const idlePhase = isMoving ? 0 : Math.sin(motionTime * 0.006);
            modelBob = isMoving ? phase * 0.4 : idlePhase * 0.2;
        } else if (isDashing) {
            modelBob = Math.abs(Math.sin(legPhase || motionTime * 0.012)) * 3.3;
        } else if (isMoving) {
            modelBob = Math.abs(Math.sin(legPhase || motionTime * 0.012)) * 2.4;
        } else {
            modelBob = Math.sin(motionTime * 0.005) * 1.2;
        }

        // しゃがみ時のheadYはrenderModelと同じ式で計算（PLAYER.HEIGHT基準）
        const modelHeadY = isCrouching
            ? (bottomY - 2 - PLAYER.HEIGHT * (14 * 2 / 60) * 0.5 * 2.2 + modelBob)
            : (drawY + 15 + modelBob);
        const headCenterX = posX + this.width / 2;
        const baseHeightForHead = isCrouching ? PLAYER.HEIGHT : height;
        const headRadius = (baseHeightForHead * (14 * 2 / 60) * 0.5);
        const roots = this.getAccessoryRootAnchors(headCenterX, modelHeadY, headRadius, facingRight);

        return {
            headY: modelHeadY,
            bob: modelBob,
            headX: headCenterX,
            headRadius,
            ...roots
        };
    }

    updateLegLocomotion({
        legPhase = 0,
        legAngle = 0,
        deltaMs = 0,
        horizontalSpeed = 0,
        isGrounded = true,
        isAttacking = false,
        verticalSpeed = 0,
        isDashing = false,
        isCrouching = false,
        runBaseFreq = null,
        runAmplitude = null
    } = {}) {
        let nextLegPhase = Number.isFinite(legPhase) ? legPhase : 0;
        let nextLegAngle = Number.isFinite(legAngle) ? legAngle : 0;
        const speedAbs = Math.abs(horizontalSpeed);
        const movingOnGround = !!isGrounded && speedAbs > 0.85;

        if (isAttacking) {
            nextLegPhase = 0;
            nextLegAngle += (0 - nextLegAngle) * 0.34;
        } else if (movingOnGround) {
            const baseFreq = Number.isFinite(runBaseFreq)
                ? runBaseFreq
                : (isDashing ? 0.027 : (isCrouching ? 0.017 : 0.018));
            const speedScale = isDashing ? 1.0 : Math.min(1.25, speedAbs / Math.max(1, this.speed));
            nextLegPhase += deltaMs * baseFreq * (0.72 + speedScale * 0.68);

            const amplitude = Number.isFinite(runAmplitude)
                ? runAmplitude
                : (isDashing ? 1.08 : (isCrouching ? 0.62 : 0.86));
            const targetAngle = Math.sin(nextLegPhase) * amplitude;
            nextLegAngle += (targetAngle - nextLegAngle) * 0.52;
        } else if (isGrounded) {
            nextLegPhase = 0;
            nextLegAngle += (0 - nextLegAngle) * 0.24;
        } else {
            const airborneTarget = verticalSpeed < -1.8
                ? -0.24 - Math.min(0.22, Math.abs(verticalSpeed) * 0.012)
                : 0.28 + Math.min(0.36, Math.max(0, verticalSpeed) * 0.016);
            nextLegAngle += (airborneTarget - nextLegAngle) * 0.2;
        }

        return {
            legPhase: nextLegPhase,
            legAngle: nextLegAngle
        };
    }

    syncAccessoryRootNodes(scarfNodes, hairNodes, anchorCalc) {
        if (!anchorCalc) return;
        if (Array.isArray(scarfNodes) && scarfNodes.length > 0) {
            scarfNodes[0].x = anchorCalc.knotX;
            scarfNodes[0].y = anchorCalc.knotY;
        }
        if (Array.isArray(hairNodes) && hairNodes.length > 0) {
            hairNodes[0].x = anchorCalc.hairRootX;
            hairNodes[0].y = anchorCalc.hairRootY;
        }
    }

    updateSpecialCloneAccessoryNodes(index, pos, deltaTime, options = {}) {
        if (!pos) return null;
        if (!this.specialCloneScarfNodes[index]) this.initCloneAccessoryNodes(index);

        const scarfNodes = this.specialCloneScarfNodes[index];
        const hairNodes = this.specialCloneHairNodes[index];
        if (!scarfNodes || !hairNodes) return null;

        const cloneVx = Number.isFinite(options.cloneVx) ? options.cloneVx : this.vx;
        const cloneMotionTime = Number.isFinite(options.motionTime) ? options.motionTime : this.motionTime;
        const cloneIsMoving = (typeof options.isMoving === 'boolean') ? options.isMoving : Math.abs(cloneVx) > 0.5;
        const cloneHeight = Number.isFinite(options.height) ? options.height : this.height;
        const drawX = Number.isFinite(options.drawX) ? options.drawX : (pos.x - this.width * 0.5);
        const footY = Number.isFinite(options.footY) ? options.footY : (this.y + this.height);
        const cloneLegPhase = Number.isFinite(options.legPhase) ? options.legPhase : (cloneMotionTime * 0.012);
        const cloneIsDashing = !!options.isDashing;
        const cloneIsCrouching = !!options.isCrouching;

        const anchorCalc = this.calculateAccessoryAnchor(
            drawX, footY, cloneHeight,
            cloneMotionTime, cloneIsMoving,
            cloneIsDashing, cloneIsCrouching,
            cloneLegPhase,
            pos.facingRight
        );

        this.updateAccessoryNodes(
            scarfNodes,
            hairNodes,
            anchorCalc.knotX,
            anchorCalc.knotY,
            cloneVx,
            cloneIsMoving,
            deltaTime,
            {
                facingRight: pos.facingRight,
                hairRootX: anchorCalc.hairRootX,
                hairRootY: anchorCalc.hairRootY,
                headCenterX: anchorCalc.headX,
                headY: anchorCalc.headY
            }
        );

        return anchorCalc;
    }

    getAccessoryRootAnchors(headCenterX, headY, headRadius, facingRight = this.facingRight, headAngle = 0) {
        const dir = facingRight ? 1 : -1;
        const bandBackAngle = (facingRight ? Math.PI * 0.92 : Math.PI * 0.08) + headAngle;
        const bandMaskRadius = Math.max(1, headRadius - 0.05);
        const knotX = headCenterX + Math.cos(bandBackAngle) * bandMaskRadius;
        const knotY = headY + Math.sin(bandBackAngle) * bandMaskRadius;

        const hairRootAngle = (facingRight ? PLAYER_PONYTAIL_ROOT_ANGLE_RIGHT : PLAYER_PONYTAIL_ROOT_ANGLE_LEFT) + headAngle;
        const hairRootRadius = Math.max(1, headRadius);
        const hairRootX = headCenterX + Math.cos(hairRootAngle) * hairRootRadius - dir * PLAYER_PONYTAIL_ROOT_SHIFT_X;
        const hairRootY = headY + Math.sin(hairRootAngle) * hairRootRadius - PLAYER_PONYTAIL_CONNECT_LIFT_Y;

        return { knotX, knotY, hairRootX, hairRootY };
    }

    resetVisualTrails() {
        const dir = this.facingRight ? 1 : -1;
        // 1フレーム目の位置ズレを防ぐため、実際の根元アンカー位置を取得して初期化
        const modelBottomY = this.y + this.height - 2;
        const modelBob = 0; // 初期値なので0
        const modelHeadY = this.isCrouching
            ? (modelBottomY - PLAYER.HEIGHT * (14 * 2 / 60) * 0.5 * 2.2 + modelBob)
            : (this.y + 15 + modelBob);
        const headCenterX = this.x + this.width / 2;
        const baseHeightForHead = this.isCrouching ? PLAYER.HEIGHT : this.height;
        const headRadius = (baseHeightForHead * (14 * 2 / 60) * 0.5);
        const anchorRoots = this.getAccessoryRootAnchors(headCenterX, modelHeadY, headRadius, this.facingRight);

        this.scarfNodes = [];
        this.hairNodes = [];
        for (let i = 0; i < 9; i++) {
            // 鉢巻：根元(knotX/Y)から自然に後ろ・下へ
            this.scarfNodes.push({
                x: anchorRoots.knotX - dir * i * 3.5,
                y: anchorRoots.knotY + i * 2.5
            });
            if (i < 8) {
                // ポニーテール：根元(hairRootX/Y)から自然に後ろ・下へ
                this.hairNodes.push({
                    x: anchorRoots.hairRootX - dir * i * 2.5,
                    y: anchorRoots.hairRootY + i * 3.0
                });
            }
        }
    }

    updateAccessoryNodes(scarfNodes, hairNodes, targetX, targetY, speedX, isMoving, deltaTime, options = null) {
        if (!scarfNodes || scarfNodes.length === 0 || !hairNodes || hairNodes.length === 0) return;

        const facingRight = (options && typeof options.facingRight === 'boolean')
            ? options.facingRight
            : this.facingRight;
        const dir = facingRight ? 1 : -1;
        const time = this.motionTime;
        // deltaTimeが大きすぎる（ラグ等）と物理演算が爆発するため、上限を厳しく設定
        const dt = Math.min(deltaTime, 0.033);
        const subSteps = 2;
        const subDelta = dt / subSteps;
        const speedNormBase = Math.max(1, this.speed || 1);
        const moveBlend = Math.max(0, Math.min(1, Math.abs(speedX) / speedNormBase));
        const prevScarfSpeedX = Number.isFinite(scarfNodes._prevSpeedX) ? scarfNodes._prevSpeedX : speedX;
        const prevSpeedAbs = Math.abs(prevScarfSpeedX);
        const currentSpeedAbs = Math.abs(speedX);
        const rawDecelAmount = Math.max(0, prevSpeedAbs - currentSpeedAbs);
        const decelAmount = prevSpeedAbs > 0.22 ? rawDecelAmount : 0;
        const decelDir = Math.abs(prevScarfSpeedX) > 0.05
            ? Math.sign(prevScarfSpeedX)
            : (Math.abs(speedX) > 0.05 ? Math.sign(speedX) : dir);
        let scarfSwingVelX = Number.isFinite(scarfNodes._swingVelX) ? scarfNodes._swingVelX : 0;
        let scarfSwingOffsetX = Number.isFinite(scarfNodes._swingOffsetX) ? scarfNodes._swingOffsetX : 0;
        // 減速時に前方慣性を加え、バネで中心へ戻してオーバーシュートを作る
        scarfSwingVelX += decelDir * decelAmount * 0.86;
        const swingSpring = 0.09;
        scarfSwingVelX += (-scarfSwingOffsetX * swingSpring) * dt * 60;
        const nearStill = currentSpeedAbs < 0.1 && prevSpeedAbs < 0.26;
        const scarfSwingDamping = nearStill ? Math.pow(0.89, dt * 60) : Math.pow(0.95, dt * 60);
        scarfSwingVelX *= scarfSwingDamping;
        scarfSwingVelX = Math.max(-4.8, Math.min(4.8, scarfSwingVelX));
        scarfSwingOffsetX += scarfSwingVelX * dt * 60;
        scarfSwingOffsetX = Math.max(-5.2, Math.min(5.2, scarfSwingOffsetX));
        scarfNodes._prevSpeedX = speedX;
        scarfNodes._swingVelX = scarfSwingVelX;
        scarfNodes._swingOffsetX = scarfSwingOffsetX;

        scarfNodes[0].x = targetX;
        scarfNodes[0].y = targetY;
        if (options && Number.isFinite(options.hairRootX) && Number.isFinite(options.hairRootY)) {
            hairNodes[0].x = options.hairRootX;
            hairNodes[0].y = options.hairRootY;
        } else {
            hairNodes[0].x = targetX + dir * PLAYER_PONYTAIL_NODE_ROOT_OFFSET_X;
            hairNodes[0].y = targetY - PLAYER_PONYTAIL_NODE_ROOT_OFFSET_Y;
        }

        for (let s = 0; s < subSteps; s++) {
            const scarfDenom = Math.max(1, scarfNodes.length - 1);
            for (let i = 1; i < scarfNodes.length; i++) {
                const node = scarfNodes[i];
                const prev = scarfNodes[i - 1];
                const tipBlend = i / scarfDenom;
                const settleBlend = 1 - moveBlend;
                const effectiveSpeed = 0.003 + moveBlend * (0.03 - 0.003) + tipBlend * 0.0012;
                const flutterIntensity = 0.18 + moveBlend * 4.0 + Math.min(0.55, Math.abs(scarfSwingVelX) * 0.18);
                const tipFlutterScale = 1 + tipBlend * 0.3;
                const flutterH = Math.sin(time * effectiveSpeed + i * 1.2) * flutterIntensity * tipFlutterScale;
                const flutterV = Math.cos(time * (effectiveSpeed * 0.86) + i * 1.0) * (flutterIntensity * (0.92 + tipBlend * 0.18));
                const windDecay = Math.pow(0.8, i);
                const wind = Math.abs(speedX) > 0.1
                    ? (speedX > 0 ? -1 : 1) * (Math.abs(speedX) * 5 + 2) * windDecay
                    : 0;
                const gravityPull = 2.15 + settleBlend * 0.7;
                const pendulumPush = (scarfSwingOffsetX * 0.72 + scarfSwingVelX * 0.48) * (0.34 + tipBlend * 0.55) * (0.52 + settleBlend * 0.68);

            // Y-DOWNなので重力はプラス方向へ
            node.x += (wind + flutterH + pendulumPush) * subDelta * 9.2;
            node.y += (gravityPull + flutterV) * subDelta * 14.5;
            const settleLerp = (0.015 + settleBlend * 0.03) * (1 - tipBlend * 0.16) * subDelta * 60;
            node.x += (prev.x - node.x) * settleLerp;

            // 安全策：座標が異常値（Infinity/NaN）になったらリセット
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
                node.x = prev.x;
                node.y = prev.y;
            }

            const dx = node.x - prev.x;
            const dy = node.y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const targetDist = 5.0;
            if (dist > 0) {
                const tension = Math.max(0.4, (0.62 - moveBlend * 0.03) * (1 - tipBlend * 0.14));
                let correction = (dist - targetDist) * tension;
                const maxDist = targetDist * (1.35 + tipBlend * 0.06);
                if (dist - correction > maxDist) correction = dist - maxDist;
                const angle = Math.atan2(dy, dx);
                node.x -= Math.cos(angle) * correction;
                node.y -= Math.sin(angle) * correction;
            }
        }

        for (let i = 1; i < hairNodes.length; i++) {
            const node = hairNodes[i];
            const prev = hairNodes[i - 1];
            const effectiveSpeed = isMoving ? 0.03 : 0.005;
            const flutterIntensity = isMoving ? 4.0 : 1.0;
            const flutterH = Math.sin(time * effectiveSpeed + i * 1.2) * flutterIntensity;
            const flutterV = Math.cos(time * (effectiveSpeed * 0.8) + i * 1.0) * (flutterIntensity * 0.8);
            const windDecay = Math.pow(0.8, i);
            const wind = isMoving ? (speedX > 0 ? -1 : 1) * (Math.abs(speedX) * 5 + 2) * windDecay : 0;

            // Y-DOWNなので重力はプラス方向へ
            node.x += (wind + flutterH) * subDelta * 9;
            node.y += (1.8 + flutterV) * subDelta * 14;

            const dx = node.x - prev.x;
            const dy = node.y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const targetDist = 4.5;
            if (dist > 0) {
                const tension = isMoving ? 0.65 : 0.7;
                let correction = (dist - targetDist) * tension;
                const maxDist = targetDist * 1.35;
                if (dist - correction > maxDist) correction = dist - maxDist;
                const angle = Math.atan2(dy, dx);
                node.x -= Math.cos(angle) * correction;
                node.y -= Math.sin(angle) * correction;
            }
        }
        }

        // 根元の次ノードを軽く拘束して、接続点の暴れを抑える
        if (scarfNodes.length > 1) {
            const scarfRootBack = 1.9 + moveBlend * 1.35;
            const swingForward = Math.max(0, scarfSwingOffsetX * dir);
            const baseBackX = scarfNodes[0].x - dir * scarfRootBack;
            const forwardFollowX = scarfNodes[0].x + dir * Math.min(2.8, swingForward * 1.35);
            const swingFollowBlend = Math.max(0, Math.min(1, swingForward / 1.25));
            const scarfRootFollowX = baseBackX + (forwardFollowX - baseBackX) * swingFollowBlend;
            const maxForward = Math.max(0, (swingForward + Math.max(0, scarfSwingVelX * dir) * 0.55) * 2.0);
            const scarfRootFollowY = scarfNodes[0].y + 0.88;
            const scarfRootFollow = 0.2 + (1 - moveBlend) * 0.07;
            scarfNodes[1].x += (scarfRootFollowX - scarfNodes[1].x) * scarfRootFollow;
            scarfNodes[1].y += (scarfRootFollowY - scarfNodes[1].y) * scarfRootFollow;

            const relBack = (scarfNodes[1].x - scarfNodes[0].x) * dir;
            if (relBack > maxForward) {
                const targetX = scarfNodes[0].x + dir * maxForward;
                scarfNodes[1].x += (targetX - scarfNodes[1].x) * 0.22;
            }
            if (scarfNodes[1].y < scarfNodes[0].y + 0.35) {
                const targetY = scarfNodes[0].y + 0.35;
                scarfNodes[1].y += (targetY - scarfNodes[1].y) * 0.25;
            }
        }
        if (hairNodes.length > 1) {
            // 接線方向バイアス計算のための基準点取得
            const refHeadX = (options && options.headCenterX !== undefined) ? options.headCenterX : targetX;
            const refHeadY = (options && options.headY !== undefined) ? options.headY : targetY - 10;
            
            // 根本先の折れ曲がり（尖り）を解消するため、拘束を緩やかにして慣性を生かす
            const hairAngle = Math.atan2(hairNodes[0].y - refHeadY, hairNodes[0].x - refHeadX);
            const archPower = 2.6; // 立ち上がり直後を緩やかにする
            const hairRootFollowX = hairNodes[0].x + Math.cos(hairAngle) * archPower;
            const hairRootFollowY = hairNodes[0].y + Math.sin(hairAngle) * archPower + 1.0;
            const hairRootFollow = isMoving ? 0.20 : 0.25;
            hairNodes[1].x += (hairRootFollowX - hairNodes[1].x) * hairRootFollow;
            hairNodes[1].y += (hairRootFollowY - hairNodes[1].y) * hairRootFollow;

            // 根元付近が頭の前側へ回り込むと、描画輪郭が入れ替わってねじれやすい
            const rootNode = hairNodes[0];
            const clampCount = Math.min(2, hairNodes.length - 1);
            for (let i = 1; i <= clampCount; i++) {
                const node = hairNodes[i];
                const minBack = 0.65 + i * 0.55;
                const relBack = (node.x - rootNode.x) * dir;
                if (relBack > -minBack) {
                    node.x = rootNode.x + (-minBack) * dir;
                }

                const minDrop = 0.7 + (i - 1) * 0.9;
                if (node.y < rootNode.y + minDrop) {
                    node.y = rootNode.y + minDrop;
                }
            }
        }
    }

    isOdachiJumpAfterimageActive() {
        const odachi = this.currentSubWeapon;
        if (!odachi || odachi.name !== '大太刀' || !odachi.isAttacking || this.isGrounded) {
            return false;
        }
        if (typeof odachi.getPose === 'function') {
            const pose = odachi.getPose(this);
            return pose.phase === 'rise' || pose.phase === 'stall' || pose.phase === 'flip' || pose.phase === 'plunge';
        }
        return this.subWeaponAction === '大太刀' && this.subWeaponTimer > 0 && !this.isGrounded;
    }

    isSpearThrustAfterimageActive() {
        const spear = this.currentSubWeapon;
        if (!spear || spear.name !== '大槍') return false;
        if (this.subWeaponAction !== '大槍' || this.subWeaponTimer <= 0) return false;
        // 横っ飛び突きの最中だけ、ダッシュ同等の残像を出す
        return spear.isAttacking || Math.abs(this.vx) > PLAYER.SPEED * 1.2;
    }
    
    update(deltaTime, walls = [], enemies = []) {
        const deltaMs = deltaTime * 1000;
        this.updateTemporaryNinjutsu(deltaMs);

        // 無敵時間更新
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= deltaTime * 1000;
        }
        if (this.trapDamageCooldown > 0) {
            this.trapDamageCooldown -= deltaTime * 1000;
        }
        
        const isDualZAction = !!(
            this.subWeaponAction === '二刀_Z' &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流'
        );
        const subWeaponScale = isDualZAction ? 1 : Math.max(1, this.subWeaponMotionScale || 1);
        const subWeaponDeltaMs = (deltaTime * 1000) / subWeaponScale;
        
        // サブ武器タイマー更新
        if (this.subWeaponTimer > 0) {
            this.subWeaponTimer -= subWeaponDeltaMs;
            if (this.subWeaponTimer <= 0) {
                const holdDualZPose = !!(
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name === '二刀流' &&
                    this.subWeaponAction === '二刀_Z' &&
                    (this.attackBuffered || (this.currentSubWeapon.mainComboLinkTimer || 0) > 0)
                );
                const keepOdachiPose = !!(
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name === '大太刀' &&
                    this.subWeaponAction === '大太刀' &&
                    this.currentSubWeapon.isAttacking
                );
                if (holdDualZPose || keepOdachiPose) {
                    // 刀が地面から消えるまでは「ぶら下がり姿勢」を維持する
                    this.subWeaponTimer = 1;
                } else {
                    const lastAction = this.subWeaponAction;
                    this.subWeaponTimer = 0;
                    // 二刀流の合体技はアイドルが二刀流専用なので、通常アイドルを挿まずに直接戻る
                    if (this.subWeaponAction === '二刀_合体' && this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                        this.subWeaponAction = null;
                    } else {
                        this.subWeaponAction = null;
                    }
                    this.subWeaponCrouchLock = false;

                    // リニューアル：二刀流コンボ終了時にリカバリーフェーズを設定
                    if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流' && lastAction === '二刀_Z') {
                        this.comboStep1IdleTransitionTimer = 180; // 約0.18秒
                    }
                }
            }
        }

        // リカバリータイマー更新 (二刀流の滑らかな姿勢戻り)
        if (this.comboStep1IdleTransitionTimer > 0) {
            this.comboStep1IdleTransitionTimer -= deltaMs; // update内では deltaMs = deltaTime * 1000 が既にある
            if (this.comboStep1IdleTransitionTimer <= 0) {
                this.comboStep1IdleTransitionTimer = 0;
                // コンボ入力が続かなかった場合のみインデックスをリセット
                if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流' && this.subWeaponTimer <= 0) {
                    this.currentSubWeapon.comboIndex = 0;
                }
            }
        }
        if (this.comboStep5IdleTransitionTimer > 0) {
            this.comboStep5IdleTransitionTimer -= deltaMs;
            if (this.comboStep5IdleTransitionTimer <= 0) {
                this.comboStep5IdleTransitionTimer = 0;
                this.comboStep5RecoveryAttack = null;
            }
        }
        
        // ダメージフラッシュタイマー更新
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= deltaMs;
        }
        
        // クールダウン更新
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaMs;
        }
        if (this.attackBufferTimer > 0) {
            this.attackBufferTimer -= deltaMs;
            if (this.attackBufferTimer <= 0) {
                this.attackBufferTimer = 0;
                this.attackBuffered = false;
            }
        }
        if (!this.isAttacking && this.comboResetTimer > 0) {
            this.comboResetTimer -= deltaMs;
            if (this.comboResetTimer <= 0) {
                this.comboResetTimer = 0;
                this.attackCombo = 0;
            }
        }
        if (this.finisherLandingSeparationTimer > 0) {
            this.finisherLandingSeparationTimer = Math.max(0, this.finisherLandingSeparationTimer - deltaTime * 1000);
        }
        if (this.finisherAirLockTimer > 0) {
            this.finisherAirLockTimer = Math.max(0, this.finisherAirLockTimer - deltaTime * 1000);
        }
        if (this.dashCooldown > 0) {
            this.dashCooldown -= deltaTime * 1000;
        }
        if (this.dashTimer > 0) {
            this.dashTimer -= deltaTime * 1000;
            if (this.dashTimer <= 0) {
                this.dashTimer = 0;
                this.isDashing = false;
            }
        }
        
        // 必殺技（分身）更新: 操作はロックせず継続
        this.updateSpecial(deltaTime);
        
        // 攻撃中の処理
        if (this.isAttacking) {
            this.updateAttack(deltaTime);
        }
        this.updateComboSlashTrail(deltaMs);

        // サブウェポンの状態更新（アニメーション進行など）
        if (this.currentSubWeapon && this.currentSubWeapon.update) {
            this.currentSubWeapon.update(deltaTime / subWeaponScale, enemies);
        }

        // 鎖鎌・大太刀は武器側の攻撃終了を優先して即座に通常状態へ戻す
        if (
            this.currentSubWeapon &&
            (this.currentSubWeapon.name === '鎖鎌' || this.currentSubWeapon.name === '大太刀') &&
            this.subWeaponAction === this.currentSubWeapon.name &&
            !this.currentSubWeapon.isAttacking
        ) {
            this.subWeaponTimer = 0;
            this.subWeaponAction = null;
            this.subWeaponCrouchLock = false;
        }

        // サブ武器使用中も他の操作を一部制限
        if (this.subWeaponTimer > 200) { // 出始めは移動制限
            this.vx *= 0.5;
        }

        // 二刀Z連撃中は入力移動ではなく専用運動で体を運ぶ
        this.updateDualBladeComboMotion(deltaTime);

        // 二刀Zは終端到達後にだけ次段入力を消化する
        this.tryConsumeDualBladeBufferedAttack();
        
        // 入力処理 (handleInput内でタイマーをセットするように修正が必要)
        this.handleInput();
        
        // 物理演算（ヒットストップ中は位置更新をスキップして、アニメーションとの同期を維持する）
        if (deltaTime > 0) {
            this.applyPhysics(walls);
        }
        
        // アニメーション更新
        this.updateAnimation(deltaTime);
        
        // 残像更新（ダッシュ相当：通常ダッシュ・大槍横っ飛び・大太刀跳躍）
        const isOdachiJumping = this.isOdachiJumpAfterimageActive();
        const isSpearThrusting = this.isSpearThrustAfterimageActive();
        const shouldEmitDashAfterimage =
            this.isDashing ||
            Math.abs(this.vx) > PLAYER.SPEED * 1.5 ||
            isOdachiJumping ||
            isSpearThrusting;
        if (shouldEmitDashAfterimage) {
            this.afterImages.unshift({
                x: this.x,
                y: this.y,
                facingRight: this.facingRight
            });
            const maxTrailCount = 7;
            if (this.afterImages.length > maxTrailCount) this.afterImages.pop();
        } else {
            if (this.afterImages.length > 0) this.afterImages.pop();
        }
    }
    handleInput() {
        // ========== プレビューモード：攻撃・忍具・武器切替のみ ==========
        if (this.previewMode) {
            if (input.isActionJustPressed('SWITCH_WEAPON')) {
                this.switchSubWeapon();
            }
            if (input.isActionJustPressed('SUB_WEAPON')) {
                if (this.subWeaponTimer > 0) return;
                if (!this.currentSubWeapon) return;
                if (this.currentSubWeapon.name === '二刀流') {
                    this.currentSubWeapon.use(this, 'combined');
                    this.subWeaponTimer = this.getSubWeaponActionDurationMs('二刀_合体', this.currentSubWeapon);
                    this.subWeaponAction = '二刀_合体';
                    this.vx = 0;
                } else {
                    // canUse() チェック（手裏剣・火薬玉の画面上最大数制限）
                    if (this.currentSubWeapon.canUse && !this.currentSubWeapon.canUse()) return;
                    this.useSubWeapon();
                    const weaponName = this.currentSubWeapon ? this.currentSubWeapon.name : '';
                    const isThrow = weaponName === '火薬玉' || weaponName === '手裏剣';
                    this.subWeaponTimer = this.getSubWeaponActionDurationMs(isThrow ? 'throw' : weaponName, this.currentSubWeapon);
                    this.subWeaponAction = isThrow ? 'throw' : weaponName;
                }
            }
            if (input.isActionJustPressed('ATTACK')) {
                const lockZDuringSub =
                    this.subWeaponTimer > 0 &&
                    this.subWeaponAction &&
                    this.subWeaponAction !== 'throw' &&
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name !== '火薬玉' &&
                    this.currentSubWeapon.name !== '二刀流';
                if (!lockZDuringSub) {
                    if (this.isAttacking) {
                        this.bufferNextAttack();
                    } else {
                        this.attack();
                    }
                }
            }
            return; // 移動・ジャンプ・ダッシュ・奥義は無視
        }

        // サブ武器切り替え（最優先）
        if (input.isActionJustPressed('SWITCH_WEAPON')) {
            this.switchSubWeapon();
        }

        // しゃがみ（攻撃中もDOWN押下中なら維持）
        const keepCrouchDuringDualSwing = this.subWeaponAction === '二刀_Z' && this.subWeaponCrouchLock;
        const wantsCrouch = this.isGrounded && (input.isAction('DOWN') || keepCrouchDuringDualSwing);
        if (wantsCrouch) {
            if (!this.isCrouching) {
                this.isCrouching = true;
                // 高さが半分になるので、足元を合わせるためにyを下げる
                this.y += PLAYER.HEIGHT / 2;
            }
            // しゃがみ歩き速度制限は移動コード側で適用（下記参照）
        } else if (this.isCrouching) {
            this.isCrouching = false;
            // 高さが戻るので、足元を合わせるためにyを上げる
            this.y -= PLAYER.HEIGHT / 2;
        }
        
        // 忍具（Xキー）
        if (input.isActionJustPressed('SUB_WEAPON')) {
            // クールダウン中は発動不可
            if (this.subWeaponTimer > 0) return;
            if (!this.currentSubWeapon) return;

            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                // 連打防止：既に衝撃波が出ていたら撃てない (一個目が消えるまで)
                // 二刀の忍具技：両手交差の飛翔斬撃
                this.currentSubWeapon.use(this, 'combined');
                this.subWeaponTimer = this.getSubWeaponActionDurationMs('二刀_合体', this.currentSubWeapon);
                this.subWeaponAction = '二刀_合体';
                this.vx = 0; // 完全に停止
            } else {
                // canUse() チェック（手裏剣・火薬玉の画面上最大数制限）
                if (this.currentSubWeapon.canUse && !this.currentSubWeapon.canUse()) return;
                this.useSubWeapon();
                const weaponName = this.currentSubWeapon ? this.currentSubWeapon.name : '';
                const isThrow = weaponName === '火薬玉' || weaponName === '手裏剣';
                this.subWeaponTimer = this.getSubWeaponActionDurationMs(isThrow ? 'throw' : weaponName, this.currentSubWeapon);
                this.subWeaponAction = isThrow ? 'throw' : weaponName;
            }
        }
        
        // 必殺技（攻撃中でも可能）
        if (input.isActionJustPressed('SPECIAL')) {
            this.useSpecial();
        }

        if (input.isActionJustPressed('ATTACK')) {
            const lockZDuringSub =
                this.subWeaponTimer > 0 &&
                this.subWeaponAction &&
                this.subWeaponAction !== 'throw' &&
                this.currentAttack &&
                this.currentSubWeapon &&
                this.currentSubWeapon.name !== '火薬玉' &&
                this.currentSubWeapon.name !== '二刀流';
            
            // 完結段（5撃目）の後は着地するまで1撃目を出せないように制限。4→5への空中派生は許可。
            const loopToStartAirborne = this.attackCombo === 5 && !this.isGrounded;

            if (lockZDuringSub || loopToStartAirborne) return;

            if (this.isAttacking) {
                this.bufferNextAttack();
            } else {
                this.attack();
            }
        }
        
        // 攻撃中は移動制限
        if (this.isAttacking) return;
        
        const odachiAttacking = !!(
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '大太刀' &&
            this.currentSubWeapon.isAttacking
        );
        const lockLocomotionByDualZ = !!(
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0 &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流'
        );
        if (odachiAttacking && typeof this.currentSubWeapon.attackDirection === 'number') {
            this.facingRight = this.currentSubWeapon.attackDirection >= 0;
        }

        const moveDir = input.isAction('LEFT') ? -1 : (input.isAction('RIGHT') ? 1 : 0);

        const touchDashHeld = typeof input.isTouchDashActive === 'function' && input.isTouchDashActive();
        const keyboardDashHeld = typeof input.isKeyboardDashHeld === 'function' && input.isKeyboardDashHeld(moveDir);
        const sustainedDashHeld = touchDashHeld || keyboardDashHeld;

        // ダッシュ（タッチ/キーボードの押下継続中は維持）
        if (!lockLocomotionByDualZ && sustainedDashHeld && moveDir !== 0) {
            if (!this.isDashing) {
                this.startDash(moveDir, true);
            } else {
                this.dashDirection = moveDir >= 0 ? 1 : -1;
                this.dashTimer = Math.max(this.dashTimer, this.dashDuration * 0.85);
                this.dashCooldown = 0;
            }
        } else if (!lockLocomotionByDualZ && input.isActionJustPressed('DASH') && this.dashCooldown <= 0) {
            const triggerDir = moveDir !== 0 ? moveDir : (this.facingRight ? 1 : -1);
            this.startDash(triggerDir);
        }

        if (lockLocomotionByDualZ) {
            this.isDashing = false;
            this.dashTimer = 0;
            this.dashCooldown = Math.max(this.dashCooldown, 80);
        } else if (this.isDashing) {
            this.vx = this.dashDirection * (this.speed * this.dashSpeedMultiplier);
            this.facingRight = this.dashDirection > 0;
        } else if (!odachiAttacking && moveDir !== 0) {
            if (this.permanentDash) {
                this.vx = moveDir * (this.speed * this.dashSpeedMultiplier);
                this.isDashing = true;
                this.dashDirection = moveDir >= 0 ? 1 : -1;
                this.dashTimer = Math.max(this.dashTimer, this.dashDuration * 0.5);
            } else {
                // しゃがみ中は65%速度でゆっくり移動
                this.vx = moveDir * this.speed * (this.isCrouching ? 0.65 : 1.0);
            }
            this.facingRight = moveDir > 0;
        } else if (odachiAttacking) {
            this.vx *= 0.9;
        }
        
        // ジャンプ
        if (input.isActionJustPressed('JUMP')) {
            this.jump();
        }
        
    }
    
    jump() {
        // 1撃目の返し中は地を這う挙動を優先し、ジャンプ入力を受けない
        if (this.isAttacking && this.currentAttack && this.currentAttack.comboStep === 1) {
            return;
        }

        // 壁蹴り
        if (this.isWallSliding) {
            this.vx = this.wallDirection * PLAYER.SPEED * 1.5;
            this.vy = PLAYER.JUMP_FORCE * 0.8;
            this.isWallSliding = false;
            this.jumpCount = 1;
            audio.playJump();
            return;
        }
        
        // 通常ジャンプ・二段ジャンプ
        if (this.jumpCount < this.maxJumps) {
            if (this.jumpCount === 0) {
                this.vy = PLAYER.JUMP_FORCE;
            } else {
                this.vy = PLAYER.DOUBLE_JUMP_FORCE;
            }
            this.jumpCount++;
            this.isGrounded = false;
            audio.playJump();
        }
    }

    startDash(direction, ignoreCooldown = false) {
        if (!ignoreCooldown && this.dashCooldown > 0) return;
        this.isDashing = true;
        this.dashDirection = direction >= 0 ? 1 : -1;
        this.dashTimer = this.dashDuration;
        this.dashCooldown = ignoreCooldown ? 0 : 280;
        this.vx = this.dashDirection * (this.speed * this.dashSpeedMultiplier);
        this.facingRight = this.dashDirection > 0;
    }

    bufferNextAttack() {
        if (!this.isAttacking || !this.currentAttack) return false;
        if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') return false;
        if (this.currentAttack.comboStep >= this.getNormalComboMax()) return false;
        const duration = this.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN;
        const baseBuffer = this.currentAttack.comboStep === 4
            ? Math.max(420, Math.min(620, duration * 1.25))
            : Math.max(80, Math.min(240, duration * 0.82));
        this.attackBuffered = true;
        this.attackBufferTimer = Math.max(this.attackBufferTimer, baseBuffer);
        return true;
    }

    isDualBladeZActionActive() {
        return !!(
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0 &&
            typeof this.currentSubWeapon.getMainSwingPose === 'function'
        );
    }

    isDualBladeNextSwingReady() {
        if (!this.isDualBladeZActionActive()) return true;
        const poseOptions = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : undefined;
        const pose = this.currentSubWeapon.getMainSwingPose(poseOptions || {});
        const progress = Math.max(0, Math.min(1, pose.progress || 0));
        // 終端直前から次段へ（受付を少し広げて連撃の抜けを防ぐ）
        return progress >= 0.9;
    }

    bufferDualBladeNextSwing() {
        if (!this.isDualBladeZActionActive()) return false;
        const remainMs = Number.isFinite(this.currentSubWeapon.attackTimer)
            ? this.currentSubWeapon.attackTimer
            : this.subWeaponTimer;
        this.attackBuffered = true;
        this.attackBufferTimer = Math.max(
            this.attackBufferTimer,
            Math.max(90, Math.min(260, (remainMs || 0) + 34))
        );
        return true;
    }

    tryConsumeDualBladeBufferedAttack() {
        if (!this.attackBuffered || this.attackBufferTimer <= 0) return false;
        if (!this.isDualBladeZActionActive()) return false;
        if (!this.isDualBladeNextSwingReady()) return false;
        this.attackBuffered = false;
        this.attackBufferTimer = 0;
        this.attack({ fromBuffer: true });
        return true;
    }

    buildAttackProfile(baseAttack, extra = {}) {
        const source = { ...(baseAttack || {}), ...(extra || {}) };
        const speedScale = this.attackMotionScale || 1;
        const durationBase = Number.isFinite(source.durationMs) ? source.durationMs : PLAYER.ATTACK_COOLDOWN;
        const chainBase = Number.isFinite(source.chainWindowMs) ? source.chainWindowMs : 0;
        const durationMs = Math.max(1, Math.round(durationBase * speedScale));
        const chainWindowMs = Math.max(0, Math.round(chainBase * speedScale * 0.9));
        return {
            ...source,
            durationMs,
            chainWindowMs,
            motionElapsedMs: 0
        };
    }

    freezeCurrentSlashTrail() {
        if (!this.currentAttack || this.currentAttack.comboStep < 1) return;
        const activeAttack = this.currentAttack;
        const stepNum = activeAttack.comboStep;
        // 現在の段に属するポイントを収集
        const stepPoints = this.comboSlashTrailPoints.filter(p => (p.step || 0) === stepNum);
        
        if ([1, 2, 5].includes(stepNum)) {
            // ベジェ曲線段: パラメータを保存
            const lastPt = stepPoints.length > 0 ? stepPoints[stepPoints.length - 1] : null;
            if (lastPt && Number.isFinite(lastPt.trailCurveStartX)) {
                this.comboSlashTrailFrozenCurves.push({
                    type: 'bezier',
                    step: stepNum,
                    trailCurveStartX: lastPt.trailCurveStartX,
                    trailCurveStartY: lastPt.trailCurveStartY,
                    trailCurveControlX: lastPt.trailCurveControlX,
                    trailCurveControlY: lastPt.trailCurveControlY,
                    trailCurveEndX: lastPt.trailCurveEndX,
                    trailCurveEndY: lastPt.trailCurveEndY,
                    trailRadius: lastPt.trailRadius,
                    centerX: lastPt.centerX,
                    centerY: lastPt.centerY,
                    dir: lastPt.dir,
                    progress: lastPt.progress,
                    trailIsRelative: !!activeAttack.trailIsRelative,
                    playerX: this.x,
                    playerY: this.y,
                    frozenFootX: this.getFootX ? this.getFootX() : (this.x + this.width * 0.5),
                    frozenFootY: this.getFootY ? this.getFootY() : (this.y + this.height),
                    age: 0,
                    life: this.comboSlashTrailActiveLifeMs,
                    trailCurveFrozen: !!activeAttack.trailCurveFrozen
                });
            }
        } else {
            // リニア/アーク段(3, 4など): ポイント配列のコピーを保存
            if (stepPoints.length >= 2) {
                const footX = this.getFootX ? this.getFootX() : (this.x + this.width * 0.5);
                const footY = this.getFootY ? this.getFootY() : (this.y + this.height);
                this.comboSlashTrailFrozenCurves.push({
                    type: 'points',
                    step: stepNum,
                    // 絶対座標で保存（スケール補正は描画時に行う）
                    frozenPoints: stepPoints.map(p => ({ ...p, age: 0 })),
                    // 凍結時の足元座標（スケール補正用）
                    frozenFootX: footX,
                    frozenFootY: footY,
                    age: 0,
                    life: this.comboSlashTrailActiveLifeMs
                });
            }
        }
    }

    getComboAttackProfileByStep(step) {
        const clampedStep = Math.max(1, Math.min(COMBO_ATTACKS.length, Math.floor(step) || 1));
        const comboProfile = COMBO_ATTACKS[clampedStep - 1] || COMBO_ATTACKS[0];
        return this.buildAttackProfile(comboProfile, { comboStep: clampedStep, source: 'main' });
    }
    
    attack({ fromBuffer = false } = {}) {
        const dualBladeEquipped = !!(
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流'
        );
        const dualBladeChainActive = !!(
            dualBladeEquipped &&
            (
                this.subWeaponAction === '二刀_Z' ||
                (this.currentSubWeapon.mainComboLinkTimer || 0) > 0
            )
        );
        if (!fromBuffer && this.attackCooldown > 0 && !dualBladeChainActive) return;

        // 4撃目（宙返り中）は特定進捗までキャンセルを禁止する
        if (this.isAttacking && this.currentAttack && this.currentAttack.comboStep === 4) {
            const duration = Math.max(1, this.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = clamp01(1 - (this.attackTimer / duration));
            // 宙返りの開始(0.42)から完了間際(0.98)までは他段への遷移をブロック
            if (progress > 0.42 && progress < 0.98) return;
        }

        this.comboStep1IdleTransitionTimer = 0;

        // 斬撃SEの再生タイミングを最速にする（入力直後）
        if (!(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流')) {
            const nextComboIndex = (this.attackCombo < this.getNormalComboMax()) ? this.attackCombo : 0;
            audio.playSlash(nextComboIndex);
        }

        this.attackBuffered = false;
        this.attackBufferTimer = 0;
        this.comboResetTimer = 0;
        this.comboStrictMiss = false;

        // 二刀装備時のZ攻撃は、二本で繋ぐ多方向コンボに置換
        if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
            if (this.subWeaponAction === '二刀_合体') return;
            if (this.isDualBladeZActionActive() && !this.isDualBladeNextSwingReady()) {
                this.bufferDualBladeNextSwing();
                return;
            }
            this.attackCooldown = PLAYER.ATTACK_COOLDOWN * 0.72;
            if (typeof this.currentSubWeapon.mainMotionSpeedScale === 'number') {
                // 二刀Zのみ通常より少し速くする（値が小さいほど速い）
                this.currentSubWeapon.mainMotionSpeedScale = Math.max(0.78, (this.attackMotionScale || 1) * 0.78);
            }
            this.currentSubWeapon.use(this, 'main');
            this.subWeaponTimer = this.currentSubWeapon.mainDuration || 190;
            this.subWeaponAction = '二刀_Z';
            this.subWeaponCrouchLock = this.isGrounded && (this.isCrouching || input.isAction('DOWN'));
            const step = this.currentSubWeapon.comboIndex || 0;
            const direction = this.facingRight ? 1 : -1;
            const wasGrounded = this.isGrounded;
            if (this.subWeaponCrouchLock) {
                this.vx *= 0.3;
            } else if (step === 1) {
                // 1段目: 左刀・袈裟斬り — 構えから軽く踏み出して振り下ろす
                this.vx = direction * this.speed * 0.32;
                if (wasGrounded) {
                    this.vy = 0;
                    this.isGrounded = true;
                }
            } else if (step === 2) {
                // 2段目: 右刀・逆袈裟 — 跳ね上げに合わせて軽く前進
                this.vx = direction * this.speed * 0.48;
                if (wasGrounded) {
                    this.vy = 0;
                    this.isGrounded = true;
                } else {
                    this.vy = Math.min(this.vy, -0.4);
                }
            } else if (step === 3) {
                // 3段目: 両手・交差薙ぎ — 深い踏み込みで前進、軽いホップ
                this.vx = direction * this.speed * 0.88;
                if (wasGrounded) {
                    this.vy = -0.6;
                    this.isGrounded = false;
                }
            } else if (step === 4) {
                // 四段: 並行切り上げで上昇
                this.vx = direction * this.speed * 0.92;
                if (wasGrounded) {
                    this.vy = -6.2;
                    this.isGrounded = false;
                } else {
                    this.vy = Math.min(this.vy, -5.1);
                }
            } else {
                // 五段: 叩きつけで落下
                this.vx = direction * this.speed * 0.22;
                this.vy = Math.min(this.vy, -1.8);
                this.isGrounded = false;
            }

            return;
        }
        
        // 通常の新規攻撃またはコンボスナップ開始処理
        this.freezeCurrentSlashTrail(); // Call the new method here
        this.isAttacking = true;
        // 1段目の時だけ先行する古い軌跡をクリアし、2段目以降は残像として重ねる
        if (this.attackCombo === 0 || this.attackCombo === this.getNormalComboMax()) {
            this.comboSlashTrailPoints.length = 0;
            // 凍結曲線はクリアしない - 自然フェードに任せる
        }
        this.comboSlashTrailSampleTimer = 0;
        if (Array.isArray(this.specialCloneSlashTrailPoints) && !this.specialCloneAutoAiEnabled) {
            for (let i = 0; i < this.specialCloneSlashTrailPoints.length; i++) {
                if (Array.isArray(this.specialCloneSlashTrailPoints[i])) {
                    this.specialCloneSlashTrailPoints[i].length = 0;
                }
            }
        }
        if (Array.isArray(this.specialCloneSlashTrailSampleTimers) && !this.specialCloneAutoAiEnabled) {
            for (let i = 0; i < this.specialCloneSlashTrailSampleTimers.length; i++) {
                this.specialCloneSlashTrailSampleTimers[i] = 0;
            }
        }
        if (Array.isArray(this.specialCloneSlashTrailBoostAnchors) && !this.specialCloneAutoAiEnabled) {
            for (let i = 0; i < this.specialCloneSlashTrailBoostAnchors.length; i++) {
                this.specialCloneSlashTrailBoostAnchors[i] = null;
            }
        }
        
        // コンボ
        const comboMax = this.getNormalComboMax();
        if (this.attackCombo < comboMax) {
            this.attackCombo++;
        } else {
            this.attackCombo = 1;
        }
        
        const comboProfile = COMBO_ATTACKS[this.attackCombo - 1];
        this.currentAttack = this.buildAttackProfile(comboProfile, { comboStep: this.attackCombo, source: 'main' });
        if (this.currentAttack && this.currentAttack.comboStep === 1) {
            const step1TrailSpec = this.buildComboFixedBezierTrailSpec({
                x: 0, // 相対座標で保持
                y: 0,
                width: this.width,
                height: this.height,
                facingRight: this.facingRight,
                isCrouching: this.isCrouching,
                attack: this.currentAttack
            }, [0.0, 0.48, 0.68]); // 始点を0.0にしてアイドル構えから開始させる
            if (step1TrailSpec) {
                Object.assign(this.currentAttack, step1TrailSpec);
                this.currentAttack.trailIsRelative = true; // 相対フラグを立てる
            }
        } else if (this.currentAttack && this.currentAttack.comboStep === 2) {
            const step2TrailSpec = this.buildComboFixedBezierTrailSpec({
                x: 0, // 相対座標で保持
                y: 0,
                width: this.width,
                height: this.height,
                facingRight: this.facingRight,
                isCrouching: this.isCrouching,
                attack: this.currentAttack
            }, [0.08, 0.46, 0.88]); // 終端サンプリングを深めにして終点を一致させる
            if (step2TrailSpec) {
                Object.assign(this.currentAttack, step2TrailSpec);
                this.currentAttack.trailIsRelative = true; // 相対フラグを立てる
            }
        } else if (this.currentAttack && this.currentAttack.comboStep === 4) {
            const step4TrailArc = this.buildComboStep4TrailArcSpec({
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
                facingRight: this.facingRight,
                isCrouching: this.isCrouching,
                attack: this.currentAttack,
                vx: this.vx,
                vy: this.vy,
                speed: this.speed
            });
            if (step4TrailArc) {
                Object.assign(this.currentAttack, step4TrailArc);
            }
        } else if (this.currentAttack && this.currentAttack.comboStep === 5) {
            const step5TrailSpec = this.buildComboStep5TrailSpec({
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
                facingRight: this.facingRight,
                isCrouching: this.isCrouching,
                attack: this.currentAttack,
                vx: this.vx,
                vy: this.vy,
                speed: this.speed
            });
            if (step5TrailSpec) {
                Object.assign(this.currentAttack, step5TrailSpec);
            }
        }
        this.attackTimer = this.currentAttack.durationMs;
        this.attackCooldown = Math.max(28, this.currentAttack.durationMs * this.currentAttack.cooldownScale);
        this.comboResetTimer = (this.currentAttack.chainWindowMs || 60) + 190;
        const direction = this.facingRight ? 1 : -1;
        const impulse = (this.currentAttack.impulse || 1) * this.speed;
        const step = this.currentAttack.comboStep;
        if (this.isCrouching) {
            this.vx = direction * impulse * 0.28;
        } else if (step === 1) {
            // 一段目は後方へ返す斬り。ジャンプせず地上寄りで繋ぐ
            const groundedAtStart = this.isGrounded;
            this.vx *= 0.12;
            if (Math.abs(this.vx) < 0.2) this.vx = 0;
            if (groundedAtStart) {
                this.vy = 0;
                this.isGrounded = true;
            } else {
                // 空中発動時も上方向へは伸びないようにする
                this.vy = Math.max(this.vy, -0.8);
            }
        } else if (step === 2) {
            // 二段目は一段終点から自然に繋ぐため、地上始動を優先
            this.vx = this.vx * 0.16 + direction * impulse * 0.9;
            if (this.isGrounded) {
                this.vy = 0;
                this.isGrounded = true;
            } else {
                this.vy = Math.min(this.vy, -1.2);
            }
        } else if (step === 3) {
            this.vx = this.vx * 0.12 + direction * impulse * 1.71;
            this.vy = Math.min(this.vy, -8.2);
            this.isGrounded = false;
        } else if (step === 4) {
            this.vx = this.vx * 0.24 + direction * impulse * 0.42;
            this.vy = Math.min(this.vy, -10.6);
            this.isGrounded = false;
        } else if (step === 5) {
            // 五段目: 頭上から水平に叩きつける落下技
            this.currentAttack.knockbackX = 16;
            this.currentAttack.knockbackY = -7;
            this.currentAttack.range = Math.max(this.currentAttack.range || 0, 128);
            this.finisherLandingSeparationTimer = Math.max(this.finisherLandingSeparationTimer, 700);
            this.finisherAirLockTimer = Math.max(this.finisherAirLockTimer, 2200);
            this.vx = this.vx * 0.18;
            this.vy = Math.max(this.vy, 3.4);
            this.isGrounded = false;
        }
        this.animState = this.currentAttack.type;
    }
    
    useSubWeapon() {
        if (this.currentSubWeapon) {
            this.currentSubWeapon.use(this);
        }
    }

    getSubWeaponActionDurationMs(actionName, weapon = this.currentSubWeapon) {
        const name = actionName || (weapon && weapon.name) || '';
        if (name === 'throw') {
            if (weapon && weapon.name === '火薬玉') return 72;
            return 50;
        }
        if (name === '二刀_合体') {
            const dual = (weapon && weapon.name === '二刀流') ? weapon : this.currentSubWeapon;
            return Math.max(
                1,
                Math.round(
                    (dual && Number.isFinite(dual.activeCombinedDuration) && dual.activeCombinedDuration > 0)
                        ? dual.activeCombinedDuration
                        : ((dual && Number.isFinite(dual.combinedDuration)) ? dual.combinedDuration : 800)
                )
            );
        }
        if (name === '二刀_Z') {
            const dual = (weapon && weapon.name === '二刀流') ? weapon : this.currentSubWeapon;
            return Math.max(1, Math.round((dual && Number.isFinite(dual.mainDuration)) ? dual.mainDuration : 204));
        }
        if (name === '大槍') {
            const spear = (weapon && weapon.name === '大槍') ? weapon : null;
            return Math.max(1, Math.round((spear && Number.isFinite(spear.attackDuration)) ? spear.attackDuration : 270));
        }
        if (name === '鎖鎌') {
            const kusa = (weapon && weapon.name === '鎖鎌') ? weapon : null;
            return Math.max(1, Math.round((kusa && Number.isFinite(kusa.totalDuration)) ? kusa.totalDuration : 560));
        }
        if (name === '大太刀') {
            const odachi = (weapon && weapon.name === '大太刀') ? weapon : null;
            return Math.max(1, Math.round((odachi && Number.isFinite(odachi.totalDuration)) ? odachi.totalDuration : 760));
        }
        return 300;
    }
    
    updateAttack(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const activeAttack = this.currentAttack;
        if (activeAttack) {
            const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const motionCapMs = activeAttack.comboStep === 4
                ? Math.min(deltaMs, 1000 / 58)
                : deltaMs;
            const prevMotionElapsed = Number.isFinite(activeAttack.motionElapsedMs) ? activeAttack.motionElapsedMs : 0;
            activeAttack.motionElapsedMs = Math.max(0, Math.min(duration, prevMotionElapsed + motionCapMs));
        }

        if (activeAttack && activeAttack.comboStep && this.isGrounded) {
            this.vx *= 0.965;
        }
        if (activeAttack && activeAttack.comboStep === 1 && this.attackTimer > 0) {
            const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
            const direction = this.facingRight ? 1 : -1;
            const wind = Math.max(0, Math.min(1, progress / 0.36));
            const swing = Math.max(0, Math.min(1, (progress - 0.36) / 0.64));
            const swingEase = swing * swing * (3 - 2 * swing);
            // 1撃目は「返し斬り」だけ行い、後方ステップはさせない
            const targetVx = 0;
            this.vx = this.vx * 0.62 + targetVx * 0.38;
            if (this.vx * direction < 0) this.vx = 0;
            if (Math.abs(this.vx) < 0.18) this.vx = 0;
            if (this.isGrounded) {
                this.vy = 0;
            } else {
                this.vy = Math.max(this.vy, 1.2);
            }
        } else if (activeAttack && activeAttack.comboStep === 4 && this.attackTimer > 0) {
            const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = Number.isFinite(activeAttack.motionElapsedMs)
                ? Math.max(0, Math.min(1, activeAttack.motionElapsedMs / duration))
                : Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
            const direction = this.facingRight ? 1 : -1;
            const z4HeightScale = 0.96;

            // 四段目: 高く切り上げた後、頭の高さを維持しながら宙返りして5段目へ
            if (progress < 0.42) {
                const t = progress / 0.42;
                this.vx = this.vx * 0.52 + direction * this.speed * (0.2 - t * 0.08);
                this.vy = (-20.4 + t * 2.6) * z4HeightScale;
            } else if (progress < 0.9) {
                const t = (progress - 0.42) / 0.48;
                const backSpeed = this.speed * (0.66 + t * 0.94);
                // 宙返り中は高度を維持しつつ、わずかに上下して自然な重心移動を出す
                const holdVy = (-0.9 + t * 1.18) * z4HeightScale;
                this.vx = this.vx * 0.4 + (-direction * backSpeed) * 0.6;
                this.vy = holdVy;
                this.vy = Math.max(-1.0, Math.min(0.95, this.vy));
            } else {
                this.vx *= 0.78;
                this.vy = Math.min(this.vy, 0.55);
            }
            // ヒット時の負荷やノックバック干渉で上昇が潰れないよう、4段目前半は上昇速度を強力に補正
            if (progress < 0.72) {
                const riseLockT = Math.max(0, Math.min(1, progress / 0.72));
                const minRiseVy = (-18.8 + riseLockT * 14.8) * z4HeightScale;
                this.vy = Math.min(this.vy, minRiseVy);
                // 上昇中は接地判定を強制解除
                this.isGrounded = false;
            }
            this.isGrounded = false;
        } else if (activeAttack && activeAttack.comboStep === 5 && (this.attackTimer > 0 || !this.isGrounded)) {
            const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
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
                if (activeAttack && activeAttack.trailCurveFrozen !== true) {
                    if (Number.isFinite(activeAttack.trailCurveEndX) && Number.isFinite(activeAttack.trailCurveEndY)) {
                        const slashFloorY = (this.groundY + LANE_OFFSET) - Math.max(10, this.height * 0.1);
                        const frozenEndY = Math.min(activeAttack.trailCurveEndY, slashFloorY);
                        activeAttack.trailCurveEndY = frozenEndY;
                        activeAttack.trailCurveControlY = Math.min(activeAttack.trailCurveControlY, frozenEndY);
                        activeAttack.trailCurveFrozen = true;
                        if (Array.isArray(this.comboSlashTrailPoints)) {
                            for (let i = 0; i < this.comboSlashTrailPoints.length; i++) {
                                const p = this.comboSlashTrailPoints[i];
                                if (!p || (p.step || 0) !== 5) continue;
                                p.trailCurveEndX = activeAttack.trailCurveEndX;
                                p.trailCurveEndY = frozenEndY;
                                p.trailCurveControlX = activeAttack.trailCurveControlX;
                                p.trailCurveControlY = Math.min(activeAttack.trailCurveControlY, frozenEndY);
                            }
                        }
                    }
                }
            }
        }
        this.attackTimer -= deltaMs;

        // 通常コンボはモーション完了前のキャンセル遷移を厳格に制限（4段目の宙返りなどを完遂させる）
        if (this.attackTimer <= deltaMs + 0.001) {
            const minCompletion = (activeAttack && activeAttack.comboStep === 4) ? 0.99 : 0.98;
            const duration = Math.max(1, activeAttack?.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = Number.isFinite(activeAttack?.motionElapsedMs) 
                ? activeAttack.motionElapsedMs / duration 
                : 1.0;
            if (progress < minCompletion) {
                this.attackTimer = deltaMs + 1;
                return;
            }
        }

        if (this.attackTimer <= 0) {
            if (
                activeAttack &&
                activeAttack.comboStep === 4 &&
                Number.isFinite(activeAttack.motionElapsedMs)
            ) {
                const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                if (activeAttack.motionElapsedMs < duration - 0.5) {
                    this.attackTimer = 1;
                    return;
                }
            }
            if (
                activeAttack &&
                activeAttack.comboStep === this.getNormalComboMax() &&
                !this.isGrounded &&
                this.finisherAirLockTimer > 0
            ) {
                // 5段目は着地するまで継続（空中で途切れない）
                this.attackTimer = 1;
                return;
            }
            this.isAttacking = false;
            // 攻撃終了時: 全段の軌跡を凍結スナップショットとして保存
            if (activeAttack && activeAttack.comboStep >= 1) {
                const stepNum = activeAttack.comboStep;
                // 現在の段に属するポイントを収集
                const stepPoints = this.comboSlashTrailPoints.filter(p => (p.step || 0) === stepNum);
                
                if ([1, 2, 5].includes(stepNum)) {
                    // ベジェ曲線段: パラメータを保存
                    const lastPt = stepPoints.length > 0 ? stepPoints[stepPoints.length - 1] : null;
                    if (lastPt && Number.isFinite(lastPt.trailCurveStartX)) {
                        this.comboSlashTrailFrozenCurves.push({
                            type: 'bezier',
                            step: stepNum,
                            trailCurveStartX: lastPt.trailCurveStartX,
                            trailCurveStartY: lastPt.trailCurveStartY,
                            trailCurveControlX: lastPt.trailCurveControlX,
                            trailCurveControlY: lastPt.trailCurveControlY,
                            trailCurveEndX: lastPt.trailCurveEndX,
                            trailCurveEndY: lastPt.trailCurveEndY,
                            trailRadius: lastPt.trailRadius,
                            centerX: lastPt.centerX,
                            centerY: lastPt.centerY,
                            dir: lastPt.dir,
                            progress: lastPt.progress,
                            trailIsRelative: !!activeAttack.trailIsRelative,
                            playerX: this.x,
                            playerY: this.y,
                            age: 0,
                            life: this.comboSlashTrailActiveLifeMs,
                            trailCurveFrozen: !!activeAttack.trailCurveFrozen
                        });
                    }
                } else {
                    // リニア/アーク段(3, 4など): ポイント配列のコピーを保存
                    if (stepPoints.length >= 2) {
                        const footX = this.getFootX ? this.getFootX() : (this.x + this.width * 0.5);
                        const footY = this.getFootY ? this.getFootY() : (this.y + this.height);
                        this.comboSlashTrailFrozenCurves.push({
                            type: 'points',
                            step: stepNum,
                            // 絶対座標で保存（スケール補正は描画時に行う）
                            frozenPoints: stepPoints.map(p => ({ ...p, age: 0 })),
                            // 凍結時の足元座標（スケール補正用）
                            frozenFootX: footX,
                            frozenFootY: footY,
                            age: 0,
                            life: this.comboSlashTrailActiveLifeMs
                        });
                    }
                }
            }
            if (activeAttack && activeAttack.comboStep <= this.getNormalComboMax()) {
                const pauseMs = 180; // 完全静止の余韻
                const returnMs = 100; // その後の戻りアニメーション
                this.comboStep5IdleTransitionTimer = pauseMs + returnMs;
                this.comboStep5RecoveryAttack = { ...activeAttack };
            }
            this.currentAttack = null;
            this.finisherAirLockTimer = 0;
            if (activeAttack && activeAttack.comboStep === 1) {
                // 1撃目終了直後の脚遷移用既存ロジック
                this.comboStep1IdleTransitionTimer = Math.max(this.comboStep1IdleTransitionTimer, 180);
                this.vx *= 0.22;
            }
            if (activeAttack && activeAttack.comboStep >= this.getNormalComboMax()) {
                this.comboStrictMiss = false;
                this.comboResetTimer = 0;
                // 5→1のコンボループ: バッファ攻撃があればコンボをリセットして継続
                this.attackCombo = 0;
                if (this.attackBuffered && this.attackBufferTimer > 0) {
                    this.attackBuffered = false;
                    this.attackBufferTimer = 0;
                    this.attack({ fromBuffer: true });
                    return;
                }
                this.attackBuffered = false;
                this.attackBufferTimer = 0;
                return;
            }
            if (this.attackBuffered && this.attackBufferTimer > 0) {
                this.attackBuffered = false;
                this.attackBufferTimer = 0;
                this.attack({ fromBuffer: true });
                return;
            }
            const lingerMs = activeAttack ? (activeAttack.chainWindowMs || 60) : 60;
            this.comboResetTimer = Math.max(this.comboResetTimer, 210 + lingerMs);
        }
    }

    updateDualBladeComboMotion(deltaTime) {
        if (
            !this.currentSubWeapon ||
            this.currentSubWeapon.name !== '二刀流' ||
            this.subWeaponAction !== '二刀_Z' ||
            this.subWeaponTimer <= 0 ||
            typeof this.currentSubWeapon.getMainSwingPose !== 'function' ||
            this.subWeaponCrouchLock
        ) {
            return;
        }

        const pose = this.currentSubWeapon.getMainSwingPose();
        const step = pose.comboIndex || 0;
        const p = Math.max(0, Math.min(1, pose.progress || 0));
        const direction = this.facingRight ? 1 : -1;
        const lerpRate = Math.max(0.08, Math.min(0.42, deltaTime * 13));
        const blend = (current, target) => current + (target - current) * lerpRate;

        if (step === 1) {
            // 1撃目: 前のめりにならないよう、移動は最小限に抑える
            const targetVx = direction * this.speed * (0.04 + Math.sin(p * Math.PI) * 0.12);
            this.vx = blend(this.vx, targetVx);
            if (!this.isGrounded) {
                this.vy = blend(this.vy, p < 0.5 ? -0.2 : 0.8);
            }
        } else if (step === 2) {
            // 2撃目: 引いて溜め、腰を返して前後へ打ち分ける
            let targetVx;
            if (p < 0.18) {
                targetVx = -direction * this.speed * (0.22 + p * 0.3);
            } else if (p < 0.54) {
                targetVx = direction * this.speed * (0.18 + (p - 0.18) * 1.34);
            } else {
                targetVx = direction * this.speed * (0.66 - (p - 0.54) * 1.18);
            }
            this.vx = blend(this.vx, targetVx);
            if (!this.isGrounded) {
                this.vy = blend(this.vy, p < 0.42 ? -1.0 : 2.6);
            }
        } else if (step === 3) {
            // 3撃目: クロスステップでしっかり前へ抜ける
            let targetVx;
            if (p < 0.14) {
                targetVx = -direction * this.speed * (0.34 - p * 0.2);
            } else if (p < 0.34) {
                targetVx = direction * this.speed * (0.16 + (p - 0.14) * 2.4);
            } else if (p < 0.8) {
                targetVx = direction * this.speed * (0.64 + (p - 0.34) * 1.9);
            } else {
                targetVx = direction * this.speed * (1.52 - (p - 0.8) * 2.6);
            }
            this.vx = blend(this.vx, targetVx);
            if (this.isGrounded) {
                this.vy = 0;
            } else {
                this.vy = Math.max(this.vy, 1.8);
            }
        } else if (step === 4) {
            // 4撃目: 3撃目の前進からそのまま切り上げへ接続
            let targetVx;
            if (p < 0.68) {
                const t = p / 0.68;
                targetVx = direction * this.speed * (0.72 + t * 0.2);
                this.vy = this.vy * 0.42 + (-15.2 + t * 6.2) * 0.58;
            } else {
                const t = (p - 0.68) / 0.32;
                targetVx = direction * this.speed * (0.92 - t * 0.58);
                this.vy = this.vy * 0.56 + (-3.8 + t * 3.6) * 0.44;
                if (p > 0.82) {
                    this.vy = Math.min(this.vy, 0.65);
                }
            }
            this.vx = blend(this.vx, targetVx);
            this.isGrounded = false;
        } else {
            // 五段: 海老反りクロスから叩きつけ着地
            if (p < 0.24) {
                const t = p / 0.24;
                this.vx = blend(this.vx, direction * this.speed * 0.2);
                // 4段目ラスト高度を維持してから振り下ろす
                this.vy = Math.min(this.vy, -2.4 + t * 1.0);
            } else if (p < 0.78) {
                const dive = (p - 0.24) / 0.54;
                this.vx = blend(this.vx, direction * this.speed * (0.36 + dive * 0.46));
                this.vy = Math.max(this.vy, 9.0 + dive * 20.6);
            } else {
                const t = (p - 0.78) / 0.22;
                this.vx = blend(this.vx, direction * this.speed * (0.8 - t * 0.56));
                this.vy = Math.max(this.vy, 20.4 - t * 4.4);
            }
            if (this.isGrounded && p > 0.58) {
                this.vx *= 0.5;
            }
        }

        // 二刀コンボ中に上空へ登り続けないよう上昇量を制限
        const dualRiseCap = step === 4 ? -17.2 : -15.4;
        this.vy = Math.max(this.vy, dualRiseCap);
        const liftFromGround = this.groundY - (this.y + this.height);
        const dualLiftLimit = step === 4 ? 174 : 154;
        if (liftFromGround > dualLiftLimit && this.vy < -0.4) {
            this.vy *= 0.52;
        }
        if (step === 0 && p > 0.84 && !this.isGrounded) {
            this.vy = Math.max(this.vy, 22.2);
        }
    }

    useSpecial() {
        if (this.specialGauge < this.maxSpecialGauge) return;
        if (this.isUsingSpecial) {
            this.clearSpecialState(true);
        }
        
        this.isUsingSpecial = true;
        this.specialCastTimer = this.specialCastDurationMs;
        this.specialCloneCombatStarted = false;
        this.specialCloneAlive = this.specialCloneSlots.map(() => true);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => this.specialCastDurationMs + this.specialCloneSpawnInvincibleMs);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 40);
        const cloneDurability = this.getSpecialCloneDurabilityPerUnit();
        this.specialCloneDurability = this.specialCloneSlots.map(() => cloneDurability);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);

        const cloneAnchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
        this.specialClonePositions = cloneAnchors.map(a => ({ x: a.x, y: a.y, facingRight: this.facingRight, prevX: a.x }));
        this.specialCloneScarfNodes = this.specialCloneSlots.map(() => null);
        this.specialCloneHairNodes = this.specialCloneSlots.map(() => null);
        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            this.initCloneAccessoryNodes(i);
        }

        this.spawnSpecialSmoke('appear', this.getSpecialSmokeAnchors(true));

        this.specialGauge = 0;
        this.animState = ANIM_STATE.SPECIAL;
        audio.playSpecial();
    }

    clearSpecialState(clearSmoke = true) {
        this.isUsingSpecial = false;
        this.specialCastTimer = 0;
        this.specialCloneCombatStarted = false;
        this.specialCloneAlive = this.specialCloneSlots.map(() => false);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map(() => 0);
        this.specialCloneDurability = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
        if (clearSmoke) this.specialSmoke = [];
    }
    
    updateSpecial(deltaTime) {
        const deltaMs = deltaTime * 1000;
        if (this.isUsingSpecial) {
            if (this.specialCastTimer > 0) {
                const previousCastTimer = this.specialCastTimer;
                this.specialCastTimer = Math.max(0, this.specialCastTimer - deltaMs);
                this.invincibleTimer = Math.max(this.invincibleTimer, 120);
                if (previousCastTimer > 0 && this.specialCastTimer <= 0 && !this.specialCloneCombatStarted) {
                    this.onSpecialCloneStarted();
                }

                // 詠唱中は全レベル共通でノードを追従させる（Lv3も含む）
                const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
                for (let i = 0; i < this.specialCloneSlots.length; i++) {
                    const pos = this.specialClonePositions[i];
                    if (!pos) continue;

                    pos.x = anchors[i].x;
                    pos.y = anchors[i].y;
                    pos.facingRight = anchors[i].facingRight;
                    pos.prevX = pos.x; // prevXも同期して速度計算の暴走を防ぐ

                    this.updateSpecialCloneAccessoryNodes(i, pos, deltaTime, {
                        cloneVx: this.vx,
                        motionTime: this.motionTime,
                        isMoving: Math.abs(this.vx) > 0.5 || !this.isGrounded,
                        drawX: pos.x - this.width * 0.5,
                        footY: this.getSpecialCloneFootY(pos.y),
                        height: this.height,
                        isDashing: this.isDashing,
                        isCrouching: this.isCrouching,
                        legPhase: this.legPhase || this.motionTime * 0.012
                    });
                }
            } else {
                if (!this.specialCloneCombatStarted) {
                    this.onSpecialCloneStarted();
                }
            }
            
            // 無敵時間とクールダウンの更新
            for (let index = 0; index < this.specialCloneInvincibleTimers.length; index++) {
                if (this.specialCloneInvincibleTimers[index] > 0) {
                    this.specialCloneInvincibleTimers[index] = Math.max(0, this.specialCloneInvincibleTimers[index] - deltaMs);
                }
            }
            for (let index = 0; index < this.specialCloneAutoCooldowns.length; index++) {
                if (this.specialCloneAutoCooldowns[index] > 0) {
                    this.specialCloneAutoCooldowns[index] = Math.max(0, this.specialCloneAutoCooldowns[index] - deltaMs);
                }
            }

            // 座標更新
            if (this.specialCloneAutoAiEnabled && this.specialCloneCombatStarted) {
                this.updateSpecialCloneAi(deltaTime);
            } else if (this.specialCloneCombatStarted) {
                // Lv1〜2: 本体に追従
                const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
                for (let i = 0; i < this.specialCloneSlots.length; i++) {
                    if (this.specialClonePositions[i]) {
                        this.specialClonePositions[i].x = anchors[i].x;
                        this.specialClonePositions[i].y = anchors[i].y;
                        this.specialClonePositions[i].facingRight = anchors[i].facingRight;

                        const pos = this.specialClonePositions[i];
                        this.updateSpecialCloneAccessoryNodes(i, pos, deltaTime, {
                            cloneVx: this.vx,
                            motionTime: this.motionTime,
                            isMoving: Math.abs(this.vx) > 0.5 || !this.isGrounded,
                            drawX: pos.x - this.width * 0.5,
                            footY: this.getSpecialCloneFootY(pos.y),
                            height: this.height,
                            isDashing: this.isDashing,
                            isCrouching: this.isCrouching,
                            legPhase: this.legPhase || this.motionTime * 0.012
                        });
                    }
                }
            }
        }

        if (this.isUsingSpecial) {
            this.updateSpecialCloneSlashTrails(deltaMs);
        }

        for (const puff of this.specialSmoke) {
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
        this.specialSmoke = this.specialSmoke.filter((puff) => puff.life > 0);
    }

    triggerCloneAttack(index) {
        if (this.specialCloneAttackTimers[index] <= 0 && this.specialCloneSubWeaponTimers[index] <= 0) {
            if (Array.isArray(this.specialCloneSlashTrailPoints) && Array.isArray(this.specialCloneSlashTrailPoints[index])) {
                this.specialCloneSlashTrailPoints[index].length = 0;
            }
            if (Array.isArray(this.specialCloneSlashTrailSampleTimers)) {
                this.specialCloneSlashTrailSampleTimers[index] = 0;
            }
            if (Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                this.specialCloneSlashTrailBoostAnchors[index] = null;
            }
            if (
                this.specialCloneAutoAiEnabled &&
                this.currentSubWeapon &&
                this.currentSubWeapon.name === '二刀流' &&
                typeof this.currentSubWeapon.getMainDurationByStep === 'function'
            ) {
                const nextComboIndex = ((this.specialCloneComboSteps[index] || 0) + 1) % 5;
                const dualDuration = Math.max(1, this.currentSubWeapon.getMainDurationByStep(nextComboIndex));
                this.specialCloneComboSteps[index] = nextComboIndex;
                this.specialCloneAttackTimers[index] = dualDuration;
                this.specialCloneSubWeaponTimers[index] = dualDuration;
                this.specialCloneSubWeaponActions[index] = '二刀_Z';
                return;
            }
            const nextIndex = ((this.specialCloneComboSteps[index] || 0) + 1) % COMBO_ATTACKS.length;
            const nextStep = nextIndex + 1;
            const profile = this.getComboAttackProfileByStep(nextStep);
            this.specialCloneAttackTimers[index] = profile.durationMs;
            this.specialCloneComboSteps[index] = nextIndex;
        }
    }

    triggerCloneSubWeapon(index) {
        // Lv3（自律AI）の分身は外部からのサブ武器発動を無視
        if (this.specialCloneAutoAiEnabled) return;

        if (!this.currentSubWeapon || this.specialCloneSubWeaponTimers[index] > 0 || this.specialCloneAttackTimers[index] > 0) return;
        
        const weaponName = this.currentSubWeapon.name;
        this.specialCloneSubWeaponTimers[index] = this.getSubWeaponActionDurationMs(
            weaponName === '火薬玉' ? 'throw' : weaponName,
            this.currentSubWeapon
        );
        this.specialCloneSubWeaponActions[index] = weaponName === '火薬玉' ? 'throw' : weaponName;
    }

    onSpecialCloneStarted() {
        this.specialCloneCombatStarted = true;
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => this.specialCloneSpawnInvincibleMs);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 30);
        
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
        this.specialClonePositions = anchors.map(a => ({
            x: a.x,
            y: a.y,
            facingRight: this.facingRight,
            prevX: a.x,
            jumping: false,
            cloneVy: 0
        }));

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneScarfNodes[i] || !this.specialCloneHairNodes[i]) {
                this.initCloneAccessoryNodes(i);
            }
        }
        this.specialCloneTargets = this.specialCloneSlots.map(() => null);
        this.specialCloneReturnToAnchor = this.specialCloneSlots.map(() => false);
        this.specialCloneComboSteps = this.specialCloneSlots.map(() => 0);
        this.specialCloneAttackTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponActions = this.specialCloneSlots.map(() => null);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);

        // 戦闘開始時の煙もここでは生成せず、詠唱開始時のみに集約するか、
        // 少なくとも重複は避ける。詠唱終了時の煙は削除。
        // this.spawnSpecialSmoke('appear', this.getSpecialSmokeAnchors(true));
        
        // 分身の霧エフェクト軽量化用キャッシュ（オフスクリーンCanvas）
        this.initMistCache();
    }

    initMistCache() {
        if (this.mistCacheCanvas) return;
        const size = 68; // 半径34 * 2
        this.mistCacheCanvas = document.createElement('canvas');
        this.mistCacheCanvas.width = size;
        this.mistCacheCanvas.height = size;
        const ctx = this.mistCacheCanvas.getContext('2d');
        const mist = ctx.createRadialGradient(size/2, size/2, 2, size/2, size/2, size/2);
        // 白・淡青のミスト（描画時にalphaをかけるためベースは不透明に近くする）
        mist.addColorStop(0, 'rgba(180, 214, 246, 1.0)');
        mist.addColorStop(1, 'rgba(180, 214, 246, 0.0)');
        ctx.fillStyle = mist;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
        ctx.fill();
    }

    getSpecialSmokeAnchorByIndex(index) {
        const pos = this.specialClonePositions[index];
        const x = pos ? pos.x : (this.x + this.width / 2);
        const y = (
            this.specialCloneAutoAiEnabled &&
            this.specialCloneCombatStarted &&
            pos
        )
            ? pos.y
            : (this.y + this.height * 0.5);
        return { x, y };
    }

    getSpecialSmokeAnchors(onlyAlive = false) {
        const anchors = [];
        if (Array.isArray(this.specialCloneSlots) && this.specialCloneSlots.length > 0) {
            for (let i = 0; i < this.specialCloneSlots.length; i++) {
                if (onlyAlive && Array.isArray(this.specialCloneAlive) && this.specialCloneAlive.length > i && !this.specialCloneAlive[i]) continue;
                anchors.push(this.getSpecialSmokeAnchorByIndex(i));
            }
        }
        if (anchors.length > 0) return anchors;
        return [{ x: this.x + this.width * 0.5, y: this.y + this.height * 0.5 }];
    }

    initCloneAccessoryNodes(index) {
        const pos = this.specialClonePositions[index];
        if (!pos) return;

        // 詠唱中（specialCastTimer > 0）はLv3も本体に追従するため、本体の足元基準で初期化する。
        // 戦闘開始後のLv3はpos.yが地面基準固定値なのでそちらから算出。
        // Lv0〜2はthis.yがしゃがみ時にheight=HEIGHT/2分ずれるため、足元(this.y+this.height)から逆算。
        const isCastPhase = this.specialCastTimer > 0;
        const footY = (this.specialCloneAutoAiEnabled && !isCastPhase)
            ? (pos.y + PLAYER.HEIGHT * 0.38)  // Lv3戦闘中: pos.yは体中心なので足元を算出
            : (this.y + this.height);           // 詠唱中 or Lv0〜2: 本体の足元を使用
        const baseDrawY = footY - PLAYER.HEIGHT;
        const headY = baseDrawY + 16; // renderModel / renderSpecialCastPose の headY に合わせる

        const knotOffsetX = pos.facingRight ? -12 : 12;
        const anchorX = pos.x + knotOffsetX;
        const anchorY = headY - 2;

        const scarfNodes = [];
        const hairNodes = [];
        for (let i = 0; i < 9; i++) {
            // 全ノードをアンカー位置で束ねて初期化（初フレームに地面へ飛ばないよう）
            scarfNodes.push({ x: anchorX, y: anchorY });
            if (i < 8) {
                hairNodes.push({ x: anchorX, y: anchorY - 6 });
            }
        }
        this.specialCloneScarfNodes[index] = scarfNodes;
        this.specialCloneHairNodes[index] = hairNodes;
    }

    updateSpecialCloneAi(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const scrollX = (window.game && window.game.scrollX) || 0;
        const screenWidth = 1280;
        const stage = (window.game && window.game.stage) ? window.game.stage : null;
        const stageObstacles = (stage && Array.isArray(stage.obstacles)) ? stage.obstacles : [];
        const stageHazards = [];
        if (stage) {
            if (Array.isArray(stage.traps)) stageHazards.push(...stage.traps);
            if (stageObstacles.length > 0) {
                for (const obs of stageObstacles) {
                    if (obs && !obs.isDestroyed) stageHazards.push(obs);
                }
            }
        }

        // スクロール速度を算出（カメラが動いた分だけ分身も見かけ上移動している）
        // this.vxはピクセル/フレーム単位なので、scrollDeltaをフレーム換算(÷deltaTime÷60)して合わせる
        const prevScrollX = (this._prevScrollX !== undefined) ? this._prevScrollX : scrollX;
        const scrollDeltaPx = scrollX - prevScrollX; // 今フレームのスクロール量（ピクセル）
        const scrollVxPerFrame = (deltaTime > 0) ? scrollDeltaPx / (deltaTime * 60) : 0;
        this._prevScrollX = scrollX;
        
        const enemies = stage
            ? stage.getAllEnemies().filter(e => {
                if (!e.isAlive || e.isDying) return false;
                const ex = e.x + e.width / 2;
                return ex >= scrollX - 50 && ex <= scrollX + screenWidth + 50;
            }) 
            : [];
            
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneAlive[i]) continue;
            
            const pos = this.specialClonePositions[i];
            const anchor = anchors[i];
            const cloneRestY = anchor.y;
            const prevY = pos.y;

            const frameStartX = pos.x;

            let target = this.specialCloneTargets[i];

            if (!target || !target.isAlive || target.isDying) {
                target = this.findNearestEnemy(pos.x, pos.y, enemies, 500);
                this.specialCloneTargets[i] = target;
            }

            const anchorDist = Math.abs(anchor.x - pos.x);
            if (target && anchorDist > 300) {
                target = null;
                this.specialCloneTargets[i] = null;
            }

            if (target) {
                const attackRange = 120;
                const targetX = target.x + target.width / 2;
                const dx = targetX - pos.x;
                const distX = Math.abs(dx);
                if (distX > attackRange * 1.5) {
                    const speed = (this.speed || 5) * 1.55;
                    pos.x += Math.sign(dx) * speed * deltaTime * 60;
                    pos.facingRight = dx > 0;
                } else {
                    pos.facingRight = dx > 0;
                    const canAttack = this.specialCloneAttackTimers[i] <= 0
                        && this.specialCloneSubWeaponTimers[i] <= 0;
                    if (canAttack) {
                        const subWeapon = this.currentSubWeapon;
                        const tier = (typeof resolveSubWeaponEnhanceTier === 'function') 
                            ? resolveSubWeaponEnhanceTier(this, subWeapon.enhanceTier) 
                            : 0;
                        const isOdachi = subWeapon && subWeapon.name === '大太刀';
                        const odachiRate = isOdachi ? 0.7 : 1.0;

                        this.triggerCloneAttack(i);
                        
                        // 奥義（忍術）の追加発動
                        const weaponName = subWeapon ? subWeapon.name : '';
                        const direction = pos.facingRight ? 1 : -1;
                        if (tier >= 1 && weaponName !== '火薬玉' && Math.random() < odachiRate) {
                            this.useNinjutsu(i, weaponName, direction);
                        }
                    }
                }
                this.specialCloneReturnToAnchor[i] = false;
            } else {
                const dx = anchor.x - pos.x;
                if (Math.abs(dx) > 300) {
                    pos.x = anchor.x;
                    pos.facingRight = this.facingRight;
                    this.initCloneAccessoryNodes(i);
                } else if (Math.abs(dx) > 2) {
                    const chaseSpeed = Math.max(
                        (this.speed || 5) * 2.0,
                        Math.abs(dx) / Math.max(0.016, deltaTime) * 0.7
                    );
                    const step = Math.sign(dx) * Math.min(Math.abs(dx), chaseSpeed * deltaTime * 60);
                    pos.x += step;
                    if (Math.abs(dx) > 6) {
                        pos.facingRight = dx > 0;
                    }
                } else {
                    pos.x = anchor.x;
                    pos.facingRight = this.facingRight;
                }
                this.specialCloneReturnToAnchor[i] = true;
            }

            // Lv3分身の通常Zコンボは本体同様にアクロバットな軌道で動かす
            const cloneAttackTimerMs = this.specialCloneAttackTimers[i] || 0;
            const cloneSubTimerMs = this.specialCloneSubWeaponTimers[i] || 0;
            const cloneSubAction = this.specialCloneSubWeaponActions[i] || null;
            const cloneDualZActive = cloneSubAction === '二刀_Z' && cloneSubTimerMs > 0;
            if (cloneAttackTimerMs > 0 && !cloneDualZActive) {
                const comboStep = ((this.specialCloneComboSteps[i] || 0) % COMBO_ATTACKS.length) + 1;
                const attackProfile = this.getComboAttackProfileByStep(comboStep);
                const durationMs = Math.max(1, attackProfile.durationMs || PLAYER.ATTACK_COOLDOWN);
                const progress = Math.max(0, Math.min(1, 1 - (cloneAttackTimerMs / durationMs)));
                const direction = pos.facingRight ? 1 : -1;
                const baseSpeed = Math.max(1, this.speed || PLAYER.SPEED || 5);
                let moveVx = 0;
                let forceAirborne = false;

                if (comboStep === 1) {
                    const wind = Math.max(0, Math.min(1, progress / 0.36));
                    const swing = Math.max(0, Math.min(1, (progress - 0.36) / 0.64));
                    const swingEase = swing * swing * (3 - 2 * swing);
                    moveVx = direction * baseSpeed * (0.16 + wind * 0.18 + swingEase * 0.24);
                    if (!pos.jumping) pos.cloneVy = 0;
                } else if (comboStep === 2) {
                    const prep = Math.max(0, Math.min(1, progress / 0.42));
                    moveVx = direction * baseSpeed * (0.24 + prep * 0.3);
                    if (!pos.jumping) pos.cloneVy = 0;
                } else if (comboStep === 3) {
                    const arc = Math.sin(progress * Math.PI);
                    moveVx = direction * baseSpeed * (0.63 + arc * 0.33);
                    pos.cloneVy = Math.min(pos.cloneVy || 0, -8.8 + progress * 1.9);
                    forceAirborne = true;
                } else if (comboStep === 4) {
                    const z4HeightScale = 0.84;
                    if (progress < 0.42) {
                        const t = progress / 0.42;
                        moveVx = direction * baseSpeed * (0.26 - t * 0.18);
                        pos.cloneVy = (pos.cloneVy || 0) * 0.5 + ((-15.8 + t * 4.6) * z4HeightScale) * 0.5;
                    } else if (progress < 0.9) {
                        const t = (progress - 0.42) / 0.48;
                        const backSpeed = baseSpeed * (0.6 + t * 0.9);
                        const flipVy = (-6.2 + t * 15.4) * z4HeightScale;
                        moveVx = -direction * backSpeed;
                        pos.cloneVy = (pos.cloneVy || 0) * 0.45 + flipVy * 0.55;
                    } else {
                        moveVx = direction * baseSpeed * 0.08;
                    }
                    forceAirborne = true;
                } else if (comboStep === 5) {
                    if (progress < 0.26) {
                        moveVx = direction * baseSpeed * 0.04;
                        pos.cloneVy = Math.min(pos.cloneVy || 0, -1.2);
                    } else if (progress < 0.76) {
                        const fallT = (progress - 0.26) / 0.5;
                        moveVx = direction * baseSpeed * 0.05;
                        pos.cloneVy = (pos.cloneVy || 0) * 0.58 + (6.5 + fallT * 15.5) * 0.42;
                    } else {
                        moveVx = direction * baseSpeed * 0.03;
                    }
                    forceAirborne = true;
                }

                pos.x += moveVx * deltaTime * 60;
                if (forceAirborne) {
                    pos.jumping = true;
                }
            }

            // Lv3分身の自律ジャンプ（トラップ＋障害物回避）
            if (!pos.jumping) pos.jumping = false;
            if (!pos.cloneVy) pos.cloneVy = 0;

            let shouldJump = false;
            if (stageHazards.length > 0) {
                const frameDx = pos.x - frameStartX;
                const moveDir = Math.abs(frameDx) > 0.5 ? Math.sign(frameDx) : (pos.facingRight ? 1 : -1);

                const cloneHalfW = this.width * 0.4;
                for (const hazard of stageHazards) {
                    if (!hazard || hazard.x === undefined) continue;

                    const hLeft = hazard.x;
                    const hRight = hazard.x + (hazard.width || 30);
                    const hTop = (hazard.y !== undefined) ? hazard.y : (this.groundY - (hazard.height || 30));
                    const hBottom = hTop + (hazard.height || 30);

                    if (hBottom < this.groundY - 60) continue;

                    const cloneCenterX = pos.x;
                    const lookAhead = 120;
                    let isAhead = false;
                    if (moveDir > 0) {
                        isAhead = hLeft > (cloneCenterX - cloneHalfW) && hLeft < (cloneCenterX + lookAhead);
                    } else {
                        isAhead = hRight < (cloneCenterX + cloneHalfW) && hRight > (cloneCenterX - lookAhead);
                    }

                    if (!isAhead) continue;

                    const cloneFootY = pos.y + PLAYER.HEIGHT * 0.38;
                    if (hTop < cloneFootY) {
                        shouldJump = true;
                        break;
                    }
                }
            }

            if (shouldJump && !pos.jumping) {
                pos.jumping = true;
                pos.cloneVy = -12;
            }

            if (pos.jumping) {
                pos.cloneVy += 0.6;
                pos.y += pos.cloneVy * deltaTime * 60;
                if (pos.y >= cloneRestY) {
                    pos.y = cloneRestY;
                    pos.jumping = false;
                    pos.cloneVy = 0;
                }
            } else {
                pos.y = cloneRestY;
            }

            if (stageObstacles.length > 0) {
                for (const obs of stageObstacles) {
                    if (!obs || obs.isDestroyed || obs.x === undefined) continue;
                    const obsLeft = obs.x;
                    const obsRight = obs.x + (obs.width || 30);
                    const obsTop = (obs.y !== undefined) ? obs.y : (this.groundY - (obs.height || 30));
                    const obsBottom = obsTop + (obs.height || 30);

                    const cloneHalfW = this.width * 0.4;
                    const cloneLeft = pos.x - cloneHalfW;
                    const cloneRight = pos.x + cloneHalfW;
                    const cloneDrawY = this.getSpecialCloneDrawY(pos.y);
                    const cloneBottom = cloneDrawY + this.height;
                    const cloneTop = cloneDrawY;

                    if (cloneRight > obsLeft && cloneLeft < obsRight &&
                        cloneBottom > obsTop && cloneTop < obsBottom) {
                        const overlapLeft = cloneRight - obsLeft;
                        const overlapRight = obsRight - cloneLeft;
                        if (overlapLeft < overlapRight) {
                            pos.x -= overlapLeft;
                        } else {
                            pos.x += overlapRight;
                        }
                    }
                }
            }

            if (Math.abs(pos.y - prevY) > 40) {
                this.initCloneAccessoryNodes(i);
                pos.prevX = pos.x;
            }

            const frameDeltaX = pos.x - frameStartX;
            // スクロール速度を加算：ワールドX座標が変わらなくても画面上では動いて見えるため
            // renderVxをピクセル/フレーム単位に変換して scrollVxPerFrame を足す
            pos.renderVx = frameDeltaX / Math.max(0.016, deltaTime * 60) + scrollVxPerFrame;

            // 分身独自のlegPhase/legAngleを毎フレーム更新（本体/分身で共通式）
            const cloneLegMotion = this.updateLegLocomotion({
                legPhase: pos.legPhase,
                legAngle: pos.legAngle,
                deltaMs,
                horizontalSpeed: pos.renderVx || 0,
                isGrounded: !pos.jumping,
                isAttacking: (this.specialCloneAttackTimers[i] || 0) > 0,
                verticalSpeed: pos.cloneVy || 0,
                runBaseFreq: 0.018,
                runAmplitude: 0.86
            });
            pos.legPhase = cloneLegMotion.legPhase;
            pos.legAngle = cloneLegMotion.legAngle;

            if (this.specialCloneAttackTimers[i] > 0) {
                this.specialCloneAttackTimers[i] -= deltaMs;
            }
            if (this.specialCloneSubWeaponTimers[i] > 0) {
                this.specialCloneSubWeaponTimers[i] -= deltaMs;
                if (this.specialCloneSubWeaponTimers[i] <= 0) {
                    this.specialCloneSubWeaponTimers[i] = 0;
                    this.specialCloneSubWeaponActions[i] = null;
                }
            }

            const rawRenderVx = pos.renderVx || 0;
            // スクロール時にrenderVxが0になる場合は本体のvxを代わりに使う
            const effectiveVx = Math.abs(rawRenderVx) >= Math.abs(this.vx) ? rawRenderVx : this.vx;
            const cloneVx = Math.max(-this.speed * 2.5, Math.min(this.speed * 2.5, effectiveVx));
            pos.prevX = pos.x;

            const cloneFootY = this.getSpecialCloneFootY(pos.y);
            this.updateSpecialCloneAccessoryNodes(i, pos, deltaTime, {
                cloneVx,
                motionTime: this.motionTime,
                isMoving: Math.abs(cloneVx) > 0.5,
                drawX: pos.x - this.width * 0.5,
                footY: cloneFootY,
                height: this.height,
                isDashing: false,
                isCrouching: false,
                legPhase: this.motionTime * 0.012
            });
        }
    }

    findNearestEnemy(x, y, enemies, maxDist) {
        let bestTarget = null;
        let bestDistSq = maxDist * maxDist;
        for (const enemy of enemies) {
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const ds = Math.pow(ex - x, 2) + Math.pow(ey - y, 2);
            if (ds < bestDistSq) {
                bestDistSq = ds;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    }

    isSpecialCloneCombatActive() {
        return this.isUsingSpecial && this.specialCloneCombatStarted && this.specialCastTimer <= 0 && this.getActiveSpecialCloneCount() > 0;
    }

    getActiveSpecialCloneCount() {
        return this.specialCloneAlive.reduce((acc, alive) => acc + (alive ? 1 : 0), 0);
    }

    getSpecialCloneAnchorY() {
        const mirrorPlayerMotion = !this.specialCloneAutoAiEnabled || this.specialCastTimer > 0;
        if (mirrorPlayerMotion) {
            return this.getFootY() - PLAYER.HEIGHT * 0.38;
        }
        return this.groundY + LANE_OFFSET - PLAYER.HEIGHT * 0.38;
    }

    getSpecialCloneDrawY(anchorY) {
        return anchorY - PLAYER.HEIGHT * 0.62;
    }

    getSpecialCloneFootY(anchorY) {
        return anchorY + PLAYER.HEIGHT * 0.38;
    }

    getSpecialCloneDurabilityPerUnit() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? Math.max(0, Math.min(3, this.progression.specialClone))
            : 0;
        return tier >= 3 ? this.specialCloneDurabilityLv3 : 2;
    }

    getSpecialCloneAnchors() {
        if (!this.specialCloneCombatStarted) {
            return this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
        }

        // 戦闘開始後は、AIによって更新された個別座標を返す
        return this.specialCloneSlots.map((unit, index) => {
            const pos = this.specialClonePositions[index] || { x: this.x, y: this.y, facingRight: this.facingRight };
            return {
                x: pos.x,
                y: pos.y,
                facingRight: pos.facingRight,
                alpha: this.specialCloneAlive[index] ? 1.0 : 0,
                index
            };
        });
    }

    calculateSpecialCloneAnchors(centerX, centerY) {
        const spacing = this.specialCloneSpacing || 180;
        const anchors = this.specialCloneSlots.map((unit, index) => ({
            x: centerX + unit * spacing,
            y: centerY + (Math.abs(unit) - 1.5) * 1.6 + 1.2,
            facingRight: this.facingRight,
            alpha: this.specialCloneAlive[index] ? 1.0 : 0,
            index
        }));
        const displayOrder = this.getSpecialCloneDisplayOrder();
        const aliveIndices = displayOrder.filter((index) => this.specialCloneAlive[index]);
        const activeUnits = this.getSpecialCloneActiveLayout(aliveIndices.length);

        for (let i = 0; i < aliveIndices.length; i++) {
            const index = aliveIndices[i];
            const unit = activeUnits[i];
            anchors[index] = {
                x: centerX + unit * spacing,
                y: centerY + (Math.abs(unit) - 1.5) * 1.6 + 1.2,
                facingRight: this.facingRight,
                alpha: 1.0,
                index
            };
        }

        return anchors;
    }

    getSpecialCloneOffsets() {
        if (!this.isSpecialCloneCombatActive()) return [];
        const offsets = [];
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height * 0.55;

        for (let index = 0; index < this.specialCloneSlots.length; index++) {
            if (!this.specialCloneAlive[index]) continue;
            const pos = this.specialClonePositions[index];
            if (!pos) continue;
            offsets.push({
                index,
                dx: pos.x - centerX,
                dy: pos.y - centerY
            });
        }
        return offsets;
    }

    getSubWeaponCloneOffsets() {
        if (this.specialCloneAutoAiEnabled) return [];
        return this.getSpecialCloneOffsets();
    }

    takeTrapDamage(amount, options = {}) {
        if (this.isGhostVeilActive()) return false;
        if (this.trapDamageCooldown > 0 || this.invincibleTimer > 0) return false;
        const sourceX = (typeof options.sourceX === 'number') ? options.sourceX : null;
        const knockbackX = (typeof options.knockbackX === 'number') ? options.knockbackX : 4.5;
        const knockbackY = (typeof options.knockbackY === 'number') ? options.knockbackY : -7.5;
        const forcedKnockbackDir = (typeof options.knockbackDir === 'number' && options.knockbackDir !== 0)
            ? (options.knockbackDir > 0 ? 1 : -1)
            : 0;
        const cooldownMs = (typeof options.cooldownMs === 'number') ? options.cooldownMs : 780;
        const flashMs = (typeof options.flashMs === 'number') ? options.flashMs : 280;
        const invincibleMs = (typeof options.invincibleMs === 'number') ? options.invincibleMs : 780;

        this.hp -= amount;
        this.trapDamageCooldown = cooldownMs;
        this.damageFlashTimer = Math.max(this.damageFlashTimer, flashMs);
        this.invincibleTimer = Math.max(this.invincibleTimer, invincibleMs);

        const playerCenterX = this.x + this.width / 2;
        const knockbackDir = forcedKnockbackDir !== 0
            ? forcedKnockbackDir
            : ((sourceX === null)
                ? (this.facingRight ? -1 : 1)
                : (playerCenterX < sourceX ? -1 : 1));

        this.vx = knockbackDir * knockbackX;
        this.vy = knockbackY;
        this.isGrounded = false;
        audio.playDamage();

        if (this.hp <= 0) {
            this.hp = 0;
            return true;
        }
        return false;
    }

    consumeSpecialClone(index = null) {
        if (!this.isUsingSpecial) return false;
        let consumeIndex = index;
        if (consumeIndex === null || !this.specialCloneAlive[consumeIndex]) {
            consumeIndex = this.specialCloneAlive.findIndex((alive) => alive);
            if (consumeIndex === -1) return false;
        }
        if ((this.specialCloneInvincibleTimers[consumeIndex] || 0) > 0) return false;

        const baseDurability = this.getSpecialCloneDurabilityPerUnit();
        if (!Array.isArray(this.specialCloneDurability) || this.specialCloneDurability.length !== this.specialCloneSlots.length) {
            this.specialCloneDurability = this.specialCloneSlots.map(() => baseDurability);
        }
        const currentDurability = Math.max(1, Number(this.specialCloneDurability[consumeIndex]) || baseDurability);
        const nextDurability = currentDurability - 1;
        if (nextDurability > 0) {
            this.specialCloneDurability[consumeIndex] = nextDurability;
            // 多段接触で即蒸発しないよう、被弾後の短い無敵を付与
            this.specialCloneInvincibleTimers[consumeIndex] = this.specialCloneHitInvincibleMs;
            return true;
        }

        this.specialCloneAlive[consumeIndex] = false;
        this.specialCloneInvincibleTimers[consumeIndex] = 0;
        this.specialCloneDurability[consumeIndex] = 0;
        this.spawnSpecialSmoke('vanish', [this.getSpecialSmokeAnchorByIndex(consumeIndex)]);
        if (this.getActiveSpecialCloneCount() <= 0) {
            this.isUsingSpecial = false;
            this.specialCloneCombatStarted = false;
            this.specialCastTimer = 0;
            this.spawnSpecialSmoke('vanish');
            this.resetVisualTrails();
        }
        return true;
    }

    spawnSpecialSmoke(mode = 'appear', fixedAnchors = null) {
        const isAppear = mode === 'appear';
        const lifeBase = isAppear ? 560 : 320;
        const puffCount = isAppear ? 16 : 10;
        // fixedAnchors があればそれを使用、なければ自分自身の位置を配列として使用
        const anchors = fixedAnchors || [{ x: this.x + this.width / 2, y: this.y + this.height / 2 }];
        for (const anchor of anchors) {
            for (let index = 0; index < puffCount; index++) {
                const angle = (Math.PI * 2 * index) / puffCount + Math.random() * 0.48;
                const speed = isAppear ? (0.58 + Math.random() * 0.86) : (0.62 + Math.random() * 1.2);
                const maxLife = lifeBase + Math.random() * 180;
                const spreadX = isAppear ? (10 + Math.random() * 18) : (6 + Math.random() * 12);
                const spreadY = isAppear ? (10 + Math.random() * 20) : (4 + Math.random() * 10);
                this.specialSmoke.push({
                    x: anchor.x + Math.cos(angle) * spreadX,
                    y: anchor.y + Math.sin(angle) * spreadY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 0.3,
                    life: maxLife,
                    maxLife,
                    radius: isAppear ? (12 + Math.random() * 14) : (7 + Math.random() * 10),
                    mode,
                    rot: Math.random() * Math.PI * 2,
                    spin: (Math.random() - 0.5) * 0.085,
                    wobbleAmp: isAppear ? (0.2 + Math.random() * 0.46) : (0.12 + Math.random() * 0.36),
                    wobbleFreq: 0.007 + Math.random() * 0.017,
                    ringStart: 0.2 + Math.random() * 0.24,
                    hasSpark: Math.random() < 0.38
                });
            }
        }
        if (this.specialSmoke.length > 260) {
            this.specialSmoke.splice(0, this.specialSmoke.length - 260);
        }
    }

    isHangingOnOdachi() {
        const odachi = this.currentSubWeapon;
        if (!odachi || odachi.name !== '大太刀' || !odachi.isAttacking || typeof odachi.getPose !== 'function') {
            return false;
        }
        if (typeof odachi.isPlanted === 'function' && odachi.isPlanted()) {
            return true;
        }
        const pose = odachi.getPose(this);
        return pose.phase === 'planted';
    }
    
    applyPhysics(walls) {
        // ========== プレビューモード：縦物理のみ・壁判定なし ==========
        if (this.previewMode) {
            const wasGrounded = this.isGrounded;
            if (!this.isGrounded) {
                this.vy += GRAVITY;
            }
            this.height = this.isCrouching ? PLAYER.HEIGHT / 2 : PLAYER.HEIGHT;
            this.vx *= 0.88;
            this.x += this.vx;
            this.y += this.vy;
            if (this.y + this.height >= this.groundY + LANE_OFFSET) {
                this.y = this.groundY + LANE_OFFSET - this.height;
                this.vy = 0;
                this.isGrounded = true;
                this.jumpCount = 0;
            } else {
                this.isGrounded = false;
            }
            this.justLanded = !wasGrounded && this.isGrounded;
            return;
        }

        const wasGrounded = this.isGrounded;
        const prevY = this.y;

        // 重力
        if (!this.isGrounded) {
            this.vy += GRAVITY;
            
            // 壁滑り（落下速度軽減）
            if (this.isWallSliding && this.vy > 2) {
                this.vy = 2;
            }
        }
        
        // 摩擦（横方向）
        if (this.isGrounded && !this.isDashing && !input.isAction('LEFT') && !input.isAction('RIGHT')) {
            this.vx *= FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }
        
        // しゃがみ中は高さを半分に
        this.height = this.isCrouching ? PLAYER.HEIGHT / 2 : PLAYER.HEIGHT;

        const colliders = Array.isArray(walls) ? walls : [];
        const comboStep = this.currentAttack ? (this.currentAttack.comboStep || 0) : 0;
        const effectiveColliders = (this.isAttacking && comboStep === 4)
            ? colliders.filter((wall) => !(wall && wall.type === 'rock'))
            : colliders;

        // 高速横移動時のめり込み防止: 移動予定線上で先に停止位置を確定する
        let horizontalBlockedDir = 0;
        let nextX = this.x + this.vx;
        if (this.vx !== 0) {
            const sweepTop = Math.min(this.y, this.y + this.vy);
            const sweepBottom = Math.max(this.y + this.height, this.y + this.vy + this.height);
            const edgeTolerance = 2;
            const wallPadding = 0.01;

            if (this.vx > 0) {
                const currentRight = this.x + this.width;
                for (const wall of effectiveColliders) {
                    if (!this.isSolidCollider(wall)) continue;
                    const overlapY = Math.min(sweepBottom, wall.y + wall.height) - Math.max(sweepTop, wall.y);
                    if (overlapY <= edgeTolerance) continue;
                    if (currentRight <= wall.x + 0.5 && nextX + this.width > wall.x) {
                        nextX = Math.min(nextX, wall.x - this.width - wallPadding);
                        horizontalBlockedDir = 1;
                    }
                }
            } else {
                const currentLeft = this.x;
                for (const wall of effectiveColliders) {
                    if (!this.isSolidCollider(wall)) continue;
                    const overlapY = Math.min(sweepBottom, wall.y + wall.height) - Math.max(sweepTop, wall.y);
                    if (overlapY <= edgeTolerance) continue;
                    const wallRight = wall.x + wall.width;
                    if (currentLeft >= wallRight - 0.5 && nextX < wallRight) {
                        nextX = Math.max(nextX, wallRight + wallPadding);
                        horizontalBlockedDir = -1;
                    }
                }
            }

            if (horizontalBlockedDir !== 0) {
                this.vx = 0;
            }
        }

        // 位置更新
        this.x = nextX;
        this.y += this.vy;
        
        // 壁判定リセット
        this.isWallSliding = false;
        this.wallDirection = 0;
        
        // 壁との当たり判定
        for (const wall of effectiveColliders) {
            if (!this.isSolidCollider(wall)) continue;
            if (this.intersects(wall)) {
                const wasAboveWall = prevY + this.height <= wall.y + 2;
                const wasBelowWall = prevY >= wall.y + wall.height - 2;
                if (wasAboveWall || wasBelowWall) continue;
                // 横方向の補正
                if (this.vx > 0) {
                    this.x = wall.x - this.width;
                    if (!this.isGrounded && input.isAction('RIGHT')) {
                        this.isWallSliding = true;
                        this.wallDirection = -1;
                    }
                } else if (this.vx < 0) {
                    this.x = wall.x + wall.width;
                    if (!this.isGrounded && input.isAction('LEFT')) {
                        this.isWallSliding = true;
                        this.wallDirection = 1;
                    }
                }
                this.vx = 0;
            }
        }
        if (!this.isWallSliding && horizontalBlockedDir !== 0 && !this.isGrounded) {
            if (horizontalBlockedDir > 0 && input.isAction('RIGHT')) {
                this.isWallSliding = true;
                this.wallDirection = -1;
            } else if (horizontalBlockedDir < 0 && input.isAction('LEFT')) {
                this.isWallSliding = true;
                this.wallDirection = 1;
            }
        }

        // 障害物の上面・下面の判定（岩に乗れるようにする）
        let supportTopY = null;
        for (const wall of effectiveColliders) {
            if (!this.isSolidCollider(wall)) continue;

            const wallLeft = wall.x;
            const wallRight = wall.x + wall.width;
            const wallTop = wall.y;
            const wallBottom = wall.y + wall.height;
            const overlapX = Math.min(this.x + this.width, wallRight) - Math.max(this.x, wallLeft);
            if (overlapX <= 3) continue;

            const prevTop = prevY;
            const prevBottom = prevY + this.height;
            const currentTop = this.y;
            const currentBottom = this.y + this.height;

            // 下から頭をぶつけた場合
            if (this.vy < 0 && prevTop >= wallBottom - 2 && currentTop <= wallBottom) {
                this.y = wallBottom;
                this.vy = 0;
                continue;
            }

            // 上から着地できる場合
            const canLandOnTop = this.vy >= -0.1 &&
                prevBottom <= wallTop + 10 &&
                currentBottom >= wallTop - 0.1;
            if (canLandOnTop) {
                if (supportTopY === null || wallTop < supportTopY) {
                    supportTopY = wallTop;
                }
            }
        }
        
        // 大太刀の突き刺し中は、柄にぶら下がる姿勢を維持する
        const hangingOnOdachi = this.isHangingOnOdachi();

        // 着地音の判定用：接地前の落下速度を一時保持
        const fallingSpeed = this.vy;

        // 地面判定
        if (hangingOnOdachi) {
            const hangClearance = 30;
            const hangY = this.groundY + LANE_OFFSET - this.height - hangClearance;
            // 刺さっている間は常に同じ吊り位置を維持する
            this.y = hangY;
            if (this.vy > 0) {
                this.vy = 0;
            }
            this.isGrounded = false;
            this.isWallSliding = false;
            this.jumpCount = Math.max(this.jumpCount, 1);
        } else if (supportTopY !== null && this.y + this.height >= supportTopY - 2) {
            // 急上昇中は上面への「吸い付き」を防ぐため、判定を厳格化
            const isRapidAscending = this.vy < -5.0;
            if (!isRapidAscending || (prevY + this.height <= supportTopY + 1)) {
                this.y = supportTopY - this.height;
                this.vy = 0;
                this.isGrounded = true;
                this.jumpCount = 0;
                this.isWallSliding = false;
            } else {
                this.isGrounded = false;
            }
        } else if (this.y + this.height >= this.groundY + LANE_OFFSET) {
            this.y = this.groundY + LANE_OFFSET - this.height;
            this.vy = 0;
            this.isGrounded = true;
            this.jumpCount = 0;
            this.isWallSliding = false;
        } else {
            this.isGrounded = false;
        }

        this.justLanded = !wasGrounded && this.isGrounded;
        if (this.justLanded && fallingSpeed > 0) {
            audio.playLanding();
        }
        
        // 画面端制限
        if (this.x < 0) {
            this.x = 0;
            this.vx = 0;
        }
        // 右端制限は削除（ワールド座標で無限に進めるようにする。ステージ端制限はGame側で管理）
    }
    
    intersects(rect) {
        return this.x < rect.x + rect.width &&
               this.x + this.width > rect.x &&
               this.y < rect.y + rect.height &&
               this.y + this.height > rect.y;
    }

    isSolidCollider(rect) {
        if (!rect || rect.isDestroyed) return false;
        if (
            typeof rect.x !== 'number' ||
            typeof rect.y !== 'number' ||
            typeof rect.width !== 'number' ||
            typeof rect.height !== 'number'
        ) {
            return false;
        }
        // 罠(竹槍)は通常時は足場にしない。
        // ただし隠れ身の術中はすり抜け防止のため、竹槍にも当たり判定を持たせる。
        if (typeof rect.type === 'string') {
            if (rect.type === 'rock') {
                // 通常4撃目の切り上げ〜後方宙返り中は、岩を攻撃対象としてだけ扱う。
                if (this.isAttacking && this.currentAttack && this.currentAttack.comboStep === 4) {
                    return false;
                }
                return true;
            }
            if (rect.type === 'spike') return this.isGhostVeilActive();
            return false;
        }
        return true;
    }
    
    takeDamage(amount, options = {}) {
        if (this.isGhostVeilActive()) return false;
        if (this.invincibleTimer > 0) return false;

        const sourceX = (typeof options.sourceX === 'number') ? options.sourceX : null;
        const knockbackX = (typeof options.knockbackX === 'number') ? options.knockbackX : 3.2;
        const knockbackY = (typeof options.knockbackY === 'number') ? options.knockbackY : -1.9;
        const invincibleMs = (typeof options.invincibleMs === 'number') ? options.invincibleMs : 1200;
        const flashMs = (typeof options.flashMs === 'number') ? options.flashMs : 220;
        const disableHitFeedback = options.disableHitFeedback === true;

        // しゃがみ中はダメージ半減
        if (this.isCrouching) {
            amount = Math.max(1, Math.floor(amount * 0.5));
        }

        this.hp -= amount;
        this.invincibleTimer = invincibleMs;
        this.damageFlashTimer = flashMs;
        
        // ノックバック（被弾源から離れる方向）
        const playerCenterX = this.x + this.width / 2;
        const knockbackDir = (sourceX === null)
            ? (this.facingRight ? -1 : 1)
            : (playerCenterX < sourceX ? -1 : 1);
        this.vx = knockbackDir * knockbackX;
        this.vy = knockbackY;
        this.isGrounded = false;

        // 被弾フィードバック（ヒットストップ / 画面揺れ）
        const g = window.game || game;
        if (
            !disableHitFeedback &&
            g &&
            typeof g.queueHitFeedback === 'function' &&
            (g.screenShakeEnabled || g.hitStopEnabled)
        ) {
            const damageRatio = Math.max(0, Math.min(1.6, amount / 4));
            const shake = 1.4 + damageRatio * 0.8;
            const stopMs = 14 + damageRatio * 8;
            g.queueHitFeedback(shake, stopMs);
        }
        
        audio.playDamage();
        
        if (this.hp <= 0) {
            this.hp = 0;
            return true;  // 死亡
        }
        return false;
    }
    
    addExp(amount) {
        let levelGained = 0;
        const safeAmount = Number.isFinite(amount) ? amount : 0;
        this.exp += safeAmount;
        if (!Number.isFinite(this.expToNext) || this.expToNext <= 0) {
            this.expToNext = calcExpToNextForLevel(this.level);
        }
        while (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.levelUp();
            levelGained++;
        }
        return levelGained;
    }
    
    levelUp() {
        this.level++;
        this.maxHp = Math.max(1, this.maxHp + LEVEL_UP_MAX_HP_GAIN);
        this.expToNext = calcExpToNextForLevel(this.level);
        this.hp = this.maxHp;
    }

    getExpToNextForLevel(level = this.level) {
        return calcExpToNextForLevel(level);
    }
    
    addSpecialGauge(amount) {
        this.specialGauge = Math.min(this.specialGauge + amount, this.maxSpecialGauge);
    }
    
    clampMoneyValue(amount) {
        const numeric = Number.isFinite(amount) ? amount : 0;
        return Math.max(0, Math.min(this.maxMoney, Math.floor(numeric)));
    }

    setMoney(amount) {
        this.money = this.clampMoneyValue(amount);
    }

    addMoney(amount) {
        this.money = this.clampMoneyValue(this.money + amount);
    }

    getNormalComboMax() {
        // 連撃Lvに応じた段数 (Lv0:2連 〜 Lv3:5連)
        const tier = this.progression && Number.isFinite(this.progression.normalCombo)
            ? this.progression.normalCombo
            : 0;
        const max = Math.max(2, Math.min(COMBO_ATTACKS.length, 2 + tier));
        
        return max;
    }

    getSubWeaponEnhanceTier() {
        const tier = this.progression && Number.isFinite(this.progression.subWeapon)
            ? this.progression.subWeapon
            : 0;
        return Math.max(0, Math.min(3, tier));
    }

    isAllSkillsMaxed() {
        if (!this.progression) return false;
        // 連撃、忍具、奥義（分身）のすべてが Lv3 以上か判定
        const comboMax = (this.progression.normalCombo || 0) >= 3;
        const subMax = (this.progression.subWeapon || 0) >= 3;
        const specialMax = (this.progression.specialClone || 0) >= 3;
        return comboMax && subMax && specialMax;
    }

    updateTemporaryNinjutsu(deltaMs) {
        if (!this.tempNinjutsuTimers) return;
        this.tempNinjutsuTimers.expMagnet = Math.max(0, (this.tempNinjutsuTimers.expMagnet || 0) - deltaMs);
        this.tempNinjutsuTimers.xAttack = Math.max(0, (this.tempNinjutsuTimers.xAttack || 0) - deltaMs);
        this.tempNinjutsuTimers.ghostVeil = Math.max(0, (this.tempNinjutsuTimers.ghostVeil || 0) - deltaMs);
    }

    resetTemporaryNinjutsuTimers() {
        if (!this.tempNinjutsuTimers) return;
        Object.keys(this.tempNinjutsuTimers).forEach((key) => {
            this.tempNinjutsuTimers[key] = 0;
        });
    }

    getTempNinjutsuRemainingMs(key) {
        if (!this.tempNinjutsuTimers) return 0;
        return Math.max(0, this.tempNinjutsuTimers[key] || 0);
    }

    isExpMagnetBoostActive() {
        return this.getTempNinjutsuRemainingMs('expMagnet') > 0;
    }

    getExpMagnetRadiusScale() {
        return this.isExpMagnetBoostActive() ? 1.75 : 1.0;
    }

    isXAttackBoostActive() {
        return this.getTempNinjutsuRemainingMs('xAttack') > 0;
    }

    isXAttackActionActive() {
        const dualZActive = !!(
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0
        );
        const cloneDualZActive = !!(
            this.specialCloneAutoAiEnabled &&
            Array.isArray(this.specialCloneSubWeaponActions) &&
            Array.isArray(this.specialCloneSubWeaponTimers) &&
            this.specialCloneSubWeaponActions.some((action, index) =>
                action === '二刀_Z' && (this.specialCloneSubWeaponTimers[index] || 0) > 0
            )
        );
        return !!((this.isAttacking && this.currentAttack) || dualZActive || cloneDualZActive);
    }

    isXAttackFinisherActive(attack = this.currentAttack) {
        return !!(
            attack &&
            attack.comboStep === this.getNormalComboMax() &&
            this.isXAttackBoostActive()
        );
    }

    getXAttackHitboxScale() {
        if (!this.isXAttackBoostActive()) return 1.0;
        return this.isXAttackActionActive() ? 2.45 : 1.0;
    }

    getXAttackTrailWidthScale() {
        if (!this.isXAttackBoostActive()) return 1.0;
        // 大凪の見た目倍率は少し抑え、誇張しすぎないサイズ感にする
        return this.isXAttackActionActive() ? 2.35 : 1.0;
    }

    isGhostVeilActive() {
        return this.getTempNinjutsuRemainingMs('ghostVeil') > 0;
    }

    getGhostVeilAlpha() {
        return this.isGhostVeilActive() ? 0.0 : 1.0;
    }

    applyTemporaryNinjutsuChoice(choiceId) {
        if (!this.progression || !this.tempNinjutsuTimers || !this.tempNinjutsuDurations) return false;

        const addRemainingDuration = (key) => {
            const current = Math.max(0, this.tempNinjutsuTimers[key] || 0);
            const add = Math.max(0, this.tempNinjutsuDurations[key] || 0);
            this.tempNinjutsuTimers[key] = Math.min(TEMP_NINJUTSU_MAX_STACK_MS, current + add);
        };

        if (choiceId === 'temp_exp_magnet') {
            addRemainingDuration('expMagnet');
            return true;
        }
        if (choiceId === 'temp_x_attack') {
            addRemainingDuration('xAttack');
            return true;
        }
        if (choiceId === 'temp_ghost_veil') {
            addRemainingDuration('ghostVeil');
            return true;
        }
        return false;
    }

    rebuildSpecialCloneSlots() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? Math.max(0, Math.min(3, this.progression.specialClone))
            : 0;
        const count = this.getSpecialCloneCountByTier(tier);
        this.specialCloneSlots = this.buildCloneSlotLayout(count);
        this.specialCloneSpacing = 172 + tier * 8;
        if (tier >= 3) {
            this.specialCloneAutoAiEnabled = true;
        } else {
            this.specialCloneAutoAiEnabled = false;
        }
        this.specialCloneAlive = this.specialCloneSlots.map(() => false);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map(() => 0);
        this.specialCloneDurability = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
    }

    getSpecialCloneCountByTier(tier) {
        const clampedTier = Math.max(0, Math.min(3, tier));
        if (clampedTier <= 0) return 1;
        if (clampedTier === 1) return 2;
        return 4;
    }

    getSpecialCloneCount() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? this.progression.specialClone
            : 0;
        return this.getSpecialCloneCountByTier(tier);
    }

    buildCloneSlotLayout(count) {
        if (count <= 1) return [1];
        if (count === 2) return [-1, 1];
        if (count === 3) return [-1, 1, -2];
        return [-2, -1, 1, 2];
    }

    getSpecialCloneDisplayOrder() {
        const count = Array.isArray(this.specialCloneSlots) ? this.specialCloneSlots.length : 0;
        if (count <= 1) return [0];
        if (count === 2) return [1, 0];
        return [3, 1, 0, 2].filter((index) => index < count);
    }

    getSpecialCloneActiveLayout(count) {
        if (count <= 1) return [1];
        if (count === 2) return [-1, 1];
        if (count === 3) return [-1, 1, 2];
        return [-2, -1, 1, 2];
    }

    canCloneAutoStrike(index) {
        if (!this.specialCloneAutoAiEnabled) return false;
        if (!this.specialCloneAlive[index]) return false;
        return (this.specialCloneAutoCooldowns[index] || 0) <= 0;
    }

    resetCloneAutoStrikeCooldown(index) {
        if (!Number.isFinite(index)) return;
        if (!Array.isArray(this.specialCloneAutoCooldowns)) return;
        if (index < 0 || index >= this.specialCloneAutoCooldowns.length) return;
        this.specialCloneAutoCooldowns[index] = this.specialCloneAutoStrikeCooldownMs;
    }

    refreshSubWeaponScaling() {
        if (!Array.isArray(this.subWeapons) || this.subWeapons.length === 0) return;
        const tier = this.getSubWeaponEnhanceTier();
        for (const weapon of this.subWeapons) {
            if (!weapon) continue;
            // 大槍/鎖鎌などのLv別挙動は enhanceTier 側で分岐するため先に同期する
            if (typeof weapon.applyEnhanceTier === 'function') {
                weapon.applyEnhanceTier(tier);
            } else if (Object.prototype.hasOwnProperty.call(weapon, 'enhanceTier')) {
                weapon.enhanceTier = tier;
            }
            const baseDamage = Number.isFinite(weapon.baseDamage) ? weapon.baseDamage : weapon.damage;
            const baseRange = Number.isFinite(weapon.baseRange) ? weapon.baseRange : weapon.range;
            const baseCooldown = Number.isFinite(weapon.baseCooldown) ? weapon.baseCooldown : weapon.cooldown;
            let damageScale = 1 + tier * 0.08;
            let rangeScale = 1 + tier * 0.1;
            if (weapon.name === '手裏剣') {
                damageScale = 1 + tier * 0.08;
                rangeScale = 1 + tier * 0.12;
            } else if (weapon.name === '火薬玉') {
                damageScale = 1 + tier * 0.06;
                rangeScale = 1 + tier * 0.05;
            } else if (weapon.name === '大槍') {
                damageScale = 1 + tier * 0.12;
                rangeScale = Number.isFinite(weapon.fixedRangeScale) ? weapon.fixedRangeScale : (1 + 3 * 0.16);
            } else if (weapon.name === '鎖鎌') {
                damageScale = 1 + tier * 0.12;
                rangeScale = 1 + tier * 0.14;
            } else if (weapon.name === '大太刀') {
                damageScale = 1 + tier * 0.15;
                rangeScale = 1 + tier * 0.1;
            } else if (weapon.name === '二刀流') {
                damageScale = 1 + tier * 0.11;
                rangeScale = 1 + tier * 0.09;
                if (typeof weapon.mainMotionSpeedScale === 'number') {
                    weapon.mainMotionSpeedScale = Math.max(1.05, (this.attackMotionScale || 1.7) - tier * 0.08);
                }
            }
            weapon.damage = Math.max(1, Math.round(baseDamage * damageScale));
            weapon.range = Math.max(24, Math.round(baseRange * rangeScale));
            weapon.cooldown = Math.max(70, Math.round(baseCooldown));
        }
    }

    applyProgressionChoice(choiceId) {
        if (!this.progression) return false;
        if (choiceId === 'normal_combo') {
            if (this.progression.normalCombo >= 3) return false;
            this.progression.normalCombo++;
            // 速度向上ロジックは削除（初期速度固定）
            return true;
        }
        if (choiceId === 'sub_weapon') {
            if (this.progression.subWeapon >= 3) return false;
            this.progression.subWeapon++;
            this.refreshSubWeaponScaling();
            return true;
        }
        if (choiceId === 'special_clone') {
            if (this.progression.specialClone >= 3) return false;
            const wasActive = this.isUsingSpecial;
            this.progression.specialClone++;
            this.rebuildSpecialCloneSlots();
            // 発動中なら新しいLvで即再発動
            if (wasActive) {
                this.clearSpecialState(true);
                this.specialGauge = this.maxSpecialGauge;
                this.useSpecial();
            }
            return true;
        }
        return false;
    }
    
    updateAnimation(deltaTime) {
        this.motionTime += deltaTime * 1000;
        this.animationTimer += deltaTime * 1000;
        
        // 状態に応じたアニメーション速度
        let frameDuration = 100;
        if (this.animState === ANIM_STATE.RUN) frameDuration = 80;
        if (this.animState === ANIM_STATE.DASH) frameDuration = 50;
        
        if (this.animationTimer >= frameDuration) {
            this.animationTimer = 0;
            this.animationFrame++;
        }

        // 基本的な状態遷移
        if (!this.isAttacking && !this.isUsingSpecial) {
            if (this.isWallSliding) {
                this.animState = ANIM_STATE.WALL_SLIDE;
            } else if (!this.isGrounded) {
                this.animState = this.vy < 0 ? ANIM_STATE.JUMP : ANIM_STATE.FALL;
            } else if (Math.abs(this.vx) > 0.7) {
                this.animState = this.isDashing ? ANIM_STATE.DASH : ANIM_STATE.RUN;
            } else {
                this.animState = ANIM_STATE.IDLE;
            }
        }

        // 下半身は攻撃状態に依存させず、移動状態のみで計算する（本体/分身で共通式）
        const comboAttacking = !!(this.isAttacking && this.currentAttack && this.currentAttack.comboStep);
        const legTransitionLocked = this.comboStep1IdleTransitionTimer > 0;
        const legMotion = this.updateLegLocomotion({
            legPhase: this.legPhase,
            legAngle: this.legAngle,
            deltaMs: deltaTime * 1000,
            horizontalSpeed: legTransitionLocked ? 0 : this.vx,
            isGrounded: this.isGrounded,
            isAttacking: comboAttacking,
            verticalSpeed: this.vy,
            isDashing: this.isDashing,
            isCrouching: this.isCrouching
        });
        this.legPhase = legMotion.legPhase;
        this.legAngle = legMotion.legAngle;

        // --- 鉢巻・ポニーテールの更新処理 ---
        // ガード＆初期化
        if (!this.scarfNodes || this.scarfNodes.length === 0 || !this.hairNodes || this.hairNodes.length === 0) {
            this.resetVisualTrails();
            return;
        }

        if (this.isDefeated) {
            return;
        }

        const speedX = this.vx;
        const isMoving = Math.abs(speedX) > 0.1;

        const isRunLikePose = !legTransitionLocked && ((this.isGrounded && Math.abs(this.vx) > 0.85) || this.isDashing);
        let modelBob = 0;
        if (this.isCrouching) {
            const crouchWalkPhase = isRunLikePose ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
            const crouchIdlePhase = isRunLikePose ? 0 : Math.sin(this.motionTime * 0.006);
            modelBob = isRunLikePose ? crouchWalkPhase * 0.4 : crouchIdlePhase * 0.2;
        } else if (!this.isGrounded) {
            modelBob = Math.max(-1.2, Math.min(1.2, -this.vy * 0.06));
        } else if (isRunLikePose) {
            modelBob = Math.abs(Math.sin(this.legPhase || this.motionTime * 0.012)) * (this.isDashing ? 3.3 : 2.4);
        } else {
            modelBob = Math.sin(this.motionTime * 0.005) * 1.2;
        }

        const modelBottomY = this.y + this.height - 2;
        // しゃがみ中のheadYはrenderModel内の算出式と合わせる
        // headRadius_crouch = PLAYER.HEIGHT * headRatio * 0.5
        // headY = bottomY - headRadius_crouch * 2.2
        const modelHeadY = this.isCrouching
            ? (modelBottomY - PLAYER.HEIGHT * (14 * 2 / 60) * 0.5 * 2.2 + modelBob)
            : (this.y + 15 + modelBob);
        const headCenterX = this.x + this.width / 2;
        const baseHeightForHead = this.isCrouching ? PLAYER.HEIGHT : this.height;
        const headRadius = (baseHeightForHead * (14 * 2 / 60) * 0.5);
        const anchorRoots = this.getAccessoryRootAnchors(headCenterX, modelHeadY, headRadius, this.facingRight);
        const targetX = anchorRoots.knotX;
        const targetY = anchorRoots.knotY;

        // ステージ遷移や瞬間移動で履歴ノードが大きく離れている場合は破綻防止で再初期化
        const root = this.scarfNodes[0];
        if (!Number.isFinite(root.x) || !Number.isFinite(root.y) || Math.hypot(root.x - targetX, root.y - targetY) > 120) {
            this.resetVisualTrails();
        }
        
        // 1. 根元の位置固定
        this.scarfNodes[0].x = targetX;
        this.scarfNodes[0].y = targetY;
        this.hairNodes[0].x = anchorRoots.hairRootX;
        this.hairNodes[0].y = anchorRoots.hairRootY;

        // 分身・本体共通の一元化された物理演算を呼び出す
        this.updateAccessoryNodes(
            this.scarfNodes,
            this.hairNodes,
            targetX,
            targetY,
            this.vx,
            isMoving,
            deltaTime,
            {
                facingRight: this.facingRight,
                hairRootX: anchorRoots.hairRootX,
                hairRootY: anchorRoots.hairRootY,
                headCenterX: headCenterX,
                headY: modelHeadY,
                headRadius: headRadius
            }
        );
    }

    getKatanaBladeLength() {
        // 剣筋の弧に刃先が届く長さで統一
        return 66;
    }

    drawKatana(
        ctx,
        x,
        y,
        angle,
        scaleDir = 1,
        bladeLength = this.getKatanaBladeLength(),
        uprightBlend = 0.28,
        renderMode = 'all',
        scaleY = 1,
        uprightTarget = -Math.PI / 2
    ) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scaleDir, scaleY);
        // 垂直方向(uprightTarget)へ角度を寄せて、刀全体を立たせる
        const blend = Math.max(0, Math.min(1, uprightBlend));
        const adjustedAngle = angle + (uprightTarget - angle) * blend;
        ctx.rotate(adjustedAngle);

        const scale = 0.52;
        ctx.scale(scale, scale);
        // 剣筋(エフェクト)基準より見た目の刀身だけ少し短くする
        const visualBladeLength = Math.max(18, bladeLength - 5);
        const bladeReach = visualBladeLength / scale;

        const gripOffset = 10;
        const drawHandle = renderMode === 'all' || renderMode === 'handle';
        const drawBlade = renderMode === 'all' || renderMode === 'blade';

        // === 柄（つか）===
        const handleStart = -23.5;
        const handleEnd = gripOffset - 1;
        const handleLen = handleEnd - handleStart;
        const handleHalfH = 2.6;

        // === 鍔（つば）===
        const tsubaX = gripOffset;
        const tsubaRX = 1.8;
        const tsubaRY = 4.4;

        // === はばき ===
        const habakiX = tsubaX + tsubaRX + 0.4;

        if (drawHandle) {
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(handleStart, -handleHalfH);
            ctx.lineTo(handleEnd, -handleHalfH + 0.3);
            ctx.lineTo(handleEnd, handleHalfH - 0.3);
            ctx.lineTo(handleStart, handleHalfH);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 0.7;
            const wrapSpacing = 4.2;
            const wrapCount = Math.floor(handleLen / wrapSpacing);
            for (let i = 0; i <= wrapCount; i++) {
                const wx = handleStart + i * wrapSpacing;
                ctx.beginPath();
                ctx.moveTo(wx, -handleHalfH + 0.4);
                ctx.lineTo(wx + wrapSpacing * 0.5, handleHalfH - 0.4);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(wx, handleHalfH - 0.4);
                ctx.lineTo(wx + wrapSpacing * 0.5, -handleHalfH + 0.4);
                ctx.stroke();
            }

            ctx.fillStyle = '#777';
            ctx.beginPath();
            ctx.ellipse(handleStart - 0.5, 0, 1.5, handleHalfH + 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.ellipse(tsubaX + 0.2, 0.2, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
            ctx.fill();

            const tsubaGrad = ctx.createLinearGradient(tsubaX, -tsubaRY, tsubaX, tsubaRY);
            tsubaGrad.addColorStop(0, '#555');
            tsubaGrad.addColorStop(0.45, '#2a2a2a');
            tsubaGrad.addColorStop(0.55, '#222');
            tsubaGrad.addColorStop(1, '#444');
            ctx.fillStyle = tsubaGrad;
            ctx.beginPath();
            ctx.ellipse(tsubaX, 0, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#666';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.ellipse(tsubaX, 0, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#c9a545';
            ctx.fillRect(habakiX, -1.8, 2.2, 3.6);
            ctx.strokeStyle = '#a07828';
            ctx.lineWidth = 0.4;
            ctx.strokeRect(habakiX, -1.8, 2.2, 3.6);
        }

        if (drawBlade) {
            // === 刀身 ===
            const bladeStart = habakiX + 2.2;
            // 先端を剣筋発生位置(= bladeLength)に合わせる
            const bladeEnd = Math.max(bladeStart + 10, bladeReach);
            const bl = bladeEnd - bladeStart;
            const seg = 56;

            // シンプル刀身:
            // - 白ベース（刀身全体は円弧）
            // - 白の峰側に、幅1/2・少し短い黒レイヤーを重ねる
            // - 先端は右下側のみ丸みを残して細くする
            const getTX = (t) => bladeStart + (bladeEnd - bladeStart) * t;
            const sori = bl * 0.18;
            // 根本(t=0)は直線時と同じ位置・同じ入り方にする
            const getArcY = (t) => -(Math.pow(t, 1.8) * sori) + 0.06;

            const whiteHalf = 2.2;
            const getWhiteUpperY = (t) => getArcY(t) - whiteHalf;
            const getWhiteLowerY = (t) => getArcY(t) + whiteHalf;

            const upperPoints = [];
            const lowerPoints = [];
            for (let i = 0; i <= seg; i++) {
                const t = i / seg;
                upperPoints.push({ x: getTX(t), y: getWhiteUpperY(t) });
                lowerPoints.push({ x: getTX(t), y: getWhiteLowerY(t) });
            }

            // 先端形状:
            // 峰側(上)はそのまま終端まで伸ばし、刃側(下)だけ先端へ向かって絞る
            const tipY = upperPoints[seg].y;
            const edgeStartIndex = Math.floor(seg * 0.9);
            const edgeStart = lowerPoints[edgeStartIndex];
            const edgeSpanX = bladeEnd - edgeStart.x;
            const edgeCtrl1X = bladeEnd - edgeSpanX * 0.16;
            const edgeCtrl1Y = tipY + whiteHalf * 0.2;
            const edgeCtrl2X = edgeStart.x + edgeSpanX * 0.38;
            const edgeCtrl2Y = edgeStart.y - whiteHalf * 0.24;
            // 黒レイヤーは少し太く・長くし、峰側の隙間を潰す
            const blackBandWidth = whiteHalf * 1.18;
            const blackTopShift = -0.34;
            const blackBottomOverlap = 0.08;
            const blackTipIndex = Math.min(seg - 1, Math.floor(seg * 0.965));
            const blackTip = {
                x: upperPoints[blackTipIndex].x,
                y: upperPoints[blackTipIndex].y + blackTopShift
            };
            const blackEdgeStartIndex = Math.max(1, Math.floor(blackTipIndex * 0.89));
            const blackEdgeStart = {
                x: upperPoints[blackEdgeStartIndex].x,
                y: upperPoints[blackEdgeStartIndex].y + blackBandWidth + blackBottomOverlap
            };
            const blackEdgeSpanX = blackTip.x - blackEdgeStart.x;
            const blackCtrl1X = blackTip.x - blackEdgeSpanX * 0.16;
            const blackCtrl1Y = blackTip.y + blackBandWidth * 0.2;
            const blackCtrl2X = blackEdgeStart.x + blackEdgeSpanX * 0.38;
            const blackCtrl2Y = blackEdgeStart.y - blackBandWidth * 0.24;

            // --- 白刀身 ---
            // 白を少し銀寄りに抑えて、和鋼の質感に近づける
            ctx.fillStyle = '#e6ecf2';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
            for (let i = 1; i <= seg; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
            // 刃側だけを先端に向けて絞って尖らせる (upperPoints[seg]まで確実に到達させる)
            ctx.bezierCurveTo(edgeCtrl1X, edgeCtrl1Y, edgeCtrl2X, edgeCtrl2Y, edgeStart.x, edgeStart.y);
            for (let i = edgeStartIndex - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
            ctx.closePath();
            ctx.fill();

            // 峰側エッジの明るい隙間を消すためのストロークは、先端でドットが出ないように miter Join にする
            ctx.strokeStyle = '#1b2430';
            ctx.lineWidth = 0.85;
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
            for (let i = 1; i <= blackTipIndex; i++) {
                ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
            }
            ctx.stroke();

            // --- 峰側の黒レイヤ ---
            // 漆黒ではなく暗い鋼色
            ctx.fillStyle = '#1b2430';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, upperPoints[0].y + blackTopShift);
            for (let i = 1; i <= blackTipIndex; i++) {
                ctx.lineTo(upperPoints[i].x, upperPoints[i].y + blackTopShift);
            }
            ctx.bezierCurveTo(blackCtrl1X, blackCtrl1Y, blackCtrl2X, blackCtrl2Y, blackEdgeStart.x, blackEdgeStart.y);
            for (let i = blackEdgeStartIndex - 1; i >= 0; i--) {
                ctx.lineTo(upperPoints[i].x, upperPoints[i].y + blackBandWidth + blackBottomOverlap);
            }
            ctx.closePath();
            ctx.fill();

            // --- 黒と白の境界にグレーのグラデーション ---
            // 刃文を落ち着かせる（細かすぎる波を抑える）
            const seamWaveAmp = 0.10;
            const seamWaveFreq = 7.0;
            const seamBaseY = (i) => upperPoints[i].y + blackBandWidth + blackBottomOverlap;
            const seamWaveY = (i) => {
                if (blackEdgeStartIndex <= 0) return seamBaseY(i);
                const t = i / blackEdgeStartIndex;
                const wave = Math.sin(t * Math.PI * seamWaveFreq) * seamWaveAmp;
                return seamBaseY(i) + wave;
            };
            const seamGrad = ctx.createLinearGradient(
                bladeStart, getArcY(0) + blackBandWidth - 1.1,
                bladeStart, getArcY(0) + blackBandWidth + 0.9
            );
            seamGrad.addColorStop(0, 'rgba(70, 78, 92, 0.82)');
            seamGrad.addColorStop(0.45, 'rgba(145, 155, 170, 0.78)');
            seamGrad.addColorStop(1, 'rgba(225, 234, 244, 0.62)');
            ctx.strokeStyle = seamGrad;
            ctx.lineWidth = 1.15;
            ctx.lineCap = 'butt'; // 先端の丸を消す
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, seamWaveY(0));
            for (let i = 1; i <= blackEdgeStartIndex; i++) {
                ctx.lineTo(upperPoints[i].x, seamWaveY(i));
            }
            ctx.bezierCurveTo(
                blackCtrl2X, blackCtrl2Y + seamWaveAmp * 0.8,
                blackCtrl1X, blackCtrl1Y - seamWaveAmp * 0.6,
                upperPoints[seg].x, upperPoints[seg].y // blackTip.x/y ではなく確実に先端へ
            );
            ctx.stroke();

            // 横手筋（切っ先境界）を薄く追加
            const yokoteX = upperPoints[edgeStartIndex].x;
            const yokoteTopY = upperPoints[edgeStartIndex].y + 0.1;
            const yokoteBottomY = lowerPoints[edgeStartIndex].y - 0.2;
            ctx.strokeStyle = 'rgba(210, 220, 230, 0.38)';
            ctx.lineWidth = 0.42;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(yokoteX, yokoteTopY);
            ctx.lineTo(yokoteX, yokoteBottomY);
            ctx.stroke();

            // 全周輪郭は暗めにして、峰側で白が見えないようにする
            ctx.strokeStyle = '#4e5867';
            ctx.lineWidth = 0.52;
            ctx.lineJoin = 'miter';
            ctx.miterLimit = 6;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
            for (let i = 1; i <= seg; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
            ctx.bezierCurveTo(edgeCtrl1X, edgeCtrl1Y, edgeCtrl2X, edgeCtrl2Y, edgeStart.x, edgeStart.y);
            for (let i = edgeStartIndex - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
            ctx.closePath();
            ctx.stroke();

            // 明るい縁は刃側だけに限定。先端でドットが出ないように butt にする
            ctx.strokeStyle = '#d6e0ea';
            ctx.lineWidth = 0.42;
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(lowerPoints[0].x, lowerPoints[0].y);
            // 切っ先の手前まで描画
            for (let i = 1; i <= edgeStartIndex; i++) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
            // 切っ先の頂点 (upperPoints[seg]) へ正確に結ぶ
            ctx.bezierCurveTo(edgeCtrl2X, edgeCtrl2Y, edgeCtrl1X, edgeCtrl1Y, upperPoints[seg].x, upperPoints[seg].y);
            ctx.stroke();
        }

        ctx.restore();
    }
    

    /**
     * ポニーテールの共通描画メソッド
     */
    renderPonytail(ctx, headCenterX, headY, headRadius, hairBaseX, hairBaseY, facingRight, alpha, options = {}) {
        const hairNodes = Array.isArray(options.hairNodes) ? options.hairNodes : this.hairNodes;
        if (!hairNodes || hairNodes.length <= 1 || alpha <= 0) return;

        const dir = facingRight ? 1 : -1;
        const silhouetteColor = options.silhouetteColor || '#1a1a1a';
        const outlineEnabled = options.outlineEnabled !== false;
        const outlineColor = options.outlineColor || 'rgba(168, 196, 230, 0.29)';
        const outlineExpand = options.outlineExpand || 0.75;

        const hairDenom = Math.max(1, hairNodes.length - 1);
        const hairJoinAngle = Math.atan2(hairBaseY - headY, hairBaseX - headCenterX);

        const smoothedNodes = [];
        for (let i = 0; i < hairNodes.length; i++) {
            let node = { x: hairNodes[i].x, y: hairNodes[i].y };
            if (i === 0) {
                node = { x: hairBaseX - dir * 0.7, y: hairBaseY - 0.15 };
            }
            // 根本から曲がり角（0〜4ノード）を重点的に平滑化
            if (i > 0 && i < 5 && i < hairNodes.length - 1) {
                const prevNode = (i === 1) ? { x: hairBaseX, y: hairBaseY } : hairNodes[i - 1];
                const nextNode = hairNodes[i + 1];
                let wPrev = 0.34;
                let wNode = 0.46;
                let wNext = 0.20;
                if (i === 1) {
                    wPrev = 0.56; wNode = 0.30; wNext = 0.14;
                } else if (i === 2) {
                    wPrev = 0.46; wNode = 0.36; wNext = 0.18;
                }
                node = {
                    x: prevNode.x * wPrev + node.x * wNode + nextNode.x * wNext,
                    y: prevNode.y * wPrev + node.y * wNode + nextNode.y * wNext
                };
            }
            smoothedNodes.push(node);
        }

        const topNodes = [];
        const bottomNodes = [];
        const rootThickness = 13.8;
        const hairHalfSpan = 0.24;
        const rootRadius = headRadius + 0.12;
        const rootNx = -Math.sin(hairJoinAngle);
        const rootNy = Math.cos(hairJoinAngle);
        let prevNx = rootNx;
        let prevNy = rootNy;

        for (let i = 0; i < smoothedNodes.length; i++) {
            const node = smoothedNodes[i];
            const tProgress = i / hairDenom;
            const thickness = Math.max(2.2, rootThickness * (Math.pow(1 - tProgress, 0.88) * 0.90 + 0.10));
            const half = thickness * 0.5;

            if (i === 0) {
                const topA = hairJoinAngle - hairHalfSpan;
                const botA = hairJoinAngle + hairHalfSpan;
                topNodes.push({
                    x: headCenterX + Math.cos(topA) * rootRadius,
                    y: headY + Math.sin(topA) * rootRadius
                });
                bottomNodes.push({
                    x: headCenterX + Math.cos(botA) * rootRadius,
                    y: headY + Math.sin(botA) * rootRadius
                });
                continue;
            }

            const prevNode = smoothedNodes[Math.max(0, i - 1)];
            const nextNode = smoothedNodes[Math.min(smoothedNodes.length - 1, i + 1)];
            const dx = nextNode.x - prevNode.x;
            const dy = nextNode.y - prevNode.y;
            const len = Math.hypot(dx, dy) || 1;
            const tangentNx = -dy / len;
            const tangentNy = dx / len;
            // 伸びた時の見た目を維持しつつ、垂れ下がり時だけ接線法線を強めてペラ化/ねじれを抑える
            const verticality = Math.min(1, Math.abs(dy) / len); // 0:水平, 1:垂直
            const tangentWeight = 0.06 + verticality * 0.64;
            const rootWeight = 1 - tangentWeight;
            let nx = tangentNx * tangentWeight + rootNx * rootWeight;
            let ny = tangentNy * tangentWeight + rootNy * rootWeight;
            const nLen = Math.hypot(nx, ny);
            if (!Number.isFinite(nLen) || nLen < 0.08) {
                nx = prevNx;
                ny = prevNy;
            } else {
                nx /= nLen;
                ny /= nLen;
            }
            // 直前ノードとの向きを揃えて、途中反転を防ぐ
            if (nx * prevNx + ny * prevNy < 0) {
                nx = -nx;
                ny = -ny;
            }
            // 根元基準の向きも維持
            if (nx * rootNx + ny * rootNy < 0) {
                nx = -nx;
                ny = -ny;
            }

            // 上下エッジの対応が入れ替わる場合は明示的に回避する
            if (topNodes.length > 0 && bottomNodes.length > 0) {
                const prevTop = topNodes[topNodes.length - 1];
                const prevBottom = bottomNodes[bottomNodes.length - 1];
                const topX = node.x + nx * half;
                const topY = node.y + ny * half;
                const bottomX = node.x - nx * half;
                const bottomY = node.y - ny * half;
                const normalScore =
                    Math.hypot(topX - prevTop.x, topY - prevTop.y) +
                    Math.hypot(bottomX - prevBottom.x, bottomY - prevBottom.y);
                const swapScore =
                    Math.hypot(bottomX - prevTop.x, bottomY - prevTop.y) +
                    Math.hypot(topX - prevBottom.x, topY - prevBottom.y);
                if (swapScore < normalScore) {
                    nx = -nx;
                    ny = -ny;
                }
            }
            prevNx = nx;
            prevNy = ny;

            topNodes.push({ x: node.x + nx * half, y: node.y + ny * half });
            bottomNodes.push({ x: node.x - nx * half, y: node.y - ny * half });
        }

        // 輪郭点を軽く平滑化して、根元付近の凹みを抑える
        const smoothEdge = (nodes) => {
            if (!Array.isArray(nodes) || nodes.length <= 2) return;
            const src = nodes.map((p) => ({ x: p.x, y: p.y }));
            for (let i = 1; i < nodes.length - 1; i++) {
                const prev = src[i - 1];
                const cur = src[i];
                const next = src[i + 1];
                const curW = i <= 2 ? 0.62 : 0.56;
                const sideW = (1 - curW) * 0.5;
                nodes[i].x = prev.x * sideW + cur.x * curW + next.x * sideW;
                nodes[i].y = prev.y * sideW + cur.y * curW + next.y * sideW;
            }
        };
        smoothEdge(topNodes);
        smoothEdge(bottomNodes);

        // 先端側の余計な立ち上がりを抑えるため、末端を細く収束させる
        const sharpenTip = () => {
            const last = Math.min(topNodes.length, bottomNodes.length) - 1;
            if (last < 1) return;

            const tipCenter = smoothedNodes[last];
            const prevCenter = smoothedNodes[Math.max(0, last - 1)];
            let dx = tipCenter.x - prevCenter.x;
            let dy = tipCenter.y - prevCenter.y;
            let len = Math.hypot(dx, dy);
            if (len < 0.0001) {
                dx = 1;
                dy = 0;
                len = 1;
            }
            let nx = -dy / len;
            let ny = dx / len;
            if (nx * prevNx + ny * prevNy < 0) {
                nx = -nx;
                ny = -ny;
            }

            const tipHalf = 0.62;
            topNodes[last].x = tipCenter.x + nx * tipHalf;
            topNodes[last].y = tipCenter.y + ny * tipHalf;
            bottomNodes[last].x = tipCenter.x - nx * tipHalf;
            bottomNodes[last].y = tipCenter.y - ny * tipHalf;

            if (last >= 2) {
                const shoulder = last - 1;
                const cx = (topNodes[shoulder].x + bottomNodes[shoulder].x) * 0.5;
                const cy = (topNodes[shoulder].y + bottomNodes[shoulder].y) * 0.5;
                const curHalf = Math.hypot(
                    topNodes[shoulder].x - bottomNodes[shoulder].x,
                    topNodes[shoulder].y - bottomNodes[shoulder].y
                ) * 0.5;
                const half = Math.max(1.4, curHalf * 0.92);
                topNodes[shoulder].x = cx + nx * half;
                topNodes[shoulder].y = cy + ny * half;
                bottomNodes[shoulder].x = cx - nx * half;
                bottomNodes[shoulder].y = cy - ny * half;
            }
        };
        // 先端の強制補正は形状を壊しやすいため無効化
        // sharpenTip();

        // 形状確認用: 頭との接続を視覚的に切るため、髪全体を少し後方へずらす
        const debugDetachHairFromHead = false;
        if (debugDetachHairFromHead) {
            const detachX = -dir * 9.0;
            const detachY = 4.0;
            for (const p of topNodes) {
                p.x += detachX;
                p.y += detachY;
            }
            for (const p of bottomNodes) {
                p.x += detachX;
                p.y += detachY;
            }
        }

        const tracePath = () => {
            const contour = [...topNodes, ...bottomNodes.slice().reverse()];
            if (contour.length < 3) return;
            ctx.beginPath();
            const firstMidX = (contour[0].x + contour[1].x) * 0.5;
            const firstMidY = (contour[0].y + contour[1].y) * 0.5;
            ctx.moveTo(firstMidX, firstMidY);
            for (let i = 1; i < contour.length; i++) {
                const p = contour[i];
                const next = contour[(i + 1) % contour.length];
                const midX = (p.x + next.x) * 0.5;
                const midY = (p.y + next.y) * 0.5;
                ctx.quadraticCurveTo(p.x, p.y, midX, midY);
            }
            ctx.quadraticCurveTo(contour[0].x, contour[0].y, firstMidX, firstMidY);
            ctx.closePath();
        };

        if (outlineEnabled) {
            ctx.save();
            // 頭と重なる領域ではポニーテール輪郭を描かない
            const overlapMaskRadius = headRadius + Math.max(0.35, outlineExpand * 0.6);
            ctx.beginPath();
            ctx.rect(-10000, -10000, 20000, 20000);
            ctx.arc(headCenterX, headY, overlapMaskRadius, 0, Math.PI * 2, true);
            ctx.clip('evenodd');
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            tracePath();
            ctx.stroke();
            ctx.restore();
        }

        ctx.fillStyle = silhouetteColor;
        tracePath();
        ctx.fill();
    }

    /**
     * 鉢巻テールの共通描画メソッド
     */
    renderHeadbandTail(ctx, tailRootX, tailRootY, dir, alpha, accentColor, time, options = {}) {
        const scarfNodes = Array.isArray(options.scarfNodes) ? options.scarfNodes : this.scarfNodes;
        if (!scarfNodes || scarfNodes.length <= 1 || alpha <= 0) return;

        const tailShorten = 0.9;
        const rootNodeX = scarfNodes[0].x;
        const rootNodeY = scarfNodes[0].y;

        const mapNode = (node) => ({
            x: tailRootX + (node.x - rootNodeX) * tailShorten,
            y: tailRootY + (node.y - rootNodeY) * tailShorten
        });
        const tailNodes = scarfNodes.map(mapNode);
        if (tailNodes.length > 2) {
            // 描画専用の平滑化。物理ノードは保持して輪郭だけギザつきを抑える
            const smoothPasses = 2;
            for (let pass = 0; pass < smoothPasses; pass++) {
                const src = tailNodes.map((p) => ({ x: p.x, y: p.y }));
                for (let i = 1; i < tailNodes.length - 1; i++) {
                    const prev = src[i - 1];
                    const cur = src[i];
                    const next = src[i + 1];
                    const curWeight = (i <= 2) ? 0.56 : 0.60;
                    const sideWeight = (1 - curWeight) * 0.5;
                    tailNodes[i].x = prev.x * sideWeight + cur.x * curWeight + next.x * sideWeight;
                    tailNodes[i].y = prev.y * sideWeight + cur.y * curWeight + next.y * sideWeight;
                }
            }
        }
        const ribbonHalfWidth = 2.0;
        const leftEdge = [];
        const rightEdge = [];
        let prevNx = 0;
        let prevNy = 1;

        for (let i = 0; i < tailNodes.length; i++) {
            const prevNode = tailNodes[Math.max(0, i - 1)];
            const nextNode = tailNodes[Math.min(tailNodes.length - 1, i + 1)];
            const dx = nextNode.x - prevNode.x;
            const dy = nextNode.y - prevNode.y;
            const len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len;
            let ny = dx / len;
            if (i > 0 && nx * prevNx + ny * prevNy < 0) {
                nx = -nx;
                ny = -ny;
            }
            if (i > 0) {
                nx = nx * 0.38 + prevNx * 0.62;
                ny = ny * 0.38 + prevNy * 0.62;
                const nLen = Math.hypot(nx, ny) || 1;
                nx /= nLen;
                ny /= nLen;
            }
            prevNx = nx;
            prevNy = ny;

            const waveSpeed = 0.0052;
            const wavePhase = i * 0.55;
            const wave = Math.sin(time * waveSpeed + wavePhase);
            const tiltAmp = 0.55;
            const rootDamp = i === 0 ? 0 : (i === 1 ? 0.5 : 1.0);
            const tiltX = wave * tiltAmp * rootDamp;
            const centerX = tailNodes[i].x + tiltX;
            const centerY = tailNodes[i].y;
            const half = ribbonHalfWidth;

            leftEdge.push({ x: centerX - nx * half, y: centerY - ny * half });
            rightEdge.push({ x: centerX + nx * half, y: centerY + ny * half });
        }

        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
        for (let i = 1; i < leftEdge.length; i++) {
            ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
        }
        for (let i = rightEdge.length - 1; i >= 0; i--) {
            ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // 接点の切れ目対策: 根元に小さな埋めパッチを重ねる
        ctx.beginPath();
        ctx.arc(tailRootX, tailRootY + 0.05, ribbonHalfWidth * 0.95, 0, Math.PI * 2);
        ctx.fill();
    }

    render(ctx, options = {}) {
        ctx.save();
        this.subWeaponRenderedInModel = false;
        this.dualBladeTrailAnchors = null;
        const skipSpecialRender = options.skipSpecialRender === true;
        const filterParts = [];
        const ghostVeilActive = this.isGhostVeilActive();
        const ghostSilhouetteAlpha = ghostVeilActive
            ? (
                this.subWeaponAction === '大太刀' && this.subWeaponTimer > 0
                    ? Math.max(0.1, this.getGhostVeilAlpha() * 0.78)
                    : this.getGhostVeilAlpha()
            )
            : 1.0;

        // 必殺技詠唱中は軽く明るくする
        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            const progress = 1 - (this.specialCastTimer / Math.max(1, this.specialCastDurationMs));
            filterParts.push(`brightness(${100 + progress * 28}%)`);
        }

        const damageFlashActive = this.damageFlashTimer > 0;

        // 隠れ身の術中は本体のみ透明化（全体フィルタは重いので適用しない）
        if (filterParts.length > 0) {
            ctx.filter = filterParts.join(' ');
        }

        // 無敵時間中は点滅（死亡中は点滅しない）
        if (!this.isGhostVeilActive() && !this.isDefeated && !this.isUsingSpecial && this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 100) % 2 === 0) {
            ctx.globalAlpha *= 0.5;
        }
        // 被弾フラッシュは filter を使わず軽量な点滅アルファにする
        if (damageFlashActive && !ghostVeilActive && !this.isDefeated) {
            const flashStep = Math.floor((this.motionTime + this.damageFlashTimer) / 48) % 2;
            ctx.globalAlpha *= flashStep === 0 ? 0.76 : 0.92;
        }

        // 残像
        const isOdachiJumping = this.isOdachiJumpAfterimageActive();
        const isSpearThrusting = this.isSpearThrustAfterimageActive();
        if (this.isDashing || Math.abs(this.vx) > PLAYER.SPEED * 1.5 || isOdachiJumping || isSpearThrusting) {
            const sampleStep = ghostVeilActive
                ? 4
                : 2;
            for (let i = 0; i < this.afterImages.length; i += sampleStep) {
                const img = this.afterImages[i];
                if (!img) continue;
                const depthFade = (1 - i / this.afterImages.length);
                const isSpecialShadow = img.type === 'special_shadow';
                const ghostTrailAlphaScale = ghostVeilActive
                    ? (isSpecialShadow ? 0.45 : 0.18)
                    : 1.0;
                const alpha = (isSpecialShadow ? 1.0 : (0.3 * depthFade)) * ghostTrailAlphaScale;
                this.renderModel(ctx, img.x, img.y, img.facingRight, alpha, false, {
                    useLiveAccessories: false,
                    renderHeadband: !ghostVeilActive,
                    renderHeadbandTail: false,
                    renderHair: false
                });
            }
        }

        // 必殺技演出を本体の下に描画
        if (!skipSpecialRender && (this.isUsingSpecial || this.specialSmoke.length > 0)) {
            this.renderSpecial(ctx, options.specialRenderOptions || {});
        }

        // 本体描画
        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            const castOptions = ghostVeilActive
                ? { palette: { silhouette: `rgba(26, 26, 26, 0.0)` } }
                : {};
            // 隠れ身の術中は本体の色を透明にするため 0.0 を渡す。globalAlphaには影響させないことでアクセサリを維持。
            this.renderModel(ctx, this.x, this.y, this.facingRight, ghostVeilActive ? 0.0 : 1.0, false, {
                ...castOptions,
                ninNinPose: true,
                headbandAlpha: ghostVeilActive ? 1.0 : undefined
            });
        } else {
            const renderOptions = ghostVeilActive
                ? { palette: { silhouette: `rgba(26, 26, 26, 0.0)` } }
                : {};
            // 隠れ身の術中は本体の色を透明にするため 0.0 を渡す。globalAlphaには影響させないことでアクセサリを維持。
            this.renderModel(ctx, this.x, this.y, this.facingRight, ghostVeilActive ? 0.0 : 1.0, true, {
                ...renderOptions,
                headbandAlpha: ghostVeilActive ? 1.0 : undefined
            });
        }

        ctx.restore();
        ctx.filter = 'none';
        ctx.shadowBlur = 0;
    }

    renderModel(ctx, x, y, facingRight, alpha = 1.0, renderSubWeaponVisualsInput = true, options = {}) {
        ctx.save();
        // alphaが0の場合でも、鉢巻や武器を描画するためにここではglobalAlphaを操作しない。
        // 本体パーツの個別の描画内部でチェックを行う。

        // alpha が正数かつ1.0未満のフェードイン/アウトなどの場合のみ全体の透明度に掛ける
        if (alpha > 0 && alpha !== 1.0) ctx.globalAlpha *= alpha;

        // 点滅はrender()側で一元管理する（剣筋との位相ズレを防ぐ）

        const useLiveAccessories = options.useLiveAccessories !== false;
        const renderHeadbandTail = options.renderHeadbandTail !== false;
        const headbandAlpha = Number.isFinite(options.headbandAlpha)
            ? Math.max(0, Math.min(1, options.headbandAlpha))
            : alpha;
        const forceSubWeaponRender = options.forceSubWeaponRender || (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流');
        const renderSubWeaponVisuals = renderSubWeaponVisualsInput;
        const accessoryHairNodes = Array.isArray(options.hairNodes) ? options.hairNodes : this.hairNodes;
        const accessoryScarfNodes = Array.isArray(options.scarfNodes) ? options.scarfNodes : this.scarfNodes;

        const originalX = this.x;
        const originalY = this.y;
        this.x = x;
        this.y = y;
        this.forceSubWeaponRender = forceSubWeaponRender;

        const isSilhouetteMode = options.silhouetteMode === true;
        const isNinNinPose = options.ninNinPose === true;

        // 変数定義
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        const state = options.state || this;
        const time = state.motionTime !== undefined ? state.motionTime : this.motionTime;
        const vx = state.vx !== undefined ? state.vx : this.vx;
        const vy = state.vy !== undefined ? state.vy : this.vy;
        const isDashing = state.isDashing !== undefined ? state.isDashing : this.isDashing;
        const isGrounded = state.isGrounded !== undefined ? state.isGrounded : this.isGrounded;
        const isAttacking = state.isAttacking !== undefined ? state.isAttacking : this.isAttacking;
        const currentAttack = state.currentAttack !== undefined ? state.currentAttack : this.currentAttack;
        const attackTimer = state.attackTimer !== undefined ? state.attackTimer : this.attackTimer;
        const subWeaponTimer = state.subWeaponTimer !== undefined ? state.subWeaponTimer : this.subWeaponTimer;
        const subWeaponAction = state.subWeaponAction !== undefined ? state.subWeaponAction : this.subWeaponAction;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const comboStep1IdleTransitionTimer = state.comboStep1IdleTransitionTimer !== undefined
            ? state.comboStep1IdleTransitionTimer
            : this.comboStep1IdleTransitionTimer;
        const comboStep5IdleTransitionTimer = state.comboStep5IdleTransitionTimer !== undefined
            ? state.comboStep5IdleTransitionTimer
            : this.comboStep5IdleTransitionTimer;
        const comboStep5RecoveryAttack = state.comboStep5RecoveryAttack !== undefined
            ? state.comboStep5RecoveryAttack
            : this.comboStep5RecoveryAttack;
        const comboStep5RecoveryDuration = 180; // recoveryMsと一致させる
        const clamp01 = (value) => Math.max(0, Math.min(1, value));

        const isMoving = Math.abs(vx) > 0.1 || !isGrounded;
// ---
        const silhouetteColor = isSilhouetteMode ? (options.palette?.silhouette || '#1a1a1a') : ((options.palette && options.palette.silhouette) || '#1a1a1a');
        const accentColor = isSilhouetteMode ? (options.palette?.accent || '#00bfff') : ((options.palette && options.palette.accent) || '#00bfff');
        const silhouetteOutlineEnabled = isSilhouetteMode ? false : (options.silhouetteOutline !== false);
        const silhouetteOutlineColor = (options.palette && options.palette.silhouetteOutline) || 'rgba(168, 196, 230, 0.29)';
        const outlineExpand = 0.75;
// ---

        const isCrouchPose = isCrouching;
        const isSpearThrustPose = subWeaponTimer > 0 && subWeaponAction === '大槍' && !isAttacking;
        const spearPoseProgress = isSpearThrustPose ? Math.max(0, Math.min(1, 1 - (subWeaponTimer / 270))) : 0;
        const spearDrive = isSpearThrustPose ? Math.sin(spearPoseProgress * Math.PI) : 0;
        const comboPoseAttack = (isAttacking && currentAttack && currentAttack.comboStep)
            ? currentAttack
            : ((comboStep5IdleTransitionTimer > 0 && comboStep5RecoveryAttack && comboStep5RecoveryAttack.comboStep)
                ? comboStep5RecoveryAttack
                : null);
        const comboAttackingPose = !!comboPoseAttack;
        const comboStep5RecoveryActive = !!(
            comboPoseAttack &&
            comboPoseAttack === comboStep5RecoveryAttack &&
            comboStep5IdleTransitionTimer > 0
        );
        // 合計280ms。最初の180ms(280->100)は静止(Blend=0)、後半100ms(100->0)でアイドルへ戻る。
        const comboStep5RecoveryBlend = (comboStep5RecoveryActive && comboStep5IdleTransitionTimer < 100)
            ? (1 - Math.max(0, Math.min(1, comboStep5IdleTransitionTimer / 100)))
            : 0;
        const visualIsAttacking = isAttacking || comboStep5RecoveryActive;
        const comboVisualAttackState = comboAttackingPose
            ? {
                currentAttack: comboPoseAttack,
                attackTimer: comboStep5RecoveryActive ? 0 : attackTimer,
                facingRight,
                x,
                y,
                width: this.width,
                height: this.height,
                isCrouching,
                recoveryBlend: comboStep5RecoveryBlend
            }
            : null;
        const isDualZComboPose = !!(
            !isAttacking &&
            subWeaponTimer > 0 &&
            subWeaponAction === '二刀_Z' &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            typeof this.currentSubWeapon.getMainSwingPose === 'function'
        );

        const dualZPoseOptions = (
            this.subWeaponPoseOverride &&
            subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : undefined;
        const dualZPose = isDualZComboPose
            ? this.currentSubWeapon.getMainSwingPose(dualZPoseOptions || {})
            : null;
        const useDualZCustomLegPose = options.useDualZCustomLegPose === true;
        const speedAbs = Math.abs(vx);
        const legTransitionLocked = comboStep1IdleTransitionTimer > 0;
        const comboStepPose = comboAttackingPose && comboPoseAttack ? (comboPoseAttack.comboStep || 0) : 0;
        const comboPoseProgress = comboStepPose
            ? (
                comboPoseAttack === comboStep5RecoveryAttack
                    ? 1.0 // 余韻中はモーションの最終ポーズ(1.0)を維持
                    : clamp01(1 - (attackTimer / Math.max(1, (comboPoseAttack && comboPoseAttack.durationMs) || PLAYER.ATTACK_COOLDOWN)))
            )
            : 0;
        const isRunLike = !isNinNinPose && !comboAttackingPose && !legTransitionLocked && isGrounded && speedAbs > 0.85;
        const isDashLike = !isNinNinPose && !comboAttackingPose && !legTransitionLocked && (isDashing || speedAbs > this.speed * 1.45);
        const locomotionPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
        const crouchWalkPhase = (isCrouchPose && isRunLike) ? locomotionPhase : 0;
        const crouchIdlePhase = (isCrouchPose && !isRunLike) ? Math.sin(this.motionTime * 0.006) : 0;
        const crouchBodyBob = isCrouchPose
            ? (isRunLike ? crouchWalkPhase * 0.4 : crouchIdlePhase * 0.2)
            : 0;
        const crouchLeanShift = isCrouchPose ? crouchWalkPhase * 0.55 : 0;

        let bob = 0;
        if (isNinNinPose) {
            bob = 0;
        } else if (isCrouchPose) {
            bob = crouchBodyBob;
        } else if (!isGrounded) {
            bob = Math.max(-1.4, Math.min(1.6, -vy * 0.07));
        } else if (comboStepPose === 1 || comboStepPose === 2) {
            // Z1〜2段は歩行揺れを無効化し、短い重心移動のみで自然化
            bob = -Math.sin(comboPoseProgress * Math.PI) * 0.34;
        } else if (isRunLike) {
            bob = Math.abs(locomotionPhase) * (isDashLike ? 3.6 : 2.5);
        } else {
            bob = Math.sin(this.motionTime * 0.005) * 1.0;
        }

        const headRatio = options.headRatio || (14 * 2 / 60); // デフォルトは約2.1頭身（チビキャラ）
        const headScale = options.headScale || 1.0;
        // しゃがみ中はthis.heightが半分になるため、PLAYER.HEIGHTを基準にして
        // 頭が極端に小さくならないよう0.80倍でほどよい大きさにする
        const baseHeightForHead = isCrouching ? PLAYER.HEIGHT : this.height; // しゃがみ時も頭サイズを変えない
        const headRadius = (baseHeightForHead * headRatio * 0.5) * headScale;
        
        let headY = isCrouchPose
            ? (bottomY - headRadius * 2.2 + bob)
            : (y + headRadius * 1.1 + bob - (isSpearThrustPose ? spearDrive * 2.0 : 0));
            
        // 頭が胴体へ食い込んで見えないよう、胴体の起点を頭の下端寄りに下げる
        let bodyTopY = headY + (isCrouchPose ? headRadius * 1.01 : headRadius * 1.03);
        let hipY = isCrouchPose
            ? (bottomY - headRadius * 0.95 + bob * 0.45)
            : (bottomY - headRadius * 1.43 - (isSpearThrustPose ? spearDrive * 1.7 : 0));

        // 腰を上げるほど「胴が短く脚が長い」比率になる（主にボス向けの見た目調整）
        const hipLiftPx = Number.isFinite(options.hipLiftPx) ? options.hipLiftPx : 0;
        if (hipLiftPx !== 0) {
            hipY -= hipLiftPx;
        }

        let currentTorsoLean = isNinNinPose ? dir * 0.45 : (isDashLike ? dir * 2.4 : (isRunLike ? dir * 1.6 : dir * 0.45));
        if (comboStepPose === 1) currentTorsoLean = dir * 0.24;
        if (comboStepPose === 2) currentTorsoLean = dir * 1.2;
        let torsoShoulderX = centerX + (isCrouchPose ? dir * 4.0 : currentTorsoLean) + dir * crouchLeanShift;
        let torsoHipX = isCrouchPose
            ? (centerX + dir * 1.3 + dir * crouchLeanShift * 0.55)
            : (centerX + dir * 0.2);
        let headCenterX = centerX;
        let headSpinAngle = 0;
        const baseTorsoShoulderXForHeadTrack = torsoShoulderX;
        let dualZShoulderDepth = 0;
        let dualZHipDepth = 0;
        let dualZHeadParallax = 0;

        {
            // 通常ポーズ計算（攻撃・武器・移動など）
            if (isSpearThrustPose) {
                const spearWindup = Math.max(0, 1 - (spearPoseProgress / 0.34));
                const spearLungeT = Math.max(0, Math.min(1, (spearPoseProgress - 0.16) / 0.62));
                const spearLunge = Math.sin(spearLungeT * Math.PI * 0.5);
                torsoShoulderX += dir * (2.8 + spearLunge * 5.6 - spearWindup * 1.1);
                torsoHipX += dir * (0.9 + spearLunge * 2.2 - spearWindup * 0.5);
                headCenterX += dir * (1.2 + spearLunge * 2.8);
            }
            if (isDualZComboPose && dualZPose) {
                const p = dualZPose.progress || 0;
                const s = dualZPose.comboIndex || 0;
                const wave = Math.sin(p * Math.PI);
                const twist = Math.sin(p * Math.PI * 2);
                if (s === 1) {
                    // 1撃目: 前のめりではなく、二刀流アイドルの見得を残したまま軽く画面側へ開く
                    headY -= 0.72 + wave * 0.62;
                    bodyTopY -= 0.58 + wave * 0.46;
                    hipY -= 0.18 + wave * 0.2;
                    torsoShoulderX += dir * (0.42 + wave * 0.88);
                    torsoHipX += dir * (0.12 + wave * 0.3);
                    headCenterX -= dir * (0.12 + wave * 0.18);
                    dualZShoulderDepth = 1.05 + wave * 0.18;
                    dualZHipDepth = 0.72 + wave * 0.12;
                    dualZHeadParallax = 0.24 + wave * 0.08;
                } else if (s === 2) {
                    // 2撃目: 肩を大きく返し、腰は逆へ残して体幹で打ち分ける
                    headY -= 0.52 + wave * 0.96;
                    bodyTopY -= 0.36 + wave * 0.74;
                    hipY -= 0.12 + wave * 0.22;
                    torsoShoulderX -= dir * (1.9 + wave * 2.5);
                    torsoHipX += dir * (0.16 + wave * 0.44);
                    headCenterX -= dir * (0.72 + wave * 0.34);
                    dualZShoulderDepth = 1.88 + wave * 0.42;
                    dualZHipDepth = 1.18 + wave * 0.24;
                    dualZHeadParallax = 0.42 + wave * 0.14;
                } else if (s === 3) {
                    // 3撃目: 腰から踏み替えて胸ごと前へ出し、全身で抜ける
                    headY -= 0.6 + wave * 0.78;
                    bodyTopY -= 0.4 + wave * 0.56;
                    hipY -= 0.16 + wave * 0.22;
                    torsoShoulderX += dir * (1.34 + twist * 3.0);
                    torsoHipX -= dir * (1.04 + wave * 1.12);
                    headCenterX += dir * (0.42 + twist * 0.36);
                    dualZShoulderDepth = 2.0 + wave * 0.3;
                    dualZHipDepth = 1.42 + wave * 0.24;
                    dualZHeadParallax = 0.46 + wave * 0.12;
                } else if (s === 4) {
                    // 四段: 上昇しながら海老反りへ。終端で胸を開き、剣をクロスできる体幹を作る
                    const rise = Math.max(0, Math.min(1, p / 0.74));
                    const arch = Math.max(0, Math.min(1, (p - 0.74) / 0.26));
                    const riseEase = rise * rise * (3 - 2 * rise);
                    const archEase = arch * arch * (3 - 2 * arch);
                    headY -= 1.2 + riseEase * 3.6 + archEase * 2.5;
                    bodyTopY -= 1.0 + riseEase * 2.9 + archEase * 1.9;
                    hipY -= 0.35 + riseEase * 1.2;
                    torsoShoulderX += dir * (1.1 + riseEase * 2.8 - archEase * 2.6 + twist * 0.45);
                    torsoHipX += dir * (0.25 + riseEase * 0.95 + archEase * 0.7);
                    headCenterX -= dir * archEase * 1.9;
                    dualZShoulderDepth = 1.34 + riseEase * 0.28 + archEase * 0.24;
                    dualZHipDepth = 0.96 + riseEase * 0.2 + archEase * 0.16;
                    dualZHeadParallax = 0.3 + archEase * 0.18;
                } else {
                    // 五段: 海老反りから一気に叩きつけ。開始時クロス、終盤で左右に開く
                    const dive = p * p * (3 - 2 * p);
                    const smash = Math.max(0, Math.min(1, (p - 0.22) / 0.78));
                    const smashEase = smash * smash * (3 - 2 * smash);
                    headY -= 4.6 - dive * 3.0;
                    bodyTopY -= 3.4 - dive * 2.4;
                    torsoShoulderX += dir * (0.9 + smashEase * 2.2);
                    torsoHipX += dir * (0.28 + smashEase * 1.25);
                    dualZShoulderDepth = 1.08 + smashEase * 0.24;
                    dualZHipDepth = 0.82 + smashEase * 0.18;
                    dualZHeadParallax = 0.24 + smashEase * 0.08;
                }
            }
            if (isDualZComboPose) {
                // 二刀Z中は頭を胴体の肩位置へ追従させ、首が常に接続されるようにする
                const shoulderShiftX = torsoShoulderX - baseTorsoShoulderXForHeadTrack;
                headCenterX += shoulderShiftX * 0.72;
                bodyTopY = headY + (isCrouchPose ? headRadius * 1.01 : headRadius * 1.03);
            }
            if (isSpearThrustPose) {
                // 大槍中は頭を胴（肩）移動へ追従させ、首元のズレを防ぐ
                const shoulderShiftX = torsoShoulderX - baseTorsoShoulderXForHeadTrack;
                const targetHeadX = centerX + shoulderShiftX * 0.86;
                headCenterX += (targetHeadX - headCenterX) * 0.92;
            }
            if (comboAttackingPose && this.currentAttack && this.currentAttack.comboStep === 4) {
                const comboDuration = Math.max(1, this.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                const comboProgress = Math.max(0, Math.min(1, 1 - (this.attackTimer / comboDuration)));
                const riseT = Math.min(1, comboProgress / 0.42);
                const flipT = Math.max(0, Math.min(1, (comboProgress - 0.42) / 0.58));
                const flipEase = flipT * flipT * (3 - 2 * flipT);
                const riseEase = riseT * riseT * (3 - 2 * riseT);
                const riseLift = Math.sin(riseEase * Math.PI * 0.5) * 8.9 * 0.78;
                if (flipT <= 0.0001) {
                    // 上昇区間は回転を入れず、三段目終端から自然に持ち上がる姿勢を維持
                    hipY -= riseLift * 0.46;
                    bodyTopY -= riseLift * 0.96;
                    headY -= riseLift * 1.08;
                    torsoShoulderX -= dir * (riseEase * 0.5);
                    torsoHipX -= dir * (riseEase * 0.35);
                    headSpinAngle = 0;
                } else {
                    // 後半で「後方宙返り1回転」を行う
                    const flipAngle = -Math.PI * 2 * flipEase;
                    const axisX = Math.sin(flipAngle) * dir;
                    const axisY = Math.cos(flipAngle);
                    const normalX = Math.cos(flipAngle) * dir;
                    const normalY = -Math.sin(flipAngle);
                    headSpinAngle = flipAngle;
                    const torsoHalfLen = 9.9;
                    const torsoMidX = centerX - dir * (0.8 + flipEase * 9.6);
                    const torsoMidY = (headY + 9.9) - riseLift + Math.sin(flipEase * Math.PI) * 0.58;
                    torsoShoulderX = torsoMidX - axisX * torsoHalfLen;
                    bodyTopY = torsoMidY - axisY * torsoHalfLen;
                    torsoHipX = torsoMidX + axisX * torsoHalfLen;
                    hipY = torsoMidY + axisY * torsoHalfLen;
                    // 頭は首方向へ追従。完全固定せず少し遊ばせる
                    const neckDist = 7.6;
                    headCenterX = torsoShoulderX - axisX * neckDist + normalX * 0.22;
                    headY = bodyTopY - axisY * neckDist + normalY * 0.14;
                }
            }
        }

        // 頭位置補正は首元(胴体上端)も同時に追従させ、接続が切れないようにする
        if (!isCrouchPose) {
            const headLift = 3.2;
            headY -= headLift;
            bodyTopY -= headLift;
        }

        // 肩アンカーを胴体ライン上に固定し、腕の付け根が肩から自然に繋がるようにする
        const shoulderAttachT = isCrouchPose ? 0.12 : 0.15;
        const shoulderAnchorX = torsoShoulderX + (torsoHipX - torsoShoulderX) * shoulderAttachT;
        const shoulderAnchorY = bodyTopY + (hipY - bodyTopY) * (isCrouchPose ? 0.09 : 0.11);
        let leftShoulderXShared = shoulderAnchorX + dir * 0.18;
        let leftShoulderYShared = shoulderAnchorY + (isCrouchPose ? 0.35 : 0.45);
        let rightShoulderXShared = shoulderAnchorX - dir * (isCrouchPose ? 0.28 : 0.38);
        let rightShoulderYShared = shoulderAnchorY + (isCrouchPose ? 0.55 : 0.65);
        if (isDualZComboPose) {
            // 二刀流通常コンボでも、合体技に近い前後差を肩・胸に残して2.5D感を出す
            leftShoulderXShared += dir * (0.26 + dualZShoulderDepth * 0.34);
            leftShoulderYShared -= dualZShoulderDepth * (isCrouchPose ? 0.2 : 0.28);
            rightShoulderXShared -= dir * (0.34 + dualZShoulderDepth * 0.52);
            rightShoulderYShared += dualZShoulderDepth * (isCrouchPose ? 0.26 : 0.34);
            headCenterX -= dir * dualZHeadParallax;
            torsoHipX -= dir * dualZHipDepth * 0.12;
        }
        const idleArmWave = Math.sin(this.motionTime * 0.01);
        const singleKatanaLeftHandXShared = centerX + dir * (isCrouchPose ? 11.5 : 14.0);
        const singleKatanaLeftHandYShared = leftShoulderYShared + (isCrouchPose ? 6.2 : 7.8) + idleArmWave * (isCrouchPose ? 0.8 : 1.7);
        // 真のアイドル基準は片刀構え。二刀流の右手だけ別基準にする
        const dualWieldRightHandXShared = centerX - dir * (isCrouchPose ? 4.6 : 7.2);
        const dualWieldRightHandYShared = rightShoulderYShared + (isCrouchPose ? 6.8 : 8.5) + Math.sin(this.motionTime * 0.01 + 0.5) * (isCrouchPose ? 0.8 : 1.7);
        const armReachScale = Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0;
        const stretchFromShoulder = (shoulderX, shoulderY, targetX, targetY) => {
            if (Math.abs(armReachScale - 1.0) < 0.001) return { x: targetX, y: targetY };
            return {
                x: shoulderX + (targetX - shoulderX) * armReachScale,
                y: shoulderY + (targetY - shoulderY) * armReachScale
            };
        };
        const getSingleKatanaIdleHandPose = (reachScale = armReachScale) => {
            const projectHand = (shoulderX, shoulderY, targetX, targetY) => {
                if (Math.abs(reachScale - 1.0) < 0.001) return { x: targetX, y: targetY };
                return {
                    x: shoulderX + (targetX - shoulderX) * reachScale,
                    y: shoulderY + (targetY - shoulderY) * reachScale
                };
            };
            const clampReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
                const dx = targetX - shoulderX;
                const dy = targetY - shoulderY;
                const dist = Math.hypot(dx, dy);
                if (dist <= maxLen || dist === 0) return { x: targetX, y: targetY };
                const ratio = maxLen / dist;
                return { x: shoulderX + dx * ratio, y: shoulderY + dy * ratio };
            };
            const leftShoulderX = leftShoulderXShared;
            const leftShoulderY = leftShoulderYShared;
            const rightShoulderX = rightShoulderXShared;
            const rightShoulderY = rightShoulderYShared;
            const leftHand = projectHand(
                leftShoulderX,
                leftShoulderY,
                singleKatanaLeftHandXShared,
                singleKatanaLeftHandYShared
            );
            const bladeAngle = isCrouchPose ? -0.32 : -0.65;
            const bladeDirX = Math.cos(bladeAngle) * dir;
            const bladeDirY = Math.sin(bladeAngle);
            const perpX = -bladeDirY;
            const perpY = bladeDirX;
            const rightHand = clampReach(
                rightShoulderX,
                rightShoulderY,
                leftHand.x - bladeDirX * 5.8 + perpX * 1.0,
                leftHand.y - bladeDirY * 5.8 + perpY * 1.0,
                22 * reachScale
            );
            return {
                leftShoulderX,
                leftShoulderY,
                rightShoulderX,
                rightShoulderY,
                leftHand,
                rightHand,
                bladeAngle
            };
        };

        // 通常の腕・武器描画

        // 通常構え時の「奥の手」は胴体・頭より先に描いて背面化する
        const dualBladePre = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverridePre = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const effectiveSubWeaponTimerPre = (dualBladePre && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
            ? (dualPoseOverridePre && Number.isFinite(dualPoseOverridePre.attackTimer)
                ? dualPoseOverridePre.attackTimer
                : dualBladePre.attackTimer)
            : this.subWeaponTimer;
        const isActuallyAttackingPre = visualIsAttacking || (effectiveSubWeaponTimerPre > 0 && subWeaponAction !== 'throw');
        const isIdleForceRenderPre = forceSubWeaponRender && !subWeaponAction && subWeaponTimer <= 0;
        const kusaKeepIdleBackArm =
            !visualIsAttacking &&
            effectiveSubWeaponTimerPre > 0 &&
            subWeaponAction === '鎖鎌';
        const renderIdleBackArmBehind = isNinNinPose || (
            kusaKeepIdleBackArm ||
            (!isActuallyAttackingPre && (!forceSubWeaponRender || isIdleForceRenderPre))
        );
        if (renderIdleBackArmBehind) {
            const singleKatanaIdlePosePre = getSingleKatanaIdleHandPose(
                Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0
            );
            const leftShoulderXPre = singleKatanaIdlePosePre.leftShoulderX;
            const leftShoulderYPre = singleKatanaIdlePosePre.leftShoulderY;
            const handRadiusScalePre = 0.94;
            const insetAlongSegmentPre = (fromX, fromY, toX, toY, insetPx = 0) => {
                if (insetPx <= 0) return { x: fromX, y: fromY };
                const dx = toX - fromX;
                const dy = toY - fromY;
                const len = Math.hypot(dx, dy);
                if (len <= 0.0001) return { x: fromX, y: fromY };
                const t = Math.min(1, insetPx / len);
                return { x: fromX + dx * t, y: fromY + dy * t };
            };
            const idleLeftHandPre = singleKatanaIdlePosePre.leftHand;
            const preArmDX = idleLeftHandPre.x - leftShoulderXPre;
            const preArmDY = idleLeftHandPre.y - leftShoulderYPre;
            const preArmDist = Math.hypot(preArmDX, preArmDY);
            let preElbowX = leftShoulderXPre + preArmDX * 0.54;
            let preElbowY = leftShoulderYPre + preArmDY * 0.54;
            if (preArmDist > 0.001) {
                const preNX = -preArmDY / preArmDist;
                const preNY = preArmDX / preArmDist;
                const preBendScale = isCrouchPose ? 0.11 : 0.15;
                const preBend = preArmDist * preBendScale;
                preElbowX += preNX * preBend * dir;
                preElbowY += preNY * preBend * dir + 0.25;
        }
        const idleLeftBladeAnglePre = isCrouchPose ? -0.32 : -0.65;
	        if (alpha > 0) {
	            const preArmStart = insetAlongSegmentPre(leftShoulderXPre, leftShoulderYPre, preElbowX, preElbowY, 1.2);
	            if (silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = 4.8 + outlineExpand;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(preArmStart.x, preArmStart.y);
                ctx.lineTo(preElbowX, preElbowY);
                ctx.lineTo(idleLeftHandPre.x, idleLeftHandPre.y);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = 4.8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(leftShoulderXPre, leftShoulderYPre);
            ctx.lineTo(preElbowX, preElbowY);
            ctx.lineTo(idleLeftHandPre.x, idleLeftHandPre.y);
            ctx.stroke();
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(idleLeftHandPre.x, idleLeftHandPre.y, 4.8 * handRadiusScalePre, 0, Math.PI * 2);
            ctx.fill();
	            if (!isNinNinPose) {
	                this.drawKatana(ctx, idleLeftHandPre.x, idleLeftHandPre.y, idleLeftBladeAnglePre, dir);
	            }
	        }
	        }
	        
	        const drawTorsoSegment = (withOutline = true, alphaVal = alpha) => {
            if (alphaVal <= 0) return;
            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = 10 + outlineExpand;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(torsoShoulderX, bodyTopY);
                ctx.lineTo(torsoHipX, hipY);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(torsoShoulderX, bodyTopY);
            ctx.lineTo(torsoHipX, hipY);
            ctx.stroke();
        };

        // 足
        const backLegOverlayQueue = [];
        const drawJointedLeg = (
            hipX,
            hipYLocal,
            kneeX,
            kneeY,
            footX,
            footY,
            isFrontLeg = false,
            bendBias = 1,
            bendDirSign = null,
            storeForOverlay = true,
            overlayInFront = null,
            withOutline = true
        ) => {
            if (alpha <= 0) return;
            const defaultOverlayInFront = ((hipX - torsoHipX) * dir) <= 0;
            if (storeForOverlay && (overlayInFront === null ? defaultOverlayInFront : overlayInFront)) {
                backLegOverlayQueue.push([hipX, hipYLocal, kneeX, kneeY, footX, footY, isFrontLeg, bendBias, bendDirSign]);
            }
            const thighWidth = isFrontLeg ? 4.8 : 4.6;
            const shinWidth = isFrontLeg ? 4.8 : 4.6;
            // 膝丸は脚線幅を超過させない（接続を真っ直ぐ見せる）
            const kneeRadius = Math.min(thighWidth, shinWidth) * 0.5;
            // 脚の付け根を胴体下端へ寄せて接続を自然にし、腿長をやや短くする
            const hipAttachBlendY = isCrouchPose ? 0.18 : 0.1;
            // 付け根が胴体へめり込まないよう、わずかに外側へ逃がす
            const hipOutSign = (hipX >= torsoHipX) ? 1 : -1;
            const hipRootX = hipX + hipOutSign * 1.05;
            // Yは胴体下端寄りへ固定して、付け根接続を明確化
            const hipRootY = hipY + (hipYLocal - hipY) * hipAttachBlendY;
            // 腿の長さは通常寄りに戻す
            const thighScale = 1.0;
            let kneeAdjX = hipRootX + (kneeX - hipRootX) * thighScale;
            // 通常時は膝を少し下げる。1撃目開始直後のみ段差が出ないよう補間する
            let kneeYOffset = 0.35;
            if (comboAttackingPose) {
                if (comboStepPose === 1) {
                    const startBlend = Math.max(0, Math.min(1, comboPoseProgress / 0.28));
                    const startEase = startBlend * startBlend * (3 - 2 * startBlend);
                    kneeYOffset = 0.35 * (1 - startEase);
                } else {
                    kneeYOffset = 0;
                }
            }
            let kneeAdjY = hipRootY + (kneeY - hipRootY) * thighScale + kneeYOffset;
            const legDX = footX - hipRootX;
            const legDY = footY - hipRootY;
            const legLen = Math.max(0.001, Math.hypot(legDX, legDY));
            const legUX = legDX / legLen;
            const legUY = legDY / legLen;
            const normalX = -legUY;
            const normalY = legUX;
            const kneeProj = (kneeAdjX - hipRootX) * legUX + (kneeAdjY - hipRootY) * legUY;
            const kneeOnLineX = hipRootX + legUX * kneeProj;
            const kneeOnLineY = hipRootY + legUY * kneeProj;
            const signedBend = (kneeAdjX - kneeOnLineX) * normalX + (kneeAdjY - kneeOnLineY) * normalY;
            const minBend = (isFrontLeg ? 2.35 : 2.05) * Math.max(0, bendBias);
            if (alpha > 0) {
                ctx.strokeStyle = silhouetteColor;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                const footRadius = isFrontLeg ? 1.9 : 1.65;
                const footCenterX = footX;
                const footCenterY = footY + 0.22;
                if (withOutline && silhouetteOutlineEnabled) {
                    const legRootInset = isFrontLeg ? 0.95 : 0.75;
                    const legStart = (() => {
                        const dx = kneeAdjX - hipRootX;
                        const dy = kneeAdjY - hipRootY;
                        const len = Math.hypot(dx, dy);
                        if (len <= 0.0001) return { x: hipRootX, y: hipRootY };
                        const t = Math.min(1, legRootInset / len);
                        return { x: hipRootX + dx * t, y: hipRootY + dy * t };
                    })();
                    ctx.strokeStyle = silhouetteOutlineColor;
                    ctx.lineWidth = shinWidth + outlineExpand;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(legStart.x, legStart.y);
                    ctx.lineTo(kneeAdjX, kneeAdjY);
                    ctx.lineTo(footCenterX, footCenterY);
                    ctx.stroke();
                }
                ctx.strokeStyle = silhouetteColor;
                ctx.lineWidth = thighWidth;
                ctx.beginPath();
                ctx.moveTo(hipRootX, hipRootY);
                ctx.lineTo(kneeAdjX, kneeAdjY);
                ctx.stroke();
                ctx.lineWidth = shinWidth;
                ctx.beginPath();
                ctx.moveTo(kneeAdjX, kneeAdjY);
                ctx.lineTo(footCenterX, footCenterY);
                ctx.stroke();
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(kneeAdjX, kneeAdjY, kneeRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(footCenterX, footCenterY, footRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        if (useDualZCustomLegPose && isDualZComboPose && dualZPose && !isSpearThrustPose && !isCrouchPose) {
            const comboStep = dualZPose.comboIndex || 0;
            const comboProgress = dualZPose.progress || 0;
            const comboArc = Math.sin(comboProgress * Math.PI);
            const airborneLift = (!this.isGrounded ? 4.2 : 0) + ((comboStep === 4 || comboStep === 0) ? comboArc * 3.4 : 0);
            const hipLocalY = hipY - airborneLift;
            const leftHipX = torsoHipX + dir * 1.2;
            const rightHipX = torsoHipX - dir * 1.0;
            let leftKneeX = leftHipX + dir * 0.9;
            let leftKneeY = hipLocalY + 9.3;
            let leftFootX = centerX + dir * 2.9;
            let leftFootY = bottomY - 0.3 - airborneLift * 0.48;
            let rightKneeX = rightHipX + dir * 0.8;
            let rightKneeY = hipLocalY + 9.1;
            let rightFootX = centerX - dir * 2.7;
            let rightFootY = bottomY - 0.2 - airborneLift * 0.44;
            if (comboStep === 1) {
                leftKneeX = leftHipX + dir * (0.45 + comboArc * 0.24); leftKneeY = hipLocalY + 9.1 - comboArc * 0.18; leftFootX = centerX - dir * (2.4 + comboArc * 0.6); leftFootY = bottomY - 0.22 - airborneLift * 0.2; rightKneeX = rightHipX + dir * (0.95 + comboArc * 0.42); rightKneeY = hipLocalY + 8.9 - comboArc * 0.2; rightFootX = centerX + dir * (3.0 + comboArc * 1.0); rightFootY = bottomY - 0.38 - airborneLift * 0.22;
            } else if (comboStep === 2) {
                leftKneeX = leftHipX - dir * (2.5 + comboArc * 1.6); leftKneeY = hipLocalY + 8.3 - comboArc * 1.0; leftFootX = centerX - dir * (7.4 + comboArc * 2.8); leftFootY = bottomY - 1.0 - airborneLift * 0.36; rightKneeX = rightHipX + dir * (2.1 + comboArc * 1.2); rightKneeY = hipLocalY + 8.4 - comboArc * 0.8; rightFootX = centerX + dir * (6.2 + comboArc * 2.2); rightFootY = bottomY - 0.8 - airborneLift * 0.32;
            } else if (comboStep === 3) {
                leftKneeX = leftHipX - dir * (0.8 - comboArc * 3.2); leftKneeY = hipLocalY + 8.6 - comboArc * 1.4; leftFootX = centerX - dir * (1.8 - comboArc * 7.2); leftFootY = bottomY - 0.9 - airborneLift * 0.4; rightKneeX = rightHipX + dir * (3.4 + comboArc * 2.4); rightKneeY = hipLocalY + 7.9 - comboArc * 1.2; rightFootX = centerX + dir * (5.4 + comboArc * 8.8); rightFootY = bottomY - 1.2 - airborneLift * 0.42;
            } else if (comboStep === 4) {
                leftKneeX = leftHipX - dir * (0.8 + comboArc * 1.7); leftKneeY = hipLocalY + 8.0 - comboArc * 2.7; leftFootX = centerX - dir * (4.8 + comboArc * 5.4); leftFootY = bottomY - 1.2 - airborneLift * 0.74 - comboArc * 1.2; rightKneeX = rightHipX + dir * (0.5 + comboArc * 0.7); rightKneeY = hipLocalY + 7.8 - comboArc * 2.5; rightFootX = centerX + dir * (1.8 + comboArc * 3.2); rightFootY = bottomY - 1.4 - airborneLift * 0.72 - comboArc * 1.3;
            } else if (comboStep === 0) {
                leftKneeX = leftHipX - dir * (2.2 - comboArc * 3.0); leftKneeY = hipLocalY + 7.8 + comboArc * 2.3; leftFootX = centerX - dir * (7.8 - comboArc * 12.0); leftFootY = bottomY - 1.8 + comboArc * 2.0 - airborneLift * 0.68; rightKneeX = rightHipX - dir * (1.1 - comboArc * 3.4); rightKneeY = hipLocalY + 7.6 + comboArc * 2.4; rightFootX = centerX - dir * (4.9 - comboArc * 11.2); rightFootY = bottomY - 1.9 + comboArc * 2.1 - airborneLift * 0.7;
            }
            // 二刀Z中の脚重ね順は固定: 後ろ足を手前、前足を奥
            drawJointedLeg(leftHipX, hipLocalY + 0.3, leftKneeX, leftKneeY, leftFootX, leftFootY, false, 1.1, null, true, true);
            drawJointedLeg(rightHipX, hipLocalY + 0.1, rightKneeX, rightKneeY, rightFootX, rightFootY, true, 1.08, null, true, false);
        } else if (comboAttackingPose && !isSpearThrustPose && !isCrouchPose) {
            const attack = comboPoseAttack || currentAttack || this.currentAttack;
            if (!attack) { this.x = originalX; this.y = originalY; ctx.restore(); return; }
            const comboStep = attack.comboStep || 1;
            const comboProgress = (comboStep === 5 && comboStep5RecoveryActive)
                ? 1
                : comboPoseProgress;
            const comboArc = Math.sin(comboProgress * Math.PI);
            const baseLift = Math.max(0, Math.min(1, Math.abs(vx) / 14));
            const airborneLift = !isGrounded ? 4.8 + baseLift * 4.4 : 0;
            const hipLocalY = hipY - airborneLift;
            const leftHipX = torsoHipX + dir * 1.3;
            const rightHipX = torsoHipX - dir * 1.2;
            let leftKneeX = leftHipX + dir * 0.8, leftKneeY = hipLocalY + 10.1, leftFootX = centerX + dir * 2.6, leftFootY = bottomY + 0.2 - airborneLift * 0.55;
            let rightKneeX = rightHipX + dir * 0.9, rightKneeY = hipLocalY + 9.5, rightFootX = centerX - dir * 3.0, rightFootY = bottomY - 0.2 - airborneLift * 0.52;
            if (comboStep === 2) {
                // 2撃目: 初期→踏み込み→終端を単調補間してブレを防ぐ
                const smooth = (t) => t * t * (3 - 2 * t);
                const lerp = (a, b, t) => a + (b - a) * t;
                const blendPose = (a, b, t) => ({
                    leftKneeX: lerp(a.leftKneeX, b.leftKneeX, t),
                    leftKneeY: lerp(a.leftKneeY, b.leftKneeY, t),
                    leftFootX: lerp(a.leftFootX, b.leftFootX, t),
                    leftFootY: lerp(a.leftFootY, b.leftFootY, t),
                    rightKneeX: lerp(a.rightKneeX, b.rightKneeX, t),
                    rightKneeY: lerp(a.rightKneeY, b.rightKneeY, t),
                    rightFootX: lerp(a.rightFootX, b.rightFootX, t),
                    rightFootY: lerp(a.rightFootY, b.rightFootY, t)
                });
                const startPose = {
                    // 一段目終端の姿勢からそのまま開始
                    leftKneeX: leftHipX - dir * 2.0,
                    leftKneeY: hipLocalY + 8.8,
                    leftFootX: centerX - dir * 5.2,
                    leftFootY: bottomY - 0.88 - airborneLift * 0.5,
                    rightKneeX: rightHipX + dir * 3.4,
                    rightKneeY: hipLocalY + 9.08,
                    rightFootX: centerX + dir * 8.7,
                    rightFootY: bottomY - 0.5 - airborneLift * 0.48
                };
                const drivePose = {
                    leftKneeX: leftHipX + dir * 3.5,
                    leftKneeY: hipLocalY + 8.8,
                    leftFootX: centerX + dir * 9.4,
                    leftFootY: bottomY - 0.86 - airborneLift * 0.46,
                    rightKneeX: rightHipX - dir * 3.4,
                    rightKneeY: hipLocalY + 8.4,
                    rightFootX: centerX - dir * 9.1,
                    rightFootY: bottomY - 1.18 - airborneLift * 0.46
                };
                const settlePose = {
                    leftKneeX: leftHipX + dir * 2.8,
                    leftKneeY: hipLocalY + 8.95,
                    leftFootX: centerX + dir * 8.0,
                    leftFootY: bottomY - 0.84 - airborneLift * 0.46,
                    rightKneeX: rightHipX - dir * 2.7,
                    rightKneeY: hipLocalY + 8.55,
                    rightFootX: centerX - dir * 7.3,
                    rightFootY: bottomY - 1.08 - airborneLift * 0.46
                };
                const driveT = smooth(Math.max(0, Math.min(1, comboProgress / 0.72)));
                const settleT = smooth(Math.max(0, Math.min(1, (comboProgress - 0.84) / 0.16)));
                const driven = blendPose(startPose, drivePose, driveT);
                const posed = blendPose(driven, settlePose, settleT);
                leftKneeX = posed.leftKneeX;
                leftKneeY = posed.leftKneeY;
                leftFootX = posed.leftFootX;
                leftFootY = posed.leftFootY;
                rightKneeX = posed.rightKneeX;
                rightKneeY = posed.rightKneeY;
                rightFootX = posed.rightFootX;
                rightFootY = posed.rightFootY;
            } else if (comboStep === 1) {
                // 1撃目（左刀・袈裟斬り）: idle -> slash -> idle の2段補間で、前後の接続を自然化
                const smooth = (t) => t * t * (3 - 2 * t);
                const lerp = (a, b, t) => a + (b - a) * t;
                const blendPose = (a, b, t) => ({
                    leftKneeX: lerp(a.leftKneeX, b.leftKneeX, t),
                    leftKneeY: lerp(a.leftKneeY, b.leftKneeY, t),
                    leftFootX: lerp(a.leftFootX, b.leftFootX, t),
                    leftFootY: lerp(a.leftFootY, b.leftFootY, t),
                    rightKneeX: lerp(a.rightKneeX, b.rightKneeX, t),
                    rightKneeY: lerp(a.rightKneeY, b.rightKneeY, t),
                    rightFootX: lerp(a.rightFootX, b.rightFootX, t),
                    rightFootY: lerp(a.rightFootY, b.rightFootY, t)
                });
                const idlePhase = Math.sin(this.motionTime * 0.0042);
                const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                const idlePose = {
                    leftKneeX: leftHipX + dir * 0.55,
                    leftKneeY: hipLocalY + 9.9,
                    leftFootX: centerX + dir * idleSpread,
                    leftFootY: bottomY + 0.1 - airborneLift * 0.14,
                    rightKneeX: rightHipX + dir * 0.6,
                    rightKneeY: hipLocalY + 9.6,
                    rightFootX: centerX - dir * idleSpread,
                    rightFootY: bottomY - 0.1 - airborneLift * 0.14
                };
                const slashPose = {
                    leftKneeX: leftHipX - dir * 2.05,
                    leftKneeY: hipLocalY + 8.85,
                    leftFootX: centerX - dir * 5.25,
                    leftFootY: bottomY - 0.88 - airborneLift * 0.5,
                    rightKneeX: rightHipX + dir * 3.45,
                    rightKneeY: hipLocalY + 9.05,
                    rightFootX: centerX + dir * 8.75,
                    rightFootY: bottomY - 0.52 - airborneLift * 0.48
                };
                const comboStepPoseProgress = comboPoseAttack 
                    ? (comboPoseAttack.durationMs > 0 
                        ? clamp01(1 - (attackTimer / comboPoseAttack.durationMs))
                        : 1.0)
                    : 0;

                // 腕と同じ同期変数を使用し、余韻中はポーズを完全に維持（slashT=1.0）
                const slashT = comboStep5RecoveryActive 
                    ? 1.0 
                    : smooth(Math.max(0, Math.min(1, comboStepPoseProgress / 0.28)));
                
                const posed = blendPose(idlePose, slashPose, slashT);
                
                // 腕と全く同じリカバリーブレンド（後半100msで復帰）を脚にも適用
                const finalPose = (comboStep5RecoveryBlend > 0)
                    ? blendPose(posed, idlePose, smooth(comboStep5RecoveryBlend))
                    : posed;

                leftKneeX = finalPose.leftKneeX;
                leftKneeY = finalPose.leftKneeY;
                leftFootX = finalPose.leftFootX;
                leftFootY = finalPose.leftFootY;
                rightKneeX = finalPose.rightKneeX;
                rightKneeY = finalPose.rightKneeY;
                rightFootX = finalPose.rightFootX;
                rightFootY = finalPose.rightFootY;
            }
            else if (comboStep === 3) {
                leftKneeX = leftHipX - dir * (2.6 - comboArc * 1.1);
                leftKneeY = hipLocalY + 8.5 - comboArc * 1.4;
                leftFootX = centerX - dir * (7.2 + comboArc * 2.0);
                leftFootY = bottomY - 0.9 - airborneLift * 0.56;
                rightKneeX = rightHipX + dir * (2.9 - comboArc * 1.0);
                rightKneeY = hipLocalY + 8.2 - comboArc * 1.5;
                rightFootX = centerX + dir * (7.6 + comboArc * 2.2);
                rightFootY = bottomY - 1.2 - airborneLift * 0.56;
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    leftKneeX: leftHipX - dir * 2.2,
                    leftKneeY: hipLocalY + 8.95,
                    leftFootX: centerX - dir * 5.5,
                    leftFootY: bottomY - 0.84 - airborneLift * 0.46,
                    rightKneeX: rightHipX + dir * 3.0,
                    rightKneeY: hipLocalY + 8.55,
                    rightFootX: centerX + dir * 7.5,
                    rightFootY: bottomY - 1.08 - airborneLift * 0.46
                };
                leftKneeX = from.leftKneeX + (leftKneeX - from.leftKneeX) * prepEase;
                leftKneeY = from.leftKneeY + (leftKneeY - from.leftKneeY) * prepEase;
                leftFootX = from.leftFootX + (leftFootX - from.leftFootX) * prepEase;
                leftFootY = from.leftFootY + (leftFootY - from.leftFootY) * prepEase;
                rightKneeX = from.rightKneeX + (rightKneeX - from.rightKneeX) * prepEase;
                rightKneeY = from.rightKneeY + (rightKneeY - from.rightKneeY) * prepEase;
                rightFootX = from.rightFootX + (rightFootX - from.rightFootX) * prepEase;
                rightFootY = from.rightFootY + (rightFootY - from.rightFootY) * prepEase;
            }
            else if (comboStep === 4) {
                const smooth = (t) => t * t * (3 - 2 * t);
                if (comboProgress < 0.42) {
                    const rise = comboProgress / 0.42;
                    const riseEase = smooth(rise);
                    leftKneeX = leftHipX - dir * (2.1 - riseEase * 0.8);
                    leftKneeY = hipLocalY + 8.4 - riseEase * 1.4;
                    leftFootX = centerX - dir * (6.4 - riseEase * 1.2);
                    leftFootY = bottomY - 1.2 - airborneLift * (0.52 + riseEase * 0.12);
                    rightKneeX = rightHipX + dir * (2.6 - riseEase * 0.6);
                    rightKneeY = hipLocalY + 8.1 - riseEase * 1.3;
                    rightFootX = centerX + dir * (6.9 - riseEase * 1.0);
                    rightFootY = bottomY - 1.3 - airborneLift * (0.54 + riseEase * 0.12);
                } else {
                    const flipT = Math.max(0, Math.min(1, (comboProgress - 0.42) / 0.58));
                    const flipEase = smooth(flipT);
                    const flipAngle = -Math.PI * 2 * flipEase;
                    const axisX = Math.sin(flipAngle) * dir;
                    const axisY = Math.cos(flipAngle);
                    const normalX = Math.cos(flipAngle) * dir;
                    const normalY = -Math.sin(flipAngle);
                    const tuck = Math.sin(Math.min(1, flipT / 0.62) * Math.PI);
                    const open = smooth(Math.max(0, Math.min(1, (flipT - 0.68) / 0.32)));
                    const placeFrom = (hipBaseX, hipBaseY, side, down) => ({
                        x: hipBaseX + normalX * side + axisX * down,
                        y: hipBaseY + normalY * side + axisY * down
                    });
                    const leftHipYLocal = hipLocalY + 0.3;
                    const rightHipYLocal = hipLocalY + 0.08;
                    const leftKneeP = placeFrom(
                        leftHipX,
                        leftHipYLocal,
                        -1.6 - tuck * 2.2 + open * 0.7,
                        7.2 - tuck * 3.4 + open * 2.5
                    );
                    const leftFootP = placeFrom(
                        leftHipX,
                        leftHipYLocal,
                        -3.0 - tuck * 3.8 + open * 1.2,
                        14.7 - tuck * 6.6 + open * 5.8
                    );
                    const rightKneeP = placeFrom(
                        rightHipX,
                        rightHipYLocal,
                        1.8 + tuck * 2.0 - open * 0.6,
                        6.9 - tuck * 3.2 + open * 2.4
                    );
                    const rightFootP = placeFrom(
                        rightHipX,
                        rightHipYLocal,
                        3.4 + tuck * 3.5 - open * 1.1,
                        13.9 - tuck * 6.1 + open * 5.4
                    );
                    leftKneeX = leftKneeP.x;
                    leftKneeY = leftKneeP.y;
                    leftFootX = leftFootP.x;
                    leftFootY = leftFootP.y;
                    rightKneeX = rightKneeP.x;
                    rightKneeY = rightKneeP.y;
                    rightFootX = rightFootP.x;
                    rightFootY = rightFootP.y;
                }
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    leftKneeX: leftHipX - dir * 2.6,
                    leftKneeY: hipLocalY + 8.5,
                    leftFootX: centerX - dir * 7.2,
                    leftFootY: bottomY - 0.9 - airborneLift * 0.56,
                    rightKneeX: rightHipX + dir * 2.9,
                    rightKneeY: hipLocalY + 8.2,
                    rightFootX: centerX + dir * 7.6,
                    rightFootY: bottomY - 1.2 - airborneLift * 0.56
                };
                leftKneeX = from.leftKneeX + (leftKneeX - from.leftKneeX) * prepEase;
                leftKneeY = from.leftKneeY + (leftKneeY - from.leftKneeY) * prepEase;
                leftFootX = from.leftFootX + (leftFootX - from.leftFootX) * prepEase;
                leftFootY = from.leftFootY + (leftFootY - from.leftFootY) * prepEase;
                rightKneeX = from.rightKneeX + (rightKneeX - from.rightKneeX) * prepEase;
                rightKneeY = from.rightKneeY + (rightKneeY - from.rightKneeY) * prepEase;
                rightFootX = from.rightFootX + (rightFootX - from.rightFootX) * prepEase;
                rightFootY = from.rightFootY + (rightFootY - from.rightFootY) * prepEase;
            }
            else if (comboStep === 5) {
                if (comboProgress < 0.3) {
                    const t = comboProgress / 0.3;
                    leftKneeX = leftHipX - dir * (1.8 - t * 0.7);
                    leftKneeY = hipLocalY + 8.7 - t * 1.5;
                    leftFootX = centerX - dir * (5.6 - t * 2.2);
                    leftFootY = bottomY - 1.0 - airborneLift * 0.62;
                    rightKneeX = rightHipX + dir * (2.5 - t * 1.2);
                    rightKneeY = hipLocalY + 8.5 - t * 1.5;
                    rightFootX = centerX + dir * (7.1 - t * 2.9);
                    rightFootY = bottomY - 1.1 - airborneLift * 0.64;
                } else if (comboProgress < 0.78) {
                    const t = (comboProgress - 0.3) / 0.48;
                    leftKneeX = leftHipX - dir * (1.1 + t * 1.8);
                    leftKneeY = hipLocalY + 7.2 + t * 2.4;
                    leftFootX = centerX - dir * (3.4 + t * 2.8);
                    leftFootY = bottomY - 2.4 + t * 1.7 - airborneLift * 0.44;
                    rightKneeX = rightHipX + dir * (1.3 + t * 1.2);
                    rightKneeY = hipLocalY + 7.0 + t * 2.5;
                    rightFootX = centerX + dir * (4.4 + t * 1.8);
                    rightFootY = bottomY - 2.6 + t * 1.9 - airborneLift * 0.46;
                } else {
                    const t = (comboProgress - 0.78) / 0.22;
                    leftKneeX = leftHipX - dir * (2.9 - t * 1.6);
                    leftKneeY = hipLocalY + 9.6 - t * 1.4;
                    leftFootX = centerX - dir * (6.2 - t * 2.4);
                    leftFootY = bottomY - 0.6 - airborneLift * 0.22;
                    rightKneeX = rightHipX + dir * (2.7 - t * 1.4);
                    rightKneeY = hipLocalY + 9.3 - t * 1.3;
                    rightFootX = centerX + dir * (6.0 - t * 2.2);
                    rightFootY = bottomY - 0.7 - airborneLift * 0.22;
                }
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    leftKneeX: leftHipX - dir * 3.6,
                    leftKneeY: hipLocalY + 5.2,
                    leftFootX: centerX - dir * 11.8,
                    leftFootY: bottomY - 2.0 - airborneLift * 0.76,
                    rightKneeX: rightHipX + dir * 1.1,
                    rightKneeY: hipLocalY + 4.7,
                    rightFootX: centerX + dir * 1.8,
                    rightFootY: bottomY - 2.3 - airborneLift * 0.84
                };
                leftKneeX = from.leftKneeX + (leftKneeX - from.leftKneeX) * prepEase;
                leftKneeY = from.leftKneeY + (leftKneeY - from.leftKneeY) * prepEase;
                leftFootX = from.leftFootX + (leftFootX - from.leftFootX) * prepEase;
                leftFootY = from.leftFootY + (leftFootY - from.leftFootY) * prepEase;
                rightKneeX = from.rightKneeX + (rightKneeX - from.rightKneeX) * prepEase;
                rightKneeY = from.rightKneeY + (rightKneeY - from.rightKneeY) * prepEase;
                rightFootX = from.rightFootX + (rightFootX - from.rightFootX) * prepEase;
                rightFootY = from.rightFootY + (rightFootY - from.rightFootY) * prepEase;
                if (comboStep5RecoveryActive) {
                    const recover = comboStep5RecoveryBlend * comboStep5RecoveryBlend * (3 - 2 * comboStep5RecoveryBlend);
                    const idlePhase = Math.sin(this.motionTime * 0.0042);
                    const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                    const idlePose = {
                        leftKneeX: leftHipX + dir * 0.55,
                        leftKneeY: hipLocalY + 9.9,
                        leftFootX: centerX + dir * idleSpread,
                        leftFootY: bottomY + 0.1 - airborneLift * 0.14,
                        rightKneeX: rightHipX + dir * 0.6,
                        rightKneeY: hipLocalY + 9.6,
                        rightFootX: centerX - dir * idleSpread,
                        rightFootY: bottomY - 0.1 - airborneLift * 0.14
                    };
                    leftKneeX += (idlePose.leftKneeX - leftKneeX) * recover;
                    leftKneeY += (idlePose.leftKneeY - leftKneeY) * recover;
                    leftFootX += (idlePose.leftFootX - leftFootX) * recover;
                    leftFootY += (idlePose.leftFootY - leftFootY) * recover;
                    rightKneeX += (idlePose.rightKneeX - rightKneeX) * recover;
                    rightKneeY += (idlePose.rightKneeY - rightKneeY) * recover;
                    rightFootX += (idlePose.rightFootX - rightFootX) * recover;
                    rightFootY += (idlePose.rightFootY - rightFootY) * recover;
                }
            }
            drawJointedLeg(leftHipX, hipLocalY + 0.35, leftKneeX, leftKneeY, leftFootX, leftFootY, false, 1.12);
            drawJointedLeg(rightHipX, hipLocalY + 0.12, rightKneeX, rightKneeY, rightFootX, rightFootY, true, 1.06);
        } else if (isCrouchPose) {
            const crouchStride = crouchWalkPhase * 3.4;
            const crouchLift = Math.abs(crouchWalkPhase) * 1.8;
            const leftHipX = torsoHipX + dir * 1.15; const rightHipX = torsoHipX - dir * 1.35;
            const leftHipYL = hipY + 0.4; const rightHipYL = hipY + 0.2;
            // 膝はhipYからbottomYの範囲に収まるよう clamp する
            const kneeYMax = bottomY - 4;
            const leftKneeY  = Math.min(kneeYMax, hipY + 6.0 + Math.max(0, -crouchWalkPhase) * 1.2);
            const rightKneeY = Math.min(kneeYMax, hipY + 6.4 + Math.max(0,  crouchWalkPhase) * 1.2);
            drawJointedLeg(leftHipX,  leftHipYL,  leftHipX  + dir * (3.0 + crouchStride * 0.5), leftKneeY,  centerX + dir * (6.5 + crouchStride), bottomY - 0.6 + crouchLift * 0.15, false, 1.0);
            drawJointedLeg(rightHipX, rightHipYL, rightHipX - dir * (3.6 - crouchStride * 0.5), rightKneeY, centerX - dir * (7.2 - crouchStride), bottomY - 0.2,                     true,  1.02);
        } else if (isSpearThrustPose) {
            // 横っ飛び: 後ろ足で蹴り、前足を畳む（脚長が伸びすぎない長さ）
            const rearDrive = Math.max(0, Math.sin(Math.max(0, Math.min(1, (spearPoseProgress - 0.16) / 0.62)) * Math.PI * 0.5));
            const hipLocalY = hipY - 0.24 - rearDrive * 0.48;
            const rearHipX = torsoHipX + dir * 0.88;
            const rightHipX2 = torsoHipX + dir * 1.18;

            // 後ろ足: 画像2のように斜め後方へ長く蹴る
            const rearFootX = rearHipX - dir * (14.1 + rearDrive * 3.1);
            const rearFootY = hipLocalY + 12.9 + rearDrive * 0.24;
            // 後ろ足は膝をまっすぐに見せる
            const rearKneeX = rearHipX + (rearFootX - rearHipX) * 0.5;
            const rearKneeY = (hipLocalY + 0.2) + (rearFootY - (hipLocalY + 0.2)) * 0.5;
            // 手前足を前面レイヤーにするため、後ろ足を胴の前へ
            drawJointedLeg(rearHipX, hipLocalY + 0.2, rearKneeX, rearKneeY, rearFootX, rearFootY, false, 0, 1, true, true);

            // 前足: 画像2の曲げ感を維持しつつ、通常脚長に近づける
            const rightKneeX2 = rightHipX2 + dir * (3.95 + rearDrive * 0.6);
            const rightKneeY2 = hipLocalY + 8.7 + rearDrive * 0.24;
            const rightFootX2 = rightHipX2 + dir * (0.22 + rearDrive * 0.1);
            const rightFootY2 = hipLocalY + 16.2 + rearDrive * 0.3;
            drawJointedLeg(rightHipX2, hipLocalY + 0.04, rightKneeX2, rightKneeY2, rightFootX2, rightFootY2, true, 1.22, 1, true, false);
        } else {
            // 空中 or 走り or 待機の足描画
            if (!this.isGrounded) {
                // 画像参照に合わせ、前脚を強めに畳み、後脚はやや後方へ流す空中姿勢
                const drift = Math.max(-1, Math.min(1, this.vx / Math.max(1, this.speed * 1.45)));
                const rise = this.vy < 0 ? Math.min(1, Math.abs(this.vy) / 14) : 0;
                const descend = this.vy > 0 ? Math.min(1, this.vy / 13) : 0;
                const apex = Math.max(0, 1 - Math.min(1, Math.abs(this.vy) / 4.4));
                const tuck = Math.max(rise * 0.74, apex * 0.92) * (1 - descend * 0.26);
                const open = descend * 0.62;
                const settle = Math.max(0, Math.min(1, (descend - 0.28) / 0.72));
                const leftHipX = torsoHipX + dir * 1.28;
                const rightHipX3 = torsoHipX - dir * 1.18;

                // 奥足は曲げ（短め）、手前足は伸ばし（長め）
                let leftKneeX = leftHipX + dir * (2.78 + tuck * 2.25 - open * 1.24) + dir * drift * 0.2;
                let leftKneeY = hipY + 8.25 - tuck * 3.1 + open * 0.9;
                let leftFootX = leftKneeX - dir * (3.22 + tuck * 1.12 - open * 0.58) + dir * drift * 0.1;
                let leftFootY = leftKneeY + 7.02 - tuck * 1.86 + open * 1.62;

                let rightKneeX = rightHipX3 - dir * (2.36 + tuck * 1.7 - open * 0.76) - dir * drift * 0.18;
                let rightKneeY = hipY + 8.88 - tuck * 1.02 + open * 0.98;
                let rightFootX = rightKneeX - dir * (3.72 + tuck * 1.35 - open * 0.62) - dir * drift * 0.02;
                let rightFootY = rightKneeY + 7.28 - tuck * 0.35 + open * 1.82;

                // 接地直前は地上待機姿勢へ自然に戻す
                leftKneeX += (leftHipX + dir * 0.62 - leftKneeX) * (settle * 0.64);
                leftKneeY += (hipY + 9.45 - leftKneeY) * (settle * 0.68);
                leftFootX += (centerX + dir * 1.9 - leftFootX) * (settle * 0.7);
                leftFootY += (bottomY + 0.06 - leftFootY) * (settle * 0.78);
                rightKneeX += (rightHipX3 + dir * 0.64 - rightKneeX) * (settle * 0.64);
                rightKneeY += (hipY + 9.28 - rightKneeY) * (settle * 0.68);
                rightFootX += (centerX - dir * 2.5 - rightFootX) * (settle * 0.7);
                rightFootY += (bottomY - 0.06 - rightFootY) * (settle * 0.78);

                drawJointedLeg(leftHipX, hipY + 0.2, leftKneeX, leftKneeY, leftFootX, leftFootY, false, 0.9);
                drawJointedLeg(rightHipX3, hipY + 0.1, rightKneeX, rightKneeY, rightFootX, rightFootY, true, 1.02);
            } else {
                const runPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
                if (!isRunLike) {
                    const idlePhase = Math.sin(this.motionTime * 0.0042);
                    const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                    const leftHipX = torsoHipX + dir * 1.35; const rightHipX4 = torsoHipX - dir * 1.25;
                    drawJointedLeg(leftHipX, hipY + 0.22, leftHipX + dir * 0.55, hipY + 9.9, centerX + dir * idleSpread, bottomY + 0.1, false, 0.0);
                    drawJointedLeg(rightHipX4, hipY + 0.14, rightHipX4 + dir * 0.6, hipY + 9.6, centerX - dir * idleSpread, bottomY - 0.1, true, 0.18);
                } else {
                    const runBlend = Math.min(1, speedAbs / Math.max(1, this.speed * 1.25));
                    const strideAmp = isDashLike ? 13.8 : 10.4; const liftAmp = isDashLike ? 5.6 : 4.2;
                    const legSpread = 0.8; const baseStepScale = 0.45 + runBlend * 0.88;
                    const legSpanY = bottomY - hipY;
                    const drawGroundLeg = (legSign, isFrontLeg) => {
                        const phase = runPhase * legSign;
                        const forward = phase * strideAmp * baseStepScale;
                        const lift = Math.max(0, -phase) * liftAmp * (0.3 + runBlend * 0.95);
                        const plant = Math.max(0, phase) * (0.72 + runBlend * 0.58);
                        const depthShift = isFrontLeg ? 0 : 0.45;
                        const hipX = torsoHipX + dir * legSign * 0.88;
                        const hipLocalY = hipY + (isFrontLeg ? 0.12 : 0.26);
                        const footX = centerX + dir * (forward + legSign * legSpread);
                        const footY = bottomY - lift + depthShift * 0.25;
                        const kneeX = hipX + dir * (forward * 0.44 + legSign * (legSpread * 0.56 + 0.62));
                        const kneeY = hipY + legSpanY * (0.56 + runBlend * 0.04) - lift * 0.75 + plant * 0.3 + depthShift;
                        drawJointedLeg(hipX, hipLocalY, kneeX, kneeY, footX, footY, isFrontLeg, 0.34);
                    };
                    drawGroundLeg(1, false); drawGroundLeg(-1, true);
                }
            }
        }

        // 奥側の腕/武器は描画順だけで胴体の裏へ回す（オクルーダー不使用）
        const dualBladeLayer = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverrideLayer = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const effectiveSubWeaponTimerLayer = (dualBladeLayer && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
            ? (dualPoseOverrideLayer && Number.isFinite(dualPoseOverrideLayer.attackTimer)
                ? dualPoseOverrideLayer.attackTimer
                : dualBladeLayer.attackTimer)
            : this.subWeaponTimer;
        const shouldRenderSubWeaponLayerBack =
            (effectiveSubWeaponTimerLayer > 0 || (forceSubWeaponRender && subWeaponAction)) &&
            !visualIsAttacking &&
            !isNinNinPose;
        if (visualIsAttacking && !isNinNinPose) {
            this.renderAttackArmAndWeapon(ctx, {
                centerX,
                pivotY: bodyTopY + 2,
                facingRight,
                leftShoulderX: leftShoulderXShared,
                leftShoulderY: leftShoulderYShared,
                rightShoulderX: rightShoulderXShared,
                rightShoulderY: rightShoulderYShared,
                supportRightHand: !(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流'),
                layerPhase: 'back'
            }, alpha, {
                ...options,
                attackState: comboVisualAttackState
            });
        }
        if (shouldRenderSubWeaponLayerBack) {
            this.renderSubWeaponArm(
                ctx,
                centerX,
                bodyTopY + 2,
                facingRight,
                renderSubWeaponVisuals,
                alpha,
                {
                    ...options,
                    shoulderAnchors: {
                        leftX: leftShoulderXShared,
                        leftY: leftShoulderYShared,
                        rightX: rightShoulderXShared,
                        rightY: rightShoulderYShared
                    },
                    layerPhase: 'back'
                }
            );
        }

        // 前足は胴の裏レイヤーに固定するため、脚描画後に胴体を描く
        drawTorsoSegment(true);
        // 後ろ足は胴の前レイヤーにする
        for (const legArgs of backLegOverlayQueue) {
            drawJointedLeg(...legArgs, false, null, false);
        }
        
        const renderHair = options.renderHair !== false;
        const accessoryRoots = this.getAccessoryRootAnchors(headCenterX, headY, headRadius, facingRight, headSpinAngle);
        const hairBaseX = accessoryRoots.hairRootX;
        const hairBaseY = accessoryRoots.hairRootY;
        if (useLiveAccessories) {
            this.syncAccessoryRootNodes(accessoryScarfNodes, accessoryHairNodes, accessoryRoots);
        }
        const sampleHairNode = (index) => {
            if (!accessoryHairNodes || accessoryHairNodes.length === 0) return { x: hairBaseX, y: hairBaseY };
            const maxIndex = accessoryHairNodes.length - 1;
            const clamped = Math.max(0, Math.min(maxIndex, index));
            if (clamped === 0) return { x: hairBaseX, y: hairBaseY };
            const node = accessoryHairNodes[clamped];
            const prev = (clamped === 1)
                ? { x: hairBaseX, y: hairBaseY }
                : accessoryHairNodes[Math.max(0, clamped - 1)];
            const next = accessoryHairNodes[Math.min(maxIndex, clamped + 1)];
            return {
                x: (prev.x + node.x * 2 + next.x) * 0.25,
                y: (prev.y + node.y * 2 + next.y) * 0.25
            };
        };
        const drawHeadSilhouetteWithOutline = () => {
            if (alpha <= 0) return;
            if (silhouetteOutlineEnabled) {
                const TAU = Math.PI * 2;
                const normalizeAngle = (angle) => {
                    let a = angle % TAU;
                    if (a < 0) a += TAU;
                    return a;
                };

                const gaps = [];
                const addGap = (centerAngle, halfSpan) => {
                    if (!Number.isFinite(centerAngle) || halfSpan <= 0) return;
                    let start = normalizeAngle(centerAngle - halfSpan);
                    let end = normalizeAngle(centerAngle + halfSpan);
                    if (start <= end) {
                        gaps.push([start, end]);
                    } else {
                        gaps.push([start, TAU]);
                        gaps.push([0, end]);
                    }
                };

                const neckJoinAngle = Math.atan2(bodyTopY - headY, torsoShoulderX - headCenterX);
                addGap(neckJoinAngle, 0.36);

                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = outlineExpand;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (gaps.length === 0) {
                    ctx.beginPath();
                    ctx.arc(headCenterX, headY, headRadius, 0, TAU, false);
                    ctx.stroke();
                } else {
                    gaps.sort((a, b) => a[0] - b[0]);
                    const merged = [];
                    for (const gap of gaps) {
                        if (merged.length === 0 || gap[0] > merged[merged.length - 1][1]) {
                            merged.push([gap[0], gap[1]]);
                        } else {
                            merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], gap[1]);
                        }
                    }
                    let cursor = 0;
                    for (const [gapStart, gapEnd] of merged) {
                        if (gapStart - cursor > 0.0001) {
                            ctx.beginPath();
                            ctx.arc(headCenterX, headY, headRadius, cursor, gapStart, false);
                            ctx.stroke();
                        }
                        cursor = Math.max(cursor, gapEnd);
                    }
                    if (TAU - cursor > 0.0001) {
                        ctx.beginPath();
                        ctx.arc(headCenterX, headY, headRadius, cursor, TAU, false);
                        ctx.stroke();
                    }
                }
            }
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(headCenterX, headY, headRadius, 0, Math.PI * 2);
            ctx.fill();
        };

        const drawHeadbandBand = () => {
            const renderHeadband = options.renderHeadband !== false;
            if (!renderHeadband || headbandAlpha <= 0) return;
            const bandMaskRadius = Math.max(1, headRadius - 0.05);
            const bandPathRadius = bandMaskRadius + 6 * 0.34; // 6 is PLAYER_HEADBAND_LINE_WIDTH
            const bandBackAngle = (facingRight ? Math.PI * 0.92 : Math.PI * 0.08) + headSpinAngle;
            const bandFrontAngle = (facingRight ? -Math.PI * 0.18 : Math.PI * 1.18) + headSpinAngle;
            const bStartX = headCenterX + Math.cos(bandBackAngle) * bandPathRadius;
            const bStartY = headY + Math.sin(bandBackAngle) * bandPathRadius;
            const bEndX = headCenterX + Math.cos(bandFrontAngle) * bandPathRadius;
            const bEndY = headY + Math.sin(bandFrontAngle) * bandPathRadius;
            const ctrlLocalX = dir * headRadius * 0.02;
            const ctrlLocalY = -headRadius * 0.30;
            const ctrlCos = Math.cos(headSpinAngle);
            const ctrlSin = Math.sin(headSpinAngle);
            const bCtrlX = headCenterX + (ctrlLocalX * ctrlCos - ctrlLocalY * ctrlSin);
            const bCtrlY = headY + (ctrlLocalX * ctrlSin + ctrlLocalY * ctrlCos);

            ctx.save();
            if (headbandAlpha !== 1.0) ctx.globalAlpha *= headbandAlpha;
            ctx.beginPath();
            ctx.arc(headCenterX, headY, bandMaskRadius, 0, Math.PI * 2);
            ctx.clip();
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 6; // PLAYER_HEADBAND_LINE_WIDTH
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(bStartX, bStartY);
            ctx.quadraticCurveTo(bCtrlX, bCtrlY, bEndX, bEndY);
            ctx.stroke();
            ctx.restore();
        };

        // 頭より背面: 髪
        if (renderHair) {
            this.renderPonytail(ctx, headCenterX, headY, headRadius, hairBaseX, hairBaseY, facingRight, alpha, {
                hairNodes: accessoryHairNodes,
                silhouetteColor: silhouetteColor,
                outlineEnabled: silhouetteOutlineEnabled,
                outlineColor: silhouetteOutlineColor,
                outlineExpand: outlineExpand
            });
        }

        // 中央: 頭
        drawHeadSilhouetteWithOutline();

        // 鉢巻テール
        const renderHeadband = options.renderHeadband !== false;
        if (renderHeadband && renderHeadbandTail && headbandAlpha > 0) {
            // 鉢巻バンドは頭円クリップ内に表示されるため、クリップ後に見える帯の中心へ根元を合わせる
            const bandLineWidth = 6;
            const bandMaskRadius = Math.max(1, headRadius - 0.05);
            const bandPathRadius = bandMaskRadius + bandLineWidth * 0.34;
            const bandBackAngle = (facingRight ? Math.PI * 0.92 : Math.PI * 0.08) + headSpinAngle;
            const clippedBandInner = bandPathRadius - bandLineWidth * 0.5;
            const clippedBandOuter = bandMaskRadius;
            const clippedBandCenterRadius = (clippedBandInner + clippedBandOuter) * 0.5;
            const headbandTailRootX = headCenterX + Math.cos(bandBackAngle) * clippedBandCenterRadius + dir * 0.34;
            const headbandTailRootY = headY + Math.sin(bandBackAngle) * clippedBandCenterRadius - 0.08;
            this.renderHeadbandTail(ctx, headbandTailRootX, headbandTailRootY, dir, headbandAlpha, accentColor, time, {
                ...options,
                isMoving,
                scarfNodes: accessoryScarfNodes
            });
        }

        // 最前面: 鉢巻（接点を完全に重ねる）
        drawHeadbandBand();

        // 腕と剣
        const effectiveIsAttacking = visualIsAttacking;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverride = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const effectiveSubWeaponTimer = (dualBlade && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
            ? (dualPoseOverride && Number.isFinite(dualPoseOverride.attackTimer)
                ? dualPoseOverride.attackTimer
                : dualBlade.attackTimer)
            : this.subWeaponTimer;
        const isActuallyAttacking = effectiveIsAttacking || (effectiveSubWeaponTimer > 0 && subWeaponAction !== 'throw') || (dualBlade && this.subWeaponAction);
        const leftShoulderX = leftShoulderXShared;
        const leftShoulderY = leftShoulderYShared;
        const rightShoulderX = rightShoulderXShared;
        const rightShoulderY = rightShoulderYShared;

        const armStrokeWidth = 4.8; // 脚(前脛)と同じ太さ
        const handRadiusScale = 0.94;
        const handOutlineGapHalf = 0.62;
        let lastHandConnectFrom = null;
        const insetAlongSegment = (fromX, fromY, toX, toY, insetPx = 0) => {
            if (insetPx <= 0) return { x: fromX, y: fromY };
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.hypot(dx, dy);
            if (len <= 0.0001) return { x: fromX, y: fromY };
            const t = Math.min(1, insetPx / len);
            return { x: fromX + dx * t, y: fromY + dy * t };
        };
        const drawConnectedHandOutline = (xPos, yPos, radius, connectFrom = null) => {
            if (!silhouetteOutlineEnabled || alpha <= 0) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (connectFrom && Number.isFinite(connectFrom.x) && Number.isFinite(connectFrom.y)) {
                const inward = Math.atan2(connectFrom.y - yPos, connectFrom.x - xPos);
                ctx.arc(
                    xPos,
                    yPos,
                    radius,
                    inward + handOutlineGapHalf,
                    inward - handOutlineGapHalf + Math.PI * 2,
                    false
                );
            } else {
                ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
        };
        const drawArmPolylineOutline = (points, outlineWidth = armStrokeWidth + outlineExpand) => {
            if (!silhouetteOutlineEnabled || alpha <= 0 || !Array.isArray(points) || points.length < 2) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        };
        const drawArmSegment = (fromX, fromY, toX, toY, width = 6, withOutline = true) => {
            // 微小な距離（0.1未満）の場合は描画をスキップして不要な点（lineCapによるもの）を防ぐ
            if (Math.hypot(toX - fromX, toY - fromY) < 0.1) return;

            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = armStrokeWidth + outlineExpand;
                ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor; ctx.lineWidth = armStrokeWidth;
            ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
        };
        const drawArmWithSoftElbow = (
            shoulderX,
            shoulderY,
            handX,
            handY,
            bendDir = 1,
            bendScale = 0.14,
            elbowRadius = 2.15,
            options = {}
        ) => {
            if (alpha <= 0) return;
            const dx = handX - shoulderX;
            const dy = handY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) {
                lastHandConnectFrom = { x: shoulderX, y: shoulderY };
                drawArmSegment(shoulderX, shoulderY, handX, handY, 6);
                return;
            }
            // 到達に余裕がある場合でも、肘の関節パーツを表示するために微小な曲げを維持
            const poseDistLimit = 16.5; // 腕の物理限界に近い値
            const effectiveDist = Math.min(poseDistLimit, dist);
            const nx = -dy / dist;
            const ny = dx / dist;
            // 近距離だけ穏やかに曲げる（二刀流ポーズで肘が見えやすく調整）
            const closeT = Math.max(0, Math.min(1, (14.5 - dist) / 14.5));
            const bend = Math.min(2.5, dist * bendScale * (0.38 + closeT * 0.62));
            const bendSign = -bendDir;
            const preferUpwardElbow = options.preferUpwardElbow === true;
            let elbowX = shoulderX + dx * 0.54;
            let elbowY = shoulderY + dy * 0.54 + 0.2;
            if (preferUpwardElbow) {
                elbowX += nx * bend * bendSign * 0.22;
                elbowY -= bend * 0.96;
            } else {
                elbowX += nx * bend * bendSign;
                elbowY += ny * bend * bendSign;
            }
            
            // 手首側の描画を少し短縮して手のひらからのハミ出しを防ぐ
            const wristToHandDist = 1.35;
            const wristX = handX - (dx / dist) * wristToHandDist;
            const wristY = handY - (dy / dist) * wristToHandDist;
            const armStart = insetAlongSegment(shoulderX, shoulderY, elbowX, elbowY, 1.2);
            lastHandConnectFrom = { x: wristX, y: wristY };

            drawArmPolylineOutline([
                { x: armStart.x, y: armStart.y },
                { x: elbowX, y: elbowY },
                { x: wristX, y: wristY },
                { x: handX, y: handY }
            ]);
            drawArmSegment(shoulderX, shoulderY, elbowX, elbowY, 6, false);
            drawArmSegment(elbowX, elbowY, wristX, wristY, 5.4, false);
            if (alpha > 0) {
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(elbowX, elbowY, elbowRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        const drawHand = (xPos, yPos, radius = 4.5, connectFrom = null) => {
            if (alpha <= 0) return;
            const handR = radius * handRadiusScale;
            const connectAnchor = connectFrom || lastHandConnectFrom;
            drawConnectedHandOutline(xPos, yPos, handR, connectAnchor);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath(); ctx.arc(xPos, yPos, handR, 0, Math.PI * 2); ctx.fill();
            lastHandConnectFrom = null;
        };
        const clampArmReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderX; const dy = targetY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) return { x: targetX, y: targetY };
            const ratio = maxLen / dist;
            return { x: shoulderX + dx * ratio, y: shoulderY + dy * ratio };
        };

        const singleKatanaIdlePose = getSingleKatanaIdleHandPose();
        const idleLeftHand = singleKatanaIdlePose.leftHand;
        const dualWieldRightHand = stretchFromShoulder(
            rightShoulderX,
            rightShoulderY,
            dualWieldRightHandXShared,
            dualWieldRightHandYShared
        );
        const idleLeftBladeAngle = isCrouchPose ? -0.32 : -0.65;
        const idleRightBladeAngle = isCrouchPose ? -0.82 : -1.1;
        const singleKatanaRightHand = singleKatanaIdlePose.rightHand;

        const isIdleForceRender = forceSubWeaponRender && !subWeaponAction && subWeaponTimer <= 0;
        if (isNinNinPose) {
            drawArmWithSoftElbow(
                rightShoulderX,
                rightShoulderY,
                singleKatanaRightHand.x,
                singleKatanaRightHand.y,
                -dir,
                isCrouchPose ? 0.09 : 0.13
            );
            drawHand(singleKatanaRightHand.x, singleKatanaRightHand.y, 4.5);
        } else if (!isActuallyAttacking && (!forceSubWeaponRender || isIdleForceRender)) {
            const isThrowing = effectiveSubWeaponTimer > 0 && subWeaponAction === 'throw';
            const hasDualSubWeapon = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';

            // 奥手（刀を持つ）
            if (!renderIdleBackArmBehind) {
                drawArmWithSoftElbow(
                    leftShoulderX,
                    leftShoulderY,
                    idleLeftHand.x,
                    idleLeftHand.y,
                    -dir,
                    isCrouchPose ? 0.11 : 0.15
                );
                drawHand(idleLeftHand.x, idleLeftHand.y, 4.8);
                this.drawKatana(ctx, idleLeftHand.x, idleLeftHand.y, idleLeftBladeAngle, dir);
            }

            if (!isThrowing) {
                if (hasDualSubWeapon) {
                    // 二刀前手: 描画順序を「腕→柄→手」に統一。
                    // 1. 腕
                    drawArmWithSoftElbow(
                        rightShoulderX,
                        rightShoulderY,
                        dualWieldRightHand.x,
                        dualWieldRightHand.y,
                        -dir,
                        isCrouchPose ? 0.1 : 0.14
                    );
                    // 2. 柄 (腕よりも前面)
                    this.drawKatana(ctx, dualWieldRightHand.x, dualWieldRightHand.y, idleRightBladeAngle, dir, this.getKatanaBladeLength(), 0.28, 'handle');
                    // 3. 手 (柄よりも前面で握る)
                    drawHand(dualWieldRightHand.x, dualWieldRightHand.y, 4.5);
                    // 4. 刀身 (手の前面)
                    this.drawKatana(ctx, dualWieldRightHand.x, dualWieldRightHand.y, idleRightBladeAngle, dir, this.getKatanaBladeLength(), 0.28, 'blade');
                } else {
                    drawArmWithSoftElbow(
                        rightShoulderX,
                        rightShoulderY,
                        singleKatanaRightHand.x,
                        singleKatanaRightHand.y,
                        -dir,
                        isCrouchPose ? 0.09 : 0.13
                    );
                    drawHand(singleKatanaRightHand.x, singleKatanaRightHand.y, 4.5);
                }
            }

        } else if (effectiveIsAttacking) {
            this.renderAttackArmAndWeapon(ctx, {
                centerX, pivotY: bodyTopY + 2, facingRight,
                leftShoulderX: leftShoulderX,
                leftShoulderY: leftShoulderY,
                rightShoulderX: rightShoulderX,
                rightShoulderY: rightShoulderY,
                supportRightHand: !(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流'),
                layerPhase: 'front'
            }, alpha, {
                ...options,
                attackState: comboVisualAttackState
            });
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                // 二刀前手: 攻撃中もサブ武器アーム側の描画（renderSubWeaponArm）に任せるため、ここでは描画しない
                // (以前はここで描画していたが、renderSubWeaponArmと重複して二重描画の原因になっていた)
            }
        }

        // サブ武器アーム描画
	        if ((effectiveSubWeaponTimer > 0 || (forceSubWeaponRender && subWeaponAction)) && !effectiveIsAttacking && !isNinNinPose) {
	            this.renderSubWeaponArm(
                ctx,
                centerX,
                bodyTopY + 2,
                facingRight,
                renderSubWeaponVisuals,
                alpha,
                {
                    ...options,
                    shoulderAnchors: {
                        leftX: leftShoulderX,
                        leftY: leftShoulderY,
                        rightX: rightShoulderX,
                        rightY: rightShoulderY
                    },
                    layerPhase: 'front'
                }
	            );
	        }

	    this.x = originalX;
    this.y = originalY;
    ctx.restore();
}

    renderSubWeaponArm(ctx, centerX, pivotY, facingRight, renderWeaponVisuals, alpha, options) {
        renderWeaponVisuals = renderWeaponVisuals !== false;
        alpha = Number.isFinite(alpha) ? alpha : 1.0;
        options = options || {};
        const dir = facingRight ? 1 : -1;
        const armReachScale = Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverride = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const durationWeapon = this.subWeaponAction === '二刀_Z' ? dualBlade : this.currentSubWeapon;
        const subDuration = this.getSubWeaponActionDurationMs(this.subWeaponAction, durationWeapon);
        const sourceTimer =
            (dualBlade && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
                ? ((dualPoseOverride && Number.isFinite(dualPoseOverride.attackTimer))
                    ? dualPoseOverride.attackTimer
                    : dualBlade.attackTimer)
                : this.subWeaponTimer;
        const progress = Math.max(0, Math.min(1, 1 - (sourceTimer / subDuration)));
        const silhouetteColor = (options.palette && options.palette.silhouette) || COLORS.PLAYER;
        const silhouetteOutlineEnabled = options.silhouetteOutline !== false;
        const silhouetteOutlineColor = (options.palette && options.palette.silhouetteOutline) || 'rgba(168, 196, 230, 0.29)';
        const layerPhase = options.layerPhase || 'all';
        const drawBackLayer = layerPhase !== 'front';
        const drawFrontLayer = layerPhase !== 'back';
        const shoulderAnchors = options.shoulderAnchors || null;
        const leftShoulderX = (shoulderAnchors && Number.isFinite(shoulderAnchors.leftX))
            ? shoulderAnchors.leftX
            : centerX + dir * 4;
        const rightShoulderX = (shoulderAnchors && Number.isFinite(shoulderAnchors.rightX))
            ? shoulderAnchors.rightX
            : centerX - dir * 3;
        const leftShoulderY = (shoulderAnchors && Number.isFinite(shoulderAnchors.leftY))
            ? shoulderAnchors.leftY
            : pivotY;
        const rightShoulderY = (shoulderAnchors && Number.isFinite(shoulderAnchors.rightY))
            ? shoulderAnchors.rightY
            : (leftShoulderY + 1.0);
        const shoulderY = leftShoulderY;
        const isCrouchPose = !!this.isCrouching;
        const standardUpperLen = 13.6;
        const standardForeLen = 13.2;
        const standardLeftHandRadius = 4.8;
        const standardRightHandRadius = 4.5;
        const standardLeftReach = 22.0;
        const standardRightReach = 21.6;
        
        ctx.save();
        ctx.strokeStyle = silhouetteColor;
        ctx.lineCap = 'round';

        const armStrokeWidth = 4.8; // 脚(前脛)と同じ太さ
        const handRadiusScale = 0.94;
        const handOutlineGapHalf = 0.62;
        const outlineExpand = 0.75;
        let lastHandConnectFrom = null;
        const insetAlongSegment = (fromX, fromY, toX, toY, insetPx = 0) => {
            if (insetPx <= 0) return { x: fromX, y: fromY };
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.hypot(dx, dy);
            if (len <= 0.0001) return { x: fromX, y: fromY };
            const t = Math.min(1, insetPx / len);
            return { x: fromX + dx * t, y: fromY + dy * t };
        };
        const drawConnectedHandOutline = (xPos, yPos, radius, connectFrom = null) => {
            if (!silhouetteOutlineEnabled || alpha <= 0) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (connectFrom && Number.isFinite(connectFrom.x) && Number.isFinite(connectFrom.y)) {
                const inward = Math.atan2(connectFrom.y - yPos, connectFrom.x - xPos);
                ctx.arc(
                    xPos,
                    yPos,
                    radius,
                    inward + handOutlineGapHalf,
                    inward - handOutlineGapHalf + Math.PI * 2,
                    false
                );
            } else {
                ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
        };
        const drawArmPolylineOutline = (points, outlineWidth = armStrokeWidth + outlineExpand) => {
            if (!silhouetteOutlineEnabled || alpha <= 0 || !Array.isArray(points) || points.length < 2) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        };
        const drawArmSegment = (fromX, fromY, toX, toY, width = 6, withOutline = true) => {
            if (alpha <= 0) return;
            // 微小な距離（0.1未満）の場合は描画をスキップして不要な点（lineCapによるもの）を防ぐ
            if (Math.hypot(toX - fromX, toY - fromY) < 0.1) return;

            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = armStrokeWidth + outlineExpand;
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = armStrokeWidth;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
        };

        const drawArmWithElbow = (
            shoulderX,
            shoulderYLocal,
            elbowX,
            elbowY,
            handX,
            handY,
            upperWidth = 6,
            foreWidth = 5.2
        ) => {
            lastHandConnectFrom = { x: elbowX, y: elbowY };
            const armStart = insetAlongSegment(shoulderX, shoulderYLocal, elbowX, elbowY, 1.2);
            drawArmPolylineOutline([
                { x: armStart.x, y: armStart.y },
                { x: elbowX, y: elbowY },
                { x: handX, y: handY }
            ]);
            drawArmSegment(shoulderX, shoulderYLocal, elbowX, elbowY, upperWidth, false);
            drawArmSegment(elbowX, elbowY, handX, handY, foreWidth, false);
            if (alpha > 0) {
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(elbowX, elbowY, 2.35, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        const drawBentArmSegment = (
            shoulderX,
            shoulderYLocal,
            handX,
            handY,
            upperLen = 13.6,
            foreLen = 13.2,
            bendDir = 1,
            width = 5.6,
            bendScale = 1
        ) => {
            const dx = handX - shoulderX;
            const dy = handY - shoulderYLocal;
            const distRaw = Math.hypot(dx, dy);
            if (distRaw < 0.0001) {
                lastHandConnectFrom = { x: shoulderX, y: shoulderYLocal };
                drawArmSegment(shoulderX, shoulderYLocal, handX, handY, width);
                return;
            }
            // 余裕がある姿勢でも肘の円を表示するため、常に曲げ計算を行う
            const straightThreshold = (upperLen + foreLen) * 0.98;
            const ux = dx / distRaw;
            const uy = dy / distRaw;
            const midX = shoulderX + ux * (distRaw * 0.54);
            const midY = shoulderYLocal + uy * (distRaw * 0.54);
            const nx = -uy;
            const ny = ux;
            const closeT = Math.max(0, Math.min(1, (straightThreshold - distRaw) / straightThreshold));
            const safeBendScale = Math.max(0.2, bendScale);
            const bendAmount = (1.2 + closeT * 1.5) * safeBendScale;
            const bendSign = -bendDir;
            const elbowX = midX + nx * bendAmount * bendSign;
            const elbowY = midY + ny * bendAmount * bendSign;

            // 手首側の描画を少し短縮してハミ出しを抑制
            const wristToHandDist = 1.42;
            const wristX = handX - ux * wristToHandDist;
            const wristY = handY - uy * wristToHandDist;
            const armStart = insetAlongSegment(shoulderX, shoulderYLocal, elbowX, elbowY, 1.2);
            lastHandConnectFrom = { x: wristX, y: wristY };

            drawArmPolylineOutline([
                { x: armStart.x, y: armStart.y },
                { x: elbowX, y: elbowY },
                { x: wristX, y: wristY },
                { x: handX, y: handY }
            ]);
            drawArmSegment(shoulderX, shoulderYLocal, elbowX, elbowY, width, false);
            drawArmSegment(elbowX, elbowY, wristX, wristY, Math.max(4.4, width - 0.6), false);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(elbowX, elbowY, 2.35, 0, Math.PI * 2);
            ctx.fill();
        };

        const drawHand = (xPos, yPos, radius = 4.8, connectFrom = null) => {
            if (alpha <= 0) return;
            const handR = radius * handRadiusScale;
            const connectAnchor = connectFrom || lastHandConnectFrom;
            drawConnectedHandOutline(xPos, yPos, handR, connectAnchor);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(xPos, yPos, handR, 0, Math.PI * 2);
            ctx.fill();
            lastHandConnectFrom = null;
        };

        const drawSubWeaponKatana = (
            handX,
            handY,
            bladeAngle = -1.0,
            bladeScaleDir = dir,
            uprightBlend = 0.28,
            renderMode = 'all',
            scaleY = 1,
            uprightTarget = -Math.PI / 2
        ) => {
            this.drawKatana(
                ctx,
                handX,
                handY,
                bladeAngle,
                bladeScaleDir,
                this.getKatanaBladeLength(),
                uprightBlend,
                renderMode,
                scaleY,
                uprightTarget
            );
        };

        const drawSupportPose = (handX, handY, withBlade = false, bladeAngle = -1.0, bladeScaleDir = dir, fromLeftShoulder = false) => {
            const shoulderX = fromLeftShoulder ? leftShoulderX : rightShoulderX;
            const shoulderYLocal = fromLeftShoulder ? leftShoulderY : rightShoulderY;
            drawBentArmSegment(
                shoulderX,
                shoulderYLocal,
                handX,
                handY,
                standardUpperLen,
                standardForeLen,
                fromLeftShoulder ? -dir : -dir,
                5.2
            );
            drawHand(
                handX,
                handY,
                fromLeftShoulder ? standardLeftHandRadius : standardRightHandRadius
            );
            if (withBlade && renderWeaponVisuals) {
                drawSubWeaponKatana(handX, handY, bladeAngle, bladeScaleDir);
            }
        };
        const drawProgressiveThrowArm = (
            shoulderX,
            shoulderYLocal,
            handX,
            handY,
            straightenT = 0,
            bendDir = -dir,
            alpha = 1.0
        ) => {
            if (alpha <= 0) return;
            const dx = handX - shoulderX;
            const dy = handY - shoulderYLocal;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.0001) {
                drawArmSegment(shoulderX, shoulderYLocal, handX, handY, 5.2);
                return;
            }
            const t = Math.max(0, Math.min(1, straightenT));
            const bendBlend = 1 - t;
            // 常に肘関節を描画するため、ショートカットを削除
            const ux = dx / dist;
            const uy = dy / dist;
            const nx = -uy;
            const ny = ux;
            const elbowBaseX = shoulderX + dx * 0.54;
            const elbowBaseY = shoulderYLocal + dy * 0.54 + 0.2;
            const maxBend = Math.min(2.1, dist * 0.16);
            const bendSign = -bendDir;
            const bend = maxBend * bendBlend;
            const elbowX = elbowBaseX + nx * bend * bendSign;
            const elbowY = elbowBaseY + ny * bend * bendSign;
            drawArmWithElbow(
                shoulderX,
                shoulderYLocal,
                elbowX,
                elbowY,
                handX,
                handY,
                5.2,
                4.7
            );
        };

        const clampArmReach = (shoulderX, shoulderYLocal, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderX;
            const dy = targetY - shoulderYLocal;
            const dist = Math.hypot(dx, dy);
            const maxLenScaled = maxLen * armReachScale;
            if (dist <= maxLenScaled || dist === 0) {
                return { x: targetX, y: targetY };
            }
            const ratio = maxLenScaled / dist;
            return {
                x: shoulderX + dx * ratio,
                y: shoulderYLocal + dy * ratio
            };
        };
        const fitShoulderReach = (shoulderX, shoulderYLocal, handX, handY, maxLen) => {
            const dx = handX - shoulderX;
            const dy = handY - shoulderYLocal;
            const dist = Math.hypot(dx, dy);
            const maxLenScaled = maxLen * armReachScale;
            if (dist <= maxLenScaled || dist <= 0.0001) {
                return { x: shoulderX, y: shoulderYLocal };
            }
            const pull = dist - maxLenScaled;
            return {
                x: shoulderX + (dx / dist) * pull,
                y: shoulderYLocal + (dy / dist) * pull
            };
        };

        if (this.subWeaponAction === 'throw') {
            // 手前手で投げる（手持ち武器は描画しない）
            const easedProgress = Math.pow(progress, 0.55); // イージングで初速を速く
            const armAngle = -Math.PI * 0.8 + easedProgress * Math.PI * 0.8;
            const armLength = 19;
            const throwShoulderX = rightShoulderX - dir * 0.2;
            const throwShoulderY = rightShoulderY - 0.15;
            const throwTargetX = throwShoulderX + Math.cos(armAngle) * armLength * dir;
            const throwTargetY = throwShoulderY + Math.sin(armAngle) * armLength;
            const throwHand = clampArmReach(throwShoulderX, throwShoulderY, throwTargetX, throwTargetY, standardRightReach);
            if (drawFrontLayer) {
                drawProgressiveThrowArm(
                    throwShoulderX,
                    throwShoulderY,
                    throwHand.x,
                    throwHand.y,
                    progress,
                    -dir,
                    alpha
                );
                drawHand(throwHand.x, throwHand.y, standardRightHandRadius);
            }
        } else if (this.subWeaponAction === '大槍') {
            // 突き: いったん引いて腕を曲げ、押し込みで腕を伸ばす
            const spear = (this.currentSubWeapon && this.currentSubWeapon.name === '大槍') ? this.currentSubWeapon : null;
            const grips = (spear && typeof spear.getGripAnchors === 'function')
                ? spear.getGripAnchors(this)
                : null;
            const motionP = grips ? grips.progress : Math.min(1, progress * 1.2);
            const windup = Math.max(0, 1 - (motionP / 0.34));
            const extend = Math.max(0, Math.min(1, (motionP - 0.22) / 0.56));
            const thrustDrive = Math.sin(extend * (Math.PI * 0.5));
            // 開始時は腕が曲がって見えるよう肩を後ろ寄せ、突きで前へ伸ばす
            const shoulderPush = -windup * 4.2 + thrustDrive * 2.2;
            const rearShoulderX = leftShoulderX + dir * (-0.9 + shoulderPush * 0.3);
            const rearShoulderY = shoulderY + 0.15 + windup * 1.25 - thrustDrive * 0.2;
            // 手元は槍上の固定グリップ位置に置き、槍本体の前進で突きを表現する
            const rearTargetX = (grips ? grips.rear.x : (centerX + dir * 13.4));
            const rearTargetY = (grips ? grips.rear.y : (pivotY + 7.8)) + windup * 0.14 - thrustDrive * 0.08;
            // クランプをかけず、必ずグリップ座標を握る（槍が手元で滑らないようにする）
            const rearHand = { x: rearTargetX, y: rearTargetY };
            // 手前手側の補正に使う共通リーチ
            const spearArmMaxReach = 18.9;
            if (drawBackLayer) {
                drawBentArmSegment(
                    rearShoulderX,
                    rearShoulderY,
                    rearHand.x,
                    rearHand.y,
                    standardUpperLen,
                    standardForeLen,
                    -dir,
                    5.3
                );
                drawHand(rearHand.x, rearHand.y, standardLeftHandRadius);
            }

            // 槍本体は奥手と手前手の間に描画する
            if (drawFrontLayer && renderWeaponVisuals && this.currentSubWeapon && typeof this.currentSubWeapon.render === 'function') {
                this.currentSubWeapon.render(ctx, this);
                this.subWeaponRenderedInModel = true;
            }

            const frontShoulderGripX = rightShoulderX - dir * (0.95 + windup * 1.45) + dir * thrustDrive * 1.1;
            const frontShoulderGripY = shoulderY + 1.3 + windup * 0.9 - thrustDrive * 0.12;
            const rightTargetX = (grips ? grips.front.x : (centerX + dir * 11.2));
            const rightTargetY = (grips ? grips.front.y : (pivotY + 10.0)) + windup * 0.1 - thrustDrive * 0.08;
            const rightHand = { x: rightTargetX, y: rightTargetY };
            const frontShoulderFit = fitShoulderReach(
                frontShoulderGripX,
                frontShoulderGripY,
                rightHand.x,
                rightHand.y,
                spearArmMaxReach
            );
            if (drawFrontLayer) {
                drawBentArmSegment(
                    frontShoulderFit.x,
                    frontShoulderFit.y,
                    rightHand.x,
                    rightHand.y,
                    standardUpperLen,
                    standardForeLen,
                    -dir,
                    5.3
                );
                drawHand(rightHand.x, rightHand.y, standardRightHandRadius);
            }
        } else if (this.subWeaponAction === '二刀_Z') {
            // 二刀Z: 段別の軌道は維持しつつ、肩起点/腕長を通常基準に統一
            const blade = dualBlade;
            const pose = (blade && typeof blade.getMainSwingPose === 'function')
                ? blade.getMainSwingPose(dualPoseOverride || {})
                : { comboIndex: 0, progress, rightAngle: -0.28, leftAngle: 2.14 };
            const comboStep = pose.comboIndex || 0;
            const comboProgress = pose.progress || 0;
            const smoothStep01 = (t) => {
                const v = Math.max(0, Math.min(1, t));
                return v * v * (3 - 2 * v);
            };
            const leftShoulderBaseX = leftShoulderX + dir * 0.18;
            const leftShoulderBaseY = leftShoulderY + 0.05;
            const rightShoulderBaseX = rightShoulderX - dir * 0.18;
            const rightShoulderBaseY = rightShoulderY + 0.12;
            let leftShoulderMoveX = leftShoulderBaseX;
            let leftShoulderMoveY = leftShoulderBaseY;
            let rightShoulderMoveX = rightShoulderBaseX;
            let rightShoulderMoveY = rightShoulderBaseY;

            let leftReach = 19.2;
            let rightReach = 18.8;
            let leftTargetX = leftShoulderMoveX + Math.cos(pose.leftAngle) * leftReach * dir;
            let leftTargetY = leftShoulderMoveY + Math.sin(pose.leftAngle) * leftReach;
            let rightTargetX = rightShoulderMoveX + Math.cos(pose.rightAngle) * rightReach * dir;
            let rightTargetY = rightShoulderMoveY + Math.sin(pose.rightAngle) * rightReach;
            let skipPoseReachAdjustment = false;
            let comboStep4LoadBlend = 0;
            let comboStep4AngleDive = 0;
            const idleArmWaveLocal = Math.sin(this.motionTime * 0.01);
            const singleKatanaLeftHandXLocal = centerX + dir * (isCrouchPose ? 11.5 : 14.0);
            const singleKatanaLeftHandYLocal = leftShoulderY + (isCrouchPose ? 6.2 : 7.8) + idleArmWaveLocal * (isCrouchPose ? 0.8 : 1.7);
            const dualWieldRightHandXLocal = centerX - dir * (isCrouchPose ? 4.6 : 7.2);
            const dualWieldRightHandYLocal = rightShoulderY + (isCrouchPose ? 6.8 : 8.5) + Math.sin(this.motionTime * 0.01 + 0.5) * (isCrouchPose ? 0.8 : 1.7);

            if (comboStep === 1) {
                // 一段: 左刀・袈裟斬り — アイドル構えから左腕を振り下ろし、右腕は待機位置で微動
                const slashT = smoothStep01(comboProgress / 0.56);
                const settleT = smoothStep01(Math.max(0, (comboProgress - 0.56) / 0.44));
                // 左肩: 斬撃に合わせて前方へ押し出す
                leftShoulderMoveX += dir * (0.3 + slashT * 1.8 - settleT * 0.6);
                leftShoulderMoveY += slashT * 0.4;
                // 右肩: 微動で体の回転を表現
                rightShoulderMoveX -= dir * (0.1 + slashT * 0.3);
                rightShoulderMoveY += slashT * 0.12;
            } else if (comboStep === 2) {
                // 二段: 右刀・逆袈裟 — 右腕を下から上へ跳ね上げ、左腕は少し引き戻す
                const slashT = smoothStep01(comboProgress / 0.52);
                const settleT = smoothStep01(Math.max(0, (comboProgress - 0.52) / 0.48));
                // 右肩: 跳ね上げに合わせて上方・前方へ押し出す
                rightShoulderMoveX += dir * (0.4 + slashT * 1.6 - settleT * 0.4);
                rightShoulderMoveY -= slashT * 0.8;
                // 左肩: 引き付けて体幹の回転を見せる
                leftShoulderMoveX -= dir * (0.8 + slashT * 1.2);
                leftShoulderMoveY += slashT * 0.3;
            } else if (comboStep === 3) {
                // 三段: 両手・交差薙ぎ — 一旦中央に寄せてからX字に展開
                const gatherT = smoothStep01(comboProgress / 0.22);
                const slashT = smoothStep01(Math.max(0, (comboProgress - 0.22) / 0.40));
                const settleT = smoothStep01(Math.max(0, (comboProgress - 0.62) / 0.38));
                // 収束フェーズ: 両肩を中央へ寄せる
                leftShoulderMoveX += dir * (gatherT * 1.8 - slashT * 2.2);
                leftShoulderMoveY -= gatherT * 0.5 - slashT * 0.2;
                rightShoulderMoveX -= dir * (gatherT * 1.4 - slashT * 2.8);
                rightShoulderMoveY -= gatherT * 0.4 - slashT * 0.3;
                // 展開後は少し収束（4段目の並行切り上げへ繋ぐ）
                leftShoulderMoveX -= dir * settleT * 1.2;
                leftShoulderMoveY += settleT * 0.6;
                rightShoulderMoveX += dir * settleT * 1.4;
                rightShoulderMoveY += settleT * 0.5;

            } else if (comboStep === 4) {
                // 四段: 前方斜め下から切り上げ、終端は平行維持のまま溜め姿勢
                const phase = smoothStep01(comboProgress);
                const backAngle = pose.leftAngle;
                const frontAngle = pose.rightAngle;
                const endBend = smoothStep01((comboProgress - 0.8) / 0.2);
                comboStep4LoadBlend = smoothStep01((comboProgress - 0.72) / 0.28);
                comboStep4AngleDive = comboStep4LoadBlend * 0.78;
                const baseReach = isCrouchPose ? 18.9 : 20.8;
                const reachScale = 1 - 0.18 * endBend;
                const backSweepReach = baseReach * reachScale;
                const frontSweepReach = (baseReach - 0.4) * reachScale;

                skipPoseReachAdjustment = true;
                leftShoulderMoveX += dir * (0.44 + (phase - 0.48) * 1.18) - dir * (isCrouchPose ? 0.62 : 0.92) * comboStep4LoadBlend;
                rightShoulderMoveX -= dir * (0.04 + phase * 0.42) + dir * (isCrouchPose ? 0.9 : 1.24) * comboStep4LoadBlend;
                leftShoulderMoveY -= 0.3 + phase * 1.62 + comboStep4LoadBlend * (isCrouchPose ? 0.12 : 0.2);
                rightShoulderMoveY -= 0.28 + phase * 1.52 + comboStep4LoadBlend * (isCrouchPose ? 0.08 : 0.16);

                leftTargetX = leftShoulderMoveX + Math.cos(backAngle) * backSweepReach * dir;
                leftTargetY = leftShoulderMoveY + Math.sin(backAngle) * backSweepReach;
                rightTargetX = rightShoulderMoveX + Math.cos(frontAngle) * frontSweepReach * dir;
                rightTargetY = rightShoulderMoveY + Math.sin(frontAngle) * frontSweepReach;

                // 奥行き: 手前手は下、奥手は上を維持しつつ、刀は平行のまま溜める
                rightTargetY += (isCrouchPose ? 1.28 : 1.82) + comboStep4LoadBlend * (isCrouchPose ? 0.16 : 0.28);
                leftTargetY -= (isCrouchPose ? 0.86 : 1.24) + comboStep4LoadBlend * (isCrouchPose ? 0.06 : 0.12);
                rightTargetX -= dir * ((isCrouchPose ? 0.86 : 1.22) + comboStep4LoadBlend * (isCrouchPose ? 0.44 : 0.68));
                leftTargetX += dir * ((isCrouchPose ? 0.28 : 0.46) - comboStep4LoadBlend * (isCrouchPose ? 0.06 : 0.1));
            } else if (comboStep === 0) {
                // 五段: 海老反りクロスから腕を左右に開きつつ叩きつける
                const phase = smoothStep01(comboProgress);
                const backAngle = pose.leftAngle;
                const frontAngle = pose.rightAngle;
                const startBend = 1 - smoothStep01(comboProgress / 0.24);
                const baseReach = isCrouchPose ? 18.9 : 20.8;
                const reachScale = 1 - 0.12 * startBend;
                const backSweepReach = baseReach * reachScale;
                const frontSweepReach = (baseReach - 0.4) * reachScale;

                skipPoseReachAdjustment = true;
                leftShoulderMoveX += dir * (0.28 + phase * 1.18);
                rightShoulderMoveX -= dir * (0.1 + phase * 1.28);
                leftShoulderMoveY += 0.15 + phase * 1.55;
                rightShoulderMoveY += 0.2 + phase * 1.7;

                leftTargetX = leftShoulderMoveX + Math.cos(backAngle) * backSweepReach * dir;
                leftTargetY = leftShoulderMoveY + Math.sin(backAngle) * backSweepReach;
                rightTargetX = rightShoulderMoveX + Math.cos(frontAngle) * frontSweepReach * dir;
                rightTargetY = rightShoulderMoveY + Math.sin(frontAngle) * frontSweepReach;

                // 開始はクロス寄り、終盤で左右へ開く
                rightTargetY += (isCrouchPose ? 1.1 : 1.55) + phase * 0.52;
                leftTargetY -= (isCrouchPose ? 0.62 : 0.9) - phase * 0.2;
                // 叩きつけ終盤で左右展開。奥の手は抑えめにして破綻を防ぐ
                const spreadBlend = smoothStep01((comboProgress - 0.46) / 0.54);
                rightTargetX -= dir * ((isCrouchPose ? 0.62 : 0.95) + spreadBlend * 2.35);
                leftTargetX += dir * ((isCrouchPose ? 0.24 : 0.42) + spreadBlend * 0.95);
            }

            const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
            const shoulderMaxDriftX = (comboStep === 4 || comboStep === 0) ? 3.9 : 2.9;
            const shoulderMaxDriftY = (comboStep === 4 || comboStep === 0) ? 3.9 : 3.1;
            leftShoulderMoveX = clamp(leftShoulderMoveX, leftShoulderBaseX - shoulderMaxDriftX, leftShoulderBaseX + shoulderMaxDriftX);
            leftShoulderMoveY = clamp(leftShoulderMoveY, leftShoulderBaseY - shoulderMaxDriftY, leftShoulderBaseY + shoulderMaxDriftY);
            rightShoulderMoveX = clamp(rightShoulderMoveX, rightShoulderBaseX - shoulderMaxDriftX, rightShoulderBaseX + shoulderMaxDriftX);
            rightShoulderMoveY = clamp(rightShoulderMoveY, rightShoulderBaseY - shoulderMaxDriftY, rightShoulderBaseY + shoulderMaxDriftY);

            // 肩移動の差分を手先ターゲットへ反映
            leftTargetX += leftShoulderMoveX - leftShoulderBaseX;
            leftTargetY += leftShoulderMoveY - leftShoulderBaseY;
            rightTargetX += rightShoulderMoveX - rightShoulderBaseX;
            rightTargetY += rightShoulderMoveY - rightShoulderBaseY;
            if (!skipPoseReachAdjustment) {
                leftTargetX += Math.cos(pose.leftAngle) * (leftReach - 21.8) * dir;
                leftTargetY += Math.sin(pose.leftAngle) * (leftReach - 21.8);
                rightTargetX += Math.cos(pose.rightAngle) * (rightReach - 21.2) * dir;
                rightTargetY += Math.sin(pose.rightAngle) * (rightReach - 21.2);
            }

            let dualBackReachCap = Math.min(standardLeftReach, 20.8);
            let dualFrontReachCap = Math.min(standardRightReach, 20.4);
            if (comboStep === 1) {
                const stretchCap = smoothStep01((comboProgress - 0.74) / 0.26);
                dualFrontReachCap = Math.min(standardRightReach + 2.8, dualFrontReachCap + 2.8 * stretchCap);
            } else if (comboStep === 4) {
                // 4撃目終盤は肘を後ろへ折って溜めを作る
                dualBackReachCap = Math.min(standardLeftReach + 3.4 - comboStep4LoadBlend * 4.2, 23.8);
                dualFrontReachCap = Math.min(standardRightReach + 3.2 - comboStep4LoadBlend * 4.6, 23.3);
            } else if (comboStep === 0) {
                // 5撃目は振り下ろしで腕を伸ばす
                dualBackReachCap = Math.min(standardLeftReach + 4.2, 24.6);
                dualFrontReachCap = Math.min(standardRightReach + 4.2, 24.2);
            }
            let leftHand = clampArmReach(leftShoulderMoveX, leftShoulderMoveY, leftTargetX, leftTargetY, dualBackReachCap);
            const rightHand = clampArmReach(rightShoulderMoveX, rightShoulderMoveY, rightTargetX, rightTargetY, dualFrontReachCap);
            // 五段目は奥行き感を保つため、奥手が手前手より下に落ちないように固定
            if (comboStep === 0) {
                const minBackAboveGap = isCrouchPose ? 0.7 : 1.2;
                const maxBackY = rightHand.y - minBackAboveGap;
                if (leftHand.y > maxBackY) {
                    const correctedBack = clampArmReach(
                        leftShoulderMoveX,
                        leftShoulderMoveY,
                        leftHand.x,
                        maxBackY,
                        dualBackReachCap
                    );
                    // 補正後も必ず「奥手が少し上」を維持
                    leftHand = {
                        x: correctedBack.x,
                        y: Math.min(correctedBack.y, maxBackY)
                    };
                }
            }
            const katanaLength = this.getKatanaBladeLength();
            const uprightBlend = 0.28;
            const uprightTarget = -Math.PI / 2;
            const leftWeaponAngleRaw = pose.leftAngle - comboStep4AngleDive;
            const rightWeaponAngleRaw = pose.rightAngle - comboStep4AngleDive;
            // 4撃目終盤は「刀見た目の溜め角度」と「剣筋追従角度」を分離して、
            // 下側に飛ぶ異常剣筋を抑える (ここも左右を入れ替え)
            const leftTrailAngleRaw = (comboStep === 4) ? pose.leftAngle : leftWeaponAngleRaw;
            const rightTrailAngleRaw = (comboStep === 4) ? pose.rightAngle : rightWeaponAngleRaw;
            const toAdjustedAngle = (rawAngle) => rawAngle + (uprightTarget - rawAngle) * uprightBlend;
            const leftAdjustedAngle = toAdjustedAngle(leftTrailAngleRaw);
            const rightAdjustedAngle = toAdjustedAngle(rightTrailAngleRaw);
            let leftArmBendDir = -dir;
            let rightArmBendDir = -dir;
            let leftArmBendScale = 1;
            let rightArmBendScale = 1;
            if (comboStep === 4 && comboStep4LoadBlend > 0) {
                // 溜め終盤は肘を背中側へ折り、次段の振り下ろしへ力を溜める
                const bendBlend = comboStep4LoadBlend;
                leftArmBendDir = (-dir) * (1 - bendBlend) + dir * bendBlend;
                rightArmBendDir = (-dir) * (1 - bendBlend) + dir * bendBlend;
                leftArmBendScale = 1 + bendBlend * 1.95;
                rightArmBendScale = 1 + bendBlend * 2.08;
            }
            const leftTipX = leftHand.x + Math.cos(leftAdjustedAngle) * dir * katanaLength;
            const leftTipY = leftHand.y + Math.sin(leftAdjustedAngle) * katanaLength;
            const rightTipX = rightHand.x + Math.cos(rightAdjustedAngle) * dir * katanaLength;
            const rightTipY = rightHand.y + Math.sin(rightAdjustedAngle) * katanaLength;
            this.dualBladeTrailAnchors = {
                direction: dir,
                back: {
                    handX: leftHand.x,
                    handY: leftHand.y,
                    tipX: leftTipX,
                    tipY: leftTipY,
                    angle: leftAdjustedAngle
                },
                front: {
                    handX: rightHand.x,
                    handY: rightHand.y,
                    tipX: rightTipX,
                    tipY: rightTipY,
                    angle: rightAdjustedAngle
                }
            };
            const drawBackArmWeapon = () => {
                drawBentArmSegment(leftShoulderMoveX, leftShoulderMoveY, leftHand.x, leftHand.y, standardUpperLen, standardForeLen, leftArmBendDir, 5.3, leftArmBendScale);
                drawHand(leftHand.x, leftHand.y, standardLeftHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(leftHand.x, leftHand.y, leftWeaponAngleRaw, dir);
                }
            };
            const drawFrontArmWeapon = () => {
                drawBentArmSegment(rightShoulderMoveX, rightShoulderMoveY, rightHand.x, rightHand.y, standardUpperLen, standardForeLen, rightArmBendDir, 5.3, rightArmBendScale);
                if (renderWeaponVisuals) {
                    // 腕の後に「柄」を描画することで、手首が柄の背後に隠れるようにする
                    drawSubWeaponKatana(rightHand.x, rightHand.y, rightWeaponAngleRaw, dir, 0.28, 'handle');
                }
                // 手前手は柄より前に描いて「握っている」見え方を優先する
                drawHand(rightHand.x, rightHand.y, standardRightHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(rightHand.x, rightHand.y, rightWeaponAngleRaw, dir, 0.28, 'blade');
                }
            };

            if (drawBackLayer) drawBackArmWeapon();
            if (drawFrontLayer) drawFrontArmWeapon();
        } else if (this.comboStep1IdleTransitionTimer > 0 && this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
            // === 二刀流リカバリーフェーズ: コンボ終了後にアイドル姿勢へ滑らかに戻る ===
            const recoveryDuration = 180;
            const t = 1 - Math.max(0, Math.min(1, this.comboStep1IdleTransitionTimer / recoveryDuration));
            const easeT = t * t * (3 - 2 * t);
            
            // アイドル時の基本角度
            const idleLeftBladeAngle = isCrouchPose ? -0.32 : -0.65;
            const idleRightBladeAngle = isCrouchPose ? -0.82 : -1.1;
            
            // コンボ最終段の姿勢を取得（getMainSwingPoseを使用）
            const lastPose = this.currentSubWeapon.getMainSwingPose({
                comboIndex: this.currentSubWeapon.comboIndex || 1,
                progress: 1.0 // 終端姿勢
            });

            // 角度を補間
            const leftAngle = lastPose.leftAngle + (idleLeftBladeAngle - lastPose.leftAngle) * easeT;
            const rightAngle = lastPose.rightAngle + (idleRightBladeAngle - lastPose.rightAngle) * easeT;

            // 各手の位置を再計算（肩の位置 + リーチ + 補間された角度）
            const leftHandX = leftShoulderX + Math.cos(leftAngle) * dir * 21.8;
            const leftHandY = leftShoulderY + Math.sin(leftAngle) * 21.8;
            const rightHandX = rightShoulderX + Math.cos(rightAngle) * dir * 21.2;
            const rightHandY = rightShoulderY + Math.sin(rightAngle) * 21.2;

            if (drawBackLayer) {
                drawBentArmSegment(leftShoulderX, leftShoulderY, leftHandX, leftHandY, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(leftHandX, leftHandY, standardLeftHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(leftHandX, leftHandY, leftAngle, dir);
                }
            }
            if (drawFrontLayer) {
                drawBentArmSegment(rightShoulderX, rightShoulderY, rightHandX, rightHandY, standardUpperLen, standardForeLen, -dir, 5.3);
                if (renderWeaponVisuals) drawSubWeaponKatana(rightHandX, rightHandY, rightAngle, dir, 0.28, 'handle');
                drawHand(rightHandX, rightHandY, standardRightHandRadius);
                if (renderWeaponVisuals) drawSubWeaponKatana(rightHandX, rightHandY, rightAngle, dir, 0.28, 'blade');
            }
        } else if (this.subWeaponAction === '二刀_合体') {
            // === 二刀合体: X構え → X斬撃 → アイドル復帰 ===
            const clamped = Math.min(1, Math.max(0, progress));
            
            // ユーザー要望に合わせたフェード比率の最終調整:
            // 1. 交差まで (gather) - 極めて高速 (15%)
            // 2. タメ (hold) - 一定時間静止 (53%)
            // 3. 振り下ろし (strike) - 瞬間的 (0.32 * 0.22 ≒ 7%)
            // 4. 余韻・復帰 (recovery) - 残りすべてを使いゆっくり戻す (25%)
            const gatherPhase = 0.15;
            const holdPhase = 0.53;
            const releasePhase = Math.max(0.01, 1 - gatherPhase - holdPhase);
            
            const gather = Math.max(0, Math.min(1, clamped / gatherPhase));
            const hold = clamped <= gatherPhase ? 0 : Math.max(0, Math.min(1, (clamped - gatherPhase) / holdPhase));
            const release = clamped <= (gatherPhase + holdPhase) ? 0 : Math.max(0, Math.min(1, (clamped - gatherPhase - holdPhase) / releasePhase));
            
            const easeGather = Math.pow(gather, 0.38); // さらに初速を上げる
            const easeRelease = release;
            const easeHold = hold;
            const holdPulse = Math.sin(hold * Math.PI) * 0.15;
            const lerp = (a, b, t) => a + (b - a) * t;

            // --- 二刀流アイドル座標・角度 ---
            const idleArmWave = Math.sin(this.motionTime * 0.01);
            const singleKatanaLeftHandX = centerX + dir * (isCrouchPose ? 11.5 : 14.0);
            const singleKatanaLeftHandY = leftShoulderY + (isCrouchPose ? 6.2 : 7.8) + idleArmWave * (isCrouchPose ? 0.8 : 1.7);
            const dualWieldRightHandX = centerX - dir * (isCrouchPose ? 4.6 : 7.2);
            const dualWieldRightHandY = rightShoulderY + (isCrouchPose ? 6.8 : 8.5) + Math.sin(this.motionTime * 0.01 + 0.5) * (isCrouchPose ? 0.8 : 1.7);
            const singleKatanaLeftBladeAngle = isCrouchPose ? -0.32 : -0.65;
            const dualWieldRightBladeAngle = isCrouchPose ? -0.82 : -1.1;

            // --- X構えの幾何学的設計 ---
            // 交差点: 顔の前方
            const crossX = centerX + dir * (isCrouchPose ? 5 : 7);
            const crossY = pivotY - (isCrouchPose ? 1 : 3);
            // 垂直を中心に対称に開く角度
            const openAngle = 0.48;
            // 刃の中心までの距離 (手前=通常, 奥=短縮で奥行き表現)
            const frontHalfReach = 22;
            const backHalfReach = frontHalfReach * 0.82; // 仮想奥行きで短く見せる
            // 刀の角度 (手前は切っ先が揃うよう少し右に傾ける)
            const xBackAngle = -(Math.PI / 2 + openAngle);
            const xFrontAngle = -(Math.PI / 2 - openAngle - 0.14);
            // 交差点から逆算して手の位置を決定
            const xBackHandX = crossX - dir * Math.cos(xBackAngle) * backHalfReach;
            const xFrontHandX = crossX - dir * Math.cos(xFrontAngle) * frontHalfReach;
            // 刃先の高さを揃える: 刀身カーブ補正含む
            const rawBackHandY = crossY - Math.sin(xBackAngle) * backHalfReach;
            const rawFrontHandY = crossY - Math.sin(xFrontAngle) * frontHalfReach;
            const xBackHandY = rawBackHandY;
            const xFrontHandY = rawFrontHandY + 2; // 刀身の反りによる切っ先ズレを補正

            // --- 振り抜きポーズ (X斬撃) ---
            // 交差状態から両刃が開くように振り抜く:
            //   奥の剣: 上左方向 → 前下方向へ斬り抜け (手が前に出て下がる)
            //   手前の剣: 上右方向 → 後ろ下方向へ斬り抜け (手が後ろに引かれ下がる)
            const slashBackHandX = centerX + dir * (isCrouchPose ? 15 : 18);
            const slashBackHandY = pivotY + (isCrouchPose ? 12 : 14);
            const slashBackAngle = isCrouchPose ? 0.5 : 0.65;
            const slashFrontHandX = centerX - dir * (isCrouchPose ? 7 : 10);
            const slashFrontHandY = pivotY + (isCrouchPose ? 13 : 15);
            const slashFrontAngle = isCrouchPose ? 2.3 : 2.5;

            // --- アニメーション補間 ---
            let bx, by, fx, fy, ba, fa;

            if (clamped < gatherPhase) {
                // アイドル → X構え (スムーズ遷移)
                bx = lerp(singleKatanaLeftHandX, xBackHandX, easeGather);
                by = lerp(singleKatanaLeftHandY, xBackHandY, easeGather);
                fx = lerp(dualWieldRightHandX, xFrontHandX, easeGather);
                fy = lerp(dualWieldRightHandY, xFrontHandY, easeGather);
                ba = lerp(singleKatanaLeftBladeAngle, xBackAngle, easeGather);
                fa = lerp(dualWieldRightBladeAngle, xFrontAngle, easeGather);
            } else if (clamped < gatherPhase + holdPhase) {
                // X構えホールド (微振動)
                bx = xBackHandX + holdPulse * 0.2;
                by = xBackHandY - holdPulse * 0.1;
                fx = xFrontHandX - holdPulse * 0.15;
                fy = xFrontHandY + holdPulse * 0.08;
                ba = xBackAngle + holdPulse * 0.015;
                fa = xFrontAngle - holdPulse * 0.015;
            } else {
                // 振り抜き (0.0 -> 0.22) → 余韻 (0.22 -> 1.0)
                const relProgress = easeRelease;
                if (relProgress < 0.22) {
                    // 1. 素早い振り抜き (Strike)
                    const t = relProgress / 0.22;
                    const eT = Math.pow(t, 0.4); // 加速感
                    bx = lerp(xBackHandX, slashBackHandX, eT);
                    by = lerp(xBackHandY, slashBackHandY, eT);
                    fx = lerp(xFrontHandX, slashFrontHandX, eT);
                    fy = lerp(xFrontHandY, slashFrontHandY, eT);
                    ba = lerp(xBackAngle, slashBackAngle, eT);
                    fa = lerp(xFrontAngle, slashFrontAngle, eT);
                } else {
                    // 2. 余韻とアイドル復帰を統合し、ゆっくり戻す
                    const t = (relProgress - 0.22) / 0.78;
                    const eT = t * t * (3 - 2 * t);
                    // 振り抜き終点からアイドルへ
                    bx = lerp(slashBackHandX, singleKatanaLeftHandX, eT);
                    by = lerp(slashBackHandY, singleKatanaLeftHandY, eT);
                    fx = lerp(slashFrontHandX, dualWieldRightHandX, eT);
                    fy = lerp(slashFrontHandY, dualWieldRightHandY, eT);
                    ba = lerp(slashBackAngle, singleKatanaLeftBladeAngle, eT);
                    fa = lerp(slashFrontAngle, dualWieldRightBladeAngle, eT);
                }
            }

            // 肩の微動
            const bsx = leftShoulderX + dir * easeGather * 0.4;
            const bsy = leftShoulderY - easeGather * 0.3;
            const fsx = rightShoulderX + dir * easeGather * 0.3;
            const fsy = rightShoulderY - easeGather * 0.25;

            // --- エネルギー蓄積エフェクト ---
            const energyIntensity = clamped < gatherPhase
                ? gather * gather
                : (clamped < gatherPhase + holdPhase ? 1.0 : Math.max(0, 1 - release * 1.5));

            // --- 描画 ---
            // 奥手 (背面レイヤー)
            if (drawBackLayer) {
                drawBentArmSegment(bsx, bsy, bx, by, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(bx, by, standardLeftHandRadius);
            }
            // 奥の刀 (前面レイヤー, 通常描画)
            if (drawFrontLayer && renderWeaponVisuals) {
                drawSubWeaponKatana(bx, by, ba, dir, 0.02, 'all');
            }
            // 手前手 (前面レイヤー)
            if (drawFrontLayer) {
                drawBentArmSegment(fsx, fsy, fx, fy, standardUpperLen, standardForeLen, -dir, 5.2);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(fx, fy, fa, dir, 0.02, 'handle');
                }
                drawHand(fx, fy, standardRightHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(fx, fy, fa, dir, 0.02, 'blade');
                }
            }

            // --- エネルギーエフェクト (腕・刀の上に加算合成で重ねる) ---
            if (energyIntensity > 0.01 && drawFrontLayer) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const ePulse = Math.sin(this.motionTime * 0.08) * 0.3 + 0.7;
                const eAlpha = energyIntensity * 0.7 * ePulse;
                const uprightTarget = -Math.PI / 2;
                const uprightBlend = 0.02;
                const kScale = 0.52;
                
                // 刀と同じローカル座標系でエフェクトを描画するヘルパー
                const drawBladeEffect = (baseX, baseY, baseAngle, colorCenter, colorMid, colorEdge, glowRBase, energyLenBase) => {
                    ctx.save();
                    ctx.translate(baseX, baseY);
                    ctx.scale(dir, 1);
                    
                    // 左右反転に関わらず -PI/2 を基準にする（drawKatana 内部の回転挙動に合わせる）
                    const uTarget = -Math.PI / 2;
                    const blend = Math.max(0, Math.min(1, uprightBlend));
                    const adjustedAngle = baseAngle + (uTarget - baseAngle) * blend;
                    ctx.rotate(adjustedAngle);
                    
                    ctx.scale(kScale, kScale);
                    
                    const visualLen = this.getKatanaBladeLength() - 5;
                    const bladeReach = Math.max(18, visualLen) / kScale;
                    const bladeStart = 10 + 2.2; // habakiX + 2.2 in local scale
                    const bladeEnd = Math.max(bladeStart + 10, bladeReach);
                    const bl = bladeEnd - bladeStart;
                    const sori = bl * 0.18;
                    const getArcY = (t) => -(Math.pow(t, 1.8) * sori) + 0.06;
                    
                    // グロー: 刀身の中央付近
                    const midT = 0.45;
                    const midX = bladeStart + (bladeEnd - bladeStart) * midT;
                    const midY = getArcY(midT);
                    const glowR = glowRBase / kScale;
                    const glow = ctx.createRadialGradient(midX, midY, 0, midX, midY, glowR * 1.8);
                    glow.addColorStop(0, colorCenter);
                    glow.addColorStop(0.5, colorMid);
                    glow.addColorStop(1, colorEdge);
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(midX, midY, glowR * 1.8, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // エネルギーライン: 刀身の反りに沿って切っ先に向かう曲線。先細り形状にする
                    if (energyIntensity > 0.1) {
                        const lineAlpha = (energyIntensity - 0.1) * 0.85 * ePulse;
                        const lineTEnd = energyLenBase;
                        const baseWidth = 3.2 / kScale;
                        
                        ctx.beginPath();
                        const getTX = (t) => bladeStart + (bladeEnd - bladeStart) * t;
                        
                        // 先細りの形状を作るため、片側の輪郭を描く
                        const segs = 16;
                        for (let i = 0; i <= segs; i++) {
                            const t = (i / segs) * lineTEnd;
                            const w = baseWidth * (1 - t * 0.85); // 先端に向かって細くする
                            const px = getTX(t);
                            const py = getArcY(t) - w * 0.5;
                            if (i === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        // もう片側の輪郭を逆順に描いて閉じる
                        for (let i = segs; i >= 0; i--) {
                            const t = (i / segs) * lineTEnd;
                            const w = baseWidth * (1 - t * 0.85);
                            const px = getTX(t);
                            const py = getArcY(t) + w * 0.5;
                            ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        
                        // 飛翔体のカラーコードに合わせて、中心に近い明るい色で塗りつぶし
                        ctx.fillStyle = colorCenter.replace(/[\d.]+\)$/, `${lineAlpha})`);
                        ctx.fill();
                    }
                    ctx.restore();
                };

                const glowR = (7 + energyIntensity * 12) * ePulse;
                
                // 飛翔体のカラーコードに合わせる
                // 奥の刀: 青いエフェクト (rgba(80, 200, 255, 0.98) 系)
                drawBladeEffect(bx, by, ba, 
                    `rgba(80, 200, 255, ${eAlpha * 0.7})`,
                    `rgba(50, 150, 255, ${eAlpha * 0.35})`,
                    `rgba(40, 100, 220, 0)`,
                    glowR, energyIntensity
                );

                // 手前の刀: 赤いエフェクト (rgba(255, 80, 80, 0.98) 系)
                drawBladeEffect(fx, fy, fa, 
                    `rgba(255, 80, 80, ${eAlpha * 0.7})`,
                    `rgba(255, 50, 40, ${eAlpha * 0.35})`,
                    `rgba(180, 30, 30, 0)`,
                    glowR, energyIntensity
                );

                // 交差点の白い輝き
                ctx.fillStyle = `rgba(255, 255, 250, ${eAlpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(crossX, crossY, (3 + energyIntensity * 3) * ePulse, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        } else if (this.subWeaponAction === '大太刀') {
            // 大太刀: 柄の中心付近を両手で挟む専用グリップ
            const odachi = (this.currentSubWeapon && this.currentSubWeapon.name === '大太刀') ? this.currentSubWeapon : null;
            const grips = (odachi && typeof odachi.getDualGripAnchors === 'function')
                ? odachi.getDualGripAnchors(this)
                : null;
            const fallbackCenterX = centerX + dir * 2;
            const fallbackCenterY = pivotY - 2;
            const rearTarget = grips
                ? grips.rear
                : { x: fallbackCenterX - dir * 3, y: fallbackCenterY - 2.2 };
            const frontTarget = grips
                ? grips.front
                : { x: fallbackCenterX + dir * 3, y: fallbackCenterY + 2.2 };

            const rearShoulderX = leftShoulderX + dir * 0.15;
            const rearShoulderY = shoulderY - 0.2;
            const frontShoulderGripX = rightShoulderX - dir * 0.25;
            const frontShoulderGripY = shoulderY + 0.9;

            const rearHand = clampArmReach(rearShoulderX, rearShoulderY, rearTarget.x, rearTarget.y, standardLeftReach);
            if (drawBackLayer) {
                drawBentArmSegment(rearShoulderX, rearShoulderY, rearHand.x, rearHand.y, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(rearHand.x, rearHand.y, standardLeftHandRadius);
            }

            // 本体の手前に持つ見た目を作るため、奥手の後に大太刀を描く
            if (drawFrontLayer && renderWeaponVisuals && odachi && typeof odachi.render === 'function') {
                odachi.render(ctx, this);
                this.subWeaponRenderedInModel = true;
            }

            const rightHand = clampArmReach(frontShoulderGripX, frontShoulderGripY, frontTarget.x, frontTarget.y, standardRightReach);
            if (drawFrontLayer) {
                drawBentArmSegment(frontShoulderGripX, frontShoulderGripY, rightHand.x, rightHand.y, standardUpperLen, standardForeLen, -dir, 5.2);
                drawHand(rightHand.x, rightHand.y, standardRightHandRadius);
            }
        } else if (this.subWeaponAction === '鎖鎌') {
            // 鎖鎌: 振りかぶり -> 前方へ投げ放つ -> その後に回す
            const kusa = (this.currentSubWeapon && this.currentSubWeapon.name === '鎖鎌') ? this.currentSubWeapon : null;
            const anchor = (kusa && typeof kusa.getHandAnchor === 'function')
                ? kusa.getHandAnchor(this)
                : { x: centerX + dir * 13, y: pivotY + 8, progress };
            const phase = anchor.phase || 'orbit';
            const phaseT = anchor.phaseT || 0;
            const swingShoulderX = rightShoulderX + dir * 0.12;
            const swingShoulderY = rightShoulderY + 0.18;
            let targetHandX = anchor.x;
            let targetHandY = anchor.y;
            // 投げ終わり直後に軽い反動を入れて、人間の腕らしい減速を作る
            if (phase === 'orbit' && phaseT < 0.26) {
                const recoil = 1 - (phaseT / 0.26);
                targetHandX -= dir * (2.6 + recoil * 5.2);
                targetHandY += recoil * 1.25;
            }
            // 鎖鎌の腕長は投擲系(手裏剣/火薬玉)と同等レンジに統一
            const armMaxLen =
                phase === 'windup' ? 20.6 :
                (phase === 'throw' ? 21.0 : 21.2);
            const mainHand = clampArmReach(swingShoulderX, swingShoulderY, targetHandX, targetHandY, armMaxLen);

            // 手前手は最後に描画して、奥手の刀より手前に見せる
            if (drawFrontLayer) {
                if (phase === 'throw') {
                    drawProgressiveThrowArm(
                        swingShoulderX,
                        swingShoulderY,
                        mainHand.x,
                        mainHand.y,
                        phaseT,
                        -dir
                    );
                } else {
                    drawBentArmSegment(
                        swingShoulderX,
                        swingShoulderY,
                        mainHand.x,
                        mainHand.y,
                        standardUpperLen,
                        standardForeLen,
                        -dir,
                        5.3
                    );
                }
                drawHand(mainHand.x, mainHand.y, standardRightHandRadius);
            }
        } else {
            // その他（デフォルト突き）
            const armEndX = centerX + dir * 20;
            const armEndY = pivotY + 5;
            if (drawBackLayer) {
                drawBentArmSegment(leftShoulderX, leftShoulderY, armEndX, armEndY, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(armEndX, armEndY, standardLeftHandRadius);
            }
            if (drawFrontLayer) {
                drawSupportPose(centerX - dir * 8, pivotY + 12);
            }
        }

        // (プレビュー用背負い描画は削除)

        ctx.restore();
    }

    renderAttackArmAndWeapon(ctx, {
        centerX,
        pivotY,
        facingRight,
        leftShoulderX = centerX,
        leftShoulderY = pivotY,
        rightShoulderX = centerX,
        rightShoulderY = pivotY + 1,
        supportRightHand = true,
        layerPhase = 'all'
    }, alpha = 1.0, options = {}) {
        const silhouetteColor = (options.palette && options.palette.silhouette) || COLORS.PLAYER;
        const silhouetteOutlineEnabled = options.silhouetteOutline !== false;
        const silhouetteOutlineColor = (options.palette && options.palette.silhouetteOutline) || 'rgba(168, 196, 230, 0.29)';
        const armReachScale = Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0;
        const attackState = options.attackState || null;
        const attack = (attackState && attackState.currentAttack) ? attackState.currentAttack : this.currentAttack;
        if (!attack) {
            return;
        }
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const renderAttackTimer = (attackState && attackState.attackTimer !== undefined)
            ? attackState.attackTimer
            : this.attackTimer;
        const renderIsCrouching = (attackState && attackState.isCrouching !== undefined)
            ? attackState.isCrouching
            : this.isCrouching;
        const renderWidth = (attackState && Number.isFinite(attackState.width)) ? attackState.width : this.width;
        const renderHeight = (attackState && Number.isFinite(attackState.height)) ? attackState.height : this.height;
        const renderX = (attackState && Number.isFinite(attackState.x))
            ? attackState.x
            : (centerX - renderWidth * 0.5);
        const renderY = (attackState && Number.isFinite(attackState.y))
            ? attackState.y
            : (pivotY - (renderIsCrouching ? renderHeight * 0.58 : renderHeight * 0.43));
        const recoveryBlend = (attackState && Number.isFinite(attackState.recoveryBlend))
            ? Math.max(0, Math.min(1, attackState.recoveryBlend))
            : 0;
        const rawProgress = Math.max(0, Math.min(1, 1 - (renderAttackTimer / attackDuration)));
        const progress = this.getAttackMotionProgress(attack, rawProgress);
        const dir = facingRight ? 1 : -1;
        const attackArmStrokeWidth = 4.8; // 通常腕と同じ太さ
        const attackHandRadiusScale = 0.94; // 通常手と同じ縮尺
        const handOutlineGapHalf = 0.62;
        const outlineExpand = 0.75;
        const standardUpperLen = 13.6;
        const standardForeLen = 13.2;
        const drawBackLayer = layerPhase !== 'front';
        const drawFrontLayer = layerPhase !== 'back';
        let swordAngle = 0;
        let armEndX = centerX + dir * 14;
        let armEndY = pivotY + 6;
        let trail = null;
        let activeLeftShoulderX = leftShoulderX;
        let activeLeftShoulderY = leftShoulderY;
        let activeRightShoulderX = rightShoulderX;
        let activeRightShoulderY = rightShoulderY;
        let supportGripBackDist = 6.2;
        let supportGripSideOffset = 1.0;
        let supportGripMaxReach = 22;
        let allowSupportFrontHand = supportRightHand;
        if (attack.comboStep) {
            const bodyHeight = renderHeight;
            const bodyWidth = renderWidth;
            const comboPose = this.getComboSwordPoseState(
                {
                    x: renderX,
                    y: renderY,
                    width: bodyWidth,
                    height: bodyHeight,
                    facingRight,
                    isCrouching: renderIsCrouching,
                    attackTimer: renderAttackTimer,
                    currentAttack: attack,
                    recoveryBlend
                },
                {
                    leftShoulderX,
                    leftShoulderY,
                    rightShoulderX,
                    rightShoulderY,
                    supportRightHand
                }
            );
            if (comboPose) {
                swordAngle = comboPose.swordAngle;
                armEndX = comboPose.armEndX;
                armEndY = comboPose.armEndY;
                activeLeftShoulderX = comboPose.activeLeftShoulderX;
                activeLeftShoulderY = comboPose.activeLeftShoulderY;
                activeRightShoulderX = comboPose.activeRightShoulderX;
                activeRightShoulderY = comboPose.activeRightShoulderY;
                supportGripBackDist = comboPose.supportGripBackDist;
                supportGripSideOffset = comboPose.supportGripSideOffset;
                supportGripMaxReach = comboPose.supportGripMaxReach;
                allowSupportFrontHand = comboPose.allowSupportFrontHand;
            }
            switch (attack.comboStep) {
                case 2:
                    trail = {
                        mode: 'followSlash',
                        front: [214, 246, 255],
                        back: [104, 182, 242],
                        width: 13.6,
                        trailLen: 62,
                        edgeSpread: 4.2,
                        minAlpha: 0.3
                    };
                    break;
                case 1:
                    trail = {
                        mode: 'followSlash',
                        front: [225, 249, 255],
                        back: [116, 194, 248],
                        width: 14.6,
                        trailLen: 72,
                        edgeSpread: 4.8,
                        minAlpha: 0.38
                    };
                    break;
                case 3:
                    trail = {
                        mode: 'tipArc',
                        front: [222, 248, 255],
                        back: [102, 177, 238],
                        width: 13.8,
                        radius: 46,
                        startAngle: 2.45,
                        endAngle: -0.08,
                        revealStart: 0.08,
                        revealEnd: 0.94
                    };
                    break;
                case 4:
                    trail = {
                        mode: 'depthSlice',
                        front: [228, 250, 255],
                        back: [112, 186, 244],
                        width: 14.2,
                        length: 112,
                        spread: 13,
                        lift: 15
                    };
                    break;
                case 5:
                    trail = {
                        mode: 'followSlash',
                        front: [232, 252, 255],
                        back: [124, 198, 248],
                        width: 14.6,
                        trailLen: 74,
                        edgeSpread: 5.0,
                        minAlpha: 0.4
                    };
                    break;
                default:
                    break;
            }
        } else {
            switch (attack.type) {
                case ANIM_STATE.ATTACK_SLASH:
                    swordAngle = (progress - 0.5) * Math.PI;
                    armEndX = centerX + dir * 15;
                    armEndY = pivotY + 6;
                    // 二刀流装備時、X技でのポーズ調整
                    if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                        // 肘を曲げるためにターゲットを肩方向へ引き寄せる
                        armEndX -= dir * 4;
                        armEndY += 2.5;
                        // 角度を少し立たせて交差位置を調整
                        swordAngle += dir * 0.15;
                    }
                    break;
                case ANIM_STATE.ATTACK_UPPERCUT:
                    swordAngle = Math.PI / 2 - progress * Math.PI;
                    armEndX = centerX + dir * 12;
                    armEndY = pivotY - 5;
                    break;
                case ANIM_STATE.ATTACK_THRUST:
                    swordAngle = 0;
                    armEndX = centerX + dir * (10 + progress * 20);
                    armEndY = pivotY + 5;
                    break;
                case ANIM_STATE.ATTACK_SPIN:
                    swordAngle = progress * Math.PI * 2;
                    armEndX = centerX + Math.cos(swordAngle) * 10;
                    armEndY = pivotY + Math.sin(swordAngle) * 10;
                    break;
                case ANIM_STATE.ATTACK_DOWN:
                    swordAngle = -Math.PI / 2 + progress * Math.PI;
                    armEndX = centerX + dir * 15;
                    armEndY = pivotY;
                    break;
                default:
                    break;
            }
        }

        if (Math.abs(armReachScale - 1.0) > 0.001) {
            armEndX = activeLeftShoulderX + (armEndX - activeLeftShoulderX) * armReachScale;
            armEndY = activeLeftShoulderY + (armEndY - activeLeftShoulderY) * armReachScale;
        }

        const insetAlongSegment = (fromX, fromY, toX, toY, insetPx = 0) => {
            if (insetPx <= 0) return { x: fromX, y: fromY };
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.hypot(dx, dy);
            if (len <= 0.0001) return { x: fromX, y: fromY };
            const t = Math.min(1, insetPx / len);
            return { x: fromX + dx * t, y: fromY + dy * t };
        };
        const drawArmSegment = (x1, y1, x2, y2, width) => {
            if (alpha <= 0) return;
            if (silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = width + outlineExpand;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        };

        let lastAttackHandConnectFrom = null;
        const drawAttackArmPolylineOutline = (points, outlineWidth) => {
            if (!silhouetteOutlineEnabled || alpha <= 0 || !Array.isArray(points) || points.length < 2) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        };
        const drawConnectedAttackHandOutline = (xPos, yPos, radius, connectFrom = null) => {
            if (!silhouetteOutlineEnabled || alpha <= 0) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (connectFrom && Number.isFinite(connectFrom.x) && Number.isFinite(connectFrom.y)) {
                const inward = Math.atan2(connectFrom.y - yPos, connectFrom.x - xPos);
                ctx.arc(
                    xPos,
                    yPos,
                    radius,
                    inward + handOutlineGapHalf,
                    inward - handOutlineGapHalf + Math.PI * 2,
                    false
                );
            } else {
                ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
        };
        const drawAttackHand = (xPos, yPos, radius = 4.8 * attackHandRadiusScale, connectFrom = null) => {
            if (alpha <= 0) return;
            const connectAnchor = connectFrom || lastAttackHandConnectFrom;
            drawConnectedAttackHandOutline(xPos, yPos, radius, connectAnchor);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            ctx.fill();
            lastAttackHandConnectFrom = null;
        };
        const drawAttackArmSegment = (fromX, fromY, toX, toY, width = attackArmStrokeWidth, withOutline = true) => {
            if (alpha <= 0) return;
            // 微小な距離（0.1未満）の場合は描画をスキップ
            if (Math.hypot(toX - fromX, toY - fromY) < 0.1) return;

            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = width + outlineExpand;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
        };
        const drawAttackBentArm = (
            shoulderX,
            shoulderY,
            handX,
            handY,
            bendDir = 1,
            width = attackArmStrokeWidth,
            upperLen = standardUpperLen,
            foreLen = standardForeLen
        ) => {
            if (alpha <= 0) return;
            const dx = handX - shoulderX;
            const dy = handY - shoulderY;
            const distRaw = Math.hypot(dx, dy);
            if (distRaw < 0.0001) {
                lastAttackHandConnectFrom = { x: shoulderX, y: shoulderY };
                drawAttackArmSegment(shoulderX, shoulderY, handX, handY, width);
                return;
            }
            const straightThreshold = (upperLen + foreLen) * 0.98;
            const ux = dx / distRaw;
            const uy = dy / distRaw;
            const midX = shoulderX + ux * (distRaw * 0.54);
            const midY = shoulderY + uy * (distRaw * 0.54);
            const nx = -uy;
            const ny = ux;
            const closeT = Math.max(0, Math.min(1, (straightThreshold - distRaw) / straightThreshold));
            const bendAmount = 1.25 + closeT * 1.55;
            const bendSign = -bendDir;
            const elbowX = midX + nx * bendAmount * bendSign;
            const elbowY = midY + ny * bendAmount * bendSign;

            // 手のひらへのハミ出しを防ぐため終点を少し手前に
            const wristToHandDist = 1.4;
            const wristX = handX - ux * wristToHandDist;
            const wristY = handY - uy * wristToHandDist;
            const armStart = insetAlongSegment(shoulderX, shoulderY, elbowX, elbowY, 1.2);
            lastAttackHandConnectFrom = { x: wristX, y: wristY };

            drawAttackArmPolylineOutline(
                [
                    { x: armStart.x, y: armStart.y },
                    { x: elbowX, y: elbowY },
                    { x: wristX, y: wristY },
                    { x: handX, y: handY }
                ],
                width + outlineExpand
            );
            drawAttackArmSegment(shoulderX, shoulderY, elbowX, elbowY, width, false);
            drawAttackArmSegment(elbowX, elbowY, wristX, wristY, Math.max(4.4, width - 0.6), false);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(elbowX, elbowY, 2.35, 0, Math.PI * 2);
            ctx.fill();
        };
        const clampAttackMainReach = (shoulderX, shoulderY, handX, handY, maxLen) => {
            const dx = handX - shoulderX;
            const dy = handY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) return { x: handX, y: handY };
            const ratio = maxLen / dist;
            return {
                x: shoulderX + dx * ratio,
                y: shoulderY + dy * ratio
            };
        };

        const rot = swordAngle;
        const mainBendDir = attack.comboStep === 5
            ? -dir
            : (Math.sin(rot) < -0.22 ? -dir : dir);
        const mainReachCap = (standardUpperLen + standardForeLen) * armReachScale;
        const clampedMainHand = clampAttackMainReach(
            activeLeftShoulderX,
            activeLeftShoulderY,
            armEndX,
            armEndY,
            mainReachCap
        );
        armEndX = clampedMainHand.x;
        armEndY = clampedMainHand.y;

        const hasDualWeapon = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';
        if (hasDualWeapon) {
            // 二刀流装備時、肘の曲がりを保証するためにターゲットを引き寄せる
            // drawAttackBentArmのstraightThreshold(≈15)未満に収めることで肘が必ず曲がる
            const shoulderToHandDist = Math.hypot(armEndX - activeLeftShoulderX, armEndY - activeLeftShoulderY);
            const maxDist = 13; // straightThreshold未満に制限
            if (shoulderToHandDist > maxDist) {
                const pullBack = maxDist / shoulderToHandDist;
                armEndX = activeLeftShoulderX + (armEndX - activeLeftShoulderX) * pullBack;
                armEndY = activeLeftShoulderY + (armEndY - activeLeftShoulderY) * pullBack;
            }
        }

        // 奥手（主動作）: 付け根を固定して描画
        if (drawBackLayer) {
            drawAttackBentArm(
                activeLeftShoulderX,
                activeLeftShoulderY,
                armEndX,
                armEndY,
                mainBendDir,
                attackArmStrokeWidth
            );

            drawAttackHand(armEndX, armEndY, 4.8 * attackHandRadiusScale);
        }

        const swordLen = this.getKatanaBladeLength(); // 見た目の刀身長は常に統一（当たり判定rangeとは分離）
        let supportHand = null;

        // 手前手が空いている場合は添え手にする（両手持ち）
        if (drawFrontLayer && allowSupportFrontHand) {
            const clampArmReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
                const dx = targetX - shoulderX;
                const dy = targetY - shoulderY;
                const dist = Math.hypot(dx, dy);
                const maxLenScaled = maxLen * armReachScale;
                if (dist <= maxLenScaled || dist === 0) {
                    return { x: targetX, y: targetY };
                }
                const ratio = maxLenScaled / dist;
                return {
                    x: shoulderX + dx * ratio,
                    y: shoulderY + dy * ratio
                };
            };

            const bladeDirX = Math.cos(rot) * dir;
            const bladeDirY = Math.sin(rot);
            const perpX = -bladeDirY;
            const perpY = bladeDirX;
            const supportTargetX = armEndX - bladeDirX * (hasDualWeapon ? 2.5 : supportGripBackDist) + perpX * supportGripSideOffset;
            const supportTargetY = armEndY - bladeDirY * (hasDualWeapon ? 2.5 : supportGripBackDist) + perpY * supportGripSideOffset;
            if (hasDualWeapon && attack.type === ANIM_STATE.ATTACK_SLASH) {
                // 二刀流X技の添え手（手前手）位置も調整して、刃同士が中間で交差するようにする
                // 位置を少し下にずらして「ハ」の字に近い角度を作る
                supportHand = {
                    x: activeRightShoulderX + dir * 5.5,
                    y: activeRightShoulderY + 14.5
                };
            } else {
                supportHand = clampArmReach(
                    activeRightShoulderX,
                    activeRightShoulderY,
                    supportTargetX,
                    supportTargetY,
                    supportGripMaxReach
                );
            }
        }

        // 剣を描画（共通メソッドで統一）
        // 攻撃時は立たせ補正を切って、切っ先・剣筋・当たり判定を一致させる
        if (drawBackLayer || (drawFrontLayer && hasDualWeapon)) {
            // 二刀流の場合、前面フェーズでも奥の手（メイン武器）の刀を描画することで、頭部より前面に出す
            this.drawKatana(ctx, armEndX, armEndY, rot, facingRight ? 1 : -1, swordLen, 0);
        }
        const suppressBaseSlashForXBoost = this.isXAttackBoostActive() && this.isXAttackActionActive();

        // 手前手は剣の後に描画して、握っている見た目を作る
        if (drawFrontLayer && supportHand) {
            drawAttackBentArm(
                activeRightShoulderX,
                activeRightShoulderY,
                supportHand.x,
                supportHand.y,
                -dir,
                attackArmStrokeWidth
            );

            drawAttackHand(supportHand.x, supportHand.y, 4.5 * attackHandRadiusScale);
        }

        if (drawFrontLayer) {
            // 斬撃エフェクト（刀のローカル座標系で描画）
            ctx.save();
            ctx.translate(armEndX, armEndY);
            ctx.scale(facingRight ? 1 : -1, 1);
            ctx.rotate(rot);

            // 斬撃エフェクト（大きく、派手に）
            const swingAlpha = Math.max(0.08, 1 - rawProgress);
            const colorRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
            const drawDepthArc = (arc) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const counterClockwise = arc.end < arc.start;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;

            ctx.strokeStyle = colorRgba(arc.back, backAlpha);
            ctx.lineWidth = arc.width * 0.72;
            ctx.beginPath();
            ctx.arc(arc.originX - 6, arc.originY - 3, arc.radius * 0.92, arc.start + 0.1, arc.end + 0.12, counterClockwise);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(arc.front, frontAlpha);
            ctx.lineWidth = arc.width;
            ctx.beginPath();
            ctx.arc(arc.originX, arc.originY, arc.radius, arc.start, arc.end, counterClockwise);
            ctx.stroke();

            ctx.strokeStyle = `rgba(245, 252, 255, ${frontAlpha * 0.58})`;
            ctx.lineWidth = Math.max(1.1, arc.width * 0.14);
            ctx.beginPath();
            ctx.arc(arc.originX + 1.1, arc.originY - 0.9, arc.radius - 2.0, arc.start + 0.04, arc.end + 0.04, counterClockwise);
            ctx.stroke();
            ctx.restore();
        };
            const drawDepthSlice = (slice) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const length = slice.length || 108;
            const spread = slice.spread || 12;
            const lift = slice.lift || 12;
            const width = slice.width || 13;

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.strokeStyle = colorRgba(slice.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.moveTo(-length * 0.26, -spread * 0.95);
            ctx.quadraticCurveTo(length * 0.22, -lift * 1.05, length, spread * 0.3);
            ctx.stroke();

            ctx.strokeStyle = colorRgba(slice.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(-length * 0.2, spread * 0.95);
            ctx.quadraticCurveTo(length * 0.28, lift * 1.05, length * 0.98, -spread * 0.2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(245, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.moveTo(-length * 0.16, spread * 0.58);
            ctx.quadraticCurveTo(length * 0.24, lift * 0.72, length * 0.9, -spread * 0.12);
            ctx.stroke();
            ctx.restore();
        };
            const drawFollowSlash = (slash) => {
            const alphaFloor = Math.max(0, Math.min(1, slash.minAlpha || 0));
            const alphaBase = Math.max(swingAlpha, alphaFloor);
            const backAlpha = alphaBase * 0.28;
            const frontAlpha = alphaBase * 0.82;
            const width = slash.width || 13;
            const trailLen = slash.trailLen || 52;
            const edgeSpread = slash.edgeSpread || 3.6;
            const tipX = swordLen;
            const tipY = 0;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen, -edgeSpread);
            ctx.quadraticCurveTo(tipX - trailLen * 0.36, -edgeSpread * 0.35, tipX, tipY);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen * 0.88, edgeSpread * 0.25);
            ctx.quadraticCurveTo(tipX - trailLen * 0.32, edgeSpread * 0.08, tipX, tipY);
            ctx.stroke();

            ctx.strokeStyle = `rgba(246, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen * 0.74, edgeSpread * 0.14);
            ctx.quadraticCurveTo(tipX - trailLen * 0.28, edgeSpread * 0.04, tipX, tipY);
            ctx.stroke();
            ctx.restore();
        };
            const drawTipArc = (slash) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const width = slash.width || 13;
            const tipX = swordLen;
            const tipY = 0;
            const radius = Math.max(16, slash.radius || 42);
            const centerX = tipX - radius;
            const centerY = tipY + (slash.centerYOffset || 0);
            const start = slash.startAngle ?? 2.5;
            const end = slash.endAngle ?? 0;
            const counterClockwise = (slash.counterClockwise !== undefined)
                ? !!slash.counterClockwise
                : (end < start);
            const revealStart = Math.max(0, Math.min(1, slash.revealStart ?? 0.08));
            const revealEnd = Math.max(revealStart + 0.01, Math.min(1, slash.revealEnd ?? 0.9));
            const revealRaw = (progress - revealStart) / (revealEnd - revealStart);
            const reveal = Math.max(0, Math.min(1, revealRaw));
            if (reveal <= 0.01) return;
            // 切っ先(=end)側から徐々に伸ばして描画する
            const visibleStart = end + (start - end) * reveal;

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;

            ctx.strokeStyle = colorRgba(slash.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.arc(centerX - 2.6, centerY - 1.5, radius * 0.92, visibleStart + 0.08, end + 0.04, counterClockwise);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, visibleStart, end, counterClockwise);
            ctx.stroke();

            const hiRadius = Math.max(4, radius - 2.0);
            const hiCenterX = tipX - hiRadius * Math.cos(end);
            const hiCenterY = tipY - hiRadius * Math.sin(end);
            ctx.strokeStyle = `rgba(246, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.arc(hiCenterX, hiCenterY, hiRadius, visibleStart, end, counterClockwise);
            ctx.stroke();
            ctx.restore();
        };

            const isComboAttack = !!attack.comboStep;
            // コンボ中はローカル白斬撃を重ねず、軌跡側だけを表示して刀身の白発光を防ぐ
            if (!suppressBaseSlashForXBoost && !isComboAttack) {
                if (trail && trail.mode === 'arc') {
                    drawDepthArc(trail);
                } else if (trail && trail.mode === 'depthSlice') {
                    drawDepthSlice(trail);
                } else if (trail && trail.mode === 'followSlash') {
                    drawFollowSlash(trail);
                } else if (trail && trail.mode === 'tipArc') {
                    drawTipArc(trail);
                } else if (trail && trail.mode === 'thrust') {
                    const alpha = swingAlpha * 0.72;
                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = colorRgba(trail.back, alpha * 0.3);
                    ctx.beginPath();
                    ctx.moveTo(swordLen - 2, -14);
                    ctx.lineTo(swordLen + 34, -5.5);
                    ctx.lineTo(swordLen + 34, 5.5);
                    ctx.lineTo(swordLen - 2, 14);
                    ctx.lineTo(swordLen + 6, 0);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = colorRgba(trail.front, alpha);
                    ctx.beginPath();
                    ctx.moveTo(swordLen + 1, -9.5);
                    ctx.lineTo(swordLen + 42, -2.6);
                    ctx.lineTo(swordLen + 42, 2.6);
                    ctx.lineTo(swordLen + 1, 9.5);
                    ctx.lineTo(swordLen + 10, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                } else if (attack.type === ANIM_STATE.ATTACK_THRUST) {
                    const alpha = swingAlpha * 0.72;
                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = `rgba(100, 255, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(swordLen, -25);
                    ctx.bezierCurveTo(swordLen + 20, -10, swordLen + 20, 10, swordLen, 25);
                    ctx.bezierCurveTo(swordLen + 10, 10, swordLen + 10, -10, swordLen, -25);
                    ctx.fill();
                    ctx.restore();
                } else {
                    ctx.strokeStyle = `rgba(100, 200, 255, ${0.8 * swingAlpha})`;
                    ctx.lineWidth = 15;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    const normalSlashRadius = 80;
                    if (attack.type === ANIM_STATE.ATTACK_SPIN) {
                        ctx.arc(0, 0, normalSlashRadius, 0, Math.PI * 2);
                    } else if (attack.isLaunch) {
                        ctx.arc(-20, 0, normalSlashRadius, -Math.PI * 0.4, Math.PI * 0.4, true);
                    } else {
                        ctx.arc(-10, 0, normalSlashRadius, -0.8, 0.8);
                    }
                    ctx.stroke();
                }
            }

            ctx.restore();
        }

    }

    getAttackMotionProgress(attack, rawProgress) {
        const p = Math.max(0, Math.min(1, rawProgress));
        if (!attack || !attack.comboStep) return p;

        const lerp = (a, b, t) => a + (b - a) * t;
        const smooth = (t) => t * t * (3 - 2 * t);
        const easeOut = (t) => 1 - Math.pow(1 - t, 3); // 減速型（出だしが速い）

        switch (attack.comboStep) {
            case 1: {
                // 初段（一ノ太刀）: smoothを使い、剣筋が綺麗な弧を描くよう溜まりを作る
                if (p < 0.28) return lerp(0, 0.22, smooth(p / 0.28));
                if (p < 0.72) return lerp(0.22, 0.94, smooth((p - 0.28) / 0.44));
                return lerp(0.94, 1.0, smooth((p - 0.72) / 0.28));
            }
            case 2: {
                // 二段（二ノ太刀）: 溜めを少し残して軌道の弧を出す
                if (p < 0.24) return lerp(0, 0.2, smooth(p / 0.24));
                if (p < 0.76) return lerp(0.2, 0.95, smooth((p - 0.24) / 0.52));
                return lerp(0.95, 1.0, smooth((p - 0.76) / 0.24));
            }
            case 3: {
                // 三段: しっかり溜め -> 回転横薙ぎを一気に
                if (p < 0.46) return lerp(0, 0.28, smooth(p / 0.46));
                if (p < 0.64) return lerp(0.28, 0.92, smooth((p - 0.46) / 0.18));
                return lerp(0.92, 1.0, smooth((p - 0.64) / 0.36));
            }
            case 4: {
                // 四段: 上昇 -> 宙返り
                if (p < 0.32) return lerp(0, 0.58, smooth(p / 0.32));
                if (p < 0.84) return lerp(0.58, 0.92, smooth((p - 0.32) / 0.52));
                return lerp(0.92, 1.0, smooth((p - 0.84) / 0.16));
            }
            case 5: {
                // 五段: 頭上構え -> 急降下 -> 着地余韻
                if (p < 0.26) return lerp(0, 0.16, smooth(p / 0.26));
                if (p < 0.64) return lerp(0.16, 0.94, smooth((p - 0.26) / 0.38));
                return lerp(0.94, 1.0, smooth((p - 0.64) / 0.36));
            }
            default:
                return p;
        }
    }

    getComboSwordPoseForTrail(state = null) {
        const baseState = state || {
            isAttacking: this.isAttacking,
            currentAttack: this.currentAttack,
            attackTimer: this.attackTimer,
            facingRight: this.facingRight,
            x: this.x,
            y: this.y,
            isCrouching: this.isCrouching
        };
        return this.getComboSwordPoseForTrailState(baseState);
    }

    getComboTrailProgressWindow(comboStep) {
        switch (comboStep) {
            // 剣筋描画調整を一旦リセット
            case 1: return { start: 0.0, end: 1.0 };
            case 2: return { start: 0.0, end: 1.0 };
            case 3: return { start: 0.0, end: 1.0 };
            case 4: return { start: 0.0, end: 1.0 };
            case 5: return { start: 0.15, end: 0.9 };
            default: return { start: 0, end: 1 };
        }
    }

    shouldKeepComboTrailDuringReturn(comboStep) {
        // 1-5撃目は戻りの余韻まで剣筋だけを残してフェードさせる
        return comboStep >= 1 && comboStep <= 5;
    }

    buildComboFixedBezierTrailSpec(state = {}, sampleTargets = [0.06, 0.5, 0.92]) {
        const attack = state.attack || this.currentAttack || null;
        if (!attack || !attack.comboStep || !Array.isArray(sampleTargets) || sampleTargets.length < 3) {
            return null;
        }
        const durationMs = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const buildStateAt = (rawProgress) => ({
            x: state.x !== undefined ? state.x : this.x,
            y: state.y !== undefined ? state.y : this.y,
            width: Number.isFinite(state.width) ? state.width : this.width,
            height: Number.isFinite(state.height) ? state.height : this.height,
            facingRight: state.facingRight !== undefined ? state.facingRight : this.facingRight,
            isCrouching: state.isCrouching !== undefined ? state.isCrouching : this.isCrouching,
            currentAttack: attack,
            attackTimer: durationMs * (1 - Math.max(0, Math.min(1, rawProgress))),
            recoveryBlend: 0
        });
        const startPose = this.getComboSwordPoseState(buildStateAt(sampleTargets[0]));
        const midPose = this.getComboSwordPoseState(buildStateAt(sampleTargets[1]));
        const endPose = this.getComboSwordPoseState(buildStateAt(sampleTargets[2]));
        if (!startPose || !midPose || !endPose) {
            return null;
        }
        const start = { x: startPose.trailTipX, y: startPose.trailTipY };
        const mid = { x: midPose.trailTipX, y: midPose.trailTipY };
        const end = { x: endPose.trailTipX, y: endPose.trailTipY };
        const totalSpan = Math.max(0.001, sampleTargets[2] - sampleTargets[0]);
        const midT = Math.max(0.08, Math.min(0.92, (sampleTargets[1] - sampleTargets[0]) / totalSpan));
        const midFactor = Math.max(0.001, 2 * (1 - midT) * midT);
        let controlX = (
            mid.x -
            ((1 - midT) * (1 - midT) * start.x) -
            (midT * midT * end.x)
        ) / midFactor;
        let controlY = (
            mid.y -
            ((1 - midT) * (1 - midT) * start.y) -
            (midT * midT * end.y)
        ) / midFactor;
        const controlXMin = Math.min(start.x, mid.x, end.x) - 18;
        const controlXMax = Math.max(start.x, mid.x, end.x) + 18;
        const controlYMin = Math.min(start.y, mid.y, end.y) - 18;
        const controlYMax = Math.max(start.y, mid.y, end.y) + 18;
        controlX = Math.max(controlXMin, Math.min(controlXMax, controlX));
        controlY = Math.max(controlYMin, Math.min(controlYMax, controlY));
        return {
            trailCurveStartX: start.x,
            trailCurveStartY: start.y,
            trailCurveControlX: controlX,
            trailCurveControlY: controlY,
            trailCurveEndX: end.x,
            trailCurveEndY: end.y
        };
    }

    buildComboStep4TrailArcSpec(state = {}) {
        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const width = Number.isFinite(state.width) ? state.width : this.width;
        const height = Number.isFinite(state.height) ? state.height : this.height;
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const attack = state.attack || this.currentAttack || null;
        const dir = facingRight ? 1 : -1;
        const bladeLen = this.getKatanaBladeLength();
        const smooth = (t) => {
            const v = Math.max(0, Math.min(1, t));
            return v * v * (3 - 2 * v);
        };
        const pointAt = (progress, bodyX = x, bodyY = y) => {
            const centerX = bodyX + width * 0.5;
            const pivotY = bodyY + (isCrouching ? height * 0.58 : height * 0.43);
            const clamped = Math.max(0, Math.min(0.42, progress));
            const rise = smooth(clamped / 0.42);
            const prepEase = smooth(clamped / 0.18);
            const rawAngle = -0.22 + (-0.74 + 0.22) * rise;
            const rawHandX = centerX + dir * (26 + (8.0 - 26) * rise);
            const rawHandY = pivotY + 5 + (-24.0 - 5) * rise;
            const handX = centerX + dir * 26 + (rawHandX - (centerX + dir * 26)) * prepEase;
            const handY = pivotY + 5 + (rawHandY - (pivotY + 5)) * prepEase;
            const angle = -0.22 + (rawAngle - (-0.22)) * prepEase;
            return {
                x: handX + Math.cos(angle) * bladeLen * dir,
                y: handY + Math.sin(angle) * bladeLen
            };
        };
        const sampleTargets = [0.08, 0.24, 0.42];
        const sampledBodies = [];
        const durationMs = Math.max(1, attack?.durationMs || PLAYER.ATTACK_COOLDOWN);
        const frameMs = 1000 / 60;
        const attackImpulse = (attack?.impulse || 1) * (Number.isFinite(state.speed) ? state.speed : this.speed);
        let simX = x;
        let simY = y;
        let simVx = isCrouching
            ? dir * attackImpulse * 0.28
            : ((Number.isFinite(state.vx) ? state.vx : this.vx) * 0.24 + dir * attackImpulse * 0.42);
        let simVy = isCrouching
            ? (Number.isFinite(state.vy) ? state.vy : this.vy)
            : Math.min(Number.isFinite(state.vy) ? state.vy : this.vy, -10.6);
        let timerMs = durationMs;
        let sampleIndex = 0;
        while (sampleIndex < sampleTargets.length) {
            const progress = Math.max(0, Math.min(1, 1 - (timerMs / durationMs)));
            while (sampleIndex < sampleTargets.length && progress >= sampleTargets[sampleIndex] - 0.0001) {
                sampledBodies[sampleIndex] = { x: simX, y: simY };
                sampleIndex++;
            }
            if (progress >= 0.42 || timerMs <= 0) break;
            const t = progress / 0.42;
            const z4HeightScale = 0.9;
            simVx = simVx * 0.68 + dir * (Number.isFinite(state.speed) ? state.speed : this.speed) * (0.24 - t * 0.14);
            simVy = (-18.6 + t * 3.2) * z4HeightScale;
            const riseLockT = Math.max(0, Math.min(1, progress / 0.72));
            const minRiseVy = (-16.2 + riseLockT * 13.5) * z4HeightScale;
            simVy = Math.min(simVy, minRiseVy);
            simX += simVx;
            simY += simVy;
            timerMs = Math.max(0, timerMs - frameMs);
        }
        while (sampleIndex < sampleTargets.length) {
            sampledBodies[sampleIndex] = { x: simX, y: simY };
            sampleIndex++;
        }
        const startBody = sampledBodies[0] || { x, y };
        const midBody = sampledBodies[1] || startBody;
        const endBody = sampledBodies[2] || midBody;
        const start = pointAt(0.08, startBody.x, startBody.y);
        const mid = pointAt(0.24, midBody.x, midBody.y);
        const end = pointAt(0.42, endBody.x, endBody.y);
        const chordX = end.x - start.x;
        const chordY = end.y - start.y;
        const chordLen = Math.max(1, Math.hypot(chordX, chordY));
        // t=0.5 で固定の中間点を通る制御点を逆算する
        const controlX = 2 * mid.x - (start.x + end.x) * 0.5;
        const controlY = 2 * mid.y - (start.y + end.y) * 0.5;
        return {
            trailArcCenterX: null,
            trailArcCenterY: null,
            trailArcRadius: chordLen,
            trailArcStartAngle: null,
            trailArcSpan: null,
            trailCurveStartX: start.x,
            trailCurveStartY: start.y,
            trailCurveControlX: controlX,
            trailCurveControlY: controlY,
            trailCurveEndX: end.x,
            trailCurveEndY: end.y
        };
    }

    buildComboStep5TrailSpec(state = {}) {
        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const width = Number.isFinite(state.width) ? state.width : this.width;
        const height = Number.isFinite(state.height) ? state.height : this.height;
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const attack = state.attack || this.currentAttack || null;
        const dir = facingRight ? 1 : -1;
        const bladeLen = this.getKatanaBladeLength();
        const pointAt = (progress, bodyX = x, bodyY = y) => {
            const centerX = bodyX + width * 0.5;
            const pivotY = bodyY + (isCrouching ? height * 0.58 : height * 0.43);
            let swordAngle;
            let armEndX;
            let armEndY;
            if (progress < 0.26) {
                const t = progress / 0.26;
                swordAngle = -1.45 + t * 0.3;
                armEndX = centerX - dir * (4.0 - t * 8.0);
                armEndY = pivotY - 18 - t * 5.0;
            } else if (progress < 0.78) {
                const t = (progress - 0.26) / 0.52;
                const fallEase = t * t * (3 - 2 * t);
                swordAngle = 0.1 + fallEase * 0.08;
                armEndX = centerX + dir * (15.6 + fallEase * 1.8);
                armEndY = pivotY + 12.8 + fallEase * 1.4;
            } else {
                const t = (progress - 0.78) / 0.22;
                const settle = t * t * (3 - 2 * t);
                swordAngle = 0.18 - settle * 0.04;
                armEndX = centerX + dir * (17.4 - settle * 0.8);
                armEndY = pivotY + 14.2 - settle * 0.8;
            }
            const prepT = Math.max(0, Math.min(1, progress / 0.2));
            const prepEase = prepT * prepT * (3 - 2 * prepT);
            const prevAngle = -2.7;
            const prevHandX = centerX - dir * 4.0;
            const prevHandY = pivotY - 18.0;
            swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
            armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
            armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
            return {
                x: armEndX + Math.cos(swordAngle) * bladeLen * dir,
                y: armEndY + Math.sin(swordAngle) * bladeLen
            };
        };

        const sampleTargets = [0.06, 0.38, 0.62, 0.78];
        const sampledBodies = [];
        const durationMs = Math.max(1, attack?.durationMs || PLAYER.ATTACK_COOLDOWN);
        const frameMs = 1000 / 60;
        let simX = x;
        let simY = y;
        let simVx = (Number.isFinite(state.vx) ? state.vx : this.vx) * 0.18;
        let simVy = Math.min(Number.isFinite(state.vy) ? state.vy : this.vy, -1.2);
        let timerMs = durationMs;
        let sampleIndex = 0;
        while (sampleIndex < sampleTargets.length) {
            const progress = Math.max(0, Math.min(1, 1 - (timerMs / durationMs)));
            while (sampleIndex < sampleTargets.length && progress >= sampleTargets[sampleIndex] - 0.0001) {
                sampledBodies[sampleIndex] = { x: simX, y: simY };
                sampleIndex++;
            }
            if (progress >= 0.78 || timerMs <= 0) break;
            if (progress < 0.26) {
                simVx *= 0.82;
                simVy = Math.min(simVy, -1.2);
            } else if (progress < 0.76) {
                const fallT = (progress - 0.26) / 0.5;
                simVx = simVx * 0.7 + (Number.isFinite(state.speed) ? state.speed : this.speed) * dir * 0.08;
                simVy = simVy * 0.34 + (9.8 + fallT * 19.8) * 0.66;
            } else {
                simVx *= 0.64;
                simVy = Math.max(simVy, 13.4);
            }
            // 実際の物理演算(applyPhysics)に合わせ、重力定数(0.8)を考慮して座標を更新
            simX += simVx;
            simY += simVy + 0.8;
            timerMs = Math.max(0, timerMs - frameMs);
        }
        while (sampleIndex < sampleTargets.length) {
            sampledBodies[sampleIndex] = { x: simX, y: simY };
            sampleIndex++;
        }

        const startBody = sampledBodies[0] || { x, y };
        const midBody = sampledBodies[1] || startBody;
        const endBody = sampledBodies[2] || midBody;
        const settleBody = sampledBodies[3] || endBody;
        const start = pointAt(sampleTargets[0], startBody.x, startBody.y);
        const mid = pointAt(sampleTargets[1], midBody.x, midBody.y);
        const end = pointAt(sampleTargets[2], endBody.x, endBody.y);
        const settleTip = pointAt(sampleTargets[3], settleBody.x, settleBody.y);
        const slashFloorY = (this.groundY + LANE_OFFSET) - Math.max(10, height * 0.1);
        end.y = Math.min(end.y, slashFloorY, settleTip.y);
        mid.y = Math.min(mid.y, start.y + (end.y - start.y) * 0.54);
        const midT = Math.max(0.08, Math.min(0.92, (0.38 - 0.16) / (0.62 - 0.16)));
        const midFactor = 2 * (1 - midT) * midT;
        let controlX = (mid.x - ((1 - midT) * (1 - midT) * start.x) - (midT * midT * end.x)) / midFactor;
        let controlY = (mid.y - ((1 - midT) * (1 - midT) * start.y) - (midT * midT * end.y)) / midFactor;
        const controlXMin = Math.min(start.x, end.x) - 6;
        const controlXMax = Math.max(start.x, end.x) + 6;
        const controlYMin = Math.min(start.y, end.y);
        const controlYMax = Math.max(start.y, end.y);
        controlX = Math.max(controlXMin, Math.min(controlXMax, controlX));
        controlY = Math.max(controlYMin, Math.min(controlYMax, controlY));
        return {
            trailCurveStartX: start.x,
            trailCurveStartY: start.y,
            trailCurveControlX: controlX,
            trailCurveControlY: controlY,
            trailCurveEndX: end.x,
            trailCurveEndY: end.y
        };
    }

    getComboSwordPoseState(state, options = {}) {
        if (!state) return null;
        const attack = state.currentAttack;
        if (!attack || !attack.comboStep) return null;

        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const width = Number.isFinite(state.width) ? state.width : this.width;
        const height = Number.isFinite(state.height) ? state.height : this.height;
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const attackTimer = state.attackTimer !== undefined ? state.attackTimer : this.attackTimer;
        const recoveryBlend = Number.isFinite(state.recoveryBlend)
            ? Math.max(0, Math.min(1, state.recoveryBlend))
            : 0;
        const dir = facingRight ? 1 : -1;
        const centerX = x + width / 2;
        const centerY = y + height * 0.5;
        const pivotY = y + (isCrouching ? height * 0.58 : height * 0.43);
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        let rawProgress = Math.max(0, Math.min(1, 1 - (attackTimer / attackDuration)));
        if (
            attack.comboStep === 4 &&
            Number.isFinite(attack.motionElapsedMs)
        ) {
            rawProgress = Math.max(0, Math.min(1, attack.motionElapsedMs / attackDuration));
        }
        const progress = this.getAttackMotionProgress(attack, rawProgress);
        const easeOut = 1 - Math.pow(1 - progress, 2);
        const easeInOut = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        const leftShoulderXBase = Number.isFinite(options.leftShoulderX) ? options.leftShoulderX : centerX;
        const leftShoulderYBase = Number.isFinite(options.leftShoulderY) ? options.leftShoulderY : pivotY;
        const rightShoulderXBase = Number.isFinite(options.rightShoulderX) ? options.rightShoulderX : centerX;
        const rightShoulderYBase = Number.isFinite(options.rightShoulderY) ? options.rightShoulderY : (pivotY + 1);

        let swordAngle = 0;
        let armEndX = centerX + dir * 14;
        let armEndY = pivotY + 6;
        let activeLeftShoulderX = leftShoulderXBase;
        let activeLeftShoulderY = leftShoulderYBase;
        let activeRightShoulderX = rightShoulderXBase;
        let activeRightShoulderY = rightShoulderYBase;
        let supportGripBackDist = 6.2;
        let supportGripSideOffset = 1.0;
        let supportGripMaxReach = 22;
        let allowSupportFrontHand = options.supportRightHand !== false;

        switch (attack.comboStep) {
            case 2: {
                const idleAngle = isCrouching ? -0.32 : -0.65;
                const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
                const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0);
                if (progress < 0.34) {
                    const backT = progress / 0.34;
                    const backEase = backT * backT * (3 - 2 * backT);
                    swordAngle = 2.18 + backEase * 1.34;
                    armEndX = centerX - dir * (12.0 + backEase * 10.8);
                    armEndY = pivotY + 7.8 - backEase * 20.4;
                } else {
                    const cutT = Math.min(1, (progress - 0.34) / 0.52); // 0.86で斬り抜き完了
                    const cutEase = cutT * cutT * (3 - 2 * cutT);
                    swordAngle = 3.52 + cutEase * 2.9;
                    armEndX = centerX - dir * (22.8 - cutEase * 42.2);
                    armEndY = pivotY - 12.6 + cutEase * 18.2;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.12));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                swordAngle = 2.12 + (swordAngle - 2.12) * prepEase;
                armEndX = centerX - dir * 7.2 + (armEndX - (centerX - dir * 7.2)) * prepEase;
                armEndY = pivotY + 9.6 + (armEndY - (pivotY + 9.6)) * prepEase;
                break;
            }
            case 1: {
                const idleAngle = isCrouching ? -0.32 : -0.65;
                const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
                const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0);

                const wind = Math.max(0, Math.min(1, progress / 0.34));
                const swing = Math.max(0, Math.min(1, (progress - 0.34) / 0.48)); // 0.82で振り抜き完了
                const swingEase = swing * swing * (3 - 2 * swing);
                
                // 始点はアイドル位置(構え)にする
                swordAngle = idleAngle + wind * (0.22 + 0.78 - idleAngle) + swingEase * 1.92;
                armEndX = idleHandX + wind * (15 - (idleHandX - centerX) / dir - 6.6) * dir - swingEase * 27.5 * dir;
                armEndY = idleHandY + wind * (8.0 - (idleHandY - pivotY) - 4.8) + swingEase * 8.6;
                // ※ armEndX/Y の計算を整理
                const baseArmX = centerX + dir * 15;
                const baseArmY = pivotY + 8.0;
                swordAngle = idleAngle + wind * (1.0 - idleAngle) + swingEase * 1.92;
                armEndX = idleHandX + wind * (baseArmX - idleHandX) - swingEase * 27.5 * dir;
                armEndY = idleHandY + wind * (baseArmY - idleHandY) + swingEase * 8.6;

                activeLeftShoulderX -= dir * (0.6 * wind + swingEase * 2.0);
                activeLeftShoulderY += (0.2 * wind + swingEase * 1.1);
                activeRightShoulderX -= dir * (0.2 * wind + swingEase * 1.2);
                activeRightShoulderY += (0.2 * wind + swingEase * 1.0);
                break;
            }
            case 3: {
                swordAngle = -0.22 + Math.sin(progress * Math.PI) * 0.34;
                armEndX = centerX + dir * (-10 + easeInOut * 36);
                armEndY = pivotY + 9.0 - Math.sin(progress * Math.PI) * 3.1;
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const idleAngle = isCrouching ? -0.32 : -0.65;
                const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
                const idleHandY = pivotY + (isCrouching ? 11.2 : 16.8);
                swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                break;
            }
            case 4: {
                if (progress < 0.42) {
                    const t = progress / 0.42;
                    const rise = t * t * (3 - 2 * t);
                    swordAngle = -0.22 + (-0.74 + 0.22) * rise;
                    armEndX = centerX + dir * (26 + (8.0 - 26) * rise);
                    armEndY = pivotY + 5 + (-24.0 - 5) * rise;
                } else {
                    const flipT = Math.max(0, Math.min(1, (progress - 0.42) / 0.58));
                    const bodyFlipAngle = -Math.PI * 1.82 * flipT;
                    const flipAngle = -0.76 + bodyFlipAngle;
                    const flipX = centerX - dir * (4.0 + Math.sin(flipT * Math.PI) * 6.0);
                    const flipY = pivotY - 14 + Math.cos(flipT * Math.PI) * 4.0;
                    const bridgeT = Math.max(0, Math.min(1, (progress - 0.42) / 0.12));
                    const bridge = bridgeT * bridgeT * (3 - 2 * bridgeT);
                    const riseAngleEnd = -0.74;
                    const riseEndX = centerX + dir * 8.0;
                    const riseEndY = pivotY - 24.0;
                    swordAngle = riseAngleEnd + (flipAngle - riseAngleEnd) * bridge;
                    armEndX = riseEndX + (flipX - riseEndX) * bridge;
                    armEndY = riseEndY + (flipY - riseEndY) * bridge;

                    const shoulderT = Math.max(0, Math.min(1, (progress - 0.5) / 0.5));
                    const shoulderEase = shoulderT * shoulderT * (3 - 2 * shoulderT);
                    activeLeftShoulderX -= dir * (0.4 + shoulderEase * 1.6);
                    activeLeftShoulderY += 0.2 + shoulderEase * 1.8;
                    activeRightShoulderX -= dir * (0.3 + shoulderEase * 1.35);
                    activeRightShoulderY += 0.2 + shoulderEase * 1.55;
                    if (progress > 0.48) {
                        allowSupportFrontHand = false;
                    }
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevAngle = -0.22;
                const prevHandX = centerX + dir * 26;
                const prevHandY = pivotY + 5;
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            case 5: {
                if (progress < 0.26) {
                    const t = progress / 0.26;
                    swordAngle = -2.52 + t * 0.24;
                    armEndX = centerX - dir * (15.6 - t * 5.8);
                    armEndY = pivotY - 22.8 - t * 2.8;
                } else if (progress < 0.78) {
                    const t = (progress - 0.26) / 0.52;
                    const fallEase = t * t * (3 - 2 * t);
                    swordAngle = 0.1 + fallEase * 0.08;
                    armEndX = centerX + dir * (15.6 + fallEase * 1.8);
                    armEndY = pivotY + 12.8 + fallEase * 1.4;
                } else {
                    const t = (progress - 0.78) / 0.22;
                    const settle = t * t * (3 - 2 * t);
                    swordAngle = 0.18 - settle * 0.04;
                    armEndX = centerX + dir * (17.4 - settle * 0.8);
                    armEndY = pivotY + 14.2 - settle * 0.8;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevAngle = -2.7;
                const prevHandX = centerX - dir * 4.0;
                const prevHandY = pivotY - 18.0;
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            default:
                return null;
        }

        // リカバリー補間（アイドル戻り）を全段共通で適用
        if (recoveryBlend > 0) {
            const recover = recoveryBlend * recoveryBlend * (3 - 2 * recoveryBlend);
            const idleAngle = isCrouching ? -0.32 : -0.65;
            const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
            const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0);
            
            // 最短経路で角度を補間するための正規化
            let angleDiff = idleAngle - swordAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            swordAngle += angleDiff * recover;
            armEndX += (idleHandX - armEndX) * recover;
            armEndY += (idleHandY - armEndY) * recover;
            activeLeftShoulderX += (leftShoulderXBase - activeLeftShoulderX) * recover;
            activeLeftShoulderY += (leftShoulderYBase - activeLeftShoulderY) * recover;
            activeRightShoulderX += (rightShoulderXBase - activeRightShoulderX) * recover;
            activeRightShoulderY += (rightShoulderYBase - activeRightShoulderY) * recover;
            supportGripBackDist += (6.2 - supportGripBackDist) * recover;
            supportGripSideOffset += (1.0 - supportGripSideOffset) * recover;
            supportGripMaxReach += (22.0 - supportGripMaxReach) * recover;
        }

        let trailTipExtend = 0;
        let trailCenterX = centerX;
        let trailCenterY = centerY;
        let trailRadius = null;
        let trailArcCenterX = null;
        let trailArcCenterY = null;
        let trailArcStartAngle = null;
        let trailArcSpan = null;
        let trailCurveStartX = null;
        let trailCurveStartY = null;
        let trailCurveControlX = null;
        let trailCurveControlY = null;
        let trailCurveEndX = null;
        let trailCurveEndY = null;
        if (attack.comboStep === 1 || attack.comboStep === 2 || attack.comboStep === 4) {
            trailArcCenterX = Number.isFinite(attack.trailArcCenterX) ? attack.trailArcCenterX : null;
            trailArcCenterY = Number.isFinite(attack.trailArcCenterY) ? attack.trailArcCenterY : null;
            trailArcStartAngle = Number.isFinite(attack.trailArcStartAngle) ? attack.trailArcStartAngle : null;
            trailArcSpan = Number.isFinite(attack.trailArcSpan) ? attack.trailArcSpan : null;
            trailCurveStartX = Number.isFinite(attack.trailCurveStartX) ? attack.trailCurveStartX : null;
            trailCurveStartY = Number.isFinite(attack.trailCurveStartY) ? attack.trailCurveStartY : null;
            trailCurveControlX = Number.isFinite(attack.trailCurveControlX) ? attack.trailCurveControlX : null;
            trailCurveControlY = Number.isFinite(attack.trailCurveControlY) ? attack.trailCurveControlY : null;
            trailCurveEndX = Number.isFinite(attack.trailCurveEndX) ? attack.trailCurveEndX : null;
            trailCurveEndY = Number.isFinite(attack.trailCurveEndY) ? attack.trailCurveEndY : null;
            if (trailArcCenterX !== null && trailArcCenterY !== null) {
                trailCenterX = trailArcCenterX;
                trailCenterY = trailArcCenterY;
            }
            if (Number.isFinite(attack.trailArcRadius)) {
                trailRadius = attack.trailArcRadius;
            }
            if (attack.comboStep === 4) {
                const earlyLiftT = Math.max(0, Math.min(1, 1 - progress / 0.38));
                armEndY -= 2.2 + earlyLiftT * 8.4;
            }
        } else if (attack.comboStep === 5) {
            trailCurveStartX = Number.isFinite(attack.trailCurveStartX) ? attack.trailCurveStartX : null;
            trailCurveStartY = Number.isFinite(attack.trailCurveStartY) ? attack.trailCurveStartY : null;
            trailCurveControlX = Number.isFinite(attack.trailCurveControlX) ? attack.trailCurveControlX : null;
            trailCurveControlY = Number.isFinite(attack.trailCurveControlY) ? attack.trailCurveControlY : null;
            trailCurveEndX = Number.isFinite(attack.trailCurveEndX) ? attack.trailCurveEndX : null;
            trailCurveEndY = Number.isFinite(attack.trailCurveEndY) ? attack.trailCurveEndY : null;
            trailTipExtend = 0;
        }

        const bladeLen = this.getKatanaBladeLength();
        const bladeDirX = Math.cos(swordAngle) * dir;
        const bladeDirY = Math.sin(swordAngle);
        return {
            attack,
            comboStep: attack.comboStep,
            dir,
            centerX,
            centerY,
            pivotY,
            progress,
            rawProgress,
            swordAngle,
            armEndX,
            armEndY,
            activeLeftShoulderX,
            activeLeftShoulderY,
            activeRightShoulderX,
            activeRightShoulderY,
            supportGripBackDist,
            supportGripSideOffset,
            supportGripMaxReach,
            allowSupportFrontHand,
            bladeLen,
            tipX: armEndX + bladeDirX * bladeLen,
            tipY: armEndY + bladeDirY * bladeLen,
            trailTipX: armEndX + bladeDirX * (bladeLen + trailTipExtend),
            trailTipY: armEndY + bladeDirY * (bladeLen + trailTipExtend),
            trailArcCenterX,
            trailArcCenterY,
            trailArcStartAngle,
            trailArcSpan,
            trailCurveStartX,
            trailCurveStartY,
            trailCurveControlX,
            trailCurveControlY,
            trailCurveEndX,
            trailCurveEndY,
            trailRadius,
            trailCenterX,
            trailCenterY
        };
    }

    getComboSwordPoseForTrailState(state) {
        const swordPose = this.getComboSwordPoseState(state);
        if (!swordPose) return null;
        const trailWindow = this.getComboTrailProgressWindow(swordPose.comboStep);
        if (swordPose.progress < trailWindow.start || swordPose.progress > trailWindow.end) return null;
        return {
            comboStep: swordPose.comboStep,
            tipX: swordPose.trailTipX,
            tipY: swordPose.trailTipY,
            dir: swordPose.dir,
            progress: swordPose.progress,
            trailArcCenterX: swordPose.trailArcCenterX,
            trailArcCenterY: swordPose.trailArcCenterY,
            trailArcStartAngle: swordPose.trailArcStartAngle,
            trailArcSpan: swordPose.trailArcSpan,
            trailCurveStartX: swordPose.trailCurveStartX,
            trailCurveStartY: swordPose.trailCurveStartY,
            trailCurveControlX: swordPose.trailCurveControlX,
            trailCurveControlY: swordPose.trailCurveControlY,
            trailCurveEndX: swordPose.trailCurveEndX,
            trailCurveEndY: swordPose.trailCurveEndY,
            trailRadius: swordPose.trailRadius,
            centerX: Number.isFinite(swordPose.trailCenterX) ? swordPose.trailCenterX : swordPose.centerX,
            centerY: Number.isFinite(swordPose.trailCenterY) ? swordPose.trailCenterY : swordPose.centerY
        };
    }

    updateComboSlashTrail(deltaMs) {
        const pose = this.getComboSwordPoseForTrail();
        const comboStep = this.currentAttack ? (this.currentAttack.comboStep || 0) : 0;
        
        // 凍結ベジェ曲線のフェード管理（メインバッファとは完全に独立）
        if (Array.isArray(this.comboSlashTrailFrozenCurves)) {
            for (let i = this.comboSlashTrailFrozenCurves.length - 1; i >= 0; i--) {
                const fc = this.comboSlashTrailFrozenCurves[i];
                fc.age = (fc.age || 0) + deltaMs;
                if (fc.age > fc.life) {
                    this.comboSlashTrailFrozenCurves.splice(i, 1);
                }
            }
        }
        
        // 攻撃終了後にバッファを強制クリアするロジックを排除。
        // 代わりに updateSlashTrailBuffer 内で寿命(age/life)に基づいて自然にフェードアウトさせる。
        
        // コンボモーション中またはリカバリー（戻りアニメーション）中は holdExisting を有効にする
        const holdExisting = !!(
            this.comboStep5IdleTransitionTimer > 0 || 
            this.comboStep1IdleTransitionTimer > 0 ||
            this.shouldKeepComboTrailDuringReturn(comboStep)
        );
        const sampleTrailScale = this.getXAttackTrailWidthScale();
        this.comboSlashTrailSampleTimer = this.updateSlashTrailBuffer(
            this.comboSlashTrailPoints,
            this.comboSlashTrailSampleTimer,
            pose,
            deltaMs,
            { holdExisting, sampleTrailScale }
        );
    }

    updateSlashTrailBuffer(points, sampleTimer, pose, deltaMs, options = {}) {
        if (!Array.isArray(points)) return 0;
        const holdExisting = !!options.holdExisting;
        const sampleTrailScale = Number.isFinite(options.sampleTrailScale) ? options.sampleTrailScale : 1;
        const currentStep = pose ? (pose.comboStep || 0) : -1;
        
        // 核心ルール: lifeは生成時に一度だけ設定。以降はageのみが進む。
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (pose && p.step === currentStep) {
                // 現在進行中の段のみ鮮度を保つ（age=0リセット）
                p.age = 0;
                // lifeは生成時の値を維持（上書きしない）
            } else if (holdExisting) {
                // 戻りモーション中はやや緩やかにフェード
                p.age = (p.age || 0) + deltaMs * 0.5;
                // lifeは上書きしない
            } else {
                // 過去段または完全終了後：実時間で老化
                p.age = (p.age || 0) + deltaMs;
                // lifeは上書きしない
            }
        }

        let nextSampleTimer = Math.max(0, (sampleTimer || 0) - deltaMs);

        if (pose) {
            const now = { x: pose.tipX, y: pose.tipY };
            const jumpCutDist = 140;
            let last = points.length > 0 ? points[points.length - 1] : null;
            let dist = last ? Math.hypot(now.x - last.x, now.y - last.y) : Infinity;
            // 段数が変わった場合は距離が離れていても全クリアしない。
            // 新しい段の最初のポイントとして追加するだけで、過去の段のデータは保持する。
            if (last && dist > jumpCutDist && last.step === (pose.comboStep || 0)) {
                // 同一段内でのテレポートのみクリア（通常はあり得ない）
                points.length = 0;
                last = null;
                dist = Infinity;
            } else if (last && dist > jumpCutDist) {
                // 段が変わった場合：過去のデータを保持したまま、lastをnullにして新しいポイントを追加
                last = null;
                dist = Infinity;
            }
            if (!last || points.length < 2 || dist >= 2.6 || nextSampleTimer <= 0) {
                points.push({
                    x: now.x,
                    y: now.y,
                    dir: Number.isFinite(pose.dir) ? pose.dir : undefined,
                    progress: Number.isFinite(pose.progress) ? pose.progress : undefined,
                    trailArcCenterX: Number.isFinite(pose.trailArcCenterX) ? pose.trailArcCenterX : undefined,
                    trailArcCenterY: Number.isFinite(pose.trailArcCenterY) ? pose.trailArcCenterY : undefined,
                    trailArcStartAngle: Number.isFinite(pose.trailArcStartAngle) ? pose.trailArcStartAngle : undefined,
                    trailArcSpan: Number.isFinite(pose.trailArcSpan) ? pose.trailArcSpan : undefined,
                    trailCurveStartX: Number.isFinite(pose.trailCurveStartX) ? pose.trailCurveStartX : undefined,
                    trailCurveStartY: Number.isFinite(pose.trailCurveStartY) ? pose.trailCurveStartY : undefined,
                    trailCurveControlX: Number.isFinite(pose.trailCurveControlX) ? pose.trailCurveControlX : undefined,
                    trailCurveControlY: Number.isFinite(pose.trailCurveControlY) ? pose.trailCurveControlY : undefined,
                    trailCurveEndX: Number.isFinite(pose.trailCurveEndX) ? pose.trailCurveEndX : undefined,
                    trailCurveEndY: Number.isFinite(pose.trailCurveEndY) ? pose.trailCurveEndY : undefined,
                    trailRadius: Number.isFinite(pose.trailRadius) ? pose.trailRadius : undefined,
                    centerX: Number.isFinite(pose.centerX) ? pose.centerX : undefined,
                    centerY: Number.isFinite(pose.centerY) ? pose.centerY : undefined,
                    step: pose.comboStep || 0,
                    trailScale: sampleTrailScale,
                    age: 0,
                    life: this.comboSlashTrailActiveLifeMs,
                    seed: Math.random() * Math.PI * 2
                });
                nextSampleTimer = this.comboSlashTrailSampleIntervalMs;
            } else {
                last.x = now.x;
                last.y = now.y;
                last.dir = Number.isFinite(pose.dir) ? pose.dir : last.dir;
                last.progress = Number.isFinite(pose.progress) ? pose.progress : last.progress;
                last.trailArcCenterX = Number.isFinite(pose.trailArcCenterX) ? pose.trailArcCenterX : last.trailArcCenterX;
                last.trailArcCenterY = Number.isFinite(pose.trailArcCenterY) ? pose.trailArcCenterY : last.trailArcCenterY;
                last.trailArcStartAngle = Number.isFinite(pose.trailArcStartAngle) ? pose.trailArcStartAngle : last.trailArcStartAngle;
                last.trailArcSpan = Number.isFinite(pose.trailArcSpan) ? pose.trailArcSpan : last.trailArcSpan;
                last.trailCurveStartX = Number.isFinite(pose.trailCurveStartX) ? pose.trailCurveStartX : last.trailCurveStartX;
                last.trailCurveStartY = Number.isFinite(pose.trailCurveStartY) ? pose.trailCurveStartY : last.trailCurveStartY;
                last.trailCurveControlX = Number.isFinite(pose.trailCurveControlX) ? pose.trailCurveControlX : last.trailCurveControlX;
                last.trailCurveControlY = Number.isFinite(pose.trailCurveControlY) ? pose.trailCurveControlY : last.trailCurveControlY;
                last.trailCurveEndX = Number.isFinite(pose.trailCurveEndX) ? pose.trailCurveEndX : last.trailCurveEndX;
                last.trailCurveEndY = Number.isFinite(pose.trailCurveEndY) ? pose.trailCurveEndY : last.trailCurveEndY;
                last.trailRadius = Number.isFinite(pose.trailRadius) ? pose.trailRadius : last.trailRadius;
                last.centerX = Number.isFinite(pose.centerX) ? pose.centerX : last.centerX;
                last.centerY = Number.isFinite(pose.centerY) ? pose.centerY : last.centerY;
                last.step = pose.comboStep || 0;
                last.trailScale = sampleTrailScale;
                last.age = Math.max(0, last.age - deltaMs * 0.7);
            }
        }

        // 削除判定：lifeは上書きしない。生成時のlifeとageの比較だけで判定する。
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            const lifeLimit = Math.max(1, p.life || this.comboSlashTrailActiveLifeMs);
            if (p.age > lifeLimit) points.splice(i, 1);
        }
        if (points.length > 180) {
            points.splice(0, points.length - 180);
        }

        return nextSampleTimer;
    }

    updateSpecialCloneSlashTrails(deltaMs) {
        const count = this.specialCloneSlots ? this.specialCloneSlots.length : 0;
        if (count <= 0) return;
        const dualBlade = (
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            typeof this.currentSubWeapon.getMainSwingPose === 'function'
        ) ? this.currentSubWeapon : null;
        if (!Array.isArray(this.specialCloneSlashTrailPoints)) {
            this.specialCloneSlashTrailPoints = [];
        }
        if (!Array.isArray(this.specialCloneSlashTrailSampleTimers)) {
            this.specialCloneSlashTrailSampleTimers = [];
        }

        for (let i = 0; i < count; i++) {
            if (!Array.isArray(this.specialCloneSlashTrailPoints[i])) {
                this.specialCloneSlashTrailPoints[i] = [];
            }
            if (!Number.isFinite(this.specialCloneSlashTrailSampleTimers[i])) {
                this.specialCloneSlashTrailSampleTimers[i] = 0;
            }

            const pos = this.specialClonePositions[i];
            const isAlive = this.specialCloneAlive && this.specialCloneAlive[i];
            let pose = null;

            if (isAlive && pos) {
                const isAutoAi = !!this.specialCloneAutoAiEnabled;
                const cloneDrawY = this.getSpecialCloneDrawY(pos.y);
                const dualTimer = isAutoAi
                    ? (this.specialCloneSubWeaponTimers[i] || 0)
                    : this.subWeaponTimer;
                const dualActionActive = !!(
                    dualBlade &&
                    dualTimer > 0 &&
                    (
                        isAutoAi
                            ? (this.specialCloneSubWeaponActions[i] === '二刀_Z')
                            : (this.subWeaponAction === '二刀_Z')
                    )
                );
                if (dualActionActive) {
                    // 二刀流分身は本体と同じDualBlades側の剣筋を使うため、ここでは軌跡点を生成しない
                    this.specialCloneSlashTrailSampleTimers[i] = this.updateSlashTrailBuffer(
                        this.specialCloneSlashTrailPoints[i],
                        this.specialCloneSlashTrailSampleTimers[i],
                        null,
                        deltaMs,
                        { holdExisting: false }
                    );
                    continue;
                } else {
                    const isAttacking = isAutoAi
                        ? ((this.specialCloneAttackTimers[i] || 0) > 0)
                        : !!this.isAttacking;
                    if (!isAttacking) {
                        const lastStep = this.specialCloneSlashTrailPoints[i][this.specialCloneSlashTrailPoints[i].length - 1]?.step || 0;
                        if (lastStep > 0 && !this.shouldKeepComboTrailDuringReturn(lastStep)) {
                            this.specialCloneSlashTrailPoints[i].length = 0;
                            this.specialCloneSlashTrailSampleTimers[i] = 0;
                            if (Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                                this.specialCloneSlashTrailBoostAnchors[i] = null;
                            }
                            continue;
                        }
                        this.specialCloneSlashTrailSampleTimers[i] = this.updateSlashTrailBuffer(
                            this.specialCloneSlashTrailPoints[i],
                            this.specialCloneSlashTrailSampleTimers[i],
                            null,
                            deltaMs,
                            { holdExisting: false }
                        );
                        continue;
                    }
                    const comboStep = isAutoAi
                        ? ((this.specialCloneComboSteps[i] || 0) % COMBO_ATTACKS.length) + 1
                        : (this.currentAttack ? this.currentAttack.comboStep || 1 : 1);
                    const attackProfile = isAutoAi
                        ? this.getComboAttackProfileByStep(comboStep)
                        : this.currentAttack;
                    const attackTimer = isAutoAi
                        ? (this.specialCloneAttackTimers[i] || 0)
                        : this.attackTimer;
                    pose = this.getComboSwordPoseForTrail({
                        isAttacking: true,
                        currentAttack: attackProfile,
                        attackTimer,
                        facingRight: pos.facingRight,
                        x: pos.x - this.width * 0.5,
                        y: cloneDrawY,
                        isCrouching: false
                    });
                    if (!pose && comboStep > 0 && !this.shouldKeepComboTrailDuringReturn(comboStep)) {
                        this.specialCloneSlashTrailPoints[i].length = 0;
                        this.specialCloneSlashTrailSampleTimers[i] = 0;
                        if (Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                            this.specialCloneSlashTrailBoostAnchors[i] = null;
                        }
                        continue;
                    }
                }
            }

            this.specialCloneSlashTrailSampleTimers[i] = this.updateSlashTrailBuffer(
                this.specialCloneSlashTrailPoints[i],
                this.specialCloneSlashTrailSampleTimers[i],
                pose,
                deltaMs,
                { holdExisting: !!(isAlive && pos && !pose) }
            );
            if (Array.isArray(this.specialCloneSlashTrailBoostAnchors) && this.specialCloneSlashTrailPoints[i].length < 2) {
                this.specialCloneSlashTrailBoostAnchors[i] = null;
            }
            if (this.specialCloneSlashTrailPoints[i].length > 96) {
                this.specialCloneSlashTrailPoints[i].splice(0, this.specialCloneSlashTrailPoints[i].length - 96);
            }
        }
    }

    renderComboSlashTrail(ctx, options = {}) {
        const renderOptions = options;
        const usesExternalPoints = Array.isArray(options.points);
        const points = usesExternalPoints ? options.points : this.comboSlashTrailPoints;
        const getBoostAnchor = typeof options.getBoostAnchor === 'function'
            ? options.getBoostAnchor
            : (() => this.comboSlashTrailBoostAnchor);
        const setBoostAnchor = typeof options.setBoostAnchor === 'function'
            ? options.setBoostAnchor
            : ((value) => { this.comboSlashTrailBoostAnchor = value; });
        const sourceIsAttacking = options.isAttacking !== undefined
            ? !!options.isAttacking
            : this.isAttacking;
        const initialStep = Array.isArray(points) && points.length > 0
            ? (points[points.length - 1]?.step || points[0]?.step || 0)
            : 0;
        
        // ベジェ曲線/弧を使っている段（1, 2, 4, 5）は1つのポイントに全データが入っているため、points.length < 2 でも描画可能
        const isSelfContainedStep = [1, 2, 4, 5].includes(initialStep);
        if (!points || points.length < 1 || (points.length < 2 && !isSelfContainedStep)) {
            setBoostAnchor(null);
            return;
        }
        const storedTrailScale = points.reduce((max, p) => {
            const s = (p && Number.isFinite(p.trailScale)) ? p.trailScale : 1;
            return Math.max(max, s);
        }, 1);
        const liveTrailScale = this.getXAttackTrailWidthScale();
        const trailWidthScale = Number.isFinite(options.trailWidthScale)
            ? options.trailWidthScale
            : Math.max(liveTrailScale, storedTrailScale);
        const normalWidthScale = 1.0;
        const boostAnchor = getBoostAnchor();
        const hasStoredBoostTrail = trailWidthScale > 1.01;
        const boostActive = options.boostActive !== undefined
            ? !!options.boostActive
            : (hasStoredBoostTrail && (sourceIsAttacking || !!boostAnchor));
        const visualWidthScale = (!boostActive && trailWidthScale > 1.01)
            ? trailWidthScale
            : normalWidthScale;
        if (!boostActive) {
            setBoostAnchor(null);
        }
        let trailCenterX = Number.isFinite(options.centerX)
            ? options.centerX
            : (this.x + this.width * 0.5);
        let trailCenterY = Number.isFinite(options.centerY)
            ? options.centerY
            : (this.y + this.height * 0.5);
        const clamp01 = (v) => Math.max(0, Math.min(1, v));
        const colorRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp01(alpha)})`;

        // 整理・削減処理を行う前に、まず「物理的」に段数でストリップを分割する
        // これを後で行うと、異なる段数の点が混ぜられて計算（ageやstep）が破壊される
        const rawStrips = [];
        if (points.length > 0) {
            let currentStrip = [points[0]];
            rawStrips.push(currentStrip);
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
                // 物理的な断絶（段数違い、またはテレポート距離）があれば別のストリップへ
                if (curr.step !== prev.step || dist > 140) {
                    currentStrip = [curr];
                    rawStrips.push(currentStrip);
                } else {
                    currentStrip.push(curr);
                }
            }
        }

        // 分割された各ストリップ内で、個別に削減処理を行う
        const strips = [];
        for (const rawStrip of rawStrips) {
            // 1. 近すぎる点の統合（パス平滑化）
            const simplified = [];
            const minGap = 4.0;
            for (let i = 0; i < rawStrip.length; i++) {
                const src = rawStrip[i];
                if (simplified.length === 0) {
                    simplified.push({ ...src });
                    continue;
                }
                const last = simplified[simplified.length - 1];
                const dist = Math.hypot(src.x - last.x, src.y - last.y);
                if (dist >= minGap) {
                    simplified.push({ ...src });
                } else {
                    // 最新位置へ同期しつつ最新のタイマーを保持
                    Object.assign(last, src);
                }
            }

            if (simplified.length < 1) continue;
            
            // 2. ノード数の自動制限（描画負荷軽減）
            let pathPoints = simplified;
            const maxNodes = 42;
            if (pathPoints.length > maxNodes) {
                const reduced = [];
                for (let i = 0; i < maxNodes; i++) {
                    const t = i / (maxNodes - 1);
                    const idx = t * (pathPoints.length - 1);
                    const i0 = Math.floor(idx);
                    const i1 = Math.min(pathPoints.length - 1, i0 + 1);
                    const k = idx - i0;
                    reduced.push({
                        ...pathPoints[i0],
                        x: pathPoints[i0].x + (pathPoints[i1].x - pathPoints[i0].x) * k,
                        y: pathPoints[i0].y + (pathPoints[i1].y - pathPoints[i0].y) * k,
                        progress: pathPoints[i0].progress + ((pathPoints[i1].progress || 0) - (pathPoints[i0].progress || 0)) * k,
                        age: pathPoints[i0].age + ((pathPoints[i1].age || 0) - (pathPoints[i0].age || 0)) * k,
                        life: pathPoints[i0].life + ((pathPoints[i1].life || 0) - (pathPoints[i0].life || 0)) * k
                    });
                }
                pathPoints = reduced;
            }
            strips.push(pathPoints);
        }

        const resolveHitboxCenter = (boxes) => {
            if (!boxes) return null;
            const arr = Array.isArray(boxes) ? boxes : [boxes];
            // 先頭の剣本体ボックスを優先し、補助判定(密着/前方/衝撃)で中心がズレるのを防ぐ
            const primary = arr.find((b) =>
                b && Number.isFinite(b.x) && Number.isFinite(b.y) &&
                Number.isFinite(b.width) && Number.isFinite(b.height)
            );
            if (primary) {
                return {
                    x: primary.x + primary.width * 0.5,
                    y: primary.y + primary.height * 0.5
                };
            }
            let sumX = 0;
            let sumY = 0;
            let sumW = 0;
            for (let i = 0; i < arr.length; i++) {
                const b = arr[i];
                if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.width) || !Number.isFinite(b.height)) continue;
                const area = Math.max(1, b.width * b.height);
                sumX += (b.x + b.width * 0.5) * area;
                sumY += (b.y + b.height * 0.5) * area;
                sumW += area;
            }
            if (sumW <= 0) return null;
            return { x: sumX / sumW, y: sumY / sumW };
        };

        // 以前のパス単純化（simplified / reduced）および分割処理は冒頭に集約したため削除
        // ここでは、冒頭で生成した strips 配列をそのまま描画フェーズに渡す
        
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 0;

        const outerOldestAlpha = 0.1;
        const outerNewestAlpha = 0.82;
        const bluePalette = { front: [130, 234, 255], back: [76, 154, 226] };

        const buildProjected = (pts, projectFn = null) => {
            if (!projectFn) return pts;
            const mapped = [];
            for (let i = 0; i < pts.length; i++) {
                const src = pts[i];
                const p = projectFn(src);
                mapped.push({
                    x: p.x,
                    y: p.y,
                    age: src.age,
                    life: src.life
                });
            }
            return mapped;
        };

        const normalizeAngleDelta = (current, previous) => {
            let delta = current - previous;
            const full = Math.PI * 2;
            while (delta > Math.PI) delta -= full;
            while (delta < -Math.PI) delta += full;
            return delta;
        };
        const drawLinearPath = (pts) => {
            if (!pts || pts.length < 2) return false;
            let totalLen = 0;
            for (let i = 1; i < pts.length; i++) {
                totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            }
            if (totalLen < 7.5) return false;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            return true;
        };
        const drawGradientLinearTrail = (pts, width, rgb, oldestScale, newestScale, projectFn = null) => {
            const mapped = buildProjected(pts, projectFn);
            if (!mapped || mapped.length < 2) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const oldestLife = Math.max(1, oldestSrc.life || this.comboSlashTrailActiveLifeMs);
            const newestLife = Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs);
            const oldestFade = clamp01(1 - ((oldestSrc.age || 0) / oldestLife));
            const newestFade = clamp01(1 - ((newestSrc.age || 0) / newestLife));
            const oldestAlpha = oldestFade * oldestScale;
            const newestAlpha = newestFade * newestScale;
            if (newestAlpha <= 0.01) return;
            const start = mapped[0];
            const end = mapped[mapped.length - 1];
            const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            grad.addColorStop(0, colorRgba(rgb, oldestAlpha));
            grad.addColorStop(0.52, colorRgba(rgb, oldestAlpha + (newestAlpha - oldestAlpha) * 0.58));
            grad.addColorStop(1, colorRgba(rgb, newestAlpha));
            ctx.strokeStyle = grad;
            ctx.lineWidth = width;
            if (drawLinearPath(mapped)) ctx.stroke();
        };
        const buildStraightLinearStrip = (pts, projectFn = null) => {
            const mapped = buildProjected(pts, projectFn);
            if (!mapped || mapped.length < 2) return mapped;
            const start = mapped[0];
            const end = mapped[mapped.length - 1];
            const len = Math.hypot(end.x - start.x, end.y - start.y);
            if (len < 0.001) return mapped;
            return [
                {
                    x: start.x,
                    y: start.y,
                    age: pts[0].age || 0,
                    life: Math.max(1, pts[0].life || this.comboSlashTrailActiveLifeMs)
                },
                {
                    x: end.x,
                    y: end.y,
                    age: pts[pts.length - 1].age || 0,
                    life: Math.max(1, pts[pts.length - 1].life || this.comboSlashTrailActiveLifeMs)
                }
            ];
        };
        const drawDualBlueLinearTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            const includeGhost = false;
            if (!pts || pts.length < 2) return;
            const sourcePts = options.straighten ? buildStraightLinearStrip(pts, projectFn) : pts;
            if (!sourcePts || sourcePts.length < 2) return;
            const ghostCount = Math.max(2, Math.floor(sourcePts.length * 0.78));
            const ghostStrip = sourcePts.slice(0, ghostCount);
            if (includeGhost) {
                drawGradientLinearTrail(
                    ghostStrip,
                    baseWidth * 0.52,
                    bluePalette.back,
                    oldestScale * 0.42 * 0.7,
                    newestScale * 0.42 * 0.7,
                    projectFn
                );
            }
            drawGradientLinearTrail(
                sourcePts,
                baseWidth,
                bluePalette.front,
                oldestScale * 0.62,
                newestScale,
                null
            );
            drawGradientLinearTrail(
                sourcePts,
                Math.max(1.4, baseWidth * 0.18),
                [255, 255, 255],
                oldestScale * 0.2,
                newestScale * 0.46,
                null
            );
        };
        const drawDualBlueArcTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            const includeGhost = false;
            const mapped = buildProjected(pts, projectFn);
            if (!mapped || mapped.length < 2) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const oldestLife = Math.max(1, oldestSrc.life || this.comboSlashTrailActiveLifeMs);
            const newestLife = Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs);
            const oldestFade = clamp01(1 - ((oldestSrc.age || 0) / oldestLife));
            const newestFade = clamp01(1 - ((newestSrc.age || 0) / newestLife));
            const oldestAlpha = oldestFade * oldestScale;
            const newestAlpha = newestFade * newestScale;
            if (newestAlpha <= 0.01) return;

            const newest = mapped[mapped.length - 1];
            const prev = mapped[Math.max(0, mapped.length - 3)];
            const oldest = mapped[0];
            const newestRadius = Math.hypot(newest.x - trailCenterX, newest.y - trailCenterY);
            const oldestRadius = Math.hypot(oldest.x - trailCenterX, oldest.y - trailCenterY);
            const radius = Math.max(10, newestRadius * 0.84 + oldestRadius * 0.16);
            const currentAngle = Math.atan2(newest.y - trailCenterY, newest.x - trailCenterX);
            const prevAngle = Math.atan2(prev.y - trailCenterY, prev.x - trailCenterX);
            const oldestAngle = Math.atan2(oldest.y - trailCenterY, oldest.x - trailCenterX);
            const swingDelta = normalizeAngleDelta(currentAngle, prevAngle);
            const swingSpeed = Math.abs(swingDelta);
            const totalDelta = normalizeAngleDelta(currentAngle, oldestAngle);
            const totalSpan = Math.abs(totalDelta);
            // 角度変化が小さい間は剣筋を描かず、剣の始動と同時に弧が出るようにする
            if (swingSpeed < 0.006 && totalSpan < 0.085) return;
            const visibilityPhase = clamp01(totalSpan * 1.25 + swingSpeed * 10.2);
            // 進行方向は全体角度差で判定し、終端の微振動で反転しないようにする
            const movingForward = totalDelta >= 0;
            // 通過済み角度そのものを弧長に使い、一定長で途切れる見え方を防ぐ
            const traversedSpan = Math.max(0.001, totalSpan);
            // 上限が低すぎると前半軌跡が欠けるため、十分な長さを確保する
            const maxBackSpan = Math.PI * 1.95;
            const backSpan = Math.min(maxBackSpan, traversedSpan + 0.02);
            const leadSpan = Math.min(0.085, Math.max(0.01, swingSpeed * 1.7 + visibilityPhase * 0.012));
            const start = movingForward ? (currentAngle - backSpan) : (currentAngle - leadSpan);
            const end = movingForward ? (currentAngle + leadSpan) : (currentAngle + backSpan);
            const visibleSpan = Math.abs(normalizeAngleDelta(end, start));
            if (visibleSpan < 0.09) return;
            const ccw = end < start;
            const frontAlpha = Math.max(0.03, newestAlpha);
            const backAlpha = frontAlpha * 0.42;

            // 二刀流(青)に寄せた4層の円弧
            if (includeGhost) {
                const trailBackSpan = Math.min(backSpan * 1.55, traversedSpan + 0.04);
                const trailStart = movingForward
                    ? (currentAngle - trailBackSpan)
                    : (currentAngle + backSpan * 0.2);
                const trailEnd = movingForward
                    ? (currentAngle - backSpan * 0.34)
                    : (currentAngle + trailBackSpan);
                const ccwTrail = trailEnd < trailStart;
                ctx.strokeStyle = colorRgba(bluePalette.back, backAlpha * 0.7);
                ctx.lineWidth = baseWidth * 0.52;
                ctx.beginPath();
                ctx.arc(trailCenterX, trailCenterY, radius * 0.9, trailStart, trailEnd, ccwTrail);
                ctx.stroke();
            }

            ctx.strokeStyle = colorRgba(bluePalette.front, frontAlpha);
            ctx.lineWidth = baseWidth;
            ctx.beginPath();
            ctx.arc(trailCenterX, trailCenterY, radius, start, end, ccw);
            ctx.stroke();

            ctx.strokeStyle = colorRgba([255, 255, 255], frontAlpha * 0.46);
            ctx.lineWidth = Math.max(1.4, baseWidth * 0.18);
            ctx.beginPath();
            ctx.arc(trailCenterX, trailCenterY, Math.max(2, radius - 2.2), start + 0.03, end + 0.03, ccw);
            ctx.stroke();
        };
        const drawStep4AnchoredArcTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (!pts || pts.length < 1) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const activeStep4RawProgress = (() => {
                const attackState = renderOptions.attackState || {
                    isAttacking: sourceIsAttacking,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer
                };
                if (!sourceIsAttacking || !attackState || !attackState.currentAttack || attackState.currentAttack.comboStep !== 4) {
                    return null;
                }
                const duration = Math.max(1, attackState.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                if (Number.isFinite(attackState.currentAttack.motionElapsedMs)) {
                    return clamp01(attackState.currentAttack.motionElapsedMs / duration);
                }
                const timer = Number.isFinite(attackState.attackTimer) ? attackState.attackTimer : this.attackTimer;
                return clamp01(1 - (timer / duration));
            })();
            const smooth = (t) => {
                const v = clamp01(t);
                return v * v * (3 - 2 * v);
            };
            const startX = Number.isFinite(newestSrc.trailCurveStartX) ? newestSrc.trailCurveStartX : null;
            const startY = Number.isFinite(newestSrc.trailCurveStartY) ? newestSrc.trailCurveStartY : null;
            const controlX = Number.isFinite(newestSrc.trailCurveControlX) ? newestSrc.trailCurveControlX : null;
            const controlY = Number.isFinite(newestSrc.trailCurveControlY) ? newestSrc.trailCurveControlY : null;
            const endX = Number.isFinite(newestSrc.trailCurveEndX) ? newestSrc.trailCurveEndX : null;
            const endY = Number.isFinite(newestSrc.trailCurveEndY) ? newestSrc.trailCurveEndY : null;
            if ([startX, startY, controlX, controlY, endX, endY].some((v) => !Number.isFinite(v))) {
                return;
            }
            const holdCompletedShape = !sourceIsAttacking || (newestSrc.age || 0) > 0.001;
            const growth = (() => {
                if (holdCompletedShape) return 1;
                const p = Number.isFinite(activeStep4RawProgress)
                    ? activeStep4RawProgress
                    : (Number.isFinite(newestSrc.progress) ? newestSrc.progress : 0);
                if (p <= 0.08) return 0;
                if (p >= 0.42) return 1;
                return smooth((p - 0.08) / 0.34);
            })();
            if (growth <= 0.001) return;
            const stripCount = Math.max(14, Math.round(14 + growth * 18));
            const strip = [];
            for (let i = 0; i < stripCount; i++) {
                const t = (stripCount <= 1 ? 1 : (i / (stripCount - 1))) * growth;
                const oneMinusT = 1 - t;
                strip.push({
                    x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * controlX + t * t * endX,
                    y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * controlY + t * t * endY,
                    age: oldestSrc.age + (newestSrc.age - oldestSrc.age) * (stripCount <= 1 ? 1 : i / (stripCount - 1)),
                    life: Math.max(
                        1,
                        (oldestSrc.life || this.comboSlashTrailActiveLifeMs) +
                        ((newestSrc.life || this.comboSlashTrailActiveLifeMs) - (oldestSrc.life || this.comboSlashTrailActiveLifeMs)) *
                        (stripCount <= 1 ? 1 : i / (stripCount - 1))
                    )
                });
            }
            drawGradientLinearTrail(
                strip,
                baseWidth,
                bluePalette.front,
                oldestScale * 0.62,
                newestScale,
                projectFn
            );
            drawGradientLinearTrail(
                strip,
                Math.max(1.4, baseWidth * 0.18),
                [255, 255, 255],
                oldestScale * 0.2,
                newestScale * 0.46,
                projectFn
            );
        };
        const drawFixedBezierTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (!pts || pts.length < 1) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const comboStep = options.comboStep || newestSrc.step || 0;
            const attackRef = (() => {
                const attackState = renderOptions.attackState || null;
                if (attackState && attackState.currentAttack && attackState.currentAttack.comboStep === comboStep) {
                    return attackState.currentAttack;
                }
                if (sourceIsAttacking && this.currentAttack && this.currentAttack.comboStep === comboStep) {
                    return this.currentAttack;
                }
                return null;
            })();
            const isRelative = !!(
                (options.useRelativeIfAvailable && attackRef && attackRef.trailIsRelative) ||
                (options.useRelativeIfAvailable && newestSrc.trailCurveFrozen)
            );
            const offsetX = isRelative ? (options.offsetX || 0) : 0;
            const offsetY = isRelative ? (options.offsetY || 0) : 0;
            const startX = (Number.isFinite(newestSrc.trailCurveStartX) ? newestSrc.trailCurveStartX : 0) + offsetX;
            const startY = (Number.isFinite(newestSrc.trailCurveStartY) ? newestSrc.trailCurveStartY : 0) + offsetY;
            const controlX = (Number.isFinite(newestSrc.trailCurveControlX) ? newestSrc.trailCurveControlX : 0) + offsetX;
            const controlY = (Number.isFinite(newestSrc.trailCurveControlY) ? newestSrc.trailCurveControlY : 0) + offsetY;
            const endX = (Number.isFinite(newestSrc.trailCurveEndX) ? newestSrc.trailCurveEndX : 0) + offsetX;
            const endY = (Number.isFinite(newestSrc.trailCurveEndY) ? newestSrc.trailCurveEndY : 0) + offsetY;
            if ([startX, startY, controlX, controlY, endX, endY].some((v) => !Number.isFinite(v))) return;
            const activeProgress = (() => {
                const attackState = renderOptions.attackState || {
                    isAttacking: sourceIsAttacking,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer
                };
                if (!sourceIsAttacking || !attackState || !attackState.currentAttack || attackState.currentAttack.comboStep !== comboStep) {
                    return null;
                }
                const duration = Math.max(1, attackState.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                const rawProgress = Number.isFinite(attackState.currentAttack.motionElapsedMs)
                    ? clamp01(attackState.currentAttack.motionElapsedMs / duration)
                    : clamp01(1 - ((Number.isFinite(attackState.attackTimer) ? attackState.attackTimer : this.attackTimer) / duration));
                return this.getAttackMotionProgress(attackState.currentAttack, rawProgress);
            })();
            const trailWindow = this.getComboTrailProgressWindow(comboStep);
            const holdCompletedShape =
                (attackRef && attackRef.trailCurveFrozen === true) ||
                !sourceIsAttacking ||
                (newestSrc.age || 0) > 0.001;
            const growth = (() => {
                if (holdCompletedShape) return 1;
                const p = Number.isFinite(activeProgress)
                    ? activeProgress
                    : (Number.isFinite(newestSrc.progress) ? newestSrc.progress : 0);
                if (p <= trailWindow.start) return 0;
                if (p >= trailWindow.end) return 1;
                const span = Math.max(0.001, trailWindow.end - trailWindow.start);
                return clamp01((p - trailWindow.start) / span);
            })();
            if (growth <= 0.001) return;
            let drawEndX = endX;
            let drawEndY = endY;
            let drawControlX = controlX;
            let drawControlY = controlY;
            if (options.trimEnd) {
                const tangentX = drawEndX - drawControlX;
                const tangentY = drawEndY - drawControlY;
                const tangentLen = Math.hypot(tangentX, tangentY);
                if (tangentLen > 0.001) {
                    const trimFactor = Number.isFinite(options.trimFactor) ? options.trimFactor : 0.28;
                    const trim = Math.min(baseWidth * trimFactor, tangentLen * 0.24);
                    drawEndX -= (tangentX / tangentLen) * trim;
                    drawEndY -= (tangentY / tangentLen) * trim;
                }
            }
            const stripCount = Math.max(12, Math.round(12 + growth * 16));
            const mergedStrip = [];
            for (let i = 0; i < stripCount; i++) {
                const t = (stripCount <= 1 ? 1 : (i / (stripCount - 1))) * growth;
                const oneMinusT = 1 - t;
                mergedStrip.push({
                    x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * drawControlX + t * t * drawEndX,
                    y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * drawControlY + t * t * drawEndY,
                    age: oldestSrc.age + (newestSrc.age - oldestSrc.age) * (stripCount <= 1 ? 1 : i / (stripCount - 1)),
                    life: Math.max(
                        1,
                        (oldestSrc.life || this.comboSlashTrailActiveLifeMs) +
                        ((newestSrc.life || this.comboSlashTrailActiveLifeMs) - (oldestSrc.life || this.comboSlashTrailActiveLifeMs)) *
                        (stripCount <= 1 ? 1 : i / (stripCount - 1))
                    )
                });
            }
            drawGradientLinearTrail(
                mergedStrip,
                baseWidth,
                bluePalette.front,
                oldestScale * 0.62,
                newestScale,
                projectFn
            );
            drawGradientLinearTrail(
                mergedStrip,
                Math.max(1.4, baseWidth * 0.18),
                [255, 255, 255],
                oldestScale * 0.2,
                newestScale * 0.46,
                projectFn
            );
        };

        // 各ストリップ（段ごとの軌跡）を独立して描画
        for (const strip of strips) {
            const stripStep = strip[strip.length - 1]?.step || 0;
            if (strip.length < 1 || (strip.length < 2 && ![1, 2, 4, 5].includes(stripStep))) continue;

            // 凍結スナップショットが存在するstepは、凍結側で描画するのでメインバッファ側はスキップ
            if (Array.isArray(this.comboSlashTrailFrozenCurves) && this.comboSlashTrailFrozenCurves.some(fc => fc.step === stripStep)) continue;

            if (!boostActive) {
                // 通常時描画
                if (stripStep === 5) {
                    drawFixedBezierTrail(strip, 13.8 * visualWidthScale, outerOldestAlpha, outerNewestAlpha, null, { comboStep: 5, trimEnd: true, trimFactor: 0.24 });
                } else if (stripStep === 1 || stripStep === 2) {
                    drawFixedBezierTrail(strip, 13.8 * visualWidthScale, outerOldestAlpha, outerNewestAlpha, null, { 
                        comboStep: stripStep, useRelativeIfAvailable: true, offsetX: this.x, offsetY: this.y 
                    });
                } else if (stripStep === 4) {
                    drawStep4AnchoredArcTrail(strip, 13.8 * visualWidthScale, outerOldestAlpha, outerNewestAlpha);
                } else if (stripStep === 3) {
                    drawDualBlueLinearTrail(strip, 13.8 * visualWidthScale, outerOldestAlpha, outerNewestAlpha, null, { straighten: true });
                } else {
                    drawDualBlueArcTrail(strip, 13.8 * visualWidthScale, outerOldestAlpha, outerNewestAlpha);
                }
            } else {
                // ブースト時描画
                let baseCenterX = trailCenterX;
                let baseCenterY = trailCenterY;
                let projectedCenterX = trailCenterX;
                let projectedCenterY = trailCenterY;
                let currentBoostScale = Math.max(1.02, 1 + (trailWidthScale - 1) * 0.74);

                if (boostAnchor && (!sourceIsAttacking || (strip[strip.length - 1].age || 0) > 0.001)) {
                    baseCenterX = boostAnchor.baseCenterX;
                    baseCenterY = boostAnchor.baseCenterY;
                    projectedCenterX = boostAnchor.projectedCenterX;
                    projectedCenterY = boostAnchor.projectedCenterY;
                    currentBoostScale = boostAnchor.boostScale;
                } else {
                    const hitboxSource = options.attackHitboxes !== undefined
                        ? options.attackHitboxes
                        : (this.getAttackHitbox ? this.getAttackHitbox(options.attackState ? { state: options.attackState } : {}) : null);
                    const hitboxCenter = resolveHitboxCenter(hitboxSource);
                    if (hitboxCenter) {
                        projectedCenterX = hitboxCenter.x;
                        projectedCenterY = hitboxCenter.y;
                    }
                    setBoostAnchor({
                        baseCenterX, baseCenterY, projectedCenterX, projectedCenterY, boostScale: currentBoostScale
                    });
                }

                const projectOut = (p) => {
                    const vx = p.x - baseCenterX;
                    const vy = p.y - baseCenterY;
                    return {
                        x: projectedCenterX + vx * currentBoostScale,
                        y: projectedCenterY + vy * currentBoostScale
                    };
                };

                const boostOldest = outerOldestAlpha * 0.35;
                if (stripStep === 5) {
                    drawFixedBezierTrail(strip, 13.8 * trailWidthScale, boostOldest, outerNewestAlpha, projectOut, { comboStep: 5, trimEnd: true, trimFactor: 0.24 });
                } else if (stripStep === 1 || stripStep === 2) {
                    drawFixedBezierTrail(strip, 13.8 * trailWidthScale, boostOldest, outerNewestAlpha, projectOut, { comboStep: stripStep });
                } else if (stripStep === 4) {
                    drawStep4AnchoredArcTrail(strip, 13.8 * trailWidthScale, boostOldest, outerNewestAlpha, projectOut, { includeGhost: false });
                } else if (stripStep === 3) {
                    drawDualBlueLinearTrail(strip, 13.8 * trailWidthScale, boostOldest, outerNewestAlpha, projectOut, { includeGhost: false, straighten: true });
                } else {
                    drawDualBlueArcTrail(strip, 13.8 * trailWidthScale, boostOldest, outerNewestAlpha, projectOut, { includeGhost: false });
                }
            }
        }

        // 凍結スナップショットの独立描画（メインバッファとは完全に独立）
        if (Array.isArray(this.comboSlashTrailFrozenCurves) && !usesExternalPoints) {
            for (const fc of this.comboSlashTrailFrozenCurves) {
                const fadeAlpha = Math.max(0, 1 - ((fc.age || 0) / Math.max(1, fc.life)));
                if (fadeAlpha <= 0.01) continue;
                
                // fadeAlpha はスケールに掛けない（描画関数内部の age/life で線形フェード）
                const frozenOldest = outerOldestAlpha;
                const frozenNewest = outerNewestAlpha;
                
                if (fc.type === 'bezier' || !fc.type) {
                    // ベジェ曲線段 (1, 2, 5)
                    if (!Number.isFinite(fc.trailCurveStartX)) continue;
                    const frozenPt = {
                        x: 0, y: 0,
                        step: fc.step,
                        dir: fc.dir,
                        progress: 1.0,
                        trailCurveStartX: fc.trailCurveStartX,
                        trailCurveStartY: fc.trailCurveStartY,
                        trailCurveControlX: fc.trailCurveControlX,
                        trailCurveControlY: fc.trailCurveControlY,
                        trailCurveEndX: fc.trailCurveEndX,
                        trailCurveEndY: fc.trailCurveEndY,
                        trailRadius: fc.trailRadius,
                        centerX: fc.centerX,
                        centerY: fc.centerY,
                        age: fc.age,
                        life: fc.life,
                        trailCurveFrozen: true
                    };
                    const offsetX = fc.trailIsRelative ? fc.playerX : 0;
                    const offsetY = fc.trailIsRelative ? fc.playerY : 0;
                    drawFixedBezierTrail([frozenPt], 13.8 * visualWidthScale, frozenOldest, frozenNewest, null, {
                        comboStep: fc.step,
                        useRelativeIfAvailable: fc.trailIsRelative,
                        offsetX: offsetX,
                        offsetY: offsetY
                    });
                } else if (fc.type === 'points' && Array.isArray(fc.frozenPoints)) {
                    // リニア/アーク段 (3, 4): 凍結デルタ座標を現在の足元で復元して描画
                    const pts = fc.frozenPoints.map(p => ({
                        ...p,
                        age: fc.age,
                        life: fc.life
                    }));
                    if (pts.length < 2) continue;
                    
                    if (fc.step === 4) {
                        drawStep4AnchoredArcTrail(pts, 13.8 * visualWidthScale, frozenOldest, frozenNewest);
                    } else if (fc.step === 3) {
                        drawDualBlueLinearTrail(pts, 13.8 * visualWidthScale, frozenOldest, frozenNewest, null, { straighten: true });
                    } else {
                        drawDualBlueArcTrail(pts, 13.8 * visualWidthScale, frozenOldest, frozenNewest);
                    }
                }
            }
        }

        // 大凪時の追加外周帯は通常コンボで二重線に見えやすいため廃止

        ctx.restore();
    }
    
    renderSpecial(ctx, options = {}) {
        const anchors = this.getSpecialCloneAnchors();
        const scaleEntity = typeof options.scaleEntity === 'function' ? options.scaleEntity : null;
        const renderScaled = (pivotX, pivotY, renderFn) => {
            if (scaleEntity) {
                scaleEntity(pivotX, pivotY, renderFn);
                return;
            }
            renderFn();
        };

        ctx.save();

        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                const cloneScarfNodes = this.specialCloneScarfNodes[anchor.index] || null;
                const cloneHairNodes = this.specialCloneHairNodes[anchor.index] || null;
                const cloneDrawY = this.getSpecialCloneDrawY(anchor.y);
                renderScaled(anchor.x, this.getSpecialCloneFootY(anchor.y), () => {
                    this.renderModel(
                        ctx,
                        anchor.x - this.width * 0.5,
                        cloneDrawY,
                        anchor.facingRight,
                        anchor.alpha,
                        false,
                        {
                            silhouetteMode: true,
                            ninNinPose: true,
                            isClone: true,
                            cloneIndex: anchor.index,
                            palette: { silhouette: '#1a1a1a', accent: '#00bfff' },
                            scarfNodes: cloneScarfNodes || undefined,
                            hairNodes: cloneHairNodes || undefined
                        }
                    );
                });
            }
        } else if (this.isSpecialCloneCombatActive()) {
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                const i = anchor.index;
                const pos = this.specialClonePositions[i];
                if (!pos) continue;

                const invincible = (this.specialCloneInvincibleTimers[i] || 0) > 0;
                const cloneAlpha = invincible && Math.floor(this.specialCloneInvincibleTimers[i] / 70) % 2 === 0
                    ? 0.7 : 1.0;

                // 本体の状態を退避（霧座標の計算に saved.y が必要なため先に定義）
                const saved = {
                    isAttacking: this.isAttacking,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer,
                    attackCombo: this.attackCombo,
                    subWeaponTimer: this.subWeaponTimer,
                    subWeaponAction: this.subWeaponAction,
                    facingRight: this.facingRight,
                    x: this.x,
                    y: this.y,
                    vx: this.vx,
                    vy: this.vy,
                    isGrounded: this.isGrounded,
                    isCrouching: this.isCrouching,
                    isDashing: this.isDashing,
                    motionTime: this.motionTime,
                    subWeaponPoseOverride: this.subWeaponPoseOverride,
                    height: this.height,
                    legPhase: this.legPhase,
                    legAngle: this.legAngle
                };

                const cloneDrawX = pos.x - this.width * 0.5;
                const cloneDrawY = this.getSpecialCloneDrawY(pos.y);

                // Lv0〜2は本体の攻撃状態に同期、Lv3は独自タイマー
                const cloneUsesDualZ = !!(
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name === '二刀流' &&
                    (
                        this.specialCloneAutoAiEnabled
                            ? (
                                this.specialCloneSubWeaponActions[i] === '二刀_Z' &&
                                (this.specialCloneSubWeaponTimers[i] || 0) > 0
                            )
                            : (this.subWeaponAction === '二刀_Z' && (this.subWeaponTimer || 0) > 0)
                    )
                );
                const isCloneAttacking = this.specialCloneAutoAiEnabled
                    ? ((this.specialCloneAttackTimers[i] > 0) && !cloneUsesDualZ)
                    : this.isAttacking;
                const cloneAttackTimer = this.specialCloneAutoAiEnabled
                    ? (this.specialCloneAttackTimers[i] || 0)
                    : this.attackTimer;
                const cloneComboStep = this.specialCloneAutoAiEnabled
                    ? ((this.specialCloneComboSteps[i] || 0) % COMBO_ATTACKS.length) + 1
                    : (this.currentAttack ? this.currentAttack.comboStep || 1 : 1);
                const cloneAttackProfile = this.specialCloneAutoAiEnabled
                    ? this.getComboAttackProfileByStep(cloneComboStep)
                    : null;

                // 分身の状態をセット
                this.x = cloneDrawX;
                this.y = cloneDrawY;
                this.height = PLAYER.HEIGHT;
                this.facingRight = pos.facingRight;
                this.motionTime = saved.motionTime;

                if (this.specialCloneAutoAiEnabled) {
                    const rawRenderVx = pos.renderVx || 0;
                    this.vx = Math.abs(rawRenderVx) >= Math.abs(saved.vx) ? rawRenderVx : saved.vx;
                    this.vy = pos.cloneVy || 0;
                    this.isGrounded = !(pos.jumping);
                    this.isCrouching = false;
                    this.isDashing = false;
                    this.legPhase = pos.legPhase || 0;
                    this.legAngle = pos.legAngle || 0;
                    this.subWeaponTimer = this.specialCloneSubWeaponTimers[i] || 0;
                    this.subWeaponAction = this.specialCloneSubWeaponActions[i] || null;
                    this.subWeaponPoseOverride = cloneUsesDualZ
                        ? {
                            comboIndex: this.specialCloneComboSteps[i] || 0,
                            attackTimer: this.specialCloneSubWeaponTimers[i] || 0
                        }
                        : null;
                } else {
                    this.vx = saved.vx;
                    this.vy = saved.vy;
                    this.isGrounded = saved.isGrounded;
                    this.isCrouching = saved.isCrouching;
                    this.isDashing = saved.isDashing;
                    this.subWeaponTimer = saved.subWeaponTimer;
                    this.subWeaponAction = saved.subWeaponAction;
                    this.subWeaponPoseOverride = null;
                }

                if (isCloneAttacking) {
                    this.isAttacking = true;
                    this.attackCombo = cloneComboStep;
                    if (this.specialCloneAutoAiEnabled) {
                        this.currentAttack = {
                            ...cloneAttackProfile,
                            comboStep: cloneComboStep
                        };
                    } else {
                        this.currentAttack = saved.currentAttack;
                    }
                    this.attackTimer = cloneAttackTimer;
                } else {
                    this.isAttacking = false;
                    this.currentAttack = null;
                    this.attackTimer = 0;
                }

                renderScaled(pos.x, this.getSpecialCloneFootY(pos.y), () => {
                    // 霧エフェクト（描画座標に追従・キャッシュCanvasを利用して軽量化）
                    const mistCenterY = cloneDrawY + PLAYER.HEIGHT * 0.45;
                    ctx.save();
                    ctx.globalAlpha = cloneAlpha * 0.4;
                    if (this.mistCacheCanvas) {
                        const size = this.mistCacheCanvas.width;
                        ctx.drawImage(this.mistCacheCanvas, pos.x - size / 2, mistCenterY - size / 2);
                    } else {
                        ctx.fillStyle = `rgba(180, 214, 246, 1.0)`;
                        ctx.beginPath();
                        ctx.arc(pos.x, mistCenterY, 34, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();

                    ctx.save();
                    ctx.globalAlpha = cloneAlpha;

                    const cloneTrailPoints = Array.isArray(this.specialCloneSlashTrailPoints)
                        ? this.specialCloneSlashTrailPoints[i]
                        : null;
                    if (cloneTrailPoints && cloneTrailPoints.length > 1) {
                        const trailScale = this.getXAttackTrailWidthScale();
                        if (!cloneUsesDualZ) {
                            const cloneAttackState = {
                                x: this.x,
                                y: this.y,
                                facingRight: this.facingRight,
                                isAttacking: this.isAttacking,
                                currentAttack: this.currentAttack,
                                attackTimer: this.attackTimer,
                                isCrouching: this.isCrouching
                            };
                            this.renderComboSlashTrail(ctx, {
                                points: cloneTrailPoints,
                                trailWidthScale: trailScale,
                                boostActive: trailScale > 1.01 && isCloneAttacking,
                                isAttacking: isCloneAttacking,
                                attackState: cloneAttackState,
                                getBoostAnchor: () => (
                                    Array.isArray(this.specialCloneSlashTrailBoostAnchors)
                                        ? this.specialCloneSlashTrailBoostAnchors[i]
                                        : null
                                ),
                                setBoostAnchor: (value) => {
                                    if (!Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                                        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
                                    }
                                    this.specialCloneSlashTrailBoostAnchors[i] = value;
                                }
                            });
                        }
                    }

                    const cloneScarfNodes = this.specialCloneScarfNodes[i] || null;
                    const cloneHairNodes = this.specialCloneHairNodes[i] || null;

                    if (cloneScarfNodes && cloneHairNodes) {
                        const footY = this.y + this.height;
                        const cloneMotionTime = saved.motionTime;
                        const cloneIsMoving = this.specialCloneAutoAiEnabled
                            ? (Math.abs(pos.prevX - pos.x) > 0.5)
                            : (Math.abs(saved.vx) > 0.5 || !saved.isGrounded);
                        const anchorCalc = this.calculateAccessoryAnchor(
                            pos.x - this.width * 0.5, footY, this.height,
                            cloneMotionTime, cloneIsMoving,
                            false, false,
                            this.legPhase || cloneMotionTime * 0.012,
                            pos.facingRight
                        );
                        this.syncAccessoryRootNodes(cloneScarfNodes, cloneHairNodes, anchorCalc);
                    }

                    this.renderModel(ctx, this.x, this.y, this.facingRight, 1.0, true, {
                        useLiveAccessories: true,
                        renderHeadbandTail: true,
                        isClone: true,
                        cloneIndex: i,
                        scarfNodes: cloneScarfNodes || undefined,
                        hairNodes: cloneHairNodes || undefined
                    });
                    if (
                        cloneUsesDualZ &&
                        this.currentSubWeapon &&
                        this.currentSubWeapon.name === '二刀流' &&
                        typeof this.currentSubWeapon.render === 'function'
                    ) {
                        const dualBlade = this.currentSubWeapon;
                        const dualSaved = {
                            isAttacking: dualBlade.isAttacking,
                            attackType: dualBlade.attackType,
                            attackTimer: dualBlade.attackTimer,
                            attackDirection: dualBlade.attackDirection,
                            comboIndex: dualBlade.comboIndex,
                            projectiles: dualBlade.projectiles
                        };
                        const dualComboIndex = this.specialCloneAutoAiEnabled
                            ? (this.specialCloneComboSteps[i] || 0)
                            : (dualBlade.comboIndex || 0);
                        const dualAttackTimer = this.specialCloneAutoAiEnabled
                            ? (this.specialCloneSubWeaponTimers[i] || 0)
                            : (this.subWeaponTimer || dualBlade.attackTimer || 0);
                        dualBlade.isAttacking = true;
                        dualBlade.attackType = 'main';
                        dualBlade.attackDirection = this.facingRight ? 1 : -1;
                        dualBlade.comboIndex = dualComboIndex;
                        dualBlade.attackTimer = dualAttackTimer;
                        dualBlade.projectiles = [];
                        dualBlade.render(ctx, this);
                        dualBlade.isAttacking = dualSaved.isAttacking;
                        dualBlade.attackType = dualSaved.attackType;
                        dualBlade.attackTimer = dualSaved.attackTimer;
                        dualBlade.attackDirection = dualSaved.attackDirection;
                        dualBlade.comboIndex = dualSaved.comboIndex;
                        dualBlade.projectiles = dualSaved.projectiles;
                    }

                    ctx.restore();
                });

                // 本体の状態を完全に復元
                this.isAttacking = saved.isAttacking;
                this.currentAttack = saved.currentAttack;
                this.attackTimer = saved.attackTimer;
                this.attackCombo = saved.attackCombo;
                this.subWeaponTimer = saved.subWeaponTimer;
                this.subWeaponAction = saved.subWeaponAction;
                this.subWeaponPoseOverride = saved.subWeaponPoseOverride;
                this.facingRight = saved.facingRight;
                this.x = saved.x;
                this.y = saved.y;
                this.vx = saved.vx;
                this.vy = saved.vy;
                this.isGrounded = saved.isGrounded;
                this.isCrouching = saved.isCrouching;
                this.isDashing = saved.isDashing;
                this.motionTime = saved.motionTime;
                this.height = saved.height;
                this.legPhase = saved.legPhase;
                this.legAngle = saved.legAngle;
            }
        }

        // 忍術ドロン煙
        for (const puff of this.specialSmoke) {
            renderScaled(puff.x, puff.y, () => {
                const life = Math.max(0, Math.min(1, puff.life / puff.maxLife));
                const bloom = 1 - life;
                const radius = puff.radius * (puff.mode === 'appear' ? (0.78 + bloom * 1.05) : (0.66 + bloom * 0.88));
                const alpha = (puff.mode === 'appear' ? 0.62 : 0.36) * life;
                const warm = puff.mode === 'appear';
                
                const rot = puff.rot || 0;

                // 煙描画もキャッシュミストを拡大縮小・着色して利用（大幅な軽量化）
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(puff.x, puff.y);
                // warm時は少し暖色寄りのglobalCompositeOperation 等を使ってもよいが
                // ここではシンプルにキャッシュを利用し合成モードで色味を足す
                
                if (this.mistCacheCanvas) {
                    const s = this.mistCacheCanvas.width;
                    const scale = (radius * 2) / s;
                    ctx.scale(scale, scale);
                    // ベースの煙
                    ctx.drawImage(this.mistCacheCanvas, -s/2, -s/2);
                    
                    // 追加のコブ
                    ctx.save();
                    ctx.rotate(rot);
                    ctx.translate(0, s/4);
                    ctx.globalAlpha = alpha * 0.7;
                    ctx.scale(0.6, 0.6);
                    ctx.drawImage(this.mistCacheCanvas, -s/2, -s/2);
                    ctx.restore();
                } else {
                    // フォールバック
                    ctx.fillStyle = warm ? `rgba(194, 233, 255, 1.0)` : `rgba(176, 196, 230, 1.0)`;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                if (life < (puff.ringStart || 0.28) && life > 0.12) {
                    const ringAlpha = alpha * (1 - life) * 0.9;
                    ctx.strokeStyle = warm
                        ? `rgba(194, 233, 255, ${ringAlpha})`
                        : `rgba(182, 206, 240, ${ringAlpha})`;
                    ctx.lineWidth = 1.1;
                    ctx.beginPath();
                    ctx.arc(puff.x, puff.y, radius * (0.74 + (1 - life) * 0.35), 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (puff.hasSpark && life > 0.26) {
                    const sparkX = puff.x + Math.cos(rot * 1.7) * radius * 0.44;
                    const sparkY = puff.y + Math.sin(rot * 1.3) * radius * 0.32;
                    ctx.fillStyle = `rgba(248, 254, 255, ${alpha * 0.85})`;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, Math.max(0.8, radius * 0.08), 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }




        ctx.restore();
    }


    
    // 攻撃判定の取得（当たり判定用）
    getAttackHitbox(options = {}) {
        const state = options.state || this;
        const isAttacking = state.isAttacking !== undefined ? state.isAttacking : this.isAttacking;
        const currentAttack = state.currentAttack !== undefined ? state.currentAttack : this.currentAttack;
        const attackTimer = state.attackTimer !== undefined ? state.attackTimer : this.attackTimer;
        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const bodyWidth = Number.isFinite(state.width) ? state.width : this.width;
        const bodyHeight = Number.isFinite(state.height) ? state.height : this.height;
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;

        if (!isAttacking || !currentAttack) return null;
        const zHitboxScale = this.getXAttackHitboxScale();
        const xBoostAction = this.isXAttackBoostActive() && this.isXAttackActionActive();
        const scaleBox = (box) => {
            if (!box || zHitboxScale <= 1.001) return box;
            const cx = box.x + box.width * 0.5;
            const cy = box.y + box.height * 0.5;
            const width = box.width * zHitboxScale;
            const height = box.height * zHitboxScale;
            return {
                ...box,
                x: cx - width * 0.5,
                y: cy - height * 0.5,
                width,
                height
            };
        };
        
        const attack = currentAttack;
        const range = attack.range || 90; // デフォルト値を安全のため設定
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const progress = Math.max(0, Math.min(1, 1 - (attackTimer / attackDuration)));
        
        // 回転斬り（全方位）
        if (attack.type === ANIM_STATE.ATTACK_SPIN) {
            const centerX = x + bodyWidth / 2;
            const centerY = y + bodyHeight / 2;
            return scaleBox({
                x: centerX - range,
                y: centerY - range,
                width: range * 2,
                height: range * 2
            });
        }

        if (attack.comboStep) {
            const swordPose = this.getComboSwordPoseState({
                x,
                y,
                width: bodyWidth,
                height: bodyHeight,
                facingRight,
                isCrouching,
                attackTimer,
                currentAttack
            });
            if (!swordPose) return null;

            const centerX = swordPose.centerX;
            const dir = swordPose.dir;
            const armEndX = swordPose.armEndX;
            const armEndY = swordPose.armEndY;
            const tipX = swordPose.tipX;
            const tipY = swordPose.tipY;
            const basePad = attack.comboStep === 5 ? 18 : 14;
            const extraDown = attack.comboStep === 5 ? 28 : 0;
            const xBox = Math.min(armEndX, tipX) - basePad;
            const yBox = Math.min(armEndY, tipY) - basePad;
            const swordBoxWidth = Math.abs(tipX - armEndX) + basePad * 2;
            const swordBoxHeight = Math.abs(tipY - armEndY) + basePad * 2 + extraDown;

            const swordBox = {
                x: xBox,
                y: yBox - (attack.comboStep === 5 ? 4 : 0),
                width: swordBoxWidth,
                height: swordBoxHeight
            };
            const closeRangeBox = {
                // 至近距離で密着しても当たる補助判定（前寄り）
                x: centerX - 40 + dir * 10,
                y: y - 14,
                width: 80,
                height: bodyHeight + 36
            };
            const forwardAssistBox = {
                // 中ボス級にも空振りしづらい前方補助判定
                x: centerX + (dir > 0 ? 8 : -92),
                y: y - 20,
                width: 100,
                height: bodyHeight + 44
            };

            if (attack.comboStep === 4) {
                // 四段目: 斬り上げ〜宙返り中は体周辺にも当たり判定を持たせる
                const aerialBodyBox = {
                    x: centerX - 36,
                    y: y - 26,
                    width: 72,
                    height: bodyHeight + 40
                };
                return [swordBox, closeRangeBox, forwardAssistBox, aerialBodyBox].map(scaleBox);
            }

            if (attack.comboStep === 5) {
                // 五段目: 落下斬り + 着地衝撃（足元と左右）を別当たり判定で付与
                const impactBox = {
                    x: centerX - 44,
                    y: y + bodyHeight - 26,
                    width: 88,
                    height: 52
                };
                if (xBoostAction) {
                    // 大凪中は剣筋から離れた補助判定を抑えて、ヒット感を剣筋寄りに合わせる
                    return [swordBox, impactBox].map(scaleBox);
                }
                return [swordBox, closeRangeBox, forwardAssistBox, impactBox].map(scaleBox);
            }

            return [swordBox, closeRangeBox, forwardAssistBox].map(scaleBox);
        }

        if (attack.isLaunch) {
            const launchWidth = range;
            const launchHeight = Math.max(54, bodyHeight + 22);
            const yBox = y - 18;
            return scaleBox({
                x: facingRight ? x + bodyWidth : x - range,
                y: yBox,
                width: launchWidth,
                height: launchHeight
            });
        }
        
        if (facingRight) {
            return scaleBox({
                x: x + bodyWidth,
                y: y,
                width: range,
                height: bodyHeight
            });
        } else {
            return scaleBox({
                x: x - range,
                y: y,
                width: range,
                height: bodyHeight
            });
        }
    }
    
    // 必殺技判定の取得
    getSpecialHitbox() {
        return null;
    }

    switchSubWeapon() {
        if (this.subWeapons.length <= 1) return;
        
        this.subWeaponIndex = (this.subWeaponIndex + 1) % this.subWeapons.length;
        this.currentSubWeapon = this.subWeapons[this.subWeaponIndex];
        
        // ステージごとの装備を記憶
        if (game.currentStageNumber) {
            if (!this.stageEquip) this.stageEquip = {};
            this.stageEquip[game.currentStageNumber] = this.currentSubWeapon.name;
        }

        // 切り替え音
        if (audio && typeof audio.playWeaponSwitch === 'function') {
            audio.playWeaponSwitch();
        } else {
            audio.playSelect();
        }
    }

    // ========== ShadowCaster Interface ==========
    getFootX() {
        return this.x + this.width / 2;
    }

    getFootY() {
        // スプライトの実際の足元位置を返す
        return this.y + this.height; 
    }

    getHeightAboveGround() {
        // キャラが本来着地するレーンとの差分（奥のレーンなら +24）
        return Math.max(0, (this.groundY + LANE_OFFSET) - (this.y + this.height));
    }

    getShadowBaseRadius() {
        return this.width * 0.45;
    }
}
