// ============================================
// Stage6 角3: 鉤縄で頭上の軒へ登る演出
// 廻縁の突き当たりから屋根の上へ上がる唯一の自然な手段(忍者の身体能力)。
// 建築的な嘘(廻縁から屋根への階段など)を作らずに高さを稼ぐための導線。
//
// 4ビート: windup(振りかぶり) → fly(鉤が飛ぶ) → bite(噛む) → pull(引き上げ)
// 「噛んだ瞬間にたるみが消える」1フレームが説得力の核。
//
// 状態は Stage インスタンスに持たず、この構造体に閉じる。
// 描画は behind(縄・軌跡) / front(鉤頭・火花) の2パスでプレイヤーを挟む。
// すべて描画と見た目の演出のみ — 当たり判定には一切関与しない。
// ============================================

import { STAGE6_CORNER } from './constants.js';
import {
    chainCurve, sampleQuad, drawChain,
    pushTrailPoint, drawCometRibbon,
    makeParticles, drawSparks, drawBlastFlash,
    smoothstep01
} from './weaponFx.js?v=stage6-grapple-20260726a';

export const GRAPPLE_PHASE = {
    NONE: 0,
    WINDUP: 1,
    FLY: 2,
    BITE: 3,
    PULL: 4,
};

const PHASE_MS = {
    [GRAPPLE_PHASE.WINDUP]: () => STAGE6_CORNER.GRAPPLE_WINDUP_MS,
    [GRAPPLE_PHASE.FLY]: () => STAGE6_CORNER.GRAPPLE_ROPE_MS,
    [GRAPPLE_PHASE.BITE]: () => STAGE6_CORNER.GRAPPLE_BITE_MS,
    [GRAPPLE_PHASE.PULL]: () => STAGE6_CORNER.GRAPPLE_PULL_MS,
};

/** 演出の状態。Stage が1つ保持する。 */
export function createGrappleState() {
    return {
        phase: GRAPPLE_PHASE.NONE,
        timer: 0,
        // 噛む位置(ワールド)
        anchorX: 0,
        anchorY: 0,
        // 開始時のプレイヤー左上(ワールド)。引き上げの補間元
        fromX: 0,
        fromY: 0,
        // 手元(縄の起点)。playerRenderer が毎フレーム実測値を書き込む
        handX: 0,
        handY: 0,
        handValid: false,
        // 鉤の現在位置(ワールド)
        hookX: 0,
        hookY: 0,
        hookAngle: 0,
        // 軌跡(鉤先 / プレイヤー)
        hookTrail: [],
        bodyTrail: [],
        // 噛んだ瞬間の火花(1回だけ生成)
        sparks: null,
        sparkT: 0,
        // 鎖の流れ位相(0..1を回す)
        dashPhase: 0,
    };
}

/** 演出中か */
export function isGrappleActive(g) {
    return !!g && g.phase !== GRAPPLE_PHASE.NONE;
}

/** 現在フェーズの進行度(0..1) */
export function grappleProgress(g) {
    if (!isGrappleActive(g)) return 0;
    const dur = PHASE_MS[g.phase]?.() || 1;
    return Math.max(0, Math.min(1, g.timer / dur));
}

/**
 * 演出を開始する。
 * @param cornerX 角(ゾーン境界)のワールドx
 * @param player  開始時のプレイヤー(x,y は左上)
 */
export function startGrapple(g, cornerX, player) {
    g.phase = GRAPPLE_PHASE.WINDUP;
    g.timer = 0;
    g.anchorX = cornerX + STAGE6_CORNER.EAVE_HOOK_DX;
    g.anchorY = STAGE6_CORNER.EAVE_WORLD_Y;
    // 補間元は「プレイヤーの左上」を素で持つ。
    // (以前は手元座標を保存してプレイヤー左上として使っていたため、
    //  引き上げ開始の1フレームで25px跳んでいた)
    g.fromX = player.x;
    g.fromY = player.y;
    g.handValid = false;
    g.handX = player.x + player.getWorldWidth() * 0.5;
    g.handY = player.y + player.getWorldHeight() * 0.32;
    g.hookX = g.handX;
    g.hookY = g.handY;
    g.hookAngle = 0;
    g.hookTrail.length = 0;
    g.bodyTrail.length = 0;
    g.sparks = null;
    g.sparkT = 0;
    g.dashPhase = 0;
}

/**
 * 演出を進める。
 * @returns true なら登り切った(暗転遷移へ引き継ぐ)
 */
export function updateGrapple(g, deltaTime, audio) {
    if (!isGrappleActive(g)) return false;
    const dtMs = deltaTime * 1000;
    g.timer += dtMs;
    g.dashPhase = (g.dashPhase + deltaTime * 1.6) % 1;

    const dur = PHASE_MS[g.phase]?.() || 1;
    if (g.timer < dur) return false;

    // フェーズ送り
    g.timer = 0;
    switch (g.phase) {
        case GRAPPLE_PHASE.WINDUP:
            g.phase = GRAPPLE_PHASE.FLY;
            try { audio?.playShuriken?.(); } catch { /* SEは演出の必須要件ではない */ }
            return false;
        case GRAPPLE_PHASE.FLY:
            g.phase = GRAPPLE_PHASE.BITE;
            // 火花はフェーズ突入時に1回だけ作る。毎フレーム作ると粒が瞬間移動する。
            g.sparks = makeParticles(14, {
                baseAngle: Math.PI * 0.55, spread: Math.PI * 1.1,
                speedMin: 0.55, speedMax: 1.35, sizeMin: 0.9, sizeMax: 2.4, gravity: 0.5
            });
            g.sparkT = 0;
            try { audio?.playDeflect?.(); } catch { /* 同上 */ }
            return false;
        case GRAPPLE_PHASE.BITE:
            g.phase = GRAPPLE_PHASE.PULL;
            try { audio?.playDash?.(); } catch { /* 同上 */ }
            return false;
        case GRAPPLE_PHASE.PULL:
            g.phase = GRAPPLE_PHASE.NONE;
            return true;
        default:
            g.phase = GRAPPLE_PHASE.NONE;
            return false;
    }
}

/** 鎖の張力(0=たるむ / 1=張る)。噛んだ瞬間に1.0へ跳ねるのが要点 */
export function grappleTension(g) {
    const t = grappleProgress(g);
    switch (g.phase) {
        case GRAPPLE_PHASE.WINDUP: return 0.15;
        // 飛んでいる間は少しずつ張ってくる(0.35→0.55)
        case GRAPPLE_PHASE.FLY: return 0.35 + t * 0.2;
        // 噛んだ瞬間から一気に張り詰める
        case GRAPPLE_PHASE.BITE: return 0.55 + smoothstep01(t / 0.35) * 0.45;
        case GRAPPLE_PHASE.PULL: return 1;
        default: return 1;
    }
}

/**
 * 引き上げの縦横位置(0..1)。頂点で減速するよう smoothstep を掛ける。
 * 線形補間だと「等速で吸い込まれる」だけで手応えが出ない。
 */
export function grapplePullEase(g) {
    if (g.phase !== GRAPPLE_PHASE.PULL) return 0;
    const t = grappleProgress(g);
    // 前半は縄に引かれて加速、後半は軒に近づいて減速
    return smoothstep01(t) * 0.55 + t * t * 0.45;
}

/**
 * 毎フレーム、鉤とプレイヤーの位置から見た目の状態を更新する。
 * game.js の更新ループから呼ぶ(描画側で状態を作らない)。
 * @param handX/handY 手元のワールド座標(playerRenderer が実測した値。無ければ推定値)
 */
export function updateGrappleVisual(g, deltaTime, handX, handY, playerCx, playerCy) {
    if (!isGrappleActive(g)) return;
    const dtMs = deltaTime * 1000;
    if (Number.isFinite(handX) && Number.isFinite(handY)) {
        g.handX = handX;
        g.handY = handY;
        g.handValid = true;
    }

    const t = grappleProgress(g);
    if (g.phase === GRAPPLE_PHASE.WINDUP) {
        // 振りかぶり: 鉤を手元の後ろ下へ溜める
        const back = 14 + smoothstep01(t) * 10;
        g.hookX = g.handX - back;
        g.hookY = g.handY + 6 + smoothstep01(t) * 8;
        g.hookAngle = Math.PI * 0.85;
    } else if (g.phase === GRAPPLE_PHASE.FLY) {
        // 飛ぶ: 手元→アンカーへ。到達間際で減速させず、噛む瞬間まで速度を保つ
        const p = t * t * 0.35 + t * 0.65;
        g.hookX = g.handX + (g.anchorX - g.handX) * p;
        g.hookY = g.handY + (g.anchorY - g.handY) * p;
        g.hookAngle = Math.atan2(g.anchorY - g.handY, g.anchorX - g.handX);
        pushTrailPoint(g.hookTrail, g.hookX, g.hookY, dtMs, { maxAge: 180, minDist: 3, cap: 40 });
    } else {
        // 噛んだ後は軒に固定
        g.hookX = g.anchorX;
        g.hookY = g.anchorY;
        g.hookAngle = Math.atan2(g.anchorY - g.handY, g.anchorX - g.handX);
        // 軌跡は老化させるだけ(同じ点を積まない)
        pushTrailPoint(g.hookTrail, g.hookX, g.hookY, dtMs, { maxAge: 180, minDist: 9999, cap: 40 });
    }

    if (g.phase === GRAPPLE_PHASE.BITE) {
        g.sparkT = Math.min(1, g.sparkT + deltaTime / 0.24);
    }
    if (g.phase === GRAPPLE_PHASE.PULL) {
        pushTrailPoint(g.bodyTrail, playerCx, playerCy, dtMs, { maxAge: 220, minDist: 4, cap: 48 });
    }
}

/**
 * 背面パス: 軌跡と鎖。プレイヤーより先に描く。
 * ワールド変換の内側(scrollX 適用済み)で呼ぶ。
 */
export function renderGrappleBehind(ctx, g) {
    if (!isGrappleActive(g)) return;

    // 引き上げ中の身体の残像(上へ吸い上げられる勢い)
    if (g.bodyTrail.length >= 3) {
        drawCometRibbon(ctx, g.bodyTrail, {
            maxAge: 220, headHalf: 13,
            baseColor: '150,176,214', edgeColor: '226,238,255',
            headAlpha: 0.22, coreAlpha: 0.3
        });
    }
    // 鉤が飛んだ経路。鎖より控えめにする(明るくすると鎖のコマが白飛びに埋もれる)
    if (g.hookTrail.length >= 3) {
        drawCometRibbon(ctx, g.hookTrail, {
            maxAge: 180, headHalf: 5,
            baseColor: '214,226,246', edgeColor: '244,250,255',
            headAlpha: 0.2, coreAlpha: 0.3
        });
    }

    // 鎖(たるみ→張り)
    const tension = grappleTension(g);
    const throwing = g.phase === GRAPPLE_PHASE.FLY || g.phase === GRAPPLE_PHASE.WINDUP;
    const dx = g.hookX - g.handX, dy = g.hookY - g.handY;
    const len = Math.hypot(dx, dy) || 1;
    const curve = chainCurve(
        g.handX, g.handY, g.hookX, g.hookY, tension,
        dx / len, dy / len, throwing
    );
    drawChain(ctx, g.handX, g.handY, g.hookX, g.hookY, curve, {
        dashPhase: g.dashPhase, width: 2.4
    });
}

/**
 * 前面パス: 鉤頭と噛んだ瞬間の火花。プレイヤーの後に描く。
 */
export function renderGrappleFront(ctx, g) {
    if (!isGrappleActive(g)) return;

    // 鉤(三つ爪)
    ctx.save();
    ctx.translate(g.hookX, g.hookY);
    ctx.rotate(g.hookAngle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 軸
    ctx.strokeStyle = 'rgba(196, 204, 216, 0.96)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();
    // 三本の爪。噛んでいる間は食い込んで開き角が狭まる
    const bitten = g.phase === GRAPPLE_PHASE.BITE || g.phase === GRAPPLE_PHASE.PULL;
    const spread = bitten ? 0.42 : 0.62;
    for (const s of [-1, 0, 1]) {
        ctx.strokeStyle = s === 0 ? 'rgba(226, 234, 244, 0.98)' : 'rgba(178, 188, 202, 0.94)';
        ctx.lineWidth = s === 0 ? 2.2 : 1.9;
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.quadraticCurveTo(
            8, s * spread * 5,
            11.5, s * spread * 11
        );
        ctx.stroke();
    }
    ctx.restore();

    // 噛んだ瞬間: 火花 + 控えめな閃光
    if (g.sparks && g.sparkT < 1) {
        drawBlastFlash(ctx, g.anchorX, g.anchorY, 16, g.sparkT * 0.24, {
            duration: 0.16, color: '255,226,160', coreColor: '255,246,214',
            intensity: 0.5, ringFrom: 0.5, ringTo: 1.5
        });
        drawSparks(ctx, g.anchorX, g.anchorY, g.sparks, g.sparkT, 26, {
            color: '255,214,146'
        });
    }
}

/** 鉤縄の描画で使う二次ベジェのサンプル(手元→鉤の中間位置がほしい時) */
export function grappleChainPoint(g, t) {
    const dx = g.hookX - g.handX, dy = g.hookY - g.handY;
    const len = Math.hypot(dx, dy) || 1;
    const curve = chainCurve(
        g.handX, g.handY, g.hookX, g.hookY, grappleTension(g),
        dx / len, dy / len, g.phase === GRAPPLE_PHASE.FLY
    );
    return sampleQuad(g.handX, g.handY, curve, g.hookX, g.hookY, t);
}
