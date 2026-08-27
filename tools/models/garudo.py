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
    "shoulder.L": (0.100, 0.0, 0.748),
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
    """原点でconeを作り、directionへ向けてからoriginへ置く(鼻など小部品用)。"""
    tuft = C.cone(name, (0.0, 0.0, 0.0), radius, 0.004, length, segments=segments)
    tuft.rotation_euler = direction.normalized().to_track_quat("Z", "Y").to_euler()
    tuft.location = origin
    return tuft


def _lock(name: str, points, radii, resolution: int = 4, bevel_resolution: int = 1):
    """
    ベジェカーブ+点ごとの半径テーパーで作る「房」。直線の円錐と違い、
    自然に曲がりながら先細る(髪の房・眉・まぶたの線に使う)。
    curve.bevel_depth=1.0 とし、実際の太さは各制御点の radius で与える。
    ハンドルはAUTOで滑らかに繋ぎ、メッシュへ変換して返す。
    """
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 1.0
    curve.bevel_resolution = bevel_resolution
    curve.resolution_u = resolution
    curve.fill_mode = "FULL"
    curve.use_fill_caps = True
    sp = curve.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, co, r in zip(sp.bezier_points, points, radii):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.radius = r
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    C.activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def _slope_shoulders(obj, start_z: float = 0.68, span: float = 0.09,
                     drop: float = 0.032, half_width: float = 0.087) -> None:
    """
    胴・袖の上部頂点を、中心から外側ほど・上ほど下げて「なで肩」の
    斜線を作る(水平リングのロフトだけでは肩が四角い棚になるため)。
    """
    for v in obj.data.vertices:
        if v.co.z > start_z:
            t = min((v.co.z - start_z) / span, 1.0)
            lateral = min(abs(v.co.x) / half_width, 1.0)
            v.co.z -= t * (lateral ** 1.3) * drop


def build() -> tuple[list, object]:
    skin_mat = C.make_material("garudo_skin", SKIN, roughness=0.65)
    shirt_mat = C.make_material("garudo_shirt", SHIRT, roughness=0.85)
    trousers_mat = C.make_material("garudo_trousers", TROUSERS, roughness=0.85)
    boot_mat = C.make_material("garudo_boot", BOOT, roughness=0.7)
    sole_mat = C.make_material("garudo_sole", (0.24, 0.15, 0.09), roughness=0.8)
    glove_mat = C.make_material("garudo_glove", GLOVE, roughness=0.75)
    hair_mat = C.make_material("garudo_hair", HAIR, roughness=0.9)
    belt_mat = C.make_material("garudo_belt", BELT, roughness=0.75)
    hoop_mat = C.make_material("garudo_hoop", HOOP, roughness=0.45, metallic=0.7)
    apron_mat = C.make_material("garudo_apron_wood", APRON_WOOD, roughness=0.85)
    eye_mat = C.make_material("garudo_eye", (0.30, 0.17, 0.09), roughness=0.25)
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
    head_obj = add(_loft("garudo_head", [
        (0.812, 0.016, 0.020, 0.0, -0.006),
        (0.824, 0.036, 0.042, 0.0, -0.006),
        (0.845, 0.049, 0.055, 0.0, -0.005),
        (0.870, 0.054, 0.058, 0.0, -0.004),
        (0.900, 0.052, 0.056, 0.0, -0.003),
        (0.928, 0.043, 0.048, 0.0, -0.001),
        (0.948, 0.020, 0.026, 0.0, 0.0),
    ]), skin_mat)
    # 頬のふくらみ: あごと目の間・前寄りの頂点を法線方向へ少し押す
    # (設定画の少年らしい丸い頬)
    for v in head_obj.data.vertices:
        if 0.832 < v.co.z < 0.872 and v.co.y < -0.015 and abs(v.co.x) > 0.012:
            t_z = 1.0 - abs(v.co.z - 0.852) / 0.020
            if t_z > 0.0:
                factor = 1.0 + 0.05 * min(t_z, 1.0)
                v.co.x *= factor
                v.co.y = (v.co.y + 0.005) * factor - 0.005

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
        add(ear, skin_mat, pin_bone="neck-head")

    # ---- 髪。土台の塊(スカルプ)+ベジェカーブの房 ----
    # 設定画の髪は円錐スパイクではなく、曲がりながら先細る房の集まり。
    # _lock(カーブ+半径テーパー)で、前髪・こめかみ・頭頂・襟足を
    # 1房ずつ流れの向きを変えて重ねる
    add(_loft("garudo_hair_scalp", [
        (0.848, 0.058, 0.060, 0.0, 0.014),
        (0.880, 0.066, 0.066, 0.0, 0.010),
        (0.912, 0.068, 0.064, 0.0, 0.004),
        (0.945, 0.055, 0.056, 0.0, 0.002),
        (0.964, 0.032, 0.036, 0.0, 0.0),
    ], cap_bottom=True), hair_mat, pin_bone="neck-head")
    lock_specs = [
        # 前髪: 額に沿って6本、根元は生え際、先は眉の上へ垂れて左右へ流す
        ([(-0.050, -0.026, 0.914), (-0.058, -0.048, 0.896), (-0.050, -0.058, 0.872)],
         [0.017, 0.0145, 0.003]),
        ([(-0.030, -0.034, 0.918), (-0.038, -0.056, 0.898), (-0.030, -0.063, 0.876)],
         [0.018, 0.0145, 0.003]),
        ([(-0.008, -0.038, 0.920), (-0.012, -0.060, 0.900), (-0.004, -0.065, 0.880)],
         [0.018, 0.0155, 0.003]),
        ([(0.012, -0.038, 0.920), (0.018, -0.059, 0.899), (0.026, -0.064, 0.878)],
         [0.018, 0.0145, 0.003]),
        ([(0.032, -0.032, 0.917), (0.042, -0.054, 0.897), (0.050, -0.058, 0.875)],
         [0.017, 0.0145, 0.003]),
        ([(0.050, -0.024, 0.912), (0.060, -0.042, 0.894), (0.058, -0.048, 0.870)],
         [0.016, 0.0125, 0.003]),
        # こめかみ: 耳の上へ被さる横毛
        ([(-0.052, -0.006, 0.908), (-0.068, -0.014, 0.888), (-0.064, -0.018, 0.862)],
         [0.015, 0.012, 0.003]),
        ([(0.052, -0.006, 0.908), (0.068, -0.014, 0.888), (0.064, -0.018, 0.862)],
         [0.015, 0.012, 0.003]),
        # 頭頂: スカルプに沿って外へ流れ、先端だけ軽く跳ねる
        ([(-0.030, 0.004, 0.936), (-0.048, 0.004, 0.950), (-0.062, 0.000, 0.938)],
         [0.017, 0.013, 0.003]),
        ([(-0.010, 0.012, 0.942), (-0.022, 0.014, 0.960), (-0.036, 0.012, 0.955)],
         [0.018, 0.014, 0.003]),
        ([(0.012, 0.012, 0.942), (0.024, 0.012, 0.960), (0.038, 0.008, 0.953)],
         [0.018, 0.014, 0.003]),
        ([(0.032, 0.002, 0.934), (0.052, 0.002, 0.948), (0.064, -0.002, 0.936)],
         [0.017, 0.013, 0.003]),
        # 後頭部〜襟足: 下へ流れる
        ([(-0.026, 0.028, 0.928), (-0.038, 0.054, 0.902), (-0.032, 0.058, 0.868)],
         [0.017, 0.014, 0.003]),
        ([(0.000, 0.034, 0.930), (0.002, 0.062, 0.900), (0.000, 0.064, 0.862)],
         [0.018, 0.015, 0.003]),
        ([(0.026, 0.028, 0.928), (0.038, 0.054, 0.902), (0.032, 0.058, 0.868)],
         [0.017, 0.014, 0.003]),
        # 後頭部の側面(横後ろのボリューム)
        ([(-0.046, 0.022, 0.912), (-0.060, 0.036, 0.888), (-0.054, 0.042, 0.860)],
         [0.015, 0.012, 0.003]),
        ([(0.046, 0.022, 0.912), (0.060, 0.036, 0.888), (0.054, 0.042, 0.860)],
         [0.015, 0.012, 0.003]),
        # うなじの短い房
        ([(-0.012, 0.048, 0.880), (-0.016, 0.058, 0.862), (-0.012, 0.058, 0.844)],
         [0.013, 0.010, 0.003]),
        ([(0.012, 0.048, 0.880), (0.016, 0.058, 0.862), (0.012, 0.058, 0.844)],
         [0.013, 0.010, 0.003]),
    ]
    for i, (pts, radii) in enumerate(lock_specs):
        add(_lock(f"garudo_hair_lock{i}", [Vector(p) for p in pts], radii), hair_mat,
            pin_bone="neck-head")

    # ---- 顔の造作 ----
    # 眉: 曲がりながら先細る太めの房(箱よりも描いた眉に近い)
    for s in (-1.0, 1.0):
        brow = _lock(f"garudo_brow{s}",
                     [Vector((0.010 * s, -0.0575, 0.9035)),
                      Vector((0.024 * s, -0.0605, 0.9060)),
                      Vector((0.037 * s, -0.0560, 0.9010))],
                     [0.0040, 0.0050, 0.0018])
        add(brow, hair_mat, pin_bone="neck-head")
        # 上まぶたの線: 目の上縁を縁取る細い線。目が「顔に描かれている」
        # 印象を決める要(設定画のくっきりした目の再現)
        lid = _lock(f"garudo_lid{s}",
                    [Vector((0.008 * s, -0.0585, 0.8900)),
                     Vector((0.023 * s, -0.0625, 0.8932)),
                     Vector((0.037 * s, -0.0570, 0.8882))],
                    [0.0024, 0.0032, 0.0016])
        add(lid, C.make_material("garudo_lidline", (0.16, 0.10, 0.07), roughness=0.6),
            pin_bone="neck-head")
    nose = _cone_at("garudo_nose", Vector((0.0, -0.058, 0.864)),
                    Vector((0.0, -0.9, -0.35)), 0.008, 0.017)
    add(nose, skin_mat, pin_bone="neck-head")
    mouth = _lock("garudo_mouth",
                  [Vector((-0.012, -0.0575, 0.8365)),
                   Vector((0.000, -0.0590, 0.8355)),
                   Vector((0.012, -0.0575, 0.8365))],
                  [0.0016, 0.0022, 0.0016])
    add(mouth, mouth_mat, pin_bone="neck-head")

    # まばたき対象(白目・瞳)は本体へjoinせず、後で頭の骨へ剛体接続する
    # (plan/models/archive/eye-blink-liveliness.md)。設定画の目は
    # 大きめの虹彩がはっきり見える描き目: 白目(アーモンド形)+
    # 大きな虹彩(こげ茶)+ハイライト
    eyes = []
    for s in (-1.0, 1.0):
        white = C.uv_sphere(f"eyewhite{s}", Vector((0.022 * s, -0.0570, 0.881)), 0.017,
                            segments=8, rings=6, scale=(1.20, 0.30, 1.30))
        C.assign_material(white, eyewhite_mat)
        white["blink"] = "white"
        pupil = C.uv_sphere(f"pupil{s}", Vector((0.023 * s, -0.0620, 0.880)), 0.0120,
                            segments=8, rings=6, scale=(1.0, 0.45, 1.25))
        C.assign_material(pupil, eye_mat)
        pupil["blink"] = "pupil"
        eyes += [white, pupil]
        highlight = C.uv_sphere(f"garudo_eyehl{s}",
                                Vector((0.0195 * s, -0.0685, 0.885)), 0.0042,
                                segments=6, rings=4)
        add(highlight, highlight_mat, pin_bone="neck-head")

    # ---- 胴(シャツ)。肩幅があり、胸で最も広く、ベルトへ絞る ----
    add(_loft("garudo_torso", [
        (0.438, 0.073, 0.054, 0.0, 0.0),
        (0.500, 0.076, 0.055, 0.0, 0.0),
        (0.580, 0.081, 0.057, 0.0, -0.002),
        (0.660, 0.086, 0.060, 0.0, -0.004),
        (0.706, 0.086, 0.060, 0.0, -0.004),
        (0.728, 0.080, 0.056, 0.0, -0.003),
        (0.744, 0.068, 0.050, 0.0, -0.002),
        (0.758, 0.047, 0.040, 0.0, -0.001),
        (0.770, 0.027, 0.026, 0.0, 0.0),
    ]), shirt_mat)
    _slope_shoulders(parts_list[-1])

    # ---- 襟の縁(丸首のリム) ----
    add(_loft("garudo_collar_rim", [
        (0.762, 0.031, 0.029, 0.0, 0.0),
        (0.770, 0.034, 0.031, 0.0, 0.0),
        (0.778, 0.031, 0.029, 0.0, 0.0),
    ], segments=12), shirt_mat)

    # ---- 袖(肩〜肘。まくり口の膨らみで終わる)+前腕(素肌)+ミトン ----
    for s in (-1.0, 1.0):
        add(_loft(f"garudo_sleeve{s}", [
            (0.492, 0.035, 0.035, 0.111 * s, 0.004),
            (0.516, 0.037, 0.037, 0.110 * s, 0.004),
            (0.528, 0.030, 0.030, 0.110 * s, 0.004),
            (0.600, 0.031, 0.031, 0.107 * s, 0.003),
            (0.680, 0.033, 0.033, 0.104 * s, 0.002),
            (0.718, 0.035, 0.035, 0.101 * s, 0.0),
            (0.738, 0.034, 0.034, 0.098 * s, 0.0),
            (0.752, 0.026, 0.027, 0.094 * s, 0.0),
            (0.760, 0.012, 0.013, 0.090 * s, 0.0),
        ], segments=12), shirt_mat)
        _slope_shoulders(parts_list[-1])
        fold = C.cylinder(f"garudo_cuff_fold{s}", (0.0, 0.0, 0.0), 0.0385, 0.010,
                          segments=12)
        fold.location = Vector((0.110 * s, 0.004, 0.505))
        add(fold, shirt_mat)
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
        wrist_cuff = C.cylinder(f"garudo_glove_cuff{tag}", (0.0, 0.0, 0.0), 0.0255,
                                0.012, segments=10)
        wrist_cuff.location = Vector((0.1155 * s, -0.0135, 0.365))
        add(wrist_cuff, glove_mat, pin_bone=f"elbow.{tag}-hand.{tag}")

    # ---- ベルト+バックル ----
    add(_loft("garudo_belt", [
        (0.435, 0.084, 0.062, 0.0, 0.0),
        (0.478, 0.084, 0.062, 0.0, 0.0),
    ]), belt_mat, pin_bone="hip-chest")
    add(C.box("garudo_buckle", (0.0, -0.064, 0.457), (0.024, 0.007, 0.022)),
        hoop_mat, pin_bone="hip-chest")
    for i, trim_z in enumerate((0.4375, 0.4755)):
        trim = _loft(f"garudo_belt_trim{i}", [
            (trim_z - 0.004, 0.0845, 0.0625, 0.0, 0.0),
            (trim_z + 0.004, 0.0845, 0.0625, 0.0, 0.0),
        ], segments=12)
        add(trim, sole_mat, pin_bone="hip-chest")

    # ---- 樽板エプロン(膨らみ→くびれ→膨らみ)+たが2段 ----
    apron_profile = [
        (0.435, 0.086),
        (0.372, 0.116),
        (0.300, 0.094),
        (0.226, 0.110),
        (0.192, 0.100),
    ]
    apron_mat_dark = C.make_material(
        "garudo_apron_wood_dark",
        tuple(c * 0.90 for c in APRON_WOOD), roughness=0.85)

    def plank_index(x: float, y: float) -> int:
        return int((math.atan2(y, x) + math.tau) / (math.tau / 12)) % 12

    def alternate_planks(obj, dark_mat) -> None:
        """側面の板(面法線が水平寄り)を1枚おきに暗いトーンにする。"""
        obj.data.materials.append(dark_mat)
        for poly in obj.data.polygons:
            if abs(poly.normal.z) < 0.7:
                cx = sum(obj.data.vertices[v].co.x for v in poly.vertices) / len(poly.vertices)
                cy = sum(obj.data.vertices[v].co.y for v in poly.vertices) / len(poly.vertices)
                if plank_index(cx, cy) % 2 == 1:
                    poly.material_index = 1

    def plank_jitter(x: float, y: float) -> float:
        """頂点の角度から板(12分割)の番号を求め、板ごとに固有の
        半径ゆらぎを返す。全段で同じ関数を使うため、段をまたいでも
        同じ板は同じだけ張り出し、縦板1枚として繋がって見える。"""
        plank = int((math.atan2(y, x) + math.tau) / (math.tau / 12)) % 12
        return 1.0 + 0.013 * math.sin(plank * 12.9898 + 4.1414)

    for i in range(len(apron_profile) - 1):
        z_hi, r_hi = apron_profile[i]
        z_lo, r_lo = apron_profile[i + 1]
        seg = C.cone(f"garudo_apron{i}", (0.0, 0.0, (z_hi + z_lo) / 2),
                     r_lo, r_hi, z_hi - z_lo, segments=12)
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
        # 手仕事の板張りに見せる: 板ごとの張り出しゆらぎ+裾の不揃い
        for v in seg.data.vertices:
            f = plank_jitter(v.co.x, v.co.y)
            v.co.x *= f
            v.co.y *= f
            if i == 3 and v.co.z < z_lo + 0.004:
                v.co.z += 0.007 * math.sin(
                    int((math.atan2(v.co.y, v.co.x) + math.tau) / (math.tau / 12))
                    * 7.13 + 1.7)
        add(seg, apron_mat, pin_bone="hip-chest")
        alternate_planks(seg, apron_mat_dark)
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
        knee_fold = C.cylinder(f"garudo_knee_fold{s}", (0.0, 0.0, 0.0), 0.0455, 0.009,
                               segments=12)
        knee_fold.location = Vector((0.056 * s, 0.0, 0.172))
        add(knee_fold, trousers_mat)

    # ---- ブーツ(甲・つま先・靴底の実体形状) ----
    for s in (-1.0, 1.0):
        tag = "L" if s > 0 else "R"
        add(_loft(f"garudo_boot{tag}", [
            (0.008, 0.033, 0.055, 0.057 * s, -0.018),
            (0.014, 0.035, 0.058, 0.057 * s, -0.018),
            (0.028, 0.034, 0.052, 0.057 * s, -0.016),
            (0.050, 0.033, 0.040, 0.057 * s, -0.006),
            (0.085, 0.034, 0.037, 0.057 * s, 0.0),
            (0.130, 0.035, 0.037, 0.056 * s, 0.0),
        ], segments=12), boot_mat, pin_bone=f"knee.{tag}-foot.{tag}")
        # 履き口の折り返しカフ(設定画のブーツ上端の段)
        add(_loft(f"garudo_bootcuff{tag}", [
            (0.112, 0.037, 0.039, 0.056 * s, 0.0),
            (0.132, 0.038, 0.040, 0.056 * s, 0.0),
            (0.140, 0.035, 0.037, 0.056 * s, 0.0),
        ], segments=12), sole_mat, pin_bone=f"knee.{tag}-foot.{tag}")
        # 靴底: 本体より一回り張り出す濃色のリム(設定画の底の段差)
        add(_loft(f"garudo_sole{tag}", [
            (0.000, 0.036, 0.061, 0.057 * s, -0.018),
            (0.009, 0.037, 0.062, 0.057 * s, -0.018),
        ], segments=12), sole_mat, pin_bone=f"knee.{tag}-foot.{tag}")

    # ---- 背負いダル(背中の肩〜腰を占め、上端が肩越しに覗く) ----
    # propsのbarrel_bodyは頂点リングが上下2段しかなく実際には膨らまない
    # (角ばった円柱に見える)ため、断面リングを積んで本当に膨らむ樽を
    # 自前で組む。12分割+フラットシェーディングで板張りに見せる
    bp_h = 0.27
    bp_r = 0.064
    bp_origin = Vector((0.02, 0.104, 0.50))

    def bp_radius(t: float) -> float:
        return bp_r * (1.0 + 0.14 * math.sin(t * math.pi))

    barrel = _loft("garudo_backpack_body", [
        (0.0, bp_radius(0.0), bp_radius(0.0), 0.0, 0.0),
        (bp_h * 0.25, bp_radius(0.25), bp_radius(0.25), 0.0, 0.0),
        (bp_h * 0.5, bp_radius(0.5), bp_radius(0.5), 0.0, 0.0),
        (bp_h * 0.75, bp_radius(0.75), bp_radius(0.75), 0.0, 0.0),
        (bp_h, bp_radius(1.0), bp_radius(1.0), 0.0, 0.0),
    ], segments=12, smooth=False)
    barrel.location += bp_origin
    add(barrel, apron_mat, pin_bone="hip-chest")
    alternate_planks(barrel, apron_mat_dark)
    for i, t in enumerate((0.16, 0.52, 0.86)):
        bhoop = C.cylinder(f"garudo_backpack_hoop{i}", (0.0, 0.0, bp_h * t),
                           bp_radius(t) + 0.003, 0.013, segments=12)
        bhoop.location += bp_origin
        add(bhoop, hoop_mat, pin_bone="hip-chest")
    bp_lid = C.cylinder("garudo_backpack_lid", (0.0, 0.0, bp_h + 0.011),
                        bp_r * 0.94, 0.022, segments=12, smooth=False)
    bp_lid.location += bp_origin
    knob = C.box("garudo_backpack_knob", (0.0, 0.0, bp_h + 0.030), (0.020, 0.008, 0.008))
    knob.location += bp_origin
    add(knob, C.make_material("garudo_backpack_knobwood", (0.40, 0.26, 0.15),
                              roughness=0.85), pin_bone="hip-chest")
    add(bp_lid, C.make_material("garudo_backpack_lidwood", (0.46, 0.30, 0.17),
                                roughness=0.85), pin_bone="hip-chest")

    # ---- 肩ひも(設定画: 胸の前を2本、肩を越えて樽上部へ) ----
    # 直線の円柱では胸から浮いて見えるため、ベルト→胸→肩→樽上部を
    # 1本のカーブ(_lock)で通し、胸・肩の曲面に沿わせる
    for s in (-1.0, 1.0):
        strap = _lock(f"garudo_strap{s}",
                      [Vector((0.050 * s, -0.052, 0.470)),
                       Vector((0.052 * s, -0.059, 0.600)),
                       Vector((0.052 * s, -0.046, 0.710)),
                       Vector((0.048 * s, -0.016, 0.750)),
                       Vector((0.045 * s, 0.095, 0.756))],
                      [0.011, 0.011, 0.011, 0.011, 0.011],
                      resolution=6)
        add(strap, belt_mat, pin_bone="hip-chest")

    # 肩ひもの留め金具(胸ひもの中程に小さな鉄の締め具)
    for s in (-1.0, 1.0):
        clasp = C.box(f"garudo_strap_clasp{s}", (0.051 * s, -0.055, 0.560),
                      (0.015, 0.007, 0.011))
        add(clasp, hoop_mat, pin_bone="hip-chest")

    mesh = C.join(parts_list, NAME)
    armature = C.build_armature(NAME, JOINTS, BONES, mesh, root="hip")
    for eye in eyes:
        C.parent_to_bone(eye, armature, "neck-head")
    for group_name, bone in pinned:
        C.pin_weight_to_bone(mesh, group_name, bone)
    _fix_orphan_weights(mesh)
    return [mesh, armature] + eyes, armature


def _fix_orphan_weights(mesh_obj) -> None:
    """
    自動ウェイト(Bone Heat)は部品の多い密集メッシュで一部の頂点の
    解を出せないことがある(「failed to find solution」警告)。無ウェイトの
    頂点はポーズ中その場に取り残され、体が動くと部位がちぎれて見える。
    ここでは無ウェイト頂点を最寄りのボーン(線分距離)へウェイト1.0で
    割り当てて取りこぼしを無くす。
    """
    segments = []
    for parent, child in BONES:
        name = C.bone_name(parent, child)
        vg = mesh_obj.vertex_groups.get(name)
        if vg is None:
            vg = mesh_obj.vertex_groups.new(name=name)
        segments.append((vg, Vector(JOINTS[parent]), Vector(JOINTS[child])))

    def seg_dist(p: Vector, a: Vector, b: Vector) -> float:
        ab = b - a
        if ab.length_squared == 0.0:
            return (p - a).length
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (p - (a + ab * t)).length

    orphans = 0
    for v in mesh_obj.data.vertices:
        if not any(g.weight > 0.001 for g in v.groups):
            vg, _, _ = min(segments, key=lambda s: seg_dist(v.co, s[1], s[2]))
            vg.add([v.index], 1.0, "REPLACE")
            orphans += 1
    if orphans:
        print(f"  自動ウェイトの取りこぼし {orphans} 頂点を最寄りボーンへ割り当てた")


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
