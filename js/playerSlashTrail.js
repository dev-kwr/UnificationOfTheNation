// Unification of the Nation - 斬撃トレイル mixin

import { PLAYER, GRAVITY, FRICTION, COLORS, LANE_OFFSET } from './constants.js';
import { audio } from './audio.js';
import { game } from './game.js';
import { drawShurikenShape } from './weapon.js';
import {
    ANIM_STATE, COMBO_ATTACKS, PLAYER_HEADBAND_LINE_WIDTH, PLAYER_SPECIAL_HEADBAND_LINE_WIDTH,
    PLAYER_PONYTAIL_CONNECT_LIFT_Y, PLAYER_PONYTAIL_ROOT_ANGLE_RIGHT,
    PLAYER_PONYTAIL_ROOT_ANGLE_LEFT, PLAYER_PONYTAIL_ROOT_SHIFT_X,
    PLAYER_PONYTAIL_NODE_ROOT_OFFSET_X, PLAYER_PONYTAIL_NODE_ROOT_OFFSET_Y,
    BASE_EXP_TO_NEXT, TEMP_NINJUTSU_MAX_STACK_MS, LEVEL_UP_MAX_HP_GAIN
} from './playerData.js';

export function applySlashTrailMixin(PlayerClass) {

    PlayerClass.prototype.getKatanaVisualTipOffset = function(
        angle,
        dir = 1,
        bladeLength = this.getKatanaBladeLength(),
        uprightBlend = 0,
        scaleY = 1,
        uprightTarget = -Math.PI / 2
    ) {
        const blend = Math.max(0, Math.min(1, uprightBlend));
        const adjustedAngle = angle + (uprightTarget - angle) * blend;
        const scale = 0.52;
        const visualBladeLength = Math.max(18, bladeLength - 5);
        const bladeReach = visualBladeLength / scale;
        const gripOffset = 10;
        const tsubaX = gripOffset;
        const tsubaRX = 1.8;
        const habakiX = tsubaX + tsubaRX + 0.4;
        const bladeStart = habakiX + 2.2;
        const bladeEnd = Math.max(bladeStart + 10, bladeReach);
        const bl = bladeEnd - bladeStart;
        const sori = bl * 0.18;
        const tipLocalXBase = bladeEnd * scale;
        const tipLocalYBase = (-(sori) + 0.06 - 2.2) * scale * scaleY;
        const rotX = Math.cos(adjustedAngle) * tipLocalXBase - Math.sin(adjustedAngle) * tipLocalYBase;
        const rotY = Math.sin(adjustedAngle) * tipLocalXBase + Math.cos(adjustedAngle) * tipLocalYBase;
        return {
            x: rotX * dir,
            y: rotY
        };
    };

    PlayerClass.prototype.buildAttackProfile = function(baseAttack, extra = {}) {
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
    };

    PlayerClass.prototype.absolutizeRelativeTrailPoint = function(point, fallbackX = this.x, fallbackY = this.y, forceOffsetX = null, forceOffsetY = null) {
        if (!point) return null;
        const isRelative = !!point.trailIsRelative;
        const offsetX = isRelative ? (Number.isFinite(forceOffsetX) ? forceOffsetX : (Number.isFinite(point.playerX) ? point.playerX : fallbackX)) : 0;
        const offsetY = isRelative ? (Number.isFinite(forceOffsetY) ? forceOffsetY : (Number.isFinite(point.playerY) ? point.playerY : fallbackY)) : 0;
        return {
            ...point,
            age: point.age || 0,
            trailCurveStartX: Number.isFinite(point.trailCurveStartX) ? point.trailCurveStartX + offsetX : point.trailCurveStartX,
            trailCurveStartY: Number.isFinite(point.trailCurveStartY) ? point.trailCurveStartY + offsetY : point.trailCurveStartY,
            trailCurveControlX: Number.isFinite(point.trailCurveControlX) ? point.trailCurveControlX + offsetX : point.trailCurveControlX,
            trailCurveControlY: Number.isFinite(point.trailCurveControlY) ? point.trailCurveControlY + offsetY : point.trailCurveControlY,
            trailCurveEndX: Number.isFinite(point.trailCurveEndX) ? point.trailCurveEndX + offsetX : point.trailCurveEndX,
            trailCurveEndY: Number.isFinite(point.trailCurveEndY) ? point.trailCurveEndY + offsetY : point.trailCurveEndY,
            trailIsRelative: false
        };
    };

    PlayerClass.prototype.buildFrozenSampledBezierSnapshot = function(stepNum, stepPoints, forceOffsetX = null, forceOffsetY = null) {
        if (!Array.isArray(stepPoints) || stepPoints.length < 2) return null;
        const lastPt = stepPoints[stepPoints.length - 1];
        const firstPt = stepPoints[0];
        const frozenPoints = stepPoints
            .map((point) => this.absolutizeRelativeTrailPoint(point, this.x, this.y, forceOffsetX, forceOffsetY))
            .filter(Boolean);
        const frozenCurvePoints = frozenPoints.map((point) => ({
            x: point.x,
            y: point.y,
            age: Math.max(0, point.age || 0),
            life: Math.max(1, point.life || this.comboSlashTrailActiveLifeMs)
        }));
        if (!frozenCurvePoints || frozenCurvePoints.length < 2) return null;
        return {
            type: 'sampledBezier',
            step: stepNum,
            frozenPoints,
            frozenCurvePoints,
            age: Math.max(0, lastPt.age || 0),
            oldestAge: Math.max(0, firstPt.age || 0),
            life: Math.max(1, lastPt.life || this.comboSlashTrailActiveLifeMs)
        };
    };

    PlayerClass.prototype.pinSlashTrailPoints = function(points) {
        if (!Array.isArray(points) || points.length === 0) return;
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (!point || !point.trailIsRelative) continue;
            Object.assign(points[i], this.absolutizeRelativeTrailPoint(point));
        }
    };

    PlayerClass.prototype.freezeCurrentSlashTrail = function() {
        if (!Array.isArray(this.comboSlashTrailPoints) || this.comboSlashTrailPoints.length === 0) return;
        
        // メインバッファ内の軌跡を段ごとにグループ化
        const stepGroups = new Map();
        for (let i = 0; i < this.comboSlashTrailPoints.length; i++) {
            const point = this.comboSlashTrailPoints[i];
            const step = point.step;
            if (typeof step !== 'number' || step < 1 || step > 5) continue;
            if (!stepGroups.has(step)) stepGroups.set(step, []);
            stepGroups.get(step).push(point);
        }
        
        const frozenTrailCenterX = this.x + this.width * 0.5;
        const frozenTrailCenterY = this.y + this.height * 0.5;
        for (const [stepNum, stepPoints] of stepGroups) {
            const lastPt = stepPoints[stepPoints.length - 1];
            const stripTrailId = lastPt?.trailAttackId || stepNum;
            const frozenBoostAnchor = (this.comboSlashTrailBoostAnchors && this.comboSlashTrailBoostAnchors[stripTrailId]) 
                ? { ...this.comboSlashTrailBoostAnchors[stripTrailId] } 
                : null;
            const forceOffsetX = frozenBoostAnchor ? frozenBoostAnchor.baseCenterX - this.width * 0.5 : null;
            const forceOffsetY = frozenBoostAnchor ? frozenBoostAnchor.baseCenterY - this.height * 0.5 : null;

            if ([1, 2].includes(stepNum)) {
                const frozenSnapshot = this.buildFrozenSampledBezierSnapshot(stepNum, stepPoints, forceOffsetX, forceOffsetY);
                if (frozenSnapshot) {
                    frozenSnapshot.boostAnchor = frozenBoostAnchor;
                    frozenSnapshot.frozenTrailCenterX = frozenTrailCenterX;
                    frozenSnapshot.frozenTrailCenterY = frozenTrailCenterY;
                    this.comboSlashTrailFrozenCurves.push(frozenSnapshot);
                }
            } else if ([5].includes(stepNum)) {
                // ベジェ曲線段: 最新のパラメータを保存
                const lastPt = stepPoints.length > 0 ? stepPoints[stepPoints.length - 1] : null;
                const firstPt = stepPoints.length > 0 ? stepPoints[0] : null;
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
                        progress: Number.isFinite(lastPt.progress) ? lastPt.progress : 1.0, // 実際の進行度で凍結させる
                        trailIsRelative: !!lastPt.trailIsRelative,
                        playerX: Number.isFinite(forceOffsetX) ? forceOffsetX : this.x,
                        playerY: Number.isFinite(forceOffsetY) ? forceOffsetY : this.y,
                        age: Math.max(0, lastPt.age || 0), // 新しい（剣先の）フェードアウト度合い
                        oldestAge: Math.max(0, firstPt ? firstPt.age : (lastPt.age || 0)), // 古い（根本の）フェードアウト度合い
                        life: Math.max(1, lastPt.life || this.comboSlashTrailActiveLifeMs),
                        trailCurveFrozen: true,
                        boostAnchor: frozenBoostAnchor,
                        frozenTrailCenterX: frozenTrailCenterX,
                        frozenTrailCenterY: frozenTrailCenterY
                    });
                }
            } else {
                // リニア/アーク段(3, 4など): ポイント配列を保存
                if (stepPoints.length >= 2) {
                    const lastPt = stepPoints[stepPoints.length - 1];
                    const firstPt = stepPoints[0];
                    const footX = this.getFootX ? this.getFootX() : (this.x + this.width * 0.5);
                    const footY = this.getFootY ? this.getFootY() : (this.y + this.height);
                    this.comboSlashTrailFrozenCurves.push({
                        type: 'points',
                        step: stepNum,
                        // メインバッファでの年齢を引き継ぐ
                        frozenPoints: stepPoints.map(p => ({ ...p, age: p.age || 0 })),
                        frozenFootY: footY,
                        trailIsRelative: !!lastPt.trailIsRelative,
                        age: Math.max(0, lastPt.age || 0), // 新しい（剣先の）フェードアウト度合い
                        oldestAge: Math.max(0, firstPt.age || 0), // 古い（根本の）フェードアウト度合い
                        life: Math.max(1, lastPt.life || this.comboSlashTrailActiveLifeMs),
                        boostAnchor: frozenBoostAnchor,
                        frozenTrailCenterX: frozenTrailCenterX,
                        frozenTrailCenterY: frozenTrailCenterY
                    });
                }
            }
        }
        
        // 全ての過去の軌跡を凍結スナップショットに移管したため、メインバッファを完全に消去する（追従バグの根絶）
        this.comboSlashTrailPoints.length = 0;
    };

    PlayerClass.prototype.getComboAttackProfileByStep = function(step) {
        const clampedStep = Math.max(1, Math.min(COMBO_ATTACKS.length, Math.floor(step) || 1));
        const comboProfile = COMBO_ATTACKS[clampedStep - 1] || COMBO_ATTACKS[0];
        return this.buildAttackProfile(comboProfile, { comboStep: clampedStep, source: 'main' });
    };

    PlayerClass.prototype.getComboSwordPoseReference = function(step, rawProgress = 1, state = {}, options = {}) {
        const attack = this.getComboAttackProfileByStep(step);
        const durationMs = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const clampedProgress = Math.max(0, Math.min(1, rawProgress));
        if (step === 4) {
            attack.motionElapsedMs = durationMs * clampedProgress;
        }
        return this.getComboSwordPoseState(
            {
                x: state.x !== undefined ? state.x : this.x,
                y: state.y !== undefined ? state.y : this.y,
                width: Number.isFinite(state.width) ? state.width : this.width,
                height: Number.isFinite(state.height) ? state.height : this.height,
                facingRight: state.facingRight !== undefined ? state.facingRight : this.facingRight,
                isCrouching: state.isCrouching !== undefined ? state.isCrouching : this.isCrouching,
                currentAttack: attack,
                attackTimer: durationMs * (1 - clampedProgress),
                recoveryBlend: 0
            },
            options
        );
    };

    PlayerClass.prototype.buildComboAttackProfileWithTrail = function(step, state = {}) {
        const attackProfile = this.getComboAttackProfileByStep(step);
        return this.applyComboTrailSpecToAttackProfile(attackProfile, state);
    };

    PlayerClass.prototype.applyComboTrailSpecToAttackProfile = function(attackProfile, state = {}) {
        if (!attackProfile || !attackProfile.comboStep) return attackProfile;
        const baseState = {
            x: state.x !== undefined ? state.x : this.x,
            y: state.y !== undefined ? state.y : this.y,
            width: Number.isFinite(state.width) ? state.width : this.width,
            height: Number.isFinite(state.height) ? state.height : this.height,
            facingRight: state.facingRight !== undefined ? state.facingRight : this.facingRight,
            isCrouching: state.isCrouching !== undefined ? state.isCrouching : this.isCrouching,
            vx: Number.isFinite(state.vx) ? state.vx : this.vx,
            vy: Number.isFinite(state.vy) ? state.vy : this.vy,
            speed: Number.isFinite(state.speed) ? state.speed : this.speed
        };

        if (attackProfile.comboStep === 1) {
            const step1TrailSpec = this.buildComboFixedBezierTrailSpec(
                {
                    ...baseState,
                    x: 0,
                    y: 0,
                    attack: attackProfile
                },
                [0.0, 0.5, 1.0]
            );
            if (step1TrailSpec) {
                Object.assign(attackProfile, step1TrailSpec);
                attackProfile.trailIsRelative = true;
            }
        } else if (attackProfile.comboStep === 2) {
            const step1EndPose = this.getComboSwordPoseReference(1, 1.0, {
                ...baseState,
                x: baseState.x,
                y: baseState.y
            });
            const step2TrailSpec = this.buildComboStep2TrailSpec(
                {
                    ...baseState,
                    attack: attackProfile
                },
                {
                    fixedStartPoint: step1EndPose
                        ? { x: step1EndPose.trailTipX, y: step1EndPose.trailTipY }
                        : null
                }
            );
            if (step2TrailSpec) {
                Object.assign(attackProfile, step2TrailSpec);
            }
        } else if (attackProfile.comboStep === 4) {
            const step4TrailArc = this.buildComboStep4TrailArcSpec({
                ...baseState,
                attack: attackProfile
            });
            if (step4TrailArc) {
                Object.assign(attackProfile, step4TrailArc);
            }
        } else if (attackProfile.comboStep === 5) {
            const step5TrailSpec = this.buildComboStep5TrailSpec({
                ...baseState,
                attack: attackProfile
            });
            if (step5TrailSpec) {
                Object.assign(attackProfile, step5TrailSpec);
            }
        }

        return attackProfile;
    };

    PlayerClass.prototype.getMirroredCloneTrailProfile = function(index, pos, cloneDrawY) {
        if (!this.currentAttack || !pos) return null;
        if (!Array.isArray(this.specialCloneMirroredTrailProfiles)) {
            this.specialCloneMirroredTrailProfiles = this.specialCloneSlots.map(() => null);
        }
        const activeTrailId = Number.isFinite(this.currentAttack.trailAttackId)
            ? this.currentAttack.trailAttackId
            : null;
        const cached = this.specialCloneMirroredTrailProfiles[index];
        if (
            cached &&
            cached.trailAttackId === activeTrailId &&
            cached.comboStep === (this.currentAttack.comboStep || 0)
        ) {
            return cached;
        }
        const profile = this.applyComboTrailSpecToAttackProfile(
            { ...this.currentAttack },
            {
                x: pos.x - this.width * 0.5,
                y: cloneDrawY,
                width: this.width,
                height: PLAYER.HEIGHT,
                facingRight: pos.facingRight,
                isCrouching: false,
                vx: this.vx,
                vy: this.vy,
                speed: this.speed
            }
        );
        this.specialCloneMirroredTrailProfiles[index] = profile;
        return profile;
    };

    PlayerClass.prototype.getAttackMotionProgress = function(attack, rawProgress) {
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
    };

    PlayerClass.prototype.getComboSwordPoseForTrail = function(state = null) {
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
    };

    PlayerClass.prototype.getComboTrailProgressWindow = function(comboStep) {
        switch (comboStep) {
            // 一段目は振り切り後の戻りを剣筋に含めない
            case 1: return { start: 0.0, end: 0.82 };
            case 2: return { start: 0.0, end: 1.0 };
            case 3: return { start: 0.0, end: 1.0 };
            case 4: return { start: 0.0, end: 1.0 };
            case 5: return { start: 0.15, end: 0.9 };
            default: return { start: 0, end: 1 };
        }
    };

    PlayerClass.prototype.shouldKeepComboTrailDuringReturn = function(comboStep) {
        // 1-5撃目は戻りの余韻まで剣筋だけを残してフェードさせる
        return comboStep >= 1 && comboStep <= 5;
    };

    PlayerClass.prototype.buildComboFixedBezierTrailSpec = function(state = {}, sampleTargets = [0.06, 0.5, 0.92], options = {}) {
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
        const start = (
            options.fixedStartPoint &&
            Number.isFinite(options.fixedStartPoint.x) &&
            Number.isFinite(options.fixedStartPoint.y)
        )
            ? { x: options.fixedStartPoint.x, y: options.fixedStartPoint.y }
            : { x: startPose.trailTipX, y: startPose.trailTipY };
        const mid = { x: midPose.trailTipX, y: midPose.trailTipY };
        const end = { x: endPose.trailTipX, y: endPose.trailTipY };
        const startProgress = Number.isFinite(startPose.progress) ? startPose.progress : Math.max(0, Math.min(1, sampleTargets[0]));
        const midProgress = Number.isFinite(midPose.progress) ? midPose.progress : Math.max(0, Math.min(1, sampleTargets[1]));
        const endProgress = Number.isFinite(endPose.progress) ? endPose.progress : Math.max(0, Math.min(1, sampleTargets[2]));
        const totalSpan = Math.max(0.001, endProgress - startProgress);
        const midT = Math.max(0.08, Math.min(0.92, (midProgress - startProgress) / totalSpan));
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
        const controlXMin = Math.min(start.x, mid.x, end.x) - 160;
        const controlXMax = Math.max(start.x, mid.x, end.x) + 160;
        const controlYMin = Math.min(start.y, mid.y, end.y) - 160;
        const controlYMax = Math.max(start.y, mid.y, end.y) + 160;
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
    };

    PlayerClass.prototype.buildComboStep2TrailSpec = function(state = {}, options = {}) {
        const attack = state.attack || this.currentAttack || null;
        if (!attack || attack.comboStep !== 2) return null;

        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const width = Number.isFinite(state.width) ? state.width : this.width;
        const height = Number.isFinite(state.height) ? state.height : this.height;
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const speed = Number.isFinite(state.speed) ? state.speed : this.speed;
        const dir = facingRight ? 1 : -1;
        const durationMs = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const sampleTargets = [0.0, 0.42, 1.0];
        const frameMs = 1000 / 60;
        const impulse = (attack.impulse || 1) * speed;
        let simX = x;
        let simY = y;
        let simVx = isCrouching
            ? dir * impulse * 0.28
            : ((Number.isFinite(state.vx) ? state.vx : this.vx) * 0.16 + dir * impulse * 0.9);
        let simVy = isCrouching
            ? (Number.isFinite(state.vy) ? state.vy : this.vy)
            : ((state.isGrounded !== undefined ? state.isGrounded : this.isGrounded)
                ? 0
                : Math.min(Number.isFinite(state.vy) ? state.vy : this.vy, -1.2));
        let timerMs = durationMs;
        let sampleIndex = 0;
        const sampledBodies = [];

        const pointAt = (progress, bodyX, bodyY) => {
            const pose = this.getComboSwordPoseState({
                x: bodyX,
                y: bodyY,
                width,
                height,
                facingRight,
                isCrouching,
                currentAttack: attack,
                attackTimer: durationMs * (1 - Math.max(0, Math.min(1, progress))),
                recoveryBlend: 0
            });
            return pose ? { x: pose.trailTipX, y: pose.trailTipY, progress: pose.progress } : null;
        };

        while (sampleIndex < sampleTargets.length) {
            const progress = Math.max(0, Math.min(1, 1 - (timerMs / durationMs)));
            while (sampleIndex < sampleTargets.length && progress >= sampleTargets[sampleIndex] - 0.0001) {
                sampledBodies[sampleIndex] = { x: simX, y: simY };
                sampleIndex++;
            }
            if (progress >= sampleTargets[sampleTargets.length - 1] || timerMs <= 0) break;
            simX += simVx;
            simY += simVy;
            if (state.isGrounded !== false) {
                simVx *= 0.965;
                simVx *= FRICTION;
                if (Math.abs(simVx) < 0.1) simVx = 0;
            }
            timerMs = Math.max(0, timerMs - frameMs);
        }
        while (sampleIndex < sampleTargets.length) {
            sampledBodies[sampleIndex] = { x: simX, y: simY };
            sampleIndex++;
        }

        const startBody = sampledBodies[0] || { x, y };
        const midBody = sampledBodies[1] || startBody;
        const endBody = sampledBodies[2] || midBody;
        const startPose = pointAt(sampleTargets[0], startBody.x, startBody.y);
        const midPose = pointAt(sampleTargets[1], midBody.x, midBody.y);
        const endPose = pointAt(sampleTargets[2], endBody.x, endBody.y);
        const start = (
            options.fixedStartPoint &&
            Number.isFinite(options.fixedStartPoint.x) &&
            Number.isFinite(options.fixedStartPoint.y)
        )
            ? { x: options.fixedStartPoint.x, y: options.fixedStartPoint.y }
            : (startPose ? { x: startPose.x, y: startPose.y } : null);
        const mid = midPose ? { x: midPose.x, y: midPose.y } : null;
        const end = endPose ? { x: endPose.x, y: endPose.y } : null;
        if (!start || !mid || !end) return null;

        const startProgress = startPose && Number.isFinite(startPose.progress) ? startPose.progress : 0;
        const midProgress = midPose && Number.isFinite(midPose.progress) ? midPose.progress : 0.42;
        const endProgress = endPose && Number.isFinite(endPose.progress) ? endPose.progress : 1;
        const totalSpan = Math.max(0.001, endProgress - startProgress);
        const midT = Math.max(0.16, Math.min(0.84, (midProgress - startProgress) / totalSpan));
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
        const controlXMin = Math.min(start.x, mid.x, end.x) - 160;
        const controlXMax = Math.max(start.x, mid.x, end.x) + 160;
        const controlYMin = Math.min(start.y, mid.y, end.y) - 160;
        const controlYMax = Math.max(start.y, mid.y, end.y) + 160;
        controlX = Math.max(controlXMin, Math.min(controlXMax, controlX));
        controlY = Math.max(controlYMin, Math.min(controlYMax, controlY));
        return {
            trailCurveStartX: start.x,
            trailCurveStartY: start.y,
            trailCurveControlX: controlX,
            trailCurveControlY: controlY,
            trailCurveEndX: end.x,
            trailCurveEndY: end.y,
            trailIsRelative: false
        };
    };

    PlayerClass.prototype.buildSampledBezierCurvePoints = function(points, options = {}) {
        if (!Array.isArray(points) || points.length < 2) return null;
        const oldestSrc = points[0];
        const newestSrc = points[points.length - 1];
        const isRelative = !!(
            options.forceRelative ||
            (options.useRelativeIfAvailable && newestSrc.trailIsRelative)
        );
        // 始点のオフセットは最初のサンプル時のプレイヤー位置を使い、攻撃中の移動によるズレを防ぐ
        const startOffsetX = isRelative
            ? (Number.isFinite(oldestSrc.playerX) ? oldestSrc.playerX : (options.offsetX || 0))
            : 0;
        const startOffsetY = isRelative
            ? (Number.isFinite(oldestSrc.playerY) ? oldestSrc.playerY : (options.offsetY || 0))
            : 0;
        // 終点のオフセットは最新サンプル時のプレイヤー位置を使う
        const endOffsetX = isRelative
            ? (Number.isFinite(newestSrc.playerX) ? newestSrc.playerX : (options.offsetX || 0))
            : 0;
        const endOffsetY = isRelative
            ? (Number.isFinite(newestSrc.playerY) ? newestSrc.playerY : (options.offsetY || 0))
            : 0;
        const start = (
            Number.isFinite(newestSrc.trailCurveStartX) &&
            Number.isFinite(newestSrc.trailCurveStartY)
        )
            ? { x: newestSrc.trailCurveStartX + startOffsetX, y: newestSrc.trailCurveStartY + startOffsetY }
            : { x: points[0].x, y: points[0].y };
        // 終点はベジェの trailCurveEnd があればそれを使い切っ先と正確に揃える
        const end = (
            Number.isFinite(newestSrc.trailCurveEndX) &&
            Number.isFinite(newestSrc.trailCurveEndY)
        )
            ? { x: newestSrc.trailCurveEndX + endOffsetX, y: newestSrc.trailCurveEndY + endOffsetY }
            : { x: newestSrc.x, y: newestSrc.y };
        const chordX = end.x - start.x;
        const chordY = end.y - start.y;
        const chordLenSq = Math.max(0.001, chordX * chordX + chordY * chordY);
        let midPoint = null;
        let midProgress = null;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (!p) continue;
            const relX = p.x - start.x;
            const relY = p.y - start.y;
            const lineT = Math.max(0, Math.min(1, ((relX * chordX) + (relY * chordY)) / chordLenSq));
            const projX = start.x + chordX * lineT;
            const projY = start.y + chordY * lineT;
            const deviation = Math.hypot(p.x - projX, p.y - projY);
            if (!midPoint || deviation > midPoint.deviation) {
                midPoint = { x: p.x, y: p.y, deviation };
                midProgress = Number.isFinite(p.progress) ? p.progress : null;
            }
        }
        if (!midPoint) return null;
        const endProgress = Number.isFinite(newestSrc.progress) ? newestSrc.progress : 1;
        const midT = Math.max(
            0.16,
            Math.min(
                0.84,
                Number.isFinite(midProgress) && endProgress > 0.001
                    ? (midProgress / endProgress)
                    : 0.5
            )
        );
        const midFactor = Math.max(0.001, 2 * (1 - midT) * midT);
        let controlX = (
            midPoint.x -
            ((1 - midT) * (1 - midT) * start.x) -
            (midT * midT * end.x)
        ) / midFactor;
        let controlY = (
            midPoint.y -
            ((1 - midT) * (1 - midT) * start.y) -
            (midT * midT * end.y)
        ) / midFactor;
        const controlXMin = Math.min(start.x, midPoint.x, end.x) - 160;
        const controlXMax = Math.max(start.x, midPoint.x, end.x) + 160;
        const controlYMin = Math.min(start.y, midPoint.y, end.y) - 160;
        const controlYMax = Math.max(start.y, midPoint.y, end.y) + 160;
        controlX = Math.max(controlXMin, Math.min(controlXMax, controlX));
        controlY = Math.max(controlYMin, Math.min(controlYMax, controlY));
        const stripCount = Math.max(10, Math.min(22, points.length + 8));
        const curvePoints = [];
        for (let i = 0; i < stripCount; i++) {
            const t = stripCount <= 1 ? 1 : (i / (stripCount - 1));
            const oneMinusT = 1 - t;
            curvePoints.push({
                x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * controlX + t * t * end.x,
                y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * controlY + t * t * end.y,
                age: oldestSrc.age + (newestSrc.age - oldestSrc.age) * t,
                life: Math.max(
                    1,
                    (oldestSrc.life || this.comboSlashTrailActiveLifeMs) +
                    ((newestSrc.life || this.comboSlashTrailActiveLifeMs) - (oldestSrc.life || this.comboSlashTrailActiveLifeMs)) * t
                )
            });
        }
        return curvePoints;
    };

    PlayerClass.prototype.buildComboStep4TrailArcSpec = function(state = {}) {
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
        const sampleTargets = [0.0, 0.24, 0.42];
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
        const start = pointAt(0.0, startBody.x, startBody.y);
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
    };

    PlayerClass.prototype.buildComboStep5TrailSpec = function(state = {}) {
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
    };

    PlayerClass.prototype.getComboSwordPoseState = function(state, options = {}) {
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
                if (progress < 0.34) {
                    const backT = progress / 0.34;
                    const backEase = backT * backT * (3 - 2 * backT);
                    swordAngle = 2.18 + backEase * 1.34;
                    // 溜め: 手は利き手側に留める。刃が後方へ向くため体の前で「逆手に引いた」構えになる
                    armEndX = centerX + dir * (10 - backEase * 2);
                    armEndY = pivotY + 5.0 + backEase * 3.0; // 胸→みぞおちへ少し下げる
                } else {
                    const cutT = Math.min(1, (progress - 0.34) / 0.52); // 0.86で斬り抜き完了
                    const cutEase = cutT * cutT * (3 - 2 * cutT);
                    const settle = Math.max(0, Math.min(1, (progress - 0.86) / 0.14));
                    const settleEase = settle * settle * (3 - 2 * settle);
                    swordAngle = 3.52 + cutEase * 2.9;
                    // 切り上げ: 引いた位置から前上方へ薙ぎ払い。刃が前を向く終盤まで手は前方へ伸びる
                    armEndX = centerX + dir * (8 + cutEase * 6 - settleEase * 2);
                    armEndY = pivotY + 8 - cutEase * 15 + settleEase * 5;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.12));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevPose = this.getComboSwordPoseReference(
                    1,
                    1.0,
                    { x, y, width, height, facingRight, isCrouching },
                    {
                        leftShoulderX: leftShoulderXBase,
                        leftShoulderY: leftShoulderYBase,
                        rightShoulderX: rightShoulderXBase,
                        rightShoulderY: rightShoulderYBase,
                        supportRightHand: allowSupportFrontHand
                    }
                );
                const prevAngle = prevPose ? prevPose.swordAngle : 2.92;
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 5.5);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 10.0);
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                // 溜め・切り上げに合わせて肩が沈み・前上方へ動く
                {
                    const backT2 = Math.max(0, Math.min(1, progress / 0.34));
                    const backEase2 = backT2 * backT2 * (3 - 2 * backT2);
                    const cutT2 = Math.max(0, Math.min(1, (progress - 0.34) / 0.52));
                    const cutEase2 = cutT2 * cutT2 * (3 - 2 * cutT2);
                    activeLeftShoulderX += dir * cutEase2 * 0.7;
                    activeLeftShoulderY += backEase2 * 0.5 - cutEase2 * 0.9;
                    activeRightShoulderX += dir * cutEase2 * 0.4;
                    activeRightShoulderY += backEase2 * 0.4 - cutEase2 * 0.7;
                }
                // 1段目終端との肩位置スナップを解消（prepEase期間中に徐々に移行）
                if (prepEase < 1) {
                    const prevLeftShX = prevPose ? prevPose.activeLeftShoulderX : leftShoulderXBase;
                    const prevLeftShY = prevPose ? prevPose.activeLeftShoulderY : leftShoulderYBase;
                    const prevRightShX = prevPose ? prevPose.activeRightShoulderX : rightShoulderXBase;
                    const prevRightShY = prevPose ? prevPose.activeRightShoulderY : rightShoulderYBase;
                    activeLeftShoulderX = prevLeftShX + (activeLeftShoulderX - prevLeftShX) * prepEase;
                    activeLeftShoulderY = prevLeftShY + (activeLeftShoulderY - prevLeftShY) * prepEase;
                    activeRightShoulderX = prevRightShX + (activeRightShoulderX - prevRightShX) * prepEase;
                    activeRightShoulderY = prevRightShY + (activeRightShoulderY - prevRightShY) * prepEase;
                }
                break;
            }
            case 1: {
                const idleAngle = isCrouching ? -0.32 : -0.65;
                const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
                const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0);

                const wind = Math.max(0, Math.min(1, progress / 0.34));
                const swing = Math.max(0, Math.min(1, (progress - 0.34) / 0.48)); // 0.82で振り抜き完了
                const swingEase = swing * swing * (3 - 2 * swing);
                const baseArmX = centerX + dir * 15;
                const baseArmY = pivotY + 8.0;
                swordAngle = idleAngle + wind * (1.0 - idleAngle) + swingEase * 1.32;
                armEndX = idleHandX + wind * (baseArmX - idleHandX) - swingEase * 9.5 * dir;
                armEndY = idleHandY + wind * (baseArmY - idleHandY) + swingEase * 2.0;

                activeLeftShoulderX -= dir * (0.6 * wind + swingEase * 1.18);
                activeLeftShoulderY += (0.2 * wind + swingEase * 0.52);
                activeRightShoulderX -= dir * (0.2 * wind + swingEase * 0.72);
                activeRightShoulderY += (0.2 * wind + swingEase * 0.48);
                break;
            }
            case 3: {
                swordAngle = -0.22 + Math.sin(progress * Math.PI) * 0.34;
                armEndX = centerX + dir * (-10 + easeInOut * 36);
                armEndY = pivotY + 9.0 - Math.sin(progress * Math.PI) * 3.1;
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevPose = this.getComboSwordPoseReference(
                    2,
                    1.0,
                    { x, y, width, height, facingRight, isCrouching },
                    {
                        leftShoulderX: leftShoulderXBase,
                        leftShoulderY: leftShoulderYBase,
                        rightShoulderX: rightShoulderXBase,
                        rightShoulderY: rightShoulderYBase,
                        supportRightHand: allowSupportFrontHand
                    }
                );
                const prevAngle = prevPose ? prevPose.swordAngle : 0.1368;
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 19.4);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 5.6);
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
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
                const prevPose = this.getComboSwordPoseReference(
                    3,
                    1.0,
                    { x, y, width, height, facingRight, isCrouching },
                    {
                        leftShoulderX: leftShoulderXBase,
                        leftShoulderY: leftShoulderYBase,
                        rightShoulderX: rightShoulderXBase,
                        rightShoulderY: rightShoulderYBase,
                        supportRightHand: allowSupportFrontHand
                    }
                );
                const prevAngle = prevPose ? prevPose.swordAngle : -0.22;
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 26);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 9.0);
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

        // レンダラ側と同じ主動作腕のリーチ制限を先に適用し、切っ先と剣筋を一致させる
        {
            const standardUpperLen = 13.6;
            const standardForeLen = 13.2;
            const mainReachCap = standardUpperLen + standardForeLen;
            const handDx = armEndX - activeLeftShoulderX;
            const handDy = armEndY - activeLeftShoulderY;
            const handDist = Math.hypot(handDx, handDy);
            if (handDist > mainReachCap && handDist > 0.0001) {
                const clampRatio = mainReachCap / handDist;
                armEndX = activeLeftShoulderX + handDx * clampRatio;
                armEndY = activeLeftShoulderY + handDy * clampRatio;
            }
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
        const visualTipOffset = this.getKatanaVisualTipOffset(swordAngle, dir, bladeLen, 0);
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
            tipX: armEndX + visualTipOffset.x,
            tipY: armEndY + visualTipOffset.y,
            trailTipX: armEndX + visualTipOffset.x,
            trailTipY: armEndY + visualTipOffset.y,
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
            trailCenterY,
            trailIsRelative: attack ? attack.trailIsRelative : undefined
        };
    };

    PlayerClass.prototype.getComboSwordPoseForTrailState = function(state) {
        if (!state.isAttacking) return null;
        
        const swordPose = this.getComboSwordPoseState(state);
        if (!swordPose) return null;
        const trailWindow = this.getComboTrailProgressWindow(swordPose.comboStep);
        if (swordPose.progress < trailWindow.start || swordPose.progress > trailWindow.end) return null;
        return {
            comboStep: swordPose.comboStep,
            tipX: swordPose.trailTipX,
            tipY: swordPose.trailTipY,
            originX: state.x,
            originY: state.y,
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
            centerY: Number.isFinite(swordPose.trailCenterY) ? swordPose.trailCenterY : swordPose.centerY,
            trailIsRelative: swordPose.trailIsRelative
        };
    };

    PlayerClass.prototype.updateComboSlashTrail = function(deltaMs) {
        const pose = this.getComboSwordPoseForTrail();
        const comboStep = this.currentAttack ? (this.currentAttack.comboStep || 0) : 0;
        
        // 凍結ベジェ曲線のフェード管理（メインバッファとは完全に独立）
        if (Array.isArray(this.comboSlashTrailFrozenCurves)) {
            for (let i = this.comboSlashTrailFrozenCurves.length - 1; i >= 0; i--) {
                const fc = this.comboSlashTrailFrozenCurves[i];
                fc.age = (fc.age || 0) + deltaMs;
                if (fc.oldestAge !== undefined) fc.oldestAge += deltaMs;
                if (fc.type === 'points' && Array.isArray(fc.frozenPoints)) {
                    for (const p of fc.frozenPoints) {
                        p.age = (p.age || 0) + deltaMs;
                    }
                }
                if (fc.age >= fc.life) {
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
            {
                holdExisting,
                sampleTrailScale,
                activeTrailId: this.currentAttack && Number.isFinite(this.currentAttack.trailAttackId)
                    ? this.currentAttack.trailAttackId
                    : null
            }
        );
    };

    PlayerClass.prototype.updateSlashTrailBuffer = function(points, sampleTimer, pose, deltaMs, options = {}) {
        if (!Array.isArray(points)) return 0;
        const holdExisting = !!options.holdExisting;
        const sampleTrailScale = Number.isFinite(options.sampleTrailScale) ? options.sampleTrailScale : 1;
        const currentStep = pose ? (pose.comboStep || 0) : -1;
        const activeTrailId = Number.isFinite(options.activeTrailId) ? options.activeTrailId : null;
        const trimTrailingStepPoints = (step) => {
            if (!Number.isFinite(step) || step <= 0) return;
            while (points.length > 0) {
                const tail = points[points.length - 1];
                if (!tail || (tail.step || 0) !== step) break;
                points.pop();
            }
        };
        
        // 核心ルール: lifeは生成時に一度だけ設定。以降はageのみが進む。
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (pose && p.trailIsRelative && p.step !== currentStep) {
                Object.assign(p, this.absolutizeRelativeTrailPoint(p));
            }
            
            // 攻撃が終了した（poseがない）時点で、相対座標の軌跡はワールド座標（絶対座標）に固定し、プレイヤーの手を離れて空間に残るようにする
            if (!pose && p.trailIsRelative) {
                const originX = Number.isFinite(p.playerX) ? p.playerX : this.x;
                const originY = Number.isFinite(p.playerY) ? p.playerY : this.y;
                if (Number.isFinite(p.trailCurveStartX)) p.trailCurveStartX += originX;
                if (Number.isFinite(p.trailCurveStartY)) p.trailCurveStartY += originY;
                if (Number.isFinite(p.trailCurveControlX)) p.trailCurveControlX += originX;
                if (Number.isFinite(p.trailCurveControlY)) p.trailCurveControlY += originY;
                if (Number.isFinite(p.trailCurveEndX)) p.trailCurveEndX += originX;
                if (Number.isFinite(p.trailCurveEndY)) p.trailCurveEndY += originY;
                p.trailIsRelative = false;
            }

            const matchesActiveTrail = (
                pose &&
                p.step === currentStep &&
                (activeTrailId === null || p.trailAttackId === activeTrailId)
            );
            if (matchesActiveTrail) {
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
            const currentPoseStep = pose.comboStep || 0;
            if (last && dist > jumpCutDist) {
                if ((last.step || 0) === currentPoseStep) {
                    // 同一段内のテレポートは、その段の壊れた点列だけ捨て直す。
                    // 過去段は残したまま、4段目の縦線量産を防ぐ。
                    trimTrailingStepPoints(currentPoseStep);
                    last = points.length > 0 ? points[points.length - 1] : null;
                    dist = last ? Math.hypot(now.x - last.x, now.y - last.y) : Infinity;
                } else {
                    // 段が変わっただけなら旧段は残して、新段の始点を追加する。
                    last = null;
                    dist = Infinity;
                }
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
                    trailIsRelative: pose.trailIsRelative,
                    playerX: Number.isFinite(pose.originX) ? pose.originX : this.x,
                    playerY: Number.isFinite(pose.originY) ? pose.originY : this.y,
                    step: currentPoseStep,
                    trailAttackId: activeTrailId,
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
                last.trailIsRelative = pose.trailIsRelative !== undefined ? pose.trailIsRelative : last.trailIsRelative;
                last.playerX = Number.isFinite(pose.originX) ? pose.originX : last.playerX;
                last.playerY = Number.isFinite(pose.originY) ? pose.originY : last.playerY;
                last.step = currentPoseStep;
                last.trailAttackId = activeTrailId;
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
    };

    PlayerClass.prototype.updateSpecialCloneSlashTrails = function(deltaMs) {
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
            let activeTrailId = null;

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
                        ? (this.specialCloneComboSteps[i] || 1)
                        : (this.currentAttack ? this.currentAttack.comboStep || 1 : 1);
                    const attackProfile = isAutoAi
                        ? (this.specialCloneCurrentAttacks[i] || this.getComboAttackProfileByStep(comboStep))
                        : this.getMirroredCloneTrailProfile(i, pos, cloneDrawY);
                    activeTrailId = attackProfile && Number.isFinite(attackProfile.trailAttackId)
                        ? attackProfile.trailAttackId
                        : null;
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
                        if (Array.isArray(this.specialCloneMirroredTrailProfiles)) {
                            this.specialCloneMirroredTrailProfiles[i] = null;
                        }
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
                {
                    holdExisting: !!(isAlive && pos && !pose),
                    activeTrailId
                }
            );
            if (Array.isArray(this.specialCloneSlashTrailBoostAnchors) && this.specialCloneSlashTrailPoints[i].length < 2) {
                this.specialCloneSlashTrailBoostAnchors[i] = null;
            }
            if ((!isAlive || !pos || !pose) && Array.isArray(this.specialCloneMirroredTrailProfiles) && !this.specialCloneAutoAiEnabled) {
                this.specialCloneMirroredTrailProfiles[i] = null;
            }
            if (this.specialCloneSlashTrailPoints[i].length > 96) {
                this.specialCloneSlashTrailPoints[i].splice(0, this.specialCloneSlashTrailPoints[i].length - 96);
            }
        }
    };

    PlayerClass.prototype.renderComboSlashTrail = function(ctx, options = {}) {
        const renderOptions = options;
        const usesExternalPoints = Array.isArray(options.points);
        const points = usesExternalPoints ? options.points : this.comboSlashTrailPoints;
        const getBoostAnchor = typeof options.getBoostAnchor === 'function'
            ? options.getBoostAnchor
            : ((step) => this.comboSlashTrailBoostAnchors ? this.comboSlashTrailBoostAnchors[step] : null);
        const setBoostAnchor = typeof options.setBoostAnchor === 'function'
            ? options.setBoostAnchor
            : ((step, value) => { 
                if (!this.comboSlashTrailBoostAnchors) this.comboSlashTrailBoostAnchors = {};
                this.comboSlashTrailBoostAnchors[step] = value; 
              });
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
        const hasStoredBoostTrail = trailWidthScale > 1.01;
        const baseBoostActive = options.boostActive !== undefined
            ? !!options.boostActive
            : (hasStoredBoostTrail && sourceIsAttacking);
        const visualWidthScale = (!baseBoostActive && trailWidthScale > 1.01)
            ? trailWidthScale
            : normalWidthScale;
        if (!baseBoostActive && !hasStoredBoostTrail) {
            if (this.comboSlashTrailBoostAnchors && !usesExternalPoints) {
                this.comboSlashTrailBoostAnchors = {};
            }
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
                const changedAttack = (
                    Number.isFinite(curr.trailAttackId) &&
                    Number.isFinite(prev.trailAttackId) &&
                    curr.trailAttackId !== prev.trailAttackId
                );
                // 物理的な断絶（段数違い、またはテレポート距離）があれば別のストリップへ
                if (curr.step !== prev.step || changedAttack || dist > 140) {
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

        const baseOldestAlpha = 0.1;
        const baseNewestAlpha = 0.82;
        const bluePalette = options.palette || { front: [130, 234, 255], back: [76, 154, 226] };

        const buildProjected = (pts, projectFn = null) => {
            if (!projectFn) {
                return pts.map((src) => ({ ...src }));
            }
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
        const buildChaikinSmoothedStrip = (pts, iterations = 2) => {
            if (!Array.isArray(pts) || pts.length < 3) return pts;
            let current = pts.map((p) => ({ ...p }));
            const rounds = Math.max(1, Math.min(3, Math.floor(iterations) || 1));
            for (let round = 0; round < rounds; round++) {
                if (current.length < 3) break;
                const next = [{ ...current[0] }];
                for (let i = 0; i < current.length - 1; i++) {
                    const p0 = current[i];
                    const p1 = current[i + 1];
                    next.push({
                        x: p0.x * 0.75 + p1.x * 0.25,
                        y: p0.y * 0.75 + p1.y * 0.25,
                        age: (p0.age || 0) * 0.75 + (p1.age || 0) * 0.25,
                        life: Math.max(
                            1,
                            (p0.life || this.comboSlashTrailActiveLifeMs) * 0.75 +
                            (p1.life || this.comboSlashTrailActiveLifeMs) * 0.25
                        )
                    });
                    next.push({
                        x: p0.x * 0.25 + p1.x * 0.75,
                        y: p0.y * 0.25 + p1.y * 0.75,
                        age: (p0.age || 0) * 0.25 + (p1.age || 0) * 0.75,
                        life: Math.max(
                            1,
                            (p0.life || this.comboSlashTrailActiveLifeMs) * 0.25 +
                            (p1.life || this.comboSlashTrailActiveLifeMs) * 0.75
                        )
                    });
                }
                next.push({ ...current[current.length - 1] });
                current = next;
            }
            return current;
        };
        const interpolateProgressStripPoint = (pts, targetProgress) => {
            if (!Array.isArray(pts) || pts.length === 0) return null;
            if (pts.length === 1) return { ...pts[0] };
            const first = pts[0];
            const last = pts[pts.length - 1];
            const firstProgress = Number.isFinite(first.progress) ? first.progress : 0;
            const lastProgress = Number.isFinite(last.progress) ? last.progress : 1;
            if (targetProgress <= firstProgress) return { ...first };
            if (targetProgress >= lastProgress) return { ...last };
            for (let i = 1; i < pts.length; i++) {
                const prev = pts[i - 1];
                const curr = pts[i];
                const prevProgress = Number.isFinite(prev.progress) ? prev.progress : firstProgress;
                const currProgress = Number.isFinite(curr.progress) ? curr.progress : prevProgress;
                if (targetProgress > currProgress) continue;
                const span = Math.max(0.0001, currProgress - prevProgress);
                const t = Math.max(0, Math.min(1, (targetProgress - prevProgress) / span));
                return {
                    ...curr,
                    x: prev.x + (curr.x - prev.x) * t,
                    y: prev.y + (curr.y - prev.y) * t,
                    progress: targetProgress,
                    age: (prev.age || 0) + ((curr.age || 0) - (prev.age || 0)) * t,
                    life: Math.max(
                        1,
                        (prev.life || this.comboSlashTrailActiveLifeMs) +
                        ((curr.life || this.comboSlashTrailActiveLifeMs) - (prev.life || this.comboSlashTrailActiveLifeMs)) * t
                    )
                };
            }
            return { ...last };
        };
        const buildProgressResampledStrip = (pts, comboStep = 0, sampleCount = 12) => {
            if (!Array.isArray(pts) || pts.length < 2) return pts;
            const pointsWithProgress = pts.filter((p) => Number.isFinite(p.progress));
            if (pointsWithProgress.length < 2) return pts;
            const trailWindow = this.getComboTrailProgressWindow(comboStep);
            const windowStart = Number.isFinite(trailWindow.start) ? trailWindow.start : 0;
            const windowEnd = Number.isFinite(trailWindow.end) ? trailWindow.end : 1;
            const firstProgress = Math.max(windowStart, pointsWithProgress[0].progress);
            const lastProgress = Math.min(windowEnd, pointsWithProgress[pointsWithProgress.length - 1].progress);
            if (lastProgress - firstProgress < 0.0001) {
                return pointsWithProgress.map((p) => ({ ...p }));
            }
            const divisions = Math.max(4, Math.min(20, Math.floor(sampleCount) || 12));
            const span = Math.max(0.0001, windowEnd - windowStart);
            const targets = [];
            for (let i = 0; i <= divisions; i++) {
                const progress = windowStart + span * (i / divisions);
                if (progress + 0.0001 < firstProgress || progress - 0.0001 > lastProgress) continue;
                targets.push(progress);
            }
            if (targets.length === 0 || Math.abs(targets[0] - firstProgress) > 0.0001) {
                targets.unshift(firstProgress);
            }
            if (Math.abs(targets[targets.length - 1] - lastProgress) > 0.0001) {
                targets.push(lastProgress);
            }
            const resampled = [];
            for (const target of targets) {
                const point = interpolateProgressStripPoint(pointsWithProgress, target);
                if (point) resampled.push(point);
            }
            return resampled.length >= 2 ? resampled : pts;
        };
        const buildThreePointQuadraticStrip = (pts, comboStep = 0, options = {}) => {
            if (!Array.isArray(pts) || pts.length < 2) return pts;
            const stabilizedPts = buildProgressResampledStrip(
                pts,
                comboStep,
                comboStep === 1 ? 10 : 11
            );
            if (!Array.isArray(stabilizedPts) || stabilizedPts.length < 2) return pts;

            const firstSrc = stabilizedPts[0];
            const lastSrc = stabilizedPts[stabilizedPts.length - 1];
            const lastAnchorSrc = lastSrc && lastSrc.trailIsRelative
                ? this.absolutizeRelativeTrailPoint(lastSrc, this.x, this.y, options.forceOffsetX, options.forceOffsetY)
                : lastSrc;
            const trailWindow = this.getComboTrailProgressWindow(comboStep);
            const windowStart = Number.isFinite(trailWindow.start) ? trailWindow.start : 0;
            const windowEnd = Number.isFinite(trailWindow.end) ? trailWindow.end : 1;
            const currentProgress = Number.isFinite(lastSrc.progress) ? lastSrc.progress : windowEnd;
            const progressT = Math.max(0, Math.min(1, (currentProgress - windowStart) / Math.max(0.0001, windowEnd - windowStart)));
            const endAnchorReady = currentProgress >= (windowEnd - 0.02);
            const anchoredStart = (
                comboStep === 2 &&
                Number.isFinite(lastAnchorSrc?.trailCurveStartX) &&
                Number.isFinite(lastAnchorSrc?.trailCurveStartY)
            )
                ? {
                    ...firstSrc,
                    x: lastAnchorSrc.trailCurveStartX,
                    y: lastAnchorSrc.trailCurveStartY
                }
                : firstSrc;
            const anchoredEnd = (
                endAnchorReady &&
                (comboStep === 1 || comboStep === 2) &&
                Number.isFinite(lastAnchorSrc?.trailCurveEndX) &&
                Number.isFinite(lastAnchorSrc?.trailCurveEndY)
            )
                ? {
                    ...lastSrc,
                    x: lastAnchorSrc.trailCurveEndX,
                    y: lastAnchorSrc.trailCurveEndY
                }
                : lastSrc;
            const start = anchoredStart;
            const end = anchoredEnd;
            const anchorControl = (
                Number.isFinite(lastAnchorSrc?.trailCurveControlX) &&
                Number.isFinite(lastAnchorSrc?.trailCurveControlY)
            )
                ? { x: lastAnchorSrc.trailCurveControlX, y: lastAnchorSrc.trailCurveControlY }
                : null;
            if (stabilizedPts.length === 2) {
                const liveEnd = { ...lastSrc };
                const midX = (start.x + liveEnd.x) * 0.5;
                const midY = (start.y + liveEnd.y) * 0.5;
                const controlBlend = 0.28 + progressT * 0.52;
                const controlX = anchorControl
                    ? midX + (anchorControl.x - midX) * controlBlend
                    : midX;
                const controlY = anchorControl
                    ? midY + (anchorControl.y - midY) * controlBlend
                    : midY;
                const segmentCount = 16;
                const strip = [];
                for (let i = 0; i < segmentCount; i++) {
                    const t = i / (segmentCount - 1);
                    const oneMinusT = 1 - t;
                    strip.push({
                        x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * controlX + t * t * liveEnd.x,
                        y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * controlY + t * t * liveEnd.y,
                        age: (start.age || 0) + ((liveEnd.age || 0) - (start.age || 0)) * t,
                        life: Math.max(
                            1,
                            (start.life || this.comboSlashTrailActiveLifeMs) +
                            ((liveEnd.life || this.comboSlashTrailActiveLifeMs) - (start.life || this.comboSlashTrailActiveLifeMs)) * t
                        )
                    });
                }
                return strip;
            }
            const midBias = comboStep === 1 ? 0.44 : 0.56;
            const midIndex = Math.max(
                1,
                Math.min(
                    stabilizedPts.length - 2,
                    Math.round((stabilizedPts.length - 1) * midBias)
                )
            );
            const mid = stabilizedPts[midIndex];
            const controlX = 2 * mid.x - (start.x + end.x) * 0.5;
            const controlY = 2 * mid.y - (start.y + end.y) * 0.5;
            const segmentCount = Math.max(16, Math.min(28, stabilizedPts.length * 2 + 8));
            const strip = [];
            for (let i = 0; i < segmentCount; i++) {
                const t = segmentCount <= 1 ? 1 : (i / (segmentCount - 1));
                const oneMinusT = 1 - t;
                strip.push({
                    x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * controlX + t * t * end.x,
                    y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * controlY + t * t * end.y,
                    age: (start.age || 0) + ((end.age || 0) - (start.age || 0)) * t,
                    life: Math.max(
                        1,
                        (start.life || this.comboSlashTrailActiveLifeMs) +
                        ((end.life || this.comboSlashTrailActiveLifeMs) - (start.life || this.comboSlashTrailActiveLifeMs)) * t
                    )
                });
            }
            return strip;
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
        const drawSmoothLinearPath = (pts) => {
            if (!pts || pts.length < 2) return false;
            let totalLen = 0;
            for (let i = 1; i < pts.length; i++) {
                totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            }
            if (totalLen < 7.5) return false;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            if (pts.length === 2) {
                ctx.lineTo(pts[1].x, pts[1].y);
                return true;
            }
            for (let i = 1; i < pts.length - 1; i++) {
                const midX = (pts[i].x + pts[i + 1].x) * 0.5;
                const midY = (pts[i].y + pts[i + 1].y) * 0.5;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
            }
            const last = pts.length - 1;
            ctx.quadraticCurveTo(pts[last - 1].x, pts[last - 1].y, pts[last].x, pts[last].y);
            return true;
        };
        const drawGradientLinearTrail = (pts, width, rgb, oldestScale, newestScale, projectFn = null, options = {}) => {
            const mappedRaw = buildProjected(pts, projectFn);
            const mapped = options.smoothEnhanced
                ? buildChaikinSmoothedStrip(mappedRaw, options.smoothIterations || 2)
                : mappedRaw;
            if (!mapped || mapped.length < 2) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const oldestLife = Math.max(1, oldestSrc.life || this.comboSlashTrailActiveLifeMs);
            const newestLife = Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs);
            const oldestFade = clamp01(1 - ((oldestSrc.age || 0) / oldestLife));
            const newestFade = clamp01(1 - ((newestSrc.age || 0) / newestLife));
            const oldestAlpha = Math.max(0, oldestFade * oldestScale);
            const newestAlpha = Math.max(0, newestFade * newestScale);
            if (newestAlpha <= 0.01) return;
            const start = mapped[0];
            const end = mapped[mapped.length - 1];
            const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            grad.addColorStop(0, colorRgba(rgb, oldestAlpha));
            grad.addColorStop(0.52, colorRgba(rgb, oldestAlpha + (newestAlpha - oldestAlpha) * 0.58));
            grad.addColorStop(1, colorRgba(rgb, newestAlpha));
            ctx.strokeStyle = grad;
            ctx.lineWidth = width;
            const pathDrawn = options.smooth
                ? drawSmoothLinearPath(mapped)
                : drawLinearPath(mapped);
            if (pathDrawn) ctx.stroke();
        };
        const drawBlueTrailLayers = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            drawGradientLinearTrail(
                pts,
                baseWidth,
                bluePalette.front,
                oldestScale * 0.62,
                newestScale,
                projectFn,
                options
            );
            drawGradientLinearTrail(
                pts,
                Math.max(1.4, baseWidth * 0.18),
                [255, 255, 255],
                oldestScale * 0.2,
                newestScale * 0.46,
                projectFn,
                options
            );
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
            drawBlueTrailLayers(sourcePts, baseWidth, oldestScale, newestScale, null, { smooth: !!options.smooth });
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
                    return 1.0; // 過去の軌跡は常に完成形(1.0)として扱う
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
            const growth = (() => {
                const p = Number.isFinite(activeStep4RawProgress)
                    ? activeStep4RawProgress
                    : 1.0; // 凍結または終了時は完成形
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
            drawBlueTrailLayers(strip, baseWidth, oldestScale, newestScale, projectFn);
        };
        const drawFixedBezierTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (!pts || pts.length < 1) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const comboStep = options.comboStep || newestSrc.step || 0;
            const isRelative = !!(
                options.forceRelative ||
                (options.useRelativeIfAvailable && newestSrc.trailIsRelative)
            );
            const offsetX = isRelative
                ? (Number.isFinite(options.forceOffsetX) ? options.forceOffsetX : (Number.isFinite(newestSrc.playerX) ? newestSrc.playerX : (options.offsetX || 0)))
                : 0;
            const offsetY = isRelative
                ? (Number.isFinite(options.forceOffsetY) ? options.forceOffsetY : (Number.isFinite(newestSrc.playerY) ? newestSrc.playerY : (options.offsetY || 0)))
                : 0;
            const startX = Number.isFinite(newestSrc.trailCurveStartX) ? newestSrc.trailCurveStartX + offsetX : null;
            const startY = Number.isFinite(newestSrc.trailCurveStartY) ? newestSrc.trailCurveStartY + offsetY : null;
            const controlX = Number.isFinite(newestSrc.trailCurveControlX) ? newestSrc.trailCurveControlX + offsetX : null;
            const controlY = Number.isFinite(newestSrc.trailCurveControlY) ? newestSrc.trailCurveControlY + offsetY : null;
            const endX = Number.isFinite(newestSrc.trailCurveEndX) ? newestSrc.trailCurveEndX + offsetX : null;
            const endY = Number.isFinite(newestSrc.trailCurveEndY) ? newestSrc.trailCurveEndY + offsetY : null;
            if ([startX, startY, controlX, controlY, endX, endY].some((v) => !Number.isFinite(v))) return;
            const activeProgress = (() => {
                if (options.useRelativeIfAvailable && newestSrc.trailCurveFrozen) return Number.isFinite(newestSrc.progress) ? newestSrc.progress : 1.0;
                
                const attackState = renderOptions.attackState || {
                    isAttacking: sourceIsAttacking,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer
                };
                
                // 現在の攻撃ステートが異なる（過去の軌跡）か、攻撃が終了している場合は、過去の軌跡（描画完了済み）として扱う
                if (!sourceIsAttacking || !attackState || !attackState.currentAttack || attackState.currentAttack.comboStep !== comboStep) {
                    return 1.0; 
                }
                
                const duration = Math.max(1, attackState.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                const rawProgress = Number.isFinite(attackState.currentAttack.motionElapsedMs)
                    ? clamp01(attackState.currentAttack.motionElapsedMs / duration)
                    : clamp01(1 - ((Number.isFinite(attackState.attackTimer) ? attackState.attackTimer : this.attackTimer) / duration));
                return this.getAttackMotionProgress(attackState.currentAttack, rawProgress);
            })();
            const trailWindow = this.getComboTrailProgressWindow(comboStep);
            
            // フラッシング（点滅）の原因になるため、ageによる完成形の強制描画を削除。
            const growth = (() => {
                // 凍結軌跡はそのままのスナップショットとして扱う
                
                const p = Number.isFinite(activeProgress)
                    ? activeProgress
                    : 1.0; // 取得できなかった場合は完成形とする
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
            drawBlueTrailLayers(mergedStrip, baseWidth, oldestScale, newestScale, projectFn);
        };
        const drawSampledBezierTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (!pts || pts.length < 2) return;
            const comboStep = options.comboStep || pts[pts.length - 1]?.step || 0;
            const curveStrip = buildThreePointQuadraticStrip(pts, comboStep, options);
            drawBlueTrailLayers(curveStrip, baseWidth, oldestScale, newestScale, projectFn);
        };
        const forceLinearSmooth = !!options.forceLinearSmooth;
        // 各ストリップ（段ごとの軌跡）を独立して描画
        for (const strip of strips) {
            const stripStep = strip[strip.length - 1]?.step || 0;
            if (strip.length < 1) continue;
            if (strip.length < 2 && (forceLinearSmooth || ![1, 2, 4, 5].includes(stripStep))) continue;

            // 描画関数内部で age/life に基づく線形フェードが掛かるため、スケールは固定値を渡す
            const outerOldestAlpha = baseOldestAlpha;
            const outerNewestAlpha = baseNewestAlpha;

            let projFn = null;
            let activeWidthScale = visualWidthScale;
            let boostOldest = outerOldestAlpha;

            const stripTrailId = strip[strip.length - 1]?.trailAttackId || stripStep;
            const boostAnchor = getBoostAnchor(stripTrailId);
            const boostActive = baseBoostActive || !!boostAnchor;

            if (boostActive) {
                let baseCenterX = trailCenterX;
                let baseCenterY = trailCenterY;
                let projectedCenterX = trailCenterX;
                let projectedCenterY = trailCenterY;
                let currentBoostScale = Math.max(1.02, 1 + (trailWidthScale - 1) * 0.74);

                if (boostAnchor && boostAnchor.trailId === stripTrailId) {
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
                    setBoostAnchor(stripTrailId, {
                        baseCenterX, baseCenterY, projectedCenterX, projectedCenterY, boostScale: currentBoostScale, step: stripStep, trailId: stripTrailId
                    });
                }
                const isRelativeStrip = strip.length > 0 && !!strip[strip.length - 1].trailIsRelative;

                projFn = (p) => {
                    // 相対座標（ベジェ系など、プレイヤーと共に移動するポイント）の場合は、プレイヤーの移動分を相殺する
                    // 絶対座標（二刀流などの軌跡）は既にワールド座標なので、プレイヤーの移動による相殺は不要（0にする）
                    const fallDiffX = isRelativeStrip ? (trailCenterX - baseCenterX) : 0;
                    const fallDiffY = isRelativeStrip ? (trailCenterY - baseCenterY) : 0;
                    const fixedPx = p.x - fallDiffX;
                    const fixedPy = p.y - fallDiffY;
                    
                    const vx = fixedPx - baseCenterX;
                    const vy = fixedPy - baseCenterY;
                    return {
                        x: projectedCenterX + vx * currentBoostScale,
                        y: projectedCenterY + vy * currentBoostScale
                    };
                };
                activeWidthScale = trailWidthScale;
                boostOldest = outerOldestAlpha * 0.35;
            }

            // 重複描画防止のためのスキップ処理は撤廃。
            // freezing時にメインバッファを空にする仕組みに変更したため、現在メインバッファにいる軌跡は正真正銘の「新しい攻撃」の軌跡。
            if (forceLinearSmooth) {
                // 二刀流用: Chaikin平滑化 + スムーズ曲線描画
                const smoothed = buildChaikinSmoothedStrip(strip, 2);
                drawBlueTrailLayers(smoothed, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { smooth: true });
                continue;
            }
            
            // 通常時 or ブースト時 共通描画
            if (stripStep === 5) {
                if (boostActive && boostAnchor && boostAnchor.step === stripStep) {
                    const anchorPlayerX = boostAnchor.baseCenterX - this.width * 0.5;
                    const anchorPlayerY = boostAnchor.baseCenterY - this.height * 0.5;
                    const scaleProjFn = (p) => {
                        const vx = p.x - boostAnchor.baseCenterX;
                        const vy = p.y - boostAnchor.baseCenterY;
                        return {
                            x: boostAnchor.baseCenterX + vx * boostAnchor.boostScale,
                            y: boostAnchor.baseCenterY + vy * boostAnchor.boostScale
                        };
                    };
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, scaleProjFn, { 
                        comboStep: 5, useRelativeIfAvailable: true, offsetX: anchorPlayerX, offsetY: anchorPlayerY, forceOffsetX: anchorPlayerX, forceOffsetY: anchorPlayerY, trimEnd: true, trimFactor: 0.24 
                    });
                } else {
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { 
                        comboStep: 5, useRelativeIfAvailable: true, offsetX: this.x, offsetY: this.y, trimEnd: true, trimFactor: 0.24 
                    });
                }
            } else if (stripStep === 1 || stripStep === 2) {
                if (boostActive && boostAnchor && boostAnchor.step === stripStep) {
                    // 大凪ブースト時: forceOffsetX/forceOffsetYを使って、過去のプレイヤー位置を上書きしてアンカー位置に固定する
                    const anchorPlayerX = boostAnchor.baseCenterX - this.width * 0.5;
                    const anchorPlayerY = boostAnchor.baseCenterY - this.height * 0.5;
                    
                    // アンカー中心からの単純スケーリングprojFn
                    const scaleProjFn = (p) => {
                        // p.x/p.yはforceOffsetX/Y（baseCenterX基準）で生成されているため、そのままbaseCenterX基準でスケールする
                        const vx = p.x - boostAnchor.baseCenterX;
                        const vy = p.y - boostAnchor.baseCenterY;
                        return {
                            x: boostAnchor.baseCenterX + vx * boostAnchor.boostScale,
                            y: boostAnchor.baseCenterY + vy * boostAnchor.boostScale
                        };
                    };
                    drawSampledBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, scaleProjFn, {
                        comboStep: stripStep, useRelativeIfAvailable: true, offsetX: anchorPlayerX, offsetY: anchorPlayerY, forceOffsetX: anchorPlayerX, forceOffsetY: anchorPlayerY
                    });
                } else {
                    drawSampledBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, {
                        comboStep: stripStep, useRelativeIfAvailable: true, offsetX: this.x, offsetY: this.y 
                    });
                }
            } else if (stripStep === 4) {
                drawStep4AnchoredArcTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { includeGhost: false });
            } else if (stripStep === 3) {
                drawDualBlueLinearTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { includeGhost: false, straighten: true });
            } else {
                drawDualBlueArcTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { includeGhost: false });
            }
        }

        // 凍結スナップショットの独立描画
        // 描画関数内部のフェード(age)と進行(progress)計算を完全に無効化し、
        // 「完成形」の形状データとして既存の描画関数に渡す。
        // フェード自体は ctx.globalAlpha で直接制御する。
        if (Array.isArray(this.comboSlashTrailFrozenCurves) && !usesExternalPoints) {
            for (const fc of this.comboSlashTrailFrozenCurves) {
                if ((fc.age || 0) >= (fc.life || 1)) continue;
                
                ctx.save();
                
                if (fc.type === 'sampledBezier' && Array.isArray(fc.frozenPoints)) {
                    const pts = Array.isArray(fc.frozenPoints) ? fc.frozenPoints : null;
                    if (!pts || pts.length < 2) { ctx.restore(); continue; }
                    
                    // 凍結時にabsolutizeRelativeTrailPoint済みなので、
                    // 単純なアンカー中心からのスケーリングのみ
                    let projFnFrozen = null;
                    if (fc.boostAnchor) {
                        projFnFrozen = (p) => {
                            const vx = p.x - fc.boostAnchor.projectedCenterX;
                            const vy = p.y - fc.boostAnchor.projectedCenterY;
                            return {
                                x: fc.boostAnchor.projectedCenterX + vx * fc.boostAnchor.boostScale,
                                y: fc.boostAnchor.projectedCenterY + vy * fc.boostAnchor.boostScale
                            };
                        };
                    }

                    drawSampledBezierTrail(pts, 13.8 * visualWidthScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen, {
                        comboStep: fc.step
                    });
                } else if (fc.type === 'bezier' || !fc.type) {
                    // ベジェ曲線段 (1, 2, 5)
                    if (!Number.isFinite(fc.trailCurveStartX)) { ctx.restore(); continue; }
                    
                    // 描画関数内部の自然なグラデーションフェード（oldestFade〜newestFade）に完全に委ねる。
                    // 凍結時のパラメータ（age, oldestAge）は updateComboSlashTrail で毎フレーム加算されているため
                    // ここでそのまま渡すだけで、メインバッファ時代と全く同じ計算で綺麗に消えていく。
                    const frozenPtNew = {
                        x: 0, y: 0,
                        step: fc.step,
                        dir: fc.dir,
                        progress: 1.0, // ★強制的に完成形
                        trailCurveStartX: fc.trailCurveStartX,
                        trailCurveStartY: fc.trailCurveStartY,
                        trailCurveControlX: fc.trailCurveControlX,
                        trailCurveControlY: fc.trailCurveControlY,
                        trailCurveEndX: fc.trailCurveEndX,
                        trailCurveEndY: fc.trailCurveEndY,
                        trailRadius: fc.trailRadius,
                        centerX: fc.centerX,
                        centerY: fc.centerY,
                        age: fc.age || 0,
                        life: fc.life || this.comboSlashTrailActiveLifeMs,
                        trailCurveFrozen: true
                    };
                    const frozenPtOld = Object.assign({}, frozenPtNew, {
                        age: fc.oldestAge !== undefined ? fc.oldestAge : (fc.age || 0)
                    });
                    const offsetX = fc.trailIsRelative ? (fc.playerX || 0) : 0;
                    const offsetY = fc.trailIsRelative ? (fc.playerY || 0) : 0;
                    
                    let projFnFrozen = null;
                    if (fc.boostAnchor) {
                        projFnFrozen = (p) => {
                            const vx = p.x - fc.boostAnchor.projectedCenterX;
                            const vy = p.y - fc.boostAnchor.projectedCenterY;
                            return {
                                x: fc.boostAnchor.projectedCenterX + vx * fc.boostAnchor.boostScale,
                                y: fc.boostAnchor.projectedCenterY + vy * fc.boostAnchor.boostScale
                            };
                        };
                    }
                    
                    drawFixedBezierTrail([frozenPtOld, frozenPtNew], 13.8 * visualWidthScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen, {
                        comboStep: fc.step,
                        forceRelative: true,
                        useRelativeIfAvailable: true,
                        offsetX: offsetX,
                        offsetY: offsetY
                    });
                } else if (fc.type === 'points' && Array.isArray(fc.frozenPoints)) {
                    // ポイント系段 (3, 4)
                    // ポイントごとに保持されている正しい age をそのまま渡す。
                    const pts = fc.frozenPoints;
                    if (pts.length < 2) { ctx.restore(); continue; }
                    
                    const currentFootX = this.getFootX ? this.getFootX() : (this.x + this.width * 0.5);
                    const currentFootY = this.getFootY ? this.getFootY() : (this.y + this.height);
                    const savedCenterX = trailCenterX;
                    const savedCenterY = trailCenterY;
                    trailCenterX = currentFootX;
                    trailCenterY = currentFootY - this.height * 0.5;

                    let projFnFrozen = null;
                    if (fc.boostAnchor) {
                        projFnFrozen = (p) => {
                            const vx = p.x - fc.boostAnchor.projectedCenterX;
                            const vy = p.y - fc.boostAnchor.projectedCenterY;
                            return {
                                x: fc.boostAnchor.projectedCenterX + vx * fc.boostAnchor.boostScale,
                                y: fc.boostAnchor.projectedCenterY + vy * fc.boostAnchor.boostScale
                            };
                        };
                    }

                    if (fc.step === 4) {
                        drawStep4AnchoredArcTrail(pts, 13.8 * visualWidthScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen);
                    } else if (fc.step === 3) {
                        drawDualBlueLinearTrail(pts, 13.8 * visualWidthScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen, { straighten: true });
                    } else {
                        drawDualBlueArcTrail(pts, 13.8 * visualWidthScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen);
                    }
                    
                    trailCenterX = savedCenterX;
                    trailCenterY = savedCenterY;
                }
                
                ctx.restore();
            }
        }


        // 大凪時の追加外周帯は通常コンボで二重線に見えやすいため廃止

        ctx.restore();
    };

    // === 二刀流コンボ用トレイル関数群 ===

    /**
     * dualBladeTrailAnchors（playerRenderer.jsで毎フレーム計算済み）から
     * updateSlashTrailBuffer が期待するポーズ形式に変換する。
     * @param {'back'|'front'} side - 奥刀 or 手前刀
     */
    PlayerClass.prototype.getDualBladePoseForTrail = function(side) {
        const anchors = this.dualBladeTrailAnchors;
        if (!anchors) return null;

        const blade = (side === 'back') ? anchors.back : anchors.front;
        if (!blade || !Number.isFinite(blade.tipX) || !Number.isFinite(blade.tipY)) return null;

        const dualBlade = this.currentSubWeapon;
        if (!dualBlade || dualBlade.name !== '二刀流') return null;

        const comboIndex = dualBlade.comboIndex || 0;
        // comboIndex → comboStep マッピング: 0(五段)→5, 1→1, 2→2, 3→3, 4→4
        const comboStep = comboIndex === 0 ? 5 : comboIndex;
        const progress = typeof dualBlade.getMainSwingProgress === 'function'
            ? dualBlade.getMainSwingProgress()
            : 0;

        return {
            tipX: blade.tipX,
            tipY: blade.tipY,
            dir: anchors.direction,
            comboStep: comboStep,
            progress: progress,
            centerX: blade.handX,
            centerY: blade.handY,
            originX: this.x + this.width * 0.5,
            originY: this.y + this.height * 0.5
        };
    };

    /**
     * 二刀流Zコンボ中、奥刀・手前刀それぞれのトレイルバッファを
     * 通常コンボと同じ updateSlashTrailBuffer で更新する。
     */
    PlayerClass.prototype.updateDualBladeSlashTrails = function(deltaMs) {
        const isDualZ = !!(
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0 &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流'
        );

        const backPose = isDualZ ? this.getDualBladePoseForTrail('back') : null;
        const frontPose = isDualZ ? this.getDualBladePoseForTrail('front') : null;

        const dualBlade = (isDualZ && this.currentSubWeapon) ? this.currentSubWeapon : null;
        const comboIndex = dualBlade ? (dualBlade.comboIndex || 0) : 0;
        const comboStep = comboIndex === 0 ? 5 : comboIndex;
        // 1-2撃目: 静止側のトレイルは生成しない（null poseで自然フェードアウト）
        const suppressBack = isDualZ && comboStep === 2;  // 2撃目: 奥刀は静止
        const suppressFront = isDualZ && comboStep === 1; // 1撃目: 手前刀は静止

        // 振りかぶりフェーズや余韻フェーズ（アイドル復帰中）は剣筋を出さない
        let startSuppress = false;
        let settleSuppress = false;
        if (isDualZ && dualBlade) {
            const pose = typeof dualBlade.getMainSwingPose === 'function'
                ? dualBlade.getMainSwingPose({}) : null;
            if (pose) {
                const p = pose.progress || 0;
                // 振りかぶりやスナップ移動による初期の折れ曲がり（ヘアピン）を防ぐ
                if (comboStep === 2 && p < 0.15) startSuppress = true;
                if (comboStep === 3 && p < 0.15) startSuppress = true;
                if (comboStep === 4 && p < 0.05) startSuppress = true; // 天穿は溜めが短いが極初期だけ抑制
                if (comboStep === 5 && p < 0.18) startSuppress = true;

                // 振り抜き後の余韻は軌跡を残さない
                if (comboStep === 1 && p > 0.50) settleSuppress = true;
                if (comboStep === 2 && p > 0.48) settleSuppress = true;
                if (comboStep === 3 && p > 0.55) settleSuppress = true;
                if (comboStep === 4 && p > 0.65) settleSuppress = true;
                if (comboStep === 5 && p > 0.72) settleSuppress = true;
            }
        }
        // 同じ段数を繰り返してもトレイルが前回と繋がらないよう、
        // _swingId で毎回ユニークなIDにする（通常コンボと同じ挙動）
        const swingId = dualBlade ? (dualBlade._swingId || 0) : 0;
        const activeTrailId = isDualZ ? (comboStep * 10000 + swingId) : null;

        // swingIdが変わったら前回のトレイルを即座にクリア
        let skipSampleThisFrame = false;
        if (isDualZ && this._lastDualSwingId !== swingId) {
            this.dualBladeBackTrailPoints.length = 0;
            this.dualBladeFrontTrailPoints.length = 0;
            this._lastDualSwingId = swingId;
            skipSampleThisFrame = true; // アンカーが更新されるまで1フレーム待つ
        }
        if (!isDualZ) {
            this._lastDualSwingId = -1;
        }

        const dualSampleTrailScale = this.getXAttackTrailWidthScale();

        this.dualBladeBackTrailSampleTimer = this.updateSlashTrailBuffer(
            this.dualBladeBackTrailPoints,
            this.dualBladeBackTrailSampleTimer,
            (suppressBack || startSuppress || settleSuppress || skipSampleThisFrame) ? null : backPose,
            deltaMs,
            { holdExisting: false, activeTrailId: activeTrailId, sampleTrailScale: dualSampleTrailScale }
        );

        this.dualBladeFrontTrailSampleTimer = this.updateSlashTrailBuffer(
            this.dualBladeFrontTrailPoints,
            this.dualBladeFrontTrailSampleTimer,
            (suppressFront || startSuppress || settleSuppress || skipSampleThisFrame) ? null : frontPose,
            deltaMs,
            { holdExisting: false, activeTrailId: activeTrailId, sampleTrailScale: dualSampleTrailScale }
        );
    };

    /**
     * 二刀流コンボのトレイルを描画する。
     * 奥刀 = 青、手前刀 = 赤で、renderComboSlashTrail の描画インフラを再利用。
     */
    PlayerClass.prototype.renderDualBladeSlashTrails = function(ctx) {
        const bluePalette = { front: [130, 234, 255], back: [76, 154, 226] };
        const redPalette = { front: [255, 90, 90], back: [214, 74, 74] };
        const isDualZActive = !!(
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0
        );

        if (this.dualBladeBackTrailPoints.length >= 2) {
            this.renderComboSlashTrail(ctx, {
                points: this.dualBladeBackTrailPoints,
                palette: bluePalette,
                forceLinearSmooth: true,
                isAttacking: isDualZActive,
                getBoostAnchor: (step) => this._dualBackBoostAnchor || null,
                setBoostAnchor: (step, v) => { this._dualBackBoostAnchor = v; }
            });
        }
        if (this.dualBladeFrontTrailPoints.length >= 2) {
            this.renderComboSlashTrail(ctx, {
                points: this.dualBladeFrontTrailPoints,
                palette: redPalette,
                forceLinearSmooth: true,
                isAttacking: isDualZActive,
                getBoostAnchor: (step) => this._dualFrontBoostAnchor || null,
                setBoostAnchor: (step, v) => { this._dualFrontBoostAnchor = v; }
            });
        }
    };
}
