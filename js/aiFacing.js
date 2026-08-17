// Unification of the Nation - AIの向きヒステリシス
//
// 【左右の高速な向き変更を禁止する】。的や隊列の位置が自分の真横を跨ぐたびに
// facingRight を素直に書き換えると、1フレームおきに体が反転して「チカチカ」する。
// 反転は
//   ・前の反転から一定時間が経っている
//   ・かつ相手が十分に反対側にいる(真横の不感帯を抜けている)
// の両方を満たしたときだけ許す。
//
// 状態(前回の反転からの経過)は呼び出し側のオブジェクトに持たせる。分身は
// specialClonePositions の各要素、敵は Enemy 実体そのものを渡す。

export const AI_FACING_FLIP_COOLDOWN_MS = 240; // 反転の最小間隔
export const AI_FACING_DEADZONE_PX = 30;       // 真横のこの範囲では向きを変えない

/**
 * @param {object} state facingRight と _facingFlipTimer を持たせる入れ物
 * @param {boolean} desiredRight 本来向きたい方向
 * @param {number} deltaMs 経過ms
 * @param {number} gapPx 相手との左右方向の距離(不感帯の判定用)
 * @param {object} [options] cooldownMs / deadzonePx / force
 * @returns {boolean} 実際に採用する facingRight
 */
export function resolveAiFacing(state, desiredRight, deltaMs = 0, gapPx = Infinity, options = {}) {
    const want = !!desiredRight;
    if (!state) return want;

    state._facingFlipTimer = Math.max(0, (state._facingFlipTimer || 0) - (deltaMs || 0));

    const current = (state.facingRight === undefined) ? want : !!state.facingRight;
    if (current === want) return current;

    // 【硬直中や踏み切りの瞬間など、向き直りを遅らせたくない場面】は素通しする
    if (options.force === true) {
        state._facingFlipTimer = Number.isFinite(options.cooldownMs) ? options.cooldownMs : AI_FACING_FLIP_COOLDOWN_MS;
        return want;
    }

    const deadzone = Number.isFinite(options.deadzonePx) ? options.deadzonePx : AI_FACING_DEADZONE_PX;
    if (Math.abs(gapPx) < deadzone) return current;   // 真横で跨いだだけ
    if (state._facingFlipTimer > 0) return current;   // 直前に反転したばかり

    state._facingFlipTimer = Number.isFinite(options.cooldownMs) ? options.cooldownMs : AI_FACING_FLIP_COOLDOWN_MS;
    return want;
}
