// ============================================
// Unification of the Nation - 雑魚/中ボスの攻撃エフェクト(描画専用)
// ============================================
// 判定(getHitbox 系)には一切関与しない。
//
// 方針: プレイヤー・フロアボスの剣筋より【短く・細く・淡く】する。
//   画面には雑魚が4〜5体同時に並ぶので、本人と同じ濃さで出すと
//   誰の斬撃か読めなくなる。「攻撃したことが分かる」最小限に留める。
//
// 座標系の使い分け:
//   ・履歴を持つ剣筋 → world 座標で貯める。素体の局所系は実体に貼り付いて
//     いるので、局所座標のまま貯めると歩いた時に過去の点まで一緒に動く。
//   ・単発の閃光/突き線 → その場で描くだけなので局所系でよい(k 倍も自動)。

import { drawCometRibbon } from './weaponFx.js?v=screen-safe-20260815k';

function state(ent) {
    if (!ent) return null;
    return ent._mobFx || (ent._mobFx = { last: null, dt: 16.7, trails: {}, once: {} });
}

/** 経年を1フレーム進める。renderBossActor が実体ごとに毎フレーム1回だけ呼ぶ。
    dt は motionTime(update でしか増えない)の差分から取るので、
    ポーズ中や描画を複数回走らせた検証時に剣筋が余計に老化しない。 */
export function stepMobFx(ent) {
    const st = state(ent); if (!st) return 16.7;
    const mt = ent.motionTime || 0;
    let dt = (st.last == null) ? 16.7 : mt - st.last;
    if (!(dt > 0) || dt > 120) dt = 16.7;      // 初回 / ポーズ明け / 巻き戻しの保険
    st.last = mt;
    st.dt = dt;
    for (const key in st.trails) {
        const b = st.trails[key];
        for (const p of b.pts) p.age += dt;
        while (b.pts.length && b.pts[0].age > b.maxAge) b.pts.shift();
    }
    if (!ent.isAttacking) st.once = {};        // 攻撃ごとの単発トリガを戻す
    return dt;
}

/** 1回の攻撃につき1度だけ true。土煙のような「その瞬間だけ」の演出用 */
export function onceThisAttack(ent, key, cond) {
    if (!cond) return false;
    const st = state(ent); if (!st) return false;
    if (st.once[key]) return false;
    st.once[key] = true;
    return true;
}

/** 剣筋の点を足す(world 座標) */
export function feedTrail(ent, key, x, y, opts) {
    const o = opts || {};
    const st = state(ent); if (!st) return;
    const b = st.trails[key] || (st.trails[key] = { pts: [], maxAge: 130 });
    if (o.maxAge != null) b.maxAge = o.maxAge;
    const last = b.pts[b.pts.length - 1];
    const minDist = (o.minDist != null) ? o.minDist : 2.0;
    if (last && Math.hypot(x - last.x, y - last.y) < minDist) return;
    b.pts.push({ x, y, age: 0 });
    const cap = (o.cap != null) ? o.cap : 28;
    while (b.pts.length > cap) b.pts.shift();
}

/** 貯めた剣筋を描く。【world 座標系に戻してから】呼ぶこと */
export function drawTrail(ctx, ent, key, opts) {
    const st = ent && ent._mobFx; if (!st) return;
    const b = st.trails[key]; if (!b || b.pts.length < 3) return;
    drawCometRibbon(ctx, b.pts, Object.assign({ maxAge: b.maxAge }, opts || {}));
}

/** 突き線。切先から【後方へ】伸びる先細りの尾で速度を見せる。
    突きは切先が直線上を往復するだけで彗星リボンが潰れるため、履歴ではなく
    その場の伸び量から一本の尾を作る。 */
export function drawThrustStreak(ctx, tipX, tipY, ang, len, half, alpha, color) {
    if (!(alpha > 0.01) || !(len > 2)) return;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const bx = tipX - cs * len, by = tipY - sn * len;
    const mx = tipX - cs * len * 0.42, my = tipY - sn * len * 0.42;
    const nx = -sn * half, ny = cs * half;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(bx, by, tipX, tipY);
    g.addColorStop(0, `rgba(${color},0)`);
    g.addColorStop(0.65, `rgba(${color},${alpha * 0.55})`);
    g.addColorStop(1, `rgba(${color},${alpha})`);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(mx + nx, my + ny, tipX, tipY);
    ctx.quadraticCurveTo(mx - nx, my - ny, bx, by);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
}

/** 単発の閃光(突き切りの穂先・投擲の離れ) */
export function drawFlash(ctx, x, y, r, alpha, color) {
    if (!(alpha > 0.01) || !(r > 0.5)) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(0.45, `rgba(${color},${alpha * 0.34})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

/** 放射状の short line。手裏剣の離れ・穂先の当たりに数本だけ添える。
    seed は実体ごとに固定(Math.random を使うと毎フレーム暴れる) */
export function drawBurstLines(ctx, x, y, ang, count, len, alpha, color, spread) {
    if (!(alpha > 0.01)) return;
    const sp = (spread != null) ? spread : 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${color},${alpha})`;
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
        const a = ang + (i / Math.max(1, count - 1) - 0.5) * sp * 2;
        const L = len * (0.62 + 0.38 * Math.cos((i - (count - 1) * 0.5) * 0.9));
        ctx.lineWidth = 1.4 - i * 0.12;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * L * 0.28, y + Math.sin(a) * L * 0.28);
        ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
        ctx.stroke();
    }
    ctx.restore();
}

/** 足元の土煙。game 側の共通 dust を借りる(独自パーティクルは作らない) */
export function mobGroundDust(ent, cx, cy, opts) {
    const g = (typeof window !== 'undefined') ? window.game : null;
    if (!g || typeof g.spawnGroundDust !== 'function') return;
    g.spawnGroundDust(cx, cy, opts || {});
}
