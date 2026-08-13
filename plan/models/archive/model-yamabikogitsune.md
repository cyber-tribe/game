> **実装済み。** `tools/models/monsters.py`に`build_yamabikogitsune()`/
> `yamabikogitsune_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py yamabikogitsune`で
> `public/models/yamabikogitsune.glb`を書き出し)。
>
> **骨格は計画書どおり`gajiri`と同じ関節構成(chest/hip/neck/snout、
> tail1-3、耳、前後の脚)をベースにした。** 未決事項にあった
> 「アーマチュアの流用可否」は、関節名・ボーン構成をそのまま使い、
> 座標・太さだけを差し替える形で問題なく流用できることを確認した。
> `gajiri`のずんぐりしたねずみ体型から、全体を細くしなやかにし、
> 鼻先と耳をより尖らせ、尾を長く大きく張り出させてきつねらしい
> シルエットに作り替えた。
>
> **「何かを放つための器官」として、遠吠えのように開いた口と発光する
> 喉を追加した。** 上下2枚のboxで開口部を作り、間に発光(emission)
> マテリアルの喉を仕込むことで、「響いて返ってくる声そのもの」という
> 由来を視覚化した。目・耳の配色は`gajiri`の`assign_materials_by_region`
> と同じ、関節からの距離で塗り分ける手法を再利用し、耳の内側と尾の先を
> 乾いた土色にした。
>
> **配色は計画書どおり岩肌の灰色と乾いた土色の2トーン。**
>
> **三角形数は5,976**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`gajiri_animations()`を流用せず、新規にキーフレーム
> を書いた。** クリップ構成(idle/walk/attack/hit/die、ボーン名も
> `chest-neck`等gajiriと同一)は変えていないが、`attack`は石を投げる
> gajiriの動きではなく、頭を反らして口を大きく開け声を放つ動きにした。
>
> **見た目の確認は`tools/preview/yamabikogitsune.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(38個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`yamabikogitsune.model`を`"gajiri"`→
> `"yamabikogitsune"`に変更した。** `yamabikogitsune`は
> `tests/monster-roster-expansion-species.test.ts`の60種化ロースター拡張
> (`NEW_SPECIES_IDS`)には含まれていない種族のため、`KNOWN_MODEL_IDS`の
> 更新は不要だった。
>
> `npx tsc --noEmit`・`npx vitest run`(1137/1137)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# やまびこぎつね(yamabikogitsune)の3Dモデル

現在は`gajiri`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

響いて返ってくる声そのもの。プレイヤーを見つけた瞬間、その声が尾根中に響き渡り、他のモンスターにまで気づかせてしまう。

AI挙動(`ranged`)に合わせ、何かを飛ばす・放つための器官(口・触手・棘)を強調した形にする。
配色は第6地方(こだまの尾根)のテーマに合わせ、
吹きさらしの尾根らしい、岩肌の灰色と乾いた土色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`gajiri`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`gajiri`モデルを基準に、ステータス(maxHp 40)に
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
