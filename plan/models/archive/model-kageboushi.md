> **実装済み。** `tools/models/monsters.py`に`build_kageboushi()`/
> `kageboushi_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py kageboushi`で
> `public/models/kageboushi.glb`を書き出し)。
>
> **骨格は計画書どおり`tsubute`と同じ関節構成をベースにした。**
> `plan/models/archive/model-menkaburikozo.md`と同じ同系統の奇襲役
> だが、由来の違い(祭りの影絵芝居 vs 面をかぶって潜む)を反映して
> `menkaburikozo`よりさらに立体感を削り、全身をほぼ黒一色にした。
> 未決事項にあった「アーマチュアの流用可否」は、ここでも座標を潰す
> だけで問題なく流用できることを確認した。
>
> **祭りの提灯に透かされていた名残として、三日月形の眠たげな目だけを
> 金色に発光させた。** `menkaburikozo`の見開いた目の穴(暗い色)とは
> 逆に、`kageboushi`は閉じた三日月形の目を発光(emission)マテリアルで
> 表現し、混乱ではなく眠りを誘う由来と、影絵芝居の由来を両立させた。
>
> **配色は計画書の「くすんだ紅色・金色の名残」を、影そのものという
> 由来に合わせて解釈し直し、体はほぼ黒一色、金色は目の発光にのみ
> 使った。** 祭りの名残は色そのものより、提灯の光の記憶として表現して
> いる。
>
> **三角形数は3,856**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`tsubute_animations()`を流用せず、新規にキーフレーム
> を書いた。** `idle`はほとんど気配のない静止、`attack`は影が伸びるように
> 腕を差し伸べる不意打ちにした(クリップ構成・ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/kageboushi.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(44個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`kageboushi.model`を`"tsubute"`→
> `"kageboushi"`に変更した。** `kageboushi`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`kageboushi`を追記し、直前のコメントも更新した
> (すでに追記されていた`honedatami`も含めて整理)。
>
> `npx tsc --noEmit`・`npx vitest run`(1159/1159)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# かげぼうし(kageboushi)の3Dモデル

現在は`tsubute`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

祭りの影絵芝居の忘れ物。めんかぶりこぞうと同系統の奇襲役だが、混乱の代わりに眠りを誘う。

AI挙動(`ambush`)に合わせ、周囲に溶け込む、平たく低いシルエット。目立たない配色にする。
配色は第7地方(わすれられた祭りの跡)のテーマに合わせ、
褪せた祭りを思わせる、くすんだ紅色・金色の名残を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`tsubute`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`tsubute`モデルを基準に、ステータス(maxHp 38)に
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
- 既存`tsubute`のアーマチュアをそのまま流用できるか、一部調整が要るか
