// Unification of the Nation - 描画系 mixin

import { PLAYER, GRAVITY, FRICTION, COLORS, LANE_OFFSET } from './constants.js';
import { audio } from './audio.js';
import { game } from './game.js';
import { drawShurikenShape } from './weapon.js';
import {
    ANIM_STATE, COMBO_ATTACKS, PLAYER_HEADBAND_LINE_WIDTH, PLAYER_SPECIAL_HEADBAND_LINE_WIDTH,
    PLAYER_PONYTAIL_CONNECT_LIFT_Y, PLAYER_PONYTAIL_ROOT_ANGLE_RIGHT,
    PLAYER_PONYTAIL_ROOT_ANGLE_LEFT, PLAYER_PONYTAIL_ROOT_SHIFT_X,
    PLAYER_PONYTAIL_NODE_ROOT_OFFSET_X, PLAYER_PONYTAIL_NODE_ROOT_OFFSET_Y,
    BASE_EXP_TO_NEXT, TEMP_NINJUTSU_MAX_STACK_MS, LEVEL_UP_MAX_HP_GAIN
} from './playerData.js';

export function applyRendererMixin(PlayerClass) {

    PlayerClass.prototype.getKatanaBladeLength = function() {
        // 剣筋の弧に刃先が届く長さで統一
        return 80;
    };

    PlayerClass.prototype.drawKatana = function(
        ctx,
        x,
        y,
        angle,
        scaleDir = 1,
        bladeLength = this.getKatanaBladeLength(),
        uprightBlend = 0.28,
        renderMode = 'all',
        scaleY = 1,
        uprightTarget = -Math.PI / 2
    ) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scaleDir, scaleY);
        // 垂直方向(uprightTarget)へ角度を寄せて、刀全体を立たせる
        const blend = Math.max(0, Math.min(1, uprightBlend));
        const adjustedAngle = angle + (uprightTarget - angle) * blend;
        ctx.rotate(adjustedAngle);

        const scale = 0.52;
        ctx.scale(scale, scale);
        // 剣筋(エフェクト)基準より見た目の刀身だけ少し短くする
        const visualBladeLength = Math.max(18, bladeLength - 5);
        const bladeReach = visualBladeLength / scale;

        const gripOffset = 10;
        const drawHandle = renderMode === 'all' || renderMode === 'handle';
        const drawBlade = renderMode === 'all' || renderMode === 'blade';

        // === 柄（つか）===
        const handleStart = -23.5;
        const handleEnd = gripOffset - 1;
        const handleLen = handleEnd - handleStart;
        const handleHalfH = 2.6;

        // === 鍔（つば）===
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
            // === 刀身 ===
            const bladeStart = habakiX + 2.2;
            // 先端を剣筋発生位置(= bladeLength)に合わせる
            const bladeEnd = Math.max(bladeStart + 10, bladeReach);
            const bl = bladeEnd - bladeStart;
            const seg = 56;

            // シンプル刀身:
            // - 白ベース（刀身全体は円弧）
            // - 白の峰側に、幅1/2・少し短い黒レイヤーを重ねる
            // - 先端は右下側のみ丸みを残して細くする
            const getTX = (t) => bladeStart + (bladeEnd - bladeStart) * t;
            const sori = bl * 0.18;
            // 根本(t=0)は直線時と同じ位置・同じ入り方にする
            const getArcY = (t) => -(Math.pow(t, 1.8) * sori) + 0.06;

            const whiteHalf = 2.2;
            const getWhiteUpperY = (t) => getArcY(t) - whiteHalf;
            const getWhiteLowerY = (t) => getArcY(t) + whiteHalf;

            const upperPoints = [];
            const lowerPoints = [];
            for (let i = 0; i <= seg; i++) {
                const t = i / seg;
                upperPoints.push({ x: getTX(t), y: getWhiteUpperY(t) });
                lowerPoints.push({ x: getTX(t), y: getWhiteLowerY(t) });
            }

            // 先端形状:
            // 峰側(上)はそのまま終端まで伸ばし、刃側(下)だけ先端へ向かって絞る
            const tipY = upperPoints[seg].y;
            const edgeStartIndex = Math.floor(seg * 0.9);
            const edgeStart = lowerPoints[edgeStartIndex];
            const edgeSpanX = bladeEnd - edgeStart.x;
            const edgeCtrl1X = bladeEnd - edgeSpanX * 0.16;
            const edgeCtrl1Y = tipY + whiteHalf * 0.2;
            const edgeCtrl2X = edgeStart.x + edgeSpanX * 0.38;
            const edgeCtrl2Y = edgeStart.y - whiteHalf * 0.24;
            // 黒レイヤーは少し太く・長くし、峰側の隙間を潰す
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
            // 白を少し銀寄りに抑えて、和鋼の質感に近づける
            ctx.fillStyle = '#e6ecf2';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
            for (let i = 1; i <= seg; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
            // 刃側だけを先端に向けて絞って尖らせる (upperPoints[seg]まで確実に到達させる)
            ctx.bezierCurveTo(edgeCtrl1X, edgeCtrl1Y, edgeCtrl2X, edgeCtrl2Y, edgeStart.x, edgeStart.y);
            for (let i = edgeStartIndex - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
            ctx.closePath();
            ctx.fill();

            // 峰側エッジの明るい隙間を消すためのストロークは、先端でドットが出ないように miter Join にする
            ctx.strokeStyle = '#1b2430';
            ctx.lineWidth = 0.85;
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
            for (let i = 1; i <= blackTipIndex; i++) {
                ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
            }
            ctx.stroke();

            // --- 峰側の黒レイヤ ---
            // 漆黒ではなく暗い鋼色
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

            // --- 黒と白の境界にグレーのグラデーション ---
            // 刃文を落ち着かせる（細かすぎる波を抑える）
            const seamWaveAmp = 0.10;
            const seamWaveFreq = 7.0;
            const seamBaseY = (i) => upperPoints[i].y + blackBandWidth + blackBottomOverlap;
            const seamWaveY = (i) => {
                if (blackEdgeStartIndex <= 0) return seamBaseY(i);
                const t = i / blackEdgeStartIndex;
                const wave = Math.sin(t * Math.PI * seamWaveFreq) * seamWaveAmp;
                return seamBaseY(i) + wave;
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
            ctx.lineCap = 'butt'; // 先端の丸を消す
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(upperPoints[0].x, seamWaveY(0));
            for (let i = 1; i <= blackEdgeStartIndex; i++) {
                ctx.lineTo(upperPoints[i].x, seamWaveY(i));
            }
            ctx.bezierCurveTo(
                blackCtrl2X, blackCtrl2Y + seamWaveAmp * 0.8,
                blackCtrl1X, blackCtrl1Y - seamWaveAmp * 0.6,
                upperPoints[seg].x, upperPoints[seg].y // blackTip.x/y ではなく確実に先端へ
            );
            ctx.stroke();

            // 横手筋（切っ先境界）を薄く追加
            const yokoteX = upperPoints[edgeStartIndex].x;
            const yokoteTopY = upperPoints[edgeStartIndex].y + 0.1;
            const yokoteBottomY = lowerPoints[edgeStartIndex].y - 0.2;
            ctx.strokeStyle = 'rgba(210, 220, 230, 0.38)';
            ctx.lineWidth = 0.42;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(yokoteX, yokoteTopY);
            ctx.lineTo(yokoteX, yokoteBottomY);
            ctx.stroke();

            // 全周輪郭は暗めにして、峰側で白が見えないようにする
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

            // 明るい縁は刃側だけに限定。先端でドットが出ないように butt にする
            ctx.strokeStyle = '#d6e0ea';
            ctx.lineWidth = 0.42;
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(lowerPoints[0].x, lowerPoints[0].y);
            // 切っ先の手前まで描画
            for (let i = 1; i <= edgeStartIndex; i++) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
            // 切っ先の頂点 (upperPoints[seg]) へ正確に結ぶ
            ctx.bezierCurveTo(edgeCtrl2X, edgeCtrl2Y, edgeCtrl1X, edgeCtrl1Y, upperPoints[seg].x, upperPoints[seg].y);
            ctx.stroke();
        }

        ctx.restore();
    };

    PlayerClass.prototype.renderPonytail = function(ctx, headCenterX, headY, headRadius, hairBaseX, hairBaseY, facingRight, alpha, options = {}) {
        const hairNodes = Array.isArray(options.hairNodes) ? options.hairNodes : this.hairNodes;
        if (!hairNodes || hairNodes.length <= 1 || alpha <= 0) return;

        const dir = facingRight ? 1 : -1;
        const silhouetteColor = options.silhouetteColor || '#1a1a1a';
        const outlineEnabled = options.outlineEnabled !== false;
        const outlineColor = options.outlineColor || 'rgba(168, 196, 230, 0.29)';
        const outlineExpand = options.outlineExpand || 0.75;

        const hairDenom = Math.max(1, hairNodes.length - 1);
        const hairJoinAngle = Math.atan2(hairBaseY - headY, hairBaseX - headCenterX);

        const smoothedNodes = [];
        for (let i = 0; i < hairNodes.length; i++) {
            let node = { x: hairNodes[i].x, y: hairNodes[i].y };
            if (i === 0) {
                node = { x: hairBaseX - dir * 0.7, y: hairBaseY - 0.15 };
            }
            // 根本から曲がり角（0〜4ノード）を重点的に平滑化
            if (i > 0 && i < 5 && i < hairNodes.length - 1) {
                const prevNode = (i === 1) ? { x: hairBaseX, y: hairBaseY } : hairNodes[i - 1];
                const nextNode = hairNodes[i + 1];
                let wPrev = 0.34;
                let wNode = 0.46;
                let wNext = 0.20;
                if (i === 1) {
                    wPrev = 0.56; wNode = 0.30; wNext = 0.14;
                } else if (i === 2) {
                    wPrev = 0.46; wNode = 0.36; wNext = 0.18;
                }
                node = {
                    x: prevNode.x * wPrev + node.x * wNode + nextNode.x * wNext,
                    y: prevNode.y * wPrev + node.y * wNode + nextNode.y * wNext
                };
            }
            smoothedNodes.push(node);
        }

        const topNodes = [];
        const bottomNodes = [];
        const rootThickness = 13.8;
        const hairHalfSpan = 0.24;
        const rootRadius = headRadius + 0.12;
        const rootNx = -Math.sin(hairJoinAngle);
        const rootNy = Math.cos(hairJoinAngle);
        let prevNx = rootNx;
        let prevNy = rootNy;

        for (let i = 0; i < smoothedNodes.length; i++) {
            const node = smoothedNodes[i];
            const tProgress = i / hairDenom;
            const thickness = Math.max(2.2, rootThickness * (Math.pow(1 - tProgress, 0.88) * 0.90 + 0.10));
            const half = thickness * 0.5;

            if (i === 0) {
                const topA = hairJoinAngle - hairHalfSpan;
                const botA = hairJoinAngle + hairHalfSpan;
                topNodes.push({
                    x: headCenterX + Math.cos(topA) * rootRadius,
                    y: headY + Math.sin(topA) * rootRadius
                });
                bottomNodes.push({
                    x: headCenterX + Math.cos(botA) * rootRadius,
                    y: headY + Math.sin(botA) * rootRadius
                });
                continue;
            }

            const prevNode = smoothedNodes[Math.max(0, i - 1)];
            const nextNode = smoothedNodes[Math.min(smoothedNodes.length - 1, i + 1)];
            const dx = nextNode.x - prevNode.x;
            const dy = nextNode.y - prevNode.y;
            const len = Math.hypot(dx, dy) || 1;
            const tangentNx = -dy / len;
            const tangentNy = dx / len;
            // 伸びた時の見た目を維持しつつ、垂れ下がり時だけ接線法線を強めてペラ化/ねじれを抑える
            const verticality = Math.min(1, Math.abs(dy) / len); // 0:水平, 1:垂直
            const tangentWeight = 0.06 + verticality * 0.64;
            const rootWeight = 1 - tangentWeight;
            let nx = tangentNx * tangentWeight + rootNx * rootWeight;
            let ny = tangentNy * tangentWeight + rootNy * rootWeight;
            const nLen = Math.hypot(nx, ny);
            if (!Number.isFinite(nLen) || nLen < 0.08) {
                nx = prevNx;
                ny = prevNy;
            } else {
                nx /= nLen;
                ny /= nLen;
            }
            // 直前ノードとの向きを揃えて、途中反転を防ぐ
            if (nx * prevNx + ny * prevNy < 0) {
                nx = -nx;
                ny = -ny;
            }
            // 根元基準の向きも維持
            if (nx * rootNx + ny * rootNy < 0) {
                nx = -nx;
                ny = -ny;
            }

            // 上下エッジの対応が入れ替わる場合は明示的に回避する
            if (topNodes.length > 0 && bottomNodes.length > 0) {
                const prevTop = topNodes[topNodes.length - 1];
                const prevBottom = bottomNodes[bottomNodes.length - 1];
                const topX = node.x + nx * half;
                const topY = node.y + ny * half;
                const bottomX = node.x - nx * half;
                const bottomY = node.y - ny * half;
                const normalScore =
                    Math.hypot(topX - prevTop.x, topY - prevTop.y) +
                    Math.hypot(bottomX - prevBottom.x, bottomY - prevBottom.y);
                const swapScore =
                    Math.hypot(bottomX - prevTop.x, bottomY - prevTop.y) +
                    Math.hypot(topX - prevBottom.x, topY - prevBottom.y);
                if (swapScore < normalScore) {
                    nx = -nx;
                    ny = -ny;
                }
            }
            prevNx = nx;
            prevNy = ny;

            topNodes.push({ x: node.x + nx * half, y: node.y + ny * half });
            bottomNodes.push({ x: node.x - nx * half, y: node.y - ny * half });
        }

        // 輪郭点を軽く平滑化して、根元付近の凹みを抑える
        const smoothEdge = (nodes) => {
            if (!Array.isArray(nodes) || nodes.length <= 2) return;
            const src = nodes.map((p) => ({ x: p.x, y: p.y }));
            for (let i = 1; i < nodes.length - 1; i++) {
                const prev = src[i - 1];
                const cur = src[i];
                const next = src[i + 1];
                const curW = i <= 2 ? 0.62 : 0.56;
                const sideW = (1 - curW) * 0.5;
                nodes[i].x = prev.x * sideW + cur.x * curW + next.x * sideW;
                nodes[i].y = prev.y * sideW + cur.y * curW + next.y * sideW;
            }
        };
        smoothEdge(topNodes);
        smoothEdge(bottomNodes);

        // 先端側の余計な立ち上がりを抑えるため、末端を細く収束させる
        const sharpenTip = () => {
            const last = Math.min(topNodes.length, bottomNodes.length) - 1;
            if (last < 1) return;

            const tipCenter = smoothedNodes[last];
            const prevCenter = smoothedNodes[Math.max(0, last - 1)];
            let dx = tipCenter.x - prevCenter.x;
            let dy = tipCenter.y - prevCenter.y;
            let len = Math.hypot(dx, dy);
            if (len < 0.0001) {
                dx = 1;
                dy = 0;
                len = 1;
            }
            let nx = -dy / len;
            let ny = dx / len;
            if (nx * prevNx + ny * prevNy < 0) {
                nx = -nx;
                ny = -ny;
            }

            const tipHalf = 0.62;
            topNodes[last].x = tipCenter.x + nx * tipHalf;
            topNodes[last].y = tipCenter.y + ny * tipHalf;
            bottomNodes[last].x = tipCenter.x - nx * tipHalf;
            bottomNodes[last].y = tipCenter.y - ny * tipHalf;

            if (last >= 2) {
                const shoulder = last - 1;
                const cx = (topNodes[shoulder].x + bottomNodes[shoulder].x) * 0.5;
                const cy = (topNodes[shoulder].y + bottomNodes[shoulder].y) * 0.5;
                const curHalf = Math.hypot(
                    topNodes[shoulder].x - bottomNodes[shoulder].x,
                    topNodes[shoulder].y - bottomNodes[shoulder].y
                ) * 0.5;
                const half = Math.max(1.4, curHalf * 0.92);
                topNodes[shoulder].x = cx + nx * half;
                topNodes[shoulder].y = cy + ny * half;
                bottomNodes[shoulder].x = cx - nx * half;
                bottomNodes[shoulder].y = cy - ny * half;
            }
        };
        // 先端の強制補正は形状を壊しやすいため無効化
        // sharpenTip();

        // 形状確認用: 頭との接続を視覚的に切るため、髪全体を少し後方へずらす
        const debugDetachHairFromHead = false;
        if (debugDetachHairFromHead) {
            const detachX = -dir * 9.0;
            const detachY = 4.0;
            for (const p of topNodes) {
                p.x += detachX;
                p.y += detachY;
            }
            for (const p of bottomNodes) {
                p.x += detachX;
                p.y += detachY;
            }
        }

        const tracePath = () => {
            const contour = [...topNodes, ...bottomNodes.slice().reverse()];
            if (contour.length < 3) return;
            ctx.beginPath();
            const firstMidX = (contour[0].x + contour[1].x) * 0.5;
            const firstMidY = (contour[0].y + contour[1].y) * 0.5;
            ctx.moveTo(firstMidX, firstMidY);
            for (let i = 1; i < contour.length; i++) {
                const p = contour[i];
                const next = contour[(i + 1) % contour.length];
                const midX = (p.x + next.x) * 0.5;
                const midY = (p.y + next.y) * 0.5;
                ctx.quadraticCurveTo(p.x, p.y, midX, midY);
            }
            ctx.quadraticCurveTo(contour[0].x, contour[0].y, firstMidX, firstMidY);
            ctx.closePath();
        };

        if (outlineEnabled) {
            ctx.save();
            // 頭と重なる領域ではポニーテール輪郭を描かない
            const overlapMaskRadius = headRadius + Math.max(0.35, outlineExpand * 0.6);
            ctx.beginPath();
            ctx.rect(-10000, -10000, 20000, 20000);
            ctx.arc(headCenterX, headY, overlapMaskRadius, 0, Math.PI * 2, true);
            ctx.clip('evenodd');
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            tracePath();
            ctx.stroke();
            ctx.restore();
        }

        ctx.fillStyle = silhouetteColor;
        tracePath();
        ctx.fill();
    };

    PlayerClass.prototype.renderHeadbandTail = function(ctx, tailRootX, tailRootY, dir, alpha, accentColor, time, options = {}) {
        const scarfNodes = Array.isArray(options.scarfNodes) ? options.scarfNodes : this.scarfNodes;
        if (!scarfNodes || scarfNodes.length <= 1 || alpha <= 0) return;

        const tailShorten = 0.9;
        const rootNodeX = scarfNodes[0].x;
        const rootNodeY = scarfNodes[0].y;

        const mapNode = (node) => ({
            x: tailRootX + (node.x - rootNodeX) * tailShorten,
            y: tailRootY + (node.y - rootNodeY) * tailShorten
        });
        const tailNodes = scarfNodes.map(mapNode);
        if (tailNodes.length > 2) {
            // 描画専用の平滑化。物理ノードは保持して輪郭だけギザつきを抑える
            const smoothPasses = 2;
            for (let pass = 0; pass < smoothPasses; pass++) {
                const src = tailNodes.map((p) => ({ x: p.x, y: p.y }));
                for (let i = 1; i < tailNodes.length - 1; i++) {
                    const prev = src[i - 1];
                    const cur = src[i];
                    const next = src[i + 1];
                    const curWeight = (i <= 2) ? 0.56 : 0.60;
                    const sideWeight = (1 - curWeight) * 0.5;
                    tailNodes[i].x = prev.x * sideWeight + cur.x * curWeight + next.x * sideWeight;
                    tailNodes[i].y = prev.y * sideWeight + cur.y * curWeight + next.y * sideWeight;
                }
            }
        }
        const ribbonHalfWidth = 2.0;
        const leftEdge = [];
        const rightEdge = [];
        let prevNx = 0;
        let prevNy = 1;

        for (let i = 0; i < tailNodes.length; i++) {
            const prevNode = tailNodes[Math.max(0, i - 1)];
            const nextNode = tailNodes[Math.min(tailNodes.length - 1, i + 1)];
            const dx = nextNode.x - prevNode.x;
            const dy = nextNode.y - prevNode.y;
            const len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len;
            let ny = dx / len;
            if (i > 0 && nx * prevNx + ny * prevNy < 0) {
                nx = -nx;
                ny = -ny;
            }
            if (i > 0) {
                nx = nx * 0.38 + prevNx * 0.62;
                ny = ny * 0.38 + prevNy * 0.62;
                const nLen = Math.hypot(nx, ny) || 1;
                nx /= nLen;
                ny /= nLen;
            }
            prevNx = nx;
            prevNy = ny;

            const waveSpeed = 0.0052;
            const wavePhase = i * 0.55;
            const wave = Math.sin(time * waveSpeed + wavePhase);
            const tiltAmp = 0.55;
            const rootDamp = i === 0 ? 0 : (i === 1 ? 0.5 : 1.0);
            const tiltX = wave * tiltAmp * rootDamp;
            const centerX = tailNodes[i].x + tiltX;
            const centerY = tailNodes[i].y;
            const half = ribbonHalfWidth;

            leftEdge.push({ x: centerX - nx * half, y: centerY - ny * half });
            rightEdge.push({ x: centerX + nx * half, y: centerY + ny * half });
        }

        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
        for (let i = 1; i < leftEdge.length; i++) {
            ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
        }
        for (let i = rightEdge.length - 1; i >= 0; i--) {
            ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // 接点の切れ目対策: 根元に小さな埋めパッチを重ねる
        ctx.beginPath();
        ctx.arc(tailRootX, tailRootY + 0.05, ribbonHalfWidth * 0.95, 0, Math.PI * 2);
        ctx.fill();
    };

    PlayerClass.prototype.render = function(ctx, options = {}) {
        ctx.save();
        this.subWeaponRenderedInModel = false;
        this.dualBladeTrailAnchors = null;
        const skipSpecialRender = options.skipSpecialRender === true;
        const filterParts = [];
        const ghostVeilActive = this.isGhostVeilActive();
        const ghostSilhouetteAlpha = ghostVeilActive
            ? (
                this.subWeaponAction === '大太刀' && this.subWeaponTimer > 0
                    ? Math.max(0.1, this.getGhostVeilAlpha() * 0.78)
                    : this.getGhostVeilAlpha()
            )
            : 1.0;

        // 必殺技詠唱中は軽く明るくする
        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            const progress = 1 - (this.specialCastTimer / Math.max(1, this.specialCastDurationMs));
            filterParts.push(`brightness(${100 + progress * 28}%)`);
        }

        const damageFlashActive = this.damageFlashTimer > 0;

        // 隠れ身の術中は本体のみ透明化（全体フィルタは重いので適用しない）
        if (filterParts.length > 0) {
            ctx.filter = filterParts.join(' ');
        }

        // 無敵時間中は点滅（死亡中は点滅しない）
        if (!this.isGhostVeilActive() && !this.isDefeated && !this.isUsingSpecial && this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 100) % 2 === 0) {
            ctx.globalAlpha *= 0.5;
        }
        // 被弾フラッシュは filter を使わず軽量な点滅アルファにする
        if (damageFlashActive && !ghostVeilActive && !this.isDefeated) {
            const flashStep = Math.floor((this.motionTime + this.damageFlashTimer) / 48) % 2;
            ctx.globalAlpha *= flashStep === 0 ? 0.76 : 0.92;
        }

        // 残像
        const isOdachiJumping = this.isOdachiJumpAfterimageActive();
        const isSpearThrusting = this.isSpearThrustAfterimageActive();
        if (this.isDashing || Math.abs(this.vx) > PLAYER.SPEED * 1.5 || isOdachiJumping || isSpearThrusting) {
            const sampleStep = ghostVeilActive
                ? 4
                : 2;
            for (let i = 0; i < this.afterImages.length; i += sampleStep) {
                const img = this.afterImages[i];
                if (!img) continue;
                const depthFade = (1 - i / this.afterImages.length);
                const isSpecialShadow = img.type === 'special_shadow';
                const ghostTrailAlphaScale = ghostVeilActive
                    ? (isSpecialShadow ? 0.45 : 0.18)
                    : 1.0;
                const alpha = (isSpecialShadow ? 1.0 : (0.3 * depthFade)) * ghostTrailAlphaScale;
                this.renderModel(ctx, img.x, img.y, img.facingRight, alpha, false, {
                    useLiveAccessories: false,
                    renderHeadband: !ghostVeilActive,
                    renderHeadbandTail: false,
                    renderHair: false
                });
            }
        }

        // 必殺技演出を本体の下に描画
        if (!skipSpecialRender && (this.isUsingSpecial || this.specialSmoke.length > 0)) {
            this.renderSpecial(ctx, options.specialRenderOptions || {});
        }

        // 本体描画
        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            const castOptions = ghostVeilActive
                ? { palette: { silhouette: `rgba(26, 26, 26, 0.0)` } }
                : {};
            // 隠れ身の術中は本体の色を透明にするため 0.0 を渡す。globalAlphaには影響させないことでアクセサリを維持。
            this.renderModel(ctx, this.x, this.y, this.facingRight, ghostVeilActive ? 0.0 : 1.0, false, {
                ...castOptions,
                ninNinPose: true,
                headbandAlpha: ghostVeilActive ? 1.0 : undefined
            });
        } else {
            const renderOptions = ghostVeilActive
                ? { palette: { silhouette: `rgba(26, 26, 26, 0.0)` } }
                : {};
            // 隠れ身の術中は本体の色を透明にするため 0.0 を渡す。globalAlphaには影響させないことでアクセサリを維持。
            this.renderModel(ctx, this.x, this.y, this.facingRight, ghostVeilActive ? 0.0 : 1.0, true, {
                ...renderOptions,
                headbandAlpha: ghostVeilActive ? 1.0 : undefined
            });
        }

        ctx.restore();
        ctx.filter = 'none';
        ctx.shadowBlur = 0;
    };

    PlayerClass.prototype.renderModel = function(ctx, x, y, facingRight, alpha = 1.0, renderSubWeaponVisualsInput = true, options = {}) {
        ctx.save();
        // alphaが0の場合でも、鉢巻や武器を描画するためにここではglobalAlphaを操作しない。
        // 本体パーツの個別の描画内部でチェックを行う。

        // alpha が正数かつ1.0未満のフェードイン/アウトなどの場合のみ全体の透明度に掛ける
        if (alpha > 0 && alpha !== 1.0) ctx.globalAlpha *= alpha;

        // 点滅はrender()側で一元管理する（剣筋との位相ズレを防ぐ）

        const useLiveAccessories = options.useLiveAccessories !== false;
        const renderHeadbandTail = options.renderHeadbandTail !== false;
        const headbandAlpha = Number.isFinite(options.headbandAlpha)
            ? Math.max(0, Math.min(1, options.headbandAlpha))
            : alpha;
        const forceSubWeaponRender = options.forceSubWeaponRender || (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流');
        const renderSubWeaponVisuals = renderSubWeaponVisualsInput;
        const accessoryHairNodes = Array.isArray(options.hairNodes) ? options.hairNodes : this.hairNodes;
        const accessoryScarfNodes = Array.isArray(options.scarfNodes) ? options.scarfNodes : this.scarfNodes;

        const originalX = this.x;
        const originalY = this.y;
        this.x = x;
        this.y = y;
        this.forceSubWeaponRender = forceSubWeaponRender;

        const isSilhouetteMode = options.silhouetteMode === true;
        const isNinNinPose = options.ninNinPose === true;

        // 変数定義
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        const state = options.state || this;
        const time = state.motionTime !== undefined ? state.motionTime : this.motionTime;
        const vx = state.vx !== undefined ? state.vx : this.vx;
        const vy = state.vy !== undefined ? state.vy : this.vy;
        const isDashing = state.isDashing !== undefined ? state.isDashing : this.isDashing;
        const isGrounded = state.isGrounded !== undefined ? state.isGrounded : this.isGrounded;
        const isAttacking = state.isAttacking !== undefined ? state.isAttacking : this.isAttacking;
        const currentAttack = state.currentAttack !== undefined ? state.currentAttack : this.currentAttack;
        const attackTimer = state.attackTimer !== undefined ? state.attackTimer : this.attackTimer;
        const subWeaponTimer = state.subWeaponTimer !== undefined ? state.subWeaponTimer : this.subWeaponTimer;
        const subWeaponAction = state.subWeaponAction !== undefined ? state.subWeaponAction : this.subWeaponAction;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;
        const comboStep1IdleTransitionTimer = state.comboStep1IdleTransitionTimer !== undefined
            ? state.comboStep1IdleTransitionTimer
            : this.comboStep1IdleTransitionTimer;
        const comboStep5IdleTransitionTimer = state.comboStep5IdleTransitionTimer !== undefined
            ? state.comboStep5IdleTransitionTimer
            : this.comboStep5IdleTransitionTimer;
        const comboStep5RecoveryAttack = state.comboStep5RecoveryAttack !== undefined
            ? state.comboStep5RecoveryAttack
            : this.comboStep5RecoveryAttack;
        const comboStep5RecoveryDuration = 180; // recoveryMsと一致させる
        const clamp01 = (value) => Math.max(0, Math.min(1, value));

        const isMoving = Math.abs(vx) > 0.1 || !isGrounded;
// ---
        const silhouetteColor = isSilhouetteMode ? (options.palette?.silhouette || '#1a1a1a') : ((options.palette && options.palette.silhouette) || '#1a1a1a');
        const accentColor = isSilhouetteMode ? (options.palette?.accent || '#00bfff') : ((options.palette && options.palette.accent) || '#00bfff');
        const silhouetteOutlineEnabled = isSilhouetteMode ? false : (options.silhouetteOutline !== false);
        const silhouetteOutlineColor = (options.palette && options.palette.silhouetteOutline) || 'rgba(168, 196, 230, 0.29)';
        const outlineExpand = 0.75;
// ---

        const isCrouchPose = isCrouching;
        const isSpearThrustPose = subWeaponTimer > 0 && subWeaponAction === '大槍' && !isAttacking;
        const spearPoseProgress = isSpearThrustPose ? Math.max(0, Math.min(1, 1 - (subWeaponTimer / 270))) : 0;
        const spearDrive = isSpearThrustPose ? Math.sin(spearPoseProgress * Math.PI) : 0;
        const comboPoseAttack = (isAttacking && currentAttack && currentAttack.comboStep)
            ? currentAttack
            : ((comboStep5IdleTransitionTimer > 0 && comboStep5RecoveryAttack && comboStep5RecoveryAttack.comboStep)
                ? comboStep5RecoveryAttack
                : null);
        const comboAttackingPose = !!comboPoseAttack;
        const comboStep5RecoveryActive = !!(
            comboPoseAttack &&
            comboPoseAttack === comboStep5RecoveryAttack &&
            comboStep5IdleTransitionTimer > 0
        );
        // 合計280ms。最初の180ms(280->100)は静止(Blend=0)、後半100ms(100->0)でアイドルへ戻る。
        const comboStep5RecoveryBlend = (comboStep5RecoveryActive && comboStep5IdleTransitionTimer < 100)
            ? (1 - Math.max(0, Math.min(1, comboStep5IdleTransitionTimer / 100)))
            : 0;
        const visualIsAttacking = isAttacking || comboStep5RecoveryActive;
        const comboVisualAttackState = comboAttackingPose
            ? {
                currentAttack: comboPoseAttack,
                attackTimer: comboStep5RecoveryActive ? 0 : attackTimer,
                facingRight,
                x,
                y,
                width: this.width,
                height: this.height,
                isCrouching,
                recoveryBlend: comboStep5RecoveryBlend
            }
            : null;
        const isDualZComboPose = !!(
            !isAttacking &&
            subWeaponTimer > 0 &&
            subWeaponAction === '二刀_Z' &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            typeof this.currentSubWeapon.getMainSwingPose === 'function'
        );

        const dualZPoseOptions = (
            this.subWeaponPoseOverride &&
            subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : undefined;
        const dualZPose = isDualZComboPose
            ? this.currentSubWeapon.getMainSwingPose(dualZPoseOptions || {})
            : null;
        const useDualZCustomLegPose = options.useDualZCustomLegPose === true;
        const speedAbs = Math.abs(vx);
        const legTransitionLocked = comboStep1IdleTransitionTimer > 0;
        const comboStepPose = comboAttackingPose && comboPoseAttack ? (comboPoseAttack.comboStep || 0) : 0;
        const comboPoseProgress = comboStepPose
            ? (
                comboPoseAttack === comboStep5RecoveryAttack
                    ? 1.0 // 余韻中はモーションの最終ポーズ(1.0)を維持
                    : clamp01(1 - (attackTimer / Math.max(1, (comboPoseAttack && comboPoseAttack.durationMs) || PLAYER.ATTACK_COOLDOWN)))
            )
            : 0;
        const isRunLike = !isNinNinPose && !comboAttackingPose && !legTransitionLocked && isGrounded && speedAbs > 0.85;
        const isDashLike = !isNinNinPose && !comboAttackingPose && !legTransitionLocked && (isDashing || speedAbs > this.speed * 1.45);
        const locomotionPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
        const crouchWalkPhase = (isCrouchPose && isRunLike) ? locomotionPhase : 0;
        const crouchIdlePhase = (isCrouchPose && !isRunLike) ? Math.sin(this.motionTime * 0.006) : 0;
        const crouchBodyBob = isCrouchPose
            ? (isRunLike ? crouchWalkPhase * 0.4 : crouchIdlePhase * 0.2)
            : 0;
        const crouchLeanShift = isCrouchPose ? crouchWalkPhase * 0.55 : 0;

        let bob = 0;
        if (isNinNinPose) {
            bob = 0;
        } else if (isCrouchPose) {
            bob = crouchBodyBob;
        } else if (!isGrounded) {
            bob = Math.max(-1.4, Math.min(1.6, -vy * 0.07));
        } else if (comboStepPose === 1 || comboStepPose === 2) {
            // Z1〜2段は歩行揺れを無効化し、短い重心移動のみで自然化
            bob = -Math.sin(comboPoseProgress * Math.PI) * 0.34;
        } else if (isRunLike) {
            bob = Math.abs(locomotionPhase) * (isDashLike ? 3.6 : 2.5);
        } else {
            bob = Math.sin(this.motionTime * 0.005) * 1.0;
        }

        const headRatio = options.headRatio || (14 * 2 / 60); // デフォルトは約2.1頭身（チビキャラ）
        const headScale = options.headScale || 1.0;
        // しゃがみ中の頭サイズ:
        // プレイヤー: heightが半分になるのでPLAYER.HEIGHTで補正
        // ボス(headScale<1): heightは変わらないのでそのまま使用
        const baseHeightForHead = isCrouching
            ? (headScale < 1.0 ? this.height : Math.max(this.height, PLAYER.HEIGHT))
            : this.height;
        const headRadius = (baseHeightForHead * headRatio * 0.5) * headScale;
        
        // しゃがみの圧縮強度（1.0=プレイヤー用フル圧縮, 0.35=ボス用控えめ）
        const crouchIntensity = isCrouchPose ? (options.crouchIntensity ?? 1.0) : 0;
        
        // 立ちポーズの基本位置
        const standHeadY = y + headRadius * 1.1 + bob - (isSpearThrustPose ? spearDrive * 2.0 : 0);
        const standHipY = bottomY - headRadius * 1.43 - (isSpearThrustPose ? spearDrive * 1.7 : 0);
        // しゃがみポーズの基本位置
        const crouchHeadY = bottomY - headRadius * 2.2 + bob;
        const crouchHipY = bottomY - headRadius * 0.95 + bob * 0.45;
        
        // ブレンド補間
        let headY = standHeadY + (crouchHeadY - standHeadY) * crouchIntensity;
        let bodyTopY = headY + headRadius * (1.03 - 0.02 * crouchIntensity);
        let hipY = standHipY + (crouchHipY - standHipY) * crouchIntensity;

        // 腰を上げるほど「胴が短く脚が長い」比率になる（主にボス向けの見た目調整）
        const hipLiftPx = Number.isFinite(options.hipLiftPx) ? options.hipLiftPx : 0;
        if (hipLiftPx !== 0) {
            hipY -= hipLiftPx;
        }

        let currentTorsoLean = isNinNinPose ? dir * 0.45 : (isDashLike ? dir * 2.4 : (isRunLike ? dir * 1.6 : dir * 0.45));
        if (comboStepPose === 1) currentTorsoLean = dir * 0.24;
        if (comboStepPose === 2) {
            const cutT = Math.max(0, Math.min(1, (comboPoseProgress - 0.34) / 0.52));
            const cutEase = cutT * cutT * (3 - 2 * cutT);
            currentTorsoLean = dir * (-0.1 + cutEase * 0.5); // 溜め時はほぼ直立、斬り上げで微前傾
        }
        let torsoShoulderX = centerX + (isCrouchPose ? dir * 4.0 : currentTorsoLean) + dir * crouchLeanShift;
        let torsoHipX = isCrouchPose
            ? (centerX + dir * 1.3 + dir * crouchLeanShift * 0.55)
            : (centerX + dir * 0.2);
        let headCenterX = centerX;
        let headSpinAngle = 0;
        const baseTorsoShoulderXForHeadTrack = torsoShoulderX;
        let dualZShoulderDepth = 0;
        let dualZHipDepth = 0;
        let dualZHeadParallax = 0;

        {
            // 通常ポーズ計算（攻撃・武器・移動など）
            if (isSpearThrustPose) {
                const spearWindup = Math.max(0, 1 - (spearPoseProgress / 0.34));
                const spearLungeT = Math.max(0, Math.min(1, (spearPoseProgress - 0.16) / 0.62));
                const spearLunge = Math.sin(spearLungeT * Math.PI * 0.5);
                torsoShoulderX += dir * (2.8 + spearLunge * 5.6 - spearWindup * 1.1);
                torsoHipX += dir * (0.9 + spearLunge * 2.2 - spearWindup * 0.5);
                headCenterX += dir * (1.2 + spearLunge * 2.8);
            }
            if (isDualZComboPose && dualZPose) {
                const p = dualZPose.progress || 0;
                const s = dualZPose.comboIndex || 0;
                const wave = Math.sin(p * Math.PI);
                const twist = Math.sin(p * Math.PI * 2);
                if (s === 1) {
                    // 1撃目: 前のめりではなく、二刀流アイドルの見得を残したまま軽く画面側へ開く
                    headY -= 0.72 + wave * 0.62;
                    bodyTopY -= 0.58 + wave * 0.46;
                    hipY -= 0.18 + wave * 0.2;
                    torsoShoulderX += dir * (0.42 + wave * 0.88);
                    torsoHipX += dir * (0.12 + wave * 0.3);
                    headCenterX -= dir * (0.12 + wave * 0.18);
                    dualZShoulderDepth = 1.05 + wave * 0.18;
                    dualZHipDepth = 0.72 + wave * 0.12;
                    dualZHeadParallax = 0.24 + wave * 0.08;
                } else if (s === 2) {
                    // 2撃目: 肩を大きく返し、腰は逆へ残して体幹で打ち分ける
                    headY -= 0.52 + wave * 0.96;
                    bodyTopY -= 0.36 + wave * 0.74;
                    hipY -= 0.12 + wave * 0.22;
                    torsoShoulderX -= dir * (1.9 + wave * 2.5);
                    torsoHipX += dir * (0.16 + wave * 0.44);
                    headCenterX -= dir * (0.72 + wave * 0.34);
                    dualZShoulderDepth = 1.88 + wave * 0.42;
                    dualZHipDepth = 1.18 + wave * 0.24;
                    dualZHeadParallax = 0.42 + wave * 0.14;
                } else if (s === 3) {
                    // 3撃目: 腰から踏み替えて胸ごと前へ出し、全身で抜ける
                    headY -= 0.6 + wave * 0.78;
                    bodyTopY -= 0.4 + wave * 0.56;
                    hipY -= 0.16 + wave * 0.22;
                    torsoShoulderX += dir * (1.34 + twist * 3.0);
                    torsoHipX -= dir * (1.04 + wave * 1.12);
                    headCenterX += dir * (0.42 + twist * 0.36);
                    dualZShoulderDepth = 2.0 + wave * 0.3;
                    dualZHipDepth = 1.42 + wave * 0.24;
                    dualZHeadParallax = 0.46 + wave * 0.12;
                } else if (s === 4) {
                    // 四段: 上昇しながら海老反りへ。終端で胸を開き、剣をクロスできる体幹を作る
                    const rise = Math.max(0, Math.min(1, p / 0.74));
                    const arch = Math.max(0, Math.min(1, (p - 0.74) / 0.26));
                    const riseEase = rise * rise * (3 - 2 * rise);
                    const archEase = arch * arch * (3 - 2 * arch);
                    headY -= 1.2 + riseEase * 3.6 + archEase * 2.5;
                    bodyTopY -= 1.0 + riseEase * 2.9 + archEase * 1.9;
                    hipY -= 0.35 + riseEase * 1.2;
                    torsoShoulderX += dir * (1.1 + riseEase * 2.8 - archEase * 2.6 + twist * 0.45);
                    torsoHipX += dir * (0.25 + riseEase * 0.95 + archEase * 0.7);
                    headCenterX -= dir * archEase * 1.9;
                    dualZShoulderDepth = 1.34 + riseEase * 0.28 + archEase * 0.24;
                    dualZHipDepth = 0.96 + riseEase * 0.2 + archEase * 0.16;
                    dualZHeadParallax = 0.3 + archEase * 0.18;
                } else {
                    // 五段: 海老反りから一気に叩きつけ。開始時クロス、終盤で左右に開く
                    const dive = p * p * (3 - 2 * p);
                    const smash = Math.max(0, Math.min(1, (p - 0.22) / 0.78));
                    const smashEase = smash * smash * (3 - 2 * smash);
                    headY -= 4.6 - dive * 3.0;
                    bodyTopY -= 3.4 - dive * 2.4;
                    torsoShoulderX += dir * (0.9 + smashEase * 2.2);
                    torsoHipX += dir * (0.28 + smashEase * 1.25);
                    dualZShoulderDepth = 1.08 + smashEase * 0.24;
                    dualZHipDepth = 0.82 + smashEase * 0.18;
                    dualZHeadParallax = 0.24 + smashEase * 0.08;
                }
            }
            if (isDualZComboPose) {
                // 二刀Z中は頭を胴体の肩位置へ追従させ、首が常に接続されるようにする
                const shoulderShiftX = torsoShoulderX - baseTorsoShoulderXForHeadTrack;
                headCenterX += shoulderShiftX * 0.72;
                bodyTopY = headY + (isCrouchPose ? headRadius * 1.01 : headRadius * 1.03);
            }
            if (isSpearThrustPose) {
                // 大槍中は頭を胴（肩）移動へ追従させ、首元のズレを防ぐ
                const shoulderShiftX = torsoShoulderX - baseTorsoShoulderXForHeadTrack;
                const targetHeadX = centerX + shoulderShiftX * 0.86;
                headCenterX += (targetHeadX - headCenterX) * 0.92;
            }
            if (comboAttackingPose && this.currentAttack && this.currentAttack.comboStep === 4) {
                const comboDuration = Math.max(1, this.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                const comboProgress = Math.max(0, Math.min(1, 1 - (this.attackTimer / comboDuration)));
                const riseT = Math.min(1, comboProgress / 0.42);
                const flipT = Math.max(0, Math.min(1, (comboProgress - 0.42) / 0.58));
                const flipEase = flipT * flipT * (3 - 2 * flipT);
                const riseEase = riseT * riseT * (3 - 2 * riseT);
                const riseLift = Math.sin(riseEase * Math.PI * 0.5) * 8.9 * 0.78;
                if (flipT <= 0.0001) {
                    // 上昇区間は回転を入れず、三段目終端から自然に持ち上がる姿勢を維持
                    hipY -= riseLift * 0.46;
                    bodyTopY -= riseLift * 0.96;
                    headY -= riseLift * 1.08;
                    torsoShoulderX -= dir * (riseEase * 0.5);
                    torsoHipX -= dir * (riseEase * 0.35);
                    headSpinAngle = 0;
                } else {
                    // 後半で「後方宙返り1回転」を行う
                    const flipAngle = -Math.PI * 2 * flipEase;
                    const axisX = Math.sin(flipAngle) * dir;
                    const axisY = Math.cos(flipAngle);
                    const normalX = Math.cos(flipAngle) * dir;
                    const normalY = -Math.sin(flipAngle);
                    headSpinAngle = flipAngle;
                    const torsoHalfLen = 9.9;
                    const torsoMidX = centerX - dir * (0.8 + flipEase * 9.6);
                    const torsoMidY = (headY + 9.9) - riseLift + Math.sin(flipEase * Math.PI) * 0.58;
                    torsoShoulderX = torsoMidX - axisX * torsoHalfLen;
                    bodyTopY = torsoMidY - axisY * torsoHalfLen;
                    torsoHipX = torsoMidX + axisX * torsoHalfLen;
                    hipY = torsoMidY + axisY * torsoHalfLen;
                    // 頭は首方向へ追従。完全固定せず少し遊ばせる
                    const neckDist = 7.6;
                    headCenterX = torsoShoulderX - axisX * neckDist + normalX * 0.22;
                    headY = bodyTopY - axisY * neckDist + normalY * 0.14;
                }
            }
        }

        // 頭位置補正は首元(胴体上端)も同時に追従させ、接続が切れないようにする
        if (!isCrouchPose) {
            const headLift = 3.2;
            headY -= headLift;
            bodyTopY -= headLift;
        }

        // 肩アンカーを胴体ライン上に固定し、腕の付け根が肩から自然に繋がるようにする
        const shoulderAttachT = isCrouchPose ? 0.12 : 0.15;
        const shoulderAnchorX = torsoShoulderX + (torsoHipX - torsoShoulderX) * shoulderAttachT;
        const shoulderAnchorY = bodyTopY + (hipY - bodyTopY) * (isCrouchPose ? 0.09 : 0.11);
        let leftShoulderXShared = shoulderAnchorX + dir * 0.18;
        let leftShoulderYShared = shoulderAnchorY + (isCrouchPose ? 0.35 : 0.45);
        let rightShoulderXShared = shoulderAnchorX - dir * (isCrouchPose ? 0.28 : 0.38);
        let rightShoulderYShared = shoulderAnchorY + (isCrouchPose ? 0.55 : 0.65);
        if (isDualZComboPose) {
            // 二刀流通常コンボでも、合体技に近い前後差を肩・胸に残して2.5D感を出す
            leftShoulderXShared += dir * (0.26 + dualZShoulderDepth * 0.34);
            leftShoulderYShared -= dualZShoulderDepth * (isCrouchPose ? 0.2 : 0.28);
            rightShoulderXShared -= dir * (0.34 + dualZShoulderDepth * 0.52);
            rightShoulderYShared += dualZShoulderDepth * (isCrouchPose ? 0.26 : 0.34);
            headCenterX -= dir * dualZHeadParallax;
            torsoHipX -= dir * dualZHipDepth * 0.12;
        }
        const idleArmWave = Math.sin(this.motionTime * 0.01);
        const singleKatanaLeftHandXShared = centerX + dir * (isCrouchPose ? 11.5 : 14.0);
        const singleKatanaLeftHandYShared = leftShoulderYShared + (isCrouchPose ? 6.2 : 7.8) + idleArmWave * (isCrouchPose ? 0.8 : 1.7);
        // 真のアイドル基準は片刀構え。二刀流の右手だけ別基準にする
        const dualWieldRightHandXShared = centerX - dir * (isCrouchPose ? 4.6 : 7.2);
        const dualWieldRightHandYShared = rightShoulderYShared + (isCrouchPose ? 6.8 : 8.5) + Math.sin(this.motionTime * 0.01 + 0.5) * (isCrouchPose ? 0.8 : 1.7);
        const armReachScale = Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0;
        const stretchFromShoulder = (shoulderX, shoulderY, targetX, targetY) => {
            if (Math.abs(armReachScale - 1.0) < 0.001) return { x: targetX, y: targetY };
            return {
                x: shoulderX + (targetX - shoulderX) * armReachScale,
                y: shoulderY + (targetY - shoulderY) * armReachScale
            };
        };
        const getSingleKatanaIdleHandPose = (reachScale = armReachScale) => {
            const projectHand = (shoulderX, shoulderY, targetX, targetY) => {
                if (Math.abs(reachScale - 1.0) < 0.001) return { x: targetX, y: targetY };
                return {
                    x: shoulderX + (targetX - shoulderX) * reachScale,
                    y: shoulderY + (targetY - shoulderY) * reachScale
                };
            };
            const clampReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
                const dx = targetX - shoulderX;
                const dy = targetY - shoulderY;
                const dist = Math.hypot(dx, dy);
                if (dist <= maxLen || dist === 0) return { x: targetX, y: targetY };
                const ratio = maxLen / dist;
                return { x: shoulderX + dx * ratio, y: shoulderY + dy * ratio };
            };
            const leftShoulderX = leftShoulderXShared;
            const leftShoulderY = leftShoulderYShared;
            const rightShoulderX = rightShoulderXShared;
            const rightShoulderY = rightShoulderYShared;
            const leftHand = projectHand(
                leftShoulderX,
                leftShoulderY,
                singleKatanaLeftHandXShared,
                singleKatanaLeftHandYShared
            );
            const bladeAngle = isCrouchPose ? -0.32 : -0.65;
            const bladeDirX = Math.cos(bladeAngle) * dir;
            const bladeDirY = Math.sin(bladeAngle);
            const perpX = -bladeDirY;
            const perpY = bladeDirX;
            const rightHand = clampReach(
                rightShoulderX,
                rightShoulderY,
                leftHand.x - bladeDirX * 5.8 + perpX * 1.0,
                leftHand.y - bladeDirY * 5.8 + perpY * 1.0,
                22 * reachScale
            );
            return {
                leftShoulderX,
                leftShoulderY,
                rightShoulderX,
                rightShoulderY,
                leftHand,
                rightHand,
                bladeAngle
            };
        };

        // 通常の腕・武器描画

        // 通常構え時の「奥の手」は胴体・頭より先に描いて背面化する
        const dualBladePre = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverridePre = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const effectiveSubWeaponTimerPre = (dualBladePre && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
            ? (dualPoseOverridePre && Number.isFinite(dualPoseOverridePre.attackTimer)
                ? dualPoseOverridePre.attackTimer
                : dualBladePre.attackTimer)
            : this.subWeaponTimer;
        const isActuallyAttackingPre = visualIsAttacking || (effectiveSubWeaponTimerPre > 0 && subWeaponAction !== 'throw');
        const isIdleForceRenderPre = forceSubWeaponRender && !subWeaponAction && subWeaponTimer <= 0;
        const kusaKeepIdleBackArm =
            !visualIsAttacking &&
            effectiveSubWeaponTimerPre > 0 &&
            subWeaponAction === '鎖鎌';
        const renderIdleBackArmBehind = isNinNinPose || (
            kusaKeepIdleBackArm ||
            (!isActuallyAttackingPre && (!forceSubWeaponRender || isIdleForceRenderPre))
        );
        if (renderIdleBackArmBehind) {
            const singleKatanaIdlePosePre = getSingleKatanaIdleHandPose(
                Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0
            );
            const leftShoulderXPre = singleKatanaIdlePosePre.leftShoulderX;
            const leftShoulderYPre = singleKatanaIdlePosePre.leftShoulderY;
            const handRadiusScalePre = 0.94;
            const insetAlongSegmentPre = (fromX, fromY, toX, toY, insetPx = 0) => {
                if (insetPx <= 0) return { x: fromX, y: fromY };
                const dx = toX - fromX;
                const dy = toY - fromY;
                const len = Math.hypot(dx, dy);
                if (len <= 0.0001) return { x: fromX, y: fromY };
                const t = Math.min(1, insetPx / len);
                return { x: fromX + dx * t, y: fromY + dy * t };
            };
            const idleLeftHandPre = singleKatanaIdlePosePre.leftHand;
            const preArmDX = idleLeftHandPre.x - leftShoulderXPre;
            const preArmDY = idleLeftHandPre.y - leftShoulderYPre;
            const preArmDist = Math.hypot(preArmDX, preArmDY);
            let preElbowX = leftShoulderXPre + preArmDX * 0.54;
            let preElbowY = leftShoulderYPre + preArmDY * 0.54;
            if (preArmDist > 0.001) {
                const preNX = -preArmDY / preArmDist;
                const preNY = preArmDX / preArmDist;
                const preBendScale = isCrouchPose ? 0.11 : 0.15;
                const preBend = preArmDist * preBendScale;
                preElbowX += preNX * preBend * dir;
                preElbowY += preNY * preBend * dir + 0.25;
        }
        const idleLeftBladeAnglePre = isCrouchPose ? -0.32 : -0.65;
	        if (alpha > 0) {
	            const preArmStart = insetAlongSegmentPre(leftShoulderXPre, leftShoulderYPre, preElbowX, preElbowY, 1.2);
	            if (silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = 4.8 + outlineExpand;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(preArmStart.x, preArmStart.y);
                ctx.lineTo(preElbowX, preElbowY);
                ctx.lineTo(idleLeftHandPre.x, idleLeftHandPre.y);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = 4.8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(leftShoulderXPre, leftShoulderYPre);
            ctx.lineTo(preElbowX, preElbowY);
            ctx.lineTo(idleLeftHandPre.x, idleLeftHandPre.y);
            ctx.stroke();
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(idleLeftHandPre.x, idleLeftHandPre.y, 4.8 * handRadiusScalePre, 0, Math.PI * 2);
            ctx.fill();
	            if (!isNinNinPose) {
	                this.drawKatana(ctx, idleLeftHandPre.x, idleLeftHandPre.y, idleLeftBladeAnglePre, dir);
	            }
	        }
	        }
	        
	        const drawTorsoSegment = (withOutline = true, alphaVal = alpha) => {
            if (alphaVal <= 0) return;
            // 将軍等のパーツ差し替えフック
            if (typeof options.drawTorsoOverride === 'function') {
                options.drawTorsoOverride(ctx, {
                    torsoShoulderX, bodyTopY, torsoHipX, hipY, dir,
                    silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor,
                    outlineExpand, withOutline, alpha: alphaVal
                });
                return;
            }
            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = 10 + outlineExpand;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(torsoShoulderX, bodyTopY);
                ctx.lineTo(torsoHipX, hipY);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(torsoShoulderX, bodyTopY);
            ctx.lineTo(torsoHipX, hipY);
            ctx.stroke();
        };

        // 足
        const backLegOverlayQueue = [];
        const drawJointedLeg = (
            hipX,
            hipYLocal,
            kneeX,
            kneeY,
            footX,
            footY,
            isFrontLeg = false,
            bendBias = 1,
            bendDirSign = null,
            storeForOverlay = true,
            overlayInFront = null,
            withOutline = true
        ) => {
            if (alpha <= 0) return;
            const defaultOverlayInFront = ((hipX - torsoHipX) * dir) <= 0;
            const willOverlay = storeForOverlay && (overlayInFront === null ? defaultOverlayInFront : overlayInFront);

            // 将軍などの特殊パーツ用オーバーライドフック
            if (typeof options.drawLegOverride === 'function') {
                if (options.drawLegOverride(ctx, {
                    hipX, hipYLocal, kneeX, kneeY, footX, footY,
                    isFrontLeg, bendBias, bendDirSign, storeForOverlay,
                    withOutline, alpha, dir,
                    silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand
                })) {
                    // カスタム描画が実行された場合、後段オーバーレイのためにキューへ登録してスキップ
                    if (willOverlay) {
                        backLegOverlayQueue.push([hipX, hipYLocal, kneeX, kneeY, footX, footY, isFrontLeg, bendBias, bendDirSign]);
                    }
                    return;
                }
            }

            if (willOverlay) {
                backLegOverlayQueue.push([hipX, hipYLocal, kneeX, kneeY, footX, footY, isFrontLeg, bendBias, bendDirSign]);
            }
            const thighWidth = isFrontLeg ? 4.8 : 4.6;
            const shinWidth = isFrontLeg ? 4.8 : 4.6;
            // 膝丸は脚線幅を超過させない（接続を真っ直ぐ見せる）
            const kneeRadius = Math.min(thighWidth, shinWidth) * 0.5;
            // 脚の付け根を胴体下端へ寄せて接続を自然にし、腿長をやや短くする
            const hipAttachBlendY = isCrouchPose ? 0.18 : 0.1;
            // 付け根が胴体へめり込まないよう、わずかに外側へ逃がす
            const hipOutSign = (hipX >= torsoHipX) ? 1 : -1;
            const hipRootX = hipX + hipOutSign * 1.05;
            // Yは胴体下端寄りへ固定して、付け根接続を明確化
            const hipRootY = hipY + (hipYLocal - hipY) * hipAttachBlendY;
            // 腿の長さは通常寄りに戻す
            const thighScale = 1.0;
            let kneeAdjX = hipRootX + (kneeX - hipRootX) * thighScale;
            // 通常時は膝を少し下げる。1撃目開始直後のみ段差が出ないよう補間する
            let kneeYOffset = 0.35;
            if (comboAttackingPose) {
                if (comboStepPose === 1) {
                    const startBlend = Math.max(0, Math.min(1, comboPoseProgress / 0.28));
                    const startEase = startBlend * startBlend * (3 - 2 * startBlend);
                    kneeYOffset = 0.35 * (1 - startEase);
                } else {
                    kneeYOffset = 0;
                }
            }
            let kneeAdjY = hipRootY + (kneeY - hipRootY) * thighScale + kneeYOffset;
            const legDX = footX - hipRootX;
            const legDY = footY - hipRootY;
            const legLen = Math.max(0.001, Math.hypot(legDX, legDY));
            const legUX = legDX / legLen;
            const legUY = legDY / legLen;
            const normalX = -legUY;
            const normalY = legUX;
            const kneeProj = (kneeAdjX - hipRootX) * legUX + (kneeAdjY - hipRootY) * legUY;
            const kneeOnLineX = hipRootX + legUX * kneeProj;
            const kneeOnLineY = hipRootY + legUY * kneeProj;
            const signedBend = (kneeAdjX - kneeOnLineX) * normalX + (kneeAdjY - kneeOnLineY) * normalY;
            const minBend = (isFrontLeg ? 2.35 : 2.05) * Math.max(0, bendBias);
            if (alpha > 0) {
                ctx.strokeStyle = silhouetteColor;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                const footRadius = isFrontLeg ? 1.9 : 1.65;
                const footCenterX = footX;
                const footCenterY = footY + 0.22;
                if (withOutline && silhouetteOutlineEnabled) {
                    const legRootInset = isFrontLeg ? 0.95 : 0.75;
                    const legStart = (() => {
                        const dx = kneeAdjX - hipRootX;
                        const dy = kneeAdjY - hipRootY;
                        const len = Math.hypot(dx, dy);
                        if (len <= 0.0001) return { x: hipRootX, y: hipRootY };
                        const t = Math.min(1, legRootInset / len);
                        return { x: hipRootX + dx * t, y: hipRootY + dy * t };
                    })();
                    ctx.strokeStyle = silhouetteOutlineColor;
                    ctx.lineWidth = shinWidth + outlineExpand;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(legStart.x, legStart.y);
                    ctx.lineTo(kneeAdjX, kneeAdjY);
                    ctx.lineTo(footCenterX, footCenterY);
                    ctx.stroke();
                }
                ctx.strokeStyle = silhouetteColor;
                ctx.lineWidth = thighWidth;
                ctx.beginPath();
                ctx.moveTo(hipRootX, hipRootY);
                ctx.lineTo(kneeAdjX, kneeAdjY);
                ctx.stroke();
                ctx.lineWidth = shinWidth;
                ctx.beginPath();
                ctx.moveTo(kneeAdjX, kneeAdjY);
                ctx.lineTo(footCenterX, footCenterY);
                ctx.stroke();
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(kneeAdjX, kneeAdjY, kneeRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(footCenterX, footCenterY, footRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        if (useDualZCustomLegPose && isDualZComboPose && dualZPose && !isSpearThrustPose && !isCrouchPose) {
            const comboStep = dualZPose.comboIndex || 0;
            const comboProgress = dualZPose.progress || 0;
            const comboArc = Math.sin(comboProgress * Math.PI);
            const airborneLift = (!this.isGrounded ? 4.2 : 0) + ((comboStep === 4 || comboStep === 0) ? comboArc * 3.4 : 0);
            const hipLocalY = hipY - airborneLift;
            const leftHipX = torsoHipX + dir * 1.2;
            const rightHipX = torsoHipX - dir * 1.0;
            let leftKneeX = leftHipX + dir * 0.9;
            let leftKneeY = hipLocalY + 9.3;
            let leftFootX = centerX + dir * 2.9;
            let leftFootY = bottomY - 0.3 - airborneLift * 0.48;
            let rightKneeX = rightHipX + dir * 0.8;
            let rightKneeY = hipLocalY + 9.1;
            let rightFootX = centerX - dir * 2.7;
            let rightFootY = bottomY - 0.2 - airborneLift * 0.44;
            if (comboStep === 1) {
                leftKneeX = leftHipX + dir * (0.45 + comboArc * 0.24); leftKneeY = hipLocalY + 9.1 - comboArc * 0.18; leftFootX = centerX - dir * (2.4 + comboArc * 0.6); leftFootY = bottomY - 0.22 - airborneLift * 0.2; rightKneeX = rightHipX + dir * (0.95 + comboArc * 0.42); rightKneeY = hipLocalY + 8.9 - comboArc * 0.2; rightFootX = centerX + dir * (3.0 + comboArc * 1.0); rightFootY = bottomY - 0.38 - airborneLift * 0.22;
            } else if (comboStep === 2) {
                leftKneeX = leftHipX - dir * (2.5 + comboArc * 1.6); leftKneeY = hipLocalY + 8.3 - comboArc * 1.0; leftFootX = centerX - dir * (7.4 + comboArc * 2.8); leftFootY = bottomY - 1.0 - airborneLift * 0.36; rightKneeX = rightHipX + dir * (2.1 + comboArc * 1.2); rightKneeY = hipLocalY + 8.4 - comboArc * 0.8; rightFootX = centerX + dir * (6.2 + comboArc * 2.2); rightFootY = bottomY - 0.8 - airborneLift * 0.32;
            } else if (comboStep === 3) {
                leftKneeX = leftHipX - dir * (0.8 - comboArc * 3.2); leftKneeY = hipLocalY + 8.6 - comboArc * 1.4; leftFootX = centerX - dir * (1.8 - comboArc * 7.2); leftFootY = bottomY - 0.9 - airborneLift * 0.4; rightKneeX = rightHipX + dir * (3.4 + comboArc * 2.4); rightKneeY = hipLocalY + 7.9 - comboArc * 1.2; rightFootX = centerX + dir * (5.4 + comboArc * 8.8); rightFootY = bottomY - 1.2 - airborneLift * 0.42;
            } else if (comboStep === 4) {
                leftKneeX = leftHipX - dir * (0.8 + comboArc * 1.7); leftKneeY = hipLocalY + 8.0 - comboArc * 2.7; leftFootX = centerX - dir * (4.8 + comboArc * 5.4); leftFootY = bottomY - 1.2 - airborneLift * 0.74 - comboArc * 1.2; rightKneeX = rightHipX + dir * (0.5 + comboArc * 0.7); rightKneeY = hipLocalY + 7.8 - comboArc * 2.5; rightFootX = centerX + dir * (1.8 + comboArc * 3.2); rightFootY = bottomY - 1.4 - airborneLift * 0.72 - comboArc * 1.3;
            } else if (comboStep === 0) {
                leftKneeX = leftHipX - dir * (2.2 - comboArc * 3.0); leftKneeY = hipLocalY + 7.8 + comboArc * 2.3; leftFootX = centerX - dir * (7.8 - comboArc * 12.0); leftFootY = bottomY - 1.8 + comboArc * 2.0 - airborneLift * 0.68; rightKneeX = rightHipX - dir * (1.1 - comboArc * 3.4); rightKneeY = hipLocalY + 7.6 + comboArc * 2.4; rightFootX = centerX - dir * (4.9 - comboArc * 11.2); rightFootY = bottomY - 1.9 + comboArc * 2.1 - airborneLift * 0.7;
            }
            // 二刀Z中の脚重ね順は固定: 後ろ足を手前、前足を奥
            drawJointedLeg(leftHipX, hipLocalY + 0.3, leftKneeX, leftKneeY, leftFootX, leftFootY, false, 1.1, null, true, true);
            drawJointedLeg(rightHipX, hipLocalY + 0.1, rightKneeX, rightKneeY, rightFootX, rightFootY, true, 1.08, null, true, false);
        } else if (comboAttackingPose && !isSpearThrustPose && !isCrouchPose) {
            const attack = comboPoseAttack || currentAttack || this.currentAttack;
            if (!attack) { this.x = originalX; this.y = originalY; ctx.restore(); return; }
            const comboStep = attack.comboStep || 1;
            const comboProgress = (comboStep === 5 && comboStep5RecoveryActive)
                ? 1
                : comboPoseProgress;
            const comboArc = Math.sin(comboProgress * Math.PI);
            const baseLift = Math.max(0, Math.min(1, Math.abs(vx) / 14));
            const airborneLift = !isGrounded ? 4.8 + baseLift * 4.4 : 0;
            const hipLocalY = hipY - airborneLift;
            const leftHipX = torsoHipX + dir * 1.3;
            const rightHipX = torsoHipX - dir * 1.2;
            let leftKneeX = leftHipX + dir * 0.8, leftKneeY = hipLocalY + 10.1, leftFootX = centerX + dir * 2.6, leftFootY = bottomY + 0.2 - airborneLift * 0.55;
            let rightKneeX = rightHipX + dir * 0.9, rightKneeY = hipLocalY + 9.5, rightFootX = centerX - dir * 3.0, rightFootY = bottomY - 0.2 - airborneLift * 0.52;
            if (comboStep === 2) {
                // 2撃目: 初期→踏み込み→終端を単調補間してブレを防ぐ
                const smooth = (t) => t * t * (3 - 2 * t);
                const lerp = (a, b, t) => a + (b - a) * t;
                const blendPose = (a, b, t) => ({
                    leftKneeX: lerp(a.leftKneeX, b.leftKneeX, t),
                    leftKneeY: lerp(a.leftKneeY, b.leftKneeY, t),
                    leftFootX: lerp(a.leftFootX, b.leftFootX, t),
                    leftFootY: lerp(a.leftFootY, b.leftFootY, t),
                    rightKneeX: lerp(a.rightKneeX, b.rightKneeX, t),
                    rightKneeY: lerp(a.rightKneeY, b.rightKneeY, t),
                    rightFootX: lerp(a.rightFootX, b.rightFootX, t),
                    rightFootY: lerp(a.rightFootY, b.rightFootY, t)
                });
                const startPose = {
                    // 一段目終端の姿勢からそのまま開始
                    leftKneeX: leftHipX - dir * 2.0,
                    leftKneeY: hipLocalY + 8.8,
                    leftFootX: centerX - dir * 5.2,
                    leftFootY: bottomY - 0.88 - airborneLift * 0.5,
                    rightKneeX: rightHipX + dir * 3.4,
                    rightKneeY: hipLocalY + 9.08,
                    rightFootX: centerX + dir * 8.7,
                    rightFootY: bottomY - 0.5 - airborneLift * 0.48
                };
                const drivePose = {
                    leftKneeX: leftHipX + dir * 3.5,
                    leftKneeY: hipLocalY + 8.8,
                    leftFootX: centerX + dir * 9.4,
                    leftFootY: bottomY - 0.86 - airborneLift * 0.46,
                    rightKneeX: rightHipX - dir * 3.4,
                    rightKneeY: hipLocalY + 8.4,
                    rightFootX: centerX - dir * 9.1,
                    rightFootY: bottomY - 1.18 - airborneLift * 0.46
                };
                const settlePose = {
                    leftKneeX: leftHipX + dir * 2.8,
                    leftKneeY: hipLocalY + 8.95,
                    leftFootX: centerX + dir * 8.0,
                    leftFootY: bottomY - 0.84 - airborneLift * 0.46,
                    rightKneeX: rightHipX - dir * 2.7,
                    rightKneeY: hipLocalY + 8.55,
                    rightFootX: centerX - dir * 7.3,
                    rightFootY: bottomY - 1.08 - airborneLift * 0.46
                };
                const driveT = smooth(Math.max(0, Math.min(1, comboProgress / 0.72)));
                const settleT = smooth(Math.max(0, Math.min(1, (comboProgress - 0.84) / 0.16)));
                const driven = blendPose(startPose, drivePose, driveT);
                const posed = blendPose(driven, settlePose, settleT);
                leftKneeX = posed.leftKneeX;
                leftKneeY = posed.leftKneeY;
                leftFootX = posed.leftFootX;
                leftFootY = posed.leftFootY;
                rightKneeX = posed.rightKneeX;
                rightKneeY = posed.rightKneeY;
                rightFootX = posed.rightFootX;
                rightFootY = posed.rightFootY;
            } else if (comboStep === 1) {
                // 1撃目（左刀・袈裟斬り）: idle -> slash -> idle の2段補間で、前後の接続を自然化
                const smooth = (t) => t * t * (3 - 2 * t);
                const lerp = (a, b, t) => a + (b - a) * t;
                const blendPose = (a, b, t) => ({
                    leftKneeX: lerp(a.leftKneeX, b.leftKneeX, t),
                    leftKneeY: lerp(a.leftKneeY, b.leftKneeY, t),
                    leftFootX: lerp(a.leftFootX, b.leftFootX, t),
                    leftFootY: lerp(a.leftFootY, b.leftFootY, t),
                    rightKneeX: lerp(a.rightKneeX, b.rightKneeX, t),
                    rightKneeY: lerp(a.rightKneeY, b.rightKneeY, t),
                    rightFootX: lerp(a.rightFootX, b.rightFootX, t),
                    rightFootY: lerp(a.rightFootY, b.rightFootY, t)
                });
                const idlePhase = Math.sin(this.motionTime * 0.0042);
                const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                const idlePose = {
                    leftKneeX: leftHipX + dir * 0.55,
                    leftKneeY: hipLocalY + 9.9,
                    leftFootX: centerX + dir * idleSpread,
                    leftFootY: bottomY + 0.1 - airborneLift * 0.14,
                    rightKneeX: rightHipX + dir * 0.6,
                    rightKneeY: hipLocalY + 9.6,
                    rightFootX: centerX - dir * idleSpread,
                    rightFootY: bottomY - 0.1 - airborneLift * 0.14
                };
                const slashPose = {
                    leftKneeX: leftHipX - dir * 2.05,
                    leftKneeY: hipLocalY + 8.85,
                    leftFootX: centerX - dir * 5.25,
                    leftFootY: bottomY - 0.88 - airborneLift * 0.5,
                    rightKneeX: rightHipX + dir * 3.45,
                    rightKneeY: hipLocalY + 9.05,
                    rightFootX: centerX + dir * 8.75,
                    rightFootY: bottomY - 0.52 - airborneLift * 0.48
                };
                const comboStepPoseProgress = comboPoseAttack 
                    ? (comboPoseAttack.durationMs > 0 
                        ? clamp01(1 - (attackTimer / comboPoseAttack.durationMs))
                        : 1.0)
                    : 0;

                // 腕と同じ同期変数を使用し、余韻中はポーズを完全に維持（slashT=1.0）
                const slashT = comboStep5RecoveryActive 
                    ? 1.0 
                    : smooth(Math.max(0, Math.min(1, comboStepPoseProgress / 0.28)));
                
                const posed = blendPose(idlePose, slashPose, slashT);
                
                // 腕と全く同じリカバリーブレンド（後半100msで復帰）を脚にも適用
                const finalPose = (comboStep5RecoveryBlend > 0)
                    ? blendPose(posed, idlePose, smooth(comboStep5RecoveryBlend))
                    : posed;

                leftKneeX = finalPose.leftKneeX;
                leftKneeY = finalPose.leftKneeY;
                leftFootX = finalPose.leftFootX;
                leftFootY = finalPose.leftFootY;
                rightKneeX = finalPose.rightKneeX;
                rightKneeY = finalPose.rightKneeY;
                rightFootX = finalPose.rightFootX;
                rightFootY = finalPose.rightFootY;
            }
            else if (comboStep === 3) {
                leftKneeX = leftHipX - dir * (2.6 - comboArc * 1.1);
                leftKneeY = hipLocalY + 8.5 - comboArc * 1.4;
                leftFootX = centerX - dir * (7.2 + comboArc * 2.0);
                leftFootY = bottomY - 0.9 - airborneLift * 0.56;
                rightKneeX = rightHipX + dir * (2.9 - comboArc * 1.0);
                rightKneeY = hipLocalY + 8.2 - comboArc * 1.5;
                rightFootX = centerX + dir * (7.6 + comboArc * 2.2);
                rightFootY = bottomY - 1.2 - airborneLift * 0.56;
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    leftKneeX: leftHipX - dir * 2.2,
                    leftKneeY: hipLocalY + 8.95,
                    leftFootX: centerX - dir * 5.5,
                    leftFootY: bottomY - 0.84 - airborneLift * 0.46,
                    rightKneeX: rightHipX + dir * 3.0,
                    rightKneeY: hipLocalY + 8.55,
                    rightFootX: centerX + dir * 7.5,
                    rightFootY: bottomY - 1.08 - airborneLift * 0.46
                };
                leftKneeX = from.leftKneeX + (leftKneeX - from.leftKneeX) * prepEase;
                leftKneeY = from.leftKneeY + (leftKneeY - from.leftKneeY) * prepEase;
                leftFootX = from.leftFootX + (leftFootX - from.leftFootX) * prepEase;
                leftFootY = from.leftFootY + (leftFootY - from.leftFootY) * prepEase;
                rightKneeX = from.rightKneeX + (rightKneeX - from.rightKneeX) * prepEase;
                rightKneeY = from.rightKneeY + (rightKneeY - from.rightKneeY) * prepEase;
                rightFootX = from.rightFootX + (rightFootX - from.rightFootX) * prepEase;
                rightFootY = from.rightFootY + (rightFootY - from.rightFootY) * prepEase;
            }
            else if (comboStep === 4) {
                const smooth = (t) => t * t * (3 - 2 * t);
                if (comboProgress < 0.42) {
                    const rise = comboProgress / 0.42;
                    const riseEase = smooth(rise);
                    leftKneeX = leftHipX - dir * (2.1 - riseEase * 0.8);
                    leftKneeY = hipLocalY + 8.4 - riseEase * 1.4;
                    leftFootX = centerX - dir * (6.4 - riseEase * 1.2);
                    leftFootY = bottomY - 1.2 - airborneLift * (0.52 + riseEase * 0.12);
                    rightKneeX = rightHipX + dir * (2.6 - riseEase * 0.6);
                    rightKneeY = hipLocalY + 8.1 - riseEase * 1.3;
                    rightFootX = centerX + dir * (6.9 - riseEase * 1.0);
                    rightFootY = bottomY - 1.3 - airborneLift * (0.54 + riseEase * 0.12);
                } else {
                    const flipT = Math.max(0, Math.min(1, (comboProgress - 0.42) / 0.58));
                    const flipEase = smooth(flipT);
                    const flipAngle = -Math.PI * 2 * flipEase;
                    const axisX = Math.sin(flipAngle) * dir;
                    const axisY = Math.cos(flipAngle);
                    const normalX = Math.cos(flipAngle) * dir;
                    const normalY = -Math.sin(flipAngle);
                    const tuck = Math.sin(Math.min(1, flipT / 0.62) * Math.PI);
                    const open = smooth(Math.max(0, Math.min(1, (flipT - 0.68) / 0.32)));
                    const placeFrom = (hipBaseX, hipBaseY, side, down) => ({
                        x: hipBaseX + normalX * side + axisX * down,
                        y: hipBaseY + normalY * side + axisY * down
                    });
                    const leftHipYLocal = hipLocalY + 0.3;
                    const rightHipYLocal = hipLocalY + 0.08;
                    const leftKneeP = placeFrom(
                        leftHipX,
                        leftHipYLocal,
                        -1.6 - tuck * 2.2 + open * 0.7,
                        7.2 - tuck * 3.4 + open * 2.5
                    );
                    const leftFootP = placeFrom(
                        leftHipX,
                        leftHipYLocal,
                        -3.0 - tuck * 3.8 + open * 1.2,
                        14.7 - tuck * 6.6 + open * 5.8
                    );
                    const rightKneeP = placeFrom(
                        rightHipX,
                        rightHipYLocal,
                        1.8 + tuck * 2.0 - open * 0.6,
                        6.9 - tuck * 3.2 + open * 2.4
                    );
                    const rightFootP = placeFrom(
                        rightHipX,
                        rightHipYLocal,
                        3.4 + tuck * 3.5 - open * 1.1,
                        13.9 - tuck * 6.1 + open * 5.4
                    );
                    leftKneeX = leftKneeP.x;
                    leftKneeY = leftKneeP.y;
                    leftFootX = leftFootP.x;
                    leftFootY = leftFootP.y;
                    rightKneeX = rightKneeP.x;
                    rightKneeY = rightKneeP.y;
                    rightFootX = rightFootP.x;
                    rightFootY = rightFootP.y;
                }
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    leftKneeX: leftHipX - dir * 2.6,
                    leftKneeY: hipLocalY + 8.5,
                    leftFootX: centerX - dir * 7.2,
                    leftFootY: bottomY - 0.9 - airborneLift * 0.56,
                    rightKneeX: rightHipX + dir * 2.9,
                    rightKneeY: hipLocalY + 8.2,
                    rightFootX: centerX + dir * 7.6,
                    rightFootY: bottomY - 1.2 - airborneLift * 0.56
                };
                leftKneeX = from.leftKneeX + (leftKneeX - from.leftKneeX) * prepEase;
                leftKneeY = from.leftKneeY + (leftKneeY - from.leftKneeY) * prepEase;
                leftFootX = from.leftFootX + (leftFootX - from.leftFootX) * prepEase;
                leftFootY = from.leftFootY + (leftFootY - from.leftFootY) * prepEase;
                rightKneeX = from.rightKneeX + (rightKneeX - from.rightKneeX) * prepEase;
                rightKneeY = from.rightKneeY + (rightKneeY - from.rightKneeY) * prepEase;
                rightFootX = from.rightFootX + (rightFootX - from.rightFootX) * prepEase;
                rightFootY = from.rightFootY + (rightFootY - from.rightFootY) * prepEase;
            }
            else if (comboStep === 5) {
                if (comboProgress < 0.3) {
                    const t = comboProgress / 0.3;
                    leftKneeX = leftHipX - dir * (1.8 - t * 0.7);
                    leftKneeY = hipLocalY + 8.7 - t * 1.5;
                    leftFootX = centerX - dir * (5.6 - t * 2.2);
                    leftFootY = bottomY - 1.0 - airborneLift * 0.62;
                    rightKneeX = rightHipX + dir * (2.5 - t * 1.2);
                    rightKneeY = hipLocalY + 8.5 - t * 1.5;
                    rightFootX = centerX + dir * (7.1 - t * 2.9);
                    rightFootY = bottomY - 1.1 - airborneLift * 0.64;
                } else if (comboProgress < 0.78) {
                    const t = (comboProgress - 0.3) / 0.48;
                    leftKneeX = leftHipX - dir * (1.1 + t * 1.8);
                    leftKneeY = hipLocalY + 7.2 + t * 2.4;
                    leftFootX = centerX - dir * (3.4 + t * 2.8);
                    leftFootY = bottomY - 2.4 + t * 1.7 - airborneLift * 0.44;
                    rightKneeX = rightHipX + dir * (1.3 + t * 1.2);
                    rightKneeY = hipLocalY + 7.0 + t * 2.5;
                    rightFootX = centerX + dir * (4.4 + t * 1.8);
                    rightFootY = bottomY - 2.6 + t * 1.9 - airborneLift * 0.46;
                } else {
                    const t = (comboProgress - 0.78) / 0.22;
                    leftKneeX = leftHipX - dir * (2.9 - t * 1.6);
                    leftKneeY = hipLocalY + 9.6 - t * 1.4;
                    leftFootX = centerX - dir * (6.2 - t * 2.4);
                    leftFootY = bottomY - 0.6 - airborneLift * 0.22;
                    rightKneeX = rightHipX + dir * (2.7 - t * 1.4);
                    rightKneeY = hipLocalY + 9.3 - t * 1.3;
                    rightFootX = centerX + dir * (6.0 - t * 2.2);
                    rightFootY = bottomY - 0.7 - airborneLift * 0.22;
                }
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    leftKneeX: leftHipX - dir * 3.6,
                    leftKneeY: hipLocalY + 5.2,
                    leftFootX: centerX - dir * 11.8,
                    leftFootY: bottomY - 2.0 - airborneLift * 0.76,
                    rightKneeX: rightHipX + dir * 1.1,
                    rightKneeY: hipLocalY + 4.7,
                    rightFootX: centerX + dir * 1.8,
                    rightFootY: bottomY - 2.3 - airborneLift * 0.84
                };
                leftKneeX = from.leftKneeX + (leftKneeX - from.leftKneeX) * prepEase;
                leftKneeY = from.leftKneeY + (leftKneeY - from.leftKneeY) * prepEase;
                leftFootX = from.leftFootX + (leftFootX - from.leftFootX) * prepEase;
                leftFootY = from.leftFootY + (leftFootY - from.leftFootY) * prepEase;
                rightKneeX = from.rightKneeX + (rightKneeX - from.rightKneeX) * prepEase;
                rightKneeY = from.rightKneeY + (rightKneeY - from.rightKneeY) * prepEase;
                rightFootX = from.rightFootX + (rightFootX - from.rightFootX) * prepEase;
                rightFootY = from.rightFootY + (rightFootY - from.rightFootY) * prepEase;
                if (comboStep5RecoveryActive) {
                    const recover = comboStep5RecoveryBlend * comboStep5RecoveryBlend * (3 - 2 * comboStep5RecoveryBlend);
                    const idlePhase = Math.sin(this.motionTime * 0.0042);
                    const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                    const idlePose = {
                        leftKneeX: leftHipX + dir * 0.55,
                        leftKneeY: hipLocalY + 9.9,
                        leftFootX: centerX + dir * idleSpread,
                        leftFootY: bottomY + 0.1 - airborneLift * 0.14,
                        rightKneeX: rightHipX + dir * 0.6,
                        rightKneeY: hipLocalY + 9.6,
                        rightFootX: centerX - dir * idleSpread,
                        rightFootY: bottomY - 0.1 - airborneLift * 0.14
                    };
                    leftKneeX += (idlePose.leftKneeX - leftKneeX) * recover;
                    leftKneeY += (idlePose.leftKneeY - leftKneeY) * recover;
                    leftFootX += (idlePose.leftFootX - leftFootX) * recover;
                    leftFootY += (idlePose.leftFootY - leftFootY) * recover;
                    rightKneeX += (idlePose.rightKneeX - rightKneeX) * recover;
                    rightKneeY += (idlePose.rightKneeY - rightKneeY) * recover;
                    rightFootX += (idlePose.rightFootX - rightFootX) * recover;
                    rightFootY += (idlePose.rightFootY - rightFootY) * recover;
                }
            }
            drawJointedLeg(leftHipX, hipLocalY + 0.35, leftKneeX, leftKneeY, leftFootX, leftFootY, false, 1.12);
            drawJointedLeg(rightHipX, hipLocalY + 0.12, rightKneeX, rightKneeY, rightFootX, rightFootY, true, 1.06);
        } else if (isCrouchPose) {
            const crouchStride = crouchWalkPhase * 3.4;
            const crouchLift = Math.abs(crouchWalkPhase) * 1.8;
            const leftHipX = torsoHipX + dir * 1.15; const rightHipX = torsoHipX - dir * 1.35;
            const leftHipYL = hipY + 0.4; const rightHipYL = hipY + 0.2;
            // 膝はhipYからbottomYの範囲に収まるよう clamp する
            const kneeYMax = bottomY - 4;
            const leftKneeY  = Math.min(kneeYMax, hipY + 6.0 + Math.max(0, -crouchWalkPhase) * 1.2);
            const rightKneeY = Math.min(kneeYMax, hipY + 6.4 + Math.max(0,  crouchWalkPhase) * 1.2);
            drawJointedLeg(leftHipX,  leftHipYL,  leftHipX  + dir * (3.0 + crouchStride * 0.5), leftKneeY,  centerX + dir * (6.5 + crouchStride), bottomY - 0.6 + crouchLift * 0.15, false, 1.0);
            drawJointedLeg(rightHipX, rightHipYL, rightHipX - dir * (3.6 - crouchStride * 0.5), rightKneeY, centerX - dir * (7.2 - crouchStride), bottomY - 0.2,                     true,  1.02);
        } else if (isSpearThrustPose) {
            // 横っ飛び: 後ろ足で蹴り、前足を畳む（脚長が伸びすぎない長さ）
            const rearDrive = Math.max(0, Math.sin(Math.max(0, Math.min(1, (spearPoseProgress - 0.16) / 0.62)) * Math.PI * 0.5));
            const hipLocalY = hipY - 0.24 - rearDrive * 0.48;
            const rearHipX = torsoHipX + dir * 0.88;
            const rightHipX2 = torsoHipX + dir * 1.18;

            // 後ろ足: 画像2のように斜め後方へ長く蹴る
            const rearFootX = rearHipX - dir * (14.1 + rearDrive * 3.1);
            const rearFootY = hipLocalY + 12.9 + rearDrive * 0.24;
            // 後ろ足は膝をまっすぐに見せる
            const rearKneeX = rearHipX + (rearFootX - rearHipX) * 0.5;
            const rearKneeY = (hipLocalY + 0.2) + (rearFootY - (hipLocalY + 0.2)) * 0.5;
            // 手前足を前面レイヤーにするため、後ろ足を胴の前へ
            drawJointedLeg(rearHipX, hipLocalY + 0.2, rearKneeX, rearKneeY, rearFootX, rearFootY, false, 0, 1, true, true);

            // 前足: 画像2の曲げ感を維持しつつ、通常脚長に近づける
            const rightKneeX2 = rightHipX2 + dir * (3.95 + rearDrive * 0.6);
            const rightKneeY2 = hipLocalY + 8.7 + rearDrive * 0.24;
            const rightFootX2 = rightHipX2 + dir * (0.22 + rearDrive * 0.1);
            const rightFootY2 = hipLocalY + 16.2 + rearDrive * 0.3;
            drawJointedLeg(rightHipX2, hipLocalY + 0.04, rightKneeX2, rightKneeY2, rightFootX2, rightFootY2, true, 1.22, 1, true, false);
        } else {
            // 空中 or 走り or 待機の足描画
            if (!this.isGrounded) {
                // 画像参照に合わせ、前脚を強めに畳み、後脚はやや後方へ流す空中姿勢
                const drift = Math.max(-1, Math.min(1, this.vx / Math.max(1, this.speed * 1.45)));
                const rise = this.vy < 0 ? Math.min(1, Math.abs(this.vy) / 14) : 0;
                const descend = this.vy > 0 ? Math.min(1, this.vy / 13) : 0;
                const apex = Math.max(0, 1 - Math.min(1, Math.abs(this.vy) / 4.4));
                const tuck = Math.max(rise * 0.74, apex * 0.92) * (1 - descend * 0.26);
                const open = descend * 0.62;
                const settle = Math.max(0, Math.min(1, (descend - 0.28) / 0.72));
                const leftHipX = torsoHipX + dir * 1.28;
                const rightHipX3 = torsoHipX - dir * 1.18;

                // 奥足は曲げ（短め）、手前足は伸ばし（長め）
                let leftKneeX = leftHipX + dir * (2.78 + tuck * 2.25 - open * 1.24) + dir * drift * 0.2;
                let leftKneeY = hipY + 8.25 - tuck * 3.1 + open * 0.9;
                let leftFootX = leftKneeX - dir * (3.22 + tuck * 1.12 - open * 0.58) + dir * drift * 0.1;
                let leftFootY = leftKneeY + 7.02 - tuck * 1.86 + open * 1.62;

                let rightKneeX = rightHipX3 - dir * (2.36 + tuck * 1.7 - open * 0.76) - dir * drift * 0.18;
                let rightKneeY = hipY + 8.88 - tuck * 1.02 + open * 0.98;
                let rightFootX = rightKneeX - dir * (3.72 + tuck * 1.35 - open * 0.62) - dir * drift * 0.02;
                let rightFootY = rightKneeY + 7.28 - tuck * 0.35 + open * 1.82;

                // 接地直前は地上待機姿勢へ自然に戻す
                leftKneeX += (leftHipX + dir * 0.62 - leftKneeX) * (settle * 0.64);
                leftKneeY += (hipY + 9.45 - leftKneeY) * (settle * 0.68);
                leftFootX += (centerX + dir * 1.9 - leftFootX) * (settle * 0.7);
                leftFootY += (bottomY + 0.06 - leftFootY) * (settle * 0.78);
                rightKneeX += (rightHipX3 + dir * 0.64 - rightKneeX) * (settle * 0.64);
                rightKneeY += (hipY + 9.28 - rightKneeY) * (settle * 0.68);
                rightFootX += (centerX - dir * 2.5 - rightFootX) * (settle * 0.7);
                rightFootY += (bottomY - 0.06 - rightFootY) * (settle * 0.78);

                drawJointedLeg(leftHipX, hipY + 0.2, leftKneeX, leftKneeY, leftFootX, leftFootY, false, 0.9);
                drawJointedLeg(rightHipX3, hipY + 0.1, rightKneeX, rightKneeY, rightFootX, rightFootY, true, 1.02);
            } else {
                const runPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
                if (!isRunLike) {
                    const idlePhase = Math.sin(this.motionTime * 0.0042);
                    const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                    const leftHipX = torsoHipX + dir * 1.35; const rightHipX4 = torsoHipX - dir * 1.25;
                    drawJointedLeg(leftHipX, hipY + 0.22, leftHipX + dir * 0.55, hipY + 9.9, centerX + dir * idleSpread, bottomY + 0.1, false, 0.0);
                    drawJointedLeg(rightHipX4, hipY + 0.14, rightHipX4 + dir * 0.6, hipY + 9.6, centerX - dir * idleSpread, bottomY - 0.1, true, 0.18);
                } else {
                    const runBlend = Math.min(1, speedAbs / Math.max(1, this.speed * 1.25));
                    const strideAmp = isDashLike ? 13.8 : 10.4; const liftAmp = isDashLike ? 5.6 : 4.2;
                    const legSpread = 0.8; const baseStepScale = 0.45 + runBlend * 0.88;
                    const legSpanY = bottomY - hipY;
                    const drawGroundLeg = (legSign, isFrontLeg) => {
                        const phase = runPhase * legSign;
                        const forward = phase * strideAmp * baseStepScale;
                        const lift = Math.max(0, -phase) * liftAmp * (0.3 + runBlend * 0.95);
                        const plant = Math.max(0, phase) * (0.72 + runBlend * 0.58);
                        const depthShift = isFrontLeg ? 0 : 0.45;
                        const hipX = torsoHipX + dir * legSign * 0.88;
                        const hipLocalY = hipY + (isFrontLeg ? 0.12 : 0.26);
                        const footX = centerX + dir * (forward + legSign * legSpread);
                        const footY = bottomY - lift + depthShift * 0.25;
                        const kneeX = hipX + dir * (forward * 0.44 + legSign * (legSpread * 0.56 + 0.62));
                        const kneeY = hipY + legSpanY * (0.56 + runBlend * 0.04) - lift * 0.75 + plant * 0.3 + depthShift;
                        drawJointedLeg(hipX, hipLocalY, kneeX, kneeY, footX, footY, isFrontLeg, 0.34);
                    };
                    drawGroundLeg(1, false); drawGroundLeg(-1, true);
                }
            }
        }

        // アイドル時の両手の正確な座標（IK・伸び縮み反映済み）をサブ武器アームアニメーション等で利用するため共有
        const globalIdleLeftHand = getSingleKatanaIdleHandPose().leftHand;
        const globalIdleRightHandForDual = stretchFromShoulder(rightShoulderXShared, rightShoulderYShared, dualWieldRightHandXShared, dualWieldRightHandYShared);
        const globalIdleHands = { left: globalIdleLeftHand, right: globalIdleRightHandForDual };

        // 奥側の腕/武器は描画順だけで胴体の裏へ回す（オクルーダー不使用）
        const dualBladeLayer = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverrideLayer = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const effectiveSubWeaponTimerLayer = (dualBladeLayer && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
            ? (dualPoseOverrideLayer && Number.isFinite(dualPoseOverrideLayer.attackTimer)
                ? dualPoseOverrideLayer.attackTimer
                : dualBladeLayer.attackTimer)
            : this.subWeaponTimer;
        const shouldRenderSubWeaponLayerBack =
            (effectiveSubWeaponTimerLayer > 0 || (forceSubWeaponRender && subWeaponAction)) &&
            !visualIsAttacking &&
            !isNinNinPose;
        if (visualIsAttacking && !isNinNinPose) {
            this.renderAttackArmAndWeapon(ctx, {
                centerX,
                pivotY: bodyTopY + 2,
                facingRight,
                leftShoulderX: leftShoulderXShared,
                leftShoulderY: leftShoulderYShared,
                rightShoulderX: rightShoulderXShared,
                rightShoulderY: rightShoulderYShared,
                supportRightHand: !(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流'),
                layerPhase: 'back'
            }, alpha, {
                ...options,
                attackState: comboVisualAttackState
            });
        }
        if (shouldRenderSubWeaponLayerBack) {
            this.renderSubWeaponArm(
                ctx,
                centerX,
                bodyTopY + 2,
                facingRight,
                renderSubWeaponVisuals,
                alpha,
                {
                    ...options,
                    shoulderAnchors: {
                        leftX: leftShoulderXShared,
                        leftY: leftShoulderYShared,
                        rightX: rightShoulderXShared,
                        rightY: rightShoulderYShared
                    },
                    idleHands: globalIdleHands,
                    layerPhase: 'back'
                }
            );
        }

        // 前足は胴の裏レイヤーに固定するため、脚描画後に胴体を描く
        drawTorsoSegment(true);
        // 後ろ足は胴の前レイヤーにする
        for (const legArgs of backLegOverlayQueue) {
            drawJointedLeg(...legArgs, false, null, false);
        }

        // 脚描画完了後に胴体の上にパーツを重ねるオーバーレイフック（脚付け根を覆う草摺など）
        if (typeof options.drawTorsoOverlayOverride === 'function') {
            options.drawTorsoOverlayOverride(ctx, {
                torsoShoulderX, bodyTopY, torsoHipX, hipY, dir,
                silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor,
                outlineExpand, alpha
            });
        }
        
        const renderHair = options.renderHair !== false;
        const accessoryRoots = this.getAccessoryRootAnchors(headCenterX, headY, headRadius, facingRight, headSpinAngle);
        const hairBaseX = accessoryRoots.hairRootX;
        const hairBaseY = accessoryRoots.hairRootY;
        if (useLiveAccessories) {
            this.syncAccessoryRootNodes(accessoryScarfNodes, accessoryHairNodes, accessoryRoots);
        }
        const sampleHairNode = (index) => {
            if (!accessoryHairNodes || accessoryHairNodes.length === 0) return { x: hairBaseX, y: hairBaseY };
            const maxIndex = accessoryHairNodes.length - 1;
            const clamped = Math.max(0, Math.min(maxIndex, index));
            if (clamped === 0) return { x: hairBaseX, y: hairBaseY };
            const node = accessoryHairNodes[clamped];
            const prev = (clamped === 1)
                ? { x: hairBaseX, y: hairBaseY }
                : accessoryHairNodes[Math.max(0, clamped - 1)];
            const next = accessoryHairNodes[Math.min(maxIndex, clamped + 1)];
            return {
                x: (prev.x + node.x * 2 + next.x) * 0.25,
                y: (prev.y + node.y * 2 + next.y) * 0.25
            };
        };
        const drawHeadSilhouetteWithOutline = () => {
            if (alpha <= 0) return;
            // 将軍等のパーツ差し替えフック
            if (typeof options.drawHeadOverride === 'function') {
                options.drawHeadOverride(ctx, {
                    headCenterX, headY, headRadius, dir,
                    torsoShoulderX, bodyTopY,
                    silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor,
                    outlineExpand, alpha
                });
                return;
            }
            if (silhouetteOutlineEnabled) {
                const TAU = Math.PI * 2;
                const normalizeAngle = (angle) => {
                    let a = angle % TAU;
                    if (a < 0) a += TAU;
                    return a;
                };

                const gaps = [];
                const addGap = (centerAngle, halfSpan) => {
                    if (!Number.isFinite(centerAngle) || halfSpan <= 0) return;
                    let start = normalizeAngle(centerAngle - halfSpan);
                    let end = normalizeAngle(centerAngle + halfSpan);
                    if (start <= end) {
                        gaps.push([start, end]);
                    } else {
                        gaps.push([start, TAU]);
                        gaps.push([0, end]);
                    }
                };

                const neckJoinAngle = Math.atan2(bodyTopY - headY, torsoShoulderX - headCenterX);
                addGap(neckJoinAngle, 0.36);

                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = outlineExpand;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (gaps.length === 0) {
                    ctx.beginPath();
                    ctx.arc(headCenterX, headY, headRadius, 0, TAU, false);
                    ctx.stroke();
                } else {
                    gaps.sort((a, b) => a[0] - b[0]);
                    const merged = [];
                    for (const gap of gaps) {
                        if (merged.length === 0 || gap[0] > merged[merged.length - 1][1]) {
                            merged.push([gap[0], gap[1]]);
                        } else {
                            merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], gap[1]);
                        }
                    }
                    let cursor = 0;
                    for (const [gapStart, gapEnd] of merged) {
                        if (gapStart - cursor > 0.0001) {
                            ctx.beginPath();
                            ctx.arc(headCenterX, headY, headRadius, cursor, gapStart, false);
                            ctx.stroke();
                        }
                        cursor = Math.max(cursor, gapEnd);
                    }
                    if (TAU - cursor > 0.0001) {
                        ctx.beginPath();
                        ctx.arc(headCenterX, headY, headRadius, cursor, TAU, false);
                        ctx.stroke();
                    }
                }
            }
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(headCenterX, headY, headRadius, 0, Math.PI * 2);
            ctx.fill();
        };

        const drawHeadbandBand = () => {
            const renderHeadband = options.renderHeadband !== false;
            if (!renderHeadband || headbandAlpha <= 0) return;
            const bandMaskRadius = Math.max(1, headRadius - 0.05);
            const bandPathRadius = bandMaskRadius + 6 * 0.34; // 6 is PLAYER_HEADBAND_LINE_WIDTH
            const bandBackAngle = (facingRight ? Math.PI * 0.92 : Math.PI * 0.08) + headSpinAngle;
            const bandFrontAngle = (facingRight ? -Math.PI * 0.18 : Math.PI * 1.18) + headSpinAngle;
            const bStartX = headCenterX + Math.cos(bandBackAngle) * bandPathRadius;
            const bStartY = headY + Math.sin(bandBackAngle) * bandPathRadius;
            const bEndX = headCenterX + Math.cos(bandFrontAngle) * bandPathRadius;
            const bEndY = headY + Math.sin(bandFrontAngle) * bandPathRadius;
            const ctrlLocalX = dir * headRadius * 0.02;
            const ctrlLocalY = -headRadius * 0.30;
            const ctrlCos = Math.cos(headSpinAngle);
            const ctrlSin = Math.sin(headSpinAngle);
            const bCtrlX = headCenterX + (ctrlLocalX * ctrlCos - ctrlLocalY * ctrlSin);
            const bCtrlY = headY + (ctrlLocalX * ctrlSin + ctrlLocalY * ctrlCos);

            ctx.save();
            if (headbandAlpha !== 1.0) ctx.globalAlpha *= headbandAlpha;
            ctx.beginPath();
            ctx.arc(headCenterX, headY, bandMaskRadius, 0, Math.PI * 2);
            ctx.clip();
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 6; // PLAYER_HEADBAND_LINE_WIDTH
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(bStartX, bStartY);
            ctx.quadraticCurveTo(bCtrlX, bCtrlY, bEndX, bEndY);
            ctx.stroke();
            ctx.restore();
        };

        // 頭より背面: 髪
        if (renderHair) {
            this.renderPonytail(ctx, headCenterX, headY, headRadius, hairBaseX, hairBaseY, facingRight, alpha, {
                hairNodes: accessoryHairNodes,
                silhouetteColor: silhouetteColor,
                outlineEnabled: silhouetteOutlineEnabled,
                outlineColor: silhouetteOutlineColor,
                outlineExpand: outlineExpand
            });
        }

        // 中央: 頭
        drawHeadSilhouetteWithOutline();

        // 鉢巻テール
        const renderHeadband = options.renderHeadband !== false;
        if (renderHeadband && renderHeadbandTail && headbandAlpha > 0) {
            // 鉢巻バンドは頭円クリップ内に表示されるため、クリップ後に見える帯の中心へ根元を合わせる
            const bandLineWidth = 6;
            const bandMaskRadius = Math.max(1, headRadius - 0.05);
            const bandPathRadius = bandMaskRadius + bandLineWidth * 0.34;
            const bandBackAngle = (facingRight ? Math.PI * 0.92 : Math.PI * 0.08) + headSpinAngle;
            const clippedBandInner = bandPathRadius - bandLineWidth * 0.5;
            const clippedBandOuter = bandMaskRadius;
            const clippedBandCenterRadius = (clippedBandInner + clippedBandOuter) * 0.5;
            const headbandTailRootX = headCenterX + Math.cos(bandBackAngle) * clippedBandCenterRadius + dir * 0.34;
            const headbandTailRootY = headY + Math.sin(bandBackAngle) * clippedBandCenterRadius - 0.08;
            this.renderHeadbandTail(ctx, headbandTailRootX, headbandTailRootY, dir, headbandAlpha, accentColor, time, {
                ...options,
                isMoving,
                scarfNodes: accessoryScarfNodes
            });
        }

        // 最前面: 鉢巻（接点を完全に重ねる）
        drawHeadbandBand();

        // 腕と剣
        const effectiveIsAttacking = visualIsAttacking;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverride = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const effectiveSubWeaponTimer = (dualBlade && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
            ? (dualPoseOverride && Number.isFinite(dualPoseOverride.attackTimer)
                ? dualPoseOverride.attackTimer
                : dualBlade.attackTimer)
            : this.subWeaponTimer;
        const isActuallyAttacking = effectiveIsAttacking || (effectiveSubWeaponTimer > 0 && subWeaponAction !== 'throw') || (dualBlade && this.subWeaponAction);
        const leftShoulderX = leftShoulderXShared;
        const leftShoulderY = leftShoulderYShared;
        const rightShoulderX = rightShoulderXShared;
        const rightShoulderY = rightShoulderYShared;

        const armStrokeWidth = 4.8; // 脚(前脛)と同じ太さ
        const handRadiusScale = 0.94;
        const handOutlineGapHalf = 0.62;
        let lastHandConnectFrom = null;
        const insetAlongSegment = (fromX, fromY, toX, toY, insetPx = 0) => {
            if (insetPx <= 0) return { x: fromX, y: fromY };
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.hypot(dx, dy);
            if (len <= 0.0001) return { x: fromX, y: fromY };
            const t = Math.min(1, insetPx / len);
            return { x: fromX + dx * t, y: fromY + dy * t };
        };
        const drawConnectedHandOutline = (xPos, yPos, radius, connectFrom = null) => {
            if (!silhouetteOutlineEnabled || alpha <= 0) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (connectFrom && Number.isFinite(connectFrom.x) && Number.isFinite(connectFrom.y)) {
                const inward = Math.atan2(connectFrom.y - yPos, connectFrom.x - xPos);
                ctx.arc(
                    xPos,
                    yPos,
                    radius,
                    inward + handOutlineGapHalf,
                    inward - handOutlineGapHalf + Math.PI * 2,
                    false
                );
            } else {
                ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
        };
        const drawArmPolylineOutline = (points, outlineWidth = armStrokeWidth + outlineExpand) => {
            if (!silhouetteOutlineEnabled || alpha <= 0 || !Array.isArray(points) || points.length < 2) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        };
        const drawArmSegment = (fromX, fromY, toX, toY, width = 6, withOutline = true) => {
            // 微小な距離（0.1未満）の場合は描画をスキップして不要な点（lineCapによるもの）を防ぐ
            if (Math.hypot(toX - fromX, toY - fromY) < 0.1) return;

            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = armStrokeWidth + outlineExpand;
                ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor; ctx.lineWidth = armStrokeWidth;
            ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
        };
        const drawArmWithSoftElbow = (
            shoulderX,
            shoulderY,
            handX,
            handY,
            bendDir = 1,
            bendScale = 0.14,
            elbowRadius = 2.15,
            optionsInner = {}
        ) => {
            if (alpha <= 0) return;

            // 特殊パーツ用オーバーライド（籠手など）
            if (typeof options.drawArmOverride === 'function') {
                if (options.drawArmOverride(ctx, {
                    shoulderX, shoulderY, handX, handY, bendDir, bendScale, elbowRadius, optionsInner,
                    alpha, dir, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand
                })) return;
            }
            const dx = handX - shoulderX;
            const dy = handY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) {
                lastHandConnectFrom = { x: shoulderX, y: shoulderY };
                drawArmSegment(shoulderX, shoulderY, handX, handY, 6);
                return;
            }
            // 到達に余裕がある場合でも、肘の関節パーツを表示するために微小な曲げを維持
            const poseDistLimit = 16.5; // 腕の物理限界に近い値
            const effectiveDist = Math.min(poseDistLimit, dist);
            const nx = -dy / dist;
            const ny = dx / dist;
            // 近距離だけ穏やかに曲げる（二刀流ポーズで肘が見えやすく調整）
            const closeT = Math.max(0, Math.min(1, (14.5 - dist) / 14.5));
            const bend = Math.min(2.5, dist * bendScale * (0.38 + closeT * 0.62));
            const bendSign = -bendDir;
            const preferUpwardElbow = options.preferUpwardElbow === true;
            let elbowX = shoulderX + dx * 0.54;
            let elbowY = shoulderY + dy * 0.54 + 0.2;
            if (preferUpwardElbow) {
                elbowX += nx * bend * bendSign * 0.22;
                elbowY -= bend * 0.96;
            } else {
                elbowX += nx * bend * bendSign;
                elbowY += ny * bend * bendSign;
            }
            
            // 手首側の描画を少し短縮して手のひらからのハミ出しを防ぐ
            const wristToHandDist = 1.35;
            const wristX = handX - (dx / dist) * wristToHandDist;
            const wristY = handY - (dy / dist) * wristToHandDist;
            const armStart = insetAlongSegment(shoulderX, shoulderY, elbowX, elbowY, 1.2);
            lastHandConnectFrom = { x: wristX, y: wristY };

            drawArmPolylineOutline([
                { x: armStart.x, y: armStart.y },
                { x: elbowX, y: elbowY },
                { x: wristX, y: wristY },
                { x: handX, y: handY }
            ]);
            drawArmSegment(shoulderX, shoulderY, elbowX, elbowY, 6, false);
            drawArmSegment(elbowX, elbowY, wristX, wristY, 5.4, false);
            if (alpha > 0) {
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(elbowX, elbowY, elbowRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        const drawHand = (xPos, yPos, radius = 4.5, connectFrom = null) => {
            if (alpha <= 0) return;
            if (typeof options.drawHandOverride === 'function') {
                if (options.drawHandOverride(ctx, { 
                    xPos, yPos, radius, connectFrom, alpha, dir, 
                    silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand 
                })) {
                    lastHandConnectFrom = null;
                    return;
                }
            }
            const handR = radius * handRadiusScale;
            const connectAnchor = connectFrom || lastHandConnectFrom;
            drawConnectedHandOutline(xPos, yPos, handR, connectAnchor);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath(); ctx.arc(xPos, yPos, handR, 0, Math.PI * 2); ctx.fill();
            lastHandConnectFrom = null;
        };
        const clampArmReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderX; const dy = targetY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) return { x: targetX, y: targetY };
            const ratio = maxLen / dist;
            return { x: shoulderX + dx * ratio, y: shoulderY + dy * ratio };
        };

        const singleKatanaIdlePose = getSingleKatanaIdleHandPose();
        const idleLeftHand = singleKatanaIdlePose.leftHand;
        const dualWieldRightHand = stretchFromShoulder(
            rightShoulderX,
            rightShoulderY,
            dualWieldRightHandXShared,
            dualWieldRightHandYShared
        );
        const idleLeftBladeAngle = isCrouchPose ? -0.32 : -0.65;
        const idleRightBladeAngle = isCrouchPose ? -0.82 : -1.1;
        const singleKatanaRightHand = singleKatanaIdlePose.rightHand;

        const isIdleForceRender = forceSubWeaponRender && !subWeaponAction && subWeaponTimer <= 0;
        if (isNinNinPose) {
            drawArmWithSoftElbow(
                rightShoulderX,
                rightShoulderY,
                singleKatanaRightHand.x,
                singleKatanaRightHand.y,
                -dir,
                isCrouchPose ? 0.09 : 0.13
            );
            drawHand(singleKatanaRightHand.x, singleKatanaRightHand.y, 4.5);
        } else if (!isActuallyAttacking && (!forceSubWeaponRender || isIdleForceRender)) {
            const isThrowing = effectiveSubWeaponTimer > 0 && subWeaponAction === 'throw';
            const hasDualSubWeapon = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';

            // 奥手（刀を持つ）
            if (!renderIdleBackArmBehind) {
                drawArmWithSoftElbow(
                    leftShoulderX,
                    leftShoulderY,
                    idleLeftHand.x,
                    idleLeftHand.y,
                    -dir,
                    isCrouchPose ? 0.11 : 0.15
                );
                drawHand(idleLeftHand.x, idleLeftHand.y, 4.8);
                this.drawKatana(ctx, idleLeftHand.x, idleLeftHand.y, idleLeftBladeAngle, dir);
            }

            if (!isThrowing) {
                if (hasDualSubWeapon) {
                    // 二刀前手: 描画順序を「腕→柄→手」に統一。
                    // 1. 腕
                    drawArmWithSoftElbow(
                        rightShoulderX,
                        rightShoulderY,
                        dualWieldRightHand.x,
                        dualWieldRightHand.y,
                        -dir,
                        isCrouchPose ? 0.1 : 0.14
                    );
                    // 2. 柄 (腕よりも前面)
                    this.drawKatana(ctx, dualWieldRightHand.x, dualWieldRightHand.y, idleRightBladeAngle, dir, this.getKatanaBladeLength(), 0.28, 'handle');
                    // 3. 手 (柄よりも前面で握る)
                    drawHand(dualWieldRightHand.x, dualWieldRightHand.y, 4.5);
                    // 4. 刀身 (手の前面)
                    this.drawKatana(ctx, dualWieldRightHand.x, dualWieldRightHand.y, idleRightBladeAngle, dir, this.getKatanaBladeLength(), 0.28, 'blade');
                } else {
                    drawArmWithSoftElbow(
                        rightShoulderX,
                        rightShoulderY,
                        singleKatanaRightHand.x,
                        singleKatanaRightHand.y,
                        -dir,
                        isCrouchPose ? 0.09 : 0.13
                    );
                    drawHand(singleKatanaRightHand.x, singleKatanaRightHand.y, 4.5);
                }
            }

        } else if (effectiveIsAttacking) {
            this.renderAttackArmAndWeapon(ctx, {
                centerX, pivotY: bodyTopY + 2, facingRight,
                leftShoulderX: leftShoulderX,
                leftShoulderY: leftShoulderY,
                rightShoulderX: rightShoulderX,
                rightShoulderY: rightShoulderY,
                supportRightHand: !(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流'),
                layerPhase: 'front'
            }, alpha, {
                ...options,
                attackState: comboVisualAttackState
            });
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                // 二刀前手: 攻撃中もサブ武器アーム側の描画（renderSubWeaponArm）に任せるため、ここでは描画しない
                // (以前はここで描画していたが、renderSubWeaponArmと重複して二重描画の原因になっていた)
            }
        }

        // サブ武器アーム描画
	        if ((effectiveSubWeaponTimer > 0 || (forceSubWeaponRender && subWeaponAction)) && !effectiveIsAttacking && !isNinNinPose) {
	            this.renderSubWeaponArm(
                ctx,
                centerX,
                bodyTopY + 2,
                facingRight,
                renderSubWeaponVisuals,
                alpha,
                {
                    ...options,
                    shoulderAnchors: {
                        leftX: leftShoulderX,
                        leftY: leftShoulderY,
                        rightX: rightShoulderX,
                        rightY: rightShoulderY
                    },
                    idleHands: globalIdleHands,
                    layerPhase: 'front'
                }
	            );
	        }

	    this.x = originalX;
    this.y = originalY;
    ctx.restore();
}

    PlayerClass.prototype.renderSubWeaponArm = function(ctx, centerX, pivotY, facingRight, renderWeaponVisuals, alpha, options) {
        renderWeaponVisuals = renderWeaponVisuals !== false;
        alpha = Number.isFinite(alpha) ? alpha : 1.0;
        options = options || {};
        const dir = facingRight ? 1 : -1;
        const armReachScale = Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverride = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const durationWeapon = this.subWeaponAction === '二刀_Z' ? dualBlade : this.currentSubWeapon;
        const subDuration = this.getSubWeaponActionDurationMs(this.subWeaponAction, durationWeapon);
        const sourceTimer =
            (dualBlade && this.subWeaponAction === '二刀_Z')
                ? ((dualPoseOverride && Number.isFinite(dualPoseOverride.attackTimer))
                    ? dualPoseOverride.attackTimer
                    : dualBlade.attackTimer)
                : this.subWeaponTimer;
        const progress = Math.max(0, Math.min(1, 1 - (sourceTimer / subDuration)));
        const silhouetteColor = (options.palette && options.palette.silhouette) || COLORS.PLAYER;
        const silhouetteOutlineEnabled = options.silhouetteOutline !== false;
        const silhouetteOutlineColor = (options.palette && options.palette.silhouetteOutline) || 'rgba(168, 196, 230, 0.29)';
        const layerPhase = options.layerPhase || 'all';
        const drawBackLayer = layerPhase !== 'front';
        const drawFrontLayer = layerPhase !== 'back';
        const shoulderAnchors = options.shoulderAnchors || null;
        const leftShoulderX = (shoulderAnchors && Number.isFinite(shoulderAnchors.leftX))
            ? shoulderAnchors.leftX
            : centerX + dir * 4;
        const rightShoulderX = (shoulderAnchors && Number.isFinite(shoulderAnchors.rightX))
            ? shoulderAnchors.rightX
            : centerX - dir * 3;
        const leftShoulderY = (shoulderAnchors && Number.isFinite(shoulderAnchors.leftY))
            ? shoulderAnchors.leftY
            : pivotY;
        const rightShoulderY = (shoulderAnchors && Number.isFinite(shoulderAnchors.rightY))
            ? shoulderAnchors.rightY
            : (leftShoulderY + 1.0);
        const shoulderY = leftShoulderY;
        const isCrouchPose = !!this.isCrouching;
        const standardUpperLen = 13.6;
        const standardForeLen = 13.2;
        const standardLeftHandRadius = 4.8;
        const standardRightHandRadius = 4.5;
        const standardLeftReach = 22.0;
        const standardRightReach = 21.6;
        
        ctx.save();
        ctx.strokeStyle = silhouetteColor;
        ctx.lineCap = 'round';

        const armStrokeWidth = 4.8; // 脚(前脛)と同じ太さ
        const handRadiusScale = 0.94;
        const handOutlineGapHalf = 0.62;
        const outlineExpand = 0.75;
        let lastHandConnectFrom = null;
        const insetAlongSegment = (fromX, fromY, toX, toY, insetPx = 0) => {
            if (insetPx <= 0) return { x: fromX, y: fromY };
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.hypot(dx, dy);
            if (len <= 0.0001) return { x: fromX, y: fromY };
            const t = Math.min(1, insetPx / len);
            return { x: fromX + dx * t, y: fromY + dy * t };
        };
        const drawConnectedHandOutline = (xPos, yPos, radius, connectFrom = null) => {
            if (!silhouetteOutlineEnabled || alpha <= 0) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (connectFrom && Number.isFinite(connectFrom.x) && Number.isFinite(connectFrom.y)) {
                const inward = Math.atan2(connectFrom.y - yPos, connectFrom.x - xPos);
                ctx.arc(
                    xPos,
                    yPos,
                    radius,
                    inward + handOutlineGapHalf,
                    inward - handOutlineGapHalf + Math.PI * 2,
                    false
                );
            } else {
                ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
        };
        const drawArmPolylineOutline = (points, outlineWidth = armStrokeWidth + outlineExpand) => {
            if (!silhouetteOutlineEnabled || alpha <= 0 || !Array.isArray(points) || points.length < 2) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        };
        const drawArmSegment = (fromX, fromY, toX, toY, width = 6, withOutline = true) => {
            if (alpha <= 0) return;
            // 微小な距離（0.1未満）の場合は描画をスキップして不要な点（lineCapによるもの）を防ぐ
            if (Math.hypot(toX - fromX, toY - fromY) < 0.1) return;
            if (typeof options.drawArmOverride === 'function') {
                const headDir = Math.sign(toX - fromX) || 1;
                if (options.drawArmOverride(ctx, {
                    shoulderX: fromX, shoulderY: fromY, handX: toX, handY: toY, bendDir: headDir, bendScale: 0.0, elbowRadius: width * 0.5, optionsInner: null,
                    alpha, dir, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand
                })) return;
            }

            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = armStrokeWidth + outlineExpand;
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = armStrokeWidth;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
        };

        const drawArmWithElbow = (
            shoulderX,
            shoulderYLocal,
            elbowX,
            elbowY,
            handX,
            handY,
            upperWidth = 6,
            foreWidth = 5.2
        ) => {
            if (alpha <= 0) return;
            if (typeof options.drawArmOverride === 'function') {
                const headDir = Math.sign(handX - shoulderX) || 1;
                if (options.drawArmOverride(ctx, {
                    shoulderX, shoulderY: shoulderYLocal, handX, handY, bendDir: headDir, bendScale: 0.14, elbowRadius: 2.35, optionsInner: null,
                    alpha, dir, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand
                })) return;
            }
            lastHandConnectFrom = { x: elbowX, y: elbowY };
            const armStart = insetAlongSegment(shoulderX, shoulderYLocal, elbowX, elbowY, 1.2);
            drawArmPolylineOutline([
                { x: armStart.x, y: armStart.y },
                { x: elbowX, y: elbowY },
                { x: handX, y: handY }
            ]);
            drawArmSegment(shoulderX, shoulderYLocal, elbowX, elbowY, upperWidth, false);
            drawArmSegment(elbowX, elbowY, handX, handY, foreWidth, false);
            if (alpha > 0) {
                ctx.fillStyle = silhouetteColor;
                ctx.beginPath();
                ctx.arc(elbowX, elbowY, 2.35, 0, Math.PI * 2);
                ctx.fill();
            }
        };


        const drawBentArmSegment = (
            shoulderX,
            shoulderYLocal,
            handX,
            handY,
            upperLen = 13.6,
            foreLen = 13.2,
            bendDir = 1,
            width = 5.6,
            bendScale = 1
        ) => {
            if (alpha <= 0) return;
            if (typeof options.drawArmOverride === 'function') {
                if (options.drawArmOverride(ctx, {
                    shoulderX, shoulderY: shoulderYLocal, handX, handY, bendDir, bendScale, elbowRadius: width * 0.5, optionsInner: { preferUpwardElbow: true },
                    alpha, dir, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand
                })) return;
            }
            const dx = handX - shoulderX;
            const dy = handY - shoulderYLocal;
            const distRaw = Math.hypot(dx, dy);
            if (distRaw < 0.0001) {
                lastHandConnectFrom = { x: shoulderX, y: shoulderYLocal };
                drawArmSegment(shoulderX, shoulderYLocal, handX, handY, width);
                return;
            }
            // 余裕がある姿勢でも肘の円を表示するため、常に曲げ計算を行う
            const straightThreshold = (upperLen + foreLen) * 0.98;
            const ux = dx / distRaw;
            const uy = dy / distRaw;
            const midX = shoulderX + ux * (distRaw * 0.54);
            const midY = shoulderYLocal + uy * (distRaw * 0.54);
            const nx = -uy;
            const ny = ux;
            const closeT = Math.max(0, Math.min(1, (straightThreshold - distRaw) / straightThreshold));
            const safeBendScale = Math.max(0.2, bendScale);
            const bendAmount = (1.2 + closeT * 1.5) * safeBendScale;
            const bendSign = -bendDir;
            const elbowX = midX + nx * bendAmount * bendSign;
            const elbowY = midY + ny * bendAmount * bendSign;

            // 手首側の描画を少し短縮してハミ出しを抑制
            const wristToHandDist = 1.42;
            const wristX = handX - ux * wristToHandDist;
            const wristY = handY - uy * wristToHandDist;
            const armStart = insetAlongSegment(shoulderX, shoulderYLocal, elbowX, elbowY, 1.2);
            lastHandConnectFrom = { x: wristX, y: wristY };

            drawArmPolylineOutline([
                { x: armStart.x, y: armStart.y },
                { x: elbowX, y: elbowY },
                { x: wristX, y: wristY },
                { x: handX, y: handY }
            ]);
            drawArmSegment(shoulderX, shoulderYLocal, elbowX, elbowY, width, false);
            drawArmSegment(elbowX, elbowY, wristX, wristY, Math.max(4.4, width - 0.6), false);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(elbowX, elbowY, 2.35, 0, Math.PI * 2);
            ctx.fill();
        };

        const drawHand = (xPos, yPos, radius = 4.8, connectFrom = null) => {
            if (alpha <= 0) return;
            const handR = radius * handRadiusScale;
            if (typeof options.drawHandOverride === 'function') {
                if (options.drawHandOverride(ctx, { 
                    xPos, yPos, radius: handR, connectFrom, alpha, dir, 
                    silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, isAttackArm: false
                })) {
                    lastHandConnectFrom = null;
                    return;
                }
            }
            const connectAnchor = connectFrom || lastHandConnectFrom;
            drawConnectedHandOutline(xPos, yPos, handR, connectAnchor);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(xPos, yPos, handR, 0, Math.PI * 2);
            ctx.fill();
            lastHandConnectFrom = null;
        };

        const drawSubWeaponKatana = (
            handX,
            handY,
            bladeAngle = -1.0,
            bladeScaleDir = dir,
            uprightBlend = 0.28,
            renderMode = 'all',
            scaleY = 1,
            uprightTarget = -Math.PI / 2
        ) => {
            this.drawKatana(
                ctx,
                handX,
                handY,
                bladeAngle,
                bladeScaleDir,
                this.getKatanaBladeLength(),
                uprightBlend,
                renderMode,
                scaleY,
                uprightTarget
            );
        };

        const drawSupportPose = (handX, handY, withBlade = false, bladeAngle = -1.0, bladeScaleDir = dir, fromLeftShoulder = false) => {
            const shoulderX = fromLeftShoulder ? leftShoulderX : rightShoulderX;
            const shoulderYLocal = fromLeftShoulder ? leftShoulderY : rightShoulderY;
            drawBentArmSegment(
                shoulderX,
                shoulderYLocal,
                handX,
                handY,
                standardUpperLen,
                standardForeLen,
                fromLeftShoulder ? -dir : -dir,
                5.2
            );
            drawHand(
                handX,
                handY,
                fromLeftShoulder ? standardLeftHandRadius : standardRightHandRadius
            );
            if (withBlade && renderWeaponVisuals) {
                drawSubWeaponKatana(handX, handY, bladeAngle, bladeScaleDir);
            }
        };
        const drawProgressiveThrowArm = (
            shoulderX,
            shoulderYLocal,
            handX,
            handY,
            straightenT = 0,
            bendDir = -dir,
            alpha = 1.0
        ) => {
            if (alpha <= 0) return;
            if (typeof options.drawArmOverride === 'function') {
                const t = Math.max(0, Math.min(1, straightenT));
                if (options.drawArmOverride(ctx, {
                    shoulderX, shoulderY: shoulderYLocal, handX, handY, bendDir, bendScale: 1 - t, elbowRadius: 2.35, optionsInner: null,
                    alpha, dir, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand
                })) return;
            }
            const dx = handX - shoulderX;
            const dy = handY - shoulderYLocal;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.0001) {
                drawArmSegment(shoulderX, shoulderYLocal, handX, handY, 5.2);
                return;
            }
            const t = Math.max(0, Math.min(1, straightenT));
            const bendBlend = 1 - t;
            // 常に肘関節を描画するため、ショートカットを削除
            const ux = dx / dist;
            const uy = dy / dist;
            const nx = -uy;
            const ny = ux;
            const elbowBaseX = shoulderX + dx * 0.54;
            const elbowBaseY = shoulderYLocal + dy * 0.54 + 0.2;
            const maxBend = Math.min(2.1, dist * 0.16);
            const bendSign = -bendDir;
            const bend = maxBend * bendBlend;
            const elbowX = elbowBaseX + nx * bend * bendSign;
            const elbowY = elbowBaseY + ny * bend * bendSign;
            drawArmWithElbow(
                shoulderX,
                shoulderYLocal,
                elbowX,
                elbowY,
                handX,
                handY,
                5.2,
                4.7
            );
        };

        const clampArmReach = (shoulderX, shoulderYLocal, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderX;
            const dy = targetY - shoulderYLocal;
            const dist = Math.hypot(dx, dy);
            const maxLenScaled = maxLen * armReachScale;
            if (dist <= maxLenScaled || dist === 0) {
                return { x: targetX, y: targetY };
            }
            const ratio = maxLenScaled / dist;
            return {
                x: shoulderX + dx * ratio,
                y: shoulderYLocal + dy * ratio
            };
        };
        const fitShoulderReach = (shoulderX, shoulderYLocal, handX, handY, maxLen) => {
            const dx = handX - shoulderX;
            const dy = handY - shoulderYLocal;
            const dist = Math.hypot(dx, dy);
            const maxLenScaled = maxLen * armReachScale;
            if (dist <= maxLenScaled || dist <= 0.0001) {
                return { x: shoulderX, y: shoulderYLocal };
            }
            const pull = dist - maxLenScaled;
            return {
                x: shoulderX + (dx / dist) * pull,
                y: shoulderYLocal + (dy / dist) * pull
            };
        };

        if (this.subWeaponAction === 'throw') {
            // 手前手で投げる（手持ち武器は描画しない）
            const easedProgress = Math.pow(progress, 0.55); // イージングで初速を速く
            const armAngle = -Math.PI * 0.8 + easedProgress * Math.PI * 0.8;
            const armLength = 19;
            const throwShoulderX = rightShoulderX - dir * 0.2;
            const throwShoulderY = rightShoulderY - 0.15;
            const throwTargetX = throwShoulderX + Math.cos(armAngle) * armLength * dir;
            const throwTargetY = throwShoulderY + Math.sin(armAngle) * armLength;
            const throwHand = clampArmReach(throwShoulderX, throwShoulderY, throwTargetX, throwTargetY, standardRightReach);
            if (drawFrontLayer) {
                drawProgressiveThrowArm(
                    throwShoulderX,
                    throwShoulderY,
                    throwHand.x,
                    throwHand.y,
                    progress,
                    -dir,
                    alpha
                );
                drawHand(throwHand.x, throwHand.y, standardRightHandRadius);
            }
        } else if (this.subWeaponAction === '大槍') {
            // 突き: いったん引いて腕を曲げ、押し込みで腕を伸ばす
            const spear = (this.currentSubWeapon && this.currentSubWeapon.name === '大槍') ? this.currentSubWeapon : null;
            const grips = (spear && typeof spear.getGripAnchors === 'function')
                ? spear.getGripAnchors(this)
                : null;
            const motionP = grips ? grips.progress : Math.min(1, progress * 1.2);
            const windup = Math.max(0, 1 - (motionP / 0.34));
            const extend = Math.max(0, Math.min(1, (motionP - 0.22) / 0.56));
            const thrustDrive = Math.sin(extend * (Math.PI * 0.5));
            // 開始時は腕が曲がって見えるよう肩を後ろ寄せ、突きで前へ伸ばす
            const shoulderPush = -windup * 4.2 + thrustDrive * 2.2;
            const rearShoulderX = leftShoulderX + dir * (-0.9 + shoulderPush * 0.3);
            const rearShoulderY = shoulderY + 0.15 + windup * 1.25 - thrustDrive * 0.2;
            // 手元は槍上の固定グリップ位置に置き、槍本体の前進で突きを表現する
            const rearTargetX = (grips ? grips.rear.x : (centerX + dir * 13.4));
            const rearTargetY = (grips ? grips.rear.y : (pivotY + 7.8)) + windup * 0.14 - thrustDrive * 0.08;
            // クランプをかけず、必ずグリップ座標を握る（槍が手元で滑らないようにする）
            const rearHand = { x: rearTargetX, y: rearTargetY };
            // 手前手側の補正に使う共通リーチ
            const spearArmMaxReach = 18.9;
            if (drawBackLayer) {
                drawBentArmSegment(
                    rearShoulderX,
                    rearShoulderY,
                    rearHand.x,
                    rearHand.y,
                    standardUpperLen,
                    standardForeLen,
                    -dir,
                    5.3
                );
                drawHand(rearHand.x, rearHand.y, standardLeftHandRadius);
            }

            // 槍本体は奥手と手前手の間に描画する
            if (drawFrontLayer && renderWeaponVisuals && this.currentSubWeapon && typeof this.currentSubWeapon.render === 'function') {
                this.currentSubWeapon.render(ctx, this);
                this.subWeaponRenderedInModel = true;
            }

            const frontShoulderGripX = rightShoulderX - dir * (0.95 + windup * 1.45) + dir * thrustDrive * 1.1;
            const frontShoulderGripY = shoulderY + 1.3 + windup * 0.9 - thrustDrive * 0.12;
            const rightTargetX = (grips ? grips.front.x : (centerX + dir * 11.2));
            const rightTargetY = (grips ? grips.front.y : (pivotY + 10.0)) + windup * 0.1 - thrustDrive * 0.08;
            const rightHand = { x: rightTargetX, y: rightTargetY };
            const frontShoulderFit = fitShoulderReach(
                frontShoulderGripX,
                frontShoulderGripY,
                rightHand.x,
                rightHand.y,
                spearArmMaxReach
            );
            if (drawFrontLayer) {
                drawBentArmSegment(
                    frontShoulderFit.x,
                    frontShoulderFit.y,
                    rightHand.x,
                    rightHand.y,
                    standardUpperLen,
                    standardForeLen,
                    -dir,
                    5.3
                );
                drawHand(rightHand.x, rightHand.y, standardRightHandRadius);
            }
        } else if (this.subWeaponAction === '二刀_Z') {
            // 二刀Z: 段別の軌道は維持しつつ、肩起点/腕長を通常基準に統一
            const blade = dualBlade;
            const pose = (blade && typeof blade.getMainSwingPose === 'function')
                ? blade.getMainSwingPose(dualPoseOverride || {})
                : { comboIndex: 0, progress, rightAngle: -0.28, leftAngle: 2.14 };
            const comboStep = pose.comboIndex || 0;
            const comboProgress = pose.progress || 0;
            const smoothStep01 = (t) => {
                const v = Math.max(0, Math.min(1, t));
                return v * v * (3 - 2 * v);
            };
            const leftShoulderBaseX = leftShoulderX + dir * 0.18;
            const leftShoulderBaseY = leftShoulderY + 0.05;
            const rightShoulderBaseX = rightShoulderX - dir * 0.18;
            const rightShoulderBaseY = rightShoulderY + 0.12;
            let leftShoulderMoveX = leftShoulderBaseX;
            let leftShoulderMoveY = leftShoulderBaseY;
            let rightShoulderMoveX = rightShoulderBaseX;
            let rightShoulderMoveY = rightShoulderBaseY;

            let leftReach = 19.2;
            let rightReach = 18.8;
            const idleArmWaveLocal = Math.sin(this.motionTime * 0.01);
            // アイドル時の各手の基準位置
            const idleLeftHandX = centerX + dir * (isCrouchPose ? 11.5 : 14.0);
            const idleLeftHandY = leftShoulderY + (isCrouchPose ? 6.2 : 7.8) + idleArmWaveLocal * (isCrouchPose ? 0.8 : 1.7);
            const idleRightHandX = centerX - dir * (isCrouchPose ? 4.6 : 7.2);
            const idleRightHandY = rightShoulderY + (isCrouchPose ? 6.8 : 8.5) + Math.sin(this.motionTime * 0.01 + 0.5) * (isCrouchPose ? 0.8 : 1.7);

            // 1-2撃目: 動かない方の手はアイドル位置に固定
            let leftTargetX, leftTargetY, rightTargetX, rightTargetY;
            if (comboStep === 1) {
                // 奥手(左)のみ攻撃 — 手前手(右)はアイドル位置
                leftTargetX = leftShoulderMoveX + Math.cos(pose.leftAngle) * leftReach * dir;
                leftTargetY = leftShoulderMoveY + Math.sin(pose.leftAngle) * leftReach;
                rightTargetX = idleRightHandX;
                rightTargetY = idleRightHandY;
            } else if (comboStep === 2) {
                // 手前手(右)のみ攻撃 — 奥手(左)はアイドル位置
                leftTargetX = idleLeftHandX;
                leftTargetY = idleLeftHandY;
                rightTargetX = rightShoulderMoveX + Math.cos(pose.rightAngle) * rightReach * dir;
                rightTargetY = rightShoulderMoveY + Math.sin(pose.rightAngle) * rightReach;
            } else {
                // 3撃目以降: 両手ともpose角度で制御
                leftTargetX = leftShoulderMoveX + Math.cos(pose.leftAngle) * leftReach * dir;
                leftTargetY = leftShoulderMoveY + Math.sin(pose.leftAngle) * leftReach;
                rightTargetX = rightShoulderMoveX + Math.cos(pose.rightAngle) * rightReach * dir;
                rightTargetY = rightShoulderMoveY + Math.sin(pose.rightAngle) * rightReach;
            }
            let skipPoseReachAdjustment = false;
            let comboStep4LoadBlend = 0;
            let comboStep4AngleDive = 0;
            const singleKatanaLeftHandXLocal = idleLeftHandX;
            const singleKatanaLeftHandYLocal = idleLeftHandY;
            const dualWieldRightHandXLocal = idleRightHandX;
            const dualWieldRightHandYLocal = idleRightHandY;

            if (comboStep === 1) {
                // 一段: 奥手のみ袈裟斬り — 引き→踏み込み→振り下ろし
                const windT = smoothStep01(comboProgress / 0.12);       // 構え(0-12%)
                const slashT = smoothStep01((comboProgress - 0.12) / 0.38); // 斬り(12-50%)
                const settleT = smoothStep01(Math.min(1, Math.max(0, (comboProgress - 0.50) / 0.20))); // 余韻保持(50-70%)
                const recoverT = Math.pow(Math.max(0, (comboProgress - 0.70) / 0.30), 1.5); // 戻り(70-100%)
                // 左肩(奥手): 引いてから前方へ踏み込み、最後は戻る
                leftShoulderMoveX += dir * (-windT * 0.6 + slashT * 3.2 - settleT * 1.2) * (1 - recoverT);
                leftShoulderMoveY += (-windT * 0.8 + slashT * 1.8 - settleT * 0.4) * (1 - recoverT);
                // 右肩(手前手): 反動で軽く引く
                rightShoulderMoveX += dir * (-slashT * 0.3 + settleT * 0.2) * (1 - recoverT);
            } else if (comboStep === 2) {
                // 二段: 手前手のみ切り上げ — 沈み→爆発的上昇
                const dipT = smoothStep01(comboProgress / 0.10);        // 沈み(0-10%)
                const slashT = smoothStep01((comboProgress - 0.10) / 0.38); // 斬り(10-48%)
                const settleT = smoothStep01(Math.min(1, Math.max(0, (comboProgress - 0.48) / 0.22))); // 余韻保持(48-70%)
                const recoverT = Math.pow(Math.max(0, (comboProgress - 0.70) / 0.30), 1.5); // 戻り(70-100%)
                // 右肩(手前手): 前へ踏み込みながら大きく上へ
                rightShoulderMoveX += dir * (dipT * 0.3 + slashT * 2.0 - settleT * 0.8) * (1 - recoverT);
                rightShoulderMoveY += (dipT * 0.6 - slashT * 3.4 + settleT * 1.0) * (1 - recoverT);
                // 左肩(奥手): 反動で軽く後退
                leftShoulderMoveX += dir * (-slashT * 0.3 + settleT * 0.2) * (1 - recoverT);
            } else if (comboStep === 3) {
                // 三段: 両手十字斬り — 寄せ→爆発的に開く
                const gatherT = smoothStep01(comboProgress / 0.15);     // 寄せ(0-15%)
                const slashT = smoothStep01((comboProgress - 0.15) / 0.40); // 斬り(15-55%)
                const settleT = smoothStep01(Math.min(1, Math.max(0, (comboProgress - 0.55) / 0.20))); // 余韻保持(55-75%)
                const recoverT = Math.pow(Math.max(0, (comboProgress - 0.75) / 0.25), 1.5); // 戻り(75-100%)
                // 両肩を中央に寄せてから左右に爆発
                leftShoulderMoveX += dir * (gatherT * 2.0 - slashT * 3.6 + settleT * 0.8) * (1 - recoverT);
                leftShoulderMoveY += (-gatherT * 0.4 - slashT * 1.2 + settleT * 1.0) * (1 - recoverT);
                rightShoulderMoveX -= dir * (gatherT * 1.6 - slashT * 3.8 + settleT * 1.0) * (1 - recoverT);
                rightShoulderMoveY += (gatherT * 0.2 + slashT * 1.4 - settleT * 1.0) * (1 - recoverT);

            } else if (comboStep === 4) {
                // 四段: 前方斜め下から切り上げ、終端は平行維持のまま溜め姿勢
                const phase = smoothStep01(comboProgress);
                const backAngle = pose.leftAngle;
                const frontAngle = pose.rightAngle;
                const endBend = smoothStep01((comboProgress - 0.8) / 0.2);
                comboStep4LoadBlend = smoothStep01((comboProgress - 0.72) / 0.28);
                comboStep4AngleDive = comboStep4LoadBlend * 0.78;
                const baseReach = isCrouchPose ? 18.9 : 20.8;
                const reachScale = 1 - 0.18 * endBend;
                const backSweepReach = baseReach * reachScale;
                const frontSweepReach = (baseReach - 0.4) * reachScale;

                skipPoseReachAdjustment = true;
                leftShoulderMoveX += dir * (0.44 + (phase - 0.48) * 1.18) - dir * (isCrouchPose ? 0.62 : 0.92) * comboStep4LoadBlend;
                rightShoulderMoveX -= dir * (0.04 + phase * 0.42) + dir * (isCrouchPose ? 0.9 : 1.24) * comboStep4LoadBlend;
                leftShoulderMoveY -= 0.3 + phase * 1.62 + comboStep4LoadBlend * (isCrouchPose ? 0.12 : 0.2);
                rightShoulderMoveY -= 0.28 + phase * 1.52 + comboStep4LoadBlend * (isCrouchPose ? 0.08 : 0.16);

                leftTargetX = leftShoulderMoveX + Math.cos(backAngle) * backSweepReach * dir;
                leftTargetY = leftShoulderMoveY + Math.sin(backAngle) * backSweepReach;
                rightTargetX = rightShoulderMoveX + Math.cos(frontAngle) * frontSweepReach * dir;
                rightTargetY = rightShoulderMoveY + Math.sin(frontAngle) * frontSweepReach;

                // 奥行き: 手前手は下、奥手は上を維持しつつ、刀は平行のまま溜める
                rightTargetY += (isCrouchPose ? 1.28 : 1.82) + comboStep4LoadBlend * (isCrouchPose ? 0.16 : 0.28);
                leftTargetY -= (isCrouchPose ? 0.86 : 1.24) + comboStep4LoadBlend * (isCrouchPose ? 0.06 : 0.12);
                rightTargetX -= dir * ((isCrouchPose ? 0.86 : 1.22) + comboStep4LoadBlend * (isCrouchPose ? 0.44 : 0.68));
                leftTargetX += dir * ((isCrouchPose ? 0.28 : 0.46) - comboStep4LoadBlend * (isCrouchPose ? 0.06 : 0.1));
            } else if (comboStep === 0) {
                // 五段: 海老反りクロスから腕を左右に開きつつ叩きつける
                const phase = smoothStep01(comboProgress);
                const backAngle = pose.leftAngle;
                const frontAngle = pose.rightAngle;
                const startBend = 1 - smoothStep01(comboProgress / 0.24);
                const baseReach = isCrouchPose ? 18.9 : 20.8;
                const reachScale = 1 - 0.12 * startBend;
                const backSweepReach = baseReach * reachScale;
                const frontSweepReach = (baseReach - 0.4) * reachScale;

                skipPoseReachAdjustment = true;
                leftShoulderMoveX += dir * (0.28 + phase * 1.18);
                rightShoulderMoveX -= dir * (0.1 + phase * 1.28);
                leftShoulderMoveY += 0.15 + phase * 1.55;
                rightShoulderMoveY += 0.2 + phase * 1.7;

                leftTargetX = leftShoulderMoveX + Math.cos(backAngle) * backSweepReach * dir;
                leftTargetY = leftShoulderMoveY + Math.sin(backAngle) * backSweepReach;
                rightTargetX = rightShoulderMoveX + Math.cos(frontAngle) * frontSweepReach * dir;
                rightTargetY = rightShoulderMoveY + Math.sin(frontAngle) * frontSweepReach;

                // 開始はクロス寄り、終盤で左右へ開く
                rightTargetY += (isCrouchPose ? 1.1 : 1.55) + phase * 0.52;
                leftTargetY -= (isCrouchPose ? 0.62 : 0.9) - phase * 0.2;
                // 叩きつけ終盤で左右展開。奥の手は抑えめにして破綻を防ぐ
                const spreadBlend = smoothStep01((comboProgress - 0.46) / 0.54);
                rightTargetX -= dir * ((isCrouchPose ? 0.62 : 0.95) + spreadBlend * 2.35);
                leftTargetX += dir * ((isCrouchPose ? 0.24 : 0.42) + spreadBlend * 0.95);
            }

            const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
            const shoulderMaxDriftX = (comboStep === 4 || comboStep === 0) ? 3.9 : 2.9;
            const shoulderMaxDriftY = (comboStep === 4 || comboStep === 0) ? 3.9 : 3.1;
            leftShoulderMoveX = clamp(leftShoulderMoveX, leftShoulderBaseX - shoulderMaxDriftX, leftShoulderBaseX + shoulderMaxDriftX);
            leftShoulderMoveY = clamp(leftShoulderMoveY, leftShoulderBaseY - shoulderMaxDriftY, leftShoulderBaseY + shoulderMaxDriftY);
            rightShoulderMoveX = clamp(rightShoulderMoveX, rightShoulderBaseX - shoulderMaxDriftX, rightShoulderBaseX + shoulderMaxDriftX);
            rightShoulderMoveY = clamp(rightShoulderMoveY, rightShoulderBaseY - shoulderMaxDriftY, rightShoulderBaseY + shoulderMaxDriftY);

            // 肩移動の差分を手先ターゲットへ反映（1-2撃で静止側はスキップ）
            const applyLeftShoulderOffset = !(comboStep === 2); // 2撃目の奥手はアイドル固定
            const applyRightShoulderOffset = !(comboStep === 1); // 1撃目の手前手はアイドル固定
            if (applyLeftShoulderOffset) {
                leftTargetX += leftShoulderMoveX - leftShoulderBaseX;
                leftTargetY += leftShoulderMoveY - leftShoulderBaseY;
            }
            if (applyRightShoulderOffset) {
                rightTargetX += rightShoulderMoveX - rightShoulderBaseX;
                rightTargetY += rightShoulderMoveY - rightShoulderBaseY;
            }
            if (!skipPoseReachAdjustment) {
                if (applyLeftShoulderOffset) {
                    leftTargetX += Math.cos(pose.leftAngle) * (leftReach - 21.8) * dir;
                    leftTargetY += Math.sin(pose.leftAngle) * (leftReach - 21.8);
                }
                if (applyRightShoulderOffset) {
                    rightTargetX += Math.cos(pose.rightAngle) * (rightReach - 21.2) * dir;
                    rightTargetY += Math.sin(pose.rightAngle) * (rightReach - 21.2);
                }
            }

            let dualBackReachCap = Math.min(standardLeftReach, 20.8);
            let dualFrontReachCap = Math.min(standardRightReach, 20.4);
            if (comboStep === 1) {
                const stretchCap = smoothStep01((comboProgress - 0.74) / 0.26);
                dualFrontReachCap = Math.min(standardRightReach + 2.8, dualFrontReachCap + 2.8 * stretchCap);
            } else if (comboStep === 4) {
                // 4撃目終盤は肘を後ろへ折って溜めを作る
                dualBackReachCap = Math.min(standardLeftReach + 3.4 - comboStep4LoadBlend * 4.2, 23.8);
                dualFrontReachCap = Math.min(standardRightReach + 3.2 - comboStep4LoadBlend * 4.6, 23.3);
            } else if (comboStep === 0) {
                // 5撃目は振り下ろしで腕を伸ばす
                dualBackReachCap = Math.min(standardLeftReach + 4.2, 24.6);
                dualFrontReachCap = Math.min(standardRightReach + 4.2, 24.2);
            }
            let leftHand = clampArmReach(leftShoulderMoveX, leftShoulderMoveY, leftTargetX, leftTargetY, dualBackReachCap);
            let rightHand = clampArmReach(rightShoulderMoveX, rightShoulderMoveY, rightTargetX, rightTargetY, dualFrontReachCap);

            // フレーム間lerp: ステップ間遷移・idle復帰を全て滑らかに
            const lerpSpeed = (comboStep === 3 || comboStep === 4 || comboStep === 0) ? 0.38 : 0.28;
            if (this._dualZLastLeftHand && this._dualZLastRightHand) {
                leftHand = {
                    x: this._dualZLastLeftHand.x + (leftHand.x - this._dualZLastLeftHand.x) * lerpSpeed,
                    y: this._dualZLastLeftHand.y + (leftHand.y - this._dualZLastLeftHand.y) * lerpSpeed
                };
                rightHand = {
                    x: this._dualZLastRightHand.x + (rightHand.x - this._dualZLastRightHand.x) * lerpSpeed,
                    y: this._dualZLastRightHand.y + (rightHand.y - this._dualZLastRightHand.y) * lerpSpeed
                };
            }
            this._dualZLastLeftHand = { x: leftHand.x, y: leftHand.y };
            this._dualZLastRightHand = { x: rightHand.x, y: rightHand.y };
            // 五段目は奥行き感を保つため、奥手が手前手より下に落ちないように固定
            if (comboStep === 0) {
                const minBackAboveGap = isCrouchPose ? 0.7 : 1.2;
                const maxBackY = rightHand.y - minBackAboveGap;
                if (leftHand.y > maxBackY) {
                    const correctedBack = clampArmReach(
                        leftShoulderMoveX,
                        leftShoulderMoveY,
                        leftHand.x,
                        maxBackY,
                        dualBackReachCap
                    );
                    // 補正後も必ず「奥手が少し上」を維持
                    leftHand = {
                        x: correctedBack.x,
                        y: Math.min(correctedBack.y, maxBackY)
                    };
                }
            }
            const katanaLength = this.getKatanaBladeLength();
            const uprightBlend = 0.28;
            const uprightTarget = -Math.PI / 2;
            // アイドル時の刀角度（しゃがみ対応）
            const idleLeftBladeAngle = isCrouchPose ? -0.32 : -0.65;
            const idleRightBladeAngle = isCrouchPose ? -0.82 : -1.1;
            // 1-2撃目: 静止側の刀はアイドル角度を維持
            let leftWeaponAngleRaw, rightWeaponAngleRaw;
            if (comboStep === 1) {
                leftWeaponAngleRaw = pose.leftAngle - comboStep4AngleDive;
                rightWeaponAngleRaw = idleRightBladeAngle; // 手前刀はアイドル角度
            } else if (comboStep === 2) {
                leftWeaponAngleRaw = idleLeftBladeAngle; // 奥刀はアイドル角度
                rightWeaponAngleRaw = pose.rightAngle - comboStep4AngleDive;
            } else {
                leftWeaponAngleRaw = pose.leftAngle - comboStep4AngleDive;
                rightWeaponAngleRaw = pose.rightAngle - comboStep4AngleDive;
            }
            // 4撃目終盤は「刀見た目の溜め角度」と「剣筋追従角度」を分離して、
            // 下側に飛ぶ異常剣筋を抑える (ここも左右を入れ替え)
            const leftTrailAngleRaw = (comboStep === 4) ? pose.leftAngle : leftWeaponAngleRaw;
            const rightTrailAngleRaw = (comboStep === 4) ? pose.rightAngle : rightWeaponAngleRaw;
            const toAdjustedAngle = (rawAngle) => rawAngle + (uprightTarget - rawAngle) * uprightBlend;
            const leftAdjustedAngle = toAdjustedAngle(leftTrailAngleRaw);
            const rightAdjustedAngle = toAdjustedAngle(rightTrailAngleRaw);
            let leftArmBendDir = -dir;
            let rightArmBendDir = -dir;
            let leftArmBendScale = 1;
            let rightArmBendScale = 1;
            if (comboStep === 4 && comboStep4LoadBlend > 0) {
                // 溜め終盤は肘を背中側へ折り、次段の振り下ろしへ力を溜める
                const bendBlend = comboStep4LoadBlend;
                leftArmBendDir = (-dir) * (1 - bendBlend) + dir * bendBlend;
                rightArmBendDir = (-dir) * (1 - bendBlend) + dir * bendBlend;
                leftArmBendScale = 1 + bendBlend * 1.95;
                rightArmBendScale = 1 + bendBlend * 2.08;
            }
            const leftTipX = leftHand.x + Math.cos(leftAdjustedAngle) * dir * katanaLength;
            const leftTipY = leftHand.y + Math.sin(leftAdjustedAngle) * katanaLength;
            const rightTipX = rightHand.x + Math.cos(rightAdjustedAngle) * dir * katanaLength;
            const rightTipY = rightHand.y + Math.sin(rightAdjustedAngle) * katanaLength;
            this.dualBladeTrailAnchors = {
                direction: dir,
                back: {
                    handX: leftHand.x,
                    handY: leftHand.y,
                    tipX: leftTipX,
                    tipY: leftTipY,
                    angle: leftAdjustedAngle
                },
                front: {
                    handX: rightHand.x,
                    handY: rightHand.y,
                    tipX: rightTipX,
                    tipY: rightTipY,
                    angle: rightAdjustedAngle
                }
            };
            const drawBackArmWeapon = () => {
                drawBentArmSegment(leftShoulderMoveX, leftShoulderMoveY, leftHand.x, leftHand.y, standardUpperLen, standardForeLen, leftArmBendDir, 5.3, leftArmBendScale);
                drawHand(leftHand.x, leftHand.y, standardLeftHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(leftHand.x, leftHand.y, leftWeaponAngleRaw, dir);
                }
            };
            const drawFrontArmWeapon = () => {
                drawBentArmSegment(rightShoulderMoveX, rightShoulderMoveY, rightHand.x, rightHand.y, standardUpperLen, standardForeLen, rightArmBendDir, 5.3, rightArmBendScale);
                if (renderWeaponVisuals) {
                    // 腕の後に「柄」を描画することで、手首が柄の背後に隠れるようにする
                    drawSubWeaponKatana(rightHand.x, rightHand.y, rightWeaponAngleRaw, dir, 0.28, 'handle');
                }
                // 手前手は柄より前に描いて「握っている」見え方を優先する
                drawHand(rightHand.x, rightHand.y, standardRightHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(rightHand.x, rightHand.y, rightWeaponAngleRaw, dir, 0.28, 'blade');
                }
            };

            if (drawBackLayer) drawBackArmWeapon();
            if (drawFrontLayer) drawFrontArmWeapon();
        } else if (this.comboStep1IdleTransitionTimer > 0 && this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
            // === 二刀流リカバリーフェーズ: コンボ終了後にアイドル姿勢へ滑らかに戻る ===
            const recoveryDuration = 180;
            const t = 1 - Math.max(0, Math.min(1, this.comboStep1IdleTransitionTimer / recoveryDuration));
            const easeT = t * t * (3 - 2 * t);
            
            // アイドル時の基本角度
            const idleLeftBladeAngle = isCrouchPose ? -0.32 : -0.65;
            const idleRightBladeAngle = isCrouchPose ? -0.82 : -1.1;
            
            // コンボ最終段の姿勢を取得（getMainSwingPoseを使用）
            const lastPose = this.currentSubWeapon.getMainSwingPose({
                comboIndex: this.currentSubWeapon.comboIndex || 1,
                progress: 1.0 // 終端姿勢
            });

            // 角度を補間
            const leftAngle = lastPose.leftAngle + (idleLeftBladeAngle - lastPose.leftAngle) * easeT;
            const rightAngle = lastPose.rightAngle + (idleRightBladeAngle - lastPose.rightAngle) * easeT;

            // 各手の位置を再計算（肩の位置 + リーチ + 補間された角度）
            let leftHandX = leftShoulderX + Math.cos(leftAngle) * dir * 21.8;
            let leftHandY = leftShoulderY + Math.sin(leftAngle) * 21.8;
            let rightHandX = rightShoulderX + Math.cos(rightAngle) * dir * 21.2;
            let rightHandY = rightShoulderY + Math.sin(rightAngle) * 21.2;

            // lerpバッファ経由でさらにスムーズに
            if (this._dualZLastLeftHand && this._dualZLastRightHand) {
                const recoverLerp = 0.22;
                leftHandX = this._dualZLastLeftHand.x + (leftHandX - this._dualZLastLeftHand.x) * recoverLerp;
                leftHandY = this._dualZLastLeftHand.y + (leftHandY - this._dualZLastLeftHand.y) * recoverLerp;
                rightHandX = this._dualZLastRightHand.x + (rightHandX - this._dualZLastRightHand.x) * recoverLerp;
                rightHandY = this._dualZLastRightHand.y + (rightHandY - this._dualZLastRightHand.y) * recoverLerp;
            }
            this._dualZLastLeftHand = { x: leftHandX, y: leftHandY };
            this._dualZLastRightHand = { x: rightHandX, y: rightHandY };

            if (drawBackLayer) {
                drawBentArmSegment(leftShoulderX, leftShoulderY, leftHandX, leftHandY, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(leftHandX, leftHandY, standardLeftHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(leftHandX, leftHandY, leftAngle, dir);
                }
            }
            if (drawFrontLayer) {
                drawBentArmSegment(rightShoulderX, rightShoulderY, rightHandX, rightHandY, standardUpperLen, standardForeLen, -dir, 5.3);
                if (renderWeaponVisuals) drawSubWeaponKatana(rightHandX, rightHandY, rightAngle, dir, 0.28, 'handle');
                drawHand(rightHandX, rightHandY, standardRightHandRadius);
                if (renderWeaponVisuals) drawSubWeaponKatana(rightHandX, rightHandY, rightAngle, dir, 0.28, 'blade');
            }
        } else if (this.subWeaponAction === '二刀_合体') {
            // === 二刀合体: X構え → X斬撃 → アイドル復帰 ===
            const clamped = Math.min(1, Math.max(0, progress));
            
            // ユーザー要望に合わせたフェード比率の最終調整:
            // 1. 交差まで (gather) - 極めて高速 (15%)
            // 2. タメ (hold) - 一定時間静止 (53%)
            // 3. 振り下ろし (strike) - 瞬間的 (0.32 * 0.22 ≒ 7%)
            // 4. 余韻・復帰 (recovery) - 残りすべてを使いゆっくり戻す (25%)
            const gatherPhase = 0.15;
            const holdPhase = 0.53;
            const releasePhase = Math.max(0.01, 1 - gatherPhase - holdPhase);
            
            const gather = Math.max(0, Math.min(1, clamped / gatherPhase));
            const hold = clamped <= gatherPhase ? 0 : Math.max(0, Math.min(1, (clamped - gatherPhase) / holdPhase));
            const release = clamped <= (gatherPhase + holdPhase) ? 0 : Math.max(0, Math.min(1, (clamped - gatherPhase - holdPhase) / releasePhase));
            
            const easeGather = Math.pow(gather, 0.38); // さらに初速を上げる
            const easeRelease = release;
            const easeHold = hold;
            const holdPulse = Math.sin(hold * Math.PI) * 0.15;
            const lerp = (a, b, t) => a + (b - a) * t;

            // --- 二刀流アイドル座標・角度 ---
            let singleKatanaLeftHandX = centerX + dir * (isCrouchPose ? 11.5 : 14.0);
            let singleKatanaLeftHandY = leftShoulderY + (isCrouchPose ? 6.2 : 7.8);
            let dualWieldRightHandX = centerX - dir * (isCrouchPose ? 4.6 : 7.2);
            let dualWieldRightHandY = rightShoulderY + (isCrouchPose ? 6.8 : 8.5);
            if (options.idleHands) {
                singleKatanaLeftHandX = options.idleHands.left.x;
                singleKatanaLeftHandY = options.idleHands.left.y;
                dualWieldRightHandX = options.idleHands.right.x;
                dualWieldRightHandY = options.idleHands.right.y;
            }
            
            const singleKatanaLeftBladeAngle = isCrouchPose ? -0.32 : -0.65;
            const dualWieldRightBladeAngle = isCrouchPose ? -0.82 : -1.1;

            // --- X構えの幾何学的設計 ---
            // 交差点: 顔の前方
            const crossX = centerX + dir * (isCrouchPose ? 5 : 7);
            const crossY = pivotY - (isCrouchPose ? 1 : 3);
            // 垂直を中心に対称に開く角度
            const openAngle = 0.48;
            // 刃の中心までの距離 (手前=通常, 奥=短縮で奥行き表現)
            const frontHalfReach = 22;
            const backHalfReach = frontHalfReach * 0.82; // 仮想奥行きで短く見せる
            // 刀の角度 (手前は切っ先が揃うよう少し右に傾ける)
            const xBackAngle = -(Math.PI / 2 + openAngle);
            const xFrontAngle = -(Math.PI / 2 - openAngle - 0.14);
            // 交差点から逆算して手の位置を決定
            const xBackHandX = crossX - dir * Math.cos(xBackAngle) * backHalfReach;
            const xFrontHandX = crossX - dir * Math.cos(xFrontAngle) * frontHalfReach;
            // 刃先の高さを揃える: 刀身カーブ補正含む
            const rawBackHandY = crossY - Math.sin(xBackAngle) * backHalfReach;
            const rawFrontHandY = crossY - Math.sin(xFrontAngle) * frontHalfReach;
            const xBackHandY = rawBackHandY;
            const xFrontHandY = rawFrontHandY + 2; // 刀身の反りによる切っ先ズレを補正

            // --- 振り抜きポーズ (X斬撃) ---
            // 交差状態から両刃が開くように振り抜く:
            //   奥の剣: 上左方向 → 前下方向へ斬り抜け (手が前に出て下がる)
            //   手前の剣: 上右方向 → 後ろ下方向へ斬り抜け (手が後ろに引かれ下がる)
            const slashBackHandX = centerX + dir * (isCrouchPose ? 15 : 18);
            const slashBackHandY = pivotY + (isCrouchPose ? 12 : 14);
            const slashBackAngle = isCrouchPose ? 0.5 : 0.65;
            const slashFrontHandX = centerX - dir * (isCrouchPose ? 7 : 10);
            const slashFrontHandY = pivotY + (isCrouchPose ? 13 : 15);
            const slashFrontAngle = isCrouchPose ? 2.3 : 2.5;

            // --- アニメーション補間 ---
            let bx, by, fx, fy, ba, fa;

            if (clamped < gatherPhase) {
                // アイドル → X構え (スムーズ遷移)
                bx = lerp(singleKatanaLeftHandX, xBackHandX, easeGather);
                by = lerp(singleKatanaLeftHandY, xBackHandY, easeGather);
                fx = lerp(dualWieldRightHandX, xFrontHandX, easeGather);
                fy = lerp(dualWieldRightHandY, xFrontHandY, easeGather);
                ba = lerp(singleKatanaLeftBladeAngle, xBackAngle, easeGather);
                fa = lerp(dualWieldRightBladeAngle, xFrontAngle, easeGather);
            } else if (clamped < gatherPhase + holdPhase) {
                // X構えホールド (微振動)
                bx = xBackHandX + holdPulse * 0.2;
                by = xBackHandY - holdPulse * 0.1;
                fx = xFrontHandX - holdPulse * 0.15;
                fy = xFrontHandY + holdPulse * 0.08;
                ba = xBackAngle + holdPulse * 0.015;
                fa = xFrontAngle - holdPulse * 0.015;
            } else {
                // 振り抜き (0.0 -> 0.22) → 余韻 (0.22 -> 1.0)
                const relProgress = easeRelease;
                if (relProgress < 0.22) {
                    // 1. 素早い振り抜き (Strike)
                    const t = relProgress / 0.22;
                    const eT = Math.pow(t, 0.4); // 加速感
                    bx = lerp(xBackHandX, slashBackHandX, eT);
                    by = lerp(xBackHandY, slashBackHandY, eT);
                    fx = lerp(xFrontHandX, slashFrontHandX, eT);
                    fy = lerp(xFrontHandY, slashFrontHandY, eT);
                    ba = lerp(xBackAngle, slashBackAngle, eT);
                    fa = lerp(xFrontAngle, slashFrontAngle, eT);
                } else {
                    // 2. 余韻とアイドル復帰を統合し、ゆっくり戻す
                    let t = (relProgress - 0.22) / 0.78;
                    // アニメーション終了直前でアイドル位置にスナップさせ、タイマー切れ時のカクつきを完全に防止する
                    if (t > 0.95) t = 1.0;
                    const eT = t * t * (3 - 2 * t);
                    // 振り抜き終点からアイドルへ
                    bx = lerp(slashBackHandX, singleKatanaLeftHandX, eT);
                    by = lerp(slashBackHandY, singleKatanaLeftHandY, eT);
                    fx = lerp(slashFrontHandX, dualWieldRightHandX, eT);
                    fy = lerp(slashFrontHandY, dualWieldRightHandY, eT);
                    ba = lerp(slashBackAngle, singleKatanaLeftBladeAngle, eT);
                    fa = lerp(slashFrontAngle, dualWieldRightBladeAngle, eT);
                }
            }

            let shoulderFactor = easeGather;
            if (clamped >= gatherPhase + holdPhase) {
                const relProgress = easeRelease;
                if (relProgress >= 0.22) {
                    let t = (relProgress - 0.22) / 0.78;
                    if (t > 0.95) t = 1.0;
                    const eT = t * t * (3 - 2 * t);
                    shoulderFactor = easeGather * (1 - eT);
                }
            }

            // 肩の微動
            const bsx = leftShoulderX + dir * shoulderFactor * 0.4;
            const bsy = leftShoulderY - shoulderFactor * 0.3;
            const fsx = rightShoulderX + dir * shoulderFactor * 0.3;
            const fsy = rightShoulderY - shoulderFactor * 0.25;
            
            // 刀のuprightBlendの微動
            let currentUprightBlend = 0.02;
            let currentEtForArm = 0; // 腕の補間用
            if (clamped >= gatherPhase + holdPhase) {
                const relProgress = easeRelease;
                if (relProgress >= 0.22) {
                    let t = (relProgress - 0.22) / 0.78;
                    if (t > 0.95) t = 1.0;
                    const eT = t * t * (3 - 2 * t);
                    currentUprightBlend = lerp(0.02, 0.28, eT);
                    currentEtForArm = eT;
                }
            }

            // --- エネルギー蓄積エフェクト ---
            const energyIntensity = clamped < gatherPhase
                ? gather * gather
                : (clamped < gatherPhase + holdPhase ? 1.0 : Math.max(0, 1 - release * 1.5));

            // --- 描画 ---
            // 奥手 (背面レイヤー)
            if (drawBackLayer) {
                // eTが1.0に近づくにつれて、drawBentArmSegmentでの曲がりを自然に調整(必要であれば)
                drawBentArmSegment(bsx, bsy, bx, by, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(bx, by, standardLeftHandRadius);
            }
            // 奥の刀 (背面レイヤーへ変更)
            if (drawBackLayer && renderWeaponVisuals) {
                drawSubWeaponKatana(bx, by, ba, dir, currentUprightBlend, 'all');
            }
            // 手前手 (前面レイヤー)
            if (drawFrontLayer) {
                drawBentArmSegment(fsx, fsy, fx, fy, standardUpperLen, standardForeLen, -dir, 5.2);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(fx, fy, fa, dir, currentUprightBlend, 'handle');
                }
                drawHand(fx, fy, standardRightHandRadius);
                if (renderWeaponVisuals) {
                    drawSubWeaponKatana(fx, fy, fa, dir, currentUprightBlend, 'blade');
                }
            }

            // --- エネルギーエフェクト (腕・刀の上に加算合成で重ねる) ---
            if (energyIntensity > 0.01 && drawFrontLayer) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const ePulse = Math.sin(this.motionTime * 0.08) * 0.3 + 0.7;
                const eAlpha = energyIntensity * 0.7 * ePulse;
                const uprightTarget = -Math.PI / 2;
                const uprightBlend = 0.02;
                const kScale = 0.52;
                
                // 刀と同じローカル座標系でエフェクトを描画するヘルパー
                const drawBladeEffect = (baseX, baseY, baseAngle, colorCenter, colorMid, colorEdge, glowRBase, energyLenBase) => {
                    ctx.save();
                    ctx.translate(baseX, baseY);
                    ctx.scale(dir, 1);
                    
                    // 左右反転に関わらず -PI/2 を基準にする（drawKatana 内部の回転挙動に合わせる）
                    const uTarget = -Math.PI / 2;
                    const blend = Math.max(0, Math.min(1, uprightBlend));
                    const adjustedAngle = baseAngle + (uTarget - baseAngle) * blend;
                    ctx.rotate(adjustedAngle);
                    
                    ctx.scale(kScale, kScale);
                    
                    const visualLen = this.getKatanaBladeLength() - 5;
                    const bladeReach = Math.max(18, visualLen) / kScale;
                    const bladeStart = 10 + 2.2; // habakiX + 2.2 in local scale
                    const bladeEnd = Math.max(bladeStart + 10, bladeReach);
                    const bl = bladeEnd - bladeStart;
                    const sori = bl * 0.18;
                    const getArcY = (t) => -(Math.pow(t, 1.8) * sori) + 0.06;
                    
                    // グロー: 刀身の中央付近
                    const midT = 0.45;
                    const midX = bladeStart + (bladeEnd - bladeStart) * midT;
                    const midY = getArcY(midT);
                    const glowR = glowRBase / kScale;
                    const glow = ctx.createRadialGradient(midX, midY, 0, midX, midY, glowR * 1.8);
                    glow.addColorStop(0, colorCenter);
                    glow.addColorStop(0.5, colorMid);
                    glow.addColorStop(1, colorEdge);
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(midX, midY, glowR * 1.8, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // エネルギーライン: 刀身の反りに沿って切っ先に向かう曲線。先細り形状にする
                    if (energyIntensity > 0.1) {
                        const lineAlpha = (energyIntensity - 0.1) * 0.85 * ePulse;
                        const lineTEnd = energyLenBase;
                        const baseWidth = 3.2 / kScale;
                        
                        ctx.beginPath();
                        const getTX = (t) => bladeStart + (bladeEnd - bladeStart) * t;
                        
                        // 先細りの形状を作るため、片側の輪郭を描く
                        const segs = 16;
                        for (let i = 0; i <= segs; i++) {
                            const t = (i / segs) * lineTEnd;
                            const w = baseWidth * (1 - t * 0.85); // 先端に向かって細くする
                            const px = getTX(t);
                            const py = getArcY(t) - w * 0.5;
                            if (i === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        // もう片側の輪郭を逆順に描いて閉じる
                        for (let i = segs; i >= 0; i--) {
                            const t = (i / segs) * lineTEnd;
                            const w = baseWidth * (1 - t * 0.85);
                            const px = getTX(t);
                            const py = getArcY(t) + w * 0.5;
                            ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        
                        // 飛翔体のカラーコードに合わせて、中心に近い明るい色で塗りつぶし
                        ctx.fillStyle = colorCenter.replace(/[\d.]+\)$/, `${lineAlpha})`);
                        ctx.fill();
                    }
                    ctx.restore();
                };

                const glowR = (7 + energyIntensity * 12) * ePulse;
                
                // 飛翔体のカラーコードに合わせる
                // 奥の刀: 青いエフェクト (rgba(80, 200, 255, 0.98) 系)
                drawBladeEffect(bx, by, ba, 
                    `rgba(80, 200, 255, ${eAlpha * 0.7})`,
                    `rgba(50, 150, 255, ${eAlpha * 0.35})`,
                    `rgba(40, 100, 220, 0)`,
                    glowR, energyIntensity
                );

                // 手前の刀: 赤いエフェクト (rgba(255, 80, 80, 0.98) 系)
                drawBladeEffect(fx, fy, fa, 
                    `rgba(255, 80, 80, ${eAlpha * 0.7})`,
                    `rgba(255, 50, 40, ${eAlpha * 0.35})`,
                    `rgba(180, 30, 30, 0)`,
                    glowR, energyIntensity
                );

                // 交差点の白い輝き
                ctx.fillStyle = `rgba(255, 255, 250, ${eAlpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(crossX, crossY, (3 + energyIntensity * 3) * ePulse, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        } else if (this.subWeaponAction === '大太刀') {
            // 大太刀: 柄の中心付近を両手で挟む専用グリップ
            const odachi = (this.currentSubWeapon && this.currentSubWeapon.name === '大太刀') ? this.currentSubWeapon : null;
            const grips = (odachi && typeof odachi.getDualGripAnchors === 'function')
                ? odachi.getDualGripAnchors(this)
                : null;
            const fallbackCenterX = centerX + dir * 2;
            const fallbackCenterY = pivotY - 2;
            const rearTarget = grips
                ? grips.rear
                : { x: fallbackCenterX - dir * 3, y: fallbackCenterY - 2.2 };
            const frontTarget = grips
                ? grips.front
                : { x: fallbackCenterX + dir * 3, y: fallbackCenterY + 2.2 };

            const rearShoulderX = leftShoulderX + dir * 0.15;
            const rearShoulderY = shoulderY - 0.2;
            const frontShoulderGripX = rightShoulderX - dir * 0.25;
            const frontShoulderGripY = shoulderY + 0.9;

            const rearHand = clampArmReach(rearShoulderX, rearShoulderY, rearTarget.x, rearTarget.y, standardLeftReach);
            if (drawBackLayer) {
                drawBentArmSegment(rearShoulderX, rearShoulderY, rearHand.x, rearHand.y, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(rearHand.x, rearHand.y, standardLeftHandRadius);
            }

            // 本体の手前に持つ見た目を作るため、奥手の後に大太刀を描く
            if (drawFrontLayer && renderWeaponVisuals && odachi && typeof odachi.render === 'function') {
                odachi.render(ctx, this);
                this.subWeaponRenderedInModel = true;
            }

            const rightHand = clampArmReach(frontShoulderGripX, frontShoulderGripY, frontTarget.x, frontTarget.y, standardRightReach);
            if (drawFrontLayer) {
                drawBentArmSegment(frontShoulderGripX, frontShoulderGripY, rightHand.x, rightHand.y, standardUpperLen, standardForeLen, -dir, 5.2);
                drawHand(rightHand.x, rightHand.y, standardRightHandRadius);
            }
        } else if (this.subWeaponAction === '鎖鎌') {
            // 鎖鎌: 振りかぶり -> 前方へ投げ放つ -> その後に回す
            const kusa = (this.currentSubWeapon && this.currentSubWeapon.name === '鎖鎌') ? this.currentSubWeapon : null;
            const anchor = (kusa && typeof kusa.getHandAnchor === 'function')
                ? kusa.getHandAnchor(this)
                : { x: centerX + dir * 13, y: pivotY + 8, progress };
            const phase = anchor.phase || 'orbit';
            const phaseT = anchor.phaseT || 0;
            const swingShoulderX = rightShoulderX + dir * 0.12;
            const swingShoulderY = rightShoulderY + 0.18;
            let targetHandX = anchor.x;
            let targetHandY = anchor.y;
            // 投げ終わり直後に軽い反動を入れて、人間の腕らしい減速を作る
            if (phase === 'orbit' && phaseT < 0.26) {
                const recoil = 1 - (phaseT / 0.26);
                targetHandX -= dir * (2.6 + recoil * 5.2);
                targetHandY += recoil * 1.25;
            }
            // 鎖鎌の腕長は投擲系(手裏剣/火薬玉)と同等レンジに統一
            const armMaxLen =
                phase === 'windup' ? 20.6 :
                (phase === 'throw' ? 21.0 : 21.2);
            const mainHand = clampArmReach(swingShoulderX, swingShoulderY, targetHandX, targetHandY, armMaxLen);

            // 手前手は最後に描画して、奥手の刀より手前に見せる
            if (drawFrontLayer) {
                if (phase === 'throw') {
                    drawProgressiveThrowArm(
                        swingShoulderX,
                        swingShoulderY,
                        mainHand.x,
                        mainHand.y,
                        phaseT,
                        -dir
                    );
                } else {
                    drawBentArmSegment(
                        swingShoulderX,
                        swingShoulderY,
                        mainHand.x,
                        mainHand.y,
                        standardUpperLen,
                        standardForeLen,
                        -dir,
                        5.3
                    );
                }
                drawHand(mainHand.x, mainHand.y, standardRightHandRadius);
            }
        } else {
            // その他（デフォルト突き）
            const armEndX = centerX + dir * 20;
            const armEndY = pivotY + 5;
            if (drawBackLayer) {
                drawBentArmSegment(leftShoulderX, leftShoulderY, armEndX, armEndY, standardUpperLen, standardForeLen, -dir, 5.3);
                drawHand(armEndX, armEndY, standardLeftHandRadius);
            }
            if (drawFrontLayer) {
                drawSupportPose(centerX - dir * 8, pivotY + 12);
            }
        }

        // (プレビュー用背負い描画は削除)

        ctx.restore();
    };

    PlayerClass.prototype.renderAttackArmAndWeapon = function(ctx, {
        centerX,
        pivotY,
        facingRight,
        leftShoulderX = centerX,
        leftShoulderY = pivotY,
        rightShoulderX = centerX,
        rightShoulderY = pivotY + 1,
        supportRightHand = true,
        layerPhase = 'all'
    }, alpha = 1.0, options = {}) {
        const silhouetteColor = (options.palette && options.palette.silhouette) || COLORS.PLAYER;
        const silhouetteOutlineEnabled = options.silhouetteOutline !== false;
        const silhouetteOutlineColor = (options.palette && options.palette.silhouetteOutline) || 'rgba(168, 196, 230, 0.29)';
        const armReachScale = Number.isFinite(options.armReachScale) ? options.armReachScale : 1.0;
        const attackState = options.attackState || null;
        const attack = (attackState && attackState.currentAttack) ? attackState.currentAttack : this.currentAttack;
        if (!attack) {
            return;
        }
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const renderAttackTimer = (attackState && attackState.attackTimer !== undefined)
            ? attackState.attackTimer
            : this.attackTimer;
        const renderIsCrouching = (attackState && attackState.isCrouching !== undefined)
            ? attackState.isCrouching
            : this.isCrouching;
        const renderWidth = (attackState && Number.isFinite(attackState.width)) ? attackState.width : this.width;
        const renderHeight = (attackState && Number.isFinite(attackState.height)) ? attackState.height : this.height;
        const renderX = (attackState && Number.isFinite(attackState.x))
            ? attackState.x
            : (centerX - renderWidth * 0.5);
        const renderY = (attackState && Number.isFinite(attackState.y))
            ? attackState.y
            : (pivotY - (renderIsCrouching ? renderHeight * 0.58 : renderHeight * 0.43));
        const recoveryBlend = (attackState && Number.isFinite(attackState.recoveryBlend))
            ? Math.max(0, Math.min(1, attackState.recoveryBlend))
            : 0;
        const rawProgress = Math.max(0, Math.min(1, 1 - (renderAttackTimer / attackDuration)));
        const progress = this.getAttackMotionProgress(attack, rawProgress);
        const dir = facingRight ? 1 : -1;
        const attackArmStrokeWidth = 4.8; // 通常腕と同じ太さ
        const attackHandRadiusScale = 0.94; // 通常手と同じ縮尺
        const handOutlineGapHalf = 0.62;
        const outlineExpand = 0.75;
        const standardUpperLen = 13.6;
        const standardForeLen = 13.2;
        const drawBackLayer = layerPhase !== 'front';
        const drawFrontLayer = layerPhase !== 'back';
        let swordAngle = 0;
        let armEndX = centerX + dir * 14;
        let armEndY = pivotY + 6;
        let trail = null;
        let activeLeftShoulderX = leftShoulderX;
        let activeLeftShoulderY = leftShoulderY;
        let activeRightShoulderX = rightShoulderX;
        let activeRightShoulderY = rightShoulderY;
        let supportGripBackDist = 6.2;
        let supportGripSideOffset = 1.0;
        let supportGripMaxReach = 22;
        let allowSupportFrontHand = supportRightHand;
        if (attack.comboStep) {
            const bodyHeight = renderHeight;
            const bodyWidth = renderWidth;
            const comboPose = this.getComboSwordPoseState(
                {
                    x: renderX,
                    y: renderY,
                    width: bodyWidth,
                    height: bodyHeight,
                    facingRight,
                    isCrouching: renderIsCrouching,
                    attackTimer: renderAttackTimer,
                    currentAttack: attack,
                    recoveryBlend
                },
                {
                    leftShoulderX,
                    leftShoulderY,
                    rightShoulderX,
                    rightShoulderY,
                    supportRightHand
                }
            );
            if (comboPose) {
                swordAngle = comboPose.swordAngle;
                armEndX = comboPose.armEndX;
                armEndY = comboPose.armEndY;
                activeLeftShoulderX = comboPose.activeLeftShoulderX;
                activeLeftShoulderY = comboPose.activeLeftShoulderY;
                activeRightShoulderX = comboPose.activeRightShoulderX;
                activeRightShoulderY = comboPose.activeRightShoulderY;
                supportGripBackDist = comboPose.supportGripBackDist;
                supportGripSideOffset = comboPose.supportGripSideOffset;
                supportGripMaxReach = comboPose.supportGripMaxReach;
                allowSupportFrontHand = comboPose.allowSupportFrontHand;
            }
            switch (attack.comboStep) {
                case 2:
                    trail = {
                        mode: 'followSlash',
                        front: [214, 246, 255],
                        back: [104, 182, 242],
                        width: 13.6,
                        trailLen: 62,
                        edgeSpread: 4.2,
                        minAlpha: 0.3
                    };
                    break;
                case 1:
                    trail = {
                        mode: 'followSlash',
                        front: [225, 249, 255],
                        back: [116, 194, 248],
                        width: 14.6,
                        trailLen: 72,
                        edgeSpread: 4.8,
                        minAlpha: 0.38
                    };
                    break;
                case 3:
                    trail = {
                        mode: 'tipArc',
                        front: [222, 248, 255],
                        back: [102, 177, 238],
                        width: 13.8,
                        radius: 46,
                        startAngle: 2.45,
                        endAngle: -0.08,
                        revealStart: 0.08,
                        revealEnd: 0.94
                    };
                    break;
                case 4:
                    trail = {
                        mode: 'depthSlice',
                        front: [228, 250, 255],
                        back: [112, 186, 244],
                        width: 14.2,
                        length: 112,
                        spread: 13,
                        lift: 15
                    };
                    break;
                case 5:
                    trail = {
                        mode: 'followSlash',
                        front: [232, 252, 255],
                        back: [124, 198, 248],
                        width: 14.6,
                        trailLen: 74,
                        edgeSpread: 5.0,
                        minAlpha: 0.4
                    };
                    break;
                default:
                    break;
            }
        } else {
            switch (attack.type) {
                case ANIM_STATE.ATTACK_SLASH:
                    swordAngle = (progress - 0.5) * Math.PI;
                    armEndX = centerX + dir * 15;
                    armEndY = pivotY + 6;
                    // 二刀流装備時、X技でのポーズ調整
                    if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                        // 肘を曲げるためにターゲットを肩方向へ引き寄せる
                        armEndX -= dir * 4;
                        armEndY += 2.5;
                        // 角度を少し立たせて交差位置を調整
                        swordAngle += dir * 0.15;
                    }
                    break;
                case ANIM_STATE.ATTACK_UPPERCUT:
                    swordAngle = Math.PI / 2 - progress * Math.PI;
                    armEndX = centerX + dir * 12;
                    armEndY = pivotY - 5;
                    break;
                case ANIM_STATE.ATTACK_THRUST:
                    swordAngle = 0;
                    armEndX = centerX + dir * (10 + progress * 20);
                    armEndY = pivotY + 5;
                    break;
                case ANIM_STATE.ATTACK_SPIN:
                    swordAngle = progress * Math.PI * 2;
                    armEndX = centerX + Math.cos(swordAngle) * 10;
                    armEndY = pivotY + Math.sin(swordAngle) * 10;
                    break;
                case ANIM_STATE.ATTACK_DOWN:
                    swordAngle = -Math.PI / 2 + progress * Math.PI;
                    armEndX = centerX + dir * 15;
                    armEndY = pivotY;
                    break;
                default:
                    break;
            }
        }

        if (Math.abs(armReachScale - 1.0) > 0.001) {
            armEndX = activeLeftShoulderX + (armEndX - activeLeftShoulderX) * armReachScale;
            armEndY = activeLeftShoulderY + (armEndY - activeLeftShoulderY) * armReachScale;
        }

        const insetAlongSegment = (fromX, fromY, toX, toY, insetPx = 0) => {
            if (insetPx <= 0) return { x: fromX, y: fromY };
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.hypot(dx, dy);
            if (len <= 0.0001) return { x: fromX, y: fromY };
            const t = Math.min(1, insetPx / len);
            return { x: fromX + dx * t, y: fromY + dy * t };
        };
        const drawArmSegment = (x1, y1, x2, y2, width) => {
            if (alpha <= 0) return;
            if (silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = width + outlineExpand;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        };

        let lastAttackHandConnectFrom = null;
        const drawAttackArmPolylineOutline = (points, outlineWidth) => {
            if (!silhouetteOutlineEnabled || alpha <= 0 || !Array.isArray(points) || points.length < 2) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        };
        const drawConnectedAttackHandOutline = (xPos, yPos, radius, connectFrom = null) => {
            if (!silhouetteOutlineEnabled || alpha <= 0) return;
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (connectFrom && Number.isFinite(connectFrom.x) && Number.isFinite(connectFrom.y)) {
                const inward = Math.atan2(connectFrom.y - yPos, connectFrom.x - xPos);
                ctx.arc(
                    xPos,
                    yPos,
                    radius,
                    inward + handOutlineGapHalf,
                    inward - handOutlineGapHalf + Math.PI * 2,
                    false
                );
            } else {
                ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
        };
        const drawAttackHand = (xPos, yPos, radius = 4.8 * attackHandRadiusScale, connectFrom = null) => {
            if (alpha <= 0) return;
            if (typeof options.drawHandOverride === 'function') {
                if (options.drawHandOverride(ctx, { 
                    xPos, yPos, radius, connectFrom, alpha, dir, 
                    silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, isAttackArm: true
                })) {
                    lastAttackHandConnectFrom = null;
                    return;
                }
            }
            const connectAnchor = connectFrom || lastAttackHandConnectFrom;
            drawConnectedAttackHandOutline(xPos, yPos, radius, connectAnchor);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            ctx.fill();
            lastAttackHandConnectFrom = null;
        };
        const drawAttackArmSegment = (fromX, fromY, toX, toY, width = attackArmStrokeWidth, withOutline = true) => {
            if (alpha <= 0) return;
            // 微小な距離（0.1未満）の場合は描画をスキップ
            if (Math.hypot(toX - fromX, toY - fromY) < 0.1) return;
            if (typeof options.drawArmOverride === 'function') {
                const headDir = Math.sign(toX - fromX) || 1;
                if (options.drawArmOverride(ctx, {
                    shoulderX: fromX, shoulderY: fromY, handX: toX, handY: toY, bendDir: headDir, bendScale: 0.0, elbowRadius: width * 0.5, optionsInner: null,
                    alpha, dir, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, isAttackArm: true
                })) return;
            }

            if (withOutline && silhouetteOutlineEnabled) {
                ctx.strokeStyle = silhouetteOutlineColor;
                ctx.lineWidth = width + outlineExpand;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();
            }
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
        };
        const drawAttackBentArm = (
            shoulderX,
            shoulderY,
            handX,
            handY,
            bendDir = 1,
            width = attackArmStrokeWidth,
            upperLen = standardUpperLen,
            foreLen = standardForeLen
        ) => {
            if (alpha <= 0) return;

            // 特殊パーツ用オーバーライド（攻撃中も籠手を描画するため）
            if (typeof options.drawArmOverride === 'function') {
                if (options.drawArmOverride(ctx, {
                    shoulderX, shoulderY, handX, handY, bendDir, bendScale: 0.14, elbowRadius: width * 0.5, optionsInner: { lastHandConnectFrom: lastAttackHandConnectFrom },
                    alpha, dir, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, isAttackArm: true
                })) return;
            }

            const dx = handX - shoulderX;
            const dy = handY - shoulderY;
            const distRaw = Math.hypot(dx, dy);
            if (distRaw < 0.0001) {
                lastAttackHandConnectFrom = { x: shoulderX, y: shoulderY };
                drawAttackArmSegment(shoulderX, shoulderY, handX, handY, width);
                return;
            }
            const straightThreshold = (upperLen + foreLen) * 0.98;
            const ux = dx / distRaw;
            const uy = dy / distRaw;
            const midX = shoulderX + ux * (distRaw * 0.54);
            const midY = shoulderY + uy * (distRaw * 0.54);
            const nx = -uy;
            const ny = ux;
            const closeT = Math.max(0, Math.min(1, (straightThreshold - distRaw) / straightThreshold));
            const bendAmount = 1.25 + closeT * 1.55;
            const bendSign = -bendDir;
            const elbowX = midX + nx * bendAmount * bendSign;
            const elbowY = midY + ny * bendAmount * bendSign;

            // 手のひらへのハミ出しを防ぐため終点を少し手前に
            const wristToHandDist = 1.4;
            const wristX = handX - ux * wristToHandDist;
            const wristY = handY - uy * wristToHandDist;
            const armStart = insetAlongSegment(shoulderX, shoulderY, elbowX, elbowY, 1.2);
            lastAttackHandConnectFrom = { x: wristX, y: wristY };

            drawAttackArmPolylineOutline(
                [
                    { x: armStart.x, y: armStart.y },
                    { x: elbowX, y: elbowY },
                    { x: wristX, y: wristY },
                    { x: handX, y: handY }
                ],
                width + outlineExpand
            );
            drawAttackArmSegment(shoulderX, shoulderY, elbowX, elbowY, width, false);
            drawAttackArmSegment(elbowX, elbowY, wristX, wristY, Math.max(4.4, width - 0.6), false);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(elbowX, elbowY, 2.35, 0, Math.PI * 2);
            ctx.fill();
        };
        const clampAttackMainReach = (shoulderX, shoulderY, handX, handY, maxLen) => {
            const dx = handX - shoulderX;
            const dy = handY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) return { x: handX, y: handY };
            const ratio = maxLen / dist;
            return {
                x: shoulderX + dx * ratio,
                y: shoulderY + dy * ratio
            };
        };

        const rot = swordAngle;
        // step2の切り上げ終盤でsin(rot)が閾値を超えて肘方向が反転するのを防ぐ
        const mainBendDir = (attack.comboStep === 5 || attack.comboStep === 2)
            ? -dir
            : (Math.sin(rot) < -0.22 ? -dir : dir);
        const mainReachCap = (standardUpperLen + standardForeLen) * armReachScale;
        const clampedMainHand = clampAttackMainReach(
            activeLeftShoulderX,
            activeLeftShoulderY,
            armEndX,
            armEndY,
            mainReachCap
        );
        armEndX = clampedMainHand.x;
        armEndY = clampedMainHand.y;

        const hasDualWeapon = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';
        if (hasDualWeapon) {
            // 二刀流装備時、肘の曲がりを保証するためにターゲットを引き寄せる
            // drawAttackBentArmのstraightThreshold(≈15)未満に収めることで肘が必ず曲がる
            const shoulderToHandDist = Math.hypot(armEndX - activeLeftShoulderX, armEndY - activeLeftShoulderY);
            const maxDist = 13; // straightThreshold未満に制限
            if (shoulderToHandDist > maxDist) {
                const pullBack = maxDist / shoulderToHandDist;
                armEndX = activeLeftShoulderX + (armEndX - activeLeftShoulderX) * pullBack;
                armEndY = activeLeftShoulderY + (armEndY - activeLeftShoulderY) * pullBack;
            }
        }

        // 奥手（主動作）: 付け根を固定して描画
        if (drawBackLayer) {
            drawAttackBentArm(
                activeLeftShoulderX,
                activeLeftShoulderY,
                armEndX,
                armEndY,
                mainBendDir,
                attackArmStrokeWidth
            );

            drawAttackHand(armEndX, armEndY, 4.8 * attackHandRadiusScale);
        }

        const swordLen = this.getKatanaBladeLength(); // 見た目の刀身長は常に統一（当たり判定rangeとは分離）
        let supportHand = null;

        // 手前手が空いている場合は添え手にする（両手持ち）
        if (drawFrontLayer && allowSupportFrontHand) {
            const clampArmReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
                const dx = targetX - shoulderX;
                const dy = targetY - shoulderY;
                const dist = Math.hypot(dx, dy);
                const maxLenScaled = maxLen * armReachScale;
                if (dist <= maxLenScaled || dist === 0) {
                    return { x: targetX, y: targetY };
                }
                const ratio = maxLenScaled / dist;
                return {
                    x: shoulderX + dx * ratio,
                    y: shoulderY + dy * ratio
                };
            };

            const bladeDirX = Math.cos(rot) * dir;
            const bladeDirY = Math.sin(rot);
            const perpX = -bladeDirY;
            const perpY = bladeDirX;
            const supportTargetX = armEndX - bladeDirX * (hasDualWeapon ? 2.5 : supportGripBackDist) + perpX * supportGripSideOffset;
            const supportTargetY = armEndY - bladeDirY * (hasDualWeapon ? 2.5 : supportGripBackDist) + perpY * supportGripSideOffset;
            if (hasDualWeapon && attack.type === ANIM_STATE.ATTACK_SLASH) {
                // 二刀流X技の添え手（手前手）位置も調整して、刃同士が中間で交差するようにする
                // 位置を少し下にずらして「ハ」の字に近い角度を作る
                supportHand = {
                    x: activeRightShoulderX + dir * 5.5,
                    y: activeRightShoulderY + 14.5
                };
            } else {
                supportHand = clampArmReach(
                    activeRightShoulderX,
                    activeRightShoulderY,
                    supportTargetX,
                    supportTargetY,
                    supportGripMaxReach
                );
            }
        }

        // 剣を描画（共通メソッドで統一）
        // 攻撃時は立たせ補正を切って、切っ先・剣筋・当たり判定を一致させる
        // 常に front 層で描画（体の手前に刀を重ねる）
        if (drawFrontLayer) {
            this.drawKatana(ctx, armEndX, armEndY, rot, facingRight ? 1 : -1, swordLen, 0);
        }
        const suppressBaseSlashForXBoost = this.isXAttackBoostActive() && this.isXAttackActionActive();

        // 手前手は剣の後に描画して、握っている見た目を作る
        if (drawFrontLayer && supportHand) {
            drawAttackBentArm(
                activeRightShoulderX,
                activeRightShoulderY,
                supportHand.x,
                supportHand.y,
                -dir,
                attackArmStrokeWidth
            );

            drawAttackHand(supportHand.x, supportHand.y, 4.5 * attackHandRadiusScale);
        }

        if (drawFrontLayer) {
            // 斬撃エフェクト（刀のローカル座標系で描画）
            ctx.save();
            ctx.translate(armEndX, armEndY);
            ctx.scale(facingRight ? 1 : -1, 1);
            ctx.rotate(rot);

            // 斬撃エフェクト（大きく、派手に）
            const swingAlpha = Math.max(0.08, 1 - rawProgress);
            const colorRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
            const drawDepthArc = (arc) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const counterClockwise = arc.end < arc.start;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;

            ctx.strokeStyle = colorRgba(arc.back, backAlpha);
            ctx.lineWidth = arc.width * 0.72;
            ctx.beginPath();
            ctx.arc(arc.originX - 6, arc.originY - 3, arc.radius * 0.92, arc.start + 0.1, arc.end + 0.12, counterClockwise);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(arc.front, frontAlpha);
            ctx.lineWidth = arc.width;
            ctx.beginPath();
            ctx.arc(arc.originX, arc.originY, arc.radius, arc.start, arc.end, counterClockwise);
            ctx.stroke();

            ctx.strokeStyle = `rgba(245, 252, 255, ${frontAlpha * 0.58})`;
            ctx.lineWidth = Math.max(1.1, arc.width * 0.14);
            ctx.beginPath();
            ctx.arc(arc.originX + 1.1, arc.originY - 0.9, arc.radius - 2.0, arc.start + 0.04, arc.end + 0.04, counterClockwise);
            ctx.stroke();
            ctx.restore();
        };
            const drawDepthSlice = (slice) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const length = slice.length || 108;
            const spread = slice.spread || 12;
            const lift = slice.lift || 12;
            const width = slice.width || 13;

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.strokeStyle = colorRgba(slice.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.moveTo(-length * 0.26, -spread * 0.95);
            ctx.quadraticCurveTo(length * 0.22, -lift * 1.05, length, spread * 0.3);
            ctx.stroke();

            ctx.strokeStyle = colorRgba(slice.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(-length * 0.2, spread * 0.95);
            ctx.quadraticCurveTo(length * 0.28, lift * 1.05, length * 0.98, -spread * 0.2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(245, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.moveTo(-length * 0.16, spread * 0.58);
            ctx.quadraticCurveTo(length * 0.24, lift * 0.72, length * 0.9, -spread * 0.12);
            ctx.stroke();
            ctx.restore();
        };
            const drawFollowSlash = (slash) => {
            const alphaFloor = Math.max(0, Math.min(1, slash.minAlpha || 0));
            const alphaBase = Math.max(swingAlpha, alphaFloor);
            const backAlpha = alphaBase * 0.28;
            const frontAlpha = alphaBase * 0.82;
            const width = slash.width || 13;
            const trailLen = slash.trailLen || 52;
            const edgeSpread = slash.edgeSpread || 3.6;
            const tipX = swordLen;
            const tipY = 0;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen, -edgeSpread);
            ctx.quadraticCurveTo(tipX - trailLen * 0.36, -edgeSpread * 0.35, tipX, tipY);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen * 0.88, edgeSpread * 0.25);
            ctx.quadraticCurveTo(tipX - trailLen * 0.32, edgeSpread * 0.08, tipX, tipY);
            ctx.stroke();

            ctx.strokeStyle = `rgba(246, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen * 0.74, edgeSpread * 0.14);
            ctx.quadraticCurveTo(tipX - trailLen * 0.28, edgeSpread * 0.04, tipX, tipY);
            ctx.stroke();
            ctx.restore();
        };
            const drawTipArc = (slash) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const width = slash.width || 13;
            const tipX = swordLen;
            const tipY = 0;
            const radius = Math.max(16, slash.radius || 42);
            const centerX = tipX - radius;
            const centerY = tipY + (slash.centerYOffset || 0);
            const start = slash.startAngle ?? 2.5;
            const end = slash.endAngle ?? 0;
            const counterClockwise = (slash.counterClockwise !== undefined)
                ? !!slash.counterClockwise
                : (end < start);
            const revealStart = Math.max(0, Math.min(1, slash.revealStart ?? 0.08));
            const revealEnd = Math.max(revealStart + 0.01, Math.min(1, slash.revealEnd ?? 0.9));
            const revealRaw = (progress - revealStart) / (revealEnd - revealStart);
            const reveal = Math.max(0, Math.min(1, revealRaw));
            if (reveal <= 0.01) return;
            // 切っ先(=end)側から徐々に伸ばして描画する
            const visibleStart = end + (start - end) * reveal;

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;

            ctx.strokeStyle = colorRgba(slash.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.arc(centerX - 2.6, centerY - 1.5, radius * 0.92, visibleStart + 0.08, end + 0.04, counterClockwise);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, visibleStart, end, counterClockwise);
            ctx.stroke();

            const hiRadius = Math.max(4, radius - 2.0);
            const hiCenterX = tipX - hiRadius * Math.cos(end);
            const hiCenterY = tipY - hiRadius * Math.sin(end);
            ctx.strokeStyle = `rgba(246, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.arc(hiCenterX, hiCenterY, hiRadius, visibleStart, end, counterClockwise);
            ctx.stroke();
            ctx.restore();
        };

            const isComboAttack = !!attack.comboStep;
            // コンボ中はローカル白斬撃を重ねず、軌跡側だけを表示して刀身の白発光を防ぐ
            if (!suppressBaseSlashForXBoost && !isComboAttack) {
                if (trail && trail.mode === 'arc') {
                    drawDepthArc(trail);
                } else if (trail && trail.mode === 'depthSlice') {
                    drawDepthSlice(trail);
                } else if (trail && trail.mode === 'followSlash') {
                    drawFollowSlash(trail);
                } else if (trail && trail.mode === 'tipArc') {
                    drawTipArc(trail);
                } else if (trail && trail.mode === 'thrust') {
                    const alpha = swingAlpha * 0.72;
                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = colorRgba(trail.back, alpha * 0.3);
                    ctx.beginPath();
                    ctx.moveTo(swordLen - 2, -14);
                    ctx.lineTo(swordLen + 34, -5.5);
                    ctx.lineTo(swordLen + 34, 5.5);
                    ctx.lineTo(swordLen - 2, 14);
                    ctx.lineTo(swordLen + 6, 0);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = colorRgba(trail.front, alpha);
                    ctx.beginPath();
                    ctx.moveTo(swordLen + 1, -9.5);
                    ctx.lineTo(swordLen + 42, -2.6);
                    ctx.lineTo(swordLen + 42, 2.6);
                    ctx.lineTo(swordLen + 1, 9.5);
                    ctx.lineTo(swordLen + 10, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                } else if (attack.type === ANIM_STATE.ATTACK_THRUST) {
                    const alpha = swingAlpha * 0.72;
                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = `rgba(100, 255, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(swordLen, -25);
                    ctx.bezierCurveTo(swordLen + 20, -10, swordLen + 20, 10, swordLen, 25);
                    ctx.bezierCurveTo(swordLen + 10, 10, swordLen + 10, -10, swordLen, -25);
                    ctx.fill();
                    ctx.restore();
                } else {
                    ctx.strokeStyle = `rgba(100, 200, 255, ${0.8 * swingAlpha})`;
                    ctx.lineWidth = 15;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    const normalSlashRadius = 80;
                    if (attack.type === ANIM_STATE.ATTACK_SPIN) {
                        ctx.arc(0, 0, normalSlashRadius, 0, Math.PI * 2);
                    } else if (attack.isLaunch) {
                        ctx.arc(-20, 0, normalSlashRadius, -Math.PI * 0.4, Math.PI * 0.4, true);
                    } else {
                        ctx.arc(-10, 0, normalSlashRadius, -0.8, 0.8);
                    }
                    ctx.stroke();
                }
            }

            ctx.restore();
        }

    };

    PlayerClass.prototype.renderSpecial = function(ctx, options = {}) {
        const anchors = this.getSpecialCloneAnchors();
        const scaleEntity = typeof options.scaleEntity === 'function' ? options.scaleEntity : null;
        const renderScaled = (pivotX, pivotY, renderFn) => {
            if (scaleEntity) {
                scaleEntity(pivotX, pivotY, renderFn);
                return;
            }
            renderFn();
        };

        ctx.save();

        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                const cloneScarfNodes = this.specialCloneScarfNodes[anchor.index] || null;
                const cloneHairNodes = this.specialCloneHairNodes[anchor.index] || null;
                const cloneDrawY = this.getSpecialCloneDrawY(anchor.y);
                renderScaled(anchor.x, this.getSpecialCloneFootY(anchor.y), () => {
                    this.renderModel(
                        ctx,
                        anchor.x - this.width * 0.5,
                        cloneDrawY,
                        anchor.facingRight,
                        anchor.alpha,
                        false,
                        {
                            silhouetteMode: true,
                            ninNinPose: true,
                            isClone: true,
                            cloneIndex: anchor.index,
                            palette: { silhouette: '#1a1a1a', accent: '#00bfff' },
                            scarfNodes: cloneScarfNodes || undefined,
                            hairNodes: cloneHairNodes || undefined
                        }
                    );
                });
            }
        } else if (this.isSpecialCloneCombatActive()) {
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                const i = anchor.index;
                const pos = this.specialClonePositions[i];
                if (!pos) continue;

                const invincible = (this.specialCloneInvincibleTimers[i] || 0) > 0;
                const cloneAlpha = invincible && Math.floor(this.specialCloneInvincibleTimers[i] / 70) % 2 === 0
                    ? 0.7 : 1.0;

                // 本体の状態を退避（霧座標の計算に saved.y が必要なため先に定義）
                const saved = {
                    isAttacking: this.isAttacking,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer,
                    attackCombo: this.attackCombo,
                    subWeaponTimer: this.subWeaponTimer,
                    subWeaponAction: this.subWeaponAction,
                    facingRight: this.facingRight,
                    x: this.x,
                    y: this.y,
                    vx: this.vx,
                    vy: this.vy,
                    isGrounded: this.isGrounded,
                    isCrouching: this.isCrouching,
                    isDashing: this.isDashing,
                    motionTime: this.motionTime,
                    subWeaponPoseOverride: this.subWeaponPoseOverride,
                    height: this.height,
                    legPhase: this.legPhase,
                    legAngle: this.legAngle
                };

                const cloneDrawX = pos.x - this.width * 0.5;
                const cloneDrawY = this.getSpecialCloneDrawY(pos.y);

                // Lv0〜2は本体の攻撃状態に同期、Lv3は独自タイマー
                const cloneUsesDualZ = !!(
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name === '二刀流' &&
                    (
                        this.specialCloneAutoAiEnabled
                            ? (
                                this.specialCloneSubWeaponActions[i] === '二刀_Z' &&
                                (this.specialCloneSubWeaponTimers[i] || 0) > 0
                            )
                            : (this.subWeaponAction === '二刀_Z' && (this.subWeaponTimer || 0) > 0)
                    )
                );
                const isCloneAttacking = this.specialCloneAutoAiEnabled
                    ? ((this.specialCloneAttackTimers[i] > 0) && !cloneUsesDualZ)
                    : this.isAttacking;
                const cloneAttackTimer = this.specialCloneAutoAiEnabled
                    ? (this.specialCloneAttackTimers[i] || 0)
                    : this.attackTimer;
                const cloneComboStep = this.specialCloneAutoAiEnabled
                    ? (this.specialCloneComboSteps[i] || 1)
                    : (this.currentAttack ? this.currentAttack.comboStep || 1 : 1);
                const cloneAttackProfile = this.specialCloneAutoAiEnabled
                    ? (this.specialCloneCurrentAttacks[i] || this.getComboAttackProfileByStep(cloneComboStep))
                    : this.getMirroredCloneTrailProfile(i, pos, cloneDrawY);

                // 分身の状態をセット
                this.x = cloneDrawX;
                this.y = cloneDrawY;
                this.height = PLAYER.HEIGHT;
                this.facingRight = pos.facingRight;
                this.motionTime = saved.motionTime;

                if (this.specialCloneAutoAiEnabled) {
                    const rawRenderVx = pos.renderVx || 0;
                    this.vx = Math.abs(rawRenderVx) >= Math.abs(saved.vx) ? rawRenderVx : saved.vx;
                    this.vy = pos.cloneVy || 0;
                    this.isGrounded = !(pos.jumping);
                    this.isCrouching = false;
                    this.isDashing = false;
                    this.legPhase = pos.legPhase || 0;
                    this.legAngle = pos.legAngle || 0;
                    this.subWeaponTimer = this.specialCloneSubWeaponTimers[i] || 0;
                    this.subWeaponAction = this.specialCloneSubWeaponActions[i] || null;
                    this.subWeaponPoseOverride = cloneUsesDualZ
                        ? {
                            comboIndex: this.specialCloneComboSteps[i] || 0,
                            attackTimer: this.specialCloneSubWeaponTimers[i] || 0
                        }
                        : null;
                } else {
                    this.vx = saved.vx;
                    this.vy = saved.vy;
                    this.isGrounded = saved.isGrounded;
                    this.isCrouching = saved.isCrouching;
                    this.isDashing = saved.isDashing;
                    this.subWeaponTimer = saved.subWeaponTimer;
                    this.subWeaponAction = saved.subWeaponAction;
                    this.subWeaponPoseOverride = null;
                }

                    if (isCloneAttacking) {
                        this.isAttacking = true;
                        this.attackCombo = cloneComboStep;
                    if (this.specialCloneAutoAiEnabled && cloneAttackProfile) {
                        this.currentAttack = {
                            ...cloneAttackProfile,
                            comboStep: cloneComboStep
                        };
                    } else if (!this.specialCloneAutoAiEnabled) {
                        this.currentAttack = saved.currentAttack;
                    } else {
                        this.currentAttack = null;
                    }
                    this.attackTimer = cloneAttackTimer;
                } else {
                    this.isAttacking = false;
                    this.currentAttack = null;
                    this.attackTimer = 0;
                }

                renderScaled(pos.x, this.getSpecialCloneFootY(pos.y), () => {
                    // 霧エフェクト（描画座標に追従・キャッシュCanvasを利用して軽量化）
                    const mistCenterY = cloneDrawY + PLAYER.HEIGHT * 0.45;
                    ctx.save();
                    ctx.globalAlpha = cloneAlpha * 0.4;
                    if (this.mistCacheCanvas) {
                        const size = this.mistCacheCanvas.width;
                        ctx.drawImage(this.mistCacheCanvas, pos.x - size / 2, mistCenterY - size / 2);
                    } else {
                        ctx.fillStyle = `rgba(180, 214, 246, 1.0)`;
                        ctx.beginPath();
                        ctx.arc(pos.x, mistCenterY, 34, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();

                    ctx.save();
                    ctx.globalAlpha = cloneAlpha;

                    const cloneTrailPoints = Array.isArray(this.specialCloneSlashTrailPoints)
                        ? this.specialCloneSlashTrailPoints[i]
                        : null;
                    if (cloneTrailPoints && cloneTrailPoints.length > 1) {
                        const trailScale = this.getXAttackTrailWidthScale();
                        if (!cloneUsesDualZ) {
                            const cloneAttackState = {
                                x: this.x,
                                y: this.y,
                                facingRight: this.facingRight,
                                isAttacking: this.isAttacking,
                                currentAttack: this.currentAttack,
                                attackTimer: this.attackTimer,
                                isCrouching: this.isCrouching
                            };
                            this.renderComboSlashTrail(ctx, {
                                points: cloneTrailPoints,
                                trailWidthScale: trailScale,
                                boostActive: trailScale > 1.01 && isCloneAttacking,
                                isAttacking: isCloneAttacking,
                                attackState: cloneAttackState,
                                getBoostAnchor: () => (
                                    Array.isArray(this.specialCloneSlashTrailBoostAnchors)
                                        ? this.specialCloneSlashTrailBoostAnchors[i]
                                        : null
                                ),
                                setBoostAnchor: (value) => {
                                    if (!Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                                        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
                                    }
                                    this.specialCloneSlashTrailBoostAnchors[i] = value;
                                }
                            });
                        }
                    }

                    const cloneScarfNodes = this.specialCloneScarfNodes[i] || null;
                    const cloneHairNodes = this.specialCloneHairNodes[i] || null;

                    if (cloneScarfNodes && cloneHairNodes) {
                        const footY = this.y + this.height;
                        const cloneMotionTime = saved.motionTime;
                        const cloneIsMoving = this.specialCloneAutoAiEnabled
                            ? (Math.abs(pos.prevX - pos.x) > 0.5)
                            : (Math.abs(saved.vx) > 0.5 || !saved.isGrounded);
                        const anchorCalc = this.calculateAccessoryAnchor(
                            pos.x - this.width * 0.5, footY, this.height,
                            cloneMotionTime, cloneIsMoving,
                            false, false,
                            this.legPhase || cloneMotionTime * 0.012,
                            pos.facingRight
                        );
                        this.syncAccessoryRootNodes(cloneScarfNodes, cloneHairNodes, anchorCalc);
                    }

                    this.renderModel(ctx, this.x, this.y, this.facingRight, 1.0, true, {
                        useLiveAccessories: true,
                        renderHeadbandTail: true,
                        isClone: true,
                        cloneIndex: i,
                        scarfNodes: cloneScarfNodes || undefined,
                        hairNodes: cloneHairNodes || undefined
                    });
                    if (
                        cloneUsesDualZ &&
                        this.currentSubWeapon &&
                        this.currentSubWeapon.name === '二刀流' &&
                        typeof this.currentSubWeapon.render === 'function'
                    ) {
                        const dualBlade = this.currentSubWeapon;
                        const dualSaved = {
                            isAttacking: dualBlade.isAttacking,
                            attackType: dualBlade.attackType,
                            attackTimer: dualBlade.attackTimer,
                            attackDirection: dualBlade.attackDirection,
                            comboIndex: dualBlade.comboIndex,
                            projectiles: dualBlade.projectiles
                        };
                        const dualComboIndex = this.specialCloneAutoAiEnabled
                            ? (this.specialCloneComboSteps[i] || 0)
                            : (dualBlade.comboIndex || 0);
                        const dualAttackTimer = this.specialCloneAutoAiEnabled
                            ? (this.specialCloneSubWeaponTimers[i] || 0)
                            : (this.subWeaponTimer || dualBlade.attackTimer || 0);
                        dualBlade.isAttacking = true;
                        dualBlade.attackType = 'main';
                        dualBlade.attackDirection = this.facingRight ? 1 : -1;
                        dualBlade.comboIndex = dualComboIndex;
                        dualBlade.attackTimer = dualAttackTimer;
                        dualBlade.projectiles = [];
                        dualBlade.render(ctx, this);
                        dualBlade.isAttacking = dualSaved.isAttacking;
                        dualBlade.attackType = dualSaved.attackType;
                        dualBlade.attackTimer = dualSaved.attackTimer;
                        dualBlade.attackDirection = dualSaved.attackDirection;
                        dualBlade.comboIndex = dualSaved.comboIndex;
                        dualBlade.projectiles = dualSaved.projectiles;
                    }

                    ctx.restore();
                });

                // 本体の状態を完全に復元
                this.isAttacking = saved.isAttacking;
                this.currentAttack = saved.currentAttack;
                this.attackTimer = saved.attackTimer;
                this.attackCombo = saved.attackCombo;
                this.subWeaponTimer = saved.subWeaponTimer;
                this.subWeaponAction = saved.subWeaponAction;
                this.subWeaponPoseOverride = saved.subWeaponPoseOverride;
                this.facingRight = saved.facingRight;
                this.x = saved.x;
                this.y = saved.y;
                this.vx = saved.vx;
                this.vy = saved.vy;
                this.isGrounded = saved.isGrounded;
                this.isCrouching = saved.isCrouching;
                this.isDashing = saved.isDashing;
                this.motionTime = saved.motionTime;
                this.height = saved.height;
                this.legPhase = saved.legPhase;
                this.legAngle = saved.legAngle;
            }
        }

        // 忍術ドロン煙
        for (const puff of this.specialSmoke) {
            renderScaled(puff.x, puff.y, () => {
                const life = Math.max(0, Math.min(1, puff.life / puff.maxLife));
                const bloom = 1 - life;
                const radius = puff.radius * (puff.mode === 'appear' ? (0.78 + bloom * 1.05) : (0.66 + bloom * 0.88));
                const alpha = (puff.mode === 'appear' ? 0.62 : 0.36) * life;
                const warm = puff.mode === 'appear';
                
                const rot = puff.rot || 0;

                // 煙描画もキャッシュミストを拡大縮小・着色して利用（大幅な軽量化）
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(puff.x, puff.y);
                // warm時は少し暖色寄りのglobalCompositeOperation 等を使ってもよいが
                // ここではシンプルにキャッシュを利用し合成モードで色味を足す
                
                if (this.mistCacheCanvas) {
                    const s = this.mistCacheCanvas.width;
                    const scale = (radius * 2) / s;
                    ctx.scale(scale, scale);
                    // ベースの煙
                    ctx.drawImage(this.mistCacheCanvas, -s/2, -s/2);
                    
                    // 追加のコブ
                    ctx.save();
                    ctx.rotate(rot);
                    ctx.translate(0, s/4);
                    ctx.globalAlpha = alpha * 0.7;
                    ctx.scale(0.6, 0.6);
                    ctx.drawImage(this.mistCacheCanvas, -s/2, -s/2);
                    ctx.restore();
                } else {
                    // フォールバック
                    ctx.fillStyle = warm ? `rgba(194, 233, 255, 1.0)` : `rgba(176, 196, 230, 1.0)`;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                if (life < (puff.ringStart || 0.28) && life > 0.12) {
                    const ringAlpha = alpha * (1 - life) * 0.9;
                    ctx.strokeStyle = warm
                        ? `rgba(194, 233, 255, ${ringAlpha})`
                        : `rgba(182, 206, 240, ${ringAlpha})`;
                    ctx.lineWidth = 1.1;
                    ctx.beginPath();
                    ctx.arc(puff.x, puff.y, radius * (0.74 + (1 - life) * 0.35), 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (puff.hasSpark && life > 0.26) {
                    const sparkX = puff.x + Math.cos(rot * 1.7) * radius * 0.44;
                    const sparkY = puff.y + Math.sin(rot * 1.3) * radius * 0.32;
                    ctx.fillStyle = `rgba(248, 254, 255, ${alpha * 0.85})`;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, Math.max(0.8, radius * 0.08), 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }




        ctx.restore();
    };
}
