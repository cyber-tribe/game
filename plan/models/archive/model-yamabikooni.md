> **実装済み。** `tools/models/monsters.py`に`build_yamabikooni()`/
> `yamabikooni_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py yamabikooni`で
> `public/models/yamabikooni.glb`を書き出し)。
>
> **骨格は計画書どおり`honegarami`と同じ人型骨組み(hip/chest/neck/head/
> crown、shoulder/elbow/hand、thigh/knee/foot)をベースにした。**
> 未決事項にあった「アーマチュアの流用可否」は、関節名・ボーン構成を
> そのまま使い、座標・太さだけを差し替える形で問題なく流用できることを
> 確認した。`honegarami`の「骨が浮いた細い体」とは正反対の方向へ振り、
> 胴・肩を横に張り出させ、四肢の半径をおよそ2倍まで太くして
> 「がっしりした体格」にした。
>
> **鬼らしさを新規パーツで足した。** 頭頂に角を2本(`cone()`はZ軸沿いにしか
> 作れないため回転はかけず、根元を頭頂の高さに置いて真上へ伸ばすだけの
> 配置)、そして「声そのものが実体化した」という由来にちなみ、
> `honegarami`の暗い眼窩とは逆に発光する目(オレンジの emission
> マテリアル)を追加した。
>
> **配色は計画書どおり岩肌の灰色と乾いた土色。**
> `assign_materials_by_region`で腰まわりの高さ(`0.28 < z < 0.40`)だけを
> 乾いた土色にした。この高さの帯には手首(`hand.L`のz座標が範囲内)も
> かかり、結果的に腰巻+籠手のような配色になった(意図と異なる副作用
> だったが、見た目として自然だったのでそのまま採用した)。
>
> **三角形数は3,988**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`honegarami_animations()`の構成(idle/walk/attack/
> hit/dieの5クリップ、ボーン名も同一)を踏襲しつつ、新規にキーフレームを
> 書いた。** 力強さを出すため、`attack`は左右両腕を使う大振りの一撃に、
> `walk`は重心を落とした足取りに変えている。
>
> **見た目の確認は`tools/preview/yamabikooni.png`のCyclesレンダーで行った。**
> 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(36個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`yamabikooni.model`を`"honegarami"`→
> `"yamabikooni"`に変更した。** `yamabikooni`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`yamabikooni`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1133/1133)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# やまびこおに(yamabikooni)の3Dモデル

現在は`honegarami`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

声そのものが実体化した鬼。やまびこぎつねの呼び声に応じて現れる、尾根の奥にひそむ力の強い個体。

AI挙動(`melee`)に合わせ、がっしりした体格で、正面から迫る力強いシルエットにする。
配色は第6地方(こだまの尾根)のテーマに合わせ、
吹きさらしの尾根らしい、岩肌の灰色と乾いた土色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`honegarami`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`honegarami`モデルを基準に、ステータス(maxHp 52)に
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
- 既存`honegarami`のアーマチュアをそのまま流用できるか、一部調整が要るか
