"""
設定画の三面図とモデルのシルエットを、同じ高さへ正規化して重ねる
(plan/models/archive/garudo-quality-uplift.md 実装項目7の精密版)。

`tools/compare_sheet.py`が「並べて見る」道具なのに対し、こちらは
**輪郭のずれを一目で測る**道具。設定画側を赤、モデル側を青で描き、
重なった部分は紫になる。赤だけ・青だけの領域がそのままずれの量。

    tools/venv/bin/python tools/build_models.py <名前> --silhouette
    tools/venv/bin/python tools/overlay_sheet.py <名前> [front|side|back|self]
    tools/venv/bin/python tools/overlay_sheet.py <名前> <左> <上> <右> <下> [view]

view=self は**設定画の正面図と背面図どうし**を比べる。基準側が
どれだけばらついているかが分かり、それより小さい残差を追っても
意味が無いことが数字で言える(ガルドの実測: 平均20.6mm・最大74.4mm)。

切り出し範囲は既定で design/characters/<名前>/face-reference.json の
`front_crop` を使う(顔一致QAと**同じ矩形**にして、二重管理を避ける)。
狭い矩形を渡すと外接箱がAポーズの手で切れ、「設定画の腕が途中で
消える」という測定事故になる(実測: 手首の高さで設定画側の幅が
切り出し幅そのものになっていた)。出力は
tools/preview/silhouettes/<名前>-sheet-overlay.png。
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import common as C  # noqa: E402  (bpyを先に読み込む)
import bpy  # noqa: E402
import numpy as np  # noqa: E402


def load(path: str) -> "np.ndarray":
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]  # 上起点へ


def figure_mask(rgb: "np.ndarray", threshold: float = 0.55) -> "np.ndarray":
    """
    図の画素を拾う。明るさだけで切ると設定画の**ガイド点線**(薄い灰色)
    まで拾ってしまい、点線が図と繋がって幅の計測が壊れる(実測: 全行が
    切り出し幅いっぱいになった)。暗いか彩度が高いかで判定し、最後に
    最大連結成分だけを残す。
    """
    c = rgb[:, :, :3]
    mx = c.max(axis=2)
    mn = c.min(axis=2)
    sat = np.where(mx > 1e-5, (mx - mn) / np.maximum(mx, 1e-5), 0.0)
    return largest_component((mx < threshold) | (sat > 0.22))


def largest_component(mask: "np.ndarray") -> "np.ndarray":
    """最大の連結成分だけを残す(浮いたラベル・枠線を落とす)"""
    from collections import deque
    seen = np.zeros_like(mask, dtype=bool)
    height, width = mask.shape
    best: list = []
    for sy in range(height):
        for sx in range(width):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            queue = deque([(sy, sx)])
            seen[sy, sx] = True
            comp = []
            while queue:
                y, x = queue.popleft()
                comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] \
                            and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            if len(comp) > len(best):
                best = comp
    out = np.zeros_like(mask)
    for y, x in best:
        out[y, x] = True
    return out


def bbox(mask: "np.ndarray"):
    ys, xs = np.where(mask)
    return xs.min(), ys.min(), xs.max(), ys.max()


def fit(mask: "np.ndarray", size: int) -> "np.ndarray":
    """マスクを外接箱で切り出し、高さsizeへ最近傍で正規化する"""
    x0, y0, x1, y1 = bbox(mask)
    crop = mask[y0:y1 + 1, x0:x1 + 1]
    h, w = crop.shape
    scale = size / h
    out_w = max(1, int(round(w * scale)))
    ys = (np.arange(size) / scale).astype(int).clip(0, h - 1)
    xs = (np.arange(out_w) / scale).astype(int).clip(0, w - 1)
    return crop[np.ix_(ys, xs)]


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    name = sys.argv[1]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rest = sys.argv[2:]
    if len(rest) >= 4:
        left, top, right, bottom = (int(v) for v in rest[:4])
        rest = rest[4:]
        view = rest[0] if rest else "front"
    else:
        import json
        with open(os.path.join(root, "design", "characters", name,
                               "face-reference.json"), encoding="utf-8") as fh:
            ref = json.load(fh)
        view = rest[0] if rest else "front"
        key = {"side": "side_crop", "back": "back_crop"}.get(view, "front_crop")
        left, top, right, bottom = ref.get(key, ref["front_crop"])

    sheet = load(os.path.join(root, "design", "characters", name,
                              "generated", f"{name}-sheet.png"))
    sheet_mask = fit(figure_mask(sheet[top:bottom, left:right]), 700)

    if view == "self":
        # **設定画どうし**を比べる(基準側のばらつきを測る)
        import json
        with open(os.path.join(root, "design", "characters", name,
                               "face-reference.json"), encoding="utf-8") as fh:
            back = json.load(fh)["back_crop"]
        model_mask = fit(figure_mask(sheet[back[1]:back[3], back[0]:back[2]]), 700)
    else:
        sil_path = os.path.join(C.PREVIEW_DIR, "silhouettes", f"{name}-{view}.png")
        model_mask = fit(figure_mask(load(sil_path), threshold=0.5), 700)
    if view in ("side", "self"):
        # **側面は左右を反転する。** モデルのシルエットは-X側にカメラを
        # 置くので画面の右が顔側、設定画の側面図は左が顔側。反転せずに
        # 「左(設)/左(モ)」を並べると、前後が入れ替わったまま比べることに
        # なる(実測: 靴の前後で差が+74/+83mmと出ていた)。
        # `self` は設定画の正面図と背面図を比べるので、やはり反転が要る。
        #
        # **背面は反転しない。** モデルの背面レンダーは+Y側にカメラを置く
        # のでモデルの+xが画面の左に出る。設定画の背面図も後ろから見た絵
        # なのでモデルの+xが画面の左。どちらも同じ向きで、反転すると
        # 逆にずれる(設定画の正面図と背面図を突き合わせて確認: 反転あり
        # 平均8.0mm・反転なし10.3mm ―― 背面図は正面図の鏡像側)
        model_mask = model_mask[:, ::-1]


    width = max(sheet_mask.shape[1], model_mask.shape[1]) + 40
    canvas = np.ones((700, width, 4), dtype=np.float32)

    def place(mask, color):
        offset = (width - mask.shape[1]) // 2
        region = canvas[:, offset:offset + mask.shape[1], :3]
        region[mask] = np.minimum(region[mask], np.array(color, dtype=np.float32))

    place(sheet_mask, (1.0, 0.25, 0.25))   # 設定画=赤
    place(model_mask, (0.25, 0.25, 1.0))   # モデル=青(重なりは紫)

    out_path = os.path.join(C.PREVIEW_DIR, "silhouettes",
                            f"{name}-sheet-overlay-{view}.png")
    out = bpy.data.images.new("overlay", width=width, height=700)
    out.pixels.foreach_set(canvas[::-1].ravel())
    out.filepath_raw = out_path
    out.file_format = "PNG"
    out.save()

    # 高さごとの幅を数値で突き合わせる(どこが細い/太いかを測る)。
    # **左右別も出す**。幅(span)だけだと、片側が出て片側が引っ込んだ
    # 差し引きゼロを見逃す(実測: 腕が幅では合っているのに、重ねると
    # 上腕の外側が赤・手が青だった=腕の角度が違う)
    print(f"{'高さ%':>5} {'部位':<12} {'設定画':>7} {'モデル':>7} {'差':>6}"
          f" | {'左(設)':>7} {'左(モ)':>7} {'差':>6} | {'右(設)':>7} {'右(モ)':>7} {'差':>6}")
    labels = ({2: "頭頂", 6: "髪", 12: "目", 18: "あご", 24: "肩", 32: "胸",
               40: "へそ", 48: "手首/腰", 56: "エプロン上", 64: "エプロン",
               72: "エプロン裾", 80: "ひざ下", 88: "すね", 95: "ブーツ"}
              if view in ("front", "back", "self") else
              {2: "頭頂", 8: "髪", 14: "顔の奥行", 20: "あご", 26: "肩/樽上端",
               34: "胸+樽", 42: "背中+樽", 50: "腰", 58: "エプロン上",
               66: "エプロン", 74: "エプロン裾", 82: "ひざ", 90: "すね",
               96: "靴の前後"})
    for pct in sorted(labels):
        row = int((700 - 1) * pct / 100)

        def edges(mask):
            """中心を揃えた座標での左端・右端(canvasと同じ中央合わせ)"""
            xs = np.where(mask[row])[0]
            if not len(xs):
                return None
            off = (width - mask.shape[1]) // 2 - width // 2
            return int(xs.min()) + off, int(xs.max()) + off

        ea, eb = edges(sheet_mask), edges(model_mask)
        if ea is None or eb is None:
            print(f"{pct:>5} {labels[pct]:<12} {'--':>7}")
            continue
        a, b = ea[1] - ea[0] + 1, eb[1] - eb[0] + 1
        print(f"{pct:>5} {labels[pct]:<12} {a:>7} {b:>7} {b - a:>+6}"
              f" | {ea[0]:>7} {eb[0]:>7} {eb[0] - ea[0]:>+6}"
              f" | {ea[1]:>7} {eb[1]:>7} {eb[1] - ea[1]:>+6}")
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
