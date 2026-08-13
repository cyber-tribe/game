# 淵の主(fuchiNoNushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-fuchiNoNushi.md`で別途扱う)。

## 位置づけ

第5地方(なみだの滝つぼ)・地方ボス。第五地方ボス。

## 由来

滝つぼの一番深いところに沈んだ、この地方でもっとも重い悲しみが凝った姿。動じることなく淵の底に居座り、地方の主として滝つぼ全体を見渡す。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 114 / 29 / 23 |
| exp | 85 |
| 出現weight | 0 |
| 備考 | 第五地方ボス |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
