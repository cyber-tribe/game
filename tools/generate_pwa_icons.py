"""
PWA用アイコン生成(plan/game/archive/pwa-support.md)。

既存の3Dモデルパイプライン(tools/models/common.py)の樽(barrel)モデルを
背景透過でレンダリングし、public/icons/ に書き出す。樽はこのゲームの
象徴的ギミックであり、丸いシルエットで小さいサイズでも視認しやすいため、
主人公ガルド(手足があり縮小すると潰れやすい)より読み取りやすいと判断した。

    tools/venv/bin/python tools/generate_pwa_icons.py

書き出すファイル:
    public/icons/icon-192.png            通常アイコン(192x192)
    public/icons/icon-512.png            通常アイコン(512x512)
    public/icons/icon-512-maskable.png   Android maskable用。安全領域
                                          (中心80%の円)に収まるよう
                                          カメラを引いて余白を持たせてある
    public/icons/apple-touch-icon.png    iOS用(180x180)。iOSはmanifestの
                                          iconsを見ないため個別に用意する
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

import common as C  # noqa: E402
import props  # noqa: E402
import bpy  # noqa: E402  (common が読み込み済みなので安全に import できる)
from mathutils import Vector  # noqa: E402

ICON_DIR = os.path.join(C.REPO_ROOT, "public", "icons")


def render_icon(
    name: str, size: int, path: str, *, zoom: float, samples: int = 64, transparent: bool = True
) -> None:
    C.reset_scene()
    objs = props.build_barrel()

    lo, hi = C.bounds(objs)
    center = (lo + hi) * 0.5
    extent = max((hi - lo).length, 0.5)
    distance = extent * zoom + 1.0

    # 見下ろしすぎず、正面性が伝わる程度の角度(モデルのプレビューと近い画角)
    yaw = 28.0
    pitch = 14.0
    import math

    yaw_r = math.radians(yaw)
    pitch_r = math.radians(pitch)
    offset = Vector((
        math.sin(yaw_r) * math.cos(pitch_r),
        -math.cos(yaw_r) * math.cos(pitch_r),
        math.sin(pitch_r) + 0.15,
    )) * distance

    bpy.ops.object.camera_add(location=center + offset)
    cam = bpy.context.object
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 60

    C.add_sun(center + Vector((3, -4, 6)), center, 2.6)
    C.add_area(center + Vector((-3.5, -2.5, 1.5)), center, 42.0, size=4.0)
    C.add_area(center + Vector((0.5, 4.0, 2.5)), center, 28.0, size=3.0)

    scene = bpy.context.scene
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.resolution_x, scene.render.resolution_y = size, size
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main() -> int:
    os.makedirs(ICON_DIR, exist_ok=True)
    # 通常アイコン: 余白は控えめにモデルを大きく見せる
    render_icon("barrel", 192, os.path.join(ICON_DIR, "icon-192.png"), zoom=1.05)
    render_icon("barrel", 512, os.path.join(ICON_DIR, "icon-512.png"), zoom=1.05)
    # maskable: Android の円形マスクに削られても収まるよう、中心80%の
    # 安全領域に収まる分だけカメラを大きく引く
    render_icon("barrel", 512, os.path.join(ICON_DIR, "icon-512-maskable.png"), zoom=1.75)
    # iOS の apple-touch-icon。iOSは透過PNGの扱いが不安定(環境によって透過部分が
    # 黒く塗られる)なため、ゲームの基調色(index.htmlの背景 #05060c相当)で
    # 不透明に塗って書き出す
    render_icon(
        "barrel", 180, os.path.join(ICON_DIR, "apple-touch-icon.png"), zoom=1.05, transparent=False
    )
    print(f"アイコンを書き出しました → {ICON_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
