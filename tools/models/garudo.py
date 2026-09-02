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

import json
import math
import os

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
# Hair Cap(地肌隠し)は頭の断面をこれだけ膨らませるだけ。輪郭は毛束が作る
HAIR_CAP_OVER = 0.004
HAIR_CAP_TOP = 0.970
HAIR = (0.33, 0.25, 0.185)          # 茶色の無造作な髪(設定画の髪の平均色を実測)
CLOTH = (0.60, 0.20, 0.15)          # 腰布(赤)
APRON_WOOD = props.BARREL_WOOD      # 樽板エプロン(実物の樽と同色で統一)
HOOP = props.BARREL_IRON            # たが(鉄輪)

# 顔まわりの基準。**設定画の正面図をピクセル実測して決めた値**
# (1px=0.002282、z=(937-y)*0.002282)。頭を球で作ると設定画と別人になる
# (実測: 設定画の顔は目の高さで半幅0.071→あご0.023へ絞る卵形。球で
# 作ると髪込みのシルエット幅を頭蓋に使うことになり、あごの無い団子顔)
CHIN_Z = 0.762          # あご先(顔QAの実測)
EYE_Z = 0.8460          # 目の中心の高さ(顔QAの実測)
EYE_X = 0.0317          # 顔の中心から目の中心まで(顔QAの実測)
BROW_Z = 0.870          # 眉(顔QAの実測。目パッチ上端0.8612のすぐ上)
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

HAND_C_L = Vector((0.230, -0.004, 0.442))

# 手袋の指。設定画の手袋は指が分かれた革手袋で、全長110mm・うち指が半分。
# **ジオメトリと塗りで同じ定義を使う**(別々に持つと、指の間の線が
# ジオメトリの指とずれる)。(並びの位置, 長さ, 根元半径, 先半径, 手前への曲げ)
FINGERS = (
    (-0.018, 0.046, 0.0072, 0.0055, 0.006),
    (-0.006, 0.052, 0.0076, 0.0058, 0.008),
    (0.006, 0.048, 0.0072, 0.0055, 0.008),
    (0.017, 0.037, 0.0062, 0.0048, 0.006),
)
ARM_DIR = Vector((0.386, -0.022, -0.918))     # 肘→手の向き(+x側)
FINGER_SPREAD = Vector((0.918, 0.0, 0.386))   # 指を並べる向き(+x側)
THUMB = ((0.216, -0.010, 0.452), (0.208, -0.018, 0.436), (0.206, -0.022, 0.422))


def _finger_axes(side: float):
    """片手ぶんの指の軸(根元, 先, 半径)。sideは+1/-1"""
    arm = Vector((ARM_DIR.x * side, ARM_DIR.y, ARM_DIR.z))
    spread = Vector((FINGER_SPREAD.x * side, 0.0, FINGER_SPREAD.z))
    palm = Vector((HAND_C_L.x * side, HAND_C_L.y, HAND_C_L.z)) + arm * 0.018
    out = []
    for off, length, r0, r1, bend in FINGERS:
        base = palm + spread * off
        mid = base + arm * (length * 0.55) + Vector((0.0, -bend, 0.0))
        tip = base + arm * length + Vector((0.0, -bend * 1.4, 0.0))
        out.append((base, mid, tip, r0, r1))
    return out


# ---- 顔のデカール(design/characters/garudo/face.svg をラスタライズしたもの) ----
# 目・眉・鼻・口・頬は**SVGが唯一の情報源**。Pythonの数値で描くのをやめ、
# 2Dデザインとして独立に編集できるようにした(plan/models/garudo-face-qa.md)。
# SVGの座標系は顔一致QAのウィンドウと同一なので、QAが出す「◯mmずれ」が
# そのままSVGの座標編集になる(1 SVG単位 = 0.5mm)。
FACE_DECAL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "design", "characters", "garudo", "generated", "garudo-face-decal.png")
DECAL_PPU = 6000.0   # face.svgを--scale=3で焼いた画素密度
# face.svgは**まばたきの3状態を横に並べた1枚**(open / half / closed)。
# 同じ(x, z)へ状態ぶんの横オフセットを足して引く
DECAL_STATES = ("open", "half", "closed")
# 顔を本体から切り離す球(この中の面が顔のマテリアルになる)。
# **頭全体ではなく前面だけ**にする。頭全体を1枚に取ると、後頭部が
# タイルの大半を占めて顔の密度が半分になる(実測: 3,911→1,980 texels/unit、
# 肌IoUが0.82→0.74へ落ちた)
FACE_ISLAND_C = (0.0, -0.030, 0.852)
FACE_ISLAND_R = 0.098
FACE_ISLAND_MAX_Y = 0.004     # ここより後ろ(裏側)は顔に含めない
# 顔のアトラス1コマの解像度。顔の幅155mmに対し768pxで約5px/mm
FACE_TEX = 768
DECAL_STATE_DX = 0.32
DECAL_X0 = -0.16
DECAL_Z1 = 1.02
_decal_cache: list = []


def _face_decal():
    """デカール画像を(高さ, 幅, 4)のfloat配列で返す(上起点)"""
    if not _decal_cache:
        import numpy as np
        img = bpy.data.images.load(FACE_DECAL_PATH)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        _decal_cache.append(px.reshape(h, w, 4)[::-1])
    return _decal_cache[0]


def _decal_sample(x: float, z: float, state: int = 0):
    """
    モデル座標(x, z)でデカールを引く。(r, g, b, a)。範囲外はa=0。

    **双一次補間**で引く。最近傍(int()で切り捨て)だと、顔テクスチャの
    密度を上げてもデカールの画素の階段がそのまま出る。ついでに切り捨ては
    半画素ぶん常に手前へずれる(実測: x=0.030がfloat32では0.0299999に
    なり、隣の画素を引いて色が変わった)
    """
    dec = _face_decal()
    h, w = dec.shape[:2]
    fx = (x - DECAL_X0 + state * DECAL_STATE_DX) * DECAL_PPU - 0.5
    fy = (DECAL_Z1 - z) * DECAL_PPU - 0.5
    x0, y0 = math.floor(fx), math.floor(fy)
    if x0 < 0 or y0 < 0 or x0 + 1 >= w or y0 + 1 >= h:
        return (0.0, 0.0, 0.0, 0.0)
    tx, ty = fx - x0, fy - y0
    p = (dec[y0, x0] * (1 - tx) + dec[y0, x0 + 1] * tx) * (1 - ty) \
        + (dec[y0 + 1, x0] * (1 - tx) + dec[y0 + 1, x0 + 1] * tx) * ty
    return (float(p[0]), float(p[1]), float(p[2]), float(p[3]))


def _over(base, x: float, z: float, state: int = 0):
    """デカールを肌などの下地へ重ねる"""
    r, g, b, a = _decal_sample(x, z, state)
    if a <= 0.004:
        return base
    return (base[0] + (r - base[0]) * a,
            base[1] + (g - base[1]) * a,
            base[2] + (b - base[2]) * a)


def _atlas_h(images, name: str):
    """画像を横に並べて1枚にする(まばたきの状態アトラス)"""
    import numpy as np
    tiles = []
    for im in images:
        w, h = im.size
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        tiles.append(px.reshape(h, w, 4))
    out = np.concatenate(tiles, axis=1)
    for im in images:
        bpy.data.images.remove(im)
    img = bpy.data.images.new(name, width=out.shape[1], height=out.shape[0])
    img.pixels.foreach_set(out.ravel())
    return img


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


_HAIR_TABLE: list = []
# 毛束の中心線。塗り(_hair_color)が「どの毛束のどこか」を知るために使う
_HAIR_SPINES: list = []


def _hair_table():
    """毛束の定義(design/characters/garudo/hair-clumps.json)を読む"""
    if not _HAIR_TABLE:
        path = os.path.join(os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__)))),
            "design", "characters", "garudo", "hair-clumps.json")
        with open(path, encoding="utf-8") as fh:
            _HAIR_TABLE.append(json.load(fh))
    return _HAIR_TABLE[0]


def _head_at(z: float):
    """高さzでの頭の断面(rx, ry, cy)。HEAD_RINGSを線形で引く"""
    rings = HEAD_RINGS
    z = max(rings[0][0], min(rings[-1][0], z))
    for (z0, rx0, ry0, _cx0, cy0), (z1, rx1, ry1, _cx1, cy1) in zip(rings, rings[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / max(1e-9, z1 - z0)
            return (rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t,
                    cy0 + (cy1 - cy0) * t)
    return (rings[-1][1], rings[-1][2], rings[-1][4])


def _scalp_point(az_deg: float, z: float):
    """
    頭の表面の点。方位角は0が正面(-y)、+が+x側。

    毛束の根元をこれで置くと、**必ず頭皮の上から生える**。座標を直接
    書くと頭から浮いた根元や埋まった根元ができる
    """
    rx, ry, cy = _head_at(z)
    a = math.radians(az_deg)
    return Vector((rx * math.sin(a), cy - ry * math.cos(a), z))


def _cap_z0(az_deg: float) -> float:
    """
    Hair Capの下端(方位角ごと)。

    **capは輪郭も生え際も作ってはいけない。** 額の前でcapを低くすると、
    毛束の隙間から見えるはずの額がcapで塞がれる。実測(設定画)では
    額の露出は最高 z=0.898 まで上がるので、正面のcapはそれより上で切る。
    横〜後頭部は毛束の隙間から地肌が見えるのを防ぐため低くする。
    """
    a = abs(((az_deg + 180.0) % 360.0) - 180.0)
    table = ((0.0, 0.906), (40.0, 0.902), (60.0, 0.878), (75.0, 0.849),
             (110.0, 0.849), (150.0, 0.848), (180.0, 0.848))
    for (a0, z0), (a1, z1) in zip(table, table[1:]):
        if a0 <= a <= a1:
            t = (a - a0) / (a1 - a0)
            return z0 + (z1 - z0) * t
    return table[-1][1]


def _hair_cap():
    """
    地肌を隠すためだけの土台。**シルエットは絶対に作らせない。**

    以前の `h_base` は z0.91〜0.965 でそれ自体が輪郭になっており、
    それが「ヘルメット」の正体だった。ここでは頭の断面を
    HAIR_CAP_OVER(数mm)だけ膨らませるに留め、輪郭は毛束に任せる。

    下端は方位角ごとに変える(`_cap_z0`)。リングを積む `C.loft` では
    高さが方位角に依存する形を作れないので、ここだけ直接組む。
    正面の下端がそのまま**生え際**になる。
    """
    segments, rows = 28, 6
    mesh = bpy.data.meshes.new("h_cap")
    obj = bpy.data.objects.new("h_cap", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    cols = []
    for i in range(segments):
        az = 360.0 * i / segments - 180.0
        z0 = _cap_z0(az)
        col = []
        for r in range(rows):
            t = (r / (rows - 1)) ** 0.85
            z = z0 + (HAIR_CAP_TOP - z0) * t
            p = _scalp_point(az, z)
            rx, ry, _cy = _head_at(z)
            a = math.radians(az)
            n = Vector((math.sin(a) / rx, -math.cos(a) / ry, 0.0))
            n.normalize()
            # 下端は頭皮に着地させる。膨らませたまま切ると、後頭部で
            # capの縁が**段(棚)**として見える(実測: 背面レンダー)
            col.append(bm.verts.new(
                p + n * HAIR_CAP_OVER * min(1.0, 0.12 + r / 2.0)))
        cols.append(col)
    for i in range(segments):
        j = (i + 1) % segments
        for r in range(rows - 1):
            bm.faces.new((cols[i][r], cols[j][r], cols[j][r + 1], cols[i][r + 1]))
    bm.faces.new([c[-1] for c in cols])
    bm.faces.new(list(reversed([c[0] for c in cols])))  # 下端(頭の中で見えない)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def _hair_clump_from(clump: dict):
    """
    毛束1本。**根元は頭皮に密着し、毛先へ向かって離れる**。

    中心線は4点:
      p0 = 根元(頭皮の上)
      p1, p2 = 根元から毛先へ向かう途中。頭の表面に沿わせつつ lift だけ浮かす
      p3 = 毛先(設定画から実測した x,z と、人手で置いた y)

    lift を効かせるのが要点。一定量で頭に沿わせると殻(ヘルメット)に
    戻り、いきなり直線で飛ばすと根元が頭から浮く。
    """
    root = clump["root"]
    tip = Vector((clump["tip"]["x"], clump["tip"]["y"], clump["tip"]["z"]))
    p0 = _scalp_point(root["az"], root["z"])
    lift = clump["lift"]
    spine = [p0]
    for i, t in enumerate((0.34, 0.68), start=1):
        given = clump.get("mid")
        if given:
            # **人手で置く中間点**(設定画の毛束の分かれ目)。x,z だけ与え、
            # yは頭の表面から取る。前髪は「どこで割れるか」が額の露出を
            # 決めるので、根元と毛先の自動補間では出せない
            mx, z = given[i - 1]
            rx, _ry, _cy = _head_at(z)
            az = math.degrees(math.asin(max(-1.0, min(1.0, mx / rx))))
            if abs(root["az"]) > 90.0:
                az = 180.0 - az
            on_head = _scalp_point(az, z)
            p = on_head
        else:
            # 高さと方位角を根元から毛先へ寄せながら、頭の表面をなぞる
            z = p0.z + (tip.z - p0.z) * t
            tip_az = math.degrees(math.atan2(tip.x, -(tip.y - _head_at(z)[2])))
            az = root["az"] + (tip_az - root["az"]) * t
            on_head = _scalp_point(az, z)
            # 毛先へ向かう向きにも寄せる(まっすぐ頭に張り付いたままにしない)
            straight = p0 + (tip - p0) * t
            p = on_head.lerp(straight, t * 0.55)
        outward = Vector((on_head.x, on_head.y - _head_at(z)[2], 0.0))
        if outward.length_squared > 1e-12:
            outward.normalize()
        else:
            outward = Vector((0.0, -1.0, 0.0))
        spine.append(p + outward * lift[i])
    spine.append(tip)
    _HAIR_SPINES.append(spine)
    obj = C.hair_clump(f"h_{clump['name']}", spine,
                       clump["width"], clump["thickness"], segments=8)
    # 法線は**その毛束自身**を滑らかな立体として整える。髪全体を1つの
    # 球へ寄せると、毛束を作っても一枚のヘルメットのように光る
    C.spherize_normals(obj, tuple(spine[0].lerp(spine[-1], 0.5)),
                       radius=None, strength=0.35)
    return obj


def _hair_along(pos: Vector):
    """
    点がどの毛束のどこか。(根元→毛先の進み t, 中心線からの距離) を返す。

    毛束の構造を**塗りにも使う**ための関数。以前は
    `sin(方位角*16)` の縞を髪全体に掛けていたが、これは毛束の位置と
    無関係なので、せっかく毛束を作っても「縞のヘルメット」に見える。

    返すのは (中心線からの距離, 根元からの長さ, 毛先までの長さ)。
    **割合ではなく長さ**で返すのが要点。割合で根元を暗くすると、
    長い襟足の毛束が半分まで暗くなり、後頭部に横一本の帯が出る
    (実測: 背面レンダー)。
    """
    best = (1e9, 0.0, 1.0)
    for spine in _HAIR_SPINES:
        total = sum((b - a).length for a, b in zip(spine, spine[1:])) or 1e-9
        run = 0.0
        for a, b in zip(spine, spine[1:]):
            d = b - a
            ll = d.length_squared or 1e-12
            u = max(0.0, min(1.0, (pos - a).dot(d) / ll))
            q = a + d * u
            dist = (pos - q).length
            if dist < best[0]:
                along = run + d.length * u
                best = (dist, along, total - along)
            run += d.length
    return best[0], best[1], best[2]


def _hair_color(pos: Vector, normal: Vector):
    """
    髪: 毛束ごとに「根元が暗い・中央が基本色・上面が明るい・毛先が暗い」。

    設定画の髪は1本ずつの毛ではなく**毛束の塊**で塗られている。細い縞を
    引くのではなく、毛束の中心線に沿った弱い階調と、中心線から離れる
    ほど暗くする陰りで、毛束の境界を出す。
    """
    dist, from_root, to_tip = _hair_along(pos)
    f = 1.0
    f *= 0.79 + 0.32 * _smoothstep(0.0, 0.026, from_root)  # 根元が暗い
    f *= 1.0 - 0.26 * _smoothstep(0.030, 0.0, to_tip)      # 毛先が暗い
    f *= 1.0 - 0.40 * min(1.0, max(0.0, (dist - 0.004) / 0.012))  # 毛束の縁
    f *= 0.96 + 0.32 * max(0.0, min(1.0, (pos.z - 0.82) / 0.16))  # 上ほど明るい
    f *= 1.0 + 0.16 * max(0.0, normal.z) - 0.20 * max(0.0, -normal.z)
    if pos.y > 0.055:
        f *= 0.90                                          # 後頭部
    return _shade(HAIR, f)


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

    def almond(cx, cy, rx, ry_up, ry_down=None, power=1.65):
        """
        角の尖ったアーモンド形(超楕円)。アニメの目の輪郭。
        上下で半径を変えられる: 設定画の目は**目頭・目尻が縦の中心より
        上**にあり(実測: корner z847.8に対し上瞼858・下瞼830)、
        下まぶたが深く垂れる形をしている
        """
        ry_down = ry_up if ry_down is None else ry_down
        ry = np.where(y >= cy, ry_up, ry_down)
        d = (np.abs((x - cx) / rx) ** power + np.abs((y - cy) / ry) ** power) ** (1.0 / power)
        return 1.0 - smooth(1.0 - aa * 2.0, 1.0 + aa * 2.0, d)

    LINE = (0.12, 0.075, 0.055)
    # パッチの外周には肌を残し(顔と法線を揃えてあるので継ぎ目が出ない)、
    # その内側にアーモンド形の目を1枚の絵として描く
    px[..., :3] = np.array(SKIN, dtype=np.float32)
    paint(almond(0.0, 0.09, 0.94, 0.52, 0.90), LINE)             # 目の輪郭線
    paint(almond(0.0, 0.03, 0.86, 0.44, 0.80), (0.97, 0.96, 0.94))  # 白目
    paint(ellipse(0.0, -0.14, 0.50, 0.56), (0.30, 0.18, 0.10))   # 虹彩の縁
    paint(ellipse(0.0, -0.16, 0.38, 0.43), (0.62, 0.38, 0.17))   # 虹彩(暖色)
    paint(ellipse(0.0, -0.17, 0.17, 0.19), (0.10, 0.065, 0.05))  # 瞳
    paint(ellipse(-0.22, 0.06, 0.16, 0.15), (1.0, 1.0, 1.0))     # ハイライト大
    paint(ellipse(0.20, -0.42, 0.085, 0.08), (1.0, 1.0, 1.0))    # ハイライト小
    # 上まぶた(太い線)。虹彩の上を少し隠すとアニメの目になる
    lid = almond(0.0, 0.09, 0.94, 0.52, 0.90) * \
        (1.0 - almond(0.0, -0.10, 0.92, 0.50, 0.88))
    paint(lid, LINE)

    img = bpy.data.images.new("garudo_eye_tex", size, size, alpha=False)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def _body_color(pos: Vector, normal: Vector, state: int = 0):
    """
    融合ボディの塗り分け(距離場)+顔・前立ての焼き込み。
    優先順: 手袋 > 素肌(頭・前腕) > ズボン(ベルトより下) > シャツ。
    しきい値の段差はベルト・エプロン・ブーツの実体ジオメトリの陰に隠れる。
    """
    # 手袋(手の球距離場)。甲の明るみ+手首側を暗く
    # 手袋の範囲。手のひらの球だけで判定していたので**指先がズボンの色**に
    # なっていた(実測: レンダリングで指の先が青)。指の軸からの距離も見る
    side = 1.0 if pos.x >= 0 else -1.0
    palm_c = Vector((HAND_C_L.x * side, HAND_C_L.y, HAND_C_L.z))
    d_hand = (pos - palm_c).length - 0.020
    if d_hand > 0.075:
        # 手から離れたテクセルで指の距離を計算しない(全身のテクセルで
        # 走るので、これが無いとビルドが33秒→54秒になる実測)
        return _body_color_no_hand(pos, normal, state)
    finger_d = []
    for base, mid, tip, r0, r1 in _finger_axes(side):
        d = min(_seg_dist(pos, base, mid), _seg_dist(pos, mid, tip))
        finger_d.append(d - (r0 + r1) * 0.5)
        d_hand = min(d_hand, finger_d[-1])
    d_hand = min(d_hand, _seg_dist(pos, Vector((THUMB[0][0] * side, THUMB[0][1], THUMB[0][2])),
                                   Vector((THUMB[2][0] * side, THUMB[2][1], THUMB[2][2]))) - 0.008)
    if d_hand < 0.006:
        f = 1.0
        d_knuckle = (pos - (palm_c + Vector((0.0, -0.026, -0.004)))).length
        f *= 1.0 + 0.14 * (1.0 - _smoothstep(0.012, 0.030, d_knuckle))
        if pos.z > HAND_C_L.z + 0.020:
            f *= 0.90                                   # 手首側を暗く
        # **指の間の線を描く**。指は隙間を空けても、ボクセルの解像度では
        # 埋まってヘラになる(実測: 3.8mmボクセルでは4mmの隙間が消える)。
        # 設定画も指は接していて線で分かれているので、塗りで分ける
        near = sorted(finger_d)
        if len(near) > 1 and near[1] - near[0] < 0.0016 and near[0] < 0.004:
            f *= 0.62
        return _shade(LEATHER, f)

    return _body_color_no_hand(pos, normal, state)


def _body_color_no_hand(pos: Vector, normal: Vector, state: int = 0):
    """手袋より後ろの塗り分け(素肌・ズボン・シャツ)"""
    # 素肌: 首から上(頭はロフトの卵形なので球の距離場は使えない。
    # 胴の肩口がz0.782なので、この高さで切れば首と頭だけが残る)+
    # 前腕のカプセル(袖まくりの先)
    skin_field = _smoothstep(0.760, 0.772, pos.z)
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
            # 目・眉・鼻・口・頬はSVGのデカールから引く
            # (design/characters/garudo/face.svg が唯一の情報源)。
            # **目も顔テクスチャそのものに描く**。まばたきは顔の島だけを
            # 3コマのアトラスにしてUVをずらして切り替える。目のためだけに
            # 板を貼ると、材質・解像度・法線が本体とずれて「顔に板が
            # 乗っている」ように見えた(第6段階の顛末)
            painted = _over(SKIN, pos.x, pos.z, state)
            if painted != SKIN:
                return painted

        # 顔の描き込み陰影(規約3)。トゥーン階調に頼らず、絵として
        # 「この面は少し暗い」を焼き込む: 前髪の落ち影・こめかみ・
        # あご下・首。照明が変わっても顔の立体が壊れない
        shade = 0.0
        shade = max(shade, 0.55 * _smoothstep(0.900, 0.930, pos.z))       # 前髪の影
        shade = max(shade, 0.30 * _smoothstep(0.050, 0.072, abs(pos.x)))  # こめかみ
        shade = max(shade, 0.45 * (1.0 - _smoothstep(0.762, 0.800, pos.z)))  # あご下
        # 首の影。**zだけで段を作ると、あごを横切る水平な継ぎ目**が
        # 顔に出る(実測: 口の高さに顔幅いっぱいの境目)。首はあごの
        # 奥(+y)にあるので、yでも絞ってなだらかに落とす
        shade = max(shade, 0.50 * _smoothstep(0.800, 0.775, pos.z)
                    * _smoothstep(-0.020, 0.004, pos.y))
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
        # 手袋。設定画は**指の分かれた革手袋**なので、手のひらの球に
        # 指を4本足す(それまでは丸い塊=ミトンだった)。指は腕の向きへ
        # 伸ばし、手前へ少し曲げる
        # 設定画の手袋は手首の折り返しから指先まで約110mm、うち**指が
        # 半分**。手のひらを球1個で埋めると指を出す余地が無い
        glove = C.uv_sphere(f"g_glove{s}", (s * HAND_C_L.x, HAND_C_L.y, HAND_C_L.z),
                            0.024, scale=(0.95, 1.0, 1.05))
        organic.append(glove)
        organic.append(C.curve_tube(
            f"g_thumb{s}", [(p[0] * s, p[1], p[2]) for p in THUMB],
            [0.0090, 0.0078, 0.0062]))
        for i, (base, mid, tip, r0, r1) in enumerate(_finger_axes(s)):
            organic.append(C.curve_tube(
                f"g_finger{s}_{i}", [tuple(base), tuple(mid), tuple(tip)],
                [r0, (r0 + r1) * 0.5, r1]))
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
    # ボクセルは指(直径12〜16mm)が潰れない細かさが要る。6mmだと
    # 指が手のひらへ吸われてミトンに戻る。上限を主人公だけ広げたので
    # 三角形も増やせる(tests/models.test.ts の予算表)
    body = C.sculpt_merge(NAME, organic, voxel=0.0038, target_tris=9000,
                          clean_input=True)
    # 直立キャラ: 前後split(顔をシームが横切らない)。頭部を独立島に
    # 切り出して2.5倍へ拡大し、「テクスチャの絵」として描き込む顔に
    # 十分なテクセル密度を寄せる(商用トゥーンRPGの顔はほぼテクスチャで
    # 成立しているという指摘への対応)
    # 顔のテクセル密度を上げ、目パッチとの差を詰める。顔が0.9px/mm・
    # パッチが5.3px/mmだと、ぼけた顔の上に鋭い目のシールが貼ってある
    # ように見える(レンダリングで目だけ板に見えた一因)。
    # glbは700KBまでなので本体テクスチャは512のまま、**UVの取り分**で
    # 稼ぐ(実測: boost 2.5→5.0 で顔 894→1212 texels/unit。6.0まで
    # 上げても1232で頭打ちになり、他の島の最低密度だけが落ちる)
    # 顔は**本体とは別のマテリアル**にする。まばたきで
    # open / half / closed を切り替えるため、顔の島だけを3コマ横に
    # 並べたアトラスにしたいから。目のためだけに板を貼るのはやめた
    # (材質・解像度・法線が本体とずれて「顔に板が乗って」見えた)
    C.organic_uv(body, axis=1, boost=(FACE_ISLAND_C, FACE_ISLAND_R, 1.0, FACE_ISLAND_MAX_Y))
    C.uv_report(body, size=1024, regions={"face": (FACE_ISLAND_C, 0.09)})
    face_polys = C.split_material_region(body, FACE_ISLAND_C, FACE_ISLAND_R,
                                        max_y=FACE_ISLAND_MAX_Y)
    if not face_polys:
        raise RuntimeError("顔の島を切り出せなかった")
    body_img = C.bake_albedo(body, _body_color, size=1024,
                             name="garudo_albedo", material_index=0)
    tiles = [C.bake_albedo(body, (lambda k: lambda p, n: _body_color(p, n, k))(k),
                           size=FACE_TEX, name=f"garudo_face_{st}",
                           material_index=1)
             for k, st in enumerate(DECAL_STATES)]
    face_img = _atlas_h(tiles, "garudo_face_atlas")
    # 顔の島のUVを左端のコマへ詰める。実行時はoffset.xに k/3 を足すだけで
    # 状態が切り替わる(three.jsは uv*repeat + offset)
    uv = body.data.uv_layers.active.data
    for poly in body.data.polygons:
        if poly.material_index == 1:
            for li in poly.loop_indices:
                uv[li].uv[0] /= len(DECAL_STATES)
    body.data.materials[0] = C.make_textured_material("garudo_body", body_img,
                                                      roughness=0.8)
    body.data.materials[1] = C.make_textured_material("garudo_face", face_img,
                                                      roughness=0.8)
    # まばたきの指定はノードのextrasで運ぶ(src/view/blink.ts)
    body["blink"] = "eyelid"
    body["blinkTiles"] = len(DECAL_STATES)
    body["blinkMaterial"] = "garudo_face"
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


    # まばたきが成立する条件を組み立て時に確かめる:
    # **状態によって顔の色が変わること**。デカールの状態切り替えが
    # 効いていないと、見た目は正常なのにまばたきだけ静かに止まる
    probe = Vector((EYE_X, -0.060, EYE_Z))
    n = Vector((0.0, -1.0, 0.0))
    assert _body_color(probe, n, 0) != _body_color(probe, n, 2), \
        "目の位置で open と closed の色が同じ(まばたきが効かない)"

    # ================= 髪(立体的な大きな毛束) =================
    # plan/models/garudo-hair-clumps.md。板(_hair_card)と頭皮に沿う殻
    # (_hair_shell)をやめ、3層に分ける:
    #
    #   Hair Cap  →  Major Clumps  →  Painted Detail
    #   (地肌隠し)     (シルエット)      (毛の流れ)
    #
    # 毛束は design/characters/garudo/hair-clumps.json から読む。
    # 毛先は設定画から実測した値(tools/trace_hair_clumps.py)。
    cap = _hair_cap()
    clumps = [_hair_clump_from(c) for c in _hair_table()["clumps"]]
    # **capが輪郭を作っていないことを機械で確かめる。** 目で見ても
    # 「髪の塊」にしか見えず気付けない(旧h_baseがそうだった)
    # capは後頭部では表面そのものでよい(仕様2-5)が、**輪郭を作っては
    # いけない**。高さごとに「capより毛束の方が外にあるか」で見る。
    # 面の包含(silhouette_inside)で見ると後頭部が常に外れて判定に
    # ならなかった(実測: 側面33.6%・上面26.1%)
    over_x = C.wider_than([cap], clumps, axis=0, min_width=0.045)
    over_y = C.wider_than([cap], clumps, axis=1, min_width=0.045)
    print(f"  [hair] capが輪郭を作る高さ 正面{over_x:.0%} 側面{over_y:.0%}")
    # 残る2段(z0.940/0.948)は**頭そのものが設定画より6mm大きい**ため
    # (顔一致QAの「髪の最大幅の高さz」参照。plan/models/garudo-face-qa.md
    # の残差詰めで頭頂を絞ると消える)。髪側の問題ではないので許容する
    # 残る2段(z0.940/0.948)は**頭そのものが設定画より6mm大きい**ため
    # (顔一致QAの「髪の最大幅の高さz」。plan/models/garudo-face-qa.md の
    # 残差詰めで頭頂を絞れば消える)。髪側の問題ではないので許容する
    # 側面が高いのは正しい(仕様2-5: 後頭部の中央はCap主体)。
    # 見るのは正面。ここが0でないと「輪郭を作るのは毛先」になっていない
    assert over_x < 0.05, f"Hair Capが正面の輪郭を作っている({over_x:.0%})"

    hair = C.join([cap] + clumps, "garudo_hair")
    # 髪も手描き: 上を明るく・房の流れの筋(3D位置から描くのでSmart UVの
    # 島割れは問題にならない)。法線は頭の球へ寄せ、板の重なりの
    # デコボコ陰影を抑える(規約4)
    C.smart_uv(hair)
    hair_img = C.bake_albedo(hair, _hair_color, size=256, name="garudo_hair_tex")
    C.assign_material(hair, C.make_textured_material("garudo_hair", hair_img,
                                                     roughness=0.8))
    # **髪全体を1つの球へ寄せる法線補正はしない。** 顔には有効だが、髪に
    # 掛けるとせっかく毛束を作っても一枚の丸いヘルメットのように光る。
    # 法線は毛束ごとに整えてある(_hair_clump_from の中で、その毛束の
    # 中心線を軸とする円柱へ寄せる)

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
        # 設定画は編み上げの作業靴で、**一番広いのは丸く張り出した
        # つま先**(足首ではない)。正面95%の高さで設定画209px・
        # モデル178pxと43mm足りなかったのは、つま先が細かったため
        shoe = C.loft(f"garudo_shoe{s}", [
            (0.000, 0.050, 0.026, 0.0, 0.028),
            (0.022, 0.064, 0.034, 0.0, 0.032),
            (0.060, 0.068, 0.036, 0.0, 0.030),
            (0.100, 0.072, 0.032, 0.0, 0.026),
            (0.132, 0.071, 0.026, 0.0, 0.021),
            (0.156, 0.058, 0.019, 0.0, 0.017),
            (0.166, 0.032, 0.012, 0.0, 0.015),
        ], segments=14)
        shoe.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        shoe.location = (0.0, 0.045, 0.0)
        C.activate(shoe)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(shoe)
        # 靴底(前へ少しはみ出す板)+ヒール
        # 靴底は**甲より小さく**する。箱の角が回転して靴の丸みより外へ
        # はみ出し、接地面に平たいツバが出ていた(重ねると足元だけ
        # 一直線に青が伸びる)
        parts.append(C.box(f"garudo_sole{s}", (0.0, -0.012, 0.009),
                           (0.112, 0.186, 0.018), bevel=0.006))
        parts.append(C.box(f"garudo_heel{s}", (0.0, 0.034, 0.021),
                           (0.096, 0.054, 0.026), bevel=0.005))
        # すね(履き口へ細くなる)+折り返し
        # すねは円錐(直線)ではなくロフト。足首側だけ張り出す形にしないと、
        # ブーツの高さ(正面95%)を合わせるとすね(88%)が太くなる
        parts.append(C.loft(f"garudo_shaft{s}", [
            (0.046, 0.058, 0.055, 0.0, 0.004),
            (0.068, 0.050, 0.048, 0.0, 0.004),
            (0.110, 0.046, 0.044, 0.0, 0.004),
            (0.159, 0.043, 0.042, 0.0, 0.004),
        ], segments=14))
        parts.append(C.cylinder(f"garudo_cuff{s}", (0.0, 0.004, 0.166), 0.050, 0.026,
                                segments=14))
        boot = C.join(parts, f"garudo_boot{s}")
        # つま先を外へ開く(設定画の立ち方)
        boot.rotation_euler = (0.0, 0.0, math.radians(28.0 * s))
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
    C.parent_to_bone(hair, armature, "neck-head")
    for group_name, bone in pinned:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature, hair], armature


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
