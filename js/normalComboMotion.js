import { LANE_OFFSET, PLAYER } from './constants.js';
import { NORMAL_COMBO_STEP3_LAUNCH_VY } from './playerData.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function prepareNormalComboFinisherProfile(attackProfile) {
    if (!attackProfile) return;
    attackProfile.knockbackX = 16;
    attackProfile.knockbackY = -7;
    attackProfile.range = Math.max(attackProfile.range || 0, 128);
}

export function applyNormalComboStartMotion(actor, attackProfile, options = {}) {
    if (!actor || !attackProfile) return false;
    const step = attackProfile.comboStep || 0;
    const direction = actor.facingRight ? 1 : -1;
    const speed = Number.isFinite(options.speed) ? options.speed : actor.speed;
    const impulse = (attackProfile.impulse || 1) * speed;
    const isCrouching = options.isCrouching !== undefined ? !!options.isCrouching : !!actor.isCrouching;

    if (isCrouching) {
        actor.vx = direction * impulse * 0.28;
        return true;
    }

    if (step === 1) {
        const groundedAtStart = actor.isGrounded;
        actor.vx *= 0.12;
        if (Math.abs(actor.vx) < 0.2) actor.vx = 0;
        if (groundedAtStart) {
            actor.vy = 0;
            actor.isGrounded = true;
        } else {
            actor.vy = Math.max(actor.vy, -0.8);
        }
        return true;
    }

    if (step === 2) {
        actor.vx = actor.vx * 0.16 + direction * impulse * 0.9;
        if (actor.isGrounded) {
            actor.vy = 0;
            actor.isGrounded = true;
        } else {
            actor.vy = Math.min(actor.vy, -1.2);
        }
        return true;
    }

    if (step === 3) {
        actor.vx = actor.vx * 0.12 + direction * impulse * 1.71;
        actor.vy = Math.min(actor.vy, NORMAL_COMBO_STEP3_LAUNCH_VY);
        actor.isGrounded = false;
        return true;
    }

    if (step === 4) {
        actor.vx = actor.vx * 0.24 + direction * impulse * 0.42;
        actor.vy = Math.min(actor.vy, -10.6);
        actor.isGrounded = false;
        return true;
    }

    if (step === 5) {
        actor.vx *= 0.18;
        actor.vy = Math.max(actor.vy, 3.4);
        actor.isGrounded = false;
        return true;
    }

    return false;
}

export function applyNormalComboActiveMotion(actor, activeAttack, attackTimer, options = {}) {
    if (!actor || !activeAttack || !activeAttack.comboStep) return false;
    const step = activeAttack.comboStep;
    const fallbackDurationMs = Number.isFinite(options.fallbackDurationMs)
        ? options.fallbackDurationMs
        : PLAYER.ATTACK_COOLDOWN;

    if (actor.isGrounded) {
        actor.vx *= 0.965;
    }

    if (step === 1 && attackTimer > 0) {
        const direction = actor.facingRight ? 1 : -1;
        actor.vx *= 0.62;
        if (actor.vx * direction < 0) actor.vx = 0;
        if (Math.abs(actor.vx) < 0.18) actor.vx = 0;
        if (actor.isGrounded) {
            actor.vy = 0;
        } else {
            actor.vy = Math.max(actor.vy, 1.2);
        }
        return true;
    }

    if (step === 4 && attackTimer > 0) {
        const duration = Math.max(1, activeAttack.durationMs || fallbackDurationMs);
        const progress = Number.isFinite(activeAttack.motionElapsedMs)
            ? clamp01(activeAttack.motionElapsedMs / duration)
            : clamp01(1 - (attackTimer / duration));
        const direction = actor.facingRight ? 1 : -1;
        const z4HeightScale = 0.96;

        if (progress < 0.42) {
            const t = progress / 0.42;
            actor.vx = actor.vx * 0.52 + direction * actor.speed * (0.2 - t * 0.08);
            actor.vy = (-20.4 + t * 2.6) * z4HeightScale;
        } else if (progress < 0.9) {
            const t = (progress - 0.42) / 0.48;
            const backSpeed = actor.speed * (0.66 + t * 0.94);
            const holdVy = (-0.9 + t * 1.18) * z4HeightScale;
            actor.vx = actor.vx * 0.4 + (-direction * backSpeed) * 0.6;
            actor.vy = Math.max(-1.0, Math.min(0.95, holdVy));
        } else {
            actor.vx *= 0.78;
            actor.vy = Math.min(actor.vy, 0.55);
        }

        if (progress < 0.72) {
            const riseLockT = clamp01(progress / 0.72);
            const minRiseVy = (-18.8 + riseLockT * 14.8) * z4HeightScale;
            actor.vy = Math.min(actor.vy, minRiseVy);
            actor.isGrounded = false;
        }
        actor.isGrounded = false;
        return true;
    }

    if (step === 5 && (attackTimer > 0 || !actor.isGrounded)) {
        const duration = Math.max(1, activeAttack.durationMs || fallbackDurationMs);
        const progress = clamp01(1 - (attackTimer / duration));
        const direction = actor.facingRight ? 1 : -1;
        if (progress < 0.26) {
            actor.vx *= 0.82;
            actor.vy = Math.min(actor.vy, -1.2);
        } else if (progress < 0.76) {
            const fallT = (progress - 0.26) / 0.5;
            actor.vx = actor.vx * 0.7 + direction * actor.speed * 0.08;
            actor.vy = actor.vy * 0.34 + (9.8 + fallT * 19.8) * 0.66;
        } else {
            actor.vx *= 0.64;
            if (!actor.isGrounded) {
                actor.vy = Math.max(actor.vy, 13.4);
            }
        }
        return true;
    }

    return false;
}

export function freezeNormalComboFinisherTrailCurve(activeAttack, options = {}) {
    if (!activeAttack || activeAttack.comboStep !== 5 || activeAttack.trailCurveFrozen === true) return false;
    const attackTimer = Number.isFinite(options.attackTimer) ? options.attackTimer : 0;
    const duration = Math.max(1, activeAttack.durationMs || attackTimer || 1);
    const progress = clamp01(1 - (attackTimer / duration));
    if (progress < 0.76) return false;
    if (!Number.isFinite(activeAttack.trailCurveEndX) || !Number.isFinite(activeAttack.trailCurveEndY)) return false;

    const groundY = Number.isFinite(options.groundY) ? options.groundY : 0;
    const ownerHeight = Number.isFinite(options.ownerHeight) ? options.ownerHeight : PLAYER.HEIGHT;
    const slashFloorY = (groundY + LANE_OFFSET) - Math.max(10, ownerHeight * 0.1);
    const frozenEndY = Math.min(activeAttack.trailCurveEndY, slashFloorY);
    activeAttack.trailCurveEndY = frozenEndY;
    activeAttack.trailCurveControlY = Math.min(activeAttack.trailCurveControlY, frozenEndY);
    activeAttack.trailCurveFrozen = true;

    const trailPoints = Array.isArray(options.trailPoints) ? options.trailPoints : null;
    if (trailPoints) {
        for (let i = 0; i < trailPoints.length; i++) {
            const point = trailPoints[i];
            if (!point || (point.step || 0) !== 5) continue;
            point.trailCurveEndX = activeAttack.trailCurveEndX;
            point.trailCurveEndY = frozenEndY;
            point.trailCurveControlX = activeAttack.trailCurveControlX;
            point.trailCurveControlY = Math.min(activeAttack.trailCurveControlY, frozenEndY);
        }
    }

    return true;
}
