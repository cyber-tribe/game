# ホネヅカのぬし(honezukaNoNushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-honezukaNoNushi.md`で別途扱う)。

## 位置づけ

第4地方(骨積みの回廊)・地方ボス。第四地方ボス。

## 由来

この回廊に積もりに積もった、無数の古い記憶が寄り集まってひとつの巨体を成したもの。忘れられまいとする執念の総体として、回廊の最奥に居座り続ける。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 96 / 24 / 40 |
| exp | 75 |
| 出現weight | 0 |
| 備考 | 第四地方ボス |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
