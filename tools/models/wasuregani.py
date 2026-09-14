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
    "shelldark": (64, 65, 73),      # 殻(影)
    "shelllite": (182, 172, 166),   # 殻(ハイライト)わずかに暖かい
    "rim":       (27, 27, 29),      # 板の溝。ほぼ黒
    "limb":      (111, 99, 101),    # 足・ハサミ(メイン)紫灰
    "limblite":  (178, 165, 166),   # 鋏の指(淡い骨色)
    "limbdark":  (59, 52, 55),      # 足・ハサミ(影)・顔の窪み
    "eye":       (34, 29, 27),      # 目。ほぼ黒
    "paper":     (172, 152, 132),   # 記憶のカケラ(紙)生成り
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
# 重みと持ち上げはエンジン描画の実測から決める(推量しない)。設定画の
# 三面図は L=100.5 / 標準偏差 36.0 / R-B +12.1。最初の版(重み 0.26 前後・
# 持ち上げ無し)のエンジン描画は L=87.6 / 標準偏差 22.7 / **R-B -9.1** で、
# 寒色の灯りに 21 ぶん青へ引かれ、13 ぶん暗かった。
TINT_W = {
    "shell": 0.76, "shelldark": 0.86, "shelllite": 0.58, "rim": 0.88,
    "limb": 0.62, "limblite": 0.38, "limbdark": 0.78,
    "eye": 0.60, "paper": 0.30, "moss": 0.30,
}
# 明度の持ち上げ。トゥーンの4段量子化(4-48)は上下を削るので、
# BaseColor 側を設定画より少し明るく・少し広く置く。持ち上げだけでは
# 平均は合っても幅が合わない ―― 実測で 標準偏差 26.9(設定画 36.0)、
# 5分位 58(設定画 41)/ 95分位 141(同 158)だったので、影・溝を
# 2割暗く、ハイライト・紙・指を1割明るくして**幅そのものを広げた**。
LIFT = 1.16
# 部位ごとの補正。**全身の平均だけで合わせない。** 設定画の全身 R-B は
# +12 だが、これは甲羅(+14.4)と下半身(+9.5)の混ざった値で、色み回しを
# 一律に強めて平均を合わせると甲羅まで砂色になる ―― 一度そうなった。
# 甲羅と下半身を別々に測った差(甲羅 L+8.4 / R-B+6.0、下半身 L-4.8)から
# 決めた倍率。SHEET は実測のまま残し、補正はここに分けて置く。
GAIN = {
    "shell": 0.88, "shelldark": 0.60, "shelllite": 1.02, "rim": 0.62,
    "limb": 1.06, "limbdark": 1.06, "limblite": 1.06,
    "moss": 0.78, "paper": 1.04, "eye": 1.00,
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
    # **目だけは持ち上げない。** 黒目が灰色に浮くと「奥まった目」が消える。
    lift = (1.0 if key == "eye" else LIFT) * GAIN.get(key, 1.0)
    return _tint([v / 255.0 * k * lift for v in SHEET[key]],
                 TINT_W.get(key, 1.0))


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


# 甲羅の外周のゆらぎ。設定画の甲羅は左右が微妙に崩れていて、96px でも
# 上端のギザギザが残る。モデルは綺麗な半球で、そこが最大の差だった。
#
# **内側にだけ削る**(3-28)ので、設定画から測った最大幅は動かない。
# **高い周波数を足さない** ―― 96px では細かい凹凸は消えて「ざらつき」に
# しかならない。効くのは低周波(3山)で、中周波は補助。
WOBBLE = 0.070


def _wobble(th: float, v: float) -> float:
    a = (math.sin(th * 3.0 + 0.75) * 0.62
         + math.sin(th * 7.0 - 1.90) * 0.26
         + math.sin(th * 11.0 + 2.60) * 0.12)
    grow = min(1.0, max(0.0, (v - 0.06) / 0.38))
    return 1.0 - WOBBLE * (1.0 - a) * 0.5 * grow


def shell_surface(v: float, th: float, out: float = 0.0):
    v = min(1.0, max(0.0, v))
    rx, ry, cy = shell_ring(v)
    w = _wobble(th, v)
    rx, ry = rx * w, ry * w
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
            w = _wobble(th, v)
            co.append((rx * w * math.cos(th), cy + ry * w * math.sin(th),
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

# 目: 正面図の**画素から**測る。顔は一様に暗いので単純なしきい値では
# 顔ごと1塊になる ―― 顔の中の下位22%だけを開いて拾うと、13x13px と
# 15x11px の2つの暗部が出る。これが目。
#
#   sheet x 687..699 と 644..658 → 中心間 42px = 0.214m(半分 0.107m)
#   大きさ 約 14 x 12px = 71 x 61mm、中心の高さ z = 0.369m
#
# **拡大図を目分量で読んではいけない。** 6倍に引き伸ばして読んだときは
# 中心間 0.280m と出て、実測の 0.214m より 3割広かった。しかも正面図の
# 顔の中線(sheet x672)は甲羅の最大幅の行の中心(x683)から 11px ずれて
# いて、外接箱の中心(x689.5)で測るとさらに狂う ―― **左右の対称性は
# 目そのものの2点から取る**。
EYE_X = 0.1070
EYE_Y = -0.4000           # 顔板の前面から膨らみ出る。縁の真下
EYE_Z = 0.3650
EYE_R = 0.0360
EYE_SCALE = (1.00, 0.90, 1.06)


def build_body() -> list:
    # **解像度を落としてよい。** 甲羅と鋏にほぼ覆われて外から見えない。
    b = C.uv_sphere(f"{NAME}_body", BODY_C, 1.0, segments=14, rings=10,
                    scale=BODY_R)
    return [b]


def build_eyes() -> list:
    """黒い丸目。**輪郭線を付けない** ―― 径 61mm の球に反転ハルが付くと
    目玉が膨れて「目が飛び出したカニ」になる。設定画の目は奥まっている。"""
    return [C.uv_sphere(f"{NAME}_eye{'L' if side > 0 else 'R'}",
                        (EYE_X * side, EYE_Y, EYE_Z), EYE_R,
                        segments=13, rings=9, scale=EYE_SCALE)
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
# 脚が読めるよう、掌を 22mm だけ内へ寄せた。鋏の大きさは変えていない
# ―― 外側に背景の帯ができないと、歩脚が鋏の塊に吸収されてしまう。
PALM_SPINE = ((0.232, -0.220, 0.272), (0.252, -0.288, 0.222),
              (0.262, -0.352, 0.170), (0.256, -0.412, 0.116),
              (0.234, -0.452, 0.072))
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
                            segments=15, rings=10, scale=STERNUM_R))
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
# **96px で2〜4本読めるまで誇張する。** 設定画の側面は甲羅の下から細い脚が
# ぞろぞろ出ているのが不気味さの要だが、実測どおりの細さで作ると実機では
# 鋏と甲羅の3要素しか残らず、「少し甲羅を被った二本腕の生物」に寄る。
# 太さを上げ、前後の開きを広げて、甲羅の輪郭の外へ膝を出す。
LEGS = [
    # (付け根の前後y, 付け根のx, 膝, 足先) ―― x は右側(side=+1)基準
    (-0.120, 0.250, (0.420, -0.186, 0.128), (0.366, -0.230, 0.010)),
    (+0.082, 0.262, (0.438, +0.110, 0.120), (0.384, +0.146, 0.010)),
    (+0.244, 0.238, (0.408, +0.318, 0.112), (0.350, +0.386, 0.010)),
]
# **誇張は外周の実測を超えない範囲で。** 後脚を +0.428 まで引いた版は
# 側面の奥行きが設定画より 61mm(6.5%)深くなり、Anatomy Gate が
# 0.852 → 0.834 に落ちた。読ませるために必要なのは脚の「太さと明度差」で、
# 長さではなかった。
THIGH_R = (0.070, 0.058, 0.049)       # 付け根 / 中 / 膝
KNEE_R = 0.048
SHIN_R = (0.048, 0.030, 0.009)        # 膝 / 中 / 足先(尖る)


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
                            segments=7, rings=5),
                _tube(f"{NAME}_shin{tag}{k}",
                      (knee, tuple((a + b) * 0.5 for a, b in zip(knee, foot)),
                       foot), list(SHIN_R), side),
            ]
    return out


# ============================================ 甲羅の甲板と堆積物と紙片
#
# **甲羅は二層で作る。**
#
#   地(base)  古く丸みを帯びた蟹の甲羅。区画は少なく、溝は細く浅い
#   堆積(debris) その上に長い年月で覆い被さった石・泥・苔・紙
#
# 前の版は甲羅の全面を均等な石タイルで割っていた。そうすると
# 「石を組み合わせて作った甲羅」= 石造りの兜に見えてしまい、設定画の
# 「忘れられたものが積もった甲羅」から意味がずれる。設定画の甲羅は、
# 元の甲羅の上に別のものが載っている。
#
# 96px を基準にすると、**細部を増やしても全部消える**。効くのは中サイズの
# 形状差だけなので、堆積物は「大・中・小」の三階級に分け、**大だけは
# ジオメトリにしてシルエットへ出す**。小石を50個足すより、天辺に3〜5個の
# 明確な隆起を作るほうが設定画に近づく。

# --- 地: 甲板 ---
# 蟹の甲羅は本来いくつかの大きな区画でできている。溝は「石の目地」では
# なく「甲板の境」なので、細く浅く。
PANEL_RINGS = ((0.10, 6), (0.48, 4), (0.88, 1))
PANEL_SEAM = 0.009
_SEEDS: list | None = None


def _plate_seeds() -> list:
    out = []
    for ri, (v, n) in enumerate(PANEL_RINGS):
        for i in range(n):
            a = _jitter(ri * 7.3 + 1.7, i * 3.1 + 0.9)
            b = _jitter(i * 5.7 + 2.3, ri * 2.9 + 0.4)
            th = (i + 0.47 * ri + 0.40 * (a - 0.5)) * math.tau / n
            vv = min(0.99, max(0.0, v + 0.07 * (b - 0.5)))
            out.append((shell_surface(vv, th)[0], b))
    return out


def _seeds() -> list:
    global _SEEDS
    if _SEEDS is None:
        _SEEDS = _plate_seeds()
    return _SEEDS


def _mottle(p, k: float = 1.0) -> float:
    """石の斑。-1..1。**格子ノイズを使わない**(4-16) ―― 床関数のノイズは
    テクセル単位で段が出て、縮小すると砂嵐に見える。正弦の和は滑らか。"""
    return (math.sin(p.x * 27.7 * k + p.y * 11.3 * k + 0.7) * 0.50
            + math.sin(p.y * 19.1 * k - p.z * 33.7 * k + 2.1) * 0.32
            + math.sin(p.z * 44.3 * k + p.x * 7.9 * k - 1.4) * 0.18)


# --- 堆積物 ---
# (θ度, v, 半径m, 種別)。種別は色と、大きいものは隆起の形を決める。
# **規則格子に並べない。** 大きいものが偏って付いているのが「長く同じ
# 場所にいた」の記号になる ―― 均等に散らすと工業製品に見える。
DEBRIS_BIG = (          # 隆起としてシルエットに出る。3〜5個に絞る
    (28.0, 0.88, 0.150, "stone"),
    (122.0, 0.80, 0.132, "moss"),
    (238.0, 0.86, 0.142, "stone"),
    (308.0, 0.66, 0.124, "moss"),
    (78.0, 0.52, 0.118, "stone"),
)
# 中・小は表で書かない。**大・中・小の三階級で散らす** ―― 設定画の甲羅は
# 石板の大きさが不揃いで、それが「長い年月の堆積」に見える最大の要因。
# 均一な大きさで敷き詰めると、どれだけ数を増やしても石畳になる。
# **大きさの絶対値が効く。** 一辺が甲羅の幅の 6〜10% の斑を敷き詰めると、
# それは「堆積」ではなく**迷彩**に見える。設定画の石粒は甲羅の幅の 2〜4%
# しかなく、96px では 1〜2px ―― 個々には読めず「古びた肌理」として効く。
# 数を増やして一粒を小さくする。
DEBRIS_N = 150
DEBRIS_KINDS = ("stone", "moss", "mud")
# **甲羅から色相を飛ばさない。** 泥に limbdark(暖かい暗褐色)を当てたら
# 甲羅が迷彩柄になった ―― 斑の大きさではなく**色相の跳び**が軍装に見える
# 原因。堆積物は甲羅と同じ青灰の family の中で明度だけ振る。
# 例外は苔だけ(設定画のパレットにオリーブがある)。
DEBRIS_KEY = {"stone": "shelllite", "moss": "moss", "mud": "shelldark"}
_SCATTER: tuple | None = None


def _debris_scatter() -> tuple:
    """大きいものは手で置き、中・小は散らす。上ほど密(埃と苔が溜まる側)。

    各塊に**葉数と位相**を持たせる ―― 円のまま並べると「水玉」になる。
    設定画の堆積物は角のある不揃いな欠片が隙間なく詰まっている。
    """
    global _SCATTER
    if _SCATTER is not None:
        return _SCATTER
    out = [(deg, v, r, kind, 4 + i % 3, i * 1.7, 1.0)
           for i, (deg, v, r, kind) in enumerate(DEBRIS_BIG)]
    # **均等に撒かない。** 一様分布だと粒の大きさを直しても水玉になる。
    # 設定画の堆積は房になっていて、濃いところと素肌のところがある ――
    # それが「溜まった」ように見える理由。16 房に寄せて散らす。
    for i in range(DEBRIS_N):
        ci = i % 16
        ca = _jitter(ci * 9.1 + 0.5, ci * 2.3 + 1.7)
        cv = _jitter(ci * 4.7 + 2.2, ci * 6.1 + 0.9)
        sp = 0.16 + 0.26 * _jitter(ci * 1.1 + 3.3, ci * 0.7 + 0.4)
        a = _jitter(i * 3.7 + 1.3, i * 0.91 + 0.2)
        b = _jitter(i * 1.9 + 0.7, i * 5.3 + 1.1)
        c = _jitter(i * 6.1 + 2.4, i * 2.2 + 0.8)
        k = _jitter(i * 0.53 + 4.1, i * 7.7 + 0.3)
        r = 0.046 if c > 0.88 else 0.029 if c > 0.58 else 0.017
        out.append(((ca * 360.0 + (a - 0.5) * sp * 300.0) % 360.0,
                    min(0.99, max(0.03, 0.08 + 0.90 * cv ** 0.62
                                  + (b - 0.5) * sp * 0.85)),
                    r * (0.78 + 0.44 * k), DEBRIS_KINDS[int(k * 2.999)],
                    4 + i % 3, c * 6.3, 0.55 + 0.45 * k))
    _SCATTER = tuple(out)
    return _SCATTER


_DEBRIS_POS: list | None = None
DEBRIS_SEAM = 0.16        # 塊どうしの隙間(重みの差で判定)


def _debris_at(p):
    """位置 p の堆積物 (重み, 色キー, 隙間か) を返す。

    最近傍だけでなく**次近傍との差**も見る ―― 差が小さいところは塊と塊の
    境目なので暗く落とす。これが無いと、重なった塊が一枚の面に融けて
    「まだらな甲羅」にしかならない。
    """
    global _DEBRIS_POS
    if _DEBRIS_POS is None:
        _DEBRIS_POS = [(shell_surface(v, math.radians(deg))[0], r, kind, lo, ph, st)
                       for deg, v, r, kind, lo, ph, st in _debris_scatter()]
    w1 = w2 = 0.0
    k1 = None
    for c, r, kind, lobes, phase, strength in _DEBRIS_POS:
        dv = p - c
        dl = dv.length
        if dl > r * 1.50:
            continue
        # **正弦で半径を振らない。** 3〜5山の正弦は花びらになる ―― 出来る
        # のは四つ葉であって石の欠片ではない。正多角形の半径式を使うと
        # 辺がまっすぐになり、角のある欠片として読める。
        ang = math.atan2(dv.z, (dv.x + dv.y) * 0.7071)
        seg = math.tau / lobes
        a2 = (ang + phase) % seg - seg * 0.5
        rr = r * math.cos(math.pi / lobes) / max(0.34, math.cos(a2))
        # 縁は**鋭く**落とす。なだらかに落とすと塊どうしが融けて霞になる。
        w = min(1.0, max(0.0, (1.02 - dl / max(rr, 1e-6)) / 0.22)) * strength
        if w > w1:
            w2, w1, k1 = w1, w, kind
        elif w > w2:
            w2 = w
    if k1 is None:
        return 0.0, None, False
    seam = w1 > 0.06 and (w1 - w2) < DEBRIS_SEAM
    # 完全に置き換えず 0.78 までにする ―― 塗り分けではなく「覆い」
    w = 0.82 * min(1.0, max(0.0, w1 * 1.25 + _mottle(p, 4.2) * 0.24 - 0.14))
    return w, DEBRIS_KEY[k1], seam


def shell_paint(p, n):
    """甲羅の表面色。地の甲板 → 石の斑 → 堆積物 の順に重ねる。"""
    d1 = d2 = 1e9
    jit = 0.5
    for c, j in _seeds():
        d = (p - c).length
        if d < d1:
            d2, d1, jit = d1, d, j
        elif d < d2:
            d2 = d
    v = (p.z - SHELL_Z0) / SHELL_SPAN
    # 縁の帯は**区画を入れない**。設定画の甲羅は下の帯だけ滑らかな厚い唇。
    lip = min(1.0, max(0.0, (0.155 - v) / 0.105))
    if d2 - d1 < PANEL_SEAM and lip < 0.5:
        t = (d2 - d1) / PANEL_SEAM
        col = tuple(a + (b - a) * (t * t) for a, b in zip(_srgb("rim"), _srgb("shell")))
    else:
        # 区画ごとの明度差は**控えめに**。強く振ると区画が石板に見える。
        lo, hi = _srgb("shelldark"), _srgb("shelllite")
        u = min(1.0, max(0.0, 0.34 + 0.30 * jit + 0.26 * _mottle(p, 0.55)))
        col = tuple(a + (b - a) * u for a, b in zip(lo, hi))
        col = tuple(c * (1.0 + 0.075 * _mottle(p, 3.7)) for c in col)
    if lip > 0.0:
        dark = _srgb("shelldark")
        col = tuple(a + (b - a) * (lip * 0.55) for a, b in zip(col, dark))
    if n.z < -0.25:
        col = tuple(c * 0.62 for c in col)
    w, key, seam = _debris_at(p)
    if w > 0.0:
        t = _srgb(key)
        col = tuple(a + (b - a) * w for a, b in zip(col, t))
    if seam:
        col = tuple(c * 0.78 for c in col)
    return tuple(min(1.0, max(0.0, c)) for c in col)


def _lump(name, center, radius, scale, seed: float):
    """石らしい不揃いな塊。**球で作らない** ―― 二十面体を頂点ごとに
    ±18% 揺らして角を作る。`common.gem` のままだと結晶に見える。"""
    obj = C.gem(name, (0.0, 0.0, 0.0), radius, subdivisions=2, scale=scale)
    for k, vtx in enumerate(obj.data.vertices):
        f = 0.82 + 0.36 * _jitter(seed + k * 1.7, k * 0.37 + 0.9)
        vtx.co = vtx.co * f + Vector(center)
    obj.data.update()
    return obj


def build_debris() -> list:
    """大きい堆積物だけジオメトリにする ―― **輪郭に出るものだけ**。
    中・小は色の面で足りる(96px では形が残らない)。"""
    # **甲羅の上に置かない。半分埋める。** 面から浮かせて置くと、貼り付けた
    # 小石(あるいはポップコーン)に見える。設定画の堆積物は甲羅と一体で、
    # 「長い年月で覆い被さった」ものなので、扁平にして根元を沈める。
    # 名前に種別を入れて、組み立て側が色を分けられるようにする。
    out = []
    for i, (deg, v, r, kind) in enumerate(DEBRIS_BIG):
        th = math.radians(deg)
        pos, _ = shell_surface(v, th, out=r * 0.04)
        sc = (1.0, 1.0, 0.34 + 0.16 * _jitter(i * 2.9, deg * 0.011))
        out.append(_lump(f"{NAME}_debris{i}_{kind}", pos, r * 0.66, sc,
                         i * 13.7 + 2.1))
        # 大きい塊のまわりに小さい供が2つ ―― 単独だと「瘤」、群れると「堆積」
        for k in range(2):
            a = _jitter(i * 3.3 + k, deg * 0.017 + 0.4)
            b = _jitter(k * 5.1 + 0.6, v * 7.3 + i)
            p2, _ = shell_surface(
                min(0.99, max(0.05, v + (b - 0.5) * 0.17)),
                th + (a - 0.5) * 0.70, out=-r * 0.02)
            out.append(_lump(f"{NAME}_debris{i}{k}_{kind}", p2, r * 0.34,
                             (1.0, 1.0, 0.40), i * 7.1 + k * 3.3))
    return out


# 苔の瘤。堆積物より小さく、輪郭をこまかく毛羽立たせる役。
# **数を増やさない** ―― 96px では消えるので、輪郭に効く上半分だけに置く。
MOSS_SPOTS = (
    (18.0, 0.92, 0.130), (86.0, 0.80, 0.118), (150.0, 0.88, 0.112),
    (212.0, 0.74, 0.126), (256.0, 0.86, 0.108), (318.0, 0.70, 0.116),
)


def build_moss() -> list:
    out = []
    for si, (deg, v, r) in enumerate(MOSS_SPOTS):
        for k in range(5):
            a = _jitter(si * 4.1 + k * 1.7, deg * 0.013 + 0.3)
            b = _jitter(k * 6.3 + 0.9, si * 2.7 + v)
            c = _jitter(si * 1.3 + k * 3.9, v * 5.1)
            th = math.radians(deg) + (a - 0.5) * r * 2.6
            vv = min(0.995, max(0.02, v + (b - 0.5) * r * 0.8))
            rad = r * (0.155 + 0.105 * c)
            pos, _ = shell_surface(vv, th, out=rad * 0.34)
            out.append(C.gem(f"{NAME}_moss{si}_{k}", pos, rad,
                             subdivisions=1, scale=(1.0, 1.0, 0.62)))
    return out


# 記憶のカケラ(紙片)。**5枚並べるより、正面から読める1枚を強くする。**
# 96px で読めるのは大きさの差だけなので、主役1枚・脇役数枚にする。
# 古紙なので四隅は直角にせず、墨の縁と筆致を焼く(文字は書かない)。
PAPERS = (
    # (θ度, v, 幅m, 高さm, 傾き度, 主役か)
    (284.0, 0.52, 0.138, 0.098, -16.0, True),
    (46.0, 0.44, 0.108, 0.078, 19.0, False),
    (150.0, 0.60, 0.100, 0.074, -24.0, False),
    (198.0, 0.30, 0.094, 0.070, 12.0, False),
    (104.0, 0.24, 0.088, 0.066, -8.0, False),
)
PAPER_LIFT = 0.005
PAPER_TEX = 64


def paper_texture():
    """記憶のカケラの絵 ―― 墨の縁取りと筆致。**文字は書かない。**

    96px では札は数px しかないので、読ませるのは「縁があって、中に横線が
    走っている」ことだけ。無地のクリーム色の板のままだと、設定画の一番の
    記号(貼り付いた古い紙)が「甲羅の明るい染み」に落ちる。

    `img.pixels` は**下の行から**並ぶ(4-14)。ここは上下で意味が変わら
    ない絵だが、v を下から数えることを明示しておく。
    """
    n = PAPER_TEX
    img = bpy.data.images.new(f"{NAME}_paper", n, n, alpha=False)
    base, ink = _srgb("paper"), _srgb("rim")
    px = []
    for y in range(n):
        v = (y + 0.5) / n                       # 0=下
        for x in range(n):
            u = (x + 0.5) / n
            edge = min(u, 1.0 - u, v, 1.0 - v)
            # 古び: 縁と四隅を汚す
            k = 0.74 + 0.26 * min(1.0, edge / 0.17)
            c = [a * k for a in base]
            if 0.050 < edge < 0.098:            # 墨の縁取り
                c = [a + (b - a) * 0.82 for a, b in zip(c, ink)]
            for ly, x0, x1 in ((0.32, 0.22, 0.80), (0.50, 0.24, 0.66),
                               (0.68, 0.21, 0.75)):
                if abs(v - ly) < 0.032 and x0 < u < x1:
                    c = [a + (b - a) * 0.70 for a, b in zip(c, ink)]
            px += [min(1.0, max(0.0, a)) for a in c] + [1.0]
    img.pixels.foreach_set(px)
    img.pack()
    return img


def build_papers() -> list:
    """甲羅の面に沿って曲げた古紙。主役は格子を細かくして反りを付ける。"""
    out = []
    for pi, (deg, v, w, h, rot, hero) in enumerate(PAPERS):
        th0 = math.radians(deg)
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        rx, ry, _ = shell_ring(v)
        span = (rx + ry) * 0.5
        g = 5 if hero else 3
        co, faces = [], []
        for iy in range(g):
            for ix in range(g):
                fx, fy = ix / (g - 1) - 0.5, iy / (g - 1) - 0.5
                # 四隅を欠く ―― 古紙なので直角の四角にしない
                nick = 1.0 - 0.14 * (abs(fx) > 0.49) * (abs(fy) > 0.49)
                u, t = fx * w * nick, fy * h * nick
                du, dt = u * ca - t * sa, u * sa + t * ca
                # 端だけ甲羅から浮かせる(剥がれかけ)
                lift = PAPER_LIFT * (1.0 + 1.7 * max(abs(fx), abs(fy)))
                pos, _ = shell_surface(
                    min(0.99, max(0.0, v + dt / SHELL_SPAN)),
                    th0 + du / max(span, 1e-6), out=lift)
                co.append(pos)
        for iy in range(g - 1):
            for ix in range(g - 1):
                aa = iy * g + ix
                faces.append((aa, aa + 1, aa + g + 1, aa + g))
        me = bpy.data.meshes.new(f"{NAME}_paper{pi}")
        me.from_pydata([tuple(c) for c in co], [], faces)
        me.update()
        # 格子の並び順(行優先)をそのまま UV にする。全部の札が同じ
        # 0..1 の正方形を使うので、絵は1枚で足りる。
        me.uv_layers.new(name="UVMap")
        uvl = me.uv_layers.active.data
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uvl[li].uv = ((vi % g) / (g - 1), (vi // g) / (g - 1))
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


# ============================================================== 組み立て
# 骨は12本。**甲羅を独立させる**のが要 ―― 設定画の「攻撃が当たると軽い
# 混乱を起こす」「その殻がゆるく揺れ、景色を曇らせる」は甲羅の揺れで
# 見せる。根は body-belly(下向きの短い幹)で、甲羅も鋏も脚もそこへ
# ぶら下げる。甲羅を根にすると殻を揺らしたとき脚まで一緒に回ってしまう。
JOINTS_HALF = {
    "body": (0.0, -0.055, 0.235),
    "belly": (0.0, -0.055, 0.140),      # 幹(ここが根)
    "shell": (0.0, 0.010, 0.520),
    "claw.L": (0.206, -0.150, 0.286),
    "nip.L": (0.268, -0.412, 0.138),    # 掌の先。ここから指が開閉する
    "legA.L": (0.250, -0.105, 0.235),
    "legB.L": (0.262, 0.082, 0.235),
    "legC.L": (0.238, 0.232, 0.235),
}
BONES_HALF = [
    ("body", "belly"), ("body", "shell"),
    ("body", "claw.L"), ("claw.L", "nip.L"),
    ("body", "legA.L"), ("body", "legB.L"), ("body", "legC.L"),
]
# 甲板を 50区画から 11区画へ減らし、溝も細くしたので 512px は要らない。
# 384px でも溝は3テクセル分あり、96px では区別がつかない ―― 浮いた容量を
# 堆積物のジオメトリへ回す(密度は絵ではなく形で稼ぐ)。
SHELL_TEX = 384


def build():
    """本番モデル(メッシュ+アーマチュア)を返す。"""
    shell, body, eyes, claws, legs = bare_parts()
    moss, papers, debris = build_moss(), build_papers(), build_debris()

    # **甲羅だけ先に展開して焼く。** 苔と紙片を join してから展開すると、
    # 甲羅の島が小さくなって板の溝が滲む(4-54 の逆で、密度が足りなくなる)。
    C.smart_uv(shell[0])
    img = C.bake_albedo(shell[0], shell_paint, size=SHELL_TEX,
                        name=f"{NAME}_albedo")
    C.assign_material(shell[0], C.make_textured_material(
        f"{NAME}_shell", img, roughness=0.82))
    moss_m = _mat("moss", rough=0.9)
    paper_m = C.make_textured_material(f"{NAME}_paper", paper_texture(),
                                      roughness=0.85)
    # 堆積物は種別ごとに色を分ける ―― 全部同じ色だと甲羅の瘤にしか見えない
    debris_m = {"stone": _mat("shelllite", 0.88, rough=0.88),
                "moss": moss_m, "mud": _mat("limbdark", 1.0, rough=0.92)}
    limb_m = _mat("limb", rough=0.62)
    # **脚は鋏より明るくする。** 同じ色だと 96px で鋏の塊に吸収され、
    # 甲羅・目・鋏の3要素しか残らない(設定画では紙の地色が明るいので
    # 暗い脚でも分離するが、実機の背景は暗いので同じ手は使えない)。
    leg_m = _mat("limb", 1.16, rough=0.60)
    dark_m = _mat("limbdark", rough=0.7)
    nail_m = _mat("limblite", rough=0.42)
    eye_m = _mat("eye", rough=0.22)
    # **目に輪郭線を付けない** ―― 径 74mm の球に反転ハルが付くと目玉が
    # 膨れて「目が飛び出したカニ」になる。設定画の目は奥まっている。
    eye_m["noOutline"] = True
    nail_m["noOutline"] = True
    for o in moss:
        C.assign_material(o, moss_m)
    for o in debris:
        C.assign_material(o, debris_m[o.name.rsplit("_", 1)[-1]])
    for o in papers:
        C.assign_material(o, paper_m)
    for o in eyes:
        C.assign_material(o, eye_m)
    for o in claws:
        C.assign_material(o, nail_m if "finger" in o.name
                          else dark_m if "sternum" in o.name else limb_m)
    for o in body:
        C.assign_material(o, dark_m)
    for o in legs["L"] + legs["R"]:
        C.assign_material(o, leg_m)

    # **苔と紙片は甲羅の骨へ固定する。** 甲羅の面から数 mm 浮いた小さな
    # 部品で、自動ウェイトだと胴の骨を拾って揺れたときに甲羅から剥がれる。
    pins = [C.mark_for_pin(o) for o in moss + papers + debris]
    sternum = [o for o in claws if "sternum" in o.name]
    arms = {t: [o for o in claws if o.name.endswith(t)
                and ("arm" in o.name or "palm" in o.name)] for t in ("L", "R")}
    nails = {t: [o for o in claws if o.name.endswith(t) and "finger" in o.name]
             for t in ("L", "R")}
    # **join する前に全部の組を作っておく。** join は渡したオブジェクトを
    # 消すので、あとから同じリストを走査すると削除済みの参照に当たる。
    leg_groups = {(t, k): [o for o in legs[t] if o.name.endswith(f"{t}{k}")]
                  for t in ("L", "R") for k in range(len(LEGS))}

    mesh = C.join(shell + moss + debris + papers + body + sternum, NAME)
    joints = C.mirrored(JOINTS_HALF)
    bones = C.mirrored_bones(BONES_HALF)
    armature = C.build_armature(NAME, joints, bones, mesh, root="body")
    for grp in pins:
        C.pin_weight_to_bone(mesh, grp, "body-shell")

    parts = []
    eyes_o = C.join(eyes, f"{NAME}_eyes")
    C.parent_to_bone(eyes_o, armature, "body-belly")
    parts.append(eyes_o)
    for tag in ("L", "R"):
        a = C.join(arms[tag], f"{NAME}_arm{tag}")
        C.parent_to_bone(a, armature, f"body-claw.{tag}")
        n = C.join(nails[tag], f"{NAME}_nip{tag}")
        C.parent_to_bone(n, armature, f"claw.{tag}-nip.{tag}")
        parts += [a, n]
        # **脚は1本ずつ別の骨へ。** 片側3本をまとめて1つの骨に付けると、
        # 歩行で3本が完全に同位相で振れて「脚の生えた箱」に見える。
        for k, lab in enumerate("ABC"):
            o = C.join(leg_groups[(tag, k)], f"{NAME}_leg{tag}{k}")
            C.parent_to_bone(o, armature, f"body-leg{lab}.{tag}")
            parts.append(o)
    _check([mesh] + parts)
    return [mesh, armature] + parts, armature
