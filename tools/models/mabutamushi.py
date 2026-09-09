"""
まぶたむし ―― 設定画(`plan/models/reference-mabutamushi-sheet.png`)から。

このモジュールが本番の造形。`monsters.MONSTERS` から呼ばれる
(monsters.py には状態アニメーション `mabutamushi_animations` だけが残る)。

旧モデルは「gajiri(ねずみ)と同じ関節構成」の四足の小動物に、背へ
面取りした箱の甲殻を1枚載せたものだった。設定画は**翅と触角のある
ふわふわの毛玉の虫**で、体形からして別物なので作り直す
(差分と実装結果は `plan/models/archive/mabutamushi-remake.md`)。

方針(`handbook/reading-at-game-size.md`):
- **翅がこの種の最大のシルエット記号。** 板ポリゴンで作らず、設定画から
  トレースしたアルファ抜きのカードで持つ(ホネガラミの手・房で確立)。
  設定画の翅は縁が入り組んでいて(先が尖り、根元が細く、下縁が波打つ)、
  ローポリの板では出せない。上下2枚は必ず一緒に見えるので1枚の
  カードに収める ―― 「何枚も重なったように見えるが実際は薄い膜が2枚」
  という設定画のメモにも合う。
- **ふわふわは毛のテクスチャではなく輪郭の凹凸で作る。** 体の外周へ
  小さな球をいくつか重ね、シルエットを柔らかく崩す。
- swarm で2〜3匹同時に出る種なので三角形は軽く保つ(旧モデル 3,140)。

寸法は三面図の実測(1px = `SC` m、接地は正面図 y283 / 側面図 y283)。
  正面: 体 x626..722(幅96px)/ 翅の左右端 x598..752(全幅154px)
        翅の先 y118 / 体の頭頂 y190 / 体の底 y280 / 接地 y283
  側面: 体 x819..955(長136px)/ 背 y196..底 y276(高80px)
        体の中心 x887、頭の先は中心の68px前
**最初の版は体を 1.5倍に作ってしまい、翅が耳のように見えた。**
体は翅幅の 0.62倍(96/154)しかない ―― 数字を取り直して直した。
"""
import math

import bpy
from mathutils import Vector

import common as C

NAME = "mabutamushi"

SC = 0.00125              # m / 設定画1px。総高 165px ≈ 0.206m
HEIGHT = 0.206            # 翅の先(z0.206)まで。基準身長

# 設定画のパレット9色(スウォッチの実測)。`handbook/modeling-pitfalls.md`
# 2-27 のとおりスウォッチは**色相**の指定なので、面積の大きい体だけ絵の
# 中の実測と突き合わせた ―― 絵の中の体の明るい側の平均は (196,182,178)、
# スウォッチは (199,187,184) でほぼ一致したのでスウォッチのまま使う。
SHEET = {
    "body":   (199, 187, 184),   # 体(メイン)淡い灰紫の毛
    "shade":  (122, 117, 134),   # 体の影
    "wing":   (202, 191, 192),   # 翅のベース
    "vein":   (187, 169, 181),   # 翅の模様(薄紫)
    "limb":   (103, 84, 78),     # 触角・脚(暗い茶)
    "eye":    (69, 60, 57),      # 目
    "glint":  (217, 202, 192),   # きらめき(ハイライト)
    "skin":   (192, 167, 152),   # 瞼・地面
    "tear":   (182, 185, 185),   # 涙・湿り気
}

# ゲームの灯りは寒色(ambient #6674a0 ×1.7 / key・fill #aec2f5)なので、
# 設定画の色をそのまま置くと画面では青白く沈む(`modeling-pitfalls.md`
# 1-38)。この種はほぼ無彩色の淡い灰紫なので影響が大きい。実機レンダーと
# 設定画のシルエット内平均色を突き合わせて決めた乗率。
# 実測(体の中央 50x80px): 設定画 (171,157,156) に対しモデル (124,116,120)。
# 1.20倍でもまだ 28%暗い。アルベドが白で頭打ちになるところまで上げる。
# **青だけ低くしない。** 1.02 にしていたら、アルベドが (239,221,188) の
# 黄色になり、輪郭線(アルベドを暗くした色)が**オリーブ色の輪**になって
# 体が「暗い輪っか」に見えた。設定画の体はほぼ無彩色なので比率を揃える
# **上げすぎると絵が消える。** 1.28/1.32/1.29 まで上げたら、体(0.998,
# 0.968, 0.931)ときらめき(1.0, 1.0, 0.971)がどちらも白で頭打ちになり、
# 手描きの粒もグラデーションも**同じ白**に潰れた。パレットの差が残る
# ところで止めて、足りない明るさは自己発光(emission)で足す
LIGHT_FIX = (1.12, 1.15, 1.13)
# 翅は元が(202,191,192)と明るく、体と同じ倍率だと白飛びして翅脈が消える
WING_FIX = (1.12, 1.10, 1.10)


def _srgb(key: str, k: float = 1.0):
    """パレットの色を 0〜1 の sRGB へ。k で明度を上下する。"""
    r, g, b = SHEET[key]
    return tuple(min(1.0, v / 255.0 * k * f) for v, f in zip((r, g, b), LIGHT_FIX))


def _lin(c):
    return tuple(C.srgb_to_linear(v) for v in c)


def _mat(key: str, k: float = 1.0, rough: float = 0.85):
    return C.make_material(f"{NAME}_{key}", _srgb(key, k), roughness=rough)


# ------------------------------------------------------------------ 体
# 前が -Y、上が +Z、接地が z=0。体は**ひとつながりの塊**(頭と腹を別の球で
# 作ったら正面から「雪だるま」に見えた。設定画の頭は毛の中に埋もれていて
# 輪郭では分かれていない)。顔は目で作る。
#
# **回転楕円体では駄目。** 最初は球を潰しただけで作っていたが、96px で
# 「仮面を付けた蛾」に見えた。設定画の体の輪郭を高さごとに測ると、
# いちばん太いのは**中央ではなく下寄り(上から 58〜85%)**で、上は
# 鈍い丸屋根、下は平たく開いている ―― 球ではなく「座った小動物」の形。
# 楕円体だと目の高さで体が細く、目が顔からはみ出して黒いゴーグルになる。
#
# 実測(正面図。暗い粒の密度で体だけを抜いた輪郭。1px = SC m):
#   y190(頭頂)..y280(毛の底) 高さ90px / いちばん太いのは y243..267 で幅97px
#   y195 幅68 / y213 幅75 / y225 幅87 / y231 幅91 / y243..264 幅97
# 側面図: x818(鼻先)..x947(尻)長130px / 高さの profile は正面とほぼ同じ
BODY_C = (0.000, 0.000, 0.0569)     # いちばん高い断面(前から49%)の中心
# 毛の凹凸は平均で半径の 0.55×FUZZ_AMP ぶん外へ出るので、その手前の
# 半径はシルエットの実測を 1.047 で割り戻す
BODY_RX = 0.0557                    # 幅 97px→0.121 の半分 ÷1.047 ÷profile最大1.04
BODY_RY = 0.0908                    # 長さ135px→0.169 の半分(側面図の実測)
BODY_RZ = 0.0525                    # 側面図の最大高さ 82px→0.1025 に合わせる
# **縦へ +6%、伸ばすのは下だけ。横幅は据え置き。** 96px で見ると設定画は
# もっと卵形で、足りないのは「目より下」だった。頭頂は上げず、頬〜顎を
# 下へ伸ばす。+10% まで伸ばしたら今度は幅/高さが 1.008 と縦長に行き過ぎた
# (設定画の実測は 97/90 = 1.078)ので +6% で止めている
# 高さ方向の輪郭(t: 0=底 1=頭頂 → いちばん太いところに対する幅の比)。
# 設定画の実測をそのまま並べたもの。**楕円 2√(t(1-t)) と比べると、
# 下 1/3 が大きく太く(t=0.12 で 0.97 対 0.65)、上は逆に鈍い**
BODY_PROFILE = [(0.00, 0.86), (0.06, 0.97), (0.15, 1.02), (0.30, 1.04),
                (0.45, 1.00), (0.58, 0.93), (0.72, 0.82), (0.85, 0.71),
                (0.93, 0.64), (1.00, 0.34)]
BODY_TOP = BODY_C[2] + BODY_RZ
BODY_BOT = BODY_C[2] - BODY_RZ


def _profile(t: float) -> float:
    t = min(1.0, max(0.0, t))
    for (t0, p0), (t1, p1) in zip(BODY_PROFILE, BODY_PROFILE[1:]):
        if t <= t1:
            return p0 + (p1 - p0) * (t - t0) / max(1e-9, t1 - t0)
    return BODY_PROFILE[-1][1]


# 側面図の胴体輪郭(6倍のグリッドで目視トレース。翅・脚・尾を含まない)。
# t は前(鼻先)から後ろ(尻)への位置、h は最大高さに対する比、
# cz はその位置での**上下の中心の高さ**(m)。
#   実測: 長さ 135px(0.169m)/ 最大高さ 82px(0.1025m)/ 長さ:高さ = 1.65
#   いちばん高いのは前から 49% で、そこから**尻へ向かって背が下がる**。
# **これが 90° の最大の失敗だった。** 上下対称の塊だと「丸い胴に翅が
# 垂直に刺さった」形にしかならず、設定画の「前に顔・後ろへ流れる胴」に
# ならない。胴体だけの Silhouette IoU は 0.842 だった。
BODY_SIDE = [
    (0.000, 0.074, 0.0350), (0.060, 0.469, 0.0475), (0.134, 0.691, 0.0538),
    (0.239, 0.864, 0.0575), (0.358, 0.975, 0.0581), (0.493, 1.000, 0.0569),
    (0.627, 0.913, 0.0525), (0.746, 0.753, 0.0456), (0.866, 0.568, 0.0375),
    (0.955, 0.296, 0.0313), (1.000, 0.060, 0.0288),
]


def _side(t: float):
    """前後位置 t での (高さ比, 中心の高さ)。

    **直線で繋がない。** 折れ点で断面の縮み方が急に変わり、そこが
    面の折り目になる ―― 透視のかかる実機の正面図で、体が「平らな天面と
    まっすぐな側面を持つ箱」に見えた。余弦で滑らかに繋ぐ。"""
    t = min(1.0, max(0.0, t))
    for (t0, h0, c0), (t1, h1, c1) in zip(BODY_SIDE, BODY_SIDE[1:]):
        if t <= t1:
            k = (t - t0) / max(1e-9, t1 - t0)
            k = 0.5 - 0.5 * math.cos(math.pi * k)
            return h0 + (h1 - h0) * k, c0 + (c1 - c0) * k
    return BODY_SIDE[-1][1], BODY_SIDE[-1][2]


def _shape_side(obj) -> None:
    """側面図の輪郭どおりに、断面を前後位置ごとに上下へ縮めて置き直す。

    **正面図の形は保たれる。** 縮小率は最大 1.0(前から 49% の断面)なので、
    正面から見た外形はその断面そのもの ―― つまり `BODY_PROFILE` で作った
    鐘型がそのまま残る。側面だけが設定画の輪郭になる。"""
    c = Vector(BODY_C)
    y0 = c.y - BODY_RY
    for v in obj.data.vertices:
        t = (v.co.y - y0) / (2 * BODY_RY)
        h, cz = _side(t)
        v.co.z = cz + (v.co.z - c.z) * h
        # 鼻先・尻も x を絞る(絞らないと縦の刃になる)
        # **鼻先・尻は強めに絞る。** 弱いと、カメラに近い鼻先の断面が
        # 透視で膨らんで、いちばん太い断面より外へ出る ―― 正面の
        # 鐘型が「箱」に潰れた
        v.co.x = c.x + (v.co.x - c.x) * (h ** 0.80)
    obj.data.update()


# ふわふわの毛。**別オブジェクトの球を貼らない。** 最初そうしたら、
# 大きさを変えても数を変えても「毛」ではなく**木いちごの粒**にしか
# 見えなかった(球はどれだけ小さくしても輪郭に丸い切れ目を作る)。
# 体の球そのものの頂点を半径方向へ押して、輪郭を柔らかく崩す。
# 乱数ではなく正弦の重ね合わせにする ―― 格子や乱数だと
# 「毛」ではなく「ざらつき」になる(`modeling-pitfalls.md` 4-16)。
# **粗さは分割数で決まる。** 26分割に周波数13だと1波2面ちょうどで
# 折り返し、輪郭が「じゃがいものごつごつ」になった。設定画の毛は
# 体幅96pxに対して4px程度の細かい粒なので、分割を上げて周波数も上げる
# **振幅は輪郭線の太さと足し算になる。** 反転ハルは谷を埋めるので、
# 見えている暗い縁の太さ = ハル(6.4mm)+ 凹凸の谷の深さ。0.130 では
# 体幅の 8% が暗い縁になり、96px で「暗い輪の中の白い塊」に見えた
# (設定画の毛の縁は体幅の 4% ほど)。ハルと同じ桁まで浅くする
# **大きな波は周波数の折り返しだった。** 40分割に周波数19は1波あたり
# 2.1面しかなく、低周波の唸りへ化けて左右に5〜6個の大きなコブを作る。
# 分割を上げて周波数を下げ、振幅も 96px で 2px 程度まで落とす
# (1px を切る毛はジオメトリにしない ―― 輪郭線とテクスチャの仕事)
FUZZ_AMP = 0.055          # 半径に対する凹凸の振幅
BODY_SEG, BODY_RING = 56, 34


def _fuzz(obj, center, amp: float = FUZZ_AMP, seed: float = 0.0) -> None:
    c = Vector(center)
    for v in obj.data.vertices:
        d = v.co - c
        r = d.length
        if r < 1e-6:
            continue
        n = d / r
        # **角度で刻む。** 直交座標の正弦だと波長がメッシュの分割より
        # 長くなり、輪郭がただの「たるみ」になった。方位角・仰角で
        # 分割数ぎりぎりまで細かく刻むと、輪郭が毛のギザギザになる
        az = math.atan2(n.y, n.x)
        el = math.asin(min(max(n.z, -1.0), 1.0))
        # 細かい毛(輪郭線のハルに飲まれるので陰影の粒として効く)と、
        # ハルより深い**数本の房**(輪郭を実際に破る)を足し合わせる。
        # 房が無いと完全な楕円になり、「ふわふわ」がどこにも残らない
        w = (0.62 * math.sin(az * 13.0 + seed)
             + 0.52 * math.sin(el * 11.0 + seed * 1.7)
             + 0.46 * math.sin(az * 9.0 - el * 13.0 + seed * 3.1))
        w += 0.5 * max(0.0, math.sin(az * 7.0 + seed * 0.7)
                            * math.sin(el * 5.0 - seed * 2.3) - 0.55)
        # 底の極だけ毛を抑える(尖った突起になって接地が汚れる)
        w *= 1.0 - 0.6 * max(0.0, -el - 0.95) / 0.62
        v.co = c + d * (1.0 + amp * w)
    # v.co を直接いじったら update する(`modeling-pitfalls.md` 3-43)
    obj.data.update()


# ---------------------------------------------------- 体の手描き Base Color
# `handbook/hand-painted-standard.md` 規約3(単色マテリアルを貼らない)。
# 設定画の体の「地の色」を高さごとに実測した(暗い線・目を除いた上位65%):
#   頭頂 174 / 上 204 / 中上 218 / 中下 176 / 下 166
# いちばん明るいのは**上寄りの中段**で、そこから下へ落ちる。
# ゲームのトゥーン照明も上から当たるので二重にはせず、
# **下面の落ち込み・後ろの沈み・きらめきの粒**だけを絵として描く。
def _body_paint(p, _n):
    t = (p.z - BODY_BOT) / max(1e-6, BODY_TOP - BODY_BOT)   # 0=底 1=頭頂
    k = 1.0 - 0.20 * max(0.0, 0.48 - t) / 0.48              # 下面を落とす
    # まだら。**格子ハッシュは使わない**(補間が無く四角い斑になる。
    # `modeling-pitfalls.md` 4-16)。正弦の重ね合わせで滑らかに散らす
    q = p * 130.0
    k *= 1.0 + 0.035 * (math.sin(q.x + 0.7 * q.z) + math.sin(q.y * 0.8 - q.x))
    # **背中は暗いだけでなく紫に寄る。** 設定画の実測は 正面 (203,187,182)
    # / 背面 (165,149,156) ―― 輝度で 0.81倍、しかも赤より青が高い。
    # 明度を落とすだけでは灰色になるので「体の影」の色へ寄せる
    u = 0.50 * min(1.0, max(0.0, p.y / BODY_RY))
    base = tuple(c + (sc - c) * u
                 for c, sc in zip(_srgb("body"), _srgb("shade")))
    r, g, b = (v * k for v in base)
    # きらめきの粒(設定画の体に散る白い点)。しきい値の外は0なので
    # 粒の**あいだ**は地の色のまま
    sp = (math.sin(p.x * 240.0) * math.sin(p.z * 210.0 + 1.3)
          * math.sin(p.y * 190.0 - 0.6))
    w = max(0.0, sp - 0.72) / 0.28
    if w > 0.0:
        gr, gg, gb = _srgb("glint")
        r, g, b = (c + (gc - c) * w for c, gc in ((r, gr), (g, gg), (b, gb)))
    return min(1.0, r), min(1.0, g), min(1.0, b)


def _ellipsoid_normals(obj) -> None:
    """法線を**楕円体**の面法線へ寄せる。

    `C.spherize_normals` は中心からの「球」へ寄せるが、胴を前後へ 1.5倍に
    伸ばしてからこれを使うと、正面を向いた広い面で法線がほとんど変化せず、
    トゥーンの階調が大きな平面のまま出る ―― 体が多面体のように見えた。
    楕円体の法線は (dx/rx^2, dy/ry^2, dz/rz^2) なので、半径で割ってから
    正規化すれば、伸ばした形でも滑らかな階調が戻る。"""
    c = Vector(BODY_C)
    rx, ry, rz = BODY_RX, BODY_RY, BODY_RZ
    normals = []
    for v in obj.data.vertices:
        d = v.co - c
        n = Vector((d.x / (rx * rx), d.y / (ry * ry), d.z / (rz * rz)))
        normals.append(n.normalized() if n.length_squared > 1e-12 else v.normal.copy())
    obj.data.normals_split_custom_set_from_vertices(normals)


def build_body() -> list:
    rings = []
    for i in range(BODY_RING + 1):
        t = i / BODY_RING
        z = BODY_BOT + t * (BODY_TOP - BODY_BOT)
        k = _profile(t)
        # **前後(ry)は正面の profile ほど絞らない。** 同じ比率で絞ると、
        # 腹と頭頂が前後に短くなって鼻先・尻の低い所まで届かず、側面の
        # 輪郭が痩せる(IoU が 0.03 下がる)。正面図の形を決めるのは rx
        # だけなので、ry は緩やかに絞れば正面は変わらない。
        # **ただし天面・底面の近くまで緩めてはいけない。** 一律 0.35乗に
        # したら天面のキャップが 0.038 × 0.125m の細長い平板になり、
        # 背中に平らな稜線(竜骨)ができた ―― 実機の正面図で体が
        # 「平らな天面を持つ箱」に見えた原因。上下の端だけ強く絞る
        e = 0.35 + 0.45 * (2.0 * abs(t - 0.5)) ** 2
        rings.append((z, BODY_RX * k, BODY_RY * (k ** e),
                      BODY_C[0], BODY_C[1]))
    body = C.loft(f"{NAME}_body", rings, segments=BODY_SEG)
    _shape_side(body)
    _fuzz(body, BODY_C, FUZZ_AMP, 1.9)
    # **凹凸は輪郭だけに効かせ、陰影には効かせない。** 押した頂点の法線を
    # そのまま使うと、トゥーンの階調が谷ごとに落ちて体が「暗い輪っかの
    # 中に白い塊」になった(設定画の体はほぼ均一な中間調)。法線を
    # 素の楕円体へ戻せば、シルエットは毛のままで陰影だけ滑らかになる
    _ellipsoid_normals(body)
    return [body]


# ------------------------------------------------------------------ 目
# 設定画の目は**白目のない黒い縦長の楕円**で、上に小さなきらめきが乗る。
# まばたきは現行の機構をそのまま引き継ぐ(`plan/models/archive/
# eye-blink-liveliness.md`)。この種は「まばたきのたびに湧く」という
# 設定なので、機構と設定が噛み合っている。
#
# **最初は目を 1.5倍に作っていた。** 12倍に拡大して測り直すと、黒い
# 楕円そのものは x640..660 / y238..262 の **20 × 24px** しかない。
# 31px と読んでいたのは、そのまわりの柔らかい影まで数えていたため。
# 体幅 97px に対して 21%(32%ではない)。この差で、目が顔からはみ出す
# 「黒いゴーグル」になっていた。
#   中心 = 体の中心から 24px 外・接地から 33px、側面図では中心の 44px 前
# **12倍で黒い部分だけを抜いてトレースした実測**(主成分分析):
#   絵の左の目  長軸 25.4px / 短軸 18.0px  比 1.41  傾き 110.7°  中心 (652.8, 250.1)
#   絵の右の目  長軸 24.6px / 短軸 18.2px  比 1.35  傾き  66.7°  中心 (698.3, 250.4)
#   側面の目    長軸 24.8px / 短軸 19.8px  比 1.25  傾き  61.3°
# 90° が直立なので、**両目とも上が外へ 21〜23度傾いている**(下が鼻側)。
# 側面では上が 29度後ろへ倒れる。直立した楕円で作っていたのが
# 「玩具っぽさ」の正体だった。外接箱に対する面積は 0.76〜0.78 で、
# 楕円の π/4 = 0.785 とほぼ同じ ―― 形そのものは楕円でよい。
# **上をまぶたで切られてはいない。** 最上行が滑らかに 3px まで細るので、
# 設定画の黒目は欠けのない卵。眠たげさは傾きとまわりの毛で出ている。
EYE_C = (0.0290, -0.0770, 0.0430)
EYE_RX = 0.0113           # 短軸 18px の半分
EYE_RZ = 0.0150           # 長軸 25.4px の半分(傾けると見かけの比が
                          # 上がるので、実機で 1.35〜1.41 に収まるまで下げた)
# **実機で測って合わせる。** 21度で作ると画面上の傾きは 10.5度に
# しかならなかった(まぶたが上を 8% 削るぶん、見かけの主軸が起きる)。
# 設定画の 110.7°/66.7°(= 直立から 21度)に**実測で**合わせた値
EYE_TILT_OUT = 25.0       # deg。上が外へ
EYE_TILT_BACK = 12.0      # deg。上が後ろへ(側面図の 61.3 から。控えめに)
# **左右を完全対称にしない。** 設定画も 1.41 と 1.35 で揃っていない
EYE_ASYM = 0.030          # 片側だけ縦へ ±3.0%
# **この種の名前そのもの。** ただしトレースの結果、設定画の黒目は
# まぶたに**切られていない**(最上行まで滑らかに細る)。眠たげさは
# 傾きとまわりの毛で出ている。そこで覆いは黒目の 8% までに留め、
# まぶたは「目の上に張り出す肉」として頭の輪郭側で効かせる。
# 線で縁取るのではなく、頭の毛が黒目へ覆いかぶさる形にする ――
# 目より前へ出し、目より横に広くし、色・法線・自己発光は頭と揃える。
LID_C = (0.0290, -0.0712, 0.0678)
# **前へ出しすぎない。** 4.6mm も出すと、まぶたの縁が顔の上に
# 「明るい灰色の楕円」として出てしまう。黒目の上を切るのに要る
# ぶん(1mm ほど)だけ出す
LID_R = (0.0190, 0.0175, 0.0125)   # 目の上 12% をひさしのように覆う
LID_TILT = 10.0           # deg。外側が下がる = 眠たげ


def build_eyes() -> list:
    """目は**輪郭線を付けない**。反転ハルは 6.4mm あり、半径 12mm の目に
    付けると楕円が 2倍にふくらんで体のシルエットを突き破る ―― 実機で
    「体に黒いゴーグルを掛けた」ように見えた。設定画の目はそれ自体が
    真っ黒なので、輪郭線は要らない。まぶたも同じ(体と同色なので、
    輪郭線が付くと顔に黒い枠が2つ描かれる)。"""
    out = []
    eye_m, glint_m = _mat("eye", rough=0.25), _mat("glint", rough=0.2)
    # **体と同じ自己発光を与える。** 体だけ emission 0.14 を持っているので、
    # 素の単色材質のままだと、まぶただけ暗く沈んで「濃いアイシャドウ」に
    # 見えた(顔の肉の続きに見せたいのに、別部品として目立つ)
    lid_m = C.make_material(f"{NAME}_lid", _srgb("body", 0.98),
                            roughness=0.85, emission=0.14)
    for m in (eye_m, glint_m, lid_m):
        m["noOutline"] = True
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        c = Vector((EYE_C[0] * side, EYE_C[1], EYE_C[2]))
        asym = 1.0 + EYE_ASYM * side
        w = C.uv_sphere(f"{NAME}_eye{tag}_w", c, EYE_RX, segments=16, rings=12,
                        scale=(1.0, 0.92, EYE_RZ / EYE_RX * asym))
        # **傾ける。** 直立した楕円のままだと玩具に見える(設定画は
        # 上が外へ 21度、後ろへ 12度)。原点はワールド原点なので、
        # 目の中心へ移してから回す(`modeling-pitfalls.md` 4-25)
        C.set_origin(w, c)
        w.rotation_euler = (math.radians(-EYE_TILT_BACK),
                            math.radians(EYE_TILT_OUT) * side, 0.0)
        C.activate(w)
        bpy.ops.object.transform_apply(rotation=True)
        C.assign_material(w, eye_m)
        w["blink"] = "white"
        # きらめきの位置も実測。設定画は目の中心の **6px 真上**
        # (dx はほぼ 0)。外へ寄せると寄り目に、内へ寄せると
        # 遠くを見ている顔になる
        g = C.uv_sphere(f"{NAME}_eye{tag}_p",
                        c + Vector((0.0010 * side, -0.0098, 0.0075)),
                        EYE_RX * 0.22, segments=8, rings=6)
        C.assign_material(g, glint_m)
        g["blink"] = "pupil"
        lid = C.uv_sphere(f"{NAME}_lid{tag}",
                          Vector((LID_C[0] * side, LID_C[1], LID_C[2])),
                          LID_R[0], segments=28, rings=16,
                          scale=(1.0, LID_R[1] / LID_R[0], LID_R[2] / LID_R[0]))
        # **原点まわりに回さない。** `uv_sphere` のオブジェクト原点は
        # ワールド原点なので、そのまま回すとまぶたが外へ振り出されて
        # 「目の外側に付いた腫れぼったい袋」になった
        C.set_origin(lid, Vector((LID_C[0] * side, LID_C[1], LID_C[2])))
        lid.rotation_euler = (0.0, math.radians(LID_TILT) * side, 0.0)
        C.activate(lid)
        bpy.ops.object.transform_apply(rotation=True)
        C.assign_material(lid, lid_m)
        # 体と同じ**楕円体**の法線にする。球の法線のままだと、体だけ
        # 楕円体へ替えたときに差が出て、まぶたが灰色の丸として浮いた
        _ellipsoid_normals(lid)
        out += [w, g, lid]
    return out


# --------------------------------------------------------- 触角・脚・尾
# 触角は頭の上から**前上へ**伸び、先に小さな粒が付く(設定画の側面図)。
# 正面図: 左右の触角は頭の上(x±16px, y222)から(x±32px, y180)へ。
# 中央にもう1本、頭頂(y193)から真上(y150)へ伸びて先に粒が付く。
# **1.45倍に伸ばす。** 設定画では頭頂から目の高さぶんの長さがある
# 「重要な縦線」で、短いと 96px でただの点になる。根元は少し外側、
# 先は内側へ寄せて、開かず立った線にする
ANTEN = [(0.023, -0.058, 0.072), (0.026, -0.068, 0.116), (0.028, -0.078, 0.155)]
ANTEN_MID = [(0.000, -0.048, 0.098), (0.000, -0.052, 0.132), (0.000, -0.056, 0.164)]
# **細く。** 96px では輪郭線のぶんだけ太って見えるので、絵の
# 「髪の毛のような線」に合わせるには実寸をかなり細くする必要がある
ANTEN_R = 0.0014
ANTEN_KNOB = 0.0034

# 脚は3対。細く頼りない線で、体の下から外へ開いて接地する。
# 3対。**設定画の側面では脚がはっきり見えている**のに、モデルでは
# 胴体の裾に埋もれて消えていた。胴長の 25% / 50% / 75% に置き、
# 体の外へ明確に出す。96px の 1px は 2.15mm なので、直径 7.6mm で
# 3px ―― 4本以上の脚先が判別できる太さ。
LEGS = [
    ((0.020, -0.045, 0.030), (0.042, -0.052, 0.013), (0.052, -0.058, 0.001)),
    ((0.022, +0.000, 0.026), (0.048, +0.002, 0.011), (0.059, +0.004, 0.001)),
    ((0.020, +0.045, 0.028), (0.042, +0.054, 0.012), (0.052, +0.060, 0.001)),
]
LEG_R = 0.0038

# 尻の小さな巻き。設定画の側面図・背面図に必ず描かれている
# 側面図の実測: 体の尻(x940 = 中心の53px後ろ)から出て、下へ回り込み
# 前へ巻き上がる。渦は YZ 面(横から見て渦に見える)
# **急な折り返しを入れない。** 渦を1周させようとして最後の2点を
# 前へ戻したら、曲線の補間が発散して尾が z-0.87m まで伸びた。
# 96px では巻きの1周目しか見えないので、四分の三周でやめる
TAIL = [(0.000, +0.082, 0.034), (0.000, +0.102, 0.026),
        (0.000, +0.114, 0.014), (0.000, +0.110, 0.005)]
TAIL_R = 0.0042


def build_limbs() -> tuple:
    """(触角+粒, 脚+尾)を返す。**本体へ結合しない。**

    反転ハルの輪郭線は世界座標で固定の太さ(モデル高 × 0.03 = 6.6mm)を
    持つので、直径2.2mm の触角はハルに丸ごと飲み込まれて黒い棒になる。
    材質に `noOutline` を立てて輪郭線の対象から外すには、本体とは別の
    メッシュである必要がある(結合すると材質が1つのメッシュに同居し、
    輪郭線はメッシュ単位で付くため切り分けられない)。"""
    anten, legs = [], []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        pts = [Vector((p[0] * side, p[1], p[2])) for p in ANTEN]
        anten.append(C.curve_tube(f"{NAME}_anten{tag}", pts,
                                  [ANTEN_R, ANTEN_R * 0.85, ANTEN_R * 0.7],
                                  resolution=2, bevel_resolution=1))
        anten.append(C.uv_sphere(f"{NAME}_knob{tag}", pts[-1], ANTEN_KNOB,
                                 segments=6, rings=4, scale=(1.0, 1.0, 1.3)))
        if side > 0:                      # 中央の1本は左右に無いので1回だけ
            mp = [Vector(p) for p in ANTEN_MID]
            anten.append(C.curve_tube(f"{NAME}_antenM", mp,
                                      [ANTEN_R, ANTEN_R * 0.8, ANTEN_R * 0.6],
                                      resolution=2, bevel_resolution=1))
            anten.append(C.uv_sphere(f"{NAME}_knobM", mp[-1], ANTEN_KNOB * 1.15,
                                     segments=6, rings=4, scale=(1.0, 1.0, 1.5)))
        for k, leg in enumerate(LEGS):
            lp = [Vector((p[0] * side, p[1], p[2])) for p in leg]
            legs.append(C.curve_tube(f"{NAME}_leg{tag}{k}", lp,
                                     [LEG_R, LEG_R * 0.8, LEG_R * 0.55],
                                     resolution=2, bevel_resolution=0))
    legs.append(C.curve_tube(f"{NAME}_tail", [Vector(p) for p in TAIL],
                             [TAIL_R, TAIL_R * 0.8, TAIL_R * 0.6, TAIL_R * 0.4],
                             resolution=2, bevel_resolution=1))
    return anten, legs


# ------------------------------------------------------------------ 翅
# 設定画の右の翅を**上下2枚に分けて**切り出したカード。
# 生成: scratchpad/mb_wing4.py
#
# **1枚のカードに上下をまとめない。** 前の版は上下を1枚に収め、体で
# 消えた根元を「1つの三角形の楔」で埋めていた。そのため2枚が根元で
# 融合し、設定画にある「2枚のあいだの隙間」が消えていた。
# 根元は設定画でも体の毛に隠れていて**そもそも描かれていない**ので、
# 2本の縁を内側へ延長して収束させた輪郭を 8倍で目視トレースしてある。
#
# 実測(設定画。体の中心 x=674 / 接地 y=283、1px = SC m):
#   上翅 根元 (689,217) → 先 (746,116)  長軸 116px / 傾き 60.6°
#   下翅 根元 (692,216) → 先 (754,215)  長軸  62px / 傾き  0.9°
WINGS = (
    # (テクスチャ, 根元(x,y,z), 傾きdeg, u範囲, v範囲,
    #  反り(根元→先)deg, 分割, 後ろへの倒し deg)
    ("textures/mabutamushi_wing_upper.png",
     (0.0187, -0.020, 0.0825), 60.6, (-0.0051, 0.1445), (-0.0153, 0.0354),
     (16.0, 54.0), 8, 24.0),
    ("textures/mabutamushi_wing_lower.png",
     (0.0225, -0.016, 0.0838), 0.9, (0.0025, 0.0825), (-0.0218, 0.0169),
     (20.0, 60.0), 6, 36.0),
)
# **正面の幅は横成分だけで調整する。** 反りを入れるとカードは後ろへ回り、
# ゲームカメラは透視投影なので、奥へ行った翅の先はさらに内側へ寄って見える
# (実測で全幅/全高 0.94 → 0.86)。カード全体を伸ばすと翅が縦にも伸びて
# 背が高くなるので、**横成分にだけ**倍率を掛けて取り返す。
WING_XSTRETCH = 1.09
# **翅を後ろへ倒す(rake)。** 反り(yaw)は Z 軸まわりなので、翅は横へ
# 回るだけで**立ったまま**だった。90° から見ると「丸い胴に翅が垂直に
# 刺さっている」形になり、設定画の「背中から後方へ流れる4枚翅」に
# ならない。X 軸まわりに倒して、長軸に後ろ向きの成分を持たせる。
# 下翅は上翅より深く倒す。同じだと側面で2枚が重なって1枚に見える
# **反りで正面の幅を失わないように、横成分だけ 1/cos(反り) で補正する。**
# カードを後ろへひねると正面への投影が cos(反り) だけ縮む。前の版は
# カード全体を 1.3倍に引き伸ばして取り返していたが、それだと翅の絵まで
# 伸びる。横成分だけ割り戻せば、**正面図はトレースどおりのまま**側面に
# だけ面積が出る(縦成分は Z 軸まわりの回転で変わらないので触らない)。


_wing_cache: dict = {}


def _tinted_copy(img, name: str):
    """画像へ寒色補正(WING_FIX)を掛けた**生成画像**を返す。

    材質へ Multiply ノードを挟む手もあるが、glTF 書き出しがノードを
    落として補正が消える(`modeling-pitfalls.md` 4-14)。画素へ焼く。
    乗率はそのまま掛ける ―― `img.pixels` はこの bpy ビルドでは読み書き
    とも sRGB のまま(同 4-14)。"""
    w, h = img.size
    out = bpy.data.images.new(name, w, h, alpha=True)
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        px[i] = min(1.0, px[i] * WING_FIX[0])
        px[i + 1] = min(1.0, px[i + 1] * WING_FIX[1])
        px[i + 2] = min(1.0, px[i + 2] * WING_FIX[2])
    out.pixels = px
    return out


def _wing_material(tex: str):
    if tex not in _wing_cache:
        import os
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), tex)
        src = bpy.data.images.load(path)
        img = _tinted_copy(src, f"{NAME}_{os.path.basename(tex)[:-4]}")
        mat = bpy.data.materials.new(f"{NAME}_{os.path.basename(tex)[:-4]}_card")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = 0.55
        bsdf.inputs["Metallic"].default_value = 0.0
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        if hasattr(mat, "blend_method"):
            mat.blend_method = "CLIP"
        mat.use_backface_culling = False
        # **切り抜きであることを glTF の extras で明示する。** Blender 5 では
        # blend_method の CLIP が廃止され、glTF へは alphaMode=BLEND として
        # しか出せない。エンジン側(src/view/assets.ts)はこの印を見て
        # alphaTest に変え、輪郭線の対象からも外す
        mat["alphaCutout"] = 0.5
        _wing_cache[tex] = mat
    return _wing_cache[tex]


def _rake(v: Vector, rake: float) -> Vector:
    """翅を後ろへ倒す。**回転ではなく剪断。**

    素直に X 軸まわりで回すと縦成分が cos(倒し角)だけ縮み、モデル全高が
    0.209 → 0.187m まで落ちた(基準身長のテストにも落ちる)。反りのときと
    同じ考え方で、**高さに比例して後ろへずらす**だけにすれば、正面図の
    x も z もトレースどおりのまま、側面にだけ後方への流れが出る。"""
    return Vector((v.x, v.y + v.z * math.tan(math.radians(rake)), v.z))


def _card(name: str, side: float, root, pitch: float, urange, vrange,
          yaw0: float, yaw1: float, seg: int, rake: float) -> bpy.types.Object:
    """翅1枚。根元から先へ向かって**後ろへ反っていく**帯(seg 個の四角形)。

    平らな一枚板だと、正面図に合わせて幅を取ったとき側面から消える
    (実測: 側面で翅が幅3pxの刃になり、設定画の「体より大きい翅」が
    完全に無くなった)。逆に板ごと大きくひねると正面の幅が足りない。
    根元は正面向き・先は後ろ向き、と途中で向きを変えることで両立させ、
    さらに**横成分だけ 1/cos(反り) で割り戻す**ので、正面図はトレース
    どおりのまま側面にだけ面積が出る。

    root は設定画で翅が生えている点、pitch はその翅の長軸の傾き(deg)、
    u は根元→先、v はそれに直交(設定画の下向きが +v)。"""
    p0 = math.radians(pitch)
    cu, su = math.cos(p0), math.sin(p0)
    me = bpy.data.meshes.new(name)
    co, faces, uvs = [], [], []
    u0, u1 = urange
    v0, v1 = vrange
    base = Vector((root[0] * side, root[1], root[2]))
    p = base + _rake(Vector((cu * u0 * side * WING_XSTRETCH, 0.0, su * u0)), rake)     # 根元側の端まで戻す
    for i in range(seg + 1):
        t = i / seg
        a = math.radians(yaw0 + (yaw1 - yaw0) * t)
        ca, sa = math.cos(a), math.sin(a)
        # 弦(v)方向。横成分は 1/cos(反り) で割り戻してある
        ch = _rake(Vector((su * side * WING_XSTRETCH, su * sa / ca, -cu)), rake)
        co += [tuple(p + ch * v0), tuple(p + ch * v1)]
        uvs += [(t, 1.0), (t, 0.0)]      # v0 は設定画の上側 = テクスチャの上
        if i < seg:
            am = math.radians(yaw0 + (yaw1 - yaw0) * (i + 0.5) / seg)
            du = (u1 - u0) / seg
            p = p + _rake(Vector((cu * side * WING_XSTRETCH,
                                  cu * math.tan(am), su)), rake) * du
    for i in range(seg):
        faces.append((i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1))
    me.from_pydata(co, [], faces)
    me.update()
    uv = me.uv_layers.new()
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def build_wings() -> list:
    """左右 × 上下の 4枚。**UV を左右反転しない** ―― 反転は幾何の側
    (side)で既に起きているので、u を裏返すと二重になって翅の
    「先」と「根元」が入れ替わる。"""
    out = []
    for tex, root, pitch, urange, vrange, yaws, seg, rake in WINGS:
        mat = _wing_material(tex)
        kind = "up" if "upper" in tex else "lo"
        for side in (-1.0, 1.0):
            tag = "L" if side > 0 else "R"
            o = _card(f"{NAME}_wing{kind}{tag}", side, root, pitch,
                      urange, vrange, yaws[0], yaws[1], seg, rake)
            C.assign_material(o, mat)
            out.append(o)
    return out


# =================================================================== 本番
def _joints_half() -> dict:
    # 骨は4本だけ。触角・脚・尾は変形しない剛体部品として骨へ親化する
    # ので、スキニング用の骨は「体・頭・翅」で足りる
    return {
        "body": (0.000, +0.015, 0.058),
        "head": (0.000, -0.050, 0.068),
        "wing.L": (0.055, -0.010, 0.150),
        # 脚と尾を親化するための「体そのもの」の骨。根の関節(body)には
        # 骨が無い(骨は親子の関節ペアから作られる)ので1本用意する
        "belly": (0.000, +0.020, 0.010),
    }


BONES_HALF = [("body", "head"), ("body", "wing.L"), ("body", "belly")]


def build():
    """本番モデル(メッシュ+アーマチュア+まばたき用の目)を返す。"""
    body = build_body()
    anten, legs = build_limbs()
    wings = build_wings()
    eyes = build_eyes()

    # **アルベドだけでは設定画の明るさに届かない。** 白で頭打ちにしても
    # 実測の平均輝度は設定画の 83% どまりだった(ゲームの環境光が寒色で
    # 暗いため。`modeling-pitfalls.md` 1-38)。この種は「光にかざすと
    # 淡くきらめく」設定なので、わずかな自己発光で残りを埋める
    C.smart_uv(body[0])
    img = C.bake_albedo(body[0], _body_paint, size=384, name=f"{NAME}_albedo")
    body_m = C.make_textured_material(f"{NAME}_body", img, roughness=0.85)
    _bsdf = body_m.node_tree.nodes["Principled BSDF"]
    _bsdf.inputs["Emission Color"].default_value = (*_lin(_srgb("body")), 1.0)
    _bsdf.inputs["Emission Strength"].default_value = 0.14
    # **腹側を別マテリアルで塗り分けない。** 高さで切ると正面から
    # 水平の境界線が1本走り、「帯を巻いた」ように見えた。トゥーンの
    # 階調が既に下面を落としているので、体は1色でよい
    # **明るくしない。** LIGHT_FIX を上げたぶん脚まで持ち上げたら、
    # 96px で「白いひげ」が体の下から四方へ出ているように見えた。
    # 設定画の脚・触角は体よりはっきり暗い(103,84,78)ので、寒色補正の
    # 底上げだけ効かせて明度は上げない
    limb_m = C.make_material(f"{NAME}_limb", _srgb("limb", 0.82), roughness=0.7)
    # 輪郭線の対象から外す印(`src/view/assets.ts` の skipOutline)
    limb_m["noOutline"] = True
    for o in body:
        C.assign_material(o, body_m)
    for o in anten + legs:
        C.assign_material(o, limb_m)

    # **翅は薄い板なので自動ウェイトが必ず取りこぼす**
    # (`modeling-pitfalls.md` 3-41)。骨へ明示的に固定する。
    # join() のあとは元のオブジェクトが消えるので、名前は先に控える
    groups = [(("L" if o.name.endswith("L") else "R"), C.mark_for_pin(o))
              for o in wings]
    mesh = C.join(body + wings, NAME)
    half = _joints_half()
    joints = C.mirrored(half)
    bones = C.mirrored_bones(BONES_HALF)
    armature = C.build_armature(NAME, joints, bones, mesh, root="body")
    for tag, grp in groups:
        C.pin_weight_to_bone(mesh, grp, f"body-wing.{tag}")
    anten_o = C.join(anten, f"{NAME}_antennae")
    legs_o = C.join(legs, f"{NAME}_legs")
    C.parent_to_bone(anten_o, armature, "body-head")
    C.parent_to_bone(legs_o, armature, "body-belly")
    for eye in eyes:
        C.parent_to_bone(eye, armature, "body-head")
    parts = [anten_o, legs_o] + eyes
    _check(mesh, parts)
    return [mesh, armature] + parts, armature


def _check(mesh, parts) -> None:
    lo, hi = C.bounds([mesh] + parts)
    h, w, d = hi.z - lo.z, hi.x - lo.x, hi.y - lo.y
    print(f"[{NAME}] 高さ {h:.3f}m 幅 {w:.3f}m 奥行き {d:.3f}m "
          f"三角形 {C.tri_count([mesh])}")
    assert lo.z > -0.004, lo.z
