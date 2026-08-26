# ボスの間の扉のきしみ

## 経緯

`plan/game/archive/dungeon-boss-rooms.md`(演出の節)に、実装セッションから
音楽セッションへの依頼が残っている:

> 扉を開けた瞬間にボスBGMへ切り替える(既存のボスBGM遷移を扉開放
> トリガーに移す)。`plan/sound/` 側に「扉のきしみ」のSFXを1つ追加依頼。

BGM切り替え自体は既に実装済み(`src/main.ts`の`doorOpened`ハンドラが
`updateDiveBgm()`を呼び直し、`this.game.floor.door?.open`を見て
`boss`曲へ切り替える)。残っているのは`src/view/stage.ts`の
`buildEventHandlers`で`doorOpened: noop`のままになっている、扉が
実際に開く瞬間のSFXだけ。

## 効果音の狙い

- 「ぬしの気配がする」という確認モーダルを経て、実際に扉を開けた
  瞬間に鳴る一撃。ボス戦の始まりを告げる重さを持たせる。
- 村の建物の扉音(`enterStorage`: 木の扉のきしみ・`enterGarudoHouse`:
  戸の開閉。いずれも`plan/sound/archive/village-soundscape.md`)と
  同じ「木のきしみ」の語彙は保つが、ボスの間という場面の重さに
  合わせてもう一段低く・長くする(村の建物の扉と聴き比べて明確に
  格上と分かるように)。

## 仕様

`tools/audio/build.ts`の`SFX_SPECS`に1エントリ追加する。既存の
`composeSfx`(単発の太鼓)だけで作れ、新しい合成機能は不要。

| id | kind | freq目安 | duration目安 | 備考 |
|---|---|---|---|---|
| `doorOpened` | drum | 130 | 0.55 | `enterStorage`(drum/200Hz/0.35s)より低く長い一撃 |

`src/view/stage.ts`の`buildEventHandlers`を編集する。

- `doorOpened: noop`を`doorOpened: () => { this.audio.playSfx("doorOpened"); return 0; }`
  に置き換える(見た目の演出は対象外のまま)。

## 受け入れ基準

1. ボスの間の扉を開けると、村の建物の扉音より低く長い一撃が鳴る。
2. 既存のSFX(enterStorage等)の波形・挙動に影響しない。

## 対象外

- 扉が開く見た目の演出(`dungeon-boss-rooms.md`の対象外どおり、
  今回も音だけ)
- ボスBGMへの切り替え自体(実装済み)

## 未決事項

- freq・durationの最終値(聴感で確定)
