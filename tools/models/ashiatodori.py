"""
あしあとどり ―― 消えていく足跡を追いかける鳥(swarm)。

設定画(plan/models/reference-ashiatodori-sheet.png)の三面図を、全高
0.267m へ正規化した実寸マスクへ起こして測り直した造形。数値の出どころと
判定は plan/models/archive/ashiatodori-remake.md。

構造の要点:

* **骸(頭骨)が最大の記号。** 生成りのドーム + 大きな黒い眼窩2つ +
  長く尖った嘴。96px で読めるのはこの3つだけなので、ここに面を使う。
  作り方は**ホネガラミの頭蓋と同じ**輪切りの表 + 彫り/張り出し
  (handbook 4-109)。**眼窩は設定画からトレースする**
  (tools/ashiatodori_decal.py)。
* **骸は羽に囲まれていて、出ているのは顔だけ。** 項の羽(`HOOD`)が
  ドームの脇を囲う。丸ごと露出させると同じ寸法でも眼窩が小さく見え、
  「兜をかぶった鳥」になる(handbook 4-117)。
* **羽は「芯 + 帯 + 楔」。** 滑らかな芯(卵)は隠れる前提で小さく作り、
  シルエットは羽毛が作る(handbook 3-2「輪郭を作るのは土台ではなく
  毛先」)。方式はスリガラス(handbook 4-106)。
* **霧は半透明で作らない。** 羽の先端を霧の色へ寄せて消す
  (handbook 3-27。あくびとかげの尾・きりみずちの柱下端と同じ翻訳)。
* swarm(3〜4羽同時)なので三角形は `TARGET_TRIS` を上限にする。
"""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

import common as C

NAME = "ashiatodori"
HEIGHT = 0.267              # 設定画の想定身長(既存の基準表と同じ)
CLAY = (0.66, 0.63, 0.60)   # 造形レビュー用の単色

# 実測はすべて mm(全高 267mm)。モデル座標へは /1000 で入れる。
#   x: 右が +    y: 前が −(設定画の側面図は左向き = −y)    z: 上が +
#   y の原点は足の中心(側面図の足 u≈+5mm を 0 に置いた)

# ------------------------------------------------------------------ 骸(頭骨)
# **ホネガラミの頭蓋と同じ方式で作る**(`tools/models/honegarami.py`
# 「頭蓋」節)。ホネガラミの第7版までの失敗がそのままここで再発していた
# ―― 楕円体に眼窩の窪みを1つ足しただけで、96px でも45度でも
# 「つるんとした卵に顔を描いた」形だった(handbook 4-109)。
#
# 方式は3つの部品でできている:
#   1. `SKULL_RINGS`  : 設定画の実測から起こした輪切りの表 (t, rx, ry, cy)。
#      t=0 が頭頂、t=1 が骸の下縁。rx/ry/cy を段ごとに持つので、
#      「上顎が前へ出る」「頬骨で最大幅」が**表そのもの**で出る。
#   2. `SKULL_DENTS` / `SKULL_BUMPS` : 方位角と t の楕円窓で押し込む/
#      押し出す。`DENT_SHARP < 1` で底が平らになり壁が立つ。
#   3. `_skull_uv()` : 表面の点を (方位角, t) へ戻す。**彫りと塗りを
#      同じ座標で扱う**ので、ホネガラミが避けた「塗りの穴と彫りの穴が
#      45度でずれる」が原理的に起きない(handbook 4-110)。
#
# 鳥の骸なので、ホネガラミの6項目はこう読み替える:
#   広い額     → 丸く広い脳函(SKULL_RINGS + 額の膨らみ)
#   張った頬骨 → 眼窩の下の張り出し(t=0.767 の最大幅 + 眼窩下縁)
#   深い眼窩   → **彫る**。この鳥の記号そのものなので浅くしない
#   骨格的鼻腔 → 眼窩の間の細い鼻梁と、その脇の鼻腔の溝
#   前へ出る上顎 → cy が下段へ向かって前へ流れる + 嘴
#   歯列       → 鳥なので無い。代わりに側頭窩で「骨」の凹凸を作る
#
# 実測(scratchpad at_bone.py / head_front.png / head_side.png、mmグリッド):
#   正面: 骸は z=258(頭頂)〜170(下縁)、最大幅 z=190 で 101mm。
#         眼窩の中心 x=±27.5 / z=199、径 27x28mm。眼窩の光は上の外側。
#   側面: 前縁 z=246 で y=-0.111 → z=190 で y=-0.150(**下へ向かって
#         前へ流れる**)。後縁は羽に隠れるので -0.064〜-0.096 を採った。
#   側面図の頭は正面図より **9mm 低く描かれている**(眼窩の中心 z が
#   188 と 199、頭頂が 248 と 258)。側面の数値は +9 して使った(4-98)
SKULL_C = Vector((0.000, -0.106, 0.196))     # x,y の基準と、眼の高さ
SKULL_TOP = 0.259                            # t=0 の高さ
SKULL_H = 0.087                              # t=1 までの落差(下縁 z=172)
SKULL_N = 40     # 眼窩を**彫る**ので方位角の解像度が要る。眼窩の角半幅
                 # 16度は 9度刻みで4分割 ―― これ以下だと穴が三角になる
SKULL_UV_R = 0.058                           # organic_uv で切り出す球の半径
# (t, rx, ry, cy)  cy は SKULL_C.y からの前後のずれ
SKULL_RINGS = [
    (0.0000, 0.0030, 0.0025, +0.0020),
    (0.0460, 0.0140, 0.0105, +0.0022),   # 頭頂の丸み。ここを飛ばすと円錐
    (0.1034, 0.0250, 0.0175, +0.0026),
    (0.1609, 0.0300, 0.0215, +0.0022),
    (0.2184, 0.0325, 0.0250, +0.0012),
    (0.2759, 0.0345, 0.0280, +0.0000),
    (0.3333, 0.0365, 0.0300, -0.0012),
    (0.3908, 0.0400, 0.0322, -0.0020),
    (0.4483, 0.0425, 0.0345, -0.0027),
    (0.5057, 0.0440, 0.0360, -0.0034),   # 奥行きの最大。後頭はここまで
    (0.5632, 0.0442, 0.0358, -0.0042),
    (0.6207, 0.0444, 0.0350, -0.0050),
    (0.6782, 0.0445, 0.0351, -0.0056),   # 眼窩の帯。段を細かく取る
    (0.7356, 0.0450, 0.0352, -0.0060),
    (0.7931, 0.0457, 0.0345, -0.0066),   # 頬骨。ここが最大幅(91mm)
    (0.8506, 0.0440, 0.0318, -0.0080),
    (0.9080, 0.0405, 0.0280, -0.0106),
    (0.9655, 0.0330, 0.0235, -0.0128),
    (1.0000, 0.0250, 0.0195, -0.0136),   # 頬の下端。下縁は方位角ごとに持ち上げる
]
# 眼窩の (方位角deg, t)。0 が +X、-90 が前。`tools/ashiatodori_decal.py` が
# 設定画からトレースして出した値を書き写す(x=±25.4 / z=196、径 23x30mm)
SOCKET_T = 0.7241
SOCKET_AZ = 55.8
SOCKET_HW = 15.9
SOCKET_HT = 0.175
# 眼球。**設定画の顔の魅力は骸そのものより「巨大な真っ黒な眼」**で、
# 眼窩を彫っただけの版は「アンデッドの骸骨鳥」へ寄っていた。眼窩の
# 7〜8割を占める黒い球を入れて「不気味だが妙に可愛い」を取り戻す
# (handbook 4-122)。眼窩 23x30mm に対し径 22.4mm
EYE_R = 0.0125
EYE_SINK = 0.11          # 表面から内側へ入れる比率。浅くして球を見せる
# 落ち込み(方位角deg, t, 角度半幅deg, t半幅, 押し込み比)
SKULL_DENTS = [
    # 深さは 0.36 -> 0.20。**黒は球が担うので、彫りは眼窩の縁を作るだけ**。
    # 深く彫ったまま球を入れると、球が穴の奥に沈んで「角ばった黒い溝」に
    # なり、設定画の「大きな丸い黒目」から遠ざかる(handbook 4-122)
    (-SOCKET_AZ, SOCKET_T, SOCKET_HW, SOCKET_HT, 0.20),          # 右の眼窩
    (-(180.0 - SOCKET_AZ), SOCKET_T, SOCKET_HW, SOCKET_HT, 0.20),  # 左の眼窩
    (-22.0, 0.612, 19.0, 0.092, 0.075),    # 右の側頭窩(眼窩の後ろ)
    (-158.0, 0.612, 19.0, 0.092, 0.075),   # 左の側頭窩
    (-76.0, 0.816, 8.5, 0.048, 0.120),     # 右の鼻腔(鼻梁の脇の溝)
    (-104.0, 0.816, 8.5, 0.048, 0.120),    # 左の鼻腔
]
# 塗りで黒く落とすのは**眼窩だけ**
SKULL_HOLES = SKULL_DENTS[:2]
DENT_SHARP = 0.45
# 張り出し(方位角deg, t, 角度半幅, t半幅, 押し出し比)
SKULL_BUMPS = [
    (-90.0, 0.306, 44.0, 0.100, 0.035),    # 額。正面から見て広く平ら
    (-SOCKET_AZ, 0.477, 22.0, 0.048, 0.090),           # 右の眉庇
    (-(180.0 - SOCKET_AZ), 0.477, 22.0, 0.048, 0.090),  # 左の眉庇
    (-90.0, 0.725, 13.0, 0.100, 0.070),    # 鼻梁(眼窩のあいだの細い稜)
    (-SOCKET_AZ, 0.906, 22.0, 0.045, 0.040),           # 右の眼窩下縁
    (-(180.0 - SOCKET_AZ), 0.906, 22.0, 0.045, 0.040),  # 左の眼窩下縁
    # **後頭は膨らませない。** 設定画の骸は奥行き 75mm で、正面の幅
    # 88mm より小さい。後頭を +5% 押し出していた版は奥行き 94mm になり、
    # 側面で「鳥に人間サイズの頭蓋骨を被せた」形だった(handbook 4-123)
    (0.0, 0.634, 26.0, 0.110, 0.022),      # 右の側頭の角
    (180.0, 0.634, 26.0, 0.110, 0.022),    # 左の側頭の角
]
# 頭頂と後頭の境の稜線(側面のシルエットに角を作る)。塗りには出さない
SKULL_DENTS_EXTRA = [(90.0, 0.138, 36.0, 0.055, 0.025)]
# 骸の下縁の形。真ん中(嘴が出るところ)で高く、頬で低い
RIM_LIFT = 0.140      # 真正面で持ち上げる t(= 12.2mm)
RIM_FROM = 0.780
RIM_CHIP = 0.020      # 欠けの振幅(t)
# 嘴。**設定画の嘴はほぼ真下へ垂れて、先が鉤状に曲がる。**
# 側面の実測では根元から先まで**前へ 26mm・下へ 66mm**しか進まない。
# 前へ 52mm 出していた版は、側面から見て「骸に刺さった円錐」だった
# (handbook 4-124)。正面の実測は最大半幅 13.2mm(z=160)
# (y, z, 半幅, 半厚)。根元は骸の中に埋める
BEAK_SPINE = [
    (-0.1320, 0.1810, 0.0125, 0.0120),
    (-0.1420, 0.1655, 0.0134, 0.0125),
    (-0.1500, 0.1490, 0.0112, 0.0104),
    (-0.1556, 0.1320, 0.0068, 0.0064),
    (-0.1578, 0.1215, 0.0030, 0.0030),
    (-0.1566, 0.1140, 0.0010, 0.0011),   # 先は**わずかに引き戻す**= 鉤
]
BEAK_ROOT = Vector((0.0, BEAK_SPINE[0][0], BEAK_SPINE[0][1]))
BEAK_TIP = Vector((0.0, BEAK_SPINE[-1][0], BEAK_SPINE[-1][1]))
BEAK_SEG = 10

# ------------------------------------------------------------------ 胴の芯
# **縦軸の輪切りで作る。** 羽毛は「上から下へ垂れて重なる」ので、芯も
# 高さ v でパラメタ化しておかないと羽が体の面に沿わない。前後(y)の
# ロフトで作った初版は、羽の法線がすべて放射方向(x-z)になり、正面から
# 見ると胸の羽が**全部 edge-on** で「裸の卵」に見えた。スリガラスの
# `trunk_ring` / `trunk_surface` と同じ形にする。
# **塊の下端は z=75。** 設定画の正面図で幅が最大(194mm・z=91)の
# 6割を切るのは z=75 で、そこから下は脚しかない。芯を z=50 から始めて
# いた版は塊が z=51 まで垂れ、細い脚で大きな羽の塊を支える設定画の
# アンバランスさが消えて「地面まで届く毬」になっていた(handbook 4-128)
BODY_Z0 = 0.072
BODY_SPAN = 0.124
# (v, 半幅x, 前縁y, 後縁y)。**球ではなく涙滴。** 胸をいちばん前へ出すのは
# z=124(v=0.42)で、そこから下は腹が急に絞れる ―― 設定画の側面図で
# 前縁が z=124 の 161mm から z=116 の 84mm へ落ちるのがそれ
BODY_RINGS = [
    (0.00, 0.0230, -0.0300, 0.0250),
    (0.10, 0.0400, -0.0520, 0.0450),
    (0.20, 0.0530, -0.0700, 0.0640),
    (0.32, 0.0615, -0.0820, 0.0790),
    (0.42, 0.0650, -0.0880, 0.0860),   # 胸がいちばん前へ出る
    (0.52, 0.0667, -0.0870, 0.0880),
    (0.62, 0.0655, -0.0830, 0.0870),
    (0.72, 0.0600, -0.0790, 0.0810),
    (0.82, 0.0555, -0.0730, 0.0700),
    (0.90, 0.0470, -0.0640, 0.0590),
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


def _ring_at(t: float):
    """SKULL_RINGS を線形に引く (rx, ry, cy)。

    折れ点が面の折り目に出るのを承知で**線形**にする ―― 表の段が 19 あり、
    Catmull-Rom だと頭頂(rx が 3.5 → 19.5mm と跳ねる)で行き過ぎて
    庇のような段差が出る。
    """
    t = min(SKULL_RINGS[-1][0], max(SKULL_RINGS[0][0], t))
    for a, b in zip(SKULL_RINGS, SKULL_RINGS[1:]):
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / max(b[0] - a[0], 1e-9)
            return (a[1] + (b[1] - a[1]) * f,
                    a[2] + (b[2] - a[2]) * f,
                    a[3] + (b[3] - a[3]) * f)
    return SKULL_RINGS[-1][1:]


def _skull_k(deg: float, t: float) -> float:
    """(方位角deg, t) の押し込み/押し出し比。彫りと塗りで共用する。

    **押し出しを先に、彫りを後に足す。** 帯が重なったところで
    `max(k, 押し出し)` を後に取ると、眉庇と眼窩下縁が眼窩の上下を
    埋めて、眼窩が「閉じた目の線」になる(この鳥で実際にそうなった。
    handbook 4-111)。骨は「窪みが勝つ」順で彫る。
    """
    out_k = 0.0
    for da, dt, hw, ht, out in SKULL_BUMPS:
        d1 = abs((deg - da + 180.0) % 360.0 - 180.0) / hw
        d2 = abs(t - dt) / ht
        if d1 < 1.0 and d2 < 1.0:
            out_k = max(out_k, (1 - d1 * d1) * (1 - d2 * d2) * out)
    dent_k = 0.0
    for da, dt, hw, ht, depth in SKULL_DENTS + SKULL_DENTS_EXTRA:
        d1 = abs((deg - da + 180.0) % 360.0 - 180.0) / hw
        d2 = abs(t - dt) / ht
        if d1 < 1.0 and d2 < 1.0:
            dent_k = min(dent_k,
                         -((1 - d1 * d1) * (1 - d2 * d2)) ** DENT_SHARP * depth)
    return dent_k if dent_k else out_k


def _skull_point(deg: float, t: float, k: float = 1.0) -> Vector:
    """骸の**素の**表面(彫る前)の点。k で内外へずらす。"""
    rx, ry, cy = _ring_at(t)
    a = math.radians(deg)
    return Vector((SKULL_C.x + rx * math.cos(a) * k,
                   SKULL_C.y + cy + ry * math.sin(a) * k,
                   SKULL_TOP - t * SKULL_H))


def _skull_uv(p: Vector):
    """骸の表面の点 -> (方位角deg, t)。

    x/y を段の半径で割ってから atan2 を取るので、段を作るときの媒介変数
    そのものが戻る。**塗りをこの座標で書くと彫りと必ず一致する** ――
    ホネガラミが「塗りの穴と彫りの穴が45度でずれる」ので眼窩を彫るのを
    諦めた問題は、座標を共有すれば起きない(handbook 4-110)。
    """
    t = (SKULL_TOP - p.z) / SKULL_H
    rx, ry, cy = _ring_at(t)
    return (math.degrees(math.atan2((p.y - SKULL_C.y - cy) / max(ry, 1e-6),
                                    (p.x - SKULL_C.x) / max(rx, 1e-6))), t)


def _on_skull(p: Vector) -> bool:
    """この点は骸の面か(それとも嘴か)。

    骸と嘴は同じマテリアルに焼くので、`bone_color` はどちらの面かを
    位置から決めないといけない。旧版は `p.y > 付け根.y` `p.z > 付け根.z`
    の粗い条件で、**眼窩の下半分が嘴として塗られていた** ―― 黒い穴の
    下半分が嘴の茶色になり、眼窩が「灰色のつやのある大きな目」に
    見えていた原因(handbook 4-113)。
    彫りは (rx, ry) を一律に (1+k) 倍するので、x/rx と y/ry の長さを
    測れば「面の上か」が判る。
    """
    t = (SKULL_TOP - p.z) / SKULL_H
    if not -0.02 <= t <= 1.02:
        return False
    tc = min(1.0, max(0.0, t))
    rx, ry, cy = _ring_at(tc)
    ux = (p.x - SKULL_C.x) / rx
    uy = (p.y - SKULL_C.y - cy) / ry
    want = 1.0 + _skull_k(math.degrees(math.atan2(uy, ux)), tc)
    return abs(math.hypot(ux, uy) - want) < 0.12


def build_skull() -> bpy.types.Object:
    """骸。眼窩・側頭窩・鼻腔を**彫り**、額・眉庇・鼻梁・頬骨・後頭を
    **押し出す**(ホネガラミの `_sculpt_skull` と同じ)。"""
    sections = []
    for t0, _rx, _ry, _cy in SKULL_RINGS:
        sec = []
        for i in range(SKULL_N):
            a = math.tau * i / SKULL_N
            deg = math.degrees(a)
            deg = deg if deg <= 180.0 else deg - 360.0
            t = t0
            if t0 > RIM_FROM:
                s = ((t0 - RIM_FROM) / (1.0 - RIM_FROM)) ** 1.4
                front = max(0.0, -math.sin(math.radians(deg))) ** 2
                t -= s * (RIM_LIFT * front
                          + RIM_CHIP * (_jitter(i * 2.3, 7.0) - 0.5) * 2.0)
            rx, ry, cy = _ring_at(t)
            k = 1.0 + _skull_k(deg, t)
            sec.append((SKULL_C.x + rx * math.cos(a) * k,
                        SKULL_C.y + cy + ry * math.sin(a) * k,
                        SKULL_TOP - t * SKULL_H))
        sections.append(sec)
    return C.section_loft(f"{NAME}_skull", sections, smooth=True,
                          cap_top=True, cap_bottom=True)


def build_beak() -> bpy.types.Object:
    """嘴。**ほぼ真下へ垂れて、先が鉤状に曲がる。** 直線の円錐で作ると
    側面から見て「骸に刺さった棒」になる(handbook 4-124)。"""
    spine = [Vector((0.0, y, z)) for y, z, _w, _t in BEAK_SPINE]
    width = [w for _y, _z, w, _t in BEAK_SPINE]
    thick = [t for _y, _z, _w, t in BEAK_SPINE]
    return C.hair_clump(f"{NAME}_beak", spine, width, thick, segments=BEAK_SEG)


def _eye_center(side: float) -> Vector:
    """眼球の中心。眼窩の彫りと同じ (方位角, t) から出す。"""
    az = -SOCKET_AZ if side > 0 else -(180.0 - SOCKET_AZ)
    return _skull_point(az, SOCKET_T, 1.0 - EYE_SINK)


def build_eyes() -> list[bpy.types.Object]:
    """眼球。**設定画の顔の魅力はここ。** 眼窩を彫っただけでは
    「アンデッドの骸骨鳥」に寄り、設定画の「不気味だが妙に可愛い」が
    消える(handbook 4-122)。眼窩の 7〜8割を占める黒い球を入れる。"""
    return [C.uv_sphere(f"{NAME}_eye{s:+.0f}", _eye_center(s), EYE_R,
                        segments=12, rings=8)
            for s in (-1.0, 1.0)]


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
# 翼の下端は**塊の下端(z=75)より上**で終わらせる。稜線の先を z=84 に
# 置いていた版は、翼弦(半 30mm)が z=55 まで垂れて塊の下端を作っていた
WING_SPINE = [
    (Vector((0.028, -0.020, 0.178)), 0.0140, 0.0340),
    (Vector((0.052, -0.012, 0.156)), 0.0132, 0.0400),
    (Vector((0.076, 0.000, 0.130)), 0.0110, 0.0380),
    (Vector((0.090, 0.014, 0.100)), 0.0070, 0.0280),
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
    """骸(+嘴)の中か。骨は羽で覆わない ―― 最大の記号を隠さない。"""
    t = (SKULL_TOP - p.z) / SKULL_H
    if -0.05 <= t <= 1.05:
        rx, ry, cy = _ring_at(t)
        d = p - SKULL_C
        if ((d.x / (rx * k)) ** 2 + ((d.y - cy) / (ry * k)) ** 2) < 1.0:
            return True
    axis = BEAK_TIP - BEAK_ROOT
    t = min(1.0, max(0.0, (p - BEAK_ROOT).dot(axis) / axis.length_squared))
    return (p - (BEAK_ROOT + axis * t)).length < BEAK_SPINE[1][2] * 1.7


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
    (0.985, 20.0, 0.0520, 0.0200, 0.90, 2),
    (0.955, 32.0, 0.0470, 0.0190, 0.80, 3),
    (0.930, 12.0, 0.0600, 0.0215, 0.86, 1),
    (0.930, 28.0, 0.0560, 0.0205, 0.78, 3),
    (0.880, 24.0, 0.0566, 0.0205, 0.68, 0),
    (0.880, 38.0, 0.0480, 0.0195, 0.60, 2),
    (0.830, 30.0, 0.0460, 0.0190, 0.52, 1),
]
# 項の羽(頭巾)。**骸を囲って「顔だけが出ている」状態を作る。**
# ホネガラミの頭蓋と同じ考え方 ―― 設定画の骸は塊の中に埋まっていて、
# 出ているのは顔だけである。骸のドームを丸ごと露出させると、同じ寸法でも
# 眼窩が小さく見え、「兜をかぶった鳥」になる(handbook 4-117)。
#
# 実測(Anatomy Gate の帯ごとの半幅 mm、正面図):
#   z     258  250  242  234  226  218
#   設定画  36   40   44   46   49   52
#   骸の骨 8.5   26   38   42   45   47
# 差(7〜27mm)がぜんぶ項の羽。**帯(strap)で作る** ―― 帯の幅は必ず
# 水平なので、正面のシルエットに幅がそのまま出る。楔だと稜線×X の
# 翼弦が y-z 面に入り、正面からは厚みしか見えない(1枚 6 三角形で済む
# のも効く)。
# (根元の方位角deg, 根元t, 先(x, y, z), 幅, 縞)。方位角は **x>=0 の側だけ
# 書いて鏡にする**(handbook 4-108)。-90 が顔なので -25 より前には置かない
# **いちばん高いのは羽の先で、骸ではない。** 設定画の全高 267mm の
# てっぺんは項の羽の先で、骸の頭頂は 258mm しかない。骸を最高点に
# したままだと、全高で正規化したときに骸だけが 3% 大きく・9mm 高く
# 出る(handbook 4-118)。
# ただし**その先は頭頂ではなく骸の脇に置く** ―― 正面図の房は x=±25〜50
# にあり、背面図では骸のドームが最高点(z=266.8)で羽は出ていない。
# 頭頂の真後ろから立てた版は、背面が「棘の冠」になった ―― 背面から見て
# **骸のドームの上に帯がかかる**からで、帯の x は各高さの rx より外へ
# 出しておく必要がある(handbook 4-119)
HOOD = [
    # 上の層。頭頂から側頭へ、骸の縁に沿って下りる
    (-22.0, 0.60, (0.0517, -0.0950, 0.2215), 0.0154, 3),
    (-13.0, 0.56, (0.0507, -0.0900, 0.2270), 0.0156, 1),
    (-4.0, 0.52, (0.0490, -0.0850, 0.2325), 0.0158, 0),
    (6.0, 0.48, (0.0467, -0.0780, 0.2380), 0.0156, 2),
    (16.0, 0.44, (0.0437, -0.0710, 0.2440), 0.0154, 2),
    (23.0, 0.42, (0.0412, -0.0670, 0.2495), 0.0150, 0),
    (30.0, 0.41, (0.0367, -0.0630, 0.2560), 0.0148, 1),
    (40.0, 0.38, (0.0230, -0.0570, 0.2690), 0.0142, 3),   # 全高の頂点
    (52.0, 0.36, (0.0292, -0.0500, 0.2600), 0.0142, 0),
    # 下の層。ひとつ外へずらして重なりを作る
    (-26.0, 0.74, (0.0475, -0.1000, 0.2035), 0.0160, 1),
    (-17.0, 0.70, (0.0480, -0.0950, 0.2090), 0.0162, 2),
    (-8.0, 0.66, (0.0478, -0.0900, 0.2145), 0.0162, 3),
    (3.0, 0.62, (0.0480, -0.0840, 0.2230), 0.0162, 0),
    (14.0, 0.58, (0.0440, -0.0770, 0.2295), 0.0160, 0),
    (27.0, 0.55, (0.0410, -0.0690, 0.2355), 0.0156, 2),
    (40.0, 0.52, (0.0380, -0.0610, 0.2410), 0.0152, 2),
    (50.0, 0.50, (0.0345, -0.0550, 0.2450), 0.0148, 3),
    (60.0, 0.48, (0.0310, -0.0490, 0.2480), 0.0146, 1),
]
# 襟。頭骨の付け根を囲って「首」を消す。(v, 方位角(度。0=前), 長さ, 幅, 起き上がり)
RUFF = ([(0.95, a, 0.048, 0.0185, 0.46) for a in (-52, -26, 0, 26, 52)]
        + [(0.84, a, 0.054, 0.0195, 0.38) for a in (-78, -50, -22, 22, 50, 78)])
# 尾羽。後ろへ長く流れて霧へ溶ける ―― 設定画の側面で輪郭を切っているのは
# これ。(横位置の指数, 先端, 半翼弦, 半厚, 縞)
# 側面図の最後端は z=114 で y=+0.1075。尾の先を y=+0.122 / z=0.120 に
# 置いていた版は、**同じ高さで 26mm 後ろへ余っていた**(z=122 で
# モデル +119 対 設定画 +93)。設定画の側面は前傾姿勢なので胴の後ろは
# 比べにくいが、尾の最後端そのものは高さごとに比べられる(handbook 4-104)
TAIL_BLADES = [
    (-3, Vector((-0.042, 0.086, 0.086)), 0.0150, 0.0026, 1),
    (-2, Vector((-0.028, 0.097, 0.097)), 0.0168, 0.0028, 0),
    (-1, Vector((-0.012, 0.104, 0.107)), 0.0180, 0.0030, 1),
    (0, Vector((0.000, 0.107, 0.112)), 0.0185, 0.0030, 0),
    (1, Vector((0.012, 0.104, 0.107)), 0.0180, 0.0030, 1),
    (2, Vector((0.028, 0.097, 0.097)), 0.0168, 0.0028, 0),
    (3, Vector((0.042, 0.086, 0.086)), 0.0150, 0.0026, 1),
]
# 中羽(median coverts)。翼面の上に数えられる大きさで4枚だけ置く(4-53)
MEDIANS = [
    (0.26, Vector((0.070, 0.026, 0.140)), 0.0180, 0.0032),
    (0.44, Vector((0.082, 0.042, 0.126)), 0.0175, 0.0031),
    (0.62, Vector((0.088, 0.058, 0.112)), 0.0165, 0.0029),
    (0.80, Vector((0.086, 0.072, 0.096)), 0.0150, 0.0027),
]
# 風切羽。翼の後縁から後下方へ伸びる長い羽。正面図の最大幅 ±100mm を作る
# **塊は z=80 で終わるが、そこから下へ細い羽先が数本だけ垂れる。**
# 設定画の正面図は z=88 で 195mm・z=80 で 145mm・z=72 で 91mm ―― 急に
# 細るが、脚の脇には z=50 あたりまで細い羽先が残っている。太い翼弦の
# まま垂らすと「地面まで届く毬」、全部切ると「棒の脚」になる(4-128)
PRIMARIES = [
    (0.34, Vector((0.090, 0.046, 0.100)), 0.0140, 0.0024),
    (0.50, Vector((0.092, 0.062, 0.088)), 0.0135, 0.0024),
    (0.66, Vector((0.086, 0.078, 0.080)), 0.0125, 0.0022),
    (0.80, Vector((0.064, 0.092, 0.068)), 0.0110, 0.0020),
    (0.92, Vector((0.048, 0.102, 0.060)), 0.0095, 0.0018),
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
                # **胸腹は羽1枚を認識させない。** 設定画の胸はふわっと
                # した毛の塊で、背中の中型羽根とは別物。同じ板を全身に
                # 貼ると「羽根の板を大量に貼った」印象になる(4-129)。
                # 前(th≈0)かつ下(v<0.62)ほど、細く・短く・寝かせる
                soft = max(0.0, math.cos(th)) * max(0.0, 1.0 - vv / 0.62)
                wd *= 1.0 - 0.44 * soft
                ln *= 1.0 - 0.28 * soft
                lift *= 1.0 - 0.78 * soft
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
    # ---- 項の羽(頭巾)。骸の面から立ち上がって頭頂と側頭を囲う
    for hi, (az, t0, tip, wd, stripe) in enumerate(HOOD):
        root = _skull_point(az, t0, 1.02)
        tipv = Vector(tip)
        rx, ry, _cy = _ring_at(t0)
        a = math.radians(az)
        nrm = Vector((math.cos(a) / rx, math.sin(a) / ry, 0.0)).normalized()
        # 中ほどは骸の面から少しだけ浮かせる ―― 直線で結ぶと骸へめり込む
        mid = (root + tipv) * 0.5 + nrm * 0.0060
        for side in ((1.0,) if abs(root.x) + abs(tipv.x) < 1e-4 else (-1.0, 1.0)):
            def at(u, r=root, m=mid, e=tipv, n=nrm, sd=side):
                q = (r * ((1 - u) ** 2) + m * (2 * (1 - u) * u) + e * (u * u))
                return Vector((q.x * sd, q.y, q.z)), Vector((n.x * sd, n.y, n.z))
            _strap(co, faces, uvs, at, wd, stripe)
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


# 項の大羽(蓑)。**側面のかさはここが担う。** 帯(strap)は 90° で
# 消えるので(handbook 4-54)、`HOOD` の帯だけでは側面で「細い棘」が
# 数本立っているようにしか見えなかった。設定画の側面図を拡大すると、
# 骸の後ろにあるのは翼ではなく**大きく尖った項の羽が重なった蓑**で、
# 骸の縁から上後方へ跳ね上がっている。楔(`_blade`)で作る ―― 翼弦が
# y-z 面に入るので側面に広く出て、正面には厚みしか出ない。
#
# 側面図の実測(全高 267mm 換算、y は前が −。骸の後縁は -0.066):
#   z=258 → y -0.050..-0.021   z=250 → -0.081..-0.035
#   z=242 → -0.094..-0.029     z=234 → -0.118..+0.002
#   z=226 → -0.139..+0.047     z=210 → -0.143..+0.019
#
# **x は骸の半径に張り付ける。** 中央(x≈0)に置くと背面から見て骸の
# ドームの真ん中に縦の帯がかかる(handbook 4-119)。左右へ寄せて、
# 正面の半幅が設定画(z=250 で 40 / 242 で 44 / 230 で 48)を超えない
# ところまで。背面では骸の縁に 7〜11mm 重なる ―― 正面図の骸を採った
# ぶんのコストで、設定画の背面図は骸をひとまわり大きく描いている
# (106.9x85.2 / 上端 266.8 対 98.1x102.4 / 258.3)
NAPE = [
    # (根元(x,y,z), 先(x,y,z), 半厚(x), 半翼弦, 縞)
    ((0.0420, -0.0720, 0.1900), (0.0425, -0.0180, 0.2160), 0.0060, 0.0245, 1),
    ((0.0400, -0.0810, 0.2020), (0.0380, -0.0240, 0.2320), 0.0058, 0.0235, 3),
    ((0.0360, -0.0890, 0.2140), (0.0325, -0.0300, 0.2450), 0.0055, 0.0220, 0),
    ((0.0300, -0.0960, 0.2260), (0.0265, -0.0370, 0.2545), 0.0050, 0.0200, 2),
]


def build_nape() -> list[bpy.types.Object]:
    """項の蓑。骸の後縁から上後方へ跳ね上がる大きな羽。"""
    out = []
    for k, (b, t, hw, hh, stripe) in enumerate(NAPE):
        base, tip = Vector(b), Vector(t)
        d = tip - base
        n = d.normalized()
        # 途中で少し反らせる。直線だと「板」に見える(handbook 4-52)
        mid = base + d * 0.52 + Vector((0.0, 0.0055, 0.0035))
        spine = [(base - n * 0.006, hw * 0.34, hh * 0.46),
                 (mid, hw, hh), (tip, hw * 0.10, hh * 0.26)]
        for side in (-1.0, 1.0):
            out.append(_blade(f"{NAME}_nape{k}{side:+.0f}", spine, side,
                              rings=5, seg=8, stripe=stripe))
    return out


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
# **設定画より太く長くする。** 細い脚が大きな羽の塊を支えるアンバランスが
# このキャラの可愛さだが、設定画どおりの細さだと 96px で足先が消える。
# 忠実度より視認性を採る場所(handbook 4-130)
# 太く長くしすぎると、平たい**水かき**に見える(指どうしがくっつく)。
# 96px で「3本の指 + 後ろ指」と読ませたいので、長さより**間隔と先細り**
# を効かせる ―― 指を細く、開きを詰め、先を鉤で締める
TOE_LEN = 0.041
TOE_SPREAD = (-36.0, 0.0, 36.0, 176.0)
TOE_R = (0.0050, 0.0038, 0.0026, 0.0009)


def build_legs() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        pts = [Vector((LEG_TOP.x * side, LEG_TOP.y, LEG_TOP.z)),
               Vector((LEG_KNEE.x * side, LEG_KNEE.y, LEG_KNEE.z)),
               Vector((LEG_ANKLE.x * side, LEG_ANKLE.y, LEG_ANKLE.z)),
               Vector((LEG_ANKLE.x * side, LEG_ANKLE.y - 0.002, 0.007))]
        out.append(C.curve_tube(f"{NAME}_leg{side:+.0f}", pts,
                                [0.0092, 0.0068, 0.0058, 0.0054]))
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
                                    list(TOE_R),
                                    [r * 0.86 for r in TOE_R], segments=6))
    return out


# ------------------------------------------------------------------ 組み立て
def build_blockout() -> dict:
    parts = {"skull": build_skull(), "beak": build_beak(), "core": build_core(),
             "eyes": build_eyes(),
             "wings": (build_wings() + build_crest() + build_nape()
                       + build_tail_blades()),
             "feathers": build_feathers(), "legs": build_legs()}
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for o in blockout_objects(parts):
        C.assign_material(o, clay)
    return parts


def blockout_objects(parts: dict) -> list:
    return ([parts["skull"], parts["beak"], parts["core"]] + parts["eyes"]
            + parts["wings"] + parts["feathers"] + parts["legs"])


def bare_objects(parts: dict) -> list:
    """羽毛を全部外した「裸の解剖」。ここが 96px で鳥に読めないうちは
    羽毛を1枚も足さない(スリガラスの Body Anatomy Gate)。"""
    return ([parts["skull"], parts["beak"], parts["core"]] + parts["eyes"]
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
BONE_TEX = 1024
TARGET_TRIS = 9000

# 眼窩は**設定画からトレースする**(tools/ashiatodori_decal.py)。
# 縁の形も中の階調も上の外側の光も、想像で描くと似ない
# (ガルドの face.svg の教訓 ―― 指標は合うのに顔が似ない)。
# デカールは骸の媒介変数 (方位角, t) の空間に入っているので、
# `_skull_uv()` でそのまま引ける。R=暗さ G=光 A=被覆
import os as _os

DECAL_DIR = _os.path.join(
    _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
    "design", "characters", "ashiatodori", "generated")
_decal_cache: dict = {}


def _skull_decal(deg: float, t: float):
    """骸のデカールを双一次補間で引く -> (暗さ, 光, 被覆)。"""
    if "skull" not in _decal_cache:
        import json
        import numpy as np
        meta = json.load(open(_os.path.join(DECAL_DIR,
                                            "ashiatodori-skull-decal.json")))
        img = bpy.data.images.load(_os.path.join(DECAL_DIR,
                                                 "ashiatodori-skull-decal.png"))
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        _decal_cache["skull"] = (px.reshape(h, w, 4)[::-1], meta)
    dec, meta = _decal_cache["skull"]
    h, w = dec.shape[:2]
    a0, a1 = meta["az"]
    t0, t1 = meta["t"]
    fx = (deg - a0) / (a1 - a0) * w - 0.5
    fy = (t - t0) / (t1 - t0) * h - 0.5
    x0, y0 = math.floor(fx), math.floor(fy)
    if x0 < 0 or y0 < 0 or x0 + 1 >= w or y0 + 1 >= h:
        return (0.0, 0.0, 0.0)
    tx, ty = fx - x0, fy - y0
    q = (dec[y0, x0] * (1 - tx) + dec[y0, x0 + 1] * tx) * (1 - ty) \
        + (dec[y0 + 1, x0] * (1 - tx) + dec[y0 + 1, x0 + 1] * tx) * ty
    return (float(q[0]), float(q[1]), float(q[3]))

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
    """骸と嘴の Base Color。眼窩は黒く塗り、外へ**単調に**明るくする
    (明るいリングを挟むと眼鏡になる ―― handbook 4-85)。

    眼窩・鼻腔・側頭窩は `_skull_uv()` の (方位角, t) で描く。彫りと
    同じ窓を使うので、45度から見ても塗りと穴がずれない(handbook 4-110)。
    """
    if _on_skull(p):
        # 骸。上が明るく、下(顎)が暗い。**落差は控えめに** ―― 強く
        # 落とすと顔の下半分が一枚の茶色い帯になり「鼻づら」に見えた
        up = max(0.0, min(1.0, (p.z - (SKULL_TOP - SKULL_H)) / SKULL_H))
        base = _mix(BONE_SHADE, BONE, 0.46 + 0.54 * up)
        base = _mix(base, BONE_SHADE, max(0.0, -n.z) ** 1.6 * 0.32)
        deg, t = _skull_uv(p)
        # 彫った窪みは全部わずかに暗く落とす。**黒にはしない**
        dent = 0.0
        for da, dt, hw, ht, _d in SKULL_DENTS[2:] + SKULL_DENTS_EXTRA:
            e = 1.0 - math.hypot(abs((deg - da + 180.0) % 360.0 - 180.0) / hw,
                                 abs(t - dt) / ht)
            dent = max(dent, e)
        base = _mix(base, BONE_SHADE, min(1.0, dent / 0.6) * 0.34)
        # 眼窩。**設定画からトレースしたデカール**を引く。縁の形も
        # 中の階調も光の位置も絵のまま出る。色は紙から取らず、暗さ(R)と
        # 光(G)を意図として受け取ってパレットから出す ―― こうしないと
        # ダンジョンの寒色の灯りへの暖色補正が効かない(handbook 4-116)
        # **黒く塗り潰すのは球の仕事。** デカールはその縁の影だけに使う。
        # 両方で黒くすると眼窩が「角ばった黒い溝」になる(handbook 4-122)
        dark, _hil, cov = _skull_decal(deg, t)
        if cov > 0.0:
            base = _mix(base, BONE_SHADE, min(1.0, dark * 1.30) * cov * 0.85)
        return base
    # 嘴。先へ向かって暗く、上下の合わせ目に線、付け根に鼻孔
    axis = (BEAK_TIP - BEAK_ROOT)
    t = min(1.0, max(0.0, (p - BEAK_ROOT).dot(axis) / axis.length_squared))
    base = _mix(BEAK, BEAK_TIPC, t ** 0.7)
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
    eye_mat = C.make_material(f"{NAME}_eye", EYE, roughness=0.88)
    plume_mat = C.make_textured_material(f"{NAME}_plume", feather_texture(),
                                         roughness=0.72)
    for o in [parts["core"]] + parts["legs"]:
        C.assign_material(o, core_mat)
    for o in (parts["skull"], parts["beak"]):
        C.assign_material(o, bone_mat)
    # 眼球は**専用のマテリアル**。骸と同じ(roughness 0.55)にすると球面が
    # 広いハイライトを拾い、黒い眼が「灰色の玉」になる(handbook 4-125)。
    # 艶は塗りの1点だけに任せ、材質はほぼ拡散にする
    for o in parts["eyes"]:
        C.assign_material(o, eye_mat)
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

    mesh = C.join([parts["core"]] + parts["legs"]
                  + [parts["skull"], parts["beak"]]
                  + parts["wings"] + parts["feathers"] + parts["eyes"], NAME)
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
    # **スロット番号は名前で引く。** `C.join` の並び順で決まるので、
    # 材質を1つ足しただけで番号がずれる ―― 眼球を足したとき、羽毛が
    # 2 番から 3 番へ動き、`== 2` で退避していた縞 UV が眼球のものに
    # なって、羽毛の縞がまるごと消えた(handbook 4-126)
    slot = {m.name: i for i, m in enumerate(mesh.data.materials)}
    i_core, i_bone = slot[f"{NAME}_core"], slot[f"{NAME}_bone"]
    i_plume = slot[f"{NAME}_plume"]
    uv = mesh.data.uv_layers.active.data
    plume_uv = {li: (uv[li].uv.x, uv[li].uv.y)
                for pol in mesh.data.polygons if pol.material_index == i_plume
                for li in pol.loop_indices}
    # 骸のテクセル密度。`organic_uv` は**メッシュ全面**を1枚の UV へ
    # 詰めるので、数千枚の羽毛の帯が骸と場所を取り合う。しかも羽毛の UV は
    # このあと自前の縞 UV で**上書きされる**ので、その取り合いは丸損。
    # 倍率 3.4 では骸の島が 512x512 のうち 110x110 しか取れず、径 27mm の
    # 眼窩が 14 テクセルに潰れて「灰色のつやのある大きな目」に見えていた
    # (handbook 4-114)。骸だけを大きく切り出して密度を寄せる
    skull_c = (SKULL_C.x * scale, SKULL_C.y * scale,
               (SKULL_TOP - SKULL_H * 0.5) * scale)
    C.organic_uv(mesh, axis=1,
                 boost=(skull_c, SKULL_UV_R * scale, 9.0))
    img_f = C.bake_albedo(mesh, lambda p, n: feather_color(p * inv, n),
                          size=TEX_SIZE, name=f"{NAME}_albedo",
                          material_index=i_core)
    img_b = C.bake_albedo(mesh, lambda p, n: bone_color(p * inv, n),
                          size=BONE_TEX, name=f"{NAME}_bone_albedo",
                          material_index=i_bone)
    uv = mesh.data.uv_layers.active.data
    for li, val in plume_uv.items():
        uv[li].uv = val
    mesh.data.materials[i_core] = C.make_textured_material(
        f"{NAME}_core_mat", img_f, roughness=0.75)
    mesh.data.materials[i_bone] = C.make_textured_material(
        f"{NAME}_bone_mat", img_b, roughness=0.55)
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
    assert len(mesh.data.materials) == 4 + bool(MIST_PUFFS), \
        [m.name for m in mesh.data.materials]
    assert C.tri_count([mesh]) <= TARGET_TRIS, C.tri_count([mesh])
