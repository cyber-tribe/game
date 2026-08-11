"""
ダンジョンの背景と小物。

壁と床は1マスぶんのメッシュを大量に並べるので、Three.js 側で InstancedMesh に
まとめられるよう、1つのマテリアル・低ポリゴンで作る。
アイテムは床に落ちている状態で見えればよいので、高さ 0.3 前後に収める。

1マス = 1.0 単位。
"""

from __future__ import annotations

import math

import common as C
import parts
from mathutils import Vector

STONE_DARK = (0.30, 0.31, 0.36)
STONE_LIGHT = (0.46, 0.46, 0.50)
FLOOR_COLOR = (0.35, 0.33, 0.38)


# --------------------------------------------------------------------------- 地形

def build_wall():
    """
    1マスぶんの壁。切り出した石を積んだような見た目にするため、
    上下2段に分けて目地を入れ、頂点を少し揺らして手彫りの粗さを出す。
    """
    stone = C.make_material("wall_stone", STONE_DARK, roughness=0.92)
    blocks = []
    # 段ごとに横方向のずれを変えて、レンガの互い違いを作る
    for i, (z, h, offset) in enumerate([(0.28, 0.52, 0.0), (0.80, 0.48, 0.22)]):
        block = C.box(f"wall_block{i}", (offset * 0.0, 0.0, z), (0.98, 0.98, h - 0.04),
                      bevel=0.035, bevel_segments=1)
        C.assign_material(block, stone)
        blocks.append(block)

    wall = C.join(blocks, "wall")
    # 手彫りらしい粗さ。決め打ちの擬似乱数で、実行のたびに形が変わらないようにする
    for index, vert in enumerate(wall.data.vertices):
        jitter = ((index * 2654435761) % 1000) / 1000.0 - 0.5
        vert.co.x += jitter * 0.022
        vert.co.y += (((index * 40503) % 1000) / 1000.0 - 0.5) * 0.022
        vert.co.z += (((index * 69069) % 1000) / 1000.0 - 0.5) * 0.014
    return [wall]


def build_floor():
    """1マスぶんの床板。上面をわずかに窪ませて、敷石らしい陰影が出るようにする。"""
    slab = C.box("floor", (0.0, 0.0, -0.06), (1.0, 1.0, 0.12), bevel=0.05, bevel_segments=1)
    C.assign_material(slab, C.make_material("floor_stone", FLOOR_COLOR, roughness=0.95))
    for index, vert in enumerate(slab.data.vertices):
        if vert.co.z > -0.02:
            vert.co.z -= (((index * 2654435761) % 1000) / 1000.0) * 0.016
    return [slab]


def build_stairs():
    """
    下りの階段。床に開いた四角い穴に段が沈んでいく形。
    斜め見下ろしのカメラでも段差が読めるよう、段ごとに蹴上げ(垂直面)を作り、
    奥に行くほど確実に暗くなるようにしてある。
    """
    stone = C.make_material("stairs_stone", STONE_LIGHT, roughness=0.85)
    dark_stone = C.make_material("stairs_stone_dark", (0.22, 0.22, 0.26), roughness=0.9)
    objs = []

    steps = 5
    for i in range(steps):
        y = 0.34 - i * 0.175
        top = -0.04 - i * 0.105
        # 踏み面。段ごとに一段ぶん低くなる
        tread = C.box(f"stairs_tread{i}", (0.0, y, top - 0.025), (0.80, 0.165, 0.05),
                      bevel=0.012)
        C.assign_material(tread, stone if i < 3 else dark_stone)
        objs.append(tread)
        # 蹴上げ。踏み面の奥に立てて段差をはっきり見せる
        riser = C.box(f"stairs_riser{i}", (0.0, y - 0.088, top - 0.077),
                      (0.80, 0.022, 0.105))
        C.assign_material(riser, dark_stone)
        objs.append(riser)

    # 床に開いた穴の縁
    for side in (-1.0, 1.0):
        edge = C.box(f"stairs_edge{side}", (0.455 * side, 0.0, -0.03),
                     (0.09, 0.98, 0.10), bevel=0.02)
        C.assign_material(edge, C.make_material(f"stairs_edge{side}_m", STONE_DARK,
                                                roughness=0.9))
        objs.append(edge)
    back = C.box("stairs_back", (0.0, 0.455, -0.03), (0.98, 0.09, 0.10), bevel=0.02)
    C.assign_material(back, C.make_material("stairs_back_m", STONE_DARK, roughness=0.9))
    objs.append(back)

    # 最下段の先に置く闇。床より下なので上からは見えないが、
    # 段の連なりが途切れずに続いているように見せる
    void = C.box("stairs_void", (0.0, -0.455, -0.50), (0.80, 0.09, 0.14))
    C.assign_material(void, C.make_material("stairs_void_m", (0.01, 0.01, 0.02), roughness=1.0))
    objs.append(void)

    return [C.join(objs, "stairs")]


# --------------------------------------------------------------------------- 罠

def _trap_plate(name: str, color, emblem_color):
    """罠に共通の踏み板。中央に種類ごとの意匠を載せる。"""
    plate = C.box(f"{name}_plate", (0.0, 0.0, 0.018), (0.74, 0.74, 0.036),
                  bevel=0.025, bevel_segments=2)
    C.assign_material(plate, C.make_material(f"{name}_plate_m", color, roughness=0.8))
    ring = C.cylinder(f"{name}_ring", (0.0, 0.0, 0.040), 0.26, 0.016, segments=22)
    C.assign_material(ring, C.make_material(f"{name}_ring_m", emblem_color, roughness=0.55))
    return [plate, ring]


def build_trap_damage():
    """矢の罠。板の中央から矢じりが覗いている。"""
    objs = _trap_plate("trapdmg", (0.34, 0.28, 0.28), (0.72, 0.24, 0.20))
    tip = C.cone("trapdmg_tip", (0.0, 0.0, 0.075), 0.075, 0.005, 0.11, segments=12)
    C.assign_material(tip, C.make_material("trapdmg_tip_m", (0.60, 0.62, 0.66),
                                           roughness=0.4, metallic=0.8))
    objs.append(tip)
    return [C.join(objs, "trap_damage")]


def build_trap_sleep():
    """眠りガスの罠。三つの噴出口から霧が漂う。"""
    objs = _trap_plate("trapslp", (0.28, 0.30, 0.36), (0.40, 0.72, 0.55))
    gas = C.make_material("trapslp_gas", (0.52, 0.82, 0.66), roughness=0.4, emission=0.6)
    for i in range(3):
        angle = math.radians(90 + i * 120)
        puff = C.uv_sphere(f"trapslp_puff{i}",
                           (math.cos(angle) * 0.13, math.sin(angle) * 0.13, 0.085),
                           0.058, segments=12, rings=8, scale=(1.0, 1.0, 0.7))
        C.assign_material(puff, gas)
        objs.append(puff)
    return [C.join(objs, "trap_sleep")]


def build_trap_alarm():
    """警報の罠。板の上に小さな鐘が載っている。"""
    objs = _trap_plate("trapalm", (0.36, 0.30, 0.22), (0.86, 0.68, 0.22))
    bell = C.cone("trapalm_bell", (0.0, 0.0, 0.105), 0.115, 0.045, 0.14, segments=16)
    C.assign_material(bell, C.make_material("trapalm_bell_m", (0.80, 0.64, 0.24),
                                            roughness=0.35, metallic=0.85))
    clapper = C.uv_sphere("trapalm_clapper", (0.0, 0.0, 0.045), 0.035, segments=10, rings=8)
    C.assign_material(clapper, C.make_material("trapalm_clapper_m", (0.42, 0.34, 0.16),
                                               roughness=0.5, metallic=0.7))
    objs += [bell, clapper]
    return [C.join(objs, "trap_alarm")]


def build_trap_pitfall():
    """落とし穴。縁だけを残して、中は底の見えない闇にする。"""
    ring = C.cylinder("trappit_ring", (0.0, 0.0, 0.02), 0.40, 0.05, segments=26)
    C.assign_material(ring, C.make_material("trappit_ring_m", (0.26, 0.24, 0.26), roughness=0.9))
    hole = C.cylinder("trappit_hole", (0.0, 0.0, -0.14), 0.34, 0.32, segments=26)
    C.assign_material(hole, C.make_material("trappit_hole_m", (0.015, 0.015, 0.03), roughness=1.0))
    return [C.join([ring, hole], "trap_pitfall")]


# --------------------------------------------------------------------------- アイテム

def build_herb():
    """いやしの葉。太い茎から丸い葉が数枚。"""
    green = C.make_material("herb_leaf", (0.35, 0.66, 0.28), roughness=0.6)
    stem_mat = C.make_material("herb_stem", (0.32, 0.50, 0.22), roughness=0.7)

    objs = []
    stem = C.cylinder("herb_stem", (0.0, 0.0, 0.10), 0.020, 0.20, segments=10)
    C.assign_material(stem, stem_mat)
    objs.append(stem)

    for i, (angle_deg, tilt, length) in enumerate([
        (20.0, 34.0, 0.15), (140.0, 40.0, 0.13), (260.0, 30.0, 0.14),
    ]):
        angle = math.radians(angle_deg)
        lean = math.radians(tilt)
        reach = math.sin(lean) * length
        leaf = C.uv_sphere(
            f"herb_leaf{i}",
            (math.cos(angle) * reach, math.sin(angle) * reach, 0.185 + math.cos(lean) * 0.05),
            length * 0.62, segments=14, rings=9, scale=(1.0, 0.55, 0.22),
        )
        leaf.rotation_euler = (0.0, 0.0, angle)
        C.assign_material(leaf, green)
        objs.append(leaf)

    # 中央の若芽
    bud = C.uv_sphere("herb_bud", (0.0, 0.0, 0.225), 0.036, segments=12, rings=8,
                      scale=(1.0, 1.0, 1.5))
    C.assign_material(bud, green)
    objs.append(bud)
    return [C.join(objs, "herb")]


def build_scroll():
    """巻物。丸めた羊皮紙に紐を巻く。"""
    paper = C.make_material("scroll_paper", (0.90, 0.84, 0.66), roughness=0.85)
    body = C.cylinder("scroll_body", (0.0, 0.0, 0.075), 0.075, 0.30, segments=20, axis="X")
    C.assign_material(body, paper)

    objs = [body]
    for side in (-1.0, 1.0):
        # 端の巻き口
        cap = C.cylinder(f"scroll_cap{side}", (0.152 * side, 0.0, 0.075), 0.082, 0.02,
                         segments=20, axis="X")
        C.assign_material(cap, C.make_material(f"scroll_cap{side}_m", (0.80, 0.72, 0.54),
                                               roughness=0.85))
        objs.append(cap)

    ribbon = C.cylinder("scroll_ribbon", (0.0, 0.0, 0.075), 0.085, 0.035, segments=20, axis="X")
    C.assign_material(ribbon, C.make_material("scroll_ribbon_m", (0.68, 0.20, 0.24),
                                              roughness=0.6))
    objs.append(ribbon)
    return [C.join(objs, "scroll")]


def build_staff():
    """杖。ねじれた木の先に宝石を載せる。"""
    wood = C.make_material("staff_wood", (0.40, 0.27, 0.16), roughness=0.8)
    shaft = C.cylinder("staff_shaft", (0.0, 0.0, 0.16), 0.020, 0.32, segments=12)
    C.assign_material(shaft, wood)

    objs = [shaft]
    # 先端の爪
    for i in range(3):
        angle = math.radians(i * 120)
        claw = C.uv_sphere(f"staff_claw{i}",
                           (math.cos(angle) * 0.042, math.sin(angle) * 0.042, 0.325),
                           0.028, segments=10, rings=7, scale=(0.8, 0.8, 1.7))
        C.assign_material(claw, wood)
        objs.append(claw)

    gem = C.uv_sphere("staff_gem", (0.0, 0.0, 0.368), 0.052, segments=16, rings=12)
    C.assign_material(gem, C.make_material("staff_gem_m", (0.42, 0.68, 0.92),
                                           roughness=0.15, emission=1.4))
    objs.append(gem)
    return [C.join(objs, "staff")]


def build_bread():
    """かたパン。楕円の塊に切れ目を入れる。"""
    crust = C.make_material("bread_crust", (0.72, 0.50, 0.26), roughness=0.85)
    loaf = C.uv_sphere("bread_loaf", (0.0, 0.0, 0.10), 0.15, segments=20, rings=14,
                       scale=(1.0, 0.72, 0.62))
    C.assign_material(loaf, crust)

    objs = [loaf]
    inner = C.make_material("bread_inner", (0.88, 0.74, 0.48), roughness=0.9)
    for i in range(3):
        slash = C.box(f"bread_slash{i}", (-0.06 + i * 0.06, 0.0, 0.183),
                      (0.022, 0.11, 0.03), bevel=0.008)
        slash.rotation_euler = (0.0, 0.0, math.radians(22))
        C.assign_material(slash, inner)
        objs.append(slash)
    return [C.join(objs, "bread")]


def build_hatchet_item():
    """床に落ちている なた。刃を上にして立てかけた姿勢にする。"""
    pieces = parts.build_hatchet(origin=(0.0, 0.0, 0.06), scale=1.0, rotation=(-90.0, 0.0, 0.0))
    return [C.join(pieces, "hatchet")]


def build_shield_item():
    """床に落ちている盾。少し傾けて立てる。"""
    pieces = parts.build_shield(origin=(0.0, 0.0, 0.17), scale=1.0)
    for piece in pieces:
        piece.rotation_euler = (math.radians(-18.0), 0.0, 0.0)
    return [C.join(pieces, "shield")]


# --------------------------------------------------------------------------- 一覧

PROPS = {
    "wall": build_wall,
    "floor": build_floor,
    "stairs": build_stairs,
    "trap_damage": build_trap_damage,
    "trap_sleep": build_trap_sleep,
    "trap_alarm": build_trap_alarm,
    "trap_pitfall": build_trap_pitfall,
    "herb": build_herb,
    "scroll": build_scroll,
    "staff": build_staff,
    "bread": build_bread,
    "hatchet": build_hatchet_item,
    "shield": build_shield_item,
}


if __name__ == "__main__":
    import sys

    targets = sys.argv[1:] or list(PROPS)
    for target in targets:
        C.reset_scene()
        objs = PROPS[target]()
        print(f"{target}: 三角形 {C.tri_count(objs)}")
        C.render_preview(target, objs, size=(320, 320), samples=40)
        C.export_glb(target, objs)
