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
    out.pixels.foreach_set(rgba[::-1].ravel())
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
    below = np.zeros(rgb.shape[:2], dtype=bool)
    rows = np.arange(rgb.shape[0])
    below[(WIN_Z1 - rows / PX_PER_UNIT) < NECK_Z] = True
    for key in ("skin", "hair", "dark", "white"):
        locals()[key][below] = False
    skin[below] = False
    hair[below] = False
    dark[below] = False
    white[below] = False
    return {"skin": skin, "hair": hair, "dark": dark, "white": white}


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


def resample_sheet(sheet: "np.ndarray", bbox, model_height: float) -> "np.ndarray":
    """設定画の正面図を、モデルと同じウィンドウ・同じ倍率へ写す"""
    x0, y0, x1, y1 = bbox
    units_per_px = model_height / (y1 - y0)
    center_x = (x0 + x1) * 0.5
    sole_y = y1
    rows = np.arange(RES_Y)
    cols = np.arange(RES_X)
    xs_model = cols / PX_PER_UNIT - WIN_HALF_X
    zs_model = WIN_Z1 - rows / PX_PER_UNIT
    sx = np.clip((center_x + xs_model / units_per_px).astype(int), 0, sheet.shape[1] - 1)
    sy = np.clip((sole_y - zs_model / units_per_px).astype(int), 0, sheet.shape[0] - 1)
    return sheet[np.ix_(sy, sx)]


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
        "z": (a["cz"] + b["cz"]) * 0.5,
        "w": (a["w"] + b["w"]) * 0.5,
        "h": (a["h"] + b["h"]) * 0.5,
    }


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

    # 顔の中心を合わせてからシルエットを比べる(設定画の図は中心が
    # 全身の外接箱の中心とわずかにずれる)
    shift = int(round((fb["center_x"] - fa["center_x"]) * PX_PER_UNIT))
    a_aligned = {k: np.roll(v, shift, axis=1) for k, v in a.items()}

    print(f"\n=== 顔の一致度: {name} ===")
    print(f"  設定画の正面図 外接箱={bbox}  中心合わせ={shift:+d}px")
    print(f"\n  {'領域':<20} {'IoU':>8}")
    ious = {}
    for key, tol in (("skin", 0.90), ("hair", 0.80)):
        ious[key] = iou(a_aligned[key], b[key])
        print(f"  {key:<20} {ious[key]:>8.3f}  {'ok' if ious[key] >= tol else 'NG'}"
              f"  (目標>={tol})")

    print(f"\n  {'ランドマーク':<20} {'設定画':>9} {'モデル':>9} {'差':>9}")
    passed = []
    # 目は縦32mm程度。これを超える塊は髪と融合しているので採らない
    eyes_a = eye_pair(a, tuple(ref["bands"]["eye"]), max_h=0.036)
    eyes_b = eye_pair(b, tuple(ref["bands"]["eye"]), max_h=0.036)
    for field, jp, tol in (("gap", "目の間隔", 4.0), ("z", "目の高さz", 3.0),
                           ("w", "目の幅", 4.0), ("h", "目の高さ", 3.0)):
        passed.append(report(jp, eyes_a[field] if eyes_a else None,
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

    ok = all(passed) and ious["skin"] >= 0.90 and ious["hair"] >= 0.80
    print(f"\n  判定: {'PASS' if ok else 'FAIL'}   → {out_path}\n")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
