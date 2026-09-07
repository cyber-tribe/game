"""
ホネガラミ ―― ベースケージ+Subdivision 方式(3体目)。

仕様は `plan/models/honegarami-remake.md`、設定画は
`plan/models/reference-honegarami-sheet.png`。手順は
`handbook/cage-and-2d3d-split.md`。

## 3D / 2D の分担(handbook 手順1)

このキャラは**設定画の書き込み密度が極端に高い**(数十本の骨が絡み合う)。
モンスターの三角形予算は既定 12,000(tests/models.test.ts)。
このキャラは密度が桁違いなので 24,000 へ引き上げてある ―― それでも
描き込みをそのまま形にすることはできない。何を形で持ち、何を塗りへ回すかを先に決める。

| 要素 | 3D | テクスチャ |
|---|---|---|
| 塊の外形(ごつごつした丸い山) | ◎ | ○ |
| 頭蓋の外形・眼窩の穴・鼻腔 | ◎ | ○ |
| 大きな手と指 | ◎ | ○ |
| 蔦の輪(**シルエットを割る大きな弧**) | ◎ | × |
| 絡み合う骨の束(内部の描き込み) | × | ◎ |
| 肋骨(背面の籠) | △ 浅い畝 | ◎ |
| 歯・頭蓋の縫合線・蔦の棘・芽 | × | ◎ |
| 記憶の欠片(結晶) | ◎ 小さな塊 | ○ |
| 忘却札 | ◎ 板 | ◎ 文字 |

**塊を滑らかな球にして骨を描くだけでは「骨のデカールを貼った岩」になる。**
設定画のシルエットは骨の端が四方に突き出してでこぼこしている ―― そこが
このキャラらしさなので、ケージの段階で**骨端のこぶ**を撒いて輪郭を
崩しておく(handbook: 負の空間と輪郭の不規則さは造形側の仕事)。

蔦は**塊から離れて弧を描く**ので、必ず 3D で持つ。ここを塗りにすると
シルエットが丸い山のままになり、最重要記号(記憶の鎖)が消える。

## 設定画の実測

三面図は 3 体とも高さ 221px。`PX` はその 1px あたりのメートル。
全体は 202(幅)× 182(奥行)× 221(高さ)px ―― **ほぼ立方体に近い
ずんぐりした塊**で、「重量級」の読みと一致する。

頭蓋は正面図 x -34.5〜+21.5(幅 57)・高さ 9.5〜37.6%、側面図では
x -78〜-36 ―― つまり**塊の前上部に大きく張り出している**。
"""

from __future__ import annotations

import math

import bpy
import common as C
from mathutils import Vector

NAME = "honegarami"


# ===================================================== 層の on/off
# 制作思想を「設定画の画素を geometry で埋めて一致度を上げる」から
# 「視覚階層を再構築する」へ変えた(外部レビュー)。
#
# 情報量を足すと 骨を増やす → 蔓を増やす → 枝を増やす → 外形は近づく →
# **主役が消える** というループに入る。実際 外形IoU 82% まで来たのに、
# 頭蓋・胸郭・巨大な手という主役は設定画より弱くなった。
#
# 層を明示し、**下位層は上位層を隠さない**という規則で組み直す。
#   1 Hero Anatomy       頭蓋・胸郭・巨大な手・腕・骨盤・脊椎
#   2 Structural Bone    肩腰背の体積。ただし**骨として読める形**に限る
#   3 Major Vine         骨格を拘束する線。外形を作る仕事はさせない
#   4 Secondary / Twig   密度。立体で持つものは厳選する
#   5 Surface Detail     小枝・芽・棘・汚れ。大部分はテクスチャ/カードへ
LAYERS = {
    "hero": True,
    "structural_bone": True,    # 骨のプリミティブで作り直した
    "major_vine": True,
    "secondary": True,   # 96pxで紫の流れを補強する分だけ
    "twig": False,
    "wrap": False,
    "fill": False,
    "cards": True,       # 外周の毛羽立ち(1枚2三角形)
    "halo": True,               # 頭蓋のイバラは Hero の一部として残す
    "hand_cards": True,         # 手は設定画のトレースをカードで貼る
}

CLAY = (0.62, 0.58, 0.55)

HEIGHT = 0.839              # 現行モデルと同じ全高(基準表もこの値)
SHEET_H = 221.0
PX = HEIGHT / SHEET_H


def _z(pct: float) -> float:
    """三面図の高さ%(上端=0)→ 接地からの z(m)。"""
    return (1.0 - pct / 100.0) * HEIGHT


# 1ループあたりの頂点。顔(頭蓋)は別メッシュなので等間隔でよい
LOOP_N = 14
LOOP_ANGLES = [2 * math.pi * i / LOOP_N for i in range(LOOP_N)]
RADIUS_COMP = 1.025
# 芯は**骨より内側**でなければならない。塊が骨の外にはみ出す面が
# 1か所でもあると、そこが滑らかな樽の輪郭になって全体をそう読ませる
CORE_K = 0.86

# --------------------------------------------------------------------- 塊の本体
# (高さ%, 前縁px, 後縁px, 半幅px, 名前)
# 実測の外端には腕・手・蔦の芽が混ざるので、**塊の芯**として一回り内側を
# 採る(腕と手は別メッシュで足す)。芯の外側に骨端のこぶを撒いて輪郭を崩す
# 胴。**樽ではない。** 設定画の正面図を骨格として読み直すと、
# 肩帯(半幅70px)→ 胸郭 → 腰(絞る)→ 骨盤(再び広がる)という
# 縦のリズムがある。第7版までは半幅54px一定の円筒で、
# 「円筒形の籠」に見える最大の原因だった。
#
# ここは骨と骨のあいだの暗がりを埋める芯なので、実測の外形より
# 内側に取る(骨・手・蔦は別に足す)
TORSO_LOOPS = [
    # 頭蓋の後ろまで塊を持ち上げる。ここが低いと、側面で頭蓋の背面が
    # 露出して「胴の前に頭を貼った」ように見える
    # 断面の中心 cy=(前+後)/2 が 頸 -8 → 上背 +10 → 骨盤 -6 と動く。
    # これが**猫背のC字**。第14版は cy がほぼ一定で、側面が
    # 「直立した骨格標本」に見えていた
    (18.0, -30.0, +14.0, 22.0, "nape"),        # 頸は前へ出る
    (24.0, -38.0, +24.0, 32.0, "neck_high"),
    (30.0, -44.0, +38.0, 42.0, "neck"),
    (36.0, -50.0, +62.0, 76.0, "shoulder"),    # 肩帯。外へ張る
    (44.0, -50.0, +70.0, 78.0, "shoulder_low"),  # 上背がいちばん膨らむ
    (52.0, -48.0, +66.0, 62.0, "ribs"),        # 胸郭。ここから絞り始める
    (62.0, -46.0, +56.0, 48.0, "ribs_low"),
    (72.0, -46.0, +44.0, 40.0, "waist"),       # 腰。前へ入る
    (80.0, -50.0, +40.0, 50.0, "pelvis"),      # 骨盤で再び広がる
    (86.0, -48.0, +36.0, 45.0, "pelvis_low"),
    (91.0, -38.0, +26.0, 30.0, "seat"),        # ここで閉じる。設定画は
                                               # これより下が脚と骨の堆積
]

# 骨。**塊を滑らかにして骨を描く方式は捨てた。**
# 第1・2版はどちらも「樽に小さなこぶが付いたもの」にしかならなかった。
# 設定画の輪郭は端から端まで骨の端で刻まれていて、そこがこのキャラの
# 全て ―― つまり**輪郭を作っているのは骨そのもの**で、塊ではない。
#
# そこで塊(TORSO_LOOPS)は「骨の隙間の暗がり」を埋める芯まで縮め、
# 表面に**読める大きさの骨を実際に並べる**。1本を curve_tube の
# 半径プロファイル(太-細-太)で作れば、球を足さずに骨の形になる
# (1本あたり約110三角形)。
BONE_N = 54                 # 設定画は骨が視界を埋め、隙間は細い線                 # 頭蓋まわりを空けるぶん多めに撒く。
                            # 少ないと塊(隙間の影)が広い面で見えてしまう
# 除外するのは**顔の正面だけ**にする。前上へ広く取ると頭蓋の上・後ろにも
# 骨が来ず、側面で大きな滑らかなドームが露出した
SKULL_DIR = Vector((0.0, -0.88, 0.30)).normalized()
SKULL_CLEAR = 0.82          # この内積より顔側なら骨を置かない
# 胸骨・小肋骨の前も空ける。骨を96本に増やしたら正面の胸郭が埋まった
STERN_DIR = Vector((0.0, -0.97, -0.24)).normalized()
STERN_CLEAR = 0.93
BONE_LEN = (0.22, 0.38)     # 骨の長さ m。設定画は骨がほぼ全面を
                            # 覆い、隙間は細い線でしかない
BONE_RAD = (0.016, 0.030)   # 骨の中ほどの太さ m
BONE_END = 1.75             # 端の太さの倍率(骨端のふくらみ)
# 肋骨。背面図の籠。脊椎に沿って左右へ弧を描く
RIB_N = 8
RIB_Z = (34.0, 74.0)        # 高さ%の範囲。上端を下げ、
                            # 腰まで覆わない
RIB_R = 0.018


def _profile(z: float, cy: float, r_front: float, r_back: float, r_side: float
             ) -> list[tuple[float, float, float]]:
    pts = []
    for a in LOOP_ANGLES:
        c, s = math.cos(a), math.sin(a)
        ry = r_front if s < 0 else r_back
        pts.append((r_side * c, cy + ry * s, z))
    return pts


def _rand(i: int, salt: float = 0.0) -> float:
    return (math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1.0


def _loop_at(z: float) -> tuple[float, float, float, float]:
    """高さ z(m) における胴の断面 (cy, r_front, r_back, r_side) を補間する。"""
    zs = [(_z(pct), front, back, side) for pct, front, back, side, _n in TORSO_LOOPS]
    if z >= zs[0][0]:
        _, f, b, s = zs[0]
    elif z <= zs[-1][0]:
        _, f, b, s = zs[-1]
    else:
        for a, bb in zip(zs, zs[1:]):
            if bb[0] <= z <= a[0]:
                t = (a[0] - z) / (a[0] - bb[0])
                f = a[1] + (bb[1] - a[1]) * t
                b = a[2] + (bb[2] - a[2]) * t
                s = a[3] + (bb[3] - a[3]) * t
                break
    cy = (f + b) * 0.5 * PX
    return cy, (cy - f * PX), (b * PX - cy), s * PX


def _mass_radius(nz: Vector, k: float = 1.0) -> Vector:
    """塊の表面のおよその位置。

    第9版までは半幅54px固定の楕円体だった。実際の胴(TORSO_LOOPS)は
    肩で62pxまで張り出すので、**肩では塊が骨より外側**にあり、
    そこだけ滑らかな樽の面が輪郭を作っていた ―― 「骨に樽を巻いた」
    と読める最大の原因。断面表を引いて実際の表面を返す。"""
    top, bot = _z(8.0), _z(97.0)
    cz = (top + bot) * 0.5
    rz = (top - bot) * 0.5
    c = Vector((0.0, 0.0, cz))
    # z を仮定 → 断面を引く → 交点の z を更新、を数回まわす
    r = rz
    for _ in range(4):
        z = cz + nz.z * r
        z = min(max(z, bot), top)
        cy, rf, rb, rs = _loop_at(z)
        # 楕円体近似: 上下端で断面が閉じるよう z 方向へ絞る
        v = (z - cz) / rz
        shrink = max(0.30, (1.0 - v ** 4) ** 0.35)
        ry = (rf if nz.y < 0 else rb) * shrink
        den = ((nz.x / max(rs * shrink, 1e-4)) ** 2
               + (nz.y / max(ry, 1e-4)) ** 2 + (nz.z / rz) ** 2) ** 0.5
        r = 1.0 / max(den, 1e-6)
    z = min(max(cz + nz.z * r, bot), top)
    cy, _rf, _rb, _rs = _loop_at(z)
    return c + Vector((0.0, cy, 0.0)) + nz * r * k


def build_bones() -> list[bpy.types.Object]:
    """絡み合う骨。塊の表面へ**接線方向に**寝かせて並べる。

    放射状に突き刺すと栗のイガになる。設定画の骨は塊に沿って寝ており、
    端だけが輪郭から覗く。中心を表面より少し内側に置き、接線方向へ
    伸ばすことで「積み重なった骨の山」になる。"""
    out = []
    for i in range(BONE_N):
        t = (i + 0.5) / BONE_N
        phi = math.acos(1 - 2 * t * 0.86 - 0.07)
        theta = math.pi * (1 + 5 ** 0.5) * i
        nz = Vector((math.sin(phi) * math.cos(theta),
                     math.sin(phi) * math.sin(theta), math.cos(phi))).normalized()
        # 頭蓋のまわりには置かない。設定画の頭蓋は塊の前上部で
        # **何にも隠されず**いちばん目立つ。ここへ骨を撒くと埋まる
        if nz.dot(SKULL_DIR) > SKULL_CLEAR:
            continue
        # 頭蓋の高さ帯(前〜横)も空ける。真後ろだけは置いてよい
        if nz.z > 0.62 and nz.y < 0.45:
            continue
        # 背面は**肋骨の籠**が主役。ここへ無作為の骨を撒くと籠が埋まる。
        # 円錐ではなく帯で空ける(第15版前半は狭すぎて効いていなかった)
        if nz.y > 0.60 and abs(nz.z) < 0.55:
            continue
        # 胸骨の前を空けるのは**胸骨の高さ帯だけ**。全高で空けると
        # 腹まで骨が来ず、大きな滑らかな面が正面に残った(第10版)
        if nz.dot(STERN_DIR) > STERN_CLEAR and nz.z > -0.10:
            continue
        mid = _mass_radius(nz, 0.97)
        # 接線方向をひとつ選ぶ(向きは擬似乱数で散らす)
        t1 = nz.cross(Vector((0, 0, 1)))
        if t1.length < 1e-3:
            t1 = nz.cross(Vector((1, 0, 0)))
        t1.normalize()
        t2 = nz.cross(t1)
        # 向きは擬似乱数だけでなく、位置の緯度でもずらす。乱数だけだと
        # 隣り合う骨が同じ向きに揃って見える帯ができた
        ang = (_rand(i, 7.0) * math.tau + phi * 2.3 + theta * 0.5) % math.tau
        dirv = (t1 * math.cos(ang) + t2 * math.sin(ang)).normalized()
        # 骨の種類。設定画は長骨ばかりではなく、短く太い椎骨や小さな
        # 破片が混ざる。3種を回して同じソーセージの繰り返しを避ける
        kind = i % 3
        if kind == 0:            # 長骨(太-細-太)
            ln = BONE_LEN[0] + (BONE_LEN[1] - BONE_LEN[0]) * _rand(i)
            rd = BONE_RAD[0] + (BONE_RAD[1] - BONE_RAD[0]) * _rand(i, 3.0)
            prof = [rd * BONE_END, rd, rd * BONE_END]
        elif kind == 1:          # 椎骨・短く太い塊
            ln = BONE_LEN[0] * 0.42
            rd = BONE_RAD[1] * (1.15 + 0.3 * _rand(i, 5.0))
            prof = [rd * 0.8, rd, rd * 0.8]
        else:                    # 破片(片端だけ太い)。極端な太→細は
            # 断面の粗さが目立って「平たい六角の石」に見えたので、
            # 比を穏やかにする
            ln = BONE_LEN[0] * (0.6 + 0.4 * _rand(i, 9.0))
            rd = BONE_RAD[0] * (1.0 + 0.4 * _rand(i, 11.0))
            prof = [rd * 1.35, rd * 1.05, rd * 0.75]
        bend = nz * ln * 0.10
        p0 = mid - dirv * ln * 0.5
        p1 = mid + dirv * ln * 0.5
        # 破片は断面を細かく(bevel_resolution=1 の六角柱は、短くて太い
        # 形だと facet が目立って「平たい六角の板」に見えた)
        # LOD: ゲーム表示で骨1本は数十pxなので断面は4面で足りる
        out.append(C.curve_tube(f"{NAME}_bone{i}", [p0, mid + bend, p1],
                                prof, resolution=2, bevel_resolution=0))
    return out


# 塊の下半分は、設定画では**垂れ下がる骨のフリンジ**になっている
# (指のような細い骨が下向きに並ぶ)。ここを樽のまま残すと
# 「骨の山」ではなく「骨を貼った樽」に見える
SKIRT_N = 26
SKIRT_Z = (74.0, 88.0)      # 生え際の高さ%。胸郭より下だけ
SKIRT_LEN = (0.13, 0.25)    # 垂れる長さ m
SKIRT_R = (0.012, 0.020)


def build_skirt() -> list[bpy.types.Object]:
    out = []
    for i in range(SKIRT_N):
        a = math.tau * (i + 0.5) / SKIRT_N + _rand(i, 57.0) * 0.18
        f = _rand(i, 21.0)
        pct = SKIRT_Z[0] + (SKIRT_Z[1] - SKIRT_Z[0]) * f
        nz = Vector((math.cos(a), math.sin(a), 0.0))
        # 脚のあいだ(正面の中央下)は空ける。設定画はここが**抜けて
        # いて**、2本の脚と負の空間が下部シルエットを作っている。
        # 第11版は全周へ垂らしたので「草のスカート」に見えた
        if nz.y < -0.30 and 0.42 < abs(nz.x) < 0.95:
            continue
        cy, rf, rb, rs = _loop_at(_z(pct))
        ry = rf if nz.y < 0 else rb
        base = Vector((nz.x * rs, cy + nz.y * ry, _z(pct)))
        ln = SKIRT_LEN[0] + (SKIRT_LEN[1] - SKIRT_LEN[0]) * _rand(i, 33.0)
        rd = SKIRT_R[0] + (SKIRT_R[1] - SKIRT_R[0]) * _rand(i, 41.0)
        # 真下へ揃えると簾になる。向きを散らして**積もった骨**にする
        tilt = (_rand(i, 63.0) - 0.5) * 1.25
        swing = (_rand(i, 71.0) - 0.5) * 1.10
        side = Vector((-nz.y, nz.x, 0.0))
        dirv = (Vector((0, 0, -1.0)) + nz * tilt + side * swing).normalized()
        # 骨の断面。3種を回して同じ形の繰り返しを避ける(骨本体と同じ)
        kind = i % 3
        if kind == 0:
            prof = [rd * 1.7, rd, rd * 1.55]        # 長骨
        elif kind == 1:
            ln *= 0.55
            prof = [rd * 1.25, rd * 1.5, rd * 1.2]  # 短く太い椎骨
        else:
            ln *= 0.78
            prof = [rd * 1.5, rd * 1.1, rd * 0.7]   # 破片
        bend = side * ln * 0.12 * (1 if kind == 0 else -1)
        tip = base + dirv * ln
        floor = _z(FOOT_C[2]) - FOOT_R[2] * 0.62   # 足裏より上で止める
        if tip.z < floor and dirv.z < -1e-4:
            ln *= (floor - base.z) / (dirv.z * ln)
            tip = base + dirv * ln
        mid = base + dirv * ln * 0.5 + bend
        out.append(C.curve_tube(f"{NAME}_skirt{i}", [base, mid, tip],
                                prof, resolution=2, bevel_resolution=0))
    return out


# 正面の胸骨と小肋骨。設定画の正面図では頭蓋のすぐ下に小さな胸郭が
# あり、ここが空くと暗い塊が広い面で見えてしまう
STERN_Z = (40.0, 66.0)
STERN_N = 5


def build_sternum() -> list[bpy.types.Object]:
    out = []
    # 塊の前縁(40〜66% で -46〜-48px)より**前**に出す。中に置くと
    # 埋まって見えない(第6版でそうなった)
    y0 = -58.0 * PX
    out.append(C.curve_tube(f"{NAME}_sternum",
                            [Vector((0.0, y0, _z(STERN_Z[0] - 3))),
                             Vector((0.0, y0 - 0.012, _z((STERN_Z[0] + STERN_Z[1]) * 0.5))),
                             Vector((0.0, y0, _z(STERN_Z[1] + 3)))],
                            [0.016, 0.020, 0.014], bevel_resolution=1))
    # 第9版は中点・終点の z 落差が小さく、正面から**水平の棒が並んだ
    # 木琴**に見えた。設定画の肋骨は脊椎側から下外へ大きく垂れる弧。
    # 落差を肋骨の幅に比例させ、外端を胴の側面まで回り込ませる
    for i in range(STERN_N):
        f = i / (STERN_N - 1)
        z = _z(STERN_Z[0] + (STERN_Z[1] - STERN_Z[0]) * f)
        w = (0.55 + 0.45 * math.sin(math.pi * (0.28 + 0.72 * f))) * 50.0 * PX
        drop = w * (0.30 + 0.35 * f)      # 下側の肋骨ほど深く垂れる
        for side in (-1.0, 1.0):
            pts = [Vector((0.0, y0 - 0.004, z)),
                   Vector((w * 0.62 * side, y0 + 0.012, z - drop * 0.28)),
                   Vector((w * 1.02 * side, y0 + 0.052, z - drop * 0.78)),
                   Vector((w * 1.06 * side, y0 + 0.115, z - drop))]
            out.append(C.curve_tube(f"{NAME}_srib{i}{'L' if side > 0 else 'R'}",
                                    pts, [0.012, 0.011, 0.009, 0.007],
                                    bevel_resolution=1))
    return out


# 頭蓋へ架かる骨。設定画では頭蓋の上と後ろにも骨が渡っていて、
# 頭が「塊の一部」になっている。ランダムな散布では顔を隠す危険が
# あるので、ここだけ明示的に置く
# 設定画から拾った**意味のある非対称**。ランダムノイズではなく、
# 左右で役割の違う構造を置く(評価の項目9)
ASYM_BONES = [
    ((-64.0, -20.0, 40.0), (-30.0, +30.0, 58.0), 0.030),   # 左肩を太い骨が拘束
    ((-28.0, +14.0, 16.0), (-52.0, -6.0, 34.0), 0.022),    # 左頭頂から下る
    ((52.0, +20.0, 74.0), (24.0, +44.0, 88.0), 0.026),     # 右腰で分岐
]


def build_asym() -> list[bpy.types.Object]:
    out = []
    for i, (a, b, r) in enumerate(ASYM_BONES):
        p0 = Vector((a[0] * PX, a[1] * PX, _z(a[2])))
        p1 = Vector((b[0] * PX, b[1] * PX, _z(b[2])))
        mid = (p0 + p1) * 0.5 + Vector((0, -0.014, 0.010))
        out.append(C.curve_tube(f"{NAME}_asym{i}", [p0, mid, p1],
                                [r * 1.5, r, r * 1.4], resolution=2, bevel_resolution=0))
    return out


# 肩甲帯。設定画の正面は**頭蓋の左右から大きな肩が張り出す**。
# 第14版はここが無く、胸郭がそのまま腕へつながって樽に見えていた。
# (始点px, 終点px, 太さm)  x は片側、y は前後、3つめは高さ%
SHOULDER_BONES = [
    ((10.0, -18.0, 30.0), (56.0, -30.0, 37.0), 0.024),   # 鎖骨
    ((6.0, +40.0, 32.0), (52.0, +26.0, 40.0), 0.028),    # 肩甲棘
    ((52.0, -30.0, 37.0), (58.0, +26.0, 41.0), 0.026),   # 肩峰(前後をつなぐ)
    ((30.0, +34.0, 38.0), (60.0, +6.0, 48.0), 0.022),    # 肩甲骨の下縁
]


def build_shoulders() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        for i, (a, b, r) in enumerate(SHOULDER_BONES):
            p0 = Vector((a[0] * PX * side, a[1] * PX, _z(a[2])))
            p1 = Vector((b[0] * PX * side, b[1] * PX, _z(b[2])))
            mid = (p0 + p1) * 0.5 + Vector((0, 0, -0.008))
            out.append(C.curve_tube(f"{NAME}_clav{tag}{i}", [p0, mid, p1],
                                    [r * 1.2, r, r * 1.35], resolution=2, bevel_resolution=0))
    return out


# 骨盤。設定画の下半身は**腸骨の翼 → 大腿 → 膝 → 下腿 → 巨大な足**。
# 第14版は胸郭の下から細い骨が数本ぶら下がるだけで、
# 「重たい怪物が立っている」感じが出ていなかった
PELVIS_BONES = [
    ((8.0, +18.0, 73.0), (52.0, -6.0, 80.0), 0.038),     # 腸骨の翼
    ((52.0, -6.0, 80.0), (42.0, +16.0, 89.0), 0.040),    # 寛骨臼へ下る
    ((6.0, -26.0, 79.0), (38.0, -16.0, 87.0), 0.032),    # 恥骨
    ((4.0, +30.0, 76.0), (26.0, +26.0, 88.0), 0.030),    # 仙骨の翼
]


def build_pelvis() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        for i, (a, b, r) in enumerate(PELVIS_BONES):
            p0 = Vector((a[0] * PX * side, a[1] * PX, _z(a[2])))
            p1 = Vector((b[0] * PX * side, b[1] * PX, _z(b[2])))
            mid = (p0 + p1) * 0.5 + Vector((0, -0.010, 0.004))
            out.append(C.curve_tube(f"{NAME}_pelv{tag}{i}", [p0, mid, p1],
                                    [r * 1.3, r, r * 1.25], resolution=2, bevel_resolution=0))
    return out


SKULL_ARCH = [
    # (始点px, 終点px)  (x, y, 高さ%)
    ((-34.0, -18.0, 14.0), (30.0, +6.0, 22.0)),
    ((36.0, -22.0, 12.0), (-26.0, +10.0, 26.0)),
    ((-18.0, +2.0, 8.0), (22.0, -14.0, 30.0)),
    ((26.0, +8.0, 18.0), (-30.0, -10.0, 34.0)),
    # 頭頂〜後頭部。ここが空くと側面で大きな滑らかなドームが残る
    ((-40.0, +6.0, 24.0), (34.0, +30.0, 36.0)),
    ((38.0, +2.0, 22.0), (-34.0, +34.0, 38.0)),
]


def build_skull_arch() -> list[bpy.types.Object]:
    out = []
    for i, (a, b) in enumerate(SKULL_ARCH):
        p0 = Vector((a[0] * PX, a[1] * PX, _z(a[2])))
        p1 = Vector((b[0] * PX, b[1] * PX, _z(b[2])))
        mid = (p0 + p1) * 0.5 + Vector((0, 0.02, 0.02))
        out.append(C.curve_tube(f"{NAME}_arch{i}", [p0, mid, p1],
                                [0.022, 0.016, 0.022], resolution=2, bevel_resolution=0))
    return out


def build_ribs() -> list[bpy.types.Object]:
    """肋骨の籠と脊椎。背面図でいちばん目立つ構造なので形で持つ。"""
    out = []
    def back_at(pct: float, out_m: float = 0.016) -> Vector:
        z = _z(pct)
        cy, _rf, rb, _rs = _loop_at(z)
        return Vector((0.0, cy + rb + out_m, z))

    # 脊椎は塊の背面をなぞる ―― 猫背をそのまま拾う
    spine = [back_at(RIB_Z[0] - 10), back_at(RIB_Z[0] + 12),
             back_at(RIB_Z[1] - 6), back_at(RIB_Z[1] + 12)]
    out.append(C.curve_tube(f"{NAME}_spine", spine,
                            [0.022, 0.031, 0.028, 0.022],
                            resolution=2, bevel_resolution=1))
    # **意図的な崩し**は3か所だけ。乱数で全体をガタつかせると
    # 「ノイズを掛けた教科書」になるので、欠け・短縮・曲がりを1つずつ
    BREAK = {(2, -1.0): "gone", (5, 1.0): "short", (6, -1.0): "bent"}
    for i in range(RIB_N):
        f = i / (RIB_N - 1)
        pct = RIB_Z[0] + (RIB_Z[1] - RIB_Z[0]) * f
        z = _z(pct)
        cy, _rf, rb, rs = _loop_at(z)
        root = cy + rb + 0.046
        # 上ほど広く、下へ行くほど明確に絞る(逆卵型)。第14版は
        # 幅がほぼ一定で「肋骨製の樽」に見えていた
        w = (1.0 - 0.50 * f * f - 0.18 * f) * rs * 1.10
        for side in (-1.0, 1.0):
            flaw = BREAK.get((i, side))
            if flaw == "gone":
                continue
            ww = w * (0.62 if flaw == "short" else 1.0)
            drop = 0.014 + 0.028 * f
            pts = [Vector((0.0, root, z)),
                   Vector((ww * 0.72 * side, root - rb * 0.36, z - drop)),
                   Vector((ww * side, cy + rb * 0.18,
                           z - drop * 2.4 - (0.030 if flaw == "bent" else 0.0)))]
            rr = RIB_R * (1.0 - 0.30 * f)
            out.append(C.curve_tube(f"{NAME}_rib{i}{'L' if side > 0 else 'R'}",
                                    pts, [rr, rr, rr * 0.75],
                                    bevel_resolution=1))
    return out


def build_mass_cage() -> tuple[bpy.types.Object, bpy.types.Object]:
    """骨の塊(芯+骨端のこぶ)のケージと Subdivision 済みメッシュ。"""
    k = RADIUS_COMP * CORE_K
    sections = []
    for pct, front, back, side, _n in TORSO_LOOPS:
        cy = (front + back) * 0.5 * PX
        sections.append(_profile(_z(pct), cy,
                                 (cy - front * PX) * k, (back * PX - cy) * k,
                                 side * PX * k))
    cage = C.section_loft(f"{NAME}_cage", sections, smooth=False,
                          cap_top=True, cap_bottom=True)
    mass = _copy_object(cage, f"{NAME}_mass")
    # 芯は隙間の暗がりを埋めるだけで輪郭に出ない。2段は無駄
    _subdivide(mass, 0)
    return cage, mass


# ----------------------------------------------------------------------- 頭蓋
# 正面 x -34.5〜+21.5(幅57)/ 高さ 9.5〜37.6%、側面 x -78〜-36。
# 塊の前上部へ大きく張り出す。眼窩は**穴として掘る**(このキャラの
# シルエットの要。あくびとかげの目とは逆で、ここは彫ってよい)
# 頭蓋。**このキャラの顔そのもの。**設定画を骨格として読み直すと、
# 高さ 9〜43%(全高の34%)、頬骨での半幅 25.5px。第7版までは
# 「球に顔を描いた」形で、額・頬骨・上顎・歯列・下顎の前後構造が無く、
# かわいい記号的ドクロになっていた。
#
# 3D で成立させるのは**シルエットと大きな陰影**まで。人体解剖の
# 精度は要らないが、下の6つは形で持つ:
#   広い額 / 張った頬骨 / 深い眼窩 / 骨格的な鼻腔 / 前へ出る上顎 / 歯列
# y は胴の前縁(30〜44% で -30〜-46px)より**後ろ**に置く。-62 では
# 頭蓋が首の上に突き出て、側面で亀のように見えた。設定画の頭蓋は
# 塊の中に埋まっていて、顔だけが出ている
SKULL_C = (-2.0, -40.0, 24.5)     # 頭蓋の中心 px (x, y, 高さ%)
SKULL_H = 62.0                    # 高さ px(全高の28% × 221px)
SKULL_N = 24   # 眼窩は彫らずトレースで持つので、角度解像度は
               # 輪郭の滑らかさのぶんだけあればよい
# (t, rx, ry, cy)  t=0 が頭頂、1 が下顎の下端
# 半幅は設定画の実測 35px(第8版までは 25.5 で、胴に対して頭が
# 小さく「大きな身体に小さな頭」になっていた)
# 設定画のグリッド実測(scratchpad/hone/ref_skull_front.png、5%刻み)
#   頭頂 h10.5% / 歯列の下端 h38.5% → **高さは全高の28%**
#   最大幅は h25〜27%(t=0.52〜0.59)= 頬骨。全幅の29.5%
#   眼窩の中心は h26.7% = **t=0.58 で、最大幅より下**
#   顎は h35% で全幅16.5%まで急に絞る
# 第2版までは高さ34%・眼窩 t=0.560 で、**縦長で目が高い**顔だった。
SKULL_RINGS = [
    (0.00, 5.0, 6.0, +3.0),
    (0.07, 20.6, 20.0, +2.0),
    (0.16, 25.2, 24.5, +0.5),
    (0.26, 27.4, 27.0, -1.0),
    (0.34, 28.3, 28.0, -2.5),
    (0.44, 29.3, 28.6, -4.5),
    (0.49, 29.6, 28.5, -5.5),
    (0.53, 29.8, 28.4, -6.5),    # 頬骨。ここが最大幅
    (0.58, 29.2, 28.2, -7.8),
    (0.63, 28.0, 27.8, -9.4),
    (0.70, 25.6, 26.6, -11.5),
    (0.77, 20.4, 23.4, -13.5),   # ここから急に絞る(上顎を狭める)
    (0.85, 16.2, 20.4, -14.5),
    (0.93, 13.8, 17.4, -14.0),
    (1.00, 12.0, 13.8, -12.0),
]
# 落ち込み(方位角deg, t, 角度半幅deg, t半幅, 押し込み比)。0 が +X、-90 が前
SKULL_DENTS = [
    # **眼窩は彫らない。** 設定画を2Dでトレースして塗りで持つ方針に
    # 変えた。深く彫ると (a) 塗りの穴と彫りの穴が45度でずれる
    # (b) 低ポリだと縁がギザつく、の両方に悩まされる。
    # 陰影のために浅く残すだけにする
    (-55.0, 0.545, 23.0, 0.170, 0.16),   # 右の眼窩(浅い)
    (-125.0, 0.545, 23.0, 0.170, 0.16),  # 左の眼窩(浅い)
    (-90.0, 0.755, 11.5, 0.085, 0.14),   # 鼻腔。縦長の逆三角寄り
    (-34.0, 0.70, 20.0, 0.090, 0.30),   # 右の頬。眼窩の外〜頬骨下を削る
    (-146.0, 0.70, 20.0, 0.090, 0.30),  # 左の頬
    (-90.0, 0.93, 26.0, 0.055, 0.08),   # 口腔(浅い)
]
# 塗りで黒く落とすのは**眼窩と鼻腔だけ**。頬のくぼみや口腔も
# SKULL_DENTS に入っているが、それらまで黒くすると顔の下半分が
# 一枚の黒い面になる(第2版でそうなった)
SKULL_HOLES = SKULL_DENTS[:2] + [SKULL_DENTS[2]]
DENT_SHARP = 0.72          # 1 未満 = 底が平らで壁が立つ
# 頬骨の張り出し(方位角deg, t, 角度半幅, t半幅, 押し出し比)
SKULL_BUMPS = [
    (-28.0, 0.62, 22.0, 0.09, 0.10),   # 右の頬骨
    (-152.0, 0.62, 22.0, 0.09, 0.10),  # 左の頬骨
    (-90.0, 0.26, 40.0, 0.10, 0.06),   # 額
    (-64.0, 0.300, 25.0, 0.042, 0.068),  # 右の眉弓
    (-116.0, 0.300, 25.0, 0.042, 0.068),  # 左の眉弓
    (-90.0, 0.56, 10.0, 0.060, 0.09),   # 鼻梁(眼窩のあいだ)
    (-56.0, 0.715, 22.0, 0.045, 0.085),  # 右の眼窩下縁
    (-124.0, 0.715, 22.0, 0.045, 0.085),  # 左の眼窩下縁
    (90.0, 0.38, 45.0, 0.12, 0.09),    # 後頭部の膨らみ。側面が卵のまま
                                       # 滑らかで「球に顔を描いた」ままだった
    (0.0, 0.54, 26.0, 0.10, 0.05),     # 右の側頭
    (180.0, 0.54, 26.0, 0.10, 0.05),   # 左の側頭
]
# 後頭部と頭頂の境の稜線(側面のシルエットに角を作る)
SKULL_DENTS_EXTRA = [(90.0, 0.16, 34.0, 0.06, 0.07)]
TOOTH_T = (0.86, 0.99)            # 歯列の帯(t)
TOOTH_N = 7


def _skull_ring(t: float, rx: float, ry: float, cy: float
                ) -> list[tuple[float, float, float]]:
    return [(rx * math.cos(2 * math.pi * i / SKULL_N),
             cy + ry * math.sin(2 * math.pi * i / SKULL_N), t)
            for i in range(SKULL_N)]


def _sculpt_skull(rings: list[list[tuple[float, float, float]]]) -> None:
    """眼窩・鼻腔を押し込み、頬骨・額を押し出す。"""
    for sec in rings:
        for i, (x, y, t) in enumerate(sec):
            deg = math.degrees(math.atan2(y, x))
            k = 0.0
            for da, dt, hw, ht, depth in SKULL_DENTS + SKULL_DENTS_EXTRA:
                d1 = abs((deg - da + 180.0) % 360.0 - 180.0) / hw
                d2 = abs(t - dt) / ht
                if d1 < 1.0 and d2 < 1.0:
                    k = min(k, -((1 - d1 * d1) * (1 - d2 * d2)) ** DENT_SHARP * depth)
            for da, dt, hw, ht, out in SKULL_BUMPS:
                d1 = abs((deg - da + 180.0) % 360.0 - 180.0) / hw
                d2 = abs(t - dt) / ht
                if d1 < 1.0 and d2 < 1.0:
                    k = max(k, ((1 - d1 * d1) * (1 - d2 * d2)) * out)
            if k:
                sec[i] = (x * (1 + k), y * (1 + k), t)




def _skull_point(deg: float, t: float, k: float = 1.0) -> Vector:
    """頭蓋表面の (方位角deg, t) に対応する点。k で内外へずらす。"""
    rings = SKULL_RINGS
    t = min(max(t, rings[0][0]), rings[-1][0])
    for a, b in zip(rings, rings[1:]):
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / max(b[0] - a[0], 1e-6)
            rx = a[1] + (b[1] - a[1]) * f
            ry = a[2] + (b[2] - a[2]) * f
            cy = a[3] + (b[3] - a[3]) * f
            break
    r = math.radians(deg)
    cx, cy0 = SKULL_C[0] * PX, SKULL_C[1] * PX
    top = _z(SKULL_C[2]) + SKULL_H * 0.5 * PX
    return Vector((cx + rx * math.cos(r) * k * PX,
                   cy0 + (cy + ry * math.sin(r) * k) * PX,
                   top - t * SKULL_H * PX))


def build_skull() -> list[bpy.types.Object]:
    cx, cy0, cz = SKULL_C[0] * PX, SKULL_C[1] * PX, _z(SKULL_C[2])
    top = cz + SKULL_H * 0.5 * PX
    rings = [_skull_ring(t, rx, ry, cyy) for t, rx, ry, cyy in SKULL_RINGS]
    _sculpt_skull(rings)
    sections = [[(cx + x * PX, cy0 + y * PX, top - t * SKULL_H * PX)
                 for x, y, t in sec] for sec in rings]
    skull = C.section_loft(f"{NAME}_skull", sections, smooth=False,
                           cap_top=True, cap_bottom=True)
    _subdivide(skull, 1)
    out = [skull]
    # 歯。**塗りでは正面から読めなかった**(上顎の下面が下を向くため)。
    # 小さな塊を並べて形で持つ
    # 歯は**顎の面に沿わせる**。固定半径19.5pxで並べていたので、
    # 顎を実測どおり細くしたら顎より外へ出て「入れ歯」に見えた
    tmid = (TOOTH_T[0] + TOOTH_T[1]) * 0.5
    for i in range(TOOTH_N):
        f = i / (TOOTH_N - 1)
        deg = -134.0 + 88.0 * f
        pos = _skull_point(deg, tmid, 0.93)
        out.append(C.uv_sphere(f"{NAME}_tooth{i}", pos, 0.011,
                               segments=5, rings=3, scale=(1.0, 1.0, 1.6)))
    return out


# ------------------------------------------------------------------- 腕と手
# 設定画の腕は塊の左右から下りて、**大きな手**が地面近くに着く。
# 正面図で手は |x| 70〜96px、高さ 70〜92%
# 腕。設定画の腕には **上腕 → 肘 → 前腕(2本) → 手根 → 大きな手** という
# 骨の節がある。第7版までは肩から手まで一本の湾曲した棒で、
# 「骨」ではなく「棒」に見えていた。
# 実測: 手は高さ 71〜92%、|x| 60〜94px ―― **非常に大きい**
ARM_JOINTS = [
    # (x, y, 高さ%)  x は片側
    (52.0, -12.0, 34.0),    # 肩。胴の中に埋める
    (70.0, -6.0, 58.0),     # 肘。設定画の腕は脇に沿って下りる
    (74.0, -22.0, 63.0),    # 手根
]
UPPER_R = (0.034, 0.028)   # 手より細いが、束としては見える太さ
FORE_R = (0.026, 0.021)   # 96px判定で手の区画の上部(前腕)が空いていた     # 前腕は2本(橈骨・尺骨)に分ける
FORE_SPLIT = 0.042
# 設定画の手は**垂れ下がって**いて、正面から指が縦の棒として読める。
# 第15版前半は指を前(カメラ方向)へ伸ばしたので短縮して消え、
# 掌の球だけが残って「メイス」に見えた
# 設定画のグリッド実測(scratchpad/hone/ref_hand_grid.png、5%刻み)
#   手全体 x2〜24% / h66〜91% → **45px 幅 × 52px 高さの扇**
#   手根+掌 x8〜22% / h66〜75% → 28×20px の平たい塊
#   指は h74〜91% で、指先は x4〜16% ―― つまり**体の外側へ非対称に開く**
#   (内側の指先は掌の真下、外側の指先は 19px 外へ)
# 第2版までは 38px 幅 × 76px 高さで、細長く体に沿って垂れていた。
HAND_C = (86.0, -34.0, 73.0)
# 実測から直接:掌 28×20px(=0.106×0.076m)、指の長さ 32px(0.121m)、
# 指の太さ 5px(直径0.019m → 半径0.0095)
# 96px判定で手の区画の骨色が 設定画51% に対しモデル29〜33%(0.57〜0.66)
# しかなかった。ここは**解剖学的な正しさより、96pxで左右にベージュの
# 大きな塊があること**を優先して実測より大きく作る
HAND_R = 0.092                   # 掌の基準半径
HAND_SCALE = (1.00, 0.42, 0.72)  # 横に広く、前後に薄い板。
                                 # 球に近いと「玉ねぎ」に見える
FINGER_N = 7
FINGER_SPREAD = 40.0   # 指の広がり px(左右)
FINGER_OUT = 36.0      # **外側への非対称な開き** px
# 指先は設定画どおり**全高の91%で止める**。ここを伸ばすと指が接地点に
# なって足が浮く(実際 0.215 にしたら指先100%・足95.8%になった)。
# 96px判定の区画は、指の**長さ**ではなく幅と足元の骨で埋める
FINGER_DROP = 0.100    # 指先が落ちる高さ m
FINGER_FWD = 22.0      # 前へ出る量 px
FINGER_R = 0.026       # 指の**根元**の太さ(半径)。96pxで針金に見えた。
                       # 0.026 では指が丸太になっていた
KNUCKLE = 1.45         # 関節のこぶの倍率
# 指ごとの (広がり, 長さ, 前へ出る量, 内へ巻く量)
FINGER_VAR = [
    (1.00, 1.00, 1.00, 0.30),
    (0.74, 0.86, 0.52, 0.05),
    (0.58, 1.08, 1.30, -0.20),
    (0.96, 0.76, 0.82, 0.58),
]


def build_arms() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        sh, el, wr = [Vector((q[0] * PX * side, q[1] * PX, _z(q[2])))
                      for q in ARM_JOINTS]
        # 上腕は**1本の管ではなく骨束**。設定画の腕は複数の骨が
        # 寄り集まっていて、単管だと「棒」に見える
        uaxis = (el - sh).normalized()
        uoff = uaxis.cross(Vector((0, 0, 1)))
        if uoff.length < 1e-3:
            uoff = uaxis.cross(Vector((1, 0, 0)))
        uoff.normalize()
        uoff2 = uaxis.cross(uoff)
        for k, (ou, ov, rr, lo, hi_) in enumerate((
                (0.0, 0.0, 1.0, 0.00, 1.00), (0.90, 0.45, 0.66, 0.12, 0.94),
                (-0.80, -0.62, 0.58, 0.06, 0.88))):
            d = uoff * (0.036 * ou) + uoff2 * (0.036 * ov)
            a0 = sh + (el - sh) * lo
            a1 = sh + (el - sh) * hi_
            out.append(C.curve_tube(f"{NAME}_upper{tag}{k}",
                                    [a0 + d * 0.5, (a0 + a1) * 0.5 + d, a1 + d * 0.7],
                                    [UPPER_R[0] * rr, UPPER_R[0] * 0.85 * rr,
                                     UPPER_R[1] * rr],
                                    bevel_resolution=1))
        axis = (wr - el).normalized()
        off = axis.cross(Vector((0, 0, 1)))
        if off.length < 1e-3:
            off = axis.cross(Vector((1, 0, 0)))
        off.normalize()
        for k, sgn in enumerate((-1.0, 1.0, 0.35, -0.45, 0.55)):
            d = off * (FORE_SPLIT * 0.5 * sgn)
            out.append(C.curve_tube(f"{NAME}_fore{tag}{k}",
                                    [el + d * 0.4, (el + wr) * 0.5 + d, wr + d * 0.5],
                                    [FORE_R[0], FORE_R[0] * 0.9, FORE_R[1]],
                                    bevel_resolution=1))
        hc = Vector((HAND_C[0] * PX * side, HAND_C[1] * PX, _z(HAND_C[2])))
        if LAYERS.get("hand_cards", True):
            # 手はトレースしたカードで持つ(build_hand_cards)。
            # 手首の関節だけ残して腕とつなぐ
            out.append(C.uv_sphere(f"{NAME}_carpus{tag}", (wr + hc) * 0.5, 0.030,
                                   segments=6, rings=5))
            continue
        out.append(C.uv_sphere(f"{NAME}_carpus{tag}", (wr + hc) * 0.5, 0.030,
                               segments=6, rings=5))
        # 掌は**手根骨の集まり**。1個の滑らかな球だと「玉ねぎ」に見える。
        # 3つの塊を横に並べ、大きさと高さを変えて骨の寄り集まりにする
        for k, (ox, oz, sc_) in enumerate(((-0.55, 0.10, 0.72),
                                           (0.05, -0.05, 1.00),
                                           (0.62, 0.14, 0.66))):
            c0 = hc + Vector((ox * HAND_R * HAND_SCALE[0] * side, 0.0,
                              oz * HAND_R * HAND_SCALE[2]))
            out.append(C.uv_sphere(f"{NAME}_hand{tag}{k}", c0, HAND_R * sc_,
                                   segments=7, rings=5,
                                   scale=(HAND_SCALE[0] * 0.72, HAND_SCALE[1],
                                          HAND_SCALE[2])))
        base = hc + Vector((0.0, 0.0, -HAND_R * HAND_SCALE[2] * 0.85))
        # 中手骨の帯。掌と指のあいだを埋めて「束」にする
        for k in range(4):
            tt = (k - 1.5) / 3.0
            m0 = hc + Vector((tt * HAND_R * 1.15 * side, 0.0,
                              -HAND_R * HAND_SCALE[2] * 0.25))
            m1 = base + Vector((tt * HAND_R * 1.55 * side, -0.008,
                                -FINGER_DROP * 0.16))
            out.append(C.curve_tube(f"{NAME}_meta{tag}{k}", [m0, (m0 + m1) * 0.5, m1],
                                    [FINGER_R * 1.15, FINGER_R * 0.95,
                                     FINGER_R * 1.25],
                                    resolution=2, bevel_resolution=0))
        for f in range(FINGER_N):
            t = (f - (FINGER_N - 1) / 2) / max(1, FINGER_N - 1)
            sp, lf, fw, curl = FINGER_VAR[(f + (0 if side > 0 else 2))
                                          % len(FINGER_VAR)]
            drop = FINGER_DROP * lf
            # 扇は**外側へ**開く。設定画の指先は内側が掌の真下、
            # 外側が19px外。左右対称に開くと「熊手」に見える
            out_t = (f / max(FINGER_N - 1, 1))       # 0=内側 1=外側
            fan = (t * FINGER_SPREAD * sp + out_t * FINGER_OUT) * PX * side
            p0 = base + Vector((t * FINGER_SPREAD * 0.4 * sp * PX * side, 0.0, 0.0))
            mid = base + Vector((fan * 0.55 - curl * 0.018 * side,
                                 -FINGER_FWD * 0.35 * fw * PX, -drop * 0.50))
            tip = base + Vector((fan - curl * 0.042 * side,
                                 -FINGER_FWD * fw * PX + curl * 0.026, -drop))
            rr = FINGER_R * (0.88 + 0.24 * _rand(f * 3 + (1 if side > 0 else 2), 61.0))
            # 関節でこぶを作る。均一な先細りだと「棒」に見える
            q1 = p0 * 0.62 + mid * 0.38
            q2 = mid * 0.55 + tip * 0.45
            out.append(C.curve_tube(f"{NAME}_fing{tag}{f}",
                                    [p0, q1, mid, q2, tip],
                                    [rr * KNUCKLE, rr * 0.72, rr * KNUCKLE * 0.86,
                                     rr * 0.60, rr * 0.42],
                                    resolution=2, bevel_resolution=0))
    return out


# 脚と足。**第7版では完全に抜けていた。** 設定画の正面図は左右の脚と
# 巨大な骨の足が下部シルエットを支えている。実測: 足は高さ 92〜100%、
# |x| 15〜76px
LEG_JOINTS = [
    (38.0, +6.0, 80.0),     # 股
    (50.0, -22.0, 89.0),    # 膝。前へ出す(猫背でしゃがんだ姿勢)
    (52.0, -40.0, 96.0),    # 踝
]
LEG_R = (0.050, 0.036, 0.030)   # 大腿は太い。設定画の下半身は重い
FOOT_C = (54.0, -46.0, 96.0)
FOOT_R = (0.096, 0.118, 0.058)
TOE_N = 5
# **趾は短く、開きも狭い。** 設定画の下端を実測すると足のかたまりは
# 幅48px(正面図217px幅のうち15〜37%)しかなく、趾は「短くずんぐり」
# している。以前は趾先が |x|101px まで開いて全幅いっぱいの扇になり、
# 貝殻のように見えていた(手のカードもその扇に隠れていた)
TOE_LEN = 34.0
TOE_R = 0.030


def build_legs() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        pts = [Vector((q[0] * PX * side, q[1] * PX, _z(q[2]))) for q in LEG_JOINTS]
        out.append(C.curve_tube(f"{NAME}_leg{tag}", pts, list(LEG_R),
                                bevel_resolution=1))
        fc = Vector((FOOT_C[0] * PX * side, FOOT_C[1] * PX, _z(FOOT_C[2])))
        out.append(C.uv_sphere(f"{NAME}_foot{tag}", fc, FOOT_R[0],
                               segments=8, rings=6,
                               scale=(1.0, FOOT_R[1] / FOOT_R[0], FOOT_R[2] / FOOT_R[0])))
        for f in range(TOE_N):
            t = (f - (TOE_N - 1) / 2) / max(1, TOE_N - 1)
            # 内側の趾は前へ、外側の趾は外へ開く。開きすぎると
            # 全幅が設定画(高さ比0.91)を超えるので上限を持たせる
            spread = 30.0 + 16.0 * abs(t) * 2.0
            tip = fc + Vector((t * spread * PX * side,
                               -TOE_LEN * PX * (1.0 - 0.35 * abs(t)), -0.018))
            mid = (fc + tip) * 0.5 + Vector((0, 0, 0.010))
            out.append(C.curve_tube(f"{NAME}_toe{tag}{f}", [fc, mid, tip],
                                    [TOE_R, TOE_R * 0.75, TOE_R * 0.95],
                                    resolution=2, bevel_resolution=0))
        # 踵。設定画の足は前後に長い骨の塊
        out.append(C.curve_tube(f"{NAME}_heel{tag}",
                                [fc + Vector((0, 0.086, 0.026)), fc,
                                 fc + Vector((0, -0.032, -0.008))],
                                [0.038, 0.058, 0.050], bevel_resolution=1))
    return out


# 足元に散らばる骨。設定画の下端は**地面に積もった骨**で作られていて、
# ここが無いと「胸郭の下から小さな脚が生えている」ように見える。
# 蔦では代替できない
DEBRIS_N = 20
DEBRIS_R = (0.016, 0.028)
DEBRIS_LEN = (0.07, 0.15)


def build_debris() -> list[bpy.types.Object]:
    out = []
    for i in range(DEBRIS_N):
        a = math.tau * _rand(i, 91.0)
        rad = (0.09 + 0.15 * _rand(i, 97.0)) * (1.0 + 0.35 * abs(math.cos(a)))
        cx = math.cos(a) * rad
        cy = math.sin(a) * rad * 0.80 - 0.055
        # 正面の中央は空ける(脚のあいだの負の空間)
        if abs(cx) < 0.07 and cy < 0.0:
            continue
        rd = DEBRIS_R[0] + (DEBRIS_R[1] - DEBRIS_R[0]) * _rand(i, 101.0)
        ln = DEBRIS_LEN[0] + (DEBRIS_LEN[1] - DEBRIS_LEN[0]) * _rand(i, 103.0)
        yaw = math.tau * _rand(i, 107.0)
        d = Vector((math.cos(yaw), math.sin(yaw), 0.12 * (_rand(i, 109.0) - 0.5)))
        c = Vector((cx, cy, rd * 0.95 + 0.055 * _rand(i, 113.0) ** 2))
        out.append(C.curve_tube(f"{NAME}_debris{i}",
                                [c - d * ln * 0.5, c, c + d * ln * 0.5],
                                [rd * 1.6, rd, rd * 1.5], resolution=2, bevel_resolution=0))
    return out


# ----------------------------------------------------------------------- 蔦
# **最重要のシルエット記号。** 塊から離れて弧を描くので必ず 3D。
# (中心px, 半径px, 面の法線, 太さpx)
# 蔦は**塊に沿って**弧を描く。半径を塊より少し大きく取り、面の傾きで
# 巻き付いて見せる。地面より下へ回り込ませない(第1版で1本沈んだ)
# 中心を後ろ(+y)へ寄せる。前寄りに置くと顔の前を横切って
# 頭蓋が読めなくなる
# **最重要のシルエット記号。** 旧版は「平面の円を8枚」で、レビューで
# 「紫色の輪を巻いただけ」と切られた。設定画を色で分離して三面から
# 主要蔓を抽出し直す(scratchpad/hone/vine_*.png)。
#
# 読み取れた構造:
#   - 支配的なのは**頭の上を越えて背中へ回る大きな弧**が2本。
#     正面では頭蓋を囲む冠に見えるが、側面では後頭部から背中を通って
#     腰まで下りている ―― つまり水平の輪ではなく、体を縦に巻く経路
#   - 背中を斜めに横切る弧が1本
#   - 右下(手と脚)を大きく巻くループが1本
#   - 左の肩から手へ下りるストランドが1本
#   - 胸を斜めに横切り、**胸骨の裏へ潜って**反対側の前へ出るものが1本
#
# 経路は (x px, y px, 高さ%) の通過点で持つ。y が深度で、
# **負が前・正が後ろ**。1本のなかで y の符号が変わることが重要 ――
# 骨の前→裏→隙間→前と潜るから「絡んでいる」ように見える。
# 骨の上に載せるだけでは、また輪に見える。
# 潜りの深さ。これより深いと塊の芯の内側=骨に完全に隠れる
DIVE = -19.0
MAJOR_VINES = [
    # (名前, [(方位角deg, 高さ%, オフセットpx[, 前後ずらしpx[, 左右ずらしpx]])...], 太さpx)
    # 方位角 0=正面 / 90=右 / 180=背面 / 270(=-90)=左
    #
    # **各蔓に「骨の裏へ完全に消える区間」を2か所以上置く**(off=DIVE)。
    # 第4版は表面を這うだけで、45°/135° で見える→隠れる→出る が
    # 一度も起きていなかった。設定画の面白さはその断続性にある。
    ("crown_front", [           # 頭蓋の**前**を通る冠。頂点は高さ8%
        (-116.0, 46.0, +5.0), (-124.0, 36.0, DIVE), (-108.0, 27.0, +9.0, -4.0),
        (-70.0, 17.0, +14.0, -12.0), (-24.0, 9.0, +16.0, -18.0),
        (22.0, 7.0, +16.0, -18.0), (66.0, 15.0, +14.0, -12.0),
        (102.0, 25.0, +8.0, -4.0), (120.0, 35.0, DIVE),
        (134.0, 46.0, +7.0), (146.0, 56.0, +4.0)], 3.2),
    ("crown_back", [            # 頭蓋の**後ろ**を通る冠。頂点は高さ1%
        (74.0, 44.0, +5.0), (92.0, 33.0, DIVE), (116.0, 23.0, +10.0, +6.0),
        (156.0, 11.0, +17.0, +16.0), (198.0, 3.0, +19.0, +18.0),
        (240.0, 10.0, +17.0, +14.0), (272.0, 21.0, +11.0, +5.0),
        (292.0, 31.0, DIVE), (308.0, 42.0, +8.0), (322.0, 54.0, +4.0)], 3.0),
    ("back_sash", [             # 右肩 → 背中を斜めに横切る → 左腰
        (74.0, 28.0, +7.0), (104.0, 36.0, DIVE), (142.0, 44.0, +8.0),
        (176.0, 52.0, +10.0), (208.0, 60.0, DIVE), (240.0, 70.0, +7.0),
        (266.0, 80.0, +9.0), (284.0, 90.0, +4.0)], 3.0),
    ("right_loop", [            # 右の腕と脚を巻く
        (12.0, 48.0, +6.0), (40.0, 54.0, DIVE), (74.0, 58.0, +17.0),
        (104.0, 66.0, +18.0), (124.0, 76.0, DIVE), (98.0, 84.0, +14.0),
        (56.0, 90.0, +14.0), (16.0, 93.0, +5.0)], 2.7),
    ("left_loop", [             # 左の腕と脚を巻く
        (-14.0, 50.0, +6.0), (-44.0, 56.0, DIVE), (-78.0, 60.0, +17.0),
        (-108.0, 68.0, +18.0), (-128.0, 78.0, DIVE), (-100.0, 86.0, +14.0),
        (-58.0, 92.0, +14.0), (-18.0, 95.0, +5.0)], 2.7),
    ("left_arm", [              # 左肩の裏 → 腕の外 → 手 → 前へ
        (-172.0, 28.0, +6.0), (-152.0, 34.0, DIVE), (-136.0, 42.0, +32.0),
        (-118.0, 50.0, DIVE), (-100.0, 58.0, +33.0), (-84.0, 66.0, DIVE),
        (-60.0, 76.0, +28.0), (-32.0, 88.0, +6.0)], 2.5),
    ("chest_dive", [            # 左肋の前 → 胸骨の裏 → 右腰の前
        (-58.0, 40.0, +11.0), (-34.0, 44.0, DIVE), (-10.0, 47.0, +13.0),
        (14.0, 52.0, DIVE), (34.0, 60.0, +14.0), (52.0, 68.0, +11.0),
        (66.0, 76.0, +5.0)], 2.5),
]
VINE_SUB = 3            # 通過点のあいだに入れる補間点

# 棘と芽。設定画の蔦は棘だらけで、ところどころに淡紫の小さな芽が付く。
# **Major Vine Gate では出さない**(主要蔓の経路だけを見る)
THORN_PER_VINE = 7
THORN_LEN = 0.026
THORN_R = 0.008
BUD_PER_VINE = 2
BUD_R = 0.013


def _skull_rxy(z: float):
    """高さ z における頭蓋断面 (rx, ry, cy) m。範囲外なら None。"""
    top = _z(SKULL_C[2]) + SKULL_H * 0.5 * PX
    bot = top - SKULL_H * PX
    if not (bot <= z <= top):
        return None
    t = (top - z) / (SKULL_H * PX)
    for u, v in zip(SKULL_RINGS, SKULL_RINGS[1:]):
        if u[0] <= t <= v[0]:
            f = (t - u[0]) / max(v[0] - u[0], 1e-6)
            return ((u[1] + (v[1] - u[1]) * f) * PX,
                    (u[2] + (v[2] - u[2]) * f) * PX,
                    (u[3] + (v[3] - u[3]) * f) * PX)
    return None


def _body_point(az_deg: float, pct: float, off_px: float,
                dy_px: float = 0.0, dx_px: float = 0.0) -> Vector:
    """体表に貼り付いた点。

    az は体の縦軸まわりの方位角(0=正面, 90=右, 180=背面, 270=左)、
    pct は高さ%、off_px は**体表からの半径オフセット**、
    dy/dx は方位角に依らない前後・左右のずらし(冠2本を前後に分けるため)。

    off の符号がこの造形の要:
      大きい正 … 体から離れて弧を描く(頭上の冠)
      小さい正 … 骨の手前を通る
      **大きい負 … 塊の芯より内側 = 骨に完全に隠れる**
    第4版は潜りが -7px しかなく、骨の隙間から見えたままだった。
    芯は CORE_K=0.86 なので、確実に消すには -16px 以上潜らせる。"""
    z = _z(pct)
    a = math.radians(az_deg)
    d = Vector((math.sin(a), -math.cos(a), 0.0))
    cy, rf, rb, rs = _loop_at(z)
    origin = Vector((0.0, cy, z))
    sk = _skull_rxy(z)
    step = 0.004
    surf = 0.0
    for i in range(1, 220):
        r = i * step
        q = origin + d * r
        ry = rf if q.y < cy else rb
        inside = ((q.x / max(rs, 1e-4)) ** 2
                  + ((q.y - cy) / max(ry, 1e-4)) ** 2) <= 1.0
        if not inside and sk is not None:
            rx_s, ry_s, cy_s = sk
            sx = SKULL_C[0] * PX
            sy = SKULL_C[1] * PX + cy_s
            inside = (((q.x - sx) / max(rx_s, 1e-4)) ** 2
                      + ((q.y - sy) / max(ry_s, 1e-4)) ** 2) <= 1.0
        if inside:
            surf = r
    if surf <= 0.0:
        surf = max(rs, 0.05)
    return (origin + d * (surf + off_px * PX)
            + Vector((dx_px * PX, dy_px * PX, 0.0)))


def _way(w):
    """通過点を (az, pct, off, dy, dx) に揃える。"""
    return tuple(w) + (0.0,) * (5 - len(w))


def _vine_path(way, seed: float) -> tuple[list[Vector], list[float]]:
    """通過点を体表沿いの点列にし、各点のオフセットも返す。

    太さはオフセットから決める ―― **骨へ締め付ける所は細く、
    自由に張り出す所は太く**。一定太さだとケーブルに見える。"""
    pts, offs = [], []
    for i in range(len(way) - 1):
        a0, h0, o0, y0, x0 = _way(way[i])
        a1, h1, o1, y1, x1 = _way(way[i + 1])
        for k in range(VINE_SUB):
            t = k / VINE_SUB
            # 潜りは**急に**入る。線形補間だとゆるく沈んでから出るだけで
            # 「骨の裏へ消える」に見えない
            te = t * t * (3 - 2 * t)
            az = a0 + (a1 - a0) * t
            pc = h0 + (h1 - h0) * t
            of = o0 + (o1 - o0) * te
            dy = y0 + (y1 - y0) * t
            dx = x0 + (x1 - x0) * t
            w = math.sin(t * math.pi * 2.0 + i * 2.3 + seed) * 3.0
            pts.append(_body_point(az + w * 0.9, pc + w * 0.35,
                                   of + w * 0.6, dy, dx))
            offs.append(of)
    a1, h1, o1, y1, x1 = _way(way[-1])
    pts.append(_body_point(a1, h1, o1, y1, x1))
    offs.append(o1)
    return pts, offs


def build_vines() -> list[bpy.types.Object]:
    out = []
    for i, (name, way, th) in enumerate(MAJOR_VINES):
        pts, offs = _vine_path(way, i * 1.9)
        r = th * PX
        radii = []
        for k, o in enumerate(offs):
            # 締め付け(負のオフセット)で細く、張り出しで太く。±20%程度
            f = 0.80 + 0.34 * min(max((o + 18.0) / 44.0, 0.0), 1.0)
            f *= 1.0 + 0.06 * math.sin(k * 0.9 + i * 2.0)
            radii.append(r * f)
        for k in range(2):
            radii[k] *= 0.55 + 0.25 * k
            radii[-1 - k] *= 0.55 + 0.25 * k
        _VINE_PATHS[name] = (pts, offs)
        out.append(C.curve_tube(f"{NAME}_vine_{name}", pts, radii,
                                resolution=1, bevel_resolution=1))
    return out


# ------------------------------------------- 設定画の蔓占有領域(密度表)
# 第3版までは蔓を1本ずつ手で置いていたが、設定画への収束が遅かった。
# 個々の蔓を先に考えるのをやめ、**設定画で蔓が占めている空間**を先に
# 表として持ち、不足している所へネットワークを生やす方式へ変える
# (ガルドの髪で「毛束を一本ずつ置く」から「設定画の閉じた輪郭を先に
# 追う」へ切り替えたのと同じ発想)。
#
# 生成: scratchpad/hone_density.py
#   正面図は方位角 -90..+90、背面図は +90..+270 を担当し cos(az) で重みづけ。
#   x = sin(az) で列を取り、列幅は |cos(az)| に比例させる(真横ほど圧縮
#   されるため)。真横は正面図の端では標本が足りないので側面図の全幅を
#   使う ―― 側面図の横軸は奥行きなので、ある高さの帯を全幅で平均すれば
#   「体の側面の蔓密度」になる。
# 方位角 36 区分 × 高さ 18 区分。行=方位角(-180から+10度刻み)、
# 列=高さパーセント(3〜97を18等分)。0〜9 は蔓占有率、9 が最大 75%
VINE_DENSITY = [
    "375040220101110111",   # az -175.0
    "467352342100111231",   # az -165.0
    "447544433100110121",   # az -155.0
    "036644323112111121",   # az -145.0
    "063725044133110230",   # az -135.0
    "065426073263210220",   # az -125.0
    "860403220076201200",   # az -115.0
    "865443221153211221",   # az -105.0
    "865443221153211221",   # az  -95.0
    "865443221153211221",   # az  -85.0
    "865443221153211221",   # az  -75.0
    "865403220114000000",   # az  -65.0
    "865403865687200000",   # az  -55.0
    "867130445365100000",   # az  -45.0
    "847332122133210111",   # az  -35.0
    "665432111113342221",   # az  -25.0
    "753211122112343221",   # az  -15.0
    "830000022001311111",   # az   -5.0
    "942100123001321222",   # az   +5.0
    "865322332001241231",   # az  +15.0
    "575535321003460120",   # az  +25.0
    "674757433024560000",   # az  +35.0
    "865747755254773101",   # az  +45.0
    "865406364688878301",   # az  +55.0
    "865403251187129400",   # az  +65.0
    "865413221151111210",   # az  +75.0
    "865443221153111211",   # az  +85.0
    "865443221153211221",   # az  +95.0
    "865443221153111211",   # az +105.0
    "065403226652430200",   # az +115.0
    "065406725533330030",   # az +125.0
    "068546752222130131",   # az +135.0
    "056643551011110212",   # az +145.0
    "565533333111111231",   # az +155.0
    "464233323210012131",   # az +165.0
    "364031111110111111",   # az +175.0
]
DENSITY_MAX = 0.745     # 表の 9 に対応する実占有率
DENS_AZ_N = len(VINE_DENSITY)
DENS_H_N = len(VINE_DENSITY[0])
DENS_H = (3.0, 97.0)


# ------------------------------------------------------- 二次蔓と細枝
# 太さの階層。主要蔓を100%として
#   二次蔓 55%(既存の主要蔓から分岐する) / 細枝 30%(二次蔓から分岐)
# ポリゴンも3段階。設定画の複雑さは**ポリゴン密度ではなくシルエット
# 密度**で再現する
SEC_W = 0.55
TWIG_W = 0.30
_VINE_PATHS: dict[str, tuple[list, list]] = {}

# (親, 親上の位置 t, 行き先の通過点, 太さ倍率)
# 追加箇所は均等にしない。胸郭中央は既に複雑なので足さない
SECONDARY = [
    # 1) 左右の腕〜手
    ("left_arm", 0.42, [(-108.0, 58.0, +26.0), (-96.0, 68.0, DIVE),
                        (-84.0, 78.0, +20.0), (-70.0, 88.0, +8.0)], 1.0),
    ("left_loop", 0.30, [(-70.0, 62.0, +20.0), (-54.0, 70.0, DIVE),
                         (-40.0, 80.0, +16.0), (-26.0, 89.0, +6.0)], 0.9),
    ("right_loop", 0.28, [(72.0, 62.0, +20.0), (56.0, 70.0, DIVE),
                          (42.0, 80.0, +16.0), (28.0, 89.0, +6.0)], 1.0),
    ("crown_front", 0.86, [(112.0, 44.0, +14.0), (100.0, 54.0, DIVE),
                           (88.0, 64.0, +22.0), (78.0, 74.0, +12.0)], 0.9),
    # 2) 骨盤〜左右脚
    ("back_sash", 0.62, [(226.0, 74.0, +8.0), (250.0, 82.0, DIVE),
                         (268.0, 90.0, +10.0), (286.0, 96.0, +5.0)], 1.0),
    ("right_loop", 0.72, [(104.0, 82.0, +10.0), (86.0, 89.0, DIVE),
                          (70.0, 95.0, +9.0)], 0.9),
    ("left_loop", 0.74, [(-104.0, 82.0, +10.0), (-86.0, 89.0, DIVE),
                         (-70.0, 95.0, +9.0)], 0.85),
    ("chest_dive", 0.88, [(76.0, 80.0, +9.0), (66.0, 88.0, DIVE),
                          (54.0, 95.0, +7.0)], 0.8),
    # 3) 頭蓋横〜肩の空白
    ("crown_front", 0.22, [(-96.0, 30.0, +12.0), (-84.0, 38.0, DIVE),
                           (-72.0, 46.0, +14.0)], 0.85),
    ("crown_back", 0.24, [(108.0, 28.0, +12.0), (96.0, 36.0, DIVE),
                          (84.0, 44.0, +14.0)], 0.85),
    # 4) 胸郭内部の補助(1本だけ。ここを過密にしない)
    ("chest_dive", 0.32, [(-16.0, 54.0, +6.0), (-4.0, 62.0, DIVE),
                          (10.0, 70.0, +7.0)], 0.7),
    # 5) 背面下部
    ("back_sash", 0.86, [(300.0, 88.0, +7.0), (318.0, 94.0, DIVE),
                         (336.0, 97.0, +6.0)], 0.8),
    # 6) 腰帯。設定画は腰を蔓が回っている(モデルは 0.41 しかなかった)。
    #    胸中央は競合するので増やさず、腰から下だけ濃くする
    ("chest_dive", 0.55, [(46.0, 66.0, +11.0), (88.0, 70.0, DIVE),
                          (128.0, 72.0, +10.0), (168.0, 74.0, +8.0)], 1.0),
    ("back_sash", 0.44, [(200.0, 68.0, +9.0), (238.0, 71.0, DIVE),
                         (276.0, 73.0, +11.0), (312.0, 76.0, +8.0)], 1.0),
    ("left_loop", 0.18, [(-58.0, 68.0, +12.0), (-24.0, 72.0, DIVE),
                         (14.0, 75.0, +10.0), (48.0, 78.0, +9.0)], 0.9),
    ("right_loop", 0.90, [(56.0, 80.0, +10.0), (22.0, 83.0, DIVE),
                          (-14.0, 85.0, +10.0), (-48.0, 87.0, +8.0)], 0.85),
    # 7) 右腕まわりを追加(設定画の非対称)
    ("crown_back", 0.14, [(88.0, 38.0, +16.0), (94.0, 48.0, DIVE),
                          (98.0, 58.0, +22.0), (92.0, 68.0, +16.0)], 0.95),
    ("back_sash", 0.06, [(78.0, 34.0, +14.0), (86.0, 44.0, DIVE),
                         (94.0, 54.0, +20.0), (88.0, 64.0, +14.0)], 0.9),
]
TWIG_PER_SEC = 2
TWIG_LEN = (0.028, 0.055)


def _attach(parent: str, t: float) -> Vector:
    pts, _offs = _VINE_PATHS[parent]
    i = min(max(int(t * (len(pts) - 1)), 0), len(pts) - 1)
    return pts[i]


def build_branches() -> tuple[list, list]:
    """二次蔓と細枝。主要蔓の途中から生えるので、独立したケーブルに見えない。"""
    sec, twig = [], []
    for i, (parent, t, way, wf) in enumerate(SECONDARY + HEAD_CAGE):
        if parent not in _VINE_PATHS:
            continue
        base = _attach(parent, t)
        pts, offs = _vine_path(way, i * 2.7)
        pts = [base, base * 0.55 + pts[0] * 0.45] + pts
        offs = [offs[0], offs[0]] + offs
        pw = dict((n, th) for n, _w, th in MAJOR_VINES)[parent]
        r = pw * SEC_W * wf * PX
        radii = [r * (0.75 + 0.30 * min(max((o + 18.0) / 44.0, 0.0), 1.0))
                 for o in offs]
        radii[0] *= 1.25          # 分岐の根元は膨らむ
        radii[-1] *= 0.45
        # 二次蔓は断面を落とす(細いので見えない)
        sec.append(C.curve_tube(f"{NAME}_sec{i}", pts, radii,
                                resolution=1, bevel_resolution=0))
        # 細枝。二次蔓の途中から短く出る
        for k in range(TWIG_PER_SEC):
            u = 0.32 + 0.34 * k + 0.12 * _rand(i * 5 + k, 131.0)
            j = min(int(u * (len(pts) - 1)), len(pts) - 2)
            p0 = pts[j]
            d = (pts[j + 1] - pts[j]).normalized()
            side = d.cross(Vector((0, 0, 1)))
            if side.length < 1e-4:
                side = d.cross(Vector((1, 0, 0)))
            side.normalize()
            up = d.cross(side)
            a = math.tau * _rand(i * 7 + k, 137.0)
            outv = (side * math.cos(a) + up * math.sin(a)).normalized()
            # 主幹に沿う成分を強くし、先を少し垂らす
            ln = TWIG_LEN[0] + (TWIG_LEN[1] - TWIG_LEN[0]) * _rand(i * 3 + k, 139.0)
            d1 = (outv * 0.45 + d * 0.85).normalized()
            d2 = (outv * 0.55 + d * 0.55 + Vector((0, 0, -0.45))).normalized()
            mid = p0 + d1 * ln * 0.55
            tip = mid + d2 * ln * 0.55
            tr = pw * TWIG_W * PX
            twig.append(C.curve_tube(f"{NAME}_twig{i}_{k}", [p0, mid, tip],
                                     [tr * 1.3, tr * 0.8, tr * 0.35],
                                     resolution=1, bevel_resolution=0))
    return sec, twig


# --------------------------------------------- 四肢へ巻き付く二次蔓
# 「主幹に沿わせる」だけだと、太い紫線の横に細い紫線が付いただけになる。
# 植物らしい絡みは 主幹に沿う → 分岐 → **別の骨へ向かう** →
# 骨の裏へ潜る → また出る という動き。ここでは主幹から出たあと
# 腕・脚の軸に螺旋で巻き付かせる
ARM_CHAIN = [ARM_JOINTS[0], ARM_JOINTS[1], ARM_JOINTS[2], HAND_C]
LEG_CHAIN = [LEG_JOINTS[0], LEG_JOINTS[1], LEG_JOINTS[2], FOOT_C]

# (親, 親上の位置t, 部位, 側, 開始u, 終了u, 巻き数, 半径px(開始,終了), 太さ倍率)
LIMB_WRAPS = [
    ("left_arm",    0.52, "arm", -1.0, 0.10, 0.98, 1.7, (15.0, 26.0), 1.0),
    ("crown_front", 0.88, "arm", +1.0, 0.08, 0.98, 1.8, (15.0, 26.0), 1.0),
    ("crown_back",  0.90, "arm", -1.0, 0.30, 0.90, 1.1, (17.0, 25.0), 0.8),
    ("right_loop",  0.20, "arm", +1.0, 0.32, 0.92, 1.2, (17.0, 25.0), 0.8),
    ("left_loop",   0.62, "leg", -1.0, 0.02, 1.00, 1.5, (14.0, 22.0), 0.95),
    ("right_loop",  0.62, "leg", +1.0, 0.02, 1.00, 1.5, (14.0, 22.0), 0.95),
    ("back_sash",   0.70, "leg", -1.0, 0.00, 0.62, 0.9, (17.0, 20.0), 0.8),
    ("chest_dive",  0.82, "leg", +1.0, 0.00, 0.62, 0.9, (17.0, 20.0), 0.8),
    # 右側を濃くする(設定画の非対称)
    ("back_sash",   0.12, "arm", +1.0, 0.05, 0.70, 1.4, (18.0, 24.0), 0.9),
    ("crown_front", 0.72, "arm", +1.0, 0.45, 1.00, 1.3, (19.0, 28.0), 0.85),
    ("right_loop",  0.86, "leg", +1.0, 0.35, 1.00, 1.0, (16.0, 24.0), 0.8),
]
WRAP_SEG = 12


def _chain_point(chain, side: float, u: float) -> tuple[Vector, Vector]:
    """四肢の折れ線上の点と接線。u は 0(付け根)〜1(先端)。"""
    pts = [Vector((q[0] * PX * side, q[1] * PX, _z(q[2]))) for q in chain]
    total = sum((b - a).length for a, b in zip(pts, pts[1:]))
    d = u * total
    for a, b in zip(pts, pts[1:]):
        seg = (b - a).length
        if d <= seg or (a, b) == (pts[-2], pts[-1]):
            t = min(d / max(seg, 1e-6), 1.0)
            return a + (b - a) * t, (b - a).normalized()
        d -= seg
    return pts[-1], (pts[-1] - pts[-2]).normalized()


def build_limb_wraps() -> list[bpy.types.Object]:
    out = []
    for i, (parent, t, part, side, u0, u1, turns, rr, wf) in enumerate(LIMB_WRAPS):
        if parent not in _VINE_PATHS:
            continue
        chain = ARM_CHAIN if part == "arm" else LEG_CHAIN
        base = _attach(parent, t)
        pts = [base]
        for k in range(WRAP_SEG + 1):
            u = u0 + (u1 - u0) * k / WRAP_SEG
            c, d = _chain_point(chain, side, u)
            n1 = d.cross(Vector((0, 0, 1)))
            if n1.length < 1e-4:
                n1 = d.cross(Vector((1, 0, 0)))
            n1.normalize()
            n2 = d.cross(n1)
            a = math.tau * turns * (k / WRAP_SEG) + i * 1.3
            r = (rr[0] + (rr[1] - rr[0]) * (k / WRAP_SEG)) * PX
            # 巻きの半分は骨の裏(半径を縮める)。ここが潜行になる
            r *= 0.62 + 0.38 * (0.5 + 0.5 * math.sin(a * 1.0 + 0.6))
            pts.append(c + (n1 * math.cos(a) + n2 * math.sin(a)) * r)
        pw = dict((n, th) for n, _w, th in MAJOR_VINES)[parent]
        r0 = pw * SEC_W * wf * PX
        radii = [r0] * len(pts)
        radii[0] *= 1.3
        radii[-1] *= 0.45
        out.append(C.curve_tube(f"{NAME}_wrap{i}", pts, radii,
                                resolution=1, bevel_resolution=0))
    return out


# --------------------------------------------- 頭蓋を包む蔓籠
# 冠2本だけだと「頭の上に載る輪」に見える。設定画の頭部は
# 頭頂→こめかみ→頬横→肩 まで蔓が落ちてきて**頭蓋を包む籠**になっている
HEAD_CAGE = [
    ("crown_front", 0.30, [(-84.0, 20.0, +8.0), (-78.0, 30.0, DIVE),
                           (-74.0, 40.0, +9.0), (-80.0, 50.0, +6.0)], 0.85),
    ("crown_front", 0.62, [(72.0, 18.0, +8.0), (66.0, 28.0, DIVE),
                           (64.0, 38.0, +9.0), (72.0, 48.0, +6.0)], 0.85),
    ("crown_back", 0.36, [(126.0, 20.0, +8.0), (134.0, 30.0, DIVE),
                          (140.0, 40.0, +8.0), (148.0, 50.0, +5.0)], 0.8),
    ("crown_back", 0.70, [(-126.0, 22.0, +8.0), (-134.0, 32.0, DIVE),
                          (-140.0, 42.0, +8.0), (-148.0, 52.0, +5.0)], 0.8),
    ("crown_front", 0.44, [(-34.0, 16.0, +12.0, -10.0), (-30.0, 26.0, +6.0, -12.0),
                           (-26.0, 34.0, DIVE), (-22.0, 42.0, +7.0)], 0.7),
    ("crown_back", 0.52, [(36.0, 16.0, +12.0, -8.0), (32.0, 26.0, +6.0, -12.0),
                          (28.0, 34.0, DIVE), (24.0, 42.0, +7.0)], 0.7),
]


# ------------------------------------ 占有領域から蔓ネットワークを生成
# 密度表(設定画)と現在のモデルを同じ (方位角, 高さ) 格子で比べ、
# **不足している所を辿って**蔓を伸ばす。本数を目標にしない ―― 
# 「設定画が蔓で埋めている空間が、モデルでも埋まっているか」だけを見る
FILL_GROWTH = 1.60      # 目標総量 / 現在総量
FILL_MAX = 18           # 生成する蔓の上限
FILL_LEN = (5, 9)       # 1本が辿る格子の数
FILL_W = 0.50           # 主要蔓に対する太さ


def _dens_cell(az_deg: float, pct: float) -> tuple[int, int]:
    i = int(((az_deg + 180.0) % 360.0) / 360.0 * DENS_AZ_N) % DENS_AZ_N
    t = (pct - DENS_H[0]) / (DENS_H[1] - DENS_H[0])
    j = min(max(int(t * DENS_H_N), 0), DENS_H_N - 1)
    return i, j


def _cell_center(i: int, j: int) -> tuple[float, float]:
    az = -180.0 + 360.0 * (i + 0.5) / DENS_AZ_N
    pct = DENS_H[0] + (DENS_H[1] - DENS_H[0]) * (j + 0.5) / DENS_H_N
    return az, pct


def _measure_vines(objs) -> list[list[float]]:
    """既存の蔓を (方位角, 高さ) 格子で数える。"""
    g = [[0.0] * DENS_H_N for _ in range(DENS_AZ_N)]
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            pct = 100.0 * (1.0 - p.z / HEIGHT)
            if not (DENS_H[0] <= pct <= DENS_H[1]):
                continue
            cy, _rf, _rb, _rs = _loop_at(p.z)
            az = math.degrees(math.atan2(p.x, -(p.y - cy)))
            i, j = _dens_cell(az, pct)
            g[i][j] += 1.0
    return g


def build_fill_vines(existing) -> list[bpy.types.Object]:
    tgt = [[int(c) / 9.0 for c in row] for row in VINE_DENSITY]
    cur = _measure_vines(existing)
    ts = sum(sum(r) for r in tgt) or 1.0
    cs = sum(sum(r) for r in cur) or 1.0
    # 不足量。目標は現在の総量 × FILL_GROWTH を設定画の分布で配ったもの
    scale = cs * FILL_GROWTH / ts
    def_ = [[tgt[i][j] * scale - cur[i][j]
             for j in range(DENS_H_N)] for i in range(DENS_AZ_N)]
    unit = cs * FILL_GROWTH / max(FILL_MAX * 7, 1)   # 1格子ぶんの充填量

    out = []
    pw = MAJOR_VINES[0][2]
    for n in range(FILL_MAX):
        # 最も不足している格子から始める
        bi = bj = 0; best = -1e9
        for i in range(DENS_AZ_N):
            for j in range(DENS_H_N):
                if def_[i][j] > best:
                    best, bi, bj = def_[i][j], i, j
        if best <= unit * 0.6:
            break
        path = [(bi, bj)]
        ln = FILL_LEN[0] + int((FILL_LEN[1] - FILL_LEN[0]) * _rand(n, 151.0))
        i, j = bi, bj
        for _ in range(ln - 1):
            cand = []
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if di == 0 and dj == 0:
                        continue
                    ni = (i + di) % DENS_AZ_N
                    nj = j + dj
                    if not (0 <= nj < DENS_H_N) or (ni, nj) in path:
                        continue
                    cand.append((def_[ni][nj], ni, nj))
            if not cand:
                break
            cand.sort(reverse=True)
            # 最良だけを辿ると直線になるので、上位2つから擬似乱数で選ぶ
            pick = cand[0] if len(cand) < 2 or _rand(n * 13 + len(path), 157.0) < 0.7 \
                else cand[1]
            i, j = pick[1], pick[2]
            path.append((i, j))
        if len(path) < 3:
            def_[bi][bj] -= unit
            continue
        # 経路を通過点へ。2〜3格子ごとに骨の裏へ潜らせる
        way = []
        for k, (ci, cj) in enumerate(path):
            az, pct = _cell_center(ci, cj)
            az += (_rand(n * 7 + k, 163.0) - 0.5) * 7.0
            pct += (_rand(n * 7 + k, 167.0) - 0.5) * 3.0
            off = DIVE if (k % 3 == 1 and 0 < k < len(path) - 1) else \
                (7.0 + 9.0 * _rand(n * 5 + k, 173.0))
            way.append((az, pct, off))
        pts, offs = _vine_path(way, n * 1.7)
        r = pw * FILL_W * PX * (0.82 + 0.32 * _rand(n, 179.0))
        radii = [r * (0.78 + 0.30 * min(max((o + 18.0) / 44.0, 0.0), 1.0))
                 for o in offs]
        radii[0] *= 1.2
        radii[-1] *= 0.42
        out.append(C.curve_tube(f"{NAME}_fill{n}", pts, radii,
                                resolution=1, bevel_resolution=0))
        # 埋めたぶんを差し引く(隣にも少しこぼす)
        for (ci, cj) in path:
            def_[ci][cj] -= unit
            for di, dj in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ni, nj = (ci + di) % DENS_AZ_N, cj + dj
                if 0 <= nj < DENS_H_N:
                    def_[ni][nj] -= unit * 0.3
    return out


# ============================================ Structural Bone(層2)
# 目的が変わった。ゲームカメラ寸法での計測で、設定画との最大の差は
# **形ではなく明暗**だと分かった:
#   設定画 平均輝度81 / 暗部10%点15 / 画面占有70%
#   モデル 平均輝度106 / 暗部10%点55 / 画面占有36%
# 設定画は「暗い蔦と骨のあいだの深い影が塊を作り、そこに明るい頭蓋が
# 浮かぶ」という明暗の構図で読ませている。
#
# だからこの層は**外形を埋めるため**ではなく、**骨のあいだに暗がりを
# 作って塊にするため**に置く。前版の「不定形の白い低ポリ岩」は、
# 体積は作ったが骨として読めず、明暗も作らなかった。
#
# 骨として読める形だけを使う。プリミティブは6種:
#   0 折れた長骨(片端が太く、片端が破断)
#   1 両端が太い長骨
#   2 肋骨片(弧)
#   3 板骨(肩甲骨・腸骨のような面)
#   4 椎骨(短く太く、横突起つき)
#   5 関節端(球に近い塊)
BONE_KINDS = 6


def _bone_piece(name: str, center: Vector, dirv: Vector, ln: float,
                r: float, kind: int, seed: float) -> bpy.types.Object:
    d = dirv.normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    up = d.cross(side)
    p0 = center - d * ln * 0.5
    p1 = center + d * ln * 0.5
    bend = side * ln * (0.10 + 0.16 * _rand(seed, 331.0))
    mid = center + bend
    if kind == 0:      # 折れた長骨
        pts = [p0, mid, p1]
        radii = [r * 1.9, r * 0.82, r * 0.62]
    elif kind == 1:    # 両端が太い長骨
        pts = [p0, mid, p1]
        radii = [r * 1.75, r * 0.78, r * 1.80]
    elif kind == 2:    # 肋骨片(弧)
        pts = [p0, center + bend * 2.4, p1]
        radii = [r * 1.1, r * 0.95, r * 0.8]
    elif kind == 3:    # 板骨
        return C.tapered_slab(name, [p0, center, p1],
                              [r * 1.1, r * 2.6, r * 1.4],
                              [r * 0.42, r * 0.52, r * 0.34], side, segments=6)
    elif kind == 4:    # 椎骨(短く太い)
        pts = [p0 * 0.7 + center * 0.3, center, p1 * 0.7 + center * 0.3]
        radii = [r * 1.5, r * 1.9, r * 1.4]
    else:              # 関節端
        return C.uv_sphere(name, center, r * 1.6, segments=6, rings=4,
                           scale=(1.0, 0.86, 0.72))
    return C.curve_tube(name, pts, radii, resolution=2, bevel_resolution=0)


def build_bone_cluster(name: str, center: Vector, radius: float, count: int,
                       seed: float, r_scale: float = 1.0) -> list:
    """骨片の塊。**1本ずつ骨として読める形**を寄せ集めて体積を作る。"""
    out = []
    for i in range(count):
        u = _rand(seed * 7 + i, 337.0)
        v = _rand(seed * 11 + i, 347.0)
        w = _rand(seed * 13 + i, 349.0)
        # 塊の中に散らす(外へ行くほどまばら)
        rr = radius * (0.25 + 0.75 * u ** 0.6)
        th = math.tau * v
        ph = math.acos(1 - 2 * w)
        pos = center + Vector((math.sin(ph) * math.cos(th),
                               math.sin(ph) * math.sin(th) * 0.8,
                               math.cos(ph) * 0.85)) * rr
        d = Vector((_rand(seed + i, 353.0) - 0.5,
                    _rand(seed + i, 359.0) - 0.5,
                    _rand(seed + i, 367.0) - 0.5))
        if d.length < 1e-4:
            d = Vector((1, 0, 0))
        kind = (i + int(seed)) % BONE_KINDS
        ln = radius * (0.55 + 0.65 * _rand(seed * 3 + i, 373.0))
        r = radius * 0.11 * r_scale * (0.8 + 0.5 * _rand(seed * 5 + i, 379.0))
        out.append(_bone_piece(f"{NAME}_{name}{i}", pos, d, ln, r, kind,
                               seed * 17 + i))
    return out


# (名前, 中心px(x, y, 高さ%), 半径m, 個数)
STRUCT_CLUSTERS = [
    ("clShoulderR", (62.0, +8.0, 42.0), 0.105, 7),
    ("clShoulderL", (-62.0, +8.0, 42.0), 0.105, 7),
    ("clHipR", (56.0, +6.0, 80.0), 0.100, 7),
    ("clHipL", (-56.0, +6.0, 80.0), 0.100, 7),
    ("clNape", (2.0, +46.0, 24.0), 0.090, 6),
    ("clBackHigh", (0.0, +52.0, 46.0), 0.098, 6),
    ("clBackLow", (4.0, +46.0, 66.0), 0.094, 6),
    ("clFootR", (66.0, -20.0, 93.0), 0.094, 7),
    ("clFootL", (-66.0, -20.0, 93.0), 0.094, 7),
]


def build_structural_mass() -> list[bpy.types.Object]:
    out = []
    for i, (nm, c, rad, n) in enumerate(STRUCT_CLUSTERS):
        center = Vector((c[0] * PX, c[1] * PX, _z(c[2])))
        out += build_bone_cluster(nm, center, rad, n, i * 3.0 + 1.0)
    return out


def _outer_points(objs) -> dict:
    """(方位角, 高さ) 格子ごとの**最外点**と外向きの向きを拾う。

    レースを体表から生やすと、腕・手・生成蔓より内側に埋もれて輪郭に
    一切出ない(実測で穴 0.5% のまま動かなかった)。輪郭そのものに
    生えていないと隙間を作らない。"""
    best = {}
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            pct = 100.0 * (1.0 - p.z / HEIGHT)
            if not (DENS_H[0] <= pct <= DENS_H[1]):
                continue
            cy, _rf, _rb, _rs = _loop_at(p.z)
            d = Vector((p.x, p.y - cy, 0.0))
            r = d.length
            az = math.degrees(math.atan2(p.x, -(p.y - cy)))
            key = _dens_cell(az, pct)
            if key not in best or r > best[key][0]:
                best[key] = (r, p.copy(), d.normalized() if r > 1e-5
                             else Vector((1, 0, 0)))
    # モデル全体の重心から見た**3Dの外向き**を足す。水平の radial だけ
    # だと頭頂・足元の card が横向きに生えてしまう
    if best:
        cz = sum(v[1].z for v in best.values()) / len(best)
        for k, (r, p, d) in list(best.items()):
            cy, _rf, _rb, _rs = _loop_at(p.z)
            o3 = Vector((p.x, p.y - cy, (p.z - cz) * 1.15))
            best[k] = (r, p, d, o3.normalized() if o3.length > 1e-5 else d)
    return best


# ------------------------------------------------- 外周レースの alpha card
# 幾何で作った実測: 小枝392 + 芽130 = 13,948 tris で 穴 0.5→1.2%。
# 設定画の 7.9% に届かせるには約5倍 ―― **外周だけで7万三角形**が要る。
# 最終予算5,000に対して桁が違うので、この層は card で作る。
# card は1枚2三角形なので、20枚でも 40 三角形。
CARD_TEX = 256
CARD_N = 40                 # 外周に配る枚数(1枚2三角形なので安い)
CARD_SIZE = (0.128, 0.098)  # 1枚の大きさ m(幅, 高さ)。
                            # 大きくすると外周が棘だらけのウニになる


def _fringe_texture() -> "bpy.types.Image":
    """小枝と芽の房を描いた RGBA テクスチャを手続き的に作る。

    PIL は bpy の venv に無いので numpy で直接画素を書く。
    大事なのは**隙間**なので、房のあいだを空けて描く。"""
    import numpy as np
    n = CARD_TEX
    rgba = np.zeros((n, n, 4), dtype=np.float32)
    # 色(リニア)。骨寄りの淡色ではなく蔦の暗紫
    stem = np.array(_fix_lin((0.075, 0.052, 0.088), VINE_FIX), dtype=np.float32)
    bud = np.array(_fix_lin((0.34, 0.24, 0.42), VINE_FIX), dtype=np.float32)

    def disc(cx, cy, r, col):
        x0, x1 = max(0, int(cx - r) - 1), min(n, int(cx + r) + 2)
        y0, y1 = max(0, int(cy - r) - 1), min(n, int(cy + r) + 2)
        if x1 <= x0 or y1 <= y0:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        a = np.clip(r - d, 0.0, 1.0)
        m = a > 0
        sub = rgba[y0:y1, x0:x1]
        sub[..., :3] = np.where(m[..., None], col, sub[..., :3])
        sub[..., 3] = np.maximum(sub[..., 3], a)

    def stroke(p0, p1, r0, r1, col, bow=0.0, steps=None):
        """二次ベジェの一筆。bow で曲げる ―― 直線だとマッチ棒に見える。"""
        dx, dy = p1[0]-p0[0], p1[1]-p0[1]
        ln = math.hypot(dx, dy) or 1.0
        cx = (p0[0]+p1[0])*0.5 - dy/ln*bow*ln
        cy = (p0[1]+p1[1])*0.5 + dx/ln*bow*ln
        steps = steps or max(int(ln), 2)
        for i in range(steps + 1):
            t = i / steps
            u = 1.0 - t
            x = u*u*p0[0] + 2*u*t*cx + t*t*p1[0]
            y = u*u*p0[1] + 2*u*t*cy + t*t*p1[1]
            disc(x, y, r0 + (r1 - r0) * t, col)

    # 根元は下辺、先は上へ。房を6つ、間を空けて生やす
    for k in range(9):
        bx = n * (0.05 + 0.108 * k) + 7.0 * _rand(k, 251.0)
        by = n * 0.97
        lean = (_rand(k, 257.0) - 0.5) * 0.55
        h = n * (0.40 + 0.34 * _rand(k, 263.0))
        tipx = bx + lean * h
        tipy = by - h
        stroke((bx, by), (tipx, tipy), n * 0.032, n * 0.012, stem,
               bow=(_rand(k, 311.0) - 0.5) * 0.34)
        # 枝2〜3本
        for j in range(3 + int(_rand(k * 3 + 1, 269.0) * 3)):
            t = 0.35 + 0.45 * _rand(k * 5 + j, 271.0)
            mx = bx + (tipx - bx) * t
            my = by + (tipy - by) * t
            ang = (_rand(k * 7 + j, 277.0) - 0.5) * 2.2
            ln = h * (0.26 + 0.30 * _rand(k * 11 + j, 281.0))
            ex = mx + math.sin(ang) * ln
            ey = my - abs(math.cos(ang)) * ln * 0.8
            stroke((mx, my), (ex, ey), n * 0.019, n * 0.008, stem,
                   bow=(_rand(k * 17 + j, 313.0) - 0.5) * 0.55)
            if _rand(k * 13 + j, 283.0) > 0.45:
                disc(ex, ey, n * 0.038, bud)
        if _rand(k, 293.0) > 0.4:
            disc(tipx, tipy, n * 0.042, bud)
    img = bpy.data.images.new(f"{NAME}_fringe", CARD_TEX, CARD_TEX, alpha=True)
    img.pixels = rgba[::-1].ravel().tolist()
    return img


def _fringe_material(img) -> "bpy.types.Material":
    """房カードの材質。手カードと同じ作りなので生成は共通化する
    (以前は別々に書いていて、寒色補正が房側だけ抜けた)。"""
    return _fringe_material_from(img, f"{NAME}_fringe_card",
                                 roughness=0.7, interpolation="Closest")


def _card(name: str, base: Vector, right: Vector, up: Vector,
          w: float, h: float) -> bpy.types.Object:
    """1枚の板(2三角形)。base を下辺の中心とする。"""
    me = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    r, u = right * (w * 0.5), up * h
    verts = [base - r, base + r, base + r + u, base - r + u]
    me.from_pydata([tuple(v) for v in verts], [], [(0, 1, 2, 3)])
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    for i, co in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[i].uv = co
    return obj


def build_fringe_cards(existing) -> list[bpy.types.Object]:
    """外周の毛羽立ちを card で作る。

    card の面は (外向き, 上) で張る ―― その方位が輪郭に来るのは
    視点が90度ずれたときで、そのとき card は正面を向く。"""
    outer = _outer_points(existing)
    cand = []
    for (ci, cj), (r, base, radial, out3) in outer.items():
        d = int(VINE_DENSITY[ci][cj])
        if d < 3:
            continue
        cand.append((d * 100 + r * 1000, ci, cj, base, radial, out3))
    cand.sort(reverse=True)
    img = _fringe_texture()
    mat = _fringe_material(img)
    out = []
    used = set()
    for score, ci, cj, base, radial, out3 in cand:
        if len(out) >= CARD_N:
            break
        # 方位角だけで間引くと高さ方向が空く。方位角3区分・高さ3区分の
        # 粗い格子で1枚ずつ置き、外周の全周に行き渡らせる
        key = (ci // 3, cj // 3)
        if key in used:
            continue
        used.add(key)
        # 成長方向 = 外向き、幅方向 = それに直交する接線
        grow = out3
        rightv = grow.cross(radial.cross(Vector((0, 0, 1))))
        if rightv.length < 1e-4:
            rightv = grow.cross(Vector((0, 0, 1)))
        rightv.normalize()
        w, h = CARD_SIZE
        k = 0.75 + 0.5 * _rand(ci * 7 + cj, 307.0)
        o = _card(f"{NAME}_card{ci}_{cj}", base - grow * (h * 0.22),
                  rightv, grow, w * k, h * k)
        C.assign_material(o, mat)
        out.append(o)
    return out


# ================================================ 頭蓋のイバラ(正面の輪)
# 設定画の頭部のイバラは**正面向きの輪**で、顔を取り囲み、頭蓋が輪の
# 中から前へ突き出している(側面図では輪が頭の後ろにあり、顔だけが
# 手前に出ている)。第4版までの冠は頭の上を横切る**鉢巻き**で、顔の
# 左右へ回り込んでいなかった ―― 輪の平面が90度違っていた。
#
# 方位角(体の縦軸まわり)では正面向きの輪を書けないので、頭蓋まわり
# だけ別の生成器にする。頭蓋中心のまわりに、法線がほぼ -y(前)の
# 平面で円を描く。
HALO_SEG = 20
# (中心のずれpx(x,y,高さ%), 半径px(x,z), 面の法線, 太さpx, うねり)
HALO_RINGS = [
    ((0.0, +28.0, 27.0), (50.0, 58.0), (0.10, -1.00, 0.20), 3.4, 0.14),
    ((-6.0, +38.0, 24.0), (43.0, 50.0), (-0.20, -1.00, -0.10), 3.0, 0.17),
    ((5.0, +20.0, 29.0), (56.0, 62.0), (0.24, -1.00, 0.04), 2.8, 0.20),
    ((-3.0, +33.0, 31.0), (47.0, 54.0), (0.05, -1.00, -0.26), 2.4, 0.22),
]


def build_halo() -> list[bpy.types.Object]:
    out = []
    cx, cy0 = SKULL_C[0] * PX, SKULL_C[1] * PX
    for i, (c, r, n, th, wob) in enumerate(HALO_RINGS):
        center = Vector((cx + c[0] * PX, cy0 + c[1] * PX, _z(c[2])))
        nz = Vector(n).normalized()
        u = nz.cross(Vector((0, 0, 1)))
        if u.length < 1e-4:
            u = nz.cross(Vector((1, 0, 0)))
        u.normalize()
        v = nz.cross(u)
        pts = []
        for k in range(HALO_SEG + 3):
            a = math.tau * k / HALO_SEG
            # 一定半径だとフラフープに見えるので、うねりを入れる
            w = 1.0 + wob * (math.sin(3 * a + i * 1.7)
                             + 0.5 * math.sin(5 * a + i * 2.3))
            dep = nz * (math.sin(2 * a + i) * 0.026)
            pts.append(center + u * (r[0] * PX * math.cos(a) * w)
                       + v * (r[1] * PX * math.sin(a) * w) + dep)
        rr = th * PX
        radii = [rr * (0.85 + 0.25 * math.sin(k * 0.7 + i))
                 for k in range(len(pts))]
        out.append(C.curve_tube(f"{NAME}_halo{i}", pts, radii,
                                resolution=1, bevel_resolution=1))
    return out


# ---------------------------------------- 手をトレースしたカードで作る
# 手は設定画で頭蓋の次に強い一次形状。ジオメトリで作り込むと、
# 大きくすれば「別の生き物」、小さくすれば96pxで消える、の板挟みに
# なった(96px判定 0.57→0.78 まで上げたが両立しなかった)。
# 頭蓋と同じく**設定画をトレース**して、交差カードで持つ。
# 形も陰影も絵と一致し、1枚2三角形で済む。
HAND_TEX = "textures/honegarami_hand.png"
# 切り出し枠 x1.0〜24.5% / h62.5〜93.0%(設定画の正面図に対する比)。
# **枠は骨の占有率で割り戻さない。** 以前は「枠内で骨が68%」として
# 1.5倍に拡大していたが、その68%は**紙の地色を骨と誤判定していた**
# 数字で、実際は42%。抜き自体を直したので、枠をそのまま設定画の
# 比率で置けばよい(正面図の全身高 232px に対し枠は 51×72px)。
HAND_CARD_W = 0.185      # m = 51/232 × 全高
HAND_CARD_H = 0.260      # m = 72/232 × 全高
HAND_CARD_X = 79.0       # 中心の |x| px(正面図の枠中心と全身中心の差)
HAND_CARD_Z = 77.8       # 中心の高さ%
HAND_CARD_Y = -30.0      # 中心の前後 px
# 交差カードの角度 deg。**大きくしすぎない。** 58度にしていたときは
# 正面から見て2枚目がほぼ真横(sin58=0.85)を向き、指の絵の上に
# **明るい縦一本の線**として重なって手が読めなかった
HAND_CROSS = 38.0
_hand_cache: dict = {}


def _fringe_material_from(img, name, roughness: float = 0.8,
                          interpolation: str = "Linear"):
    """アルファ抜きのカード材質。房カードと手カードで共通。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = interpolation
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    if hasattr(mat, "blend_method"):
        mat.blend_method = "CLIP"
    mat.use_backface_culling = False
    # **切り抜きであることを glTF の extras で明示する。**
    # Blender 5 では blend_method の CLIP が廃止され、glTF へは
    # alphaMode=BLEND としてしか出せない。BLEND は深度を書かないので、
    # 大きな板だと前後関係が壊れて不透明な灰色の板に見えた。
    # エンジン側(src/view/assets.ts)はこの印を見て alphaTest に変える
    mat["alphaCutout"] = 0.5
    return mat


def _tinted_copy(img, name: str, gain=None):
    """画像へチャンネルごとの乗率を掛けた**生成画像**を返す。

    材質側に Multiply ノードを挟む手もあるが、glTF 書き出しが
    そのノードを落として補正が消えた(baseColorFactor が付かない)。
    画素へ焼き込み、ファイル由来ではない生成画像として持たせる。

    **乗率はそのまま掛ける。** `img.pixels` はリニアなので 2.2 乗した
    値を掛けたくなるが、実測すると書き出された PNG の画素比は掛けた
    値そのままだった(0.58 を渡すと 0.58 倍)。2.2 乗を掛けていた
    あいだ、手のカードだけ二重に暗く沈んでいた。
    """
    gain = LIGHT_FIX if gain is None else gain
    w, h = img.size
    out = bpy.data.images.new(name, w, h, alpha=True)
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        px[i] *= gain[0]
        px[i + 1] *= gain[1]
        px[i + 2] *= gain[2]
    out.pixels = px
    return out


def _hand_material():
    if "mat" not in _hand_cache:
        import os
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), HAND_TEX)
        src = bpy.data.images.load(path)
        img = _tinted_copy(src, f"{NAME}_hand", _hand_gain(src))
        _hand_cache["mat"] = _fringe_material_from(img, f"{NAME}_hand_card")
    return _hand_cache["mat"]


def _hand_gain(src):
    """手のトレースの明るさを**他の骨に合わせて**から寒色補正を掛ける。

    設定画の手は図の一番下 ―― 影の中にあるので、切り出した絵の骨色は
    頭蓋のトレース(骨のアルベドの基準)より暗い。そのまま貼ると
    ゲーム内で手だけ茶色く沈み、手として読めなかった。図の中の陰影は
    ゲームの灯りが作り直すので、**アルベドとしては他の骨と同じ明るさ**
    へ正規化するのが正しい。"""
    px = list(src.pixels)
    acc, n = [0.0, 0.0, 0.0], 0
    for i in range(0, len(px), 4):
        if px[i + 3] > 0.5:
            for j in range(3):
                acc[j] += px[i + j]
            n += 1
    if n == 0:
        return LIGHT_FIX
    have = [(a / n) ** (1 / 2.2) for a in acc]
    want = [v ** (1 / 2.2) for v in _face_image()["avg"]]
    return tuple(min(2.5, w_ / max(h_, 1e-4)) * g
                 for w_, h_, g in zip(want, have, LIGHT_FIX))


def build_hand_cards() -> list[bpy.types.Object]:
    """左右の手をトレースした交差カードで作る。1手2枚=4三角形。"""
    out = []
    mat = _hand_material()
    for side in (-1.0, 1.0):
        tag = "L" if side > 0 else "R"
        c = Vector((HAND_CARD_X * PX * side, HAND_CARD_Y * PX, _z(HAND_CARD_Z)))
        base = c - Vector((0.0, 0.0, HAND_CARD_H * 0.5))
        # 3枚にして、どの角度からも手として読めるようにする
        for k, ang in enumerate((0.0, HAND_CROSS, -HAND_CROSS)):
            a = math.radians(ang)
            right = Vector((math.cos(a) * side, math.sin(a), 0.0)).normalized()
            o = _card(f"{NAME}_handcard{tag}{k}", base, right,
                      Vector((0, 0, 1)), HAND_CARD_W, HAND_CARD_H)
            C.assign_material(o, mat)
            out.append(o)
    return out


def build_thorns() -> tuple[list, list]:
    """蔦の棘と芽。**Detail Vine Gate で作る。**

    Major Vine Gate では主要蔓の経路そのものを見たいので空を返す。
    棘・芽は経路が確定してから、経路に沿って生やす。"""
    return [], []


# ------------------------------------------------------------------ 補助関数
def _apply_modifier(obj, mod) -> None:
    C.activate(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def _subdivide(obj, levels: int):
    # levels=0 の SUBSURF は無効化され apply が失敗する。LOD で 0 を
    # 渡せるようにここで弾く
    if levels <= 0:
        return
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = levels
    sub.render_levels = levels
    _apply_modifier(obj, sub)
    bpy.ops.object.shade_smooth()
    return obj


def _copy_object(src, name):
    dup = src.copy()
    dup.data = src.data.copy()
    dup.name = name
    bpy.context.collection.objects.link(dup)
    return dup


# 記憶の欠片。骨の隙間からのぞく淡紫の結晶(2〜4個、発光はごく弱く)
CRYSTALS = [
    (34.0, -40.0, 44.0, 0.022), (-40.0, -26.0, 62.0, 0.018),
    (18.0, +44.0, 52.0, 0.020), (-26.0, +38.0, 72.0, 0.016),
]
# 忘却札。蔦から吊るす木の板
TAG_C = (56.0, -34.0, 52.0)
TAG_R = (0.026, 0.006, 0.038)


def build_extras() -> tuple[list, list]:
    crystals, tag = [], []
    for i, (x, y, pct, r) in enumerate(CRYSTALS):
        crystals.append(C.uv_sphere(f"{NAME}_crystal{i}",
                                    (x * PX, y * PX, _z(pct)), r,
                                    segments=6, rings=4, scale=(1.0, 1.0, 1.6)))
    c = (TAG_C[0] * PX, TAG_C[1] * PX, _z(TAG_C[2]))
    tag.append(C.uv_sphere(f"{NAME}_tag", c, TAG_R[0], segments=4, rings=3,
                           scale=(1.0, TAG_R[1] / TAG_R[0], TAG_R[2] / TAG_R[0])))
    tag.append(C.curve_tube(f"{NAME}_tagcord",
                            [Vector((c[0], c[1], c[2] + 0.055)), Vector(c)],
                            [0.005, 0.004], bevel_resolution=1))
    return crystals, tag


def build_blockout(clay: bool = True) -> dict:
    """レビュー用のブロックアウト。部位は**別メッシュのまま**返す。"""
    cage, mass = build_mass_cage()
    # 第1層 Hero Anatomy: 胸郭・脊椎・胸骨・肩帯・骨盤・頭蓋・腕脚
    bones = (build_bones() + build_ribs() + build_sternum()
             + build_skull_arch() + build_asym() + build_shoulders()
             + build_pelvis())
    skull = build_skull()
    arms = build_arms() + build_legs()
    # 第2層 Structural Bone(外形を作る体積)。白い岩塊だったので、
    # 骨として読める形に作り直すまで止めている
    if LAYERS["structural_bone"]:
        bones = build_structural_mass() + bones + build_skirt()
        arms = arms + build_debris()
    vines = build_vines() if LAYERS["major_vine"] else []
    if LAYERS["halo"]:
        vines = vines + build_halo()
    if LAYERS["secondary"]:
        sec, twig = build_branches()
        vines = vines + sec + (twig if LAYERS["twig"] else [])
        if not LAYERS["twig"]:
            for o in twig:
                bpy.data.objects.remove(o, do_unlink=True)
    if LAYERS["wrap"]:
        vines = vines + build_limb_wraps()
    for o in vines:
        o.data.update()
    if LAYERS["fill"]:
        vines = vines + build_fill_vines(vines)
        for o in vines:
            o.data.update()
    cards = (build_fringe_cards(vines + bones + skull + arms)
             if LAYERS["cards"] else [])
    if LAYERS.get("hand_cards", True):
        cards = cards + build_hand_cards()
    crystals, tag = build_extras()
    thorns, buds = build_thorns()
    vines = vines + thorns
    crystals = crystals + buds
    if clay:
        mat = C.make_material(f"{NAME}_clay", CLAY, roughness=0.8)
        for o in [mass] + bones + skull + arms + vines + crystals + tag:
            C.assign_material(o, mat)
    parts = {"cage": cage, "mass": mass, "bones": bones, "skull": skull,
             "arms": arms, "vines": vines, "crystals": crystals, "tag": tag,
             "cards": cards}
    _normalize(parts)
    return parts


def _normalize(parts: dict) -> None:
    """設定画の全高へ一様スケールし、接地させる。部品を足すたびに
    高さが変わるので、ブロックアウトの最後に一度だけ掛ける。"""
    objs = ([parts["mass"]] + parts["bones"] + parts["skull"] + parts["arms"]
            + parts["vines"] + parts["crystals"] + parts["tag"]
            + parts.get("cards", []))
    lo, hi = C.bounds(objs)
    k = HEIGHT / (hi.z - lo.z)
    for o in objs + [parts["cage"]]:
        for v in o.data.vertices:
            v.co.x *= k
            v.co.y *= k
            v.co.z = (v.co.z - lo.z) * k
        # **忘れずに update する。** v.co を書き換えても bound_box は
        # 古いままで、C.bounds が変更前の高さを返す(第3版で 0.738 と
        # 報告され続けた原因)
        o.data.update()
    bpy.context.view_layer.update()


# --------------------------------------------------------------------- 色・塗り
# パレット7色をそのまま採る(handbook 6: スウォッチは色相の指定なので、
# 面積の大きい骨だけ絵の中の実測で明度を確かめた ―― #d5c1ab と
# 絵の中の #ccb59a はほぼ一致したのでスウォッチのまま)
SHEET = {
    "bone":    (0.673, 0.542, 0.560),   # 骨(メイン) #d5c1ab
    "gap":     (0.092, 0.068, 0.055),   # 影=骨の隙間 #564b44
    "vine":    (0.133, 0.085, 0.117),   # 蔦(メイン) #665360
    "vine_lit": (0.220, 0.148, 0.198),  # 蔦(影) #806b7a
    "crystal": (0.426, 0.325, 0.459),   # 古い記憶の欠片 #ad99b3
    "wood":    (0.364, 0.231, 0.142),   # 札・飾り #a18369
}
# 眼窩は絵の中で #161511 ―― ほぼ真っ黒。幾何の落ち込みだけでは穴に
# 見えないので、**黒い塗りが穴を作る**
SOCKET_RGB = (0.005, 0.004, 0.003)
SKULL_TEX = 320   # トレース元が256pxなので、これ以上焼いても情報は増えない


# 眼窩の穴を**正面投影**で定義する。(方位角, t) の楕円で取ると、
# 前面の曲率で横に潰れて「コンマ形」になった(第3版)。設定画の眼窩は
# 正面から見て丸いので、正面から見た (x, z) の楕円で取るのが正しい。
# 実測: 中心 |x|=16.6px・大きさ 18.1×14.0px(全高221px系)
SOCKET_X = 16.6         # 中心の |x| px
SOCKET_T = 0.545        # 頭蓋上の高さ t
SOCKET_R = (9.6, 9.2)   # 半径 px(横, 縦)。設定画より縦を大きく取る
NOSE_R = (5.6, 8.4)     # 鼻腔の半径 px
NOSE_T = 0.760


# (彫る前の投影x px, 高さ t, 半径x px, 半径z px)
HOLES = [
    (+SOCKET_X, SOCKET_T, SOCKET_R[0], SOCKET_R[1]),
    (-SOCKET_X, SOCKET_T, SOCKET_R[0], SOCKET_R[1]),
    (0.0, NOSE_T, NOSE_R[0], NOSE_R[1]),
]


# 設定画から切り出した頭蓋の面(tools/models/textures/)。
# 手続き的に眼窩を描く方式をやめ、**設定画をそのまま正面から投影する**。
# 奥行きは色(絵に描かれた陰影)で持つ。
FACE_TEX = "textures/honegarami_skull_face.png"
# 切り出し枠は x30.0〜64.5% / h9.2〜36.0%。歯は別メッシュで持つので
# 歯列の上で止めている。頭蓋(x32〜61.5% / h10.5〜38.5%)を枠内の
# 比へ直すと下の値になる。v>FACE_VMAX は絵の外なので骨色にする
FACE_U = (0.058, 0.913)
FACE_V = (0.048, 1.090)
FACE_VMAX = 1.0
FACE_HALF = 29.8        # モデル側の頭蓋の最大半幅 px
_face_cache: dict = {}


def _face_image():
    if "img" not in _face_cache:
        import os
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), FACE_TEX)
        img = bpy.data.images.load(path)
        w, h = img.size
        _face_cache["img"] = img
        _face_cache["w"], _face_cache["h"] = w, h
        px = list(img.pixels)
        _face_cache["px"] = px                 # リニア
        # **行ごとの骨色の平均**。側面〜後頭部はこれを巻き付ける。
        # 絵の左右の縁をそのまま伸ばすと、そこに写り込んでいる蔦の
        # 暗い画素が横縞になった
        rows = []
        tot, tot_n = [0.0, 0.0, 0.0], 0
        for y in range(h):
            acc, cnt = [0.0, 0.0, 0.0], 0
            for x in range(w):
                i = (y * w + x) * 4
                # 骨だけ拾う(明るく、赤が青より強い)
                if px[i] > 0.22 and px[i] > px[i + 2] * 1.25:
                    for j in range(3):
                        acc[j] += px[i + j]
                    cnt += 1
            rows.append(tuple(a / cnt for a in acc) if cnt >= 6 else None)
            for j in range(3):
                tot[j] += acc[j]
            tot_n += cnt
        # 骨が無かった行は上下から埋める
        last = SHEET["bone"]
        for y in range(h):
            if rows[y] is None:
                rows[y] = last
            else:
                last = rows[y]
        # 行平均は行ごとに揺れるので均す。生のままだと側面に横縞が出る
        sm = []
        for y in range(h):
            acc, n_ = [0.0, 0.0, 0.0], 0
            for d in range(-6, 7):
                yy = min(max(y + d, 0), h - 1)
                for j in range(3):
                    acc[j] += rows[yy][j]
                n_ += 1
            sm.append(tuple(a / n_ for a in acc))
        _face_cache["rows"] = sm
        # **トレース全体の骨画素の平均。** ここに `last`(ループ後に
        # 残る最後の行の色)を入れていたが、Blenderの `img.pixels` は
        # **下の行から**並ぶので `last` は絵の一番上の行 ―― 頭蓋の上に
        # かぶさる蔦の暗い色だった。そのため他の骨がすべて灰紫
        # (sRGB 140,126,118)に沈み、設定画の生成りと合っていなかった
        _face_cache["avg"] = (tuple(a / tot_n for a in tot) if tot_n
                              else SHEET["bone"])
    return _face_cache


def _face_sample(c, u: float, v: float):
    w, h, px = c["w"], c["h"], c["px"]
    ix = min(max(int(u * (w - 1)), 0), w - 1)
    iy = min(max(int((1.0 - v) * (h - 1)), 0), h - 1)
    i = (iy * w + ix) * 4
    return (px[i], px[i + 1], px[i + 2])


def skull_color(p: Vector, n: Vector):
    """頭蓋の塗り。**設定画を正面から投影する。**

    絵が届かない範囲(側面〜後頭部、歯列より下)も、**同じ高さの絵の
    縁の色**を巻き付けて色味を合わせる。単色で埋めると、絵の側は
    頭頂が明るく顎が暗いのに対して側面だけ一様になり、境目が出る。
    後ろへ回るほど暗くして、頭の丸みを色で表す。

    側面図の頭蓋は蔦にかなり隠れているため、そちらをトレースすると
    蔦の画素を頭蓋へ持ち込むので使っていない。"""
    c = _face_image()
    cx, cy0 = SKULL_C[0] * PX, SKULL_C[1] * PX
    top = _z(SKULL_C[2]) + SKULL_H * 0.5 * PX
    t = (top - p.z) / (SKULL_H * PX)
    xr = (p.x - cx) / (FACE_HALF * PX)          # -1〜+1
    u = FACE_U[0] + (FACE_U[1] - FACE_U[0]) * (xr * 0.5 + 0.5)
    v = FACE_V[0] + (FACE_V[1] - FACE_V[0]) * min(max(t, 0.0), 1.0)
    deg = math.degrees(math.atan2(p.y - cy0, p.x - cx))
    front = math.cos(math.radians(deg + 90.0))          # 1=正面 / -1=真後ろ

    # 絵をそのまま貼れるのは正面のうち、絵の枠に収まる範囲だけ
    inside = (0.0 <= u <= 1.0) and (v <= FACE_VMAX) and front > 0.30
    if inside:
        k = min((front - 0.30) / 0.46, 1.0)
        k = k * k * (3 - 2 * k)
        if k >= 0.999:
            return _face_sample(c, u, v)
    # 届かない範囲: 同じ高さの**骨色の平均**を巻き付ける
    ev = min(max(v, 0.0), 1.0)
    rows = c["rows"]
    base = rows[min(max(int((1.0 - ev) * (len(rows) - 1)), 0), len(rows) - 1)]
    # 後ろへ回るほど暗く(頭の丸み)。真後ろで 68%
    shade = 0.68 + 0.32 * (0.5 + 0.5 * front)
    base = tuple(b * shade for b in base)
    base = _fix_lin(base)
    if inside:
        k = min((front - 0.30) / 0.46, 1.0)
        k = k * k * (3 - 2 * k)
        col = _fix_lin(_face_sample(c, u, v))
        return tuple(col[j] * k + base[j] * (1 - k) for j in range(3))
    return base


# ゲームの灯りは寒色(ambient #6674a0 ×1.7 / key・fill #aec2f5)なので、
# 設定画の色をそのまま置くと画面では**青白い石膏**に見える。設定画の
# 正面図と実機レンダーのシルエット内平均色を突き合わせると、絵は
# (86,75,67)・暖色差 r-b=+19 なのに対しモデルは (103,96,111)・r-b=-8
# だった。差はほぼ灯りの色なので、**このモデルの全材質**へチャンネル
# ごとの乗率を掛けて打ち消す。骨だけ直すと蔦と欠片が青いまま残る。
LIGHT_FIX = (0.90, 0.80, 0.58)
# 蔦と記憶の欠片は**紫であること自体が設定**なので、青を骨ほど落とすと
# ただの枯れ枝になる。暗さだけ揃えて色相は残す
VINE_FIX = (0.90, 0.80, 0.82)


def _fix_srgb(c, fix=LIGHT_FIX):
    """sRGBの材質色へ寒色補正を掛ける。"""
    return tuple(min(1.0, v * g) for v, g in zip(c, fix))


def _fix_lin(c, fix=LIGHT_FIX):
    """リニア色(焼き込み用)へ同じ補正を掛ける。"""
    return tuple(min(1.0, v * (g ** 2.2)) for v, g in zip(c, fix))


def _bone_srgb():
    """骨の材質色(sRGB)。トレースの骨画素の平均へ補正を掛ける。"""
    return _fix_srgb(tuple(v ** (1 / 2.2) for v in _face_image()["avg"]))


def paint(parts: dict) -> None:
    """各部位へ材質を割り当てる。頭蓋だけ焼き込み(眼窩・歯)。"""
    def mat(name, key, rough=0.85, fix=LIGHT_FIX):
        return C.make_material(
            f"{NAME}_{name}",
            _fix_srgb(tuple(v ** (1 / 2.2) for v in SHEET[key]), fix),
            roughness=rough)

    # 骨の色は**設定画のトレースの平均**に合わせる。パレットの
    # SHEET["bone"] のままだと、トレースを貼った頭蓋だけ暖色で、
    # 他の骨が桃色に浮く
    bone_m = C.make_material(f"{NAME}_bone", _bone_srgb(), roughness=0.85)
    vine_m = mat("vine", "vine", 0.6, VINE_FIX)
    # **塊は「影=骨の隙間」で塗る。** 塊は骨と骨のあいだの暗がりを
    # 埋めるために置いた芯なので、骨と同じ生成りで塗ると隙間が消えて
    # のっぺりした団子になる(第1版でそうなった)
    C.assign_material(parts["mass"], mat("gap", "gap"))
    for o in parts["bones"] + parts["arms"]:
        C.assign_material(o, bone_m)
    for o in parts["vines"]:
        C.assign_material(o, vine_m)
    skull = parts["skull"][0]
    tooth_m = C.make_material(f"{NAME}_tooth", _bone_srgb(), roughness=0.8)
    for o in parts["skull"][1:]:      # 歯。白いままだと入れ歯に見える
        C.assign_material(o, tooth_m)
    C.smart_uv(skull)
    img = C.bake_albedo(skull, skull_color, size=SKULL_TEX, name=f"{NAME}_skull_albedo")
    C.assign_material(skull, C.make_textured_material(f"{NAME}_skull_mat", img,
                                                      roughness=0.85))
    for o in parts.get("crystals", []):
        C.assign_material(o, mat("crystal", "crystal", 0.35, VINE_FIX))
    for o in parts.get("tag", []):
        C.assign_material(o, mat("wood", "wood"))


# ===================================================== 本番モデル
TARGET_TRIS = 23000         # モンスター枠は 24,000(tests/models.test.ts)

# 関節。**旧モデルと同じ名前**にして monsters.honegarami_animations()
# (hip-chest / neck-head / chest-shoulder.L ...)をそのまま使う。
# 位置は新しい造形に合わせて置き直した(猫背なので y が前後に振れる)
def _joints_half() -> dict:
    return {
        "hip": (0.0, +8.0, 80.0),
        "chest": (0.0, +14.0, 52.0),
        "neck": (0.0, -10.0, 32.0),
        "head": (SKULL_C[0], SKULL_C[1], SKULL_C[2]),
        "crown": (0.0, -6.0, 8.0),
        "shoulder.L": (ARM_JOINTS[0][0], ARM_JOINTS[0][1], ARM_JOINTS[0][2]),
        "elbow.L": (ARM_JOINTS[1][0], ARM_JOINTS[1][1], ARM_JOINTS[1][2]),
        "hand.L": (HAND_CARD_X, HAND_CARD_Y, HAND_CARD_Z),
        "thigh.L": (LEG_JOINTS[0][0], LEG_JOINTS[0][1], LEG_JOINTS[0][2]),
        "knee.L": (LEG_JOINTS[1][0], LEG_JOINTS[1][1], LEG_JOINTS[1][2]),
        "foot.L": (FOOT_C[0], FOOT_C[1], FOOT_C[2]),
    }


BONES_HALF = [
    ("hip", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown"),
    ("chest", "shoulder.L"), ("shoulder.L", "elbow.L"), ("elbow.L", "hand.L"),
    ("hip", "thigh.L"), ("thigh.L", "knee.L"), ("knee.L", "foot.L"),
]


def build() -> tuple[list, bpy.types.Object]:
    """本番モデル(メッシュ+アーマチュア)を返す。"""
    parts = build_blockout(clay=False)
    bpy.data.objects.remove(parts["cage"], do_unlink=True)
    paint(parts)
    objs = ([parts["mass"]] + parts["bones"] + parts["skull"] + parts["arms"]
            + parts["vines"] + parts["crystals"] + parts["tag"]
            + parts.get("cards", []))
    mesh = C.join(objs, NAME)
    n = C.tri_count([mesh])
    if n > TARGET_TRIS:
        # カードは4頂点の板なので decimate に弱い。予算内なら触らない
        C.decimate_to(mesh, TARGET_TRIS)
    half = {k: (v[0] * PX, v[1] * PX, _z(v[2])) for k, v in _joints_half().items()}
    joints = C.mirrored(half)
    bones = C.mirrored_bones(BONES_HALF)
    armature = C.build_armature(NAME, joints, bones, mesh, root="hip")
    _check(mesh)
    return [mesh, armature], armature


def _check(mesh) -> None:
    lo, hi = C.bounds([mesh])
    h, w, d = hi.z - lo.z, hi.x - lo.x, hi.y - lo.y
    print(f"[{NAME}] 高さ {h:.3f}m 幅 {w:.3f}m 奥行き {d:.3f}m "
          f"三角形 {C.tri_count([mesh])}")
    assert abs(h - HEIGHT) < 0.008, h
    assert lo.z > -0.008, lo.z
