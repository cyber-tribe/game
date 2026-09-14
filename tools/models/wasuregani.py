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
# 出所は**カラーパレットのチップそのもの**(sheet x1259..1275)。三面図の
# 描画から拾うと陰影と紙の地色が混ざり、殻が R-B +6 のほぼ中性に見えて
# いたが、チップは **R-B -8 の青灰**、足・ハサミは **R-B +14 の紫灰**で、
# 両者の色みは明確に分かれている ―― 描画から拾った値ではこの対比が消え、
# 甲羅も脚も同じ砂色になっていた。
#
# ただし**チップの明度は使わない**。チップは紙の上に薄く置かれていて
# L の平均が 141 あり、三面図の描画(平均 103・標準偏差 37.9)より
# 一段明るい。色み(L で割った比)はチップから、明度は描画から採る。
SHEET = {
    "shell":     (110, 110, 116),   # 殻(メイン)くすんだ青灰
    "shelldark": (82, 83, 93),      # 殻(影)
    "shelllite": (160, 151, 146),   # 殻(ハイライト)わずかに暖かい
    "rim":       (39, 39, 41),      # 板の溝。ほぼ黒
    "limb":      (111, 99, 101),    # 足・ハサミ(メイン)紫灰
    "limblite":  (157, 146, 147),   # 鋏の指(淡い骨色)
    "limbdark":  (75, 66, 70),      # 足・ハサミ(影)・顔の窪み
    "eye":       (34, 29, 27),      # 目。ほぼ黒
    "paper":     (156, 138, 120),   # 記憶のカケラ(紙)生成り
    "moss":      (115, 103, 82),    # 苔・藻。くすんだオリーブ
}

# ゲームの灯りは寒色なので、設定画の値をそのまま置くと画面では青く沈む。
# **明度は動かさず色みだけ回す**(`modeling-pitfalls.md` 4-49)。回す強さは
# 色ごと ―― 一律に掛けると明るい差し色が金色に転ぶ。
TINT_FIX = (1.237, 1.078, 0.672)
# **スリガラスの重みをそのまま持ってこない。** あれは黒く玉虫色の体を
# 寒色の灯りから救うための値で、そのまま当てるとこの甲羅(R-B が +6 の
# ほぼ中性の灰)が R-B +64 の砂色になった ―― 石ではなく段ボールに見える。
# ワスレガニは設定画の時点でほぼ中性なので、回すのはごく浅くてよい。
TINT_W = {
    "shell": 0.26, "shelldark": 0.34, "shelllite": 0.18, "rim": 0.40,
    "limb": 0.22, "limblite": 0.12, "limbdark": 0.34,
    "eye": 0.30, "paper": 0.10, "moss": 0.16,
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
SHELL_TOP = 0.782         # ドームの天辺。**苔の突起は含めない**
SHELL_SPAN = SHELL_TOP - SHELL_Z0
# **測った表をそのまま積まない。** 手描きの実測は 1〜2px 揺れていて、
# Catmull-Rom で引くとドームに横縞の段が出た(4-40 の続き)。形が素直な
# ドームなので、実測に**関数を当てはめて**から積む。
#
# 当てはめは**最大誤差ではなく中央値**で採る ―― 外周には苔の瘤が外へ出て
# いて、最大誤差で合わせると瘤に引っぱられて全体が太る(front で 6.7%→
# 13.6mm、中央値なら 6.7mm)。
#
#   rx(v) = RX * (1 - v^2.00)^0.63     実測との差は中央値 6.7mm
#   ry(v) = RY * (1 - v^2.05)^0.58     同 5.6mm
#   cy(v) = -0.016 - 0.172*v + 0.234*v^2
#
# **cy は単調ではない。** 中ほど(v≈0.37)で 32mm 前へ張り出し、天辺で
# 46mm 後ろへ戻る ―― 側面図の「目の上にせり出す庇」がこの二次項。
# 旧式の ry 指数 0.75 は v=0.90 で実測より 18% 細く、そのせいで側面から
# 見た天辺が尖っていた。
SHELL_RX = 0.4306         # 正面図の最大半幅
SHELL_RY = 0.3884         # 側面図の最大半奥行き
SHELL_SEG, SHELL_RING = 44, 26
# 縁は分厚い。**薄い皿にしない** ―― 設定画は「殻は分厚く硬い」。
RIM_DROP = 0.042
RIM_IN = 0.940
RIM_RING = 4              # 巻き込みのリング数。2枚だと面が立って鋸歯に見えた
# **前縁に切り欠きを作る。** 設定画の顔は甲羅の前面の窪みに収まっていて、
# 切り欠きが無いと目が甲羅の中に埋まって正面から一切見えない。
# 前(th=270°)でいちばん深く、側面へ向かって 0 に戻す。
NOTCH_V = 0.205           # 切り欠きの深さ(v 単位)
NOTCH_ARC = math.radians(118.0)


def _notch(th: float) -> float:
    """角 th での切り欠きの深さ(0..1)。前を中心に余弦で落とす。"""
    d = abs((math.degrees(th) - 270.0 + 180.0) % 360.0 - 180.0)
    half = math.degrees(NOTCH_ARC) * 0.5
    if d >= half:
        return 0.0
    return 0.5 + 0.5 * math.cos(math.pi * d / half)


def shell_ring(v: float):
    v = min(1.0, max(0.0, v))
    return (SHELL_RX * max(0.0, 1.0 - v ** 2.00) ** 0.63,
            SHELL_RY * max(0.0, 1.0 - v ** 2.05) ** 0.58,
            -0.016 - 0.172 * v + 0.234 * v * v)


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
    rings = SHELL_RING + RIM_RING                # 縁の巻き込みを足す
    for i in range(rings + 1):
        for j in range(SHELL_SEG):
            th = j * math.tau / SHELL_SEG
            v0 = NOTCH_V * _notch(th)            # その角での下端
            if i < RIM_RING:                     # 縁の巻き込み(1/4円)
                ang = (RIM_RING - 1 - i) / (RIM_RING - 1) * math.pi * 0.5
                rx, ry, cy = shell_ring(v0)
                k = 1.0 - (1.0 - RIM_IN) * (1.0 - math.cos(ang))
                z = SHELL_Z0 + v0 * SHELL_SPAN - RIM_DROP * math.sin(ang)
                co.append((rx * k * math.cos(th), cy + ry * k * math.sin(th), z))
                continue
            v = v0 + (1.0 - v0) * (i - RIM_RING) / SHELL_RING
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

# 目: 正面図を6倍に拡大して実測 ―― 左目 sheet x648..661 / y233..248。
# 13 x 15px = 66 x 76mm の**縦長の楕円**で、中心は x±0.140m。
# 前の版は中心間を 0.197m(実測 0.280m)としていて内側へ寄りすぎ、
# しかも切り欠きが浅くて甲羅の庇に完全に隠れ、正面から目が一切見えな
# かった ―― カニとして読ませる最大の手掛かりを落としていた。
# 設定画の「目は奥まっている」は**縁より後ろ**という意味で、見えない
# という意味ではない。縁を目の上端より高く抜き、目は縁の影に置く。
EYE_X = 0.1400
EYE_Y = -0.4000           # 顔板の前面から膨らみ出る。縁の真下
EYE_Z = 0.3520            # sheet y240.5
EYE_R = 0.0370
EYE_SCALE = (1.00, 0.88, 1.14)    # 縦長


def build_body() -> list:
    # **解像度を落としてよい。** 甲羅と鋏にほぼ覆われて外から見えない。
    b = C.uv_sphere(f"{NAME}_body", BODY_C, 1.0, segments=20, rings=14,
                    scale=BODY_R)
    return [b]


def build_eyes() -> list:
    """黒い丸目。**輪郭線を付けない** ―― 径 61mm の球に反転ハルが付くと
    目玉が膨れて「目が飛び出したカニ」になる。設定画の目は奥まっている。"""
    return [C.uv_sphere(f"{NAME}_eye{'L' if side > 0 else 'R'}",
                        (EYE_X * side, EYE_Y, EYE_Z), EYE_R,
                        segments=16, rings=12, scale=EYE_SCALE)
            for side in (-1.0, 1.0)]


# ============================================================ 鋏
# 設定画(正面図を 6 倍に拡大して実測):
#   掌  x 0.114..0.330m、z 0.055..0.310m ―― **甲羅の縁から地面近くまで**
#       届く塊で、腕は正面からほとんど見えない
#   指  掌の**内側前面**に貼り付く淡い色の三日月が2枚。上で離れ、下の
#       先端で噛み合う。長さ 0.19m ほど
#
# **ここが読みの要。** 設定画の売りは「ハサミは大きく硬い」で、正面像の
# 面積の3割を鋏が占める。前の版は掌の縦を 0.18m しか取らず(実測 0.25m)、
# 指を掌の下へ生やしていたので、腕の先に小さな牙が付いた形にしか見え
# なかった。指は**掌から突き出す別の付属肢ではなく、掌の内側の面**。
ARM_ROOT = (0.206, -0.150, 0.286)     # 甲羅の下、胴の前側面
ARM_MID = (0.238, -0.196, 0.280)
ARM_R = (0.060, 0.062, 0.056)
# 掌。**球で作らない**(`common.tapered_slab` の注意書きのとおり、球だと
# ミトンになる)。手首で絞り、中ほどで最も太り、先でまた絞る中心線に
# 楕円断面を積む ―― 設定画の鋏は「拳」の形で、腕との継ぎ目が細い。
PALM_SPINE = ((0.250, -0.220, 0.272), (0.272, -0.288, 0.222),
              (0.284, -0.352, 0.170), (0.278, -0.412, 0.116),
              (0.256, -0.452, 0.072))
PALM_W = (0.052, 0.112, 0.135, 0.116, 0.062)    # 左右(x)の半幅
PALM_T = (0.058, 0.126, 0.148, 0.126, 0.068)    # 中心線に直交する半厚
# 指。設定画の鋏は**淡い骨色の刃が2枚**で、下へ、やや前へ向き、先で
# 噛み合う。あいだの暗い隙間が「挟む」記号になっている。
#
# **掌の輪郭の内側へ置かない。** 前の版は外側の刃を掌の胴に埋めてしまい、
# 見えるのが内側の1枚だけ ―― 鋏ではなく牙が1本生えた拳になっていた。
# 2枚とも掌の**前面**に、x で 0.09m 離して置く。断面は筒ではなく
# `tapered_slab` の平たい刃(側面から見て厚みが出ると指が指輪になる)。
# 実測 x 0.107..0.275 / z 0.031..0.245 ―― **掌の高さの 74%** を占める。
# 小さく作ると掌のなめらかな塊に負け、鋏ではなく豆に見える。
FINGER_OUT = ((0.264, -0.442, 0.246), (0.280, -0.508, 0.146),
              (0.248, -0.540, 0.040))
FINGER_IN = ((0.148, -0.438, 0.232), (0.138, -0.502, 0.138),
             (0.228, -0.538, 0.036))
FINGER_W = (0.030, 0.028, 0.010)      # 左右(x)の半厚 ―― 薄い
FINGER_T = (0.062, 0.050, 0.012)      # 刃の幅

# 顔と胸の板。設定画では左右の鋏のあいだに、節の入った暗い面が目の下から
# z≈0.09 まで続いている。ここが無いと正面の下半分に穴が空き、目を載せる
# 面も無くなる。**甲羅の切り欠きの真下に、前面を揃えて置く。**
# **切り欠きの高さまで届かせる。** 板が低いと、切り欠きで抜いた甲羅の
# ぶんがそのままシルエットの穴になり、正面 IoU が 0.868→0.847 に落ちた。
# 設定画では抜いたぶんを顔の面が埋めていて、外周は切れていない。
STERNUM_C = (0.0, -0.292, 0.250)
STERNUM_R = (0.212, 0.112, 0.162)


def _tube(name, pts, radii, side):
    p = [Vector((v[0] * side, v[1], v[2])) for v in pts]
    return C.curve_tube(name, p, radii, resolution=3, bevel_resolution=3)


def claw_parts() -> tuple:
    """(甲殻色の部分, 淡い指) を分けて返す ―― 指だけ別の色を当てる。"""
    hard, nail = [], []
    hard.append(C.uv_sphere(f"{NAME}_sternum", STERNUM_C, 1.0,
                            segments=18, rings=12, scale=STERNUM_R))
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        hard.append(_tube(f"{NAME}_arm{tag}",
                          (ARM_ROOT, ARM_MID, PALM_SPINE[0]), list(ARM_R), side))
        hard.append(C.tapered_slab(
            f"{NAME}_palm{tag}",
            [(x * side, y, z) for x, y, z in PALM_SPINE],
            list(PALM_W), list(PALM_T), (1.0, 0.0, 0.0), segments=16))
        for lab, pts in (("O", FINGER_OUT), ("I", FINGER_IN)):
            nail.append(C.tapered_slab(
                f"{NAME}_finger{lab}{tag}",
                [(x * side, y, z) for x, y, z in pts],
                list(FINGER_W), list(FINGER_T), (1.0, 0.0, 0.0), segments=10))
    return hard, nail


def build_claws() -> list:
    hard, nail = claw_parts()
    return hard + nail


# ============================================================ 脚
# 側面図で脚の付け根は sheet x884 / 922 / 942 ―― 前後3対。
# 正面図では甲羅の下から外へ張り出し、膝で折れて地面へ降りる。
# 正面図の実測: いちばん広いのは接地の少し上(z≈0.08)で 948mm、接地では
# 724mm に狭まる ―― **足先は膝より内側**。脚は膝で外へ張ってから内へ降りる。
#
# **一本の筒で繋がない。** 等太さの筒で root→膝→足先を通すと、設定画の
# 「節のある脚」ではなく曲げたストローになる(裸の三面図で実際そう見えた)。
# 設定画の脚は太い腿・膨らんだ膝・尖って接地する脛の3つで出来ている。
LEGS = [
    # (付け根の前後y, 付け根のx, 膝, 足先) ―― x は右側(side=+1)基準
    (-0.105, 0.250, (0.418, -0.145, 0.118), (0.352, -0.178, 0.010)),
    (+0.082, 0.262, (0.438, +0.102, 0.112), (0.370, +0.132, 0.010)),
    (+0.232, 0.238, (0.404, +0.300, 0.106), (0.338, +0.372, 0.010)),
]
THIGH_R = (0.062, 0.052, 0.044)       # 付け根 / 中 / 膝
KNEE_R = 0.046
SHIN_R = (0.044, 0.026, 0.008)        # 膝 / 中 / 足先(尖る)


def build_legs() -> dict:
    """節のある脚3対。左右を別々に返す(それぞれの骨へ親化するため)。

    **輪郭線を付けない** ―― この太さに反転ハルが付くと丸太になる。"""
    out = {"L": [], "R": []}
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        for k, (ry, rx, knee, foot) in enumerate(LEGS):
            root = (rx, ry, 0.235)
            mid = tuple((a + b) * 0.5 for a, b in zip(root, knee))
            out[tag] += [
                _tube(f"{NAME}_thigh{tag}{k}", (root, mid, knee),
                      list(THIGH_R), side),
                C.uv_sphere(f"{NAME}_knee{tag}{k}",
                            (knee[0] * side, knee[1], knee[2]), KNEE_R,
                            segments=8, rings=6),
                _tube(f"{NAME}_shin{tag}{k}",
                      (knee, tuple((a + b) * 0.5 for a, b in zip(knee, foot)),
                       foot), list(SHIN_R), side),
            ]
    return out


# ================================================== 甲羅の板割り・苔・紙片
#
# 設定画の甲羅は、暗い溝で仕切られた多角形の板でできている(「殻は分厚く
# 硬い」「石のように硬く、古びた質感」)。**溝はジオメトリにしない** ――
# 彫れば三角形が数千増えるうえ、96px では溝が潰れて甲羅が汚れて見えるだけ
# になる。`bake_albedo` の color_fn は3D位置を受け取るので、展開図ではなく
# 甲羅の座標系(θ, v)のまま板割りを組める。
#
# 種は (v, 個数) の準格子。**縁ほど小さく多く、天辺ほど大きく少ない** ――
# 設定画の甲羅は天辺に大きな板が1枚あり、そこから放射状に割れていく。
PLATE_RINGS = ((0.055, 15), (0.230, 13), (0.420, 10), (0.615, 7),
               (0.810, 4), (0.975, 1))
PLATE_SEAM = 0.0105       # 溝の幅(m)
_SEEDS: list | None = None


def _plate_seeds() -> list:
    """板の種を甲羅の面の上に置く。"""
    out = []
    for ri, (v, n) in enumerate(PLATE_RINGS):
        for i in range(n):
            a = _jitter(ri * 7.3 + 1.7, i * 3.1 + 0.9)
            b = _jitter(i * 5.7 + 2.3, ri * 2.9 + 0.4)
            th = (i + 0.47 * ri + 0.34 * (a - 0.5)) * math.tau / n
            vv = min(0.99, max(0.0, v + 0.05 * (b - 0.5)))
            out.append((shell_surface(vv, th)[0], b))
    return out


def _seeds() -> list:
    global _SEEDS
    if _SEEDS is None:
        _SEEDS = _plate_seeds()
    return _SEEDS


def _mottle(p, k: float = 1.0) -> float:
    """石の斑。-1..1。**格子ノイズを使わない** ―― 床関数のノイズは
    テクセル単位で段が出て、縮小すると砂嵐に見える。正弦の和は滑らか。"""
    return (math.sin(p.x * 27.7 * k + p.y * 11.3 * k + 0.7) * 0.50
            + math.sin(p.y * 19.1 * k - p.z * 33.7 * k + 2.1) * 0.32
            + math.sin(p.z * 44.3 * k + p.x * 7.9 * k - 1.4) * 0.18)


# 苔・藻。**色の面と瘤の両方**を置く ―― 設定画の苔は輪郭を凸凹させて
# いて、色だけだと甲羅がつるりとしたままになる。ここは (θ度, v) で指定。
MOSS_SPOTS = (
    (18.0, 0.92, 0.150), (86.0, 0.80, 0.130), (150.0, 0.88, 0.120),
    (212.0, 0.72, 0.145), (256.0, 0.86, 0.115), (318.0, 0.64, 0.125),
    (54.0, 0.52, 0.100), (188.0, 0.44, 0.095), (300.0, 0.36, 0.090),
    (122.0, 0.62, 0.105),
)


def _moss_weight(p) -> float:
    """位置 p が苔に覆われる度合い(0..1)。境界は斑で崩す。"""
    w = 0.0
    for deg, v, r in MOSS_SPOTS:
        c, _ = shell_surface(v, math.radians(deg))
        d = (p - c).length / r
        w = max(w, 1.0 - min(1.0, d * d))
    return min(1.0, max(0.0, w * 1.35 + _mottle(p, 2.6) * 0.30 - 0.28))


def shell_paint(p, n):
    """甲羅の表面色。板割りの溝 → 板ごとの明度 → 石の斑 → 苔 の順に重ねる。"""
    d1 = d2 = 1e9
    jit = 0.5
    for c, j in _seeds():
        d = (p - c).length
        if d < d1:
            d2, d1, jit = d1, d, j
        elif d < d2:
            d2 = d
    base = _srgb("shell")
    v = (p.z - SHELL_Z0) / SHELL_SPAN
    # 縁の帯は**板割りを入れない**。設定画の甲羅は下の帯だけ滑らかな厚い
    # 唇になっていて、そこに板の溝は走っていない。
    lip = min(1.0, max(0.0, (0.155 - v) / 0.105))
    if d2 - d1 < PLATE_SEAM and lip < 0.5:   # 板と板の溝
        t = (d2 - d1) / PLATE_SEAM
        rim = _srgb("rim")
        k = t * t
        col = tuple(a + (b - a) * k for a, b in zip(rim, base))
    else:
        # 板ごとの明度差(設定画の甲羅は板単位で明暗が散っている)
        lo, hi = _srgb("shelldark"), _srgb("shelllite")
        u = 0.30 + 0.55 * jit + 0.18 * _mottle(p, 0.55)
        u = min(1.0, max(0.0, u))
        col = tuple(a + (b - a) * u for a, b in zip(lo, hi))
        col = tuple(c * (1.0 + 0.055 * _mottle(p, 3.7)) for c in col)
    if lip > 0.0:
        dark = _srgb("shelldark")
        col = tuple(a + (b - a) * (lip * 0.55) for a, b in zip(col, dark))
    # 下向きの面(縁の巻き込みの裏)は落とす
    if n.z < -0.25:
        col = tuple(c * 0.62 for c in col)
    w = _moss_weight(p)
    if w > 0.0:
        moss = _srgb("moss")
        col = tuple(a + (b - a) * w for a, b in zip(col, moss))
    return tuple(min(1.0, max(0.0, c)) for c in col)


# 苔の瘤。色の面の中に、輪郭を崩す小さな塊を散らす。
# **大きい塊は 3 個まで** ―― 全部を大きくすると甲羅が苺になる。
def build_moss() -> list:
    out = []
    for si, (deg, v, r) in enumerate(MOSS_SPOTS):
        # **数を絞らない。** 2〜3個だと甲羅にボルトを打ったように見える。
        # 設定画の苔はフジツボのように寄り集まった小さな瘤の房。
        n_knob = 7 if v > 0.6 else 5
        for k in range(n_knob):
            a = _jitter(si * 4.1 + k * 1.7, deg * 0.013 + 0.3)
            b = _jitter(k * 6.3 + 0.9, si * 2.7 + v)
            c = _jitter(si * 1.3 + k * 3.9, v * 5.1)
            th = math.radians(deg) + (a - 0.5) * r * 2.6
            vv = min(0.995, max(0.02, v + (b - 0.5) * r * 0.8))
            # **角張らせない。** subdivisions=0 の二十面体は「硬い面の記号」
            # (common.gem の注意書き)で、甲羅に散らすと苔ではなく氷の
            # 結晶に見えた。苔は丸い瘤。
            rad = r * (0.105 + 0.085 * c)
            pos, _ = shell_surface(vv, th, out=rad * 0.34)
            out.append(C.gem(f"{NAME}_moss{si}_{k}", pos, rad,
                             subdivisions=1, scale=(1.0, 1.0, 0.62)))
    return out


# 記憶のカケラ(紙片)。設定画では甲羅にわずかに反った四角い紙が数枚
# 貼り付いている。**平らな板を浮かせない** ―― 甲羅の面を実際にサンプル
# して曲げる。文字は書かない(実在の文字列を置かない)。
# **大きく貼らない。** 設定画の紙片は甲羅の板1枚ぶんより小さく、
# 貼られた向きもばらばらで、剥がれかけた角がある。大きく揃った四角を
# 並べると付箋を貼ったカボチャになる。
PAPERS = (
    # (θ度, v, 幅m, 高さm, 傾き度)
    (302.0, 0.60, 0.104, 0.076, -26.0),
    (32.0, 0.47, 0.092, 0.070, 17.0),
    (74.0, 0.27, 0.100, 0.072, -8.0),
    (166.0, 0.55, 0.096, 0.074, 31.0),
    (208.0, 0.29, 0.088, 0.066, -15.0),
    (248.0, 0.70, 0.082, 0.062, 11.0),
    (130.0, 0.38, 0.090, 0.068, -21.0),
)
PAPER_GRID = 3            # 1枚あたり 3x3 頂点 = 8三角形
PAPER_LIFT = 0.004


def build_papers() -> list:
    """甲羅の面に沿って曲げた薄い四角。"""
    out = []
    for pi, (deg, v, w, h, rot) in enumerate(PAPERS):
        th0 = math.radians(deg)
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        rx, ry, _ = shell_ring(v)
        span = (rx + ry) * 0.5              # その高さでの周長の目安(半径)
        co, faces = [], []
        g = PAPER_GRID
        for iy in range(g):
            for ix in range(g):
                u = (ix / (g - 1) - 0.5) * w
                t = (iy / (g - 1) - 0.5) * h
                du, dt = u * ca - t * sa, u * sa + t * ca
                pos, _ = shell_surface(
                    min(0.99, max(0.0, v + dt / SHELL_SPAN)),
                    th0 + du / max(span, 1e-6), out=PAPER_LIFT)
                co.append(pos)
        for iy in range(g - 1):
            for ix in range(g - 1):
                a = iy * g + ix
                faces.append((a, a + 1, a + g + 1, a + g))
        me = bpy.data.meshes.new(f"{NAME}_paper{pi}")
        me.from_pydata([tuple(c) for c in co], [], faces)
        me.update()
        obj = bpy.data.objects.new(f"{NAME}_paper{pi}", me)
        bpy.context.collection.objects.link(obj)
        for poly in me.polygons:
            poly.use_smooth = True
        out.append(obj)
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
