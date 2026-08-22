import type { RunSkillId } from "../../core/types";
import type { Rng } from "../../core/rng";
import type { GameEvent } from "../../core/events";
import { rollRunSkillChoices, runSkillDef } from "../../entities/runSkills";

/**
 * レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)の
 * 提示状態。pendingSkillChoiceがある間はchooseSkill以外のコマンドを
 * 受け付けない
 */
export interface SkillChoiceState {
  pendingSkillChoice: RunSkillId[] | null;
  pendingLevelUpChoices: number;
}

export function createSkillChoiceState(): SkillChoiceState {
  return { pendingSkillChoice: null, pendingLevelUpChoices: 0 };
}

export function isAwaitingSkillChoice(state: SkillChoiceState): boolean {
  return state.pendingSkillChoice !== null;
}

export interface OfferNextSkillChoiceArgs {
  state: SkillChoiceState;
  rng: Rng;
  runSkills: readonly RunSkillId[];
  events: GameEvent[];
}

/**
 * 残っている選択肢があれば1つぶん3択を引いて提示する。系統がすべて
 * 習得済みで1件も引けなければ(全18件習得済み)、その分は静かに消費する
 */
export function offerNextSkillChoice(args: OfferNextSkillChoiceArgs): void {
  const { state, rng, runSkills, events } = args;
  if (state.pendingLevelUpChoices <= 0) return;
  const candidates = rollRunSkillChoices(rng, runSkills);
  if (candidates.length === 0) {
    state.pendingLevelUpChoices = 0;
    return;
  }
  state.pendingSkillChoice = candidates;
  events.push({ type: "skillChoiceOffered", candidates });
}

export interface ResolveSkillChoiceArgs {
  state: SkillChoiceState;
  id: RunSkillId;
  runSkills: RunSkillId[];
  rng: Rng;
  events: GameEvent[];
}

/** 提示中の3択から1つ選ぶ。候補外のidは無視する(不正な選択・二重送信対策) */
export function resolveSkillChoice(args: ResolveSkillChoiceArgs): void {
  const { state, id, runSkills, events } = args;
  if (!state.pendingSkillChoice?.includes(id)) return;
  runSkills.push(id);
  state.pendingSkillChoice = null;
  state.pendingLevelUpChoices = Math.max(0, state.pendingLevelUpChoices - 1);
  events.push({ type: "message", text: `『${runSkillDef(id).name}』を身につけた!` });
  offerNextSkillChoice(args);
}
