// Unification of the Nation - 布チェーンの物理(鉢巻の垂れ帯)
//
// 【式と数値の出どころを1つにする】。
// 元は player.js(プレイヤーの手前の帯)と mobFx.js(プレイヤーの奥の帯・雑魚の帯)に
// 同じ式が数値ごと写経されていた —— 0.8^i の風減衰、(|vx|*5+2) の風、2.15 の重力、
// subDelta*9.2 / *14.5 の積分係数まで完全に同一。片方だけ触ると
// 「プレイヤーの手前の帯」と「奥の帯＋雑魚全員」が静かに食い違う(2026-08-17)。
//
// ここには【1ノード進める式】と【振り戻しバネ】だけを置く。
// ノードの持ち方(配列 / チェーン辞書)と根元の決め方は呼び出し側の担当。
//
// このモジュールは他を import しない(player / mobFx / bossRenderer の全部から
// 読むので、依存を持つと循環する)。

/** 布の手触りを決める数値。ここだけ触れば全部の帯が同じだけ変わる。 */
export const CLOTH_CHAIN = {
    SUB_STEPS: 2,             // 1フレームの分割数
    DT_MAX: 0.033,            // ラグで物理が爆発しないための上限(秒)

    // 揺らぎ(たなびき)
    FLUTTER_BASE: 0.18,       // 静止時の最小の揺らぎ
    FLUTTER_MOVE: 4.0,        // 移動で足す量
    FLUTTER_SWING_MAX: 0.55,  // 振り戻しから足す量の上限
    FLUTTER_SWING_K: 0.18,
    WAVE_SPEED_STILL: 0.003,  // 波の速さ(静止 → 移動)
    WAVE_SPEED_MOVE: 0.03,
    WAVE_SPEED_TIP: 0.0012,   // 先端ほど速く
    WAVE_V_RATIO: 0.86,       // 縦波は横波より遅い
    TIP_FLUTTER_GAIN: 0.3,    // 先端の揺らぎ増し
    TIP_FLUTTER_V_GAIN: 0.18,

    // 風(移動で後ろへ流れる)
    WIND_MIN_SPEED: 0.1,      // これ未満の移動では風を立てない
    WIND_SPEED_K: 5,
    WIND_BASE: 2,
    WIND_DECAY: 0.8,          // 節ごとの減衰(0.8^i)

    // 重力
    GRAVITY_BASE: 2.15,
    GRAVITY_SETTLE: 0.7,      // 静止しているほど強く垂れる

    // 振り戻し(減速時に前へ振れてバネで戻る)
    SWING_IMPULSE: 0.86,
    SWING_SPRING: 0.09,
    SWING_DAMP_MOVE: 0.95,
    SWING_DAMP_STILL: 0.89,
    SWING_STILL_SPEED: 0.1,
    SWING_STILL_PREV: 0.26,
    SWING_DECEL_MIN: 0.22,
    SWING_VEL_MAX: 4.8,
    SWING_OFF_MAX: 5.2,
    PENDULUM_OFF: 0.72,
    PENDULUM_VEL: 0.48,
    PENDULUM_TIP: 0.55,
    PENDULUM_TIP_BASE: 0.34,
    PENDULUM_SETTLE: 0.68,
    PENDULUM_SETTLE_BASE: 0.52,

    // 積分と追従
    INTEGRATE_X: 9.2,
    INTEGRATE_Y: 14.5,
    SETTLE_LERP_BASE: 0.015,
    SETTLE_LERP_MOVE: 0.03,
    SETTLE_LERP_TIP: 0.16,

    // 距離拘束
    TENSION_BASE: 0.62,
    TENSION_MOVE: 0.03,
    TENSION_TIP: 0.14,
    TENSION_MIN: 0.4,
    MAX_DIST_GAIN: 1.35,
    MAX_DIST_TIP: 0.06
};

/**
 * 振り戻しバネを1フレーム進める。
 * state は { prevSpeed, swingVel, swingOff } を持つ入れ物(配列でもオブジェクトでも可)。
 * @returns {{vel:number, off:number}} 進めた後の値(呼び出し側が使う)
 */
export function stepClothSwing(state, speedX, dir, dt) {
    const C = CLOTH_CHAIN;
    const prevSpeed = Number.isFinite(state.prevSpeed) ? state.prevSpeed : speedX;
    const prevSpeedAbs = Math.abs(prevSpeed);
    const currentSpeedAbs = Math.abs(speedX);
    const decelAmount = prevSpeedAbs > C.SWING_DECEL_MIN
        ? Math.max(0, prevSpeedAbs - currentSpeedAbs) : 0;
    const decelDir = prevSpeedAbs > 0.05
        ? Math.sign(prevSpeed)
        : (currentSpeedAbs > 0.05 ? Math.sign(speedX) : dir);

    let vel = Number.isFinite(state.swingVel) ? state.swingVel : 0;
    let off = Number.isFinite(state.swingOff) ? state.swingOff : 0;
    vel += decelDir * decelAmount * C.SWING_IMPULSE;
    vel += (-off * C.SWING_SPRING) * dt * 60;
    const nearStill = currentSpeedAbs < C.SWING_STILL_SPEED && prevSpeedAbs < C.SWING_STILL_PREV;
    vel *= Math.pow(nearStill ? C.SWING_DAMP_STILL : C.SWING_DAMP_MOVE, dt * 60);
    vel = Math.max(-C.SWING_VEL_MAX, Math.min(C.SWING_VEL_MAX, vel));
    off = Math.max(-C.SWING_OFF_MAX, Math.min(C.SWING_OFF_MAX, off + vel * dt * 60));

    state.prevSpeed = speedX;
    state.swingVel = vel;
    state.swingOff = off;
    return { vel, off };
}

/**
 * 節を1つ、1サブステップぶん進める(風・揺らぎ・重力・振り子・追従・距離拘束)。
 * @param {{x:number,y:number}} node 動かす節
 * @param {{x:number,y:number}} prev 1つ根元寄りの節
 * @param {object} p i / tipBlend / moveBlend / time / speedX / subDelta /
 *                   swingVel / swingOff / seg / gravityMul / windMul
 */
export function stepClothNode(node, prev, p) {
    const C = CLOTH_CHAIN;
    const tipBlend = p.tipBlend;
    const settleBlend = 1 - p.moveBlend;
    const gravityMul = Number.isFinite(p.gravityMul) ? p.gravityMul : 1;
    const windMul = Number.isFinite(p.windMul) ? p.windMul : 1;

    const effSpeed = C.WAVE_SPEED_STILL
        + p.moveBlend * (C.WAVE_SPEED_MOVE - C.WAVE_SPEED_STILL)
        + tipBlend * C.WAVE_SPEED_TIP;
    const flutter = C.FLUTTER_BASE + p.moveBlend * C.FLUTTER_MOVE
        + Math.min(C.FLUTTER_SWING_MAX, Math.abs(p.swingVel) * C.FLUTTER_SWING_K);
    const flutterH = Math.sin(p.time * effSpeed + p.i * 1.2) * flutter * (1 + tipBlend * C.TIP_FLUTTER_GAIN);
    const flutterV = Math.cos(p.time * (effSpeed * C.WAVE_V_RATIO) + p.i * 1.0)
        * (flutter * (0.92 + tipBlend * C.TIP_FLUTTER_V_GAIN));
    const windDecay = Math.pow(C.WIND_DECAY, p.i);
    const wind = (Math.abs(p.speedX) > C.WIND_MIN_SPEED
        ? (p.speedX > 0 ? -1 : 1) * (Math.abs(p.speedX) * C.WIND_SPEED_K + C.WIND_BASE) * windDecay
        : 0) * windMul;
    const gravityPull = (C.GRAVITY_BASE + settleBlend * C.GRAVITY_SETTLE) * gravityMul;
    const pendulum = (p.swingOff * C.PENDULUM_OFF + p.swingVel * C.PENDULUM_VEL)
        * (C.PENDULUM_TIP_BASE + tipBlend * C.PENDULUM_TIP)
        * (C.PENDULUM_SETTLE_BASE + settleBlend * C.PENDULUM_SETTLE);

    // Y-DOWN なので重力はプラス方向へ
    node.x += (wind + flutterH + pendulum) * p.subDelta * C.INTEGRATE_X;
    node.y += (gravityPull + flutterV) * p.subDelta * C.INTEGRATE_Y;
    const settleLerp = (C.SETTLE_LERP_BASE + settleBlend * C.SETTLE_LERP_MOVE)
        * (1 - tipBlend * C.SETTLE_LERP_TIP) * p.subDelta * 60;
    node.x += (prev.x - node.x) * settleLerp;

    // 安全策: 座標が異常値(Infinity/NaN)になったら根元へ寄せて畳む
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        node.x = prev.x;
        node.y = prev.y;
    }

    // 距離拘束(伸び切らせない)
    const dx = node.x - prev.x;
    const dy = node.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
        const tension = Math.max(C.TENSION_MIN,
            (C.TENSION_BASE - p.moveBlend * C.TENSION_MOVE) * (1 - tipBlend * C.TENSION_TIP));
        let corr = (dist - p.seg) * tension;
        const maxDist = p.seg * (C.MAX_DIST_GAIN + tipBlend * C.MAX_DIST_TIP);
        if (dist - corr > maxDist) corr = dist - maxDist;
        const angle = Math.atan2(dy, dx);
        node.x -= Math.cos(angle) * corr;
        node.y -= Math.sin(angle) * corr;
    }
}

/**
 * 【鉢巻の垂れ帯の仕様】。プレイヤーも雑魚もここを読む。
 * near = 手前(明るい) / far = 奥(暗い)。
 * 奥は「重くて風を受けにくい」——同じ力で振ると形が揃って1本に見えるため、
 * 角度そのものを割って分ける。
 */
export const HEADBAND_TAIL_SPEC = {
    halfWidth: 2.0,      // 帯の半幅(world)。2本とも同幅・根元から先端まで一定
    rootGap: 5.2,        // 手前と奥の根元の段差(縦)
    farShade: -0.28,     // 奥を暗くする【割合】。定数減算だと色によって食い違う
    near: { count: 9, seg: 5.0, gravityMul: 1, windMul: 1, phaseMs: 0 },
    far: { count: 8, seg: 4.6, gravityMul: 1.62, windMul: 0.70, phaseMs: 520 }
};

/**
 * 【丸ごと k 倍した仕様】。雑魚はプレイヤーの半分(k=0.5)。
 * 節長・根元の段差・幅を【まとめて】掛ける —— 長さだけ半分にして段差を
 * そのままにすると、下へずれた奥の帯の先端が手前より下に出て
 * 「奥のほうが長い」絵になる(実測 43.3 対 46.0。ユーザー指摘 2026-08-16)。
 * 節数は格ではなく形の細かさなので変えない。
 */
export function scaleHeadbandTailSpec(k, opts = {}) {
    const s = HEADBAND_TAIL_SPEC;
    const widthScale = Number.isFinite(opts.widthScale) ? opts.widthScale : 1;
    return {
        halfWidth: s.halfWidth * widthScale,
        rootGap: s.rootGap * k,
        farShade: s.farShade,
        near: { ...s.near, seg: s.near.seg * k },
        far: { ...s.far, seg: s.far.seg * k }
    };
}

/* ============================================================
   分身の布の方針
   ============================================================
   【分身の布は本体の形をコピーする】。鉢巻の帯も、ポニーテールも。
   分身に独自の物理を回すと、本体と重なり方が食い違って見える
   (実測: 自律分身は renderVx 9.3 / 4.4 と本体 5.2 から離れており、
    風の受け方が変わる)。布は装飾なので本体に合わせる —— 剣筋と同じ方針。
   向きが逆の分身だけ、根元を軸に左右反転してコピーする。

   ここに関数として置いてある理由: コメントだけだと
   「分身に固有チェーンがあるのに使っていない、バグでは?」と繋ぎ直され、
   直したはずの食い違いが再発する。方針をテストできる形にしておく
   (scratch/cloth_consistency_check.mjs)。 */

/**
 * この描画が「分身が本体をコピーする」ケースかを判定する。
 * @param {object} owner プレイヤー本体
 * @param {object} options 描画オプション(isClone / cloneIndex)
 * @returns {{isCloneCopy:boolean, copyFlip:number}}
 */
export function resolveClothClone(owner, options = {}) {
    const mainOk = !!owner && Array.isArray(owner.scarfNodes) && owner.scarfNodes.length > 1;
    const isCloneCopy = !!options.isClone && mainOk;
    let copyFlip = 1;
    if (isCloneCopy && Number.isFinite(options.cloneIndex)
        && Array.isArray(owner.specialClonePositions)) {
        const pos = owner.specialClonePositions[options.cloneIndex];
        if (pos && typeof pos.facingRight === 'boolean' && pos.facingRight !== owner.facingRight) {
            copyFlip = -1;
        }
    }
    return { isCloneCopy, copyFlip };
}

/**
 * 節の並びを【先頭を根元として】別の根元へ写す。
 * 分身へのコピーにも、物理ノードを描画位置へ移すのにも使う。
 * @param {{x:number,y:number}[]} src
 * @param {number} rootX 写し先の根元
 * @param {number} rootY
 * @param {object} [opts] flip(-1で左右反転) / shorten(縮尺) / offsetY(縦のずらし)
 */
export function copyClothNodesToRoot(src, rootX, rootY, opts = {}) {
    if (!Array.isArray(src) || src.length === 0) return [];
    const flip = opts.flip === -1 ? -1 : 1;
    const shorten = Number.isFinite(opts.shorten) ? opts.shorten : 1;
    const offsetY = Number.isFinite(opts.offsetY) ? opts.offsetY : 0;
    const r = src[0];
    if (!r || !Number.isFinite(r.x)) return [];
    return src.map((n) => ({
        x: rootX + (n.x - r.x) * shorten * flip,
        y: rootY + offsetY + (n.y - r.y) * shorten
    }));
}
