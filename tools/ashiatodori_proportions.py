"""
あしあとどりの**頭・嘴・胴の比率**を設定画から測り、モデルの定数と並べる。

    python3 tools/ashiatodori_proportions.py

「一目見た印象は合っているのに設定画とは別解釈になる」という指摘を
何度も受けた原因は、ディテールではなく**大きな形の比率**だった。
比率は目で合わせられないので、測って表にして固定する。

測り方の肝は2つ:

* **嘴を骸から切り離してから測る。** 嘴は骨と同じ生成りなので、
  マスクでは1つの塊になる。半径 11mm で侵食すると細い嘴だけが消えるので、
  そこから膨張し直して骸を取り出す。切らずに測っていたときは骸を
  98 x 102mm(実際は 88 x 86mm)と読み違えていた(handbook 4-127)。
* **奥行きは側面図からしか取れないが、側面図は 1 割小さく描かれている。**
  眼窩の中心の高さ(正面 196mm / 側面 184.5mm)と骸の高さ(86 / 76mm)で
  そう分かる。奥行きは眼を基準に 1.105 倍して使う。

モデル側の値は `tools/models/ashiatodori.py` から ast で読む。
"""
from __future__ import annotations

import ast
import math
import os
import sys

import numpy as np
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from ashiatodori_compare import HEIGHT_MM, VIEWS, panel, sheet_mask  # noqa: E402

MODEL = os.path.join(ROOT, "tools", "models", "ashiatodori.py")
SIDE_SCALE = 1.105       # 側面図の縮み(眼窩の高さと骸の高さから)
ERODE_MM = 11.0          # 嘴を落とす侵食の半径


def _disk(r):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def _largest(m):
    lab, n = ndimage.label(m, np.ones((3, 3), bool))
    if not n:
        return m
    return lab == int(np.argmax(ndimage.sum(m, lab, range(1, n + 1)))) + 1


def measure(view):
    """(骸のマスク, 嘴のマスク, mm/px, 接地行, 横の原点, 符号)"""
    m, a, top, ground = sheet_mask(view)
    mm = HEIGHT_MM / (ground - top + 1)
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    bone = _largest(m & (lum > 120) & (a[..., 0] - a[..., 2] > 18)
                    & (a[..., 1] - a[..., 2] > 2))
    bone = ndimage.binary_fill_holes(bone)
    r = int(round(ERODE_MM / mm))
    core = _largest(ndimage.binary_erosion(bone, _disk(r)))
    skull = ndimage.binary_dilation(core, _disk(r)) & bone
    if view == "side":
        r0, r1 = int(ground - 200 / mm), int(ground - 110 / mm)
        origin, sgn = np.nonzero(m[max(0, r0):r1 + 1].any(0))[0].max(), -1.0
    else:
        xs = np.nonzero(m)[1]
        origin, sgn = (xs.min() + xs.max()) / 2, 1.0
    return skull, bone & ~skull, m, mm, ground, origin, sgn


def box(mask, mm, ground, origin, sgn):
    ys, xs = np.nonzero(mask)
    u = [(xs.min() - origin) * mm * sgn, (xs.max() - origin) * mm * sgn]
    return dict(w=(xs.max() - xs.min() + 1) * mm, h=(ys.max() - ys.min() + 1) * mm,
                z_hi=(ground - ys.min()) * mm, z_lo=(ground - ys.max()) * mm,
                u_lo=min(u), u_hi=max(u))


def model_consts():
    tree = ast.parse(open(MODEL, encoding="utf-8").read())
    got = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name):
            try:
                got[node.targets[0].id] = ast.literal_eval(node.value)
            except ValueError:
                pass
    return got


def front_beak():
    """正面図の嘴(黄土色)の最大幅と先端の高さ。骨より彩度が高く暗い。"""
    m, a, top, ground = sheet_mask("front")
    mm = HEIGHT_MM / (ground - top + 1)
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    beak = _largest(m & (lum > 105) & (lum < 175)
                    & (a[..., 0] - a[..., 2] > 26) & (a[..., 1] - a[..., 2] > 10))
    beak = ndimage.binary_fill_holes(beak)
    ys, xs = np.nonzero(beak)
    widths = [(beak[r].sum()) * mm for r in range(ys.min(), ys.max() + 1)]
    return max(widths), (ground - ys.max()) * mm


def body_rows(s):
    """設定画とモデルの「羽込みの塊」を正面から比べるための行。"""
    m, _a, top, ground = sheet_mask("front")
    mm = HEIGHT_MM / (ground - top + 1)
    rows = [("設定画", m, mm, ground)]
    gate = os.path.join(ROOT, "tools", "preview", "silhouettes",
                        "ashiatodori-gate-front.png")
    if os.path.exists(gate):
        from PIL import Image
        mm2 = np.asarray(Image.open(gate).convert("L")) < 128
        ys = np.nonzero(mm2.any(1))[0]
        rows.append(("モデル", mm2, HEIGHT_MM / (ys.max() - ys.min() + 1), ys.max()))
    else:
        print("  (モデル側は tools/ashiatodori_compare.py を先に走らせると出る)")
    return rows


def width_profile(mask, mm, ground, step=4.0):
    ys = np.nonzero(mask.any(1))[0]
    out = []
    z = (ground - ys.min()) * mm
    while z >= (ground - ys.max()) * mm:
        r = int(round(ground - z / mm))
        if 0 <= r < mask.shape[0]:
            idx = np.nonzero(mask[r])[0]
            if len(idx):
                out.append((z, (idx.max() - idx.min() + 1) * mm))
        z -= step
    return out


def main() -> int:
    s = {}
    for v in VIEWS:
        skull, beak, body, mm, ground, origin, sgn = measure(v)
        s[v] = dict(skull=box(skull, mm, ground, origin, sgn),
                    body=box(body, mm, ground, origin, sgn))
        if beak.sum() > 400:
            s[v]["beak"] = box(beak, mm, ground, origin, sgn)

    c = model_consts()
    rings = c["SKULL_RINGS"]
    rx = max(r[1] for r in rings) * 2000.0
    ry_f = min(r[3] - r[2] for r in rings)
    ry_b = max(r[3] + r[2] for r in rings)
    top, h = c["SKULL_TOP"] * 1000, c["SKULL_H"] * 1000
    spine = c["BEAK_SPINE"]

    print("== 骸  (mm)             設定画            モデル")
    print(f"  幅              {s['front']['skull']['w']:8.1f}  "
          f"(背面 {s['back']['skull']['w']:.1f})  {rx:8.1f}")
    print(f"  高さ            {s['front']['skull']['h']:8.1f}  "
          f"(側面 {s['side']['skull']['h'] * SIDE_SCALE:.1f})  {h:8.1f}")
    print(f"  奥行き          {s['side']['skull']['w'] * SIDE_SCALE:8.1f}"
          f"  (素 {s['side']['skull']['w']:.1f})   {(ry_b - ry_f) * 1000:8.1f}")
    print(f"  頭頂 z          {s['front']['skull']['z_hi']:8.1f}            {top:8.1f}")
    print(f"  下縁 z          {s['front']['skull']['z_lo']:8.1f}"
          f"            {top - h:8.1f}")
    print(f"  全高に対する幅  {s['front']['skull']['w'] / HEIGHT_MM * 100:7.1f}%"
          f"            {rx / HEIGHT_MM * 100:7.1f}%")

    dy = (spine[-1][0] - spine[0][0]) * -1000.0
    dz = (spine[0][1] - spine[-1][1]) * 1000.0
    bw = max(p[2] for p in spine) * 2000.0
    sheet_bw, sheet_bz = front_beak()
    print("== 嘴  (mm)             設定画            モデル")
    print(f"  前へ出る量        26.0            {dy:8.1f}")
    print(f"  下がる量          66.0            {dz:8.1f}")
    print(f"  最大幅          {sheet_bw:8.1f}            {bw:8.1f}")
    print(f"  先端 z          {sheet_bz:8.1f}            "
          f"{spine[-1][1] * 1000:8.1f}")

    # 胴は羽込みの塊で比べる。芯の寸法は羽の下に隠れるので意味が薄い
    print("== 胴の塊(羽込み)  (mm)  設定画          モデル")
    for label, mask, mm, ground in body_rows(s):
        prof = width_profile(mask, mm, ground)
        wmax = max(w for _z, w in prof)
        z_at = next(z for z, w in prof if w == wmax)
        z_end = next((z for z, w in prof if z < z_at and w < wmax * 0.6), 0.0)
        print(f"  {label:14s} 最大幅 {wmax:6.1f} (z={z_at:5.1f})  "
              f"塊の下端 z={z_end:5.1f}")
    print()
    print("※ 奥行きは側面図を眼窩基準で 1.105 倍したもの。素の値も併記した")
    print("※ 胴の「塊の下端」は、幅が最大の 60% を切る高さ(脚が出るところ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
