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


# ================================================================= ゆめまよいの影

# 主を見失った夢。madoromiと同じ関節構成(root/stem/capbase/captop)を
# ベースにするが、mimic AI(タルに擬態し、持ち上げる/投げるまで見分けが
# つかない)に合わせ、madoromiの「歩くきのこ」らしい表情豊かな造形とは
# 逆に、目立つ特徴を抑えた寸胴なシルエットにする。傘は開ききらせず
# フードのように深く被らせ、顔を大きく覆い隠す。
YUMEMAYOINOKAGE_JOINTS = {
    "root": (0.0, 0.0, 0.05),
    "stem": (0.0, 0.0, 0.20),
    "capbase": (0.0, 0.0, 0.315),
    "captop": (0.0, 0.0, 0.400),
}
YUMEMAYOINOKAGE_RADII = {"root": 0.135, "stem": 0.130, "capbase": 0.215, "captop": 0.075}
YUMEMAYOINOKAGE_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_yumemayoinokage():
    """
    主を見失った夢。madoromiと同じ関節構成をベースに、タルに擬態する
    mimic AIらしく寸胴で目立たないシルエットに作り替え、傘をフードの
    ように深く被らせて顔を覆い隠す。配色は第八地方(めざめの前庭)の
    テーマに合わせ、第一〜第七地方の色が淡く混ざり合った、統一感のない
    燻んだ配色にする。
    """
    body = C.build_skinned("yumemayoinokage", YUMEMAYOINOKAGE_JOINTS, YUMEMAYOINOKAGE_BONES,
                           YUMEMAYOINOKAGE_RADII, root="root", subsurf=2)
    husk = C.make_material("yumemayoi_husk", (0.42, 0.40, 0.44), roughness=0.75)
    hood = C.make_material("yumemayoi_hood", (0.34, 0.32, 0.40), roughness=0.7)
    C.assign_materials_by_region(body, [husk, hood], lambda c: 1 if c.z > 0.300 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # フードの陰に半分沈んだ、眠たげで生気の薄い目
        eye = C.uv_sphere(f"yumemayoi_eye{side}", (0.055 * side, -0.170, 0.235), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.55, 0.6))
        C.assign_material(eye, C.make_material(f"yumemayoi_eye{side}_m", (0.62, 0.60, 0.68),
                                               roughness=0.4))
        extras.append(eye)
    mouth = C.uv_sphere("yumemayoi_mouth", (0.0, -0.175, 0.185), 0.022,
                        segments=12, rings=8, scale=(0.85, 0.5, 0.7))
    C.assign_material(mouth, C.make_material("yumemayoi_mouth_m", (0.20, 0.18, 0.22), roughness=0.5))
    extras.append(mouth)

    # 各地方の記憶の名残として、傘に淡い色の欠片を6つ散らす
    fragments = [
        (0.62, 0.85, 0.62, "purun"), (0.42, 0.30, 0.24, "gajiri"),
        (0.55, 0.62, 0.42, "tsubute"), (0.68, 0.44, 0.56, "madoromi"),
        (0.32, 0.58, 0.66, "kirimizuchi"), (0.60, 0.48, 0.34, "kodama"),
    ]
    for i, (angle_deg, dist, r, (fr, fg, fb, _label)) in enumerate(
        zip([20.0, 90.0, 150.0, 210.0, 270.0, 330.0], [0.16] * 6, [0.026] * 6, fragments)
    ):
        angle = math.radians(angle_deg)
        frag = C.uv_sphere(f"yumemayoi_frag{i}", (math.cos(angle) * dist, math.sin(angle) * dist, 0.315),
                           r, segments=10, rings=8, scale=(1.0, 1.0, 0.4))
        C.assign_material(frag, C.make_material(f"yumemayoi_frag{i}_m", (fr * 0.75, fg * 0.75, fb * 0.75),
                                                roughness=0.6))
        extras.append(frag)

    mesh = C.join([body] + extras, "yumemayoinokage")
    armature = C.build_armature("yumemayoinokage", YUMEMAYOINOKAGE_JOINTS, YUMEMAYOINOKAGE_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def yumemayoinokage_animations():
    lower, mid, upper = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # タルのふりをして、ほとんど動かずじっと潜む
        ("idle", [
            (1, {mid: (0, 0, 0)}),
            (48, {mid: (1.5, 0, 1)}),
            (96, {mid: (0, 0, 0)}),
        ]),
        # タルらしからぬ、正体を現したときのぎこちない転がるような足取り
        ("walk", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (7, {lower: (10, 0, 6), mid: (-8, 0, -4)}),
            (14, {lower: (-10, 0, -6), mid: (8, 0, 4)}),
            (21, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        ("attack", [
            (1, {upper: (0, 0, 0), mid: (0, 0, 0)}),
            (6, {upper: (-24, 0, 0), mid: (-16, 0, 0)}),
            (11, {upper: (14, 0, 0), mid: (10, 0, 0)}),
            (20, {upper: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {mid: (0, 0, 0)}),
            (4, {mid: (12, 0, 0), upper: (8, 0, 0)}),
            (14, {mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 見失った夢そのものが、輪郭を保てず崩れて消える
        ("die", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (10, {lower: (16, 0, 10), mid: (12, 0, 8), upper: (10, 0, 6)}),
            (24, {lower: (44, 0, 26), mid: (30, 0, 20), upper: (24, 0, 16)}),
        ]),
    ]


# ================================================================= ヨリシロの残響

# ヨリシロ自身の記憶そのもの。honegarami・yamabikooni・misemonoNoNushiと
# 同じ人型骨組みをベースに、物語終盤にふさわしい、これまでで最も大きく
# 力強いシルエットにする。第八地方(めざめの前庭)のテーマ「第一〜第七
# 地方の色が淡く混ざり合った、統一感のない配色」を、高さで5段に区切った
# 色帯(各地方の代表色を淡くしたもの)で表現し、胸には全ての記憶が
# 集まる核として発光する紋章を持たせる。
YORISHIRONOZANKYO_HALF = {
    "hip": (0.0, 0.0, 0.390),
    "chest": (0.0, 0.0, 0.655),
    "neck": (0.0, 0.0, 0.795),
    "head": (0.0, -0.016, 0.935),
    "crown": (0.0, 0.0, 1.045),
    "shoulder.L": (0.205, 0.0, 0.700),
    "elbow.L": (0.292, 0.019, 0.510),
    "hand.L": (0.302, -0.036, 0.340),
    "thigh.L": (0.118, 0.0, 0.375),
    "knee.L": (0.126, 0.0, 0.190),
    "foot.L": (0.132, -0.041, 0.026),
}
YORISHIRONOZANKYO_RADII_HALF = {
    "hip": 0.152, "chest": 0.168, "neck": 0.070, "head": 0.178, "crown": 0.046,
    "shoulder.L": 0.082, "elbow.L": 0.064, "hand.L": 0.074,
    "thigh.L": 0.090, "knee.L": 0.072, "foot.L": 0.077,
}
YORISHIRONOZANKYO_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_yorishironozankyo():
    """
    ヨリシロ自身の記憶そのもの。出現率は極めて低いが、他のどの種族より
    HP・攻撃・防御が高い。honegarami・yamabikooni・misemonoNoNushiと
    同じ人型骨組みを、これまでで最も大きく育てる。配色は高さで5段に
    区切った色帯で、第一〜第七地方の代表色を淡く混ぜ合わせて表現し、
    統一感のない、記憶が幾重にも重なった見た目にする。胸には全ての
    記憶が集まる核として発光する紋章を持たせる。
    """
    joints = C.mirrored(YORISHIRONOZANKYO_HALF)
    radii = C.mirrored_radii(YORISHIRONOZANKYO_RADII_HALF)
    bones = C.mirrored_bones(YORISHIRONOZANKYO_BONES_HALF)

    body = C.build_skinned("yorishironozankyo", joints, bones, radii, root="hip", subsurf=2)
    bands = [
        C.make_material("zankyo_band0", (0.44, 0.40, 0.46), roughness=0.7),   # 記憶の底(灰紫)
        C.make_material("zankyo_band1", (0.36, 0.52, 0.56), roughness=0.65),  # 忘れ潮の湿地(水色)
        C.make_material("zankyo_band2", (0.46, 0.56, 0.40), roughness=0.65),  # まどろみの茸林(緑)
        C.make_material("zankyo_band3", (0.56, 0.42, 0.46), roughness=0.65),  # なみだの滝つぼ(紅紫)
        C.make_material("zankyo_band4", (0.58, 0.50, 0.34), roughness=0.6),   # こだまの尾根・祭りの跡(土金)
    ]

    def classify(c):
        t = max(0.0, min(1.0, c.z / 1.045))
        return min(4, int(t * 5))

    C.assign_materials_by_region(body, bands, classify)

    extras = []
    glow = C.make_material("zankyo_eye", (0.85, 0.90, 0.96), roughness=0.25, emission=1.8)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"zankyo_eye{side}", (0.070 * side, -0.155, 0.945), 0.028,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.8))
        C.assign_material(eye, glow)
        extras.append(eye)

    # 胸に、全ての記憶が集まる核として発光する紋章を持たせる
    core_ring = C.uv_sphere("zankyo_core_ring", (0.0, -0.155, 0.660), 0.075,
                            segments=18, rings=13, scale=(1.0, 0.30, 1.0))
    C.assign_material(core_ring, C.make_material("zankyo_core_ring_m", (0.72, 0.66, 0.50),
                                                 roughness=0.4, metallic=0.2))
    extras.append(core_ring)
    core = C.uv_sphere("zankyo_core", (0.0, -0.170, 0.660), 0.048,
                       segments=16, rings=12, scale=(1.0, 0.28, 1.0))
    C.assign_material(core, C.make_material("zankyo_core_m", (0.90, 0.86, 0.72),
                                            roughness=0.25, emission=2.4))
    extras.append(core)

    mesh = C.join([body] + extras, "yorishironozankyo")
    armature = C.build_armature("yorishironozankyo", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def yorishironozankyo_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 記憶そのものとして、静かに、しかし途方もない存在感で佇む
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (30, {hipc: (2, 0, 2), neck: (-3, 0, 0), armL: (-5, 0, 13), armR: (-5, 0, -13)}),
            (60, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
        ]),
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                 armL: (-14, 0, 8), armR: (14, 0, -8)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8)}),
            (19, {legL: (-18, 0, 0), legR: (18, 0, 0), shinL: (6, 0, 0), shinR: (-8, 0, 0),
                  armL: (14, 0, 8), armR: (-14, 0, -8)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8)}),
        ]),
        # 物語終盤にふさわしい、両腕を大きく振りかぶる圧倒的な一撃
        ("attack", [
            (1, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (8, {armR: (-145, 0, -28), foreR: (-38, 0, 0), armL: (-46, 0, 36), foreL: (-13, 0, 0),
                 hipc: (-13, 0, -17), neck: (-6, 0, 0)}),
            (14, {armR: (80, 0, 19), foreR: (13, 0, 0), armL: (34, 0, -7), foreL: (0, 0, 0),
                  hipc: (21, 0, 19), neck: (-11, 0, 0)}),
            (26, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (5, {hipc: (-11, 0, 0), neck: (-11, 0, 0), armL: (-15, 0, 17), armR: (-15, 0, -17)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 記憶が薄れるように、大きく傾いて崩れ落ちる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (13, {hipc: (-15, 0, 6), neck: (-21, 0, 0), armL: (-35, 0, 35), armR: (-35, 0, -35)}),
            (32, {hipc: (-88, 0, 19), neck: (-40, 0, 0), legL: (54, 0, 0), legR: (48, 0, 0),
                  armL: (-78, 0, 54), armR: (-78, 0, -54)}),
        ]),
    ]


# ======================================================================= 淵の主

# 第五地方(なみだの滝つぼ)のボス。honegarami・yamabikooniと同じ人型
# 骨組みをベースに、「滝つぼの一番深いところに沈んだ、もっとも重い
# 悲しみが凝った姿」という由来から、yamabikooniの力強い直立ではなく、
# nedayamabikoと同じ低い重心・前傾した姿勢にする(悲しみの重さで
# うつむいているような佇まい)。配色は涙と滝つぼを思わせる沈んだ
# 青・藍色系。肩や顎から涙のしずくが垂れ下がる。
FUCHINONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.310),
    "chest": (0.0, 0.025, 0.520),
    "neck": (0.0, 0.038, 0.615),
    "head": (0.0, 0.014, 0.725),
    "crown": (0.0, 0.026, 0.815),
    "shoulder.L": (0.192, 0.025, 0.545),
    "elbow.L": (0.266, 0.055, 0.395),
    "hand.L": (0.260, 0.020, 0.245),
    "thigh.L": (0.113, 0.0, 0.298),
    "knee.L": (0.120, 0.0, 0.150),
    "foot.L": (0.126, -0.040, 0.020),
}
FUCHINONUSHI_RADII_HALF = {
    "hip": 0.133, "chest": 0.146, "neck": 0.059, "head": 0.153, "crown": 0.041,
    "shoulder.L": 0.071, "elbow.L": 0.057, "hand.L": 0.065,
    "thigh.L": 0.079, "knee.L": 0.064, "foot.L": 0.069,
}
FUCHINONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_fuchiNoNushi():
    """
    滝つぼの一番深いところに沈んだ、この地方でもっとも重い悲しみが
    凝った姿。honegarami・yamabikooniと同じ人型骨組みをベースに、
    悲しみの重さでうつむいているような、低い重心の前傾姿勢にする。
    配色は涙と滝つぼを思わせる沈んだ青・藍色系。肩や顎から涙の
    しずくが垂れ下がる。
    """
    joints = C.mirrored(FUCHINONUSHI_HALF)
    radii = C.mirrored_radii(FUCHINONUSHI_RADII_HALF)
    bones = C.mirrored_bones(FUCHINONUSHI_BONES_HALF)

    body = C.build_skinned("fuchiNoNushi", joints, bones, radii, root="hip", subsurf=2)
    deep = C.make_material("fuchi_deep", (0.16, 0.20, 0.38), roughness=0.55)
    indigo = C.make_material("fuchi_indigo", (0.24, 0.30, 0.48), roughness=0.5)
    C.assign_materials_by_region(body, [deep, indigo], lambda c: 1 if c.z > 0.470 else 0)

    extras = []
    glow = C.make_material("fuchi_eye", (0.55, 0.75, 0.92), roughness=0.25, emission=1.6)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"fuchi_eye{side}", (0.062 * side, -0.148, 0.735), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.75))
        C.assign_material(eye, glow)
        extras.append(eye)

    # 涙のしずく。肩と顎から垂れ下がる、半透明感のある青いしずく形
    tear_mat = C.make_material("fuchi_tear", (0.42, 0.62, 0.82), roughness=0.2, emission=0.4)
    tear_specs = [
        (0.0, -0.155, 0.655, 0.026),
        (0.205 * -1.0, 0.03, 0.500, 0.020),
        (0.205 * 1.0, 0.03, 0.500, 0.020),
    ]
    for i, (tx, ty, tz, tr) in enumerate(tear_specs):
        tear = C.uv_sphere(f"fuchi_tear{i}", (tx, ty, tz), tr, segments=12, rings=10,
                           scale=(0.8, 0.8, 1.6))
        C.assign_material(tear, tear_mat)
        extras.append(tear)

    mesh = C.join([body] + extras, "fuchiNoNushi")
    armature = C.build_armature("fuchiNoNushi", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def fuchiNoNushi_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 悲しみの重さでうつむいたまま、動じることなく淵の底に居座る
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (36, {hipc: (2, 0, 1), neck: (2, 0, 0)}),
            (72, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {legL: (16, 0, 0), legR: (-16, 0, 0), shinL: (-7, 0, 0), shinR: (5, 0, 0),
                 armL: (-12, 0, 6), armR: (12, 0, -6)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (21, {legL: (-16, 0, 0), legR: (16, 0, 0), shinL: (5, 0, 0), shinR: (-7, 0, 0),
                  armL: (12, 0, 6), armR: (-12, 0, -6)}),
            (31, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
        ]),
        # 淵の水を巻き込むように、重々しく両腕を振り下ろす
        ("attack", [
            (1, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (8, {armR: (-120, 0, -22), foreR: (-32, 0, 0), armL: (-38, 0, 28), foreL: (-10, 0, 0),
                 hipc: (-10, 0, -14), neck: (-6, 0, 0)}),
            (14, {armR: (66, 0, 14), foreR: (10, 0, 0), armL: (26, 0, -4), foreL: (0, 0, 0),
                  hipc: (16, 0, 14), neck: (-8, 0, 0)}),
            (25, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (5, {hipc: (-10, 0, 0), neck: (-10, 0, 0), armL: (-14, 0, 16), armR: (-14, 0, -16)}),
            (16, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 溜め込んだ悲しみが崩れ落ちるように、水底へ沈み込む
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (11, {hipc: (-12, 0, 5), neck: (-18, 0, 0), armL: (-30, 0, 30), armR: (-30, 0, -30)}),
            (28, {hipc: (-78, 0, 16), neck: (-34, 0, 0), legL: (46, 0, 0), legR: (40, 0, 0),
                  armL: (-68, 0, 46), armR: (-68, 0, -46)}),
        ]),
    ]


# =================================================================== しずくうお

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにするが、四足の蛙ではなく「こぼれ落ちる涙のしずくそのもの」を
# 表す魚にする。armF/handFを小さな胸びれ、kneeB/ankleB/footBを後方へ
# 伸ばして尾びれにし、headを先細りの水滴の先端にする。
SHIZUKUUO_HALF = {
    "hip": (0.0, 0.130, 0.118),
    "chest": (0.0, -0.028, 0.132),
    "head": (0.0, -0.205, 0.112),
    "armF.L": (0.086, -0.092, 0.078),
    "handF.L": (0.128, -0.110, 0.050),
    "kneeB.L": (0.070, 0.160, 0.108),
    "ankleB.L": (0.092, 0.215, 0.078),
    "footB.L": (0.098, 0.260, 0.048),
}
SHIZUKUUO_RADII_HALF = {
    "hip": 0.118, "chest": 0.128, "head": 0.068,
    "armF.L": 0.020, "handF.L": 0.024,
    "kneeB.L": 0.026, "ankleB.L": 0.019, "footB.L": 0.022,
}
SHIZUKUUO_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_shizukuuo():
    """
    こぼれ落ちる涙のしずくそのもの。tsubuteと同じ関節構成をベースに、
    四足の蛙ではなく水滴形の魚に作り替える。頭を先細りの水滴の先端に、
    腕を小さな胸びれ、後ろ足を尾びれにする。群れ配置(swarm AI)に
    合わせ、単体は簡略化した小さなシルエットにとどめる。配色は
    第五地方(なみだの滝つぼ)の、涙と滝つぼを思わせる沈んだ青・藍色系。
    """
    joints = C.mirrored(SHIZUKUUO_HALF)
    radii = C.mirrored_radii(SHIZUKUUO_RADII_HALF)
    bones = C.mirrored_bones(SHIZUKUUO_BONES_HALF)

    body = C.build_skinned("shizukuuo", joints, bones, radii, root="chest", subsurf=2)
    deep = C.make_material("shizuku_deep", (0.20, 0.30, 0.52), roughness=0.25)
    C.assign_material(body, deep)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"shizuku_eye{side}", (0.052 * side, -0.222, 0.128), 0.028,
                          look=(0.25 * side, -1.0, 0.05),
                          white=(0.80, 0.86, 0.94), dark=(0.10, 0.12, 0.20))

    mesh = C.join([body] + extras, "shizukuuo")
    armature = C.build_armature("shizukuuo", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def shizukuuo_animations():
    head = "chest-head"
    finL, finR = "chest-armF.L", "chest-armF.R"
    tailL, tailR = "hip-kneeB.L", "hip-kneeB.R"
    shinL, shinR = "kneeB.L-ankleB.L", "kneeB.R-ankleB.R"
    return [
        # 水中を漂うように、ゆっくり揺れる
        ("idle", [
            (1, {head: (0, 0, 0), tailL: (0, 0, 6), tailR: (0, 0, -6)}),
            (24, {head: (3, 0, 0), tailL: (0, 0, -6), tailR: (0, 0, 6)}),
            (48, {head: (0, 0, 0), tailL: (0, 0, 6), tailR: (0, 0, -6)}),
        ]),
        # 尾びれを大きくくねらせて泳ぐ
        ("walk", [
            (1, {tailL: (0, 0, 20), tailR: (0, 0, -20), shinL: (0, 0, 14), shinR: (0, 0, -14),
                 finL: (0, 0, 10), finR: (0, 0, -10), head: (0, 0, 6)}),
            (6, {tailL: (0, 0, -20), tailR: (0, 0, 20), shinL: (0, 0, -14), shinR: (0, 0, 14),
                 finL: (0, 0, -10), finR: (0, 0, 10), head: (0, 0, -6)}),
            (12, {tailL: (0, 0, 20), tailR: (0, 0, -20), shinL: (0, 0, 14), shinR: (0, 0, -14),
                  finL: (0, 0, 10), finR: (0, 0, -10), head: (0, 0, 6)}),
        ]),
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (-20, 0, 0), tailL: (0, 0, 24), tailR: (0, 0, -24)}),
            (9, {head: (14, 0, 0), tailL: (0, 0, -18), tailR: (0, 0, 18)}),
            (16, {head: (0, 0, 0), tailL: (0, 0, 6), tailR: (0, 0, -6)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (16, 0, 0), finL: (-14, 0, 10), finR: (-14, 0, -10)}),
            (12, {head: (0, 0, 0)}),
        ]),
        # しずくが弾けるように、輪郭を丸く潰しながら消える
        ("die", [
            (1, {head: (0, 0, 0)}),
            (8, {head: (0, 0, 0), tailL: (0, 0, -30), tailR: (0, 0, 30)}),
            (18, {head: (0, 0, 0), tailL: (0, 0, -60), tailR: (0, 0, 60)}),
        ]),
    ]


# ===================================================================== うるみぐま

# honegaramiと同じ人型骨組みをベースにするが、「ふさぎ込んだ古い悲しみ」
# (guard AI、動かず攻撃を受けなければ癒える)という由来から、
# nedayamabikoと同じ低い重心・前傾した姿勢に、熊らしい丸い耳と
# 厚みのある体格を組み合わせる。fuchiNoNushiとは違い、甲羅ではなく
# 熊そのものの体つきで「悲しみに沈んで丸くなった」様子を表す。
URUMIGUMA_HALF = {
    "hip": (0.0, 0.0, 0.185),
    "chest": (0.0, 0.022, 0.320),
    "neck": (0.0, 0.032, 0.392),
    "head": (0.0, 0.008, 0.455),
    "crown": (0.0, 0.018, 0.508),
    "shoulder.L": (0.178, 0.022, 0.335),
    "elbow.L": (0.208, 0.042, 0.222),
    "hand.L": (0.188, 0.012, 0.112),
    "thigh.L": (0.116, 0.0, 0.170),
    "knee.L": (0.121, 0.0, 0.080),
    "foot.L": (0.116, -0.045, 0.018),
}
URUMIGUMA_RADII_HALF = {
    "hip": 0.136, "chest": 0.150, "neck": 0.063, "head": 0.130, "crown": 0.038,
    "shoulder.L": 0.073, "elbow.L": 0.059, "hand.L": 0.063,
    "thigh.L": 0.083, "knee.L": 0.067, "foot.L": 0.071,
}
URUMIGUMA_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_urumiguma():
    """
    ふさぎ込んだ古い悲しみ。honegaramiと同じ人型骨組みをベースに、
    nedayamabikoと同じ低い重心・前傾した姿勢にし、熊らしい丸い耳を
    足す。悲しみに沈んで丸くなった様子を、垂れた瞼の眠たげな目で
    表す。配色は第五地方(なみだの滝つぼ)の、沈んだ青・藍色系。
    """
    joints = C.mirrored(URUMIGUMA_HALF)
    radii = C.mirrored_radii(URUMIGUMA_RADII_HALF)
    bones = C.mirrored_bones(URUMIGUMA_BONES_HALF)

    body = C.build_skinned("urumiguma", joints, bones, radii, root="hip", subsurf=2)
    fur = C.make_material("urumi_fur", (0.22, 0.26, 0.42), roughness=0.85)
    C.assign_material(body, fur)

    extras = []
    for side in (-1.0, 1.0):
        ear = C.uv_sphere(f"urumi_ear{side}", (0.098 * side, 0.030, 0.545), 0.052,
                          segments=16, rings=12, scale=(1.0, 0.7, 1.0))
        C.assign_material(ear, fur)
        extras.append(ear)
        # 垂れた瞼の眠たげな目(nebosukegaeruと同じ手法)
        extras += eyeball(f"urumi_eye{side}", (0.085 * side, -0.118, 0.470), 0.038,
                          look=(0.2 * side, -0.85, -0.1), squash=0.45,
                          white=(0.70, 0.72, 0.80), dark=(0.10, 0.10, 0.16))
        lid = C.uv_sphere(f"urumi_lid{side}", (0.085 * side, -0.112, 0.484), 0.040,
                          segments=14, rings=10, scale=(1.0, 0.85, 0.5))
        C.assign_material(lid, fur)
        extras.append(lid)
    snout = C.uv_sphere("urumi_snout", (0.0, -0.155, 0.415), 0.058,
                        segments=16, rings=12, scale=(0.85, 1.0, 0.7))
    C.assign_material(snout, C.make_material("urumi_snout_m", (0.30, 0.34, 0.48), roughness=0.75))
    extras.append(snout)

    mesh = C.join([body] + extras, "urumiguma")
    armature = C.build_armature("urumiguma", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def urumiguma_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 悲しみに沈んだまま、ほとんど動かない
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (44, {hipc: (1.5, 0, 1), neck: (2, 0, 0)}),
            (88, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {legL: (14, 0, 0), legR: (-14, 0, 0), armL: (-10, 0, 5), armR: (10, 0, -5)}),
            (12, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5)}),
            (23, {legL: (-14, 0, 0), legR: (14, 0, 0), armL: (10, 0, 5), armR: (-10, 0, -5)}),
            (34, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5)}),
        ]),
        # 重い前足を、ためてから鈍く振り下ろす
        ("attack", [
            (1, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (9, {armR: (-64, 0, -14), hipc: (-6, 0, -8)}),
            (15, {armR: (28, 0, 8), hipc: (10, 0, 8), neck: (-6, 0, 0)}),
            (26, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (5, {hipc: (-8, 0, 0), neck: (-9, 0, 0), armL: (-10, 0, 12), armR: (-10, 0, -12)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 悲しみそのものが崩れ落ちるように、その場でゆっくり沈む
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (12, {hipc: (-10, 0, 4), neck: (-14, 0, 0), armL: (-20, 0, 20), armR: (-20, 0, -20)}),
            (32, {hipc: (-58, 0, 10), neck: (-26, 0, 0), legL: (30, 0, 0), legR: (26, 0, 0),
                  armL: (-46, 0, 32), armR: (-46, 0, -32)}),
        ]),
    ]


# ======================================================================= なだかぜ

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにするが、涙を誘う風そのものという由来から、ずんぐりした蛙の
# 体つきを細く引き延ばし、四肢を尾を引くリボンのように長く尖らせる。
# 「何かを放つための器官」として、頬を大きく膨らませた吹き出しの口を
# 強調する。
NADAKAZE_HALF = {
    "hip": (0.0, 0.095, 0.135),
    "chest": (0.0, -0.045, 0.150),
    "head": (0.0, -0.235, 0.148),
    "armF.L": (0.108, -0.110, 0.098),
    "handF.L": (0.165, -0.145, 0.068),
    "kneeB.L": (0.095, 0.165, 0.128),
    "ankleB.L": (0.128, 0.240, 0.092),
    "footB.L": (0.148, 0.310, 0.055),
}
NADAKAZE_RADII_HALF = {
    "hip": 0.092, "chest": 0.100, "head": 0.082,
    "armF.L": 0.026, "handF.L": 0.016,
    "kneeB.L": 0.028, "ankleB.L": 0.018, "footB.L": 0.011,
}
NADAKAZE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nadakaze():
    """
    涙を誘う風。tsubuteと同じ関節構成をベースに、ずんぐりした蛙の体を
    細く引き延ばし、四肢を風になびくリボンのように長く尖らせる。
    頬を大きく膨らませ、吹き出す口を強調する。配色は第五地方
    (なみだの滝つぼ)の、涙と滝つぼを思わせる沈んだ青・藍色系を
    薄めた、風らしい淡い色。
    """
    joints = C.mirrored(NADAKAZE_HALF)
    radii = C.mirrored_radii(NADAKAZE_RADII_HALF)
    bones = C.mirrored_bones(NADAKAZE_BONES_HALF)

    body = C.build_skinned("nadakaze", joints, bones, radii, root="chest", subsurf=2)
    wind = C.make_material("nadakaze_wind", (0.52, 0.60, 0.70), roughness=0.5)
    C.assign_material(body, wind)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"nadakaze_eye{side}", (0.058 * side, -0.255, 0.168), 0.030,
                          look=(0.2 * side, -1.0, 0.05),
                          white=(0.82, 0.88, 0.92), dark=(0.14, 0.18, 0.24))
        # 大きく膨らませた頬
        cheek = C.uv_sphere(f"nadakaze_cheek{side}", (0.082 * side, -0.240, 0.128), 0.046,
                            segments=14, rings=10)
        C.assign_material(cheek, wind)
        extras.append(cheek)
    mouth = C.uv_sphere("nadakaze_mouth", (0.0, -0.290, 0.118), 0.030,
                        segments=14, rings=10, scale=(0.9, 0.7, 0.75))
    C.assign_material(mouth, C.make_material("nadakaze_mouth_m", (0.16, 0.20, 0.28), roughness=0.4))
    extras.append(mouth)

    mesh = C.join([body] + extras, "nadakaze")
    armature = C.build_armature("nadakaze", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nadakaze_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 風になびくように、絶えずゆらゆらと揺れる
        ("idle", [
            (1, {head: (0, 0, 0), legL: (0, 0, 8), legR: (0, 0, -8)}),
            (20, {head: (4, 6, 0), legL: (0, 0, -8), legR: (0, 0, 8)}),
            (40, {head: (-3, -6, 0), legL: (0, 0, 8), legR: (0, 0, -8)}),
        ]),
        # 地を這わず、風のように滑らかに漂い進む
        ("walk", [
            (1, {legL: (0, 0, 14), legR: (0, 0, -14), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (8, {legL: (0, 0, -14), legR: (0, 0, 14), armL: (0, 0, -10), armR: (0, 0, 10)}),
            (16, {legL: (0, 0, 14), legR: (0, 0, -14), armL: (0, 0, 10), armR: (0, 0, -10)}),
        ]),
        # 頬を膨らませてためてから、勢いよく吹きつける
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (5, {head: (-16, 0, 0)}),
            (10, {head: (22, 0, 0)}),
            (18, {head: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (18, 0, 0), armL: (-16, 0, 14), armR: (-16, 0, -14)}),
            (12, {head: (0, 0, 0)}),
        ]),
        # 風がやむように、輪郭がほどけて消える
        ("die", [
            (1, {head: (0, 0, 0)}),
            (9, {head: (0, 8, 0), legL: (0, 0, -24), legR: (0, 0, 24)}),
            (20, {head: (0, 16, 0), legL: (0, 0, -50), legR: (0, 0, 50)}),
        ]),
    ]


# =================================================================== しおれざくら

SHIORESAKURA_JOINTS = {
    "base": (0.0, 0.0, 0.075),
    "mid": (0.0, 0.0, 0.190),
    "top": (0.0, 0.0, 0.300),
}
SHIORESAKURA_RADII = {"base": 0.185, "mid": 0.185, "top": 0.095}
SHIORESAKURA_BONES = [("base", "mid"), ("mid", "top")]


def build_shioresakura():
    """
    涙で色あせた花。purunと同じ縦2本の骨組みをそのまま流用し、頭の
    周りに萎れた花びらを6枚まとわせる。花びらは半分ほど下向きに
    垂れさせ、「打たれるたびに力を失っていく」萎れた姿にする。
    配色は第五地方(なみだの滝つぼ)の、涙で色あせた沈んだ青・藍色系。
    """
    body = C.build_skinned("shioresakura", SHIORESAKURA_JOINTS, SHIORESAKURA_BONES,
                           SHIORESAKURA_RADII, root="base", subsurf=2)
    stem = C.make_material("shiore_stem", (0.30, 0.34, 0.30), roughness=0.7)
    C.assign_material(body, stem)

    petal_mat = C.make_material("shiore_petal", (0.44, 0.46, 0.62), roughness=0.6)
    petal_dark = C.make_material("shiore_petal_dark", (0.32, 0.34, 0.50), roughness=0.65)
    petals = []
    for i, angle_deg in enumerate([0.0, 60.0, 120.0, 180.0, 240.0, 300.0]):
        angle = math.radians(angle_deg)
        # 半分は下向きに垂らして萎れた印象を強める
        droop = 0.055 if i % 2 == 0 else 0.020
        cx, cy = math.cos(angle) * 0.145, math.sin(angle) * 0.145
        petal = C.uv_sphere(f"shiore_petal{i}", (cx, cy, 0.300 - droop), 0.098,
                            segments=16, rings=12, scale=(1.0, 1.0, 0.30))
        C.assign_material(petal, petal_mat if i % 2 == 0 else petal_dark)
        petals.append(petal)
    body = C.join([body] + petals, "shioresakura")

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"shiore_eye{side}", (0.075 * side, -0.170, 0.205), 0.038,
                          look=(0.2 * side, -1.0, 0.0),
                          white=(0.78, 0.80, 0.86), dark=(0.14, 0.14, 0.22))
    mouth = C.uv_sphere("shiore_mouth", (0.0, -0.195, 0.140), 0.032,
                        segments=14, rings=10, scale=(1.3, 0.5, 0.55))
    C.assign_material(mouth, C.make_material("shiore_mouth_m", (0.20, 0.22, 0.32), roughness=0.3))
    extras.append(mouth)

    mesh = C.join([body] + extras, "shioresakura")
    armature = C.build_armature("shioresakura", C.mirrored(SHIORESAKURA_JOINTS),
                                SHIORESAKURA_BONES, mesh, root="base")
    return [mesh, armature], armature


def shioresakura_animations():
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (18, {lower: {"scale": (1.04, 0.95, 1.04)}, upper: {"scale": (0.97, 1.05, 0.97)}}),
            (36, {lower: neutral, upper: neutral}),
        ]),
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}, upper: squash}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # 瀕死になるほど攻撃力が増す性質どおり、散り際に大きく身を反らせる
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {"scale": (0.8, 1.35, 0.8), "loc": (0, 0.06, 0)}, upper: {"scale": (1.18, 0.78, 1.18)}}),
            (18, {lower: neutral, upper: neutral}),
        ]),
        ("hit", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: {"scale": (1.3, 0.66, 1.3)}, upper: {"scale": (0.88, 1.16, 0.88)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # 散る花びらのように、輪郭を潰しながら崩れ落ちる
        ("die", [
            (1, {lower: neutral, upper: neutral}),
            (10, {lower: {"scale": (1.35, 0.5, 1.35)}, upper: {"scale": (1.25, 0.55, 1.25)}}),
            (24, {lower: {"scale": (1.5, 0.06, 1.5)}, upper: {"scale": (1.4, 0.08, 1.4)}}),
        ]),
    ]


# ======================================================================= みずかがみ

MIZUKAGAMI_JOINTS = {
    "root": (0.0, 0.0, 0.04),
    "stem": (0.0, 0.0, 0.12),
    "capbase": (0.0, 0.0, 0.22),
    "captop": (0.0, 0.0, 0.30),
}
MIZUKAGAMI_RADII = {"root": 0.13, "stem": 0.19, "capbase": 0.20, "captop": 0.16}
MIZUKAGAMI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def mizukagami_mirror_z(dist: float) -> float:
    """
    鏡面(captop上に載る円盤)の表面高さ。captop(半径0.16)の直上に、
    サブディビジョンで丸まるぶんを見積もって少し高めに置く。
    """
    return MIZUKAGAMI_JOINTS["captop"][2] + 0.012


def build_mizukagami():
    """
    滝つぼの水面に映る古い姿。madoromiと同じ関節構成をベースに、傘を
    大きく広げる代わりに寸胴な壺のような輪郭にし、頂上に鏡のような
    水面を張らせる(mimic AIらしく道具に紛れ込む、目立たない形)。
    水面には同心円の波紋を色の濃淡で描き、姿を映す鏡であることを示す。
    """
    body = C.build_skinned("mizukagami", MIZUKAGAMI_JOINTS, MIZUKAGAMI_BONES,
                           MIZUKAGAMI_RADII, root="root", subsurf=3)
    jar_mat = C.make_material("mizukagami_jar", (0.20, 0.24, 0.36), roughness=0.7)
    C.assign_material(body, jar_mat)

    # 頂上に張った水面。中心からの距離に応じて濃淡を塗り分け、波紋にする
    mirror = C.uv_sphere("mizukagami_mirror", (0.0, 0.0, mizukagami_mirror_z(0.0)), 0.155,
                         segments=40, rings=20, scale=(1.0, 1.0, 0.12))
    ripple_light = C.make_material("mizukagami_ripple_light", (0.64, 0.74, 0.84), roughness=0.15)
    ripple_dark = C.make_material("mizukagami_ripple_dark", (0.30, 0.40, 0.54), roughness=0.15)

    def classify_ripple(c):
        dist = math.sqrt(c.x * c.x + c.y * c.y)
        band = int(dist / 0.030) % 2
        return band

    C.assign_materials_by_region(mirror, [ripple_light, ripple_dark], classify_ripple)

    extras = [mirror]
    for side in (-1.0, 1.0):
        # 息をひそめて縁からのぞく、目立たない目
        eye = C.uv_sphere(f"mizukagami_eye{side}", (0.062 * side, -0.150, 0.175), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.55))
        C.assign_material(eye, C.make_material(f"mizukagami_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    mouth = C.uv_sphere("mizukagami_mouth", (0.0, -0.155, 0.130), 0.022,
                        segments=12, rings=8, scale=(0.9, 0.5, 0.6))
    C.assign_material(mouth, C.make_material("mizukagami_mouth_m", (0.14, 0.16, 0.24), roughness=0.4))
    extras.append(mouth)

    mesh = C.join([body] + extras, "mizukagami")
    armature = C.build_armature("mizukagami", MIZUKAGAMI_JOINTS, MIZUKAGAMI_BONES, mesh, root="root")
    return [mesh, armature], armature


def mizukagami_animations():
    stem, cap, mirror = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # 道具のふりをして、ほとんど動かずじっと潜む
        ("idle", [
            (1, {mirror: (0, 0, 0)}),
            (48, {mirror: (1.2, 0, 1)}),
            (96, {mirror: (0, 0, 0)}),
        ]),
        # 道具らしからぬ、正体を現したときのぎこちない足取り
        ("walk", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}),
            (7, {stem: (8, 0, 5), cap: (-6, 0, -3)}),
            (14, {stem: (-8, 0, -5), cap: (6, 0, 3)}),
            (21, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        ("attack", [
            (1, {cap: (0, 0, 0), mirror: (0, 0, 0)}),
            (5, {cap: (-18, 0, 0), mirror: (-14, 0, 0)}),
            (10, {cap: (22, 0, 0), mirror: (20, 0, 0)}),
            (20, {cap: (0, 0, 0), mirror: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}),
            (4, {stem: (-16, 0, 0), cap: (-14, 0, 0)}),
            (14, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        # 水面が波紋となって崩れ、映していた姿が消える
        ("die", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}),
            (10, {stem: (-24, 0, 8), cap: (-28, 0, 0), mirror: (-20, 0, 0)}),
            (24, {stem: (-70, 0, 20), cap: (-52, 0, 0), mirror: (-38, 0, 0)}),
        ]),
    ]


# ========================================================================= なきむし

NAKIMUSHI_HALF = {
    "hip": (0.0, 0.06, 0.10),
    "chest": (0.0, -0.03, 0.115),
    "head": (0.0, -0.12, 0.115),
    "armF.L": (0.075, -0.08, 0.06),
    "handF.L": (0.09, -0.11, 0.02),
    "kneeB.L": (0.10, 0.06, 0.10),
    "ankleB.L": (0.09, -0.02, 0.03),
    "footB.L": (0.085, -0.075, 0.012),
}
NAKIMUSHI_RADII_HALF = {
    "hip": 0.095, "chest": 0.10, "head": 0.085,
    "armF.L": 0.022, "handF.L": 0.026,
    "kneeB.L": 0.024, "ankleB.L": 0.016, "footB.L": 0.010,
}
NAKIMUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nakimushi():
    """
    泣きやまない小さな夢。tsubuteと同じ関節構成をベースに、群れの1体分
    として簡略化した小さなシルエットに縮める。目を大きく見開いて
    しゃくり上げ、頬に涙の筋を垂らし、口を大きく開けて泣き叫ぶ顔にする。
    配色は第五地方(なみだの滝つぼ)の、涙と滝つぼを思わせる沈んだ
    青・藍色系。
    """
    joints = C.mirrored(NAKIMUSHI_HALF)
    radii = C.mirrored_radii(NAKIMUSHI_RADII_HALF)
    bones = C.mirrored_bones(NAKIMUSHI_BONES_HALF)

    body = C.build_skinned("nakimushi", joints, bones, radii, root="chest", subsurf=2)
    skin = C.make_material("nakimushi_skin", (0.24, 0.28, 0.42), roughness=0.65)
    C.assign_material(body, skin)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"nakimushi_eye{side}", (0.048 * side, -0.155, 0.135), 0.026,
                          look=(0.2 * side, -1.0, 0.1),
                          white=(0.86, 0.90, 0.94), dark=(0.12, 0.16, 0.26))
        # 頬を伝う涙の筋
        tear = C.uv_sphere(f"nakimushi_tear{side}", (0.052 * side, -0.140, 0.095), 0.016,
                           segments=10, rings=8, scale=(0.7, 0.7, 1.7))
        C.assign_material(tear, C.make_material(f"nakimushi_tear{side}_m", (0.66, 0.78, 0.90),
                                                roughness=0.2))
        extras.append(tear)
    mouth = C.uv_sphere("nakimushi_mouth", (0.0, -0.175, 0.078), 0.038,
                        segments=14, rings=10, scale=(0.85, 0.7, 1.0))
    C.assign_material(mouth, C.make_material("nakimushi_mouth_m", (0.10, 0.08, 0.14), roughness=0.5))
    extras.append(mouth)

    mesh = C.join([body] + extras, "nakimushi")
    armature = C.build_armature("nakimushi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nakimushi_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # しゃくり上げるように、絶えず小刻みに震える
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (6, {head: (5, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (18, {head: (5, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (24, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {legL: (0, 0, 20), legR: (0, 0, -20), armL: (0, 0, -14), armR: (0, 0, 14)}),
            (7, {legL: (0, 0, -20), legR: (0, 0, 20), armL: (0, 0, 14), armR: (0, 0, -14)}),
            (14, {legL: (0, 0, 20), legR: (0, 0, -20), armL: (0, 0, -14), armR: (0, 0, 14)}),
        ]),
        # 小さな体を反らせて、精一杯泣き声を上げる
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (5, {head: (-18, 0, 0), armL: (-14, 0, 10), armR: (-14, 0, -10)}),
            (10, {head: (14, 0, 0), armL: (10, 0, -8), armR: (10, 0, 8)}),
            (18, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (16, 0, 0), armL: (-10, 0, 12), armR: (-10, 0, -12)}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 声を上げきったように、体がしぼんで消える
        ("die", [
            (1, {head: (0, 0, 0)}),
            (9, {head: (10, 0, 0), legL: (0, 0, -18), legR: (0, 0, 18)}),
            (20, {head: (20, 0, 0), legL: (0, 0, -40), legR: (0, 0, 40)}),
        ]),
    ]


# ========================================================================= なみだぐま

NAMIDAGUMA_HALF = {
    "hip": (0.0, 0.115, 0.195),
    "chest": (0.0, -0.055, 0.215),
    "head": (0.0, -0.225, 0.205),
    "armF.L": (0.155, -0.155, 0.10),
    "handF.L": (0.175, -0.220, 0.025),
    "kneeB.L": (0.21, 0.115, 0.21),
    "ankleB.L": (0.185, -0.045, 0.065),
    "footB.L": (0.175, -0.155, 0.022),
}
NAMIDAGUMA_RADII_HALF = {
    "hip": 0.185, "chest": 0.195, "head": 0.165,
    "armF.L": 0.058, "handF.L": 0.062,
    "kneeB.L": 0.095, "ankleB.L": 0.068, "footB.L": 0.058,
}
NAMIDAGUMA_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_namidaguma():
    """
    こらえきれずにこぼれた涙が底力に変わる姿。tsubuteと同じ関節構成を
    ベースに、四肢を太く張り出させ、正面から迫る力強いがっしりした
    熊の体格に作り替える。頭に丸い耳と突き出た鼻面を足し、眉間を
    寄せた険しい表情にする。片頬にだけ、こらえきれず伝った涙の筋を
    残す。配色は第五地方(なみだの滝つぼ)の、涙と滝つぼを思わせる
    沈んだ青・藍色系。
    """
    joints = C.mirrored(NAMIDAGUMA_HALF)
    radii = C.mirrored_radii(NAMIDAGUMA_RADII_HALF)
    bones = C.mirrored_bones(NAMIDAGUMA_BONES_HALF)

    body = C.build_skinned("namidaguma", joints, bones, radii, root="chest", subsurf=2)
    fur = C.make_material("namidaguma_fur", (0.22, 0.26, 0.38), roughness=0.75)
    paw = C.make_material("namidaguma_paw", (0.13, 0.16, 0.26), roughness=0.7)
    C.assign_materials_by_region(body, [fur, paw], lambda c: 1 if c.z < 0.075 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # 頭頂の丸い耳
        ear = C.uv_sphere(f"namidaguma_ear{side}", (0.115 * side, -0.180, 0.315), 0.055,
                          segments=14, rings=10, scale=(1.0, 0.7, 0.85))
        C.assign_material(ear, fur)
        extras.append(ear)
        # 眉間を寄せた険しい眉
        brow = C.uv_sphere(f"namidaguma_brow{side}", (0.075 * side, -0.320, 0.255), 0.042,
                           segments=12, rings=8, scale=(1.0, 0.6, 0.4))
        C.assign_material(brow, paw)
        extras.append(brow)
        extras += eyeball(f"namidaguma_eye{side}", (0.070 * side, -0.325, 0.220), 0.030,
                          look=(0.2 * side, -1.0, -0.1),
                          white=(0.70, 0.74, 0.82), dark=(0.10, 0.12, 0.20))
    # こらえきれず伝った涙の筋(左頬にだけ残す)
    tear = C.uv_sphere("namidaguma_tear", (-0.062, -0.300, 0.165), 0.020,
                       segments=10, rings=8, scale=(0.7, 0.7, 1.8))
    C.assign_material(tear, C.make_material("namidaguma_tear_m", (0.60, 0.70, 0.84), roughness=0.2))
    extras.append(tear)
    # 突き出た鼻面
    snout = C.uv_sphere("namidaguma_snout", (0.0, -0.365, 0.185), 0.052,
                        segments=14, rings=10, scale=(0.85, 1.1, 0.7))
    C.assign_material(snout, paw)
    extras.append(snout)
    mouth = C.uv_sphere("namidaguma_mouth", (0.0, -0.400, 0.150), 0.028,
                        segments=12, rings=8, scale=(1.1, 0.6, 0.55))
    C.assign_material(mouth, C.make_material("namidaguma_mouth_m", (0.08, 0.06, 0.10), roughness=0.4))
    extras.append(mouth)

    mesh = C.join([body] + extras, "namidaguma")
    armature = C.build_armature("namidaguma", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def namidaguma_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (30, {head: (2, 0, 1), armL: (0, 0, 2), armR: (0, 0, -2)}),
            (60, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 重い体を踏みしめるように歩く
        ("walk", [
            (1, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
            (9, {legL: (0, 0, -16), legR: (0, 0, 16), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (18, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
        ]),
        # 底力を振り絞り、正面から力強く叩きつける
        ("attack", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (5, {head: (-14, 0, 0), armL: (-30, 0, 16), armR: (-30, 0, -16)}),
            (10, {head: (20, 0, 0), armL: (36, 0, -10), armR: (36, 0, 10)}),
            (20, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (16, 0, 0), armL: (-12, 0, 10), armR: (-12, 0, -10)}),
            (14, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {head: (0, 0, 0)}),
            (10, {head: (0, 0, 10), legL: (0, 0, -20), legR: (0, 0, 20)}),
            (24, {head: (0, 0, 22), legL: (0, 0, -46), legR: (0, 0, 46)}),
        ]),
    ]


# ======================================================================= ねむりモグラ

NEMURIMOGURA_HALF = {
    "hip": (0.0, 0.13, 0.19),
    "chest": (0.0, -0.01, 0.20),
    "neck": (0.0, -0.11, 0.185),
    "snout": (0.0, -0.24, 0.14),
    "tail1": (0.0, 0.175, 0.155),
    "tail2": (0.0, 0.195, 0.15),
    "tail3": (0.0, 0.21, 0.145),
    "ear.L": (0.058, -0.115, 0.225),
    "hipF.L": (0.105, -0.045, 0.125),
    "footF.L": (0.135, -0.075, 0.03),
    "hipB.L": (0.10, 0.115, 0.135),
    "footB.L": (0.10, 0.145, 0.02),
}
NEMURIMOGURA_RADII_HALF = {
    "hip": 0.155, "chest": 0.165, "neck": 0.125, "snout": 0.052,
    "tail1": 0.038, "tail2": 0.032, "tail3": 0.024,
    "ear.L": 0.030,
    "hipF.L": 0.058, "footF.L": 0.066,
    "hipB.L": 0.048, "footB.L": 0.034,
}
NEMURIMOGURA_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_nemurimogura():
    """
    攻撃に眠りが確定でまとわりつくようになったモグラ。gajiriと同じ
    関節構成をベースに、体を丸く縮め、耳を小さく、尻尾を短く埋もれさせ、
    掘削に適した大きな前足に作り替える。オオマドロミの力を宿す証として、
    背に淡い胞子色の斑点を散らし、常に半分閉じた眠たげな目にする。
    配色は第三地方(まどろみの茸林)の、湿った土色と胞子の淡い黄土色。
    """
    joints = C.mirrored(NEMURIMOGURA_HALF)
    radii = C.mirrored_radii(NEMURIMOGURA_RADII_HALF)
    bones = C.mirrored_bones(NEMURIMOGURA_BONES_HALF)

    body = C.build_skinned("nemurimogura", joints, bones, radii, root="chest", subsurf=2)
    soil = C.make_material("nemurimogura_soil", (0.28, 0.22, 0.16), roughness=0.8)
    belly = C.make_material("nemurimogura_belly", (0.40, 0.34, 0.24), roughness=0.75)
    ear_in = C.make_material("nemurimogura_ear", (0.62, 0.46, 0.42), roughness=0.75)

    # 耳だけを内側の色にする。gajiriと同じく、高さで切ると背中まで
    # 巻き込むので耳の関節からの距離で判定する
    ears = [Vector(joints["ear.L"]), Vector(joints["ear.R"])]
    C.assign_materials_by_region(
        body, [soil, belly, ear_in],
        lambda c: 2 if min((c - e).length for e in ears) < 0.045
        else (1 if c.z < 0.135 else 0),
    )

    extras = []
    spore = C.make_material("nemurimogura_spore", (0.78, 0.70, 0.42), roughness=0.6)
    for i, (x, y, z, r) in enumerate([
        (0.06, -0.02, 0.245, 0.028), (-0.07, 0.05, 0.235, 0.024),
        (0.03, 0.16, 0.225, 0.022), (-0.04, 0.24, 0.205, 0.020),
    ]):
        spot = C.uv_sphere(f"nemurimogura_spore{i}", (x, y, z), r,
                           segments=10, rings=8, scale=(1.0, 1.0, 0.4))
        C.assign_material(spot, spore)
        extras.append(spot)
    for side in (-1.0, 1.0):
        # 常に半分閉じた眠たげな目
        eye = C.uv_sphere(f"nemurimogura_eye{side}", (0.058 * side, -0.185, 0.175), 0.024,
                          segments=14, rings=10, scale=(1.0, 0.55, 0.35))
        C.assign_material(eye, C.make_material(f"nemurimogura_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    nose = C.uv_sphere("nemurimogura_nose", (0.0, -0.275, 0.135), 0.024,
                       segments=12, rings=8, scale=(1.0, 0.7, 0.7))
    C.assign_material(nose, C.make_material("nemurimogura_nose_m", (0.72, 0.52, 0.52), roughness=0.4))
    extras.append(nose)

    mesh = C.join([body] + extras, "nemurimogura")
    armature = C.build_armature("nemurimogura", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nemurimogura_animations():
    neck = "chest-neck"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    return [
        # 眠たげに、ゆっくりと体を揺らす
        ("idle", [
            (1, {neck: (0, 0, 0)}),
            (36, {neck: (3, 0, 2)}),
            (72, {neck: (0, 0, 0)}),
        ]),
        # 土を掻くように、前足を大きく使って進む
        ("walk", [
            (1, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
            (8, {hipF_L: (-16, 0, 0), hipF_R: (16, 0, 0), hipB_L: (14, 0, 0), hipB_R: (-14, 0, 0)}),
            (16, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
        ]),
        # 前足を大きく掻き出し、眠りをまとわりつかせる
        ("attack", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (5, {neck: (-10, 0, 0), hipF_L: (-24, 0, 14), hipF_R: (-24, 0, -14)}),
            (10, {neck: (14, 0, 0), hipF_L: (28, 0, -10), hipF_R: (28, 0, 10)}),
            (18, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (14, 0, 0), hipF_L: (-10, 0, 8), hipF_R: (-10, 0, -8)}),
            (14, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 眠りに沈むように、体を丸めて消える
        ("die", [
            (1, {neck: (0, 0, 0)}),
            (10, {neck: (10, 0, 0), hipF_L: (16, 0, 0), hipF_R: (16, 0, 0)}),
            (24, {neck: (24, 0, 0), hipF_L: (36, 0, 0), hipF_R: (36, 0, 0)}),
        ]),
    ]


# ========================================================================= ヌシガエル

NUSHIGAERU_HALF = {
    "hip": (0.0, 0.135, 0.23),
    "chest": (0.0, -0.068, 0.257),
    "head": (0.0, -0.27, 0.243),
    "armF.L": (0.19, -0.19, 0.122),
    "handF.L": (0.216, -0.27, 0.027),
    "kneeB.L": (0.257, 0.135, 0.257),
    "ankleB.L": (0.23, -0.054, 0.081),
    "footB.L": (0.216, -0.19, 0.030),
}
NUSHIGAERU_RADII_HALF = {
    "hip": 0.225, "chest": 0.24, "head": 0.20,
    "armF.L": 0.052, "handF.L": 0.058,
    "kneeB.L": 0.10, "ankleB.L": 0.068, "footB.L": 0.062,
}
NUSHIGAERU_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nushigaeru():
    """
    ツブテガエルが霧深い湿地でたどり着いた、最も重たい遠い記憶の姿。
    tsubuteと同じ関節構成をベースに、並より一回り大きな図体に拡大し、
    この地方の主にふさわしい貫禄を持たせる。喉に石つぶてを溜め込む
    大きな喉袋を足し、背には歳月を経た証のいぼを散らす。目は主の
    証として淡く発光させる。配色は第二地方(忘れ潮の湿地)の、
    霧と水を思わせる灰みがかった水色・青緑系。
    """
    joints = C.mirrored(NUSHIGAERU_HALF)
    radii = C.mirrored_radii(NUSHIGAERU_RADII_HALF)
    bones = C.mirrored_bones(NUSHIGAERU_BONES_HALF)

    body = C.build_skinned("nushigaeru", joints, bones, radii, root="chest", subsurf=2)
    hide = C.make_material("nushigaeru_hide", (0.36, 0.46, 0.48), roughness=0.7)
    belly = C.make_material("nushigaeru_belly", (0.56, 0.64, 0.62), roughness=0.6)
    C.assign_materials_by_region(body, [hide, belly], lambda c: 1 if c.z < 0.145 else 0)

    extras = []
    glow = C.make_material("nushigaeru_eye", (0.68, 0.86, 0.82), roughness=0.25, emission=1.4)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"nushigaeru_eye{side}", (0.082 * side, -0.335, 0.288), 0.040,
                          segments=16, rings=12, scale=(1.0, 1.0, 0.9))
        C.assign_material(eye, glow)
        extras.append(eye)
    # 石つぶてを溜め込む大きな喉袋
    throat = C.uv_sphere("nushigaeru_throat", (0.0, -0.335, 0.165), 0.088,
                         segments=18, rings=14, scale=(1.0, 0.95, 0.78))
    C.assign_material(throat, belly)
    extras.append(throat)
    mouth = C.uv_sphere("nushigaeru_mouth", (0.0, -0.385, 0.205), 0.040,
                        segments=14, rings=10, scale=(1.15, 0.55, 0.5))
    C.assign_material(mouth, C.make_material("nushigaeru_mouth_m", (0.14, 0.16, 0.16), roughness=0.4))
    extras.append(mouth)
    # 歳月を経た証のいぼ
    wart_mat = C.make_material("nushigaeru_wart", (0.26, 0.34, 0.36), roughness=0.75)
    for i, (x, y, z, r) in enumerate([
        (0.10, 0.04, 0.315, 0.030), (-0.13, 0.10, 0.30, 0.026),
        (0.05, 0.19, 0.29, 0.024), (-0.06, -0.04, 0.32, 0.022),
        (0.16, 0.16, 0.275, 0.022),
    ]):
        wart = C.uv_sphere(f"nushigaeru_wart{i}", (x, y, z), r, segments=10, rings=8)
        C.assign_material(wart, wart_mat)
        extras.append(wart)

    mesh = C.join([body] + extras, "nushigaeru")
    armature = C.build_armature("nushigaeru", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nushigaeru_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (36, {head: (2, 0, 1)}),
            (72, {head: (0, 0, 0)}),
        ]),
        # 重い図体を踏みしめて進む
        ("walk", [
            (1, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
            (10, {legL: (0, 0, -16), legR: (0, 0, 16), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (20, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
        ]),
        # 喉袋を大きく膨らませてから、石つぶてを吐き出す
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (6, {head: (-18, 0, 0)}),
            (12, {head: (26, 0, 0)}),
            (22, {head: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (16, 0, 0), armL: (-14, 0, 12), armR: (-14, 0, -12)}),
            (14, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {head: (0, 0, 0)}),
            (10, {head: (0, 8, 0), legL: (0, 0, -20), legR: (0, 0, 20)}),
            (24, {head: (0, 16, 0), legL: (0, 0, -46), legR: (0, 0, 46)}),
        ]),
    ]


# ====================================================================== オイテケボシ

OITEKEBOSHI_JOINTS = {
    "root": (0.0, 0.0, 0.05),
    "stem": (0.0, 0.0, 0.20),
    "capbase": (0.0, 0.0, 0.30),
    "captop": (0.0, 0.0, 0.38),
}
OITEKEBOSHI_RADII = {"root": 0.09, "stem": 0.075, "capbase": 0.22, "captop": 0.05}
OITEKEBOSHI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_oitekeboshi():
    """
    置き去りにされた未練。madoromiと同じ関節構成をベースに、傘の縁に
    尖った突起を並べて星形の輪郭を作る。HPではなく満腹度を削る由来
    として、大きく開いた口に小さな牙を並べる。配色は第四地方
    (骨積みの回廊)の、積み重なった骨を思わせる白骨色・くすんだ灰色。
    目は未練の残り火として淡く発光させる。
    """
    body = C.build_skinned("oitekeboshi", OITEKEBOSHI_JOINTS, OITEKEBOSHI_BONES,
                           OITEKEBOSHI_RADII, root="root", subsurf=2)
    bone = C.make_material("oiteke_bone", (0.72, 0.68, 0.60), roughness=0.65)
    ash = C.make_material("oiteke_ash", (0.42, 0.42, 0.44), roughness=0.7)
    C.assign_materials_by_region(body, [bone, ash], lambda c: 1 if c.z > 0.285 else 0)

    extras = []
    # 傘の縁に並べた星形の突起
    for i, angle_deg in enumerate([0.0, 60.0, 120.0, 180.0, 240.0, 300.0]):
        angle = math.radians(angle_deg)
        px, py = math.cos(angle) * 0.205, math.sin(angle) * 0.205
        spike = C.cone(f"oiteke_spike{i}", (px, py, 0.235), 0.052, 0.006, 0.09)
        C.assign_material(spike, ash)
        extras.append(spike)

    glow = C.make_material("oiteke_eye", (0.62, 0.72, 0.80), roughness=0.25, emission=1.5)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"oiteke_eye{side}", (0.048 * side, -0.078, 0.155), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.7, 0.9))
        C.assign_material(eye, glow)
        extras.append(eye)
    mouth = C.uv_sphere("oiteke_mouth", (0.0, -0.082, 0.098), 0.038,
                        segments=14, rings=10, scale=(1.1, 0.55, 0.65))
    C.assign_material(mouth, C.make_material("oiteke_mouth_m", (0.10, 0.09, 0.10), roughness=0.4))
    extras.append(mouth)
    # 満腹度を削る由来を示す、口元に並んだ小さな牙
    fang_mat = C.make_material("oiteke_fang", (0.88, 0.85, 0.78), roughness=0.4)
    for i, fx in enumerate([-0.026, -0.009, 0.009, 0.026]):
        fang = C.cone(f"oiteke_fang{i}", (fx, -0.098, 0.118), 0.009, 0.001, 0.026)
        C.assign_material(fang, fang_mat)
        extras.append(fang)

    mesh = C.join([body] + extras, "oitekeboshi")
    armature = C.build_armature("oitekeboshi", OITEKEBOSHI_JOINTS, OITEKEBOSHI_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def oitekeboshi_animations():
    lower, upper = "root-stem", "stem-capbase"
    top = "capbase-captop"
    return [
        # 未練が漂うように、絶えずゆらゆらと揺れる
        ("idle", [
            (1, {lower: (0, 0, 0), upper: (0, 0, 0)}),
            (24, {lower: (3, 0, 2), upper: (-3, 0, 0), top: (2, 0, 0)}),
            (48, {lower: (0, 0, 0), upper: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {lower: (0, 0, -8), upper: (0, 0, 6)}),
            (9, {lower: (5, 0, 0), upper: (-4, 0, 0)}),
            (18, {lower: (0, 0, 8), upper: (0, 0, -6)}),
            (27, {lower: (5, 0, 0), upper: (-4, 0, 0)}),
            (36, {lower: (0, 0, -8), upper: (0, 0, 6)}),
        ]),
        # 大きく口を開け、満腹度を吸い取るように吐き出す
        ("attack", [
            (1, {upper: (0, 0, 0), top: (0, 0, 0)}),
            (5, {upper: (-14, 0, 0), top: (-10, 0, 0)}),
            (10, {upper: (20, 0, 0), top: (16, 0, 0)}),
            (20, {upper: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {lower: (0, 0, 0)}),
            (4, {lower: (-16, 0, 0), upper: (-14, 0, 0)}),
            (14, {lower: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 置き去りの未練が、輪郭をほどいて消える
        ("die", [
            (1, {lower: (0, 0, 0)}),
            (10, {lower: (-30, 0, 10), upper: (-18, 0, 0)}),
            (24, {lower: (-78, 0, 22), upper: (-32, 0, 0)}),
        ]),
    ]


# ======================================================================= オオマドロミ

OOMADOROMI_JOINTS = {
    "root": (0.0, 0.0, 0.075),
    "stem": (0.0, 0.0, 0.335),
    "capbase": (0.0, 0.0, 0.50),
    "captop": (0.0, 0.0, 0.68),
}
OOMADOROMI_RADII = {"root": 0.165, "stem": 0.15, "capbase": 0.375, "captop": 0.08}
OOMADOROMI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def oomadoromi_cap_surface_z(dist: float) -> float:
    """madoromiのcap_surface_zと同じ考え方を、oomadoromiの寸法に合わせて計算する。"""
    base_z, top_z = OOMADOROMI_JOINTS["capbase"][2], OOMADOROMI_JOINTS["captop"][2]
    base_r, top_r = OOMADOROMI_RADII["capbase"] * 0.86, OOMADOROMI_RADII["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.016


def build_oomadoromi():
    """
    マドロミダケが煮詰まりにまで煮詰まった、眠気そのものの化身。
    madoromiと同じ関節構成をベースに、全体をおよそ1.4倍に拡大し、
    がっしりした太い軸と大きく張り出した傘で、正面から迫る力強い
    シルエットにする。ヨリシロの核に近い夢である証として、目を
    淡く発光させる。配色は第三地方(まどろみの茸林)の、湿った土色と
    胞子の淡い黄土色。
    """
    body = C.build_skinned("oomadoromi", OOMADOROMI_JOINTS, OOMADOROMI_BONES,
                           OOMADOROMI_RADII, root="root", subsurf=2)
    stem_mat = C.make_material("oomadoromi_stem", (0.78, 0.72, 0.58), roughness=0.75)
    cap_mat = C.make_material("oomadoromi_cap", (0.46, 0.30, 0.24), roughness=0.6)
    C.assign_materials_by_region(body, [stem_mat, cap_mat], lambda c: 1 if c.z > 0.44 else 0)

    extras = []
    glow = C.make_material("oomadoromi_eye", (0.86, 0.70, 0.40), roughness=0.25, emission=1.6)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"oomadoromi_eye{side}", (0.088 * side, -0.135, 0.285), 0.044,
                          segments=16, rings=12, scale=(1.0, 0.55, 0.4))
        C.assign_material(eye, glow)
        extras.append(eye)
    mouth = C.uv_sphere("oomadoromi_mouth", (0.0, -0.135, 0.205), 0.042,
                        segments=14, rings=10, scale=(0.85, 0.5, 1.0))
    C.assign_material(mouth, C.make_material("oomadoromi_mouth_m", (0.30, 0.16, 0.16), roughness=0.4))
    extras.append(mouth)

    # 傘の斑点。既存モデルより一回り大きく、数も多くする
    spot_mat = C.make_material("oomadoromi_spot", (0.92, 0.86, 0.66), roughness=0.6)
    for i, (angle_deg, dist, r) in enumerate([
        (200.0, 0.075, 0.058), (300.0, 0.145, 0.050), (60.0, 0.125, 0.052),
        (130.0, 0.180, 0.042), (10.0, 0.200, 0.036), (250.0, 0.225, 0.032),
        (340.0, 0.100, 0.044),
    ]):
        angle = math.radians(angle_deg)
        spot = C.uv_sphere(
            f"oomadoromi_spot{i}",
            (math.cos(angle) * dist, math.sin(angle) * dist, oomadoromi_cap_surface_z(dist)),
            r, segments=12, rings=8, scale=(1.0, 1.0, 0.40),
        )
        C.assign_material(spot, spot_mat)
        extras.append(spot)

    mesh = C.join([body] + extras, "oomadoromi")
    armature = C.build_armature("oomadoromi", OOMADOROMI_JOINTS, OOMADOROMI_BONES, mesh, root="root")
    return [mesh, armature], armature


def oomadoromi_animations():
    stem, cap = "root-stem", "stem-capbase"
    top = "capbase-captop"
    return [
        ("idle", [
            (1, {stem: (0, 0, 0)}),
            (36, {stem: (2, 0, 1), cap: (-2, 0, 0)}),
            (72, {stem: (0, 0, 0)}),
        ]),
        # 太い軸を踏みしめ、傘を左右に大きく揺らして歩く
        ("walk", [
            (1, {stem: (0, 0, -7), cap: (0, 0, 5)}),
            (10, {stem: (5, 0, 0), cap: (-4, 0, 0)}),
            (20, {stem: (0, 0, 7), cap: (0, 0, -5)}),
            (30, {stem: (5, 0, 0), cap: (-4, 0, 0)}),
            (40, {stem: (0, 0, -7), cap: (0, 0, 5)}),
        ]),
        # がっしりした体格から、正面へ全身で叩きつける
        ("attack", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0), top: (0, 0, 0)}),
            (6, {stem: (-12, 0, 0), cap: (-16, 0, 0), top: (-12, 0, 0)}),
            (12, {stem: (20, 0, 0), cap: (28, 0, 0), top: (22, 0, 0)}),
            (24, {stem: (0, 0, 0), cap: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {stem: (0, 0, 0)}),
            (4, {stem: (-16, 0, 0), cap: (-14, 0, 0)}),
            (14, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {stem: (0, 0, 0)}),
            (10, {stem: (-28, 0, 8), cap: (-18, 0, 0)}),
            (24, {stem: (-72, 0, 18), cap: (-30, 0, 0)}),
        ]),
    ]


# ======================================================================= おおねぼすけ

OONEBOSUKE_JOINTS = {
    "base": (0.0, 0.0, 0.12),
    "mid": (0.0, 0.0, 0.30),
    "top": (0.0, 0.0, 0.495),
}
OONEBOSUKE_RADII = {"base": 0.435, "mid": 0.375, "top": 0.135}
OONEBOSUKE_BONES = [("base", "mid"), ("mid", "top")]


def build_oonebosuke():
    """
    眠りこけて起き上がれなくなった、途方もない眠気そのものが人の形を
    借りた姿。purunと同じ縦2本の骨組みをそのまま流用し、全体を
    およそ1.5倍に拡大して、がっしりした力強いシルエットにする。
    まぶたが重く垂れた目(nebosukegaeruと同じ手法)とよだれで、
    決して覚めない眠気を強調する。配色は第一地方(うたたねの参道)の、
    参道の土色に馴染む素朴な淡い色合い。
    """
    body = C.build_skinned("oonebosuke", OONEBOSUKE_JOINTS, OONEBOSUKE_BONES,
                           OONEBOSUKE_RADII, root="base", subsurf=2)
    for vert in body.data.vertices:
        if vert.co.z < 0.03:
            vert.co.z = 0.03 - (0.03 - vert.co.z) * 0.25
    skin = C.make_material("oonebosuke_skin", (0.74, 0.64, 0.50), roughness=0.7)
    C.assign_material(body, skin)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"oonebosuke_eye{side}", (0.128 * side, -0.294, 0.387), 0.077,
                          look=(0.2 * side, -0.85, -0.1), squash=0.42,
                          white=(0.90, 0.86, 0.78), dark=(0.14, 0.10, 0.08))
        # 重く垂れたまぶた
        lid = C.uv_sphere(f"oonebosuke_lid{side}", (0.128 * side, -0.285, 0.408), 0.078,
                          segments=14, rings=10, scale=(1.0, 0.85, 0.55))
        C.assign_material(lid, skin)
        extras.append(lid)
        # 腹の前で組んだような、丸めた腕
        arm = C.uv_sphere(f"oonebosuke_arm{side}", (0.30 * side, -0.16, 0.20), 0.115,
                          segments=16, rings=12, scale=(1.0, 0.85, 0.75))
        C.assign_material(arm, skin)
        extras.append(arm)
    mouth = C.uv_sphere("oonebosuke_mouth", (0.0, -0.342, 0.238), 0.062,
                        segments=14, rings=10, scale=(1.35, 0.5, 0.55))
    C.assign_material(mouth, C.make_material("oonebosuke_mouth_m", (0.14, 0.10, 0.12), roughness=0.3))
    extras.append(mouth)
    # 止まらないよだれ
    drool = C.uv_sphere("oonebosuke_drool", (-0.052, -0.320, 0.140), 0.026,
                        segments=10, rings=8, scale=(0.7, 0.7, 1.8))
    C.assign_material(drool, C.make_material("oonebosuke_drool_m", (0.80, 0.86, 0.82),
                                             roughness=0.2, emission=0.1))
    extras.append(drool)
    # 頭頂の、寝ぼけ眼が見上げるような小さな尖り
    cap = C.cone("oonebosuke_cap", (0.0, 0.0, 0.545), 0.05, 0.006, 0.09)
    C.assign_material(cap, skin)
    extras.append(cap)

    mesh = C.join([body] + extras, "oonebosuke")
    armature = C.build_armature("oonebosuke", C.mirrored(OONEBOSUKE_JOINTS), OONEBOSUKE_BONES,
                                mesh, root="base")
    return [mesh, armature], armature


def oonebosuke_animations():
    lower, upper = "base-mid", "mid-top"
    return [
        # ほとんど動かず、寝息だけのわずかな上下
        ("idle", [
            (1, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
            (36, {lower: {"scale": (1.03, 0.97, 1.03)}, upper: {"scale": (0.98, 1.03, 0.98)}}),
            (72, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
        ]),
        # 重い図体を引きずるように、のっそりと進む
        ("walk", [
            (1, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
            (10, {lower: {"scale": (1.16, 0.82, 1.16)}, upper: {"scale": (0.90, 1.14, 0.90)}}),
            (20, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
        ]),
        # 眠気を振り払うように、がっしりした体格から正面へ叩きつける
        ("attack", [
            (1, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
            (7, {lower: {"scale": (1.22, 0.72, 1.22)}, upper: {"scale": (0.82, 1.24, 0.82), "loc": (0, -0.05, 0)}}),
            (14, {lower: {"scale": (0.85, 1.28, 0.85)}, upper: {"scale": (1.24, 0.78, 1.24), "loc": (0, 0.12, 0)}}),
            (24, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
        ]),
        ("hit", [
            (1, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
            (4, {lower: {"scale": (1.28, 0.68, 1.28)}, upper: {"scale": (0.84, 1.20, 0.84)}}),
            (14, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
        ]),
        ("die", [
            (1, {lower: {"scale": (1.0, 1.0, 1.0)}, upper: {"scale": (1.0, 1.0, 1.0)}}),
            (10, {lower: {"scale": (1.4, 0.45, 1.4)}, upper: {"scale": (1.3, 0.5, 1.3)}}),
            (24, {lower: {"scale": (1.55, 0.05, 1.55)}, upper: {"scale": (1.45, 0.07, 1.45)}}),
        ]),
    ]


# ======================================================================= すべてのぷるん

SUBETENOPURUN_JOINTS = {
    "base": (0.0, 0.0, 0.096),
    "mid": (0.0, 0.0, 0.24),
    "top": (0.0, 0.0, 0.396),
}
SUBETENOPURUN_RADII = {"base": 0.348, "mid": 0.30, "top": 0.108}
SUBETENOPURUN_BONES = [("base", "mid"), ("mid", "top")]


def build_subetenopurun():
    """
    全地方の記憶が混ざり合ったぷるん。purunと同じ縦2本の骨組みを
    そのまま流用し、全体をおよそ1.2倍に拡大してがっしりした力強い
    シルエットにする。第一〜第七地方それぞれの色を、角度で不揃いに
    区切った継ぎ接ぎ模様として体にまとわせ、統一感のない配色にする。
    まどろみの余韻の名残として、目はわずかに眠たげにする。
    """
    body = C.build_skinned("subetenopurun", SUBETENOPURUN_JOINTS, SUBETENOPURUN_BONES,
                           SUBETENOPURUN_RADII, root="base", subsurf=3)
    for vert in body.data.vertices:
        if vert.co.z < 0.024:
            vert.co.z = 0.024 - (0.024 - vert.co.z) * 0.25

    # 第一〜第七地方それぞれの配色を継ぎ接ぎにする
    region_mats = [
        C.make_material("subete_r1", (0.72, 0.62, 0.48), roughness=0.7),   # 第1: うたたねの参道
        C.make_material("subete_r2", (0.40, 0.52, 0.54), roughness=0.6),   # 第2: 忘れ潮の湿地
        C.make_material("subete_r3", (0.46, 0.30, 0.24), roughness=0.6),   # 第3: まどろみの茸林
        C.make_material("subete_r4", (0.74, 0.70, 0.62), roughness=0.65),  # 第4: 骨積みの回廊
        C.make_material("subete_r5", (0.22, 0.26, 0.42), roughness=0.55), # 第5: なみだの滝つぼ
        C.make_material("subete_r6", (0.58, 0.48, 0.34), roughness=0.7),  # 第6: こだまの尾根
        C.make_material("subete_r7", (0.54, 0.20, 0.18), roughness=0.55), # 第7: 忘れられた祭りの跡
    ]
    bounds = [0.0, 45.0, 95.0, 130.0, 190.0, 235.0, 300.0, 360.0]

    def classify(c):
        deg = math.degrees(math.atan2(c.y, c.x)) % 360.0
        for i in range(7):
            if bounds[i] <= deg < bounds[i + 1]:
                return i
        return 6

    C.assign_materials_by_region(body, region_mats, classify)

    extras = []
    for side in (-1.0, 1.0):
        # まどろみの余韻の名残で、わずかに眠たげな目
        extras += eyeball(f"subete_eye{side}", (0.102 * side, -0.235, 0.310), 0.065,
                          look=(0.15 * side, -1.0, 0.0), squash=0.75)
    mouth = C.uv_sphere("subete_mouth", (0.0, -0.274, 0.190), 0.058,
                        segments=14, rings=10, scale=(1.5, 0.5, 0.65))
    C.assign_material(mouth, C.make_material("subete_mouth_m", (0.10, 0.10, 0.14), roughness=0.3))
    extras.append(mouth)

    mesh = C.join([body] + extras, "subetenopurun")
    armature = C.build_armature("subetenopurun", C.mirrored(SUBETENOPURUN_JOINTS),
                                SUBETENOPURUN_BONES, mesh, root="base")
    return [mesh, armature], armature


def subetenopurun_animations():
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (24, {lower: {"scale": (1.03, 0.96, 1.03)}, upper: {"scale": (0.97, 1.04, 0.97)}}),
            (48, {lower: neutral, upper: neutral}),
        ]),
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}, upper: squash}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # 瀕死になるほど攻撃力が増す性質も併せ持つため、力強く踏み込んで叩きつける
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (5, {lower: squash, upper: stretch}),
            (10, {lower: {"scale": (0.82, 1.32, 0.82), "loc": (0, 0.08, 0)}, upper: {"scale": (1.20, 0.80, 1.20)}}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        ("hit", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: {"scale": (1.3, 0.66, 1.3)}, upper: {"scale": (0.88, 1.16, 0.88)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        ("die", [
            (1, {lower: neutral, upper: neutral}),
            (10, {lower: {"scale": (1.4, 0.45, 1.4)}, upper: {"scale": (1.3, 0.5, 1.3)}}),
            (24, {lower: {"scale": (1.55, 0.05, 1.55)}, upper: {"scale": (1.45, 0.07, 1.45)}}),
        ]),
    ]


# ================================================================= ホネヅカのつかい

TSUKAI_JOINTS = {
    "root": (0.0, 0.0, 0.025),
    "stem": (0.0, 0.0, 0.105),
    "capbase": (0.0, 0.0, 0.195),
    "captop": (0.0, 0.0, 0.275),
}
TSUKAI_RADII = {"root": 0.052, "stem": 0.040, "capbase": 0.118, "captop": 0.028}
TSUKAI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_honezukanotsukai():
    """
    ホネヅカのぬしに仕える小さな使い。madoromiと同じ関節構成(root-stem-
    capbase-captop)をベースに、傘ではなく積み重なった椎骨と頭骨を持つ姿にする。
    オイテケボシと同じく満腹度を削るが、忠実な分だけ間合いが近い(range 2)ため、
    口先から突き出た管状の器官を強調し、獲物のすぐそばまで寄って吐きかける
    「発射器官」であることを見た目で示す。配色は第四地方(骨積みの回廊)の
    白骨色・くすんだ灰色。目はぬしに仕える者らしく、感情のない冷たい薄青の光。
    """
    body = C.build_skinned("honezukanotsukai", TSUKAI_JOINTS, TSUKAI_BONES,
                           TSUKAI_RADII, root="root", subsurf=2)
    bone = C.make_material("tsukai_bone", (0.87, 0.85, 0.76), roughness=0.68)
    ash = C.make_material("tsukai_ash", (0.44, 0.44, 0.46), roughness=0.72)
    C.assign_materials_by_region(body, [bone, ash], lambda c: 1 if c.z > 0.235 else 0)

    extras = []
    # 積み重なった椎骨を思わせる、幹に食い込んだ骨の輪
    ring_mat = C.make_material("tsukai_ring", (0.80, 0.77, 0.68), roughness=0.72)
    for i, (z, r) in enumerate([(0.045, 0.050), (0.078, 0.044)]):
        ring = C.cylinder(f"tsukai_ring{i}", (0.0, 0.0, z), r, 0.013, segments=16)
        C.assign_material(ring, ring_mat)
        extras.append(ring)

    # 頭骨の両脇に突き出た、積みきれずにはみ出した肋骨の欠片
    for side in (-1.0, 1.0):
        rib = C.cone(f"tsukai_rib{side}", (0.095 * side, 0.0, 0.155), 0.020, 0.004, 0.075)
        C.assign_material(rib, ash)
        extras.append(rib)

    # 眼窩と、ぬしに仕える者らしい冷たい薄青の光
    socket_mat = C.make_material("tsukai_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("tsukai_glow", (0.55, 0.72, 0.85), roughness=0.25, emission=2.2)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"tsukai_socket{side}", (0.048 * side, -0.088, 0.225), 0.030,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.1))
        C.assign_material(socket, socket_mat)
        extras.append(socket)
        glow = C.uv_sphere(f"tsukai_glow{side}", (0.048 * side, -0.096, 0.225), 0.013,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)

    # 顎と、満腹度を吸い出して吐きかけるための管状の発射口
    mouth_mat = C.make_material("tsukai_mouth", (0.10, 0.09, 0.11), roughness=0.4)
    jaw = C.uv_sphere("tsukai_jaw", (0.0, -0.108, 0.175), 0.034,
                      segments=14, rings=10, scale=(1.0, 0.55, 0.6))
    C.assign_material(jaw, mouth_mat)
    extras.append(jaw)
    snout = C.cylinder("tsukai_snout", (0.0, -0.155, 0.175), 0.022, 0.09,
                       segments=14, axis="Y")
    C.assign_material(snout, ash)
    extras.append(snout)
    nozzle = C.uv_sphere("tsukai_nozzle", (0.0, -0.196, 0.175), 0.020,
                         segments=12, rings=8, scale=(0.8, 0.6, 0.8))
    C.assign_material(nozzle, mouth_mat)
    extras.append(nozzle)

    # 頭骨の天辺に刺さった、割れた骨片の冠
    shard_mat = C.make_material("tsukai_shard", (0.78, 0.75, 0.66), roughness=0.7)
    for i, angle_deg in enumerate([0.0, 120.0, 240.0]):
        angle = math.radians(angle_deg)
        px, py = math.cos(angle) * 0.035, math.sin(angle) * 0.035
        shard = C.cone(f"tsukai_shard{i}", (px, py, 0.290), 0.014, 0.002, 0.05)
        C.assign_material(shard, shard_mat)
        extras.append(shard)

    mesh = C.join([body] + extras, "honezukanotsukai")
    armature = C.build_armature("honezukanotsukai", TSUKAI_JOINTS, TSUKAI_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def honezukanotsukai_animations():
    lower, upper = "root-stem", "stem-capbase"
    top = "capbase-captop"
    return [
        # ぬしの言いつけを待つように、わずかに揺れながら浮く
        ("idle", [
            (1, {lower: (0, 0, 0), upper: (0, 0, 0)}),
            (24, {lower: (2, 0, 1.5), upper: (-2, 0, 0), top: (1.5, 0, 0)}),
            (48, {lower: (0, 0, 0), upper: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {lower: (0, 0, -7), upper: (0, 0, 5)}),
            (9, {lower: (4, 0, 0), upper: (-3, 0, 0)}),
            (18, {lower: (0, 0, 7), upper: (0, 0, -5)}),
            (27, {lower: (4, 0, 0), upper: (-3, 0, 0)}),
            (36, {lower: (0, 0, -7), upper: (0, 0, 5)}),
        ]),
        # 間合いが近い分、素早く身を乗り出して発射口を突きつける
        ("attack", [
            (1, {upper: (0, 0, 0), top: (0, 0, 0)}),
            (4, {upper: (-10, 0, 0), top: (-8, 0, 0)}),
            (8, {upper: (26, 0, 0), top: (22, 0, 0)}),
            (16, {upper: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {lower: (0, 0, 0)}),
            (4, {lower: (-14, 0, 0), upper: (-12, 0, 0)}),
            (14, {lower: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 積まれていた骨がほどけるように、崩れ落ちて元の骨積みに還る
        ("die", [
            (1, {lower: (0, 0, 0)}),
            (10, {lower: (-26, 0, 8), upper: (-30, 0, 0)}),
            (24, {lower: (-70, 0, 18), upper: (-58, 0, 0), top: (-20, 0, 0)}),
        ]),
    ]


# =================================================================== はじめの夢

# 第八地方(真の目覚め)・隠し最終局面のボス。ヨリシロがこの世で
# いちばん最初に見た夢そのものが、ひとり分の姿を取ったもの。計画書の
# 指示どおりmadoromiと同じ関節構成(root-stem-capbase-captop)をそのまま
# 流用し、melee AIの主力にふさわしく、がっしりした体格で正面から迫る
# 力強いシルエットに育てる(幹・傘の半径をmadoromiより太く保ち、先細り
# を抑える)。「他のすべての夢のかけらは、この最初の夢から枝分かれして
# 生まれた」という由来を、傘の色を第一〜第七地方の代表色を淡くしたもの
# で7分割する放射状のパッチワーク(角度で塗り分け。yorishironozankyoの
# 高さ帯とは違う手法にする)と、傘の各色分割ぶんに1本ずつ生える小さな
# 芽のような突起(枝分かれの予感)で視覚化する。幹はどの地方の色にも
# 染まっていない生成り色のまま残し、「まだ何も分かれていない起点」を
# 表す。
HAJIME_NO_YUME_JOINTS = {
    "root": (0.0, 0.0, 0.10),
    "stem": (0.0, 0.0, 0.42),
    "capbase": (0.0, 0.0, 0.64),
    "captop": (0.0, 0.0, 0.88),
}
HAJIME_NO_YUME_RADII = {"root": 0.190, "stem": 0.170, "capbase": 0.440, "captop": 0.090}
HAJIME_NO_YUME_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def hajimeNoYume_cap_surface_z(dist: float) -> float:
    """
    傘(capbase→captop)の表面の高さ。madoromiのcap_surface_z()と同じ考え方で、
    capbase(半径0.440)からcaptop(半径0.090)へ向かう円錐を、サブディビジョンで
    丸まるぶん少し内側に見積もって近似する。
    """
    base_z = HAJIME_NO_YUME_JOINTS["capbase"][2]
    top_z = HAJIME_NO_YUME_JOINTS["captop"][2]
    base_r = HAJIME_NO_YUME_RADII["capbase"] * 0.86
    top_r = HAJIME_NO_YUME_RADII["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.014


def build_hajimeNoYume():
    """
    はじめの夢。madoromiと同じ関節構成(root-stem-capbase-captop)を
    流用しつつ、melee AIにふさわしいがっしりした体格に育てる(幹の
    半径を根元に近い太さのまま保ち、先細りを抑えて正面から迫る力強い
    シルエットにする)。配色は第一〜第七地方の代表色を淡くしたものを
    傘に放射状のパッチワークとして配置し(角度で塗り分け、
    「統一感のない配色」を表す)、幹はどの地方色にも染まっていない
    生成り色のまま残す。傘の色分割ぶんに1本ずつ、枝分かれの予感を示す
    小さな芽を生やす。
    """
    body = C.build_skinned("hajimeNoYume", HAJIME_NO_YUME_JOINTS, HAJIME_NO_YUME_BONES,
                           HAJIME_NO_YUME_RADII, root="root", subsurf=2)

    origin_mat = C.make_material("hajime_origin", (0.92, 0.90, 0.83), roughness=0.7)
    region_colors = [
        (0.66, 0.80, 0.90),  # 第一地方 うたたねの参道(淡い空色)
        (0.68, 0.78, 0.60),  # 第二地方 忘れ潮の湿地(淡い緑)
        (0.80, 0.62, 0.70),  # 第三地方 まどろみの茸林(淡い紅紫)
        (0.78, 0.76, 0.70),  # 第四地方 骨積みの回廊(淡い白骨色)
        (0.62, 0.66, 0.74),  # 第五地方 なみだの滝つぼ(淡い青灰)
        (0.74, 0.68, 0.58),  # 第六地方 こだまの尾根(淡い土色)
        (0.80, 0.60, 0.52),  # 第七地方 わすれられた祭りの跡(淡い紅)
    ]
    region_mats = [C.make_material(f"hajime_region{i}", c, roughness=0.6)
                   for i, c in enumerate(region_colors)]

    STEM_TOP_Z = 0.50

    def classify(c):
        if c.z < STEM_TOP_Z:
            return 0
        ang = (math.atan2(c.y, c.x) + math.pi) % (2 * math.pi)
        idx = min(6, int(ang / (2 * math.pi) * 7))
        return 1 + idx

    C.assign_materials_by_region(body, [origin_mat] + region_mats, classify)
    counts = [0] * 8
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"hajimeNoYume: 生成り{counts[0]} 地方色{counts[1:]} / 計{total}")

    extras = []
    # 顔。madoromiの半開きの眠たげな目とは違い、すべての夢の起点となる
    # 存在として、しっかり見開いた目にする
    for side in (-1.0, 1.0):
        extras += eyeball(f"hajime_eye{side}", (0.105 * side, -0.168, 0.320), 0.052,
                          look=(0.2 * side, -1.0, 0.05))
    mouth = C.box("hajime_mouth", (0.0, -0.178, 0.250), (0.052, 0.014, 0.014), bevel=0.005)
    C.assign_material(mouth, C.make_material("hajime_mouth_m", (0.30, 0.22, 0.22), roughness=0.5))
    extras.append(mouth)

    # 傘の色分割ぶんに1本ずつ生やす、枝分かれの予感を示す小さな芽。
    # cone()はZ軸沿いにしか作れないため、位置をドームの曲面に沿わせて
    # 真上に伸ばすだけにする(yamabikooniの角と同じ手法)
    bud_mat = C.make_material("hajime_bud", (0.88, 0.84, 0.72), roughness=0.55)
    for i, (angle_deg, dist, length) in enumerate([
        (206.0, 0.16, 0.075), (257.0, 0.24, 0.060), (309.0, 0.10, 0.085),
        (0.0, 0.20, 0.065), (51.0, 0.28, 0.055), (103.0, 0.14, 0.080),
        (154.0, 0.22, 0.070),
    ]):
        angle = math.radians(angle_deg)
        x, y = math.cos(angle) * dist, math.sin(angle) * dist
        z = hajimeNoYume_cap_surface_z(dist)
        bud = C.cone(f"hajime_bud{i}", (x, y, z), 0.020, 0.006, length, segments=8)
        C.assign_material(bud, bud_mat)
        extras.append(bud)

    # 根元に絡む、がっしりした根の塊。melee AIらしい正面から迫る
    # どっしりした構えを土台から支える(左右対称にはせず、あえて
    # 不揃いな間隔で配置して「統一感のない」印象を根元にも残す)
    root_mat = C.make_material("hajime_root", (0.60, 0.56, 0.46), roughness=0.85)
    for angle_deg, dist, r in [
        (20.0, 0.175, 0.075), (95.0, 0.180, 0.068), (160.0, 0.170, 0.072),
        (215.0, 0.178, 0.066), (290.0, 0.172, 0.070),
    ]:
        angle = math.radians(angle_deg)
        knob = C.uv_sphere(f"hajime_rootknob{int(angle_deg)}",
                           (math.cos(angle) * dist, math.sin(angle) * dist, 0.035),
                           r, segments=12, rings=8, scale=(1.0, 1.0, 0.55))
        C.assign_material(knob, root_mat)
        extras.append(knob)

    mesh = C.join([body] + extras, "hajimeNoYume")
    armature = C.build_armature("hajimeNoYume", HAJIME_NO_YUME_JOINTS, HAJIME_NO_YUME_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def hajimeNoYume_animations():
    lower, mid, upper = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # あらゆる夢の起点として、静かに、しかし途方もない存在感で佇む
        ("idle", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (30, {lower: (2, 0, 1), mid: (-3, 0, 1), upper: (2, 0, 0)}),
            (60, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {lower: (0, 0, -10), mid: (0, 0, 8), upper: (0, 0, -4)}),
            (9, {lower: (7, 0, 0), mid: (-6, 0, 0)}),
            (18, {lower: (0, 0, 10), mid: (0, 0, -8), upper: (0, 0, 4)}),
            (27, {lower: (7, 0, 0), mid: (-6, 0, 0)}),
            (36, {lower: (0, 0, -10), mid: (0, 0, 8), upper: (0, 0, -4)}),
        ]),
        # がっしりした幹全体をひねり込み、正面から重くのしかかる一撃
        ("attack", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0), upper: (0, 0, 0)}),
            (6, {lower: (-18, 0, 0), mid: (-20, 0, 0), upper: (-14, 0, 0)}),
            (11, {lower: (26, 0, 0), mid: (30, 0, 0), upper: (22, 0, 0)}),
            (22, {lower: (0, 0, 0), mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {lower: (0, 0, 0)}),
            (4, {lower: (-22, 0, 0), mid: (-20, 0, 0)}),
            (16, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # 最初の夢が解けるように、巨体がゆっくり大きく崩れ落ちる
        ("die", [
            (1, {lower: (0, 0, 0)}),
            (12, {lower: (-38, 0, 12), mid: (-24, 0, 0), upper: (-16, 0, 0)}),
            (30, {lower: (-92, 0, 26), mid: (-40, 0, 0), upper: (-28, 0, 0)}),
        ]),
    ]


# =================================================================== ホネヅカのぬし

# 第四地方(骨積みの回廊)のボス。honegarami・honedatamiと同じ人型骨組みの
# "種類"(hip/chest/neck/head/crown, shoulder-elbow-hand, thigh-knee-foot)を
# 踏襲しつつ、ボスらしくがっしりと大きく育てる。honedatamiが1体の骸骨に
# 骨板を「まとった」姿だったのに対し、こちらは「無数の古い記憶が寄り集まって
# ひとつの巨体を成した」という由来どおり、まだ形を保った小さな頭蓋骨を
# 肩・胸・背に複数めり込ませ、複数の骸骨が溶け合った塊として造形する。
# 灯る目を持つのは主頭蓋だけで、埋もれた頭蓋は空洞のまま
# ――無数の記憶のうち、いまなお憶えているのはひとつだけ、という含み。
# 剣などの得物は持たせず(honedatami同様、素手のまま)、配色は第四地方の
# テーマである白骨色・くすんだ灰色でまとめる。
HONEZUKANONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.335),
    "chest": (0.0, 0.0, 0.560),
    "neck": (0.0, 0.0, 0.690),
    "head": (0.0, -0.012, 0.795),
    "crown": (0.0, 0.0, 0.900),
    "shoulder.L": (0.228, 0.0, 0.605),
    "elbow.L": (0.308, 0.032, 0.450),
    "hand.L": (0.302, -0.010, 0.290),
    "thigh.L": (0.130, 0.0, 0.320),
    "knee.L": (0.138, 0.0, 0.160),
    "foot.L": (0.145, -0.048, 0.020),
}
# honegarami/honedatamiよりひとまわり太い。ぬしらしい防御特化のがっしりした
# シルエットを作るため、胴・肩・腿を特に厚くする
HONEZUKANONUSHI_RADII_HALF = {
    "hip": 0.165, "chest": 0.182, "neck": 0.070, "head": 0.125, "crown": 0.048,
    "shoulder.L": 0.090, "elbow.L": 0.070, "hand.L": 0.080,
    "thigh.L": 0.098, "knee.L": 0.076, "foot.L": 0.084,
}
HONEZUKANONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_honezukaNoNushi():
    """
    この回廊に積もりに積もった、無数の古い記憶が寄り集まってひとつの
    巨体を成したもの。honegarami・honedatamiと同じ人型骨組みをボスらしく
    がっしりと大きく育てる。まだ形を保った小さな頭蓋骨を肩・胸・背に
    複数めり込ませ、複数の骸骨が溶け合った塊として見せる。灯る目を持つのは
    主頭蓋だけで、埋もれた頭蓋は空洞のまま。配色は第四地方(骨積みの回廊)の
    白骨色とくすんだ灰色。
    """
    joints = C.mirrored(HONEZUKANONUSHI_HALF)
    radii = C.mirrored_radii(HONEZUKANONUSHI_RADII_HALF)
    bones = C.mirrored_bones(HONEZUKANONUSHI_BONES_HALF)

    body = C.build_skinned("honezukaNoNushi", joints, bones, radii, root="hip", subsurf=2)
    bone_mat = C.make_material("kotsuduka_bone", (0.85, 0.83, 0.73), roughness=0.75)
    dust_mat = C.make_material("kotsuduka_dust", (0.52, 0.51, 0.48), roughness=0.9)
    # honedatami踏襲。回廊の床に長く積もった意味で、脚まわりの低い位置だけ
    # くすんだ灰色にする(距離ではなく高さで判定)
    C.assign_materials_by_region(body, [bone_mat, dust_mat], lambda c: 1 if c.z < 0.140 else 0)

    extras = []
    dark_mat = C.make_material("kotsuduka_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("kotsuduka_glow", (1.0, 0.5, 0.18), roughness=0.3, emission=2.6)
    dead_mat = C.make_material("kotsuduka_dead", (0.16, 0.15, 0.16), roughness=0.85)
    rib_mat = C.make_material("kotsuduka_rib", (0.82, 0.80, 0.70), roughness=0.75)

    # 主頭蓋。honegarami譲りの顎・眼窩・頬骨・歯を、頭の半径比に合わせて
    # そのまま拡大する(headの半径がhonegaramiの約1.2倍なので、各部品の
    # 頭関節からの相対位置・大きさも1.2倍にして、同じ突き出し方を保つ)
    jaw = C.uv_sphere("kotsuduka_jaw", (0.0, -0.058, 0.713), 0.098,
                      segments=18, rings=12, scale=(0.92, 1.12, 0.58))
    C.assign_material(jaw, bone_mat)
    extras.append(jaw)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"kotsuduka_socket{side}", (0.055 * side, -0.103, 0.819), 0.041,
                             segments=12, rings=8, scale=(1.0, 0.85, 1.15))
        C.assign_material(socket, dark_mat)
        extras.append(socket)
        # 主頭蓋だけが灯す、なお憶えている記憶そのものの目
        glow = C.uv_sphere(f"kotsuduka_glow{side}", (0.055 * side, -0.113, 0.819), 0.019,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)
        cheek = C.uv_sphere(f"kotsuduka_cheek{side}", (0.094 * side, -0.062, 0.773), 0.038,
                            segments=10, rings=8, scale=(0.8, 1.0, 0.7))
        C.assign_material(cheek, bone_mat)
        extras.append(cheek)
    teeth_mat = C.make_material("kotsuduka_teeth", (0.90, 0.88, 0.79), roughness=0.5)
    for i in range(6):
        tooth = C.box(f"kotsuduka_tooth{i}", ((i - 2.5) * 0.031, -0.118, 0.699),
                      (0.021, 0.028, 0.033), bevel=0.005)
        C.assign_material(tooth, teeth_mat)
        extras.append(tooth)

    # 肋骨。chestの太い胴に対しても、はっきり浮いて見えるよう
    # chest半径(0.182)より一回り太くとる
    for i, z in enumerate((0.430, 0.475, 0.520, 0.565, 0.605)):
        radius = 0.248 - abs(i - 2) * 0.026
        rib = C.cylinder(f"kotsuduka_rib{i}", (0.0, -0.010, z), radius, 0.034, segments=18)
        for vert in rib.data.vertices:
            vert.co.y *= 0.70
        C.assign_material(rib, rib_mat)
        extras.append(rib)

    spine = C.cylinder("kotsuduka_spine", (0.0, 0.050, 0.500), 0.046, 0.34, segments=12)
    C.assign_material(spine, rib_mat)
    extras.append(spine)

    pelvis = C.uv_sphere("kotsuduka_pelvis", (0.0, 0.0, 0.360), 0.205,
                         segments=18, rings=12, scale=(1.0, 0.62, 0.52))
    C.assign_material(pelvis, bone_mat)
    extras.append(pelvis)

    # 埋もれた頭蓋骨。まだ形を保ったまま体表から半分ほど突き出す、寄せ集めの
    # 印。灯る目は主頭蓋だけなので、こちらは空洞の眼窩のまま(facingは
    # 「顔」が向く-Y/+Yの符号)
    buried_specs = [
        # (中心, 半径, facing, 色バリエーション)
        ((0.300, -0.045, 0.615), 0.072, -1.0, 0),  # 左肩から突き出す
        ((-0.300, -0.045, 0.615), 0.072, -1.0, 0),  # 右肩から突き出す
        ((0.0, -0.235, 0.620), 0.086, -1.0, 1),     # 胸の正面に埋もれる
        ((0.0, 0.225, 0.470), 0.066, 1.0, 0),       # 背中に埋もれる
    ]
    for i, (center, radius, facing, variant) in enumerate(buried_specs):
        skull = C.uv_sphere(f"kotsuduka_buried{i}", center, radius,
                            segments=12, rings=8, scale=(1.0, 0.9, 0.85))
        C.assign_material(skull, bone_mat if variant == 0 else dust_mat)
        extras.append(skull)
        cx, cy, cz = center
        eye_y = cy + facing * radius * 0.75
        eye_z = cz + radius * 0.05
        eye_off = radius * 0.42
        eye_r = radius * 0.26
        for side in (-1.0, 1.0):
            eye = C.uv_sphere(f"kotsuduka_buriedeye{i}_{side}",
                              (cx + eye_off * side, eye_y, eye_z),
                              eye_r, segments=8, rings=6, scale=(1.0, 0.6, 1.0))
            C.assign_material(eye, dead_mat)
            extras.append(eye)

    # 折れた骨の破片。肩・背・腰から突き出し、寄せ集めの塊であることを示す
    shard_mat = C.make_material("kotsuduka_shard", (0.80, 0.78, 0.68), roughness=0.8)
    shard_specs = [
        (0.185, -0.020, 0.700, 0.030, 0.008, 0.145),
        (-0.170, 0.080, 0.640, 0.026, 0.006, 0.115),
        (0.070, 0.175, 0.560, 0.024, 0.005, 0.100),
        (-0.090, 0.165, 0.390, 0.026, 0.006, 0.110),
    ]
    for i, (sx, sy, sz, rb, rt, depth) in enumerate(shard_specs):
        shard = C.cone(f"kotsuduka_shard{i}", (sx, sy, sz), rb, rt, depth, segments=10)
        C.assign_material(shard, shard_mat)
        extras.append(shard)

    mesh = C.join([body] + extras, "honezukaNoNushi")
    armature = C.build_armature("honezukaNoNushi", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def honezukaNoNushi_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 回廊の最奥にどっしり居座ったまま、ごく僅かに軋むだけ
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (32, {hipc: (1, 0, 1), neck: (2, 0, 0)}),
            (64, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 積み重なった巨体を引きずるような、重く遅い歩み
        ("walk", [
            (1, {legL: (12, 0, 0), legR: (-12, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                 armL: (-8, 0, 6), armR: (8, 0, -6)}),
            (12, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (23, {legL: (-12, 0, 0), legR: (12, 0, 0), shinL: (5, 0, 0), shinR: (-6, 0, 0),
                  armL: (8, 0, 6), armR: (-8, 0, -6)}),
            (34, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
        ]),
        # 得物を持たない代わりに、両腕をまとめて叩きつける正面への体当たり
        ("attack", [
            (1, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (7, {armL: (-32, 0, 22), armR: (-32, 0, -22), foreL: (-22, 0, 0), foreR: (-22, 0, 0),
                 hipc: (-10, 0, 0), neck: (-6, 0, 0)}),
            (13, {armL: (52, 0, 4), armR: (52, 0, -4), foreL: (16, 0, 0), foreR: (16, 0, 0),
                  hipc: (14, 0, 0), neck: (4, 0, 0)}),
            (24, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        # 高い防御力どおり、当たってもほとんど揺るがない
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-6, 0, 0), neck: (-8, 0, 0)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 寄せ集まっていた記憶の塊が、支えを失って崩れ落ちる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (10, {hipc: (-12, 0, 8), neck: (-20, 0, 0), armL: (-32, 0, 32), armR: (-32, 0, -32)}),
            (28, {hipc: (-76, 0, 24), neck: (-48, 0, 0), legL: (36, 0, 0), legR: (32, 0, 0),
                  armL: (-74, 0, 62), armR: (-74, 0, -62)}),
        ]),
    ]


# ==================================================================== 掘り杭の主

HORIKUINONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.576),
    "chest": (0.0, 0.0, 0.896),
    "neck": (0.0, 0.0, 1.056),
    "head": (0.0, -0.016, 1.248),
    "crown": (0.0, 0.0, 1.408),
    "shoulder.L": (0.216, 0.0, 0.952),
    "elbow.L": (0.328, 0.016, 0.752),
    "hand.L": (0.328, -0.048, 0.544),
    "thigh.L": (0.115, 0.0, 0.512),
    "knee.L": (0.125, 0.0, 0.272),
    "foot.L": (0.131, -0.048, 0.048),
}
# 単純な等倍拡大ではなく、がっしりと重く見えるよう胴・腿を特に太くする
HORIKUINONUSHI_RADII_HALF = {
    "hip": 0.124, "chest": 0.120, "neck": 0.048, "head": 0.162, "crown": 0.093,
    "shoulder.L": 0.054, "elbow.L": 0.040, "hand.L": 0.054,
    "thigh.L": 0.064, "knee.L": 0.047, "foot.L": 0.061,
}
HORIKUINONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_horikuiNoNushi():
    """
    近道屋が山へ打ち込んだ杭そのものに、ヨリシロの反発と痛みが絡みついて
    できあがった、いびつな姿。honegaramiと同じ人型骨組みをベースに、
    がっしりと重い体格に育てる。他の地方ボスと違い夢が自然に生んだ
    存在ではないため、体を貫いて突き出た太い杭そのものを軸に据え、
    体の配色は第一〜第七地方の色が不揃いに混ざり合った、統一感のない
    継ぎ接ぎにする。目は打ち込まれた痛みそのものとして、怒りを帯びた
    赤い光にする。
    """
    joints = C.mirrored(HORIKUINONUSHI_HALF)
    radii = C.mirrored_radii(HORIKUINONUSHI_RADII_HALF)
    bones = C.mirrored_bones(HORIKUINONUSHI_BONES_HALF)

    body = C.build_skinned("horikuiNoNushi", joints, bones, radii, root="hip", subsurf=2)

    # 第一〜第七地方の色が不揃いに混ざり合った、いびつな継ぎ接ぎ
    region_mats = [
        C.make_material("horikui_r1", (0.62, 0.54, 0.42), roughness=0.75),
        C.make_material("horikui_r2", (0.36, 0.46, 0.48), roughness=0.65),
        C.make_material("horikui_r3", (0.40, 0.28, 0.22), roughness=0.7),
        C.make_material("horikui_r4", (0.60, 0.58, 0.52), roughness=0.7),
        C.make_material("horikui_r5", (0.20, 0.24, 0.38), roughness=0.6),
        C.make_material("horikui_r6", (0.48, 0.40, 0.30), roughness=0.75),
        C.make_material("horikui_r7", (0.44, 0.18, 0.16), roughness=0.6),
    ]
    bounds = [0.0, 40.0, 90.0, 140.0, 175.0, 220.0, 280.0, 360.0]

    def classify(c):
        deg = math.degrees(math.atan2(c.y, c.x)) % 360.0
        for i in range(7):
            if bounds[i] <= deg < bounds[i + 1]:
                return i
        return 6

    C.assign_materials_by_region(body, region_mats, classify)

    extras = []
    dark = C.make_material("horikui_dark", (0.05, 0.05, 0.06), roughness=0.85)
    glow = C.make_material("horikui_eye", (0.85, 0.22, 0.14), roughness=0.3, emission=2.2)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"horikui_socket{side}", (0.070 * side, -0.130, 1.180), 0.048,
                             segments=14, rings=10, scale=(1.0, 0.8, 1.05))
        C.assign_material(socket, dark)
        extras.append(socket)
        e = C.uv_sphere(f"horikui_eye{side}", (0.070 * side, -0.148, 1.180), 0.024,
                        segments=10, rings=8)
        C.assign_material(e, glow)
        extras.append(e)

    # 体を貫いて突き出た、近道屋が打ち込んだ杭そのもの。古びた木の色にし、
    # 頭上と足元に突き出させて、体がその杭に取り憑いた姿であることを示す
    wood = C.make_material("horikui_wood", (0.30, 0.20, 0.12), roughness=0.85)
    stake = C.cylinder("horikui_stake", (0.02, 0.03, 0.90), 0.075, 1.55, segments=8, bevel=0.01)
    C.assign_material(stake, wood)
    extras.append(stake)
    tip = C.cone("horikui_stake_tip", (0.02, 0.03, 1.66), 0.075, 0.004, 0.16, segments=8)
    C.assign_material(tip, wood)
    extras.append(tip)
    # 打ち込まれた衝撃で裂けた、木の破片
    shard_mat = C.make_material("horikui_shard", (0.36, 0.25, 0.16), roughness=0.8)
    for i, (angle_deg, dist, z, length) in enumerate([
        (30.0, 0.10, 0.92, 0.16), (140.0, 0.09, 0.98, 0.14),
        (250.0, 0.11, 0.86, 0.18), (320.0, 0.08, 1.04, 0.12),
    ]):
        angle = math.radians(angle_deg)
        x, y = 0.02 + math.cos(angle) * dist, 0.03 + math.sin(angle) * dist
        shard = C.cone(f"horikui_shard{i}", (x, y, z), 0.022, 0.003, length, segments=8)
        C.assign_material(shard, shard_mat)
        extras.append(shard)

    # 大技(足もとの地面がひび割れる)を暗示する、足元に突き出た小さな杭先
    for i, (sx, sy) in enumerate([(-0.24, -0.10), (0.22, -0.14), (0.0, -0.30)]):
        spike = C.cone(f"horikui_groundspike{i}", (sx, sy, 0.0), 0.026, 0.003, 0.11, segments=8)
        C.assign_material(spike, wood)
        extras.append(spike)

    mesh = C.join([body] + extras, "horikuiNoNushi")
    armature = C.build_armature("horikuiNoNushi", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def horikuiNoNushi_animations():
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 杭に取り憑かれたまま、絶えず小さく軋む
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (28, {hipc: (2, 0, 1), neck: (-2, 0, 0)}),
            (56, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {legL: (14, 0, 0), legR: (-14, 0, 0), armL: (-10, 0, 6), armR: (10, 0, -6)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (21, {legL: (-14, 0, 0), legR: (14, 0, 0), armL: (10, 0, 6), armR: (-10, 0, -6)}),
            (32, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
        ]),
        # 打ち込まれた痛みを振り払うように、正面へ全身で叩きつける
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (6, {armL: (-30, 0, 18), armR: (-30, 0, -18), foreL: (-20, 0, 0), foreR: (-20, 0, 0),
                 hipc: (-12, 0, 0), neck: (-8, 0, 0)}),
            (12, {armL: (46, 0, 4), armR: (46, 0, -4), foreL: (14, 0, 0), foreR: (14, 0, 0),
                  hipc: (16, 0, 0), neck: (6, 0, 0)}),
            (22, {armL: (0, 0, 6), armR: (0, 0, -6), foreL: (0, 0, 0), foreR: (0, 0, 0),
                  hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-8, 0, 0), neck: (-10, 0, 0)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 杭に絡みついていた反発と痛みが、支えを失って崩れ落ちる
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (12, {hipc: (-14, 0, 8), neck: (-22, 0, 0), armL: (-30, 0, 30), armR: (-30, 0, -30)}),
            (30, {hipc: (-80, 0, 24), neck: (-50, 0, 0), legL: (34, 0, 0), legR: (30, 0, 0),
                  armL: (-70, 0, 58), armR: (-70, 0, -58)}),
        ]),
    ]


# =================================================================== ホロホロチョウ

# 計画書どおり、現在流用しているpurunの関節構成(縦2本、base-mid-top)を
# そのまま踏襲する。akubitokage・kodamausagiと同じ「purun骨格の再利用」の
# 3例目で、脚を生やさず底面を床で潰す処理も含めて完全に流用できるため、
# アニメーションもpurun_animationsをそのまま呼べる(ボーン名が同一)。
# swarmで3〜4体まとめて配置される前提のため、翼と目以外の装飾は足さず、
# ashiatodori/mabutamushiよりさらに簡略なシルエットにとどめる。
HOROHOLOCHO_JOINTS = {
    "base": (0.0, 0.010, 0.048),
    "mid": (0.0, -0.006, 0.128),
    "top": (0.0, -0.026, 0.196),
}
HOROHOLOCHO_RADII = {"base": 0.128, "mid": 0.104, "top": 0.040}
HOROHOLOCHO_BONES = [("base", "mid"), ("mid", "top")]


def build_horoholocho():
    """
    ちぎれた微睡みの欠片。1羽ずつは非力だが、群れで現れるswarm。
    purunと同じ縦2本の骨組みを流用し、底を床で潰した丸い雫形にするが、
    上へ行くほど後ろへ反らせて、まどろみながら漂う軽い塊に見せる
    (akubitokageと同じ「反らせ方」の応用だが、あちらより起伏を穏やかにし、
    ふっくらした羽毛の房らしい丸みを残す)。
    """
    body = C.build_skinned("horoholocho", HOROHOLOCHO_JOINTS, HOROHOLOCHO_BONES,
                           HOROHOLOCHO_RADII, root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す(purun/kodamausagiと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.018:
            vert.co.z = 0.018 - (0.018 - vert.co.z) * 0.25

    # 配色は第3地方(まどろみの茸林)のテーマどおり、湿った土色を基調に、
    # 頭頂だけ胞子の淡い黄土色をかぶったように塗り分ける(kinokootokoの
    # 傘・houshitobiの胞子色と同じ淡い黄土色を、こちらでは頭の粉ふきに使う)
    earth = C.make_material("horoholocho_earth", (0.30, 0.21, 0.14), roughness=0.78)
    spore = C.make_material("horoholocho_spore", (0.84, 0.75, 0.48), roughness=0.5)
    C.assign_materials_by_region(body, [earth, spore], lambda c: 1 if c.z > 0.165 else 0)

    extras = []
    # 眠たげな半目。squashで縦につぶし、まぶたが落ちかけた表情にする
    for side in (-1.0, 1.0):
        extras += eyeball(f"horoholocho_eye{side}", (0.040 * side, -0.088, 0.155), 0.020,
                          look=(0.2 * side, -1.0, -0.1),
                          white=(0.92, 0.88, 0.76), dark=(0.30, 0.20, 0.12), squash=0.45)

    # 畳んで垂らした翼。胴の両脇に低く貼りつく羽毛の房を1つずつ乗せるだけ
    # (ashiatodoriの翼と同じprimitive貼り付けだが、上に立てず横に寝かせて
    # 眠たげに垂れ下がった羽に見せる)
    wing_mat = C.make_material("horoholocho_wing", (0.42, 0.32, 0.22), roughness=0.6)
    for side in (-1.0, 1.0):
        wing = C.uv_sphere(f"horoholocho_wing{side}", (0.128 * side, 0.026, 0.088), 0.060,
                           segments=14, rings=10, scale=(0.30, 1.25, 0.55))
        C.assign_material(wing, wing_mat)
        extras.append(wing)

    mesh = C.join([body] + extras, "horoholocho")
    armature = C.build_armature("horoholocho", C.mirrored(HOROHOLOCHO_JOINTS),
                                HOROHOLOCHO_BONES, mesh, root="base")
    return [mesh, armature], armature


def horoholocho_animations():
    """骨の名前がpurunと同じ(base-mid, mid-top)ため、既存5クリップをそのまま流用する。"""
    return purun_animations()


# =================================================================== いしずえねずみ

# 第一地方(うたたねの参道)、配合限定の成熟種。ガジリねずみ(小さな不安)に
# ホネガラミ(古い記憶)を繰り返し夢あわせすると育つ姿で、AI が coward から
# guard へ変わる――すぐ逃げていた性格が、その場を固める性格へ変わる。
# gajiri と同じ関節構成(四つ足のねずみ)を土台にしつつ、体高を落として
# 重心を低く、胴・脚を太くしてどっしり見せ、背に厚い甲羅状のプレートを
# 重ねて装甲質の表皮を表現する。尻尾も gajiri の長く跳ねる形から、短く
# 太いどっしりした形に変える(逃げるための尻尾ではなく、踏ん張るための
# 尻尾)。配色は第一地方の参道の土色に馴染む、素朴で淡いトーンにする。
ISHIZUENEZUMI_HALF = {
    "hip": (0.0, 0.20, 0.175),
    "chest": (0.0, -0.02, 0.195),
    "neck": (0.0, -0.19, 0.185),
    "snout": (0.0, -0.375, 0.135),
    "tail1": (0.0, 0.33, 0.150),
    "tail2": (0.0, 0.43, 0.155),
    "tail3": (0.0, 0.505, 0.170),
    "ear.L": (0.100, -0.190, 0.310),
    "hipF.L": (0.125, -0.065, 0.115),
    "footF.L": (0.140, -0.105, 0.022),
    "hipB.L": (0.150, 0.170, 0.125),
    "footB.L": (0.165, 0.200, 0.022),
}
# gajiri より一回り太い。特に胴・脚を厚くして低い重心のどっしりした
# シルエットを作り、耳は逃げ足の速さを示す大きさが要らなくなった分だけ
# 小さく控えめにする
ISHIZUENEZUMI_RADII_HALF = {
    "hip": 0.155, "chest": 0.175, "neck": 0.115, "snout": 0.048,
    "tail1": 0.046, "tail2": 0.036, "tail3": 0.024,
    "ear.L": 0.048,
    "hipF.L": 0.062, "footF.L": 0.052,
    "hipB.L": 0.078, "footB.L": 0.058,
}
ISHIZUENEZUMI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_ishizuenezumi():
    """
    gajiri と同じ関節構成の四つ足のねずみだが、低い重心・厚い胴・太い脚で
    どっしりした体格にし、背に甲羅状のプレートを重ねて装甲質の表皮にする。
    配色は参道の土色に馴染む、素朴で淡いトーン。
    """
    joints = C.mirrored(ISHIZUENEZUMI_HALF)
    radii = C.mirrored_radii(ISHIZUENEZUMI_RADII_HALF)
    bones = C.mirrored_bones(ISHIZUENEZUMI_BONES_HALF)

    body = C.build_skinned("ishizuenezumi", joints, bones, radii, root="chest", subsurf=2)
    fur = C.make_material("ishizue_fur", (0.70, 0.60, 0.48), roughness=0.85)
    ear_in = C.make_material("ishizue_ear", (0.76, 0.56, 0.50), roughness=0.8)

    # 耳だけを内側の色にする(gajiri踏襲、耳の関節からの距離で判定)
    ears = [Vector(joints["ear.L"]), Vector(joints["ear.R"])]
    C.assign_materials_by_region(
        body, [fur, ear_in],
        lambda c: 1 if min((c - e).length for e in ears) < 0.058 else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"ishizue_eye{side}", (0.076 * side, -0.255, 0.210), 0.044,
                          look=(0.2 * side, -1.0, 0.05))
    nose = C.uv_sphere("ishizue_nose", (0.0, -0.408, 0.128), 0.030, segments=12, rings=8)
    C.assign_material(nose, C.make_material("ishizue_nose_m", (0.72, 0.42, 0.44), roughness=0.4))
    extras.append(nose)
    # 前歯
    teeth = C.box("ishizue_teeth", (0.0, -0.388, 0.086), (0.052, 0.026, 0.048), bevel=0.007)
    C.assign_material(teeth, C.make_material("ishizue_teeth_m", (0.93, 0.91, 0.83), roughness=0.35))
    extras.append(teeth)

    # 背の甲羅。石畳のようにプレートを重ねて、装甲質の厚い表皮にする。
    # 尾寄りから胸寄りまでを覆い、首から先(頭・耳)はあえて覆わず
    # 露出させる(甲羅と首の柔らかさの対比、耳のシルエットとの衝突も避ける)
    shell_mat = C.make_material("ishizue_shell", (0.52, 0.49, 0.42), roughness=0.55)
    shell_specs = [
        (0.19, 0.335, 0.098, (1.05, 0.85, 0.55)),
        (0.06, 0.380, 0.115, (1.12, 0.85, 0.55)),
        (0.02, 0.400, 0.118, (1.18, 0.78, 0.55)),
    ]
    for i, (sy, sz, radius, scale) in enumerate(shell_specs):
        plate = C.uv_sphere(f"ishizue_shell{i}", (0.0, sy, sz), radius,
                            segments=14, rings=8, scale=scale)
        C.assign_material(plate, shell_mat)
        extras.append(plate)

    # 肩の小さな装甲(前脚の付け根を守る)
    for side in (-1.0, 1.0):
        pauldron = C.uv_sphere(f"ishizue_pauldron{side}", (0.145 * side, -0.06, 0.205), 0.058,
                               segments=12, rings=8, scale=(1.0, 0.95, 0.65))
        C.assign_material(pauldron, shell_mat)
        extras.append(pauldron)

    # 尾の先も小さな石畳で覆い、踏ん張りに使う尾らしい重みを見せる
    tail_cap = C.uv_sphere("ishizue_tailcap", (0.0, 0.505, 0.185), 0.030,
                           segments=10, rings=8, scale=(0.9, 1.1, 0.75))
    C.assign_material(tail_cap, shell_mat)
    extras.append(tail_cap)

    mesh = C.join([body] + extras, "ishizuenezumi")
    armature = C.build_armature("ishizuenezumi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def ishizuenezumi_animations():
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 動じない性格どおり、ほとんど揺らがずゆったり呼吸するだけ
        ("idle", [
            (1, {t1: (0, 0, 0), neck: (0, 0, 0)}),
            (24, {t1: (0, 0, 4), neck: (-2, 0, 0), snout: (2, 0, 0)}),
            (48, {t1: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 低い重心のまま、どっしりと地を踏みしめる歩み
        ("walk", [
            (1, {fL: (20, 0, 0), fR: (-20, 0, 0), bL: (-18, 0, 0), bR: (18, 0, 0), t1: (0, 0, 8)}),
            (8, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (15, {fL: (-20, 0, 0), fR: (20, 0, 0), bL: (18, 0, 0), bR: (-18, 0, 0), t1: (0, 0, -8)}),
            (22, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (29, {fL: (20, 0, 0), fR: (-20, 0, 0), bL: (-18, 0, 0), bR: (18, 0, 0), t1: (0, 0, 8)}),
        ]),
        # 噛みつきではなく、前脚を踏ん張って頭から体当たりする
        ("attack", [
            (1, {neck: (0, 0, 0), snout: (0, 0, 0), fL: (0, 0, 0), fR: (0, 0, 0)}),
            (5, {neck: (18, 0, 0), snout: (10, 0, 0), fL: (-10, 0, 0), fR: (-10, 0, 0), t2: (0, 0, 16)}),
            (10, {neck: (-28, 0, 0), snout: (-16, 0, 0), fL: (14, 0, 0), fR: (14, 0, 0), t2: (0, 0, -12)}),
            (20, {neck: (0, 0, 0), snout: (0, 0, 0), fL: (0, 0, 0), fR: (0, 0, 0), t2: (0, 0, 0)}),
        ]),
        # 高い防御どおり、当たってもほとんど動じない
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (10, 0, 0), t1: (0, 0, 8)}),
            (14, {neck: (0, 0, 0), t1: (0, 0, 0)}),
        ]),
        # 逃げ足だった頃とは違い、最後まで踏みとどまってから力尽きる
        ("die", [
            (1, {neck: (0, 0, 0)}),
            (10, {neck: (20, 0, 0), fL: (-30, 0, 0), fR: (-30, 0, 0)}),
            (28, {neck: (6, 0, 0), fL: (-60, 0, 0), fR: (-60, 0, 0),
                  bL: (-45, 0, 0), bR: (-45, 0, 0), t1: (0, 0, 25)}),
        ]),
    ]


# ========================================================================= かすみウツボ

KASUMIUTSUBO_HALF = {
    "hip": (0.0, 0.14, 0.075),
    "chest": (0.0, -0.08, 0.085),
    "head": (0.0, -0.32, 0.075),
    "armF.L": (0.10, -0.20, 0.04),
    "handF.L": (0.12, -0.28, 0.015),
    "kneeB.L": (0.13, 0.14, 0.085),
    "ankleB.L": (0.12, -0.02, 0.03),
    "footB.L": (0.11, -0.12, 0.012),
}
KASUMIUTSUBO_RADII_HALF = {
    "hip": 0.115, "chest": 0.125, "head": 0.095,
    "armF.L": 0.026, "handF.L": 0.030,
    "kneeB.L": 0.045, "ankleB.L": 0.028, "footB.L": 0.022,
}
KASUMIUTSUBO_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kasumiutsubo():
    """
    忘れるというテーマをさらに煮詰めた結果、存在感そのものが薄れた姿。
    tsubuteと同じ関節構成をベースに、頭からしっぽまでを大きく引き伸ばし、
    高さを大きく削って、周囲に溶け込む平たく低いウツボのシルエットに
    作り替える。配色はwasuremizuchiよりさらに彩度を落とし、輪郭が
    かすんで見えるほど淡くする。目立たないよう、目も薄く小さくする。
    配色は第二地方(忘れ潮の湿地)の、霧と水を思わせる灰みがかった
    水色・青緑系。
    """
    joints = C.mirrored(KASUMIUTSUBO_HALF)
    radii = C.mirrored_radii(KASUMIUTSUBO_RADII_HALF)
    bones = C.mirrored_bones(KASUMIUTSUBO_BONES_HALF)

    body = C.build_skinned("kasumiutsubo", joints, bones, radii, root="chest", subsurf=2)
    dorsal = C.make_material("kasumi_dorsal", (0.56, 0.64, 0.64), roughness=0.5, emission=0.04)
    ventral = C.make_material("kasumi_ventral", (0.34, 0.42, 0.44), roughness=0.6)
    C.assign_materials_by_region(body, [dorsal, ventral], lambda c: 1 if c.z < 0.06 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # 目立たないよう、薄く小さな目にする
        extras += eyeball(f"kasumi_eye{side}", (0.048 * side, -0.290, 0.098), 0.018,
                          look=(0.2 * side, -1.0, 0.05), squash=0.7,
                          white=(0.72, 0.78, 0.78), dark=(0.20, 0.26, 0.28))
    mouth = C.uv_sphere("kasumi_mouth", (0.0, -0.335, 0.055), 0.022,
                        segments=12, rings=8, scale=(1.3, 0.5, 0.4))
    C.assign_material(mouth, C.make_material("kasumi_mouth_m", (0.16, 0.20, 0.22), roughness=0.4))
    extras.append(mouth)

    mesh = C.join([body] + extras, "kasumiutsubo")
    armature = C.build_armature("kasumiutsubo", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kasumiutsubo_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 気配を消して、ほとんど動かず潜む
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (40, {head: (2, 0, 1)}),
            (80, {head: (0, 0, 0)}),
        ]),
        # 地を這うように、低く滑らかに進む
        ("walk", [
            (1, {legL: (0, 0, 10), legR: (0, 0, -10), armL: (0, 0, 7), armR: (0, 0, -7),
                 head: (0, 4, 0)}),
            (9, {legL: (0, 0, -10), legR: (0, 0, 10), armL: (0, 0, -7), armR: (0, 0, 7),
                 head: (0, -4, 0)}),
            (18, {legL: (0, 0, 10), legR: (0, 0, -10), armL: (0, 0, 7), armR: (0, 0, -7),
                  head: (0, 4, 0)}),
        ]),
        # 気配を消していた分、飛び出す一撃は鋭く速い
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (-16, 0, 0)}),
            (7, {head: (24, 0, 0)}),
            (14, {head: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (14, 0, 0), armL: (-10, 0, 8), armR: (-10, 0, -8)}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 薄れていた存在感が、そのまま霧へ紛れて消える
        ("die", [
            (1, {head: (0, 0, 0)}),
            (9, {head: (0, 10, 0), legL: (0, 0, -20), legR: (0, 0, 20)}),
            (20, {head: (0, 20, 0), legL: (0, 0, -44), legR: (0, 0, 44)}),
        ]),
    ]


# ======================================================================= まつりのぬし

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにする、menkaburikozo・kageboushiと同系統の奇襲役(ambush AI)。
# めんかぶりこぞう(祭りの影絵)+かざりだるま(祭りの高揚)の夢あわせで
# 生まれた「状態異常を受けつけなくなった姿」という設定のため、造形は
# この2種の折衷にする。menkaburikozoよりさらに立体感を削って地面
# すれすれに伏せるシルエットにしつつ、mask由来の紅色は残しながらも
# 大きく彩度を落とし、周囲に溶け込む「わすれられた祭りの跡」の褪せた
# 紅色にする。kazaridarumaの金の帯を、腹まわりに残るわずかな金色の
# 名残として一筋だけ引き継ぎ、胸には正気を守る御守りの結び目を1つ
# 据える。menkaburikozoの見開いた面の穴・kageboushiの三日月の目とは
# 逆に、警戒して見開く必要がない(=状態異常を恐れない)ぶん、ただ
# 静かに閉じただけの目にする。maxHp 63はmenkaburikozo(42)より一回り
# 大きく、kazaridaruma(80)より小さいため、全体を約1.11倍に拡大する。
MATSURINONUSHI_HALF = {
    "hip": (0.0, 0.128, 0.109),
    "chest": (0.0, -0.061, 0.120),
    "head": (0.0, -0.239, 0.124),
    "armF.L": (0.164, -0.164, 0.058),
    "handF.L": (0.186, -0.228, 0.016),
    "kneeB.L": (0.222, 0.120, 0.124),
    "ankleB.L": (0.202, -0.042, 0.038),
    "footB.L": (0.186, -0.164, 0.014),
}
MATSURINONUSHI_RADII_HALF = {
    "hip": 0.169, "chest": 0.178, "head": 0.109,
    "armF.L": 0.038, "handF.L": 0.042,
    "kneeB.L": 0.075, "ankleB.L": 0.049, "footB.L": 0.044,
}
MATSURINONUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_matsurinonushi():
    """
    めんかぶりこぞう+かざりだるまの夢あわせ。祭りの高揚が、正気を失わせる
    悪戯からも自分を守るようになった姿。tsubute系の関節構成をベースに、
    menkaburikozoよりさらに立体感を削って地面すれすれに伏せるシルエットに
    し、周囲に溶け込む褪せた紅色を全身にまとう。腹まわりだけかざりだるま
    の金の帯の名残を一筋残し、胸には状態異常を退ける御守りの結び目を
    1つだけ据える。目は警戒に見開く必要がないぶん、ただ静かに閉じる。
    """
    joints = C.mirrored(MATSURINONUSHI_HALF)
    radii = C.mirrored_radii(MATSURINONUSHI_RADII_HALF)
    bones = C.mirrored_bones(MATSURINONUSHI_BONES_HALF)

    body = C.build_skinned("matsurinonushi", joints, bones, radii, root="chest", subsurf=2)
    faded = C.make_material("matsurinonushi_faded", (0.32, 0.18, 0.16), roughness=0.75)
    gold = C.make_material("matsurinonushi_gold", (0.50, 0.41, 0.24), roughness=0.4, metallic=0.2)
    # 胸〜腰の間だけ、かざりだるまの金の帯の名残を細く一筋残す
    C.assign_materials_by_region(
        body, [faded, gold],
        lambda c: 1 if (-0.020 < c.y < 0.030) else 0,
    )

    extras = []
    # 胸に据えた御守りの結び目。状態異常を退ける由来にちなみ、控えめに
    # 金色へ発光させる(目立たない配色を崩さない程度に留める)
    charm_mat = C.make_material("matsurinonushi_charm", (0.60, 0.49, 0.26), roughness=0.35, emission=0.5)
    charm = C.uv_sphere("matsurinonushi_charm", (0.0, -0.095, 0.148), 0.036,
                        segments=16, rings=12, scale=(1.0, 0.42, 1.15))
    C.assign_material(charm, charm_mat)
    extras.append(charm)
    knot_mat = C.make_material("matsurinonushi_knot", (0.16, 0.10, 0.08), roughness=0.6)
    knot = C.uv_sphere("matsurinonushi_knot", (0.0, -0.108, 0.148), 0.015,
                       segments=12, rings=8)
    C.assign_material(knot, knot_mat)
    extras.append(knot)
    # 落ち着いて閉じたまぶた。menkaburikozoの見開いた穴・kageboushiの
    # 三日月と違い、警戒して見開く必要がないぶん、ただ静かに閉じた細い線
    lid_mat = C.make_material("matsurinonushi_lid", (0.14, 0.09, 0.08), roughness=0.6)
    for side in (-1.0, 1.0):
        lid = C.uv_sphere(f"matsurinonushi_lid{side}", (0.052 * side, -0.258, 0.140), 0.022,
                          segments=14, rings=8, scale=(1.0, 0.30, 0.22))
        C.assign_material(lid, lid_mat)
        extras.append(lid)

    mesh = C.join([body] + extras, "matsurinonushi")
    armature = C.build_armature("matsurinonushi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def matsurinonushi_animations():
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 悪戯を恐れず、微動だにせず周囲に溶け込んで潜む
        ("idle", [
            (1, {head: (0, 0, 0)}),
            (48, {head: (2, 3, 0)}),
            (96, {head: (0, 0, 0)}),
        ]),
        # 低い姿勢のまま、音も無く這うように距離を詰める
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {legL: (28, 0, 0), legR: (28, 0, 0), head: (5, 0, 0)}),
            (9, {legL: (-22, 0, 0), legR: (-22, 0, 0), head: (-5, 0, 0)}),
            (14, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 御守りごと体ごとぶつかるように飛びかかる不意打ち
        ("attack", [
            (1, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
            (4, {armL: (-42, 0, 22), armR: (-42, 0, -22), head: (-22, 0, 0)}),
            (8, {armL: (28, 0, -8), armR: (28, 0, 8), head: (12, 0, 0)}),
            (16, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 状態異常を受けないぶん、被弾してもわずかに揺れるだけ
        ("hit", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (17, 0, 0), armL: (-19, 0, 15), armR: (-19, 0, -15)}),
            (14, {head: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {head: (0, 0, 0)}),
            (9, {head: (24, 0, 0), legL: (-32, 0, 0), legR: (-32, 0, 0)}),
            (22, {head: (36, 0, 0), legL: (-58, 0, 0), legR: (-58, 0, 0),
                  armL: (-52, 0, 21), armR: (-52, 0, -21)}),
        ]),
    ]


# ========================================================================= かたくなガニ

KATAKUNAGANI_HALF = {
    "hip": (0.0, 0.13, 0.135),
    "chest": (0.0, -0.03, 0.145),
    "neck": (0.0, -0.14, 0.135),
    "snout": (0.0, -0.26, 0.10),
    "tail1": (0.0, 0.20, 0.125),
    "tail2": (0.0, 0.24, 0.12),
    "tail3": (0.0, 0.27, 0.115),
    "ear.L": (0.06, -0.14, 0.19),
    "hipF.L": (0.13, -0.05, 0.115),
    "footF.L": (0.19, -0.06, 0.03),
    "hipB.L": (0.12, 0.11, 0.115),
    "footB.L": (0.13, 0.14, 0.03),
}
KATAKUNAGANI_RADII_HALF = {
    "hip": 0.155, "chest": 0.165, "neck": 0.090, "snout": 0.045,
    "tail1": 0.028, "tail2": 0.020, "tail3": 0.012,
    "ear.L": 0.022,
    "hipF.L": 0.055, "footF.L": 0.072,
    "hipB.L": 0.045, "footB.L": 0.032,
}
KATAKUNAGANI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_katakunagani():
    """
    意固地になった古い意地。gajiriと同じ関節構成をベースに、体を平たく
    幅広くしてカニらしい甲羅の輪郭にし、前脚を太く大きくして何かを
    掴んで抱え込むための鋏に作り替える。耳と尻尾はカニらしからぬため
    小さく切り詰め、代わりに頭から突き出た目柄を足す。配色は
    第四地方(骨積みの回廊)の、白骨色・くすんだ灰色。
    """
    joints = C.mirrored(KATAKUNAGANI_HALF)
    radii = C.mirrored_radii(KATAKUNAGANI_RADII_HALF)
    bones = C.mirrored_bones(KATAKUNAGANI_BONES_HALF)

    body = C.build_skinned("katakunagani", joints, bones, radii, root="chest", subsurf=2)
    shell = C.make_material("katakuna_shell", (0.68, 0.65, 0.58), roughness=0.6)
    ash = C.make_material("katakuna_ash", (0.42, 0.42, 0.44), roughness=0.75)
    C.assign_materials_by_region(body, [shell, ash], lambda c: 1 if c.z < 0.075 else 0)

    extras = []
    # 何かを掴んで抱え込むための、太く大きな鋏
    claw_mat = C.make_material("katakuna_claw", (0.76, 0.72, 0.62), roughness=0.55)
    for side in (-1.0, 1.0):
        px, py, pz = 0.20 * side, -0.06, 0.035
        pincer = C.uv_sphere(f"katakuna_pincer{side}", (px, py, pz), 0.042,
                             segments=14, rings=10, scale=(1.0, 1.3, 0.65))
        C.assign_material(pincer, claw_mat)
        extras.append(pincer)
        claw_l = C.cone(f"katakuna_clawL{side}", (px + 0.045 * side, py - 0.075, pz + 0.005),
                        0.020, 0.006, 0.075)
        C.assign_material(claw_l, claw_mat)
        extras.append(claw_l)
        claw_r = C.cone(f"katakuna_clawR{side}", (px - 0.035 * side, py - 0.075, pz - 0.010),
                        0.017, 0.005, 0.065)
        C.assign_material(claw_r, claw_mat)
        extras.append(claw_r)
        # 頭から突き出た目柄
        stalk = C.cylinder(f"katakuna_stalk{side}", (0.032 * side, -0.19, 0.175), 0.010, 0.055, segments=8)
        C.assign_material(stalk, ash)
        extras.append(stalk)
        extras += eyeball(f"katakuna_eye{side}", (0.032 * side, -0.19, 0.205), 0.020,
                          look=(0.3 * side, -1.0, 0.1))

    mesh = C.join([body] + extras, "katakunagani")
    armature = C.build_armature("katakunagani", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def katakunagani_animations():
    neck, snout = "chest-neck", "neck-snout"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    return [
        # 意地を張ったまま、じっと身構える
        ("idle", [
            (1, {neck: (0, 0, 0)}),
            (30, {neck: (2, 0, 1), hipF_L: (0, 0, 3), hipF_R: (0, 0, -3)}),
            (60, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # すばやく横滑りするように進む
        ("walk", [
            (1, {hipF_L: (14, 0, 0), hipF_R: (-14, 0, 0), hipB_L: (-12, 0, 0), hipB_R: (12, 0, 0)}),
            (7, {hipF_L: (-14, 0, 0), hipF_R: (14, 0, 0), hipB_L: (12, 0, 0), hipB_R: (-12, 0, 0)}),
            (14, {hipF_L: (14, 0, 0), hipF_R: (-14, 0, 0), hipB_L: (-12, 0, 0), hipB_R: (12, 0, 0)}),
        ]),
        # 素早く近づいて鋏でかすめ取り、意地を張ったまま身を引く
        ("attack", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (4, {neck: (-12, 0, 0), hipF_L: (-22, 0, 12), hipF_R: (-22, 0, -12)}),
            (8, {neck: (16, 0, 0), hipF_L: (24, 0, -8), hipF_R: (24, 0, 8)}),
            (16, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (14, 0, 0), hipF_L: (-10, 0, 8), hipF_R: (-10, 0, -8)}),
            (12, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {neck: (0, 0, 0)}),
            (8, {neck: (10, 0, 0), hipF_L: (16, 0, 0), hipF_R: (16, 0, 0)}),
            (18, {neck: (22, 0, 0), hipF_L: (36, 0, 0), hipF_R: (36, 0, 0)}),
        ]),
    ]


# ========================================================================= まざりねずみ

MAZARINEZUMI_HALF = {
    "hip": (0.0, 0.1875, 0.25),
    "chest": (0.0, -0.025, 0.2625),
    "neck": (0.0, -0.1875, 0.2375),
    "snout": (0.0, -0.40, 0.1625),
    "tail1": (0.0, 0.35, 0.2375),
    "tail2": (0.0, 0.525, 0.30),
    "tail3": (0.0, 0.65, 0.40),
    "ear.L": (0.125, -0.1875, 0.425),
    "hipF.L": (0.1125, -0.075, 0.175),
    "footF.L": (0.125, -0.125, 0.03),
    "hipB.L": (0.1375, 0.1625, 0.1875),
    "footB.L": (0.15, 0.20, 0.03),
}
MAZARINEZUMI_RADII_HALF = {
    "hip": 0.155, "chest": 0.165, "neck": 0.120, "snout": 0.048,
    "tail1": 0.032, "tail2": 0.024, "tail3": 0.016,
    "ear.L": 0.050,
    "hipF.L": 0.045, "footF.L": 0.038,
    "hipB.L": 0.058, "footB.L": 0.040,
}
MAZARINEZUMI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_mazarinezumi():
    """
    ガジリねずみといしずえねずみが混ざった、不安定な個体。gajiriと同じ
    関節構成をベースに、体格はどちらの姿にも定まりきらない中間の
    大きさにする。臆病さと不動の構えが同居する証として、腰から尻尾に
    かけてだけ小さな甲羅を乗せ、頭から前脚にかけては装甲のない
    剥き出しのままにする。配色は第八地方(めざめの前庭)の、
    第一〜第七地方の色が淡く混ざり合った継ぎ接ぎにする。
    """
    joints = C.mirrored(MAZARINEZUMI_HALF)
    radii = C.mirrored_radii(MAZARINEZUMI_RADII_HALF)
    bones = C.mirrored_bones(MAZARINEZUMI_BONES_HALF)

    body = C.build_skinned("mazarinezumi", joints, bones, radii, root="chest", subsurf=2)

    region_mats = [
        C.make_material("mazari_r1", (0.70, 0.60, 0.46), roughness=0.75),
        C.make_material("mazari_r2", (0.42, 0.52, 0.54), roughness=0.65),
        C.make_material("mazari_r3", (0.46, 0.32, 0.24), roughness=0.7),
        C.make_material("mazari_r4", (0.68, 0.65, 0.58), roughness=0.7),
        C.make_material("mazari_r5", (0.26, 0.30, 0.44), roughness=0.6),
        C.make_material("mazari_r6", (0.56, 0.46, 0.32), roughness=0.75),
        C.make_material("mazari_r7", (0.50, 0.22, 0.20), roughness=0.6),
    ]
    bounds = [0.0, 45.0, 100.0, 140.0, 190.0, 230.0, 290.0, 360.0]

    def classify(c):
        deg = math.degrees(math.atan2(c.y, c.x)) % 360.0
        for i in range(7):
            if bounds[i] <= deg < bounds[i + 1]:
                return i
        return 6

    C.assign_materials_by_region(body, region_mats, classify)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"mazari_eye{side}", (0.086 * side, -0.30, 0.28), 0.038,
                          look=(0.3 * side, -1.0, 0.05))
    nose = C.uv_sphere("mazari_nose", (0.0, -0.475, 0.170), 0.026, segments=12, rings=8)
    C.assign_material(nose, C.make_material("mazari_nose_m", (0.72, 0.44, 0.46), roughness=0.4))
    extras.append(nose)

    # 腰から尻尾にかけてだけ乗せた、育ちきらない甲羅
    shell_mat = C.make_material("mazari_shell", (0.48, 0.46, 0.42), roughness=0.55)
    for i, (sy, sz, r) in enumerate([(0.20, 0.31, 0.075), (0.30, 0.34, 0.062), (0.38, 0.38, 0.048)]):
        plate = C.uv_sphere(f"mazari_shell{i}", (0.0, sy, sz), r,
                            segments=14, rings=8, scale=(1.1, 0.9, 0.55))
        C.assign_material(plate, shell_mat)
        extras.append(plate)

    mesh = C.join([body] + extras, "mazarinezumi")
    armature = C.build_armature("mazarinezumi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def mazarinezumi_animations():
    neck, snout = "chest-neck", "neck-snout"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    return [
        # 臆病さと不動の構えが同居し、落ち着かずわずかに揺れる
        ("idle", [
            (1, {neck: (0, 0, 0)}),
            (20, {neck: (3, 0, 2)}),
            (40, {neck: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
            (9, {hipF_L: (-16, 0, 0), hipF_R: (16, 0, 0), hipB_L: (14, 0, 0), hipB_R: (-14, 0, 0)}),
            (18, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
        ]),
        ("attack", [
            (1, {neck: (0, 0, 0), snout: (0, 0, 0)}),
            (5, {neck: (-14, 0, 0), snout: (-8, 0, 0)}),
            (10, {neck: (20, 0, 0), snout: (12, 0, 0)}),
            (20, {neck: (0, 0, 0), snout: (0, 0, 0)}),
        ]),
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (-14, 0, 0)}),
            (14, {neck: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {neck: (0, 0, 0)}),
            (10, {neck: (12, 0, 0), hipF_L: (18, 0, 0), hipF_R: (18, 0, 0)}),
            (24, {neck: (26, 0, 0), hipF_L: (40, 0, 0), hipF_R: (40, 0, 0)}),
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
    "yumemayoinokage": (build_yumemayoinokage, yumemayoinokage_animations),
    "yorishironozankyo": (build_yorishironozankyo, yorishironozankyo_animations),
    "fuchiNoNushi": (build_fuchiNoNushi, fuchiNoNushi_animations),
    "shizukuuo": (build_shizukuuo, shizukuuo_animations),
    "urumiguma": (build_urumiguma, urumiguma_animations),
    "nadakaze": (build_nadakaze, nadakaze_animations),
    "shioresakura": (build_shioresakura, shioresakura_animations),
    "mizukagami": (build_mizukagami, mizukagami_animations),
    "nakimushi": (build_nakimushi, nakimushi_animations),
    "namidaguma": (build_namidaguma, namidaguma_animations),
    "nemurimogura": (build_nemurimogura, nemurimogura_animations),
    "nushigaeru": (build_nushigaeru, nushigaeru_animations),
    "oitekeboshi": (build_oitekeboshi, oitekeboshi_animations),
    "oomadoromi": (build_oomadoromi, oomadoromi_animations),
    "oonebosuke": (build_oonebosuke, oonebosuke_animations),
    "subetenopurun": (build_subetenopurun, subetenopurun_animations),
    "honezukanotsukai": (build_honezukanotsukai, honezukanotsukai_animations),
    "hajimeNoYume": (build_hajimeNoYume, hajimeNoYume_animations),
    "honezukaNoNushi": (build_honezukaNoNushi, honezukaNoNushi_animations),
    "horikuiNoNushi": (build_horikuiNoNushi, horikuiNoNushi_animations),
    "horoholocho": (build_horoholocho, horoholocho_animations),
    "ishizuenezumi": (build_ishizuenezumi, ishizuenezumi_animations),
    "kasumiutsubo": (build_kasumiutsubo, kasumiutsubo_animations),
    "katakunagani": (build_katakunagani, katakunagani_animations),
    "matsurinonushi": (build_matsurinonushi, matsurinonushi_animations),
    "mazarinezumi": (build_mazarinezumi, mazarinezumi_animations),
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
