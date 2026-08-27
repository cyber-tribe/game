"""
主人公「ガルド」。

確定した2D設定画(design/characters/garudo/generated/garudo-sheet.png、
ユーザー提供)に合わせた3D化。設定画の要点:

- **7頭身(実在の少年相当)の人体比率**。従来の2.5頭身のずんぐり比率は
  ユーザー指示(「設定画段階では等身も人間と同じに」)により廃止。
  頭頂=0.95(タイル1マス=1.0)を7等分した頭身単位で各ランドマークを
  置く(あご=1・胸=2.3・へそ/肘=3.3・股/手首=4.3・膝=5.8・接地=7)。
- **選定案C「樽板エプロン」**: ベルトから膝上まで垂れる樽板の
  エプロン。「膨らみ→くびれ→膨らみ」の輪郭で、黒塗りシルエットでも
  樽らしさが残る。たが(鉄輪)で締める。
- **背負いダル**: 上端が肩越しに覗く高さに背負う。propsの樽
  ジオメトリを縮小流用し、肩ひも2本で吊る。
- 生成りシャツ(肘まで袖をまくる。肘から先は素肌)・深緑のズボン・
  革のブーツ・ミトン状の手袋・短く乱れた茶髪。

Blender では -Y を正面として組む。glTF に書き出すとこれが +Z 正面になり、
Three.js 側で rotation.y = 0 が「南向き」に対応する。
関節名(JOINTS/BONES)とアニメーションの構成は従来のまま維持し、
位置・半径だけを7頭身へ組み替えた。
"""

from __future__ import annotations

import math

# common が bpy を読み込む。mathutils は bpy の読み込み後でないと import できない
import bmesh
import bpy
import common as C
import parts
import props
from mathutils import Vector

NAME = "garudo"

# 頭身単位。全高 0.95 を 7 頭身で割る
HEAD_UNIT = 0.95 / 7.0

# 関節の位置。7頭身のランドマーク(あご=1・肘=3.3・股/手首=4.3・膝=5.8)
# を z に直接置く
JOINTS_HALF = {
    "hip": (0.0, 0.0, 0.42),
    "chest": (0.0, -0.005, 0.70),
    "neck": (0.0, 0.0, 0.80),
    "head": (0.0, -0.005, 0.878),
    "crown": (0.0, 0.0, 0.925),
    "shoulder.L": (0.105, 0.0, 0.775),
    "elbow.L": (0.128, 0.005, 0.502),
    "hand.L": (0.133, -0.02, 0.36),
    "thigh.L": (0.046, 0.0, 0.37),
    "knee.L": (0.049, 0.0, 0.163),
    "foot.L": (0.052, -0.025, 0.030),
}

RADII_HALF = {
    "hip": 0.060,
    "chest": 0.072,
    "neck": 0.022,
    "head": 0.058,
    "crown": 0.038,
    "shoulder.L": 0.026,
    "elbow.L": 0.019,
    "hand.L": 0.021,
    "thigh.L": 0.040,
    "knee.L": 0.029,
    "foot.L": 0.026,
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

# 配色は設定画から採る
SKIN = (0.85, 0.66, 0.48)
SHIRT = (0.88, 0.83, 0.72)      # 生成りのシャツ
TROUSERS = (0.25, 0.28, 0.18)   # 深緑のズボン
BOOT = (0.38, 0.25, 0.14)       # 革のブーツ
GLOVE = (0.32, 0.21, 0.12)      # ミトン状の手袋
HAIR = (0.25, 0.16, 0.09)       # 短い茶髪
BELT = (0.30, 0.19, 0.11)       # 革ベルト
APRON_WOOD = props.BARREL_WOOD  # 樽板エプロン(実物の樽と同色で統一)
HOOP = props.BARREL_IRON        # たが(鉄輪)


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


def _sculpt_bump(mesh: "bpy.types.Mesh", target: Vector, radius: float, push: float,
                 inset: float = 0.35) -> None:
    """
    メッシュ上で`target`に近い面をinsetし、法線方向へ`push`だけ押し出す
    (pushを負にするとくぼみになる)。鼻の膨らみ・眼窩や口のくぼみを、
    別メッシュのプリミティブを貼り付けるのではなく頭部メッシュ自身の
    凹凸として作る(plan/models/archive/flagship-model-program.md)。
    """
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    faces = [f for f in bm.faces if (f.calc_center_median() - target).length < radius]
    if not faces:
        bm.free()
        return
    bmesh.ops.inset_region(bm, faces=faces, thickness=radius * inset, use_boundary=True)
    verts = list({v for f in faces for v in f.verts})
    normal = sum((f.normal for f in faces), Vector()).normalized()
    bmesh.ops.translate(bm, verts=verts, vec=normal * push)
    bmesh.ops.smooth_vert(bm, verts=verts, factor=0.4, use_axis_x=True, use_axis_y=True,
                          use_axis_z=True)
    bm.to_mesh(mesh)
    bm.free()


def _cone_at(name: str, origin: Vector, direction: Vector, radius: float, length: float,
             segments: int = 5):
    """
    原点でconeを作り、directionへ向けてからoriginへ置く(cone()はワールド
    座標をメッシュへ焼き込むため、先に位置を焼くと回転が原点を軸に
    回ってしまう。_segment_betweenと同じ順序)。髪の房・フリンジ用。
    """
    tuft = C.cone(name, (0.0, 0.0, 0.0), radius, 0.004, length, segments=segments)
    tuft.rotation_euler = direction.normalized().to_track_quat("Z", "Y").to_euler()
    tuft.location = origin
    return tuft


def build() -> tuple[list, object]:
    body = C.build_skinned(NAME, JOINTS, BONES, RADII, root="hip", subsurf=2)

    # 顔の彫り込み(眼窩のくぼみ・鼻の膨らみ・口のくぼみ)。7頭身の
    # 小さな頭(subsurf後の実表面は半径約0.048)に合わせて置き直した
    head = Vector(JOINTS["head"])
    for side in (-1.0, 1.0):
        _sculpt_bump(body.data, head + Vector((0.019 * side, -0.042, 0.004)), 0.020, -0.005)
    _sculpt_bump(body.data, head + Vector((0.0, -0.048, -0.006)), 0.015, 0.009, inset=0.45)
    _sculpt_bump(body.data, head + Vector((0.0, -0.046, -0.030)), 0.011, -0.005)

    mats = [
        C.make_material("garudo_skin", SKIN, roughness=0.65),
        C.make_material("garudo_shirt", SHIRT, roughness=0.85),
        C.make_material("garudo_trousers", TROUSERS, roughness=0.85),
        C.make_material("garudo_boot", BOOT, roughness=0.7),
    ]
    C.assign_materials_by_region(body, mats, classify_body)
    shirt_mat = mats[1]
    boot_mat = mats[3]

    # 目。まばたき対象(白目・瞳)は別メッシュのままarmature構築後に
    # 頭の骨へつなぐ(plan/models/archive/eye-blink-liveliness.md)。
    # 設定画の目は写実頭身に合わせた中サイズ。顔の面に浅く貼りつく
    # 「描き目」の作法(奥行きYを浅く)は維持する
    eye_mat = C.make_material("garudo_eye", (0.20, 0.12, 0.07), roughness=0.25)
    eye_white = C.make_material("garudo_eyewhite", (0.95, 0.95, 0.93), roughness=0.3)
    highlight_mat = C.make_material("garudo_eye_highlight", (1.0, 1.0, 1.0),
                                    roughness=0.2, emission=0.4)
    mouth_mat = C.make_material("garudo_mouth", (0.35, 0.16, 0.14), roughness=0.5)
    hair_mat = C.make_material("garudo_hair", HAIR, roughness=0.9)

    eyes = []
    extras = []
    for side in (-1.0, 1.0):
        # subsurf後の頭の実表面(半径約0.048)に浅く貼りつく位置に置く。
        # 外へ出しすぎると出目金のように突き出るため、yはかなり浅め
        white = C.uv_sphere(
            f"eyewhite{side}", head + Vector((0.019 * side, -0.040, 0.004)), 0.014,
            segments=8, rings=6, scale=(1.25, 0.28, 1.05),
        )
        C.assign_material(white, eye_white)
        white["blink"] = "white"
        pupil_center = head + Vector((0.020 * side, -0.045, 0.003))
        pupil = C.uv_sphere(
            f"pupil{side}", pupil_center, 0.008,
            segments=6, rings=5, scale=(1.0, 0.5, 1.0),
        )
        C.assign_material(pupil, eye_mat)
        pupil["blink"] = "pupil"
        eyes += [white, pupil]
        eye_highlight = C.uv_sphere(
            f"eyehighlight{side}", pupil_center + Vector((0.0025 * side, -0.003, 0.0035)),
            0.003, segments=4, rings=3,
        )
        C.assign_material(eye_highlight, highlight_mat)
        # 眉。設定画のきりっとした直線気味の眉
        brow = C.box(f"brow{side}", head + Vector((0.020 * side, -0.044, 0.020)),
                     (0.021, 0.006, 0.005))
        brow.rotation_euler = (0.0, 0.0, -0.15 * side)
        C.assign_material(brow, hair_mat)
        extras += [eye_highlight, brow]

    # 閉じ口の線。彫り込んだくぼみへ浅く沈めて収める
    mouth = C.box("mouth", head + Vector((0.0, -0.044, -0.030)),
                  (0.013, 0.004, 0.004))
    C.assign_material(mouth, mouth_mat)
    extras.append(mouth)

    # 髪。設定画の「短く乱れた茶髪」: 頭の上半分を覆うキャップ+
    # 額に垂れる前髪の房+頭頂の跳ねの房。旧デザインのスパイク状の
    # 房・髪紐は使わない
    hair_cap = C.uv_sphere("hair_cap", head + Vector((0.0, 0.010, 0.016)), 0.061,
                           segments=8, rings=7, scale=(1.06, 1.02, 0.96))
    C.assign_material(hair_cap, hair_mat)
    extras.append(hair_cap)
    fringe_specs = [
        # (額のどの位置から, どの向きへ垂れるか, 長さ)
        (Vector((-0.030, -0.044, 0.040)), Vector((-0.25, -0.45, -0.85)), 0.034),
        (Vector((0.000, -0.048, 0.042)), Vector((0.05, -0.45, -0.88)), 0.037),
        (Vector((0.030, -0.044, 0.040)), Vector((0.28, -0.45, -0.83)), 0.034),
        # 頭頂の跳ね(乱れた印象)
        (Vector((-0.022, 0.012, 0.056)), Vector((-0.35, 0.15, 0.92)), 0.036),
        (Vector((0.026, 0.004, 0.056)), Vector((0.40, -0.05, 0.90)), 0.033),
    ]
    for i, (offset, direction, length) in enumerate(fringe_specs):
        tuft = _cone_at(f"hair_tuft{i}", head + offset, direction, 0.013, length)
        C.assign_material(tuft, hair_mat)
        extras.append(tuft)

    pinned_parts = []

    # ベルト+バックル。樽板エプロンを吊る腰の革帯
    belt_mat = C.make_material("garudo_belt", BELT, roughness=0.75)
    hoop_mat = C.make_material("garudo_hoop", HOOP, roughness=0.45, metallic=0.7)
    belt = C.cylinder("garudo_belt", (0.0, 0.0, 0.455), 0.068, 0.035, segments=8)
    C.assign_material(belt, belt_mat)
    C.mark_for_pin(belt)
    pinned_parts.append((belt.name, "hip-chest"))
    extras.append(belt)
    buckle = C.box("garudo_buckle", (0.0, -0.068, 0.455), (0.020, 0.008, 0.018))
    C.assign_material(buckle, hoop_mat)
    C.mark_for_pin(buckle)
    pinned_parts.append((buckle.name, "hip-chest"))
    extras.append(buckle)

    # 樽板エプロン(設定画の選定案C)。ベルトから膝上まで垂れる
    # 樽板のスカートで、輪郭が「膨らみ→くびれ→膨らみ」になるよう
    # 切頭円錐を4段積む(C.cylinderは上下2リングしか持たず縦方向の
    # プロファイル変形が効かないため)。フラットシェーディングの
    # 低ポリ面がそのまま板張りに見える。色を消した黒塗りシルエット
    # でも樽らしい凹凸が輪郭に残る、という設定画の意図をそのまま持つ
    apron_mat = C.make_material("garudo_apron_wood", APRON_WOOD, roughness=0.85)
    # (上端z, 半径)の列。上から: ベルト位置で絞る→上の膨らみ→
    # くびれ→下の膨らみ→裾でわずかに絞る
    apron_profile = [
        (0.440, 0.072),
        (0.373, 0.100),
        (0.308, 0.080),
        (0.229, 0.096),
        (0.200, 0.090),
    ]
    for i in range(len(apron_profile) - 1):
        z_hi, r_hi = apron_profile[i]
        z_lo, r_lo = apron_profile[i + 1]
        seg = C.cone(f"garudo_apron{i}", (0.0, 0.0, (z_hi + z_lo) / 2),
                     r_lo, r_hi, z_hi - z_lo, segments=8)
        for poly in seg.data.polygons:
            poly.use_smooth = False
        # 段同士の継ぎ目に埋まって見えないふた面を削る(最上段の上面と
        # 最下段の底面だけ残す)
        bm = bmesh.new()
        bm.from_mesh(seg.data)
        hidden = [f for f in bm.faces
                  if (f.normal.z > 0.9 and i != 0) or (f.normal.z < -0.9 and i != 3)]
        bmesh.ops.delete(bm, geom=hidden, context="FACES")
        bm.to_mesh(seg.data)
        bm.free()
        C.assign_material(seg, apron_mat)
        C.mark_for_pin(seg)
        pinned_parts.append((seg.name, "hip-chest"))
        extras.append(seg)
    # たが(鉄輪)2段。エプロンの輪郭の境界(膨らみの肩)に締める
    for i, (hoop_z, hoop_r) in enumerate(((0.373, 0.100), (0.229, 0.096))):
        hoop = C.cylinder(f"garudo_apron_hoop{i}", (0.0, 0.0, hoop_z),
                          hoop_r + 0.004, 0.014, segments=8)
        C.assign_material(hoop, hoop_mat)
        C.mark_for_pin(hoop)
        pinned_parts.append((hoop.name, "hip-chest"))
        extras.append(hoop)

    # 襟(丸首)と、肘までまくった袖口。シャツの立体感を出す最小限の部品
    collar = C.cylinder("garudo_collar", (0.0, 0.0, 0.782), 0.030, 0.028, segments=8)
    C.assign_material(collar, shirt_mat)
    C.mark_for_pin(collar)
    pinned_parts.append((collar.name, "chest-neck"))
    extras.append(collar)
    for tag in ("L", "R"):
        shoulder = Vector(JOINTS[f"shoulder.{tag}"])
        elbow = Vector(JOINTS[f"elbow.{tag}"])
        direction = (elbow - shoulder).normalized()
        cuff = C.cylinder(f"garudo_cuff{tag}", (0.0, 0.0, 0.0), 0.024, 0.030, segments=6)
        cuff.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
        cuff.location = elbow - direction * 0.025
        C.assign_material(cuff, shirt_mat)
        C.mark_for_pin(cuff)
        pinned_parts.append((cuff.name, f"shoulder.{tag}-elbow.{tag}"))
        extras.append(cuff)

    # ミトン状の手袋(設定画: 濃茶の作業用ミトン)。前腕の骨へ剛体固定
    for tag in ("L", "R"):
        hand = Vector(JOINTS[f"hand.{tag}"])
        mitten = C.uv_sphere(f"garudo_mitten{tag}", hand, 0.028,
                             segments=6, rings=5, scale=(1.10, 1.0, 1.25))
        C.assign_material(mitten, C.make_material(f"garudo_glove_{tag}", GLOVE,
                                                  roughness=0.75))
        C.mark_for_pin(mitten)
        pinned_parts.append((mitten.name, f"elbow.{tag}-hand.{tag}"))
        extras.append(mitten)

    # ブーツの履き口+つま先。塗り分けだけでは筒にしか見えないため、
    # 履き口の段差とつま先の膨らみで「靴を履いている」輪郭を作る
    for tag in ("L", "R"):
        foot = Vector(JOINTS[f"foot.{tag}"])
        cuff_top = C.cylinder(f"garudo_bootcuff{tag}", (foot.x, 0.0, 0.098), 0.034,
                              0.040, segments=6)
        C.assign_material(cuff_top, boot_mat)
        C.mark_for_pin(cuff_top)
        pinned_parts.append((cuff_top.name, f"knee.{tag}-foot.{tag}"))
        extras.append(cuff_top)
        toe = C.uv_sphere(f"garudo_boottoe{tag}", foot + Vector((0.0, -0.022, -0.006)),
                          0.026, segments=6, rings=5, scale=(1.05, 1.5, 0.75))
        C.assign_material(toe, boot_mat)
        C.mark_for_pin(toe)
        pinned_parts.append((toe.name, f"knee.{tag}-foot.{tag}"))
        extras.append(toe)

    # 背負いダル(設定画: 上端が肩越しに覗く)。propsの実物の樽
    # ジオメトリを縮小流用し、上端が肩の高さ(z≈0.82)へ来るよう背中の
    # 上部に背負わせる。設定画に合わせて心持ち左肩(+X)側へ寄せる。
    # 体格が7頭身で細くなったぶん、樽も体の幅を超えない小ぶりに抑える
    backpack_height = 0.19
    backpack_radius = 0.055
    backpack_origin = Vector((0.025, 0.078, 0.60))
    barrel_parts = props.barrel_body(
        "garudo_backpack", props.BARREL_WOOD, props.BARREL_IRON,
        height=backpack_height, radius=backpack_radius,
    )
    # 胴だけ流用する。propsのたが(14分割×3本)は小さな樽には過剰なので、
    # リストから外すだけでなくシーンからも消す(残すと原点に置き去りの
    # まま描画・出力されてしまう)
    backpack_objs = barrel_parts[:1]
    for leftover in barrel_parts[1:]:
        bpy.data.objects.remove(leftover, do_unlink=True)
    for i, t in enumerate((0.22, 0.78)):
        bhoop = C.cylinder(f"garudo_backpack_hoop{i}", (0.0, 0.0, backpack_height * t),
                           backpack_radius + 0.006, 0.014, segments=8)
        C.assign_material(bhoop, hoop_mat)
        backpack_objs.append(bhoop)
    backpack_objs.append(props.barrel_lid(
        "garudo_backpack", (0.46, 0.30, 0.17),
        height=backpack_height, radius=backpack_radius,
    ))
    for obj in backpack_objs:
        obj.location += backpack_origin
    extras += backpack_objs

    # 肩ひも。左右の肩から背負いダルの上端へ渡す2本
    strap_mat = C.make_material("garudo_strap", BELT, roughness=0.8)
    backpack_top = backpack_origin + Vector((0.0, 0.0, backpack_height * 0.9))
    for side in (-1.0, 1.0):
        shoulder = Vector(JOINTS[f"shoulder.{'L' if side < 0 else 'R'}"])
        strap = _segment_between(
            f"strap{side}", shoulder + Vector((0.0, -0.012, 0.008)), backpack_top,
            radius=0.010, segments=6,
        )
        C.assign_material(strap, strap_mat)
        extras.append(strap)

    # 右手に なた。自動ウェイトで前腕の骨に追従する
    hand_r = Vector(JOINTS["hand.R"])
    extras += parts.build_hatchet(origin=hand_r + Vector((0.0, -0.01, 0.0)),
                                  scale=0.7, rotation=(-22.0, 0.0, 6.0))

    mesh = C.join([body] + extras, NAME)
    armature = C.build_armature(NAME, JOINTS, BONES, mesh, root="hip")
    for eye in eyes:
        C.parent_to_bone(eye, armature, "neck-head")
    for group_name, bone in pinned_parts:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature] + eyes, armature


def classify_body(center) -> int:
    """
    面の位置から 肌0 / シャツ1 / ズボン2 / 靴3 を決める。
    7頭身のランドマーク: 肘=z0.50(袖まくりの境界)・ベルト=z0.44・
    ブーツ上端=z0.085。腕は|x|で胴と見分ける(脚の最大張り出しは
    x≈0.086なので、それより外の低い位置は腕・手)。
    """
    z = center.z
    x = abs(center.x)

    if z < 0.085:
        return 3  # 靴
    if x > 0.095 and z > 0.30:
        return 1 if z > 0.50 else 0  # 腕: 肘から上は袖(シャツ)、下は素肌
    if z > 0.80:
        return 0  # 首から上
    if z > 0.41:
        return 1  # シャツ
    return 2  # ズボン


# ---------------------------------------------------------------- アニメーション

def animations() -> list[tuple[str, list]]:
    """
    待機・歩行・攻撃・被弾・消滅の5クリップ。角度は度で指定する。

    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間による鋭い動き)・頭の遅れ追従(二次揺れ)を
    足してある。骨名は7頭身化の前後で変えていないため、クリップの
    構成は従来のまま使える(角度は骨の回転なので比率に依存しない)。
    """
    hipc = "hip-chest"
    spine = "chest-neck"
    neck = "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"

    # 頭は胴より遅れて同じ動きを追いかける(二次揺れ)。遅延フレーム数は
    # 頭(neck-head)の長さを胴の基準長(hip-chest)で割った比から決める
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

    # 4フェーズ(接地・沈み込み・通過・蹴り出し、plan/models/archive/
    # garudo-walk-motion.md)。接地の瞬間は前脚をほぼ伸ばし、通過の
    # 瞬間に遊脚側の膝を大きく曲げて前へ運ぶ
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
    C.export_glb(NAME, objs, flat=True)
    print("done")
