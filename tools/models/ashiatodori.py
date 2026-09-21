"""
あしあとどり ―― 消えていく足跡を追いかける鳥(swarm)。

設定画(plan/models/reference-ashiatodori-sheet.png)の三面図を、全高
0.267m へ正規化した実寸マスクへ起こして測り直した造形。数値の出どころと
判定は plan/models/archive/ashiatodori-remake.md。

構造の要点:

* **頭骨が最大の記号。** 生成りのドーム + 大きな黒い眼窩2つ + 長く尖った
  嘴。96px で読めるのはこの3つだけなので、ここに面を使う。
* **羽は「芯 + 輪郭を作る羽毛」。** 滑らかな芯(卵)は隠れる前提で小さく
  作り、シルエットは `C.hair_clump` の羽毛が作る
  (handbook 3-2「輪郭を作るのは土台ではなく毛先」)。
* **霧は半透明で作らない。** 羽の先端を霧の色へ寄せて消す
  (handbook 3-27。あくびとかげの尾・きりみずちの柱下端と同じ翻訳)。
* swarm(3〜4羽同時)なので三角形は 7,000 を上限にする。
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Vector

import common as C

NAME = "ashiatodori"
HEIGHT = 0.267              # 設定画の想定身長(既存の基準表と同じ)
CLAY = (0.66, 0.63, 0.60)   # 造形レビュー用の単色

# 実測はすべて mm(全高 267mm)。モデル座標へは /1000 で入れる。
#   x: 右が +    y: 前が −(設定画の側面図は左向き = −y)    z: 上が +
#   y の原点は足の中心(側面図の足 u≈+5mm を 0 に置いた)

# ------------------------------------------------------------------ 頭骨
# 正面図の骨の幅を z ごとに実測すると、最大幅 98mm が z=190、そこから上は
# z=262 まで**楕円のまま**широ広く残り、下は z=158 で急に終わる(顎の下は羽)。
# 真球でも上下対称の楕円体でもないので、上下で半径を変える
SKULL_C = Vector((0.000, -0.098, 0.190))     # 頭骨ドームの中心(最大幅の高さ)
SKULL_R = Vector((0.049, 0.040, 0.072))      # 上半分の半径(正面幅98 / 奥行80)
SKULL_R_DOWN = 0.032                         # 下半分の z 半径(顎下 z=158)
SKULL_SEG, SKULL_RING = 22, 14
# 眼窩。正面図で中心 x=±36 z=203、径 38mm。頭骨の表面へ向きで置く
# 正面図の眼窩中心 x=±36 / z=203。楕円体の表面で x=0.036 になる向きは
# d.x = 0.036/0.049 = 0.735、z=0.013 になる向きは d.z = 0.013/0.072 = 0.18。
# 横向き成分をここまで取ると**側面図でも眼窩が見える**(設定画どおり)
SOCKET_DIR = Vector((0.735, -0.654, 0.180))
SOCKET_R = 0.0195                            # 眼窩の半径(径 39mm)
SOCKET_DEPTH = 0.0090                        # 掘り込む深さ
# 嘴。付け根(頭骨の前下)から先端へ
BEAK_ROOT = Vector((0.000, -0.124, 0.176))
BEAK_TIP = Vector((0.000, -0.176, 0.119))
BEAK_HALF_W = 0.0182                         # 付け根の半幅(正面図 44mm)
BEAK_HALF_T = 0.0112                         # 付け根の半厚
BEAK_SEG = 8

# ------------------------------------------------------------------ 胴の芯
# **縦軸の輪切りで作る。** 羽毛は「上から下へ垂れて重なる」ので、芯も
# 高さ v でパラメタ化しておかないと羽が体の面に沿わない。前後(y)の
# ロフトで作った初版は、羽の法線がすべて放射方向(x-z)になり、正面から
# 見ると胸の羽が**全部 edge-on** で「裸の卵」に見えた。スリガラスの
# `trunk_ring` / `trunk_surface` と同じ形にする。
BODY_Z0 = 0.050
BODY_SPAN = 0.146
# (v, 半幅x, 前縁y, 後縁y)。側面図の胴(羽毛を除いた塊)の実測から
BODY_RINGS = [
    (0.00, 0.0107, -0.0105, 0.0148),
    (0.10, 0.0290, -0.0378, 0.0403),
    (0.24, 0.0473, -0.0630, 0.0657),
    (0.42, 0.0613, -0.0798, 0.0806),
    (0.60, 0.0667, -0.0861, 0.0869),
    (0.78, 0.0624, -0.0798, 0.0763),
    (0.90, 0.0505, -0.0651, 0.0604),
    (1.00, 0.0301, -0.0462, 0.0360),
]
BODY_SEG = 18
BODY_RING_N = 16


def _lerp_table(table, u: float):
    """表を Catmull-Rom で引く(直線で繋ぐと折れ点が面の折り目になる)。"""
    n = len(table)
    u = min(table[-1][0], max(table[0][0], u))
    i = 0
    while i < n - 2 and u > table[i + 1][0]:
        i += 1
    t = (u - table[i][0]) / max(1e-9, table[i + 1][0] - table[i][0])
    p0 = table[max(0, i - 1)][1:]
    p1, p2 = table[i][1:], table[i + 1][1:]
    p3 = table[min(n - 1, i + 2)][1:]
    t2, t3 = t * t, t * t * t
    return tuple(0.5 * ((2 * b) + (-a + c) * t
                        + (2 * a - 5 * b + 4 * c - d) * t2
                        + (-a + 3 * b - 3 * c + d) * t3)
                 for a, b, c, d in zip(p0, p1, p2, p3))


def body_ring(v: float):
    """高さ v の断面 (半幅x, 半奥行きy, 中心y)。羽毛もこの面の上に生やす。"""
    rx, yf, yr = _lerp_table(BODY_RINGS, min(1.0, max(0.0, v)))
    return max(rx, 1e-4), max((yr - yf) * 0.5, 1e-4), (yr + yf) * 0.5


def body_surface(v: float, th: float, out: float = 0.0):
    """高さ v・角 th の胴の面の点と外向き水平法線。
    **th=0 が前(胸)、π が後ろ(尾)**。"""
    v = min(1.0, max(0.0, v))
    rx, ry, cy = body_ring(v)
    c, sn = math.cos(th), math.sin(th)
    nrm = Vector((sn / rx, -c / ry, 0.0)).normalized()
    p = Vector((rx * sn, cy - ry * c, BODY_Z0 + v * BODY_SPAN))
    return p + nrm * out, nrm


def _jitter(a: float, b: float) -> float:
    """段と枚数から決まる擬似乱数(0..1)。乱数だとビルドごとに形が変わり、
    シルエット比較の数字が再現しない(スリガラスと同じ実装)。"""
    v = math.sin(a * 12.9898 + b * 78.233) * 43758.5453
    return v - math.floor(v)


def build_core() -> bpy.types.Object:
    """羽毛の下の芯。表には出ない前提で小さく作る。"""
    sections = []
    for i in range(BODY_RING_N + 1):
        v = i / BODY_RING_N
        sections.append([tuple(body_surface(v, math.tau * k / BODY_SEG)[0])
                         for k in range(BODY_SEG)])
    return C.section_loft(f"{NAME}_core", sections, smooth=True,
                          cap_top=True, cap_bottom=True)


def _ellipsoid(name: str, center, radii, segments: int = 20, rings: int = 12,
               warp=None) -> bpy.types.Object:
    """楕円体。warp(単位方向ベクトル)->半径倍率 で局所的に凹ませられる。"""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    c, r = Vector(center), Vector(radii)
    for v in bm.verts:
        d = v.co.normalized()
        k = warp(d) if warp else 1.0
        v.co = c + Vector((d.x * r.x, d.y * r.y, d.z * r.z)) * k
    bm.to_mesh(mesh)
    bm.free()
    C.activate(obj)
    bpy.ops.object.shade_smooth()
    return obj


def build_skull() -> bpy.types.Object:
    """頭骨のドーム。眼窩は「黒い球を置く」のではなく**掘る**
    (handbook 4-73: 目は眼球より先に眼窩を作る)。"""
    dirs = [Vector((SOCKET_DIR.x * s, SOCKET_DIR.y, SOCKET_DIR.z)).normalized()
            for s in (-1.0, 1.0)]
    # 眼窩の角半径。表面上で SOCKET_R になる角度
    ang = SOCKET_R / ((SKULL_R.x + SKULL_R.y + SKULL_R.z) / 3.0)

    def warp(d):
        k = 1.0
        for e in dirs:
            a = math.acos(max(-1.0, min(1.0, d.dot(e))))
            if a < ang * 1.20:
                t = min(1.0, max(0.0, 1.0 - a / (ang * 1.35)))
                k -= (SOCKET_DEPTH / SKULL_R.y) * (t * t * (3 - 2 * t))
        # 後頭部をわずかに伸ばして卵形にする(真球は「ボール」に見える)
        k *= 1.0 + 0.06 * max(0.0, d.y) ** 2
        return k

    obj = _ellipsoid(f"{NAME}_skull", SKULL_C, SKULL_R, SKULL_SEG, SKULL_RING, warp)
    k = SKULL_R_DOWN / SKULL_R.z
    for v in obj.data.vertices:
        if v.co.z < SKULL_C.z:
            v.co.z = SKULL_C.z + (v.co.z - SKULL_C.z) * k
    obj.data.update()
    return obj


def build_beak() -> bpy.types.Object:
    """嘴。付け根は幅広で、先端へ鋭く絞る。上面はわずかに反る。"""
    axis = (BEAK_TIP - BEAK_ROOT)
    n = axis.length
    d = axis / n
    spine, width, thick = [], [], []
    for i in range(5):
        t = i / 4
        p = BEAK_ROOT + d * (n * t)
        p.z += 0.004 * math.sin(math.pi * t) * (1.0 - t)   # 上へわずかに反る
        spine.append(p)
        f = (1.0 - t) ** 0.62          # 6割の位置まで太いまま来させる(4-50)
        width.append(max(0.0012, BEAK_HALF_W * f))
        thick.append(max(0.0010, BEAK_HALF_T * f * 0.9))
    return C.hair_clump(f"{NAME}_beak", spine, width, thick, segments=BEAK_SEG)




# ------------------------------------------------------------------ 羽毛
# **スリガラスで確立した方式をそのまま使う**(`tools/models/surigarasu.py`
# 「羽毛」節 / plan/models/archive/surigarasu-remake.md)。要点は3つ:
#
# 1. 1枚は**帯(strap)**。`FEATHER_SEG` 段の板で 6 三角形しか使わない。
#    レンズ断面の立体(`C.hair_clump`)で作ると 1 枚 48 三角形で、
#    予算内に収めると枚数が足りず「ヤマアラシの針」になる。
# 2. **縞テクスチャ**(横=縞の種類、縦=根元0→先1)を 1 枚の UV 列で貼る。
#    根元が暗く先が明るい階調が無料で付き、あしあとどりの「羽の先が霧へ
#    溶ける」がそのまま出る(初版はボクセル場で同じことをやっていた)。
# 3. **胴の面に沿わせて垂らす。** 根元と先を直線で結ぶと弦が面から浮き、
#    体に刺さった平板に見える(handbook 4-43)。
STRIPES = 16
# 先頭4本は手で置く「主役の羽根」専用。縞の明るさが擬似乱数任せだと、
# 番号を指定しても地味な縞に当たる(スリガラスの実測)
HERO_STRIPES = ("mist", "mist", "light", "warm")
FEATHER_SEG = 3
FEATHER_TIP = 0.26        # 先の幅(根元の何倍か)
# 先へ一直線に細らせない。設定画の羽は槍の穂先で、6割の位置まで太いまま
# 来てそこから尖る(handbook 4-50)
FEATHER_TAPER = 1.6
FEATHER_SIZES = ((0.70, 0.85), (1.00, 1.00), (1.42, 1.18))
FEATHER_SKEW = 12.0       # 1枚ごとの傾きの振れ(度)

# 胴の羽毛の段。(名前, vの範囲, 段数, 1枚の幅, 垂れ(段の高さの何倍), 反り)
# v は 0=腹の底 → 1=背の上端。羽は**下へ**垂れて重なる。
BODY_LAYERS = [
    ("body", 0.00, 0.72, 10, 0.0150, 2.15, 0.0034),
    ("shoulder", 0.72, 1.00, 4, 0.0132, 1.70, 0.0030),
]

# 翼。稜線 (点, 半厚(X), 半翼弦(稜線に直交)) ―― 翼塊・雨覆・風切羽の土台。
# 肩(x0.030)から外・下・後ろへ伸び、先端 x0.092 / z0.086 で終える
WING_SPINE = [
    (Vector((0.028, -0.020, 0.178)), 0.0140, 0.0360),
    (Vector((0.054, -0.010, 0.152)), 0.0134, 0.0440),
    (Vector((0.078, 0.004, 0.118)), 0.0110, 0.0420),
    (Vector((0.094, 0.020, 0.084)), 0.0068, 0.0300),
]
COVERT_ROWS = 5
COVERT_SPAN = 0.90
COVERT_W = 0.0160


def _spine_at(spine, t: float):
    t = min(1.0, max(0.0, t)) * (len(spine) - 1)
    i = min(len(spine) - 2, int(t))
    k = 0.5 - 0.5 * math.cos(math.pi * (t - i))
    (p0, w0, h0), (p1, w1, h1) = spine[i], spine[i + 1]
    return (p0.lerp(p1, k), (p1 - p0).normalized(),
            w0 + (w1 - w0) * k, h0 + (h1 - h0) * k)


def _blade_point(spine, t: float, th: float, side: float, taper: float = 1.0):
    """レンズ断面の面上の点と法線。厚みは横(X)、翼弦は稜線に直交。
    **th=0 が外側の面** ―― ここをずらすと横から見える面だけ裸で残る(4-54)。"""
    p, tan, hw, hh = _spine_at(spine, t)
    e_thick = Vector((1.0, 0.0, 0.0))
    e_chord = tan.cross(e_thick)
    if e_chord.length_squared < 1e-12:
        e_chord = Vector((0.0, 0.0, 1.0))
    e_chord.normalize()
    c, sn = math.cos(th), math.sin(th)
    pt = p + e_thick * (hw * taper * c) + e_chord * (hh * taper * sn)
    nrm = (e_thick * (c / max(hw, 1e-6)) + e_chord * (sn / max(hh, 1e-6))).normalized()
    pt.x *= side
    nrm.x *= side
    return pt, nrm


def _blade(name: str, spine, side: float, rings: int = 6, seg: int = 8,
           stripe: int = 0):
    """稜線に沿ったレンズ形の立体。翼塊・中羽・風切羽・冠羽・尾羽に使う。

    **帯(`_strap`)では 90° で消える。** 輪郭に切れ込みを作る役目の羽は
    厚みのある楔で作る(スリガラスの `build_crown` と同じ判断)。
    **UV を必ず与える** ―― 縞を貼らないと結合後に (0,0) を拾って
    のっぺりした板になる(handbook 4-54)。"""
    me = bpy.data.meshes.new(name)
    co, faces, uvs = [], [], []
    sx = (stripe % STRIPES + 0.5) / STRIPES
    for i in range(rings + 1):
        t = i / rings
        taper = math.sin(math.pi * (0.12 + 0.88 * t)) ** 0.35 if t < 1.0 else 0.0
        for j in range(seg):
            p, _ = _blade_point(spine, t, j * math.tau / seg, side, max(taper, 1e-3))
            co.append(tuple(p))
    for i in range(rings):
        t0, t1 = i / rings, (i + 1) / rings
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
            uvs += [(sx, t0), (sx, t0), (sx, t1), (sx, t1)]
    faces.append(tuple(range(seg - 1, -1, -1)))
    uvs += [(sx, 0.0)] * seg
    me.from_pydata(co, [], faces)
    me.update()
    layer = me.uv_layers.new(name="UVMap")
    for i, uv in enumerate(uvs):
        layer.data[i].uv = uv
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return obj


def _wing_covers(p: Vector) -> bool:
    """点 p が翼塊の内側か。胴の羽毛を翼の下へ潜らせないための判定。
    **球で抜かない** ―― 扁平なレンズを球で抜くと肩や脇まで抉れる(4-55)。"""
    q = Vector((abs(p.x), p.y, p.z))
    e_thick = Vector((1.0, 0.0, 0.0))
    for i in range(13):
        c, tan, hw, hh = _spine_at(WING_SPINE, i / 12.0)
        e_chord = tan.cross(e_thick)
        if e_chord.length_squared < 1e-12:
            continue
        e_chord.normalize()
        d = q - c
        if abs(d.dot(tan)) > 0.012:
            continue
        if (d.x / max(hw, 1e-6)) ** 2 + (d.dot(e_chord) / max(hh, 1e-6)) ** 2 < 1.0:
            return True
    return False


def _in_skull(p: Vector, k: float = 1.06) -> bool:
    """頭骨(+嘴)の中か。骨は羽で覆わない ―― 最大の記号を隠さない。"""
    d = p - SKULL_C
    dz = d.z / (SKULL_R.z if d.z >= 0 else SKULL_R_DOWN)
    if (d.x / SKULL_R.x) ** 2 + (d.y / SKULL_R.y) ** 2 + dz ** 2 < k * k:
        return True
    axis = BEAK_TIP - BEAK_ROOT
    t = min(1.0, max(0.0, (p - BEAK_ROOT).dot(axis) / axis.length_squared))
    return (p - (BEAK_ROOT + axis * t)).length < BEAK_HALF_W * 1.4


def feather_texture():
    """羽の縞の帯。横=縞の種類、縦=根元(0)→先(1)。

    設定画の羽は「縁が霧に溶けるように半透明」。先へ向かって霧の色へ
    寄せる階調をここで持たせる ―― 別体の霧の球は 96px で泡になる
    (handbook 4-101)。全部の縞を同じだけ光らせると淡い毬になるので、
    霧へ抜ける縞・地味な縞・暖色の縞を混ぜる(スリガラスの実測)。"""
    h = 32
    img = bpy.data.images.new(f"{NAME}_feather", STRIPES, h, alpha=False)
    tops = {"mist": MIST, "light": (0.545, 0.470, 0.510),
            "warm": FEATHER_WARM, "pale": (0.620, 0.532, 0.566)}
    px = []
    for y in range(h):
        t = (y + 0.5) / h
        for x in range(STRIPES):
            if x < len(HERO_STRIPES):
                root, top, g = FEATHER_DARK, tops[HERO_STRIPES[x]], 0.62
            else:
                j = _jitter(x * 3 + 1, 7.0)
                if j > 0.86:
                    root, top, g = FEATHER_DARK, tops["mist"], 0.70
                elif j > 0.66:
                    root, top, g = FEATHER_DARK, tops["pale"], 0.85
                elif j > 0.44:
                    root, top, g = FEATHER_DARK, tops["light"], 1.00
                elif j > 0.24:
                    root, top, g = FEATHER_DARK, tops["warm"], 1.00
                else:
                    root, top, g = FEATHER_DARK, FEATHER, 1.15
            k = t ** g
            px += [*(min(0.92, a + (b - a) * k) for a, b in zip(root, top)), 1.0]
    img.pixels = px
    img.pack()
    return img


def _strap(co, faces, uvs, at, width, stripe):
    """羽1枚の帯。`at(t)` は t(0=根元 1=先)で (点, 法線) を返す。"""
    i0 = len(co)
    sx = (stripe % STRIPES + 0.5) / STRIPES
    for j in range(FEATHER_SEG + 1):
        t = j / FEATHER_SEG
        p, nrm = at(t)
        tangent = Vector((-nrm.y, nrm.x, 0.0))
        if tangent.length_squared < 1e-12:
            tangent = Vector((1.0, 0.0, 0.0))
        tangent.normalize()
        w = width * (1.0 - (1.0 - FEATHER_TIP) * t ** FEATHER_TAPER) * 0.5
        co += [tuple(p - tangent * w), tuple(p + tangent * w)]
    for j in range(FEATHER_SEG):
        a = i0 + j * 2
        faces.append((a, a + 1, a + 3, a + 2))
        uvs += [(sx, j / FEATHER_SEG), (sx, j / FEATHER_SEG),
                (sx, (j + 1) / FEATHER_SEG), (sx, (j + 1) / FEATHER_SEG)]


# 冠羽。**前後の稜線に並べる** ―― 左右 45° あたりに房を立てるとカラスでは
# なく「耳を立てたフクロウ」になる(handbook 4-50)。あしあとどりの設定画は
# 項から背へ一列。(u, 方位角(度。0=背の正中), 長さ, 幅, 起き上がり, 縞)
# 冠羽。(v, 方位角(度。0=前 180=後ろ。**0〜180 の片側だけ書く**),
# 側面図の実測では z=195〜215 の帯に体はほとんど無く、あるのは頭骨と
# **その真後ろの冠羽**だけ(y は −0.02〜+0.01)。背中の上(th≈180)から
# 立てると、頭の後ろではなく**胴の後ろ**へ大きくはみ出す。
#        長さ, 半翼弦, 起き上がり, 縞)。
# **帯ではなく楔で作る** ―― 帯は 90° で消える(スリガラス build_crown)。
# 左右は `_blade(side=-1)` で鏡にする ―― 角度の符号を変えて2本書くと、
# 翼弦の向き(稜線×X)が左右で同じにならず**非対称**になる(実測: 正面の
# z=205 で左 −59mm / 右 +84mm)
CREST = [
    (0.995, 0.0, 0.0590, 0.0210, 0.95, 0),
    (0.985, 22.0, 0.0555, 0.0200, 0.90, 2),
    (0.955, 42.0, 0.0496, 0.0190, 0.80, 3),
    (0.930, 12.0, 0.0649, 0.0215, 0.86, 1),
    (0.930, 34.0, 0.0590, 0.0205, 0.78, 3),
    (0.880, 24.0, 0.0566, 0.0205, 0.68, 0),
    (0.880, 48.0, 0.0507, 0.0195, 0.60, 2),
    (0.830, 36.0, 0.0484, 0.0190, 0.52, 1),
]
# 襟。頭骨の付け根を囲って「首」を消す。(v, 方位角(度。0=前), 長さ, 幅, 起き上がり)
RUFF = ([(0.95, a, 0.048, 0.0185, 0.46) for a in (-52, -26, 0, 26, 52)]
        + [(0.84, a, 0.054, 0.0195, 0.38) for a in (-78, -50, -22, 22, 50, 78)])
# 尾羽。後ろへ長く流れて霧へ溶ける ―― 設定画の側面で輪郭を切っているのは
# これ。(横位置の指数, 先端, 半翼弦, 半厚, 縞)
TAIL_BLADES = [
    (-3, Vector((-0.042, 0.098, 0.092)), 0.0150, 0.0026, 1),
    (-2, Vector((-0.028, 0.110, 0.104)), 0.0168, 0.0028, 0),
    (-1, Vector((-0.012, 0.118, 0.114)), 0.0180, 0.0030, 1),
    (0, Vector((0.000, 0.122, 0.120)), 0.0185, 0.0030, 0),
    (1, Vector((0.012, 0.118, 0.114)), 0.0180, 0.0030, 1),
    (2, Vector((0.028, 0.110, 0.104)), 0.0168, 0.0028, 0),
    (3, Vector((0.042, 0.098, 0.092)), 0.0150, 0.0026, 1),
]
# 中羽(median coverts)。翼面の上に数えられる大きさで4枚だけ置く(4-53)
MEDIANS = [
    (0.26, Vector((0.070, 0.026, 0.124)), 0.0180, 0.0032),
    (0.44, Vector((0.082, 0.042, 0.106)), 0.0175, 0.0031),
    (0.62, Vector((0.088, 0.058, 0.090)), 0.0165, 0.0029),
    (0.80, Vector((0.088, 0.072, 0.076)), 0.0150, 0.0027),
]
# 風切羽。翼の後縁から後下方へ伸びる長い羽。正面図の最大幅 ±100mm を作る
PRIMARIES = [
    (0.34, Vector((0.100, 0.046, 0.086)), 0.0165, 0.0026),
    (0.50, Vector((0.102, 0.062, 0.072)), 0.0165, 0.0026),
    (0.66, Vector((0.098, 0.078, 0.062)), 0.0158, 0.0025),
    (0.80, Vector((0.090, 0.092, 0.056)), 0.0148, 0.0024),
    (0.92, Vector((0.080, 0.102, 0.054)), 0.0132, 0.0022),
]


def build_feathers() -> list[bpy.types.Object]:
    """胴・襟・冠羽・尾・翼の雨覆・風切羽。帯の集まりを1メッシュにまとめる。"""
    co: list = []
    faces: list = []
    uvs: list = []
    # ---- 胴。段をまっすぐ揃えない(規則的な水平の段が「格子」の正体)
    for _name, v0, v1, rows, width, drop, curl in BODY_LAYERS:
        for row in range(rows):
            v = v0 + (row + 0.5) / rows * (v1 - v0)
            rx, ry, _cy = body_ring(v)
            cols = max(8, int(round(math.tau * (rx + ry) * 0.5 / width)))
            dv = drop * (v1 - v0) / rows
            for k in range(cols):
                j = _jitter(row + v0 * 31.0, k)
                j2 = _jitter(k * 1.7 + 5.0, row + v0 * 13.0)
                th = (k + 0.5 * (row % 2) + 0.34 * (j2 - 0.5)) * math.tau / cols
                vv = v + (j - 0.5) * dv * 0.55
                ln, wd = FEATHER_SIZES[int(j2 * 3.0) % 3]
                lift = curl * (0.7 + 0.6 * _jitter(row * 3 + 1, k))
                base, _nrm = body_surface(vv, th)
                if _wing_covers(base) or _in_skull(base):
                    continue
                # 腹の底より下へ垂らさない。下の段ほど自然に短くなる(4-51)
                dd = min(dv * ln * (0.85 + 0.30 * j), max(0.004, vv))
                skew = math.radians(FEATHER_SKEW) * (j2 - 0.5) * 2.0
                tip, _ = body_surface(vv - dd, th + skew, lift)
                if _in_skull(tip, 1.0):
                    continue
                _strap(co, faces, uvs,
                       lambda t, v=vv, th=th, dd=dd, lf=lift, sk=skew:
                           body_surface(v - dd * t, th + sk * t,
                                        lf * math.sin(math.pi * t * 0.5)),
                       width * wd * 1.15 * (0.85 + 0.30 * _jitter(k, row)),
                       int(_jitter(row * 5 + 2, k) * STRIPES))
    # ---- 襟(頭骨の付け根)。前上方へ立てて頭骨の下半分を囲う
    for (v, adeg, ln, wd, rise) in RUFF:
        th = math.radians(adeg)
        base, nrm = body_surface(v, th)
        out = (nrm * rise + Vector((0.0, -0.78, 0.62)) * (1.0 - rise * 0.5))
        out.normalize()

        def at(t, b=base, n=nrm, o=out, ln=ln):
            return b + o * (ln * t) + n * (0.004 * math.sin(math.pi * t)), n
        _strap(co, faces, uvs, at, wd, int(_jitter(v * 97.0, adeg) * STRIPES))
    # ---- 翼の雨覆
    for side in (-1.0, 1.0):
        for row in range(COVERT_ROWS):
            t0 = (row + 0.5) / COVERT_ROWS * COVERT_SPAN
            _p, _tan, hw, hh = _spine_at(WING_SPINE, t0)
            cols = max(4, int(round(math.pi * (hw + hh) * 0.5 / COVERT_W * 2)))
            for k in range(cols):
                j = _jitter(row * 3 + 1, k + side * 7.0)
                th = math.pi * (-0.78 + 1.56 * (k + 0.5 + 0.3 * (j - 0.5)) / cols)
                dt = 1.45 * COVERT_SPAN / COVERT_ROWS

                def at(t, t0=t0, th=th, side=side, dt=dt):
                    p, n = _blade_point(WING_SPINE, min(1.0, t0 + dt * t), th, side)
                    return p + n * (0.0030 * math.sin(math.pi * t * 0.5)), n
                _strap(co, faces, uvs, at, COVERT_W * 1.18 * (0.82 + 0.36 * j),
                       int(_jitter(row * 7 + 3, k * side) * STRIPES))
    me = bpy.data.meshes.new(f"{NAME}_feathers")
    me.from_pydata(co, [], faces)
    me.update()
    layer = me.uv_layers.new(name="UVMap")
    for i, uv in enumerate(uvs):
        layer.data[i].uv = uv
    obj = bpy.data.objects.new(f"{NAME}_feathers", me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return [obj]


# 頭骨の脇に大きな房を立てるのは**やってはいけない**(handbook 4-50:
# 左右 45° に房を立てるとカラスではなく「耳を立てたフクロウ」になる)。
# 実際に置いた版は、頭のまわりに角が並んだ「道化の帽子」に見えた。
# 正面図で頭の脇に見える幅は、前後の稜線に寄せた冠羽の翼弦が作る。


def build_crest() -> list[bpy.types.Object]:
    """冠羽。輪郭に切れ込みを作るのが役目なので帯ではなく厚みのある楔。
    根元は面へ寝かせ、先だけ浮かせる(handbook 4-52)。"""
    out = []
    for k, (v, adeg, ln, wd, rise, stripe) in enumerate(CREST):
        th = math.radians(adeg)
        base, nrm = body_surface(v, th)
        flow = Vector((0.0, 0.78, 0.86)).normalized()
        tang = flow - nrm * flow.dot(nrm)
        tang = tang.normalized() if tang.length_squared > 1e-9 else flow
        d = (tang * (1.0 - rise) + nrm * rise).normalized()
        mid = base + d * (ln * 0.5) + nrm * (ln * 0.10 * rise)
        tip = base + d * ln + nrm * (ln * 0.20 * rise) \
            - Vector((0.0, 0.0, ln * 0.12))
        spine = [(base - d * 0.004, wd * 0.24, wd * 0.78),
                 (mid, wd * 0.20, wd), (tip, wd * 0.06, wd * 0.26)]
        sides = (1.0,) if abs(math.sin(th)) < 1e-3 else (-1.0, 1.0)
        for side in sides:
            out.append(_blade(f"{NAME}_crest{k}{side:+.0f}", spine, side,
                              rings=5, seg=8, stripe=stripe))
    return out


def build_tail_blades() -> list[bpy.types.Object]:
    """尾羽。翼弦が稜線に直交するので、側面から**幅を持って**見える
    (帯で作ると横幅が x 方向に固定され、側面では針になる)。"""
    out = []
    for k, (i, tip, hw, ht, stripe) in enumerate(TAIL_BLADES):
        root = Vector((0.0075 * i, 0.060, 0.120 - abs(i) * 0.004))
        mid = root.lerp(tip, 0.5) + Vector((0.0, 0.0, 0.004))
        spine = [(root, ht * 1.35, hw * 0.60),
                 (mid, ht, hw), (tip, ht * 0.32, hw * 0.24)]
        out.append(_blade(f"{NAME}_tail{k}", spine, 1.0, rings=6, seg=8,
                          stripe=stripe))
    return out


def build_wings() -> list[bpy.types.Object]:
    """翼塊 + 中羽 + 風切羽。左右それぞれ 1+4+5 枚(handbook 4-53)。"""
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        out.append(_blade(f"{NAME}_wing{tag}", WING_SPINE, side,
                          rings=10, seg=12, stripe=2))
        for k, (t, tip, hw, ht) in enumerate(MEDIANS):
            root, _tan, _w, _h = _spine_at(WING_SPINE, t)
            root = Vector((root.x, root.y - 0.004, root.z + 0.004))
            mid = root.lerp(tip, 0.5)
            spine = [(root, ht * 1.3, hw * 0.55),
                     (mid, ht, hw), (tip, ht * 0.3, hw * 0.22)]
            out.append(_blade(f"{NAME}_med{tag}{k}", spine, side, rings=6, seg=8,
                              stripe=int(_jitter(k + 40, 8.0) * STRIPES)))
        for k, (t, tip, hw, ht) in enumerate(PRIMARIES):
            root, _tan, _w, _h = _spine_at(WING_SPINE, t)
            root = Vector((root.x - 0.004, root.y + 0.008, root.z - 0.006))
            mid = root.lerp(tip, 0.5) + Vector((0.0, 0.0, 0.003))
            spine = [(root, ht * 1.4, hw * 0.75),
                     (mid, ht, hw), (tip, ht * 0.35, hw * 0.28)]
            out.append(_blade(f"{NAME}_prim{tag}{k}", spine, side, rings=6, seg=8,
                              stripe=int(_jitter(k, 4.0) * STRIPES)))
    return out


# ------------------------------------------------------------------ 脚
# 正面図: 脚は x=±0.024、z=0.060 から接地。指は3本前+1本後ろ
LEG_X = 0.024
LEG_TOP = Vector((0.020, -0.024, 0.072))
LEG_KNEE = Vector((0.025, -0.014, 0.044))
LEG_ANKLE = Vector((0.023, -0.024, 0.020))
TOE_LEN = 0.040
TOE_SPREAD = (-40.0, 0.0, 40.0, 176.0)


def build_legs() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        pts = [Vector((LEG_TOP.x * side, LEG_TOP.y, LEG_TOP.z)),
               Vector((LEG_KNEE.x * side, LEG_KNEE.y, LEG_KNEE.z)),
               Vector((LEG_ANKLE.x * side, LEG_ANKLE.y, LEG_ANKLE.z)),
               Vector((LEG_ANKLE.x * side, LEG_ANKLE.y - 0.002, 0.007))]
        out.append(C.curve_tube(f"{NAME}_leg{side:+.0f}", pts,
                                [0.0086, 0.0062, 0.0052, 0.0046]))
        ankle = Vector((LEG_ANKLE.x * side, LEG_ANKLE.y - 0.002, 0.007))
        for j, deg in enumerate(TOE_SPREAD):
            a = math.radians(deg)
            d = Vector((math.sin(a) * side, -math.cos(a), 0.0))
            ln = TOE_LEN * (0.62 if j == 3 else 1.0)
            spine = [ankle,
                     ankle + d * (ln * 0.42) + Vector((0, 0, -0.0022)),
                     ankle + d * (ln * 0.80) + Vector((0, 0, -0.0040)),
                     ankle + d * ln + Vector((0, 0, -0.0052))]
            out.append(C.hair_clump(f"{NAME}_toe{side:+.0f}_{j}", spine,
                                    [0.0046, 0.0034, 0.0022, 0.0006],
                                    [0.0040, 0.0030, 0.0019, 0.0005], segments=5))
    return out


# ------------------------------------------------------------------ 組み立て
def build_blockout() -> dict:
    parts = {"skull": build_skull(), "beak": build_beak(), "core": build_core(),
             "wings": build_wings() + build_crest() + build_tail_blades(),
             "feathers": build_feathers(), "legs": build_legs()}
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for o in blockout_objects(parts):
        C.assign_material(o, clay)
    return parts


def blockout_objects(parts: dict) -> list:
    return ([parts["skull"], parts["beak"], parts["core"]]
            + parts["wings"] + parts["feathers"] + parts["legs"])


def bare_objects(parts: dict) -> list:
    """羽毛を全部外した「裸の解剖」。ここが 96px で鳥に読めないうちは
    羽毛を1枚も足さない(スリガラスの Body Anatomy Gate)。"""
    return ([parts["skull"], parts["beak"], parts["core"]]
            + parts["wings"] + parts["legs"])


# ------------------------------------------------------------------- 塗り
# 設定画のパレット(色み)と絵の中の実測(明度)を分けて使う(handbook 4-63)。
# 絵の実測 sRGB: 頭骨 (220,200,178) L203 / 嘴 (150,133,119) L137 /
# 羽 基調 (116,103,116) L108 / 羽 暗部 (87,77,88) L81 /
# 羽 明部 (145,128,141) L134 / 霧へ溶ける先 (177,161,171) L167 / 目 L41。
# **頭骨は羽の 1.88 倍**。この対比が 96px で「骨の顔」を読ませている。
#
# ダンジョンの灯りは寒色なので、中性の色をそのまま置くと実機で青へ転ぶ
# (handbook 1-38 / 4-99)。中性の羽色だけ R を B より上げて相殺する。
FEATHER = (0.396, 0.334, 0.376)
FEATHER_DARK = (0.258, 0.218, 0.246)
FEATHER_WARM = (0.470, 0.390, 0.368)      # 胴の中ほどに出る暖かい斑
MIST = (0.660, 0.572, 0.618)              # 羽の先が霧へ溶ける色
BONE = (0.880, 0.780, 0.668)
BONE_SHADE = (0.470, 0.400, 0.340)
BEAK = (0.470, 0.378, 0.318)
BEAK_TIPC = (0.320, 0.256, 0.222)
EYE = (0.062, 0.050, 0.055)
EYE_HILITE = (0.880, 0.860, 0.900)
LEG = (0.330, 0.272, 0.238)

TEX_SIZE = 384
BONE_TEX = 512
TARGET_TRIS = 9000

def _mix(a, b, t):
    t = min(1.0, max(0.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _near_leg(p: Vector) -> float:
    if p.z > 0.082:
        return 0.0
    d = min(abs(abs(p.x) - LEG_TOP.x), abs(abs(p.x) - LEG_ANKLE.x))
    if d > 0.016 or abs(p.y - LEG_ANKLE.y) > 0.048:
        return 0.0
    return min(1.0, max(0.0, (0.082 - p.z) / 0.012))


def feather_color(p: Vector, n: Vector):
    """芯と脚の Base Color。羽毛は縞テクスチャなので、ここは**羽の隙間から
    覗く下地**を描く仕事(暗めに寄せる)。"""
    leg = _near_leg(p)
    if leg > 0.5:
        return LEG
    # ① 塊の上下階調。設定画は背が明るく、腹の奥が暗い
    g = min(1.0, max(0.0, (p.z - 0.040) / 0.170))
    base = _mix(FEATHER_DARK, FEATHER, 0.30 + 0.70 * g)
    # ② 胴の中ほどの暖かい斑(位置の連続関数で描く ―― 格子ハッシュは
    #    四角い斑になる。handbook 4-16)
    warm = (math.sin(p.y * 74.0 + 1.3) * math.sin(p.z * 61.0 - 0.7)
            + 0.6 * math.sin(p.x * 95.0 + 2.1))
    w = min(1.0, max(0.0, (warm - 0.25) / 0.85)) * min(1.0, max(0.0, (0.170 - p.z) / 0.050))
    base = _mix(base, FEATHER_WARM, w * 0.34)
    # ③ 下向きの面はさらに落とす(絵として描く陰影)。
    #    羽の「根元→先」の階調は縞テクスチャ(feather_texture)が持つ
    base = _mix(base, FEATHER_DARK, max(0.0, -n.z) * 0.28)
    if leg > 0.0:
        base = _mix(base, LEG, leg)
    return base


def bone_color(p: Vector, n: Vector):
    """頭骨と嘴の Base Color。眼窩は黒く塗り、外へ**単調に**明るくする
    (明るいリングを挟むと眼鏡になる ―― handbook 4-85)。"""
    if p.y > BEAK_ROOT.y + 0.004 or p.z > BEAK_ROOT.z + 0.010:
        # 頭骨
        d = (p - SKULL_C)
        up = max(0.0, min(1.0, (d.z / SKULL_R.z + 1.0) * 0.5))
        base = _mix(BONE_SHADE, BONE, 0.22 + 0.78 * up)
        best = 0.0
        for s in (-1.0, 1.0):
            e = Vector((SOCKET_DIR.x * s, SOCKET_DIR.y, SOCKET_DIR.z)).normalized()
            surf = Vector((SKULL_R.x * e.x, SKULL_R.y * e.y, SKULL_R.z * e.z))
            c = SKULL_C + surf
            best = max(best, 1.0 - min(1.0, (p - c).length / (SOCKET_R * 0.98)))
        # 眼窩の上の眉弓と、下顎の影。骨を「つるんとした卵」にしない
        # (handbook 2-15: 隆起を明るく・窪みを暗く)
        base = _mix(base, BONE_SHADE, max(0.0, -n.z) ** 1.4 * 0.55)
        brow = 0.0
        for sgn in (-1.0, 1.0):
            e = Vector((SOCKET_DIR.x * sgn, SOCKET_DIR.y, SOCKET_DIR.z)).normalized()
            surf = Vector((SKULL_R.x * e.x, SKULL_R.y * e.y, SKULL_R.z * e.z))
            c = SKULL_C + surf + Vector((0.0, -0.002, SOCKET_R * 1.15))
            brow = max(brow, 1.0 - min(1.0, (p - c).length / (SOCKET_R * 0.85)))
        base = _mix(base, BONE_SHADE, brow * 0.42)
        if best > 0.0:
            base = _mix(base, EYE, min(1.0, best / 0.42))
            # ハイライトは眼窩の左上に小さく1点
            for s in (-1.0, 1.0):
                e = Vector((SOCKET_DIR.x * s, SOCKET_DIR.y, SOCKET_DIR.z)).normalized()
                surf = Vector((SKULL_R.x * e.x, SKULL_R.y * e.y, SKULL_R.z * e.z))
                c = SKULL_C + surf + Vector((-0.0058 * s, -0.0032, 0.0070))
                h = 1.0 - min(1.0, (p - c).length / 0.0058)
                if h > 0.0:
                    base = _mix(base, EYE_HILITE, h ** 0.6)
        return base
    # 嘴。先へ向かって暗く、上下の合わせ目に線、付け根に鼻孔
    axis = (BEAK_TIP - BEAK_ROOT)
    t = min(1.0, max(0.0, (p - BEAK_ROOT).dot(axis) / axis.length_squared))
    base = _mix(BEAK, BEAK_TIPC, t ** 0.8)
    seam = 1.0 - min(1.0, abs(n.z + 0.30) / 0.34)
    base = _mix(base, BEAK_TIPC, seam * 0.55 * min(1.0, t / 0.25))
    for s in (-1.0, 1.0):
        c = BEAK_ROOT + axis * 0.12 + Vector((0.0072 * s, 0.0, 0.0036))
        d = 1.0 - min(1.0, (p - c).length / 0.0052)
        if d > 0.0:
            base = _mix(base, EYE, d ** 0.7 * 0.85)
    return base


# ------------------------------------------------------------------- 本番モデル
# 関節。swarm(3〜4羽同時)なので最小限に絞る。ボーン名は既存の
# ashiatodori_animations() が使っているものをそのまま残す
JOINTS_HALF = {
    "body": (0.000, 0.010, 0.140),
    "head": (0.000, -0.098, 0.196),
    "tail": (0.000, 0.078, 0.108),
    "wing.L": (0.050, 0.004, 0.150),
    "leg.L": (0.020, -0.024, 0.072),
    "foot.L": (0.023, -0.026, 0.010),
}
BONES_HALF = [
    ("body", "head"), ("body", "tail"), ("body", "wing.L"),
    ("body", "leg.L"), ("leg.L", "foot.L"),
]

# 霧は**別体で作らない**。設定画の霧は体のまわり一面に漂う空気であって
# 数えられる房ではない。球を置くと 96px で「体に付いた泡」にしかならず、
# 背面からは体の上に乗る(あくびとかげの煙で同じ失敗 ―― handbook 4-101)。
# 「羽の先が霧へ溶ける」は羽の先端の塗りが担う(feather_color ③)。
MIST_RGB = (0.700, 0.600, 0.660)
MIST_EMISSION = 0.03
MIST_PUFFS: list[tuple[float, float, float, float]] = []


def build() -> tuple[list, bpy.types.Object]:
    """本番モデル(メッシュ+アーマチュア)を返す。"""
    parts = build_blockout()
    core_mat = C.make_material(f"{NAME}_core", FEATHER, roughness=0.75)
    bone_mat = C.make_material(f"{NAME}_bone", BONE, roughness=0.55)
    plume_mat = C.make_textured_material(f"{NAME}_plume", feather_texture(),
                                         roughness=0.72)
    for o in [parts["core"]] + parts["legs"]:
        C.assign_material(o, core_mat)
    for o in (parts["skull"], parts["beak"]):
        C.assign_material(o, bone_mat)
    for o in parts["wings"] + parts["feathers"]:
        C.assign_material(o, plume_mat)

    mist_mat = C.make_material(f"{NAME}_mist", MIST_RGB, roughness=0.6,
                               emission=MIST_EMISSION)
    mist_mat["noOutline"] = True
    mist = []
    for i, (x, y, z, r) in enumerate(MIST_PUFFS):
        puff = C.uv_sphere(f"{NAME}_mist{i}", (x, y, z), r, segments=8, rings=6)
        C.assign_material(puff, mist_mat)
        puff.vertex_groups.new(name="mist_pin").add(
            [v.index for v in puff.data.vertices], 1.0, "REPLACE")
        mist.append(puff)
    mist_tris = C.tri_count(mist)

    # スロット順: 0=芯・脚, 1=頭骨・嘴, 2=羽毛(縞テクスチャ)
    mesh = C.join([parts["core"]] + parts["legs"]
                  + [parts["skull"], parts["beak"]]
                  + parts["wings"] + parts["feathers"], NAME)
    C.decimate_to(mesh, TARGET_TRIS - mist_tris)
    lo, hi = C.bounds([mesh])
    scale = HEIGHT / (hi.z - lo.z)
    for v in mesh.data.vertices:
        v.co *= scale
    mesh.data.update()
    for puff in mist:
        for v in puff.data.vertices:
            v.co *= scale
        puff.data.update()
    inv = 1.0 / scale
    # UV: 羽毛は縞テクスチャの UV を自分で持っているので**上書きしない**。
    # organic_uv は全面を開き直すので、芯と骨だけを別メッシュで焼いてから
    # 合流させる ―― ではなく、羽毛の UV を退避して書き戻す
    uv = mesh.data.uv_layers.active.data
    plume_uv = {li: (uv[li].uv.x, uv[li].uv.y)
                for pol in mesh.data.polygons if pol.material_index == 2
                for li in pol.loop_indices}
    skull_c = tuple(v * scale for v in SKULL_C)
    C.organic_uv(mesh, axis=1,
                 boost=(skull_c, (SKULL_R.x + SKULL_R.z) * 0.9 * scale, 3.4))
    img_f = C.bake_albedo(mesh, lambda p, n: feather_color(p * inv, n),
                          size=TEX_SIZE, name=f"{NAME}_albedo", material_index=0)
    img_b = C.bake_albedo(mesh, lambda p, n: bone_color(p * inv, n),
                          size=BONE_TEX, name=f"{NAME}_bone_albedo", material_index=1)
    uv = mesh.data.uv_layers.active.data
    for li, val in plume_uv.items():
        uv[li].uv = val
    mesh.data.materials[0] = C.make_textured_material(f"{NAME}_core_mat", img_f,
                                                      roughness=0.75)
    mesh.data.materials[1] = C.make_textured_material(f"{NAME}_bone_mat", img_b,
                                                      roughness=0.55)
    body_h = (hi.z - lo.z) * scale
    if mist:
        mesh = C.join([mesh] + mist, NAME)
    joints = {k: Vector(v) * scale for k, v in C.mirrored(JOINTS_HALF).items()}
    armature = C.build_armature(NAME, joints, C.mirrored_bones(BONES_HALF), mesh,
                                root="body")
    if mist:
        C.pin_weight_to_bone(mesh, "mist_pin", "body-tail")
    _check(mesh, body_h)
    return [mesh, armature], armature


def _check(mesh, body_h: float) -> None:
    lo, hi = C.bounds([mesh])
    print(f"[{NAME}] 身長 {body_h:.3f}m(霧込み {hi.z - lo.z:.3f}m) "
          f"幅 {hi.x - lo.x:.3f}m 奥行き {hi.y - lo.y:.3f}m 三角形 {C.tri_count([mesh])}")
    print(f"[{NAME}] マテリアル {[m.name for m in mesh.data.materials]}")
    assert abs(body_h - HEIGHT) < 0.002, body_h
    assert lo.z > -0.003, lo.z
    assert len(mesh.data.materials) == 3 + bool(MIST_PUFFS), \
        [m.name for m in mesh.data.materials]
    assert C.tri_count([mesh]) <= TARGET_TRIS, C.tri_count([mesh])
