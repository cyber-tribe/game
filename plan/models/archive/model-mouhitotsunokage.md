> **実装済み。** `tools/models/monsters.py`に`build_mouhitotsunokage()`/
> `mouhitotsunokage_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py mouhitotsunokage`で
> `public/models/mouhitotsunokage.glb`を書き出し)。
>
> **骨格は計画書どおり`madoromi`と同じ関節構成
> (root-stem-capbase-captop)をベースにした。** 未決事項にあった
> 「アーマチュアの流用可否」は、座標の差し替えだけで問題なく流用
> できることを確認した。`yumemayoinokage`のフード状ドームとは違い、
> 寸胴で角ばった道具箱のような輪郭にし、頂上に留め具のような小さな
> 突起を残した。
>
> **各地方の記憶の名残として、道具箱の側面に淡い色の欠片を6つ散らした**
> (`yumemayoinokage`の傘の欠片と同じ手法だが、位置を箱の側面帯に
> 変えて見た目を差別化した)。目は道具に紛れ込む影らしく、半分沈んだ
> 生気の薄いものにした。
>
> **配色は計画書どおり、第八地方(めざめの前庭)の第一〜第七地方の色が
> 淡く混ざり合った、統一感のない配色。**
>
> **三角形数は1,996**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`madoromi_animations()`を流用せず、新規に
> キーフレームを書いた。** `idle`は道具のふりをしてほとんど動かず、
> `die`は影がほどけるように輪郭を保てず崩れる動きにした(クリップ
> 構成・ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/mouhitotsunokage.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(75個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`mouhitotsunokage.model`を`"madoromi"`→
> `"mouhitotsunokage"`に変更した。** `mouhitotsunokage`は60種化
> ロースター拡張(`plan/game/archive/monster-roster-expansion-species.md`)
> 由来の種族(30種のうち最後の1種)でもあるため、
> `tests/monster-roster-expansion-species.test.ts`の`KNOWN_MODEL_IDS`に
> `mouhitotsunokage`を追記し、直前のコメントも更新した。これで60種化
> ロースター拡張の30種すべてに専用モデルが揃った。
>
> `npx tsc --noEmit`・`npx vitest run`(1245/1245)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# もうひとつのかげ(mouhitotsunokage)の3Dモデル

現在は`madoromi`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

ゆめまよいの影のもう一つの姿。タルではなく、落ちている道具に擬態する。

AI挙動(`mimic`)に合わせ、擬態対象(タル/アイテム)に紛れ込む、目立つ特徴を抑えた形にする。
配色は第8地方(めざめの前庭)のテーマに合わせ、
第一〜第七地方の色が淡く混ざり合った、統一感のない配色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`madoromi`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`madoromi`モデルを基準に、ステータス(maxHp 48)に
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
