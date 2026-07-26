// ============================================
// 忍具共通エフェクトヘルパー
// 鎖鎌(Kusarigama)で確立した質感手法を他忍具へ横展開するための共通関数群。
// すべて描画専用 — 当たり判定(getHitbox系)には一切関与しない。
// ============================================

// 落ち影付きで描く。fn 内で fill/stroke すると背景から浮く立体感が出る。
// 影が後続のハイライト等へ伝播しないよう save/restore で必ずリセットする。
export function withDropShadow(ctx, opts, fn) {
    const o = opts || {};
    ctx.save();
    ctx.shadowColor = o.color || 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = (o.blur != null ? o.blur : 2.6);
    ctx.shadowOffsetX = (o.dx != null ? o.dx : 0.9);
    ctx.shadowOffsetY = (o.dy != null ? o.dy : 1.5);
    fn();
    ctx.restore();
}

export function smoothstep01(x) { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); }

// 消え際を粘らせるフェード(線形より上質に「尾を引いて」消える)。
export function easeFadeOut(t) { return Math.pow(1 - Math.max(0, Math.min(1, t)), 0.85); }

// 履歴トレイル点を記録(各点を経年・最古を破棄・近接は間引き)。
// 鎖鎌 recordTrail と同方式。pts は {x,y,age} の配列。
export function pushTrailPoint(pts, x, y, dtMs, opts) {
    const o = opts || {};
    const maxAge = o.maxAge != null ? o.maxAge : 130;
    const minDist = o.minDist != null ? o.minDist : 1.5;
    const cap = o.cap != null ? o.cap : 64;
    for (const p of pts) p.age += dtMs;
    while (pts.length && pts[0].age > maxAge) pts.shift();
    const last = pts[pts.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < minDist) return;
    pts.push({ x, y, age: 0 });
    if (pts.length > cap) pts.shift();
}

// 彗星リボン: 現在の ctx 座標系で points(古→新, .age) をなぞる。
// 点を直線で繋がず中点経由の二次ベジェで連続曲線化し、頭=太く明るい/尾=点へ先細り。
// 加算合成 lighter のグロー。色は "r,g,b" 文字列。
export function drawCometRibbon(ctx, points, opts) {
    const pts = points;
    if (!pts || pts.length < 3) return;
    const o = opts || {};
    const maxAge = o.maxAge != null ? o.maxAge : 130;
    const headHalf = o.headHalf != null ? o.headHalf : 6;
    const baseColor = o.baseColor || '150,228,255';
    const edgeColor = o.edgeColor || '226,250,255';
    const headAlpha = o.headAlpha != null ? o.headAlpha : 0.42;
    const coreAlpha = o.coreAlpha != null ? o.coreAlpha : 0.72;
    const N = pts.length;

    const newness = pts.map(p => 1 - Math.min(1, p.age / maxAge));
    const nrm = [];
    for (let i = 0; i < N; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
        let tx = b.x - a.x, ty = b.y - a.y;
        const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
        nrm.push({ x: -ty, y: tx });
    }
    const denom = Math.max(1, N - 1);
    const tailTaper = i => Math.sqrt(i / denom);
    const headTaper = i => Math.min(1, (((N - 1) - i) / denom) / 0.22);
    const halfW = i => headHalf * newness[i] * tailTaper(i) * headTaper(i);
    const upper = pts.map((p, i) => ({ x: p.x + nrm[i].x * halfW(i), y: p.y + nrm[i].y * halfW(i) }));
    const lower = pts.map((p, i) => ({ x: p.x - nrm[i].x * halfW(i), y: p.y - nrm[i].y * halfW(i) }));
    const append = (arr) => {
        for (let i = 1; i < arr.length - 1; i++) {
            const mx = (arr[i].x + arr[i + 1].x) * 0.5, my = (arr[i].y + arr[i + 1].y) * 0.5;
            ctx.quadraticCurveTo(arr[i].x, arr[i].y, mx, my);
        }
        ctx.lineTo(arr[arr.length - 1].x, arr[arr.length - 1].y);
    };
    const tail = pts[0], head = pts[N - 1];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const fill = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    fill.addColorStop(0, `rgba(${baseColor},0)`);
    fill.addColorStop(1, `rgba(${baseColor},${headAlpha})`);
    ctx.beginPath();
    ctx.moveTo(upper[0].x, upper[0].y); append(upper);
    ctx.lineTo(lower[N - 1].x, lower[N - 1].y); append(lower.slice().reverse());
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    const core = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    core.addColorStop(0, `rgba(${edgeColor},0)`);
    core.addColorStop(1, `rgba(${edgeColor},${coreAlpha})`);
    ctx.strokeStyle = core; ctx.lineWidth = Math.max(1, headHalf * 0.28);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); append(pts); ctx.stroke();
    ctx.restore();
}

// ============================================
// 鎖(チェーン)の描画
// 鎖鎌(js/weapon.js Kusarigama)で確立した式をそのまま切り出したもの。
// たるみ量・制御点・グラデ3色・lineDash・鎖コマの寸法は鎖鎌と完全一致させてある。
// ※鎖鎌本体は既存実装を使い続ける(出荷済み武器の見た目回帰を避けるため)。
//   ここは鉤縄など「鎖鎌以外」から使うための共通版。
// ============================================

/**
 * 手元→先端の鎖のたるみ(二次ベジェ制御点)を求める。
 * tension 0=だらんとたるむ / 1=ぴんと張る。
 * throwPhase=true(投擲中)はたるみを 0.42 倍に抑えて「投げた勢い」を出す。
 */
export function chainCurve(handX, handY, tipX, tipY, tension, dirX, dirY, throwPhase) {
    const dx = tipX - handX;
    const dy = tipY - handY;
    const chainLen = Math.max(0.001, Math.hypot(dx, dy));
    const nx = -dy / chainLen;
    const ny = dx / chainLen;
    const t = Number.isFinite(tension) ? Math.max(0, Math.min(1, tension)) : 1;
    // 進行方向。渡されなければ手元→先端の向きを使う。
    const cdx = Number.isFinite(dirX) ? dirX : dx / chainLen;
    const cdy = Number.isFinite(dirY) ? dirY : dy / chainLen;
    const slackScale = throwPhase ? 0.42 : 1.0;
    const slackBase = (1 - t) * (10 + Math.min(8, chainLen * 0.05)) * slackScale;
    const midX = (handX + tipX) * 0.5;
    const midY = (handY + tipY) * 0.5;
    return {
        chainLen,
        chainNx: nx,
        chainNy: ny,
        chainTension: t,
        dirX: cdx,
        dirY: cdy,
        ctrlX: midX - cdx * (chainLen * 0.1) + nx * (slackBase * (throwPhase ? 0.18 : 0.48)),
        ctrlY: midY
            - cdy * (chainLen * 0.1)
            + ny * (slackBase * (throwPhase ? 0.08 : 0.24))
            + slackBase * (throwPhase ? 0.24 : 0.62)
    };
}

/** 二次ベジェ上の点(t=0..1)。chainCurve の curve と始点/終点から求める。 */
export function sampleQuad(x0, y0, curve, x1, y1, t) {
    const tt = Math.max(0, Math.min(1, t));
    const inv = 1 - tt;
    return {
        x: inv * inv * x0 + 2 * inv * tt * curve.ctrlX + tt * tt * x1,
        y: inv * inv * y0 + 2 * inv * tt * curve.ctrlY + tt * tt * y1
    };
}

/**
 * 鎖を描く。3色グラデ + 流れる lineDash + 上側ハイライト + 等間隔の鎖コマ楕円。
 * dashPhase は 0..1 で与えると鎖が動いて見える(鎖鎌では st.progress を使用)。
 */
export function drawChain(ctx, handX, handY, tipX, tipY, curve, opts) {
    const o = opts || {};
    const dashPhase = o.dashPhase || 0;
    const width = o.width != null ? o.width : 2.4;
    const grad = ctx.createLinearGradient(handX, handY, tipX, tipY);
    grad.addColorStop(0, o.colorNear || 'rgba(170, 176, 188, 0.95)');
    grad.addColorStop(0.55, o.colorMid || 'rgba(128, 136, 150, 0.98)');
    grad.addColorStop(1, o.colorFar || 'rgba(92, 102, 118, 0.95)');

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineDashOffset = -dashPhase * 150;
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.quadraticCurveTo(curve.ctrlX, curve.ctrlY, tipX, tipY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 上側の細いハイライト(金属の反射)。法線方向へ1.4pxずらした平行線。
    ctx.strokeStyle = o.highlight || 'rgba(230, 245, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(handX + curve.dirY * 1.4, handY - curve.dirX * 1.4);
    ctx.quadraticCurveTo(
        curve.ctrlX + curve.dirY * 1.4,
        curve.ctrlY - curve.dirX * 1.4,
        tipX + curve.dirY * 1.4,
        tipY - curve.dirX * 1.4
    );
    ctx.stroke();

    // 鎖コマを等間隔で描いて、金属鎖らしい実体感を出す
    const links = Math.max(8, Math.min(24, Math.round(curve.chainLen / 13)));
    ctx.fillStyle = o.linkFill || 'rgba(106, 114, 128, 0.95)';
    ctx.strokeStyle = o.linkEdge || 'rgba(220, 230, 244, 0.46)';
    ctx.lineWidth = 0.7;
    for (let i = 1; i < links; i++) {
        const t = i / links;
        const inv = 1 - t;
        const px = inv * inv * handX + 2 * inv * t * curve.ctrlX + t * t * tipX;
        const py = inv * inv * handY + 2 * inv * t * curve.ctrlY + t * t * tipY;
        const tx = 2 * inv * (curve.ctrlX - handX) + 2 * t * (tipX - curve.ctrlX);
        const ty = 2 * inv * (curve.ctrlY - handY) + 2 * t * (tipY - curve.ctrlY);
        const linkR = (1.25 + (1 - curve.chainTension) * 0.35) * (o.linkScale || 1);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(ty, tx));
        ctx.beginPath();
        ctx.ellipse(0, 0, linkR * 1.25, linkR * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
}

// シード式パーティクル配列を一度だけ作る(per-frame Math.random の瞬間移動を排除)。
export function makeParticles(count, opts) {
    const o = opts || {};
    const spread = o.spread != null ? o.spread : Math.PI * 2;
    const baseAngle = o.baseAngle || 0;
    const speedMin = o.speedMin != null ? o.speedMin : 0.5;
    const speedMax = o.speedMax != null ? o.speedMax : 1.2;
    const sizeMin = o.sizeMin != null ? o.sizeMin : 1;
    const sizeMax = o.sizeMax != null ? o.sizeMax : 3;
    const gravity = o.gravity || 0;
    const arr = [];
    for (let i = 0; i < count; i++) {
        arr.push({
            ang: baseAngle + (Math.random() - 0.5) * spread,
            speed: speedMin + Math.random() * (speedMax - speedMin),
            size: sizeMin + Math.random() * (sizeMax - sizeMin),
            gravity: gravity * (0.6 + Math.random() * 0.8),
            decay: 0.7 + Math.random() * 0.5,
        });
    }
    return arr;
}

// 放射状スパーク(progress 0..1, lighter)。尾を引く放物線運動でチラつかない。
export function drawSparks(ctx, cx, cy, particles, progress, dist, opts) {
    if (progress >= 1 || !particles) return;
    const o = opts || {};
    const color = o.color || '255,210,140';
    const tail = o.tail !== false;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of particles) {
        const grav = p.gravity * dist;
        const px = cx + Math.cos(p.ang) * dist * p.speed * progress;
        const py = cy + Math.sin(p.ang) * dist * p.speed * progress + grav * progress * progress;
        const a = (1 - progress) * p.decay;
        const sz = p.size * (1 - progress * 0.6);
        if (tail) {
            const t0 = Math.max(0, progress - 0.1);
            const px0 = cx + Math.cos(p.ang) * dist * p.speed * t0;
            const py0 = cy + Math.sin(p.ang) * dist * p.speed * t0 + grav * t0 * t0;
            ctx.strokeStyle = `rgba(${color},${(a * 0.55).toFixed(3)})`;
            ctx.lineWidth = Math.max(0.6, sz * 0.8);
            ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px, py); ctx.stroke();
        }
        ctx.fillStyle = `rgba(${color},${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, Math.max(0.4, sz), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// 爆発開幕の白フラッシュ＋衝撃波リング(progress が duration 未満のときだけ)。
export function drawBlastFlash(ctx, cx, cy, radius, progress, opts) {
    const o = opts || {};
    const duration = o.duration != null ? o.duration : 0.2;
    if (progress >= duration) return;
    const color = o.color || '255,236,190';
    // intensity: 全体の明るさ倍率(既定1)。白飛びが眩しい時に下げる。
    const intensity = o.intensity != null ? o.intensity : 1;
    // coreColor: 芯の色(既定は純白)。暖色にすると眩しさが和らぐ。
    const coreColor = o.coreColor || '255,255,255';
    const t = progress / duration; // 0..1
    const a = (1 - t) * intensity;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fr = radius * (0.55 + t * 0.7);
    const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
    fg.addColorStop(0, `rgba(${coreColor},${a.toFixed(3)})`);
    fg.addColorStop(0.5, `rgba(${color},${(a * 0.7).toFixed(3)})`);
    fg.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(cx, cy, fr, 0, Math.PI * 2); ctx.fill();
    // 速く広がる衝撃波リング(ringFrom→ringTo を radius 倍で。判定半径に合わせて狭めると見た目=判定に近づく)
    const ringFrom = o.ringFrom != null ? o.ringFrom : 1.1;
    const ringTo = o.ringTo != null ? o.ringTo : 2.0;
    const ringR = radius * (ringFrom + Math.pow(t, 0.5) * (ringTo - ringFrom));
    ctx.strokeStyle = `rgba(${color},${(a * 0.85).toFixed(3)})`;
    ctx.lineWidth = (1 - t) * 4 + 0.6;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
}
