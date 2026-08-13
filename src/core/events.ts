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
  /** 吸い込みに失敗した */
  | { type: "captureFailed"; actorId: number; name: string }
  /** タルから出して仲間になった */
  | { type: "recruit"; actorId: number; name: string }
  | { type: "descend"; depth: number }
  /** めざめの階段(チェックポイント)に足を踏み入れた */
  | { type: "checkpoint"; depth: number }
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
