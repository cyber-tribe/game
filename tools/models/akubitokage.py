"""
あくびとかげ ―― ベースケージ+Subdivision方式。

このモジュールが本番の造形。monsters.MONSTERS から呼ばれる
(monsters.py には状態アニメーション akubitokage_animations だけが残る)。

v2(#1064〜#1068)の「断面ロフト+curve_tube+sculpt_merge/voxel remesh」は、
首・脇・顎下・腹と腿の境界といった**負の空間をvoxel融合が埋めてしまう**
方式だった。谷を深くしても融合で消え、また深くする、を4回繰り返しても
設定画とのA/B比較で大きな前進が無かったため、造形方式そのものを
切り替える(plan/models/archive/akubitokage-remake.md 追記参照)。

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

2026-09-20 の測り直し(handbook 4-96〜4-101):
- 背びれは**背の鱗板 13 枚**(涙形の別体)。1枚の膜だと背面から見ると
  縦に立った刃になり、設定画の背面図が持つ「正中を下りる淡い連なり」が
  出なかった。造形と塗りは同じ `scute_frames()` を見る。
- 尾は後ろ 101mm・横 −74mm。正面図/背面図でも渦が渦として見える。
- 座り姿: 頭が前へ出て胴は後ろへ引く。腹は前へ膨らまない。

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

第13回(全指摘の一括対応)で決めたこと ―― Body も含めて設定画の実測へ戻す:
正面マスクを「胴の中心」基準で測り直したところ、横幅が広範囲でずれていた。
設定画は 全高0.140、モデルは圧縮後0.134 なので z を 0.957 倍して対応付ける。
- **腹の半幅は頭とほぼ同じ**(0.040〜0.041 対 0.042)。これが「丸い腹・
  どっしりした下半身」の正体。モデルは 0.035 で細かった
- **頭の上半分が細すぎた**。設定画は目の高さで 0.042、額 0.0355、頭頂 0.0235
  と緩やかに絞るが、モデルは 0.036/0.030/0.014 と急に絞っていた
- くびれ(z0.075)は 0.029 で、モデルの 0.035 より細い
- 腕の外端は 0.044。モデルは肘 0.044+半径 0.0145 = 0.057 で 13mm 外へ出ていた
  → 半径 0.0145→0.010、肘 0.044→0.036 にして「短く細い腕」にする
- 体の斑点(パレットの「斑点・模様」)を追加する
- デカールはゲーム表示用に少し誇張する(眼裂を太く、まぶた面を広く、
  への字口を太く)。実ゲーム距離では大きな色面しか読まれない

第14回(Face Lock 後の Body Final Gate)で決めたこと:
顔は Topology / Texture ともロック。以後は原則触らない。
- 腕は「肩から手首まで太いチューブが身体の前へ張り出す」形だった。設定画は
  肩から自然に垂れて肘で細くなり、小さな手が接地する。テーパーを強くし、
  前への張り出しを減らして体の側面に沿わせる
- 腹の淡色が「白い球」に見えていた。設定画の絵の中では体色の約1.9倍
  (実測 sRGB 113,102,113 対 59,55,68)で、パレットのスウォッチ(#d7cbc8)ほど
  明るくない。0.76→0.575 に落とし、形も縦長の卵にする
- 姿勢が良すぎる。設定画は頭が前へ落ち、胸を張らない。頭のループを前へ倒す
- 背びれが均等に並んで硬い。高さ・間隔に揺らぎを付ける
- **全身の斑点**が無く、後ろから見るとほぼ単色だった。設定画の三面図から
  斑点を抽出し、3枚のデカール(front/side/back)を法線でブレンドして貼る
  (トライプラナー投影。tools/akubitokage_decal.py)

第15回 ―― あくびの開口(方式1の技術スパイク):
「あくびで口が開く」はこのキャラクターの核なので削らない。下顎を頭から
切り離し、**切断境界をデカールのへの字口(太さ約3mm)の真下に置く**ことで、
通常時は口線、開いたら本当の口、という同じ場所を二役にする。
以前この方式が失敗したのは境界が口線から 4mm ずれていたためで、今は口の帯を
口線に合わせてあるので条件が違う。
**結果: 不合格。方式1は永久棄却した。** 閉口の正面・45°・側面すべてで、
頭側の穴を塞いだ口腔(淡紫)が口線から大きくはみ出し、顔の下半分がピンクの
帯になった。頭と下顎を別々に Subdivision すると収縮量が違い、境界がぴったり
合わない(crease で押さえても極限位置は一致しない)のが原因で、境界の位置を
1mm 単位で詰めても解決しない種類の問題。
→ あくびは **方式2: 顔アトラスのコマ切り替え + 顎ボーンの回転** で作る。
   口腔の「見た目」は 2D、あくびした「動き」は 3D。口のスリットも
   bone heat の問題も要らない。

第17回 ―― あくび(方式2: 顔アトラス + 顎ボーン):
方式1(下顎分離)が閉口時に破綻したので、口腔の「見た目」は 2D、あくびした
「動き」は 3D で作る。顔だけ別マテリアルにしてある利点をそのまま使い、
顔のテクスチャを **通常 / あくび予備 / 大あくび の3コマを横に並べた
アトラス**にする(ガルドのまばたきと同じ "eyelid" 方式)。あくびの口の絵は
設定画に正面が無いので、側面のあくび表情から比(口腔の 高さ/幅 = 0.55)を
実測して正面へ補間した。動きの側は顎ボーンの回転・頭の反り・胸の膨らみで
作るので、口のスリットも bone heat の問題も要らない。
glTF の extras に mouthTiles / mouthMaterial を出し、エンジンはアニメーション
に合わせて顔マテリアルの UV を 1/3 ずつずらす。

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

NAME = "akubitokage"

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
    # r_side は設定画正面マスクを「胴の中心」基準で実測した半幅(z は 0.957 倍で対応)
    (0.005, +0.014, 0.024, 0.022, 0.020, 0.0, "seat"),        # 接地面(ほぼ床)
    (0.012, +0.012, 0.037, 0.036, 0.030, 0.0, "rump_low"),
    (0.020, +0.010, 0.040, 0.044, 0.036, 0.0, "rump"),
    (0.0285, +0.009, 0.041, 0.047, 0.039, 0.0, "pelvis"),     # 後縁+0.056: 骨盤が後ろ
    # 腹: 最前点(-0.042)は低い位置。半幅は頭とほぼ同じ 0.040〜0.041(実測)
    (0.037, +0.007, 0.036, 0.043, 0.0405, 0.0, "belly_low"),  # 腹の最前
    (0.045, +0.005, 0.032, 0.039, 0.0405, 0.0, "belly"),
    (0.053, +0.003, 0.030, 0.036, 0.0395, 0.0, "belly_high"),
    (0.061, +0.000, 0.026, 0.033, 0.0345, 0.0, "ribs"),
    # 胸〜襟: くびれ(実測 0.029)。胸を細くして頭が身体に埋まって見えるようにする
    (0.070, -0.001, 0.023, 0.029, 0.0300, 0.0, "chest"),
    (0.076, -0.005, 0.026, 0.029, 0.0362, 0.05, "collar"),    # 胸上端。顎下が乗る
    # 喉〜顎: 首は見えない。胸→襟→喉→顎と幅が連続して広がる
    # 頭は前へ倒す(設定画は頭の重さを首で支えるのが面倒そうな姿勢)。
    # throat から上へ行くほど中心を前(-y)へずらす
    (0.080, -0.011, 0.029, 0.031, 0.0405, 0.15, "throat"),
    # 口の帯(jaw〜lip)は**デカールのへの字口(z 0.0904)と重なる高さ**に置く
    (0.0875, -0.0140, 0.0334, 0.036, 0.0420, 0.30, "jaw"),    # 口線の下=下顎の上端
    (0.0910, -0.0158, 0.0336, 0.036, 0.0405, 0.35, "lip"),    # 口の帯の上端
    (0.0940, -0.0175, 0.0332, 0.0375, 0.0392, 0.40, "mouth"),  # 上唇。後縁+0.022=項の谷
    (0.0985, -0.0174, 0.0356, 0.045, 0.0380, 0.48, "cheek"),   # 目の下端
    (0.1056, -0.0173, 0.0361, 0.0505, 0.0400, 0.52, "snout_eye"),  # 目の高さ=最大幅
    # 頭頂へ: 設定画は緩やかに絞る(0.0355 → 0.029 → 0.0235 → 0.015)
    (0.1126, -0.0232, 0.0288, 0.0440, 0.0355, 0.50, "brow"),
    (0.1196, -0.0196, 0.0273, 0.0360, 0.0276, 0.35, "forehead"),
    (0.1249, -0.0155, 0.0239, 0.0255, 0.0225, 0.20, "crown"),
    (0.128, -0.0142, 0.014, 0.014, 0.0130, 0.10, "top"),
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
# 下顎の蝶番(耳の下)。ここを支点に下顎メッシュが回る
JAW_HINGE = (0.0, +0.006, 0.082)
# あくびは顎ボーンで下顔面を回す(口腔の見た目は顔アトラスのコマが担う)


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
    """頭ケージの顔面に意味論的な島(目×2)を切る。cage を書き換える。"""
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

    # 口の 3D スリットは作らない。閉口時に「描いたへの字口」と二重に見える
    # だけでなく、幅 0.8mm/深さ 1.2mm の細い溝は自動ウェイト(bone heat)を
    # 壊した(取りこぼしが 210 → 2,433 頂点。溝の内側からボーンを見通せない)。
    # あくびの開口は、口の中のメッシュを別に持つ方式で作り直す(次工程)
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
            length: float = 0.010, radius: float = 0.0034,
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
            # 肩から自然に垂れ、肘で細くなり、小さな手が接地する。前(-y)への
            # 張り出しを抑えて体の側面に沿わせる。
            # **外端(肘 x + 半径)が腹の半幅 0.0405 を超えないようにする** ――
            # 以前は 0.0454 で、正面で腕が胴のシルエットからはみ出し
            # 「身体から独立した柱」に見えていた。
            # 付け根は胴の表面(半幅0.031)より内側から出す(肩を回したときに
            # 胴との間に隙間が開かないように)
            Vector((0.020 * side, -0.010, 0.060)),  # 肩の根(胴の中)
            Vector((0.026 * side, -0.012, 0.057)),  # 肩
            Vector((0.030 * side, -0.018, 0.046)),  # 上腕
            Vector((0.032 * side, -0.023, 0.034)),  # 肘(最も外。外端 0.0412)
            Vector((0.030 * side, -0.028, 0.021)),  # 前腕
            Vector((0.028 * side, -0.032, 0.011)),  # 手首
            Vector((0.026 * side, -0.035, 0.008)),  # 手
        ]
        arm = C.curve_tube(f"{NAME}_arm{side:+.0f}", pts,
                           [0.0130, 0.0124, 0.0116, 0.0106, 0.0092, 0.0078, 0.0066])
        out.append(arm)
        # 掌は小さく、指3本を独立させる(平たい水かきに見せない)
        palm = (0.026 * side, -0.038, 0.006)
        out.append(C.uv_sphere(f"{NAME}_hand{side:+.0f}", palm, 0.0066,
                               segments=10, rings=7, scale=(1.0, 1.1, 0.6)))
        out += _digits(f"{NAME}_hand{side:+.0f}", (0.026 * side, -0.042, 0.004),
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
    # 設定画実測(全高 0.140m 換算): 腰の外端 ±43mm / 後足の外端 ±47mm。
    # 以前は腿 ±53mm・後足 ±69mm で、正面から見ると「がに股で踏ん張る蛙」
    # だった(設定画は膝をたたんで胴の脇に寄せた座り姿)
    out = []
    for side in (-1.0, 1.0):
        thigh_c = (0.030 * side, +0.016, 0.028)
        knee_dir = (0.0, -0.034, -0.020)  # 尻上(胴の中)→膝前下
        thigh = _egg(f"{NAME}_thigh{side:+.0f}", thigh_c, knee_dir,
                     r_side=0.0135, r_across=0.025, r_along=0.032, taper=0.50)
        out.append(thigh)
        knee = Vector((0.032 * side, -0.010, 0.014))
        ankle = Vector((0.035 * side, -0.011, 0.010))
        toes = Vector((0.038 * side, -0.016, 0.009))
        shin = C.curve_tube(f"{NAME}_shin{side:+.0f}", [Vector(thigh_c), knee, ankle, toes],
                            [0.014, 0.012, 0.0095, 0.0085])
        out.append(shin)
        sole = (0.034 * side, -0.018, 0.006)
        out.append(C.uv_sphere(f"{NAME}_foot{side:+.0f}", sole, 0.0085,
                               segments=10, rings=7, scale=(1.0, 1.1, 0.6)))
        out += _digits(f"{NAME}_foot{side:+.0f}", (0.037 * side, -0.024, 0.004),
                       forward=(0.42 * side, -1.0, 0.0), spread_axis=(0, 0, 1))
    return out


def build_tail() -> bpy.types.Object:
    """尾。設定画の実測(全高 0.140m 換算):

    ・後ろ端 y≈+0.072 / 横端 x≈-0.074 / 渦の穴は直径 15mm
    ・正面図でも背面図でも渦が「渦として」見える ―― つまり渦の面は
      体の横でも真後ろでもなく、**斜め**を向いている(handbook 1-34。
      三面図は整合した投影ではないので、面ごとに役割を割り当てる:
      側面=渦の高さ、正面/背面=横への張り出し)
    ・根元は胴ほど太くない(r0.018)。長く伸ばさず腰のすぐ後ろで巻く
    """
    ctr = Vector((-0.056, 0.078, 0.0335))
    n = Vector((0.70, 0.71, 0.0)).normalized()    # 渦の面の法線
    e_up = Vector((0.0, 0.0, 1.0))
    e_side = n.cross(e_up).normalized()           # 面内のもう1軸
    # 渦: 外側から内側へ 1.15 周。半径 0.0155 → 0.0035
    spiral = []
    spiral_r = []
    turns, steps = 1.15, 11
    for i in range(steps + 1):
        t = i / steps
        ang = math.radians(-118.0) + math.tau * turns * t
        r = 0.0172 * (1.0 - t) + 0.0040 * t
        spiral.append(ctr + (e_side * math.cos(ang) + e_up * math.sin(ang)) * r)
        spiral_r.append(0.0068 * (1.0 - t) + 0.0017 * t)
    pts = [
        Vector((0.000, +0.030, 0.023)),   # 腰の中(骨盤ループに埋まる)
        Vector((-0.012, +0.055, 0.017)),  # 付け根。ここから横へ振り出す
        Vector((-0.030, +0.075, 0.013)),  # 床を這う
        Vector((-0.048, +0.086, 0.013)),
        Vector((-0.060, +0.086, 0.017)),  # 立ち上がり
    ] + spiral
    radii = [0.019, 0.0170, 0.0142, 0.0112, 0.0088] + spiral_r
    return C.curve_tube(f"{NAME}_tail", pts, radii)


# 背の鱗板(はんてん状の背びれ)。設定画の**背面図**が正体を教える ――
# 背骨の正中を、淡い涙形の板が一列に並んで下りていく。側面図では同じ板を
# 真横から見るので、体色の「めくれた花弁」が輪郭に並ぶ(上面が明るく、
# 側面と縁は暗い)。v3 までは薄い1枚の膜(strip+Solidify)だったので、
# 背面から見ると**縦に立った刃**になり、設定画の「淡い連なり」が出なかった。
#
# 背骨線(y, z)。頭頂から項・背中・腰を通って尾の付け根の上面まで
SPINE_LINE = [
    (-0.014, 0.128), (0.000, 0.129), (0.012, 0.1255), (0.019, 0.115),
    (0.0215, 0.104), (0.0215, 0.093), (0.023, 0.084), (0.025, 0.076),
    (0.028, 0.069), (0.033, 0.061), (0.039, 0.053), (0.044, 0.045),
    (0.050, 0.037), (0.056, 0.0285), (0.058, 0.024),
]
# (背骨線に沿った弧長 s, 半幅w, 半長l, 突出h)。s は背面図で実測した
# 鱗板の高さ z を背骨線上へ落として求めた。突出は側面図の背側輪郭の
# うねり(±5mm)に合わせる ―― 以前の最大 24mm は「別の生き物の背びれ」
SCUTES = [
    (0.0000, 0.0054, 0.0062, 0.0050),
    (0.0141, 0.0048, 0.0068, 0.0042),
    (0.0264, 0.0055, 0.0080, 0.0085),
    (0.0405, 0.0062, 0.0090, 0.0105),
    (0.0567, 0.0064, 0.0096, 0.0110),
    (0.0737, 0.0061, 0.0094, 0.0098),
    (0.0881, 0.0056, 0.0090, 0.0086),
    (0.1057, 0.0050, 0.0080, 0.0082),
    (0.1188, 0.0044, 0.0072, 0.0064),
    (0.1322, 0.0038, 0.0060, 0.0048),
    (0.1406, 0.0031, 0.0050, 0.0036),
]
# 尾へ続く2枚(尾は横へ振り出すので背骨線ではなく尾の中心線に乗せる)
TAIL_SCUTES = [
    (Vector((-0.012, 0.0550, 0.0170)), Vector((0.0, 0.62, 0.78)), 0.0021, 0.0046, 0.0026),
    (Vector((-0.030, 0.0750, 0.0130)), Vector((0.0, 0.42, 0.91)), 0.0017, 0.0040, 0.0022),
]


def _spine_at(s: float):
    """背骨線の弧長 s における (点, 接線, 外向き法線)。すべて yz 平面。"""
    pts = [Vector((0.0, y, z)) for y, z in SPINE_LINE]
    acc = 0.0
    for i in range(len(pts) - 1):
        seg = (pts[i + 1] - pts[i]).length
        if acc + seg >= s or i == len(pts) - 2:
            t = (s - acc) / seg if seg > 0 else 0.0
            p = pts[i].lerp(pts[i + 1], t)
            tan = (pts[i + 1] - pts[i]).normalized()
            nrm = Vector((0.0, -tan.z, tan.y))   # 体の外側
            return p, tan, nrm
        acc += seg
    return pts[-1], Vector((0, 1, 0)), Vector((0, 0, 1))


def _scute(name: str, center, tangent, normal, w: float, l: float, h: float
           ) -> bpy.types.Object:
    """涙形の板1枚。中心を背骨線に置き、外向きに h だけ出て、同じだけ
    体へ沈む(浮いた板にならない)。後ろへ向かって細くなる。"""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
    ex = Vector((1.0, 0.0, 0.0))
    for v in bm.verts:
        t = (v.co.z + 1.0) * 0.5          # 0=前端, 1=後端
        f = 1.0 - 0.55 * t * t            # 後ろへ絞る涙形
        v.co = (Vector(center) + ex * (v.co.x * w * f)
                + Vector(normal) * (v.co.y * h * f)
                + Vector(tangent) * (v.co.z * l))
    bm.to_mesh(mesh)
    bm.free()
    C.activate(obj)
    bpy.ops.object.shade_smooth()
    return obj


_scute_frames_cache: list | None = None


def scute_frames() -> list:
    """鱗板1枚ぶんの座標系 (中心, 接線, 外向き, w, l, h)。
    造形(build_scutes)と塗り(body_color)が**同じ表**を見るようにする ――
    別々に座標を書くと、少し動かしたときに塗りだけ置き去りになる。"""
    global _scute_frames_cache
    if _scute_frames_cache is None:
        out = []
        for (s, w, l, h) in SCUTES:
            p, tan, nrm = _spine_at(s)
            out.append((p, tan, nrm, w, l, h))
        for (p, nrm, w, l, h) in TAIL_SCUTES:
            n = Vector(nrm).normalized()
            out.append((Vector(p), Vector((0.0, n.z, -n.y)), n, w, l, h))
        _scute_frames_cache = out
    return _scute_frames_cache


def build_scutes() -> list[bpy.types.Object]:
    """背の鱗板一式(胴 11 枚 + 尾 2 枚)。"""
    return [_scute(f"{NAME}_scute{i}", c, tan, nrm, w, l, h)
            for i, (c, tan, nrm, w, l, h) in enumerate(scute_frames())]


def build_blockout() -> dict:
    """ブロックアウト一式を作って返す。
    返り値: {"cage": ローポリケージ, "body": 丸めた胴+頭, "extras": [四肢・尾・背びれ]}
    """
    cage, body = build_body_cage()
    extras = build_arms() + build_legs() + [build_tail()] + build_scutes()
    clay = C.make_material(f"{NAME}_clay", CLAY, roughness=0.6)
    for obj in [body] + extras:
        C.assign_material(obj, clay)
    C.assign_material(cage, clay)
    return {"cage": cage, "body": body, "extras": extras}


# ------------------------------------------------------------------- 塗り
# 顔のアイデンティティ(半目・鼻孔・への字口)と全身の斑点は 2D が担当する。
# デカールは tools/akubitokage_decal.py が設定画の三面図から直接生成した
# 3枚の PNG(front/side/back)で、法線の向きで混ぜる(トライプラナー投影)。
import json as _json
import os as _os

_ROOT = _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
DECAL_DIR = _os.path.join(_ROOT, "design", "characters", "akubitokage", "generated")
DECAL_JSON = _os.path.join(DECAL_DIR, "akubitokage-decal.json")
# パレット。設定画の**カラーパレット(色み)**と**絵の中の実測(明度)**を
# 分けて使う(handbook 4-63)。絵の実測(全身の基調 / 暗部 / 斑点 / 鱗板 /
# おなか)は sRGB で
#     基調(113,100,118) 暗部(76,70,84) 斑点(145,131,130)
#     鱗板(154,133,137) おなか(170,151,158)
# なので、淡色は基調の 1.5〜1.8 倍で、明るくなるほど**青が抜けて暖かく**なる。
#
# ダンジョンの灯りは寒色なので、設定画の色をそのまま置くと実機で青へ転ぶ
# (handbook 1-38)。実測: アルベドを R=B の中性にしていたとき、実機の
# R-B は -26 で、近隣のモンスター(-9〜-18)より明らかに青かった。
# main の R を B より上げて相殺する ―― 絵としては暖色だが、実機では紫に出る。
SHEET = {"main": (0.375, 0.311, 0.332)}
# 基調に対する倍率(設定画の実測比)。上書きではなく**足す**(handbook 2-17)
BELLY_MUL = (1.82, 1.78, 1.68)
SCUTE_MUL = (1.98, 1.88, 1.68)
DARK_MUL = (0.67, 0.70, 0.71)        # 暗部(谷・鱗板の外側の影)
# おなかの淡色。設定画正面図の実測: 幅 22.7mm・高さ 27.2mm・中心 z=35.9mm
BELLY_CENTER = Vector((0.0, -0.030, 0.0345))
BELLY_RADII = Vector((0.0135, 0.020, 0.0175))
_decal_cache: dict = {}


def _decal(name: str):
    if name not in _decal_cache:
        import numpy as np
        meta = _json.load(open(DECAL_JSON))
        img = bpy.data.images.load(_os.path.join(DECAL_DIR, f"akubitokage-decal-{name}.png"))
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        _decal_cache[name] = (px.reshape(h, w, 4)[::-1], meta)
    return _decal_cache[name]


def decal_sample(name: str, u: float, z: float):
    """デカールを双一次補間で引く。u は front/back なら x、side なら y。"""
    dec, meta = _decal(name)
    h, w = dec.shape[:2]
    u0 = meta["y"][0] if name.startswith("side") else meta["x"][0]
    fx = (u - u0) * meta["ppu"] - 0.5
    fy = (meta["z"][1] - z) * meta["ppu"] - 0.5
    x0, y0 = math.floor(fx), math.floor(fy)
    if x0 < 0 or y0 < 0 or x0 + 1 >= w or y0 + 1 >= h:
        return (0.0, 0.0, 0.0, 0.0)
    tx, ty = fx - x0, fy - y0
    p = (dec[y0, x0] * (1 - tx) + dec[y0, x0 + 1] * tx) * (1 - ty) \
        + (dec[y0 + 1, x0] * (1 - tx) + dec[y0 + 1, x0 + 1] * tx) * ty
    return (float(p[0]), float(p[1]), float(p[2]), float(p[3]))


DECAL_SHARPNESS = 2.0      # 法線の重みの指数。大きいほど面ごとに1枚へ寄る
DECAL_FLOOR_Z = 0.008      # これより下は地面の影を拾うので貼らない
# 顔アトラスのコマ。正面と側面を差し替える(背面は共通)。
# 側面も切り替えるのは、あくびで口の中が横からも見えるようにするため
FACE_FRAMES = (("front", "side"), ("front-half", "side-half"),
               ("front-yawn", "side-yawn"))


def _surface_depth(p: Vector) -> float:
    """点 p が頭・胴のケージ外面からどれだけ内側にあるか(m)。外面上で 0。
    口のスリットの内側(あくびで見える口の中)を判定するのに使う。"""
    rows = BODY_LOOPS
    z = p.z
    if z <= rows[0][0] or z >= rows[-1][0]:
        return 0.0
    cy = rf = rb = rs = sn = 0.0
    for r0, r1 in zip(rows, rows[1:]):
        if r0[0] <= z <= r1[0]:
            t = (z - r0[0]) / (r1[0] - r0[0]) if r1[0] > r0[0] else 0.0
            cy, rf, rb, rs, sn = (r0[i] + (r1[i] - r0[i]) * t for i in range(1, 6))
            break
    k = RADIUS_COMP
    a = math.atan2(p.y - cy, p.x)
    c, s_ = math.cos(a), math.sin(a)
    ry = rf if s_ < 0 else rb
    xs = 1.0 - sn * (-s_) if s_ < 0 else 1.0
    surf = Vector((rs * k * c * xs, ry * k * s_, 0.0))
    return surf.length - Vector((p.x, p.y - cy, 0.0)).length


def _scute_paint(p: Vector, n: Vector) -> tuple[float, float]:
    """(鱗板の上面らしさ, 鱗板の外の谷の影) を返す。

    造形と同じ `scute_frames()` の座標系で測るので、板を動かしても塗りが
    置き去りにならない。板の**上面を明るく、板と板の間を暗く**する
    (handbook 2-15 の3段。輪郭線は塗らない ―― 3-7)。
    """
    top = shade = 0.0
    for (c, tan, nrm, w, l, h) in scute_frames():
        d = p - c
        if d.length_squared > 0.00058:      # 0.024m 以内だけ調べる
            continue
        cz = d.dot(tan) / l
        t = min(1.0, max(0.0, (cz + 1.0) * 0.5))
        f = 1.0 - 0.55 * t * t
        a = d.x / (w * f)
        b = d.dot(nrm) / (h * f)
        q = math.sqrt(a * a + cz * cz)
        if q < 1.20:
            # 上面だけを明るくする。側面(法線が nrm と直交)は体色のまま ――
            # 設定画の側面図では鱗板は「体色のめくれた花弁」に見える
            face_up = 0.15 + 0.85 * max(0.0, n.dot(nrm)) ** 0.5
            outer = min(1.0, max(0.0, (b + 0.20) / 0.45))
            top = max(top, min(1.0, (1.20 - q) / 0.30) * outer * face_up)
        if 1.05 < q < 1.90:
            shade = max(shade, min(1.0, (1.90 - q) / 0.55)
                        * min(1.0, max(0.0, (b + 0.9) / 0.7)))
    return top, shade * (1.0 - top)


def body_color(p: Vector, n: Vector, frame: int = 0):
    """bake_albedo 用の手描き Base Color。
    ① 塊の上下階調 ② おなかの淡色 ③ 背の鱗板(上面=明/谷=暗)
    ④ 設定画をなぞった3面デカール(顔の線画・斑点)。
    frame は顔アトラスのコマ(0=通常, 1=あくび予備, 2=大あくび)。"""
    base = SHEET["main"]
    # ① 上下の階調。設定画は頭が明るく足元が暗い(正面 L: 顔109 / 胸90 / 足81)。
    #    位置の連続関数で作る ―― 面法線で作ると面の境目で階段になる(4-16)
    g = min(1.0, max(0.0, (p.z - 0.006) / 0.118))
    k = 0.90 + 0.19 * g * g
    base = (base[0] * k, base[1] * k, base[2] * k)
    # ② おなかの淡色。前を向く面だけ、縦長の楕円体の中で柔らかく
    d = p - BELLY_CENTER
    r = math.sqrt((d.x / BELLY_RADII.x) ** 2 + (d.y / BELLY_RADII.y) ** 2
                  + (d.z / BELLY_RADII.z) ** 2)
    if n.y < -0.1 and r < 1.0:
        t = min(1.0, max(0.0, (1.0 - r) / 0.42))
        t = t * t * (3 - 2 * t) * min(1.0, (-n.y - 0.1) / 0.35)
        base = tuple(base[i] * (1.0 + (BELLY_MUL[i] - 1.0) * t) for i in range(3))
    # ③ 背の鱗板
    top, shade = _scute_paint(p, n)
    if top > 0.002:
        base = tuple(base[i] * (1.0 + (SCUTE_MUL[i] - 1.0) * top) for i in range(3))
    if shade > 0.002:
        base = tuple(base[i] * (1.0 + (DARK_MUL[i] - 1.0) * shade * 0.75)
                     for i in range(3))
    # ④ デカール(顔の線画・斑点)
    if p.z < DECAL_FLOOR_Z:
        return base
    wf = max(0.0, -n.y) ** DECAL_SHARPNESS
    wb = max(0.0, n.y) ** DECAL_SHARPNESS
    ws = abs(n.x) ** DECAL_SHARPNESS
    tot = wf + wb + ws
    if tot < 1e-6:
        return base
    front_name, side_name = FACE_FRAMES[frame]
    for name, w, u in ((front_name, wf, p.x), ("back", wb, p.x), (side_name, ws, p.y)):
        w /= tot
        if w < 0.02:
            continue
        cr, cg, cb, a = decal_sample(name, u, p.z)
        a *= w
        if a > 0.004:
            base = (base[0] + (cr - base[0]) * a,
                    base[1] + (cg - base[1]) * a,
                    base[2] + (cb - base[2]) * a)
    return base


def texture_blockout(parts: dict, size: int = 3072) -> None:
    """ブロックアウトへ塗りを載せる。胴+頭は UV を切って bake_albedo、四肢・尾・
    背びれにも同じ塗りを焼く(斑点が胴だけで途切れないように)。

    size=3072 で顔の密度は約 2.8 テクセル/mm(1536 では 1.4 で、設定画の
    眼裂が潰れた)。本番化のときは顔だけ別マテリアルにして下げる。"""
    body = parts["body"]
    C.smart_uv(body)
    img = C.bake_albedo(body, body_color, size=size, name=f"{NAME}_albedo")
    C.assign_material(body, C.make_textured_material(f"{NAME}_skin", img, roughness=0.8))
    for o in parts["extras"]:
        lo, hi = C.bounds([o])
        ext = max((hi - lo).x, (hi - lo).y, (hi - lo).z)
        px = 128 if ext < 0.02 else (256 if ext < 0.05 else 512)
        C.smart_uv(o)
        im = C.bake_albedo(o, body_color, size=px, name=f"{o.name}_albedo")
        C.assign_material(o, C.make_textured_material(f"{o.name}_mat", im, roughness=0.8))


# ------------------------------------------------------------------- 本番モデル
# ブロックアウト(別メッシュのまま)を1枚に統合し、三角形数を落として
# アーマチュアを付ける。voxel remesh は使わない ―― join しただけなので、
# 腕と胴の谷・顎下のくぼみといった負の空間はそのまま残る。
TARGET_TRIS = 5600          # v2(5,184)と同程度。ブロックアウトは 21,552
TEX_SIZE = 704              # 本体(顔以外)。予算 700KB のうち塗りは 360KB まで
FACE_TEX = 672              # 顔アトラス1コマぶん(3コマ横並びで 2016x672)
# 顔を本体から切り離す球。**頭全体ではなく前面だけ**にする(ガルドと同じ。
# 頭全体を1枚に取ると後頭部がタイルの大半を占めて顔の密度が半分になる)
FACE_ISLAND_C = (0.0, -0.028, 0.101)
FACE_ISLAND_R = 0.052        # 頬(±0.043)まで届く大きさが要る
FACE_ISLAND_MAX_Y = -0.004   # ここより後ろ(裏側)は顔に含めない
FACE_BOOST = 3.0

# 関節。v3 の実際の形状から拾った(BODY_LOOPS・build_arms・build_legs・build_tail)
JOINTS_HALF = {
    "hip": (0.000, 0.0090, 0.0285),      # 骨盤(尾・後脚の付け根)
    "chest": (0.000, -0.0010, 0.0700),   # 胸(前脚の付け根の高さ)
    "head": (0.000, -0.0170, 0.1000),    # 頭の中心
    "snout": (0.000, -0.0380, 0.0980),   # 鼻先。下顎の支点でもある
    "jaw": (0.000, -0.0420, 0.0860),     # 下顎の先(あくびで開く)
    "legF.L": (0.026, -0.0120, 0.0570),  # 肩
    "footF.L": (0.026, -0.0350, 0.0080),
    "legB.L": (0.030, 0.0160, 0.0280),   # 腿
    "footB.L": (0.034, -0.0180, 0.0090),
    # 尾: build_tail の中心線から7点を間引く(渦まで骨を通す)
    "tail1": (-0.012, 0.0550, 0.0170),
    "tail2": (-0.048, 0.0860, 0.0130),
    "tail3": (-0.063, 0.0762, 0.0142),
    "tail4": (-0.048, 0.0700, 0.0270),
    "tail5": (-0.054, 0.0757, 0.0380),
    "tail6": (-0.062, 0.0819, 0.0327),
    "tail7": (-0.055, 0.0768, 0.0255),
}
BONES_HALF = [
    ("hip", "chest"), ("chest", "head"), ("head", "snout"), ("snout", "jaw"),
    ("chest", "legF.L"), ("legF.L", "footF.L"),
    ("hip", "legB.L"), ("legB.L", "footB.L"),
    ("hip", "tail1"), ("tail1", "tail2"), ("tail2", "tail3"), ("tail3", "tail4"),
    ("tail4", "tail5"), ("tail5", "tail6"), ("tail6", "tail7"),
]
HEIGHT = 0.140              # 設定画の想定身長。最後に一様スケールで合わせる
# あくびの口は「顎ボーンの開き角 → 顔アトラスのコマ」で切り替える。
# 下顎を分離する方式(方式1)は口内が閉口時に漏れて棄却したので、
# 3Dの顎は頬・喉のふくらみだけを担い、口そのものは絵で開く
MOUTH_BONE = "snout-jaw"
MOUTH_OPEN_DEG = 60.0       # akubitokage_animations の attack の最大開き
# あくびの煙。設定画は三面図にも描かれているので常時出す。ひと房を大きさの
# 違う小さな球の集まりにして、輪郭を完全な円にしない(v2 から引き継ぎ)。
# 頭に剛体固定するので、頭を動かしても口元から離れない
# 設定画の煙は紙(L229)の上で L169 ―― 体(L84)の 2.0 倍でしかない。
# 以前は (0.75,0.70,0.82)+発光0.15 で、暗いダンジョンでは**画面で一番明るい
# もの**になり「頭に白い花が咲いている」ように見えていた。
# 輪郭線も外す(handbook 2-20: 付けない例外は半透明と発光が主のもの)。
# 位置は口の横から斜め後ろ上へ立ちのぼる一筋にして、頭の飾りに見せない
SMOKE_RGB = (0.54, 0.49, 0.60)
SMOKE_EMISSION = 0.035
# 房は2つ。球どうしは半径より近くに置いて1つの雲へ融かす(離すと
# 「ぶどうの房」になる)。頭の輪郭からは離す ―― 近いと 96px で
# 「耳あて」に見える
SMOKE_PUFFS = [
    (0.0632, -0.0262, 0.0975, 0.0078),
    (0.0690, -0.0206, 0.1030, 0.0062),
    (0.0662, -0.0140, 0.1078, 0.0046),
    (0.0596, 0.0078, 0.1215, 0.0064),
    (0.0648, 0.0134, 0.1262, 0.0048),
    (0.0620, 0.0188, 0.1300, 0.0034),
]


def build() -> tuple[list, bpy.types.Object]:
    """本番モデル(メッシュ+アーマチュア)を返す。"""
    parts = build_blockout()
    # 背の鱗板は体の外に半分出た小さな別体なので、自動ウェイト(bone heat)が
    # その頂点から胴の中のボーンを見通せず取りこぼす。背骨に沿って3区間へ
    # 明示的に固定する(鱗板自体は変形させる必要がない。handbook 3-41)
    pins = []
    seg: dict[str, list[tuple[bpy.types.Object, int]]] = {
        "scute_head": [], "scute_back": [], "scute_hip": []}
    for o in parts["extras"]:
        if "scute" not in o.name:
            continue
        for v in o.data.vertices:
            key = ("scute_head" if v.co.z > 0.098 else
                   "scute_back" if v.co.z > 0.045 else "scute_hip")
            seg[key].append((o, v.index))
    for name, items in seg.items():
        if not items:
            continue
        for o in {it[0] for it in items}:
            idx = [i for (oo, i) in items if oo is o]
            o.vertex_groups.new(name=name).add(idx, 1.0, "REPLACE")
        pins.append((name, {"scute_head": "chest-head",
                            "scute_back": "hip-chest",
                            "scute_hip": "hip-tail1"}[name]))
    # 煙はここでは**まだ join しない**。split_material_region は球の中の面を
    # すべてスロット1(顔)へ移してしまうので、口元の煙が顔アトラスの島に
    # 混ざり、顔の密度を食う。塗りを焼き終えてから3枚目のスロットとして
    # 合流させる(join は後続オブジェクトのマテリアルをスロットに足すので、
    # 煙の面だけが index 2 を指したまま残る)
    smoke_mat = C.make_material(f"{NAME}_smoke", SMOKE_RGB, roughness=0.5,
                                emission=SMOKE_EMISSION)
    smoke_mat["noOutline"] = True
    smoke = []
    for i, (x, y, z, r) in enumerate(SMOKE_PUFFS):
        puff = C.uv_sphere(f"{NAME}_smoke{i}", (x, y, z), r, segments=8, rings=6)
        C.assign_material(puff, smoke_mat)
        puff.vertex_groups.new(name="smoke_pin").add(
            [v.index for v in puff.data.vertices], 1.0, "REPLACE")
        smoke.append(puff)
    pins.append(("smoke_pin", "chest-head"))
    smoke_tris = C.tri_count(smoke)
    mesh = C.join([parts["body"]] + parts["extras"], NAME)
    bpy.data.objects.remove(parts["cage"], do_unlink=True)
    C.decimate_to(mesh, TARGET_TRIS - smoke_tris)
    # 設定画の身長へ一様スケール(ケージは圧縮テーマのぶん 0.134 で作ってある)。
    # 煙は頭より上へ出るので、**煙を含めない身体だけ**で倍率を決める
    lo, hi = C.bounds([mesh])
    scale = HEIGHT / (hi.z - lo.z)
    for v in mesh.data.vertices:
        v.co *= scale
    for puff in smoke:
        for v in puff.data.vertices:
            v.co *= scale
    joints = {k: Vector(v) * scale for k, v in C.mirrored(JOINTS_HALF).items()}
    # 塗りは decimate の後に焼く(UV を切り直すため)。デカールはモデル座標を
    # 使うので、スケール後の座標を元に戻してから引く
    inv = 1.0 / scale

    def color(p, n):
        return body_color(p * inv, n)

    # UV: 背中に模様がある四足姿勢なので赤道(z)でシームを引く。顔だけ
    # boost で独立した島に切り出し、専用アトラスへ移す(smart_uv では
    # 島が 276 に割れ、顔の密度が 0.75 テクセル/mm しか出なかった)
    smoke_mat_name = f"{NAME}_smoke"
    face_c = tuple(v * scale for v in FACE_ISLAND_C)
    face_r = FACE_ISLAND_R * scale
    face_max_y = FACE_ISLAND_MAX_Y * scale
    C.organic_uv(mesh, axis=2, boost=(face_c, face_r, FACE_BOOST, face_max_y))
    face_faces = C.split_material_region(mesh, face_c, face_r, max_y=face_max_y)
    # materials.clear() を挟むと面の material_index がスロットを失って
    # 顔の割り当てが消える。split_material_region が作った2つのスロットを
    # そのまま差し替える
    img = C.bake_albedo(mesh, color, size=TEX_SIZE, name=f"{NAME}_albedo",
                        material_index=0)
    skin = C.make_textured_material(f"{NAME}_skin", img, roughness=0.8)
    if face_faces:
        # 顔は 通常 / あくび予備 / 大あくび の3コマを横に並べたアトラスにする。
        # UV を 1/3 に縮めて左端のコマ(通常)を指し、エンジンが 1/3 ずつずらす
        frames = []
        for fi in range(len(FACE_FRAMES)):
            frames.append(C.bake_albedo(
                mesh, (lambda p, n, fi=fi: body_color(p * inv, n, fi)),
                size=FACE_TEX, name=f"{NAME}_face{fi}", material_index=1))
        atlas = C.atlas_horizontal(frames, f"{NAME}_face")
        uv = mesh.data.uv_layers.active.data
        for pol in mesh.data.polygons:
            if pol.material_index != 1:
                continue
            for li in pol.loop_indices:
                uv[li].uv.x /= len(FACE_FRAMES)
        face_mat = C.make_textured_material(f"{NAME}_face_mat", atlas, roughness=0.8)
        mesh.data.materials[0] = skin
        mesh.data.materials[1] = face_mat
        # エンジンの口切り替え用(glTF extras)。エンジンは mouthBone の
        # 「静止姿勢からの開き角」をそのままコマ番号へ量子化する。
        # クリップ側にカーブを二重に持たせない(アニメーションを直せば
        # 見た目も自動で追従する)
        mesh["mouthTiles"] = len(FACE_FRAMES)
        mesh["mouthMaterial"] = face_mat.name
        mesh["mouthBone"] = MOUTH_BONE
        mesh["mouthOpenDeg"] = MOUTH_OPEN_DEG
    else:
        mesh.data.materials.clear()
        mesh.data.materials.append(skin)
    body_h = hi.z * scale - lo.z * scale
    mesh = C.join([mesh] + smoke, NAME)
    armature = C.build_armature(NAME, joints, C.mirrored_bones(BONES_HALF), mesh, root="hip")
    for group, bone in pins:
        C.pin_weight_to_bone(mesh, group, bone)
    _check(mesh, body_h)
    return [mesh, armature], armature


def _check(mesh, body_h: float) -> None:
    lo, hi = C.bounds([mesh])
    w, d = hi.x - lo.x, hi.y - lo.y
    print(f"[{NAME}] 身長 {body_h:.3f}m(煙込み {hi.z - lo.z:.3f}m) "
          f"幅 {w:.3f}m 奥行き {d:.3f}m 三角形 {C.tri_count([mesh])}")
    print(f"[{NAME}] マテリアル {[m.name for m in mesh.data.materials]}")
    assert abs(body_h - HEIGHT) < 0.002, body_h
    assert lo.z > -0.002, lo.z
    assert len(mesh.data.materials) == 3, [m.name for m in mesh.data.materials]
    assert C.tri_count([mesh]) <= TARGET_TRIS, C.tri_count([mesh])
