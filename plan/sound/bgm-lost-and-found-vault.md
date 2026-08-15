# 忘れ物蔵のBGM

## 経緯・現状

忘れ物蔵(`lostAndFoundVault`、5階)は専用BGMが無く、ダイブ中も
直前の曲(通常は村のテーマ)が流れ続ける(`src/main.ts` の
`bgmForDive` が対象外にしているため)。専用の1曲を作る。

## 曲の狙い

「誰の記憶とも紐づかない半端な品々が眠る、小さな蔵」
(`src/entities/dungeons.ts`)。モンスターは少なく(湧き数0.5倍)、
そのぶん満腹度の減りがきつい、静かで居心地の悪い場所。

- **ひっそり**: 音数を意図的に間引く。ぽつり、ぽつりと物が
  置かれている蔵の中を、足音を忍ばせて歩く感じ。
- **埃っぽさと少しの可笑しみ**: 悲しい曲にはしない。持ち主を
  忘れられた品々の「所在なさ」を、間の多い木琴と弦で描く。
  `design/world.md` の「素朴で温かい、少し可笑しみのある民話」の
  トーンの範囲内に収める。
- **こもった響き**: 蔵の中なので、残響は深めだが高域の減衰
  (damping)を強くしてこもらせる。

## 仕様

`tools/audio/build.ts` の `BGM_SPECS` に1エントリ追加する。

| 項目 | 値(目安。聴感で調整可) |
|---|---|
| id | `lost-and-found` |
| ファイル | `public/audio/bgm/lost-and-found.wav`(ステレオ、22.05kHz) |
| seed | 7000(聴感で選び直してよい) |
| tempoBpm | 68 |
| beatsPerBar | 4 |
| bars | 8(約28秒) |
| weights | mallet 0.45 / drum 0.05 / flute 0.15 / string 0.35 |
| reverb | wet 0.3 / roomSize 0.45 / **damping 0.45**(全曲中もっともこもらせる) |
| melodyDensity | 0.65(`plan/sound/bgm-nightly-dream.md` で導入する係数を流用し、全曲中もっとも音数を少なくする) |

`melodyDensity` は夜ごとの夢のプランで導入する拡張の流用なので、
実装順が前後する場合はどちらか先のPRで `TrackParams` に入れる
(どちらの曲にも必要な、旋律・和声の発音確率に掛ける係数。既定1)。

## 再生側の接続

`src/main.ts` の `bgmForDive` に分岐を1つ足す:
`dungeonId === "lostAndFoundVault"` なら `"lost-and-found"` を返す。

## 受け入れ基準

1. 忘れ物蔵に入ると専用曲へ切り替わり、帰還で村のテーマに戻る。
2. 他の曲と並べて聴いたとき、音数の少なさとこもった響きで
   聴き分けられる。
3. 既存曲の波形が変わらない。

## 対象外

- 蔵の中の品にまつわるイベント・演出用のSFX
- 「しじまの階」的な無音演出(`design/audio-direction.md` の
  無音の使いどころは別途。この蔵はBGMを持つ)

## 未決事項

- シード・`melodyDensity` の最終値(聴感で確定)
