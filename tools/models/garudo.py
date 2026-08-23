"""
主人公「ガルド」。

がっしりした体つきの少年。頭が大きめのずんぐりした比率にしてあるのは、
斜め見下ろしのカメラでも表情と向きが読み取れるようにするため。
Blender では -Y を正面として組む。glTF に書き出すとこれが +Z 正面になり、
Three.js 側で rotation.y = 0 が「南向き」に対応する。

plan/models/archive/character-design-language.mdのパイロット再デザイン
(三語コンセプト「がんこ・まっすぐ・樽育ち」)。樽守りという設定を
姿に載せるため、背中に小さな背負いダル(propsの樽ジオメトリを縮小して
流用)を足し、ベルトをタルのたが(金具の箍)に替えた。配色も基色を
上着の飴色(樽と同じ色)にし、鉢巻きの黄+房紐の赤を最高彩度の差し色に
した(基色60%+従色30%+差し色10%の目安)。
"""

from __future__ import annotations

import math

# common が bpy を読み込む。mathutils は bpy の読み込み後でないと import できない
import common as C
import parts
import props
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
# 基色(60%): 樽と同じ飴色(明るい黄土)。以前のくすんだ赤茶は主人公なのに
# 画面で一番地味だったため、村の景色(樽色)の主として立つ色に変えた
TUNIC = (0.82, 0.54, 0.20)
# 従色(30%): 灰青のまま(現行維持)
TROUSERS = (0.24, 0.26, 0.34)
BANDANA = (0.88, 0.74, 0.26)
BOOT = (0.30, 0.21, 0.14)
# 差し色(10%、彩度最高点): 鉢巻きの房紐の赤。基色・従色より断然目立たせる
CORD = (0.82, 0.10, 0.08)
# ベルト→タルのたが(金具の箍)。propsの鉄輪と同じ色味で揃える
HOOP = props.BARREL_IRON


def _segment_between(name: str, p0: Vector, p1: Vector, radius: float, segments: int = 8):
    """
    任意の2点(x, y, z)を結ぶ円柱。props._rope_segmentと違いY成分が
    共通でなくてよい(肩ひものように3軸すべてで向きが変わる部品向け)。
    円柱はローカルZ軸方向に伸びる既定の向きで作られるので、
    to_track_quatでその軸をp0→p1の方向へ向け直す。
    """
    direction = p1 - p0
    length = direction.length
    seg = C.cylinder(name, (0.0, 0.0, 0.0), radius, length, segments=segments)
    seg.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    seg.location = (p0 + p1) / 2
    return seg


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

    # 顔の規格(character-design-language.md): 黒目に必ずハイライトを入れ、
    # 口を必ず作る(閉じ口の線でよい)。目は一回り大きくして生気を足した
    # (「大きい部位は1つだけ」の原則は鼻の大きさを維持することで保つ)
    highlight_mat = C.make_material("garudo_eye_highlight", (1.0, 1.0, 1.0),
                                    roughness=0.2, emission=0.4)
    mouth_mat = C.make_material("garudo_mouth", (0.35, 0.16, 0.14), roughness=0.5)

    # まばたき対象(白目・瞳。plan/models/archive/eye-blink-liveliness.md)。
    # join()の対象から外し、armature構築後に頭の骨(neck-head)へ直接つなぐ。
    # ハイライト・眉は表情の飾りで変形の必要が無いため、これまでどおり
    # 本体へ統合する
    eyes = []
    extras = []
    for side in (-1.0, 1.0):
        white = C.uv_sphere(
            f"eyewhite{side}", head + Vector((0.056 * side, -0.116, 0.004)), 0.044,
            segments=16, rings=12, scale=(1.0, 0.70, 1.10),
        )
        C.assign_material(white, eye_white)
        white["blink"] = "white"
        pupil_center = head + Vector((0.060 * side, -0.140, 0.002))
        pupil = C.uv_sphere(
            f"pupil{side}", pupil_center, 0.024,
            segments=14, rings=10, scale=(1.0, 0.7, 1.0),
        )
        C.assign_material(pupil, eye_mat)
        pupil["blink"] = "pupil"
        eyes += [white, pupil]
        # 黒目のハイライト(白点)。両目とも同じ向き(正面から見て左上)に
        # 置くことで、視線が生きて見える
        eye_highlight = C.uv_sphere(
            f"eyehighlight{side}", pupil_center + Vector((0.006 * side, -0.010, 0.010)),
            0.008, segments=8, rings=6,
        )
        C.assign_material(eye_highlight, highlight_mat)
        # 太い眉。表情が出て、上から見たときに顔の向きが分かりやすくなる
        brow = C.box(f"brow{side}", head + Vector((0.057 * side, -0.124, 0.050)),
                     (0.052, 0.020, 0.015), bevel=0.006)
        brow.rotation_euler = (0.0, 0.0, -0.18 * side)
        C.assign_material(brow, eye_mat)
        extras += [eye_highlight, brow]

    # 大きな鼻。ずんぐりした風貌の要
    nose = C.uv_sphere("nose", head + Vector((0.0, -0.146, -0.040)), 0.046,
                       segments=16, rings=12, scale=(0.90, 1.20, 0.85))
    C.assign_material(nose, skin_mat)
    extras.append(nose)

    # 閉じ口の線。鼻のすぐ下、表情の器としてほぼ全キャラ共通で必須にする規約
    mouth = C.box("mouth", head + Vector((0.0, -0.148, -0.086)),
                 (0.028, 0.006, 0.007), bevel=0.003)
    C.assign_material(mouth, mouth_mat)
    extras.append(mouth)

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

    # 房紐(差し色、彩度最高点)。結び目から垂れる赤い紐で、画面上でいちばん
    # 目を引く1色にする(character-design-language.mdの「差し色10%」)
    cord_mat = C.make_material("garudo_cord", CORD, roughness=0.6)
    cord = C.cylinder("bandcord", head + Vector((0.0, 0.168, -0.075)), 0.014, 0.11,
                      segments=8)
    cord.rotation_euler = (0.12, 0.0, 0.0)
    C.assign_material(cord, cord_mat)
    extras.append(cord)
    tassel = C.uv_sphere("bandtassel", head + Vector((0.0, 0.180, -0.128)), 0.022,
                         segments=10, rings=8, scale=(1.0, 1.0, 1.3))
    C.assign_material(tassel, cord_mat)
    extras.append(tassel)

    # ベルト→タルのたが(金具の箍)。design/village-buildings.mdの
    # 「たがの再利用」の作法に合わせ、皮ベルトから金具の箍へ替えた
    hoop_mat = C.make_material("garudo_hoop", HOOP, roughness=0.45, metallic=0.7)
    belt = C.cylinder("belt", Vector((0.0, 0.0, 0.395)), 0.142, 0.045, segments=26)
    C.assign_material(belt, hoop_mat)
    extras.append(belt)
    # たがの鋲。等間隔に小さな突起を並べて、金具らしい情報量を足す
    rivet_count = 10
    for i in range(rivet_count):
        angle = (i / rivet_count) * math.tau
        rivet = C.uv_sphere(
            f"belt_rivet{i}",
            Vector((0.150 * math.cos(angle), 0.150 * math.sin(angle), 0.395)),
            0.014, segments=8, rings=6,
        )
        C.assign_material(rivet, hoop_mat)
        extras.append(rivet)

    # 背負いダル(character-design-language.mdパイロット「樽守りを姿に載せる」)。
    # propsの実物の樽ジオメトリを縮小して流用し、意匠を統一する。肩ひもで
    # 背負う行商の背負い籠のイメージで、シルエットだけで「タルを背負った
    # 少年」と分かる記号にする
    backpack_scale = 0.34
    backpack_height = props.BARREL_HEIGHT * backpack_scale
    backpack_radius = props.BARREL_RADIUS * backpack_scale
    backpack_origin = Vector((0.0, 0.155, 0.33))
    backpack_objs = props.barrel_body(
        "garudo_backpack", props.BARREL_WOOD, props.BARREL_IRON,
        height=backpack_height, radius=backpack_radius,
    )
    backpack_objs.append(props.barrel_lid(
        "garudo_backpack", (0.46, 0.30, 0.17),
        height=backpack_height, radius=backpack_radius,
    ))
    for obj in backpack_objs:
        obj.location += backpack_origin
    extras += backpack_objs

    # 肩ひも。左右の肩から背負いダルの上端へ渡す2本
    strap_mat = C.make_material("garudo_strap", (0.30, 0.20, 0.13), roughness=0.8)
    backpack_top = backpack_origin + Vector((0.0, 0.0, backpack_height))
    for side in (-1.0, 1.0):
        shoulder = Vector(JOINTS[f"shoulder.{'L' if side < 0 else 'R'}"])
        strap = _segment_between(
            f"strap{side}", shoulder + Vector((0.0, -0.02, 0.01)), backpack_top,
            radius=0.016, segments=8,
        )
        C.assign_material(strap, strap_mat)
        extras.append(strap)

    # 右手に なた を握らせる。自動ウェイトで前腕の骨に追従するので、
    # 攻撃モーションでそのまま振り下ろされる
    hand_r = Vector(JOINTS["hand.R"])
    extras += parts.build_hatchet(origin=hand_r + Vector((0.0, -0.01, 0.0)),
                                  scale=0.95, rotation=(-22.0, 0.0, 6.0))

    mesh = C.join([body] + extras, NAME)
    armature = C.build_armature(NAME, JOINTS, BONES, mesh, root="hip")
    for eye in eyes:
        C.parent_to_bone(eye, armature, "neck-head")
    return [mesh, armature] + eyes, armature


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
