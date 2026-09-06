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


def build_blockout() -> dict:
    """レビュー用のブロックアウト。傘・胴・足は**別メッシュのまま**返す。"""
    body_cage, body = build_body_cage()
    cap_cage, cap = build_cap()
    feet = build_feet()
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.75)
    for o in [body, cap] + feet:
        C.assign_material(o, clay)
    return {"cage": body_cage, "cap_cage": cap_cage,
            "body": body, "cap": cap, "extras": feet}
