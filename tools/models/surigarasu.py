"""
スリガラス ―― 設定画(`plan/models/reference-surigarasu-sheet.png`)から。

このモジュールが本番の造形。`monsters.MONSTERS` から呼ばれる
(monsters.py には状態アニメーション `surigarasu_animations` だけが残る)。

旧モデルは「gajiri(ねずみ)と同じ関節構成」の四足獣を鳥のシルエットへ
寄せたもので、翼は肩に貼った平たい潰し球、配色は参道の土色だった。
設定画は**二本足で直立する、すりガラスの羽のカラス**で、骨格から別物
(差分は `plan/models/surigarasu-remake.md`)。

方針(`handbook/reading-at-game-size.md` と、まぶたむしで確立した手順):
- **正面と側面を同時に拘束する。** 正面図から「高さ→幅」、側面図から
  「高さ→前後の幅と中心」を実測して表にし、`C.loft` のリングへそのまま
  積む。正面だけ合わせても前後方向は何も拘束されず、90° が「丸い塊」に
  なる(`handbook/modeling-pitfalls.md` 4-30)。鳥は前傾姿勢なので、
  **高さごとの前後中心 cy** がそのまま姿勢になる。
- 法線は楕円体へ寄せる(同 4-32)。細い脚は `noOutline`(同 4-19)。

寸法は三面図の実測(1px = `SC` m)。接地は正面図 y308 / 側面図 y305。
  正面: 全高 y112..308(196px)/ 最大幅 y230 で 150px
  側面: 全長 x812(嘴先)..1000(尾先)/ 胴の中心は x915
"""
import math

import bpy
from mathutils import Vector

import common as C

NAME = "surigarasu"

SC = 0.00111              # m / 設定画1px。全高 196px ≈ 0.218m
HEIGHT = 0.218            # 基準身長(tests/helpers/modelBaseline.ts と一致)

# 設定画のカラーパレット7色(スウォッチの実測)
SHEET = {
    "feather": (65, 63, 60),     # 羽・体(メイン)ほぼ黒
    "sheen":   (174, 165, 186),  # 羽の反射(虹色)
    "beak":    (71, 70, 72),     # くちばし・脚
    "eye":     (218, 210, 203),  # 目・ハイライト
    "shard":   (202, 195, 199),  # ガラスの欠片
    "shade":   (130, 117, 132),  # 影色
    "ground":  (161, 141, 120),  # 地面・土ぼこり
}

# ゲームの灯りは寒色(ambient #6674a0 ×1.7 / key・fill #aec2f5)なので、
# 設定画の色をそのまま置くと画面では沈む(`modeling-pitfalls.md` 1-38)。
# **この種は基色がほぼ黒なので、上げすぎると灰色の鳥になる。** 黒は黒の
# まま、明るい側(目・欠片)だけが持ち上がるように控えめに掛ける。
LIGHT_FIX = (1.14, 1.12, 1.16)


def _srgb(key: str, k: float = 1.0):
    r, g, b = SHEET[key]
    return tuple(min(1.0, v / 255.0 * k * f) for v, f in zip((r, g, b), LIGHT_FIX))


def _mat(key: str, k: float = 1.0, rough: float = 0.75):
    return C.make_material(f"{NAME}_{key}", _srgb(key, k), roughness=rough)


# ------------------------------------------------------------------ 体
# 前が -Y、上が +Z、接地が z=0。
#
# **正面図と側面図の2つの表でリングを決める。** u は正規化した高さ
# (0=接地 1=頭頂)。正面図は「幅」、側面図は「前後の幅」と「前後の中心」。
# 側面図の cy がそのまま鳥の**前傾姿勢**になる ―― 頭は前、尾は後ろ。
#
# 実測(正面図。接地 y308 / 全高 196px / 最大幅 150px は y230):
#   y112 幅22 / y130 幅85 / y150 幅112 / y170 幅109(顎の切れ込み)
#   y190 幅128 / y210 幅144 / y230 幅150 / y250 幅140 / y270 幅120 / y290 幅75
# **表は目視ではなく、判定に使うのと同じ実マスクから起こす**
# (`scratchpad/sg_tables.py`)。グリッドを目で読むと羽の淡い先端を
# 数えたり数えなかったりでぶれ、実際に側面の前縁を 40px も前へ読み違えた。
# u は胴そのものの高さで正規化(0=胴の底 1=頭頂、どちらの図も 178px)。
BODY_Z0 = HEIGHT - 178 * SC     # 胴の底(ここから下は脚)
BODY_RX = 0.0753          # 最大の半幅(実マスクの 136px の半分)
# 正面図: 高さ→幅(最大幅に対する比)。羽の縁のギザつきは胴の形ではない
# ので 5点移動平均でならしてある(羽は別部品で足す)
FRONT_PROFILE = [
    (0.000, 0.00), (0.058, 0.51), (0.111, 0.94), (0.168, 0.96),
    (0.221, 0.90), (0.279, 0.99), (0.332, 0.97), (0.389, 0.92),
    (0.442, 0.92), (0.500, 1.00), (0.558, 0.77), (0.611, 0.67),
    (0.668, 0.60), (0.721, 0.56), (0.779, 0.52), (0.832, 0.45),
    (0.889, 0.39), (0.942, 0.03), (1.000, 0.00),
]
# 側面図: 高さ→(前縁, 後縁)。胴の中心 sheet x915 基準の m。
# **「中心+半幅」で持たない** ―― 2つが連動し、尾を後ろへ伸ばすと胸まで
# 前へ出る。前縁は下へ行くほど**後退**する(腹が脚の上でくびれる)。
# u0.66〜0.80 は嘴が突き出す範囲なので胴の表からは外し、前後で補間する。
SIDE_PROFILE = [
    (0.057, -0.0022, +0.1099), (0.113, -0.0122, +0.0988),
    (0.165, -0.0278, +0.1099), (0.222, -0.0389, +0.0944),
    (0.278, -0.0500, +0.1021), (0.335, -0.0533, +0.0955),
    (0.387, -0.0599, +0.0744), (0.443, -0.0588, +0.0644),
    (0.500, -0.0611, +0.0655), (0.557, -0.0566, +0.0555),
    (0.613, -0.0533, +0.0444), (0.835, -0.0566, +0.0089),
    (0.887, -0.0466, +0.0089), (1.000, -0.0300, -0.0100),
]
BODY_SEG, BODY_RING = 48, 32


def _lerp_table(table, u: float):
    """表を余弦で滑らかに引く。**直線で繋がない** ―― 折れ点がそのまま
    面の折り目になり、透視のかかる実機で体が多面体に見える(4-32)。"""
    u = min(1.0, max(0.0, u))
    for a, b in zip(table, table[1:]):
        if u <= b[0]:
            k = (u - a[0]) / max(1e-9, b[0] - a[0])
            k = 0.5 - 0.5 * math.cos(math.pi * k)
            return tuple(x + (y - x) * k for x, y in zip(a[1:], b[1:]))
    return table[-1][1:]


def build_body() -> list:
    rings = []
    for i in range(BODY_RING + 1):
        u = i / BODY_RING
        z = BODY_Z0 + u * (HEIGHT - BODY_Z0)
        (kx,) = _lerp_table(FRONT_PROFILE, u)
        yf, yr = _lerp_table(SIDE_PROFILE, u)
        rings.append((z, BODY_RX * kx, (yr - yf) * 0.5, 0.0, (yr + yf) * 0.5))
    body = C.loft(f"{NAME}_body", rings, segments=BODY_SEG)
    return [body]


# ---------------------------------------------------------------- 嘴
# 側面図の実測: 先 (812,160) / 付け根 上(858,148) 下(855,172)。
# 正面図では下向きの三角(y155..182、付け根の幅 28px)。
# カラスらしく**太く、上へわずかに湾曲**させる(旧モデルは細いコーン)。
BEAK_BASE = (0.000, -0.0633, 0.1610)
BEAK_TIP = (0.000, -0.1143, 0.1570)
BEAK_HALF = (0.0155, 0.0135)      # 付け根の 半幅 / 半高


def build_beak() -> list:
    """付け根から先へ細る楔。上下2枚に割れて見えるよう、上嘴だけ
    わずかに前へ出す(設定画の嘴は上が長く、下が短い)。"""
    a, b = Vector(BEAK_BASE), Vector(BEAK_TIP)
    d = (b - a).normalized()
    up = Vector((0.0, 0.0, 1.0))
    side = d.cross(up).normalized()
    n = 6
    rings = []
    for i in range(n + 1):
        t = i / n
        p_ = a + (b - a) * t
        k = (1.0 - t) ** 0.75
        rings.append((p_, BEAK_HALF[0] * k, BEAK_HALF[1] * k))
    me = bpy.data.meshes.new(f"{NAME}_beak")
    co, faces = [], []
    seg = 8
    for p_, rw, rh in rings:
        for j in range(seg):
            th = j * math.tau / seg
            co.append(tuple(p_ + side * (rw * math.cos(th)) + up * (rh * math.sin(th))))
    for i in range(n):
        for j in range(seg):
            k0, k1 = i * seg + j, i * seg + (j + 1) % seg
            faces.append((k0, k1, k1 + seg, k0 + seg))
    faces.append(tuple(range(seg - 1, -1, -1)))
    me.from_pydata(co, [], faces)
    me.update()
    obj = bpy.data.objects.new(f"{NAME}_beak", me)
    bpy.context.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    return [obj]


# ---------------------------------------------------------------- 目
# **この種の顔の要。** 白っぽく大きな丸い目に黒い瞳、好奇心に満ちた表情。
# 正面図の実測: 中心 (664,148)(734,148) 直径 34px、瞳 20px。
# 側面図では中心 (868,165) ―― 頭の**側面**に付いた鳥の目。
EYE_C = (0.0400, -0.0522, 0.1776)
EYE_R = 0.0189
PUPIL_R = 0.0111


def build_eyes() -> list:
    """まばたきの機構(`plan/models/archive/eye-blink-liveliness.md`)へ
    そのまま載せる。輪郭線は付けない ―― 反転ハルは 6.5mm あり、
    半径 19mm の目に付けると円板が 1.7倍にふくらむ。"""
    out = []
    white = _mat("eye", rough=0.35)
    dark = _mat("feather", 0.55, rough=0.25)
    for m in (white, dark):
        m["noOutline"] = True
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        c = Vector((EYE_C[0] * side, EYE_C[1], EYE_C[2]))
        w = C.uv_sphere(f"{NAME}_eye{tag}_w", c, EYE_R, segments=16, rings=12)
        C.assign_material(w, white)
        w["blink"] = "white"
        # 瞳は**外向き**へ寄せる(鳥の目は頭の側面に付く)
        p = C.uv_sphere(f"{NAME}_eye{tag}_p",
                        c + Vector((0.0075 * side, -0.0130, 0.0010)), PUPIL_R,
                        segments=12, rings=8)
        C.assign_material(p, dark)
        p["blink"] = "pupil"
        out += [w, p]
    return out


# ------------------------------------------------------------ 脚・足
# 正面図: 2本の細い脚が体の裾(z0.020)から接地まで。足指は前3・後1。
# 側面図: 脚は x870..895、足指は x855..920 ―― つま先が前を向く。
LEG_X = 0.0222
LEG_TOP = (0.0222, -0.0330, 0.0330)
LEG_FOOT = (0.0222, -0.0330, 0.0060)
LEG_R = 0.0052
TOES = [(-0.0260, 0.0), (-0.0150, -0.0170), (-0.0150, 0.0170), (0.0180, 0.0)]
TOE_R = 0.0034


def build_legs() -> list:
    """脚と足指。**輪郭線を付けない** ―― 直径 10mm の脚に 6.5mm の
    反転ハルが付くと 2.3倍に太り、鳥の細い脚が丸太になる。"""
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        top = Vector((LEG_TOP[0] * side, LEG_TOP[1], LEG_TOP[2]))
        foot = Vector((LEG_FOOT[0] * side, LEG_FOOT[1], LEG_FOOT[2]))
        out.append(C.curve_tube(f"{NAME}_leg{tag}", [top, (top + foot) * 0.5, foot],
                                [LEG_R, LEG_R * 0.85, LEG_R * 0.8],
                                resolution=2, bevel_resolution=2))
        for k, (dy, dx) in enumerate(TOES):
            tip = foot + Vector((dx * side, dy, -0.0045))
            out.append(C.curve_tube(f"{NAME}_toe{tag}{k}", [foot, (foot + tip) * 0.5, tip],
                                    [TOE_R, TOE_R * 0.8, TOE_R * 0.5],
                                    resolution=2, bevel_resolution=1))
    return out


def _check(objs) -> None:
    lo, hi = C.bounds(objs)
    print(f"[{NAME}] 高さ {hi.z - lo.z:.3f}m 幅 {hi.x - lo.x:.3f}m "
          f"奥行き {hi.y - lo.y:.3f}m 三角形 {C.tri_count(objs)}")
    assert lo.z > -0.004, lo.z
