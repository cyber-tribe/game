> **実装済み。** `tools/models/monsters.py`に`build_yorishironozankyo()`/
> `yorishironozankyo_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py yorishironozankyo`で
> `public/models/yorishironozankyo.glb`を書き出し)。
>
> **骨格は計画書どおり`honegarami`と同じ人型骨組みをベースにした。**
> `yamabikooni`・`misemonoNoNushi`と同じ座標拡大の手法で、これまでで
> 最も大きい(maxHp 160、地方ボスの`misemonoNoNushi`(152)より大きい)
> サイズにした。未決事項にあった「アーマチュアの流用可否」は、ここでも
> 座標の差し替えだけで問題なく流用できることを確認した。
>
> **配色は計画書どおり「第一〜第七地方の色が淡く混ざり合った、統一感の
> ない配色」を、高さで5段に区切った色帯で表現した。** `assign_materials_
> by_region`のclassify関数で`c.z / 1.045`(全高)を5分割し、それぞれに
> 各地方の代表色を淡くした色(灰紫→水色→緑→紅紫→土金)を割り当てた。
> `yumemayoinokage`が傘の縁に色の欠片を散らす手法だったのに対し、
> こちらは体全体を貫く帯状の塗り分けにして、より大きな存在としての
> 一体感を出した。
>
> **胸に、全ての記憶が集まる核として発光する紋章を追加した。**
> 扁平な`uv_sphere`のリング(金属質)とその内側の発光する核
> (emissionマテリアル)を重ね、目も同系の発光色にして、ヨリシロ自身の
> 記憶という由来にふさわしい静かな存在感を出した。
>
> **三角形数は4,424**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`honegarami_animations()`等を流用せず、新規に
> キーフレームを書いた。** `idle`は静かに佇む待機、`attack`は物語終盤に
> ふさわしい両腕を大きく振りかぶる圧倒的な一撃にした(クリップ構成・
> ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/yorishironozankyo.png`のCyclesレンダーで
> 行った。** 高さごとの色帯・発光する目と胸の紋章がはっきり見て取れる。
> 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(50個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`yorishironozankyo.model`を`"honegarami"`
> →`"yorishironozankyo"`に変更した。** `yorishironozankyo`は
> `tests/monster-roster-expansion-species.test.ts`の60種化ロースター拡張
> (`NEW_SPECIES_IDS`)には含まれていない種族のため、`KNOWN_MODEL_IDS`の
> 更新は不要だった。
>
> `npx tsc --noEmit`・`npx vitest run`(1171/1171)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# ヨリシロの残響(yorishironozankyo)の3Dモデル

現在は`honegarami`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

ヨリシロ自身の記憶そのもの。出現率は極めて低いが、他のどの種族よりHP・攻撃・防御が高く、物語終盤にふさわしい存在感を放つ。

AI挙動(`melee`)に合わせ、がっしりした体格で、正面から迫る力強いシルエットにする。
配色は第8地方(めざめの前庭)のテーマに合わせ、
第一〜第七地方の色が淡く混ざり合った、統一感のない配色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`honegarami`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`honegarami`モデルを基準に、ステータス(maxHp 160)に
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
