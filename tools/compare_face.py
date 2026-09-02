"""
顔の一致度を数値で測る(設定画 vs モデル)。

`tools/overlay_sheet.py`が全身シルエットの検査なのに対し、こちらは
**顔だけを同じ物理スケールへ写して機械が判定する**道具。
「似ている気がする」という自己評価を最終判定にしないための評価関数
(plan/models/garudo-face-qa.md)。

    tools/venv/bin/python tools/compare_face.py <名前>

やっていること:

1. モデルを組み、**平行投影・陰影なし(Workbench FLAT)**で顔を
   固定ウィンドウ(モデル座標で指定)へ描く。陰影を消すのは、設定画の
   ベタ塗りと画素の色を直接比べられるようにするため。
2. 設定画の正面図を、全身シルエットの外接箱から求めた倍率で
   **同じウィンドウへ再標本化**する。これで両者が同じ物理スケールに乗る。
3. 同じ判定器で肌・髪・暗部(目・眉・口)を分類し、
   IoUとランドマーク誤差(モデル単位=mm相当)を出す。

出力: tools/preview/face/<名前>-compare.png(左=設定画・中=モデル・
右=重ね合わせ)と、標準出力の数値表。
"""
from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import common as C  # noqa: E402  (bpyを先に読み込む)
import bpy  # noqa: E402
import numpy as np  # noqa: E402

# 顔を写すウィンドウ(モデル座標)。左右±0.16・高さz0.74〜1.02。
# 1ユニット=2000px相当で標本化するので、0.5mmが1pxになる
WIN_HALF_X = 0.16
WIN_Z0, WIN_Z1 = 0.74, 1.02
RES_X = 640
RES_Y = int(RES_X * (WIN_Z1 - WIN_Z0) / (WIN_HALF_X * 2))
PX_PER_UNIT = RES_X / (WIN_HALF_X * 2)
# これより下(首から下)は顔の計測に含めない
NECK_Z = 0.775
# 髪と見なす下限。設定画のこれより下にある茶の暗部は**肩の革当てと樽**で、
# 髪ではない(拡大して確認済み。「髪の左右輪郭」でも z0.790 を外している)。
# 入れたままだと髪IoUの食い違いの半分がこの肩当てになる
# (実測: 全体の食い違い4437mm2のうち2219mm2が z775..790)
HAIR_Z0 = 0.790


def load_image(path: str) -> "np.ndarray":
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]  # 上起点へ


def save_image(path: str, rgba: "np.ndarray") -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = bpy.data.images.new("out", width=rgba.shape[1], height=rgba.shape[0])
    out.pixels.foreach_set(
        np.ascontiguousarray(rgba[::-1], dtype=np.float32).ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)


def hsv(rgb: "np.ndarray"):
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    diff = np.maximum(mx - mn, 1e-6)
    sat = np.where(mx > 1e-5, (mx - mn) / np.maximum(mx, 1e-5), 0.0)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hue = np.where(mx == r, (g - b) / diff % 6,
                   np.where(mx == g, (b - r) / diff + 2, (r - g) / diff + 4)) * 60.0
    return hue, sat, mx


def classify(rgb: "np.ndarray"):
    """
    肌・髪(茶の暗部)・暗部(線)・白目 に分ける。両者で同じ判定器を使う。

    生成りのシャツは肌と色相が近く、彩度でしか分けられない(実測:
    シャツ0.17に対し肌0.29)。さらに首から下は顔の計測に混ぜないよう、
    あご下(NECK_Z)より下は捨てる。
    """
    hue, sat, val = hsv(rgb)
    warm = (hue >= 8.0) & (hue <= 50.0)
    skin = warm & (val > 0.66) & (sat >= 0.20) & (sat < 0.52)
    hair = warm & (val <= 0.62) & (val > 0.10) & (sat > 0.22)
    dark = val <= 0.30
    white = (val > 0.82) & (sat < 0.14)
    # 口の線は肌より暗いだけで「暗部」には入らない。彩度で拾う
    line = (val < 0.70) & (sat > 0.32)
    below = np.zeros(rgb.shape[:2], dtype=bool)
    rows = np.arange(rgb.shape[0])
    z = WIN_Z1 - rows / PX_PER_UNIT
    below[z < NECK_Z] = True
    for m in (skin, hair, dark, white, line):
        m[below] = False
    hair[z < HAIR_Z0] = False
    return {"skin": skin, "hair": hair, "dark": dark, "white": white, "line": line}


def iou(a: "np.ndarray", b: "np.ndarray") -> float:
    union = (a | b).sum()
    return float((a & b).sum() / union) if union else 0.0


def components(mask: "np.ndarray", min_size: int = 30):
    """連結成分を大きい順に返す(8近傍)"""
    from collections import deque
    seen = np.zeros_like(mask, dtype=bool)
    height, width = mask.shape
    out = []
    ys, xs = np.where(mask)
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        queue = deque([(sy, sx)])
        seen[sy, sx] = True
        comp = []
        while queue:
            y, x = queue.popleft()
            comp.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] \
                            and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
        if len(comp) >= min_size:
            out.append(np.array(comp))
    out.sort(key=len, reverse=True)
    return out


def to_model(row: float, col: float):
    """ウィンドウ内の画素 → モデル座標(x, z)"""
    return (col / PX_PER_UNIT - WIN_HALF_X, WIN_Z1 - row / PX_PER_UNIT)


def flatten_materials() -> None:
    """全マテリアルの表面をEmissionへ差し替える(Base Colorの色/画像のまま)"""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        tree = mat.node_tree
        output = next((n for n in tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
        bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if output is None or bsdf is None:
            continue
        base = bsdf.inputs["Base Color"]
        emit = tree.nodes.new("ShaderNodeEmission")
        if base.is_linked:
            tree.links.new(base.links[0].from_socket, emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = base.default_value
        tree.links.new(emit.outputs["Emission"], output.inputs["Surface"])


def render_model_face(name: str) -> "np.ndarray":
    """平行投影・陰影なしでモデルの顔を固定ウィンドウへ描く"""
    import importlib
    module = importlib.import_module(name) if name == "garudo" else None
    if module is None:
        raise SystemExit(f"未対応: {name}(いまはgarudoのみ)")
    C.reset_scene()
    objs = module.make()
    C._mute_to_rest(objs)

    center_z = (WIN_Z0 + WIN_Z1) * 0.5
    bpy.ops.object.camera_add(location=(0.0, -1.2, center_z))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = WIN_HALF_X * 2
    cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)

    scene = bpy.context.scene
    scene.camera = cam
    # 陰影を掛けずにアルベドだけを出す。Workbenchはヘッドレスでは
    # EGLが要るので使えず(実測: libEGL.so.1が無い)、代わりに全マテリアルを
    # Emission化して1サンプルで描く。設定画のベタ塗りと色を直接比べられる
    flatten_materials()
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.resolution_x, scene.render.resolution_y = RES_X, RES_Y
    scene.render.film_transparent = True
    path = os.path.join(C.PREVIEW_DIR, "face", f"{name}-model.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return load_image(path)


def sheet_front_figure(sheet: "np.ndarray", crop):
    """設定画の正面図の全身マスクと、その外接箱を返す"""
    left, top, right, bottom = crop
    region = sheet[top:bottom, left:right, :3]
    hue, sat, val = hsv(region)
    mask = (val < 0.55) | (sat > 0.22)
    comps = components(mask, min_size=200)
    figure = np.zeros_like(mask)
    for y, x in comps[0]:
        figure[y, x] = True
    ys, xs = np.where(figure)
    return figure, (xs.min() + left, ys.min() + top, xs.max() + left, ys.max() + top)


def resample_sheet(sheet: "np.ndarray", bbox, model_height: float,
                   smooth: bool = True) -> "np.ndarray":
    """
    設定画の正面図を、モデルと同じウィンドウ・同じ倍率へ写す。

    既定は**双一次補間**。設定画は顔の幅で0.65px/mmしかないので、
    最近傍だと2.2mm角のブロックになる。モデル側のレンダーは滑らかなので、
    基準だけギザギザだと**滑らかにするほどIoUが下がる**という逆向きの
    圧力がかかる(実測: デカールを滑らかにしたら肌IoUが0.82→0.76)。
    smooth=Falseで従来の最近傍(整合の重心を測る用。ぼかすと目と眉が
    繋がって重心が動く)。

    標本位置は箱の再構成に合わせて0.5引く(最近傍のsheet[floor(f)]は
    画素kの中心をk+0.5とみなすため)。
    """
    x0, y0, x1, y1 = bbox
    units_per_px = model_height / (y1 - y0)
    center_x = (x0 + x1) * 0.5
    sole_y = y1
    rows = np.arange(RES_Y)
    cols = np.arange(RES_X)
    xs_model = cols / PX_PER_UNIT - WIN_HALF_X
    zs_model = WIN_Z1 - rows / PX_PER_UNIT
    if not smooth:
        sx = np.clip((center_x + xs_model / units_per_px).astype(int),
                     0, sheet.shape[1] - 1)
        sy = np.clip((sole_y - zs_model / units_per_px).astype(int),
                     0, sheet.shape[0] - 1)
        return sheet[np.ix_(sy, sx)]
    fx = np.clip(center_x + xs_model / units_per_px - 0.5, 0, sheet.shape[1] - 1.001)
    fy = np.clip(sole_y - zs_model / units_per_px - 0.5, 0, sheet.shape[0] - 1.001)
    ix, iy = fx.astype(int), fy.astype(int)
    tx = (fx - ix)[None, :, None]
    ty = (fy - iy)[:, None, None]
    a = sheet[np.ix_(iy, ix)]
    b = sheet[np.ix_(iy, ix + 1)]
    c = sheet[np.ix_(iy + 1, ix)]
    d = sheet[np.ix_(iy + 1, ix + 1)]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def blob_metrics(masks, band_z, x_sign, min_size=40, max_w=0.060, max_h=0.050):
    """
    指定の高さ帯・左右にある暗い塊の重心と大きさ(モデル座標)。

    髪と眉は色が同じ(どちらも茶の暗部)なので、色では分けられない。
    **大きさ**で識別する: 眉は細長い小さな塊、髪は高さのある大きな塊。
    高さ帯は目・眉の実体より広めに取る(帯で切ると輪が左右に割れて
    幅が半分に見える実測)。
    """
    dark = masks["dark"].copy()
    rows = np.arange(RES_Y)
    zs = WIN_Z1 - rows / PX_PER_UNIT
    keep_rows = (zs >= band_z[0]) & (zs <= band_z[1])
    dark[~keep_rows] = False
    cols = np.arange(RES_X)
    xs = cols / PX_PER_UNIT - WIN_HALF_X
    dark[:, (xs * x_sign) <= 0.004] = False
    dark[:, np.abs(xs) > 0.075] = False   # 顔の外(髪)を拾わない
    comps = [c for c in components(dark, min_size=min_size)
             if (c[:, 1].max() - c[:, 1].min()) / PX_PER_UNIT < max_w
             and (c[:, 0].max() - c[:, 0].min()) / PX_PER_UNIT < max_h]
    if not comps:
        return None
    comp = comps[0]
    zs_c = WIN_Z1 - comp[:, 0] / PX_PER_UNIT
    xs_c = comp[:, 1] / PX_PER_UNIT - WIN_HALF_X
    return {
        "cx": float(xs_c.mean()), "cz": float(zs_c.mean()),
        "w": float(xs_c.max() - xs_c.min()), "h": float(zs_c.max() - zs_c.min()),
        "n": len(comp),
    }


def report(label, sheet_val, model_val, tol, unit="mm", scale=1000.0):
    if sheet_val is None or model_val is None:
        print(f"  {label:<22} {'--':>9} {'--':>9} {'':>9}  検出できず")
        return False
    diff = (model_val - sheet_val) * scale
    ok = abs(diff) <= tol
    print(f"  {label:<22} {sheet_val * scale:>9.1f} {model_val * scale:>9.1f} "
          f"{diff:>+9.1f}  {'ok' if ok else 'NG'}  (許容±{tol}{unit})")
    return ok


def eye_pair(masks, band, min_size=40, max_w=0.060, max_h=0.050):
    """
    高さ帯の中から目(または眉)らしい塊を2つ拾い、左右で対にして返す。
    設定画は顔がわずかに傾いて描かれており、左右を別々に絶対座標で
    比べると値が暴れる。**間隔・高さ・大きさという相対量**で測る。
    """
    dark = masks["dark"].copy()
    rows = np.arange(RES_Y)
    zs = WIN_Z1 - rows / PX_PER_UNIT
    dark[(zs < band[0]) | (zs > band[1])] = False
    cols = np.arange(RES_X)
    xs = cols / PX_PER_UNIT - WIN_HALF_X
    dark[:, np.abs(xs) > 0.078] = False
    cands = []
    for comp in components(dark, min_size=min_size):
        w = (comp[:, 1].max() - comp[:, 1].min()) / PX_PER_UNIT
        h = (comp[:, 0].max() - comp[:, 0].min()) / PX_PER_UNIT
        if w >= max_w or h >= max_h:
            continue
        cx = (comp[:, 1] / PX_PER_UNIT - WIN_HALF_X).mean()
        cz = (WIN_Z1 - comp[:, 0] / PX_PER_UNIT).mean()
        cands.append({"cx": float(cx), "cz": float(cz), "w": float(w),
                      "h": float(h), "n": len(comp)})
    left = [c for c in cands if c["cx"] > 0.004]
    right = [c for c in cands if c["cx"] < -0.004]
    if not left or not right:
        return None
    a = max(left, key=lambda c: c["n"])
    b = max(right, key=lambda c: c["n"])
    return {
        "gap": a["cx"] - b["cx"],
        "mid_x": (a["cx"] + b["cx"]) * 0.5,
        "z": (a["cz"] + b["cz"]) * 0.5,
        "w": (a["w"] + b["w"]) * 0.5,
        "h": (a["h"] + b["h"]) * 0.5,
    }


# 左右対称のモデルが到達できるIoUの下限保証。天井の何%まで来ていれば
# 合格とするか(外部評価を受けて、絶対値0.90/0.80から置き換えた)
IOU_REACH_MIN = 0.95
# 髪は左右非対称なので対称の上限が使えない。絶対値で見る
HAIR_IOU_MIN = 0.80


def fill_polygon(poly) -> "np.ndarray":
    """
    モデル座標(x, z)の閉じた多角形を、顔一致QAの窓へ塗ったマスクにする。
    毛束の輪郭を設定画・モデルの髪マスクと直接比べるために使う。
    """
    px = np.array([(float(x) + WIN_HALF_X) * PX_PER_UNIT for x, _z in poly])
    pz = np.array([(WIN_Z1 - float(z)) * PX_PER_UNIT for _x, z in poly])
    mask = np.zeros((RES_Y, RES_X), dtype=bool)
    n = len(poly)
    for r in range(max(0, int(pz.min())), min(RES_Y, int(pz.max()) + 1)):
        hits = []
        for j in range(n):
            z0, z1 = pz[j], pz[(j + 1) % n]
            if (z0 <= r < z1) or (z1 <= r < z0):
                t = (r - z0) / (z1 - z0)
                hits.append(px[j] + (px[(j + 1) % n] - px[j]) * t)
        hits.sort()
        for a, b in zip(hits[0::2], hits[1::2]):
            lo, hi = int(max(0, a)), int(min(RES_X - 1, b))
            if hi > lo:
                mask[r, lo:hi] = True
    return mask


def symmetric_ceiling(mask) -> float:
    """
    **左右対称なメッシュが、この基準に対して到達できるIoUの上限。**

    設定画が左右非対称に描かれていると、左右対称なモデルはどう作っても
    その差のぶんだけ外す。鏡映で対になる画素の組を数えると上限が出る:
    両方1の組をn11、片方だけ1の組をn10として

        上限 = (2*n11 + n10) / (2*n11 + 2*n10)

    (片側だけの画素も「塗る」方が必ずIoUが高いので、この形になる)。
    鏡映軸は少しずれているので±30pxを探索して最大を採る。

    実測(ガルド): 肌0.825・髪0.860。肌はすでに0.813で天井の98%であり、
    **目標値0.90は左右対称である限り到達できなかった**。
    """
    best = 0.0
    for shift in range(-30, 31):
        m = np.roll(mask, shift, axis=1)
        mirrored = m[:, ::-1]
        n11 = float((m & mirrored).sum()) / 2.0
        n10 = float((m ^ mirrored).sum()) / 2.0
        if n11 + n10 <= 0:
            continue
        best = max(best, (2 * n11 + n10) / (2 * n11 + 2 * n10))
    return best


def _row_span(mask, row):
    cols = np.where(mask[row])[0]
    return float((cols.max() - cols.min() + 1) / PX_PER_UNIT) if len(cols) else 0.0


def face_metrics(masks, eye_z: float):
    """顔と髪の輪郭から取れる量(あご先・最大幅・髪の広がり・髪の頂点)"""
    skin, hair = masks["skin"], masks["hair"]
    head = skin | hair
    ys, xs = np.where(skin)
    if not len(ys):
        return None
    widths = skin.sum(axis=1)
    row = int(np.argmax(widths))
    cols = np.where(skin[row])[0]
    hair_ys, _ = np.where(hair)
    hair_widths = hair.sum(axis=1)
    hair_row = int(np.argmax(hair_widths))
    eye_row = int((WIN_Z1 - eye_z) * PX_PER_UNIT)
    return {
        "chin_z": WIN_Z1 - ys.max() / PX_PER_UNIT,
        "width": float((cols.max() - cols.min()) / PX_PER_UNIT),
        "width_z": WIN_Z1 - row / PX_PER_UNIT,
        "center_x": float(((cols.max() + cols.min()) * 0.5) / PX_PER_UNIT - WIN_HALF_X),
        "hair_width": _row_span(hair, hair_row),
        "hair_width_z": WIN_Z1 - hair_row / PX_PER_UNIT,
        "hair_top_z": WIN_Z1 - hair_ys.min() / PX_PER_UNIT if len(hair_ys) else 0.0,
        "head_at_eye": _row_span(head, eye_row),
    }



# ---- 意味的ランドマーク(目頭・目尻・眉の輪郭・口・頬・顎・生え際) ----
# 「その高さの全体幅」ではなく**顔の部位そのもの**を測る。同一人物性は
# 幅の一致ではなく、こうした点の位置関係で決まる

def _col_of(x: float) -> int:
    return int(round((x + WIN_HALF_X) * PX_PER_UNIT))


def _row_of(z: float) -> int:
    return int(round((WIN_Z1 - z) * PX_PER_UNIT))


def _pt(row: int, col: int):
    return (float(col / PX_PER_UNIT - WIN_HALF_X), float(WIN_Z1 - row / PX_PER_UNIT))


def eye_landmarks(masks, band, sign: float):
    """目の塊から 目頭・目尻・上瞼中央・下瞼中央・中心 を取る"""
    dark = masks["dark"].copy()
    rows = np.arange(RES_Y)
    zs = WIN_Z1 - rows / PX_PER_UNIT
    dark[(zs < band[0]) | (zs > band[1])] = False
    cols = np.arange(RES_X)
    xs = cols / PX_PER_UNIT - WIN_HALF_X
    dark[:, np.abs(xs) > 0.078] = False
    dark[:, (xs * sign) <= 0.004] = False
    best = None
    for comp in components(dark, min_size=40):
        w = (comp[:, 1].max() - comp[:, 1].min()) / PX_PER_UNIT
        h = (comp[:, 0].max() - comp[:, 0].min()) / PX_PER_UNIT
        if w < 0.060 and h < 0.036 and (best is None or len(comp) > len(best)):
            best = comp
    if best is None:
        return {}
    cs, rs = best[:, 1], best[:, 0]
    inner_col = cs.min() if sign > 0 else cs.max()
    outer_col = cs.max() if sign > 0 else cs.min()
    mid_col = int(round(cs.mean()))
    # 上下端は塊全体の外接から取る。中央列だけで見ると、まぶたの線と
    # 虹彩が白目で切れている場合に薄い帯だけを拾ってしまう(実測)
    col_rows = rs
    side = "L" if sign > 0 else "R"
    return {
        f"目頭{side}": _pt(int(rs[cs == inner_col].mean()), int(inner_col)),
        f"目尻{side}": _pt(int(rs[cs == outer_col].mean()), int(outer_col)),
        f"上瞼{side}": _pt(int(col_rows.min()), mid_col) if len(col_rows) else None,
        f"下瞼{side}": _pt(int(col_rows.max()), mid_col) if len(col_rows) else None,
        f"目の中心{side}": _pt(int(rs.mean()), mid_col),
    }


def brow_landmarks_pair(masks, band):
    """
    眉は設定画が左右非対称に描かれている(片側だけ前髪が深くかかる)。
    左右の同じ|x|での下端を平均して、眉の高さと傾きだけを測る
    """
    out = {}
    left = brow_landmarks(masks, band, 1.0)
    right = brow_landmarks(masks, band, -1.0)
    for i in range(3):
        a = left.get(f"眉下端L{i}")
        b = right.get(f"眉下端R{i}")
        if a is None or b is None:
            out[f"眉下端{i}"] = None
        else:
            out[f"眉下端{i}"] = (abs(a[0]), (a[1] + b[1]) * 0.5)
    return out


def brow_landmarks(masks, band, sign: float):
    """
    眉は髪と同色で塊としては分離できない(設定画では前髪と融合する)。
    代わりに**暗部の下端の輪郭**を3列で測る。眉の高さと傾きはこれで拾える
    """
    dark = masks["dark"]
    r0, r1 = _row_of(band[1]), _row_of(band[0])
    side = "L" if sign > 0 else "R"
    out = {}
    for i, x in enumerate((0.020, 0.032, 0.046)):
        col = _col_of(x * sign)
        column = dark[r0:r1, col]
        idx = np.where(column)[0]
        out[f"眉下端{side}{i}"] = _pt(r0 + int(idx.max()), col) if len(idx) else None
    return out


def mouth_landmarks(masks, band):
    dark = (masks["dark"] | masks["line"]).copy()
    rows = np.arange(RES_Y)
    zs = WIN_Z1 - rows / PX_PER_UNIT
    dark[(zs < band[0]) | (zs > band[1])] = False
    cols = np.arange(RES_X)
    xs = cols / PX_PER_UNIT - WIN_HALF_X
    dark[:, np.abs(xs) > 0.040] = False
    # 口は「横に長い小さな塊」。首の影や襟を拾わないよう形で選ぶ
    # 口は顔の中央にある横長の小さな塊。首の影や襟を拾わないよう
    # 「横長」かつ「中心付近」で選ぶ
    comps = [c for c in components(dark, min_size=10)
             if (c[:, 1].max() - c[:, 1].min()) > (c[:, 0].max() - c[:, 0].min())
             and abs((c[:, 1].mean() / PX_PER_UNIT - WIN_HALF_X)) < 0.016]
    if not comps:
        return {"口左": None, "口右": None, "口中央": None}
    comp = max(comps, key=len)
    cs, rs = comp[:, 1], comp[:, 0]
    return {
        "口左": _pt(int(rs[cs == cs.max()].mean()), int(cs.max())),
        "口右": _pt(int(rs[cs == cs.min()].mean()), int(cs.min())),
        "口中央": _pt(int(rs.mean()), int(cs.mean())),
    }


def contour_landmarks(masks):
    """頬の最大幅・顎の左右・顎先・生え際(中央)"""
    skin = masks["skin"]
    ys, xs = np.where(skin)
    if not len(ys):
        return {}
    widths = skin.sum(axis=1)
    row = int(np.argmax(widths))
    cols = np.where(skin[row])[0]
    chin_row = int(ys.max())
    jaw_row = chin_row - int(0.012 * PX_PER_UNIT)
    jaw_cols = np.where(skin[jaw_row])[0] if jaw_row >= 0 else []
    center_col = _col_of(0.0)
    column = np.where(skin[:, center_col])[0]
    return {
        "頬L": _pt(row, int(cols.max())),
        "頬R": _pt(row, int(cols.min())),
        "顎L": _pt(jaw_row, int(jaw_cols.max())) if len(jaw_cols) else None,
        "顎R": _pt(jaw_row, int(jaw_cols.min())) if len(jaw_cols) else None,
        "顎先": _pt(chin_row, int((xs[ys == chin_row].min()
                                  + xs[ys == chin_row].max()) * 0.5)),
        "生え際中央": _pt(int(column.min()), center_col) if len(column) else None,
    }


def all_landmarks(masks, ref):
    out = {}
    for sign in (1.0, -1.0):
        out.update(eye_landmarks(masks, tuple(ref["bands"]["eye"]), sign))
    out.update(brow_landmarks_pair(masks, tuple(ref["bands"]["brow"])))
    out.update(mouth_landmarks(masks, tuple(ref["bands"]["mouth"])))
    out.update(contour_landmarks(masks))
    return out


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "garudo"
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ref_path = os.path.join(root, "design", "characters", name, "face-reference.json")
    with open(ref_path, encoding="utf-8") as fh:
        ref = json.load(fh)

    model_rgba = render_model_face(name)
    model_rgb = model_rgba[:, :, :3] * model_rgba[:, :, 3:4] + \
        (1.0 - model_rgba[:, :, 3:4])  # 透過は白へ

    sheet = load_image(os.path.join(root, "design", "characters", name,
                                    "generated", f"{name}-sheet.png"))
    _, bbox = sheet_front_figure(sheet, ref["front_crop"])
    sheet_win = resample_sheet(sheet, bbox, float(ref["model_height"]))[:, :, :3]

    a = classify(sheet_win)
    b = classify(model_rgb)
    eye_ref = float(ref["bands"]["eye"][0] + ref["bands"]["eye"][1]) * 0.5
    fa, fb = face_metrics(a, eye_ref), face_metrics(b, eye_ref)

    # 顔の中心は**両目の中点**で合わせる。設定画の顔はわずかに傾けて
    # 描かれており、肌の外接箱の中心で合わせると全ランドマークのxに
    # 系統的なずれ(実測6.8mm)が乗る
    def eye_mid(masks):
        el = eye_landmarks(masks, tuple(ref["bands"]["eye"]), 1.0)
        er = eye_landmarks(masks, tuple(ref["bands"]["eye"]), -1.0)
        if "目の中心L" in el and "目の中心R" in er:
            return (el["目の中心L"][0] + er["目の中心R"][0]) * 0.5
        return None

    # 設定画側の両目の中点を**モデルの正中(x=0)**へ合わせる。
    # 以前はモデル側で測った中点へ合わせていたが、それだとモデルを
    # 少し変えるたびに基準が動き、モデルの良し悪しと無関係にIoUが上下する
    # (実測: 目の描かれ方が1.5mm変わっただけで肌IoUが0.80→0.74)。
    # モデルは左右対称に作ってあるので、正中が動かない基準になる
    mid_a = eye_mid(a)
    if mid_a is not None:
        shift = int(round(-mid_a * PX_PER_UNIT))
    else:
        shift = int(round((fb["center_x"] - fa["center_x"]) * PX_PER_UNIT))
    # 整合量を固定して比べたいとき用(モデルを変えたときのIoUの増減が、
    # 本当にモデルのせいか整合のずれかを切り分ける)
    forced = os.environ.get("FACE_QA_SHIFT")
    if forced:
        shift = int(forced)
    a_aligned = {k: np.roll(v, shift, axis=1) for k, v in a.items()}

    print(f"\n=== 顔の一致度: {name} ===")
    print(f"  設定画の正面図 外接箱={bbox}  中心合わせ={shift:+d}px")
    # **IoUは絶対値で判定しない。**
    # 設定画は左右非対称に描かれている(頬 +78.0/-63.5、顎先は中心から
    # +11.0)ので、左右対称のモデルが到達できるIoUには理論上の天井がある。
    # 天井に対する到達率で判定する(外部評価 2026-09-02:「0.90という
    # 合格基準の方が間違っていた」)。
    #
    # ただし**天井が効くのは左右対称に作る部位だけ**。顔の骨格は対称に
    # すると決めているので肌には効くが、**髪型は分け目があって元から
    # 左右非対称**なので、対称な形の上限は髪の上限ではない
    # (実測: 髪は上限0.857に対しIoU 0.871。到達率102%になり判定に
    # ならない)。髪は絶対値で見る(plan/models/garudo-hair-clumps.md の
    # 当初基準 0.80)。
    print(f"\n  {'領域':<14} {'IoU':>7} {'対称の上限':>11} {'到達率':>8}")
    ious = {}
    for key in ("skin", "hair"):
        ious[key] = iou(a_aligned[key], b[key])
        cap = symmetric_ceiling(a_aligned[key])
        rate = ious[key] / cap if cap else 0.0
        if key == "skin":
            ok_r = rate >= IOU_REACH_MIN
            note = f"(基準 到達率>={IOU_REACH_MIN * 100:.0f}%)"
        else:
            ok_r = ious[key] >= HAIR_IOU_MIN
            note = f"(基準 IoU>={HAIR_IOU_MIN:.2f}。髪型は非対称なので上限は参考)"
        print(f"  {key:<14} {ious[key]:>7.3f} {cap:>11.3f} {rate*100:>7.0f}%"
              f"  {'ok' if ok_r else 'NG'}  {note}")
        ious[key + "_rate"] = rate
        ious[key + "_ok"] = ok_r

    print(f"\n  {'ランドマーク':<20} {'設定画':>9} {'モデル':>9} {'差':>9}")
    passed = []
    # 目は縦32mm程度。これを超える塊は髪と融合しているので採らない
    eyes_a = eye_pair(a, tuple(ref["bands"]["eye"]), max_h=0.036)
    eyes_b = eye_pair(b, tuple(ref["bands"]["eye"]), max_h=0.036)
    # **目の大きさは「デカールの出所」と比べる。**
    # 目の絵は表情の区画「通常」からトレースしている(顔の解像度が
    # 1.5倍細かいため)。一方この窓の基準は三面図の正面図で、同じ設定画の
    # 中でも**2つの図は目の高さが2.5mm食い違う**(正面図26.0 / 通常23.5、
    # 実測)。位置(間隔・高さz)は窓の基準=正面図で、大きさ(幅・高さ)は
    # 絵の出所=通常で比べないと、モデルの出来と無関係な差を測ることになる
    eyes_src = eyes_a
    src_name = "正面図"
    if "通常" in ref.get("expressions", {}):
        try:
            import importlib
            import trace_face_svg as _T
            panel, _cal = _T.expression_window(sheet, ref["expressions"]["通常"],
                                               importlib.import_module(name), ref)
            got = eye_pair(classify(np.ascontiguousarray(panel[:, :, :3],
                                                         dtype=np.float32)),
                           tuple(ref["bands"]["eye"]), max_h=0.036)
            if got:
                eyes_src, src_name = got, "表情『通常』"
        except Exception as exc:          # noqa: BLE001
            print(f"  (目の大きさの基準を表情から取れず: {exc})")
    for field, jp, tol, src in (("gap", "目の間隔", 4.0, eyes_a),
                                ("z", "目の高さz", 3.0, eyes_a),
                                ("w", f"目の幅({src_name})", 4.0, eyes_src),
                                ("h", f"目の高さ({src_name})", 3.0, eyes_src)):
        passed.append(report(jp, src[field] if src else None,
                             eyes_b[field] if eyes_b else None, tol))
    brows_a = eye_pair(a, tuple(ref["bands"]["brow"]), min_size=25, max_h=0.020)
    brows_b = eye_pair(b, tuple(ref["bands"]["brow"]), min_size=25, max_h=0.020)
    # 眉は設定画側で前髪と融合しており検出が安定しない。参考値として
    # 出すだけで合否には入れない(判定に使うのは目・輪郭・IoU)
    for field, jp, tol in (("gap", "眉の間隔(参考)", 5.0),
                           ("z", "眉の高さz(参考)", 4.0)):
        report(jp, brows_a[field] if brows_a else None,
               brows_b[field] if brows_b else None, tol)
    passed.append(report("あご先z", fa["chin_z"], fb["chin_z"], 4.0))
    passed.append(report("顔の最大幅", fa["width"], fb["width"], 5.0))
    passed.append(report("最大幅の高さz", fa["width_z"], fb["width_z"], 6.0))
    passed.append(report("髪の最大幅", fa["hair_width"], fb["hair_width"], 6.0))
    passed.append(report("髪の最大幅の高さz", fa["hair_width_z"], fb["hair_width_z"], 8.0))
    passed.append(report("髪の頂点z", fa["hair_top_z"], fb["hair_top_z"], 6.0))
    passed.append(report("頭部の幅(目の高さ)", fa["head_at_eye"], fb["head_at_eye"], 6.0))

    # 高さごとの幅(1点の最大値では髪の掛かり方が分からない)
    print(f"\n  {'高さz':<20} {'肌(設定画)':>10} {'肌(モデル)':>10} {'差':>7}"
          f" | {'頭部(設定)':>9} {'頭部(モデル)':>10} {'差':>7}")
    head_a = a_aligned["skin"] | a_aligned["hair"]
    head_b = b["skin"] | b["hair"]
    for z in (0.790, 0.810, 0.830, 0.850, 0.870, 0.890, 0.910, 0.930):
        row = int((WIN_Z1 - z) * PX_PER_UNIT)
        sa = _row_span(a_aligned["skin"], row) * 1000
        sb = _row_span(b["skin"], row) * 1000
        ha = _row_span(head_a, row) * 1000
        hb = _row_span(head_b, row) * 1000
        print(f"  z={z:<18.3f} {sa:>10.1f} {sb:>10.1f} {sb - sa:>+7.1f}"
              f" | {ha:>9.1f} {hb:>10.1f} {hb - ha:>+7.1f}")

    # ---- 髪の輪郭(左右別) ----
    # 幅(span)だけでは足りない。設定画の髪は左右非対称に跳ねており、
    # 幅が合っていても**どちら側が出ているか**が違うと別人に見える。
    # さらに輪郭の凹凸量を測る: 房の尖りが無い「ヘルメット」は、幅が
    # 合っていてもこの値が設定画の半分になる(実測: 319 vs 589)
    print(f"\n  {'高さz':<10} {'設定左':>8} {'モデル左':>8} {'差':>7}"
          f" {'設定右':>8} {'モデル右':>8} {'差':>7} {'設定の左右差':>10}")
    hair_pass = True
    # z=0.790は使わない。設定画のその高さで左右±75mmにある濃い塊は髪では
    # なく**肩の革当て**で、拡大して確認済み。髪は顎の角(z≒0.80)で終わる。
    # ここを測ると「肩当てに届くまで横髪を伸ばす」方向へ引っ張られる
    for z in (0.810, 0.830, 0.870, 0.890, 0.910, 0.930, 0.950, 0.965):
        row = int((WIN_Z1 - z) * PX_PER_UNIT)
        ca, cb = np.where(head_a[row])[0], np.where(head_b[row])[0]
        if not len(ca) or not len(cb):
            continue
        to_x = lambda c: (c / PX_PER_UNIT - WIN_HALF_X) * 1000.0
        l0, r0 = to_x(ca.min()), to_x(ca.max())
        l1, r1 = to_x(cb.min()), to_x(cb.max())
        # **設定画がその高さで自分と食い違っている量**。頭の骨格は左右
        # 対称に作ると決めている(外部評価: 作画の非対称は誤差として
        # 扱う)ので、設定画の左右差が許容より大きい高さでは、どちらの
        # 側に合わせても反対側が外れる。そこは判定しない
        asym = abs(abs(l0) - r0)
        judged = asym <= 12.0
        if judged and max(abs(l1 - l0), abs(r1 - r0)) > 12.0:
            hair_pass = False
        print(f"  z={z:<8.3f} {l0:>8.1f} {l1:>8.1f} {l1 - l0:>+7.1f}"
              f" {r0:>8.1f} {r1:>8.1f} {r1 - r0:>+7.1f} {asym:>10.1f}"
              f"{'' if judged else '  参考'}")

    def raggedness(mask):
        w = []
        for row in range(int((WIN_Z1 - 0.975) * PX_PER_UNIT),
                         int((WIN_Z1 - 0.860) * PX_PER_UNIT)):
            cols = np.where(mask[row])[0]
            w.append(float(cols.max() - cols.min()) if len(cols) else 0.0)
        return float(np.abs(np.diff(np.array(w))).sum())

    # ---- 毛束の構造(外形だけを見ると「ウニ」になる) ----
    # 外形の指標は「輪郭が上下に振れること」しか見ないので、地肌へ垂直な
    # トゲを生やすだけで通ってしまう(実測54%→97%、見た目はウニ)。
    #
    # 見るのは**毛束1本ずつの輪郭**(第2次改訂)。設定画からなぞった輪郭
    # (design/characters/<名前>/hair-clumps.json の path_xz)を正面図の
    # 窓へ塗り、
    #   設定画側: その輪郭が設定画の髪に乗っているか(なぞり間違い)
    #   モデル側: その輪郭にモデルの髪が描画されているか(他の毛束や
    #             Hair Capに飲まれていないか)
    # の2つを測る。毛先1点だけを見ていたときは、毛束の**形**が違っても
    # 通ってしまった。
    clump_path = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "design", "characters", name,
        "hair-clumps.json")
    if os.path.exists(clump_path):
        with open(clump_path, encoding="utf-8") as fh:
            table = json.load(fh)
        majors = [(c, True) for c in table.get("major", [])]
        majors += [(c, False) for c in table.get("aux", [])]
        # 細い毛束は**線として描かれている**(墨の1本線)。彩度の低い
        # 濃い画素は classify では hair に入らないので、設定画側の判定は
        # hair と dark の和で見る(実測: 頭頂の細い跳ねは hair 判定 8%)
        sheet_hair = a_aligned["hair"] | a_aligned["dark"]
        # 墨の線には太さがあり、周りは中間調でどの分類にも入らない。
        # 1.5mmだけ太らせてから比べる(輪郭は毛束の外側をなぞるので、
        # 細い毛束ほどこの猶予が要る)
        pad = int(round(0.0015 * PX_PER_UNIT))
        grown = sheet_hair.copy()
        for dr in range(-pad, pad + 1):
            for dc in range(-pad, pad + 1):
                grown |= np.roll(np.roll(sheet_hair, dr, axis=0), dc, axis=1)
        sheet_hair = grown
        rows = []
        for clump, is_major in majors:
            poly = clump.get("path_xz")
            if not poly:
                continue
            mask = fill_polygon(poly)
            area = int(mask.sum())
            if area < 20:
                continue
            on_sheet = float((mask & sheet_hair).sum()) / area
            on_model = float((mask & b["hair"]).sum()) / area
            rows.append((clump["name"], is_major, area, on_sheet, on_model))
        if rows:
            print(f"\n  {'毛束':<14}{'面積mm2':>9}{'設定画で髪':>11}{'モデルで髪':>11}")
            for nm, is_major, area, on_sheet, on_model in rows:
                flag = "" if on_model >= 0.90 else "  NG"
                print(f"  {nm:<14}{area / PX_PER_UNIT ** 2 * 1e6:>9.0f}"
                      f"{on_sheet * 100:>10.0f}%{on_model * 100:>10.0f}%{flag}")
            worst_sheet = min(r[3] for r in rows if r[1])
            worst_model = min(r[4] for r in rows if r[1])
            ok_c = worst_sheet >= 0.90 and worst_model >= 0.90
            print(f"  毛束の輪郭  設定画で最悪 {worst_sheet * 100:.0f}% / "
                  f"モデルで最悪 {worst_model * 100:.0f}%"
                  f"  {'ok' if ok_c else 'NG'}  (基準 どちらも>=90%)")
            passed.append(ok_c)

    ra, rb = raggedness(head_a), raggedness(head_b)
    ok_r = rb >= ra * 0.7
    print(f"  上部輪郭の凹凸  設定画 {ra:.0f}px / モデル {rb:.0f}px "
          f"({rb / max(ra, 1) * 100:.0f}%)  {'ok' if ok_r else 'NG'}"
          f"  (基準>=70%: 毛先の尖りがあるか)")
    print(f"  髪の左右輪郭   {'ok' if hair_pass else 'NG'}  (許容±12mm)")
    passed.append(hair_pass)
    passed.append(ok_r)

    # ---- 意味的ランドマーク回帰 ----
    # 誤差は**左右を平均した設定画**に対して measure する(symmetric_target)。
    # 設定画自身の左右差を最後の列に出すので、平均で隠れることはない。
    la = all_landmarks(a_aligned, ref)
    lb = all_landmarks(b, ref)
    # 顔の中心線に乗る部位は**高さだけ**で見る。設定画は顔がわずかに
    # 振られて描かれていて、あご先が中心から11mmずれている。モデルは
    # 左右対称に作ると決めているので、xを比べると必ずその分だけ外れる
    # (実測: あご先 z は 775.0 で一致、x だけ 11.5mm)
    MIDLINE = {"顎先", "生え際中央", "口中央", "鼻先"}

    def symmetric_target(key):
        """
        設定画の左右を平均した「対称化した基準」。

        設定画は顔がわずかに振られて描かれていて、同じ部位でも左右で
        位置が違う(実測: 頬 +78.0 / -63.5、あご先が中心から+11.0)。
        モデルは**左右対称に作ると決めている**(外部評価: 作画の非対称は
        誤差として扱う)ので、片側に合わせれば必ず反対側が外れる。
        領域IoUで「対称の上限」を出したのと同じ考えで、左右の平均を
        基準にし、設定画自身の左右差は併記する。
        """
        if key[-1] not in "LR":
            return la.get(key), 0.0
        other = key[:-1] + ("R" if key[-1] == "L" else "L")
        p, q = la.get(key), la.get(other)
        if p is None or q is None:
            return p, 0.0
        sign = 1.0 if p[0] >= 0 else -1.0
        x = (abs(p[0]) + abs(q[0])) * 0.5 * sign
        z = (p[1] + q[1]) * 0.5
        return (x, z), math.hypot(abs(p[0]) - abs(q[0]), p[1] - q[1]) * 1000.0

    print(f"\n  {'ランドマーク(部位)':<18} {'設定画x,z':>17} {'モデルx,z':>17}"
          f" {'誤差':>7} {'設定の左右差':>10}")
    errors = []
    for key in la:
        pa, pb = la.get(key), lb.get(key)
        if pa is None or pb is None:
            print(f"  {key:<18} {'--':>17} {'--':>17} {'検出不能':>7}")
            continue
        target, asym = symmetric_target(key)
        if key in MIDLINE:
            err = abs(pb[1] - pa[1]) * 1000.0
        else:
            err = math.hypot(pb[0] - target[0], pb[1] - target[1]) * 1000.0
        errors.append((err, key))
        print(f"  {key:<18} {pa[0] * 1000:>8.1f},{pa[1] * 1000:>8.1f} "
              f"{pb[0] * 1000:>8.1f},{pb[1] * 1000:>8.1f} {err:>7.1f}"
              f" {asym:>10.1f}"
              f"{'  (高さのみ)' if key in MIDLINE else ''}")
    if errors:
        mean_err = sum(e for e, _ in errors) / len(errors)
        worst, worst_key = max(errors)
        print(f"\n  平均誤差 {mean_err:.1f}mm / 最大誤差 {worst:.1f}mm ({worst_key})"
              f"  [{len(errors)}点]")
        passed.append(mean_err <= 3.0)
        passed.append(worst <= 6.0)
        print(f"  受け入れ基準: 平均<=3.0mm {'ok' if mean_err <= 3.0 else 'NG'} / "
              f"最大<=6.0mm {'ok' if worst <= 6.0 else 'NG'}")
        print("  ずれの大きい順:")
        for err, key in sorted(errors, reverse=True)[:6]:
            print(f"    {key:<18} {err:>6.1f}mm")

    # 比較画像(左=設定画・中=モデル・右=重ね合わせ)
    overlay = np.ones((RES_Y, RES_X, 4), dtype=np.float32)
    red = a_aligned["skin"] | a_aligned["hair"]
    blue = b["skin"] | b["hair"]
    overlay[:, :, :3][red] = (1.0, 0.35, 0.35)
    overlay[:, :, :3][blue] = np.minimum(overlay[:, :, :3][blue], (0.35, 0.35, 1.0))
    gap = np.ones((RES_Y, 8, 4), dtype=np.float32)
    ones = np.ones((RES_Y, RES_X, 1), dtype=np.float32)
    combined = np.concatenate([np.concatenate([sheet_win, ones], axis=2), gap,
                               np.concatenate([model_rgb, ones], axis=2), gap,
                               overlay], axis=1)
    out_path = os.path.join(C.PREVIEW_DIR, "face", f"{name}-compare.png")
    save_image(out_path, combined)

    ok = all(passed) and ious["skin_ok"] and ious["hair_ok"]
    print(f"\n  判定: {'PASS' if ok else 'FAIL'}   → {out_path}\n")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
