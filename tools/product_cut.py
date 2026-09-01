"""
5体再設計ゲート(plan/models/archive/five-character-redesign-gate.md)の合格判定用
商品カット。再設計した5体(ガルド・ぷるん・ガジリねずみ・ツブテガエル・
おおねぼすけ)だけを大きくパッケージ風の構図で1枚に写す。

    tools/venv/bin/python tools/product_cut.py

出力: tools/preview/product_cut.png
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "models"))

import common as C  # noqa: E402  (bpyを先に読み込み、mathutilsを使えるようにする)
import garudo  # noqa: E402
import monsters  # noqa: E402
from mathutils import Vector  # noqa: E402

# 名前 → (ビルド, 配置オフセット)。主人公を前列中央、ボスを後列に
# 大きく、マスコットと通常敵2体を左右に寄せるパッケージの定石
LAYOUT = [
    # ボスの顔(中央やや左)が主人公に隠れないよう左へ逃がす
    ("oonebosuke", lambda: monsters.make("oonebosuke"), Vector((-0.34, 0.55, 0.0))),
    ("gajiri", lambda: monsters.make("gajiri"), Vector((-0.90, 0.06, 0.0))),
    ("tsubute", lambda: monsters.make("tsubute"), Vector((0.70, -0.04, 0.0))),
    ("purun", lambda: monsters.make("purun"), Vector((-0.52, -0.24, 0.0))),
    ("garudo", garudo.make, Vector((0.22, -0.42, 0.0))),
]


def main() -> None:
    C.reset_scene()
    all_objs = []
    for name, build, offset in LAYOUT:
        objs = build()
        for obj in objs:
            if obj.parent is None:
                obj.location = obj.location + offset
        all_objs += objs
    C.render_preview("product_cut", all_objs, samples=64, size=(960, 720),
                     yaw=6.0, pitch=7.0, zoom=0.88)
    print("→ tools/preview/product_cut.png")


if __name__ == "__main__":
    main()
