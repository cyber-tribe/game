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
# (y, z, 半幅x, 半高z)。側面図の胴(羽毛を除いた塊)の実測から。
# 羽毛がこの外側 20〜60mm を覆うので、芯は設定画の輪郭より一回り小さい
CORE_SECTIONS = [
    (-0.068, 0.148, 0.026, 0.028),
    (-0.046, 0.143, 0.044, 0.046),
    (-0.018, 0.136, 0.055, 0.056),
    (+0.012, 0.132, 0.057, 0.057),
    (+0.038, 0.129, 0.050, 0.052),
    (+0.058, 0.127, 0.036, 0.040),
    (+0.072, 0.126, 0.018, 0.022),
]
CORE_SEG = 16


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
            if a < ang * 1.35:
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


def build_core() -> bpy.types.Object:
    """羽毛の下の芯。表には出ない前提で小さく作る。"""
    sections = []
    for (y, z, rx, rz) in CORE_SECTIONS:
        ring = []
        for k in range(CORE_SEG):
            a = math.tau * k / CORE_SEG
            ring.append((rx * math.cos(a), y, z + rz * math.sin(a)))
        sections.append(ring)
    return C.section_loft(f"{NAME}_core", sections, smooth=True,
                          cap_top=True, cap_bottom=True)


# ------------------------------------------------------------------ 羽毛
# 1行 = (名前, 枚数, 根元始, 根元終, 先始, 先終, 半幅始, 半幅終, 反り)
# 左右対称の行は x の符号を反転してもう一度作る。根元→先は直線で結ばず、
# 中点を「反り」だけずらした二次ベジェで引く(handbook 4-43/4-52)。
FeatherRow = tuple
FEATHER_ROWS: list[FeatherRow] = [
    # 襟。頭骨の付け根をぐるりと囲う短い羽
    ("ruff", 4,
     (0.014, -0.074, 0.174), (0.048, -0.038, 0.166),
     (0.018, -0.098, 0.138), (0.068, -0.050, 0.126),
     0.0165, 0.0182, (0.004, -0.008, -0.006)),
    # 項。頭骨の後ろと冠羽の間を埋める ―― ここが空くと「首が見える」。
    # 設定画のあしあとどりに首は無く、羽が頭骨の際まで来ている
    ("nape", 3,
     (0.012, -0.066, 0.176), (0.046, -0.052, 0.164),
     (0.020, -0.050, 0.196), (0.050, -0.030, 0.186),
     0.0180, 0.0195, (0.004, -0.008, 0.006)),
    # 喉。嘴の下から顎へ回り込む
    ("throat", 3,
     (0.008, -0.088, 0.152), (0.028, -0.070, 0.140),
     (0.010, -0.116, 0.124), (0.038, -0.098, 0.108),
     0.0170, 0.0180, (0.003, -0.006, -0.004)),
    # 冠羽。項を横切る一列。内側ほど長く高い(左右 45°へ大きな房を立てると
    # カラスではなく「耳を立てたフクロウ」になる ―― handbook 4-50)
    ("crest", 5,
     (0.018, -0.050, 0.192), (0.050, -0.032, 0.174),
     (0.042, -0.030, 0.252), (0.060, -0.004, 0.214),
     0.0150, 0.0185, (0.002, -0.012, 0.010)),
    # 背中。冠羽の後ろから尾へ、寝かせて並べる
    ("back", 4,
     (0.012, -0.006, 0.190), (0.040, 0.040, 0.168),
     (0.016, 0.040, 0.202), (0.056, 0.084, 0.158),
     0.0200, 0.0210, (0.002, -0.008, 0.008)),
    # 翼面。大きな1枚で翼の塊を作る(handbook 4-53: 大きな翼面 → 中羽 → 風切羽)
    ("wing_plate", 2,
     (0.050, -0.022, 0.164), (0.052, 0.022, 0.154),
     (0.088, 0.010, 0.110), (0.082, 0.056, 0.098),
     0.0300, 0.0280, (0.014, -0.004, 0.006)),
    # 雨覆(中羽)。翼面の上に一段重ねる
    ("covert", 3,
     (0.044, -0.026, 0.172), (0.050, 0.022, 0.162),
     (0.062, 0.000, 0.124), (0.060, 0.050, 0.110),
     0.0235, 0.0230, (0.010, -0.004, 0.008)),
    # 風切羽。正面図の最大幅(±100mm)を作る長い羽
    ("primary", 5,
     (0.052, -0.018, 0.136), (0.054, 0.034, 0.128),
     (0.096, 0.004, 0.084), (0.078, 0.070, 0.076),
     0.0185, 0.0175, (0.012, -0.004, 0.010)),
    # 尾。後ろへ長く流れ、わずかに下がって霧へ溶ける
    ("tail", 4,
     (0.008, 0.056, 0.132), (0.030, 0.050, 0.104),
     (0.012, 0.110, 0.118), (0.048, 0.100, 0.070),
     0.0190, 0.0185, (0.002, -0.012, 0.004)),
    # 脇腹
    ("flank", 4,
     (0.044, -0.028, 0.118), (0.044, 0.040, 0.110),
     (0.040, 0.010, 0.068), (0.042, 0.064, 0.064),
     0.0170, 0.0165, (0.006, -0.004, 0.004)),
    # 胸。嘴の下を埋める
    ("breast", 4,
     (0.010, -0.058, 0.148), (0.036, -0.038, 0.118),
     (0.013, -0.092, 0.080), (0.050, -0.062, 0.058),
     0.0160, 0.0172, (0.004, -0.008, 0.002)),
    # 腹の裾。脚の間まで垂れて、正面図の「脚のまわりの毛」を作る
    ("skirt", 4,
     (0.008, -0.016, 0.100), (0.032, 0.030, 0.096),
     (0.010, -0.010, 0.042), (0.034, 0.040, 0.046),
     0.0178, 0.0172, (0.002, -0.004, -0.008)),
]
FEATHER_SEG = 6


def _bezier(p0: Vector, p1: Vector, p2: Vector, t: float) -> Vector:
    u = 1.0 - t
    return p0 * (u * u) + p1 * (2 * u * t) + p2 * (t * t)


def feather_spines() -> list[tuple[str, list[Vector], list[float], list[float]]]:
    """羽毛1枚ぶんの (行名, 中心線, 半幅, 半厚) を全部返す。
    造形と塗りが同じ表を見るようにする(あくびとかげの鱗板と同じ理由)。"""
    out = []
    for (label, n, r0, r1, t0, t1, w0, w1, bend) in FEATHER_ROWS:
        for side in (-1.0, 1.0):
            sx = side
            for i in range(n):
                s = i / max(1, n - 1)
                root = Vector((sx * (r0[0] + (r1[0] - r0[0]) * s),
                               r0[1] + (r1[1] - r0[1]) * s,
                               r0[2] + (r1[2] - r0[2]) * s))
                tip = Vector((sx * (t0[0] + (t1[0] - t0[0]) * s),
                              t0[1] + (t1[1] - t0[1]) * s,
                              t0[2] + (t1[2] - t0[2]) * s))
                w = w0 + (w1 - w0) * s
                b = Vector((sx * bend[0], bend[1], bend[2]))
                ctrl = (root + tip) * 0.5 + b
                spine = [_bezier(root, ctrl, tip, u) for u in (0.0, 0.34, 0.66, 0.88, 1.0)]
                width = [w * f for f in (0.62, 1.0, 0.86, 0.48, 0.02)]
                thick = [w * f * 0.30 for f in (0.75, 1.0, 0.82, 0.44, 0.02)]
                out.append((label, spine, width, thick))
    return out


def build_feathers() -> list[bpy.types.Object]:
    return [C.hair_clump(f"{NAME}_f{label}{i}", spine, width, thick,
                         segments=FEATHER_SEG)
            for i, (label, spine, width, thick) in enumerate(feather_spines())]


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
             "feathers": build_feathers(), "legs": build_legs()}
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for o in ([parts["skull"], parts["beak"], parts["core"]]
              + parts["feathers"] + parts["legs"]):
        C.assign_material(o, clay)
    return parts


def blockout_objects(parts: dict) -> list:
    return ([parts["skull"], parts["beak"], parts["core"]]
            + parts["feathers"] + parts["legs"])


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
BONE_SHADE = (0.560, 0.480, 0.412)
BEAK = (0.620, 0.512, 0.448)
BEAK_TIPC = (0.430, 0.352, 0.312)
EYE = (0.062, 0.050, 0.055)
EYE_HILITE = (0.880, 0.860, 0.900)
LEG = (0.330, 0.272, 0.238)

TEX_SIZE = 768
BONE_TEX = 512
TARGET_TRIS = 6600

# 羽の「根元→先」の場。テクセルごとに 70 枚の羽を最近傍探索すると遅いので、
# 粗いボクセルへ先に焼いて 1 回の添字引きで済ませる(handbook 4-16)
_TIP_CELL = 0.0045
_tip_field = None
_tip_origin = None
_tip_shape = None


def _build_tip_field():
    """各セルに「そこを覆っている羽の t(0=根元, 1=先)」の最大値を入れる。"""
    global _tip_field, _tip_origin, _tip_shape
    import numpy as np
    lo = Vector((-0.120, -0.200, -0.010))
    hi = Vector((0.120, 0.140, 0.290))
    shape = tuple(int((hi[i] - lo[i]) / _TIP_CELL) + 1 for i in range(3))
    field = np.zeros(shape, dtype="float32")
    for (_label, spine, width, _thick) in feather_spines():
        for k in range(len(spine) - 1):
            for sub in range(4):
                u = (k + sub / 4.0) / (len(spine) - 1)
                p = spine[k].lerp(spine[k + 1], sub / 4.0)
                w = width[k] * 1.25 + 0.0035
                i0 = [max(0, int((p[i] - w - lo[i]) / _TIP_CELL)) for i in range(3)]
                i1 = [min(shape[i] - 1, int((p[i] + w - lo[i]) / _TIP_CELL)) for i in range(3)]
                sl = tuple(slice(i0[i], i1[i] + 1) for i in range(3))
                np.maximum(field[sl], u, out=field[sl])
    _tip_field, _tip_origin, _tip_shape = field, lo, shape


def tip_at(p: Vector) -> float:
    if _tip_field is None:
        _build_tip_field()
    idx = [int((p[i] - _tip_origin[i]) / _TIP_CELL) for i in range(3)]
    for i in range(3):
        if idx[i] < 0 or idx[i] >= _tip_shape[i]:
            return 0.0
    return float(_tip_field[idx[0], idx[1], idx[2]])


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
    """羽・芯・脚の Base Color。"""
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
    # ③ 羽の根元は次の羽に隠れて暗く、先は霧へ溶けて明るい
    t = tip_at(p)
    if t > 0.0:
        base = _mix(base, FEATHER_DARK, max(0.0, 0.42 - t * 1.5))
        base = _mix(base, MIST, max(0.0, (t - 0.68) / 0.32) ** 1.4)
    # ④ 下向きの面はさらに落とす(絵として描く陰影)
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
        base = _mix(BONE_SHADE, BONE, 0.34 + 0.66 * up)
        best = 0.0
        for s in (-1.0, 1.0):
            e = Vector((SOCKET_DIR.x * s, SOCKET_DIR.y, SOCKET_DIR.z)).normalized()
            surf = Vector((SKULL_R.x * e.x, SKULL_R.y * e.y, SKULL_R.z * e.z))
            c = SKULL_C + surf
            best = max(best, 1.0 - min(1.0, (p - c).length / (SOCKET_R * 1.12)))
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
    feather_mat = C.make_material(f"{NAME}_feather", FEATHER, roughness=0.75)
    bone_mat = C.make_material(f"{NAME}_bone", BONE, roughness=0.55)
    for o in [parts["core"]] + parts["feathers"] + parts["legs"]:
        C.assign_material(o, feather_mat)
    for o in (parts["skull"], parts["beak"]):
        C.assign_material(o, bone_mat)

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

    mesh = C.join([parts["core"]] + parts["feathers"] + parts["legs"]
                  + [parts["skull"], parts["beak"]], NAME)
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
    # UV: 立ち姿で正面・背面に模様があるので前後(y)でシームを引き、
    # 頭骨だけ boost で独立した島に切り出して密度を寄せる
    skull_c = tuple(v * scale for v in SKULL_C)
    C.organic_uv(mesh, axis=1,
                 boost=(skull_c, (SKULL_R.x + SKULL_R.z) * 0.9 * scale, 2.6))
    img_f = C.bake_albedo(mesh, lambda p, n: feather_color(p * inv, n),
                          size=TEX_SIZE, name=f"{NAME}_albedo", material_index=0)
    img_b = C.bake_albedo(mesh, lambda p, n: bone_color(p * inv, n),
                          size=BONE_TEX, name=f"{NAME}_bone_albedo", material_index=1)
    mesh.data.materials[0] = C.make_textured_material(f"{NAME}_feather_mat", img_f,
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
    assert len(mesh.data.materials) == 2 + bool(MIST_PUFFS), \
        [m.name for m in mesh.data.materials]
    assert C.tri_count([mesh]) <= TARGET_TRIS, C.tri_count([mesh])
