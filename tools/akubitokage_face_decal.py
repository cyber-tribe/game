"""
あくびとかげの顔デカールを**設定画から直接**作る(Face Texture Gate 用の仮版)。

設定画 plan/models/reference-akubitokage-sheet.png の三面図・正面の頭部から、
- 暗い線画(半目・鼻孔2点・への字口)
- 明るい模様(頬・額の明色パッチ)
を抽出し、モデル座標(x, z)平面のデカール PNG に写す。

想像で描かない(ガルドの face.svg での失敗: 指標は合うのに顔が似ない)。
設定画の絵をそのまま写すので、似ないという失敗の余地がない。

写し方: 設定画の両目の中心と口の中心を、モデル側の目の島の中心・口線の
高さ(tools/models/akubitokage_v3.py の FACE_ANCHORS)に合わせるアフィン変換。
モデルの頭は設定画より縦に圧縮されているので、x と z の倍率は別々。

    python3 tools/akubitokage_face_decal.py

出力:
  design/characters/akubitokage/generated/akubitokage-face-decal.png  (RGBA)
  design/characters/akubitokage/generated/akubitokage-face-decal.json (座標系)
  design/characters/akubitokage/generated/akubitokage-face-decal-debug.png
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "plan", "models", "reference-akubitokage-sheet.png")
OUT_DIR = os.path.join(ROOT, "design", "characters", "akubitokage", "generated")
OUT_PNG = os.path.join(OUT_DIR, "akubitokage-face-decal.png")
OUT_JSON = os.path.join(OUT_DIR, "akubitokage-face-decal.json")
OUT_DEBUG = os.path.join(OUT_DIR, "akubitokage-face-decal-debug.png")

# 三面図・正面の頭部があるシート上の窓(px)。目視で決めた
FRONT_BOX = (600, 130, 770, 250)
UPSCALE = 4                       # 抽出は 4 倍に拡大して行う(線が 2〜3px しかない)
LINE_LUM = 62                     # 線画(半目・口)の明度上限(0〜255)
NOSTRIL_LUM = 80                  # 鼻孔2点は線より薄いので別のしきい値
EYE_LUM = 100                     # 目は眼裂の縁(60〜90)まで含める(外接箱の中だけ)
EYE_PAD = 2                       # 目の外接箱を広げる量(シートpx)
# 実ゲーム距離では半目の黒い形しか読まれないので、眼裂を縦に膨張させて誇張する
# (設定画の眼裂は高さ 2mm しかなく、そのままだと細い波線に見える)
EYE_DILATE_Z = 2                  # 眼裂の縦膨張(拡大後px)。太さはまぶた面が担う
EYE_SMOOTH = 2.5                  # 眼裂の輪郭を滑らかにする半径(拡大後px)
MOUTH_DILATE_Z = 4                # 口線も同様に太らせる(設定画の線は 2px しかない)
NOSTRIL_DILATE = 2
BODY_LUM = 150                    # 体(暗い紫)の明度上限。頭の輪郭マスクに使う
ERODE_PX = 7 * UPSCALE // 2       # 輪郭線を除くための内側への侵食(拡大後px)
# 明色パッチの明度範囲。シート解像度では体の明度が 51〜134(5〜95%点)なので、
# それより明るい 128 以上を模様とみなす(紙 ≈ 235 以上は除く)
LIGHT_LUM = (132, 236)

# モデル側の基準点(tools/models/akubitokage_v3.py で実測。目の島の中心と口線)
MODEL_EYE = (0.0248, 0.1045)      # (|x|, z)
MODEL_MOUTH_Z = 0.0904
# デカールの座標系(モデル座標 m)。1px = 0.1mm
DECAL_X0, DECAL_X1 = -0.046, 0.046
DECAL_Z0, DECAL_Z1 = 0.072, 0.132
PPU = 10000.0

LINE_RGB = (0.14, 0.11, 0.15)     # 線画の色(体より暗い墨紫)
LIGHT_RGB = (0.565, 0.494, 0.565) # 明色パッチ(パレットの「斑点・模様」)
# 上まぶたの面。設定画の実測(sRGB 114,101,121)を、体色の実測(96,86,102)と
# モデルの体色 SHEET["main"](0.30,0.28,0.30)の比で写した値。体色より少し明るい紫
LID_RGB = (0.36, 0.33, 0.36)
# まぶた面の高さ。設定画の実測(眼裂の上 11px = 9mm が lum 111〜160)
LID_UP = 11


def components(mask: np.ndarray):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    out = []
    n = 0
    for yy in range(h):
        for xx in range(w):
            if mask[yy, xx] and lab[yy, xx] == 0:
                n += 1
                st = [(yy, xx)]
                lab[yy, xx] = n
                pts = []
                while st:
                    cy, cx = st.pop()
                    pts.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = n
                            st.append((ny, nx))
                py = np.array([p[0] for p in pts])
                px = np.array([p[1] for p in pts])
                out.append({"id": n, "size": len(pts), "x0": int(px.min()), "x1": int(px.max()),
                            "y0": int(py.min()), "y1": int(py.max()),
                            "cx": float(px.mean()), "cy": float(py.mean())})
    out.sort(key=lambda c: -c["size"])
    return lab, out


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    im = Image.fromarray((mask * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MinFilter(2 * r + 1))
    return np.asarray(im) > 127


def main() -> None:
    sheet = Image.open(SHEET).convert("RGB")
    crop = sheet.crop(FRONT_BOX)
    big = crop.resize((crop.width * UPSCALE, crop.height * UPSCALE), Image.BICUBIC)
    a = np.asarray(big).astype(np.float32)
    lum = a.mean(axis=2)

    body = lum < BODY_LUM
    inner = erode(body, ERODE_PX)
    lines = (lum < LINE_LUM) & inner
    lab, comps = components(lines)
    # 口: 最も横に長い成分。目: 口より上にある左右それぞれ最大の成分。
    # 鼻孔: 目の間・目と口の間にある微小成分(線より少し明るいので別しきい値)
    h, w = lines.shape
    cand = [c for c in comps if c["size"] >= 12]
    mouth = max(cand, key=lambda c: c["x1"] - c["x0"])
    above = [c for c in cand if c["cy"] < mouth["cy"] - 5 * UPSCALE and c is not mouth]
    left = [c for c in above if c["cx"] < mouth["cx"]]
    right = [c for c in above if c["cx"] > mouth["cx"]]
    if not left or not right:
        sys.exit(f"目が見つからない: left={left[:2]} right={right[:2]}")
    eyes = [max(left, key=lambda c: c["size"]), max(right, key=lambda c: c["size"])]
    eye_y = (eyes[0]["cy"] + eyes[1]["cy"]) / 2
    cx_face = (eyes[0]["cx"] + eyes[1]["cx"]) / 2
    nlab, ncomps = components((lum < NOSTRIL_LUM) & inner)
    nostrils = [c for c in ncomps
                if eyes[0]["x1"] < c["cx"] < eyes[1]["x0"]
                and eye_y - 3 * UPSCALE < c["cy"] < mouth["cy"] - 4 * UPSCALE
                and 6 * UPSCALE <= c["size"] <= 60 * UPSCALE]
    nostril_mask = np.isin(nlab, [c["id"] for c in nostrils]).astype(np.float32)
    def dilate_z(mask, r):
        out = mask.copy()
        for d in range(1, r + 1):
            out |= np.roll(mask, d, axis=0) | np.roll(mask, -d, axis=0)
        return out

    def dilate_box(mask, r):  # noqa: E306
        im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))
        return np.asarray(im) > 127

    mouth_mask = dilate_z(np.isin(lab, [mouth["id"]]), MOUTH_DILATE_Z)
    line_mask = np.maximum(mouth_mask.astype(np.float32),
                           dilate_box(nostril_mask > 0.5, NOSTRIL_DILATE).astype(np.float32))
    # 目: 外接箱(少し広げる)の中で、より明るい影まで含めて拾う → 重い半目
    # 目は**2層**にする。設定画の目は「黒い太線」ではなく、
    #   上側に体色より明るい紫の大きなまぶた面 → その下端にほぼ直線的な黒い眼裂
    # という構造(実測: 眼裂の上 9mm が lum 110〜160、体の中央値は 96)。
    # 黒帯だけを太らせると「しかめっ面・眉毛」に見える。
    # 設定画はわずかに斜めで左右非対称(幅 20.0px と 14.9px)なので、
    # **大きく写っている方だけ**を採り、顔の正中で鏡像にして反対側に置く
    def smooth(mask, r):
        im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
        return np.asarray(im) > 127

    def mirror(mask):
        out = np.zeros_like(mask)
        xs = np.arange(mask.shape[1])
        src = np.round(2 * cx_face - xs).astype(int)
        ok = (src >= 0) & (src < mask.shape[1])
        out[:, ok] = mask[:, src[ok]]
        return out

    eye_src = max(eyes, key=lambda c: (c["x1"] - c["x0"]) * (c["y1"] - c["y0"]))
    pad = EYE_PAD * UPSCALE
    box = np.zeros_like(inner)
    box[max(0, eye_src["y0"] - pad):eye_src["y1"] + pad + 1,
        max(0, eye_src["x0"] - pad):eye_src["x1"] + pad + 1] = True
    slit = smooth((lum < EYE_LUM) & inner & box, EYE_SMOOTH)
    slit = dilate_z(slit, EYE_DILATE_Z)
    # まぶた面: 設定画の明色領域は紙目で連結が切れるので、**眼裂の形から**
    # 半月形を作る(眼裂の各列の上端から、中央で LID_UP・端で 0 の高さだけ上へ)。
    # 形の出どころは設定画の眼裂そのものなので、想像で描くことにはならない
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
    slit = slit | mirror(slit)
    lid = lid | mirror(lid)
    line_mask = np.maximum(line_mask, slit.astype(np.float32))

    # 明色パッチ: 頭の内側(侵食後)にある小さめの明るい塊。目・口の上には置かない
    # 明色パッチは頭の縁にもあるので、侵食は輪郭線を除く最小限(1シートpx)にする
    light = (lum > LIGHT_LUM[0]) & (lum < LIGHT_LUM[1]) & erode(body, UPSCALE)
    llab, lcomps = components(light)
    # 小さく・詰まった塊だけ(頭頂のハイライト勾配のような大きく疎な領域は除く)
    keep_l = [c["id"] for c in lcomps
              if 6 * UPSCALE * UPSCALE <= c["size"] <= 250 * UPSCALE * UPSCALE
              and c["size"] / max(1, (c["x1"] - c["x0"] + 1) * (c["y1"] - c["y0"] + 1)) > 0.45]
    light_mask = np.isin(llab, keep_l).astype(np.float32)

    # ぼかして紙目のギザギザを消す
    def blur(m, r):
        im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
        return np.asarray(im).astype(np.float32) / 255.0
    line_soft = blur(line_mask, 1.2)
    light_soft = blur(light_mask, 2.5)
    lid_soft = blur(lid.astype(np.float32), 1.8)

    # 設定画px → モデル(x,z) のアフィン: 目の中心・口の中心で合わせる
    eye_dx = (eyes[1]["cx"] - eyes[0]["cx"]) / 2
    sx = MODEL_EYE[0] / eye_dx
    sz = (MODEL_EYE[1] - MODEL_MOUTH_Z) / (mouth["cy"] - eye_y)

    W = int(round((DECAL_X1 - DECAL_X0) * PPU))
    H = int(round((DECAL_Z1 - DECAL_Z0) * PPU))
    xs = DECAL_X0 + (np.arange(W) + 0.5) / PPU
    zs = DECAL_Z1 - (np.arange(H) + 0.5) / PPU
    px = cx_face + xs[None, :] / sx            # (1, W)
    py = eye_y + (MODEL_EYE[1] - zs[:, None]) / sz  # (H, 1)
    px = np.broadcast_to(px, (H, W)); py = np.broadcast_to(py, (H, W))

    def sample(m):
        x0 = np.floor(px).astype(int); y0 = np.floor(py).astype(int)
        tx = px - x0; ty = py - y0
        ok = (x0 >= 0) & (y0 >= 0) & (x0 + 1 < w) & (y0 + 1 < h)
        x0c = np.clip(x0, 0, w - 2); y0c = np.clip(y0, 0, h - 2)
        v = (m[y0c, x0c] * (1 - tx) + m[y0c, x0c + 1] * tx) * (1 - ty) \
            + (m[y0c + 1, x0c] * (1 - tx) + m[y0c + 1, x0c + 1] * tx) * ty
        return np.where(ok, v, 0.0)

    la = sample(line_soft)
    lia = sample(light_soft) * 0.75
    lda = sample(lid_soft)
    rgba = np.zeros((H, W, 4), np.float32)
    # 明色パッチ → 上まぶた面 → 線画(眼裂・口・鼻孔)の順に重ねる
    for c in range(3):
        rgba[..., c] = LIGHT_RGB[c]
    rgba[..., 3] = lia
    for c in range(3):
        rgba[..., c] = rgba[..., c] * (1 - lda) + LID_RGB[c] * lda
    rgba[..., 3] = np.maximum(rgba[..., 3], lda)
    a_line = la
    for c in range(3):
        rgba[..., c] = rgba[..., c] * (1 - a_line) + LINE_RGB[c] * a_line
    rgba[..., 3] = np.maximum(rgba[..., 3], a_line)
    # 色は straight alpha で保存
    out = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")
    os.makedirs(OUT_DIR, exist_ok=True)
    out.save(OUT_PNG)
    json.dump({"x0": DECAL_X0, "x1": DECAL_X1, "z0": DECAL_Z0, "z1": DECAL_Z1, "ppu": PPU,
               "sheet_box": FRONT_BOX, "upscale": UPSCALE,
               "sheet_eyes": [[e["cx"] / UPSCALE + FRONT_BOX[0], e["cy"] / UPSCALE + FRONT_BOX[1]] for e in eyes],
               "sheet_mouth": [mouth["cx"] / UPSCALE + FRONT_BOX[0], mouth["cy"] / UPSCALE + FRONT_BOX[1]],
               "scale_x_m_per_sheet_px": sx * UPSCALE, "scale_z_m_per_sheet_px": sz * UPSCALE,
               "model_eye": MODEL_EYE, "model_mouth_z": MODEL_MOUTH_Z},
              open(OUT_JSON, "w"), indent=1, ensure_ascii=False)

    # デバッグ: 抽出した成分を色付けした拡大クロップ
    dbg = big.convert("RGBA")
    d = ImageDraw.Draw(dbg)
    for c, col in ((eyes[0], "red"), (eyes[1], "red"), (mouth, "blue")):
        d.rectangle([c["x0"], c["y0"], c["x1"], c["y1"]], outline=col, width=2)
    for c in nostrils:
        d.rectangle([c["x0"], c["y0"], c["x1"], c["y1"]], outline="green", width=2)
    for cid in keep_l:
        c = next(k for k in lcomps if k["id"] == cid)
        d.rectangle([c["x0"], c["y0"], c["x1"], c["y1"]], outline="orange", width=1)
    # 右側に生成したデカールを並べる
    dec_prev = out.resize((W // 2, H // 2), Image.LANCZOS)
    canvas = Image.new("RGBA", (dbg.width + dec_prev.width + 10, max(dbg.height, dec_prev.height)), (120, 120, 128, 255))
    canvas.paste(dbg, (0, 0)); canvas.paste(dec_prev, (dbg.width + 10, 0), dec_prev)
    canvas.save(OUT_DEBUG)
    print(f"eyes: {[(round(e['cx']/UPSCALE,1), round(e['cy']/UPSCALE,1), e['size']) for e in eyes]}")
    print(f"mouth: ({mouth['cx']/UPSCALE:.1f},{mouth['cy']/UPSCALE:.1f}) w={(mouth['x1']-mouth['x0'])/UPSCALE:.1f}px  nostrils: {len(nostrils)}  light patches: {len(keep_l)}")
    print(f"scale x {sx*UPSCALE*1000:.3f} mm/px, z {sz*UPSCALE*1000:.3f} mm/px  -> {OUT_PNG} {out.size}")


if __name__ == "__main__":
    main()
