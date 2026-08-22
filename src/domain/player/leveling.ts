import type { PlayerState, TrainingFocus } from "../../entities/player";
import { gainExp } from "../../entities/player";
import type { GameEvent } from "../../core/events";
import { t } from "../../i18n";

export interface GainPlayerExpFromKillArgs {
  player: PlayerState;
  exp: number;
  trainingFocus: TrainingFocus;
  events: GameEvent[];
  onLevelUp(levels: number): void;
}

/** 敵撃破によるプレイヤーの経験値獲得〜レベルアップイベント生成。exp<=0なら何もしない */
export function gainPlayerExpFromKill(args: GainPlayerExpFromKillArgs): void {
  const { player, exp, trainingFocus, events, onLevelUp } = args;
  if (exp <= 0) return;
  const levels = gainExp(player, exp, trainingFocus);
  events.push({ type: "message", text: t("msg.expGained", { exp }) });
  for (let i = 0; i < levels; i++) {
    events.push({ type: "levelUp", actorId: player.id, level: player.level });
    events.push({ type: "message", text: t("msg.levelUp", { level: player.level }) });
  }
  if (levels > 0) {
    events.push({ type: "tutorialTip", id: "levelUp" });
    onLevelUp(levels);
  }
}
