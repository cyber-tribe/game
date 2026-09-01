"""
主人公「ガルド」― 見習い樽守り。

新しい2D設定画(design/characters/garudo/generated/garudo-sheet.png、
ユーザー提供・2026-09-01)の三面図を寸法源に、彫刻+テクスチャ焼き込み
パイプライン(plan/models/archive/sculpt-texture-pipeline.md)で組む。
ブロックアウト承認(2026-09-01「良さそうです!」)済みの体型配分。

方針(plan/models/garudo-quality-uplift.md 実装項目8):

- **約5.2頭身のゲーム内比率を直接組む**。旧版の「7頭身写実→チビ化」の
  二段変換は廃止(設定画側がゲーム内比率になった)。全高0.97ユニットは
  従来と同じ(身長回帰ガード・他キャラとの体格バランス維持)。
- **有機部は1つに融合**: 頭・首・胴・袖・前腕・手袋・腰・脚・裾を
  sculpt_merge(target_tris指定)で連続メッシュにし、塗り分け
  (シャツ生成り/素肌/革手袋/青灰ズボン)と顔(口・鼻・眉)・
  シャツの前立てを384²アルベドへ焼き込む。境界は球・カプセルの
  距離場(知見8)。
- **硬い部品は別ジオメトリのままピンで剛体追従**: 樽板エプロン
  (背中±60°が開いた240°巻き、フラットシェードの板+たが)・
  背負い樽(タルの小道具と同じ12面フラットの造形言語)・ベルト・
  肩ひも・腰布(赤)・ブーツ。
- **目は顔に沿うパッチ1枚+描いた目**(hand-painted-standard.md 規約2:
  眼球を3Dオブジェクトとして顔に載せない)。まばたき機構は維持
  (blinkカスタムプロパティ)。髪は房を重ねた塊で頭ボーンへ剛体追従。
- 設定画に武器は無い(手は自然な人の手+革手袋)。

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

# 三面図の採寸: 全高425px(頭頂521〜足の裏937)を0.97ユニットへ正規化。
# 1px = 0.002282。以下の座標はすべてこの換算で三面図から読んだ値
JOINTS_HALF = {
    "hip": (0.0, 0.0, 0.46),
    "chest": (0.0, -0.004, 0.68),
    "neck": (0.0, 0.0, 0.775),
    "head": (0.0, -0.004, 0.878),
    "crown": (0.0, 0.0, 0.955),
    "shoulder.L": (0.078, 0.0, 0.742),
    "elbow.L": (0.165, 0.004, 0.600),
    "hand.L": (0.234, -0.004, 0.436),
    "thigh.L": (0.066, 0.0, 0.42),
    "knee.L": (0.070, 0.0, 0.27),
    "foot.L": (0.074, -0.02, 0.04),
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

# 配色は設定画のカラーパレットから採る
SKIN = (0.93, 0.80, 0.66)
SKIN_SHADE = (0.82, 0.64, 0.50)     # 鼻・口まわりの影色
SHIRT = (0.88, 0.84, 0.73)          # 生成りのシャツ
SHIRT_LINE = (0.74, 0.69, 0.58)     # 前立て・ボタンの線
TROUSERS = (0.35, 0.41, 0.49)       # 青灰のズボン(新設定画で深緑から変更)
LEATHER = (0.42, 0.28, 0.16)        # 革(ベルト・手袋・靴)
HAIR = (0.29, 0.19, 0.11)           # 茶色の無造作な髪
CLOTH = (0.60, 0.20, 0.15)          # 腰布(赤)
APRON_WOOD = props.BARREL_WOOD      # 樽板エプロン(実物の樽と同色で統一)
HOOP = props.BARREL_IRON            # たが(鉄輪)

# 顔まわりの基準。**設定画の正面図をピクセル実測して決めた値**
# (1px=0.002282、z=(937-y)*0.002282)。頭を球で作ると設定画と別人になる
# (実測: 設定画の顔は目の高さで半幅0.071→あご0.023へ絞る卵形。球で
# 作ると髪込みのシルエット幅を頭蓋に使うことになり、あごの無い団子顔)
CHIN_Z = 0.762          # あご先(顔QAの実測)
EYE_Z = 0.8415          # 目の中心の高さ(顔QAの実測)
EYE_X = 0.0317          # 顔の中心から目の中心まで(顔QAの実測)
BROW_Z = 0.884          # 眉(目パッチの上端0.871より上に置く)
MOUTH_Z = 0.800
NOSE_Z = 0.828
SKULL_TOP_Z = 0.970

# 目まわりの造作を置くための、顔の前面に当てた楕円体(頭ロフトの
# 目の高さ付近と一致させてある)
FACE_C = Vector((0.0, 0.010, 0.852))
FACE_R = Vector((0.0770, 0.079, 0.086))

# 頭のロフト断面(z, rx, ry, cx, cy)。正面図の幅と側面図の奥行きから
HEAD_RINGS = [
    (0.762, 0.018, 0.026, 0.0, 0.006),
    (0.780, 0.034, 0.044, 0.0, 0.008),
    (0.800, 0.050, 0.058, 0.0, 0.009),
    (0.824, 0.0735, 0.076, 0.0, 0.010),
    (0.848, 0.0765, 0.079, 0.0, 0.010),
    (0.872, 0.0775, 0.080, 0.0, 0.010),
    (0.898, 0.0760, 0.079, 0.0, 0.011),
    (0.924, 0.069, 0.0745, 0.0, 0.012),
    (0.948, 0.058, 0.063, 0.0, 0.013),
    (0.962, 0.040, 0.045, 0.0, 0.014),
    (0.970, 0.016, 0.019, 0.0, 0.014),
]

HAND_C_L = Vector((0.234, -0.004, 0.436))


def _arc_loft(name: str, rings, open_half_deg: float = 60.0,
              segments: int = 20, smooth: bool = True):
    """
    背中側(+Y、90°)を±open_half_deg開けた弧のロフト。樽板エプロンと
    そのたがに使う。リングはcommon.loftと同じ(z, rx, ry, cx, cy)。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    a0 = math.radians(90 + open_half_deg)
    a1 = math.radians(90 - open_half_deg + 360)
    angles = [a0 + (a1 - a0) * i / segments for i in range(segments + 1)]
    ring_verts = []
    for z, rx, ry, cx, cy in rings:
        ring_verts.append([bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
                           for a in angles])
    for lower, upper in zip(ring_verts, ring_verts[1:]):
        for i in range(segments):
            bm.faces.new((lower[i], lower[i + 1], upper[i + 1], upper[i]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


def _hair_shell(name: str, rings, sign: float = 1.0, segments: int = 8):
    """
    頭の曲面に沿う横髪のシェル。板(平面)では顔の膨らみに負けて裏へ
    隠れてしまう(実測: 目の高さで肌が45mm余計に見えた)ので、頭と同じ
    楕円の**角度スライス**で作る。ringsは(z, rx, ry, cy, deg0, deg1)で、
    deg0(前寄り)〜deg1(後ろ寄り)の角度範囲を高さごとに変えられる
    (設定画の横髪は頬で引っ込み、こめかみとあごで前へ出る)。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    ring_verts = []
    for z, rx, ry, cy, deg0, deg1 in rings:
        row = []
        for i in range(segments + 1):
            a = math.radians(deg0 + (deg1 - deg0) * i / segments)
            row.append(bm.verts.new((sign * rx * math.cos(a),
                                     cy + ry * math.sin(a), z)))
        ring_verts.append(row)
    for lower, upper in zip(ring_verts, ring_verts[1:]):
        for i in range(segments):
            bm.faces.new((lower[i], lower[i + 1], upper[i + 1], upper[i]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def _smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def _seg_dist(p: Vector, a: Vector, b: Vector) -> float:
    ab = b - a
    if ab.length_squared == 0.0:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def _lerp3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _h01(x: float, y: float = 0.0) -> float:
    """決定的な擬似乱数(0〜1)。板ごとの色差・擦れの散らしに使う"""
    return (math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1.0


def _shade(color, f: float):
    return (min(1.0, color[0] * f), min(1.0, color[1] * f), min(1.0, color[2] * f))


# ---- 手描きテクスチャ(plan/models/hand-painted-standard.md 規約3) ----
# いずれも3D位置から描くので、UV島の割れ方に依存しない

APRON_HOOP_Z = (0.265, 0.390, 0.505)


def _apron_color(pos: Vector, normal: Vector):
    """樽板エプロン: 板ごとの色差+上明るく下暗く+たが直下の影+
    縁の明るい線+木目+擦れ"""
    deg = math.degrees(math.atan2(pos.y - 0.006, pos.x)) % 360.0
    t_arc = ((deg - 200.0) % 360.0) / 140.0
    idx = max(0, min(8, int(t_arc * 9)))
    f = 0.94 + 0.12 * _h01(idx * 12.9898)
    tz = max(0.0, min(1.0, (pos.z - 0.235) / (0.530 - 0.235)))
    f *= 0.84 + 0.26 * tz
    for hz in APRON_HOOP_Z:
        d = hz - 0.009 - pos.z
        if 0.0 < d < 0.022:
            f *= 0.72 + 0.28 * _smoothstep(0.0, 0.022, d)
    edge = abs(t_arc * 9 - idx - 0.5) * 2.0
    if edge > 0.80:
        f *= 1.10
    if math.sin(deg * 9.0 + _h01(idx * 7.0) * 6.28) > 0.75:
        f *= 0.93
    if _h01(round(deg * 1.3), round(pos.z * 90)) > 0.965:
        f *= 1.15
    return _shade(APRON_WOOD, f)


def _barrel_color(pos: Vector, normal: Vector):
    """背負い樽(軸は前後)。板の色差+上を明るく下を暗く+たが直下の影+
    背中側の鏡板は年輪と縁の明るい線"""
    b_cy, b_cz, b_len = 0.120, 0.658, 0.110
    if pos.y > b_cy + b_len / 2:
        r = math.hypot(pos.x, pos.z - b_cz)
        f = 1.02
        if r > 0.082:
            f *= 1.14
        elif 0.022 < r < 0.028 or 0.048 < r < 0.054:
            f *= 0.90
        return _shade((0.50, 0.34, 0.20), f)
    # 板は軸まわりに並ぶ(x-z平面の角度)
    deg = math.degrees(math.atan2(pos.z - b_cz, pos.x)) % 360.0
    idx = int(deg / 30.0)
    f = 0.94 + 0.12 * _h01(idx * 3.71)
    f *= 0.84 + 0.30 * max(0.0, min(1.0, (pos.z - (b_cz - 0.090)) / 0.180))
    for hy in (b_cy - 0.034, b_cy, b_cy + 0.034):
        d = pos.y - (hy + 0.010)
        if 0.0 < d < 0.018:
            f *= 0.76 + 0.24 * _smoothstep(0.0, 0.018, d)
    if abs((deg % 30.0) - 15.0) / 15.0 > 0.86:
        f *= 1.10
    if math.sin(pos.y * 90.0 + idx) > 0.8:
        f *= 0.94
    return _shade(APRON_WOOD, f)


def _boot_color(pos: Vector, normal: Vector):
    """
    ブーツ: 靴底とヒールは濃く、甲は明るく、履き口の折り返しに線、
    正面に編み上げの紐とハトメ。座標はブーツのローカル(原点=足の中心、
    -Yがつま先、z0が接地)
    """
    if pos.z < 0.020:
        return (0.24, 0.17, 0.11)                     # 靴底
    if pos.y > 0.030 and pos.z < 0.048:
        return (0.28, 0.20, 0.13)                     # ヒール
    f = 0.90 + 0.20 * max(0.0, min(1.0, (pos.z - 0.02) / 0.16))
    d_toe = (pos - Vector((0.0, -0.090, 0.030))).length
    f *= 1.0 + 0.18 * (1.0 - _smoothstep(0.02, 0.055, d_toe))   # つま先の明るみ
    if 0.156 < pos.z < 0.182:
        f *= 1.12                                     # 履き口の折り返し
    if pos.y < -0.020 and abs(pos.x) < 0.016 and 0.050 < pos.z < 0.150:
        k = (pos.z - 0.050) / 0.024
        if abs(k - round(k)) < 0.17:
            f *= 0.68                                 # 紐
            if abs(abs(pos.x) - 0.013) < 0.003:
                f *= 1.60                             # ハトメ
    return _shade((0.46, 0.31, 0.18), f)


def _hair_color(pos: Vector, normal: Vector):
    """髪: 上を明るく・後頭部を暗く・房の流れの筋"""
    f = 0.86 + 0.30 * max(0.0, min(1.0, (pos.z - 0.82) / 0.17))
    if pos.y > 0.055:
        f *= 0.90
    ang = math.atan2(pos.x, -(pos.y - 0.02))
    if math.sin(ang * 16.0 + pos.z * 55.0) > 0.66:
        f *= 0.86
    return _shade(HAIR, f)


def _hair_card(name: str, base, tip, w_base: float, w_mid: float,
               thick: float = 0.007, center=(0.0, 0.016, 0.900), flat=None):
    """
    髪の房を**平たい板**として作る(先端は尖る)。円筒の房(curve_tube)は
    どう並べても「丸い棒の集合」に見え、設定画の房にならない実測。
    板の面は既定で頭の外を向き(radial)、幅は房の走る向きと直交して取る。

    flatに向きを与えると、板の面をその向きへ固定する。**顔の横に垂れる
    房**は既定のradial(=横向き)だと正面から見て板が立ってしまい、幅が
    出ない(実測: 目の高さの頭幅が設定画より-22px)。flat=(0,-1,0)を
    渡して面を正面へ向けると、設定画どおり顔の横に髪の幅が出る。
    """
    b = Vector(base)
    t = Vector(tip)
    c = Vector(center)
    d = t - b
    length = d.length
    d.normalize()
    radial = Vector(flat) if flat is not None else (b - c)
    radial = radial - d * radial.dot(d)
    if radial.length_squared < 1e-9:
        radial = Vector((0.0, -1.0, 0.0))
    radial.normalize()
    u = d.cross(radial).normalized()

    stations = [(0.0, w_base), (0.42, w_mid), (0.76, w_mid * 0.52), (1.0, 0.0012)]
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    rings = []
    for frac, half_w in stations:
        p = b + d * (length * frac)
        # 房は先へ行くほど薄く
        th = thick * (1.0 - 0.55 * frac) * 0.5
        rings.append([
            bm.verts.new(p + radial * th + u * half_w),
            bm.verts.new(p + radial * th - u * half_w),
            bm.verts.new(p - radial * th - u * half_w),
            bm.verts.new(p - radial * th + u * half_w),
        ])
    for lower, upper in zip(rings, rings[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


# ---- 目(規約2: 眼球を3Dオブジェクトとして顔に載せない) ----
# 顔の球面に沿う楕円のパッチ1枚だけを置き、目は完全に「絵」として
# そのテクスチャへ描く。まぶたの線・虹彩・瞳・ハイライトまで1枚の
# イラストなので、球を積んだときの「安価な3Dキャラクター」感が出ない。

# 目のパッチの寸法。設定画の目(幅0.0342×高さ0.018)を、テクスチャの
# アーモンド(円板に対し幅0.94・高さ0.76)で埋めるとこの大きさになる
EYE_HALF_W = 0.0171
EYE_HALF_H = 0.0197


def _eye_texture(size: int = 128) -> "bpy.types.Image":
    """
    目のイラストを1枚描く(UV円板いっぱい)。左右のパッチで共用する。
    上まぶたを太く、虹彩は濃い縁+暖色の芯、瞳、ハイライト2粒。
    """
    import numpy as np

    ny, nx = np.mgrid[0:size, 0:size]
    # 円板の内側を(-1,1)に正規化。+yが上
    x = (nx + 0.5) / size * 2.0 - 1.0
    y = (ny + 0.5) / size * 2.0 - 1.0
    aa = 2.5 / size  # アンチエイリアスの幅(テクセル数ぶん)

    def smooth(edge0, edge1, v):
        t = np.clip((v - edge0) / (edge1 - edge0), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    def ellipse(cx, cy, rx, ry):
        """内側=1、外側=0の滑らかなマスク"""
        d = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
        return 1.0 - smooth(1.0 - aa * 2.0, 1.0 + aa * 2.0, d)

    px = np.zeros((size, size, 4), dtype=np.float32)
    px[..., 3] = 1.0

    def paint(mask, color):
        m = mask[..., None]
        px[..., :3] = px[..., :3] * (1.0 - m) + np.array(color, dtype=np.float32) * m

    def almond(cx, cy, rx, ry, power=1.65):
        """角の尖ったアーモンド形(超楕円)。アニメの目の輪郭"""
        d = (np.abs((x - cx) / rx) ** power + np.abs((y - cy) / ry) ** power) ** (1.0 / power)
        return 1.0 - smooth(1.0 - aa * 2.0, 1.0 + aa * 2.0, d)

    LINE = (0.12, 0.075, 0.055)
    # パッチの外周には肌を残し(顔と法線を揃えてあるので継ぎ目が出ない)、
    # その内側にアーモンド形の目を1枚の絵として描く
    px[..., :3] = np.array(SKIN, dtype=np.float32)
    paint(almond(0.0, -0.06, 0.94, 0.76), LINE)                  # 目の輪郭線
    paint(almond(0.0, -0.14, 0.84, 0.60), (0.97, 0.96, 0.94))    # 白目
    paint(ellipse(0.0, -0.14, 0.50, 0.56), (0.30, 0.18, 0.10))   # 虹彩の縁
    paint(ellipse(0.0, -0.16, 0.38, 0.43), (0.62, 0.38, 0.17))   # 虹彩(暖色)
    paint(ellipse(0.0, -0.17, 0.17, 0.19), (0.10, 0.065, 0.05))  # 瞳
    paint(ellipse(-0.22, 0.06, 0.16, 0.15), (1.0, 1.0, 1.0))     # ハイライト大
    paint(ellipse(0.20, -0.42, 0.085, 0.08), (1.0, 1.0, 1.0))    # ハイライト小
    # 上まぶた(太い線)。虹彩の上を少し隠すとアニメの目になる
    lid = almond(0.0, -0.06, 0.94, 0.76) * (1.0 - almond(0.0, -0.30, 0.90, 0.72))
    paint(lid, LINE)

    img = bpy.data.images.new("garudo_eye_tex", size, size, alpha=False)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def _eye_panel(name: str, side: float, rings: int = 5, segs: int = 16):
    """
    顔の楕円体(FACE_C/FACE_R)に沿う楕円のパッチ。UVは円板なので、
    目の絵をそのまま貼れる。原点はパッチの中心へ置く(まばたきの
    スケールがその場で潰れるため)。

    球ではなく楕円体に乗せるのは、設定画の顔があごへ絞る卵形で、
    目が顔の側面近くまで回り込むため(球だと浮くか埋まる)。
    """
    # 正規化空間(楕円体→単位球)で組み、最後に半径を掛けて戻す
    nx = EYE_X * side / FACE_R.x
    nz = (EYE_Z - FACE_C.z) / FACE_R.z
    ny = -math.sqrt(max(1e-6, 1.0 - nx * nx - nz * nz))
    d = Vector((nx, ny, nz)).normalized()
    up = Vector((0.0, 0.0, 1.0))
    tv = (up - d * up.dot(d)).normalized()
    tu = tv.cross(d).normalized()
    # パッチの世界寸法 → 正規化空間での角度
    au = math.asin(min(0.9, EYE_HALF_W / FACE_R.x))
    av = math.asin(min(0.9, EYE_HALF_H / FACE_R.z))

    def surface(r: float, theta: float):
        n = (d + tu * math.tan(au) * r * math.cos(theta)
             + tv * math.tan(av) * r * math.sin(theta)).normalized()
        p = Vector((FACE_C.x + n.x * FACE_R.x,
                    FACE_C.y + n.y * FACE_R.y,
                    FACE_C.z + n.z * FACE_R.z))
        # 楕円体の外向き法線(勾配)へ少しだけ浮かせて顔に埋まらないように
        grad = Vector((n.x / FACE_R.x, n.y / FACE_R.y, n.z / FACE_R.z)).normalized()
        return p + grad * 0.0025, grad

    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    uvs = {}
    normals = {}

    def vert(r: float, theta: float):
        p, grad = surface(r, theta)
        v = bm.verts.new(p)
        uvs[v] = (0.5 + 0.5 * r * math.cos(theta), 0.5 + 0.5 * r * math.sin(theta))
        normals[v] = grad
        return v

    center_v = vert(0.0, 0.0)
    ring_verts = [[vert(i / rings, math.tau * k / segs) for k in range(segs)]
                  for i in range(1, rings + 1)]

    def add_face(vs):
        f = bm.faces.new(vs)
        for loop in f.loops:
            loop[uv_layer].uv = uvs[loop.vert]

    for k in range(segs):
        add_face((center_v, ring_verts[0][k], ring_verts[0][(k + 1) % segs]))
    for lower, upper in zip(ring_verts, ring_verts[1:]):
        for k in range(segs):
            add_face((lower[k], upper[k], upper[(k + 1) % segs], lower[(k + 1) % segs]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # 開いたパッチではrecalcの向きが不定。顔の外向きへ揃える
    # (裏向きだと陰になり、白目が暗く沈む)
    probe = bm.faces[:][0]
    if probe.normal.dot(probe.calc_center_median() - FACE_C) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    order = [normals[v] for v in bm.verts]
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    # 法線は顔の楕円体の外向きへ。顔と同じ向きなのでパッチの継ぎ目が
    # 陰影に出ない(set_originより前に行う: 原点を移すと頂点がローカル
    # 座標になり、ワールドの中心では向きが狂う)
    mesh.normals_split_custom_set_from_vertices(order)
    aim = mesh.vertices[0].co.copy()
    C.set_origin(obj, aim)
    return obj


def _body_color(pos: Vector, normal: Vector):
    """
    融合ボディの塗り分け(距離場)+顔・前立ての焼き込み。
    優先順: 手袋 > 素肌(頭・前腕) > ズボン(ベルトより下) > シャツ。
    しきい値の段差はベルト・エプロン・ブーツの実体ジオメトリの陰に隠れる。
    """
    # 手袋(手の球距離場)。甲の明るみ+手首側を暗く
    d_hand = min((pos - HAND_C_L).length,
                 (pos - Vector((-HAND_C_L.x, HAND_C_L.y, HAND_C_L.z))).length)
    glove = 1.0 - _smoothstep(0.049, 0.057, d_hand)
    if glove > 0.5:
        f = 1.0
        xc = 0.234 if pos.x >= 0 else -0.234
        d_knuckle = (pos - Vector((xc, -0.030, 0.432))).length
        f *= 1.0 + 0.14 * (1.0 - _smoothstep(0.012, 0.030, d_knuckle))
        if pos.z > 0.456:
            f *= 0.90
        return _shade(LEATHER, f)

    # 素肌: 首から上(頭はロフトの卵形なので球の距離場は使えない。
    # 胴の肩口がz0.782なので、この高さで切れば首と頭だけが残る)+
    # 前腕のカプセル(袖まくりの先)
    skin_field = _smoothstep(0.778, 0.790, pos.z)
    for s in (1.0, -1.0):
        d_fore = _seg_dist(pos, Vector((0.165 * s, 0.004, 0.594)),
                           Vector((0.227 * s, 0.0, 0.452)))
        skin_field = max(skin_field, 1.0 - _smoothstep(0.036, 0.044, d_fore))
    if skin_field > 0.5:
        # 顔はアニメの文法で「描く」(参照スクリーンショットの指摘対応)。
        # 太い上まぶたの線・意思のある眉・口の線+下唇の影・鼻の点。
        # 高密度化した顔UV島(organic_uvのboost)が細い線を支える。
        # 面法線のガードは使わない(縁テクセルで判定が明滅して線が
        # 点描に割れた実測。後頭部の同じxz帯は髪ジオメトリが覆うので、
        # 素の距離場だけで安全に引ける)
        # 生え際より上と後頭部は髪色で塗る(房の隙間から地肌が覗かない)
        if pos.z > 0.900 and pos.y > -0.060:
            return HAIR
        if pos.y > 0.045 and pos.z > 0.800:
            return HAIR
        if pos.y < 0.006:
            xz = Vector((pos.x, 0.0, pos.z))
            for s in (1.0, -1.0):
                # 眉: 細く、内側が低く外側へ上がってから下がる角度
                # (設定画の実測: z0.867〜0.878、x0.021〜0.060)
                d = _seg_dist(xz, Vector((0.015 * s, 0.0, BROW_Z - 0.005)),
                              Vector((0.032 * s, 0.0, BROW_Z + 0.003)))
                d = min(d, _seg_dist(xz, Vector((0.032 * s, 0.0, BROW_Z + 0.003)),
                                     Vector((0.047 * s, 0.0, BROW_Z + 0.001))))
                if d < 0.0040:
                    return _lerp3((0.20, 0.13, 0.075), SKIN,
                                  _smoothstep(0.0027, 0.0038, d))
            # 口: 小さな一文字(設定画の口は目の内側幅ほどしかない)
            d = _seg_dist(xz, Vector((-0.0105, 0.0, MOUTH_Z - 0.0008)),
                          Vector((0.0105, 0.0, MOUTH_Z - 0.0008)))
            if d < 0.0022:
                return _lerp3((0.44, 0.22, 0.18), SKIN,
                              _smoothstep(0.0015, 0.0022, d))
            # 鼻: ごく小さな点
            if (xz - Vector((0.0, 0.0, NOSE_Z))).length < 0.0026:
                return _lerp3(SKIN, SKIN_SHADE, 0.85)
            # 目のくぼみ(パッチの裏。まばたきで潰れたとき肌より少し暗い)
            for s in (1.0, -1.0):
                d = (xz - Vector((EYE_X * s, 0.0, EYE_Z))).length
                if d < 0.022:
                    return _lerp3(_lerp3(SKIN, SKIN_SHADE, 0.40), SKIN,
                                  _smoothstep(0.010, 0.022, d))
            # 頬のほんのり赤み
            for s in (1.0, -1.0):
                d = (xz - Vector((0.050 * s, 0.0, 0.815))).length
                if d < 0.022:
                    t = 1.0 - _smoothstep(0.008, 0.022, d)
                    return _lerp3(SKIN, (0.95, 0.70, 0.55), 0.30 * t)
        # 顔の描き込み陰影(規約3)。トゥーン階調に頼らず、絵として
        # 「この面は少し暗い」を焼き込む: 前髪の落ち影・こめかみ・
        # あご下・首。照明が変わっても顔の立体が壊れない
        shade = 0.0
        shade = max(shade, 0.55 * _smoothstep(0.900, 0.930, pos.z))       # 前髪の影
        shade = max(shade, 0.30 * _smoothstep(0.050, 0.072, abs(pos.x)))  # こめかみ
        shade = max(shade, 0.45 * (1.0 - _smoothstep(0.762, 0.800, pos.z)))  # あご下
        if pos.z < 0.800:
            shade = max(shade, 0.50)                                       # 首の影
        shade = max(shade, 0.25 * _smoothstep(0.010, 0.050, pos.y))       # 後頭部側
        return _lerp3(SKIN, SKIN_SHADE, min(0.75, shade))

    # ズボン(ベルトより下)。膝の明るみ・裾だまりの折れ皺・尻の落ち影
    if pos.z < 0.545:
        f = 1.0
        f *= 0.90 + 0.12 * max(0.0, min(1.0, (pos.z - 0.15) / 0.40))
        for s in (1.0, -1.0):
            d = (pos - Vector((0.069 * s, -0.048, 0.285))).length
            f *= 1.0 + 0.10 * (1.0 - _smoothstep(0.015, 0.038, d))
        if pos.z < 0.205 and math.sin(pos.z * 240.0 + pos.x * 60.0) > 0.55:
            f *= 0.88
        if pos.z > 0.50 and pos.y > 0.02:
            f *= 0.93
        return _shade(TROUSERS, f)

    # シャツ。前立て+ボタン+胸の明るみ+裾・脇の落ち影+布の折れ
    if normal.y < -0.2 and abs(pos.x) < 0.0026 and 0.695 < pos.z < 0.764:
        return SHIRT_LINE
    for bz in (0.742, 0.718):
        if (pos - Vector((0.0, -0.062, bz))).length < 0.0045:
            return SHIRT_LINE
    # 袖まくりの折り返し帯(肘の少し上)をわずかに濃く
    for s in (1.0, -1.0):
        d = (pos - Vector((0.112 * s, 0.004, 0.622))).length
        if d < 0.036:
            return _lerp3(SHIRT, SHIRT_LINE, 0.45)
    f = 1.0
    f *= 0.93 + 0.10 * max(0.0, min(1.0, (pos.z - 0.545) / 0.20))   # 胸を明るく
    if pos.z > 0.760:
        f *= 0.92                                                   # 襟もとの影
    for s in (1.0, -1.0):
        d = (pos - Vector((0.078 * s, 0.0, 0.700))).length          # 脇の落ち影
        f *= 1.0 - 0.10 * (1.0 - _smoothstep(0.012, 0.034, d))
        # 布の折れ(ベルトから胸へ抜ける柔らかい皺)
        d = _seg_dist(pos, Vector((0.045 * s, -0.058, 0.575)),
                      Vector((0.020 * s, -0.062, 0.640)))
        f *= 1.0 - 0.07 * (1.0 - _smoothstep(0.004, 0.011, d))
    return _shade(SHIRT, f)


def build() -> tuple[list, object]:
    leather_mat = C.make_material("garudo_leather", LEATHER, roughness=0.75)
    hoop_mat = C.make_material("garudo_hoop", HOOP, roughness=0.45, metallic=0.7)
    cloth_mat = C.make_material("garudo_cloth", CLOTH, roughness=0.9)
    skirt_mat = C.make_material("garudo_skirt", (0.38, 0.43, 0.50), roughness=0.9)

    # ================= 有機部(融合してテクスチャで塗り分け) =================
    organic = []
    organic.append(C.loft("g_head", HEAD_RINGS))
    organic.append(C.cylinder("g_neck", (0, 0.008, 0.782), 0.024, 0.055))
    organic.append(C.loft("g_torso", [
        (0.535, 0.085, 0.055, 0.0, 0.0),
        (0.600, 0.092, 0.058, 0.0, 0.0),
        (0.680, 0.100, 0.062, 0.0, 0.0),
        (0.744, 0.100, 0.060, 0.0, 0.0),
        (0.752, 0.068, 0.044, 0.0, 0.0),
        (0.766, 0.034, 0.028, 0.0, 0.0),
    ]))
    for s in (1, -1):
        # 袖(肘まで。まくり口は少し太い)→ 前腕(素肌)→ 手(手袋)
        organic.append(C.curve_tube(f"g_sleeve{s}",
                                    [(s * 0.078, 0.0, 0.744), (s * 0.100, 0.004, 0.690),
                                     (s * 0.165, 0.004, 0.604)],
                                    [0.030, 0.029, 0.031]))
        organic.append(C.curve_tube(f"g_fore{s}",
                                    [(s * 0.165, 0.004, 0.604), (s * 0.227, 0.0, 0.460)],
                                    [0.021, 0.019]))
        glove = C.uv_sphere(f"g_glove{s}", (s * 0.234, -0.004, 0.436), 0.030,
                            scale=(0.85, 1.0, 1.25))
        organic.append(glove)
        organic.append(C.uv_sphere(f"g_thumb{s}", (s * 0.213, -0.012, 0.447), 0.0115))
    # 腰(尻の量感)+脚+裾のたくれ
    organic.append(C.loft("g_seat", [
        (0.42, 0.086, 0.054, 0.0, 0.002),
        (0.50, 0.090, 0.057, 0.0, 0.002),
        (0.55, 0.086, 0.056, 0.0, 0.0),
    ]))
    for s in (1, -1):
        organic.append(C.curve_tube(f"g_leg{s}",
                                    [(s * 0.066, 0.0, 0.44), (s * 0.069, 0.0, 0.30),
                                     (s * 0.070, 0.0, 0.21)],
                                    [0.038, 0.040, 0.043]))
        organic.append(C.cylinder(f"g_cuff{s}", (s * 0.070, 0.0, 0.175), 0.050, 0.055))

    # 入力はすべてクリーンな閉プリミティブなのでSMOOTH段階を飛ばす
    # (SMOOTHのremove_disconnectedは交差しているだけの頭を切り捨てた)
    body = C.sculpt_merge(NAME, organic, voxel=0.006, target_tris=5200,
                          clean_input=True)
    # 直立キャラ: 前後split(顔をシームが横切らない)。頭部を独立島に
    # 切り出して2.5倍へ拡大し、「テクスチャの絵」として描き込む顔に
    # 十分なテクセル密度を寄せる(商用トゥーンRPGの顔はほぼテクスチャで
    # 成立しているという指摘への対応)
    C.organic_uv(body, axis=1, boost=(tuple(FACE_C), 0.115, 2.5))
    C.uv_report(body, size=512, regions={"face": (tuple(FACE_C), 0.10)})
    albedo = C.bake_albedo(body, _body_color, size=512, name="garudo_albedo")
    C.assign_material(body, C.make_textured_material("garudo_body", albedo, roughness=0.8))
    # 顔まわりの法線を頭中心の球へ寄せ、頬の変な影を消す(規約4)
    C.spherize_normals(body, tuple(FACE_C), radius=0.115, strength=1.0)

    parts_list = [body]  # joinする部品(bodyのUV・材質は維持される)
    pinned = []          # (グループ名, ボーン名)

    def add(obj, mat, pin_bone=None):
        C.assign_material(obj, mat)
        if pin_bone:
            C.mark_for_pin(obj)
            pinned.append((obj.name, pin_bone))
        parts_list.append(obj)
        return obj

    # ================= 目(顔に沿うパッチ1枚+描いた目) =================
    # 規約2: 眼球を3Dオブジェクトとして顔に載せない。顔の球面に沿う
    # 楕円パッチ1枚だけを置き、まぶたの線・虹彩・瞳・ハイライトまで
    # すべて1枚の絵として貼る。原点はパッチ中心なので、まばたきの
    # 縦スケールがその場で潰れる(従来は原点が首関節にあり、まばたきの
    # たびに目が足元へ飛んでいた)
    eye_tex = _eye_texture()
    eye_panel_mat = C.make_textured_material("garudo_eye", eye_tex, roughness=0.35)
    eyes = []
    for s in (-1.0, 1.0):
        panel = _eye_panel(f"eye{s}", s)
        C.assign_material(panel, eye_panel_mat)
        panel["blink"] = "white"
        eyes.append(panel)

    # ================= 髪(平たい房の板。頭ボーンへ剛体追従) =================
    # 設定画の髪は「丸い塊」でも「丸い棒」でもなく、**平たい房が不揃いに
    # 重なった塊**。板(_hair_card)で組み、生え際を水平に切り揃えず、
    # 房ごとに長さ・角度・幅を散らす
    locks = []

    def card(base, tip, w0, w1, thick=0.007, flat=None):
        locks.append(_hair_card(f"h_card{len(locks)}", base, tip, w0, w1, thick,
                                flat=flat))

    # 地肌を覆う土台(頭蓋よりひと回り大きい卵。前は生え際で止める)
    locks.append(C.loft("h_base", [
        # 下2段は中心を後ろへ寄せて前面を頭の中へ沈める。全周ロフトのまま
        # 下げると額の前に「ヘルメットのつば」が出て、眉が隠れる(実測)
        (0.862, 0.084, 0.062, 0.0, 0.042),
        (0.892, 0.086, 0.090, 0.0, 0.022),
        (0.916, 0.088, 0.092, 0.0, 0.018),
        (0.944, 0.076, 0.080, 0.0, 0.019),
        (0.962, 0.058, 0.062, 0.0, 0.019),
    ]))

    # 前髪: 分け目(やや右)から左右へ流れる房。先端の高さを大きく散らして
    # 生え際が一直線に切り揃わないようにする
    for x0, x1, z_tip, w0, w1 in [
        (-0.012, -0.062, 0.900, 0.034, 0.030),
        (-0.008, -0.030, 0.902, 0.028, 0.024),
        (0.004, 0.018, 0.896, 0.032, 0.028),
        (0.012, 0.050, 0.904, 0.028, 0.024),
        (0.018, 0.080, 0.910, 0.026, 0.021),
        (-0.018, -0.088, 0.912, 0.026, 0.021),
    ]:
        card((x0, -0.018, 0.944), (x1, -0.060, z_tip), w0, w1, thick=0.010)

    # 横の房: こめかみから耳の前へ、あご近くまで
    for s_ in (1.0, -1.0):
        # 顔QAのプロファイル実測: 設定画の横髪は目の高さで顔の脇を
        # 20mmほど覆い、あご近く(z0.786)まで垂れる。頬(z0.83)では
        # 引っ込んで頬の肌が見える。頭の曲面に沿うシェルで再現する
        locks.append(_hair_shell(f"h_side{s_}", [
            (0.786, 0.060, 0.062, 0.012, -52, 40),
            (0.812, 0.060, 0.063, 0.012, -34, 45),
            (0.836, 0.079, 0.081, 0.012, -16, 50),
            (0.858, 0.083, 0.085, 0.012, -50, 55),
            (0.880, 0.084, 0.087, 0.014, -62, 60),
            (0.902, 0.084, 0.088, 0.014, -64, 62),
        ], sign=s_))
        # あごの脇に垂れる房(設定画では z0.79 でも髪が顔の脇にある)
        card((0.049 * s_, -0.030, 0.818), (0.063 * s_, -0.038, 0.774),
             0.011, 0.008, flat=(0.0, -1.0, 0.0))

    # 頭頂〜後頭の跳ね: 板なので細くても「角」に見えない
    for base, tip, w0, w1 in [
        ((-0.030, -0.002, 0.930), (-0.058, -0.024, 0.972), 0.028, 0.022),
        ((0.014, -0.004, 0.936), (0.030, -0.030, 0.976), 0.026, 0.020),
        ((-0.006, 0.028, 0.940), (0.002, 0.036, 0.982), 0.028, 0.022),
        ((-0.042, 0.028, 0.914), (-0.062, 0.046, 0.946), 0.024, 0.019),
        ((0.044, 0.026, 0.914), (0.066, 0.042, 0.944), 0.024, 0.019),
        ((0.000, 0.054, 0.910), (0.006, 0.100, 0.924), 0.030, 0.024),
    ]:
        card(base, tip, w0, w1)

    # 襟足
    for s_ in (1.0, -1.0):
        card((0.028 * s_, 0.054, 0.892), (0.034 * s_, 0.090, 0.762), 0.034, 0.028)

    hair = C.join(locks, "garudo_hair")
    # 髪も手描き: 上を明るく・房の流れの筋(3D位置から描くのでSmart UVの
    # 島割れは問題にならない)。法線は頭の球へ寄せ、板の重なりの
    # デコボコ陰影を抑える(規約4)
    C.smart_uv(hair)
    hair_img = C.bake_albedo(hair, _hair_color, size=256, name="garudo_hair_tex")
    C.assign_material(hair, C.make_textured_material("garudo_hair", hair_img,
                                                     roughness=0.8))
    C.spherize_normals(hair, (0.0, 0.016, 0.900), strength=0.55)

    # ================= ベルト+バックル+肩ひも(剛体) =================
    add(C.loft("garudo_belt", [
        (0.545, 0.088, 0.058, 0.0, 0.0),
        (0.568, 0.088, 0.058, 0.0, 0.0),
    ]), leather_mat, pin_bone="hip-chest")
    add(C.box("garudo_buckle", (0, -0.0585, 0.5565), (0.030, 0.010, 0.024)),
        hoop_mat, pin_bone="hip-chest")
    # 肩ひも。融合ボディはボクセルぶん(≈5mm)膨らむので、胸の前は
    # y≈-0.070まで出して表面に乗せる
    for s in (-1.0, 1.0):
        strap = C.curve_tube(f"garudo_strap{s}",
                             [(s * 0.045, 0.098, 0.68), (s * 0.050, 0.032, 0.760),
                              (s * 0.052, -0.034, 0.757), (s * 0.051, -0.0700, 0.662),
                              (s * 0.049, -0.0640, 0.575)],
                             [0.0095, 0.0105, 0.0105, 0.010, 0.0095], resolution=6)
        add(strap, leather_mat, pin_bone="hip-chest")
        clasp = C.box(f"garudo_clasp{s}", (0.051 * s, -0.0705, 0.660),
                      (0.016, 0.007, 0.012))
        add(clasp, hoop_mat, pin_bone="hip-chest")

    # ============ エプロン(前=樽板、側面〜背面=灰色の布) ============
    # 設定画の側面図で判明した構造: **木の板は前面だけ**で、その後ろに
    # 灰色の布が腰から膝下まで360°垂れている(側面の奥行きは布が作る)。
    # 木を全周に回すと側面の奥行きが足りず(実測-64px)、背面も別物になる
    cloth_rings = [
        (0.235, 0.150, 0.108, 0.0, 0.015),
        (0.390, 0.132, 0.105, 0.0, 0.012),
        (0.530, 0.104, 0.082, 0.0, 0.008),
    ]
    skirt = C.loft("garudo_skirt", cloth_rings, segments=20, cap_top=False,
                   cap_bottom=False)
    add(skirt, skirt_mat, pin_bone="hip-chest")

    apron_rings = [
        (0.235, 0.172, 0.122, 0.0, 0.008),
        (0.390, 0.148, 0.110, 0.0, 0.006),
        (0.530, 0.110, 0.086, 0.0, 0.002),
    ]
    # 木の板は正面140°(200°〜340°)だけに並べる
    n_staves = 9
    stave_objs = []
    for i in range(n_staves):
        a0 = math.radians(200) + math.radians(140) * (i / n_staves)
        a1 = math.radians(200) + math.radians(140) * ((i + 1) / n_staves)
        gap = (a1 - a0) * 0.07
        mesh = bpy.data.meshes.new(f"garudo_stave{i}")
        obj = bpy.data.objects.new(f"garudo_stave{i}", mesh)
        bpy.context.collection.objects.link(obj)
        bm = bmesh.new()
        ring_verts = []
        for z, rx, ry, cx, cy in apron_rings:
            ring_verts.append([bm.verts.new((cx + rx * math.cos(a),
                                             cy + ry * math.sin(a), z))
                               for a in (a0 + gap, a1 - gap)])
        for lower, upper in zip(ring_verts, ring_verts[1:]):
            bm.faces.new((lower[0], lower[1], upper[1], upper[0]))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        stave_objs.append(obj)
    apron = C.join(stave_objs, "garudo_apron")
    C.smart_uv(apron)
    apron_img = C.bake_albedo(apron, _apron_color, size=256, name="garudo_apron_tex")
    C.assign_material(apron, C.make_textured_material("garudo_apron", apron_img,
                                                      roughness=0.85))
    C.mark_for_pin(apron)
    pinned.append((apron.name, "hip-chest"))
    parts_list.append(apron)
    # たが(鉄輪)3段。板より少し外へ、正面だけ
    for z, t in ((0.265, 0.0), (0.390, 0.5), (0.505, 1.0)):
        rx = 0.172 + (0.110 - 0.172) * t + 0.005
        ry = 0.122 + (0.086 - 0.122) * t + 0.005
        cy = 0.008 + (0.002 - 0.008) * t
        band = _arc_loft(f"garudo_apron_hoop{z}", [
            (z - 0.009, rx, ry, 0.0, cy),
            (z + 0.009, rx, ry, 0.0, cy),
        ], open_half_deg=108.0, segments=16)
        add(band, hoop_mat, pin_bone="hip-chest")

    # ================= 腰布(赤)。左腰でベルトから覗く =================
    knot = C.uv_sphere("garudo_knot", (0.086, -0.012, 0.535), 0.017,
                       scale=(1.0, 0.8, 0.75))
    add(knot, cloth_mat, pin_bone="hip-chest")
    tail = C.box("garudo_cloth_tail", (0.090, -0.008, 0.487), (0.026, 0.013, 0.085),
                 bevel=0.005)
    tail.rotation_euler = (math.radians(4), math.radians(-10), math.radians(6))
    add(tail, cloth_mat, pin_bone="hip-chest")

    # ================= 背負い樽(軸を前後に寝かせて背負う) =================
    # 設定画の側面図は「たがが縦に走る」・背面図は「円い鏡板」。これは
    # 樽の軸が前後(Y)を向いているから(実測: 直径0.244・長さ0.130・
    # 中心 y+0.155 z0.674)。縦置きの樽は設定画と別物になる
    b_r, b_len, b_cy, b_cz = 0.090, 0.110, 0.120, 0.658
    barrel = C.cylinder("garudo_barrel", (0.0, b_cy, b_cz), b_r, b_len,
                        segments=14, axis="Y", smooth=False)
    for vert in barrel.data.vertices:
        t = (vert.co.y - (b_cy - b_len / 2)) / b_len
        bulge = 1.0 + 0.10 * math.sin(max(0.0, min(1.0, t)) * math.pi)
        vert.co.x *= bulge
        vert.co.z = b_cz + (vert.co.z - b_cz) * bulge
    # 鏡板(背中側の面。中央に栓の突起)
    lid = C.cylinder("garudo_blid", (0.0, b_cy + b_len / 2 + 0.008, b_cz),
                     b_r * 0.98, 0.016, segments=14, axis="Y", smooth=False)
    plug = C.cylinder("garudo_bplug", (0.0, b_cy + b_len / 2 + 0.020, b_cz),
                      0.018, 0.014, segments=8, axis="Y")
    barrel = C.join([barrel, lid, plug], "garudo_barrel")
    C.smart_uv(barrel)
    barrel_img = C.bake_albedo(barrel, _barrel_color, size=256, name="garudo_barrel_tex")
    C.assign_material(barrel, C.make_textured_material("garudo_barrel", barrel_img,
                                                       roughness=0.85))
    C.mark_for_pin(barrel)
    pinned.append((barrel.name, "hip-chest"))
    parts_list.append(barrel)
    # たが3本。軸が前後なので、リングは前後方向に並ぶ
    for i, ty in enumerate((-0.034, 0.0, 0.034)):
        hoop = C.cylinder(f"garudo_bhoop{i}", (0.0, b_cy + ty, b_cz),
                          b_r * (1.0 + 0.10 * math.sin(
                              (0.5 + ty / b_len) * math.pi)) + 0.005,
                          0.020, segments=16, axis="Y")
        add(hoop, hoop_mat, pin_bone="hip-chest")

    # ================= ブーツ(編み上げ・革の実体形状) =================
    # 箱+円柱では「レゴの足」になる(実測の指摘)。かかと→土踏まず→
    # つま先で幅と高さが変わるロフトを寝かせて足の実体を作り、その下に
    # 靴底の板、後ろにヒール、上に履き口の折り返しを重ねる
    for s, bone in ((1.0, "knee.L-foot.L"), (-1.0, "knee.R-foot.R")):
        parts = []
        # 足(かかと→つま先)。ロフトは+Z方向に積むので、寝かせて
        # 「長さ=前後・ロフトのry=高さ」にする。**回転と位置はjoinの前に
        # 焼き込む**(C.joinは先頭オブジェクトの変換を引き継ぐため、
        # あとから回転を上書きすると他の部品が裏返る実測)
        shoe = C.loft(f"garudo_shoe{s}", [
            (0.000, 0.046, 0.026, 0.0, 0.028),
            (0.022, 0.057, 0.034, 0.0, 0.032),
            (0.060, 0.062, 0.036, 0.0, 0.030),
            (0.100, 0.060, 0.029, 0.0, 0.025),
            (0.132, 0.054, 0.022, 0.0, 0.020),
            (0.156, 0.041, 0.016, 0.0, 0.016),
            (0.166, 0.022, 0.010, 0.0, 0.014),
        ], segments=14)
        shoe.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        shoe.location = (0.0, 0.045, 0.0)
        C.activate(shoe)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(shoe)
        # 靴底(前へ少しはみ出す板)+ヒール
        parts.append(C.box(f"garudo_sole{s}", (0.0, -0.014, 0.009),
                           (0.120, 0.196, 0.018), bevel=0.005))
        parts.append(C.box(f"garudo_heel{s}", (0.0, 0.036, 0.021),
                           (0.098, 0.056, 0.026), bevel=0.004))
        # すね(履き口へ細くなる)+折り返し
        parts.append(C.cone(f"garudo_shaft{s}", (0.0, 0.004, 0.104), 0.046, 0.039,
                            0.110, segments=14))
        parts.append(C.cylinder(f"garudo_cuff{s}", (0.0, 0.004, 0.166), 0.045, 0.026,
                                segments=14))
        boot = C.join(parts, f"garudo_boot{s}")
        # つま先を外へ開く(設定画の立ち方)
        boot.rotation_euler = (0.0, 0.0, math.radians(-20.0 * s))
        boot.location = (s * 0.068, -0.010, 0.0)
        C.smart_uv(boot)
        boot_img = C.bake_albedo(boot, _boot_color, size=128,
                                 name=f"garudo_boot_tex{s}")
        C.assign_material(boot, C.make_textured_material(f"garudo_boot{s}", boot_img,
                                                         roughness=0.8))
        C.mark_for_pin(boot)
        pinned.append((boot.name, bone))
        parts_list.append(boot)

    # ================= 結合・リグ =================
    mesh = C.join(parts_list, NAME)
    armature = C.build_armature(NAME, JOINTS, BONES, mesh, root="hip")
    # 腕・脚チェーンのロールをワールドXへ整列(Xキー=前後スイングの保証。
    # 既定計算では不定で、内側へ巻き込む貫通不具合の原因になった)
    C.activate(armature)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in armature.data.edit_bones:
        if any(part in eb.name for part in
               ("shoulder", "elbow", "hand", "thigh", "knee", "foot")):
            y_axis = (eb.tail - eb.head).normalized()
            x_target = (Vector((1.0, 0.0, 0.0)) - y_axis * y_axis.x).normalized()
            eb.align_roll(x_target.cross(y_axis))
    bpy.ops.object.mode_set(mode="OBJECT")
    for eye in eyes:
        C.parent_to_bone(eye, armature, "neck-head")
    C.parent_to_bone(hair, armature, "neck-head")
    for group_name, bone in pinned:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature, hair] + eyes, armature


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
    # 腕のスイングは上腕ボーン(支点=肩関節)、肘の曲げは前腕ボーン
    # (支点=肘)。chest-shoulderは鎖骨方向のほぼ水平なボーンで、前後
    # スイングの軸になれない(ロール整列とあわせて貫通不具合の修正)。
    # ロール整列後の軸系: X=前後(負が前)・Z=内外(Lは負が外、Rは正が外)
    armL, armR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    foreL, foreR = "elbow.L-hand.L", "elbow.R-hand.R"
    # 脚のスイングは大腿ボーン(支点=股関節)、膝の曲げはすねボーン
    # (支点=膝)。hip-thighは骨盤の斜めコネクタで前後スイングの軸に
    # なれない(腕と同じ構造の不具合。ロール整列とあわせて修正)。
    # ロール整列後の軸系: X=前後(負が前・正が後ろ)
    legL, legR = "thigh.L-knee.L", "thigh.R-knee.R"
    shinL, shinR = "knee.L-foot.L", "knee.R-foot.R"

    head_delay = C.secondary_delay_frames(
        (Vector(JOINTS_HALF["head"]) - Vector(JOINTS_HALF["neck"])).length
        / (Vector(JOINTS_HALF["chest"]) - Vector(JOINTS_HALF["hip"])).length
    )
    idle = [
        (1, {hipc: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4), neck: (0, 0, 0)}),
        (18, {hipc: (2.5, 0, 0), armL: (-5, 0, -7), armR: (-5, 0, 7)}),
        (18 + head_delay, {neck: (-2.5, 0, 0)}, {"partial": True}),
        (36, {hipc: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4)}),
        (36 + head_delay, {neck: (0, 0, 0)}, {"partial": True}),
    ]

    # 歩行: 接地時(f1/f15)は前脚(-24)がほぼ伸び(すね4)、後脚(+24)が
    # 蹴り出しでやや曲がる(すね12)。通過時(f8/f22)は前へ運ぶ脚の膝を
    # 大きく畳み(すね40)、軸脚は伸びたまま。腰は通過時に沈む(bob)
    walk = [
        (1, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (12, 0, 0), shinR: (4, 0, 0),
             armL: (-15, 0, -4), armR: (15, 0, 4), hipc: (3, 0, 0)}),
        (8, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (40, 0, 0), shinR: (5, 0, 0),
             armL: (0, 0, -4), armR: (0, 0, 4), hipc: {"rot": (6, 0, 0), "loc": (0, -0.012, 0)}}),
        (15, {legL: (-24, 0, 0), legR: (24, 0, 0), shinL: (4, 0, 0), shinR: (12, 0, 0),
              armL: (15, 0, -4), armR: (-15, 0, 4), hipc: (3, 0, 0)}),
        (22, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (5, 0, 0), shinR: (40, 0, 0),
              armL: (0, 0, -4), armR: (0, 0, 4), hipc: {"rot": (6, 0, 0), "loc": (0, -0.012, 0)}}),
        (29, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (12, 0, 0), shinR: (4, 0, 0),
              armL: (-15, 0, -4), armR: (15, 0, 4), hipc: (3, 0, 0)}),
    ]

    attack = [
        (1, {hipc: (0, 0, 0), armR: (0, 0, 4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
        (7, {hipc: (-12, 0, -10), armR: (-112, 0, 22), foreR: (-38, 0, 0), neck: (8, 0, 0)},
         {"interp": "LINEAR"}),
        (10, {hipc: (18, 0, 12), armR: (64, 0, -8), foreR: (14, 0, 0), neck: (-12, 0, 0)}),
        (12, {hipc: (14, 0, 9), armR: (52, 0, -6), foreR: (8, 0, 0), neck: (-8, 0, 0)}),
        (22, {hipc: (0, 0, 0), armR: (0, 0, 4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
    ]

    hit = [
        (1, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4)},
         {"interp": "LINEAR"}),
        (3, {hipc: (-20, 0, 0), neck: (-14, 0, 0), armL: (-18, 0, -22), armR: (-18, 0, 22)}),
        (14, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4)}),
    ]

    die = [
        (1, {hipc: (0, 0, 0), neck: (0, 0, 0), legL: (0, 0, 0), legR: (0, 0, 0)},
         {"interp": "LINEAR"}),
        (8, {hipc: (-28, 0, 0), neck: (-18, 0, 0), legL: (10, 0, 0), legR: (8, 0, 0),
             shinL: (14, 0, 0), shinR: (10, 0, 0),
             armL: (-40, 0, -30), armR: (-40, 0, 30)}),
        (22, {hipc: (-82, 0, 0), neck: (-30, 0, 0), legL: (26, 0, 0), legR: (20, 0, 0),
              shinL: (34, 0, 0), shinR: (28, 0, 0),
              armL: (-70, 0, -46), armR: (-70, 0, 46)}),
        (26, {hipc: (-76, 0, 0), neck: (-26, 0, 0), legL: (22, 0, 0), legR: (17, 0, 0),
              shinL: (30, 0, 0), shinR: (24, 0, 0),
              armL: (-64, 0, -42), armR: (-64, 0, 42)}),
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
