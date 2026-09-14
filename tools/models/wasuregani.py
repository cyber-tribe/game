"""
ワスレガニ ―― 設定画(`plan/models/reference-wasuregani-sheet.png`)から。

このモジュールが本番の造形。`monsters.MONSTERS` から呼ばれる
(monsters.py には状態アニメーション `wasuregani_animations` だけが残る)。

旧モデルは「honegarami と同じ人型骨組み」の直立二足に背へ球の甲羅を重ね、
両手を小さな鋏に変え、目を水色に発光させた青緑の姿で、設定画とは別物だった。

# 方針 ―― スリガラスで確立した手順(`handbook/modeling-pitfalls.md` 4-39)

**外周ではなく内側の線を測り、裸の解剖を先に作る。** 外周(甲羅+脚+鋏)から
胴を起こすと、輪郭そのものが体になってしまう。判定は「脚・鋏・目を外した
甲羅だけ、または無地の裸のボディが 96px でカニに読めるか」。

# 縮尺

設定画の攻撃パターン ③ で、カニと人影が**同じ地面に立っている**。実測で
カニ 82px / 人影 72px。主人公ガルド(0.97m)基準なら設定画どおりは約1.1m
だが、F7 の通常出現としては最大級になりすぎるため、全高は **0.80m**
(オオネボスケ 0.836 級)に決めた ―― 三面図の比率はそのまま使う。

    三面図 正面マスク 186 x 157px が 0.948 x 0.800m → 1px = SC m

# 実測(設定画の**内側**の線)

| 部位 | 寸法 |
|---|---|
| 甲羅 | 幅 168px(856mm)× 奥行き 154px(785mm)× 高さ 95px(484mm) |
| 甲羅の縁 | 地面から 61px(311mm) |
| 目 | 径 12px(61mm)、甲羅の前縁の下、中心間 39px(197mm) |
| 鋏 | 長さ 約 66px(336mm)。前方へ突き出す |
| 脚 | 幅 8px(41mm)の細い脚が3対 |
"""
import math

import bpy
from mathutils import Vector

import common as C

NAME = "wasuregani"

SC = 0.80 / 157.0         # m / 設定画1px(正面マスク 157px = 0.80m)
HEIGHT = 0.80             # 基準身長(tests/helpers/modelBaseline.ts を更新する)
FRONT_CX = 682.0          # 正面図の体の中心(sheet x)
FRONT_GROUND = 311.0      # 正面図の接地(sheet y)
SIDE_CY = 903.5           # 側面図の体の前後中心(sheet x)
SIDE_GROUND = 313.0       # 側面図の接地(sheet y)

# ============================================================ パレット
# **設定画から直接サンプリングした値。** 三面図のマスクを k-means で分けた
# 明度分布は L40(10%)/68(17%)/89(20%)/111(21%)/133(20%)/160(10%)/211(2%)、
# 平均 103.0・標準偏差 37.9。スリガラス(平均77)より明るい**石の灰**で、
# 黒い生き物ではない。
SHEET = {
    "shell":     (126, 118, 120),   # 殻(メイン)くすんだ灰。やや紫寄り
    "shelldark": (84, 85, 95),      # 殻(影)青灰。側面の後ろ側で実測
    "shelllite": (160, 152, 150),   # 殻(ハイライト)
    "rim":       (46, 44, 48),      # 殻の縁・溝。ほぼ黒
    "limb":      (135, 124, 115),   # 足・ハサミ(メイン)暖かい灰
    "limblite":  (185, 163, 144),   # ハサミの明部
    "limbdark":  (76, 67, 64),      # 足・ハサミ(影)
    "eye":       (27, 27, 26),      # 目。ほぼ黒
    "paper":     (168, 152, 136),   # 記憶のカケラ(紙)
    "moss":      (121, 109, 99),    # 苔・藻
}

# ゲームの灯りは寒色なので、設定画の値をそのまま置くと画面では青く沈む。
# **明度は動かさず色みだけ回す**(`modeling-pitfalls.md` 4-49)。回す強さは
# 色ごと ―― 一律に掛けると明るい差し色が金色に転ぶ。
TINT_FIX = (1.237, 1.078, 0.672)
TINT_W = {
    "shell": 0.85, "shelldark": 1.00, "shelllite": 0.55, "rim": 1.00,
    "limb": 0.55, "limblite": 0.30, "limbdark": 0.90,
    "eye": 1.00, "paper": 0.30, "moss": 0.45,
}


def _tint(rgb, w: float = 1.0):
    """色みだけ回す(明度は保つ)。"""
    if w <= 0.0:
        return tuple(min(1.0, max(0.0, x)) for x in rgb)
    fix = [1.0 + (f - 1.0) * w for f in TINT_FIX]
    out = [a * b for a, b in zip(rgb, fix)]
    m0, m1 = sum(rgb) / 3.0, sum(out) / 3.0
    if m1 > 1e-6:
        out = [x * m0 / m1 for x in out]
    return tuple(min(1.0, max(0.0, x)) for x in out)


def _srgb(key: str, k: float = 1.0):
    return _tint([v / 255.0 * k for v in SHEET[key]], TINT_W.get(key, 1.0))


def _mat(key: str, k: float = 1.0, rough: float = 0.75):
    return C.make_material(f"{NAME}_{key}", _srgb(key, k), roughness=rough)


def _jitter(a: float, b: float) -> float:
    v = math.sin(a * 12.9898 + b * 78.233) * 43758.5453
    return v - math.floor(v)


def _lerp_table(table, u: float):
    """表を Catmull-Rom で引く(4-32 / 4-40)。直線でも余弦でも繋がない。"""
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


# ============================================================ 甲羅
# v は甲羅の高さの正規化(0=縁 1=天辺)。
# (v, 半幅rx, 半奥行きry, 前後の中心cy)
#
# 正面図から rx、側面図から ry と cy を読む。**前後の中心はわずかに前**
# ―― 側面図の甲羅は前へ庇のように張り出し、その下に目が入る。
SHELL_Z0 = 0.311          # 甲羅の縁(sheet y250)
SHELL_TOP = 0.795         # 甲羅の天辺(sheet y155)
SHELL_SPAN = SHELL_TOP - SHELL_Z0
# **測った表をそのまま積まない。** 手描きの実測は 1〜2px 揺れていて、
# Catmull-Rom で引くとドームに横縞の段が出た(4-40 の続き)。形が素直な
# ドームなので、実測に**関数を当てはめて**から積む。
#
#   rx(v) = RX * (1 - v^2.4)^0.622      実測との差は最大 1.1%
#   ry(v) = RY * (1 - v^2.4)^0.75       同 1.5%
#   cy(v) = -0.016 + 0.072 * v^2        天辺ほど後ろへ寄る(前が庇になる)
SHELL_RX = 0.4280         # 正面図 168px の半分
SHELL_RY = 0.3924         # 側面図 154px の半分
SHELL_SEG, SHELL_RING = 48, 30
# 縁は分厚い。**薄い皿にしない** ―― 設定画は「殻は分厚く硬い」。
RIM_DROP = 0.038
RIM_IN = 0.955
# **前縁に切り欠きを作る。** 設定画の顔は甲羅の前面の窪みに収まっていて、
# 切り欠きが無いと目が甲羅の中に埋まって正面から一切見えない。
# 前(th=270°)でいちばん深く、側面へ向かって 0 に戻す。
NOTCH_V = 0.150           # 切り欠きの深さ(v 単位)
NOTCH_ARC = math.radians(104.0)


def _notch(th: float) -> float:
    """角 th での切り欠きの深さ(0..1)。前を中心に余弦で落とす。"""
    d = abs((math.degrees(th) - 270.0 + 180.0) % 360.0 - 180.0)
    half = math.degrees(NOTCH_ARC) * 0.5
    if d >= half:
        return 0.0
    return 0.5 + 0.5 * math.cos(math.pi * d / half)


def shell_ring(v: float):
    v = min(1.0, max(0.0, v))
    k = max(0.0, 1.0 - v ** 2.4)
    return (SHELL_RX * k ** 0.622, SHELL_RY * k ** 0.75,
            -0.016 + 0.072 * v * v)


def shell_surface(v: float, th: float, out: float = 0.0):
    v = min(1.0, max(0.0, v))
    rx, ry, cy = shell_ring(v)
    c, s = math.cos(th), math.sin(th)
    n = Vector((c / max(rx, 1e-6), s / max(ry, 1e-6), 0.0)).normalized()
    p = Vector((rx * c, cy + ry * s, SHELL_Z0 + v * SHELL_SPAN))
    return p + n * out, n


def build_shell() -> list:
    """甲羅。**角ごとに下端の高さが違う**ので `C.loft` は使えない
    (loft のリングは水平)。断面を自前で積む。"""
    me = bpy.data.meshes.new(f"{NAME}_shell")
    co, faces = [], []
    rings = SHELL_RING + 2                       # +2 は縁の厚み
    for i in range(rings + 1):
        for j in range(SHELL_SEG):
            th = j * math.tau / SHELL_SEG
            v0 = NOTCH_V * _notch(th)            # その角での下端
            if i < 2:                            # 縁の下のスカート(厚み)
                t = (2 - i) / 2.0
                rx, ry, cy = shell_ring(v0)
                k = RIM_IN * (1.0 - 0.07 * t)
                z = SHELL_Z0 + v0 * SHELL_SPAN - RIM_DROP * t
                co.append((rx * k * math.cos(th), cy + ry * k * math.sin(th), z))
                continue
            v = v0 + (1.0 - v0) * (i - 2) / SHELL_RING
            rx, ry, cy = shell_ring(v)
            co.append((rx * math.cos(th), cy + ry * math.sin(th),
                       SHELL_Z0 + v * SHELL_SPAN))
    for i in range(rings):
        for j in range(SHELL_SEG):
            a, b = i * SHELL_SEG + j, i * SHELL_SEG + (j + 1) % SHELL_SEG
            faces.append((a, b, b + SHELL_SEG, a + SHELL_SEG))
    faces.append(tuple(range(SHELL_SEG - 1, -1, -1)))            # 下の縁を塞ぐ
    faces.append(tuple(rings * SHELL_SEG + j for j in range(SHELL_SEG)))
    me.from_pydata(co, [], faces)
    me.update()
    obj = bpy.data.objects.new(f"{NAME}_shell", me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return [obj]


# ============================================================ 体・目
# 甲羅の下の胴。**外からはほとんど見えない**が、脚と鋏の付け根であり、
# 目の台でもある。設定画では甲羅の前縁の下に顔の面があり、そこに目が並ぶ。
BODY_C = (0.0, -0.055, 0.235)
BODY_R = (0.330, 0.300, 0.120)

# 目: 正面図の実測 中心 (654,237)(693,237)、径 12px(61mm)。
# **甲羅の庇の下に奥まっている**(設定画「目は奥まっていて、感情が読み
# 取りづらい」)。黒く艶があり、ハイライトが1点。
EYE_X = 0.0984            # 中心間 39px の半分
EYE_Y = -0.3480           # 切り欠きの中。甲羅の庇の下
EYE_Z = 0.3620            # sheet y237(側面図は y225)の中間
EYE_R = 0.0306            # 径 61mm


def build_body() -> list:
    b = C.uv_sphere(f"{NAME}_body", BODY_C, 1.0, segments=28, rings=18,
                    scale=BODY_R)
    return [b]


def build_eyes() -> list:
    """黒い丸目。**輪郭線を付けない** ―― 径 61mm の球に反転ハルが付くと
    目玉が膨れて「目が飛び出したカニ」になる。設定画の目は奥まっている。"""
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        c = Vector((EYE_X * side, EYE_Y, EYE_Z))
        out.append(C.uv_sphere(f"{NAME}_eye{tag}", c, EYE_R, segments=16, rings=12))
        # 目を受ける短い柄(甲羅の下の暗がりから生える)
        out.append(C.uv_sphere(f"{NAME}_eyestalk{tag}",
                               c + Vector((0.0, 0.028, 0.004)), EYE_R * 0.78,
                               segments=12, rings=8))
    return out


# ============================================================ 鋏
# 側面図の実測: 鋏は sheet x798..864(前方へ突き出す)、y245..303。
# 正面図: 左の鋏は sheet x607..666。**大きく硬い**(設定画の明記)。
#
# 腕(付け根)→ 前腕 → 二叉の指。指は下向きに閉じている。
CLAW_ROOT = (0.230, -0.150, 0.245)
CLAW_ELBOW = (0.268, -0.330, 0.180)
CLAW_HAND = (0.212, -0.470, 0.115)
CLAW_TIP = (0.158, -0.560, 0.058)
CLAW_R = (0.090, 0.104, 0.086)      # 付け根 / 肘 / 手の太さ


def _tube(name, pts, radii, side):
    p = [Vector((v[0] * side, v[1], v[2])) for v in pts]
    return C.curve_tube(name, p, radii, resolution=3, bevel_resolution=3)


def build_claws() -> list:
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        out.append(_tube(f"{NAME}_arm{tag}", (CLAW_ROOT, CLAW_ELBOW, CLAW_HAND),
                         [CLAW_R[0], CLAW_R[1], CLAW_R[2]], side))
        # 二叉の指。上の指は太く短く、下の指は細く長い(設定画どおり)
        h = Vector((CLAW_HAND[0] * side, CLAW_HAND[1], CLAW_HAND[2]))
        t = Vector((CLAW_TIP[0] * side, CLAW_TIP[1], CLAW_TIP[2]))
        up = h + Vector((0.0, -0.052, 0.030))
        out.append(_tube(f"{NAME}_fingerU{tag}",
                         ((h.x / side, h.y, h.z), (up.x / side, up.y, up.z),
                          (t.x / side, t.y + 0.012, t.z + 0.034)),
                         [0.062, 0.046, 0.014], side))
        lo = h + Vector((0.0, -0.058, -0.022))
        out.append(_tube(f"{NAME}_fingerL{tag}",
                         ((h.x / side, h.y, h.z), (lo.x / side, lo.y, lo.z),
                          (t.x / side, t.y, t.z)),
                         [0.056, 0.040, 0.012], side))
    return out


# ============================================================ 脚
# 側面図で脚の付け根は sheet x884 / 922 / 942 あたり ―― 前後3対。
# 正面図では甲羅の下から外へ張り出し、膝で折れて地面へ降りる。
# **細い**(幅 8px = 41mm)。設定画「足はゆっくりと動く」。
LEGS = [
    # (付け根の前後y, 付け根のx, 膝, 足先) ―― x は右側(side=+1)基準
    (-0.100, 0.255, (0.395, -0.130, 0.170), (0.440, -0.150, 0.013)),
    (+0.090, 0.265, (0.418, +0.110, 0.165), (0.470, +0.130, 0.013)),
    (+0.265, 0.240, (0.390, +0.320, 0.155), (0.435, +0.375, 0.013)),
]
LEG_R = (0.036, 0.026, 0.012)


def build_legs() -> dict:
    """細い脚3対。左右を別々に返す(それぞれの骨へ親化するため)。

    **輪郭線を付けない** ―― 直径 41mm の脚に反転ハルが付くと丸太になる。"""
    out = {"L": [], "R": []}
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        for k, (ry, rx, knee, foot) in enumerate(LEGS):
            root = (rx, ry, 0.235)
            out[tag].append(_tube(f"{NAME}_leg{tag}{k}", (root, knee, foot),
                                  list(LEG_R), side))
    return out


def bare_parts() -> tuple:
    """羽毛ならぬ「模様と小物」を外した裸のボディ。Body Anatomy Gate 用。

    判定条件は **「無地の甲羅・体・目・鋏・脚だけを 96px で表示し、設定画を
    見なくてもカニとして読める」**。ここが通らないうちは苔も紙片も足さない。"""
    return build_shell(), build_body(), build_eyes(), build_claws(), build_legs()


def _check(objs) -> None:
    lo, hi = C.bounds(objs)
    print(f"[{NAME}] 高さ {hi.z - lo.z:.3f}m 幅 {hi.x - lo.x:.3f}m "
          f"奥行き {hi.y - lo.y:.3f}m 三角形 {C.tri_count(objs)}")
    assert lo.z > -0.004, lo.z
