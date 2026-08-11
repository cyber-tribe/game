import type { Species } from "../core/types";

/**
 * モンスター図鑑。名前・造形ともにオリジナル。
 * model は public/models/<model>.glb に対応する。
 */
export const SPECIES: readonly Species[] = [
  {
    id: "purun",
    name: "ぷるん",
    model: "purun",
    maxHp: 12,
    atk: 6,
    def: 2,
    exp: 5,
    ai: "melee",
    minFloor: 1,
    maxFloor: 9,
    weight: 10,
  },
  {
    id: "gajiri",
    name: "ガジリねずみ",
    model: "gajiri",
    maxHp: 10,
    atk: 8,
    def: 1,
    exp: 7,
    ai: "coward",
    minFloor: 1,
    weight: 8,
  },
  {
    id: "tsubute",
    name: "ツブテガエル",
    model: "tsubute",
    maxHp: 14,
    atk: 7,
    def: 3,
    exp: 12,
    ai: "ranged",
    range: 4,
    minFloor: 3,
    weight: 6,
  },
  {
    id: "madoromi",
    name: "マドロミダケ",
    model: "madoromi",
    maxHp: 18,
    atk: 8,
    def: 5,
    exp: 16,
    ai: "melee",
    minFloor: 4,
    weight: 5,
    inflicts: { kind: "sleep", chance: 0.25, turns: 4 },
  },
  {
    id: "honegarami",
    name: "ホネガラミ",
    model: "honegarami",
    maxHp: 26,
    atk: 13,
    def: 8,
    exp: 28,
    ai: "melee",
    minFloor: 6,
    weight: 4,
  },
];

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string): Species {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`未知のモンスター: ${id}`);
  return s;
}

/** その階層に出現しうる種族 */
export function speciesForDepth(depth: number): Species[] {
  return SPECIES.filter((s) => depth >= s.minFloor && (s.maxFloor === undefined || depth <= s.maxFloor));
}
