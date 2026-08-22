import type { AllyActor, FloorState, RunSkillId } from "./types";
import type { PlayerState, TrainingFocus } from "../entities/player";

export type RunStatus = "playing" | "dead" | "cleared";

/**
 * ダイブ中オートセーブのスナップショット。ターン解決のたびに書き出し、
 * 復帰した瞬間に消費される「1回限りのクラッシュ対策」(plan/mid-dive-autosave.md)。
 * `previousGimmick`・`monsterHouseWarned`・`firstStrikeAvailable` のような
 * 演出寄りの内部状態は含めない(復帰時は初期値からやり直しても実害が小さいため)。
 */
export interface RunSnapshot {
  rngState: number;
  maxDepth: number;
  depth: number;
  floor: FloorState;
  player: PlayerState;
  allies: AllyActor[];
  status: RunStatus;
  turnCount: number;
  endReason: string;
  actorIdCounter: number;
  itemUidCounter: number;
  barrelIdCounter: number;
  /** 鍛え方(plan/protagonist-training.md)。復帰後もこのダイブの方針を引き継ぐ */
  trainingFocus: TrainingFocus;
  /** 潜っているダンジョン(plan/multiple-dungeons.md)。復帰後の階移動で出現テーブルを揃えるのに使う */
  dungeonId: string;
  /** 樽比べ(plan/tarukurabe-minigame.md)。専用モード中でなければ常に既定値 */
  tarukurabeScore: number;
  tarukurabeBarrelsLeft: number;
  tarukurabeScoredLanes: number[];
  /** レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。ダイブ限り */
  runSkills: RunSkillId[];
  pendingSkillChoice: RunSkillId[] | null;
  pendingLevelUpChoices: number;
}

/**
 * 樽比べ(plan/tarukurabe-minigame.md)。満点。的の配点(近1・中2・遠3)の合計と
 * 一致させている。計画書の報酬節は「満点9点」としていたが、配点表(本文書内で
 * 「確定」扱い)と整合しないため、配点表を正としてこちらを6に読み替えた
 * (詳細はアーカイブノート参照)。save/(実績・報酬判定)からも参照するためexportする
 */
export const TARUKURABE_PERFECT_SCORE = 6;
