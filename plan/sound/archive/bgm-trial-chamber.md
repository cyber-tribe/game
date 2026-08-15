> **実装済み。** `tools/audio/build.ts` の `BGM_SPECS` に計画書どおりの
> 値(`trial-chamber`、116bpm・2拍子・16小節・mallet0.45/drum0.65/
> flute0.05/string0.1・`wet 0.2/roomSize 0.4/damping 0.15`)で
> `trial-chamber` エントリを追加し、`public/audio/bgm/trial-chamber.wav`
> (約16.6秒)を生成した。新しい合成機能は不要だった(計画書の見込みどおり)。
> `src/main.ts` の `bgmForDive` に `TRIAL_CHAMBER_ID` の分岐を追加し、
> ボス・階ごとに切り替えず通しで1曲流す。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(105ファイル/1349件、
> 既存の決定性テストで新曲もカバーされる)・`npm run build`・
> `npm run audio` いずれも成功。`public/audio/`合計は約25MB。

# 腕試しの間のBGM

## 経緯・現状

腕試しの間(`trialChamber`、地方ボスの再戦だけのボスラッシュ)は
専用BGMが無く、ダイブ中も直前の曲(通常は村のテーマ)が流れ続ける
(`src/main.ts` の `bgmForDive` が対象外にしているため)。ボスの
再戦なのに村のテーマのまま、が現状の体験。専用の1曲を作る。

## 曲の狙い

- **道場の張り詰め**: 物語上の危機ではなく、腕を磨くための再戦。
  ボス戦テーマ(`boss.wav`、初見の緊張)とは性格を分け、
  「呼吸を整えて、次」という修行場の集中にする。
- **ボス戦テーマの姉妹曲**: 楽器バランスはボス戦と同系(太鼓厚め)に
  して血縁を感じさせつつ、テンポと拍子で差を付ける。
- 休憩を挟みつつ連続で相手取る構成(`plan/game/archive/hidden-dungeon.md`)
  なので、**階やボスごとに曲を切り替えず1曲で通す**。テンションの
  上げ下げは曲でなくプレイの側にある。

## 仕様

`tools/audio/build.ts` の `BGM_SPECS` に1エントリ追加する。

| 項目 | 値(目安。聴感で調整可) |
|---|---|
| id | `trial-chamber` |
| ファイル | `public/audio/bgm/trial-chamber.wav`(ステレオ、22.05kHz) |
| seed | 6000(聴感で選び直してよい) |
| tempoBpm | 116(ボス108よりさらに速く) |
| beatsPerBar | **2**(2拍子の刻み。第七地方の囃子と同じ拍子だが、編成が太鼓寄りなので囃子ではなく稽古の掛け声に聞こえる) |
| bars | 16(2拍子で16小節=約16.5秒。短めでよい) |
| weights | mallet 0.45 / drum 0.65 / flute 0.05 / string 0.1 |
| reverb | wet 0.2 / roomSize 0.4 / damping 0.15(輪郭優先。板張りの間) |

新しい合成機能は不要。既存の `TrackParams` だけで作れる。

## 再生側の接続

`src/main.ts` の `bgmForDive` に分岐を1つ足す:
`dungeonId === "trialChamber"` なら `"trial-chamber"` を返す。
表の寝穴のボス階判定(`REGION_BOSS_FLOORS`)はこのダンジョンには
効かないので、全階この曲で通る(意図どおり)。

## 受け入れ基準

1. 腕試しの間に入ると専用曲へ切り替わり、帰還で村のテーマに戻る。
2. ボス戦テーマ(`boss.wav`)と聴き分けられる(テンポ・拍子が違う)。
3. 表の寝穴のボス階では従来どおり `boss.wav` が流れる。

## 対象外

- ボスごとの導入差し替え(`design/audio-direction.md` の構想。
  表の寝穴のボス戦側の課題であり、この文書では扱わない)
- 撃破ごとのファンファーレSFX

## 未決事項

- シード・重みの最終値(聴感で確定)
- 2拍子で軽くなりすぎる場合、4拍子・112bpmへ落とす代替案
