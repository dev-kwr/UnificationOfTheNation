// ============================================
// Unification of the Nation - 打刀の形状(共有)
// ============================================
// playerRenderer.js の PlayerClass.prototype.drawKatana から、
// 「柄・鍔・鎺・刀身」の純粋な形状だけを取り出したもの。
// 大薙(_oonagi*)の巨大光刃はプレイヤー固有の状態に依存するため含めない。
//
// なぜ別モジュールなのか:
//   bossRenderer.js は依存ゼロの自己完結モジュールで、playerRenderer.js を
//   直接 import すると playerRenderer → game.js → stage.js → boss.js →
//   bossRenderer.js の循環になり game.js の TDZ で起動時クラッシュする。
//   共有するなら依存を持たない専用モジュールへ切り出すしかない。
//
// 【同期の約束】数値・色・描画順は playerRenderer.js:85-500 の drawKatana と
// 1:1 で対応させてある。片方だけ触ると二刀流ボスとプレイヤーの刀が食い違う。

/**
 * 打刀を1本描く。原点は「手(握り)」で、+x が切先方向。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x            手の位置
 * @param {number} y
 * @param {number} angle        刃の角度(rad)。uprightBlend 補正【前】の生角度を渡すこと
 * @param {number} scaleDir     1 = 右向き / -1 = 左向き
 * @param {number} bladeLength  剣筋基準の刃渡り(見た目は -5 される)
 * @param {number} uprightBlend 垂直へ寄せる割合(プレイヤーのアイドル/二刀は 0.28)
 * @param {string} renderMode   'all' | 'handle' | 'blade'
 * @param {number} scaleY
 * @param {number} uprightTarget
 */
export function drawKatanaShape(
    ctx, x, y, angle,
    scaleDir = 1,
    bladeLength = 75,
    uprightBlend = 0.28,
    renderMode = 'all',
    scaleY = 1,
    uprightTarget = -Math.PI / 2
) {
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.translate(x, y);
    ctx.scale(scaleDir, scaleY);
    const blend = Math.max(0, Math.min(1, uprightBlend));
    const adjustedAngle = angle + (uprightTarget - angle) * blend;
    ctx.rotate(adjustedAngle);

    const scale = 0.52;
    ctx.scale(scale, scale);
    const visualBladeLength = Math.max(18, bladeLength - 5);
    const bladeReach = visualBladeLength / scale;

    const gripOffset = 10;
    const drawHandle = renderMode === 'all' || renderMode === 'handle';
    const drawBlade = renderMode === 'all' || renderMode === 'blade';

    // === 柄(つか) ===
    const handleStart = -23.5;
    const handleEnd = gripOffset - 1;
    const handleLen = handleEnd - handleStart;
    const handleHalfH = 2.6;
    // === 鍔(つば) ===
    const tsubaX = gripOffset;
    const tsubaRX = 1.8;
    const tsubaRY = 4.4;
    // === はばき ===
    const habakiX = tsubaX + tsubaRX + 0.4;

    if (drawHandle) {
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(handleStart, -handleHalfH);
        ctx.lineTo(handleEnd, -handleHalfH + 0.3);
        ctx.lineTo(handleEnd, handleHalfH - 0.3);
        ctx.lineTo(handleStart, handleHalfH);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 0.7;
        const wrapSpacing = 4.2;
        const wrapCount = Math.floor(handleLen / wrapSpacing);
        for (let i = 0; i <= wrapCount; i++) {
            const wx = handleStart + i * wrapSpacing;
            ctx.beginPath();
            ctx.moveTo(wx, -handleHalfH + 0.4);
            ctx.lineTo(wx + wrapSpacing * 0.5, handleHalfH - 0.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(wx, handleHalfH - 0.4);
            ctx.lineTo(wx + wrapSpacing * 0.5, -handleHalfH + 0.4);
            ctx.stroke();
        }

        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.ellipse(handleStart - 0.5, 0, 1.5, handleHalfH + 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(tsubaX + 0.2, 0.2, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
        ctx.fill();

        const tsubaGrad = ctx.createLinearGradient(tsubaX, -tsubaRY, tsubaX, tsubaRY);
        tsubaGrad.addColorStop(0, '#555');
        tsubaGrad.addColorStop(0.45, '#2a2a2a');
        tsubaGrad.addColorStop(0.55, '#222');
        tsubaGrad.addColorStop(1, '#444');
        ctx.fillStyle = tsubaGrad;
        ctx.beginPath();
        ctx.ellipse(tsubaX, 0, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(tsubaX, 0, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#c9a545';
        ctx.fillRect(habakiX, -1.8, 2.2, 3.6);
        ctx.strokeStyle = '#a07828';
        ctx.lineWidth = 0.4;
        ctx.strokeRect(habakiX, -1.8, 2.2, 3.6);
    }

    if (drawBlade) {
        const bladeStart = habakiX + 2.2;
        const bladeEnd = Math.max(bladeStart + 10, bladeReach);
        const bl = bladeEnd - bladeStart;
        const seg = 56;

        const getTX = (t) => bladeStart + (bladeEnd - bladeStart) * t;
        const sori = bl * 0.18;
        const getArcY = (t) => -(Math.pow(t, 1.8) * sori) + 0.06;

        const whiteHalf = 2.2;
        const upperPoints = [];
        const lowerPoints = [];
        for (let i = 0; i <= seg; i++) {
            const t = i / seg;
            upperPoints.push({ x: getTX(t), y: getArcY(t) - whiteHalf });
            lowerPoints.push({ x: getTX(t), y: getArcY(t) + whiteHalf });
        }

        // 先端形状: 峰側(上)は終端まで伸ばし、刃側(下)だけ絞る
        const tipY = upperPoints[seg].y;
        const edgeStartIndex = Math.floor(seg * 0.9);
        const edgeStart = lowerPoints[edgeStartIndex];
        const edgeSpanX = bladeEnd - edgeStart.x;
        const edgeCtrl1X = bladeEnd - edgeSpanX * 0.16;
        const edgeCtrl1Y = tipY + whiteHalf * 0.2;
        const edgeCtrl2X = edgeStart.x + edgeSpanX * 0.38;
        const edgeCtrl2Y = edgeStart.y - whiteHalf * 0.24;

        const blackBandWidth = whiteHalf * 1.18;
        const blackTopShift = -0.34;
        const blackBottomOverlap = 0.08;
        const blackTipIndex = Math.min(seg - 1, Math.floor(seg * 0.965));
        const blackTip = {
            x: upperPoints[blackTipIndex].x,
            y: upperPoints[blackTipIndex].y + blackTopShift
        };
        const blackEdgeStartIndex = Math.max(1, Math.floor(blackTipIndex * 0.89));
        const blackEdgeStart = {
            x: upperPoints[blackEdgeStartIndex].x,
            y: upperPoints[blackEdgeStartIndex].y + blackBandWidth + blackBottomOverlap
        };
        const blackEdgeSpanX = blackTip.x - blackEdgeStart.x;
        const blackCtrl1X = blackTip.x - blackEdgeSpanX * 0.16;
        const blackCtrl1Y = blackTip.y + blackBandWidth * 0.2;
        const blackCtrl2X = blackEdgeStart.x + blackEdgeSpanX * 0.38;
        const blackCtrl2Y = blackEdgeStart.y - blackBandWidth * 0.24;

        // --- 白刀身 ---
        ctx.fillStyle = '#e6ecf2';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
        for (let i = 1; i <= seg; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
        ctx.bezierCurveTo(edgeCtrl1X, edgeCtrl1Y, edgeCtrl2X, edgeCtrl2Y, edgeStart.x, edgeStart.y);
        for (let i = edgeStartIndex - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#1b2430';
        ctx.lineWidth = 0.85;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
        for (let i = 1; i <= blackTipIndex; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
        ctx.stroke();

        // --- 峰側の黒レイヤ ---
        ctx.fillStyle = '#1b2430';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y + blackTopShift);
        for (let i = 1; i <= blackTipIndex; i++) {
            ctx.lineTo(upperPoints[i].x, upperPoints[i].y + blackTopShift);
        }
        ctx.bezierCurveTo(blackCtrl1X, blackCtrl1Y, blackCtrl2X, blackCtrl2Y, blackEdgeStart.x, blackEdgeStart.y);
        for (let i = blackEdgeStartIndex - 1; i >= 0; i--) {
            ctx.lineTo(upperPoints[i].x, upperPoints[i].y + blackBandWidth + blackBottomOverlap);
        }
        ctx.closePath();
        ctx.fill();

        // --- 刃文(黒と白の境界) ---
        const seamWaveAmp = 0.10;
        const seamWaveFreq = 7.0;
        const seamBaseY = (i) => upperPoints[i].y + blackBandWidth + blackBottomOverlap;
        const seamWaveY = (i) => {
            if (blackEdgeStartIndex <= 0) return seamBaseY(i);
            const t = i / blackEdgeStartIndex;
            return seamBaseY(i) + Math.sin(t * Math.PI * seamWaveFreq) * seamWaveAmp;
        };
        const seamGrad = ctx.createLinearGradient(
            bladeStart, getArcY(0) + blackBandWidth - 1.1,
            bladeStart, getArcY(0) + blackBandWidth + 0.9
        );
        seamGrad.addColorStop(0, 'rgba(70, 78, 92, 0.82)');
        seamGrad.addColorStop(0.45, 'rgba(145, 155, 170, 0.78)');
        seamGrad.addColorStop(1, 'rgba(225, 234, 244, 0.62)');
        ctx.strokeStyle = seamGrad;
        ctx.lineWidth = 1.15;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, seamWaveY(0));
        for (let i = 1; i <= blackEdgeStartIndex; i++) ctx.lineTo(upperPoints[i].x, seamWaveY(i));
        ctx.bezierCurveTo(
            blackCtrl2X, blackCtrl2Y + seamWaveAmp * 0.8,
            blackCtrl1X, blackCtrl1Y - seamWaveAmp * 0.6,
            upperPoints[seg].x, upperPoints[seg].y
        );
        ctx.stroke();

        // 横手筋(切っ先境界)
        const yokoteX = upperPoints[edgeStartIndex].x;
        ctx.strokeStyle = 'rgba(210, 220, 230, 0.38)';
        ctx.lineWidth = 0.42;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(yokoteX, upperPoints[edgeStartIndex].y + 0.1);
        ctx.lineTo(yokoteX, lowerPoints[edgeStartIndex].y - 0.2);
        ctx.stroke();

        // 全周輪郭
        ctx.strokeStyle = '#4e5867';
        ctx.lineWidth = 0.52;
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 6;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
        for (let i = 1; i <= seg; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
        ctx.bezierCurveTo(edgeCtrl1X, edgeCtrl1Y, edgeCtrl2X, edgeCtrl2Y, edgeStart.x, edgeStart.y);
        for (let i = edgeStartIndex - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
        ctx.closePath();
        ctx.stroke();

        // 明るい縁(刃側のみ)
        ctx.strokeStyle = '#d6e0ea';
        ctx.lineWidth = 0.42;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(lowerPoints[0].x, lowerPoints[0].y);
        for (let i = 1; i <= edgeStartIndex; i++) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
        ctx.bezierCurveTo(edgeCtrl2X, edgeCtrl2Y, edgeCtrl1X, edgeCtrl1Y, upperPoints[seg].x, upperPoints[seg].y);
        ctx.stroke();
    }

    ctx.restore();
}
