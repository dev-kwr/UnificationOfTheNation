import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    old_scale = """                        // ベジェ曲線制御点もscale
                        trailCurveStartX: Number.isFinite(p.trailCurveStartX)
                            ? pivotX + (p.trailCurveStartX - pivotX) * renderScale
                            : p.trailCurveStartX,"""

    new_scale = """                        // ベジェ曲線制御点もscale
                        // trailCurveStartX は静的絶対座標であり、p.playerX(移動後)をpivotにすると破綻するため、
                        // 最初のポイントのoriginX(開始位置)を基準にスケールするか、undefinedにして動的サンプリング(firstSrc)に任せる。
                        // 動的サンプリングの方が実プレイの挙動に忠実なため、ここでは破棄する。
                        trailCurveStartX: undefined,"""

    if old_scale in content:
        content = content.replace(old_scale, new_scale)
        with open(filepath, 'w') as f:
            f.write(content)
        print("Patched boss.js successfully")
    else:
        print("Could not find the target string in boss.js")

patch_file('/Users/kaworu/Desktop/UnificationOfTheNation/js/boss.js')
