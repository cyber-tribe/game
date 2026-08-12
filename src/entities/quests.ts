/**
 * 依頼板(plan/quest-board.md)。肝いりのオトネが窓口となる、村の依頼一覧。
 * `design/yorishiro-moods.md`(気分の抽選)と同じ「端末の日付をハッシュして
 * 決める」方式を流用し、日替わりで3件を提示する。
 *
 * 護送(escort)は、対象NPCを非戦闘のまま同伴させる新しい仕組みが必要になり
 * (`plan/companion-orders.md`の仲間とは別枠)、章の進行(`design/story.md`、
 * 未実装)を前提にした依頼でもあるため、今回のスコープからは外している。
 */
export type QuestKind = "hunt" | "gather" | "explore" | "compendium";

export interface QuestDef {
  id: string;
  kind: QuestKind;
  name: string;
  description: string;
  target: {
    speciesId?: string;
    itemDefId?: string;
    depth?: number;
    count: number;
  };
  reward: {
    gold?: number;
    materials?: { defId: string; count: number }[];
  };
}

export const QUESTS: readonly QuestDef[] = [
  {
    id: "huntGajiri",
    kind: "hunt",
    name: "ガジリねずみの間引き",
    description: "ガジリねずみを3体倒す。",
    target: { speciesId: "gajiri", count: 3 },
    reward: { gold: 30 },
  },
  {
    id: "huntPurun",
    kind: "hunt",
    name: "ぷるんの掃除",
    description: "ぷるんを3体倒す。",
    target: { speciesId: "purun", count: 3 },
    reward: { gold: 30 },
  },
  {
    id: "gatherHokoraDust",
    kind: "gather",
    name: "ほこら粉の納品",
    description: "ほこら粉を2個持ち帰る。",
    target: { itemDefId: "hokoraDust", count: 2 },
    reward: { gold: 40 },
  },
  {
    id: "gatherHealLeaf",
    kind: "gather",
    name: "いやしの葉の納品",
    description: "いやしの葉を3個持ち帰る。",
    target: { itemDefId: "healLeaf", count: 3 },
    reward: { gold: 25 },
  },
  {
    id: "explore5",
    kind: "explore",
    name: "地下5階のめざめの階段",
    description: "地下5階のめざめの階段へ初めて到達する。",
    target: { depth: 5, count: 1 },
    reward: { gold: 50 },
  },
  {
    id: "explore10",
    kind: "explore",
    name: "地下10階のめざめの階段",
    description: "地下10階のめざめの階段へ初めて到達する。",
    target: { depth: 10, count: 1 },
    reward: { gold: 80 },
  },
  {
    id: "compendium2",
    kind: "compendium",
    name: "図鑑を進める",
    description: "未確認の種族を、新たに2種「見た」状態にする。",
    target: { count: 2 },
    reward: { gold: 35 },
  },
  {
    id: "compendium1",
    kind: "compendium",
    name: "新種の目撃情報",
    description: "未確認の種族を、新たに1種「見た」状態にする。",
    target: { count: 1 },
    reward: { gold: 20 },
  },
];

const BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

export function questDef(id: string): QuestDef | undefined {
  return BY_ID.get(id);
}

/** 依頼板の同時受注上限(plan/quest-board.md) */
export const MAX_ACTIVE_QUESTS = 3;

/**
 * dateKeyを単純にハッシュして、その日の依頼候補を決める(疑似乱数の種として使うだけ)。
 * `design/yorishiro-moods.md`のmoodForDateと同じ考え方(端末の日付から決定的に導く)。
 */
function hashDateKey(dateKey: string): number {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * その日にオファーされうる依頼を、決定的な順序で並べたもの(先頭から必要数だけ使う)。
 * 同じdateKeyなら常に同じ順序になる。
 */
export function questsForDate(dateKey: string): readonly QuestDef[] {
  const seed = hashDateKey(dateKey);
  const shuffled = [...QUESTS];
  // Fisher-Yates。線形合同法で十分(依頼の並び順を決めるだけの用途)
  let state = seed || 1;
  const nextRand = (): number => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/** 今日の日付キー(YYYY-MM-DD)。端末のローカル日付を使う */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
