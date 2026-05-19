import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    old_logic = """            const anchoredStart = (
                comboStep === 2 &&
                Number.isFinite(lastAnchorSrc?.trailCurveStartX) &&
                Number.isFinite(lastAnchorSrc?.trailCurveStartY)
            )
                ? {
                    ...firstSrc,
                    x: lastAnchorSrc.trailCurveStartX,
                    y: lastAnchorSrc.trailCurveStartY
                }
                : firstSrc;
            const start = anchoredStart;"""

    new_logic = """            // anchoredStart は固定座標への強制割り当てを行っており、実際の剣先のサンプリング座標(firstSrc)と乖離するため、
            // 軌跡が根元で歪む原因になっていました。ここでは素直に実際の剣先座標(firstSrc)を開始点として採用します。
            const start = firstSrc;"""

    if old_logic in content:
        content = content.replace(old_logic, new_logic)
        with open(filepath, 'w') as f:
            f.write(content)
        print("Patched playerSlashTrail.js successfully")
    else:
        print("Could not find the target string in playerSlashTrail.js")

patch_file('/Users/kaworu/Desktop/UnificationOfTheNation/js/playerSlashTrail.js')
