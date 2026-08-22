"""
主人公「ガルド」。

がっしりした体つきの少年。頭が大きめのずんぐりした比率にしてあるのは、
斜め見下ろしのカメラでも表情と向きが読み取れるようにするため。
Blender では -Y を正面として組む。glTF に書き出すとこれが +Z 正面になり、
Three.js 側で rotation.y = 0 が「南向き」に対応する。
"""

from __future__ import annotations

# common が bpy を読み込む。mathutils は bpy の読み込み後でないと import できない
import common as C
import parts
from mathutils import Vector

NAME = "garudo"

# 関節の位置。全高およそ 0.95(タイル1マスが 1.0)
JOINTS_HALF = {
    "hip": (0.0, 0.0, 0.34),
    "chest": (0.0, -0.01, 0.52),
    "neck": (0.0, 0.0, 0.60),
    "head": (0.0, -0.01, 0.72),
    "crown": (0.0, 0.0, 0.86),
    "shoulder.L": (0.145, 0.0, 0.555),
    "elbow.L": (0.215, 0.01, 0.44),
    "hand.L": (0.20, -0.04, 0.32),
    "thigh.L": (0.082, 0.0, 0.30),
    "knee.L": (0.088, 0.0, 0.17),
    "foot.L": (0.092, -0.03, 0.035),
}

RADII_HALF = {
    "hip": 0.125,
    "chest": 0.150,
    "neck": 0.062,
    "head": 0.150,
    "crown": 0.100,
    "shoulder.L": 0.065,
    "elbow.L": 0.050,
    "hand.L": 0.055,
    "thigh.L": 0.068,
    "knee.L": 0.058,
    "foot.L": 0.055,
}

BONES_HALF = [
    ("hip", "chest"),
    ("chest", "neck"),
    ("neck", "head"),
    ("head", "crown"),
    ("chest", "shoulder.L"),
    ("shoulder.L", "elbow.L"),
    ("elbow.L", "hand.L"),
    ("hip", "thigh.L"),
    ("thigh.L", "knee.L"),
    ("knee.L", "foot.L"),
]

JOINTS = C.mirrored(JOINTS_HALF)
RADII = C.mirrored_radii(RADII_HALF)
BONES = C.mirrored_bones(BONES_HALF)

SKIN = (0.85, 0.66, 0.48)
TUNIC = (0.66, 0.28, 0.16)
TROUSERS = (0.24, 0.26, 0.34)
BANDANA = (0.88, 0.74, 0.26)
BOOT = (0.30, 0.21, 0.14)


def build() -> tuple[list, object]:
    body = C.build_skinned(NAME, JOINTS, BONES, RADII, root="hip", subsurf=2)

    mats = [
        C.make_material("garudo_skin", SKIN, roughness=0.65),
        C.make_material("garudo_tunic", TUNIC, roughness=0.8),
        C.make_material("garudo_trousers", TROUSERS, roughness=0.85),
        C.make_material("garudo_boot", BOOT, roughness=0.7),
        C.make_material("garudo_bandana", BANDANA, roughness=0.85),
    ]
    C.assign_materials_by_region(body, mats, classify_body)

    # 目・鼻・鉢巻き。体とは別メッシュにして、あとで統合する
    head = Vector(JOINTS["head"])
    eye_mat = C.make_material("garudo_eye", (0.09, 0.08, 0.10), roughness=0.25)
    eye_white = C.make_material("garudo_eyewhite", (0.95, 0.95, 0.93), roughness=0.3)
    skin_mat = C.make_material("garudo_nose", SKIN, roughness=0.65)
    band_mat = C.make_material("garudo_band", BANDANA, roughness=0.85)

    extras = []
    for side in (-1.0, 1.0):
        white = C.uv_sphere(
            f"eyewhite{side}", head + Vector((0.056 * side, -0.116, 0.004)), 0.038,
            segments=16, rings=12, scale=(1.0, 0.70, 1.10),
        )
        C.assign_material(white, eye_white)
        pupil = C.uv_sphere(
            f"pupil{side}", head + Vector((0.060 * side, -0.140, 0.002)), 0.020,
            segments=14, rings=10, scale=(1.0, 0.7, 1.0),
        )
        C.assign_material(pupil, eye_mat)
        # 太い眉。表情が出て、上から見たときに顔の向きが分かりやすくなる
        brow = C.box(f"brow{side}", head + Vector((0.057 * side, -0.124, 0.050)),
                     (0.052, 0.020, 0.015), bevel=0.006)
        brow.rotation_euler = (0.0, 0.0, -0.18 * side)
        C.assign_material(brow, eye_mat)
        extras += [white, pupil, brow]

    # 大きな鼻。ずんぐりした風貌の要
    nose = C.uv_sphere("nose", head + Vector((0.0, -0.146, -0.040)), 0.046,
                       segments=16, rings=12, scale=(0.90, 1.20, 0.85))
    C.assign_material(nose, skin_mat)
    extras.append(nose)

    # 鉢巻きは別メッシュを被せるのではなく、頭の上部を塗り分けて表現している
    # (classify_body を参照)。頭の形にぴったり沿うので隙間も食い込みも出ない。
    # ここでは後ろの結び目だけを立体で足す。
    knot = C.uv_sphere("knot", head + Vector((0.0, 0.142, 0.058)), 0.050,
                       segments=14, rings=10, scale=(1.0, 0.9, 0.7))
    C.assign_material(knot, band_mat)
    extras.append(knot)
    tail = C.uv_sphere("bandtail", head + Vector((0.0, 0.165, -0.020)), 0.032,
                       segments=12, rings=8, scale=(0.7, 0.8, 1.6))
    C.assign_material(tail, band_mat)
    extras.append(tail)

    # ベルト
    belt = C.cylinder("belt", Vector((0.0, 0.0, 0.395)), 0.142, 0.05, segments=26)
    C.assign_material(belt, C.make_material("garudo_belt", (0.20, 0.15, 0.11), roughness=0.6))
    extras.append(belt)

    # 右手に なた を握らせる。自動ウェイトで前腕の骨に追従するので、
    # 攻撃モーションでそのまま振り下ろされる
    hand_r = Vector(JOINTS["hand.R"])
    extras += parts.build_hatchet(origin=hand_r + Vector((0.0, -0.01, 0.0)),
                                  scale=0.95, rotation=(-22.0, 0.0, 6.0))

    mesh = C.join([body] + extras, NAME)
    armature = C.build_armature(NAME, JOINTS, BONES, mesh, root="hip")
    return [mesh, armature], armature


def classify_body(center) -> int:
    """面の位置から 肌0 / 上着1 / ズボン2 / 靴3 / 鉢巻き4 を決める。"""
    z = center.z
    x = abs(center.x)

    if z > 0.790:
        return 4  # 頭の上半分を鉢巻きが覆う
    if z < 0.095:
        return 3  # 靴
    if z < 0.30:
        return 2  # ズボン
    if x > 0.175 and z < 0.40:
        return 0  # 手先
    if z > 0.615:
        return 0  # 首から上
    return 1  # 上着


# ---------------------------------------------------------------- アニメーション

def animations() -> list[tuple[str, list]]:
    """
    待機・歩行・攻撃・被弾・消滅の5クリップ。角度は度で指定する。

    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間による鋭い動き)・頭の遅れ追従(二次揺れ)を
    足してある。頭(neck)は胴(hipc)より2フレーム遅れて追従させ、
    体の動きに引っ張られて頭がついてくる感じを出す。
    """
    hipc = "hip-chest"
    spine = "chest-neck"
    neck = "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"

    # 頭は胴より2フレーム遅れて同じ動きを追いかける(二次揺れ)
    idle = [
        (1, {hipc: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4), neck: (0, 0, 0)}),
        (18, {hipc: (2.5, 0, 0), armL: (-5, 0, 7), armR: (-5, 0, -7)}),
        (20, {neck: (-2.5, 0, 0)}, {"partial": True}),
        (36, {hipc: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
        (38, {neck: (0, 0, 0)}, {"partial": True}),
    ]

    # 4フェーズ(接地・沈み込み・通過・蹴り出し、plan/models/archive/
    # garudo-walk-motion.md)。従来は膝(shin)がほぼ伸びたまま脚を振っていて
    # コンパス歩行(人形が滑っているよう)に見えていたので、遊脚側の膝を
    # 40〜46度まで曲げる。接地の瞬間(frame1・15)は前脚をほぼ伸ばし
    # (shin 6度)、後ろ脚(次の遊脚になる側)はやや曲げておく(shin 20度)。
    # 通過の瞬間(frame8・22、脚が交差する中間点)で、遊脚側だけ膝を
    # 大きく曲げて前へ運ぶ(shin 46度)。腕振りは脚に対して大きすぎたので
    # ±24度から±15度へ抑えた
    walk = [
        (1, {legL: (26, 0, 0), legR: (-26, 0, 0), shinL: (6, 0, 0), shinR: (20, 0, 0),
             armL: (-15, 0, 4), armR: (15, 0, -4), hipc: (3, 0, 0)}),
        (8, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (12, 0, 0), shinR: (46, 0, 0),
             armL: (0, 0, 4), armR: (0, 0, -4), hipc: {"rot": (6, 0, 0), "loc": (0, -0.012, 0)}}),
        (15, {legL: (-26, 0, 0), legR: (26, 0, 0), shinL: (20, 0, 0), shinR: (6, 0, 0),
              armL: (15, 0, 4), armR: (-15, 0, -4), hipc: (3, 0, 0)}),
        (22, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (46, 0, 0), shinR: (12, 0, 0),
              armL: (0, 0, 4), armR: (0, 0, -4), hipc: {"rot": (6, 0, 0), "loc": (0, -0.012, 0)}}),
        (29, {legL: (26, 0, 0), legR: (-26, 0, 0), shinL: (6, 0, 0), shinR: (20, 0, 0),
              armL: (-15, 0, 4), armR: (15, 0, -4), hipc: (3, 0, 0)}),
    ]

    # タメ(ゆっくり振りかぶる)→ ツメ(LINEARで鋭く振り下ろす)→
    # 行き過ぎ(勢い余ったオーバーシュート)→ 戻り(ゆっくり構えに戻る)
    attack = [
        (1, {hipc: (0, 0, 0), armR: (0, 0, -4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
        (7, {hipc: (-12, 0, -10), armR: (-112, 0, -22), foreR: (-38, 0, 0), neck: (8, 0, 0)},
         {"interp": "LINEAR"}),
        (10, {hipc: (18, 0, 12), armR: (64, 0, 16), foreR: (14, 0, 0), neck: (-12, 0, 0)}),
        (12, {hipc: (14, 0, 9), armR: (52, 0, 12), foreR: (8, 0, 0), neck: (-8, 0, 0)}),
        (22, {hipc: (0, 0, 0), armR: (0, 0, -4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
    ]

    # 鋭く入って(LINEAR)、ゆっくり戻る
    hit = [
        (1, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)},
         {"interp": "LINEAR"}),
        (3, {hipc: (-20, 0, 0), neck: (-14, 0, 0), armL: (-18, 0, 22), armR: (-18, 0, -22)}),
        (14, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
    ]

    # 倒れの初動を鋭く、接地後に一度だけ小さく跳ね返る
    die = [
        (1, {hipc: (0, 0, 0), neck: (0, 0, 0), legL: (0, 0, 0), legR: (0, 0, 0)},
         {"interp": "LINEAR"}),
        (8, {hipc: (-28, 0, 0), neck: (-18, 0, 0), legL: (18, 0, 0), legR: (18, 0, 0),
             armL: (-40, 0, 30), armR: (-40, 0, -30)}),
        (22, {hipc: (-82, 0, 0), neck: (-30, 0, 0), legL: (52, 0, 0), legR: (48, 0, 0),
              armL: (-70, 0, 46), armR: (-70, 0, -46)}),
        (26, {hipc: (-76, 0, 0), neck: (-26, 0, 0), legL: (48, 0, 0), legR: (44, 0, 0),
              armL: (-64, 0, 42), armR: (-64, 0, -42)}),
    ]

    return [("idle", idle), ("walk", walk), ("attack", attack), ("hit", hit), ("die", die)]


def make():
    objs, armature = build()
    for clip_name, keyframes in animations():
        C.add_action(armature, clip_name, keyframes)
    return objs


if __name__ == "__main__":
    C.reset_scene()
    objs = make()
    print("三角形数:", C.tri_count(objs))
    C.render_preview(NAME, objs)
    C.export_glb(NAME, objs)
    print("done")
