
/**
 * 将軍（将軍モデル）の各部位描画メソッド
 * playerRenderer.js に追加することで、Playerクラスが将軍の見た目を持てるようにする
 */

export function applyShogunRendererMixin(PlayerClass) {
    // 胴体
    PlayerClass.prototype._drawShogunTorso = function(ctx, p) {
        const { torsoShoulderX, bodyTopY, torsoHipX, hipY, dir, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, withOutline } = p;
        const cArmor = '#101014';
        const cGold  = '#dcb854';
        const cCloth = '#202020';

        const dx = torsoHipX - torsoShoulderX;
        const dy = hipY - bodyTopY;
        const torsoLen = Math.hypot(dx, dy) || 1;
        const ux = dx / torsoLen;
        const uy = dy / torsoLen;
        const nx = -uy;
        const ny = ux;

        ctx.fillStyle = cArmor;
        ctx.beginPath();
        ctx.moveTo(torsoShoulderX - nx * 6.5 * dir, bodyTopY - ny * 6.5 * dir);
        ctx.lineTo(torsoShoulderX + nx * 4.5 * dir, bodyTopY + ny * 4.5 * dir);
        ctx.lineTo(torsoHipX + nx * 4.5 * dir, hipY + ny * 4.5 * dir);
        ctx.lineTo(torsoHipX - nx * 6.5 * dir, hipY - ny * 6.5 * dir);
        ctx.fill();

        const backX = (r) => (torsoShoulderX + nx * 4.5 * dir) * (1 - r) + (torsoHipX + nx * 4.5 * dir) * r;
        const backY = (r) => (bodyTopY + ny * 4.5 * dir) * (1 - r) + (hipY + ny * 4.5 * dir) * r;
        
        for (let i = 0; i < 4; i++) {
            const startR = i * 0.25;
            const endR = (i + 1) * 0.25;
            const midR = startR + 0.125;
            
            ctx.fillStyle = '#0a0a0d';
            ctx.beginPath();
            ctx.moveTo(backX(startR), backY(startR));
            ctx.quadraticCurveTo(backX(midR) + nx * dir * 3.5, backY(midR), backX(endR), backY(endR));
            ctx.lineTo(backX(endR) - nx * dir * 0.5, backY(endR));
            ctx.lineTo(backX(startR) - nx * dir * 0.5, backY(startR));
            ctx.fill();
            
            ctx.strokeStyle = '#b09240';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(backX(startR), backY(startR));
            ctx.quadraticCurveTo(backX(midR) + nx * dir * 3.5, backY(midR), backX(endR), backY(endR));
            ctx.stroke();
        }
    };

    // 胴体オーバーレイ（草摺）
    PlayerClass.prototype._drawShogunTorsoOverlay = function(ctx, p) {
        const { torsoShoulderX, bodyTopY, torsoHipX, hipY, dir } = p;
        const cArmor = '#101014';
        const dx = torsoHipX - torsoShoulderX;
        const dy = hipY - bodyTopY;
        const torsoLen = Math.hypot(dx, dy) || 1;
        const nx = -(dy / torsoLen);
        const ny = dx / torsoLen;

        const skirtLen = 13.0;
        const skirtSpread = 6.0;

        const drawKusazuriPanel = (startX, startY, endXOffset, endY, widthBack, widthFront, color, edgeColor) => {
            const bX = nx * dir;
            const bY = ny * dir;
            const fX = -nx * dir;
            const fY = -ny * dir;
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(startX + bX * widthBack, startY + bY * widthBack);
            ctx.lineTo(startX + fX * widthFront, startY + fY * widthFront);
            ctx.lineTo(startX + endXOffset + fX * (widthFront + 1), startY + endY + fY * widthFront);
            ctx.lineTo(startX + endXOffset + bX * (widthBack + 1), startY + endY + bY * widthBack);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = edgeColor;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(startX + endXOffset + fX * (widthFront + 1), startY + endY + fY * widthFront);
            ctx.lineTo(startX + endXOffset + bX * (widthBack + 1), startY + endY + bY * widthBack);
            ctx.stroke();
        };

        const baseY = hipY - 4.5;
        drawKusazuriPanel(torsoHipX + nx * dir * 1.5, baseY, nx * dir * skirtSpread * 0.4 - dir * 0.5, skirtLen, 2.0, 2.0, cArmor, '#b09240');
        drawKusazuriPanel(torsoHipX, baseY, -nx * dir * skirtSpread * 0.1, skirtLen, 3.2, 3.2, '#0a0a0d', '#b09240');
        drawKusazuriPanel(torsoHipX - nx * dir * 1.8, baseY, -nx * dir * skirtSpread * 0.3 + dir * 1.0, skirtLen, 1.5, 1.5, cArmor, '#b09240');
    };

    // 頭部
    PlayerClass.prototype._drawShogunHead = function(ctx, p) {
        const { headCenterX, headY, headRadius, silhouetteColor, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand } = p;
        if (silhouetteOutlineEnabled) {
            ctx.strokeStyle = silhouetteOutlineColor;
            ctx.lineWidth = outlineExpand;
            ctx.beginPath(); ctx.arc(headCenterX, headY, headRadius, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = silhouetteColor;
        ctx.beginPath(); ctx.arc(headCenterX, headY, headRadius, 0, Math.PI * 2); ctx.fill();

        this._drawShogunHelmetOverlay(ctx, p);
    };

    // 兜オーバーレイ
    PlayerClass.prototype._drawShogunHelmetOverlay = function(ctx, p) {
        const { headCenterX, headY, headRadius, dir } = p;
        const hr = headRadius;
        ctx.save();
        ctx.translate(headCenterX, headY);
        ctx.scale(dir, 1);

        const helmBaseY = -hr * 0.15;
        const cDome   = '#111116';
        const cEdge   = '#0a0a0e';
        const cShik   = '#131316';
        const cShikLn = '#0a0a0e';
        const domeW = hr * 1.1; 
        const domeH = hr * 1.1; 
        const domeTopY = helmBaseY - domeH;

        const drawHorn = (isFar) => {
            const cGold = isFar ? '#a08832' : '#dcb854';
            const hp = (typeof window !== 'undefined' && window.hornParams) || {
                farBaseX: -0.03, farBaseY: 0.18, farAngle: 7.00, farTipX: 0.20, farFront: 0.40, farBack: -0.14, farLength: 2.60, farRoot: 2.00,
                nearBaseX: -0.24, nearBaseY: 0.69, nearAngle: -7.00, nearTipX: 0.22, nearFront: -0.10, nearBack: 0.28, nearLength: 2.60, nearRoot: 2.00
            };
            const bx = isFar ? domeW * hp.farBaseX : domeW * hp.nearBaseX;
            const by = isFar ? helmBaseY - domeH * hp.farBaseY : helmBaseY - domeH * hp.nearBaseY;
            const hw = hr * 0.12; 
            ctx.fillStyle = cGold;
            ctx.beginPath();
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate((isFar ? hp.farAngle : hp.nearAngle) * Math.PI / 180);
            if (isFar) {
                const tipX = 0 - hr * hp.farTipX;
                const tipY = 0 - hr * hp.farLength;
                ctx.moveTo(0 + hw, 0 + hw * 0.5);
                ctx.quadraticCurveTo(0 + hw + hr * hp.farFront, 0 - hr * 0.8, tipX, tipY);
                ctx.quadraticCurveTo(0 - hr * hp.farBack, 0 - hr * 0.8, 0 - hw, 0 - hw * 0.5);
                ctx.quadraticCurveTo(0, hw * hp.farRoot, 0 + hw, 0 + hw * 0.5);
            } else {
                const tipX = 0 + hr * hp.nearTipX;
                const tipY = 0 - hr * hp.nearLength;
                ctx.moveTo(0 + hw, 0 - hw * 0.5);
                ctx.quadraticCurveTo(0 + hr * hp.nearFront, 0 - hr * 0.8, tipX, tipY);
                ctx.quadraticCurveTo(0 - hw - hr * hp.nearBack, 0 - hr * 0.8, 0 - hw, 0 + hw * 0.5);
                ctx.quadraticCurveTo(0, hw * hp.nearRoot, 0 + hw, 0 - hw * 0.5);
            }
            ctx.closePath(); ctx.fill(); ctx.restore();
        };

        drawHorn(true);

        const shkSteps = 5, shkStepH = hr * 0.32, shkSpreadBack = hr * 0.15, shkSpreadFwd = hr * 0.02, shkFwdBase = hr * 0.25, shkBackBase = -hr * 1.15, shkStartY = helmBaseY - hr * 0.40;
        for (let s = shkSteps - 1; s >= 0; s--) {
            const y0 = shkStartY + shkStepH * s, y1 = shkStartY + shkStepH * (s + 1), xF0 = shkFwdBase - shkSpreadFwd * s, xB0 = shkBackBase - shkSpreadBack * s, xF1 = shkFwdBase - shkSpreadFwd * (s + 1), xB1 = shkBackBase - shkSpreadBack * (s + 1);
            ctx.fillStyle = cShik; ctx.beginPath(); ctx.moveTo(xF0, y0); ctx.lineTo(xB0, y0); ctx.lineTo(xB1, y1); ctx.lineTo(xF1, y1); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = cShikLn; ctx.lineWidth = 1.0; ctx.beginPath(); ctx.moveTo(xF0, y0); ctx.lineTo(xB0, y0); ctx.stroke();
        }
        
        ctx.fillStyle = cDome; ctx.beginPath(); ctx.moveTo(-domeW, helmBaseY);
        ctx.bezierCurveTo(-domeW * 1.15, helmBaseY - domeH * 0.6, -domeW * 0.4, domeTopY, 0, domeTopY);
        const beakRootTopX = domeW * 0.90, beakRootTopY = helmBaseY - hr * 0.25;
        ctx.bezierCurveTo(domeW * 0.6, domeTopY, domeW * 0.95, helmBaseY - domeH * 0.4, beakRootTopX, beakRootTopY);
        const beakTipX = domeW * 1.25, beakTipY = helmBaseY - hr * 0.15;
        ctx.quadraticCurveTo(domeW * 1.1, beakRootTopY - hr * 0.02, beakTipX, beakTipY);
        ctx.bezierCurveTo(domeW * 1.15, beakTipY + hr * 0.08, domeW * 1.05, helmBaseY, domeW * 0.95, helmBaseY);
        ctx.lineTo(0, helmBaseY); ctx.closePath(); ctx.fill();

        drawHorn(false);
        ctx.restore();
    };

    // 腕
    PlayerClass.prototype._drawShogunArm = function(ctx, p) {
        const { shoulderX, shoulderY, handX, handY, bendDir, bendScale, dir, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand, optionsInner } = p;
        const dx = handX - shoulderX, dy = handY - shoulderY, dist = Math.hypot(dx, dy);
        const nx = -dy / dist, ny = dx / dist;
        const closeT = Math.max(0, Math.min(1, (14.5 - dist) / 14.5)), bend = Math.min(2.5, dist * bendScale * (0.38 + closeT * 0.62)), bendSign = -bendDir;
        let elbowX = shoulderX + dx * 0.54, elbowY = shoulderY + dy * 0.54 + 0.2;
        if (optionsInner && optionsInner.preferUpwardElbow) { elbowX += nx * bend * bendSign * 0.22; elbowY -= bend * 0.96; }
        else { elbowX += nx * bend * bendSign; elbowY += ny * bend * bendSign; }
        const wristX = handX - (dx / dist) * 1.35, wristY = handY - (dy / dist) * 1.35;
        const inset = (fx, fy, tx, ty, px) => { const l = Math.hypot(tx-fx, ty-fy); if(l < 0.001) return {x:fx, y:fy}; const r = Math.min(1, px/l); return {x:fx+(tx-fx)*r, y:fy+(ty-fy)*r}; };
        const armStart = inset(shoulderX, shoulderY, elbowX, elbowY, 1.2);
        const cArmor = '#101014', cCloth = '#202020';
        if (silhouetteOutlineEnabled) { ctx.strokeStyle = silhouetteOutlineColor; ctx.lineWidth = 5.0 + outlineExpand; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(armStart.x, armStart.y); ctx.lineTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.lineTo(handX, handY); ctx.stroke(); }
        ctx.strokeStyle = cCloth; ctx.lineWidth = 5.0; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(armStart.x, armStart.y); ctx.lineTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.stroke();
        ctx.fillStyle = cArmor; ctx.beginPath(); const hW = 3.0; ctx.moveTo(elbowX - nx * hW, elbowY - ny * hW); ctx.lineTo(elbowX + nx * hW, elbowY + ny * hW); ctx.lineTo(wristX + nx * (hW - 0.5), wristY + ny * (hW - 0.5)); ctx.lineTo(wristX - nx * (hW - 0.5), wristY - ny * (hW - 0.5)); ctx.fill();
        ctx.strokeStyle = 'rgba(180, 155, 70, 0.5)'; ctx.lineWidth = 0.8;
        { const t = 0.65, lx = elbowX + (wristX - elbowX) * t, ly = elbowY + (wristY - elbowY) * t, bw = hW - 0.3; ctx.beginPath(); ctx.moveTo(lx - nx * bw, ly - ny * bw); ctx.lineTo(lx + nx * bw, ly + ny * bw); ctx.stroke(); }
        const sodeSteps = 5, sodeW = 5.0, sodeH = 13.5, padPx = shoulderX - dir * 1.5, padPy = shoulderY - 2.5;
        for (let s = 0; s < sodeSteps; s++) {
            const y0 = padPy + (sodeH / sodeSteps) * s, y1 = padPy + (sodeH / sodeSteps) * (s + 1);
            ctx.fillStyle = '#131316'; ctx.beginPath(); ctx.moveTo(padPx - sodeW, y0); ctx.lineTo(padPx + sodeW, y0); ctx.lineTo(padPx + sodeW, y1); ctx.lineTo(padPx - sodeW, y1); ctx.closePath(); ctx.fill();
            if (s === sodeSteps - 1) { ctx.strokeStyle = '#dcb854'; ctx.lineWidth = 1.5; } else { ctx.strokeStyle = '#0a0a0e'; ctx.lineWidth = 1.0; }
            ctx.beginPath(); ctx.moveTo(padPx - sodeW, y1); ctx.lineTo(padPx + sodeW, y1); ctx.stroke();
        }
        if (optionsInner) optionsInner.lastHandConnectFrom = { x: wristX, y: wristY };
        return true;
    };

    // 手
    PlayerClass.prototype._drawShogunHand = function(ctx, p) {
        const { xPos, yPos, radius, dir, isBackHand } = p;
        const handRad = radius * 0.95; 
        ctx.fillStyle = '#101014'; ctx.beginPath(); ctx.arc(xPos, yPos, handRad, 0, Math.PI * 2); ctx.fill();
        if (!isBackHand) {
            ctx.fillStyle = '#b3943d'; ctx.beginPath(); ctx.moveTo(xPos, yPos - handRad * 0.6); ctx.lineTo(xPos + dir * handRad * 0.5, yPos); ctx.lineTo(xPos, yPos + handRad * 0.6); ctx.lineTo(xPos - dir * handRad * 0.5, yPos); ctx.fill();
        }
        return true;
    };

    // 脚
    PlayerClass.prototype._drawShogunLeg = function(ctx, p) {
        const { hipX, hipYLocal, kneeX, kneeY, footX, footY, isFrontLeg, dir, silhouetteOutlineEnabled, silhouetteOutlineColor, outlineExpand } = p;
        const thighW = isFrontLeg ? 6.0 : 5.5, shinW = isFrontLeg ? 5.5 : 5.0, cArmor = '#101014', cCloth = '#202020';
        const tLen = Math.hypot(footX - kneeX, footY - kneeY) || 1, shorten = 3.5, ankleX = footX - (footX - kneeX) / tLen * shorten, ankleY = footY - (footY - kneeY) / tLen * shorten;
        if (silhouetteOutlineEnabled) { ctx.strokeStyle = silhouetteOutlineColor; ctx.lineWidth = thighW + outlineExpand; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(hipX, hipYLocal); ctx.lineTo(kneeX, kneeY); ctx.lineTo(ankleX, ankleY); ctx.stroke(); }
        ctx.strokeStyle = cCloth; ctx.lineWidth = thighW; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(hipX, hipYLocal); ctx.lineTo(kneeX, kneeY); ctx.stroke();
        ctx.lineWidth = shinW; ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.stroke(); ctx.lineTo(ankleX, ankleY); ctx.stroke();
        const dxS = ankleX - kneeX, dyS = ankleY - kneeY, dist = Math.hypot(dxS, dyS) || 1, sNX = -dyS / dist, sNY = dxS / dist;
        ctx.fillStyle = cArmor; ctx.beginPath(); const hw = shinW * 0.6; ctx.moveTo(kneeX - sNX * hw, kneeY - sNY * hw); ctx.lineTo(kneeX + sNX * hw, kneeY + sNY * hw); ctx.lineTo(ankleX + sNX * hw, ankleY + sNY * hw); ctx.lineTo(ankleX - sNX * hw, ankleY - sNY * hw); ctx.fill();
        ctx.beginPath(); ctx.moveTo(kneeX - sNX * hw, kneeY - sNY * hw); ctx.lineTo(kneeX + sNX * (hw + 1.5), kneeY + sNY * (hw + 1.5)); ctx.lineTo(kneeX - dxS * 0.2 + sNX * hw, kneeY - dyS * 0.2 + sNY * hw); ctx.fill();
        ctx.strokeStyle = 'rgba(180, 155, 70, 0.45)'; ctx.lineWidth = 0.8;
        { const t = 0.45, lx = kneeX + dxS * t, ly = kneeY + dyS * t, bw = hw - 0.2; ctx.beginPath(); ctx.moveTo(lx - sNX * bw, ly - sNY * bw); ctx.lineTo(lx + sNX * bw, ly + sNY * bw); ctx.stroke(); }
        const bootW = isFrontLeg ? 3.5 : 3.0, bootH = 2.0, bootCX = footX + dir * 0.8, bY = footY + 1.8;
        ctx.fillStyle = '#0a0a0e'; ctx.beginPath(); ctx.ellipse(bootCX, bY - bootH, bootW, bootH, 0, Math.PI, Math.PI * 2); ctx.lineTo(bootCX + bootW, bY); ctx.lineTo(bootCX - bootW, bY); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b3943d'; ctx.beginPath(); ctx.ellipse(bootCX + dir * bootW * 0.5, bY - bootH * 0.4, bootW * 0.5, bootH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        return true;
    };
}
