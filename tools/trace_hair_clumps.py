"""
設定画から**毛束(clump)の毛先**を測り、hair-clumps.json の下ごしらえをする
(plan/models/garudo-hair-clumps.md 実装順序1)。

髪を「シルエットに幅を合わせた殻」ではなく「設定画に描かれている毛束の
集合」として作り直すための第一歩。顔で得た原則「なぞれるものを手で
描かない」をここでも守り、**測れるものは測る**。

測れるもの / 測れないもの:

- **毛先(外周)**: 髪のシルエットが外へ張り出す極大。自動で取れる
- **毛先(前髪)**: 額の上で髪の下端が下へ降りる極小。自動で取れる
- **根元・中間**: 他の毛束の下に隠れていて輪郭に出ない。**人手で置く**

出力は測った毛先の一覧(標準出力)と、
design/characters/<名前>/hair-clumps.json の `tips` 欄。
`clumps` 欄(root/mid を含む毛束の定義)は人が書く。再生成しても
`clumps` は保持する。

    tools/venv/bin/python tools/trace_hair_clumps.py garudo

座標系は顔一致QA(tools/compare_face.py)と同一のモデル座標(m)。
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import compare_face as F  # noqa: E402
import trace_face_svg as T  # noqa: E402
import numpy as np  # noqa: E402

# 毛先とみなす張り出しの最小値(mm)。これ未満は輪郭のうねり
MIN_PROMINENCE = 1.8
# 同じ毛先とみなす高さの近さ(mm)
MERGE_Z = 7.0


def _run_extreme(row: "np.ndarray", first: bool, run: int = 3):
    """
    行の端。**単独の点は端と認めない**(run画素つながっていること)。

    設定画には薄い罫線や紙の汚れがあり、1画素の点を端として拾うと
    毛先が実在しない位置に出る(実測: z956.5で-51mm。実際の輪郭は
    -38mm。罫線を毛束だと思い込んで髪を13mm広げるところだった)。
    """
    cols = np.where(row)[0]
    if len(cols) < run:
        return None
    order = cols if first else cols[::-1]
    step = 1 if first else -1
    for i in range(len(order) - run + 1):
        if order[i + run - 1] - order[i] == step * (run - 1):
            return int(order[i])
    return None


def _median3(arr: "np.ndarray", half: int = 2):
    """縦方向の中央値。1〜2行だけのとげを均す"""
    out = np.full_like(arr, np.nan)
    for i in range(len(arr)):
        win = arr[max(0, i - half):i + half + 1]
        win = win[~np.isnan(win)]
        if len(win):
            out[i] = np.median(win)
    return out


def outer_tips(head: "np.ndarray", z0: float, z1: float):
    """
    髪のシルエットが外へ張り出す極大 = 外周の毛先。

    左右それぞれ、高さごとの外端を取り、局所的な極大を拾う。
    """
    xs = np.arange(F.RES_X) / F.PX_PER_UNIT - F.WIN_HALF_X
    zs = F.WIN_Z1 - np.arange(F.RES_Y) / F.PX_PER_UNIT
    left = np.full(F.RES_Y, np.nan)
    right = np.full(F.RES_Y, np.nan)
    for r in range(F.RES_Y):
        lo = _run_extreme(head[r], True)
        hi = _run_extreme(head[r], False)
        if lo is not None:
            left[r] = xs[lo]
        if hi is not None:
            right[r] = xs[hi]
    left, right = _median3(left), _median3(right)
    out = []
    for side, arr, sign in (("L", right, 1.0), ("R", left, -1.0)):
        found = []
        for r in range(3, F.RES_Y - 3):
            z = zs[r]
            if not (z0 < z < z1) or np.isnan(arr[r]):
                continue
            win = arr[max(0, r - 9):r + 10]
            win = win[~np.isnan(win)]
            if len(win) < 8:
                continue
            if arr[r] * sign < (win * sign).max():
                continue
            if (arr[r] - np.nanmedian(win)) * sign < MIN_PROMINENCE / 1000.0:
                continue
            found.append((float(z), float(arr[r])))
        for z, x in found:
            if out and out[-1][0] == side and abs(out[-1][2] - z) < MERGE_Z / 1000.0:
                if abs(x) > abs(out[-1][1]):
                    out[-1] = (side, x, z)
                continue
            out.append((side, x, z))
    return out


def fringe_tips(hair: "np.ndarray", skin: "np.ndarray"):
    """
    額の上で髪の下端が下へ降りる極小 = 前髪の毛先。

    列ごとに「肌より上にある髪の下端」を取る。外周の毛先と違って
    シルエットには出ないが、**顔にかかる前髪の形を決めるのはこちら**。
    """
    xs = np.arange(F.RES_X) / F.PX_PER_UNIT - F.WIN_HALF_X
    zs = F.WIN_Z1 - np.arange(F.RES_Y) / F.PX_PER_UNIT
    bottom = np.full(F.RES_X, np.nan)
    for c in range(F.RES_X):
        if abs(xs[c]) > 0.075:
            continue
        sk = np.where(skin[:, c])[0]
        hr = np.where(hair[:, c])[0]
        if not len(sk) or not len(hr):
            continue
        # 肌の一番上より上にある髪のうち、一番下の行
        above = hr[hr < sk.min()]
        if not len(above):
            continue
        bottom[c] = zs[above.max()]
    out = []
    for c in range(3, F.RES_X - 3):
        if np.isnan(bottom[c]):
            continue
        win = bottom[max(0, c - 11):c + 12]
        win = win[~np.isnan(win)]
        if len(win) < 10:
            continue
        if bottom[c] > win.min():
            continue
        if np.nanmedian(win) - bottom[c] < MIN_PROMINENCE / 1000.0:
            continue
        if out and abs(out[-1][0] - xs[c]) < 0.010:
            if bottom[c] < out[-1][1]:
                out[-1] = (float(xs[c]), float(bottom[c]))
            continue
        out.append((float(xs[c]), float(bottom[c])))
    return out


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "garudo"
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ref_path = os.path.join(root, "design", "characters", name, "face-reference.json")
    with open(ref_path, encoding="utf-8") as fh:
        ref = json.load(fh)
    sys.path.insert(0, os.path.join(root, "tools", "models"))
    import importlib
    model = importlib.import_module(name)

    sheet = F.load_image(os.path.join(root, "design", "characters", name,
                                      "generated", f"{name}-sheet.png"))
    # **2つの絵から測って併せる**。三面図の正面図は顔一致QAが基準に
    # している絵なので、毛先の数値がそのままQAと比べられる。表情の
    # 区画は1.5倍細かいので、輪郭に出ない前髪の毛先を拾いやすい
    # (実測: 正面図0.65px/mm・表情0.97px/mm)
    _, bbox = F.sheet_front_figure(sheet, ref["front_crop"])
    front = F.resample_sheet(sheet, bbox, float(ref["model_height"]))[:, :, :3]
    crisp = F.resample_sheet(sheet, bbox, float(ref["model_height"]),
                             smooth=False)[:, :, :3]
    pair = F.eye_pair(F.classify(crisp), ref["bands"]["eye"])
    front = np.roll(front, int(round(-pair["mid_x"] * F.PX_PER_UNIT)), axis=1)
    front = np.ascontiguousarray(front, dtype=np.float32)

    expr, cal = T.expression_window(sheet, ref["expressions"]["通常"], model, ref)
    expr = np.ascontiguousarray(expr[:, :, :3], dtype=np.float32)

    print(f"表情の区画の倍率 {cal[0] * 1000:.4f} mm/px\n")
    print(f"{'種類':<8}{'側':<4}{'x(mm)':>9}{'z(mm)':>9}  出典")
    tips = []

    def add(kind, side, x, z, src):
        for t in tips:
            if t["kind"] == kind and abs(t["x"] - x) < 0.012 \
                    and abs(t["z"] - z) < 0.012:
                return                       # 同じ毛先は1つにする
        tips.append({"kind": kind, "side": side,
                     "x": round(float(x), 4), "z": round(float(z), 4),
                     "src": src})
        label = "外周" if kind == "outer" else "前髪"
        print(f"{label:<8}{side:<4}{x * 1000:>9.1f}{z * 1000:>9.1f}  {src}")

    for src, img in (("正面図", front), ("表情", expr)):
        m = F.classify(img)
        head = m["hair"] | m["skin"]
        for side, x, z in outer_tips(head, model.CHIN_Z + 0.02, 0.99):
            add("outer", side, x, z, src)
    for src, img in (("正面図", front), ("表情", expr)):
        m = F.classify(img)
        for x, z in fringe_tips(m["hair"], m["skin"]):
            add("fringe", "L" if x > 0 else "R", x, z, src)

    out_path = os.path.join(root, "design", "characters", name, "hair-clumps.json")
    data = {}
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            data = json.load(fh)
    data["_comment"] = (
        "髪の毛束の基準(plan/models/garudo-hair-clumps.md)。"
        "tips は tools/trace_hair_clumps.py が設定画から測った毛先で、"
        "再生成すると上書きされる。clumps は人が書く毛束の定義で、"
        "root/mid は他の毛束の下に隠れていて輪郭から測れないため。"
        "座標は顔一致QAと同じモデル座標(m)")
    data["tips"] = tips
    data.setdefault("clumps", [])
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(f"\n毛先 {len(tips)}点 → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
