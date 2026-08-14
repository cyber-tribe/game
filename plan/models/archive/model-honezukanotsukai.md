> **実装済み。** `tools/models/monsters.py`に`build_honezukanotsukai()`/
> `honezukanotsukai_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py honezukanotsukai`で
> `public/models/honezukanotsukai.glb`を書き出し)。
>
> **骨格は計画書どおり`madoromi`と同じ関節構成(root-stem-capbase-captop)を
> そのまま流用した。** アーマチュアの流用可否は座標の差し替えだけで問題なく、
> `oitekeboshi`(同じ4関節・3ボーン構成)と同様に確認できた。
>
> **見た目は「傘」ではなく「積み重なった骨」で構成した。** 幹(root-stem)に
> 椎骨を思わせる輪を2段重ね、頭部(capbase)の両脇には積みきれずにはみ出した
> 肋骨の欠片を`cone()`で突き出させた。頭頂(captop)には割れた骨片を3本
> 冠のように刺している。`ai: "ranged"`かつオイテケボシより間合いが近い
> (range 2)という設定に合わせ、口先から突き出た管状の発射口
> (`cylinder(..., axis="Y")`)を最も目立つ位置に配置し、「何かを吐きかける
> 器官」であることを一目で示した。目はオイテケボシの残り火(暖色)や
> ホネガラミの怒り(橙)とは違う、ぬしに仕える者らしい感情のない冷たい
> 薄青の発光にして差別化した。
>
> **配色は計画書どおり、第四地方(骨積みの回廊)の白骨色・くすんだ灰色**
> (`oitekeboshi`・`honegarami`と同系統のパレットに揃えた)。
>
> **三角形数は2,204**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは新規にキーフレームを書いた。** `attack`は間合いが
> 近い分オイテケボシより素早く身を乗り出す動きにし、`die`は積まれていた
> 骨がほどけて元の骨積みに還るように崩れ落ちる動きにした
> (クリップ構成・待機/歩行/攻撃/被弾/消滅の5種とボーン名の付け方は変えていない)。
>
> **見た目の確認は`tools/preview/honezukanotsukai.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `mesh.data.validate()`が警告を出す点は確認したが、`kodamagumo`や
> `madoromi`など既存の多くのモデルでも同じ警告(自動ウェイトの合計値が
> 浮動小数点誤差でわずかに1.0を超える)が出ており、この模型固有の問題では
> ないことを確認した。`tools/build_models.py --no-preview`で全モデルを
> 再ビルドし、`honezukanotsukai`以外の`.glb`に実質的な差分(サイズ変化)が
> ないことも確認した。
>
> **`src/entities/species.ts`の`honezukanotsukai.model`を`"madoromi"`→
> `"honezukanotsukai"`に変更した。** `honezukanotsukai`は
> `tests/monster-roster-expansion-species.test.ts`の`NEW_SPECIES_IDS`に
> 含まれる種族のため、`KNOWN_MODEL_IDS`に`"honezukanotsukai"`を追加した。
>
> `npx tsc --noEmit`・`npx vitest run`(1219/1219)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# ホネヅカのつかい(honezukanotsukai)の3Dモデル

現在は`madoromi`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

ホネヅカのぬしに仕える小さな使い。オイテケボシと同じく満腹度を削る攻撃を放つが、忠実な分だけ間合いは近い。

AI挙動(`ranged`)に合わせ、何かを飛ばす・放つための器官(口・触手・棘)を強調した形にする。
配色は第4地方(骨積みの回廊)のテーマに合わせ、
積み重なった骨を思わせる、白骨色・くすんだ灰色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`madoromi`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`madoromi`モデルを基準に、ステータス(maxHp 28)に
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
