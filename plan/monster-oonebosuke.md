# おおねぼすけ(oonebosuke)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-oonebosuke.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・地方ボス。第一地方ボス。

## 由来

眠りこけて起き上がれなくなった、途方もない眠気そのものが人の形を借りた姿。この地方で最初に立ちはだかる大きな眠りの化身として、参道の最奥に居座る。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 30 / 11 / 4 |
| exp | 40 |
| 出現weight | 0 |
| 備考 | 第一地方ボス |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
