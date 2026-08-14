> **実装済み。** `src/main.ts`の解錠トリガーに`pointerdown`を計画書どおり
> 追加した。`AudioPlayer.resume()`(`src/audio/player.ts`)は`!this.ctx`を
> 見てから初回のみ`AudioContext`を生成する作りのため、`keydown`と
> `pointerdown`の両方が発火しても実害が無いことをコードで確認済み。
> 単体テストは追加していない(このDOMイベント配線自体は`src/main.ts`の
> 他の同種の配線と同じく既存テスト対象外)。`npx tsc --noEmit` /
> `npx vitest run`(1203件)/ `npm run build`いずれもgreen。実機での
> 音声再生確認は受け入れ基準どおりスマホ実機が必要なため未実施。

# タッチ操作でも音楽・効果音が鳴るようにする

## 経緯

スマホ版で音楽が一切再生されない。

## 原因

ブラウザの自動再生制限対策として、AudioContextの生成・resumeを
「最初のユーザー操作」で行う設計になっているが、その解錠トリガーが
**キー入力だけ**になっている:

```ts
// src/main.ts:235
window.addEventListener("keydown", () => this.audio.resume(), { once: true });
```

タッチUI(`src/ui/touch-controls.ts`)は `Input.press/release` を
直接呼ぶ設計で、実際の`keydown`イベントは発生させない。そのため
タッチだけで遊んでいる端末ではAudioContextが永遠に解錠されず、
無音のままになる。

## 修正方針

解錠トリガーに `pointerdown` を追加する:

```ts
window.addEventListener("keydown", () => this.audio.resume(), { once: true });
window.addEventListener("pointerdown", () => this.audio.resume(), { once: true });
```

- `pointerdown` はユーザージェスチャ扱いなので、iOS Safariの
  自動再生制限下でも `AudioContext.resume()` が有効に働く。
- `AudioPlayer.resume()`(`src/audio/player.ts`)は複数回呼ばれても
  安全な作りなので、キーとタッチの両方が発火しても問題ない。
- マウス操作(デスクトップでキーより先にクリックした場合)でも
  解錠が早まるだけで、挙動は変わらない。

## 受け入れ基準

1. スマホ実機で、画面に一度触れたあとからBGM・効果音が鳴る
   (タイトル→ダイブの通常の流れで音が出る)。
2. キーボード操作のデスクトップでの再生挙動は従来どおり。

## 対象外

- iOSのサイレントスイッチ(マナーモード)中の消音挙動。WebAudioは
  マナーモードでも鳴る場合と鳴らない場合があるが、OS側の仕様に
  委ね、ゲーム側では対応しない。
