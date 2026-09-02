"""
設定画の顔を**そのままベクタ化**して face.svg を生成する。

これが無かったために、face.svg を「QAが出す数点のランドマークに合うよう
**想像で描く**」ことになり、点は合うのに顔が似ないという失敗をした
(指標を最適化して対象を最適化していない典型)。

最初は「目・眉・口をそれぞれ探して輪郭を取る」方式で書いたが、実測の
結果これは成立しないと分かった:

* 設定画では髪・まつ毛・虹彩・口がすべて同じ茶系の明度ランプ上にあり、
  **色では部位を分けられない**。
* 前髪が眉や目にかぶさっているため、暗部の最大連結成分は襟や首まで
  繋がった 107,174px の1つの塊になる。**連結でも分けられない**。

そこで部位を探すのをやめ、顔の範囲を**明度で数階調に量子化して、その
領域をまるごとトレースする**。絵の形をそのまま写すので、似ないという
失敗の余地がない。前髪が顔にかかる部分も塗りとして入るが、モデル側の
髪ジオメトリが手前にあるので二重にはならず、髪が無い場所では設定画
どおりの前髪の影が乗る(handbook/hand-painted-standard.md の
「モデリングでキャラクターを完成させようとしない」)。

    tools/venv/bin/python tools/trace_face_svg.py garudo

座標系は顔一致QA(tools/compare_face.py)のウィンドウと同一なので、
生成したSVGはそのままモデルのデカールに使える。設定画の顔はわずかに
傾けて描かれているため、**両目の中点がモデルの目の高さ(EYE_Z)・
正中(x=0)へ来るように平行移動してから**写す。
"""
from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import compare_face as F  # noqa: E402  (bpy・共通の座標系をそのまま使う)
import numpy as np  # noqa: E402

# 量子化の段(明度の上限)。上から順に塗るので、暗い段ほど後に来る
# 段の一番明るい側を0.80まで上げると口の線は繋がるが、あご下の影の
# 境目が顔を横切る**硬い帯**になって全体が汚れる(実測)。0.66で止め、
# 口は細い塊が消えないよう MIN_BLOB / EPSILON 側で拾う
TONES = (0.66, 0.45, 0.28, 0.155)
# 白目(明るく彩度が低い)。肌より先に敷いて、上の暗い段の穴から覗かせる
WHITE_VAL, WHITE_SAT = 0.86, 0.16
MIN_BLOB = 8           # これ未満の塊は捨てる(圧縮ノイズ)
MIN_HOLE = 8
EPSILON = 0.55         # Douglas-Peucker の許容(0.5mm単位)
# 口の帯だけで使う明度しきい値。実測: 口の線は x-13..+13mm で
# val 0.31〜0.92、まわりの肌は 0.945〜0.96。0.80で切ると線の真ん中
# (0.87〜0.92)が抜けて破線になる
MOUTH_VAL = 0.93
MOUTH_HALF_X = 0.030
# 目の絵を差し替える範囲(楕円)。**目の絵の外接箱をぎりぎり包む**大きさ
# にする(デカール実測 x17.0..49.0 / z830.5..858.0)。広げると、目の外側の
# 肌やまつ毛の先まで表情の区画の絵に置き換わり、正面図の絵と混ざって
# 目が薄く見える(実測)
EYE_ZONE_CZ = 0.8442
EYE_ZONE_HALF_W = 0.0182
EYE_ZONE_HALF_H = 0.0163
# 頭の断面から内側へ縮める量(m)。設定画の輪郭線を塗りに含めないため。
# あご側は輪郭線が横に走るので、別に下限を上げて逃がす
CLIP_MARGIN = 0.005
CLIP_CHIN = 0.020


def trace_outline(mask: "np.ndarray") -> list:
    """
    塗りつぶし領域の外周を1周たどって点列にする(ムーア近傍追跡)。
    輪郭が閉じたらそこで終わり。
    """
    ys, xs = np.where(mask)
    if not len(ys):
        return []
    start = (int(ys.min()), int(xs[ys == ys.min()].min()))
    # 時計回りの8近傍(上から)
    nb = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    contour = [start]
    cur = start
    back = 6  # 直前に来た方向(左)
    height, width = mask.shape
    for _ in range(200000):
        found = False
        for k in range(8):
            d = (back + 1 + k) % 8
            ny, nx = cur[0] + nb[d][0], cur[1] + nb[d][1]
            if 0 <= ny < height and 0 <= nx < width and mask[ny, nx]:
                back = (d + 5) % 8
                cur = (ny, nx)
                contour.append(cur)
                found = True
                break
        if not found or (len(contour) > 3 and cur == start):
            break
    return contour


def simplify(points: list, epsilon: float = EPSILON) -> list:
    """Douglas-Peucker。点列を折れ線として間引く"""
    if len(points) < 3:
        return points
    a = np.array(points, dtype=float)
    start, end = a[0], a[-1]
    seg = end - start
    length = float(np.hypot(*seg))
    if length < 1e-9:
        dist = np.hypot(*(a - start).T)
    else:
        dist = np.abs(np.cross(seg, a - start)) / length
    idx = int(np.argmax(dist))
    if dist[idx] > epsilon:
        left = simplify(points[:idx + 1], epsilon)
        right = simplify(points[idx:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def smooth_closed(points: list, iterations: int = 2) -> list:
    """
    閉じた輪郭の**画素の階段を丸める**(Chaikinの角切り)。

    ムーア近傍追跡が返すのは画素の境界をなぞった折れ線なので、
    そのまま出すと0.5mm刻みの階段になる。顔テクスチャの密度を
    3,912 texels/unitまで上げると、この階段が目の縁のドットとして
    そのまま見える(実測)。角を切って滑らかにしてから間引く。
    """
    pts = points[:-1] if len(points) > 2 and points[0] == points[-1] else points[:]
    if len(pts) < 4:
        return points
    for _ in range(iterations):
        out = []
        n = len(pts)
        for i in range(n):
            (y0, x0), (y1, x1) = pts[i], pts[(i + 1) % n]
            out.append((y0 * 0.75 + y1 * 0.25, x0 * 0.75 + x1 * 0.25))
            out.append((y0 * 0.25 + y1 * 0.75, x0 * 0.25 + x1 * 0.75))
        pts = out
    return pts + [pts[0]]


def sub_path(mask: "np.ndarray") -> str:
    pts = simplify(smooth_closed(trace_outline(mask)))
    if len(pts) < 3:
        return ""
    return "M " + " ".join(f"{x:.2f},{y:.2f}" for y, x in pts) + " Z"


def holes_of(comp_mask: "np.ndarray"):
    """
    領域の**内側に閉じ込められた背景**(穴)を返す。まつ毛の輪の中の
    白目のように、外周だけを塗ると潰れてしまう部分を開けるため。
    """
    from collections import deque
    ys, xs = np.where(comp_mask)
    y0, y1 = ys.min() - 1, ys.max() + 2
    x0, x1 = xs.min() - 1, xs.max() + 2
    y0, x0 = max(0, y0), max(0, x0)
    sub = comp_mask[y0:y1, x0:x1]
    h, w = sub.shape
    outside = np.zeros_like(sub)
    queue = deque()
    for y in range(h):
        for x in (0, w - 1):
            if not sub[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if not sub[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not sub[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    hole = (~sub) & (~outside)
    if not hole.any():
        return []
    out = []
    for comp in F.components(hole, min_size=MIN_HOLE):
        m = np.zeros_like(sub)
        m[comp[:, 0], comp[:, 1]] = True
        full = np.zeros_like(comp_mask)
        full[y0:y0 + h, x0:x0 + w] = m
        out.append(full)
    return out


def layer_path(mask: "np.ndarray") -> str:
    """1階調ぶんの領域を、穴つきの1本のパス(evenodd)にまとめる"""
    parts = []
    for comp in F.components(mask, min_size=MIN_BLOB):
        m = np.zeros_like(mask)
        m[comp[:, 0], comp[:, 1]] = True
        d = sub_path(m)
        if not d:
            continue
        parts.append(d)
        for hole in holes_of(m):
            hd = sub_path(hole)
            if hd:
                parts.append(hd)
    return " ".join(parts)


def hex_of(rgb) -> str:
    """
    設定画の画素値をそのまま16進へ。ガンマを掛け直さないのは、
    load_image が返すのが**表示値そのもの**だから(実測: #808080 の
    PNGを読み戻すと 0.502)。プロジェクト全体が同じ約束で動いている
    (SKIN=(0.93,0.80,0.66) と設定画実測の肌 (0.955,0.816,0.668))。
    """
    v = np.clip(np.asarray(rgb, dtype=float), 0.0, 1.0)
    return "#" + "".join(f"{int(round(c * 255)):02x}" for c in v)


def face_clip(shape, rings, margin: float, floor_z: float,
              ceil_z: float) -> "np.ndarray":
    """
    顔として塗る範囲。**モデルの頭の断面表(HEAD_RINGS)そのものを
    marginだけ内側へ縮めた形**にする。

    楕円で切ると、あご・ほおの所で設定画の**輪郭線**まで拾ってしまう
    (実測: あごに黒い帯が塗られ、あご紐のように見えた)。輪郭は
    モデルのジオメトリが持っているので、塗りは持ってはいけない。
    """
    rows = np.arange(shape[0])
    cols = np.arange(shape[1])
    zs = F.WIN_Z1 - rows / F.PX_PER_UNIT
    xs = cols / F.PX_PER_UNIT - F.WIN_HALF_X
    rz = np.array([r[0] for r in rings], dtype=float)
    rx = np.array([r[1] for r in rings], dtype=float)
    half = np.interp(zs, rz, rx, left=0.0, right=0.0) - margin
    half[(zs < floor_z) | (zs > ceil_z)] = -1.0
    return np.abs(xs)[None, :] <= half[:, None]


def eye_zone(shape, model) -> "np.ndarray":
    """
    目の絵が入る範囲(まばたきで差し替える所)。左右それぞれ、目の絵の
    中心(±EYE_X, EYE_ZONE_CZ)まわりの楕円。眉は含めない。
    """
    rows = np.arange(shape[0])
    cols = np.arange(shape[1])
    zs = F.WIN_Z1 - rows / F.PX_PER_UNIT
    xs = cols / F.PX_PER_UNIT - F.WIN_HALF_X
    zz, xx = np.meshgrid(zs, xs, indexing="ij")
    out = np.zeros(shape, dtype=bool)
    for side in (1.0, -1.0):
        cx = model.EYE_X * side
        out |= (((xx - cx) / EYE_ZONE_HALF_W) ** 2
                + ((zz - EYE_ZONE_CZ) / EYE_ZONE_HALF_H) ** 2) <= 1.0
    return out

def resample_box(sheet: "np.ndarray", box, units_per_px: float,
                 anchor_px, anchor_model) -> "np.ndarray":
    """
    設定画の矩形を、QAのウィンドウへ相似変換で写す(双一次)。
    anchor_px(切り出し内の画素)が anchor_model(モデル座標x,z)へ来る。
    """
    x0, y0, x1, y1 = box
    ax, ay = anchor_px
    mx, mz = anchor_model
    xs_model = np.arange(F.RES_X) / F.PX_PER_UNIT - F.WIN_HALF_X
    zs_model = F.WIN_Z1 - np.arange(F.RES_Y) / F.PX_PER_UNIT
    # 標本は**区画の中に閉じる**。シート全体へはみ出すと、倍率が合って
    # いない途中の段階で隣の区画が窓に入り、目の検出が別の絵を掴んで
    # 偽の解へ収束する(実測: 倍率が1.5倍ずれた所で「目の間隔62.6mm」と
    # 出て止まった)
    fx = np.clip(x0 + ax + (xs_model - mx) / units_per_px - 0.5,
                 x0, min(x1, sheet.shape[1] - 1.001))
    fy = np.clip(y0 + ay - (zs_model - mz) / units_per_px - 0.5,
                 y0, min(y1, sheet.shape[0] - 1.001))
    ix, iy = fx.astype(int), fy.astype(int)
    tx = (fx - ix)[None, :, None]
    ty = (fy - iy)[:, None, None]
    a = sheet[np.ix_(iy, ix)]
    b = sheet[np.ix_(iy, ix + 1)]
    c = sheet[np.ix_(iy + 1, ix)]
    d = sheet[np.ix_(iy + 1, ix + 1)]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def find_eyes_px(crop: "np.ndarray"):
    """
    表情の区画の中で目を見つけ、(中点x, 中点y, 目の間隔)を画素で返す。

    しきい値は val<=0.25。0.30以下だと前髪と繋がって塊になり、
    0.20以下だと片目しか残らない(実測)。高さ方向は中央35〜65%に
    限る。眉は目より上にあるのでこれで外れる。
    """
    h, w = crop.shape[:2]
    val = F.hsv(crop)[2]
    dark = val <= 0.25
    keep = np.zeros_like(dark)
    keep[int(h * 0.35):int(h * 0.65)] = True
    cands = []
    for comp in F.components(dark & keep, min_size=25):
        cw = comp[:, 1].max() - comp[:, 1].min() + 1
        ch = comp[:, 0].max() - comp[:, 0].min() + 1
        cx = float(comp[:, 1].mean())
        # 側頭部の髪も同じ大きさで残るので、**顔の内側にある、縦長で
        # ない塊**に限る(実測: 通常の目は w14 h13 で中央から13〜19px、
        # 側頭部の髪は w18〜20 h26〜29 で中央から36〜37px)
        if abs(cx - w * 0.5) > w * 0.28:
            continue
        if cw / max(1, ch) < 0.85:
            continue
        cands.append((cx, float(comp[:, 0].mean()), len(comp)))
    if len(cands) < 2:
        return None
    cands.sort(key=lambda c: -c[2])
    for i in range(len(cands)):
        for j in range(i + 1, len(cands)):
            a, b = cands[i], cands[j]
            if abs(a[1] - b[1]) > h * 0.06:
                continue                   # 高さが違う=目の対ではない
            if abs(a[0] - b[0]) < w * 0.15:
                continue                   # 近すぎる
            return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, abs(a[0] - b[0]))
    return None


def expression_window(sheet: "np.ndarray", box, model, ref, cal=None):
    """
    表情バリエーションの1区画を、正面図と**同じウィンドウ・同じ倍率**へ写す。

    合わせるのに `eye_pair` を使ってはいけない。あれは高さ帯の中の大きな
    暗部を取るので、位置が合っていない途中の段階で**眉を目と間違える**
    (実測: 目の間隔が57→66→95→60mmと振動し、最後は目の十字が眉に乗った)。
    区画の外接箱の幅で合わせるのも駄目で、あれは髪ではなく**肩幅**だった。

    区画の中で目を直接見つけ(`find_eyes_px`)、目の間隔で倍率を、
    両目の中点で位置を決める。

    **較正は「通常」で1度だけ行い、他の表情はその値をそのまま使う。**
    表情ごとに測り直すと、閉じ目のまぶたが開いた目と同じ高さへ引き上げ
    られてしまう(実測: 通常の目はy=66、眠そうのまぶたはy=76。この
    20mmの差こそが閉じ目の情報)。
    """
    x0, y0, x1, y1 = box
    if cal is None:
        crop = np.ascontiguousarray(sheet[y0:y1, x0:x1, :3], dtype=np.float32)
        found = find_eyes_px(crop)
        if found is None:
            raise SystemExit("表情の区画から目を検出できなかった")
        mx, my, gap = found
        upp = (model.EYE_X * 2.0) / gap
        cal = (upp, (mx, my))
    upp, anchor = cal
    return resample_box(sheet, box, upp, anchor, (0.0, model.EYE_Z)), cal


def stretch_z(img: "np.ndarray", center_row: float, factor: float) -> "np.ndarray":
    """center_rowを動かさずに縦へ拡大する(双一次)"""
    if abs(factor - 1.0) < 1e-6:
        return img
    rows = np.arange(img.shape[0], dtype=float)
    src = center_row + (rows - center_row) / factor
    src = np.clip(src, 0, img.shape[0] - 1.001)
    i0 = src.astype(int)
    t = (src - i0)[:, None, None]
    return img[i0] * (1 - t) + img[i0 + 1] * t


def zone_eye_height(val: "np.ndarray", zone: "np.ndarray") -> float:
    """目の範囲の暗部の高さ(左右の平均、モデル単位)"""
    dark = (val <= TONES[1]) & zone
    hs = []
    for lo, hi in ((0, zone.shape[1] // 2), (zone.shape[1] // 2, zone.shape[1])):
        side = np.zeros_like(dark)
        side[:, lo:hi] = dark[:, lo:hi]
        comps = F.components(side, min_size=200)
        if comps:
            c = comps[0]
            hs.append((c[:, 0].max() - c[:, 0].min()) / F.PX_PER_UNIT)
    return float(np.mean(hs)) if hs else 0.0


def shift_cols(mask: "np.ndarray", dz) -> "np.ndarray":
    """列ごとに違う量だけ上へずらす(閉じたまぶたを半目の高さへ持ち上げる)"""
    out = np.zeros_like(mask)
    h = mask.shape[0]
    for c in range(mask.shape[1]):
        d = int(dz[c])
        if d <= 0:
            out[:, c] = mask[:, c]
        else:
            out[:h - d, c] = mask[d:, c]
    return out


def top_row(mask: "np.ndarray"):
    """列ごとの一番上の行(無ければ-1)"""
    out = np.full(mask.shape[1], -1)
    for c in range(mask.shape[1]):
        rows = np.where(mask[:, c])[0]
        if len(rows):
            out[c] = rows.min()
    return out


def band(shape, z0: float, z1: float, half_x: float) -> "np.ndarray":
    """高さ帯 ∩ 正中まわりの矩形(口だけを別しきい値で拾うため)"""
    rows = np.arange(shape[0])
    cols = np.arange(shape[1])
    zs = F.WIN_Z1 - rows / F.PX_PER_UNIT
    xs = cols / F.PX_PER_UNIT - F.WIN_HALF_X
    return ((zs >= z0) & (zs <= z1))[:, None] & (np.abs(xs) <= half_x)[None, :]


def shift(win: "np.ndarray", dx_px: int, dz_px: int) -> "np.ndarray":
    """ウィンドウ内の絵を平行移動(空いた所は端の色で埋める)"""
    out = np.roll(win, (dz_px, dx_px), axis=(0, 1))
    return out


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "garudo"
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "design", "characters", name,
                           "face-reference.json"), encoding="utf-8") as fh:
        ref = json.load(fh)
    sys.path.insert(0, os.path.join(root, "tools", "models"))
    import importlib
    model = importlib.import_module(name)

    sheet = F.load_image(os.path.join(root, "design", "characters", name,
                                      "generated", f"{name}-sheet.png"))
    _, bbox = F.sheet_front_figure(sheet, ref["front_crop"])
    win = F.resample_sheet(sheet, bbox, float(ref["model_height"]))[:, :, :3]
    # 整合は**補間しない絵**で測る。ぼかすと目と眉の塊が繋がって重心が
    # 動く(実測: 両目の中点が z0.8461 → z0.8557 と9.6mmずれた)。
    # QA(compare_face)と同じ最近傍の絵で測り、その移動量を補間版へ使う
    crisp = F.resample_sheet(sheet, bbox, float(ref["model_height"]),
                             smooth=False)[:, :, :3]

    # 設定画の顔は少し傾けて描かれている。両目の中点をモデルの目の位置
    # (正中・EYE_Z)へ合わせてから写す(QAの整合と同じ基準)
    pair = F.eye_pair(F.classify(crisp), ref["bands"]["eye"])
    if pair is None:
        raise SystemExit("設定画から目を検出できなかった")
    dx_px = int(round((0.0 - pair["mid_x"]) * F.PX_PER_UNIT))
    dz_px = int(round((pair["z"] - model.EYE_Z) * F.PX_PER_UNIT))
    win = shift(win, dx_px, dz_px)
    print(f"整合: 両目中点 x{pair['mid_x']:+.4f} z{pair['z']:.4f}"
          f" → x0.0000 z{model.EYE_Z:.4f}  ({dx_px:+d}, {dz_px:+d} px)")

    hue, sat, val = F.hsv(win)
    clip = face_clip(win.shape[:2], model.HEAD_RINGS, margin=CLIP_MARGIN,
                     floor_z=model.CHIN_Z + CLIP_CHIN,
                     ceil_z=model.HEAD_RINGS[-1][0] - CLIP_MARGIN)

    # 口だけは別扱い。設定画の口は肌との差が小さい細い線で、明度の段
    # (0.66)では拾いきれず破線になる。かといって段を0.80まで上げると
    # あご下の影の境目が顔を横切る硬い帯になる(実測)。**口の帯の中
    # だけ**しきい値を緩める
    mz0, mz1 = ref["bands"]["mouth"]
    mouth_area = band(win.shape[:2], mz0, mz1, MOUTH_HALF_X) & (val <= MOUTH_VAL)

    layers = []
    white = clip & (val > WHITE_VAL) & (sat < WHITE_SAT)
    if white.any():
        layers.append(("white", white, hex_of(win[white].mean(axis=0))))
    for i, top in enumerate(TONES):
        m = clip & (val <= top)
        if i == 0:
            m = m | (clip & mouth_area)
        if m.sum() < MIN_BLOB:
            continue
        exact = m & (val > (TONES[i + 1] if i + 1 < len(TONES) else 0.0))
        color = win[exact if exact.any() else m].mean(axis=0)
        layers.append((f"tone{i}", m, hex_of(color)))

    # ---- まばたきの3状態(open / half / closed)----
    # 3枚を横に並べた1枚のSVGにする。モデル側は同じ座標に状態ぶんの
    # 横オフセットを足して引くので、テクスチャは1枚のアトラスで済む。
    #
    # **目は設定画右下の「表情バリエーション」から取る。**閉じ目は
    # 「眠そう」がそのまま使える(想像で描かない)。開いた目も同じ
    # 「通常」から取って、3状態で絵柄と線の太さを揃える。
    # 顔の他の部分は三面図の正面図のまま(表情の区画は目〜あごが
    # 12%短く描かれており、顔全体を差し替えると口とあごが上がる実測)。
    exprs = ref.get("expressions")
    if not exprs or "通常" not in exprs or "眠そう" not in exprs:
        raise SystemExit("face-reference.json に expressions(表情の区画)が要る")
    normal, cal = expression_window(sheet, exprs["通常"], model, ref)
    sleepy, _ = expression_window(sheet, exprs["眠そう"], model, ref, cal=cal)
    normal = np.ascontiguousarray(normal[:, :, :3], dtype=np.float32)
    sleepy = np.ascontiguousarray(sleepy[:, :, :3], dtype=np.float32)
    print(f"表情の区画: 倍率 {cal[0] * 1000:.4f} mm/px  基準点"
          f" ({cal[1][0]:.1f}, {cal[1][1]:.1f}) → 目の中点")
    zone = eye_zone(win.shape[:2], model)

    # 表情の区画と三面図の正面図では、**目の縦横比が違う**。目の間隔で
    # 合わせると、区画の目は正面図より縦に6mm短くなる(実測: 正面図の
    # 上瞼857.5/下瞼830.5=27.0mm、区画は21.0mm)。QAの基準は正面図なので、
    # 区画の絵を目の中心まわりに縦へ伸ばして正面図の目に収める
    val = F.hsv(win)[2]
    h_front = zone_eye_height(val, zone)
    h_panel = zone_eye_height(F.hsv(normal)[2], zone)
    stretch = (h_front / h_panel) if h_panel > 1e-6 else 1.0
    stretch = float(min(1.6, max(0.7, stretch)))
    eye_row = (F.WIN_Z1 - model.EYE_Z) * F.PX_PER_UNIT
    normal = stretch_z(normal, eye_row, stretch)
    sleepy = stretch_z(sleepy, eye_row, stretch)
    print(f"表情の目の高さ {h_panel * 1000:.1f}mm → 正面図 {h_front * 1000:.1f}mm"
          f" (縦へ x{stretch:.3f})")

    val_o = F.hsv(normal)[2]
    sat_o = F.hsv(normal)[1]
    val_c = F.hsv(sleepy)[2]

    # 半目 = 閉じたまぶたを、開いた目の上端との間へ持ち上げたもの。
    # 形は設定画のまぶたのまま動かすだけなので、描き起こしにならない
    open_top = top_row((val_o <= TONES[1]) & zone)
    closed_top = top_row((val_c <= TONES[1]) & zone)
    raw = np.zeros(win.shape[1], dtype=float)
    both = (open_top >= 0) & (closed_top >= 0) & (closed_top > open_top)
    raw[both] = (closed_top[both] - open_top[both]) * 0.55
    # 持ち上げ量は列ごとに段が付くので均す(段のままだとまぶたが
    # 階段状にちぎれ、半目に四角い塊が出る実測)
    lift = np.zeros(win.shape[1], dtype=int)
    idx = np.where(both)[0]
    for c in idx:
        lo, hi = max(0, c - 8), min(len(raw), c + 9)
        seg = raw[lo:hi][both[lo:hi]]
        lift[c] = int(round(seg.mean()))

    def eye_layer(src_val, src_sat, pid, i):
        """表情の区画から、その段の目の絵を切り出す"""
        if pid == "white":
            return (src_val > WHITE_VAL) & (src_sat < WHITE_SAT) & zone
        return (src_val <= TONES[i - 1]) & zone

    # 半目で開いた目を残す範囲 = 持ち上げたまぶたの**下端より下**。
    # まぶたの上端で切ると、まぶたの帯の中に開いた目が透ける
    sat_c = F.hsv(sleepy)[1]
    lid_all = shift_cols((val_c <= TONES[1]) & zone, lift)
    keep_half = np.zeros(win.shape[:2], dtype=bool)
    for c in range(win.shape[1]):
        rows = np.where(lid_all[:, c])[0]
        if len(rows):
            keep_half[rows.max() + 1:, c] = True

    panels = [[], [], []]
    for i, (pid, mask, color) in enumerate(layers):
        outside = mask & ~zone
        m_open = eye_layer(val_o, sat_o, pid, i)
        m_closed = eye_layer(val_c, sat_c, pid, i)
        for k in range(3):
            if k == 0:
                m = outside | m_open
            elif k == 1:
                m = (outside | (m_open & keep_half)
                     | shift_cols(m_closed, lift))
            else:
                m = outside | m_closed
            d = layer_path(m)
            if d:
                panels[k].append((pid, d, color, int(m.sum())))

    parts = panels[0]

    out_path = os.path.join(root, "design", "characters", name, "face.svg")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<!--
  {name} の顔。**設定画を明度で量子化し、その領域をトレースして生成**した
  もの(tools/trace_face_svg.py)。手で描き起こしたものではない。
  段は明るい順に重ねるので、下の段の穴から明るい段が覗く。

  横に3枚並んでいるのは**まばたきの3状態**(open / half / closed)。
  閉じ目は設定画に無いので、なぞった目の上下の縁とまつ毛の厚みから
  導出している(想像で描いていない)。モデル側は同じ座標へ
  状態ぶんの横オフセット({F.WIN_HALF_X * 2})を足して引く。

  座標系は顔一致QA(tools/compare_face.py)のウィンドウと同一:
    SVG(sx, sy) → モデル(x, z):  x = sx/{int(F.PX_PER_UNIT)} - {F.WIN_HALF_X},
                                  z = {F.WIN_Z1} - sy/{int(F.PX_PER_UNIT)}
    1 SVG単位 = 0.5mm。QAが出す「◯mmずれ」はその2倍を足し引きすればよい。

  再生成:  tools/venv/bin/python tools/trace_face_svg.py {name}
  ラスタライズ:
    node tools/render_svg.mjs --transparent --scale=3 \\
      design/characters/{name}/face.svg
    cp tools/preview/{name}/face.png \\
       design/characters/{name}/generated/{name}-face-decal.png

  **手で描き足さないこと。** 直したい場合は抽出側(trace_face_svg.py)か
  設定画を直して再生成する(このファイルは毎回上書きされる)。
-->
<svg xmlns="http://www.w3.org/2000/svg" width="{F.RES_X * 3}" height="{F.RES_Y}"
     viewBox="0 0 {F.RES_X * 3} {F.RES_Y}">
''')
        for k, (state, group) in enumerate(zip(("open", "half", "closed"), panels)):
            fh.write(f'  <g id="state-{state}" transform="translate({k * F.RES_X},0)">\n')
            for pid, d, color, _ in group:
                fh.write(f'    <path id="{state}-{pid}" fill-rule="evenodd" '
                         f'fill="{color}" d="{d}"/>\n')
            fh.write("  </g>\n")
        fh.write("</svg>\n")
    for pid, d, color, n in parts:
        print(f"  {pid:<6} {color}  {n:>6}px  {d.count('M'):>3}輪郭")
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
