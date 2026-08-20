> **実装済み。** `tools/audio/compose.ts` に `composeJingle`(`JingleNote`・
> `JingleParams`)を新設した。各音を`degreeToFreq`(モジュール内の既存関数)
> で周波数に変換し、`instrument`(既定mallet)ごとに`malletNote`/
> `fluteNote`/`pluckedString`を順に鳴らして1本のモノラルバッファへ
> `mixIn`する。音ごとの`pluckedString`用シードはノート配列のindexから
> 導出し(`index + 1`)、追加のseedパラメータなしで完全に決定的にした。
> `normalize`・`reverbOneShot`は`composeSfx`と同じ手順を踏襲。
>
> `build.ts`に`JINGLE_SPECS`(`SFX_SPECS`とは別の配列)を新設し、計画書
> どおりの度数列・楽器・テンポ・残響で6エントリを追加。`main()`に
> `SFX_SPECS`ループの直後に`JINGLE_SPECS`ループを足し、同じ
> `public/audio/sfx/*.wav`へ書き出す(SFXと出力先を分けていない)。
>
> `src/view/stage.ts`の`buildEventHandlers`で、6つの`noop`
> (`recruit`・`secretPassageFound`・`mountainCoreCleared`・
> `trueAwakeningCleared`・`tarukurabeFinished`・`gameOver`)を
> `this.audio.playSfx(id)`を呼ぶハンドラに置き換えた。見た目の演出は
> 計画書どおり今回追加していない。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(117ファイル/1558件、
> `composeJingle`の長さ・決定性・有限値・音列差分・楽器差分・リバーブの
> 6項目のテストを追加)・`npm run build`・`npm run audio`いずれも成功。
> 再生成後の差分は6ファイル新規のみ(既存音源は無変更)。ジングルの
> 長さは`recruit.wav`約2.15秒〜`trueAwakeningCleared.wav`/
> `gameOver.wav`約7.32秒で、いずれもファイルサイズは数百KB程度に収まる。
>
> **未決事項どおり**、`gameOver`時にBGMをフェードアウトさせる対応は
> 見送った(`AudioPlayer`側の対応が別途必要なため、本文書のスコープ外
> のまま)。

# 節目のジングル(仲間・発見・クリア・全滅)

## 経緯

`src/view/stage.ts`の`GameEvent`再生表で、以下の6つは完全に`noop`
(見た目もSFXも無い)。いずれも頻度は低いが、プレイヤー体験としては
重い意味を持つ節目:

- `recruit`: タルから出して仲間になった
- `secretPassageFound`: 忘れ物蔵(`plan/sound/archive/bgm-lost-and-found-vault.md`)
  の隠し通路を発見
- `mountainCoreCleared`: 山の芯(`plan/sound/archive/bgm-mountain-core.md`)、
  近道屋との決着イベントを経験
- `trueAwakeningCleared`: 真の目覚め(`plan/sound/archive/bgm-true-awakening.md`)、
  はじめの夢との決着イベントを経験
- `tarukurabeFinished`: 樽比べ(`plan/sound/archive/bgm-tarukurabe.md`)終了
- `gameOver`: 全滅

これらは単発の一音では軽すぎる。**ここだけ、短い旋律(2〜5音のジングル)を
新設する**。

## 技術的な決定: `composeJingle` を新設する

既存の`composeSfx`は単発の1音(`malletNote`/`drumHit`)しか作れない。
`tools/audio/compose.ts`に、短い音列を鳴らせる`composeJingle`を追加する。

```ts
export interface JingleNote {
  /** ペンタトニック上の度数(compose.ts内部のROOT_MIDI基準) */
  degree: number;
  /** 音価(拍数) */
  beats: number;
  instrument?: "mallet" | "flute" | "string";
}

export interface JingleParams {
  notes: readonly JingleNote[];
  tempoBpm: number;
  sampleRate: number;
  /** 省略時はリバーブ無し */
  reverb?: ReverbParams;
}

export function composeJingle(params: JingleParams): Float32Array
```

- 各音を`degreeToFreq`(compose.ts内部の既存関数、モジュール内で
  再利用できる)で周波数に変換し、`instrument`省略時は`mallet`を使う。
  `malletNote`/`fluteNote`/`pluckedString`を順に鳴らし、`mixIn`で
  1本のモノラルバッファに合成する(SFXはモノラルのまま、という
  既存方針を踏襲)。
- `normalize`でクリップを防ぎ、`reverb`指定時は`reverbOneShot`を通す
  (`composeSfx`と同じ手順)。
- BGMの`composeTrack`とは違い、コード進行・ボイシングは持たない
  (単発ジングルなので不要)。

`build.ts`には`SFX_SPECS`とは別に`JINGLE_SPECS`(id・notes・tempoBpm・
reverb)を新設し、`main()`にもう1つのループを足して
`public/audio/sfx/*.wav`へ書き出す(出力先ディレクトリ・ファイル形式は
既存のSFXと同じ)。

## 各ジングルの狙いと音列(度数列は目安。最終値は聴感で決めてよい)

| id | 場面の性格 | 度数列(beats) | 楽器 | tempo | reverb目安 |
|---|---|---|---|---|---|
| `recruit` | 仲間が増える、あたたかい歓迎 | `[0,1], [2,1], [4,1.5]` | mallet | 120 | 浅め(村のTOWN_REVERBに近い) |
| `secretPassageFound` | 発見の高揚、きらめき | `[0,0.5], [2,0.5], [4,0.5], [7,1]` | mallet | 160 | 見つけたダンジョンの深さに応じ中程度 |
| `tarukurabeFinished` | 祭りの遊びの締め、軽い達成感 | `[0,0.5], [2,0.5], [0,0.5], [4,1]` | mallet | 108(`tarukurabe.wav`と同テンポ) | 浅め(`tarukurabe.wav`と同程度) |
| `mountainCoreCleared` | 決着の重み、力強い解決 | `[0,1], [4,1], [7,1], [4,1], [0,2]` | mallet→string(最後の音だけstring) | 90 | 深め(`mountain-core.wav`と同程度) |
| `trueAwakeningCleared` | 物語の締めくくり、静かな安堵 | `[7,1.5], [4,1.5], [2,1.5], [0,3]` | flute→flute→string→string | 65(`true-awakening.wav`と同テンポ) | 最深(`true-awakening.wav`と同程度) |
| `gameOver` | 全滅、沈んでいく静けさ | `[4,1.5], [2,1.5], [0,1.5], [-3,3]` | string | 65 | 深め |

`mountainCoreCleared`・`trueAwakeningCleared`・`gameOver`はテンポを
遅めにして、単発SFXというより「小さな締めの一節」に聞こえるようにする。

## 再生側の接続

`src/view/stage.ts`の`buildEventHandlers`で、以下の`noop`を
`this.audio.playSfx(id)`を呼ぶハンドラに置き換える(見た目は今回
追加しない。対象外参照)。

- `recruit: noop` → `playSfx("recruit")`
- `secretPassageFound: noop` → `playSfx("secretPassageFound")`
- `mountainCoreCleared: noop` → `playSfx("mountainCoreCleared")`
- `trueAwakeningCleared: noop` → `playSfx("trueAwakeningCleared")`
- `tarukurabeFinished: noop` → `playSfx("tarukurabeFinished")`
- `gameOver: noop` → `playSfx("gameOver")`

## 受け入れ基準

1. 6つのイベントすべてで対応するジングル(単音ではなく複数音の
   短い旋律)が鳴る。
2. `composeJingle`のテストで、指定した音数ぶんの音が実際に鳴っている
   こと(無音区間だけでないこと)・決定性(同じ入力で同じ波形)を
   検証できる。
3. 既存の`composeSfx`・`composeTrack`・既存SFXの波形・挙動に影響しない。
4. 各ジングルが対応する場面のBGM(`mountain-core.wav`等)と楽器・
   テンポの系統が合っている(浮いて聞こえない)。

## 対象外

- 見た目の演出(パーティクル・カメラ演出等)の追加。今回はSFXのみ
- `gameOver`が鳴るタイミングでBGMを止める/フェードアウトする処理
  (`AudioPlayer.setBgm`側の対応が要れば別途仕様化する)
- ジングルの多声化(和音を同時に鳴らす)。今回は単旋律の音列のみ

## 未決事項

- 度数列・楽器・テンポの最終値(聴感で確定)
- `gameOver`時にBGMをフェードアウトさせるかどうか(させる場合は
  `AudioPlayer`側の対応が別途必要)
