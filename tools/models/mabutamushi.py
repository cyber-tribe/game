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
# 側面図の実測を model 座標へ直したもの。前が -Y、上が +Z、接地が z=0。
#   側面図の x27(鼻先)→ y=-0.098 / x184(尻)→ y=+0.098
#   側面図の y164(接地)→ z=0 / y55(背)→ z=0.136
# 体は**ひとつながりの塊**。頭と腹を別の球で作ったら、正面から
# 「雪だるま」に見えた ―― 設定画の頭は毛の中に埋もれていて、輪郭では
# 分かれていない。1つの回転楕円体を前後にテーパーさせ、顔は目で作る。
# 実測から逆算する。毛の凹凸(FUZZ_AMP)で 1.11 倍にふくらむので、
# その手前の半径をそこから割り戻す。
#   正面図 幅96px→0.120(半0.060)/ 側面図 長136px→0.170(半0.085)
#   高さ z0.009..0.122(半0.0563)、中心 z0.0653
# 設定画の比を全高 0.206m に掛けたもの: 体幅 96/165 → 0.120、
# 体高 90/165 → 0.113、目 31/165 → 直径 0.0385
# 実測合わせ: 体幅/全高 は設定画 0.582、初手 0.625 だったので 5% 縮めた
# 毛の凹凸は平均で半径の 0.55×FUZZ_AMP ぶん外へ出るので、その手前の
# 半径はシルエットの実測を 1.047 で割り戻した値にする。
BODY_C = (0.000, 0.000, 0.0653)
BODY_R = 0.0773
BODY_SCALE = (0.742, 1.000, 0.696)


def _taper(obj) -> None:
    """後ろへ細く、鼻先をわずかに絞る(設定画の側面図)。"""
    c = Vector(BODY_C)
    ry = BODY_R * BODY_SCALE[1]
    for v in obj.data.vertices:
        t = (v.co.y - (c.y - ry)) / (2 * ry)          # 0=鼻先 1=尻
        k = 1.0 - 0.18 * max(0.0, t - 0.55) / 0.45
        k *= 1.0 - 0.08 * max(0.0, 0.22 - t) / 0.22
        v.co.x = c.x + (v.co.x - c.x) * k
        v.co.z = c.z + (v.co.z - c.z) * k - 0.006 * max(0.0, t - 0.6)
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
FUZZ_AMP = 0.085          # 半径に対する凹凸の振幅
BODY_SEG, BODY_RING = 40, 24


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
        w = (0.62 * math.sin(az * 19.0 + seed)
             + 0.52 * math.sin(el * 15.0 + seed * 1.7)
             + 0.46 * math.sin(az * 11.0 - el * 17.0 + seed * 3.1))
        w += 1.5 * max(0.0, math.sin(az * 5.0 + seed * 0.7)
                            * math.sin(el * 4.0 - seed * 2.3) - 0.45)
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
BODY_TOP = BODY_C[2] + BODY_R * BODY_SCALE[2]
BODY_BOT = BODY_C[2] - BODY_R * BODY_SCALE[2]


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
    u = 0.50 * min(1.0, max(0.0, p.y / (BODY_R * BODY_SCALE[1])))
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


def build_body() -> list:
    body = C.uv_sphere(f"{NAME}_body", BODY_C, BODY_R,
                       segments=BODY_SEG, rings=BODY_RING, scale=BODY_SCALE)
    _taper(body)
    _fuzz(body, BODY_C, FUZZ_AMP, 1.9)
    # **凹凸は輪郭だけに効かせ、陰影には効かせない。** 押した頂点の法線を
    # そのまま使うと、トゥーンの階調が谷ごとに落ちて体が「暗い輪っかの
    # 中に白い塊」になった(設定画の体はほぼ均一な中間調)。法線を
    # 素の楕円体へ戻せば、シルエットは毛のままで陰影だけ滑らかになる
    C.spherize_normals(body, BODY_C)
    return [body]


# ------------------------------------------------------------------ 目
# 設定画の目は**白目のない大きな黒い丸**で、上に小さなきらめきが乗る。
# まばたきは現行の機構をそのまま引き継ぐ(`plan/models/archive/
# eye-blink-liveliness.md`)。この種は「まばたきのたびに湧く」という
# 設定なので、機構と設定が噛み合っている。
# 正面図の実測: 目は x636..667 / y232..262(直径31px = 体幅96px の32%)、
# 中心は体の中心から 22.5px 外・接地から 36px。側面図では中心の 44px 前。
# **体の面すれすれに置かない。** 目の中心を体の表面(y-0.064)と同じ
# 位置にしたら、円の外周が毛の凹凸に隠れて「小さな黒い切れ込み」に
# しか見えなかった。設定画の目は側面図でも頭から**出っ張った黒い玉**
# なので、毛の山(y-0.070)より前へ出す
EYE_C = (0.0281, -0.0730, 0.0504)
EYE_R = 0.0192


def build_eyes() -> list:
    """目は**輪郭線を付けない**。反転ハルは 6.4mm あり、半径18.5mm の目に
    付けると円板が 1.35倍にふくらんで体のシルエットを突き破る ―― 実機で
    「体に黒いゴーグルを掛けた」ように見えた。設定画の目はそれ自体が
    真っ黒な丸なので、輪郭線は要らない。"""
    out = []
    eye_m, glint_m = _mat("eye", rough=0.25), _mat("glint", rough=0.2)
    eye_m["noOutline"] = True
    glint_m["noOutline"] = True
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        c = Vector((EYE_C[0] * side, EYE_C[1], EYE_C[2]))
        w = C.uv_sphere(f"{NAME}_eye{tag}_w", c, EYE_R, segments=14, rings=10)
        C.assign_material(w, eye_m)
        w["blink"] = "white"
        g = C.uv_sphere(f"{NAME}_eye{tag}_p",
                        c + Vector((-0.008 * side, -0.015, 0.012)), EYE_R * 0.13,
                        segments=8, rings=6)
        C.assign_material(g, glint_m)
        g["blink"] = "pupil"
        out += [w, g]
    return out


# --------------------------------------------------------- 触角・脚・尾
# 触角は頭の上から**前上へ**伸び、先に小さな粒が付く(設定画の側面図)。
# 正面図: 左右の触角は頭の上(x±16px, y222)から(x±32px, y180)へ。
# 中央にもう1本、頭頂(y193)から真上(y150)へ伸びて先に粒が付く。
ANTEN = [(0.020, -0.055, 0.076), (0.031, -0.066, 0.104), (0.040, -0.075, 0.130)]
ANTEN_MID = [(0.000, -0.050, 0.104), (0.000, -0.053, 0.136), (0.000, -0.056, 0.166)]
# **細く。** 96px では輪郭線のぶんだけ太って見えるので、絵の
# 「髪の毛のような線」に合わせるには実寸をかなり細くする必要がある
ANTEN_R = 0.0011
ANTEN_KNOB = 0.0034

# 脚は3対。細く頼りない線で、体の下から外へ開いて接地する。
LEGS = [
    ((0.024, -0.052, 0.028), (0.036, -0.060, 0.011), (0.041, -0.064, 0.001)),
    ((0.028, -0.005, 0.026), (0.042, -0.008, 0.009), (0.047, -0.010, 0.001)),
    ((0.024, +0.043, 0.028), (0.036, +0.053, 0.011), (0.040, +0.058, 0.001)),
]
LEG_R = 0.0034

# 尻の小さな巻き。設定画の側面図・背面図に必ず描かれている
# 側面図の実測: 体の尻(x940 = 中心の53px後ろ)から出て、下へ回り込み
# 前へ巻き上がる。渦は YZ 面(横から見て渦に見える)
# **急な折り返しを入れない。** 渦を1周させようとして最後の2点を
# 前へ戻したら、曲線の補間が発散して尾が z-0.87m まで伸びた。
# 96px では巻きの1周目しか見えないので、四分の三周でやめる
TAIL = [(0.000, +0.072, 0.040), (0.000, +0.092, 0.030),
        (0.000, +0.104, 0.018), (0.000, +0.100, 0.008)]
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
# 設定画の右の翅(上下2枚)をそのまま切り出したカード。
# 生成: scratchpad/mb_wingtex2.py(切り出し枠 sheet 682,112〜757,231)。
# 破線ガイドは翅の薄い膜と濃さが同じで、消さずに塗りつぶすと横一直線に
# 漏れる。図の無い列でガイド行を先に特定して潰してある
WING_TEX = "textures/mabutamushi_wing_pair.png"
# **カードは傾けない。** 設定画の切り出し枠は軸に平行なので、翅の
# 「斜め外へ開く」角度はテクスチャの中に既に入っている。カードごと
# 傾けると、板の下辺が体の高さで真横へ突き出し、正面の外接箱が
# 横長に潰れた(実測 1.10、設定画は 1.22)。
# **足りない幅は根元を外へ出して稼いではいけない。** カードを後ろへ22度
# ひねってあるぶん正面への投影が縮む(実測 全幅 0.162m)。根元(WING_ROOT
# の x)を 0.010→0.019 へ動かして稼いだら、翅の内側の縁が体から離れ、
# 体と翅のあいだに**背景の隙間**が開いて「別々の部品」に見えた。
# カード自体を 1.25倍に広げる ―― 翅の絵は横に伸びるが、根元は体に
# 重なったままになる
WING_W = 0.1480           # m。カードは弧なので、正面へ投影した幅より弧長は長い
WING_H = 0.14875          # m。同 119px。z0.065..0.21375(翅の先の実体は z0.206)
# 根元(カードの左下角)。前後は側面図の付け根(体の中心の 24px 前)
WING_ROOT = (0.010, -0.030, 0.065)
# 根元と先の向き(deg。0 = 真正面を向く / 90 = 真後ろへ向く)。
# 側面図の翅は体の 8割の長さにわたって後ろへ張り出しているので、先は
# 大きく寝かせる。正面の幅は根元側の浅い角度で稼ぐ
WING_YAW0 = 18.0
WING_YAW1 = 62.0
# 翅の**開き**。設定画は正面の外接箱が横206×縦169(横長)なのに、翅を
# 真上へ立てたモデルは203×307(縦長)になっていた。設定画の翅は上へ
# ではなく**斜め外へ**開く

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


def _wing_material():
    if "mat" not in _wing_cache:
        import os
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), WING_TEX)
        src = bpy.data.images.load(path)
        img = _tinted_copy(src, f"{NAME}_wing")
        mat = bpy.data.materials.new(f"{NAME}_wing_card")
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
        _wing_cache["mat"] = mat
    return _wing_cache["mat"]


def _card(name: str, base: Vector, side: float, w: float, h: float,
          yaw0: float, yaw1: float, seg: int = 6) -> bpy.types.Object:
    """根元から先へ向かって**後ろへ反っていく**帯(seg 個の四角形)。

    平らな一枚板だと、正面図に合わせて幅を取ったとき側面から消える
    (実測: 側面で翅が幅3pxの刃になり、設定画の「体より大きい翅」が
    完全に無くなった)。逆に板ごと大きくひねると正面の幅が足りない。
    根元は正面向き・先は後ろ向き、と**途中で向きを変える**ことで
    正面の幅と側面の面積を同時に持たせる。"""
    me = bpy.data.meshes.new(name)
    co, faces, uvs = [], [], []
    p = base.copy()
    pts = [p.copy()]
    for i in range(seg):
        t = (i + 0.5) / seg
        a = math.radians(yaw0 + (yaw1 - yaw0) * t)
        p = p + Vector((math.cos(a) * side, math.sin(a), 0.0)) * (w / seg)
        pts.append(p.copy())
    up = Vector((0.0, 0.0, h))
    # **UV を左右反転しない。** 反転は幾何の側(side)で既に起きている
    # ―― 帯が -X へ伸びるのだから、同じ向きに貼った絵はそれだけで
    # 鏡像になる。ここでさらに u を裏返すと**二重に反転**し、翅の
    # 「先」がテクスチャの根元、「根元」が先になる。実機では左の翅だけ
    # 尖った先が体側に、細い根元が外側に来て、明らかに向きが狂った
    for i, q in enumerate(pts):
        co += [tuple(q), tuple(q + up)]
        u = i / seg          # 0 = 根元(体側) / 1 = 翅の先
        uvs += [(u, 0.0), (u, 1.0)]
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
    out = []
    mat = _wing_material()
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        base = Vector((WING_ROOT[0] * side, WING_ROOT[1], WING_ROOT[2]))
        o = _card(f"{NAME}_wing{tag}", base, side, WING_W, WING_H,
                  WING_YAW0, WING_YAW1)
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
