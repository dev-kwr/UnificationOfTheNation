// Unification of the Nation - 布リボンの塗り(鉢巻の垂れ帯・覆面の帯など)
//
// 【一本の実装で全部の帯を塗る】。
// 元は「プレイヤーの1本目」「プレイヤーの2本目」「雑魚の2本」で
// 同じ式(平滑化2回 → 法線オフセット → 帯の塗り → 結び目の穴埋め)が
// 3箇所に写経されていた。片方だけ直して食い違う事故が実際に起きている:
//   ・2本目にだけ先端の絞りが入り、同じ布なのに奥だけ細く尖った
//   ・幅の既定値が食い違い、雑魚の帯だけ細かった
// ノードを作る物理は呼び出し側の担当(プレイヤーは player.js の
// updateAccessoryNodes、雑魚とプレイヤーの2本目は mobFx.updateRibbonChain)。
// ここは【形が決まったあとの塗りだけ】を持つ。
//
// このモジュールは他のモジュールを import しない。
// playerRenderer / bossRenderer の双方から読むので、
// 依存を持つと循環(katanaShape.js と同じ罠)になる。

const TAU = Math.PI * 2;

/**
 * 描画専用の平滑化。物理ノードは書き換えず、輪郭のギザつきだけ抑える。
 * 端点(根元と先端)は動かさない。
 */
export function smoothRibbonPoints(pts, passes = 2) {
    const out = pts.map((p) => ({ x: p.x, y: p.y }));
    if (out.length <= 2) return out;
    for (let pass = 0; pass < passes; pass++) {
        const src = out.map((p) => ({ x: p.x, y: p.y }));
        for (let i = 1; i < out.length - 1; i++) {
            // 根元寄り(i<=2)だけ僅かに元の形を残す。付け根の折れを潰しすぎない。
            const cw = (i <= 2) ? 0.56 : 0.60;
            const sw = (1 - cw) * 0.5;
            out[i].x = src[i - 1].x * sw + src[i].x * cw + src[i + 1].x * sw;
            out[i].y = src[i - 1].y * sw + src[i].y * cw + src[i + 1].y * sw;
        }
    }
    return out;
}

/**
 * 中心線 → 帯の左右の縁。
 * 法線は前後の点から取り、隣と 0.38:0.62 で混ぜて捻れを抑える。
 * @param {{x:number,y:number}[]} pts 平滑化済みの中心線
 * @param {number} halfWidth 半幅
 * @param {object} [opts] taper: 先端へ向けて絞る割合(0=絞らない)
 *                        tiltX: (i, count) => 中心線の横ずらし量(たなびきの揺れ)
 */
export function buildRibbonEdges(pts, halfWidth, opts = {}) {
    const taper = Number.isFinite(opts.taper) ? opts.taper : 0;
    const tiltX = typeof opts.tiltX === 'function' ? opts.tiltX : null;
    const L = [];
    const R = [];
    let pnx = 0;
    let pny = 1;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len;
        let ny = dx / len;
        if (i > 0 && nx * pnx + ny * pny < 0) { nx = -nx; ny = -ny; }
        if (i > 0) {
            nx = nx * 0.38 + pnx * 0.62;
            ny = ny * 0.38 + pny * 0.62;
            const nl = Math.hypot(nx, ny) || 1;
            nx /= nl;
            ny /= nl;
        }
        pnx = nx;
        pny = ny;
        const half = halfWidth * (1 - (i / Math.max(1, pts.length - 1)) * taper);
        const cx = pts[i].x + (tiltX ? tiltX(i, pts.length) : 0);
        const cy = pts[i].y;
        L.push({ x: cx - nx * half, y: cy - ny * half });
        R.push({ x: cx + nx * half, y: cy + ny * half });
    }
    return { L, R };
}

/**
 * 中心線を1枚の帯として塗る(平滑化 → 縁 → 塗り → 結び目の穴埋め)。
 * @param {object} [opts] taper / tiltX(buildRibbonEdges と同じ)
 *                        rootPatch: {x,y} 結び目に重ねる丸(既定は中心線の先頭)
 *                        rootPatchScale: 丸の半径 = halfWidth * これ(既定 0.95)
 *                        minPoints: これ未満の点数なら描かない(既定 2)
 */
export function drawClothRibbon(ctx, pts, halfWidth, color, opts = {}) {
    const minPoints = Number.isFinite(opts.minPoints) ? opts.minPoints : 2;
    if (!pts || pts.length < minPoints) return;
    const line = smoothRibbonPoints(pts);
    const { L, R } = buildRibbonEdges(line, halfWidth, opts);
    if (!L.length) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
    ctx.fill();
    // 結び目の切れ目埋め。帯の付け根が頭と接する所に小さな丸を重ねる。
    if (opts.rootPatch !== false) {
        const patch = (opts.rootPatch && Number.isFinite(opts.rootPatch.x))
            ? opts.rootPatch : line[0];
        const scale = Number.isFinite(opts.rootPatchScale) ? opts.rootPatchScale : 0.95;
        ctx.beginPath();
        ctx.arc(patch.x, patch.y, halfWidth * scale, 0, TAU);
        ctx.fill();
    }
}

/** 色を割合で暗く/明るくする(定数減算だと元の色によって暗くなり方が食い違う)。 */
export function shadeRibbonColor(col, k) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(col).trim());
    if (!m) return col;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const f = 1 + k;
    const ch = (i) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * f)));
    return `rgb(${ch(0)},${ch(2)},${ch(4)})`;
}
