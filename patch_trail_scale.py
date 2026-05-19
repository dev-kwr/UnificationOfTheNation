import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    start_idx = -1
    end_idx = -1
    
    for i, line in enumerate(lines):
        if "let swordAngle = 0;" in line and "let armEndX = centerX + dir *" in lines[i+1]:
            start_idx = i
            break
            
    if start_idx == -1:
        print("Start not found")
        return
        
    for i in range(start_idx, len(lines)):
        if "let trailTipExtend = 0;" in lines[i]:
            end_idx = i
            break
            
    if end_idx == -1:
        print("End not found")
        return
        
    patch_content = """        const scale = height / 36;
        let swordAngle = 0;
        let armEndX = centerX + dir * 14 * scale;
        let armEndY = pivotY + 6 * scale;
        let activeLeftShoulderX = leftShoulderXBase;
        let activeLeftShoulderY = leftShoulderYBase;
        let activeRightShoulderX = rightShoulderXBase;
        let activeRightShoulderY = rightShoulderYBase;
        let supportGripBackDist = 6.2 * scale;
        let supportGripSideOffset = 1.0 * scale;
        let supportGripMaxReach = 22 * scale;
        let allowSupportFrontHand = options.supportRightHand !== false;

        switch (attack.comboStep) {
            case 2: {
                if (progress < 0.34) {
                    const backT = progress / 0.34;
                    const backEase = backT * backT * (3 - 2 * backT);
                    swordAngle = 2.18 + backEase * 1.34;
                    armEndX = centerX + dir * (10 - backEase * 2) * scale;
                    armEndY = pivotY + (5.0 + backEase * 3.0) * scale;
                } else {
                    const cutT = Math.min(1, (progress - 0.34) / 0.52);
                    const cutEase = cutT * cutT * (3 - 2 * cutT);
                    const settle = Math.max(0, Math.min(1, (progress - 0.86) / 0.14));
                    const settleEase = settle * settle * (3 - 2 * settle);
                    swordAngle = 3.52 + cutEase * 2.9;
                    armEndX = centerX + dir * (8 + cutEase * 6 - settleEase * 2) * scale;
                    armEndY = pivotY + (8 - cutEase * 15 + settleEase * 5) * scale;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.12));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevPose = this.getComboSwordPoseReference(
                    1,
                    1.0,
                    { x, y, width, height, facingRight, isCrouching },
                    {
                        leftShoulderX: leftShoulderXBase,
                        leftShoulderY: leftShoulderYBase,
                        rightShoulderX: rightShoulderXBase,
                        rightShoulderY: rightShoulderYBase,
                        supportRightHand: allowSupportFrontHand
                    }
                );
                const prevAngle = prevPose ? prevPose.swordAngle : 2.92;
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 5.5 * scale);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 10.0 * scale);
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                {
                    const backT2 = Math.max(0, Math.min(1, progress / 0.34));
                    const backEase2 = backT2 * backT2 * (3 - 2 * backT2);
                    const cutT2 = Math.max(0, Math.min(1, (progress - 0.34) / 0.52));
                    const cutEase2 = cutT2 * cutT2 * (3 - 2 * cutT2);
                    activeLeftShoulderX += dir * cutEase2 * 0.7 * scale;
                    activeLeftShoulderY += (backEase2 * 0.5 - cutEase2 * 0.9) * scale;
                    activeRightShoulderX += dir * cutEase2 * 0.4 * scale;
                    activeRightShoulderY += (backEase2 * 0.4 - cutEase2 * 0.7) * scale;
                }
                if (prepEase < 1) {
                    const prevLeftShX = prevPose ? prevPose.activeLeftShoulderX : leftShoulderXBase;
                    const prevLeftShY = prevPose ? prevPose.activeLeftShoulderY : leftShoulderYBase;
                    const prevRightShX = prevPose ? prevPose.activeRightShoulderX : rightShoulderXBase;
                    const prevRightShY = prevPose ? prevPose.activeRightShoulderY : rightShoulderYBase;
                    activeLeftShoulderX = prevLeftShX + (activeLeftShoulderX - prevLeftShX) * prepEase;
                    activeLeftShoulderY = prevLeftShY + (activeLeftShoulderY - prevLeftShY) * prepEase;
                    activeRightShoulderX = prevRightShX + (activeRightShoulderX - prevRightShX) * prepEase;
                    activeRightShoulderY = prevRightShY + (activeRightShoulderY - prevRightShY) * prepEase;
                }
                break;
            }
            case 1: {
                const idleAngle = isCrouching ? -0.32 : -0.65;
                const idleHandX = centerX + dir * (isCrouching ? 12 : 15) * scale;
                const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0) * scale;

                const wind = Math.max(0, Math.min(1, progress / 0.34));
                const swing = Math.max(0, Math.min(1, (progress - 0.34) / 0.48));
                const swingEase = swing * swing * (3 - 2 * swing);
                const baseArmX = centerX + dir * 15 * scale;
                const baseArmY = pivotY + 8.0 * scale;
                swordAngle = idleAngle + wind * (1.0 - idleAngle) + swingEase * 1.32;
                armEndX = idleHandX + wind * (baseArmX - idleHandX) - swingEase * 9.5 * dir * scale;
                armEndY = idleHandY + wind * (baseArmY - idleHandY) + swingEase * 2.0 * scale;

                activeLeftShoulderX -= dir * (0.6 * wind + swingEase * 1.18) * scale;
                activeLeftShoulderY += (0.2 * wind + swingEase * 0.52) * scale;
                activeRightShoulderX -= dir * (0.2 * wind + swingEase * 0.72) * scale;
                activeRightShoulderY += (0.2 * wind + swingEase * 0.48) * scale;
                break;
            }
            case 3: {
                swordAngle = -0.22 + Math.sin(progress * Math.PI) * 0.34;
                armEndX = centerX + dir * (-10 + easeInOut * 36) * scale;
                armEndY = pivotY + (9.0 - Math.sin(progress * Math.PI) * 3.1) * scale;
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevPose = this.getComboSwordPoseReference(
                    2,
                    1.0,
                    { x, y, width, height, facingRight, isCrouching },
                    {
                        leftShoulderX: leftShoulderXBase,
                        leftShoulderY: leftShoulderYBase,
                        rightShoulderX: rightShoulderXBase,
                        rightShoulderY: rightShoulderYBase,
                        supportRightHand: allowSupportFrontHand
                    }
                );
                const prevAngle = prevPose ? prevPose.swordAngle : 0.1368;
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 19.4 * scale);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 5.6 * scale);
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            case 4: {
                if (progress < 0.42) {
                    const t = progress / 0.42;
                    const rise = t * t * (3 - 2 * t);
                    swordAngle = -0.22 + (-0.74 + 0.22) * rise;
                    armEndX = centerX + dir * (26 + (8.0 - 26) * rise) * scale;
                    armEndY = pivotY + (5 + (-24.0 - 5) * rise) * scale;
                } else {
                    const flipT = Math.max(0, Math.min(1, (progress - 0.42) / 0.58));
                    const bodyFlipAngle = -Math.PI * 1.82 * flipT;
                    const flipAngle = -0.76 + bodyFlipAngle;
                    const flipX = centerX - dir * (4.0 + Math.sin(flipT * Math.PI) * 6.0) * scale;
                    const flipY = pivotY + (-14 + Math.cos(flipT * Math.PI) * 4.0) * scale;
                    const bridgeT = Math.max(0, Math.min(1, (progress - 0.42) / 0.12));
                    const bridge = bridgeT * bridgeT * (3 - 2 * bridgeT);
                    const riseAngleEnd = -0.74;
                    const riseEndX = centerX + dir * 8.0 * scale;
                    const riseEndY = pivotY - 24.0 * scale;
                    swordAngle = riseAngleEnd + (flipAngle - riseAngleEnd) * bridge;
                    armEndX = riseEndX + (flipX - riseEndX) * bridge;
                    armEndY = riseEndY + (flipY - riseEndY) * bridge;

                    const shoulderT = Math.max(0, Math.min(1, (progress - 0.5) / 0.5));
                    const shoulderEase = shoulderT * shoulderT * (3 - 2 * shoulderT);
                    activeLeftShoulderX -= dir * (0.4 + shoulderEase * 1.6) * scale;
                    activeLeftShoulderY += (0.2 + shoulderEase * 1.8) * scale;
                    activeRightShoulderX -= dir * (0.3 + shoulderEase * 1.35) * scale;
                    activeRightShoulderY += (0.2 + shoulderEase * 1.55) * scale;
                    if (progress > 0.48) {
                        allowSupportFrontHand = false;
                    }
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevPose = this.getComboSwordPoseReference(
                    3,
                    1.0,
                    { x, y, width, height, facingRight, isCrouching },
                    {
                        leftShoulderX: leftShoulderXBase,
                        leftShoulderY: leftShoulderYBase,
                        rightShoulderX: rightShoulderXBase,
                        rightShoulderY: rightShoulderYBase,
                        supportRightHand: allowSupportFrontHand
                    }
                );
                const prevAngle = prevPose ? prevPose.swordAngle : -0.22;
                const prevHandX = prevPose ? prevPose.armEndX : (centerX + dir * 26 * scale);
                const prevHandY = prevPose ? prevPose.armEndY : (pivotY + 9.0 * scale);
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            case 5: {
                if (progress < 0.26) {
                    const t = progress / 0.26;
                    swordAngle = -2.52 + t * 0.24;
                    armEndX = centerX - dir * (15.6 - t * 5.8) * scale;
                    armEndY = pivotY + (-22.8 - t * 2.8) * scale;
                } else if (progress < 0.78) {
                    const t = (progress - 0.26) / 0.52;
                    const fallEase = t * t * (3 - 2 * t);
                    swordAngle = 0.1 + fallEase * 0.08;
                    armEndX = centerX + dir * (15.6 + fallEase * 1.8) * scale;
                    armEndY = pivotY + (12.8 + fallEase * 1.4) * scale;
                } else {
                    const t = (progress - 0.78) / 0.22;
                    const settle = t * t * (3 - 2 * t);
                    swordAngle = 0.18 - settle * 0.04;
                    armEndX = centerX + dir * (17.4 - settle * 0.8) * scale;
                    armEndY = pivotY + (14.2 - settle * 0.8) * scale;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevAngle = -2.7;
                const prevHandX = centerX - dir * 4.0 * scale;
                const prevHandY = pivotY - 18.0 * scale;
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            default:
                return null;
        }

        if (recoveryBlend > 0) {
            const recover = recoveryBlend * recoveryBlend * (3 - 2 * recoveryBlend);
            const idleAngle = isCrouching ? -0.32 : -0.65;
            const idleHandX = centerX + dir * (isCrouching ? 12 : 15) * scale;
            const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0) * scale;
            
            let angleDiff = idleAngle - swordAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            swordAngle += angleDiff * recover;
            armEndX += (idleHandX - armEndX) * recover;
            armEndY += (idleHandY - armEndY) * recover;
            activeLeftShoulderX += (leftShoulderXBase - activeLeftShoulderX) * recover;
            activeLeftShoulderY += (leftShoulderYBase - activeLeftShoulderY) * recover;
            activeRightShoulderX += (rightShoulderXBase - activeRightShoulderX) * recover;
            activeRightShoulderY += (rightShoulderYBase - activeRightShoulderY) * recover;
            supportGripBackDist += (6.2 * scale - supportGripBackDist) * recover;
            supportGripSideOffset += (1.0 * scale - supportGripSideOffset) * recover;
            supportGripMaxReach += (22.0 * scale - supportGripMaxReach) * recover;
        }

        {
            const standardUpperLen = 13.6 * scale;
            const standardForeLen = 13.2 * scale;
            const mainReachCap = standardUpperLen + standardForeLen;
            const handDx = armEndX - activeLeftShoulderX;
            const handDy = armEndY - activeLeftShoulderY;
            const handDist = Math.hypot(handDx, handDy);
            if (handDist > mainReachCap && handDist > 0.0001) {
                const clampRatio = mainReachCap / handDist;
                armEndX = activeLeftShoulderX + handDx * clampRatio;
                armEndY = activeLeftShoulderY + handDy * clampRatio;
            }
        }\n"""
        
    # Python arrays: lines[:start_idx] + patch_content.splitlines(True) + lines[end_idx:]
    new_lines = lines[:start_idx] + [patch_content] + lines[end_idx:]
    
    with open(filepath, 'w') as f:
        f.writelines(new_lines)
    print("Patched scale successfully")

patch_file('/Users/kaworu/Desktop/UnificationOfTheNation/js/playerSlashTrail.js')
