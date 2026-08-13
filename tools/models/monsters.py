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
# そのまま踏襲する(plan/archive/model-wasuremizuchi.md参照)。ただし
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


# =========================================================================== 一覧
MONSTERS = {
    "purun": (build_purun, purun_animations),
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
