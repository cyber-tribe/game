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
    "limb":      (130, 118, 114),   # 足・ハサミ(メイン)紫灰
    "nail":      (182, 165, 150),   # 可動指。**暖かい骨色**(R-B +32)
    "nailshade": (150, 131, 117),   # 固定指。可動指より一段暗い
    "limbdark":  (59, 52, 55),      # 足・ハサミ(影)・顔の窪み
    "eye":       (13, 12, 10),      # 目。**ほぼ真っ黒**(立ち絵の実測 L7)
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
    "shell": 0.64, "shelldark": 0.74, "shelllite": 0.48, "rim": 0.76,
    "limb": 0.48, "nail": 0.22, "nailshade": 0.26, "limbdark": 0.62,
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
    "shell": 0.85, "shelldark": 0.54, "shelllite": 1.02, "rim": 0.56,
    "limb": 1.08, "limbdark": 1.14, "nail": 1.00, "nailshade": 1.00,
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
SHELL_SEG, SHELL_RING = 40, 23
# 縁は分厚い。**薄い皿にしない** ―― 設定画は「殻は分厚く硬い」。
RIM_DROP = 0.042
RIM_IN = 0.940
RIM_RING = 4              # 巻き込みのリング数。2枚だと面が立って鋸歯に見えた
# **前縁に切り欠きを作る。** 設定画の顔は甲羅の前面の窪みに収まっていて、
# 切り欠きが無いと目が甲羅の中に埋まって正面から一切見えない。
# 前(th=270°)でいちばん深く、側面へ向かって 0 に戻す。
NOTCH_V = 0.205           # 切り欠きの深さ(v 単位)
NOTCH_ARC = math.radians(118.0)
# **1山にしない。** 前の中央をいちばん高く抜くと、縁の明るい帯が左右の目の
# 上端すれすれを横切って2つの目を繋いでしまい、眼鏡に見える。設定画では
# 甲羅が**目と目のあいだで下がって**いて、そこで帯が切れる。目の方位
# (前から ±15°)を山にして、中央を凹ませる。
NOTCH_LOBE = 15.0         # 目の方位(前からの角度)
NOTCH_DIP = 0.42          # 目のあいだで縁を下げる量


def _notch(th: float) -> float:
    """角 th での切り欠きの深さ(0..1)。目の上を山にした2山の形。"""
    d = abs((math.degrees(th) - 270.0 + 180.0) % 360.0 - 180.0)
    half = math.degrees(NOTCH_ARC) * 0.5
    if d >= half:
        return 0.0
    base = 0.5 + 0.5 * math.cos(math.pi * d / half)
    dip = 1.0 - NOTCH_DIP * max(0.0, 1.0 - (d / NOTCH_LOBE) ** 2)
    return base * dip


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


# ============================================================ 体・顔・目
# 甲羅の下の胴。**外からはほとんど見えない**が、脚と鋏の付け根であり、
# 顔板の台でもある。
BODY_C = (0.0, -0.055, 0.235)
BODY_R = (0.330, 0.300, 0.120)

# 顔と胸の板。設定画では左右の鋏のあいだに、節の入った暗い面が目の下から
# z≈0.09 まで続いている。ここが無いと正面の下半分に穴が空き、目を載せる
# 面も無くなる。**甲羅の切り欠きの真下に、前面を揃えて置く。**
# **球にしない。** 甲羅を外して撮ると、丸い胸板の上に目が2つ載った
# 「耳の生えた玉」に見えた。設定画の顔は前を向いた**平たい面**で、
# 目はその面に嵌まっている。前後を薄くし、上端を目の高さで止める。
STERNUM_C = (0.0, -0.300, 0.236)
STERNUM_R = (0.206, 0.086, 0.146)

# --- 目 ---
# **眼球より先に眼窩を作る。** 黒い球を顔の前に2つ置くと、96px では
# 「●　●」にしかならない。設定画の目は
#
#   甲羅の庇(影) → 暗い窪み → 灰色の眼窩の縁 → 黒い縦楕円 → 小さな光点
#
# という入れ子で、**黒を黒地に置くのではなく、輪郭と光点で目の存在を示す**。
# 立ち絵を8倍に拡大すると、黒目のまわりに一段明るい灰のリングが描かれて
# いるのがはっきり分かる。このリングが「窪みの縁」で、これを省くと
# 目がただの穴になる。
#
# 中心間は三面図の画素実測 0.214m(4-65)。縦横比は立ち絵から 1 : 1.35。
EYE_X = 0.1070
EYE_Y = -0.4020
EYE_Z = 0.3660
# 大きさは**中心間との比**で決める ―― 立ち絵の実測で 目の幅 / 中心間 =
# 0.435。0.332 で作っていた版は 96px で黒い点になった。縦横比 1 : 1.36。
EYE_R = 0.0425
EYE_SCALE = (1.00, 0.86, 1.36)        # 縦長。設定画の目は丸ではない
# 眼窩の縁は**暗い顔より明るい**。立ち絵では黒目のまわりに一段明るい灰の
# リングが描かれていて、これが窪みの縁。暗い顔に暗いリングを置くと、
# 目はただの穴になる。
# **眼窩の縁を顔より明るくしてはいけない。** 立ち絵を10倍で測ると、目の
# 中心から外へ L 7 → 28 → 50 → 77 と**単調に明るくなる**だけで、眼球を
# 囲む明るいリングは存在しない。明るい輪を回すと眼鏡になる。
# 眼窩は「顔より暗い窪み」で、眼球より一回り大きいだけ。
SOCKET_R = 0.0496
SOCKET_SCALE = (1.00, 0.44, 1.22)
SOCKET_Y = -0.3840                    # 眼球のすぐ後ろ
# 眼柄は設定画では**顔より明るい**(L86 対 77)。暗く塗ると目の下が
# 影に溶けて、目が宙に浮く。
STALK_R = 0.0152
STALK_BASE = (0.0788, -0.3660, 0.2900)
HILITE_R = 0.0088                     # 光点。上外寄りに1つだけ
HILITE_OFF = (-0.0142, -0.0298, 0.0176)
# 左右をわずかに違える ―― 完全な鏡像は「Mirror した」と読まれる。
EYE_TILT = {"L": 0.055, "R": -0.018}  # 眼柄の傾き(rad)


def build_body() -> list:
    # **解像度を落としてよい。** 甲羅と鋏にほぼ覆われて外から見えない。
    b = C.uv_sphere(f"{NAME}_body", BODY_C, 1.0, segments=14, rings=10,
                    scale=BODY_R)
    return [b]


def build_face() -> dict:
    """顔まわりを部品の**種類ごと**に返す ―― 眼窩・眼柄・眼球・光点で
    材質が違う。まとめて1つの色にすると、また「黒い球が2つ」に戻る。"""
    out = {"socket": [], "stalk": [], "eye": [], "hilite": []}
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        tilt = EYE_TILT[tag]
        ex = EYE_X + tilt * 0.10
        ez = EYE_Z - abs(tilt) * 0.06
        # 眼窩の縁: 眼球より一回り大きい扁平な輪。眼球の後ろに置く
        out["socket"].append(C.uv_sphere(
            f"{NAME}_socket{tag}", (ex * side, SOCKET_Y, ez), SOCKET_R,
            segments=14, rings=10, scale=SOCKET_SCALE))
        # 眼柄: 顔板から窪みの中を通って眼球へ
        out["stalk"].append(_tube(
            f"{NAME}_stalk{tag}",
            (STALK_BASE, ((STALK_BASE[0] + ex) * 0.5, -0.3760, ez - 0.020),
             (ex, EYE_Y + 0.012, ez)),
            [STALK_R * 1.25, STALK_R, STALK_R * 0.92], side))
        out["eye"].append(C.uv_sphere(
            f"{NAME}_eye{tag}", (ex * side, EYE_Y, ez), EYE_R,
            segments=13, rings=10, scale=EYE_SCALE))
        out["hilite"].append(C.uv_sphere(
            f"{NAME}_hilite{tag}",
            (ex * side + HILITE_OFF[0] * side, EYE_Y + HILITE_OFF[1],
             ez + HILITE_OFF[2]), HILITE_R, segments=8, rings=6))
    return out


def build_eyes() -> list:
    f = build_face()
    return f["socket"] + f["stalk"] + f["eye"] + f["hilite"]


# ============================================================ 鋏・前腕
#
# **これは旧版の修正ではなく、削除してゼロから組み直したもの。** 旧版は
# 「丸い掌の中央から、ほぼ同形の刃が2枚V字に分岐する」トポロジーで、
# 寸法や色をどれだけ直しても二股の変種にしかならなかった(ペンチ・角・牙)。
# 設定画の鋏はそもそも二本の爪ではない。
#
#   palm ─────────── fixed_finger        ← 外側輪郭は**1本の連続した曲線**
#     ╲
#      ╲── movable_finger                ← 内側に噛み込む、細く短い別部品
#
# 固定指は掌から生えた突起ではなく、**掌の輪郭がそのまま細くなったもの**。
# だから palm と fixed_finger は1つのロフトで作る(`_claw_body`)。分岐する
# のは可動指だけで、それは掌の中央ではなく**前下の関節**から出る。
#
# 立ち絵の実測で、上側の明るい刃(L164)が掌の輪郭から連続していて、
# その内側の短く暗い刃(L130)が別部品 ―― 前版は役割を逆に置いていた。
ARM_ROOT = (0.188, -0.138, 0.292)     # 甲羅の下、胴の前側面
CARPUS = (0.236, -0.202, 0.278)       # 腕節。ここに節の膨らみを置く
CARPUS_R = 0.062
ARM_R = (0.056, 0.060, 0.054)

# --- palm + fixed_finger(一体) ---
# 中心線。手首 → 掌のいちばん太いところ → 指へ細く続く → 先。
# **半径の表に段を作らない** ―― 段があると、そこが「掌と指の継ぎ目」に
# 見えて、固定指が別の突起として読まれる。
# **前へ伸ばさず、下へ降ろす。** 前向きに伸ばした版は正面から見ると
# 短縮して消え、96px では鋏が一個の丸い塊になった(上下反転との IoU 0.852)。
# 実機のカメラは正面寄りなので、指の長さは z 方向に取らないと存在しない。
CLAW_SPINE = (
    (0.240, -0.232, 0.286), (0.258, -0.292, 0.254), (0.270, -0.348, 0.216),
    (0.272, -0.400, 0.172), (0.264, -0.448, 0.128), (0.248, -0.490, 0.086),
    (0.226, -0.520, 0.052), (0.204, -0.540, 0.032),
)
# 外側(上)の半径 / 内側(噛み合わせ側)の半径 / 左右(x)の半径。
# 内側だけ早く落として**噛み合わせの面**を作る ―― 外側は連続したまま。
CLAW_OUT = (0.054, 0.104, 0.122, 0.118, 0.092, 0.064, 0.036, 0.005)
CLAW_IN = (0.050, 0.092, 0.100, 0.080, 0.048, 0.032, 0.020, 0.005)
CLAW_SIDE = (0.046, 0.076, 0.084, 0.076, 0.056, 0.040, 0.024, 0.005)
CLAW_SEG = 12
# 掌と指の境(この v から先が淡い骨色)。**形の境ではなく色の境**。
FIXED_FROM = 0.52

# --- movable_finger(別部品) ---
# **固定指より細く、短い。** 同じ長さ・同じ太さにすると、どこへ付けても
# V字になる。掌の前下の関節から出て、固定指の内側へ噛み込む。
# 固定指の **0.67 倍の長さ**。0.87 倍だった版は判定で「ほぼ同じ長さ」に
# 引っかかった ―― 長さが拮抗すると、どこへ付けても二股に読まれる。
# 固定指の噛み合わせ面(下側)より下に置き、先だけ相手へ噛み込ませる。
# 固定指の**内側(体寄り)**へずらす。真下に置くと正面からは固定指に
# 完全に隠れ、96px では鋏が一個の塊になる ―― 実機のカメラは正面寄り
# なので、噛み合わせの面が視線と平行だと存在しないのと同じ。
# 根元は内側へ出し、先は固定指の内側へ**戻して噛み合わせる** ―― 真っ直ぐ
# 内側へ逃がすと、正面からは読めても「噛む」ようには見えない。
MOV_SPINE = ((0.186, -0.438, 0.116), (0.178, -0.468, 0.092),
             (0.192, -0.494, 0.072), (0.214, -0.510, 0.060))
MOV_OUT = (0.040, 0.032, 0.021, 0.004)
MOV_IN = (0.034, 0.026, 0.017, 0.004)
MOV_SIDE = (0.030, 0.025, 0.017, 0.004)
MOV_SEG = 10
# 噛み合わせ。固定指の内側の面に2つ、可動指の内側に1つ。
BITE_FIXED = ((0.47, 0.72), (0.63, 0.62))     # (中心線上のu, 半径倍率)
BITE_MOV = ((0.42, 0.62),)
# **左右を鏡像にしない。**
CLAW_SCALE = {"L": 0.962, "R": 1.000}
CLAW_CHIP = {"L": 0.918, "R": 1.000}     # 固定指の先の残り


# --- 爪のテクスチャ ---
# **色の乗算では出せないものを描く。** 頂点カラーは補間するので、
#   ・噛み合わせの縁に走る鋸歯の線
#   ・暗い殻が淡い指の根元を包む帆立貝のような境目
#   ・刃の背に1本だけ通る稜線の明かり
#   ・古い爪の縦の筋と欠け
# のような**輪郭のはっきりした描写**は描けない。ここはテクスチャの仕事。
#
# u = 手首(0)→ 固定指の先(1)、v = 断面の周り。
# **v の向きを取り違えない。** `_claw_body` は角 a=0 を横(x)から始めるので
#   v=0.00 横 / v=0.25 **背(上)** / v=0.50 横 / v=0.75 **噛み合わせ側(下)**
# になる。稜線を v=0 に、鋸歯を v=0.5 に置いた最初の版は、どちらも刃の
# **側面**に出ていて、背にも噛み合わせにも何も無かった。
CLAW_TEX = 128
CLAW_EDGE = 0.030         # 噛み合わせの縁の太さ(v)
CLAW_TEETH = 7.0          # 縁に並ぶ鋸歯の数(u 方向)


def claw_texture():
    """爪の絵。設定画を8〜10倍に拡大して読んだ描写をそのまま置く。"""
    n = CLAW_TEX
    img = bpy.data.images.new(f"{NAME}_claw", n, n, alpha=False)
    shell = _srgb("limb")
    bone = _srgb("nail")
    bone_s = _srgb("nailshade")
    ink = _srgb("rim")
    px = []
    for y in range(n):
        v = (y + 0.5) / n                       # 0=下。断面の周り
        for x in range(n):
            u = (x + 0.5) / n
            # 掌(殻)と指(骨)の境目。**直線にしない** ―― v で波打たせて
            # 帆立貝の縁にする。設定画の殻は指の根元を包んでいる。
            edge = FIXED_FROM + 0.055 * math.sin(v * math.tau * 3.0 + 0.6) \
                + 0.022 * math.sin(v * math.tau * 7.0)
            t = min(1.0, max(0.0, (u - edge) / 0.035))
            col = [a + (b - a) * t for a, b in zip(shell, bone)]
            if abs(u - edge) < 0.016:           # 境目の墨の線
                col = [a + (b - a) * 0.55 for a, b in zip(col, ink)]
            # 背(v=0.25)の稜線 ―― 刃の部分だけ1本通す
            ridge = abs(v - 0.25)
            if ridge < 0.105:
                k = (1.0 - ridge / 0.105) ** 2 * (0.16 + 0.26 * t)
                col = [c * (1.0 + k) for c in col]
            # 噛み合わせ側(v=0.75)の鋸歯。**刃の部分だけ** ―― 掌には歯が
            # 無い。歯の外にひとつ明るい縁を置くと、線ではなく歯に見える。
            if t > 0.15:
                saw = CLAW_EDGE * (0.30 + 0.70 * abs(
                    math.sin(u * math.pi * CLAW_TEETH)))
                d = abs(v - 0.75)
                if d < saw:
                    col = [a + (b - a) * (0.86 if d > saw * 0.5 else 0.60)
                           for a, b in zip(col, ink)]
                elif d < saw + 0.030:
                    col = [c * 1.16 for c in col]          # 歯の外の明るい縁
                elif d < saw + 0.085:
                    w = 1.0 - (d - saw - 0.030) / 0.055
                    col = [a + (b - a) * (0.40 * w)
                           for a, b in zip(col, bone_s)]
            # 古い爪の縦の筋(u 方向に走る細い線を数本)
            line = math.sin(v * math.tau * 9.0 + 1.3)
            if line > 0.86 and t > 0.25:
                col = [c * 0.90 for c in col]
            # 根元の汚れと、先の欠け
            col = [c * (0.82 + 0.18 * min(1.0, u / 0.22)) for c in col]
            if u > 0.93:
                col = [c * (1.0 - 0.18 * (u - 0.93) / 0.07) for c in col]
            px += [min(1.0, max(0.0, c)) for c in col] + [1.0]
    img.pixels.foreach_set(px)
    img.pack()
    return img


def _tube(name, pts, radii, side):
    p = [Vector((v[0] * side, v[1], v[2])) for v in pts]
    return C.curve_tube(name, p, radii, resolution=3, bevel_resolution=3)


def _claw_body(name, spine, r_out, r_in, r_side, seg, side, k=1.0, chip=1.0,
               u0=0.0, u1=1.0):
    """中心線に沿って**上下非対称の断面**を積む。

    `tapered_slab` は楕円断面なので、外側と内側を別々に絞れない。鋏は
    外側(背)が丸く、内側(噛み合わせ)が平たい ―― この非対称が「刃」を
    作る。断面の向きは中心線の接線と x 軸から取る。
    """
    pts = [Vector((x * side, y, z)) for x, y, z in spine]
    if chip < 1.0:
        pts[-1] = pts[-2] + (pts[-1] - pts[-2]) * chip
    me = bpy.data.meshes.new(name)
    co, faces = [], []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)])
        if d.length_squared < 1e-12:
            d = Vector((0.0, -1.0, 0.0))
        d.normalize()
        sv = Vector((1.0, 0.0, 0.0))
        sv = (sv - d * sv.dot(d))
        if sv.length_squared < 1e-12:
            sv = Vector((0.0, 1.0, 0.0)) - d * d.y
        sv.normalize()
        up = d.cross(sv).normalized()
        if up.z < 0.0:                       # up は必ず外側(上)を向かせる
            up, sv = -up, -sv
        for j in range(seg):
            a = math.tau * j / seg
            c, sn = math.cos(a), math.sin(a)
            rr = (r_out[i] if sn >= 0.0 else r_in[i]) * k
            co.append(p + sv * (r_side[i] * k * c) + up * (rr * sn))
    for i in range(len(pts) - 1):
        for j in range(seg):
            aa = i * seg + j
            bb = i * seg + (j + 1) % seg
            faces.append((aa, bb, bb + seg, aa + seg))
    faces.append(tuple(range(seg - 1, -1, -1)))
    faces.append(tuple((len(pts) - 1) * seg + j for j in range(seg)))
    me.from_pydata([tuple(v) for v in co], [], faces)
    me.update()
    me.uv_layers.new(name="UVMap")
    uvl = me.uv_layers.active.data
    nring = len(pts)
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            if vi >= nring * seg:               # 蓋(見えない)
                uvl[li].uv = (u0, 0.0)
                continue
            i, j = divmod(vi, seg)
            uvl[li].uv = (u0 + (u1 - u0) * i / max(1, nring - 1), j / seg)
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return obj


def _bite(name, spine, r_in, table, side, k, sign):
    """噛み合わせ。中心線の内側の面から相手へ向かって出す。"""
    pts = [Vector((x * side, y, z)) for x, y, z in spine]
    out = []
    for i, (u, m) in enumerate(table):
        f = u * (len(pts) - 1)
        j = min(len(pts) - 2, int(f))
        t = f - j
        c = pts[j] * (1 - t) + pts[j + 1] * t
        ri = (r_in[j] * (1 - t) + r_in[j + 1] * t) * k
        d = (pts[j + 1] - pts[j]).normalized()
        up = d.cross(Vector((1.0, 0.0, 0.0)) - d * d.x).normalized()
        if up.z < 0.0:
            up = -up
        p = c + up * (ri * sign * 0.86)
        out.append(C.gem(f"{name}{i}", tuple(p), ri * m,
                         subdivisions=1, scale=(0.52, 1.0, 1.15)))
    return out


def claw_parts() -> tuple:
    """(甲殻色の部分, 淡い骨色の部分) を分けて返す。

    palm+fixed_finger は**1つのメッシュ**なので、色は材質2枚では分けられ
    ない。同じ形の先端側だけ別オブジェクトにして淡色を当てる ―― 輪郭は
    連続したまま、色だけ切り替わる。
    """
    hard, nail = [], []
    hard.append(C.uv_sphere(f"{NAME}_sternum", STERNUM_C, 1.0,
                            segments=15, rings=10, scale=STERNUM_R))
    n = len(CLAW_SPINE)
    cut = max(1, int(round(FIXED_FROM * (n - 1))))
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        k = CLAW_SCALE[tag]
        hard.append(_tube(f"{NAME}_arm{tag}", (ARM_ROOT, CARPUS),
                          [ARM_R[0], ARM_R[2]], side))
        hard.append(C.uv_sphere(f"{NAME}_carpus{tag}",
                                (CARPUS[0] * side, CARPUS[1], CARPUS[2]),
                                CARPUS_R * k, segments=11, rings=8,
                                scale=(0.86, 1.10, 0.92)))
        # 掌側(甲殻色)と固定指側(骨色)。**同じ中心線・同じ半径表**から
        # 切り出すので、継ぎ目で輪郭が折れない。
        # u は手首(0)から固定指の先(1)まで通しで張る。掌と固定指で
        # 別のテクスチャを使わないので、**色の境目はテクスチャの中で
        # 波打たせられる** ―― 設定画の、暗い殻が淡い指の根元を包む
        # 帆立貝のような縁がこれで出る(オブジェクトの境で切ると直線になる)。
        hard.append(_claw_body(
            f"{NAME}_palm{tag}", CLAW_SPINE[:cut + 1], CLAW_OUT[:cut + 1],
            CLAW_IN[:cut + 1], CLAW_SIDE[:cut + 1], CLAW_SEG, side, k,
            u0=0.0, u1=FIXED_FROM))
        nail.append(_claw_body(
            f"{NAME}_fixed{tag}", CLAW_SPINE[cut:], CLAW_OUT[cut:],
            CLAW_IN[cut:], CLAW_SIDE[cut:], CLAW_SEG, side, k,
            CLAW_CHIP[tag], u0=FIXED_FROM, u1=1.0))
        nail.append(_claw_body(
            f"{NAME}_movable{tag}", MOV_SPINE, MOV_OUT, MOV_IN, MOV_SIDE,
            MOV_SEG, side, k, u0=0.46, u1=0.98))
        nail += _bite(f"{NAME}_bitef{tag}", CLAW_SPINE, CLAW_IN,
                      BITE_FIXED, side, k, -1.0)
        nail += _bite(f"{NAME}_bitem{tag}", MOV_SPINE, MOV_OUT,
                      BITE_MOV, side, k, +1.0)
    return hard, nail


def build_claws() -> list:
    hard, nail = claw_parts()
    return hard + nail


def _is_nail(name: str) -> bool:
    """淡い骨色を当てる部品(指と歯)か。"""
    return any(k in name for k in ("fixed", "movable", "bite"))


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
    (-0.136, 0.250, (0.418, -0.212, 0.132), (0.364, -0.252, 0.010)),
    (+0.078, 0.262, (0.436, +0.106, 0.124), (0.382, +0.142, 0.010)),
    (+0.246, 0.238, (0.406, +0.318, 0.114), (0.348, +0.378, 0.010)),
]
# **前後へ開く。** 3本を同じ前後位置に並べると、側面から見て腿が視線と
# 平行になり、脛だけの「先細りの杭」に見える。前脚を前へ、後脚を後ろへ
# 振ると腿が側面に写り、膝の折れが読める。
# **誇張は外周の実測を超えない範囲で。** 後脚を +0.428 まで引いた版は
# 側面の奥行きが設定画より 61mm(6.5%)深くなり、Anatomy Gate が
# 0.852 → 0.834 に落ちた。読ませるために必要なのは脚の「太さと明度差」で、
# 長さではなかった。
THIGH_R = (0.068, 0.056, 0.046)       # 付け根 / 中 / 膝
KNEE_R = 0.052                        # 膝は節として膨らませる
SHIN_R = (0.046, 0.026, 0.006)        # 膝 / 中 / 足先(鋭く尖る)


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
    # --- 継ぎ目の描き込み影と擦れ(hand-painted-standard 規約3)---
    # 溝そのものだけでなく、**溝のすぐ外**に落ちる影と、板の上側の擦れを
    # 描く。樽の「たが直下の描き込み影」と同じ文法で、これが無いと板割りが
    # 「線を引いただけ」に見える。陰影ではなく**絵**なので、遮蔽ではなく
    # 面の向きで決め打ちする。
    g = d2 - d1
    if lip < 0.5 and PANEL_SEAM <= g < PANEL_SEAM * 3.2:
        w = (1.0 - (g - PANEL_SEAM) / (PANEL_SEAM * 2.2)) ** 2
        col = tuple(c * (1.0 - 0.20 * w) if n.z < 0.35 else c * (1.0 + 0.13 * w)
                    for c in col)
    # 板の上面の擦れ ―― 長く同じ場所にいて、上から埃と雨を受けた面が白ける
    col = tuple(c * (1.0 + 0.11 * max(0.0, n.z) ** 3) for c in col)
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
        for k in range(4):
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


# =================================================== 肢の描き込み(頂点カラー)
#
# `handbook/hand-painted-standard.md` 規約3「**単色マテリアルを貼らない**」。
# 甲羅は `bake_albedo` で描いているが、鋏・脚・顔は単色のままだった。
#
# ここはテクスチャではなく**頂点カラー**で描く ―― 肢へ UV を足すと
# TEXCOORD だけで 40KB 増え、テクスチャ本体と合わせて予算(700KB)を
# 超える。頂点カラーは 4B/頂点で済み、エンジン側は `assets.ts` の
# `vertexColors` が既に対応している。
#
# 補間で滲むので**硬い継ぎ目は描けない**が、肢はもともと関節ごとに別
# オブジェクトなので、継ぎ目はオブジェクトの境界が作ってくれる。頂点
# カラーが受け持つのは「節の根元が暗い」「背に稜線の明かり」「先が
# 汚れている」といった**面の中の階調**のほう。
#
# 値は材質色への**乗数**(three.js は diffuseColor に掛ける)。1.0 が素。
def _paint_vertex(obj, fn) -> None:
    """面ごとの位置と法線から頂点カラーを塗る。

    **BYTE_COLOR を使う(4B/頂点)。** FLOAT_COLOR は 16B/頂点で、これに
    しただけで glb が 649KB → 906KB に膨れた。BYTE_COLOR は sRGB として
    扱われ書き出しでリニアへ変換されるので、乗数は先に sRGB へ戻して書く。

    **頂点ごと(POINT)に塗る。** ループごと(CORNER)だと、同じ頂点に
    別々の色が乗るぶん書き出しで頂点が割れ、POSITION と NORMAL まで
    1割増える(実測 +25KB)。滑らかな階調を塗るだけなので頂点で足りる。

    **本体メッシュへ join される部品は塗らない。** 1部品でも色属性を持つと
    join 後にメッシュ全体が属性を持ち、甲羅ぶんの頂点まで増える。
    """
    me = obj.data
    if "ao" not in me.color_attributes:
        me.color_attributes.new("ao", type="BYTE_COLOR", domain="POINT")
    ca = me.color_attributes["ao"]
    me.color_attributes.active_color = ca
    for i, v in enumerate(me.vertices):
        r, g, b = fn(v.co, v.normal)
        ca.data[i].color = tuple(
            min(1.0, max(0.0, c)) ** (1.0 / 2.2) for c in (r, g, b)) + (1.0,)


def _axis_u(co, a, b) -> float:
    """線分 a→b 上での位置(0..1)。節の根元・先を知るのに使う。"""
    a, b = Vector(a), Vector(b)
    d = b - a
    ll = d.length_squared
    if ll < 1e-12:
        return 0.0
    return min(1.0, max(0.0, (Vector(co) - a).dot(d) / ll))


def _shade(top: float, n) -> tuple:
    """上向きの面を明るく、下向きを暗くする**描き込みの**陰影。

    AO ではない ―― 遮蔽を測るのではなく、「上から光が来る絵」として
    面の向きだけで決め打ちする(hand-painted-standard 規約3)。
    """
    k = 1.0 + top * (n.z * 0.5 + 0.5 - 0.5)
    return k


def _limb_fn(a, b, root_dark=0.74, tip_dark=0.92, top=0.16, stain=0.0):
    """節ひとつぶんの塗り。根元を落とし、上面を明るく、先をわずかに汚す。"""
    def fn(co, n):
        u = _axis_u(co, a, b)
        k = root_dark + (1.0 - root_dark) * min(1.0, u * 2.6)       # 根元の影
        k *= tip_dark + (1.0 - tip_dark) * (1.0 - max(0.0, u - 0.6) / 0.4)
        k *= _shade(top, n)
        if stain > 0.0:
            k *= 1.0 - stain * max(0.0, math.sin(co.y * 23.0 + co.z * 17.0)) * u
        return (k, k, k)
    return fn


def _blade_fn(spine):
    """刃。**背に稜線の明かり、腹と根元は落とす。** 設定画の指は平らな
    板ではなく、背に沿って一段明るい筋が走っている。"""
    a, b = spine[0], spine[-1]

    def fn(co, n):
        u = _axis_u(co, a, b)
        k = 0.80 + 0.20 * min(1.0, u * 2.2)          # 根元を落とす
        k *= 1.0 + 0.30 * max(0.0, n.z) ** 2         # 背の稜線
        k *= 1.0 - 0.16 * max(0.0, -n.z)             # 腹は落とす
        k *= 1.0 - 0.10 * max(0.0, u - 0.7) / 0.3    # 先端をわずかに締める
        return (k, k, k)
    return fn


def paint_limbs(eyes: list, claws: list, legs: dict) -> None:
    """鋏・脚・顔まわりへ描き込みを入れる。"""
    hard = [o for o in claws if not _is_nail(o.name)]
    nail = [o for o in claws if _is_nail(o.name)]
    for o in hard:
        nm = o.name
        if "sternum" in nm:
            continue          # 本体メッシュへ join されるので塗らない
        if "palm" in nm:
            continue      # テクスチャを貼るので頂点カラーは載せない
        if "arm" in nm:
            _paint_vertex(o, _limb_fn(ARM_ROOT, CARPUS, 0.70, 1.0, 0.18))
        elif "carpus" in nm:
            # 腕節は**周囲より暗い**。ここが明るいと節ではなく玉に見える
            _paint_vertex(o, lambda co, n: ((lambda k: (k, k, k))(
                0.78 * (1.0 + 0.16 * max(0.0, n.z)))))
    for o in nail:
        if any(w in o.name for w in ("fixed", "movable")):
            continue      # テクスチャを貼るので頂点カラーは載せない
        _paint_vertex(o, lambda co, n: (0.88, 0.88, 0.88))   # 噛み合わせの歯
    for tag in ("L", "R"):
        for o in legs[tag]:
            k = int(o.name[-1]) if o.name[-1].isdigit() else 0
            ry, rx, knee, foot = LEGS[k]
            side = 1.0 if tag == "L" else -1.0
            root = (rx * side, ry, 0.235)
            kn = (knee[0] * side, knee[1], knee[2])
            ft = (foot[0] * side, foot[1], foot[2])
            if "thigh" in o.name:
                _paint_vertex(o, _limb_fn(root, kn, 0.72, 1.0, 0.20))
            elif "knee" in o.name:
                _paint_vertex(o, lambda co, n: ((lambda q: (q, q, q))(
                    0.80 * (1.0 + 0.18 * max(0.0, n.z)))))
            else:
                _paint_vertex(o, _limb_fn(kn, ft, 0.82, 0.86, 0.18))
    for o in eyes:
        if "stalk" in o.name:
            _paint_vertex(o, lambda co, n: ((lambda k: (k, k, k))(
                0.78 + 0.22 * max(0.0, n.z))))
        elif "socket" in o.name:
            _paint_vertex(o, lambda co, n: (0.90, 0.90, 0.90))


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
# 肢の描き込み(頂点カラー)に容量を回すため 384 → 336 へ。溝は
# なお 3テクセル分あり、96px では区別がつかない。
SHELL_TEX = 336


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
    # 可動指は明るく、固定指と歯は一段暗い ―― 設定画では L164 対 L130 で、
    # 同じ色にすると2枚の刃が一枚板に融ける。
    # 爪は**テクスチャ**。掌・固定指・可動指は同じ u 座標系に載っていて、
    # 殻と骨の境目もテクスチャの中で波打たせているので、1枚で足りる。
    claw_m = C.make_textured_material(f"{NAME}_claw", claw_texture(),
                                      roughness=0.44)
    nailsh_m = _mat("nailshade", rough=0.48)     # 歯だけは単体の小物
    eye_m = _mat("eye", rough=0.22)
    # 眼窩の縁は顔より明るく、眼球は真っ黒、光点だけ白に近い。
    # この3段が無いと 96px で目が「●」に潰れる。
    socket_m = _mat("limbdark", 0.72, rough=0.88)
    # 眼柄は顔より**わずかに**明るいだけ(実測 86 対 77 = 1.12倍)。
    # limb を当てると顔の倍近く明るくなり、目の下に白い杭が2本立つ。
    stalk_m = _mat("limbdark", 1.30, rough=0.70)
    hilite_m = C.make_material(f"{NAME}_hilite", (0.95, 0.94, 0.92),
                               roughness=0.15)
    hilite_m["noOutline"] = True
    # **目に輪郭線を付けない** ―― 径 74mm の球に反転ハルが付くと目玉が
    # 膨れて「目が飛び出したカニ」になる。設定画の目は奥まっている。
    eye_m["noOutline"] = True
    nailsh_m["noOutline"] = True
    for o in moss:
        C.assign_material(o, moss_m)
    for o in debris:
        C.assign_material(o, debris_m[o.name.rsplit("_", 1)[-1]])
    for o in papers:
        C.assign_material(o, paper_m)
    for o in eyes:
        C.assign_material(o, hilite_m if "hilite" in o.name
                          else eye_m if "_eye" in o.name
                          else socket_m if "socket" in o.name else stalk_m)
    for o in claws:
        C.assign_material(
            o, claw_m if any(w in o.name for w in ("palm", "fixed", "movable"))
            else nailsh_m if _is_nail(o.name)
            else dark_m if "sternum" in o.name else limb_m)
    for o in body:
        C.assign_material(o, dark_m)
    for o in legs["L"] + legs["R"]:
        C.assign_material(o, leg_m)

    # 描き込み(規約3「単色マテリアルを貼らない」)。**join より前**に塗る
    # ―― join 後は部品ごとの中心線が判らなくなる。
    paint_limbs(eyes, claws, legs)

    # **苔と紙片は甲羅の骨へ固定する。** 甲羅の面から数 mm 浮いた小さな
    # 部品で、自動ウェイトだと胴の骨を拾って揺れたときに甲羅から剥がれる。
    pins = [C.mark_for_pin(o) for o in moss + papers + debris]
    sternum = [o for o in claws if "sternum" in o.name]
    # 前腕・節・掌は腕の骨へ、指と歯は開閉する骨へ。
    arms = {t: [o for o in claws if o.name.endswith(t)
                and any(k in o.name for k in ("arm", "carpus", "palm"))]
            for t in ("L", "R")}
    nails = {t: [o for o in claws if _is_nail(o.name)
                 and o.name.rstrip("0123456789").endswith(t)]
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
