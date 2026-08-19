> **実装済み。** `tools/audio/build.ts` の `SFX_SPECS` に計画書どおりの
> 値(`hit`: drum/450Hz/0.12s、`miss`: drum/700Hz/0.08s、`defeat`:
> mallet/330Hz/0.5s)で3エントリを追加し、`public/audio/sfx/`へ生成した。
> 新しい合成機能は不要だった(既存の`composeSfx`のみ)。
>
> `src/view/stage.ts`の`buildEventHandlers`を編集: `damage`ハンドラの
> 既存の見た目処理(`view.play("hit", ...)`・`flash`・ダメージ数値・
> ヒットスパーク)はすべて残したまま`this.audio.playSfx("hit")`を1行
> 追加。`miss: noop`を`this.audio.playSfx("miss")`を呼ぶハンドラに
> 置き換え。`die`ハンドラの既存の見た目処理(dieアニメーション・
> 撃破パーティクルの下ごしらえ)はそのままに`this.audio.playSfx("defeat")`
> を1行追加。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(111ファイル/1439件)・
> `npm run build`・`npm run audio`いずれも成功。再生成後の差分は
> `hit.wav`・`miss.wav`・`defeat.wav`の3ファイル新規のみ(既存音源は
> 無変更)。

# 戦闘のヒット・ミス・撃破音

## 経緯

`src/view/stage.ts` の `GameEvent` 再生表を見ると、**命中(`damage`)・
ミス(`miss`)・撃破(`die`)のいずれにもSFXが無い**。`damage`は
ヒットスパーク(パーティクル)とダメージ数値表示だけ、`die`はモデルの
`die`アニメーション+撃破パーティクルだけ、`miss`は完全に`noop`。
攻撃の振り(`attack`)には`plan/sound/archive/`で専用SFXを足したが、
その「結果」にあたる3つが無音のままなのは、戦闘全体で見ると
アンバランス(振る音はするのに当たった音・外れた音・倒した音がしない)。

## 効果音の狙い

- **命中(`damage`)**: 攻撃(振り)の`attack.wav`と明確に聴き分けられる
  「当たった」感触。`attack.wav`は短く軽いノイズ寄りだったので、
  こちらはもう少し芯のある低めの一撃にする。連打でうるさくならない
  よう、`attack.wav`より控えめな音量にする。
- **ミス(`miss`)**: 空振りの軽さ。命中音より軽く、短く、音程も一段高い
  (「当たらなかった」ことが音の軽さで直感的に分かる)。
- **撃破(`die`)**: このゲームのモンスターは「夢のかけら」
  (`design/world.md`)であり、暴力的な死ではなく夢から覚めて消える
  ニュアンス。素朴で温かいトーン(`design/audio-direction.md`)を保ち、
  硬いdrum系ではなくmallet系の、余韻を持って消えていく音にする。

## 仕様

`tools/audio/build.ts` の `SFX_SPECS` に3エントリ追加する。既存の
`composeSfx`(単発の木琴/太鼓)だけで作れ、新しい合成機能は不要。

| id | kind | freq目安 | duration目安 | 備考 |
|---|---|---|---|---|
| `hit` | drum | 450 | 0.12 | `attack.wav`(freq 300)より一段高く芯のある一撃。ダメージ数値と同時に鳴る前提なので短く済ませる |
| `miss` | drum | 700 | 0.08 | `hit`よりさらに短く高く、軽さを出す |
| `defeat` | mallet | 330 | 0.5 | 木琴の余韻で「消える」感触。`levelUp`(freq 880・mallet)より低く長め |

## 再生側の接続

`src/view/stage.ts` の `buildEventHandlers` を編集する。

- `damage`(232行目付近)の既存ハンドラの中で `this.audio.playSfx("hit")`
  を1行足す(見た目のヒットスパーク・ダメージ数値表示はそのまま)。
- `miss: noop`(280行目)を `miss: () => { this.audio.playSfx("miss"); return 0; }`
  に置き換える。
- `die`(281行目付近)の既存ハンドラの中で `this.audio.playSfx("defeat")`
  を1行足す(モデルのdieアニメーション・撃破パーティクルはそのまま)。

## 受け入れ基準

1. 攻撃が命中すると`hit`、外れると`miss`が鳴り、`attack.wav`(振り)とは
   別に聴き分けられる。
2. モンスター・プレイヤーいずれかが倒れると`defeat`が鳴る。
3. 3つとも既存のSFX(capture・levelUp等)の波形・挙動に影響しない。
4. 連続する乱戦(1ターンに複数体が攻撃し合う)でも耳障りにならない
   音量バランスになっている(既存の`SFX_REVERB`程度の控えめさを保つ)。

## 対象外

- クリティカルヒット時の専用音(既存のダメージ数値表示の演出で足りている
  という判断。将来別途検討してよい)
- プレイヤーが倒れた(ロスト)ときの専用の重い演出音(`gameOver`側の
  ジングルで扱う。`plan/sound/sfx-milestone-jingles.md`参照)

## 未決事項

- freq・durationの最終値(聴感で確定)
- `hit`をクリティカル/通常で音量・音程を変えるかどうか
