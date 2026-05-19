import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Remove the trail updates from the end
    end_old = """        if (typeof this.actor.updateComboSlashTrail === 'function') {
            this.actor.updateComboSlashTrail(deltaMs);
        }
        if (typeof this.actor.updateDualBladeSlashTrails === 'function') {
            this.actor.updateDualBladeSlashTrails(deltaMs);
        }
        if (typeof this.actor.updateSpecialCloneSlashTrails === 'function') {
            this.actor.updateSpecialCloneSlashTrails(deltaMs);
        }
    }"""
    
    end_new = """    }"""
    
    content = content.replace(end_old, end_new)

    # 2. Insert the trail updates right after this._lastDeltaMs = deltaMs;
    top_old = """        const deltaMs = deltaTime * 1000;
        this._lastDeltaMs = deltaMs;
        if (this._shurikenVisualTimer > 0) {"""
        
    top_new = """        const deltaMs = deltaTime * 1000;
        this._lastDeltaMs = deltaMs;

        if (typeof this.actor.updateComboSlashTrail === 'function') {
            this.actor.updateComboSlashTrail(deltaMs);
        }
        if (typeof this.actor.updateDualBladeSlashTrails === 'function') {
            this.actor.updateDualBladeSlashTrails(deltaMs);
        }
        if (typeof this.actor.updateSpecialCloneSlashTrails === 'function') {
            this.actor.updateSpecialCloneSlashTrails(deltaMs);
        }

        if (this._shurikenVisualTimer > 0) {"""

    content = content.replace(top_old, top_new)

    with open(filepath, 'w') as f:
        f.write(content)

patch_file('/Users/kaworu/Desktop/UnificationOfTheNation/js/boss.js')
