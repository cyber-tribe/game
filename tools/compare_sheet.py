"""
ユーザー提供のPNG設定画(三面図シート)とモデルの3面コンタクトシートを
上下に並べた比較画像を作る(plan/models/archive/garudo-quality-uplift.md
実装項目7)。SVG三面図の重畳照合(compare_turnaround.mjs)と違い、
画像生成ツール由来のシートにそのまま使える。

    tools/venv/bin/python tools/build_models.py <名前>   (シート生成込み)
    tools/venv/bin/python tools/compare_sheet.py <名前> [シートのパス]

シートのパスを省略すると design/characters/<名前>/generated/
<名前>-sheet.png を使う。出力は tools/preview/turnaround/
<名前>-vs-sheet.png。
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import common as C  # noqa: E402  (bpyを先に読み込む)
import bpy  # noqa: E402
import numpy as np  # noqa: E402


def load_pixels(path: str) -> "np.ndarray":
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def scale_to_width(px: "np.ndarray", width: int) -> "np.ndarray":
    """最近傍で幅を合わせる(照合目的なので画質より寸法合わせを優先)"""
    h, w, _ = px.shape
    height = max(1, round(h * width / w))
    ys = (np.arange(height) * (h / height)).astype(int).clip(0, h - 1)
    xs = (np.arange(width) * (w / width)).astype(int).clip(0, w - 1)
    return px[np.ix_(ys, xs)]


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    name = sys.argv[1]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sheet_path = (sys.argv[2] if len(sys.argv) > 2 else
                  os.path.join(root, "design", "characters", name,
                               "generated", f"{name}-sheet.png"))
    turnaround_path = os.path.join(C.PREVIEW_DIR, "turnaround", f"{name}.png")
    for p in (sheet_path, turnaround_path):
        if not os.path.exists(p):
            print(f"見つからない: {p}", file=sys.stderr)
            if p is turnaround_path:
                print("先に tools/build_models.py で3面シートを出しておくこと",
                      file=sys.stderr)
            return 1

    sheet = load_pixels(sheet_path)
    model = load_pixels(turnaround_path)
    width = max(sheet.shape[1], model.shape[1])
    sheet = scale_to_width(sheet, width)
    model = scale_to_width(model, width)
    gap = np.full((8, width, 4), (1.0, 1.0, 1.0, 1.0), dtype=np.float32)
    # Blenderのピクセルは下起点なので、上=設定画・下=モデルにするには
    # モデルを先に積む
    combined = np.concatenate([model, gap, sheet], axis=0)

    out_path = os.path.join(C.PREVIEW_DIR, "turnaround", f"{name}-vs-sheet.png")
    out = bpy.data.images.new("compare", width=width, height=combined.shape[0])
    out.pixels.foreach_set(combined.ravel())
    out.filepath_raw = out_path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
