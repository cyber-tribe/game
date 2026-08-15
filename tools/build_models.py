"""
すべての3Dモデルをビルドして public/models/*.glb に書き出す。

    bash tools/setup_blender.sh   (最初の一度だけ)
    npm run models

引数で名前を指定すると、そのモデルだけを作り直せる。

    tools/venv/bin/python tools/build_models.py garudo purun

--no-preview を付けるとレンダリングを飛ばす(その方が速い)。
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import common as C  # noqa: E402
import garudo  # noqa: E402
import monsters  # noqa: E402
import props  # noqa: E402
import villagers  # noqa: E402


def targets() -> dict:
    """名前 → (ビルド関数, アニメーション付きか)"""
    out: dict = {"garudo": (garudo.make, True)}
    for name in monsters.MONSTERS:
        out[name] = ((lambda n: lambda: monsters.make(n))(name), True)
    for name in villagers.VILLAGERS:
        out[name] = ((lambda n: lambda: villagers.make(n))(name), True)
    for name, fn in props.PROPS.items():
        out[name] = (fn, False)
    return out


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preview = "--no-preview" not in sys.argv

    table = targets()
    names = args or list(table)
    unknown = [n for n in names if n not in table]
    if unknown:
        print(f"不明なモデル: {', '.join(unknown)}", file=sys.stderr)
        print(f"指定できるのは: {', '.join(table)}", file=sys.stderr)
        return 1

    os.makedirs(C.MODEL_DIR, exist_ok=True)
    total_start = time.time()
    for name in names:
        build, animated = table[name]
        start = time.time()
        C.reset_scene()
        objs = build()
        tris = C.tri_count(objs)
        if preview:
            size = (420, 520) if animated else (320, 320)
            C.render_preview(name, objs, size=size, samples=40 if animated else 32)
        path = C.export_glb(name, objs)
        kb = os.path.getsize(path) / 1024
        print(f"  {name:<14} 三角形 {tris:>6}   {kb:>7.1f} KB   {time.time() - start:.1f}s")

    print(f"{len(names)} 件を {time.time() - total_start:.1f}s で書き出しました → {C.MODEL_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
