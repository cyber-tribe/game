"""
マドロミダケの顔を設定画からなぞって RGBA デカールにする。

このキャラの顔は**線が数本**しかない(閉じた目の弧2本、まゆ2本、
小さな開き口、頬の赤み)。造形で作ると設定画から離れるので
(handbook 1-33)、線はすべてここで抜いてテクスチャに載せる。

傘の花模様・体の斑点・傘の裏のヒダは**なぞらない**。花は
「5弁のロゼット」、斑点は「細かい点」、ヒダは「放射状の線」という
規則的な柄で、設定画が定義しているのは形と密度と色だけ。傘は
ドームなので正面図からなぞると投影で歪む。tools/models/madoromi.py
の色関数が (角度, 子午線位置) の上に直接描く。

    python3 tools/madoromi_decal.py

出力: design/characters/madoromi/generated/
    madoromi-decal-face.png   RGBA(顔の線+頬)
    madoromi-decal.json       モデル座標へ写すためのアンカー
    madoromi-decal-debug.png  抽出結果の確認用
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SHEET = "plan/models/reference-madoromidake-sheet.png"
OUT_DIR = "design/characters/madoromi/generated"

# 三面図パネルの正面図。tools/models/madoromi.py と同じ実測
FRONT_CX, FRONT_TOP, SHEET_H = 648.0, 117.0, 202.0
UPSCALE = 6

# 顔の帯(高さ%)。まゆの上から口の下まで。半幅は**胴の輪郭に掛からない**
# 40px にする(62px にしたら輪郭線が最大の連結成分になり、目・口が
# 「大きい順に6個」から漏れた)
FACE_TOP_PCT, FACE_BOT_PCT = 53.0, 84.0
FACE_HALF_W = 40.0

# 設定画で実測した顔のパーツ(連結成分の重心・大きさ)。
#   口   中心 x -4.4 / 高さ 74.7% / 17x6px
#   右目 中心 x+17.1 / 高さ 65.6% / 15x5px
#   左目 中心 x-22.9 / 高さ 65.5% / 14x3px  ← かすれているので右目を鏡像で使う
#   まゆ 高さ 56% 付近のごく淡い弧
EYE_PCT = (62.5, 69.0)      # 目を探す高さ帯
EYE_MIN_DX = 8.0            # 中心からこれ以上離れていること
MOUTH_PCT = (71.0, 79.0)
BROW_PCT = (53.5, 61.0)     # まゆの高さ(目の弧を縮めて置く)
EYE_X = 20.0                # 左右対称に置き直す目の中心(px)
LINE_DILATE = 5             # 線を太らせる。設定画の目の弧は高さ5pxしかなく、
                            # モデルへ焼くと縮小表示で消えた
EYE_SCALE = 1.55            # 目の弧を少し大きく(実機で小さく見えた)

LINE_LUM_P = 4.0            # 線と見なす輝度パーセンタイル(目・口の輪郭)
BROW_LUM_P = 14.0           # まゆはもっと淡い
BLUSH_X = 27.0              # 頬の中心(px、中心から)
BLUSH_PCT = 68.5            # 頬の高さ%
BLUSH_R = 13.0              # 頬の半径 px

LINE_RGB = (0.055, 0.043, 0.038)      # 目・まゆの線(設定画の実測 #2b2622)
BROW_RGB = (0.10, 0.082, 0.072)
MOUTH_IN_RGB = (0.223, 0.096, 0.096)  # 口の中(パレット #815858)
BLUSH_RGB = (0.62, 0.33, 0.24)
BLUSH_ALPHA = 0.34

# モデル座標のアンカー(m)。madoromi.py の BODY_LOOPS と同期させること
MODEL_H = 0.458
MODEL_FACE_Z = ((1 - FACE_BOT_PCT / 100) * MODEL_H, (1 - FACE_TOP_PCT / 100) * MODEL_H)
MODEL_FACE_HALF_X = FACE_HALF_W / SHEET_H * MODEL_H

def _load() -> tuple[np.ndarray, float, float]:
    a = np.asarray(Image.open(SHEET).convert("RGB")).astype(float)
    y0 = int(FRONT_TOP + SHEET_H * FACE_TOP_PCT / 100)
    y1 = int(FRONT_TOP + SHEET_H * FACE_BOT_PCT / 100)
    x0 = int(FRONT_CX - FACE_HALF_W)
    x1 = int(FRONT_CX + FACE_HALF_W)
    return a[y0:y1, x0:x1], float(y0), float(x0)


def _upscale(a: np.ndarray) -> np.ndarray:
    im = Image.fromarray(a.astype(np.uint8)).resize(
        (a.shape[1] * UPSCALE, a.shape[0] * UPSCALE), Image.LANCZOS)
    return np.asarray(im).astype(float)


def _pick(mask: np.ndarray, y0: float, x0: float, pct: tuple[float, float],
          min_dx: float = 0.0, max_dx: float = 1e9) -> list[np.ndarray]:
    """連結成分のうち、指定の高さ帯・中心からの距離に入るものを大きい順に返す。"""
    lab, n = ndimage.label(mask)
    out = []
    for i in range(1, n + 1):
        m = lab == i
        ys, xs = np.nonzero(m)
        p = (y0 + ys.mean() / UPSCALE - FRONT_TOP) / SHEET_H * 100
        dx = abs(x0 + xs.mean() / UPSCALE - FRONT_CX) * UPSCALE
        if pct[0] <= p <= pct[1] and min_dx <= dx <= max_dx:
            out.append((m.sum(), m))
    out.sort(key=lambda t: -t[0])
    return [m for _, m in out]


def _stamp(dst: np.ndarray, src: np.ndarray, cx: int, cy: int, flip: bool) -> None:
    """src(bool)の重心を dst の (cx, cy) に合わせて焼く。flip で左右反転。"""
    ys, xs = np.nonzero(src)
    if ys.size == 0:
        return
    patch = src[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    if flip:
        patch = patch[:, ::-1]
    h, w = patch.shape
    y = cy - h // 2
    x = cx - w // 2
    ys2, xs2 = np.nonzero(patch)
    yy, xx = ys2 + y, xs2 + x
    ok = (yy >= 0) & (yy < dst.shape[0]) & (xx >= 0) & (xx < dst.shape[1])
    dst[yy[ok], xx[ok]] = True


def build() -> None:
    raw, y0, x0 = _load()
    big = _upscale(raw)
    lum = big.mean(2)
    h, w = lum.shape
    U = UPSCALE

    def to_px(pct: float) -> int:
        return int((FRONT_TOP + SHEET_H * pct / 100 - y0) * U)

    def to_x(dx: float) -> int:
        return int((FRONT_CX + dx - x0) * U)

    dark = ndimage.binary_closing(lum < np.percentile(lum, LINE_LUM_P), np.ones((3, 3)))
    faint = ndimage.binary_closing(lum < np.percentile(lum, BROW_LUM_P), np.ones((3, 3)))

    eyes = _pick(dark, y0, x0, EYE_PCT, EYE_MIN_DX * U)
    mouths = _pick(dark, y0, x0, MOUTH_PCT, 0.0, 14.0 * U)

    line = np.zeros((h, w), bool)
    if eyes:
        # かすれている左目は使わず、**はっきり出ている方を鏡像で両目にする**
        ys, xs = np.nonzero(eyes[0])
        ep = eyes[0][ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        eye = np.asarray(Image.fromarray((ep * 255).astype(np.uint8)).resize(
            (max(1, int(ep.shape[1] * EYE_SCALE)), max(1, int(ep.shape[0] * EYE_SCALE))),
            Image.LANCZOS)) > 110
        for side, flip in ((-1, True), (+1, False)):
            _stamp(line, eye, to_x(side * EYE_X), to_px(65.6), flip)
    # まゆは設定画では**目の弧をひと回り小さく淡くした線**でしかない。
    # 淡すぎて連結成分では安定して拾えなかった(胴の輪郭を掴む)ので、
    # 拾った目の形をそのまま縮めて置く
    brow_mask = np.zeros((h, w), bool)
    if eyes:
        patch = eye
        small = np.asarray(Image.fromarray((patch * 255).astype(np.uint8)).resize(
            (max(1, int(patch.shape[1] * 0.62)), max(1, int(patch.shape[0] * 0.62))),
            Image.LANCZOS)) > 110
        for side, flip in ((-1, True), (+1, False)):
            _stamp(brow_mask, small, to_x(side * (EYE_X + 1.0)), to_px(57.0), flip)

    mouth = mouths[0] if mouths else np.zeros((h, w), bool)
    # 口は輪郭と口の中が**どちらも暗い**ので、穴埋めでは中が取れない
    # (実測: 塊 2,077px に対し穴は 571px しかなかった)。塊の中で
    # 明るい側を口の中、暗い側を輪郭として分ける
    mouth_fill = np.zeros((h, w), bool)
    if mouth.any():
        vals = lum[mouth]
        cut = vals.min() + (vals.max() - vals.min()) * 0.42
        mouth_fill = mouth & (lum > cut)
        mouth_fill = ndimage.binary_opening(mouth_fill, np.ones((5, 5)))
        mouth_fill = ndimage.binary_closing(mouth_fill, np.ones((9, 9)))
    line |= mouth

    if LINE_DILATE:
        k = np.ones((LINE_DILATE * 2 + 1,) * 2)
        line = ndimage.binary_dilation(line, k)
        brow_mask = ndimage.binary_dilation(brow_mask, np.ones((3, 3)))

    # 頬。**抽出ではなく描く。** 顔全体が暖色なので「赤い画素」では
    # 取れず、しきい値を上げ下げしても顔の半分が頬になった(実測:
    # 13,838px = 顔の帯のほぼ全域)。設定画が決めているのは
    # 「位置・大きさ・色・ぼかしの強さ」だけなので、そこだけ写す
    yy, xx = np.mgrid[0:h, 0:w]
    blush = np.zeros((h, w), float)
    for side in (-1, 1):
        cx0, cy0 = to_x(side * BLUSH_X), to_px(BLUSH_PCT)
        d = np.hypot((xx - cx0) / (BLUSH_R * U), (yy - cy0) / (BLUSH_R * U * 0.72))
        blush = np.maximum(blush, np.clip(1.0 - d, 0, 1) ** 1.5)

    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., :3] = BLUSH_RGB
    rgba[..., 3] = np.clip(blush * BLUSH_ALPHA, 0, 1)
    rgba[brow_mask] = (*BROW_RGB, 0.85)
    rgba[mouth_fill] = (*MOUTH_IN_RGB, 1.0)
    rgba[line] = (*LINE_RGB, 1.0)

    os.makedirs(OUT_DIR, exist_ok=True)
    srgb = np.clip(rgba[..., :3], 0, 1) ** (1 / 2.2)
    out = np.concatenate([srgb, rgba[..., 3:]], 2)
    Image.fromarray((out * 255).astype(np.uint8)).save(f"{OUT_DIR}/madoromi-decal-face.png")

    meta = {"face": {"z": MODEL_FACE_Z, "half_x": MODEL_FACE_HALF_X, "size": [w, h]},
            "sheet": {"cx": FRONT_CX, "top": FRONT_TOP, "height": SHEET_H,
                      "face_pct": [FACE_TOP_PCT, FACE_BOT_PCT], "half_w": FACE_HALF_W}}
    with open(f"{OUT_DIR}/madoromi-decal.json", "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    dbg = big.copy()
    dbg[blush > 0.25] = dbg[blush > 0.25] * 0.55 + np.array([40, 220, 90]) * 0.45
    dbg[brow_mask] = (255, 170, 40)
    dbg[mouth_fill] = (40, 120, 255)
    dbg[line] = (255, 40, 40)
    Image.fromarray(dbg.astype(np.uint8)).save(f"{OUT_DIR}/madoromi-decal-debug.png")
    print(f"顔デカール {w}x{h}px  目 {len(eyes)}個検出  "
          f"口 {mouth.sum()}px / 中 {mouth_fill.sum()}px  頬 {(blush > 0.25).sum()}px")


if __name__ == "__main__":
    build()
