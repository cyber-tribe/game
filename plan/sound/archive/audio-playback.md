> **実装済み。** `src/audio/player.ts`(新規)に計画書どおりの
> `AudioPlayer`クラスを実装(`resume`/`playSfx`/`setBgm`/`setMoodLayer`/
> `setMuted`/`setMasterVolume`)。`AudioContext`はコンストラクタ引数
> (`createContext`/`fetchAudio`)で差し替え可能にし、テスト
> (`tests/audio-playback.test.ts`)ではフェイクの`AudioContext`相当
> オブジェクトを注入して、実際のWeb Audio APIが無いnode環境でも
> resume前後の挙動・バッファのキャッシュ・setBgmの同idスキップ・
> setMoodLayerの二重起動防止を検証した。
>
> `resume()`は`src/main.ts`側の`window.addEventListener("keydown", ...,
> { once: true })`から、最初のキー入力のタイミングで1回だけ呼ぶ。
>
> **SFXの接続**は計画書の指示どおり`src/view/stage.ts`の`applyEvents`
> (既存のイベント再生ループ)に実装した。ただし`capture`/`levelUp`/
> `checkpoint`/`hungerWarning`は元々このループでは(見た目に影響しない
> ため)`default`扱いで無視されていたイベント種別だったので、新しく
> caseを追加した。ボスの予兆は計画書が指す`"telegraph"`コマンドの
> `message`イベント専用の新フィールドを増やす代わりに、`game.ts`が
> 組み立てる文言が`――!`で終わることを確認して判定した(現行コードで
> この語尾を使っているのはボス予兆のメッセージだけであることを確認済み)。
>
> **BGMの切り替え**は`src/main.ts`の`presentFloor()`(ダイブ開始・
> オートセーブ復帰の共通経路)・`submit()`のフロア変更時・`showTown()`に
> それぞれ実装。地方境界は`REGION_SIZE`(`plan/region-expansion.md`)から
> `region${Math.floor((depth - 1) / REGION_SIZE) + 1}`で算出し、
> `REGION_BOSS_FLOORS[depth]`があれば`boss`を優先する。表の寝穴
> (`MAIN_CAVE_ID`)・真の目覚め(`TRUE_AWAKENING_ID`)以外のダンジョン
> (夜ごとの夢・腕試しの間)は本文書の対象外のため、BGMを切り替えず
> 直前の曲を維持する(意図的な範囲外)。
>
> **ヨリシロの気分レイヤー**(`setMoodLayer`)はエンジン側のAPIとしては
> 実装したが、実際にどのタイミングでどの気分idのレイヤーを鳴らすか
> という具体的な連携は、本文書に明記された呼び出しタイミング表に
> 含まれていなかったため見送った(将来`mood-visual-effects.md`側や
> 別文書で連携する余地として残す)。
>
> **設定の永続化**は`SaveData.audioMuted`/`audioVolume`(既定`false`/
> `0.7`)を追加し、`setAudioMuted`/`setAudioVolume`(0..1にクランプ)を
> `src/save.ts`に実装。`src/ui/town.ts`にはまだ独立した「設定画面」が
> 無いため(`plan/settings-screen.md`が別途その置き場所を確定させる
> 予定)、既存の`fontSize`の列(column 14)と同じパターンで、新しい
> 列(column 18、「音」)として実装した。↑↓でミュート/音量の行を選び、
> Enterでミュート切り替え・音量を10%刻みで循環させる。
>
> `public/audio/`には、計画書が明示的に許容している「プレースホルダー
> 無音ファイル」として、`bgm/`(village・region1〜8・boss・
> true-awakening)・`sfx/`(capture・levelUp・hungerWarning・
> checkpoint・explosion・bossTelegraph)の空(0バイト)の`.ogg`を配置
> した。実行環境に`ffmpeg`/`sox`等の音声エンコードツールが無かった
> ための実務的な判断で、`decodeAudioData`が失敗しても`AudioPlayer`は
> 例外を投げずに黙って再生をスキップする(ブラウザでのスモークテストで
> コンソールエラー無しを確認済み)。本物の楽曲・効果音の制作は計画書
> どおりスコープ外。
>
> テストは`tests/audio-playback.test.ts`(`AudioPlayer`の各メソッド・
> `setAudioMuted`/`setAudioVolume`)、`tests/save-compat.test.ts`
> (v10フィクスチャでの既定値補完・新規v11フィクスチャでの保持)で検証。
> ブラウザでも拠点画面の「音」列でミュート切り替え・音量変更が
> localStorageへ反映されることを確認済み。

# サウンド再生の仕組み

`design/audio-direction.md` が「実装(Web Audio APIでの再生方法など)は
別途`plan/`側の課題とする」としていた、再生エンジン側の仕組みを実装可能な
形に落とす。**楽曲・効果音そのものの制作(作曲・録音)は本文書の
スコープ外**とし、あくまで「音声アセットが用意された前提で、どう
鳴らすか」という配線部分だけを扱う(`design/audio-direction.md` の
未決事項どおり、制作体制は別途)。

## 資産の置き場所

`public/models/`(3Dモデル)と同じ考え方で、`public/audio/` を新設する。

```
public/audio/
  bgm/
    village.ogg
    region1.ogg 〜 region8.ogg     # design/regions.mdの8地方
    boss.ogg                       # 地方ボス戦共通テーマ
    true-awakening.ogg             # plan/true-awakening.md
  sfx/
    capture.ogg      # タルでの捕獲成功
    levelUp.ogg
    hungerWarning.ogg
    bossTelegraph.ogg # 予兆(plan/archive/region-bosses.md)
    ...
```

音源ファイル自体は本文書では用意しない(プレースホルダー無音ファイル、
または実装セッションが別途手配する)。形式は`.ogg`(Vorbis)を第一候補と
する。README記載の`.glb`肥大化防止と同じ考え方で、圧縮率を優先する。

## 再生エンジン: `src/audio/player.ts`

```ts
export class AudioPlayer {
  private ctx: AudioContext | undefined; // 初回のユーザー操作まで生成しない(自動再生制限対策)
  private master: GainNode | undefined;
  private bgmGain: GainNode | undefined;
  private sfxGain: GainNode | undefined;
  private buffers = new Map<string, AudioBuffer>(); // 遅延ロード・キャッシュ
  private currentBgm: { id: string; source: AudioBufferSourceNode; gain: GainNode } | undefined;
  private moodLayers = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();

  resume(): void; // 初回のクリック/キー入力で呼ぶ。AudioContextを生成・resumeする
  playSfx(id: string): void;
  setBgm(id: string, crossfadeMs?: number): void; // 現在と同じidなら何もしない(無音の継ぎ目回避)
  setMoodLayer(id: string, active: boolean): void; // design/yorishiro-moods.mdのレイヤー足し引き
  setMuted(muted: boolean): void;
  setMasterVolume(v: number): void; // 0..1
}
```

- 音源はURLから`fetch`→`decodeAudioData`で1度だけデコードし、
  `buffers`にキャッシュする(同じ曲・同じ効果音の再生要求のたびに
  取り直さない)。
- **`AudioContext`はページロード時には生成しない。** ブラウザの自動再生
  制限により、ユーザー操作前の生成・再生は失敗するため、既存の入力
  受付(矢印キー等の最初の1回)のタイミングで`resume()`を呼ぶ。
- BGMは`AudioBufferSourceNode`をループ再生(`loop = true`)し、切り替え
  時は新トラックの`GainNode`を0から、旧トラックを1から、それぞれ
  `crossfadeMs`かけて線形にフェードする(`design/audio-direction.md`の
  「レイヤーの足し引き」方針と同じ考え方をBGM切り替えにも適用)。
- ヨリシロの気分レイヤー(`design/yorishiro-moods.md`)は、現在の地方BGMに
  重ねる**追加トラック**として扱う。`setMoodLayer(id, true)`で
  対応する短いループ音源を0音量から立ち上げ、`false`でフェードアウト
  して停止する。曲を丸ごと差し替えない、という設計方針どおり。

## `GameEvent` との接続

`src/view/stage.ts`(既存のイベント再生ループ)に、`GameEvent`の種類ごとに
SFXを1つ紐付けるだけの、小さなマッピングテーブルを追加する。

| `GameEvent.type` | SFX |
|---|---|
| `capture` | `capture` |
| `levelUp` | `levelUp` |
| `hungerWarning`(`level: "empty"`になった瞬間だけ) | `hungerWarning` |
| `checkpoint` | `checkpoint` |
| `explosion` | `explosion` |
| ボスの`"telegraph"`コマンドに対応する`message`イベント(`plan/archive/region-bosses.md`) | `bossTelegraph` |

新しいイベント種別は増やさない。既存の`for (const event of events)`ループ
に、`type`ごとの分岐でSFX呼び出しを差し込むだけで実装できる。

## BGMの切り替えタイミング

- 拠点(`src/ui/town.ts`)表示時: `village`
- ダイブ中、`depth`が地方境界をまたいだとき(`plan/region-expansion.md`の
  地方境界表): 該当地方のBGMへクロスフェード
- 地方ボスの階(`REGION_BOSS_FLOORS`/`REGION_BOSS_ORDER`)に入ったとき:
  `boss`
- `plan/true-awakening.md` の局面に入ったとき: `true-awakening`

いずれも既存の`enterFloor`(`src/game.ts`)が出す`descend`イベント等を
`main.ts`側で監視し、`setBgm`を呼ぶだけで実装できる。地形生成側の変更は
不要。

## 設定の永続化

`SaveData` に音量設定を追加する。

```ts
export interface SaveData {
  // ...既存フィールド
  audioMuted: boolean;
  audioVolume: number; // 0..1、既定0.7程度
}
```

`src/ui/town.ts`の設定画面(`fontSize`と同じ並び)にミュート切り替え・
音量スライダーを追加する。

## 実装への影響の見積もり

- `src/audio/player.ts`(新規): 上記`AudioPlayer`クラス。
- `src/view/stage.ts`: `GameEvent`再生ループへのSFX呼び出し追加。
- `src/main.ts`: BGM切り替えのトリガー(地方境界・ボス階・拠点/ダイブの
  切り替わり)、初回入力での`resume()`呼び出し。
- `src/save.ts`: `audioMuted`・`audioVolume`の追加、既存のsanitize処理・
  save-compat新フィクスチャ。
- `src/ui/town.ts`: 音量・ミュートの設定UI。
- `public/audio/`: プレースホルダー音源(実装時に無音または仮素材で
  補い、本番音源は別途差し替える前提とする)。

## 未決事項

- 実際の楽曲・効果音の制作(`design/audio-direction.md`の未決事項を
  継承。本文書では扱わない)。
- モバイル環境でのAudioContext制限への追加対応が必要かどうか
  (README記載の対象環境がブラウザ全般であることを踏まえ、実装時に
  確認する)。
- クロスフェードの具体的なミリ秒数・SFXの同時再生数の上限。
