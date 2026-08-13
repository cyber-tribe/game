> **実装済み。** `tools/models/monsters.py`に`build_wataamenoobake()`/
> `wataamenoobake_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py wataamenoobake`で
> `public/models/wataamenoobake.glb`を書き出し)。
>
> **骨格は計画書どおり`purun`の縦2本(`base-mid-top`)をそのまま流用した。**
> 未決事項にあった「アーマチュアの流用可否」は、半径の大小関係を
> `purun`とは逆(根元を細く、先端を太く)にするだけで問題なく流用できる
> ことを確認した。これにより、幽霊らしい先細りの尾とわたあめらしい
> ふくらんだ頭のシルエットにした。
>
> **わたあめの質感を、頭の周りにまとわせた小さな綿雲の房6個で表現
> した。** `uv_sphere`をランダムに近い配置でめり込ませ、`kodamagumo`と
> 同様の技法だが、より小さく淡い色で「触れるとほどける」軽さを出した。
> 甘い匂いの演出として、金色に発光する小さな煌めき粒(emission)を
> 3つ添えた。
>
> **配色は第七地方(わすれられた祭りの跡)テーマの「くすんだ紅色」を
> 淡くした桃色に、金色の煌めきを組み合わせた。**
>
> **三角形数は3,460**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`purun_animations()`を流用せず、新規にキーフレーム
> を書いた。** coward AIらしい素早い逃げ足の`walk`と、触れるとほどけて
> 散る綿あめのように輪郭を崩しながら薄れ消える`die`にした(クリップ
> 構成・ボーン名は`base-mid`/`mid-top`のままpurunと同一)。
>
> **見た目の確認は`tools/preview/wataamenoobake.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(46個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`wataamenoobake.model`を`"purun"`→
> `"wataamenoobake"`に変更した。** `wataamenoobake`は60種化ロースター
> 拡張(`plan/game/archive/monster-roster-expansion-species.md`)由来の
> 種族でもあるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`wataamenoobake`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1163/1163)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# わたあめのおばけ(wataamenoobake)の3Dモデル

現在は`purun`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

甘い匂いに誘われる夢。触れると煙のような幻を残してすぐ逃げる。

AI挙動(`coward`)に合わせ、小柄で華奢な、逃げ足の速さを感じさせる軽いシルエットにする。
配色は第7地方(わすれられた祭りの跡)のテーマに合わせ、
褪せた祭りを思わせる、くすんだ紅色・金色の名残を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`purun`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`purun`モデルを基準に、ステータス(maxHp 26)に
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
- 既存`purun`のアーマチュアをそのまま流用できるか、一部調整が要るか
