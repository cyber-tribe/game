"""
マドロミダケ ―― ベースケージ+Subdivision 方式。

`handbook/cage-and-2d3d-split.md` の手順をそのまま適用する
(あくびとかげで確立した方式の2体目)。仕様は
`plan/models/madoromi-remake.md`、設定画は
`plan/models/reference-madoromidake-sheet.png`。

## 3D / 2D の分担(handbook 手順1: 彫り始める前に決める)

| 要素 | 3D | テクスチャ |
|---|---|---|
| 傘のドーム・内側へ巻き込む縁・波打ち | ◎ | × |
| 傘が後ろへずれて垂れる非対称 | ◎ | × |
| 胴のベル形・前傾・口の突き出し | ◎ | ○ |
| 足2つ | ◎ | ○ |
| 傘の裏のヒダ(放射状の線) | × | ◎ |
| 閉じた目・眉・口・頬の赤み・そばかす | × | ◎ |
| 傘の花模様・体の斑 | × | ◎ |

**このキャラの顔は線が3本(閉じた目2本+小さな口)しかない。**
彫ると設定画から離れる(handbook 1-33)。傘の裏のヒダも、放射状の
細い溝は幅 1mm を切るので自動ウェイトを壊す(3-40)。どちらも塗りへ回す。

## 設定画の実測

三面図パネル(シートの連結成分から自動検出)は 3 体とも高さ 202px。
`PX` はその 1px あたりのメートル数。高さの %(上端=0%)で位置を、
**胴の中心**基準の px で半幅・前後を測る(handbook 手順2)。

側面図で分かった要点:

- **傘は後ろへずれて垂れている。** 前縁は高さ 42% で終わるのに、
  後縁は 62% まで垂れ、張り出しも前 80px に対し後ろ 107px。
  この非対称が「傘を後ろへ押しやって顔を出している」姿を作る。
- **縁は内側へ巻き込む。** 最大張り出しは 43% の 97px で、そこから
  下は 56% の 62px まで**内へ**戻る。裏のヒダはさらに内側・上へ
  上がって 44% で胴(柄)に合流する。ここは大きな負の空間なので、
  voxel 融合を使わない理由がそのまま当てはまる。
- **胴は幅 > 奥行き。** 正面の最大半幅 75px に対し、側面の奥行きは
  前 -57 〜 後 +67 の 124px(比 1.21)。
- 胴の中心は上で前(-2.5px)、下で後ろ(+8px)へずれる。腰を落として
  座り、顔だけ前へ出す姿勢。
"""

from __future__ import annotations

import math

import bmesh
import bpy
import common as C
from mathutils import Vector

NAME = "madoromi"

# 単色Clay(ブロックアウトのレビューは色を一切使わない)
CLAY = (0.62, 0.58, 0.55)

HEIGHT = 0.458              # 現行モデルと同じ全高(設定画の攻撃パネルで
                            # 主人公の膝上=約0.46m。基準表もこの値)
SHEET_H = 202.0             # 三面図の高さ(px)
PX = HEIGHT / SHEET_H       # 1px あたりのメートル

# 1ループあたりの頂点。前(顔側)に寄せて口の突き出しを表せるようにする。
# 角度 a の規約は akubitokage と同じ: sin(a) < 0 が前(-Y)、前の中心は 270°
FRONT_N = 12
BACK_N = 8
LOOP_ANGLES = ([math.radians(180 + 180 * i / FRONT_N) for i in range(FRONT_N)]
               + [math.radians(180 * j / BACK_N) for j in range(BACK_N)])
LOOP_N = len(LOOP_ANGLES)
# Subdivision はケージを内側へ縮める(20角形で約2.5%)
RADIUS_COMP = 1.025


def _z(pct: float) -> float:
    """三面図の高さ%(上端=0)→ 接地からの z(m)。"""
    return (1.0 - pct / 100.0) * HEIGHT


# --------------------------------------------------------------------- 胴のケージ
# (高さ%, 前縁px, 後縁px, 半幅px, 名前)
#   前縁/後縁 : 側面図で胴の中心から前(-Y)/後ろ(+Y)へ何px か(前は負)
#   半幅      : 正面図の半幅px
# 名前はエッジループの意味。レビューの指摘(「腰が細い」等)を
# そのまま「どの行のどの列を動かすか」に翻訳できるようにする
BODY_LOOPS = [
    # 前縁は側面図の**傘に隠れない 46% 以下**が一次情報(46%で -29.2 と、
    # 傘の前の裾 38.2 よりさらに内側にある。柄は思ったより細い)。
    # 半幅は正面図の 56% 以下が一次情報(傘の裾は 55% で終わる)
    (44.0, -28.5, +41.5, 39.0, "stem_top"),    # 傘の裏と合流する高さ
    (46.0, -29.2, +42.0, 39.5, "stem"),
    (50.0, -32.2, +43.0, 40.0, "stem_mid"),
    (55.0, -38.2, +44.0, 40.0, "stem_low"),
    (58.0, -42.0, +44.5, 40.0, "neck"),        # 正面図の最小半幅
    (60.0, -46.2, +45.0, 41.0, "neck_low"),
    # 顔。設定画の目は 65%、口は 71〜74%。前へせり出しながら太る。
    # この帯は**幅より奥行きが大きい**(顔を前へ出して眠っている)。
    # 半幅は 68〜74% の実測(48.5/57.5/62)に地面の花が乗って膨らんでいた
    # ので、単調に太る滑らかな曲線へ均した。均さないと 68〜71% だけ
    # 太り方が急になり、Clay に「肩」の段差が出る
    (62.0, -49.2, +45.8, 42.5, "brow"),
    (65.0, -50.2, +46.5, 45.0, "eye"),
    (68.0, -50.5, +46.8, 48.5, "cheek"),
    (71.0, -50.0, +47.8, 53.0, "mouth"),       # 側面図で口が前へ尖る高さ
    (74.0, -52.2, +49.5, 57.5, "chin"),
    # 腹。ここから下が体の主要ボリューム。後ろへ大きく張り出して座る
    (77.0, -53.0, +54.8, 62.0, "belly"),
    (80.0, -53.2, +60.8, 66.0, "belly_low"),
    (83.0, -52.2, +67.8, 69.5, "hip"),
    (86.0, -49.2, +74.8, 72.5, "hip_low"),
    (89.0, -47.2, +78.8, 74.5, "seat"),        # 最大半幅
    # 92% から下は地面の花・草がマスクに混ざって測れない。上の傾きを
    # そのまま延ばす(接地でわずかに絞る)
    (92.0, -45.0, +80.0, 75.5, "seat_low"),
    (96.0, -42.0, +78.0, 75.0, "base"),
    (99.0, -38.0, +72.0, 69.0, "base_low"),
    (100.0, -30.0, +58.0, 56.0, "ground"),     # 接地面。設定画の体は
                                               # 地面まで太いまま座っている
]

# 口の突き出し。側面図の 74% にある小さな前方の尖り(とがった口)。
# 3D で作るのは**シルエットに出るぶんだけ**で、口そのものは塗りが描く
POUT_Z = _z(71.0)
POUT_HALF_Z = 0.030
POUT_HALF_DEG = 26.0
POUT_OUT = 0.006


def _profile(z: float, cy: float, r_front: float, r_back: float, r_side: float
             ) -> list[tuple[float, float, float]]:
    """前/後/横で半径の違う閉じた断面。象限ごとに楕円を繋ぐ。"""
    pts = []
    for a in LOOP_ANGLES:
        c, s = math.cos(a), math.sin(a)
        ry = r_front if s < 0 else r_back
        pts.append((r_side * c, cy + ry * s, z))
    return pts


def _pout(sections: list[list[tuple[float, float, float]]]) -> None:
    """口の高さの前面中央だけを前へ押す((1-d²)² の丸い山)。"""
    for sec in sections:
        for i, (x, y, z) in enumerate(sec):
            dz = abs(z - POUT_Z) / POUT_HALF_Z
            if dz >= 1.0:
                continue
            deg = math.degrees(math.atan2(y, x)) % 360.0
            da = abs((deg - 270.0 + 180.0) % 360.0 - 180.0) / POUT_HALF_DEG
            if da >= 1.0:
                continue
            w = (1 - dz * dz) ** 2 * (1 - da * da) ** 2
            sec[i] = (x, y - POUT_OUT * w, z)


def build_body_cage() -> tuple[bpy.types.Object, bpy.types.Object]:
    """胴(柄+体)のケージと、Subdivision で丸めた本体を返す。"""
    k = RADIUS_COMP
    sections = []
    for pct, front, back, side, _name in BODY_LOOPS:
        cy = (front + back) * 0.5 * PX
        sections.append(_profile(_z(pct), cy,
                                 (cy - front * PX) * k, (back * PX - cy) * k,
                                 side * PX * k))
    _pout(sections)
    cage = C.section_loft(f"{NAME}_cage", sections, smooth=False,
                          cap_top=True, cap_bottom=True)
    body = _copy_object(cage, f"{NAME}_body")
    _subdivide(body, 2)
    return cage, body


# ----------------------------------------------------------------------- 傘
# 傘は**別メッシュ**。裏側(ヒダの面)が要るので、外側の面を縁で折り返して
# 内側へ戻る「お椀」として作る。融合しないので、この負の空間は残る。
CAP_N = 32                  # 傘は顔が無いので等間隔でよい

# 傘の子午線3本(高さ%, 中心からの張り出しpx)。**設定画のマスクから直接
# 抜いた実測**(tools/madoromi_measure.py)。1本の正規化プロファイルを
# 角度で拡大縮小する作り方では側面が合わなかった ―― 傘は後ろへ大きく、
# 前で急に巻き込む**非対称**で、上下方向の形そのものが向きで違う。
#   SIDE  : 正面図の左右平均(±X)。42% で最大 96.5px、55% で 61px まで巻き込む
#   FRONT : 側面図の前縁(-Y)。30% で最大 77px と早くに頭打ちし、45% で終わる
#   BACK  : 側面図の後縁(+Y)。54% で最大 106.8px、66% まで垂れる
#
# **裾は行の外端で測る。** 胴の測定に使った「中心を含む run だけ」の
# 規則をそのまま当てると、胴との隙間で run が割れる後ろの裾が丸ごと
# 落ちて 60% で切れた(handbook 4-13)
# 傘の頂点は真ん中ではなく後ろへ寄っている。3% の行が 前 5.2 / 後 49.8 なので
# 頂点はおよそ +22px。0% の行に前 -22 / 後 +22 を置くと、下の
# 「中心 cy=(後-前)/2、半径 ry=(後+前)/2」がそのまま頂点 (0,+22) を返す
CAP_APEX_Y = 22.0
CAP_TOP_PCT = 0.0           # 傘の頂点の高さ%(= モデルの最上端)
CAP_SIDE = [(0.0, 0.0), (3.0, 25.0), (6.0, 35.0), (9.0, 43.5), (12.0, 50.0),
            (15.0, 55.0), (18.0, 59.5), (21.0, 64.5), (24.0, 69.0), (27.0, 75.0),
            (30.0, 85.0), (33.0, 89.5), (36.0, 93.0), (39.0, 95.0), (42.0, 96.5),
            (45.0, 95.5), (48.0, 91.5), (51.0, 84.5), (53.0, 71.5), (55.0, 61.0)]
CAP_FRONT = [(0.0, -CAP_APEX_Y), (3.0, 5.2), (6.0, 22.2), (9.0, 31.2), (12.0, 40.2),
             (15.0, 49.2), (18.0, 61.2), (21.0, 63.2), (24.0, 70.2), (27.0, 76.2),
             (30.0, 77.2), (33.0, 74.2), (36.0, 69.2), (39.0, 58.2), (42.0, 47.2),
             (45.0, 38.2)]
CAP_BACK = [(0.0, CAP_APEX_Y), (3.0, 49.8), (6.0, 60.8), (9.0, 67.8), (12.0, 73.8),
            (15.0, 77.8), (18.0, 82.8), (21.0, 84.8), (24.0, 86.8), (27.0, 88.8),
            (30.0, 91.8), (33.0, 92.8), (36.0, 92.8), (39.0, 95.8), (42.0, 96.8),
            (45.0, 103.8), (48.0, 104.8), (51.0, 105.8), (54.0, 106.8),
            (57.0, 105.8), (60.0, 103.8), (63.0, 99.8), (65.0, 98.8), (66.0, 88.8)]

# 裏(ヒダの面)。シルエットに出ないので実測できない ―― 縁から内側・上へ
# 戻して柄(44%、38px)へ合流させる。(張り出しの比, 縁からの戻り高さ比)
CAP_UNDER = [(1.000, -0.075), (0.975, -0.045), (0.93, 0.06), (0.86, 0.28),
             (0.72, 0.58), (0.55, 0.82), (0.42, 1.00)]
# 最初の2枚は戻り高さを**負**にして縁より下へ出す。外面と裏面が縁で
# ぴたりと合わさると Subdivision 後に薄いナイフの縁になり、設定画の
# 「厚く丸まった縁」から遠かった。2枚に分けると玉縁が丸くなる
CAP_STEM_R = 32.0           # 柄との合流半径 px。胴(44% で 39px)より内側に
                            # 入れる。同じ半径だと面が重なって筋が出た
CAP_STEM_PCT = 44.0
# 縁の波打ち。正面図の縁は 7 弁ほどに波打つ。ドームには効かせず、
# 縁へ近づくほど強くする(u² の重み)
CAP_LOBES = 7
CAP_LOBE_R = 0.028         # 設定画の波打ちは控えめ。0.055 では傘全体が凹んで見えた
CAP_LOBE_Z = 0.018
CAP_LOBE_POWER = 4.0        # u^4。u² ではドームの上半分まで波が回った
MER_N = 22                  # 子午線を等間隔に取り直す点数
# 「縁の下端の高さ」を角度で混ぜるときの指数。張り出し(px)は sin² で
# 混ぜてよいが、**高さを同じ指数で混ぜると裾が斜め後ろでも低く垂れ**、
# 背面図で裾と胴の間の切れ込みが埋まってしまう(実測: 背面 60% で
# 設定画より 9px 外側)。後ろへ垂れるのは真後ろ付近だけなので、
# 高さだけ指数を上げて後ろへ寄せる
RIM_Z_POWER = 3.0


def _resample(profile: list[tuple[float, float]], n: int) -> list[tuple[float, float]]:
    """(高さ%, px) の折れ線を、弧長で等間隔な n 点へ取り直す。"""
    pts = [(p * 0.01 * SHEET_H, r) for p, r in profile]   # (px下がり, px張り出し)
    acc = [0.0]
    for (z0, r0), (z1, r1) in zip(pts, pts[1:]):
        acc.append(acc[-1] + math.hypot(z1 - z0, r1 - r0))
    total = acc[-1]
    out = []
    j = 0
    for i in range(n):
        t = total * i / (n - 1)
        while j < len(acc) - 2 and acc[j + 1] < t:
            j += 1
        span = acc[j + 1] - acc[j]
        f = 0.0 if span <= 0 else (t - acc[j]) / span
        z = profile[j][0] + (profile[j + 1][0] - profile[j][0]) * f
        r = profile[j][1] + (profile[j + 1][1] - profile[j][1]) * f
        out.append((z, r))
    return out


def cap_rim_pct(a: float) -> float:
    """角度 a における傘の縁の下端(高さ%)。build_cap と同じ混ぜ方。"""
    s_ = math.sin(a)
    wz = abs(s_) ** RIM_Z_POWER
    z_s = CAP_SIDE[-1][0]
    z_far = CAP_BACK[-1][0] if s_ > 0 else CAP_FRONT[-1][0]
    return (1 - wz) * z_s + wz * z_far


def build_cap() -> tuple[bpy.types.Object, bpy.types.Object]:
    """傘のケージと、Subdivision で丸めた傘を返す。

    3本の実測子午線を角度で混ぜる(重みは cos²/sin² なので和が 1 になり、
    菱形にならない)。混ぜるのは「高さ%」と「張り出しpx」の両方 ―― 前は
    45% で終わり後ろは 60% まで垂れる、という**終わりの高さの違い**も
    そのまま補間される。"""
    k = RADIUS_COMP
    mers = {key: _resample(prof, MER_N)
            for key, prof in (("side", CAP_SIDE), ("front", CAP_FRONT), ("back", CAP_BACK))}
    angles = [2 * math.pi * i / CAP_N for i in range(CAP_N)]
    sections = []
    for i in range(MER_N):
        u = i / (MER_N - 1)
        (z_s, r_side), (z_f, d_front), (z_b, d_back) = (mers["side"][i], mers["front"][i],
                                                        mers["back"][i])
        cy = (d_back - d_front) * 0.5 * PX      # 断面の中心(後ろへずれる)
        ry = (d_back + d_front) * 0.5 * PX      # 前後方向の半径
        rx = r_side * PX
        ring = []
        for a in angles:
            c, s = math.cos(a), math.sin(a)
            lobe = math.cos(CAP_LOBES * a) * u ** CAP_LOBE_POWER
            g = 1.0 + CAP_LOBE_R * lobe
            wz = abs(s) ** RIM_Z_POWER
            pct = (1 - wz) * z_s + wz * (z_b if s > 0 else z_f)
            pct *= 1.0 - CAP_LOBE_Z * lobe
            ring.append((rx * k * g * c, cy + ry * k * g * s, _z(pct)))
        sections.append(ring)
    # 裏(ヒダの面)。縁の環から柄の環へ寄せていく
    rim = sections[-1]
    stem_z = _z(CAP_STEM_PCT)
    for f_r, f_z in CAP_UNDER:
        ring = []
        for (x, y, z), a in zip(rim, angles):
            sx = CAP_STEM_R * PX * k * math.cos(a)
            sy = CAP_STEM_R * PX * k * math.sin(a)
            ring.append((x + (sx - x) * (1 - f_r) / 0.58,
                         y + (sy - y) * (1 - f_r) / 0.58,
                         z + (stem_z - z) * f_z))
        sections.append(ring)
    cage = C.section_loft(f"{NAME}_cap_cage", sections, smooth=False,
                          cap_top=False, cap_bottom=True)
    cap = _copy_object(cage, f"{NAME}_cap")
    _subdivide(cap, 2)
    return cage, cap


# ----------------------------------------------------------------------- 足
# 正面図の下端に、菌糸の塊の小さな足が2つ前へのぞく。
# x ±27px、前へ -62px まで、高さ 0〜16px(接地)
FOOT_C = (26.0, -54.0, 8.5)     # px (x, y, z)
FOOT_R = (22.0, 21.0, 9.5)      # px 半径


def build_feet() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        c = (FOOT_C[0] * PX * side, FOOT_C[1] * PX, FOOT_C[2] * PX)
        f = C.uv_sphere(f"{NAME}_foot{'L' if side > 0 else 'R'}", c, FOOT_R[0] * PX,
                        segments=16, rings=12,
                        scale=(1.0, FOOT_R[1] / FOOT_R[0], FOOT_R[2] / FOOT_R[0]))
        out.append(f)
    return out


# --------------------------------------------------------------------- 浮遊胞子
# 淡い紫の綿毛。三面図にも描かれているので常時出す。
# 大きさの違う小球の房にして輪郭を完全な円にしない(あくびとかげの煙と同じ)
SPORE_RGB = (0.86, 0.80, 0.90)
SPORE_ALPHA = 0.85          # 設定画の胞子は「ふんわり半透明」
SPORE_PUFFS = [
    # (x, y, z, r) すべて m。傘の縁のすぐ外側に3房
    (-0.196, -0.030, 0.150, 0.022), (-0.214, -0.006, 0.168, 0.018),
    (-0.186, +0.012, 0.180, 0.014),
    (+0.204, -0.012, 0.162, 0.020), (+0.220, +0.014, 0.180, 0.016),
    (+0.192, +0.030, 0.150, 0.013),
    (+0.060, +0.232, 0.238, 0.019), (+0.030, +0.246, 0.262, 0.015),
    (+0.078, +0.230, 0.270, 0.012),
]


# ------------------------------------------------------------------ 補助関数
def _apply_modifier(obj: bpy.types.Object, mod: bpy.types.Modifier) -> None:
    C.activate(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def _subdivide(obj: bpy.types.Object, levels: int) -> bpy.types.Object:
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = levels
    sub.render_levels = levels
    _apply_modifier(obj, sub)
    bpy.ops.object.shade_smooth()
    return obj


def _copy_object(src: bpy.types.Object, name: str) -> bpy.types.Object:
    dup = src.copy()
    dup.data = src.data.copy()
    dup.name = name
    bpy.context.collection.objects.link(dup)
    return dup


# --------------------------------------------------------------------- 色・塗り
# handbook 6: **スウォッチは色相の指定、明度は絵の中から測る。**
# パレット(#665c82 等)と絵の中の実測を突き合わせた結果:
#   傘の地   スウォッチ #665c82 / 絵の中 #746475 ―― 明度はほぼ同じで
#            彩度だけ違う。両者の中間(#6c6082)を採る
#   体       スウォッチ #e0c8af / 絵の中 #dec7af ―― 一致。そのまま
#   傘の裏   絵の中 #6a5c53(暗い暖色のグレー)
SHEET = {
    "cap":        (0.405, 0.320, 0.462),   # 傘(メイン)。設定画の平均
                                           # (#746475)ではなく**光の当たった側**
                                           # (#af929c 寄り)に合わせる ―― ダンジョンは
                                           # 暗く、平均値で塗ると紺色に沈んだ
    "cap_lobe":   (0.625, 0.525, 0.655),   # 傘の模様: 淡い紫の花
    "cap_cream":  (0.845, 0.740, 0.645),   # 傘の模様: 生成りの花
    "cap_speck":  (0.62, 0.44, 0.20),      # 傘の金色の粒
    "body":       (0.740, 0.600, 0.492),   # 体(メイン)。パレット #e0c8af を
                                           # 青側へ少し戻す(ダンジョンの暖色光で
                                           # 橙に寄りすぎるため)
    "body_shade": (0.455, 0.360, 0.325),   # 体(影)。パレット #bca69b
                                           # (0.511,0.389,0.334)を少し落とす
    "body_speck": (0.60, 0.46, 0.35),
    "gill":       (0.185, 0.140, 0.115),   # 傘の裏のヒダ(溝の線)
    "gill_lit":   (0.300, 0.235, 0.190),   # ヒダの面(絵の中 #917860 相当)
    "foot":       (0.400, 0.315, 0.262),   # 足。体よりかなり沈める。単色の
                                           # 明るい面はトゥーン+リムライトで
                                           # 白く飛び、設定画の「体と同じ質感の
                                           # 小さな塊」に見えなかった
    "spore":      (0.652, 0.505, 0.500),   # 胞子(パレット #d2bbba)
}

# 傘の花模様。設定画の傘は「生成りの大きな花」と「淡い紫の小さな花」の
# 2種類が散っている。花は5弁のロゼット(中心の丸+周囲5つの丸)で、
# 正面図で実測した直径は 26px ≒ 0.059m、花弁1つが 11px ≒ 0.025m。
# 位置は**傘を上から見た平面**(x, y)で置く。ドームなので縁へ行くほど
# 潰れるが、設定画の縁の花も同じように潰れて描かれている
FLOWER_PETALS = 5
# 花の位置は **(角度, 子午線位置 t)** で置く。傘を上から見た (x, y) で
# 置くと、縁の近くは面がほぼ垂直なので円のスタンプが放射状の筋に潰れた。
# t は「頂点=0、縁=1」の正規化位置。半径は m(面の上での大きさ)
MERIDIAN_LEN = 0.29
FLOWER_SCALE = 1.75         # 設定画の花は傘の幅の 13%。小さすぎたので拡大         # 頂点から縁までのおよその弧長 m
FLOWER = [
    # (角度deg, t, 半径m, 生成りか, 回転rad)
    (12, 0.30, 0.0150, True, 0.4), (78, 0.52, 0.0145, True, 1.1),
    (145, 0.34, 0.0140, True, 2.0), (208, 0.58, 0.0142, True, 0.2),
    (262, 0.40, 0.0136, True, 1.5), (325, 0.62, 0.0140, True, 0.9),
    (44, 0.74, 0.0130, True, 2.4), (112, 0.80, 0.0126, True, 0.7),
    (175, 0.72, 0.0132, True, 1.8), (240, 0.78, 0.0124, True, 1.2),
    (300, 0.84, 0.0126, True, 2.7), (8, 0.62, 0.0132, True, 0.6),
    (190, 0.16, 0.0128, True, 1.4), (95, 0.20, 0.0124, True, 2.1),
    (348, 0.44, 0.0080, False, 0.5), (60, 0.36, 0.0076, False, 1.6),
    (130, 0.56, 0.0078, False, 2.2), (222, 0.30, 0.0074, False, 0.3),
    (285, 0.60, 0.0072, False, 1.0), (30, 0.86, 0.0072, False, 2.6),
    (160, 0.88, 0.0068, False, 0.8), (255, 0.90, 0.0068, False, 1.9),
    (315, 0.24, 0.0068, False, 0.1), (85, 0.66, 0.0066, False, 2.9),
    (200, 0.86, 0.0064, False, 2.3), (140, 0.14, 0.0066, False, 0.9),
    (270, 0.16, 0.0062, False, 1.7), (20, 0.94, 0.0060, False, 0.2),
]
CAP_R_MAX = 97.0            # 傘の最大張り出し px(正面図の実測)
GILL_COUNT = 54             # 傘の裏の放射状のヒダ
CAP_SPECKS = 90             # 金色の粒の数
BODY_SPECKS = 150

_DECAL_CACHE: dict = {}


def _decal():
    """なぞった顔デカール(RGBA, linear)。無ければ None(Clay 相当)。

    読み込みは PIL ではなく **bpy.data.images**。モデルのビルドは
    bpy の venv で走り、そこに PIL は入っていない(akubitokage と同じ)。
    Blender は PNG を linear へ変換して渡すので、ここでのガンマ補正は不要。"""
    if "face" not in _DECAL_CACHE:
        import os
        path = "design/characters/madoromi/generated/madoromi-decal-face.png"
        if not os.path.exists(path):
            _DECAL_CACHE["face"] = None
        else:
            import numpy as np
            img = bpy.data.images.load(os.path.abspath(path))
            w, h = img.size
            px = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            bpy.data.images.remove(img)
            _DECAL_CACHE["face"] = px.reshape(h, w, 4)[::-1]
    return _DECAL_CACHE["face"]


# 顔デカールを貼る箱(m)。tools/madoromi_decal.py の実測と同期させること。
# 設定画は正投影なので、**平面(x, z)投影がそのまま逆写像**になる
FACE_PCT = (53.0, 84.0)
FACE_HALF_X = 40.0 * PX
FACE_Z = (_z(FACE_PCT[1]), _z(FACE_PCT[0]))


def _rand(seed: int) -> float:
    """位置に依らない決定的な擬似乱数(0..1)。"""
    x = math.sin(seed * 12.9898) * 43758.5453
    return x - math.floor(x)


def _speck(p, n_specks: int, seed0: int, scale: float, radius: float) -> float:
    """球面上へ散らした小さな点。戻り値は 0..1 の被覆。"""
    best = 0.0
    for i in range(n_specks):
        a = _rand(seed0 + i) * math.tau
        b = math.acos(2 * _rand(seed0 + i + 977) - 1)
        c = Vector((math.sin(b) * math.cos(a), math.sin(b) * math.sin(a), math.cos(b))) * scale
        d = (p - c).length / radius
        if d < 1.0:
            best = max(best, (1 - d * d) ** 2)
    return best


def _flower(a: float, t: float, r_xy: float) -> tuple[tuple, float]:
    """傘の花模様。(色, 被覆0..1) を返す。

    a は角度、t は子午線位置(頂点0〜縁1)、r_xy はその点の軸からの距離。
    角度差は r_xy を掛けて**面の上の長さ**に直すので、縁でも花が
    潰れない。"""
    for fa, ft, fr, cream, rot in FLOWER:
        da = (a - math.radians(fa) + math.pi) % math.tau - math.pi
        x = da * r_xy
        y = (t - ft) * MERIDIAN_LEN
        dx, dy = x, y
        fr *= FLOWER_SCALE
        if dx * dx + dy * dy > (fr * 1.25) ** 2:
            continue
        # ロゼット: 中心の丸 + 周囲5つの花弁。ロゼット全体の半径が fr
        cov = 1.0 if dx * dx + dy * dy < (fr * 0.34) ** 2 else 0.0
        for k in range(FLOWER_PETALS):
            pa = rot + math.tau * k / FLOWER_PETALS
            px_ = math.cos(pa) * fr * 0.53
            py_ = math.sin(pa) * fr * 0.53
            d = math.hypot(x - px_, y - py_) / (fr * 0.47)
            if d < 1.0:
                cov = max(cov, min(1.0, (1 - d) * 9.0))
        if cov > 0:
            return (SHEET["cap_cream"] if cream else SHEET["cap_lobe"]), cov
    return SHEET["cap"], 0.0


def cap_color(p: Vector, n: Vector):
    """傘の色。上面=紫+花模様、裏面=放射状のヒダ。

    上か裏かは**面法線**で分ける。位置のしきい値だと縁の巻き込みで
    上下が入れ替わり、境界が市松にちらつく(bake_albedo の注意書き)。"""
    if n.z < -0.15:
        a = math.atan2(p.y, p.x)
        # 山ではなく**細い溝の線**。0.5+0.5cos だと縞が半々になり
        # ゼブラに見えた。線の幅を全体の 1/4 に絞る
        t = min(1.0, (abs(math.cos(GILL_COUNT * a * 0.5)) ** 0.35))
        base = tuple(SHEET["gill"][i] + (SHEET["gill_lit"][i] - SHEET["gill"][i]) * t
                     for i in range(3))
        # 柄に近いほど暗い(奥まっているので光が回らない)
        r = math.hypot(p.x, p.y) / (CAP_R_MAX * PX)
        k = 0.70 + 0.30 * min(1.0, r / 0.75)
        return tuple(c * k for c in base)
    a = math.atan2(p.y, p.x)
    rim = cap_rim_pct(a)
    top_z = _z(CAP_TOP_PCT)
    t = min(1.0, max(0.0, (top_z - p.z) / max(1e-6, top_z - _z(rim))))
    col, cov = _flower(a, t, math.hypot(p.x, p.y))
    base = SHEET["cap"]
    out = tuple(base[i] + (col[i] - base[i]) * cov for i in range(3))
    # 金色の粒
    g = _speck(p - Vector((0, 0, _z(30.0))), CAP_SPECKS, 4001, 0.20, 0.0075)
    if g > 0:
        out = tuple(out[i] + (SHEET["cap_speck"][i] - out[i]) * g * 0.75 for i in range(3))
    # 縁へ向かってわずかに沈める(設定画の傘は縁が暗い)
    r = math.hypot(p.x, p.y) / (CAP_R_MAX * PX)
    return tuple(c * (1.0 - 0.18 * max(0.0, r - 0.55) / 0.45) for c in out)


def body_color(p: Vector, n: Vector):
    """体の色。生成り + 下へ沈む陰 + 斑点、前面になぞった顔を載せる。"""
    pct = (1.0 - p.z / HEIGHT) * 100.0
    # 上(柄)と下(接地際)が沈み、腹の面が明るい ―― 設定画の陰の付き方
    t_low = max(0.0, (pct - 86.0) / 14.0)
    t_up = max(0.0, (58.0 - pct) / 24.0)
    shade = min(1.0, t_low * 0.85 + t_up * 0.75)
    base = tuple(SHEET["body"][i] + (SHEET["body_shade"][i] - SHEET["body"][i]) * shade
                 for i in range(3))
    # 柄の縦の筋(設定画の上部にある繊維の線)
    if pct < 62.0:
        a = math.atan2(p.y, p.x)
        v = 0.5 + 0.5 * math.cos(23.0 * a)
        w = min(1.0, (62.0 - pct) / 16.0) * 0.07
        base = tuple(c * (1.0 - w * v) for c in base)
    # 細かい斑点
    sp = _speck(p - Vector((0, 0, _z(80.0))), BODY_SPECKS, 91, 0.11, 0.0075)
    if sp > 0:
        base = tuple(base[i] + (SHEET["body_speck"][i] - base[i]) * sp * 0.8 for i in range(3))
    # 顔(なぞったデカール)。正面を向いた面だけに載せる
    dec = _decal()
    if dec is not None and n.y < -0.25 and FACE_Z[0] <= p.z <= FACE_Z[1]:
        u = 0.5 + p.x / (2 * FACE_HALF_X)
        v = (FACE_Z[1] - p.z) / (FACE_Z[1] - FACE_Z[0])
        if 0.0 <= u <= 1.0:
            h, w = dec.shape[:2]
            px_ = min(w - 1, max(0, int(u * w)))
            py_ = min(h - 1, max(0, int(v * h)))
            r, g, b, alpha = dec[py_, px_]
            alpha *= min(1.0, (-n.y - 0.25) / 0.35)   # 横を向く面ほど薄く
            if alpha > 0.004:
                base = (base[0] + (r - base[0]) * alpha,
                        base[1] + (g - base[1]) * alpha,
                        base[2] + (b - base[2]) * alpha)
    return base


def foot_color(p: Vector, n: Vector):
    return SHEET["foot"]


def build_spores() -> list[bpy.types.Object]:
    """浮遊する胞子。三面図にも描かれているので常時出す。"""
    out = []
    for i, (x, y, z, r) in enumerate(SPORE_PUFFS):
        out.append(C.uv_sphere(f"{NAME}_spore{i}", (x, y, z), r, segments=10, rings=8))
    return out


def build_blockout(clay: bool = True, spores: bool = True) -> dict:
    """レビュー用のブロックアウト。傘・胴・足は**別メッシュのまま**返す。"""
    body_cage, body = build_body_cage()
    cap_cage, cap = build_cap()
    feet = build_feet()
    puffs = build_spores() if spores else []
    if clay:
        mat = C.make_material(f"{NAME}_clay", CLAY, roughness=0.75)
        for o in [body, cap] + feet + puffs:
            C.assign_material(o, mat)
    return {"cage": body_cage, "cap_cage": cap_cage, "body": body, "cap": cap,
            "extras": feet, "spores": puffs}


def texture_blockout(parts: dict, size: int = 2048) -> None:
    """ブロックアウトへ塗りを載せる(レビュー用。本番化は別工程)。"""
    for obj, fn, px in ((parts["body"], body_color, size),
                        (parts["cap"], cap_color, size)):
        C.smart_uv(obj)
        img = C.bake_albedo(obj, fn, size=px, name=f"{obj.name}_albedo")
        C.assign_material(obj, C.make_textured_material(f"{obj.name}_mat", img,
                                                        roughness=0.85))
    foot_srgb = tuple(v ** (1 / 2.2) for v in SHEET["foot"])   # make_material は sRGB
    foot_mat = C.make_material(f"{NAME}_foot", foot_srgb, roughness=0.85)
    for o in parts["extras"]:
        C.assign_material(o, foot_mat)
    spore_srgb = tuple(v ** (1 / 2.2) for v in SHEET["spore"])
    spore_mat = C.make_material(f"{NAME}_spore", spore_srgb, roughness=0.5,
                                emission=0.05, alpha=SPORE_ALPHA)
    for o in parts.get("spores", []):
        C.assign_material(o, spore_mat)


# ------------------------------------------------------------------- 本番モデル
# ブロックアウト(別メッシュのまま)を1枚に統合し、三角形数を落として
# アーマチュアを付ける。voxel remesh は使わない ―― join しただけなので、
# 傘の裏の空洞・傘と胴の隙間といった負の空間はそのまま残る。
TARGET_TRIS = 4200          # モンスター枠(上限12,000)。旧モデルは 3,872
TEX_SIZE = 1024             # 体・傘それぞれ

# 関節。**旧モデルと同じ名前**にして monsters.madoromi_animations()
# (root-stem / stem-capbase / capbase-captop)をそのまま使う
JOINTS = {
    "root": (0.0, 0.010, 0.060),
    "stem": (0.0, 0.000, 0.200),
    "capbase": (0.0, 0.020, 0.262),   # 柄と傘の裏が合流する高さ(44%)
    "captop": (0.0, 0.030, 0.420),
}
BONES = [("root", "stem"), ("stem", "capbase"), ("capbase", "captop")]


def build() -> tuple[list, bpy.types.Object]:
    """本番モデル(メッシュ+アーマチュア)を返す。"""
    parts = build_blockout(clay=False)
    bpy.data.objects.remove(parts["cage"], do_unlink=True)
    bpy.data.objects.remove(parts["cap_cage"], do_unlink=True)
    body, cap, feet, spores = (parts["body"], parts["cap"],
                               parts["extras"], parts["spores"])
    # 焼き分けのため、join する前に別々のマテリアルを割り当てておく
    # (join はスロットを保つので、あとで material_index で焼き分けられる)
    slots = [C.make_material(f"{NAME}_body", (0.5, 0.5, 0.5)),
             C.make_material(f"{NAME}_cap", (0.5, 0.5, 0.5)),
             C.make_material(f"{NAME}_foot",
                             tuple(v ** (1 / 2.2) for v in SHEET["foot"]),
                             roughness=0.85)]
    C.assign_material(body, slots[0])
    C.assign_material(cap, slots[1])
    for o in feet:
        C.assign_material(o, slots[2])
    # 胞子は**塗りを焼き終えてから**合流させる(handbook 4-12)。
    # 先に join すると UV の取り直しと焼きに巻き込まれ、自前の
    # マテリアルも失われる
    spore_tris = C.tri_count(spores)
    for i, o in enumerate(spores):
        o.vertex_groups.new(name="spore_pin").add(
            [v.index for v in o.data.vertices], 1.0, "REPLACE")
    mesh = C.join([body, cap] + feet, NAME)
    C.decimate_to(mesh, TARGET_TRIS - spore_tris)
    # UV: 背中に模様は無いが、傘は上から見て回る形なので赤道シームでよい
    C.organic_uv(mesh, axis=2)
    imgs = []
    for idx, fn in ((0, body_color), (1, cap_color)):
        img = C.bake_albedo(mesh, fn, size=TEX_SIZE,
                            name=f"{NAME}_{'body' if idx == 0 else 'cap'}_albedo",
                            material_index=idx)
        imgs.append(C.make_textured_material(
            f"{NAME}_{'skin' if idx == 0 else 'cap_mat'}", img, roughness=0.85))
    mesh.data.materials[0] = imgs[0]
    mesh.data.materials[1] = imgs[1]
    spore_mat = C.make_material(f"{NAME}_spore",
                                tuple(v ** (1 / 2.2) for v in SHEET["spore"]),
                                roughness=0.5, emission=0.05, alpha=SPORE_ALPHA)
    for o in spores:
        C.assign_material(o, spore_mat)
    mesh = C.join([mesh] + spores, NAME)
    armature = C.build_armature(NAME, {k: Vector(v) for k, v in JOINTS.items()},
                                BONES, mesh, root="root")
    C.pin_weight_to_bone(mesh, "spore_pin", "stem-capbase")
    _check(mesh)
    return [mesh, armature], armature


def _check(mesh) -> None:
    lo, hi = C.bounds([mesh])
    h, w, d = hi.z - lo.z, hi.x - lo.x, hi.y - lo.y
    print(f"[{NAME}] 高さ {h:.3f}m 幅 {w:.3f}m 奥行き {d:.3f}m 三角形 {C.tri_count([mesh])}")
    print(f"[{NAME}] マテリアル {[m.name for m in mesh.data.materials]}")
    assert abs(h - HEIGHT) < 0.006, h
    assert lo.z > -0.006, lo.z
    assert len(mesh.data.materials) == 4, [m.name for m in mesh.data.materials]
    assert C.tri_count([mesh]) <= TARGET_TRIS, C.tri_count([mesh])
