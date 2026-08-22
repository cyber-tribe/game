import type { GameEvent } from "../../core/events";
import type { AllyActor, FloorState, MonsterActor } from "../../core/types";
import { type BondStage, bondStage } from "../../entities/companionBond";
import { MOUNTAIN_CORE_ID } from "../../entities/dungeons";

/**
 * 山の芯(plan/mountain-core.md): 最終フロア到達時の固定の会話イベント。
 * design/characters.mdの頭目マサカリのドンズルを踏まえた短い掛け合い。
 * 台詞の実際の執筆はプランのスコープ外だったため、実装時に新規に書いた
 * (design/story.mdの「倒す」より「山の正体を思い知らせ、出て行かせる」
 * という終章方針どおり、戦闘には発展させない)
 */
const MOUNTAIN_CORE_DIALOGUE: readonly string[] = [
  "マサカリのドンズル「ここまで来たか、小僧。だが引き返せ、この山はワシらの資源だ」",
  "ガルド「――違う。この山は、ヨリシロっていう生きものの、眠りそのものなんだ」",
  "ドンズル「ヨリシロ……? 寝言を抜かすな。夢のかけらは金になる、それで十分だろう」",
  "杭を打ち込む音が響くたび、あたり一帯がかすかに震えているのに気づく。",
  "ドンズル「……まさか、本当に……?」",
  "ドンズル「……分かった。今日のところは引き上げる。だが、忘れたわけじゃないぞ」",
  "近道屋の一団が、山を降りていく足音が遠ざかっていった。",
];

/**
 * 真の目覚め(plan/true-awakening.md): 「はじめの夢」との決着イベント。
 * design/postgame.mdの「もう独りではない」と伝わる決着方針どおり、
 * HPが0になっても通常のkillActor(討伐・ドロップ・経験値)処理には進まず、
 * この専用イベントに分岐する。台詞の執筆はプランのスコープ外だったため、
 * 実装時に新規に書いた
 */
const TRUE_AWAKENING_INTRO: readonly string[] = [
  "はじめの夢「……だれも、いない。ずっと、そうだった」",
  "はじめの夢「あなたも、いつか、いなくなる。みんな、そうだった」",
];

/**
 * 締めの一言は、現在連れている仲間のうち最も絆(なじみ)が深い個体の段階で
 * 出し分ける。仲間を1体も連れていない場合は別枠(TRUE_AWAKENING_FAREWELL_SOLO)
 */
const TRUE_AWAKENING_FAREWELL_SOLO = "ガルド「独りで来たけど……ここまで、独りじゃなかったよ」";
const TRUE_AWAKENING_FAREWELL_BY_BOND_STAGE: Readonly<Record<BondStage, string>> = {
  none: "ガルド「まだ知り合ったばかりの仲間だけど、ちゃんとここにいるよ」",
  familiar: "ガルド「一緒に潜ってきた仲間が、ここにいる」",
  close: "ガルド「ずっと並んで歩いてきた仲間が、ちゃんとここにいるよ」",
  irreplaceable: "ガルド「かけがえのない仲間と、ここまで来た。もう独りじゃない」",
};

const TRUE_AWAKENING_CLOSING: readonly string[] = [
  "はじめの夢は、ふっと軽くなったように溶けて消えていった。",
  "山は、ゆっくりとした寝息に戻っていく。",
];

/**
 * maybePlayMountainCoreEnding/trueAwakeningEndingが必要とする、narrowな
 * Gameアクセス(plan/game/ddd-phase8-game-facade.md)。
 */
export interface StoryMomentsContext {
  dungeonId: string;
  depth: number;
  maxDepth: number;
  floor: FloorState;
  allies: AllyActor[];
  /** trueAwakeningEnding専用: status=cleared, gameOverの一連の処理 */
  completeRun(reason: string, events: GameEvent[]): void;
}

export function maybePlayMountainCoreEnding(events: GameEvent[], ctx: StoryMomentsContext): void {
  if (ctx.dungeonId !== MOUNTAIN_CORE_ID || ctx.depth < ctx.maxDepth) return;
  for (const line of MOUNTAIN_CORE_DIALOGUE) {
    events.push({ type: "message", text: line });
  }
  events.push({ type: "mountainCoreCleared" });
}

/** 現在連れている仲間のうち、最も絆(なじみ)が深い個体の段階に応じた締めの一言を返す */
function trueAwakeningFarewellLine(allies: readonly AllyActor[]): string {
  if (allies.length === 0) return TRUE_AWAKENING_FAREWELL_SOLO;
  const stageRank: readonly BondStage[] = ["none", "familiar", "close", "irreplaceable"];
  let best: BondStage = "none";
  for (const ally of allies) {
    const stage = bondStage(ally.bondSuccessCount ?? 0);
    if (stageRank.indexOf(stage) > stageRank.indexOf(best)) best = stage;
  }
  return TRUE_AWAKENING_FAREWELL_BY_BOND_STAGE[best];
}

/**
 * 真の目覚め(plan/true-awakening.md): 「はじめの夢」のHPが0になった瞬間に
 * killActorの代わりに呼ぶ。討伐・ドロップ・経験値は発生させず、絆(なじみ)
 * に応じた締めの一言を挟んでダイブを踏破扱いで終える
 */
export function trueAwakeningEnding(target: MonsterActor, events: GameEvent[], ctx: StoryMomentsContext): void {
  target.alive = false;
  target.hp = 0;
  events.push({ type: "die", actorId: target.id, kind: target.kind, speciesId: target.speciesId });
  // summonEcho(地方ボス、plan/region-boss-kodamanonushi.md)で分身を出していた
  // 場合、本体と同時に消す(killActorの同等処理を踏襲)
  for (const echo of ctx.floor.actors) {
    if (echo.kind !== "monster") continue;
    if (echo.id === target.id || echo.sharesHpWith !== target.id || !echo.alive) continue;
    echo.alive = false;
    echo.hp = 0;
    events.push({ type: "die", actorId: echo.id, kind: echo.kind, speciesId: echo.speciesId });
  }

  for (const line of TRUE_AWAKENING_INTRO) {
    events.push({ type: "message", text: line });
  }
  events.push({ type: "message", text: trueAwakeningFarewellLine(ctx.allies) });
  for (const line of TRUE_AWAKENING_CLOSING) {
    events.push({ type: "message", text: line });
  }

  ctx.completeRun("「はじめの夢」に、もう独りではないと伝わった。", events);
  events.push({ type: "trueAwakeningCleared" });
}
