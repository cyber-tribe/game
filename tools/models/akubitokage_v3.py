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

第5回レビュー(第4版への指摘)で決めたこと ―― テーマ「脱力して潰れた重心」:
部品は揃ったが、全身が設定画より「細長く・姿勢が良い」。局所修正ではなく
全身ジェスチャーを一括で変え、四肢・尾・背びれを追従させる。
- 胴を縦に圧縮(z×0.92)。前版の「胴を長く」は逆だった。
- 頭を身体へ沈める(頭ループ z−0.010)。首半径を増やすのではなく、顎下と
  胸上端が近接し、頬・顎・喉・肩が重なって首が見えない構成にする。
  肩ループを「襟(collar)」として横に広げ、胸→襟→喉→顎が連続して広がる。
- 腹の最前点を低く(z≈0.04, −0.042)し、胸(−0.028)を後退させて
  「腹がだらっと前下へ垂れる」線にする。
- 腕の付け根を上げて頬が腕の上に乗る。上腕・前腕を短く、肘を外へ、手を
  外側に置き、腕を主役にしない。
- 掌を小さくし、指3本を独立させる(水かきに見せない)。
- 腿は上側を胴へ食い込ませ、前下方へテーパー(球を貼った感じを消す)。
- 尾は根元〜1/3を太く(r0.024→)し、滑らかにテーパー。巻き方は維持。
- 背びれは 1.5〜2倍(最大0.024)。大・大・中・中・小のリズム。
- 全高は圧縮後 ≈0.128(背びれ除く)。必要なら本組み時に一様スケールで戻す。

第6回レビュー(第5版への指摘)で決めたこと ―― Face Gate:
全身ブロックアウトは 7.5/10 まで来たので**仮ロック**(BODY_LOOPS の胴の
数値・四肢・尾・背びれは触らない)。顔前面は 4/10 で「頭部の外形」しか
無く、正面ではのっぺらぼう。ここが最大のボトルネック。
- 頭部ケージは緯度経度グリッドで、リング単位の移動は「顔を作る」ではなく
  「頭全体を歪ませる」。顔だけトポロジーを一段進める:
  * ループの頂点を前半分に集中(前180°に FRONT_N=12、後ろ180°に BACK_N=8)
    して顔面の解像度を上げる(胴も同じ点数になるが影響は無い)。
  * 口線の高さに「lip」ループを追加(上顎/下顎を分ける)。
  * 眼窩・眉・頬・口吻・口線・下顎を FACE_FEATURES として、ケージ頂点の
    **領域ごとに独立して押し引き**する(Subdivision 前に刻むので谷が残る)。
    球面へ顔を描くのではなく、額→眉→眼窩→頬→口吻→顎の前後差を作る。
- 合否は「テクスチャを一切描かずに Clay で眠そうな顔に読めるか」。
  5点: 眼窩がある / 頬が頭幅ではなく独立した張り / 短い口吻が正面で中央
  ボリュームとして読める / 上下顎が分かる / 額→目→頬→口吻→顎に前後差。
- レビューは全身ではなく顔だけを大きく: 設定画/Clay/Wire × 正面・側面 +
  Clay/Wire 45°(scratchpad の face_gate.py / face_sheet.py)。

第7回レビュー(Face Gate 第2版への指摘)で決めたこと ―― 口吻+上下顎:
眼窩○・頬△+・口吻△・上下顎×。顔の下半分が「横に長い一本の膨らみ」で、
側面では額→鼻先→口が一つの砲弾状。下顎が無い。
- 失敗した試み(第3版): 口吻と下顎を Y軸方向のロフト(レンズ状の別体)で
  作ったら「アヒルのくちばし」になり、開口すると下顎が胸に入って消えた。
  幅広で薄い別体を顔に貼ると必ずくちばしになる。
- 採用: **下顎は頭ケージの下側スライスそのもの**。頭と同じ断面関数・同じ
  頬の彫りで、蝶番 JAW_BACK より前だけを切り出した別メッシュ(build_jaw)。
  閉口時は頭の下顔面と同じシルエットで、口線の溝だけが見える。
- 口は「上唇(mouth ループ)と下顎ピースの上面の間で、頭ケージの面を 5mm
  引っ込めた溝」。テクスチャ無しでも口の位置が読める。
- 上顎の口吻は Face Gate 第2版の台地スラブ(FACE_FEATURES の muzzle)。
- 眼窩は楕円の穴ではなく「上に厚い眉/まぶた面、その下だけ浅く引っ込み、
  下側は頬へつながる」。頬は横ではなく前下方へ(角度 ±74°→±62°)。
- あくび: 頭を身体に沈めた姿勢では、下顎だけを開くと ≈20° で顎先が腹に
  当たる(計算値)。それ以上の開口は頭を後ろへ倒す動き(設定画のあくび姿勢)
  と組み合わせる前提。レビューでは 20° 開口を出す。

第8回レビュー(Face Gate 第3版への指摘)で決めたこと ―― 口吻+顎の続き:
上下顎の分離は○-。ただし閉口正面が「一本の水平スリット」で頭/胴の境界線に
見える。下顎は板。口吻は「顔全体が出ている」だけで中央マズルが無い。
眼窩が再び曖昧。
- 口線は水平にしない。中央 −2mm・口角 +2.5mm の緩い曲線(MOUTH_CURVE)を、
  頭側の溝(mouth_groove)と下顎ピースの上端の両方に同じ式で与える。
- 下顎は厚い舟形: 顎先を前へ、下面を丸く、下側のループは側方で細い蹄鉄形。
- 口吻は2段: 鼻孔間の幅しかない狭く短い中央マズル(muzzle_top)と、その下の
  やや広い上唇(upper_lip)。頬とは別の奥行き。
- 眉弓(前)→眼裂(奥)→頬(前下、目の下〜口角外側)の浅いS字断面を 45° で読める
  強さに戻す。
- あくびは機構確認の 30° に加え、頭を倒さずに開ける限界角(jaw_clearance_deg)
  の側面も出す。60〜80° の大あくびは頭を後ろへ倒す動きと組み合わせる前提。

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

# 1ループあたりの頂点配置。顔面の解像度を上げるため、前半分(顔側)に
# FRONT_N 点、後ろ半分に BACK_N 点を置く(両端 0°/180° は共有)。
# 角度 a は _profile と同じ規約: sin(a)<0 が前(-Y)。前の中心は 270°
FRONT_N = 12
BACK_N = 8
LOOP_ANGLES = ([math.radians(180 + 180 * i / FRONT_N) for i in range(FRONT_N)]
               + [math.radians(180 * j / BACK_N) for j in range(BACK_N)])
LOOP_N = len(LOOP_ANGLES)
# Subdivisionはケージを内側へ縮める(20角形で約2.5%)。実測半径をそのまま置くと
# 全体が一回り細くなるので、半径にだけ掛けて補正する(中心位置は変えない)
RADIUS_COMP = 1.025

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
    # 尻: 床に体重を預ける。骨盤(z≈0.0285)が最も後ろ(+0.056)へ張る
    (0.005, +0.014, 0.024, 0.022, 0.017, 0.0, "seat"),        # 接地面(ほぼ床)
    (0.012, +0.012, 0.037, 0.036, 0.026, 0.0, "rump_low"),
    (0.020, +0.010, 0.044, 0.044, 0.030, 0.0, "rump"),
    (0.0285, +0.009, 0.047, 0.047, 0.032, 0.0, "pelvis"),     # 後縁+0.056: 骨盤が後ろ
    # 腹: 最前点(-0.042)は低い位置(z≈0.037〜0.045)。上へ行くほど後退して
    # 胸(-0.028)へ。「腹がだらっと前下へ垂れる」線。正面幅は据え置き
    (0.037, +0.007, 0.049, 0.043, 0.034, 0.0, "belly_low"),   # 腹の最前
    (0.045, +0.005, 0.046, 0.039, 0.035, 0.0, "belly"),
    (0.053, +0.003, 0.041, 0.036, 0.034, 0.0, "belly_high"),
    (0.061, +0.000, 0.033, 0.033, 0.033, 0.0, "ribs"),
    # 胸: 後退して肩を落とす。襟(collar)で横に広がり、頭が沈む土台になる
    (0.070, -0.001, 0.027, 0.029, 0.035, 0.0, "chest"),
    (0.076, -0.005, 0.030, 0.029, 0.037, 0.05, "collar"),     # 胸上端。顎下が乗る
    # 喉〜顎: 首は見えない。胸→襟→喉→顎と幅が連続して広がる
    (0.080, -0.010, 0.035, 0.031, 0.040, 0.15, "throat"),
    # 顎〜口: 基礎の横幅は 0.040 に落とし、頬の張り(+0.005)は FACE_FEATURES で
    # 独立した凸として足す(「頭を洋梨形にした」ではなく「頬を作る」)
    # 前面(r_front)は「眼窩の平面」。口吻の前後差は FACE_FEATURES の muzzle で
    # 足すので、基礎ループでは鼻先を作らない
    # 下顔面: jaw ループの前面は 5mm 引っ込めて口の溝(奥)にする。その前を
    # 下顎ピース(build_jaw)が覆う。mouth ループが上唇。口吻の前後差は
    # FACE_FEATURES の muzzle で足す
    (0.0844, -0.012, 0.037, 0.036, 0.040, 0.30, "jaw"),       # 下顎の高さ(前面は下顎ピースが覆う)
    (0.0915, -0.0155, 0.034, 0.0375, 0.040, 0.40, "mouth"),   # 上唇。後縁+0.022=項の谷
    (0.0985, -0.015, 0.035, 0.041, 0.039, 0.48, "cheek"),
    (0.1056, -0.0145, 0.037, 0.0455, 0.036, 0.52, "snout_eye"),  # 目の高さ。後頭部最後(+0.031)
    # 頭頂へ: 正面幅は急に絞る(頬張り形)、側面の奥行きは平らに残る
    (0.1126, -0.020, 0.034, 0.038, 0.030, 0.50, "brow"),
    (0.1196, -0.016, 0.030, 0.032, 0.023, 0.35, "forehead"),
    (0.1249, -0.0115, 0.025, 0.0255, 0.014, 0.20, "crown"),
    (0.128, -0.010, 0.014, 0.014, 0.006, 0.10, "top"),
]


def _profile(z: float, cy: float, r_front: float, r_back: float, r_side: float,
             snout: float = 0.0, cx: float = 0.0
             ) -> list[tuple[float, float, float]]:
    """前/後/横で半径の違う閉じた断面ループ(頂点角は LOOP_ANGLES)。
    象限ごとに楕円を繋ぐので、卵形(腹・口吻)や横張り(頬)を1ループで表せる。
    snout>0 で前半分の横幅を前へ行くほど絞り、平面視を卵形にする。"""
    pts = []
    for a in LOOP_ANGLES:
        c, s = math.cos(a), math.sin(a)
        # y方向の半径は前(s<0)と後ろ(s>0)で切り替える
        ry = r_front if s < 0 else r_back
        x_scale = 1.0 - snout * (-s) if s < 0 else 1.0
        pts.append((cx + r_side * c * x_scale, cy + ry * s, z))
    return pts


# ---------------------------------------------------------------- 顔の彫り
# ケージ頂点を領域ごとに、ループ中心からの放射方向へ押し引きする。
# (角度中心deg, 角度半幅deg, z中心, z半高, 変位m, 名前)
#   角度は _profile の規約(前の中心=270°、+X側が 270°より大きい側)。
#   変位 >0 で外(前)へ、<0 で内(奥)へ。左右対称の特徴は ± で2つ書く。
# 落ち込みは (1-d²)² の丸い山なので、Subdivision 後も谷・丘として残る。
FACE_CENTER = 270.0
# 口線: 中央がやや下がり、口角へ向かって緩く上がる(設定画の眠そうな口)。
# 頭側の溝と下顎ピースの上端が同じ式を使う
MOUTH_Z = 0.0895          # 正面中心での口線の高さ
MOUTH_HALF_DEG = 62.0     # 口角までの角度
MOUTH_CURVE = 0.0045      # 口角での持ち上がり(中央は -MOUTH_CURVE*0.45 下がる)


def mouth_dz(da_deg: float) -> float:
    """正面中心からの角度 da における口線の z オフセット。"""
    u = min(abs(da_deg) / MOUTH_HALF_DEG, 1.0)
    return MOUTH_CURVE * (u * u - 0.45)


# (角度中心, 角度半幅, 角度の平坦率, z中心, z半高, zの平坦率, 変位, 名前)
#   平坦率 f: 中心から半幅×f までは変位が一定(台地)、その外で丸く落ちる。
#   口吻のように「幅広・薄い・短い」面を作るには台地が要る(尖った山にすると
#   人間の鼻のような一本の突起になる)。
FACE_FEATURES = [
    # 眼裂: 上まぶたの下だけ奥へ。下側は頬へつなぐ(楕円の穴にしない)
    (FACE_CENTER - 42, 32, 0.35, 0.1005, 0.0065, 0.30, -0.0038, "socket_R"),
    (FACE_CENTER + 42, 32, 0.35, 0.1005, 0.0065, 0.30, -0.0038, "socket_L"),
    # 眉弓/上まぶた: 眼裂の上の厚い庇(重く垂れた上まぶたの土台)。前へ
    (FACE_CENTER - 42, 34, 0.30, 0.1085, 0.0055, 0.30, +0.0032, "brow_R"),
    (FACE_CENTER + 42, 34, 0.30, 0.1085, 0.0055, 0.30, +0.0032, "brow_L"),
    # 頬: 目の下〜口角の外側を前下方へ(横には広げない)。45°で眼裂(奥)→頬(手前)
    (FACE_CENTER - 58, 30, 0.30, 0.089, 0.011, 0.30, +0.0065, "cheek_R"),
    (FACE_CENTER + 58, 30, 0.30, 0.089, 0.011, 0.30, +0.0065, "cheek_L"),
    # 中央マズル: 鼻孔間の幅しかない、狭く短い鼻先。頬とは別の奥行き
    (FACE_CENTER, 26, 0.35, 0.1000, 0.0060, 0.35, +0.0050, "muzzle_top"),
    # 上唇: マズルの下でやや広がる。口線の上の面
    (FACE_CENTER, 46, 0.45, 0.0930, 0.0050, 0.40, +0.0040, "upper_lip"),
    # 口線の溝: 下顎ピースの上端と上唇の間。z は MOUTH_CURVE で角度により変わる
    (FACE_CENTER, 62, 0.60, MOUTH_Z, 0.0035, 0.0, -0.0025, "mouth_groove"),
]


def _bump(d: float, flat: float = 0.0) -> float:
    """中心1・縁0の丸い山。flat>0 で中心付近を台地にする。"""
    d = abs(d)
    if d >= 1.0:
        return 0.0
    if d <= flat:
        return 1.0
    t = (d - flat) / (1.0 - flat)
    return (1.0 - t * t) ** 2


def _sculpt_face(sections: list[list[tuple[float, float, float]]],
                 loops=None) -> None:
    """各ループ頂点に FACE_FEATURES の変位を加える(in place)。
    loops は (z, cy, ...) の列。省略時は BODY_LOOPS(頭ケージ)。"""
    for li, row in enumerate(BODY_LOOPS if loops is None else loops):
        z, cy = row[0], row[1]
        pts = sections[li]
        for vi, a in enumerate(LOOP_ANGLES):
            a_deg = math.degrees(a) % 360.0
            x, y, _z = pts[vi]
            radial = Vector((x, y - cy, 0.0))
            if radial.length < 1e-9:
                continue
            radial.normalize()
            disp = 0.0
            for ang, hw, fa, zc, hh, fz, amp, name in FACE_FEATURES:
                da = (a_deg - ang + 180.0) % 360.0 - 180.0
                if name == "mouth_groove":
                    zc = zc + mouth_dz(da)
                disp += amp * _bump(da / hw, fa) * _bump((z - zc) / hh, fz)
            if disp:
                pts[vi] = (x + radial.x * disp, y + radial.y * disp, _z)


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
    _sculpt_face(sections)
    cage = C.section_loft(f"{NAME}_cage", sections, smooth=False,
                          cap_top=True, cap_bottom=True)
    body = _copy_object(cage, f"{NAME}_body")
    _subdivide(body, 2)
    return cage, body


# ------------------------------------------------------------------- 下顎
# 頭ケージの下側スライス。頭と同じ _profile / 頬の彫りを使い、蝶番より前だけを
# 切り出す。閉口時は頭の下顔面と同じシルエット(口線の溝だけが見える)。
# (z, cy, r_front, r_back, r_side, snout, name) ―― 頭の collar〜jaw に対応。
# 半径は頭ケージより JAW_OUT だけ外に置き、面の重なり(ちらつき)を避ける。
JAW_BACK = +0.006      # この y より後ろは平らに切る(蝶番の面)
JAW_HINGE = (0.0, JAW_BACK, 0.084)
JAW_OUT = 0.0005       # 正面(口の範囲)では頭の面より外に出す
JAW_IN = -0.0015       # 口角より後ろでは頭の中に沈める(側面に稜線を出さない)
JAW_CORNER_DEG = (50.0, 72.0)  # 正面中心からこの角度の間で外→内へ移る(口角)
# 上端は平らなキャップにせず、唇が口の中へ巻き込む縮小ループ(jaw_lip)を
# 挟んで丸める(平らなキャップだと「頭の下の皿」に見える)。
# 下端も同様に、下顎の裏側が喉へ向かって丸く巻き込むループを置き、底の
# キャップは頭ケージの中に隠す(底を襟の高さで平らに切ると「引き出し」になる)。
JAW_LOOPS = [
    (0.0710, -0.004, 0.012, 0.018, 0.022, 0.0, "jaw_under_in"),  # 頭の中(隠れる)
    (0.0730, -0.007, 0.024, 0.024, 0.029, 0.05, "jaw_under"),    # 裏側(側方は細い=蹄鉄)
    (0.0765, -0.010, 0.032, 0.029, 0.035, 0.10, "jaw_under_fr"), # 丸い下面
    (0.0805, -0.011, 0.037, 0.032, 0.039, 0.20, "jaw_throat"),
    # 顎先は上唇(≈-0.054)より 3mm 後ろ: 上顎がわずかに被さる(同じ面まで
    # 出すと「への字の分厚い下唇」に見える)
    (0.0844, -0.012, 0.0375, 0.036, 0.040, 0.30, "jaw_body"),    # 下顎の厚み
    (0.0872, -0.013, 0.037, 0.036, 0.040, 0.35, "jaw_top"),      # 顎先(最前)
    (0.0888, -0.013, 0.0335, 0.036, 0.037, 0.35, "jaw_lip"),     # 唇の巻き込み(口線)
]


def build_jaw() -> bpy.types.Object:
    """下顎。JAW_HINGE を支点に X軸回りで開く(あくび)。"""
    k = RADIUS_COMP
    sections = []
    a0, a1 = JAW_CORNER_DEG
    for (z, cy, rf, rb, rs, snout, _n) in JAW_LOOPS:
        pts = _profile(z, cy, rf * k, rb * k, rs * k, snout)
        # 口の範囲(正面)だけ頭より外、口角より後ろは頭の中へ
        adj = []
        for (x, y, _z), a in zip(pts, LOOP_ANGLES):
            da = abs((math.degrees(a) - FACE_CENTER + 180.0) % 360.0 - 180.0)
            w = 1.0 if da <= a0 else 0.0 if da >= a1 else 1.0 - (da - a0) / (a1 - a0)
            w = w * w * (3 - 2 * w)
            off = JAW_OUT * w + JAW_IN * (1.0 - w)
            r = Vector((x, y - cy, 0.0))
            if r.length > 1e-9:
                r.normalize()
                x, y = x + r.x * off, y + r.y * off
            # 口線の曲線: 上端のループほど強く追従(下面は動かさない)
            wz = min(max((_z - 0.0765) / (0.0888 - 0.0765), 0.0), 1.0)
            adj.append((x, y, _z + mouth_dz(da) * wz))
        sections.append(adj)
    _sculpt_face(sections, JAW_LOOPS)
    # 蝶番より後ろを平らに切る
    sections = [[(x, min(y, JAW_BACK), z) for (x, y, z) in sec] for sec in sections]
    jaw = C.section_loft(f"{NAME}_jaw", sections, smooth=False, cap_top=True, cap_bottom=True)
    _subdivide(jaw, 2)
    return jaw


def open_jaw(jaw: bpy.types.Object, degrees: float) -> None:
    """レビュー用: 下顎を蝶番回りに degrees だけ開く(正で下へ開く)。"""
    from mathutils import Matrix
    pivot = Vector(JAW_HINGE)
    rot = Matrix.Rotation(math.radians(degrees), 4, "X")
    jaw.matrix_world = Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot)


def jaw_clearance_deg(step: float = 1.0, max_deg: float = 60.0) -> float:
    """下顎だけを開いたとき、顎先(最も前に出るループの前縁)が胴(襟より下の
    腹・胸)の前面に当たる角度(度)を返す。頭を後ろへ倒さずに開ける限界の目安。"""
    z_top, cy_top, rf_top = max(((r[0], r[1], r[2]) for r in JAW_LOOPS),
                                key=lambda t: -(t[1] - t[2] * RADIUS_COMP))
    chin = Vector((0.0, cy_top - rf_top * RADIUS_COMP, z_top))
    pivot = Vector(JAW_HINGE)
    names = [r[-1] for r in BODY_LOOPS]
    body = [(z, cy - rf * RADIUS_COMP) for (z, cy, rf, *_r) in BODY_LOOPS[:names.index("collar") + 1]]
    def front_at(z):
        for (z0, f0), (z1, f1) in zip(body, body[1:]):
            if z0 <= z <= z1:
                return f0 + (f1 - f0) * (z - z0) / (z1 - z0)
        return +1.0  # 襟より上は胴が無い(当たらない)
    deg = 0.0
    while deg < max_deg:
        th = math.radians(deg)
        d = chin - pivot
        y = pivot.y + d.y * math.cos(th) - d.z * math.sin(th)
        z = pivot.z + d.y * math.sin(th) + d.z * math.cos(th)
        if y > front_at(z):
            return deg
        deg += step
    return max_deg


# ------------------------------------------------------------------- 四肢・尾
# 別メッシュ。胴へは融合しない(ブロックアウト段階)。

def _digits(prefix: str, origin, forward, spread_axis, n: int = 3,
            length: float = 0.011, radius: float = 0.003,
            spread_deg: float = 30.0) -> list[bpy.types.Object]:
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
    """前脚。肩は高く(頬が腕の上に乗る)、上腕・前腕は短く、肘は外、手は外側。
    腕を主役にしない(主役は顔→腹→腿)。掌は小さく、指3本を独立させる。"""
    out = []
    for side in (-1.0, 1.0):
        pts = [
            Vector((0.028 * side, -0.012, 0.062)),  # 肩(襟ループの下に埋まる)
            Vector((0.040 * side, -0.022, 0.050)),  # 上腕(外下へ)
            Vector((0.044 * side, -0.027, 0.038)),  # 肘(最も外)
            Vector((0.040 * side, -0.036, 0.022)),  # 前腕(下へ)
            Vector((0.033 * side, -0.043, 0.012)),  # 手首
            Vector((0.030 * side, -0.046, 0.008)),  # 手(外側に置く)
        ]
        arm = C.curve_tube(f"{NAME}_arm{side:+.0f}", pts,
                           [0.015, 0.014, 0.013, 0.012, 0.011, 0.010])
        out.append(arm)
        # 掌は小さく、指3本を独立させる(平たい水かきに見せない)
        palm = (0.030 * side, -0.049, 0.006)
        out.append(C.uv_sphere(f"{NAME}_hand{side:+.0f}", palm, 0.0085,
                               segments=10, rings=7, scale=(1.0, 1.0, 0.6)))
        out += _digits(f"{NAME}_hand{side:+.0f}", (0.030 * side, -0.055, 0.004),
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
    """後脚。腿は身体の主要ボリューム: 上側(尻側)は胴の中に食い込ませて
    胴から滑らかに始まり、膝(前下)へ強くテーパーする卵。「球を貼った」感じを
    消す。背面図では胴に密着。足は外へ開いて床に着き、指3本が外前へ向く。"""
    out = []
    for side in (-1.0, 1.0):
        thigh_c = (0.031 * side, +0.016, 0.028)
        knee_dir = (0.0, -0.034, -0.020)  # 尻上(胴の中)→膝前下
        thigh = _egg(f"{NAME}_thigh{side:+.0f}", thigh_c, knee_dir,
                     r_side=0.017, r_across=0.025, r_along=0.032, taper=0.50)
        out.append(thigh)
        knee = Vector((0.036 * side, -0.010, 0.014))
        ankle = Vector((0.046 * side, -0.011, 0.010))
        toes = Vector((0.054 * side, -0.016, 0.009))
        shin = C.curve_tube(f"{NAME}_shin{side:+.0f}", [Vector(thigh_c), knee, ankle, toes],
                            [0.014, 0.012, 0.0095, 0.0085])
        out.append(shin)
        sole = (0.054 * side, -0.017, 0.006)
        out.append(C.uv_sphere(f"{NAME}_foot{side:+.0f}", sole, 0.0085,
                               segments=10, rings=7, scale=(1.0, 1.0, 0.6)))
        out += _digits(f"{NAME}_foot{side:+.0f}", (0.058 * side, -0.022, 0.004),
                       forward=(0.55 * side, -1.0, 0.0), spread_axis=(0, 0, 1))
    return out


def build_tail() -> bpy.types.Object:
    """尾。側面マスクの列ごとの実測を基に、根元(r0.020)から滑らかにテーパー。
    y≈+0.09 まで床を這わせてから立ち上がり、直径≈0.025 の小さな渦を前へ
    巻いて終わる(第2版は +0.08 で持ち上がり始めて早すぎた)。
    正面/背面図では尾は体の右側(-X)へ出ているので、渦へ向かって少し-Xへ振る。"""
    pts = [
        # 根元〜1/3は胴に匹敵する太さ(r0.024→0.017)から滑らかにテーパー
        Vector((0.000, +0.030, 0.024)),   # 腰の中(骨盤ループに埋まる)
        Vector((0.000, +0.052, 0.022)),   # 尾の付け根(床に接する)
        Vector((-0.003, +0.068, 0.018)),  # 床を這う
        Vector((-0.008, +0.083, 0.014)),
        Vector((-0.014, +0.095, 0.012)),  # 這う区間の終わり
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
    radii = [0.024, 0.021, 0.017, 0.013, 0.010, 0.008, 0.0065, 0.0055, 0.0047,
             0.004, 0.0034, 0.0028, 0.0023, 0.0018]
    return C.curve_tube(f"{NAME}_tail", pts, radii)


# 背びれ: 背骨線(y,z)。頭頂から項・背中・腰を通って尾の付け根の上面まで
FRILL_SPINE = [
    (-0.014, 0.128), (0.000, 0.129), (0.012, 0.1255), (0.019, 0.115),
    (0.0215, 0.104), (0.0215, 0.093), (0.023, 0.084), (0.025, 0.076),
    (0.028, 0.069), (0.033, 0.061), (0.039, 0.053), (0.044, 0.045),
    (0.050, 0.037), (0.056, 0.0285), (0.058, 0.024),
]
# 波形の山: (背骨線に沿った弧長s, 半幅, 高さ)。
# 「あくびとかげ」の横シルエットを作る特徴なので設定画より誇張する:
# 頭頂の小突起 → 後頭部(大) → 項(最大0.024) → 背中(中・中) → 腰(小)。
# 半幅は山の間隔の半分より広くして裾が重なり、鋸歯ではなく丸い花弁の連なりに
FRILL_LOBES = [
    (0.008, 0.010, 0.005), (0.032, 0.014, 0.017), (0.055, 0.016, 0.024),
    (0.078, 0.015, 0.020), (0.099, 0.014, 0.016), (0.118, 0.012, 0.012),
    (0.135, 0.010, 0.008),
]
FRILL_BASE = 0.002       # 山と山の間にも残る膜の高さ(連続した1枚に見せる)
FRILL_INSET = 0.007      # 内側の縁を胴の中へ沈める量
FRILL_THICKNESS = 0.006
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
    extras = ([build_jaw()] + build_arms() + build_legs()
              + [build_tail(), build_frill()])
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for obj in [body] + extras:
        C.assign_material(obj, clay)
    C.assign_material(cage, clay)
    return {"cage": cage, "body": body, "extras": extras}
