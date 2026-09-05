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

第3回レビュー(第2版への指摘)で決めたこと:
- 頭が大きすぎて二頭身に見える → 頭を縦に圧縮(0.057→0.050)し、胴の
  z を 1.107 倍に延ばす(実測zからの意図的な逸脱。BODY_LOOPS の z は
  再配分後の値)。頭幅はほぼ据え置き。
- 正面の下半身が軽い → 胴は太くせず、腕と腿を太くして外側の質量を作る。
- まだ直立している → 骨盤を後ろ(+0.056)へ、腹前面(-0.039)を胸(-0.030)
  より前へ出し、胴の軸を「尻を預けて腹から胸が立ち上がる」傾きにする。
- 口吻がまだ嘴状 → 鼻先の前方突出を 3.5mm 減らし、平面視の絞り(snout)を
  強め、下顎を少し前へ出す。
- 尾が早く持ち上がる → y≈+0.09 まで床を這わせてから立ち上がり、巻く。
- 手足は「ヘラ」ではなく掌+3本の短い指の方向が分かる形にしておく
  (後で指を足すと手首との比率を再調整することになるため)。

第4回レビュー(第3版への指摘)で決めたこと ―― v3最終プロポーションパス:
- 頭が「キノコ型」(大きな球→急なくびれ→細い胴) → 胸上部・肩ループを横へ
  広げ(0.031/0.029→0.035/0.036)、喉の前後を厚くして、頭→胸を浅く短い
  谷で接続する。首を太くするのではなく胸の上端を頭に近づける。
- 頭が丸すぎる → 最大幅を顎〜口の高さ(z0.094〜0.101)に置き、目の高さは
  広いまま、頭頂へ向かって前版より強く絞る(頬が左右下方へ張る断面)。
- 腕がまだ長い(ゴリラ的) → 肩→外下→内下→手 の弧を強め、手を体の下へ
  抱き込ませる。太さも上げる。
- 背びれが弱い → 後頭部側の2〜3山を大きく(最大0.017)、腰へ向かって小さく。
  均等なノコギリには戻さない。
- 尾先がJ字 → 最後の制御点で直径≈0.02の小さな円を一周弱巻く。
- 腿は承認。正面の張りだけ x を 2mm 外へ。

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
    # 尻: 床に体重を預ける。骨盤(z≈0.031)が最も後ろ(+0.056)へ張る
    (0.0055, +0.014, 0.022, 0.022, 0.017, 0.0, "seat"),       # 接地面(ほぼ床)
    (0.013, +0.012, 0.032, 0.036, 0.025, 0.0, "rump_low"),
    (0.022, +0.010, 0.040, 0.044, 0.029, 0.0, "rump"),
    (0.031, +0.009, 0.045, 0.047, 0.031, 0.0, "pelvis"),      # 後縁+0.056: 骨盤が後ろ
    # 腹: 前面(-0.039)は胸(-0.030)より前へ出る。背中は腰へ向かって後ろへ逃げる。
    # 正面幅は据え置き(胴を太くしない。下半身の質量は腕と腿で作る)
    (0.040, +0.007, 0.046, 0.043, 0.033, 0.0, "belly_low"),
    (0.049, +0.005, 0.044, 0.039, 0.034, 0.0, "belly"),       # 腹の最前
    (0.0575, +0.003, 0.040, 0.036, 0.034, 0.0, "belly_high"),
    (0.066, +0.000, 0.034, 0.033, 0.033, 0.0, "ribs"),
    # 胸: 腹から立ち上がる。背中は垂直
    # 胸上部は横へ広げ、頭との谷を浅く短くする(キノコ型の回避)
    (0.077, -0.001, 0.029, 0.029, 0.035, 0.0, "chest"),
    (0.084, -0.004, 0.028, 0.027, 0.036, 0.0, "shoulder"),    # 正面の浅いくびれ
    # 喉〜顎: 「首」は無い。顎下に厚みを持たせ、頬の最大幅へ短く繋ぐ。
    # 正面は下ぶくれ: 最大幅は顎〜口の高さにあり、上へ絞る
    (0.089, -0.009, 0.035, 0.031, 0.039, 0.15, "throat"),
    (0.0944, -0.012, 0.039, 0.036, 0.0425, 0.30, "jaw"),      # 顎下。頬の最大幅
    (0.1015, -0.0155, 0.037, 0.0375, 0.0425, 0.40, "mouth"),  # 口の高さ。後縁+0.022=項の谷
    (0.1085, -0.015, 0.039, 0.041, 0.039, 0.48, "cheek"),
    (0.1156, -0.0145, 0.041, 0.0455, 0.036, 0.52, "snout_eye"),  # 鼻先(-0.0555)。後頭部最後(+0.031)
    # 頭頂へ: 正面幅は急に絞る(頬張り形)、側面の奥行きは平らに残る
    (0.1226, -0.020, 0.035, 0.038, 0.030, 0.50, "brow"),
    (0.1296, -0.016, 0.030, 0.032, 0.023, 0.35, "forehead"),
    (0.1349, -0.0115, 0.025, 0.0255, 0.014, 0.20, "crown"),
    (0.138, -0.010, 0.014, 0.014, 0.006, 0.10, "top"),
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

def _digits(prefix: str, origin, forward, spread_axis, n: int = 3,
            length: float = 0.010, radius: float = 0.0035,
            spread_deg: float = 22.0) -> list[bpy.types.Object]:
    """掌から前へ出る短い指の方向だけを示す(ブロックアウト用)。
    forward=指の向き、spread_axis=指を扇状に開く回転軸。"""
    out = []
    fwd = Vector(forward).normalized()
    axis = Vector(spread_axis).normalized()
    for i in range(n):
        ang = math.radians((i - (n - 1) / 2) * spread_deg)
        d = fwd.copy()
        d.rotate(Quaternion(axis, ang))
        c = Vector(origin) + d * (length * 0.55)
        rot = Vector((0, 1, 0)).rotation_difference(d)
        mesh = bpy.data.meshes.new(f"{prefix}_digit{i}")
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.collection.objects.link(obj)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=1.0)
        for v in bm.verts:
            local = Vector((v.co.x * radius, v.co.y * length * 0.55, v.co.z * radius * 0.8))
            v.co = c + rot @ local
        bm.to_mesh(mesh)
        bm.free()
        C.activate(obj)
        bpy.ops.object.shade_smooth()
        out.append(obj)
    return out


def build_arms() -> list[bpy.types.Object]:
    """前脚。正面図の弧: 肩は胴の近く(x0.025) → 肘が外(x0.039) → 手が内(x0.024)。
    肩 z0.062 から手 z0.008 までの短く太い腕(半径0.014→0.0095)。
    側面では前縁が胸の面(-0.030)より少し前に出る程度に留める。"""
    out = []
    for side in (-1.0, 1.0):
        pts = [
            # 肩は胴の中・首のくびれより下から出す。高く太いと正面で顎の
            # 真下に肩が並び、くびれが隠れる
            # 肩→外下→内下→手 の弧を強め、体に抱きつくように短く見せる
            Vector((0.026 * side, -0.012, 0.060)),  # 肩(胴の側面に埋まる)
            Vector((0.037 * side, -0.022, 0.050)),  # 上腕(外下へ)
            Vector((0.040 * side, -0.028, 0.038)),  # 肘(最も外)
            Vector((0.032 * side, -0.038, 0.024)),  # 前腕(内下へ)
            Vector((0.022 * side, -0.045, 0.013)),  # 手首
            Vector((0.018 * side, -0.048, 0.009)),  # 手(体の下へ寄せる)
        ]
        arm = C.curve_tube(f"{NAME}_arm{side:+.0f}", pts,
                           [0.0145, 0.014, 0.013, 0.0115, 0.0105, 0.010])
        out.append(arm)
        # 掌: 床に「ぺたっ」と置く
        palm = (0.018 * side, -0.050, 0.006)
        out.append(C.uv_sphere(f"{NAME}_hand{side:+.0f}", palm, 0.011,
                               segments=10, rings=7, scale=(1.1, 1.1, 0.55)))
        # 指3本: 前へ、少し外へ開く
        out += _digits(f"{NAME}_hand{side:+.0f}", (0.018 * side, -0.057, 0.005),
                       forward=(0.10 * side, -1.0, 0.0), spread_axis=(0, 0, 1))
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
    """後脚。腿は身体の主要ボリュームの一つ: 腰側が大きく膝(前下)へ細くなる卵
    (横半径0.018・上下半径0.027・軸長0.030)。背面図では胴に密着(x中心0.032)。
    足は外へ開いて床に着き、指3本が外前へ向く。"""
    out = []
    for side in (-1.0, 1.0):
        thigh_c = (0.034 * side, +0.014, 0.030)
        knee_dir = (0.0, -0.034, -0.014)  # 尻上→膝前下(やや水平寄り)
        thigh = _egg(f"{NAME}_thigh{side:+.0f}", thigh_c, knee_dir,
                     r_side=0.018, r_across=0.027, r_along=0.030, taper=0.40)
        out.append(thigh)
        knee = Vector((0.036 * side, -0.011, 0.015))
        ankle = Vector((0.046 * side, -0.011, 0.011))
        toes = Vector((0.055 * side, -0.016, 0.0095))
        shin = C.curve_tube(f"{NAME}_shin{side:+.0f}", [Vector(thigh_c), knee, ankle, toes],
                            [0.015, 0.013, 0.010, 0.009])
        out.append(shin)
        sole = (0.054 * side, -0.016, 0.006)
        out.append(C.uv_sphere(f"{NAME}_foot{side:+.0f}", sole, 0.011,
                               segments=10, rings=7, scale=(1.2, 1.1, 0.55)))
        out += _digits(f"{NAME}_foot{side:+.0f}", (0.058 * side, -0.022, 0.005),
                       forward=(0.55 * side, -1.0, 0.0), spread_axis=(0, 0, 1))
    return out


def build_tail() -> bpy.types.Object:
    """尾。側面マスクの列ごとの実測を基に、根元(r0.020)から滑らかにテーパー。
    y≈+0.09 まで床を這わせてから立ち上がり、直径≈0.025 の小さな渦を前へ
    巻いて終わる(第2版は +0.08 で持ち上がり始めて早すぎた)。
    正面/背面図では尾は体の右側(-X)へ出ているので、渦へ向かって少し-Xへ振る。"""
    pts = [
        Vector((0.000, +0.034, 0.020)),   # 腰の中(骨盤ループに埋まる)
        Vector((0.000, +0.052, 0.020)),   # 尾の付け根(床に接する)
        Vector((-0.003, +0.068, 0.016)),  # 床を這う
        Vector((-0.008, +0.083, 0.013)),
        Vector((-0.014, +0.095, 0.014)),  # 這う区間の終わり
        Vector((-0.020, +0.105, 0.023)),  # 立ち上がり
        Vector((-0.025, +0.109, 0.036)),
        # 渦: 中心(y+0.096, z0.046)・半径0.010 の小さな円を一周弱、前→下→内へ
        Vector((-0.028, +0.1058, 0.048)),
        Vector((-0.030, +0.1037, 0.0524)),
        Vector((-0.032, +0.096, 0.056)),  # 渦の頂点
        Vector((-0.033, +0.0873, 0.051)),
        Vector((-0.033, +0.0866, 0.0426)),
        Vector((-0.032, +0.0926, 0.0366)),
        Vector((-0.031, +0.0975, 0.0362)),  # 先端(内側で終わる)
    ]
    radii = [0.020, 0.017, 0.013, 0.010, 0.0085, 0.007, 0.006, 0.0052, 0.0045,
             0.0038, 0.0032, 0.0027, 0.0022, 0.0018]
    return C.curve_tube(f"{NAME}_tail", pts, radii)


# 背びれ: 背骨線(y,z)。頭頂から項・背中・腰を通って尾の付け根の上面まで
FRILL_SPINE = [
    (-0.014, 0.138), (0.000, 0.139), (0.012, 0.1355), (0.019, 0.125),
    (0.0215, 0.114), (0.0215, 0.103), (0.023, 0.093), (0.024, 0.083),
    (0.028, 0.075), (0.033, 0.066), (0.039, 0.0575), (0.044, 0.049),
    (0.050, 0.040), (0.056, 0.031), (0.058, 0.026),
]
# 波形の山: (背骨線に沿った弧長s, 半幅, 高さ)。側面マスクの実測:
# 頭頂の小さな突起 → 後頭部 → 項の最大の山(0.013) → 背中 → 腰へ 大→小
# 半幅は山の間隔(≈0.022)の半分より少し広くして裾が重なり、鋸歯ではなく
# 丸い花弁の連なりになるようにする
# 後頭部〜項の2〜3山を大きく(側面シルエットを作る)、腰へ向かって小さく
FRILL_LOBES = [
    (0.008, 0.009, 0.004), (0.034, 0.012, 0.011), (0.058, 0.014, 0.017),
    (0.082, 0.013, 0.014), (0.104, 0.012, 0.011), (0.124, 0.011, 0.008),
    (0.142, 0.009, 0.0055),
]
FRILL_BASE = 0.002       # 山と山の間にも残る膜の高さ(連続した1枚に見せる)
FRILL_INSET = 0.007      # 内側の縁を胴の中へ沈める量
FRILL_THICKNESS = 0.005
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
