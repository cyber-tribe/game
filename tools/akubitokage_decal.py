"""
あくびとかげのテクスチャを**設定画から直接**作る。

plan/models/reference-akubitokage-sheet.png の三面図(正面・側面・背面)から
- 顔の線画(半目・鼻孔2点・への字口) ―― 正面のみ
- 全身の明色斑点(頭・首・腕・背中・腰・尾)
を抽出し、モデル座標へ写した3枚のデカール PNG を作る。モデル側
(tools/models/akubitokage_v3.py)は法線の向きでこの3枚を混ぜる
(トライプラナー投影)。

想像で描かない ―― 設定画の絵をそのまま写すので、似ないという失敗の余地がない
(ガルドの face.svg での教訓: 指標は合うのに顔が似ない)。

    python3 tools/akubitokage_decal.py

出力: design/characters/akubitokage/generated/
    akubitokage-decal-{front,side,back}.png   RGBA
    akubitokage-decal-front-half.png          あくび予備(口が少し開く)
    akubitokage-decal-front-yawn.png          大あくび(口腔が大きく出る)
    akubitokage-decal.json                    座標系
    akubitokage-decal-debug.png               抽出の確認
"""
from __future__ import annotations

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "plan", "models", "reference-akubitokage-sheet.png")
OUT_DIR = os.path.join(ROOT, "design", "characters", "akubitokage", "generated")

# 三面図の各ビュー(シート上の枠。暗い連結成分の外接箱で実測した値)
VIEWS = {
    "front": (612, 144, 737, 289),
    "side": (831, 143, 992, 288),
    "back": (1051, 144, 1177, 289),
}
UPSCALE = 6                    # 1体が 125x145px しかないので拡大して抽出する
MARGIN = 4                     # 枠の外側に取る余白(シートpx)

# ---- 抽出のしきい値(明度 0〜255)
BODY_LUM = 165                 # 体(暗い紫)の上限。紙は 235 前後
ERODE = 3                      # 輪郭線を除くための内側への侵食(シートpx)
LINE_LUM = 62                  # 顔の線画(半目・口)
NOSTRIL_LUM = 80               # 鼻孔は線より薄い
EYE_LUM = 100                  # 眼裂(縁まで含める)
SPOT_LUM = 118                 # 明色斑点の下限(体の中央値は 86 前後)
SPOT_MIN = 2                   # 斑点の最小面積(シートpx²)
SPOT_MAX = 40                  # 最大面積。これ以上は腹などの大きな色面
SPOT_FILL = 0.42               # 外接箱に対する充填率の下限(細長い影を除く)

# ---- ゲーム表示用の誇張(実ゲーム距離では大きな色面しか読まれない)
EYE_DILATE_Z = 3               # 眼裂の縦膨張(拡大後px)
EYE_SMOOTH = 2.5
LID_UP = 13                    # まぶた面の高さ(シートpx)。設定画の実測は 11
MOUTH_DILATE_Z = 5
NOSTRIL_DILATE = 2
SPOT_DILATE = 0                # 斑点は膨張させない(設定画のものは小さい)

# ---- 色。設定画の実測を、体色の実測とモデルの体色の比で写した値
#      体(暗部) sRGB(59,55,68) / 明色(斑点) (128,115,130) / モデル体色 (0.30,0.28,0.30)
LINE_RGB = (0.14, 0.11, 0.15)
LID_RGB = (0.36, 0.33, 0.36)
SPOT_RGB = (0.60, 0.55, 0.58)
SPOT_ALPHA = 0.38              # 設定画の斑点は輪郭が柔らかく淡い

# ---- あくびの開口(顔アトラスのコマ)。設定画に「正面のあくび」は無いので、
#      側面の あくび表情 から**比**を実測して正面へ補間する(新しいデザインを
#      発明するのではなく、既に定義されている口の色・開口量・口角を
#      正面投影へ写す作業)。実測: 口腔の 高さ/幅 = 0.55
MOUTH_RGB = (0.729, 0.584, 0.675)   # パレットの「口の中(あくび時)」
MOUTH_EDGE_RGB = (0.30, 0.20, 0.31)  # 口の縁(内側の影)
YAWN_HALF_W = 0.0229           # 正面: 半幅(通常の口線の幅と同じ)
YAWN_HALF_H = 0.0126           # 半高(幅 × 0.55 / 2)
YAWN_CZ = 0.0810               # 口腔の中心の高さ(口線から下へ開く)
# 側面: 口は顔の前half にある。y の中心と半幅(側面の開口の奥行き)
YAWN_SIDE_CY = -0.0360
YAWN_SIDE_HALF_W = 0.0175
HALF_SCALE = (0.85, 0.40)      # 「あくび予備」のコマの縮尺

# ---- モデル座標(tools/models/akubitokage_v3.py と同期させること)
MODEL_H = 0.134                # 全高(背びれ・頭頂の突起を含む)
MODEL_EYE = (0.0248, 0.1045)   # 目の島の中心 (|x|, z)
MODEL_MOUTH_Z = 0.0904         # 口線の高さ
MODEL_NOSE_Y = -0.052          # 鼻先(側面デカールの原点)
DECAL_X = (-0.075, 0.075)      # front/back の横範囲
DECAL_Y = (-0.075, 0.125)      # side の前後範囲
DECAL_Z = (0.0, 0.145)
PPU = 8000.0                   # 0.125mm/px


def largest(mask: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(2 * r + 1))
    return np.asarray(im) > 127


def smooth(mask: np.ndarray, r: float) -> np.ndarray:
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im) > 127


def blur(mask: np.ndarray, r: float) -> np.ndarray:
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32) / 255.0


def dilate_z(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for d in range(1, r + 1):
        out |= np.roll(mask, d, axis=0) | np.roll(mask, -d, axis=0)
    return out


def dilate_box(mask: np.ndarray, r: int) -> np.ndarray:
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))
    return np.asarray(im) > 127


def boxes(mask: np.ndarray):
    """連結成分の (id, size, x0, y0, x1, y1, cx, cy) を大きい順に返す。"""
    lab, n = ndimage.label(mask)
    if n == 0:
        return lab, []
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        size = int((lab[sl] == i).sum())
        ys, xs = sl
        cy, cx = ndimage.center_of_mass(lab == i)
        out.append({"id": i, "size": size, "x0": xs.start, "x1": xs.stop - 1,
                    "y0": ys.start, "y1": ys.stop - 1, "cx": float(cx), "cy": float(cy)})
    out.sort(key=lambda c: -c["size"])
    return lab, out


class View:
    def __init__(self, name: str, box):
        sheet = Image.open(SHEET).convert("RGB")
        x0, y0, x1, y1 = box
        crop = sheet.crop((x0 - MARGIN, y0 - MARGIN, x1 + MARGIN + 1, y1 + MARGIN + 1))
        self.name = name
        self.img = crop.resize((crop.width * UPSCALE, crop.height * UPSCALE), Image.BICUBIC)
        a = np.asarray(self.img).astype(np.float32)
        self.lum = a.mean(axis=2)
        self.body = largest(self.lum < BODY_LUM)
        self.inner = erode(self.body, ERODE * UPSCALE // 2)
        ys, xs = np.where(self.body)
        self.x0, self.x1, self.y0, self.y1 = xs.min(), xs.max(), ys.min(), ys.max()
        self.h = self.y1 - self.y0
        self.s = MODEL_H / self.h              # m / 拡大後px(等方)
        # 胴の中心: 体の高さ 45〜60% の行の中点(尾を含む外接箱の中心ではない)
        rows = range(int(self.y0 + 0.45 * self.h), int(self.y0 + 0.60 * self.h))
        mids = []
        for r in rows:
            xs2 = np.where(self.body[r])[0]
            if len(xs2):
                mids.append((xs2.min() + xs2.max()) / 2)
        self.cx = float(np.median(mids)) if mids else (self.x0 + self.x1) / 2

    def spots(self) -> np.ndarray:
        """明色斑点。小さく詰まった塊だけを拾う(腹の大きな色面・輪郭の影は除く)。"""
        m = (self.lum > SPOT_LUM) & self.inner
        lab, cs = boxes(m)
        lo = SPOT_MIN * UPSCALE * UPSCALE
        hi = SPOT_MAX * UPSCALE * UPSCALE
        keep = [c["id"] for c in cs
                if lo <= c["size"] <= hi
                and c["size"] / max(1, (c["x1"] - c["x0"] + 1) * (c["y1"] - c["y0"] + 1)) > SPOT_FILL]
        m2 = np.isin(lab, keep)
        return dilate_box(m2, SPOT_DILATE * UPSCALE // 2) if SPOT_DILATE else m2


def extract_face(v: View):
    """正面ビューから 眼裂・まぶた面・鼻孔・口 を取る。返り値は (線画, まぶた面)。"""
    lab, cs = boxes((v.lum < LINE_LUM) & v.inner)
    head_bottom = v.y0 + 0.42 * v.h          # 顔は上から 42% まで
    cand = [c for c in cs if c["size"] >= 3 * UPSCALE * UPSCALE and c["cy"] < head_bottom]
    if not cand:
        raise SystemExit("顔の線画が見つからない")
    mouth = max(cand, key=lambda c: c["x1"] - c["x0"])
    above = [c for c in cand if c["cy"] < mouth["cy"] - 3 * UPSCALE and c is not mouth]
    left = [c for c in above if c["cx"] < mouth["cx"]]
    right = [c for c in above if c["cx"] > mouth["cx"]]
    if not left or not right:
        raise SystemExit(f"目が見つからない: L={len(left)} R={len(right)}")
    eyes = [max(left, key=lambda c: c["size"]), max(right, key=lambda c: c["size"])]
    eye_y = (eyes[0]["cy"] + eyes[1]["cy"]) / 2
    cx_face = (eyes[0]["cx"] + eyes[1]["cx"]) / 2

    nlab, ncs = boxes((v.lum < NOSTRIL_LUM) & v.inner)
    nostrils = [c for c in ncs
                if eyes[0]["x1"] < c["cx"] < eyes[1]["x0"]
                and eye_y - 3 * UPSCALE < c["cy"] < mouth["cy"] - 3 * UPSCALE
                and 2 * UPSCALE * UPSCALE <= c["size"] <= 30 * UPSCALE * UPSCALE]
    nostril = dilate_box(np.isin(nlab, [c["id"] for c in nostrils]), NOSTRIL_DILATE)
    line = dilate_z(np.isin(lab, [mouth["id"]]), MOUTH_DILATE_Z) | nostril

    # 目は2層。設定画は「上に体色より明るい大きなまぶた面 → 下端に黒い眼裂」。
    # 左右非対称(斜めから描かれている)なので、大きく写っている方を鏡像にする
    def mirror(mask):
        out = np.zeros_like(mask)
        xs = np.arange(mask.shape[1])
        src = np.round(2 * cx_face - xs).astype(int)
        ok = (src >= 0) & (src < mask.shape[1])
        out[:, ok] = mask[:, src[ok]]
        return out

    eye_src = max(eyes, key=lambda c: (c["x1"] - c["x0"]) * (c["y1"] - c["y0"]))
    pad = 2 * UPSCALE
    box = np.zeros_like(v.inner)
    box[max(0, eye_src["y0"] - pad):eye_src["y1"] + pad + 1,
        max(0, eye_src["x0"] - pad):eye_src["x1"] + pad + 1] = True
    slit = dilate_z(smooth((v.lum < EYE_LUM) & v.inner & box, EYE_SMOOTH), EYE_DILATE_Z)
    # まぶた面は設定画の明色が紙目で途切れるので、眼裂の形から半月を作る
    lid = np.zeros_like(slit)
    cols = np.where(slit.any(axis=0))[0]
    if len(cols):
        x_lo, x_hi = cols.min(), cols.max()
        half = max(1.0, (x_hi - x_lo) / 2.0)
        for x in cols:
            top = np.where(slit[:, x])[0].min()
            u = abs(x - (x_lo + x_hi) / 2.0) / half
            hh = int(LID_UP * UPSCALE * math.sqrt(max(0.0, 1.0 - u * u)))
            if hh:
                lid[max(0, top - hh):top, x] = True
    lid = smooth(lid, EYE_SMOOTH) | slit
    slit |= mirror(slit)
    lid |= mirror(lid)
    return (line | slit), lid, (nostril | slit), dict(
        eyes=eyes, mouth=mouth, nostrils=nostrils, eye_y=eye_y, cx_face=cx_face)


def sample(mask_f: np.ndarray, px: np.ndarray, py: np.ndarray) -> np.ndarray:
    h, w = mask_f.shape
    x0 = np.floor(px).astype(int)
    y0 = np.floor(py).astype(int)
    tx, ty = px - x0, py - y0
    ok = (x0 >= 0) & (y0 >= 0) & (x0 + 1 < w) & (y0 + 1 < h)
    xc = np.clip(x0, 0, w - 2)
    yc = np.clip(y0, 0, h - 2)
    v = (mask_f[yc, xc] * (1 - tx) + mask_f[yc, xc + 1] * tx) * (1 - ty) \
        + (mask_f[yc + 1, xc] * (1 - tx) + mask_f[yc + 1, xc + 1] * tx) * ty
    return np.where(ok, v, 0.0)


def main() -> None:
    views = {k: View(k, b) for k, b in VIEWS.items()}
    line, lid, line_nomouth, info = extract_face(views["front"])
    spots = {k: v.spots() for k, v in views.items()}
    # 顔の造作(まぶた面・眼裂・口・鼻孔)に重なる斑点は落とす。Face Gate で
    # 確定した顔の上に斑点が乗ると、目と口が読めなくなる
    face_keep = dilate_box(line | lid, 3 * UPSCALE)
    flab, fcs = boxes(spots["front"])
    drop = {c["id"] for c in fcs
            if face_keep[int(round(c["cy"])), int(round(c["cx"]))]}
    spots["front"] = np.isin(flab, [c["id"] for c in fcs if c["id"] not in drop])

    W = int(round((DECAL_X[1] - DECAL_X[0]) * PPU))
    Wy = int(round((DECAL_Y[1] - DECAL_Y[0]) * PPU))
    H = int(round((DECAL_Z[1] - DECAL_Z[0]) * PPU))
    zs = DECAL_Z[1] - (np.arange(H) + 0.5) / PPU

    meta = {"ppu": PPU, "z": DECAL_Z, "x": DECAL_X, "y": DECAL_Y,
            "model_h": MODEL_H, "model_eye": MODEL_EYE, "model_mouth_z": MODEL_MOUTH_Z,
            "views": {}}
    out_imgs = {}
    for name, v in views.items():
        if name == "side":
            us = DECAL_Y[0] + (np.arange(Wy) + 0.5) / PPU
            # 側面は鼻先(体の最前 = 画像の左端)を y=MODEL_NOSE_Y に合わせる
            px = (us[None, :] - MODEL_NOSE_Y) / v.s + v.x0
        else:
            us = DECAL_X[0] + (np.arange(W) + 0.5) / PPU
            sign = -1.0 if name == "back" else 1.0   # 背面は左右反転
            px = sign * us[None, :] / v.s + v.cx
        py = (v.y1 - zs[:, None] / v.s)[:, :]
        px = np.broadcast_to(px, (H, px.shape[1]))
        py = np.broadcast_to(py, (H, px.shape[1]))

        sp = sample(blur(spots[name].astype(np.float32), 1.6), px, py) * SPOT_ALPHA

        def base_layer():
            rgba = np.zeros((H, px.shape[1], 4), np.float32)
            for c in range(3):
                rgba[..., c] = SPOT_RGB[c]
            rgba[..., 3] = sp.copy()
            return rgba

        def over(rgba, alpha, rgb):
            for c in range(3):
                rgba[..., c] = rgba[..., c] * (1 - alpha) + rgb[c] * alpha
            rgba[..., 3] = np.maximum(rgba[..., 3], alpha)

        def save(rgba, fname):
            im = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")
            os.makedirs(OUT_DIR, exist_ok=True)
            im.save(os.path.join(OUT_DIR, fname))
            return im

        gx_side = np.broadcast_to(DECAL_Y[0] + (np.arange(px.shape[1]) + 0.5) / PPU,
                                  (H, px.shape[1])) if name == "side" else None
        gz_all = np.broadcast_to(zs[:, None], (H, px.shape[1]))

        def side_mouth(sx, sy):
            u = (gx_side - YAWN_SIDE_CY) / (YAWN_SIDE_HALF_W * sx)
            v = (gz_all - YAWN_CZ) / (YAWN_HALF_H * sy)
            dd = np.sqrt(u * u + v * v)
            return (np.clip((1.0 - dd) / 0.18, 0.0, 1.0),
                    np.clip(1.0 - abs(dd - 1.0) / 0.22, 0.0, 1.0) * 0.85)

        if name == "back":
            out_imgs[name] = save(base_layer(), f"akubitokage-decal-{name}.png")
        elif name == "side":
            # 側面も3コマ。あくびで口の中が横からも見えるようにする
            for fname, sc in (("akubitokage-decal-side.png", None),
                              ("akubitokage-decal-side-half.png", HALF_SCALE),
                              ("akubitokage-decal-side-yawn.png", (1.0, 1.0))):
                rgba = base_layer()
                if sc is not None:
                    inner, edge = side_mouth(*sc)
                    over(rgba, inner, MOUTH_RGB)
                    over(rgba, edge * (1 - inner), MOUTH_EDGE_RGB)
                im = save(rgba, fname)
                if sc is None:
                    out_imgs[name] = im
        else:
            lda = sample(blur(lid.astype(np.float32), 1.8), px, py)
            la = sample(blur(line.astype(np.float32), 1.2), px, py)
            la_nomouth = sample(blur(line_nomouth.astype(np.float32), 1.2), px, py)
            # デカール平面上の座標(m)。楕円の口はここで直接描く
            gx = np.broadcast_to(DECAL_X[0] + (np.arange(px.shape[1]) + 0.5) / PPU,
                                 (H, px.shape[1]))
            gz = np.broadcast_to(zs[:, None], (H, px.shape[1]))

            def mouth_layer(sx, sy):
                """開いた口(楕円)の内側 alpha と縁 alpha。"""
                u = gx / (YAWN_HALF_W * sx)
                v = (gz - YAWN_CZ) / (YAWN_HALF_H * sy)
                d = np.sqrt(u * u + v * v)
                inner = np.clip((1.0 - d) / 0.18, 0.0, 1.0)
                edge = np.clip((1.0 - abs(d - 1.0) / 0.22), 0.0, 1.0) * 0.85
                return inner, edge

            for fname, mouth_scale in (("akubitokage-decal-front.png", None),
                                       ("akubitokage-decal-front-half.png", HALF_SCALE),
                                       ("akubitokage-decal-front-yawn.png", (1.0, 1.0))):
                rgba = base_layer()
                over(rgba, lda, LID_RGB)
                if mouth_scale is None:
                    over(rgba, la, LINE_RGB)          # 通常: への字口
                else:
                    over(rgba, la_nomouth, LINE_RGB)  # 口線は消し、開いた口を描く
                    inner, edge = mouth_layer(*mouth_scale)
                    over(rgba, inner, MOUTH_RGB)
                    over(rgba, edge * (1 - inner), MOUTH_EDGE_RGB)
                im = save(rgba, fname)
                if mouth_scale is None:
                    out_imgs[name] = im
        meta["views"][name] = {"scale_m_per_px": v.s * UPSCALE, "sheet_box": VIEWS[name],
                               "spots": int(ndimage.label(spots[name])[1])}
        print(f"{name}: {out_imgs[name].size}  斑点 {meta['views'][name]['spots']} 個  "
              f"{v.s * UPSCALE * 1000:.3f} mm/シートpx")
    json.dump(meta, open(os.path.join(OUT_DIR, "akubitokage-decal.json"), "w"),
              indent=1, ensure_ascii=False)

    # デバッグ: 抽出した成分を枠で示した3ビュー + 生成したデカール
    tiles = []
    for name, v in views.items():
        d = v.img.convert("RGBA").copy()
        dr = ImageDraw.Draw(d)
        lab, cs = boxes(spots[name])
        for c in cs:
            dr.rectangle([c["x0"], c["y0"], c["x1"], c["y1"]], outline="orange", width=2)
        if name == "front":
            for e in info["eyes"]:
                dr.rectangle([e["x0"], e["y0"], e["x1"], e["y1"]], outline="red", width=3)
            m = info["mouth"]
            dr.rectangle([m["x0"], m["y0"], m["x1"], m["y1"]], outline="blue", width=3)
        tiles.append(d)
        tiles.append(out_imgs[name].resize((out_imgs[name].width // 3,
                                            out_imgs[name].height // 3), Image.LANCZOS))
    ww = sum(t.width for t in tiles) + 10 * len(tiles)
    hh = max(t.height for t in tiles)
    canvas = Image.new("RGBA", (ww, hh), (120, 120, 128, 255))
    x = 0
    for t in tiles:
        canvas.paste(t, (x, 0), t if t.mode == "RGBA" else None)
        x += t.width + 10
    canvas.save(os.path.join(OUT_DIR, "akubitokage-decal-debug.png"))


if __name__ == "__main__":
    main()
