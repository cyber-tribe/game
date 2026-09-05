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

第9回レビュー(Face Gate 第4版への指摘)で決めたこと ―― Face Topology v2:
舟形の下顎・曲がった口線・中央マズルには対応したが、設定画との距離が
大きいのはパラメータ不足ではなく**顔の構成原理**の違い。設定画の顔は
「マズルのある動物顔」ではなく「大きな一枚の顔面+重く垂れた左右のまぶた+
極小の鼻+頬に埋もれた長い口+大きく柔らかな顎」。水平リングの何番目を
前へ出す方式は、口の高さで頭を横断する帯を作りやすい。
- 全身・頭蓋・首のケージは維持。顔面だけを**ケージ段階で意味論的に切り直す**
  (_face_topology): 水平ループの変位フィールド(FACE_FEATURES の眼窩・
  マズル・口線溝)を廃止し、bmesh の inset で島を作る。
  * 目: 2重 inset のリング。眼窩を掘らず、外リング上側(上まぶた)を盛り、
    内側の眼裂だけを少し奥へ。下側は頬へつなぐ。
  * 口: ±62° の帯を inset した溝。溝は島の中で終わる=頬に埋もれた口。
    口線は中央が下がり口角へ上がる曲線(MOUTH_CURVE)。
  * 鼻: 鼻孔間の幅しかない極小の盛り(+1.5mm)。マズルは作らない。
  * 頬: 目の下〜口角の外側を前下方へ(横には広げない)。
- 下顎分離は維持するが、別ピースを重ねるのではなく、頭ケージから口線の
  下・蝶番より前の面を**切り離して**下顎メッシュにする(_split_jaw)。
  境界は口線の辺そのものなので、閉口時に見える境界は口線(と顎下の1本)だけ。
  頭側の穴は内側へ窪めた口腔で塞ぎ、下顎側は口底で塞ぐ。
- Face Gate の合格条件を修正: 「Clay だけで眠そうな顔に見える」ではなく、
  「テクスチャ無しでも頬・目を置く面・鼻を置く中央面・口周囲・顎の立体関係が
  成立している」。その後、設定画から作った仮の半目・鼻孔・口線を載せる
  BaseColor Gate を別に設ける。
- 最初のレビューは 正面Clay・45°Clay・Wire のみ。側面とあくび機構は顔面の
  基本構造が通ってから戻す。

第10回レビュー(Face Topology v2 第1版)で決めたこと ―― Face Clay Gate 終了:
トポロジーは健全になったが、造形だけで設定画の顔を再現しようとすると
45° で眼窩・鼻面・口周辺が強く出て、設定画に無い「爬虫類の解剖学」が
加わる。このキャラは 2D 顔(黒く太い半目・まぶたの形・鼻孔2点・長い
への字口・頬の模様)への依存度が高い。3D と 2D の分担を明示する:
  頭蓋シルエット=3D / 頬の大ボリューム=3D(+2D) / 短い鼻先=3D(+2D) /
  下顎(あくび)=3D / 半目・上まぶた・鼻孔・通常時の口線・頬模様=2D
- 最後に**造形を減らすパス**: 眼裂 −1.5→−0.6mm、上まぶたの盛り +3→+2mm、
  鼻 +1.5→+0.8mm、上唇の被さり +2→+1mm。眼窩・鼻翼・鼻孔は彫らない。
- 閉口時の上下顎境界を目立たせない: 下顎を切り離す方式(境界に crease の
  線が残る)をやめ、頭は一枚の閉じたメッシュのまま、口の帯を 12mm 奥へ
  押し込んだ**薄い口腔スロット**にする。閉口時に見えるのは口線1本だけ。
  あくびは下顎ボーン(蝶番 JAW_HINGE)で下顔面の頂点を回し、スロットが
  開いて口腔が現れる(ハイブリッド: 通常時のへの字口は BaseColor、開口は 3D)。
- ここで Face Topology をロックし、次は Face Texture Gate(設定画から半目・
  鼻孔・への字口・頬の明色模様・顎周辺の色面を BaseColor へ落とし、
  設定画正面 / textured 正面 / 45° / 側面 / 実ゲームカメラで比較)。

第11回レビュー(Face Texture Gate 第1版)で決めたこと ―― 顔を収束させる3点:
テクスチャを載せた途端にキャラクターとして読めるようになった(方針は裏付け
られた)。残る差は3点だけで、3D はもう彫らない。
1. 目が細い波線に見える。原因は主に**顔の UV 密度**(全身1枚の smart_uv では
   1mm あたり 1.4 テクセルしかなく、設定画の眼裂 高さ2mm が3テクセルに潰れる)。
   顔だけ別マテリアルにして**正面平行投影の専用テクスチャ**を割り当てる
   (デカールの (x,z) 座標系と UV が 1 対 1 になる)。あわせて眼裂を縦に
   膨張させて誇張する(実ゲーム距離では半目の黒い形しか読まれない)。
2. 閉口時に 3D の口境界とデカールのへの字口が**二重の口**に見える。
   口腔スロットの開口を 0.4mm まで絞り、通常時の口はデカールだけにする。
   あくびは下顎ボーンで開くので、スロットの深さは残す。
3. 側面で口吻が長く平ら(ワニ的)。顔面の前縁を、鼻先(z≈0.10)を頂点に
   上下へ丸く後退させる(額 −7mm、顎 −4mm)。**唯一の 3D 修正**。
体の細さ・腕の長さ・胸の高さは Face Gate 収束後の Body Final Gate で扱う。

第12回レビュー(Face Texture Gate 第2版)で決めたこと ―― 残り2点:
1. 目は「黒いギザギザの太線」ではなく **2層**。設定画は上側に体色より明るい
   紫の大きなまぶた面があり、その下端にほぼ直線的な黒い眼裂が乗る構造
   (実測: 眼裂の上 9mm が lum 111〜160、体の中央値は 96)。黒帯だけを
   太らせると「しかめっ面・眉毛」に見える。
2. 閉口時の 3D 顎境界(口腔スロットの溝)を**完全に消す**。通常時に
   プレイヤーが見る口は BaseColor のへの字一本だけにする。あくびは
   アーマチュアを載せる工程で、下顎ボーンと開口用のジオメトリを一緒に作る
   (蝶番 JAW_HINGE の位置だけ残す)。

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
    (0.080, -0.010, 0.033, 0.031, 0.040, 0.15, "throat"),
    # 顎〜口: 基礎の横幅は 0.040 に落とし、頬の張り(+0.005)は FACE_FEATURES で
    # 独立した凸として足す(「頭を洋梨形にした」ではなく「頬を作る」)
    # 前面(r_front)は「眼窩の平面」。口吻の前後差は FACE_FEATURES の muzzle で
    # 足すので、基礎ループでは鼻先を作らない
    # 下顔面: jaw ループの前面は 5mm 引っ込めて口の溝(奥)にする。その前を
    # 下顎ピース(build_jaw)が覆う。mouth ループが上唇。口吻の前後差は
    # FACE_FEATURES の muzzle で足す
    # 顔面は「大きな一枚の面」。前面半径は自然な顔の平面(口吻は作らない)。
    # jaw〜lip の行が口の帯(inset で溝になる)。jaw 行より下・蝶番より前が下顎
    # 前縁(cy - r_front*RADIUS_COMP)は鼻先(z≈0.10、-0.0515)を頂点に上下へ
    # 丸く後退させる。以前は brow が最前(-0.0569)で、側面が「平たい長い
    # 口吻(ワニ的)」に見えていた
    # 口の帯(jaw〜lip)は**デカールのへの字口(z 0.0904)と重なる高さ**に置く。
    # 4mm ずれていたので「3Dの溝」と「描いた口」が二重の口に見えていた
    (0.0875, -0.0125, 0.0334, 0.036, 0.040, 0.30, "jaw"),     # 口線の下=下顎の上端
    (0.0910, -0.0140, 0.0336, 0.036, 0.040, 0.35, "lip"),     # 口の帯の上端
    (0.0915, -0.0155, 0.0332, 0.0375, 0.040, 0.40, "mouth"),  # 上唇。後縁+0.022=項の谷
    (0.0985, -0.015, 0.0356, 0.041, 0.039, 0.48, "cheek"),    # 目の下端
    (0.1056, -0.0145, 0.0361, 0.0455, 0.036, 0.52, "snout_eye"),  # 目の上端=鼻先の高さ
    # 頭頂へ: 正面幅は急に絞る(頬張り形)、前縁も後退させる
    (0.1126, -0.020, 0.0288, 0.038, 0.030, 0.50, "brow"),
    (0.1196, -0.016, 0.0273, 0.032, 0.023, 0.35, "forehead"),
    (0.1249, -0.0115, 0.0239, 0.0255, 0.014, 0.20, "crown"),
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
# 口の曲がりは**デカールが描く**(設定画のへの字口)。3D 側でも曲げると、
# 溝の陰影が「中央が下がり口角が上がる=笑顔」に読めたので平らにする
MOUTH_CURVE = 0.0


def mouth_dz(da_deg: float) -> float:
    """正面中心からの角度 da における口線の z オフセット。"""
    u = min(abs(da_deg) / MOUTH_HALF_DEG, 1.0)
    return MOUTH_CURVE * (u * u - 0.45)


# (角度中心, 角度半幅, 角度の平坦率, z中心, z半高, zの平坦率, 変位, 名前)
#   平坦率 f: 中心から半幅×f までは変位が一定(台地)、その外で丸く落ちる。
#   口吻のように「幅広・薄い・短い」面を作るには台地が要る(尖った山にすると
#   人間の鼻のような一本の突起になる)。
FACE_FEATURES = [
    # 頬: 目の下〜口角の外側を前下方へ(横には広げない)
    (FACE_CENTER - 58, 30, 0.30, 0.089, 0.011, 0.30, +0.0060, "cheek_R"),
    (FACE_CENTER + 58, 30, 0.30, 0.089, 0.011, 0.30, +0.0060, "cheek_L"),
    # 眉: 上まぶたの上の柔らかい庇(目の島の外リングと合わせて「重いまぶた」)
    (FACE_CENTER - 45, 30, 0.30, 0.110, 0.005, 0.30, +0.0012, "brow_R"),
    (FACE_CENTER + 45, 30, 0.30, 0.110, 0.005, 0.30, +0.0012, "brow_L"),
    # 鼻: ごく緩やかな鼻先の膨らみだけ。鼻孔2点は BaseColor
    (FACE_CENTER, 12, 0.30, 0.1005, 0.0045, 0.30, +0.0008, "nose"),
    # 上唇: 口の帯のすぐ上をわずかに前へ(口境界は目立たせない)
    (FACE_CENTER, 50, 0.50, 0.0925, 0.0035, 0.30, +0.0010, "upper_lip"),
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
                disp += amp * _bump(da / hw, fa) * _bump((z - zc) / hh, fz)
            if disp:
                pts[vi] = (x + radial.x * disp, y + radial.y * disp, _z)


# ---------------------------------------------------------------- 顔面の島(Face Topology v2)
# 目の島は「目+まぶた」の領域(≈30×14mm)。小さくすると鼻孔のような窪みになる
EYE_DA = 37.5          # 目の中心(正面中心からの角度)。列 210°〜255° / 285°〜330°
EYE_HALF_DA = 22.5     # 目の島の半幅(角度)。列3つ分
EYE_Z = (0.0985, 0.1126)   # 目の島の行(cheek〜brow の2行)
EYE_INSET = (0.0020, 0.0012)   # 外リング(上まぶた)・内リング の inset 幅
EYE_LID_OUT = 0.0020   # 上まぶた(外リング上側)を盛る量(半目そのものは 2D)
EYE_SLIT_IN = 0.0006   # 眼裂(内側)を奥へ引く量(穴は掘らない。面変化の手がかりだけ)
MOUTH_Z_ROWS = (0.0875, 0.0910)   # 口の帯の行(jaw〜lip)
# 下顎ボーンの蝶番(耳下)。リグ時に、この点を支点に下顔面の頂点を回す
JAW_HINGE = (0.0, +0.006, 0.082)


def _cy_at(z: float) -> float:
    rows = BODY_LOOPS
    if z <= rows[0][0]:
        return rows[0][1]
    for (z0, c0, *_a), (z1, c1, *_b) in zip(rows, rows[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return c0 + (c1 - c0) * t
    return rows[-1][1]


def _da_of(co) -> float:
    a = math.degrees(math.atan2(co.y - _cy_at(co.z), co.x)) % 360.0
    return (a - FACE_CENTER + 180.0) % 360.0 - 180.0


def _radial(co) -> Vector:
    r = Vector((co.x, co.y - _cy_at(co.z), 0.0))
    return r.normalized() if r.length > 1e-9 else Vector((0, -1, 0))


def _push(verts, amount: float) -> None:
    for v in verts:
        v.co += _radial(v.co) * amount


def _between(z, lo, hi, eps=1e-4):
    return lo - eps < z < hi + eps


def _face_topology(cage: bpy.types.Object) -> None:
    """頭ケージの顔面に意味論的な島(目×2・口)を切る。cage を書き換える。"""
    bm = bmesh.new()
    bm.from_mesh(cage.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    def sel(z_lo, z_hi, da_c, da_half, y_max=None):
        out = []
        for f in bm.faces:
            c = f.calc_center_median()
            if not _between(c.z, z_lo, z_hi):
                continue
            if abs(_da_of(c) - da_c) > da_half:
                continue
            if y_max is not None and c.y >= y_max:
                continue
            out.append(f)
        return out

    eyes = [sel(*EYE_Z, -EYE_DA, EYE_HALF_DA), sel(*EYE_Z, +EYE_DA, EYE_HALF_DA)]

    # 目: 2重 inset。外リング上側=上まぶた(盛る)、内側=眼裂(わずかに奥へ)
    for island in eyes:
        if not island:
            continue
        zc = sum(f.calc_center_median().z for f in island) / len(island)
        outer_ring = bmesh.ops.inset_region(bm, faces=island, thickness=EYE_INSET[0],
                                            depth=0.0, use_even_offset=True)["faces"]
        inner_ring = bmesh.ops.inset_region(bm, faces=island, thickness=EYE_INSET[1],
                                            depth=0.0, use_even_offset=True)["faces"]
        inner_verts = {v for f in island for v in f.verts}
        mid_verts = {v for f in inner_ring for v in f.verts} - inner_verts
        outer_verts = {v for f in outer_ring for v in f.verts} - mid_verts - inner_verts
        for v in outer_verts:      # 上まぶた: 上側だけ前へ
            if v.co.z > zc:
                v.co += _radial(v.co) * EYE_LID_OUT
        for v in mid_verts:        # まぶたの縁: 上側は少し前、下側は頬へ
            v.co += _radial(v.co) * (EYE_LID_OUT * 0.5 if v.co.z > zc else 0.0)
        for v in inner_verts:      # 眼裂: わずかに奥へ、上縁を少し下げて半目の土台に
            v.co += _radial(v.co) * -EYE_SLIT_IN
            if v.co.z > zc:
                v.co.z -= 0.0008

    # 口の 3D スロットは作らない。閉口時に「描いたへの字口」と「3Dの溝」が
    # 二重の口に見え、溝を浅く(12→5mm)しても水平な暗い線として残った。
    # 通常時の口は BaseColor が描くへの字一本だけにする(あくび用の開口
    # ジオメトリは、下顎ボーンと一緒にアーマチュアの工程で作る)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(cage.data)
    bm.free()


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
    _face_topology(cage)
    body = _copy_object(cage, f"{NAME}_body")
    _subdivide(body, 2)
    return cage, body


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
    extras = build_arms() + build_legs() + [build_tail(), build_frill()]
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for obj in [body] + extras:
        C.assign_material(obj, clay)
    C.assign_material(cage, clay)
    return {"cage": cage, "body": body, "extras": extras}


# ------------------------------------------------------------------- 塗り(Face Texture Gate)
# 顔のアイデンティティ(半目・鼻孔・への字口・頬の模様)は 2D が担当する。
# デカールは tools/akubitokage_face_decal.py が設定画から直接生成した PNG。
import json as _json
import os as _os

_ROOT = _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
FACE_DECAL_PNG = _os.path.join(_ROOT, "design", "characters", "akubitokage", "generated",
                               "akubitokage-face-decal.png")
FACE_DECAL_JSON = FACE_DECAL_PNG[:-4] + ".json"
# パレット(設定画「カラーパレット」。v2 の実測値を引き継ぐ)
SHEET = {
    "main": (0.30, 0.28, 0.30),
    "belly": (0.76, 0.70, 0.78),
    "spot": (0.565, 0.494, 0.565),
    "mouth": (0.729, 0.584, 0.675),
}
# v3 の腹の膨らみに合わせた「おなか(薄い影)」の楕円体
BELLY_CENTER = Vector((0.0, -0.030, 0.032))
BELLY_RADII = Vector((0.022, 0.026, 0.026))
_decal_cache: list = []


def _decal():
    if not _decal_cache:
        import numpy as np
        meta = _json.load(open(FACE_DECAL_JSON))
        img = bpy.data.images.load(FACE_DECAL_PNG)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        _decal_cache.append((px.reshape(h, w, 4)[::-1], meta))
    return _decal_cache[0]


def decal_sample(x: float, z: float):
    """モデル座標(x, z)でデカールを双一次補間で引く。(r, g, b, a)。範囲外は a=0。"""
    dec, meta = _decal()
    h, w = dec.shape[:2]
    fx = (x - meta["x0"]) * meta["ppu"] - 0.5
    fy = (meta["z1"] - z) * meta["ppu"] - 0.5
    x0, y0 = math.floor(fx), math.floor(fy)
    if x0 < 0 or y0 < 0 or x0 + 1 >= w or y0 + 1 >= h:
        return (0.0, 0.0, 0.0, 0.0)
    tx, ty = fx - x0, fy - y0
    p = (dec[y0, x0] * (1 - tx) + dec[y0, x0 + 1] * tx) * (1 - ty) \
        + (dec[y0 + 1, x0] * (1 - tx) + dec[y0 + 1, x0 + 1] * tx) * ty
    return (float(p[0]), float(p[1]), float(p[2]), float(p[3]))


def _surface_depth(p: Vector) -> float:
    """点 p が頭ケージの外面からどれだけ内側にあるか(m)。外面上で 0、内側で正。
    口腔スロット(外面から 12mm 押し込んだ帯)の内側判定に使う。"""
    rows = BODY_LOOPS
    z = p.z
    if z <= rows[0][0] or z >= rows[-1][0]:
        return 0.0
    for r0, r1 in zip(rows, rows[1:]):
        if r0[0] <= z <= r1[0]:
            t = (z - r0[0]) / (r1[0] - r0[0])
            cy, rf, rb, rs, sn = (r0[i] + (r1[i] - r0[i]) * t for i in range(1, 6))
            break
    k = RADIUS_COMP
    a = math.atan2(p.y - cy, p.x)
    c, s_ = math.cos(a), math.sin(a)
    ry = rf if s_ < 0 else rb
    xs = 1.0 - sn * (-s_) if s_ < 0 else 1.0
    surf = Vector((rs * k * c * xs, ry * k * s_))
    return surf.length - Vector((p.x, p.y - cy)).length


def body_color(p: Vector, n: Vector):
    """bake_albedo 用: 体色 + おなか + 口腔 + 顔デカール(正面投影)。"""
    base = SHEET["main"]
    # 口腔スロットの内側だけ。開口付近(3〜6mm)は墨色で閉口時の口線に見せ、
    # 奥(6mm〜)だけ「口の中(あくび時)」のピンクにする
    # おなか: 前を向く面だけ、楕円体の中で柔らかく
    d = p - BELLY_CENTER
    r = math.sqrt((d.x / BELLY_RADII.x) ** 2 + (d.y / BELLY_RADII.y) ** 2 + (d.z / BELLY_RADII.z) ** 2)
    if n.y < -0.2 and r < 1.0:
        t = max(0.0, min(1.0, (1.0 - r) / 0.25))
        t = t * t * (3 - 2 * t)
        base = tuple(base[i] + (SHEET["belly"][i] - base[i]) * t for i in range(3))
    # 顔デカール: 正面を向く面へ平行投影。横顔では薄める
    if p.y < -0.010 and n.y < -0.05 and p.z > 0.072:
        fade = max(0.0, min(1.0, (-n.y - 0.05) / 0.25))
        r_, g_, b_, a = decal_sample(p.x, p.z)
        a *= fade
        if a > 0.004:
            base = (base[0] + (r_ - base[0]) * a, base[1] + (g_ - base[1]) * a, base[2] + (b_ - base[2]) * a)
    return base


# 失敗した試み: 顔の面を2つ目のマテリアルへ移し、UV を正面平行投影で [0,1] に
# 張って専用テクスチャにする方式。平行投影は**同じ (x,z) を持つ複数の面**
# (口腔スロットの奥壁・目の inset リング・頬の側面)を同じ UV へ重ねるので、
# 口の中の色が顔一面に散り、範囲外の頂点で UV が [0,1] を外れて破綻した。
# 顔の密度は「全身1枚の解像度を上げる」で確保する(本番化のときに、シームを
# 引いてから split_material_region で正しく分離する)。

def texture_blockout(parts: dict, size: int = 3072) -> None:
    """ブロックアウトへ塗りを載せる(Face Texture Gate 用)。胴+頭は UV を切って
    bake_albedo、他の部位は体色のベタ。

    size=3072 で顔の密度は約 2.8 テクセル/mm(1536 では 1.4 で、設定画の
    眼裂が潰れた)。本番化のときは顔だけ別マテリアルにして下げる。"""
    body = parts["body"]
    C.smart_uv(body)
    img = C.bake_albedo(body, body_color, size=size, name=f"{NAME}_albedo")
    C.assign_material(body, C.make_textured_material(f"{NAME}_skin", img, roughness=0.8))
    flat = C.make_material(f"{NAME}_flat", SHEET["main"], roughness=0.8)
    for o in parts["extras"]:
        C.assign_material(o, flat)
