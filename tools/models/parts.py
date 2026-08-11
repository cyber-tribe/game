"""
複数のモデルで使い回す部品。

主人公が手に持つ「なた」と、床に落ちているアイテムとしての「なた」は同じ形なので、
ここで一度だけ作って両方から呼ぶ。
"""

from __future__ import annotations

import math

import common as C
from mathutils import Euler, Vector

WOOD = (0.34, 0.22, 0.13)
STEEL = (0.62, 0.65, 0.70)
LEATHER = (0.30, 0.20, 0.13)


def build_hatchet(origin=(0.0, 0.0, 0.0), scale: float = 1.0, rotation=(0.0, 0.0, 0.0)) -> list:
    """
    なた。柄・鍔・刃・峰の4部品からなる。
    origin は柄の握り位置、rotation は度数指定のオイラー角。
    オブジェクトの変換として持たせておけば、join() のときに焼き込まれる。
    """
    o = Vector(origin)
    s = scale
    rot = Euler([math.radians(a) for a in rotation])

    wood = C.make_material("hatchet_wood", WOOD, roughness=0.75)
    steel = C.make_material("hatchet_steel", STEEL, roughness=0.32, metallic=0.85)

    handle = C.cylinder("hatchet_handle", (0, 0, 0.02 * s), 0.017 * s, 0.30 * s, segments=14)
    C.assign_material(handle, wood)

    collar = C.cylinder("hatchet_collar", (0, 0, 0.145 * s), 0.028 * s, 0.028 * s, segments=14)
    C.assign_material(collar, steel)

    # 刃。前に張り出した肉厚のくさび形
    blade = C.box("hatchet_blade", (0, -0.062 * s, 0.155 * s),
                  (0.026 * s, 0.115 * s, 0.105 * s), bevel=0.016 * s, bevel_segments=2)
    C.assign_material(blade, steel)

    # 刃先を薄くして刃らしくする
    for vert in blade.data.vertices:
        if vert.co.y < -0.062 * s:
            vert.co.x *= 0.30

    heel = C.box("hatchet_heel", (0, 0.028 * s, 0.150 * s),
                 (0.022 * s, 0.05 * s, 0.06 * s), bevel=0.012 * s)
    C.assign_material(heel, steel)

    parts = [handle, collar, blade, heel]
    for part in parts:
        part.rotation_euler = rot
        part.location = o
    return parts


def build_shield(origin=(0.0, 0.0, 0.0), scale: float = 1.0) -> list:
    """丸みのある木の盾。縁と中央の鋲を金属にする。"""
    o = Vector(origin)
    s = scale
    wood = C.make_material("shield_wood", (0.42, 0.28, 0.17), roughness=0.8)
    steel = C.make_material("shield_steel", STEEL, roughness=0.35, metallic=0.8)

    face = C.cylinder("shield_face", (0, 0, 0), 0.15 * s, 0.035 * s, segments=26, axis="Y")
    C.assign_material(face, wood)
    # 少し丸みをつける
    for vert in face.data.vertices:
        d = (vert.co.x ** 2 + vert.co.z ** 2) ** 0.5 / (0.15 * s)
        vert.co.y -= (1.0 - d * d) * 0.045 * s

    rim = C.cylinder("shield_rim", (0, 0, 0), 0.158 * s, 0.022 * s, segments=26, axis="Y")
    C.assign_material(rim, steel)

    boss = C.uv_sphere("shield_boss", (0, -0.045 * s, 0), 0.036 * s,
                       segments=16, rings=10, scale=(1.0, 0.8, 1.0))
    C.assign_material(boss, steel)

    parts = [face, rim, boss]
    for part in parts:
        part.location = o
    return parts
