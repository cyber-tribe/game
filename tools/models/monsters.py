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


# ===================================================================== まぶたむし

MABUTAMUSHI_HALF = {
    "body": (0.0, 0.020, 0.075),
    "head": (0.0, -0.098, 0.058),
    "legF.L": (0.075, -0.020, 0.045),
    "footF.L": (0.128, -0.052, 0.006),
    "legB.L": (0.078, 0.078, 0.050),
    "footB.L": (0.132, 0.110, 0.006),
}
MABUTAMUSHI_RADII_HALF = {
    "body": 0.085, "head": 0.040,
    "legF.L": 0.022, "footF.L": 0.015,
    "legB.L": 0.024, "footB.L": 0.016,
}
MABUTAMUSHI_BONES_HALF = [
    ("body", "head"),
    ("body", "legF.L"), ("legF.L", "footF.L"),
    ("body", "legB.L"), ("legB.L", "footB.L"),
]


def build_mabutamushi():
    """
    瞼の隙間に湧く小さな夢。gajiriと同じ「胴+頭+前後の脚」という関節構成を
    踏襲しつつ、swarmで複数体まとめて出現する前提のため尻尾と耳を削り、
    関節数をgajiriの半分ほどまで落として軽くする(その分subsurfは変えず
    形の滑らかさは保つ)。
    """
    joints = C.mirrored(MABUTAMUSHI_HALF)
    radii = C.mirrored_radii(MABUTAMUSHI_RADII_HALF)
    bones = C.mirrored_bones(MABUTAMUSHI_BONES_HALF)

    body = C.build_skinned("mabutamushi", joints, bones, radii, root="body", subsurf=2)
    dust = C.make_material("mabuta_dust", (0.72, 0.63, 0.56), roughness=0.55)
    shade = C.make_material("mabuta_shade", (0.40, 0.32, 0.28), roughness=0.6)
    # 丸い背中だけ参道の土埃色に浮かせ、脚と腹側は影のように落として引き締める
    # (tsubuteの背/腹の塗り分けと同じ、高さだけで切る手法)
    C.assign_materials_by_region(body, [shade, dust], lambda c: 1 if c.z > 0.05 else 0)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"mabuta_eye{side}", (0.022 * side, -0.083, 0.060), 0.014,
                          look=(0.2 * side, -1.0, 0.0),
                          white=(0.97, 0.92, 0.80), dark=(0.34, 0.20, 0.12))

    mesh = C.join([body] + extras, "mabutamushi")
    armature = C.build_armature("mabutamushi", joints, bones, mesh, root="body")
    return [mesh, armature], armature


def mabutamushi_animations():
    head = "body-head"
    legF_L, legF_R = "body-legF.L", "body-legF.R"
    legB_L, legB_R = "body-legB.L", "body-legB.R"
    return [
        # 群れの中でそわそわ落ち着かず、小刻みに震える
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (16, {head: (-6, 0, 4), legF_L: (4, 0, 0), legF_R: (-4, 0, 0)}),
            (32, {head: (0, 0, -4), legB_L: (-4, 0, 0), legB_R: (4, 0, 0)}),
            (44, {head: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {legF_L: (26, 0, 0), legF_R: (-26, 0, 0),
                 legB_L: (-24, 0, 0), legB_R: (24, 0, 0), head: (4, 0, 0)}),
            (5, {legF_L: (0, 0, 0), legF_R: (0, 0, 0),
                 legB_L: (0, 0, 0), legB_R: (0, 0, 0), head: (0, 0, 0)}),
            (9, {legF_L: (-26, 0, 0), legF_R: (26, 0, 0),
                 legB_L: (24, 0, 0), legB_R: (-24, 0, 0), head: (-4, 0, 0)}),
            (13, {legF_L: (0, 0, 0), legF_R: (0, 0, 0),
                  legB_L: (0, 0, 0), legB_R: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        ("attack", [
            (1, {head: (0, 0, 0), legF_L: (0, 0, 0), legF_R: (0, 0, 0)}),
            (3, {head: (-16, 0, 0), legF_L: (-14, 0, 0), legF_R: (-14, 0, 0)}),
            (7, {head: (22, 0, 0), legF_L: (10, 0, 0), legF_R: (10, 0, 0)}),
            (14, {head: (0, 0, 0), legF_L: (0, 0, 0), legF_R: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0), legB_L: (0, 0, 0), legB_R: (0, 0, 0)}),
            (3, {head: (18, 0, 0), legB_L: (-16, 0, 0), legB_R: (-16, 0, 0)}),
            (11, {head: (0, 0, 0), legB_L: (0, 0, 0), legB_R: (0, 0, 0)}),
        ]),
        # 小さな夢らしく、脚を丸く縮めて消えていく
        ("die", [
            (1, {head: (0, 0, 0)}),
            (8, {head: (20, 0, 0), legF_L: (-40, 0, 0), legF_R: (-40, 0, 0),
                 legB_L: (-36, 0, 0), legB_R: (-36, 0, 0)}),
            (18, {head: (34, 0, 0), legF_L: (-70, 0, 0), legF_R: (-70, 0, 0),
                  legB_L: (-64, 0, 0), legB_R: (-64, 0, 0)}),
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


# =================================================================== きりみずち

KIRI_HALF = {
    "hip": (0.0, 0.02, 0.10),
    "chest": (0.0, -0.03, 0.34),
    "head": (0.0, -0.075, 0.58),
    "armF.L": (0.165, -0.02, 0.31),
    "handF.L": (0.185, 0.05, 0.07),
    "kneeB.L": (0.15, 0.15, 0.015),
    "ankleB.L": (0.14, 0.06, 0.005),
    "footB.L": (0.12, -0.02, 0.0),
}
KIRI_RADII_HALF = {
    "hip": 0.135, "chest": 0.10, "head": 0.072,
    "armF.L": 0.026, "handF.L": 0.016,
    "kneeB.L": 0.042, "ankleB.L": 0.028, "footB.L": 0.020,
}
KIRI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kirimizuchi():
    """
    霧を纏う、忘れられかけた道しるべの成れの果て。近づかず離れたところから
    水弾を飛ばす`ranged`の主力にふさわしく、tsubuteと同じ関節構成(胴・頭・
    腕・脚をつなぐ7本の骨)をそのまま流用するが、ずんぐりした蛙とは違い、
    縦に伸びて頭が前へ傾いだ、朽ちた道しるべのシルエットにする。
    腕は水を飛ばす触手として長く垂らし、頭には水を吐く注ぎ口と、
    霧の奥にかすかに灯るような弱い光の目をつける。
    """
    joints = C.mirrored(KIRI_HALF)
    radii = C.mirrored_radii(KIRI_RADII_HALF)
    bones = C.mirrored_bones(KIRI_BONES_HALF)

    body = C.build_skinned("kirimizuchi", joints, bones, radii, root="chest", subsurf=2)

    body_lower = C.make_material("kiri_body_lower", (0.30, 0.40, 0.43), roughness=0.75)
    body_upper = C.make_material("kiri_body_upper", (0.58, 0.70, 0.72), roughness=0.5)
    tendril_mat = C.make_material("kiri_tendril", (0.72, 0.84, 0.85), roughness=0.3, emission=0.12)

    # 腕(触手)だけを別トーンにする。高さだけで切ると胴に巻き込むので、
    # 腕・手の関節からの距離で判定する(gajiriの耳と同じ手法)
    arm_pts = [Vector(joints["armF.L"]), Vector(joints["armF.R"]),
               Vector(joints["handF.L"]), Vector(joints["handF.R"])]

    def classify(c):
        if min((c - p).length for p in arm_pts) < 0.045:
            return 2
        return 1 if c.z > 0.28 else 0

    C.assign_materials_by_region(body, [body_lower, body_upper, tendril_mat], classify)

    extras = []
    # 霧の奥にかすかに灯る目。眼窩は影にして、その奥に小さな光点だけを置く
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"kiri_socket{side}", (0.032 * side, -0.128, 0.598), 0.020,
                             segments=12, rings=8, scale=(1.0, 0.7, 1.0))
        C.assign_material(socket, C.make_material(f"kiri_socket{side}_m", (0.05, 0.06, 0.08),
                                                   roughness=0.85))
        extras.append(socket)
        glow = C.uv_sphere(f"kiri_glow{side}", (0.032 * side, -0.138, 0.598), 0.009,
                           segments=10, rings=8)
        C.assign_material(glow, C.make_material(f"kiri_glow{side}_m", (0.55, 0.85, 0.90),
                                                roughness=0.25, emission=2.5))
        extras.append(glow)

    # 水を吐く注ぎ口。先端に凝った水滴を結ばせる
    spout = C.box("kiri_spout", (0.0, -0.185, 0.505), (0.048, 0.095, 0.032), bevel=0.011)
    C.assign_material(spout, C.make_material("kiri_spout_m", (0.24, 0.30, 0.32), roughness=0.6))
    extras.append(spout)
    droplet = C.uv_sphere("kiri_droplet", (0.0, -0.238, 0.498), 0.026, segments=14, rings=10)
    C.assign_material(droplet, C.make_material("kiri_droplet_m", (0.55, 0.78, 0.85),
                                               roughness=0.15, emission=0.6))
    extras.append(droplet)

    # 割れた道しるべの木片。頭の上に棘のように突き出す
    spike_mat = C.make_material("kiri_spike_m", (0.22, 0.27, 0.29), roughness=0.65)
    for i, (angle_deg, dist, height) in enumerate([
        (30.0, 0.032, 0.075), (150.0, 0.030, 0.062), (270.0, 0.026, 0.055),
    ]):
        angle = math.radians(angle_deg)
        spike = C.cone(
            f"kiri_spike{i}",
            (math.cos(angle) * dist, -0.075 + math.sin(angle) * dist * 0.4, 0.635),
            0.018, 0.003, height, segments=8,
        )
        C.assign_material(spike, spike_mat)
        extras.append(spike)

    mesh = C.join([body] + extras, "kirimizuchi")
    armature = C.build_armature("kirimizuchi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kirimizuchi_animations():
    head = "chest-head"
    trunk = "chest-hip"
    armL, armR = "chest-armF.L", "chest-armF.R"
    foreL, foreR = "armF.L-handF.L", "armF.R-handF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 霧がゆっくり渦を巻くように、頭と触手が漂う
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (22, {head: (-4, 3, 0), armL: (6, 0, 4), armR: (6, 0, -4),
                  foreL: (8, 0, 0), foreR: (8, 0, 0)}),
            (44, {head: (3, -3, 0), armL: (-4, 0, -3), armR: (-4, 0, 3),
                  foreL: (-4, 0, 0), foreR: (-4, 0, 0)}),
            (60, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                  foreL: (0, 0, 0), foreR: (0, 0, 0)}),
        ]),
        # 脚をほとんど使わず、体ごと傾いで滑るように進む
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), trunk: (0, 0, 0), head: (0, 0, 0)}),
            (8, {legL: (14, 0, 0), legR: (-10, 0, 0), trunk: (-3, 0, 2), head: (4, 0, 0),
                 armL: (-10, 0, 6), armR: (10, 0, -6)}),
            (16, {legL: (-10, 0, 0), legR: (14, 0, 0), trunk: (3, 0, -2), head: (-4, 0, 0),
                  armL: (10, 0, -6), armR: (-10, 0, 6)}),
            (24, {legL: (0, 0, 0), legR: (0, 0, 0), trunk: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 頭を引いてため、注ぎ口を突き出すように水弾を放つ
        ("attack", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                 foreL: (0, 0, 0), foreR: (0, 0, 0)}),
            (5, {head: (-10, 0, 0), armL: (-18, 0, 10), armR: (-18, 0, -10),
                 foreL: (-14, 0, 0), foreR: (-14, 0, 0)}),
            (10, {head: (14, 0, 0), armL: (22, 0, -8), armR: (22, 0, 8),
                  foreL: (20, 0, 0), foreR: (20, 0, 0)}),
            (20, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                  foreL: (0, 0, 0), foreR: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0), trunk: (0, 0, 0)}),
            (4, {head: (16, 0, 0), trunk: (-10, 0, 0), armL: (-14, 0, 14), armR: (-14, 0, -14)}),
            (14, {head: (0, 0, 0), trunk: (0, 0, 0)}),
        ]),
        # 実体を失って霧に紛れるように、前へ崩れ落ちる
        ("die", [
            (1, {trunk: (0, 0, 0), head: (0, 0, 0)}),
            (12, {trunk: (-30, 0, 0), head: (20, 0, 0), armL: (-30, 0, 20), armR: (-30, 0, -20),
                  legL: (-20, 0, 0), legR: (-20, 0, 0)}),
            (26, {trunk: (-70, 0, 0), head: (40, 0, 0), armL: (-60, 0, 40), armR: (-60, 0, -40),
                  legL: (-40, 0, 0), legR: (-40, 0, 0)}),
        ]),
    ]


# =================================================================== ぬかるみがに

# 現在流用している`honegarami`と同じ関節の"種類"(胴の芯+腕+脚)を踏襲しつつ、
# 「がっしりした低い体格」に合わせて座標・太さは全面的に作り直した
# (honegaramiは直立二足の細身、こちらは低く這うがに股の甲殻)。
NUKARUMIGANI_HALF = {
    # tsubute(蛙)と同じく、胴の関節はZをほぼ揃えたまま前後(Y)で並べる
    # (Zまで一緒に上げると関節列が弧を描いて「くの字のイモムシ」になる、
    # 最初の試作の失敗)。
    #
    # honegaramiのように「胴の芯をhip-chestの2関節に分け、それぞれに
    # 左右対称の脚・腕をぶら下げる」構成を最初は試したが、隣接する2つの
    # 分岐点(hip・chest)がどちらも「親1つ+左右対称の子2つ」を持つと、
    # 関節位置をどう調整してもSkinモディファイアが面を正しく解決できず、
    # 平らな破れ面や裂け目ができることを検証用スクリプトで突き止めた
    # (honegarami自身はhip・chestの左右対称の子がどちらもY(前後)を
    # 親と揃えているため問題が起きない、と分かった)。
    # 対策として胴の芯を"hip"1関節に一本化し、腕(shoulder)・脚(thigh)の
    # 左右対称の子はどちらもhipとほぼ同じY(前後位置)に揃えている。
    "hip": (0.0, 0.020, 0.170),
    "neck": (0.0, -0.110, 0.165),
    "head": (0.0, -0.190, 0.150),
    "crown": (0.0, -0.210, 0.170),
    "shoulder.L": (0.235, 0.010, 0.170),
    "elbow.L": (0.330, -0.070, 0.145),
    "hand.L": (0.410, -0.150, 0.120),
    "thigh.L": (0.225, 0.030, 0.075),
    "knee.L": (0.278, 0.065, 0.035),
    "foot.L": (0.240, 0.015, 0.010),
}
NUKARUMIGANI_RADII_HALF = {
    # 胴(hip・neck・head)は大きな半径どうしを重ねて低く丸い甲羅にする。
    # 手足は関節どうしの間隔を狭く・太さは太めにして、丸太のようにずんぐり
    # したがっしりした手足にする(ただし胴の半径は明確に超える距離まで
    # 離し、まぶたむしで脚が消えた反省を踏まえている)。
    "hip": 0.190, "neck": 0.115, "head": 0.090, "crown": 0.035,
    "shoulder.L": 0.090, "elbow.L": 0.105, "hand.L": 0.058,
    "thigh.L": 0.066, "knee.L": 0.050, "foot.L": 0.032,
}
NUKARUMIGANI_BONES_HALF = [
    ("hip", "neck"), ("neck", "head"), ("head", "crown"),
    ("hip", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_nukarumigani():
    """
    ぬかるみに根を張るように動きが鈍いが、力比べになると存外強いがに股の甲殻。
    honegaramiと同じ「胴の芯+腕+脚」の関節の"種類"を踏襲するが、直立させず、
    胴の芯を1関節(hip)に一本化して低く丸いドーム状にし、腕の先
    (elbow-hand)を大ぶりなハサミに仕立てる。
    """
    joints = C.mirrored(NUKARUMIGANI_HALF)
    radii = C.mirrored_radii(NUKARUMIGANI_RADII_HALF)
    bones = C.mirrored_bones(NUKARUMIGANI_BONES_HALF)

    body = C.build_skinned("nukarumigani", joints, bones, radii, root="hip", subsurf=2)

    shell = C.make_material("nukaru_shell", (0.38, 0.50, 0.52), roughness=0.55)
    under = C.make_material("nukaru_under", (0.22, 0.30, 0.34), roughness=0.62)

    # 脚(thigh-knee-foot)の関節に近い面だけ暗い色にし、甲殻とハサミは
    # 明るい灰みの水色系のまま残す(gajiriの耳の塗り分けと同じ、関節からの
    # 距離で判定する手法)。閾値は甲殻(半径0.15〜0.17)を巻き込まない
    # 0.10に絞り、実際の面数を数えて偏りがないか検証している
    leg_joints = [
        Vector(joints[name])
        for side in ("L", "R")
        for name in (f"thigh.{side}", f"knee.{side}", f"foot.{side}")
    ]
    C.assign_materials_by_region(
        body, [shell, under],
        lambda c: 1 if min((c - j).length for j in leg_joints) < 0.10 else 0,
    )
    leg_faces = sum(1 for p in body.data.polygons if p.material_index == 1)
    total_faces = len(body.data.polygons)
    print(f"nukarumigani: 脚の暗色面 {leg_faces}/{total_faces} "
          f"({leg_faces / total_faces:.1%})")

    extras = []

    # 目は関節ではなく、甲殻の前縁から突き出た柄付きの目にする(がに股の
    # 甲殻らしさを出すための飾りで、eyeball()を柄の先端に乗せる)
    stalk_mat = C.make_material("nukaru_stalk", (0.30, 0.40, 0.42), roughness=0.5)
    for side in (-1.0, 1.0):
        stalk = C.cylinder(f"nukaru_stalk{side}", (0.050 * side, -0.175, 0.235),
                           0.014, 0.060, segments=10)
        C.assign_material(stalk, stalk_mat)
        extras.append(stalk)
        extras += eyeball(f"nukaru_eye{side}", (0.050 * side, -0.195, 0.268), 0.020,
                          look=(0.15 * side, -1.0, 0.05),
                          white=(0.86, 0.90, 0.82), dark=(0.09, 0.08, 0.07))

    # ハサミの先端。爪の丸い塊そのものはelbow-handの太い皮(Skin)に任せ、
    # 先端の「はさむ2枚」だけを小さいboxで足す(honegaramiの歯と同じ、
    # 主形状に対して控えめな大きさの飾りにする。板状メッシュを手動で
    # シアーさせるのはmabutamushiで壊れたので避け、box+条件付きスケールで
    # 先端を絞るだけにする)
    claw_mat = C.make_material("nukaru_claw", (0.30, 0.40, 0.42), roughness=0.5)
    claw_edge = C.make_material("nukaru_claw_edge", (0.66, 0.76, 0.74), roughness=0.32)
    for side in (-1.0, 1.0):
        hx, hy, hz = NUKARUMIGANI_HALF["hand.L"]
        hx *= side
        for tag, dz, length in (("upper", 0.016, 0.052), ("lower", -0.016, 0.040)):
            finger = C.box(f"nukaru_claw_{tag}{side}", (hx, hy - 0.018, hz + dz),
                          (0.026, length, 0.020), bevel=0.007)
            for vert in finger.data.vertices:
                if vert.co.y < hy - 0.018 - length * 0.3:
                    vert.co.x *= 0.4
                    vert.co.z *= 0.5
            C.assign_material(finger, claw_mat)
            extras.append(finger)
            tip = C.uv_sphere(f"nukaru_claw_{tag}_tip{side}",
                              (hx, hy - 0.018 - length * 0.55, hz + dz * 0.5), 0.012,
                              segments=10, rings=8)
            C.assign_material(tip, claw_edge)
            extras.append(tip)

    # 背の甲殻に小さな瘤を3つ並べて質感を足す(kirimizuchiの棘と同じ、
    # primitiveを貼るだけの安全な手法)
    ridge_mat = C.make_material("nukaru_ridge", (0.44, 0.56, 0.56), roughness=0.5)
    for i, (y, z, r) in enumerate([
        (0.050, 0.215, 0.036), (-0.020, 0.245, 0.040), (-0.090, 0.235, 0.034),
    ]):
        ridge = C.uv_sphere(f"nukaru_ridge{i}", (0.0, y, z), r,
                            segments=14, rings=10, scale=(1.0, 1.0, 0.55))
        C.assign_material(ridge, ridge_mat)
        extras.append(ridge)

    mesh = C.join([body] + extras, "nukarumigani")
    armature = C.build_armature("nukarumigani", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def nukarumigani_animations():
    spine = "hip-neck"
    headb = "neck-head"
    armL, armR = "hip-shoulder.L", "hip-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    handL, handR = "elbow.L-hand.L", "elbow.R-hand.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 動きが鈍い分、腰(spine)は据わったまま、ハサミだけがゆっくり開閉する
        ("idle", [
            (1, {spine: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (26, {spine: (2, 0, 0), headb: (2, 0, 0),
                  armL: (0, 0, 18), armR: (0, 0, -18),
                  handL: (0, 0, -8), handR: (0, 0, 8)}),
            (52, {spine: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
        ]),
        # がに股のまま、左右の脚を交互に踏みしめて重く進む
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-14, 0, 0), shinR: (10, 0, 0),
                 armL: (0, 0, 6), armR: (0, 0, -6)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  armL: (0, 0, 10), armR: (0, 0, -10)}),
            (21, {legL: (-18, 0, 0), legR: (18, 0, 0), shinL: (10, 0, 0), shinR: (-14, 0, 0),
                  armL: (0, 0, 6), armR: (0, 0, -6)}),
            (31, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  armL: (0, 0, 10), armR: (0, 0, -10)}),
            (41, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-14, 0, 0), shinR: (10, 0, 0),
                  armL: (0, 0, 6), armR: (0, 0, -6)}),
        ]),
        # 両方のハサミを大きく開いてから、力比べで挟み潰すように閉じる
        ("attack", [
            (1, {armL: (0, 0, 10), armR: (0, 0, -10), handL: (0, 0, 0), handR: (0, 0, 0)}),
            (7, {armL: (-14, 0, 40), armR: (-14, 0, -40),
                 handL: (0, 0, -34), handR: (0, 0, 34), spine: (-6, 0, 0)}),
            (13, {armL: (18, 0, -6), armR: (18, 0, 6),
                  handL: (0, 0, 30), handR: (0, 0, -30), spine: (8, 0, 0)}),
            (24, {armL: (0, 0, 10), armR: (0, 0, -10), handL: (0, 0, 0), handR: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {spine: (0, 0, 0), headb: (0, 0, 0)}),
            (5, {spine: (-10, 0, 0), headb: (-14, 0, 0),
                 armL: (-8, 0, 20), armR: (-8, 0, -20)}),
            (16, {spine: (0, 0, 0), headb: (0, 0, 0)}),
        ]),
        # 力尽きて、がに股の脚から順にぬかるみへ沈み込むように崩れる
        ("die", [
            (1, {spine: (0, 0, 0)}),
            (10, {spine: (-14, 0, 4), legL: (-30, 0, 0), legR: (-30, 0, 0),
                  armL: (-20, 0, 30), armR: (-20, 0, -30)}),
            (26, {spine: (-40, 0, 10), legL: (-64, 0, 0), legR: (-64, 0, 0),
                  shinL: (-50, 0, 0), shinR: (-50, 0, 0),
                  armL: (-46, 0, 55), armR: (-46, 0, -55)}),
        ]),
    ]


# =================================================================== あしあとどり

# 現在流用している`purun`の関節の"種類"(縦の芯1本)を出発点にしつつ、
# swarmで複数体が同時に群れる鳥のため、purunにはない頭・尾・脚を新たに
# 生やす形で全面的に作り直した(mabutamushi/nukarumiganiと同じ、
# 「関節の種類は踏襲するが座標構成はゼロから」の方針)。
# 胴(body, root)から頭・尾・左右の脚をそれぞれ1本ずつ分岐させるだけの、
# 既存モデル中もっとも少ない部類の関節数にとどめ、swarmで複数体まとめて
# 描画される負荷をmabutamushiよりさらに抑える。
ASHIATODORI_HALF = {
    "body": (0.0, 0.010, 0.150),
    "head": (0.0, -0.135, 0.225),
    "tail": (0.0, 0.205, 0.165),
    "leg.L": (0.062, 0.010, 0.055),
    "foot.L": (0.055, -0.025, 0.008),
}
ASHIATODORI_RADII_HALF = {
    "body": 0.090, "head": 0.056, "tail": 0.032,
    "leg.L": 0.024, "foot.L": 0.015,
}
ASHIATODORI_BONES_HALF = [
    ("body", "head"), ("body", "tail"),
    ("body", "leg.L"), ("leg.L", "foot.L"),
]


def build_ashiatodori():
    """
    消えていく足跡を追いかける鳥。1羽では頼りなく、群れで現れるswarm。
    丸い胴に頭と尾を突き出しただけの簡略なシルエットにして、2本脚で
    立たせる。関節数を絞るぶん、脚の付け根(leg.L/R)は胴の半径
    (0.090)をはっきり超える位置に置いて呑み込まれないようにしている
    (距離0.113、mabutamushiの反省を踏まえた余裕を確保)。
    """
    joints = C.mirrored(ASHIATODORI_HALF)
    radii = C.mirrored_radii(ASHIATODORI_RADII_HALF)
    bones = C.mirrored_bones(ASHIATODORI_BONES_HALF)

    body = C.build_skinned("ashiatodori", joints, bones, radii, root="body", subsurf=2)

    # 配色は第2地方(忘れ潮の湿地)のテーマどおり、霧と水を思わせる
    # 灰みがかった水色・青緑系。背は濃いめ、腹は明るく霧がかった色にする
    # (purun/mabutamushiと同じ、高さで切る塗り分け)。脚だけは
    # nukarumiganiと同じ「関節からの距離」判定で別トーンにする。
    back = C.make_material("ashiato_back", (0.36, 0.52, 0.55), roughness=0.55)
    belly = C.make_material("ashiato_belly", (0.70, 0.80, 0.80), roughness=0.4)
    leg_mat = C.make_material("ashiato_leg", (0.26, 0.30, 0.33), roughness=0.6)

    # 脚は胴の最下点(体中心0.150-半径0.090=0.060)よりはっきり低い位置
    # (関節はz=0.055/0.008)にしか無いので、高さだけで胴と分離できる
    # (距離判定にすると胴の付け根まで巻き込んで塗り分けが偏った反省を
    # 踏まえ、kirimizuchi/nukarumiganiの距離判定ではなく高さ判定にした)
    def classify(c):
        if c.z < 0.05:
            return 2
        return 0 if c.z > 0.13 else 1

    C.assign_materials_by_region(body, [back, belly, leg_mat], classify)
    leg_faces = sum(1 for p in body.data.polygons if p.material_index == 2)
    total_faces = len(body.data.polygons)
    print(f"ashiatodori: 脚の暗色面 {leg_faces}/{total_faces} "
          f"({leg_faces / total_faces:.1%})")

    # 頭は胴(半径0.090)よりずっと細い関節1本の"末端"のため、Skin+subsurfで
    # 想定より縮む(検証用スクリプトで頂点座標を直接プローブして確認、
    # mabutamushiの反省どおり)。目・くちばしは公称半径ではなく、実際に
    # 生成された頭表面の座標(プローブ結果: 頭頂点は概ねy=-0.10〜-0.14、
    # z=0.20〜0.25の範囲)に合わせて置いている。
    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"ashiato_eye{side}", (0.024 * side, -0.148, 0.222), 0.014,
                          look=(0.2 * side, -1.0, 0.0),
                          white=(0.90, 0.94, 0.92), dark=(0.08, 0.09, 0.10))

    # くちばし。頭の先端に小さな箱を置き、先端側の頂点だけを中心基準で
    # 縮めて尖らせる(nukarumiganiのハサミ先端と同じ手法。ただしそちらは
    # ワールド座標で直接スケールしており、中心がZ=0から離れた形状に
    # 使うと軸ごとずれる。ここでは中心からの相対値で縮めて、ずれを防ぐ)
    beak_mat = C.make_material("ashiato_beak", (0.30, 0.28, 0.24), roughness=0.5)
    beak_y, beak_z = -0.160, 0.205
    beak = C.box("ashiato_beak", (0.0, beak_y, beak_z), (0.024, 0.044, 0.016), bevel=0.003)
    for vert in beak.data.vertices:
        if vert.co.y < beak_y:
            vert.co.x *= 0.15
            vert.co.z = beak_z + (vert.co.z - beak_z) * 0.3
    C.assign_material(beak, beak_mat)
    extras.append(beak)

    # 畳んだ翼。胴の両脇に控えめな瘤を1つずつ乗せるだけ
    # (kirimizuchi/nukarumiganiの棘・瘤と同じprimitive貼り付け)
    wing_mat = C.make_material("ashiato_wing", (0.30, 0.44, 0.47), roughness=0.5)
    for side in (-1.0, 1.0):
        wing = C.uv_sphere(f"ashiato_wing{side}", (0.078 * side, 0.040, 0.133), 0.048,
                           segments=14, rings=10, scale=(0.5, 1.3, 0.9))
        C.assign_material(wing, wing_mat)
        extras.append(wing)

    # 足跡を追う鳥らしく、3本指の小さな爪を左右の足に生やす。
    # cone()はZ軸沿いにしか作れないので回転はかけず、先端が下(接地面)を
    # 向くよう根元(半径大)を足の高さに、先端(半径小)をその下に置くだけの
    # 素直な配置にする(honegaramiの歯・kirimizuchiの棘と同じprimitive
    # 貼り付け。回転で位置がずれたくちばしの反省を踏まえ、ここでは
    # 回転そのものを使わない)
    claw_mat = C.make_material("ashiato_claw", (0.22, 0.25, 0.27), roughness=0.55)
    for side in (-1.0, 1.0):
        fx, fy, fz = ASHIATODORI_HALF["foot.L"]
        fx *= side
        claw_depth = 0.018
        for dx, dy in ((-0.014, -0.004), (0.0, -0.012), (0.014, -0.004)):
            top_z = fz
            claw = C.cone(
                f"ashiato_claw{side}_{dx}",
                (fx + dx * side, fy + dy, top_z - claw_depth * 0.5),
                0.002, 0.009, claw_depth, segments=6,
            )
            C.assign_material(claw, claw_mat)
            extras.append(claw)

    mesh = C.join([body] + extras, "ashiatodori")
    armature = C.build_armature("ashiatodori", joints, bones, mesh, root="body")
    return [mesh, armature], armature


def ashiatodori_animations():
    head = "body-head"
    tail = "body-tail"
    legL, legR = "body-leg.L", "body-leg.R"
    footL, footR = "leg.L-foot.L", "leg.R-foot.R"
    return [
        # 群れの中で忙しなく足跡を探し、頭と尾を小刻みに振る
        ("idle", [
            (1, {head: (0, 0, 0), tail: (0, 0, 0)}),
            (14, {head: (-8, 6, 0), tail: (10, 0, 0), legL: (3, 0, 0), legR: (-3, 0, 0)}),
            (28, {head: (4, -6, 0), tail: (-10, 0, 0), legL: (-3, 0, 0), legR: (3, 0, 0)}),
            (38, {head: (0, 0, 0), tail: (0, 0, 0)}),
        ]),
        # 消えていく足跡を追う、せわしない小走り
        ("walk", [
            (1, {legL: (30, 0, 0), legR: (-30, 0, 0), footL: (-14, 0, 0), footR: (10, 0, 0),
                 head: (0, 4, 0), tail: (-8, 0, 0)}),
            (5, {legL: (0, 0, 0), legR: (0, 0, 0), footL: (0, 0, 0), footR: (0, 0, 0),
                 head: (0, 0, 0), tail: (0, 0, 0)}),
            (9, {legL: (-30, 0, 0), legR: (30, 0, 0), footL: (10, 0, 0), footR: (-14, 0, 0),
                 head: (0, -4, 0), tail: (8, 0, 0)}),
            (13, {legL: (0, 0, 0), legR: (0, 0, 0), footL: (0, 0, 0), footR: (0, 0, 0),
                  head: (0, 0, 0), tail: (0, 0, 0)}),
        ]),
        # くちばしで突くように、頭を引いてから素早く前へ突き出す
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (-20, 0, 0), tail: (14, 0, 0)}),
            (8, {head: (26, 0, 0), tail: (-10, 0, 0)}),
            (16, {head: (0, 0, 0), tail: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0), tail: (0, 0, 0)}),
            (4, {head: (20, 0, 0), tail: (-16, 0, 0), legL: (-10, 0, 0), legR: (-10, 0, 0)}),
            (13, {head: (0, 0, 0), tail: (0, 0, 0), legL: (0, 0, 0), legR: (0, 0, 0)}),
        ]),
        # 脚を折りたたみ、頭からうずくまるように小さくなって消える
        ("die", [
            (1, {head: (0, 0, 0)}),
            (9, {head: (30, 0, 0), tail: (20, 0, 0), legL: (-34, 0, 0), legR: (-34, 0, 0),
                 footL: (24, 0, 0), footR: (24, 0, 0)}),
            (20, {head: (54, 0, 0), tail: (34, 0, 0), legL: (-60, 0, 0), legR: (-60, 0, 0),
                  footL: (44, 0, 0), footR: (44, 0, 0)}),
        ]),
    ]


# =================================================================== わすれみずち

# 現在流用している`tsubute`と同じ関節の"種類"(胴の芯+頭+腕+脚、7本の骨)を
# そのまま踏襲する(plan/models/archive/model-wasuremizuchi.md参照)。ただし
# ずんぐりした蛙とは違い、coward(瀕死で離脱)らしい「小柄で華奢な、
# 逃げ足の速さを感じさせる軽いシルエット」にするため、胴・頭・手足の
# 半径をtsubuteよりはっきり細くし、関節間の距離も詰めて小柄にまとめている。
WASURE_HALF = {
    "hip": (0.0, 0.055, 0.150),
    "chest": (0.0, -0.020, 0.185),
    "head": (0.0, -0.110, 0.205),
    "armF.L": (0.105, -0.060, 0.140),
    "handF.L": (0.130, -0.110, 0.065),
    "kneeB.L": (0.115, 0.110, 0.100),
    "ankleB.L": (0.105, 0.020, 0.035),
    "footB.L": (0.090, -0.040, 0.010),
}
WASURE_RADII_HALF = {
    "hip": 0.095, "chest": 0.088, "head": 0.078,
    "armF.L": 0.020, "handF.L": 0.016,
    "kneeB.L": 0.034, "ankleB.L": 0.020, "footB.L": 0.016,
}
WASURE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_wasuremizuchi():
    """
    すっかり忘れ去られた水霊。モヤウツボの成れの果てに近い存在で、
    触れられるとすぐ深みへ逃げ込む(coward)。tsubuteと同じ関節構成を
    使うが、丸々とした蛙ではなく、実体の薄い、今にも霧へ紛れて消えそうな
    小柄で華奢なシルエットにする。頭の後ろから尾のように霧が尾を引き、
    先端ほど小さく淡く消えていく(常に逃げる準備ができている様子)。
    """
    joints = C.mirrored(WASURE_HALF)
    radii = C.mirrored_radii(WASURE_RADII_HALF)
    bones = C.mirrored_bones(WASURE_BONES_HALF)

    body = C.build_skinned("wasuremizuchi", joints, bones, radii, root="chest", subsurf=2)

    # 第2地方(忘れ潮の湿地)のテーマに合わせ、霧と水を思わせる灰みがかった
    # 水色・青緑系でまとめる。背は明るい霧色、腹は沈んだ暗い青灰色、
    # 手足は実体を失いかけた霧そのもののような淡い色の3トーンに塗り分ける。
    dorsal = C.make_material("wasure_dorsal", (0.62, 0.74, 0.75), roughness=0.5, emission=0.05)
    ventral = C.make_material("wasure_ventral", (0.26, 0.34, 0.40), roughness=0.65)
    misty_limb = C.make_material("wasure_limb", (0.78, 0.88, 0.88), roughness=0.35, emission=0.12)

    # 手足(腕・脚)は関節からの距離で判定する(kirimizuchiの触手・
    # nukarumiganiの脚と同じ手法)。胴は高さと中心からの距離で腹面だけを
    # 切り出す(tsubuteと同じ、下から見上げたときだけ見える面に絞る手法)。
    limb_pts = [
        Vector(joints[name])
        for side in ("L", "R")
        for name in (f"armF.{side}", f"handF.{side}", f"kneeB.{side}",
                     f"ankleB.{side}", f"footB.{side}")
    ]

    def classify(c):
        if min((c - p).length for p in limb_pts) < 0.033:
            return 2
        if c.z < 0.115 and abs(c.x) < 0.075:
            return 1
        return 0

    C.assign_materials_by_region(body, [dorsal, ventral, misty_limb], classify)
    counts = [0, 0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"wasuremizuchi: 背{counts[0]} 腹{counts[1]} 手足{counts[2]} "
          f"/ 計{total} ({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    # 怯えて見開いた大きめの目。頭の前面から半分飛び出させる
    for side in (-1.0, 1.0):
        extras += eyeball(f"wasure_eye{side}", (0.032 * side, -0.172, 0.220), 0.028,
                          look=(0.35 * side, -0.9, 0.15), squash=1.1,
                          white=(0.90, 0.95, 0.96), dark=(0.10, 0.15, 0.20))

    # 頭の両脇に、水に紛れる薄い膜状のひれを1枚ずつ
    fin_mat = C.make_material("wasure_fin", (0.70, 0.85, 0.86), roughness=0.3, emission=0.10)
    for side in (-1.0, 1.0):
        fin = C.box(f"wasure_fin{side}", (0.098 * side, -0.095, 0.195),
                    (0.005, 0.052, 0.048), bevel=0.004)
        C.assign_material(fin, fin_mat)
        extras.append(fin)

    # 頭の後ろから尾のように霧が尾を引く。先端ほど小さく・淡く・
    # 発光を強めて、霧へ溶けていく途中のように見せる
    for i, (y, z, r, glow) in enumerate([
        (0.145, 0.165, 0.048, 0.06), (0.215, 0.205, 0.034, 0.18),
        (0.270, 0.245, 0.022, 0.45), (0.310, 0.275, 0.012, 0.9),
    ]):
        wisp_mat = C.make_material(f"wasure_wisp{i}", (0.80, 0.90, 0.90),
                                   roughness=0.25, emission=glow)
        wisp = C.uv_sphere(f"wasure_wisp{i}", (0.0, y, z), r, segments=12, rings=9)
        C.assign_material(wisp, wisp_mat)
        extras.append(wisp)

    mesh = C.join([body] + extras, "wasuremizuchi")
    armature = C.build_armature("wasuremizuchi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def wasuremizuchi_animations():
    head = "chest-head"
    trunk = "chest-hip"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    shinL, shinR = "kneeB.L-ankleB.L", "kneeB.R-ankleB.R"
    return [
        # 絶えず怯えているような、小刻みで落ち着かない待機
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
            (10, {head: (-6, 3, 0), armL: (-8, 0, 6), armR: (-8, 0, -6)}),
            (20, {head: (4, -3, 0), armL: (4, 0, -4), armR: (4, 0, 4)}),
            (30, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
        ]),
        # 逃げ足の速さそのまま、小さく素早く跳ねるように進む
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                 head: (0, 0, 0)}),
            (4, {legL: (40, 0, 0), legR: (-30, 0, 0), shinL: (-24, 0, 0), shinR: (18, 0, 0),
                 head: (6, 0, 0)}),
            (8, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                 head: (0, 0, 0)}),
            (12, {legL: (-30, 0, 0), legR: (40, 0, 0), shinL: (18, 0, 0), shinR: (-24, 0, 0),
                  head: (-6, 0, 0)}),
            (16, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  head: (0, 0, 0)}),
        ]),
        # 怯えながらも一瞬だけ突く弱々しい攻撃。当てたらすぐ引く
        ("attack", [
            (1, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
            (4, {head: (-10, 0, 0), armL: (-30, 0, 14), armR: (-30, 0, -14)}),
            (8, {head: (10, 0, 0), armL: (14, 0, -6), armR: (14, 0, 6)}),
            (16, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
        ]),
        # 大きく仰け反り、すぐさま深みへ逃げ込もうとする
        ("hit", [
            (1, {trunk: (0, 0, 0), head: (0, 0, 0)}),
            (3, {trunk: (-16, 0, 0), head: (18, 0, 0), armL: (-20, 0, 20), armR: (-20, 0, -20)}),
            (12, {trunk: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 霧に溶けるように、輪郭を失ってしゃがみ込む
        ("die", [
            (1, {trunk: (0, 0, 0), head: (0, 0, 0)}),
            (10, {trunk: (-20, 0, 10), head: (24, 0, 0), legL: (-30, 0, 0), legR: (-30, 0, 0),
                  armL: (-40, 0, 30), armR: (-40, 0, -30)}),
            (22, {trunk: (-50, 0, 22), head: (40, 0, 0), legL: (-60, 0, 0), legR: (-60, 0, 0),
                  armL: (-70, 0, 50), armR: (-70, 0, -50)}),
        ]),
    ]




# =================================================================== きのこおとこ

# plan/models/archive/model-kinokootoko.md: 現在流用しているmadoromiの関節構成
# (root-stem-capbase-captop の縦一本、傘は太い→細いの円錐)をベースにしつつ、
# 「眠気を吸い込んで育った茸そのものが人の形に育ったもの」という設定に
# 合わせ、humanoidとして腕・脚を新たに生やす(mabutamushi/nukarumigani/
# ashiatodoriと同じ、「関節の種類は踏襲するが座標構成はゼロから」の方針)。
# 胴の芯はhonegaramiと同じ「hip-chest」の2関節に分け、それぞれに左右対称の
# 脚(thigh)・腕(shoulder)をぶら下げる構成にする。nukarumiganiが検証した
# 「隣接する2つの分岐点がどちらも1親+左右対称2子を持つとSkinが面を
# 解決できず破れる」問題は、honegaramiと同様に分岐する子(thigh.L/R,
# shoulder.L/R)のYを親(hip, chest)とそろえる(前後にずらさない)ことで
# 避けている。
# 首から上は neck -> head(顔) -> capbase(傘の付け根、太い) -> captop(傘の先、
# 細い) の4関節。顔の上に傘がフードのようにかぶさるシルエットにする。
KINOKOOTOKO_HALF = {
    "hip": (0.0, 0.0, 0.32),
    "chest": (0.0, 0.0, 0.50),
    "neck": (0.0, 0.0, 0.60),
    "head": (0.0, -0.01, 0.68),
    "capbase": (0.0, 0.0, 0.80),
    "captop": (0.0, 0.0, 0.95),
    # 腕は肩からはっきり外へ張り出させたうえで下ろす。最初の試作では
    # shoulder/thighのX(横位置)が近く、腕もほぼ真下に垂らしていたため、
    # 静止姿勢(全回転0)で腕と脚が見分けづらく「4本脚の椅子」のような
    # シルエットになってしまった(プレビューで発覚)。honegaramiが
    # 「肩を腰よりずっと外に置き、腕を細くする」ことで腕と脚を
    # はっきり分けているのを踏まえ、肩をさらに外へ、肘・手も横方向へ
    # 張り出させて、脚は逆に胴へ寄せて再設計した。
    "shoulder.L": (0.24, 0.0, 0.52),
    "elbow.L": (0.36, -0.02, 0.46),
    "hand.L": (0.44, -0.05, 0.38),
    "thigh.L": (0.14, 0.0, 0.30),
    "knee.L": (0.145, 0.0, 0.15),
    "foot.L": (0.145, -0.05, 0.02),
}
KINOKOOTOKO_RADII_HALF = {
    # hip/chestはがっしり太く、shoulder/thighは胴の半径をはっきり超える
    # 距離(いずれも胴半径の約1.2〜1.8倍)に置いて呑み込まれないようにする
    # (mabutamushi/ashiatodoriの反省を踏まえ、比率をnukarumigani・
    # honegaramiと同水準以上に確保して検証済み)。腕は脚よりわずかに
    # 細くして、脚(常に真下)と腕(外へ張り出す)をシルエットでも
    # 見分けやすくする。
    "hip": 0.115, "chest": 0.135, "neck": 0.075, "head": 0.105,
    "capbase": 0.300, "captop": 0.050,
    "shoulder.L": 0.075, "elbow.L": 0.052, "hand.L": 0.060,
    "thigh.L": 0.078, "knee.L": 0.058, "foot.L": 0.050,
}
KINOKOOTOKO_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"),
    ("head", "capbase"), ("capbase", "captop"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def kinoko_cap_surface_z(dist: float) -> float:
    """
    傘(head-capbase-captop)の表面の高さ。madoromiのcap_surface_z()と同じ
    考え方で、capbase(半径0.300)からcaptop(半径0.050)へ向かう円錐を
    サブディビジョンで丸まるぶん少し内側に見積もって近似する。
    """
    base_z = KINOKOOTOKO_HALF["capbase"][2]
    top_z = KINOKOOTOKO_HALF["captop"][2]
    base_r = KINOKOOTOKO_RADII_HALF["capbase"] * 0.86
    top_r = KINOKOOTOKO_RADII_HALF["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.014


def build_kinokootoko():
    """
    眠気を吸い込んで育った茸そのものが人の形に育ったもの。melee AIの主力に
    ふさわしく、がっしりした体格で正面から迫る力強いシルエットにする。
    配色は第3地方(まどろみの茸林)のテーマどおり、湿った土色の体に
    胞子の淡い黄土色の傘をかぶった二色構成にする。
    """
    joints = C.mirrored(KINOKOOTOKO_HALF)
    radii = C.mirrored_radii(KINOKOOTOKO_RADII_HALF)
    bones = C.mirrored_bones(KINOKOOTOKO_BONES_HALF)

    body = C.build_skinned("kinokootoko", joints, bones, radii, root="hip", subsurf=2)

    body_mat = C.make_material("kinoko_body", (0.40, 0.29, 0.19), roughness=0.78)
    cap_mat = C.make_material("kinoko_cap", (0.80, 0.70, 0.44), roughness=0.5)

    # 傘(head から上)だけ淡い黄土色にする。腕・脚は傘の高さまで届かないので
    # 高さだけで塗り分けられる(ashiatodoriの背/腹/脚と同じ手法)。
    # しきい値はheadとcapbaseのちょうど中間(0.74)に置き、実際の面数を
    # 数えて偏りがないか検証する。
    CAP_Z = 0.74

    def classify(c):
        return 1 if c.z > CAP_Z else 0

    C.assign_materials_by_region(body, [body_mat, cap_mat], classify)
    cap_faces = sum(1 for p in body.data.polygons if p.material_index == 1)
    total_faces = len(body.data.polygons)
    print(f"kinokootoko: 傘の面 {cap_faces}/{total_faces} ({cap_faces / total_faces:.1%})")

    extras = []

    # 顔。半開きのmadoromiとは違い、正面から迫る力強さを出すため、
    # しっかり見開いた目と、への字に結んだ口にする
    for side in (-1.0, 1.0):
        extras += eyeball(f"kinoko_eye{side}", (0.048 * side, -0.093, 0.688), 0.024,
                          look=(0.2 * side, -1.0, 0.0),
                          white=(0.92, 0.88, 0.72), dark=(0.14, 0.08, 0.05))
    mouth = C.box("kinoko_mouth", (0.0, -0.100, 0.648), (0.034, 0.012, 0.010), bevel=0.003)
    C.assign_material(mouth, C.make_material("kinoko_mouth_m", (0.20, 0.11, 0.08), roughness=0.5))
    extras.append(mouth)

    # 傘の斑点。madoromiと同じく、傘の断面に沿った高さに置かないと
    # 浮いたり埋まったりする(kinoko_cap_surface_zで補正)
    spot_mat = C.make_material("kinoko_spot", (0.94, 0.90, 0.76), roughness=0.6)
    for i, (angle_deg, dist, r) in enumerate([
        (210.0, 0.070, 0.044), (320.0, 0.130, 0.038), (70.0, 0.110, 0.040),
        (150.0, 0.165, 0.032), (20.0, 0.190, 0.026),
    ]):
        angle = math.radians(angle_deg)
        spot = C.uv_sphere(
            f"kinoko_spot{i}",
            (math.cos(angle) * dist, math.sin(angle) * dist, kinoko_cap_surface_z(dist)),
            r, segments=12, rings=8, scale=(1.0, 1.0, 0.40),
        )
        C.assign_material(spot, spot_mat)
        extras.append(spot)

    # 傘の縁から舞い散る胞子。atkMulInSporedRoomのフレーバーに合わせ、
    # 表面からわずかに浮かせた小さな発光球を3つ添える
    # (primitiveを貼るだけの安全な手法。kirimizuchi/nukarumiganiの棘・
    # 瘤と同じ)
    spore_mat = C.make_material("kinoko_spore", (0.86, 0.78, 0.40), roughness=0.4, emission=0.5)
    for i, (angle_deg, dist) in enumerate([(80.0, 0.24), (200.0, 0.27), (320.0, 0.22)]):
        angle = math.radians(angle_deg)
        cx, cy = math.cos(angle) * dist, math.sin(angle) * dist
        spore = C.uv_sphere(f"kinoko_spore{i}", (cx, cy, kinoko_cap_surface_z(dist) + 0.030),
                            0.014, segments=10, rings=8)
        C.assign_material(spore, spore_mat)
        extras.append(spore)

    mesh = C.join([body] + extras, "kinokootoko")
    armature = C.build_armature("kinokootoko", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def kinokootoko_animations():
    hipc = "hip-chest"
    neck = "chest-neck"
    headb = "neck-head"
    capb = "head-capbase"
    captip = "capbase-captop"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # がっしりした体格らしく、大きくは動かず傘だけがゆったり揺れる
        ("idle", [
            (1, {hipc: (0, 0, 0), capb: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (24, {hipc: (2, 0, 1), capb: (-4, 0, 2), captip: (3, 0, -2),
                  armL: (-3, 0, 10), armR: (-3, 0, -10)}),
            (48, {hipc: (0, 0, 0), capb: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
        ]),
        # 力強く踏みしめて歩く。傘は歩調と逆位相で揺れて重みを出す
        ("walk", [
            (1, {legL: (26, 0, 0), legR: (-26, 0, 0), shinL: (-12, 0, 0), shinR: (10, 0, 0),
                 armL: (-18, 0, 6), armR: (18, 0, -6), capb: (4, 0, 0)}),
            (9, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                 armL: (0, 0, 6), armR: (0, 0, -6), capb: (0, 0, 0)}),
            (17, {legL: (-26, 0, 0), legR: (26, 0, 0), shinL: (10, 0, 0), shinR: (-12, 0, 0),
                  armL: (18, 0, 6), armR: (-18, 0, -6), capb: (-4, 0, 0)}),
            (25, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  armL: (0, 0, 6), armR: (0, 0, -6), capb: (0, 0, 0)}),
            (33, {legL: (26, 0, 0), legR: (-26, 0, 0), shinL: (-12, 0, 0), shinR: (10, 0, 0),
                  armL: (-18, 0, 6), armR: (18, 0, -6), capb: (4, 0, 0)}),
        ]),
        # 両腕を振りかぶり、正面へまとめて叩きつける
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0), capb: (0, 0, 0)}),
            (5, {armL: (-70, 0, 20), armR: (-70, 0, -20), hipc: (-10, 0, 0), capb: (6, 0, 0)}),
            (10, {armL: (60, 0, -10), armR: (60, 0, 10), hipc: (16, 0, 0),
                  capb: (-10, 0, 0), captip: (-6, 0, 0)}),
            (20, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0), capb: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), headb: (0, 0, 0)}),
            (4, {hipc: (-16, 0, 0), headb: (-14, 0, 0), capb: (-10, 0, 0),
                 armL: (-18, 0, 20), armR: (-18, 0, -20)}),
            (14, {hipc: (0, 0, 0), headb: (0, 0, 0), capb: (0, 0, 0)}),
        ]),
        # がっしりした図体が根元から崩れ落ちるように倒れる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (10, {hipc: (-30, 0, 8), headb: (-20, 0, 0), capb: (-24, 0, 0),
                  legL: (-24, 0, 0), legR: (-24, 0, 0),
                  armL: (-50, 0, 40), armR: (-50, 0, -40)}),
            (24, {hipc: (-80, 0, 20), headb: (-34, 0, 0), capb: (-40, 0, 0),
                  legL: (-50, 0, 0), legR: (-50, 0, 0),
                  armL: (-85, 0, 60), armR: (-85, 0, -60)}),
        ]),
    ]


# =================================================================== ホウシトビ

# madoromiと同じ「幹1本+傘」の関節の"種類"を土台にしつつ、遠隔で胞子を
# 飛ばす個体として、傘の先から前方・斜め上へ突き出す噴出口(spout)を新たに
# 追加し、傘の背後には発射のたびに開閉する触手状の付属肢(tendril)を
# 垂らす(ashiatodori/nukarumiganiと同じ、関節の"種類"は踏襲しつつ座標構成は
# ゼロから設計する方針)。噴出口・触手はcapbaseの半径(0.215)より
# はっきり遠い位置に置き、皮に飲み込まれて見えなくなる事故を避ける。
# 最初の試作では噴出口を長く水平に伸ばしすぎ、傘とマドロミらしさが消えて
# 一本のバナナ状の塊に見えてしまった。傘の張り出しを大きくし、噴出口を
# 短く・斜め上向きにし、触手を胴の途中ではなく傘の後方へ逃がして
# シルエットの帯状の途切れを解消している。
HOUSHITOBI_HALF = {
    "root": (0.0, 0.0, 0.06),
    "stem": (0.0, 0.0, 0.19),
    "capbase": (0.0, 0.0, 0.33),
    "captop": (0.0, 0.0, 0.45),
    "spout": (0.0, -0.27, 0.43),
    "tendril.L": (0.22, 0.15, 0.26),
    "tendriltip.L": (0.32, 0.24, 0.12),
}
HOUSHITOBI_RADII_HALF = {
    "root": 0.085, "stem": 0.070, "capbase": 0.215, "captop": 0.058,
    "spout": 0.048, "tendril.L": 0.050, "tendriltip.L": 0.020,
}
HOUSHITOBI_BONES_HALF = [
    ("root", "stem"), ("stem", "capbase"), ("capbase", "captop"),
    ("capbase", "spout"),
    ("capbase", "tendril.L"), ("tendril.L", "tendriltip.L"),
]


def build_houshitobi():
    """
    舞い散る胞子の化身。マドロミダケの遠隔版というべき存在(design/characters.md)。
    傘の先からまっすぐ伸びる噴出口を主役にし、左右の触手が発射のたびに
    開いて反動を受け止める構造にする。
    """
    joints = C.mirrored(HOUSHITOBI_HALF)
    radii = C.mirrored_radii(HOUSHITOBI_RADII_HALF)
    bones = C.mirrored_bones(HOUSHITOBI_BONES_HALF)

    body = C.build_skinned("houshitobi", joints, bones, radii, root="root", subsurf=2)

    # 第3地方(まどろみの茸林)のテーマに合わせ、湿った土色の幹と、
    # 胞子を思わせる淡い黄土色の傘・噴出口・触手の2トーンに塗り分ける。
    # 噴出口・触手は関節からの距離(nukarumigani/wasuremizuchiと同じ、
    # 複数関節へのmin距離を使う安全な手法)、傘は高さで判定する
    # (単一の中心距離だけに頼る判定は誤爆した実績があるため避ける)。
    trunk_mat = C.make_material("houshi_trunk", (0.32, 0.23, 0.15), roughness=0.8)
    spore_mat = C.make_material("houshi_spore", (0.82, 0.71, 0.44), roughness=0.55, emission=0.05)

    spore_pts = [
        Vector(joints[name])
        for name in ("spout", "tendril.L", "tendril.R", "tendriltip.L", "tendriltip.R")
    ]

    def classify(c):
        if min((c - p).length for p in spore_pts) < 0.075:
            return 1
        return 1 if c.z > 0.28 else 0

    C.assign_materials_by_region(body, [trunk_mat, spore_mat], classify)
    counts = [0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"houshitobi: 幹{counts[0]} 胞子色{counts[1]} / 計{total} "
          f"({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    # 半分閉じた眠たげな目。madoromiと同じ由来(眠りを誘う胞子)を示す
    for side in (-1.0, 1.0):
        extras += eyeball(f"houshi_eye{side}", (0.072 * side, -0.203, 0.347), 0.026,
                          look=(0.2 * side, -1.0, 0.0), squash=0.45,
                          white=(0.92, 0.90, 0.82), dark=(0.10, 0.08, 0.06))

    # 噴出口の先端。胞子を飛ばす開口部を暗い小さな穴として表現する
    nozzle = C.uv_sphere("houshi_nozzle", (0.0, -0.336, 0.448), 0.028,
                         segments=12, rings=8, scale=(0.85, 0.6, 0.85))
    C.assign_material(nozzle, C.make_material("houshi_nozzle_m", (0.14, 0.10, 0.08), roughness=0.4))
    extras.append(nozzle)

    # 噴出口の先から、飛び散る途中の胞子が尾を引くように、小さく・
    # 淡くなりながら発光を強めて浮遊する(wasuremizuchiの霧の尾と同じ手法)
    for i, (y, z, r, glow) in enumerate([
        (-0.381, 0.458, 0.020, 0.10), (-0.431, 0.478, 0.015, 0.30),
        (-0.471, 0.503, 0.011, 0.60), (-0.506, 0.533, 0.008, 1.0),
    ]):
        mote_mat = C.make_material(f"houshi_mote{i}", (0.90, 0.82, 0.55),
                                   roughness=0.3, emission=glow)
        mote = C.uv_sphere(f"houshi_mote{i}", (0.0, y, z), r, segments=10, rings=8)
        C.assign_material(mote, mote_mat)
        extras.append(mote)

    mesh = C.join([body] + extras, "houshitobi")
    armature = C.build_armature("houshitobi", joints, bones, mesh, root="root")
    return [mesh, armature], armature


def houshitobi_animations():
    trunk1 = "root-stem"
    trunk2 = "stem-capbase"
    cap = "capbase-captop"
    spout = "capbase-spout"
    tendrilL, tendrilR = "capbase-tendril.L", "capbase-tendril.R"
    return [
        # 微かに漂うような、ゆっくりした揺れ
        ("idle", [
            (1, {trunk2: (0, 0, 0), cap: (0, 0, 0), spout: (0, 0, 0),
                 tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
            (28, {trunk2: (3, 0, 2), cap: (-4, 0, -2), spout: (3, 0, 0),
                  tendrilL: (0, 0, 16), tendrilR: (0, 0, -16)}),
            (56, {trunk2: (0, 0, 0), cap: (0, 0, 0), spout: (0, 0, 0),
                  tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
        ]),
        # 左右の触手を交互にはためかせながら漂うように進む
        ("walk", [
            (1, {trunk1: (0, 0, -6), trunk2: (0, 0, 4),
                 tendrilL: (0, 0, 6), tendrilR: (0, 0, -6)}),
            (9, {trunk1: (0, 0, 6), trunk2: (0, 0, -4),
                 tendrilL: (0, 0, -20), tendrilR: (0, 0, 20)}),
            (18, {trunk1: (0, 0, -6), trunk2: (0, 0, 4),
                  tendrilL: (0, 0, 6), tendrilR: (0, 0, -6)}),
            (27, {trunk1: (0, 0, 6), trunk2: (0, 0, -4),
                  tendrilL: (0, 0, -20), tendrilR: (0, 0, 20)}),
            (36, {trunk1: (0, 0, -6), trunk2: (0, 0, 4),
                  tendrilL: (0, 0, 6), tendrilR: (0, 0, -6)}),
        ]),
        # ためてから噴出口を勢いよく突き出し、胞子を撃ち放つ
        ("attack", [
            (1, {spout: (0, 0, 0), trunk2: (0, 0, 0), cap: (0, 0, 0),
                 tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
            (5, {spout: (24, 0, 0), trunk2: (-9, 0, 0), cap: (6, 0, 0),
                 tendrilL: (0, 0, 24), tendrilR: (0, 0, -24)}),
            (10, {spout: (-32, 0, 0), trunk2: (11, 0, 0), cap: (-14, 0, 0),
                  tendrilL: (0, 0, -6), tendrilR: (0, 0, 6)}),
            (20, {spout: (0, 0, 0), trunk2: (0, 0, 0), cap: (0, 0, 0),
                  tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
        ]),
        ("hit", [
            (1, {trunk2: (0, 0, 0), cap: (0, 0, 0)}),
            (4, {trunk2: (-16, 0, 0), cap: (-14, 0, 0),
                 tendrilL: (0, 0, -12), tendrilR: (0, 0, 12)}),
            (14, {trunk2: (0, 0, 0), cap: (0, 0, 0),
                  tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
        ]),
        # 傘と触手をしぼませながら、幹から崩れ落ちる
        ("die", [
            (1, {trunk1: (0, 0, 0), trunk2: (0, 0, 0)}),
            (10, {trunk1: (-20, 0, 8), trunk2: (-24, 0, 4), cap: (-14, 0, 0),
                  tendrilL: (-10, 0, -28), tendrilR: (-10, 0, 28), spout: (18, 0, 0)}),
            (24, {trunk1: (-50, 0, 16), trunk2: (-56, 0, 10), cap: (-30, 0, 0),
                  tendrilL: (-20, 0, -58), tendrilR: (-20, 0, 58), spout: (44, 0, 0)}),
        ]),
    ]




# =========================================================================== こだまうさぎ

KODAMAUSAGI_JOINTS = {
    "base": (0.0, 0.0, 0.075),
    "mid": (0.0, 0.008, 0.175),
    "top": (0.0, 0.012, 0.260)
}
KODAMAUSAGI_RADII = {"base": 0.195, "mid": 0.165, "top": 0.082}
KODAMAUSAGI_BONES = [("base", "mid"), ("mid", "top")]


def build_kodamausagi():
    """
    繰り返す木霊。群れで現れる(swarm AI)ため、単体は簡略化した小さな
    シルエットにする。ぷるんと同じ縦2本の骨組みをそのまま流用し、
    丸く詰まった体に耳だけを足して、一目でぷるんと見分けられる形にする。
    配色は第六地方(こだまの尾根)の岩肌の灰色と乾いた土色。
    """
    body = C.build_skinned("kodamausagi", KODAMAUSAGI_JOINTS, KODAMAUSAGI_BONES,
                           KODAMAUSAGI_RADII, root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す(ぷるんと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.02:
            vert.co.z = 0.02 - (0.02 - vert.co.z) * 0.25

    rock = C.make_material("kodamausagi_rock", (0.52, 0.50, 0.47), roughness=0.75)
    earth = C.make_material("kodamausagi_earth", (0.62, 0.50, 0.36), roughness=0.7)
    C.assign_materials_by_region(body, [rock, earth], lambda c: 1 if c.z > 0.19 else 0)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamausagi_eye{side}", (0.058 * side, -0.145, 0.220), 0.034,
                          look=(0.2 * side, -1.0, 0.05))
    mouth = C.uv_sphere("kodamausagi_mouth", (0.0, -0.168, 0.148), 0.028,
                        segments=14, rings=10, scale=(1.3, 0.5, 0.55))
    C.assign_material(mouth, C.make_material("kodamausagi_mouth_m", (0.30, 0.22, 0.17), roughness=0.3))
    extras.append(mouth)

    # 耳。cone()はZ軸沿いにしか作れないので回転はかけず、根元(半径大)を
    # 頭の高さに置いて真上へ伸ばすだけにする(honegaramiの歯・
    # ashiatodoriの爪と同じ、回転を使わない貼り付け方)。細く長く、
    # 根元を寄せて、群れの中でも「うさぎ」と分かるシルエットにする
    ear_mat = C.make_material("kodamausagi_ear", (0.66, 0.54, 0.40), roughness=0.68)
    for side in (-1.0, 1.0):
        ear = C.cone(f"kodamausagi_ear{side}", (0.036 * side, 0.014, 0.275),
                     0.026, 0.004, 0.205, segments=10)
        C.assign_material(ear, ear_mat)
        extras.append(ear)

    mesh = C.join([body] + extras, "kodamausagi")
    armature = C.build_armature("kodamausagi", C.mirrored(KODAMAUSAGI_JOINTS),
                                KODAMAUSAGI_BONES, mesh, root="base")
    return [mesh, armature], armature


def kodamausagi_animations():
    """既存5クリップの構成をそのまま流用する(骨の名前がぷるんと同じため、そのまま使える)。"""
    return purun_animations()


# =========================================================================== こだまぐも

KODAMAGUMO_JOINTS = {
    "base": (0.0, 0.0, 0.065),
    "mid": (0.0, 0.0, 0.145),
    "top": (0.0, 0.0, 0.205),
}
KODAMAGUMO_RADII = {"base": 0.220, "mid": 0.195, "top": 0.135}
KODAMAGUMO_BONES = [("base", "mid"), ("mid", "top")]

# 芯の周りに膨らみを足す位置。(x, y, z, radius)。中心からのめり込ませて
# 融合させ、継ぎ目のない一枚のもこもこした雲の輪郭にする
KODAMAGUMO_PUFFS = [
    (0.0, -0.03, 0.235, 0.088),
    (0.135, 0.02, 0.185, 0.078),
    (-0.135, 0.02, 0.185, 0.078),
    (0.0, 0.115, 0.165, 0.075),
    (0.08, -0.06, 0.14, 0.07),
    (-0.08, -0.06, 0.14, 0.07),
]


def build_kodamagumo():
    """
    響きに寄ってくる、雲のような群れ。こだまうさぎと同じく`purun`の縦2本の
    骨組みをそのまま流用するが、芯を雫形ではなく低く扁平な塊にし、周囲に
    小さな膨らみ(uv_sphere)をめり込ませて融合させることで、もこもことした
    雲の輪郭を作る。群れ配置(swarm AI)に合わせ、単体は簡略化した
    小さなシルエットにとどめる。
    """
    body = C.build_skinned("kodamagumo", KODAMAGUMO_JOINTS, KODAMAGUMO_BONES,
                           KODAMAGUMO_RADII, root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す(ぷるんと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.02:
            vert.co.z = 0.02 - (0.02 - vert.co.z) * 0.25

    puffs = []
    for i, (px, py, pz, pr) in enumerate(KODAMAGUMO_PUFFS):
        puffs.append(C.uv_sphere(f"kodamagumo_puff{i}", (px, py, pz), pr,
                                 segments=14, rings=10))
    body = C.join([body] + puffs, "kodamagumo")

    # 配色は岩肌の灰色を主体に、めくれた雲の縁だけ乾いた土色をのぞかせる
    rock = C.make_material("kodamagumo_rock", (0.58, 0.57, 0.56), roughness=0.82)
    earth = C.make_material("kodamagumo_earth", (0.60, 0.48, 0.34), roughness=0.7)
    C.assign_materials_by_region(body, [rock, earth], lambda c: 1 if c.z < 0.155 else 0)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamagumo_eye{side}", (0.062 * side, -0.185, 0.165), 0.036,
                          look=(0.2 * side, -1.0, 0.05))
    mouth = C.uv_sphere("kodamagumo_mouth", (0.0, -0.205, 0.098), 0.028,
                        segments=14, rings=10, scale=(1.3, 0.5, 0.55))
    C.assign_material(mouth, C.make_material("kodamagumo_mouth_m", (0.28, 0.20, 0.15), roughness=0.3))
    extras.append(mouth)

    mesh = C.join([body] + extras, "kodamagumo")
    armature = C.build_armature("kodamagumo", C.mirrored(KODAMAGUMO_JOINTS),
                                KODAMAGUMO_BONES, mesh, root="base")
    return [mesh, armature], armature


def kodamagumo_animations():
    """既存5クリップの構成をそのまま流用する(骨の名前がぷるんと同じため、そのまま使える)。"""
    return purun_animations()


# =================================================================== ねぼすけがえる

# ツブテガエルの遠い親戚(design/characters.md)。「元にする骨格: 現在流用している
# tsubuteと同じ関節構成をベースに」という計画書の指示どおり、TSUBUTE_HALFと
# 同じ関節の"種類"(hip/chest/head/armF/handF/kneeB/ankleB/footB)を踏襲しつつ、
# より深く眠る・小柄で華奢な個体として座標だけをゼロから設計し直す。
# 石を投げるツブテガエルと違い、ねぼすけがえるは何も持たない
# (起こされると跳ねて反撃するだけで、遠隔攻撃はしない)。
#
# 最初の試作では位置・太さの両方を単純に約0.7〜0.85倍に縮小したところ、
# プレビューで四肢がほぼ判別できない一塊の団子になってしまった
# (デバッグ用に関節ごとに色分けして描画すると、四肢のジオメトリ自体は
# 存在するが、体格を縮めたことで既定の光源セットに対して相対的に大きく
# 平坦なライティングになり、微妙な凹凸が潰れて見えることが分かった)。
# maxHp22はtsubute(14)より高いという計画書の指示("ステータスに見合う
# 大きさに調整する")とも整合するよう、全体サイズはtsubuteとほぼ同等
# (関節位置は1.08倍)にしたまま、太さだけを細く(半径0.82倍)して、
# 華奢さは「小さくする」のではなく「四肢を細く長く見せる」ことで表現する。
# これにより関節が親の半径をはっきり超えて突き出すようになった。
NEBOSUKE_HALF = {
    "hip": (0.0, 0.108, 0.184),
    "chest": (0.0, -0.054, 0.205),
    "head": (0.0, -0.216, 0.194),
    "armF.L": (0.151, -0.151, 0.097),
    "handF.L": (0.173, -0.216, 0.022),
    "kneeB.L": (0.205, 0.108, 0.205),
    "ankleB.L": (0.184, -0.043, 0.065),
    "footB.L": (0.173, -0.151, 0.024),
}
NEBOSUKE_RADII_HALF = {
    "hip": 0.1353, "chest": 0.1435, "head": 0.1189,
    "armF.L": 0.0312, "handF.L": 0.0344,
    "kneeB.L": 0.0615, "ankleB.L": 0.0410, "footB.L": 0.0369,
}
NEBOSUKE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nebosukegaeru():
    """
    ツブテガエルの遠い親戚だが、ずんぐりしたtsubuteよりひと回り小さく
    華奢な体つき。まぶたが重く垂れた眠たげな目が、ふだんは動かず眠って
    いる生態を表す。第3地方(まどろみの茸林)のテーマに合わせ、湿った
    土色の背と、胞子を思わせる淡い黄土色の腹の2トーンに塗り分ける。
    """
    joints = C.mirrored(NEBOSUKE_HALF)
    radii = C.mirrored_radii(NEBOSUKE_RADII_HALF)
    bones = C.mirrored_bones(NEBOSUKE_BONES_HALF)

    body = C.build_skinned("nebosukegaeru", joints, bones, radii, root="chest", subsurf=2)
    soil = C.make_material("nebosuke_soil", (0.30, 0.22, 0.15), roughness=0.85)
    spore = C.make_material("nebosuke_spore", (0.80, 0.70, 0.44), roughness=0.6)
    # tsubuteと同じく、真下を向いた面だけを腹色にする(高さだけで切ると
    # 横腹に水平の不自然な線が入るため)
    C.assign_materials_by_region(
        body, [soil, spore],
        lambda c: 1 if (c.z < 0.115 and abs(c.x) < 0.15) else 0,
    )
    counts = [0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"nebosukegaeru: 土色{counts[0]} 胞子色{counts[1]} / 計{total} "
          f"({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    for side in (-1.0, 1.0):
        # まぶたが重く垂れた眠たげな目
        extras += eyeball(f"nebosuke_eye{side}", (0.095 * side, -0.232, 0.300), 0.051,
                          look=(0.2 * side, -0.85, -0.1), squash=0.42,
                          white=(0.88, 0.86, 0.76), dark=(0.10, 0.08, 0.06))
        # まぶた自体を、目の上半分に被せる土色の薄いドームとして追加する。
        # squashだけでは離れて見ると眠たげさが伝わりにくいため、tsubuteの
        # 大きく見開いた目との違いをはっきりさせる
        lid = C.uv_sphere(f"nebosuke_lid{side}", (0.095 * side, -0.225, 0.316), 0.052,
                          segments=14, rings=10, scale=(1.0, 0.85, 0.55))
        C.assign_material(lid, soil)
        extras.append(lid)
    mouth = C.box("nebosuke_mouth", (0.0, -0.324, 0.157), (0.168, 0.040, 0.018), bevel=0.008)
    C.assign_material(mouth, C.make_material("nebosuke_mouth_m", (0.18, 0.24, 0.14), roughness=0.5))
    extras.append(mouth)

    mesh = C.join([body] + extras, "nebosukegaeru")
    armature = C.build_armature("nebosukegaeru", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nebosukegaeru_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # ふだんは動かず深く眠っている。tsubuteの活発な首振りと違い、
        # ごく僅かな寝息だけのほとんど静止したモーションにする
        ("idle", [
            (1, {head: (2, 0, 0)}),
            (48, {head: (5, 0, 0)}),
            (96, {head: (2, 0, 0)}),
        ]),
        # 眠ったまま、それでも逃げ足の速さを感じさせる小刻みな跳びはね
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (4, {legL: (40, 0, 0), legR: (40, 0, 0), head: (14, 0, 0)}),
            (8, {legL: (-30, 0, 0), legR: (-30, 0, 0), head: (-14, 0, 0),
                 armL: (-24, 0, 0), armR: (-24, 0, 0)}),
            (13, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 起こされて跳ねて反撃する。石は投げず、深くしゃがんでから
        # 全身で相手に飛びかかる大きな一跳ね
        ("attack", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                 armL: (0, 0, 0), armR: (0, 0, 0)}),
            (4, {legL: (52, 0, 0), legR: (52, 0, 0), head: (18, 0, 0),
                 armL: (30, 0, 0), armR: (30, 0, 0)}),
            (8, {legL: (-64, 0, 0), legR: (-64, 0, 0), head: (-26, 0, 0),
                 armL: (-58, 0, 0), armR: (-58, 0, 0)}),
            (14, {legL: (10, 0, 0), legR: (10, 0, 0), head: (6, 0, 0),
                  armL: (-10, 0, 0), armR: (-10, 0, 0)}),
            (20, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                  armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (20, 0, 0), armL: (-24, 0, 18), armR: (-24, 0, -18)}),
            (14, {head: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {head: (0, 0, 0)}),
            (10, {head: (24, 0, 0), legL: (-36, 0, 0), legR: (-36, 0, 0)}),
            (24, {head: (36, 0, 0), legL: (-72, 0, 0), legR: (-72, 0, 0),
                  armL: (-64, 0, 26), armR: (-64, 0, -26)}),
        ]),
    ]


# =================================================================== まどろみぐも

# plan/models/archive/model-madoromigumo.md: 現在流用しているtsubuteの「胴の芯+そこから
# 伸びる肢」という関節構成の"種類"を踏襲する。
#
# 【試作の失敗、繰り返し】まどろみぐもは蜘蛛らしい多脚のシルエットが要になる
# ため、最初は「胴の芯となる1つのSkinメッシュに、複数対の脚をまとめてぶら
# 下げる」構成を何通りも試した(単一関節に4対、4関節の鎖に1対ずつ、3対を
# Zの高さでずらす、脚を2対に減らしてnukarumigani並みに離す、太さを変える、
# など)。だが対の数を問わず、脚が「胴と同じ1枚のSkinケージ」の一部として
# 生成される限り、根元でヒレ状/水かき状に融合してしまうとわかった
# (subsurf=0の生のSkinケージを確認したところ、脚の断面が最初から平たい
# 三角形のくさび形になっており、Subdivisionの強さの問題ではなく、太い胴と
# 細い脚が同じケージ内で解決される際の根本的な限界だった)。
# 【対策】胴(head-body-waist-abdomen)はこれまでどおり単一のSkinメッシュに
# するが、脚は胴のケージに含めず、脚1本ごとに独立した小さなSkinチェーン
# (root-knee-footの3関節)として別々にビルドする。purun/madoromiのような
# 分岐のない一本の鎖は太さが変わってもきれいな丸いカプセル形になることを
# 踏まえたもの。各脚の根元(root)を胴の表面にわずかに埋め込む位置に置き、
# join()で胴と結合することで、Skinケージを共有せずに継ぎ目なく生えて見える
# 脚を作る。アーマチュア(関節とボーン)はこれまでどおり胴と脚をまとめた
# 1つの骨格として組み、自動ウェイトで全体に紐づける(ボーンの木構造さえ
# 正しければ、メッシュがどのSkin呼び出し由来かはウェイト付けに影響しない)。
# この方式は脚どうしの干渉が原理的に起きないため、4対8本の蜘蛛らしい脚数を
# 安全に実現できる。
MADOROMIGUMO_HALF = {
    "head": (0.0, -0.180, 0.078),
    "body": (0.0, -0.010, 0.115),
    "waist": (0.0, 0.110, 0.100),
    "abdomen": (0.0, 0.210, 0.110),
}
MADOROMIGUMO_RADII_HALF = {
    "head": 0.058, "body": 0.140, "waist": 0.032, "abdomen": 0.120,
}
MADOROMIGUMO_BODY_BONES_HALF = [
    ("body", "head"), ("body", "waist"), ("waist", "abdomen"),
]

# 脚4対(前から順にA〜D)。付け根(leg*)は胴の表面よりやや内側に置いて
# 埋め込み、Zは軽く波打たせて(高い→低い→高い→低い)横から見たときの
# シルエットに単調さが出ないようにする。footは前後にずらして扇状に開く。
MADOROMIGUMO_LEGS = {
    "A": {"root": (0.075, -0.145, 0.145), "knee": (0.230, -0.175, 0.160),
          "foot": (0.330, -0.235, 0.020)},
    "B": {"root": (0.080, -0.035, 0.095), "knee": (0.235, -0.050, 0.115),
          "foot": (0.335, -0.075, 0.016)},
    "C": {"root": (0.080, 0.075, 0.145), "knee": (0.235, 0.095, 0.160),
          "foot": (0.335, 0.135, 0.020)},
    "D": {"root": (0.075, 0.185, 0.095), "knee": (0.230, 0.225, 0.115),
          "foot": (0.330, 0.290, 0.016)},
}
MADOROMIGUMO_LEG_RADII = {"root": 0.034, "knee": 0.025, "foot": 0.014}


def _madoromigumo_full_skeleton():
    """胴+脚すべてを含む、アーマチュア用の統合済み関節・ボーン一覧を返す。"""
    joints = dict(MADOROMIGUMO_HALF)
    radii = dict(MADOROMIGUMO_RADII_HALF)
    bones = list(MADOROMIGUMO_BODY_BONES_HALF)
    for leg, pts in MADOROMIGUMO_LEGS.items():
        for side in ("L", "R"):
            sign = -1.0 if side == "L" else 1.0
            root_name, knee_name, foot_name = f"leg{leg}.{side}", f"knee{leg}.{side}", f"foot{leg}.{side}"
            rx, ry, rz = pts["root"]
            kx, ky, kz = pts["knee"]
            fx, fy, fz = pts["foot"]
            joints[root_name] = Vector((rx * sign, ry, rz))
            joints[knee_name] = Vector((kx * sign, ky, kz))
            joints[foot_name] = Vector((fx * sign, fy, fz))
            radii[root_name] = MADOROMIGUMO_LEG_RADII["root"]
            radii[knee_name] = MADOROMIGUMO_LEG_RADII["knee"]
            radii[foot_name] = MADOROMIGUMO_LEG_RADII["foot"]
            bones.append(("body", root_name))
            bones.append((root_name, knee_name))
            bones.append((knee_name, foot_name))
    return joints, radii, bones


def build_madoromigumo():
    """
    まどろみの隙間に糸を張る蜘蛛。隣接するまで気配を消し、油断したところに
    噛みつく(ambush)。周囲に溶け込むよう、平たく低いシルエットにし、
    配色も第3地方(まどろみの茸林)らしい湿った土色を基調にした目立たない
    ものにする。腹部の背にだけ、胞子の淡い黄土色の斑紋を置く。
    """
    joints, radii, bones = _madoromigumo_full_skeleton()

    # 胴(head-body-waist-abdomen)だけを1枚のSkinメッシュにする(脚は含めない)
    body_bones = C.mirrored_bones(MADOROMIGUMO_BODY_BONES_HALF)
    body = C.build_skinned("madoromigumo", joints, body_bones, radii, root="body", subsurf=2)

    skin = C.make_material("madoromi_gumo_skin", (0.28, 0.21, 0.15), roughness=0.80)
    mark = C.make_material("madoromi_gumo_mark", (0.70, 0.60, 0.36), roughness=0.55)
    # 斑紋は腹部(waistより後ろ)の背側だけに限る。tsubuteの背/腹の塗り分け
    # (高さだけで切る)と違い、この体はabdomenとbodyがほぼ同じ高さのため、
    # 体の前後位置(Y)と高さ(Z)を組み合わせて、腰の先の腹部上面だけを
    # 切り出す(位置ベースの分類。高さだけでは腹部を切り出せない形状)。
    C.assign_materials_by_region(
        body, [skin, mark],
        lambda c: 1 if (c.y > 0.16 and c.z > 0.075) else 0,
    )
    mark_faces = sum(1 for p in body.data.polygons if p.material_index == 1)
    total_faces = len(body.data.polygons)
    print(f"madoromigumo: 腹部の斑紋 {mark_faces}/{total_faces} "
          f"({mark_faces / total_faces:.1%})")

    leg_mat = C.make_material("madoromi_gumo_leg", (0.24, 0.18, 0.13), roughness=0.85)
    extras = []

    # 脚1本ごとに独立したSkinチェーンとしてビルドする(胴のケージとは共有
    # しない)。root-knee-footの3関節だけの分岐のない鎖なので、太さが胴より
    # ずっと細くてもSkinモディファイアがきれいな丸いカプセル状に解決する。
    for leg, pts in MADOROMIGUMO_LEGS.items():
        for side in ("L", "R"):
            sign = -1.0 if side == "L" else 1.0
            root_name, knee_name, foot_name = f"leg{leg}.{side}", f"knee{leg}.{side}", f"foot{leg}.{side}"
            leg_joints = {
                root_name: joints[root_name],
                knee_name: joints[knee_name],
                foot_name: joints[foot_name],
            }
            leg_bones = [(root_name, knee_name), (knee_name, foot_name)]
            leg_radii = {
                root_name: MADOROMIGUMO_LEG_RADII["root"],
                knee_name: MADOROMIGUMO_LEG_RADII["knee"],
                foot_name: MADOROMIGUMO_LEG_RADII["foot"],
            }
            leg_obj = C.build_skinned(f"madoromi_leg{leg}{side}", leg_joints, leg_bones,
                                      leg_radii, root=root_name, subsurf=0)
            C.assign_material(leg_obj, leg_mat)
            extras.append(leg_obj)

    # 目。ただし「気配を消す」設定に合わせ、白目を明るくしすぎず、くすんだ色で
    # まとめて目立たなくする(tsubuteのような明瞭な白目にはしない)。三角形数の
    # 予算(既存モデルの1,800〜7,500程度)に収めるため1対だけに絞る。
    eye_white = (0.52, 0.49, 0.43)
    eye_dark = (0.08, 0.07, 0.06)
    for side in (-1.0, 1.0):
        extras += eyeball(f"madoromi_eye_main{side}", (0.028 * side, -0.235, 0.086), 0.018,
                          look=(0.25 * side, -1.0, 0.05), white=eye_white, dark=eye_dark)

    # 牙。radius_bottom(-Z側)を細く、radius_top(+Z側)を太くして、回転させず
    # そのまま下向きの牙にする(cone()をrotation_eulerで傾けると原点中心に
    # 回ってしまうため、mabutamushiの反省を踏まえ最初から向きを作り込む)。
    fang_mat = C.make_material("madoromi_fang", (0.62, 0.58, 0.48), roughness=0.35)
    for side in (-1.0, 1.0):
        fang = C.cone(f"madoromi_fang{side}", (0.020 * side, -0.243, 0.050),
                     0.003, 0.015, 0.045, segments=8)
        C.assign_material(fang, fang_mat)
        extras.append(fang)

    mesh = C.join([body] + extras, "madoromigumo")
    armature = C.build_armature("madoromigumo", joints, bones, mesh, root="body")
    return [mesh, armature], armature


def madoromigumo_animations():
    head = "body-head"
    abdomen = "waist-abdomen"
    legA_L, legA_R = "body-legA.L", "body-legA.R"
    legB_L, legB_R = "body-legB.L", "body-legB.R"
    legC_L, legC_R = "body-legC.L", "body-legC.R"
    legD_L, legD_R = "body-legD.L", "body-legD.R"
    return [
        # 気配を消して潜む。ほぼ静止したまま、腹だけがわずかに上下する
        ("idle", [
            (1, {abdomen: (0, 0, 0)}),
            (28, {abdomen: (-3, 0, 0), legB_L: (2, 0, 2), legB_R: (-2, 0, -2)}),
            (56, {abdomen: (0, 0, 0)}),
        ]),
        # 対角の脚(A・C / B・D)を互い違いに踏み出す
        ("walk", [
            (1, {legA_L: (22, 0, 6), legA_R: (-22, 0, -6),
                 legC_L: (22, 0, 6), legC_R: (-22, 0, -6),
                 legB_L: (-20, 0, -6), legB_R: (20, 0, 6),
                 legD_L: (-20, 0, -6), legD_R: (20, 0, 6), head: (3, 0, 0)}),
            (5, {legA_L: (0, 0, 0), legA_R: (0, 0, 0),
                 legC_L: (0, 0, 0), legC_R: (0, 0, 0),
                 legB_L: (0, 0, 0), legB_R: (0, 0, 0),
                 legD_L: (0, 0, 0), legD_R: (0, 0, 0), head: (0, 0, 0)}),
            (9, {legA_L: (-20, 0, -6), legA_R: (20, 0, 6),
                 legC_L: (-20, 0, -6), legC_R: (20, 0, 6),
                 legB_L: (22, 0, 6), legB_R: (-22, 0, -6),
                 legD_L: (22, 0, 6), legD_R: (-22, 0, -6), head: (-3, 0, 0)}),
            (13, {legA_L: (0, 0, 0), legA_R: (0, 0, 0),
                  legC_L: (0, 0, 0), legC_R: (0, 0, 0),
                  legB_L: (0, 0, 0), legB_R: (0, 0, 0),
                  legD_L: (0, 0, 0), legD_R: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 潜んでいた姿勢から前脚を突き出し、首を打ちつけるように噛みつく
        # (ambushStrike=ふいのいちげき)
        ("attack", [
            (1, {head: (0, 0, 0), legA_L: (0, 0, 0), legA_R: (0, 0, 0)}),
            (4, {head: (-18, 0, 0), legA_L: (-30, 0, -10), legA_R: (30, 0, 10)}),
            (8, {head: (26, 0, 0), legA_L: (34, 0, 8), legA_R: (-34, 0, -8)}),
            (18, {head: (0, 0, 0), legA_L: (0, 0, 0), legA_R: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0), abdomen: (0, 0, 0)}),
            (4, {head: (16, 0, 0), abdomen: (-10, 0, 0),
                 legB_L: (-14, 0, 10), legB_R: (14, 0, -10)}),
            (14, {head: (0, 0, 0), abdomen: (0, 0, 0)}),
        ]),
        # 脚を内側へ丸め込みながら息絶える、死んだ蜘蛛特有の姿勢
        ("die", [
            (1, {head: (0, 0, 0)}),
            (10, {head: (20, 0, 0), abdomen: (10, 0, 0),
                  legA_L: (-40, 0, -30), legA_R: (40, 0, 30),
                  legB_L: (-46, 0, -26), legB_R: (46, 0, 26),
                  legC_L: (-46, 0, 26), legC_R: (46, 0, -26),
                  legD_L: (-40, 0, 30), legD_R: (40, 0, -30)}),
            (24, {head: (30, 0, 0), abdomen: (18, 0, 0),
                  legA_L: (-70, 0, -46), legA_R: (70, 0, 46),
                  legB_L: (-78, 0, -40), legB_R: (78, 0, 40),
                  legC_L: (-78, 0, 40), legC_R: (78, 0, -40),
                  legD_L: (-70, 0, 46), legD_R: (70, 0, -46)}),
        ]),
    ]




# =================================================================== かえるこだま

# ツブテガエルの遠い親戚(design/characters.md)。ねぼすけがえると同じく
# TSUBUTE_HALFと同じ関節の"種類"を踏襲しつつ座標はゼロから設計するが、
# 性格は正反対: 眠りこけるねぼすけがえるに対し、かえるこだまは「気配に
# 敏感ですぐ逃げる」臆病者(coward AI)。逃げ足の速さを見せるため、後ろ足
# (kneeB/ankleB/footB)をtsubuteよりも高く大きく張り出させ、いつでも
# 跳べる姿勢にする。石は持たない(遠隔攻撃はせず、追い詰められたときだけ
# 跳んで反撃するcounterDamageRatio)。
KAERUKODAMA_HALF = {
    "hip": (0.0, 0.125, 0.150),
    "chest": (0.0, -0.048, 0.168),
    "head": (0.0, -0.192, 0.166),
    "armF.L": (0.118, -0.118, 0.078),
    "handF.L": (0.136, -0.176, 0.018),
    "kneeB.L": (0.232, 0.128, 0.214),
    "ankleB.L": (0.204, -0.028, 0.062),
    "footB.L": (0.188, -0.128, 0.020),
}
KAERUKODAMA_RADII_HALF = {
    "hip": 0.118, "chest": 0.128, "head": 0.106,
    "armF.L": 0.026, "handF.L": 0.029,
    "kneeB.L": 0.056, "ankleB.L": 0.036, "footB.L": 0.032,
}
KAERUKODAMA_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kaerukodama():
    """
    跳ね返る声を追いかける、tsubuteの小柄で華奢な遠縁。いつでも跳べるよう
    後ろ足を高く畳んだ姿勢にし、常に周囲をうかがう大きく見開いた目で
    「気配に敏感ですぐ逃げる」性質を表す。配色は第六地方(こだまの尾根)の
    岩肌の灰色と乾いた土色。喉には、声を跳ね返す由来にちなんだ小さな
    鳴き袋を足す。
    """
    joints = C.mirrored(KAERUKODAMA_HALF)
    radii = C.mirrored_radii(KAERUKODAMA_RADII_HALF)
    bones = C.mirrored_bones(KAERUKODAMA_BONES_HALF)

    body = C.build_skinned("kaerukodama", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("kaerukodama_rock", (0.56, 0.55, 0.53), roughness=0.78)
    earth = C.make_material("kaerukodama_earth", (0.62, 0.50, 0.36), roughness=0.65)
    # 腹は下から見上げたときだけ見えるよう、真下を向いた面に限る
    # (tsubuteと同じく、高さだけで切ると横腹に水平の線が入って不自然になる)
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if (c.z < 0.095 and abs(c.x) < 0.13) else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        # 常に警戒しているような、大きく見開いた目
        extras += eyeball(f"kaerukodama_eye{side}", (0.084 * side, -0.222, 0.258), 0.058,
                          look=(0.3 * side, -0.85, 0.2))
    mouth = C.box("kaerukodama_mouth", (0.0, -0.296, 0.132), (0.166, 0.040, 0.017), bevel=0.008)
    C.assign_material(mouth, C.make_material("kaerukodama_mouth_m", (0.20, 0.17, 0.13), roughness=0.45))
    extras.append(mouth)
    # 声を跳ね返す由来にちなんだ、喉の小さな鳴き袋
    pouch = C.uv_sphere("kaerukodama_pouch", (0.0, -0.245, 0.098), 0.040,
                        segments=12, rings=9, scale=(1.0, 0.9, 0.75))
    C.assign_material(pouch, earth)
    extras.append(pouch)

    mesh = C.join([body] + extras, "kaerukodama")
    armature = C.build_armature("kaerukodama", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kaerukodama_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 常にそわそわと周囲をうかがう、落ち着かない待機
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (10, {head: (10, 14, 0)}),
            (20, {head: (8, -16, 0)}),
            (30, {head: (0, 0, 0)}),
        ]),
        # tsubuteより素早く、小刻みに跳ねて逃げる
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (3, {legL: (44, 0, 0), legR: (44, 0, 0), head: (14, 0, 0)}),
            (7, {legL: (-34, 0, 0), legR: (-34, 0, 0), head: (-16, 0, 0),
                 armL: (-30, 0, 0), armR: (-30, 0, 0)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 石は投げず、追い詰められて仕方なく全身で跳びかかる一撃
        ("attack", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                 armL: (0, 0, 0), armR: (0, 0, 0)}),
            (4, {legL: (56, 0, 0), legR: (56, 0, 0), head: (20, 0, 0),
                 armL: (34, 0, 0), armR: (34, 0, 0)}),
            (8, {legL: (-68, 0, 0), legR: (-68, 0, 0), head: (-28, 0, 0),
                 armL: (-60, 0, 0), armR: (-60, 0, 0)}),
            (14, {legL: (8, 0, 0), legR: (8, 0, 0), head: (4, 0, 0),
                  armL: (-8, 0, 0), armR: (-8, 0, 0)}),
            (20, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                  armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (24, 0, 0), armL: (-30, 0, 22), armR: (-30, 0, -22)}),
            (12, {head: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {head: (0, 0, 0)}),
            (9, {head: (26, 0, 0), legL: (-38, 0, 0), legR: (-38, 0, 0)}),
            (20, {head: (38, 0, 0), legL: (-74, 0, 0), legR: (-74, 0, 0),
                  armL: (-66, 0, 26), armR: (-66, 0, -26)}),
        ]),
    ]


# ===================================================================== やまびこおに

# honegaramiと同じ人型の骨組み(hip/chest/neck/head/crown、
# shoulder/elbow/hand、thigh/knee/foot)をベースにするが、honegaramiの
# 「骨が浮いた細い体」とは正反対の「がっしりした体格」を作るため、
# 座標・太さともに大きく変える: 胴と肩を横に張り出させ、四肢の半径を
# honegaramiの2倍前後まで太くする。声そのものが実体化した鬼という由来から、
# 頭に角を2本足し、honegaramiの眼窩(暗い落ちくぼみ)とは逆に、
# 響きが宿っているような発光する目にする。
YAMABIKOONI_HALF = {
    "hip": (0.0, 0.0, 0.335),
    "chest": (0.0, 0.0, 0.565),
    "neck": (0.0, 0.0, 0.685),
    "head": (0.0, -0.012, 0.805),
    "crown": (0.0, 0.0, 0.905),
    "shoulder.L": (0.175, 0.0, 0.605),
    "elbow.L": (0.250, 0.015, 0.440),
    "hand.L": (0.258, -0.030, 0.295),
    "thigh.L": (0.100, 0.0, 0.320),
    "knee.L": (0.106, 0.0, 0.160),
    "foot.L": (0.110, -0.035, 0.020),
}
YAMABIKOONI_RADII_HALF = {
    "hip": 0.128, "chest": 0.138, "neck": 0.058, "head": 0.148, "crown": 0.040,
    "shoulder.L": 0.068, "elbow.L": 0.054, "hand.L": 0.062,
    "thigh.L": 0.076, "knee.L": 0.062, "foot.L": 0.066,
}
YAMABIKOONI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_yamabikooni():
    """
    やまびこぎつねの呼び声に応じて現れる、尾根の奥にひそむ力の強い個体。
    honegaramiと同じ人型骨格をがっしりと太らせ、正面から迫る力強い
    シルエットにする。配色は第六地方(こだまの尾根)の岩肌の灰色と
    乾いた土色。頭には鬼らしい角を2本、声が実体化した由来にちなんで
    発光する目を持たせる。
    """
    joints = C.mirrored(YAMABIKOONI_HALF)
    radii = C.mirrored_radii(YAMABIKOONI_RADII_HALF)
    bones = C.mirrored_bones(YAMABIKOONI_BONES_HALF)

    body = C.build_skinned("yamabikooni", joints, bones, radii, root="hip", subsurf=2)
    rock = C.make_material("yamabikooni_rock", (0.50, 0.48, 0.46), roughness=0.8)
    earth = C.make_material("yamabikooni_earth", (0.56, 0.44, 0.32), roughness=0.7)
    # 腰まわり(腰巻のように見える範囲)だけ乾いた土色にする
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if (0.28 < c.z < 0.40) else 0,
    )

    extras = []
    eye_glow = C.make_material("yamabikooni_eye", (0.95, 0.65, 0.20), roughness=0.3, emission=2.2)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"yamabikooni_eye{side}", (0.062 * side, -0.108, 0.815), 0.026,
                          segments=12, rings=9, scale=(1.0, 0.7, 0.8))
        C.assign_material(eye, eye_glow)
        extras.append(eye)
        # 鬼らしい角。cone()はZ軸沿いにしか作れないので回転はかけず、
        # 根元を頭頂の高さに置いて真上へ伸ばすだけにする
        horn = C.cone(f"yamabikooni_horn{side}", (0.044 * side, 0.010, 0.895),
                     0.026, 0.006, 0.115, segments=10)
        C.assign_material(horn, earth)
        extras.append(horn)
    jaw = C.uv_sphere("yamabikooni_jaw", (0.0, -0.055, 0.735), 0.096,
                      segments=18, rings=12, scale=(0.95, 1.1, 0.6))
    C.assign_material(jaw, rock)
    extras.append(jaw)

    mesh = C.join([body] + extras, "yamabikooni")
    armature = C.build_armature("yamabikooni", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def yamabikooni_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 力強くゆったりとした、鬼らしい構え
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (24, {hipc: (3, 0, 2), neck: (-4, 0, 0), armL: (-6, 0, 14), armR: (-6, 0, -14)}),
            (48, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
        ]),
        # honegaramiより重心を落とし、どっしりと踏みしめて歩く
        ("walk", [
            (1, {legL: (20, 0, 0), legR: (-20, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                 armL: (-16, 0, 8), armR: (16, 0, -8)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8)}),
            (19, {legL: (-20, 0, 0), legR: (20, 0, 0), shinL: (6, 0, 0), shinR: (-8, 0, 0),
                  armL: (16, 0, 8), armR: (-16, 0, -8)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8)}),
            (37, {legL: (20, 0, 0), legR: (-20, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                  armL: (-16, 0, 8), armR: (16, 0, -8)}),
        ]),
        # 両腕を振りかぶり、全身をひねって叩きつける大振りの一撃
        ("attack", [
            (1, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0), hipc: (0, 0, 0)}),
            (7, {armR: (-135, 0, -22), foreR: (-34, 0, 0), armL: (-40, 0, 30), foreL: (-10, 0, 0),
                 hipc: (-10, 0, -14), neck: (-6, 0, 0)}),
            (12, {armR: (72, 0, 16), foreR: (10, 0, 0), armL: (30, 0, -4), foreL: (0, 0, 0),
                  hipc: (18, 0, 16), neck: (-10, 0, 0)}),
            (24, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0), hipc: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-14, 0, 0), neck: (-14, 0, 0), armL: (-18, 0, 20), armR: (-18, 0, -20)}),
            (16, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 巨体が崩れ落ちるように、ゆっくりと大きく倒れる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (10, {hipc: (-14, 0, 5), neck: (-20, 0, 0), armL: (-34, 0, 34), armR: (-34, 0, -34)}),
            (28, {hipc: (-82, 0, 16), neck: (-36, 0, 0), legL: (50, 0, 0), legR: (44, 0, 0),
                  armL: (-74, 0, 50), armR: (-74, 0, -50)}),
        ]),
    ]


# ===================================================================== ねだやまびこ

# honegarami・yamabikooniと同じ人型骨組みをベースにするが、「尾根に根を
# 張ってしまった、ほとんど動かない古い響き」(guard AI)という由来から、
# 背が低く前傾した、どっしり構えたシルエットにする。関節の高さを全体的に
# 下げて低い重心を作り、胸から頭にかけて-Y方向(正面側)へわずかに
# 突き出させることで前傾姿勢にする。四肢はyamabikooniよりさらに太く短い。
NEDAYAMABIKO_HALF = {
    "hip": (0.0, 0.0, 0.235),
    "chest": (0.0, 0.020, 0.395),
    "neck": (0.0, 0.032, 0.470),
    "head": (0.0, 0.012, 0.560),
    "crown": (0.0, 0.024, 0.628),
    "shoulder.L": (0.190, 0.020, 0.415),
    "elbow.L": (0.248, 0.050, 0.295),
    "hand.L": (0.240, 0.020, 0.175),
    "thigh.L": (0.108, 0.0, 0.222),
    "knee.L": (0.118, 0.0, 0.108),
    "foot.L": (0.122, -0.038, 0.020),
}
NEDAYAMABIKO_RADII_HALF = {
    "hip": 0.148, "chest": 0.158, "neck": 0.064, "head": 0.132, "crown": 0.032,
    "shoulder.L": 0.078, "elbow.L": 0.064, "hand.L": 0.070,
    "thigh.L": 0.092, "knee.L": 0.075, "foot.L": 0.078,
}
NEDAYAMABIKO_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_nedayamabiko():
    """
    尾根に根を張ってしまった、ほとんど動かない古い響き(guard AI)。
    honegarami・yamabikooniと同じ人型骨組みを、背が低く前傾しどっしりと
    構えたシルエットに作り替え、厚い甲羅状の装甲を背に3つ重ねて岩の塊が
    根を張ったような輪郭にする。配色は第六地方(こだまの尾根)の
    岩肌の灰色(甲羅)と乾いた土色(肌)。
    """
    joints = C.mirrored(NEDAYAMABIKO_HALF)
    radii = C.mirrored_radii(NEDAYAMABIKO_RADII_HALF)
    bones = C.mirrored_bones(NEDAYAMABIKO_BONES_HALF)

    body = C.build_skinned("nedayamabiko", joints, bones, radii, root="hip", subsurf=2)
    skin = C.make_material("nedayamabiko_skin", (0.44, 0.32, 0.22), roughness=0.8)
    C.assign_material(body, skin)

    extras = []
    shell_mat = C.make_material("nedayamabiko_shell", (0.62, 0.61, 0.58), roughness=0.85)
    # 甲羅は頭より確実に低く、背中側(+Y)へはっきり離して重ね、
    # 頭部の輪郭と混ざらないようにする(肩からお尻にかけての上背だけを覆う)
    for dy, dz, r, scale in [
        (0.190, 0.415, 0.145, (1.0, 0.95, 0.85)),
        (0.165, 0.310, 0.112, (0.95, 0.85, 0.80)),
        (0.175, 0.485, 0.098, (0.90, 0.80, 0.72)),
    ]:
        shell = C.uv_sphere(f"nedayamabiko_shell{dz}", (0.0, dy, dz), r,
                            segments=18, rings=13, scale=scale)
        C.assign_material(shell, shell_mat)
        extras.append(shell)

    dark = C.make_material("nedayamabiko_socket", (0.05, 0.05, 0.07), roughness=0.9)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"nedayamabiko_socket{side}", (0.052 * side, -0.038, 0.575), 0.028,
                             segments=12, rings=9, scale=(1.0, 0.85, 1.0))
        C.assign_material(socket, dark)
        extras.append(socket)
    jaw = C.uv_sphere("nedayamabiko_jaw", (0.0, -0.048, 0.512), 0.088,
                      segments=18, rings=12, scale=(0.9, 1.05, 0.55))
    C.assign_material(jaw, shell_mat)
    extras.append(jaw)

    mesh = C.join([body] + extras, "nedayamabiko")
    armature = C.build_armature("nedayamabiko", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def nedayamabiko_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 根を張ったように、ほとんど動かない。かすかな呼吸だけ
        ("idle", [
            (1, {hipc: (0, 0, 0)}),
            (50, {hipc: (1.5, 0, 0.5), neck: (-2, 0, 0)}),
            (100, {hipc: (0, 0, 0)}),
        ]),
        # guard AIでも移動自体は起こりうるため、重く鈍い足取りを用意する
        ("walk", [
            (1, {legL: (14, 0, 0), legR: (-14, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                 armL: (-8, 0, 4), armR: (8, 0, -4)}),
            (14, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
            (27, {legL: (-14, 0, 0), legR: (14, 0, 0), shinL: (5, 0, 0), shinR: (-6, 0, 0),
                  armL: (8, 0, 4), armR: (-8, 0, -4)}),
            (40, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
        ]),
        # 溜めてから、根を張った重心のまま短く鈍く打ち下ろす
        ("attack", [
            (1, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (9, {armR: (-70, 0, -16), hipc: (-6, 0, -8)}),
            (15, {armR: (30, 0, 10), hipc: (10, 0, 8), neck: (-6, 0, 0)}),
            (26, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (5, {hipc: (-8, 0, 0), neck: (-10, 0, 0), armL: (-10, 0, 12), armR: (-10, 0, -12)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 根が抜けるように、その場でゆっくりと崩れ落ちる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (12, {hipc: (-10, 0, 3), neck: (-14, 0, 0), armL: (-20, 0, 20), armR: (-20, 0, -20)}),
            (32, {hipc: (-60, 0, 10), neck: (-26, 0, 0), legL: (30, 0, 0), legR: (26, 0, 0),
                  armL: (-46, 0, 32), armR: (-46, 0, -32)}),
        ]),
    ]


# =================================================================== やまびこぎつね

# gajiriと同じ四つ足の関節構成(chest/hip/neck/snout、tail1-3、耳、
# 前後の脚)をベースにするが、ねずみのgajiriより全体を細くしなやかに
# 作り、鼻先と耳をより尖らせ、尾を長く大きく張り出させてきつねらしい
# シルエットにする。「何かを放つための器官」として、遠吠えのように
# 開いた口と、発光する喉を強調する(響いて返ってくる声そのものという由来)。
YAMABIKOGITSUNE_HALF = {
    "hip": (0.0, 0.165, 0.205),
    "chest": (0.0, -0.025, 0.215),
    "neck": (0.0, -0.175, 0.195),
    "snout": (0.0, -0.385, 0.135),
    "tail1": (0.0, 0.315, 0.200),
    "tail2": (0.0, 0.480, 0.260),
    "tail3": (0.0, 0.605, 0.350),
    "ear.L": (0.092, -0.165, 0.372),
    "hipF.L": (0.092, -0.065, 0.148),
    "footF.L": (0.100, -0.105, 0.026),
    "hipB.L": (0.112, 0.138, 0.155),
    "footB.L": (0.120, 0.168, 0.026),
}
YAMABIKOGITSUNE_RADII_HALF = {
    "hip": 0.115, "chest": 0.125, "neck": 0.082, "snout": 0.032,
    "tail1": 0.040, "tail2": 0.034, "tail3": 0.020,
    "ear.L": 0.050,
    "hipF.L": 0.034, "footF.L": 0.028,
    "hipB.L": 0.046, "footB.L": 0.030,
}
YAMABIKOGITSUNE_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_yamabikogitsune():
    """
    響いて返ってくる声そのもの。gajiriと同じ関節構成をベースに、
    全体を細くしなやかにし、鼻先と耳をより尖らせ、尾を長く大きく
    張り出させてきつねらしいシルエットにする。配色は第六地方
    (こだまの尾根)の岩肌の灰色と乾いた土色。遠吠えのように開いた口と
    発光する喉で「声を放つ器官」を強調する。
    """
    joints = C.mirrored(YAMABIKOGITSUNE_HALF)
    radii = C.mirrored_radii(YAMABIKOGITSUNE_RADII_HALF)
    bones = C.mirrored_bones(YAMABIKOGITSUNE_BONES_HALF)

    body = C.build_skinned("yamabikogitsune", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("yamabikogitsune_rock", (0.54, 0.53, 0.51), roughness=0.75)
    earth = C.make_material("yamabikogitsune_earth", (0.60, 0.48, 0.34), roughness=0.65)
    # 耳の内側と尾の先だけ乾いた土色にする(関節からの距離で判定。
    # gajiriのear_inと同じ考え方)
    accents = [Vector(joints["ear.L"]), Vector(joints["ear.R"]), Vector(joints["tail3"])]
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if min((c - a).length for a in accents) < 0.085 else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"yamabikogitsune_eye{side}", (0.058 * side, -0.235, 0.235), 0.036,
                          look=(0.25 * side, -1.0, 0.1))
    # 遠吠えのように開いた口。上下2枚で開口部を作る
    jaw_upper = C.box("yamabikogitsune_jaw_up", (0.0, -0.400, 0.150), (0.052, 0.075, 0.014), bevel=0.006)
    C.assign_material(jaw_upper, rock)
    extras.append(jaw_upper)
    jaw_lower = C.box("yamabikogitsune_jaw_lo", (0.0, -0.375, 0.108), (0.046, 0.068, 0.012), bevel=0.006)
    C.assign_material(jaw_lower, rock)
    extras.append(jaw_lower)
    throat = C.uv_sphere("yamabikogitsune_throat", (0.0, -0.360, 0.128), 0.030,
                         segments=12, rings=9, scale=(0.85, 1.0, 0.75))
    C.assign_material(throat, C.make_material("yamabikogitsune_throat_m", (0.95, 0.75, 0.35),
                                              roughness=0.3, emission=2.0))
    extras.append(throat)

    mesh = C.join([body] + extras, "yamabikogitsune")
    armature = C.build_armature("yamabikogitsune", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def yamabikogitsune_animations():
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 尾根に耳を澄ませるように、首を小さく巡らせる
        ("idle", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0)}),
            (22, {neck: (-4, 10, 0), t1: (0, -6, 0), t2: (0, 8, 0)}),
            (44, {neck: (3, -8, 0), t1: (0, 6, 0), t2: (0, -8, 0)}),
            (60, {neck: (0, 0, 0), t1: (0, 6, 0)}),
        ]),
        # gajiriより長い脚をしなやかに使う、軽やかな駆け足
        ("walk", [
            (1, {fL: (26, 0, 0), fR: (-26, 0, 0), bL: (-22, 0, 0), bR: (22, 0, 0), t1: (0, 10, 0)}),
            (7, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
            (13, {fL: (-26, 0, 0), fR: (26, 0, 0), bL: (22, 0, 0), bR: (-22, 0, 0), t1: (0, 10, 0)}),
            (19, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
        ]),
        # 大きく口を開け、頭を反らして声を放つ
        ("attack", [
            (1, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (6, {snout: (-30, 0, 0), neck: (-22, 0, 0)}),
            (12, {snout: (18, 0, 0), neck: (10, 0, 0)}),
            (22, {snout: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (18, 0, 0), t1: (0, -18, 0)}),
            (14, {neck: (0, 0, 0), t1: (0, 6, 0)}),
        ]),
        ("die", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0)}),
            (10, {neck: (26, 0, 0), t1: (0, -30, 0), fL: (-30, 0, 0), fR: (-30, 0, 0)}),
            (24, {neck: (40, 0, 0), t1: (0, -50, 0), fL: (-56, 0, 0), fR: (-56, 0, 0),
                  bL: (30, 0, 0), bR: (30, 0, 0)}),
        ]),
    ]


# ===================================================================== こだまぎつね

# やまびこぎつねにこだまうさぎを繰り返し夢あわせすると育つ姿(配合限定)。
# 骨格はyamabikogitsuneと同じ関節構成(gajiri由来)を踏襲しつつ、ひとまわり
# 大きく育てる。「攻撃が2回まで反響する」性質を視覚化するため、
# yamabikogitsuneの単発の発光する喉を、間隔を空けた2つの発光球に増やし、
# 耳もkodamausagi譲りに長く伸ばして「うさぎとの夢あわせ」の痕跡を残す。
KODAMAGITSUNE_HALF = {
    "hip": (0.0, 0.185, 0.230),
    "chest": (0.0, -0.028, 0.240),
    "neck": (0.0, -0.196, 0.218),
    "snout": (0.0, -0.430, 0.150),
    "tail1": (0.0, 0.352, 0.224),
    "tail2": (0.0, 0.536, 0.290),
    "tail3": (0.0, 0.676, 0.390),
    "ear.L": (0.098, -0.184, 0.440),
    "hipF.L": (0.103, -0.073, 0.166),
    "footF.L": (0.112, -0.117, 0.029),
    "hipB.L": (0.125, 0.154, 0.173),
    "footB.L": (0.134, 0.188, 0.029),
}
KODAMAGITSUNE_RADII_HALF = {
    "hip": 0.128, "chest": 0.140, "neck": 0.092, "snout": 0.036,
    "tail1": 0.045, "tail2": 0.038, "tail3": 0.022,
    "ear.L": 0.048,
    "hipF.L": 0.038, "footF.L": 0.031,
    "hipB.L": 0.051, "footB.L": 0.033,
}
KODAMAGITSUNE_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_kodamagitsune():
    """
    やまびこぎつねにこだまうさぎを繰り返し夢あわせすると育つ姿。
    骨格はyamabikogitsuneと同じ構成をひとまわり大きく育てつつ、耳を
    kodamausagi譲りに細く長く伸ばして夢あわせの痕跡を残す。「攻撃が
    2回まで反響する」性質を、間隔を空けた2つの発光球(声の余韻)で
    視覚化する。配色は第六地方(こだまの尾根)の岩肌の灰色と乾いた土色。
    """
    joints = C.mirrored(KODAMAGITSUNE_HALF)
    radii = C.mirrored_radii(KODAMAGITSUNE_RADII_HALF)
    bones = C.mirrored_bones(KODAMAGITSUNE_BONES_HALF)

    body = C.build_skinned("kodamagitsune", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("kodamagitsune_rock", (0.50, 0.49, 0.47), roughness=0.72)
    earth = C.make_material("kodamagitsune_earth", (0.64, 0.51, 0.36), roughness=0.62)
    accents = [Vector(joints["ear.L"]), Vector(joints["ear.R"]), Vector(joints["tail3"])]
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if min((c - a).length for a in accents) < 0.095 else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamagitsune_eye{side}", (0.064 * side, -0.262, 0.262), 0.040,
                          look=(0.25 * side, -1.0, 0.1))
    jaw_upper = C.box("kodamagitsune_jaw_up", (0.0, -0.448, 0.168), (0.058, 0.084, 0.015), bevel=0.007)
    C.assign_material(jaw_upper, rock)
    extras.append(jaw_upper)
    jaw_lower = C.box("kodamagitsune_jaw_lo", (0.0, -0.420, 0.120), (0.051, 0.076, 0.013), bevel=0.007)
    C.assign_material(jaw_lower, rock)
    extras.append(jaw_lower)
    # 反響する2打ぶんの余韻を、口元から少し離した2つの発光球で表す
    echo_mat = C.make_material("kodamagitsune_echo_m", (0.95, 0.75, 0.35), roughness=0.3, emission=2.0)
    throat = C.uv_sphere("kodamagitsune_throat", (0.0, -0.402, 0.144), 0.034,
                         segments=12, rings=9, scale=(0.85, 1.0, 0.75))
    C.assign_material(throat, echo_mat)
    extras.append(throat)
    echo = C.uv_sphere("kodamagitsune_echo", (0.0, -0.470, 0.176), 0.020,
                       segments=10, rings=8, scale=(0.85, 1.0, 0.75))
    C.assign_material(echo, echo_mat)
    extras.append(echo)

    mesh = C.join([body] + extras, "kodamagitsune")
    armature = C.build_armature("kodamagitsune", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kodamagitsune_animations():
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        ("idle", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0)}),
            (24, {neck: (-4, 10, 0), t1: (0, -6, 0), t2: (0, 8, 0)}),
            (48, {neck: (3, -8, 0), t1: (0, 6, 0), t2: (0, -8, 0)}),
            (66, {neck: (0, 0, 0), t1: (0, 6, 0)}),
        ]),
        ("walk", [
            (1, {fL: (24, 0, 0), fR: (-24, 0, 0), bL: (-20, 0, 0), bR: (20, 0, 0), t1: (0, 10, 0)}),
            (7, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
            (13, {fL: (-24, 0, 0), fR: (24, 0, 0), bL: (20, 0, 0), bR: (-20, 0, 0), t1: (0, 10, 0)}),
            (19, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
        ]),
        # 声を放ったあと、間を置いてもう一声(反響)ぶん短く追い足す
        ("attack", [
            (1, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (5, {snout: (-28, 0, 0), neck: (-20, 0, 0)}),
            (10, {snout: (14, 0, 0), neck: (8, 0, 0)}),
            (14, {snout: (-16, 0, 0), neck: (-10, 0, 0)}),
            (19, {snout: (10, 0, 0), neck: (6, 0, 0)}),
            (26, {snout: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (18, 0, 0), t1: (0, -18, 0)}),
            (14, {neck: (0, 0, 0), t1: (0, 6, 0)}),
        ]),
        ("die", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0)}),
            (10, {neck: (26, 0, 0), t1: (0, -30, 0), fL: (-30, 0, 0), fR: (-30, 0, 0)}),
            (24, {neck: (40, 0, 0), t1: (0, -50, 0), fL: (-56, 0, 0), fR: (-56, 0, 0),
                  bL: (30, 0, 0), bR: (30, 0, 0)}),
        ]),
    ]


# ======================================================================= こだまの主

# 第六地方(こだまの尾根)のボス。「尾根じゅうに響いてきた無数のこだまが、
# ひとつに重なり合って生まれた姿」という由来から、地方の他の種族
# (kodamausagi・kodamagumo・kaerukodama)の特徴を1体に集約する構成にする。
# 骨格は計画書どおりgajiriと同じ関節構成をベースにするが、ボスらしく
# 大きく育て、kodamausagi譲りの長い耳・kodamagumo譲りの雲状の膨らみ・
# kaerukodama譲りの大きく見開いた目を組み合わせる。
KODAMANONUSHI_HALF = {
    "hip": (0.0, 0.260, 0.340),
    "chest": (0.0, -0.035, 0.360),
    "neck": (0.0, -0.260, 0.325),
    "snout": (0.0, -0.540, 0.225),
    "tail1": (0.0, 0.480, 0.330),
    "tail2": (0.0, 0.720, 0.420),
    "tail3": (0.0, 0.890, 0.560),
    "ear.L": (0.130, -0.255, 0.610),
    "hipF.L": (0.145, -0.100, 0.235),
    "footF.L": (0.158, -0.165, 0.040),
    "hipB.L": (0.175, 0.215, 0.245),
    "footB.L": (0.188, 0.265, 0.040),
}
KODAMANONUSHI_RADII_HALF = {
    "hip": 0.235, "chest": 0.255, "neck": 0.150, "snout": 0.058,
    "tail1": 0.062, "tail2": 0.050, "tail3": 0.030,
    "ear.L": 0.056,
    "hipF.L": 0.068, "footF.L": 0.056,
    "hipB.L": 0.092, "footB.L": 0.060,
}
KODAMANONUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_kodamaNoNushi():
    """
    尾根じゅうに響いてきた無数のこだまが、ひとつに重なり合って生まれた
    地方の主。gajiriと同じ四つ足の骨組みをボスらしく大きく育て、
    地方の他の種族の特徴(kodamausagiの長い耳、kodamagumoの雲状の膨らみ、
    kaerukodamaの見開いた目)を1体に集約する。配色は第六地方
    (こだまの尾根)の岩肌の灰色と乾いた土色。
    """
    joints = C.mirrored(KODAMANONUSHI_HALF)
    radii = C.mirrored_radii(KODAMANONUSHI_RADII_HALF)
    bones = C.mirrored_bones(KODAMANONUSHI_BONES_HALF)

    body = C.build_skinned("kodamaNoNushi", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("kodamanonushi_rock", (0.52, 0.51, 0.49), roughness=0.78)
    earth = C.make_material("kodamanonushi_earth", (0.60, 0.48, 0.34), roughness=0.66)
    accents = [Vector(joints["ear.L"]), Vector(joints["ear.R"]), Vector(joints["tail3"])]
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if min((c - a).length for a in accents) < 0.15 else 0,
    )

    extras = []
    # kaerukodama譲りの、常に見開いた大きな目
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamanonushi_eye{side}", (0.100 * side, -0.330, 0.345), 0.062,
                          look=(0.25 * side, -1.0, 0.1))
    jaw = C.uv_sphere("kodamanonushi_jaw", (0.0, -0.560, 0.175), 0.088,
                      segments=18, rings=12, scale=(0.95, 1.05, 0.55))
    C.assign_material(jaw, rock)
    extras.append(jaw)

    # kodamagumo譲りの、雲のような膨らみを背に重ねる
    puff_mat = C.make_material("kodamanonushi_puff", (0.58, 0.57, 0.55), roughness=0.82)
    for px, py, pz, pr in [
        (0.0, 0.05, 0.560, 0.145),
        (0.115, 0.10, 0.470, 0.115),
        (-0.115, 0.10, 0.470, 0.115),
        (0.0, 0.22, 0.420, 0.120),
    ]:
        puff = C.uv_sphere(f"kodamanonushi_puff{px}_{pz}", (px, py, pz), pr,
                           segments=16, rings=12)
        C.assign_material(puff, puff_mat)
        extras.append(puff)

    mesh = C.join([body] + extras, "kodamaNoNushi")
    armature = C.build_armature("kodamaNoNushi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kodamaNoNushi_animations():
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 地方の主として、絶えず尾根に響き続けているような、ゆったり大きな揺れ
        ("idle", [
            (1, {neck: (0, 0, 0), t1: (0, 8, 0)}),
            (30, {neck: (-5, 12, 0), t1: (0, -8, 0), t2: (0, 10, 0)}),
            (60, {neck: (4, -10, 0), t1: (0, 8, 0), t2: (0, -10, 0)}),
            (80, {neck: (0, 0, 0), t1: (0, 8, 0)}),
        ]),
        # 巨体を踏みしめる、重く力強い足取り
        ("walk", [
            (1, {fL: (22, 0, 0), fR: (-22, 0, 0), bL: (-18, 0, 0), bR: (18, 0, 0), t1: (0, 12, 0)}),
            (9, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -12, 0)}),
            (17, {fL: (-22, 0, 0), fR: (22, 0, 0), bL: (18, 0, 0), bR: (-18, 0, 0), t1: (0, 12, 0)}),
            (25, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -12, 0)}),
        ]),
        # 頭を大きく振りかぶり、地方の主らしい重い一撃を叩き込む
        ("attack", [
            (1, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (7, {snout: (-36, 0, 0), neck: (-28, 0, 0)}),
            (13, {snout: (22, 0, 0), neck: (14, 0, 0), fL: (14, 0, 0), fR: (14, 0, 0)}),
            (24, {snout: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (5, {neck: (20, 0, 0), t1: (0, -20, 0)}),
            (18, {neck: (0, 0, 0), t1: (0, 8, 0)}),
        ]),
        # 重なり合っていた無数のこだまがほどけるように、大きく崩れ落ちる
        ("die", [
            (1, {neck: (0, 0, 0), t1: (0, 8, 0)}),
            (12, {neck: (30, 0, 0), t1: (0, -34, 0), fL: (-34, 0, 0), fR: (-34, 0, 0)}),
            (30, {neck: (46, 0, 0), t1: (0, -58, 0), fL: (-64, 0, 0), fR: (-64, 0, 0),
                  bL: (34, 0, 0), bR: (34, 0, 0)}),
        ]),
    ]


# =================================================================== めんかぶりこぞう

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにするが、「隣接するまで気配を消す」(ambush AI)由来から、
# tsubuteのずんぐりした立体感を潰し、全体を平たく低いシルエットにする。
# 顔には出し物の陰に潜む由来にちなんだ祭り面を正面に貼り付ける。
MENKABURIKOZO_HALF = {
    "hip": (0.0, 0.115, 0.098),
    "chest": (0.0, -0.055, 0.108),
    "head": (0.0, -0.215, 0.112),
    "armF.L": (0.148, -0.148, 0.052),
    "handF.L": (0.168, -0.205, 0.014),
    "kneeB.L": (0.200, 0.108, 0.112),
    "ankleB.L": (0.182, -0.038, 0.034),
    "footB.L": (0.168, -0.148, 0.013),
}
MENKABURIKOZO_RADII_HALF = {
    "hip": 0.152, "chest": 0.160, "head": 0.098,
    "armF.L": 0.034, "handF.L": 0.038,
    "kneeB.L": 0.068, "ankleB.L": 0.044, "footB.L": 0.040,
}
MENKABURIKOZO_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_menkaburikozo():
    """
    出し物の陰に潜む悪戯。tsubuteと同じ関節構成をベースに、立体感を
    潰して平たく低いシルエットにし、周囲に溶け込みやすくする。正面には
    出し物の陰に潜む由来にちなんだ祭り面(くすんだ紅色に金色の縁取り)を
    貼り付け、目の穴だけ暗く落とし込んで不意打ちの気配を隠す。
    """
    joints = C.mirrored(MENKABURIKOZO_HALF)
    radii = C.mirrored_radii(MENKABURIKOZO_RADII_HALF)
    bones = C.mirrored_bones(MENKABURIKOZO_BONES_HALF)

    body = C.build_skinned("menkaburikozo", joints, bones, radii, root="chest", subsurf=2)
    cloth = C.make_material("menkaburikozo_cloth", (0.30, 0.26, 0.24), roughness=0.8)
    C.assign_material(body, cloth)

    extras = []
    mask_red = C.make_material("menkaburikozo_mask_m", (0.62, 0.24, 0.22), roughness=0.5)
    mask_gold = C.make_material("menkaburikozo_gold", (0.68, 0.56, 0.28), roughness=0.35, metallic=0.3)
    dark = C.make_material("menkaburikozo_hole", (0.04, 0.04, 0.05), roughness=0.9)

    mask = C.uv_sphere("menkaburikozo_mask", (0.0, -0.235, 0.118), 0.115,
                       segments=20, rings=14, scale=(1.0, 0.30, 0.92))
    C.assign_material(mask, mask_red)
    extras.append(mask)
    rim = C.uv_sphere("menkaburikozo_rim", (0.0, -0.220, 0.118), 0.128,
                      segments=20, rings=14, scale=(1.0, 0.22, 1.0))
    C.assign_material(rim, mask_gold)
    extras.append(rim)
    for side in (-1.0, 1.0):
        hole = C.uv_sphere(f"menkaburikozo_hole{side}", (0.052 * side, -0.255, 0.135), 0.026,
                           segments=12, rings=9, scale=(1.0, 0.4, 0.7))
        C.assign_material(hole, dark)
        extras.append(hole)

    mesh = C.join([body] + extras, "menkaburikozo")
    armature = C.build_armature("menkaburikozo", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def menkaburikozo_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 気配を消してじっと潜む。ほとんど動かない
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (40, {head: (2, 3, 0)}),
            (80, {head: (0, 0, 0)}),
        ]),
        # 低い姿勢のまま、音も無く忍び寄る
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {legL: (30, 0, 0), legR: (30, 0, 0), head: (6, 0, 0)}),
            (9, {legL: (-24, 0, 0), legR: (-24, 0, 0), head: (-6, 0, 0)}),
            (14, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 面を突き出すように跳びかかる不意打ち
        ("attack", [
            (1, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
            (4, {armL: (-40, 0, 20), armR: (-40, 0, -20), head: (-24, 0, 0)}),
            (8, {armL: (30, 0, -10), armR: (30, 0, 10), head: (14, 0, 0)}),
            (16, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (18, 0, 0), armL: (-20, 0, 16), armR: (-20, 0, -16)}),
            (14, {head: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {head: (0, 0, 0)}),
            (9, {head: (24, 0, 0), legL: (-32, 0, 0), legR: (-32, 0, 0)}),
            (22, {head: (36, 0, 0), legL: (-60, 0, 0), legR: (-60, 0, 0),
                  armL: (-54, 0, 22), armR: (-54, 0, -22)}),
        ]),
    ]


# =================================================================== ホネダタミ

# 現在は honegarami モデルを流用中(plan/model-honedatami.md)。
# 計画書の指示どおり honegarami と同じ関節の"種類"
# (hip/chest/neck/head/crown, shoulder-elbow-hand, thigh-knee-foot)を
# 踏襲しつつ、guard AI(通路の真ん中に居座ってどかない)に合わせて
# 座標をゼロから設計し直す。honegaramiは「細い手足+浮いた肋骨」で
# 剣士らしい軽さを出していたが、ホネダタミは正反対に、背を低く
# 幅を大きく取り、四肢を太く短く詰めて、通路そのものを塞ぐ
# どっしりした山にする。剣は持たせず、両腕は素手のまま。
# 背には積年の記憶が積もったように骨板を何枚も無造作に重ね、
# 名前どおり「骨のタタミ(積み重ね)」を背負わせる。
HONEDATAMI_HALF = {
    "hip": (0.0, 0.010, 0.145),
    "chest": (0.0, 0.0, 0.275),
    "neck": (0.0, 0.0, 0.360),
    "head": (0.0, -0.020, 0.430),
    "crown": (0.0, 0.0, 0.495),
    "shoulder.L": (0.205, 0.0, 0.300),
    "elbow.L": (0.245, 0.030, 0.205),
    "hand.L": (0.215, -0.010, 0.125),
    "thigh.L": (0.170, 0.0, 0.125),
    "knee.L": (0.200, -0.005, 0.045),
    "foot.L": (0.175, -0.065, 0.010),
}
# 半径は honegarami よりずっと太い。とくに hip/chest は、隣接する
# shoulder/thigh の関節がはっきりその外へ突き出す太さに収まるよう、
# 距離 > 半径差を個別に検算して決めた(細身の四肢では埋もれやすいため)
HONEDATAMI_RADII_HALF = {
    "hip": 0.130, "chest": 0.148, "neck": 0.058, "head": 0.115, "crown": 0.062,
    "shoulder.L": 0.075, "elbow.L": 0.060, "hand.L": 0.068,
    "thigh.L": 0.078, "knee.L": 0.058, "foot.L": 0.066,
}
HONEDATAMI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def _rotate_z_around(obj, degrees: float, pivot) -> None:
    """
    メッシュの頂点を pivot を中心に Z 軸まわりで回す。obj.rotation_euler は
    オブジェクト原点(ワールド原点)を中心に回してしまい、box()/cone() で
    作った部品はワールド座標へ直接頂点を置いているためオブジェクト原点が
    ワールド原点と一致せず、位置が大きくずれる。頂点そのものを部品自身の
    中心まわりで回すことでこれを避ける。
    """
    ang = math.radians(degrees)
    cos_a, sin_a = math.cos(ang), math.sin(ang)
    px, py = pivot[0], pivot[1]
    for v in obj.data.vertices:
        x, y = v.co.x - px, v.co.y - py
        v.co.x = px + x * cos_a - y * sin_a
        v.co.y = py + x * sin_a + y * cos_a


def build_honedatami():
    """
    通路の真ん中に居座って動かない、骨積みの回廊のguard。honegaramiと同じ
    関節の種類を踏襲しつつ、背を低く幅広くして四肢を太く短く詰め、
    「積み重なった記憶の重みそのもの」という設定どおり、剣士ではなく
    無造作に積まれた骨の山として造形する。
    """
    joints = C.mirrored(HONEDATAMI_HALF)
    radii = C.mirrored_radii(HONEDATAMI_RADII_HALF)
    bones = C.mirrored_bones(HONEDATAMI_BONES_HALF)

    body = C.build_skinned("honedatami", joints, bones, radii, root="hip", subsurf=2)
    bone_mat = C.make_material("honeda_bone", (0.86, 0.83, 0.72), roughness=0.75)
    dust_mat = C.make_material("honeda_dust", (0.50, 0.48, 0.44), roughness=0.92)
    # 通路の床に長く居座って積もった土埃を、脚まわりの低い位置だけ
    # くすんだ色にすることで表現する(距離ではなく高さで判定)
    C.assign_materials_by_region(body, [bone_mat, dust_mat], lambda c: 1 if c.z < 0.085 else 0)
    counts = [0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"honedatami: 骨色{counts[0]} 土埃色{counts[1]} / 計{total} "
          f"({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    plate_mat = C.make_material("honeda_plate", (0.60, 0.58, 0.53), roughness=0.85)
    plate_mat2 = C.make_material("honeda_plate2", (0.71, 0.68, 0.59), roughness=0.8)
    socket_mat = C.make_material("honeda_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("honeda_glow", (0.68, 0.58, 0.32), roughness=0.35, emission=1.3)

    # 頭。honegaramiと違い剣士の頬骨や歯は作らず、丸みを抑えた
    # 兜のような頭蓋にして、道を塞ぐ物質的な"壁"らしさを強める
    skull = C.uv_sphere("honeda_skull", (0.0, -0.02, 0.415), 0.118,
                        segments=18, rings=12, scale=(1.0, 0.92, 0.72))
    C.assign_material(skull, bone_mat)
    extras.append(skull)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"honeda_socket{side}", (0.052 * side, -0.098, 0.435), 0.032,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.1))
        C.assign_material(socket, socket_mat)
        extras.append(socket)
        # 記憶の重みを鈍く灯すだけの、honegaramiより暗い燠火のような目
        glow = C.uv_sphere(f"honeda_glow{side}", (0.052 * side, -0.106, 0.435), 0.014,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)

    # 積まれた骨板。胴の表面にぴったり寄り添わせて重ね、鎧の鱗板の
    # ように貼り付いて見せる(浮かせると別パーツに見えてしまう)。
    # 左右にわずかにはみ出させて、道いっぱいに居座る幅の広さを伝える。
    # 1枚ごとに位置・向き・厚みを少しずつ振り、精密に整列させない
    side_plate_specs = [
        # (中心x,y,z / サイズxyz / 面取り / 回転deg)
        ((0.150, 0.020, 0.140), (0.032, 0.100, 0.088), 0.004, -5.0),
        ((0.185, 0.010, 0.230), (0.030, 0.108, 0.096), 0.004, 6.0),
        ((0.175, 0.030, 0.320), (0.026, 0.098, 0.088), 0.004, -7.0),
        ((0.140, 0.010, 0.395), (0.022, 0.078, 0.066), 0.004, 5.0),
    ]
    for side in (-1.0, 1.0):
        mats = (plate_mat, plate_mat2) if side < 0 else (plate_mat2, plate_mat)
        for i, (center, size, bevel, rot) in enumerate(side_plate_specs):
            c = (center[0] * side, center[1], center[2])
            plate = C.box(f"honeda_splate{side}_{i}", c, size, bevel=bevel)
            _rotate_z_around(plate, rot * side, c)
            C.assign_material(plate, mats[i % 2])
            extras.append(plate)
    # 正面(-Y側、通常のカメラが向く側)にも胸当てのように骨板を
    # 重ねる。側面の板は死角に隠れがちなので、真正面から見ても
    # 「板が積み重なっている」と分かるよう主張を置く
    front_specs = [
        ((0.0, -0.128, 0.170), (0.145, 0.024, 0.070), 0.005, -3.0, plate_mat2),
        ((0.010, -0.135, 0.245), (0.160, 0.022, 0.066), 0.005, 4.0, plate_mat),
        ((-0.006, -0.126, 0.315), (0.130, 0.020, 0.058), 0.004, -5.0, plate_mat2),
    ]
    for i, (center, size, bevel, rot, mat) in enumerate(front_specs):
        plate = C.box(f"honeda_fplate{i}", center, size, bevel=bevel)
        _rotate_z_around(plate, rot, center)
        C.assign_material(plate, mat)
        extras.append(plate)
    # 頭の上にも直接重ね、頂に小さな石積みが乗っているように見せる
    top_specs = [
        ((0.0, 0.0, 0.505), (0.130, 0.088, 0.026), 0.005, 4.0, plate_mat),
        ((0.010, -0.008, 0.535), (0.092, 0.064, 0.022), 0.004, -6.0, plate_mat2),
    ]
    for i, (center, size, bevel, rot, mat) in enumerate(top_specs):
        plate = C.box(f"honeda_toplate{i}", center, size, bevel=bevel)
        _rotate_z_around(plate, rot, center)
        C.assign_material(plate, mat)
        extras.append(plate)

    mesh = C.join([body] + extras, "honedatami")
    armature = C.build_armature("honedatami", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def honedatami_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # どっしり構えたまま、ごく僅かに軋むだけのほとんど静止した待機
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (30, {hipc: (1, 0, 0), neck: (2, 0, 0)}),
            (60, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 重い塊がのろのろ引きずられるような、地を這う歩み
        ("walk", [
            (1, {legL: (10, 0, 0), legR: (-10, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                 hipc: (0, 0, 1)}),
            (12, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: (0, 0, 0)}),
            (23, {legL: (-10, 0, 0), legR: (10, 0, 0), shinL: (5, 0, 0), shinR: (-6, 0, 0),
                  hipc: (0, 0, -1)}),
            (34, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: (0, 0, 0)}),
            (45, {legL: (10, 0, 0), legR: (-10, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                  hipc: (0, 0, 1)}),
        ]),
        # 剣を持たない代わりに、両腕をまとめて叩きつける正面への体当たり
        ("attack", [
            (1, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (7, {armL: (-30, 0, 20), armR: (-30, 0, -20), foreL: (-20, 0, 0), foreR: (-20, 0, 0),
                 hipc: (-10, 0, 0), neck: (-6, 0, 0)}),
            (13, {armL: (48, 0, 4), armR: (48, 0, -4), foreL: (14, 0, 0), foreR: (14, 0, 0),
                  hipc: (12, 0, 0), neck: (4, 0, 0)}),
            (24, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        # 高い防御力どおり、当たってもほとんど揺るがない
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-6, 0, 0), neck: (-8, 0, 0)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 積まれていた骨の山がそのまま崩れ落ちる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (9, {hipc: (-10, 0, 8), neck: (-20, 0, 0), armL: (-30, 0, 30), armR: (-30, 0, -30)}),
            (26, {hipc: (-70, 0, 22), neck: (-46, 0, 0), legL: (34, 0, 0), legR: (30, 0, 0),
                  armL: (-70, 0, 60), armR: (-70, 0, -60)}),
        ]),
    ]


# ===================================================================== かざりだるま

# honegaramiと同じ人型骨組み(hip/chest/neck/head/crown、shoulder/elbow/
# hand、thigh/knee/foot)をベースにするが、「飾られたまま忘れられた
# 縁起物」という由来から、腕・脚をごく短く詰めて胴体の丸みに埋もれさせ、
# 縦に大きく膨らんだ胴と丸い頭だけの、だるまらしい丸っこいシルエットに
# する。guard AI(その場を動かない・高い防御力)にも合う低い重心。
KAZARIDARUMA_HALF = {
    "hip": (0.0, 0.0, 0.150),
    "chest": (0.0, 0.0, 0.335),
    "neck": (0.0, 0.0, 0.435),
    "head": (0.0, -0.010, 0.485),
    "crown": (0.0, 0.0, 0.540),
    "shoulder.L": (0.190, 0.0, 0.335),
    "elbow.L": (0.212, 0.012, 0.235),
    "hand.L": (0.196, -0.010, 0.150),
    "thigh.L": (0.112, 0.0, 0.112),
    "knee.L": (0.116, 0.0, 0.052),
    "foot.L": (0.106, -0.030, 0.012),
}
KAZARIDARUMA_RADII_HALF = {
    "hip": 0.198, "chest": 0.235, "neck": 0.076, "head": 0.178, "crown": 0.040,
    "shoulder.L": 0.056, "elbow.L": 0.042, "hand.L": 0.046,
    "thigh.L": 0.060, "knee.L": 0.048, "foot.L": 0.050,
}
KAZARIDARUMA_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_kazaridaruma():
    """
    飾られたまま忘れられた縁起物。見世物のぬしの小型版のような姿。
    honegaramiと同じ人型骨組みをベースに、腕・脚を短く詰めて胴に埋もれ
    させ、縦に大きく膨らんだ胴と丸い頭だけのだるまらしいシルエットに
    する。配色は第七地方(わすれられた祭りの跡)の、くすんだ紅色に金色の
    帯、白く塗り残された顔の一角。
    """
    joints = C.mirrored(KAZARIDARUMA_HALF)
    radii = C.mirrored_radii(KAZARIDARUMA_RADII_HALF)
    bones = C.mirrored_bones(KAZARIDARUMA_BONES_HALF)

    body = C.build_skinned("kazaridaruma", joints, bones, radii, root="hip", subsurf=2)
    red = C.make_material("kazaridaruma_red", (0.58, 0.20, 0.18), roughness=0.6)
    gold = C.make_material("kazaridaruma_gold", (0.66, 0.54, 0.26), roughness=0.35, metallic=0.25)
    # 腰まわりの帯だけ金色にする
    C.assign_materials_by_region(
        body, [red, gold],
        lambda c: 1 if (0.235 < c.z < 0.285) else 0,
    )

    extras = []
    face = C.make_material("kazaridaruma_face", (0.90, 0.86, 0.76), roughness=0.55)
    ink = C.make_material("kazaridaruma_ink", (0.10, 0.09, 0.10), roughness=0.5)
    # 白く塗り残された顔の一角(扁平な楕円)
    plate = C.uv_sphere("kazaridaruma_plate", (0.0, -0.152, 0.472), 0.148,
                        segments=20, rings=14, scale=(1.0, 0.28, 0.86))
    C.assign_material(plate, face)
    extras.append(plate)
    # 太い眉と髭を、細長く潰したuv_sphereで描く
    brow = C.uv_sphere("kazaridaruma_brow", (0.0, -0.205, 0.545), 0.020,
                       segments=14, rings=8, scale=(3.6, 0.6, 1.0))
    C.assign_material(brow, ink)
    extras.append(brow)
    mustache = C.uv_sphere("kazaridaruma_mustache", (0.0, -0.205, 0.418), 0.018,
                           segments=14, rings=8, scale=(3.2, 0.6, 1.0))
    C.assign_material(mustache, ink)
    extras.append(mustache)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"kazaridaruma_eye{side}", (0.062 * side, -0.208, 0.492), 0.030,
                          segments=14, rings=10, scale=(1.0, 0.55, 1.0))
        C.assign_material(eye, ink)
        extras.append(eye)

    mesh = C.join([body] + extras, "kazaridaruma")
    armature = C.build_armature("kazaridaruma", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def kazaridaruma_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 縁起物らしく、その場でわずかに揺れるだけのほとんど静止した待機
        ("idle", [
            (1, {hipc: (0, 0, 0)}),
            (36, {hipc: (2, 0, 1)}),
            (72, {hipc: (0, 0, 0)}),
        ]),
        # 短い手足で、ころころと弾むように短く進む
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), hipc: (0, 0, 2)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: (0, 0, 0)}),
            (19, {legL: (-18, 0, 0), legR: (18, 0, 0), hipc: (0, 0, -2)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: (0, 0, 0)}),
        ]),
        # 高い防御力どおり、短い腕をまとめて押し出すだけの鈍い一撃
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (8, {armL: (-40, 0, 22), armR: (-40, 0, -22), hipc: (-8, 0, 0)}),
            (14, {armL: (34, 0, 4), armR: (34, 0, -4), hipc: (10, 0, 0), neck: (-4, 0, 0)}),
            (24, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        # 起き上がりこぼしのように、当たっても大きくは揺るがない
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-10, 0, 0), neck: (-6, 0, 0)}),
            (16, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 起き上がれずに、そのまま横へ転がり倒れる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (10, {hipc: (-24, 0, 30), neck: (-10, 0, 0)}),
            (26, {hipc: (-30, 0, 92), neck: (-18, 0, 0),
                  armL: (-20, 0, 40), armR: (-20, 0, -40)}),
        ]),
    ]


# ======================================================================= かげぼうし

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにする、menkaburikozoと同系統の奇襲役(ambush AI)。menkaburikozo
# が「面をかぶって潜む」のに対し、かげぼうしは「祭りの影絵芝居そのものの
# 忘れ物」という由来のため、立体感をさらに削って紙のように薄い輪郭にし、
# 全身をほぼ黒一色にする。祭りの提灯に透かされていた名残として、
# 三日月形の眠たげな目だけを金色に発光させる(混乱ではなく眠りを誘う
# 由来にちなみ、menkaburikozoの見開いた目の穴とは逆に閉じた目にする)。
KAGEBOUSHI_HALF = {
    "hip": (0.0, 0.108, 0.088),
    "chest": (0.0, -0.052, 0.096),
    "head": (0.0, -0.205, 0.100),
    "armF.L": (0.140, -0.140, 0.046),
    "handF.L": (0.158, -0.196, 0.012),
    "kneeB.L": (0.188, 0.102, 0.100),
    "ankleB.L": (0.170, -0.036, 0.030),
    "footB.L": (0.158, -0.140, 0.011),
}
KAGEBOUSHI_RADII_HALF = {
    "hip": 0.128, "chest": 0.135, "head": 0.088,
    "armF.L": 0.026, "handF.L": 0.030,
    "kneeB.L": 0.056, "ankleB.L": 0.036, "footB.L": 0.032,
}
KAGEBOUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kageboushi():
    """
    祭りの影絵芝居の忘れ物。tsubuteと同じ関節構成をベースに、
    menkaburikozoよりさらに立体感を削った紙のように薄いシルエットに
    する。全身をほぼ黒一色にし、提灯に透かされていた名残として
    三日月形の眠たげな目だけを金色に発光させる。
    """
    joints = C.mirrored(KAGEBOUSHI_HALF)
    radii = C.mirrored_radii(KAGEBOUSHI_RADII_HALF)
    bones = C.mirrored_bones(KAGEBOUSHI_BONES_HALF)

    body = C.build_skinned("kageboushi", joints, bones, radii, root="chest", subsurf=2)
    shadow = C.make_material("kageboushi_shadow", (0.05, 0.045, 0.055), roughness=0.7)
    C.assign_material(body, shadow)

    extras = []
    glow = C.make_material("kageboushi_glow", (0.85, 0.66, 0.28), roughness=0.3, emission=1.8)
    for side in (-1.0, 1.0):
        # 三日月形の目。細長く潰したuv_sphereを2つ重ねて三日月の欠けを作る
        moon = C.uv_sphere(f"kageboushi_moon{side}", (0.048 * side, -0.238, 0.108), 0.022,
                           segments=14, rings=10, scale=(1.0, 0.5, 1.4))
        C.assign_material(moon, glow)
        extras.append(moon)
        bite = C.uv_sphere(f"kageboushi_bite{side}", (0.048 * side + 0.010 * side, -0.246, 0.108), 0.020,
                           segments=14, rings=10, scale=(1.0, 0.5, 1.4))
        C.assign_material(bite, shadow)
        extras.append(bite)

    mesh = C.join([body] + extras, "kageboushi")
    armature = C.build_armature("kageboushi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kageboushi_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 影のように、ほとんど気配なく潜む
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (44, {head: (2, 4, 0)}),
            (88, {head: (0, 0, 0)}),
        ]),
        # 音も無く、するすると這うように忍び寄る
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (6, {legL: (28, 0, 0), legR: (28, 0, 0), head: (5, 0, 0)}),
            (11, {legL: (-22, 0, 0), legR: (-22, 0, 0), head: (-5, 0, 0)}),
            (16, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 影が伸びるように腕を差し伸べ、眠りを誘う不意打ち
        ("attack", [
            (1, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {armL: (-46, 0, 24), armR: (-46, 0, -24), head: (-20, 0, 0)}),
            (10, {armL: (26, 0, -8), armR: (26, 0, 8), head: (10, 0, 0)}),
            (18, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (16, 0, 0), armL: (-18, 0, 14), armR: (-18, 0, -14)}),
            (14, {head: (0, 0, 0)}),
        ]),
        # 影そのものが薄れ消えていくように、色が沈むのではなく潰れて消える
        ("die", [
            (1, {head: (0, 0, 0)}),
            (10, {head: (22, 0, 0), legL: (-30, 0, 0), legR: (-30, 0, 0)}),
            (24, {head: (34, 0, 0), legL: (-56, 0, 0), legR: (-56, 0, 0),
                  armL: (-50, 0, 20), armR: (-50, 0, -20)}),
        ]),
    ]


# =================================================================== ちょうちんおくり

CHOUCHINOKURI_JOINTS = {
    "base": (0.0, 0.0, 0.065),
    "mid": (0.0, 0.0, 0.185),
    "top": (0.0, 0.0, 0.305),
}
CHOUCHINOKURI_RADII = {"base": 0.115, "mid": 0.200, "top": 0.095}
CHOUCHINOKURI_BONES = [("base", "mid"), ("mid", "top")]


def build_chouchinokuri():
    """
    消えかけた祭りの灯り。purunと同じ縦2本の骨組みをそのまま流用するが、
    半径を両端で絞り中央で膨らませ、提灯らしい俵形のシルエットにする。
    群れ配置(swarm AI)に合わせ、単体は簡略化した小さなシルエットに
    とどめる。配色は第七地方(わすれられた祭りの跡)の、くすんだ紅色に
    金色の上下の口輪、内側からにじむ橙色の灯り。
    """
    body = C.build_skinned("chouchinokuri", CHOUCHINOKURI_JOINTS, CHOUCHINOKURI_BONES,
                           CHOUCHINOKURI_RADII, root="base", subsurf=2)
    paper = C.make_material("chouchinokuri_paper", (0.56, 0.22, 0.20), roughness=0.55)
    # 提灯の骨(縦の張り骨)を、正面から見た角度で細い縞に塗り分ける
    glow_strip = C.make_material("chouchinokuri_strip", (0.80, 0.42, 0.20), roughness=0.4,
                                 emission=0.6)

    def classify(c):
        angle = math.atan2(c.x, -c.y)
        return 1 if (math.sin(angle * 6.0) > 0.72) else 0

    C.assign_materials_by_region(body, [paper, glow_strip], classify)

    extras = []
    gold = C.make_material("chouchinokuri_gold", (0.70, 0.56, 0.28), roughness=0.35, metallic=0.3)
    for cz in (0.075, 0.300):
        ring = C.uv_sphere(f"chouchinokuri_ring{cz}", (0.0, 0.0, cz), 0.070,
                           segments=18, rings=8, scale=(1.0, 1.0, 0.35))
        C.assign_material(ring, gold)
        extras.append(ring)
    ember = C.uv_sphere("chouchinokuri_ember", (0.0, 0.0, 0.185), 0.080,
                        segments=16, rings=12)
    C.assign_material(ember, C.make_material("chouchinokuri_ember_m", (0.95, 0.62, 0.24),
                                             roughness=0.3, emission=1.6))
    extras.append(ember)
    for side in (-1.0, 1.0):
        extras += eyeball(f"chouchinokuri_eye{side}", (0.075 * side, -0.185, 0.205), 0.032,
                          look=(0.15 * side, -1.0, 0.0),
                          white=(0.85, 0.72, 0.55), dark=(0.12, 0.07, 0.05))

    mesh = C.join([body] + extras, "chouchinokuri")
    armature = C.build_armature("chouchinokuri", C.mirrored(CHOUCHINOKURI_JOINTS),
                                CHOUCHINOKURI_BONES, mesh, root="base")
    return [mesh, armature], armature


def chouchinokuri_animations():
    """既存5クリップの構成をそのまま流用する(骨の名前がぷるんと同じため、そのまま使える)。"""
    return purun_animations()


# =================================================================== わたあめのおばけ

WATAAMENOOBAKE_JOINTS = {
    "base": (0.0, 0.0, 0.035),
    "mid": (0.0, 0.0, 0.145),
    "top": (0.0, 0.0, 0.235),
}
# purunとは正反対に、根元(base)を細く絞り先端(top)を膨らませる。
# 幽霊らしい先細りの尾と、わたあめらしいふくらんだ頭を1本の骨組みで作る
WATAAMENOOBAKE_RADII = {"base": 0.035, "mid": 0.145, "top": 0.155}
WATAAMENOOBAKE_BONES = [("base", "mid"), ("mid", "top")]


def build_wataamenoobake():
    """
    甘い匂いに誘われる夢。purunと同じ縦2本の骨組みをそのまま流用するが、
    半径をpurunとは逆に根元を細く先端を太くし、幽霊らしい先細りの尾と
    わたあめらしいふくらんだ頭のシルエットにする。coward AIに合わせ、
    小柄で軽く、逃げ足の速さを感じさせる。周囲に小さな綿雲の房を
    まとわせ、触れるとほどけて散る綿あめの質感を出す。配色は第七地方
    (わすれられた祭りの跡)の、くすんだ紅色を淡くした桃色と金色の煌めき。
    """
    body = C.build_skinned("wataamenoobake", WATAAMENOOBAKE_JOINTS, WATAAMENOOBAKE_BONES,
                           WATAAMENOOBAKE_RADII, root="base", subsurf=2)
    fluff = C.make_material("wataame_fluff", (0.78, 0.52, 0.56), roughness=0.85)
    C.assign_material(body, fluff)

    puffs = []
    for i, (px, py, pz, pr) in enumerate([
        (0.0, -0.02, 0.255, 0.075),
        (0.095, 0.03, 0.220, 0.062),
        (-0.095, 0.03, 0.220, 0.062),
        (0.0, 0.09, 0.195, 0.058),
        (0.055, -0.01, 0.290, 0.050),
        (-0.055, -0.01, 0.290, 0.050),
    ]):
        puff = C.uv_sphere(f"wataame_puff{i}", (px, py, pz), pr, segments=14, rings=10)
        C.assign_material(puff, fluff)
        puffs.append(puff)
    body = C.join([body] + puffs, "wataamenoobake")

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"wataame_eye{side}", (0.052 * side, -0.140, 0.210), 0.030,
                          look=(0.2 * side, -1.0, 0.05),
                          white=(0.92, 0.86, 0.82), dark=(0.14, 0.09, 0.10))
    sparkle_mat = C.make_material("wataame_sparkle", (0.82, 0.66, 0.30), roughness=0.3, emission=1.4)
    for sx, sy, sz in [(0.130, 0.06, 0.270), (-0.115, 0.08, 0.310), (0.02, -0.05, 0.335)]:
        sparkle = C.uv_sphere(f"wataame_sparkle{sx}_{sz}", (sx, sy, sz), 0.016,
                              segments=10, rings=8)
        C.assign_material(sparkle, sparkle_mat)
        extras.append(sparkle)

    mesh = C.join([body] + extras, "wataamenoobake")
    armature = C.build_armature("wataamenoobake", C.mirrored(WATAAMENOOBAKE_JOINTS),
                                WATAAMENOOBAKE_BONES, mesh, root="base")
    return [mesh, armature], armature


def wataamenoobake_animations():
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.24, 0.66, 1.24)}
    stretch = {"scale": (0.80, 1.32, 0.80)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # ふわふわと軽く漂う、地に足の付かない待機
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (16, {lower: {"scale": (1.05, 0.94, 1.05)}, upper: {"scale": (0.96, 1.06, 0.96)}}),
            (32, {lower: neutral, upper: neutral}),
        ]),
        # coward AIらしく、素早く逃げるように弾む
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (3, {lower: squash, upper: stretch}),
            (7, {lower: {**stretch, "loc": (0, 0.11, 0)}, upper: squash}),
            (11, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (15, {lower: neutral, upper: neutral}),
        ]),
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {"scale": (0.82, 1.3, 0.82)}, upper: {"scale": (1.14, 0.8, 1.14)}}),
            (18, {lower: neutral, upper: neutral}),
        ]),
        ("hit", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: {"scale": (1.28, 0.68, 1.28)}, upper: {"scale": (0.85, 1.2, 0.85)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # 触れるとほどけて散る綿あめのように、輪郭を崩しながら薄れ消える
        ("die", [
            (1, {lower: neutral, upper: neutral}),
            (10, {lower: {"scale": (1.4, 0.4, 1.4)}, upper: {"scale": (1.3, 0.5, 1.3)}}),
            (24, {lower: {"scale": (1.6, 0.05, 1.6)}, upper: {"scale": (1.5, 0.06, 1.5)}}),
        ]),
    ]


# ======================================================================= やぐらもり

# madoromiと同じ関節構成(root/stem/capbase/captop)をベースにするが、
# きのこの傘ではなく祭りの櫓を思わせる姿にする。stemをmadoromiより長く
# 細く伸ばして櫓の柱にし、cap側は高さを大きく詰めて平たい屋根板にする。
# 「矢のような一撃」を放つ由来から、屋根の中心に鏃のような棘を立てる。
YAGURAMORI_JOINTS = {
    "root": (0.0, 0.0, 0.045),
    "stem": (0.0, 0.0, 0.300),
    "capbase": (0.0, 0.0, 0.400),
    "captop": (0.0, 0.0, 0.460),
}
YAGURAMORI_RADII = {"root": 0.095, "stem": 0.058, "capbase": 0.235, "captop": 0.190}
YAGURAMORI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_yaguramori():
    """
    祭りの櫓に住み着いた古い霊。madoromiと同じ関節構成をベースに、
    柱を長く細く、屋根を平たく広く作り替えて祭りの櫓を思わせる姿にする。
    屋根の中心には矢のような一撃を放つ由来にちなんだ鏃形の棘を立て、
    屋根の陰から覗く目と口を軒下に潜ませる。配色は第七地方
    (わすれられた祭りの跡)の、くすんだ紅色・金色の名残と古びた柱の木色。
    """
    body = C.build_skinned("yaguramori", YAGURAMORI_JOINTS, YAGURAMORI_BONES,
                           YAGURAMORI_RADII, root="root", subsurf=3)
    wood = C.make_material("yaguramori_wood", (0.34, 0.24, 0.18), roughness=0.8)
    roof = C.make_material("yaguramori_roof", (0.56, 0.20, 0.19), roughness=0.55)
    C.assign_materials_by_region(body, [wood, roof], lambda c: 1 if c.z > 0.355 else 0)

    extras = []
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"yaguramori_eye{side}", (0.058 * side, -0.100, 0.330), 0.028,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.9))
        C.assign_material(eye, C.make_material(f"yaguramori_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    mouth = C.uv_sphere("yaguramori_mouth", (0.0, -0.100, 0.280), 0.028,
                        segments=12, rings=8, scale=(0.85, 0.5, 0.7))
    C.assign_material(mouth, C.make_material("yaguramori_mouth_m", (0.30, 0.16, 0.18), roughness=0.4))
    extras.append(mouth)

    # 屋根の中心に立つ鏃形の棘。cone()はZ軸沿いにしか作れないので回転は
    # かけず、根元(半径大)を屋根の高さに置いて真上へ伸ばす
    gold = C.make_material("yaguramori_gold", (0.68, 0.55, 0.27), roughness=0.35, metallic=0.3)
    spike = C.cone("yaguramori_spike", (0.0, 0.0, 0.458), 0.055, 0.006, 0.135, segments=12)
    C.assign_material(spike, gold)
    extras.append(spike)
    for i, (angle_deg, dist) in enumerate([(40.0, 0.150), (160.0, 0.150), (280.0, 0.150)]):
        angle = math.radians(angle_deg)
        finial = C.cone(f"yaguramori_finial{i}",
                        (math.cos(angle) * dist, math.sin(angle) * dist, 0.452),
                        0.026, 0.004, 0.062, segments=8)
        C.assign_material(finial, gold)
        extras.append(finial)

    mesh = C.join([body] + extras, "yaguramori")
    armature = C.build_armature("yaguramori", YAGURAMORI_JOINTS, YAGURAMORI_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def yaguramori_animations():
    lower, mid, upper = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # 櫓の上でじっと見下ろす、ほとんど動かない待機
        ("idle", [
            (1, {mid: (0, 0, 0)}),
            (40, {mid: (2, 0, 1)}),
            (80, {mid: (0, 0, 0)}),
        ]),
        # 柱そのものは歩かず、軋むように小さく揺れて進む
        ("walk", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (8, {lower: (4, 0, 3), mid: (-3, 0, -2)}),
            (16, {lower: (-4, 0, -3), mid: (3, 0, 2)}),
            (24, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # 屋根を大きく傾け、鏃の棘を狙いに合わせてから矢のように放つ
        ("attack", [
            (1, {upper: (0, 0, 0), mid: (0, 0, 0)}),
            (6, {upper: (-26, 0, 0), mid: (-14, 0, 0)}),
            (11, {upper: (16, 0, 0), mid: (10, 0, 0)}),
            (20, {upper: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {mid: (0, 0, 0)}),
            (4, {mid: (14, 0, 0), upper: (10, 0, 0)}),
            (14, {mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 古い柱が朽ち崩れるように、大きく傾いて倒れる
        ("die", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (10, {lower: (20, 0, 12), mid: (14, 0, 8), upper: (10, 0, 6)}),
            (24, {lower: (54, 0, 30), mid: (34, 0, 20), upper: (24, 0, 14)}),
        ]),
    ]


# ================================================================= 見世物のぬし

# 第七地方(わすれられた祭りの跡)のボス。「かつての祭りでもっとも人目を
# 引いた出し物の記憶が、朽ちてなお色濃く残った姿」という由来から、
# honegarami・yamabikooniと同じ人型骨組みをボスサイズまで拡大しつつ、
# 地方の他の種族(menkaburikozoの祭り面、kazaridarumaの縁起物の帯、
# honedatamiの重ねた板)の意匠を1体に集約する。「見世物のぬしの小型版」
# であるkazaridarumaより、はるかに大きく力強い、正面から迫るシルエット。
MISEMONONONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.375),
    "chest": (0.0, 0.0, 0.630),
    "neck": (0.0, 0.0, 0.765),
    "head": (0.0, -0.015, 0.900),
    "crown": (0.0, 0.0, 1.005),
    "shoulder.L": (0.198, 0.0, 0.675),
    "elbow.L": (0.282, 0.018, 0.495),
    "hand.L": (0.292, -0.034, 0.330),
    "thigh.L": (0.113, 0.0, 0.360),
    "knee.L": (0.120, 0.0, 0.182),
    "foot.L": (0.126, -0.040, 0.025),
}
MISEMONONONUSHI_RADII_HALF = {
    "hip": 0.148, "chest": 0.162, "neck": 0.066, "head": 0.172, "crown": 0.044,
    "shoulder.L": 0.078, "elbow.L": 0.061, "hand.L": 0.070,
    "thigh.L": 0.086, "knee.L": 0.068, "foot.L": 0.073,
}
MISEMONONONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_misemonoNoNushi():
    """
    かつての祭りでもっとも人目を引いた出し物の記憶が、朽ちてなお色濃く
    残った姿。honegarami・yamabikooniと同じ人型骨組みをボスサイズまで
    拡大し、menkaburikozo譲りの祭り面、honedatami譲りの重ねた板、
    kazaridaruma譲りの金色の帯を組み合わせて、地方の主らしい存在感を
    まとわせる。配色は第七地方(わすれられた祭りの跡)の、くすんだ紅色と
    金色の名残。
    """
    joints = C.mirrored(MISEMONONONUSHI_HALF)
    radii = C.mirrored_radii(MISEMONONONUSHI_RADII_HALF)
    bones = C.mirrored_bones(MISEMONONONUSHI_BONES_HALF)

    body = C.build_skinned("misemonoNoNushi", joints, bones, radii, root="hip", subsurf=2)
    red = C.make_material("misemono_red", (0.52, 0.18, 0.17), roughness=0.6)
    gold = C.make_material("misemono_gold", (0.66, 0.54, 0.27), roughness=0.35, metallic=0.3)
    C.assign_materials_by_region(body, [red, gold], lambda c: 1 if (0.560 < c.z < 0.610) else 0)

    extras = []
    # menkaburikozo譲りの祭り面。ボスにふさわしく、より大きく厚みを持たせる
    mask = C.uv_sphere("misemono_mask", (0.0, -0.170, 0.905), 0.165,
                       segments=22, rings=15, scale=(1.0, 0.32, 0.94))
    C.assign_material(mask, red)
    extras.append(mask)
    rim = C.uv_sphere("misemono_rim", (0.0, -0.155, 0.905), 0.182,
                      segments=22, rings=15, scale=(1.0, 0.24, 1.0))
    C.assign_material(rim, gold)
    extras.append(rim)
    dark = C.make_material("misemono_hole", (0.04, 0.04, 0.05), roughness=0.9)
    for side in (-1.0, 1.0):
        hole = C.uv_sphere(f"misemono_hole{side}", (0.075 * side, -0.238, 0.925), 0.036,
                           segments=14, rings=10, scale=(1.0, 0.4, 0.75))
        C.assign_material(hole, dark)
        extras.append(hole)

    # honedatami譲りの重ねた板を、朽ちた衣装の名残として肩と胸に飾る
    plate = C.make_material("misemono_plate", (0.62, 0.50, 0.30), roughness=0.75)
    for side in (-1.0, 1.0):
        cape = C.box(f"misemono_cape{side}", (0.195 * side, 0.035, 0.590),
                     (0.058, 0.075, 0.145), bevel=0.010)
        C.assign_material(cape, plate)
        extras.append(cape)
    chestplate = C.box("misemono_chestplate", (0.0, -0.150, 0.640), (0.145, 0.028, 0.110), bevel=0.012)
    C.assign_material(chestplate, plate)
    extras.append(chestplate)

    mesh = C.join([body] + extras, "misemonoNoNushi")
    armature = C.build_armature("misemonoNoNushi", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def misemonoNoNushi_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 誰もいない会場の中央に居座り続ける、堂々とした待機
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (28, {hipc: (3, 0, 2), neck: (-4, 0, 0), armL: (-6, 0, 14), armR: (-6, 0, -14)}),
            (56, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
        ]),
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                 armL: (-14, 0, 8), armR: (14, 0, -8)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8)}),
            (19, {legL: (-18, 0, 0), legR: (18, 0, 0), shinL: (6, 0, 0), shinR: (-8, 0, 0),
                  armL: (14, 0, 8), armR: (-14, 0, -8)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8)}),
        ]),
        # かつて客を呼び込んだ両腕を大きく広げてから、力強く叩きつける
        ("attack", [
            (1, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (8, {armR: (-140, 0, -26), foreR: (-36, 0, 0), armL: (-44, 0, 34), foreL: (-12, 0, 0),
                 hipc: (-12, 0, -16), neck: (-6, 0, 0)}),
            (14, {armR: (76, 0, 18), foreR: (12, 0, 0), armL: (32, 0, -6), foreL: (0, 0, 0),
                  hipc: (20, 0, 18), neck: (-10, 0, 0)}),
            (26, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (5, {hipc: (-12, 0, 0), neck: (-12, 0, 0), armL: (-16, 0, 18), armR: (-16, 0, -18)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # かつての存在感ごと崩れ落ちるように、大きく傾いて倒れる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (12, {hipc: (-14, 0, 6), neck: (-20, 0, 0), armL: (-34, 0, 34), armR: (-34, 0, -34)}),
            (30, {hipc: (-86, 0, 18), neck: (-38, 0, 0), legL: (52, 0, 0), legR: (46, 0, 0),
                  armL: (-76, 0, 52), armR: (-76, 0, -52)}),
        ]),
    ]


# =========================================================================== 一覧
MONSTERS = {
    "purun": (build_purun, purun_animations),
    "kodamausagi": (build_kodamausagi, kodamausagi_animations),
    "kodamagumo": (build_kodamagumo, kodamagumo_animations),
    "akubitokage": (build_akubitokage, akubitokage_animations),
    "gajiri": (build_gajiri, gajiri_animations),
    "mabutamushi": (build_mabutamushi, mabutamushi_animations),
    "tsubute": (build_tsubute, tsubute_animations),
    "madoromi": (build_madoromi, madoromi_animations),
    "honegarami": (build_honegarami, honegarami_animations),
    "kirimizuchi": (build_kirimizuchi, kirimizuchi_animations),
    "nukarumigani": (build_nukarumigani, nukarumigani_animations),
    "ashiatodori": (build_ashiatodori, ashiatodori_animations),
    "wasuremizuchi": (build_wasuremizuchi, wasuremizuchi_animations),
    "kinokootoko": (build_kinokootoko, kinokootoko_animations),
    "houshitobi": (build_houshitobi, houshitobi_animations),
    "nebosukegaeru": (build_nebosukegaeru, nebosukegaeru_animations),
    "madoromigumo": (build_madoromigumo, madoromigumo_animations),
    "kaerukodama": (build_kaerukodama, kaerukodama_animations),
    "yamabikooni": (build_yamabikooni, yamabikooni_animations),
    "nedayamabiko": (build_nedayamabiko, nedayamabiko_animations),
    "yamabikogitsune": (build_yamabikogitsune, yamabikogitsune_animations),
    "kodamagitsune": (build_kodamagitsune, kodamagitsune_animations),
    "kodamaNoNushi": (build_kodamaNoNushi, kodamaNoNushi_animations),
    "menkaburikozo": (build_menkaburikozo, menkaburikozo_animations),
    "honedatami": (build_honedatami, honedatami_animations),
    "kazaridaruma": (build_kazaridaruma, kazaridaruma_animations),
    "kageboushi": (build_kageboushi, kageboushi_animations),
    "chouchinokuri": (build_chouchinokuri, chouchinokuri_animations),
    "wataamenoobake": (build_wataamenoobake, wataamenoobake_animations),
    "yaguramori": (build_yaguramori, yaguramori_animations),
    "misemonoNoNushi": (build_misemonoNoNushi, misemonoNoNushi_animations),
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
