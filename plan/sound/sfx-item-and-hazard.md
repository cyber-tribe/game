# 道具の扱い・罠と予兆の音

## 経緯

`src/view/stage.ts`の`GameEvent`再生表のうち、以下は見た目・SFXとも
`noop`(何も起きない)か、見た目だけで音が無い:

- 道具まわり: `pickup`(拾う)・`drop`(落とす)・`useItem`(使う)・
  `equip`(装備する)
- 危険まわり: `trap`(罠を踏んだ)・`crackWarning`(地方ボスの大技の
  予兆で床にひびが入る、`plan/archive/region-bosses.md`)
- 特殊移動: `teleport`(ワープ)・`swap`(入れ替え。いずれも見た目の
  移動はあるがSFXが無い)

いずれも単発の短い音1つで足りる、軽い扱いの操作音。
`plan/sound/archive/audio-playback.md`が最初に定義した6つのSFXと同じ
粒度の追加なので、まとめて1つの表で仕様化する。

## 効果音の狙い

`design/audio-direction.md`の素朴なトーンを保ちつつ、それぞれの操作の
性質を音の高さ・楽器で描き分ける。

- **拾う(`pickup`)**: 軽く明るい、一瞬のチャイム。
- **落とす(`drop`)**: 拾うより低く鈍い、短い音。
- **使う(`useItem`)**: 何かが起きる合図として、拾う・落とすより
  一段はっきりした音。
- **装備する(`equip`)**: きっぱりした「装着した」感触。
- **罠(`trap`)**: 不快になりすぎない範囲で、はっとする警告音
  (`design/audio-direction.md`の満腹度警告と同じ考え方: 「警告だが
  不快感の強い電子音にはしない」)。
- **予兆のひび割れ(`crackWarning`)**: 低く長い、床がきしむような
  唸り。すでにある`bossTelegraph`(息を吸うような伸び)とは別に、
  「足元が危ない」という空間的な警告にする。
- **ワープ(`teleport`)・入れ替え(`swap`)**: 一瞬で移り変わる、
  浮遊感のある高い音。2つは似た性質なので同じ音でよい。

## 仕様

`tools/audio/build.ts`の`SFX_SPECS`に7エントリ追加する。既存の
`composeSfx`だけで作れる。

| id | kind | freq目安 | duration目安 | 備考 |
|---|---|---|---|---|
| `pickup` | mallet | 990 | 0.12 | `levelUp`(freq 880)よりさらに高く短い |
| `drop` | drum | 160 | 0.12 | `pickup`と対になる低さ |
| `useItem` | mallet | 740 | 0.2 | `pickup`より低く、`checkpoint`(freq 523)より高い |
| `equip` | mallet | 440 | 0.15 | 中音域できっぱりと |
| `trap` | drum | 260 | 0.2 | `hungerWarning`(freq 140)より高く、はっとする高さ |
| `crackWarning` | drum | 55 | 0.6 | 全SFX中もっとも低く長い、床の唸り |
| `warp` | mallet | 1200 | 0.25 | 全SFX中もっとも高い、浮遊感。`teleport`・`swap`共用 |

## 再生側の接続

`src/view/stage.ts`の`buildEventHandlers`内、各`noop`を専用ハンドラに
置き換えるか、既存ハンドラの中に1行足す(見た目の挙動はすべて維持)。

- `pickup: noop` → `pickup: () => { this.audio.playSfx("pickup"); return 0; }`
- `drop: noop` → `drop: () => { this.audio.playSfx("drop"); return 0; }`
- `useItem: noop` → `useItem: () => { this.audio.playSfx("useItem"); return 0; }`
- `equip: noop` → `equip: () => { this.audio.playSfx("equip"); return 0; }`
- `trap: noop` → `trap: () => { this.audio.playSfx("trap"); return 0; }`
- `crackWarning: noop` → `crackWarning: () => { this.audio.playSfx("crackWarning"); return 0; }`
- `teleport`(305行目付近)・`swap`(309行目付近): 既存の`setPosition`
  呼び出しのあとに、それぞれ`this.audio.playSfx("warp")`を1行足す

## 受け入れ基準

1. 7つのイベントすべてで対応するSFXが鳴る。
2. `pickup`/`drop`、`teleport`/`swap`はそれぞれ同じ音を共有してよい
   (仕様どおり)。
3. `trap`・`crackWarning`は既存の`hungerWarning`・`bossTelegraph`と
   聴き分けられる。
4. 既存のSFXの波形・挙動に影響しない。

## 対象外

- アイテム種別(武器・食べ物・薬等)ごとの音の作り分け(今回は共通の
  1音で足りるという判断)
- `useItem`を投げた場合(`throwItem`)の専用音(既存の見た目だけの
  ままにする。必要になれば別途)

## 未決事項

- freq・durationの最終値(聴感で確定)
- アイテム種別ごとの音の作り分けが要るかどうか(プレイ感触を見て判断)
