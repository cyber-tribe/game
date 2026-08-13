> **実装済み。** `tools/models/monsters.py`に`build_mizukagami()`/
> `mizukagami_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py mizukagami`で
> `public/models/mizukagami.glb`を書き出し)。
>
> **骨格は計画書どおり`madoromi`と同じ関節構成(root-stem-capbase-captop)を
> そのまま流用した。** 未決事項にあった「アーマチュアの流用可否」は、
> 座標の差し替えだけで問題なく流用できることを確認した。傘を大きく
> 広げるのではなく、寸胴な壺のような輪郭(root/stem/capbaseの半径を
> 近い値にして丸みを持たせ、captopでわずかに絞る)にし、mimic AIらしく
> 道具に紛れ込む目立たない形にした。
>
> **「滝つぼの水面に映る古い姿」の由来を、頂上に張った鏡面で表現した。**
> `captop`の直上に扁平な`uv_sphere`を重ね、中心からの距離に応じて
> 明暗2色を交互に塗り分けて同心円の波紋を描いた
> (`assign_materials_by_region`をmadoromiの傘の斑点配置と同じ
> 考え方で、円盤の半径方向に応用した)。目・口は縁の下からわずかに
> のぞく程度に抑え、息をひそめる擬態らしさを残した。
>
> **配色は計画書どおり、涙と滝つぼを思わせる沈んだ青・藍色系。**
> 鏡面だけは水面らしく明るい青灰色の濃淡にした。
>
> **三角形数は当初1,360と目安を下回ったため、胴体の`subsurf`を2から
> 3に、鏡面の`uv_sphere`の分割数(segments/rings)を増やして波紋の
> 解像度を上げ、3,984に収めた**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`madoromi_animations()`を流用せず、新規に
> キーフレームを書いた。** `idle`は道具のふりをしてほとんど動かず、
> `attack`は鏡面ごと勢いよく振り下ろす動き、`die`は水面が波紋となって
> 崩れる動きにした(クリップ構成・ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/mizukagami.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(56個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`mizukagami.model`を`"madoromi"`→
> `"mizukagami"`に変更した。** `mizukagami`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`mizukagami`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1183/1183)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# みずかがみ(mizukagami)の3Dモデル

現在は`madoromi`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

滝つぼの水面に映る古い姿。道具に化けて息をひそめる、この地方ならではの水辺の擬態。

AI挙動(`mimic`)に合わせ、擬態対象(タル/アイテム)に紛れ込む、目立つ特徴を抑えた形にする。
配色は第5地方(なみだの滝つぼ)のテーマに合わせ、
涙と滝つぼを思わせる、沈んだ青・藍色系を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`madoromi`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`madoromi`モデルを基準に、ステータス(maxHp 34)に
  見合う大きさに調整する。

## アニメーション

既存5クリップ(待機・歩行・攻撃・被弾・消滅)の構成をそのまま流用する。
新規モーション制作は増やさない(アーマチュア+自動ウェイト→キーフレームの
既存パイプラインをそのまま適用する)。

## 対象外

- 造形の最終決定(実装時に`tools/models/`のスクリプトで確定させる)
- `plan/equipped-weapon-visual.md`のような装備の重ね表現(このモンスターには該当しない)

## 未決事項

- 最終的な三角形数・関節配置の微調整
- 既存`madoromi`のアーマチュアをそのまま流用できるか、一部調整が要るか
