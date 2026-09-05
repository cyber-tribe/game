"""
あくびとかげ v3 ―― ベースケージ+Subdivision方式のブロックアウト。

v2(#1064〜#1068)の「断面ロフト+curve_tube+sculpt_merge/voxel remesh」は、
首・脇・顎下・腹と腿の境界といった**負の空間をvoxel融合が埋めてしまう**
方式だった。谷を深くしても融合で消え、また深くする、を4回繰り返しても
設定画とのA/B比較で大きな前進が無かったため、造形方式そのものを
切り替える(plan/models/akubitokage-remake.md 追記参照)。

方針:
- 頭・首・胸・腹・腰は、意味のあるエッジループ(頭頂/眉弓/目/頬・口吻/
  顎/首/肩/胸/腹/腰・尾根元)を持つ**手作りのローポリケージ**を
  `C.section_loft`で組み、Subdivisionで仕上げる。voxel remeshは使わない
  (Subdivisionはケージの谷をそのまま保つ)。
- 各ループは楕円ではなく、前/後/横の半径を別々に持つ断面にする
  (腹は前へ張る卵形、頬は横へ張る、口吻は前へ伸びる、首は小さく後ろへ)。
- 前脚・後脚・尾・背びれは**別メッシュ**のまま置く。設定画との
  Clay A/Bで「部位として読める」ことを確認するまで胴へ融合しない。
- 設定画は完全に整合した三面図とは仮定しない(view authority):
  正面=顔・腕・腹・足、側面=姿勢・頭〜背中〜尾のライン・大腿、
  背面=背びれ・腰・大腿・尾根元 を優先する。
- v2の実測リング(monsters.AKUBI_TORSO_RINGS)は寸法の目安として参照
  するが、そのまま繋がない。

本番の`monsters.MONSTERS`には登録しない(ゲーム本体・CIには影響しない)。
承認後に本組み・アーマチュア・テクスチャを載せる。
"""

from __future__ import annotations

import math

import bpy
import common as C
from mathutils import Vector

NAME = "akubitokage_v3"

# 単色Clay用の材質色(レビュー時はテクスチャ・煙・腹色・鱗を一切使わない)
CLAY = (0.62, 0.58, 0.55)

# 1ループあたりの頂点数。ケージなので少なく保つ(Subdivisionで丸める)
LOOP_N = 12

# ---------------------------------------------------------------- 胴+頭のケージ
# (z, cy, r_front, r_back, r_side, name)
#   cy      : ループ中心の前後位置(-Yが正面。負=前)
#   r_front : 中心から前(-Y)方向への半径
#   r_back  : 中心から後ろ(+Y)方向への半径
#   r_side  : 中心から横(±X)方向への半径
# z昇順。名前はエッジループの意味(レビュー・調整の手がかり)
BODY_LOOPS = [
    (0.016, +0.012, 0.030, 0.038, 0.038, "tail_root"),   # 腰・尾の付け根(後ろへ広い)
    # 正面図を優先: 設定画の腹は腕の間に収まる大きな丸(頭幅に近い)。
    # 第2版は正面で胴が細い筒に見えたので、腹の横幅を広げる
    (0.030, +0.004, 0.049, 0.040, 0.046, "belly_low"),   # 腹の下端(前へ大きく張る)
    (0.046, -0.002, 0.050, 0.034, 0.044, "belly"),       # 腹の最大点
    (0.061, -0.004, 0.038, 0.028, 0.036, "belly_high"),  # 腹→胸へ収束
    (0.075, -0.004, 0.030, 0.026, 0.028, "chest"),       # 胸(腹より後退=S字)
    (0.087, -0.002, 0.026, 0.026, 0.031, "shoulder"),    # 肩(腕の付け根、横へ少し張る)
    # 首: view authorityを分ける。側面は喉のアンダーカット(前後の半径を
    # 小さく・後ろへ)が正しいが、正面図では首はほとんど見えず頭が肩に
    # 直接乗る。第2版は横幅まで細くして「鉛筆の首に乗った球根」に見えた
    # ので、横幅(r_side)だけ肩に近づける
    (0.096, +0.004, 0.017, 0.020, 0.028, "neck"),        # 首(前後は絞り、横は残す)
    # 頭: 正面図は「縦長の卵」ではなく、頬で最も広く天井が低めの丸い台形。
    # 第1版は頬だけ広くて円盤(UFO)、第2版は逆に縦長すぎた。顎・眉弓・
    # 頭頂の横幅を頬に近づけて広く低い丸にする。
    # 口吻: 第2版は頬ループの前方半径が大きく「くちばし」に見えた。口吻は
    # 短く鈍くし、眉弓の前方半径を小さくして「頭蓋と口吻の段差」を作る
    (0.104, -0.010, 0.038, 0.026, 0.038, "jaw"),         # 顎・口吻の下段(首の上へ前に被さる)
    (0.114, -0.014, 0.042, 0.030, 0.043, "cheek_snout"), # 頬(横へ最大)+口吻(前へ最大、鈍く)
    (0.124, -0.010, 0.033, 0.029, 0.040, "brow_eye"),    # 眉弓・目(前は口吻より一段引く)
    (0.133, -0.005, 0.026, 0.024, 0.034, "crown"),       # 頭頂へ収束(広く低く)
    (0.139, -0.003, 0.010, 0.010, 0.012, "top"),         # 頭頂(閉じる直前)
]

# 首から上を後ろへ倒す角度(度)。負で鼻先が上がる。設定画の側面は
# 眠そうに顎を上げ、喉を見せる姿勢なので、頭全体を少し上向きにする
HEAD_PITCH_DEG = -9.0  # -14だと口吻が上を向く「くちばし」に見えたので弱める
HEAD_FROM = "jaw"  # このループ以降を首ループの中心を支点に回す


def _profile(z: float, cy: float, r_front: float, r_back: float, r_side: float,
             n: int = LOOP_N, cx: float = 0.0) -> list[tuple[float, float, float]]:
    """前/後/横で半径の違う閉じた断面ループ。
    象限ごとに楕円を繋ぐので、卵形(腹・口吻)や横張り(頬)を1ループで表せる。"""
    pts = []
    for i in range(n):
        a = i * math.tau / n
        c, s = math.cos(a), math.sin(a)
        # y方向の半径は前(s<0)と後ろ(s>0)で切り替える
        ry = r_front if s < 0 else r_back
        pts.append((cx + r_side * c, cy + ry * s, z))
    return pts


def _subdivide(obj: bpy.types.Object, levels: int) -> bpy.types.Object:
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = levels
    sub.render_levels = levels
    C.activate(obj)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    bpy.ops.object.shade_smooth()
    return obj


def _copy_object(src: bpy.types.Object, name: str) -> bpy.types.Object:
    dup = src.copy()
    dup.data = src.data.copy()
    dup.name = name
    bpy.context.collection.objects.link(dup)
    return dup


def _pitch_head(sections: list[list[tuple[float, float, float]]]) -> None:
    """首ループの中心を支点に、HEAD_FROM以降のループをX軸まわりに回して
    頭を上向き(負)/下向き(正)にする。断面の形は変えず姿勢だけ付ける。"""
    names = [row[5] for row in BODY_LOOPS]
    neck_i = names.index("neck")
    start = names.index(HEAD_FROM)
    _z, cy, *_ = BODY_LOOPS[neck_i]
    pivot_y, pivot_z = cy, BODY_LOOPS[neck_i][0]
    th = math.radians(HEAD_PITCH_DEG)
    c, s = math.cos(th), math.sin(th)
    for i in range(start, len(sections)):
        rotated = []
        for x, y, z in sections[i]:
            dy, dz = y - pivot_y, z - pivot_z
            rotated.append((x, pivot_y + dy * c - dz * s, pivot_z + dy * s + dz * c))
        sections[i] = rotated


def build_body_cage() -> tuple[bpy.types.Object, bpy.types.Object]:
    """胴+頭のケージ(ローポリ)と、それをSubdivisionで丸めた本体を返す。"""
    sections = [_profile(z, cy, rf, rb, rs) for (z, cy, rf, rb, rs, _n) in BODY_LOOPS]
    _pitch_head(sections)
    cage = C.section_loft(f"{NAME}_cage", sections, smooth=False,
                          cap_top=True, cap_bottom=True)
    body = _copy_object(cage, f"{NAME}_body")
    _subdivide(body, 2)
    return cage, body


# ------------------------------------------------------------------- 四肢・尾
# 別メッシュ。胴へは融合しない(ブロックアウト段階)。
# 正面図を優先: 腕は肩→上腕→肘→前腕→手として独立して読める太さ・角度に、
# 後脚は側面図の「大きな丸い腿」を1個の塊として出す。

def build_arms() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        # 腕は胴から離して独立させるが、離しすぎると設定画の「腹の脇で
        # 地面に手をつく」短い腕ではなく、外へ垂れ下がる長い管に見える。
        # 肘をわずかに体へ寄せ、肩を少し下げて短くする(胴との谷は残す)
        shoulder = Vector((0.031 * side, -0.010, 0.083))
        elbow = Vector((0.037 * side, -0.030, 0.053))
        wrist = Vector((0.035 * side, -0.047, 0.020))
        hand = Vector((0.033 * side, -0.055, 0.010))
        arm = C.curve_tube(f"{NAME}_arm{side:+.0f}", [shoulder, elbow, wrist, hand],
                           [0.016, 0.012, 0.009, 0.010])
        out.append(arm)
        # 手先(肉球ではなく低く前へ伸びる手)
        pad = C.uv_sphere(f"{NAME}_hand{side:+.0f}", tuple(hand + Vector((0, -0.004, 0))),
                          0.011, segments=10, rings=7, scale=(1.0, 1.5, 0.45))
        out.append(pad)
    return out


def build_legs() -> list[bpy.types.Object]:
    out = []
    for side in (-1.0, 1.0):
        # 大腿: 側面図の強い造形記号。独立した丸い塊として置く。
        # ただし背面図では腿は体に密着している(離しすぎると「体の脇に
        # 浮いた2つの球」になった)ので、少し内側へ寄せる
        thigh_c = Vector((0.036 * side, +0.010, 0.037))
        thigh = C.uv_sphere(f"{NAME}_thigh{side:+.0f}", tuple(thigh_c), 0.025,
                            segments=14, rings=10, scale=(0.85, 1.15, 0.95))
        out.append(thigh)
        knee = Vector((0.047 * side, -0.012, 0.024))
        foot = Vector((0.041 * side, -0.032, 0.010))
        shin = C.curve_tube(f"{NAME}_shin{side:+.0f}", [thigh_c, knee, foot],
                            [0.014, 0.011, 0.010])
        out.append(shin)
        pad = C.uv_sphere(f"{NAME}_foot{side:+.0f}", tuple(foot + Vector((0, -0.004, 0))),
                          0.012, segments=10, rings=7, scale=(1.0, 1.5, 0.45))
        out.append(pad)
    return out


def build_tail() -> bpy.types.Object:
    # 側面図を優先: 非常に太い根元 → 地面を這う太い尾 → 上へ持ち上がる →
    # 急に細くなる → 小さく巻く(渦の穴は小さく)
    # 根元〜地面を這う区間は、管の中心を半径ぶん持ち上げて底が床(z=0)に
    # 接するようにする(第2版は中心z=0.020に半径0.031で7mm床に沈んでいた)
    pts = [
        Vector((0.000, 0.036, 0.032)),
        Vector((0.004, 0.070, 0.028)),
        Vector((0.010, 0.098, 0.022)),
        Vector((0.016, 0.113, 0.028)),
        Vector((0.016, 0.107, 0.045)),
        Vector((0.012, 0.093, 0.049)),
        Vector((0.010, 0.087, 0.039)),
    ]
    radii = [0.031, 0.027, 0.021, 0.013, 0.009, 0.006, 0.004]
    return C.curve_tube(f"{NAME}_tail", pts, radii)


def build_frill() -> list[bpy.types.Object]:
    # 背面・側面を優先: 頭の後ろから尾根元まで 大→中→小 の柔らかいヒレ。
    # 硬い棘にはしないが、側面シルエットにはっきり出る大きさにする
    keys = [
        (0.021, 0.129, 0.0095), (0.027, 0.115, 0.0125), (0.029, 0.101, 0.0135),
        (0.029, 0.087, 0.0125), (0.031, 0.071, 0.0110), (0.036, 0.053, 0.0095),
        (0.041, 0.035, 0.0075),
    ]
    out = []
    for i, (y, z, r) in enumerate(keys):
        fin = C.uv_sphere(f"{NAME}_fin{i}", (0.0, y, z), r,
                          segments=10, rings=7, scale=(0.36, 1.0, 1.15))
        out.append(fin)
    return out


def build_v3_blockout() -> dict:
    """ブロックアウト一式を作って返す。
    返り値: {"cage": ローポリケージ, "body": 丸めた胴+頭, "extras": [四肢・尾・背びれ]}
    """
    cage, body = build_body_cage()
    extras = build_arms() + build_legs() + [build_tail()] + build_frill()
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for obj in [body] + extras:
        C.assign_material(obj, clay)
    C.assign_material(cage, clay)
    return {"cage": cage, "body": body, "extras": extras}
