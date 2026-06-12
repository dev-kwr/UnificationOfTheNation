import { LANE_OFFSET, PLAYER } from './constants.js';
import { NORMAL_COMBO_STEP3_LAUNCH_VY } from './playerData.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function getNormalComboStep4RiseScale(scaleMultiplier = 1) {
    const scale = Number.isFinite(scaleMultiplier) && scaleMultiplier > 1 ? scaleMultiplier : 1;
    return 1 + (scale - 1) * 0.62;
}

export function getNormalComboStep5DownwardControl(startX, startY, endX, endY) {
    if (![startX, startY, endX, endY].every(Number.isFinite)) return null;
    const dx = endX - startX;
    const dy = endY - startY;
    const xMin = Math.min(startX, endX) - 4;
    const xMax = Math.max(startX, endX) + 4;
    const yMin = Math.min(startY, endY);
    const yMax = Math.max(startY, endY);

    // step5は添付の理想形に合わせ、制御点を終点側へ寄せる。
    // 始端から外側へ膨らみ、終端付近で縦に落ちる「振り下ろし」カーブにする。
    return {
        x: Math.max(xMin, Math.min(xMax, startX + dx * 0.78)),
        y: Math.max(yMin, Math.min(yMax, startY + dy * 0.46))
    };
}

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
        const scaleMult = actor.scaleMultiplier || 1.0;
        actor.vx = actor.vx * 0.12 + direction * impulse * 1.71 * scaleMult;
        actor.vy = Math.min(actor.vy, NORMAL_COMBO_STEP3_LAUNCH_VY * Math.sqrt(scaleMult));
        actor.isGrounded = false;
        return true;
    }

    if (step === 4) {
        const scaleMult4 = actor.scaleMultiplier || 1.0;
        const riseScale4 = getNormalComboStep4RiseScale(scaleMult4);
        actor.vx = actor.vx * 0.24 + direction * impulse * 0.42;
        // 将軍は画面外へ抜けやすいため、体格スケールの上昇分だけ少し圧縮する
        actor.vy = Math.min(actor.vy, -10.6 * riseScale4);
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
        // 体格スケールの上昇分だけ少し圧縮し、将軍が画面外へ抜けすぎない高さに収める
        // (滞空hold相の速度はクランプ[-1.0, 0.95]が支配するため実質上昇相のみに効く)
        const z4HeightScale = 0.96 * getNormalComboStep4RiseScale(actor.scaleMultiplier || 1.0);

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
        // 上昇(step4)と同じく落下速度も体格スケール倍し、将軍でも
        // 忍者と同じ「身長比の速度感」でスピーディーに振り下ろす
        const scaleMult5 = actor.scaleMultiplier || 1.0;
        if (progress < 0.26) {
            actor.vx *= 0.82;
            actor.vy = Math.min(actor.vy, -1.2);
        } else if (progress < 0.76) {
            const fallT = (progress - 0.26) / 0.5;
            actor.vx = actor.vx * 0.7 + direction * actor.speed * 0.08;
            actor.vy = actor.vy * 0.34 + (9.8 + fallT * 19.8) * 0.66 * scaleMult5;
        } else {
            actor.vx *= 0.64;
            if (!actor.isGrounded) {
                actor.vy = Math.max(actor.vy, 13.4 * scaleMult5);
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
    const rawProgress = Number.isFinite(activeAttack.motionElapsedMs)
        ? clamp01(activeAttack.motionElapsedMs / duration)
        : clamp01(1 - (attackTimer / duration));
    const progress = rawProgress;
    const renderProgress = Number.isFinite(options.renderProgress)
        ? clamp01(options.renderProgress)
        : rawProgress;
    if (!Number.isFinite(activeAttack.trailCurveEndX) || !Number.isFinite(activeAttack.trailCurveEndY)) return false;

    // 実際の切っ先位置（スペック空間）へ攻撃開始直後から毎フレーム指数的に追従させる。
    // 一発で置き換えると凍結瞬間に予測誤差分だけ「ガタッ」と跳ぶため滑らかに寄せ続ける。
    // 序盤はリビール（描画）前なので大きな補正も見えず、終端が見える頃には収束している。
    // （落下途中発動・レーン・段差・速度差などで予測着地がずれても連続的に補正される）
    const tip = options.actualTipSpec;
    let freezing = progress >= 0.76 && options.isGrounded !== false;
    if (tip && Number.isFinite(tip.x) && Number.isFinite(tip.y)) {
        // 適応チェイス: ターゲット（切っ先）の移動速度に応じて追従率を上げる。
        // 速度フィードフォワード方式はターゲット停止（着地）の1フレーム後に
        // 古い移動量を余分に足して「ガクッ」と行き過ぎるため使わない。
        // 純粋な指数追従はターゲットを跨ぐことが構造上ないため行き過ぎが起きない。
        // 接地後は基礎追従率を上げて素早く収束させる。
        const prevTX = activeAttack._trailTipPrevX;
        const prevTY = activeAttack._trailTipPrevY;
        const tipSpeed = (Number.isFinite(prevTX) ? Math.abs(tip.x - prevTX) : 0)
            + (Number.isFinite(prevTY) ? Math.abs(tip.y - prevTY) : 0);
        const baseChase = options.isGrounded !== false ? 0.55 : 0.3;
        const chase = Math.min(0.85, baseChase + tipSpeed / 45);

        const targetX = tip.x;
        const targetY = tip.y;
        const chaseDx = targetX - activeAttack.trailCurveEndX;
        const chaseDy = targetY - activeAttack.trailCurveEndY;
        const chaseResidual = Math.hypot(chaseDx, chaseDy);
        if (chaseResidual < 0.35) {
            activeAttack.trailCurveEndX = targetX;
            activeAttack.trailCurveEndY = targetY;
        } else {
            activeAttack.trailCurveEndX += chaseDx * chase;
            activeAttack.trailCurveEndY += chaseDy * chase;
        }
        activeAttack._trailTipPrevX = tip.x;
        activeAttack._trailTipPrevY = tip.y;

        // 凍結は追従が十分収束し、切っ先側もほぼ静止してから確定する。
        // 確定フレームのスナップは1px前後に抑え、凍結後の終点を切っ先へ安定して合わせる。
        const residual = Math.hypot(targetX - activeAttack.trailCurveEndX, targetY - activeAttack.trailCurveEndY);
        if (freezing && residual < 1.4 && tipSpeed < 2.2) {
            activeAttack.trailCurveEndX = targetX;
            activeAttack.trailCurveEndY = targetY;
        } else {
            freezing = false;
        }
    }

    const groundY = Number.isFinite(options.groundY) ? options.groundY : 0;
    const ownerHeight = Number.isFinite(options.ownerHeight) ? options.ownerHeight : PLAYER.HEIGHT;
    const slashFloorY = (groundY + LANE_OFFSET) - Math.max(10, ownerHeight * 0.1);
    const cappedEndY = Math.min(activeAttack.trailCurveEndY, slashFloorY);
    activeAttack.trailCurveEndY = cappedEndY;
    const downwardControl = getNormalComboStep5DownwardControl(
        activeAttack.trailCurveStartX,
        activeAttack.trailCurveStartY,
        activeAttack.trailCurveEndX,
        activeAttack.trailCurveEndY
    );
    if (downwardControl) {
        activeAttack.trailCurveControlX = downwardControl.x;
        activeAttack.trailCurveControlY = Math.min(downwardControl.y, cappedEndY);
    } else {
        activeAttack.trailCurveControlY = Math.min(activeAttack.trailCurveControlY, cappedEndY);
    }

    const trailPoints = Array.isArray(options.trailPoints) ? options.trailPoints : null;
    if (trailPoints) {
        // attack側の値はスペック空間（正規化ポーズ空間）、サンプル済みポイントは
        // ワールド座標（将軍は投影済み）のため、点へ書き戻す際は projectPoint で同じ空間へ揃える
        const projectPoint = typeof options.projectPoint === 'function'
            ? options.projectPoint
            : (px, py) => ({ x: px, y: py });
        const endPt = projectPoint(activeAttack.trailCurveEndX, activeAttack.trailCurveEndY);
        const controlPt = projectPoint(activeAttack.trailCurveControlX, activeAttack.trailCurveControlY);
        for (let i = 0; i < trailPoints.length; i++) {
            const point = trailPoints[i];
            if (!point || (point.step || 0) !== 5) continue;
            point.trailCurveEndX = endPt.x;
            point.trailCurveEndY = endPt.y;
            point.trailCurveControlX = controlPt.x;
            point.trailCurveControlY = controlPt.y;
            // ライブ描画は eased progress でリビール長を決めるため、
            // 凍結後も同じ表示長になるようサンプル点へ焼き込む。
            point.progress = Number.isFinite(point.progress)
                ? Math.max(point.progress, renderProgress)
                : renderProgress;
            if (freezing) {
                // 確定済みマーク: 以降の老化を高速化し、刀の戻りモーションより先にフェードさせる
                point.trailCurveFrozen = true;
            }
        }
    }

    // 凍結確定は「終盤・接地済み」が揃ってから（終点は確定フレームで切っ先へ厳密一致済み）
    if (freezing) {
        activeAttack.trailCurveFrozen = true;
        activeAttack._trailFrozenProgress = renderProgress;
        return true;
    }
    activeAttack._trailRenderProgress = renderProgress;
    return false;
}
