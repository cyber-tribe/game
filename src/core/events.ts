import type { Dir, Vec2 } from "./grid";
import type { TutorialTipId } from "./tutorial";
import type { ActorKind, BarrelKind, StatusKind, TrapKind } from "./types";

/**
 * コアが1ターンを解決した結果として吐き出す「何が起きたか」の記録。
 * コア側は描画を一切知らず、view 側がこの配列を順に再生してアニメーションにする。
 */
export type GameEvent =
  | { type: "move"; actorId: number; from: Vec2; to: Vec2 }
  | { type: "bump"; actorId: number; dir: Vec2 }
  /** 移動を伴わずに向きだけ変える(Shift+方向) */
  | { type: "face"; actorId: number; dir: Dir }
  | { type: "attack"; attackerId: number; targetId: number }
  | { type: "damage"; actorId: number; amount: number; hpAfter: number; critical: boolean }
  | { type: "heal"; actorId: number; amount: number; hpAfter: number }
  | { type: "miss"; attackerId: number; targetId: number }
  | { type: "die"; actorId: number; kind: ActorKind; speciesId?: string }
  | { type: "spawn"; actorId: number }
  | { type: "status"; actorId: number; kind: StatusKind; turns: number }
  | { type: "statusEnd"; actorId: number; kind: StatusKind }
  | { type: "levelUp"; actorId: number; level: number }
  /** ゆめわざの習得(plan/game/archive/companion-leveling-and-arts.md) */
  | { type: "dreamArtLearned"; actorId: number; id: string; level: number }
  /**
   * レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。
   * ガルドがレベルアップし、3系統1件ずつの3択を提示できるタイミングで出る。
   * 選ぶまで(chooseSkillコマンドが来るまで)他のコマンドは進行しない
   */
  | { type: "skillChoiceOffered"; candidates: string[] }
  | { type: "pickup"; actorId: number; itemUid: number; name: string }
  | { type: "drop"; actorId: number; itemUid: number; pos: Vec2 }
  | { type: "useItem"; actorId: number; itemUid: number; name: string }
  | { type: "throwItem"; actorId: number; itemUid: number; from: Vec2; to: Vec2 }
  | { type: "equip"; actorId: number; itemUid: number; name: string }
  | { type: "trap"; pos: Vec2; kind: TrapKind }
  | { type: "teleport"; actorId: number; from: Vec2; to: Vec2 }
  | { type: "swap"; aId: number; bId: number }
  // ---- タル ----
  | { type: "liftBarrel"; actorId: number; barrelId: number; kind: BarrelKind }
  | { type: "putBarrel"; actorId: number; barrelId: number; pos: Vec2 }
  | { type: "throwBarrel"; actorId: number; barrelId: number; from: Vec2; to: Vec2 }
  | { type: "barrelBreak"; barrelId: number; pos: Vec2 }
  | { type: "explosion"; pos: Vec2; radius: number }
  /** モンスターをタルに吸い込んだ */
  | { type: "capture"; actorId: number; barrelId: number; name: string }
  /**
   * 吸い込みに失敗した。`from`はタルが飛んできた位置(投げた側)で、
   * 弾かれるノックバックの向きに使う(plan/game/barrel-capture-clarity.md)
   */
  | { type: "captureFailed"; actorId: number; name: string; from: Vec2 }
  /** タルから出して仲間になった */
  | { type: "recruit"; actorId: number; name: string }
  /**
   * 元素タルをあけた(plan/sound/archive/village-soundscape.md)。爆発・
   * モンスター入り(explosion/capture後の解放)は既存のイベントが担うので、
   * 元素タル5種(water/wind/light/stone/sleep)のときだけ出る
   */
  | { type: "barrelOpen"; barrelId: number; kind: BarrelKind; pos: Vec2 }
  /**
   * タルわざで空のタルを元素タルに変えた(plan/sound/archive/village-soundscape.md)
   */
  | { type: "barrelArtCast"; allyId: number; kind: BarrelKind }
  | { type: "descend"; depth: number }
  /** めざめの階段(チェックポイント)に足を踏み入れた */
  | { type: "checkpoint"; depth: number }
  /**
   * ボスの間の扉を開けた(plan/game/dungeon-boss-rooms.md)。BGMをボス曲へ
   * 切り替えるトリガーに使う(main.tsのupdateDiveBgm再呼び出し)
   */
  | { type: "doorOpened"; bossSpeciesId: string }
  | { type: "hungerWarning"; level: "low" | "empty" }
  | { type: "gameOver"; reason: string }
  | { type: "message"; text: string }
  /** その場方式のチュートリアルヒント。既読管理は呼び出し側(main.ts)が行う */
  | { type: "tutorialTip"; id: TutorialTipId }
  /**
   * モンスター図鑑(plan/monster-compendium.md)の「見た」通知。そのダイブで
   * 初めて視界に入った種族について1回だけ発生する。セーブへの反映は
   * 呼び出し側(main.ts)が行う
   */
  | { type: "monsterSighted"; speciesId: string }
  /**
   * 忘れ物蔵(plan/lost-and-found-vault.md)の隠し通路を見つけた。
   * セーブへの反映(SaveData.foundVaultPassages)は呼び出し側(main.ts)が行う
   */
  | { type: "secretPassageFound"; regionId: string }
  /**
   * 地方ボス(plan/region-boss-horikuinonushi.md)。予兆ターンに、大技
   * (groundSpikes)の発動位置(Tile.crackWarningを立てたマス)を通知する
   */
  | { type: "crackWarning"; positions: Vec2[] }
  /**
   * 山の芯(plan/mountain-core.md)。最終フロアの会話イベントを経験した
   * ことを通知する。セーブへの反映(SaveData.storyCleared)は
   * 呼び出し側(main.ts)が行う
   */
  | { type: "mountainCoreCleared" }
  /**
   * 真の目覚め(plan/true-awakening.md)。「はじめの夢」との決着イベントを
   * 経験したことを通知する。セーブへの反映(SaveData.trueAwakeningCleared)は
   * 呼び出し側(main.ts)が行う
   */
  | { type: "trueAwakeningCleared" }
  /**
   * 樽比べ(plan/tarukurabe-minigame.md)。10投を使い切るか全ての的に命中させて
   * 専用モードが終わったことを通知する。セーブへの反映
   * (SaveData.tarukurabeBestScore・報酬・実績)は呼び出し側(main.ts)が行う
   */
  | { type: "tarukurabeFinished"; score: number };

/** メッセージイベントを作るだけの短縮。呼び出し側の見通しのため */
export function msg(text: string): GameEvent {
  return { type: "message", text };
}

/**
 * 仲間になった瞬間の一時停止(plan/game/archive/companion-recruit-showcase.md)。
 * 1ターンぶんのイベント列を、recruitイベントの直後で区切って複数の
 * 「再生単位」に分ける。区切りの末尾は必ずrecruitイベントになる
 * (最後の区切りだけ、recruitを含まないことがある)。recruitが1つも
 * 無ければ、配列全体をそのまま1つの区切りとして返す。
 *
 * 呼び出し側(main.ts)はこの区切りを先頭から順に再生し、末尾がrecruitの
 * 区切りを再生し終えたら、そこでいったん止めて命名ダイアログを開く。
 * 1ターンで複数体が同時に仲間になった場合も、区切りが複数生まれるので
 * 自然に1体ずつ順番にダイアログが出る。
 */
export function splitEventsAtRecruits(events: readonly GameEvent[]): GameEvent[][] {
  const segments: GameEvent[][] = [];
  let current: GameEvent[] = [];
  for (const event of events) {
    current.push(event);
    if (event.type === "recruit") {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
