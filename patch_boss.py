import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Update startComboAttack to use actorBaseHeight instead of PLAYER.HEIGHT
    old_startCombo = """        const actorY = this.y + this.height * 0.62 - PLAYER.HEIGHT * 0.62 + actorFootGroundOffset;
        const profile = this.actor.buildComboAttackProfileWithTrail(step, {
            x: actorX,
            y: actorY,
            width: this.actorBaseWidth,
            height: PLAYER.HEIGHT,
            facingRight: this.facingRight,
            isCrouching: false,
            vx: this.vx,
            vy: this.vy,
            speed: this.speed
        });
        if ((step === 4 || step === 5) && renderScale > 1.001) {
            const sweepScale = 1 / renderScale;
            const pivotX = actorX + this.actorBaseWidth * 0.5;
            const pivotY = actorY + PLAYER.HEIGHT * 0.62;
            if (Number.isFinite(pivotX) && Number.isFinite(pivotY)) {
                if (Number.isFinite(profile.trailCurveStartX)) {
                    profile.trailCurveStartX = pivotX + (profile.trailCurveStartX - pivotX) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveStartY)) {
                    profile.trailCurveStartY = pivotY + (profile.trailCurveStartY - pivotY) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveControlX)) {
                    profile.trailCurveControlX = pivotX + (profile.trailCurveControlX - pivotX) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveControlY)) {
                    profile.trailCurveControlY = pivotY + (profile.trailCurveControlY - pivotY) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveEndX)) {
                    profile.trailCurveEndX = pivotX + (profile.trailCurveEndX - pivotX) * sweepScale;
                }
                if (Number.isFinite(profile.trailCurveEndY)) {
                    profile.trailCurveEndY = pivotY + (profile.trailCurveEndY - pivotY) * sweepScale;
                }
            }
        }"""
    
    new_startCombo = """        const actorH = this.actorBaseHeight || Math.max(1, Math.round(this.height / renderScale));
        const actorY = this.y + this.height * 0.62 - actorH * 0.62 + actorFootGroundOffset;
        const profile = this.actor.buildComboAttackProfileWithTrail(step, {
            x: actorX,
            y: actorY,
            width: this.actorBaseWidth,
            height: actorH,
            facingRight: this.facingRight,
            isCrouching: false,
            vx: this.vx,
            vy: this.vy,
            speed: this.speed
        });"""

    content = content.replace(old_startCombo, new_startCombo)

    # 2. Add trail updates to end of update()
    old_update_end = """        } else {
            this.isAttacking = false;
            // プレビューモード等のために、projectileがなくても _subWeaponKey が明示的にセットされている間はクリアしない
            if (!this._keepSubWeaponKey) {
                this._currentAttackProfile = null;
            }
        }
    }"""
    
    new_update_end = """        } else {
            this.isAttacking = false;
            // プレビューモード等のために、projectileがなくても _subWeaponKey が明示的にセットされている間はクリアしない
            if (!this._keepSubWeaponKey) {
                this._currentAttackProfile = null;
            }
        }

        if (typeof this.actor.updateComboSlashTrail === 'function') {
            this.actor.updateComboSlashTrail(deltaMs);
        }
        if (typeof this.actor.updateDualBladeSlashTrails === 'function') {
            this.actor.updateDualBladeSlashTrails(deltaMs);
        }
        if (typeof this.actor.updateSpecialCloneSlashTrails === 'function') {
            this.actor.updateSpecialCloneSlashTrails(deltaMs);
        }
    }"""

    content = content.replace(old_update_end, new_update_end)

    # 3. Update getAttackHitbox to use actorH
    old_hitbox = """            const actorW = this.actorBaseWidth || Math.max(1, Math.round(this.width / renderScale));
            const actorFootGroundOffset = 0;
            const actorX = this.x + this.width * 0.5 - actorW * 0.5;
            const actorY = this.y + this.height * 0.62 - PLAYER.HEIGHT * 0.62 + actorFootGroundOffset;
            const actorBoxes = this.actor.getAttackHitbox({
                state: {
                    isAttacking: true,
                    currentAttack: this._currentAttackProfile,
                    attackTimer: this._attackTimer,
                    x: actorX,
                    y: actorY,
                    width: actorW,
                    height: PLAYER.HEIGHT,
                    facingRight: this.facingRight,
                    isCrouching: false
                }
            });
            if (actorBoxes) {
                const pivotX = actorX + actorW * 0.5;
                const pivotY = actorY + PLAYER.HEIGHT * 0.62;"""
    
    new_hitbox = """            const actorW = this.actorBaseWidth || Math.max(1, Math.round(this.width / renderScale));
            const actorH = this.actorBaseHeight || Math.max(1, Math.round(this.height / renderScale));
            const actorFootGroundOffset = 0;
            const actorX = this.x + this.width * 0.5 - actorW * 0.5;
            const actorY = this.y + this.height * 0.62 - actorH * 0.62 + actorFootGroundOffset;
            const actorBoxes = this.actor.getAttackHitbox({
                state: {
                    isAttacking: true,
                    currentAttack: this._currentAttackProfile,
                    attackTimer: this._attackTimer,
                    x: actorX,
                    y: actorY,
                    width: actorW,
                    height: actorH,
                    facingRight: this.facingRight,
                    isCrouching: false
                }
            });
            if (actorBoxes) {
                const pivotX = actorX + actorW * 0.5;
                const pivotY = actorY + actorH * 0.62;"""

    content = content.replace(old_hitbox, new_hitbox)

    # 4. Remove special clone trail update from renderBody
    old_renderBody_clone_update = """        const shouldUpdateBodyTrail = this._ougiActive ||
            this._attackTimer > 0 ||
            (Array.isArray(bodyTrailPoints) && bodyTrailPoints.length > 0);
        if (shouldUpdateBodyTrail && typeof this.actor.updateSpecialCloneSlashTrails === 'function') {
            const trailDeltaMs = (typeof this._lastDeltaMs === 'number') ? this._lastDeltaMs : 16;
            this.actor.updateSpecialCloneSlashTrails(trailDeltaMs);
        }"""
    
    new_renderBody_clone_update = """        const shouldUpdateBodyTrail = this._ougiActive ||
            this._attackTimer > 0 ||
            (Array.isArray(bodyTrailPoints) && bodyTrailPoints.length > 0);"""

    content = content.replace(old_renderBody_clone_update, new_renderBody_clone_update)

    # 5. Remove dual blade trail update from renderBody
    old_renderBody_dual_update = """        // 二刀流Zコンボのトレイル（本体描画で得た刀アンカーを使って本体と同じ順で描画）
        if (typeof this.actor.updateDualBladeSlashTrails === 'function') {
            const deltaMs = (typeof this._lastDeltaMs === 'number') ? this._lastDeltaMs : 16;
            this.actor.updateDualBladeSlashTrails(deltaMs);
        }
        if (!this.hideBody && typeof this.actor.renderDualBladeSlashTrails === 'function') {"""

    new_renderBody_dual_update = """        // 二刀流Zコンボのトレイル（本体描画で得た刀アンカーを使って本体と同じ順で描画）
        if (!this.hideBody && typeof this.actor.renderDualBladeSlashTrails === 'function') {"""
        
    content = content.replace(old_renderBody_dual_update, new_renderBody_dual_update)

    # 6. Update scaleSampledTrailPoints to use actorRenderH instead of PLAYER.HEIGHT
    old_scale = """                    const originY = Number.isFinite(p.playerY) ? p.playerY : (fallbackY - PLAYER.HEIGHT * 0.62);
                    const pivotX = originX + actorRenderW * 0.5;
                    const pivotY = originY + PLAYER.HEIGHT * 0.62;"""
    
    new_scale = """                    const originY = Number.isFinite(p.playerY) ? p.playerY : (fallbackY - actorRenderH * 0.62);
                    const pivotX = originX + actorRenderW * 0.5;
                    const pivotY = originY + actorRenderH * 0.62;"""
                    
    content = content.replace(old_scale, new_scale)

    with open(filepath, 'w') as f:
        f.write(content)
    print("Patched boss.js successfully")

patch_file('/Users/kaworu/Desktop/UnificationOfTheNation/js/boss.js')
