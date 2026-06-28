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
    // 速く広がる衝撃波リング
    const ringR = radius * (1.1 + Math.pow(t, 0.5) * 0.9);
    ctx.strokeStyle = `rgba(${color},${(a * 0.85).toFixed(3)})`;
    ctx.lineWidth = (1 - t) * 4 + 0.6;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
}
