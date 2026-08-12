# ヨリシロの気分の視覚演出

`plan/yorishiro-moods.md`(数値面の補正)・`plan/audio-playback.md`
(音のレイヤー)に続く3本目の柱として、**気分ごとの軽い視覚演出**を
新規に提案する。`design/yorishiro-moods.md`は音の演出には触れているが
(`design/audio-direction.md`側で「レイヤーを足す/引く」と言及)、画面
そのものの見え方には触れていなかった。新しいコンテンツを増やすのではなく、
**既存の`plan/yorishiro-moods.md`が既に持つ6種の気分に、既存の
レンダリング設定(`src/view/renderer.ts`のFog・AmbientLight・
DirectionalLight)を使った軽い色調変化を足すだけ**の提案。

## 既存の土台

`src/view/renderer.ts`は既に固定値でFog・環境光・平行光源を持っている。

```ts
this.scene.background = new THREE.Color(0x05060c);
this.scene.fog = new THREE.Fog(0x070912, 16, 34);
this.scene.add(new THREE.AmbientLight(0x6674a0, 1.7));
const key = new THREE.DirectionalLight(0xaec2f5, 0.85);
```

新しいシェーダー・新しいポストプロセスは作らず、**これらの色・強度の
値を気分ごとに差し替えるだけ**で実装する(`plan/costumes.md`が
`actorView.ts`の`color.multiply`で衣装の色調を変えたのと同じ、
既存の仕組みへの薄い上乗せ)。

## 気分ごとの調整(確定案)

```ts
export interface MoodVisual {
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambientColor: number;
  ambientIntensity: number;
}

export const MOOD_VISUALS: Record<MoodId, MoodVisual> = {
  calm:     { fogColor: 0x070912, fogNear: 16, fogFar: 34, ambientColor: 0x6674a0, ambientIntensity: 1.7 }, // 既定値そのまま
  shallow:  { fogColor: 0x0a0d1a, fogNear: 18, fogFar: 38, ambientColor: 0x7a86b8, ambientIntensity: 1.9 }, // 心持ち明るく、視界が開けた印象
  deep:     { fogColor: 0x05060c, fogNear: 12, fogFar: 28, ambientColor: 0x4a5480, ambientIntensity: 1.3 }, // 濃い霧、暗め
  restless: { fogColor: 0x120810, fogNear: 14, fogFar: 30, ambientColor: 0x8a5a6a, ambientIntensity: 1.6 }, // 赤みがかった不穏な色
  omen:     { fogColor: 0x08101a, fogNear: 16, fogFar: 34, ambientColor: 0x6a8aa0, ambientIntensity: 1.8 }, // 淡く青白い、澄んだ印象
  chikamichi: { fogColor: 0x100c06, fogNear: 16, fogFar: 34, ambientColor: 0x9a8060, ambientIntensity: 1.75 }, // 琥珀色寄り、商いの気配
};
```

`plan/yorishiro-moods.md`の`Game.mood`が確定した時点(ダイブ開始時)に
1回だけ、`renderer.ts`の該当プロパティをこの値へ差し替える。**ダイブ中に
気分が変わることはない**(`plan/yorishiro-moods.md`の既存方針どおり)ので、
フェード等のアニメーションは不要。ロード時に即座に反映するだけでよい。

## 地方固有ギミック(地形の色)との関係

`plan/wetland-quagmire.md`等の地方固有ギミックが将来タイルの見た目
(色・テクスチャ)を持つ場合、**その地方の基礎色に気分の色調を掛け合わせる
形で共存させる**(`plan/yorishiro-moods.md`が数値面で確立した「地方の
基礎値 × 気分の係数」という合成方針を、視覚面でも踏襲する)。本文書
自体は地方固有の色は扱わず、気分によるFog/環境光の調整だけに留める。

## 拠点(村)には適用しない

`design/world.md`の「麓にいる限りは満腹度も減らず…現実側だから」という
方針に合わせ、**気分の視覚演出はダンジョン内だけに適用し、拠点
(ネンネ村)は常に既定の見た目のまま**にする。現実(麓)/夢(ダンジョン)の
対比を、視覚面でも一貫させる。

## 実装への影響の見積もり

- `src/entities/moods.ts`(`plan/yorishiro-moods.md`で新設予定):
  `MoodVisual`・`MOOD_VISUALS`を追加。
- `src/view/renderer.ts`: `Fog`・`AmbientLight`のプロパティを、
  コンストラクタ固定値から「ダイブ開始時に指定できる」形に変更する
  (`setMoodVisual(visual: MoodVisual)`のような1メソッドを追加)。
- `src/main.ts`: ダイブ開始時、`plan/yorishiro-moods.md`の`Game.mood`
  から対応する`MoodVisual`を引いて`renderer.setMoodVisual(...)`を呼ぶ。

## 未決事項

- 色・強度の具体的な数値の最終調整(実装後の見た目で判断)。
- `DirectionalLight`(平行光源)の色も気分ごとに変えるか(本文書は
  Fog・AmbientLightの2点に絞ったが、平行光源まで含めるかは実装時の
  見た目次第)。
