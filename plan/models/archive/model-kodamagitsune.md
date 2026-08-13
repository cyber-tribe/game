> **実装済み。** `tools/models/monsters.py`に`build_kodamagitsune()`/
> `kodamagitsune_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py kodamagitsune`で
> `public/models/kodamagitsune.glb`を書き出し)。
>
> **骨格は計画書どおり`gajiri`と同じ関節構成をベースにした。**
> ただし実際には、同じ由来(design/characters.md)を持つ
> `plan/models/archive/model-yamabikogitsune.md`で作った
> `yamabikogitsune`の座標をひとまわり拡大する形で作った
> (「やまびこぎつねにこだまうさぎを繰り返し夢あわせすると育つ姿」という
> 進化元がすでに専用モデルとして存在したため)。未決事項にあった
> 「アーマチュアの流用可否」は、関節名・ボーン構成を変えずに座標の
> スケールだけを変える形で問題なく流用できることを確認した。
>
> **「攻撃が2回まで反響する」性質を、口元の発光球2つで視覚化した。**
> `yamabikogitsune`は単一の発光する喉だったが、`kodamagitsune`では
> 間隔を空けた2つの発光球(声の余韻)にし、`attack`アニメーションも
> 頭を2度振る「声を放ったあと、間を置いてもう一声追い足す」動きにした。
> 耳は`kodamausagi`譲りに`yamabikogitsune`よりさらに細く長く伸ばし、
> 「うさぎとの夢あわせ」の痕跡を残した。
>
> **配色は計画書どおり岩肌の灰色と乾いた土色の2トーン**
> (`yamabikogitsune`と同じ配色方針)。
>
> **三角形数は6,116**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **見た目の確認は`tools/preview/kodamagitsune.png`のCyclesレンダーで
> 行った。** `yamabikogitsune`より明確にひとまわり大きく、口元の
> 発光球が2つあることも見て取れる。裏返り・体積ゼロ・パーツの誤結合
> といった破綻はない。`tools/compare_models.mjs`で全モデル(39個)を
> 再ビルドして構造(頂点数・クリップ名・外形)を突き合わせ、一致すること
> も確認した。
>
> **`src/entities/species.ts`の`kodamagitsune.model`を`"gajiri"`→
> `"kodamagitsune"`に変更した。** `kodamagitsune`は配合限定種族で
> `tests/monster-roster-expansion-species.test.ts`の60種化ロースター拡張
> (`NEW_SPECIES_IDS`)には含まれていないため、`KNOWN_MODEL_IDS`の更新は
> 不要だった。
>
> `npx tsc --noEmit`・`npx vitest run`(1141/1141)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# こだまぎつね(kodamagitsune)の3Dモデル

現在は`gajiri`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

攻撃が2回まで反響するように連続で発動するようになった姿。

AI挙動(`ranged`)に合わせ、何かを飛ばす・放つための器官(口・触手・棘)を強調した形にする。
配色は第6地方(こだまの尾根)のテーマに合わせ、
吹きさらしの尾根らしい、岩肌の灰色と乾いた土色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`gajiri`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`gajiri`モデルを基準に、ステータス(maxHp 60)に
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
- 既存`gajiri`のアーマチュアをそのまま流用できるか、一部調整が要るか
