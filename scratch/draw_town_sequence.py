#!/usr/bin/env python3
# stage4 城下町の並び(全9区画)を実パーツ画像で俯瞰表示し、shops の位置(中央/1回)を示す。
from PIL import Image, ImageDraw, ImageFont

ROWS = [
    ("townMachiya", -36, 906), ("townNagaya", 848, 896), ("townMachiya", 1722, 906),
    ("townNagaya", 2606, 896), ("townShops", 3480, 882), ("townMachiya", 4340, 906),
    ("townNagaya", 5224, 896), ("townMachiya", 6098, 906), ("townNagaya", 6982, 896),
]
IMG = {
    "townMachiya": "images/stage4_town_part_machiya.png",
    "townShops": "images/stage4_town_part_shops.png",
    "townNagaya": "images/stage4_town_part_nagaya.png",
}
APPROACH_X = 7878
STAGE_MID = 3921  # 町並みの列の中央（前後4区画ずつ）
H_GAME = 350
SCALE = 0.34
MINX = -60
TOP = 70
BOT = 46

def font(sz, jp=False):
    paths = (["/System/Library/Fonts/Hiragino Sans GB.ttc"] if jp else []) + [
        "/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"]
    for p in paths:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            pass
    return ImageFont.load_default()

def wx(x):
    return int((x - MINX) * SCALE)

world_right = APPROACH_X + 260
W = wx(world_right)
bh = int(H_GAME * SCALE)
Hh = TOP + bh + BOT
canvas = Image.new("RGB", (W, Hh), (16, 20, 32))
d = ImageDraw.Draw(canvas)
base = TOP + bh  # 建物の底辺

cache = {}
for key, x, w in ROWS:
    if key not in cache:
        cache[key] = Image.open(IMG[key]).convert("RGBA")
    im = cache[key]
    dw, dh = int(w * SCALE), bh
    im2 = im.resize((dw, dh), Image.LANCZOS)
    px = wx(x)
    shops = (key == "townShops")
    if not shops:
        # 繰り返しパーツは少し暗くしてアクセントを際立たせる
        dark = Image.new("RGBA", im2.size, (0, 0, 0, 90))
        im2 = Image.alpha_composite(im2, dark)
    canvas.paste(im2, (px, TOP), im2)
    if shops:
        d.rectangle([px - 2, TOP - 2, px + dw + 1, base + 1], outline=(120, 230, 255), width=3)

# stage中央の縦線
mx = wx(STAGE_MID)
for yy in range(TOP - 6, base + 6, 10):
    d.line([(mx, yy), (mx, yy + 5)], fill=(255, 210, 60), width=2)

fj = font(20, jp=True)
fs = font(16)
# shops ラベル
sx = wx(3480)
d.rectangle([sx - 2, TOP - 30, sx + 250, TOP - 6], fill=(0, 0, 0))
d.text((sx + 2, TOP - 28), "Shops（1回・列の中央）", fill=(120, 230, 255), font=fj)
# 列の中央ラベル
d.rectangle([mx - 2, base + 4, mx + 176, base + 26], fill=(0, 0, 0))
d.text((mx + 2, base + 5), "列の中央 x3921", fill=(255, 210, 60), font=fs)
# 進行方向 / 城
d.text((6, base + 5), "◀ スタート側", fill=(200, 200, 200), font=fs)
ax = wx(APPROACH_X)
d.line([(ax, TOP - 4), (ax, base + 4)], fill=(200, 120, 120), width=2)
d.text((min(W - 190, ax + 4), TOP + 4), "→ 武家屋敷/城", fill=(230, 150, 150), font=fs)
# タイトル
d.rectangle([6, 6, 560, 34], fill=(0, 0, 0))
d.text((10, 9), "stage4 城下町の並び  M=町家 N=長屋 S=店(緑青赤)", fill=(235, 235, 235), font=fj)
# パターン
d.text((10, 40), "M N M N [S] M N M N  （前後4区画ずつ）", fill=(150, 220, 160), font=font(18, jp=True))

canvas.save("scratch/stage4_town_multi_sequence_preview.png")
print("saved", canvas.size)
