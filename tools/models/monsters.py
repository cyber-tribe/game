"""
モンスター5種。名前・造形ともにオリジナル。

いずれも「関節と太さ」を定義して Skin モディファイアで皮を張り、
サブディビジョンで丸めた一枚のメッシュとして作る。目や角のような小さな飾りだけ
別メッシュで足して統合している。

Blender では -Y が正面。glTF に書き出すと +Z 正面になる。
"""

from __future__ import annotations

import math

import common as C
from mathutils import Vector

EYE_DARK = (0.07, 0.06, 0.09)
EYE_WHITE = (0.95, 0.95, 0.92)


def eyeball(name: str, center, radius: float, look=(0.0, -1.0, 0.0),
            white=EYE_WHITE, dark=EYE_DARK, squash=1.0) -> list:
    """白目と瞳を1組作る。look は瞳を寄せる向き。"""
    c = Vector(center)
    direction = Vector(look).normalized()
    w = C.uv_sphere(f"{name}_w", c, radius, segments=16, rings=12,
                    scale=(1.0, 1.0, squash))
    C.assign_material(w, C.make_material(f"{name}_wm", white, roughness=0.28))
    p = C.uv_sphere(f"{name}_p", c + direction * radius * 0.62, radius * 0.52,
                    segments=14, rings=10)
    C.assign_material(p, C.make_material(f"{name}_pm", dark, roughness=0.2))
    return [w, p]


# =========================================================================== ぷるん

PURUN_JOINTS = {
    "base": (0.0, 0.0, 0.08),
    "mid": (0.0, 0.0, 0.20),
    "top": (0.0, 0.0, 0.33),
}
PURUN_RADII = {"base": 0.29, "mid": 0.25, "top": 0.09}
PURUN_BONES = [("base", "mid"), ("mid", "top")]


def build_purun():
    """
    粘体。上に向かってすぼまる雫形にして、下端を床で潰したような形にする。
    骨は縦に2本だけ。潰し伸ばしと跳ねる動きはこの2本で足りる。
    """
    body = C.build_skinned("purun", PURUN_JOINTS, PURUN_BONES, PURUN_RADII,
                           root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す
    for vert in body.data.vertices:
        if vert.co.z < 0.02:
            vert.co.z = 0.02 - (0.02 - vert.co.z) * 0.25
    C.assign_material(body, C.make_material("purun_body", (0.30, 0.62, 0.85),
                                            roughness=0.18, metallic=0.0))

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"purun_eye{side}", (0.085 * side, -0.196, 0.258), 0.054,
                          look=(0.15 * side, -1.0, 0.0))
    # 口
    mouth = C.uv_sphere("purun_mouth", (0.0, -0.228, 0.158), 0.048,
                        segments=14, rings=10, scale=(1.5, 0.5, 0.65))
    C.assign_material(mouth, C.make_material("purun_mouth_m", (0.10, 0.22, 0.34), roughness=0.3))
    extras.append(mouth)

    mesh = C.join([body] + extras, "purun")
    armature = C.build_armature("purun", C.mirrored(PURUN_JOINTS), PURUN_BONES, mesh, root="base")
    return [mesh, armature], armature


def purun_animations():
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        ("idle", [
            (1, {lower: neutral}),
            (16, {lower: {"scale": (1.06, 0.92, 1.06)}}),
            (32, {lower: neutral}),
        ]),
        # 縮んでから跳ね上がり、着地でまた潰れる
        ("walk", [
            (1, {lower: neutral}),
            (4, {lower: squash}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}}),
            (20, {lower: neutral}),
        ]),
        ("attack", [
            (1, {lower: neutral}),
            (4, {lower: squash}),
            (9, {lower: {"scale": (0.8, 1.35, 0.8), "loc": (0, 0.06, 0)}, upper: (-18, 0, 0)}),
            (18, {lower: neutral}),
        ]),
        ("hit", [
            (1, {lower: neutral}),
            (4, {lower: {"scale": (1.3, 0.66, 1.3)}, upper: (16, 0, 0)}),
            (14, {lower: neutral}),
        ]),
        ("die", [
            (1, {lower: neutral}),
            (10, {lower: {"scale": (1.35, 0.5, 1.35)}}),
            (24, {lower: {"scale": (1.5, 0.06, 1.5)}}),
        ]),
    ]


# ======================================================================= あくびとかげ

AKUBI_JOINTS = {
    "base": (0.0, 0.0, 0.050),
    "mid": (0.0, -0.010, 0.170),
    "top": (0.0, -0.045, 0.290),
}
AKUBI_RADII = {"base": 0.125, "mid": 0.078, "top": 0.026}
AKUBI_BONES = [("base", "mid"), ("mid", "top")]


def build_akubitokage():
    """
    ヨリシロのあくびの合間に紛れ込んだ影。ぷるんと同じ縦2本の骨組みを
    そのまま流用するが、ひとまわり小さく華奢にし、上へ行くほど後ろへ
    反らせることで、ぷるんの垂直な雫形とは違う、いまにも飛び退きそうな
    軽いシルエットにする。
    """
    body = C.build_skinned("akubitokage", AKUBI_JOINTS, AKUBI_BONES, AKUBI_RADII,
                           root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す(ぷるんと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.012:
            vert.co.z = 0.012 - (0.012 - vert.co.z) * 0.25

    shadow = C.make_material("akubi_shadow", (0.34, 0.28, 0.21), roughness=0.5)
    dust = C.make_material("akubi_dust", (0.74, 0.66, 0.52), roughness=0.45)
    # 根元は影らしく暗く、上へ行くほど参道の土埃に紛れる淡い色へ抜けさせる
    C.assign_materials_by_region(body, [shadow, dust], lambda c: 1 if c.z > 0.15 else 0)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"akubi_eye{side}", (0.026 * side, -0.062, 0.238), 0.018,
                          look=(0.2 * side, -1.0, 0.05))
    # あくびの名残で、閉じきらず開いたままの口
    mouth = C.uv_sphere("akubi_mouth", (0.0, -0.075, 0.198), 0.024,
                        segments=14, rings=10, scale=(0.85, 0.55, 1.25))
    C.assign_material(mouth, C.make_material("akubi_mouth_m", (0.20, 0.15, 0.13), roughness=0.35))
    extras.append(mouth)

    mesh = C.join([body] + extras, "akubitokage")
    armature = C.build_armature("akubitokage", C.mirrored(AKUBI_JOINTS), AKUBI_BONES, mesh, root="base")
    return [mesh, armature], armature


def akubitokage_animations():
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.28, 0.62, 1.28)}
    stretch = {"scale": (0.78, 1.36, 0.78)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 影らしく、常にそわそわと落ち着かない
        ("idle", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (10, {lower: {"scale": (1.08, 0.90, 1.08)}, upper: (6, 0, 0)}),
            (20, {lower: neutral, upper: (-4, 0, 0)}),
            (28, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # ぷるんより素早く、跳ねるように逃げ足を刻む
        ("walk", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (3, {lower: squash, upper: (10, 0, 0)}),
            (7, {lower: {**stretch, "loc": (0, 0.09, 0)}, upper: (-14, 0, 0)}),
            (11, {lower: {"scale": (1.12, 0.82, 1.12)}, upper: (4, 0, 0)}),
            (15, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        ("attack", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (3, {lower: squash, upper: (12, 0, 0)}),
            (7, {lower: {"scale": (0.76, 1.4, 0.76)}, upper: (-22, 0, 0)}),
            (14, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # 触れられるとすぐ後ろへ跳び退く
        ("hit", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (3, {lower: {"scale": (1.3, 0.6, 1.3), "loc": (0, 0.08, 0)}, upper: (24, 0, 0)}),
            (11, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # 影が薄れて土埃に紛れて消える
        ("die", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (9, {lower: {"scale": (1.3, 0.42, 1.3)}, upper: (10, 0, 0)}),
            (22, {lower: {"scale": (1.4, 0.04, 1.4)}, upper: (0, 0, 0)}),
        ]),
    ]


# =================================================================== ガジリねずみ

GAJIRI_HALF = {
    "hip": (0.0, 0.15, 0.20),
    "chest": (0.0, -0.02, 0.21),
    "neck": (0.0, -0.15, 0.19),
    "snout": (0.0, -0.32, 0.13),
    "tail1": (0.0, 0.28, 0.19),
    "tail2": (0.0, 0.42, 0.24),
    "tail3": (0.0, 0.52, 0.32),
    "ear.L": (0.10, -0.15, 0.34),
    "hipF.L": (0.09, -0.06, 0.14),
    "footF.L": (0.10, -0.10, 0.025),
    "hipB.L": (0.11, 0.13, 0.15),
    "footB.L": (0.12, 0.16, 0.025),
}
GAJIRI_RADII_HALF = {
    "hip": 0.135, "chest": 0.145, "neck": 0.105, "snout": 0.040,
    "tail1": 0.032, "tail2": 0.024, "tail3": 0.014,
    "ear.L": 0.058,
    "hipF.L": 0.040, "footF.L": 0.034,
    "hipB.L": 0.052, "footB.L": 0.036,
}
GAJIRI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_gajiri():
    """四つ足のねずみ。長い尻尾と大きな耳で、小さくても種類が分かるようにする。"""
    joints = C.mirrored(GAJIRI_HALF)
    radii = C.mirrored_radii(GAJIRI_RADII_HALF)
    bones = C.mirrored_bones(GAJIRI_BONES_HALF)

    body = C.build_skinned("gajiri", joints, bones, radii, root="chest", subsurf=2)
    fur = C.make_material("gajiri_fur", (0.52, 0.42, 0.34), roughness=0.85)
    ear_in = C.make_material("gajiri_ear", (0.72, 0.48, 0.46), roughness=0.8)

    # 耳だけを内側の色にする。高さで切ると背中まで巻き込むので、
    # 耳の関節からの距離で判定する
    ears = [Vector(joints["ear.L"]), Vector(joints["ear.R"])]
    C.assign_materials_by_region(
        body, [fur, ear_in],
        lambda c: 1 if min((c - e).length for e in ears) < 0.072 else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"gajiri_eye{side}", (0.062 * side, -0.215, 0.215), 0.040,
                          look=(0.3 * side, -1.0, 0.1))
    nose = C.uv_sphere("gajiri_nose", (0.0, -0.352, 0.125), 0.026, segments=12, rings=8)
    C.assign_material(nose, C.make_material("gajiri_nose_m", (0.85, 0.45, 0.48), roughness=0.4))
    extras.append(nose)
    # 前歯
    teeth = C.box("gajiri_teeth", (0.0, -0.330, 0.082), (0.046, 0.024, 0.044), bevel=0.006)
    C.assign_material(teeth, C.make_material("gajiri_teeth_m", (0.95, 0.93, 0.84), roughness=0.35))
    extras.append(teeth)

    mesh = C.join([body] + extras, "gajiri")
    armature = C.build_armature("gajiri", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def gajiri_animations():
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        ("idle", [
            (1, {t1: (0, 0, 0), neck: (0, 0, 0)}),
            (14, {t1: (0, 0, 16), neck: (-4, 0, 0), snout: (5, 0, 0)}),
            (28, {t1: (0, 0, -16), neck: (0, 0, 0)}),
            (42, {t1: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {fL: (30, 0, 0), fR: (-30, 0, 0), bL: (-28, 0, 0), bR: (28, 0, 0), t1: (0, 0, 12)}),
            (6, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (11, {fL: (-30, 0, 0), fR: (30, 0, 0), bL: (28, 0, 0), bR: (-28, 0, 0), t1: (0, 0, -12)}),
            (16, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (21, {fL: (30, 0, 0), fR: (-30, 0, 0), bL: (-28, 0, 0), bR: (28, 0, 0), t1: (0, 0, 12)}),
        ]),
        ("attack", [
            (1, {neck: (0, 0, 0), snout: (0, 0, 0)}),
            (4, {neck: (22, 0, 0), snout: (14, 0, 0), t2: (0, 0, 20)}),
            (9, {neck: (-34, 0, 0), snout: (-20, 0, 0), t2: (0, 0, -14)}),
            (18, {neck: (0, 0, 0), snout: (0, 0, 0), t2: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (26, 0, 0), t1: (0, 0, 24), snout: (12, 0, 0)}),
            (14, {neck: (0, 0, 0), t1: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {neck: (0, 0, 0)}),
            (9, {neck: (30, 0, 0), fL: (-50, 0, 0), fR: (-50, 0, 0)}),
            (24, {neck: (10, 0, 0), fL: (-90, 0, 0), fR: (-90, 0, 0),
                  bL: (-70, 0, 0), bR: (-70, 0, 0), t1: (0, 0, 40)}),
        ]),
    ]


# =================================================================== ツブテガエル

TSUBUTE_HALF = {
    "hip": (0.0, 0.10, 0.17),
    "chest": (0.0, -0.05, 0.19),
    "head": (0.0, -0.20, 0.18),
    "armF.L": (0.14, -0.14, 0.09),
    "handF.L": (0.16, -0.20, 0.02),
    "kneeB.L": (0.19, 0.10, 0.19),
    "ankleB.L": (0.17, -0.04, 0.06),
    "footB.L": (0.16, -0.14, 0.022),
}
TSUBUTE_RADII_HALF = {
    "hip": 0.165, "chest": 0.175, "head": 0.145,
    "armF.L": 0.038, "handF.L": 0.042,
    "kneeB.L": 0.075, "ankleB.L": 0.050, "footB.L": 0.045,
}
TSUBUTE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_tsubute():
    """ずんぐりした蛙。大きく張り出した後ろ足と、頭の上に飛び出した目が特徴。"""
    joints = C.mirrored(TSUBUTE_HALF)
    radii = C.mirrored_radii(TSUBUTE_RADII_HALF)
    bones = C.mirrored_bones(TSUBUTE_BONES_HALF)

    body = C.build_skinned("tsubute", joints, bones, radii, root="chest", subsurf=2)
    back = C.make_material("tsubute_back", (0.36, 0.56, 0.26), roughness=0.55)
    belly = C.make_material("tsubute_belly", (0.82, 0.80, 0.55), roughness=0.6)
    # 腹は下から見上げたときだけ見えるよう、真下を向いた面に限る。
    # 高さだけで切ると横腹に水平の線が入って不自然になる。
    C.assign_materials_by_region(
        body, [back, belly],
        lambda c: 1 if (c.z < 0.105 and abs(c.x) < 0.14) else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        # 目は頭の上に半分飛び出させる
        extras += eyeball(f"tsubute_eye{side}", (0.088 * side, -0.215, 0.278), 0.062,
                          look=(0.25 * side, -0.8, 0.25))
    mouth = C.box("tsubute_mouth", (0.0, -0.300, 0.145), (0.19, 0.045, 0.020), bevel=0.009)
    C.assign_material(mouth, C.make_material("tsubute_mouth_m", (0.22, 0.30, 0.16), roughness=0.5))
    extras.append(mouth)

    # 投げつける小石を手に持たせる
    stone = C.uv_sphere("tsubute_stone", (0.180, -0.225, 0.055), 0.042,
                        segments=10, rings=7, scale=(1.0, 0.9, 0.85))
    C.assign_material(stone, C.make_material("tsubute_stone_m", (0.45, 0.44, 0.42), roughness=0.9))
    extras.append(stone)

    mesh = C.join([body] + extras, "tsubute")
    armature = C.build_armature("tsubute", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def tsubute_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (18, {head: (-5, 0, 0), armL: (-6, 0, 0), armR: (-6, 0, 0)}),
            (36, {head: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {legL: (34, 0, 0), legR: (34, 0, 0), head: (10, 0, 0)}),
            (10, {legL: (-26, 0, 0), legR: (-26, 0, 0), head: (-12, 0, 0),
                  armL: (-30, 0, 0), armR: (-30, 0, 0)}),
            (16, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 振りかぶって石を投げる
        ("attack", [
            (1, {armL: (0, 0, 0), head: (0, 0, 0)}),
            (5, {armL: (-95, 0, -25), head: (-8, 0, 0)}),
            (10, {armL: (48, 0, 15), head: (12, 0, 0)}),
            (20, {armL: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (22, 0, 0), armL: (-28, 0, 20), armR: (-28, 0, -20)}),
            (14, {head: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {head: (0, 0, 0)}),
            (10, {head: (26, 0, 0), legL: (-40, 0, 0), legR: (-40, 0, 0)}),
            (24, {head: (40, 0, 0), legL: (-80, 0, 0), legR: (-80, 0, 0),
                  armL: (-70, 0, 30), armR: (-70, 0, -30)}),
        ]),
    ]


# =================================================================== マドロミダケ

MADOROMI_JOINTS = {
    "root": (0.0, 0.0, 0.05),
    "stem": (0.0, 0.0, 0.24),
    "capbase": (0.0, 0.0, 0.36),
    "captop": (0.0, 0.0, 0.50),
}
MADOROMI_RADII = {"root": 0.115, "stem": 0.095, "capbase": 0.275, "captop": 0.055}
MADOROMI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def cap_surface_z(dist: float) -> float:
    """
    傘の表面の高さ。capbase(半径0.275)から captop(半径0.055)へ向かう円錐を、
    サブディビジョンで丸まるぶん少し内側に見積もって近似する。
    """
    base_z, top_z = MADOROMI_JOINTS["capbase"][2], MADOROMI_JOINTS["captop"][2]
    base_r, top_r = MADOROMI_RADII["capbase"] * 0.86, MADOROMI_RADII["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.012


def build_madoromi():
    """歩くキノコ。傘を大きく広げ、笠の下に眠たげな顔をつける。"""
    body = C.build_skinned("madoromi", MADOROMI_JOINTS, MADOROMI_BONES, MADOROMI_RADII,
                           root="root", subsurf=2)
    stem_mat = C.make_material("madoromi_stem", (0.90, 0.86, 0.74), roughness=0.75)
    cap_mat = C.make_material("madoromi_cap", (0.62, 0.24, 0.42), roughness=0.6)
    C.assign_materials_by_region(body, [stem_mat, cap_mat], lambda c: 1 if c.z > 0.315 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # 半分閉じた眠たい目
        eye = C.uv_sphere(f"madoromi_eye{side}", (0.062 * side, -0.098, 0.20), 0.032,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.35))
        C.assign_material(eye, C.make_material(f"madoromi_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    mouth = C.uv_sphere("madoromi_mouth", (0.0, -0.098, 0.145), 0.030,
                        segments=12, rings=8, scale=(0.8, 0.5, 1.0))
    C.assign_material(mouth, C.make_material("madoromi_mouth_m", (0.36, 0.20, 0.22), roughness=0.4))
    extras.append(mouth)

    # 傘の斑点。傘の断面は capbase から captop へ絞られる円錐なので、
    # 中心からの距離に応じた高さに置かないと浮いたり埋まったりする。
    spot_mat = C.make_material("madoromi_spot", (0.94, 0.92, 0.86), roughness=0.6)
    for i, (angle_deg, dist, r) in enumerate([
        (200.0, 0.055, 0.042), (300.0, 0.105, 0.036), (60.0, 0.090, 0.038),
        (130.0, 0.130, 0.030), (10.0, 0.145, 0.026),
    ]):
        angle = math.radians(angle_deg)
        spot = C.uv_sphere(
            f"madoromi_spot{i}",
            (math.cos(angle) * dist, math.sin(angle) * dist, cap_surface_z(dist)),
            r, segments=12, rings=8, scale=(1.0, 1.0, 0.40),
        )
        C.assign_material(spot, spot_mat)
        extras.append(spot)

    mesh = C.join([body] + extras, "madoromi")
    armature = C.build_armature("madoromi", MADOROMI_JOINTS, MADOROMI_BONES, mesh, root="root")
    return [mesh, armature], armature


def madoromi_animations():
    stem, cap = "root-stem", "stem-capbase"
    return [
        ("idle", [
            (1, {stem: (0, 0, 0)}),
            (24, {stem: (3, 0, 2), cap: (-3, 0, 0)}),
            (48, {stem: (0, 0, 0)}),
        ]),
        # 根元をひねりながら、傘を左右に揺らして歩く
        ("walk", [
            (1, {stem: (0, 0, -9), cap: (0, 0, 6)}),
            (9, {stem: (6, 0, 0), cap: (-5, 0, 0)}),
            (18, {stem: (0, 0, 9), cap: (0, 0, -6)}),
            (27, {stem: (6, 0, 0), cap: (-5, 0, 0)}),
            (36, {stem: (0, 0, -9), cap: (0, 0, 6)}),
        ]),
        ("attack", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}),
            (5, {stem: (-14, 0, 0), cap: (-16, 0, 0)}),
            (10, {stem: (24, 0, 0), cap: (26, 0, 0), "capbase-captop": (18, 0, 0)}),
            (20, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {stem: (0, 0, 0)}),
            (4, {stem: (-20, 0, 0), cap: (-18, 0, 0)}),
            (14, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {stem: (0, 0, 0)}),
            (10, {stem: (-34, 0, 10), cap: (-20, 0, 0)}),
            (24, {stem: (-86, 0, 22), cap: (-34, 0, 0)}),
        ]),
    ]


# =================================================================== ホネガラミ

HONE_HALF = {
    "hip": (0.0, 0.0, 0.36),
    "chest": (0.0, 0.0, 0.56),
    "neck": (0.0, 0.0, 0.66),
    "head": (0.0, -0.01, 0.78),
    "crown": (0.0, 0.0, 0.88),
    "shoulder.L": (0.135, 0.0, 0.595),
    "elbow.L": (0.205, 0.01, 0.47),
    "hand.L": (0.205, -0.03, 0.34),
    "thigh.L": (0.072, 0.0, 0.32),
    "knee.L": (0.078, 0.0, 0.17),
    "foot.L": (0.082, -0.03, 0.03),
}
HONE_RADII_HALF = {
    # 手足はぐっと細く、胴も絞る。細い胴に太い肋骨を重ねることで
    # 「骨が浮いている」silhouette を作る
    "hip": 0.062, "chest": 0.060, "neck": 0.030, "head": 0.108, "crown": 0.062,
    "shoulder.L": 0.030, "elbow.L": 0.022, "hand.L": 0.030,
    "thigh.L": 0.032, "knee.L": 0.026, "foot.L": 0.034,
}
HONE_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_honegarami():
    """
    骸骨の剣士。ガルドと同じ人型の骨組みだが、四肢をぐっと細くして骨らしくし、
    肋骨と眼窩を足してある。
    """
    joints = C.mirrored(HONE_HALF)
    radii = C.mirrored_radii(HONE_RADII_HALF)
    bones = C.mirrored_bones(HONE_BONES_HALF)

    body = C.build_skinned("honegarami", joints, bones, radii, root="hip", subsurf=2)
    C.assign_material(body, C.make_material("hone_bone", (0.88, 0.86, 0.76), roughness=0.72))

    extras = []
    bone_mat = C.make_material("hone_bone2", (0.88, 0.86, 0.76), roughness=0.72)
    dark = C.make_material("hone_socket", (0.05, 0.05, 0.07), roughness=0.9)

    # 顎。頭を球のままにせず、下側に張り出させて頭蓋らしい輪郭にする
    jaw = C.uv_sphere("hone_jaw", (0.0, -0.048, 0.712), 0.082,
                      segments=18, rings=12, scale=(0.92, 1.12, 0.58))
    C.assign_material(jaw, bone_mat)
    extras.append(jaw)

    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"hone_socket{side}", (0.046 * side, -0.086, 0.800), 0.034,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.15))
        C.assign_material(socket, dark)
        extras.append(socket)
        # 眼窩の奥で光る目
        glow = C.uv_sphere(f"hone_glow{side}", (0.046 * side, -0.094, 0.800), 0.016,
                           segments=10, rings=8)
        C.assign_material(glow, C.make_material(f"hone_glow{side}_m", (1.0, 0.45, 0.15),
                                                roughness=0.3, emission=3.0))
        extras.append(glow)
        # 頬骨
        cheek = C.uv_sphere(f"hone_cheek{side}", (0.078 * side, -0.052, 0.762), 0.032,
                            segments=12, rings=8, scale=(0.8, 1.0, 0.7))
        C.assign_material(cheek, bone_mat)
        extras.append(cheek)

    # 歯。縦の切れ込みを入れて歯並びに見せる
    teeth_mat = C.make_material("hone_teeth_m", (0.93, 0.91, 0.82), roughness=0.5)
    for i in range(5):
        tooth = C.box(f"hone_tooth{i}", ((i - 2) * 0.026, -0.098, 0.700),
                      (0.019, 0.026, 0.030), bevel=0.005)
        C.assign_material(tooth, teeth_mat)
        extras.append(tooth)

    # 肋骨。細い胴に対して十分太い輪を重ね、はっきり浮き出させる
    rib_mat = C.make_material("hone_rib", (0.87, 0.85, 0.75), roughness=0.72)
    for i, z in enumerate((0.455, 0.500, 0.545, 0.588)):
        radius = 0.108 - abs(i - 1) * 0.010
        rib = C.cylinder(f"hone_rib{i}", (0.0, -0.005, z), radius, 0.022, segments=20)
        # 前後に潰して胸郭らしい楕円にする
        for vert in rib.data.vertices:
            vert.co.y *= 0.72
        C.assign_material(rib, rib_mat)
        extras.append(rib)

    # 背骨
    spine = C.cylinder("hone_spine", (0.0, 0.030, 0.46), 0.026, 0.20, segments=12)
    C.assign_material(spine, rib_mat)
    extras.append(spine)

    # 腰骨
    pelvis = C.uv_sphere("hone_pelvis", (0.0, 0.0, 0.350), 0.092,
                         segments=16, rings=12, scale=(1.0, 0.62, 0.58))
    C.assign_material(pelvis, bone_mat)
    extras.append(pelvis)

    # 右手に錆びた剣
    blade = C.box("hone_blade", (-0.205, -0.055, 0.475), (0.034, 0.014, 0.32), bevel=0.008)
    # 切先を細める
    for vert in blade.data.vertices:
        if vert.co.z > 0.60:
            vert.co.x *= 0.35
    C.assign_material(blade, C.make_material("hone_blade_m", (0.52, 0.50, 0.46),
                                             roughness=0.45, metallic=0.75))
    guard = C.box("hone_guard", (-0.205, -0.050, 0.322), (0.095, 0.028, 0.022), bevel=0.007)
    C.assign_material(guard, C.make_material("hone_guard_m", (0.34, 0.28, 0.20), roughness=0.7))
    grip = C.cylinder("hone_grip", (-0.205, -0.050, 0.290), 0.017, 0.075, segments=12)
    C.assign_material(grip, C.make_material("hone_grip_m", (0.26, 0.19, 0.13), roughness=0.85))
    extras += [blade, guard, grip]

    mesh = C.join([body] + extras, "honegarami")
    armature = C.build_armature("honegarami", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def honegarami_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreR = "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5)}),
            (20, {hipc: (2, 0, 1.5), neck: (-3, 0, 0), armL: (-4, 0, 8), armR: (-4, 0, -8)}),
            (40, {hipc: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5)}),
        ]),
        ("walk", [
            (1, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (-10, 0, 0), shinR: (8, 0, 0),
                 armL: (-20, 0, 6), armR: (20, 0, -6)}),
            (9, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (17, {legL: (-24, 0, 0), legR: (24, 0, 0), shinL: (8, 0, 0), shinR: (-10, 0, 0),
                  armL: (20, 0, 6), armR: (-20, 0, -6)}),
            (25, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (33, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (-10, 0, 0), shinR: (8, 0, 0),
                  armL: (-20, 0, 6), armR: (20, 0, -6)}),
        ]),
        ("attack", [
            (1, {armR: (0, 0, -5), foreR: (0, 0, 0), hipc: (0, 0, 0)}),
            (6, {armR: (-120, 0, -18), foreR: (-30, 0, 0), hipc: (-8, 0, -10)}),
            (11, {armR: (62, 0, 12), foreR: (8, 0, 0), hipc: (14, 0, 12), neck: (-8, 0, 0)}),
            (22, {armR: (0, 0, -5), foreR: (0, 0, 0), hipc: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-18, 0, 0), neck: (-16, 0, 0), armL: (-22, 0, 24), armR: (-22, 0, -24)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 崩れ落ちるように倒れる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (8, {hipc: (-16, 0, 6), neck: (-24, 0, 0), armL: (-40, 0, 40), armR: (-40, 0, -40)}),
            (26, {hipc: (-88, 0, 18), neck: (-40, 0, 0), legL: (56, 0, 0), legR: (48, 0, 0),
                  armL: (-80, 0, 55), armR: (-80, 0, -55)}),
        ]),
    ]


# =========================================================================== 一覧

MONSTERS = {
    "purun": (build_purun, purun_animations),
    "akubitokage": (build_akubitokage, akubitokage_animations),
    "gajiri": (build_gajiri, gajiri_animations),
    "tsubute": (build_tsubute, tsubute_animations),
    "madoromi": (build_madoromi, madoromi_animations),
    "honegarami": (build_honegarami, honegarami_animations),
}


def make(name: str):
    build_fn, anim_fn = MONSTERS[name]
    objs, armature = build_fn()
    for clip_name, keyframes in anim_fn():
        C.add_action(armature, clip_name, keyframes)
    return objs


if __name__ == "__main__":
    import sys

    targets = sys.argv[1:] or list(MONSTERS)
    for target in targets:
        C.reset_scene()
        objs = make(target)
        print(f"{target}: 三角形 {C.tri_count(objs)}")
        C.render_preview(target, objs)
        C.export_glb(target, objs)
