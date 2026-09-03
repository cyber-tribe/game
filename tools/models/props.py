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

# 第一地方(うたたねの参道)専用の意匠(plan/models/archive/dungeon-region1-tileset.md)
ROOT_BARK = (0.26, 0.18, 0.12)
ROOT_BARK_LIGHT = (0.36, 0.26, 0.16)
ROOT_MOSS = (0.23, 0.32, 0.17)
DIRT_FLOOR = (0.27, 0.21, 0.15)

# 第二地方(忘れ潮の湿地)専用の意匠(plan/models/archive/
# dungeon-region-tileset-generalize.md)
REED_GREEN = (0.34, 0.42, 0.22)
REED_GREEN_DRY = (0.46, 0.44, 0.28)
MUD_DARK = (0.24, 0.22, 0.16)
MUD_LIGHT = (0.32, 0.29, 0.20)
PUDDLE_WATER = (0.12, 0.17, 0.16)
LOG_BROWN = (0.34, 0.24, 0.15)
LOG_BROWN_DARK = (0.24, 0.17, 0.10)


def _hand_carved_jitter(obj, amount: float = 0.022, z_amount: float | None = None) -> None:
    """
    石の目地や木の根の粗さを出す、決め打ちの擬似乱数による頂点ずらし
    (build_wallが元々使っていたものを共通化。実行のたびに形が変わらないよう
    頂点インデックスから決定的に値を作る)。
    """
    z_amount = amount * 0.6 if z_amount is None else z_amount
    for index, vert in enumerate(obj.data.vertices):
        vert.co.x += (((index * 2654435761) % 1000) / 1000.0 - 0.5) * amount
        vert.co.y += (((index * 40503) % 1000) / 1000.0 - 0.5) * amount
        vert.co.z += (((index * 69069) % 1000) / 1000.0 - 0.5) * z_amount


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
    _hand_carved_jitter(wall, amount=0.022, z_amount=0.014)
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
    return [_build_stairs_shape("stairs", stone, dark_stone, STONE_DARK, (0.01, 0.01, 0.02))]


def _build_stairs_shape(name: str, stone: bpy.types.Material, dark_stone: bpy.types.Material,
                        edge_color, void_color) -> bpy.types.Object:
    """
    踏み面・蹴上げの構成そのものは`build_stairs`と`build_stairs_region1`で共通
    (plan/models/archive/dungeon-region1-tileset.md「階段は流用しつつ素材だけ
    差し替える」)。見た目の違いはすべて呼び出し側が渡すマテリアルで決まる。
    """
    objs = []

    steps = 5
    for i in range(steps):
        y = 0.34 - i * 0.175
        top = -0.04 - i * 0.105
        # 踏み面。段ごとに一段ぶん低くなる
        tread = C.box(f"{name}_tread{i}", (0.0, y, top - 0.025), (0.80, 0.165, 0.05),
                      bevel=0.012)
        C.assign_material(tread, stone if i < 3 else dark_stone)
        objs.append(tread)
        # 蹴上げ。踏み面の奥に立てて段差をはっきり見せる
        riser = C.box(f"{name}_riser{i}", (0.0, y - 0.088, top - 0.077),
                      (0.80, 0.022, 0.105))
        C.assign_material(riser, dark_stone)
        objs.append(riser)

    # 床に開いた穴の縁
    for side in (-1.0, 1.0):
        edge = C.box(f"{name}_edge{side}", (0.455 * side, 0.0, -0.03),
                     (0.09, 0.98, 0.10), bevel=0.02)
        C.assign_material(edge, C.make_material(f"{name}_edge{side}_m", edge_color,
                                                roughness=0.9))
        objs.append(edge)
    back = C.box(f"{name}_back", (0.0, 0.455, -0.03), (0.98, 0.09, 0.10), bevel=0.02)
    C.assign_material(back, C.make_material(f"{name}_back_m", edge_color, roughness=0.9))
    objs.append(back)

    # 最下段の先に置く闇。床より下なので上からは見えないが、
    # 段の連なりが途切れずに続いているように見せる
    void = C.box(f"{name}_void", (0.0, -0.455, -0.50), (0.80, 0.09, 0.14))
    C.assign_material(void, C.make_material(f"{name}_void_m", void_color, roughness=1.0))
    objs.append(void)

    return C.join(objs, name)


def build_stairs_region1():
    """
    第一地方の階段。段・蹴上げ・穴の縁の構成は`build_stairs`とまったく同じで、
    素材だけ石から木の根に差し替える(plan/models/archive/
    dungeon-region1-tileset.md)。
    """
    root = C.make_material("stairs_region1_root", ROOT_BARK_LIGHT, roughness=0.88)
    root_dark = C.make_material("stairs_region1_root_dark", ROOT_BARK, roughness=0.9)
    return [_build_stairs_shape("stairs_region1", root, root_dark, ROOT_BARK, (0.02, 0.02, 0.015))]


# ------------------------------------------------------------ 第一地方の壁・床

_WALL_REGION1_PROFILES = {
    # 幹の基本半径・上に向かう先細り・左右へのうねり幅・段数。
    # タイル間隔は1.0なので、隣のタイルと隙間なく接するには先細り後の
    # 最小半径(base_r*(1-taper))がうねり幅を差し引いても0.5を超える
    # 必要がある。旧値(0.30〜0.44)はこれを満たさず、隣のタイルとの間に
    # 最大0.4ユニットの隙間ができ、背景の空が見えていた(#337)
    1: dict(base_r=0.64, taper=0.15, sway=0.04, segs=4),
    2: dict(base_r=0.72, taper=0.20, sway=0.07, segs=5),
    3: dict(base_r=0.68, taper=0.18, sway=-0.05, segs=4),
}

# 根元に添える差し根(タイル内に収まる範囲でx/yへ短くはみ出す)
_WALL_REGION1_FEET = {
    1: [((0.22, 0.0, 0.02), 0.07, 0.30, "X")],
    2: [((0.0, 0.20, 0.015), 0.05, 0.26, "Y"), ((-0.18, -0.12, 0.02), 0.055, 0.22, "X")],
    3: [((-0.20, 0.08, 0.02), 0.06, 0.28, "X")],
}


def _build_wall_region1(variant: int):
    """
    苔むした太い木の根が壁を成す(plan/models/archive/
    dungeon-region1-tileset.md)。直方体を積んだ`build_wall`と違い、
    先細りの輪切り(円錐)を高さごとに左右へずらしながら積み、うねる幹を作る。
    根元には細い差し根を1〜2本添えて、四角い柱に見えないよう輪郭を崩す。
    """
    bark = C.make_material(f"wall_region1_v{variant}_bark", ROOT_BARK, roughness=0.9)
    bark_light = C.make_material(f"wall_region1_v{variant}_bark_light", ROOT_BARK_LIGHT,
                                 roughness=0.88)
    moss = C.make_material(f"wall_region1_v{variant}_moss", ROOT_MOSS, roughness=0.95)

    profile = _WALL_REGION1_PROFILES[variant]
    segs = profile["segs"]
    base_r = profile["base_r"]
    height = 1.02

    objs = []
    for i in range(segs):
        t0, t1 = i / segs, (i + 1) / segs
        z0, z1 = t0 * height, t1 * height
        r0 = base_r * (1.0 - profile["taper"] * t0)
        r1 = base_r * (1.0 - profile["taper"] * t1)
        sway = profile["sway"]
        x = math.sin(t0 * math.pi * 1.4 + variant) * sway
        y = math.cos(t0 * math.pi * 1.1 + variant) * sway * 0.6
        # 継ぎ目に隙間ができないよう、depthを少し重ねる
        depth = (z1 - z0) * 1.18
        seg = C.cone(f"wall_region1_v{variant}_trunk{i}", (x, y, (z0 + z1) / 2), r0, r1, depth,
                    segments=12)
        C.assign_material(seg, moss if i == segs - 1 else (bark_light if i % 2 else bark))
        objs.append(seg)

    for (center, radius, length, axis) in _WALL_REGION1_FEET[variant]:
        foot = C.cylinder(f"wall_region1_v{variant}_foot{len(objs)}", center, radius, length,
                          segments=8, axis=axis)
        C.assign_material(foot, bark)
        objs.append(foot)

    wall = C.join(objs, f"wall_region1_v{variant}")
    _hand_carved_jitter(wall, amount=0.03, z_amount=0.02)
    return [wall]


def build_wall_region1_v1():
    return _build_wall_region1(1)


def build_wall_region1_v2():
    return _build_wall_region1(2)


def build_wall_region1_v3():
    return _build_wall_region1(3)


# variantごとに床を這わせる根: (中心x, 中心y, 半径, 長さ, 軸)の列。
# 床の上面はz=0にあるので、半径ぶんだけ中心を持ち上げて上面に乗せる
_FLOOR_REGION1_ROOTS = {
    1: [((0.0, 0.0, 0.03), 0.045, 0.62, "Y"), ((0.20, 0.30, 0.02), 0.03, 0.28, "X")],
    2: [((-0.12, -0.15, 0.032), 0.05, 0.55, "X"), ((0.22, 0.10, 0.024), 0.035, 0.42, "Y")],
    3: [((0.0, 0.28, 0.026), 0.04, 0.70, "X"), ((-0.26, -0.10, 0.024), 0.035, 0.40, "Y")],
}

# variantごとの木漏れ日の盛り上がり(こぶ)の位置と半径。上面(z=0)から
# 半分だけ顔を出すよう、こぶの中心もz=0に揃える
_FLOOR_REGION1_BUMPS = {
    1: [(-0.28, -0.24, 0.05), (0.30, -0.18, 0.04), (-0.05, 0.30, 0.035)],
    2: [(0.28, 0.28, 0.045), (-0.30, 0.15, 0.04), (0.05, -0.32, 0.035), (-0.15, -0.30, 0.03)],
    3: [(-0.32, 0.22, 0.05), (0.20, 0.05, 0.04), (0.32, -0.30, 0.035)],
}


def _build_floor_region1(variant: int):
    """
    踏み固められた土に木の根が這う床(plan/models/archive/
    dungeon-region1-tileset.md)。木漏れ日の斑模様は専用のテクスチャや
    頂点カラーの描き込みを別途行うのではなく、根やこぶの盛り上がりを
    実際の凹凸として作ることで、書き出し時に自動で焼かれるAO
    (`common.export_glb`→`bake_ao_to_vertex_colors`)がそのまま
    斑模様になるようにする。
    """
    dirt = C.make_material(f"floor_region1_v{variant}_dirt", DIRT_FLOOR, roughness=0.96)
    bark = C.make_material(f"floor_region1_v{variant}_bark", ROOT_BARK, roughness=0.9)

    # 上面がz=0にくるようにする(既存build_floorと同じ高さの取り決め。
    # z=0を基準に足元のもの ― アイテム・罠・タル等 ― が置かれるため揃えておく)
    slab = C.box(f"floor_region1_v{variant}_slab", (0.0, 0.0, -0.06), (1.0, 1.0, 0.12),
                bevel=0.06, bevel_segments=1)
    C.assign_material(slab, dirt)
    objs = [slab]

    for (center, radius, length, axis) in _FLOOR_REGION1_ROOTS[variant]:
        root = C.cylinder(f"floor_region1_v{variant}_root{len(objs)}", center, radius, length,
                          segments=8, axis=axis)
        C.assign_material(root, bark)
        objs.append(root)

    for x, y, r in _FLOOR_REGION1_BUMPS[variant]:
        bump = C.uv_sphere(f"floor_region1_v{variant}_bump{len(objs)}", (x, y, 0.0), r,
                          segments=8, rings=5, scale=(1.0, 1.0, 0.4))
        C.assign_material(bump, dirt)
        objs.append(bump)

    floor = C.join(objs, f"floor_region1_v{variant}")
    _hand_carved_jitter(floor, amount=0.025, z_amount=0.012)
    return [floor]


def build_floor_region1_v1():
    return _build_floor_region1(1)


def build_floor_region1_v2():
    return _build_floor_region1(2)


def build_floor_region1_v3():
    return _build_floor_region1(3)


# ------------------------------------------------------------ 第二地方の壁・床・階段

def build_stairs_region2():
    """
    第二地方の階段。段・蹴上げ・穴の縁の構成はbuild_stairsと同じで、
    素材を泥に沈む丸太に差し替える(plan/models/archive/
    dungeon-region-tileset-generalize.md)。
    """
    log = C.make_material("stairs_region2_log", LOG_BROWN, roughness=0.85)
    log_dark = C.make_material("stairs_region2_log_dark", LOG_BROWN_DARK, roughness=0.9)
    return [_build_stairs_shape("stairs_region2", log, log_dark, MUD_DARK, (0.05, 0.05, 0.03))]


# variantごとの葦の束の姿(土手の半径・高さ、葦の本数・太さ、傾き)
_WALL_REGION2_PROFILES = {
    1: dict(mound_r=0.42, mound_h=0.30, reed_count=7, reed_r=0.042, sway=0.03),
    2: dict(mound_r=0.34, mound_h=0.24, reed_count=9, reed_r=0.030, sway=0.09),
    3: dict(mound_r=0.38, mound_h=0.34, reed_count=6, reed_r=0.052, sway=-0.06),
}


def _build_wall_region2(variant: int):
    """
    葦の束と泥の土手が壁を成す(plan/models/archive/
    dungeon-region-tileset-generalize.md)。太い根がうねる第一地方の壁
    (`_build_wall_region1`)と対照的に、細い葦を束ねて泥の土手に
    立てただけの、頼りなくたわむ輪郭にする。
    """
    mud = C.make_material(f"wall_region2_v{variant}_mud", MUD_DARK, roughness=0.9)
    reed = C.make_material(f"wall_region2_v{variant}_reed", REED_GREEN, roughness=0.75)
    reed_dry = C.make_material(f"wall_region2_v{variant}_reed_dry", REED_GREEN_DRY, roughness=0.8)
    cord_mat = C.make_material(f"wall_region2_v{variant}_cord", MUD_LIGHT, roughness=0.7)

    profile = _WALL_REGION2_PROFILES[variant]
    objs = []

    # 泥の土手(でこぼこした低い塚)
    mound = C.box(f"wall_region2_v{variant}_mound", (0.0, 0.0, profile["mound_h"] / 2 - 0.02),
                 (0.94, 0.94, profile["mound_h"]), bevel=0.10, bevel_segments=2)
    C.assign_material(mound, mud)
    objs.append(mound)

    # 葦の束。円周上に疑似乱数でばらつきを持たせて配置する
    base_z = profile["mound_h"] * 0.6
    for i in range(profile["reed_count"]):
        angle = (i / profile["reed_count"]) * 2 * math.pi + variant
        dist = profile["mound_r"] * (0.35 + 0.4 * ((i * 0.61803) % 1.0))
        x = math.cos(angle) * dist + profile["sway"] * 0.5
        y = math.sin(angle) * dist
        height = 1.0 - profile["mound_h"] * 0.4 + ((i * 0.382) % 1.0 - 0.5) * 0.12
        r = profile["reed_r"] * (0.8 + 0.4 * ((i * 0.236) % 1.0))
        reed_obj = C.cone(f"wall_region2_v{variant}_reed{i}", (x, y, base_z + height / 2),
                          r, r * 0.25, height, segments=7)
        C.assign_material(reed_obj, reed if i % 3 else reed_dry)
        objs.append(reed_obj)

    # 束ねる帯
    cord = C.cylinder(f"wall_region2_v{variant}_cord", (0.0, 0.0, base_z + 0.30),
                      profile["mound_r"] * 0.62, 0.04, segments=16)
    C.assign_material(cord, cord_mat)
    objs.append(cord)

    wall = C.join(objs, f"wall_region2_v{variant}")
    _hand_carved_jitter(wall, amount=0.025, z_amount=0.015)
    return [wall]


def build_wall_region2_v1():
    return _build_wall_region2(1)


def build_wall_region2_v2():
    return _build_wall_region2(2)


def build_wall_region2_v3():
    return _build_wall_region2(3)


# variantごとに散らす水たまり: (中心x, 中心y, 半径)の列
_FLOOR_REGION2_PUDDLES = {
    1: [(-0.20, 0.15, 0.095), (0.25, -0.10, 0.075)],
    2: [(0.10, 0.28, 0.080), (-0.28, -0.05, 0.065), (0.05, -0.30, 0.050)],
    3: [(0.30, 0.20, 0.100), (-0.15, -0.25, 0.075)],
}


def _build_floor_region2(variant: int):
    """
    ぬかるみと点在する水たまり(plan/models/archive/
    dungeon-region-tileset-generalize.md)。木の根の代わりに、泥面へ
    浅く沈んだ水たまり(縁を少し持ち上げ、水面を少し沈める)を実際の
    凹凸として作り、書き出し時に自動で焼かれるAOがそのまま陰影になる
    ようにする(第一地方の床と同じ考え方)。
    """
    mud = C.make_material(f"floor_region2_v{variant}_mud", MUD_DARK, roughness=0.92)
    rim_mat = C.make_material(f"floor_region2_v{variant}_rim", MUD_LIGHT, roughness=0.85)
    water_mat = C.make_material(f"floor_region2_v{variant}_water", PUDDLE_WATER, roughness=0.2)

    # 上面がz=0にくるようにする(既存build_floor/build_floor_region1と
    # 同じ高さの取り決め)
    slab = C.box(f"floor_region2_v{variant}_slab", (0.0, 0.0, -0.06), (1.0, 1.0, 0.12),
                bevel=0.06, bevel_segments=1)
    C.assign_material(slab, mud)
    objs = [slab]

    for x, y, r in _FLOOR_REGION2_PUDDLES[variant]:
        rim = C.cylinder(f"floor_region2_v{variant}_rim{len(objs)}", (x, y, -0.006), r * 1.25,
                         0.020, segments=16)
        C.assign_material(rim, rim_mat)
        objs.append(rim)
        water = C.cylinder(f"floor_region2_v{variant}_water{len(objs)}", (x, y, -0.016), r,
                           0.016, segments=16)
        C.assign_material(water, water_mat)
        objs.append(water)

    floor = C.join(objs, f"floor_region2_v{variant}")
    _hand_carved_jitter(floor, amount=0.03, z_amount=0.015)
    return [floor]


def build_floor_region2_v1():
    return _build_floor_region2(1)


def build_floor_region2_v2():
    return _build_floor_region2(2)


def build_floor_region2_v3():
    return _build_floor_region2(3)


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


# --------------------------------------------------------------------------- タル

BARREL_WOOD = (0.52, 0.34, 0.19)
BARREL_WOOD_DARK = (0.26, 0.20, 0.17)
BARREL_IRON = (0.34, 0.35, 0.38)


BARREL_HEIGHT = 0.52
BARREL_RADIUS = 0.245


def barrel_body(name: str, wood, iron, height: float = BARREL_HEIGHT,
                 radius: float = BARREL_RADIUS):
    """
    タルの胴。中央を膨らませた樽形にする。
    面数を12に抑えたうえでフラットシェーディングにしてあるので、
    側面の平らな面がそのまま「板を並べた樽」に見える。
    """
    body = C.cylinder(f"{name}_body", (0.0, 0.0, height / 2), radius, height,
                      segments=12, smooth=False)
    # 中央を膨らませる。上下の縁は細く、腹は太く
    for vert in body.data.vertices:
        t = vert.co.z / height          # 0(底) 〜 1(上)
        bulge = 1.0 + 0.16 * math.sin(t * math.pi)
        vert.co.x *= bulge
        vert.co.y *= bulge
    C.assign_material(body, C.make_material(f"{name}_wood", wood, roughness=0.85))

    objs = [body]

    # 鉄輪。腹の膨らみに合わせて半径を変える
    for i, (t, extra) in enumerate([(0.17, 1.06), (0.50, 1.17), (0.83, 1.06)]):
        hoop = C.cylinder(f"{name}_hoop{i}", (0.0, 0.0, height * t),
                          radius * extra + 0.008, 0.040, segments=14)
        C.assign_material(hoop, C.make_material(f"{name}_iron{i}", iron,
                                                roughness=0.45, metallic=0.7))
        objs.append(hoop)

    return objs


def barrel_lid(name: str, color, lift: float = 0.0, tilt: float = 0.0,
                height: float = BARREL_HEIGHT, radius: float = BARREL_RADIUS):
    """
    上蓋。胴の縁より少しだけ外に張り出させて、上から見ても閉じていると分かるようにする。
    胴の中に沈めると、真上から覗いたときに口の開いた樽に見えてしまう。
    """
    lid = C.cylinder(f"{name}_lid", (0.0, 0.0, height + 0.022 + lift),
                     radius + 0.012, 0.044, segments=12, smooth=False)
    if tilt:
        lid.rotation_euler = (math.radians(tilt), 0.0, math.radians(tilt * 0.7))
    C.assign_material(lid, C.make_material(f"{name}_lid_m", color, roughness=0.9))
    return lid


def build_barrel():
    """空のタル。持ち上げて投げられる、この作品の看板になる道具。"""
    objs = barrel_body("barrel", BARREL_WOOD, BARREL_IRON)
    objs.append(barrel_lid("barrel", (0.46, 0.30, 0.17)))
    return [C.join(objs, "barrel")]


def build_barrel_bomb():
    """爆発タル。黒く塗った胴に導火線を立て、火花を灯しておく。"""
    objs = barrel_body("barrelbomb", BARREL_WOOD_DARK, (0.52, 0.22, 0.19))
    objs.append(barrel_lid("barrelbomb", (0.20, 0.16, 0.14)))

    # 導火線。少し斜めに立てる
    fuse = C.cylinder("barrelbomb_fuse", (0.0, 0.0, 0.615), 0.020, 0.14, segments=8)
    fuse.rotation_euler = (math.radians(16), 0.0, 0.0)
    C.assign_material(fuse, C.make_material("barrelbomb_fuse_m", (0.30, 0.25, 0.18),
                                            roughness=0.95))
    objs.append(fuse)

    spark = C.uv_sphere("barrelbomb_spark", (0.0, -0.040, 0.690), 0.050,
                        segments=12, rings=9)
    C.assign_material(spark, C.make_material("barrelbomb_spark_m", (1.0, 0.70, 0.20),
                                             roughness=0.2, emission=5.0))
    objs.append(spark)

    return [C.join(objs, "barrel_bomb")]


def build_barrel_caught():
    """
    モンスターを吸い込んだタル。蓋が浮いて隙間から光が漏れている状態にして、
    空のタルと一目で見分けられるようにする。
    """
    objs = barrel_body("barrelcaught", (0.46, 0.34, 0.26), (0.40, 0.38, 0.30))

    # 蓋を押し上げている隙間の光。蓋より下に置いて、縁からこぼれるように見せる
    glow = C.cylinder("barrelcaught_glow", (0.0, 0.0, BARREL_HEIGHT + 0.030),
                      BARREL_RADIUS + 0.004, 0.060, segments=12, smooth=False)
    C.assign_material(glow, C.make_material("barrelcaught_glow_m", (0.50, 0.85, 1.0),
                                            roughness=0.2, emission=3.5))
    objs.append(glow)

    objs.append(barrel_lid("barrelcaught", (0.46, 0.30, 0.17), lift=0.055, tilt=10.0))
    return [C.join(objs, "barrel_caught")]


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


# --------------------------------------------------------------------------- 村の建物・小道具
#
# plan/models/archive/model-village-structures.md。村なか歩きの建物・小道具は
# これまでThree.jsのプリミティブ(色つきの箱)で仮置きされていた
# (src/view/village.ts の buildStructure)。「タルと同じ木でできた村」という
# 考証(design/village-buildings.md)を反映し、Blenderパイプラインの正式な
# モデルに1棟ずつ置き換えていく。

CAVEGATE_ROCK = (0.30, 0.31, 0.36)
CAVEGATE_WOOD = (0.40, 0.28, 0.18)
CAVEGATE_ROPE = (0.46, 0.39, 0.25)


def _rope_segment(name: str, p0, p1, radius: float, mat) -> bpy.types.Object:
    """
    2点(x, y, z)を結ぶ、たわんだ縄の1区間。円柱をローカル原点で作ってから
    向きと位置を与える(join()でオブジェクト変換が焼き込まれる、
    parts.build_hatchetと同じ手法)。y成分は共通の値を想定する。
    """
    dx = p1[0] - p0[0]
    dz = p1[2] - p0[2]
    length = math.hypot(dx, dz)
    seg = C.cylinder(name, (0.0, 0.0, 0.0), radius, length, segments=8)
    seg.rotation_euler = (0.0, math.atan2(dx, dz), 0.0)
    seg.location = Vector(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2))
    C.assign_material(seg, mat)
    return seg


def build_cave_gate():
    """
    洞窟の入口。村最大のランドマーク(design/village-buildings.md「洞窟の
    入口(山の口)」)。岩肌に穿たれた穴の両脇に、門柱のように立つ一対の
    古い祠木と、タルのたが(箍)を結んだ縄を渡す。
    """
    rock_mat = C.make_material("cavegate_rock", CAVEGATE_ROCK, roughness=0.94)
    mouth_mat = C.make_material("cavegate_mouth", (0.03, 0.03, 0.04), roughness=1.0)
    wood_mat = C.make_material("cavegate_wood", CAVEGATE_WOOD, roughness=0.82)
    rope_mat = C.make_material("cavegate_rope", CAVEGATE_ROPE, roughness=0.9)
    iron_mat = C.make_material("cavegate_iron", (0.34, 0.35, 0.38), roughness=0.45, metallic=0.7)

    objs = []

    # 岩肌。開口部の両脇の塊と、上をまたぐ迫石を別マテリアルなしで一体に積む
    rock_pieces = []
    for side in (-1.0, 1.0):
        pillar = C.box(f"cavegate_rockpillar{side}", (0.85 * side, 0.05, 0.70),
                       (0.55, 0.60, 1.40), bevel=0.10, bevel_segments=2)
        rock_pieces.append(pillar)
    arch = C.box("cavegate_arch", (0.0, 0.05, 1.42), (1.90, 0.60, 0.35), bevel=0.09,
                bevel_segments=2)
    rock_pieces.append(arch)
    rock = C.join(rock_pieces, "cavegate_rock_mass")
    # 手彫りの粗さ(build_wallと同じ、決め打ちの擬似乱数)
    for index, vert in enumerate(rock.data.vertices):
        jitter = ((index * 2654435761) % 1000) / 1000.0 - 0.5
        vert.co.x += jitter * 0.035
        vert.co.y += (((index * 40503) % 1000) / 1000.0 - 0.5) * 0.035
        vert.co.z += (((index * 69069) % 1000) / 1000.0 - 0.5) * 0.025
    C.assign_material(rock, rock_mat)
    objs.append(rock)

    # 穴。奥へ抜ける暗がりとして、岩の内側に食い込ませる
    mouth = C.cylinder("cavegate_mouth", (0.0, 0.30, 0.62), 0.55, 0.50, segments=16, axis="Y")
    C.assign_material(mouth, mouth_mat)
    objs.append(mouth)

    # 祠木の門柱。上に向けてわずかに細くする
    for side in (-1.0, 1.0):
        post = C.cylinder(f"cavegate_post{side}", (1.15 * side, 0.05, 0.75), 0.11, 1.50,
                          segments=10)
        for vert in post.data.vertices:
            t = vert.co.z / 1.50
            taper = 1.0 - 0.18 * t
            vert.co.x = (vert.co.x - 1.15 * side) * taper + 1.15 * side
            vert.co.y *= taper
        C.assign_material(post, wood_mat)
        objs.append(post)

    # たが縄。門柱の頂点どうしを、中央がわずかにたわむ2区間でつなぐ
    top_l = (-1.15, 0.05, 1.42)
    top_r = (1.15, 0.05, 1.42)
    sag = (0.0, 0.05, 1.27)
    objs.append(_rope_segment("cavegate_rope0", top_l, sag, 0.035, rope_mat))
    objs.append(_rope_segment("cavegate_rope1", sag, top_r, 0.035, rope_mat))

    # タルのたがを模した鉄輪を2つ、縄に通す。輪の平らな面が縄の向きと
    # 垂直になるよう、乗る区間の傾きに合わせて向きを揃える
    for t, seg_from, seg_to in ((0.35, top_l, sag), (0.65, sag, top_r)):
        px = seg_from[0] + (seg_to[0] - seg_from[0]) * 0.5
        pz = seg_from[2] + (seg_to[2] - seg_from[2]) * 0.5
        theta = math.atan2(seg_to[0] - seg_from[0], seg_to[2] - seg_from[2])
        hoop = C.cylinder(f"cavegate_hoop{t}", (0.0, 0.0, 0.0), 0.075, 0.032, segments=12,
                          smooth=False)
        hoop.rotation_euler = (0.0, theta, 0.0)
        hoop.location = Vector((px, 0.05, pz))
        C.assign_material(hoop, iron_mat)
        objs.append(hoop)

    return [C.join(objs, "cave_gate")]


BONFIRE_LOG = (0.35, 0.27, 0.20)


def build_bonfire():
    """
    広場の囲炉裏火(design/village-buildings.md「村の広場」)。石組み+
    薪+タルの腰掛け3つで構成する。火そのものはビルボード/シェーダーで
    足す前提のため(docの対象外方針どおり)、ここでは炉と座る場所だけを
    造形する。
    """
    stone_mat = C.make_material("bonfire_stone", STONE_LIGHT, roughness=0.9)
    log_mat = C.make_material("bonfire_log", BONFIRE_LOG, roughness=0.88)
    iron_mat = C.make_material("bonfire_iron", BARREL_IRON, roughness=0.45, metallic=0.7)

    objs = []

    # 炉を囲む石組み。同じ石をリング状に並べ、1つずつ大きさをずらす。
    # ローカル原点で作ってから向きと位置を与える(cave_gateの縄と同じ手法。
    # 焼き込み済みの中心を持つオブジェクトを直接rotation_eulerで回すと
    # 世界原点を軸に公転してしまうため)
    for i in range(10):
        angle = (2 * math.pi / 10) * i
        wobble = ((i * 2654435761) % 1000) / 1000.0
        r = 0.42 + wobble * 0.04
        size = 0.11 + wobble * 0.05
        stone = C.box(f"bonfire_stone{i}", (0.0, 0.0, 0.0),
                     (size, size * 0.9, size), bevel=size * 0.35, bevel_segments=1)
        stone.rotation_euler = (0.0, 0.0, angle + wobble)
        stone.location = Vector((math.cos(angle) * r, math.sin(angle) * r, size * 0.5))
        C.assign_material(stone, stone_mat)
        objs.append(stone)

    # 組んだ薪。3本を井桁に重ねる
    for i in range(3):
        angle = (math.pi / 3) * i
        log = C.cylinder(f"bonfire_log{i}", (0.0, 0.0, 0.0), 0.045, 0.62, segments=8, axis="X")
        log.rotation_euler = (0.0, 0.0, angle)
        log.location = Vector((0.0, 0.0, 0.11))
        C.assign_material(log, log_mat)
        objs.append(log)

    # タルの腰掛け。空のタルよりずっと低く切った胴に鉄輪を1本だけ巻く
    # (barrel_bodyの3本輪をそのまま流用すると、この高さでは輪同士が
    # 近すぎて木部がほとんど隠れてしまうため、専用の低い形にする)
    wood_mat = C.make_material("bonfire_wood", BARREL_WOOD, roughness=0.85)
    for i in range(3):
        angle = (2 * math.pi / 3) * i + math.radians(20)
        stool_objs = []
        body = C.cylinder(f"bonfire_stool{i}_body", (0.0, 0.0, 0.11), 0.22, 0.22,
                          segments=12, smooth=False)
        C.assign_material(body, wood_mat)
        stool_objs.append(body)
        hoop = C.cylinder(f"bonfire_stool{i}_hoop", (0.0, 0.0, 0.10), 0.232, 0.040,
                          segments=12)
        C.assign_material(hoop, iron_mat)
        stool_objs.append(hoop)
        seat = C.cylinder(f"bonfire_stool{i}_seat", (0.0, 0.0, 0.222), 0.232, 0.032,
                          segments=12, smooth=False)
        C.assign_material(seat, iron_mat)
        stool_objs.append(seat)
        offset = Vector((math.cos(angle) * 0.85, math.sin(angle) * 0.85, 0.0))
        for piece in stool_objs:
            piece.location = offset
        objs.extend(stool_objs)

    return [C.join(objs, "bonfire")]


HOUSE_WOOD = (0.56, 0.38, 0.21)
HOUSE_WOOD_DARK = (0.30, 0.20, 0.12)
HOUSE_LOG = (0.42, 0.30, 0.19)


def build_house_workshop():
    """
    ゲンドの工房(design/village-buildings.md)。共通の造形言語(タルと
    同じ飴色の木肌、伏せたタルを思わせる丸屋根)の上に、村で唯一の
    煙突(煙そのものはThree.js側のビルボード/シェーダーに委ねる、doc
    のアニメーション方針どおり)、軒下に寝かせた祠木の材、入口横の
    金床を足して個性を出す。
    """
    wall_mat = C.make_material("workshop_wall", HOUSE_WOOD, roughness=0.85)
    roof_mat = C.make_material("workshop_roof", HOUSE_WOOD_DARK, roughness=0.88)
    plank_mat = C.make_material("workshop_plank", (0.18, 0.12, 0.08), roughness=0.9)
    chimney_mat = C.make_material("workshop_chimney", STONE_DARK, roughness=0.9)
    log_mat = C.make_material("workshop_log", HOUSE_LOG, roughness=0.85)
    anvil_mat = C.make_material("workshop_anvil", (0.16, 0.16, 0.18), roughness=0.4, metallic=0.6)
    door_mat = C.make_material("workshop_door", HOUSE_WOOD_DARK, roughness=0.8)

    objs = []

    wall = C.box("workshop_wall", (0.0, 0.0, 0.65), (1.70, 1.60, 1.30), bevel=0.05,
                bevel_segments=1)
    C.assign_material(wall, wall_mat)
    objs.append(wall)

    door = C.box("workshop_door", (0.35, 0.805, 0.42), (0.46, 0.03, 0.72), bevel=0.02)
    C.assign_material(door, door_mat)
    objs.append(door)

    # 伏せたタルを思わせる丸屋根。下半分を壁に埋め込み、上半分だけを見せる
    roof = C.cylinder("workshop_roof", (0.0, 0.0, 1.72), 1.02, 2.05, segments=16, axis="X")
    C.assign_material(roof, roof_mat)
    objs.append(roof)

    # 板張りの筋。タルの側板を連想させる、屋根の弧に沿った細い帯
    for i, deg in enumerate((-55, -27, 0, 27, 55)):
        rad = math.radians(deg)
        plank = C.box(f"workshop_plank{i}", (0.0, 0.0, 0.0), (2.04, 0.045, 0.022))
        plank.rotation_euler = (rad, 0.0, 0.0)
        plank.location = Vector((0.0, math.sin(rad) * 1.03, 1.72 + math.cos(rad) * 1.03))
        C.assign_material(plank, plank_mat)
        objs.append(plank)

    # 煙突。村で唯一。屋根の稜線寄りに立てる
    chimney = C.box("workshop_chimney", (0.55, 0.0, 2.95), (0.22, 0.22, 0.55), bevel=0.02)
    C.assign_material(chimney, chimney_mat)
    objs.append(chimney)
    chimney_cap = C.box("workshop_chimney_cap", (0.55, 0.0, 3.25), (0.30, 0.30, 0.07),
                        bevel=0.015)
    C.assign_material(chimney_cap, chimney_mat)
    objs.append(chimney_cap)

    # 軒下に寝かせて乾かしてある、材の祠木。2段に積む
    for row in range(2):
        for col in range(3):
            log = C.cylinder(f"workshop_log{row}_{col}", (0.0, 0.0, 0.0), 0.085, 1.30,
                             segments=8, axis="X")
            log.location = Vector((-0.05, -0.86, 0.13 + row * 0.16 + col * 0.002))
            C.assign_material(log, log_mat)
            objs.append(log)

    # 入口横の金床
    anvil_base = C.box("workshop_anvil_base", (0.95, 0.72, 0.11), (0.20, 0.14, 0.22),
                       bevel=0.02)
    C.assign_material(anvil_base, anvil_mat)
    objs.append(anvil_base)
    anvil_top = C.box("workshop_anvil_top", (0.95, 0.72, 0.245), (0.30, 0.20, 0.05),
                      bevel=0.015)
    C.assign_material(anvil_top, anvil_mat)
    objs.append(anvil_top)
    anvil_horn = C.cone("workshop_anvil_horn", (0.0, 0.0, 0.0), 0.055, 0.008, 0.22, segments=10)
    anvil_horn.rotation_euler = (0.0, math.radians(90.0), 0.0)
    anvil_horn.location = Vector((1.20, 0.72, 0.245))
    C.assign_material(anvil_horn, anvil_mat)
    objs.append(anvil_horn)

    return [C.join(objs, "house_workshop")]


HUT_CLOTH = (0.34, 0.40, 0.52)
HUT_BELL = (0.62, 0.55, 0.30)


def build_house_hut():
    """
    ねむり小屋(design/village-buildings.md「ねむり小屋(フク)」)。共通の
    造形言語の上に、村で一番深い丸屋根(かまくら形)、入口の掛け布の
    のれん、軒先に下がる小さな風鈴で個性を出す。風鈴の揺れはdocの
    アニメーション方針(頂点アニメ/回転ループ)どおりだが、この小屋も
    含め村の建物は静止した造形で作る運用(工房の煙と同じくThree.js側で
    動きを持たせる余地は残すが、本PRでは静止した造形のみを対象とする)。
    """
    wall_mat = C.make_material("hut_wall", HOUSE_WOOD, roughness=0.85)
    roof_mat = C.make_material("hut_roof", HOUSE_WOOD_DARK, roughness=0.9)
    ring_mat = C.make_material("hut_ring", (0.20, 0.14, 0.09), roughness=0.9)
    cloth_mat = C.make_material("hut_cloth", HUT_CLOTH, roughness=0.75)
    cord_mat = C.make_material("hut_cord", (0.22, 0.18, 0.12), roughness=0.8)
    bell_mat = C.make_material("hut_bell", HUT_BELL, roughness=0.35, metallic=0.75)

    objs = []

    wall = C.box("hut_wall", (0.0, 0.0, 0.50), (1.50, 1.50, 1.00), bevel=0.05,
                bevel_segments=1)
    C.assign_material(wall, wall_mat)
    objs.append(wall)

    # 村で一番深い丸屋根。かまくら形にするため、半球をほぼそのまま乗せる
    dome = C.uv_sphere("hut_dome", (0.0, 0.0, 1.05), 1.05, segments=16, rings=10)
    C.assign_material(dome, roof_mat)
    objs.append(dome)

    # 屋根の帯。タルの側板を思わせる横筋を2段
    for i, z in enumerate((1.35, 1.75)):
        ring_radius = math.sqrt(max(1.05 ** 2 - (z - 1.05) ** 2, 0.05))
        ring = C.cylinder(f"hut_ring{i}", (0.0, 0.0, z), ring_radius + 0.01, 0.05, segments=16)
        C.assign_material(ring, ring_mat)
        objs.append(ring)

    # 入口の掛け布ののれん。細い布を5枚垂らす
    for i in range(5):
        x = -0.32 + i * 0.16
        curtain = C.box(f"hut_curtain{i}", (x, 0.755, 0.42), (0.13, 0.02, 0.70), bevel=0.01)
        C.assign_material(curtain, cloth_mat)
        objs.append(curtain)

    # 軒先に下がる小さな風鈴。紐+小さな鈴
    cord = C.cylinder("hut_chime_cord", (0.62, 0.50, 1.42), 0.012, 0.22, segments=6)
    C.assign_material(cord, cord_mat)
    objs.append(cord)
    bell = C.cone("hut_chime_bell", (0.62, 0.50, 1.27), 0.055, 0.025, 0.10, segments=10)
    C.assign_material(bell, bell_mat)
    objs.append(bell)
    clapper = C.uv_sphere("hut_chime_clapper", (0.62, 0.50, 1.195), 0.016, segments=8, rings=6)
    C.assign_material(clapper, bell_mat)
    objs.append(clapper)

    return [C.join(objs, "house_hut")]


def build_house_storage():
    """
    モグラ婆の倉庫(design/village-buildings.md)。共通の造形言語の上に、
    横に長い平屋、壁沿いに伏せた古タルの列(倉庫の棚はすべて伏せたタルを
    転用したもの、という考証)、入口脇の手押し車で個性を出す。
    """
    wall_mat = C.make_material("storage_wall", HOUSE_WOOD, roughness=0.85)
    roof_mat = C.make_material("storage_roof", HOUSE_WOOD_DARK, roughness=0.88)
    plank_mat = C.make_material("storage_plank", (0.18, 0.12, 0.08), roughness=0.9)
    cart_wood_mat = C.make_material("storage_cart_wood", HOUSE_LOG, roughness=0.82)
    cart_iron_mat = C.make_material("storage_cart_iron", BARREL_IRON, roughness=0.45,
                                    metallic=0.65)

    objs = []

    # 横に長い平屋
    wall = C.box("storage_wall", (0.0, 0.0, 0.50), (2.40, 1.50, 1.00), bevel=0.05,
                bevel_segments=1)
    C.assign_material(wall, wall_mat)
    objs.append(wall)

    roof = C.cylinder("storage_roof", (0.0, 0.0, 1.35), 0.85, 2.75, segments=16, axis="X")
    C.assign_material(roof, roof_mat)
    objs.append(roof)

    for i, deg in enumerate((-45, -18, 10, 38)):
        rad = math.radians(deg)
        plank = C.box(f"storage_plank{i}", (0.0, 0.0, 0.0), (2.74, 0.04, 0.02))
        plank.rotation_euler = (rad, 0.0, 0.0)
        plank.location = Vector((0.0, math.sin(rad) * 0.86, 1.35 + math.cos(rad) * 0.86))
        C.assign_material(plank, plank_mat)
        objs.append(plank)

    # 壁沿いに伏せた古タルの列。倉庫の棚はすべて伏せたタルを転用したもの
    for i in range(4):
        x = -1.05 + i * 0.70
        barrel_objs = barrel_body(f"storage_oldbarrel{i}", BARREL_WOOD_DARK, BARREL_IRON,
                                   height=0.50, radius=0.235)
        for piece in barrel_objs:
            piece.rotation_euler = (0.0, math.radians(90.0), 0.0)
            piece.location = Vector((x, -0.62, 0.30))
        objs.extend(barrel_objs)

    # 入口脇の手押し車。2輪+荷台+柄
    bed = C.box("storage_cart_bed", (1.15, 0.85, 0.30), (0.42, 0.30, 0.05), bevel=0.01)
    C.assign_material(bed, cart_wood_mat)
    objs.append(bed)
    for side in (-1.0, 1.0):
        rail = C.box(f"storage_cart_rail{side}", (1.15, 0.85 + side * 0.155, 0.36),
                     (0.42, 0.025, 0.09))
        C.assign_material(rail, cart_wood_mat)
        objs.append(rail)
    wheel = C.cylinder("storage_cart_wheel", (0.0, 0.0, 0.0), 0.13, 0.045, segments=14,
                       axis="Y")
    wheel.location = Vector((1.15, 0.85, 0.14))
    C.assign_material(wheel, cart_iron_mat)
    objs.append(wheel)
    for side in (-1.0, 1.0):
        handle = C.cylinder(f"storage_cart_handle{side}", (0.0, 0.0, 0.0), 0.018, 0.55,
                            segments=8)
        handle.rotation_euler = (math.radians(60.0), 0.0, 0.0)
        handle.location = Vector((1.15 + side * 0.16, 1.20, 0.42))
        C.assign_material(handle, cart_wood_mat)
        objs.append(handle)

    return [C.join(objs, "house_storage")]


def build_house_garudo():
    """
    ガルドの家(design/village-buildings.md「ガルドの家」)。共通の造形言語の
    上に、村で一番小さい建物寸法、戸口から見える土間の支度タル、壁に
    残る歴代樽守りの手形の跡で個性を出す。
    """
    wall_mat = C.make_material("garudo_wall", HOUSE_WOOD, roughness=0.85)
    roof_mat = C.make_material("garudo_roof", HOUSE_WOOD_DARK, roughness=0.88)
    plank_mat = C.make_material("garudo_plank", (0.18, 0.12, 0.08), roughness=0.9)
    door_mat = C.make_material("garudo_door", (0.10, 0.08, 0.07), roughness=0.95)
    handprint_mat = C.make_material("garudo_handprint", (0.66, 0.50, 0.32), roughness=0.8)

    objs = []

    # 村で一番小さい建物寸法
    wall = C.box("garudo_wall", (0.0, 0.0, 0.425), (1.20, 1.20, 0.85), bevel=0.05,
                bevel_segments=1)
    C.assign_material(wall, wall_mat)
    objs.append(wall)

    roof = C.cylinder("garudo_roof", (0.0, 0.0, 1.22), 0.62, 1.35, segments=16, axis="X")
    C.assign_material(roof, roof_mat)
    objs.append(roof)

    for i, deg in enumerate((-40, 0, 40)):
        rad = math.radians(deg)
        plank = C.box(f"garudo_plank{i}", (0.0, 0.0, 0.0), (1.34, 0.035, 0.018))
        plank.rotation_euler = (rad, 0.0, 0.0)
        plank.location = Vector((0.0, math.sin(rad) * 0.63, 1.22 + math.cos(rad) * 0.63))
        C.assign_material(plank, plank_mat)
        objs.append(plank)

    # 戸口。土間の支度タルが外から見えるよう、扉は作らず暗い開口だけにする
    doorway = C.box("garudo_doorway", (0.0, 0.595, 0.32), (0.38, 0.03, 0.62), bevel=0.01)
    C.assign_material(doorway, door_mat)
    objs.append(doorway)

    # 戸口の奥にちらりと見える、支度用の小さなタル
    prep_barrel_objs = barrel_body("garudo_prepbarrel", BARREL_WOOD, BARREL_IRON,
                                    height=0.34, radius=0.16)
    for piece in prep_barrel_objs:
        piece.location = Vector((0.0, 0.50, 0.0))
    objs.extend(prep_barrel_objs)

    # 壁に残る歴代樽守りの手形の跡(側面。手のひら1つ+指5本)
    palm = C.cylinder("garudo_palm", (0.0, 0.0, 0.0), 0.05, 0.012, segments=10, axis="X")
    palm.location = Vector((0.605, -0.28, 0.55))
    C.assign_material(palm, handprint_mat)
    objs.append(palm)
    for i, (fx, fz) in enumerate((
        (-0.045, 0.075), (-0.018, 0.09), (0.012, 0.09), (0.040, 0.078), (0.062, 0.045),
    )):
        finger = C.cylinder(f"garudo_finger{i}", (0.0, 0.0, 0.0), 0.017, 0.010, segments=8,
                            axis="X")
        finger.location = Vector((0.605, -0.28 + fx, 0.55 + fz))
        C.assign_material(finger, handprint_mat)
        objs.append(finger)

    return [C.join(objs, "house_garudo")]


def build_house_compendium():
    """
    おキヨの図鑑小屋(design/village-buildings.md「おキヨの図鑑小屋」)。
    共通の造形言語の上に、屋根の天窓と、壁の外に鈴なりに掛かる木札
    (design記述の「記録はタルの側板に焼き付けた木札に書く」を反映)で
    個性を出す。
    """
    wall_mat = C.make_material("compendium_wall", HOUSE_WOOD, roughness=0.85)
    roof_mat = C.make_material("compendium_roof", HOUSE_WOOD_DARK, roughness=0.88)
    plank_mat = C.make_material("compendium_plank", (0.18, 0.12, 0.08), roughness=0.9)
    skylight_frame_mat = C.make_material("compendium_skylight_frame", HOUSE_LOG, roughness=0.8)
    skylight_glass_mat = C.make_material("compendium_skylight_glass", (0.72, 0.80, 0.82),
                                         roughness=0.15, emission=0.15)
    tag_mat = C.make_material("compendium_tag", HOUSE_WOOD, roughness=0.8)
    cord_mat = C.make_material("compendium_cord", (0.22, 0.18, 0.12), roughness=0.85)

    objs = []

    wall = C.box("compendium_wall", (0.0, 0.0, 0.50), (1.50, 1.50, 1.00), bevel=0.05,
                bevel_segments=1)
    C.assign_material(wall, wall_mat)
    objs.append(wall)

    roof = C.cylinder("compendium_roof", (0.0, 0.0, 1.35), 0.85, 1.75, segments=16, axis="X")
    C.assign_material(roof, roof_mat)
    objs.append(roof)

    for i, deg in enumerate((-48, -20, 20, 48)):
        rad = math.radians(deg)
        plank = C.box(f"compendium_plank{i}", (0.0, 0.0, 0.0), (1.74, 0.04, 0.02))
        plank.rotation_euler = (rad, 0.0, 0.0)
        plank.location = Vector((0.0, math.sin(rad) * 0.86, 1.35 + math.cos(rad) * 0.86))
        C.assign_material(plank, plank_mat)
        objs.append(plank)

    # 屋根の天窓。稜線に開けた小さな明かり取り
    skylight_frame = C.box("compendium_skylight_frame", (0.0, 0.0, 2.19), (0.34, 0.30, 0.08),
                           bevel=0.01)
    C.assign_material(skylight_frame, skylight_frame_mat)
    objs.append(skylight_frame)
    skylight_glass = C.box("compendium_skylight_glass", (0.0, 0.0, 2.235), (0.26, 0.22, 0.02))
    C.assign_material(skylight_glass, skylight_glass_mat)
    objs.append(skylight_glass)

    # 壁の外に鈴なりに掛かる木札。長さの違う紐で高さをばらけさせる
    tag_offsets = ((-0.55, 0.30), (-0.38, 0.42), (-0.20, 0.24), (-0.02, 0.46),
                   (0.16, 0.28), (0.34, 0.40), (0.52, 0.26))
    for i, (x, cord_len) in enumerate(tag_offsets):
        cord_top_z = 1.02
        cord = C.cylinder(f"compendium_tagcord{i}", (0.0, 0.0, 0.0), 0.008, cord_len,
                          segments=6)
        cord.location = Vector((x, 0.775, cord_top_z - cord_len / 2))
        C.assign_material(cord, cord_mat)
        objs.append(cord)
        tag = C.box(f"compendium_tag{i}", (x, 0.79, cord_top_z - cord_len - 0.045),
                    (0.10, 0.015, 0.09), bevel=0.005)
        C.assign_material(tag, tag_mat)
        objs.append(tag)

    return [C.join(objs, "house_compendium")]


def build_house_records():
    """
    記録の間(design/village-buildings.md「記録の間(イト)」)。共通の
    造形言語(飴色の木肌)の上に、丸屋根の村で唯一の切妻の直線的な
    屋根と、入口に掛けた巻物の看板で個性を出す。
    """
    wall_mat = C.make_material("records_wall", HOUSE_WOOD, roughness=0.85)
    roof_mat = C.make_material("records_roof", HOUSE_WOOD_DARK, roughness=0.88)
    fascia_mat = C.make_material("records_fascia", (0.18, 0.12, 0.08), roughness=0.9)
    scroll_rod_mat = C.make_material("records_scroll_rod", BARREL_IRON, roughness=0.5,
                                     metallic=0.6)
    scroll_paper_mat = C.make_material("records_scroll_paper", (0.78, 0.70, 0.52), roughness=0.7)

    objs = []

    wall = C.box("records_wall", (0.0, 0.0, 0.50), (1.50, 1.50, 1.00), bevel=0.05,
                bevel_segments=1)
    C.assign_material(wall, wall_mat)
    objs.append(wall)

    # 丸屋根の村で唯一の、几帳面な切妻屋根。2枚の板を稜線で合わせる
    slope_deg = 28.0
    rad = math.radians(slope_deg)
    half_run = 0.95
    slope_len = half_run / math.cos(rad)
    ridge_z = 1.00 + half_run * math.tan(rad)
    for i, side in enumerate((-1.0, 1.0)):
        panel = C.box(f"records_roofpanel{i}", (0.0, 0.0, 0.0), (1.70, slope_len, 0.05))
        panel.rotation_euler = (-side * rad, 0.0, 0.0)
        panel.location = Vector((0.0, side * (half_run / 2), 1.00 + (half_run / 2) * math.tan(rad)))
        C.assign_material(panel, roof_mat)
        objs.append(panel)

    ridge = C.box("records_ridge", (0.0, 0.0, ridge_z), (1.72, 0.10, 0.06), bevel=0.01)
    C.assign_material(ridge, fascia_mat)
    objs.append(ridge)

    # 軒先の水平な破風板。直線シルエットを際立たせる
    for side in (-1.0, 1.0):
        fascia = C.box(f"records_fascia{side}", (0.0, side * (half_run + 0.05), 1.00 - 0.02),
                       (1.72, 0.03, 0.10), bevel=0.005)
        C.assign_material(fascia, fascia_mat)
        objs.append(fascia)

    # 入口の巻物の看板。軸(鉄)+垂らした巻紙
    scroll_rod = C.cylinder("records_scroll_rod", (0.0, 0.0, 0.0), 0.028, 0.62, segments=10,
                            axis="X")
    scroll_rod.location = Vector((0.0, 0.79, 0.92))
    C.assign_material(scroll_rod, scroll_rod_mat)
    objs.append(scroll_rod)
    for side in (-1.0, 1.0):
        knob = C.uv_sphere(f"records_scroll_knob{side}", (0.0, 0.0, 0.0), 0.042, segments=10,
                           rings=8)
        knob.location = Vector((side * 0.31, 0.79, 0.92))
        C.assign_material(knob, scroll_rod_mat)
        objs.append(knob)
    scroll_paper = C.box("records_scroll_paper", (0.0, 0.775, 0.60), (0.50, 0.015, 0.62),
                         bevel=0.005)
    C.assign_material(scroll_paper, scroll_paper_mat)
    objs.append(scroll_paper)

    return [C.join(objs, "house_records")]


def build_house_development():
    """
    村の発展の受付(design/village-buildings.md、plan/game/village-scene-redesign.md)。
    他の棟と違い壁を持たない、柱4本+陣幕の屋根なし東屋。中央の村の
    模型台(小さな模型小屋を並べた台)で個性を出す。
    """
    post_mat = C.make_material("development_post", HOUSE_LOG, roughness=0.82)
    curtain_light = C.make_material("development_curtain_light", (0.80, 0.78, 0.70),
                                    roughness=0.7)
    curtain_dark = C.make_material("development_curtain_dark", (0.30, 0.24, 0.42),
                                   roughness=0.7)
    stand_mat = C.make_material("development_stand", HOUSE_WOOD, roughness=0.85)
    model_wall_mat = C.make_material("development_model_wall", HOUSE_WOOD_DARK, roughness=0.85)
    model_roof_mat = C.make_material("development_model_roof", (0.20, 0.14, 0.09), roughness=0.9)

    objs = []

    # 柱4本(屋根はない、東屋)
    post_positions = ((-0.75, -0.75), (0.75, -0.75), (-0.75, 0.75), (0.75, 0.75))
    for i, (x, y) in enumerate(post_positions):
        post = C.cylinder(f"development_post{i}", (x, y, 0.75), 0.06, 1.50, segments=10)
        C.assign_material(post, post_mat)
        objs.append(post)

    # 柱の頭をつなぐ横木。屋根板は張らない
    for i, (dx, dy) in enumerate(((1, 0), (0, 1))):
        for side in (-1.0, 1.0):
            size = (1.62, 0.05, 0.05) if dx else (0.05, 1.62, 0.05)
            rail = C.box(f"development_rail{i}_{side}", (0.0, 0.0, 0.0), size)
            rail.location = Vector((0.0 if dx else side * 0.75, side * 0.75 if dx else 0.0, 1.48))
            C.assign_material(rail, post_mat)
            objs.append(rail)

    # 陣幕。奥側2面に張った縦縞の幕(前面と手前側面は開けたまま出入りできる)
    stripe_w = 0.185
    for wi in range(8):
        x = -0.70 + wi * stripe_w
        mat = curtain_light if wi % 2 == 0 else curtain_dark
        stripe = C.box(f"development_curtain_back{wi}", (x + stripe_w / 2, -0.78, 0.85),
                       (stripe_w, 0.02, 1.10))
        C.assign_material(stripe, mat)
        objs.append(stripe)
    for wi in range(8):
        y = -0.70 + wi * stripe_w
        mat = curtain_light if wi % 2 == 0 else curtain_dark
        stripe = C.box(f"development_curtain_side{wi}", (-0.78, y + stripe_w / 2, 0.85),
                       (0.02, stripe_w, 1.10))
        C.assign_material(stripe, mat)
        objs.append(stripe)

    # 中央の村の模型台。台+小さな模型小屋を数棟並べる
    stand = C.cylinder("development_stand", (0.0, 0.0, 0.22), 0.55, 0.44, segments=16)
    C.assign_material(stand, stand_mat)
    objs.append(stand)

    mini_huts = ((-0.20, -0.12, 0.028), (0.15, -0.05, 0.024), (-0.05, 0.20, 0.030),
                 (0.22, 0.15, 0.022))
    for i, (x, y, scale) in enumerate(mini_huts):
        s = scale / 0.028
        wall = C.box(f"development_minihut_wall{i}", (0.0, 0.0, 0.0),
                    (0.09 * s, 0.09 * s, 0.055 * s))
        wall.location = Vector((x, y, 0.44 + 0.0275 * s))
        C.assign_material(wall, model_wall_mat)
        objs.append(wall)
        roof = C.cone(f"development_minihut_roof{i}", (0.0, 0.0, 0.0), 0.075 * s, 0.0,
                     0.05 * s, segments=4)
        roof.rotation_euler = (0.0, 0.0, math.radians(45.0))
        roof.location = Vector((x, y, 0.44 + 0.055 * s + 0.025 * s))
        C.assign_material(roof, model_roof_mat)
        objs.append(roof)

    return [C.join(objs, "house_development")]


def build_prop_quest_board():
    """
    オトネの依頼板(design/village-buildings.md「オトネの依頼板」)。大タルの
    底板を並べた板壁+貼られた依頼札(数枚は裏返し=達成済み)。タルは
    木の裏表で色が違う、という考証を札の裏表の色差で表現する。
    """
    post_mat = C.make_material("questboard_post", HOUSE_LOG, roughness=0.82)
    plank_mat = C.make_material("questboard_plank", BARREL_WOOD, roughness=0.85)
    plank_dark_mat = C.make_material("questboard_plank_dark", BARREL_WOOD_DARK, roughness=0.85)
    tag_front_mat = C.make_material("questboard_tag_front", (0.86, 0.78, 0.58), roughness=0.7)
    tag_back_mat = C.make_material("questboard_tag_back", (0.36, 0.30, 0.22), roughness=0.75)

    objs = []

    for side in (-1.0, 1.0):
        post = C.cylinder(f"questboard_post{side}", (side * 0.72, 0.0, 0.55), 0.055, 1.10,
                          segments=10)
        C.assign_material(post, post_mat)
        objs.append(post)

    # 大タルの底板を並べた板壁。丸い底板を思わせるよう、幅の違う板を交互に並べる
    plank_widths = (0.24, 0.20, 0.26, 0.20, 0.24)
    x = -0.70
    for i, w in enumerate(plank_widths):
        mat = plank_mat if i % 2 == 0 else plank_dark_mat
        plank = C.box(f"questboard_plank{i}", (x + w / 2, 0.0, 0.95), (w, 0.06, 0.90),
                     bevel=0.015)
        C.assign_material(plank, mat)
        objs.append(plank)
        x += w

    # 依頼札。数枚を裏返しにして達成済みを示す
    tag_layout = ((-0.55, 1.25, False), (-0.25, 1.15, False), (0.05, 1.28, True),
                 (0.35, 1.10, False), (0.55, 1.30, True), (-0.40, 0.75, False),
                 (0.10, 0.72, True), (0.45, 0.78, False))
    for i, (tx, tz, flipped) in enumerate(tag_layout):
        tag = C.box(f"questboard_tag{i}", (tx, 0.035, tz), (0.16, 0.012, 0.13), bevel=0.005)
        C.assign_material(tag, tag_back_mat if flipped else tag_front_mat)
        objs.append(tag)

    return [C.join(objs, "prop_quest_board")]


def build_prop_signpost():
    """
    旅の看板(design/village-buildings.md「旅の看板」)。村の出入り口の
    古い立て札。タルの側板の再利用らしい、湾曲した板で作る。
    """
    post_mat = C.make_material("signpost_post", HOUSE_LOG, roughness=0.82)
    board_mat = C.make_material("signpost_board", BARREL_WOOD_DARK, roughness=0.85)
    nail_mat = C.make_material("signpost_nail", BARREL_IRON, roughness=0.5, metallic=0.6)

    objs = []

    post = C.cylinder("signpost_post", (0.0, 0.0, 0.62), 0.05, 1.24, segments=10)
    C.assign_material(post, post_mat)
    objs.append(post)

    # タルの側板を再利用した板。腹をふくらませて湾曲を出す
    board = C.box("signpost_board", (0.0, 0.0, 0.0), (0.62, 0.045, 0.42), bevel=0.02)
    for vert in board.data.vertices:
        t = vert.co.x / 0.31  # -1(左端) 〜 1(右端)
        bulge = 1.0 - 0.35 * (t * t)
        if vert.co.y > 0:
            vert.co.y += 0.022 * bulge
    board.location = Vector((0.0, 0.0, 1.10))
    C.assign_material(board, board_mat)
    objs.append(board)

    # 板を留める鋲
    for x in (-0.24, 0.24):
        for z in (1.24, 0.96):
            nail = C.uv_sphere(f"signpost_nail{x}_{z}", (0.0, 0.0, 0.0), 0.014, segments=8,
                               rings=6)
            nail.location = Vector((x, 0.045, z))
            C.assign_material(nail, nail_mat)
            objs.append(nail)

    return [C.join(objs, "prop_signpost")]


HOKORAGI_BARK = (0.42, 0.30, 0.19)
HOKORAGI_GRAIN = (0.22, 0.16, 0.10)
HOKORAGI_LEAF = (0.44, 0.48, 0.28)


def _hokoragi_roots(objs, bark_mat, count: int, root_len: float) -> None:
    """ひげ根が地表に張る根本。design/yorishiro-and-barrels.mdの
    「祠木はヨリシロのひげの根から生えた木」を反映し、地表を這う根で表す。"""
    for i in range(count):
        az = math.radians(i * (360.0 / count) + (7.0 if i % 2 else -5.0))
        root = C.cone(f"hokoragi_root{i}", (0.0, 0.0, 0.0), 0.055, 0.008, root_len, segments=6)
        root.rotation_euler = (math.radians(80.0), 0.0, az)
        root.location = Vector((math.cos(az) * 0.10, math.sin(az) * 0.10, 0.05))
        C.assign_material(root, bark_mat)
        objs.append(root)


def _hokoragi_grain_swirl(objs, grain_mat, trunk_r0: float, trunk_r1: float,
                          trunk_h: float, turns: int) -> None:
    """幹の木目が渦を巻く、というdesignの記述を、幹を螺旋状に登る木目の
    節でそれらしく見せる(design/yorishiro-and-barrels.mdの「年輪が渦を巻く」)。"""
    for i in range(turns):
        t = i / (turns - 1)
        z = 0.30 + t * (trunk_h - 0.55)
        r = trunk_r0 + (trunk_r1 - trunk_r0) * (z / trunk_h) + 0.01
        az = math.radians(i * 78.0)
        mark = C.box(f"hokoragi_grain{i}", (0.0, 0.0, 0.0), (0.16, 0.03, 0.028), bevel=0.008)
        mark.rotation_euler = (0.0, 0.0, az + math.radians(90.0))
        mark.location = Vector((math.cos(az) * r, math.sin(az) * r, z))
        C.assign_material(mark, grain_mat)
        objs.append(mark)


def build_prop_hokoragi_a():
    """
    祠木バリエーション1(design/models/model-village-structures.mdの
    propHokoragi)。ひげ根が地表に張り、幹の木目が渦を巻く低ポリ樹木。
    """
    bark_mat = C.make_material("hokoragi_a_bark", HOKORAGI_BARK, roughness=0.88)
    grain_mat = C.make_material("hokoragi_a_grain", HOKORAGI_GRAIN, roughness=0.9)
    leaf_mat = C.make_material("hokoragi_a_leaf", HOKORAGI_LEAF, roughness=0.85)

    objs = []
    trunk_h = 2.20
    trunk_r0, trunk_r1 = 0.22, 0.10
    _hokoragi_roots(objs, bark_mat, 6, 0.55)

    trunk = C.cone("hokoragi_a_trunk", (0.0, 0.0, trunk_h / 2), trunk_r0, trunk_r1, trunk_h,
                   segments=10)
    C.assign_material(trunk, bark_mat)
    objs.append(trunk)

    _hokoragi_grain_swirl(objs, grain_mat, trunk_r0, trunk_r1, trunk_h, 5)

    # 低ポリの樹冠。大きさの違う塊を3つ寄せて葉叢を表す
    for i, (x, y, z, r) in enumerate(((0.0, 0.0, 2.55, 0.55), (0.30, 0.12, 2.75, 0.38),
                                      (-0.28, -0.15, 2.68, 0.40))):
        canopy = C.uv_sphere(f"hokoragi_a_canopy{i}", (x, y, z), r, segments=8, rings=6,
                             scale=(1.0, 1.0, 0.85))
        C.assign_material(canopy, leaf_mat)
        objs.append(canopy)

    return [C.join(objs, "prop_hokoragi_a")]


def build_prop_hokoragi_b():
    """
    祠木バリエーション2。バリエーション1より背が高く樹冠が細く、
    シルエットで見分けがつくようにする。
    """
    bark_mat = C.make_material("hokoragi_b_bark", HOKORAGI_BARK, roughness=0.88)
    grain_mat = C.make_material("hokoragi_b_grain", HOKORAGI_GRAIN, roughness=0.9)
    leaf_mat = C.make_material("hokoragi_b_leaf", HOKORAGI_LEAF, roughness=0.85)

    objs = []
    trunk_h = 2.75
    trunk_r0, trunk_r1 = 0.18, 0.07
    _hokoragi_roots(objs, bark_mat, 5, 0.42)

    trunk = C.cone("hokoragi_b_trunk", (0.0, 0.0, trunk_h / 2), trunk_r0, trunk_r1, trunk_h,
                   segments=10)
    C.assign_material(trunk, bark_mat)
    objs.append(trunk)

    _hokoragi_grain_swirl(objs, grain_mat, trunk_r0, trunk_r1, trunk_h, 6)

    for i, (x, y, z, r) in enumerate(((0.0, 0.0, 3.05, 0.34), (0.18, -0.10, 3.30, 0.24),
                                      (-0.16, 0.14, 3.42, 0.22))):
        canopy = C.uv_sphere(f"hokoragi_b_canopy{i}", (x, y, z), r, segments=8, rings=6,
                             scale=(1.0, 1.0, 0.9))
        C.assign_material(canopy, leaf_mat)
        objs.append(canopy)

    return [C.join(objs, "prop_hokoragi_b")]


def build_prop_hokoragi_stump():
    """
    渦の切り株。design/village-buildings.mdの祠木の伐採(ゲンドの工房)を
    裏付ける残り株で、切り口に渦を巻く年輪を刻む。
    """
    bark_mat = C.make_material("hokoragi_stump_bark", HOKORAGI_BARK, roughness=0.88)
    grain_mat = C.make_material("hokoragi_stump_grain", HOKORAGI_GRAIN, roughness=0.9)
    ring_mat = C.make_material("hokoragi_stump_ring", (0.30, 0.21, 0.13), roughness=0.8)

    objs = []
    stump_h = 0.46
    r0, r1 = 0.26, 0.24
    _hokoragi_roots(objs, bark_mat, 5, 0.40)

    stump = C.cone("hokoragi_stump_trunk", (0.0, 0.0, stump_h / 2), r0, r1, stump_h, segments=12)
    C.assign_material(stump, bark_mat)
    objs.append(stump)

    _hokoragi_grain_swirl(objs, grain_mat, r0, r1, stump_h, 3)

    # 切り口の渦を巻く年輪。半径の違う薄い輪を重ねて同心円状に見せる
    for i, r in enumerate((0.20, 0.14, 0.08)):
        ring = C.cylinder(f"hokoragi_stump_ring{i}", (0.0, 0.0, stump_h + 0.006 * i), r, 0.012,
                          segments=16)
        C.assign_material(ring, ring_mat)
        objs.append(ring)

    return [C.join(objs, "prop_hokoragi_stump")]


def build_prop_barrel_bed():
    """
    ねむり小屋のタルの寝床(design/village-buildings.md「ねむり小屋の
    タルの寝床」、plan/models/archive/model-village-structures.mdのpropBarrelBed)。
    横倒しのタル+掛け布+名札。`src/view/villageInterior.ts`の内装から
    使う(内装用の専用モデル)。
    """
    wood_mat = C.make_material("barrelbed_wood", BARREL_WOOD_DARK, roughness=0.85)
    iron_mat = C.make_material("barrelbed_iron", BARREL_IRON, roughness=0.45, metallic=0.7)
    cloth_mat = C.make_material("barrelbed_cloth", (0.30, 0.28, 0.44), roughness=0.8)
    tag_mat = C.make_material("barrelbed_tag", (0.80, 0.72, 0.52), roughness=0.75)
    cord_mat = C.make_material("barrelbed_cord", (0.22, 0.18, 0.12), roughness=0.85)

    objs = []
    height, radius = 0.62, 0.29

    # 横倒しのタル。胴・鉄輪は原点で組んでから90度倒して配置する
    # (胴・鉄輪はタルの底が原点に来るよう組まれているので、この順で
    # 倒すと底を軸に転がした位置関係のまま横たわる)
    barrel_objs = barrel_body("barrelbed", BARREL_WOOD_DARK, BARREL_IRON, height=height,
                               radius=radius)
    for piece in barrel_objs:
        piece.rotation_euler = (0.0, math.radians(90.0), 0.0)
        piece.location = Vector((0.0, 0.0, radius + 0.04))
    objs.extend(barrel_objs)

    # 掛け布。タルの丸みに沿って端を垂らす
    cloth = C.box("barrelbed_cloth", (0.0, 0.0, 0.0), (height * 0.86, radius * 2.3, 0.05),
                 bevel=0.02)
    for vert in cloth.data.vertices:
        t = vert.co.y / (radius * 1.15)
        vert.co.z -= 0.11 * (t * t)
    cloth.location = Vector((0.0, 0.0, radius * 2 + 0.02))
    C.assign_material(cloth, cloth_mat)
    objs.append(cloth)

    # 名札。端の鉄輪から紐で下げる
    cord = C.cylinder("barrelbed_cord", (0.0, 0.0, 0.0), 0.010, 0.14, segments=6)
    cord.location = Vector((height / 2 - 0.06, radius + 0.03, radius * 1.7))
    C.assign_material(cord, cord_mat)
    objs.append(cord)
    tag = C.box("barrelbed_tag", (0.0, 0.0, 0.0), (0.14, 0.01, 0.11), bevel=0.005)
    tag.location = Vector((height / 2 - 0.06, radius + 0.03, radius * 1.7 - 0.11))
    C.assign_material(tag, tag_mat)
    objs.append(tag)

    return [C.join(objs, "prop_barrel_bed")]


def build_prop_shelf_barrel():
    """
    古タル転用の棚(design/village-buildings.md「倉庫の棚はすべて伏せた
    タルを転用したもの」、plan/models/archive/model-village-structures.mdの
    propShelfBarrel)。棚板を大タルの底板(円い板)に見立てる。
    `src/view/villageInterior.ts`の内装から使う(内装用の専用モデル)。
    """
    post_mat = C.make_material("shelfbarrel_post", HOUSE_LOG, roughness=0.82)
    disk_light_mat = C.make_material("shelfbarrel_disk_light", BARREL_WOOD, roughness=0.85)
    disk_dark_mat = C.make_material("shelfbarrel_disk_dark", BARREL_WOOD_DARK, roughness=0.85)

    objs = []
    width, height = 1.10, 1.30

    for side in (-1.0, 1.0):
        post = C.cylinder(f"shelfbarrel_post{side}", (side * width / 2, 0.0, height / 2), 0.045,
                          height, segments=10)
        C.assign_material(post, post_mat)
        objs.append(post)

    # 棚板は大タルの底板(円い板)に見立てて並べる。2段
    for level, z in enumerate((0.46, 0.98)):
        disk_r = 0.235
        for i, x in enumerate((-width / 2 + disk_r * 0.9, 0.0, width / 2 - disk_r * 0.9)):
            mat = disk_light_mat if (level + i) % 2 == 0 else disk_dark_mat
            disk = C.cylinder(f"shelfbarrel_disk{level}_{i}", (x, 0.0, z), disk_r, 0.03,
                              segments=14)
            C.assign_material(disk, mat)
            objs.append(disk)

    return [C.join(objs, "prop_shelf_barrel")]


# --------------------------------------------------------------------------- 一覧

PROPS = {
    "wall": build_wall,
    "barrel": build_barrel,
    "barrel_bomb": build_barrel_bomb,
    "barrel_caught": build_barrel_caught,
    "floor": build_floor,
    "stairs": build_stairs,
    "wall_region1_v1": build_wall_region1_v1,
    "wall_region1_v2": build_wall_region1_v2,
    "wall_region1_v3": build_wall_region1_v3,
    "floor_region1_v1": build_floor_region1_v1,
    "floor_region1_v2": build_floor_region1_v2,
    "floor_region1_v3": build_floor_region1_v3,
    "stairs_region1": build_stairs_region1,
    "wall_region2_v1": build_wall_region2_v1,
    "wall_region2_v2": build_wall_region2_v2,
    "wall_region2_v3": build_wall_region2_v3,
    "floor_region2_v1": build_floor_region2_v1,
    "floor_region2_v2": build_floor_region2_v2,
    "floor_region2_v3": build_floor_region2_v3,
    "stairs_region2": build_stairs_region2,
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
    "cave_gate": build_cave_gate,
    "bonfire": build_bonfire,
    "house_workshop": build_house_workshop,
    "house_hut": build_house_hut,
    "house_storage": build_house_storage,
    "house_garudo": build_house_garudo,
    "house_compendium": build_house_compendium,
    "house_records": build_house_records,
    "house_development": build_house_development,
    "prop_quest_board": build_prop_quest_board,
    "prop_signpost": build_prop_signpost,
    "prop_hokoragi_a": build_prop_hokoragi_a,
    "prop_hokoragi_b": build_prop_hokoragi_b,
    "prop_hokoragi_stump": build_prop_hokoragi_stump,
    "prop_barrel_bed": build_prop_barrel_bed,
    "prop_shelf_barrel": build_prop_shelf_barrel,
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
