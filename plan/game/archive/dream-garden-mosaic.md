> **実装済み。**
> `src/game.ts` に `mosaicRegions: number[]`(フィールド)を新設し、
> `enterFloor` の冒頭で、表の寝穴43〜48階のときだけ
> `MOSAIC_CANDIDATE_REGIONS`([2,3,4,5,6,7])から1〜2個をランダムに
> 選んで保持する。各ギミックの適用条件を一律
> `regionGimmickApplies(depth, from, to, region)`(「実depthがその範囲内
> OR その地方番号がmosaicRegionsに含まれる」)という共通ヘルパーに
> 差し替えた。本文書の見積もりどおり、各ギミック自体の実行ロジックは
> 一切変更していない(呼び出し条件の分岐だけを触った)。
> テストは `tests/dream-garden-mosaic.test.ts`(6件)。
>
> 対象にした6種のギミックと、対応する地方番号:
> - 第二地方: 深みタイル(`placeQuagmireTiles`)
> - 第三地方: 胞子部屋(`placeSporeRooms`)
> - 第四地方: モンスターハウス出現率の乗数(`BONEPILE_MONSTER_HOUSE_
>   MULTIPLIER`)
> - 第五地方: 奔流タイル(`placeTorrentTiles`)
> - 第六地方: 物音で気づかせる範囲(`alertNearbyMonsters`。フロア生成
>   時ではなく、プレイヤーの攻撃・罠発動のたびに毎回参照される判定
>   だったため、`mosaicRegions`をフィールドとして保持し、実行時にも
>   参照できるようにした)
> - 第七地方: 偽の階段・偽のタル(`placeDecoyStairs`・
>   `placeDecoyBarrels`)
>
> 実装時の判断:
> - **`mosaicRegions`をフィールドで持たせた理由**: 未決事項には無いが、
>   第六地方の`alertNearbyMonsters`だけがフロア生成時ではなく戦闘中に
>   毎回呼ばれる判定だったため、単純な「生成時の後処理パス呼び分け」
>   だけでは対応できなかった。`this.mosaicRegions`をGameインスタンスの
>   フィールドとして保持し、`enterFloor`で新しいフロアに入るたびに
>   再抽選(範囲外なら空配列)する形にした。

# 第八地方(めざめの前庭)固有ギミック: 地方ギミックの混在

`design/regions.md` の第八地方(めざめの前庭・43〜48階)の固有ギミックを
実装可能な形に仕様化する。第一〜第七地方すべての固有ギミック
(`plan/wetland-quagmire.md`・`plan/spore-grove.md`・`plan/bonepile-
corridor.md`・`plan/waterfall-torrent.md`・`plan/echoing-ridge.md`・
`plan/festival-mirage.md`)が出そろっていることを前提とする最後の1本。

## 内容

第八地方(43〜48階)の各フロア生成時、上記6種の地方固有ギミックのうち
**1〜2種類をランダムに選び、そのフロアに限って適用する**。

- 実装済みの各ギミックは、いずれも「depthが該当地方の範囲かどうか」で
  適用有無を判定している(`plan/wetland-quagmire.md`の深みタイル、
  `plan/spore-grove.md`の胞子部屋、等)。第八地方では、実際のdepthの
  代わりに、フロア生成時に抽選した**「今回どの地方のギミックとして
  扱うか」のオーバーライド値**を各ギミックの判定に渡す。
- 具体的には、`generateFloor`(`src/dungeon/generate.ts`)の生成
  オプションに `mosaicRegions?: number[]`(第二〜第七地方を指す番号の
  部分集合、要素数1〜2)を追加する。depthが43〜48のときは、この
  `mosaicRegions` を実際のdepthの代わりに使って各ギミックの後処理
  パスを呼び分ける(例: `mosaicRegions` に第二地方が含まれていれば
  深みタイルの生成パスを、第五地方が含まれていれば奔流タイルの生成
  パスを、それぞれ通常の該当depth範囲のときと同じロジックで実行する)。
- 選ばれなかったギミックはそのフロアには一切出ない(6種すべてが毎回
  乗るわけではない、という点を明記しておく。過積載を避けるため上限を
  1〜2種に絞る)。
- 出現モンスターのプール(`speciesForDepth`)はこの上書きの対象外。
  第八地方の実際のdepth(43〜48)のまま、既存の
  `monster-compendium.md` で実装済みの上位種・エリート個体
  (かがやきの夢のかけら)がそのまま出現する。

## ねらい

`design/regions.md` に明記の通り、物語終盤の地方として、これまで
積み上げてきたすべてのギミックが入り乱れる「集大成」の体感を作る。
新しいギミックを追加で作るのではなく、**既存の6種の組み合わせ抽選**
だけで実現することで、実装コストを抑えつつ「今回はどの組み合わせか」
という周回時の変化を生む。

## 実装への影響の見積もり

- `src/dungeon/generate.ts`: `mosaicRegions?: number[]` オプションを
  追加。depthが43〜48のとき、この配列をランダムに1〜2要素選んで生成し、
  各地方ギミックの後処理パスの呼び出し条件を「実depth範囲 OR
  mosaicRegionsに含まれる」に変更する。
- 各ギミックの実行ロジック自体(深みタイルの押し流し処理、胞子パルスの
  判定、等)は一切変更しない。**呼び出し条件の分岐だけ**を触る。

## 未決事項

- 同時適用する種類数(1〜2)・各ギミックの抽選重みは実装後の体感で
  調整する。
- 第四地方の「狭い回廊・モンスターハウス多発」(`plan/bonepile-
  corridor.md`)のように生成アルゴリズム自体に手を入れるギミックと、
  第七地方の「偽の階段・タル」(`plan/festival-mirage.md`)のような
  配置追加系ギミックが同じフロアで重なった場合の組み合わせ検証は
  実装時に個別に確認する。
