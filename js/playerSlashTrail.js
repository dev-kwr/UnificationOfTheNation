// Unification of the Nation - 斬撃トレイル mixin

import { PLAYER, GRAVITY, FRICTION, LANE_OFFSET } from './constants.js';
import { COMBO_ATTACKS, NORMAL_COMBO_STEP3_LAUNCH_VY, NORMAL_COMBO_STEP3_LUNGE_HSCALE_COEF, SHOGUN_STEP3_MOTION_SCALE } from './playerData.js';
import {
    SHOGUN_ACTOR_BASE_WIDTH,
    SHOGUN_ACTOR_BASE_HEIGHT,
    SHOGUN_ARM_REACH_SCALE
} from './shogunConstants.js';
import {
    freezeNormalComboFinisherTrailCurve,
    getNormalComboStep4RiseScale,
    getNormalComboStep5DownwardControl
} from './normalComboMotion.js';

const COMBO_STEP5_END_TRIM_FACTOR = 0.9;
const getComboStep5EndTrimFactor = (physicalScale = 1) => {
    return COMBO_STEP5_END_TRIM_FACTOR;
};

const getComboStep5ArcControls = (startX, startY, endX, endY) => {
    if (![startX, startY, endX, endY].every(Number.isFinite)) return null;
    return {
        c1: {
            x: startX + (endX - startX) * 0.66,
            y: startY + (endY - startY) * 0.08
        },
        c2: {
            x: startX + (endX - startX) * 0.82,
            y: startY + (endY - startY) * 0.58
        }
    };
};

const getComboStep5CurvePoint = (startX, startY, endX, endY, t) => {
    const controls = getComboStep5ArcControls(startX, startY, endX, endY);
    if (!controls) return null;
    const clampedT = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
    const oneMinusT = 1 - clampedT;
    return {
        x: oneMinusT * oneMinusT * oneMinusT * startX
            + 3 * oneMinusT * oneMinusT * clampedT * controls.c1.x
            + 3 * oneMinusT * clampedT * clampedT * controls.c2.x
            + clampedT * clampedT * clampedT * endX,
        y: oneMinusT * oneMinusT * oneMinusT * startY
            + 3 * oneMinusT * oneMinusT * clampedT * controls.c1.y
            + 3 * oneMinusT * clampedT * clampedT * controls.c2.y
            + clampedT * clampedT * clampedT * endY
    };
};

const getComboStep5CappedProgress = ({
    startX,
    startY,
    endX,
    endY,
    growth,
    growthWindow,
    tipX,
    tipY,
    dirSign = 1,
    baseWidth = 13.8
} = {}) => {
    if (![startX, startY, endX, endY, growth, tipX].every(Number.isFinite)) {
        return { growth, progress: null };
    }
    const capX = tipX - dirSign * Math.max(1.5, baseWidth * 0.16);
    const currentEnd = getComboStep5CurvePoint(startX, startY, endX, endY, growth);
    let cappedGrowth = Math.max(0, Math.min(1, growth));
    const verticalDir = Math.sign(endY - startY);
    const reachedTipY = !Number.isFinite(tipY) ||
        verticalDir === 0 ||
        ((currentEnd?.y ?? tipY) - tipY) * verticalDir >= -baseWidth * 0.35;
    if (currentEnd && reachedTipY && (currentEnd.x - capX) * dirSign > 0) {
        let lo = 0;
        let hi = cappedGrowth;
        for (let i = 0; i < 14; i++) {
            const midT = (lo + hi) * 0.5;
            const p = getComboStep5CurvePoint(startX, startY, endX, endY, midT);
            const pReachedTipY = !Number.isFinite(tipY) ||
                verticalDir === 0 ||
                ((p?.y ?? tipY) - tipY) * verticalDir >= -baseWidth * 0.35;
            if (p && pReachedTipY && (p.x - capX) * dirSign > 0) {
                hi = midT;
            } else {
                lo = midT;
            }
        }
        cappedGrowth = lo;
    }

    const windowStart = Number.isFinite(growthWindow?.start) ? growthWindow.start : 0;
    const windowEnd = Number.isFinite(growthWindow?.end) ? growthWindow.end : 1;
    const progress = windowStart + (windowEnd - windowStart) * cappedGrowth;
    return { growth: cappedGrowth, progress };
};

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

    PlayerClass.prototype.applyShogunStep3ReachToTrailPose = function(pose) {
        if (
            !pose ||
            this.characterType !== 'shogun' ||
            pose.comboStep !== 3 ||
            Math.abs(SHOGUN_ARM_REACH_SCALE - 1) <= 0.001 ||
            !Number.isFinite(pose.armEndX) ||
            !Number.isFinite(pose.armEndY) ||
            !Number.isFinite(pose.activeLeftShoulderX) ||
            !Number.isFinite(pose.activeLeftShoulderY)
        ) {
            return pose;
        }

        const reachedArmX = pose.activeLeftShoulderX + (pose.armEndX - pose.activeLeftShoulderX) * SHOGUN_ARM_REACH_SCALE;
        const reachedArmY = pose.activeLeftShoulderY + (pose.armEndY - pose.activeLeftShoulderY) * SHOGUN_ARM_REACH_SCALE;
        const dx = reachedArmX - pose.armEndX;
        const dy = reachedArmY - pose.armEndY;
        if (Math.abs(dx) <= 0.0001 && Math.abs(dy) <= 0.0001) return pose;

        const result = { ...pose, armEndX: reachedArmX, armEndY: reachedArmY };
        if (Number.isFinite(result.tipX)) result.tipX += dx;
        if (Number.isFinite(result.tipY)) result.tipY += dy;
        if (Number.isFinite(result.trailTipX)) result.trailTipX += dx;
        if (Number.isFinite(result.trailTipY)) result.trailTipY += dy;
        return result;
    };

    PlayerClass.prototype.getRenderedComboStep3TipForTrail = function(point = null, options = {}) {
        const attackState = options.attackState || null;
        const attack = (attackState && attackState.currentAttack) ? attackState.currentAttack : this.currentAttack;
        if (!attack || attack.comboStep !== 3) return null;
        const rawProgressOverride = Number.isFinite(options.rawProgressOverride)
            ? Math.max(0, Math.min(1, options.rawProgressOverride))
            : null;

        const readCachedRenderedTip = () => {
            const tip = this._renderedComboStep3Tip;
            if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) return null;

            const attackTrailId = Number.isFinite(attack.trailAttackId) ? attack.trailAttackId : null;
            if (
                attackTrailId !== null &&
                Number.isFinite(tip.trailAttackId) &&
                tip.trailAttackId !== attackTrailId
            ) {
                return null;
            }
            if (
                point &&
                Number.isFinite(point.trailAttackId) &&
                Number.isFinite(tip.trailAttackId) &&
                point.trailAttackId !== tip.trailAttackId
            ) {
                return null;
            }

            return { x: tip.x, y: tip.y };
        };

        if (!options.preferComputedTip && rawProgressOverride === null) {
            const cachedTip = readCachedRenderedTip();
            if (cachedTip) return cachedTip;
        }

        if (this.characterType === 'shogun' && typeof this.getShogunStep3RenderedTipWorld === 'function') {
            const computedTip = this.getShogunStep3RenderedTipWorld({
                ...(attackState || {}),
                currentAttack: attack,
                attackTimer: attackState && Number.isFinite(attackState.attackTimer)
                    ? attackState.attackTimer
                    : this.attackTimer,
                x: attackState && Number.isFinite(attackState.x) ? attackState.x : this.x,
                y: attackState && Number.isFinite(attackState.y) ? attackState.y : this.y,
                width: typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : (
                    attackState && Number.isFinite(attackState.width) ? attackState.width : PLAYER.WIDTH
                ),
                height: typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : (
                    attackState && Number.isFinite(attackState.height) ? attackState.height : PLAYER.HEIGHT
                ),
                facingRight: attackState && attackState.facingRight !== undefined ? attackState.facingRight : this.facingRight,
                isCrouching: attackState && attackState.isCrouching !== undefined ? attackState.isCrouching : this.isCrouching
            }, rawProgressOverride);
            if (computedTip && Number.isFinite(computedTip.x) && Number.isFinite(computedTip.y)) {
                const cachedTip = rawProgressOverride === null ? readCachedRenderedTip() : null;
                if (cachedTip && Number.isFinite(cachedTip.x) && Number.isFinite(cachedTip.y)) {
                    const dirSign = (attackState && attackState.facingRight !== undefined ? attackState.facingRight : this.facingRight) ? 1 : -1;
                    const cachedAhead = (cachedTip.x - computedTip.x) * dirSign > 0;
                    return cachedAhead ? { x: cachedTip.x, y: cachedTip.y } : { x: computedTip.x, y: computedTip.y };
                }
                return { x: computedTip.x, y: computedTip.y };
            }
        }

        return rawProgressOverride === null ? readCachedRenderedTip() : null;
    };

    PlayerClass.prototype.resolveBezierTrailDrawEndPoint = function(source, options = {}) {
        if (!source || !Number.isFinite(source.trailCurveEndX) || !Number.isFinite(source.trailCurveEndY)) {
            return null;
        }
        let endX = source.trailCurveEndX + (Number.isFinite(options.offsetX) ? options.offsetX : 0);
        let endY = source.trailCurveEndY + (Number.isFinite(options.offsetY) ? options.offsetY : 0);
        if (!options.trimEnd) return { x: endX, y: endY };

        const startX = Number.isFinite(source.trailCurveStartX)
            ? source.trailCurveStartX + (Number.isFinite(options.offsetX) ? options.offsetX : 0)
            : null;
        const startY = Number.isFinite(source.trailCurveStartY)
            ? source.trailCurveStartY + (Number.isFinite(options.offsetY) ? options.offsetY : 0)
            : null;
        const step5ArcControls = source.step === 5 || options.comboStep === 5
            ? getComboStep5ArcControls(startX, startY, endX, endY)
            : null;
        const controlX = step5ArcControls
            ? step5ArcControls.c2.x
            : source.trailCurveControlX + (Number.isFinite(options.offsetX) ? options.offsetX : 0);
        const controlY = step5ArcControls
            ? step5ArcControls.c2.y
            : source.trailCurveControlY + (Number.isFinite(options.offsetY) ? options.offsetY : 0);
        if (!Number.isFinite(controlX) || !Number.isFinite(controlY)) return { x: endX, y: endY };

        const tangentX = endX - controlX;
        const tangentY = endY - controlY;
        const tangentLen = Math.hypot(tangentX, tangentY);
        if (tangentLen <= 0.001) return { x: endX, y: endY };

        const baseWidth = Number.isFinite(options.baseWidth) ? options.baseWidth : 13.8;
        const trimFactor = Number.isFinite(options.trimFactor) ? options.trimFactor : 0.5;
        const trim = Math.min(baseWidth * trimFactor, tangentLen * 0.9);
        endX -= (tangentX / tangentLen) * trim;
        endY -= (tangentY / tangentLen) * trim;
        return { x: endX, y: endY };
    };

    PlayerClass.prototype.resolveComboTrailStepEndWorldPoint = function(stepNum, state = {}, options = {}) {
        const fallbackX = Number.isFinite(state.x) ? state.x : this.x;
        const fallbackY = Number.isFinite(state.y) ? state.y : this.y;
        const physicalScale = Number.isFinite(options.physicalScale)
            ? options.physicalScale
            : Math.max(1, Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1);
        const pointToEnd = (point) => {
            if (!point || point.step !== stepNum) return null;
            const absPoint = this.absolutizeRelativeTrailPoint(point, fallbackX, fallbackY);
            if (!absPoint) return null;
            if (Number.isFinite(absPoint.trailCurveEndX) && Number.isFinite(absPoint.trailCurveEndY)) {
                const trailScale = Number.isFinite(absPoint.trailScale) ? absPoint.trailScale : 1;
                return this.resolveBezierTrailDrawEndPoint(absPoint, {
                    trimEnd: !!options.trimEnd,
                    trimFactor: options.trimFactor,
                    baseWidth: 13.8 * trailScale * physicalScale
                });
            }
            if (Number.isFinite(absPoint.x) && Number.isFinite(absPoint.y)) {
                return { x: absPoint.x, y: absPoint.y };
            }
            return null;
        };

        const trailPointSource = Array.isArray(state.trailPoints)
            ? state.trailPoints
            : this.comboSlashTrailPoints;
        if (Array.isArray(trailPointSource)) {
            for (let i = trailPointSource.length - 1; i >= 0; i--) {
                const endPoint = pointToEnd(trailPointSource[i]);
                if (endPoint) return endPoint;
            }
        }

        const frozenCurveSource = Array.isArray(state.frozenCurves)
            ? state.frozenCurves
            : this.comboSlashTrailFrozenCurves;
        if (!Array.isArray(frozenCurveSource)) return null;
        for (let i = frozenCurveSource.length - 1; i >= 0; i--) {
            const fc = frozenCurveSource[i];
            if (!fc || fc.step !== stepNum) continue;
            if ((fc.type === 'bezier' || !fc.type) && Number.isFinite(fc.trailCurveEndX) && Number.isFinite(fc.trailCurveEndY)) {
                const offsetX = fc.trailIsRelative ? (Number.isFinite(fc.playerX) ? fc.playerX : fallbackX) : 0;
                const offsetY = fc.trailIsRelative ? (Number.isFinite(fc.playerY) ? fc.playerY : fallbackY) : 0;
                const frozenWidthScale = Number.isFinite(fc.trailWidthScale) ? fc.trailWidthScale : 1;
                return this.resolveBezierTrailDrawEndPoint(fc, {
                    offsetX,
                    offsetY,
                    trimEnd: !!options.trimEnd,
                    trimFactor: options.trimFactor,
                    baseWidth: 13.8 * frozenWidthScale * physicalScale
                });
            }
            if (Array.isArray(fc.frozenPoints) && fc.frozenPoints.length > 0) {
                const endPoint = pointToEnd(fc.frozenPoints[fc.frozenPoints.length - 1]);
                if (endPoint) return endPoint;
            }
        }
        return null;
    };

    PlayerClass.prototype.buildAttackProfile = function(baseAttack, extra = {}) {
        const source = { ...(baseAttack || {}), ...(extra || {}) };
        const speedScale = this.attackMotionScale || 1;
        const durationBase = Number.isFinite(source.durationMs) ? source.durationMs : PLAYER.ATTACK_COOLDOWN;
        const chainBase = Number.isFinite(source.chainWindowMs) ? source.chainWindowMs : 0;
        // 将軍のstep3だけモーション時間を縮め、体格で間延びした「もっさり」感を解消する
        // (切先のピーク速度を忍者並みへ)。チェイン窓は据え置きでコンボ繋ぎの感触を保つ。
        let durationScale = speedScale;
        if (this.characterType === 'shogun' && source.comboStep === 3) {
            durationScale *= SHOGUN_STEP3_MOTION_SCALE;
        }
        const durationMs = Math.max(1, Math.round(durationBase * durationScale));
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
            x: Number.isFinite(point.x) ? point.x + offsetX : point.x,
            y: Number.isFinite(point.y) ? point.y + offsetY : point.y,
            centerX: Number.isFinite(point.centerX) ? point.centerX + offsetX : point.centerX,
            centerY: Number.isFinite(point.centerY) ? point.centerY + offsetY : point.centerY,
            age: point.age || 0,
            trailCurveStartX: Number.isFinite(point.trailCurveStartX) ? point.trailCurveStartX + offsetX : point.trailCurveStartX,
            trailCurveStartY: Number.isFinite(point.trailCurveStartY) ? point.trailCurveStartY + offsetY : point.trailCurveStartY,
            trailCurveControlX: Number.isFinite(point.trailCurveControlX) ? point.trailCurveControlX + offsetX : point.trailCurveControlX,
            trailCurveControlY: Number.isFinite(point.trailCurveControlY) ? point.trailCurveControlY + offsetY : point.trailCurveControlY,
            trailCurveMidX: Number.isFinite(point.trailCurveMidX) ? point.trailCurveMidX + offsetX : point.trailCurveMidX,
            trailCurveMidY: Number.isFinite(point.trailCurveMidY) ? point.trailCurveMidY + offsetY : point.trailCurveMidY,
            trailCurveMidT: point.trailCurveMidT,
            trailCurveEndX: Number.isFinite(point.trailCurveEndX) ? point.trailCurveEndX + offsetX : point.trailCurveEndX,
            trailCurveEndY: Number.isFinite(point.trailCurveEndY) ? point.trailCurveEndY + offsetY : point.trailCurveEndY,
            trailTransformPlayerX: Number.isFinite(point.trailTransformPlayerX)
                ? point.trailTransformPlayerX
                : (Number.isFinite(point.playerX) ? point.playerX : fallbackX),
            trailTransformPlayerY: Number.isFinite(point.trailTransformPlayerY)
                ? point.trailTransformPlayerY
                : (Number.isFinite(point.playerY) ? point.playerY : fallbackY),
            trailIsRelative: false
        };
    };

    PlayerClass.prototype.buildFrozenSampledBezierSnapshot = function(stepNum, stepPoints, forceOffsetX = null, forceOffsetY = null, fallbackX = this.x, fallbackY = this.y) {
        if (!Array.isArray(stepPoints) || stepPoints.length < 2) return null;
        const lastPt = stepPoints[stepPoints.length - 1];
        const firstPt = stepPoints[0];
        const frozenPoints = stepPoints
            .map((point) => this.absolutizeRelativeTrailPoint(point, fallbackX, fallbackY, forceOffsetX, forceOffsetY))
            .filter(Boolean);
        const frozenCurvePoints = frozenPoints.map((point) => ({
            x: point.x,
            y: point.y,
            playerX: Number.isFinite(point.playerX) ? point.playerX : undefined,
            playerY: Number.isFinite(point.playerY) ? point.playerY : undefined,
            trailTransformPlayerX: Number.isFinite(point.trailTransformPlayerX) ? point.trailTransformPlayerX : undefined,
            trailTransformPlayerY: Number.isFinite(point.trailTransformPlayerY) ? point.trailTransformPlayerY : undefined,
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
            life: Math.max(1, lastPt.life || this.comboSlashTrailActiveLifeMs),
            rangeEffectScale: frozenPoints.reduce((max, p) => {
                const s = (p && Number.isFinite(p.trailRangeScale)) ? p.trailRangeScale : 1;
                return Math.max(max, s);
            }, 1)
        };
    };

    PlayerClass.prototype.ageSlashTrailFrozenCurves = function(frozenCurves, deltaMs) {
        if (!Array.isArray(frozenCurves) || deltaMs <= 0) return;
        for (let i = frozenCurves.length - 1; i >= 0; i--) {
            const fc = frozenCurves[i];
            fc.age = (fc.age || 0) + deltaMs;
            if (fc.oldestAge !== undefined) fc.oldestAge += deltaMs;
            if (['points', 'sampledBezier'].includes(fc.type)) {
                if (Array.isArray(fc.frozenPoints)) {
                    for (const p of fc.frozenPoints) {
                        p.age = (p.age || 0) + deltaMs;
                    }
                }
                if (Array.isArray(fc.frozenCurvePoints)) {
                    for (const p of fc.frozenCurvePoints) {
                        p.age = (p.age || 0) + deltaMs;
                    }
                }
            }
            if (fc.age >= fc.life) {
                frozenCurves.splice(i, 1);
            }
        }
    };

    PlayerClass.prototype.getSpecialCloneTrailBoxY = function(anchorY) {
        if (typeof this.getSpecialCloneFootY === 'function' && typeof this.getWorldHeight === 'function') {
            return this.getSpecialCloneFootY(anchorY) - this.getWorldHeight();
        }
        return typeof this.getSpecialCloneDrawY === 'function'
            ? this.getSpecialCloneDrawY(anchorY)
            : anchorY;
    };

    PlayerClass.prototype.freezeSpecialCloneSlashTrail = function(index, context = {}) {
        if (!Array.isArray(this.specialCloneSlashTrailPoints) || !Array.isArray(this.specialCloneSlashTrailPoints[index])) return;
        if (this.specialCloneSlashTrailPoints[index].length === 0) return;
        if (!Array.isArray(this.specialCloneSlashTrailFrozenCurves)) {
            this.specialCloneSlashTrailFrozenCurves = [];
        }
        if (!Array.isArray(this.specialCloneSlashTrailFrozenCurves[index])) {
            this.specialCloneSlashTrailFrozenCurves[index] = [];
        }
        const frozenCurves = this.specialCloneSlashTrailFrozenCurves[index];
        const frozenBefore = frozenCurves.length;
        const pos = context.pos || (Array.isArray(this.specialClonePositions) ? this.specialClonePositions[index] : null);
        const worldW = typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : PLAYER.WIDTH;
        const worldH = typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : PLAYER.HEIGHT;
        const footY = Number.isFinite(context.footY)
            ? context.footY
            : (pos && typeof this.getSpecialCloneFootY === 'function' ? this.getSpecialCloneFootY(pos.y) : (this.y + worldH));
        const ownerX = Number.isFinite(context.x)
            ? context.x
            : (pos ? pos.x - worldW * 0.5 : this.x);
        const ownerY = Number.isFinite(context.y)
            ? context.y
            : (Number.isFinite(footY) ? footY - worldH : this.y);
        const boostAnchors = Array.isArray(this.specialCloneSlashTrailBoostAnchors)
            ? this.specialCloneSlashTrailBoostAnchors[index]
            : null;
        this.freezeCurrentSlashTrail({
            points: this.specialCloneSlashTrailPoints[index],
            frozenCurves,
            boostAnchors: boostAnchors && typeof boostAnchors === 'object' ? boostAnchors : {},
            attack: context.attack || null,
            x: ownerX,
            y: ownerY,
            width: worldW,
            height: worldH,
            footY
        });
        const ageNewMs = Number.isFinite(context.ageNewMs) ? Math.max(0, context.ageNewMs) : 0;
        if (ageNewMs > 0 && frozenCurves.length > frozenBefore) {
            for (let i = frozenCurves.length - 1; i >= frozenBefore; i--) {
                const fc = frozenCurves[i];
                fc.age = (fc.age || 0) + ageNewMs;
                if (fc.oldestAge !== undefined) fc.oldestAge += ageNewMs;
                if (['points', 'sampledBezier'].includes(fc.type)) {
                    if (Array.isArray(fc.frozenPoints)) {
                        for (const p of fc.frozenPoints) p.age = (p.age || 0) + ageNewMs;
                    }
                    if (Array.isArray(fc.frozenCurvePoints)) {
                        for (const p of fc.frozenCurvePoints) p.age = (p.age || 0) + ageNewMs;
                    }
                }
                if (fc.age >= fc.life) {
                    frozenCurves.splice(i, 1);
                }
            }
        }
    };

    PlayerClass.prototype.pinSlashTrailPoints = function(points) {
        if (!Array.isArray(points) || points.length === 0) return;
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (!point || !point.trailIsRelative) continue;
            Object.assign(points[i], this.absolutizeRelativeTrailPoint(point));
        }
    };

    PlayerClass.prototype.freezeCurrentSlashTrail = function(options = {}) {
        const sourcePoints = Array.isArray(options.points) ? options.points : this.comboSlashTrailPoints;
        const frozenCurves = Array.isArray(options.frozenCurves) ? options.frozenCurves : this.comboSlashTrailFrozenCurves;
        if (!Array.isArray(sourcePoints) || sourcePoints.length === 0 || !Array.isArray(frozenCurves)) return;
        const ownerX = Number.isFinite(options.x) ? options.x : this.x;
        const ownerY = Number.isFinite(options.y) ? options.y : this.y;
        const ownerW = Number.isFinite(options.width) ? options.width : this.getWorldWidth();
        const ownerH = Number.isFinite(options.height) ? options.height : this.getWorldHeight();
        const physicalScale = Number.isFinite(options.physicalScale)
            ? options.physicalScale
            : Math.max(1, Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1);
        const attackForProgress = options.attack || this.currentAttack;
        const boostAnchors = options.boostAnchors || this.comboSlashTrailBoostAnchors || {};
        
        // メインバッファ内の軌跡を段ごとにグループ化
        const stepGroups = new Map();
        for (let i = 0; i < sourcePoints.length; i++) {
            const point = sourcePoints[i];
            const step = point.step;
            if (typeof step !== 'number' || step < 1 || step > 5) continue;
            if (!stepGroups.has(step)) stepGroups.set(step, []);
            stepGroups.get(step).push(point);
        }
        
        const frozenTrailCenterX = ownerX + ownerW * 0.5;
        const frozenTrailCenterY = ownerY + ownerH * 0.5;
        const resolveFrozenBezierProgress = (stepNum, lastPt) => {
            const pointProgress = Number.isFinite(lastPt?.progress) ? lastPt.progress : 1.0;
            if (stepNum !== 5) return pointProgress;

            const attack = attackForProgress;
            if (attack && attack.comboStep === 5) {
                if (Number.isFinite(attack._trailFrozenProgress)) {
                    return attack._trailFrozenProgress;
                }
                if (Number.isFinite(attack._trailRenderProgress)) {
                    return attack._trailRenderProgress;
                }
                if (typeof this.getAttackMotionProgress === 'function') {
                    const duration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
                    const rawProgress = Number.isFinite(attack.motionElapsedMs)
                        ? Math.max(0, Math.min(1, attack.motionElapsedMs / duration))
                        : Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
                    const renderProgress = this.getAttackMotionProgress(attack, rawProgress);
                    if (Number.isFinite(renderProgress)) return renderProgress;
                }
            }
            return pointProgress;
        };
        for (const [stepNum, stepPoints] of stepGroups) {
            const lastPt = stepPoints[stepPoints.length - 1];
            const stripTrailId = lastPt?.trailAttackId || stepNum;
            const frozenBoostAnchor = (boostAnchors && boostAnchors[stripTrailId])
                ? { ...boostAnchors[stripTrailId] }
                : null;
            const forceOffsetX = frozenBoostAnchor ? frozenBoostAnchor.baseCenterX - ownerW * 0.5 : null;
            const forceOffsetY = frozenBoostAnchor ? frozenBoostAnchor.baseCenterY - ownerH * 0.5 : null;
            // 凍結時の剣筋幅スケール（大凪）をスナップショットへ焼き込む。描画側の
            // visualWidthScale は「次の攻撃中は 1.0」へ落ちるため、凍結後の太さは
            // この保存値で固定する（凍結後に通常幅へ細るのを防ぐ）。
            const frozenTrailWidthScale = stepPoints.reduce((max, p) => {
                const s = (p && Number.isFinite(p.trailScale)) ? p.trailScale : 1;
                return Math.max(max, s);
            }, 1);
            const frozenRangeEffectScale = stepPoints.reduce((max, p) => {
                const s = (p && Number.isFinite(p.trailRangeScale)) ? p.trailRangeScale : 1;
                return Math.max(max, s);
            }, 1);

            if ([1, 2, 5].includes(stepNum)) {
                // ベジェ曲線段: 最新のサンプリング点のカーブをそのまま保存する。
                // step5はライブ中の完成カーブを固定し、接地終盤のごく小さいズレだけを
                // 確定時にスナップするため、凍結スナップショットも最終ライブフレームと同一形状になる。
                const lastPt = stepPoints.length > 0 ? stepPoints[stepPoints.length - 1] : null;
                const firstPt = stepPoints.length > 0 ? stepPoints[0] : null;
                if (lastPt && Number.isFinite(lastPt.trailCurveStartX)) {
                    frozenCurves.push({
                        type: 'bezier',
                        step: stepNum,
                        trailCurveStartX: lastPt.trailCurveStartX,
                        trailCurveStartY: lastPt.trailCurveStartY,
                        trailCurveControlX: lastPt.trailCurveControlX,
                        trailCurveControlY: lastPt.trailCurveControlY,
                        trailCurveMidX: lastPt.trailCurveMidX,
                        trailCurveMidY: lastPt.trailCurveMidY,
                        trailCurveMidT: lastPt.trailCurveMidT,
                        trailCurveEndX: lastPt.trailCurveEndX,
                        trailCurveEndY: lastPt.trailCurveEndY,
                        trailRadius: lastPt.trailRadius,
                        centerX: lastPt.centerX,
                        centerY: lastPt.centerY,
                        dir: lastPt.dir,
                        progress: resolveFrozenBezierProgress(stepNum, lastPt), // 実描画と同じ進行度で凍結させる
                        trailIsRelative: stepNum === 5 ? false : !!lastPt.trailIsRelative,
                        playerX: Number.isFinite(forceOffsetX)
                            ? forceOffsetX
                            : (Number.isFinite(lastPt.trailTransformPlayerX)
                                ? lastPt.trailTransformPlayerX
                                : (Number.isFinite(lastPt.playerX) ? lastPt.playerX : ownerX)),
                        playerY: Number.isFinite(forceOffsetY)
                            ? forceOffsetY
                            : (Number.isFinite(lastPt.trailTransformPlayerY)
                                ? lastPt.trailTransformPlayerY
                                : (Number.isFinite(lastPt.playerY) ? lastPt.playerY : ownerY)),
                        trailTransformPlayerX: Number.isFinite(forceOffsetX)
                            ? forceOffsetX
                            : (Number.isFinite(lastPt.trailTransformPlayerX)
                                ? lastPt.trailTransformPlayerX
                                : (Number.isFinite(lastPt.playerX) ? lastPt.playerX : ownerX)),
                        trailTransformPlayerY: Number.isFinite(forceOffsetY)
                            ? forceOffsetY
                            : (Number.isFinite(lastPt.trailTransformPlayerY)
                                ? lastPt.trailTransformPlayerY
                                : (Number.isFinite(lastPt.playerY) ? lastPt.playerY : ownerY)),
                        age: Math.max(0, lastPt.age || 0), // 新しい（剣先の）フェードアウト度合い
                        oldestAge: Math.max(0, firstPt ? firstPt.age : (lastPt.age || 0)), // 古い（根本の）フェードアウト度合い
                        life: Math.max(1, lastPt.life || this.comboSlashTrailActiveLifeMs),
                        trailCurveFrozen: true,
                        boostAnchor: frozenBoostAnchor,
                        frozenTrailCenterX: frozenTrailCenterX,
                        frozenTrailCenterY: frozenTrailCenterY,
                        trailWidthScale: frozenTrailWidthScale,
                        rangeEffectScale: frozenRangeEffectScale
                    });
                }
            } else {
                // リニア/アーク段(3, 4など): ポイント配列を保存
                if (stepPoints.length >= 2) {
                    const lastPt = stepPoints[stepPoints.length - 1];
                    const firstPt = stepPoints[0];
                    const footY = Number.isFinite(options.footY)
                        ? options.footY
                        : (this.getFootY ? this.getFootY() : (ownerY + ownerH));
                    const step3FrozenTipOverride = (() => {
                        if (
                            stepNum !== 3 ||
                            !attackForProgress ||
                            attackForProgress.comboStep !== 3 ||
                            typeof this.getRenderedComboStep3TipForTrail !== 'function'
                        ) {
                            return null;
                        }
                        const tip = this.getRenderedComboStep3TipForTrail(lastPt, {
                            preferComputedTip: true,
                            attackState: {
                                currentAttack: attackForProgress,
                                attackTimer: this.attackTimer,
                                x: ownerX,
                                y: ownerY,
                                width: ownerW,
                                height: ownerH,
                                facingRight: this.facingRight,
                                isCrouching: this.isCrouching
                            }
                        });
                        if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) return null;
                        // fallback時も切先ちょうどで止める。ここでleadを足すと凍結瞬間に切先を追い抜く。
                        // step3 の凍結描画は projFn=null(位置投影なし・太さのみブースト)で行うため、
                        // ベイクする切先はワールド座標のまま返す(boostAnchor 逆投影はしない)。
                        // 逆投影すると始点(ワールド)と終点(逆投影)が別空間になり線が壊れる。
                        return { x: tip.x, y: tip.y };
                    })();
                    const frozenPoints = stepPoints
                        .map((p) => {
                            const frozen = this.absolutizeRelativeTrailPoint(
                                p,
                                ownerX,
                                ownerY,
                                forceOffsetX,
                                forceOffsetY
                            );
                            if (!frozen) return null;
                            frozen.age = p.age || 0;
                            frozen.trailTransformPlayerX = Number.isFinite(p.trailTransformPlayerX)
                                ? p.trailTransformPlayerX
                                : (Number.isFinite(p.playerX)
                                    ? p.playerX
                                    : (Number.isFinite(forceOffsetX) ? forceOffsetX : ownerX));
                            frozen.trailTransformPlayerY = Number.isFinite(p.trailTransformPlayerY)
                                ? p.trailTransformPlayerY
                                : (Number.isFinite(p.playerY)
                                    ? p.playerY
                                    : (Number.isFinite(forceOffsetY) ? forceOffsetY : ownerY));
                            return frozen;
                        })
                        .filter(Boolean);
                    // ライブ最終フレームの描画線(始点・終点)を記録済みなら、それをそのまま焼き込む。
                    // これで凍結が「最後に見えていた剣筋」と完全一致し、最終フレームで短く/上にズレて
                    // 刀身から離れる(途切れる)現象を無くす。記録が無い/別攻撃の場合のみ切先再計算へフォールバック。
                    const liveDraw = this._step3LiveDraw;
                    const liveDrawMatches = !!(
                        liveDraw &&
                        Number.isFinite(liveDraw.endX) &&
                        Number.isFinite(liveDraw.startX) &&
                        lastPt &&
                        (liveDraw.trailAttackId == null ||
                            !Number.isFinite(lastPt.trailAttackId) ||
                            liveDraw.trailAttackId === lastPt.trailAttackId)
                    );
                    if ((liveDrawMatches || step3FrozenTipOverride) && frozenPoints.length > 0) {
                        const frozenLast = frozenPoints[frozenPoints.length - 1];
                        // 始点はライブ最終フレームの固定始点（水平な線の根本）をそのまま使う。
                        if (liveDrawMatches) {
                            frozenLast.trailCurveStartX = liveDraw.startX;
                            frozenLast.trailCurveStartY = liveDraw.startY;
                        }
                        // 振り切り(最後のライブ)時に記録した「最終の切先の高さで水平・切先Xまで」の剣筋を
                        // そのまま焼き込む。凍結時点の現在切先(step3FrozenTipOverride)はリカバリーで刀身が
                        // 斜め下へ戻った後の値なので使わない(高さ・角度がズレる原因)。
                        // liveDraw は forceHorizontalToTip により startY===endY(=固定Y)で完全水平。
                        const endX = liveDrawMatches ? liveDraw.endX : (step3FrozenTipOverride ? step3FrozenTipOverride.x : null);
                        const endY = liveDrawMatches ? liveDraw.endY : (step3FrozenTipOverride ? step3FrozenTipOverride.y : null);
                        if (Number.isFinite(endX) && Number.isFinite(endY)) {
                            frozenLast.trailCurveEndX = endX;
                            frozenLast.trailCurveEndY = endY;
                            frozenLast.x = endX;
                            frozenLast.y = endY;
                            frozenLast.progress = 1.0;
                        }
                    }
                    if (frozenPoints.length < 2) continue;
                    frozenCurves.push({
                        type: 'points',
                        step: stepNum,
                        // メインバッファでの年齢を引き継ぐ
                        frozenPoints,
                        frozenFootY: footY,
                        trailIsRelative: false,
                        age: Math.max(0, lastPt.age || 0), // 新しい（剣先の）フェードアウト度合い
                        oldestAge: Math.max(0, firstPt.age || 0), // 古い（根本の）フェードアウト度合い
                        life: Math.max(1, lastPt.life || this.comboSlashTrailActiveLifeMs),
                        boostAnchor: frozenBoostAnchor,
                        frozenTrailCenterX: frozenTrailCenterX,
                        frozenTrailCenterY: frozenTrailCenterY,
                        trailWidthScale: frozenTrailWidthScale,
                        rangeEffectScale: frozenRangeEffectScale
                    });
                }
            }
        }
        
        // 全ての過去の軌跡を凍結スナップショットに移管したため、メインバッファを完全に消去する（追従バグの根絶）
        sourcePoints.length = 0;
    };

    PlayerClass.prototype.getComboAttackProfileByStep = function(step) {
        const clampedStep = Math.max(1, Math.min(COMBO_ATTACKS.length, Math.floor(step) || 1));
        const comboProfile = COMBO_ATTACKS[clampedStep - 1] || COMBO_ATTACKS[0];
        return this.buildAttackProfile(comboProfile, { comboStep: clampedStep, source: 'main' });
    };

    PlayerClass.prototype.getComboPoseDimensions = function(state = {}) {
        const useShogunBasePose = this.characterType === 'shogun';
        if (useShogunBasePose) {
            // 将軍は描画側で拡大するため、剣筋の姿勢計算は忍者と同じ基準寸法で行う。
            return { width: PLAYER.WIDTH, height: PLAYER.HEIGHT };
        }
        return {
            width: Number.isFinite(state.width)
                ? state.width
                : this.getWorldWidth(),
            height: Number.isFinite(state.height)
                ? state.height
                : this.getWorldHeight()
        };
    };

    PlayerClass.prototype.getComboSwordPoseReference = function(step, rawProgress = 1, state = {}, options = {}) {
        const attack = this.getComboAttackProfileByStep(step);
        const durationMs = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const clampedProgress = Math.max(0, Math.min(1, rawProgress));
        const poseDims = this.getComboPoseDimensions(state);
        if (step === 4) {
            attack.motionElapsedMs = durationMs * clampedProgress;
        }
        return this.getComboSwordPoseState(
            {
                x: state.x !== undefined ? state.x : this.x,
                y: state.y !== undefined ? state.y : this.y,
                width: poseDims.width,
                height: poseDims.height,
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

    PlayerClass.prototype.syncComboAttackRuntimeFields = function(target, source) {
        if (!target || !source) return target;
        if (Number.isFinite(source.trailAttackId)) {
            target.trailAttackId = source.trailAttackId;
        }
        if (Number.isFinite(source.motionElapsedMs)) {
            target.motionElapsedMs = source.motionElapsedMs;
        }
        if (Number.isFinite(source.durationMs)) {
            target.durationMs = source.durationMs;
        }
        if (Number.isFinite(source.chainWindowMs)) {
            target.chainWindowMs = source.chainWindowMs;
        }
        return target;
    };

    PlayerClass.prototype.getComboTrailBaseState = function(state = {}) {
        const poseDims = this.getComboPoseDimensions(state);
        return {
            x: state.x !== undefined ? state.x : this.x,
            y: state.y !== undefined ? state.y : this.y,
            width: poseDims.width,
            height: poseDims.height,
            facingRight: state.facingRight !== undefined ? state.facingRight : this.facingRight,
            isCrouching: state.isCrouching !== undefined ? state.isCrouching : this.isCrouching,
            isGrounded: state.isGrounded !== undefined ? state.isGrounded : this.isGrounded,
            groundY: Number.isFinite(state.groundY) ? state.groundY : this.groundY,
            renderScale: Number.isFinite(state.renderScale) ? state.renderScale : (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1),
            scaleMultiplier: Number.isFinite(state.scaleMultiplier) ? state.scaleMultiplier : (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1),
            vx: Number.isFinite(state.vx) ? state.vx : this.vx,
            vy: Number.isFinite(state.vy) ? state.vy : this.vy,
            speed: Number.isFinite(state.speed) ? state.speed : this.speed
        };
    };

    PlayerClass.prototype.resolveComboStep1TrailEndWorldPoint = function(baseState = {}) {
        const step1Profile = this.getComboAttackProfileByStep(1);
        const step1TrailSpec = this.buildComboStep1TrailSpec({
            ...baseState,
            x: 0,
            y: 0,
            attack: step1Profile
        });
        if (
            step1TrailSpec &&
            Number.isFinite(step1TrailSpec.trailCurveEndX) &&
            Number.isFinite(step1TrailSpec.trailCurveEndY)
        ) {
            return {
                x: baseState.x + step1TrailSpec.trailCurveEndX,
                y: baseState.y + step1TrailSpec.trailCurveEndY
            };
        }
        const step1EndPose = this.getComboSwordPoseReference(1, 1.0, {
            ...baseState,
            x: baseState.x,
            y: baseState.y
        });
        return step1EndPose
            ? { x: step1EndPose.trailTipX, y: step1EndPose.trailTipY }
            : null;
    };

    PlayerClass.prototype.resolveComboStep2TrailEndWorldPoint = function(state = {}, baseState = null) {
        const resolvedBaseState = baseState || this.getComboTrailBaseState(state);
        const runtimePoint = this.resolveComboTrailStepEndWorldPoint(2, state, {
            trimEnd: true,
            trimFactor: 0.5
        });
        if (runtimePoint) return runtimePoint;

        const step2Profile = this.getComboAttackProfileByStep(2);
        const step2TrailSpec = this.buildComboStep2TrailSpec(
            {
                ...resolvedBaseState,
                attack: step2Profile
            },
            {
                fixedStartPoint: this.resolveComboStep1TrailEndWorldPoint(resolvedBaseState)
            }
        );
        if (
            !step2TrailSpec ||
            !Number.isFinite(step2TrailSpec.trailCurveEndX) ||
            !Number.isFinite(step2TrailSpec.trailCurveEndY)
        ) {
            return null;
        }

        const poseLike = {
            ...step2TrailSpec,
            comboStep: 2,
            attack: step2Profile,
            tipX: step2TrailSpec.trailCurveEndX,
            tipY: step2TrailSpec.trailCurveEndY,
            trailTipX: step2TrailSpec.trailCurveEndX,
            trailTipY: step2TrailSpec.trailCurveEndY,
            trailIsRelative: false
        };
        const projectedPose = (
            this.characterType === 'shogun' &&
            typeof this._projectShogunTrailPoseToWorldScale === 'function'
        )
            ? this._projectShogunTrailPoseToWorldScale(poseLike, {
                ...resolvedBaseState,
                isAttacking: true,
                currentAttack: step2Profile,
                attackTimer: 0
            })
            : poseLike;
        const physicalScale = Math.max(1, Number.isFinite(resolvedBaseState.scaleMultiplier)
            ? resolvedBaseState.scaleMultiplier
            : 1);
        return this.resolveBezierTrailDrawEndPoint(projectedPose, {
            trimEnd: true,
            trimFactor: 0.5,
            baseWidth: 13.8 * physicalScale
        });
    };

    PlayerClass.prototype.resolveComboStep3TrailEndWorldPoint = function(state = {}, baseState = null) {
        const resolvedBaseState = baseState || this.getComboTrailBaseState(state);
        const runtimePoint = this.resolveComboTrailStepEndWorldPoint(3, state, {
            trimEnd: false
        });
        if (runtimePoint) return runtimePoint;

        const step3Profile = this.getComboAttackProfileByStep(3);
        const step3TrailSpec = this.buildComboStep3TrailSpec(
            {
                ...resolvedBaseState,
                attack: step3Profile
            },
            {
                fixedStartPoint: this.resolveComboStep2TrailEndWorldPoint(state, resolvedBaseState)
            }
        );
        if (
            step3TrailSpec &&
            Number.isFinite(step3TrailSpec.trailCurveEndX) &&
            Number.isFinite(step3TrailSpec.trailCurveEndY)
        ) {
            return {
                x: step3TrailSpec.trailCurveEndX,
                y: step3TrailSpec.trailCurveEndY
            };
        }
        return null;
    };

    PlayerClass.prototype.resolveComboStep4TrailStartConnection = function(state = {}, baseState = null) {
        const resolvedBaseState = baseState || this.getComboTrailBaseState(state);
        const worldPoint = this.resolveComboStep3TrailEndWorldPoint(state, resolvedBaseState);

        const rawStep3EndPose = this.getComboSwordPoseReference(3, 1.0, {
            ...resolvedBaseState,
            x: resolvedBaseState.x,
            y: resolvedBaseState.y
        });
        const step3EndPose = this.applyShogunStep3ReachToTrailPose(rawStep3EndPose);
        let fixedStartPoint = step3EndPose
            ? { x: step3EndPose.trailTipX, y: step3EndPose.trailTipY }
            : null;

        if (worldPoint) {
            fixedStartPoint = (
                this.characterType === 'shogun' &&
                typeof this.inverseProjectShogunComboTrailPoint === 'function'
            )
                ? this.inverseProjectShogunComboTrailPoint(worldPoint, resolvedBaseState, {
                    relative: false,
                    anchorX: resolvedBaseState.x,
                    anchorY: resolvedBaseState.y
                })
                : worldPoint;
        }

        return {
            fixedStartPoint,
            worldPoint
        };
    };

    PlayerClass.prototype.applyComboTrailSpecToAttackProfile = function(attackProfile, state = {}) {
        if (!attackProfile || !attackProfile.comboStep) return attackProfile;
        const baseState = this.getComboTrailBaseState(state);

        if (attackProfile.comboStep === 1) {
            const step1TrailSpec = this.buildComboStep1TrailSpec(
                {
                    ...baseState,
                    x: 0,
                    y: 0,
                    attack: attackProfile
                }
            );
            if (step1TrailSpec) {
                Object.assign(attackProfile, step1TrailSpec);
                attackProfile.trailIsRelative = true;
            }
        } else if (attackProfile.comboStep === 2) {
            const step2TrailSpec = this.buildComboStep2TrailSpec(
                {
                    ...baseState,
                    attack: attackProfile
                },
                {
                    fixedStartPoint: this.resolveComboStep1TrailEndWorldPoint(baseState)
                }
            );
            if (step2TrailSpec) {
                Object.assign(attackProfile, step2TrailSpec);
            }
        } else if (attackProfile.comboStep === 3) {
            const step3TrailSpec = this.buildComboStep3TrailSpec(
                {
                    ...baseState,
                    attack: attackProfile
                },
                {
                    fixedStartPoint: this.resolveComboStep2TrailEndWorldPoint(state, baseState)
                }
            );
            if (step3TrailSpec) {
                Object.assign(attackProfile, step3TrailSpec);
            }
        } else if (attackProfile.comboStep === 4) {
            const step4Connection = this.resolveComboStep4TrailStartConnection(state, baseState);
            const step4TrailArc = this.buildComboStep4TrailArcSpec(
                {
                    ...baseState,
                    attack: attackProfile
                },
                {
                    fixedStartPoint: step4Connection.fixedStartPoint
                }
            );
            if (step4TrailArc) {
                Object.assign(attackProfile, step4TrailArc);
                if (step4Connection.worldPoint) {
                    attackProfile.fixedStartWorldPoint = step4Connection.worldPoint;
                }
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
            this.syncComboAttackRuntimeFields(cached, this.currentAttack);
            return cached;
        }
        const isShogunClone = this.characterType === 'shogun';
        const poseWidth = isShogunClone ? PLAYER.WIDTH : this.getWorldWidth();
        const poseHeight = isShogunClone ? PLAYER.HEIGHT : this.getWorldHeight();
        const livePoseOriginX = isShogunClone
            ? pos.x - this.getWorldWidth() * 0.5
            : pos.x - poseWidth * 0.5;
        const livePoseOriginY = isShogunClone
            ? this.getSpecialCloneTrailBoxY(pos.y)
            : cloneDrawY;
        let poseOriginX = livePoseOriginX;
        let poseOriginY = livePoseOriginY;
        const sampleState = this.comboSlashTrailSampleState;
        if (
            sampleState &&
            sampleState.trailAttackId === activeTrailId &&
            Number.isFinite(sampleState.x) &&
            Number.isFinite(this.x)
        ) {
            poseOriginX -= (this.x - sampleState.x);
        }
        if (
            sampleState &&
            sampleState.trailAttackId === activeTrailId &&
            Number.isFinite(sampleState.y) &&
            Number.isFinite(this.y)
        ) {
            poseOriginY -= (this.y - sampleState.y);
        }
        // ミラー分身の通常剣筋は、分身自身のワールド箱を投影アンカーにする。
        // 本体の trailTransformPlayerY を step4 に流用すると、縦剣筋だけ本体基準へ数px寄る。
        const shouldUseBodyAnchorY = this.currentAttack.comboStep === 5;
        if (
            shouldUseBodyAnchorY &&
            Number.isFinite(this.currentAttack.trailTransformPlayerY)
        ) {
            poseOriginY = this.currentAttack.trailTransformPlayerY;
        }
        const profile = this.applyComboTrailSpecToAttackProfile(
            this.getComboAttackProfileByStep(this.currentAttack.comboStep || 1),
            {
                x: poseOriginX,
                y: poseOriginY,
                width: poseWidth,
                height: poseHeight,
                facingRight: pos.facingRight,
                isCrouching: false,
                isGrounded: this.isGrounded,
                groundY: this.groundY,
                renderScale: this.scaleMultiplier,
                scaleMultiplier: this.scaleMultiplier,
                vx: this.vx,
                vy: this.vy,
                speed: this.speed,
                trailPoints: Array.isArray(this.specialCloneSlashTrailPoints)
                    ? this.specialCloneSlashTrailPoints[index]
                    : null
            }
        );
        this.syncComboAttackRuntimeFields(profile, this.currentAttack);
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
                // 五段: 頭上構え -> 急降下で伸び切り、着地余韻で長さを後追いさせない
                if (p < 0.26) return lerp(0, 0.16, smooth(p / 0.26));
                if (p < 0.72) return lerp(0.16, 1.0, smooth((p - 0.26) / 0.46));
                return 1.0;
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
        const result = this.getComboSwordPoseForTrailState(baseState);

        // 将軍: ninja座標系(48x72基準)→ワールドスケール座標(×scaleMultiplier)へ変換。
        // これにより過去のサンプル点がワールド座標で保存され、プレイヤーが移動しても
        // 剣筋が画面上で固定される（忍者と同じ挙動）。
        if (result && this.characterType === 'shogun') {
            const projResult = this._projectShogunTrailPoseToWorldScale(result, baseState);
            if (projResult) return projResult;
        }

        return result;
    };

    PlayerClass.prototype.resolveNormalComboStep5TrailSync = function(activeAttack, state = {}, options = {}) {
        if (
            !activeAttack ||
            activeAttack.comboStep !== 5 ||
            activeAttack.trailCurveFrozen === true ||
            typeof this.getComboSwordPoseState !== 'function'
        ) {
            return { actualTipSpec: null, renderProgress: null };
        }

        const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const attackTimer = Number.isFinite(state.attackTimer) ? state.attackTimer : this.attackTimer;
        let rawRenderProgress = null;
        let renderProgress = null;
        if (typeof this.getAttackMotionProgress === 'function') {
            rawRenderProgress = Number.isFinite(activeAttack.motionElapsedMs)
                ? Math.max(0, Math.min(1, activeAttack.motionElapsedMs / duration))
                : Math.max(0, Math.min(1, 1 - (attackTimer / duration)));
            renderProgress = this.getAttackMotionProgress(activeAttack, rawRenderProgress);
        }

        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const deltaMs = Number.isFinite(options.deltaMs) ? options.deltaMs : 0;
        const livePose = this.getComboSwordPoseState({
            x,
            y,
            width: Number.isFinite(state.width) ? state.width : undefined,
            height: Number.isFinite(state.height) ? state.height : undefined,
            facingRight: state.facingRight !== undefined ? state.facingRight : this.facingRight,
            isCrouching: state.isCrouching !== undefined ? state.isCrouching : this.isCrouching,
            attackTimer: Math.max(0, attackTimer - deltaMs),
            currentAttack: activeAttack,
            recoveryBlend: 0
        }, {});
        if (!livePose || !Number.isFinite(livePose.trailTipX) || !Number.isFinite(livePose.trailTipY)) {
            return { actualTipSpec: null, renderProgress };
        }

        let tipSpecX = livePose.trailTipX;
        let tipSpecY = livePose.trailTipY;
        if (
            this.characterType === 'shogun' &&
            typeof this.getShogunRenderedComboTipWorld === 'function' &&
            typeof this.inverseProjectShogunComboTrailPoint === 'function' &&
            Number.isFinite(rawRenderProgress)
        ) {
            const renderedTip = this.getShogunRenderedComboTipWorld({
                ...state,
                x,
                y,
                width: typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : state.width,
                height: typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : state.height,
                currentAttack: activeAttack,
                attackTimer: duration * (1 - rawRenderProgress),
                recoveryBlend: 0
            }, rawRenderProgress);
            const specTip = this.inverseProjectShogunComboTrailPoint(renderedTip, {
                ...state,
                x,
                y
            }, {
                relative: false,
                anchorX: x,
                anchorY: y
            });
            if (specTip && Number.isFinite(specTip.x) && Number.isFinite(specTip.y)) {
                tipSpecX = specTip.x;
                tipSpecY = specTip.y;
            }
        }

        const tipScaleMult = (this.characterType === 'shogun' && Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0)
            ? this.scaleMultiplier
            : 1;
        if (
            tipScaleMult > 1.001 &&
            Number.isFinite(activeAttack.trailTransformPlayerX) &&
            Number.isFinite(activeAttack.trailTransformPlayerY)
        ) {
            const bodyDx = x - activeAttack.trailTransformPlayerX;
            const bodyDy = y - activeAttack.trailTransformPlayerY;
            tipSpecX -= bodyDx * (1 - 1 / tipScaleMult);
            tipSpecY -= bodyDy * (1 - 1 / tipScaleMult);
        }

        let cappedRenderProgress = renderProgress;
        if (
            Number.isFinite(renderProgress) &&
            renderProgress < 0.999 &&
            Number.isFinite(activeAttack.trailCurveStartX) &&
            Number.isFinite(activeAttack.trailCurveStartY) &&
            Number.isFinite(activeAttack.trailCurveEndX) &&
            Number.isFinite(activeAttack.trailCurveEndY) &&
            Number.isFinite(tipSpecX)
        ) {
            let drawEndX = activeAttack.trailCurveEndX;
            let drawEndY = activeAttack.trailCurveEndY;
            const trimControls = getComboStep5ArcControls(
                activeAttack.trailCurveStartX,
                activeAttack.trailCurveStartY,
                drawEndX,
                drawEndY
            );
            if (trimControls) {
                const tangentX = drawEndX - trimControls.c2.x;
                const tangentY = drawEndY - trimControls.c2.y;
                const tangentLen = Math.hypot(tangentX, tangentY);
                if (tangentLen > 0.001) {
                    const trim = Math.min(13.8 * getComboStep5EndTrimFactor(1), tangentLen * 0.9);
                    drawEndX -= (tangentX / tangentLen) * trim;
                    drawEndY -= (tangentY / tangentLen) * trim;
                }
            }
            const trailWindow = this.getComboTrailProgressWindow(5);
            const growth = renderProgress <= trailWindow.start
                ? 0
                : (renderProgress >= trailWindow.end
                    ? 1
                    : Math.max(0, Math.min(1, (renderProgress - trailWindow.start) / Math.max(0.001, trailWindow.end - trailWindow.start))));
            const capped = getComboStep5CappedProgress({
                startX: activeAttack.trailCurveStartX,
                startY: activeAttack.trailCurveStartY,
                endX: drawEndX,
                endY: drawEndY,
                growth,
                growthWindow: trailWindow,
                tipX: tipSpecX,
                tipY: tipSpecY,
                dirSign: state.facingRight === false ? -1 : 1,
                baseWidth: 13.8
            });
            if (Number.isFinite(capped.progress)) {
                cappedRenderProgress = Math.min(renderProgress, capped.progress);
                activeAttack._trailRenderProgress = cappedRenderProgress;
            }
        }

        return {
            actualTipSpec: { x: tipSpecX, y: tipSpecY },
            renderProgress: cappedRenderProgress
        };
    };

    /**
     * 将軍の剣筋ポーズ座標を ninja 座標系からワールドスケール座標へ変換する。
     * サンプリング時に一度だけ呼び出し、結果をトレイルバッファへ保存する。
     * @param {Object} pose - getComboSwordPoseForTrailState の戻り値
     * @param {Object} baseState - {x, y, ...} プレイヤーの現在状態
     * @returns {Object} ワールド座標に変換されたポーズ
     */
    // 剣筋の「正規化ポーズ空間(ninja 48x72)→ワールドスケール」投影に使うピボットの単一定義。
    // _projectShogunTrailPoseToWorldScale / buildComboStep5TrailSpec の床逆変換 /
    // projectComboTrailSpecPointToWorld のすべてがこれを使い、式の二重管理を避ける。
    PlayerClass.prototype._getComboTrailProjectionPivots = function(anchorX, anchorY, scale) {
        const worldW = PLAYER.WIDTH * scale;
        const worldH = PLAYER.HEIGHT * scale;
        const footOffset = (typeof this._getCloneFootOffset === 'function')
            ? this._getCloneFootOffset()
            : (PLAYER.HEIGHT - SHOGUN_ACTOR_BASE_HEIGHT * 0.62) * scale;
        // renderModel 内では素体(40x60)を canvas scale×2.0 で拡大するため:
        //   actorRenderDY = worldH - footOffset - SHOGUN_ACTOR_BASE_HEIGHT * 0.62 (= 13.2 @scale2)
        const actorRenderDY = worldH - footOffset - SHOGUN_ACTOR_BASE_HEIGHT * 0.62;
        // renderPivotY は renderModel の実際の拡大ピボット
        // (actorRenderY + 素体高さ*0.62) と「同じ写像」になるよう合わせる。
        // ninja空間のランドマーク L に対し renderModel は
        //   world = anchorY + actorRenderDY + base062 + (L - base062) * scale
        // を描くため、basePivot(=ninja062)基準の投影では
        //   renderPivotY = anchorY + actorRenderDY + base062 + (ninja062 - base062) * scale
        // が等価条件。旧式(actorRenderDY + ninja062)は scale=2 で 7.44px 上へずれ、
        // step5 終端が刀の切っ先からオーバーする原因だった。
        const base062 = SHOGUN_ACTOR_BASE_HEIGHT * 0.62;
        const ninja062 = PLAYER.HEIGHT * 0.62;
        return {
            basePivotX: anchorX + PLAYER.WIDTH * 0.5,
            basePivotY: anchorY + ninja062,
            renderPivotX: anchorX + worldW * 0.5,
            renderPivotY: anchorY + actorRenderDY + base062 + (ninja062 - base062) * scale
        };
    };

    PlayerClass.prototype.getShogunRenderedComboTipWorld = function(state = {}, rawProgressOverride = null) {
        const attack = state.currentAttack || this.currentAttack;
        const scale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        if (
            this.characterType !== 'shogun' ||
            !attack ||
            !attack.comboStep ||
            scale <= 1.001
        ) {
            return null;
        }

        const worldX = state.x !== undefined ? state.x : this.x;
        const worldY = state.y !== undefined ? state.y : this.y;
        const worldW = Number.isFinite(state.width) ? state.width : this.getWorldWidth();
        const worldH = Number.isFinite(state.height) ? state.height : this.getWorldHeight();
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const durationMs = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const rawProgress = Number.isFinite(rawProgressOverride)
            ? Math.max(0, Math.min(1, rawProgressOverride))
            : Math.max(0, Math.min(1, 1 - ((Number.isFinite(state.attackTimer) ? state.attackTimer : this.attackTimer) / durationMs)));
        const attackTimer = durationMs * (1 - rawProgress);

        const footOffset = typeof this._getCloneFootOffset === 'function'
            ? this._getCloneFootOffset()
            : worldH * 0.58;
        const actorRenderX = worldX + (worldW - SHOGUN_ACTOR_BASE_WIDTH) * 0.5;
        const actorRenderY = worldY + worldH - footOffset - SHOGUN_ACTOR_BASE_HEIGHT * 0.62;
        const renderX = actorRenderX + (SHOGUN_ACTOR_BASE_WIDTH - PLAYER.WIDTH) * 0.5;
        const renderY = actorRenderY;
        const pose = this.getComboSwordPoseState({
            x: renderX,
            y: renderY,
            width: PLAYER.WIDTH,
            height: PLAYER.HEIGHT,
            facingRight,
            isCrouching,
            attackTimer,
            currentAttack: attack,
            recoveryBlend: Number.isFinite(state.recoveryBlend) ? state.recoveryBlend : 0
        });
        if (!pose) return null;

        let armEndX = pose.armEndX;
        let armEndY = pose.armEndY;
        if (
            Number.isFinite(armEndX) &&
            Number.isFinite(armEndY) &&
            Number.isFinite(pose.activeLeftShoulderX) &&
            Number.isFinite(pose.activeLeftShoulderY)
        ) {
            armEndX = pose.activeLeftShoulderX + (armEndX - pose.activeLeftShoulderX) * SHOGUN_ARM_REACH_SCALE;
            armEndY = pose.activeLeftShoulderY + (armEndY - pose.activeLeftShoulderY) * SHOGUN_ARM_REACH_SCALE;
            const maxReach = (13.6 + 13.2) * SHOGUN_ARM_REACH_SCALE;
            const dx = armEndX - pose.activeLeftShoulderX;
            const dy = armEndY - pose.activeLeftShoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist > maxReach && dist > 0.0001) {
                const ratio = maxReach / dist;
                armEndX = pose.activeLeftShoulderX + dx * ratio;
                armEndY = pose.activeLeftShoulderY + dy * ratio;
            }
        }

        const dir = facingRight ? 1 : -1;
        const bladeLen = this.getKatanaBladeLength();
        const tipOffset = this.getKatanaVisualTipOffset(pose.swordAngle, dir, bladeLen, 0);
        const localTipX = armEndX + tipOffset.x;
        const localTipY = armEndY + tipOffset.y;
        const pivotX = actorRenderX + SHOGUN_ACTOR_BASE_WIDTH * 0.5;
        const pivotY = actorRenderY + SHOGUN_ACTOR_BASE_HEIGHT * 0.62;
        return {
            x: pivotX + (localTipX - pivotX) * scale,
            y: pivotY + (localTipY - pivotY) * scale
        };
    };

    PlayerClass.prototype.getShogunStep3RenderedTipWorld = function(state = {}, rawProgressOverride = null) {
        const attack = state.currentAttack || this.currentAttack;
        if (!attack || attack.comboStep !== 3) return null;
        return this.getShogunRenderedComboTipWorld(state, rawProgressOverride);
    };

    PlayerClass.prototype.inverseProjectShogunComboTrailPoint = function(point, state = {}, options = {}) {
        const scale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier
            : 1;
        if (
            this.characterType !== 'shogun' ||
            scale <= 1.001 ||
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y)
        ) {
            return point;
        }

        const anchorX = Number.isFinite(options.anchorX)
            ? options.anchorX
            : (Number.isFinite(state.x) ? state.x : this.x);
        const anchorY = Number.isFinite(options.anchorY)
            ? options.anchorY
            : (Number.isFinite(state.y) ? state.y : this.y);
        const pivots = this._getComboTrailProjectionPivots(anchorX, anchorY, scale);
        const isRelative = !!options.relative;
        const basePivotX = isRelative ? (pivots.basePivotX - anchorX) : pivots.basePivotX;
        const basePivotY = isRelative ? (pivots.basePivotY - anchorY) : pivots.basePivotY;
        const renderPivotX = isRelative ? (pivots.renderPivotX - anchorX) : pivots.renderPivotX;
        const renderPivotY = isRelative ? (pivots.renderPivotY - anchorY) : pivots.renderPivotY;
        const targetX = isRelative ? (point.x - anchorX) : point.x;
        const targetY = isRelative ? (point.y - anchorY) : point.y;

        return {
            x: basePivotX + (targetX - renderPivotX) / scale,
            y: basePivotY + (targetY - renderPivotY) / scale
        };
    };

    // 剣筋スペック空間(正規化ポーズ空間・攻撃開始アンカー基準)の1点をワールド座標へ投影する。
    // 忍者(scale=1)は恒等。freezeNormalComboFinisherTrailCurve の点上書き等に使う。
    PlayerClass.prototype.projectComboTrailSpecPointToWorld = function(attack, px, py) {
        const scale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier : 1;
        if (scale <= 1.001 || this.characterType !== 'shogun') return { x: px, y: py };
        const anchorX = attack && Number.isFinite(attack.trailTransformPlayerX) ? attack.trailTransformPlayerX : this.x;
        const anchorY = attack && Number.isFinite(attack.trailTransformPlayerY) ? attack.trailTransformPlayerY : this.y;
        const pivots = this._getComboTrailProjectionPivots(anchorX, anchorY, scale);
        return {
            x: pivots.renderPivotX + (px - pivots.basePivotX) * scale,
            y: pivots.renderPivotY + (py - pivots.basePivotY) * scale
        };
    };

    PlayerClass.prototype._projectShogunTrailPoseToWorldScale = function(pose, baseState) {
        const scale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
            ? this.scaleMultiplier : 1;
        if (scale <= 1.001) return pose;

        const px = Number.isFinite(baseState.x) ? baseState.x : this.x;
        const py = Number.isFinite(baseState.y) ? baseState.y : this.y;

        // 絶対座標（trailIsRelative: false）の投影ピボット計算において、
        // 毎フレーム変化するプレイヤーの現在座標（px, py）を使用すると、
        // プレイヤーの高速な移動（特にステップ4の上昇）によって投影後の絶対座標が並行移動・浮遊してしまう。
        // これを防ぐため、アタックプロファイル作成時に保存された攻撃開始時の固定座標
        // （pose.trailTransformPlayerX / Y）を静的ピボット（アンカー）として使用する。
        let anchorX = (pose && Number.isFinite(pose.trailTransformPlayerX)) ? pose.trailTransformPlayerX : px;
        let anchorY = (pose && Number.isFinite(pose.trailTransformPlayerY)) ? pose.trailTransformPlayerY : py;

        // 3/4段目はプレイヤー自身が大きく移動するため、プロファイルの攻撃開始時固定座標を強制的に適用する
        const result = { ...pose };
        const compensateBodyMotion = result.comboStep === 3 || result.comboStep === 4;
        if (compensateBodyMotion) {
            const attackObj = result.attack || this.currentAttack;
            if (attackObj && Number.isFinite(attackObj.trailTransformPlayerX)) {
                anchorX = attackObj.trailTransformPlayerX;
            }
            if (attackObj && Number.isFinite(attackObj.trailTransformPlayerY)) {
                anchorY = attackObj.trailTransformPlayerY;
            }
        }

        // 投影ピボットは単一定義ヘルパーから取得（式の二重管理を避ける）
        const pivots = this._getComboTrailProjectionPivots(anchorX, anchorY, scale);
        // 絶対座標用（攻撃開始アンカーを含む）と、相対座標用（アンカーを含まない純オフセット）
        const renderPivotX_Abs = pivots.renderPivotX;
        const renderPivotY_Abs = pivots.renderPivotY;
        const renderPivotX_Rel = pivots.renderPivotX - anchorX;
        const renderPivotY_Rel = pivots.renderPivotY - anchorY;
        const basePivotX_Abs = pivots.basePivotX;
        const basePivotY_Abs = pivots.basePivotY;
        const basePivotX_Rel = pivots.basePivotX - anchorX;
        const basePivotY_Rel = pivots.basePivotY - anchorY;

        // 投影関数
        const proj = (nX, nY, isPtRelative, dx = 0, dy = 0) => {
            if (!Number.isFinite(nX) || !Number.isFinite(nY)) return { x: nX, y: nY };
            const rPivotX = isPtRelative ? renderPivotX_Rel : renderPivotX_Abs;
            const rPivotY = isPtRelative ? renderPivotY_Rel : renderPivotY_Abs;
            const bPivotX = isPtRelative ? basePivotX_Rel : basePivotX_Abs;
            const bPivotY = isPtRelative ? basePivotY_Rel : basePivotY_Abs;

            // comboStep === 3/4 且つ絶対座標の場合は、プレイヤー自身のシミュレーション・実移動量 (dx, dy) を
            // スケール(scale)させずに 1.0倍 のまま反映し、ピボットに対する手・剣先の相対オフセットのみをスケールする。
            // dx/dy を等倍で足し戻さないと、移動量がポーズオフセット扱いで×scaleされ、
            // step3 は横へ伸びすぎ、step4 は剣筋が実際の刀の軌跡より上へ伸びる。
            if (compensateBodyMotion && !isPtRelative) {
                const rawRelativeX = nX - bPivotX - dx;
                const rawRelativeY = nY - bPivotY - dy;
                return {
                    x: rPivotX + rawRelativeX * scale + dx,
                    y: rPivotY + rawRelativeY * scale + dy
                };
            }

            return {
                x: rPivotX + (nX - bPivotX) * scale,
                y: rPivotY + (nY - bPivotY) * scale
            };
        };

        const isRelative = !!pose.trailIsRelative;

        // 3/4段目は現在の実座標(px, py)と攻撃開始時のアンカー座標(anchorX, anchorY)の差が
        // リアルタイムでの実際のプレイヤーの移動量(dx, dy)になる
        const currentDx = compensateBodyMotion ? (px - anchorX) : 0;
        const currentDy = compensateBodyMotion ? (py - anchorY) : 0;

        // 剣先をワールド座標へ (常に絶対座標なので isPtRelative = false)
        const tip = proj(result.tipX, result.tipY, false, currentDx, currentDy);
        result.tipX = tip.x;
        result.tipY = tip.y;
        if (Number.isFinite(result.trailTipX)) {
            const t2 = proj(result.trailTipX, result.trailTipY, false, currentDx, currentDy);
            result.trailTipX = t2.x;
            result.trailTipY = t2.y;
        } else {
            result.trailTipX = tip.x;
            result.trailTipY = tip.y;
        }
        if (
            result.comboStep >= 1 &&
            result.comboStep <= 3 &&
            typeof this.getShogunRenderedComboTipWorld === 'function'
        ) {
            const renderedTip = this.getShogunRenderedComboTipWorld({
                ...baseState,
                width: typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : baseState.width,
                height: typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : baseState.height,
                currentAttack: result.attack || this.currentAttack
            });
            if (renderedTip && Number.isFinite(renderedTip.x) && Number.isFinite(renderedTip.y)) {
                result.tipX = renderedTip.x;
                result.tipY = renderedTip.y;
                result.trailTipX = renderedTip.x;
                result.trailTipY = renderedTip.y;
            }
        }

        // ベジェ曲線の制御点をワールド座標へ (元の trailIsRelative に従う)
        const step3CurveAlreadyWorld = !!(
            result.comboStep === 3 &&
            result.attack &&
            result.attack.step3TrailWorldProjected
        );
        if (Number.isFinite(result.trailCurveStartX) && !step3CurveAlreadyWorld) {
            const startDx = compensateBodyMotion ? (Number.isFinite(result.startDeltaX) ? result.startDeltaX : 0) : 0;
            const startDy = compensateBodyMotion ? (Number.isFinite(result.startDeltaY) ? result.startDeltaY : 0) : 0;
            const midDx = compensateBodyMotion ? (Number.isFinite(result.midDeltaX) ? result.midDeltaX : 0) : 0;
            const midDy = compensateBodyMotion ? (Number.isFinite(result.midDeltaY) ? result.midDeltaY : 0) : 0;
            const endDx = compensateBodyMotion ? (Number.isFinite(result.endDeltaX) ? result.endDeltaX : 0) : 0;
            const endDy = compensateBodyMotion ? (Number.isFinite(result.endDeltaY) ? result.endDeltaY : 0) : 0;

            const s = proj(result.trailCurveStartX, result.trailCurveStartY, isRelative, startDx, startDy);
            result.trailCurveStartX = s.x; result.trailCurveStartY = s.y;

            // 4段目で 3段目の実際の終点 absolute ワールド座標が指定されている場合、始点を完全にロック・結合する！
            if (result.comboStep === 4 && result.attack && result.attack.fixedStartWorldPoint) {
                result.trailCurveStartX = result.attack.fixedStartWorldPoint.x;
                result.trailCurveStartY = result.attack.fixedStartWorldPoint.y;
            }

            const c = proj(result.trailCurveControlX, result.trailCurveControlY, isRelative, midDx, midDy);
            result.trailCurveControlX = c.x; result.trailCurveControlY = c.y;
            if (Number.isFinite(result.trailCurveMidX) && Number.isFinite(result.trailCurveMidY)) {
                const m = proj(result.trailCurveMidX, result.trailCurveMidY, isRelative, midDx, midDy);
                result.trailCurveMidX = m.x;
                result.trailCurveMidY = m.y;
            }
            const e = proj(result.trailCurveEndX, result.trailCurveEndY, isRelative, endDx, endDy);
            result.trailCurveEndX = e.x; result.trailCurveEndY = e.y;
            if (result.comboStep === 4 && result.attack && result.attack.fixedStartWorldPoint) {
                result.trailCurveControlX = result.attack.fixedStartWorldPoint.x;
                result.trailCurveEndX = result.attack.fixedStartWorldPoint.x;
            }
        }

        // 弧(arc)の中心・半径をワールド座標へ (元の trailIsRelative に従う)
        if (Number.isFinite(result.trailArcCenterX)) {
            const ac = proj(result.trailArcCenterX, result.trailArcCenterY, isRelative);
            result.trailArcCenterX = ac.x; result.trailArcCenterY = ac.y;
            if (Number.isFinite(result.trailRadius)) {
                result.trailRadius *= scale;
            }
        }

        // 表示中心をワールド座標へ (元の trailIsRelative に従う)
        if (Number.isFinite(result.centerX)) {
            const cc = proj(result.centerX, result.centerY, isRelative);
            result.centerX = cc.x; result.centerY = cc.y;
        }

        // 変換後も、元の相対/絶対フラグをそのまま維持する！一律 false にしない！
        result.trailIsRelative = isRelative;
        result.originX = px;
        result.originY = py;

        return result;
    };

    PlayerClass.prototype.getComboTrailProgressWindow = function(comboStep) {
        switch (comboStep) {
            // 一段目は構え始点から描画し、振り切り後の戻りだけ剣筋に含めない
            case 1: return { start: 0.0, end: 0.82 };
            case 2: return { start: 0.0, end: 1.0 };
            case 3: return { start: 0.28, end: 1.0 };
            // 四段(天穿"返り")は振り上げ後に返し/空中の戻りがある。end:1.0 だと戻りまで剣筋を記録し続け
            // 頭が新鮮なまま＝消え始めが1テンポ遅れる。step1同様に振り切り後の戻りは含めず end:0.82 で打ち切る。
            case 4: return { start: 0.0, end: 0.87 };
            case 5: return { start: 0.15, end: 0.98 };
            default: return { start: 0, end: 1 };
        }
    };

    PlayerClass.prototype.getComboTrailBodyMotionScale = function(state = {}) {
        const baseSpeed = Number.isFinite(PLAYER.SPEED) && PLAYER.SPEED > 0
            ? PLAYER.SPEED
            : 1;
        const currentSpeed = Number.isFinite(state.speed) && state.speed > 0
            ? state.speed
            : (Number.isFinite(this.speed) && this.speed > 0 ? this.speed : baseSpeed);
        return baseSpeed / currentSpeed;
    };

    PlayerClass.prototype.resolveRawProgressForAttackMotion = function(attack, targetProgress) {
        const target = Math.max(0, Math.min(1, Number.isFinite(targetProgress) ? targetProgress : 0));
        if (!attack || !attack.comboStep || typeof this.getAttackMotionProgress !== 'function') {
            return target;
        }
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) * 0.5;
            const motionProgress = this.getAttackMotionProgress(attack, mid);
            if (!Number.isFinite(motionProgress)) return target;
            if (motionProgress < target) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        return Math.max(0, Math.min(1, (lo + hi) * 0.5));
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
            width: Number.isFinite(state.width) ? state.width : this.getWorldWidth(),
            height: Number.isFinite(state.height) ? state.height : this.getWorldHeight(),
            facingRight: state.facingRight !== undefined ? state.facingRight : this.facingRight,
            isCrouching: state.isCrouching !== undefined ? state.isCrouching : this.isCrouching,
            currentAttack: attack,
            attackTimer: durationMs * (1 - Math.max(0, Math.min(1, rawProgress))),
            recoveryBlend: 0
        });
        const pointAt = (rawProgress) => {
            const poseState = buildStateAt(rawProgress);
            const pose = this.getComboSwordPoseState(poseState);
            if (!pose) return null;
            if (
                this.characterType === 'shogun' &&
                typeof this.getShogunRenderedComboTipWorld === 'function' &&
                typeof this.inverseProjectShogunComboTrailPoint === 'function'
            ) {
                const renderedTip = this.getShogunRenderedComboTipWorld({
                    ...poseState,
                    width: typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : poseState.width,
                    height: typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : poseState.height
                }, rawProgress);
                const specTip = this.inverseProjectShogunComboTrailPoint(renderedTip, poseState, {
                    relative: !!options.relative || !!attack.trailIsRelative,
                    anchorX: Number.isFinite(poseState.x) ? poseState.x : 0,
                    anchorY: Number.isFinite(poseState.y) ? poseState.y : 0
                });
                if (specTip && Number.isFinite(specTip.x) && Number.isFinite(specTip.y)) {
                    return { pose, x: specTip.x, y: specTip.y };
                }
            }
            return { pose, x: pose.trailTipX, y: pose.trailTipY };
        };
        const startPose = pointAt(sampleTargets[0]);
        const midPose = pointAt(sampleTargets[1]);
        const endPose = pointAt(sampleTargets[2]);
        if (!startPose || !midPose || !endPose) {
            return null;
        }
        const start = (
            options.fixedStartPoint &&
            Number.isFinite(options.fixedStartPoint.x) &&
            Number.isFinite(options.fixedStartPoint.y)
        )
            ? { x: options.fixedStartPoint.x, y: options.fixedStartPoint.y }
            : { x: startPose.x, y: startPose.y };
        const mid = { x: midPose.x, y: midPose.y };
        const end = { x: endPose.x, y: endPose.y };
        const startProgress = Number.isFinite(startPose.pose.progress) ? startPose.pose.progress : Math.max(0, Math.min(1, sampleTargets[0]));
        const midProgress = Number.isFinite(midPose.pose.progress) ? midPose.pose.progress : Math.max(0, Math.min(1, sampleTargets[1]));
        const endProgress = Number.isFinite(endPose.pose.progress) ? endPose.pose.progress : Math.max(0, Math.min(1, sampleTargets[2]));
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

    PlayerClass.prototype.buildComboStep1TrailSpec = function(state = {}) {
        const attack = state.attack || this.currentAttack || null;
        if (!attack || attack.comboStep !== 1) return null;

        const trailWindow = this.getComboTrailProgressWindow(1);
        const startProgress = Number.isFinite(trailWindow.start) ? trailWindow.start : 0.0;
        const endProgress = Number.isFinite(trailWindow.end) ? trailWindow.end : 0.82;
        const midProgress = Math.max(startProgress, Math.min(endProgress, 0.5));
        const sampleTargets = [startProgress, midProgress, endProgress]
            .map((progress) => this.resolveRawProgressForAttackMotion(attack, progress));

        return this.buildComboFixedBezierTrailSpec(state, sampleTargets, { relative: true });
    };

    PlayerClass.prototype.buildComboStep2TrailSpec = function(state = {}, options = {}) {
        const attack = state.attack || this.currentAttack || null;
        if (!attack || attack.comboStep !== 2) return null;

        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const { width, height } = this.getComboPoseDimensions(state);
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const speed = Number.isFinite(state.speed) ? state.speed : this.speed;
        const dir = facingRight ? 1 : -1;
        const bodyMotionScale = this.getComboTrailBodyMotionScale(state);
        // 体移動量はワールド量だが、このスペックは投影時に×renderScaleされるため
        // あらかじめ 1/renderScale に正規化する（step4/5と同じ扱い）
        const renderScale = Math.max(1, Number.isFinite(state.renderScale)
            ? state.renderScale
            : (Number.isFinite(state.scaleMultiplier)
                ? state.scaleMultiplier
                : (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1)));
        const step2ImpulseScale = 0.9;
        const durationMs = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const sampleTargets = [0.0, 0.42, 1.0];
        const frameMs = 1000 / 60;
        const impulse = (attack.impulse || 1) * speed;
        let simX = x;
        let simY = y;
        let simVx = isCrouching
            ? dir * impulse * 0.28
            : ((Number.isFinite(state.vx) ? state.vx : this.vx) * 0.16 + dir * impulse * step2ImpulseScale);
        let simVy = isCrouching
            ? (Number.isFinite(state.vy) ? state.vy : this.vy)
            : ((state.isGrounded !== undefined ? state.isGrounded : this.isGrounded)
                ? 0
                : Math.min(Number.isFinite(state.vy) ? state.vy : this.vy, -1.2));
        let timerMs = durationMs;
        let sampleIndex = 0;
        const sampledBodies = [];

        const pointAt = (progress, bodyX, bodyY) => {
            const poseState = {
                x: bodyX,
                y: bodyY,
                width,
                height,
                facingRight,
                isCrouching,
                currentAttack: attack,
                attackTimer: durationMs * (1 - Math.max(0, Math.min(1, progress))),
                recoveryBlend: 0
            };
            const pose = this.getComboSwordPoseState(poseState);
            if (!pose) return null;
            if (
                this.characterType === 'shogun' &&
                typeof this.getShogunRenderedComboTipWorld === 'function' &&
                typeof this.inverseProjectShogunComboTrailPoint === 'function'
            ) {
                const renderedTip = this.getShogunRenderedComboTipWorld({
                    ...poseState,
                    width: typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : poseState.width,
                    height: typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : poseState.height
                }, progress);
                const specTip = this.inverseProjectShogunComboTrailPoint(renderedTip, {
                    ...state,
                    x,
                    y
                }, {
                    relative: false,
                    anchorX: x,
                    anchorY: y
                });
                if (specTip && Number.isFinite(specTip.x) && Number.isFinite(specTip.y)) {
                    return { x: specTip.x, y: specTip.y, progress: pose.progress };
                }
            }
            return { x: pose.trailTipX, y: pose.trailTipY, progress: pose.progress };
        };

        while (sampleIndex < sampleTargets.length) {
            const progress = Math.max(0, Math.min(1, 1 - (timerMs / durationMs)));
            while (sampleIndex < sampleTargets.length && progress >= sampleTargets[sampleIndex] - 0.0001) {
                sampledBodies[sampleIndex] = { x: simX, y: simY };
                sampleIndex++;
            }
            if (progress >= sampleTargets[sampleTargets.length - 1] || timerMs <= 0) break;
            simX += simVx * bodyMotionScale / renderScale;
            simY += simVy * bodyMotionScale / renderScale;
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
        controlY -= 75; // 頭部・ハチマキをかすめないよう、制御点Yをさらに上方に大きく引き上げる
        return {
            trailCurveStartX: start.x,
            trailCurveStartY: start.y,
            trailCurveControlX: controlX,
            trailCurveControlY: controlY,
            trailCurveEndX: end.x,
            trailCurveEndY: end.y,
            trailIsRelative: false,
            trailTransformPlayerX: x,
            trailTransformPlayerY: y
        };
    };

    PlayerClass.prototype.buildComboStep3TrailSpec = function(state = {}, options = {}) {
        const attack = state.attack || this.currentAttack || null;
        if (!attack || attack.comboStep !== 3) return null;

        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const { width, height } = this.getComboPoseDimensions(state);
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const dir = facingRight ? 1 : -1;
        const speed = Number.isFinite(state.speed) ? state.speed : this.speed;
        const impulse = (attack.impulse || 1) * speed;
        const durationMs = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const frameMs = 1000 / 60;
        const bodyMotionScale = this.getComboTrailBodyMotionScale(state);
        const scaleMult = Math.max(1, Number.isFinite(state.scaleMultiplier)
            ? state.scaleMultiplier
            : (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1));
        let simX = x;
        let simY = y;
        const groundedInit = (state.isGrounded !== undefined ? !!state.isGrounded : !!this.isGrounded);
        // 通常コンボ3段目は接地高さを保ったまま水平に踏み込む技で、体はほとんど上下しない
        // (player.js: step3 は grounded のとき vy=0 でその場の高さを維持)。
        // 旧simは NORMAL_COMBO_STEP3_LAUNCH_VY(-6.0) の大きな打ち上げで体を浮かせて切先を予測し、
        // 剣筋の固定線が実際の刀身より上へズレていた(剣筋が斜め上に浮く原因)。
        // さらに attack() は step3 で isGrounded を false にするため、接地判定では keepLevel が無効化されていた。
        // step3 は体の高さを保つ技なので、しゃがみ以外は常に「水平移動のみ」とし、
        // 固定線(始点・終点)を攻撃開始時の刀身の高さに一致させる。
        const keepLevel = !isCrouching;
        // 横の踏み込みは実物理(applyNormalComboStartMotion step3)と同一スケールにし、
        // 剣筋の固定線終点が実際の突進(=刀身)位置と一致するようにする。
        const step3HLungeScale = 1 + (scaleMult - 1) * NORMAL_COMBO_STEP3_LUNGE_HSCALE_COEF;
        let simVx = isCrouching
            ? dir * impulse * 0.28
            : ((Number.isFinite(state.vx) ? state.vx : this.vx) * 0.12 + dir * impulse * 1.71 * step3HLungeScale);
        let simVy = isCrouching
            ? (Number.isFinite(state.vy) ? state.vy : this.vy)
            : (keepLevel
                ? 0
                : Math.min(Number.isFinite(state.vy) ? state.vy : this.vy, NORMAL_COMBO_STEP3_LAUNCH_VY));
        let simGrounded = isCrouching
            ? groundedInit
            : (keepLevel ? true : false);
        const trailWindow = this.getComboTrailProgressWindow(3);
        const startProgress = Number.isFinite(trailWindow.start) ? trailWindow.start : 0.0;
        const endProgress = Number.isFinite(trailWindow.end) ? trailWindow.end : 1.0;
        const midProgress = Math.max(startProgress, Math.min(endProgress, 0.56));
        const sampleTargets = [startProgress, midProgress, endProgress]
            .map((progress) => this.resolveRawProgressForAttackMotion(attack, progress));
        const sampledBodies = [];
        let sampleIndex = 0;
        let timerMs = durationMs;
        const worldH = Number.isFinite(state.height) ? state.height : this.getWorldHeight();
        const groundY = Number.isFinite(state.groundY) ? state.groundY : this.groundY;

        while (sampleIndex < sampleTargets.length) {
            const progress = Math.max(0, Math.min(1, 1 - (timerMs / durationMs)));
            while (sampleIndex < sampleTargets.length && progress >= sampleTargets[sampleIndex] - 0.0001) {
                sampledBodies[sampleIndex] = { x: simX, y: simY };
                sampleIndex++;
            }
            if (progress >= sampleTargets[sampleTargets.length - 1] || timerMs <= 0) break;
            if (keepLevel) {
                // 接地維持: 重力・摩擦・接地判定を行わず、水平方向の踏み込みのみ進める。
                // これで体の高さ(simY)が一定に保たれ、固定線が刀身高さに一致する。
                simX += simVx * bodyMotionScale;
            } else {
                if (!simGrounded) {
                    simVy += GRAVITY;
                }
                if (simGrounded) {
                    simVx *= FRICTION;
                    if (Math.abs(simVx) < 0.1) simVx = 0;
                }
                simX += simVx * bodyMotionScale;
                simY += simVy * bodyMotionScale;
                if (Number.isFinite(groundY) && simY + worldH >= groundY + LANE_OFFSET) {
                    simY = groundY + LANE_OFFSET - worldH;
                    simVy = 0;
                    simGrounded = true;
                } else {
                    simGrounded = false;
                }
            }
            timerMs = Math.max(0, timerMs - frameMs);
        }
        while (sampleIndex < sampleTargets.length) {
            sampledBodies[sampleIndex] = { x: simX, y: simY };
            sampleIndex++;
        }

        const pointAt = (rawProgress, bodyX, bodyY) => {
            const pose = this.applyShogunStep3ReachToTrailPose(this.getComboSwordPoseState({
                x: bodyX,
                y: bodyY,
                width,
                height,
                facingRight,
                isCrouching,
                currentAttack: attack,
                attackTimer: durationMs * (1 - Math.max(0, Math.min(1, rawProgress))),
                recoveryBlend: 0
            }));
            if (!pose) return null;
            if (this.characterType === 'shogun' && typeof this.getShogunStep3RenderedTipWorld === 'function') {
                // getShogunStep3RenderedTipWorld はワールド寸法前提(素体寸法を渡すと
                // actorRenderX/Y がズレ、予測切先=固定線終点が実際の刀身より上へ浮く)。
                // 剣筋ポーズ計算(getComboSwordPoseState)は素体寸法だが、ここは必ずワールド寸法を渡す。
                const renderedTip = this.getShogunStep3RenderedTipWorld({
                    ...state,
                    x: bodyX,
                    y: bodyY,
                    width: this.getWorldWidth(),
                    height: this.getWorldHeight(),
                    facingRight,
                    isCrouching,
                    currentAttack: attack,
                    attackTimer: durationMs * (1 - Math.max(0, Math.min(1, rawProgress)))
                }, rawProgress);
                if (renderedTip) {
                    return { x: renderedTip.x, y: renderedTip.y, progress: pose.progress };
                }
            }
            return { x: pose.trailTipX, y: pose.trailTipY, progress: pose.progress };
        };

        const startBody = sampledBodies[0] || { x, y };
        const midBody = sampledBodies[1] || startBody;
        const endBody = sampledBodies[2] || midBody;
        const startPose = pointAt(sampleTargets[0], startBody.x, startBody.y);
        const midPose = pointAt(sampleTargets[1], midBody.x, midBody.y);
        const endPose = pointAt(sampleTargets[2], endBody.x, endBody.y);
        if (!startPose || !midPose || !endPose) return null;
        const start = (
            options.fixedStartPoint &&
            Number.isFinite(options.fixedStartPoint.x) &&
            Number.isFinite(options.fixedStartPoint.y)
        )
            ? { x: options.fixedStartPoint.x, y: options.fixedStartPoint.y }
            : { x: startPose.x, y: startPose.y };
        const mid = { x: midPose.x, y: midPose.y };
        const end = { x: endPose.x, y: endPose.y };
        // 注: step3終点をここ(spec)で +X しても、実機のstep3記録トレイル/step4接続は『記録点(サンプル)』を使うため
        // 反映されない(spec はライブ点が無い時のフォールバックのみ)。step3↔step4 の交差調整は別途、記録トレイル側で行う。
        const startPoseProgress = Number.isFinite(startPose.progress) ? startPose.progress : startProgress;
        const midPoseProgress = Number.isFinite(midPose.progress) ? midPose.progress : midProgress;
        const endPoseProgress = Number.isFinite(endPose.progress) ? endPose.progress : endProgress;
        const totalSpan = Math.max(0.001, endPoseProgress - startPoseProgress);
        const midT = Math.max(0.16, Math.min(0.84, (midPoseProgress - startPoseProgress) / totalSpan));
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
        controlX = Math.max(Math.min(start.x, end.x), Math.min(Math.max(start.x, end.x), controlX));
        const controlYMin = Math.min(start.y, mid.y, end.y) - 120;
        const controlYMax = Math.max(start.y, mid.y, end.y) + 120;
        controlY = Math.max(controlYMin, Math.min(controlYMax, controlY));
        const startDeltaX = startBody.x - x;
        const startDeltaY = startBody.y - y;
        const midDeltaX = midBody.x - x;
        const midDeltaY = midBody.y - y;
        const endDeltaX = endBody.x - x;
        const endDeltaY = endBody.y - y;

        return {
            trailCurveStartX: start.x,
            trailCurveStartY: start.y,
            trailCurveControlX: controlX,
            trailCurveControlY: controlY,
            trailCurveEndX: end.x,
            trailCurveEndY: end.y,
            startDeltaX,
            startDeltaY,
            midDeltaX,
            midDeltaY,
            endDeltaX,
            endDeltaY,
            trailIsRelative: false,
            trailTransformPlayerX: x,
            trailTransformPlayerY: y,
            step3TrailWorldProjected: this.characterType === 'shogun'
        };
    };

    PlayerClass.prototype.buildComboStep4TrailArcSpec = function(state = {}, options = {}) {
        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const { width, height } = this.getComboPoseDimensions(state);
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const attack = state.attack || this.currentAttack || null;
        const dir = facingRight ? 1 : -1;
        const bladeLen = this.getKatanaBladeLength();
        const bodyMotionScale = this.getComboTrailBodyMotionScale(state);
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
            // getComboSwordPoseState case4 の上昇ポーズ（序盤の構え維持）と同一の式を使う
            const rawAngle = -0.22 + (-0.38 + 0.22) * rise;
            const rawHandX = centerX + dir * (26 + (21.0 - 26) * rise);
            const rawHandY = pivotY + 5 + (-1.0 - 5) * rise;
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
        // 物理(normalComboMotion)の体格スケール倍上昇と同期させる
        const bodyScaleMult = Math.max(1, Number.isFinite(state.scaleMultiplier)
            ? state.scaleMultiplier
            : (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1));
        const bodyRiseScale = getNormalComboStep4RiseScale(bodyScaleMult);
        let simVx = isCrouching
            ? dir * attackImpulse * 0.28
            : ((Number.isFinite(state.vx) ? state.vx : this.vx) * 0.24 + dir * attackImpulse * 0.42);
        let simVy = isCrouching
            ? (Number.isFinite(state.vy) ? state.vy : this.vy)
            : Math.min(Number.isFinite(state.vy) ? state.vy : this.vy, -10.6 * bodyRiseScale);
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
            const z4HeightScale = 0.9 * bodyRiseScale;
            simVx = simVx * 0.68 + dir * (Number.isFinite(state.speed) ? state.speed : this.speed) * (0.24 - t * 0.14);
            simVy = (-18.6 + t * 3.2) * z4HeightScale;
            const riseLockT = Math.max(0, Math.min(1, progress / 0.72));
            const minRiseVy = (-16.2 + riseLockT * 13.5) * z4HeightScale;
            simVy = Math.min(simVy, minRiseVy);
            simX += simVx * bodyMotionScale;
            simY += simVy * bodyMotionScale;
            timerMs = Math.max(0, timerMs - frameMs);
        }
        while (sampleIndex < sampleTargets.length) {
            sampledBodies[sampleIndex] = { x: simX, y: simY };
            sampleIndex++;
        }
        const startBody = sampledBodies[0] || { x, y };
        const midBody = sampledBodies[1] || startBody;
        const endBody = sampledBodies[2] || midBody;
        const start = (
            options.fixedStartPoint &&
            Number.isFinite(options.fixedStartPoint.x) &&
            Number.isFinite(options.fixedStartPoint.y)
        )
            ? { x: options.fixedStartPoint.x, y: options.fixedStartPoint.y }
            : pointAt(0.0, startBody.x, startBody.y);
        const mid = pointAt(0.24, midBody.x, midBody.y);
        const end = pointAt(0.42, endBody.x, endBody.y);
        // 【天穿=完全な垂直線・切先Xへ整列】(ユーザー要望:「垂直にしたい」「始点Xを切先へ寄せて」)
        // ・step4始点 = step3終点(fixedStartPoint)。生の刀ポーズ(getComboSwordPoseState/Reference)はstep4の
        //   振り回し(途中で大きく横へ振れる)を拾い、見えている『クリーンな縦の剣筋』とは別物なので切先源に使えない。
        // ・対策(全て見た目専用ノブ=当たり判定不変):
        //   (a) end.x = control.x = start.x で完全な垂直線(以前の lean/STEP4_TIP_REACH は撤廃)。
        //   (b) 垂直線全体を facing方向へ STEP4_START_X_SHIFT 寄せ、始点Xを刀身の切先X(=step3終点より外側)へ重ねる。
        //   (c) 高さ(切先Yへの到達)は STEP4_VERTICAL_RISE_SCALE で調整(1.0=模型/手前, 大=上へ伸びる)。
        //   START_X_SHIFT / RISE_SCALE は実機で振って微調整する。step3終点との接続はstep3剣筋フェード中で軽微差は隠れる。
        const STEP4_START_X_SHIFT = 22;          // step4縦線を切先Xへ寄せる横移動(world px, facing方向)。実機の切先=457
        const STEP4_VERTICAL_RISE_SCALE = 1.32;  // 縦の高さ(1.0=模型/短い, 大=切先Yへ届く)
        start.x += dir * STEP4_START_X_SHIFT;
        end.x = start.x;                                                    // 完全な垂直線(X固定)
        end.y = start.y + (end.y - start.y) * STEP4_VERTICAL_RISE_SCALE;    // 高さだけ係数で調整
        mid.x = start.x;
        const chordLen = Math.max(1, Math.abs(end.y - start.y));
        // t=0.5 で固定の中間点を通る制御点を逆算する（Xは垂直固定のため始点と同値）
        const controlY = 2 * mid.y - (start.y + end.y) * 0.5;
        // 各フレームでの非線形な体座標変化（跳躍等）が制御点に混入し、ワールドスケールで2倍に拡大される歪みを完全に補正する
        const correctedControlY = controlY - (2 * midBody.y - (startBody.y + endBody.y) * 0.5) + midBody.y;
        return {
            trailArcCenterX: null,
            trailArcCenterY: null,
            trailArcRadius: chordLen,
            trailArcStartAngle: null,
            trailArcSpan: null,
            trailCurveStartX: start.x,
            trailCurveStartY: start.y,
            trailCurveControlX: start.x,
            trailCurveControlY: correctedControlY,
            trailCurveEndX: end.x,
            trailCurveEndY: end.y,
            trailIsRelative: false,
            trailTransformPlayerX: x,
            trailTransformPlayerY: y,
            startDeltaX: startBody.x - x,
            startDeltaY: startBody.y - y,
            midDeltaX: startBody.x - x,
            midDeltaY: midBody.y - y,
            endDeltaX: startBody.x - x,
            endDeltaY: endBody.y - y
        };
    };

    PlayerClass.prototype.buildComboStep5TrailSpec = function(state = {}) {
        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const { width, height } = this.getComboPoseDimensions(state);
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        // 将軍・忍者で統一された剣筋トレイル仕様（スケール対応）
        {
            const attack = state.attack || this.currentAttack || null;
            const dir = facingRight ? 1 : -1;
            const durationMs = Math.max(1, attack?.durationMs || PLAYER.ATTACK_COOLDOWN);
            const bodyMotionScale = this.getComboTrailBodyMotionScale(state);
            // 刀本体と同じ getComboSwordPoseState から切先サンプルを取り、剣筋だけ別式でズレないようにする。
            // 将軍も忍者と同じ基準寸法でサンプリングし、拡大は投影レイヤーで一度だけ行う。
            // 体移動量はワールド量だが、このスペックは投影時に×renderScaleされるため
            // あらかじめ 1/renderScale に正規化し、投影後にちょうど等倍へ戻るようにする
            const renderScale = Math.max(1, Number.isFinite(state.renderScale)
                ? state.renderScale
                : (Number.isFinite(state.scaleMultiplier)
                    ? state.scaleMultiplier
                    : (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1)));
            const startMotionProgress = 0.15;
            const midMotionProgress = 0.48;
            const endMotionProgress = 0.98;
            const settleMotionProgress = 1.0;
            const sampleTargets = [startMotionProgress, midMotionProgress, endMotionProgress, settleMotionProgress]
                .map((progress) => this.resolveRawProgressForAttackMotion(attack, progress));
            const pointAt = (rawProgress, bodyX = x, bodyY = y) => {
                const clampedRaw = Math.max(0, Math.min(1, rawProgress));
                const pose = this.getComboSwordPoseState({
                    x: bodyX,
                    y: bodyY,
                    width,
                    height,
                    facingRight,
                    isCrouching,
                    currentAttack: attack,
                    attackTimer: durationMs * (1 - clampedRaw),
                    recoveryBlend: 0
                });
                if (!pose || !Number.isFinite(pose.trailTipX) || !Number.isFinite(pose.trailTipY)) return null;
                return {
                    x: pose.trailTipX,
                    y: pose.trailTipY,
                    progress: Number.isFinite(pose.progress) ? pose.progress : this.getAttackMotionProgress(attack, clampedRaw)
                };
            };
            const sampledBodies = [];
            const frameMs = 1000 / 60;
            const groundY = Number.isFinite(state.groundY) ? state.groundY : this.groundY;
            // 実際の着地ライン（体トップY、正規化空間）。
            // 5段目はattackTimer同様「着地まで継続」するため、シミュレーションも
            // 固定時間ではなく着地までを再現する（step4の高い頂点から繋いだ場合に
            // 終点が空中で止まるのを防ぐ）
            const landSimY = Number.isFinite(groundY)
                ? y + (((groundY + LANE_OFFSET) - PLAYER.HEIGHT * renderScale) - y) / renderScale
                : Infinity;
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
                    // 物理(normalComboMotion)と同じく体格スケール倍の落下速度（renderScale=scaleMultiplier）
                    simVy = simVy * 0.34 + (9.8 + fallT * 19.8) * 0.66 * renderScale;
                } else {
                    simVx *= 0.64;
                    simVy = Math.max(simVy, 13.4 * renderScale);
                }
                simX += simVx * bodyMotionScale / renderScale;
                simY += (simVy + 0.8) * bodyMotionScale / renderScale;
                // 地面より下へは沈まない（接地で停止）
                if (simY > landSimY) simY = landSimY;
                timerMs = Math.max(0, timerMs - frameMs);
            }
            while (sampleIndex < sampleTargets.length) {
                sampledBodies[sampleIndex] = { x: simX, y: simY };
                sampleIndex++;
            }
            // モーション時間内に着地しなかった場合（高所からの継続）、着地まで落下を延長し、
            // 終点・余韻サンプルを実着地位置に合わせる
            if (Number.isFinite(landSimY) && simY < landSimY) {
                let guardFrames = 0;
                while (simY < landSimY && guardFrames++ < 600) {
                    simVx *= 0.64;
                    simVy = Math.max(simVy, 13.4 * renderScale);
                    simX += simVx * bodyMotionScale / renderScale;
                    simY += (simVy + 0.8) * bodyMotionScale / renderScale;
                }
                simY = Math.min(simY, landSimY);
                sampledBodies[2] = { x: simX, y: simY };
                sampledBodies[3] = { x: simX, y: simY };
            }

            const startBody = sampledBodies[0] || { x, y };
            const midBody = sampledBodies[1] || startBody;
            const endBody = sampledBodies[2] || midBody;
            const settleBody = sampledBodies[3] || endBody;
            const start = pointAt(sampleTargets[0], startBody.x, startBody.y);
            const mid = pointAt(sampleTargets[1], midBody.x, midBody.y);
            const end = pointAt(sampleTargets[2], endBody.x, endBody.y);
            const settleTip = pointAt(sampleTargets[3], settleBody.x, settleBody.y);
            if (!start || !mid || !end || !settleTip) return null;
            let slashFloorY = Number.isFinite(groundY)
                ? (groundY + LANE_OFFSET) - Math.max(10, height * 0.1)
                : Infinity;
            if (renderScale > 1.001 && Number.isFinite(slashFloorY)) {
                // 投影(×renderScale)後にワールド床と一致するよう、スペック空間の床へ逆変換する
                // （視覚マージンも見た目スケール相当に合わせる）
                const worldFloor = (groundY + LANE_OFFSET) - Math.max(10, height * 0.1) * renderScale;
                const pivots = this._getComboTrailProjectionPivots(x, y, renderScale);
                slashFloorY = pivots.basePivotY + (worldFloor - pivots.renderPivotY) / renderScale;
            }
            end.y = Math.min(end.y, slashFloorY, settleTip.y);
            const midT = Math.max(0.08, Math.min(0.92, (midMotionProgress - startMotionProgress) / Math.max(0.001, endMotionProgress - startMotionProgress)));
            const downwardControl = getNormalComboStep5DownwardControl(start.x, start.y, end.x, end.y) || end;
            const spec = {
                trailCurveStartX: start.x,
                trailCurveStartY: start.y,
                trailCurveMidX: mid.x,
                trailCurveMidY: mid.y,
                trailCurveMidT: midT,
                trailCurveControlX: downwardControl.x,
                trailCurveControlY: downwardControl.y,
                trailCurveEndX: end.x,
                trailCurveEndY: end.y,
                trailIsRelative: false,
                trailTransformPlayerX: x,
                trailTransformPlayerY: y
            };
            return spec;
        }

    };

    PlayerClass.prototype.getComboSwordPoseState = function(state, options = {}) {
        if (!state) return null;
        const attack = state.currentAttack;
        if (!attack || !attack.comboStep) return null;

        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const { width, height } = this.getComboPoseDimensions(state);
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

        const scale = height / 36;
        let swordAngle = 0;
        let armEndX = centerX + dir * 14 * scale;
        let armEndY = pivotY + 6 * scale;
        let activeLeftShoulderX = leftShoulderXBase;
        let activeLeftShoulderY = leftShoulderYBase;
        let activeRightShoulderX = rightShoulderXBase;
        let activeRightShoulderY = rightShoulderYBase;
        let supportGripBackDist = 6.2 * scale;
        let supportGripSideOffset = 1.0 * scale;
        let supportGripMaxReach = 22 * scale;
        let allowSupportFrontHand = options.supportRightHand !== false;

        switch (attack.comboStep) {
            case 2: {
                if (progress < 0.34) {
                    const backT = progress / 0.34;
                    const backEase = backT * backT * (3 - 2 * backT);
                    swordAngle = 2.18 + backEase * 1.34;
                    armEndX = centerX + dir * (10 - backEase * 2) * scale;
                    armEndY = pivotY + (5.0 + backEase * 3.0) * scale;
                } else {
                    const cutT = Math.min(1, (progress - 0.34) / 0.52);
                    const cutEase = cutT * cutT * (3 - 2 * cutT);
                    const settle = Math.max(0, Math.min(1, (progress - 0.86) / 0.14));
                    const settleEase = settle * settle * (3 - 2 * settle);
                    swordAngle = 3.52 + cutEase * 2.9;
                    armEndX = centerX + dir * (8 + cutEase * 6 - settleEase * 2) * scale;
                    armEndY = pivotY + (8 - cutEase * 15 + settleEase * 5) * scale;
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
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 5.5 * scale);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 10.0 * scale);
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                {
                    const backT2 = Math.max(0, Math.min(1, progress / 0.34));
                    const backEase2 = backT2 * backT2 * (3 - 2 * backT2);
                    const cutT2 = Math.max(0, Math.min(1, (progress - 0.34) / 0.52));
                    const cutEase2 = cutT2 * cutT2 * (3 - 2 * cutT2);
                    activeLeftShoulderX += dir * cutEase2 * 0.7 * scale;
                    activeLeftShoulderY += (backEase2 * 0.5 - cutEase2 * 0.9) * scale;
                    activeRightShoulderX += dir * cutEase2 * 0.4 * scale;
                    activeRightShoulderY += (backEase2 * 0.4 - cutEase2 * 0.7) * scale;
                }
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
                const idleHandX = centerX + dir * (isCrouching ? 12 : 15) * scale;
                const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0) * scale;

                const wind = Math.max(0, Math.min(1, progress / 0.34));
                const swing = Math.max(0, Math.min(1, (progress - 0.34) / 0.48));
                const swingEase = swing * swing * (3 - 2 * swing);
                const baseArmX = centerX + dir * 15 * scale;
                const baseArmY = pivotY + 8.0 * scale;
                swordAngle = idleAngle + wind * (1.0 - idleAngle) + swingEase * 1.32;
                armEndX = idleHandX + wind * (baseArmX - idleHandX) - swingEase * 9.5 * dir * scale;
                armEndY = idleHandY + wind * (baseArmY - idleHandY) + swingEase * 2.0 * scale;

                activeLeftShoulderX -= dir * (0.6 * wind + swingEase * 1.18) * scale;
                activeLeftShoulderY += (0.2 * wind + swingEase * 0.52) * scale;
                activeRightShoulderX -= dir * (0.2 * wind + swingEase * 0.72) * scale;
                activeRightShoulderY += (0.2 * wind + swingEase * 0.48) * scale;
                break;
            }
            case 3: {
                swordAngle = -0.22 + Math.sin(progress * Math.PI) * 0.34;
                armEndX = centerX + dir * (-10 + easeInOut * 36) * scale;
                armEndY = pivotY + (9.0 - Math.sin(progress * Math.PI) * 3.1) * scale;
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
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 19.4 * scale);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 5.6 * scale);
                // 角度補間を最短パス（|diff| ≤ π）で行う
                // 2撃目終了角(≈0.14+2π=6.42)→3撃目開始角(-0.22)をそのまま補間すると
                // 剣が約2π回転してしまい短い縦線アーティファクトが生じるため正規化する
                let _angleDiff3 = swordAngle - prevAngle;
                while (_angleDiff3 > Math.PI) _angleDiff3 -= Math.PI * 2;
                while (_angleDiff3 < -Math.PI) _angleDiff3 += Math.PI * 2;
                swordAngle = prevAngle + _angleDiff3 * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                if (this.characterType === 'shogun') {
                    const thrustT = Math.max(0, Math.min(1, (progress - 0.28) / 0.5));
                    const flattenT = thrustT * thrustT * (3 - 2 * thrustT);
                    swordAngle += 0.13 * flattenT;
                    armEndY += 15.0 * scale * flattenT;
                }
                break;
            }
            case 4: {
                // 四段は体幹(playerRenderer)・脚・物理(normalComboMotion)がすべて raw 進行度で
                // フェーズ管理される（バク宙開始=raw 0.42）。剣ポーズだけ remap 後の progress を
                // 使うと raw 0.21 で先行してバク宙用の振りかぶりへ入り、上昇中に振りかぶって
                // 見えるため、剣ポーズも raw に同期させる。
                const p4 = rawProgress;
                // 上昇・バク宙による描画上の持ち上げ（胴体と手を同期させ、腕の消滅を防ぐ）
                const riseT = Math.min(1, p4 / 0.42);
                const riseEase = riseT * riseT * (3 - 2 * riseT);
                const riseLift = Math.sin(riseEase * Math.PI * 0.5) * 8.9 * 0.78 * scale;

                if (p4 < 0.42) {
                    // 上昇中は頭上への振りかぶりを行わず、モーション序盤の構え
                    // （手は前方・腰の高さ、刀はほぼ水平のやや上向き）を維持したまま体ごと上昇する
                    const rise = riseEase;
                    swordAngle = -0.22 + (-0.38 + 0.22) * rise;
                    armEndX = centerX + dir * (26 + (21.0 - 26) * rise) * scale;
                    armEndY = pivotY + (5 + (-1.0 - 5) * rise) * scale - riseLift;
                } else {
                    // 後方宙返り(raw 0.42〜0.86で1回転): 上昇時の構え（手前方・刀やや斜め上）を
                    // 体に固定したまま、体幹(playerRenderer側)と同位相のflipAngleで
                    // キャラクターごと反時計回り(後方回転)に回す。腕は独自に振らない。
                    const flipT = Math.max(0, Math.min(1, (p4 - 0.42) / 0.44));
                    const flipEase = flipT * flipT * (3 - 2 * flipT);
                    const spin = Math.PI * 2 * flipEase;
                    // 体幹の後方ドリフト(playerRendererのtorsoMidXと同期)
                    const drift = (0.8 + flipEase * 9.6) * scale;
                    const spinCenterX = centerX - dir * drift;
                    const spinCenterY = pivotY - riseLift;
                    const heldAngle = -0.38;
                    const relX = 21.0 * scale + drift;
                    const relY = -1.0 * scale;
                    const cosS = Math.cos(spin);
                    const sinS = Math.sin(spin);
                    armEndX = spinCenterX + dir * (relX * cosS + relY * sinS);
                    armEndY = spinCenterY + (-relX * sinS + relY * cosS);
                    swordAngle = heldAngle - spin;

                    // 宙返り完了後(raw 0.86〜): アイドルの構えへ復帰し、そのまま落下に備える。
                    // 攻撃終了後に描かれる本物のアイドル構え(options.idleKatanaPose, IK反映済み)を
                    // ブレンド先にして、落下中の構えとアイドルが完全に一致するようにする。
                    const recoverT = Math.max(0, Math.min(1, (p4 - 0.86) / 0.14));
                    if (recoverT > 0) {
                        const recover = recoverT * recoverT * (3 - 2 * recoverT);
                        const idlePose = options.idleKatanaPose || null;
                        const idleAngle = idlePose && Number.isFinite(idlePose.angle)
                            ? idlePose.angle
                            : (isCrouching ? -0.32 : -0.65);
                        const idleHandX = idlePose && Number.isFinite(idlePose.x)
                            ? idlePose.x
                            : centerX + dir * (isCrouching ? 12 : 15) * scale;
                        const idleHandY = idlePose && Number.isFinite(idlePose.y)
                            ? idlePose.y
                            : pivotY + (isCrouching ? 5.5 : 8.0) * scale;

                        let angleDiff = idleAngle - swordAngle;
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                        swordAngle += angleDiff * recover;
                        armEndX += (idleHandX - armEndX) * recover;
                        armEndY += (idleHandY - armEndY) * recover;
                        // サポート手(手前手)もアイドルの握り位置(刃元5.8/横1.0)へ揃える
                        supportGripBackDist += (5.8 - supportGripBackDist) * recover;
                        supportGripSideOffset += (1.0 - supportGripSideOffset) * recover;
                    }
                }
                const prepT = Math.max(0, Math.min(1, p4 / 0.18));
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
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 26 * scale);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 9.0 * scale);
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            case 5: {
                if (progress < 0.26) {
                    const t = progress / 0.26;
                    swordAngle = -2.52 + t * 0.24;
                    armEndX = centerX - dir * (15.6 - t * 5.8) * scale;
                    armEndY = pivotY + (-22.8 - t * 2.8) * scale;
                } else if (progress < 0.78) {
                    const t = (progress - 0.26) / 0.52;
                    const fallEase = t * t * (3 - 2 * t);
                    swordAngle = 0.1 + fallEase * 0.08;
                    armEndX = centerX + dir * (15.6 + fallEase * 1.8) * scale;
                    armEndY = pivotY + (12.8 + fallEase * 1.4) * scale;
                } else {
                    const t = (progress - 0.78) / 0.22;
                    const settle = t * t * (3 - 2 * t);
                    swordAngle = 0.18 - settle * 0.04;
                    armEndX = centerX + dir * (17.4 - settle * 0.8) * scale;
                    armEndY = pivotY + (14.2 - settle * 0.8) * scale;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevAngle = -2.7;
                const prevHandX = centerX - dir * 4.0 * scale;
                const prevHandY = pivotY - 18.0 * scale;
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            default:
                return null;
        }

        if (recoveryBlend > 0) {
            const recover = recoveryBlend * recoveryBlend * (3 - 2 * recoveryBlend);
            // 余韻からの戻り先は本物のアイドル構え(options.idleKatanaPose, IK反映済み)。
            // 旧近似定数(+15×scale)は腕が伸びた位置で、戻り中に一瞬腕が伸びる原因になる。
            const idlePose = options.idleKatanaPose || null;
            const idleAngle = idlePose && Number.isFinite(idlePose.angle)
                ? idlePose.angle
                : (isCrouching ? -0.32 : -0.65);
            const idleHandX = idlePose && Number.isFinite(idlePose.x)
                ? idlePose.x
                : centerX + dir * (isCrouching ? 12 : 15) * scale;
            const idleHandY = idlePose && Number.isFinite(idlePose.y)
                ? idlePose.y
                : pivotY + (isCrouching ? 5.5 : 8.0) * scale;

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
            // サポート手もアイドルの握り(刃元5.8/横1.0)へ揃える
            const supportBackTarget = idlePose ? 5.8 : 6.2 * scale;
            const supportSideTarget = idlePose ? 1.0 : 1.0 * scale;
            const supportReachTarget = idlePose ? 22.0 : 22.0 * scale;
            supportGripBackDist += (supportBackTarget - supportGripBackDist) * recover;
            supportGripSideOffset += (supportSideTarget - supportGripSideOffset) * recover;
            supportGripMaxReach += (supportReachTarget - supportGripMaxReach) * recover;
        }

        {
            const standardUpperLen = 13.6 * scale;
            const standardForeLen = 13.2 * scale;
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
        if (attack.comboStep === 1 || attack.comboStep === 2 || attack.comboStep === 3 || attack.comboStep === 4) {
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
                // 四段の剣ポーズは raw 進行度基準（case 4 参照）。リフト減衰も raw に揃える。
                // 終端のアイドル復帰区間(raw 0.86〜)では残差リフトもゼロへフェードし、
                // 落下中の構えがアイドルと完全に一致するようにする
                const earlyLiftT = Math.max(0, Math.min(1, 1 - rawProgress / 0.38));
                const liftFade = Math.max(0, Math.min(1, (1 - rawProgress) / 0.14));
                armEndY -= (2.2 + earlyLiftT * 8.4) * liftFade;
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
            trailCurveMidX: attack && Number.isFinite(attack.trailCurveMidX) ? attack.trailCurveMidX : undefined,
            trailCurveMidY: attack && Number.isFinite(attack.trailCurveMidY) ? attack.trailCurveMidY : undefined,
            trailCurveMidT: attack && Number.isFinite(attack.trailCurveMidT) ? attack.trailCurveMidT : undefined,
            trailCurveEndX,
            trailCurveEndY,
            trailRadius,
            trailCenterX,
            trailCenterY,
            trailIsRelative: attack ? attack.trailIsRelative : undefined,
            trailTransformPlayerX: attack && Number.isFinite(attack.trailTransformPlayerX)
                ? attack.trailTransformPlayerX
                : undefined,
            trailTransformPlayerY: attack && Number.isFinite(attack.trailTransformPlayerY)
                ? attack.trailTransformPlayerY
                : undefined,
            // step3/4: 剣筋ベジェに含まれる体移動量（各specのシミュレーション値）。
            // 将軍のワールドスケール投影(proj)が移動量を等倍のまま扱うために必要
            startDeltaX: attack && Number.isFinite(attack.startDeltaX) ? attack.startDeltaX : undefined,
            startDeltaY: attack && Number.isFinite(attack.startDeltaY) ? attack.startDeltaY : undefined,
            midDeltaX: attack && Number.isFinite(attack.midDeltaX) ? attack.midDeltaX : undefined,
            midDeltaY: attack && Number.isFinite(attack.midDeltaY) ? attack.midDeltaY : undefined,
            endDeltaX: attack && Number.isFinite(attack.endDeltaX) ? attack.endDeltaX : undefined,
            endDeltaY: attack && Number.isFinite(attack.endDeltaY) ? attack.endDeltaY : undefined
        };
    };

    PlayerClass.prototype.getComboSwordPoseForTrailState = function(state) {
        if (!state.isAttacking) return null;
        
        const swordPose = this.applyShogunStep3ReachToTrailPose(this.getComboSwordPoseState(state));
        if (!swordPose) return null;
        const trailWindow = this.getComboTrailProgressWindow(swordPose.comboStep);
        if (swordPose.progress < trailWindow.start || swordPose.progress > trailWindow.end) return null;
        let tipX = swordPose.trailTipX;
        let tipY = swordPose.trailTipY;
        return {
            comboStep: swordPose.comboStep,
            // 投影(_projectShogunTrailPoseToWorldScale)のアンカー解決に使う攻撃プロファイル。
            // これが無いと step4 のアンカーが this.currentAttack(本体)へフォールバックし、
            // ミラー分身の縦剣筋が「本体からの距離×scale」の位置へ投影されてX位置がずれる。
            attack: swordPose.attack,
            tipX,
            tipY,
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
            trailIsRelative: swordPose.trailIsRelative,
            trailTransformPlayerX: Number.isFinite(swordPose.trailTransformPlayerX)
                ? swordPose.trailTransformPlayerX
                : undefined,
            trailTransformPlayerY: Number.isFinite(swordPose.trailTransformPlayerY)
                ? swordPose.trailTransformPlayerY
                : undefined,
            // step3/4: 将軍のワールドスケール投影用の体移動量（getComboSwordPoseStateから転送）
            startDeltaX: Number.isFinite(swordPose.startDeltaX) ? swordPose.startDeltaX : undefined,
            startDeltaY: Number.isFinite(swordPose.startDeltaY) ? swordPose.startDeltaY : undefined,
            midDeltaX: Number.isFinite(swordPose.midDeltaX) ? swordPose.midDeltaX : undefined,
            midDeltaY: Number.isFinite(swordPose.midDeltaY) ? swordPose.midDeltaY : undefined,
            endDeltaX: Number.isFinite(swordPose.endDeltaX) ? swordPose.endDeltaX : undefined,
            endDeltaY: Number.isFinite(swordPose.endDeltaY) ? swordPose.endDeltaY : undefined
        };
    };

    PlayerClass.prototype.updateComboSlashTrail = function(deltaMs) {
        if (deltaMs <= 0) return;
        this.comboSlashTrailSampleState = {
            x: this.x,
            y: this.y,
            width: typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : PLAYER.WIDTH,
            height: typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : PLAYER.HEIGHT,
            facingRight: this.facingRight,
            isGrounded: this.isGrounded,
            comboStep: this.currentAttack ? (this.currentAttack.comboStep || 0) : 0,
            trailAttackId: this.currentAttack && Number.isFinite(this.currentAttack.trailAttackId)
                ? this.currentAttack.trailAttackId
                : null
        };
        let pose = this.getComboSwordPoseForTrail();

        const comboStep = this.currentAttack ? (this.currentAttack.comboStep || 0) : 0;
        
        // 凍結ベジェ曲線のフェード管理（メインバッファとは完全に独立）
        if (Array.isArray(this.comboSlashTrailFrozenCurves)) {
            for (let i = this.comboSlashTrailFrozenCurves.length - 1; i >= 0; i--) {
                const fc = this.comboSlashTrailFrozenCurves[i];
                fc.age = (fc.age || 0) + deltaMs;
                if (fc.oldestAge !== undefined) fc.oldestAge += deltaMs;
                if (['points', 'sampledBezier'].includes(fc.type)) {
                    if (Array.isArray(fc.frozenPoints)) {
                        for (const p of fc.frozenPoints) {
                            p.age = (p.age || 0) + deltaMs;
                        }
                    }
                    if (Array.isArray(fc.frozenCurvePoints)) {
                        for (const p of fc.frozenCurvePoints) {
                            p.age = (p.age || 0) + deltaMs;
                        }
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
        const sampleRangeEffectScale = (() => {
            const boostActive = typeof this.isXAttackBoostActive === 'function' && this.isXAttackBoostActive();
            const actionActive = typeof this.isXAttackActionActive === 'function' && this.isXAttackActionActive();
            if (!boostActive || !actionActive) return 1;
            if (typeof this.getXAttackRangeEffectScale === 'function') {
                return Math.max(1, this.getXAttackRangeEffectScale());
            }
            if (typeof this.getXAttackHitboxScale === 'function') {
                return Math.max(1, this.getXAttackHitboxScale());
            }
            return 1;
        })();
        this.comboSlashTrailSampleTimer = this.updateSlashTrailBuffer(
            this.comboSlashTrailPoints,
            this.comboSlashTrailSampleTimer,
            pose,
            deltaMs,
            {
                holdExisting,
                sampleTrailScale,
                sampleRangeEffectScale,
                continuousAge: true, // 通常コンボは全 step を連続 age の1本にし、後ろから消えるようにする
                activeTrailId: this.currentAttack && Number.isFinite(this.currentAttack.trailAttackId)
                    ? this.currentAttack.trailAttackId
                    : null
            }
        );
    };

    PlayerClass.prototype.updateSlashTrailBuffer = function(points, sampleTimer, pose, deltaMs, options = {}) {
        if (deltaMs <= 0) return sampleTimer;
        if (!Array.isArray(points)) return 0;
        const holdExisting = !!options.holdExisting;
        const sampleTrailScale = Number.isFinite(options.sampleTrailScale) ? options.sampleTrailScale : 1;
        const sampleRangeEffectScale = Number.isFinite(options.sampleRangeEffectScale) ? options.sampleRangeEffectScale : 1;
        const currentStep = pose ? (pose.comboStep || 0) : -1;
        const activeTrailId = Number.isFinite(options.activeTrailId) ? options.activeTrailId : null;
        const keepExistingPointStable = !!options.keepExistingPointStable;
        // 連続age: 進行中の段も各点を実時間で個別に老化させ、トレイル全体が連続した age を持つ
        // 1本になるようにする（最古=後ろから順に消える）。本体コンボ＋ミラー分身で有効。
        const continuousAge = !!options.continuousAge;
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
                if (Number.isFinite(p.trailCurveMidX)) p.trailCurveMidX += originX;
                if (Number.isFinite(p.trailCurveMidY)) p.trailCurveMidY += originY;
                if (Number.isFinite(p.trailCurveEndX)) p.trailCurveEndX += originX;
                if (Number.isFinite(p.trailCurveEndY)) p.trailCurveEndY += originY;
                p.trailIsRelative = false;
            }

            const matchesActiveTrail = (
                pose &&
                p.step === currentStep &&
                (activeTrailId === null || p.trailAttackId === activeTrailId)
            );
            // 5段目の確定済み斬撃（叩きつけ完了）は、刀の戻りモーションより先に消えるよう
            // 高速フェードさせ、剣筋が切っ先より下に残って見えないようにする
            const fastFade5 = (p.step === 5 && p.trailCurveFrozen === true);
            if (matchesActiveTrail && !fastFade5) {
                if (continuousAge) {
                    // 連続age: 進行中の段でも各点を実時間で個別に老化させる。段内に age 勾配ができ
                    //（切先=新/根元=古）、凍結後も全 step が連続 age の1本になり、最古(後ろ)から順に消える。
                    p.age = (p.age || 0) + deltaMs;
                } else {
                    // 従来(二刀流など): 現在進行中の段は鮮度を保つ（age=0リセット）
                    p.age = 0;
                }
                // lifeは生成時の値を維持（上書きしない）
            } else if (fastFade5) {
                // 全step共通の退き(ユーザー要望)。step5/戻り中も含め実時間1×で揃える。
                // 段ごとの老化レート差(旧 step5=1.4× / 戻り=0.85×)が「2刀step5だけ長い」等の不揃いの原因だった。
                p.age = (p.age || 0) + deltaMs;
            } else if (holdExisting) {
                // 戻りモーション中も実時間1×に統一(他段と完全に同速で後ろから退く)
                p.age = (p.age || 0) + deltaMs;
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
            const trailWindow = this.getComboTrailProgressWindow(currentPoseStep);
            const windowEnd = Number.isFinite(trailWindow.end) ? trailWindow.end : 1;
            const poseProgress = Number.isFinite(pose.progress) ? pose.progress : null;
            const lastProgress = last && Number.isFinite(last.progress) ? last.progress : null;
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
            const forceEndpointSample = !!(
                keepExistingPointStable &&
                last &&
                poseProgress !== null &&
                poseProgress >= windowEnd - 0.0015 &&
                (lastProgress === null || lastProgress < windowEnd - 0.0015) &&
                dist > 0.001
            );
            if (!last || points.length < 2 || dist >= 2.6 || nextSampleTimer <= 0 || forceEndpointSample) {
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
                    trailCurveMidX: Number.isFinite(pose.trailCurveMidX) ? pose.trailCurveMidX : undefined,
                    trailCurveMidY: Number.isFinite(pose.trailCurveMidY) ? pose.trailCurveMidY : undefined,
                    trailCurveMidT: Number.isFinite(pose.trailCurveMidT) ? pose.trailCurveMidT : undefined,
                    trailCurveEndX: Number.isFinite(pose.trailCurveEndX) ? pose.trailCurveEndX : undefined,
                    trailCurveEndY: Number.isFinite(pose.trailCurveEndY) ? pose.trailCurveEndY : undefined,
                    trailRadius: Number.isFinite(pose.trailRadius) ? pose.trailRadius : undefined,
                    centerX: Number.isFinite(pose.centerX) ? pose.centerX : undefined,
                    centerY: Number.isFinite(pose.centerY) ? pose.centerY : undefined,
                    trailIsRelative: pose.trailIsRelative,
                    playerX: Number.isFinite(pose.originX) ? pose.originX : this.x,
                    playerY: Number.isFinite(pose.originY) ? pose.originY : this.y,
                    trailTransformPlayerX: Number.isFinite(pose.trailTransformPlayerX)
                        ? pose.trailTransformPlayerX
                        : (!pose.trailIsRelative && Number.isFinite(pose.originX) ? pose.originX : undefined),
                    trailTransformPlayerY: Number.isFinite(pose.trailTransformPlayerY)
                        ? pose.trailTransformPlayerY
                        : (!pose.trailIsRelative && Number.isFinite(pose.originY) ? pose.originY : undefined),
                    step: currentPoseStep,
                    trailAttackId: activeTrailId,
                    trailScale: sampleTrailScale,
                    trailRangeScale: sampleRangeEffectScale,
                    age: 0,
                    life: this.comboSlashTrailActiveLifeMs,
                    seed: Math.random() * Math.PI * 2
                });
                nextSampleTimer = this.comboSlashTrailSampleIntervalMs;
            } else {
                if (keepExistingPointStable) {
                    last.trailAttackId = activeTrailId;
                    last.trailScale = Math.max(Number.isFinite(last.trailScale) ? last.trailScale : 1, sampleTrailScale);
                    last.trailRangeScale = Math.max(Number.isFinite(last.trailRangeScale) ? last.trailRangeScale : 1, sampleRangeEffectScale);
                    last.age = Math.max(0, last.age - deltaMs * 0.7);
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
                    last.trailCurveMidX = Number.isFinite(pose.trailCurveMidX) ? pose.trailCurveMidX : last.trailCurveMidX;
                    last.trailCurveMidY = Number.isFinite(pose.trailCurveMidY) ? pose.trailCurveMidY : last.trailCurveMidY;
                    last.trailCurveMidT = Number.isFinite(pose.trailCurveMidT) ? pose.trailCurveMidT : last.trailCurveMidT;
                    last.trailCurveEndX = Number.isFinite(pose.trailCurveEndX) ? pose.trailCurveEndX : last.trailCurveEndX;
                    last.trailCurveEndY = Number.isFinite(pose.trailCurveEndY) ? pose.trailCurveEndY : last.trailCurveEndY;
                    last.trailRadius = Number.isFinite(pose.trailRadius) ? pose.trailRadius : last.trailRadius;
                    last.centerX = Number.isFinite(pose.centerX) ? pose.centerX : last.centerX;
                    last.centerY = Number.isFinite(pose.centerY) ? pose.centerY : last.centerY;
                    last.trailIsRelative = pose.trailIsRelative !== undefined ? pose.trailIsRelative : last.trailIsRelative;
                    last.playerX = Number.isFinite(pose.originX) ? pose.originX : last.playerX;
                    last.playerY = Number.isFinite(pose.originY) ? pose.originY : last.playerY;
                    last.trailTransformPlayerX = Number.isFinite(pose.trailTransformPlayerX)
                        ? pose.trailTransformPlayerX
                        : (!last.trailIsRelative && Number.isFinite(last.trailTransformPlayerX)
                            ? last.trailTransformPlayerX
                            : (!last.trailIsRelative ? last.playerX : undefined));
                    last.trailTransformPlayerY = Number.isFinite(pose.trailTransformPlayerY)
                        ? pose.trailTransformPlayerY
                        : (!last.trailIsRelative && Number.isFinite(last.trailTransformPlayerY)
                            ? last.trailTransformPlayerY
                            : (!last.trailIsRelative ? last.playerY : undefined));
                    last.step = currentPoseStep;
                    last.trailAttackId = activeTrailId;
                    last.trailScale = sampleTrailScale;
                    last.trailRangeScale = sampleRangeEffectScale;
                    last.age = Math.max(0, last.age - deltaMs * 0.7);
                }
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
        if (deltaMs <= 0) return;
        const count = this.specialCloneSlots ? this.specialCloneSlots.length : 0;
        if (count <= 0) return;
        // 本体のアクティブ忍具（忍者・将軍とも自身の currentSubWeapon の二刀流）から振りポーズを取得し、
        // 分身の二刀トレイルを本体と同位相で生成する。
        const bodyActiveSubWeapon = this.getActiveSubWeaponInstance();
        const dualBlade = (
            bodyActiveSubWeapon &&
            bodyActiveSubWeapon.name === '二刀流' &&
            typeof bodyActiveSubWeapon.getMainSwingPose === 'function'
        ) ? bodyActiveSubWeapon : null;
        if (!Array.isArray(this.specialCloneSlashTrailPoints)) {
            this.specialCloneSlashTrailPoints = [];
        }
        if (!Array.isArray(this.specialCloneSlashTrailSampleTimers)) {
            this.specialCloneSlashTrailSampleTimers = [];
        }
        if (!Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
            this.specialCloneSlashTrailBoostAnchors = [];
        }
        if (!Array.isArray(this.specialCloneSlashTrailFrozenCurves)) {
            this.specialCloneSlashTrailFrozenCurves = [];
        }
        if (!Array.isArray(this.specialCloneLastSlashTrailIds)) {
            this.specialCloneLastSlashTrailIds = [];
        }
        if (!Array.isArray(this.specialCloneDualBackTrailPoints)) {
            this.specialCloneDualBackTrailPoints = [];
            this.specialCloneDualFrontTrailPoints = [];
            this.specialCloneDualBackTrailSampleTimers = [];
            this.specialCloneDualFrontTrailSampleTimers = [];
            this.specialCloneDualLastSwingIds = [];
        }
        const specialCloneTrailScale = typeof this.getXAttackTrailWidthScale === 'function'
            ? this.getXAttackTrailWidthScale()
            : 1;
        const baseSpecialCloneRangeEffectScale = (() => {
            const boostActive = typeof this.isXAttackBoostActive === 'function' && this.isXAttackBoostActive();
            const actionActive = typeof this.isXAttackActionActive === 'function' && this.isXAttackActionActive();
            if (!boostActive || !actionActive) return 1;
            if (typeof this.getXAttackRangeEffectScale === 'function') {
                return Math.max(1, this.getXAttackRangeEffectScale());
            }
            if (typeof this.getXAttackHitboxScale === 'function') {
                return Math.max(1, this.getXAttackHitboxScale());
            }
            return 1;
        })();

        for (let i = 0; i < count; i++) {
            if (!Array.isArray(this.specialCloneSlashTrailPoints[i])) {
                this.specialCloneSlashTrailPoints[i] = [];
            }
            if (!Number.isFinite(this.specialCloneSlashTrailSampleTimers[i])) {
                this.specialCloneSlashTrailSampleTimers[i] = 0;
            }
            if (
                !this.specialCloneSlashTrailBoostAnchors[i] ||
                typeof this.specialCloneSlashTrailBoostAnchors[i] !== 'object' ||
                Array.isArray(this.specialCloneSlashTrailBoostAnchors[i])
            ) {
                this.specialCloneSlashTrailBoostAnchors[i] = {};
            }
            if (!Array.isArray(this.specialCloneSlashTrailFrozenCurves[i])) {
                this.specialCloneSlashTrailFrozenCurves[i] = [];
            }
            if (!Number.isFinite(this.specialCloneLastSlashTrailIds[i])) {
                this.specialCloneLastSlashTrailIds[i] = -1;
            }
            if (typeof this.ageSlashTrailFrozenCurves === 'function') {
                this.ageSlashTrailFrozenCurves(this.specialCloneSlashTrailFrozenCurves[i], deltaMs);
            }
            if (!Array.isArray(this.specialCloneDualBackTrailPoints[i])) {
                this.specialCloneDualBackTrailPoints[i] = [];
                this.specialCloneDualFrontTrailPoints[i] = [];
                this.specialCloneDualBackTrailSampleTimers[i] = 0;
                this.specialCloneDualFrontTrailSampleTimers[i] = 0;
                this.specialCloneDualLastSwingIds[i] = -1;
            }

            const pos = this.specialClonePositions[i];
            const isAlive = this.specialCloneAlive && this.specialCloneAlive[i];
            let pose = null;
            let activeTrailId = null;
            let activeAttackProfile = null;
            let previousFreezeAttackProfile = null;
            let specialCloneRangeEffectScale = baseSpecialCloneRangeEffectScale;

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
                const cloneNormalActionActive = !!(
                    isAutoAi &&
                    (this.specialCloneAttackTimers[i] || 0) > 0 &&
                    this.specialCloneCurrentAttacks &&
                    this.specialCloneCurrentAttacks[i]
                );
                specialCloneRangeEffectScale = (() => {
                    if (baseSpecialCloneRangeEffectScale > 1.01) return baseSpecialCloneRangeEffectScale;
                    const boostActive = typeof this.isXAttackBoostActive === 'function' && this.isXAttackBoostActive();
                    if (!boostActive || !(dualActionActive || cloneNormalActionActive)) return 1;
                    if (typeof this.getXAttackRangeEffectScale === 'function') {
                        const scaled = Math.max(1, this.getXAttackRangeEffectScale());
                        if (scaled > 1.01) return scaled;
                    }
                    if (typeof this.getXAttackHitboxScale === 'function') {
                        const scaled = Math.max(1, this.getXAttackHitboxScale());
                        if (scaled > 1.01) return scaled;
                    }
                    return 2.45;
                })();
                // 二刀Z終了後にバッファへ残った剣筋は、本体と同様に老化フェードで消す
                // （消化は共通コアに任せる。クリアによる即消しはしない）
                if (!dualActionActive &&
                    (this.specialCloneDualBackTrailPoints[i].length > 0 ||
                     this.specialCloneDualFrontTrailPoints[i].length > 0)) {
                    const fadeResult = this.updateDualTrailState(deltaMs, {
                        active: false,
                        comboStep: 0,
                        progress: 0,
                        swingId: dualBlade ? (dualBlade._swingId || 0) : 0,
                        backPose: null,
                        frontPose: null,
                        backPoints: this.specialCloneDualBackTrailPoints[i],
                        frontPoints: this.specialCloneDualFrontTrailPoints[i],
                        backSampleTimer: this.specialCloneDualBackTrailSampleTimers[i],
                        frontSampleTimer: this.specialCloneDualFrontTrailSampleTimers[i],
                        lastSwingId: this.specialCloneDualLastSwingIds[i],
                        trailScale: specialCloneTrailScale,
                        rangeEffectScale: specialCloneRangeEffectScale
                    });
                    this.specialCloneDualBackTrailSampleTimers[i] = fadeResult.backSampleTimer;
                    this.specialCloneDualFrontTrailSampleTimers[i] = fadeResult.frontSampleTimer;
                    this.specialCloneDualLastSwingIds[i] = fadeResult.lastSwingId;
                }
                if (dualActionActive) {
                    // ミラー分身(Lv1-2)は本体の comboIndex を共有するため、整定中の 0(=5段目)リセットで
                    // 本体同様ファントム step5 剣筋が出る。本体と同じく _dualZSettleComboIndex で振っていた段に固定する。
                    const comboStep = isAutoAi
                        ? (Number.isFinite(this.specialCloneComboSteps[i]) ? this.specialCloneComboSteps[i] : 1)
                        : ((!dualBlade.isAttacking && (this._dualZSettleTimer || 0) > 0 && Number.isFinite(this._dualZSettleComboIndex))
                            ? this._dualZSettleComboIndex
                            : (Number.isFinite(dualBlade.comboIndex) ? dualBlade.comboIndex : 1));
                    // Lv1-2(ミラー)は本体の振り進行そのもの（本体と同じ attackTimer 基準）、
                    // Lv3自律分身は分身専用タイマーから進行度を取る
                    const progress = isAutoAi
                        ? dualBlade.getMainSwingProgress({ attackTimer: dualTimer })
                        : dualBlade.getMainSwingProgress();
                    let backPose = null;
                    let frontPose = null;
                    const liveAnchors = Array.isArray(this.specialCloneDualTrailAnchors)
                        ? this.specialCloneDualTrailAnchors[i]
                        : null;

                    if (liveAnchors && liveAnchors.back && liveAnchors.front) {
                        backPose = {
                            tipX: liveAnchors.back.tipX,
                            tipY: liveAnchors.back.tipY,
                            dir: liveAnchors.direction,
                            comboStep,
                            progress,
                            centerX: liveAnchors.back.handX,
                            centerY: liveAnchors.back.handY,
                            originX: Number.isFinite(liveAnchors.originX) ? liveAnchors.originX : pos.x,
                            originY: Number.isFinite(liveAnchors.originY) ? liveAnchors.originY : (cloneDrawY + this.getWorldHeight() * 0.5),
                            trailTransformPlayerX: Number.isFinite(liveAnchors.originX) ? liveAnchors.originX : pos.x,
                            trailTransformPlayerY: Number.isFinite(liveAnchors.originY) ? liveAnchors.originY : (cloneDrawY + this.getWorldHeight() * 0.5)
                        };
                        frontPose = {
                            tipX: liveAnchors.front.tipX,
                            tipY: liveAnchors.front.tipY,
                            dir: liveAnchors.direction,
                            comboStep,
                            progress,
                            centerX: liveAnchors.front.handX,
                            centerY: liveAnchors.front.handY,
                            originX: Number.isFinite(liveAnchors.originX) ? liveAnchors.originX : pos.x,
                            originY: Number.isFinite(liveAnchors.originY) ? liveAnchors.originY : (cloneDrawY + this.getWorldHeight() * 0.5),
                            trailTransformPlayerX: Number.isFinite(liveAnchors.originX) ? liveAnchors.originX : pos.x,
                            trailTransformPlayerY: Number.isFinite(liveAnchors.originY) ? liveAnchors.originY : (cloneDrawY + this.getWorldHeight() * 0.5)
                        };
                    }

                    // サンプリング窓・寿命・スイング切替・step4整形は本体と同一の共通コアで処理する
                    const result = this.updateDualTrailState(deltaMs, {
                        active: true,
                        comboStep,
                        progress,
                        swingId: dualBlade._swingId || 0,
                        backPose,
                        frontPose,
                        backPoints: this.specialCloneDualBackTrailPoints[i],
                        frontPoints: this.specialCloneDualFrontTrailPoints[i],
                        backSampleTimer: this.specialCloneDualBackTrailSampleTimers[i],
                        frontSampleTimer: this.specialCloneDualFrontTrailSampleTimers[i],
                        lastSwingId: this.specialCloneDualLastSwingIds[i],
                        trailScale: specialCloneTrailScale,
                        rangeEffectScale: specialCloneRangeEffectScale
                    });
                    this.specialCloneDualBackTrailSampleTimers[i] = result.backSampleTimer;
                    this.specialCloneDualFrontTrailSampleTimers[i] = result.frontSampleTimer;
                    this.specialCloneDualLastSwingIds[i] = result.lastSwingId;

                    // 通常剣筋はリセット
                    this.freezeSpecialCloneSlashTrail(i, {
                        pos,
                        attack: this.specialCloneCurrentAttacks ? this.specialCloneCurrentAttacks[i] : null,
                        footY: this.getSpecialCloneFootY(pos.y),
                        ageNewMs: deltaMs
                    });
                    this.specialCloneLastSlashTrailIds[i] = -1;
                    continue;
                } else {
                    const isAttacking = isAutoAi
                        ? ((this.specialCloneAttackTimers[i] || 0) > 0)
                        : !!this.isAttacking;
                    if (!isAttacking) {
                        const lastStep = this.specialCloneSlashTrailPoints[i][this.specialCloneSlashTrailPoints[i].length - 1]?.step || 0;
                        const attackForFreeze = isAutoAi
                            ? (this.specialCloneCurrentAttacks ? this.specialCloneCurrentAttacks[i] : null)
                            : (Array.isArray(this.specialCloneMirroredTrailProfiles)
                                ? (this.specialCloneMirroredTrailProfiles[i] || this.currentAttack)
                                : this.currentAttack);
                        this.freezeSpecialCloneSlashTrail(i, {
                            pos,
                            attack: attackForFreeze,
                            footY: this.getSpecialCloneFootY(pos.y),
                            ageNewMs: deltaMs
                        });
                        this.specialCloneLastSlashTrailIds[i] = -1;
                        if (isAutoAi && lastStep > 0 && !this.shouldKeepComboTrailDuringReturn(lastStep)) {
                            this.specialCloneSlashTrailPoints[i].length = 0;
                            this.specialCloneSlashTrailSampleTimers[i] = 0;
                            if (Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                                this.specialCloneSlashTrailBoostAnchors[i] = {};
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
                    const isShogunClone = this.characterType === 'shogun';
                    const poseWidth = isShogunClone ? PLAYER.WIDTH : this.getWorldWidth();
                    const poseHeight = isShogunClone ? PLAYER.HEIGHT : this.getWorldHeight();
                    const livePoseOriginX = isShogunClone
                        ? pos.x - this.getWorldWidth() * 0.5
                        : pos.x - poseWidth * 0.5;
                    const livePoseOriginY = isShogunClone
                        ? this.getSpecialCloneTrailBoxY(pos.y)
                        : cloneDrawY;
                    const poseOriginX = livePoseOriginX;
                    const poseOriginY = livePoseOriginY;
                    const hasOverride = !isAutoAi && this.specialCloneCurrentAttacks[i] != null;
                    const comboStep = (isAutoAi || hasOverride)
                        ? (this.specialCloneComboSteps[i] || 1)
                        : (this.currentAttack ? this.currentAttack.comboStep || 1 : 1);
                    previousFreezeAttackProfile = (isAutoAi || hasOverride)
                        ? (this.specialCloneCurrentAttacks ? this.specialCloneCurrentAttacks[i] : null)
                        : (Array.isArray(this.specialCloneMirroredTrailProfiles)
                            ? this.specialCloneMirroredTrailProfiles[i]
                            : null);
                    let attackProfile;
                    if (isAutoAi || hasOverride) {
                        const cachedProfile = this.specialCloneCurrentAttacks[i] || null;
                        if (cachedProfile) {
                            attackProfile = cachedProfile;
                        } else {
                            attackProfile = this.applyComboTrailSpecToAttackProfile(
                                this.getComboAttackProfileByStep(comboStep),
                                {
                                    x: poseOriginX,
                                    y: poseOriginY,
                                    width: poseWidth,
                                    height: poseHeight,
                                    facingRight: pos.facingRight,
                                    isCrouching: false,
                                    isGrounded: !pos.jumping,
                                    groundY: this.groundY,
                                    renderScale: this.scaleMultiplier,
                                    scaleMultiplier: this.scaleMultiplier,
                                    vx: Number.isFinite(pos.cloneVx) ? pos.cloneVx : this.vx,
                                    vy: Number.isFinite(pos.cloneVy) ? pos.cloneVy : this.vy,
                                    speed: this.speed,
                                    trailPoints: this.specialCloneSlashTrailPoints[i]
                                }
                            );
                        }
                    } else {
                        attackProfile = this.getMirroredCloneTrailProfile(i, pos, cloneDrawY);
                    }
                    activeTrailId = attackProfile && Number.isFinite(attackProfile.trailAttackId)
                        ? attackProfile.trailAttackId
                        : null;
                    activeAttackProfile = attackProfile || null;
                    const attackTimer = (isAutoAi || hasOverride)
                        ? (this.specialCloneAttackTimers[i] || 0)
                        : this.attackTimer;
                    let samplePoseOriginX = poseOriginX;
                    let samplePoseOriginY = poseOriginY;
                    let sampleGrounded = !pos.jumping;
                    const mirrorSampleState = this.comboSlashTrailSampleState;
                    if (
                        !isAutoAi &&
                        !hasOverride &&
                        mirrorSampleState &&
                        mirrorSampleState.trailAttackId === activeTrailId
                    ) {
                        if (Number.isFinite(mirrorSampleState.x) && Number.isFinite(this.x)) {
                            samplePoseOriginX -= (this.x - mirrorSampleState.x);
                        }
                        if (Number.isFinite(mirrorSampleState.y) && Number.isFinite(this.y)) {
                            samplePoseOriginY -= (this.y - mirrorSampleState.y);
                        }
                        if (typeof mirrorSampleState.isGrounded === 'boolean') {
                            sampleGrounded = mirrorSampleState.isGrounded;
                        }
                    }
                    if (attackProfile && attackProfile.comboStep === 5) {
                        const step5TrailSync = typeof this.resolveNormalComboStep5TrailSync === 'function'
                            ? this.resolveNormalComboStep5TrailSync(attackProfile, {
                                x: samplePoseOriginX,
                                y: samplePoseOriginY,
                                width: poseWidth,
                                height: poseHeight,
                                facingRight: pos.facingRight,
                                isCrouching: false,
                                attackTimer
                            }, { deltaMs })
                            : { actualTipSpec: null, renderProgress: null };
                        freezeNormalComboFinisherTrailCurve(attackProfile, {
                            attackTimer,
                            groundY: this.groundY,
                            ownerHeight: this.getWorldHeight(),
                            trailPoints: this.specialCloneSlashTrailPoints[i],
                            isGrounded: sampleGrounded,
                            actualTipSpec: step5TrailSync.actualTipSpec,
                            renderProgress: step5TrailSync.renderProgress,
                            projectPoint: (px, py) => (typeof this.projectComboTrailSpecPointToWorld === 'function'
                                ? this.projectComboTrailSpecPointToWorld(attackProfile, px, py)
                                : { x: px, y: py })
                        });
                    }
                    pose = this.getComboSwordPoseForTrail({
                        isAttacking: true,
                        currentAttack: attackProfile,
                        attackTimer,
                        facingRight: pos.facingRight,
                        x: samplePoseOriginX,
                        y: samplePoseOriginY,
                        width: poseWidth,
                        height: poseHeight,
                        isCrouching: false
                    });
                    if (pose) {
                        pose.originX = samplePoseOriginX;
                        pose.originY = samplePoseOriginY;
                        pose.trailTransformPlayerX = Number.isFinite(pose.trailTransformPlayerX)
                            ? pose.trailTransformPlayerX
                            : (!pose.trailIsRelative ? samplePoseOriginX : undefined);
                        pose.trailTransformPlayerY = Number.isFinite(pose.trailTransformPlayerY)
                            ? pose.trailTransformPlayerY
                            : (!pose.trailIsRelative ? samplePoseOriginY : undefined);
                    }
                    if (
                        !isAutoAi &&
                        !hasOverride &&
                        comboStep === 1 &&
                        activeTrailId !== null
                    ) {
                        const bodyHasStep1Sample = Array.isArray(this.comboSlashTrailPoints) &&
                            this.comboSlashTrailPoints.some((pt) =>
                                pt &&
                                pt.step === 1 &&
                                pt.trailAttackId === activeTrailId
                            );
                        if (!bodyHasStep1Sample) {
                            pose = null;
                        }
                    }
                    if (isAutoAi && !pose && comboStep > 0 && !this.shouldKeepComboTrailDuringReturn(comboStep)) {
                        this.freezeSpecialCloneSlashTrail(i, {
                            pos,
                            attack: attackProfile,
                            footY: this.getSpecialCloneFootY(pos.y),
                            ageNewMs: deltaMs
                        });
                        this.specialCloneLastSlashTrailIds[i] = -1;
                        this.specialCloneSlashTrailPoints[i].length = 0;
                        this.specialCloneSlashTrailSampleTimers[i] = 0;
                        if (Array.isArray(this.specialCloneMirroredTrailProfiles)) {
                            this.specialCloneMirroredTrailProfiles[i] = null;
                        }
                        if (Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                            this.specialCloneSlashTrailBoostAnchors[i] = {};
                        }
                        continue;
                    }
                }
            }

            if (activeTrailId !== null) {
                const lastTrailId = this.specialCloneLastSlashTrailIds[i];
                if (lastTrailId !== -1 && lastTrailId !== activeTrailId) {
                    this.freezeSpecialCloneSlashTrail(i, {
                        pos,
                        attack: previousFreezeAttackProfile || activeAttackProfile,
                        footY: pos && typeof this.getSpecialCloneFootY === 'function'
                            ? this.getSpecialCloneFootY(pos.y)
                            : undefined,
                        ageNewMs: deltaMs
                    });
                    this.specialCloneSlashTrailSampleTimers[i] = 0;
                }
                this.specialCloneLastSlashTrailIds[i] = activeTrailId;
            } else {
                this.specialCloneLastSlashTrailIds[i] = -1;
            }

            this.specialCloneSlashTrailSampleTimers[i] = this.updateSlashTrailBuffer(
                this.specialCloneSlashTrailPoints[i],
                this.specialCloneSlashTrailSampleTimers[i],
                pose,
                deltaMs,
                {
                    holdExisting: !!(isAlive && pos && !pose),
                    activeTrailId,
                    continuousAge: true, // 本体コンボと統一(連続age→後ろから消える)
                    sampleTrailScale: specialCloneTrailScale,
                    sampleRangeEffectScale: specialCloneRangeEffectScale
                }
            );
            if (Array.isArray(this.specialCloneSlashTrailBoostAnchors) && this.specialCloneSlashTrailPoints[i].length === 0) {
                this.specialCloneSlashTrailBoostAnchors[i] = {};
            }
            // ミラープロファイルは「本体の攻撃が続く間」保持する。
            // pose は進行度が描画窓(例: step5 は 0.94)を超えると null になるため、
            // !pose で破棄すると窓超え後に毎フレーム「現在位置基準」で再構築され、
            // 空中発動step5では着地後の体位置で start/control/end が作り直されて
            // 「上空の古い始点 + 地上基準の新カーブ」が混ざり剣筋のカーブが消える。
            const bodyComboActive = !!(this.isAttacking && this.currentAttack);
            if ((!isAlive || !pos || !bodyComboActive) && Array.isArray(this.specialCloneMirroredTrailProfiles) && !this.specialCloneAutoAiEnabled) {
                this.specialCloneMirroredTrailProfiles[i] = null;
            }
            if (this.specialCloneSlashTrailPoints[i].length > 96) {
                this.specialCloneSlashTrailPoints[i].splice(0, this.specialCloneSlashTrailPoints[i].length - 96);
            }
            if (this.specialCloneDualBackTrailPoints[i].length > 96) {
                this.specialCloneDualBackTrailPoints[i].splice(0, this.specialCloneDualBackTrailPoints[i].length - 96);
            }
            if (this.specialCloneDualFrontTrailPoints[i].length > 96) {
                this.specialCloneDualFrontTrailPoints[i].splice(0, this.specialCloneDualFrontTrailPoints[i].length - 96);
            }
        }
    };

    PlayerClass.prototype.renderComboSlashTrail = function(ctx, options = {}) {
        const renderOptions = options;
        const usesExternalPoints = Array.isArray(options.points);
        const points = usesExternalPoints ? options.points : this.comboSlashTrailPoints;
        const activePoints = Array.isArray(points) ? points : [];
        const usesExternalFrozenCurves = Array.isArray(options.frozenCurves);
        const frozenCurves = usesExternalFrozenCurves
            ? options.frozenCurves
            : (!usesExternalPoints && Array.isArray(this.comboSlashTrailFrozenCurves) ? this.comboSlashTrailFrozenCurves : []);

        // フェードの決め方を選ぶフラグ。
        //  ・通常コンボ/大薙(continuousAge で各点が連続 age を持つ): グラデ(薄→濃)と消え方を分離する。
        //      - 明暗グラデ = トレイル内の「相対位置」(全点の age 範囲で正規化)。step 境界でリセットせず
        //        最古=薄→切先=濃 の1本に繋がる。life を変えてもグラデの濃淡は一定。
        //      - 持続/後退 = 各点の「絶対 age」(1-age/life)。古い点ほど薄く、age=life で消える＝後ろから後退。
        //    こうすると「綺麗なグラデ」と「元どおりの持続」と「後ろから消える」を同時に満たせる。
        //  ・二刀流(forceLinearSmooth): 各カーブは均一 age なので従来の位置ベース彗星×age を維持。
        const _trailAgeBasedFade = !options.forceLinearSmooth;
        // 相対グラデ用に、いま描画中の全点(ライブ＋凍結)の age 範囲を求める。
        let _trailMinAge = Infinity, _trailMaxAge = 0; // min=切先側(新) / max=根本側(最古)
        for (const p of activePoints) {
            const a = (p && Number.isFinite(p.age)) ? Math.max(0, p.age) : 0;
            if (a < _trailMinAge) _trailMinAge = a;
            if (a > _trailMaxAge) _trailMaxAge = a;
        }
        for (const fc of frozenCurves) {
            if (!fc || (fc.age || 0) >= (fc.life || 1)) continue;
            const aN = Number.isFinite(fc.age) ? Math.max(0, fc.age) : 0;
            const aO = Math.max(aN, Number.isFinite(fc.oldestAge) ? fc.oldestAge : aN);
            if (aN < _trailMinAge) _trailMinAge = aN;
            if (aO > _trailMaxAge) _trailMaxAge = aO;
        }
        if (!Number.isFinite(_trailMinAge)) _trailMinAge = 0;
        const _trailAgeSpan = Math.max(1, _trailMaxAge - _trailMinAge);
        const getBoostAnchor = typeof options.getBoostAnchor === 'function'
            ? options.getBoostAnchor
            : ((step) => this.comboSlashTrailBoostAnchors ? this.comboSlashTrailBoostAnchors[step] : null);
        const setBoostAnchor = typeof options.setBoostAnchor === 'function'
            ? options.setBoostAnchor
            : ((step, value) => { 
                if (!this.comboSlashTrailBoostAnchors) this.comboSlashTrailBoostAnchors = {};
                if (step === null || step === undefined) {
                    this.comboSlashTrailBoostAnchors = {};
                } else if (value) {
                    this.comboSlashTrailBoostAnchors[step] = value;
                } else {
                    delete this.comboSlashTrailBoostAnchors[step];
                }
              });
        const sourceIsAttacking = options.isAttacking !== undefined
            ? !!options.isAttacking
            : this.isAttacking;
        if (!usesExternalPoints && sourceIsAttacking && activePoints.length > 0) {
            const latestPoint = activePoints[activePoints.length - 1];
            const renderedStep3Tip = (
                latestPoint &&
                latestPoint.step === 3 &&
                !Number.isFinite(latestPoint.trailCurveEndX) &&
                typeof this.getRenderedComboStep3TipForTrail === 'function'
            )
                ? this.getRenderedComboStep3TipForTrail(latestPoint, renderOptions)
                : null;
            if (renderedStep3Tip) {
                latestPoint.x = renderedStep3Tip.x;
                latestPoint.y = renderedStep3Tip.y;
            }
        }
        const initialStep = activePoints.length > 0
            ? (activePoints[activePoints.length - 1]?.step || activePoints[0]?.step || 0)
            : 0;
        const hasFrozenCurves = Array.isArray(frozenCurves) && frozenCurves.length > 0;
        
        // ベジェ曲線/弧を使っている段（1, 2, 4, 5）は1つのポイントに全データが入っているため、points.length < 2 でも描画可能
        const isSelfContainedStep = [1, 2, 4, 5].includes(initialStep);
        if (activePoints.length < 1 || (activePoints.length < 2 && !isSelfContainedStep)) {
            if (hasFrozenCurves) {
                // 凍結済みトレイルだけが残っている場合は、この後の frozenCurves 描画へ進む。
            } else {
                setBoostAnchor(null);
                return;
            }
        }
        const storedTrailScale = activePoints.reduce((max, p) => {
            const s = (p && Number.isFinite(p.trailScale)) ? p.trailScale : 1;
            return Math.max(max, s);
        }, 1);
        const liveTrailScale = this.getXAttackTrailWidthScale();
        const trailWidthScale = Number.isFinite(options.trailWidthScale)
            ? options.trailWidthScale
            : Math.max(liveTrailScale, storedTrailScale);
        const storedRangeEffectScale = activePoints.reduce((max, p) => {
            const s = (p && Number.isFinite(p.trailRangeScale)) ? p.trailRangeScale : 1;
            return Math.max(max, s);
        }, 1);
        const physicalScale = Number.isFinite(options.physicalScale) ? options.physicalScale : 1.0;
        const normalWidthScale = 1.0;
        const hasStoredBoostTrail = trailWidthScale > 1.01;
        const baseBoostActive = options.boostActive !== undefined
            ? !!options.boostActive
            : (hasStoredBoostTrail && sourceIsAttacking);
        const visualWidthScale = (!baseBoostActive && trailWidthScale > 1.01)
            ? trailWidthScale
            : normalWidthScale;
        const xRangeEffectScale = (() => {
            if (Number.isFinite(options.xRangeEffectScale)) return Math.max(1, options.xRangeEffectScale);
            if (storedRangeEffectScale > 1.01) return storedRangeEffectScale;
            if (typeof this.getXAttackRangeEffectScale === 'function') {
                return Math.max(1, this.getXAttackRangeEffectScale());
            }
            if (typeof this.getXAttackHitboxScale === 'function') {
                return Math.max(1, this.getXAttackHitboxScale());
            }
            return 1;
        })();
        const xRangeEffectActive = options.xRangeEffectActive !== undefined
            ? !!options.xRangeEffectActive
            : (
                xRangeEffectScale > 1.01 &&
                (
                    storedRangeEffectScale > 1.01 ||
                    (
                        typeof this.isXAttackBoostActive === 'function' &&
                        typeof this.isXAttackActionActive === 'function' &&
                        this.isXAttackBoostActive() &&
                        this.isXAttackActionActive()
                    )
                )
            );
        if (!baseBoostActive && !hasStoredBoostTrail) {
            if (this.comboSlashTrailBoostAnchors && !usesExternalPoints) {
                this.comboSlashTrailBoostAnchors = {};
            }
        }
        // 大薙(大凪)発動中は「通常サイズの剣筋」を隠し、大薙の範囲エフェクト(drawOonagiRangeEffect)だけ見せる。
        // ベース剣筋の実描画は drawGradientLinearTrail に集約されるため、ストリップ描画中だけ
        // _oonagiSuppressStroke を立ててベースストロークを抑止し、drawOonagiRangeEffect は自身の
        // ストロークを許可するため一時的にフラグを下ろす（凍結カーブ描画には影響させない）。
        const oonagiHideBaseTrail = xRangeEffectActive;
        let _oonagiSuppressStroke = false;
        let trailCenterX = Number.isFinite(options.centerX)
            ? options.centerX
            : (this.x + this.getWorldWidth() * 0.5);
        let trailCenterY = Number.isFinite(options.centerY)
            ? options.centerY
            : (this.y + this.getWorldHeight() * 0.5);
        const clamp01 = (v) => Math.max(0, Math.min(1, v));
        const colorRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp01(alpha)})`;

        // 整理・削減処理を行う前に、まず「物理的」に段数でストリップを分割する
        // これを後で行うと、異なる段数の点が混ぜられて計算（ageやstep）が破壊される
        const rawStrips = [];
        if (activePoints.length > 0) {
            let currentStrip = [activePoints[0]];
            rawStrips.push(currentStrip);
            for (let i = 1; i < activePoints.length; i++) {
                const prev = activePoints[i - 1];
                const curr = activePoints[i];
                const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
                const changedAttack = (
                    Number.isFinite(curr.trailAttackId) &&
                    Number.isFinite(prev.trailAttackId) &&
                    curr.trailAttackId !== prev.trailAttackId
                );
                // 物理的な断絶（段数違い、またはテレポート距離）があれば別のストリップへ。
                // per-sample投影済みの点は renderScale(=physicalScale) 倍に広がるため、しきい値も同倍率にする
                // （さもないと連続点の間隔が広がっただけで誤分割され、剣筋が二分割される）。
                const splitDist = 140 * (Number.isFinite(physicalScale) && physicalScale > 1 ? physicalScale : 1);
                if (curr.step !== prev.step || changedAttack || dist > splitDist) {
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
            const anchoredStart = firstSrc; // 剣先位置の動的サンプリングをそのまま採用し、基点の歪み（逆N字・途切れ）を防止
            const anchoredEnd = lastSrc;
            const start = anchoredStart;
            const end = anchoredEnd;
            const anchorControl = null;
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
            let controlX = 2 * mid.x - (start.x + end.x) * 0.5;
            let controlY = 2 * mid.y - (start.y + end.y) * 0.5;
            if (comboStep === 2) {
                const highestY = Math.min(start.y, end.y);
                const limitY = highestY - Math.abs(start.y - end.y) * 0.55;
                controlY = Math.min(controlY, limitY);
            }
            // 二次ベジェの制御点(mid由来)が、振りの両端(始点=最古サンプル / 終点=最新サンプル=切先)の
            // X範囲を超えて前方へ飛ぶと、軌跡が切先を追い越して「行き過ぎ」る。制御点Xを両端のX範囲に
            // 収め、軌跡が切先より前へ膨らまないようにする（縦方向の弧=controlYは維持）。
            // 忍者・将軍共通ルール（characterType分岐なし）。振り幅が小さい忍者は制御点が元々範囲内のため不変、
            // 突進で振り幅が大きく mid が終点寄りになる将軍だけ前方膨らみが抑えられる。
            controlX = Math.max(Math.min(start.x, end.x), Math.min(Math.max(start.x, end.x), controlX));
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
            // 大薙中の「通常サイズ剣筋」抑止（drawOonagiRangeEffect 内のストロークは _oonagiSuppressStroke を下ろして通す）
            if (_oonagiSuppressStroke) return;
            const mappedRaw = buildProjected(pts, projectFn);
            const mapped = options.smoothEnhanced
                ? buildChaikinSmoothedStrip(mappedRaw, options.smoothIterations || 2)
                : mappedRaw;
            if (!mapped || mapped.length < 2) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const lifeForFade = Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs);
            let oldestAlpha, newestAlpha;
            let dissolveAlphaAt = null; // 通常コンボ/大薙の「消える前線(末尾→先端へ走る)」用
            if (true) { // 通常コンボも二刀(forceLinearSmooth)も「消える前線(dissolve)」で統一
                // 明暗グラデ(位置 s: 0=最古/後ろ→oldestScale, 1=切先/新→newestScale)に「消える前線」を重ねる。
                // 前線は切先(newest)が古び始めてから s=0(末尾)→s=1(先端)へ走り、後ろから順に透明化＝鎖鎌の退き。
                // 振り中(headAge小)は前線が手前(負側)で全可視＝全弧が出る。2端点線形では出せない掃引を多stopで表現。
                const headAge = Math.max(0, newestSrc.age || 0);
                // 表示継続は全step共通の長さに統一(ユーザー要望)。過去段の高速化(superseded)/step4個別短縮
                // ＝不揃いの原因だったので廃止。少し長めに。HOLD=退き始めまでの間, SWEEP=退き速さ(大=長く残る)。
                const HOLD = 40, EDGE = 0.5, SWEEP = 340;
                const sweepRaw = clamp01((headAge - HOLD) / SWEEP);
                const sweepP = 1 - Math.pow(1 - sweepRaw, 1.8); // ease-out: 末尾は素早く・明るい先端は緩やかに
                const fr = sweepP * (1 + EDGE) - EDGE;
                const _globalFade = 1 - 0.22 * sweepP; // 退きと同時に全体も少し薄める＝フワッと消える(二重フェード)
                dissolveAlphaAt = (s) => {
                    const e = clamp01((s - fr) / EDGE);
                    const vis = e * e * (3 - 2 * e); // smoothstep: 前線の角を丸めて滑らかに
                    return Math.max(0, (oldestScale + (newestScale - oldestScale) * s) * vis * _globalFade);
                };
                oldestAlpha = dissolveAlphaAt(0);
                newestAlpha = dissolveAlphaAt(1);
            } else {
                // 二刀流(forceLinearSmooth): 各カーブは均一 age。従来の位置ベース彗星(oldestScale→newestScale)×age を維持。
                const oldestFade = clamp01(1 - ((oldestSrc.age || 0) / lifeForFade));
                const newestFade = clamp01(1 - ((newestSrc.age || 0) / lifeForFade));
                oldestAlpha = Math.max(0, oldestFade * oldestScale);
                newestAlpha = Math.max(0, newestFade * newestScale);
            }
            if (newestAlpha <= 0.01) return;
            const start = mapped[0];
            const end = mapped[mapped.length - 1];
            const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            if (dissolveAlphaAt) {
                const DS = 16;
                for (let k = 0; k <= DS; k++) { const s = k / DS; grad.addColorStop(s, colorRgba(rgb, dissolveAlphaAt(s))); }
            } else {
                grad.addColorStop(0, colorRgba(rgb, oldestAlpha));
                grad.addColorStop(0.52, colorRgba(rgb, oldestAlpha + (newestAlpha - oldestAlpha) * 0.58));
                grad.addColorStop(1, colorRgba(rgb, newestAlpha));
            }
            ctx.strokeStyle = grad;
            ctx.lineWidth = width;
            const prevLineCap = ctx.lineCap;
            if (options.lineCap) ctx.lineCap = options.lineCap;
            // 剣筋が重なった所でアルファが累積して濃くならないよう 'lighten'(各チャンネル最大)で合成する。
            // 同色の重なりは最大値どまり＝単一ストロークと同じ濃さになり、自然に繋がって見える。
            const prevComposite = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighten';
            const pathDrawn = options.smooth
                ? drawSmoothLinearPath(mapped)
                : drawLinearPath(mapped);
            if (pathDrawn) ctx.stroke();
            ctx.globalCompositeOperation = prevComposite;
            if (options.lineCap) ctx.lineCap = prevLineCap;
        };
        // 両端が点へ収束するテーパー付き塗りリボン(忍具 drawCometRibbon と同方式)。
        // 均一幅ストロークの「チューブ感」を脱し、剣の弧らしい筆致にする。α/フェードは
        // drawGradientLinearTrail と同一計算＝持続/後退の挙動(見た目=判定・連続age)は不変。lighten 合成も維持。
        const drawTaperedRibbonTrail = (pts, baseWidth, rgb, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (_oonagiSuppressStroke) return;
            const mappedRaw = buildProjected(pts, projectFn);
            let mapped = options.smoothEnhanced
                ? buildChaikinSmoothedStrip(mappedRaw, options.smoothIterations || 2)
                : mappedRaw;
            if (!mapped || mapped.length < 2) {
                drawGradientLinearTrail(pts, baseWidth, rgb, oldestScale, newestScale, projectFn, options);
                return;
            }
            let totalLen = 0;
            for (let i = 1; i < mapped.length; i++) totalLen += Math.hypot(mapped[i].x - mapped[i - 1].x, mapped[i].y - mapped[i - 1].y);
            if (totalLen < 7.5) {
                drawGradientLinearTrail(pts, baseWidth, rgb, oldestScale, newestScale, projectFn, options);
                return;
            }
            // 2点(直線スラッシュ: step3等)は中間点を補間し、テーパーの解像度を持たせてリボン化する。
            // 端点(位置/age/life)は不変なのでグラデ・フェード・見た目=判定は変わらない。
            if (mapped.length === 2) {
                const a = mapped[0], b = mapped[1];
                const SUB = 9;
                const sub = [];
                const lifeDefault = this.comboSlashTrailActiveLifeMs;
                for (let i = 0; i <= SUB; i++) {
                    const t = i / SUB;
                    sub.push({
                        x: a.x + (b.x - a.x) * t,
                        y: a.y + (b.y - a.y) * t,
                        age: (a.age || 0) + ((b.age || 0) - (a.age || 0)) * t,
                        life: Math.max(1, (a.life || lifeDefault) + ((b.life || lifeDefault) - (a.life || lifeDefault)) * t)
                    });
                }
                mapped = sub;
            }
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const lifeForFade = Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs);
            let oldestAlpha, newestAlpha;
            let dissolveAlphaAt = null; // 通常コンボ/大薙の「消える前線(末尾→先端へ走る)」用
            if (true) { // 通常コンボも二刀(forceLinearSmooth)も「消える前線(dissolve)」で統一
                // 明暗グラデ(位置 s)に「消える前線」を重ね、切先が古び始めてから末尾→先端へ走らせる(鎖鎌の退き)。
                // drawGradientLinearTrail と同一ロジック(芯と本体で同じ前線にする)。
                const headAge = Math.max(0, newestSrc.age || 0);
                // 表示継続は全step共通の長さに統一(ユーザー要望)。過去段の高速化(superseded)/step4個別短縮
                // ＝不揃いの原因だったので廃止。少し長めに。HOLD=退き始めまでの間, SWEEP=退き速さ(大=長く残る)。
                const HOLD = 40, EDGE = 0.5, SWEEP = 340;
                const sweepRaw = clamp01((headAge - HOLD) / SWEEP);
                const sweepP = 1 - Math.pow(1 - sweepRaw, 1.8); // ease-out: 末尾は素早く・明るい先端は緩やかに
                const fr = sweepP * (1 + EDGE) - EDGE;
                const _globalFade = 1 - 0.22 * sweepP; // 退きと同時に全体も少し薄める＝フワッと消える(二重フェード)
                dissolveAlphaAt = (s) => {
                    const e = clamp01((s - fr) / EDGE);
                    const vis = e * e * (3 - 2 * e); // smoothstep: 前線の角を丸めて滑らかに
                    return Math.max(0, (oldestScale + (newestScale - oldestScale) * s) * vis * _globalFade);
                };
                oldestAlpha = dissolveAlphaAt(0);
                newestAlpha = dissolveAlphaAt(1);
            } else {
                const oldestFade = clamp01(1 - ((oldestSrc.age || 0) / lifeForFade));
                const newestFade = clamp01(1 - ((newestSrc.age || 0) / lifeForFade));
                oldestAlpha = Math.max(0, oldestFade * oldestScale);
                newestAlpha = Math.max(0, newestFade * newestScale);
            }
            if (newestAlpha <= 0.01) return;

            const N = mapped.length;
            const nrm = [];
            for (let i = 0; i < N; i++) {
                const a = mapped[Math.max(0, i - 1)], b = mapped[Math.min(N - 1, i + 1)];
                let tx = b.x - a.x, ty = b.y - a.y;
                const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
                nrm.push({ x: -ty, y: tx });
            }
            const denom = Math.max(1, N - 1);
            const baseHalf = baseWidth * 0.5;
            // 幅プロファイル(頭寄り涙滴 P2): pow0.62で根本を細く膨らみを頭側へ寄せ、切先は最後10%だけ点へ。
            // (F=pow0.8×tip0.05 も試したが、アーモンドはユーザー認識相違だったため元の P2 に戻す)
            const tailTaper = (i) => Math.pow(i / denom, 0.62);
            const headTaper = (i) => Math.min(1, (((N - 1) - i) / denom) / 0.1);
            const halfW = (i) => baseHalf * tailTaper(i) * headTaper(i);
            const upper = mapped.map((p, i) => ({ x: p.x + nrm[i].x * halfW(i), y: p.y + nrm[i].y * halfW(i) }));
            const lower = mapped.map((p, i) => ({ x: p.x - nrm[i].x * halfW(i), y: p.y - nrm[i].y * halfW(i) }));
            const appendSmooth = (arr) => {
                for (let i = 1; i < arr.length - 1; i++) {
                    const mx = (arr[i].x + arr[i + 1].x) * 0.5, my = (arr[i].y + arr[i + 1].y) * 0.5;
                    ctx.quadraticCurveTo(arr[i].x, arr[i].y, mx, my);
                }
                ctx.lineTo(arr[arr.length - 1].x, arr[arr.length - 1].y);
            };
            const start = mapped[0], end = mapped[N - 1];
            const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            if (dissolveAlphaAt) {
                const DS = 16;
                for (let k = 0; k <= DS; k++) { const s = k / DS; grad.addColorStop(s, colorRgba(rgb, dissolveAlphaAt(s))); }
            } else {
                grad.addColorStop(0, colorRgba(rgb, oldestAlpha));
                grad.addColorStop(0.52, colorRgba(rgb, oldestAlpha + (newestAlpha - oldestAlpha) * 0.58));
                grad.addColorStop(1, colorRgba(rgb, newestAlpha));
            }
            const prevComposite = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighten';
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(upper[0].x, upper[0].y);
            appendSmooth(upper);
            ctx.lineTo(lower[N - 1].x, lower[N - 1].y);
            appendSmooth(lower.slice().reverse());
            ctx.closePath();
            ctx.fill();
            ctx.globalCompositeOperation = prevComposite;
        };
        const drawBlueTrailLayers = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (_oonagiSuppressStroke) return; // 大薙中は通常サイズ剣筋を隠す
            // 本体: 両端テーパーの塗りリボン(忍具水準の筆致)。均一幅チューブを脱する。
            drawTaperedRibbonTrail(
                pts,
                baseWidth,
                bluePalette.front,
                oldestScale * 0.62,
                newestScale,
                projectFn,
                options
            );
            // 明るい芯(中心線・切先側を強める。やや青白で「内側から発光」感)
            drawGradientLinearTrail(
                pts,
                Math.max(1.4, baseWidth * 0.2),
                [232, 248, 255],
                oldestScale * 0.18,
                newestScale * 0.66,
                projectFn,
                options
            );
        };
        const getRangeEffectAlpha = (pts, newestScale = 1, forceActive = false) => {
            if ((!xRangeEffectActive && !forceActive) || !Array.isArray(pts) || pts.length === 0) return 0;
            const newestSrc = pts[pts.length - 1];
            const newestLife = Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs);
            const newestFade = clamp01(1 - ((newestSrc.age || 0) / newestLife));
            return newestFade * newestScale;
        };
        const buildOonagiStep3CenterStrip = (pts, baseWidth, projectFn = null, options = {}) => {
            if (!Array.isArray(pts) || pts.length < 1) return null;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const isRelative = (src) => !!(
                options.forceRelative ||
                (options.useRelativeIfAvailable && src && src.trailIsRelative)
            );
            const offsetFor = (src) => {
                if (!isRelative(src)) return { x: 0, y: 0 };
                return {
                    x: Number.isFinite(options.forceOffsetX)
                        ? options.forceOffsetX
                        : (Number.isFinite(src.playerX) ? src.playerX : (options.offsetX || 0)),
                    y: Number.isFinite(options.forceOffsetY)
                        ? options.forceOffsetY
                        : (Number.isFinite(src.playerY) ? src.playerY : (options.offsetY || 0))
                };
            };
            const offset = offsetFor(newestSrc);
            const startRawX = Number.isFinite(newestSrc.trailCurveStartX)
                ? newestSrc.trailCurveStartX
                : (Number.isFinite(oldestSrc.trailCurveStartX) ? oldestSrc.trailCurveStartX : oldestSrc.x);
            const startRawY = Number.isFinite(newestSrc.trailCurveStartY)
                ? newestSrc.trailCurveStartY
                : (Number.isFinite(oldestSrc.trailCurveStartY) ? oldestSrc.trailCurveStartY : oldestSrc.y);
            const endRawX = Number.isFinite(newestSrc.trailCurveEndX)
                ? newestSrc.trailCurveEndX
                : (Number.isFinite(oldestSrc.trailCurveEndX) ? oldestSrc.trailCurveEndX : newestSrc.x);
            const endRawY = Number.isFinite(newestSrc.trailCurveEndY)
                ? newestSrc.trailCurveEndY
                : (Number.isFinite(oldestSrc.trailCurveEndY) ? oldestSrc.trailCurveEndY : newestSrc.y);
            if ([startRawX, startRawY, endRawX, endRawY].some((v) => !Number.isFinite(v))) return null;

            const startX = startRawX + offset.x;
            const startY = startRawY + offset.y;
            const endX = endRawX + offset.x;
            const endY = endRawY + offset.y;
            const lineDx = endX - startX;
            const lineDy = endY - startY;
            const lineLenSq = lineDx * lineDx + lineDy * lineDy;
            if (lineLenSq < 0.001) return null;

            const renderedStep3Tip = (
                (options.useRenderedTipEndpoint || options.useCurrentTipForRevealProgress) &&
                typeof this.getRenderedComboStep3TipForTrail === 'function'
            )
                ? this.getRenderedComboStep3TipForTrail(newestSrc, {
                    ...renderOptions,
                    preferComputedTip: !!options.forceHorizontalToTip
                })
                : null;
            const renderedStep3TipDrawPoint = renderedStep3Tip || null;
            const currentTipForReveal = (() => {
                if (renderedStep3TipDrawPoint) return renderedStep3TipDrawPoint;
                if (Number.isFinite(newestSrc.x) && Number.isFinite(newestSrc.y)) {
                    const tipOffset = offsetFor(newestSrc);
                    return {
                        x: newestSrc.x + tipOffset.x,
                        y: newestSrc.y + tipOffset.y
                    };
                }
                return null;
            })();
            const activeAttackState = renderOptions.attackState || {
                isAttacking: sourceIsAttacking,
                currentAttack: this.currentAttack,
                attackTimer: this.attackTimer
            };
            const activeRawProgress = (() => {
                if (
                    sourceIsAttacking &&
                    activeAttackState &&
                    activeAttackState.currentAttack &&
                    activeAttackState.currentAttack.comboStep === 3
                ) {
                    const duration = Math.max(1, activeAttackState.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                    return Number.isFinite(activeAttackState.currentAttack.motionElapsedMs)
                        ? clamp01(activeAttackState.currentAttack.motionElapsedMs / duration)
                        : clamp01(1 - ((Number.isFinite(activeAttackState.attackTimer) ? activeAttackState.attackTimer : this.attackTimer) / duration));
                }
                return null;
            })();
            const activeProgress = (() => {
                if (Number.isFinite(activeRawProgress)) {
                    if (options.useRawProgressForGrowth) return activeRawProgress;
                    return this.getAttackMotionProgress(activeAttackState.currentAttack, activeRawProgress);
                }
                if (Number.isFinite(newestSrc.progress)) return newestSrc.progress;
                return 1.0;
            })();
            const trailWindow = this.getComboTrailProgressWindow(3);
            let growth = (() => {
                const p = Number.isFinite(activeProgress) ? activeProgress : 1.0;
                if (p <= trailWindow.start) return 0;
                if (p >= trailWindow.end) return 1;
                return clamp01((p - trailWindow.start) / Math.max(0.001, trailWindow.end - trailWindow.start));
            })();
            let currentTipProjectedT = null;
            if (options.useCurrentTipForRevealProgress && activeProgress > trailWindow.start && currentTipForReveal) {
                const projectedT = (
                    (currentTipForReveal.x - startX) * lineDx +
                    (currentTipForReveal.y - startY) * lineDy
                ) / lineLenSq;
                if (Number.isFinite(projectedT)) {
                    currentTipProjectedT = projectedT;
                    const lead = Number.isFinite(options.revealLead) ? options.revealLead : 0;
                    growth = Math.max(growth, clamp01(projectedT + lead));
                }
            }
            if (options.clampGrowthToCurrentTip && Number.isFinite(currentTipProjectedT) && currentTipProjectedT > 0.0001) {
                const lineLen = Math.sqrt(lineLenSq);
                const trimPx = Number.isFinite(options.currentTipCapTrim) ? options.currentTipCapTrim : baseWidth * 0.55;
                growth = Math.min(growth, clamp01(currentTipProjectedT - (lineLen > 0.001 ? trimPx / lineLen : 0)));
            }
            if (growth <= 0.001) return null;

            let drawStartX = startX;
            let drawStartY = startY;
            let drawEndX = startX + lineDx * growth;
            let drawEndY = startY + lineDy * growth;
            if (options.forceHorizontalToTip && renderedStep3TipDrawPoint) {
                const yH = Number.isFinite(options.forceHorizontalY)
                    ? options.forceHorizontalY
                    : (Number.isFinite(startY) ? startY : renderedStep3TipDrawPoint.y);
                const dirSign = Math.abs(lineDx) > 0.001
                    ? (lineDx >= 0 ? 1 : -1)
                    : (renderedStep3TipDrawPoint.x >= startX ? 1 : -1);
                const currentAdvance = (renderedStep3TipDrawPoint.x - startX) * dirSign;
                const reachPadding = Number.isFinite(options.visualTipReachPaddingPx)
                    ? Math.max(0, options.visualTipReachPaddingPx)
                    : 0;
                const visibleAdvance = Math.max(0, currentAdvance + reachPadding);
                const tipCapInset = Number.isFinite(options.roundCapTipInset)
                    ? Math.max(0, options.roundCapTipInset)
                    : baseWidth * 0.5;
                const outerCenterAdvance = Math.max(0, visibleAdvance - tipCapInset);
                if (!(visibleAdvance > 0.001) || !(outerCenterAdvance > 0.001)) return null;
                drawStartX = startX;
                drawStartY = yH;
                drawEndX = startX + dirSign * outerCenterAdvance;
                drawEndY = yH;
            } else {
                if (options.useCurrentTipEndpoint && Number.isFinite(newestSrc.x) && Number.isFinite(newestSrc.y)) {
                    const tipOffset = offsetFor(newestSrc);
                    drawEndX = newestSrc.x + tipOffset.x;
                    drawEndY = newestSrc.y + tipOffset.y;
                }
                if (options.useRenderedTipEndpoint && renderedStep3TipDrawPoint) {
                    drawEndX = renderedStep3TipDrawPoint.x;
                    drawEndY = renderedStep3TipDrawPoint.y;
                }
            }
            return buildProjected([
                {
                    x: drawStartX,
                    y: drawStartY,
                    age: oldestSrc.age || 0,
                    life: Math.max(1, oldestSrc.life || this.comboSlashTrailActiveLifeMs)
                },
                {
                    x: drawEndX,
                    y: drawEndY,
                    age: newestSrc.age || 0,
                    life: Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs)
                }
            ], projectFn);
        };
        const buildOonagiFixedBezierCenterStrip = (pts, baseWidth, comboStep = 0, projectFn = null, options = {}) => {
            if (!Array.isArray(pts) || pts.length < 1) return null;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const step = comboStep || newestSrc.step || 0;
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
            let endX = Number.isFinite(newestSrc.trailCurveEndX) ? newestSrc.trailCurveEndX + offsetX : null;
            let endY = Number.isFinite(newestSrc.trailCurveEndY) ? newestSrc.trailCurveEndY + offsetY : null;
            if ([startX, startY, controlX, controlY, endX, endY].some((v) => !Number.isFinite(v))) return null;

            const activeProgress = (() => {
                if (options.useRelativeIfAvailable && newestSrc.trailCurveFrozen) return Number.isFinite(newestSrc.progress) ? newestSrc.progress : 1.0;
                const attackState = renderOptions.attackState || {
                    isAttacking: sourceIsAttacking,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer
                };
                if (!sourceIsAttacking || !attackState || !attackState.currentAttack || attackState.currentAttack.comboStep !== step) {
                    if (step === 5 && Number.isFinite(newestSrc.progress)) return newestSrc.progress;
                    return 1.0;
                }
                const duration = Math.max(1, attackState.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                const timer = Number.isFinite(attackState.attackTimer) ? attackState.attackTimer : this.attackTimer;
                const rawProgress = Number.isFinite(attackState.currentAttack.motionElapsedMs)
                    ? clamp01(attackState.currentAttack.motionElapsedMs / duration)
                    : clamp01(1 - (timer / duration));
                return this.getAttackMotionProgress(attackState.currentAttack, rawProgress);
            })();
            const growthWindow = this.getComboTrailProgressWindow(step);
            let growth = (() => {
                const p = Number.isFinite(activeProgress) ? activeProgress : 1.0;
                if (p <= growthWindow.start) return 0;
                if (p >= growthWindow.end) return 1;
                return clamp01((p - growthWindow.start) / Math.max(0.001, growthWindow.end - growthWindow.start));
            })();
            if (growth <= 0.001) return null;

            const drawControlX = controlX;
            const drawControlY = controlY;
            if (options.trimEnd) {
                const step5TrimControls = step === 5 ? getComboStep5ArcControls(startX, startY, endX, endY) : null;
                const trimControlX = step5TrimControls ? step5TrimControls.c2.x : drawControlX;
                const trimControlY = step5TrimControls ? step5TrimControls.c2.y : drawControlY;
                const tangentX = endX - trimControlX;
                const tangentY = endY - trimControlY;
                const tangentLen = Math.hypot(tangentX, tangentY);
                if (tangentLen > 0.001) {
                    const trimFactor = Number.isFinite(options.trimFactor) ? options.trimFactor : 0.28;
                    const trim = Math.min(baseWidth * trimFactor, tangentLen * 0.9);
                    endX -= (tangentX / tangentLen) * trim;
                    endY -= (tangentY / tangentLen) * trim;
                }
            }

            const step5ArcControls = step === 5 ? getComboStep5ArcControls(startX, startY, endX, endY) : null;
            const curvePoint = (t) => {
                const oneMinusT = 1 - t;
                if (step5ArcControls) {
                    return {
                        x: oneMinusT * oneMinusT * oneMinusT * startX
                            + 3 * oneMinusT * oneMinusT * t * step5ArcControls.c1.x
                            + 3 * oneMinusT * t * t * step5ArcControls.c2.x
                            + t * t * t * endX,
                        y: oneMinusT * oneMinusT * oneMinusT * startY
                            + 3 * oneMinusT * oneMinusT * t * step5ArcControls.c1.y
                            + 3 * oneMinusT * t * t * step5ArcControls.c2.y
                            + t * t * t * endY
                    };
                }
                return {
                    x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * drawControlX + t * t * endX,
                    y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * drawControlY + t * t * endY
                };
            };
            const stripCount = Math.max(12, Math.round(12 + growth * 16));
            const strip = [];
            for (let i = 0; i < stripCount; i++) {
                const sampleT = (stripCount <= 1 ? 1 : (i / (stripCount - 1))) * growth;
                const p = curvePoint(sampleT);
                const ageT = stripCount <= 1 ? 1 : i / (stripCount - 1);
                strip.push({
                    x: p.x,
                    y: p.y,
                    age: (oldestSrc.age || 0) + ((newestSrc.age || 0) - (oldestSrc.age || 0)) * ageT,
                    life: Math.max(
                        1,
                        (oldestSrc.life || this.comboSlashTrailActiveLifeMs) +
                        ((newestSrc.life || this.comboSlashTrailActiveLifeMs) - (oldestSrc.life || this.comboSlashTrailActiveLifeMs)) * ageT
                    )
                });
            }
            return buildProjected(strip, projectFn);
        };
        const buildOonagiStep4CenterStrip = (pts, projectFn = null, options = {}) => {
            if (!Array.isArray(pts) || pts.length < 1) return null;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const isRelative = !!newestSrc.trailIsRelative;
            const offsetX = isRelative
                ? (Number.isFinite(newestSrc.playerX) ? newestSrc.playerX : (options.offsetX || 0))
                : 0;
            const offsetY = isRelative
                ? (Number.isFinite(newestSrc.playerY) ? newestSrc.playerY : (options.offsetY || 0))
                : 0;
            const startX = Number.isFinite(newestSrc.trailCurveStartX) ? newestSrc.trailCurveStartX + offsetX : null;
            const startY = Number.isFinite(newestSrc.trailCurveStartY) ? newestSrc.trailCurveStartY + offsetY : null;
            const controlX = Number.isFinite(newestSrc.trailCurveControlX) ? newestSrc.trailCurveControlX + offsetX : null;
            const controlY = Number.isFinite(newestSrc.trailCurveControlY) ? newestSrc.trailCurveControlY + offsetY : null;
            const endX = Number.isFinite(newestSrc.trailCurveEndX) ? newestSrc.trailCurveEndX + offsetX : null;
            const endY = Number.isFinite(newestSrc.trailCurveEndY) ? newestSrc.trailCurveEndY + offsetY : null;
            if ([startX, startY, controlX, controlY, endX, endY].some((v) => !Number.isFinite(v))) return null;

            const attackState = renderOptions.attackState || {
                isAttacking: sourceIsAttacking,
                currentAttack: this.currentAttack,
                attackTimer: this.attackTimer
            };
            const rawProgress = (() => {
                if (!sourceIsAttacking || !attackState || !attackState.currentAttack || attackState.currentAttack.comboStep !== 4) return 1.0;
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
            const growth = rawProgress <= 0.08 ? 0 : (rawProgress >= 0.42 ? 1 : smooth((rawProgress - 0.08) / 0.34));
            if (growth <= 0.001) return null;
            const stripCount = Math.max(14, Math.round(14 + growth * 18));
            const strip = [];
            for (let i = 0; i < stripCount; i++) {
                const t = (stripCount <= 1 ? 1 : (i / (stripCount - 1))) * growth;
                const oneMinusT = 1 - t;
                const ageT = stripCount <= 1 ? 1 : i / (stripCount - 1);
                strip.push({
                    x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * controlX + t * t * endX,
                    y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * controlY + t * t * endY,
                    age: (oldestSrc.age || 0) + ((newestSrc.age || 0) - (oldestSrc.age || 0)) * ageT,
                    life: Math.max(
                        1,
                        (oldestSrc.life || this.comboSlashTrailActiveLifeMs) +
                        ((newestSrc.life || this.comboSlashTrailActiveLifeMs) - (oldestSrc.life || this.comboSlashTrailActiveLifeMs)) * ageT
                    )
                });
            }
            return buildProjected(strip, projectFn);
        };
        const buildOonagiCenterStrip = (pts, comboStep = 0, projectFn = null, options = {}, baseWidth = 13.8) => {
            if (options.effectStrip && Array.isArray(options.effectStrip)) {
                return buildProjected(options.effectStrip, projectFn);
            }
            if (comboStep === 3) {
                return buildOonagiStep3CenterStrip(pts, baseWidth, projectFn, options);
            }
            if (comboStep === 4) {
                return buildOonagiStep4CenterStrip(pts, projectFn, options);
            }
            if (comboStep === 1 || comboStep === 2 || comboStep === 5) {
                return buildOonagiFixedBezierCenterStrip(pts, baseWidth, comboStep, projectFn, {
                    ...options,
                    comboStep,
                    trimEnd: true,
                    trimFactor: comboStep === 5 ? getComboStep5EndTrimFactor(physicalScale) : 0.5
                });
            }
            return buildProjected(pts, projectFn);
        };
        const drawOonagiRibbonFill = (innerStrip, outerStrip, alphaBase) => {
            if (
                !Array.isArray(innerStrip) ||
                !Array.isArray(outerStrip) ||
                innerStrip.length < 2 ||
                outerStrip.length !== innerStrip.length ||
                alphaBase <= 0.01
            ) {
                return;
            }
            const newestInner = innerStrip[innerStrip.length - 1];
            const newestOuter = outerStrip[outerStrip.length - 1];
            const oldestInner = innerStrip[0];
            const grad = ctx.createLinearGradient(oldestInner.x, oldestInner.y, newestOuter.x, newestOuter.y);
            grad.addColorStop(0, colorRgba(bluePalette.front, alphaBase * 0.035));
            grad.addColorStop(0.55, colorRgba(bluePalette.front, alphaBase * 0.11));
            grad.addColorStop(1, colorRgba(bluePalette.front, alphaBase * 0.2));
            ctx.save();
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(innerStrip[0].x, innerStrip[0].y);
            for (let i = 1; i < innerStrip.length; i++) {
                ctx.lineTo(innerStrip[i].x, innerStrip[i].y);
            }
            for (let i = outerStrip.length - 1; i >= 0; i--) {
                ctx.lineTo(outerStrip[i].x, outerStrip[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            if (newestInner && newestOuter) {
                ctx.save();
                ctx.strokeStyle = colorRgba(bluePalette.front, alphaBase * 0.08);
                ctx.lineWidth = Math.max(1.2, physicalScale * 1.4);
                ctx.beginPath();
                ctx.moveTo(newestInner.x, newestInner.y);
                ctx.lineTo(newestOuter.x, newestOuter.y);
                ctx.stroke();
                ctx.restore();
            }
        };
        const drawOonagiRangeEffect = (pts, comboStep = 0, projectFn = null, options = {}) => {
            // 大薙の範囲エフェクト自身のストロークは常に描く（通常剣筋抑止フラグを下ろす）
            _oonagiSuppressStroke = false;
            const effectScale = Number.isFinite(options.rangeEffectScale)
                ? Math.max(1, options.rangeEffectScale)
                : xRangeEffectScale;
            const forceActive = options.forceRangeEffectActive === true || effectScale > 1.01;
            if ((!xRangeEffectActive && !forceActive) || !Array.isArray(pts) || pts.length < 1) return;
            const baseWidth = Math.max(2.2, 13.8 * physicalScale);
            const alphaBase = getRangeEffectAlpha(pts, options.newestScale || baseNewestAlpha, forceActive);
            if (alphaBase <= 0.01) return;

            const newestSrc = pts[pts.length - 1] || {};
            const dir = Number.isFinite(newestSrc.dir)
                ? (newestSrc.dir >= 0 ? 1 : -1)
                : (this.facingRight ? 1 : -1);
            // 二刀流step2 などの後方への剣撃は、リーチ(外側剣筋)を前方ではなく後方へ伸ばす。
            const reachDir = options.reverseReach ? -dir : dir;
            // 前方リーチは当たり判定と共用の単一値(PLAYER.OONAGI_REACH_*)から取得し、見た目=判定にする。
            const reachPx = (typeof this.getOonagiForwardReachPx === 'function')
                ? this.getOonagiForwardReachPx(physicalScale)
                : Math.max(58, Math.min(176, (84 + (effectScale - 1) * 42) * Math.max(1, physicalScale * 0.86)));
            const innerStrip = buildOonagiCenterStrip(pts, comboStep, projectFn, options, baseWidth);
            if (!Array.isArray(innerStrip) || innerStrip.length < 2) return;
            const outerStrip = innerStrip.map((p) => ({
                ...p,
                x: p.x + reachDir * reachPx
            }));

            // 大薙は既存剣筋の前方に太めの外側剣筋を1本足して、広い間合いを見せる。
            drawGradientLinearTrail(
                outerStrip,
                baseWidth * 1.86,
                bluePalette.front,
                (options.newestScale || baseNewestAlpha) * 0.2,
                (options.newestScale || baseNewestAlpha) * 0.64,
                null,
                { smooth: comboStep !== 3 }
            );
            drawGradientLinearTrail(
                outerStrip,
                Math.max(3.2, baseWidth * 0.32),
                [255, 255, 255],
                (options.newestScale || baseNewestAlpha) * 0.14,
                (options.newestScale || baseNewestAlpha) * 0.5,
                null,
                { smooth: comboStep !== 3 }
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
        const trimTrailEndPoint = (pts, trimPx) => {
            if (!Array.isArray(pts) || pts.length < 2 || !(trimPx > 0)) return pts;
            const adjusted = pts.map((p) => ({ ...p }));
            const lastIndex = adjusted.length - 1;
            const end = adjusted[lastIndex];
            const prev = adjusted[lastIndex - 1];
            const dx = end.x - prev.x;
            const dy = end.y - prev.y;
            const len = Math.hypot(dx, dy);
            if (len <= 0.001) return adjusted;
            const trim = Math.min(trimPx, len * 0.62);
            adjusted[lastIndex] = {
                ...end,
                x: end.x - (dx / len) * trim,
                y: end.y - (dy / len) * trim
            };
            return adjusted;
        };
        const drawDualBlueLinearTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (_oonagiSuppressStroke) return; // 大薙中は通常サイズ剣筋を隠す
            const includeGhost = false;
            if (!pts || pts.length < 2) return;
            let sourcePts = options.straighten ? buildStraightLinearStrip(pts, projectFn) : pts;
            if (!sourcePts || sourcePts.length < 2) return;
            if (options.trimEndCap) {
                const trimFactor = Number.isFinite(options.trimFactor) ? options.trimFactor : 0.5;
                sourcePts = trimTrailEndPoint(sourcePts, baseWidth * trimFactor);
            }
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
        const drawStep3StableLinearTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            // 大薙中でも入口returnしない: recordLiveDraw(水平線の焼き込み)を走らせ、凍結カーブが
            // 斜めにならないようにする。実ストロークは内側の drawGradientLinearTrail/drawBlueTrailLayers
            // のゲートで抑止される（この関数内に直接描画は無い）。
            if (!pts || pts.length < 1) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const isRelative = (src) => !!(
                options.forceRelative ||
                (options.useRelativeIfAvailable && src && src.trailIsRelative)
            );
            const offsetFor = (src) => {
                if (!isRelative(src)) return { x: 0, y: 0 };
                return {
                    x: Number.isFinite(options.forceOffsetX)
                        ? options.forceOffsetX
                        : (Number.isFinite(src.playerX) ? src.playerX : (options.offsetX || 0)),
                    y: Number.isFinite(options.forceOffsetY)
                        ? options.forceOffsetY
                        : (Number.isFinite(src.playerY) ? src.playerY : (options.offsetY || 0))
                };
            };
            const offset = offsetFor(newestSrc);
            const startRawX = Number.isFinite(newestSrc.trailCurveStartX)
                ? newestSrc.trailCurveStartX
                : (Number.isFinite(oldestSrc.trailCurveStartX) ? oldestSrc.trailCurveStartX : oldestSrc.x);
            const startRawY = Number.isFinite(newestSrc.trailCurveStartY)
                ? newestSrc.trailCurveStartY
                : (Number.isFinite(oldestSrc.trailCurveStartY) ? oldestSrc.trailCurveStartY : oldestSrc.y);
            const endRawX = Number.isFinite(newestSrc.trailCurveEndX)
                ? newestSrc.trailCurveEndX
                : (Number.isFinite(oldestSrc.trailCurveEndX) ? oldestSrc.trailCurveEndX : newestSrc.x);
            const endRawY = Number.isFinite(newestSrc.trailCurveEndY)
                ? newestSrc.trailCurveEndY
                : (Number.isFinite(oldestSrc.trailCurveEndY) ? oldestSrc.trailCurveEndY : newestSrc.y);
            if ([startRawX, startRawY, endRawX, endRawY].some((v) => !Number.isFinite(v))) return;

            const startX = startRawX + offset.x;
            const startY = startRawY + offset.y;
            const endX = endRawX + offset.x;
            const endY = endRawY + offset.y;
            const lineDx = endX - startX;
            const lineDy = endY - startY;
            const lineLenSq = lineDx * lineDx + lineDy * lineDy;
            if (lineLenSq < 0.001) return;
            const renderedStep3Tip = (
                (options.useRenderedTipEndpoint || options.useCurrentTipForRevealProgress) &&
                typeof this.getRenderedComboStep3TipForTrail === 'function'
            )
                ? this.getRenderedComboStep3TipForTrail(newestSrc, {
                    ...renderOptions,
                    preferComputedTip: !!options.forceHorizontalToTip
                })
                : null;
            const toTrailDrawPoint = (tip) => {
                if (!tip) return null;
                if (projectFn && typeof options.inverseProjectFn === 'function') {
                    const inversePoint = options.inverseProjectFn(tip);
                    if (
                        inversePoint &&
                        Number.isFinite(inversePoint.x) &&
                        Number.isFinite(inversePoint.y)
                    ) {
                        return inversePoint;
                    }
                }
                return tip;
            };
            const renderedStep3TipDrawPoint = toTrailDrawPoint(renderedStep3Tip);
            const currentTipForReveal = (() => {
                if (renderedStep3TipDrawPoint) return renderedStep3TipDrawPoint;
                if (
                    Number.isFinite(newestSrc.x) &&
                    Number.isFinite(newestSrc.y)
                ) {
                    const tipOffset = offsetFor(newestSrc);
                    return {
                        x: newestSrc.x + tipOffset.x,
                        y: newestSrc.y + tipOffset.y
                    };
                }
                return null;
            })();
            let currentTipProjectedT = null;

            const activeAttackState = renderOptions.attackState || {
                isAttacking: sourceIsAttacking,
                currentAttack: this.currentAttack,
                attackTimer: this.attackTimer
            };
            const activeRawProgress = (() => {
                if (
                    sourceIsAttacking &&
                    activeAttackState &&
                    activeAttackState.currentAttack &&
                    activeAttackState.currentAttack.comboStep === 3
                ) {
                    const duration = Math.max(1, activeAttackState.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                    return Number.isFinite(activeAttackState.currentAttack.motionElapsedMs)
                        ? clamp01(activeAttackState.currentAttack.motionElapsedMs / duration)
                        : clamp01(1 - ((Number.isFinite(activeAttackState.attackTimer) ? activeAttackState.attackTimer : this.attackTimer) / duration));
                }
                return null;
            })();
            const activeProgress = (() => {
                if (Number.isFinite(activeRawProgress)) {
                    if (options.useRawProgressForGrowth) {
                        return activeRawProgress;
                    }
                    return this.getAttackMotionProgress(activeAttackState.currentAttack, activeRawProgress);
                }
                if (Number.isFinite(newestSrc.progress)) {
                    return newestSrc.progress;
                }
                return 1.0;
            })();
            const trailWindow = this.getComboTrailProgressWindow(3);
            let growth = (() => {
                const p = Number.isFinite(activeProgress) ? activeProgress : 1.0;
                if (p <= trailWindow.start) return 0;
                if (p >= trailWindow.end) return 1;
                return clamp01((p - trailWindow.start) / Math.max(0.001, trailWindow.end - trailWindow.start));
            })();

            if (
                options.useCurrentTipForRevealProgress &&
                activeProgress > trailWindow.start &&
                currentTipForReveal
            ) {
                const projectedT = (
                    (currentTipForReveal.x - startX) * lineDx +
                    (currentTipForReveal.y - startY) * lineDy
                ) / lineLenSq;
                if (Number.isFinite(projectedT)) {
                    currentTipProjectedT = projectedT;
                    const lead = Number.isFinite(options.revealLead) ? options.revealLead : 0;
                    growth = Math.max(growth, clamp01(projectedT + lead));
                }
            }
            if (options.clampGrowthToCurrentTip && Number.isFinite(currentTipProjectedT)) {
                const lineLen = Math.sqrt(lineLenSq);
                const trimPx = Number.isFinite(options.currentTipCapTrim)
                    ? options.currentTipCapTrim
                    : baseWidth * 0.55;
                const trimT = lineLen > 0.001 ? trimPx / lineLen : 0;
                // 切先投影が線上で前向き(正)のときだけ追い抜き防止クランプを適用する。
                // 大薙ブースト時は投影関数の関係で切先投影が負(始点より後ろ)になり得て、
                // そのままだと growth が 0 にクランプされて剣筋が丸ごと消える。
                // その場合はクランプを諦めて進行度ベースの growth で描画を維持する。
                if (currentTipProjectedT > 0.0001) {
                    growth = Math.min(growth, clamp01(currentTipProjectedT - trimT));
                }
            }
            if (growth <= 0.001) return;

            let drawStartX = startX;
            let drawStartY = startY;
            let drawEndX = startX + lineDx * growth;
            let drawEndY = startY + lineDy * growth;
            let manualTipAlignedLayers = null;
            if (options.forceHorizontalToTip && renderedStep3TipDrawPoint) {
                // Yはstep3始点(=step2終点)で固定し、Xだけ現在の切先へ追従。
                // endYを使うとstep3終端側の切先Yへ引っ張られ、step2終点との接続が切れる。
                const yH = Number.isFinite(options.forceHorizontalY)
                    ? options.forceHorizontalY
                    : (Number.isFinite(startY) ? startY : renderedStep3TipDrawPoint.y);
                const dirSign = Math.abs(lineDx) > 0.001
                    ? (lineDx >= 0 ? 1 : -1)
                    : (renderedStep3TipDrawPoint.x >= startX ? 1 : -1);
                const currentAdvance = (renderedStep3TipDrawPoint.x - startX) * dirSign;
                // 現在の切先Xだけを上限にする。raw=1の予測切先は同じ体位置で再計算されるため、
                // モーション途中では現在切先より手前になり、剣筋が短く止まるフレームがある。
                const reachPadding = Number.isFinite(options.visualTipReachPaddingPx)
                    ? Math.max(0, options.visualTipReachPaddingPx)
                    : 0;
                const visibleAdvance = Math.max(0, currentAdvance + reachPadding);
                const tipCapInset = Number.isFinite(options.roundCapTipInset)
                    ? Math.max(0, options.roundCapTipInset)
                    : baseWidth * 0.5;
                const innerWidth = Math.max(1.4, baseWidth * 0.18);
                const innerTipCapInset = innerWidth * 0.5;
                const outerCenterAdvance = Math.max(0, visibleAdvance - tipCapInset);
                const innerCenterAdvance = Math.max(0, visibleAdvance - innerTipCapInset);
                if (!(visibleAdvance > 0.001) || !(outerCenterAdvance > 0.001)) return;
                drawStartX = startX;
                drawStartY = yH;
                drawEndX = startX + dirSign * outerCenterAdvance;
                drawEndY = yH;
                manualTipAlignedLayers = {
                    innerEndX: startX + dirSign * innerCenterAdvance,
                    innerEndY: yH,
                    innerWidth
                };
            } else {
                if (
                    options.useCurrentTipEndpoint &&
                    Number.isFinite(newestSrc.x) &&
                    Number.isFinite(newestSrc.y)
                ) {
                    const tipOffset = offsetFor(newestSrc);
                    drawEndX = newestSrc.x + tipOffset.x;
                    drawEndY = newestSrc.y + tipOffset.y;
                }
                if (options.useRenderedTipEndpoint && renderedStep3TipDrawPoint) {
                    drawEndX = renderedStep3TipDrawPoint.x;
                    drawEndY = renderedStep3TipDrawPoint.y;
                    const tipLead = Number.isFinite(options.renderedTipEndpointLead)
                        ? options.renderedTipEndpointLead
                        : 0;
                    if (tipLead > 0.001) {
                        const leadDx = drawEndX - startX;
                        const leadDy = drawEndY - startY;
                        const leadLen = Math.hypot(leadDx, leadDy);
                        if (leadLen > 0.001) {
                            drawEndX += (leadDx / leadLen) * tipLead;
                            drawEndY += (leadDy / leadLen) * tipLead;
                        }
                    }
                    if (options.flattenEarlyRenderedTipY) {
                        const blendStart = Number.isFinite(options.flattenRenderedTipYBlendStart)
                            ? options.flattenRenderedTipYBlendStart
                            : 0.84;
                        const blendEnd = Number.isFinite(options.flattenRenderedTipYBlendEnd)
                            ? options.flattenRenderedTipYBlendEnd
                            : 0.98;
                        const span = Math.max(0.001, blendEnd - blendStart);
                        const t = clamp01((activeProgress - blendStart) / span);
                        const yBlend = t * t * (3 - 2 * t);
                        drawEndY = startY + (drawEndY - startY) * yBlend;
                    }
                }
            }
            // ライブ描画の線(始点→描画終点)を記録しておき、凍結時にこれをそのまま焼き込む。
            // 凍結時に切先を再計算すると、リカバリーへ移った刀身位置や別経路の切先と食い違い、
            // 最終フレームで剣筋が短く/上にズレて刀身から離れる(途切れ)ため、ライブ最終フレームと同一にする。
            if (options.recordLiveDraw) {
                this._step3LiveDraw = {
                    startX: drawStartX, startY: drawStartY, endX: drawEndX, endY: drawEndY,
                    trailAttackId: (this.currentAttack && Number.isFinite(this.currentAttack.trailAttackId))
                        ? this.currentAttack.trailAttackId
                        : null
                };
            }
            // 【step3 描画終端の前進延長】描画される剣筋の先端だけ進行方向へ少し伸ばし刀身の切先まで届かせる
            // (ニンジャは visualTipReachPaddingPx=0 で丸キャップ分手前で止まり「短い」とユーザー指摘)。
            // 記録(_step3LiveDraw は上で焼込済)も step4始点の参照元(記録 trailCurveEnd)も変えない=step4位置(457)不変=描画専用。
            // この関数はライブ(5892)・凍結(6111)の両経路が通るので両フレームで同じだけ伸びる。Yは固定で水平を維持。
            {
                const STEP3_DRAW_REACH_EXTEND = (this.characterType === 'shogun') ? 0 : 24; // 切先まで届かせる前進量(px)。要実機調整
                if (STEP3_DRAW_REACH_EXTEND > 0) {
                    const _extDir = (drawEndX >= drawStartX ? 1 : -1);
                    drawEndX += _extDir * STEP3_DRAW_REACH_EXTEND;
                    if (manualTipAlignedLayers) manualTipAlignedLayers.innerEndX += _extDir * STEP3_DRAW_REACH_EXTEND;
                }
            }
            const linePts = [
                {
                    x: drawStartX,
                    y: drawStartY,
                    age: oldestSrc.age || 0,
                    life: Math.max(1, oldestSrc.life || this.comboSlashTrailActiveLifeMs)
                },
                {
                    x: drawEndX,
                    y: drawEndY,
                    age: newestSrc.age || 0,
                    life: Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs)
                }
            ];
            const _lineTrailStep = options.comboStep || (newestSrc && newestSrc.step) || 0;
            if (manualTipAlignedLayers) {
                // step3(直線スラッシュ): 本体を両端テーパー塗りリボンにして他段と質感を統一。
                drawTaperedRibbonTrail(
                    linePts,
                    baseWidth,
                    bluePalette.front,
                    oldestScale * 0.62,
                    newestScale,
                    projectFn,
                    { lineCap: options.lineCap, trailStep: _lineTrailStep }
                );
                // 明るい芯(切先=実刀身の innerEnd へ tip-align。色/明るさは新コアに合わせる)
                drawGradientLinearTrail(
                    [
                        linePts[0],
                        {
                            ...linePts[1],
                            x: manualTipAlignedLayers.innerEndX,
                            y: manualTipAlignedLayers.innerEndY
                        }
                    ],
                    manualTipAlignedLayers.innerWidth,
                    [232, 248, 255],
                    oldestScale * 0.18,
                    newestScale * 0.66,
                    projectFn,
                    { lineCap: options.lineCap, trailStep: _lineTrailStep }
                );
            } else {
                drawBlueTrailLayers(linePts, baseWidth, oldestScale, newestScale, projectFn, {
                    lineCap: options.lineCap,
                    trailStep: _lineTrailStep
                });
            }
        };
        const drawDualBlueArcTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (_oonagiSuppressStroke) return; // 大薙中は通常サイズ剣筋を隠す
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

            // 通常コンボに合わせた「消える前線」: 弧の後端(最古角)を前端(現在の刃)へ詰めて末尾→先端へ退かせ、
            // 全体も少し薄める(フワッと)。タイミング/イーズ/二重フェードは通常コンボの dissolve と共通値。
            const _hAge = Math.max(0, newestSrc.age || 0);
            const _sweepP = 1 - Math.pow(1 - clamp01((_hAge - 40) / 340), 1.8);
            const _gFade = 1 - 0.22 * _sweepP;

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
            // 退き: 後端(最古角)を前端へ詰める。movingForwardなら start側が最古、後退中なら end側が最古。
            let drawStart = start, drawEnd = end;
            if (movingForward) drawStart = start + (end - start) * _sweepP;
            else drawEnd = end - (end - start) * _sweepP;
            const frontAlpha = Math.max(0.03, newestAlpha) * _gFade;
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
            ctx.arc(trailCenterX, trailCenterY, radius, drawStart, drawEnd, ccw);
            ctx.stroke();

            ctx.strokeStyle = colorRgba([255, 255, 255], frontAlpha * 0.46);
            ctx.lineWidth = Math.max(1.4, baseWidth * 0.18);
            ctx.beginPath();
            ctx.arc(trailCenterX, trailCenterY, Math.max(2, radius - 2.2), drawStart + 0.03, drawEnd + 0.03, ccw);
            ctx.stroke();
        };
        const drawStep4AnchoredArcTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (_oonagiSuppressStroke) return; // 大薙中は通常サイズ剣筋を隠す
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

            const isRelative = !!newestSrc.trailIsRelative;
            const offsetX = isRelative
                ? (Number.isFinite(newestSrc.playerX) ? newestSrc.playerX : (options.offsetX || 0))
                : 0;
            const offsetY = isRelative
                ? (Number.isFinite(newestSrc.playerY) ? newestSrc.playerY : (options.offsetY || 0))
                : 0;

            const startXRaw = Number.isFinite(newestSrc.trailCurveStartX) ? newestSrc.trailCurveStartX : null;
            const startYRaw = Number.isFinite(newestSrc.trailCurveStartY) ? newestSrc.trailCurveStartY : null;
            const controlXRaw = Number.isFinite(newestSrc.trailCurveControlX) ? newestSrc.trailCurveControlX : null;
            const controlYRaw = Number.isFinite(newestSrc.trailCurveControlY) ? newestSrc.trailCurveControlY : null;
            const endXRaw = Number.isFinite(newestSrc.trailCurveEndX) ? newestSrc.trailCurveEndX : null;
            const endYRaw = Number.isFinite(newestSrc.trailCurveEndY) ? newestSrc.trailCurveEndY : null;

            if ([startXRaw, startYRaw, controlXRaw, controlYRaw, endXRaw, endYRaw].some((v) => !Number.isFinite(v))) {
                return;
            }

            const startX = startXRaw + offsetX;
            const startY = startYRaw + offsetY;
            const controlX = controlXRaw + offsetX;
            const controlY = controlYRaw + offsetY;
            const endX = endXRaw + offsetX;
            const endY = endYRaw + offsetY;
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
            drawBlueTrailLayers(strip, baseWidth, oldestScale, newestScale, projectFn, { trailStep: (newestSrc && newestSrc.step) || 0 });
        };
        const drawFixedBezierTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (_oonagiSuppressStroke) return; // 大薙中は通常サイズ剣筋を隠す
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
            // カーブは常に最新サンプル点から読む。step5は攻撃開始時に決めた完成カーブを
            // ライブ中も固定しており、ここに現れる値が描画の単一ソースになる。
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
                    // step5は実進行度がサンプル点へ毎フレーム焼き込まれている
                    // (freezeNormalComboFinisherTrailCurve)。ここで1.0(完成形)へ飛ばすと、
                    // 凍結スナップショット化されない分身の残存剣筋だけが攻撃終了の瞬間に
                    // フルカーブへ変形し、本体の凍結形状(実進行度)と食い違う。
                    if (comboStep === 5 && Number.isFinite(newestSrc.progress)) {
                        return newestSrc.progress;
                    }
                    return 1.0;
                }
                
                const duration = Math.max(1, attackState.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                const timer = Number.isFinite(attackState.attackTimer) ? attackState.attackTimer : this.attackTimer;
                const useMotionElapsed = Number.isFinite(attackState.currentAttack.motionElapsedMs);
                const rawProgress = useMotionElapsed
                    ? clamp01(attackState.currentAttack.motionElapsedMs / duration)
                    : clamp01(1 - (timer / duration));
                return this.getAttackMotionProgress(attackState.currentAttack, rawProgress);
            })();
            const trailWindow = this.getComboTrailProgressWindow(comboStep);
            const growthWindow = trailWindow;

            // フラッシング（点滅）の原因になるため、ageによる完成形の強制描画を削除。
            let growth = (() => {
                // 凍結軌跡はそのままのスナップショットとして扱う

                const p = Number.isFinite(activeProgress)
                    ? activeProgress
                    : 1.0; // 取得できなかった場合は完成形とする
                if (p <= growthWindow.start) return 0;
                if (p >= growthWindow.end) return 1;
                const span = Math.max(0.001, growthWindow.end - growthWindow.start);
                return clamp01((p - growthWindow.start) / span);
            })();
            // step5は完成カーブを固定し、進行度だけでリビールする。
            // 終端を落下中の切っ先へ毎フレーム追従させると、制御点も動いて
            // 描画中に弧の曲率が変わって見えるため避ける。
            if (growth <= 0.001) return;
            let drawEndX = endX;
            let drawEndY = endY;
            const drawControlX = controlX;
            const drawControlY = controlY;
            if (options.trimEnd) {
                const step5TrimControls = comboStep === 5
                    ? getComboStep5ArcControls(startX, startY, drawEndX, drawEndY)
                    : null;
                const trimControlX = step5TrimControls ? step5TrimControls.c2.x : drawControlX;
                const trimControlY = step5TrimControls ? step5TrimControls.c2.y : drawControlY;
                const tangentX = drawEndX - trimControlX;
                const tangentY = drawEndY - trimControlY;
                const tangentLen = Math.hypot(tangentX, tangentY);
                if (tangentLen > 0.001) {
                    const trimFactor = Number.isFinite(options.trimFactor) ? options.trimFactor : 0.28;
                    // 端キャップ（線幅の丸み）の半径ぶんを確実にトリムできるよう、
                    // tangent長による制限は「ほぼ全部」まで許容する
                    const trim = Math.min(baseWidth * trimFactor, tangentLen * 0.9);
                    drawEndX -= (tangentX / tangentLen) * trim;
                    drawEndY -= (tangentY / tangentLen) * trim;
                }
            }
            let drawGrowth = growth;
            const stripCount = Math.max(12, Math.round(12 + growth * 16));
            const useStep5FixedArc = comboStep === 5;
            const step5ArcControls = useStep5FixedArc
                ? getComboStep5ArcControls(startX, startY, drawEndX, drawEndY)
                : null;
            const curvePoint = (t) => {
                if (step5ArcControls) {
                    const oneMinusT = 1 - t;
                    return {
                        x: oneMinusT * oneMinusT * oneMinusT * startX
                            + 3 * oneMinusT * oneMinusT * t * step5ArcControls.c1.x
                            + 3 * oneMinusT * t * t * step5ArcControls.c2.x
                            + t * t * t * drawEndX,
                        y: oneMinusT * oneMinusT * oneMinusT * startY
                            + 3 * oneMinusT * oneMinusT * t * step5ArcControls.c1.y
                            + 3 * oneMinusT * t * t * step5ArcControls.c2.y
                            + t * t * t * drawEndY
                    };
                }
                const oneMinusT = 1 - t;
                return {
                    x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * drawControlX + t * t * drawEndX,
                    y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * drawControlY + t * t * drawEndY
                };
            };
            if (useStep5FixedArc && sourceIsAttacking) {
                const attackState = renderOptions.attackState || {
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer,
                    x: this.x,
                    y: this.y,
                    width: typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : PLAYER.WIDTH,
                    height: typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : PLAYER.HEIGHT,
                    facingRight: this.facingRight,
                    isCrouching: this.isCrouching
                };
                const activeAttack = attackState.currentAttack || this.currentAttack;
                if (activeAttack && activeAttack.comboStep === 5 && typeof this.getComboSwordPoseState === 'function') {
                    const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                    const timer = Number.isFinite(attackState.attackTimer) ? attackState.attackTimer : this.attackTimer;
                    const rawProgress = Number.isFinite(activeAttack.motionElapsedMs)
                        ? clamp01(activeAttack.motionElapsedMs / duration)
                        : clamp01(1 - (timer / duration));
                    const poseState = {
                        x: Number.isFinite(attackState.x) ? attackState.x : this.x,
                        y: Number.isFinite(attackState.y) ? attackState.y : this.y,
                        width: Number.isFinite(attackState.width)
                            ? attackState.width
                            : (typeof this.getWorldWidth === 'function' ? this.getWorldWidth() : PLAYER.WIDTH),
                        height: Number.isFinite(attackState.height)
                            ? attackState.height
                            : (typeof this.getWorldHeight === 'function' ? this.getWorldHeight() : PLAYER.HEIGHT),
                        facingRight: attackState.facingRight !== undefined ? attackState.facingRight : this.facingRight,
                        isCrouching: attackState.isCrouching !== undefined ? attackState.isCrouching : this.isCrouching,
                        currentAttack: activeAttack,
                        attackTimer: Math.max(0, duration * (1 - rawProgress)),
                        recoveryBlend: 0
                    };
                    let liveTipX = null;
                    let liveTipY = null;
                    if (
                        this.characterType === 'shogun' &&
                        typeof this.getShogunRenderedComboTipWorld === 'function'
                    ) {
                        const renderedTip = this.getShogunRenderedComboTipWorld(poseState, rawProgress);
                        if (renderedTip && Number.isFinite(renderedTip.x) && Number.isFinite(renderedTip.y)) {
                            liveTipX = renderedTip.x;
                            liveTipY = renderedTip.y;
                        }
                    }
                    if (!Number.isFinite(liveTipX)) {
                        let livePose = this.getComboSwordPoseState(poseState);
                        if (livePose && this.characterType === 'shogun' && typeof this._projectShogunTrailPoseToWorldScale === 'function') {
                            livePose = this._projectShogunTrailPoseToWorldScale(livePose, poseState);
                        }
                        if (livePose && Number.isFinite(livePose.trailTipX) && Number.isFinite(livePose.trailTipY)) {
                            liveTipX = livePose.trailTipX;
                            liveTipY = livePose.trailTipY;
                        }
                    }
                    if (Number.isFinite(liveTipX) && drawGrowth < 0.999) {
                        const dirSign = (poseState.facingRight ? 1 : -1);
                        const capped = getComboStep5CappedProgress({
                            startX,
                            startY,
                            endX: drawEndX,
                            endY: drawEndY,
                            growth: drawGrowth,
                            growthWindow,
                            tipX: liveTipX,
                            tipY: liveTipY,
                            dirSign,
                            baseWidth
                        });
                        drawGrowth = capped.growth;
                        if (Number.isFinite(capped.progress)) {
                            newestSrc.step5CappedProgress = capped.progress;
                            newestSrc.progress = capped.progress;
                            activeAttack._trailRenderProgress = capped.progress;
                        }
                    }
                }
            }
            const mergedStrip = [];
            for (let i = 0; i < stripCount; i++) {
                const t = (stripCount <= 1 ? 1 : (i / (stripCount - 1))) * drawGrowth;
                const p = curvePoint(t);
                mergedStrip.push({
                    x: p.x,
                    y: p.y,
                    age: oldestSrc.age + (newestSrc.age - oldestSrc.age) * (stripCount <= 1 ? 1 : i / (stripCount - 1)),
                    life: Math.max(
                        1,
                        (oldestSrc.life || this.comboSlashTrailActiveLifeMs) +
                        ((newestSrc.life || this.comboSlashTrailActiveLifeMs) - (oldestSrc.life || this.comboSlashTrailActiveLifeMs)) *
                        (stripCount <= 1 ? 1 : i / (stripCount - 1))
                    )
                });
            }
            drawBlueTrailLayers(mergedStrip, baseWidth, oldestScale, newestScale, projectFn, { trailStep: (newestSrc && newestSrc.step) || 0 });
        };
        const drawSampledBezierTrail = (pts, baseWidth, oldestScale, newestScale, projectFn = null, options = {}) => {
            if (_oonagiSuppressStroke) return; // 大薙中は通常サイズ剣筋を隠す
            if (!pts || pts.length < 2) return;
            const comboStep = options.comboStep || pts[pts.length - 1]?.step || 0;
            let curveStrip = buildThreePointQuadraticStrip(pts, comboStep, options);
            if (options.trimEndCap) {
                const trimFactor = Number.isFinite(options.trimFactor) ? options.trimFactor : 0.5;
                curveStrip = trimTrailEndPoint(curveStrip, baseWidth * trimFactor);
            }
            drawBlueTrailLayers(curveStrip, baseWidth, oldestScale, newestScale, projectFn, { trailStep: comboStep });
        };
        const forceLinearSmooth = !!options.forceLinearSmooth;
        // 各ストリップ（段ごとの軌跡）を独立して描画
        for (const strip of strips) {
            const stripStep = strip[strip.length - 1]?.step || 0;
            if (strip.length < 1) continue;
            if (strip.length < 2 && (forceLinearSmooth || ![1, 2, 3, 4, 5].includes(stripStep))) continue;

            // 描画関数内部で age/life に基づく線形フェードが掛かるため、スケールは固定値を渡す
            const outerOldestAlpha = baseOldestAlpha;
            const outerNewestAlpha = baseNewestAlpha;

            let projFn = null;
            let activeWidthScale = visualWidthScale * physicalScale;
            let boostOldest = outerOldestAlpha;

            const stripTrailId = strip[strip.length - 1]?.trailAttackId || stripStep;
            const boostAnchor = getBoostAnchor(stripTrailId);
            const boostActive = baseBoostActive || !!boostAnchor;

            if (boostActive) {
                let baseCenterX = trailCenterX;
                let baseCenterY = trailCenterY;
                // 絶対系ストリップ(step3/4/5など)は「攻撃開始時アンカー」基準で拡大中心を固定する。
                // trailCenter(anchor作成フレームのキャラ現在中心)を使うと、キャラが移動中の場合
                // anchor作成タイミングに依存して本体と分身の拡大中心がばらつき、
                // 大凪中のstep4縦剣筋の間隔がキャラ間隔と一致しなくなる。
                const anchorSrcPt = strip[strip.length - 1];
                if (
                    anchorSrcPt &&
                    !anchorSrcPt.trailIsRelative &&
                    Number.isFinite(anchorSrcPt.trailTransformPlayerX) &&
                    Number.isFinite(anchorSrcPt.trailTransformPlayerY)
                ) {
                    baseCenterX = anchorSrcPt.trailTransformPlayerX + this.getWorldWidth() * 0.5;
                    baseCenterY = anchorSrcPt.trailTransformPlayerY + this.getWorldHeight() * 0.5;
                }
                let projectedCenterX = baseCenterX;
                let projectedCenterY = baseCenterY;
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
                    // 拡大中心は baseCenter（キャラ中心）に統一する。
                    // projectedCenter(hitbox中心)へ移動すると、凍結スナップショット
                    // (projFnFrozen=baseCenter基準) へ切り替わる瞬間に step3/4 の剣筋が
                    // hitboxオフセット分ジャンプし、ライブ継続中の分身とも位置が揃わない。
                    return {
                        x: baseCenterX + vx * currentBoostScale,
                        y: baseCenterY + vy * currentBoostScale
                    };
                };
                activeWidthScale = trailWidthScale * physicalScale;
                boostOldest = outerOldestAlpha * 0.35;
            }

            // 重複描画防止のためのスキップ処理は撤廃。
            // freezing時にメインバッファを空にする仕組みに変更したため、現在メインバッファにいる軌跡は正真正銘の「新しい攻撃」の軌跡。
            // 大薙中はこのストリップのベース剣筋を抑止（drawOonagiRangeEffect が自身のストロークでフラグを下ろす）。
            _oonagiSuppressStroke = oonagiHideBaseTrail;
            if (forceLinearSmooth) {
                // 二刀流用: Chaikin平滑化 + スムーズ曲線描画
                const smoothed = buildChaikinSmoothedStrip(strip, 2);
                drawBlueTrailLayers(smoothed, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { smooth: true });
                drawOonagiRangeEffect(strip, stripStep, null, {
                    effectStrip: smoothed,
                    newestScale: outerNewestAlpha,
                    rgb: bluePalette.front,
                    // 二刀流step2は後方への切り上げなので大薙リーチも後方へ反転する
                    reverseReach: stripStep === 2
                });
                continue;
            }
            
            // 通常時 or ブースト時 共通描画
            if (stripStep === 5) {
                if (boostActive && boostAnchor && boostAnchor.step === stripStep) {
                    const anchorPlayerX = boostAnchor.baseCenterX - this.getWorldWidth() * 0.5;
                    const anchorPlayerY = boostAnchor.baseCenterY - this.getWorldHeight() * 0.5;
                    const scaleProjFn = (p) => {
                        const vx = p.x - boostAnchor.baseCenterX;
                        const vy = p.y - boostAnchor.baseCenterY;
                        return {
                            x: boostAnchor.baseCenterX + vx * boostAnchor.boostScale,
                            y: boostAnchor.baseCenterY + vy * boostAnchor.boostScale
                        };
                    };
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, scaleProjFn, {
                        comboStep: 5,
                        useRelativeIfAvailable: true,
                        offsetX: anchorPlayerX,
                        offsetY: anchorPlayerY,
                        forceOffsetX: anchorPlayerX,
                        forceOffsetY: anchorPlayerY,
                        trimEnd: true,
                        // 端キャップ(線幅の丸み)が切っ先を視覚的に越えないよう深めにトリム
                        trimFactor: getComboStep5EndTrimFactor(physicalScale)
                    });
                    drawOonagiRangeEffect(strip, 5, projFn, {
                        useRelativeIfAvailable: true,
                        offsetX: anchorPlayerX,
                        offsetY: anchorPlayerY,
                        forceOffsetX: anchorPlayerX,
                        forceOffsetY: anchorPlayerY,
                        newestScale: outerNewestAlpha
                    });
                } else {
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, {
                        comboStep: 5,
                        useRelativeIfAvailable: true,
                        offsetX: this.x,
                        offsetY: this.y,
                        trimEnd: true,
                        // 端キャップ(線幅の丸み)が切っ先を視覚的に越えないよう深めにトリム
                        trimFactor: getComboStep5EndTrimFactor(physicalScale)
                    });
                    drawOonagiRangeEffect(strip, 5, projFn, {
                        useRelativeIfAvailable: true,
                        offsetX: this.x,
                        offsetY: this.y,
                        newestScale: outerNewestAlpha
                    });
                }
            } else if (stripStep === 1) {
                if (boostActive && boostAnchor && boostAnchor.step === stripStep) {
                    // 大凪ブースト時: forceOffsetX/forceOffsetYを使って、過去のプレイヤー位置を上書きしてアンカー位置に固定する
                    const anchorPlayerX = boostAnchor.baseCenterX - this.getWorldWidth() * 0.5;
                    const anchorPlayerY = boostAnchor.baseCenterY - this.getWorldHeight() * 0.5;
                    
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
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, scaleProjFn, {
                        comboStep: stripStep, useRelativeIfAvailable: true, offsetX: anchorPlayerX, offsetY: anchorPlayerY, forceOffsetX: anchorPlayerX, forceOffsetY: anchorPlayerY,
                        trimEnd: true, trimFactor: 0.5
                    });
                    drawOonagiRangeEffect(strip, stripStep, projFn, {
                        useRelativeIfAvailable: true,
                        offsetX: anchorPlayerX,
                        offsetY: anchorPlayerY,
                        forceOffsetX: anchorPlayerX,
                        forceOffsetY: anchorPlayerY,
                        newestScale: outerNewestAlpha
                    });
                } else {
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, {
                        comboStep: stripStep, useRelativeIfAvailable: true, offsetX: this.x, offsetY: this.y,
                        trimEnd: true, trimFactor: 0.5
                    });
                    drawOonagiRangeEffect(strip, stripStep, projFn, {
                        useRelativeIfAvailable: true,
                        offsetX: this.x,
                        offsetY: this.y,
                        newestScale: outerNewestAlpha
                    });
                }
            } else if (stripStep === 2) {
                if (boostActive && boostAnchor && boostAnchor.step === stripStep) {
                    const scaleProjFn = (p) => {
                        const vx = p.x - boostAnchor.baseCenterX;
                        const vy = p.y - boostAnchor.baseCenterY;
                        return {
                            x: boostAnchor.baseCenterX + vx * boostAnchor.boostScale,
                            y: boostAnchor.baseCenterY + vy * boostAnchor.boostScale
                        };
                    };
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, scaleProjFn, {
                        comboStep: 2,
                        useRelativeIfAvailable: true,
                        trimEnd: true,
                        trimFactor: 0.5
                    });
                    drawOonagiRangeEffect(strip, 2, projFn, {
                        useRelativeIfAvailable: true,
                        newestScale: outerNewestAlpha
                    });
                } else {
                    drawFixedBezierTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, {
                        comboStep: 2,
                        useRelativeIfAvailable: true,
                        trimEnd: true,
                        trimFactor: 0.5
                    });
                    drawOonagiRangeEffect(strip, 2, projFn, {
                        useRelativeIfAvailable: true,
                        newestScale: outerNewestAlpha
                    });
                }
            } else if (stripStep === 4) {
                drawStep4AnchoredArcTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { includeGhost: false });
                drawOonagiRangeEffect(strip, 4, projFn, {
                    useRelativeIfAvailable: true,
                    offsetX: this.x,
                    offsetY: this.y,
                    newestScale: outerNewestAlpha
                });
            } else if (stripStep === 3) {
                // 忍者・将軍とも「攻撃開始時に確定した固定直線を、切先のX位置に連動して伸長する」方式に統一。
                // 切先追従(useRenderedTipEndpoint)は頭が毎フレーム動いて剣筋が暴れるため使わない。
                // 終点は現在の切先Xで止め、丸キャップ分だけ中心線を内側に入れて視覚上も切先を追い抜かない。
                //
                // 大薙中も剣筋の形状は通常コンボ側に揃える。
                const step3Width = 13.8 * activeWidthScale;
                drawStep3StableLinearTrail(strip, step3Width, boostOldest, outerNewestAlpha, null, {
                    useRelativeIfAvailable: true,
                    offsetX: this.x,
                    offsetY: this.y,
                    useRawProgressForGrowth: false,
                    useCurrentTipEndpoint: false,
                    useRenderedTipEndpoint: false,
                    useCurrentTipForRevealProgress: true,
                    clampGrowthToCurrentTip: true,
                    currentTipCapTrim: 0,
                    // 「固定Yで完全に水平、切先のXまで」: Yは完成線から固定し、終点Xだけ切先へ追従。
                    forceHorizontalToTip: true,
                    inverseProjectFn: null,
                    roundCapTipInset: step3Width * 0.5,
                    visualTipReachPaddingPx: this.characterType === 'shogun' ? step3Width * 0.55 : 0,
                    // ライブ最終フレーム(水平・切先到達)の描画を記録し、凍結時に同一形状で焼き込む。
                    recordLiveDraw: true
                });
                drawOonagiRangeEffect(strip, 3, null, {
                    useRelativeIfAvailable: true,
                    offsetX: this.x,
                    offsetY: this.y,
                    newestScale: outerNewestAlpha,
                    useRawProgressForGrowth: false,
                    useCurrentTipEndpoint: false,
                    useRenderedTipEndpoint: false,
                    useCurrentTipForRevealProgress: true,
                    clampGrowthToCurrentTip: true,
                    currentTipCapTrim: 0,
                    forceHorizontalToTip: true,
                    inverseProjectFn: null,
                    roundCapTipInset: step3Width * 0.5,
                    visualTipReachPaddingPx: this.characterType === 'shogun' ? step3Width * 0.55 : 0
                });
            } else {
                drawDualBlueArcTrail(strip, 13.8 * activeWidthScale, boostOldest, outerNewestAlpha, projFn, { includeGhost: false });
                drawOonagiRangeEffect(strip, stripStep, projFn, {
                    effectStrip: strip,
                    newestScale: outerNewestAlpha
                });
            }
        }
        // 大薙のベース抑止はライブストリップのみ。凍結カーブ(フェード中の残像)は通常どおり描く。
        _oonagiSuppressStroke = false;

        // 凍結スナップショットの独立描画
        // 描画関数内部のフェード(age)と進行(progress)計算を完全に無効化し、
        // 「完成形」の形状データとして既存の描画関数に渡す。
        // フェード自体は ctx.globalAlpha で直接制御する。
        if (hasFrozenCurves) {
            for (const fc of frozenCurves) {
                if ((fc.age || 0) >= (fc.life || 1)) continue;
                // 大薙中に凍結したカーブ(rangeEffectScale が焼き込まれている)は、ライブと同様に
                // 通常サイズのベース剣筋を隠し、焼き込んだ大薙エフェクトのみ描く（凍結後のフェード中も一貫）。
                _oonagiSuppressStroke = Number.isFinite(fc.rangeEffectScale) && fc.rangeEffectScale > 1.01;

                // 凍結時に焼き込んだ幅スケールで描く。ライブの visualWidthScale は
                // 「次の攻撃中は 1.0」になるため、大凪の太い剣筋が凍結後に細るのを防ぐ。
                const frozenWidthScale = Number.isFinite(fc.trailWidthScale)
                    ? fc.trailWidthScale
                    : visualWidthScale;

                ctx.save();
                
                if (fc.type === 'sampledBezier' && Array.isArray(fc.frozenPoints)) {
                    const pts = Array.isArray(fc.frozenPoints) ? fc.frozenPoints : null;
                    if (!pts || pts.length < 2) { ctx.restore(); continue; }
                    // 凍結時にabsolutizeRelativeTrailPoint済みなので、
                    // 単純なアンカー中心からのスケーリングのみ
                    let projFnFrozen = null;
                    if (fc.boostAnchor) {
                        const anchorX = Number.isFinite(fc.boostAnchor.baseCenterX)
                            ? fc.boostAnchor.baseCenterX
                            : fc.boostAnchor.projectedCenterX;
                        const anchorY = Number.isFinite(fc.boostAnchor.baseCenterY)
                            ? fc.boostAnchor.baseCenterY
                            : fc.boostAnchor.projectedCenterY;
                        projFnFrozen = (p) => {
                            const vx = p.x - anchorX;
                            const vy = p.y - anchorY;
                            return {
                                x: anchorX + vx * fc.boostAnchor.boostScale,
                                y: anchorY + vy * fc.boostAnchor.boostScale
                            };
                        };
                    }

                    drawSampledBezierTrail(pts, 13.8 * frozenWidthScale * physicalScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen, {
                        comboStep: fc.step,
                        trimEndCap: fc.step === 2, trimFactor: 0.5
                    });
                    if (Number.isFinite(fc.rangeEffectScale) && fc.rangeEffectScale > 1.01) {
                        drawOonagiRangeEffect(pts, fc.step, projFnFrozen, {
                            rangeEffectScale: fc.rangeEffectScale,
                            forceRangeEffectActive: true,
                            newestScale: baseNewestAlpha,
                            comboStep: fc.step,
                            trimEnd: true,
                            trimFactor: fc.step === 5 ? getComboStep5EndTrimFactor(physicalScale) : 0.5
                        });
                    }
                } else if (fc.type === 'bezier' || !fc.type) {
                    // ベジェ曲線段 (1, 2, 5)
                    if (!Number.isFinite(fc.trailCurveStartX)) { ctx.restore(); continue; }
                    
                    // 描画関数内部の自然なグラデーションフェード（oldestFade〜newestFade）に完全に委ねる。
                    // 凍結時のパラメータ（age, oldestAge）は updateComboSlashTrail で毎フレーム加算されているため
                    // ここでそのまま渡すだけで、メインバッファ時代と全く同じ計算で綺麗に消えていく。
                    const frozenProgress = (fc.step === 5 && Number.isFinite(fc.progress))
                        ? fc.progress
                        : 1.0;
                    const frozenPtNew = {
                        x: 0, y: 0,
                        step: fc.step,
                        dir: fc.dir,
                        progress: frozenProgress,
                        trailCurveStartX: fc.trailCurveStartX,
                        trailCurveStartY: fc.trailCurveStartY,
                        trailCurveControlX: fc.trailCurveControlX,
                        trailCurveControlY: fc.trailCurveControlY,
                        trailCurveMidX: fc.trailCurveMidX,
                        trailCurveMidY: fc.trailCurveMidY,
                        trailCurveMidT: fc.trailCurveMidT,
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
                        const anchorX = Number.isFinite(fc.boostAnchor.baseCenterX)
                            ? fc.boostAnchor.baseCenterX
                            : fc.boostAnchor.projectedCenterX;
                        const anchorY = Number.isFinite(fc.boostAnchor.baseCenterY)
                            ? fc.boostAnchor.baseCenterY
                            : fc.boostAnchor.projectedCenterY;
                        projFnFrozen = (p) => {
                            const vx = p.x - anchorX;
                            const vy = p.y - anchorY;
                            return {
                                x: anchorX + vx * fc.boostAnchor.boostScale,
                                y: anchorY + vy * fc.boostAnchor.boostScale
                            };
                        };
                    }
                    
                    drawFixedBezierTrail([frozenPtOld, frozenPtNew], 13.8 * frozenWidthScale * physicalScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen, {
                        comboStep: fc.step,
                        forceRelative: !!fc.trailIsRelative,
                        useRelativeIfAvailable: true,
                        offsetX: offsetX,
                        offsetY: offsetY,
                        // ライブ描画と同じ終端トリムを適用し、凍結へ切り替わる瞬間の長さ変化を防ぐ。
                        trimEnd: true,
                        trimFactor: fc.step === 5 ? getComboStep5EndTrimFactor(physicalScale) : 0.5
                    });
                    if (Number.isFinite(fc.rangeEffectScale) && fc.rangeEffectScale > 1.01) {
                        drawOonagiRangeEffect([frozenPtOld, frozenPtNew], fc.step, projFnFrozen, {
                            rangeEffectScale: fc.rangeEffectScale,
                            forceRangeEffectActive: true,
                            newestScale: baseNewestAlpha,
                            comboStep: fc.step,
                            forceRelative: !!fc.trailIsRelative,
                            useRelativeIfAvailable: true,
                            offsetX: offsetX,
                            offsetY: offsetY,
                            trimEnd: true,
                            trimFactor: fc.step === 5 ? getComboStep5EndTrimFactor(physicalScale) : 0.5
                        });
                    }
                } else if (fc.type === 'points' && Array.isArray(fc.frozenPoints)) {
                    // ポイント系段 (3, 4)
                    // ポイントごとに保持されている正しい age をそのまま渡す。
                    const pts = fc.frozenPoints;
                    if (pts.length < 2) { ctx.restore(); continue; }
                    
                    const currentFootX = this.getFootX ? this.getFootX() : (this.x + this.getWorldWidth() * 0.5);
                    const currentFootY = this.getFootY ? this.getFootY() : (this.y + this.getWorldHeight());
                    const savedCenterX = trailCenterX;
                    const savedCenterY = trailCenterY;
                    
                    // 凍結された剣筋を描画する際は、現在のプレイヤーの足元ではなく、凍結した瞬間に保存された固定中心座標を使用。
                    // これにより、プレイヤーが移動・ジャンプしても剣筋がその場にピタッと固定されて美しくフェードアウトする。
                    trailCenterX = (fc.frozenTrailCenterX !== undefined) ? fc.frozenTrailCenterX : currentFootX;
                    trailCenterY = (fc.frozenTrailCenterY !== undefined) ? fc.frozenTrailCenterY : (currentFootY - this.getWorldHeight() * 0.5);

                    let projFnFrozen = null;
                    if (fc.boostAnchor) {
                        const anchorX = Number.isFinite(fc.boostAnchor.baseCenterX)
                            ? fc.boostAnchor.baseCenterX
                            : fc.boostAnchor.projectedCenterX;
                        const anchorY = Number.isFinite(fc.boostAnchor.baseCenterY)
                            ? fc.boostAnchor.baseCenterY
                            : fc.boostAnchor.projectedCenterY;
                        projFnFrozen = (p) => {
                            const vx = p.x - anchorX;
                            const vy = p.y - anchorY;
                            return {
                                x: anchorX + vx * fc.boostAnchor.boostScale,
                                y: anchorY + vy * fc.boostAnchor.boostScale
                            };
                        };
                    }

                    if (fc.step === 4) {
                        drawStep4AnchoredArcTrail(pts, 13.8 * frozenWidthScale * physicalScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen);
                    } else if (fc.step === 3) {
                        // step3 はライブ同様、大薙ブーストでも位置投影せず太さ(frozenWidthScale)だけでブースト。
                        // projFnFrozen(キャラ中心基準の位置拡大)を通すと前方直線が飛んで刀身から分離するため null。
                        drawStep3StableLinearTrail(pts, 13.8 * frozenWidthScale * physicalScale, baseOldestAlpha, baseNewestAlpha, null);
                    } else {
                        drawDualBlueArcTrail(pts, 13.8 * frozenWidthScale * physicalScale, baseOldestAlpha, baseNewestAlpha, projFnFrozen);
                    }
                    if (Number.isFinite(fc.rangeEffectScale) && fc.rangeEffectScale > 1.01) {
                        drawOonagiRangeEffect(pts, fc.step, fc.step === 3 ? null : projFnFrozen, {
                            rangeEffectScale: fc.rangeEffectScale,
                            forceRangeEffectActive: true,
                            newestScale: baseNewestAlpha,
                            useRelativeIfAvailable: true
                        });
                    }
                    
                    trailCenterX = savedCenterX;
                    trailCenterY = savedCenterY;
                }
                
                ctx.restore();
            }
        }


        // 大薙時も剣筋は通常コンボ側の形状を使う。

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

        let tipX = blade.tipX;
        let tipY = blade.tipY;
        let handX = blade.handX;
        let handY = blade.handY;

        // 将軍: dualBladeTrailAnchors は renderModel 内のアクタースペースで計算されるため、
        // ワールドスケール座標へ投影する（_projectShogunTrailPoseToWorldScale と同じ式）。
        if (this.characterType === 'shogun') {
            const scale = Number.isFinite(this.scaleMultiplier) && this.scaleMultiplier > 0
                ? this.scaleMultiplier : 1;
            if (scale > 1.001) {
                const px = this.x;
                const py = this.y;
                const footOffset = (typeof this._getCloneFootOffset === 'function')
                    ? this._getCloneFootOffset()
                    : (PLAYER.HEIGHT - SHOGUN_ACTOR_BASE_HEIGHT * 0.62) * scale;
                const worldH = (typeof this.getWorldHeight === 'function') ? this.getWorldHeight() : PLAYER.HEIGHT * scale;
                const worldW = (typeof this.getWorldWidth === 'function') ? this.getWorldWidth() : PLAYER.WIDTH * scale;
                const actorRenderDY = worldH - footOffset - SHOGUN_ACTOR_BASE_HEIGHT * 0.62;
                const renderPivotX = px + worldW * 0.5;
                const renderPivotY = py + actorRenderDY + PLAYER.HEIGHT * 0.62;
                const basePivotX = px + PLAYER.WIDTH * 0.5;
                const basePivotY = py + PLAYER.HEIGHT * 0.62;
                const proj = (nX, nY) => ({
                    x: renderPivotX + (nX - basePivotX) * scale,
                    y: renderPivotY + (nY - basePivotY) * scale
                });
                const t = proj(tipX, tipY);
                tipX = t.x; tipY = t.y;
                const h = proj(handX, handY);
                handX = h.x; handY = h.y;
            }
        }

        return {
            tipX,
            tipY,
            dir: anchors.direction,
            comboStep: comboStep,
            progress: progress,
            centerX: handX,
            centerY: handY,
            originX: this.x + this.getWorldWidth() * 0.5,
            originY: this.y + this.getWorldHeight() * 0.5
        };
    };

    /**
     * 二刀流 step4(天穿)のトレイルポーズの横振れを圧縮する（本体・分身共用）。
     * 縦の斬り上げが理想形だが、切っ先の生軌道は手の揺れで横に±40px程度うねり、
     * 太い帯で描くとS字に歪んで見える。トレイル専用にバッファ先頭点を基準として
     * 横偏差を圧縮し、一定のなだらかな縦剣筋へ整える（刀本体の描画には影響しない）。
     */
    const DUAL_STEP4_TRAIL_X_DAMP = 0.3;
    PlayerClass.prototype.flattenDualStep4TrailPose = function(pose, buffer, activeTrailId) {
        if (!pose || pose.comboStep !== 4) return pose;
        if (!Array.isArray(buffer) || buffer.length === 0) return pose;
        // 基準点は「現在のスイングの最初の点」。前スイングのフェード残り点が
        // バッファに共存するため(クリア廃止)、buffer[0] を使うと古いスイングの
        // 位置へ引っ張られて剣筋が後方へ反転する。末尾から同一 trailAttackId の
        // 連続区間を遡り、その先頭を基準にする。
        let ref = null;
        for (let i = buffer.length - 1; i >= 0; i--) {
            const q = buffer[i];
            if (!q) break;
            if (
                Number.isFinite(activeTrailId) &&
                Number.isFinite(q.trailAttackId) &&
                q.trailAttackId !== activeTrailId
            ) break;
            ref = q;
        }
        if (!ref || !Number.isFinite(ref.x) || !Number.isFinite(pose.tipX)) return pose;
        // 序盤〜中盤は強めに直線化し、振り抜き終盤(progress 0.45→0.65)は実際の
        // 刀位置へ追従させる。終点が刀から横に離れず、根本は直線・先端側が
        // 自然にカーブする縦剣筋になる。
        const pr = Number.isFinite(pose.progress) ? pose.progress : 0;
        const follow = Math.max(0, Math.min(1, (pr - 0.45) / 0.2));
        const damp = DUAL_STEP4_TRAIL_X_DAMP + (1 - DUAL_STEP4_TRAIL_X_DAMP) * follow;
        pose.tipX = ref.x + (pose.tipX - ref.x) * damp;
        return pose;
    };

    /**
     * 二刀流Zコンボの剣筋点列を「曲率一定の滑らかな円弧」へ再配置する（描画用・本体/分身共用）。
     * 生の切っ先軌道は速度ムラ・手の揺れで波打つ上、振りが速い段(step1-3)は実サンプルが
     * 4〜5点と少なく間隔も最大4倍ばらつくため、二次スムーズでも粗いポリラインになり弧が歪む。
     * そこで run 全点を「最小二乗円フィット」して安定した円を求め、その弧上に「角度等間隔」で
     * 多点(〜28点)へ再サンプルする。これで点数・間隔の偏りが消え、真円に近い滑らかな弧になる。
     * 3点未満や直線に近い run は直線として等間隔に再サンプルする。age/life/progress はフェード分布を
     * 保つため弧長比で補間し、その他メタデータ(段/trailId/相対フラグ/アンカー等)は run 内一定なので
     * 先頭点から引き継ぐ。元のバッファは変更しない。
     */
    PlayerClass.prototype.fitDualTrailPointsToArc = function(points) {
        if (!Array.isArray(points) || points.length < 3) return points;
        const out = [];
        const flushRun = (start, end) => { // [start, end)
            const n = end - start;
            if (n < 3) {
                for (let i = start; i < end; i++) out.push(points[i]);
                return;
            }
            // 弧長累積（フェード分布の補間パラメータ）
            const cum = new Array(n).fill(0);
            let total = 0;
            for (let i = 1; i < n; i++) {
                const p0 = points[start + i - 1];
                const p1 = points[start + i];
                total += Math.hypot(p1.x - p0.x, p1.y - p0.y);
                cum[i] = total;
            }
            if (total < 0.001) {
                for (let i = start; i < end; i++) out.push(points[i]);
                return;
            }
            const activeLife = this.comboSlashTrailActiveLifeMs;
            const base = points[start]; // run 内一定メタデータの引き継ぎ元
            // 弧長比 t(0..1) に対応する age/life/progress を元点列から補間
            const interpMeta = (t) => {
                const target = t * total;
                let j = 1;
                while (j < n - 1 && cum[j] < target) j++;
                const f0 = cum[j - 1], f1 = cum[j];
                const lt = f1 > f0 ? Math.max(0, Math.min(1, (target - f0) / (f1 - f0))) : 0;
                const pa = points[start + j - 1], pb = points[start + j];
                const lerp = (u, v) => u + (v - u) * lt;
                const meta = {
                    age: lerp(pa.age || 0, pb.age || 0),
                    life: Math.max(1, lerp(pa.life || activeLife, pb.life || activeLife))
                };
                if (Number.isFinite(pa.progress) && Number.isFinite(pb.progress)) {
                    meta.progress = lerp(pa.progress, pb.progress);
                }
                return meta;
            };
            // 出力点数: 弧の角度量に応じて密に（最低14・最大28）。元点数も下限に含める。
            const emit = (pos, t) => {
                const meta = interpMeta(t);
                const pt = { ...base, x: pos.x, y: pos.y, age: meta.age, life: meta.life };
                if (meta.progress !== undefined) pt.progress = meta.progress;
                out.push(pt);
            };

            // --- 最小二乗円フィット（Kåsa法）: run 全点で安定した円を求める ---
            let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0, Sz = 0;
            for (let i = 0; i < n; i++) {
                const px = points[start + i].x, py = points[start + i].y;
                const z = px * px + py * py;
                Sx += px; Sy += py; Sxx += px * px; Syy += py * py; Sxy += px * py;
                Sxz += px * z; Syz += py * z; Sz += z;
            }
            // 正規方程式 [Sxx Sxy Sx; Sxy Syy Sy; Sx Sy n] [D E F]^T = [-Sxz -Syz -Sz]^T
            const det = (m) =>
                m[0] * (m[4] * m[8] - m[5] * m[7]) -
                m[1] * (m[3] * m[8] - m[5] * m[6]) +
                m[2] * (m[3] * m[7] - m[4] * m[6]);
            const A = [Sxx, Sxy, Sx, Sxy, Syy, Sy, Sx, Sy, n];
            const detA = det(A);
            const a0 = points[start], b0 = points[end - 1];
            const chord = Math.hypot(b0.x - a0.x, b0.y - a0.y);
            let useLine = Math.abs(detA) < 1e-9;
            let ux = 0, uy = 0, radius = 0;
            if (!useLine) {
                const rhs = [-Sxz, -Syz, -Sz];
                const repl = (col) => { const c = A.slice(); c[col] = rhs[0]; c[col + 3] = rhs[1]; c[col + 6] = rhs[2]; return c; };
                const D = det(repl(0)) / detA;
                const E = det(repl(1)) / detA;
                const F = det(repl(2)) / detA;
                ux = -D / 2; uy = -E / 2;
                const r2 = ux * ux + uy * uy - F;
                if (!(r2 > 0)) useLine = true;
                else {
                    radius = Math.sqrt(r2);
                    // 半径が弦に対して極端に大きい＝ほぼ直線。数値安定のため直線扱い
                    if (radius > chord * 40) useLine = true;
                }
            }

            // 出力点数（角度量ベース、直線時は弦長ベース）
            const resampleCount = (sweepAbs) => {
                const byAngle = Math.round(sweepAbs / (Math.PI / 45)); // 4°刻み
                return Math.max(14, Math.min(28, Math.max(byAngle, n)));
            };

            if (useLine) {
                const M = Math.max(14, Math.min(28, n));
                for (let i = 0; i < M; i++) {
                    const t = i / (M - 1);
                    emit({ x: a0.x + (b0.x - a0.x) * t, y: a0.y + (b0.y - a0.y) * t }, t);
                }
                return;
            }

            // 実点の角度を辿って「実際に掃いた符号付き角度」を累積（端点差では向き・巻きを誤る）
            const angOf = (p) => Math.atan2(p.y - uy, p.x - ux);
            const angStart = angOf(points[start]);
            let angPrev = angStart;
            let sweepTotal = 0;
            for (let i = 1; i < n; i++) {
                let ang = angOf(points[start + i]);
                let d = ang - angPrev;
                while (d > Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                sweepTotal += d;
                angPrev = ang;
            }
            const M = resampleCount(Math.abs(sweepTotal));
            for (let i = 0; i < M; i++) {
                const t = i / (M - 1);
                const ang = angStart + sweepTotal * t;
                emit({ x: ux + Math.cos(ang) * radius, y: uy + Math.sin(ang) * radius }, t);
            }
        };
        let runStart = 0;
        for (let i = 1; i <= points.length; i++) {
            const splitHere = i === points.length ||
                (points[i].step || 0) !== (points[runStart].step || 0) ||
                (
                    Number.isFinite(points[i].trailAttackId) &&
                    Number.isFinite(points[runStart].trailAttackId) &&
                    points[i].trailAttackId !== points[runStart].trailAttackId
                );
            if (splitHere) {
                flushRun(runStart, i);
                runStart = i;
            }
        }
        return out;
    };

    /**
     * 二刀流Zコンボの剣筋バッファ更新の共通コア（本体・分身ミラー・Lv3自律分身が共用）。
     * サンプリング窓・寿命・大凪スケール・スイング切替の扱いをここに一本化することで、
     * 本体と分身の剣筋仕様が常に同一になる（個別実装による二重管理を排除）。
     * 前スイングの点はクリアせず、activeTrailId 不一致による老化で自然にフェードさせる
     * （通常コンボの「前の剣筋が残って消えていく」仕様と同じ）。
     *
     * state: {
     *   active,                         // 二刀Z振り中か
     *   comboStep,                      // 1..4, 0=5段目
     *   progress,                       // 現在の振り進行度 0..1
     *   swingId,                        // スイング識別子（trailAttackId の生成に使用）
     *   backPose, frontPose,            // サンプル用ポーズ（null=サンプルなし・フェードのみ）
     *   backPoints, frontPoints,        // バッファ配列（参照のまま更新される）
     *   backSampleTimer, frontSampleTimer, lastSwingId,
     *   trailScale, rangeEffectScale    // 大凪の剣筋幅スケール / 前方範囲表示スケール
     * }
     * returns { backSampleTimer, frontSampleTimer, lastSwingId }
     */
    PlayerClass.prototype.updateDualTrailState = function(deltaMs, state) {
        const active = !!state.active;
        const comboStepRaw = Number.isFinite(state.comboStep) ? state.comboStep : 0;
        const comboStep = comboStepRaw === 0 ? 5 : comboStepRaw;
        const p = Math.max(0, Math.min(1, Number.isFinite(state.progress) ? state.progress : 0));
        const backPose = state.backPose || null;
        const frontPose = state.frontPose || null;

        // 同じ段数を繰り返してもトレイルが前回と繋がらないよう、
        // swingId で毎回ユニークなIDにする（通常コンボと同じ挙動）
        const swingId = Number.isFinite(state.swingId) ? state.swingId : 0;
        const activeTrailId = active ? (comboStep * 10000 + swingId) : null;

        // step4(天穿): トレイルの横振れを圧縮して縦剣筋をなだらかに保つ。
        // 基準点の特定に現在のスイングID(activeTrailId)が必要（前スイングの
        // フェード残り点がバッファに共存するため）。
        if (backPose) this.flattenDualStep4TrailPose(backPose, state.backPoints, activeTrailId);
        if (frontPose) this.flattenDualStep4TrailPose(frontPose, state.frontPoints, activeTrailId);

        // 1-2撃目: 静止側のトレイルは生成しない（null poseで自然フェードアウト）
        const suppressBack = active && comboStep === 2;  // 2撃目: 奥刀は静止
        const suppressFront = active && comboStep === 1; // 1撃目: 手前刀は静止

        // 振りかぶりフェーズや余韻フェーズ（アイドル復帰中）は剣筋を出さない
        let startSuppress = false;
        let settleSuppress = false;
        if (active) {
            // 振りかぶりやスナップ移動による初期の折れ曲がり（ヘアピン）を防ぐ
            if (comboStep === 2 && p < 0.15) startSuppress = true;
            if (comboStep === 3 && p < 0.15) startSuppress = true;
            if (comboStep === 4 && p < 0.05) startSuppress = true; // 天穿は溜めが短いが極初期だけ抑制
            // 5段目はアーチ頂点(p≈0.25)の手前の上昇中の点を含めると根本が折れて見えるため、
            // 頂点を過ぎて下りに乗ってから開始する
            if (comboStep === 5 && p < 0.26) startSuppress = true;

            // 振り抜き後の余韻（刀が戻り始める区間）は軌跡を残さない。
            // ただし切先は各段とも「切先ピーク（最遠点）」まで前進してから戻る/止まるため(実測)、
            // そのピークまでサンプルを続けて剣筋の終点を実際の最終切先に届かせる。ピーク後の戻りは含めない。
            //   step1-3: 横/斜め斬りの切先ピーク p≈0.66-0.68（その後刀は戻る。旧0.48-0.55は手前で凍結し15-25px短かった）
            //   step4(天穿): 上昇ピーク p≈0.72（その後退く。旧0.65は18px短かった）
            //   step5(叩きつけ): 切先は最終位置まで単調に下降し底で静止 p≈0.96（旧0.78は22px短かった）
            if (comboStep === 1 && p > 0.68) settleSuppress = true;
            if (comboStep === 2 && p > 0.68) settleSuppress = true;
            if (comboStep === 3 && p > 0.68) settleSuppress = true;
            if (comboStep === 4 && p > 0.72) settleSuppress = true;
            if (comboStep === 5 && p > 0.96) settleSuppress = true;
        }

        // スイング切替直後の1フレームは、アンカー(renderModel由来)が前スイング位置の
        // ままなのでサンプルしない。前スイングの点はクリアせず老化フェードに任せる。
        let lastSwingId = state.lastSwingId;
        let skipSampleThisFrame = false;
        let backSampleTimerIn = state.backSampleTimer;
        let frontSampleTimerIn = state.frontSampleTimer;
        if (active && lastSwingId !== swingId) {
            lastSwingId = swingId;
            skipSampleThisFrame = true;
            // スイング開始でサンプル位相をリセットする。前の振りのタイマー残りが
            // 本体と分身で異なると、サンプル位相が1フレームずれて振り終端の1点が
            // 片方だけ欠け、剣筋の端の到達位置（例: step1 の下端）が変わってしまう。
            backSampleTimerIn = 0;
            frontSampleTimerIn = 0;
        }
        if (!active) lastSwingId = -1;

        const trailScale = Number.isFinite(state.trailScale) ? state.trailScale : 1;
        const rangeEffectScale = Number.isFinite(state.rangeEffectScale) ? state.rangeEffectScale : 1;
        const backSampleTimer = this.updateSlashTrailBuffer(
            state.backPoints,
            backSampleTimerIn,
            (suppressBack || startSuppress || settleSuppress || skipSampleThisFrame) ? null : backPose,
            deltaMs,
            { holdExisting: false, activeTrailId: activeTrailId, sampleTrailScale: trailScale, sampleRangeEffectScale: rangeEffectScale }
        );
        const frontSampleTimer = this.updateSlashTrailBuffer(
            state.frontPoints,
            frontSampleTimerIn,
            (suppressFront || startSuppress || settleSuppress || skipSampleThisFrame) ? null : frontPose,
            deltaMs,
            { holdExisting: false, activeTrailId: activeTrailId, sampleTrailScale: trailScale, sampleRangeEffectScale: rangeEffectScale }
        );
        return { backSampleTimer, frontSampleTimer, lastSwingId };
    };

    /**
     * 二刀流Zコンボ中、奥刀・手前刀それぞれのトレイルバッファを
     * 通常コンボと同じ updateSlashTrailBuffer で更新する（本体用ラッパ）。
     */
    PlayerClass.prototype.updateDualBladeSlashTrails = function(deltaMs) {
        if (deltaMs <= 0) return;
        const isDualZ = !!(
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0 &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流'
        );
        const dualBlade = (isDualZ && this.currentSubWeapon) ? this.currentSubWeapon : null;
        // 振り終了後の整定中(_dualZSettleTimer>0)は、武器の comboIndex がリンク切れで 0(=5段目)へ
        // リセットされる。直読みするとファントムの step5 剣筋を1フレームだけ描いてしまう
        // （特に将軍は投影で遠くへ飛び、赤断片が青剣筋付近に出る）。ポーズ側は _dualZSettleComboIndex で
        // 振っていた段を固定しているので、トレイルも同じ段を使い本体/分身・忍者/将軍で統一する。
        const dualSwingStep = (
            dualBlade &&
            !dualBlade.isAttacking &&
            (this._dualZSettleTimer || 0) > 0 &&
            Number.isFinite(this._dualZSettleComboIndex)
        )
            ? this._dualZSettleComboIndex
            : (dualBlade ? (dualBlade.comboIndex || 0) : 0);
        const result = this.updateDualTrailState(deltaMs, {
            active: isDualZ,
            comboStep: dualSwingStep,
            progress: dualBlade ? dualBlade.getMainSwingProgress() : 0,
            swingId: dualBlade ? (dualBlade._swingId || 0) : 0,
            backPose: isDualZ ? this.getDualBladePoseForTrail('back') : null,
            frontPose: isDualZ ? this.getDualBladePoseForTrail('front') : null,
            backPoints: this.dualBladeBackTrailPoints,
            frontPoints: this.dualBladeFrontTrailPoints,
            backSampleTimer: this.dualBladeBackTrailSampleTimer,
            frontSampleTimer: this.dualBladeFrontTrailSampleTimer,
            lastSwingId: this._lastDualSwingId,
            trailScale: this.getXAttackTrailWidthScale(),
            rangeEffectScale: (() => {
                const boostActive = typeof this.isXAttackBoostActive === 'function' && this.isXAttackBoostActive();
                const actionActive = typeof this.isXAttackActionActive === 'function' && this.isXAttackActionActive();
                if (!boostActive || !actionActive) return 1;
                if (typeof this.getXAttackRangeEffectScale === 'function') return Math.max(1, this.getXAttackRangeEffectScale());
                if (typeof this.getXAttackHitboxScale === 'function') return Math.max(1, this.getXAttackHitboxScale());
                return 1;
            })()
        });
        this.dualBladeBackTrailSampleTimer = result.backSampleTimer;
        this.dualBladeFrontTrailSampleTimer = result.frontSampleTimer;
        this._lastDualSwingId = result.lastSwingId;
    };

    /**
     * 二刀流コンボのトレイルを描画する（本体・分身共用）。
     * 奥刀 = 青、手前刀 = 赤で、renderComboSlashTrail の描画インフラを再利用。
     * 分身は options.backPoints/frontPoints/boostAnchors で自身のバッファと
     * 大凪アンカー辞書を渡すことで、本体と完全に同じ描画仕様（弧フィット・
     * パレット・大凪の位置固定/拡大）になる。
     */
    PlayerClass.prototype.renderDualBladeSlashTrails = function(ctx, options = {}) {
        const bluePalette = { front: [130, 234, 255], back: [76, 154, 226] };
        const redPalette = { front: [255, 90, 90], back: [214, 74, 74] };
        const backPoints = options.backPoints !== undefined ? options.backPoints : this.dualBladeBackTrailPoints;
        const frontPoints = options.frontPoints !== undefined ? options.frontPoints : this.dualBladeFrontTrailPoints;
        // 大凪の位置固定アンカーは trailId(段×スイング)ごとの辞書で保持する。
        // 残存スイングの剣筋にも各自のアンカーが効き、本体・分身で同一仕様になる。
        if (!options.boostAnchors && !this._dualBoostAnchors) {
            this._dualBoostAnchors = { back: {}, front: {} };
        }
        const anchors = options.boostAnchors || this._dualBoostAnchors;
        if (!anchors.back) anchors.back = {};
        if (!anchors.front) anchors.front = {};
        const isDualZActive = options.isAttacking !== undefined
            ? !!options.isAttacking
            : !!(this.subWeaponAction === '二刀_Z' && this.subWeaponTimer > 0);
        const physicalScale = Number.isFinite(options.physicalScale) && options.physicalScale > 1
            ? options.physicalScale : 1;

        // バッファが空になったらアンカー辞書を掃除（スイントごとに増えるため）
        if (!backPoints || backPoints.length === 0) anchors.back = {};
        if (!frontPoints || frontPoints.length === 0) anchors.front = {};

        if (backPoints && backPoints.length >= 2) {
            this.renderComboSlashTrail(ctx, {
                // 描画前に一定曲率の弧へ再配置（生軌道の縒れを排除）
                points: this.fitDualTrailPointsToArc(backPoints),
                palette: bluePalette,
                forceLinearSmooth: true,
                isAttacking: isDualZActive,
                physicalScale,
                getBoostAnchor: (id) => (id !== null && id !== undefined ? (anchors.back[id] || null) : null),
                setBoostAnchor: (id, v) => {
                    if (id === null || id === undefined) return;
                    if (v) anchors.back[id] = v; else delete anchors.back[id];
                }
            });
        }
        if (frontPoints && frontPoints.length >= 2) {
            this.renderComboSlashTrail(ctx, {
                points: this.fitDualTrailPointsToArc(frontPoints),
                palette: redPalette,
                forceLinearSmooth: true,
                isAttacking: isDualZActive,
                physicalScale,
                getBoostAnchor: (id) => (id !== null && id !== undefined ? (anchors.front[id] || null) : null),
                setBoostAnchor: (id, v) => {
                    if (id === null || id === undefined) return;
                    if (v) anchors.front[id] = v; else delete anchors.front[id];
                }
            });
        }
    };
}
