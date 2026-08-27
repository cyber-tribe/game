"""
主人公「ガルド」。

確定した2D設定画(design/characters/garudo/generated/garudo-sheet.png、
ユーザー提供)を忠実に3D化する。`five-character-redesign-gate.md`の
決定2-4が許可するとおり、**共通素体(build_skinnedのSkinモディファイア)を
完全に捨て**、設定画の三面図から採寸した断面リング(高さごとの楕円)を
積み上げる専用メッシュ(_loft)で全部位を組む。「設定画がそのまま
動いているように見える」ことが合格基準。

設定画の要点(すべて本ファイルの座標に反映):

- **7頭身**(頭頂=0.95、頭身単位0.1357)。あご=1・肘=3.3・
  股/手首=4.3・膝=5.8頭身。がっしりした少年の量感(なで肩ではなく
  肩幅があり、腕脚も細い棒にしない)。
- **樽板エプロン**: ベルトから膝上まで。輪郭が「膨らみ→くびれ→
  膨らみ」で、黒塗りでも樽と読める。たが(鉄輪)2段。
- **背負いダル**: 背中の肩〜腰を占める大きさで、上端(ふた)が
  肩越しに覗く。肩ひもは胸の前を2本走りベルトへ届く。
- 生成りシャツ(肘まで袖をまくり、まくり口が膨らむ。肘から先は素肌)・
  深緑のズボン(裾をブーツに入れて膨らむ)・革ブーツ(つま先・甲の
  実体形状)・濃茶のミトン手袋(親指つき)・茶色の無造作な髪
  (大きな塊+前髪・こめかみ・頭頂の房)。
- 設定画に武器は無いため、旧モデルの手斧は持たせない。

Blender では -Y を正面として組む。glTF に書き出すとこれが +Z 正面になり、
Three.js 側で rotation.y = 0 が「南向き」に対応する。
関節名(JOINTS/BONES)とアニメーション5クリップは従来のまま維持する。
"""

from __future__ import annotations

import math

# common が bpy を読み込む。mathutils は bpy の読み込み後でないと import できない
import bmesh
import bpy
import common as C
import props
from mathutils import Vector

NAME = "garudo"

# 頭身単位。全高 0.95 を 7 頭身で割る
HEAD_UNIT = 0.95 / 7.0

JOINTS_HALF = {
    "hip": (0.0, 0.0, 0.42),
    "chest": (0.0, -0.004, 0.70),
    "neck": (0.0, 0.0, 0.79),
    "head": (0.0, -0.004, 0.878),
    "crown": (0.0, 0.0, 0.93),
    "shoulder.L": (0.100, 0.0, 0.762),
    "elbow.L": (0.110, 0.004, 0.505),
    "hand.L": (0.115, -0.016, 0.352),
    "thigh.L": (0.056, 0.0, 0.36),
    "knee.L": (0.056, 0.0, 0.17),
    "foot.L": (0.057, -0.02, 0.03),
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
BONES = C.mirrored_bones(BONES_HALF)

# 配色は設定画から採る
SKIN = (0.85, 0.66, 0.48)
SHIRT = (0.88, 0.83, 0.72)      # 生成りのシャツ
TROUSERS = (0.25, 0.28, 0.18)   # 深緑のズボン
BOOT = (0.38, 0.25, 0.14)       # 革のブーツ
GLOVE = (0.32, 0.21, 0.12)      # ミトン状の手袋
HAIR = (0.25, 0.16, 0.09)       # 茶色の無造作な髪
BELT = (0.30, 0.19, 0.11)       # 革ベルト・肩ひも
APRON_WOOD = props.BARREL_WOOD  # 樽板エプロン(実物の樽と同色で統一)
HOOP = props.BARREL_IRON        # たが(鉄輪)


def _loft(name: str, rings, segments: int = 16, smooth: bool = True,
          cap_top: bool = True, cap_bottom: bool = True):
    """
    断面リングを下から上へ積み、側面を貼った回転体風メッシュを作る。
    設定画の三面図から「高さzでの横幅rx(正面図)・奥行きry(側面図)・
    中心のずれcx, cy」を測ってそのまま並べられるのが利点で、
    Skinモディファイアの膨らんだソーセージ形にならない。

    rings: (z, rx, ry, cx, cy) を z 昇順で並べたリスト。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    angles = [i * math.tau / segments for i in range(segments)]
    ring_verts = []
    for z, rx, ry, cx, cy in rings:
        ring_verts.append([
            bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
            for a in angles
        ])
    for lower, upper in zip(ring_verts, ring_verts[1:]):
        for i in range(segments):
            bm.faces.new((lower[i], lower[(i + 1) % segments],
                          upper[(i + 1) % segments], upper[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(ring_verts[0])))
    if cap_top:
        bm.faces.new(ring_verts[-1])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


def _segment_between(name: str, p0: Vector, p1: Vector, radius: float, segments: int = 8):
    """任意の2点を結ぶ円柱。肩ひものように3軸すべてで向きが変わる部品向け。"""
    direction = p1 - p0
    length = direction.length
    seg = C.cylinder(name, (0.0, 0.0, 0.0), radius, length, segments=segments)
    seg.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    seg.location = (p0 + p1) / 2
    return seg


def _cone_at(name: str, origin: Vector, direction: Vector, radius: float, length: float,
             segments: int = 5):
    """原点でconeを作り、directionへ向けてからoriginへ置く(髪の房用)。"""
    tuft = C.cone(name, (0.0, 0.0, 0.0), radius, 0.004, length, segments=segments)
    tuft.rotation_euler = direction.normalized().to_track_quat("Z", "Y").to_euler()
    tuft.location = origin
    return tuft


def build() -> tuple[list, object]:
    skin_mat = C.make_material("garudo_skin", SKIN, roughness=0.65)
    shirt_mat = C.make_material("garudo_shirt", SHIRT, roughness=0.85)
    trousers_mat = C.make_material("garudo_trousers", TROUSERS, roughness=0.85)
    boot_mat = C.make_material("garudo_boot", BOOT, roughness=0.7)
    glove_mat = C.make_material("garudo_glove", GLOVE, roughness=0.75)
    hair_mat = C.make_material("garudo_hair", HAIR, roughness=0.9)
    belt_mat = C.make_material("garudo_belt", BELT, roughness=0.75)
    hoop_mat = C.make_material("garudo_hoop", HOOP, roughness=0.45, metallic=0.7)
    apron_mat = C.make_material("garudo_apron_wood", APRON_WOOD, roughness=0.85)
    eye_mat = C.make_material("garudo_eye", (0.20, 0.12, 0.07), roughness=0.25)
    eyewhite_mat = C.make_material("garudo_eyewhite", (0.95, 0.95, 0.93), roughness=0.3)
    highlight_mat = C.make_material("garudo_eye_highlight", (1.0, 1.0, 1.0),
                                    roughness=0.2, emission=0.4)
    mouth_mat = C.make_material("garudo_mouth", (0.35, 0.16, 0.14), roughness=0.5)

    parts_list = []   # joinする部品
    pinned = []       # (グループ名, ボーン名)

    def add(obj, mat, pin_bone=None):
        C.assign_material(obj, mat)
        if pin_bone:
            C.mark_for_pin(obj)
            pinned.append((obj.name, pin_bone))
        parts_list.append(obj)
        return obj

    # ---- 頭(顔)。あご=0.814、頬で最も広く、頭頂へ丸く閉じる ----
    add(_loft("garudo_head", [
        (0.812, 0.016, 0.020, 0.0, -0.006),
        (0.824, 0.036, 0.042, 0.0, -0.006),
        (0.845, 0.049, 0.055, 0.0, -0.005),
        (0.870, 0.054, 0.058, 0.0, -0.004),
        (0.900, 0.052, 0.056, 0.0, -0.003),
        (0.928, 0.043, 0.048, 0.0, -0.001),
        (0.948, 0.020, 0.026, 0.0, 0.0),
    ]), skin_mat)

    # ---- 首 ----
    add(_loft("garudo_neck", [
        (0.770, 0.023, 0.022, 0.0, 0.0),
        (0.828, 0.021, 0.021, 0.0, 0.0),
    ], segments=10), skin_mat)

    # ---- 耳 ----
    head = Vector(JOINTS["head"])
    for s in (-1.0, 1.0):
        ear = C.uv_sphere(f"garudo_ear{s}", Vector((0.054 * s, -0.004, 0.872)), 0.012,
                          segments=6, rings=5, scale=(0.5, 0.9, 1.2))
        add(ear, skin_mat)

    # ---- 髪。頭より一回り大きい無造作な塊+房 ----
    add(_loft("garudo_hair_mass", [
        (0.845, 0.060, 0.062, 0.0, 0.016),
        (0.875, 0.068, 0.068, 0.0, 0.012),
        (0.905, 0.072, 0.070, 0.0, 0.004),
        (0.938, 0.066, 0.066, 0.0, 0.002),
        (0.962, 0.044, 0.046, 0.0, 0.0),
    ], cap_bottom=True), hair_mat)
    tuft_specs = [
        # 前髪(額に沿って5本、互い違いの長さ)
        (Vector((-0.044, -0.048, 0.900)), Vector((-0.30, -0.35, -0.89)), 0.044),
        (Vector((-0.021, -0.053, 0.903)), Vector((-0.08, -0.40, -0.91)), 0.050),
        (Vector((0.003, -0.055, 0.905)), Vector((0.05, -0.38, -0.92)), 0.046),
        (Vector((0.026, -0.052, 0.903)), Vector((0.20, -0.40, -0.89)), 0.051),
        (Vector((0.045, -0.046, 0.900)), Vector((0.42, -0.32, -0.85)), 0.043),
        # こめかみの横毛(耳の上に被さる)
        (Vector((-0.064, -0.012, 0.885)), Vector((-0.85, -0.18, -0.49)), 0.040),
        (Vector((0.064, -0.012, 0.885)), Vector((0.85, -0.18, -0.49)), 0.040),
        # 頭頂・後頭部の跳ね(乱れた量感の輪郭)
        (Vector((-0.036, 0.008, 0.945)), Vector((-0.45, 0.10, 0.89)), 0.046),
        (Vector((-0.006, 0.020, 0.955)), Vector((-0.05, 0.25, 0.97)), 0.050),
        (Vector((0.030, 0.010, 0.948)), Vector((0.42, 0.05, 0.90)), 0.044),
        (Vector((-0.020, 0.058, 0.920)), Vector((-0.20, 0.80, 0.56)), 0.042),
        (Vector((0.026, 0.058, 0.915)), Vector((0.30, 0.85, 0.44)), 0.040),
        (Vector((0.000, 0.066, 0.895)), Vector((0.05, 0.95, 0.30)), 0.038),
    ]
    for i, (origin, direction, length) in enumerate(tuft_specs):
        add(_cone_at(f"garudo_hair_tuft{i}", origin, direction, 0.016, length), hair_mat)

    # ---- 顔の造作 ----
    for s in (-1.0, 1.0):
        brow = C.box(f"garudo_brow{s}", (0.022 * s, -0.059, 0.891), (0.026, 0.006, 0.007))
        brow.rotation_euler = (0.0, 0.0, -0.15 * s)
        add(brow, hair_mat)
    nose = _cone_at("garudo_nose", Vector((0.0, -0.058, 0.866)),
                    Vector((0.0, -0.9, -0.35)), 0.008, 0.014)
    add(nose, skin_mat)
    add(C.box("garudo_mouth", (0.0, -0.058, 0.836), (0.013, 0.004, 0.004)), mouth_mat)

    # まばたき対象(白目・瞳)は本体へjoinせず、後で頭の骨へ剛体接続する
    # (plan/models/archive/eye-blink-liveliness.md)
    eyes = []
    for s in (-1.0, 1.0):
        white = C.uv_sphere(f"eyewhite{s}", Vector((0.021 * s, -0.058, 0.880)), 0.016,
                            segments=8, rings=6, scale=(1.25, 0.30, 1.05))
        C.assign_material(white, eyewhite_mat)
        white["blink"] = "white"
        pupil = C.uv_sphere(f"pupil{s}", Vector((0.022 * s, -0.063, 0.879)), 0.0095,
                            segments=6, rings=5, scale=(1.0, 0.5, 1.0))
        C.assign_material(pupil, eye_mat)
        pupil["blink"] = "pupil"
        eyes += [white, pupil]
        highlight = C.uv_sphere(f"garudo_eyehl{s}",
                                Vector((0.0245 * s, -0.066, 0.883)), 0.0035,
                                segments=4, rings=3)
        add(highlight, highlight_mat)

    # ---- 胴(シャツ)。肩幅があり、胸で最も広く、ベルトへ絞る ----
    add(_loft("garudo_torso", [
        (0.438, 0.078, 0.054, 0.0, 0.0),
        (0.500, 0.080, 0.055, 0.0, 0.0),
        (0.580, 0.086, 0.057, 0.0, -0.002),
        (0.660, 0.092, 0.060, 0.0, -0.004),
        (0.720, 0.094, 0.060, 0.0, -0.004),
        (0.755, 0.088, 0.056, 0.0, -0.002),
        (0.772, 0.058, 0.046, 0.0, 0.0),
        (0.784, 0.032, 0.030, 0.0, 0.0),
    ]), shirt_mat)

    # ---- 袖(肩〜肘。まくり口の膨らみで終わる)+前腕(素肌)+ミトン ----
    for s in (-1.0, 1.0):
        add(_loft(f"garudo_sleeve{s}", [
            (0.492, 0.035, 0.035, 0.111 * s, 0.004),
            (0.516, 0.037, 0.037, 0.110 * s, 0.004),
            (0.528, 0.030, 0.030, 0.110 * s, 0.004),
            (0.600, 0.031, 0.031, 0.107 * s, 0.003),
            (0.680, 0.033, 0.033, 0.104 * s, 0.002),
            (0.740, 0.035, 0.035, 0.101 * s, 0.0),
            (0.772, 0.033, 0.033, 0.099 * s, 0.0),
            (0.783, 0.024, 0.024, 0.096 * s, 0.0),
        ], segments=12), shirt_mat)
        add(_loft(f"garudo_forearm{s}", [
            (0.360, 0.0195, 0.0195, 0.115 * s, -0.012),
            (0.400, 0.021, 0.021, 0.114 * s, -0.005),
            (0.450, 0.0225, 0.0225, 0.112 * s, 0.002),
            (0.500, 0.0240, 0.0240, 0.111 * s, 0.004),
        ], segments=12), skin_mat)
        tag = "L" if s > 0 else "R"
        add(_loft(f"garudo_glove{tag}", [
            (0.292, 0.014, 0.014, 0.116 * s, -0.016),
            (0.302, 0.026, 0.026, 0.116 * s, -0.016),
            (0.330, 0.031, 0.031, 0.116 * s, -0.016),
            (0.352, 0.029, 0.029, 0.116 * s, -0.015),
            (0.368, 0.023, 0.023, 0.115 * s, -0.014),
        ], segments=12), glove_mat, pin_bone=f"elbow.{tag}-hand.{tag}")
        thumb = C.uv_sphere(f"garudo_thumb{tag}", Vector((0.093 * s, -0.024, 0.336)),
                            0.011, segments=6, rings=5, scale=(1.0, 1.0, 1.5))
        add(thumb, glove_mat, pin_bone=f"elbow.{tag}-hand.{tag}")

    # ---- ベルト+バックル ----
    add(_loft("garudo_belt", [
        (0.435, 0.084, 0.062, 0.0, 0.0),
        (0.478, 0.084, 0.062, 0.0, 0.0),
    ]), belt_mat, pin_bone="hip-chest")
    add(C.box("garudo_buckle", (0.0, -0.064, 0.457), (0.024, 0.007, 0.022)),
        hoop_mat, pin_bone="hip-chest")

    # ---- 樽板エプロン(膨らみ→くびれ→膨らみ)+たが2段 ----
    apron_profile = [
        (0.435, 0.086),
        (0.372, 0.116),
        (0.300, 0.094),
        (0.226, 0.110),
        (0.192, 0.100),
    ]
    for i in range(len(apron_profile) - 1):
        z_hi, r_hi = apron_profile[i]
        z_lo, r_lo = apron_profile[i + 1]
        seg = C.cone(f"garudo_apron{i}", (0.0, 0.0, (z_hi + z_lo) / 2),
                     r_lo, r_hi, z_hi - z_lo, segments=10)
        for poly in seg.data.polygons:
            poly.use_smooth = False
        # 段同士の継ぎ目に埋まって見えないふた面を削る
        bm = bmesh.new()
        bm.from_mesh(seg.data)
        hidden = [f for f in bm.faces
                  if (f.normal.z > 0.9 and i != 0) or (f.normal.z < -0.9 and i != 3)]
        bmesh.ops.delete(bm, geom=hidden, context="FACES")
        bm.to_mesh(seg.data)
        bm.free()
        add(seg, apron_mat, pin_bone="hip-chest")
    for i, (hoop_z, hoop_r) in enumerate(((0.372, 0.116), (0.226, 0.110))):
        hoop = C.cylinder(f"garudo_apron_hoop{i}", (0.0, 0.0, hoop_z),
                          hoop_r + 0.004, 0.016, segments=10)
        add(hoop, hoop_mat, pin_bone="hip-chest")

    # ---- ズボン(バギー、裾をブーツに入れて絞る) ----
    for s in (-1.0, 1.0):
        add(_loft(f"garudo_trouser{s}", [
            (0.124, 0.033, 0.033, 0.056 * s, 0.0),
            (0.140, 0.041, 0.041, 0.056 * s, 0.0),
            (0.180, 0.043, 0.043, 0.056 * s, 0.0),
            (0.245, 0.045, 0.045, 0.056 * s, 0.0),
            (0.310, 0.046, 0.046, 0.056 * s, 0.0),
        ], segments=12), trousers_mat)

    # ---- ブーツ(甲・つま先・靴底の実体形状) ----
    for s in (-1.0, 1.0):
        tag = "L" if s > 0 else "R"
        add(_loft(f"garudo_boot{tag}", [
            (0.002, 0.034, 0.056, 0.057 * s, -0.018),
            (0.012, 0.035, 0.058, 0.057 * s, -0.018),
            (0.028, 0.034, 0.052, 0.057 * s, -0.016),
            (0.050, 0.033, 0.040, 0.057 * s, -0.006),
            (0.085, 0.034, 0.037, 0.057 * s, 0.0),
            (0.130, 0.035, 0.037, 0.056 * s, 0.0),
        ], segments=12), boot_mat, pin_bone=f"knee.{tag}-foot.{tag}")

    # ---- 背負いダル(背中の肩〜腰を占め、上端が肩越しに覗く) ----
    backpack_height = 0.28
    backpack_radius = 0.070
    backpack_origin = Vector((0.02, 0.108, 0.50))
    barrel_parts = props.barrel_body(
        "garudo_backpack", props.BARREL_WOOD, props.BARREL_IRON,
        height=backpack_height, radius=backpack_radius,
    )
    barrel_parts.append(props.barrel_lid(
        "garudo_backpack", (0.46, 0.30, 0.17),
        height=backpack_height, radius=backpack_radius,
    ))
    for obj in barrel_parts:
        obj.location += backpack_origin
        C.mark_for_pin(obj)
        pinned.append((obj.name, "hip-chest"))
        parts_list.append(obj)

    # ---- 肩ひも(設定画: 胸の前を2本、肩を越えて樽上部へ) ----
    for s in (-1.0, 1.0):
        front = _segment_between(
            f"garudo_strap_front{s}",
            Vector((0.050 * s, -0.056, 0.470)), Vector((0.052 * s, -0.046, 0.755)),
            radius=0.011, segments=6,
        )
        add(front, belt_mat, pin_bone="hip-chest")
        over = _segment_between(
            f"garudo_strap_over{s}",
            Vector((0.052 * s, -0.046, 0.755)), Vector((0.045 * s, 0.105, 0.770)),
            radius=0.011, segments=6,
        )
        add(over, belt_mat, pin_bone="hip-chest")

    mesh = C.join(parts_list, NAME)
    armature = C.build_armature(NAME, JOINTS, BONES, mesh, root="hip")
    for eye in eyes:
        C.parent_to_bone(eye, armature, "neck-head")
    for group_name, bone in pinned:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature] + eyes, armature


# ---------------------------------------------------------------- アニメーション

def animations() -> list[tuple[str, list]]:
    """
    待機・歩行・攻撃・被弾・消滅の5クリップ。角度は度で指定する。

    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間による鋭い動き)・頭の遅れ追従(二次揺れ)を
    足してある。骨名は従来のまま(角度は骨の回転なので比率に依存しない)。
    """
    hipc = "hip-chest"
    spine = "chest-neck"
    neck = "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"

    head_delay = C.secondary_delay_frames(
        (Vector(JOINTS_HALF["head"]) - Vector(JOINTS_HALF["neck"])).length
        / (Vector(JOINTS_HALF["chest"]) - Vector(JOINTS_HALF["hip"])).length
    )
    idle = [
        (1, {hipc: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4), neck: (0, 0, 0)}),
        (18, {hipc: (2.5, 0, 0), armL: (-5, 0, 7), armR: (-5, 0, -7)}),
        (18 + head_delay, {neck: (-2.5, 0, 0)}, {"partial": True}),
        (36, {hipc: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
        (36 + head_delay, {neck: (0, 0, 0)}, {"partial": True}),
    ]

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

    attack = [
        (1, {hipc: (0, 0, 0), armR: (0, 0, -4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
        (7, {hipc: (-12, 0, -10), armR: (-112, 0, -22), foreR: (-38, 0, 0), neck: (8, 0, 0)},
         {"interp": "LINEAR"}),
        (10, {hipc: (18, 0, 12), armR: (64, 0, 16), foreR: (14, 0, 0), neck: (-12, 0, 0)}),
        (12, {hipc: (14, 0, 9), armR: (52, 0, 12), foreR: (8, 0, 0), neck: (-8, 0, 0)}),
        (22, {hipc: (0, 0, 0), armR: (0, 0, -4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
    ]

    hit = [
        (1, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)},
         {"interp": "LINEAR"}),
        (3, {hipc: (-20, 0, 0), neck: (-14, 0, 0), armL: (-18, 0, 22), armR: (-18, 0, -22)}),
        (14, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
    ]

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
    C.export_glb(NAME, objs, flat=True)
    print("done")
