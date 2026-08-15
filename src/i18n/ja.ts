/**
 * 多言語対応の土台(plan/i18n-foundation.md)。優先順位1(操作に直結する
 * システムメッセージ・メニュー・ステータス表示)のうち、第1段階として
 * 移行した文言だけをここに置く。モンスター名・アイテム名そのもの
 * (優先順位2)・flavorText(優先順位3)はスコープ外で、まだ`t()`化していない。
 */
export const ja: Record<string, string> = {
  // HUD(src/view/hud.ts)
  "ui.hud.hp": "HP",
  "ui.hud.satiety": "まんぷく",
  "hud.depth": "地下 {depth} 階",
  "hud.level": "Lv {level}",
  "hud.expMax": "経験値 最大",
  "hud.expToNext": "次のLvまで {next}",
  "hud.carrying": "かかえ中: {name}",
  // 捕獲の見込み(plan/game/barrel-capture-clarity.md)。厳密な%は出さず3段階だけ見せる
  "hud.captureOutlook": "{name}: {tier}",
  "hud.captureTier.likely": "入りそう◎",
  "hud.captureTier.even": "五分○",
  "hud.captureTier.hard": "難しい△",
  "hud.alliesTitle": "なかま",
  "hud.stance": "構え: {name}",
  "hud.keyHelpTitle": "操作説明",
  "hud.keyHelpHint": "Hでとじる",
  // 文言のタッチ対応(plan/game/mobile-layout-redesign.md): タッチ端末では「≡」から開閉する
  "hud.keyHelpHintTouch": "「≡」→操作説明でとじる",
  // メッセージ帯・全文ログモーダル(plan/game/mobile-layout-redesign.md)
  "ui.hud.logModalTitle": "ログ",
  "ui.hud.logModalClose": "とじる",

  // もちものメニュー(src/ui/menu.ts)
  "ui.menu.inventory": "もちもの  {count} / {max}",
  "menu.empty": "何も持っていない。",
  "menu.equip": "そうびする",
  "menu.unequip": "はずす",
  "menu.eat": "たべる",
  "menu.wave": "ふる",
  "menu.use": "つかう",
  "menu.throw": "なげる",
  "menu.drop": "おく",
  "menu.hint": "↑↓ 選ぶ / Enter 決定 / Esc もどる",

  // 設定画面・列19(src/ui/town.ts、plan/settings-screen.md)
  "ui.settings.title": "設定",
  "ui.settings.messageSpeedLabel": "メッセージ・演出の速さ: {value}",
  "ui.settings.speedSlow": "ゆっくり",
  "ui.settings.speedNormal": "ふつう",
  "ui.settings.speedFast": "はやい",
  "ui.settings.tutorialTips": "操作説明を見る",
  "ui.settings.keyReference": "キー配置を確認する",
  "ui.settings.localeLabel": "げんご: {value}",
  "ui.settings.localeJa": "日本語",
  "ui.settings.descSpeed": "Enterでメッセージ・演出の速さを切り替える(ふつう→はやい→ゆっくり→ふつう…)。",
  "ui.settings.descTips": "Enterでこれまでの操作説明を一覧できる。",
  "ui.settings.descKeys": "Enterでキー配置を一覧できる(再割り当てはできない)。",
  "ui.settings.descLocale": "Enterでげんごを切り替える(現在は日本語のみ選べる)。",
  "ui.settings.hint": "← 列を移る / ↑↓ 選ぶ / Enter 切り替え・一覧を見る / Space もぐる",
  "ui.settings.hintSubView": "Enter / Esc でもどる",

  // システムメッセージ(src/game.ts)。{name}はモンスター名など、翻訳対象外の変数として差し込む
  "msg.descend": "地下{depth}階に降りた。",
  "msg.checkpointReached": "地下{depth}階のめざめの階段で区切って持ち帰った!",
  "msg.expGained": "経験値を{exp}かくとく。",
  "msg.levelUp": "レベルが{level}に上がった!",
  "msg.recruit": "{name}が仲間になった!",
  "msg.captureSuccess": "{name}をタルに吸い込んだ!",
  // 捕獲失敗(plan/game/barrel-capture-clarity.md)。タルが落ちて拾い直せることまで伝える。
  // 置き場所が無くて砕けた場合だけ、拾える前提のない側の文言を出す
  "msg.captureFailed": "{name}はタルから逃れた! タルはその場に落ちた。",
  "msg.captureFailedBarrelLost": "{name}はタルから逃れた!",
  "msg.satietyDrained": "満腹度が{amount}減った!",
  "msg.goldPicked": "{amount}ゴールドを拾った。",
};
