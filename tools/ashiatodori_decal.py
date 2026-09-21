"""
あしあとどりの**骸の顔**を設定画から直接トレースする。

plan/models/reference-ashiatodori-sheet.png の正面図から、骸の

* 眼窩(縁の形・中の階調・上の外側の光)
* 骨の線(眼窩のまわりの縁取り、鼻腔の溝、割れ目)

を抜き出し、**骸の媒介変数 (方位角, t) の空間へ**写した1枚の PNG を作る。
モデル側(tools/models/ashiatodori.py の `bone_color`)は `_skull_uv()` で
表面の点を同じ (方位角, t) へ戻して引く。彫った眼窩と塗った眼窩が
原理的にずれない(handbook 4-110)。

    python3 tools/ashiatodori_decal.py

出力: design/characters/ashiatodori/generated/
    ashiatodori-skull-decal.png    RGBA。R=暗さ G=光 B=未使用 A=被覆
    ashiatodori-skull-decal.json   座標系
    ashiatodori-skull-decal-debug.png  抽出の確認(設定画の上に重ねた図)

**紙の色と広い陰影は写さない。** 写すと実機の陰影と二重になり、しかも
ダンジョンの寒色の灯りへの暖色補正(handbook 4-99)が効かなくなる。
持ち帰るのは「どこをどれだけ暗くするか / 光らせるか」という**意図**だけで、
色はモデル側のパレット(BONE / BONE_SHADE / EYE / EYE_HILITE)から出す。
"""
from __future__ import annotations

import ast
import json
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "plan", "models", "reference-ashiatodori-sheet.png")
MODEL = os.path.join(ROOT, "tools", "models", "ashiatodori.py")
OUT_DIR = os.path.join(ROOT, "design", "characters", "ashiatodori", "generated")

# 設定画の枠(mask.py / at_bone.py と同じ実測値)
FRONT = (585, 118, 730, 342)
MARGIN = 14
UPSCALE = 7
HEIGHT_MM = 267.0

# 写す範囲。方位角は **|cos| が 0.91 を超えると正射影が潰れる**ので、
# 顔の帯(-156〜-24度)だけにする。両端 12 度はフェードで消す
AZ0, AZ1 = -156.0, -24.0
AZ_FADE = 12.0
T0, T1 = 0.10, 1.00
TEX_W, TEX_H = 256, 208

# 抽出のしきい値(明度 0〜255)。紙 226 / 骨 147 / 羽 110 / 眼窩 36
SOCKET_LUM = 92          # 眼窩(縁の暗い帯まで含める)
SOCKET_MIN = 400         # 眼窩の最小面積(パネルpx²)
LINE_SIGMA = 9.0         # 線を取り出す高域通過のぼかし半径(パネルpx)
LINE_DROP = 14.0         # 局所平均からこれだけ暗ければ「線」
LINE_FULL = 46.0         # これだけ暗ければ線の濃さ 1.0
LINE_MAX_A = 0.55        # 線の最大の被覆。1.0 にすると 96px で煤けた顔になる
HILITE_LUM = 150         # 眼窩の中で「光」とみなす明るさ


def panel():
    x0, y0, x1, y1 = FRONT
    im = Image.open(SHEET).convert("RGB").crop(
        (x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN))
    im = im.resize((im.width * UPSCALE, im.height * UPSCALE), Image.LANCZOS)
    return np.asarray(im).astype(np.float32)


def model_consts():
    """骸の輪切りの表をモデルのソースから読む(値を二重に持たない)。"""
    tree = ast.parse(open(MODEL, encoding="utf-8").read())
    want = {"SKULL_TOP", "SKULL_H", "SKULL_RINGS"}
    got = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name) \
                and node.targets[0].id in want:
            got[node.targets[0].id] = ast.literal_eval(node.value)
    missing = want - set(got)
    if missing:
        raise SystemExit(f"{MODEL} に {sorted(missing)} が無い")
    return got["SKULL_TOP"], got["SKULL_H"], got["SKULL_RINGS"]


def ring_at(rings, t):
    t = min(rings[-1][0], max(rings[0][0], t))
    for a, b in zip(rings, rings[1:]):
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / max(b[0] - a[0], 1e-9)
            return tuple(a[1 + i] + (b[1 + i] - a[1 + i]) * f for i in range(3))
    return rings[-1][1:]


def _socket_carve(cand, lab, ground, x_origin, mm):
    """トレースした眼窩から、**彫るための** (方位角, 角度半幅, t半幅) を出す。

    モデル側の `SOCKET_AZ` / `SKULL_DENTS` の眼窩の行はこの値を書き写す。
    彫りの窓とトレースの穴が同じ大きさでないと、黒の外に彫った縁が
    残って「眼鏡」になる(handbook 4-85)。
    """
    top_m, h_m, rings = model_consts()
    for i, (_area, l) in enumerate(cand):
        ys, xs = np.nonzero(lab == l)
        z_hi = (ground - ys.min()) * mm
        z_lo = (ground - ys.max()) * mm
        t_c = (top_m * 1000 - (z_hi + z_lo) * 0.5) / (h_m * 1000)
        ht = (z_hi - z_lo) * 0.5 / (h_m * 1000)
        rx = ring_at(rings, t_c)[0] * 1000.0
        x0 = (xs.min() - x_origin) * mm
        x1 = (xs.max() - x_origin) * mm
        az = []
        for x in (x0, x1):
            az.append(-math.degrees(math.acos(max(-1.0, min(1.0, abs(x) / rx))))
                      if x > 0 else
                      -180.0 + math.degrees(math.acos(max(-1.0, min(1.0, -x / rx)))))
        a0, a1 = min(az), max(az)
        print(f"  -> 彫り{i}: 方位角 {(a0 + a1) / 2:+6.1f}度 "
              f"角度半幅 {(a1 - a0) / 2:4.1f}度  t {t_c:.4f} 半幅 {ht:.4f}")


def main():
    a = panel()
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    rows = np.nonzero((lum < 95).sum(1) >= 3)[0]
    cols = np.nonzero((lum < 95).sum(0) >= 3)[0]
    top, ground = rows.min(), rows.max()
    mm = HEIGHT_MM / (ground - top + 1)
    x_origin = (cols.min() + cols.max()) / 2.0

    # ---- 眼窩。暗い塊のうち、丸くて大きい2つ
    dark = lum < SOCKET_LUM
    lab, n = ndimage.label(dark, np.ones((3, 3), bool))
    cand = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        area = (lab[sl] == i + 1).sum()
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if area < SOCKET_MIN or w == 0 or not (0.6 < h / w < 1.9):
            continue
        if area / (h * w) < 0.5:
            continue
        cand.append((area, i + 1))
    cand.sort(reverse=True)
    if len(cand) < 2:
        raise SystemExit(f"眼窩が 2 つ見つからない(候補 {len(cand)})")
    socket = np.isin(lab, [c[1] for c in cand[:2]])
    socket = ndimage.binary_fill_holes(socket)
    for i, (area, _l) in enumerate(cand[:2]):
        ys, xs = np.nonzero(np.isin(lab, [cand[i][1]]))
        print(f"  眼窩{i} {(xs.max()-xs.min()+1)*mm:5.1f}x{(ys.max()-ys.min()+1)*mm:5.1f}mm "
              f"x={((xs.min()+xs.max())/2-x_origin)*mm:+6.1f} z={(ground-(ys.min()+ys.max())/2)*mm:6.1f}")
    _socket_carve(cand[:2], lab, ground, x_origin, mm)

    # ---- 眼窩の中の階調と光。**絵の明暗をそのまま使わず 0..1 の意図にする**
    lo, hi = np.percentile(lum[socket], (2, 98))
    inside = np.clip((lum - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    darkness = np.where(socket, 1.0 - inside * 0.55, 0.0)   # 底 1.0 / 縁 0.45
    hil = np.where(socket & (lum > HILITE_LUM),
                   np.clip((lum - HILITE_LUM) / 70.0, 0.0, 1.0), 0.0)

    # ---- 骨の線。局所平均より暗いところだけを拾う(広い陰影は捨てる)
    blur = ndimage.gaussian_filter(lum, LINE_SIGMA)
    drop = np.clip((blur - lum - LINE_DROP) / (LINE_FULL - LINE_DROP), 0.0, 1.0)
    # 骸の範囲。**明るくて暖色**で切る(羽は暗い紫、霧は明るい青紫)。
    # ここを緩く取ると線の層が体じゅうの羽の輪郭を拾う
    rb = a[..., 0] - a[..., 2]
    gb = a[..., 1] - a[..., 2]
    bone = (lum > 120) & (rb > 18) & (gb > 2)
    blab, bn = ndimage.label(bone, np.ones((3, 3), bool))
    if bn:
        sizes = ndimage.sum(bone, blab, range(1, bn + 1))
        bone = blab == int(np.argmax(sizes)) + 1
    bone = ndimage.binary_fill_holes(bone | socket)
    bone = ndimage.binary_erosion(bone, np.ones((5, 5), bool))
    line = np.where(bone & ~socket, drop * LINE_MAX_A, 0.0)

    # ---- (方位角, t) へ写す
    top_m, h_m, rings = model_consts()
    out = np.zeros((TEX_H, TEX_W, 4), np.float32)
    for j in range(TEX_H):
        t = T0 + (T1 - T0) * (j + 0.5) / TEX_H
        z_mm = (top_m - t * h_m) * 1000.0
        rx_mm = ring_at(rings, t)[0] * 1000.0
        row = ground - z_mm / mm
        r0 = int(round(row))
        if not 0 <= r0 < lum.shape[0]:
            continue
        for i in range(TEX_W):
            deg = AZ0 + (AZ1 - AZ0) * (i + 0.5) / TEX_W
            col = x_origin + rx_mm * math.cos(math.radians(deg)) / mm
            c0 = int(round(col))
            if not 0 <= c0 < lum.shape[1]:
                continue
            d, hl, ln = darkness[r0, c0], hil[r0, c0], line[r0, c0]
            cov = max(d, ln)
            if cov <= 0.0:
                continue
            fade = min(1.0, (deg - AZ0) / AZ_FADE, (AZ1 - deg) / AZ_FADE)
            out[j, i] = (max(d, ln / LINE_MAX_A * 0.55), hl, 0.0,
                         cov * max(0.0, fade))

    os.makedirs(OUT_DIR, exist_ok=True)
    img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA")
    img.save(os.path.join(OUT_DIR, "ashiatodori-skull-decal.png"))
    json.dump({"az": [AZ0, AZ1], "t": [T0, T1], "size": [TEX_W, TEX_H],
               "skull_top": top_m, "skull_h": h_m,
               "note": "R=暗さ G=光 A=被覆。方位角は横、t は縦(上=T0)"},
              open(os.path.join(OUT_DIR, "ashiatodori-skull-decal.json"), "w"),
              ensure_ascii=False, indent=1)

    # ---- 確認用。抽出した眼窩と線を設定画の上に重ねる
    dbg = a.copy()
    dbg[..., 0] = np.where(socket, 255, dbg[..., 0])
    dbg[..., 1] = np.where(socket, dbg[..., 1] * 0.3, dbg[..., 1])
    dbg[..., 2] = np.where(line > 0.05, 255, dbg[..., 2])
    Image.fromarray(np.clip(dbg, 0, 255).astype(np.uint8)).resize(
        (dbg.shape[1] // 3, dbg.shape[0] // 3)).save(
        os.path.join(OUT_DIR, "ashiatodori-skull-decal-debug.png"))
    print(f"  被覆のあるテクセル {int((out[..., 3] > 0.02).sum())} / {TEX_W * TEX_H}")
    print(f"  -> {OUT_DIR}")


if __name__ == "__main__":
    main()
