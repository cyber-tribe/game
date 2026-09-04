"""
モンスター5種。名前・造形ともにオリジナル。

いずれも「関節と太さ」を定義して Skin モディファイアで皮を張り、
サブディビジョンで丸めた一枚のメッシュとして作る。目や角のような小さな飾りだけ
別メッシュで足して統合している。

Blender では -Y が正面。glTF に書き出すと +Z 正面になる。
"""

from __future__ import annotations

import math

import common as C
from mathutils import Matrix, Vector

EYE_DARK = (0.07, 0.06, 0.09)
EYE_WHITE = (0.95, 0.95, 0.92)


def eyeball(name: str, center, radius: float, look=(0.0, -1.0, 0.0),
            white=EYE_WHITE, dark=EYE_DARK, squash=1.0, blink: bool = False) -> list:
    """
    白目と瞳を1組作る。look は瞳を寄せる向き。

    blink=True にすると、まばたき対象の印(カスタムプロパティ)を付ける
    (plan/models/archive/eye-blink-liveliness.md)。呼び出し側で join() の
    対象から外し、armature構築後に common.parent_to_bone で頭の骨へ
    直接つなぐこと(この関数はまだarmatureを知らないのでここでは繋げない)。
    """
    c = Vector(center)
    direction = Vector(look).normalized()
    w = C.uv_sphere(f"{name}_w", c, radius, segments=16, rings=12,
                    scale=(1.0, 1.0, squash))
    C.assign_material(w, C.make_material(f"{name}_wm", white, roughness=0.28))
    p = C.uv_sphere(f"{name}_p", c + direction * radius * 0.62, radius * 0.52,
                    segments=14, rings=10)
    C.assign_material(p, C.make_material(f"{name}_pm", dark, roughness=0.2))
    if blink:
        w["blink"] = "white"
        p["blink"] = "pupil"
    return [w, p]


# =========================================================================== ぷるん

# 設定画(design/characters/purun/generated/purun-sheet.png)の三面図の実測値。
# 計測の手順と生の数字は plan/models/purun-remake.md。
PURUN_HEIGHT = 0.300          # 高さ(設定画「約30cm」・正面図175px)
PURUN_HALF_W = 0.1575         # 最大半幅(正面図185px = 幅0.315m)
PURUN_DEPTH = 0.885           # 奥行き / 幅(側面図162px ÷ 正面図185px)

# 正面図の輪郭。(上からの割合, 最大幅に対する比)。上半分は素直なドーム、
# 下2割で一度ふくらんで(裾)すぐ内側へ巻き込む。頂点付近の3リングだけは
# 実測点の間隔が粗いので球冠の w∝√t で補った(そうしないと頭頂が尖る)
PURUN_PROFILE = [
    (0.000, 0.038), (0.002, 0.077), (0.005, 0.121), (0.010, 0.172),
    (0.020, 0.235),
    (0.050, 0.384), (0.100, 0.508), (0.150, 0.600), (0.200, 0.676),
    (0.250, 0.730), (0.300, 0.768), (0.350, 0.805), (0.400, 0.827),
    (0.450, 0.849), (0.500, 0.859), (0.550, 0.870), (0.600, 0.870),
    (0.650, 0.881), (0.700, 0.881), (0.750, 0.892), (0.800, 0.946),
    (0.850, 1.000), (0.900, 0.978), (0.950, 0.816), (0.980, 0.700),
    (1.000, 0.620),
]

PURUN_EYE_Z = 0.150           # 目の高さ(体の上から50%)
PURUN_EYE_X = 0.0434          # 目の中心の左右位置(中心間87mm)
PURUN_EYE_HALF_W = 0.0107     # 目の半幅(幅21mm)
PURUN_EYE_HALF_H = 0.0300     # 目の半分の高さ(高さ60mm)

# カラーパレット欄と正面図の実測(plan/models/purun-remake.md)。
# ここに書くのは**設定画で測った色そのまま**で、実際に焼くアルベドは
# 下の _purun_albedo() を通したもの
PURUN_SHEET = {
    "main": (0.788, 0.859, 0.894),      # メイン(体)の明部 #c9dbe4
    "mid": (0.678, 0.776, 0.835),       # 中間 #adc6d5
    "shadow": (0.514, 0.612, 0.706),    # 影 #839cb4
    "hilight": (0.969, 0.957, 0.933),   # ハイライト #f7f4ee
    "bubble": (0.855, 0.894, 0.933),    # 気泡・揺らぎ #dae4ee
    "iris": (0.855, 0.847, 0.921),      # 揺らぎに混ざる藤色
    "eye": (0.212, 0.318, 0.514),       # 目の紺
}

# ダンジョンの照明は暖色(キー光+プレイヤーの松明 #ffd2a6)なので、
# 設定画の色をそのまま焼くと**実機では灰色に見える**。ターンテーブルで
# 実測したところ、赤道の青(#adc6d5、R-B差40)が画面では #a9aebc
# (R-B差19)まで色が抜けていた。彩度をあらかじめ上げておく。
PURUN_CHROMA = 1.95


def _purun_albedo(color):
    """設定画で測った色を、実機の照明の下で設定画どおりに見える色へ直す。"""
    luma = 0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2]
    return tuple(min(1.0, max(0.0, luma + (c - luma) * PURUN_CHROMA))
                 for c in color)


PURUN_MAIN = _purun_albedo(PURUN_SHEET["main"])
PURUN_MID = _purun_albedo(PURUN_SHEET["mid"])
PURUN_SHADOW = _purun_albedo(PURUN_SHEET["shadow"])
PURUN_HILIGHT = PURUN_SHEET["hilight"]      # 白は彩度を上げない
PURUN_BUBBLE = _purun_albedo(PURUN_SHEET["bubble"])
PURUN_IRIS = _purun_albedo(PURUN_SHEET["iris"])
# 目だけは彩度補正を掛けない。掛けたら実機で #1a53b5 の派手な青になり、
# 設定画の落ち着いた紺(#496c94)から大きく外れた。暗い色は明るい色ほど
# 照明で色が抜けないので、補正がそのまま過剰になる
PURUN_EYE_COLOR = (0.330, 0.460, 0.620)

PURUN_JOINTS = {
    "base": (0.0, 0.0, 0.050),
    "mid": (0.0, 0.0, 0.130),
    "top": (0.0, 0.0, 0.220),
}
PURUN_RADII = {"base": 0.150, "mid": 0.130, "top": 0.060}
PURUN_BONES = [("base", "mid"), ("mid", "top")]

# 裾の波(ロブ)。設定画の裾は6山で波打っている。1.0を超えないよう
# **内側にだけ**削る: 設定画から測った最大幅は「山の頂点」の幅なので、
# 外へ膨らませると実測より太る
PURUN_LOBE_TOP = 0.048        # この高さから下だけ波打たせる
PURUN_LOBE_MAIN = 0.030       # 6山の深さ(半径比)
PURUN_LOBE_SUB = 0.011        # 10山の重ね(半径比)
PURUN_HEM_NOTCH = 0.013       # 谷で裾を持ち上げる量(m)
PURUN_HEM_NOTCH_TOP = 0.032   # 持ち上げが効く高さ

# 表面の気泡(方位角°, 高さの割合, 半径m, 濃さ)。設定画では大小の淡い粒が
# 体じゅうに散っている
PURUN_BUBBLES = [
    (-118.0, 0.72, 0.013, 1.00), (-64.0, 0.60, 0.008, 0.85),
    (-38.0, 0.30, 0.011, 0.95), (-150.0, 0.34, 0.009, 0.80),
    (18.0, 0.52, 0.012, 0.90), (52.0, 0.24, 0.008, 0.75),
    (96.0, 0.66, 0.010, 0.85), (140.0, 0.42, 0.013, 0.95),
    (-92.0, 0.18, 0.007, 0.70), (8.0, 0.14, 0.009, 0.80),
    (172.0, 0.20, 0.008, 0.75), (-14.0, 0.80, 0.007, 0.70),
    (-160.0, 0.62, 0.010, 0.85), (-46.0, 0.46, 0.007, 0.70),
    (68.0, 0.44, 0.010, 0.85), (120.0, 0.24, 0.009, 0.80),
    (-104.0, 0.38, 0.008, 0.75), (152.0, 0.68, 0.009, 0.80),
]

# 輪郭だけ見える大きめの気泡(設定画の右下・左下にある丸い泡)。
# (方位角°, 高さの割合, 半径m)
PURUN_RING_BUBBLES = [(-58.0, 0.13, 0.019), (46.0, 0.19, 0.024)]


def _purun_radius(z: float) -> tuple[float, float]:
    """高さzでの (半幅rx, 半奥行きry)。PURUN_PROFILEの線形補間。"""
    t = max(0.0, min(1.0, 1.0 - z / PURUN_HEIGHT))
    rel = PURUN_PROFILE[-1][1]
    for (t0, w0), (t1, w1) in zip(PURUN_PROFILE, PURUN_PROFILE[1:]):
        if t0 <= t <= t1:
            k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            rel = w0 + (w1 - w0) * k
            break
    rx = rel * PURUN_HALF_W
    return rx, rx * PURUN_DEPTH


def _purun_normal(pos) -> "Vector":
    """
    体表の解析的な法線。**メッシュ法線を使わない**のは、しきい値で塗り
    分けると面ごとに跳ねて境界が島に割れるため(handbook/
    modeling-pitfalls.md、ガルドの顔デカールで実測)。
    """
    rx, ry = _purun_radius(pos.z)
    if rx < 1e-6:
        return Vector((0.0, 0.0, 1.0))
    dz = 0.004
    rx_up, _ = _purun_radius(min(PURUN_HEIGHT, pos.z + dz))
    rx_dn, _ = _purun_radius(max(0.0, pos.z - dz))
    drdz = (rx_up - rx_dn) / (2 * dz)
    horiz = Vector((pos.x / (rx * rx), pos.y / (ry * ry), 0.0))
    if horiz.length_squared < 1e-14:
        return Vector((0.0, 0.0, 1.0))
    horiz.normalize()
    return Vector((horiz.x, horiz.y, -drdz)).normalized()


def _purun_eye_center(sign: float) -> "Vector":
    """目の中心(体表の点)。左右の間隔が設定画の実測どおりになる。"""
    rx, ry = _purun_radius(PURUN_EYE_Z)
    x = PURUN_EYE_X * sign
    y = -ry * math.sqrt(max(0.0, 1.0 - (PURUN_EYE_X / rx) ** 2))
    return Vector((x, y, PURUN_EYE_Z))


def _purun_smooth(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a) if b != a else 0.0))
    return t * t * (3.0 - 2.0 * t)


def _purun_mix(c0, c1, t: float):
    return tuple(a + (b - a) * t for a, b in zip(c0, c1))


def _purun_local(pos, center) -> tuple[float, float]:
    """
    体表の点posの、centerから見た (水平の弧長, 高さの差)。
    体は回転体なので方位角の差に半径を掛ければ弧長になる。
    """
    a_pos = math.atan2(pos.x, -pos.y)
    a_ctr = math.atan2(center.x, -center.y)
    d_az = (a_pos - a_ctr + math.pi) % math.tau - math.pi
    rx, _ = _purun_radius(center.z if hasattr(center, "z") else pos.z)
    return d_az * rx, pos.z - center.z


def _purun_color(pos, _face_normal):
    """
    体のアルベド。「半透明のゼリー」を**塗りで**作る。

    - 上を向いた面ほど明るく、水平を向いた面(=どの向きから見ても輪郭に
      なる帯)ほど濃い青。透明体は縁ほど厚みが重なって濃く見えるので、
      これがゼリーらしさの中心になる。
    - 裾の下端は光が回り込むので明るく戻す。
    - ハイライト・気泡・目は**シルエットに効かない**のでジオメトリにせず
      ここで描く(旧版は板と球で作っていて、実機で斑に浮いていた)。
    """
    n = _purun_normal(pos)
    t = pos.z / PURUN_HEIGHT

    # 上を向いた面ほど明るい。**縁を濃くしすぎない**のが要点で、
    # 焼き込んだ濃さは向きに依らず出てしまうため、強くすると正面から
    # 見た体の真ん中まで暗くなる(最初に作ったときは赤道が#8ba3baまで
    # 沈み、設定画の#adc6d5から大きく外れていた)
    # 濃淡は控えめにする。トゥーンの階調は4段(TOON_GRADIENT_STEPS)しか
    # なく、アルベドの上下方向のグラデが照明の段差と同じ向きに重なると
    # 段差が二重になって「水位線」に見える
    up = _purun_smooth(0.05, 0.80, n.z)
    col = _purun_mix(PURUN_MID, PURUN_MAIN, up * 0.45)
    col = _purun_mix(col, PURUN_SHADOW, _purun_smooth(0.58, 0.20, t) * 0.28)
    col = _purun_mix(col, PURUN_MAIN, _purun_smooth(0.14, 0.02, t) * 0.35)

    az = math.atan2(pos.x, -pos.y)
    rx, _ = _purun_radius(pos.z)

    for b_az, b_t, b_r, b_k in PURUN_BUBBLES:
        d_az = (az - math.radians(b_az) + math.pi) % math.tau - math.pi
        d = math.hypot(d_az * rx, (t - b_t) * PURUN_HEIGHT * 0.85)
        if d < b_r:
            tint = PURUN_IRIS if b_r > 0.010 else PURUN_BUBBLE
            tint = _purun_mix(PURUN_BUBBLE, tint, 0.35)
            col = _purun_mix(col, tint,
                             (1.0 - _purun_smooth(b_r * 0.45, b_r, d)) * b_k * 0.85)

    for r_az, r_t, r_r in PURUN_RING_BUBBLES:
        d_az = (az - math.radians(r_az) + math.pi) % math.tau - math.pi
        d = math.hypot(d_az * rx, (t - r_t) * PURUN_HEIGHT)
        if d < r_r * 1.15:
            # 縁は明るく、内側もごくわずかに明るい(ガラス玉の見え方)
            edge = 1.0 - _purun_smooth(0.0, 0.16, abs(d / r_r - 0.92))
            col = _purun_mix(col, PURUN_BUBBLE, edge * 0.7)
            if d < r_r * 0.85:
                col = _purun_mix(col, PURUN_MAIN, 0.18)

    # 大きな白いつや(左上・正面寄り)と、小さい虹色の玉(右上)
    for h_az, h_t, h_w, h_h, h_k, h_col in (
        (-42.0, 0.80, 0.034, 0.021, 1.00, PURUN_HILIGHT),
        (38.0, 0.70, 0.022, 0.016, 0.60, PURUN_IRIS),
    ):
        d_az = (az - math.radians(h_az) + math.pi) % math.tau - math.pi
        d = math.hypot(d_az * rx / h_w, (t - h_t) * PURUN_HEIGHT / h_h)
        if d < 1.0:
            col = _purun_mix(col, h_col, (1.0 - _purun_smooth(0.55, 1.0, d)) * h_k)

    # 目: 縦長の紺の楕円。設定画では体の中に浮いていて起伏がなく、
    # シルエットにも触れないので塗りで描く。体は毎フレーム大きく潰れる
    # ので、別パーツにすると表面の上を滑ってしまう
    for sign in (-1.0, 1.0):
        dx, dz = _purun_local(pos, _purun_eye_center(sign))
        d = math.hypot(dx / PURUN_EYE_HALF_W, dz / PURUN_EYE_HALF_H)
        if d < 1.06:
            col = _purun_mix(col, PURUN_EYE_COLOR,
                             1.0 - _purun_smooth(0.86, 1.06, d))
            # 光の粒(上寄り・左)。設定画では左右とも左上に入っている
            g = math.hypot((dx / PURUN_EYE_HALF_W + 0.30) / 0.30,
                           (dz / PURUN_EYE_HALF_H - 0.60) / 0.16)
            if g < 1.0:
                col = _purun_mix(col, PURUN_HILIGHT,
                                 1.0 - _purun_smooth(0.30, 1.0, g))
    return col


def build_purun():
    """
    新しい設定画(design/characters/purun/generated/purun-sheet.png、
    ユーザー提供)に合わせた造形。仕様と実測値は
    plan/models/purun-remake.md。

    - **横に広いドーム**(高さ0.300m・幅0.315m・奥行き0.279m)。
      正面図から測った輪郭をそのままリングにして積む。
    - **裾**は下2割でふくらんでから内側へ巻き込み、6山に波打つ。
      接地面は平ら(設定画「地面に触れると少し広がる」)。
    - **不透明**。旧版は外殻alpha0.45+内核alpha0.85の二層だったが、
      実機では青が飛んで白いドングリになっていた。半透明感は
      「縁ほど濃い青・大きな白いつや・内部の気泡」という**塗り**で出す
      (設定画のカラーパレット自体が不透明な4色で組まれている)。
    - **口は無い**。設定画の表情10種のどれにも無い。
    """
    rings = []
    for t, w in reversed(PURUN_PROFILE):
        z = PURUN_HEIGHT * (1.0 - t)
        rx = w * PURUN_HALF_W
        rings.append((z, rx, rx * PURUN_DEPTH, 0.0, 0.0))
    body = C.loft("purun", rings, segments=32)

    # 裾の波。内側にだけ削るので、設定画から測った最大幅を超えない
    for vert in body.data.vertices:
        if vert.co.z < PURUN_LOBE_TOP:
            k = (1.0 - vert.co.z / PURUN_LOBE_TOP) ** 2
            angle = math.atan2(vert.co.y, vert.co.x)
            cut = (PURUN_LOBE_MAIN * (0.5 - 0.5 * math.cos(6 * angle))
                   + PURUN_LOBE_SUB * (0.5 - 0.5 * math.cos(10 * angle + 1.1)))
            factor = 1.0 - k * cut
            vert.co.x *= factor
            vert.co.y *= factor
            # 谷では裾そのものを持ち上げ、下端を波形に切る(設定画の裾は
            # カーテンのように山と谷がはっきり分かれている)
            if vert.co.z < PURUN_HEM_NOTCH_TOP:
                valley = 0.5 - 0.5 * math.cos(6 * angle)
                vert.co.z += (PURUN_HEM_NOTCH * valley
                              * (1.0 - vert.co.z / PURUN_HEM_NOTCH_TOP))

    # 「ぷにぷにした体」のゆるい凹み。設定画のぷるんは真円の回転体では
    # なく、ゆるく波打っている。**これは見た目の好みではなく必要な形**で、
    # 完全な回転体だと法線が高さだけで決まり、4段しかないトゥーンの階調の
    # 境目が**定規で引いたような水平線**になって胴を切ってしまう。
    # 裾のロブと同じく内側にだけ削るので、設定画から測った最大幅は動かない
    for vert in body.data.vertices:
        t = min(1.0, max(0.0, vert.co.z / PURUN_HEIGHT))
        angle = math.atan2(vert.co.y, vert.co.x)
        env = math.sin(math.pi * t) ** 0.7
        cut = (0.030 * (0.5 - 0.5 * math.cos(3 * angle + 1.1))
               + 0.016 * (0.5 - 0.5 * math.cos(5 * angle - 2.0 + 4.0 * t)))
        factor = 1.0 - cut * env
        vert.co.x *= factor
        vert.co.y *= factor
    body.data.update()

    # 法線を「体の底に中心を置いた大きな球」へ寄せる
    # (handbook/hand-painted-standard.md 規約4)。素の回転体の法線だと
    # n.zが高さだけで決まるため、4段しかないトゥーンの階調の境目が
    # **真横一直線の「水位線」**になって胴を切ってしまう。中心を下げると
    # 面がおおむね上を向き、階調の境目は裾のほうへ寄って目立たなくなる。
    # 頭頂の平らなキャップの折り目も同時に消える
    C.spherize_normals(body, (0.0, 0.0, 0.0), strength=0.5)

    C.smart_uv(body)
    tex = C.bake_albedo(body, _purun_color, size=512, name="purun_tex")
    C.assign_material(body, C.make_textured_material("purun_body", tex,
                                                     roughness=0.32))

    _purun_check(body)

    armature = C.build_armature("purun", C.mirrored(PURUN_JOINTS), PURUN_BONES,
                                body, root="base")
    return [body, armature], armature


def _purun_check(body) -> None:
    """
    設定画の実測値と合っているかをビルド時に確かめる
    (handbook/modeling-pitfalls.md「目で見て決めない」)。
    塗りで描いた目も、色の関数を体表で走査して位置と大きさを測る。
    """
    lo, hi = C.bounds([body])
    height = hi.z - lo.z
    width = hi.x - lo.x
    depth = hi.y - lo.y
    print(f"[purun] 高さ {height:.3f}m 幅 {width:.3f}m 奥行き {depth:.3f}m "
          f"(設定画 0.300 / 0.315 / 0.279)")
    assert abs(height - PURUN_HEIGHT) < 0.003, height
    assert abs(width - PURUN_HALF_W * 2) < 0.006, width
    assert abs(depth - PURUN_HALF_W * 2 * PURUN_DEPTH) < 0.006, depth

    # 最大幅の出る高さ(設定画では上から85%)
    widest = max(body.data.vertices, key=lambda v: math.hypot(v.co.x, v.co.y))
    t_widest = 1.0 - widest.co.z / PURUN_HEIGHT
    print(f"[purun] 最大幅の高さ 上から{t_widest * 100:.0f}% (設定画 85%)")
    assert 0.78 <= t_widest <= 0.92, t_widest

    # 塗った目の位置と大きさを体表で測る
    for sign, label in ((-1.0, "右"), (1.0, "左")):
        xs, zs = [], []
        for i in range(160):
            for j in range(120):
                z = PURUN_HEIGHT * (0.20 + 0.60 * j / 119)
                rx, ry = _purun_radius(z)
                a = math.radians(-70.0 + 140.0 * i / 159)
                p = Vector((rx * math.sin(a), -ry * math.cos(a), z))
                if p.x * sign <= 0.0:
                    continue
                col = _purun_color(p, None)
                if sum((a - b) ** 2 for a, b in zip(col, PURUN_EYE_COLOR)) < 0.012:
                    xs.append(p.x)
                    zs.append(z)
        assert xs, f"{label}目が塗られていない"
        cx, cz = sum(xs) / len(xs), sum(zs) / len(zs)
        print(f"[purun] {label}目 中心 x={cx:+.4f} z={cz:.4f} "
              f"高さ {max(zs) - min(zs) * 1.0:.4f}")
        assert abs(abs(cx) - PURUN_EYE_X) < 0.004, cx
        assert abs(cz - PURUN_EYE_Z) < 0.004, cz
        assert abs((max(zs) - min(zs)) - PURUN_EYE_HALF_H * 2) < 0.008, \
            max(zs) - min(zs)

    print(f"[purun] 三角形 {C.tri_count([body])}")


def purun_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    attackにタメ→ツメ(LINEARで鋭く)→行き過ぎ→戻りの緩急を足した。
    squash & stretch(体積を保った潰し伸ばし)は元から入っている
    (スライム状の骨・装甲を持たない種族なので規約どおり継続して使う)。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        ("idle", [
            (1, {lower: neutral}),
            (16, {lower: {"scale": (1.06, 0.92, 1.06)}}),
            (32, {lower: neutral}),
        ]),
        # 縮んでから跳ね上がり、着地でまた潰れる
        ("walk", [
            (1, {lower: neutral}),
            (4, {lower: squash}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}}),
            (20, {lower: neutral}),
        ]),
        # タメ(ぐっと縮む)→ ツメ(LINEARで鋭く伸び上がる)→
        # 行き過ぎ(伸びきった余韻)→ 戻り
        ("attack", [
            (1, {lower: neutral}),
            (5, {lower: squash}, {"interp": "LINEAR"}),
            (8, {lower: {"scale": (0.8, 1.35, 0.8), "loc": (0, 0.06, 0)}, upper: (-18, 0, 0)}),
            (10, {lower: {"scale": (0.86, 1.26, 0.86), "loc": (0, 0.05, 0)}, upper: (-14, 0, 0)}),
            (18, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # 鋭く潰れて(LINEAR)、ゆっくり戻る
        ("hit", [
            (1, {lower: neutral}, {"interp": "LINEAR"}),
            (3, {lower: {"scale": (1.3, 0.66, 1.3)}, upper: (16, 0, 0)}),
            (14, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {lower: neutral}),
            (10, {lower: {"scale": (1.35, 0.5, 1.35)}}),
            (24, {lower: {"scale": (1.5, 0.06, 1.5)}}),
        ]),
    ]


# ======================================================================= あくびとかげ

# 新しい設定画(plan/models/reference-akubitokage-sheet.png、ユーザー提供)に
# 合わせた造形。仕様・実測値は plan/models/akubitokage-remake.md。
# 設定画に実寸(cm)の記載が無いため、高さはHP・階層が近いガジリねずみ
# (0.120m)より一回り大きく、まぶたむし(swarm、より小柄)より大きい
# 0.140mと見積もった(未決事項として plan 追記に明記)。
AKUBI_HEIGHT = 0.140

# 三面図(正面・側面・背面)を目視で計測(1回目のpx単位の自動計測は尾の
# 巻きと胴を取り違えていたと判明。側面図をよく見ると、鼻先〜尾の付け根の
# 水平方向の奥行きよりも、尻(低い)〜頭頂(高い)の垂直方向の立ち上がりの
# ほうがずっと大きい。**寝そべった管ではなく、頭を高く掲げて座る**姿勢)。
# 目安: 奥行き(鼻先〜尻)≈0.6H、尻の高さ≈0.2H、頭頂≈1.0H。
#
# 造形はtsubute/garudoと同じ「彫刻式融合」(sculpt_merge)を使う。
# 最初にbuild_skinned(Skinモディファイア)1本の管で腰→頭→鼻先を
# つなごうとしたが、関節間隔に対して頭の半径が大きすぎて隣の胴の球と
# 溶け合い、横から見ると頭が胴に埋もれた斜めの塊になった(実機レンダーで
# 確認、handbook行き)。sculpt_mergeなら手で置いた球・管をボクセルで
# 素直に合体できるので、設定画の「腰→背→肩→頭」の連続したS字の輪郭を
# 複数の球を重ねて直接なぞれる。
AKUBI_HALF = {
    "hip": (0.000, 0.035, 0.022),      # 尻(いちばん丸い塊、尾の付け根、低い)
    "chest": (0.000, -0.005, 0.058),   # 肩(頭の下で重ねて首を作らない)
    "head": (0.000, -0.032, 0.098),    # 頭(高く掲げる)
    "snout": (0.000, -0.055, 0.086),   # 鼻先
    # あくびで開閉する下あご。骨だけ持ち肉付けはしない(下記参照)
    "jaw": (0.000, -0.046, 0.076),
    "legF.L": (0.038, -0.012, 0.034),
    "footF.L": (0.036, -0.024, 0.007),
    "legB.L": (0.044, 0.032, 0.019),
    "footB.L": (0.042, 0.018, 0.007),
    # 尾: 「太い→緩く細くなる→大きくカーブ→最後だけ煙のように巻く」の
    # 大中小のリズム。数学的な均一の渦にせず、角度・半径の縮み方を
    # 不揃いにして「眠気の煙が最後にふわっと丸まった」非対称さを作る
    "tail1": (0.000, 0.058, 0.030),
    "tail2": (0.024, 0.076, 0.052),
    "tail3": (0.044, 0.072, 0.074),
    "tail4": (0.038, 0.052, 0.086),
    "tail5": (0.020, 0.040, 0.088),
}
# 胴の彫刻(sculpt_merge前)に置く球の半径。腰→肩→頭→鼻先が互いの半径ぶん
# 重なるよう詰めてあり、稜線の無い1本のなだらかなS字に融合される。
# 設定画の正面図・背面図と見比べると、胴(特に尻)は頭と同格かそれ以上に
# 幅がある「がに股で座るカエル」型の体格で、脚も太く外へ張り出して
# 見える。旧値(hip 0.040 / chest 0.036)は頭(0.044)より小さく、実機
# レンダーで「大きな頭+痩せた胴」になっていたため、頭と同格まで太らせた
AKUBI_SCULPT_R = {"hip": 0.048, "chest": 0.043, "head": 0.044, "snout": 0.021}
# hipとchestの間だけ、両者の半径の和より関節間隔が少し広く、そのまま
# 融合すると背中がわずかにくびれる。中間に控えの球を1つ足して埋める
AKUBI_MIDBACK = (0.0, 0.015, 0.040, 0.040)
# armature(自動ウェイト・アニメーション用)のボーン。sculpt_merge後の
# 1枚のメッシュに対しても、Skin方式と同じくbuild_armatureが関節位置から
# 自動ウェイトを計算できる(tsubuteと同じ構成)
AKUBI_BONES_HALF = [
    ("hip", "chest"), ("chest", "head"), ("head", "snout"), ("snout", "jaw"),
    ("chest", "legF.L"), ("legF.L", "footF.L"),
    ("hip", "legB.L"), ("legB.L", "footB.L"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"), ("tail3", "tail4"),
    ("tail4", "tail5"),
]

# カラーパレット欄の実測値(#3d393c等)。ただし"main"は実機のダンジョン
# 照明(暗い背景+トゥーン)でレンダーすると、頭・胴・尾・脚が見分けの
# つかない黒い塊になった(実機ターンテーブルで確認)。gajiriの毛色の
# 暖色照明オフセット(handbook 1-26)と同じ考え方で、実機で読める
# 明るさへ補正する。他のモンスター(tsubuteの体メイン#596565、gajiriの
# 毛#94888e)と比べても#3d393cは著しく暗く、「影のような存在」という
# 設定を保ちつつ最低限の可読性を確保する値まで持ち上げた
AKUBI_SHEET = {
    "main": (0.30, 0.28, 0.30),       # 体(メイン)。実測#3d393cから補正
    "shade": (0.329, 0.290, 0.345),   # 体の影(参考値、下記の理由で未使用) #544a58
    "spot": (0.565, 0.494, 0.565),    # 斑点・模様 #907e90
    "belly": (0.843, 0.796, 0.784),   # おなか(薄い影) #d7cbc8
    "mouth": (0.729, 0.584, 0.675),   # 口の中(あくび時) #ba95ac
    "edge": (0.451, 0.376, 0.447),    # 影・縁(ふちの滲み) #736072
}
# 「体の影」はgajiriの「毛(影)」と同じく、塗りのグラデーション欄であって
# 塗り分ける領域ではない(実機のトゥーン照明が陰影を作るため)。未使用のまま
# 値だけ記録しておく(handbook該当なし。gajiri-remake.mdのfur_shadeと同じ扱い)。

AKUBI_SPOTS = [
    # (x, y, z, radius)。前後・左右非対称の小さな色面パッチを数個(頬・肩・
    # 腰・尾の付け根)。xは正側のみ書き、bake側でabsを取って両側に効かせる。
    # 実測: 半径0.012〜0.013は体長0.14mに対して大きすぎ、はっきりした
    # 円形の水玉に見えた。設定画は輪郭の柔らかい小さな斑点なので半分ほどに絞る
    (0.022, -0.040, 0.104, 0.007),
    (0.030, -0.006, 0.062, 0.007),
    (0.034, 0.024, 0.036, 0.006),
    (0.014, 0.048, 0.030, 0.005),
    (0.026, -0.020, 0.084, 0.005),
    (0.020, 0.010, 0.050, 0.005),
]
# 体形修正でおなかの膨らみ(下記belly_bulge)を半径0.020→0.032へ
# 拡大した際にここを更新し忘れており、塗り分けの楕円体が実際の
# 膨らみより小さく・ずれていた(実機でおなかの淡色がほぼ見えなかった)。
# 膨らみの実寸に合わせ直す
AKUBI_BELLY_CENTER = Vector((0.0, -0.014, 0.022))
AKUBI_BELLY_RADII = Vector((0.032, 0.030, 0.030))


def _akubi_scale_bands(n_rows, count_base, z_lo=-0.92, z_hi=0.90):
    """
    球のほぼ全周(z_lo〜z_hi)を隙間なく覆う緯度の輪を自動生成する。
    「鱗が少なすぎる。敷き詰められて初めて皮になる」との指摘を受け、
    一部だけを覆う手置きのbandsから、極付近まで密に覆う自動生成へ
    変えた。輪の半径(ring)に比例して1周あたりの数を減らし、極に
    近づくほど鱗が重なりすぎないようにする
    """
    bands = []
    for i in range(n_rows):
        z = z_lo + (z_hi - z_lo) * i / max(1, n_rows - 1)
        ring = math.sqrt(max(0.0, 1.0 - z * z))
        count = max(4, round(count_base * ring))
        bands.append((z, count))
    return bands


def _akubi_scale_sphere_anchors(center, radius, bands, size_mul=1.0):
    """球面へ鱗の「置き場」だけを敷き詰める(実体は作らない)。
    戻り値は(位置, 濃淡を測る半径)のリスト。bake_albedo側で最寄りの
    置き場との距離を陰影に変換し、鱗が重なって盛り上がっているように
    塗る(下のC.bounds/pin等は一切使わない、純粋なPython計算)。"""
    anchors = []
    for r, (zdir, count) in enumerate(bands):
        ring = math.sqrt(max(0.0, 1.0 - zdir * zdir))
        stagger = 0.5 if r % 2 else 0.0
        for j in range(count):
            ang = (j + stagger) * math.tau / count
            d = Vector((math.cos(ang) * ring, math.sin(ang) * ring, zdir))
            pos = center + d * radius
            size = radius * 0.34 * size_mul
            anchors.append((pos, size))
    return anchors


def _akubi_scale_tube_anchors(p0, p1, radius0, radius1, rings=3, size_mul=1.0):
    """尾・脚のような細長い部位向け。軸に沿って輪切りにし、各輪の
    周方向へ鱗の置き場を並べる(千鳥格子)。_akubi_scale_sphere_anchors
    と同じく位置と濃淡半径だけを返す。"""
    anchors = []
    for k in range(rings):
        t = (k + 0.5) / rings
        center = p0.lerp(p1, t)
        radius = radius0 + (radius1 - radius0) * t
        count = max(6, round(radius / 0.0016))
        stagger = 0.5 if k % 2 else 0.0
        for i in range(count):
            ang = (i + stagger) * math.tau / count
            d = Vector((math.cos(ang), math.sin(ang), 0.15)).normalized()
            pos = center + d * radius
            size = max(0.0028, radius * 0.60) * size_mul
            anchors.append((pos, size))
    return anchors


def _akubi_scale_groups():
    """
    鱗の置き場を領域(腰・中背・肩・尾の各関節・四肢の各区間)ごとに
    まとめて返す: list[(領域の中心, 領域の半径, [(位置, 濃淡半径), ...])]。

    以前はここで鱗1枚1枚を実体のメッシュ(join+pin_weight_to_bone)
    として作り、sculpt_mergeの外に「服」として着せていた。しかし実機の
    ターンテーブルで確認すると、鱗ごとに独立したメッシュの縁を輪郭線
    シェーダーが拾ってしまい、肌ではなく「毛玉」のようなノイズに
    見えることが分かった(plan/models/akubitokage-remake.md追記)。
    鱗を実体にするのをやめ、位置を決める格子のロジックだけ流用して
    bake_albedoの濃淡(重なって少し盛り上がっているように見える陰影)
    で表現する方式に戻す。実体を作らないので、床の下へ潜る心配も無い
    (以前ここにあったfloor_zの間引きは不要になった)。

    顔(頭・鼻先)は今回も対象外(半目・鼻の穴・口の線というテクスチャの
    模様を鱗の濃淡が邪魔するのを避ける。「顔は作り込みすぎない」指摘とも
    整合)。
    """
    groups = []

    hip = Vector(AKUBI_HALF["hip"])
    hip_r = AKUBI_SCULPT_R["hip"]
    groups.append((hip, hip_r, _akubi_scale_sphere_anchors(hip, hip_r, _akubi_scale_bands(13, 15))))

    mx, my, mz, mr = AKUBI_MIDBACK
    mid = Vector((mx, my, mz))
    groups.append((mid, mr, _akubi_scale_sphere_anchors(mid, mr, _akubi_scale_bands(11, 14))))

    chest = Vector(AKUBI_HALF["chest"])
    chest_r = AKUBI_SCULPT_R["chest"]
    groups.append((chest, chest_r,
                   _akubi_scale_sphere_anchors(chest, chest_r, _akubi_scale_bands(10, 13), size_mul=0.92)))

    # 尾は関節ごとに輪切り(緯度の輪ではなく、細長い尾の周方向に均等割り)
    tail_specs = [
        (hip, 0.036), (Vector(AKUBI_HALF["tail1"]), 0.026),
        (Vector(AKUBI_HALF["tail2"]), 0.018), (Vector(AKUBI_HALF["tail3"]), 0.011),
        (Vector(AKUBI_HALF["tail4"]), 0.007),
    ]
    for center, radius in tail_specs:
        groups.append((center, radius,
                       _akubi_scale_tube_anchors(center, center, radius, radius, rings=1)))

    # 四肢(左右)。curve_tubeの3制御点(付け根→ひざ→足、build_akubitokage
    # 本体の脚と同じ形)をそのまま輪切りの軸に使う
    def mirror_x(key, side):
        x, y, z = AKUBI_HALF[key]
        return Vector((x * side, y, z))

    for side in (-1.0, 1.0):
        lf = mirror_x("legF.L", side)
        ff = mirror_x("footF.L", side)
        knee_f = Vector((lf.x * 1.28, (lf.y + ff.y) / 2 - 0.004, (lf.z + ff.z) / 2))
        groups.append((lf.lerp(knee_f, 0.5), 0.020,
                       _akubi_scale_tube_anchors(lf, knee_f, 0.021, 0.018, rings=2)))
        groups.append((knee_f.lerp(ff, 0.5), 0.016,
                       _akubi_scale_tube_anchors(knee_f, ff, 0.018, 0.013, rings=2)))

        lb = mirror_x("legB.L", side)
        fb = mirror_x("footB.L", side)
        knee_b = Vector((lb.x * 1.30, (lb.y + fb.y) / 2 - 0.004, (lb.z + fb.z) / 2))
        groups.append((lb.lerp(knee_b, 0.5), 0.024,
                       _akubi_scale_tube_anchors(lb, knee_b, 0.024, 0.020, rings=2)))
        groups.append((knee_b.lerp(fb, 0.5), 0.019,
                       _akubi_scale_tube_anchors(knee_b, fb, 0.020, 0.015, rings=2)))

    return groups


def _akubi_scale_shade(p, groups):
    """
    pに最も近い鱗の置き場を探し、そこからの距離を「重なって少し
    盛り上がっている」濃淡(1.0前後の乗算係数)に変換する。

    まず領域(中心・半径)でどこに属するかを安く絞り込み(全アンカーを
    毎テクセル舐めると遅すぎる)、その領域内だけで最寄りの置き場を探す。
    顔などどの領域からも遠い点は1.0(無地)を返す。
    """
    best_group = None
    best_score = None
    for center, radius, anchors in groups:
        score = abs((p - center).length - radius)
        if best_score is None or score < best_score:
            best_score = score
            best_group = anchors
    if best_group is None or best_score > 0.03:
        return 1.0
    nearest_d = None
    nearest_size = 1.0
    for pos, size in best_group:
        d = (p - pos).length
        if nearest_d is None or d < nearest_d:
            nearest_d = d
            nearest_size = size
    t = nearest_d / nearest_size
    if t > 1.05:
        return 1.0
    if t > 0.78:
        # 鱗どうしの継ぎ目(重なりの縁)。falloffを付けて硬い線にしない。
        # 実機の滑らかな法線補間で埋もれないよう、平坦な塗りより
        # かなり強めのコントラストを付ける
        return 0.58 + 0.10 * min(1.0, (1.05 - t) / 0.27)
    # 鱗本体。中心がいちばん明るく、縁へ向けて沈む(盛り上がって見える)
    return 0.96 + 0.36 * (1.0 - t)


def build_akubitokage():
    """
    新しい設定画(plan/models/reference-akubitokage-sheet.png、ユーザー提供)
    に合わせた造形。仕様と実測値は plan/models/akubitokage-remake.md。

    - garudo/tsubuteと同じ「手で置いた球+管をsculpt_mergeで彫刻式に
      融合→bake_albedoでテクスチャに模様を描く」手順に沿う(build_skinned
      によるSkin+Subsurfの管ではない。上のAKUBI_HALFのコメント参照)。
    - **四つ足のトカゲ+渦を巻く尾**。腰・肩・頭・鼻先の4球を大きく重ねて
      設定画どおりの「首の無い、腰から頭まで連続したS字」を作り、
      前後の脚・尾はcurve_tube(gajiriの尾と同じ、数点の制御点で
      曲がりながら先細る管)を生やして同じボクセルで融合する。
    - 完全に滑らかにはしない。腹に小さな膨らみを1つ足し、頭・胸・腹・
      尾の付け根に量感の変化を残す(なめらかにしすぎると「紫色の
      ソーセージ」になるという指摘。全部同じ丸みにしない)。
    - 背の波形の背びれは、Y方向(体軸沿い)へ伸ばした扁平な球を並べ、
      「△△△△(独立した棘)」ではなく「〜∿〜(体表のうねり)」に
      見せる。高さは頭側→中央でいちばん高く→尾側で消える山なりにし、
      間隔もそろえすぎない。
    - 下あご(jaw)は骨だけ持ち、肉付けはしない。静止姿勢では口内色の
      板(mouth decal)がjawに重なって隠れ、attackでjawが大きく後方
      回転すると一緒に振れて口内色が覗く(見た目の「あくび」)。
    - 目・鼻の穴・口の線は幾何ではなく**テクスチャに描く**
      (tsubuteの口の折れ線・鼻の穴と同じ、bake_albedoの位置関数)。
      半目の眠そうな線は、起きているのか寝ているのか分からない
      くらい細く、頭の球面へ投影した短い折れ線として塗る。
    - 体表の細かい鱗は、実体ジオメトリ→撤回→「服」として実体を
      復活、と何度か往復した末に**塗り**へ戻した(下記参照)。最終的に
      鱗はakubi_color内で`_akubi_scale_shade`により濃淡として焼く。
    - 鱗を実体にした版(顔以外ほぼ全身、三角形36,540)は、実機の
      ターンテーブルで確認すると輪郭線シェーダーが鱗1枚1枚の縁を
      拾ってしまい、肌ではなく「毛玉」のようなノイズに見えた
      (個別メッシュの島がそれぞれ独立したシルエットを持つため)。
      「鱗の模様は丁寧に描いたテクスチャでも良い」との指摘を受け、
      鱗の置き場を決める格子(緯度の輪+千鳥格子)はそのまま流用し、
      実体を作らずbake_albedoの濃淡(最寄りの置き場との距離を
      「重なって少し盛り上がっている」陰影に変換)で表現する方式に
      戻した。実体が無いので輪郭線に拾われず、三角形数も本体だけの
      軽い値に戻る。
    """
    joints = C.mirrored(AKUBI_HALF)
    bones = C.mirrored_bones(AKUBI_BONES_HALF)

    parts = []

    def sph(name, key, scale=(1.0, 1.0, 1.0), segs=16, rings=12):
        x, y, z = AKUBI_HALF[key]
        obj = C.uv_sphere(name, (x, y, z), AKUBI_SCULPT_R[key],
                          segments=segs, rings=rings, scale=scale)
        parts.append(obj)
        return obj

    sph("akubi_hip", "hip", scale=(1.0, 1.0, 0.94))
    mx, my, mz, mr = AKUBI_MIDBACK
    parts.append(C.uv_sphere("akubi_midback", (mx, my, mz), mr, segments=16, rings=12))
    sph("akubi_chest", "chest", scale=(1.0, 1.0, 0.96))
    sph("akubi_head", "head", scale=(1.0, 1.05, 0.98))
    sph("akubi_snout", "snout", scale=(1.0, 1.2, 0.82))

    def mirror_x(key, side):
        x, y, z = AKUBI_HALF[key]
        return Vector((x * side, y, z))

    for side in (-1.0, 1.0):
        # 3点(付け根→ひざ→足)にして、2点のみのAUTOハンドルが外側へ
        # 膨らむ(実測: 前脚が肩から上へ伸びる腕のように見えた)のを防ぐ。
        # 設定画はカエルのように**がに股で座り、ひざが外側へ張り出して**
        # おなかを両脇から抱える構図(正面図で脚が胴とほぼ同じ幅を作る)。
        # ひざの中間点をそのまま結ぶだけでは細い棒にしかならなかったので、
        # 外側(x)へさらに張り出し、半径も頭・胴に見劣りしない太さにした
        lf = mirror_x("legF.L", side)
        ff = mirror_x("footF.L", side)
        knee_f = Vector((lf.x * 1.28, (lf.y + ff.y) / 2 - 0.004, (lf.z + ff.z) / 2))
        parts.append(C.curve_tube(f"akubi_legF{side}", [lf, knee_f, ff], [0.021, 0.018, 0.013]))
        lb = mirror_x("legB.L", side)
        fb = mirror_x("footB.L", side)
        knee_b = Vector((lb.x * 1.30, (lb.y + fb.y) / 2 - 0.004, (lb.z + fb.z) / 2))
        parts.append(C.curve_tube(f"akubi_legB{side}", [lb, knee_b, fb], [0.024, 0.020, 0.015]))

    # 尾: 関節そのものが渦を描く制御点(付け根の骨と同じ位置を使うので、
    # 融合後の自動ウェイトも渦に沿ってなめらかに割り振られる)。
    # 「太い→緩く細くなる→大きくカーブ→最後だけ煙のように巻く」の
    # 大中小のリズムを、半径の縮み方も角度の刻みも不揃いにして作る
    # (数学的にきれいな渦にしない。AKUBI_HALFのtail1〜5自体も
    # 均一な等角螺旋ではなく手で置いた非対称な弧にしてある)
    tail_pts = [Vector(AKUBI_HALF[k]) for k in ("hip", "tail1", "tail2", "tail3", "tail4", "tail5")]
    parts.append(C.curve_tube("akubi_tail", tail_pts,
                              [0.038, 0.028, 0.019, 0.012, 0.006, 0.0016]))

    # 背の波形の背びれ。Y方向(体軸沿い)へ伸ばした扁平な球を並べ、
    # 独立した棘(△△△△)ではなく体表のうねり(〜∿〜)に見せる。
    # 高さは頭側→中央でいちばん高く→尾側で消える山なりにし、間隔も
    # そろえない(設定画には角のある部品が無いため、silhouette-hard-
    # surface-parts.mdの「最低1つ」は今回見送る)
    for i, (y, z, r) in enumerate([
        (-0.026, 0.108, 0.014), (-0.010, 0.102, 0.020), (0.006, 0.096, 0.024),
        (0.022, 0.084, 0.019), (0.036, 0.070, 0.013), (0.048, 0.056, 0.007),
    ]):
        parts.append(C.uv_sphere(f"akubi_frill{i}", (0.0, y, z), r,
                                 segments=12, rings=8, scale=(0.68, 1.7, 0.42)))

    # 腹の膨らみ。設定画の正面図は、両脇のがに股の脚に抱えられた大きな
    # 丸いおなかが胴の下半分の主役になっている。旧値(半径0.020)は
    # 胴(半径0.043〜0.048)に対して控えめすぎ、実機で「小さなくぼみ」
    # にしか見えなかったため、胴と張り合うところまで大きくした
    # (「紫色のソーセージ」にしないための量感の変化でもある)
    parts.append(C.uv_sphere("akubi_belly_bulge",
                             (0.0, AKUBI_BELLY_CENTER.y, AKUBI_BELLY_CENTER.z - 0.006),
                             0.032, segments=14, rings=10, scale=(0.95, 0.85, 0.8)))

    # 入力は自己交差の無い閉じたプリミティブ(球・curve_tube)だけなので
    # clean_input=Trueで近道する。既定Falseの前段SMOOTHリメッシュは
    # 「交差しているだけで未融合」と判定した大きめの部品を削ることがあり、
    # 実測で鼻先の付け根に不自然な穴(凹み)ができた。
    # あくびとかげは主人公ではなく三角形予算も1,200〜5,000(plan/models/
    # akubitokage-remake.md)なので、鱗ジオメトリのために引き上げていた
    # voxel/target_trisは元の解像度へ戻す
    body = C.sculpt_merge("akubitokage", parts, voxel=0.0026, target_tris=4200,
                          clean_input=True)
    C.decimate_to(body, 4200)
    C.organic_uv(body)
    # 底を平らに均して、床に乗っている感じを出す(purun/gajiriと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.010:
            vert.co.z = 0.010 - (0.010 - vert.co.z) * 0.25

    # ---- 模様はテクスチャに描く(tsubuteと同じ手法) ----
    head_c = Vector(AKUBI_HALF["head"])
    head_r = AKUBI_SCULPT_R["head"]

    def on_head(p):
        return head_c + (p - head_c).normalized() * head_r

    # 半目の眠そうな線。頭の中心からの相対オフセットで置き(頭の位置を
    # 動かしても追従する)、頭の球面に投影した3点の折れ線を、まぶたの縁
    # ぶんだけ厚みを持たせて塗る(tsubuteの口の折れ線と同じ手法)
    eye_raw = [head_c + Vector((0.014, -0.010, 0.018)),
               head_c + Vector((0.026, -0.020, 0.020)),
               head_c + Vector((0.036, -0.012, 0.014))]
    eye_pts = [on_head(p) for p in eye_raw]
    # 口(閉じた線)。頭ではなく鼻先寄りなので鼻先の中心へ投影する
    snout_c = Vector(AKUBI_HALF["snout"])
    snout_r = AKUBI_SCULPT_R["snout"]

    def on_snout(p):
        return snout_c + (p - snout_c).normalized() * snout_r

    mouth_raw = [snout_c + Vector((-0.014, -0.008, -0.006)),
                 snout_c + Vector((0.0, -0.012, -0.008)),
                 snout_c + Vector((0.014, -0.008, -0.006))]
    mouth_pts = [on_snout(p) for p in mouth_raw]
    nostril_pts = [on_snout(snout_c + Vector((0.007 * side, -0.014, 0.004)))
                  for side in (-1.0, 1.0)]

    def seg_dist(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        return (p - (a + ab * t)).length

    dark = (0.10, 0.08, 0.10)
    main_c, spot_c, belly_c, edge_c = (AKUBI_SHEET["main"], AKUBI_SHEET["spot"],
                                       AKUBI_SHEET["belly"], AKUBI_SHEET["edge"])
    tail_tip = Vector(AKUBI_HALF["tail5"])

    # 鱗は実体ではなく塗りで表現する(下の_akubi_scale_shade参照。
    # 実体だと輪郭線シェーダーが鱗ごとの縁を拾ってノイズになった)。
    # 位置を決める格子だけ計算しておき、akubi_color側で濃淡に変える
    scale_groups = _akubi_scale_groups()

    def akubi_color(p, n):
        x, y, z = p.x, p.y, p.z
        q = Vector((abs(x), y, z))
        # 半目は「起きているのか寝ているのか分からない」くらい細く
        # (実測0.005幅は普通の目に見えたので0.0028まで絞った)
        ed = min(seg_dist(q, a, b) for a, b in zip(eye_pts, eye_pts[1:]))
        if ed < 0.0028 and n.y < -0.2:
            return dark
        md = min(seg_dist(p, a, b) for a, b in zip(mouth_pts, mouth_pts[1:]))
        if md < 0.004 and n.y < -0.3:
            return dark
        for npt in nostril_pts:
            if (p - npt).length < 0.0028:
                return dark
        if (p - tail_tip).length < 0.018:
            return edge_c
        d = Vector(((x - AKUBI_BELLY_CENTER.x) / AKUBI_BELLY_RADII.x,
                    (y - AKUBI_BELLY_CENTER.y) / AKUBI_BELLY_RADII.y,
                    (z - AKUBI_BELLY_CENTER.z) / AKUBI_BELLY_RADII.z))
        if d.length < 1.0 and n.y < -0.15:
            base = belly_c
        else:
            base = main_c
            for sx, sy, sz, sr in AKUBI_SPOTS:
                if (q - Vector((sx, sy, sz))).length < sr:
                    base = spot_c
                    break
        k = _akubi_scale_shade(p, scale_groups)
        if k >= 1.0:
            # おなかのような明るい地色は単純な乗算だと白飛びして
            # のっぺりした光沢に見えるため、白へ寄せる合成にする
            f = (k - 1.0) * 0.75
            return tuple(min(1.0, c + (1.0 - c) * f) for c in base)
        return tuple(max(0.0, c * k) for c in base)

    albedo = C.bake_albedo(body, akubi_color, size=384, name="akubi_skin")
    C.assign_material(body, C.make_textured_material("akubi_skin_m", albedo, roughness=0.6))

    extras = []
    pinned = []

    def add(obj, mat, pin_bone=None):
        C.assign_material(obj, mat)
        if pin_bone:
            group = C.mark_for_pin(obj)
            pinned.append((group, pin_bone))
        extras.append(obj)
        return obj

    # 口内(あくび時に覗く面)。静止姿勢ではjaw関節とほぼ重なって
    # 頭の皮に埋もれ、attackでjawが後方回転すると一緒に振れて露出する
    jx, jy, jz = AKUBI_HALF["jaw"]
    mouth = C.uv_sphere("akubi_mouth", (0.0, jy, jz), 0.006,
                        segments=14, rings=10, scale=(0.9, 0.6, 0.5))
    add(mouth, C.make_material("akubi_mouth_m", AKUBI_SHEET["mouth"], roughness=0.4),
        pin_bone="snout-jaw")

    # あくびの煙。頭の脇に小さな淡紫の房を2つ浮かせる(kinokootokoの
    # 胞子と同じ、primitiveを貼るだけの安全な手法)
    smoke_mat = C.make_material("akubi_smoke", (0.75, 0.70, 0.82), roughness=0.5, emission=0.15)
    for i, (x, y, z, r) in enumerate([(0.056, -0.024, 0.118, 0.014), (0.048, 0.006, 0.132, 0.010)]):
        smoke = C.uv_sphere(f"akubi_smoke{i}", (x, y, z), r, segments=10, rings=8)
        add(smoke, smoke_mat, pin_bone="chest-head")

    mesh = C.join([body] + extras, "akubitokage")
    armature = C.build_armature("akubitokage", joints, bones, mesh, root="hip")
    for group, bone in pinned:
        C.pin_weight_to_bone(mesh, group, bone)
    _akubitokage_check(mesh)
    return [mesh, armature], armature


def _akubitokage_check(mesh) -> None:
    """設定画の見積もりと合っているかをビルド時に確かめる(handbook 1-16)。"""
    lo, hi = C.bounds([mesh])
    height, width, depth = hi.z - lo.z, hi.x - lo.x, hi.y - lo.y
    print(f"[akubitokage] 高さ {height:.3f}m 幅 {width:.3f}m 奥行き {depth:.3f}m "
          f"(見積もり高さ {AKUBI_HEIGHT:.3f})")
    assert abs(height - AKUBI_HEIGHT) < 0.010, height
    print(f"[akubitokage] 三角形 {C.tri_count([mesh])}")


def akubitokage_animations():
    """
    plan/models/akubitokage-remake.mdの状態対応(通常/あくび/驚く/逃げ出す)
    と、plan/game/archive/animation-quality-guidelines.mdの規約(タメ・ツメの
    LINEAR補間、二次揺れ)に沿う。coward種族なので振りは小さく、フレーム
    間隔も詰めたまま(素早さは維持)。
    """
    trunk = "hip-chest"
    headb = "chest-head"
    jaw = "snout-jaw"
    legF_L, legF_R = "chest-legF.L", "chest-legF.R"
    legB_L, legB_R = "hip-legB.L", "hip-legB.R"
    t1 = "hip-tail1"
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 通常(うたたね): 浅い呼吸+尾の先のゆらぎ。ときどき首だけ
        # 「きょろきょろ」動かす
        ("idle", [
            (1, {trunk: neutral, headb: (0, 0, 0), t1: (0, 0, 0)}),
            (14, {trunk: {"scale": (1.04, 0.94, 1.04)}}),
            (16, {t1: (0, 0, 10)}, {"partial": True}),
            (28, {trunk: neutral}),
            (30, {t1: (0, 0, -6)}, {"partial": True}),
            (40, {headb: (0, 14, 0)}),
            (52, {headb: (0, -10, 0)}),
            (64, {headb: (0, 0, 0), t1: (0, 0, 0)}),
        ]),
        # 逃げ出す: coward AIの俊敏さそのまま、跳ねるように駆け足を刻む
        ("walk", [
            (1, {trunk: {"scale": (1.10, 0.86, 1.10), "rot": (10, 0, 0)},
                 legF_L: (24, 0, 0), legF_R: (-24, 0, 0),
                 legB_L: (-20, 0, 0), legB_R: (20, 0, 0)}),
            (4, {trunk: {"scale": (0.88, 1.18, 0.88), "loc": (0, AKUBI_HEIGHT * 0.10, 0)},
                 legF_L: (-24, 0, 0), legF_R: (24, 0, 0),
                 legB_L: (20, 0, 0), legB_R: (-20, 0, 0)}),
            (7, {trunk: {"scale": (1.10, 0.86, 1.10), "rot": (10, 0, 0)},
                 legF_L: (24, 0, 0), legF_R: (-24, 0, 0),
                 legB_L: (-20, 0, 0), legB_R: (20, 0, 0)}),
            (10, {trunk: {"scale": (0.88, 1.18, 0.88), "loc": (0, AKUBI_HEIGHT * 0.10, 0)},
                  legF_L: (-24, 0, 0), legF_R: (24, 0, 0),
                  legB_L: (20, 0, 0), legB_R: (-20, 0, 0)}),
        ]),
        # あくびをする: 実質的な妨害行動なし(coward)。タメ→大きく口を
        # 開け(jawが後方回転して口内色が覗く)→ゆっくり閉じる
        ("attack", [
            (1, {headb: (0, 0, 0), jaw: (0, 0, 0)}),
            (5, {headb: (-14, 0, 0), jaw: (6, 0, 0)}, {"interp": "LINEAR"}),
            (9, {headb: (22, 0, 0), jaw: (-52, 0, 0)}),
            (20, {headb: (26, 0, 0), jaw: (-60, 0, 0)}),
            (32, {headb: (4, 0, 0), jaw: (-8, 0, 0)}),
            (40, {headb: (0, 0, 0), jaw: (0, 0, 0)}),
        ]),
        # 驚く(!): 鋭く(LINEAR)後ろへ縮み、尾がびくっと跳ねる
        ("hit", [
            (1, {trunk: neutral, t1: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {trunk: {"scale": (1.24, 0.68, 1.24), "loc": (0, -AKUBI_HEIGHT * 0.06, 0)},
                 t1: (0, 0, 26)}),
            (14, {trunk: neutral, t1: (0, 0, 0)}),
        ]),
        # 影が薄れるように低く崩れて消える
        ("die", [
            (1, {trunk: neutral}, {"interp": "LINEAR"}),
            (10, {trunk: {"scale": (1.3, 0.5, 1.3)}}),
            (24, {trunk: {"scale": (1.45, 0.05, 1.45)}}),
        ]),
    ]


# =================================================================== ガジリねずみ

# 設定画(design/characters/gajiri/generated/gajiri-sheet.png)の三面図の実測値。
# 計測の手順と生の数字は plan/models/gajiri-remake.md。1px ≈ 0.603mm。
GAJIRI_HEIGHT = 0.120         # 耳の上端〜接地(設定画「約12cm」・正面図199px)
GAJIRI_HALF_W = 0.0377        # 体の最大半幅(正面図125px、上から80%)
GAJIRI_EAR_R = 0.0235         # 耳の半径(外径 76〜81px ≈ 0.047)
GAJIRI_EAR_C = (0.0265, 0.000, 0.094)   # 耳の中心(x, 奥行きy, 高さz)。側面図で頭の後ろ半分
GAJIRI_EYE_C = (0.0163, -0.0555, 0.067)  # 目の中心。正面図 x=±27px、上から44%。頭の表面に載せる
GAJIRI_EYE_R = 0.0060   # 正面図 15×23px ≈ 9×14mm
GAJIRI_HEAD_C = (0.0, -0.030, 0.066)    # 頭の中心。幅0.060(正面図99px)、鼻先 y=-0.060
GAJIRI_HEAD_R = 0.031
GAJIRI_NUT_C = (0.0, -0.046, 0.0365)    # 木の実(正面図 34×32px)
GAJIRI_NUT_R = 0.0100

# カラーパレット欄の実測。実際に使う色は _gajiri_albedo() を通す
GAJIRI_SHEET = {
    "fur": (0.580, 0.533, 0.557),        # 毛(メイン) #94888e
    "fur_shade": (0.498, 0.459, 0.494),  # 毛(影) #7f757e
    "pink": (0.855, 0.741, 0.671),       # お腹・手足・耳の内側 #dabdab
    "eye": (0.184, 0.180, 0.176),        # 目 #2f2e2d
    "whisker": (0.929, 0.890, 0.835),    # ひげ #ede3d5
    "tail": (0.824, 0.608, 0.580),       # しっぽ #d29b94
    "nut": (0.36, 0.27, 0.20),           # 木の実(正面図の実測、暗い茶)
}
# ダンジョンの暖色照明(松明 #ffd2a6)で、ほぼ無彩色の灰紫は**赤みを帯びる**。
# 実機のターンテーブルで測ると、設定画の #94888e をそのまま焼いた毛が
# #a0848e(R+12・G-4)に写った。無彩色に近い色は彩度を上下しても赤みが
# 消えないので(1.6→0.95で #a1848f→#a0848e)、赤を引き緑を足す
# オフセットで先回りする(handbook 1-26)。
GAJIRI_FUR_OFFSET = (-0.047, 0.016, 0.0)


def _gajiri_albedo(color, offset=GAJIRI_FUR_OFFSET):
    return tuple(min(1.0, max(0.0, c + o)) for c, o in zip(color, offset))


GAJIRI_HALF = {
    # 設定画準拠の「座って前足で木の実を抱える」姿勢。baseが腰(接地側)、
    # chestが胸、headが頭、snoutが鼻先。前足(pawF)は胸の前。尻尾は
    # 右側へ流れて丸まる(非対称、.L無しの関節はmirroredでそのまま残る)
    "base": (0.0, 0.012, 0.030),
    "chest": (0.0, -0.012, 0.056),
    "head": (0.0, -0.030, 0.076),
    "snout": (0.0, -0.058, 0.055),
    "ear.L": (0.0265, 0.000, 0.104),
    "pawF.L": (0.011, -0.046, 0.039),
    "tail1": (0.0, 0.052, 0.018),
    "tail2": (0.030, 0.062, 0.010),
    "tail3": (0.052, 0.036, 0.008),
}
GAJIRI_BONES_HALF = [
    ("base", "chest"), ("chest", "head"), ("head", "snout"),
    ("head", "ear.L"), ("chest", "pawF.L"),
    ("base", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
]


def build_gajiri():
    """
    新しい設定画(design/characters/gajiri/generated/gajiri-sheet.png、
    ユーザー提供)に合わせた造形。仕様と実測値は plan/models/gajiri-remake.md。

    - **約12cm**。実機では約19pxなので、効くのは「丸い耳2枚のシルエット」
      「灰紫の毛と腹のピンクの色面」「長い尻尾」。造形の投資はそこに寄せ、
      ひげ・目の光の粒は近接用。
    - 座って前足で**木の実**を抱える姿勢。頭が前に出て、大きな丸い耳は
      頭の後ろ半分に載る(側面図)。
    - 耳は薄い円盤+内側のピンクの円盤を**形として**作る。sculpt_merge は
      薄い板を消す(handbook 3-19)ので join のまま。
    - 色は設定画のパレットを暖色照明向けに彩度補正して使う(handbook 1-26)。
    """
    fur = C.make_material("gajiri_fur", _gajiri_albedo(GAJIRI_SHEET["fur"]), roughness=0.85)
    pink = C.make_material("gajiri_pink", GAJIRI_SHEET["pink"],
                           roughness=0.75)
    eye_black = C.make_material("gajiri_eye", GAJIRI_SHEET["eye"], roughness=0.10)
    gleam_mat = C.make_material("gajiri_gleam", (0.97, 0.96, 0.94), roughness=0.3)
    nut_mat = C.make_material("gajiri_nut", GAJIRI_SHEET["nut"], roughness=0.9)
    tail_mat = C.make_material("gajiri_tail", GAJIRI_SHEET["tail"],
                               roughness=0.7)

    parts = []
    pinned = []

    def add(obj, mat, pin_bone=None):
        C.assign_material(obj, mat)
        if pin_bone:
            C.mark_for_pin(obj)
            pinned.append((obj.name, pin_bone))
        parts.append(obj)
        return obj

    # 胴: 正面図の幅プロファイル(上から50〜90%)をそのままリングに。
    # 上へ行くほど後ろ(+y)へ寄せ、丸い背中と低い胸を作る
    add(C.loft("gajiri", [
        (0.002, 0.0300, 0.040, 0.0, 0.008),
        (0.012, 0.0356, 0.047, 0.0, 0.006),
        (0.024, 0.0377, 0.049, 0.0, 0.005),
        (0.036, 0.0368, 0.047, 0.0, 0.006),
        (0.048, 0.0356, 0.043, 0.0, 0.008),
        (0.060, 0.0330, 0.037, 0.0, 0.012),
        (0.072, 0.0240, 0.027, 0.0, 0.016),
        (0.080, 0.0100, 0.012, 0.0, 0.018),
    ], segments=20), fur)

    # 頭(体の前上に埋める)+鼻先の膨らみ
    head = C.uv_sphere("gajiri_head", GAJIRI_HEAD_C, GAJIRI_HEAD_R,
                       segments=18, rings=14, scale=(1.0, 1.06, 0.98))
    add(head, fur)
    muzzle = C.uv_sphere("gajiri_muzzle", (0.0, -0.047, 0.055), 0.0125,
                         segments=12, rings=9, scale=(1.0, 1.35, 0.80))
    add(muzzle, fur, pin_bone="head-snout")

    # 腹の淡いピンク(胸の前の楕円デカール。設定画では腹と手足がピンク)
    belly = C.uv_sphere("gajiri_belly", (0.0, -0.037, 0.028), 0.019,
                        segments=12, rings=9, scale=(1.0, 0.45, 1.15))
    add(belly, pink)

    # 耳: 大きな丸い薄い円盤+内側のピンクの円盤。設定画の直径は頭幅に匹敵し、
    # 側面図では頭の後ろ半分に載る。少し外へ・後ろへ傾ける
    for side in (-1.0, 1.0):
        bone = f"head-ear.{'L' if side > 0 else 'R'}"
        cx, cy, cz = GAJIRI_EAR_C
        # 原点に作ってから回し、最後に置く。中心を先に入れて回すと
        # 原点まわりに振れて耳ごと外へ飛ぶ(高さ0.104・幅0.152になった)
        tilt = (0.18, 0.30 * side, 0.0)
        ear = C.uv_sphere(f"gajiri_ear{side}", (0.0, 0.0, 0.0), GAJIRI_EAR_R,
                          segments=18, rings=12, scale=(1.0, 0.22, 1.08))
        ear.rotation_euler = tilt
        ear.location = (cx * side, cy, cz)
        add(ear, fur, pin_bone=bone)
        inner = C.uv_sphere(f"gajiri_earin{side}", (0.0, -0.0035, -0.002),
                            GAJIRI_EAR_R * 0.72, segments=14, rings=10, scale=(0.85, 0.16, 1.0))
        inner.rotation_euler = tilt
        inner.location = (cx * side, cy, cz)
        add(inner, pink, pin_bone=bone)

    # 目: つやのある黒い玉+白い光の粒(塗りの白点。発光させない)
    ex, ey, ez = GAJIRI_EYE_C
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"gajiri_eye{side}", (ex * side, ey, ez), GAJIRI_EYE_R,
                          segments=12, rings=9, scale=(0.95, 0.55, 1.15))
        add(eye, eye_black, pin_bone="chest-head")
        gleam = C.uv_sphere(f"gajiri_gleam{side}", (ex * side - 0.0020, ey - 0.0030, ez + 0.0030),
                            0.0016, segments=8, rings=6)
        add(gleam, gleam_mat, pin_bone="chest-head")

    # 鼻
    nose = C.uv_sphere("gajiri_nose", (0.0, -0.0635, 0.052), 0.0038,
                       segments=10, rings=8, scale=(1.1, 0.8, 0.9))
    add(nose, pink, pin_bone="head-snout")
    # ひげは作らない。半径0.5mmの棒に輪郭線のハル(0.012)が付くと24倍の
    # 黒い棒になって目を隠す(ターンテーブルで実測)。実機19pxでは見えない

    # 前足: 短い腕+ピンクの手。胸の前で木の実を抱える
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        arm = C.cylinder(f"gajiri_arm{tag}", (0.0, 0.0, 0.0), 0.0050, 0.020, segments=8)
        p0 = Vector((0.016 * side, -0.030, 0.046))
        p1 = Vector((0.011 * side, -0.046, 0.040))
        arm.rotation_euler = (p1 - p0).to_track_quat("Z", "Y").to_euler()
        arm.location = (p0 + p1) / 2
        add(arm, fur, pin_bone=f"chest-pawF.{tag}")
        paw = C.uv_sphere(f"gajiri_paw{tag}", (0.011 * side, -0.049, 0.039), 0.0060,
                          segments=10, rings=8, scale=(0.9, 1.0, 0.9))
        add(paw, pink, pin_bone=f"chest-pawF.{tag}")

    # 木の実(丸い)。左前足の骨に固定して抱えたまま動く
    nut = C.uv_sphere("gajiri_nut", GAJIRI_NUT_C, GAJIRI_NUT_R,
                      segments=12, rings=9, scale=(1.0, 0.9, 0.95))
    add(nut, nut_mat, pin_bone="chest-pawF.L")

    # 後ろ足のもも(たたんだハウンチ)とピンクの足先
    for side in (-1.0, 1.0):
        haunch = C.uv_sphere(f"gajiri_haunch{side}", (0.030 * side, 0.014, 0.024),
                             0.021, segments=12, rings=9, scale=(1.0, 1.15, 0.92))
        add(haunch, fur)   # 暗い材質にすると別の塊に見える(実測)
        foot = C.uv_sphere(f"gajiri_foot{side}", (0.024 * side, -0.040, 0.006), 0.0075,
                           segments=10, rings=8, scale=(0.9, 1.9, 0.55))
        add(foot, pink)

    # 尻尾: 尻の中央から出て右へ流れ、先で丸まる細いピンクの管
    tail = C.curve_tube("gajiri_tail",
                        [Vector((0.0, 0.050, 0.020)), Vector((0.028, 0.064, 0.011)),
                         Vector((0.052, 0.040, 0.008)), Vector((0.046, 0.012, 0.010))],
                        [0.0045, 0.0036, 0.0026, 0.0014])
    add(tail, tail_mat)

    joints = C.mirrored(GAJIRI_HALF)
    bones = C.mirrored_bones(GAJIRI_BONES_HALF)
    mesh = C.join(parts, "gajiri")
    _gajiri_check(mesh)
    armature = C.build_armature("gajiri", joints, bones, mesh, root="base")
    for group_name, bone in pinned:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature], armature


def _gajiri_check(mesh) -> None:
    """設定画の実測値と合っているかをビルド時に確かめる(handbook 1-16)。"""
    lo, hi = C.bounds([mesh])
    height, width, depth = hi.z - lo.z, hi.x - lo.x, hi.y - lo.y
    print(f"[gajiri] 高さ {height:.3f}m 幅 {width:.3f}m 奥行き {depth:.3f}m "
          f"(設定画 0.120 / 体0.075+耳 / 0.113+尻尾)")
    assert abs(height - GAJIRI_HEIGHT) < 0.004, height
    # 耳込みの幅(設定画の耳bbox 609〜775px = 0.100)。体幅0.075より外へ出て
    # シルエットの上2割を作る
    ear_span = 2 * (GAJIRI_EAR_C[0] + GAJIRI_EAR_R)
    print(f"[gajiri] 耳込みの幅 {ear_span:.3f}m(設定画 0.100)、目 x=±{GAJIRI_EYE_C[0]:.4f} z={GAJIRI_EYE_C[2]:.3f}")
    assert abs(ear_span - 0.100) < 0.006, ear_span
    assert abs(width - 0.100) < 0.008, width
    print(f"[gajiri] 三角形 {C.tri_count([mesh])}")


def gajiri_animations():
    """
    座りポーズ基準のクリップ。idleは呼吸+小さくかじる+耳の
    ひくつき、walkは前傾の跳ね、attackはかじりの連打、hitは
    のけぞり、dieは横倒れ。尻尾は二次揺れの遅延規約どおり
    胴より遅れて追従する。
    """
    trunk = "base-chest"
    headb = "chest-head"
    snout = "head-snout"
    earL, earR = "head-ear.L", "head-ear.R"
    pawL, pawR = "chest-pawF.L", "chest-pawF.R"
    t1, t2 = "base-tail1", "tail1-tail2"
    tail_len = (
        (Vector(GAJIRI_HALF["tail1"]) - Vector(GAJIRI_HALF["base"])).length
        + (Vector(GAJIRI_HALF["tail2"]) - Vector(GAJIRI_HALF["tail1"])).length
        + (Vector(GAJIRI_HALF["tail3"]) - Vector(GAJIRI_HALF["tail2"])).length
    )
    tail_delay = C.secondary_delay_frames(
        tail_len / (Vector(GAJIRI_HALF["chest"]) - Vector(GAJIRI_HALF["base"])).length
    )
    return [
        # 呼吸+ときどき小さくかじる+耳のひくつき。尻尾は遅れて揺れる
        ("idle", [
            (1, {trunk: {"scale": (1.0, 1.0, 1.0)}, snout: (0, 0, 0), t1: (0, 0, 0),
                 earL: (0, 0, 0), earR: (0, 0, 0)}),
            (8, {snout: (7, 0, 0)}),
            (11, {snout: (0, 0, 0)}),
            (14, {snout: (7, 0, 0)}),
            (17, {snout: (0, 0, 0)}),
            (24, {trunk: {"scale": (1.03, 1.03, 0.97)}}),
            (24 + tail_delay, {t1: (0, 0, 14)}, {"partial": True}),
            (34, {earL: (0, 0, 10)}),
            (38, {earL: (0, 0, 0)}),
            (48, {trunk: {"scale": (1.0, 1.0, 1.0)}}),
            (48 + tail_delay, {t1: (0, 0, 0)}, {"partial": True}),
        ]),
        # 前傾して小刻みに跳ねる(座りのまま急いで進む)
        ("walk", [
            (1, {trunk: {"rot": (14, 0, 0)}, t1: (0, 0, 10),
                 pawL: (16, 0, 0), pawR: (16, 0, 0)}),
            (5, {trunk: {"rot": (20, 0, 0), "loc": (0, GAJIRI_HEIGHT * 0.10, 0)}}),
            (10, {trunk: {"rot": (14, 0, 0), "loc": (0, 0, 0)}, t1: (0, 0, -10)}),
            (15, {trunk: {"rot": (20, 0, 0), "loc": (0, GAJIRI_HEIGHT * 0.10, 0)}}),
            (20, {trunk: {"rot": (14, 0, 0), "loc": (0, 0, 0)}, t1: (0, 0, 10)}),
        ]),
        # タメ(頭を引く)→ ツメ(LINEARで鋭くかじる連打)→ 戻り
        ("attack", [
            (1, {headb: (0, 0, 0), snout: (0, 0, 0)}),
            (4, {headb: (-10, 0, 0), snout: (-8, 0, 0)}, {"interp": "LINEAR"}),
            (6, {headb: (10, 0, 0), snout: (16, 0, 0)}),
            (8, {headb: (2, 0, 0), snout: (-6, 0, 0)}),
            (10, {headb: (10, 0, 0), snout: (16, 0, 0)}),
            (12, {headb: (2, 0, 0), snout: (-6, 0, 0)}),
            (18, {headb: (0, 0, 0), snout: (0, 0, 0)}),
        ]),
        # 鋭くのけぞり(LINEAR)、耳が後ろへ倒れ、ゆっくり戻る
        ("hit", [
            (1, {trunk: {"rot": (0, 0, 0)}, earL: (0, 0, 0), earR: (0, 0, 0)},
             {"interp": "LINEAR"}),
            (3, {trunk: {"rot": (-18, 0, 0)}, earL: (30, 0, 0), earR: (30, 0, 0),
                 t1: (0, 0, 22)}),
            (14, {trunk: {"rot": (0, 0, 0)}, earL: (0, 0, 0), earR: (0, 0, 0),
                  t1: (0, 0, 0)}),
        ]),
        # 横へ倒れて動かなくなる
        ("die", [
            (1, {trunk: {"rot": (0, 0, 0)}}, {"interp": "LINEAR"}),
            (8, {trunk: {"rot": (-12, 40, 0)}, earL: (18, 0, 0), earR: (18, 0, 0)}),
            (20, {trunk: {"rot": (-6, 86, 0), "loc": (0, 0, -GAJIRI_HEIGHT * 0.07)},
                  snout: (10, 0, 0), t1: (0, 0, 34)}),
            (24, {trunk: {"rot": (-6, 80, 0), "loc": (0, 0, -GAJIRI_HEIGHT * 0.06)},
                  t1: (0, 0, 30)}),
        ]),
    ]


# ===================================================================== まぶたむし

MABUTAMUSHI_HALF = {
    "body": (0.0, 0.020, 0.075),
    "head": (0.0, -0.098, 0.058),
    "legF.L": (0.075, -0.020, 0.045),
    "footF.L": (0.128, -0.052, 0.006),
    "legB.L": (0.078, 0.078, 0.050),
    "footB.L": (0.132, 0.110, 0.006),
}
MABUTAMUSHI_RADII_HALF = {
    "body": 0.085, "head": 0.040,
    "legF.L": 0.022, "footF.L": 0.015,
    "legB.L": 0.024, "footB.L": 0.016,
}
MABUTAMUSHI_BONES_HALF = [
    ("body", "head"),
    ("body", "legF.L"), ("legF.L", "footF.L"),
    ("body", "legB.L"), ("legB.L", "footB.L"),
]


def build_mabutamushi():
    """
    瞼の隙間に湧く小さな夢。gajiriと同じ「胴+頭+前後の脚」という関節構成を
    踏襲しつつ、swarmで複数体まとめて出現する前提のため尻尾と耳を削り、
    関節数をgajiriの半分ほどまで落として軽くする(その分subsurfは変えず
    形の滑らかさは保つ)。
    """
    joints = C.mirrored(MABUTAMUSHI_HALF)
    radii = C.mirrored_radii(MABUTAMUSHI_RADII_HALF)
    bones = C.mirrored_bones(MABUTAMUSHI_BONES_HALF)

    body = C.build_skinned("mabutamushi", joints, bones, radii, root="body", subsurf=2)
    dust = C.make_material("mabuta_dust", (0.72, 0.63, 0.56), roughness=0.55)
    shade = C.make_material("mabuta_shade", (0.40, 0.32, 0.28), roughness=0.6)
    # 丸い背中だけ参道の土埃色に浮かせ、脚と腹側は影のように落として引き締める
    # (tsubuteの背/腹の塗り分けと同じ、高さだけで切る手法)
    C.assign_materials_by_region(body, [shade, dust], lambda c: 1 if c.z > 0.05 else 0)

    # まばたき対象(plan/models/archive/eye-blink-liveliness.md)。join()の
    # 対象から外し、armature構築後に頭の骨(body-head)へ直接つなぐ
    eyes = []
    for side in (-1.0, 1.0):
        eyes += eyeball(f"mabuta_eye{side}", (0.022 * side, -0.083, 0.060), 0.014,
                        look=(0.2 * side, -1.0, 0.0),
                        white=(0.97, 0.92, 0.80), dark=(0.34, 0.20, 0.12), blink=True)

    # 背に1枚だけ乗る、面取りした小さな甲殻(plan/models/
    # sheet-mabutamushi.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る
    shell_mat = C.make_material("mabuta_shell", (0.30, 0.22, 0.18), roughness=0.55)
    shell = C.box("mabuta_shell", (0.0, 0.030, 0.108), (0.038, 0.048, 0.014), bevel=0.006)
    C.assign_material(shell, shell_mat)
    # dieの大きな崩れで自動ウェイト計算のブレンドが本体から取り残す
    # (plan/models/archive/hard-part-bone-pinning-audit.mdの「要確認」を
    # 実測で確認)。唯一近い骨(body-head)へ剛体固定する
    shell_group = C.mark_for_pin(shell)

    mesh = C.join([body, shell], "mabutamushi")
    armature = C.build_armature("mabutamushi", joints, bones, mesh, root="body")
    C.pin_weight_to_bone(mesh, shell_group, "body-head")
    for eye in eyes:
        C.parent_to_bone(eye, armature, "body-head")
    return [mesh, armature] + eyes, armature


def mabutamushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・脚の遅れ追従(二次揺れ)を足してある。
    swarm・HP5/def0の「群れの中の1匹」らしい、極端に軽く素早い反応を
    強調する。脚が4本しかなく尻尾・耳もないため、二次揺れは前脚/後脚の
    位相ずれで表現する。
    """
    head = "body-head"
    legF_L, legF_R = "body-legF.L", "body-legF.R"
    legB_L, legB_R = "body-legB.L", "body-legB.R"
    return [
        # 群れの中でそわそわ落ち着かず、小刻みに震える。頭→前脚(2フレーム
        # 遅れ)→後脚(4フレーム遅れ)と波状に伝わる本物の二次揺れにする
        # (`partial`が無く単なる往復になっていた現行の不備を修正)
        ("idle", [
            (1, {head: (0, 0, 0), legF_L: (0, 0, 0), legF_R: (0, 0, 0),
                 legB_L: (0, 0, 0), legB_R: (0, 0, 0)}),
            (16, {head: (-6, 0, 4)}),
            (18, {legF_L: (4, 0, 0), legF_R: (-4, 0, 0)}, {"partial": True}),
            (32, {head: (0, 0, -4)}),
            (36, {legB_L: (-4, 0, 0), legB_R: (4, 0, 0)}, {"partial": True}),
            (44, {head: (0, 0, 0)}),
            (46, {legF_L: (0, 0, 0), legF_R: (0, 0, 0)}, {"partial": True}),
            (48, {legB_L: (0, 0, 0), legB_R: (0, 0, 0)}, {"partial": True}),
        ]),
        ("walk", [
            (1, {legF_L: (26, 0, 0), legF_R: (-26, 0, 0),
                 legB_L: (-24, 0, 0), legB_R: (24, 0, 0), head: (4, 0, 0)}),
            (5, {legF_L: (0, 0, 0), legF_R: (0, 0, 0),
                 legB_L: (0, 0, 0), legB_R: (0, 0, 0), head: (0, 0, 0)}),
            (9, {legF_L: (-26, 0, 0), legF_R: (26, 0, 0),
                 legB_L: (24, 0, 0), legB_R: (-24, 0, 0), head: (-4, 0, 0)}),
            (13, {legF_L: (0, 0, 0), legF_R: (0, 0, 0),
                  legB_L: (0, 0, 0), legB_R: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # タメ→LINEARで鋭く突く→わずかな行き過ぎ→戻り。小さな体格に合わせ
        # 他種族よりさらに短い間隔のまま保つ
        ("attack", [
            (1, {head: (0, 0, 0), legF_L: (0, 0, 0), legF_R: (0, 0, 0)}),
            (3, {head: (-16, 0, 0), legF_L: (-14, 0, 0), legF_R: (-14, 0, 0)}, {"interp": "LINEAR"}),
            (5, {head: (22, 0, 0), legF_L: (10, 0, 0), legF_R: (10, 0, 0)}),
            (7, {head: (26, 0, 0), legF_L: (12, 0, 0), legF_R: (12, 0, 0)}),
            (14, {head: (0, 0, 0), legF_L: (0, 0, 0), legF_R: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くし、HP5/def0という最弱格らしく振幅をひとまわり
        # 大きくして戻りも延ばし、小さな体が大きく怯む見た目にする
        ("hit", [
            (1, {head: (0, 0, 0), legB_L: (0, 0, 0), legB_R: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {head: (24, 0, 0), legB_L: (-22, 0, 0), legB_R: (-22, 0, 0)}),
            (13, {head: (0, 0, 0), legB_L: (0, 0, 0), legB_R: (0, 0, 0)}),
        ]),
        # 小さな夢らしく、脚を丸く縮めて消えていく。初動をLINEARで鋭くし
        # 「最初にびくっと縮む」瞬間を加える。18f到達後、脚を縮めたまま
        # 消える前の小さな跳ね返りを1回追加する
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (8, {head: (20, 0, 0), legF_L: (-40, 0, 0), legF_R: (-40, 0, 0),
                 legB_L: (-36, 0, 0), legB_R: (-36, 0, 0)}),
            (18, {head: (34, 0, 0), legF_L: (-70, 0, 0), legF_R: (-70, 0, 0),
                  legB_L: (-64, 0, 0), legB_R: (-64, 0, 0)}),
            (22, {head: (30, 0, 0), legF_L: (-62, 0, 0), legF_R: (-62, 0, 0),
                  legB_L: (-56, 0, 0), legB_R: (-56, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== ツブテガエル

# 設定画(design/characters/tsubute/generated/tsubute-sheet.png)の三面図の実測値。
# 計測の手順と生の数字は plan/models/tsubute-remake.md。1px ≈ 1.366mm。
TSUBUTE_HEIGHT = 0.250        # 目の上端〜接地(設定画「約25cm」)
TSUBUTE_WIDTH = 0.219         # 体の幅(石を除く)
TSUBUTE_DEPTH = 0.223         # 鼻先〜尻(石・手を除く)
TSUBUTE_EYE_C = (0.050, -0.085, 0.221)   # 虹彩の中心(正面図 x=±36.5px、上から11%)
TSUBUTE_EYE_R = 0.0155        # 虹彩の半径(直径 0.031。設定画の虹彩0.025+まぶたの縁)

# カラーパレット欄と正面図の実測
TSUBUTE_SHEET = {
    "main": (0.349, 0.396, 0.396),      # 体(メイン) #596565
    "pattern": (0.424, 0.435, 0.392),   # 体(模様) #6c6f64
    "body_mid": (0.498, 0.459, 0.365),  # 正面図の体の中間 #7f755d
    "body_light": (0.663, 0.608, 0.514),  # 明部 #a99b83
    "body_dark": (0.310, 0.302, 0.251),   # 暗部 #4f4d40
    "belly": (0.871, 0.788, 0.686),     # お腹 #dec9af
    "iris": (0.667, 0.502, 0.192),      # 目(虹彩) #aa8031
    "white": (0.910, 0.847, 0.765),     # 目(白目) #e8d8c3
    "mouth": (0.773, 0.588, 0.514),     # 口内 #c59683
    "stone": (0.471, 0.435, 0.365),     # 石 #786f5d
}

TSUBUTE_HALF = {
    # 上体を起こした座り姿勢(設定画)。chestが根。hipは低く後ろ、
    # headは高く前。**頭の関節は胸の殻の外に置く**(内側だと Skin 修飾子の
    # 殻が胸に飲まれ、頭が出ない。実測: 頭頂 0.211 / 意図 0.268)
    "hip": (0.0, 0.030, 0.075),
    "chest": (0.0, -0.005, 0.120),
    "head": (0.0, -0.060, 0.176),
    "armF.L": (0.078, -0.070, 0.105),
    "handF.L": (0.088, -0.112, 0.020),
    "kneeB.L": (0.088, 0.035, 0.085),
    "ankleB.L": (0.086, -0.028, 0.032),
    "footB.L": (0.085, -0.088, 0.012),
}
TSUBUTE_RADII_HALF = {
    "hip": 0.090, "chest": 0.095, "head": 0.078,
    "armF.L": 0.028, "handF.L": 0.028,
    "kneeB.L": 0.032, "ankleB.L": 0.024, "footB.L": 0.021,
}
TSUBUTE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def _fix_orphan_weights(mesh_obj, joints, bones) -> None:
    """
    自動ウェイト(Bone Heat)は部品の多い密集メッシュで解を出せない
    ことがある(「failed to find solution」警告)。無ウェイトの頂点は
    ポーズ中その場に取り残される上、全滅するとglTF書き出しがスキンを
    丸ごと落とす(garudo.pyの同名関数と同じ問題)。ここでは無ウェイト
    頂点を近い2本のボーンへ距離の逆数で按分して割り当てる
    (最寄り1本の剛体割り当てだと関節でちぎれて見えるため)。
    """
    segments = []
    for parent, child in bones:
        name = C.bone_name(parent, child)
        vg = mesh_obj.vertex_groups.get(name)
        if vg is None:
            vg = mesh_obj.vertex_groups.new(name=name)
        segments.append((vg, Vector(joints[parent]), Vector(joints[child])))

    def seg_dist(p: Vector, a: Vector, b: Vector) -> float:
        ab = b - a
        if ab.length_squared == 0.0:
            return (p - a).length
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (p - (a + ab * t)).length

    orphans = 0
    for v in mesh_obj.data.vertices:
        if any(g.weight > 0.001 for g in v.groups):
            continue
        ranked = sorted(segments, key=lambda s: seg_dist(v.co, s[1], s[2]))[:2]
        dists = [max(seg_dist(v.co, a, b), 1e-4) for _, a, b in ranked]
        inv = [1.0 / (d * d) for d in dists]
        total = sum(inv)
        for (vg, _, _), w in zip(ranked, inv):
            vg.add([v.index], w / total, "REPLACE")
        orphans += 1
    if orphans:
        print(f"  自動ウェイトの取りこぼし {orphans} 頂点を近傍ボーンへ按分した")


def build_tsubute():
    """
    新しい設定画(design/characters/tsubute/generated/tsubute-sheet.png、
    ユーザー提供)に合わせた造形。仕様と実測値は plan/models/tsubute-remake.md。

    - **約25cm・上体を起こした座り姿勢**。頭が前上、背中は石粒のドーム、
      腿は横に畳み、足は前へ。右腕を上げて石を構える。
    - 旧版の構造(骨+部品を彫刻式に融合 → 皮膚をベイク → 石粒は gem)は
      そのまま、寸法・姿勢・色を新設定画へ。
    - 石粒はパレットのくすんだ4色。目の光の粒は発光させない
      (設定画「光の反射が鈍やか」)。
    """
    joints = C.mirrored(TSUBUTE_HALF)
    radii = C.mirrored_radii(TSUBUTE_RADII_HALF)
    bones = C.mirrored_bones(TSUBUTE_BONES_HALF)

    # 胴・頭は uv_sphere で明示的に置く。Skin 修飾子(build_skinned)は
    # 関節間の距離が半径より短いと殻を吸収し、頭が胸に飲まれて出なかった
    # (実測: 頭頂 0.214 / 意図 0.278)。骨は関節から別に作るので影響なし
    hip_s = C.uv_sphere("tsubute_hip", (0.0, 0.030, 0.078), 0.088,
                        segments=20, rings=14, scale=(1.0, 1.0, 0.90))
    chest_s = C.uv_sphere("tsubute_chest", (0.0, -0.005, 0.125), 0.090,
                          segments=20, rings=14, scale=(1.0, 0.95, 0.95))
    head_s = C.uv_sphere("tsubute_head", (0.0, -0.060, 0.176), 0.066,
                         segments=20, rings=14, scale=(1.06, 1.0, 0.95))

    # 下顎: 口の線より下の前面を斜めの顎平面にクランプして「面」にする
    def jaw_limit(z: float) -> float:
        return -0.095 - 1.3 * (z - 0.10)

    for v in head_s.data.vertices:
        if 0.08 <= v.co.z < 0.170 and v.co.y < jaw_limit(v.co.z):
            t = max(0.0, min(1.0, (0.095 - abs(v.co.x)) / 0.045))
            v.co.y += (jaw_limit(v.co.z) - v.co.y) * t

    parts = [hip_s, chest_s, head_s]
    for side in (-1.0, 1.0):
        # 後脚: 膝→足首→足の柱(腿の塊は下で足す)
        parts.append(C.curve_tube(
            f"tsubute_leg{side}",
            [Vector((0.088 * side, 0.035, 0.085)), Vector((0.086 * side, -0.028, 0.032)),
             Vector((0.085 * side, -0.088, 0.012))],
            [0.030, 0.024, 0.020]))
        # 左手(地面)の塊は腕の管の先で足りる。右手は下の指で作る
    for side in (-1.0, 1.0):
        # 後足のつま先: 足首から前へ3本
        foot = Vector((0.085 * side, -0.088, 0.012))
        for fi, ang in enumerate((-0.35, 0.10, 0.55)):
            d = Vector((math.sin(ang) * side, -math.cos(ang), 0.0))
            parts.append(C.curve_tube(
                f"tsubute_toe{fi}_{side}",
                [foot, foot + d * 0.020 + Vector((0, 0, 0.002)), foot + d * 0.040],
                [0.0095, 0.0070, 0.0050]))
        # 畳んだ後脚の太腿の量感(設定画の腿は体の横に張り出す)
        parts.append(C.uv_sphere(f"tsubute_thigh{side}",
                                 (0.086 * side, 0.030, 0.070), 0.042,
                                 segments=12, rings=9, scale=(0.80, 1.20, 0.95)))
        # 尻まわりの張り出し
        parts.append(C.uv_sphere(f"tsubute_flank{side}",
                                 (0.068 * side, 0.045, 0.085), 0.046,
                                 segments=12, rings=9, scale=(1.0, 1.15, 0.9)))
        # 頬のふくらみ: 口角の外側
        parts.append(C.uv_sphere(f"tsubute_cheek{side}",
                                 (0.062 * side, -0.092, 0.158), 0.024,
                                 segments=10, rings=8, scale=(1.15, 0.9, 0.75)))
        # 眉の隆起: 目の後ろから外へ回る重いひさし
        # 眉の隆起: 頭の球面上の点を取り、少し外へ出す(浮かせると角に見える)
        hc = Vector((0.0, -0.060, 0.176))
        brow_pts = []
        for dx, dy, dz in ((0.028, -0.70, 0.62), (0.055, -0.55, 0.70), (0.075, -0.30, 0.66)):
            d = Vector((dx * side * 10, dy, dz)).normalized()
            brow_pts.append(hc + Vector((d.x * 0.070, d.y * 0.066, d.z * 0.063)))
        parts.append(C.curve_tube(f"tsubute_brow{side}", brow_pts, [0.007, 0.010, 0.007]))

    # 左腕(-x): 肩から地面へ。手は指3本で地面を押さえる
    parts.append(C.curve_tube(
        "tsubute_arm-1",
        [Vector((-0.062, -0.060, 0.120)), Vector((-0.082, -0.095, 0.060)),
         Vector((-0.088, -0.112, 0.020))],
        [0.020, 0.017, 0.014]))
    hand = Vector((-0.088, -0.112, 0.016))
    for fi, ang in enumerate((-0.55, 0.0, 0.55)):
        d = Vector((math.sin(ang) * -1.0, -math.cos(ang), 0.0))
        parts.append(C.curve_tube(
            f"tsubute_finger{fi}_-1",
            [hand, hand + d * 0.018 + Vector((0, 0, 0.003)), hand + d * 0.036],
            [0.0095, 0.0070, 0.0050]))
    # 右腕(+x): 肘を曲げて上げ、胸の高さで石を構える(投げる構え)
    parts.append(C.curve_tube(
        "tsubute_arm+1",
        [Vector((0.062, -0.060, 0.120)), Vector((0.095, -0.075, 0.075)),
         Vector((0.105, -0.108, 0.092))],
        [0.020, 0.017, 0.015]))
    hand_r = Vector((0.105, -0.110, 0.094))
    for fi, ang in enumerate((-0.6, 0.0, 0.6)):
        d = Vector((math.sin(ang) * 0.6, -0.5, math.cos(ang) * 0.9)).normalized()
        parts.append(C.curve_tube(
            f"tsubute_finger{fi}_+1",
            [hand_r, hand_r + d * 0.015, hand_r + d * 0.028],
            [0.0085, 0.0065, 0.0045]))

    # 彫刻式の融合。大きさに合わせてボクセルを縮める(旧 0.006 → 0.0035)
    body = C.sculpt_merge("tsubute", parts, voxel=0.0035, out_voxel=0.0055)
    C.decimate_to(body, 6500)
    C.organic_uv(body)

    # 表面のごく浅い凹凸(石粒の下地。目立たせない)
    for v in body.data.vertices:
        px, py, pz = v.co.x, v.co.y, v.co.z
        noise = (math.sin(px * 71.3 + py * 47.7) + math.sin(py * 93.1 + pz * 58.9)
                 + math.sin(pz * 82.7 + px * 33.3)) / 3.0
        v.co += v.normal * (noise * 0.0010)

    # ---- 表面の模様はテクスチャに描く ----
    head_c = Vector((0.0, -0.060, 0.176))
    # 口の線: 幅0.157・z=0.178(設定画)。頭球の表面に投影した折れ線
    mouth_raw = [Vector((-0.078, -0.085, 0.172)), Vector((-0.045, -0.108, 0.176)),
                 Vector((0.0, -0.118, 0.178)),
                 Vector((0.045, -0.108, 0.176)), Vector((0.078, -0.085, 0.172))]
    # 頭は楕円体(半径 0.070 / 0.066 / 0.0627)なので、固定半径で投影すると
    # 線が表面から8mm浮いてベイクに乗らない(実測: 口の中央が消えた)
    head_ax = Vector((0.070, 0.066, 0.0627))

    def on_head(p):
        d = p - head_c
        d = Vector((d.x / head_ax.x, d.y / head_ax.y, d.z / head_ax.z)).normalized()
        return head_c + Vector((d.x * head_ax.x, d.y * head_ax.y, d.z * head_ax.z))

    mouth_pts = [on_head(p) for p in mouth_raw]
    nostril_pts = [on_head(Vector((0.014 * side, -0.115, 0.200))) for side in (-1.0, 1.0)]
    # 紺灰の斑点(|x|側で判定して左右対称)。腕・腿・脇腹に
    spots = [
        (0.085, -0.050, 0.100, 0.016), (0.075, -0.085, 0.060, 0.012),
        (0.105, 0.040, 0.095, 0.015), (0.095, -0.010, 0.060, 0.013),
        (0.100, 0.020, 0.035, 0.011), (0.060, -0.098, 0.125, 0.011),
        (0.090, 0.060, 0.060, 0.012), (0.070, -0.100, 0.035, 0.010),
        (0.080, -0.070, 0.135, 0.010), (0.098, 0.005, 0.110, 0.011),
        (0.070, -0.030, 0.040, 0.010), (0.088, -0.060, 0.022, 0.009),
        (0.050, -0.075, 0.150, 0.008), (0.100, 0.045, 0.050, 0.010),
    ]
    # 実機のターンテーブルで測ると、青いキー光・環境光で体が #615e64(青灰)に
    # 沈んだ(設定画の中間 #7f755d はオリーブ)。土色を主に、青を引く
    back_col = tuple(min(1.0, 0.75 * a + 0.25 * b + o)
                     for a, b, o in zip(TSUBUTE_SHEET["body_mid"], TSUBUTE_SHEET["main"],
                                        (0.05, 0.05, -0.04)))
    belly_col = (0.92, 0.85, 0.72)          # 腹(実機で #c6a99a に沈むので明るめ)
    spot_col = (0.30, 0.36, 0.42)          # 紺灰の斑
    mouth_col = (0.26, 0.26, 0.20)

    def _seg_dist(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        return (p - (a + ab * t)).length

    def skin_color(p, n):
        x, y, z = p.x, p.y, p.z
        md = min(_seg_dist(p, a, b) for a, b in zip(mouth_pts, mouth_pts[1:]))
        if md < 0.0035:
            return mouth_col
        for npt in nostril_pts:
            if (p - npt).length < 0.004:
                return (0.28, 0.28, 0.20)
        # 腹〜胸〜あご下は生成り(設定画では口の下から腹の下端まで)。
        # 境界はノイズで揺らす
        # 腹の生成りは設定画の楕円(中心 z=0.090・0.074×0.070)から喉まで。
        # 前を向いた面だけ
        wob = 0.006 * math.sin(x * 60 + z * 37) + 0.005 * math.sin(y * 48)
        e = math.hypot(x / (0.040 + wob), (z - 0.100) / (0.064 + wob))
        is_belly = e < 1.0 and n.y < -0.25
        base = belly_col if is_belly else back_col
        q = Vector((abs(x), y, z))
        for sx, sy, sz, sr in spots:
            if (q - Vector((sx, sy, sz))).length < sr:
                return spot_col if not is_belly else (0.66, 0.60, 0.50)
        if is_belly:
            cell = math.sin(x * 95 + 1.3) * math.sin(y * 88 + 0.4) * math.sin(z * 80 + 2.6)
            if cell > 0.84:
                return (0.60, 0.55, 0.45)
        # 前面のマダラ模様: 設定画では腹の周り・胸・腕・腿の前面に紺灰の斑が
        # 散っている。前を向いた面(n.y<0)で、腹の外側だけ
        if n.y < -0.15 and z < 0.165 and not is_belly:
            cell = (math.sin(x * 120 + 0.7) * math.sin(z * 105 + 1.9)
                    + 0.6 * math.sin(x * 210 + z * 160 + 2.4))
            if cell > 0.95:
                return spot_col
        # まだら(低周波): 背側はスレート寄り、腹側は土色寄り
        m = (math.sin(x * 17 + y * 12) + math.sin(y * 14 + z * 21)) / 2.0
        slate = TSUBUTE_SHEET["main"]
        k = 0.35 + 0.25 * max(0.0, m)
        return tuple(b * (1.0 - k) + s * k for b, s in zip(base, slate)) if not is_belly \
            else tuple(b * (1.0 - 0.10 * max(0.0, m)) for b in base)

    skin_img = C.bake_albedo(body, skin_color, size=384, name="tsubute_skin")
    C.assign_material(body, C.make_textured_material("tsubute_skin_m", skin_img,
                                                     roughness=0.85))

    extras = []
    # 石粒・まぶた・手の石は骨へ剛体固定する。自動ウェイトのままだと1つの石の
    # 中でウェイトが変わり、die(横倒れ)で石が破片状に引き伸ばされた(実測)
    pinned = []

    def pin(obj, bone):
        C.mark_for_pin(obj)
        pinned.append((obj.name, bone))

    # 背中〜頭の石粒: 設定画では同系色のくすんだ石が背中全体をドーム状に
    # 埋める。黄金角スパイラルで密に敷き詰め、色は4色を回す
    wart_mats = [
        C.make_material("tsubute_wart_slate", TSUBUTE_SHEET["main"], roughness=0.8),
        C.make_material("tsubute_wart_olive", TSUBUTE_SHEET["pattern"], roughness=0.8),
        C.make_material("tsubute_wart_earth", (0.40, 0.37, 0.33), roughness=0.85),   # 実機の松明で橙に転ぶので寒色寄り
        C.make_material("tsubute_wart_grey", TSUBUTE_SHEET["stone"], roughness=0.8),
    ]

    def frac(x: float) -> float:
        return x - math.floor(x)

    golden = math.pi * (3.0 - math.sqrt(5.0))
    lump_spheres = [
        # (中心, 半径, 個数, 大きさ係数)
        # 設定画では石が隙間なく背中を埋めるので、個数は多め・重なり許容
        (Vector((0.0, -0.005, 0.125)), 0.088, 64, 1.0),  # 背中(胸の球に合わせる)
        (Vector((0.0, 0.030, 0.078)), 0.086, 44, 1.05),  # 腰〜尻(腰の球に合わせる)
        (Vector((0.0, -0.060, 0.176)), 0.062, 22, 0.60), # 頭(頭の球に合わせる)
    ]
    lump_index = 0
    for si, (center, radius, count, size_mul) in enumerate(lump_spheres):
        for i in range(count):
            t = (i + 0.5) / count
            zdir = 1.0 - t * 1.30
            ring = math.sqrt(max(0.0, 1.0 - zdir * zdir))
            ang = i * golden + si * 1.7
            d = Vector((math.cos(ang) * ring, math.sin(ang) * ring, zdir))
            if si == 2 and d.y < 0.10:
                continue                    # 頭は目の直後から後ろ(顔を空ける)
            if d.y < -0.15 and si != 2:
                continue                    # 胸・腹には置かない
            pos = center + d * (radius * 1.03)
            if pos.z < 0.045:
                continue
            if pos.y < -0.060 and pos.z > 0.150:
                continue                    # 額・眉・目のまわり
            h = frac(math.sin((lump_index + 1) * 12.9898) * 43758.5453)
            h2 = frac(math.sin((lump_index + 1) * 78.233) * 12735.7191)
            h3 = frac(math.sin((lump_index + 1) * 39.425) * 26714.3583)
            # ゴツゴツ感: 石は大きめ(直径 0.022〜0.052)で、体面から半分ほど
            # 突き出す。設定画は背中の中央(上向き)ほど大きい
            size = (0.011 + 0.015 * h) * size_mul * (1.0 + 0.45 * max(0.0, d.z))
            wart = C.gem(f"tsubute_wart{lump_index}", (0.0, 0.0, 0.0), size,
                         subdivisions=1,
                         scale=(1.0 + 0.2 * h, 1.0 - 0.1 * h2, 0.85 + 0.2 * h3))
            wart.rotation_euler = (h * 6.28, h2 * 6.28, h3 * 6.28)
            wart.location = pos
            C.assign_material(wart, wart_mats[lump_index % len(wart_mats)])
            pin(wart, "chest-head" if si == 2 else "chest-hip")
            extras.append(wart)
            lump_index += 1

    # 目: 金色の虹彩+横長の黒い瞳+厚いまぶた。光の粒は発光させない
    lid_mat = C.make_material("tsubute_lid", TSUBUTE_SHEET["pattern"], roughness=0.8)
    iris_mat = C.make_material("tsubute_iris", TSUBUTE_SHEET["iris"], roughness=0.25)
    pupil_mat = C.make_material("tsubute_pupil", (0.08, 0.07, 0.05), roughness=0.2)
    gleam_mat = C.make_material("tsubute_gleam", TSUBUTE_SHEET["white"], roughness=0.3)
    eyes = []
    ex, ey, ez = TSUBUTE_EYE_C
    for side in (-1.0, 1.0):
        center = Vector((ex * side, ey, ez))
        iris = C.uv_sphere(f"tsubute_iris{side}", center, TSUBUTE_EYE_R,
                           segments=14, rings=10)
        C.assign_material(iris, iris_mat)
        iris["blink"] = "white"
        pupil = C.uv_sphere(f"tsubute_pupil{side}",
                            center + Vector((0.001 * side, -0.0115, 0.0005)), 0.0080,
                            segments=10, rings=8, scale=(1.6, 0.5, 0.85))
        C.assign_material(pupil, pupil_mat)
        pupil["blink"] = "pupil"
        eyes += [iris, pupil]
        lid = C.uv_sphere(f"tsubute_lid{side}", center + Vector((0.0, 0.005, 0.0115)),
                          TSUBUTE_EYE_R, segments=12, rings=9, scale=(1.06, 1.0, 0.36))
        C.assign_material(lid, lid_mat)
        pin(lid, "chest-head")
        extras.append(lid)
        gleam = C.uv_sphere(f"tsubute_gleam{side}",
                            center + Vector((0.005 * side, -0.0125, 0.0055)), 0.0025,
                            segments=8, rings=6)
        C.assign_material(gleam, gleam_mat)
        pin(gleam, "chest-head")
        extras.append(gleam)

    # 投げつける石(角のある石つぶて)。右手に構える
    stone = C.gem("tsubute_stone", (0.108, -0.120, 0.100), 0.026, subdivisions=1,
                  scale=(1.0, 0.9, 0.9))
    C.assign_material(stone, C.make_material("tsubute_stone_m", TSUBUTE_SHEET["stone"],
                                             roughness=0.9))
    pin(stone, "armF.L-handF.L")
    extras.append(stone)

    mesh = C.join([body] + extras, "tsubute")
    _tsubute_check(mesh)
    armature = C.build_armature("tsubute", joints, bones, mesh, root="chest")
    _fix_orphan_weights(mesh, joints, bones)
    for group_name, bone in pinned:
        C.pin_weight_to_bone(mesh, group_name, bone)
    for eye in eyes:
        C.parent_to_bone(eye, armature, "chest-head")
    return [mesh, armature] + eyes, armature


def _tsubute_check(mesh) -> None:
    """設定画の実測値と合っているかをビルド時に確かめる(handbook 1-16)。"""
    lo, hi = C.bounds([mesh])
    height, width, depth = hi.z - lo.z, hi.x - lo.x, hi.y - lo.y
    print(f"[tsubute] 高さ {height:.3f}m 幅 {width:.3f}m 奥行き {depth:.3f}m "
          f"(設定画 0.250 / 腿込み0.227 / 石込み0.273)")
    assert abs(height - TSUBUTE_HEIGHT) < 0.010, height
    # 幅は構えた石込みで ≥0.26(正面図 595〜785px)、奥行きは石込みで
    # 0.273(側面図 200px)。体だけなら 0.219 / 0.223
    assert 0.22 < width < 0.27, width
    assert 0.24 < depth < 0.30, depth
    print(f"[tsubute] 目 x=±{TSUBUTE_EYE_C[0]:.3f} z={TSUBUTE_EYE_C[2]:.3f} 直径 {2 * TSUBUTE_EYE_R:.3f}")
    print(f"[tsubute] 三角形 {C.tri_count([mesh])}")


def tsubute_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・腕の遅れ追従(二次揺れ)を足してある。
    腕はsecondary_delay_frames()(plan/game/archive/
    secondary-motion-delay-convention.md)の対象外(尻尾・耳等の付属肢では
    なく主要な可動部位)なので、遅延フレーム数はこれまでどおり目分量のまま
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 腕が頭より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (18, {head: (-5, 0, 0)}),
            (20, {armL: (-6, 0, 0), armR: (-6, 0, 0)}, {"partial": True}),
            (36, {head: (0, 0, 0)}),
            (38, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {legL: (34, 0, 0), legR: (34, 0, 0), head: (10, 0, 0)}),
            (10, {legL: (-26, 0, 0), legR: (-26, 0, 0), head: (-12, 0, 0),
                  armL: (-30, 0, 0), armR: (-30, 0, 0)}),
            (16, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # タメ(振りかぶる)→ ツメ(LINEARで鋭く投げる)→ 行き過ぎ → 戻り
        ("attack", [
            (1, {armL: (0, 0, 0), head: (0, 0, 0)}),
            (6, {armL: (-98, 0, -27), head: (-9, 0, 0)}, {"interp": "LINEAR"}),
            (9, {armL: (52, 0, 16), head: (13, 0, 0)}),
            (11, {armL: (42, 0, 13), head: (10, 0, 0)}),
            (20, {armL: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 鋭く入って(LINEAR)、ゆっくり戻る
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {head: (22, 0, 0), armL: (-28, 0, 20), armR: (-28, 0, -20)}),
            (14, {head: (0, 0, 0)}),
        ]),
        # 倒れの初動を鋭く、接地後に一度だけ小さく跳ね返る
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (26, 0, 0), legL: (-40, 0, 0), legR: (-40, 0, 0)}),
            (22, {head: (40, 0, 0), legL: (-80, 0, 0), legR: (-80, 0, 0),
                  armL: (-70, 0, 30), armR: (-70, 0, -30)}),
            (26, {head: (36, 0, 0), legL: (-74, 0, 0), legR: (-74, 0, 0),
                  armL: (-64, 0, 26), armR: (-64, 0, -26)}),
        ]),
    ]


# =================================================================== マドロミダケ

MADOROMI_JOINTS = {
    "root": (0.0, 0.0, 0.05),
    "stem": (0.0, 0.0, 0.24),
    "capbase": (0.0, 0.0, 0.36),
    "captop": (0.0, 0.0, 0.50),
}
MADOROMI_RADII = {"root": 0.115, "stem": 0.095, "capbase": 0.275, "captop": 0.055}
MADOROMI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def cap_surface_z(dist: float) -> float:
    """
    傘の表面の高さ。capbase(半径0.275)から captop(半径0.055)へ向かう円錐を、
    サブディビジョンで丸まるぶん少し内側に見積もって近似する。
    """
    base_z, top_z = MADOROMI_JOINTS["capbase"][2], MADOROMI_JOINTS["captop"][2]
    base_r, top_r = MADOROMI_RADII["capbase"] * 0.86, MADOROMI_RADII["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.012


def build_madoromi():
    """歩くキノコ。傘を大きく広げ、笠の下に眠たげな顔をつける。"""
    body = C.build_skinned("madoromi", MADOROMI_JOINTS, MADOROMI_BONES, MADOROMI_RADII,
                           root="root", subsurf=2)
    stem_mat = C.make_material("madoromi_stem", (0.90, 0.86, 0.74), roughness=0.75)
    cap_mat = C.make_material("madoromi_cap", (0.62, 0.24, 0.42), roughness=0.6)
    C.assign_materials_by_region(body, [stem_mat, cap_mat], lambda c: 1 if c.z > 0.315 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # 半分閉じた眠たい目
        eye = C.uv_sphere(f"madoromi_eye{side}", (0.062 * side, -0.098, 0.20), 0.032,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.35))
        C.assign_material(eye, C.make_material(f"madoromi_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    mouth = C.uv_sphere("madoromi_mouth", (0.0, -0.098, 0.145), 0.030,
                        segments=12, rings=8, scale=(0.8, 0.5, 1.0))
    C.assign_material(mouth, C.make_material("madoromi_mouth_m", (0.36, 0.20, 0.22), roughness=0.4))
    extras.append(mouth)

    # 傘の斑点。傘の断面は capbase から captop へ絞られる円錐なので、
    # 中心からの距離に応じた高さに置かないと浮いたり埋まったりする。
    spot_mat = C.make_material("madoromi_spot", (0.94, 0.92, 0.86), roughness=0.6)
    for i, (angle_deg, dist, r) in enumerate([
        (200.0, 0.055, 0.042), (300.0, 0.105, 0.036), (60.0, 0.090, 0.038),
        (130.0, 0.130, 0.030), (10.0, 0.145, 0.026),
    ]):
        angle = math.radians(angle_deg)
        spot = C.uv_sphere(
            f"madoromi_spot{i}",
            (math.cos(angle) * dist, math.sin(angle) * dist, cap_surface_z(dist)),
            r, segments=12, rings=8, scale=(1.0, 1.0, 0.40),
        )
        C.assign_material(spot, spot_mat)
        extras.append(spot)

    # 軸の根元に食い込む、面取りした木質の輪(plan/models/archive/sheet-madoromi.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 「根を張った眠気」を、地に食い込む硬いつばで表す
    collar_mat = C.make_material("madoromi_collar", (0.52, 0.40, 0.26), roughness=0.75)
    collar = C.cylinder("madoromi_collar", (0.0, 0.0, 0.062), 0.128, 0.030,
                        segments=24, bevel=0.008)
    C.assign_material(collar, collar_mat)
    extras.append(collar)

    mesh = C.join([body] + extras, "madoromi")
    armature = C.build_armature("madoromi", MADOROMI_JOINTS, MADOROMI_BONES, mesh, root="root")
    return [mesh, armature], armature


def madoromi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・傘の遅れ追従(二次揺れ)を足してある。
    """
    stem, cap = "root-stem", "stem-capbase"
    captop = "capbase-captop"
    return [
        # 傘(cap)が根元(stem)より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}),
            (24, {stem: (3, 0, 2)}),
            (26, {cap: (-3, 0, 0)}, {"partial": True}),
            (48, {stem: (0, 0, 0)}),
            (50, {cap: (0, 0, 0)}, {"partial": True}),
        ]),
        # 根元をひねりながら、傘を左右に揺らして歩く
        ("walk", [
            (1, {stem: (0, 0, -9), cap: (0, 0, 6)}),
            (9, {stem: (6, 0, 0), cap: (-5, 0, 0)}),
            (18, {stem: (0, 0, 9), cap: (0, 0, -6)}),
            (27, {stem: (6, 0, 0), cap: (-5, 0, 0)}),
            (36, {stem: (0, 0, -9), cap: (0, 0, 6)}),
        ]),
        # タメ→LINEARで鋭く傘を振る打撃→行き過ぎ→ゆっくり戻る
        ("attack", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0), captop: (0, 0, 0)}),
            (5, {stem: (-14, 0, 0), cap: (-16, 0, 0)}, {"interp": "LINEAR"}),
            (8, {stem: (30, 0, 0), cap: (32, 0, 0), captop: (23, 0, 0)}),
            (10, {stem: (16, 0, 0), cap: (18, 0, 0), captop: (12, 0, 0)}),
            (20, {stem: (0, 0, 0), cap: (0, 0, 0), captop: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。振幅・戻り時間は現行どおり中程度に保つ
        ("hit", [
            (1, {stem: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {stem: (-20, 0, 0), cap: (-18, 0, 0)}),
            (14, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。24f到達後、大きく倒れた姿勢からわずかな
        # 跳ね返りを1回追加する
        ("die", [
            (1, {stem: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {stem: (-34, 0, 10), cap: (-20, 0, 0)}),
            (24, {stem: (-86, 0, 22), cap: (-34, 0, 0)}),
            (28, {stem: (-77, 0, 20), cap: (-31, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== ホネガラミ

HONE_HALF = {
    "hip": (0.0, 0.0, 0.36),
    "chest": (0.0, 0.0, 0.56),
    "neck": (0.0, 0.0, 0.66),
    "head": (0.0, -0.01, 0.78),
    "crown": (0.0, 0.0, 0.88),
    "shoulder.L": (0.135, 0.0, 0.595),
    "elbow.L": (0.205, 0.01, 0.47),
    "hand.L": (0.205, -0.03, 0.34),
    "thigh.L": (0.072, 0.0, 0.32),
    "knee.L": (0.078, 0.0, 0.17),
    "foot.L": (0.082, -0.03, 0.03),
}
HONE_RADII_HALF = {
    # 手足はぐっと細く、胴も絞る。細い胴に太い肋骨を重ねることで
    # 「骨が浮いている」silhouette を作る
    "hip": 0.062, "chest": 0.060, "neck": 0.030, "head": 0.108, "crown": 0.062,
    "shoulder.L": 0.030, "elbow.L": 0.022, "hand.L": 0.030,
    "thigh.L": 0.032, "knee.L": 0.026, "foot.L": 0.034,
}
HONE_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_honegarami():
    """
    骸骨の剣士。ガルドと同じ人型の骨組みだが、四肢をぐっと細くして骨らしくし、
    肋骨と眼窩を足してある。
    """
    joints = C.mirrored(HONE_HALF)
    radii = C.mirrored_radii(HONE_RADII_HALF)
    bones = C.mirrored_bones(HONE_BONES_HALF)

    body = C.build_skinned("honegarami", joints, bones, radii, root="hip", subsurf=2)
    C.assign_material(body, C.make_material("hone_bone", (0.88, 0.86, 0.76), roughness=0.72))

    extras = []
    bone_mat = C.make_material("hone_bone2", (0.88, 0.86, 0.76), roughness=0.72)
    dark = C.make_material("hone_socket", (0.05, 0.05, 0.07), roughness=0.9)

    # 顎。頭を球のままにせず、下側に張り出させて頭蓋らしい輪郭にする
    jaw = C.uv_sphere("hone_jaw", (0.0, -0.048, 0.712), 0.082,
                      segments=18, rings=12, scale=(0.92, 1.12, 0.58))
    C.assign_material(jaw, bone_mat)
    extras.append(jaw)

    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"hone_socket{side}", (0.046 * side, -0.086, 0.800), 0.034,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.15))
        C.assign_material(socket, dark)
        extras.append(socket)
        # 眼窩の奥で光る目
        glow = C.uv_sphere(f"hone_glow{side}", (0.046 * side, -0.094, 0.800), 0.016,
                           segments=10, rings=8)
        C.assign_material(glow, C.make_material(f"hone_glow{side}_m", (1.0, 0.45, 0.15),
                                                roughness=0.3, emission=3.0))
        extras.append(glow)
        # 頬骨
        cheek = C.uv_sphere(f"hone_cheek{side}", (0.078 * side, -0.052, 0.762), 0.032,
                            segments=12, rings=8, scale=(0.8, 1.0, 0.7))
        C.assign_material(cheek, bone_mat)
        extras.append(cheek)

    # 歯。縦の切れ込みを入れて歯並びに見せる
    teeth_mat = C.make_material("hone_teeth_m", (0.93, 0.91, 0.82), roughness=0.5)
    for i in range(5):
        tooth = C.box(f"hone_tooth{i}", ((i - 2) * 0.026, -0.098, 0.700),
                      (0.019, 0.026, 0.030), bevel=0.005)
        C.assign_material(tooth, teeth_mat)
        extras.append(tooth)

    # 肋骨。細い胴に対して十分太い輪を重ね、はっきり浮き出させる
    rib_mat = C.make_material("hone_rib", (0.87, 0.85, 0.75), roughness=0.72)
    for i, z in enumerate((0.455, 0.500, 0.545, 0.588)):
        radius = 0.108 - abs(i - 1) * 0.010
        rib = C.cylinder(f"hone_rib{i}", (0.0, -0.005, z), radius, 0.022, segments=20)
        # 前後に潰して胸郭らしい楕円にする
        for vert in rib.data.vertices:
            vert.co.y *= 0.72
        C.assign_material(rib, rib_mat)
        extras.append(rib)

    # 背骨
    spine = C.cylinder("hone_spine", (0.0, 0.030, 0.46), 0.026, 0.20, segments=12)
    C.assign_material(spine, rib_mat)
    extras.append(spine)

    # 腰骨
    pelvis = C.uv_sphere("hone_pelvis", (0.0, 0.0, 0.350), 0.092,
                         segments=16, rings=12, scale=(1.0, 0.62, 0.58))
    C.assign_material(pelvis, bone_mat)
    extras.append(pelvis)

    # 右手に錆びた剣
    blade = C.box("hone_blade", (-0.205, -0.055, 0.475), (0.034, 0.014, 0.32), bevel=0.008)
    # 切先を細める
    for vert in blade.data.vertices:
        if vert.co.z > 0.60:
            vert.co.x *= 0.35
    C.assign_material(blade, C.make_material("hone_blade_m", (0.52, 0.50, 0.46),
                                             roughness=0.45, metallic=0.75))
    guard = C.box("hone_guard", (-0.205, -0.050, 0.322), (0.095, 0.028, 0.022), bevel=0.007)
    C.assign_material(guard, C.make_material("hone_guard_m", (0.34, 0.28, 0.20), roughness=0.7))
    grip = C.cylinder("hone_grip", (-0.205, -0.050, 0.290), 0.017, 0.075, segments=12)
    C.assign_material(grip, C.make_material("hone_grip_m", (0.26, 0.19, 0.13), roughness=0.85))
    extras += [blade, guard, grip]

    mesh = C.join([body] + extras, "honegarami")
    armature = C.build_armature("honegarami", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def honegarami_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・頭の遅れ追従(二次揺れ)・歩行の接地沈みを
    足してある。頭の遅延フレーム数は部位の長さから機械的に決める
    (plan/game/archive/secondary-motion-delay-convention.md)。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreR = "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    head_delay = C.secondary_delay_frames(
        (Vector(HONE_HALF["head"]) - Vector(HONE_HALF["neck"])).length
        / (Vector(HONE_HALF["chest"]) - Vector(HONE_HALF["hip"])).length
    )
    return [
        # 頭が胴より遅れて追従する(二次揺れ)
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5), neck: (0, 0, 0)}),
            (20, {hipc: (2, 0, 1.5), armL: (-4, 0, 8), armR: (-4, 0, -8)}),
            (20 + head_delay, {neck: (-3, 0, 0)}, {"partial": True}),
            (40, {hipc: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5)}),
            (40 + head_delay, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 接地の瞬間に胴をわずかに沈める
        ("walk", [
            (1, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (-10, 0, 0), shinR: (8, 0, 0),
                 armL: (-20, 0, 6), armR: (20, 0, -6)}),
            (9, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                 hipc: {"loc": (0, -0.010, 0)}}),
            (17, {legL: (-24, 0, 0), legR: (24, 0, 0), shinL: (8, 0, 0), shinR: (-10, 0, 0),
                  armL: (20, 0, 6), armR: (-20, 0, -6), hipc: {"loc": (0, 0, 0)}}),
            (25, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.010, 0)}}),
            (33, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (-10, 0, 0), shinR: (8, 0, 0),
                  armL: (-20, 0, 6), armR: (20, 0, -6), hipc: {"loc": (0, 0, 0)}}),
        ]),
        # タメ→ツメ(LINEARで鋭く)→行き過ぎ→戻り
        ("attack", [
            (1, {armR: (0, 0, -5), foreR: (0, 0, 0), hipc: (0, 0, 0)}),
            (7, {armR: (-124, 0, -20), foreR: (-32, 0, 0), hipc: (-9, 0, -11)}, {"interp": "LINEAR"}),
            (10, {armR: (66, 0, 13), foreR: (9, 0, 0), hipc: (15, 0, 13), neck: (-8, 0, 0)}),
            (12, {armR: (56, 0, 11), foreR: (7, 0, 0), hipc: (12, 0, 10), neck: (-6, 0, 0)}),
            (22, {armR: (0, 0, -5), foreR: (0, 0, 0), hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 鋭く入って(LINEAR)、ゆっくり戻る
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {hipc: (-18, 0, 0), neck: (-16, 0, 0), armL: (-22, 0, 24), armR: (-22, 0, -24)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 崩れ落ちるように倒れ、接地後に一度だけ小さく跳ね返る
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (7, {hipc: (-16, 0, 6), neck: (-24, 0, 0), armL: (-40, 0, 40), armR: (-40, 0, -40)}),
            (20, {hipc: (-88, 0, 18), neck: (-40, 0, 0), legL: (56, 0, 0), legR: (48, 0, 0),
                  armL: (-80, 0, 55), armR: (-80, 0, -55)}),
            (24, {hipc: (-82, 0, 16), neck: (-36, 0, 0), legL: (52, 0, 0), legR: (44, 0, 0),
                  armL: (-74, 0, 50), armR: (-74, 0, -50)}),
        ]),
    ]


# =================================================================== きりみずち

KIRI_HALF = {
    "hip": (0.0, 0.02, 0.10),
    "chest": (0.0, -0.03, 0.34),
    "head": (0.0, -0.075, 0.58),
    "armF.L": (0.165, -0.02, 0.31),
    "handF.L": (0.185, 0.05, 0.07),
    "kneeB.L": (0.15, 0.15, 0.015),
    "ankleB.L": (0.14, 0.06, 0.005),
    "footB.L": (0.12, -0.02, 0.0),
}
KIRI_RADII_HALF = {
    "hip": 0.135, "chest": 0.10, "head": 0.072,
    "armF.L": 0.026, "handF.L": 0.016,
    "kneeB.L": 0.042, "ankleB.L": 0.028, "footB.L": 0.020,
}
KIRI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kirimizuchi():
    """
    霧を纏う、忘れられかけた道しるべの成れの果て。近づかず離れたところから
    水弾を飛ばす`ranged`の主力にふさわしく、tsubuteと同じ関節構成(胴・頭・
    腕・脚をつなぐ7本の骨)をそのまま流用するが、ずんぐりした蛙とは違い、
    縦に伸びて頭が前へ傾いだ、朽ちた道しるべのシルエットにする。
    腕は水を飛ばす触手として長く垂らし、頭には水を吐く注ぎ口と、
    霧の奥にかすかに灯るような弱い光の目をつける。
    """
    joints = C.mirrored(KIRI_HALF)
    radii = C.mirrored_radii(KIRI_RADII_HALF)
    bones = C.mirrored_bones(KIRI_BONES_HALF)

    body = C.build_skinned("kirimizuchi", joints, bones, radii, root="chest", subsurf=2)

    body_lower = C.make_material("kiri_body_lower", (0.30, 0.40, 0.43), roughness=0.75)
    body_upper = C.make_material("kiri_body_upper", (0.58, 0.70, 0.72), roughness=0.5)
    tendril_mat = C.make_material("kiri_tendril", (0.72, 0.84, 0.85), roughness=0.3, emission=0.12)

    # 腕(触手)だけを別トーンにする。高さだけで切ると胴に巻き込むので、
    # 腕・手の関節からの距離で判定する(gajiriの耳と同じ手法)
    arm_pts = [Vector(joints["armF.L"]), Vector(joints["armF.R"]),
               Vector(joints["handF.L"]), Vector(joints["handF.R"])]

    def classify(c):
        if min((c - p).length for p in arm_pts) < 0.045:
            return 2
        return 1 if c.z > 0.28 else 0

    C.assign_materials_by_region(body, [body_lower, body_upper, tendril_mat], classify)

    extras = []
    # 霧の奥にかすかに灯る目。眼窩は影にして、その奥に小さな光点だけを置く
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"kiri_socket{side}", (0.032 * side, -0.128, 0.598), 0.020,
                             segments=12, rings=8, scale=(1.0, 0.7, 1.0))
        C.assign_material(socket, C.make_material(f"kiri_socket{side}_m", (0.05, 0.06, 0.08),
                                                   roughness=0.85))
        extras.append(socket)
        glow = C.uv_sphere(f"kiri_glow{side}", (0.032 * side, -0.138, 0.598), 0.009,
                           segments=10, rings=8)
        C.assign_material(glow, C.make_material(f"kiri_glow{side}_m", (0.55, 0.85, 0.90),
                                                roughness=0.25, emission=2.5))
        extras.append(glow)

    # 水を吐く注ぎ口。先端に凝った水滴を結ばせる
    spout = C.box("kiri_spout", (0.0, -0.185, 0.505), (0.048, 0.095, 0.032), bevel=0.011)
    C.assign_material(spout, C.make_material("kiri_spout_m", (0.24, 0.30, 0.32), roughness=0.6))
    extras.append(spout)
    droplet = C.uv_sphere("kiri_droplet", (0.0, -0.238, 0.498), 0.026, segments=14, rings=10)
    C.assign_material(droplet, C.make_material("kiri_droplet_m", (0.55, 0.78, 0.85),
                                               roughness=0.15, emission=0.6))
    extras.append(droplet)

    # 割れた道しるべの木片。頭の上に棘のように突き出す
    spike_mat = C.make_material("kiri_spike_m", (0.22, 0.27, 0.29), roughness=0.65)
    for i, (angle_deg, dist, height) in enumerate([
        (30.0, 0.032, 0.075), (150.0, 0.030, 0.062), (270.0, 0.026, 0.055),
    ]):
        angle = math.radians(angle_deg)
        spike = C.cone(
            f"kiri_spike{i}",
            (math.cos(angle) * dist, -0.075 + math.sin(angle) * dist * 0.4, 0.635),
            0.018, 0.003, height, segments=8,
        )
        C.assign_material(spike, spike_mat)
        extras.append(spike)

    mesh = C.join([body] + extras, "kirimizuchi")
    armature = C.build_armature("kirimizuchi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kirimizuchi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・触手の遅れ追従(二次揺れ)を足してある。
    """
    head = "chest-head"
    trunk = "chest-hip"
    armL, armR = "chest-armF.L", "chest-armF.R"
    foreL, foreR = "armF.L-handF.L", "armF.R-handF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 霧がゆっくり渦を巻くように、頭と触手が漂う。触手の先(foreL,R)が
        # 腕(armL,R)より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                 foreL: (0, 0, 0), foreR: (0, 0, 0)}),
            (22, {head: (-4, 3, 0), armL: (6, 0, 4), armR: (6, 0, -4)}),
            (24, {foreL: (8, 0, 0), foreR: (8, 0, 0)}, {"partial": True}),
            (44, {head: (3, -3, 0), armL: (-4, 0, -3), armR: (-4, 0, 3)}),
            (46, {foreL: (-4, 0, 0), foreR: (-4, 0, 0)}, {"partial": True}),
            (60, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                  foreL: (0, 0, 0), foreR: (0, 0, 0)}),
        ]),
        # 脚をほとんど使わず、体ごと傾いで滑るように進む
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), trunk: (0, 0, 0), head: (0, 0, 0)}),
            (8, {legL: (14, 0, 0), legR: (-10, 0, 0), trunk: (-3, 0, 2), head: (4, 0, 0),
                 armL: (-10, 0, 6), armR: (10, 0, -6)}),
            (16, {legL: (-10, 0, 0), legR: (14, 0, 0), trunk: (3, 0, -2), head: (-4, 0, 0),
                  armL: (10, 0, -6), armR: (-10, 0, 6)}),
            (24, {legL: (0, 0, 0), legR: (0, 0, 0), trunk: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 頭を引いてため、LINEARで鋭く注ぎ口を突き出して水弾を放ち、
        # 反動でわずかに引いてからゆっくり中立へ戻る
        ("attack", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                 foreL: (0, 0, 0), foreR: (0, 0, 0)}),
            (5, {head: (-10, 0, 0), armL: (-18, 0, 10), armR: (-18, 0, -10),
                 foreL: (-14, 0, 0), foreR: (-14, 0, 0)}, {"interp": "LINEAR"}),
            (8, {head: (18, 0, 0), armL: (26, 0, -8), armR: (26, 0, 8),
                 foreL: (24, 0, 0), foreR: (24, 0, 0)}),
            (10, {head: (14, 0, 0), armL: (20, 0, -8), armR: (20, 0, 8),
                  foreL: (18, 0, 0), foreR: (18, 0, 0)}),
            (20, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                  foreL: (0, 0, 0), foreR: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。ranged種族なので振幅・戻り時間は
        # 現行どおり中程度に保つ
        ("hit", [
            (1, {head: (0, 0, 0), trunk: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (16, 0, 0), trunk: (-10, 0, 0), armL: (-14, 0, 14), armR: (-14, 0, -14)}),
            (14, {head: (0, 0, 0), trunk: (0, 0, 0)}),
        ]),
        # 実体を失って霧に紛れるように、前へ崩れ落ちる。初動をLINEARで
        # 鋭くする。26f到達後、頭と腕がほんの少しだけ戻るわずかな跳ね返りを追加
        ("die", [
            (1, {trunk: (0, 0, 0), head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (12, {trunk: (-30, 0, 0), head: (20, 0, 0), armL: (-30, 0, 20), armR: (-30, 0, -20),
                  legL: (-20, 0, 0), legR: (-20, 0, 0)}),
            (26, {trunk: (-70, 0, 0), head: (40, 0, 0), armL: (-60, 0, 40), armR: (-60, 0, -40),
                  legL: (-40, 0, 0), legR: (-40, 0, 0)}),
            (30, {head: (34, 0, 0), armL: (-51, 0, 34), armR: (-51, 0, -34)}, {"partial": True}),
        ]),
    ]


# =================================================================== ぬかるみがに

# 現在流用している`honegarami`と同じ関節の"種類"(胴の芯+腕+脚)を踏襲しつつ、
# 「がっしりした低い体格」に合わせて座標・太さは全面的に作り直した
# (honegaramiは直立二足の細身、こちらは低く這うがに股の甲殻)。
NUKARUMIGANI_HALF = {
    # tsubute(蛙)と同じく、胴の関節はZをほぼ揃えたまま前後(Y)で並べる
    # (Zまで一緒に上げると関節列が弧を描いて「くの字のイモムシ」になる、
    # 最初の試作の失敗)。
    #
    # honegaramiのように「胴の芯をhip-chestの2関節に分け、それぞれに
    # 左右対称の脚・腕をぶら下げる」構成を最初は試したが、隣接する2つの
    # 分岐点(hip・chest)がどちらも「親1つ+左右対称の子2つ」を持つと、
    # 関節位置をどう調整してもSkinモディファイアが面を正しく解決できず、
    # 平らな破れ面や裂け目ができることを検証用スクリプトで突き止めた
    # (honegarami自身はhip・chestの左右対称の子がどちらもY(前後)を
    # 親と揃えているため問題が起きない、と分かった)。
    # 対策として胴の芯を"hip"1関節に一本化し、腕(shoulder)・脚(thigh)の
    # 左右対称の子はどちらもhipとほぼ同じY(前後位置)に揃えている。
    "hip": (0.0, 0.020, 0.170),
    "neck": (0.0, -0.110, 0.165),
    "head": (0.0, -0.190, 0.150),
    "crown": (0.0, -0.210, 0.170),
    "shoulder.L": (0.235, 0.010, 0.170),
    "elbow.L": (0.330, -0.070, 0.145),
    "hand.L": (0.410, -0.150, 0.120),
    "thigh.L": (0.225, 0.030, 0.075),
    "knee.L": (0.278, 0.065, 0.035),
    "foot.L": (0.240, 0.015, 0.010),
}
NUKARUMIGANI_RADII_HALF = {
    # 胴(hip・neck・head)は大きな半径どうしを重ねて低く丸い甲羅にする。
    # 手足は関節どうしの間隔を狭く・太さは太めにして、丸太のようにずんぐり
    # したがっしりした手足にする(ただし胴の半径は明確に超える距離まで
    # 離し、まぶたむしで脚が消えた反省を踏まえている)。
    "hip": 0.190, "neck": 0.115, "head": 0.090, "crown": 0.035,
    "shoulder.L": 0.090, "elbow.L": 0.105, "hand.L": 0.058,
    "thigh.L": 0.066, "knee.L": 0.050, "foot.L": 0.032,
}
NUKARUMIGANI_BONES_HALF = [
    ("hip", "neck"), ("neck", "head"), ("head", "crown"),
    ("hip", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_nukarumigani():
    """
    ぬかるみに根を張るように動きが鈍いが、力比べになると存外強いがに股の甲殻。
    honegaramiと同じ「胴の芯+腕+脚」の関節の"種類"を踏襲するが、直立させず、
    胴の芯を1関節(hip)に一本化して低く丸いドーム状にし、腕の先
    (elbow-hand)を大ぶりなハサミに仕立てる。
    """
    joints = C.mirrored(NUKARUMIGANI_HALF)
    radii = C.mirrored_radii(NUKARUMIGANI_RADII_HALF)
    bones = C.mirrored_bones(NUKARUMIGANI_BONES_HALF)

    body = C.build_skinned("nukarumigani", joints, bones, radii, root="hip", subsurf=2)

    shell = C.make_material("nukaru_shell", (0.38, 0.50, 0.52), roughness=0.55)
    under = C.make_material("nukaru_under", (0.22, 0.30, 0.34), roughness=0.62)

    # 脚(thigh-knee-foot)の関節に近い面だけ暗い色にし、甲殻とハサミは
    # 明るい灰みの水色系のまま残す(gajiriの耳の塗り分けと同じ、関節からの
    # 距離で判定する手法)。閾値は甲殻(半径0.15〜0.17)を巻き込まない
    # 0.10に絞り、実際の面数を数えて偏りがないか検証している
    leg_joints = [
        Vector(joints[name])
        for side in ("L", "R")
        for name in (f"thigh.{side}", f"knee.{side}", f"foot.{side}")
    ]
    C.assign_materials_by_region(
        body, [shell, under],
        lambda c: 1 if min((c - j).length for j in leg_joints) < 0.10 else 0,
    )
    leg_faces = sum(1 for p in body.data.polygons if p.material_index == 1)
    total_faces = len(body.data.polygons)
    print(f"nukarumigani: 脚の暗色面 {leg_faces}/{total_faces} "
          f"({leg_faces / total_faces:.1%})")

    extras = []

    # 目は関節ではなく、甲殻の前縁から突き出た柄付きの目にする(がに股の
    # 甲殻らしさを出すための飾りで、eyeball()を柄の先端に乗せる)
    stalk_mat = C.make_material("nukaru_stalk", (0.30, 0.40, 0.42), roughness=0.5)
    for side in (-1.0, 1.0):
        stalk = C.cylinder(f"nukaru_stalk{side}", (0.050 * side, -0.175, 0.235),
                           0.014, 0.060, segments=10)
        C.assign_material(stalk, stalk_mat)
        extras.append(stalk)
        extras += eyeball(f"nukaru_eye{side}", (0.050 * side, -0.195, 0.268), 0.020,
                          look=(0.15 * side, -1.0, 0.05),
                          white=(0.86, 0.90, 0.82), dark=(0.09, 0.08, 0.07))

    # ハサミの先端。爪の丸い塊そのものはelbow-handの太い皮(Skin)に任せ、
    # 先端の「はさむ2枚」だけを小さいboxで足す(honegaramiの歯と同じ、
    # 主形状に対して控えめな大きさの飾りにする。板状メッシュを手動で
    # シアーさせるのはmabutamushiで壊れたので避け、box+条件付きスケールで
    # 先端を絞るだけにする)
    claw_mat = C.make_material("nukaru_claw", (0.30, 0.40, 0.42), roughness=0.5)
    claw_edge = C.make_material("nukaru_claw_edge", (0.66, 0.76, 0.74), roughness=0.32)
    for side in (-1.0, 1.0):
        hx, hy, hz = NUKARUMIGANI_HALF["hand.L"]
        hx *= side
        for tag, dz, length in (("upper", 0.016, 0.052), ("lower", -0.016, 0.040)):
            finger = C.box(f"nukaru_claw_{tag}{side}", (hx, hy - 0.018, hz + dz),
                          (0.026, length, 0.020), bevel=0.007)
            for vert in finger.data.vertices:
                if vert.co.y < hy - 0.018 - length * 0.3:
                    vert.co.x *= 0.4
                    vert.co.z *= 0.5
            C.assign_material(finger, claw_mat)
            extras.append(finger)
            tip = C.uv_sphere(f"nukaru_claw_{tag}_tip{side}",
                              (hx, hy - 0.018 - length * 0.55, hz + dz * 0.5), 0.012,
                              segments=10, rings=8)
            C.assign_material(tip, claw_edge)
            extras.append(tip)

    # 背の甲殻に小さな瘤を3つ並べて質感を足す(kirimizuchiの棘と同じ、
    # primitiveを貼るだけの安全な手法)
    ridge_mat = C.make_material("nukaru_ridge", (0.44, 0.56, 0.56), roughness=0.5)
    for i, (y, z, r) in enumerate([
        (0.050, 0.215, 0.036), (-0.020, 0.245, 0.040), (-0.090, 0.235, 0.034),
    ]):
        ridge = C.uv_sphere(f"nukaru_ridge{i}", (0.0, y, z), r,
                            segments=14, rings=10, scale=(1.0, 1.0, 0.55))
        C.assign_material(ridge, ridge_mat)
        extras.append(ridge)

    mesh = C.join([body] + extras, "nukarumigani")
    armature = C.build_armature("nukarumigani", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def nukarumigani_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・ハサミの先の遅れ追従(二次揺れ)を足してある。
    """
    spine = "hip-neck"
    headb = "neck-head"
    armL, armR = "hip-shoulder.L", "hip-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    handL, handR = "elbow.L-hand.L", "elbow.R-hand.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 動きが鈍い分、腰(spine)は据わったまま、ハサミだけがゆっくり開閉する。
        # ハサミの先(handL,R)が腕(armL,R)より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {spine: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10),
                 handL: (0, 0, 0), handR: (0, 0, 0)}),
            (26, {spine: (2, 0, 0), headb: (2, 0, 0),
                  armL: (0, 0, 18), armR: (0, 0, -18)}),
            (28, {handL: (0, 0, -8), handR: (0, 0, 8)}, {"partial": True}),
            (52, {spine: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (54, {handL: (0, 0, 0), handR: (0, 0, 0)}, {"partial": True}),
        ]),
        # がに股のまま、左右の脚を交互に踏みしめて重く進む
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-14, 0, 0), shinR: (10, 0, 0),
                 armL: (0, 0, 6), armR: (0, 0, -6)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  armL: (0, 0, 10), armR: (0, 0, -10)}),
            (21, {legL: (-18, 0, 0), legR: (18, 0, 0), shinL: (10, 0, 0), shinR: (-14, 0, 0),
                  armL: (0, 0, 6), armR: (0, 0, -6)}),
            (31, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  armL: (0, 0, 10), armR: (0, 0, -10)}),
            (41, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-14, 0, 0), shinR: (10, 0, 0),
                  armL: (0, 0, 6), armR: (0, 0, -6)}),
        ]),
        # 両方のハサミを大きく開いてから、力比べで挟み潰すように閉じる
        # 両方のハサミを大きく開いてから、LINEARで力比べで挟み潰すように閉じる
        ("attack", [
            (1, {armL: (0, 0, 10), armR: (0, 0, -10), handL: (0, 0, 0), handR: (0, 0, 0)}),
            (7, {armL: (-14, 0, 40), armR: (-14, 0, -40),
                 handL: (0, 0, -34), handR: (0, 0, 34), spine: (-6, 0, 0)}, {"interp": "LINEAR"}),
            (13, {armL: (18, 0, -6), armR: (18, 0, 6),
                  handL: (0, 0, 30), handR: (0, 0, -30), spine: (8, 0, 0)}),
            (24, {armL: (0, 0, 10), armR: (0, 0, -10), handL: (0, 0, 0), handR: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。振幅・戻り時間は現行どおり中程度に保つ
        ("hit", [
            (1, {spine: (0, 0, 0), headb: (0, 0, 0)}, {"interp": "LINEAR"}),
            (5, {spine: (-10, 0, 0), headb: (-14, 0, 0),
                 armL: (-8, 0, 20), armR: (-8, 0, -20)}),
            (16, {spine: (0, 0, 0), headb: (0, 0, 0)}),
        ]),
        # 力尽きて、がに股の脚から順にLINEARで鋭くぬかるみへ沈み込むように
        # 崩れる。26f到達後、腰がほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {spine: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {spine: (-14, 0, 4), legL: (-30, 0, 0), legR: (-30, 0, 0),
                  armL: (-20, 0, 30), armR: (-20, 0, -30)}),
            (26, {spine: (-40, 0, 10), legL: (-64, 0, 0), legR: (-64, 0, 0),
                  shinL: (-50, 0, 0), shinR: (-50, 0, 0),
                  armL: (-46, 0, 55), armR: (-46, 0, -55)}),
            (30, {spine: (-35, 0, 9)}, {"partial": True}),
        ]),
    ]


# =================================================================== あしあとどり

# 現在流用している`purun`の関節の"種類"(縦の芯1本)を出発点にしつつ、
# swarmで複数体が同時に群れる鳥のため、purunにはない頭・尾・脚を新たに
# 生やす形で全面的に作り直した(mabutamushi/nukarumiganiと同じ、
# 「関節の種類は踏襲するが座標構成はゼロから」の方針)。
# 胴(body, root)から頭・尾・左右の脚をそれぞれ1本ずつ分岐させるだけの、
# 既存モデル中もっとも少ない部類の関節数にとどめ、swarmで複数体まとめて
# 描画される負荷をmabutamushiよりさらに抑える。
ASHIATODORI_HALF = {
    "body": (0.0, 0.010, 0.150),
    "head": (0.0, -0.135, 0.225),
    "tail": (0.0, 0.205, 0.165),
    "leg.L": (0.062, 0.010, 0.055),
    "foot.L": (0.055, -0.025, 0.008),
}
ASHIATODORI_RADII_HALF = {
    "body": 0.090, "head": 0.056, "tail": 0.032,
    "leg.L": 0.024, "foot.L": 0.015,
}
ASHIATODORI_BONES_HALF = [
    ("body", "head"), ("body", "tail"),
    ("body", "leg.L"), ("leg.L", "foot.L"),
]


def build_ashiatodori():
    """
    消えていく足跡を追いかける鳥。1羽では頼りなく、群れで現れるswarm。
    丸い胴に頭と尾を突き出しただけの簡略なシルエットにして、2本脚で
    立たせる。関節数を絞るぶん、脚の付け根(leg.L/R)は胴の半径
    (0.090)をはっきり超える位置に置いて呑み込まれないようにしている
    (距離0.113、mabutamushiの反省を踏まえた余裕を確保)。
    """
    joints = C.mirrored(ASHIATODORI_HALF)
    radii = C.mirrored_radii(ASHIATODORI_RADII_HALF)
    bones = C.mirrored_bones(ASHIATODORI_BONES_HALF)

    body = C.build_skinned("ashiatodori", joints, bones, radii, root="body", subsurf=2)

    # 配色は第2地方(忘れ潮の湿地)のテーマどおり、霧と水を思わせる
    # 灰みがかった水色・青緑系。背は濃いめ、腹は明るく霧がかった色にする
    # (purun/mabutamushiと同じ、高さで切る塗り分け)。脚だけは
    # nukarumiganiと同じ「関節からの距離」判定で別トーンにする。
    back = C.make_material("ashiato_back", (0.36, 0.52, 0.55), roughness=0.55)
    belly = C.make_material("ashiato_belly", (0.70, 0.80, 0.80), roughness=0.4)
    leg_mat = C.make_material("ashiato_leg", (0.26, 0.30, 0.33), roughness=0.6)

    # 脚は胴の最下点(体中心0.150-半径0.090=0.060)よりはっきり低い位置
    # (関節はz=0.055/0.008)にしか無いので、高さだけで胴と分離できる
    # (距離判定にすると胴の付け根まで巻き込んで塗り分けが偏った反省を
    # 踏まえ、kirimizuchi/nukarumiganiの距離判定ではなく高さ判定にした)
    def classify(c):
        if c.z < 0.05:
            return 2
        return 0 if c.z > 0.13 else 1

    C.assign_materials_by_region(body, [back, belly, leg_mat], classify)
    leg_faces = sum(1 for p in body.data.polygons if p.material_index == 2)
    total_faces = len(body.data.polygons)
    print(f"ashiatodori: 脚の暗色面 {leg_faces}/{total_faces} "
          f"({leg_faces / total_faces:.1%})")

    # 頭は胴(半径0.090)よりずっと細い関節1本の"末端"のため、Skin+subsurfで
    # 想定より縮む(検証用スクリプトで頂点座標を直接プローブして確認、
    # mabutamushiの反省どおり)。目・くちばしは公称半径ではなく、実際に
    # 生成された頭表面の座標(プローブ結果: 頭頂点は概ねy=-0.10〜-0.14、
    # z=0.20〜0.25の範囲)に合わせて置いている。
    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"ashiato_eye{side}", (0.024 * side, -0.148, 0.222), 0.014,
                          look=(0.2 * side, -1.0, 0.0),
                          white=(0.90, 0.94, 0.92), dark=(0.08, 0.09, 0.10))

    # くちばし。頭の先端に小さな箱を置き、先端側の頂点だけを中心基準で
    # 縮めて尖らせる(nukarumiganiのハサミ先端と同じ手法。ただしそちらは
    # ワールド座標で直接スケールしており、中心がZ=0から離れた形状に
    # 使うと軸ごとずれる。ここでは中心からの相対値で縮めて、ずれを防ぐ)
    beak_mat = C.make_material("ashiato_beak", (0.30, 0.28, 0.24), roughness=0.5)
    beak_y, beak_z = -0.160, 0.205
    beak = C.box("ashiato_beak", (0.0, beak_y, beak_z), (0.024, 0.044, 0.016), bevel=0.003)
    for vert in beak.data.vertices:
        if vert.co.y < beak_y:
            vert.co.x *= 0.15
            vert.co.z = beak_z + (vert.co.z - beak_z) * 0.3
    C.assign_material(beak, beak_mat)
    extras.append(beak)

    # 畳んだ翼。胴の両脇に控えめな瘤を1つずつ乗せるだけ
    # (kirimizuchi/nukarumiganiの棘・瘤と同じprimitive貼り付け)
    wing_mat = C.make_material("ashiato_wing", (0.30, 0.44, 0.47), roughness=0.5)
    for side in (-1.0, 1.0):
        wing = C.uv_sphere(f"ashiato_wing{side}", (0.078 * side, 0.040, 0.133), 0.048,
                           segments=14, rings=10, scale=(0.5, 1.3, 0.9))
        C.assign_material(wing, wing_mat)
        extras.append(wing)

    # 足跡を追う鳥らしく、3本指の小さな爪を左右の足に生やす。
    # cone()はZ軸沿いにしか作れないので回転はかけず、先端が下(接地面)を
    # 向くよう根元(半径大)を足の高さに、先端(半径小)をその下に置くだけの
    # 素直な配置にする(honegaramiの歯・kirimizuchiの棘と同じprimitive
    # 貼り付け。回転で位置がずれたくちばしの反省を踏まえ、ここでは
    # 回転そのものを使わない)
    claw_mat = C.make_material("ashiato_claw", (0.22, 0.25, 0.27), roughness=0.55)
    for side in (-1.0, 1.0):
        fx, fy, fz = ASHIATODORI_HALF["foot.L"]
        fx *= side
        claw_depth = 0.018
        for dx, dy in ((-0.014, -0.004), (0.0, -0.012), (0.014, -0.004)):
            top_z = fz
            claw = C.cone(
                f"ashiato_claw{side}_{dx}",
                (fx + dx * side, fy + dy, top_z - claw_depth * 0.5),
                0.002, 0.009, claw_depth, segments=6,
            )
            C.assign_material(claw, claw_mat)
            extras.append(claw)

    mesh = C.join([body] + extras, "ashiatodori")
    armature = C.build_armature("ashiatodori", joints, bones, mesh, root="body")
    return [mesh, armature], armature


def ashiatodori_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    attackの突きにLINEAR+行き過ぎ、hitの入りにLINEAR、idleのtailが
    headより2フレーム遅れる二次揺れ、dieの初動LINEAR+着地の跳ね返りを
    足した。swarm種族なので振り自体は現行のまま、緩急だけを付け足す。
    """
    head = "body-head"
    tail = "body-tail"
    legL, legR = "body-leg.L", "body-leg.R"
    footL, footR = "leg.L-foot.L", "leg.R-foot.R"
    return [
        # 群れの中で忙しなく足跡を探し、頭と尾を小刻みに振る。
        # tailはheadより2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), tail: (0, 0, 0)}),
            (14, {head: (-8, 6, 0), legL: (3, 0, 0), legR: (-3, 0, 0)}),
            (16, {tail: (10, 0, 0)}, {"partial": True}),
            (28, {head: (4, -6, 0), legL: (-3, 0, 0), legR: (3, 0, 0)}),
            (30, {tail: (-10, 0, 0)}, {"partial": True}),
            (38, {head: (0, 0, 0), tail: (0, 0, 0)}),
        ]),
        # 消えていく足跡を追う、せわしない小走り
        ("walk", [
            (1, {legL: (30, 0, 0), legR: (-30, 0, 0), footL: (-14, 0, 0), footR: (10, 0, 0),
                 head: (0, 4, 0), tail: (-8, 0, 0)}),
            (5, {legL: (0, 0, 0), legR: (0, 0, 0), footL: (0, 0, 0), footR: (0, 0, 0),
                 head: (0, 0, 0), tail: (0, 0, 0)}),
            (9, {legL: (-30, 0, 0), legR: (30, 0, 0), footL: (10, 0, 0), footR: (-14, 0, 0),
                 head: (0, -4, 0), tail: (8, 0, 0)}),
            (13, {legL: (0, 0, 0), legR: (0, 0, 0), footL: (0, 0, 0), footR: (0, 0, 0),
                  head: (0, 0, 0), tail: (0, 0, 0)}),
        ]),
        # 引く(タメ)→LINEARで鋭く突く→行き過ぎ→戻る、の4段
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (-20, 0, 0), tail: (14, 0, 0)}, {"interp": "LINEAR"}),
            (8, {head: (26, 0, 0), tail: (-10, 0, 0)}),
            (10, {head: (30, 0, 0), tail: (-12, 0, 0)}),
            (16, {head: (0, 0, 0), tail: (0, 0, 0)}),
        ]),
        # 入り(1f→4f)にLINEARを足して鋭く怯む。短く収める既存方針は維持
        ("hit", [
            (1, {head: (0, 0, 0), tail: (0, 0, 0)}),
            (4, {head: (20, 0, 0), tail: (-16, 0, 0), legL: (-10, 0, 0), legR: (-10, 0, 0)},
             {"interp": "LINEAR"}),
            (13, {head: (0, 0, 0), tail: (0, 0, 0), legL: (0, 0, 0), legR: (0, 0, 0)}),
        ]),
        # 初動(1f→9f)にLINEARを足して鋭い倒れ込みにし、
        # 20f到達後に脚をわずかに戻す小さな跳ね返りを1回追加する
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (30, 0, 0), tail: (20, 0, 0), legL: (-34, 0, 0), legR: (-34, 0, 0),
                 footL: (24, 0, 0), footR: (24, 0, 0)}),
            (20, {head: (54, 0, 0), tail: (34, 0, 0), legL: (-60, 0, 0), legR: (-60, 0, 0),
                  footL: (44, 0, 0), footR: (44, 0, 0)}),
            (24, {legL: (-54, 0, 0), legR: (-54, 0, 0), footL: (40, 0, 0), footR: (40, 0, 0)}),
        ]),
    ]


# =================================================================== わすれみずち

# 現在流用している`tsubute`と同じ関節の"種類"(胴の芯+頭+腕+脚、7本の骨)を
# そのまま踏襲する(plan/models/archive/model-wasuremizuchi.md参照)。ただし
# ずんぐりした蛙とは違い、coward(瀕死で離脱)らしい「小柄で華奢な、
# 逃げ足の速さを感じさせる軽いシルエット」にするため、胴・頭・手足の
# 半径をtsubuteよりはっきり細くし、関節間の距離も詰めて小柄にまとめている。
WASURE_HALF = {
    "hip": (0.0, 0.055, 0.150),
    "chest": (0.0, -0.020, 0.185),
    "head": (0.0, -0.110, 0.205),
    "armF.L": (0.105, -0.060, 0.140),
    "handF.L": (0.130, -0.110, 0.065),
    "kneeB.L": (0.115, 0.110, 0.100),
    "ankleB.L": (0.105, 0.020, 0.035),
    "footB.L": (0.090, -0.040, 0.010),
}
WASURE_RADII_HALF = {
    "hip": 0.095, "chest": 0.088, "head": 0.078,
    "armF.L": 0.020, "handF.L": 0.016,
    "kneeB.L": 0.034, "ankleB.L": 0.020, "footB.L": 0.016,
}
WASURE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_wasuremizuchi():
    """
    すっかり忘れ去られた水霊。モヤウツボの成れの果てに近い存在で、
    触れられるとすぐ深みへ逃げ込む(coward)。tsubuteと同じ関節構成を
    使うが、丸々とした蛙ではなく、実体の薄い、今にも霧へ紛れて消えそうな
    小柄で華奢なシルエットにする。頭の後ろから尾のように霧が尾を引き、
    先端ほど小さく淡く消えていく(常に逃げる準備ができている様子)。
    """
    joints = C.mirrored(WASURE_HALF)
    radii = C.mirrored_radii(WASURE_RADII_HALF)
    bones = C.mirrored_bones(WASURE_BONES_HALF)

    body = C.build_skinned("wasuremizuchi", joints, bones, radii, root="chest", subsurf=2)

    # 第2地方(忘れ潮の湿地)のテーマに合わせ、霧と水を思わせる灰みがかった
    # 水色・青緑系でまとめる。背は明るい霧色、腹は沈んだ暗い青灰色、
    # 手足は実体を失いかけた霧そのもののような淡い色の3トーンに塗り分ける。
    dorsal = C.make_material("wasure_dorsal", (0.62, 0.74, 0.75), roughness=0.5, emission=0.05)
    ventral = C.make_material("wasure_ventral", (0.26, 0.34, 0.40), roughness=0.65)
    misty_limb = C.make_material("wasure_limb", (0.78, 0.88, 0.88), roughness=0.35, emission=0.12)

    # 手足(腕・脚)は関節からの距離で判定する(kirimizuchiの触手・
    # nukarumiganiの脚と同じ手法)。胴は高さと中心からの距離で腹面だけを
    # 切り出す(tsubuteと同じ、下から見上げたときだけ見える面に絞る手法)。
    limb_pts = [
        Vector(joints[name])
        for side in ("L", "R")
        for name in (f"armF.{side}", f"handF.{side}", f"kneeB.{side}",
                     f"ankleB.{side}", f"footB.{side}")
    ]

    def classify(c):
        if min((c - p).length for p in limb_pts) < 0.033:
            return 2
        if c.z < 0.115 and abs(c.x) < 0.075:
            return 1
        return 0

    C.assign_materials_by_region(body, [dorsal, ventral, misty_limb], classify)
    counts = [0, 0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"wasuremizuchi: 背{counts[0]} 腹{counts[1]} 手足{counts[2]} "
          f"/ 計{total} ({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    # 怯えて見開いた大きめの目。頭の前面から半分飛び出させる
    for side in (-1.0, 1.0):
        extras += eyeball(f"wasure_eye{side}", (0.032 * side, -0.172, 0.220), 0.028,
                          look=(0.35 * side, -0.9, 0.15), squash=1.1,
                          white=(0.90, 0.95, 0.96), dark=(0.10, 0.15, 0.20))

    # 頭の両脇に、水に紛れる薄い膜状のひれを1枚ずつ
    fin_mat = C.make_material("wasure_fin", (0.70, 0.85, 0.86), roughness=0.3, emission=0.10)
    for side in (-1.0, 1.0):
        fin = C.box(f"wasure_fin{side}", (0.098 * side, -0.095, 0.195),
                    (0.005, 0.052, 0.048), bevel=0.004)
        C.assign_material(fin, fin_mat)
        extras.append(fin)

    # 頭の後ろから尾のように霧が尾を引く。先端ほど小さく・淡く・
    # 発光を強めて、霧へ溶けていく途中のように見せる
    for i, (y, z, r, glow) in enumerate([
        (0.145, 0.165, 0.048, 0.06), (0.215, 0.205, 0.034, 0.18),
        (0.270, 0.245, 0.022, 0.45), (0.310, 0.275, 0.012, 0.9),
    ]):
        wisp_mat = C.make_material(f"wasure_wisp{i}", (0.80, 0.90, 0.90),
                                   roughness=0.25, emission=glow)
        wisp = C.uv_sphere(f"wasure_wisp{i}", (0.0, y, z), r, segments=12, rings=9)
        C.assign_material(wisp, wisp_mat)
        extras.append(wisp)

    mesh = C.join([body] + extras, "wasuremizuchi")
    armature = C.build_armature("wasuremizuchi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def wasuremizuchi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・突き(LINEAR補間)・二次揺れ・die跳ね返りを足してある。
    doc本文はattackの突く段(4→6)を「現行の-30/-30を-36/-36まで振る」と
    書いているが、これはタメの値をそのまま深めるだけで突き(タメと逆方向
    への突き出し)にならず文脈と矛盾するため、他種族(nemurimogura/
    wasuremboneなど)で同種の記述矛盾を解決した際と同じく、「元のピーク
    (14)を増幅・前倒しし、元のピーク値を行き過ぎの戻り先にする」という
    規約の基本パターンで解釈して実装した。
    """
    head = "chest-head"
    trunk = "chest-hip"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    shinL, shinR = "kneeB.L-ankleB.L", "kneeB.R-ankleB.R"
    return [
        # 絶えず怯えているような、小刻みで落ち着かない待機。腕(armL/armR)が
        # 頭(head)より2フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
            (10, {head: (-6, 3, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
            (12, {armL: (-8, 0, 6), armR: (-8, 0, -6)}, {"partial": True}),
            (20, {head: (4, -3, 0), armL: (-8, 0, 6), armR: (-8, 0, -6)}),
            (22, {armL: (4, 0, -4), armR: (4, 0, 4)}, {"partial": True}),
            (30, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
        ]),
        # trunk(chest-hip)はgajiriと同じく胴の骨がほぼ水平なため、
        # footfall-dipは見送る。逃げ足の速さを感じさせる素早い跳ねは維持
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                 head: (0, 0, 0)}),
            (4, {legL: (40, 0, 0), legR: (-30, 0, 0), shinL: (-24, 0, 0), shinR: (18, 0, 0),
                 head: (6, 0, 0)}),
            (8, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                 head: (0, 0, 0)}),
            (12, {legL: (-30, 0, 0), legR: (40, 0, 0), shinL: (18, 0, 0), shinR: (-24, 0, 0),
                  head: (-6, 0, 0)}),
            (16, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  head: (0, 0, 0)}),
        ]),
        # 怯えながらも一瞬だけ突く弱々しい攻撃。タメ(1→4)→LINEARで鋭く
        # 突き出す(4→6、元のピークを増幅・前倒し)→行き過ぎ(6→8、元の
        # ピーク値へ戻りかける)→戻り(8→16)。当てたらすぐ引く素早さは維持
        ("attack", [
            (1, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
            (4, {head: (-10, 0, 0), armL: (-30, 0, 14), armR: (-30, 0, -14)}),
            (6, {head: (13, 0, 0), armL: (20, 0, -6), armR: (20, 0, 6)}, {"interp": "LINEAR"}),
            (8, {head: (10, 0, 0), armL: (14, 0, -6), armR: (14, 0, 6)}),
            (16, {head: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4)}),
        ]),
        # 大きく仰け反り、すぐさま深みへ逃げ込もうとする。入りをLINEARで
        # 鋭くする。振幅・戻りのタイミングは現行どおり大きめ・ゆっくり
        ("hit", [
            (1, {trunk: (0, 0, 0), head: (0, 0, 0)}),
            (3, {trunk: (-16, 0, 0), head: (18, 0, 0), armL: (-20, 0, 20), armR: (-20, 0, -20)},
             {"interp": "LINEAR"}),
            (12, {trunk: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 霧に溶けるように、輪郭を失ってしゃがみ込む。初動をLINEARで鋭くし、
        # しゃがみ込んだあとに頭がわずかに戻る跳ね返りを追加
        ("die", [
            (1, {trunk: (0, 0, 0), head: (0, 0, 0)}),
            (10, {trunk: (-20, 0, 10), head: (24, 0, 0), legL: (-30, 0, 0), legR: (-30, 0, 0),
                  armL: (-40, 0, 30), armR: (-40, 0, -30)}, {"interp": "LINEAR"}),
            (22, {trunk: (-50, 0, 22), head: (40, 0, 0), legL: (-60, 0, 0), legR: (-60, 0, 0),
                  armL: (-70, 0, 50), armR: (-70, 0, -50)}),
            (26, {head: (34, 0, 0)}, {"partial": True}),
        ]),
    ]




# =================================================================== きのこおとこ

# plan/models/archive/model-kinokootoko.md: 現在流用しているmadoromiの関節構成
# (root-stem-capbase-captop の縦一本、傘は太い→細いの円錐)をベースにしつつ、
# 「眠気を吸い込んで育った茸そのものが人の形に育ったもの」という設定に
# 合わせ、humanoidとして腕・脚を新たに生やす(mabutamushi/nukarumigani/
# ashiatodoriと同じ、「関節の種類は踏襲するが座標構成はゼロから」の方針)。
# 胴の芯はhonegaramiと同じ「hip-chest」の2関節に分け、それぞれに左右対称の
# 脚(thigh)・腕(shoulder)をぶら下げる構成にする。nukarumiganiが検証した
# 「隣接する2つの分岐点がどちらも1親+左右対称2子を持つとSkinが面を
# 解決できず破れる」問題は、honegaramiと同様に分岐する子(thigh.L/R,
# shoulder.L/R)のYを親(hip, chest)とそろえる(前後にずらさない)ことで
# 避けている。
# 首から上は neck -> head(顔) -> capbase(傘の付け根、太い) -> captop(傘の先、
# 細い) の4関節。顔の上に傘がフードのようにかぶさるシルエットにする。
KINOKOOTOKO_HALF = {
    "hip": (0.0, 0.0, 0.32),
    "chest": (0.0, 0.0, 0.50),
    "neck": (0.0, 0.0, 0.60),
    "head": (0.0, -0.01, 0.68),
    "capbase": (0.0, 0.0, 0.80),
    "captop": (0.0, 0.0, 0.95),
    # 腕は肩からはっきり外へ張り出させたうえで下ろす。最初の試作では
    # shoulder/thighのX(横位置)が近く、腕もほぼ真下に垂らしていたため、
    # 静止姿勢(全回転0)で腕と脚が見分けづらく「4本脚の椅子」のような
    # シルエットになってしまった(プレビューで発覚)。honegaramiが
    # 「肩を腰よりずっと外に置き、腕を細くする」ことで腕と脚を
    # はっきり分けているのを踏まえ、肩をさらに外へ、肘・手も横方向へ
    # 張り出させて、脚は逆に胴へ寄せて再設計した。
    "shoulder.L": (0.24, 0.0, 0.52),
    "elbow.L": (0.36, -0.02, 0.46),
    "hand.L": (0.44, -0.05, 0.38),
    "thigh.L": (0.14, 0.0, 0.30),
    "knee.L": (0.145, 0.0, 0.15),
    "foot.L": (0.145, -0.05, 0.02),
}
KINOKOOTOKO_RADII_HALF = {
    # hip/chestはがっしり太く、shoulder/thighは胴の半径をはっきり超える
    # 距離(いずれも胴半径の約1.2〜1.8倍)に置いて呑み込まれないようにする
    # (mabutamushi/ashiatodoriの反省を踏まえ、比率をnukarumigani・
    # honegaramiと同水準以上に確保して検証済み)。腕は脚よりわずかに
    # 細くして、脚(常に真下)と腕(外へ張り出す)をシルエットでも
    # 見分けやすくする。
    "hip": 0.115, "chest": 0.135, "neck": 0.075, "head": 0.105,
    "capbase": 0.300, "captop": 0.050,
    "shoulder.L": 0.075, "elbow.L": 0.052, "hand.L": 0.060,
    "thigh.L": 0.078, "knee.L": 0.058, "foot.L": 0.050,
}
KINOKOOTOKO_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"),
    ("head", "capbase"), ("capbase", "captop"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def kinoko_cap_surface_z(dist: float) -> float:
    """
    傘(head-capbase-captop)の表面の高さ。madoromiのcap_surface_z()と同じ
    考え方で、capbase(半径0.300)からcaptop(半径0.050)へ向かう円錐を
    サブディビジョンで丸まるぶん少し内側に見積もって近似する。
    """
    base_z = KINOKOOTOKO_HALF["capbase"][2]
    top_z = KINOKOOTOKO_HALF["captop"][2]
    base_r = KINOKOOTOKO_RADII_HALF["capbase"] * 0.86
    top_r = KINOKOOTOKO_RADII_HALF["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.014


def build_kinokootoko():
    """
    眠気を吸い込んで育った茸そのものが人の形に育ったもの。melee AIの主力に
    ふさわしく、がっしりした体格で正面から迫る力強いシルエットにする。
    配色は第3地方(まどろみの茸林)のテーマどおり、湿った土色の体に
    胞子の淡い黄土色の傘をかぶった二色構成にする。
    """
    joints = C.mirrored(KINOKOOTOKO_HALF)
    radii = C.mirrored_radii(KINOKOOTOKO_RADII_HALF)
    bones = C.mirrored_bones(KINOKOOTOKO_BONES_HALF)

    body = C.build_skinned("kinokootoko", joints, bones, radii, root="hip", subsurf=2)

    body_mat = C.make_material("kinoko_body", (0.40, 0.29, 0.19), roughness=0.78)
    cap_mat = C.make_material("kinoko_cap", (0.80, 0.70, 0.44), roughness=0.5)

    # 傘(head から上)だけ淡い黄土色にする。腕・脚は傘の高さまで届かないので
    # 高さだけで塗り分けられる(ashiatodoriの背/腹/脚と同じ手法)。
    # しきい値はheadとcapbaseのちょうど中間(0.74)に置き、実際の面数を
    # 数えて偏りがないか検証する。
    CAP_Z = 0.74

    def classify(c):
        return 1 if c.z > CAP_Z else 0

    C.assign_materials_by_region(body, [body_mat, cap_mat], classify)
    cap_faces = sum(1 for p in body.data.polygons if p.material_index == 1)
    total_faces = len(body.data.polygons)
    print(f"kinokootoko: 傘の面 {cap_faces}/{total_faces} ({cap_faces / total_faces:.1%})")

    extras = []

    # 顔。半開きのmadoromiとは違い、正面から迫る力強さを出すため、
    # しっかり見開いた目と、への字に結んだ口にする
    for side in (-1.0, 1.0):
        extras += eyeball(f"kinoko_eye{side}", (0.048 * side, -0.093, 0.688), 0.024,
                          look=(0.2 * side, -1.0, 0.0),
                          white=(0.92, 0.88, 0.72), dark=(0.14, 0.08, 0.05))
    mouth = C.box("kinoko_mouth", (0.0, -0.100, 0.648), (0.034, 0.012, 0.010), bevel=0.003)
    C.assign_material(mouth, C.make_material("kinoko_mouth_m", (0.20, 0.11, 0.08), roughness=0.5))
    extras.append(mouth)

    # 胴に食い込む、成長の証である硬い樹皮質のパッチ(plan/models/
    # sheet-kinokootoko.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い胴の表面に唯一の
    # 角のある面を作る、面取りした箱
    bark_mat = C.make_material("kinoko_bark", (0.28, 0.19, 0.12), roughness=0.85)
    bark = C.box("kinoko_bark", (0.0, -0.128, 0.480), (0.052, 0.022, 0.070), bevel=0.010)
    C.assign_material(bark, bark_mat)
    extras.append(bark)

    # 傘の斑点。madoromiと同じく、傘の断面に沿った高さに置かないと
    # 浮いたり埋まったりする(kinoko_cap_surface_zで補正)
    spot_mat = C.make_material("kinoko_spot", (0.94, 0.90, 0.76), roughness=0.6)
    for i, (angle_deg, dist, r) in enumerate([
        (210.0, 0.070, 0.044), (320.0, 0.130, 0.038), (70.0, 0.110, 0.040),
        (150.0, 0.165, 0.032), (20.0, 0.190, 0.026),
    ]):
        angle = math.radians(angle_deg)
        spot = C.uv_sphere(
            f"kinoko_spot{i}",
            (math.cos(angle) * dist, math.sin(angle) * dist, kinoko_cap_surface_z(dist)),
            r, segments=12, rings=8, scale=(1.0, 1.0, 0.40),
        )
        C.assign_material(spot, spot_mat)
        extras.append(spot)

    # 傘の縁から舞い散る胞子。atkMulInSporedRoomのフレーバーに合わせ、
    # 表面からわずかに浮かせた小さな発光球を3つ添える
    # (primitiveを貼るだけの安全な手法。kirimizuchi/nukarumiganiの棘・
    # 瘤と同じ)
    spore_mat = C.make_material("kinoko_spore", (0.86, 0.78, 0.40), roughness=0.4, emission=0.5)
    for i, (angle_deg, dist) in enumerate([(80.0, 0.24), (200.0, 0.27), (320.0, 0.22)]):
        angle = math.radians(angle_deg)
        cx, cy = math.cos(angle) * dist, math.sin(angle) * dist
        spore = C.uv_sphere(f"kinoko_spore{i}", (cx, cy, kinoko_cap_surface_z(dist) + 0.030),
                            0.014, segments=10, rings=8)
        C.assign_material(spore, spore_mat)
        extras.append(spore)

    mesh = C.join([body] + extras, "kinokootoko")
    armature = C.build_armature("kinokootoko", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def kinokootoko_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・傘の遅れ追従(二次揺れ)・歩行の接地沈みを
    足してある。「大きくは動かず傘だけがゆったり揺れる」現行の性格づけを
    保ちながら、打撃の重さと傘の遅れ揺れを足す。
    """
    hipc = "hip-chest"
    neck = "chest-neck"
    headb = "neck-head"
    capb = "head-capbase"
    captip = "capbase-captop"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # がっしりした体格らしく、大きくは動かず傘だけがゆったり揺れる。
        # 傘(capb,captip)が胴(hipc)より3フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {hipc: (0, 0, 0), capb: (0, 0, 0), captip: (0, 0, 0),
                 armL: (0, 0, 6), armR: (0, 0, -6)}),
            (24, {hipc: (2, 0, 1), armL: (-3, 0, 10), armR: (-3, 0, -10)}),
            (27, {capb: (-4, 0, 2), captip: (3, 0, -2)}, {"partial": True}),
            (48, {hipc: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (51, {capb: (0, 0, 0), captip: (0, 0, 0)}, {"partial": True}),
        ]),
        # 力強く踏みしめて歩く。脚が接地する瞬間に胴をわずかに沈める。
        # 傘は歩調と逆位相で揺れて重みを出す
        ("walk", [
            (1, {legL: (26, 0, 0), legR: (-26, 0, 0), shinL: (-12, 0, 0), shinR: (10, 0, 0),
                 armL: (-18, 0, 6), armR: (18, 0, -6), capb: (4, 0, 0)}),
            (9, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                 armL: (0, 0, 6), armR: (0, 0, -6), capb: (0, 0, 0),
                 hipc: {"rot": (0, 0, 0), "loc": (0, -0.010, 0)}}),
            (17, {legL: (-26, 0, 0), legR: (26, 0, 0), shinL: (10, 0, 0), shinR: (-12, 0, 0),
                  armL: (18, 0, 6), armR: (-18, 0, -6), capb: (-4, 0, 0)}),
            (25, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (0, 0, 0), shinR: (0, 0, 0),
                  armL: (0, 0, 6), armR: (0, 0, -6), capb: (0, 0, 0),
                  hipc: {"rot": (0, 0, 0), "loc": (0, -0.010, 0)}}),
            (33, {legL: (26, 0, 0), legR: (-26, 0, 0), shinL: (-12, 0, 0), shinR: (10, 0, 0),
                  armL: (-18, 0, 6), armR: (18, 0, -6), capb: (4, 0, 0)}),
        ]),
        # 両腕を振りかぶり、LINEARで鋭く正面へまとめて叩きつけ、
        # わずかに行き過ぎてからゆっくり戻る
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0), capb: (0, 0, 0)}),
            (5, {armL: (-70, 0, 20), armR: (-70, 0, -20), hipc: (-10, 0, 0), capb: (6, 0, 0)},
             {"interp": "LINEAR"}),
            (8, {armL: (60, 0, -10), armR: (60, 0, 10), hipc: (16, 0, 0),
                 capb: (-10, 0, 0), captip: (-6, 0, 0)}),
            (10, {armL: (66, 0, -10), armR: (66, 0, 10), hipc: (16, 0, 0),
                  capb: (-10, 0, 0), captip: (-6, 0, 0)}),
            (20, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0), capb: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。def9の中堅なので極端な大小どちらにも
        # 振らず、振幅・戻り時間とも現行のまま維持する
        ("hit", [
            (1, {hipc: (0, 0, 0), headb: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-16, 0, 0), headb: (-14, 0, 0), capb: (-10, 0, 0),
                 armL: (-18, 0, 20), armR: (-18, 0, -20)}),
            (14, {hipc: (0, 0, 0), headb: (0, 0, 0), capb: (0, 0, 0)}),
        ]),
        # がっしりした図体が根元から崩れ落ちるように倒れる。初動をLINEARで
        # 鋭くし「最初にびくっと崩れかける」瞬間を加える。24f到達後、
        # 崩れ落ちた末端(腕や傘)が一度小さく跳ね返る
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {hipc: (-30, 0, 8), headb: (-20, 0, 0), capb: (-24, 0, 0),
                  legL: (-24, 0, 0), legR: (-24, 0, 0),
                  armL: (-50, 0, 40), armR: (-50, 0, -40)}),
            (24, {hipc: (-80, 0, 20), headb: (-34, 0, 0), capb: (-40, 0, 0),
                  legL: (-50, 0, 0), legR: (-50, 0, 0),
                  armL: (-85, 0, 60), armR: (-85, 0, -60)}),
            (28, {hipc: (-72, 0, 18), headb: (-31, 0, 0), capb: (-36, 0, 0),
                  legL: (-45, 0, 0), legR: (-45, 0, 0),
                  armL: (-77, 0, 54), armR: (-77, 0, -54)}),
        ]),
    ]


# =================================================================== ホウシトビ

# madoromiと同じ「幹1本+傘」の関節の"種類"を土台にしつつ、遠隔で胞子を
# 飛ばす個体として、傘の先から前方・斜め上へ突き出す噴出口(spout)を新たに
# 追加し、傘の背後には発射のたびに開閉する触手状の付属肢(tendril)を
# 垂らす(ashiatodori/nukarumiganiと同じ、関節の"種類"は踏襲しつつ座標構成は
# ゼロから設計する方針)。噴出口・触手はcapbaseの半径(0.215)より
# はっきり遠い位置に置き、皮に飲み込まれて見えなくなる事故を避ける。
# 最初の試作では噴出口を長く水平に伸ばしすぎ、傘とマドロミらしさが消えて
# 一本のバナナ状の塊に見えてしまった。傘の張り出しを大きくし、噴出口を
# 短く・斜め上向きにし、触手を胴の途中ではなく傘の後方へ逃がして
# シルエットの帯状の途切れを解消している。
HOUSHITOBI_HALF = {
    "root": (0.0, 0.0, 0.06),
    "stem": (0.0, 0.0, 0.19),
    "capbase": (0.0, 0.0, 0.33),
    "captop": (0.0, 0.0, 0.45),
    "spout": (0.0, -0.27, 0.43),
    "tendril.L": (0.22, 0.15, 0.26),
    "tendriltip.L": (0.32, 0.24, 0.12),
}
HOUSHITOBI_RADII_HALF = {
    "root": 0.085, "stem": 0.070, "capbase": 0.215, "captop": 0.058,
    "spout": 0.048, "tendril.L": 0.050, "tendriltip.L": 0.020,
}
HOUSHITOBI_BONES_HALF = [
    ("root", "stem"), ("stem", "capbase"), ("capbase", "captop"),
    ("capbase", "spout"),
    ("capbase", "tendril.L"), ("tendril.L", "tendriltip.L"),
]


def build_houshitobi():
    """
    舞い散る胞子の化身。マドロミダケの遠隔版というべき存在(design/characters.md)。
    傘の先からまっすぐ伸びる噴出口を主役にし、左右の触手が発射のたびに
    開いて反動を受け止める構造にする。
    """
    joints = C.mirrored(HOUSHITOBI_HALF)
    radii = C.mirrored_radii(HOUSHITOBI_RADII_HALF)
    bones = C.mirrored_bones(HOUSHITOBI_BONES_HALF)

    body = C.build_skinned("houshitobi", joints, bones, radii, root="root", subsurf=2)

    # 第3地方(まどろみの茸林)のテーマに合わせ、湿った土色の幹と、
    # 胞子を思わせる淡い黄土色の傘・噴出口・触手の2トーンに塗り分ける。
    # 噴出口・触手は関節からの距離(nukarumigani/wasuremizuchiと同じ、
    # 複数関節へのmin距離を使う安全な手法)、傘は高さで判定する
    # (単一の中心距離だけに頼る判定は誤爆した実績があるため避ける)。
    trunk_mat = C.make_material("houshi_trunk", (0.32, 0.23, 0.15), roughness=0.8)
    spore_mat = C.make_material("houshi_spore", (0.82, 0.71, 0.44), roughness=0.55, emission=0.05)

    spore_pts = [
        Vector(joints[name])
        for name in ("spout", "tendril.L", "tendril.R", "tendriltip.L", "tendriltip.R")
    ]

    def classify(c):
        if min((c - p).length for p in spore_pts) < 0.075:
            return 1
        return 1 if c.z > 0.28 else 0

    C.assign_materials_by_region(body, [trunk_mat, spore_mat], classify)
    counts = [0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"houshitobi: 幹{counts[0]} 胞子色{counts[1]} / 計{total} "
          f"({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    # 半分閉じた眠たげな目。madoromiと同じ由来(眠りを誘う胞子)を示す
    for side in (-1.0, 1.0):
        extras += eyeball(f"houshi_eye{side}", (0.072 * side, -0.203, 0.347), 0.026,
                          look=(0.2 * side, -1.0, 0.0), squash=0.45,
                          white=(0.92, 0.90, 0.82), dark=(0.10, 0.08, 0.06))

    # 噴出口の先端(plan/models/archive/sheet-houshitobi.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。胞子を飛ばす開口部を
    # 面取りした硬い円柱で表す(丸い傘の表面に唯一の角のある面を作る)
    nozzle = C.cylinder("houshi_nozzle", (0.0, -0.336, 0.448), 0.026, 0.052,
                        segments=14, axis="Y", bevel=0.007)
    C.assign_material(nozzle, C.make_material("houshi_nozzle_m", (0.14, 0.10, 0.08), roughness=0.4))
    extras.append(nozzle)

    # 噴出口の先から、飛び散る途中の胞子が尾を引くように、小さく・
    # 淡くなりながら発光を強めて浮遊する(wasuremizuchiの霧の尾と同じ手法)
    for i, (y, z, r, glow) in enumerate([
        (-0.381, 0.458, 0.020, 0.10), (-0.431, 0.478, 0.015, 0.30),
        (-0.471, 0.503, 0.011, 0.60), (-0.506, 0.533, 0.008, 1.0),
    ]):
        mote_mat = C.make_material(f"houshi_mote{i}", (0.90, 0.82, 0.55),
                                   roughness=0.3, emission=glow)
        mote = C.uv_sphere(f"houshi_mote{i}", (0.0, y, z), r, segments=10, rings=8)
        C.assign_material(mote, mote_mat)
        extras.append(mote)

    mesh = C.join([body] + extras, "houshitobi")
    armature = C.build_armature("houshitobi", joints, bones, mesh, root="root")
    return [mesh, armature], armature


def houshitobi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・触手の遅れ追従(二次揺れ)を足してある。
    浮遊系のため接地沈みは使わず、walkの滑らかなbezier補間もそのまま
    維持する(LINEARで角張らせない)。
    """
    trunk1 = "root-stem"
    trunk2 = "stem-capbase"
    cap = "capbase-captop"
    spout = "capbase-spout"
    tendrilL, tendrilR = "capbase-tendril.L", "capbase-tendril.R"
    return [
        # 微かに漂うような、ゆっくりした揺れ。
        # 左右の触手(tendrilL,R)が傘・幹より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {trunk2: (0, 0, 0), cap: (0, 0, 0), spout: (0, 0, 0),
                 tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
            (28, {trunk2: (3, 0, 2), cap: (-4, 0, -2), spout: (3, 0, 0)}),
            (30, {tendrilL: (0, 0, 16), tendrilR: (0, 0, -16)}, {"partial": True}),
            (56, {trunk2: (0, 0, 0), cap: (0, 0, 0), spout: (0, 0, 0)}),
            (58, {tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}, {"partial": True}),
        ]),
        # 左右の触手を交互にはためかせながら漂うように進む
        ("walk", [
            (1, {trunk1: (0, 0, -6), trunk2: (0, 0, 4),
                 tendrilL: (0, 0, 6), tendrilR: (0, 0, -6)}),
            (9, {trunk1: (0, 0, 6), trunk2: (0, 0, -4),
                 tendrilL: (0, 0, -20), tendrilR: (0, 0, 20)}),
            (18, {trunk1: (0, 0, -6), trunk2: (0, 0, 4),
                  tendrilL: (0, 0, 6), tendrilR: (0, 0, -6)}),
            (27, {trunk1: (0, 0, 6), trunk2: (0, 0, -4),
                  tendrilL: (0, 0, -20), tendrilR: (0, 0, 20)}),
            (36, {trunk1: (0, 0, -6), trunk2: (0, 0, 4),
                  tendrilL: (0, 0, 6), tendrilR: (0, 0, -6)}),
        ]),
        # ためてから噴出口をLINEARで勢いよく突き出し胞子を撃ち放ち、
        # わずかに行き過ぎてから漂う構えに戻る
        ("attack", [
            (1, {spout: (0, 0, 0), trunk2: (0, 0, 0), cap: (0, 0, 0),
                 tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
            (5, {spout: (24, 0, 0), trunk2: (-9, 0, 0), cap: (6, 0, 0),
                 tendrilL: (0, 0, 24), tendrilR: (0, 0, -24)}, {"interp": "LINEAR"}),
            (10, {spout: (-32, 0, 0), trunk2: (11, 0, 0), cap: (-14, 0, 0),
                  tendrilL: (0, 0, -6), tendrilR: (0, 0, 6)}),
            (13, {spout: (-20, 0, 0), trunk2: (7, 0, 0), cap: (-14, 0, 0),
                  tendrilL: (0, 0, -6), tendrilR: (0, 0, 6)}),
            (20, {spout: (0, 0, 0), trunk2: (0, 0, 0), cap: (0, 0, 0),
                  tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
        ]),
        # 入りだけLINEARで鋭くする
        ("hit", [
            (1, {trunk2: (0, 0, 0), cap: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {trunk2: (-16, 0, 0), cap: (-14, 0, 0),
                 tendrilL: (0, 0, -12), tendrilR: (0, 0, 12)}),
            (14, {trunk2: (0, 0, 0), cap: (0, 0, 0),
                  tendrilL: (0, 0, 8), tendrilR: (0, 0, -8)}),
        ]),
        # 傘と触手をしぼませながら、幹から崩れ落ちる。初動をLINEARで
        # 鋭くし、24f到達直前にしぼみきる前の萎れの小さな跳ね返りを
        # 傘(cap)と幹(trunk1)だけに追加する(倒れではなく萎れの表現)
        ("die", [
            (1, {trunk1: (0, 0, 0), trunk2: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {trunk1: (-20, 0, 8), trunk2: (-24, 0, 4), cap: (-14, 0, 0),
                  tendrilL: (-10, 0, -28), tendrilR: (-10, 0, 28), spout: (18, 0, 0)}),
            (24, {trunk1: (-50, 0, 16), trunk2: (-56, 0, 10), cap: (-30, 0, 0),
                  tendrilL: (-20, 0, -58), tendrilR: (-20, 0, 58), spout: (44, 0, 0)}),
            (28, {trunk1: (-40, 0, 13), cap: (-24, 0, 0)}, {"partial": True}),
        ]),
    ]




# =========================================================================== こだまうさぎ

KODAMAUSAGI_JOINTS = {
    "base": (0.0, 0.0, 0.075),
    "mid": (0.0, 0.008, 0.175),
    "top": (0.0, 0.012, 0.260)
}
KODAMAUSAGI_RADII = {"base": 0.195, "mid": 0.165, "top": 0.082}
KODAMAUSAGI_BONES = [("base", "mid"), ("mid", "top")]


def build_kodamausagi():
    """
    繰り返す木霊。群れで現れる(swarm AI)ため、単体は簡略化した小さな
    シルエットにする。ぷるんと同じ縦2本の骨組みをそのまま流用し、
    丸く詰まった体に耳だけを足して、一目でぷるんと見分けられる形にする。
    配色は第六地方(こだまの尾根)の岩肌の灰色と乾いた土色。
    """
    body = C.build_skinned("kodamausagi", KODAMAUSAGI_JOINTS, KODAMAUSAGI_BONES,
                           KODAMAUSAGI_RADII, root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す(ぷるんと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.02:
            vert.co.z = 0.02 - (0.02 - vert.co.z) * 0.25

    rock = C.make_material("kodamausagi_rock", (0.52, 0.50, 0.47), roughness=0.75)
    earth = C.make_material("kodamausagi_earth", (0.62, 0.50, 0.36), roughness=0.7)
    C.assign_materials_by_region(body, [rock, earth], lambda c: 1 if c.z > 0.19 else 0)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamausagi_eye{side}", (0.058 * side, -0.145, 0.220), 0.034,
                          look=(0.2 * side, -1.0, 0.05))
    mouth = C.uv_sphere("kodamausagi_mouth", (0.0, -0.168, 0.148), 0.028,
                        segments=14, rings=10, scale=(1.3, 0.5, 0.55))
    C.assign_material(mouth, C.make_material("kodamausagi_mouth_m", (0.30, 0.22, 0.17), roughness=0.3))
    extras.append(mouth)

    # 耳。cone()はZ軸沿いにしか作れないので回転はかけず、根元(半径大)を
    # 頭の高さに置いて真上へ伸ばすだけにする(honegaramiの歯・
    # ashiatodoriの爪と同じ、回転を使わない貼り付け方)。細く長く、
    # 根元を寄せて、群れの中でも「うさぎ」と分かるシルエットにする
    ear_mat = C.make_material("kodamausagi_ear", (0.66, 0.54, 0.40), roughness=0.68)
    for side in (-1.0, 1.0):
        ear = C.cone(f"kodamausagi_ear{side}", (0.036 * side, 0.014, 0.275),
                     0.026, 0.004, 0.205, segments=10)
        C.assign_material(ear, ear_mat)
        extras.append(ear)

    mesh = C.join([body] + extras, "kodamausagi")
    armature = C.build_armature("kodamausagi", C.mirrored(KODAMAUSAGI_JOINTS),
                                KODAMAUSAGI_BONES, mesh, root="base")
    return [mesh, armature], armature


def kodamausagi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約は
    purun_animations()の流用ですでに満たしているが(骨の名前がぷるんと
    同じため)、swarm(群れで3〜4体出現)・fieldSkill: "squeeze"という
    この種族固有の素早さに合わせ、purunより全体を詰めて差別化する。
    idle/walkはpurunの構成をそのまま踏襲する(idleはakubitokageと同じ
    「upperを遅らせて耳の付け根の傾きを追従させる」二次揺れだけ追加)。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 耳の付け根に近いupperの傾きが、lowerの呼吸より2フレーム遅れて
        # 追従する(akubitokageと同じ手法の二次揺れ)
        ("idle", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (16, {lower: {"scale": (1.06, 0.92, 1.06)}}),
            (18, {upper: (3, 0, 0)}, {"partial": True}),
            (32, {lower: neutral}),
            (34, {upper: (0, 0, 0)}, {"partial": True}),
        ]),
        # 縮んでから跳ね上がり、着地でまた潰れる
        ("walk", [
            (1, {lower: neutral}),
            (4, {lower: squash}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}}),
            (20, {lower: neutral}),
        ]),
        # タメ→ツメ(LINEARで鋭く伸び上がる)→行き過ぎ→戻り。群れで素早く
        # 動く性格に合わせ、purunよりフレーム間隔を詰め、耳が立った頭
        # (upper)が過剰に暴れないよう振り角度も心持ち小さくする
        ("attack", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (4, {lower: squash}, {"interp": "LINEAR"}),
            (6, {lower: {"scale": (0.8, 1.35, 0.8), "loc": (0, 0.06, 0)}, upper: (-15, 0, 0)}),
            (8, {lower: {"scale": (0.86, 1.26, 0.86), "loc": (0, 0.05, 0)}, upper: (-11, 0, 0)}),
            (14, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # 鋭く潰れて(LINEAR)、HP22はpurunよりやや低めなのでpurunより
        # 一段強く潰れ、驚いてすぐ跳ねのくように戻りも14fから11fへ短縮する
        ("hit", [
            (1, {lower: neutral}, {"interp": "LINEAR"}),
            (3, {lower: {"scale": (1.36, 0.58, 1.36)}, upper: (16, 0, 0)}),
            (11, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {lower: neutral}),
            (10, {lower: {"scale": (1.35, 0.5, 1.35)}}),
            (24, {lower: {"scale": (1.5, 0.06, 1.5)}}),
        ]),
    ]


# =========================================================================== こだまぐも

KODAMAGUMO_JOINTS = {
    "base": (0.0, 0.0, 0.065),
    "mid": (0.0, 0.0, 0.145),
    "top": (0.0, 0.0, 0.205),
}
KODAMAGUMO_RADII = {"base": 0.220, "mid": 0.195, "top": 0.135}
KODAMAGUMO_BONES = [("base", "mid"), ("mid", "top")]

# 芯の周りに膨らみを足す位置。(x, y, z, radius)。中心からのめり込ませて
# 融合させ、継ぎ目のない一枚のもこもこした雲の輪郭にする
KODAMAGUMO_PUFFS = [
    (0.0, -0.03, 0.235, 0.088),
    (0.135, 0.02, 0.185, 0.078),
    (-0.135, 0.02, 0.185, 0.078),
    (0.0, 0.115, 0.165, 0.075),
    (0.08, -0.06, 0.14, 0.07),
    (-0.08, -0.06, 0.14, 0.07),
]


def build_kodamagumo():
    """
    響きに寄ってくる、雲のような群れ。こだまうさぎと同じく`purun`の縦2本の
    骨組みをそのまま流用するが、芯を雫形ではなく低く扁平な塊にし、周囲に
    小さな膨らみ(uv_sphere)をめり込ませて融合させることで、もこもことした
    雲の輪郭を作る。群れ配置(swarm AI)に合わせ、単体は簡略化した
    小さなシルエットにとどめる。
    """
    body = C.build_skinned("kodamagumo", KODAMAGUMO_JOINTS, KODAMAGUMO_BONES,
                           KODAMAGUMO_RADII, root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す(ぷるんと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.02:
            vert.co.z = 0.02 - (0.02 - vert.co.z) * 0.25

    puffs = []
    for i, (px, py, pz, pr) in enumerate(KODAMAGUMO_PUFFS):
        puffs.append(C.uv_sphere(f"kodamagumo_puff{i}", (px, py, pz), pr,
                                 segments=14, rings=10))
    body = C.join([body] + puffs, "kodamagumo")

    # 配色は岩肌の灰色を主体に、めくれた雲の縁だけ乾いた土色をのぞかせる
    rock = C.make_material("kodamagumo_rock", (0.58, 0.57, 0.56), roughness=0.82)
    earth = C.make_material("kodamagumo_earth", (0.60, 0.48, 0.34), roughness=0.7)
    C.assign_materials_by_region(body, [rock, earth], lambda c: 1 if c.z < 0.155 else 0)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamagumo_eye{side}", (0.062 * side, -0.185, 0.165), 0.036,
                          look=(0.2 * side, -1.0, 0.05))
    mouth = C.uv_sphere("kodamagumo_mouth", (0.0, -0.205, 0.098), 0.028,
                        segments=14, rings=10, scale=(1.3, 0.5, 0.55))
    C.assign_material(mouth, C.make_material("kodamagumo_mouth_m", (0.28, 0.20, 0.15), roughness=0.3))
    extras.append(mouth)

    # 響きに寄り集まった岩の証として、雲状の膨らみを突き破って覗く
    # 角のある岩の欠片(plan/models/archive/sheet-kodamagumo.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # common.gem(正二十面体)そのままで硬い面を作る
    shard = C.gem("kodamagumo_shard", (0.02, 0.06, 0.288), 0.044, subdivisions=1)
    C.assign_material(shard, rock)
    extras.append(shard)

    mesh = C.join([body] + extras, "kodamagumo")
    armature = C.build_armature("kodamagumo", C.mirrored(KODAMAGUMO_JOINTS),
                                KODAMAGUMO_BONES, mesh, root="base")
    return [mesh, armature], armature


def kodamagumo_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約は
    purun_animations()の流用ですでに満たしているが(骨の名前がぷるんと
    同じため)、HP16という紙装甲・扁平で雲らしいもこもことしたシルエット
    に合わせ、attack/hitだけpurunより控えめ・柔らかい質感に差別化する。
    idle/walk/dieはpurunの構成をそのまま踏襲する。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        ("idle", [
            (1, {lower: neutral}),
            (16, {lower: {"scale": (1.06, 0.92, 1.06)}}),
            (32, {lower: neutral}),
        ]),
        # 縮んでから跳ね上がり、着地でまた潰れる
        ("walk", [
            (1, {lower: neutral}),
            (4, {lower: squash}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}}),
            (20, {lower: neutral}),
        ]),
        # タメ→ツメ(LINEARで鋭く伸び上がる)→行き過ぎ→戻り。扁平な体型に
        # 合わせ、purunよりツメの伸び量を控えめにして雲らしい穏やかさを出す
        ("attack", [
            (1, {lower: neutral}),
            (5, {lower: squash}, {"interp": "LINEAR"}),
            (8, {lower: {"scale": (0.84, 1.28, 0.84), "loc": (0, 0.06, 0)}, upper: (-18, 0, 0)}),
            (10, {lower: {"scale": (0.90, 1.19, 0.90), "loc": (0, 0.05, 0)}, upper: (-14, 0, 0)}),
            (18, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # 鋭く潰れて(LINEAR)、雲がふわっと大きく潰れて漂うように戻る。
        # HP16はpurunよりさらに脆いため、潰れ幅を一段強めにし戻りもやや長めにする
        ("hit", [
            (1, {lower: neutral}, {"interp": "LINEAR"}),
            (3, {lower: {"scale": (1.4, 0.55, 1.4)}, upper: (16, 0, 0)}),
            (16, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        ("die", [
            (1, {lower: neutral}),
            (10, {lower: {"scale": (1.35, 0.5, 1.35)}}),
            (24, {lower: {"scale": (1.5, 0.06, 1.5)}}),
        ]),
    ]


# =================================================================== ねぼすけがえる

# ツブテガエルの遠い親戚(design/characters.md)。「元にする骨格: 現在流用している
# tsubuteと同じ関節構成をベースに」という計画書の指示どおり、TSUBUTE_HALFと
# 同じ関節の"種類"(hip/chest/head/armF/handF/kneeB/ankleB/footB)を踏襲しつつ、
# より深く眠る・小柄で華奢な個体として座標だけをゼロから設計し直す。
# 石を投げるツブテガエルと違い、ねぼすけがえるは何も持たない
# (起こされると跳ねて反撃するだけで、遠隔攻撃はしない)。
#
# 最初の試作では位置・太さの両方を単純に約0.7〜0.85倍に縮小したところ、
# プレビューで四肢がほぼ判別できない一塊の団子になってしまった
# (デバッグ用に関節ごとに色分けして描画すると、四肢のジオメトリ自体は
# 存在するが、体格を縮めたことで既定の光源セットに対して相対的に大きく
# 平坦なライティングになり、微妙な凹凸が潰れて見えることが分かった)。
# maxHp22はtsubute(14)より高いという計画書の指示("ステータスに見合う
# 大きさに調整する")とも整合するよう、全体サイズはtsubuteとほぼ同等
# (関節位置は1.08倍)にしたまま、太さだけを細く(半径0.82倍)して、
# 華奢さは「小さくする」のではなく「四肢を細く長く見せる」ことで表現する。
# これにより関節が親の半径をはっきり超えて突き出すようになった。
NEBOSUKE_HALF = {
    "hip": (0.0, 0.108, 0.184),
    "chest": (0.0, -0.054, 0.205),
    "head": (0.0, -0.216, 0.194),
    "armF.L": (0.151, -0.151, 0.097),
    "handF.L": (0.173, -0.216, 0.022),
    "kneeB.L": (0.205, 0.108, 0.205),
    "ankleB.L": (0.184, -0.043, 0.065),
    "footB.L": (0.173, -0.151, 0.024),
}
NEBOSUKE_RADII_HALF = {
    "hip": 0.1353, "chest": 0.1435, "head": 0.1189,
    "armF.L": 0.0312, "handF.L": 0.0344,
    "kneeB.L": 0.0615, "ankleB.L": 0.0410, "footB.L": 0.0369,
}
NEBOSUKE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nebosukegaeru():
    """
    ツブテガエルの遠い親戚だが、ずんぐりしたtsubuteよりひと回り小さく
    華奢な体つき。まぶたが重く垂れた眠たげな目が、ふだんは動かず眠って
    いる生態を表す。第3地方(まどろみの茸林)のテーマに合わせ、湿った
    土色の背と、胞子を思わせる淡い黄土色の腹の2トーンに塗り分ける。
    """
    joints = C.mirrored(NEBOSUKE_HALF)
    radii = C.mirrored_radii(NEBOSUKE_RADII_HALF)
    bones = C.mirrored_bones(NEBOSUKE_BONES_HALF)

    body = C.build_skinned("nebosukegaeru", joints, bones, radii, root="chest", subsurf=2)
    soil = C.make_material("nebosuke_soil", (0.30, 0.22, 0.15), roughness=0.85)
    spore = C.make_material("nebosuke_spore", (0.80, 0.70, 0.44), roughness=0.6)
    # tsubuteと同じく、真下を向いた面だけを腹色にする(高さだけで切ると
    # 横腹に水平の不自然な線が入るため)
    C.assign_materials_by_region(
        body, [soil, spore],
        lambda c: 1 if (c.z < 0.115 and abs(c.x) < 0.15) else 0,
    )
    counts = [0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"nebosukegaeru: 土色{counts[0]} 胞子色{counts[1]} / 計{total} "
          f"({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    for side in (-1.0, 1.0):
        # まぶたが重く垂れた眠たげな目
        extras += eyeball(f"nebosuke_eye{side}", (0.095 * side, -0.232, 0.300), 0.051,
                          look=(0.2 * side, -0.85, -0.1), squash=0.42,
                          white=(0.88, 0.86, 0.76), dark=(0.10, 0.08, 0.06))
        # まぶた自体を、目の上半分に被せる土色の薄いドームとして追加する。
        # squashだけでは離れて見ると眠たげさが伝わりにくいため、tsubuteの
        # 大きく見開いた目との違いをはっきりさせる
        lid = C.uv_sphere(f"nebosuke_lid{side}", (0.095 * side, -0.225, 0.316), 0.052,
                          segments=14, rings=10, scale=(1.0, 0.85, 0.55))
        C.assign_material(lid, soil)
        extras.append(lid)
    mouth = C.box("nebosuke_mouth", (0.0, -0.324, 0.157), (0.168, 0.040, 0.018), bevel=0.008)
    C.assign_material(mouth, C.make_material("nebosuke_mouth_m", (0.18, 0.24, 0.14), roughness=0.5))
    extras.append(mouth)

    # 定位置に居座り続けた証として、背に苔むした硬いこぶ
    # (plan/models/archive/sheet-nebosukegaeru.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る、面取りした箱
    moss_mat = C.make_material("nebosuke_moss", (0.30, 0.38, 0.20), roughness=0.85)
    moss = C.box("nebosuke_moss", (0.0, 0.030, 0.320), (0.052, 0.046, 0.034), bevel=0.010)
    C.assign_material(moss, moss_mat)
    extras.append(moss)

    mesh = C.join([body] + extras, "nebosukegaeru")
    armature = C.build_armature("nebosukegaeru", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nebosukegaeru_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・腕の遅れ追従(二次揺れ)を足してある。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # ふだんは動かず深く眠っている。tsubuteの活発な首振りと違い、
        # ごく僅かな寝息だけのほとんど静止したモーションにする。
        # 腕(armL,R)が頭より4フレーム遅れて追従する(眠りに落ちた体の
        # 重みを感じさせる二次揺れ)
        ("idle", [
            (1, {head: (2, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (48, {head: (5, 0, 0)}),
            (52, {armL: (2, 0, 0), armR: (-2, 0, 0)}, {"partial": True}),
            (96, {head: (2, 0, 0)}),
            (100, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # 眠ったまま、それでも逃げ足の速さを感じさせる小刻みな跳びはね
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (4, {legL: (40, 0, 0), legR: (40, 0, 0), head: (14, 0, 0)}),
            (8, {legL: (-30, 0, 0), legR: (-30, 0, 0), head: (-14, 0, 0),
                 armL: (-24, 0, 0), armR: (-24, 0, 0)}),
            (13, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 起こされて跳ねて反撃する。石は投げず、深くしゃがんでから
        # 全身で相手に飛びかかる大きな一跳ね
        # 起こされて跳ねて反撃する。石は投げず、深くしゃがんでから
        # LINEARで鋭く全身で相手に飛びかかる大きな一跳ね
        ("attack", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                 armL: (0, 0, 0), armR: (0, 0, 0)}),
            (4, {legL: (52, 0, 0), legR: (52, 0, 0), head: (18, 0, 0),
                 armL: (30, 0, 0), armR: (30, 0, 0)}, {"interp": "LINEAR"}),
            (8, {legL: (-64, 0, 0), legR: (-64, 0, 0), head: (-26, 0, 0),
                 armL: (-58, 0, 0), armR: (-58, 0, 0)}),
            (14, {legL: (10, 0, 0), legR: (10, 0, 0), head: (6, 0, 0),
                  armL: (-10, 0, 0), armR: (-10, 0, 0)}),
            (20, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                  armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。cowardらしく振幅は現行どおり大きめに保ち、
        # 戻りはゆっくりのまま
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (20, 0, 0), armL: (-24, 0, 18), armR: (-24, 0, -18)}),
            (14, {head: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。24f到達後、頭がほんの少し戻る
        # わずかな跳ね返りを追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {head: (24, 0, 0), legL: (-36, 0, 0), legR: (-36, 0, 0)}),
            (24, {head: (36, 0, 0), legL: (-72, 0, 0), legR: (-72, 0, 0),
                  armL: (-64, 0, 26), armR: (-64, 0, -26)}),
            (28, {head: (31, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== まどろみぐも

# plan/models/archive/model-madoromigumo.md: 現在流用しているtsubuteの「胴の芯+そこから
# 伸びる肢」という関節構成の"種類"を踏襲する。
#
# 【試作の失敗、繰り返し】まどろみぐもは蜘蛛らしい多脚のシルエットが要になる
# ため、最初は「胴の芯となる1つのSkinメッシュに、複数対の脚をまとめてぶら
# 下げる」構成を何通りも試した(単一関節に4対、4関節の鎖に1対ずつ、3対を
# Zの高さでずらす、脚を2対に減らしてnukarumigani並みに離す、太さを変える、
# など)。だが対の数を問わず、脚が「胴と同じ1枚のSkinケージ」の一部として
# 生成される限り、根元でヒレ状/水かき状に融合してしまうとわかった
# (subsurf=0の生のSkinケージを確認したところ、脚の断面が最初から平たい
# 三角形のくさび形になっており、Subdivisionの強さの問題ではなく、太い胴と
# 細い脚が同じケージ内で解決される際の根本的な限界だった)。
# 【対策】胴(head-body-waist-abdomen)はこれまでどおり単一のSkinメッシュに
# するが、脚は胴のケージに含めず、脚1本ごとに独立した小さなSkinチェーン
# (root-knee-footの3関節)として別々にビルドする。purun/madoromiのような
# 分岐のない一本の鎖は太さが変わってもきれいな丸いカプセル形になることを
# 踏まえたもの。各脚の根元(root)を胴の表面にわずかに埋め込む位置に置き、
# join()で胴と結合することで、Skinケージを共有せずに継ぎ目なく生えて見える
# 脚を作る。アーマチュア(関節とボーン)はこれまでどおり胴と脚をまとめた
# 1つの骨格として組み、自動ウェイトで全体に紐づける(ボーンの木構造さえ
# 正しければ、メッシュがどのSkin呼び出し由来かはウェイト付けに影響しない)。
# この方式は脚どうしの干渉が原理的に起きないため、4対8本の蜘蛛らしい脚数を
# 安全に実現できる。
MADOROMIGUMO_HALF = {
    "head": (0.0, -0.180, 0.078),
    "body": (0.0, -0.010, 0.115),
    "waist": (0.0, 0.110, 0.100),
    "abdomen": (0.0, 0.210, 0.110),
}
MADOROMIGUMO_RADII_HALF = {
    "head": 0.058, "body": 0.140, "waist": 0.032, "abdomen": 0.120,
}
MADOROMIGUMO_BODY_BONES_HALF = [
    ("body", "head"), ("body", "waist"), ("waist", "abdomen"),
]

# 脚4対(前から順にA〜D)。付け根(leg*)は胴の表面よりやや内側に置いて
# 埋め込み、Zは軽く波打たせて(高い→低い→高い→低い)横から見たときの
# シルエットに単調さが出ないようにする。footは前後にずらして扇状に開く。
MADOROMIGUMO_LEGS = {
    "A": {"root": (0.075, -0.145, 0.145), "knee": (0.230, -0.175, 0.160),
          "foot": (0.330, -0.235, 0.020)},
    "B": {"root": (0.080, -0.035, 0.095), "knee": (0.235, -0.050, 0.115),
          "foot": (0.335, -0.075, 0.016)},
    "C": {"root": (0.080, 0.075, 0.145), "knee": (0.235, 0.095, 0.160),
          "foot": (0.335, 0.135, 0.020)},
    "D": {"root": (0.075, 0.185, 0.095), "knee": (0.230, 0.225, 0.115),
          "foot": (0.330, 0.290, 0.016)},
}
MADOROMIGUMO_LEG_RADII = {"root": 0.034, "knee": 0.025, "foot": 0.014}


def _madoromigumo_full_skeleton():
    """胴+脚すべてを含む、アーマチュア用の統合済み関節・ボーン一覧を返す。"""
    joints = dict(MADOROMIGUMO_HALF)
    radii = dict(MADOROMIGUMO_RADII_HALF)
    bones = list(MADOROMIGUMO_BODY_BONES_HALF)
    for leg, pts in MADOROMIGUMO_LEGS.items():
        for side in ("L", "R"):
            sign = -1.0 if side == "L" else 1.0
            root_name, knee_name, foot_name = f"leg{leg}.{side}", f"knee{leg}.{side}", f"foot{leg}.{side}"
            rx, ry, rz = pts["root"]
            kx, ky, kz = pts["knee"]
            fx, fy, fz = pts["foot"]
            joints[root_name] = Vector((rx * sign, ry, rz))
            joints[knee_name] = Vector((kx * sign, ky, kz))
            joints[foot_name] = Vector((fx * sign, fy, fz))
            radii[root_name] = MADOROMIGUMO_LEG_RADII["root"]
            radii[knee_name] = MADOROMIGUMO_LEG_RADII["knee"]
            radii[foot_name] = MADOROMIGUMO_LEG_RADII["foot"]
            bones.append(("body", root_name))
            bones.append((root_name, knee_name))
            bones.append((knee_name, foot_name))
    return joints, radii, bones


def build_madoromigumo():
    """
    まどろみの隙間に糸を張る蜘蛛。隣接するまで気配を消し、油断したところに
    噛みつく(ambush)。周囲に溶け込むよう、平たく低いシルエットにし、
    配色も第3地方(まどろみの茸林)らしい湿った土色を基調にした目立たない
    ものにする。腹部の背にだけ、胞子の淡い黄土色の斑紋を置く。
    """
    joints, radii, bones = _madoromigumo_full_skeleton()

    # 胴(head-body-waist-abdomen)だけを1枚のSkinメッシュにする(脚は含めない)
    body_bones = C.mirrored_bones(MADOROMIGUMO_BODY_BONES_HALF)
    body = C.build_skinned("madoromigumo", joints, body_bones, radii, root="body", subsurf=2)

    skin = C.make_material("madoromi_gumo_skin", (0.28, 0.21, 0.15), roughness=0.80)
    mark = C.make_material("madoromi_gumo_mark", (0.70, 0.60, 0.36), roughness=0.55)
    # 斑紋は腹部(waistより後ろ)の背側だけに限る。tsubuteの背/腹の塗り分け
    # (高さだけで切る)と違い、この体はabdomenとbodyがほぼ同じ高さのため、
    # 体の前後位置(Y)と高さ(Z)を組み合わせて、腰の先の腹部上面だけを
    # 切り出す(位置ベースの分類。高さだけでは腹部を切り出せない形状)。
    C.assign_materials_by_region(
        body, [skin, mark],
        lambda c: 1 if (c.y > 0.16 and c.z > 0.075) else 0,
    )
    mark_faces = sum(1 for p in body.data.polygons if p.material_index == 1)
    total_faces = len(body.data.polygons)
    print(f"madoromigumo: 腹部の斑紋 {mark_faces}/{total_faces} "
          f"({mark_faces / total_faces:.1%})")

    leg_mat = C.make_material("madoromi_gumo_leg", (0.24, 0.18, 0.13), roughness=0.85)
    extras = []

    # 脚1本ごとに独立したSkinチェーンとしてビルドする(胴のケージとは共有
    # しない)。root-knee-footの3関節だけの分岐のない鎖なので、太さが胴より
    # ずっと細くてもSkinモディファイアがきれいな丸いカプセル状に解決する。
    for leg, pts in MADOROMIGUMO_LEGS.items():
        for side in ("L", "R"):
            sign = -1.0 if side == "L" else 1.0
            root_name, knee_name, foot_name = f"leg{leg}.{side}", f"knee{leg}.{side}", f"foot{leg}.{side}"
            leg_joints = {
                root_name: joints[root_name],
                knee_name: joints[knee_name],
                foot_name: joints[foot_name],
            }
            leg_bones = [(root_name, knee_name), (knee_name, foot_name)]
            leg_radii = {
                root_name: MADOROMIGUMO_LEG_RADII["root"],
                knee_name: MADOROMIGUMO_LEG_RADII["knee"],
                foot_name: MADOROMIGUMO_LEG_RADII["foot"],
            }
            leg_obj = C.build_skinned(f"madoromi_leg{leg}{side}", leg_joints, leg_bones,
                                      leg_radii, root=root_name, subsurf=0)
            C.assign_material(leg_obj, leg_mat)
            extras.append(leg_obj)

    # 目。ただし「気配を消す」設定に合わせ、白目を明るくしすぎず、くすんだ色で
    # まとめて目立たなくする(tsubuteのような明瞭な白目にはしない)。三角形数の
    # 予算(既存モデルの1,800〜7,500程度)に収めるため1対だけに絞る。
    eye_white = (0.52, 0.49, 0.43)
    eye_dark = (0.08, 0.07, 0.06)
    for side in (-1.0, 1.0):
        extras += eyeball(f"madoromi_eye_main{side}", (0.028 * side, -0.235, 0.086), 0.018,
                          look=(0.25 * side, -1.0, 0.05), white=eye_white, dark=eye_dark)

    # 牙。radius_bottom(-Z側)を細く、radius_top(+Z側)を太くして、回転させず
    # そのまま下向きの牙にする(cone()をrotation_eulerで傾けると原点中心に
    # 回ってしまうため、mabutamushiの反省を踏まえ最初から向きを作り込む)。
    fang_mat = C.make_material("madoromi_fang", (0.62, 0.58, 0.48), roughness=0.35)
    for side in (-1.0, 1.0):
        fang = C.cone(f"madoromi_fang{side}", (0.020 * side, -0.243, 0.050),
                     0.003, 0.015, 0.045, segments=8)
        C.assign_material(fang, fang_mat)
        extras.append(fang)

    mesh = C.join([body] + extras, "madoromigumo")
    armature = C.build_armature("madoromigumo", joints, bones, mesh, root="body")
    return [mesh, armature], armature


def madoromigumo_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・脚の遅れ追従(二次揺れ)を足してある。
    """
    head = "body-head"
    abdomen = "waist-abdomen"
    legA_L, legA_R = "body-legA.L", "body-legA.R"
    legB_L, legB_R = "body-legB.L", "body-legB.R"
    legC_L, legC_R = "body-legC.L", "body-legC.R"
    legD_L, legD_R = "body-legD.L", "body-legD.R"
    return [
        # 気配を消して潜む。ほぼ静止したまま、腹だけがわずかに上下する。
        # 脚の先(legB)が腹より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {abdomen: (0, 0, 0), legB_L: (0, 0, 0), legB_R: (0, 0, 0)}),
            (28, {abdomen: (-3, 0, 0)}),
            (30, {legB_L: (2, 0, 2), legB_R: (-2, 0, -2)}, {"partial": True}),
            (56, {abdomen: (0, 0, 0)}),
            (58, {legB_L: (0, 0, 0), legB_R: (0, 0, 0)}, {"partial": True}),
        ]),
        # 対角の脚(A・C / B・D)を互い違いに踏み出す
        ("walk", [
            (1, {legA_L: (22, 0, 6), legA_R: (-22, 0, -6),
                 legC_L: (22, 0, 6), legC_R: (-22, 0, -6),
                 legB_L: (-20, 0, -6), legB_R: (20, 0, 6),
                 legD_L: (-20, 0, -6), legD_R: (20, 0, 6), head: (3, 0, 0)}),
            (5, {legA_L: (0, 0, 0), legA_R: (0, 0, 0),
                 legC_L: (0, 0, 0), legC_R: (0, 0, 0),
                 legB_L: (0, 0, 0), legB_R: (0, 0, 0),
                 legD_L: (0, 0, 0), legD_R: (0, 0, 0), head: (0, 0, 0)}),
            (9, {legA_L: (-20, 0, -6), legA_R: (20, 0, 6),
                 legC_L: (-20, 0, -6), legC_R: (20, 0, 6),
                 legB_L: (22, 0, 6), legB_R: (-22, 0, -6),
                 legD_L: (22, 0, 6), legD_R: (-22, 0, -6), head: (-3, 0, 0)}),
            (13, {legA_L: (0, 0, 0), legA_R: (0, 0, 0),
                  legC_L: (0, 0, 0), legC_R: (0, 0, 0),
                  legB_L: (0, 0, 0), legB_R: (0, 0, 0),
                  legD_L: (0, 0, 0), legD_R: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 潜んでいた姿勢から前脚を突き出し、首を打ちつけるように噛みつく
        # (ambushStrike=ふいのいちげき)
        # 潜んでいた姿勢から前脚をLINEARで鋭く突き出し噛みつく(不意打ちの鋭さを強調)
        ("attack", [
            (1, {head: (0, 0, 0), legA_L: (0, 0, 0), legA_R: (0, 0, 0)}),
            (4, {head: (-18, 0, 0), legA_L: (-30, 0, -10), legA_R: (30, 0, 10)}, {"interp": "LINEAR"}),
            (8, {head: (26, 0, 0), legA_L: (34, 0, 8), legA_R: (-34, 0, -8)}),
            (18, {head: (0, 0, 0), legA_L: (0, 0, 0), legA_R: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。振幅・戻り時間は現行どおり中程度に保つ
        ("hit", [
            (1, {head: (0, 0, 0), abdomen: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (16, 0, 0), abdomen: (-10, 0, 0),
                 legB_L: (-14, 0, 10), legB_R: (14, 0, -10)}),
            (14, {head: (0, 0, 0), abdomen: (0, 0, 0)}),
        ]),
        # 脚を内側へ丸め込みながら息絶える、死んだ蜘蛛特有の姿勢。初動を
        # LINEARで鋭くする。24f到達後、腹がほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {head: (20, 0, 0), abdomen: (10, 0, 0),
                  legA_L: (-40, 0, -30), legA_R: (40, 0, 30),
                  legB_L: (-46, 0, -26), legB_R: (46, 0, 26),
                  legC_L: (-46, 0, 26), legC_R: (46, 0, -26),
                  legD_L: (-40, 0, 30), legD_R: (40, 0, -30)}),
            (24, {head: (30, 0, 0), abdomen: (18, 0, 0),
                  legA_L: (-70, 0, -46), legA_R: (70, 0, 46),
                  legB_L: (-78, 0, -40), legB_R: (78, 0, 40),
                  legC_L: (-78, 0, 40), legC_R: (78, 0, -40),
                  legD_L: (-70, 0, 46), legD_R: (70, 0, -46)}),
            (28, {abdomen: (15, 0, 0)}, {"partial": True}),
        ]),
    ]




# =================================================================== かえるこだま

# ツブテガエルの遠い親戚(design/characters.md)。ねぼすけがえると同じく
# TSUBUTE_HALFと同じ関節の"種類"を踏襲しつつ座標はゼロから設計するが、
# 性格は正反対: 眠りこけるねぼすけがえるに対し、かえるこだまは「気配に
# 敏感ですぐ逃げる」臆病者(coward AI)。逃げ足の速さを見せるため、後ろ足
# (kneeB/ankleB/footB)をtsubuteよりも高く大きく張り出させ、いつでも
# 跳べる姿勢にする。石は持たない(遠隔攻撃はせず、追い詰められたときだけ
# 跳んで反撃するcounterDamageRatio)。
KAERUKODAMA_HALF = {
    "hip": (0.0, 0.125, 0.150),
    "chest": (0.0, -0.048, 0.168),
    "head": (0.0, -0.192, 0.166),
    "armF.L": (0.118, -0.118, 0.078),
    "handF.L": (0.136, -0.176, 0.018),
    "kneeB.L": (0.232, 0.128, 0.214),
    "ankleB.L": (0.204, -0.028, 0.062),
    "footB.L": (0.188, -0.128, 0.020),
}
KAERUKODAMA_RADII_HALF = {
    "hip": 0.118, "chest": 0.128, "head": 0.106,
    "armF.L": 0.026, "handF.L": 0.029,
    "kneeB.L": 0.056, "ankleB.L": 0.036, "footB.L": 0.032,
}
KAERUKODAMA_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kaerukodama():
    """
    跳ね返る声を追いかける、tsubuteの小柄で華奢な遠縁。いつでも跳べるよう
    後ろ足を高く畳んだ姿勢にし、常に周囲をうかがう大きく見開いた目で
    「気配に敏感ですぐ逃げる」性質を表す。配色は第六地方(こだまの尾根)の
    岩肌の灰色と乾いた土色。喉には、声を跳ね返す由来にちなんだ小さな
    鳴き袋を足す。
    """
    joints = C.mirrored(KAERUKODAMA_HALF)
    radii = C.mirrored_radii(KAERUKODAMA_RADII_HALF)
    bones = C.mirrored_bones(KAERUKODAMA_BONES_HALF)

    body = C.build_skinned("kaerukodama", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("kaerukodama_rock", (0.56, 0.55, 0.53), roughness=0.78)
    earth = C.make_material("kaerukodama_earth", (0.62, 0.50, 0.36), roughness=0.65)
    # 腹は下から見上げたときだけ見えるよう、真下を向いた面に限る
    # (tsubuteと同じく、高さだけで切ると横腹に水平の線が入って不自然になる)
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if (c.z < 0.095 and abs(c.x) < 0.13) else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        # 常に警戒しているような、大きく見開いた目
        extras += eyeball(f"kaerukodama_eye{side}", (0.084 * side, -0.222, 0.258), 0.058,
                          look=(0.3 * side, -0.85, 0.2))
    mouth = C.box("kaerukodama_mouth", (0.0, -0.296, 0.132), (0.166, 0.040, 0.017), bevel=0.008)
    C.assign_material(mouth, C.make_material("kaerukodama_mouth_m", (0.20, 0.17, 0.13), roughness=0.45))
    extras.append(mouth)
    # 声を跳ね返す由来にちなんだ、喉の小さな鳴き袋
    pouch = C.uv_sphere("kaerukodama_pouch", (0.0, -0.245, 0.098), 0.040,
                        segments=12, rings=9, scale=(1.0, 0.9, 0.75))
    C.assign_material(pouch, earth)
    extras.append(pouch)

    mesh = C.join([body] + extras, "kaerukodama")
    armature = C.build_armature("kaerukodama", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kaerukodama_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・前脚の遅れ追従(二次揺れ)を足してある。
    attackはすでに4段構成が組まれていたため、今回はinterpの付与と
    coward AIらしい「大きく怯み、素早く立て直す」振幅の強調が中心。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 常にそわそわと周囲をうかがう、落ち着かない待機。
        # 前脚(armL,R)が頭より2フレーム遅れて小さく追従する(二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (10, {head: (10, 14, 0)}),
            (12, {armL: (4, 0, 0), armR: (4, 0, 0)}, {"partial": True}),
            (20, {head: (8, -16, 0)}),
            (22, {armL: (-4, 0, 0), armR: (-4, 0, 0)}, {"partial": True}),
            (30, {head: (0, 0, 0)}),
            (32, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # tsubuteより素早く、小刻みに跳ねて逃げる
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (3, {legL: (44, 0, 0), legR: (44, 0, 0), head: (14, 0, 0)}),
            (7, {legL: (-34, 0, 0), legR: (-34, 0, 0), head: (-16, 0, 0),
                 armL: (-30, 0, 0), armR: (-30, 0, 0)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 石は投げず、追い詰められて仕方なく全身で跳びかかる一撃。
        # タメ→LINEARで瞬発力を鋭くした跳びかかり→行き過ぎ→戻り
        ("attack", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                 armL: (0, 0, 0), armR: (0, 0, 0)}),
            (4, {legL: (56, 0, 0), legR: (56, 0, 0), head: (20, 0, 0),
                 armL: (34, 0, 0), armR: (34, 0, 0)}, {"interp": "LINEAR"}),
            (8, {legL: (-68, 0, 0), legR: (-68, 0, 0), head: (-28, 0, 0),
                 armL: (-60, 0, 0), armR: (-60, 0, 0)}),
            (14, {legL: (8, 0, 0), legR: (8, 0, 0), head: (4, 0, 0),
                  armL: (-8, 0, 0), armR: (-8, 0, 0)}),
            (20, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0),
                  armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くし、cowardらしく大きく怯む(振幅を24°→28°へ)
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (28, 0, 0), armL: (-30, 0, 22), armR: (-30, 0, -22)}),
            (12, {head: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くし、20f到達後に一度小さく跳ね返ってから
        # 完全に崩れ落ちる
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (26, 0, 0), legL: (-38, 0, 0), legR: (-38, 0, 0)}),
            (20, {head: (38, 0, 0), legL: (-74, 0, 0), legR: (-74, 0, 0),
                  armL: (-66, 0, 26), armR: (-66, 0, -26)}),
            (24, {head: (34, 0, 0), legL: (-67, 0, 0), legR: (-67, 0, 0),
                  armL: (-59, 0, 23), armR: (-59, 0, -23)}),
        ]),
    ]


# ===================================================================== やまびこおに

# honegaramiと同じ人型の骨組み(hip/chest/neck/head/crown、
# shoulder/elbow/hand、thigh/knee/foot)をベースにするが、honegaramiの
# 「骨が浮いた細い体」とは正反対の「がっしりした体格」を作るため、
# 座標・太さともに大きく変える: 胴と肩を横に張り出させ、四肢の半径を
# honegaramiの2倍前後まで太くする。声そのものが実体化した鬼という由来から、
# 頭に角を2本足し、honegaramiの眼窩(暗い落ちくぼみ)とは逆に、
# 響きが宿っているような発光する目にする。
YAMABIKOONI_HALF = {
    "hip": (0.0, 0.0, 0.335),
    "chest": (0.0, 0.0, 0.565),
    "neck": (0.0, 0.0, 0.685),
    "head": (0.0, -0.012, 0.805),
    "crown": (0.0, 0.0, 0.905),
    "shoulder.L": (0.175, 0.0, 0.605),
    "elbow.L": (0.250, 0.015, 0.440),
    "hand.L": (0.258, -0.030, 0.295),
    "thigh.L": (0.100, 0.0, 0.320),
    "knee.L": (0.106, 0.0, 0.160),
    "foot.L": (0.110, -0.035, 0.020),
}
YAMABIKOONI_RADII_HALF = {
    "hip": 0.128, "chest": 0.138, "neck": 0.058, "head": 0.148, "crown": 0.040,
    "shoulder.L": 0.068, "elbow.L": 0.054, "hand.L": 0.062,
    "thigh.L": 0.076, "knee.L": 0.062, "foot.L": 0.066,
}
YAMABIKOONI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_yamabikooni():
    """
    やまびこぎつねの呼び声に応じて現れる、尾根の奥にひそむ力の強い個体。
    honegaramiと同じ人型骨格をがっしりと太らせ、正面から迫る力強い
    シルエットにする。配色は第六地方(こだまの尾根)の岩肌の灰色と
    乾いた土色。頭には鬼らしい角を2本、声が実体化した由来にちなんで
    発光する目を持たせる。
    """
    joints = C.mirrored(YAMABIKOONI_HALF)
    radii = C.mirrored_radii(YAMABIKOONI_RADII_HALF)
    bones = C.mirrored_bones(YAMABIKOONI_BONES_HALF)

    body = C.build_skinned("yamabikooni", joints, bones, radii, root="hip", subsurf=2)
    rock = C.make_material("yamabikooni_rock", (0.50, 0.48, 0.46), roughness=0.8)
    earth = C.make_material("yamabikooni_earth", (0.56, 0.44, 0.32), roughness=0.7)
    # 腰まわり(腰巻のように見える範囲)だけ乾いた土色にする
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if (0.28 < c.z < 0.40) else 0,
    )

    extras = []
    eye_glow = C.make_material("yamabikooni_eye", (0.95, 0.65, 0.20), roughness=0.3, emission=2.2)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"yamabikooni_eye{side}", (0.062 * side, -0.108, 0.815), 0.026,
                          segments=12, rings=9, scale=(1.0, 0.7, 0.8))
        C.assign_material(eye, eye_glow)
        extras.append(eye)
        # 鬼らしい角。cone()はZ軸沿いにしか作れないので回転はかけず、
        # 根元を頭頂の高さに置いて真上へ伸ばすだけにする
        horn = C.cone(f"yamabikooni_horn{side}", (0.044 * side, 0.010, 0.895),
                     0.026, 0.006, 0.115, segments=10)
        C.assign_material(horn, earth)
        extras.append(horn)
    jaw = C.uv_sphere("yamabikooni_jaw", (0.0, -0.055, 0.735), 0.096,
                      segments=18, rings=12, scale=(0.95, 1.1, 0.6))
    C.assign_material(jaw, rock)
    extras.append(jaw)

    mesh = C.join([body] + extras, "yamabikooni")
    armature = C.build_armature("yamabikooni", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def yamabikooni_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    honegaramiの打ち直し内容(タメ・ツメ・行き過ぎ・二次揺れ・footfall-dip・
    die跳ね返り)をほぼ同じ骨格・比率のこの種族へ移植した。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 力強くゆったりとした、鬼らしい構え。頭(neck)が胴(hipc)より
        # 2フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (24, {hipc: (3, 0, 2), armL: (-6, 0, 14), armR: (-6, 0, -14)}),
            (26, {neck: (-4, 0, 0)}, {"partial": True}),
            (48, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (50, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # honegaramiより重心を落とし、どっしりと踏みしめて歩く。接地の
        # 瞬間に胴をわずかに沈める(がっしりした体格のためhonegaramiより
        # やや強め)
        ("walk", [
            (1, {legL: (20, 0, 0), legR: (-20, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                 armL: (-16, 0, 8), armR: (16, 0, -8)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8),
                  hipc: {"loc": (0, -0.012, 0)}}),
            (19, {legL: (-20, 0, 0), legR: (20, 0, 0), shinL: (6, 0, 0), shinR: (-8, 0, 0),
                  armL: (16, 0, 8), armR: (-16, 0, -8)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8),
                  hipc: {"loc": (0, -0.012, 0)}}),
            (37, {legL: (20, 0, 0), legR: (-20, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                  armL: (-16, 0, 8), armR: (16, 0, -8)}),
        ]),
        # 両腕を振りかぶり、全身をひねって叩きつける大振りの一撃。タメ
        # (1→7)→LINEARで鋭いツメ(7→10)→行き過ぎ(10→13、弱めて収まる)→
        # 戻り(13→24)の4段に分ける
        ("attack", [
            (1, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0), hipc: (0, 0, 0)}),
            (7, {armR: (-135, 0, -22), foreR: (-34, 0, 0), armL: (-40, 0, 30), foreL: (-10, 0, 0),
                 hipc: (-10, 0, -14), neck: (-6, 0, 0)}, {"interp": "LINEAR"}),
            (10, {armR: (72, 0, 16), foreR: (10, 0, 0), armL: (30, 0, -4), foreL: (0, 0, 0),
                  hipc: (18, 0, 16), neck: (-10, 0, 0)}),
            (13, {armR: (60, 0, 13), foreR: (8, 0, 0), armL: (25, 0, -3), foreL: (0, 0, 0),
                  hipc: (15, 0, 13), neck: (-8, 0, 0)}),
            (24, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0), hipc: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。振幅は現行どおり
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-14, 0, 0), neck: (-14, 0, 0), armL: (-18, 0, 20), armR: (-18, 0, -20)}),
            (16, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 巨体が崩れ落ちるように、ゆっくりと大きく倒れる。初動をLINEARで
        # 鋭くし、崩れ落ちた後に一度だけ小さく跳ね返る
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {hipc: (-14, 0, 5), neck: (-20, 0, 0), armL: (-34, 0, 34), armR: (-34, 0, -34)}),
            (28, {hipc: (-82, 0, 16), neck: (-36, 0, 0), legL: (50, 0, 0), legR: (44, 0, 0),
                  armL: (-74, 0, 50), armR: (-74, 0, -50)}),
            (32, {hipc: (-76, 0, 15), neck: (-32, 0, 0), legL: (46, 0, 0), legR: (40, 0, 0),
                  armL: (-68, 0, 45), armR: (-68, 0, -45)}),
        ]),
    ]


# ===================================================================== ねだやまびこ

# honegarami・yamabikooniと同じ人型骨組みをベースにするが、「尾根に根を
# 張ってしまった、ほとんど動かない古い響き」(guard AI)という由来から、
# 背が低く前傾した、どっしり構えたシルエットにする。関節の高さを全体的に
# 下げて低い重心を作り、胸から頭にかけて-Y方向(正面側)へわずかに
# 突き出させることで前傾姿勢にする。四肢はyamabikooniよりさらに太く短い。
NEDAYAMABIKO_HALF = {
    "hip": (0.0, 0.0, 0.235),
    "chest": (0.0, 0.020, 0.395),
    "neck": (0.0, 0.032, 0.470),
    "head": (0.0, 0.012, 0.560),
    "crown": (0.0, 0.024, 0.628),
    "shoulder.L": (0.190, 0.020, 0.415),
    "elbow.L": (0.248, 0.050, 0.295),
    "hand.L": (0.240, 0.020, 0.175),
    "thigh.L": (0.108, 0.0, 0.222),
    "knee.L": (0.118, 0.0, 0.108),
    "foot.L": (0.122, -0.038, 0.020),
}
NEDAYAMABIKO_RADII_HALF = {
    "hip": 0.148, "chest": 0.158, "neck": 0.064, "head": 0.132, "crown": 0.032,
    "shoulder.L": 0.078, "elbow.L": 0.064, "hand.L": 0.070,
    "thigh.L": 0.092, "knee.L": 0.075, "foot.L": 0.078,
}
NEDAYAMABIKO_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_nedayamabiko():
    """
    尾根に根を張ってしまった、ほとんど動かない古い響き(guard AI)。
    honegarami・yamabikooniと同じ人型骨組みを、背が低く前傾しどっしりと
    構えたシルエットに作り替え、厚い甲羅状の装甲を背に3つ重ねて岩の塊が
    根を張ったような輪郭にする。配色は第六地方(こだまの尾根)の
    岩肌の灰色(甲羅)と乾いた土色(肌)。
    """
    joints = C.mirrored(NEDAYAMABIKO_HALF)
    radii = C.mirrored_radii(NEDAYAMABIKO_RADII_HALF)
    bones = C.mirrored_bones(NEDAYAMABIKO_BONES_HALF)

    body = C.build_skinned("nedayamabiko", joints, bones, radii, root="hip", subsurf=2)
    skin = C.make_material("nedayamabiko_skin", (0.44, 0.32, 0.22), roughness=0.8)
    C.assign_material(body, skin)

    extras = []
    shell_mat = C.make_material("nedayamabiko_shell", (0.62, 0.61, 0.58), roughness=0.85)
    # 甲羅は頭より確実に低く、背中側(+Y)へはっきり離して重ね、
    # 頭部の輪郭と混ざらないようにする(肩からお尻にかけての上背だけを覆う)
    for dy, dz, r, scale in [
        (0.190, 0.415, 0.145, (1.0, 0.95, 0.85)),
        (0.165, 0.310, 0.112, (0.95, 0.85, 0.80)),
        (0.175, 0.485, 0.098, (0.90, 0.80, 0.72)),
    ]:
        shell = C.uv_sphere(f"nedayamabiko_shell{dz}", (0.0, dy, dz), r,
                            segments=18, rings=13, scale=scale)
        C.assign_material(shell, shell_mat)
        extras.append(shell)

    dark = C.make_material("nedayamabiko_socket", (0.05, 0.05, 0.07), roughness=0.9)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"nedayamabiko_socket{side}", (0.052 * side, -0.038, 0.575), 0.028,
                             segments=12, rings=9, scale=(1.0, 0.85, 1.0))
        C.assign_material(socket, dark)
        extras.append(socket)
    jaw = C.uv_sphere("nedayamabiko_jaw", (0.0, -0.048, 0.512), 0.088,
                      segments=18, rings=12, scale=(0.9, 1.05, 0.55))
    C.assign_material(jaw, shell_mat)
    extras.append(jaw)

    # 根を張ったまま動かない証として、甲羅を突き破って覗く角のある岩
    # (plan/models/archive/sheet-nedayamabiko.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。common.gem
    # (正二十面体)そのままで硬い面を作る
    shard = C.gem("nedayamabiko_shard", (0.0, 0.300, 0.420), 0.062, subdivisions=1)
    C.assign_material(shard, shell_mat)
    extras.append(shard)

    mesh = C.join([body] + extras, "nedayamabiko")
    armature = C.build_armature("nedayamabiko", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def nedayamabiko_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・頭の遅れ追従(二次揺れ)・歩行の接地沈みを
    足してある。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 根を張ったように、ほとんど動かない。かすかな呼吸だけ。
        # 頭(neck)が胴(hipc)より2フレーム遅れて追従する(岩の塊のような二次揺れ)
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (50, {hipc: (1.5, 0, 0.5)}),
            (52, {neck: (-2, 0, 0)}, {"partial": True}),
            (100, {hipc: (0, 0, 0)}),
            (102, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # guard AIでも移動自体は起こりうるため、重く鈍い足取りを用意する。
        # 脚が正中に戻る接地の瞬間に胴をわずかに沈める
        ("walk", [
            (1, {legL: (14, 0, 0), legR: (-14, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                 armL: (-8, 0, 4), armR: (8, 0, -4)}),
            (14, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4),
                  hipc: {"rot": (0, 0, 0), "loc": (0, -0.008, 0)}}),
            (27, {legL: (-14, 0, 0), legR: (14, 0, 0), shinL: (5, 0, 0), shinR: (-6, 0, 0),
                  armL: (8, 0, 4), armR: (-8, 0, -4)}),
            (40, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 4), armR: (0, 0, -4),
                  hipc: {"rot": (0, 0, 0), "loc": (0, -0.008, 0)}}),
        ]),
        # 溜めてから、LINEARで根を張った重心のまま短く鈍く打ち下ろす
        ("attack", [
            (1, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (9, {armR: (-70, 0, -16), hipc: (-6, 0, -8)}, {"interp": "LINEAR"}),
            (15, {armR: (30, 0, 10), hipc: (10, 0, 8), neck: (-6, 0, 0)}),
            (26, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。guardらしく振幅は小さめ、戻り時間も短めに保つ
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (5, {hipc: (-8, 0, 0), neck: (-10, 0, 0), armL: (-10, 0, 12), armR: (-10, 0, -12)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 根が抜けるように、その場でLINEARで鋭く崩れ始め、ゆっくりと
        # 崩れ落ちる。32f到達後、胴と頭がほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (12, {hipc: (-10, 0, 3), neck: (-14, 0, 0), armL: (-20, 0, 20), armR: (-20, 0, -20)}),
            (32, {hipc: (-60, 0, 10), neck: (-26, 0, 0), legL: (30, 0, 0), legR: (26, 0, 0),
                  armL: (-46, 0, 32), armR: (-46, 0, -32)}),
            (36, {hipc: (-54, 0, 9), neck: (-23, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== やまびこぎつね

# gajiriと同じ四つ足の関節構成(chest/hip/neck/snout、tail1-3、耳、
# 前後の脚)をベースにするが、ねずみのgajiriより全体を細くしなやかに
# 作り、鼻先と耳をより尖らせ、尾を長く大きく張り出させてきつねらしい
# シルエットにする。「何かを放つための器官」として、遠吠えのように
# 開いた口と、発光する喉を強調する(響いて返ってくる声そのものという由来)。
YAMABIKOGITSUNE_HALF = {
    "hip": (0.0, 0.165, 0.205),
    "chest": (0.0, -0.025, 0.215),
    "neck": (0.0, -0.175, 0.195),
    "snout": (0.0, -0.385, 0.135),
    "tail1": (0.0, 0.315, 0.200),
    "tail2": (0.0, 0.480, 0.260),
    "tail3": (0.0, 0.605, 0.350),
    "ear.L": (0.092, -0.165, 0.372),
    "hipF.L": (0.092, -0.065, 0.148),
    "footF.L": (0.100, -0.105, 0.026),
    "hipB.L": (0.112, 0.138, 0.155),
    "footB.L": (0.120, 0.168, 0.026),
}
YAMABIKOGITSUNE_RADII_HALF = {
    "hip": 0.115, "chest": 0.125, "neck": 0.082, "snout": 0.032,
    "tail1": 0.040, "tail2": 0.034, "tail3": 0.020,
    "ear.L": 0.050,
    "hipF.L": 0.034, "footF.L": 0.028,
    "hipB.L": 0.046, "footB.L": 0.030,
}
YAMABIKOGITSUNE_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_yamabikogitsune():
    """
    響いて返ってくる声そのもの。gajiriと同じ関節構成をベースに、
    全体を細くしなやかにし、鼻先と耳をより尖らせ、尾を長く大きく
    張り出させてきつねらしいシルエットにする。配色は第六地方
    (こだまの尾根)の岩肌の灰色と乾いた土色。遠吠えのように開いた口と
    発光する喉で「声を放つ器官」を強調する。
    """
    joints = C.mirrored(YAMABIKOGITSUNE_HALF)
    radii = C.mirrored_radii(YAMABIKOGITSUNE_RADII_HALF)
    bones = C.mirrored_bones(YAMABIKOGITSUNE_BONES_HALF)

    body = C.build_skinned("yamabikogitsune", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("yamabikogitsune_rock", (0.54, 0.53, 0.51), roughness=0.75)
    earth = C.make_material("yamabikogitsune_earth", (0.60, 0.48, 0.34), roughness=0.65)
    # 耳の内側と尾の先だけ乾いた土色にする(関節からの距離で判定。
    # gajiriのear_inと同じ考え方)
    accents = [Vector(joints["ear.L"]), Vector(joints["ear.R"]), Vector(joints["tail3"])]
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if min((c - a).length for a in accents) < 0.085 else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"yamabikogitsune_eye{side}", (0.058 * side, -0.235, 0.235), 0.036,
                          look=(0.25 * side, -1.0, 0.1))
    # 遠吠えのように開いた口。上下2枚で開口部を作る
    jaw_upper = C.box("yamabikogitsune_jaw_up", (0.0, -0.400, 0.150), (0.052, 0.075, 0.014), bevel=0.006)
    C.assign_material(jaw_upper, rock)
    extras.append(jaw_upper)
    jaw_lower = C.box("yamabikogitsune_jaw_lo", (0.0, -0.375, 0.108), (0.046, 0.068, 0.012), bevel=0.006)
    C.assign_material(jaw_lower, rock)
    extras.append(jaw_lower)
    throat = C.uv_sphere("yamabikogitsune_throat", (0.0, -0.360, 0.128), 0.030,
                         segments=12, rings=9, scale=(0.85, 1.0, 0.75))
    C.assign_material(throat, C.make_material("yamabikogitsune_throat_m", (0.95, 0.75, 0.35),
                                              roughness=0.3, emission=2.0))
    extras.append(throat)

    mesh = C.join([body] + extras, "yamabikogitsune")
    armature = C.build_armature("yamabikogitsune", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def yamabikogitsune_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・放ち(LINEAR補間)・行き過ぎ・二次揺れ・die跳ね返りを足してある。
    """
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 尾根に耳を澄ませるように、首を小さく巡らせる。尾の先端(t2)が
        # 付け根(t1)より2フレーム遅れて追従するよう明示的に分離した
        ("idle", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0)}),
            (22, {neck: (-4, 10, 0), t1: (0, -6, 0)}),
            (24, {t2: (0, 8, 0)}, {"partial": True}),
            (44, {neck: (3, -8, 0), t1: (0, 6, 0)}),
            (46, {t2: (0, -8, 0)}, {"partial": True}),
            (60, {neck: (0, 0, 0), t1: (0, 6, 0)}),
        ]),
        # gajiriより長い脚をしなやかに使う、軽やかな駆け足
        ("walk", [
            (1, {fL: (26, 0, 0), fR: (-26, 0, 0), bL: (-22, 0, 0), bR: (22, 0, 0), t1: (0, 10, 0)}),
            (7, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
            (13, {fL: (-26, 0, 0), fR: (26, 0, 0), bL: (22, 0, 0), bR: (-22, 0, 0), t1: (0, 10, 0)}),
            (19, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
        ]),
        # 大きく口を開け、頭を反らして声を放つ。タメ(1→6、現行のまま)→
        # LINEARで鋭く反らせる(6→9、元のピークを増幅・前倒し)→行き過ぎ
        # (9→12、現行値18°/10°へ戻りかける)→戻り(12→22)の4段に再構成
        ("attack", [
            (1, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (6, {snout: (-30, 0, 0), neck: (-22, 0, 0)}),
            (9, {snout: (-36, 0, 0), neck: (-26, 0, 0)}, {"interp": "LINEAR"}),
            (12, {snout: (18, 0, 0), neck: (10, 0, 0)}),
            (22, {snout: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。ranged種族なので振幅・戻り時間は
        # 現行どおり中程度に保つ
        ("hit", [
            (1, {neck: (0, 0, 0)}),
            (4, {neck: (18, 0, 0), t1: (0, -18, 0)}, {"interp": "LINEAR"}),
            (14, {neck: (0, 0, 0), t1: (0, 6, 0)}),
        ]),
        # 初動をLINEARで鋭くし、伸びきったあとにわずかな跳ね返りを追加
        ("die", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0)}),
            (10, {neck: (26, 0, 0), t1: (0, -30, 0), fL: (-30, 0, 0), fR: (-30, 0, 0)},
             {"interp": "LINEAR"}),
            (24, {neck: (40, 0, 0), t1: (0, -50, 0), fL: (-56, 0, 0), fR: (-56, 0, 0),
                  bL: (30, 0, 0), bR: (30, 0, 0)}),
            (28, {neck: (34, 0, 0)}, {"partial": True}),
        ]),
    ]


# ===================================================================== こだまぎつね

# やまびこぎつねにこだまうさぎを繰り返し夢あわせすると育つ姿(配合限定)。
# 骨格はyamabikogitsuneと同じ関節構成(gajiri由来)を踏襲しつつ、ひとまわり
# 大きく育てる。「攻撃が2回まで反響する」性質を視覚化するため、
# yamabikogitsuneの単発の発光する喉を、間隔を空けた2つの発光球に増やし、
# 耳もkodamausagi譲りに長く伸ばして「うさぎとの夢あわせ」の痕跡を残す。
KODAMAGITSUNE_HALF = {
    "hip": (0.0, 0.185, 0.230),
    "chest": (0.0, -0.028, 0.240),
    "neck": (0.0, -0.196, 0.218),
    "snout": (0.0, -0.430, 0.150),
    "tail1": (0.0, 0.352, 0.224),
    "tail2": (0.0, 0.536, 0.290),
    "tail3": (0.0, 0.676, 0.390),
    "ear.L": (0.098, -0.184, 0.440),
    "hipF.L": (0.103, -0.073, 0.166),
    "footF.L": (0.112, -0.117, 0.029),
    "hipB.L": (0.125, 0.154, 0.173),
    "footB.L": (0.134, 0.188, 0.029),
}
KODAMAGITSUNE_RADII_HALF = {
    "hip": 0.128, "chest": 0.140, "neck": 0.092, "snout": 0.036,
    "tail1": 0.045, "tail2": 0.038, "tail3": 0.022,
    "ear.L": 0.048,
    "hipF.L": 0.038, "footF.L": 0.031,
    "hipB.L": 0.051, "footB.L": 0.033,
}
KODAMAGITSUNE_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_kodamagitsune():
    """
    やまびこぎつねにこだまうさぎを繰り返し夢あわせすると育つ姿。
    骨格はyamabikogitsuneと同じ構成をひとまわり大きく育てつつ、耳を
    kodamausagi譲りに細く長く伸ばして夢あわせの痕跡を残す。「攻撃が
    2回まで反響する」性質を、間隔を空けた2つの発光球(声の余韻)で
    視覚化する。配色は第六地方(こだまの尾根)の岩肌の灰色と乾いた土色。
    """
    joints = C.mirrored(KODAMAGITSUNE_HALF)
    radii = C.mirrored_radii(KODAMAGITSUNE_RADII_HALF)
    bones = C.mirrored_bones(KODAMAGITSUNE_BONES_HALF)

    body = C.build_skinned("kodamagitsune", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("kodamagitsune_rock", (0.50, 0.49, 0.47), roughness=0.72)
    earth = C.make_material("kodamagitsune_earth", (0.64, 0.51, 0.36), roughness=0.62)
    accents = [Vector(joints["ear.L"]), Vector(joints["ear.R"]), Vector(joints["tail3"])]
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if min((c - a).length for a in accents) < 0.095 else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamagitsune_eye{side}", (0.064 * side, -0.262, 0.262), 0.040,
                          look=(0.25 * side, -1.0, 0.1))
    jaw_upper = C.box("kodamagitsune_jaw_up", (0.0, -0.448, 0.168), (0.058, 0.084, 0.015), bevel=0.007)
    C.assign_material(jaw_upper, rock)
    extras.append(jaw_upper)
    jaw_lower = C.box("kodamagitsune_jaw_lo", (0.0, -0.420, 0.120), (0.051, 0.076, 0.013), bevel=0.007)
    C.assign_material(jaw_lower, rock)
    extras.append(jaw_lower)
    # 反響する2打ぶんの余韻を、口元から少し離した2つの発光球で表す
    echo_mat = C.make_material("kodamagitsune_echo_m", (0.95, 0.75, 0.35), roughness=0.3, emission=2.0)
    throat = C.uv_sphere("kodamagitsune_throat", (0.0, -0.402, 0.144), 0.034,
                         segments=12, rings=9, scale=(0.85, 1.0, 0.75))
    C.assign_material(throat, echo_mat)
    extras.append(throat)
    echo = C.uv_sphere("kodamagitsune_echo", (0.0, -0.470, 0.176), 0.020,
                       segments=10, rings=8, scale=(0.85, 1.0, 0.75))
    C.assign_material(echo, echo_mat)
    extras.append(echo)

    mesh = C.join([body] + extras, "kodamagitsune")
    armature = C.build_armature("kodamagitsune", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kodamagitsune_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・尾の遅れ追従(二次揺れ)を足してある。
    echoAttackChance(2回まで反響)を表す既存の2段攻撃構造は活かしつつ、
    それぞれの打撃にタメ→ツメの緩急を足す。
    """
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 尾の付け根(t1)が首より3フレーム、尾の先(t2)がさらに2フレーム
        # 遅れて追従する(二次揺れ、尾が1関節長いぶん2段階に分ける)
        ("idle", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0), t2: (0, 0, 0)}),
            (24, {neck: (-4, 10, 0)}),
            (27, {t1: (0, -6, 0)}, {"partial": True}),
            (29, {t2: (0, 8, 0)}, {"partial": True}),
            (48, {neck: (3, -8, 0)}),
            (51, {t1: (0, 6, 0)}, {"partial": True}),
            (53, {t2: (0, -8, 0)}, {"partial": True}),
            (66, {neck: (0, 0, 0)}),
            (69, {t1: (0, 0, 0)}, {"partial": True}),
            (71, {t2: (0, 0, 0)}, {"partial": True}),
        ]),
        ("walk", [
            (1, {fL: (24, 0, 0), fR: (-24, 0, 0), bL: (-20, 0, 0), bR: (20, 0, 0), t1: (0, 10, 0)}),
            (7, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
            (13, {fL: (-24, 0, 0), fR: (24, 0, 0), bL: (20, 0, 0), bR: (-20, 0, 0), t1: (0, 10, 0)}),
            (19, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -10, 0)}),
        ]),
        # 声を放ったあと、間を置いてもう一声(反響)ぶん短く追い足す。
        # それぞれの放つ瞬間をLINEARで鋭くする
        ("attack", [
            (1, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (5, {snout: (-28, 0, 0), neck: (-20, 0, 0)}, {"interp": "LINEAR"}),
            (8, {snout: (14, 0, 0), neck: (8, 0, 0)}),
            (14, {snout: (-16, 0, 0), neck: (-10, 0, 0)}, {"interp": "LINEAR"}),
            (17, {snout: (10, 0, 0), neck: (6, 0, 0)}),
            (26, {snout: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。def13の中間的な防御力なので
        # 振幅・戻り時間は現行どおり極端な大小どちらにも振らない
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (18, 0, 0), t1: (0, -18, 0)}),
            (14, {neck: (0, 0, 0), t1: (0, 6, 0)}),
        ]),
        # 初動をLINEARで鋭くし「反響していた声が最初に鋭く途切れる」
        # 感触を加える。24f到達後、崩れ落ちた前脚が一度小さく跳ね返る
        ("die", [
            (1, {neck: (0, 0, 0), t1: (0, 6, 0)}, {"interp": "LINEAR"}),
            (10, {neck: (26, 0, 0), t1: (0, -30, 0), fL: (-30, 0, 0), fR: (-30, 0, 0)}),
            (24, {neck: (40, 0, 0), t1: (0, -50, 0), fL: (-56, 0, 0), fR: (-56, 0, 0),
                  bL: (30, 0, 0), bR: (30, 0, 0)}),
            (28, {fL: (-50, 0, 0), fR: (-50, 0, 0)}, {"partial": True}),
        ]),
    ]


# ======================================================================= こだまの主

# 第六地方(こだまの尾根)のボス。「尾根じゅうに響いてきた無数のこだまが、
# ひとつに重なり合って生まれた姿」という由来から、地方の他の種族
# (kodamausagi・kodamagumo・kaerukodama)の特徴を1体に集約する構成にする。
# 骨格は計画書どおりgajiriと同じ関節構成をベースにするが、ボスらしく
# 大きく育て、kodamausagi譲りの長い耳・kodamagumo譲りの雲状の膨らみ・
# kaerukodama譲りの大きく見開いた目を組み合わせる。
KODAMANONUSHI_HALF = {
    "hip": (0.0, 0.260, 0.340),
    "chest": (0.0, -0.035, 0.360),
    "neck": (0.0, -0.260, 0.325),
    "snout": (0.0, -0.540, 0.225),
    "tail1": (0.0, 0.480, 0.330),
    "tail2": (0.0, 0.720, 0.420),
    "tail3": (0.0, 0.890, 0.560),
    "ear.L": (0.130, -0.255, 0.610),
    "hipF.L": (0.145, -0.100, 0.235),
    "footF.L": (0.158, -0.165, 0.040),
    "hipB.L": (0.175, 0.215, 0.245),
    "footB.L": (0.188, 0.265, 0.040),
}
KODAMANONUSHI_RADII_HALF = {
    "hip": 0.235, "chest": 0.255, "neck": 0.150, "snout": 0.058,
    "tail1": 0.062, "tail2": 0.050, "tail3": 0.030,
    "ear.L": 0.056,
    "hipF.L": 0.068, "footF.L": 0.056,
    "hipB.L": 0.092, "footB.L": 0.060,
}
KODAMANONUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_kodamaNoNushi():
    """
    尾根じゅうに響いてきた無数のこだまが、ひとつに重なり合って生まれた
    地方の主。gajiriと同じ四つ足の骨組みをボスらしく大きく育て、
    地方の他の種族の特徴(kodamausagiの長い耳、kodamagumoの雲状の膨らみ、
    kaerukodamaの見開いた目)を1体に集約する。配色は第六地方
    (こだまの尾根)の岩肌の灰色と乾いた土色。

    通常種の拡大版に見えないよう、逸脱項目を意図して3つ選ぶ
    (plan/models/archive/boss-silhouette-differentiation.md):
    ①ネガティブスペース(左の雲状の膨らみだけ、声が響き抜ける空洞に
    する) ②顔の配置の逸脱(重なり合った過去のこだまの名残として、
    高さも大きさも違う目をあと2つ、非対称に散らす) ③左右非対称
    (雲状の膨らみ自体の大きさを左右で変える)。
    """
    joints = C.mirrored(KODAMANONUSHI_HALF)
    radii = C.mirrored_radii(KODAMANONUSHI_RADII_HALF)
    bones = C.mirrored_bones(KODAMANONUSHI_BONES_HALF)

    body = C.build_skinned("kodamaNoNushi", joints, bones, radii, root="chest", subsurf=2)
    rock = C.make_material("kodamanonushi_rock", (0.52, 0.51, 0.49), roughness=0.78)
    earth = C.make_material("kodamanonushi_earth", (0.60, 0.48, 0.34), roughness=0.66)
    accents = [Vector(joints["ear.L"]), Vector(joints["ear.R"]), Vector(joints["tail3"])]
    C.assign_materials_by_region(
        body, [rock, earth],
        lambda c: 1 if min((c - a).length for a in accents) < 0.15 else 0,
    )

    extras = []
    # kaerukodama譲りの、常に見開いた大きな目
    for side in (-1.0, 1.0):
        extras += eyeball(f"kodamanonushi_eye{side}", (0.100 * side, -0.330, 0.345), 0.062,
                          look=(0.25 * side, -1.0, 0.1))
    jaw = C.uv_sphere("kodamanonushi_jaw", (0.0, -0.560, 0.175), 0.088,
                      segments=18, rings=12, scale=(0.95, 1.05, 0.55))
    C.assign_material(jaw, rock)
    extras.append(jaw)

    # kodamagumo譲りの、雲のような膨らみを背に重ねる。逸脱項目③
    # (左右非対称)として、左右で大きさを変える(右0.115→左0.095)
    puff_mat = C.make_material("kodamanonushi_puff", (0.58, 0.57, 0.55), roughness=0.82)
    for px, py, pz, pr in [
        (0.0, 0.05, 0.560, 0.145),
        (0.115, 0.10, 0.470, 0.115),
        (-0.115, 0.10, 0.470, 0.095),
        (0.0, 0.22, 0.420, 0.120),
    ]:
        puff = C.uv_sphere(f"kodamanonushi_puff{px}_{pz}", (px, py, pz), pr,
                           segments=16, rings=12)
        C.assign_material(puff, puff_mat)
        extras.append(puff)

    # 逸脱項目①(ネガティブスペース)。左の膨らみだけ、声が響き抜ける
    # 空洞にする(honegarami系列はもちろんkodamagumo自身にも無い意匠)。
    # 暗い円盤を膨らみの側面へ半分埋め込み、抜けた穴のように見せる
    echo_hole_mat = C.make_material("kodamanonushi_echo_hole", (0.03, 0.03, 0.04),
                                    roughness=0.95)
    echo_hole = C.cylinder("kodamanonushi_echo_hole", (-0.195, 0.10, 0.470), 0.060, 0.050,
                          segments=18, axis="X")
    C.assign_material(echo_hole, echo_hole_mat)
    # 膨らみ自体が関節から離れた位置にあり、自動ウェイト計算のブレンドに
    # 任せるとdieの大きな崩れで元の位置に取り残される(plan/models/archive/
    # hard-part-bone-pinning-audit.md)。胴の骨(chest-hip)へ剛体固定する
    C.mark_for_pin(echo_hole)
    pinned_parts = [(echo_hole.name, "chest-hip")]
    extras.append(echo_hole)

    # 逸脱項目②(顔の配置の逸脱)。重なり合ってきた過去のこだまの
    # 名残として、本来の目とは高さも大きさも違う目をあと2つ、
    # 左右非対称に散らす(kaerukodama譲りの見開いた目そのものではなく、
    # 色を落として「もう声を発さない、響きの残像」だと分かるようにする)
    echo_eye_mat = C.make_material("kodamanonushi_echo_eye", (0.30, 0.34, 0.36), roughness=0.4)
    for name, (ex, ey, ez), er in [
        ("kodamanonushi_echoeye_r", (0.062, -0.270, 0.400), 0.030),
        ("kodamanonushi_echoeye_l", (-0.028, -0.145, 0.560), 0.020),
    ]:
        echo_eye = C.uv_sphere(name, (ex, ey, ez), er, segments=12, rings=8, scale=(1.0, 0.6, 0.8))
        C.assign_material(echo_eye, echo_eye_mat)
        C.mark_for_pin(echo_eye)
        pinned_parts.append((echo_eye.name, "chest-neck"))
        extras.append(echo_eye)

    # 無数の岩が寄り集まった証として、雲状の膨らみを突き破って覗く
    # 角のある岩の欠片(plan/models/archive/sheet-kodamaNoNushi.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # common.gem(正二十面体)そのままで硬い面を作る
    for i, (px, py, pz, size) in enumerate([
        (0.0, 0.18, 0.640, 0.062), (0.145, 0.16, 0.520, 0.048), (-0.145, 0.16, 0.520, 0.048),
    ]):
        shard = C.gem(f"kodamanonushi_shard{i}", (px, py, pz), size, subdivisions=1)
        C.assign_material(shard, rock)
        extras.append(shard)

    mesh = C.join([body] + extras, "kodamaNoNushi")
    armature = C.build_armature("kodamaNoNushi", joints, bones, mesh, root="chest")
    for group_name, bone in pinned_parts:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature], armature


def kodamaNoNushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・尾の遅れ追従(二次揺れ)・死亡時の跳ね返りを
    足してある。胴の芯(chest-hip)はgajiriと同じくほぼ水平なため、
    歩行の接地沈み(loc)は見送っている。
    """
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 地方の主として、絶えず尾根に響き続けているような、ゆったり大きな
        # 揺れ。尾の付け根(t1)がneckより3フレーム、尾の先(t2)がさらに
        # 2フレーム遅れて追従する(こだまが波状に伝わる二次揺れ)
        ("idle", [
            (1, {neck: (0, 0, 0), t1: (0, 8, 0)}),
            (30, {neck: (-5, 12, 0)}),
            (33, {t1: (0, -8, 0)}, {"partial": True}),
            (35, {t2: (0, 10, 0)}, {"partial": True}),
            (60, {neck: (4, -10, 0)}),
            (63, {t1: (0, 8, 0)}, {"partial": True}),
            (65, {t2: (0, -10, 0)}, {"partial": True}),
            (80, {neck: (0, 0, 0)}),
            (83, {t1: (0, 8, 0)}, {"partial": True}),
            (85, {t2: (0, 0, 0)}, {"partial": True}),
        ]),
        # 巨体を踏みしめる、重く力強い足取り
        ("walk", [
            (1, {fL: (22, 0, 0), fR: (-22, 0, 0), bL: (-18, 0, 0), bR: (18, 0, 0), t1: (0, 12, 0)}),
            (9, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -12, 0)}),
            (17, {fL: (-22, 0, 0), fR: (22, 0, 0), bL: (18, 0, 0), bR: (-18, 0, 0), t1: (0, 12, 0)}),
            (25, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, -12, 0)}),
        ]),
        # 頭を大きく振りかぶり(タメ)、LINEARで地方の主らしい重い一撃を
        # 叩き込み、行き過ぎてからゆっくり構えに戻す
        ("attack", [
            (1, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (7, {snout: (-36, 0, 0), neck: (-28, 0, 0)}, {"interp": "LINEAR"}),
            (10, {snout: (22, 0, 0), neck: (14, 0, 0), fL: (14, 0, 0), fR: (14, 0, 0)}),
            (13, {snout: (26, 0, 0), neck: (17, 0, 0), fL: (16, 0, 0), fR: (16, 0, 0)}),
            (24, {snout: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。boss規約(振幅小さく・素早く)どおり、
        # 振幅・戻り時間とも他種族よりひとまわり絞った
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (14, 0, 0), t1: (0, -14, 0)}),
            (15, {neck: (0, 0, 0), t1: (0, 8, 0)}),
        ]),
        # 重なり合っていた無数のこだまが、LINEARで鋭くほどけかけてから、
        # 大きく崩れ落ちる。30f到達後、前脚がわずかに跳ね返る
        ("die", [
            (1, {neck: (0, 0, 0), t1: (0, 8, 0)}, {"interp": "LINEAR"}),
            (12, {neck: (30, 0, 0), t1: (0, -34, 0), fL: (-34, 0, 0), fR: (-34, 0, 0)}),
            (30, {neck: (46, 0, 0), t1: (0, -58, 0), fL: (-64, 0, 0), fR: (-64, 0, 0),
                  bL: (34, 0, 0), bR: (34, 0, 0)}),
            (34, {fL: (-58, 0, 0), fR: (-58, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== めんかぶりこぞう

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにするが、「隣接するまで気配を消す」(ambush AI)由来から、
# tsubuteのずんぐりした立体感を潰し、全体を平たく低いシルエットにする。
# 顔には出し物の陰に潜む由来にちなんだ祭り面を正面に貼り付ける。
MENKABURIKOZO_HALF = {
    "hip": (0.0, 0.115, 0.098),
    "chest": (0.0, -0.055, 0.108),
    "head": (0.0, -0.215, 0.112),
    "armF.L": (0.148, -0.148, 0.052),
    "handF.L": (0.168, -0.205, 0.014),
    "kneeB.L": (0.200, 0.108, 0.112),
    "ankleB.L": (0.182, -0.038, 0.034),
    "footB.L": (0.168, -0.148, 0.013),
}
MENKABURIKOZO_RADII_HALF = {
    "hip": 0.152, "chest": 0.160, "head": 0.098,
    "armF.L": 0.034, "handF.L": 0.038,
    "kneeB.L": 0.068, "ankleB.L": 0.044, "footB.L": 0.040,
}
MENKABURIKOZO_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_menkaburikozo():
    """
    出し物の陰に潜む悪戯。tsubuteと同じ関節構成をベースに、立体感を
    潰して平たく低いシルエットにし、周囲に溶け込みやすくする。正面には
    出し物の陰に潜む由来にちなんだ祭り面(くすんだ紅色に金色の縁取り)を
    貼り付け、目の穴だけ暗く落とし込んで不意打ちの気配を隠す。
    """
    joints = C.mirrored(MENKABURIKOZO_HALF)
    radii = C.mirrored_radii(MENKABURIKOZO_RADII_HALF)
    bones = C.mirrored_bones(MENKABURIKOZO_BONES_HALF)

    body = C.build_skinned("menkaburikozo", joints, bones, radii, root="chest", subsurf=2)
    cloth = C.make_material("menkaburikozo_cloth", (0.30, 0.26, 0.24), roughness=0.8)
    C.assign_material(body, cloth)

    extras = []
    mask_red = C.make_material("menkaburikozo_mask_m", (0.62, 0.24, 0.22), roughness=0.5)
    mask_gold = C.make_material("menkaburikozo_gold", (0.68, 0.56, 0.28), roughness=0.35, metallic=0.3)
    dark = C.make_material("menkaburikozo_hole", (0.04, 0.04, 0.05), roughness=0.9)

    # 祭り面は面取りした硬い円盤にする(plan/models/
    # sheet-menkaburikozo.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る
    mask = C.cylinder("menkaburikozo_mask", (0.0, -0.235, 0.118), 0.105, 0.058,
                      segments=22, axis="Y", bevel=0.014)
    C.assign_material(mask, mask_red)
    extras.append(mask)
    rim = C.cylinder("menkaburikozo_rim", (0.0, -0.222, 0.118), 0.118, 0.030,
                     segments=22, axis="Y", bevel=0.008)
    C.assign_material(rim, mask_gold)
    extras.append(rim)
    for side in (-1.0, 1.0):
        hole = C.uv_sphere(f"menkaburikozo_hole{side}", (0.052 * side, -0.255, 0.135), 0.026,
                           segments=12, rings=9, scale=(1.0, 0.4, 0.7))
        C.assign_material(hole, dark)
        extras.append(hole)

    mesh = C.join([body] + extras, "menkaburikozo")
    armature = C.build_armature("menkaburikozo", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def menkaburikozo_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・腕の控えめな二次揺れを足してある。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 気配を消してじっと潜む。ほとんど動かないが、腕(armL,R)が頭より
        # 2フレーム遅れて控えめに追従する(息を潜めている感じを強める二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (40, {head: (2, 3, 0)}),
            (42, {armL: (1, 0, 0), armR: (1, 0, 0)}, {"partial": True}),
            (80, {head: (0, 0, 0)}),
            (82, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # 低い姿勢のまま、音も無く忍び寄る
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {legL: (30, 0, 0), legR: (30, 0, 0), head: (6, 0, 0)}),
            (9, {legL: (-24, 0, 0), legR: (-24, 0, 0), head: (-6, 0, 0)}),
            (14, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 面をLINEARで鋭く突き出して跳びかかり、ぶつかった反動で
        # 戻りかけてからゆっくり中立へ戻る不意打ち
        ("attack", [
            (1, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
            (4, {armL: (-40, 0, 20), armR: (-40, 0, -20), head: (-24, 0, 0)}, {"interp": "LINEAR"}),
            (6, {armL: (-48, 0, 20), armR: (-48, 0, -20), head: (-30, 0, 0)}),
            (8, {armL: (30, 0, -10), armR: (30, 0, 10), head: (14, 0, 0)}),
            (16, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。ambush種族なので振幅は中程度、
        # 戻りはゆっくりのまま
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (18, 0, 0), armL: (-20, 0, 16), armR: (-20, 0, -16)}),
            (14, {head: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。22f到達後、頭がほんの少し戻る
        # わずかな跳ね返りを追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (24, 0, 0), legL: (-32, 0, 0), legR: (-32, 0, 0)}),
            (22, {head: (36, 0, 0), legL: (-60, 0, 0), legR: (-60, 0, 0),
                  armL: (-54, 0, 22), armR: (-54, 0, -22)}),
            (26, {head: (31, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== ホネダタミ

# 現在は honegarami モデルを流用中(plan/model-honedatami.md)。
# 計画書の指示どおり honegarami と同じ関節の"種類"
# (hip/chest/neck/head/crown, shoulder-elbow-hand, thigh-knee-foot)を
# 踏襲しつつ、guard AI(通路の真ん中に居座ってどかない)に合わせて
# 座標をゼロから設計し直す。honegaramiは「細い手足+浮いた肋骨」で
# 剣士らしい軽さを出していたが、ホネダタミは正反対に、背を低く
# 幅を大きく取り、四肢を太く短く詰めて、通路そのものを塞ぐ
# どっしりした山にする。剣は持たせず、両腕は素手のまま。
# 背には積年の記憶が積もったように骨板を何枚も無造作に重ね、
# 名前どおり「骨のタタミ(積み重ね)」を背負わせる。
HONEDATAMI_HALF = {
    "hip": (0.0, 0.010, 0.145),
    "chest": (0.0, 0.0, 0.275),
    "neck": (0.0, 0.0, 0.360),
    "head": (0.0, -0.020, 0.430),
    "crown": (0.0, 0.0, 0.495),
    "shoulder.L": (0.205, 0.0, 0.300),
    "elbow.L": (0.245, 0.030, 0.205),
    "hand.L": (0.215, -0.010, 0.125),
    "thigh.L": (0.170, 0.0, 0.125),
    "knee.L": (0.200, -0.005, 0.045),
    "foot.L": (0.175, -0.065, 0.010),
}
# 半径は honegarami よりずっと太い。とくに hip/chest は、隣接する
# shoulder/thigh の関節がはっきりその外へ突き出す太さに収まるよう、
# 距離 > 半径差を個別に検算して決めた(細身の四肢では埋もれやすいため)
HONEDATAMI_RADII_HALF = {
    "hip": 0.130, "chest": 0.148, "neck": 0.058, "head": 0.115, "crown": 0.062,
    "shoulder.L": 0.075, "elbow.L": 0.060, "hand.L": 0.068,
    "thigh.L": 0.078, "knee.L": 0.058, "foot.L": 0.066,
}
HONEDATAMI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def _rotate_z_around(obj, degrees: float, pivot) -> None:
    """
    メッシュの頂点を pivot を中心に Z 軸まわりで回す。obj.rotation_euler は
    オブジェクト原点(ワールド原点)を中心に回してしまい、box()/cone() で
    作った部品はワールド座標へ直接頂点を置いているためオブジェクト原点が
    ワールド原点と一致せず、位置が大きくずれる。頂点そのものを部品自身の
    中心まわりで回すことでこれを避ける。
    """
    ang = math.radians(degrees)
    cos_a, sin_a = math.cos(ang), math.sin(ang)
    px, py = pivot[0], pivot[1]
    for v in obj.data.vertices:
        x, y = v.co.x - px, v.co.y - py
        v.co.x = px + x * cos_a - y * sin_a
        v.co.y = py + x * sin_a + y * cos_a


def build_honedatami():
    """
    通路の真ん中に居座って動かない、骨積みの回廊のguard。honegaramiと同じ
    関節の種類を踏襲しつつ、背を低く幅広くして四肢を太く短く詰め、
    「積み重なった記憶の重みそのもの」という設定どおり、剣士ではなく
    無造作に積まれた骨の山として造形する。
    """
    joints = C.mirrored(HONEDATAMI_HALF)
    radii = C.mirrored_radii(HONEDATAMI_RADII_HALF)
    bones = C.mirrored_bones(HONEDATAMI_BONES_HALF)

    body = C.build_skinned("honedatami", joints, bones, radii, root="hip", subsurf=2)
    bone_mat = C.make_material("honeda_bone", (0.86, 0.83, 0.72), roughness=0.75)
    dust_mat = C.make_material("honeda_dust", (0.50, 0.48, 0.44), roughness=0.92)
    # 通路の床に長く居座って積もった土埃を、脚まわりの低い位置だけ
    # くすんだ色にすることで表現する(距離ではなく高さで判定)
    C.assign_materials_by_region(body, [bone_mat, dust_mat], lambda c: 1 if c.z < 0.085 else 0)
    counts = [0, 0]
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"honedatami: 骨色{counts[0]} 土埃色{counts[1]} / 計{total} "
          f"({[f'{c / total:.1%}' for c in counts]})")

    extras = []
    plate_mat = C.make_material("honeda_plate", (0.60, 0.58, 0.53), roughness=0.85)
    plate_mat2 = C.make_material("honeda_plate2", (0.71, 0.68, 0.59), roughness=0.8)
    socket_mat = C.make_material("honeda_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("honeda_glow", (0.68, 0.58, 0.32), roughness=0.35, emission=1.3)

    # 頭。honegaramiと違い剣士の頬骨や歯は作らず、丸みを抑えた
    # 兜のような頭蓋にして、道を塞ぐ物質的な"壁"らしさを強める
    skull = C.uv_sphere("honeda_skull", (0.0, -0.02, 0.415), 0.118,
                        segments=18, rings=12, scale=(1.0, 0.92, 0.72))
    C.assign_material(skull, bone_mat)
    extras.append(skull)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"honeda_socket{side}", (0.052 * side, -0.098, 0.435), 0.032,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.1))
        C.assign_material(socket, socket_mat)
        extras.append(socket)
        # 記憶の重みを鈍く灯すだけの、honegaramiより暗い燠火のような目
        glow = C.uv_sphere(f"honeda_glow{side}", (0.052 * side, -0.106, 0.435), 0.014,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)

    # 積まれた骨板。胴の表面にぴったり寄り添わせて重ね、鎧の鱗板の
    # ように貼り付いて見せる(浮かせると別パーツに見えてしまう)。
    # 左右にわずかにはみ出させて、道いっぱいに居座る幅の広さを伝える。
    # 1枚ごとに位置・向き・厚みを少しずつ振り、精密に整列させない
    side_plate_specs = [
        # (中心x,y,z / サイズxyz / 面取り / 回転deg)
        ((0.150, 0.020, 0.140), (0.032, 0.100, 0.088), 0.004, -5.0),
        ((0.185, 0.010, 0.230), (0.030, 0.108, 0.096), 0.004, 6.0),
        ((0.175, 0.030, 0.320), (0.026, 0.098, 0.088), 0.004, -7.0),
        ((0.140, 0.010, 0.395), (0.022, 0.078, 0.066), 0.004, 5.0),
    ]
    for side in (-1.0, 1.0):
        mats = (plate_mat, plate_mat2) if side < 0 else (plate_mat2, plate_mat)
        for i, (center, size, bevel, rot) in enumerate(side_plate_specs):
            c = (center[0] * side, center[1], center[2])
            plate = C.box(f"honeda_splate{side}_{i}", c, size, bevel=bevel)
            _rotate_z_around(plate, rot * side, c)
            C.assign_material(plate, mats[i % 2])
            extras.append(plate)
    # 正面(-Y側、通常のカメラが向く側)にも胸当てのように骨板を
    # 重ねる。側面の板は死角に隠れがちなので、真正面から見ても
    # 「板が積み重なっている」と分かるよう主張を置く
    front_specs = [
        ((0.0, -0.128, 0.170), (0.145, 0.024, 0.070), 0.005, -3.0, plate_mat2),
        ((0.010, -0.135, 0.245), (0.160, 0.022, 0.066), 0.005, 4.0, plate_mat),
        ((-0.006, -0.126, 0.315), (0.130, 0.020, 0.058), 0.004, -5.0, plate_mat2),
    ]
    for i, (center, size, bevel, rot, mat) in enumerate(front_specs):
        plate = C.box(f"honeda_fplate{i}", center, size, bevel=bevel)
        _rotate_z_around(plate, rot, center)
        C.assign_material(plate, mat)
        extras.append(plate)
    # 頭の上にも直接重ね、頂に小さな石積みが乗っているように見せる
    top_specs = [
        ((0.0, 0.0, 0.505), (0.130, 0.088, 0.026), 0.005, 4.0, plate_mat),
        ((0.010, -0.008, 0.535), (0.092, 0.064, 0.022), 0.004, -6.0, plate_mat2),
    ]
    for i, (center, size, bevel, rot, mat) in enumerate(top_specs):
        plate = C.box(f"honeda_toplate{i}", center, size, bevel=bevel)
        _rotate_z_around(plate, rot, center)
        C.assign_material(plate, mat)
        extras.append(plate)

    mesh = C.join([body] + extras, "honedatami")
    armature = C.build_armature("honedatami", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def honedatami_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・頭の遅れ追従(二次揺れ)・歩行の接地沈みを
    honegarami本家remakeと同じ処方で足してある。guardらしい「どっしり
    構えて動じない」性格を保つため振幅は現行値のまま据え置く。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # どっしり構えたまま、ごく僅かに軋むだけのほとんど静止した待機。
        # 積まれた頭(neck)が本体(hipc)より3フレーム遅れて軋む(二次揺れ)
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (30, {hipc: (1, 0, 0)}),
            (33, {neck: (2, 0, 0)}, {"partial": True}),
            (60, {hipc: (0, 0, 0)}),
            (63, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 重い塊がのろのろ引きずられるような、地を這う歩み。
        # 脚が正中に戻る瞬間(接地)にごくわずかだけ胴を沈める
        ("walk", [
            (1, {legL: (10, 0, 0), legR: (-10, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                 hipc: (0, 0, 1)}),
            (12, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: {"rot": (0, 0, 0), "loc": (0, -0.006, 0)}}),
            (23, {legL: (-10, 0, 0), legR: (10, 0, 0), shinL: (5, 0, 0), shinR: (-6, 0, 0),
                  hipc: (0, 0, -1)}),
            (34, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: {"rot": (0, 0, 0), "loc": (0, -0.006, 0)}}),
            (45, {legL: (10, 0, 0), legR: (-10, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                  hipc: (0, 0, 1)}),
        ]),
        # 剣を持たない代わりに、両腕をまとめて叩きつける正面への体当たり。
        # タメ→LINEARで鋭く叩きつける→わずかな行き過ぎ→素手のまま構えに戻る
        ("attack", [
            (1, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (7, {armL: (-30, 0, 20), armR: (-30, 0, -20), foreL: (-20, 0, 0), foreR: (-20, 0, 0),
                 hipc: (-10, 0, 0), neck: (-6, 0, 0)}, {"interp": "LINEAR"}),
            (13, {armL: (48, 0, 4), armR: (48, 0, -4), foreL: (14, 0, 0), foreR: (14, 0, 0),
                  hipc: (12, 0, 0), neck: (4, 0, 0)}),
            (16, {armL: (56, 0, 4), armR: (56, 0, -4), foreL: (14, 0, 0), foreR: (14, 0, 0),
                  hipc: (12, 0, 0), neck: (4, 0, 0)}),
            (24, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        # 高い防御力どおり、当たってもほとんど揺るがない。入りだけLINEARで鋭くする
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-6, 0, 0), neck: (-8, 0, 0)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 積まれていた骨の山がそのまま崩れ落ちる。初動をLINEARで鋭くし、
        # 26f到達後に骨板が一度小さく弾んでから完全に崩れ落ちる
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {hipc: (-10, 0, 8), neck: (-20, 0, 0), armL: (-30, 0, 30), armR: (-30, 0, -30)}),
            (26, {hipc: (-70, 0, 22), neck: (-46, 0, 0), legL: (34, 0, 0), legR: (30, 0, 0),
                  armL: (-70, 0, 60), armR: (-70, 0, -60)}),
            (30, {hipc: (-64, 0, 20), neck: (-42, 0, 0), legL: (31, 0, 0), legR: (27, 0, 0),
                  armL: (-63, 0, 54), armR: (-63, 0, -54)}),
        ]),
    ]


# ===================================================================== かざりだるま

# honegaramiと同じ人型骨組み(hip/chest/neck/head/crown、shoulder/elbow/
# hand、thigh/knee/foot)をベースにするが、「飾られたまま忘れられた
# 縁起物」という由来から、腕・脚をごく短く詰めて胴体の丸みに埋もれさせ、
# 縦に大きく膨らんだ胴と丸い頭だけの、だるまらしい丸っこいシルエットに
# する。guard AI(その場を動かない・高い防御力)にも合う低い重心。
KAZARIDARUMA_HALF = {
    "hip": (0.0, 0.0, 0.150),
    "chest": (0.0, 0.0, 0.335),
    "neck": (0.0, 0.0, 0.435),
    "head": (0.0, -0.010, 0.485),
    "crown": (0.0, 0.0, 0.540),
    "shoulder.L": (0.190, 0.0, 0.335),
    "elbow.L": (0.212, 0.012, 0.235),
    "hand.L": (0.196, -0.010, 0.150),
    "thigh.L": (0.112, 0.0, 0.112),
    "knee.L": (0.116, 0.0, 0.052),
    "foot.L": (0.106, -0.030, 0.012),
}
KAZARIDARUMA_RADII_HALF = {
    "hip": 0.198, "chest": 0.235, "neck": 0.076, "head": 0.178, "crown": 0.040,
    "shoulder.L": 0.056, "elbow.L": 0.042, "hand.L": 0.046,
    "thigh.L": 0.060, "knee.L": 0.048, "foot.L": 0.050,
}
KAZARIDARUMA_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_kazaridaruma():
    """
    飾られたまま忘れられた縁起物。見世物のぬしの小型版のような姿。
    honegaramiと同じ人型骨組みをベースに、腕・脚を短く詰めて胴に埋もれ
    させ、縦に大きく膨らんだ胴と丸い頭だけのだるまらしいシルエットに
    する。配色は第七地方(わすれられた祭りの跡)の、くすんだ紅色に金色の
    帯、白く塗り残された顔の一角。
    """
    joints = C.mirrored(KAZARIDARUMA_HALF)
    radii = C.mirrored_radii(KAZARIDARUMA_RADII_HALF)
    bones = C.mirrored_bones(KAZARIDARUMA_BONES_HALF)

    body = C.build_skinned("kazaridaruma", joints, bones, radii, root="hip", subsurf=2)
    red = C.make_material("kazaridaruma_red", (0.58, 0.20, 0.18), roughness=0.6)
    gold = C.make_material("kazaridaruma_gold", (0.66, 0.54, 0.26), roughness=0.35, metallic=0.25)
    # 腰まわりの帯だけ金色にする
    C.assign_materials_by_region(
        body, [red, gold],
        lambda c: 1 if (0.235 < c.z < 0.285) else 0,
    )

    extras = []
    face = C.make_material("kazaridaruma_face", (0.90, 0.86, 0.76), roughness=0.55)
    ink = C.make_material("kazaridaruma_ink", (0.10, 0.09, 0.10), roughness=0.5)
    # 白く塗り残された顔の一角(扁平な楕円)
    plate = C.uv_sphere("kazaridaruma_plate", (0.0, -0.152, 0.472), 0.148,
                        segments=20, rings=14, scale=(1.0, 0.28, 0.86))
    C.assign_material(plate, face)
    extras.append(plate)
    # 太い眉と髭を、細長く潰したuv_sphereで描く
    brow = C.uv_sphere("kazaridaruma_brow", (0.0, -0.205, 0.545), 0.020,
                       segments=14, rings=8, scale=(3.6, 0.6, 1.0))
    C.assign_material(brow, ink)
    extras.append(brow)
    mustache = C.uv_sphere("kazaridaruma_mustache", (0.0, -0.205, 0.418), 0.018,
                           segments=14, rings=8, scale=(3.2, 0.6, 1.0))
    C.assign_material(mustache, ink)
    extras.append(mustache)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"kazaridaruma_eye{side}", (0.062 * side, -0.208, 0.492), 0.030,
                          segments=14, rings=10, scale=(1.0, 0.55, 1.0))
        C.assign_material(eye, ink)
        extras.append(eye)

    # 飾られていた台座(plan/models/archive/sheet-kazaridaruma.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 「飾られたまま」その場から動けないことを示す、面取りした円柱
    pedestal_mat = C.make_material("kazaridaruma_pedestal", (0.36, 0.26, 0.16), roughness=0.7)
    pedestal = C.cylinder("kazaridaruma_pedestal", (0.0, 0.0, 0.006), 0.235, 0.030,
                          segments=28, bevel=0.010)
    C.assign_material(pedestal, pedestal_mat)
    extras.append(pedestal)

    mesh = C.join([body] + extras, "kazaridaruma")
    armature = C.build_armature("kazaridaruma", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def kazaridaruma_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・頭の遅れ追従(二次揺れ)・歩行の接地沈みを
    足してある。guard AIの「その場をほとんど動かない・高い防御力」という
    性格を保ったまま、規約の「guard/boss=振幅小さく・素早く」を強く当てる。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 縁起物らしく、その場でわずかに揺れるだけのほとんど静止した待機。
        # 頭(neck)が胴(hipc)より3フレーム遅れてごくわずかに追従する(二次揺れ)
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (36, {hipc: (2, 0, 1)}),
            (39, {neck: (1, 0, 1)}, {"partial": True}),
            (72, {hipc: (0, 0, 0)}),
            (75, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 短い手足で、ころころと弾むように短く進む。脚が接地する瞬間に
        # 胴をごくわずかだけ沈める(honegaramiよりさらに小さい沈み)
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), hipc: (0, 0, 2)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: {"rot": (0, 0, 0), "loc": (0, -0.004, 0)}}),
            (19, {legL: (-18, 0, 0), legR: (18, 0, 0), hipc: (0, 0, -2)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), hipc: {"rot": (0, 0, 0), "loc": (0, -0.004, 0)}}),
        ]),
        # 高い防御力どおり、短い腕をまとめて押し出すだけの鈍い一撃。
        # タメ→LINEARで鋭く押し出す→わずかな行き過ぎ→ゆっくり戻る
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (8, {armL: (-40, 0, 22), armR: (-40, 0, -22), hipc: (-8, 0, 0)}, {"interp": "LINEAR"}),
            (11, {armL: (34, 0, 4), armR: (34, 0, -4), hipc: (10, 0, 0), neck: (-4, 0, 0)}),
            (13, {armL: (38, 0, 4), armR: (38, 0, -4), hipc: (10, 0, 0), neck: (-4, 0, 0)}),
            (24, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        # 起き上がりこぼしのように、当たっても大きくは揺るがない。
        # 入りだけLINEARで鋭くし、振幅・戻り時間は現行の小さめのまま維持する
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-10, 0, 0), neck: (-6, 0, 0)}),
            (16, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 起き上がれずに、そのまま横へ転がり倒れる。初動をLINEARで鋭くし
        # 「最初にびくっと傾ぐ」瞬間を加える。26f到達後、横転した末端
        # (腕)が一度小さく跳ね返る
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {hipc: (-24, 0, 30), neck: (-10, 0, 0)}),
            (26, {hipc: (-30, 0, 92), neck: (-18, 0, 0),
                  armL: (-20, 0, 40), armR: (-20, 0, -40)}),
            (30, {armL: (-16, 0, 32), armR: (-16, 0, -32)}, {"partial": True}),
        ]),
    ]


# ======================================================================= かげぼうし

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにする、menkaburikozoと同系統の奇襲役(ambush AI)。menkaburikozo
# が「面をかぶって潜む」のに対し、かげぼうしは「祭りの影絵芝居そのものの
# 忘れ物」という由来のため、立体感をさらに削って紙のように薄い輪郭にし、
# 全身をほぼ黒一色にする。祭りの提灯に透かされていた名残として、
# 三日月形の眠たげな目だけを金色に発光させる(混乱ではなく眠りを誘う
# 由来にちなみ、menkaburikozoの見開いた目の穴とは逆に閉じた目にする)。
KAGEBOUSHI_HALF = {
    "hip": (0.0, 0.108, 0.088),
    "chest": (0.0, -0.052, 0.096),
    "head": (0.0, -0.205, 0.100),
    "armF.L": (0.140, -0.140, 0.046),
    "handF.L": (0.158, -0.196, 0.012),
    "kneeB.L": (0.188, 0.102, 0.100),
    "ankleB.L": (0.170, -0.036, 0.030),
    "footB.L": (0.158, -0.140, 0.011),
}
KAGEBOUSHI_RADII_HALF = {
    "hip": 0.128, "chest": 0.135, "head": 0.088,
    "armF.L": 0.026, "handF.L": 0.030,
    "kneeB.L": 0.056, "ankleB.L": 0.036, "footB.L": 0.032,
}
KAGEBOUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kageboushi():
    """
    祭りの影絵芝居の忘れ物。tsubuteと同じ関節構成をベースに、
    menkaburikozoよりさらに立体感を削った紙のように薄いシルエットに
    する。全身をほぼ黒一色にし、提灯に透かされていた名残として
    三日月形の眠たげな目だけを金色に発光させる。
    """
    joints = C.mirrored(KAGEBOUSHI_HALF)
    radii = C.mirrored_radii(KAGEBOUSHI_RADII_HALF)
    bones = C.mirrored_bones(KAGEBOUSHI_BONES_HALF)

    body = C.build_skinned("kageboushi", joints, bones, radii, root="chest", subsurf=2)
    shadow = C.make_material("kageboushi_shadow", (0.05, 0.045, 0.055), roughness=0.7)
    C.assign_material(body, shadow)

    extras = []
    glow = C.make_material("kageboushi_glow", (0.85, 0.66, 0.28), roughness=0.3, emission=1.8)
    for side in (-1.0, 1.0):
        # 三日月形の目。細長く潰したuv_sphereを2つ重ねて三日月の欠けを作る
        moon = C.uv_sphere(f"kageboushi_moon{side}", (0.048 * side, -0.238, 0.108), 0.022,
                           segments=14, rings=10, scale=(1.0, 0.5, 1.4))
        C.assign_material(moon, glow)
        extras.append(moon)
        bite = C.uv_sphere(f"kageboushi_bite{side}", (0.048 * side + 0.010 * side, -0.246, 0.108), 0.020,
                           segments=14, rings=10, scale=(1.0, 0.5, 1.4))
        C.assign_material(bite, shadow)
        extras.append(bite)

    # まだ繋がれたままの操り棒(plan/models/archive/sheet-kageboushi.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 頭から真上に伸びる、面取りした細い硬い円柱
    rod_mat = C.make_material("kageboushi_rod", (0.10, 0.09, 0.10), roughness=0.5)
    rod = C.cylinder("kageboushi_rod", (0.0, -0.205, 0.235), 0.010, 0.220, segments=10, bevel=0.004)
    C.assign_material(rod, rod_mat)
    extras.append(rod)

    mesh = C.join([body] + extras, "kageboushi")
    armature = C.build_armature("kageboushi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kageboushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・前脚の極小な遅れ追従(二次揺れ)を足してある。
    dieは「潰れて消える」独自演出の方針を尊重し、fallさせずに揺り戻しを表現する。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 影のように、ほとんど気配なく潜む。「影がわずかに滲むように遅れる」
        # ごく控えめな揺れとして、前脚(armL,R)が頭より4フレーム遅れて
        # 極小(±1°)だけ追従する(静けさを壊さない範囲の二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (44, {head: (2, 4, 0)}),
            (48, {armL: (1, 0, 0), armR: (1, 0, 0)}, {"partial": True}),
            (88, {head: (0, 0, 0)}),
            (92, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # 音も無く、するすると這うように忍び寄る
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (6, {legL: (28, 0, 0), legR: (28, 0, 0), head: (5, 0, 0)}),
            (11, {legL: (-22, 0, 0), legR: (-22, 0, 0), head: (-5, 0, 0)}),
            (16, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 影が伸びるようにLINEARで鋭く腕を差し伸べ、わずかに行き過ぎて
        # から気配を消した構えに戻る、眠りを誘う不意打ち
        ("attack", [
            (1, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {armL: (-46, 0, 24), armR: (-46, 0, -24), head: (-20, 0, 0)}, {"interp": "LINEAR"}),
            (10, {armL: (26, 0, -8), armR: (26, 0, 8), head: (10, 0, 0)}),
            (13, {armL: (34, 0, -8), armR: (34, 0, 8), head: (10, 0, 0)}),
            (18, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。防御力は突出して高くないため
        # 振幅・戻り時間とも現行のまま維持する
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (16, 0, 0), armL: (-18, 0, 14), armR: (-18, 0, -14)}),
            (14, {head: (0, 0, 0)}),
        ]),
        # 影そのものが薄れ消えていくように、色が沈むのではなく潰れて消える。
        # 初動をLINEARで鋭くし「びくっと潰れる」瞬間を加え、24f到達後に
        # 完全に潰れきる直前の揺り戻し(fallさせない着地バウンドの代替)を追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {head: (22, 0, 0), legL: (-30, 0, 0), legR: (-30, 0, 0)}),
            (24, {head: (34, 0, 0), legL: (-56, 0, 0), legR: (-56, 0, 0),
                  armL: (-50, 0, 20), armR: (-50, 0, -20)}),
            (28, {head: (29, 0, 0), legL: (-48, 0, 0), legR: (-48, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== ちょうちんおくり

CHOUCHINOKURI_JOINTS = {
    "base": (0.0, 0.0, 0.065),
    "mid": (0.0, 0.0, 0.185),
    "top": (0.0, 0.0, 0.305),
}
CHOUCHINOKURI_RADII = {"base": 0.115, "mid": 0.200, "top": 0.095}
CHOUCHINOKURI_BONES = [("base", "mid"), ("mid", "top")]


def build_chouchinokuri():
    """
    消えかけた祭りの灯り。purunと同じ縦2本の骨組みをそのまま流用するが、
    半径を両端で絞り中央で膨らませ、提灯らしい俵形のシルエットにする。
    群れ配置(swarm AI)に合わせ、単体は簡略化した小さなシルエットに
    とどめる。配色は第七地方(わすれられた祭りの跡)の、くすんだ紅色に
    金色の上下の口輪、内側からにじむ橙色の灯り。
    """
    body = C.build_skinned("chouchinokuri", CHOUCHINOKURI_JOINTS, CHOUCHINOKURI_BONES,
                           CHOUCHINOKURI_RADII, root="base", subsurf=2)
    paper = C.make_material("chouchinokuri_paper", (0.56, 0.22, 0.20), roughness=0.55)
    # 提灯の骨(縦の張り骨)を、正面から見た角度で細い縞に塗り分ける
    glow_strip = C.make_material("chouchinokuri_strip", (0.80, 0.42, 0.20), roughness=0.4,
                                 emission=0.6)

    def classify(c):
        angle = math.atan2(c.x, -c.y)
        return 1 if (math.sin(angle * 6.0) > 0.72) else 0

    C.assign_materials_by_region(body, [paper, glow_strip], classify)

    extras = []
    gold = C.make_material("chouchinokuri_gold", (0.70, 0.56, 0.28), roughness=0.35, metallic=0.3)
    # 提灯の上下を締める、面取りした竹の口輪(plan/models/archive/sheet-chouchinokuri.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 丸い体表面に唯一の角のある面を作る、面取りした円柱
    for cz, radius in ((0.075, 0.125), (0.300, 0.105)):
        ring = C.cylinder(f"chouchinokuri_ring{cz}", (0.0, 0.0, cz), radius, 0.038,
                          segments=20, bevel=0.010)
        C.assign_material(ring, gold)
        extras.append(ring)
    ember = C.uv_sphere("chouchinokuri_ember", (0.0, 0.0, 0.185), 0.080,
                        segments=16, rings=12)
    C.assign_material(ember, C.make_material("chouchinokuri_ember_m", (0.95, 0.62, 0.24),
                                             roughness=0.3, emission=1.6))
    extras.append(ember)
    for side in (-1.0, 1.0):
        extras += eyeball(f"chouchinokuri_eye{side}", (0.075 * side, -0.185, 0.205), 0.032,
                          look=(0.15 * side, -1.0, 0.0),
                          white=(0.85, 0.72, 0.55), dark=(0.12, 0.07, 0.05))

    mesh = C.join([body] + extras, "chouchinokuri")
    armature = C.build_armature("chouchinokuri", C.mirrored(CHOUCHINOKURI_JOINTS),
                                CHOUCHINOKURI_BONES, mesh, root="base")
    return [mesh, armature], armature


def chouchinokuri_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    purun_animations()の流用をやめ専用のキーフレームを書いた。purunの
    重い潰し伸ばしとは違い、揺れの主体を上部(upper)の回転側に置いた
    「軽く揺れる紙と灯り」の質感を狙う。振幅もpurunより控えめにする。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.1, 0.9, 1.1)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 灯りがゆらゆらと漂う。upperはlowerより2フレーム遅れて追従する
        ("idle", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (16, {lower: {"scale": (1.05, 0.94, 1.05)}}),
            (18, {upper: (3, 0, 0)}, {"partial": True}),
            (32, {lower: neutral}),
            (34, {upper: (0, 0, 0)}, {"partial": True}),
        ]),
        # squash&stretchによる上下動が接地の軽さを表現する(現行方針を維持)
        ("walk", [
            (1, {lower: neutral}),
            (4, {lower: squash}),
            (9, {lower: {"scale": (0.92, 1.14, 0.92), "loc": (0, 0.06, 0)}}),
            (14, {lower: {"scale": (1.05, 0.92, 1.05)}}),
            (20, {lower: neutral}),
        ]),
        # タメ(upperを後ろへ傾ける)→ツメ(LINEARで大きく振り込む)→
        # 行き過ぎ→戻り。灯りがゆらりと傾いてぶつかる動き
        ("attack", [
            (1, {lower: neutral, upper: (0, 0, 0)}),
            (4, {lower: neutral, upper: (-8, 0, 0)}),
            (7, {lower: squash, upper: (22, 0, 0)}, {"interp": "LINEAR"}),
            (9, {lower: {"scale": (1.05, 0.95, 1.05)}, upper: (16, 0, 0)}),
            (18, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # 灯りが吹き消されそうになって大きく揺らぐ。swarm下位個体らしく
        # purunより早めに収める
        ("hit", [
            (1, {lower: neutral, upper: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {lower: {"scale": (1.15, 0.85, 1.15)}, upper: (24, 0, 0)}),
            (14, {lower: neutral, upper: (0, 0, 0)}),
        ]),
        # 初動にLINEARを足してすっと萎むきっかけを作り、ゆっくり潰れて
        # 消える。紙質感には合わないので着地後の跳ね返りは入れない
        ("die", [
            (1, {lower: neutral, upper: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {lower: {"scale": (1.2, 0.5, 1.2)}, upper: (8, 0, 0)}),
            (24, {lower: {"scale": (1.3, 0.05, 1.3)}, upper: (0, 0, 0)}),
        ]),
    ]


# =================================================================== わたあめのおばけ

WATAAMENOOBAKE_JOINTS = {
    "base": (0.0, 0.0, 0.035),
    "mid": (0.0, 0.0, 0.145),
    "top": (0.0, 0.0, 0.235),
}
# purunとは正反対に、根元(base)を細く絞り先端(top)を膨らませる。
# 幽霊らしい先細りの尾と、わたあめらしいふくらんだ頭を1本の骨組みで作る
WATAAMENOOBAKE_RADII = {"base": 0.035, "mid": 0.145, "top": 0.155}
WATAAMENOOBAKE_BONES = [("base", "mid"), ("mid", "top")]


def build_wataamenoobake():
    """
    甘い匂いに誘われる夢。purunと同じ縦2本の骨組みをそのまま流用するが、
    半径をpurunとは逆に根元を細く先端を太くし、幽霊らしい先細りの尾と
    わたあめらしいふくらんだ頭のシルエットにする。coward AIに合わせ、
    小柄で軽く、逃げ足の速さを感じさせる。周囲に小さな綿雲の房を
    まとわせ、触れるとほどけて散る綿あめの質感を出す。配色は第七地方
    (わすれられた祭りの跡)の、くすんだ紅色を淡くした桃色と金色の煌めき。
    """
    body = C.build_skinned("wataamenoobake", WATAAMENOOBAKE_JOINTS, WATAAMENOOBAKE_BONES,
                           WATAAMENOOBAKE_RADII, root="base", subsurf=2)
    fluff = C.make_material("wataame_fluff", (0.78, 0.52, 0.56), roughness=0.85)
    C.assign_material(body, fluff)

    puffs = []
    for i, (px, py, pz, pr) in enumerate([
        (0.0, -0.02, 0.255, 0.075),
        (0.095, 0.03, 0.220, 0.062),
        (-0.095, 0.03, 0.220, 0.062),
        (0.0, 0.09, 0.195, 0.058),
        (0.055, -0.01, 0.290, 0.050),
        (-0.055, -0.01, 0.290, 0.050),
    ]):
        puff = C.uv_sphere(f"wataame_puff{i}", (px, py, pz), pr, segments=14, rings=10)
        C.assign_material(puff, fluff)
        puffs.append(puff)
    body = C.join([body] + puffs, "wataamenoobake")

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"wataame_eye{side}", (0.052 * side, -0.140, 0.210), 0.030,
                          look=(0.2 * side, -1.0, 0.05),
                          white=(0.92, 0.86, 0.82), dark=(0.14, 0.09, 0.10))
    sparkle_mat = C.make_material("wataame_sparkle", (0.82, 0.66, 0.30), roughness=0.3, emission=1.4)
    for sx, sy, sz in [(0.130, 0.06, 0.270), (-0.115, 0.08, 0.310), (0.02, -0.05, 0.335)]:
        sparkle = C.uv_sphere(f"wataame_sparkle{sx}_{sz}", (sx, sy, sz), 0.016,
                              segments=10, rings=8)
        C.assign_material(sparkle, sparkle_mat)
        extras.append(sparkle)

    # 刺さったままの割り箸(菓子の芯棒)。わたあめが割り箸に巻かれた
    # まま夢になった、という見立て(plan/models/
    # sheet-wataamenoobake.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る、面取りした細い円柱
    stick_mat = C.make_material("wataame_stick", (0.80, 0.74, 0.58), roughness=0.7)
    stick = C.cylinder("wataame_stick", (0.0, 0.0, -0.045), 0.010, 0.170,
                       segments=10, bevel=0.003)
    C.assign_material(stick, stick_mat)
    extras.append(stick)

    mesh = C.join([body] + extras, "wataamenoobake")
    armature = C.build_armature("wataamenoobake", C.mirrored(WATAAMENOOBAKE_JOINTS),
                                WATAAMENOOBAKE_BONES, mesh, root="base")
    return [mesh, armature], armature


def wataamenoobake_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・打撃(LINEAR補間)・行き過ぎ・二次揺れ・die跳ね返りを足してある。
    骨2本(lower/upper)のみのため、追加ボーンの二次揺れは組めず、
    upperをlowerより2フレーム遅らせる形で漂いの二次揺れを表現した。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.24, 0.66, 1.24)}
    stretch = {"scale": (0.80, 1.32, 0.80)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # ふわふわと軽く漂う、地に足の付かない待機。upper(頭側)がlowerより
        # 2フレーム遅れて追従する漂いの二次揺れを追加
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (16, {lower: {"scale": (1.05, 0.94, 1.05)}}),
            (18, {upper: {"scale": (0.96, 1.06, 0.96)}}, {"partial": True}),
            (32, {lower: neutral, upper: neutral}),
        ]),
        # coward AIらしく、素早く逃げるように弾む
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (3, {lower: squash, upper: stretch}),
            (7, {lower: {**stretch, "loc": (0, 0.11, 0)}, upper: squash}),
            (11, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (15, {lower: neutral, upper: neutral}),
        ]),
        # タメ(1→4、現行のまま)→LINEARで鋭く伸ばす打撃(4→7、元のピークを
        # 増幅・前倒し)→行き過ぎ(7→9、元のピーク値へ戻りかける)→戻り
        # (9→18)の4段に整理。coward種族らしく振り自体はやや小さめのまま
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (7, {lower: {"scale": (0.76, 1.38, 0.76)}, upper: {"scale": (1.18, 0.74, 1.18)}},
             {"interp": "LINEAR"}),
            (9, {lower: {"scale": (0.82, 1.3, 0.82)}, upper: {"scale": (1.14, 0.8, 1.14)}}),
            (18, {lower: neutral, upper: neutral}),
        ]),
        # 入りをLINEARで鋭くする。cowardらしく振幅・戻りは現行どおり
        # 大きめ・ゆっくりのまま
        ("hit", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: {"scale": (1.28, 0.68, 1.28)}, upper: {"scale": (0.85, 1.2, 0.85)}},
             {"interp": "LINEAR"}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # 触れるとほどけて散る綿あめのように、輪郭を崩しながら薄れ消える。
        # 初動をLINEARで鋭くし、崩れきったあとにわずかな揺り戻しを追加
        ("die", [
            (1, {lower: neutral, upper: neutral}),
            (10, {lower: {"scale": (1.4, 0.4, 1.4)}, upper: {"scale": (1.3, 0.5, 1.3)}},
             {"interp": "LINEAR"}),
            (24, {lower: {"scale": (1.6, 0.05, 1.6)}, upper: {"scale": (1.5, 0.06, 1.5)}}),
            (28, {lower: {"scale": (1.5, 0.10, 1.5)}, upper: {"scale": (1.4, 0.12, 1.4)}},
             {"partial": True}),
        ]),
    ]


# ======================================================================= やぐらもり

# madoromiと同じ関節構成(root/stem/capbase/captop)をベースにするが、
# きのこの傘ではなく祭りの櫓を思わせる姿にする。stemをmadoromiより長く
# 細く伸ばして櫓の柱にし、cap側は高さを大きく詰めて平たい屋根板にする。
# 「矢のような一撃」を放つ由来から、屋根の中心に鏃のような棘を立てる。
YAGURAMORI_JOINTS = {
    "root": (0.0, 0.0, 0.045),
    "stem": (0.0, 0.0, 0.300),
    "capbase": (0.0, 0.0, 0.400),
    "captop": (0.0, 0.0, 0.460),
}
YAGURAMORI_RADII = {"root": 0.095, "stem": 0.058, "capbase": 0.235, "captop": 0.190}
YAGURAMORI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_yaguramori():
    """
    祭りの櫓に住み着いた古い霊。madoromiと同じ関節構成をベースに、
    柱を長く細く、屋根を平たく広く作り替えて祭りの櫓を思わせる姿にする。
    屋根の中心には矢のような一撃を放つ由来にちなんだ鏃形の棘を立て、
    屋根の陰から覗く目と口を軒下に潜ませる。配色は第七地方
    (わすれられた祭りの跡)の、くすんだ紅色・金色の名残と古びた柱の木色。
    """
    body = C.build_skinned("yaguramori", YAGURAMORI_JOINTS, YAGURAMORI_BONES,
                           YAGURAMORI_RADII, root="root", subsurf=3)
    wood = C.make_material("yaguramori_wood", (0.34, 0.24, 0.18), roughness=0.8)
    roof = C.make_material("yaguramori_roof", (0.56, 0.20, 0.19), roughness=0.55)
    C.assign_materials_by_region(body, [wood, roof], lambda c: 1 if c.z > 0.355 else 0)

    extras = []
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"yaguramori_eye{side}", (0.058 * side, -0.100, 0.330), 0.028,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.9))
        C.assign_material(eye, C.make_material(f"yaguramori_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    mouth = C.uv_sphere("yaguramori_mouth", (0.0, -0.100, 0.280), 0.028,
                        segments=12, rings=8, scale=(0.85, 0.5, 0.7))
    C.assign_material(mouth, C.make_material("yaguramori_mouth_m", (0.30, 0.16, 0.18), roughness=0.4))
    extras.append(mouth)

    # 屋根の中心に立つ鏃形の棘。cone()はZ軸沿いにしか作れないので回転は
    # かけず、根元(半径大)を屋根の高さに置いて真上へ伸ばす
    gold = C.make_material("yaguramori_gold", (0.68, 0.55, 0.27), roughness=0.35, metallic=0.3)
    spike = C.cone("yaguramori_spike", (0.0, 0.0, 0.458), 0.055, 0.006, 0.135, segments=12)
    C.assign_material(spike, gold)
    extras.append(spike)
    for i, (angle_deg, dist) in enumerate([(40.0, 0.150), (160.0, 0.150), (280.0, 0.150)]):
        angle = math.radians(angle_deg)
        finial = C.cone(f"yaguramori_finial{i}",
                        (math.cos(angle) * dist, math.sin(angle) * dist, 0.452),
                        0.026, 0.004, 0.062, segments=8)
        C.assign_material(finial, gold)
        extras.append(finial)

    mesh = C.join([body] + extras, "yaguramori")
    armature = C.build_armature("yaguramori", YAGURAMORI_JOINTS, YAGURAMORI_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def yaguramori_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・放ち(LINEAR補間)・行き過ぎ・二次揺れ・die跳ね返りを足してある。
    doc本文はattackの放つ段(6→9)を「現行の-26°を-32°、-14°を-18°まで
    振る」と書いているが、これはタメの値をそのまま深めるだけで放つ動作
    (タメと逆方向への突き出し)にならず文脈と矛盾するため、他種族
    (nemurimogura/wasureboneなど)で同種の記述矛盾を解決した際と同じく、
    「元のピーク(upper16°/mid10°)を同じ増分だけ増幅・前倒しし、行き過ぎ
    (9→11)はdoc指定どおりupper10°/mid6°へ戻りかける」という解釈で実装した。
    """
    lower, mid, upper = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # 櫓の上でじっと見下ろす、ほとんど動かない待機。屋根(upper)が
        # 柱の途中(mid)より2フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {mid: (0, 0, 0), upper: (0, 0, 0)}),
            (40, {mid: (2, 0, 1)}),
            (42, {upper: (3, 0, 1)}, {"partial": True}),
            (80, {mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 柱そのものは歩かず、軋むように小さく揺れて進む
        ("walk", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (8, {lower: (4, 0, 3), mid: (-3, 0, -2)}),
            (16, {lower: (-4, 0, -3), mid: (3, 0, 2)}),
            (24, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # 屋根を大きく傾け、鏃の棘を狙いに合わせてから矢のように放つ。
        # タメ(1→6、現行のまま)→LINEARで鋭く放つ(6→9、元のピークを増幅・
        # 前倒し)→行き過ぎ(9→11、doc指定の値へ戻りかける)→戻り(11→20)
        ("attack", [
            (1, {upper: (0, 0, 0), mid: (0, 0, 0)}),
            (6, {upper: (-26, 0, 0), mid: (-14, 0, 0)}),
            (9, {upper: (22, 0, 0), mid: (14, 0, 0)}, {"interp": "LINEAR"}),
            (11, {upper: (10, 0, 0), mid: (6, 0, 0)}),
            (20, {upper: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。ranged種族なので振幅・戻り時間は
        # 現行どおり中程度に保つ
        ("hit", [
            (1, {mid: (0, 0, 0)}),
            (4, {mid: (14, 0, 0), upper: (10, 0, 0)}, {"interp": "LINEAR"}),
            (14, {mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 古い柱が朽ち崩れるように、大きく傾いて倒れる。初動をLINEARで
        # 鋭くし、大きく傾いたあとにわずかな跳ね返りを追加
        ("die", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (10, {lower: (20, 0, 12), mid: (14, 0, 8), upper: (10, 0, 6)}, {"interp": "LINEAR"}),
            (24, {lower: (54, 0, 30), mid: (34, 0, 20), upper: (24, 0, 14)}),
            (28, {lower: (48, 0, 26), mid: (30, 0, 17)}, {"partial": True}),
        ]),
    ]


# ================================================================= 見世物のぬし

# 第七地方(わすれられた祭りの跡)のボス。「かつての祭りでもっとも人目を
# 引いた出し物の記憶が、朽ちてなお色濃く残った姿」という由来から、
# honegarami・yamabikooniと同じ人型骨組みをボスサイズまで拡大しつつ、
# 地方の他の種族(menkaburikozoの祭り面、kazaridarumaの縁起物の帯、
# honedatamiの重ねた板)の意匠を1体に集約する。「見世物のぬしの小型版」
# であるkazaridarumaより、はるかに大きく力強い、正面から迫るシルエット。
MISEMONONONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.375),
    "chest": (0.0, 0.0, 0.630),
    "neck": (0.0, 0.0, 0.765),
    "head": (0.0, -0.015, 0.900),
    "crown": (0.0, 0.0, 1.005),
    "shoulder.L": (0.198, 0.0, 0.675),
    "elbow.L": (0.282, 0.018, 0.495),
    "hand.L": (0.292, -0.034, 0.330),
    "thigh.L": (0.113, 0.0, 0.360),
    "knee.L": (0.120, 0.0, 0.182),
    "foot.L": (0.126, -0.040, 0.025),
}
MISEMONONONUSHI_RADII_HALF = {
    "hip": 0.148, "chest": 0.162, "neck": 0.066, "head": 0.172, "crown": 0.044,
    "shoulder.L": 0.078, "elbow.L": 0.061, "hand.L": 0.070,
    "thigh.L": 0.086, "knee.L": 0.068, "foot.L": 0.073,
}
MISEMONONONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_misemonoNoNushi():
    """
    かつての祭りでもっとも人目を引いた出し物の記憶が、朽ちてなお色濃く
    残った姿。honegarami・yamabikooniと同じ人型骨組みをボスサイズまで
    拡大し、menkaburikozo譲りの祭り面、honedatami譲りの重ねた板、
    kazaridaruma譲りの金色の帯を組み合わせて、地方の主らしい存在感を
    まとわせる。配色は第七地方(わすれられた祭りの跡)の、くすんだ紅色と
    金色の名残。

    通常種の拡大版に見えないよう、逸脱項目を意図して2つ選ぶ
    (plan/models/archive/boss-silhouette-differentiation.md):
    ①通常種には無い大きな形(`design/regions.md`の意匠どおり、祭りの
    櫓そのものを右肩から生やし、頭より高く突き出させる) ②左右非対称
    (櫓は右肩だけに生え、朽ちて左へ傾いだ最上段の板と破れた幟が重心を
    崩す)。
    """
    joints = C.mirrored(MISEMONONONUSHI_HALF)
    radii = C.mirrored_radii(MISEMONONONUSHI_RADII_HALF)
    bones = C.mirrored_bones(MISEMONONONUSHI_BONES_HALF)

    body = C.build_skinned("misemonoNoNushi", joints, bones, radii, root="hip", subsurf=2)
    red = C.make_material("misemono_red", (0.52, 0.18, 0.17), roughness=0.6)
    gold = C.make_material("misemono_gold", (0.66, 0.54, 0.27), roughness=0.35, metallic=0.3)
    C.assign_materials_by_region(body, [red, gold], lambda c: 1 if (0.560 < c.z < 0.610) else 0)

    extras = []
    # menkaburikozo譲りの祭り面。ボスにふさわしく、より大きく厚みを持たせる
    mask = C.uv_sphere("misemono_mask", (0.0, -0.170, 0.905), 0.165,
                       segments=22, rings=15, scale=(1.0, 0.32, 0.94))
    C.assign_material(mask, red)
    extras.append(mask)
    rim = C.uv_sphere("misemono_rim", (0.0, -0.155, 0.905), 0.182,
                      segments=22, rings=15, scale=(1.0, 0.24, 1.0))
    C.assign_material(rim, gold)
    extras.append(rim)
    dark = C.make_material("misemono_hole", (0.04, 0.04, 0.05), roughness=0.9)
    for side in (-1.0, 1.0):
        hole = C.uv_sphere(f"misemono_hole{side}", (0.075 * side, -0.238, 0.925), 0.036,
                           segments=14, rings=10, scale=(1.0, 0.4, 0.75))
        C.assign_material(hole, dark)
        extras.append(hole)

    # honedatami譲りの重ねた板を、朽ちた衣装の名残として肩と胸に飾る
    plate = C.make_material("misemono_plate", (0.62, 0.50, 0.30), roughness=0.75)
    for side in (-1.0, 1.0):
        cape = C.box(f"misemono_cape{side}", (0.195 * side, 0.035, 0.590),
                     (0.058, 0.075, 0.145), bevel=0.010)
        C.assign_material(cape, plate)
        extras.append(cape)
    chestplate = C.box("misemono_chestplate", (0.0, -0.150, 0.640), (0.145, 0.028, 0.110), bevel=0.012)
    C.assign_material(chestplate, plate)
    extras.append(chestplate)

    # 逸脱項目①②。右肩からだけ、祭りの櫓そのものが朽ちた姿で生え、
    # 頭より高く突き出す(通常種honegarami系列にもkazaridarumaにも
    # 存在しない大形状)。最上段の板をわざと左へ傾がせ、破れた幟を
    # 垂らして、左右非対称な重心のずれを作る
    post_mat = C.make_material("misemono_yagura_post", (0.30, 0.20, 0.14), roughness=0.85)
    plank_mat = C.make_material("misemono_yagura_plank", (0.42, 0.28, 0.18), roughness=0.8)
    banner_mat = C.make_material("misemono_yagura_banner", (0.46, 0.14, 0.13), roughness=0.7)
    # shoulder.L(0.198, 0.0, 0.675)の球へ半分めり込ませ、肩から直接
    # 生えているように見せる(post_halfぶん外側へずらすだけで、
    # 肩の中心からは離しすぎない)
    yagura_x, yagura_y = 0.225, 0.010
    post_half = 0.048
    # 肩に生えた櫓ひとそろいは、関節をまたいで頭上高くまで伸びるため、
    # 自動ウェイト計算のブレンドに任せるとdieの大きな崩れで元の位置に
    # 取り残される(plan/models/archive/hard-part-bone-pinning-audit.md)。
    # 剛体の構造物として、まとめてchest-shoulder.Lへ固定する
    yagura_names = []
    for cx, cy in [
        (yagura_x - post_half, yagura_y - post_half), (yagura_x + post_half, yagura_y - post_half),
        (yagura_x - post_half, yagura_y + post_half), (yagura_x + post_half, yagura_y + post_half),
    ]:
        post = C.box(f"misemono_yagura_post{cx}_{cy}", (cx, cy, 0.980), (0.018, 0.018, 0.760),
                     bevel=0.006)
        C.assign_material(post, post_mat)
        C.mark_for_pin(post)
        yagura_names.append(post.name)
        extras.append(post)
    for i, pz in enumerate((0.760, 1.020)):
        plank = C.box(f"misemono_yagura_plank{i}", (yagura_x, yagura_y, pz), (0.135, 0.135, 0.026),
                      bevel=0.010)
        C.assign_material(plank, plank_mat)
        C.mark_for_pin(plank)
        yagura_names.append(plank.name)
        extras.append(plank)
    # 最上段だけ朽ちて左へ傾いだ板(原点で作ってから回転し、あとで移動する)
    top_plank = C.box("misemono_yagura_topplank", (0.0, 0.0, 0.0), (0.150, 0.150, 0.024),
                      bevel=0.010)
    top_plank.data.transform(Matrix.Rotation(math.radians(18), 4, "Y"))
    for vert in top_plank.data.vertices:
        vert.co.x += yagura_x
        vert.co.y += yagura_y
        vert.co.z += 1.300
    C.assign_material(top_plank, plank_mat)
    C.mark_for_pin(top_plank)
    yagura_names.append(top_plank.name)
    extras.append(top_plank)
    # 破れた幟。最上段からだらりと垂れる、色あせた紅色の帯
    banner = C.box("misemono_yagura_banner", (yagura_x + 0.140, yagura_y, 1.140),
                   (0.004, 0.060, 0.150), bevel=0.004)
    C.assign_material(banner, banner_mat)
    C.mark_for_pin(banner)
    yagura_names.append(banner.name)
    extras.append(banner)

    mesh = C.join([body] + extras, "misemonoNoNushi")
    armature = C.build_armature("misemonoNoNushi", joints, bones, mesh, root="hip")
    for group_name in yagura_names:
        C.pin_weight_to_bone(mesh, group_name, "chest-shoulder.L")
    return [mesh, armature], armature


def misemonoNoNushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・頭の遅れ追従(二次揺れ)・歩行の接地沈み・
    死亡時の跳ね返りを足してある。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 誰もいない会場の中央に居座り続ける、堂々とした待機。頭(neck)が
        # 胴(hipc)より2フレーム遅れて追従する二次揺れ
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10), neck: (0, 0, 0)}),
            (28, {hipc: (3, 0, 2), armL: (-6, 0, 14), armR: (-6, 0, -14)}),
            (30, {neck: (-4, 0, 0)}, {"partial": True}),
            (56, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (58, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 脚が正中に戻る接地の瞬間に胴をわずかに沈める(地方ボスの重さ)
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                 armL: (-14, 0, 8), armR: (14, 0, -8)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8),
                  hipc: {"loc": (0, -0.010, 0)}}),
            (19, {legL: (-18, 0, 0), legR: (18, 0, 0), shinL: (6, 0, 0), shinR: (-8, 0, 0),
                  armL: (14, 0, 8), armR: (-14, 0, -8)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8),
                  hipc: {"loc": (0, -0.010, 0)}}),
        ]),
        # かつて客を呼び込んだ両腕を大きく広げてから(タメ)、LINEARで
        # 力強く叩きつける
        ("attack", [
            (1, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (8, {armR: (-140, 0, -26), foreR: (-36, 0, 0), armL: (-44, 0, 34), foreL: (-12, 0, 0),
                 hipc: (-12, 0, -16), neck: (-6, 0, 0)}, {"interp": "LINEAR"}),
            (14, {armR: (76, 0, 18), foreR: (12, 0, 0), armL: (32, 0, -6), foreL: (0, 0, 0),
                  hipc: (20, 0, 18), neck: (-10, 0, 0)}),
            (26, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。ボス格の高い防御どおり振幅・戻り時間は
        # 現行のまま
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (5, {hipc: (-12, 0, 0), neck: (-12, 0, 0), armL: (-16, 0, 18), armR: (-16, 0, -18)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # かつての存在感ごと、LINEARで鋭く崩れ始めてから大きく傾いて倒れる。
        # 30f到達後、胴と頭がほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (12, {hipc: (-14, 0, 6), neck: (-20, 0, 0), armL: (-34, 0, 34), armR: (-34, 0, -34)}),
            (30, {hipc: (-86, 0, 18), neck: (-38, 0, 0), legL: (52, 0, 0), legR: (46, 0, 0),
                  armL: (-76, 0, 52), armR: (-76, 0, -52)}),
            (34, {hipc: (-79, 0, 16), neck: (-34, 0, 0)}, {"partial": True}),
        ]),
    ]


# ================================================================= ゆめまよいの影

# 主を見失った夢。madoromiと同じ関節構成(root/stem/capbase/captop)を
# ベースにするが、mimic AI(タルに擬態し、持ち上げる/投げるまで見分けが
# つかない)に合わせ、madoromiの「歩くきのこ」らしい表情豊かな造形とは
# 逆に、目立つ特徴を抑えた寸胴なシルエットにする。傘は開ききらせず
# フードのように深く被らせ、顔を大きく覆い隠す。
YUMEMAYOINOKAGE_JOINTS = {
    "root": (0.0, 0.0, 0.05),
    "stem": (0.0, 0.0, 0.20),
    "capbase": (0.0, 0.0, 0.315),
    "captop": (0.0, 0.0, 0.400),
}
YUMEMAYOINOKAGE_RADII = {"root": 0.135, "stem": 0.130, "capbase": 0.215, "captop": 0.075}
YUMEMAYOINOKAGE_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_yumemayoinokage():
    """
    主を見失った夢。madoromiと同じ関節構成をベースに、タルに擬態する
    mimic AIらしく寸胴で目立たないシルエットに作り替え、傘をフードの
    ように深く被らせて顔を覆い隠す。配色は第八地方(めざめの前庭)の
    テーマに合わせ、第一〜第七地方の色が淡く混ざり合った、統一感のない
    燻んだ配色にする。
    """
    body = C.build_skinned("yumemayoinokage", YUMEMAYOINOKAGE_JOINTS, YUMEMAYOINOKAGE_BONES,
                           YUMEMAYOINOKAGE_RADII, root="root", subsurf=2)
    husk = C.make_material("yumemayoi_husk", (0.42, 0.40, 0.44), roughness=0.75)
    hood = C.make_material("yumemayoi_hood", (0.34, 0.32, 0.40), roughness=0.7)
    C.assign_materials_by_region(body, [husk, hood], lambda c: 1 if c.z > 0.300 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # フードの陰に半分沈んだ、眠たげで生気の薄い目
        eye = C.uv_sphere(f"yumemayoi_eye{side}", (0.055 * side, -0.170, 0.235), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.55, 0.6))
        C.assign_material(eye, C.make_material(f"yumemayoi_eye{side}_m", (0.62, 0.60, 0.68),
                                               roughness=0.4))
        extras.append(eye)
    mouth = C.uv_sphere("yumemayoi_mouth", (0.0, -0.175, 0.185), 0.022,
                        segments=12, rings=8, scale=(0.85, 0.5, 0.7))
    C.assign_material(mouth, C.make_material("yumemayoi_mouth_m", (0.20, 0.18, 0.22), roughness=0.5))
    extras.append(mouth)

    # 各地方の記憶の名残として、傘に淡い色の欠片を6つ散らす
    fragments = [
        (0.62, 0.85, 0.62, "purun"), (0.42, 0.30, 0.24, "gajiri"),
        (0.55, 0.62, 0.42, "tsubute"), (0.68, 0.44, 0.56, "madoromi"),
        (0.32, 0.58, 0.66, "kirimizuchi"), (0.60, 0.48, 0.34, "kodama"),
    ]
    for i, (angle_deg, dist, r, (fr, fg, fb, _label)) in enumerate(
        zip([20.0, 90.0, 150.0, 210.0, 270.0, 330.0], [0.16] * 6, [0.026] * 6, fragments)
    ):
        angle = math.radians(angle_deg)
        frag = C.uv_sphere(f"yumemayoi_frag{i}", (math.cos(angle) * dist, math.sin(angle) * dist, 0.315),
                           r, segments=10, rings=8, scale=(1.0, 1.0, 0.4))
        C.assign_material(frag, C.make_material(f"yumemayoi_frag{i}_m", (fr * 0.75, fg * 0.75, fb * 0.75),
                                                roughness=0.6))
        extras.append(frag)

    # 化けているタルの箍(たが)の欠片。正体を見破られた後も残る
    # (plan/models/archive/sheet-yumemayoinokage.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る、面取りした円柱
    hoop_mat = C.make_material("yumemayoi_hoop", (0.44, 0.34, 0.22), roughness=0.7)
    hoop = C.cylinder("yumemayoi_hoop", (0.0, 0.0, 0.075), 0.140, 0.026,
                      segments=24, bevel=0.008)
    C.assign_material(hoop, hoop_mat)
    extras.append(hoop)

    mesh = C.join([body] + extras, "yumemayoinokage")
    armature = C.build_armature("yumemayoinokage", YUMEMAYOINOKAGE_JOINTS, YUMEMAYOINOKAGE_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def yumemayoinokage_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・行き過ぎを足してある。idleは「タルに擬態
    してほとんど動かない」という最大の特徴を崩さないよう二次揺れを見送り、
    walkは脚を持たず回転だけで転がりを表現する設計のためfootfall-dipを
    見送った(doc記載どおり、どちらも意図的な対象外)。dieも「輪郭を
    保てず崩れて消える」表現のため跳ね返りは追加していない。
    doc本文はattackのツメ段(6→9)を「upperを現行の-24から-30まで深く
    振り込む」と書いているが、これはタメの値をそのまま深めるだけで
    ツメ(タメと逆方向への振り)にならず文脈と矛盾するため、他種族
    (nemurimogura/wasureboneなど)で同種の記述矛盾を解決した際と同じく、
    「元のピーク(upper14°/mid10°)を同じ増分だけ増幅・前倒しし、
    行き過ぎ(9→11)はdoc指定どおり元のピーク値へ戻す」という解釈で
    実装した。
    """
    lower, mid, upper = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # タルのふりをして、ほとんど動かずじっと潜む(擬態の性格づけを
        # 崩さないよう二次揺れは見送り、現行の単振動を維持)
        ("idle", [
            (1, {mid: (0, 0, 0)}),
            (48, {mid: (1.5, 0, 1)}),
            (96, {mid: (0, 0, 0)}),
        ]),
        # タルらしからぬ、正体を現したときのぎこちない転がるような足取り
        # (脚を持たず回転だけで表現する設計のため、footfall-dipは見送り)
        ("walk", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (7, {lower: (10, 0, 6), mid: (-8, 0, -4)}),
            (14, {lower: (-10, 0, -6), mid: (8, 0, 4)}),
            (21, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # タメ(1→6、現行のまま)→LINEARで鋭く振り込むツメ(6→9、元の
        # ピークを増幅・前倒し)→行き過ぎ(9→11、元のピーク値へ戻す)→
        # 戻り(11→20)の4段に分ける
        ("attack", [
            (1, {upper: (0, 0, 0), mid: (0, 0, 0)}),
            (6, {upper: (-24, 0, 0), mid: (-16, 0, 0)}),
            (9, {upper: (20, 0, 0), mid: (14, 0, 0)}, {"interp": "LINEAR"}),
            (11, {upper: (14, 0, 0), mid: (10, 0, 0)}),
            (20, {upper: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。振幅は現行維持
        ("hit", [
            (1, {mid: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {mid: (12, 0, 0), upper: (8, 0, 0)}),
            (14, {mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 見失った夢そのものが、輪郭を保てず崩れて消える。崩れ始め
        # (1→10)の初動だけをLINEARで鋭くする
        ("die", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {lower: (16, 0, 10), mid: (12, 0, 8), upper: (10, 0, 6)}),
            (24, {lower: (44, 0, 26), mid: (30, 0, 20), upper: (24, 0, 16)}),
        ]),
    ]


# ================================================================= ヨリシロの残響

# ヨリシロ自身の記憶そのもの。honegarami・yamabikooni・misemonoNoNushiと
# 同じ人型骨組みをベースに、物語終盤にふさわしい、これまでで最も大きく
# 力強いシルエットにする。第八地方(めざめの前庭)のテーマ「第一〜第七
# 地方の色が淡く混ざり合った、統一感のない配色」を、高さで5段に区切った
# 色帯(各地方の代表色を淡くしたもの)で表現し、胸には全ての記憶が
# 集まる核として発光する紋章を持たせる。
YORISHIRONOZANKYO_HALF = {
    "hip": (0.0, 0.0, 0.390),
    "chest": (0.0, 0.0, 0.655),
    "neck": (0.0, 0.0, 0.795),
    "head": (0.0, -0.016, 0.935),
    "crown": (0.0, 0.0, 1.045),
    "shoulder.L": (0.205, 0.0, 0.700),
    "elbow.L": (0.292, 0.019, 0.510),
    "hand.L": (0.302, -0.036, 0.340),
    "thigh.L": (0.118, 0.0, 0.375),
    "knee.L": (0.126, 0.0, 0.190),
    "foot.L": (0.132, -0.041, 0.026),
}
YORISHIRONOZANKYO_RADII_HALF = {
    "hip": 0.152, "chest": 0.168, "neck": 0.070, "head": 0.178, "crown": 0.046,
    "shoulder.L": 0.082, "elbow.L": 0.064, "hand.L": 0.074,
    "thigh.L": 0.090, "knee.L": 0.072, "foot.L": 0.077,
}
YORISHIRONOZANKYO_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_yorishironozankyo():
    """
    ヨリシロ自身の記憶そのもの。出現率は極めて低いが、他のどの種族より
    HP・攻撃・防御が高い。honegarami・yamabikooni・misemonoNoNushiと
    同じ人型骨組みを、これまでで最も大きく育てる。配色は高さで5段に
    区切った色帯で、第一〜第七地方の代表色を淡く混ぜ合わせて表現し、
    統一感のない、記憶が幾重にも重なった見た目にする。胸には全ての
    記憶が集まる核として発光する紋章を持たせる。
    """
    joints = C.mirrored(YORISHIRONOZANKYO_HALF)
    radii = C.mirrored_radii(YORISHIRONOZANKYO_RADII_HALF)
    bones = C.mirrored_bones(YORISHIRONOZANKYO_BONES_HALF)

    body = C.build_skinned("yorishironozankyo", joints, bones, radii, root="hip", subsurf=2)
    bands = [
        C.make_material("zankyo_band0", (0.44, 0.40, 0.46), roughness=0.7),   # 記憶の底(灰紫)
        C.make_material("zankyo_band1", (0.36, 0.52, 0.56), roughness=0.65),  # 忘れ潮の湿地(水色)
        C.make_material("zankyo_band2", (0.46, 0.56, 0.40), roughness=0.65),  # まどろみの茸林(緑)
        C.make_material("zankyo_band3", (0.56, 0.42, 0.46), roughness=0.65),  # なみだの滝つぼ(紅紫)
        C.make_material("zankyo_band4", (0.58, 0.50, 0.34), roughness=0.6),   # こだまの尾根・祭りの跡(土金)
    ]

    def classify(c):
        t = max(0.0, min(1.0, c.z / 1.045))
        return min(4, int(t * 5))

    C.assign_materials_by_region(body, bands, classify)

    extras = []
    glow = C.make_material("zankyo_eye", (0.85, 0.90, 0.96), roughness=0.25, emission=1.8)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"zankyo_eye{side}", (0.070 * side, -0.155, 0.945), 0.028,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.8))
        C.assign_material(eye, glow)
        extras.append(eye)

    # 胸に、全ての記憶が集まる核として発光する紋章を持たせる。輪は
    # 面取りした硬い円盤にする(plan/models/archive/sheet-yorishironozankyo.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 丸い体表面に唯一の角のある面を作る
    core_ring = C.cylinder("zankyo_core_ring", (0.0, -0.155, 0.660), 0.075, 0.038,
                           segments=24, axis="Y", bevel=0.011)
    C.assign_material(core_ring, C.make_material("zankyo_core_ring_m", (0.72, 0.66, 0.50),
                                                 roughness=0.4, metallic=0.2))
    extras.append(core_ring)
    core = C.uv_sphere("zankyo_core", (0.0, -0.170, 0.660), 0.048,
                       segments=16, rings=12, scale=(1.0, 0.28, 1.0))
    C.assign_material(core, C.make_material("zankyo_core_m", (0.90, 0.86, 0.72),
                                            roughness=0.25, emission=2.4))
    extras.append(core)

    mesh = C.join([body] + extras, "yorishironozankyo")
    armature = C.build_armature("yorishironozankyo", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def yorishironozankyo_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    honegarami/yamabikooniの打ち直し内容(タメ・ツメ・行き過ぎ・二次揺れ・
    footfall-dip・die跳ね返り)を移植した。「物語終盤にふさわしい、
    これまでで最も大きく力強い」設定と、既存hit振幅の「静かな重厚さ」を
    壊さないよう、フレーム間隔はyamabikooniよりやや長めに保っている。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 記憶そのものとして、静かに、しかし途方もない存在感で佇む。頭
        # (neck)が胴(hipc)より3フレーム遅れて追従する二次揺れを追加
        # (体格が大きい分、honegaramiの2フレームよりわずかに長く)
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (30, {hipc: (2, 0, 2), armL: (-5, 0, 13), armR: (-5, 0, -13)}),
            (33, {neck: (-3, 0, 0)}, {"partial": True}),
            (60, {hipc: (0, 0, 0), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (63, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 接地の瞬間に胴をわずかに沈める。「静かに佇む」性格づけを尊重し、
        # yamabikooniより深く沈めすぎない控えめな値に留める
        ("walk", [
            (1, {legL: (18, 0, 0), legR: (-18, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                 armL: (-14, 0, 8), armR: (14, 0, -8)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8),
                  hipc: {"loc": (0, -0.010, 0)}}),
            (19, {legL: (-18, 0, 0), legR: (18, 0, 0), shinL: (6, 0, 0), shinR: (-8, 0, 0),
                  armL: (14, 0, 8), armR: (-14, 0, -8)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 8), armR: (0, 0, -8),
                  hipc: {"loc": (0, -0.010, 0)}}),
        ]),
        # 物語終盤にふさわしい、両腕を大きく振りかぶる圧倒的な一撃。タメ
        # (1→8)→LINEARで鋭いツメ(8→15、honegaramiより1フレーム長く取り
        # 体格差を出す)→行き過ぎ(15→18、弱めて収まる)→戻り(18→30、
        # ゆったりと)の4段に分ける
        ("attack", [
            (1, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (8, {armR: (-145, 0, -28), foreR: (-38, 0, 0), armL: (-46, 0, 36), foreL: (-13, 0, 0),
                 hipc: (-13, 0, -17), neck: (-6, 0, 0)}, {"interp": "LINEAR"}),
            (15, {armR: (88, 0, 21), foreR: (14, 0, 0), armL: (37, 0, -8), foreL: (0, 0, 0),
                  hipc: (23, 0, 21), neck: (-12, 0, 0)}),
            (18, {armR: (76, 0, 18), foreR: (12, 0, 0), armL: (32, 0, -7), foreL: (0, 0, 0),
                  hipc: (20, 0, 18), neck: (-10, 0, 0)}),
            (30, {armR: (0, 0, -10), foreR: (0, 0, 0), armL: (0, 0, 10), foreL: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。振幅はこのゲーム内で最も抑えた現行の
        # ままで、意図通りの「静かな重厚さ」を保つ
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (5, {hipc: (-11, 0, 0), neck: (-11, 0, 0), armL: (-15, 0, 17), armR: (-15, 0, -17)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 記憶が薄れるように、大きく傾いて崩れ落ちる。初動をLINEARで
        # 鋭くし、崩れ落ちた後に一度だけ小さく跳ね返る
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (13, {hipc: (-15, 0, 6), neck: (-21, 0, 0), armL: (-35, 0, 35), armR: (-35, 0, -35)}),
            (32, {hipc: (-88, 0, 19), neck: (-40, 0, 0), legL: (54, 0, 0), legR: (48, 0, 0),
                  armL: (-78, 0, 54), armR: (-78, 0, -54)}),
            (36, {hipc: (-82, 0, 18), neck: (-36, 0, 0), legL: (50, 0, 0), legR: (44, 0, 0),
                  armL: (-72, 0, 49), armR: (-72, 0, -49)}),
        ]),
    ]


# ======================================================================= 淵の主

# 第五地方(なみだの滝つぼ)のボス。honegarami・yamabikooniと同じ人型
# 骨組みをベースに、「滝つぼの一番深いところに沈んだ、もっとも重い
# 悲しみが凝った姿」という由来から、yamabikooniの力強い直立ではなく、
# nedayamabikoと同じ低い重心・前傾した姿勢にする(悲しみの重さで
# うつむいているような佇まい)。配色は涙と滝つぼを思わせる沈んだ
# 青・藍色系。肩や顎から涙のしずくが垂れ下がる。
FUCHINONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.310),
    "chest": (0.0, 0.025, 0.520),
    "neck": (0.0, 0.038, 0.615),
    "head": (0.0, 0.014, 0.725),
    "crown": (0.0, 0.026, 0.815),
    "shoulder.L": (0.192, 0.025, 0.545),
    "elbow.L": (0.266, 0.055, 0.395),
    "hand.L": (0.260, 0.020, 0.245),
    "thigh.L": (0.113, 0.0, 0.298),
    "knee.L": (0.120, 0.0, 0.150),
    "foot.L": (0.126, -0.040, 0.020),
}
FUCHINONUSHI_RADII_HALF = {
    "hip": 0.133, "chest": 0.146, "neck": 0.059, "head": 0.153, "crown": 0.041,
    "shoulder.L": 0.071, "elbow.L": 0.057, "hand.L": 0.065,
    "thigh.L": 0.079, "knee.L": 0.064, "foot.L": 0.069,
}
FUCHINONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_fuchiNoNushi():
    """
    滝つぼの一番深いところに沈んだ、この地方でもっとも重い悲しみが
    凝った姿。honegarami・yamabikooniと同じ人型骨組みをベースに、
    悲しみの重さでうつむいているような、低い重心の前傾姿勢にする。
    配色は涙と滝つぼを思わせる沈んだ青・藍色系。肩や顎から涙の
    しずくが垂れ下がる。

    通常種の拡大版に見えないよう、逸脱項目を意図して3つ選ぶ
    (plan/models/archive/boss-silhouette-differentiation.md):
    ①非対称(藻は右肩からしか垂れない) ②ネガティブスペース
    (胸の片側だけに水を湛えた淵そのものをくぼみとして持つ)
    ③通常種には無い大きな形(水底の藻・水を湛えた淵)。
    """
    joints = C.mirrored(FUCHINONUSHI_HALF)
    radii = C.mirrored_radii(FUCHINONUSHI_RADII_HALF)
    bones = C.mirrored_bones(FUCHINONUSHI_BONES_HALF)

    body = C.build_skinned("fuchiNoNushi", joints, bones, radii, root="hip", subsurf=2)
    deep = C.make_material("fuchi_deep", (0.16, 0.20, 0.38), roughness=0.55)
    indigo = C.make_material("fuchi_indigo", (0.24, 0.30, 0.48), roughness=0.5)
    C.assign_materials_by_region(body, [deep, indigo], lambda c: 1 if c.z > 0.470 else 0)

    extras = []
    glow = C.make_material("fuchi_eye", (0.55, 0.75, 0.92), roughness=0.25, emission=1.6)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"fuchi_eye{side}", (0.062 * side, -0.148, 0.735), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.75))
        C.assign_material(eye, glow)
        extras.append(eye)

    # 涙のしずく。肩と顎から垂れ下がる、半透明感のある青いしずく形
    tear_mat = C.make_material("fuchi_tear", (0.42, 0.62, 0.82), roughness=0.2, emission=0.4)
    tear_specs = [
        (0.0, -0.155, 0.655, 0.026),
        (0.205 * -1.0, 0.03, 0.500, 0.020),
        (0.205 * 1.0, 0.03, 0.500, 0.020),
    ]
    for i, (tx, ty, tz, tr) in enumerate(tear_specs):
        tear = C.uv_sphere(f"fuchi_tear{i}", (tx, ty, tz), tr, segments=12, rings=10,
                           scale=(0.8, 0.8, 1.6))
        C.assign_material(tear, tear_mat)
        extras.append(tear)

    # 淵の底に沈んだまま離れない、角のある大きな重石(plan/models/
    # sheet-fuchiNoNushi.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る、正二十面体そのままの結晶を背に半分めり込ませる
    weight_mat = C.make_material("fuchi_weight", (0.20, 0.22, 0.26), roughness=0.85)
    weight = C.gem("fuchi_weight", (0.0, 0.115, 0.360), 0.098, subdivisions=1,
                   scale=(1.1, 0.9, 1.0))
    C.assign_material(weight, weight_mat)
    extras.append(weight)

    # 淵の主だけの逸脱項目(plan/models/archive/
    # boss-silhouette-differentiation.md): ①非対称 ②ネガティブスペース
    # ③通常種には無い大きな形。honegarami系列の通常種には無い、この
    # 地方の名そのものを体現する2つの意匠を、あえて左右非対称に配する
    basin_rim_mat = C.make_material("fuchi_basin_rim", (0.24, 0.24, 0.28), roughness=0.8)
    basin_water_mat = C.make_material("fuchi_basin_water", (0.09, 0.20, 0.32), roughness=0.15,
                                      emission=0.18)
    # 片側の胸元だけに、悲しみの涙を湛えた小さな淵そのものをくぼみとして
    # 抱える(ネガティブスペース)。石の縁の内側に昏い水面を沈める
    basin_center = (0.060, -0.110, 0.530)
    rim = C.cylinder("fuchi_basin_rim", basin_center, 0.076, 0.022, segments=20, axis="Y")
    C.assign_material(rim, basin_rim_mat)
    extras.append(rim)
    water = C.cylinder("fuchi_basin_water",
                       (basin_center[0], basin_center[1] - 0.011, basin_center[2]),
                       0.058, 0.012, segments=20, axis="Y")
    C.assign_material(water, basin_water_mat)
    extras.append(water)

    # 肩からだけ長く垂れ下がる、水底の藻(通常種honegarami系列には
    # 存在しない大形状)。左右非対称の重心も同時に作る
    kelp_mat = C.make_material("fuchi_kelp", (0.14, 0.26, 0.22), roughness=0.6)
    kelp_specs = [
        (0.270, 0.045, 0.470, 0.036, 0.024, 0.145),
        (0.300, 0.055, 0.345, 0.024, 0.014, 0.135),
        (0.318, 0.062, 0.230, 0.014, 0.004, 0.110),
    ]
    kelp_names = []
    for i, (kx, ky, kz, rb, rt, depth) in enumerate(kelp_specs):
        kelp = C.cone(f"fuchi_kelp{i}", (kx, ky, kz), rb, rt, depth, segments=10)
        C.assign_material(kelp, kelp_mat)
        # 肩をまたいで垂れ下がるため、自動ウェイト計算のブレンドに任せると
        # dieの大きな崩れで元の位置に取り残される(plan/models/archive/
        # hard-part-bone-pinning-audit.md)。一番近い骨(chest-shoulder.L)
        # へ剛体固定する
        C.mark_for_pin(kelp)
        kelp_names.append(kelp.name)
        extras.append(kelp)

    mesh = C.join([body] + extras, "fuchiNoNushi")
    armature = C.build_armature("fuchiNoNushi", joints, bones, mesh, root="hip")
    for group_name in kelp_names:
        C.pin_weight_to_bone(mesh, group_name, "chest-shoulder.L")
    return [mesh, armature], armature


def fuchiNoNushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    attackにツメのLINEAR+行き過ぎ段、hitの入りにLINEAR、idleでneckが
    hipcより2フレーム遅れる二次揺れ、walkに接地沈み、dieの初動LINEAR+
    着地の跳ね返りを足した。中堅ボスの重さを保ったまま緩急を付ける。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 悲しみの重さでうつむいたまま、動じることなく淵の底に居座る。
        # neckはhipcより2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (36, {hipc: (2, 0, 1)}),
            (38, {neck: (2, 0, 0)}, {"partial": True}),
            (72, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 脚が正中に戻る瞬間、巨体が沈み込む重さを接地沈みで出す
        ("walk", [
            (1, {legL: (16, 0, 0), legR: (-16, 0, 0), shinL: (-7, 0, 0), shinR: (5, 0, 0),
                 armL: (-12, 0, 6), armR: (12, 0, -6)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.010, 0)}}),
            (21, {legL: (-16, 0, 0), legR: (16, 0, 0), shinL: (5, 0, 0), shinR: (-7, 0, 0),
                  armL: (12, 0, 6), armR: (-12, 0, -6)}),
            (31, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.010, 0)}}),
        ]),
        # タメ(引く)→ツメ(LINEARで鋭く振り下ろす)→行き過ぎ→戻り。
        # 淵の水を巻き込む重さを出すため、hipcの踏み込みもLINEARに揃える
        ("attack", [
            (1, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (8, {armR: (-120, 0, -22), foreR: (-32, 0, 0), armL: (-38, 0, 28), foreL: (-10, 0, 0),
                 hipc: (-10, 0, -14), neck: (-6, 0, 0)}),
            (14, {armR: (66, 0, 14), foreR: (10, 0, 0), armL: (26, 0, -4), foreL: (0, 0, 0),
                  hipc: (16, 0, 14), neck: (-8, 0, 0)}, {"interp": "LINEAR"}),
            (16, {armR: (70, 0, 16), foreR: (12, 0, 0), armL: (28, 0, -6), foreL: (0, 0, 0),
                  hipc: (18, 0, 14), neck: (-8, 0, 0)}),
            (25, {armR: (0, 0, -8), foreR: (0, 0, 0), armL: (0, 0, 8), foreL: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        # 入り(1f→5f)にLINEARを足す。振幅・戻り(16f)は現行どおり
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (5, {hipc: (-10, 0, 0), neck: (-10, 0, 0), armL: (-14, 0, 16), armR: (-14, 0, -16)}),
            (16, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 初動にLINEARを足して鋭い頽れにし、28f到達後に小さな
        # 跳ね返り(hipc/neckをわずかに揺り戻す)を1回追加する
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (11, {hipc: (-12, 0, 5), neck: (-18, 0, 0), armL: (-30, 0, 30), armR: (-30, 0, -30)}),
            (28, {hipc: (-78, 0, 16), neck: (-34, 0, 0), legL: (46, 0, 0), legR: (40, 0, 0),
                  armL: (-68, 0, 46), armR: (-68, 0, -46)}),
            (32, {hipc: (-72, 0, 15), neck: (-30, 0, 0)}),
        ]),
    ]


# =================================================================== しずくうお

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにするが、四足の蛙ではなく「こぼれ落ちる涙のしずくそのもの」を
# 表す魚にする。armF/handFを小さな胸びれ、kneeB/ankleB/footBを後方へ
# 伸ばして尾びれにし、headを先細りの水滴の先端にする。
SHIZUKUUO_HALF = {
    "hip": (0.0, 0.130, 0.118),
    "chest": (0.0, -0.028, 0.132),
    "head": (0.0, -0.205, 0.112),
    "armF.L": (0.086, -0.092, 0.078),
    "handF.L": (0.128, -0.110, 0.050),
    "kneeB.L": (0.070, 0.160, 0.108),
    "ankleB.L": (0.092, 0.215, 0.078),
    "footB.L": (0.098, 0.260, 0.048),
}
SHIZUKUUO_RADII_HALF = {
    "hip": 0.118, "chest": 0.128, "head": 0.068,
    "armF.L": 0.020, "handF.L": 0.024,
    "kneeB.L": 0.026, "ankleB.L": 0.019, "footB.L": 0.022,
}
SHIZUKUUO_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_shizukuuo():
    """
    こぼれ落ちる涙のしずくそのもの。tsubuteと同じ関節構成をベースに、
    四足の蛙ではなく水滴形の魚に作り替える。頭を先細りの水滴の先端に、
    腕を小さな胸びれ、後ろ足を尾びれにする。群れ配置(swarm AI)に
    合わせ、単体は簡略化した小さなシルエットにとどめる。配色は
    第五地方(なみだの滝つぼ)の、涙と滝つぼを思わせる沈んだ青・藍色系。
    """
    joints = C.mirrored(SHIZUKUUO_HALF)
    radii = C.mirrored_radii(SHIZUKUUO_RADII_HALF)
    bones = C.mirrored_bones(SHIZUKUUO_BONES_HALF)

    body = C.build_skinned("shizukuuo", joints, bones, radii, root="chest", subsurf=2)
    deep = C.make_material("shizuku_deep", (0.20, 0.30, 0.52), roughness=0.25)
    C.assign_material(body, deep)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"shizuku_eye{side}", (0.052 * side, -0.222, 0.128), 0.028,
                          look=(0.25 * side, -1.0, 0.05),
                          white=(0.80, 0.86, 0.94), dark=(0.10, 0.12, 0.20))

    # 尾の先が結晶化した、角のある小さな氷状の雫(plan/models/
    # sheet-shizukuuo.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。common.gem
    # (正二十面体)そのままで硬い面を作る
    crystal_mat = C.make_material("shizuku_crystal", (0.72, 0.86, 0.96), roughness=0.2,
                                  emission=0.3)
    for side in (-1.0, 1.0):
        fx, fy, fz = SHIZUKUUO_HALF["footB.L"]
        crystal = C.gem(f"shizuku_crystal{side}", (fx * side, fy, fz), 0.020, subdivisions=1)
        C.assign_material(crystal, crystal_mat)
        extras.append(crystal)

    mesh = C.join([body] + extras, "shizukuuo")
    armature = C.build_armature("shizukuuo", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def shizukuuo_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・尾びれの先端の遅れ追従(二次揺れ)を足してある。
    """
    head = "chest-head"
    finL, finR = "chest-armF.L", "chest-armF.R"
    tailL, tailR = "hip-kneeB.L", "hip-kneeB.R"
    shinL, shinR = "kneeB.L-ankleB.L", "kneeB.R-ankleB.R"
    return [
        # 水中を漂うように、ゆっくり揺れる。尾びれの先端(shinL,R)が
        # 尾びれの根元(tailL,R)より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), tailL: (0, 0, 6), tailR: (0, 0, -6),
                 shinL: (0, 0, 6), shinR: (0, 0, -6)}),
            (24, {head: (3, 0, 0), tailL: (0, 0, -6), tailR: (0, 0, 6)}),
            (26, {shinL: (0, 0, -6), shinR: (0, 0, 6)}, {"partial": True}),
            (48, {head: (0, 0, 0), tailL: (0, 0, 6), tailR: (0, 0, -6)}),
            (50, {shinL: (0, 0, 6), shinR: (0, 0, -6)}, {"partial": True}),
        ]),
        # 尾びれを大きくくねらせて泳ぐ
        ("walk", [
            (1, {tailL: (0, 0, 20), tailR: (0, 0, -20), shinL: (0, 0, 14), shinR: (0, 0, -14),
                 finL: (0, 0, 10), finR: (0, 0, -10), head: (0, 0, 6)}),
            (6, {tailL: (0, 0, -20), tailR: (0, 0, 20), shinL: (0, 0, -14), shinR: (0, 0, 14),
                 finL: (0, 0, -10), finR: (0, 0, 10), head: (0, 0, -6)}),
            (12, {tailL: (0, 0, 20), tailR: (0, 0, -20), shinL: (0, 0, 14), shinR: (0, 0, -14),
                  finL: (0, 0, 10), finR: (0, 0, -10), head: (0, 0, 6)}),
        ]),
        # タメ→LINEARで鋭く突進→水を弾いた反動で戻りかける→ゆっくり中立へ
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (-20, 0, 0), tailL: (0, 0, 24), tailR: (0, 0, -24)}, {"interp": "LINEAR"}),
            (6, {head: (-26, 0, 0), tailL: (0, 0, 30), tailR: (0, 0, -30)}),
            (9, {head: (14, 0, 0), tailL: (0, 0, -18), tailR: (0, 0, 18)}),
            (16, {head: (0, 0, 0), tailL: (0, 0, 6), tailR: (0, 0, -6)}),
        ]),
        # 入りだけLINEARで鋭くする。swarm個体らしく振幅は現行どおり
        # 中程度、戻りはゆっくりのまま
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (16, 0, 0), finL: (-14, 0, 10), finR: (-14, 0, -10)}),
            (12, {head: (0, 0, 0)}),
        ]),
        # しずくが弾けるように、LINEARで鋭く輪郭を丸く潰しながら消える。
        # 18f到達後、尾びれがほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (8, {head: (0, 0, 0), tailL: (0, 0, -30), tailR: (0, 0, 30)}),
            (18, {head: (0, 0, 0), tailL: (0, 0, -60), tailR: (0, 0, 60)}),
            (22, {tailL: (0, 0, -54), tailR: (0, 0, 54)}, {"partial": True}),
        ]),
    ]


# ===================================================================== うるみぐま

# honegaramiと同じ人型骨組みをベースにするが、「ふさぎ込んだ古い悲しみ」
# (guard AI、動かず攻撃を受けなければ癒える)という由来から、
# nedayamabikoと同じ低い重心・前傾した姿勢に、熊らしい丸い耳と
# 厚みのある体格を組み合わせる。fuchiNoNushiとは違い、甲羅ではなく
# 熊そのものの体つきで「悲しみに沈んで丸くなった」様子を表す。
URUMIGUMA_HALF = {
    "hip": (0.0, 0.0, 0.185),
    "chest": (0.0, 0.022, 0.320),
    "neck": (0.0, 0.032, 0.392),
    "head": (0.0, 0.008, 0.455),
    "crown": (0.0, 0.018, 0.508),
    "shoulder.L": (0.178, 0.022, 0.335),
    "elbow.L": (0.208, 0.042, 0.222),
    "hand.L": (0.188, 0.012, 0.112),
    "thigh.L": (0.116, 0.0, 0.170),
    "knee.L": (0.121, 0.0, 0.080),
    "foot.L": (0.116, -0.045, 0.018),
}
URUMIGUMA_RADII_HALF = {
    "hip": 0.136, "chest": 0.150, "neck": 0.063, "head": 0.130, "crown": 0.038,
    "shoulder.L": 0.073, "elbow.L": 0.059, "hand.L": 0.063,
    "thigh.L": 0.083, "knee.L": 0.067, "foot.L": 0.071,
}
URUMIGUMA_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_urumiguma():
    """
    ふさぎ込んだ古い悲しみ。honegaramiと同じ人型骨組みをベースに、
    nedayamabikoと同じ低い重心・前傾した姿勢にし、熊らしい丸い耳を
    足す。悲しみに沈んで丸くなった様子を、垂れた瞼の眠たげな目で
    表す。配色は第五地方(なみだの滝つぼ)の、沈んだ青・藍色系。
    """
    joints = C.mirrored(URUMIGUMA_HALF)
    radii = C.mirrored_radii(URUMIGUMA_RADII_HALF)
    bones = C.mirrored_bones(URUMIGUMA_BONES_HALF)

    body = C.build_skinned("urumiguma", joints, bones, radii, root="hip", subsurf=2)
    fur = C.make_material("urumi_fur", (0.22, 0.26, 0.42), roughness=0.85)
    C.assign_material(body, fur)

    extras = []
    for side in (-1.0, 1.0):
        ear = C.uv_sphere(f"urumi_ear{side}", (0.098 * side, 0.030, 0.545), 0.052,
                          segments=16, rings=12, scale=(1.0, 0.7, 1.0))
        C.assign_material(ear, fur)
        extras.append(ear)
        # 垂れた瞼の眠たげな目(nebosukegaeruと同じ手法)
        extras += eyeball(f"urumi_eye{side}", (0.085 * side, -0.118, 0.470), 0.038,
                          look=(0.2 * side, -0.85, -0.1), squash=0.45,
                          white=(0.70, 0.72, 0.80), dark=(0.10, 0.10, 0.16))
        lid = C.uv_sphere(f"urumi_lid{side}", (0.085 * side, -0.112, 0.484), 0.040,
                          segments=14, rings=10, scale=(1.0, 0.85, 0.5))
        C.assign_material(lid, fur)
        extras.append(lid)
    snout = C.uv_sphere("urumi_snout", (0.0, -0.155, 0.415), 0.058,
                        segments=16, rings=12, scale=(0.85, 1.0, 0.7))
    C.assign_material(snout, C.make_material("urumi_snout_m", (0.30, 0.34, 0.48), roughness=0.75))
    extras.append(snout)

    # 抱え込むように丸めた前足の中の、角のある古い石(plan/models/
    # sheet-urumiguma.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。ふさぎ込んで
    # 動かない理由を物として持たせる、common.gemの結晶
    stone_mat = C.make_material("urumi_stone", (0.42, 0.42, 0.44), roughness=0.8)
    stone = C.gem("urumi_stone", (0.0, -0.045, 0.145), 0.068, subdivisions=1,
                  scale=(1.1, 1.0, 0.9))
    C.assign_material(stone, stone_mat)
    extras.append(stone)

    mesh = C.join([body] + extras, "urumiguma")
    armature = C.build_armature("urumiguma", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def urumiguma_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・頭の遅れ追従(二次揺れ)・歩行の接地沈み・
    死亡時の跳ね返りを足してある。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 悲しみに沈んだまま、ほとんど動かない。頭(neck)が胴(hipc)より
        # 2フレーム遅れて追従する二次揺れ
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (44, {hipc: (1.5, 0, 1)}),
            (46, {neck: (2, 0, 0)}, {"partial": True}),
            (88, {hipc: (0, 0, 0)}),
            (90, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 脚が正中に戻る接地の瞬間に胴をわずかに沈める
        ("walk", [
            (1, {legL: (14, 0, 0), legR: (-14, 0, 0), armL: (-10, 0, 5), armR: (10, 0, -5)}),
            (12, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5),
                  hipc: {"loc": (0, -0.008, 0)}}),
            (23, {legL: (-14, 0, 0), legR: (14, 0, 0), armL: (10, 0, 5), armR: (-10, 0, -5)}),
            (34, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 5), armR: (0, 0, -5),
                  hipc: {"loc": (0, -0.008, 0)}}),
        ]),
        # 重い前足を、ためてからLINEARで鈍く振り下ろす
        ("attack", [
            (1, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (9, {armR: (-64, 0, -14), hipc: (-6, 0, -8)}, {"interp": "LINEAR"}),
            (15, {armR: (28, 0, 8), hipc: (10, 0, 8), neck: (-6, 0, 0)}),
            (26, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。guardらしく振幅は小さめ、戻り時間も
        # 短めに保つ
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (5, {hipc: (-8, 0, 0), neck: (-9, 0, 0), armL: (-10, 0, 12), armR: (-10, 0, -12)}),
            (18, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 悲しみそのものが、LINEARで鋭く崩れ始めてからその場でゆっくり
        # 沈む。32f到達後、胴と頭がほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (12, {hipc: (-10, 0, 4), neck: (-14, 0, 0), armL: (-20, 0, 20), armR: (-20, 0, -20)}),
            (32, {hipc: (-58, 0, 10), neck: (-26, 0, 0), legL: (30, 0, 0), legR: (26, 0, 0),
                  armL: (-46, 0, 32), armR: (-46, 0, -32)}),
            (36, {hipc: (-52, 0, 9), neck: (-23, 0, 0)}, {"partial": True}),
        ]),
    ]


# ======================================================================= なだかぜ

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにするが、涙を誘う風そのものという由来から、ずんぐりした蛙の
# 体つきを細く引き延ばし、四肢を尾を引くリボンのように長く尖らせる。
# 「何かを放つための器官」として、頬を大きく膨らませた吹き出しの口を
# 強調する。
NADAKAZE_HALF = {
    "hip": (0.0, 0.095, 0.135),
    "chest": (0.0, -0.045, 0.150),
    "head": (0.0, -0.235, 0.148),
    "armF.L": (0.108, -0.110, 0.098),
    "handF.L": (0.165, -0.145, 0.068),
    "kneeB.L": (0.095, 0.165, 0.128),
    "ankleB.L": (0.128, 0.240, 0.092),
    "footB.L": (0.148, 0.310, 0.055),
}
NADAKAZE_RADII_HALF = {
    "hip": 0.092, "chest": 0.100, "head": 0.082,
    "armF.L": 0.026, "handF.L": 0.016,
    "kneeB.L": 0.028, "ankleB.L": 0.018, "footB.L": 0.011,
}
NADAKAZE_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nadakaze():
    """
    涙を誘う風。tsubuteと同じ関節構成をベースに、ずんぐりした蛙の体を
    細く引き延ばし、四肢を風になびくリボンのように長く尖らせる。
    頬を大きく膨らませ、吹き出す口を強調する。配色は第五地方
    (なみだの滝つぼ)の、涙と滝つぼを思わせる沈んだ青・藍色系を
    薄めた、風らしい淡い色。
    """
    joints = C.mirrored(NADAKAZE_HALF)
    radii = C.mirrored_radii(NADAKAZE_RADII_HALF)
    bones = C.mirrored_bones(NADAKAZE_BONES_HALF)

    body = C.build_skinned("nadakaze", joints, bones, radii, root="chest", subsurf=2)
    wind = C.make_material("nadakaze_wind", (0.52, 0.60, 0.70), roughness=0.5)
    C.assign_material(body, wind)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"nadakaze_eye{side}", (0.058 * side, -0.255, 0.168), 0.030,
                          look=(0.2 * side, -1.0, 0.05),
                          white=(0.82, 0.88, 0.92), dark=(0.14, 0.18, 0.24))
        # 大きく膨らませた頬
        cheek = C.uv_sphere(f"nadakaze_cheek{side}", (0.082 * side, -0.240, 0.128), 0.046,
                            segments=14, rings=10)
        C.assign_material(cheek, wind)
        extras.append(cheek)
    mouth = C.uv_sphere("nadakaze_mouth", (0.0, -0.290, 0.118), 0.030,
                        segments=14, rings=10, scale=(0.9, 0.7, 0.75))
    C.assign_material(mouth, C.make_material("nadakaze_mouth_m", (0.16, 0.20, 0.28), roughness=0.4))
    extras.append(mouth)

    # 風を切る、面取りした扇状の翼端(plan/models/archive/sheet-nadakaze.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 丸い体表面に唯一の角のある面を作る、面取りした薄い箱
    fin_mat = C.make_material("nadakaze_fin", (0.30, 0.36, 0.44), roughness=0.4)
    for side in (-1.0, 1.0):
        fin = C.box(f"nadakaze_fin{side}", (0.192 * side, -0.160, 0.058),
                    (0.026, 0.007, 0.052), bevel=0.006)
        fin.rotation_euler = (0.0, 0.0, math.radians(-20.0 * side))
        C.assign_material(fin, fin_mat)
        extras.append(fin)

    mesh = C.join([body] + extras, "nadakaze")
    armature = C.build_armature("nadakaze", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nadakaze_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・脚の遅れ追従(二次揺れ)を足してある。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 風になびくように、絶えずゆらゆらと揺れる。脚(legL,R)が頭より
        # 2フレーム遅れて追従する(風の尾を引くような二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), legL: (0, 0, 8), legR: (0, 0, -8)}),
            (20, {head: (4, 6, 0)}),
            (22, {legL: (0, 0, -8), legR: (0, 0, 8)}, {"partial": True}),
            (40, {head: (-3, -6, 0)}),
            (42, {legL: (0, 0, 8), legR: (0, 0, -8)}, {"partial": True}),
        ]),
        # 地を這わず、風のように滑らかに漂い進む
        ("walk", [
            (1, {legL: (0, 0, 14), legR: (0, 0, -14), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (8, {legL: (0, 0, -14), legR: (0, 0, 14), armL: (0, 0, -10), armR: (0, 0, 10)}),
            (16, {legL: (0, 0, 14), legR: (0, 0, -14), armL: (0, 0, 10), armR: (0, 0, -10)}),
        ]),
        # 頬を膨らませてためてから、LINEARで鋭く吹きつけ、吐ききった
        # 反動で戻りかけてからゆっくり中立へ戻る
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (5, {head: (-16, 0, 0)}, {"interp": "LINEAR"}),
            (8, {head: (28, 0, 0)}),
            (10, {head: (18, 0, 0)}),
            (18, {head: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。振幅・戻り時間は現行どおり中程度に保つ
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (18, 0, 0), armL: (-16, 0, 14), armR: (-16, 0, -14)}),
            (12, {head: (0, 0, 0)}),
        ]),
        # 風がやむように、輪郭がほどけて消える。初動をLINEARで鋭くする。
        # 20f到達後、風がやんで最後にわずかに萎む1キーを追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (0, 8, 0), legL: (0, 0, -24), legR: (0, 0, 24)}),
            (20, {head: (0, 16, 0), legL: (0, 0, -50), legR: (0, 0, 50)}),
            (24, {head: (0, 14, 0), legL: (0, 0, -45), legR: (0, 0, 45)}, {"partial": True}),
        ]),
    ]


# =================================================================== しおれざくら

SHIORESAKURA_JOINTS = {
    "base": (0.0, 0.0, 0.075),
    "mid": (0.0, 0.0, 0.190),
    "top": (0.0, 0.0, 0.300),
}
SHIORESAKURA_RADII = {"base": 0.185, "mid": 0.185, "top": 0.095}
SHIORESAKURA_BONES = [("base", "mid"), ("mid", "top")]


def build_shioresakura():
    """
    涙で色あせた花。purunと同じ縦2本の骨組みをそのまま流用し、頭の
    周りに萎れた花びらを6枚まとわせる。花びらは半分ほど下向きに
    垂れさせ、「打たれるたびに力を失っていく」萎れた姿にする。
    配色は第五地方(なみだの滝つぼ)の、涙で色あせた沈んだ青・藍色系。
    """
    body = C.build_skinned("shioresakura", SHIORESAKURA_JOINTS, SHIORESAKURA_BONES,
                           SHIORESAKURA_RADII, root="base", subsurf=2)
    stem = C.make_material("shiore_stem", (0.30, 0.34, 0.30), roughness=0.7)
    C.assign_material(body, stem)

    petal_mat = C.make_material("shiore_petal", (0.44, 0.46, 0.62), roughness=0.6)
    petal_dark = C.make_material("shiore_petal_dark", (0.32, 0.34, 0.50), roughness=0.65)
    petals = []
    for i, angle_deg in enumerate([0.0, 60.0, 120.0, 180.0, 240.0, 300.0]):
        angle = math.radians(angle_deg)
        # 半分は下向きに垂らして萎れた印象を強める
        droop = 0.055 if i % 2 == 0 else 0.020
        cx, cy = math.cos(angle) * 0.145, math.sin(angle) * 0.145
        petal = C.uv_sphere(f"shiore_petal{i}", (cx, cy, 0.300 - droop), 0.098,
                            segments=16, rings=12, scale=(1.0, 1.0, 0.30))
        C.assign_material(petal, petal_mat if i % 2 == 0 else petal_dark)
        petals.append(petal)
    body = C.join([body] + petals, "shioresakura")

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"shiore_eye{side}", (0.075 * side, -0.170, 0.205), 0.038,
                          look=(0.2 * side, -1.0, 0.0),
                          white=(0.78, 0.80, 0.86), dark=(0.14, 0.14, 0.22))
    mouth = C.uv_sphere("shiore_mouth", (0.0, -0.195, 0.140), 0.032,
                        segments=14, rings=10, scale=(1.3, 0.5, 0.55))
    C.assign_material(mouth, C.make_material("shiore_mouth_m", (0.20, 0.22, 0.32), roughness=0.3))
    extras.append(mouth)

    # 花の根元を支える、面取りした木質の萼(plan/models/
    # sheet-shioresakura.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る、面取りした円柱
    calyx_mat = C.make_material("shiore_calyx", (0.20, 0.24, 0.20), roughness=0.75)
    calyx = C.cylinder("shiore_calyx", (0.0, 0.0, 0.196), 0.225, 0.038,
                       segments=24, bevel=0.011)
    C.assign_material(calyx, calyx_mat)
    extras.append(calyx)

    mesh = C.join([body] + extras, "shioresakura")
    armature = C.build_armature("shioresakura", C.mirrored(SHIORESAKURA_JOINTS),
                                SHIORESAKURA_BONES, mesh, root="base")
    return [mesh, armature], armature


def shioresakura_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・花びらの遅れ追従(二次揺れ)を足してある。
    lowHpAtkBonusMax(瀕死になるほど攻撃力が上がる)性質を動きにも反映する。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 花びら側(upper)がlowerより2フレーム遅れて揺れる(二次揺れ)
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (18, {lower: {"scale": (1.04, 0.95, 1.04)}}),
            (20, {upper: {"scale": (0.97, 1.05, 0.97)}}, {"partial": True}),
            (36, {lower: neutral}),
            (38, {upper: neutral}, {"partial": True}),
        ]),
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}, upper: squash}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # 瀕死になるほど攻撃力が増す性質どおり、タメの後にLINEARで鋭く
        # 大きく身を反らせ、反りをわずかに残しながら戻る
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (7, {lower: squash, upper: stretch}, {"interp": "LINEAR"}),
            (9, {lower: {"scale": (0.8, 1.35, 0.8), "loc": (0, 0.06, 0)}, upper: {"scale": (1.18, 0.78, 1.18)}}),
            (11, {lower: {"scale": (0.9, 1.20, 0.9), "loc": (0, 0.03, 0)}, upper: {"scale": (1.08, 0.90, 1.08)}}),
            (18, {lower: neutral, upper: neutral}),
        ]),
        # 入りだけLINEARで鋭くする。振幅は現行どおり中程度、戻りはゆっくりのまま
        ("hit", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (4, {lower: {"scale": (1.3, 0.66, 1.3)}, upper: {"scale": (0.88, 1.16, 0.88)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # 散る花びらのように、LINEARで鋭く輪郭を潰しながら崩れ落ちる。
        # 24f到達後、わずかに揺り戻る跳ね返りを追加
        ("die", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (10, {lower: {"scale": (1.35, 0.5, 1.35)}, upper: {"scale": (1.25, 0.55, 1.25)}}),
            (24, {lower: {"scale": (1.5, 0.06, 1.5)}, upper: {"scale": (1.4, 0.08, 1.4)}}),
            (28, {lower: {"scale": (1.42, 0.12, 1.42)}, upper: {"scale": (1.32, 0.14, 1.32)}}, {"partial": True}),
        ]),
    ]


# ======================================================================= みずかがみ

MIZUKAGAMI_JOINTS = {
    "root": (0.0, 0.0, 0.04),
    "stem": (0.0, 0.0, 0.12),
    "capbase": (0.0, 0.0, 0.22),
    "captop": (0.0, 0.0, 0.30),
}
MIZUKAGAMI_RADII = {"root": 0.13, "stem": 0.19, "capbase": 0.20, "captop": 0.16}
MIZUKAGAMI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def mizukagami_mirror_z(dist: float) -> float:
    """
    鏡面(captop上に載る円盤)の表面高さ。captop(半径0.16)の直上に、
    サブディビジョンで丸まるぶんを見積もって少し高めに置く。
    """
    return MIZUKAGAMI_JOINTS["captop"][2] + 0.012


def build_mizukagami():
    """
    滝つぼの水面に映る古い姿。madoromiと同じ関節構成をベースに、傘を
    大きく広げる代わりに寸胴な壺のような輪郭にし、頂上に鏡のような
    水面を張らせる(mimic AIらしく道具に紛れ込む、目立たない形)。
    水面には同心円の波紋を色の濃淡で描き、姿を映す鏡であることを示す。
    """
    body = C.build_skinned("mizukagami", MIZUKAGAMI_JOINTS, MIZUKAGAMI_BONES,
                           MIZUKAGAMI_RADII, root="root", subsurf=3)
    jar_mat = C.make_material("mizukagami_jar", (0.20, 0.24, 0.36), roughness=0.7)
    C.assign_material(body, jar_mat)

    # 頂上に張った水面。中心からの距離に応じて濃淡を塗り分け、波紋にする
    mirror = C.uv_sphere("mizukagami_mirror", (0.0, 0.0, mizukagami_mirror_z(0.0)), 0.155,
                         segments=40, rings=20, scale=(1.0, 1.0, 0.12))
    ripple_light = C.make_material("mizukagami_ripple_light", (0.64, 0.74, 0.84), roughness=0.15)
    ripple_dark = C.make_material("mizukagami_ripple_dark", (0.30, 0.40, 0.54), roughness=0.15)

    def classify_ripple(c):
        dist = math.sqrt(c.x * c.x + c.y * c.y)
        band = int(dist / 0.030) % 2
        return band

    C.assign_materials_by_region(mirror, [ripple_light, ripple_dark], classify_ripple)

    # 壺の口を縁取る硬い口輪(plan/models/archive/sheet-mizukagami.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 丸い壺の輪郭に唯一の角のある面を作る、面取りした円柱
    rim_mat = C.make_material("mizukagami_rim", (0.16, 0.19, 0.28), roughness=0.6)
    rim = C.cylinder("mizukagami_rim", (0.0, 0.0, 0.288), 0.168, 0.028,
                     segments=28, bevel=0.009)
    C.assign_material(rim, rim_mat)

    extras = [mirror, rim]
    for side in (-1.0, 1.0):
        # 息をひそめて縁からのぞく、目立たない目
        eye = C.uv_sphere(f"mizukagami_eye{side}", (0.062 * side, -0.150, 0.175), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.6, 0.55))
        C.assign_material(eye, C.make_material(f"mizukagami_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    mouth = C.uv_sphere("mizukagami_mouth", (0.0, -0.155, 0.130), 0.022,
                        segments=12, rings=8, scale=(0.9, 0.5, 0.6))
    C.assign_material(mouth, C.make_material("mizukagami_mouth_m", (0.14, 0.16, 0.24), roughness=0.4))
    extras.append(mouth)

    mesh = C.join([body] + extras, "mizukagami")
    armature = C.build_armature("mizukagami", MIZUKAGAMI_JOINTS, MIZUKAGAMI_BONES, mesh, root="root")
    return [mesh, armature], armature


def mizukagami_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・壺の遅れ追従(二次揺れ)を足してある。
    """
    stem, cap, mirror = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # 道具のふりをして、ほとんど動かずじっと潜む。水面の揺らぎ(mirror)
        # が壺(cap)へ3フレーム遅れて伝わる、ごく控えめな二次揺れを追加
        ("idle", [
            (1, {mirror: (0, 0, 0), cap: (0, 0, 0)}),
            (48, {mirror: (1.2, 0, 1)}),
            (51, {cap: (1, 0, 0.8)}, {"partial": True}),
            (96, {mirror: (0, 0, 0)}),
            (99, {cap: (0, 0, 0)}, {"partial": True}),
        ]),
        # 道具らしからぬ、正体を現したときのぎこちない足取り
        ("walk", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}),
            (7, {stem: (8, 0, 5), cap: (-6, 0, -3)}),
            (14, {stem: (-8, 0, -5), cap: (6, 0, 3)}),
            (21, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        # タメ→LINEARで鋭く打ちつける→行き過ぎ→ゆっくり中立へ
        ("attack", [
            (1, {cap: (0, 0, 0), mirror: (0, 0, 0)}),
            (5, {cap: (-18, 0, 0), mirror: (-14, 0, 0)}, {"interp": "LINEAR"}),
            (8, {cap: (28, 0, 0), mirror: (26, 0, 0)}),
            (10, {cap: (14, 0, 0), mirror: (12, 0, 0)}),
            (20, {cap: (0, 0, 0), mirror: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。振幅・戻り時間は現行どおり中程度に保つ
        ("hit", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {stem: (-16, 0, 0), cap: (-14, 0, 0)}),
            (14, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        # 水面が波紋となって崩れ、映していた姿が消える。初動をLINEARで
        # 鋭くする。24f到達後、stem/capがほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {stem: (-24, 0, 8), cap: (-28, 0, 0), mirror: (-20, 0, 0)}),
            (24, {stem: (-70, 0, 20), cap: (-52, 0, 0), mirror: (-38, 0, 0)}),
            (28, {stem: (-63, 0, 18), cap: (-47, 0, 0)}, {"partial": True}),
        ]),
    ]


# ========================================================================= なきむし

NAKIMUSHI_HALF = {
    "hip": (0.0, 0.06, 0.10),
    "chest": (0.0, -0.03, 0.115),
    "head": (0.0, -0.12, 0.115),
    "armF.L": (0.075, -0.08, 0.06),
    "handF.L": (0.09, -0.11, 0.02),
    "kneeB.L": (0.10, 0.06, 0.10),
    "ankleB.L": (0.09, -0.02, 0.03),
    "footB.L": (0.085, -0.075, 0.012),
}
NAKIMUSHI_RADII_HALF = {
    "hip": 0.095, "chest": 0.10, "head": 0.085,
    "armF.L": 0.022, "handF.L": 0.026,
    "kneeB.L": 0.024, "ankleB.L": 0.016, "footB.L": 0.010,
}
NAKIMUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nakimushi():
    """
    泣きやまない小さな夢。tsubuteと同じ関節構成をベースに、群れの1体分
    として簡略化した小さなシルエットに縮める。目を大きく見開いて
    しゃくり上げ、頬に涙の筋を垂らし、口を大きく開けて泣き叫ぶ顔にする。
    配色は第五地方(なみだの滝つぼ)の、涙と滝つぼを思わせる沈んだ
    青・藍色系。
    """
    joints = C.mirrored(NAKIMUSHI_HALF)
    radii = C.mirrored_radii(NAKIMUSHI_RADII_HALF)
    bones = C.mirrored_bones(NAKIMUSHI_BONES_HALF)

    body = C.build_skinned("nakimushi", joints, bones, radii, root="chest", subsurf=2)
    skin = C.make_material("nakimushi_skin", (0.24, 0.28, 0.42), roughness=0.65)
    C.assign_material(body, skin)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"nakimushi_eye{side}", (0.048 * side, -0.155, 0.135), 0.026,
                          look=(0.2 * side, -1.0, 0.1),
                          white=(0.86, 0.90, 0.94), dark=(0.12, 0.16, 0.26))
        # 頬を伝う涙の筋
        tear = C.uv_sphere(f"nakimushi_tear{side}", (0.052 * side, -0.140, 0.095), 0.016,
                           segments=10, rings=8, scale=(0.7, 0.7, 1.7))
        C.assign_material(tear, C.make_material(f"nakimushi_tear{side}_m", (0.66, 0.78, 0.90),
                                                roughness=0.2))
        extras.append(tear)
    mouth = C.uv_sphere("nakimushi_mouth", (0.0, -0.175, 0.078), 0.038,
                        segments=14, rings=10, scale=(0.85, 0.7, 1.0))
    C.assign_material(mouth, C.make_material("nakimushi_mouth_m", (0.10, 0.08, 0.14), roughness=0.5))
    extras.append(mouth)

    # 頬に固まってこびりついた、角のある小さな涙の結晶(plan/models/
    # sheet-nakimushi.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る、正二十面体そのままの結晶
    crystal_mat = C.make_material("nakimushi_crystal", (0.70, 0.82, 0.92), roughness=0.25,
                                  emission=0.2)
    crystal = C.gem("nakimushi_crystal", (0.062, -0.128, 0.062), 0.020, subdivisions=1)
    C.assign_material(crystal, crystal_mat)
    extras.append(crystal)

    mesh = C.join([body] + extras, "nakimushi")
    armature = C.build_armature("nakimushi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nakimushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・腕の極小な遅れ追従(二次揺れ)を足してある。
    swarmの小さな個体らしく振り幅自体は控えめのまま。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # しゃくり上げるように、絶えず小刻みに震える。腕(armL,R)が頭より
        # 1フレーム遅れて追従する(震えに巻き込まれる二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (6, {head: (5, 0, 0)}),
            (7, {armL: (0, 0, 6), armR: (0, 0, -6)}, {"partial": True}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (18, {head: (5, 0, 0)}),
            (19, {armL: (0, 0, 6), armR: (0, 0, -6)}, {"partial": True}),
            (24, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {legL: (0, 0, 20), legR: (0, 0, -20), armL: (0, 0, -14), armR: (0, 0, 14)}),
            (7, {legL: (0, 0, -20), legR: (0, 0, 20), armL: (0, 0, 14), armR: (0, 0, -14)}),
            (14, {legL: (0, 0, 20), legR: (0, 0, -20), armL: (0, 0, -14), armR: (0, 0, 14)}),
        ]),
        # 小さな体を反らせて、LINEARで鋭く精一杯泣き声を振り絞り、
        # 腕もわずかに緩みながら戻りかけてからゆっくり中立へ戻る
        ("attack", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (5, {head: (-18, 0, 0), armL: (-14, 0, 10), armR: (-14, 0, -10)}, {"interp": "LINEAR"}),
            (7, {head: (18, 0, 0), armL: (13, 0, -10), armR: (13, 0, 10)}),
            (10, {head: (10, 0, 0), armL: (6, 0, -5), armR: (6, 0, 5)}),
            (18, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。非力なswarm個体なので振幅は現行どおり
        # 中程度、戻りはゆっくりのまま
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (16, 0, 0), armL: (-10, 0, 12), armR: (-10, 0, -12)}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 声を上げきったように、体がしぼんで消える。初動をLINEARで鋭くする。
        # 20f到達後、頭がほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (10, 0, 0), legL: (0, 0, -18), legR: (0, 0, 18)}),
            (20, {head: (20, 0, 0), legL: (0, 0, -40), legR: (0, 0, 40)}),
            (24, {head: (17, 0, 0)}, {"partial": True}),
        ]),
    ]


# ========================================================================= なみだぐま

NAMIDAGUMA_HALF = {
    "hip": (0.0, 0.115, 0.195),
    "chest": (0.0, -0.055, 0.215),
    "head": (0.0, -0.225, 0.205),
    "armF.L": (0.155, -0.155, 0.10),
    "handF.L": (0.175, -0.220, 0.025),
    "kneeB.L": (0.21, 0.115, 0.21),
    "ankleB.L": (0.185, -0.045, 0.065),
    "footB.L": (0.175, -0.155, 0.022),
}
NAMIDAGUMA_RADII_HALF = {
    "hip": 0.185, "chest": 0.195, "head": 0.165,
    "armF.L": 0.058, "handF.L": 0.062,
    "kneeB.L": 0.095, "ankleB.L": 0.068, "footB.L": 0.058,
}
NAMIDAGUMA_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_namidaguma():
    """
    こらえきれずにこぼれた涙が底力に変わる姿。tsubuteと同じ関節構成を
    ベースに、四肢を太く張り出させ、正面から迫る力強いがっしりした
    熊の体格に作り替える。頭に丸い耳と突き出た鼻面を足し、眉間を
    寄せた険しい表情にする。片頬にだけ、こらえきれず伝った涙の筋を
    残す。配色は第五地方(なみだの滝つぼ)の、涙と滝つぼを思わせる
    沈んだ青・藍色系。
    """
    joints = C.mirrored(NAMIDAGUMA_HALF)
    radii = C.mirrored_radii(NAMIDAGUMA_RADII_HALF)
    bones = C.mirrored_bones(NAMIDAGUMA_BONES_HALF)

    body = C.build_skinned("namidaguma", joints, bones, radii, root="chest", subsurf=2)
    fur = C.make_material("namidaguma_fur", (0.22, 0.26, 0.38), roughness=0.75)
    paw = C.make_material("namidaguma_paw", (0.13, 0.16, 0.26), roughness=0.7)
    C.assign_materials_by_region(body, [fur, paw], lambda c: 1 if c.z < 0.075 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # 頭頂の丸い耳
        ear = C.uv_sphere(f"namidaguma_ear{side}", (0.115 * side, -0.180, 0.315), 0.055,
                          segments=14, rings=10, scale=(1.0, 0.7, 0.85))
        C.assign_material(ear, fur)
        extras.append(ear)
        # 眉間を寄せた険しい眉
        brow = C.uv_sphere(f"namidaguma_brow{side}", (0.075 * side, -0.320, 0.255), 0.042,
                           segments=12, rings=8, scale=(1.0, 0.6, 0.4))
        C.assign_material(brow, paw)
        extras.append(brow)
        extras += eyeball(f"namidaguma_eye{side}", (0.070 * side, -0.325, 0.220), 0.030,
                          look=(0.2 * side, -1.0, -0.1),
                          white=(0.70, 0.74, 0.82), dark=(0.10, 0.12, 0.20))
    # こらえきれず伝った涙の筋(左頬にだけ残す)
    tear = C.uv_sphere("namidaguma_tear", (-0.062, -0.300, 0.165), 0.020,
                       segments=10, rings=8, scale=(0.7, 0.7, 1.8))
    C.assign_material(tear, C.make_material("namidaguma_tear_m", (0.60, 0.70, 0.84), roughness=0.2))
    extras.append(tear)
    # 突き出た鼻面
    snout = C.uv_sphere("namidaguma_snout", (0.0, -0.365, 0.185), 0.052,
                        segments=14, rings=10, scale=(0.85, 1.1, 0.7))
    C.assign_material(snout, paw)
    extras.append(snout)
    mouth = C.uv_sphere("namidaguma_mouth", (0.0, -0.400, 0.150), 0.028,
                        segments=12, rings=8, scale=(1.1, 0.6, 0.55))
    C.assign_material(mouth, C.make_material("namidaguma_mouth_m", (0.08, 0.06, 0.10), roughness=0.4))
    extras.append(mouth)

    # うるみぐまが抱えていた古い石(plan/models/archive/sheet-urumiguma.md)が、
    # こらえきれずに割れて欠片になった姿(plan/models/
    # sheet-namidaguma.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。common.gemを砕けた
    # 複数の欠片として胸元に散らす
    shard_mat = C.make_material("namidaguma_shard", (0.42, 0.42, 0.44), roughness=0.8)
    for i, (x, y, z, size) in enumerate([
        (0.0, -0.075, 0.135, 0.052), (0.055, -0.055, 0.098, 0.032),
        (-0.050, -0.060, 0.100, 0.030),
    ]):
        shard = C.gem(f"namidaguma_shard{i}", (x, y, z), size, subdivisions=1)
        C.assign_material(shard, shard_mat)
        extras.append(shard)

    mesh = C.join([body] + extras, "namidaguma")
    armature = C.build_armature("namidaguma", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def namidaguma_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・腕の遅れ追従(二次揺れ)を足してある。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 大柄でどっしりした体格を反映し、腕(armL,R)が頭より3フレーム
        # 遅れて追従する(gajiriと同程度の遅れ幅で鈍重さを強調する二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (30, {head: (2, 0, 1)}),
            (33, {armL: (0, 0, 2), armR: (0, 0, -2)}, {"partial": True}),
            (60, {head: (0, 0, 0)}),
            (63, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # 重い体を踏みしめるように歩く
        ("walk", [
            (1, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
            (9, {legL: (0, 0, -16), legR: (0, 0, 16), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (18, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
        ]),
        # 底力を振り絞り、LINEARで鋭く正面から叩きつけ、わずかに
        # 行き過ぎてから戻る
        ("attack", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (5, {head: (-14, 0, 0), armL: (-30, 0, 16), armR: (-30, 0, -16)}, {"interp": "LINEAR"}),
            (10, {head: (20, 0, 0), armL: (36, 0, -10), armR: (36, 0, 10)}),
            (13, {head: (20, 0, 0), armL: (42, 0, -10), armR: (42, 0, 10)}),
            (20, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。振幅・戻り時間とも現行のまま維持する
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (16, 0, 0), armL: (-12, 0, 10), armR: (-12, 0, -10)}),
            (14, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。24f到達後、脚がごくわずかに戻る
        # 揺り戻し(着地後の小さな跳ね返り)を追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {head: (0, 0, 10), legL: (0, 0, -20), legR: (0, 0, 20)}),
            (24, {head: (0, 0, 22), legL: (0, 0, -46), legR: (0, 0, 46)}),
            (28, {legL: (0, 0, -41), legR: (0, 0, 41)}, {"partial": True}),
        ]),
    ]


# ======================================================================= ねむりモグラ

NEMURIMOGURA_HALF = {
    "hip": (0.0, 0.13, 0.19),
    "chest": (0.0, -0.01, 0.20),
    "neck": (0.0, -0.11, 0.185),
    "snout": (0.0, -0.24, 0.14),
    "tail1": (0.0, 0.175, 0.155),
    "tail2": (0.0, 0.195, 0.15),
    "tail3": (0.0, 0.21, 0.145),
    "ear.L": (0.058, -0.115, 0.225),
    "hipF.L": (0.105, -0.045, 0.125),
    "footF.L": (0.135, -0.075, 0.03),
    "hipB.L": (0.10, 0.115, 0.135),
    "footB.L": (0.10, 0.145, 0.02),
}
NEMURIMOGURA_RADII_HALF = {
    "hip": 0.155, "chest": 0.165, "neck": 0.125, "snout": 0.052,
    "tail1": 0.038, "tail2": 0.032, "tail3": 0.024,
    "ear.L": 0.030,
    "hipF.L": 0.058, "footF.L": 0.066,
    "hipB.L": 0.048, "footB.L": 0.034,
}
NEMURIMOGURA_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_nemurimogura():
    """
    攻撃に眠りが確定でまとわりつくようになったモグラ。gajiriと同じ
    関節構成をベースに、体を丸く縮め、耳を小さく、尻尾を短く埋もれさせ、
    掘削に適した大きな前足に作り替える。オオマドロミの力を宿す証として、
    背に淡い胞子色の斑点を散らし、常に半分閉じた眠たげな目にする。
    配色は第三地方(まどろみの茸林)の、湿った土色と胞子の淡い黄土色。
    """
    joints = C.mirrored(NEMURIMOGURA_HALF)
    radii = C.mirrored_radii(NEMURIMOGURA_RADII_HALF)
    bones = C.mirrored_bones(NEMURIMOGURA_BONES_HALF)

    body = C.build_skinned("nemurimogura", joints, bones, radii, root="chest", subsurf=2)
    soil = C.make_material("nemurimogura_soil", (0.28, 0.22, 0.16), roughness=0.8)
    belly = C.make_material("nemurimogura_belly", (0.40, 0.34, 0.24), roughness=0.75)
    ear_in = C.make_material("nemurimogura_ear", (0.62, 0.46, 0.42), roughness=0.75)

    # 耳だけを内側の色にする。gajiriと同じく、高さで切ると背中まで
    # 巻き込むので耳の関節からの距離で判定する
    ears = [Vector(joints["ear.L"]), Vector(joints["ear.R"])]
    C.assign_materials_by_region(
        body, [soil, belly, ear_in],
        lambda c: 2 if min((c - e).length for e in ears) < 0.045
        else (1 if c.z < 0.135 else 0),
    )

    extras = []
    spore = C.make_material("nemurimogura_spore", (0.78, 0.70, 0.42), roughness=0.6)
    for i, (x, y, z, r) in enumerate([
        (0.06, -0.02, 0.245, 0.028), (-0.07, 0.05, 0.235, 0.024),
        (0.03, 0.16, 0.225, 0.022), (-0.04, 0.24, 0.205, 0.020),
    ]):
        spot = C.uv_sphere(f"nemurimogura_spore{i}", (x, y, z), r,
                           segments=10, rings=8, scale=(1.0, 1.0, 0.4))
        C.assign_material(spot, spore)
        extras.append(spot)
    for side in (-1.0, 1.0):
        # 常に半分閉じた眠たげな目
        eye = C.uv_sphere(f"nemurimogura_eye{side}", (0.058 * side, -0.185, 0.175), 0.024,
                          segments=14, rings=10, scale=(1.0, 0.55, 0.35))
        C.assign_material(eye, C.make_material(f"nemurimogura_eye{side}_m", EYE_DARK, roughness=0.3))
        extras.append(eye)
    nose = C.uv_sphere("nemurimogura_nose", (0.0, -0.275, 0.135), 0.024,
                       segments=12, rings=8, scale=(1.0, 0.7, 0.7))
    C.assign_material(nose, C.make_material("nemurimogura_nose_m", (0.72, 0.52, 0.52), roughness=0.4))
    extras.append(nose)

    # ユメクイモグラ譲りの掘削用の爪(plan/models/archive/sheet-nemurimogura.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 丸い前足の表面に唯一の角のある面を作る
    claw_mat = C.make_material("nemurimogura_claw", (0.74, 0.66, 0.42), roughness=0.55)
    for side in (-1.0, 1.0):
        fx, fy, fz = NEMURIMOGURA_HALF["footF.L"]
        fx *= side
        for dx, dy in ((-0.020, -0.008), (0.0, -0.018), (0.020, -0.008)):
            claw = C.cone(
                f"nemurimogura_claw{side}_{dx}",
                (fx + dx, fy + dy, fz - 0.008), 0.014, 0.003, 0.038, segments=8,
            )
            C.assign_material(claw, claw_mat)
            extras.append(claw)

    # オオマドロミの力を宿す証としての結晶片(common.gem、小さく)
    crystal_mat = C.make_material("nemurimogura_crystal", (0.82, 0.74, 0.44), roughness=0.3,
                                  emission=0.35)
    crystal = C.gem("nemurimogura_crystal", (0.135, -0.088, 0.058), 0.018, subdivisions=1)
    C.assign_material(crystal, crystal_mat)
    extras.append(crystal)

    mesh = C.join([body] + extras, "nemurimogura")
    armature = C.build_armature("nemurimogura", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def nemurimogura_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・前足の遅れ追従(二次揺れ)を足してある。
    """
    neck = "chest-neck"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    return [
        # 眠たげに、ゆっくりと体を揺らす。前足(hipF_L,R)が首より2フレーム
        # 遅れて追従する(眠りに沈んだ体の重みを感じさせる二次揺れ)
        ("idle", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (36, {neck: (3, 0, 2)}),
            (38, {hipF_L: (1, 0, 0), hipF_R: (-1, 0, 0)}, {"partial": True}),
            (72, {neck: (0, 0, 0)}),
            (74, {hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}, {"partial": True}),
        ]),
        # 土を掻くように、前足を大きく使って進む
        ("walk", [
            (1, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
            (8, {hipF_L: (-16, 0, 0), hipF_R: (16, 0, 0), hipB_L: (14, 0, 0), hipB_R: (-14, 0, 0)}),
            (16, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
        ]),
        # タメ→LINEARで鋭く前足を掻き出す→戻りかける→ゆっくり中立へ
        ("attack", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (5, {neck: (-10, 0, 0), hipF_L: (-24, 0, 14), hipF_R: (-24, 0, -14)}, {"interp": "LINEAR"}),
            (8, {neck: (17, 0, 0), hipF_L: (34, 0, -12), hipF_R: (34, 0, 12)}),
            (10, {neck: (14, 0, 0), hipF_L: (28, 0, -10), hipF_R: (28, 0, 10)}),
            (18, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。成熟個体らしい高HP・高防御を反映し、
        # 振幅は控えめのまま、戻り時間も現行どおりに保つ
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (14, 0, 0), hipF_L: (-10, 0, 8), hipF_R: (-10, 0, -8)}),
            (14, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 眠りに沈むように、体を丸めて消える。初動をLINEARで鋭くする。
        # 24f到達後、首がほんの少し戻るわずかな跳ね返りを追加
        ("die", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {neck: (10, 0, 0), hipF_L: (16, 0, 0), hipF_R: (16, 0, 0)}),
            (24, {neck: (24, 0, 0), hipF_L: (36, 0, 0), hipF_R: (36, 0, 0)}),
            (28, {neck: (20, 0, 0)}, {"partial": True}),
        ]),
    ]


# ========================================================================= ヌシガエル

NUSHIGAERU_HALF = {
    "hip": (0.0, 0.135, 0.23),
    "chest": (0.0, -0.068, 0.257),
    "head": (0.0, -0.27, 0.243),
    "armF.L": (0.19, -0.19, 0.122),
    "handF.L": (0.216, -0.27, 0.027),
    "kneeB.L": (0.257, 0.135, 0.257),
    "ankleB.L": (0.23, -0.054, 0.081),
    "footB.L": (0.216, -0.19, 0.030),
}
NUSHIGAERU_RADII_HALF = {
    "hip": 0.225, "chest": 0.24, "head": 0.20,
    "armF.L": 0.052, "handF.L": 0.058,
    "kneeB.L": 0.10, "ankleB.L": 0.068, "footB.L": 0.062,
}
NUSHIGAERU_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_nushigaeru():
    """
    ツブテガエルが霧深い湿地でたどり着いた、最も重たい遠い記憶の姿。
    tsubuteと同じ関節構成をベースに、並より一回り大きな図体に拡大し、
    この地方の主にふさわしい貫禄を持たせる。喉に石つぶてを溜め込む
    大きな喉袋を足し、背には歳月を経た証のいぼを散らす。目は主の
    証として淡く発光させる。配色は第二地方(忘れ潮の湿地)の、
    霧と水を思わせる灰みがかった水色・青緑系。

    通常種の拡大版に見えないよう、逸脱項目を意図して3つ選ぶ
    (plan/models/archive/boss-silhouette-differentiation.md):
    ①左右非対称(片側の後ろ足だけ歳月でひときわ太く育っている)
    ②重心・比率のずらし(喉袋を片側へ寄せ、異様に膨らませる)
    ③通常種には無い大きな形(この地方の湿地そのものを表す、背に
    根付いた睡蓮の葉と葦)。
    """
    joints = C.mirrored(NUSHIGAERU_HALF)
    radii = C.mirrored_radii(NUSHIGAERU_RADII_HALF)
    bones = C.mirrored_bones(NUSHIGAERU_BONES_HALF)
    # 逸脱項目①。片側の後ろ足だけ、歳月でひときわ太く育った印にする
    radii["kneeB.R"] *= 1.35
    radii["ankleB.R"] *= 1.30
    radii["footB.R"] *= 1.25

    body = C.build_skinned("nushigaeru", joints, bones, radii, root="chest", subsurf=2)
    hide = C.make_material("nushigaeru_hide", (0.36, 0.46, 0.48), roughness=0.7)
    belly = C.make_material("nushigaeru_belly", (0.56, 0.64, 0.62), roughness=0.6)
    C.assign_materials_by_region(body, [hide, belly], lambda c: 1 if c.z < 0.145 else 0)

    extras = []
    glow = C.make_material("nushigaeru_eye", (0.68, 0.86, 0.82), roughness=0.25, emission=1.4)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"nushigaeru_eye{side}", (0.082 * side, -0.335, 0.288), 0.040,
                          segments=16, rings=12, scale=(1.0, 1.0, 0.9))
        C.assign_material(eye, glow)
        extras.append(eye)
    # 逸脱項目②(重心・比率のずらし)。石つぶてを溜め込む喉袋を中央に
    # 置かず片側へ寄せ、通常種tsubuteには無い異様な大きさに育てる
    throat = C.uv_sphere("nushigaeru_throat", (0.062, -0.330, 0.150), 0.108,
                         segments=18, rings=14, scale=(1.0, 0.95, 0.72))
    C.assign_material(throat, belly)
    extras.append(throat)
    mouth = C.uv_sphere("nushigaeru_mouth", (0.0, -0.385, 0.205), 0.040,
                        segments=14, rings=10, scale=(1.15, 0.55, 0.5))
    C.assign_material(mouth, C.make_material("nushigaeru_mouth_m", (0.14, 0.16, 0.16), roughness=0.4))
    extras.append(mouth)
    # 歳月を経た証のいぼ
    wart_mat = C.make_material("nushigaeru_wart", (0.26, 0.34, 0.36), roughness=0.75)
    for i, (x, y, z, r) in enumerate([
        (0.10, 0.04, 0.315, 0.030), (-0.13, 0.10, 0.30, 0.026),
        (0.05, 0.19, 0.29, 0.024), (-0.06, -0.04, 0.32, 0.022),
        (0.16, 0.16, 0.275, 0.022),
    ]):
        wart = C.uv_sphere(f"nushigaeru_wart{i}", (x, y, z), r, segments=10, rings=8)
        C.assign_material(wart, wart_mat)
        extras.append(wart)

    # 抱えた、角のある巨大なつぶて岩(plan/models/archive/sheet-nushigaeru.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # tsubuteの石つぶてが地方ボス級に育った姿という位置づけで、
    # common.gemをツブテガエルより一回り大きくする
    stone = C.gem("nushigaeru_stone", (0.216, -0.27, 0.027), 0.062, subdivisions=1,
                  scale=(1.0, 0.9, 0.85))
    C.assign_material(stone, C.make_material("nushigaeru_stone_m", (0.45, 0.44, 0.42),
                                             roughness=0.9))
    extras.append(stone)

    # 逸脱項目③(通常種には無い大きな形)。この地方(忘れ潮の湿地)
    # そのものを表す、背に根付いた睡蓮の葉と葦。tsubuteはもちろん、
    # 通常種の蛙には存在しない意匠
    lily_mat = C.make_material("nushigaeru_lily", (0.22, 0.40, 0.24), roughness=0.7)
    lily = C.uv_sphere("nushigaeru_lily", (-0.075, 0.14, 0.365), 0.155,
                       segments=20, rings=6, scale=(1.0, 1.0, 0.10))
    C.assign_material(lily, lily_mat)
    # 背の睡蓮・葦は関節から離れた位置に乗っており、自動ウェイト計算の
    # ブレンドに任せるとdieの大きな崩れで元の位置に取り残される
    # (plan/models/archive/hard-part-bone-pinning-audit.md)。胴の骨
    # (chest-hip)へ剛体固定する
    C.mark_for_pin(lily)
    back_deco_names = [lily.name]
    extras.append(lily)
    reed_mat = C.make_material("nushigaeru_reed", (0.34, 0.42, 0.20), roughness=0.75)
    for i, (rx, ry, rlen) in enumerate([(-0.110, 0.10, 0.30), (-0.045, 0.17, 0.24),
                                        (-0.140, 0.19, 0.20)]):
        reed = C.cone(f"nushigaeru_reed{i}", (rx, ry, 0.385 + rlen / 2), 0.014, 0.003, rlen,
                     segments=8)
        C.assign_material(reed, reed_mat)
        C.mark_for_pin(reed)
        back_deco_names.append(reed.name)
        extras.append(reed)

    mesh = C.join([body] + extras, "nushigaeru")
    armature = C.build_armature("nushigaeru", joints, bones, mesh, root="chest")
    for group_name in back_deco_names:
        C.pin_weight_to_bone(mesh, group_name, "chest-hip")
    return [mesh, armature], armature


def nushigaeru_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・腕の遅れ追従(二次揺れ)を足してある。
    bossなのでhitは振幅を小さく、のけぞりを短く鋭くする。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 腕(armL,R)が頭より3フレーム遅れて追従する(gajiriの尻尾遅延と同じ考え方)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (36, {head: (2, 0, 1)}),
            (39, {armL: (2, 0, 0), armR: (-2, 0, 0)}, {"partial": True}),
            (72, {head: (0, 0, 0)}),
            (75, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # 重い図体を踏みしめて進む
        ("walk", [
            (1, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
            (10, {legL: (0, 0, -16), legR: (0, 0, 16), armL: (0, 0, 10), armR: (0, 0, -10)}),
            (20, {legL: (0, 0, 16), legR: (0, 0, -16), armL: (0, 0, -10), armR: (0, 0, 10)}),
        ]),
        # 喉袋を大きく膨らませてから、LINEARで鋭く石つぶてを吐き出す
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (6, {head: (-20, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (34, 0, 0)}),
            (11, {head: (38, 0, 0)}),
            (22, {head: (0, 0, 0)}),
        ]),
        # bossらしく振幅を小さく、のけぞりを短く鋭くする
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {head: (11, 0, 0), armL: (-9, 0, 8), armR: (-9, 0, -8)}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。24f付近の主たる崩れの後、28f付近に
        # 一度だけ小さく浮き上がって沈み直す跳ね返りを追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {head: (0, 8, 0), legL: (0, 0, -20), legR: (0, 0, 20)}),
            (24, {head: (0, 16, 0), legL: (0, 0, -46), legR: (0, 0, 46)}),
            (28, {head: (0, 13, 0), legL: (0, 0, -42), legR: (0, 0, 42)}, {"partial": True}),
        ]),
    ]


# ====================================================================== オイテケボシ

OITEKEBOSHI_JOINTS = {
    "root": (0.0, 0.0, 0.05),
    "stem": (0.0, 0.0, 0.20),
    "capbase": (0.0, 0.0, 0.30),
    "captop": (0.0, 0.0, 0.38),
}
OITEKEBOSHI_RADII = {"root": 0.09, "stem": 0.075, "capbase": 0.22, "captop": 0.05}
OITEKEBOSHI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_oitekeboshi():
    """
    置き去りにされた未練。madoromiと同じ関節構成をベースに、傘の縁に
    尖った突起を並べて星形の輪郭を作る。HPではなく満腹度を削る由来
    として、大きく開いた口に小さな牙を並べる。配色は第四地方
    (骨積みの回廊)の、積み重なった骨を思わせる白骨色・くすんだ灰色。
    目は未練の残り火として淡く発光させる。
    """
    body = C.build_skinned("oitekeboshi", OITEKEBOSHI_JOINTS, OITEKEBOSHI_BONES,
                           OITEKEBOSHI_RADII, root="root", subsurf=2)
    bone = C.make_material("oiteke_bone", (0.72, 0.68, 0.60), roughness=0.65)
    ash = C.make_material("oiteke_ash", (0.42, 0.42, 0.44), roughness=0.7)
    C.assign_materials_by_region(body, [bone, ash], lambda c: 1 if c.z > 0.285 else 0)

    extras = []
    # 傘の縁に並べた星形の突起
    for i, angle_deg in enumerate([0.0, 60.0, 120.0, 180.0, 240.0, 300.0]):
        angle = math.radians(angle_deg)
        px, py = math.cos(angle) * 0.205, math.sin(angle) * 0.205
        spike = C.cone(f"oiteke_spike{i}", (px, py, 0.235), 0.052, 0.006, 0.09)
        C.assign_material(spike, ash)
        extras.append(spike)

    glow = C.make_material("oiteke_eye", (0.62, 0.72, 0.80), roughness=0.25, emission=1.5)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"oiteke_eye{side}", (0.048 * side, -0.078, 0.155), 0.026,
                          segments=14, rings=10, scale=(1.0, 0.7, 0.9))
        C.assign_material(eye, glow)
        extras.append(eye)
    mouth = C.uv_sphere("oiteke_mouth", (0.0, -0.082, 0.098), 0.038,
                        segments=14, rings=10, scale=(1.1, 0.55, 0.65))
    C.assign_material(mouth, C.make_material("oiteke_mouth_m", (0.10, 0.09, 0.10), roughness=0.4))
    extras.append(mouth)
    # 満腹度を削る由来を示す、口元に並んだ小さな牙
    fang_mat = C.make_material("oiteke_fang", (0.88, 0.85, 0.78), roughness=0.4)
    for i, fx in enumerate([-0.026, -0.009, 0.009, 0.026]):
        fang = C.cone(f"oiteke_fang{i}", (fx, -0.098, 0.118), 0.009, 0.001, 0.026)
        C.assign_material(fang, fang_mat)
        extras.append(fang)

    mesh = C.join([body] + extras, "oitekeboshi")
    armature = C.build_armature("oitekeboshi", OITEKEBOSHI_JOINTS, OITEKEBOSHI_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def oitekeboshi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・傘の先端の遅れ追従(二次揺れ)を足してある。
    """
    lower, upper = "root-stem", "stem-capbase"
    top = "capbase-captop"
    return [
        # 未練が漂うように、絶えずゆらゆらと揺れる。傘の先端(top)が
        # upperより2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {lower: (0, 0, 0), upper: (0, 0, 0), top: (0, 0, 0)}),
            (24, {lower: (3, 0, 2), upper: (-3, 0, 0)}),
            (26, {top: (2, 0, 0)}, {"partial": True}),
            (48, {lower: (0, 0, 0), upper: (0, 0, 0)}),
            (50, {top: (0, 0, 0)}, {"partial": True}),
        ]),
        ("walk", [
            (1, {lower: (0, 0, -8), upper: (0, 0, 6)}),
            (9, {lower: (5, 0, 0), upper: (-4, 0, 0)}),
            (18, {lower: (0, 0, 8), upper: (0, 0, -6)}),
            (27, {lower: (5, 0, 0), upper: (-4, 0, 0)}),
            (36, {lower: (0, 0, -8), upper: (0, 0, 6)}),
        ]),
        # 大きく口を開け、LINEARで鋭く満腹度を吸い取るように吐き出し、
        # わずかに行き過ぎてから戻る
        ("attack", [
            (1, {upper: (0, 0, 0), top: (0, 0, 0)}),
            (5, {upper: (-14, 0, 0), top: (-10, 0, 0)}, {"interp": "LINEAR"}),
            (10, {upper: (20, 0, 0), top: (16, 0, 0)}),
            (13, {upper: (24, 0, 0), top: (19, 0, 0)}),
            (20, {upper: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。防御6・HP30という中堅相応の振幅・
        # 戻り時間は現行のまま維持する
        ("hit", [
            (1, {lower: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {lower: (-16, 0, 0), upper: (-14, 0, 0)}),
            (14, {lower: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 置き去りの未練が、LINEARで鋭く輪郭をほどいて消える。24f到達後、
        # 消える直前にlowerがわずかに戻る小さな跳ね返りを追加
        # (honezukanotsukaiの「ほどけた骨が一度弾んでから崩れ落ちる」のと同じ考え方)
        ("die", [
            (1, {lower: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {lower: (-30, 0, 10), upper: (-18, 0, 0)}),
            (24, {lower: (-78, 0, 22), upper: (-32, 0, 0)}),
            (28, {lower: (-70, 0, 20)}, {"partial": True}),
        ]),
    ]


# ======================================================================= オオマドロミ

OOMADOROMI_JOINTS = {
    "root": (0.0, 0.0, 0.075),
    "stem": (0.0, 0.0, 0.335),
    "capbase": (0.0, 0.0, 0.50),
    "captop": (0.0, 0.0, 0.68),
}
OOMADOROMI_RADII = {"root": 0.165, "stem": 0.15, "capbase": 0.375, "captop": 0.08}
OOMADOROMI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def oomadoromi_cap_surface_z(dist: float) -> float:
    """madoromiのcap_surface_zと同じ考え方を、oomadoromiの寸法に合わせて計算する。"""
    base_z, top_z = OOMADOROMI_JOINTS["capbase"][2], OOMADOROMI_JOINTS["captop"][2]
    base_r, top_r = OOMADOROMI_RADII["capbase"] * 0.86, OOMADOROMI_RADII["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.016


def build_oomadoromi():
    """
    マドロミダケが煮詰まりにまで煮詰まった、眠気そのものの化身。
    madoromiと同じ関節構成をベースに、全体をおよそ1.4倍に拡大し、
    がっしりした太い軸と大きく張り出した傘で、正面から迫る力強い
    シルエットにする。ヨリシロの核に近い夢である証として、目を
    淡く発光させる。配色は第三地方(まどろみの茸林)の、湿った土色と
    胞子の淡い黄土色。

    通常種madoromiの拡大版に見えないよう、逸脱項目を意図して3つ選ぶ
    (plan/models/archive/boss-silhouette-differentiation.md):
    ①左右非対称(傘そのものを片側へ倒すように傾ける) ②ネガティブ
    スペース(傘の裏に、眠気を吐き出す暗いひだの空洞を作る) ③通常種
    には無い大きな形(煮詰まって取り込んだ、もう1本の小さな傘を側面に
    育てる)。
    """
    # 逸脱項目①。capbase/captopをそのまま片側へずらし、傘を傾けて
    # 眠りこけているような不安定なシルエットにする(root/stemの軸は
    # 動かさない=既存の当たり判定・footfallは変えない)
    joints = dict(OOMADOROMI_JOINTS)
    joints["capbase"] = (0.048, 0.016, OOMADOROMI_JOINTS["capbase"][2])
    joints["captop"] = (0.100, 0.032, OOMADOROMI_JOINTS["captop"][2])
    body = C.build_skinned("oomadoromi", joints, OOMADOROMI_BONES,
                           OOMADOROMI_RADII, root="root", subsurf=2)
    stem_mat = C.make_material("oomadoromi_stem", (0.78, 0.72, 0.58), roughness=0.75)
    cap_mat = C.make_material("oomadoromi_cap", (0.46, 0.30, 0.24), roughness=0.6)
    C.assign_materials_by_region(body, [stem_mat, cap_mat], lambda c: 1 if c.z > 0.44 else 0)

    extras = []
    glow = C.make_material("oomadoromi_eye", (0.86, 0.70, 0.40), roughness=0.25, emission=1.6)
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"oomadoromi_eye{side}", (0.088 * side, -0.135, 0.285), 0.044,
                          segments=16, rings=12, scale=(1.0, 0.55, 0.4))
        C.assign_material(eye, glow)
        extras.append(eye)
    mouth = C.uv_sphere("oomadoromi_mouth", (0.0, -0.135, 0.205), 0.042,
                        segments=14, rings=10, scale=(0.85, 0.5, 1.0))
    C.assign_material(mouth, C.make_material("oomadoromi_mouth_m", (0.30, 0.16, 0.16), roughness=0.4))
    extras.append(mouth)

    # 傘の斑点。既存モデルより一回り大きく、数も多くする
    spot_mat = C.make_material("oomadoromi_spot", (0.92, 0.86, 0.66), roughness=0.6)
    for i, (angle_deg, dist, r) in enumerate([
        (200.0, 0.075, 0.058), (300.0, 0.145, 0.050), (60.0, 0.125, 0.052),
        (130.0, 0.180, 0.042), (10.0, 0.200, 0.036), (250.0, 0.225, 0.032),
        (340.0, 0.100, 0.044),
    ]):
        angle = math.radians(angle_deg)
        spot = C.uv_sphere(
            f"oomadoromi_spot{i}",
            (math.cos(angle) * dist, math.sin(angle) * dist, oomadoromi_cap_surface_z(dist)),
            r, segments=12, rings=8, scale=(1.0, 1.0, 0.40),
        )
        C.assign_material(spot, spot_mat)
        extras.append(spot)

    # マドロミダケの木質のつばを、ボス格にふさわしい太く節くれ立った
    # 意匠に拡大した根(plan/models/archive/sheet-oomadoromi.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 面取りした円柱を複数段重ねる
    root_mat = C.make_material("oomadoromi_root", (0.44, 0.34, 0.22), roughness=0.8)
    for i, (rz, radius, depth) in enumerate([(0.045, 0.185, 0.045), (0.088, 0.155, 0.038)]):
        collar = C.cylinder(f"oomadoromi_root{i}", (0.0, 0.0, rz), radius, depth,
                            segments=26, bevel=0.012)
        C.assign_material(collar, root_mat)
        extras.append(collar)

    # 逸脱項目②(ネガティブスペース)。傘の裏側に、眠気そのものを
    # 吐き出しているひだの暗い空洞を作る(通常種madoromiには無い深い陰影)
    gill_mat = C.make_material("oomadoromi_gill", (0.10, 0.06, 0.05), roughness=0.9)
    gill = C.uv_sphere("oomadoromi_gill", (0.020, 0.006, 0.430), 0.300,
                       segments=24, rings=6, scale=(1.0, 1.0, 0.11))
    C.assign_material(gill, gill_mat)
    extras.append(gill)

    # 逸脱項目③(通常種には無い大きな形)。煮詰まって取り込んだ、
    # もう1本の小さな傘を側面に育てる。①の傘の傾きと同じ側に添えて
    # 重心のずれを強める
    bud_stem_mat = C.make_material("oomadoromi_bud_stem", (0.72, 0.66, 0.52), roughness=0.75)
    bud_cap_mat = C.make_material("oomadoromi_bud_cap", (0.42, 0.27, 0.21), roughness=0.62)
    bud_stem = C.cylinder("oomadoromi_bud_stem", (0.225, 0.070, 0.235), 0.052, 0.28,
                          segments=14, bevel=0.010)
    C.assign_material(bud_stem, bud_stem_mat)
    C.mark_for_pin(bud_stem)
    bud_names = [bud_stem.name]
    extras.append(bud_stem)
    bud_cap = C.uv_sphere("oomadoromi_bud_cap", (0.225, 0.070, 0.375), 0.115,
                          segments=18, rings=12, scale=(1.0, 1.0, 0.62))
    C.assign_material(bud_cap, bud_cap_mat)
    # 側面の小さな傘は幹の関節から離れているため、自動ウェイト計算の
    # ブレンドに任せるとdieの大きな崩れで元の位置に取り残される
    # (plan/models/archive/hard-part-bone-pinning-audit.md)。一番近い骨
    # (root-stem)へ剛体固定する
    C.mark_for_pin(bud_cap)
    bud_names.append(bud_cap.name)
    extras.append(bud_cap)

    mesh = C.join([body] + extras, "oomadoromi")
    armature = C.build_armature("oomadoromi", joints, OOMADOROMI_BONES, mesh, root="root")
    for group_name in bud_names:
        C.pin_weight_to_bone(mesh, group_name, "root-stem")
    return [mesh, armature], armature


def oomadoromi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    LINEAR補間・行き過ぎ・二次揺れ・die跳ね返りを足してある。脚・足首を
    持たない縦1本の軸(madoromiファミリー共通)のため、footfall-dipは
    適用しない。ボス級の重さを保つため、attackのフレーム間隔はパイロット
    のhonegaramiよりやや長めに保っている。
    """
    stem, cap = "root-stem", "stem-capbase"
    top = "capbase-captop"
    return [
        # top(傘の頂の斑点部分)がcapより2フレーム遅れて追従する二次揺れ
        # を追加。大きな傘の先がわずかに遅れて揺れる
        ("idle", [
            (1, {stem: (0, 0, 0)}),
            (36, {stem: (2, 0, 1), cap: (-2, 0, 0)}),
            (38, {top: (-1.5, 0, 0)}, {"partial": True}),
            (72, {stem: (0, 0, 0)}),
        ]),
        # 太い軸を踏みしめ、傘を左右に大きく揺らして歩く(脚を持たない
        # 構造のため、footfall-dipは適用しない)
        ("walk", [
            (1, {stem: (0, 0, -7), cap: (0, 0, 5)}),
            (10, {stem: (5, 0, 0), cap: (-4, 0, 0)}),
            (20, {stem: (0, 0, 7), cap: (0, 0, -5)}),
            (30, {stem: (5, 0, 0), cap: (-4, 0, 0)}),
            (40, {stem: (0, 0, -7), cap: (0, 0, 5)}),
        ]),
        # がっしりした体格から、正面へ全身で叩きつける。引く(1→6)→
        # LINEARで鋭く叩きつける(6→12)→行き過ぎ(12→15、一瞬余分に
        # 振れる)→戻る(15→24)の4段構成
        ("attack", [
            (1, {stem: (0, 0, 0), cap: (0, 0, 0), top: (0, 0, 0)}),
            (6, {stem: (-12, 0, 0), cap: (-16, 0, 0), top: (-12, 0, 0)}),
            (12, {stem: (20, 0, 0), cap: (28, 0, 0), top: (22, 0, 0)}, {"interp": "LINEAR"}),
            (15, {stem: (24, 0, 0), cap: (33, 0, 0), top: (26, 0, 0)}, {"partial": True}),
            (24, {stem: (0, 0, 0), cap: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        # bossなので振幅は小さく、のけぞりは短く鋭くする
        ("hit", [
            (1, {stem: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {stem: (-11, 0, 0), cap: (-9, 0, 0)}),
            (11, {stem: (0, 0, 0), cap: (0, 0, 0)}),
        ]),
        # 根が崩れ落ちる初動をLINEARで鋭くし、崩れきる直前にstemが
        # わずかに戻る小さな跳ね返りを追加
        ("die", [
            (1, {stem: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {stem: (-28, 0, 8), cap: (-18, 0, 0)}),
            (24, {stem: (-72, 0, 18), cap: (-30, 0, 0)}),
            (28, {stem: (-66, 0, 16)}, {"partial": True}),
        ]),
    ]


# ======================================================================= おおねぼすけ

OONEBOSUKE_JOINTS = {
    "base": (0.0, 0.0, 0.12),
    "mid": (0.0, 0.0, 0.30),
    "top": (0.0, 0.0, 0.56),
}
OONEBOSUKE_RADII = {"base": 0.435, "mid": 0.375, "top": 0.135}
OONEBOSUKE_BONES = [("base", "mid"), ("mid", "top")]

# 表情はガルドと同じ「テクスチャの状態アトラス」方式(src/view/blink.ts
# の"eyelid")で持たせる。設定画の表情・状態パターン欄(寝たまま)から
# 5種を採る: すやすや眠る(closed、既定)→うとうとしながら首をかしげる
# (murmur、口を閉じる)→うとうと(half、薄目)→あくびをする(yawn、
# 目をすぼめて口を大きく開く)→びっくりする(open、見開く)。
# blink.tsは進み具合を0→1→0で動かし、タイルへ0番から順に量子化する
# (handbook 2-26)ので、この並びは「眠ったまま→むにゃむにゃ→薄目→
# あくび→覚醒」と往復する一連の動きとして読める
OONEBOSUKE_EXPR_STATES = ("closed", "murmur", "half", "yawn", "open")
# 顔の島を切り出す球(中心・半径)。中心は_face_colorのis_faceと同じ。
# 半径は据え置きだが、頭の裏側まで拾わないようmax_yで前面だけに絞る
# (garudo.pyのFACE_ISLAND_MAX_Yと同じ理由。handbook 1-14参照)
OONEBOSUKE_FACE_C = (0.0, -0.22, 0.47)
OONEBOSUKE_FACE_R = 0.21
OONEBOSUKE_FACE_MAX_Y = -0.05
OONEBOSUKE_FACE_TEX = 320


def build_oonebosuke():
    """
    新しい設定画(design/characters/oonebosuke/generated/
    oonebosuke-sheet.png、ユーザー提供)に合わせて作り直した。
    仕様と実測値は plan/models/oonebosuke-remake2.md。

    **人型キャラクター**であることに寄せて組み直した。最初の再構築
    (首のくびれを完全に消し、腕をそのまま胴の融合に入れた版)は
    実機で見ると「顔の付いた壺」になっていた。原因は2つ:

    1. **腕が融合に食われていた**(handbook 3-22「融合が形を食っている
       なら、その部品は融合から外す」)。胴の半径0.3〜0.45に対し
       袖の半径0.08前後は voxel=0.012 の前ではほぼ消える薄さで、
       手の玉だけが胴からポツンと生えて見えた。腕は**胴の融合から
       外し、腕だけの小さな融合**にして形を残す。
    2. **肩から首、頭まで一本調子に細くなっていた**。分厚い首の
       断面が無いと頭と胴の区切りが消える。肩をいったん張り出させ、
       あご下で軽くくびれてから頭で再び広がる輪にする(くびれは
       浅く: 深いと今度は棒に刺さった頭に見える。handbook参照)。

    - **彫刻式の融合**は踏襲(plan/models/archive/
      sculpt-texture-pipeline.md)。胴+頭+腿+足+足指+頬+鼻を
      1つの塊に融合。腕(袖+手+親指)は左右それぞれ別に融合する。
    - **帽子**は円錐(ロフト、z単調増加でしか組めない)と、垂れる
      先端(curve_tube、任意の経路を辿れる)を分離。垂れは肩を
      大きく越えて腰の高さまで届かせる。
    - **肌の露出範囲**は正面方向だけに絞った楕円体距離場で判定し、
      **紫のまだら**をはっきり見える濃さ・密度で焼く。
    - **着物の柄**は金の星+三日月を高密度に散らす。
    """
    # 胴+頭を一続きのロフトで組む(座った洋梨形→肩で張り出し→
    # あご下で浅くくびれ→頭で再び広がる)。腹のリング(z=0.20〜0.27)の
    # 前方オフセット(cy)は側面図の実測(腹が体の最前面)に合わせて
    # 強めてある
    body = C.loft("oonebosuke_base", [
        (0.015, 0.360, 0.310, 0.0, 0.02),
        (0.050, 0.430, 0.365, 0.0, 0.00),
        (0.120, 0.455, 0.400, 0.0, -0.03),
        (0.200, 0.440, 0.395, 0.0, -0.06),   # 腹の最大張り出し(側面図で最前面)
        (0.270, 0.400, 0.360, 0.0, -0.07),   # 腹の上・胸(なお前面寄り)
        (0.340, 0.360, 0.320, 0.0, -0.05),
        (0.390, 0.335, 0.300, 0.0, -0.035),  # 肩(腕の付け根の張り出し)
        (0.440, 0.270, 0.245, 0.0, -0.02),   # あご下、浅いくびれ(深すぎると首が棒になる)
        (0.490, 0.235, 0.220, 0.0, -0.035),  # あご
        (0.545, 0.248, 0.235, 0.0, -0.055),  # 頬(頭の最大幅。くびれより広い)
        # 額のリングを追加した。旧版は頬からいきなり帽子が始まり、
        # 眉が帽子の縁(z=0.56〜0.59)と重なって「眉が縁に埋もれる」
        # 事故になっていた(実測、handbook参照)。頬と帽子のあいだに
        # 額ぶんの余白を作る
        (0.605, 0.215, 0.200, 0.0, -0.045),  # 額
        (0.660, 0.150, 0.140, 0.0, -0.025),  # 生え際(帽子で覆う)
        (0.710, 0.080, 0.075, 0.0, -0.005),  # 頭頂(帽子で覆う)
    ], segments=28)

    parts = [body]
    for side in (-1.0, 1.0):
        # 前へ投げ出した短い脚(腿)と、大きな足+足指
        parts.append(C.curve_tube(f"oonebosuke_thigh{side}",
                                  [Vector((0.16 * side, -0.24, 0.12)),
                                   Vector((0.19 * side, -0.38, 0.10)),
                                   Vector((0.21 * side, -0.46, 0.09))],
                                  [0.115, 0.100, 0.085]))
        parts.append(C.uv_sphere(f"oonebosuke_foot{side}",
                                 (0.215 * side, -0.50, 0.115), 0.095,
                                 segments=14, rings=10, scale=(0.82, 0.55, 1.05)))
        for ti, (dx, tr) in enumerate(zip((-0.051, -0.017, 0.017, 0.051),
                                          (0.027, 0.024, 0.021, 0.018))):
            parts.append(C.uv_sphere(f"oonebosuke_toe{side}_{ti}",
                                     (0.215 * side + dx * side, -0.545, 0.185),
                                     tr, segments=8, rings=6))
        # 頬のふくらみ(顔の量感)
        parts.append(C.uv_sphere(f"oonebosuke_cheekm{side}",
                                 (0.150 * side, -0.175, 0.450), 0.055,
                                 segments=10, rings=8))
    # 丸鼻
    parts.append(C.uv_sphere("oonebosuke_nose", (0.0, -0.285, 0.470), 0.050,
                             segments=12, rings=9, scale=(1.15, 0.75, 0.85)))

    # 彫刻式の融合(巨体なので融合0.012・出力0.016)。**腕はここに入れない**
    # (voxel=0.012の前では袖の半径0.08前後がほぼ消え、手だけが胴から
    # 生えて見える。handbook 3-22)
    body = C.sculpt_merge("oonebosuke", parts, voxel=0.012, out_voxel=0.016)

    # 腕: 肩(体の張り出し)から腹の前・地面近くまで下ろす。細い袖を
    # 胴と同じ voxel で融合すると消えるため、**腕だけ別に、より細かい
    # voxel で**融合して形を残す
    arm_extras = []
    for side in (-1.0, 1.0):
        # 肩の付け根は胴の外周(z=0.36〜0.39のrx≈0.30〜0.335)より外へ
        # 明確に出す。半径込みの外縁が胴の表面すれすれだと、シルエットの
        # 破れが数cmしか出ずほぼ見えなかった(実測、handbook 3-34)
        arm_parts = [C.curve_tube(f"oonebosuke_sleeve{side}",
                                  [Vector((0.320 * side, -0.030, 0.375)),
                                   Vector((0.395 * side, -0.190, 0.230)),
                                   Vector((0.330 * side, -0.345, 0.075))],
                                  [0.105, 0.092, 0.075]),
                     C.uv_sphere(f"oonebosuke_hand{side}",
                                (0.275 * side, -0.385, 0.045), 0.078,
                                segments=12, rings=9, scale=(1.0, 0.95, 0.75)),
                     C.uv_sphere(f"oonebosuke_thumb{side}",
                                (0.215 * side, -0.400, 0.062), 0.030,
                                segments=8, rings=6)]
        arm = C.sculpt_merge(f"oonebosuke_arm{side}", arm_parts, voxel=0.006,
                             out_voxel=0.008)
        arm_extras.append(arm)

    C.decimate_to(body, 6200)
    for arm in arm_extras:
        C.decimate_to(arm, 400)
    # 顔・腹の模様が正面にあるので、シームが正面を横切らないy軸splitで展開。
    # 顔は表情の状態アトラス(ガルドと同じ手法)を貼るため、boostで
    # 独立した島に切り出しておく(このあとsplit_material_regionで
    # 材質スロット2へ移し、UVを[0,1]へ詰め直す)
    C.organic_uv(body, axis=1,
                boost=(OONEBOSUKE_FACE_C, OONEBOSUKE_FACE_R, 1.0, OONEBOSUKE_FACE_MAX_Y))
    for arm in arm_extras:
        C.organic_uv(arm, axis=1)

    # 布の柔らかいしわ(低周波の凹凸)
    for obj in [body] + arm_extras:
        for v in obj.data.vertices:
            px, py, pz = v.co.x, v.co.y, v.co.z
            wave = (math.sin(px * 14.3 + pz * 9.7)
                    + math.sin(py * 12.1 + pz * 16.9)) / 2.0
            v.co += v.normal * (wave * 0.006)

    # ---- 塗り分け・まだら・顔はテクスチャに描く ----
    # 色は新しい設定画のカラーパレット欄の実測値(plan/models/
    # oonebosuke-remake2.md)。ダンジョンの暖色照明で紺紫が沈むため、
    # 実機のターンテーブルで測って補正した(handbook 1-26)
    skin_col = (0.84, 0.74, 0.65)      # 肌(メイン) #d6bda7
    robe_col = (0.40, 0.36, 0.58)      # 服(メイン) #585082 相当(補正込み)
    gold_col = (0.80, 0.62, 0.32)      # 服(柄・月星) #c4965b
    blotch_col = (0.36, 0.32, 0.52)    # 肌・服に散る紫のまだら

    def _in_ellipse(x, z, cx, cz, rx, rz):
        return ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1.0

    eye_col = (0.60, 0.53, 0.62)     # まぶた
    lash_col = (0.25, 0.20, 0.26)    # まつげ
    white_col = (0.92, 0.90, 0.88)   # 白目(設定画「びっくりする」)
    pupil_col = (0.10, 0.08, 0.10)   # 瞳

    def _eye(x, z, ex, state):
        """
        目1つぶんの色。state=0(closed)/1(murmur)は既定の閉じ目。
        state=3(yawn)は「あくびをする」を参照し、閉じ目のままひと回り
        すぼめる(あくびで目を固く閉じる仕草)。state=2(half)/4(open)は
        「うとうと」「びっくりする」を参照した見開き目(まばたきの
        山で一瞬だけ開く。src/view/blink.tsはタイル0を常時の休止状態
        として扱うので、寝ているこの子はclosedを0番に置く必要がある。
        openを0番にしたガルドの並びをそのまま流用すると安静時に目が
        開いたままになる。handbook 2-26)。
        1つの楕円をzで内分するのではなく、まぶた→白目→瞳を別々の
        図形として置く(2-25と同じ理由: 内分だと状態を跨いで境界が
        飛び、切り替えたときの見た目の一貫性が読みにくい)。
        """
        if state in (0, 1, 3):
            tight = state == 3
            cz = 0.500 if tight else 0.505
            rz = 0.026 if tight else 0.030
            if _in_ellipse(x, z, ex, cz, 0.058, rz):
                return eye_col
            if _in_ellipse(x, z, ex, cz - 0.027, 0.056, 0.008 if tight else 0.010):
                return lash_col
            return None
        rz = 0.052 if state == 4 else 0.024
        cz = 0.512 if state == 4 else 0.500
        if _in_ellipse(x, z, ex, cz, 0.056, rz):
            pr = 0.024 if state == 4 else 0.015
            if _in_ellipse(x, z, ex, cz - rz * 0.2, pr, pr):
                return pupil_col
            return white_col
        # 見開いた分、まぶたはまつげのように薄い弧としてだけ残す
        lid_cz = cz + rz + 0.008
        if _in_ellipse(x, z, ex, lid_cz, 0.060, 0.012):
            return eye_col
        return None

    def _mouth(x, z, state):
        """
        口の形。state=0(すやすや眠る)/2(うとうと)は薄く開いたいびきの
        口。state=1(むにゃむにゃ、うとうとしながら首をかしげる)は
        口を閉じた細い線。state=3(あくびをする)は大きく開けた口。
        state=4(びっくりする)は目だけで驚きを見せるので基本形のまま。
        """
        if state == 1:
            if _in_ellipse(x, z, 0.0, 0.394, 0.048, 0.010):
                return (0.16, 0.10, 0.12)          # 閉じた口の線
            return None
        rx, rz = (0.090, 0.072) if state == 3 else (0.072, 0.050)
        if _in_ellipse(x, z, 0.0, 0.397, rx, rz):
            if z < 0.397 - rz * 0.2 and abs(x) < rx * 0.5:
                return (0.51, 0.34, 0.34)          # 舌・口の中 #825656
            return (0.16, 0.10, 0.12)
        return None

    def skin_color(p, n, state: int = 0):
        x, y, z = p.x, p.y, p.z
        ax = abs(x)
        q = Vector((ax, y, z))
        is_face = (p - Vector(OONEBOSUKE_FACE_C)).length < OONEBOSUKE_FACE_R
        # 腹の露出範囲は正面方向だけに絞った楕円体距離場で判定する。
        # 等方球は肩・脇まで飲み込み、設定画の「腹だけ露出してあとは
        # 着物」という帯が消える(handbook 3-33)
        belly_c = Vector((0.0, -0.32, 0.165))
        belly_r = Vector((0.185, 0.145, 0.155))
        bd = Vector(((x - belly_c.x) / belly_r.x, (y - belly_c.y) / belly_r.y,
                    (z - belly_c.z) / belly_r.z))
        is_belly = bd.length < 1.0
        is_hand = (q - Vector((0.275, -0.390, 0.045))).length < 0.120
        is_foot = (q - Vector((0.215, -0.515, 0.13))).length < 0.150
        is_skin = is_face or is_belly or is_hand or is_foot
        if is_face:
            # あごの下の折り目(頭と体の区切りを線で補う。設定画は
            # ジオメトリではなく輪郭線でこの区切りを見せている)
            jowl_r = 0.235 - 0.14 * max(0.0, -n.y)
            if _in_ellipse(x, z, 0.0, 0.405, jowl_r, 0.018) and y < -0.16 and n.y < -0.2:
                return (skin_col[0] * 0.82, skin_col[1] * 0.80, skin_col[2] * 0.80)
            # 目: state で開閉が変わる(_eye)。まぶた・まつげと眉が
            # ほぼ同じ高さにあると、帽子の縁と重なったときに縞になって
            # 潰れる事故が起きるので(2-25)、間隔を空けてある
            for side in (-1.0, 1.0):
                ex = 0.090 * side
                eye = _eye(x, z, ex, state) if y < -0.185 else None
                if eye is not None:
                    return eye
                # 眉: 細い線。まぶたよりさらに上、額との境目に近い高さ
                if _in_ellipse(x, z, ex, 0.548, 0.052, 0.018) and y < -0.18 \
                        and z > 0.548 - 0.011 * (1.0 - (abs(x - ex) / 0.052) ** 2):
                    return (0.30, 0.24, 0.32)
            # 鼻の穴(小さな点2つ)
            for side in (-1.0, 1.0):
                if (Vector((abs(x), y, z)) - Vector((0.016, -0.318, 0.462))).length < 0.008:
                    return (0.28, 0.22, 0.20)
            # 口: state で開閉・大きさが変わる(_mouth)
            if y < -0.175:
                mouth = _mouth(x, z, state)
                if mouth is not None:
                    return mouth
            # 頬の赤み
            for side in (-1.0, 1.0):
                if _in_ellipse(x, z, 0.155 * side, 0.442, 0.045, 0.028) and y < -0.175:
                    return (0.80, 0.64, 0.58)
        if is_belly and _in_ellipse(x, z, 0.0, 0.155, 0.018, 0.013):
            return (0.60, 0.53, 0.48)                  # へそ
        if is_skin:
            # 肌: 露出した肌にも紫のまだらが大きくはっきり散る(石のような
            # 質感)。金の星と同程度の周波数(顔ほどの大きさの範囲で複数
            # 周する)にしないと一枚のぼんやりしたグラデーションにしか
            # ならない(実測: 焼いたテクスチャを直接見て気付いた。
            # handbook 1-19)
            blotch = (math.sin(x * 34.0 + y * 27.0) + math.sin(y * 29.0 + z * 38.0)
                     + math.sin(z * 31.0 - x * 24.0)) / 3.0
            b = min(1.0, max(0.0, (blotch - 0.35) / 0.22))
            return tuple(sk * (1.0 - 0.68 * b) + bl * (0.68 * b)
                        for sk, bl in zip(skin_col, blotch_col))
        # かいまき: 紺紫の地に、金の星と月が高密度に散る柄
        blotch = (math.sin(x * 5.1 + z * 6.7) + math.sin(y * 4.3 + z * 5.3)) / 2.0
        b = max(0.0, blotch)
        col = (robe_col[0] - 0.07 * b, robe_col[1] - 0.07 * b,
               robe_col[2] - 0.05 * b)
        star = math.sin(x * 26 + 0.8) * math.sin(y * 24 + 1.9) * math.sin(z * 28 + 0.3)
        moon = math.sin(x * 15 + 3.1) * math.sin(y * 14 + 0.4) * math.sin(z * 16 + 2.2)
        if star > 0.78 or moon > 0.90:
            return gold_col
        return col

    # 顔の島を材質スロット1へ切り出す(ガルドと同じ「テクスチャの状態
    # アトラス」の下ごしらえ。organic_uvのboostで独立島にしてある前提)
    face_polys = C.split_material_region(body, OONEBOSUKE_FACE_C, OONEBOSUKE_FACE_R,
                                         max_y=OONEBOSUKE_FACE_MAX_Y)
    if not face_polys:
        raise RuntimeError("おおねぼすけの顔の島を切り出せなかった")

    # 状態によって顔の色が変わることを組み立て時に確かめる(ガルドの
    # build_garudo()と同じ理由: デカールの状態切り替えが効いていないと、
    # 見た目は正常なのにまばたきだけ静かに止まる)。目だけでなく口の
    # 状態切り替え(_mouth)も同じ事故が起きうるので別々に確かめる
    probe_n = Vector((0.0, -1.0, 0.0))
    eye_probe = Vector((0.090, -0.19, 0.505))
    assert skin_color(eye_probe, probe_n, 0) != skin_color(eye_probe, probe_n, 4), \
        "目の位置で closed と open の色が同じ(まばたきが効かない)"
    murmur_probe = Vector((0.0, -0.19, 0.44))
    assert skin_color(murmur_probe, probe_n, 0) != skin_color(murmur_probe, probe_n, 1), \
        "口の位置で通常とむにゃむにゃの色が同じ(表情が効いていない)"
    yawn_probe = Vector((0.0, -0.19, 0.337))
    assert skin_color(yawn_probe, probe_n, 0) != skin_color(yawn_probe, probe_n, 3), \
        "口の位置で通常とあくびの色が同じ(表情が効いていない)"

    skin_img = C.bake_albedo(body, lambda p, n: skin_color(p, n, 0), size=512,
                             name="oonebosuke_skin", material_index=0)
    face_tiles = [C.bake_albedo(body, (lambda k: lambda p, n: skin_color(p, n, k))(k),
                                size=OONEBOSUKE_FACE_TEX, name=f"oonebosuke_face_{st}",
                                material_index=1)
                  for k, st in enumerate(OONEBOSUKE_EXPR_STATES)]
    face_img = C.atlas_horizontal(face_tiles, "oonebosuke_face_atlas")
    # 顔の島のUVを左端のコマへ詰める。実行時はoffset.xに k/3 を足すだけで
    # 状態が切り替わる(three.jsは uv*repeat + offset。ガルドと同じ)
    uv = body.data.uv_layers.active.data
    for poly in body.data.polygons:
        if poly.material_index == 1:
            for li in poly.loop_indices:
                uv[li].uv[0] /= len(OONEBOSUKE_EXPR_STATES)
    body.data.materials[0] = C.make_textured_material("oonebosuke_skin_m", skin_img,
                                                      roughness=0.75)
    body.data.materials[1] = C.make_textured_material("oonebosuke_face", face_img,
                                                      roughness=0.75)
    # まばたきの指定はノードのextrasで運ぶ(src/view/blink.ts)
    body["blink"] = "eyelid"
    body["blinkTiles"] = len(OONEBOSUKE_EXPR_STATES)
    body["blinkMaterial"] = "oonebosuke_face"

    for i, arm in enumerate(arm_extras):
        arm_img = C.bake_albedo(arm, skin_color, size=128, name=f"oonebosuke_arm_tex{i}")
        C.assign_material(arm, C.make_textured_material(f"oonebosuke_arm_m{i}", arm_img,
                                                        roughness=0.78))

    extras = list(arm_extras)
    cap_mat = C.make_material("oonebosuke_cap", robe_col, roughness=0.8)
    pom_mat = C.make_material("oonebosuke_pom_m", (0.80, 0.75, 0.84), roughness=0.85)
    hair_mat = C.make_material("oonebosuke_hair", (0.30, 0.26, 0.36), roughness=0.75)
    gold = C.make_material("oonebosuke_gold", gold_col, roughness=0.4, emission=0.15)

    # 帽子: 頭を覆う円錐(ロフト、z単調増加でしか組めない)。旧版は
    # 頬のリング(z=0.565)から間を置かず帽子を始めていて、眉のテクスチャ
    # (z=0.573)が帽子の縁(z=0.560〜0.592)と丸ごと重なり、「眉が縁に
    # 埋もれて潰れて見える」事故になっていた。頭のロフトに額のリング
    # (z=0.605)を足したので、帽子もそのぶん上げて額の余白を作る
    cap = C.loft("oonebosuke_capm", [
        (0.615, 0.222, 0.207, 0.0, -0.045),
        (0.660, 0.205, 0.195, 0.0, -0.035),
        (0.705, 0.155, 0.145, 0.0, -0.015),
        (0.745, 0.105, 0.098, 0.0, 0.005),
        (0.780, 0.050, 0.046, 0.0, 0.012),
    ], segments=22)
    C.assign_material(cap, cap_mat)
    extras.append(cap)
    brim = C.loft("oonebosuke_brim", [
        (0.598, 0.226, 0.211, 0.0, -0.045),
        (0.614, 0.232, 0.217, 0.0, -0.045),
        (0.630, 0.222, 0.207, 0.0, -0.045),
    ], segments=22)
    brim_col = tuple(min(1.0, c + 0.16) for c in robe_col)  # 帽子の折り返し(設定画は金ではなく明るい紫)
    C.assign_material(brim, C.make_material("oonebosuke_brim", brim_col, roughness=0.7))
    extras.append(brim)

    # 帽子の垂れ: 円錐の先端から肩を越えて腰の高さまで這わせる
    # (curve_tubeは任意の経路を辿れるので、頭頂で一度盛り上がってから
    # 下がる形が作れる。ロフトのz単調増加ではこの形は組めない)
    tail = C.curve_tube("oonebosuke_captail",
                        [Vector((0.0, 0.0, 0.780)),
                         Vector((-0.13, 0.05, 0.750)),
                         Vector((-0.26, 0.13, 0.650)),
                         Vector((-0.34, 0.22, 0.510)),
                         Vector((-0.36, 0.28, 0.380))],
                        [0.048, 0.045, 0.038, 0.028, 0.018])
    C.assign_material(tail, cap_mat)
    extras.append(tail)
    pom = C.uv_sphere("oonebosuke_pom", (-0.365, 0.29, 0.355), 0.050,
                      segments=12, rings=9)
    C.assign_material(pom, pom_mat)
    extras.append(pom)

    # 帽子の飾り: 金の三日月(カーブの弧)と星(小さな金の粒)
    moon = C.curve_tube("oonebosuke_moon",
                        [Vector((-0.10, -0.190, 0.710)),
                         Vector((-0.055, -0.210, 0.725)),
                         Vector((-0.015, -0.200, 0.738))],
                        [0.006, 0.011, 0.006])
    C.assign_material(moon, gold)
    extras.append(moon)
    for si2, (sx, sy, sz) in enumerate([(0.09, -0.205, 0.710),
                                        (0.02, -0.235, 0.675),
                                        (0.15, -0.165, 0.675)]):
        star = C.uv_sphere(f"oonebosuke_star{si2}", (sx, sy, sz), 0.014,
                           segments=8, rings=6, scale=(1.0, 0.5, 1.0))
        C.assign_material(star, gold)
        extras.append(star)

    # 帽子の縁から覗く乱れた髪(前髪の房+耳の上の房)。額のリング
    # (z=0.605)を基準に、帽子が始まる直前の高さから生やす
    def head_front_y(x: float, rx: float, ry: float, cy: float) -> float:
        t = max(0.0, 1.0 - (x / rx) ** 2)
        return cy - ry * math.sqrt(t)

    for hx in (-0.16, -0.05, 0.10):
        y0 = head_front_y(hx, 0.215, 0.200, -0.045)
        lock = C.curve_tube(f"oonebosuke_bang{hx}",
                            [Vector((hx, y0 - 0.004, 0.607)),
                             Vector((hx * 1.05, y0 - 0.018, 0.593)),
                             Vector((hx * 1.10, y0 - 0.010, 0.581))],
                            [0.016, 0.011, 0.004])
        C.assign_material(lock, hair_mat)
        extras.append(lock)
    for side in (-1.0, 1.0):
        tuft = C.curve_tube(f"oonebosuke_tuft{side}",
                            [Vector((0.185 * side, -0.06, 0.585)),
                             Vector((0.210 * side, -0.03, 0.545)),
                             Vector((0.215 * side, -0.01, 0.510))],
                            [0.020, 0.014, 0.005])
        C.assign_material(tuft, hair_mat)
        extras.append(tuft)

    # 鼻ちょうちん: 半透明の泡(purunで確立したalpha手法)+光の粒。
    # いびきに合わせて膨張・収縮させるため本体には結合せず、専用の
    # 泡ボーン(鼻先bubble0を支点にbubbleへ伸びる)へ剛体で親子付けし、
    # アニメーション側でボーンのスケールをキーする
    bubble_mat = C.make_material("oonebosuke_bubble", (0.78, 0.88, 0.97),
                                 roughness=0.1, alpha=0.4)
    bubble_parts = []
    bubble = C.uv_sphere("oonebosuke_bubble", (0.118, -0.330, 0.503), 0.060,
                         segments=14, rings=10)
    C.assign_material(bubble, bubble_mat)
    bubble_parts.append(bubble)
    stem = C.uv_sphere("oonebosuke_bubble_stem", (0.050, -0.312, 0.467), 0.02,
                       segments=8, rings=6)
    C.assign_material(stem, bubble_mat)
    bubble_parts.append(stem)
    gleam = C.uv_sphere("oonebosuke_bubble_gleam", (0.110, -0.378, 0.507), 0.012,
                        segments=8, rings=6)
    C.assign_material(gleam, C.make_material("oonebosuke_bubble_gleam_m",
                                             (1.0, 1.0, 1.0), roughness=0.1,
                                             emission=0.6))
    bubble_parts.append(gleam)

    mesh = C.join([body] + extras, "oonebosuke")
    arm_joints = dict(OONEBOSUKE_JOINTS)
    arm_joints["bubble0"] = (0.050, -0.312, 0.467)   # 鼻先(膨張の支点)
    arm_joints["bubble"] = (0.118, -0.342, 0.503)    # 泡の中心方向
    arm_bones = list(OONEBOSUKE_BONES) + [("top", "bubble0"),
                                          ("bubble0", "bubble")]
    armature = C.build_armature("oonebosuke", arm_joints, arm_bones, mesh,
                                root="base")
    # 泡ボーンの重みが体表(顔)に混ざるとバブルの膨張で顔が歪むため、
    # 本体メッシュからは泡ボーンの頂点グループを取り除く
    for vg_name in ("top-bubble0", "bubble0-bubble"):
        vg = mesh.vertex_groups.get(vg_name)
        if vg is not None:
            mesh.vertex_groups.remove(vg)
    _fix_orphan_weights(mesh, OONEBOSUKE_JOINTS, OONEBOSUKE_BONES)
    for part in bubble_parts:
        C.parent_to_bone(part, armature, "bubble0-bubble")
    return [mesh, armature] + bubble_parts, armature


def oonebosuke_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・行き過ぎ・二次揺れ・die跳ね返りを足してある。
    骨2本(lower/upper)のみのため、追加ボーンの二次揺れは組めず、upperを
    lowerより2フレーム遅らせる形で眠たげな二次揺れを表現した。
    """
    lower, upper = "base-mid", "mid-top"
    bubble = "bubble0-bubble"
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # ほとんど動かず、寝息だけのわずかな上下。upper(上半身)がlower
        # より2フレーム遅れて追従する眠たげな二次揺れを追加。
        # 鼻ちょうちんは寝息に合わせて大きく膨らみ、すっとしぼむ
        ("idle", [
            (1, {lower: neutral, upper: neutral, bubble: {"scale": (0.8, 0.8, 0.8)}}),
            (36, {lower: {"scale": (1.03, 0.97, 1.03)},
                  bubble: {"scale": (1.3, 1.3, 1.3)}}),
            (38, {upper: {"scale": (0.98, 1.03, 0.98)}}, {"partial": True}),
            (46, {bubble: {"scale": (1.36, 1.36, 1.36)}}, {"partial": True}),
            (54, {bubble: {"scale": (0.82, 0.82, 0.82)}}, {"partial": True}),
            (72, {lower: neutral, upper: neutral, bubble: {"scale": (0.8, 0.8, 0.8)}}),
        ]),
        # 重い図体を引きずるように、のっそりと進む
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (10, {lower: {"scale": (1.16, 0.82, 1.16)}, upper: {"scale": (0.90, 1.14, 0.90)}}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # 眠気を振り払うように、がっしりした体格から正面へ叩きつける。
        # タメ(1→7、lowerのsquash量をさらに強めてボスらしい重さを出す)→
        # 緩やかな加速(7→10)→LINEARで鋭い打ち込み(10→14)→行き過ぎ
        # (14→16、upperのlocをわずかに残す)→戻り(16→24)に整理
        ("attack", [
            (1, {lower: neutral, upper: neutral, bubble: {"scale": (0.9, 0.9, 0.9)}}),
            (7, {lower: {"scale": (1.28, 0.66, 1.28)}, upper: {"scale": (0.82, 1.24, 0.82), "loc": (0, -0.05, 0)},
                 bubble: {"scale": (1.3, 1.3, 1.3)}}),
            (10, {lower: {"scale": (1.065, 0.97, 1.065)}, upper: {"scale": (1.03, 1.01, 1.03), "loc": (0, 0.035, 0)}},
             {"interp": "LINEAR"}),
            (14, {lower: {"scale": (0.85, 1.28, 0.85)}, upper: {"scale": (1.24, 0.78, 1.24), "loc": (0, 0.12, 0)},
                  bubble: {"scale": (0.4, 0.4, 0.4)}}),
            (16, {upper: {"loc": (0, 0.16, 0)}}, {"partial": True}),
            (24, {lower: neutral, upper: neutral, bubble: {"scale": (0.9, 0.9, 0.9)}}),
        ]),
        # 入りをLINEARで鋭くする。ボスなので振幅は現行どおり中程度に保ち、
        # 戻り(4f→14f)はゆっくりのまま
        ("hit", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (4, {lower: {"scale": (1.28, 0.68, 1.28)}, upper: {"scale": (0.84, 1.20, 0.84)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # 初動をLINEARで鋭くし、「眠気が抜ける」崩れ始めを表現。24fで
        # 潰れきったあとにわずかな揺り戻しを追加
        ("die", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (10, {lower: {"scale": (1.4, 0.45, 1.4)}, upper: {"scale": (1.3, 0.5, 1.3)}}),
            (24, {lower: {"scale": (1.55, 0.05, 1.55)}, upper: {"scale": (1.45, 0.07, 1.45)}}),
            (28, {lower: {"scale": (1.48, 0.10, 1.48)}, upper: {"scale": (1.38, 0.12, 1.38)}}, {"partial": True}),
        ]),
    ]


# ======================================================================= すべてのぷるん

SUBETENOPURUN_JOINTS = {
    "base": (0.0, 0.0, 0.096),
    "mid": (0.0, 0.0, 0.24),
    "top": (0.0, 0.0, 0.396),
}
SUBETENOPURUN_RADII = {"base": 0.348, "mid": 0.30, "top": 0.108}
SUBETENOPURUN_BONES = [("base", "mid"), ("mid", "top")]


def build_subetenopurun():
    """
    全地方の記憶が混ざり合ったぷるん。purunと同じ縦2本の骨組みを
    そのまま流用し、全体をおよそ1.2倍に拡大してがっしりした力強い
    シルエットにする。第一〜第七地方それぞれの色を、角度で不揃いに
    区切った継ぎ接ぎ模様として体にまとわせ、統一感のない配色にする。
    まどろみの余韻の名残として、目はわずかに眠たげにする。
    """
    body = C.build_skinned("subetenopurun", SUBETENOPURUN_JOINTS, SUBETENOPURUN_BONES,
                           SUBETENOPURUN_RADII, root="base", subsurf=3)
    for vert in body.data.vertices:
        if vert.co.z < 0.024:
            vert.co.z = 0.024 - (0.024 - vert.co.z) * 0.25

    # 第一〜第七地方それぞれの配色を継ぎ接ぎにする
    region_mats = [
        C.make_material("subete_r1", (0.72, 0.62, 0.48), roughness=0.7),   # 第1: うたたねの参道
        C.make_material("subete_r2", (0.40, 0.52, 0.54), roughness=0.6),   # 第2: 忘れ潮の湿地
        C.make_material("subete_r3", (0.46, 0.30, 0.24), roughness=0.6),   # 第3: まどろみの茸林
        C.make_material("subete_r4", (0.74, 0.70, 0.62), roughness=0.65),  # 第4: 骨積みの回廊
        C.make_material("subete_r5", (0.22, 0.26, 0.42), roughness=0.55), # 第5: なみだの滝つぼ
        C.make_material("subete_r6", (0.58, 0.48, 0.34), roughness=0.7),  # 第6: こだまの尾根
        C.make_material("subete_r7", (0.54, 0.20, 0.18), roughness=0.55), # 第7: 忘れられた祭りの跡
    ]
    bounds = [0.0, 45.0, 95.0, 130.0, 190.0, 235.0, 300.0, 360.0]

    def classify(c):
        deg = math.degrees(math.atan2(c.y, c.x)) % 360.0
        for i in range(7):
            if bounds[i] <= deg < bounds[i + 1]:
                return i
        return 6

    C.assign_materials_by_region(body, region_mats, classify)

    extras = []
    for side in (-1.0, 1.0):
        # まどろみの余韻の名残で、わずかに眠たげな目
        extras += eyeball(f"subete_eye{side}", (0.102 * side, -0.235, 0.310), 0.065,
                          look=(0.15 * side, -1.0, 0.0), squash=0.75)
    mouth = C.uv_sphere("subete_mouth", (0.0, -0.274, 0.190), 0.058,
                        segments=14, rings=10, scale=(1.5, 0.5, 0.65))
    C.assign_material(mouth, C.make_material("subete_mouth_m", (0.10, 0.10, 0.14), roughness=0.3))
    extras.append(mouth)

    # ぷるんの結晶の芯(plan/models/archive/sheet-purun.md)を、全地方の色を
    # 帯びた多面体に拡大したもの(plan/models/archive/sheet-subetenopurun.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # common.gemを一回り大きく、6地方の色で塗り分ける
    gem_mats = [
        C.make_material("subete_gem1", (0.72, 0.62, 0.48), roughness=0.2, emission=0.12),
        C.make_material("subete_gem2", (0.40, 0.52, 0.54), roughness=0.2, emission=0.12),
        C.make_material("subete_gem3", (0.46, 0.30, 0.24), roughness=0.2, emission=0.12),
        C.make_material("subete_gem4", (0.74, 0.70, 0.62), roughness=0.2, emission=0.12),
        C.make_material("subete_gem5", (0.22, 0.26, 0.42), roughness=0.2, emission=0.12),
        C.make_material("subete_gem6", (0.58, 0.48, 0.34), roughness=0.2, emission=0.12),
    ]
    gem = C.gem("subete_gem", (0.0, 0.185, 0.360), 0.078, subdivisions=1)
    C.assign_materials_by_region(
        gem, gem_mats,
        lambda c: min(5, int((math.degrees(math.atan2(c.z, c.x)) % 360.0) / 60.0)),
    )
    extras.append(gem)

    mesh = C.join([body] + extras, "subetenopurun")
    armature = C.build_armature("subetenopurun", C.mirrored(SUBETENOPURUN_JOINTS),
                                SUBETENOPURUN_BONES, mesh, root="base")
    return [mesh, armature], armature


def subetenopurun_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・upperの遅れ追従(二次揺れ)を足してある。
    全地方の記憶が混ざり合った集大成という設定を汲み、パイロットの
    purun/shioresakuraよりわずかに力強く・重みのある緩急にする。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 継ぎ接ぎ模様の体表が波打つように、upperがlowerより2フレーム
        # 遅れて揺れる(二次揺れ)
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (24, {lower: {"scale": (1.03, 0.96, 1.03)}}),
            (26, {upper: {"scale": (0.97, 1.04, 0.97)}}, {"partial": True}),
            (48, {lower: neutral}),
            (50, {upper: neutral}, {"partial": True}),
        ]),
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}, upper: squash}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # 瀕死になるほど攻撃力が増す性質も併せ持つため、タメの後にLINEARで
        # 鋭く力強く踏み込んで叩きつけ、わずかに行き過ぎてから戻る
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (5, {lower: squash, upper: stretch}, {"interp": "LINEAR"}),
            (10, {lower: {"scale": (0.82, 1.32, 0.82), "loc": (0, 0.08, 0)}, upper: {"scale": (1.20, 0.80, 1.20)}}),
            (13, {lower: {"scale": (0.82, 1.32, 0.82), "loc": (0, 0.08, 0)}, upper: {"scale": (1.26, 0.74, 1.26)}}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # 入りだけLINEARで鋭くする。エリート個体として振幅・戻り時間は
        # 現行のまま維持する(小さく速いbossほどは絞らない)
        ("hit", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (4, {lower: {"scale": (1.3, 0.66, 1.3)}, upper: {"scale": (0.88, 1.16, 0.88)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # 初動をLINEARで鋭くし「体がびくっと縮む」瞬間を加える。24f到達後、
        # わずかに揺り戻る跳ね返りを追加
        ("die", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (10, {lower: {"scale": (1.4, 0.45, 1.4)}, upper: {"scale": (1.3, 0.5, 1.3)}}),
            (24, {lower: {"scale": (1.55, 0.05, 1.55)}, upper: {"scale": (1.45, 0.07, 1.45)}}),
            (28, {lower: {"scale": (1.48, 0.10, 1.48)}, upper: {"scale": (1.38, 0.12, 1.38)}}, {"partial": True}),
        ]),
    ]


# ================================================================= ホネヅカのつかい

TSUKAI_JOINTS = {
    "root": (0.0, 0.0, 0.025),
    "stem": (0.0, 0.0, 0.105),
    "capbase": (0.0, 0.0, 0.195),
    "captop": (0.0, 0.0, 0.275),
}
TSUKAI_RADII = {"root": 0.052, "stem": 0.040, "capbase": 0.118, "captop": 0.028}
TSUKAI_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_honezukanotsukai():
    """
    ホネヅカのぬしに仕える小さな使い。madoromiと同じ関節構成(root-stem-
    capbase-captop)をベースに、傘ではなく積み重なった椎骨と頭骨を持つ姿にする。
    オイテケボシと同じく満腹度を削るが、忠実な分だけ間合いが近い(range 2)ため、
    口先から突き出た管状の器官を強調し、獲物のすぐそばまで寄って吐きかける
    「発射器官」であることを見た目で示す。配色は第四地方(骨積みの回廊)の
    白骨色・くすんだ灰色。目はぬしに仕える者らしく、感情のない冷たい薄青の光。
    """
    body = C.build_skinned("honezukanotsukai", TSUKAI_JOINTS, TSUKAI_BONES,
                           TSUKAI_RADII, root="root", subsurf=2)
    bone = C.make_material("tsukai_bone", (0.87, 0.85, 0.76), roughness=0.68)
    ash = C.make_material("tsukai_ash", (0.44, 0.44, 0.46), roughness=0.72)
    C.assign_materials_by_region(body, [bone, ash], lambda c: 1 if c.z > 0.235 else 0)

    extras = []
    # 積み重なった椎骨を思わせる、幹に食い込んだ骨の輪
    ring_mat = C.make_material("tsukai_ring", (0.80, 0.77, 0.68), roughness=0.72)
    for i, (z, r) in enumerate([(0.045, 0.050), (0.078, 0.044)]):
        ring = C.cylinder(f"tsukai_ring{i}", (0.0, 0.0, z), r, 0.013, segments=16)
        C.assign_material(ring, ring_mat)
        extras.append(ring)

    # 頭骨の両脇に突き出た、積みきれずにはみ出した肋骨の欠片
    for side in (-1.0, 1.0):
        rib = C.cone(f"tsukai_rib{side}", (0.095 * side, 0.0, 0.155), 0.020, 0.004, 0.075)
        C.assign_material(rib, ash)
        extras.append(rib)

    # 眼窩と、ぬしに仕える者らしい冷たい薄青の光
    socket_mat = C.make_material("tsukai_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("tsukai_glow", (0.55, 0.72, 0.85), roughness=0.25, emission=2.2)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"tsukai_socket{side}", (0.048 * side, -0.088, 0.225), 0.030,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.1))
        C.assign_material(socket, socket_mat)
        extras.append(socket)
        glow = C.uv_sphere(f"tsukai_glow{side}", (0.048 * side, -0.096, 0.225), 0.013,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)

    # 顎と、満腹度を吸い出して吐きかけるための管状の発射口
    mouth_mat = C.make_material("tsukai_mouth", (0.10, 0.09, 0.11), roughness=0.4)
    jaw = C.uv_sphere("tsukai_jaw", (0.0, -0.108, 0.175), 0.034,
                      segments=14, rings=10, scale=(1.0, 0.55, 0.6))
    C.assign_material(jaw, mouth_mat)
    extras.append(jaw)
    snout = C.cylinder("tsukai_snout", (0.0, -0.155, 0.175), 0.022, 0.09,
                       segments=14, axis="Y")
    C.assign_material(snout, ash)
    extras.append(snout)
    nozzle = C.uv_sphere("tsukai_nozzle", (0.0, -0.196, 0.175), 0.020,
                         segments=12, rings=8, scale=(0.8, 0.6, 0.8))
    C.assign_material(nozzle, mouth_mat)
    extras.append(nozzle)

    # 頭骨の天辺に刺さった、割れた骨片の冠
    shard_mat = C.make_material("tsukai_shard", (0.78, 0.75, 0.66), roughness=0.7)
    for i, angle_deg in enumerate([0.0, 120.0, 240.0]):
        angle = math.radians(angle_deg)
        px, py = math.cos(angle) * 0.035, math.sin(angle) * 0.035
        shard = C.cone(f"tsukai_shard{i}", (px, py, 0.290), 0.014, 0.002, 0.05)
        C.assign_material(shard, shard_mat)
        extras.append(shard)

    mesh = C.join([body] + extras, "honezukanotsukai")
    armature = C.build_armature("honezukanotsukai", TSUKAI_JOINTS, TSUKAI_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def honezukanotsukai_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・発射口の遅れ追従(二次揺れ)を足してある。
    「ぬしに仕える者」らしく取り乱さない読み味を保ちつつ、間合いの近い
    俊敏さを表すためattackのフレーム間隔は詰めたまま短く行き過ぎを挟む。
    """
    lower, upper = "root-stem", "stem-capbase"
    top = "capbase-captop"
    return [
        # ぬしの言いつけを待つように、わずかに揺れながら浮く。
        # 発射口(top)がupperより2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {lower: (0, 0, 0), upper: (0, 0, 0), top: (0, 0, 0)}),
            (24, {lower: (2, 0, 1.5), upper: (-2, 0, 0)}),
            (26, {top: (1.5, 0, 0)}, {"partial": True}),
            (48, {lower: (0, 0, 0), upper: (0, 0, 0)}),
            (50, {top: (0, 0, 0)}, {"partial": True}),
        ]),
        ("walk", [
            (1, {lower: (0, 0, -7), upper: (0, 0, 5)}),
            (9, {lower: (4, 0, 0), upper: (-3, 0, 0)}),
            (18, {lower: (0, 0, 7), upper: (0, 0, -5)}),
            (27, {lower: (4, 0, 0), upper: (-3, 0, 0)}),
            (36, {lower: (0, 0, -7), upper: (0, 0, 5)}),
        ]),
        # 間合いが近い分、素早く身を乗り出してLINEARで鋭く発射口を突きつけ、
        # 短い行き過ぎを挟んでから戻る
        ("attack", [
            (1, {upper: (0, 0, 0), top: (0, 0, 0)}),
            (4, {upper: (-10, 0, 0), top: (-8, 0, 0)}, {"interp": "LINEAR"}),
            (8, {upper: (26, 0, 0), top: (22, 0, 0)}),
            (10, {upper: (30, 0, 0), top: (25, 0, 0)}),
            (16, {upper: (0, 0, 0), top: (0, 0, 0)}),
        ]),
        # 「ぬしに仕える者」らしく取り乱さない。入りだけLINEARで鋭くし、
        # 戻りはguard系より短くせず淡々と持ち場へ戻る
        ("hit", [
            (1, {lower: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {lower: (-14, 0, 0), upper: (-12, 0, 0)}),
            (14, {lower: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 積まれていた骨がほどけるように、崩れ落ちて元の骨積みに還る。
        # 初動をLINEARで鋭くし、24f到達後にほどけた骨が一度小さく
        # 弾んでから完全に崩れ落ちる
        ("die", [
            (1, {lower: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {lower: (-26, 0, 8), upper: (-30, 0, 0)}),
            (24, {lower: (-70, 0, 18), upper: (-58, 0, 0), top: (-20, 0, 0)}),
            (28, {lower: (-63, 0, 16), upper: (-52, 0, 0), top: (-18, 0, 0)}),
        ]),
    ]


# =================================================================== はじめの夢

# 第八地方(真の目覚め)・隠し最終局面のボス。ヨリシロがこの世で
# いちばん最初に見た夢そのものが、ひとり分の姿を取ったもの。計画書の
# 指示どおりmadoromiと同じ関節構成(root-stem-capbase-captop)をそのまま
# 流用し、melee AIの主力にふさわしく、がっしりした体格で正面から迫る
# 力強いシルエットに育てる(幹・傘の半径をmadoromiより太く保ち、先細り
# を抑える)。「他のすべての夢のかけらは、この最初の夢から枝分かれして
# 生まれた」という由来を、傘の色を第一〜第七地方の代表色を淡くしたもの
# で7分割する放射状のパッチワーク(角度で塗り分け。yorishironozankyoの
# 高さ帯とは違う手法にする)と、傘の各色分割ぶんに1本ずつ生える小さな
# 芽のような突起(枝分かれの予感)で視覚化する。幹はどの地方の色にも
# 染まっていない生成り色のまま残し、「まだ何も分かれていない起点」を
# 表す。
HAJIME_NO_YUME_JOINTS = {
    "root": (0.0, 0.0, 0.10),
    "stem": (0.0, 0.0, 0.42),
    "capbase": (0.0, 0.0, 0.64),
    "captop": (0.0, 0.0, 0.88),
}
HAJIME_NO_YUME_RADII = {"root": 0.190, "stem": 0.170, "capbase": 0.440, "captop": 0.090}
HAJIME_NO_YUME_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def hajimeNoYume_cap_surface_z(dist: float) -> float:
    """
    傘(capbase→captop)の表面の高さ。madoromiのcap_surface_z()と同じ考え方で、
    capbase(半径0.440)からcaptop(半径0.090)へ向かう円錐を、サブディビジョンで
    丸まるぶん少し内側に見積もって近似する。
    """
    base_z = HAJIME_NO_YUME_JOINTS["capbase"][2]
    top_z = HAJIME_NO_YUME_JOINTS["captop"][2]
    base_r = HAJIME_NO_YUME_RADII["capbase"] * 0.86
    top_r = HAJIME_NO_YUME_RADII["captop"]
    t = min(1.0, max(0.0, (base_r - dist) / (base_r - top_r)))
    return base_z + t * (top_z - base_z) - 0.014


def build_hajimeNoYume():
    """
    はじめの夢。madoromiと同じ関節構成(root-stem-capbase-captop)を
    流用しつつ、melee AIにふさわしいがっしりした体格に育てる(幹の
    半径を根元に近い太さのまま保ち、先細りを抑えて正面から迫る力強い
    シルエットにする)。配色は第一〜第七地方の代表色を淡くしたものを
    傘に放射状のパッチワークとして配置し(角度で塗り分け、
    「統一感のない配色」を表す)、幹はどの地方色にも染まっていない
    生成り色のまま残す。傘の色分割ぶんに1本ずつ、枝分かれの予感を示す
    小さな芽を生やす。
    """
    body = C.build_skinned("hajimeNoYume", HAJIME_NO_YUME_JOINTS, HAJIME_NO_YUME_BONES,
                           HAJIME_NO_YUME_RADII, root="root", subsurf=2)

    origin_mat = C.make_material("hajime_origin", (0.92, 0.90, 0.83), roughness=0.7)
    region_colors = [
        (0.66, 0.80, 0.90),  # 第一地方 うたたねの参道(淡い空色)
        (0.68, 0.78, 0.60),  # 第二地方 忘れ潮の湿地(淡い緑)
        (0.80, 0.62, 0.70),  # 第三地方 まどろみの茸林(淡い紅紫)
        (0.78, 0.76, 0.70),  # 第四地方 骨積みの回廊(淡い白骨色)
        (0.62, 0.66, 0.74),  # 第五地方 なみだの滝つぼ(淡い青灰)
        (0.74, 0.68, 0.58),  # 第六地方 こだまの尾根(淡い土色)
        (0.80, 0.60, 0.52),  # 第七地方 わすれられた祭りの跡(淡い紅)
    ]
    region_mats = [C.make_material(f"hajime_region{i}", c, roughness=0.6)
                   for i, c in enumerate(region_colors)]

    STEM_TOP_Z = 0.50

    def classify(c):
        if c.z < STEM_TOP_Z:
            return 0
        ang = (math.atan2(c.y, c.x) + math.pi) % (2 * math.pi)
        idx = min(6, int(ang / (2 * math.pi) * 7))
        return 1 + idx

    C.assign_materials_by_region(body, [origin_mat] + region_mats, classify)
    counts = [0] * 8
    for poly in body.data.polygons:
        counts[poly.material_index] += 1
    total = sum(counts)
    print(f"hajimeNoYume: 生成り{counts[0]} 地方色{counts[1:]} / 計{total}")

    extras = []
    # 顔。madoromiの半開きの眠たげな目とは違い、すべての夢の起点となる
    # 存在として、しっかり見開いた目にする
    for side in (-1.0, 1.0):
        extras += eyeball(f"hajime_eye{side}", (0.105 * side, -0.168, 0.320), 0.052,
                          look=(0.2 * side, -1.0, 0.05))
    mouth = C.box("hajime_mouth", (0.0, -0.178, 0.250), (0.052, 0.014, 0.014), bevel=0.005)
    C.assign_material(mouth, C.make_material("hajime_mouth_m", (0.30, 0.22, 0.22), roughness=0.5))
    extras.append(mouth)

    # 傘の色分割ぶんに1本ずつ生やす、枝分かれの予感を示す小さな芽。
    # cone()はZ軸沿いにしか作れないため、位置をドームの曲面に沿わせて
    # 真上に伸ばすだけにする(yamabikooniの角と同じ手法)
    bud_mat = C.make_material("hajime_bud", (0.88, 0.84, 0.72), roughness=0.55)
    for i, (angle_deg, dist, length) in enumerate([
        (206.0, 0.16, 0.075), (257.0, 0.24, 0.060), (309.0, 0.10, 0.085),
        (0.0, 0.20, 0.065), (51.0, 0.28, 0.055), (103.0, 0.14, 0.080),
        (154.0, 0.22, 0.070),
    ]):
        angle = math.radians(angle_deg)
        x, y = math.cos(angle) * dist, math.sin(angle) * dist
        z = hajimeNoYume_cap_surface_z(dist)
        bud = C.cone(f"hajime_bud{i}", (x, y, z), 0.020, 0.006, length, segments=8)
        C.assign_material(bud, bud_mat)
        extras.append(bud)

    # 根元に絡む、がっしりした根の塊。melee AIらしい正面から迫る
    # どっしりした構えを土台から支える(左右対称にはせず、あえて
    # 不揃いな間隔で配置して「統一感のない」印象を根元にも残す)
    root_mat = C.make_material("hajime_root", (0.60, 0.56, 0.46), roughness=0.85)
    for angle_deg, dist, r in [
        (20.0, 0.175, 0.075), (95.0, 0.180, 0.068), (160.0, 0.170, 0.072),
        (215.0, 0.178, 0.066), (290.0, 0.172, 0.070),
    ]:
        angle = math.radians(angle_deg)
        knob = C.uv_sphere(f"hajime_rootknob{int(angle_deg)}",
                           (math.cos(angle) * dist, math.sin(angle) * dist, 0.035),
                           r, segments=12, rings=8, scale=(1.0, 1.0, 0.55))
        C.assign_material(knob, root_mat)
        extras.append(knob)

    mesh = C.join([body] + extras, "hajimeNoYume")
    armature = C.build_armature("hajimeNoYume", HAJIME_NO_YUME_JOINTS, HAJIME_NO_YUME_BONES,
                                mesh, root="root")
    return [mesh, armature], armature


def hajimeNoYume_animations():
    """
    plan/models/archive/model-hajimeNoYume-remake.mdの規約に沿って、attackに
    タメ→ツメ(LINEAR)→行き過ぎ→戻りの4段構成、hit/dieの入りにLINEARの鋭さ、
    idleにupperが2フレーム遅れて追従する二次揺れ(madoromiファミリー共通の
    幹→傘の構造を利用)を足した。第八地方・隠し最終局面のボスらしい
    最重量級のがっしりした挙動を保つため、hitの振幅はhonezukaNoNushiに
    倣ってやや抑え、walkは脚を持たない構造上ひねり歩行のリズムのまま維持する。
    """
    lower, mid, upper = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # あらゆる夢の起点として、静かに、しかし途方もない存在感で佇む。
        # upperは2フレーム遅れて追従し、幹の動きに傘が少し遅れてついてくる
        ("idle", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (30, {lower: (2, 0, 1), mid: (-3, 0, 1)}),
            (32, {upper: (2, 0, 0)}, {"partial": True}),
            (60, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        ("walk", [
            (1, {lower: (0, 0, -10), mid: (0, 0, 8), upper: (0, 0, -4)}),
            (9, {lower: (7, 0, 0), mid: (-6, 0, 0)}),
            (18, {lower: (0, 0, 10), mid: (0, 0, -8), upper: (0, 0, 4)}),
            (27, {lower: (7, 0, 0), mid: (-6, 0, 0)}),
            (36, {lower: (0, 0, -10), mid: (0, 0, 8), upper: (0, 0, -4)}),
        ]),
        # がっしりした幹全体をひねり込み、正面から重くのしかかる一撃。
        # タメ(1→6)→ツメ(6→11、LINEARで鋭く)→行き過ぎ(11→15、振り込み
        # すぎた余韻)→戻り(15→26)の4段構成
        ("attack", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0), upper: (0, 0, 0)}),
            (6, {lower: (-18, 0, 0), mid: (-20, 0, 0), upper: (-14, 0, 0)}, {"interp": "LINEAR"}),
            (11, {lower: (26, 0, 0), mid: (30, 0, 0), upper: (22, 0, 0)}),
            (15, {lower: (34, 0, 0), mid: (39, 0, 0), upper: (29, 0, 0)}),
            (26, {lower: (0, 0, 0), mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 入り(1→4)をLINEARで鋭く。最重量級のボスらしく、honezukaNoNushiに
        # 倣って振幅は現行よりやや抑える
        ("hit", [
            (1, {lower: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {lower: (-16, 0, 0), mid: (-15, 0, 0)}),
            (16, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # 最初の夢が解けるように、巨体がゆっくり大きく崩れ落ちる。
        # 倒れ始め(1→12)をLINEARで鋭くし、着地後に小さな跳ね返りを1回だけ足す
        ("die", [
            (1, {lower: (0, 0, 0)}, {"interp": "LINEAR"}),
            (12, {lower: (-38, 0, 12), mid: (-24, 0, 0), upper: (-16, 0, 0)}),
            (30, {lower: (-92, 0, 26), mid: (-40, 0, 0), upper: (-28, 0, 0)}),
            (36, {lower: (-86, 0, 24), mid: (-36, 0, 0)}),
        ]),
    ]


# =================================================================== ホネヅカのぬし

# 第四地方(骨積みの回廊)のボス。honegarami・honedatamiと同じ人型骨組みの
# "種類"(hip/chest/neck/head/crown, shoulder-elbow-hand, thigh-knee-foot)を
# 踏襲しつつ、ボスらしくがっしりと大きく育てる。honedatamiが1体の骸骨に
# 骨板を「まとった」姿だったのに対し、こちらは「無数の古い記憶が寄り集まって
# ひとつの巨体を成した」という由来どおり、まだ形を保った小さな頭蓋骨を
# 肩・胸・背に複数めり込ませ、複数の骸骨が溶け合った塊として造形する。
# 灯る目を持つのは主頭蓋だけで、埋もれた頭蓋は空洞のまま
# ――無数の記憶のうち、いまなお憶えているのはひとつだけ、という含み。
# 剣などの得物は持たせず(honedatami同様、素手のまま)、配色は第四地方の
# テーマである白骨色・くすんだ灰色でまとめる。
HONEZUKANONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.335),
    "chest": (0.0, 0.0, 0.560),
    "neck": (0.0, 0.0, 0.690),
    "head": (0.0, -0.012, 0.795),
    "crown": (0.0, 0.0, 0.900),
    "shoulder.L": (0.228, 0.0, 0.605),
    "elbow.L": (0.308, 0.032, 0.450),
    "hand.L": (0.302, -0.010, 0.290),
    "thigh.L": (0.130, 0.0, 0.320),
    "knee.L": (0.138, 0.0, 0.160),
    "foot.L": (0.145, -0.048, 0.020),
}
# honegarami/honedatamiよりひとまわり太い。ぬしらしい防御特化のがっしりした
# シルエットを作るため、胴・肩・腿を特に厚くする
HONEZUKANONUSHI_RADII_HALF = {
    "hip": 0.165, "chest": 0.182, "neck": 0.070, "head": 0.125, "crown": 0.048,
    "shoulder.L": 0.090, "elbow.L": 0.070, "hand.L": 0.080,
    "thigh.L": 0.098, "knee.L": 0.076, "foot.L": 0.084,
}
HONEZUKANONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_honezukaNoNushi():
    """
    この回廊に積もりに積もった、無数の古い記憶が寄り集まってひとつの
    巨体を成したもの。honegarami・honedatamiと同じ人型骨組みをボスらしく
    がっしりと大きく育てる。まだ形を保った小さな頭蓋骨を肩・胸・背に
    複数めり込ませ、複数の骸骨が溶け合った塊として見せる。灯る目を持つのは
    主頭蓋だけで、埋もれた頭蓋は空洞のまま。配色は第四地方(骨積みの回廊)の
    白骨色とくすんだ灰色。

    通常種の拡大版に見えないよう、逸脱項目を意図して2つ選ぶ
    (plan/models/archive/boss-silhouette-differentiation.md):
    ①左右非対称(片方の肩だけ、めり込んだ頭蓋骨の重みでひときわ肥大
    している) ②顔の配置の逸脱(正面中央の主頭蓋に加え、高さも
    大きさもばらばらな頭蓋骨を肩・胸・背に非対称に埋め込む――他の
    ボスにも広げた、このボス発案のアイデア)。
    """
    joints = C.mirrored(HONEZUKANONUSHI_HALF)
    radii = C.mirrored_radii(HONEZUKANONUSHI_RADII_HALF)
    bones = C.mirrored_bones(HONEZUKANONUSHI_BONES_HALF)
    # 逸脱項目①。片方の肩だけ、めり込んだ頭蓋骨の重みでひときわ肥大する
    radii["shoulder.R"] *= 1.30
    radii["elbow.R"] *= 1.12

    body = C.build_skinned("honezukaNoNushi", joints, bones, radii, root="hip", subsurf=2)
    bone_mat = C.make_material("kotsuduka_bone", (0.85, 0.83, 0.73), roughness=0.75)
    dust_mat = C.make_material("kotsuduka_dust", (0.52, 0.51, 0.48), roughness=0.9)
    # honedatami踏襲。回廊の床に長く積もった意味で、脚まわりの低い位置だけ
    # くすんだ灰色にする(距離ではなく高さで判定)
    C.assign_materials_by_region(body, [bone_mat, dust_mat], lambda c: 1 if c.z < 0.140 else 0)

    extras = []
    dark_mat = C.make_material("kotsuduka_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("kotsuduka_glow", (1.0, 0.5, 0.18), roughness=0.3, emission=2.6)
    dead_mat = C.make_material("kotsuduka_dead", (0.16, 0.15, 0.16), roughness=0.85)
    rib_mat = C.make_material("kotsuduka_rib", (0.82, 0.80, 0.70), roughness=0.75)

    # 主頭蓋。honegarami譲りの顎・眼窩・頬骨・歯を、頭の半径比に合わせて
    # そのまま拡大する(headの半径がhonegaramiの約1.2倍なので、各部品の
    # 頭関節からの相対位置・大きさも1.2倍にして、同じ突き出し方を保つ)
    jaw = C.uv_sphere("kotsuduka_jaw", (0.0, -0.058, 0.713), 0.098,
                      segments=18, rings=12, scale=(0.92, 1.12, 0.58))
    C.assign_material(jaw, bone_mat)
    extras.append(jaw)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"kotsuduka_socket{side}", (0.055 * side, -0.103, 0.819), 0.041,
                             segments=12, rings=8, scale=(1.0, 0.85, 1.15))
        C.assign_material(socket, dark_mat)
        extras.append(socket)
        # 主頭蓋だけが灯す、なお憶えている記憶そのものの目
        glow = C.uv_sphere(f"kotsuduka_glow{side}", (0.055 * side, -0.113, 0.819), 0.019,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)
        cheek = C.uv_sphere(f"kotsuduka_cheek{side}", (0.094 * side, -0.062, 0.773), 0.038,
                            segments=10, rings=8, scale=(0.8, 1.0, 0.7))
        C.assign_material(cheek, bone_mat)
        extras.append(cheek)
    teeth_mat = C.make_material("kotsuduka_teeth", (0.90, 0.88, 0.79), roughness=0.5)
    for i in range(6):
        tooth = C.box(f"kotsuduka_tooth{i}", ((i - 2.5) * 0.031, -0.118, 0.699),
                      (0.021, 0.028, 0.033), bevel=0.005)
        C.assign_material(tooth, teeth_mat)
        extras.append(tooth)

    # 肋骨。chestの太い胴に対しても、はっきり浮いて見えるよう
    # chest半径(0.182)より一回り太くとる
    for i, z in enumerate((0.430, 0.475, 0.520, 0.565, 0.605)):
        radius = 0.248 - abs(i - 2) * 0.026
        rib = C.cylinder(f"kotsuduka_rib{i}", (0.0, -0.010, z), radius, 0.034, segments=18)
        for vert in rib.data.vertices:
            vert.co.y *= 0.70
        C.assign_material(rib, rib_mat)
        extras.append(rib)

    spine = C.cylinder("kotsuduka_spine", (0.0, 0.050, 0.500), 0.046, 0.34, segments=12)
    C.assign_material(spine, rib_mat)
    extras.append(spine)

    pelvis = C.uv_sphere("kotsuduka_pelvis", (0.0, 0.0, 0.360), 0.205,
                         segments=18, rings=12, scale=(1.0, 0.62, 0.52))
    C.assign_material(pelvis, bone_mat)
    extras.append(pelvis)

    # 埋もれた頭蓋骨。まだ形を保ったまま体表から半分ほど突き出す、寄せ集めの
    # 印。灯る目は主頭蓋だけなので、こちらは空洞の眼窩のまま(facingは
    # 「顔」が向く-Y/+Yの符号)
    buried_specs = [
        # (中心, 半径, facing, 色バリエーション)
        ((0.300, -0.045, 0.615), 0.072, -1.0, 0),   # 左肩から突き出す
        # 逸脱項目①と揃え、右肩だけひときわ大きな頭蓋骨がめり込む
        ((-0.320, -0.050, 0.630), 0.098, -1.0, 0),  # 右肩から突き出す(肥大)
        ((0.0, -0.235, 0.620), 0.086, -1.0, 1),     # 胸の正面に埋もれる
        ((0.0, 0.225, 0.470), 0.066, 1.0, 0),       # 背中に埋もれる
    ]
    # 埋もれた頭蓋骨が本体と関節をまたいで乗っているため、自動ウェイト
    # 計算のブレンドに任せるとhit・dieの大きな崩れで元の位置に取り残される
    # (plan/models/archive/hard-part-bone-pinning-audit.md)。頭蓋骨ごとに
    # 一番近い骨へ剛体固定する
    buried_bones = ["chest-shoulder.L", "chest-shoulder.R", "chest-neck", "hip-chest"]
    pinned_parts = []
    for i, (center, radius, facing, variant) in enumerate(buried_specs):
        skull = C.uv_sphere(f"kotsuduka_buried{i}", center, radius,
                            segments=12, rings=8, scale=(1.0, 0.9, 0.85))
        C.assign_material(skull, bone_mat if variant == 0 else dust_mat)
        C.mark_for_pin(skull)
        pinned_parts.append((skull.name, buried_bones[i]))
        extras.append(skull)
        cx, cy, cz = center
        eye_y = cy + facing * radius * 0.75
        eye_z = cz + radius * 0.05
        eye_off = radius * 0.42
        eye_r = radius * 0.26
        for side in (-1.0, 1.0):
            eye = C.uv_sphere(f"kotsuduka_buriedeye{i}_{side}",
                              (cx + eye_off * side, eye_y, eye_z),
                              eye_r, segments=8, rings=6, scale=(1.0, 0.6, 1.0))
            C.assign_material(eye, dead_mat)
            C.mark_for_pin(eye)
            pinned_parts.append((eye.name, buried_bones[i]))
            extras.append(eye)

    # 折れた骨の破片。肩・背・腰から突き出し、寄せ集めの塊であることを示す
    shard_mat = C.make_material("kotsuduka_shard", (0.80, 0.78, 0.68), roughness=0.8)
    shard_specs = [
        (0.185, -0.020, 0.700, 0.030, 0.008, 0.145),
        (-0.170, 0.080, 0.640, 0.026, 0.006, 0.115),
        (0.070, 0.175, 0.560, 0.024, 0.005, 0.100),
        (-0.090, 0.165, 0.390, 0.026, 0.006, 0.110),
    ]
    for i, (sx, sy, sz, rb, rt, depth) in enumerate(shard_specs):
        shard = C.cone(f"kotsuduka_shard{i}", (sx, sy, sz), rb, rt, depth, segments=10)
        C.assign_material(shard, shard_mat)
        extras.append(shard)

    mesh = C.join([body] + extras, "honezukaNoNushi")
    armature = C.build_armature("honezukaNoNushi", joints, bones, mesh, root="hip")
    for group_name, bone in pinned_parts:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature], armature


def honezukaNoNushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    honedatamiの打ち直し方針を、ボスとしてさらに重く・より動じない方向に
    拡張して適用した。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 回廊の最奥にどっしり居座ったまま、ごく僅かに軋むだけ。寄せ集まった
        # 頭部の塊(neck)が本体(hipc)より3フレーム遅れて追従する二次揺れ
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (32, {hipc: (1, 0, 1)}),
            (35, {neck: (2, 0, 0)}, {"partial": True}),
            (64, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 積み重なった巨体を引きずるような、重く遅い歩み。脚が正中に戻る
        # 瞬間にわずかな接地沈みを追加(honedatamiと同程度の小さな沈み)
        ("walk", [
            (1, {legL: (12, 0, 0), legR: (-12, 0, 0), shinL: (-6, 0, 0), shinR: (5, 0, 0),
                 armL: (-8, 0, 6), armR: (8, 0, -6)}),
            (12, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.006, 0)}}),
            (23, {legL: (-12, 0, 0), legR: (12, 0, 0), shinL: (5, 0, 0), shinR: (-6, 0, 0),
                  armL: (8, 0, 6), armR: (-8, 0, -6)}),
            (34, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.006, 0)}}),
        ]),
        # 得物を持たない代わりに、両腕をまとめて叩きつける正面への体当たり。
        # タメ(1→7)→LINEARで鋭く叩きつける(7→13)→行き過ぎ(13→15、
        # armL/Rが+60°付近まで一瞬余分に振れる、巨体の質量を感じさせる)→
        # 戻り(15→24)の4段構成
        ("attack", [
            (1, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                 hipc: (0, 0, 0)}),
            (7, {armL: (-32, 0, 22), armR: (-32, 0, -22), foreL: (-22, 0, 0), foreR: (-22, 0, 0),
                 hipc: (-10, 0, 0), neck: (-6, 0, 0)}, {"interp": "LINEAR"}),
            (13, {armL: (52, 0, 4), armR: (52, 0, -4), foreL: (16, 0, 0), foreR: (16, 0, 0),
                  hipc: (14, 0, 0), neck: (4, 0, 0)}),
            (15, {armL: (60, 0, 5), armR: (60, 0, -5), foreL: (18, 0, 0), foreR: (18, 0, 0),
                  hipc: (16, 0, 0), neck: (5, 0, 0)}, {"partial": True}),
            (24, {armL: (0, 0, 8), armR: (0, 0, -8), foreL: (0, 0, 0), foreR: (0, 0, 0),
                  hipc: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。def40という屈指の防御力どおり、振幅・
        # 戻り時間とも現行の小ささを維持し、honedatamiよりさらにわずかに
        # 短く(15f→13f)して「ほとんど揺るがない」を徹底する
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-6, 0, 0), neck: (-8, 0, 0)}),
            (13, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 寄せ集まっていた記憶の塊が、支えを失って崩れ落ちる。初動を
        # LINEARで鋭くし、崩れきったあとに複数の頭蓋骨が一度ばらけて
        # 弾んでから完全に崩れ落ちる、小さな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {hipc: (-12, 0, 8), neck: (-20, 0, 0), armL: (-32, 0, 32), armR: (-32, 0, -32)}),
            (28, {hipc: (-76, 0, 24), neck: (-48, 0, 0), legL: (36, 0, 0), legR: (32, 0, 0),
                  armL: (-74, 0, 62), armR: (-74, 0, -62)}),
            (32, {hipc: (-70, 0, 22), neck: (-44, 0, 0), legL: (33, 0, 0), legR: (29, 0, 0),
                  armL: (-68, 0, 57), armR: (-68, 0, -57)}, {"partial": True}),
        ]),
    ]


# ==================================================================== 掘り杭の主

HORIKUINONUSHI_HALF = {
    "hip": (0.0, 0.0, 0.576),
    "chest": (0.0, 0.0, 0.896),
    "neck": (0.0, 0.0, 1.056),
    "head": (0.0, -0.016, 1.248),
    "crown": (0.0, 0.0, 1.408),
    "shoulder.L": (0.216, 0.0, 0.952),
    "elbow.L": (0.328, 0.016, 0.752),
    "hand.L": (0.328, -0.048, 0.544),
    "thigh.L": (0.115, 0.0, 0.512),
    "knee.L": (0.125, 0.0, 0.272),
    "foot.L": (0.131, -0.048, 0.048),
}
# 単純な等倍拡大ではなく、がっしりと重く見えるよう胴・腿を特に太くする
HORIKUINONUSHI_RADII_HALF = {
    "hip": 0.124, "chest": 0.120, "neck": 0.048, "head": 0.162, "crown": 0.093,
    "shoulder.L": 0.054, "elbow.L": 0.040, "hand.L": 0.054,
    "thigh.L": 0.064, "knee.L": 0.047, "foot.L": 0.061,
}
HORIKUINONUSHI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_horikuiNoNushi():
    """
    近道屋が山へ打ち込んだ杭そのものに、ヨリシロの反発と痛みが絡みついて
    できあがった、いびつな姿。honegaramiと同じ人型骨組みをベースに、
    がっしりと重い体格に育てる。他の地方ボスと違い夢が自然に生んだ
    存在ではないため、体を貫いて突き出た太い杭そのものを軸に据え、
    体の配色は第一〜第七地方の色が不揃いに混ざり合った、統一感のない
    継ぎ接ぎにする。目は打ち込まれた痛みそのものとして、怒りを帯びた
    赤い光にする。

    看板モデルのパイロット(plan/models/archive/flagship-model-program.md)
    として、逸脱項目を意図して2つ選ぶ(plan/models/archive/
    boss-silhouette-differentiation.mdの一般則を先行適用):
    ①左右非対称(杭は体の中心ではなく片肩寄りを貫く、いびつな
    刺さり方にする) ②ネガティブスペース(杭が突き破った入り口に、
    裂けて中の闇が覗く穴を作る)。honegarami系列の通常種にも
    存在しない、この個体だけの傷。
    """
    joints = C.mirrored(HORIKUINONUSHI_HALF)
    radii = C.mirrored_radii(HORIKUINONUSHI_RADII_HALF)
    bones = C.mirrored_bones(HORIKUINONUSHI_BONES_HALF)

    body = C.build_skinned("horikuiNoNushi", joints, bones, radii, root="hip", subsurf=2)

    # 第一〜第七地方の色が不揃いに混ざり合った、いびつな継ぎ接ぎ
    region_mats = [
        C.make_material("horikui_r1", (0.62, 0.54, 0.42), roughness=0.75),
        C.make_material("horikui_r2", (0.36, 0.46, 0.48), roughness=0.65),
        C.make_material("horikui_r3", (0.40, 0.28, 0.22), roughness=0.7),
        C.make_material("horikui_r4", (0.60, 0.58, 0.52), roughness=0.7),
        C.make_material("horikui_r5", (0.20, 0.24, 0.38), roughness=0.6),
        C.make_material("horikui_r6", (0.48, 0.40, 0.30), roughness=0.75),
        C.make_material("horikui_r7", (0.44, 0.18, 0.16), roughness=0.6),
    ]
    bounds = [0.0, 40.0, 90.0, 140.0, 175.0, 220.0, 280.0, 360.0]

    def classify(c):
        deg = math.degrees(math.atan2(c.y, c.x)) % 360.0
        for i in range(7):
            if bounds[i] <= deg < bounds[i + 1]:
                return i
        return 6

    C.assign_materials_by_region(body, region_mats, classify)

    extras = []
    dark = C.make_material("horikui_dark", (0.05, 0.05, 0.06), roughness=0.85)
    glow = C.make_material("horikui_eye", (0.85, 0.22, 0.14), roughness=0.3, emission=2.2)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"horikui_socket{side}", (0.070 * side, -0.130, 1.180), 0.048,
                             segments=14, rings=10, scale=(1.0, 0.8, 1.05))
        C.assign_material(socket, dark)
        extras.append(socket)
        e = C.uv_sphere(f"horikui_eye{side}", (0.070 * side, -0.148, 1.180), 0.024,
                        segments=10, rings=8)
        C.assign_material(e, glow)
        extras.append(e)

    # 体を貫いて突き出た、近道屋が打ち込んだ杭そのもの。古びた木の色にし、
    # 頭上と足元に突き出させて、体がその杭に取り憑いた姿であることを示す
    # 逸脱項目①。杭を体の中心ではなく片肩寄りへ通し、通常のhonegarami
    # 拡大版では起こり得ない、いびつな刺さり方にする
    stake_x, stake_y = 0.145, 0.03
    wood = C.make_material("horikui_wood", (0.30, 0.20, 0.12), roughness=0.85)
    # 杭そのもの(stake/tip)はhip〜crownの全域を貫くため、単一ボーンへ
    # 剛体固定すると特定の関節の回転だけで不自然に振れてしまう
    # (plan/models/archive/hard-part-bone-pinning-findings.mdで判断:
    # 杭は「動かず体だけが軋む」表現とも解釈でき、単純な単一ボーン固定は
    # 見送る。自動ウェイト計算のまま、複数ボーンに緩くまたがらせておく)
    stake = C.cylinder("horikui_stake", (stake_x, stake_y, 0.90), 0.075, 1.55, segments=8,
                       bevel=0.01)
    C.assign_material(stake, wood)
    extras.append(stake)
    tip = C.cone("horikui_stake_tip", (stake_x, stake_y, 1.66), 0.075, 0.004, 0.16, segments=8)
    C.assign_material(tip, wood)
    extras.append(tip)
    # 逸脱項目②。杭が突き破った入り口に、裂けて中の闇が覗く穴を作る。
    # こちらは入り口(胸〜首)に局在するため、一番近い骨へ固定できる
    # (plan/models/archive/hard-part-bone-pinning-audit.md)
    tear_mat = C.make_material("horikui_tear", (0.03, 0.03, 0.03), roughness=0.95)
    tear = C.uv_sphere("horikui_tear", (stake_x - 0.055, stake_y, 0.965), 0.062,
                       segments=14, rings=10, scale=(1.0, 0.7, 0.9))
    C.assign_material(tear, tear_mat)
    C.mark_for_pin(tear)
    entry_wound_names = [tear.name]
    extras.append(tear)
    # 打ち込まれた衝撃で裂けた、木の破片(同じく入り口に局在するため
    # まとめて固定する)
    shard_mat = C.make_material("horikui_shard", (0.36, 0.25, 0.16), roughness=0.8)
    for i, (angle_deg, dist, z, length) in enumerate([
        (30.0, 0.10, 0.92, 0.16), (140.0, 0.09, 0.98, 0.14),
        (250.0, 0.11, 0.86, 0.18), (320.0, 0.08, 1.04, 0.12),
    ]):
        angle = math.radians(angle_deg)
        x = stake_x + math.cos(angle) * dist
        y = stake_y + math.sin(angle) * dist
        shard = C.cone(f"horikui_shard{i}", (x, y, z), 0.022, 0.003, length, segments=8)
        C.assign_material(shard, shard_mat)
        C.mark_for_pin(shard)
        entry_wound_names.append(shard.name)
        extras.append(shard)

    # 大技(足もとの地面がひび割れる)を暗示する、足元に突き出た小さな杭先
    for i, (sx, sy) in enumerate([(-0.24, -0.10), (0.22, -0.14), (0.0, -0.30)]):
        spike = C.cone(f"horikui_groundspike{i}", (sx, sy, 0.0), 0.026, 0.003, 0.11, segments=8)
        C.assign_material(spike, wood)
        extras.append(spike)

    mesh = C.join([body] + extras, "horikuiNoNushi")
    armature = C.build_armature("horikuiNoNushi", joints, bones, mesh, root="hip")
    for group_name in entry_wound_names:
        C.pin_weight_to_bone(mesh, group_name, "chest-neck")
    return [mesh, armature], armature


def horikuiNoNushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・頭の遅れ追従(二次揺れ)・歩行の接地沈み・
    死亡時の跳ね返りを足してある。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    foreL, foreR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 杭に取り憑かれたまま、絶えず小さく軋む。頭(neck)が胴(hipc)より
        # 2フレーム遅れて追従する(体を貫いた杭に取り憑かれた二次揺れ)
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (28, {hipc: (2, 0, 1)}),
            (30, {neck: (-2, 0, 0)}, {"partial": True}),
            (56, {hipc: (0, 0, 0)}),
            (58, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 脚が正中に戻る接地の瞬間に胴をわずかに沈める(全体1.6倍のがっしり
        # した体格のため、honegaramiの-0.010よりやや大きめの-0.014)
        ("walk", [
            (1, {legL: (14, 0, 0), legR: (-14, 0, 0), armL: (-10, 0, 6), armR: (10, 0, -6)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.014, 0)}}),
            (21, {legL: (-14, 0, 0), legR: (14, 0, 0), armL: (10, 0, 6), armR: (-10, 0, -6)}),
            (32, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.014, 0)}}),
        ]),
        # 打ち込まれた痛みを振り払うように、タメからLINEARで鋭く正面へ
        # 叩きつけ、行き過ぎてからゆっくり構えに戻す
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (6, {armL: (-30, 0, 18), armR: (-30, 0, -18), foreL: (-20, 0, 0), foreR: (-20, 0, 0),
                 hipc: (-12, 0, 0), neck: (-8, 0, 0)}, {"interp": "LINEAR"}),
            (12, {armL: (46, 0, 4), armR: (46, 0, -4), foreL: (14, 0, 0), foreR: (14, 0, 0),
                  hipc: (16, 0, 0), neck: (6, 0, 0)}),
            (14, {armL: (52, 0, 2), armR: (52, 0, -2), foreL: (16, 0, 0), foreR: (16, 0, 0),
                  hipc: (18, 0, 0), neck: (7, 0, 0)}),
            (22, {armL: (0, 0, 6), armR: (0, 0, -6), foreL: (0, 0, 0), foreR: (0, 0, 0),
                  hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。地方ボスらしく振幅・戻り時間は現行のまま
        # (honegaramiよりひとまわり小さい)、ほとんど揺るがない読み味を保つ
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-8, 0, 0), neck: (-10, 0, 0)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 杭に絡みついていた反発と痛みが、LINEARで鋭く崩れ始め、ゆっくり
        # 崩れ落ちる。30f到達後、杭がわずかに揺り戻す跳ね返りを1回追加
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (12, {hipc: (-14, 0, 8), neck: (-22, 0, 0), armL: (-30, 0, 30), armR: (-30, 0, -30)}),
            (30, {hipc: (-80, 0, 24), neck: (-50, 0, 0), legL: (34, 0, 0), legR: (30, 0, 0),
                  armL: (-70, 0, 58), armR: (-70, 0, -58)}),
            (34, {hipc: (-72, 0, 21), legL: (30, 0, 0), legR: (26, 0, 0)}, {"partial": True}),
        ]),
    ]


# =================================================================== ホロホロチョウ

# 計画書どおり、現在流用しているpurunの関節構成(縦2本、base-mid-top)を
# そのまま踏襲する。akubitokage・kodamausagiと同じ「purun骨格の再利用」の
# 3例目で、脚を生やさず底面を床で潰す処理も含めて完全に流用できるため、
# アニメーションもpurun_animationsをそのまま呼べる(ボーン名が同一)。
# swarmで3〜4体まとめて配置される前提のため、翼と目以外の装飾は足さず、
# ashiatodori/mabutamushiよりさらに簡略なシルエットにとどめる。
HOROHOLOCHO_JOINTS = {
    "base": (0.0, 0.010, 0.048),
    "mid": (0.0, -0.006, 0.128),
    "top": (0.0, -0.026, 0.196),
}
HOROHOLOCHO_RADII = {"base": 0.128, "mid": 0.104, "top": 0.040}
HOROHOLOCHO_BONES = [("base", "mid"), ("mid", "top")]


def build_horoholocho():
    """
    ちぎれた微睡みの欠片。1羽ずつは非力だが、群れで現れるswarm。
    purunと同じ縦2本の骨組みを流用し、底を床で潰した丸い雫形にするが、
    上へ行くほど後ろへ反らせて、まどろみながら漂う軽い塊に見せる
    (akubitokageと同じ「反らせ方」の応用だが、あちらより起伏を穏やかにし、
    ふっくらした羽毛の房らしい丸みを残す)。
    """
    body = C.build_skinned("horoholocho", HOROHOLOCHO_JOINTS, HOROHOLOCHO_BONES,
                           HOROHOLOCHO_RADII, root="base", subsurf=2)
    # 底を平らに均して、床に乗っている感じを出す(purun/kodamausagiと同じ処理)
    for vert in body.data.vertices:
        if vert.co.z < 0.018:
            vert.co.z = 0.018 - (0.018 - vert.co.z) * 0.25

    # 配色は第3地方(まどろみの茸林)のテーマどおり、湿った土色を基調に、
    # 頭頂だけ胞子の淡い黄土色をかぶったように塗り分ける(kinokootokoの
    # 傘・houshitobiの胞子色と同じ淡い黄土色を、こちらでは頭の粉ふきに使う)
    earth = C.make_material("horoholocho_earth", (0.30, 0.21, 0.14), roughness=0.78)
    spore = C.make_material("horoholocho_spore", (0.84, 0.75, 0.48), roughness=0.5)
    C.assign_materials_by_region(body, [earth, spore], lambda c: 1 if c.z > 0.165 else 0)

    extras = []
    # 眠たげな半目。squashで縦につぶし、まぶたが落ちかけた表情にする
    for side in (-1.0, 1.0):
        extras += eyeball(f"horoholocho_eye{side}", (0.040 * side, -0.088, 0.155), 0.020,
                          look=(0.2 * side, -1.0, -0.1),
                          white=(0.92, 0.88, 0.76), dark=(0.30, 0.20, 0.12), squash=0.45)

    # 畳んで垂らした翼。胴の両脇に低く貼りつく羽毛の房を1つずつ乗せるだけ
    # (ashiatodoriの翼と同じprimitive貼り付けだが、上に立てず横に寝かせて
    # 眠たげに垂れ下がった羽に見せる)
    wing_mat = C.make_material("horoholocho_wing", (0.42, 0.32, 0.22), roughness=0.6)
    for side in (-1.0, 1.0):
        wing = C.uv_sphere(f"horoholocho_wing{side}", (0.128 * side, 0.026, 0.088), 0.060,
                           segments=14, rings=10, scale=(0.30, 1.25, 0.55))
        C.assign_material(wing, wing_mat)
        extras.append(wing)

    # 翅の先に付いた、面取りした小さな胞子の結晶(plan/models/
    # sheet-horoholocho.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い翅に唯一の
    # 角のある面を作る、正二十面体そのままの結晶
    gem_mat = C.make_material("horoholocho_gem", (0.86, 0.76, 0.42), roughness=0.3, emission=0.2)
    for side in (-1.0, 1.0):
        gem = C.gem(f"horoholocho_gem{side}", (0.168 * side, 0.070, 0.078), 0.026, subdivisions=1)
        C.assign_material(gem, gem_mat)
        extras.append(gem)

    mesh = C.join([body] + extras, "horoholocho")
    armature = C.build_armature("horoholocho", C.mirrored(HOROHOLOCHO_JOINTS),
                                HOROHOLOCHO_BONES, mesh, root="base")
    return [mesh, armature], armature


def horoholocho_animations():
    """骨の名前がpurunと同じ(base-mid, mid-top)ため、既存5クリップをそのまま流用する。"""
    return purun_animations()


# =================================================================== いしずえねずみ

# 第一地方(うたたねの参道)、配合限定の成熟種。ガジリねずみ(小さな不安)に
# ホネガラミ(古い記憶)を繰り返し夢あわせすると育つ姿で、AI が coward から
# guard へ変わる――すぐ逃げていた性格が、その場を固める性格へ変わる。
# gajiri と同じ関節構成(四つ足のねずみ)を土台にしつつ、体高を落として
# 重心を低く、胴・脚を太くしてどっしり見せ、背に厚い甲羅状のプレートを
# 重ねて装甲質の表皮を表現する。尻尾も gajiri の長く跳ねる形から、短く
# 太いどっしりした形に変える(逃げるための尻尾ではなく、踏ん張るための
# 尻尾)。配色は第一地方の参道の土色に馴染む、素朴で淡いトーンにする。
ISHIZUENEZUMI_HALF = {
    "hip": (0.0, 0.20, 0.175),
    "chest": (0.0, -0.02, 0.195),
    "neck": (0.0, -0.19, 0.185),
    "snout": (0.0, -0.375, 0.135),
    "tail1": (0.0, 0.33, 0.150),
    "tail2": (0.0, 0.43, 0.155),
    "tail3": (0.0, 0.505, 0.170),
    "ear.L": (0.100, -0.190, 0.310),
    "hipF.L": (0.125, -0.065, 0.115),
    "footF.L": (0.140, -0.105, 0.022),
    "hipB.L": (0.150, 0.170, 0.125),
    "footB.L": (0.165, 0.200, 0.022),
}
# gajiri より一回り太い。特に胴・脚を厚くして低い重心のどっしりした
# シルエットを作り、耳は逃げ足の速さを示す大きさが要らなくなった分だけ
# 小さく控えめにする
ISHIZUENEZUMI_RADII_HALF = {
    "hip": 0.155, "chest": 0.175, "neck": 0.115, "snout": 0.048,
    "tail1": 0.046, "tail2": 0.036, "tail3": 0.024,
    "ear.L": 0.048,
    "hipF.L": 0.062, "footF.L": 0.052,
    "hipB.L": 0.078, "footB.L": 0.058,
}
ISHIZUENEZUMI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_ishizuenezumi():
    """
    gajiri と同じ関節構成の四つ足のねずみだが、低い重心・厚い胴・太い脚で
    どっしりした体格にし、背に甲羅状のプレートを重ねて装甲質の表皮にする。
    配色は参道の土色に馴染む、素朴で淡いトーン。
    """
    joints = C.mirrored(ISHIZUENEZUMI_HALF)
    radii = C.mirrored_radii(ISHIZUENEZUMI_RADII_HALF)
    bones = C.mirrored_bones(ISHIZUENEZUMI_BONES_HALF)

    body = C.build_skinned("ishizuenezumi", joints, bones, radii, root="chest", subsurf=2)
    fur = C.make_material("ishizue_fur", (0.70, 0.60, 0.48), roughness=0.85)
    ear_in = C.make_material("ishizue_ear", (0.76, 0.56, 0.50), roughness=0.8)

    # 耳だけを内側の色にする(gajiri踏襲、耳の関節からの距離で判定)
    ears = [Vector(joints["ear.L"]), Vector(joints["ear.R"])]
    C.assign_materials_by_region(
        body, [fur, ear_in],
        lambda c: 1 if min((c - e).length for e in ears) < 0.058 else 0,
    )

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"ishizue_eye{side}", (0.076 * side, -0.255, 0.210), 0.044,
                          look=(0.2 * side, -1.0, 0.05))
    nose = C.uv_sphere("ishizue_nose", (0.0, -0.408, 0.128), 0.030, segments=12, rings=8)
    C.assign_material(nose, C.make_material("ishizue_nose_m", (0.72, 0.42, 0.44), roughness=0.4))
    extras.append(nose)
    # 前歯
    teeth = C.box("ishizue_teeth", (0.0, -0.388, 0.086), (0.052, 0.026, 0.048), bevel=0.007)
    C.assign_material(teeth, C.make_material("ishizue_teeth_m", (0.93, 0.91, 0.83), roughness=0.35))
    extras.append(teeth)

    # 背の甲羅。石畳のようにプレートを重ねて、装甲質の厚い表皮にする。
    # 尾寄りから胸寄りまでを覆い、首から先(頭・耳)はあえて覆わず
    # 露出させる(甲羅と首の柔らかさの対比、耳のシルエットとの衝突も避ける)
    shell_mat = C.make_material("ishizue_shell", (0.52, 0.49, 0.42), roughness=0.55)
    shell_specs = [
        (0.19, 0.335, 0.098, (1.05, 0.85, 0.55)),
        (0.06, 0.380, 0.115, (1.12, 0.85, 0.55)),
        (0.02, 0.400, 0.118, (1.18, 0.78, 0.55)),
    ]
    for i, (sy, sz, radius, scale) in enumerate(shell_specs):
        plate = C.uv_sphere(f"ishizue_shell{i}", (0.0, sy, sz), radius,
                            segments=14, rings=8, scale=scale)
        C.assign_material(plate, shell_mat)
        extras.append(plate)

    # 肩の小さな装甲(前脚の付け根を守る)
    for side in (-1.0, 1.0):
        pauldron = C.uv_sphere(f"ishizue_pauldron{side}", (0.145 * side, -0.06, 0.205), 0.058,
                               segments=12, rings=8, scale=(1.0, 0.95, 0.65))
        C.assign_material(pauldron, shell_mat)
        extras.append(pauldron)

    # 尾の先も小さな石畳で覆い、踏ん張りに使う尾らしい重みを見せる
    tail_cap = C.uv_sphere("ishizue_tailcap", (0.0, 0.505, 0.185), 0.030,
                           segments=10, rings=8, scale=(0.9, 1.1, 0.75))
    C.assign_material(tail_cap, shell_mat)
    extras.append(tail_cap)

    mesh = C.join([body] + extras, "ishizuenezumi")
    armature = C.build_armature("ishizuenezumi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def ishizuenezumi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約(タメ・ツメ・
    二次揺れ)を、gajiri本家remakeと同じ骨格構成に沿って適用してある。
    guardらしい「動じなさ」を各段でgajiri本家より一段強めるため、振幅は
    現行値のまま据え置き、緩急(LINEAR補間)と二次揺れだけを足す。
    """
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 動じない性格どおり、ほとんど揺らがずゆったり呼吸するだけ。
        # 短く太い尻尾(t1)だけが首(neck)より3フレーム遅れて揺れる(二次揺れ)
        ("idle", [
            (1, {t1: (0, 0, 0), neck: (0, 0, 0)}),
            (24, {neck: (-2, 0, 0), snout: (2, 0, 0)}),
            (27, {t1: (0, 0, 4)}, {"partial": True}),
            (48, {neck: (0, 0, 0)}),
            (51, {t1: (0, 0, 0)}, {"partial": True}),
        ]),
        # 低い重心のまま、どっしりと地を踏みしめる歩み
        ("walk", [
            (1, {fL: (20, 0, 0), fR: (-20, 0, 0), bL: (-18, 0, 0), bR: (18, 0, 0), t1: (0, 0, 8)}),
            (8, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (15, {fL: (-20, 0, 0), fR: (20, 0, 0), bL: (18, 0, 0), bR: (-18, 0, 0), t1: (0, 0, -8)}),
            (22, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (29, {fL: (20, 0, 0), fR: (-20, 0, 0), bL: (-18, 0, 0), bR: (18, 0, 0), t1: (0, 0, 8)}),
        ]),
        # 噛みつきではなく、前脚を踏ん張って頭から体当たりする。
        # タメ→LINEARで鋭く突進→行き過ぎ→正面に構えた低い姿勢に戻る
        ("attack", [
            (1, {neck: (0, 0, 0), snout: (0, 0, 0), fL: (0, 0, 0), fR: (0, 0, 0)}),
            (5, {neck: (18, 0, 0), snout: (10, 0, 0), fL: (-10, 0, 0), fR: (-10, 0, 0), t2: (0, 0, 16)},
             {"interp": "LINEAR"}),
            (10, {neck: (-28, 0, 0), snout: (-16, 0, 0), fL: (14, 0, 0), fR: (14, 0, 0), t2: (0, 0, -12)}),
            (13, {neck: (-20, 0, 0), snout: (-11, 0, 0), fL: (10, 0, 0), fR: (10, 0, 0), t2: (0, 0, -9)}),
            (20, {neck: (0, 0, 0), snout: (0, 0, 0), fL: (0, 0, 0), fR: (0, 0, 0), t2: (0, 0, 0)}),
        ]),
        # 高い防御どおり、当たってもほとんど動じない。入りだけLINEARで鋭くする
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (10, 0, 0), t1: (0, 0, 8)}),
            (14, {neck: (0, 0, 0), t1: (0, 0, 0)}),
        ]),
        # 逃げ足だった頃とは違い、最後まで踏みとどまってから力尽きる。
        # 初動をLINEARで鋭くし、着地後に一度だけ小さく跳ね返る
        ("die", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {neck: (20, 0, 0), fL: (-30, 0, 0), fR: (-30, 0, 0)}),
            (28, {neck: (6, 0, 0), fL: (-60, 0, 0), fR: (-60, 0, 0),
                  bL: (-45, 0, 0), bR: (-45, 0, 0), t1: (0, 0, 25)}),
            (32, {neck: (8, 0, 0), fL: (-55, 0, 0), fR: (-55, 0, 0),
                  bL: (-41, 0, 0), bR: (-41, 0, 0), t1: (0, 0, 22)}),
        ]),
    ]


# ========================================================================= かすみウツボ

KASUMIUTSUBO_HALF = {
    "hip": (0.0, 0.14, 0.075),
    "chest": (0.0, -0.08, 0.085),
    "head": (0.0, -0.32, 0.075),
    "armF.L": (0.10, -0.20, 0.04),
    "handF.L": (0.12, -0.28, 0.015),
    "kneeB.L": (0.13, 0.14, 0.085),
    "ankleB.L": (0.12, -0.02, 0.03),
    "footB.L": (0.11, -0.12, 0.012),
}
KASUMIUTSUBO_RADII_HALF = {
    "hip": 0.115, "chest": 0.125, "head": 0.095,
    "armF.L": 0.026, "handF.L": 0.030,
    "kneeB.L": 0.045, "ankleB.L": 0.028, "footB.L": 0.022,
}
KASUMIUTSUBO_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_kasumiutsubo():
    """
    忘れるというテーマをさらに煮詰めた結果、存在感そのものが薄れた姿。
    tsubuteと同じ関節構成をベースに、頭からしっぽまでを大きく引き伸ばし、
    高さを大きく削って、周囲に溶け込む平たく低いウツボのシルエットに
    作り替える。配色はwasuremizuchiよりさらに彩度を落とし、輪郭が
    かすんで見えるほど淡くする。目立たないよう、目も薄く小さくする。
    配色は第二地方(忘れ潮の湿地)の、霧と水を思わせる灰みがかった
    水色・青緑系。
    """
    joints = C.mirrored(KASUMIUTSUBO_HALF)
    radii = C.mirrored_radii(KASUMIUTSUBO_RADII_HALF)
    bones = C.mirrored_bones(KASUMIUTSUBO_BONES_HALF)

    body = C.build_skinned("kasumiutsubo", joints, bones, radii, root="chest", subsurf=2)
    dorsal = C.make_material("kasumi_dorsal", (0.56, 0.64, 0.64), roughness=0.5, emission=0.04)
    ventral = C.make_material("kasumi_ventral", (0.34, 0.42, 0.44), roughness=0.6)
    C.assign_materials_by_region(body, [dorsal, ventral], lambda c: 1 if c.z < 0.06 else 0)

    extras = []
    for side in (-1.0, 1.0):
        # 目立たないよう、薄く小さな目にする
        extras += eyeball(f"kasumi_eye{side}", (0.048 * side, -0.290, 0.098), 0.018,
                          look=(0.2 * side, -1.0, 0.05), squash=0.7,
                          white=(0.72, 0.78, 0.78), dark=(0.20, 0.26, 0.28))
    mouth = C.uv_sphere("kasumi_mouth", (0.0, -0.335, 0.055), 0.022,
                        segments=12, rings=8, scale=(1.3, 0.5, 0.4))
    C.assign_material(mouth, C.make_material("kasumi_mouth_m", (0.16, 0.20, 0.22), roughness=0.4))
    extras.append(mouth)

    # ワスレガニの甲殻が薄く透けて残った、ほとんど消えかけの殻の欠片
    # (plan/models/archive/sheet-kasumiutsubo.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。面取りの浅い、薄く
    # 小さな箱を背に2枚だけ残す
    shell_mat = C.make_material("kasumi_shell", (0.62, 0.70, 0.68), roughness=0.4, emission=0.05)
    for i, (y, size) in enumerate([(-0.02, 0.036), (0.075, 0.030)]):
        frag = C.box(f"kasumi_shell{i}", (0.0, y, 0.198), (size, size * 0.9, 0.016), bevel=0.005)
        C.assign_material(frag, shell_mat)
        extras.append(frag)

    mesh = C.join([body] + extras, "kasumiutsubo")
    armature = C.build_armature("kasumiutsubo", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def kasumiutsubo_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・前脚の極小な二次揺れを足してある。
    walkの地を這うくねりとdieの「霧へ紛れて消える」演出は、造形・由来上の
    理由からLINEARも着地バウンドも付けず、既存の滑らかなbezier補間のまま
    維持する。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 気配を消して、ほとんど動かず潜む。前脚(armL,R)が頭より4フレーム
        # 遅れて極小(±1°)だけ追従する、簡素さを壊さない最小限の二次揺れ
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (40, {head: (2, 0, 1)}),
            (44, {armL: (1, 0, 0), armR: (1, 0, 0)}, {"partial": True}),
            (80, {head: (0, 0, 0)}),
            (84, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # 地を這うように、低く滑らかに進む
        ("walk", [
            (1, {legL: (0, 0, 10), legR: (0, 0, -10), armL: (0, 0, 7), armR: (0, 0, -7),
                 head: (0, 4, 0)}),
            (9, {legL: (0, 0, -10), legR: (0, 0, 10), armL: (0, 0, -7), armR: (0, 0, 7),
                 head: (0, -4, 0)}),
            (18, {legL: (0, 0, 10), legR: (0, 0, -10), armL: (0, 0, 7), armR: (0, 0, -7),
                  head: (0, 4, 0)}),
        ]),
        # 気配を消していた分、飛び出す一撃はLINEARで鋭く速い。わずかに
        # 行き過ぎてから(延長した17fで)戻る
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (-16, 0, 0)}, {"interp": "LINEAR"}),
            (7, {head: (24, 0, 0)}),
            (10, {head: (14, 0, 0)}),
            (17, {head: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。防御力はさほど高くないため
        # 振幅・戻り時間とも現行のまま維持する
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (14, 0, 0), armL: (-10, 0, 8), armR: (-10, 0, -8)}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 薄れていた存在感が、そのまま霧へ紛れて消える。初動をLINEARで
        # 鋭くし「最初にびくっと竦む」瞬間だけ加える(倒れも着地も
        # 存在しない由来のため、跳ね返りは追加しない)
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (0, 10, 0), legL: (0, 0, -20), legR: (0, 0, 20)}),
            (20, {head: (0, 20, 0), legL: (0, 0, -44), legR: (0, 0, 44)}),
        ]),
    ]


# ======================================================================= まつりのぬし

# tsubuteと同じ関節構成(hip/chest/head/armF/handF/kneeB/ankleB/footB)を
# ベースにする、menkaburikozo・kageboushiと同系統の奇襲役(ambush AI)。
# めんかぶりこぞう(祭りの影絵)+かざりだるま(祭りの高揚)の夢あわせで
# 生まれた「状態異常を受けつけなくなった姿」という設定のため、造形は
# この2種の折衷にする。menkaburikozoよりさらに立体感を削って地面
# すれすれに伏せるシルエットにしつつ、mask由来の紅色は残しながらも
# 大きく彩度を落とし、周囲に溶け込む「わすれられた祭りの跡」の褪せた
# 紅色にする。kazaridarumaの金の帯を、腹まわりに残るわずかな金色の
# 名残として一筋だけ引き継ぎ、胸には正気を守る御守りの結び目を1つ
# 据える。menkaburikozoの見開いた面の穴・kageboushiの三日月の目とは
# 逆に、警戒して見開く必要がない(=状態異常を恐れない)ぶん、ただ
# 静かに閉じただけの目にする。maxHp 63はmenkaburikozo(42)より一回り
# 大きく、kazaridaruma(80)より小さいため、全体を約1.11倍に拡大する。
MATSURINONUSHI_HALF = {
    "hip": (0.0, 0.128, 0.109),
    "chest": (0.0, -0.061, 0.120),
    "head": (0.0, -0.239, 0.124),
    "armF.L": (0.164, -0.164, 0.058),
    "handF.L": (0.186, -0.228, 0.016),
    "kneeB.L": (0.222, 0.120, 0.124),
    "ankleB.L": (0.202, -0.042, 0.038),
    "footB.L": (0.186, -0.164, 0.014),
}
MATSURINONUSHI_RADII_HALF = {
    "hip": 0.169, "chest": 0.178, "head": 0.109,
    "armF.L": 0.038, "handF.L": 0.042,
    "kneeB.L": 0.075, "ankleB.L": 0.049, "footB.L": 0.044,
}
MATSURINONUSHI_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_matsurinonushi():
    """
    めんかぶりこぞう+かざりだるまの夢あわせ。祭りの高揚が、正気を失わせる
    悪戯からも自分を守るようになった姿。tsubute系の関節構成をベースに、
    menkaburikozoよりさらに立体感を削って地面すれすれに伏せるシルエットに
    し、周囲に溶け込む褪せた紅色を全身にまとう。腹まわりだけかざりだるま
    の金の帯の名残を一筋残し、胸には状態異常を退ける御守りの結び目を
    1つだけ据える。目は警戒に見開く必要がないぶん、ただ静かに閉じる。
    """
    joints = C.mirrored(MATSURINONUSHI_HALF)
    radii = C.mirrored_radii(MATSURINONUSHI_RADII_HALF)
    bones = C.mirrored_bones(MATSURINONUSHI_BONES_HALF)

    body = C.build_skinned("matsurinonushi", joints, bones, radii, root="chest", subsurf=2)
    faded = C.make_material("matsurinonushi_faded", (0.32, 0.18, 0.16), roughness=0.75)
    gold = C.make_material("matsurinonushi_gold", (0.50, 0.41, 0.24), roughness=0.4, metallic=0.2)
    # 胸〜腰の間だけ、かざりだるまの金の帯の名残を細く一筋残す
    C.assign_materials_by_region(
        body, [faded, gold],
        lambda c: 1 if (-0.020 < c.y < 0.030) else 0,
    )

    extras = []
    # 胸に据えた御守りの結び目。状態異常を退ける由来にちなみ、控えめに
    # 金色へ発光させる(目立たない配色を崩さない程度に留める)
    # お守りは面取りした小さな硬い板にする(plan/models/
    # sheet-matsurinonushi.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る
    charm_mat = C.make_material("matsurinonushi_charm", (0.60, 0.49, 0.26), roughness=0.35, emission=0.5)
    charm = C.box("matsurinonushi_charm", (0.0, -0.205, 0.148), (0.030, 0.014, 0.038), bevel=0.006)
    C.assign_material(charm, charm_mat)
    extras.append(charm)
    knot_mat = C.make_material("matsurinonushi_knot", (0.16, 0.10, 0.08), roughness=0.6)
    knot = C.uv_sphere("matsurinonushi_knot", (0.0, -0.218, 0.148), 0.015,
                       segments=12, rings=8)
    C.assign_material(knot, knot_mat)
    extras.append(knot)
    # 落ち着いて閉じたまぶた。menkaburikozoの見開いた穴・kageboushiの
    # 三日月と違い、警戒して見開く必要がないぶん、ただ静かに閉じた細い線
    lid_mat = C.make_material("matsurinonushi_lid", (0.14, 0.09, 0.08), roughness=0.6)
    for side in (-1.0, 1.0):
        lid = C.uv_sphere(f"matsurinonushi_lid{side}", (0.052 * side, -0.258, 0.140), 0.022,
                          segments=14, rings=8, scale=(1.0, 0.30, 0.22))
        C.assign_material(lid, lid_mat)
        extras.append(lid)

    mesh = C.join([body] + extras, "matsurinonushi")
    armature = C.build_armature("matsurinonushi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def matsurinonushi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・腕の極小な二次揺れを足してある。
    statusImmune・def16という「状態異常を受けないぶん揺れも小さい」
    性格づけをhitの振幅・戻り時間で強める。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 悪戯を恐れず、微動だにせず周囲に溶け込んで潜む。腕(armL,R)が
        # 頭より2フレーム遅れて極小(±1°)だけ追従する(二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (48, {head: (2, 3, 0)}),
            (50, {armL: (1, 0, 0), armR: (1, 0, 0)}, {"partial": True}),
            (96, {head: (0, 0, 0)}),
            (98, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        # 低い姿勢のまま、音も無く這うように距離を詰める
        ("walk", [
            (1, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
            (5, {legL: (28, 0, 0), legR: (28, 0, 0), head: (5, 0, 0)}),
            (9, {legL: (-22, 0, 0), legR: (-22, 0, 0), head: (-5, 0, 0)}),
            (14, {legL: (0, 0, 0), legR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 御守りごと体ごとLINEARで鋭くぶつかり、わずかに行き過ぎてから戻る
        ("attack", [
            (1, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
            (4, {armL: (-42, 0, 22), armR: (-42, 0, -22), head: (-22, 0, 0)}, {"interp": "LINEAR"}),
            (8, {armL: (28, 0, -8), armR: (28, 0, 8), head: (12, 0, 0)}),
            (10, {armL: (34, 0, -8), armR: (34, 0, 8), head: (12, 0, 0)}),
            (16, {armL: (0, 0, 0), armR: (0, 0, 0), head: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。def16は高めなので振幅を一段小さく、
        # 戻りも短くして「状態異常を受けないぶん揺れも小さい」性格を強める
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (12, 0, 0), armL: (-14, 0, 11), armR: (-14, 0, -11)}),
            (11, {head: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。22f到達後に小さな跳ね返り(揺り戻し)を追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (24, 0, 0), legL: (-32, 0, 0), legR: (-32, 0, 0)}),
            (22, {head: (36, 0, 0), legL: (-58, 0, 0), legR: (-58, 0, 0),
                  armL: (-52, 0, 21), armR: (-52, 0, -21)}),
            (26, {head: (32, 0, 0), legL: (-52, 0, 0), legR: (-52, 0, 0),
                  armL: (-47, 0, 19), armR: (-47, 0, -19)}, {"partial": True}),
        ]),
    ]


# ========================================================================= かたくなガニ

KATAKUNAGANI_HALF = {
    "hip": (0.0, 0.13, 0.135),
    "chest": (0.0, -0.03, 0.145),
    "neck": (0.0, -0.14, 0.135),
    "snout": (0.0, -0.26, 0.10),
    "tail1": (0.0, 0.20, 0.125),
    "tail2": (0.0, 0.24, 0.12),
    "tail3": (0.0, 0.27, 0.115),
    "ear.L": (0.06, -0.14, 0.19),
    "hipF.L": (0.13, -0.05, 0.115),
    "footF.L": (0.19, -0.06, 0.03),
    "hipB.L": (0.12, 0.11, 0.115),
    "footB.L": (0.13, 0.14, 0.03),
}
KATAKUNAGANI_RADII_HALF = {
    "hip": 0.155, "chest": 0.165, "neck": 0.090, "snout": 0.045,
    "tail1": 0.028, "tail2": 0.020, "tail3": 0.012,
    "ear.L": 0.022,
    "hipF.L": 0.055, "footF.L": 0.072,
    "hipB.L": 0.045, "footB.L": 0.032,
}
KATAKUNAGANI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_katakunagani():
    """
    意固地になった古い意地。gajiriと同じ関節構成をベースに、体を平たく
    幅広くしてカニらしい甲羅の輪郭にし、前脚を太く大きくして何かを
    掴んで抱え込むための鋏に作り替える。耳と尻尾はカニらしからぬため
    小さく切り詰め、代わりに頭から突き出た目柄を足す。配色は
    第四地方(骨積みの回廊)の、白骨色・くすんだ灰色。
    """
    joints = C.mirrored(KATAKUNAGANI_HALF)
    radii = C.mirrored_radii(KATAKUNAGANI_RADII_HALF)
    bones = C.mirrored_bones(KATAKUNAGANI_BONES_HALF)

    body = C.build_skinned("katakunagani", joints, bones, radii, root="chest", subsurf=2)
    shell = C.make_material("katakuna_shell", (0.68, 0.65, 0.58), roughness=0.6)
    ash = C.make_material("katakuna_ash", (0.42, 0.42, 0.44), roughness=0.75)
    C.assign_materials_by_region(body, [shell, ash], lambda c: 1 if c.z < 0.075 else 0)

    extras = []
    pinned_parts = []
    # 何かを掴んで抱え込むための、太く大きな鋏
    claw_mat = C.make_material("katakuna_claw", (0.76, 0.72, 0.62), roughness=0.55)
    for side in (-1.0, 1.0):
        px, py, pz = 0.20 * side, -0.06, 0.035
        # 鋏はfootF.L/Rのほぼ真上に乗っており、自動ウェイト計算では
        # dieの大きな崩れに追従しきれず取り残される(plan/models/archive/
        # hard-part-bone-pinning-audit.mdの確認過程で新たに発見)。
        # 一番近い骨(hipF.L/R-footF.L/R)へ剛体固定する
        pincer_bone = f"hipF.{'L' if side < 0 else 'R'}-footF.{'L' if side < 0 else 'R'}"
        pincer = C.uv_sphere(f"katakuna_pincer{side}", (px, py, pz), 0.042,
                             segments=14, rings=10, scale=(1.0, 1.3, 0.65))
        C.assign_material(pincer, claw_mat)
        C.mark_for_pin(pincer)
        pinned_parts.append((pincer.name, pincer_bone))
        extras.append(pincer)
        claw_l = C.cone(f"katakuna_clawL{side}", (px + 0.045 * side, py - 0.075, pz + 0.005),
                        0.020, 0.006, 0.075)
        C.assign_material(claw_l, claw_mat)
        C.mark_for_pin(claw_l)
        pinned_parts.append((claw_l.name, pincer_bone))
        extras.append(claw_l)
        claw_r = C.cone(f"katakuna_clawR{side}", (px - 0.035 * side, py - 0.075, pz - 0.010),
                        0.017, 0.005, 0.065)
        C.assign_material(claw_r, claw_mat)
        C.mark_for_pin(claw_r)
        pinned_parts.append((claw_r.name, pincer_bone))
        extras.append(claw_r)
        # 頭から突き出た目柄。関節をまたいで乗っているため、自動ウェイト
        # 計算のブレンドに任せるとdie等の大きな崩れで元の位置に取り残される
        # (plan/models/archive/hard-part-bone-pinning-audit.md)。
        # 一番近い骨(neck-snout)へ剛体固定する
        stalk = C.cylinder(f"katakuna_stalk{side}", (0.032 * side, -0.19, 0.175), 0.010, 0.055, segments=8)
        C.assign_material(stalk, ash)
        C.mark_for_pin(stalk)
        pinned_parts.append((stalk.name, "neck-snout"))
        extras.append(stalk)
        eye_parts = eyeball(f"katakuna_eye{side}", (0.032 * side, -0.19, 0.205), 0.020,
                            look=(0.3 * side, -1.0, 0.1))
        for eye_part in eye_parts:
            C.mark_for_pin(eye_part)
            pinned_parts.append((eye_part.name, "neck-snout"))
        extras += eye_parts

    mesh = C.join([body] + extras, "katakunagani")
    armature = C.build_armature("katakunagani", joints, bones, mesh, root="chest")
    for group_name, bone in pinned_parts:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature], armature


def katakunagani_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・尻尾の遅れ追従(二次揺れ)を足してある。
    thiefらしくタメ自体は短く保ち、スナッチの一瞬に緩急を集中させる。
    """
    neck, snout = "chest-neck", "neck-snout"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    tail1 = "hip-tail1"
    return [
        # 意地を張ったまま、じっと身構える。切り詰めた短い尻尾(tail1)が
        # 首より3フレーム遅れて小さく(±5°)揺れる(二次揺れ)
        ("idle", [
            (1, {neck: (0, 0, 0), tail1: (0, 0, 0)}),
            (30, {neck: (2, 0, 1), hipF_L: (0, 0, 3), hipF_R: (0, 0, -3)}),
            (33, {tail1: (0, 0, 5)}, {"partial": True}),
            (60, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (63, {tail1: (0, 0, 0)}, {"partial": True}),
        ]),
        # すばやく横滑りするように進む
        ("walk", [
            (1, {hipF_L: (14, 0, 0), hipF_R: (-14, 0, 0), hipB_L: (-12, 0, 0), hipB_R: (12, 0, 0)}),
            (7, {hipF_L: (-14, 0, 0), hipF_R: (14, 0, 0), hipB_L: (12, 0, 0), hipB_R: (-12, 0, 0)}),
            (14, {hipF_L: (14, 0, 0), hipF_R: (-14, 0, 0), hipB_L: (-12, 0, 0), hipB_R: (12, 0, 0)}),
        ]),
        # 素早くLINEARで鋭くかすめ取り、わずかに行き過ぎてから、
        # 意地を張ったまま身を引いた構えに戻る(16f→18fへ延長)
        ("attack", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (4, {neck: (-12, 0, 0), hipF_L: (-22, 0, 12), hipF_R: (-22, 0, -12)}, {"interp": "LINEAR"}),
            (8, {neck: (16, 0, 0), hipF_L: (24, 0, -8), hipF_R: (24, 0, 8)}),
            (11, {neck: (16, 0, 0), hipF_L: (30, 0, -8), hipF_R: (30, 0, 8)}),
            (18, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (14, 0, 0), hipF_L: (-10, 0, 8), hipF_R: (-10, 0, -8)}),
            (12, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くし、18f到達後に一度小さく跳ね返ってから
        # 完全に力尽きる
        ("die", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (8, {neck: (10, 0, 0), hipF_L: (16, 0, 0), hipF_R: (16, 0, 0)}),
            (18, {neck: (22, 0, 0), hipF_L: (36, 0, 0), hipF_R: (36, 0, 0)}),
            (22, {neck: (19, 0, 0), hipF_L: (31, 0, 0), hipF_R: (31, 0, 0)}),
        ]),
    ]


# ========================================================================= まざりねずみ

MAZARINEZUMI_HALF = {
    "hip": (0.0, 0.1875, 0.25),
    "chest": (0.0, -0.025, 0.2625),
    "neck": (0.0, -0.1875, 0.2375),
    "snout": (0.0, -0.40, 0.1625),
    "tail1": (0.0, 0.35, 0.2375),
    "tail2": (0.0, 0.525, 0.30),
    "tail3": (0.0, 0.65, 0.40),
    "ear.L": (0.125, -0.1875, 0.425),
    "hipF.L": (0.1125, -0.075, 0.175),
    "footF.L": (0.125, -0.125, 0.03),
    "hipB.L": (0.1375, 0.1625, 0.1875),
    "footB.L": (0.15, 0.20, 0.03),
}
MAZARINEZUMI_RADII_HALF = {
    "hip": 0.155, "chest": 0.165, "neck": 0.120, "snout": 0.048,
    "tail1": 0.032, "tail2": 0.024, "tail3": 0.016,
    "ear.L": 0.050,
    "hipF.L": 0.045, "footF.L": 0.038,
    "hipB.L": 0.058, "footB.L": 0.040,
}
MAZARINEZUMI_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_mazarinezumi():
    """
    ガジリねずみといしずえねずみが混ざった、不安定な個体。gajiriと同じ
    関節構成をベースに、体格はどちらの姿にも定まりきらない中間の
    大きさにする。臆病さと不動の構えが同居する証として、腰から尻尾に
    かけてだけ小さな甲羅を乗せ、頭から前脚にかけては装甲のない
    剥き出しのままにする。配色は第八地方(めざめの前庭)の、
    第一〜第七地方の色が淡く混ざり合った継ぎ接ぎにする。
    """
    joints = C.mirrored(MAZARINEZUMI_HALF)
    radii = C.mirrored_radii(MAZARINEZUMI_RADII_HALF)
    bones = C.mirrored_bones(MAZARINEZUMI_BONES_HALF)

    body = C.build_skinned("mazarinezumi", joints, bones, radii, root="chest", subsurf=2)

    region_mats = [
        C.make_material("mazari_r1", (0.70, 0.60, 0.46), roughness=0.75),
        C.make_material("mazari_r2", (0.42, 0.52, 0.54), roughness=0.65),
        C.make_material("mazari_r3", (0.46, 0.32, 0.24), roughness=0.7),
        C.make_material("mazari_r4", (0.68, 0.65, 0.58), roughness=0.7),
        C.make_material("mazari_r5", (0.26, 0.30, 0.44), roughness=0.6),
        C.make_material("mazari_r6", (0.56, 0.46, 0.32), roughness=0.75),
        C.make_material("mazari_r7", (0.50, 0.22, 0.20), roughness=0.6),
    ]
    bounds = [0.0, 45.0, 100.0, 140.0, 190.0, 230.0, 290.0, 360.0]

    def classify(c):
        deg = math.degrees(math.atan2(c.y, c.x)) % 360.0
        for i in range(7):
            if bounds[i] <= deg < bounds[i + 1]:
                return i
        return 6

    C.assign_materials_by_region(body, region_mats, classify)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"mazari_eye{side}", (0.086 * side, -0.30, 0.28), 0.038,
                          look=(0.3 * side, -1.0, 0.05))
    nose = C.uv_sphere("mazari_nose", (0.0, -0.475, 0.170), 0.026, segments=12, rings=8)
    C.assign_material(nose, C.make_material("mazari_nose_m", (0.72, 0.44, 0.46), roughness=0.4))
    extras.append(nose)

    # ガジリねずみ譲りの前歯(plan/models/archive/sheet-mazarinezumi.md、
    # plan/models/archive/silhouette-hard-surface-parts.mdの義務項目)。
    # 丸い体表面に唯一の角のある面を作る、面取りした箱
    teeth = C.box("mazari_teeth", (0.0, -0.460, 0.140), (0.049, 0.025, 0.046), bevel=0.0065)
    C.assign_material(teeth, C.make_material("mazari_teeth_m", (0.94, 0.92, 0.83), roughness=0.35))
    extras.append(teeth)

    # 腰から尻尾にかけてだけ乗せた、育ちきらない甲羅
    shell_mat = C.make_material("mazari_shell", (0.48, 0.46, 0.42), roughness=0.55)
    for i, (sy, sz, r) in enumerate([(0.20, 0.31, 0.075), (0.30, 0.34, 0.062), (0.38, 0.38, 0.048)]):
        plate = C.uv_sphere(f"mazari_shell{i}", (0.0, sy, sz), r,
                            segments=14, rings=8, scale=(1.1, 0.9, 0.55))
        C.assign_material(plate, shell_mat)
        extras.append(plate)

    mesh = C.join([body] + extras, "mazarinezumi")
    armature = C.build_armature("mazarinezumi", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def mazarinezumi_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・鼻先の二次揺れを足してある。guard AIらしく
    gajiriよりやや落ち着いたテンポを保つ。
    """
    neck, snout = "chest-neck", "neck-snout"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    return [
        # 臆病さと不動の構えが同居し、落ち着かずわずかに揺れる。鼻先(snout)
        # が首より2フレーム遅れて追従する(二次揺れ)
        ("idle", [
            (1, {neck: (0, 0, 0), snout: (0, 0, 0)}),
            (20, {neck: (3, 0, 2)}),
            (22, {snout: (2, 0, 1)}, {"partial": True}),
            (40, {neck: (0, 0, 0)}),
            (42, {snout: (0, 0, 0)}, {"partial": True}),
        ]),
        ("walk", [
            (1, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
            (9, {hipF_L: (-16, 0, 0), hipF_R: (16, 0, 0), hipB_L: (14, 0, 0), hipB_R: (-14, 0, 0)}),
            (18, {hipF_L: (16, 0, 0), hipF_R: (-16, 0, 0), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
        ]),
        # タメ→LINEARで鋭い噛みつき→戻りかける→ゆっくり中立へ
        ("attack", [
            (1, {neck: (0, 0, 0), snout: (0, 0, 0)}),
            (5, {neck: (-14, 0, 0), snout: (-8, 0, 0)}, {"interp": "LINEAR"}),
            (8, {neck: (26, 0, 0), snout: (16, 0, 0)}),
            (10, {neck: (14, 0, 0), snout: (8, 0, 0)}),
            (20, {neck: (0, 0, 0), snout: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。guard種族なので戻り時間も少し詰める
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (-14, 0, 0)}),
            (12, {neck: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。24f到達後にneckがほんの少し戻る
        # わずかな跳ね返りを追加
        ("die", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {neck: (12, 0, 0), hipF_L: (18, 0, 0), hipF_R: (18, 0, 0)}),
            (24, {neck: (26, 0, 0), hipF_L: (40, 0, 0), hipF_R: (40, 0, 0)}),
            (28, {neck: (23, 0, 0)}, {"partial": True}),
        ]),
    ]
# ===================================================================== もうひとつのかげ

MOUHITOTSUNOKAGE_JOINTS = {
    "root": (0.0, 0.0, 0.045),
    "stem": (0.0, 0.0, 0.12),
    "capbase": (0.0, 0.0, 0.195),
    "captop": (0.0, 0.0, 0.245),
}
MOUHITOTSUNOKAGE_RADII = {"root": 0.155, "stem": 0.165, "capbase": 0.145, "captop": 0.05}
MOUHITOTSUNOKAGE_BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build_mouhitotsunokage():
    """
    ゆめまよいの影のもう一つの姿。タルではなく、落ちている道具に擬態する。
    madoromiと同じ関節構成をベースに、ゆめまよいの影のフード状のドームとは
    違い、寸胴で角ばった箱・道具箱のような輪郭に作り替える。頂上には
    留め具のような小さな突起を残す。配色は第八地方(めざめの前庭)の、
    第一〜第七地方の色が淡く混ざり合った、統一感のない配色にする。
    """
    body = C.build_skinned("mouhitotsunokage", MOUHITOTSUNOKAGE_JOINTS, MOUHITOTSUNOKAGE_BONES,
                           MOUHITOTSUNOKAGE_RADII, root="root", subsurf=2)
    husk = C.make_material("mou_husk", (0.46, 0.44, 0.42), roughness=0.7)
    C.assign_material(body, husk)

    extras = []
    for side in (-1.0, 1.0):
        # 道具に紛れ込む影らしく、半分沈んだ生気の薄い目
        eye = C.uv_sphere(f"mou_eye{side}", (0.052 * side, -0.140, 0.150), 0.024,
                          segments=14, rings=10, scale=(1.0, 0.55, 0.6))
        C.assign_material(eye, C.make_material(f"mou_eye{side}_m", (0.58, 0.56, 0.62), roughness=0.4))
        extras.append(eye)
    mouth = C.uv_sphere("mou_mouth", (0.0, -0.150, 0.105), 0.020,
                        segments=12, rings=8, scale=(0.85, 0.5, 0.65))
    C.assign_material(mouth, C.make_material("mou_mouth_m", (0.18, 0.16, 0.18), roughness=0.5))
    extras.append(mouth)

    # 各地方の記憶の名残として、道具箱の側面に淡い色の欠片を6つ散らす
    fragments = [
        (0.62, 0.85, 0.62), (0.42, 0.30, 0.24), (0.55, 0.62, 0.42),
        (0.68, 0.44, 0.56), (0.32, 0.58, 0.66), (0.60, 0.48, 0.34),
    ]
    for i, (angle_deg, z, (fr, fg, fb)) in enumerate(
        zip([15.0, 75.0, 135.0, 195.0, 255.0, 315.0], [0.08, 0.13, 0.09, 0.14, 0.08, 0.13], fragments)
    ):
        angle = math.radians(angle_deg)
        frag = C.uv_sphere(f"mou_frag{i}", (math.cos(angle) * 0.150, math.sin(angle) * 0.150, z),
                           0.028, segments=10, rings=8, scale=(1.0, 1.0, 0.4))
        C.assign_material(frag, C.make_material(f"mou_frag{i}_m", (fr * 0.75, fg * 0.75, fb * 0.75),
                                                roughness=0.6))
        extras.append(frag)

    # 頂上に残る、留め具のような小さな突起
    latch = C.cone("mou_latch", (0.0, 0.0, 0.245), 0.030, 0.014, 0.045, segments=10)
    C.assign_material(latch, husk)
    extras.append(latch)

    mesh = C.join([body] + extras, "mouhitotsunokage")
    armature = C.build_armature("mouhitotsunokage", MOUHITOTSUNOKAGE_JOINTS,
                                MOUHITOTSUNOKAGE_BONES, mesh, root="root")
    return [mesh, armature], armature


def mouhitotsunokage_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・箱の蓋の遅れ追従(二次揺れ)を足してある。
    """
    lower, mid, upper = "root-stem", "stem-capbase", "capbase-captop"
    return [
        # 道具のふりをして、ほとんど動かずじっと潜む。箱の蓋(upper)が
        # 本体(mid)へ3フレーム遅れて揺れる、控えめな二次揺れを追加
        ("idle", [
            (1, {mid: (0, 0, 0), upper: (0, 0, 0)}),
            (48, {mid: (1.2, 0, 1)}),
            (51, {upper: (1, 0, 0.8)}, {"partial": True}),
            (96, {mid: (0, 0, 0)}),
            (99, {upper: (0, 0, 0)}, {"partial": True}),
        ]),
        # 道具らしからぬ、正体を現したときのぎこちない足取り
        ("walk", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}),
            (7, {lower: (9, 0, 5), mid: (-7, 0, -4)}),
            (14, {lower: (-9, 0, -5), mid: (7, 0, 4)}),
            (21, {lower: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # タメ→LINEARで鋭く振る打撃→行き過ぎ→ゆっくり中立へ
        ("attack", [
            (1, {upper: (0, 0, 0), mid: (0, 0, 0)}),
            (6, {upper: (-22, 0, 0), mid: (-15, 0, 0)}, {"interp": "LINEAR"}),
            (9, {upper: (-28, 0, 0), mid: (-20, 0, 0)}),
            (11, {upper: (13, 0, 0), mid: (9, 0, 0)}),
            (20, {upper: (0, 0, 0), mid: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。振幅・戻り時間は現行どおり中程度に保つ
        ("hit", [
            (1, {mid: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {mid: (11, 0, 0), upper: (7, 0, 0)}),
            (14, {mid: (0, 0, 0), upper: (0, 0, 0)}),
        ]),
        # 影がほどけるように、輪郭を保てず崩れて消える。初動をLINEARで
        # 鋭くする。22f到達後は跳ね返りではなく、影らしく完全に薄れて
        # 消えるようlower/mid/upperをさらにわずかに広げる1キーへ差し替える
        ("die", [
            (1, {lower: (0, 0, 0), mid: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {lower: (15, 0, 9), mid: (11, 0, 7), upper: (9, 0, 5)}),
            (22, {lower: (36, 0, 20), mid: (26, 0, 15), upper: (20, 0, 12)}),
            (26, {lower: (40, 0, 22), mid: (29, 0, 17), upper: (22, 0, 13)}, {"partial": True}),
        ]),
    ]


# ========================================================================= モヤウツボ

MOYAUTSUBO_HALF = {
    "hip": (0.0, 0.12, 0.09),
    "chest": (0.0, -0.06, 0.10),
    "head": (0.0, -0.26, 0.09),
    "armF.L": (0.11, -0.16, 0.05),
    "handF.L": (0.13, -0.22, 0.02),
    "kneeB.L": (0.15, 0.12, 0.10),
    "ankleB.L": (0.13, -0.02, 0.035),
    "footB.L": (0.12, -0.10, 0.015),
}
MOYAUTSUBO_RADII_HALF = {
    "hip": 0.135, "chest": 0.145, "head": 0.110,
    "armF.L": 0.030, "handF.L": 0.034,
    "kneeB.L": 0.052, "ankleB.L": 0.032, "footB.L": 0.026,
}
MOYAUTSUBO_BONES_HALF = [
    ("chest", "hip"), ("chest", "head"),
    ("chest", "armF.L"), ("armF.L", "handF.L"),
    ("hip", "kneeB.L"), ("kneeB.L", "ankleB.L"), ("ankleB.L", "footB.L"),
]


def build_moyautsubo():
    """
    霧に紛れた油断が形になったもの。tsubuteと同じ関節構成をベースに、
    頭からしっぽへ引き伸ばして高さを削り、周囲に溶け込む平たく低い
    ウツボのシルエットに作り替える。隣接するまで気配を消す由来として、
    体にまとわりつく霧の房を淡い色の房として散らす。配色は第二地方
    (忘れ潮の湿地)の、霧と水を思わせる灰みがかった水色・青緑系。
    """
    joints = C.mirrored(MOYAUTSUBO_HALF)
    radii = C.mirrored_radii(MOYAUTSUBO_RADII_HALF)
    bones = C.mirrored_bones(MOYAUTSUBO_BONES_HALF)

    body = C.build_skinned("moyautsubo", joints, bones, radii, root="chest", subsurf=2)
    dorsal = C.make_material("moya_dorsal", (0.46, 0.58, 0.58), roughness=0.5)
    ventral = C.make_material("moya_ventral", (0.28, 0.38, 0.40), roughness=0.65)
    C.assign_materials_by_region(body, [dorsal, ventral], lambda c: 1 if c.z < 0.07 else 0)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"moya_eye{side}", (0.052 * side, -0.235, 0.115), 0.026,
                          look=(0.2 * side, -1.0, 0.05), squash=0.7)
    mouth = C.uv_sphere("moya_mouth", (0.0, -0.275, 0.065), 0.026,
                        segments=12, rings=8, scale=(1.3, 0.5, 0.45))
    C.assign_material(mouth, C.make_material("moya_mouth_m", (0.16, 0.20, 0.22), roughness=0.4))
    extras.append(mouth)

    # 隣接するまで気配を消す由来として、体にまとわりつく霧の房
    mist_mat = C.make_material("moya_mist", (0.82, 0.90, 0.90), roughness=0.3, emission=0.15)
    for i, (x, y, z, r) in enumerate([
        (0.10, -0.08, 0.155, 0.048), (-0.09, 0.06, 0.150, 0.042),
        (0.06, 0.20, 0.140, 0.038), (-0.04, -0.20, 0.135, 0.036),
    ]):
        mist = C.uv_sphere(f"moya_mist{i}", (x, y, z), r, segments=12, rings=8,
                           scale=(1.0, 1.0, 0.5))
        C.assign_material(mist, mist_mat)
        extras.append(mist)

    # 背に連なる、面取りした小さな鰭状の棘(plan/models/
    # sheet-moyautsubo.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。丸い体表面に唯一の
    # 角のある面を作る
    fin_mat = C.make_material("moya_fin", (0.20, 0.30, 0.30), roughness=0.5)
    for i, (y, z) in enumerate([(-0.10, 0.252), (0.0, 0.246), (0.10, 0.234)]):
        fin = C.box(f"moya_fin{i}", (0.0, y, z), (0.008, 0.030, 0.020), bevel=0.005)
        C.assign_material(fin, fin_mat)
        extras.append(fin)

    mesh = C.join([body] + extras, "moyautsubo")
    armature = C.build_armature("moyautsubo", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def moyautsubo_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・前脚の極小な二次揺れを足してある。
    """
    head = "chest-head"
    armL, armR = "chest-armF.L", "chest-armF.R"
    legL, legR = "hip-kneeB.L", "hip-kneeB.R"
    return [
        # 気配を消して、ほとんど動かず潜む。前脚(armL,R)が頭より2フレーム
        # 遅れて極小(±1°)だけ追従する(「霧の房がわずかに遅れてなびく」二次揺れ)
        ("idle", [
            (1, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
            (40, {head: (2, 0, 1)}),
            (42, {armL: (1, 0, 0), armR: (1, 0, 0)}, {"partial": True}),
            (80, {head: (0, 0, 0)}),
            (82, {armL: (0, 0, 0), armR: (0, 0, 0)}, {"partial": True}),
        ]),
        ("walk", [
            (1, {legL: (0, 0, 10), legR: (0, 0, -10), armL: (0, 0, 7), armR: (0, 0, -7),
                 head: (0, 4, 0)}),
            (9, {legL: (0, 0, -10), legR: (0, 0, 10), armL: (0, 0, -7), armR: (0, 0, 7),
                 head: (0, -4, 0)}),
            (18, {legL: (0, 0, 10), legR: (0, 0, -10), armL: (0, 0, 7), armR: (0, 0, -7),
                  head: (0, 4, 0)}),
        ]),
        # 油断したところへ、LINEARで鋭く初撃を叩き込み、わずかに行き過ぎて
        # から気配を消した構えに戻る
        ("attack", [
            (1, {head: (0, 0, 0)}),
            (4, {head: (-18, 0, 0)}, {"interp": "LINEAR"}),
            (7, {head: (28, 0, 0)}),
            (9, {head: (34, 0, 0)}),
            (16, {head: (0, 0, 0)}),
        ]),
        # 入りだけLINEARで鋭くする。ambush AIなので振幅・戻り時間は
        # 現行のまま維持する
        ("hit", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {head: (14, 0, 0), armL: (-10, 0, 8), armR: (-10, 0, -8)}),
            (12, {head: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。20f到達後、脚が一度わずかに戻る
        # 揺り戻し(着地後の小さな跳ね返り)を追加
        ("die", [
            (1, {head: (0, 0, 0)}, {"interp": "LINEAR"}),
            (9, {head: (0, 10, 0), legL: (0, 0, -20), legR: (0, 0, 20)}),
            (20, {head: (0, 20, 0), legL: (0, 0, -44), legR: (0, 0, 44)}),
            (24, {legL: (0, 0, -40), legR: (0, 0, 40)}, {"partial": True}),
        ]),
    ]


# ========================================================================= スリガラス

SURIGARASU_HALF = {
    "hip": (0.0, 0.09, 0.13),
    "chest": (0.0, -0.02, 0.15),
    "neck": (0.0, -0.13, 0.16),
    "snout": (0.0, -0.24, 0.155),
    "tail1": (0.0, 0.18, 0.15),
    "tail2": (0.0, 0.24, 0.17),
    "tail3": (0.0, 0.29, 0.20),
    "ear.L": (0.05, -0.13, 0.20),
    "hipF.L": (0.09, -0.05, 0.13),
    "footF.L": (0.20, -0.06, 0.10),
    "hipB.L": (0.06, 0.08, 0.09),
    "footB.L": (0.06, 0.10, 0.01),
}
SURIGARASU_RADII_HALF = {
    "hip": 0.085, "chest": 0.095, "neck": 0.060, "snout": 0.028,
    "tail1": 0.024, "tail2": 0.016, "tail3": 0.010,
    "ear.L": 0.014,
    "hipF.L": 0.032, "footF.L": 0.020,
    "hipB.L": 0.026, "footB.L": 0.016,
}
SURIGARASU_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_surigarasu():
    """
    ヨリシロのふとした衝動が形になった、カラスに似た姿。gajiriと同じ
    関節構成をベースに、細身ですばやそうな鳥のシルエットに作り替える。
    何かを掴んで抱え込むための前肢を目立たせ、平たい翼を左右の肩に
    重ねる。耳は鳥らしからぬため小さく切り詰め、鼻先には尖った嘴を
    足す。配色は第一地方(うたたねの参道)の、参道の土色に馴染む
    素朴な淡い色合い。
    """
    joints = C.mirrored(SURIGARASU_HALF)
    radii = C.mirrored_radii(SURIGARASU_RADII_HALF)
    bones = C.mirrored_bones(SURIGARASU_BONES_HALF)

    body = C.build_skinned("surigarasu", joints, bones, radii, root="chest", subsurf=2)
    feather = C.make_material("suriga_feather", (0.62, 0.56, 0.46), roughness=0.7)
    C.assign_material(body, feather)

    extras = []
    wing_mat = C.make_material("suriga_wing", (0.50, 0.44, 0.36), roughness=0.65)
    for side in (-1.0, 1.0):
        wing = C.uv_sphere(f"suriga_wing{side}", (0.155 * side, -0.02, 0.145), 0.075,
                           segments=14, rings=10, scale=(1.0, 1.3, 0.28))
        C.assign_material(wing, wing_mat)
        extras.append(wing)
        extras += eyeball(f"suriga_eye{side}", (0.038 * side, -0.185, 0.185), 0.020,
                          look=(0.3 * side, -1.0, 0.1))
    beak = C.cone("suriga_beak", (0.0, -0.255, 0.148), 0.022, 0.003, 0.055, segments=10)
    C.assign_material(beak, C.make_material("suriga_beak_m", (0.68, 0.56, 0.32), roughness=0.4))
    extras.append(beak)
    # 尻尾の先に扇状の尾羽
    for i, angle_deg in enumerate([-18.0, 0.0, 18.0]):
        angle = math.radians(angle_deg)
        fx = math.sin(angle) * 0.03
        feather_tail = C.cone(f"suriga_tailfeather{i}", (fx, 0.29, 0.20 - i * 0.006),
                              0.014, 0.002, 0.06, segments=8)
        C.assign_material(feather_tail, feather)
        extras.append(feather_tail)

    mesh = C.join([body] + extras, "surigarasu")
    armature = C.build_armature("surigarasu", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def surigarasu_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・尻尾の遅れ追従(二次揺れ)を足してある。
    thiefらしく間合いを詰めるフレーム数自体はtsubuteより詰めたまま
    (俊敏さを維持)。防御1というごく薄い装甲のためhitの振幅は大きめに保つ。
    """
    neck, snout = "chest-neck", "neck-snout"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    tail1 = "hip-tail1"
    return [
        # きょろきょろと、光るものを探して落ち着かない。尻尾(tail1)が
        # 首より3フレーム遅れて追従する(gajiriと同じ手法の二次揺れ)
        ("idle", [
            (1, {neck: (0, 0, 0), tail1: (0, 0, 0)}),
            (14, {neck: (3, 12, 0)}),
            (17, {tail1: (0, 0, 12)}, {"partial": True}),
            (28, {neck: (0, 0, 0)}),
            (31, {tail1: (0, 0, 0)}, {"partial": True}),
            (42, {neck: (-3, -12, 0)}),
            (45, {tail1: (0, 0, -12)}, {"partial": True}),
        ]),
        # 飛び去るように、羽ばたきながら跳ねて進む
        ("walk", [
            (1, {hipF_L: (0, 0, 16), hipF_R: (0, 0, -16), hipB_L: (14, 0, 0), hipB_R: (-14, 0, 0)}),
            (7, {hipF_L: (0, 0, -16), hipF_R: (0, 0, 16), hipB_L: (-14, 0, 0), hipB_R: (14, 0, 0)}),
            (14, {hipF_L: (0, 0, 16), hipF_R: (0, 0, -16), hipB_L: (14, 0, 0), hipB_R: (-14, 0, 0)}),
        ]),
        # タメ→LINEARで鋭く掠め取るツメ→行き過ぎ→飛び去る構えに戻る
        ("attack", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (4, {neck: (-12, 0, 0), hipF_L: (0, 0, 30), hipF_R: (0, 0, -30)}, {"interp": "LINEAR"}),
            (7, {neck: (18, 0, 0), hipF_L: (0, 0, -36), hipF_R: (0, 0, 36)}),
            (9, {neck: (18, 0, 0), hipF_L: (0, 0, -40), hipF_R: (0, 0, 40)}),
            (16, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くし、紙装甲らしく振幅を大きくする一方、
        # thiefらしくすぐ逃げに転じるため戻りは伸ばさず速く戻す
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (18, 0, 0), hipF_L: (0, 0, -20), hipF_R: (0, 0, 20)}),
            (12, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くする。18f到達後、消える直前に首がわずかに
        # 戻る小さな跳ね返りを追加
        ("die", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (8, {neck: (10, 0, 0), hipF_L: (0, 0, 20), hipF_R: (0, 0, -20)}),
            (18, {neck: (24, 0, 0), hipF_L: (0, 0, 44), hipF_R: (0, 0, -44)}),
            (22, {neck: (20, 0, 0)}, {"partial": True}),
        ]),
    ]


# ====================================================================== とこしえのぷるん

TOKOSHIEPURUN_JOINTS = {
    "base": (0.0, 0.0, 0.092),
    "mid": (0.0, 0.0, 0.230),
    "top": (0.0, 0.0, 0.3795),
}
TOKOSHIEPURUN_RADII = {"base": 0.3335, "mid": 0.2875, "top": 0.1035}
TOKOSHIEPURUN_BONES = [("base", "mid"), ("mid", "top")]


def build_tokoshiepurun():
    """
    まどろみの余韻を重ねすぎた結果、被弾を和らげる性質が常に発動する
    ようになった姿。姿はぷるんのままだが、揺るぎなさだけが増している
    ため、purunと同じ形をおよそ1.15倍にするだけにとどめ、根元に
    揺るがない土台を思わせる薄い輪を足す。目は見開いたままだが、
    落ち着いて据わった雰囲気にわずかに絞る。配色は第一地方
    (うたたねの参道)の、参道の土色に馴染む素朴な淡い色合い。
    """
    body = C.build_skinned("tokoshiepurun", TOKOSHIEPURUN_JOINTS, TOKOSHIEPURUN_BONES,
                           TOKOSHIEPURUN_RADII, root="base", subsurf=2)
    for vert in body.data.vertices:
        if vert.co.z < 0.028:
            vert.co.z = 0.028 - (0.028 - vert.co.z) * 0.25
    C.assign_material(body, C.make_material("tokoshie_body", (0.70, 0.60, 0.46),
                                            roughness=0.3, metallic=0.0))

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"tokoshie_eye{side}", (0.098 * side, -0.225, 0.297), 0.062,
                          look=(0.15 * side, -1.0, 0.0), squash=0.85)
    mouth = C.uv_sphere("tokoshie_mouth", (0.0, -0.262, 0.182), 0.055,
                        segments=14, rings=10, scale=(1.5, 0.5, 0.65))
    C.assign_material(mouth, C.make_material("tokoshie_mouth_m", (0.20, 0.14, 0.12), roughness=0.3))
    extras.append(mouth)

    # 揺るがない土台を思わせる、根元の薄い輪
    ring_mat = C.make_material("tokoshie_ring", (0.54, 0.46, 0.34), roughness=0.6)
    ring = C.cylinder("tokoshie_ring", (0.0, 0.0, 0.030), 0.345, 0.020, segments=28)
    C.assign_material(ring, ring_mat)
    extras.append(ring)

    mesh = C.join([body] + extras, "tokoshiepurun")
    armature = C.build_armature("tokoshiepurun", C.mirrored(TOKOSHIEPURUN_JOINTS),
                                TOKOSHIEPURUN_BONES, mesh, root="base")
    return [mesh, armature], armature


def tokoshiepurun_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・行き過ぎ・二次揺れ・die跳ね返りを足してある。
    骨2本(lower/upper)のみのため、akubitokageと同じくupperの遅延で
    二次揺れを表現した。「ゆるがぬからだ」という性格づけどおり、purunの
    攻撃よりタメを心持ち長く取り、伸びの最大値もわずかに抑えている。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 揺るぎなさそのものとして、ほとんど動かず静かに佇む。upperが
        # lowerより2フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (36, {lower: {"scale": (1.02, 0.98, 1.02)}}),
            (38, {upper: {"scale": (0.98, 1.02, 0.98)}}, {"partial": True}),
            (72, {lower: neutral}),
            (74, {upper: neutral}, {"partial": True}),
        ]),
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}, upper: squash}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # タメ(1→6、lowerを軽くsquash)→LINEARで鋭く伸ばすツメ(6→10、
        # 現行のピーク値まで)→行き過ぎ(10→13、現行のピークよりわずかに
        # 弱めて戻し始める)→戻り(13→22)の4段に再構成
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (6, {lower: squash, upper: stretch}),
            (10, {lower: {"scale": (0.85, 1.28, 0.85), "loc": (0, 0.08, 0)}, upper: {"scale": (1.20, 0.80, 1.20)}},
             {"interp": "LINEAR"}),
            (13, {lower: {"scale": (0.90, 1.18, 0.90), "loc": (0, 0.05, 0)}, upper: {"scale": (1.12, 0.88, 1.12)}}),
            (22, {lower: neutral, upper: neutral}),
        ]),
        # みをまもるが常時発動する性質どおり、被弾してもほとんど揺るがない。
        # 入りをLINEARで鋭くする。振幅はguard相当の小ささのまま変更しない
        ("hit", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (4, {lower: {"scale": (1.12, 0.88, 1.12)}, upper: {"scale": (0.94, 1.08, 0.94)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # 初動をLINEARで鋭くする。24fで潰れきったあとに、着地後の小さな
        # 跳ね返りを1回追加する
        ("die", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (10, {lower: {"scale": (1.4, 0.45, 1.4)}, upper: {"scale": (1.3, 0.5, 1.3)}}),
            (24, {lower: {"scale": (1.55, 0.05, 1.55)}, upper: {"scale": (1.45, 0.07, 1.45)}}),
            (28, {lower: {"scale": (1.5, 0.09, 1.5)}, upper: {"scale": (1.4, 0.11, 1.4)}}, {"partial": True}),
        ]),
    ]


# =========================================================================== わすれぼね

WASUREBONE_HALF = {
    "hip": (0.0, 0.02, 0.245),
    "chest": (0.0, 0.03, 0.395),
    "neck": (0.0, 0.02, 0.462),
    "head": (0.0, -0.04, 0.540),
    "crown": (0.0, 0.01, 0.605),
    "shoulder.L": (0.095, 0.02, 0.415),
    "elbow.L": (0.145, 0.03, 0.325),
    "hand.L": (0.145, -0.01, 0.235),
    "thigh.L": (0.050, 0.02, 0.225),
    "knee.L": (0.054, 0.02, 0.120),
    "foot.L": (0.057, -0.01, 0.020),
}
WASUREBONE_RADII_HALF = {
    "hip": 0.044, "chest": 0.042, "neck": 0.020, "head": 0.076, "crown": 0.044,
    "shoulder.L": 0.020, "elbow.L": 0.015, "hand.L": 0.020,
    "thigh.L": 0.022, "knee.L": 0.018, "foot.L": 0.024,
}
WASUREBONE_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_wasurebone():
    """
    誰のものかも忘れられた骨。honegaramiと同じ人型骨組みをベースに、
    ぐっと小柄で華奢な体格にし、前かがみの姿勢で今にも逃げ出しそうな
    軽いシルエットにする。眼窩は不安げに大きく見開かせ、光は
    honegaramiの力強い橙色より弱々しい青白い光にする。配色は
    第四地方(骨積みの回廊)の白骨色・くすんだ灰色。
    """
    joints = C.mirrored(WASUREBONE_HALF)
    radii = C.mirrored_radii(WASUREBONE_RADII_HALF)
    bones = C.mirrored_bones(WASUREBONE_BONES_HALF)

    body = C.build_skinned("wasurebone", joints, bones, radii, root="hip", subsurf=2)
    bone_mat = C.make_material("wasure_bone", (0.80, 0.78, 0.70), roughness=0.75)
    dust_mat = C.make_material("wasure_dust", (0.50, 0.49, 0.46), roughness=0.85)
    C.assign_materials_by_region(body, [bone_mat, dust_mat], lambda c: 1 if c.z < 0.30 else 0)

    extras = []
    dark = C.make_material("wasure_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("wasure_glow", (0.55, 0.70, 0.85), roughness=0.3, emission=1.4)

    jaw = C.uv_sphere("wasure_jaw", (0.0, -0.033, 0.487), 0.056,
                      segments=16, rings=10, scale=(0.92, 1.12, 0.58))
    C.assign_material(jaw, bone_mat)
    extras.append(jaw)
    for side in (-1.0, 1.0):
        # 不安げに大きく見開いた眼窩
        socket = C.uv_sphere(f"wasure_socket{side}", (0.036 * side, -0.058, 0.548), 0.028,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.15))
        C.assign_material(socket, dark)
        extras.append(socket)
        glow = C.uv_sphere(f"wasure_glow{side}", (0.036 * side, -0.064, 0.548), 0.014,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)

    # 肋骨。honegaramiより数を減らし、隙間だらけの粗末な体を見せる
    for i, z in enumerate((0.320, 0.360, 0.400)):
        radius = 0.070 - abs(i - 1) * 0.008
        rib = C.cylinder(f"wasure_rib{i}", (0.0, 0.02, z), radius, 0.016, segments=14)
        for vert in rib.data.vertices:
            vert.co.y *= 0.65
        C.assign_material(rib, dust_mat)
        extras.append(rib)

    mesh = C.join([body] + extras, "wasurebone")
    armature = C.build_armature("wasurebone", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def wasurebone_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・行き過ぎ・二次揺れ・footfall-dipを足してある。
    非力なcowardらしく、attackの振り自体は小さいまま鋭さだけを足した。
    doc本文はattackの打撃(4→6)を「現行の-20/-20を-26/-26まで振る」と
    書いているが、これはタメの値をそのまま深めるだけで打撃にならず
    文脈と矛盾するため、他種族と同じ「元のピーク(26/26)を増幅して
    前倒しし、元のピーク値を行き過ぎの戻り先にする」解釈で実装した。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 気配に怯えるように、絶えずびくびくと震える。頭(neck)が胴(hipc)より
        # 1フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (10, {hipc: (2, 0, 1)}),
            (11, {neck: (4, 0, -2)}, {"partial": True}),
            (20, {hipc: (0, 0, 0)}),
            (30, {hipc: (-2, 0, -1)}),
            (31, {neck: (-3, 0, 2)}, {"partial": True}),
        ]),
        # 逃げ足の速さを感じさせる、せかせかとした足取り。hipcはほぼ垂直な
        # 胴の骨のため、両脚が中央に戻る瞬間にわずかな接地沈みを追加
        ("walk", [
            (1, {legL: (24, 0, 0), legR: (-24, 0, 0), armL: (-16, 0, 0), armR: (16, 0, 0)}),
            (5, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                 hipc: {"loc": (0, -0.006, 0)}}),
            (9, {legL: (-24, 0, 0), legR: (24, 0, 0), armL: (16, 0, 0), armR: (-16, 0, 0)}),
            (13, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 0), armR: (0, 0, 0),
                  hipc: {"loc": (0, -0.006, 0)}}),
        ]),
        # タメ(1→4)→LINEARで鋭く振り出す打撃(4→6、元のピークを増幅・
        # 前倒し)→行き過ぎ(6→8、元のピーク値へわずかに戻す)→戻り(8→16)
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6)}),
            (4, {armL: (-20, 0, 12), armR: (-20, 0, -12)}),
            (6, {armL: (32, 0, -8), armR: (32, 0, 8)}, {"interp": "LINEAR"}),
            (8, {armL: (26, 0, -6), armR: (26, 0, 6)}),
            (16, {armL: (0, 0, 6), armR: (0, 0, -6)}),
        ]),
        # 非力な体は、わずかな一撃でも大きくよろける。入りをLINEARで鋭くする
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-14, 0, 0), neck: (-18, 0, 0)}, {"interp": "LINEAR"}),
            (14, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 倒れながらも、仲間を奮い立たせるように輪郭がほどけて散る。
        # 初動をLINEARで鋭くし、崩れきったあとにわずかな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (8, {hipc: (-18, 0, 8), neck: (-24, 0, 0), armL: (-22, 0, 20), armR: (-22, 0, -20)},
             {"interp": "LINEAR"}),
            (18, {hipc: (-56, 0, 20), neck: (-40, 0, 0), legL: (24, 0, 0), legR: (20, 0, 0),
                  armL: (-48, 0, 40), armR: (-48, 0, -40)}),
            (22, {hipc: (-50, 0, 18), neck: (-34, 0, 0)}, {"partial": True}),
        ]),
    ]


# =========================================================================== ワスレガニ

WASUREGANI_HALF = {
    "hip": (0.0, 0.02, 0.28),
    "chest": (0.0, 0.03, 0.44),
    "neck": (0.0, 0.02, 0.50),
    "head": (0.0, -0.03, 0.575),
    "crown": (0.0, 0.01, 0.64),
    "shoulder.L": (0.11, 0.02, 0.46),
    "elbow.L": (0.165, 0.02, 0.36),
    "hand.L": (0.165, -0.02, 0.26),
    "thigh.L": (0.06, 0.02, 0.245),
    "knee.L": (0.065, 0.02, 0.13),
    "foot.L": (0.068, -0.02, 0.02),
}
WASUREGANI_RADII_HALF = {
    "hip": 0.075, "chest": 0.080, "neck": 0.038, "head": 0.088, "crown": 0.050,
    "shoulder.L": 0.040, "elbow.L": 0.030, "hand.L": 0.036,
    "thigh.L": 0.042, "knee.L": 0.032, "foot.L": 0.040,
}
WASUREGANI_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_wasuregani():
    """
    置き忘れた記憶が硬い殻をまとって居座るもの。honegaramiと同じ人型
    骨組みをベースに、低い重心のどっしりした体格に組み替える。背に
    大きな甲羅を重ねて装甲質の表皮にし、両手を小さな鋏に変える。
    配色は第二地方(忘れ潮の湿地)の、霧と水を思わせる灰みがかった
    水色・青緑系。
    """
    joints = C.mirrored(WASUREGANI_HALF)
    radii = C.mirrored_radii(WASUREGANI_RADII_HALF)
    bones = C.mirrored_bones(WASUREGANI_BONES_HALF)

    body = C.build_skinned("wasuregani", joints, bones, radii, root="hip", subsurf=2)
    skin = C.make_material("wasuregani_skin", (0.42, 0.52, 0.54), roughness=0.7)
    C.assign_material(body, skin)

    extras = []
    shell_mat = C.make_material("wasuregani_shell", (0.26, 0.34, 0.38), roughness=0.55)
    # 背に重ねた大きな甲羅
    shell = C.uv_sphere("wasuregani_shell_main", (0.0, 0.09, 0.47), 0.155,
                        segments=20, rings=14, scale=(1.15, 1.0, 0.85))
    C.assign_material(shell, shell_mat)
    extras.append(shell)
    for i, (dy, dz, r) in enumerate([(0.14, 0.55, 0.058), (0.16, 0.42, 0.052), (0.13, 0.36, 0.044)]):
        ridge = C.uv_sphere(f"wasuregani_ridge{i}", (0.0, dy, dz), r,
                            segments=14, rings=8, scale=(1.3, 0.7, 0.55))
        C.assign_material(ridge, shell_mat)
        extras.append(ridge)

    dark = C.make_material("wasuregani_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("wasuregani_glow", (0.55, 0.72, 0.80), roughness=0.3, emission=1.3)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"wasuregani_socket{side}", (0.032 * side, -0.058, 0.583), 0.026,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.1))
        C.assign_material(socket, dark)
        extras.append(socket)
        glow = C.uv_sphere(f"wasuregani_glow{side}", (0.032 * side, -0.064, 0.583), 0.012,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)
        # 両手を小さな鋏に変える
        pincer = C.uv_sphere(f"wasuregani_pincer{side}", (0.165 * side, -0.02, 0.26), 0.040,
                             segments=14, rings=10, scale=(1.0, 1.2, 0.7))
        C.assign_material(pincer, shell_mat)
        extras.append(pincer)
        claw = C.cone(f"wasuregani_claw{side}", (0.165 * side, -0.065, 0.255), 0.018, 0.004, 0.055)
        C.assign_material(claw, shell_mat)
        extras.append(claw)

    mesh = C.join([body] + extras, "wasuregani")
    armature = C.build_armature("wasuregani", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def wasuregani_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    ツメ(LINEAR補間)・二次揺れ・footfall-dip・die跳ね返りを足してある。
    attackはすでにタメ→打撃→行き過ぎ→戻りの4段構成のため、タメ幅・
    振幅とも変更せず打撃区間の鋭さのみ足した。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 思い出そうとして、ふらふらと据わりの悪い揺れを繰り返す。頭(neck)が
        # 胴(hipc)より2フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (30, {hipc: (2, 0, 1)}),
            (32, {neck: (-3, 0, 2)}, {"partial": True}),
            (60, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # hipcはほぼ垂直な胴の骨のため、両脚が中央に戻る瞬間にわずかな
        # 接地沈みを追加。脚・腕の往復自体は維持する
        ("walk", [
            (1, {legL: (16, 0, 0), legR: (-16, 0, 0), armL: (-10, 0, 6), armR: (10, 0, -6)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.008, 0)}}),
            (19, {legL: (-16, 0, 0), legR: (16, 0, 0), armL: (10, 0, 6), armR: (-10, 0, -6)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.008, 0)}}),
        ]),
        # 鋏を振りかざして鈍く叩きつける。タメ(1→6)はguard AIらしくそのまま
        # 維持し、打撃区間(6→12)にLINEAR補間を足して鋭さを強調する
        ("attack", [
            (1, {armL: (0, 0, 6), armR: (0, 0, -6)}),
            (6, {armL: (-26, 0, 16), armR: (-26, 0, -16), hipc: (-8, 0, 0)}),
            (12, {armL: (36, 0, -6), armR: (36, 0, 6), hipc: (10, 0, 0)}, {"interp": "LINEAR"}),
            (22, {armL: (0, 0, 6), armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。甲羅らしく振幅・戻り時間とも小さめのまま
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (4, {hipc: (-6, 0, 0), neck: (-10, 0, 0)}, {"interp": "LINEAR"}),
            (14, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くし、大きく傾いたあとにわずかな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}),
            (10, {hipc: (-14, 0, 8), neck: (-20, 0, 0), armL: (-24, 0, 24), armR: (-24, 0, -24)},
             {"interp": "LINEAR"}),
            (24, {hipc: (-60, 0, 20), neck: (-40, 0, 0), legL: (28, 0, 0), legR: (24, 0, 0),
                  armL: (-56, 0, 46), armR: (-56, 0, -46)}),
            (28, {hipc: (-54, 0, 18), neck: (-34, 0, 0)}, {"partial": True}),
        ]),
    ]


# ========================================================================= ヨロイムカデ

YOROIMUKADE_HALF = {
    "hip": (0.0, 0.02, 0.26),
    "chest": (0.0, 0.03, 0.42),
    "neck": (0.0, 0.02, 0.48),
    "head": (0.0, -0.03, 0.545),
    "crown": (0.0, 0.01, 0.60),
    "shoulder.L": (0.10, 0.02, 0.44),
    "elbow.L": (0.155, 0.02, 0.35),
    "hand.L": (0.155, -0.02, 0.25),
    "thigh.L": (0.058, 0.02, 0.235),
    "knee.L": (0.062, 0.02, 0.125),
    "foot.L": (0.065, -0.02, 0.02),
}
YOROIMUKADE_RADII_HALF = {
    "hip": 0.072, "chest": 0.078, "neck": 0.036, "head": 0.082, "crown": 0.048,
    "shoulder.L": 0.038, "elbow.L": 0.028, "hand.L": 0.034,
    "thigh.L": 0.040, "knee.L": 0.030, "foot.L": 0.038,
}
YOROIMUKADE_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_yoroimukade():
    """
    積み重なって固まった記憶。honegaramiと同じ人型骨組みをベースに、
    低い重心のどっしりした体格に組み替え、胴に節状の装甲を何段も
    重ねてムカデの体節を思わせる輪郭にする。胴の両脇には、余分な脚を
    思わせる小さな棘を並べる。顎には噛みついて道具を封じる由来として
    大きな牙を足す。配色は第四地方(骨積みの回廊)の白骨色・くすんだ灰色。
    """
    joints = C.mirrored(YOROIMUKADE_HALF)
    radii = C.mirrored_radii(YOROIMUKADE_RADII_HALF)
    bones = C.mirrored_bones(YOROIMUKADE_BONES_HALF)

    body = C.build_skinned("yoroimukade", joints, bones, radii, root="hip", subsurf=2)
    bone_mat = C.make_material("yoroimukade_bone", (0.82, 0.80, 0.72), roughness=0.72)
    C.assign_material(body, bone_mat)

    extras = []
    pinned_parts = []
    armor_mat = C.make_material("yoroimukade_armor", (0.48, 0.47, 0.44), roughness=0.6)
    # 胴に何段も重ねた節状の装甲。hip-chest間に乗っているため、自動ウェイト
    # 計算のブレンドに任せるとdie等の大きな崩れで元の位置に取り残される
    # (plan/models/archive/hard-part-bone-pinning-audit.md)。まとめて
    # hip-chestへ剛体固定する
    for i, z in enumerate((0.290, 0.340, 0.390, 0.440)):
        radius = 0.098 - abs(i - 1.5) * 0.006
        ring = C.cylinder(f"yoroimukade_ring{i}", (0.0, 0.03, z), radius, 0.022, segments=16)
        for vert in ring.data.vertices:
            vert.co.y *= 0.72
        C.assign_material(ring, armor_mat)
        C.mark_for_pin(ring)
        pinned_parts.append((ring.name, "hip-chest"))
        extras.append(ring)
        # 余分な脚を思わせる、体節の両脇の小さな棘
        for side in (-1.0, 1.0):
            spike = C.cone(f"yoroimukade_spike{i}_{side}", (0.095 * side, 0.03, z), 0.016, 0.003, 0.05)
            C.assign_material(spike, armor_mat)
            C.mark_for_pin(spike)
            pinned_parts.append((spike.name, "hip-chest"))
            extras.append(spike)

    dark = C.make_material("yoroimukade_socket", (0.05, 0.05, 0.07), roughness=0.9)
    glow_mat = C.make_material("yoroimukade_glow", (0.85, 0.55, 0.20), roughness=0.3, emission=1.8)
    for side in (-1.0, 1.0):
        socket = C.uv_sphere(f"yoroimukade_socket{side}", (0.030 * side, -0.052, 0.552), 0.024,
                             segments=14, rings=10, scale=(1.0, 0.85, 1.1))
        C.assign_material(socket, dark)
        extras.append(socket)
        glow = C.uv_sphere(f"yoroimukade_glow{side}", (0.030 * side, -0.058, 0.552), 0.011,
                           segments=10, rings=8)
        C.assign_material(glow, glow_mat)
        extras.append(glow)
        # 噛みついて道具を封じる大きな牙
        fang = C.cone(f"yoroimukade_fang{side}", (0.022 * side, -0.070, 0.500), 0.013, 0.002, 0.045)
        C.assign_material(fang, bone_mat)
        extras.append(fang)

    mesh = C.join([body] + extras, "yoroimukade")
    armature = C.build_armature("yoroimukade", joints, bones, mesh, root="hip")
    for group_name, bone in pinned_parts:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature], armature


def yoroimukade_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・行き過ぎ・二次揺れ・footfall-dip・die跳ね返り
    を足してある。guard AIの「動かない・揺るがない」性格づけはすでに
    振幅の小ささに表れているため、これを崩さない範囲で緩急と補間指定だけ
    を足した。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    return [
        # 通路をふさいだまま、身動きが取れず固まっている。装甲越しの
        # 二次揺れとして、neckがhipcより2フレーム遅れて追従する
        ("idle", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
            (36, {hipc: (1, 0, 1)}),
            (38, {neck: (2, 0, 0)}, {"partial": True}),
            (72, {hipc: (0, 0, 0)}),
            (74, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 接地の瞬間に胴をわずかに沈める(重装甲で四肢が短いぶん、
        # honegaramiより沈み込みは控えめ)
        ("walk", [
            (1, {legL: (14, 0, 0), legR: (-14, 0, 0), armL: (-9, 0, 6), armR: (9, 0, -6)}),
            (11, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.008, 0)}}),
            (21, {legL: (-14, 0, 0), legR: (14, 0, 0), armL: (9, 0, 6), armR: (-9, 0, -6)}),
            (32, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6),
                  hipc: {"loc": (0, -0.008, 0)}}),
        ]),
        # 思い出に囚われたまま、噛みついて道具を封じる。タメ(1→5、現行の
        # まま引く)→LINEARで鋭く噛みつくツメ(5→8、現行の22よりやや
        # 強めてスナップ感を出す)→行き過ぎ(8→11、戻り過ぎてから収まる)→
        # 戻り(11→20)の4段に分ける
        ("attack", [
            (1, {neck: (0, 0, 0)}),
            (5, {neck: (-16, 0, 0), hipc: (-6, 0, 0)}),
            (8, {neck: (26, 0, 0), hipc: (9, 0, 0)}, {"interp": "LINEAR"}),
            (11, {neck: (20, 0, 0), hipc: (7, 0, 0)}),
            (20, {neck: (0, 0, 0), hipc: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。高い防御力どおり、振幅はguardらしい
        # 小ささのまま変更しない
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-6, 0, 0), neck: (-9, 0, 0)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くし、崩れ落ちた後に装甲がわずかに跳ねる
        # 小さな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {hipc: (-12, 0, 8), neck: (-20, 0, 0), armL: (-22, 0, 22), armR: (-22, 0, -22)}),
            (26, {hipc: (-58, 0, 20), neck: (-38, 0, 0), legL: (26, 0, 0), legR: (22, 0, 0),
                  armL: (-52, 0, 44), armR: (-52, 0, -44)}),
            (30, {hipc: (-53, 0, 18), neck: (-34, 0, 0), legL: (23, 0, 0), legR: (19, 0, 0),
                  armL: (-47, 0, 40), armR: (-47, 0, -40)}, {"partial": True}),
        ]),
    ]


# ========================================================================= ヨロイオイテケ

YOROIOITEKE_HALF = {
    "hip": (0.0, 0.0, 0.30),
    "chest": (0.0, 0.0, 0.50),
    "neck": (0.0, 0.0, 0.62),
    "head": (0.0, -0.01, 0.74),
    "crown": (0.0, 0.0, 0.86),
    "shoulder.L": (0.145, 0.0, 0.535),
    "elbow.L": (0.22, 0.01, 0.40),
    "hand.L": (0.22, -0.03, 0.27),
    "thigh.L": (0.078, 0.0, 0.27),
    "knee.L": (0.084, 0.0, 0.14),
    "foot.L": (0.088, -0.03, 0.02),
}
YOROIOITEKE_RADII_HALF = {
    "hip": 0.090, "chest": 0.095, "neck": 0.050, "head": 0.100, "crown": 0.060,
    "shoulder.L": 0.055, "elbow.L": 0.040, "hand.L": 0.048,
    "thigh.L": 0.058, "knee.L": 0.044, "foot.L": 0.050,
}
YOROIOITEKE_BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build_yoroioiteke():
    """
    置いていかれる恐れそのものを鎧に変えた姿。honegaramiと同じ人型骨組みを
    ベースに、四肢を太くし低い重心のどっしりした体格に組み替える。yoroimukadeの
    節状装甲(むき出しの牙・眼窩)とは違い、こちらは全身を覆う一枚板の鎧
    (胸当て・肩当て・小手・すね当て・閉じた兜)で覆い尽くし、素肌をほとんど
    見せない重装のシルエットにする。被弾のたびに相手の満腹度を削り返す由来
    として、鎧の各所に赤くにぶく光る棘(見返す刃)を並べる。配色は第四地方
    (骨積みの回廊)の白骨色・くすんだ灰色。
    """
    joints = C.mirrored(YOROIOITEKE_HALF)
    radii = C.mirrored_radii(YOROIOITEKE_RADII_HALF)
    bones = C.mirrored_bones(YOROIOITEKE_BONES_HALF)

    body = C.build_skinned("yoroioiteke", joints, bones, radii, root="hip", subsurf=2)
    skin_mat = C.make_material("yoroioiteke_skin", (0.80, 0.78, 0.70), roughness=0.75)
    C.assign_material(body, skin_mat)

    extras = []
    armor_mat = C.make_material("yoroioiteke_armor", (0.56, 0.55, 0.52), roughness=0.55)
    dark_mat = C.make_material("yoroioiteke_dark", (0.05, 0.05, 0.07), roughness=0.9)
    thorn_mat = C.make_material("yoroioiteke_thorn", (0.72, 0.22, 0.14), roughness=0.35, emission=1.4)

    # 胸当て・背当て。胴の表面よりはっきり張り出させ、覆っている一枚板に見せる
    chest_plate = C.box("yoroioiteke_chest", (0.0, -0.085, 0.46), (0.22, 0.075, 0.26), bevel=0.025)
    C.assign_material(chest_plate, armor_mat)
    extras.append(chest_plate)
    back_plate = C.box("yoroioiteke_back", (0.0, 0.075, 0.46), (0.19, 0.055, 0.23), bevel=0.02)
    C.assign_material(back_plate, armor_mat)
    extras.append(back_plate)
    # 腰当て
    waist = C.cylinder("yoroioiteke_waist", (0.0, 0.0, 0.29), 0.118, 0.09, segments=16)
    for vert in waist.data.vertices:
        vert.co.y *= 0.80
    C.assign_material(waist, armor_mat)
    extras.append(waist)

    # 兜。頭をすっぽり覆う丸みを帯びた一枚兜
    helm = C.uv_sphere("yoroioiteke_helm", (0.0, -0.005, 0.775), 0.125,
                       segments=18, rings=14, scale=(0.98, 1.0, 1.08))
    C.assign_material(helm, armor_mat)
    extras.append(helm)
    # 兜のてっぺんの飾り棘
    crest = C.cone("yoroioiteke_crest", (0.0, 0.0, 0.865), 0.028, 0.004, 0.10)
    C.assign_material(crest, thorn_mat)
    extras.append(crest)
    # 首元の襟当て
    gorget = C.cylinder("yoroioiteke_gorget", (0.0, 0.0, 0.635), 0.075, 0.045, segments=14)
    for vert in gorget.data.vertices:
        vert.co.y *= 0.80
    C.assign_material(gorget, armor_mat)
    extras.append(gorget)
    # 額の眉庇。兜の表面より張り出させ、輪郭に段差を作る
    brow = C.box("yoroioiteke_brow", (0.0, -0.135, 0.805), (0.11, 0.03, 0.024), bevel=0.006)
    C.assign_material(brow, armor_mat)
    extras.append(brow)
    # 面頬(バイザー)の細いスリット。兜の表面よりさらに奥まった溝に見せる
    visor = C.box("yoroioiteke_visor", (0.0, -0.128, 0.775), (0.070, 0.020, 0.014), bevel=0.004)
    C.assign_material(visor, dark_mat)
    extras.append(visor)
    slit_glow = C.box("yoroioiteke_slit", (0.0, -0.140, 0.775), (0.052, 0.006, 0.008))
    C.assign_material(slit_glow, C.make_material("yoroioiteke_slit_m", (0.85, 0.88, 0.90),
                                                 roughness=0.3, emission=0.6))
    extras.append(slit_glow)

    for side in (-1.0, 1.0):
        # 肩当て。大きく張り出した円盤状
        pauldron = C.uv_sphere(f"yoroioiteke_pauldron{side}", (0.145 * side, 0.0, 0.545), 0.070,
                               segments=16, rings=12, scale=(1.0, 0.85, 0.55))
        C.assign_material(pauldron, armor_mat)
        extras.append(pauldron)
        # 肩当ての棘(見返す刃)
        p_thorn = C.cone(f"yoroioiteke_pthorn{side}", (0.175 * side, 0.0, 0.560), 0.018, 0.003, 0.065)
        C.assign_material(p_thorn, thorn_mat)
        extras.append(p_thorn)
        # 小手。手の表面よりはっきり張り出させる
        gauntlet = C.box(f"yoroioiteke_gauntlet{side}", (0.22 * side, -0.03, 0.27),
                         (0.068, 0.070, 0.088), bevel=0.016)
        C.assign_material(gauntlet, armor_mat)
        extras.append(gauntlet)
        g_thorn = C.cone(f"yoroioiteke_gthorn{side}", (0.258 * side, -0.03, 0.27),
                         0.013, 0.002, 0.038)
        C.assign_material(g_thorn, thorn_mat)
        extras.append(g_thorn)
        # すね当て。脚の表面よりはっきり張り出させる
        greave = C.cylinder(f"yoroioiteke_greave{side}", (0.084 * side, 0.0, 0.135), 0.066, 0.155,
                            segments=14)
        for vert in greave.data.vertices:
            vert.co.y *= 0.85
        C.assign_material(greave, armor_mat)
        extras.append(greave)
        # 膝当ての棘
        k_thorn = C.cone(f"yoroioiteke_kthorn{side}", (0.084 * side, -0.045, 0.14),
                         0.014, 0.002, 0.045)
        C.assign_material(k_thorn, thorn_mat)
        extras.append(k_thorn)

    mesh = C.join([body] + extras, "yoroioiteke")
    armature = C.build_armature("yoroioiteke", joints, bones, mesh, root="hip")
    return [mesh, armature], armature


def yoroioiteke_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・行き過ぎ・二次揺れ・footfall-dip・die跳ね返り
    を足してある。guard AIの小さな振幅はすでに反映済みのため崩さず、
    「鎧の棘を突き出して押し返すような、重く短い一撃」という性格づけを
    尊重し、attackのフレーム間隔はyoroimukadeよりさらに詰めた。
    """
    hipc, neck = "hip-chest", "neck-head"
    armL, armR = "chest-shoulder.L", "chest-shoulder.R"
    legL, legR = "hip-thigh.L", "hip-thigh.R"
    shinL, shinR = "thigh.L-knee.L", "thigh.R-knee.R"
    return [
        # 恐れを鎧に変えて居座る。重い鎧のまま、わずかに身構える。
        # neckがhipcより2フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {hipc: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (30, {hipc: (2, 0, 0), armL: (-3, 0, 9), armR: (-3, 0, -9)}),
            (32, {neck: (-2, 0, 0)}, {"partial": True}),
            (60, {hipc: (0, 0, 0), armL: (0, 0, 6), armR: (0, 0, -6)}),
            (62, {neck: (0, 0, 0)}, {"partial": True}),
        ]),
        # 接地の瞬間に胴をわずかに沈める(全身鎧で四肢の可動が小さい分、
        # honegaramiより控えめ)
        ("walk", [
            (1, {legL: (16, 0, 0), legR: (-16, 0, 0), shinL: (-8, 0, 0), shinR: (6, 0, 0),
                 armL: (-10, 0, 7), armR: (10, 0, -7)}),
            (10, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 7), armR: (0, 0, -7),
                  hipc: {"loc": (0, -0.008, 0)}}),
            (19, {legL: (-16, 0, 0), legR: (16, 0, 0), shinL: (6, 0, 0), shinR: (-8, 0, 0),
                  armL: (10, 0, 7), armR: (-10, 0, -7)}),
            (28, {legL: (0, 0, 0), legR: (0, 0, 0), armL: (0, 0, 7), armR: (0, 0, -7),
                  hipc: {"loc": (0, -0.008, 0)}}),
        ]),
        # 鎧の棘を突き出して押し返すような、重く短い一撃。タメ(1→5、
        # 現行のまま)→LINEARで鋭く突き出すツメ(5→8、現行の30よりやや
        # 強める)→行き過ぎ(8→10、収まる)→戻り(10→18、honegaramiの22
        # より短縮して「短い一撃」を反映)の4段に分ける
        ("attack", [
            (1, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
            (5, {armR: (-58, 0, -20), hipc: (-6, 0, -8)}),
            (8, {armR: (40, 0, 15), hipc: (13, 0, 13), neck: (-8, 0, 0)}, {"interp": "LINEAR"}),
            (10, {armR: (28, 0, 13), hipc: (9, 0, 9), neck: (-6, 0, 0)}),
            (18, {armR: (0, 0, -6), hipc: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。高い防御力どおり、振幅はguardらしい
        # 小ささのまま変更しない
        ("hit", [
            (1, {hipc: (0, 0, 0), neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {hipc: (-7, 0, 0), neck: (-10, 0, 0)}),
            (15, {hipc: (0, 0, 0), neck: (0, 0, 0)}),
        ]),
        # 初動をLINEARで鋭くし、崩れ落ちた後に装甲がわずかに跳ねる
        # 小さな跳ね返りを追加
        ("die", [
            (1, {hipc: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {hipc: (-14, 0, 8), neck: (-22, 0, 0), armL: (-24, 0, 24), armR: (-24, 0, -24)}),
            (26, {hipc: (-62, 0, 20), neck: (-40, 0, 0), legL: (28, 0, 0), legR: (24, 0, 0),
                  armL: (-56, 0, 46), armR: (-56, 0, -46)}),
            (30, {hipc: (-57, 0, 18), neck: (-36, 0, 0), legL: (25, 0, 0), legR: (21, 0, 0),
                  armL: (-51, 0, 42), armR: (-51, 0, -42)}, {"partial": True}),
        ]),
    ]


# ===================================================================== ゆめみるぷるん

YUMEMIRUPURUN_JOINTS = {
    "base": (0.0, 0.0, 0.0896),
    "mid": (0.0, 0.0, 0.224),
    "top": (0.0, 0.0, 0.3696),
}
YUMEMIRUPURUN_RADII = {"base": 0.3248, "mid": 0.28, "top": 0.1008}
YUMEMIRUPURUN_BONES = [("base", "mid"), ("mid", "top")]


def build_yumemirupurun():
    """
    ぷるん(まどろみの余韻)とマドロミダケ(眠気そのもの)の夢あわせで
    育った姿。骨組みはpurunと同じ縦2本をそのまま流用し、全体をおよそ
    1.12倍にしてAI(melee)にふさわしい、がっしりした正面向きの
    シルエットにする。眠りを攻撃に乗せる性質を、白目を細めるだけでなく
    白目の上から覆いかぶさる専用の「まぶた」ジオメトリを別途重ねることで
    表現し(tokoshiepurun/subetenopurunのsquashだけの目とは異なる手法)、
    頭上にはほのかに発光する「夢の粒」を3つ浮かべて、見るだけで
    眠気を誘うような気配を添える。配色は第一地方(うたたねの参道)の
    土色に、マドロミダケ由来の紫みをわずかに混ぜた、素朴で眠たげな
    色合いにする。
    """
    body = C.build_skinned("yumemirupurun", YUMEMIRUPURUN_JOINTS, YUMEMIRUPURUN_BONES,
                           YUMEMIRUPURUN_RADII, root="base", subsurf=2)
    for vert in body.data.vertices:
        if vert.co.z < 0.0225:
            vert.co.z = 0.0225 - (0.0225 - vert.co.z) * 0.25
    C.assign_material(body, C.make_material("yumemiru_body", (0.58, 0.50, 0.56),
                                            roughness=0.4, metallic=0.0))

    extras = []
    lid_mat = C.make_material("yumemiru_lid", (0.50, 0.42, 0.48), roughness=0.45)
    for side in (-1.0, 1.0):
        eye_c = (0.0952 * side, -0.2195, 0.2890)
        extras += eyeball(f"yumemiru_eye{side}", eye_c, 0.0605,
                          look=(0.15 * side, -1.0, 0.0), squash=0.62)
        # 白目の上から覆いかぶさる、重たいまぶた本体。squashで目を潰すだけ
        # でなく別ジオメトリを足すことで、まどろみの重みをはっきり見せる
        lid = C.uv_sphere(f"yumemiru_lid{side}",
                          (eye_c[0], eye_c[1] + 0.014, eye_c[2] + 0.020), 0.066,
                          segments=14, rings=10, scale=(1.05, 0.85, 0.40))
        C.assign_material(lid, lid_mat)
        extras.append(lid)

    mouth = C.uv_sphere("yumemiru_mouth", (0.0, -0.2554, 0.1770), 0.0538,
                        segments=14, rings=10, scale=(0.85, 0.55, 1.05))
    C.assign_material(mouth, C.make_material("yumemiru_mouth_m", (0.20, 0.12, 0.18), roughness=0.3))
    extras.append(mouth)

    # 体の周りに浮く、角のある小さな胞子の結晶(plan/models/
    # sheet-yumemirupurun.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。ぷるんの結晶
    # (common.gem)にマドロミダケの胞子が混ざった姿という位置づけで、
    # common.gemそのままで硬い面を作る
    mote_mat = C.make_material("yumemiru_mote", (0.86, 0.80, 0.94), roughness=0.5, emission=1.3)
    for i, (mx, my, mz, mr) in enumerate([
        (0.095, -0.055, 0.415, 0.026),
        (-0.075, 0.050, 0.452, 0.020),
        (0.018, 0.100, 0.486, 0.016),
    ]):
        mote = C.gem(f"yumemiru_mote{i}", (mx, my, mz), mr, subdivisions=1)
        C.assign_material(mote, mote_mat)
        extras.append(mote)

    mesh = C.join([body] + extras, "yumemirupurun")
    armature = C.build_armature("yumemirupurun", C.mirrored(YUMEMIRUPURUN_JOINTS),
                                YUMEMIRUPURUN_BONES, mesh, root="base")
    return [mesh, armature], armature


def yumemirupurun_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    idleの二次揺れ明示化、attackのタメ・ツメ(LINEAR補間)・行き過ぎ、
    hitのLINEAR補間、dieの跳ね返りを足してある。purunファミリー共通の
    squash&stretch方針は変えず、footfall-dipも(purunファミリー共通の
    方針どおり)追加していない。
    """
    lower, upper = "base-mid", "mid-top"
    squash = {"scale": (1.22, 0.72, 1.22)}
    stretch = {"scale": (0.86, 1.28, 0.86)}
    neutral = {"scale": (1.0, 1.0, 1.0)}
    return [
        # 立ったまま船を漕ぐように舟をこぐ。深く傾いてまどろんでは、
        # はっと我に返って起き直る、を繰り返す。upperがlowerよりわずかに
        # 遅れて追従するよう、frame18→20を分離して二次揺れを明示化した
        ("idle", [
            (1, {lower: neutral, upper: neutral}),
            (18, {lower: {"scale": (1.02, 0.98, 1.02)}}),
            (20, {upper: {"rot": (13, 0, 0), "scale": (0.96, 1.05, 0.96)}}, {"partial": True}),
            (30, {lower: {"scale": (1.04, 0.96, 1.04)}, upper: {"rot": (22, 0, 0), "scale": (0.91, 1.10, 0.91)}}),
            (34, {lower: neutral, upper: {"rot": (-9, 0, 0), "scale": (1.05, 0.93, 1.05)}}),
            (44, {lower: neutral, upper: neutral}),
            (70, {lower: neutral, upper: neutral}),
        ]),
        ("walk", [
            (1, {lower: neutral, upper: neutral}),
            (4, {lower: squash, upper: stretch}),
            (9, {lower: {**stretch, "loc": (0, 0.10, 0)}, upper: squash}),
            (14, {lower: {"scale": (1.1, 0.85, 1.1)}, upper: neutral}),
            (20, {lower: neutral, upper: neutral}),
        ]),
        # 眠りを乗せる一撃。がっしりした体格を活かし、大きく沈んでから
        # 正面に体当たりするように叩きつける。タメ(1→6、squashのまま、
        # 眠りを誘う一撃らしくwindupはやや長めに保つ)→LINEARで鋭く
        # 伸ばすツメ(6→9、元のピーク値まで)→行き過ぎ(9→12、stretch
        # 程度に弱めた余韻)→戻り(12→21)の4段に分ける
        ("attack", [
            (1, {lower: neutral, upper: neutral}),
            (6, {lower: squash, upper: stretch}),
            (9, {lower: {"scale": (0.80, 1.34, 0.80), "loc": (0, 0.09, 0)}, upper: {"scale": (1.22, 0.78, 1.22)}},
             {"interp": "LINEAR"}),
            (12, {lower: {"scale": (0.86, 1.22, 0.86)}, upper: squash}),
            (21, {lower: neutral, upper: neutral}),
        ]),
        # 入りをLINEARで鋭くする。振幅はmeleeが標準のため現行維持
        ("hit", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (4, {lower: {"scale": (1.28, 0.68, 1.28)}, upper: {"scale": (0.90, 1.14, 0.90)}}),
            (14, {lower: neutral, upper: neutral}),
        ]),
        # そのまま深いまどろみに沈み込むように、ゆっくりと崩れて潰れる。
        # 沈み込みの初動をLINEARで鋭くし、潰れきった後にふっと浮き
        # 上がるような小さな跳ね返りを追加
        ("die", [
            (1, {lower: neutral, upper: neutral}, {"interp": "LINEAR"}),
            (12, {lower: {"scale": (1.36, 0.48, 1.36)}, upper: {"scale": (1.26, 0.55, 1.26)}}),
            (28, {lower: {"scale": (1.5, 0.06, 1.5)}, upper: {"scale": (1.4, 0.08, 1.4)}}),
            (32, {lower: {"scale": (1.44, 0.10, 1.44)}, upper: {"scale": (1.34, 0.12, 1.34)}}, {"partial": True}),
        ]),
    ]


# ======================================================================= よせあつめ

YOSEATSUME_HALF = {
    "hip": (0.0, 0.093, 0.124),
    "chest": (0.0, -0.0124, 0.130),
    "neck": (0.0, -0.093, 0.118),
    "snout": (0.0, -0.1984, 0.0806),
    "tail1": (0.0, 0.1736, 0.1178),
    "tail2": (0.0, 0.2604, 0.1488),
    "tail3": (0.0, 0.3224, 0.1984),
    "ear.L": (0.062, -0.093, 0.2108),
    "hipF.L": (0.0558, -0.0372, 0.0868),
    "footF.L": (0.062, -0.062, 0.0155),
    "hipB.L": (0.0682, 0.0806, 0.093),
    "footB.L": (0.0744, 0.0992, 0.0155),
}
YOSEATSUME_RADII_HALF = {
    "hip": 0.0837, "chest": 0.0899, "neck": 0.0651, "snout": 0.0248,
    "tail1": 0.0198, "tail2": 0.0149, "tail3": 0.0087,
    "ear.L": 0.036,
    "hipF.L": 0.0248, "footF.L": 0.0211,
    "hipB.L": 0.0322, "footB.L": 0.0223,
}
YOSEATSUME_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"),
    ("neck", "ear.L"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_yoseatsume():
    """
    様々な地方の残響が寄り集まった群れ。gajiriと同じ関節構成をベースに、
    全体をおよそ0.62倍に縮めて、複数体まとめて配置される前提の
    簡略化した小さなシルエットにする。mazarinezumiのような特定2種の
    融合ではなく、由来がバラバラなまま集まっただけの群れなので、
    甲羅などの追加パーツは持たせず、第一〜第七地方それぞれの色を
    角度で不揃いに区切った継ぎ接ぎ模様として体にまとわせるだけに留める。
    """
    joints = C.mirrored(YOSEATSUME_HALF)
    radii = C.mirrored_radii(YOSEATSUME_RADII_HALF)
    bones = C.mirrored_bones(YOSEATSUME_BONES_HALF)

    body = C.build_skinned("yoseatsume", joints, bones, radii, root="chest", subsurf=2)

    # 第一〜第七地方それぞれの配色を継ぎ接ぎにする
    region_mats = [
        C.make_material("yose_r1", (0.72, 0.62, 0.48), roughness=0.7),   # 第1: うたたねの参道
        C.make_material("yose_r2", (0.40, 0.52, 0.54), roughness=0.6),   # 第2: 忘れ潮の湿地
        C.make_material("yose_r3", (0.46, 0.30, 0.24), roughness=0.6),   # 第3: まどろみの茸林
        C.make_material("yose_r4", (0.74, 0.70, 0.62), roughness=0.65),  # 第4: 骨積みの回廊
        C.make_material("yose_r5", (0.22, 0.26, 0.42), roughness=0.55),  # 第5: なみだの滝つぼ
        C.make_material("yose_r6", (0.58, 0.48, 0.34), roughness=0.7),   # 第6: こだまの尾根
        C.make_material("yose_r7", (0.54, 0.20, 0.18), roughness=0.55),  # 第7: 忘れられた祭りの跡
    ]
    bounds = [0.0, 40.0, 90.0, 135.0, 185.0, 235.0, 300.0, 360.0]

    def classify(c):
        deg = math.degrees(math.atan2(c.y, c.x)) % 360.0
        for i in range(7):
            if bounds[i] <= deg < bounds[i + 1]:
                return i
        return 6

    C.assign_materials_by_region(body, region_mats, classify)

    extras = []
    for side in (-1.0, 1.0):
        extras += eyeball(f"yose_eye{side}", (0.038 * side, -0.133, 0.133), 0.025,
                          look=(0.3 * side, -1.0, 0.1))
    nose = C.uv_sphere("yose_nose", (0.0, -0.218, 0.0775), 0.016, segments=12, rings=8)
    C.assign_material(nose, C.make_material("yose_nose_m", (0.85, 0.45, 0.48), roughness=0.4))
    extras.append(nose)
    teeth = C.box("yose_teeth", (0.0, -0.205, 0.051), (0.028, 0.015, 0.027), bevel=0.004)
    C.assign_material(teeth, C.make_material("yose_teeth_m", (0.95, 0.93, 0.84), roughness=0.35))
    extras.append(teeth)

    # 各地方の硬い部品の欠片を1つずつ寄せ集めて体表にまとわせる
    # (plan/models/archive/sheet-yoseatsume.md、plan/models/archive/
    # silhouette-hard-surface-parts.mdの義務項目)。統一感のない硬い
    # 欠片の寄せ集めとして、common.gem・C.box・C.cylinderを1つずつ散らす
    gem_shard = C.gem("yose_gem", (0.038, 0.050, 0.222), 0.024, subdivisions=1)
    C.assign_material(gem_shard, C.make_material("yose_gem_m", (0.45, 0.44, 0.42), roughness=0.9))
    extras.append(gem_shard)
    box_shard = C.box("yose_box", (-0.040, 0.010, 0.218), (0.018, 0.014, 0.012), bevel=0.004)
    C.assign_material(box_shard, C.make_material("yose_box_m", (0.82, 0.80, 0.70), roughness=0.75))
    extras.append(box_shard)
    ring_shard = C.cylinder("yose_ring", (0.0, -0.010, 0.228), 0.024, 0.012,
                            segments=16, axis="Y", bevel=0.003)
    C.assign_material(ring_shard, C.make_material("yose_ring_m", (0.70, 0.56, 0.28),
                                                  roughness=0.4, metallic=0.2))
    extras.append(ring_shard)

    mesh = C.join([body] + extras, "yoseatsume")
    armature = C.build_armature("yoseatsume", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def yoseatsume_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    同じ骨格を使うgajiriの打ち直し内容(idle/attack/hit/dieはgajiriと
    同じ数値のまま移植)を、0.62倍サイズ・swarmという群れ前提の性格に
    合わせて適用した。walkのみ、docの未決事項に沿って群れらしい機敏さを
    出すためフレーム間隔をgajiriのおよそ8割(1→5→9→13→17)に詰めている。
    """
    neck, snout = "chest-neck", "neck-snout"
    t1, t2 = "hip-tail1", "tail1-tail2"
    fL, fR = "chest-hipF.L", "chest-hipF.R"
    bL, bR = "hip-hipB.L", "hip-hipB.R"
    return [
        # 尻尾が首より3フレーム遅れて揺れる(二次揺れ、gajiriと同じ)
        ("idle", [
            (1, {neck: (0, 0, 0), t1: (0, 0, 0)}),
            (14, {neck: (-4, 0, 0), snout: (5, 0, 0)}),
            (17, {t1: (0, 0, 16)}, {"partial": True}),
            (28, {neck: (0, 0, 0)}),
            (31, {t1: (0, 0, -16)}, {"partial": True}),
            (42, {neck: (0, 0, 0)}),
            (45, {t1: (0, 0, 0)}, {"partial": True}),
        ]),
        # gajiriの4足交互パターンをそのまま踏襲しつつ、群れらしい機敏さを
        # 出すためフレーム間隔をおよそ8割に詰める
        ("walk", [
            (1, {fL: (30, 0, 0), fR: (-30, 0, 0), bL: (-28, 0, 0), bR: (28, 0, 0), t1: (0, 0, 12)}),
            (5, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (9, {fL: (-30, 0, 0), fR: (30, 0, 0), bL: (28, 0, 0), bR: (-28, 0, 0), t1: (0, 0, -12)}),
            (13, {fL: (0, 0, 0), fR: (0, 0, 0), bL: (0, 0, 0), bR: (0, 0, 0), t1: (0, 0, 0)}),
            (17, {fL: (30, 0, 0), fR: (-30, 0, 0), bL: (-28, 0, 0), bR: (28, 0, 0), t1: (0, 0, 12)}),
        ]),
        # タメ(首を引く)→ ツメ(LINEARで鋭く噛みつく)→ 行き過ぎ → 戻り
        # (gajiriと同じ数値)
        ("attack", [
            (1, {neck: (0, 0, 0), snout: (0, 0, 0)}),
            (4, {neck: (22, 0, 0), snout: (14, 0, 0), t2: (0, 0, 20)}, {"interp": "LINEAR"}),
            (7, {neck: (-34, 0, 0), snout: (-20, 0, 0), t2: (0, 0, -14)}),
            (9, {neck: (-26, 0, 0), snout: (-15, 0, 0), t2: (0, 0, -10)}),
            (18, {neck: (0, 0, 0), snout: (0, 0, 0), t2: (0, 0, 0)}),
        ]),
        # 鋭く入って(LINEAR)、ゆっくり戻る(gajiriと同じ)
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (3, {neck: (26, 0, 0), t1: (0, 0, 24), snout: (12, 0, 0)}),
            (14, {neck: (0, 0, 0), t1: (0, 0, 0)}),
        ]),
        # 倒れの初動を鋭く、接地後に一度だけ小さく跳ね返る(gajiriと同じ)
        ("die", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (7, {neck: (30, 0, 0), fL: (-50, 0, 0), fR: (-50, 0, 0)}),
            (20, {neck: (10, 0, 0), fL: (-90, 0, 0), fR: (-90, 0, 0),
                  bL: (-70, 0, 0), bR: (-70, 0, 0), t1: (0, 0, 40)}),
            (24, {neck: (14, 0, 0), fL: (-82, 0, 0), fR: (-82, 0, 0),
                  bL: (-64, 0, 0), bR: (-64, 0, 0), t1: (0, 0, 36)}),
        ]),
    ]


# ======================================================================= ユメクイモグラ

YUMEKUIMOGURA_HALF = {
    "hip": (0.0, 0.145, 0.150),
    "chest": (0.0, -0.015, 0.170),
    "neck": (0.0, -0.130, 0.155),
    "snout": (0.0, -0.245, 0.125),
    "tail1": (0.0, 0.205, 0.115),
    "tail2": (0.0, 0.250, 0.095),
    "hipF.L": (0.075, -0.050, 0.095),
    "footF.L": (0.125, -0.095, 0.025),
    "hipB.L": (0.075, 0.130, 0.105),
    "footB.L": (0.075, 0.165, 0.020),
}
YUMEKUIMOGURA_RADII_HALF = {
    "hip": 0.145, "chest": 0.155, "neck": 0.115, "snout": 0.048,
    "tail1": 0.030, "tail2": 0.020,
    "hipF.L": 0.062, "footF.L": 0.072,
    "hipB.L": 0.044, "footB.L": 0.030,
}
YUMEKUIMOGURA_BONES_HALF = [
    ("chest", "hip"), ("chest", "neck"), ("neck", "snout"),
    ("hip", "tail1"), ("tail1", "tail2"),
    ("chest", "hipF.L"), ("hipF.L", "footF.L"),
    ("hip", "hipB.L"), ("hipB.L", "footB.L"),
]


def build_yumekuimogura():
    """
    地面に潜って進み、不意にプレイヤーの近くへ顔を出すモグラ。gajiriと
    同じ関節構成を土台にしつつ、外耳は生やさず(モグラは外耳が退化して
    いる)、体幹をずんぐりと丸め、前脚だけを大きく張り出させて掘削用の
    爪を3本ずつ生やす。尻尾は短く埋もれさせ、目はほとんど退化した点の
    ように小さくする。配色は第三地方(まどろみの茸林)の、宵闇に近い
    夢色のねずみ毛並みに、掘り進んだ土がついた腹まわりの土色を合わせ、
    爪だけ胞子のような淡い黄土色を差して掘削担当だと分かるようにする。
    """
    joints = C.mirrored(YUMEKUIMOGURA_HALF)
    radii = C.mirrored_radii(YUMEKUIMOGURA_RADII_HALF)
    bones = C.mirrored_bones(YUMEKUIMOGURA_BONES_HALF)

    body = C.build_skinned("yumekuimogura", joints, bones, radii, root="chest", subsurf=2)
    fur = C.make_material("yumekuimogura_fur", (0.30, 0.28, 0.35), roughness=0.85)
    belly = C.make_material("yumekuimogura_belly", (0.42, 0.36, 0.30), roughness=0.8)

    # 耳の特別扱いが不要な(外耳がない)ぶん、腹だけを高さで単純に切り分ける
    C.assign_materials_by_region(
        body, [fur, belly],
        lambda c: 1 if c.z < 0.11 else 0,
    )

    extras = []
    claw_mat = C.make_material("yumekuimogura_claw", (0.74, 0.66, 0.42), roughness=0.55)
    for side in (-1.0, 1.0):
        # 前脚に大きな掘削用の爪を3本(ashiatodoriの爪と同じ、回転を
        # 使わない貼り付け方。根元を足の高さに、先端をその下に置く)
        fx, fy, fz = YUMEKUIMOGURA_HALF["footF.L"]
        fx *= side
        claw_depth = 0.05
        for dx, dy in ((-0.026, -0.010), (0.0, -0.022), (0.026, -0.010)):
            claw = C.cone(
                f"yumekuimogura_clawF{side}_{dx}",
                (fx + dx * side, fy + dy, fz - claw_depth * 0.5),
                0.004, 0.020, claw_depth, segments=6,
            )
            C.assign_material(claw, claw_mat)
            extras.append(claw)
        # 後ろ脚は控えめに2本だけ
        bx, by, bz = YUMEKUIMOGURA_HALF["footB.L"]
        bx *= side
        for dx, dy in ((-0.014, -0.006), (0.014, -0.006)):
            claw = C.cone(
                f"yumekuimogura_clawB{side}_{dx}",
                (bx + dx * side, by + dy, bz - 0.024),
                0.003, 0.012, 0.03, segments=6,
            )
            C.assign_material(claw, claw_mat)
            extras.append(claw)

    # ほとんど退化した、点のように小さな目
    for side in (-1.0, 1.0):
        eye = C.uv_sphere(f"yumekuimogura_eye{side}", (0.055 * side, -0.175, 0.170), 0.014,
                          segments=10, rings=8)
        C.assign_material(eye, C.make_material(f"yumekuimogura_eye{side}_m", EYE_DARK, roughness=0.25))
        extras.append(eye)

    nose = C.uv_sphere("yumekuimogura_nose", (0.0, -0.268, 0.118), 0.020,
                       segments=12, rings=8, scale=(1.0, 0.8, 0.7))
    C.assign_material(nose, C.make_material("yumekuimogura_nose_m", (0.70, 0.50, 0.50), roughness=0.4))
    extras.append(nose)

    mesh = C.join([body] + extras, "yumekuimogura")
    armature = C.build_armature("yumekuimogura", joints, bones, mesh, root="chest")
    return [mesh, armature], armature


def yumekuimogura_animations():
    """
    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間)・行き過ぎ・二次揺れを足してある。dieは
    「掘ってきた穴へ逆戻りする」という潜って消える表現で他種族の
    「倒れる→跳ね返る」パターンとは性質が異なるため、跳ね返りは
    追加していない。
    doc本文はattackのツメ段(5→8)を「footF.L/Rを現行の-16から-22まで
    強める」と書いているが、これはタメの値をそのまま深めるだけで爪の
    叩きつけ(タメと逆方向への振り)にならず文脈と矛盾するため、他種族
    (nemurimogura/wasureboneなど)で同種の記述矛盾を解決した際と同じく、
    「元のピーク(footF=18)を同じ増分だけ増幅・前倒しし、元のピーク値を
    行き過ぎの戻り先にする」という規約の基本パターンで解釈して実装した。
    """
    neck, snout = "chest-neck", "neck-snout"
    tail1 = "hip-tail1"
    hipF_L, hipF_R = "chest-hipF.L", "chest-hipF.R"
    footF_L, footF_R = "hipF.L-footF.L", "hipF.R-footF.R"
    hipB_L, hipB_R = "hip-hipB.L", "hip-hipB.R"
    return [
        # 眠りの中、地表の気配をうかがうように鼻先だけをゆっくり動かす。
        # 尻尾(tail1)がneckより3フレーム遅れて追従する二次揺れを追加
        ("idle", [
            (1, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (20, {snout: (8, 0, 4), neck: (-3, 0, 0)}),
            (23, {tail1: (0, 0, 6)}, {"partial": True}),
            (40, {snout: (0, 0, 0), neck: (0, 0, 0)}),
            (43, {tail1: (0, 0, 0)}, {"partial": True}),
        ]),
        # 前脚で土を掻き分けて進む、掘削そのものの歩き方。中間ニュートラル
        # フレームを挟み、脚の踏み出しにメリハリを出す(gajiriと同型)。
        # footF.L/Rの振り幅は維持し「掻き分ける」勢いを保つ
        ("walk", [
            (1, {hipF_L: (26, 0, 10), hipF_R: (-22, 0, -8), hipB_L: (-16, 0, 0), hipB_R: (14, 0, 0),
                 footF_L: (14, 0, 0), footF_R: (-10, 0, 0), tail1: (0, 0, 10)}),
            (4, {hipF_L: (0, 0, 0), hipF_R: (0, 0, 0), hipB_L: (0, 0, 0), hipB_R: (0, 0, 0),
                 footF_L: (0, 0, 0), footF_R: (0, 0, 0), tail1: (0, 0, 0)}),
            (7, {hipF_L: (-22, 0, -8), hipF_R: (26, 0, 10), hipB_L: (14, 0, 0), hipB_R: (-16, 0, 0),
                 footF_L: (-10, 0, 0), footF_R: (14, 0, 0), tail1: (0, 0, -10)}),
            (11, {hipF_L: (0, 0, 0), hipF_R: (0, 0, 0), hipB_L: (0, 0, 0), hipB_R: (0, 0, 0),
                  footF_L: (0, 0, 0), footF_R: (0, 0, 0), tail1: (0, 0, 0)}),
            (14, {hipF_L: (26, 0, 10), hipF_R: (-22, 0, -8), hipB_L: (-16, 0, 0), hipB_R: (14, 0, 0),
                  footF_L: (14, 0, 0), footF_R: (-10, 0, 0), tail1: (0, 0, 10)}),
        ]),
        # 不意に顔を出し、両前脚の爪を振り上げてから叩きつける。タメ
        # (1→5、現行のまま)→LINEARで鋭く叩きつけるツメ(5→8、元のピーク
        # を増幅・前倒し)→行き過ぎ(8→10、元のピーク値へ収まる)→
        # 戻り(10→18)の4段に分ける
        ("attack", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
            (5, {neck: (-18, 0, 0), hipF_L: (-30, 0, 18), hipF_R: (-30, 0, -18),
                 footF_L: (-16, 0, 0), footF_R: (-16, 0, 0)}),
            (8, {neck: (26, 0, 0), hipF_L: (40, 0, -16), hipF_R: (40, 0, 16),
                 footF_L: (24, 0, 0), footF_R: (24, 0, 0)}, {"interp": "LINEAR"}),
            (10, {neck: (20, 0, 0), hipF_L: (34, 0, -14), hipF_R: (34, 0, 14),
                  footF_L: (18, 0, 0), footF_R: (18, 0, 0)}),
            (18, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0),
                  footF_L: (0, 0, 0), footF_R: (0, 0, 0)}),
        ]),
        # 入りをLINEARで鋭くする。振幅はburrowが標準のため現行維持
        ("hit", [
            (1, {neck: (0, 0, 0)}, {"interp": "LINEAR"}),
            (4, {neck: (16, 0, 0), hipF_L: (-12, 0, 6), hipF_R: (-12, 0, -6)}),
            (14, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}),
        ]),
        # 掘ってきた穴へ逆戻りするように、頭から潜って消える。潜り始め
        # (1→10)の初動だけをLINEARで鋭くする
        ("die", [
            (1, {neck: (0, 0, 0), hipF_L: (0, 0, 0), hipF_R: (0, 0, 0)}, {"interp": "LINEAR"}),
            (10, {neck: (30, 0, 0), hipF_L: (24, 0, 10), hipF_R: (24, 0, -10),
                  hipB_L: (-14, 0, 0), hipB_R: (-14, 0, 0)}),
            (24, {neck: (56, 0, 0), hipF_L: (46, 0, 16), hipF_R: (46, 0, -16),
                  hipB_L: (-26, 0, 0), hipB_R: (-26, 0, 0), tail1: (0, 0, 0)}),
        ]),
    ]
# =========================================================================== 一覧
MONSTERS = {
    "purun": (build_purun, purun_animations),
    "kodamausagi": (build_kodamausagi, kodamausagi_animations),
    "kodamagumo": (build_kodamagumo, kodamagumo_animations),
    "akubitokage": (build_akubitokage, akubitokage_animations),
    "gajiri": (build_gajiri, gajiri_animations),
    "mabutamushi": (build_mabutamushi, mabutamushi_animations),
    "tsubute": (build_tsubute, tsubute_animations),
    "madoromi": (build_madoromi, madoromi_animations),
    "honegarami": (build_honegarami, honegarami_animations),
    "kirimizuchi": (build_kirimizuchi, kirimizuchi_animations),
    "nukarumigani": (build_nukarumigani, nukarumigani_animations),
    "ashiatodori": (build_ashiatodori, ashiatodori_animations),
    "wasuremizuchi": (build_wasuremizuchi, wasuremizuchi_animations),
    "kinokootoko": (build_kinokootoko, kinokootoko_animations),
    "houshitobi": (build_houshitobi, houshitobi_animations),
    "nebosukegaeru": (build_nebosukegaeru, nebosukegaeru_animations),
    "madoromigumo": (build_madoromigumo, madoromigumo_animations),
    "kaerukodama": (build_kaerukodama, kaerukodama_animations),
    "yamabikooni": (build_yamabikooni, yamabikooni_animations),
    "nedayamabiko": (build_nedayamabiko, nedayamabiko_animations),
    "yamabikogitsune": (build_yamabikogitsune, yamabikogitsune_animations),
    "kodamagitsune": (build_kodamagitsune, kodamagitsune_animations),
    "kodamaNoNushi": (build_kodamaNoNushi, kodamaNoNushi_animations),
    "menkaburikozo": (build_menkaburikozo, menkaburikozo_animations),
    "honedatami": (build_honedatami, honedatami_animations),
    "kazaridaruma": (build_kazaridaruma, kazaridaruma_animations),
    "kageboushi": (build_kageboushi, kageboushi_animations),
    "chouchinokuri": (build_chouchinokuri, chouchinokuri_animations),
    "wataamenoobake": (build_wataamenoobake, wataamenoobake_animations),
    "yaguramori": (build_yaguramori, yaguramori_animations),
    "misemonoNoNushi": (build_misemonoNoNushi, misemonoNoNushi_animations),
    "yumemayoinokage": (build_yumemayoinokage, yumemayoinokage_animations),
    "yorishironozankyo": (build_yorishironozankyo, yorishironozankyo_animations),
    "fuchiNoNushi": (build_fuchiNoNushi, fuchiNoNushi_animations),
    "shizukuuo": (build_shizukuuo, shizukuuo_animations),
    "urumiguma": (build_urumiguma, urumiguma_animations),
    "nadakaze": (build_nadakaze, nadakaze_animations),
    "shioresakura": (build_shioresakura, shioresakura_animations),
    "mizukagami": (build_mizukagami, mizukagami_animations),
    "nakimushi": (build_nakimushi, nakimushi_animations),
    "namidaguma": (build_namidaguma, namidaguma_animations),
    "nemurimogura": (build_nemurimogura, nemurimogura_animations),
    "nushigaeru": (build_nushigaeru, nushigaeru_animations),
    "oitekeboshi": (build_oitekeboshi, oitekeboshi_animations),
    "oomadoromi": (build_oomadoromi, oomadoromi_animations),
    "oonebosuke": (build_oonebosuke, oonebosuke_animations),
    "subetenopurun": (build_subetenopurun, subetenopurun_animations),
    "honezukanotsukai": (build_honezukanotsukai, honezukanotsukai_animations),
    "hajimeNoYume": (build_hajimeNoYume, hajimeNoYume_animations),
    "honezukaNoNushi": (build_honezukaNoNushi, honezukaNoNushi_animations),
    "horikuiNoNushi": (build_horikuiNoNushi, horikuiNoNushi_animations),
    "horoholocho": (build_horoholocho, horoholocho_animations),
    "ishizuenezumi": (build_ishizuenezumi, ishizuenezumi_animations),
    "kasumiutsubo": (build_kasumiutsubo, kasumiutsubo_animations),
    "katakunagani": (build_katakunagani, katakunagani_animations),
    "matsurinonushi": (build_matsurinonushi, matsurinonushi_animations),
    "mazarinezumi": (build_mazarinezumi, mazarinezumi_animations),
    "mouhitotsunokage": (build_mouhitotsunokage, mouhitotsunokage_animations),
    "moyautsubo": (build_moyautsubo, moyautsubo_animations),
    "surigarasu": (build_surigarasu, surigarasu_animations),
    "tokoshiepurun": (build_tokoshiepurun, tokoshiepurun_animations),
    "wasurebone": (build_wasurebone, wasurebone_animations),
    "wasuregani": (build_wasuregani, wasuregani_animations),
    "yoroimukade": (build_yoroimukade, yoroimukade_animations),
    "yoroioiteke": (build_yoroioiteke, yoroioiteke_animations),
    "yumemirupurun": (build_yumemirupurun, yumemirupurun_animations),
    "yoseatsume": (build_yoseatsume, yoseatsume_animations),
    "yumekuimogura": (build_yumekuimogura, yumekuimogura_animations),
}


def make(name: str):
    build_fn, anim_fn = MONSTERS[name]
    objs, armature = build_fn()
    for clip_name, keyframes in anim_fn():
        C.add_action(armature, clip_name, keyframes)
    return objs


if __name__ == "__main__":
    import sys

    targets = sys.argv[1:] or list(MONSTERS)
    for target in targets:
        C.reset_scene()
        objs = make(target)
        print(f"{target}: 三角形 {C.tri_count(objs)}")
        C.render_preview(target, objs)
        C.export_glb(target, objs, flat=True)
