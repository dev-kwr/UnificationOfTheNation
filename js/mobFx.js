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

import { CLOTH_CHAIN, HEADBAND_TAIL_SPEC, stepClothSwing, stepClothNode } from './clothChain.js?v=screen-safe-20260821a';

import { drawCometRibbon } from './weaponFx.js?v=screen-safe-20260821a';

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
    /* 差分 0 は【時間が進んでいない】という正しい状態(ポーズ中・同一フレームの
       2回目描画)。16.7 に読み替えると布や剣筋がポーズ中も動き続ける
       (ユーザー指摘 2026-08-16)。保険を掛けるのは負値と異常に大きい値だけ。 */
    if (dt < 0 || dt > 120) dt = 16.7;
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

/** 突き波。穂先の【前方】へ開く三日月を広げながら薄める。
    突きは切先の移動量が小さく(局所22px)、尾も柄に重なって消えるので、
    「速さ」は得物に重ならない前方の波でしか読ませられない。 */
export function drawThrustWave(ctx, x, y, ang, radius, half, thick, alpha, color) {
    if (!(alpha > 0.01) || !(radius > 1)) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // 中央が最も濃く、両端へ抜ける三日月(3本の弧を太さと濃さを変えて重ねる)
    for (let i = 0; i < 3; i++) {
        const f = 1 - i * 0.34;
        ctx.strokeStyle = `rgba(${color},${alpha * f * 0.6})`;
        ctx.lineWidth = thick * (1 - i * 0.28);
        ctx.beginPath();
        ctx.arc(x, y, radius * (1 + i * 0.13), ang - half * f, ang + half * f);
        ctx.stroke();
    }
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

/* ============================================================
   布(鉢巻の垂れ帯)の物理チェーン
   ------------------------------------------------------------
   プレイヤー忍者の帯は player.js の updateAccessoryNodes による
   9ノードの物理チェーン(重力・移動の風・撓み・振り戻しのバネ・距離拘束)。
   雑魚の忍だけ「サインで揺らした固定カーブ」だったので、並ぶと
   物理を無視した動きに見えていた(ユーザー指摘 2026-08-15)。
   同じ式をそのまま移植する。数値は player.js の実装値。

   ノードは【world 座標】で持つ。素体の局所系は実体に貼り付いているので、
   局所座標のまま積分すると歩いた瞬間に帯ごと平行移動して慣性が消える。
   ============================================================ */
/**
 * 実体を演出でワープ・牽引させたとき、布のチェーンを【形を保ったまま】運ぶ。
 *
 * updateRibbonChain には「根元が seg*9 以上跳んだら連れて行く」保険があるが、
 * 鉤縄の引き上げのように【少しずつ】動く演出では毎フレームの跳びが小さく、
 * 保険が効かない。しかも演出中は player.update が止まって motionTime が
 * 進まないため dt=0 で積分もされず、根元だけが上がって帯が伸び切る
 * (実機フィードバック 2026-08-17: stage6の3階層目→大屋根)。
 * 本体の座標を直接動かす演出は、必ずここも同じ差分で呼ぶ。
 */
export function translateRibbonChains(ent, dx, dy) {
    if (!ent || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
    const chains = ent._mobFx?.chains;
    if (!chains) return;
    for (const key of Object.keys(chains)) {
        const nodes = chains[key]?.nodes;
        if (!Array.isArray(nodes)) continue;
        for (const n of nodes) {
            if (!Number.isFinite(n?.x) || !Number.isFinite(n?.y)) continue;
            n.x += dx;
            n.y += dy;
        }
    }
}

/** 転移などで形ごと作り直す。次の更新で根元から初期化される。 */
export function resetRibbonChains(ent) {
    const st = ent?._mobFx;
    if (st) st.chains = {};
}

export function updateRibbonChain(ent, key, rootX, rootY, opts) {
    const o = opts || {};
    const st = state(ent);
    if (!st) return null;
    const chains = st.chains || (st.chains = {});
    /* readOnly: 既存のチェーンを【一切書き換えずに】読むだけ。
       同じチェーンを複数の描画(本体と分身)から更新すると、呼ぶたびに
       根元(nodes[0])が上書きされ、フレーム内で最後に呼んだ側の位置が残る。
       分身は向きや位置が本体と違うので、本体の帯が分身の動きに引きずられて
       勝手に揺れる(ユーザー指摘 2026-08-16)。更新するのは持ち主だけにする。 */
    if (o.readOnly) {
        const exist = chains[key];
        return (exist && exist.nodes.length) ? exist.nodes : null;
    }
    // 既定は鉢巻の【手前の帯】の仕様(clothChain.js が単一の出どころ)
    const count = Math.max(3, o.count || HEADBAND_TAIL_SPEC.near.count);
    const seg = o.seg || HEADBAND_TAIL_SPEC.near.seg;
    const dir = o.dir || 1;
    const speedX = Number.isFinite(o.speedX) ? o.speedX : (ent.vx || 0);
    const speedNorm = Math.max(1, o.speedNorm || ent.speed || 1);
    const time = Number.isFinite(o.time) ? o.time : (ent.motionTime || 0);

    let ch = chains[key];
    if (!ch || ch.nodes.length !== count) {
        ch = chains[key] = { nodes: [], swingVel: 0, swingOff: 0, prevSpeed: speedX };
        for (let i = 0; i < count; i++) {
            ch.nodes.push({ x: rootX - dir * i * seg * 0.7, y: rootY + i * seg * 0.5 });
        }
    }
    const nodes = ch.nodes;

    // 実体が瞬間移動したとき(リサイクル/ステージ遷移)は形を保ったまま連れて行く
    const jump = Math.hypot(rootX - nodes[0].x, rootY - nodes[0].y);
    if (jump > seg * 9) {
        const dx = rootX - nodes[0].x, dy = rootY - nodes[0].y;
        for (const n of nodes) { n.x += dx; n.y += dy; }
    }

    /* dt はふつう stepMobFx が入れる motionTime 差分。
       プレイヤー(鉢巻の2本目)のように stepMobFx を通らない実体は
       opts.dtMs で明示的に渡す。 */
    /* 同じ結び目から2本垂らすと、力が同じぶん形も揃って【1本にしか見えない】。
       重さ(gravityMul)と受ける風(windMul)を変えて角度を割る。
       実際の鉢巻も2本の帯の長さ・幅が違い、垂れ方が揃わない。 */
    const gravityMul = Number.isFinite(o.gravityMul) ? o.gravityMul : 1;
    const windMul = Number.isFinite(o.windMul) ? o.windMul : 1;
    /* `st.dt || 16.7` は【dt=0 が falsy で 16.7 に化ける】。
       ポーズ中は差分0が正しい値なので、0 を潰さない書き方にする。 */
    const dtMs = Number.isFinite(o.dtMs) ? o.dtMs
        : (Number.isFinite(st.dt) ? st.dt : 16.7);
    const dt = Math.min(dtMs / 1000, 0.033);
    /* 時間が進んでいないフレーム(ポーズ中・同一フレームの2回目描画)は
       根元を合わせるだけで【状態を一切変えずに】返す。
       距離拘束は dt を掛けない補正なので、ここで抜けないとポーズ中も
       鎖が縮み続けて帯だけ動いて見える(ユーザー指摘 2026-08-16)。 */
    if (!(dt > 0)) {
        nodes[0].x = rootX;
        nodes[0].y = rootY;
        return nodes;
    }

    const subSteps = 2;
    const subDelta = dt / subSteps;
    const moveBlend = Math.max(0, Math.min(1, Math.abs(speedX) / speedNorm));

    // 減速時に前方慣性を足し、バネで戻してオーバーシュートを作る
    // (式と数値は clothChain.js。プレイヤーの手前の帯と共有)
    stepClothSwing(ch, speedX, dir, dt);

    nodes[0].x = rootX;
    nodes[0].y = rootY;

    const denom = Math.max(1, count - 1);
    for (let s = 0; s < subSteps; s++) {
        for (let i = 1; i < count; i++) {
            const node = nodes[i];
            const prev = nodes[i - 1];
            // 風・揺らぎ・重力・振り子・追従・距離拘束は clothChain.js の一本道
            stepClothNode(node, prev, {
                i,
                tipBlend: i / denom,
                moveBlend,
                time,
                speedX,
                subDelta,
                swingVel: ch.swingVel,
                swingOff: ch.swingOff,
                seg,
                gravityMul,
                windMul
            });
        }
    }
    return nodes;
}
