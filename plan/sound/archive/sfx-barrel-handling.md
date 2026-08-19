> **実装済み。** `tools/audio/build.ts` の `SFX_SPECS` に計画書どおりの
> 値(`barrelLift`: mallet/220Hz/0.2s、`barrelPut`: drum/180Hz/0.15s、
> `barrelThrow`: drum/250Hz/0.2s、`barrelBreak`: drum/320Hz/0.3s)で
> 4エントリを追加し、`public/audio/sfx/`へ生成した。新しい合成機能は
> 不要だった。
>
> `src/view/stage.ts`の`buildEventHandlers`を編集: `liftBarrel`・
> `putBarrel`・`throwBarrel`はいずれも既存の見た目処理(タルの持ち替え・
> `launchBarrel`)の直後に`this.audio.playSfx(...)`を1行追加。
> `barrelBreak: noop`は`this.audio.playSfx("barrelBreak")`を呼ぶ
> ハンドラに置き換えた(計画書どおり見た目の演出は今回追加していない)。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(111ファイル/1439件)・
> `npm run build`・`npm run audio`いずれも成功。再生成後の差分は
> 4ファイル新規のみ(既存音源は無変更)。

# タルの持ち上げ・置く・投げる・壊れる音

## 経緯

README・`design/world.md`が挙げる、このゲームの象徴的なギミック
「タル」まわりの操作は、`src/view/stage.ts`の`GameEvent`再生表を見ると
`liftBarrel`(持ち上げる)・`putBarrel`(置く)・`throwBarrel`(投げる)は
見た目のアニメーションだけでSFXが無く、`barrelBreak`(タルが壊れる)は
完全に`noop`(見た目すら無い)。吸い込み成功時の`capture`・失敗時の
`captureFailed`にはすでに専用SFXがある(`plan/sound/archive/`
`plan/game/archive/barrel-capture-clarity.md`)一方、タルそのものの
物理的な操作音が一切鳴らないのは、象徴的ギミックにしては手薄。

## 効果音の狙い

木の樽を実際に取り扱っている手応えを、`design/audio-direction.md`の
「木琴・太鼓・笛・弦」の編成に馴染む素朴な音で出す。金属的・電子的な
音は使わない。

- **持ち上げる(`liftBarrel`)**: 軽く「ゴトッ」と持ち上がる、低めの
  木の音。
- **置く(`putBarrel`)**: 持ち上げる音より少し鈍く短い、地面に着く音。
- **投げる(`throwBarrel`)**: 振りかぶって放つ、`attack.wav`に近い
  ノイズ寄りの短い音だが、もう少し低く・長めにして「重いものを投げた」
  感触を出す。
- **壊れる(`barrelBreak`)**: 木が割れる乾いた音。`explosion.wav`
  (低音のドン)とは明確に違う質感にする(爆発ではなく、ただ壊れて
  中身がこぼれる程度の軽さ)。

## 仕様

`tools/audio/build.ts`の`SFX_SPECS`に4エントリ追加する。既存の
`composeSfx`だけで作れる。

| id | kind | freq目安 | duration目安 | 備考 |
|---|---|---|---|---|
| `barrelLift` | mallet | 220 | 0.2 | 低めの木の音。`capture`(freq 660)よりだいぶ低い |
| `barrelPut` | drum | 180 | 0.15 | 短く鈍い着地音 |
| `barrelThrow` | drum | 250 | 0.2 | `attack.wav`(freq 300, duration 0.15)より低く気持ち長め |
| `barrelBreak` | drum | 320 | 0.3 | `explosion.wav`(freq 70)よりだいぶ高く、乾いた木の割れを表す |

## 再生側の接続

`src/view/stage.ts`の`buildEventHandlers`内、該当ハンドラに1行ずつ
`this.audio.playSfx(...)`を足す(既存の見た目の挙動はすべて維持する)。

- `liftBarrel`(317行目付近): 末尾で`this.audio.playSfx("barrelLift")`
- `putBarrel`(325行目付近): 末尾で`this.audio.playSfx("barrelPut")`
- `throwBarrel`(331行目付近): `launchBarrel`を呼んだ直後に
  `this.audio.playSfx("barrelThrow")`
- `barrelBreak: noop`(337行目): 見た目は今回も追加しない(対象外参照)。
  `barrelBreak: () => { this.audio.playSfx("barrelBreak"); return 0; }`
  に置き換える

## 受け入れ基準

1. タルを持ち上げる・置く・投げるの3操作すべてで専用SFXが鳴る。
2. タルが壊れたとき、`explosion`(爆発)とは聴き分けられる軽い音が鳴る。
3. `capture`・`captureFailed`(吸い込み成功/失敗)の既存SFXとも
   聴き分けられる(あちらは吸い込みの澄んだ/鈍い音、こちらは物理的な
   持ち運びの音)。
4. 既存のSFXの波形・挙動に影響しない。

## 対象外

- `barrelBreak`の見た目の演出(木片が飛び散るパーティクル等)。今回は
  SFXのみ追加し、見た目は別途`plan/game/`側で検討する
- タルの種類(`BarrelKind`)ごとに音を変えること(今回は共通の1音で足りる
  という判断。作り分けが要ると分かったら別途仕様化する)

## 未決事項

- freq・durationの最終値(聴感で確定)
- `barrelBreak`に見た目の演出を足すかどうか(ゲーム側の判断)
