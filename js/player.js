// ============================================
// Unification of the Nation - プレイヤークラス
// ============================================

import { PLAYER, GRAVITY, FRICTION, COLORS, LANE_OFFSET } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { game } from './game.js';
import { drawShurikenShape } from './weapon.js';
import {
    ANIM_STATE, COMBO_ATTACKS, calcExpToNextForLevel,
    BASE_EXP_TO_NEXT, TEMP_NINJUTSU_MAX_STACK_MS, LEVEL_UP_MAX_HP_GAIN,
    PLAYER_HEADBAND_LINE_WIDTH, PLAYER_SPECIAL_HEADBAND_LINE_WIDTH,
    PLAYER_PONYTAIL_CONNECT_LIFT_Y, PLAYER_PONYTAIL_ROOT_ANGLE_RIGHT,
    PLAYER_PONYTAIL_ROOT_ANGLE_LEFT, PLAYER_PONYTAIL_ROOT_SHIFT_X,
    PLAYER_PONYTAIL_NODE_ROOT_OFFSET_X, PLAYER_PONYTAIL_NODE_ROOT_OFFSET_Y
} from './playerData.js';
import { applyRendererMixin }    from './playerRenderer.js';
import { applySlashTrailMixin }  from './playerSlashTrail.js';
import { applySpecialMixin }     from './playerSpecial.js';

export { ANIM_STATE };

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
        // 二刀流コンボ用トレイルバッファ（奥刀=青、手前刀=赤）
        this.dualBladeBackTrailPoints = [];
        this.dualBladeFrontTrailPoints = [];
        this.dualBladeBackTrailSampleTimer = 0;
        this.dualBladeFrontTrailSampleTimer = 0;
        this.specialCloneSlashTrailPoints = [];
        this.specialCloneSlashTrailSampleTimers = [];
        this.specialCloneSlashTrailBoostAnchors = [];
        this.specialCloneMirroredTrailProfiles = [];
        this.comboSlashTrailSampleIntervalMs = 14;
        this.comboSlashTrailActiveLifeMs = 800;
        this.comboSlashTrailAttackSerial = 0;
        // 攻撃終了後は形を保ったまま緩やかにフェードアウトさせる
        this.comboSlashTrailFadeLifeMs = 480;
        // 凍結ベジェ曲線: 各段の攻撃終了時にベジェパラメータを独立保存しフェードさせる
        this.comboSlashTrailFrozenCurves = [];
        
        // 奥義分身関連
        this.specialClonePositions = []; // 各分身の現在の世界座標 {x, y, facingRight}
        this.specialCloneTargets = [];   // 各分身の追尾対象（Enemyオブジェクト）
        this.specialCloneReturnToAnchor = []; // 待機位置へ戻るフラグ
        this.specialCloneComboSteps = []; // 分身ごとのコンボ段数
        this.specialCloneCurrentAttacks = []; // 分身ごとの現在攻撃プロファイル
        this.specialCloneAttackTimers = []; // 各分身の攻撃アニメーション用タイマー
        this.specialCloneComboResetTimers = []; // 各分身のコンボ継続可能時間用タイマー
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
        this.updateDualBladeSlashTrails(deltaMs);

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
            
            if (lockZDuringSub) return;

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
        this.pinSlashTrailPoints(this.comboSlashTrailPoints);
        this.isAttacking = true;
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
        if (Array.isArray(this.specialCloneMirroredTrailProfiles) && !this.specialCloneAutoAiEnabled) {
            for (let i = 0; i < this.specialCloneMirroredTrailProfiles.length; i++) {
                this.specialCloneMirroredTrailProfiles[i] = null;
            }
        }
        
        // コンボ進行
        const comboMax = this.getNormalComboMax();
        let nextCombo = this.attackCombo + 1;
        
        // 過去の攻撃が時間経過で切れている場合（attackCombo === 0 の状態）
        if (this.attackCombo === 0) {
            nextCombo = 1;
        } else if (nextCombo > comboMax) {
            nextCombo = 1;
        }

        // コンボが最後（4段目や5段目）まで到達したあと、空中にいるまま「1段目」へループするのを防ぐ。
        // 空中で4段目や5段目を発動した直後は restrictAirCombo1 が true になり、着地するまでは1段目が出せない
        if (nextCombo === 1 && !this.isGrounded && this.restrictAirCombo1) {
            // 空中でのコンボループ不発処理
            this.isAttacking = false;
            this.attackBuffered = false;
            return;
        }

        // 斬撃SEの再生（攻撃が実際に成立する場合のみ鳴らす）
        if (!(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流')) {
            audio.playSlash(nextCombo - 1);
        }

        this.attackCombo = nextCombo;
        
        this.currentAttack = this.buildComboAttackProfileWithTrail(this.attackCombo, {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            facingRight: this.facingRight,
            isCrouching: this.isCrouching,
            vx: this.vx,
            vy: this.vy,
            speed: this.speed
        });
        this.currentAttack.trailAttackId = ++this.comboSlashTrailAttackSerial;
        this.attackTimer = this.currentAttack.durationMs;
        this.attackCooldown = Math.max(28, this.currentAttack.durationMs * this.currentAttack.cooldownScale);
        this.comboResetTimer = (this.currentAttack.chainWindowMs || 60) + 190;
        const direction = this.facingRight ? 1 : -1;
        const impulse = (this.currentAttack.impulse || 1) * this.speed;
        const step = this.currentAttack.comboStep;
        
        if (step === 4 || step === 5) {
            this.restrictAirCombo1 = true;
        }

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
            
            // 攻撃終了時の余韻管理
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
            // 1撃目: 踏み込んで一閃 — 前方に体重移動
            const targetVx = direction * this.speed * (0.14 + Math.sin(p * Math.PI) * 0.28);
            this.vx = blend(this.vx, targetVx);
            if (!this.isGrounded) {
                this.vy = blend(this.vy, p < 0.5 ? -0.2 : 0.8);
            }
        } else if (step === 2) {
            // 2撃目: 最小限の引きから即座に前方へ打ち込む
            let targetVx;
            if (p < 0.08) {
                targetVx = -direction * this.speed * (0.12 + p * 0.2);
            } else if (p < 0.48) {
                targetVx = direction * this.speed * (0.24 + (p - 0.08) * 1.8);
            } else {
                targetVx = direction * this.speed * (0.96 - (p - 0.48) * 1.6);
            }
            this.vx = blend(this.vx, targetVx);
            if (!this.isGrounded) {
                this.vy = blend(this.vy, p < 0.42 ? -1.0 : 2.6);
            }
        } else if (step === 3) {
            // 3撃目: X字交差で前方に押し出す
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
            const odachi = this.currentSubWeapon;
            const hangY = (odachi && typeof odachi.getPlantedOwnerY === 'function')
                ? odachi.getPlantedOwnerY(this)
                : (this.groundY + LANE_OFFSET - this.height - 30);
            // 刺さっている間は常に同じ吊り位置を維持する
            if (Number.isFinite(hangY)) {
                this.y = hangY;
            }
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
        if (this.justLanded) {
            this.restrictAirCombo1 = false;
        }
        if (this.justLanded && fallingSpeed > 0) {
            audio.playLanding();
        }
        
        // 画面端制限とStage 5穴バリア
        let leftLimit = 0;
        let rightLimit = Infinity;

        if (game && game.stage && game.stage.stageNumber === 5) {
            if (game.stage.floorScrollDirection === -1) {
                leftLimit = -this.width; // ステージ5左登りのみ、遷移達成のために画面外へ突破を許可
            }

            // 以前あった穴の幅(200px)に対する見えない壁（進入禁止制限）を解除
            // これにより、前フロアから続く階段の斜面へ自由に移動・昇降が可能となる
        }

        if (this.x < leftLimit) {
            this.x = leftLimit;
            // 壁に衝突時、速度を完全に0にして残像の進行を止める
            this.vx = 0;
            this.ax = 0;
        }
        if (this.x > rightLimit) {
            this.x = rightLimit;
            this.vx = 0;
            this.ax = 0;
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
        const wasReady = this.specialGauge >= this.maxSpecialGauge;
        this.specialGauge = Math.min(this.specialGauge + amount, this.maxSpecialGauge);
        const isReady = this.specialGauge >= this.maxSpecialGauge;
        
        if (!wasReady && isReady) {
            if (typeof audio !== 'undefined' && typeof audio.playSpecialReady === 'function') {
                audio.playSpecialReady();
            }
            if (typeof window !== 'undefined' && window.game) {
                window.game.specialReadyFlashTime = Date.now();
            }
        }
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


    /**
     * ポニーテールの共通描画メソッド
     */

    /**
     * 鉢巻テールの共通描画メソッド
     */


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

applyRendererMixin(Player);
applySlashTrailMixin(Player);
applySpecialMixin(Player);
