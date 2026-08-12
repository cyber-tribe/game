import type { Vec2 } from "./grid";
import type { TutorialTipId } from "./tutorial";
import type { ActorKind, BarrelKind, StatusKind, TrapKind } from "./types";

/**
 * コアが1ターンを解決した結果として吐き出す「何が起きたか」の記録。
 * コア側は描画を一切知らず、view 側がこの配列を順に再生してアニメーションにする。
 */
export type GameEvent =
  | { type: "move"; actorId: number; from: Vec2; to: Vec2 }
  | { type: "bump"; actorId: number; dir: Vec2 }
  | { type: "attack"; attackerId: number; targetId: number }
  | { type: "damage"; actorId: number; amount: number; hpAfter: number; critical: boolean }
  | { type: "heal"; actorId: number; amount: number; hpAfter: number }
  | { type: "miss"; attackerId: number; targetId: number }
  | { type: "die"; actorId: number; kind: ActorKind }
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
  | { type: "monsterSighted"; speciesId: string };

/** メッセージイベントを作るだけの短縮。呼び出し側の見通しのため */
export function msg(text: string): GameEvent {
  return { type: "message", text };
}
