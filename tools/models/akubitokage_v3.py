"""
あくびとかげ v3 ―― ベースケージ+Subdivision方式のブロックアウト。

v2(#1064〜#1068)の「断面ロフト+curve_tube+sculpt_merge/voxel remesh」は、
首・脇・顎下・腹と腿の境界といった**負の空間をvoxel融合が埋めてしまう**
方式だった。谷を深くしても融合で消え、また深くする、を4回繰り返しても
設定画とのA/B比較で大きな前進が無かったため、造形方式そのものを
切り替える(plan/models/akubitokage-remake.md 追記参照)。

方針:
- 頭・喉・胸・腹・腰は、意味のあるエッジループを持つ**手作りのローポリ
  ケージ**を`C.section_loft`で組み、Subdivisionで仕上げる。voxel remeshは
  使わない(Subdivisionはケージの谷をそのまま保つ)。
- 各ループは楕円ではなく、前/後/横の半径を別々に持つ断面にする。
- 前脚・後脚・尾・背びれは**別メッシュ**のまま置く。設定画との
  Clay A/Bで「部位として読める」ことを確認するまで胴へ融合しない。
- 設定画は完全に整合した三面図とは仮定しない(view authority):
  正面=顔・腕・腹・足、側面=姿勢・頭〜背中〜尾のライン・大腿、
  背面=背びれ・腰・大腿・尾根元 を優先する。

第2回レビュー(ブロックアウト初版への指摘)で決めたこと:
- **ポーズを再現する。** 初版は「頭・細い首・真っ直ぐな胴・左右に腕」の
  マネキン構造だった。設定画は頭を少し上げ、胸を反らし、腹を前へ出し、
  尻に体重を預けて座っている。ケージの各ループの中心と前後半径は、
  設定画の側面マスクを高さ5mmごとに実測した前縁/後縁からそのまま取る
  (下の BODY_LOOPS の数値がその実測値。頭の傾きは回転ではなく実測の
  中心ずれとして含まれる)。
- **細い首は作らない。** 側面の実測では、喉は鼻先から胸まで一直線の斜面で、
  z=0.095の奥行き(0.075)は胸(0.054)より大きい。「首という部品」ではなく、
  正面図の z≈0.075 にある幅のくびれ(0.058 ← 頭0.085/胴+腕0.083)だけを
  作る。
- **頭は円盤ではなく頬張り形。** 正面の最大幅0.085は z=0.085〜0.110 の
  低い帯にあり、そこから頭頂へ急に絞る(z=0.130で0.047)。鼻先は短く丸く、
  頭頂は後頭部まで平らに続く(側面の奥行き0.09 > 正面の幅0.085)。
- 腕は「肩は胴の近く→肘が外→手が内」の弧。腿は球ではなく尻側が大きい卵。
  尾は側面から中心線+各断面半径を再トレース。背びれは球の列ではなく
  1枚の低ポリstripに厚みを付けた連続した波形。

座標: -Yが正面、+X右、Z上。単位m。設定画側面の「鼻先」を y=-0.060 に置く。

本番の`monsters.MONSTERS`には登録しない(ゲーム本体・CIには影響しない)。
承認後に本組み・アーマチュア・テクスチャを載せる。
"""

from __future__ import annotations

import math

import bmesh
import bpy
import common as C
from mathutils import Quaternion, Vector

NAME = "akubitokage_v3"

# 単色Clay用の材質色(レビュー時はテクスチャ・煙・腹色・鱗を一切使わない)
CLAY = (0.62, 0.58, 0.55)

# 1ループあたりの頂点数。ケージなので少なく保つ(Subdivisionで丸める)
LOOP_N = 12
# Subdivisionは12角形のケージを約7%内側へ縮める。実測半径をそのまま置くと
# 全体が一回り細くなるので、半径にだけ掛けて補正する(中心位置は変えない)
RADIUS_COMP = 1.06

# ---------------------------------------------------------------- 胴+頭のケージ
# (z, cy, r_front, r_back, r_side, snout, name)
#   cy      : ループ中心の前後位置(-Yが正面。負=前)
#   r_front : 中心から前(-Y)方向への半径 → 前縁 = cy - r_front
#   r_back  : 中心から後ろ(+Y)方向への半径 → 後縁 = cy + r_back
#   r_side  : 中心から横(±X)方向への半径(正面図の半幅)
#   snout   : 前半分の平面視の絞り(0=左右対称の楕円, 0.5=前へ行くほど細い
#             卵形)。頭のループで口吻を「頭幅いっぱいの平らな壁」ではなく
#             丸く短い鼻先にするために使う。
# 前縁/後縁は設定画側面マスクの実測(鼻先=y-0.060)。r_sideは正面マスクの実測。
# z昇順。名前はエッジループの意味(レビュー・調整の手がかり)
BODY_LOOPS = [
    # 尻: 床に体重を預ける。骨盤(z≈0.028)が最も後ろ(+0.048)へ張る
    (0.005, +0.010, 0.020, 0.020, 0.016, 0.0, "seat"),        # 接地面(ほぼ床)
    (0.012, +0.0085, 0.0325, 0.0325, 0.024, 0.0, "rump_low"),
    (0.020, +0.0075, 0.0385, 0.0385, 0.028, 0.0, "rump"),
    (0.028, +0.0065, 0.0415, 0.0415, 0.031, 0.0, "pelvis"),   # 後縁+0.048: 骨盤が後ろ
    # 腹: 前面はほぼ垂直(-0.032〜-0.035)、背中は腰へ向かって後ろへ逃げる。
    # 正面では腕の間で丸く張る
    (0.036, +0.006, 0.040, 0.040, 0.033, 0.0, "belly_low"),
    (0.044, +0.005, 0.036, 0.036, 0.034, 0.0, "belly"),
    (0.052, +0.003, 0.035, 0.035, 0.034, 0.0, "belly_high"),
    (0.060, +0.000, 0.0325, 0.0325, 0.033, 0.0, "ribs"),
    # 胸: 反らす=前面は腹と同じ面(-0.029)に留まり、背中が垂直に立つ
    (0.068, -0.0005, 0.0285, 0.0285, 0.031, 0.0, "chest"),
    (0.075, -0.003, 0.027, 0.027, 0.029, 0.0, "shoulder"),    # 正面のくびれ(最小幅0.058)
    # 喉〜顎: 「首」は無い。前縁が斜めに滑り出し、横幅は頬へ広がる
    # 正面は下ぶくれ: 最大幅は顎〜口の高さ(z0.088〜0.096)にあり、上へ絞る
    (0.081, -0.008, 0.031, 0.031, 0.034, 0.15, "throat"),
    (0.088, -0.012, 0.036, 0.036, 0.042, 0.30, "jaw"),        # 顎下=頬の最大幅
    (0.096, -0.0155, 0.0375, 0.0375, 0.0425, 0.38, "mouth"),  # 口の高さ。後縁+0.022=項の谷
    (0.104, -0.015, 0.041, 0.041, 0.041, 0.42, "cheek"),
    (0.112, -0.0145, 0.0455, 0.0455, 0.038, 0.45, "snout_eye"),  # 鼻先が最前(-0.060)。後頭部最後(+0.031)
    # 頭頂へ: 正面幅は急に絞る(頬張り形)、側面の奥行きは平らに残る
    (0.120, -0.020, 0.038, 0.038, 0.032, 0.40, "brow"),
    (0.128, -0.016, 0.032, 0.032, 0.026, 0.30, "forehead"),
    (0.134, -0.0115, 0.0255, 0.0255, 0.017, 0.20, "crown"),
    (0.1375, -0.010, 0.014, 0.014, 0.007, 0.10, "top"),
]


def _profile(z: float, cy: float, r_front: float, r_back: float, r_side: float,
             snout: float = 0.0, n: int = LOOP_N, cx: float = 0.0
             ) -> list[tuple[float, float, float]]:
    """前/後/横で半径の違う閉じた断面ループ。
    象限ごとに楕円を繋ぐので、卵形(腹・口吻)や横張り(頬)を1ループで表せる。
    snout>0 で前半分の横幅を前へ行くほど絞り、平面視を卵形にする。"""
    pts = []
    for i in range(n):
        a = i * math.tau / n
        c, s = math.cos(a), math.sin(a)
        # y方向の半径は前(s<0)と後ろ(s>0)で切り替える
        ry = r_front if s < 0 else r_back
        x_scale = 1.0 - snout * (-s) if s < 0 else 1.0
        pts.append((cx + r_side * c * x_scale, cy + ry * s, z))
    return pts


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


def build_body_cage() -> tuple[bpy.types.Object, bpy.types.Object]:
    """胴+頭のケージ(ローポリ)と、それをSubdivisionで丸めた本体を返す。"""
    k = RADIUS_COMP
    sections = [_profile(z, cy, rf * k, rb * k, rs * k, snout)
                for (z, cy, rf, rb, rs, snout, _n) in BODY_LOOPS]
    cage = C.section_loft(f"{NAME}_cage", sections, smooth=False,
                          cap_top=True, cap_bottom=True)
    body = _copy_object(cage, f"{NAME}_body")
    _subdivide(body, 2)
    return cage, body


# ------------------------------------------------------------------- 四肢・尾
# 別メッシュ。胴へは融合しない(ブロックアウト段階)。

def build_arms() -> list[bpy.types.Object]:
    """前脚。正面図の弧: 肩は胴の近く(x0.027) → 肘が外(x0.036) → 手が内(x0.021)。
    肩 z0.066 から手 z0.006 までの短い腕。側面では前縁が胸の面(-0.030)より
    わずかに前に出る程度に留める。"""
    out = []
    for side in (-1.0, 1.0):
        pts = [
            # 肩は胴の中・首のくびれ(z0.075)より下から出す。高く太いと
            # 正面で顎の真下に肩が並び、くびれが隠れる
            Vector((0.024 * side, -0.010, 0.062)),  # 肩(胴の側面に埋まる)
            Vector((0.033 * side, -0.022, 0.048)),  # 上腕
            Vector((0.036 * side, -0.028, 0.035)),  # 肘(最も外)
            Vector((0.030 * side, -0.031, 0.021)),  # 前腕
            Vector((0.024 * side, -0.036, 0.012)),  # 手首(内へ)
            Vector((0.021 * side, -0.044, 0.008)),  # 手
        ]
        arm = C.curve_tube(f"{NAME}_arm{side:+.0f}", pts,
                           [0.011, 0.011, 0.010, 0.0085, 0.008, 0.0075])
        out.append(arm)
        # 手先: 低く前へ伸びる(指はまだ作らない)
        pad = C.uv_sphere(f"{NAME}_hand{side:+.0f}", (0.021 * side, -0.046, 0.005),
                          0.010, segments=10, rings=7, scale=(1.15, 1.5, 0.5))
        out.append(pad)
    return out


def _egg(name: str, center, axis, r_side: float, r_across: float, r_along: float,
         taper: float, segments: int = 14, rings: int = 10) -> bpy.types.Object:
    """卵形。axis方向の+側(先端)へ向かって断面半径を (1-taper) 倍まで絞る。
    大腿のように「尻側が大きく膝側へ収束する」塊を球の代わりに置く。"""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    rot = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized())
    for v in bm.verts:
        t = (v.co.z + 1.0) * 0.5  # 0=太い端, 1=先端
        f = 1.0 - taper * t
        local = Vector((v.co.x * r_side * f, v.co.y * r_across * f, v.co.z * r_along))
        v.co = Vector(center) + rot @ local
    bm.to_mesh(mesh)
    bm.free()
    C.activate(obj)
    bpy.ops.object.shade_smooth()
    return obj


def build_legs() -> list[bpy.types.Object]:
    """後脚。側面図の大腿は中心(y+0.012, z0.024)・半径≈0.020 の塊で、
    尻側が大きく膝(前下)へ収束する卵。背面図では腿は胴に密着(x中心0.030、
    横半径0.015)。足は外へ開いて床に着く。"""
    out = []
    for side in (-1.0, 1.0):
        thigh_c = (0.030 * side, +0.012, 0.026)
        knee_dir = (0.0, -0.030, -0.018)  # 尻上→膝前下
        thigh = _egg(f"{NAME}_thigh{side:+.0f}", thigh_c, knee_dir,
                     r_side=0.015, r_across=0.021, r_along=0.022, taper=0.35)
        out.append(thigh)
        knee = Vector((0.034 * side, -0.008, 0.014))
        ankle = Vector((0.043 * side, -0.008, 0.010))
        toes = Vector((0.054 * side, -0.013, 0.007))
        shin = C.curve_tube(f"{NAME}_shin{side:+.0f}", [Vector(thigh_c), knee, ankle, toes],
                            [0.012, 0.010, 0.008, 0.007])
        out.append(shin)
        pad = C.uv_sphere(f"{NAME}_foot{side:+.0f}", (0.052 * side, -0.012, 0.005),
                          0.010, segments=10, rings=7, scale=(1.5, 1.2, 0.5))
        out.append(pad)
    return out


def build_tail() -> bpy.types.Object:
    """尾。側面マスクを列ごとに実測した中心線と半径:
    腰の中(y+0.028)から太く始まり(r0.020) → 床を這いながら 0.018→0.012→0.010 と
    細くなり → y≈+0.09 で立ち上がり → 直径≈0.025 の小さな渦を前へ巻いて終わる。
    正面/背面図では尾は体の右側(-X)へ出ているので、渦へ向かって少し-Xへ振る。"""
    pts = [
        Vector((0.000, +0.028, 0.020)),   # 腰の中(骨盤ループに埋まる)
        Vector((0.000, +0.048, 0.021)),   # 尾の付け根(上面z0.039・床に接する)
        Vector((-0.004, +0.061, 0.018)),  # 床を這う
        Vector((-0.010, +0.073, 0.019)),
        Vector((-0.017, +0.082, 0.026)),  # 立ち上がり始める
        Vector((-0.024, +0.089, 0.040)),
        Vector((-0.029, +0.090, 0.052)),  # 渦の外側・頂点
        Vector((-0.032, +0.082, 0.062)),
        Vector((-0.033, +0.070, 0.060)),  # 渦の上を前へ
        Vector((-0.032, +0.063, 0.052)),  # 先端(下がって終わる)
    ]
    radii = [0.020, 0.018, 0.012, 0.010, 0.0085, 0.007, 0.006, 0.005, 0.004, 0.0025]
    return C.curve_tube(f"{NAME}_tail", pts, radii)


# 背びれ: 背骨線(y,z)。頭頂から項・背中・腰を通って尾の付け根の上面まで
FRILL_SPINE = [
    (-0.014, 0.1375), (0.000, 0.1385), (0.012, 0.135), (0.019, 0.124),
    (0.0215, 0.112), (0.0215, 0.100), (0.023, 0.088), (0.024, 0.076),
    (0.028, 0.068), (0.0325, 0.060), (0.038, 0.052), (0.041, 0.044),
    (0.046, 0.036), (0.050, 0.030),
]
# 波形の山: (背骨線に沿った弧長s, 半幅, 高さ)。側面マスクの実測:
# 頭頂の小さな突起 → 後頭部 → 項の最大の山(0.013) → 背中 → 腰へ 大→小
# 半幅は山の間隔(≈0.022)の半分より少し広くして裾が重なり、鋸歯ではなく
# 丸い花弁の連なりになるようにする
FRILL_LOBES = [
    (0.008, 0.009, 0.0035), (0.033, 0.010, 0.007), (0.056, 0.012, 0.012),
    (0.080, 0.012, 0.011), (0.101, 0.011, 0.009), (0.119, 0.010, 0.007),
    (0.134, 0.008, 0.005),
]
FRILL_BASE = 0.002       # 山と山の間にも残る膜の高さ(連続した1枚に見せる)
FRILL_INSET = 0.007      # 内側の縁を胴の中へ沈める量
FRILL_THICKNESS = 0.004
FRILL_SAMPLES = 36


def _frill_height(s: float) -> float:
    h = FRILL_BASE
    for s0, w, amp in FRILL_LOBES:
        u = (s - s0) / w
        if -1.0 < u < 1.0:
            h += amp * (0.5 + 0.5 * math.cos(math.pi * u))
    return h


def build_frill() -> bpy.types.Object:
    """背びれ。独立した球の列ではなく、背骨線に沿った1枚の低ポリstrip
    (内側の縁は胴に埋め、外側の縁が波打つ)にSolidifyで厚みを付け、
    Subdivisionで柔らかくする。"""
    # 背骨線を弧長でリサンプル
    pts = [Vector((0.0, y, z)) for y, z in FRILL_SPINE]
    seg_len = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    total = sum(seg_len)
    verts: list[tuple[float, float, float]] = []
    for k in range(FRILL_SAMPLES + 1):
        s = total * k / FRILL_SAMPLES
        # sの位置と接線を求める
        acc, i = 0.0, 0
        while i < len(seg_len) - 1 and acc + seg_len[i] < s:
            acc += seg_len[i]
            i += 1
        t = (s - acc) / seg_len[i] if seg_len[i] > 0 else 0.0
        p = pts[i].lerp(pts[i + 1], t)
        tangent = (pts[i + 1] - pts[i]).normalized()
        normal = Vector((0.0, -tangent.z, tangent.y))  # 体の外側(頭頂では上、背中では後ろ)
        inner = p - normal * FRILL_INSET
        outer = p + normal * _frill_height(s)
        verts.append(tuple(inner))
        verts.append(tuple(outer))
    faces = [(2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1) for k in range(FRILL_SAMPLES)]
    mesh = bpy.data.meshes.new(f"{NAME}_frill")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"{NAME}_frill", mesh)
    bpy.context.collection.objects.link(obj)
    solid = obj.modifiers.new("solid", "SOLIDIFY")
    solid.thickness = FRILL_THICKNESS
    solid.offset = 0.0
    solid.use_even_offset = True
    _apply_modifier(obj, solid)
    _subdivide(obj, 2)
    return obj


def build_v3_blockout() -> dict:
    """ブロックアウト一式を作って返す。
    返り値: {"cage": ローポリケージ, "body": 丸めた胴+頭, "extras": [四肢・尾・背びれ]}
    """
    cage, body = build_body_cage()
    extras = build_arms() + build_legs() + [build_tail(), build_frill()]
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for obj in [body] + extras:
        C.assign_material(obj, clay)
    C.assign_material(cage, clay)
    return {"cage": cage, "body": body, "extras": extras}
