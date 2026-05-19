import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. updateComboSlashTrail
    content = content.replace(
        "    PlayerClass.prototype.updateComboSlashTrail = function(deltaMs) {\n",
        "    PlayerClass.prototype.updateComboSlashTrail = function(deltaMs) {\n        if (deltaMs <= 0) return;\n"
    )

    # 2. updateSlashTrailBuffer
    content = content.replace(
        "    PlayerClass.prototype.updateSlashTrailBuffer = function(points, sampleTimer, pose, deltaMs, options = {}) {\n",
        "    PlayerClass.prototype.updateSlashTrailBuffer = function(points, sampleTimer, pose, deltaMs, options = {}) {\n        if (deltaMs <= 0) return sampleTimer;\n"
    )

    # 3. updateSpecialCloneSlashTrails
    content = content.replace(
        "    PlayerClass.prototype.updateSpecialCloneSlashTrails = function(deltaMs) {\n",
        "    PlayerClass.prototype.updateSpecialCloneSlashTrails = function(deltaMs) {\n        if (deltaMs <= 0) return;\n"
    )

    # 4. updateDualBladeSlashTrails
    content = content.replace(
        "    PlayerClass.prototype.updateDualBladeSlashTrails = function(deltaMs) {\n",
        "    PlayerClass.prototype.updateDualBladeSlashTrails = function(deltaMs) {\n        if (deltaMs <= 0) return;\n"
    )

    with open(filepath, 'w') as f:
        f.write(content)
    print("Patched playerSlashTrail.js successfully")

patch_file('/Users/kaworu/Desktop/UnificationOfTheNation/js/playerSlashTrail.js')
