> **実装済み。** `tools/models/monsters.py`に`build_shioresakura()`/
> `shioresakura_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py shioresakura`で
> `public/models/shioresakura.glb`を書き出し)。
>
> **骨格は計画書どおり`purun`と同じ縦2本の関節構成(base-mid-top)を
> そのまま流用した。** 未決事項にあった「アーマチュアの流用可否」は、
> 座標の差し替えだけで問題なく流用できることを確認した。頭の周りに
> `uv_sphere`を扁平化した花びらを6枚放射状に配置し、明るい配色と
> 暗い配色を交互に割り当てた上で、半分の花びらだけをZ方向に大きく
> 下げて垂らし、「打たれるたびに力を失っていく」萎れた印象にした。
>
> **配色は計画書どおり、涙と滝つぼを思わせる沈んだ青・藍色系を、
> 色あせた花らしく薄めた。**
>
> **三角形数は3,892**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`purun_animations()`を流用せず、新規に
> キーフレームを書いた。** `attack`は`lowHpAtkBonusMax: 0.3`の性質
> (瀕死になるほど攻撃力が増す)に合わせ、身を大きく反らせてから
> 打ち込む「散り際に最後の力を振り絞る」動きにした。`die`は花びらが
> 散るように輪郭を潰しながら崩れ落ちる動きにした(クリップ構成・
> ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/shioresakura.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(55個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`shioresakura.model`を`"purun"`→
> `"shioresakura"`に変更した。** `shioresakura`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`shioresakura`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1181/1181)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# しおれざくら(shioresakura)の3Dモデル

現在は`purun`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

涙で色あせた花。打たれるたびに力を失っていくが、散り際にだけ最後の力を振り絞る。

AI挙動(`melee`)に合わせ、がっしりした体格で、正面から迫る力強いシルエットにする。
配色は第5地方(なみだの滝つぼ)のテーマに合わせ、
涙と滝つぼを思わせる、沈んだ青・藍色系を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`purun`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`purun`モデルを基準に、ステータス(maxHp 30)に
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
