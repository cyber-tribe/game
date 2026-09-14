"""
スリガラス ―― 設定画(`plan/models/reference-surigarasu-sheet.png`)から。

このモジュールが本番の造形。`monsters.MONSTERS` から呼ばれる
(monsters.py には状態アニメーション `surigarasu_animations` だけが残る)。

# 作り直しの経緯 ―― 「羽毛でできた雫」からの脱出

初版は、正面図と側面図の**外周マスク**から「高さ→幅」「高さ→前後」の表を
起こしてロフトへ積み、その上に全身を同じ大きさの羽毛で覆った。胴体
シルエットの IoU は正面 0.904 / 側面 0.885 まで出たが、**鳥に見えなかった。**

外周には羽毛の縁が含まれている。その形をそのまま裸のボディにして、上から
また羽毛を貼れば、ボディは最初から「膨らんだ輪郭」そのもの ―― 頭から裾まで
連続して太る雫になる。首も胸も翼も、どこにも作っていなかった。IoU が高かった
のは外周だけを合わせていたからで、**外周が合っていることは構造が合っている
ことを意味しない**(`handbook/modeling-pitfalls.md` 4-39)。

いまは**裸の解剖を先に作る**。判定は「羽毛を全部消しても 96px でカラスに
読めるか」(Body Anatomy Gate)。羽毛はその上に4層で戻す。

# 実測(設定画の**内側**の線。外周ではない)

正面図の全幅 136px の内訳が決定的だった:

    裸の胴 60px  +  左右に垂れた翼 38px ずつ  =  136px

つまり**正面シルエットの過半は翼**で、胴ではない。裸の頭も 54px しかなく、
外周から起こした初版の頭(76px)は 25% 太っていた。嘴が小さく見えたのは
このせいで、嘴自体の寸法はほぼ合っていた。

側面図には明確な段がある:

| sheet y | 部位 |            | sheet y | 部位 |
|---|---|            |---|---|
| 125 | 頭頂(裸の頭) |    | 200 | **胸の最前点**(x857) |
| 148 | 目の中心 |        | 230 | 胴の最大 |
| 161 | 嘴の先 |          | 285 | 腹の底(ここから下は脚) |
| 172 | **首のくびれ** |  | 308 | 接地 |

換算は 1px = `SC` m、接地を sheet y308(側面図は y307.5)とする。
"""
import math

import bpy
from mathutils import Vector

import common as C

NAME = "surigarasu"

SC = 0.001141             # m / 設定画1px。裸の頭頂 y117 〜 接地 y308 = 0.218m
HEIGHT = 0.218            # 基準身長(tests/helpers/modelBaseline.ts と一致)

# ============================================================ パレット
# **設定画から直接サンプリングした値。感覚で振らない。**
#
# ここは一度大きく間違えた。パレットのスウォッチ7色だけを見て基色を
# (65,63,60) の一様な黒とし、そこへ寒色補正を目分量で掛けていた。暗部を
# 1.30倍に持ち上げたぶん**明暗差が両端から潰れ**、実機は「灰紫〜灰緑の靄」に
# なった。設定画の鋭いカラス顔が消えていた。
#
# 実際に体のマスクを k-means で分けると、明度はこう広がっている:
#
# | L | 面積 |            | L | 面積 |
# |---|---|            |---|---|
# | 29 | 18% |          | 106 | 18% |
# | 53 | 27% |          | 147 | 8% |
# | 78 | 25% |          | 205 | 3% |
#
# **47% が L60 以下、11% が L140 以上。** 一様な黒でも、持ち上げた中間調でも
# ない。差し色(青・紫)も絶対値では淡く、B-G は +5 程度しかない ―― それが
# 「青紫にきらめく」と読めるのは、**まわりが L30 の黒だから**。だから明暗差を
# 潰すと、色相をいくら足しても差し色は立たない。
#
# 抽出は `scratchpad/sg_palette.py`(体のマスクを k-means、差し色は色の傾きで
# 抜き、顔は座標を指定して中央値)。
SHEET = {
    "dark":   (30, 29, 31),      # 羽の谷・体の陰(19%)
    "mid":    (55, 54, 57),      # 羽の地(28%)
    "light":  (82, 80, 83),      # 羽の面(24%)
    "pale":   (114, 110, 111),   # 明るい羽(16%)
    "blue":   (107, 106, 119),   # 青に寄る差し羽根(体の 18.9%)
    "violet": (124, 113, 124),   # 紫に寄る差し羽根(6.8%)
    "warm":   (204, 194, 183),   # 暖色に寄る明るい羽(13.9%)
    "hilite": (223, 215, 205),   # 最も明るい羽・ガラスの欠片(4%)
    # 胸の中央の大きな羽根。正面図の実測 ―― 水色 (127,139,157) は B>G>R の
    # はっきりした青、紫 (108,94,107) は R≒B>G。まわりの差し羽根
    # (107,106,119)より一段明るく、色も強い。
    "heroblue":   (142, 154, 170),
    "heroviolet": (126, 108, 124),
    "eye":    (214, 205, 192),   # 白目。純白ではなく少しくすんだ象牙色
    "pupil":  (22, 21, 19),      # 瞳。ほぼ黒
    "rim":    (33, 32, 32),      # 目を囲む黒い縁
    # くちばしと脚は設定画の実測が (114,107,101)(78,74,71) と少し暖色。
    # そこへ寒色補正の色み回しが乗ると**橙色の角**になって浮くので、実測から
    # 暖色成分だけ抜いた値を置く(明度は実測のまま)。
    "beak":   (110, 108, 105),   # くちばし。暗い灰褐色
    "leg":    (76, 75, 73),      # 脚・足指
}

# ゲームの灯りは寒色(ambient #6674a0 ×1.7 / key・fill #aec2f5)なので、設定画の
# 値をそのまま置くと画面では青い鳥になる(補正なしの実測は (59,65,90)、設定画は
# (70,69,70))。
#
# **ただし明度は 1mm も動かさない。** 以前は明るさごと持ち上げる係数を掛けて
# いて、暗部が 1.30倍になったぶん明暗差が両端から潰れ、体が「灰紫の靄」に
# なった。ここでやるのは**色みを回すことだけ** ―― 掛けたあとに元の平均へ
# 正規化して戻すので、設定画の L はそのまま残る。
TINT_FIX = (1.237, 1.078, 0.672)
# **差し羽根は回さない。** 「暗い体のなかに青紫〜白灰が散る」がこの種の色彩
# リズムで、そこまで中性へ寄せると全部が同じ暗灰色に潰れる。青紫は画面でも
# 青紫のまま残す ―― 打ち消したいのは面積の大きい地色の転びだけ。
#
# 明度で一律に決める曲線も試したが、「くちばしを中性に保つ」と「羽の地色を
# 中性に保つ」が同じ明度で両立しない(面積が違うだけ)。
TINT_W = {
    "dark": 1.00, "mid": 1.00, "light": 0.85, "pale": 0.70,
    "blue": 0.15, "violet": 0.15, "warm": 0.35, "hilite": 0.20,
    "heroblue": 0.05, "heroviolet": 0.05,
    "eye": 0.15, "pupil": 1.00, "rim": 1.00,
    "beak": 0.25, "leg": 0.60,
}


def _tint(rgb, w: float = 1.0):
    """色みだけ回す(明度は保つ)。0..1 の組を受けて 0..1 の組を返す。"""
    if w <= 0.0:
        return tuple(min(1.0, max(0.0, x)) for x in rgb)
    fix = [1.0 + (f - 1.0) * w for f in TINT_FIX]
    out = [a * b for a, b in zip(rgb, fix)]
    m0, m1 = sum(rgb) / 3.0, sum(out) / 3.0
    if m1 > 1e-6:
        out = [x * m0 / m1 for x in out]
    return tuple(min(1.0, max(0.0, x)) for x in out)


def _tint_by_value(rgb):
    """トレース画のように連続した絵に掛ける版。明るい画素ほど弱く回す ――
    寒色の環境光に青く沈むのは暗部で、明部はもともと転んでいない。"""
    t = min(1.0, max(0.0, (sum(rgb) / 3.0 - 0.20) / 0.50))
    return _tint(rgb, 1.0 - t * t * (3.0 - 2.0 * t))


def _srgb(key: str, k: float = 1.0):
    return _tint([v / 255.0 * k for v in SHEET[key]], TINT_W.get(key, 1.0))


def _mat(key: str, k: float = 1.0, rough: float = 0.75):
    return C.make_material(f"{NAME}_{key}", _srgb(key, k), roughness=rough)


def _jitter(a: float, b: float) -> float:
    """段と枚数から決まる擬似乱数(0..1)。乱数を使うとビルドのたびに形が
    変わり、シルエット比較の数字が再現しなくなる。"""
    v = math.sin(a * 12.9898 + b * 78.233) * 43758.5453
    return v - math.floor(v)


def _lerp_table(table, u: float):
    """表を Catmull-Rom で引く。

    **直線で繋がない** ―― 折れ点がそのまま面の折り目になり、透視のかかる実機で
    体が多面体に見える(`modeling-pitfalls.md` 4-32)。**余弦でも繋がない** ――
    余弦は各制御点で微分が 0 になるので、制御点ごとに平らな段ができる。制御点
    15・リング44 で使ったら、胴が**横縞の入った芋虫**になった(4-40)。"""
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


# ============================================================ 裸の胴(解剖)
# 前が -Y、上が +Z、接地が z=0。v は裸の胴の高さの正規化(0=腹の底
# 1=裸の頭頂)。**外周ではなく内側の線を読む。**
BODY_Z0 = 0.0257          # 腹の底(sheet y285)
HEAD_TOP = 0.2082         # 裸の頭頂(sheet y125)。冠羽はこの上へ
BODY_SPAN = HEAD_TOP - BODY_Z0

# (v, 半幅rx, 側面の前縁yf, 側面の後縁yr)。後縁は**翼を含まない** ――
# 側面図の後ろ半分の輪郭は翼なので、そのまま読むと胴が翼を飲み込む。
TRUNK = [
    (0.000, 0.0160, -0.0205, +0.0103),   # y285 腹の底
    (0.063, 0.0240, -0.0300, +0.0220),   # y275
    (0.157, 0.0300, -0.0410, +0.0340),   # y260
    (0.251, 0.0340, -0.0500, +0.0420),   # y245
    (0.345, 0.0360, -0.0570, +0.0450),   # y230 胴の最大
    (0.438, 0.0360, -0.0640, +0.0420),   # y215
    (0.530, 0.0350, -0.0670, +0.0320),   # y200 胸の最前点
    (0.592, 0.0320, -0.0660, +0.0200),   # y190
    (0.655, 0.0280, -0.0640, +0.0050),   # y180 肩
    (0.705, 0.0220, -0.0570, -0.0120),   # y172 **首のくびれ**
    (0.749, 0.0280, -0.0640, -0.0030),   # y165 下あご
    (0.812, 0.0300, -0.0660, -0.0010),   # y155
    (0.874, 0.0310, -0.0640, -0.0050),   # y145 頭の最大
    (0.920, 0.0285, -0.0605, -0.0115),   # y137
    (0.960, 0.0225, -0.0570, -0.0165),   # y131
    (0.985, 0.0135, -0.0510, -0.0230),   # y127
    (1.000, 0.0020, -0.0400, -0.0320),   # y125 頭頂
]
CAP_U = 0.075
TRUNK_SEG, TRUNK_RING = 40, 44


def _cap(v: float) -> float:
    """腹の底を円弧で丸める係数。平板で閉じない(4-32)。

    **頭頂には掛けない。** 表の末尾で既に絞ってあるところへ重ねると、絞りが
    二重になって頭に円錐の尖りが立つ(96px で「フードを被った人影」に見えた)。"""
    return 1.0 if v >= CAP_U else math.sqrt(max(0.0, 1.0 - ((CAP_U - v) / CAP_U) ** 2))


def trunk_ring(v: float):
    """高さ v の断面 (rx, ry, cy)。羽毛もこの面の上に生やす。"""
    rx, yf, yr = _lerp_table(TRUNK, v)
    k = _cap(v)
    return rx * k, (yr - yf) * 0.5 * k, (yr + yf) * 0.5


def trunk_surface(v: float, th: float, out: float = 0.0):
    """高さ v・角 th の胴の面の点と外向き水平法線。

    **v は [0,1] へ丸めてから z も出す。** 断面だけ丸めて z を素の v で出して
    いたので、長い羽が腹の底より下へ伸びて接地面を割っていた(4-51)。"""
    v = min(1.0, max(0.0, v))
    rx, ry, cy = trunk_ring(v)
    c, s = math.cos(th), math.sin(th)
    n = Vector((c / max(rx, 1e-6), s / max(ry, 1e-6), 0.0)).normalized()
    p = Vector((rx * c, cy + ry * s, BODY_Z0 + v * BODY_SPAN))
    return p + n * out, n


def build_trunk() -> list:
    rings = []
    for i in range(TRUNK_RING + 1):
        v = i / TRUNK_RING
        rx, ry, cy = trunk_ring(v)
        rings.append((BODY_Z0 + v * BODY_SPAN, max(rx, 1e-4), max(ry, 1e-4), 0.0, cy))
    return [C.loft(f"{NAME}_trunk", rings, segments=TRUNK_SEG)]


# ==================================================================== 翼
# **正面シルエットの過半は翼。** 設定画の全幅 136px のうち胴は 60px しかなく、
# 左右に垂れた翼が 38px ずつを占める。初版はこれを全部「胴の幅」として読んで
# いたので、翼が胴に溶けて全身が一つの塊になった。
#
# 翼は「1枚の大きな立体(翼塊)+ 中羽 + 風切羽」の3階層で作る。
# **翼弦を大きく取りすぎない。** 半径 42mm(=翼長 84mm)で作った版は、胴より
# 大きな塊が背中に貼り付いた「別の生き物」になった。
WING_SPINE = [
    # (中心, 厚みの半径(横), 翼弦の半径(稜線に直交))
    (Vector((0.0215, -0.0120, 0.1455)), 0.0072, 0.0120),   # 肩(胴に埋める)
    (Vector((0.0400, -0.0020, 0.1270)), 0.0115, 0.0270),
    (Vector((0.0480, +0.0140, 0.1000)), 0.0125, 0.0295),   # いちばん外へ張る
    (Vector((0.0455, +0.0330, 0.0740)), 0.0100, 0.0245),
    (Vector((0.0390, +0.0530, 0.0530)), 0.0050, 0.0125),   # 翼の先
]
WING_SEG = 12

# 中羽(median coverts)。翼面に小羽根をびっしり敷いても 96px では読めず、翼
# だけ「色を塗り分けたローポリの板」に見えた。設定画の側面は
#   大きな翼面 → 3〜4枚の中羽 → 5〜6枚の長い風切羽
# という**大構造**でできている。数えられる大きさの中羽を4枚だけ置く。
MEDIANS = [
    # (稜線上の位置t, 先端, 半幅, 半厚)
    (0.30, Vector((0.0455, +0.0330, 0.0790)), 0.0135, 0.0026),
    (0.46, Vector((0.0440, +0.0435, 0.0640)), 0.0130, 0.0025),
    (0.62, Vector((0.0405, +0.0530, 0.0520)), 0.0122, 0.0024),
    (0.78, Vector((0.0360, +0.0610, 0.0425)), 0.0112, 0.0022),
]
# 風切羽。翼の後縁から後下方へ伸びる長い羽 ―― 設定画で輪郭を切っているのは
# これ。**後ろから見て扇に開かせない**(先端を横へ散らした版は背面が
# 「草のスカート」になった)。
PRIMARIES = [
    (0.50, Vector((0.0300, +0.0620, 0.0540)), 0.0100, 0.0019),
    (0.61, Vector((0.0280, +0.0715, 0.0445)), 0.0100, 0.0019),
    (0.72, Vector((0.0258, +0.0800, 0.0368)), 0.0095, 0.0018),
    (0.82, Vector((0.0236, +0.0865, 0.0305)), 0.0088, 0.0017),
    (0.91, Vector((0.0214, +0.0880, 0.0272)), 0.0078, 0.0016),
    (1.00, Vector((0.0192, +0.0900, 0.0248)), 0.0066, 0.0015),
]


def _spine_at(spine, t: float):
    """稜線を余弦で滑らかにサンプルし、(点, 接線, 厚み, 翼弦) を返す。"""
    t = min(1.0, max(0.0, t)) * (len(spine) - 1)
    i = min(len(spine) - 2, int(t))
    k = 0.5 - 0.5 * math.cos(math.pi * (t - i))
    (p0, w0, h0), (p1, w1, h1) = spine[i], spine[i + 1]
    return (p0.lerp(p1, k), (p1 - p0).normalized(),
            w0 + (w1 - w0) * k, h0 + (h1 - h0) * k)


def _blade_point(spine, t: float, th: float, side: float, taper: float = 1.0):
    """レンズ断面の面上の点と法線。厚みは横(X)、翼弦は稜線に直交。

    **th=0 が外側の面**。帯を巻くときの基準角度をここからずらすと、横から
    見える面だけが裸で残る(4-54)。"""
    p, tan, hw, hh = _spine_at(spine, t)
    e_thick = Vector((1.0, 0.0, 0.0))
    e_chord = tan.cross(e_thick)
    if e_chord.length_squared < 1e-12:
        e_chord = Vector((0.0, 0.0, 1.0))
    e_chord.normalize()
    c, s = math.cos(th), math.sin(th)
    pt = p + e_thick * (hw * taper * c) + e_chord * (hh * taper * s)
    n = (e_thick * (c / max(hw, 1e-6)) + e_chord * (s / max(hh, 1e-6))).normalized()
    pt.x *= side
    n.x *= side
    return pt, n


def _blade(name: str, spine, side: float, rings: int = 10, seg: int = 10,
           stripe: int | None = None):
    """稜線に沿ったレンズ形の立体。翼塊にも中羽にも風切羽にも使う。

    `stripe` を渡すと羽の縞テクスチャ(横=縞の種類、縦=根元→先)の UV を貼る。
    **UV を必ず与えること** ―― 縞を指定しないと UV レイヤーが作られず、結合後に
    (0,0) を拾って翼面がのっぺりした明るい板になる(4-54)。"""
    me = bpy.data.meshes.new(name)
    co, faces, uvs = [], [], []
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
            if stripe is not None:
                sx = (stripe % STRIPES + 0.5) / STRIPES
                uvs += [(sx, t0), (sx, t0), (sx, t1), (sx, t1)]
    faces.append(tuple(range(seg - 1, -1, -1)))
    if stripe is not None:
        uvs += [((stripe % STRIPES + 0.5) / STRIPES, 0.0)] * seg
    me.from_pydata(co, [], faces)
    me.update()
    if stripe is not None:
        layer = me.uv_layers.new(name="UVMap")
        for i, uv in enumerate(uvs):
            layer.data[i].uv = uv
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return obj


def build_wings() -> list:
    """翼塊・中羽・風切羽。左右それぞれ 1+4+6 個。"""
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        out.append(_blade(f"{NAME}_wing{tag}", WING_SPINE, side, rings=12, seg=12,
                          stripe=4))
        for k, (t, tip, hw, ht) in enumerate(MEDIANS):
            root, _, _, _ = _spine_at(WING_SPINE, t)
            root = root + Vector((0.002, -0.004, 0.004))
            mid = root.lerp(tip, 0.5)
            spine = [(root, ht * 1.3, hw * 0.55),
                     (mid, ht, hw), (tip, ht * 0.3, hw * 0.22)]
            out.append(_blade(f"{NAME}_med{tag}{k}", spine, side, rings=6, seg=8,
                              stripe=int(_jitter(k + 40, 8.0) * STRIPES)))
        for k, (t, tip, hw, ht) in enumerate(PRIMARIES):
            root, _, _, _ = _spine_at(WING_SPINE, t)
            root = root + Vector((-0.004, 0.010, -0.006))
            mid = root.lerp(tip, 0.5) + Vector((0.0, 0.0, 0.004))
            spine = [(root, ht * 1.4, hw * 0.75),
                     (mid, ht, hw), (tip, ht * 0.35, hw * 0.30)]
            out.append(_blade(f"{NAME}_prim{tag}{k}", spine, side, rings=6, seg=8,
                              stripe=int(_jitter(k, 4.0) * STRIPES)))
    return out


# ================================================================== 尾羽
TAIL = [-2, -1, 0, 1, 2]


def build_tail() -> list:
    out = []
    for k, i in enumerate(TAIL):
        root = Vector((0.0072 * i, +0.0380, 0.0480))
        tip = Vector((0.0140 * i, +0.1005, 0.0140 - abs(i) * 0.0011))
        mid = root.lerp(tip, 0.5) + Vector((0.0, 0.0, 0.003))
        spine = [(root, 0.0022, 0.0080), (mid, 0.0019, 0.0105), (tip, 0.0008, 0.0040)]
        out.append(_blade(f"{NAME}_tail{k}", spine, 1.0, rings=6, seg=8,
                          stripe=int(_jitter(k, 9.0) * STRIPES)))
    return out


# ================================================================== 嘴
# 側面図の実測: 先 (825,161) / 付け根 上(867,140) 下(866,164)。
# **付け根が太い。** 高さ 24px(27mm)・幅 18px(20mm)あり、正面では顔の中心を
# 占める。初版は細い雫で、これが「嘴が小さい」の正体だった。付け根は頭の面
# (y=-0.066)より内側に置く ―― 面の上に置くと側面で浮く。
BEAK_BASE = (0.000, -0.0460, 0.1780)
BEAK_TIP = (0.000, -0.1038, 0.1671)
BEAK_HALF = (0.0124, 0.0162)      # 付け根の 半幅 / 半高


def build_beak() -> list:
    a, b = Vector(BEAK_BASE), Vector(BEAK_TIP)
    d = (b - a).normalized()
    up = Vector((0.0, 0.0, 1.0))
    side = d.cross(up).normalized()
    n, seg = 7, 10
    me = bpy.data.meshes.new(f"{NAME}_beak")
    co, faces = [], []
    for i in range(n + 1):
        t = i / n
        p = a + (b - a) * t
        # 上嘴が下嘴より前へ出るので、先へ行くほど断面を上へ寄せる
        p = p + up * (0.0022 * t * t)
        k = (1.0 - t) ** 0.46          # 根元の太さを先まで引っぱる
        for j in range(seg):
            th = j * math.tau / seg
            co.append(tuple(p + side * (BEAK_HALF[0] * k * math.cos(th))
                            + up * (BEAK_HALF[1] * k * math.sin(th))))
    for i in range(n):
        for j in range(seg):
            a_, b_ = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a_, b_, b_ + seg, a_ + seg))
    faces.append(tuple(range(seg - 1, -1, -1)))
    me.from_pydata(co, [], faces)
    me.update()
    obj = bpy.data.objects.new(f"{NAME}_beak", me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return [obj]


# ============================================================ 顔(2Dトレース)
# **顔は 2D、頭は 3D。** この種のアイデンティティは、
#   左右に大きく開いた白目 / 小さな黒い瞳 / 目を囲む黒い縁 /
#   目の周りへ落ちる暗い羽毛 / 少し困ったような視線
# という**2D上の配置関係**にある。3Dの眼球とライティングで再現しようとすると、
# 正面に残るのは「白い丸+黒い嘴」だけの無機質な顔になった(4-44)。
#
# ただし**嘴まで 2D にしてはいけない。** 側面図では嘴の突出がこの種の
# シルエットそのものなので、嘴は 3D のまま。眼球ジオメトリは持たない ――
# 設定画の側面で目は球として突出していない。
#
# 貼り方: 設定画の正面をそのまま平面デカールにすると 45° で白目が横へ伸び、
# 顔から浮く。ここでは**頭の断面で逆投影してから貼る**(4-45) ―― アトラスの
# 横軸は正面の x ではなく頭まわりの**方位角 φ**で、テクセルごとに
#     sheet_x = 正面の中心 + rx(z)・sin(φ) / SC
# で設定画を舐める。0° では設定画の正面と一致し、45°・90° では頭の丸みに
# 沿って自然に詰まる。
SHEET_PNG = "plan/models/reference-surigarasu-sheet.png"
FRONT_CX = 704.0          # 正面図の体の中心(sheet x)
FRONT_GROUND = 308.0      # 正面図の接地(sheet y)
FACE_Z0, FACE_Z1 = 0.1580, 0.2010     # アトラスが覆う高さ
FACE_ARC = math.radians(160.0)        # 覆う方位角の幅
ATLAS_W, ATLAS_H = 160, 112
# 目の中心(sheet)と、アトラスの不透明域。**顔全体を貼らない** ―― 中央は
# 3D の嘴が占めるので、貼るのは左右の目のまわりだけ。
EYE_SHEET = ((685.0, 148.0), (723.0, 148.0))
EYE_PATCH = (13.5, 15.0, 5.0)         # 半径x / 半径y / ぼかし幅(px)
# **中央は貼らない。** 設定画の正面図では嘴が (170,157,143) の明るい灰褐色の
# 楔として顔の中心を占める。そこまでトレースすると、3Dの嘴のまわりに
# **もう一枚の嘴が描かれた**状態になり、顔の中心が橙色に濁る。
BEAK_GUARD = 13.0                     # sheet x でこの幅は不透明度 0
# 白目を明るい側へ寄せる。設定画の白目は側面図で (214,205,192)、いちばん明るい
# 画素で (235,227,218) だが、エンジンのトゥーン階調は明部を頭打ちにする(4-48)
# ので、そのまま焼くと画面では灰白にしか出ない。**明るい画素だけ**を白へ寄せ、
# 瞳と黒縁はトレースのまま残す(4-56)。
EYE_WHITE = (238.0, 232.0, 222.0)
EYE_WHITE_FROM, EYE_WHITE_TO = 0.46, 0.72
EYE_WHITE_AMOUNT = 0.90
# 羽毛を生やさない範囲(モデル座標)。目の絵が羽で隠れては元も子もない
EYE_C = (0.0217, -0.0505, 0.1826)
EYE_KEEP = 0.0235
# 胴のアルベドの解像度。顔のトレースを潰さないために大きく取る。
TRUNK_TEX = 512

_ATLAS = None


def face_atlas():
    """設定画の目のまわりを、頭の断面で逆投影したアトラス(RGBA)。"""
    global _ATLAS
    if _ATLAS is not None:
        return _ATLAS
    import os
    import numpy as np
    path = os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), SHEET_PNG)
    img = bpy.data.images.load(path)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    # Blender の pixels は**下から上**。設定画の y に合わせて反転する
    src = buf.reshape(h, w, 4)[::-1, :, :3]
    bpy.data.images.remove(img)

    out = np.zeros((ATLAS_H, ATLAS_W, 4), dtype=np.float32)
    for j in range(ATLAS_H):
        z = FACE_Z0 + (j + 0.5) / ATLAS_H * (FACE_Z1 - FACE_Z0)
        v = (z - BODY_Z0) / BODY_SPAN
        rx, _ry, _cy = trunk_ring(min(1.0, max(0.0, v)))
        sy = FRONT_GROUND - z / SC
        for i in range(ATLAS_W):
            phi = ((i + 0.5) / ATLAS_W - 0.5) * FACE_ARC
            sx = FRONT_CX + rx * math.sin(phi) / SC
            xi, yi = int(round(sx)), int(round(sy))
            if not (0 <= xi < w and 0 <= yi < h):
                continue
            a = 0.0
            for cx, cy in EYE_SHEET:
                d = math.hypot((sx - cx) / EYE_PATCH[0], (sy - cy) / EYE_PATCH[1])
                a = max(a, min(1.0, (1.0 - d) * EYE_PATCH[0] / EYE_PATCH[2] + 1.0))
            if abs(sx - FRONT_CX) < BEAK_GUARD:
                a *= max(0.0, (abs(sx - FRONT_CX) - BEAK_GUARD * 0.45)
                        / (BEAK_GUARD * 0.55))
            a = min(1.0, max(0.0, a))
            # アトラスの左右端は必ず 0 へ落とす(継ぎ目を出さない)
            a *= min(1.0, (0.5 - abs((i + 0.5) / ATLAS_W - 0.5)) * 12.0)
            rgb = src[yi, xi]
            lum = float(rgb.mean())
            k = min(1.0, max(0.0, (lum - EYE_WHITE_FROM)
                             / (EYE_WHITE_TO - EYE_WHITE_FROM)))
            k = k * k * (3.0 - 2.0 * k) * EYE_WHITE_AMOUNT
            out[j, i, :3] = [c + (w_ / 255.0 - c) * k
                             for c, w_ in zip(rgb, EYE_WHITE)]
            out[j, i, 3] = a
    _ATLAS = out
    return out


def face_sample(p: Vector, rx: float, ry: float, cy: float):
    """頭の面の点 p に貼る顔の色と不透明度。範囲外は (None, 0)。"""
    if not (FACE_Z0 <= p.z <= FACE_Z1):
        return None, 0.0
    phi = math.atan2(p.x / max(rx, 1e-6), -(p.y - cy) / max(ry, 1e-6))
    u = phi / FACE_ARC + 0.5
    if not (0.0 <= u <= 1.0):
        return None, 0.0
    at = face_atlas()
    i = min(ATLAS_W - 1, int(u * ATLAS_W))
    j = min(ATLAS_H - 1, int((p.z - FACE_Z0) / (FACE_Z1 - FACE_Z0) * ATLAS_H))
    t = at[j, i]
    # トレースした色も**明度は設定画のまま**。色みだけ灯りに合わせて回す
    return _tint_by_value((float(t[0]), float(t[1]), float(t[2]))), float(t[3])


# ============================================================== 脚・足
# 正面図の実測: 脚の中心 ±23px(±0.0262m)、脛の太さ 10px。露出は腹の底 y285
# から足 y300 までの 15px(17mm)しかなく、その下に大きな足指が 12px 続く。
# **脚は短くて太い。** 設定画では短いながら黒い脚と大きな足がはっきり見える
# ので、明るくするのではなく太さと足指の形でシルエットを立てる(実測の脛は
# (73,70,67)、足指は (51,49,47) と、体の地色より暗い)。
LEG_TOP = (0.0262, -0.0330, 0.0400)
LEG_FOOT = (0.0262, -0.0335, 0.0100)
LEG_R = 0.0070
TOES = [(-0.0315, 0.0), (-0.0185, -0.0180), (-0.0185, 0.0180), (0.0200, 0.0)]
TOE_R = 0.0052


def build_legs() -> dict:
    """脚と足指。左右を**別々に返す**(それぞれの骨へ親化するため)。

    **輪郭線を付けない** ―― 直径 14mm の脚に 6.5mm の反転ハルが付くと太り、
    鳥の脚が丸太になる。"""
    out = {"L": [], "R": []}
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        top = Vector((LEG_TOP[0] * side, LEG_TOP[1], LEG_TOP[2]))
        foot = Vector((LEG_FOOT[0] * side, LEG_FOOT[1], LEG_FOOT[2]))
        out[tag].append(C.curve_tube(f"{NAME}_leg{tag}", [top, (top + foot) * 0.5, foot],
                                     [LEG_R * 1.15, LEG_R, LEG_R * 0.95],
                                     resolution=2, bevel_resolution=2))
        for k, (dy, dx) in enumerate(TOES):
            tip = foot + Vector((dx * side, dy, -0.0092))
            knuck = foot + Vector((dx * side * 0.42, dy * 0.42, -0.0030))
            out[tag].append(C.curve_tube(f"{NAME}_toe{tag}{k}", [foot, knuck, tip],
                                         [TOE_R, TOE_R * 0.92, TOE_R * 0.34],
                                         resolution=2, bevel_resolution=1))
    return out


# ============================================================ ガラスの欠片
SHARDS = [
    ((+0.086, -0.020, 0.150), 0.0075, (0.55, 0.35, 1.25)),
    ((-0.079, +0.030, 0.108), 0.0065, (0.50, 0.40, 1.15)),
    ((+0.058, +0.070, 0.056), 0.0060, (0.45, 0.35, 1.30)),
]


def build_shards() -> list:
    return [C.gem(f"{NAME}_shard{i}", c, r, subdivisions=1, scale=s)
            for i, (c, r, s) in enumerate(SHARDS)]


# ================================================================== 羽毛
# **4階層に分ける。** 初版は全身を同じ大きさの小羽根で敷き詰めたので、どこも
# 同じ密度になり、頭も翼も胴に溶けた。設定画は
#   頭部の短羽 / 胸腹の中羽 / 翼の雨覆 / 尾羽
# の4つで、それぞれ大きさも向きも違う。羽毛は**構造の上に乗せる飾り**で
# あって、構造そのものではない。
STRIPES = 16              # 羽の縞の種類
HERO_STRIPES = ("heroblue", "heroviolet", "hilite", "warm")  # 主役の羽根用
FEATHER_SEG = 3
FEATHER_TIP = 0.26        # 先の幅(根元の何倍か)
# 幅の落ち方。**先へ向かって一直線に細らせない** ―― 細長い羽でそれをやると、
# 羽ではなく**木の破片**の束に見える。設定画の羽は槍の穂先で、6割の位置まで
# 太いまま来て、そこから先だけ尖る。
FEATHER_TAPER = 1.6

# (名前, vの範囲, 段数, 1枚の幅, 垂れ(段の高さの何倍), 反り, 顔を空ける角度)
#
# **縦横比を間違えていた。** 幅 19.5mm × 長さ 16mm の「横長の鱗」を敷き詰めて
# いたので、体が羽毛ではなく**鎧**に見えていた。設定画の胸の羽根は**槍の
# 穂先**で、縦横比はおよそ 1:2.3。胸の上のほうは大きく幅 14px(16mm)、
# 下腹へ行くほど小さい。**細くしすぎない** ―― 9mm まで細めた版は 96px で
# 「木の破片の束」に見えた。1枚が画面で 6px 前後に写る大きさが要る。
TRUNK_LAYERS = [
    ("body", 0.00, 0.70, 12, 0.0138, 1.85, 0.0034, 0.0),
    ("head", 0.70, 1.00, 8, 0.0088, 1.45, 0.0030, 58.0),
]
# 大きさは3段に分ける。1種類だと、どれだけ数を増やしても規則正しい網目に
# しかならない(長さ倍率, 幅倍率)
FEATHER_SIZES = ((0.70, 0.85), (1.00, 1.00), (1.42, 1.18))
FEATHER_SKEW = 12.0       # 1枚ごとの傾きの振れ(度)


def feather_texture():
    """羽の縞の帯。横=縞の種類、縦=根元(0)→先(1)。

    設定画の羽は「黒地の先が半透明に抜けて、角度によって淡く虹色にきらめく」。
    **全部の縞を光らせないこと** ―― 一様に明るくした版は 96px で「淡い灰色の
    毬」にしか見えなかった。**明るい縞をケチるのも駄目** ―― エンジンの環境光は
    暗部を持ち上げ明部を頭打ちにするので、albedo の明るい側を節約すると明度
    分布が中央へ潰れる。"""
    h = 32
    img = bpy.data.images.new(f"{NAME}_feather", STRIPES, h, alpha=False)
    px = []
    for y in range(h):
        t = (y + 0.5) / h                       # 0=根元 1=先
        for x in range(STRIPES):
            # **先頭4本は「主役の羽根」専用。** 手で置く羽根に明るい縞を割り
            # 当てたいのに、縞の明るさが擬似乱数任せだと、番号を指定しても
            # 地味な縞に当たることがある。ここだけ固定する。
            if x < len(HERO_STRIPES):
                px += [*(min(1.0, a + (b - a) * t ** 0.65) for a, b
                         in zip(_srgb("dark"), _srgb(HERO_STRIPES[x]))), 1.0]
                continue
            j = _jitter(x * 3 + 1, 7.0)
            hot = j > 0.76
            if j > 0.90:
                top = _srgb("hilite")
            elif j > 0.76:
                top = _srgb("warm")
            elif j > 0.60:
                top = _srgb("violet")
            elif j > 0.40:
                top = _srgb("blue")
            elif j > 0.18:
                top = _srgb("pale")
            else:
                top = _srgb("light")
            # **根元を暗くするのは光る縞だけ。** 全部の縞を "dark" から始めたら、
            # L<40 が全体の 35%(設定画は 18%)になり、明るい側の面積を食って
            # いた。地味な縞は "mid" から始める。
            root = _srgb("dark") if hot else _srgb("mid")
            k = t ** (0.70 if hot else 1.00)
            px += [*(min(1.0, a + (b - a) * k) for a, b in zip(root, top)), 1.0]
    img.pixels = px
    img.pack()
    return img


def _wing_covers(p: Vector) -> bool:
    """点 p が翼塊の内側かどうか。胴の羽毛を翼の下へ潜らせないための判定。

    **球で抜かない。** 翼は厚み 12mm・翼弦 30mm の扁平なレンズなので、半径
    max(厚み, 翼弦) の球で抜くと、実際には翼が無い肩や脇まで抉れて**側面が
    禿げる**(4-55)。断面の楕円で判定する。"""
    q = Vector((abs(p.x), p.y, p.z))
    e_thick = Vector((1.0, 0.0, 0.0))
    for i in range(17):
        c, tan, hw, hh = _spine_at(WING_SPINE, i / 16.0)
        e_chord = tan.cross(e_thick)
        if e_chord.length_squared < 1e-12:
            continue
        e_chord.normalize()
        d = q - c
        if abs(d.dot(tan)) > 0.010:
            continue
        if (d.x / max(hw, 1e-6)) ** 2 + (d.dot(e_chord) / max(hh, 1e-6)) ** 2 < 1.0:
            return True
    return False


def _strap(co, faces, uvs, at, width, stripe):
    """羽1枚の帯。`at(t)` は t(0=根元 1=先)で (点, 法線) を返す関数。

    **根元と先を直線で結んではいけない。** 直線で結ぶと、曲がった体の上では
    弦が面から浮き、羽ではなく**体に刺さった平板**に見える(4-43)。"""
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


# ======================================================= 冠羽・主役の羽根
# **①頭頂〜後頭部の大きな羽毛房。** 設定画の側面は頭がトゲトゲで、96px でも
# それが効く。細い毛を大量に足しても「毛羽立ち」にしかならず、丸頭のままだった
# ―― 数えられる大きさの房を置く。
#
# **根元は頭の面へ寝かせ、先だけ浮かせる。** 1枚ずつを 45〜90° 起こした版は、
# 側面で「ボサボサの冠」「花びら」に見えた(丸頭を直した反動)。設定画の
# 頭頂〜後頭部はギザギザだが、羽そのものは頭の表面に沿っている。`rise` が面から
# 起きる量(0=完全に寝る 1=法線方向)。頭頂中央の数枚だけ強く立てる(4-52)。
#
# **冠は前後の稜線に並べる。** 左右 45° あたりに大きな房を立てたら、カラスでは
# なく**耳を立てたフクロウ**になった。
CROWN = [
    # (根元の v, 方位角(度。270=前 90=後ろ), 流れる向き(Y,Z), 長さ, 幅, 厚み, rise)
    (0.870, 272.0, (-0.75, 1.00), 0.0125, 0.0058, 0.0017, 0.14),
    (0.935, 280.0, (-0.30, 1.00), 0.0155, 0.0062, 0.0018, 0.30),
    (0.980, 320.0, (-0.05, 1.00), 0.0175, 0.0066, 0.0019, 0.52),
    (0.985,  55.0, (+0.35, 1.00), 0.0180, 0.0066, 0.0019, 0.55),
    (0.950,  84.0, (+0.80, 0.85), 0.0175, 0.0064, 0.0019, 0.34),
    (0.890,  90.0, (+1.00, 0.55), 0.0170, 0.0062, 0.0018, 0.20),
    (0.825,  92.0, (+1.00, 0.30), 0.0160, 0.0058, 0.0017, 0.12),
    (0.940, 130.0, (+0.70, 0.85), 0.0135, 0.0052, 0.0016, 0.16),
    (0.940, 230.0, (-0.70, 0.85), 0.0135, 0.0052, 0.0016, 0.16),
    (0.870,  86.0, (+1.00, 0.20), 0.0150, 0.0056, 0.0016, 0.10),
    (0.900, 160.0, (+0.85, 0.60), 0.0125, 0.0050, 0.0015, 0.10),
    (0.900, 200.0, (-0.85, 0.60), 0.0125, 0.0050, 0.0015, 0.10),
]


def build_crown() -> list:
    """頭頂〜後頭部の大きな羽毛房。輪郭に切れ込みを作るのが役目なので、帯では
    なく**厚みのある楔**で作る(帯は 90° で消える)。"""
    out = []
    for k, (v, deg, (dy, dz), ln, wd, th_, rise) in enumerate(CROWN):
        base, nrm = trunk_surface(v, math.radians(deg))
        flow = Vector((0.0, dy, dz)).normalized()
        # 面に沿う成分だけ残す(法線成分を抜く)
        tang = (flow - nrm * flow.dot(nrm))
        tang = tang.normalized() if tang.length_squared > 1e-9 else flow
        d = (tang * (1.0 - rise) + nrm * rise).normalized()
        mid = base + d * (ln * 0.5) + nrm * (ln * 0.10 * rise)
        tip = base + d * ln + nrm * (ln * 0.22 * rise) \
            - Vector((0.0, 0.0, ln * 0.10))
        spine = [(base - d * 0.004, th_ * 1.2, wd * 0.75),
                 (mid, th_, wd), (tip, th_ * 0.3, wd * 0.28)]
        out.append(_blade(f"{NAME}_crown{k}", spine, 1.0, rings=5, seg=8,
                          stripe=int(_jitter(k, 21.0) * STRIPES)))
    return out


# **②胸の「主役の羽根」。** 設定画の胸には、大きな青紫・灰白の羽根が数枚
# はっきり主役として乗っている。手続き生成をいくら散らしてもこれは出ない ――
# 設定画から位置を拾って手で置く。**中央の3枚を主役にする**(正面では胸の
# 中央の水色〜紫の大きな羽根が「顔の次に見る場所」になっている)。
# (正面から見た x, z, 長さ, 幅, 傾き(度), 縞)
HERO = [
    (-0.0103, 0.1119, 0.0315, 0.0162, -7.0, 0),   # 中央の水色(主役)
    (+0.0103, 0.1010, 0.0300, 0.0160, +5.0, 0),   # 中央の水色(主役)
    (-0.0020, 0.0930, 0.0290, 0.0155, +2.0, 1),   # 中央の紫(主役)
    (-0.0297, 0.1176, 0.0235, 0.0124, -14.0, 1),
    (+0.0217, 0.1107, 0.0230, 0.0122, +12.0, 2),
    (+0.0297, 0.0776, 0.0215, 0.0118, +9.0, 3),
    (-0.0215, 0.0860, 0.0240, 0.0126, -6.0, 2),
    (+0.0062, 0.1270, 0.0210, 0.0116, -3.0, 3),
]


def build_hero(co, faces, uvs) -> None:
    """胸の主役の羽根。胴の羽毛と同じ帯だが、長く・広く・明るい縞。"""
    for x, z, ln, wd, deg, st in HERO:
        v = (z - BODY_Z0) / BODY_SPAN
        rx, _ry, _cy = trunk_ring(v)
        th = -math.acos(min(1.0, max(-1.0, x / max(rx, 1e-6))))
        dv = ln / BODY_SPAN
        skew = math.radians(deg)
        _strap(co, faces, uvs,
               lambda t, v=v, th=th, dv=dv, sk=skew: trunk_surface(
                   v - dv * t, th + sk * t, 0.0075 * math.sin(math.pi * t * 0.5)),
               wd, st)


def build_feathers() -> list:
    """胴と頭の羽毛。翼の雨覆は `build_wing_coverts`。

    **胴の面に沿わせて垂らす。** 先端を世界の -Z へ真っ直ぐ落とすと、下の段が
    腹の底より 30mm はみ出し、シルエットが「草のスカート」になる。先端は
    「一段下のリングの面」をサンプルして置き、外へ出すのは反りの分だけにする。

    **段をまっすぐ揃えない。** 水平の段が規則的に並ぶのが「格子」の正体。
    位相も高さも大きさも1枚ごとにずらす。"""
    me = bpy.data.meshes.new(f"{NAME}_feathers")
    co, faces, uvs = [], [], []
    eye = Vector(EYE_C)
    for name, v0, v1, rows, width, drop, curl, gap in TRUNK_LAYERS:
        for row in range(rows):
            v = v0 + (row + 0.5) / rows * (v1 - v0)
            rx, ry, _cy = trunk_ring(v)
            if (rx + ry) * 0.5 < 0.005:
                continue
            cols = max(6, int(round(math.tau * (rx + ry) * 0.5 / width)))
            dv = drop * (v1 - v0) / rows
            for k in range(cols):
                j = _jitter(row + v0 * 31.0, k)
                j2 = _jitter(k * 1.7 + 5.0, row + v0 * 13.0)
                th = (k + 0.5 * (row % 2) + 0.34 * (j2 - 0.5)) * math.tau / cols
                if gap > 0.0:
                    d = abs((math.degrees(th) - 270.0 + 180.0) % 360.0 - 180.0)
                    if d < gap * 0.5:
                        continue
                vv = v + (j - 0.5) * dv * 0.55
                ln, wd = FEATHER_SIZES[int(j2 * 3.0) % 3]
                lift = curl * (0.7 + 0.6 * _jitter(row * 3 + 1, k))
                base, nrm = trunk_surface(vv, th)
                if _wing_covers(base):
                    continue
                # 腹の底より下へ垂らさない。下の段ほど自然に短くなる
                dd = min(dv * ln * (0.85 + 0.30 * j), max(0.004, vv))
                skew = math.radians(FEATHER_SKEW) * (j2 - 0.5) * 2.0
                tip0, _ = trunk_surface(vv - dd, th + skew, lift)
                # **根元だけでなく先も見る。** 目より上の段から垂れた羽が目に
                # 被さり、せっかくトレースした顔が羽の陰に沈んでいた(4-46)
                if min((q - e).length for q in (base, tip0, (base + tip0) * 0.5)
                       for e in (eye, Vector((-eye.x, eye.y, eye.z)))) < EYE_KEEP:
                    continue
                _strap(co, faces, uvs,
                       lambda t, v=vv, th=th, dd=dd, lf=lift, sk=skew:
                           trunk_surface(v - dd * t, th + sk * t,
                                         lf * math.sin(math.pi * t * 0.5)),
                       width * wd * 1.15 * (0.85 + 0.30 * _jitter(k, row)),
                       int(_jitter(row * 5 + 2, k) * STRIPES))
    # 大きな房のあいだを埋める短い羽(房そのものは `build_crown`)
    for k in range(16):
        th = k * math.tau / 16
        v0 = 0.895 + 0.060 * _jitter(k, 11.0)
        base0, nrm0 = trunk_surface(v0, th)
        up = Vector((0.0, 0.62, 1.0)).normalized()
        ln = 0.0110 + 0.0045 * _jitter(k, 12.0)

        def at(t, b=base0, n=nrm0, up=up, ln=ln):
            p = b + (n * 0.30 + up).normalized() * (ln * t) \
                - Vector((0.0, 0.0, 1.0)) * (ln * 0.30 * t * t)
            return p, n
        _strap(co, faces, uvs, at, 0.0055, int(_jitter(k, 6.0) * STRIPES))
    build_hero(co, faces, uvs)
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


# **側面が禿げる。** 3段×5列=片翼15枚では、長さ 100mm の翼面がほとんど裸の
# まま残っていた。段も列も増やし、稜線の端まで覆う。
COVERT_ROWS = 7
COVERT_SPAN = 0.92        # 稜線のどこまで覆うか
COVERT_W = 0.0165         # 翼の雨覆。胸の羽より一回り大きい


def build_wing_coverts() -> list:
    """翼塊の表面を覆う雨覆(小)。中羽・風切羽は `build_wings` が作る。"""
    me = bpy.data.meshes.new(f"{NAME}_coverts")
    co, faces, uvs = [], [], []
    for side in (-1.0, 1.0):
        for row in range(COVERT_ROWS):
            t = (row + 0.5) / COVERT_ROWS * COVERT_SPAN
            _, _, hw, hh = _spine_at(WING_SPINE, t)
            cols = max(5, int(round(math.pi * (hw + hh) * 0.5 / COVERT_W * 2)))
            for k in range(cols):
                j = _jitter(row * 3 + 1, k + side * 7.0)
                # **外側の面(th=0)を中心に置く。** 以前は +0.5π ずらして
                # いたので、帯が翼の前縁と内側に回り、**横から見える面だけが
                # 裸**のまま残っていた(側面が禿げて見えた原因。4-54)。
                th = math.pi * (-0.80 + 1.60 * (k + 0.5 + 0.3 * (j - 0.5)) / cols)
                dt = 1.45 * COVERT_SPAN / COVERT_ROWS

                def at(t, t0=t, th=th, side=side, dt=dt):
                    p, n = _blade_point(WING_SPINE, min(1.0, t0 + dt * t), th, side)
                    return p + n * (0.0030 * math.sin(math.pi * t * 0.5)), n
                _strap(co, faces, uvs, at,
                       COVERT_W * 1.20 * (0.82 + 0.36 * j),
                       int(_jitter(row * 7 + 3, k * side) * STRIPES))
    me.from_pydata(co, [], faces)
    me.update()
    layer = me.uv_layers.new(name="UVMap")
    for i, uv in enumerate(uvs):
        layer.data[i].uv = uv
    obj = bpy.data.objects.new(f"{NAME}_coverts", me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return [obj]


# ================================================================== 塗り
SCALE_ROWS = 20


def _scale_cols(v: float) -> int:
    rx, ry, _cy = trunk_ring(min(1.0, max(0.0, v)))
    w = 0.0190 - 0.0090 * min(1.0, max(0.0, v)) ** 0.8
    return max(6, int(round(math.tau * (rx + ry) * 0.5 / w)))


def _body_paint(p, _n):
    v = (p.z - BODY_Z0) / max(1e-6, BODY_SPAN)
    # **角度はリングの中心から、半径で割って測る。** 前縁を基準にすると体の
    # 正面で偏角がほぼ 0 に潰れ、顔だけ鱗が消えて「のっぺりした面」になった。
    rx, ry, cy = trunk_ring(min(1.0, max(0.0, v)))
    th = math.atan2((p.y - cy) / max(ry, 1e-6), p.x / max(rx, 1e-6))
    row = v * SCALE_ROWS
    ri = math.floor(row)
    fy = row - ri
    cols = _scale_cols((ri + 0.5) / SCALE_ROWS)
    col = th / math.tau * cols + 0.5 * (ri % 2)
    fx = col - math.floor(col)
    face, fa = face_sample(p, rx, ry, cy)
    d = math.hypot((fx - 0.5) * 1.55, (fy - 0.40) * 1.30)
    # 顔と冠羽は地の色より暗い(設定画の頭部は L40 前後)
    dark = 1.0 - 0.45 * min(1.0, max(0.0, (v - 0.62) / 0.22))
    base = tuple(c * dark for c in _srgb("mid"))
    if d > 0.5:
        gap = tuple(c * dark for c in _srgb("dark"))    # 鱗のあいだは谷の黒
        return gap if fa <= 0.0 else tuple(
            a + (b - a) * fa for a, b in zip(gap, face))
    q = p * 26.0
    t = 0.5 + 0.5 * math.sin(q.x + 0.8 * q.z + 1.7 * math.sin(q.y))
    tint = tuple(a + (b - a) * t for a, b in zip(_srgb("blue"), _srgb("violet")))
    sel = _jitter(ri * 7 + 3, math.floor(col))
    if sel > 0.90:
        tint = _srgb("hilite")                 # 稀に強く光る鱗
    elif sel > 0.80:
        tint = _srgb("warm")
    amp = (0.60 + 0.40 * max(0.0, sel - 0.50) / 0.50) * \
        (1.0 - 0.95 * min(1.0, max(0.0, (v - 0.62) / 0.20)))
    k = amp * (1.0 - min(1.0, d / 0.5) ** 4) * (0.40 + 0.60 * (1.0 - fy))
    k *= 0.70 + 0.30 * (0.5 - 0.5 * math.sin(th))
    col_ = tuple(min(1.0, a + (b - a) * min(1.0, k)) for a, b in zip(base, tint))
    # **顔の絵はいちばん上に乗せる。** 鱗の模様の下に敷くと目が濁る
    return col_ if fa <= 0.0 else tuple(
        a + (b - a) * fa for a, b in zip(col_, face))


def _trunk_normals(obj) -> None:
    """法線を胴のリングの楕円へ寄せる(`modeling-pitfalls.md` 4-32)。"""
    normals = []
    for vert in obj.data.vertices:
        v = (vert.co.z - BODY_Z0) / max(1e-6, BODY_SPAN)
        rx, ry, cy = trunk_ring(min(1.0, max(0.0, v)))
        n = Vector((vert.co.x / max(rx, 1e-4) ** 2,
                    (vert.co.y - cy) / max(ry, 1e-4) ** 2, 0.0))
        w = min(1.0, min(v, 1.0 - v) / 0.10)
        normals.append(vert.normal.lerp(n.normalized(), w).normalized()
                       if n.length_squared > 1e-12 else vert.normal.copy())
    obj.data.normals_split_custom_set_from_vertices(normals)


# ============================================================== 組み立て
# 骨は6本。翼は畳んで胴に付いているが、飛び去る動作で開くので独立させる。
JOINTS_HALF = {
    "body": (0.0, 0.010, 0.095),
    "head": (0.0, -0.030, 0.180),
    "tail": (0.0, 0.045, 0.052),
    "wing.L": (0.0215, -0.0120, 0.1455),
    "leg.L": (0.0262, -0.0330, 0.0400),
}
BONES_HALF = [("body", "head"), ("body", "tail"),
              ("body", "wing.L"), ("body", "leg.L")]


def bare_parts() -> tuple:
    """羽毛を除いた「裸のボディ」。Body Anatomy Gate はこれだけを撮る。

    判定条件は **「無地の頭・胴・翼・嘴・脚・尾羽だけを 96px で表示し、設定画を
    見なくてもカラス系の鳥として読める」**。ここが通らないうちは羽毛を1枚も
    足さない ―― 羽毛を増やすほど構造のズレが見えなくなる(4-39)。"""
    return build_trunk(), build_wings(), build_tail(), build_beak(), build_legs()


def build():
    """本番モデル(メッシュ+アーマチュア)を返す。

    **眼球ジオメトリは持たない。** 設定画の側面を見ると目は大きな球として
    突出しておらず、頭の面に描かれている(`face_atlas`)。"""
    trunk, wings, tail, beak, legs = bare_parts()
    leg_objs = legs["L"] + legs["R"]
    feathers = build_feathers() + build_wing_coverts() + build_crown()
    shards = build_shards()

    C.smart_uv(trunk[0])
    # **顔のぶんの解像度を確保する。** 384px を全身で分けると顔に回るのは
    # 40x30 テクセルほどで、せっかくトレースした目が滲んだ染みになる。
    # `C.split_material_region` で顔だけ別テクスチャにする手もあるが、あれは
    # organic_uv でシームを切ってある前提で、smart_uv の島を掴むと島ごと
    # 引きずって**顔が丸ごと消えた**(実測)。ここは素直に解像度を上げる。
    img = C.bake_albedo(trunk[0], _body_paint, size=TRUNK_TEX, name=f"{NAME}_albedo")
    trunk_m = C.make_textured_material(f"{NAME}_trunk", img, roughness=0.8)
    feather_m = C.make_textured_material(f"{NAME}_feather",
                                         feather_texture(), roughness=0.7)
    # **自己発光は使わない。** 暗いモデルを持ち上げるのに便利だが、陰影に
    # 関係なく足されるので暗部から先に潰れる。設定画の明暗差を持つのは
    # BaseColor の仕事。
    beak_m = _mat("beak", 1.00, rough=0.35)
    leg_m = _mat("leg", 1.00, rough=0.45)
    for m in (beak_m, leg_m):
        m["noOutline"] = True
    shard_m = _mat("hilite", 1.0, rough=0.2)
    shard_m["noOutline"] = True

    C.assign_material(trunk[0], trunk_m)
    for o in wings + tail + feathers:
        C.assign_material(o, feather_m)
    for o in beak:
        C.assign_material(o, beak_m)
    for o in leg_objs:
        C.assign_material(o, leg_m)
    for o in shards:
        C.assign_material(o, shard_m)

    _trunk_normals(trunk[0])
    # **翼は薄いレンズなので自動ウェイトが取りこぼす。** 骨へ固定する
    wing_groups = [(("L" if "L" in o.name.rsplit("_", 1)[-1] else "R"),
                    C.mark_for_pin(o)) for o in wings]
    mesh = C.join(trunk + wings + tail + feathers, NAME)
    joints = C.mirrored(JOINTS_HALF)
    bones = C.mirrored_bones(BONES_HALF)
    armature = C.build_armature(NAME, joints, bones, mesh, root="body")
    for tag, grp in wing_groups:
        C.pin_weight_to_bone(mesh, grp, f"body-wing.{tag}")

    beak_o = C.join(beak, f"{NAME}_beak")
    shards_o = C.join(shards, f"{NAME}_shards")
    C.parent_to_bone(beak_o, armature, "body-head")
    C.parent_to_bone(shards_o, armature, "body-tail")
    parts = [beak_o, shards_o]
    # **左右の脚はそれぞれの骨へ。** 1つに結合して片側の骨に付けると、歩行で
    # 右脚が左脚と同じ向きに振れる(ポーズチェックで発覚)
    for tag in ("L", "R"):
        o = C.join(legs[tag], f"{NAME}_leg{tag}")
        C.parent_to_bone(o, armature, f"body-leg.{tag}")
        parts.append(o)
    _check([mesh] + parts)
    return [mesh, armature] + parts, armature


def _check(objs) -> None:
    lo, hi = C.bounds(objs)
    print(f"[{NAME}] 高さ {hi.z - lo.z:.3f}m 幅 {hi.x - lo.x:.3f}m "
          f"奥行き {hi.y - lo.y:.3f}m 三角形 {C.tri_count(objs)}")
    assert lo.z > -0.004, lo.z
