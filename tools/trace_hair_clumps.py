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
    tools/venv/bin/python tools/trace_hair_clumps.py garudo --ridge
    tools/venv/bin/python tools/trace_hair_clumps.py garudo --major

`--ridge` は設定画の髪の中に**描かれている分け目の線**を稜線として
抜き出した画像を出す(tools/preview/face/<名前>-hair-ridge.png)。
毛束の意味的な分解はこれを見て人が決める。

`--major` は hair-clumps.json の `major`(主要毛束の輪郭)を設定画へ
重ねた確認画像を出す。

座標系は顔一致QA(tools/compare_face.py)と同一のモデル座標(m)。
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import common as C  # noqa: E402  (bpyを先に読み込む)
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


def _blur(a, k):
    out = a.astype(np.float32).copy()
    for _ in range(k):
        out = (out + np.roll(out, 1, 0) + np.roll(out, -1, 0)
               + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 5.0
    return out


def front_window(name: str, ref: dict):
    """顔一致QAと同じウィンドウへ写した正面図(整合済み)"""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sheet = F.load_image(os.path.join(root, "design", "characters", name,
                                      "generated", f"{name}-sheet.png"))
    _, bbox = F.sheet_front_figure(sheet, ref["front_crop"])
    img = F.resample_sheet(sheet, bbox, float(ref["model_height"]))[:, :, :3]
    crisp = F.resample_sheet(sheet, bbox, float(ref["model_height"]),
                             smooth=False)[:, :, :3]
    pair = F.eye_pair(F.classify(crisp), ref["bands"]["eye"])
    shift = int(round(-pair["mid_x"] * F.PX_PER_UNIT))
    return np.ascontiguousarray(np.roll(img, shift, axis=1), dtype=np.float32)


def hair_ridges(img: "np.ndarray", cut: float = 0.40):
    """
    髪の中に**描かれている分け目の線**を、局所の平均より暗い稜線として抜く。

    毛束は色でも連結でも切り出せない(実測: どの明度で切っても髪は
    1つの塊のまま。線を太らせても閉じた面にならない)。線は毛束の
    境目を**示唆するだけで囲っていない**ので、分解は人が読む。
    この画像はその読み取りを検算できるようにするためのもの。
    """
    m = F.classify(img)
    _h, _s, val = F.hsv(img)
    zs = F.WIN_Z1 - np.arange(F.RES_Y) / F.PX_PER_UNIT
    hair = m["hair"] & (zs[:, None] > 0.815)
    base = _blur(np.where(hair, val, float(np.median(val[hair]))), 12)
    return hair, ((base - val) / 0.10 > cut) & hair


def hair_edge(img: "np.ndarray"):
    """高さzごとの髪の左右の端(モデル座標m)。輪郭に乗る点はここへ吸着させる"""
    m = F.classify(img)
    head = m["hair"] | m["skin"]
    xs = np.arange(F.RES_X) / F.PX_PER_UNIT - F.WIN_HALF_X
    zs = F.WIN_Z1 - np.arange(F.RES_Y) / F.PX_PER_UNIT
    left, right, top = {}, {}, {}
    for r in range(F.RES_Y):
        cols = np.where(m["hair"][r])[0]
        if len(cols) >= 3:
            left[round(float(zs[r]), 4)] = float(xs[cols.min()])
            right[round(float(zs[r]), 4)] = float(xs[cols.max()])
    for c in range(F.RES_X):
        rows = np.where(m["hair"][:, c])[0]
        if len(rows) >= 3:
            top[round(float(xs[c]), 4)] = float(zs[rows.min()])
    return left, right, top


def resolve_path(steps, left, right, top):
    """
    主要毛束の輪郭を組み立てる。**測れる辺は測り、測れない辺だけ手で置く**。

      ["edge", "L"|"R", z0, z1] : 髪の左右の輪郭を z0→z1 でなぞる(+xがL)
      ["top", x0, x1]           : 髪の上の輪郭を x0→x1 でなぞる
      ["at", x, z]              : 手で置いた点(毛束の内側の境目)

    毛束の内側の境目は設定画に線として描かれてはいるが、線は毛束を
    囲っていないので自動では取れない(`--ridge`の画像を見て人が置く)。
    """
    out = []
    for step in steps:
        kind = step[0]
        if kind == "at":
            out.append((float(step[1]), float(step[2])))
        elif kind == "edge":
            table = right if step[1] == "L" else left
            z0, z1 = float(step[2]), float(step[3])
            keys = sorted(k for k in table if min(z0, z1) - 1e-9 <= k <= max(z0, z1) + 1e-9)
            if z1 < z0:
                keys.reverse()
            out.extend((table[k], k) for k in keys[::3])
        elif kind == "top":
            x0, x1 = float(step[1]), float(step[2])
            keys = sorted(k for k in top if min(x0, x1) - 1e-9 <= k <= max(x0, x1) + 1e-9)
            if x1 < x0:
                keys.reverse()
            out.extend((k, top[k]) for k in keys[::3])
    return out


def draw_major(img, majors, left, right, top):
    """主要毛束の輪郭を設定画へ重ねた確認画像"""
    xs = np.arange(F.RES_X) / F.PX_PER_UNIT - F.WIN_HALF_X
    zs = F.WIN_Z1 - np.arange(F.RES_Y) / F.PX_PER_UNIT
    out = img.copy() * 0.55 + 0.45
    covered = np.zeros((F.RES_Y, F.RES_X), dtype=bool)
    palette = [(0.85,0.25,0.20),(0.20,0.45,0.85),(0.20,0.65,0.35),(0.85,0.60,0.10),
               (0.60,0.30,0.75),(0.15,0.65,0.70),(0.85,0.40,0.60),(0.45,0.45,0.20)]
    for i, clump in enumerate(majors):
        poly = resolve_path(clump["path"], left, right, top)
        if len(poly) < 3:
            continue
        px = np.array([(p[0] + F.WIN_HALF_X) * F.PX_PER_UNIT for p in poly])
        pz = np.array([(F.WIN_Z1 - p[1]) * F.PX_PER_UNIT for p in poly])
        col = np.array(palette[i % len(palette)], dtype=np.float32)
        # 走査線で塗る
        for r in range(int(pz.min()), int(pz.max()) + 1):
            if not (0 <= r < F.RES_Y):
                continue
            hits = []
            for j in range(len(poly)):
                z0, z1 = pz[j], pz[(j + 1) % len(poly)]
                if (z0 <= r < z1) or (z1 <= r < z0):
                    t = (r - z0) / (z1 - z0)
                    hits.append(px[j] + (px[(j + 1) % len(poly)] - px[j]) * t)
            hits.sort()
            for a, b in zip(hits[0::2], hits[1::2]):
                lo, hi = int(max(0, a)), int(min(F.RES_X - 1, b))
                if hi > lo:
                    out[r, lo:hi] = out[r, lo:hi] * 0.45 + col * 0.55
                    covered[r, lo:hi] = True
    return out, covered


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    name = args[0] if args else "garudo"
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ref_path = os.path.join(root, "design", "characters", name, "face-reference.json")
    with open(ref_path, encoding="utf-8") as fh:
        ref = json.load(fh)
    out_path = os.path.join(root, "design", "characters", name, "hair-clumps.json")

    if flags & {"--ridge", "--major"}:
        img = front_window(name, ref)
        hair, ridge = hair_ridges(img)
        left, right, top = hair_edge(img)
        m = F.classify(img)
        pic = np.ones((F.RES_Y, F.RES_X, 3), dtype=np.float32)
        if "--ridge" in flags:
            pic[hair] = (0.86, 0.82, 0.74)
            pic[m["skin"] & ~hair] = (0.97, 0.90, 0.82)
            pic[ridge] = (0.16, 0.10, 0.06)
            tag = "ridge"
        else:
            with open(out_path, encoding="utf-8") as fh:
                majors = json.load(fh).get("major", [])
            pic, covered = draw_major(img, majors, left, right, top)
            pic[ridge] = pic[ridge] * 0.3
            tag = "major"
            hit = (covered & hair).sum()
            print(f"主要毛束が覆う髪の面積: {hit / max(1, hair.sum()) * 100:.0f}%"
                  f"  (残りは補助の小さい毛束で埋める)\n")
            print(f"{'毛束':<14}{'点数':>6}{'x(mm)':>18}{'z(mm)':>18}")
            for c in majors:
                poly = resolve_path(c["path"], left, right, top)
                px = [p[0] * 1000 for p in poly]
                pz = [p[1] * 1000 for p in poly]
                print(f"{c['name']:<14}{len(poly):>6}"
                      f"{min(px):>9.1f}..{max(px):<8.1f}"
                      f"{min(pz):>9.1f}..{max(pz):<8.1f}")
        zs = F.WIN_Z1 - np.arange(F.RES_Y) / F.PX_PER_UNIT
        xs = np.arange(F.RES_X) / F.PX_PER_UNIT - F.WIN_HALF_X
        r0 = int(np.argmin(abs(zs - 0.995))); r1 = int(np.argmin(abs(zs - 0.812)))
        c0 = int(np.argmin(abs(xs + 0.125))); c1 = int(np.argmin(abs(xs - 0.125)))
        # 20mm方眼を薄く敷く(座標を読んで内側の境目を置くため)
        for zt in range(820, 1000, 20):
            rr = int(np.argmin(abs(zs - zt / 1000.0)))
            if r0 <= rr < r1:
                pic[rr, c0:c1] = pic[rr, c0:c1] * 0.82
        for xt in range(-120, 121, 20):
            cc = int(np.argmin(abs(xs - xt / 1000.0)))
            if c0 <= cc < c1:
                pic[r0:r1, cc] = pic[r0:r1, cc] * (0.60 if xt == 0 else 0.82)
        crop = np.ascontiguousarray(pic[r0:r1, c0:c1], dtype=np.float32)
        crop = np.repeat(np.repeat(crop, 2, 0), 2, 1)
        dst = os.path.join(C.PREVIEW_DIR, "face", f"{name}-hair-{tag}.png")
        F.save_image(dst, np.concatenate(
            [crop, np.ones(crop.shape[:2] + (1,), np.float32)], axis=2))
        print(f"\n→ {dst}")
        return 0

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

    data = {}
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            data = json.load(fh)
    data["_comment"] = (
        "髪の毛束の基準(plan/models/garudo-hair-clumps.md)。"
        "tips は tools/trace_hair_clumps.py が設定画から測った毛先で、"
        "再生成すると上書きされる。major は主要毛束の輪郭で、"
        "測れる辺(髪の輪郭)は edge/top で指定し、毛束どうしの境目だけ"
        "at で人が置く(--ridge の画像を見て決める)。"
        "clumps は毛束の定義。座標は顔一致QAと同じモデル座標(m)")
    data["tips"] = tips
    data.setdefault("major", [])
    data.setdefault("clumps", [])
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(f"\n毛先 {len(tips)}点 → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
