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
  {
    // plan/shops-and-thieves.md: 近道屋の強欲さが夢に映り込んでできた、
    // 寄生的な夢のかけら。新規モデルは未制作のため、既存のgajiriモデルを
    // 流用する(毒罠がtrap_damageモデルを流用しているのと同じ考え方)
    id: "surigarasu",
    name: "スリガラス",
    model: "gajiri",
    maxHp: 8,
    atk: 4,
    def: 1,
    exp: 10,
    ai: "thief",
    minFloor: 5,
    weight: 4,
  },

  // ---- plan/monster-compendium.md: 地方別の新種 ----
  // 新規3Dモデルは今回のスコープでは制作せず、既存モデルを色違いの発想で
  // 流用する(毒罠がtrap_damageモデルを流用しているのと同じ考え方)

  // 第二地方: 忘れ潮の湿地(design/regions.md 7〜12階)
  {
    id: "moyautsubo",
    name: "モヤウツボ",
    model: "tsubute",
    maxHp: 24,
    atk: 15,
    def: 6,
    exp: 22,
    ai: "ambush",
    minFloor: 7,
    weight: 5,
  },
  {
    id: "wasuregani",
    name: "ワスレガニ",
    model: "honegarami",
    maxHp: 34,
    atk: 12,
    def: 12,
    exp: 24,
    ai: "guard",
    minFloor: 7,
    weight: 5,
    inflicts: { kind: "confuse", chance: 0.2, turns: 3 },
  },

  // 第三地方: まどろみの茸林(13〜18階)
  {
    id: "yumekuimogura",
    name: "ユメクイモグラ",
    model: "gajiri",
    maxHp: 32,
    atk: 18,
    def: 8,
    exp: 30,
    ai: "burrow",
    minFloor: 13,
    weight: 5,
  },
  {
    id: "horoholocho",
    name: "ホロホロチョウ",
    model: "purun",
    maxHp: 14,
    atk: 12,
    def: 4,
    exp: 14,
    ai: "swarm",
    minFloor: 13,
    weight: 4,
    swarmSize: [3, 4],
  },

  // 第四地方: 骨積みの回廊(19〜24階)
  {
    id: "yoroimukade",
    name: "ヨロイムカデ",
    model: "honegarami",
    maxHp: 48,
    atk: 20,
    def: 16,
    exp: 38,
    ai: "guard",
    minFloor: 19,
    weight: 4,
    inflicts: { kind: "seal", chance: 0.2, turns: 3 },
  },
  {
    id: "oitekeboshi",
    name: "オイテケボシ",
    model: "madoromi",
    maxHp: 30,
    atk: 16,
    def: 6,
    exp: 32,
    ai: "ranged",
    range: 4,
    minFloor: 19,
    weight: 4,
    drainsSatiety: true,
  },

  // 第五地方: なみだの滝つぼ(25〜30階)
  {
    id: "shizukuuo",
    name: "しずくうお",
    model: "tsubute",
    maxHp: 20,
    atk: 16,
    def: 6,
    exp: 20,
    ai: "swarm",
    minFloor: 25,
    weight: 4,
    swarmSize: [3, 4],
  },
  {
    id: "urumiguma",
    name: "うるみぐま",
    model: "honegarami",
    maxHp: 60,
    atk: 22,
    def: 18,
    exp: 44,
    ai: "guard",
    minFloor: 25,
    weight: 4,
    regenIfUnhit: true,
  },

  // 第六地方: こだまの尾根(31〜36階)
  {
    id: "yamabikogitsune",
    name: "やまびこぎつね",
    model: "gajiri",
    maxHp: 40,
    atk: 24,
    def: 10,
    exp: 46,
    ai: "ranged",
    range: 5,
    minFloor: 31,
    weight: 4,
    alertsFloorOnSight: true,
  },
  {
    id: "kodamausagi",
    name: "こだまうさぎ",
    model: "purun",
    maxHp: 22,
    atk: 18,
    def: 8,
    exp: 24,
    ai: "swarm",
    minFloor: 31,
    weight: 4,
    swarmSize: [3, 4],
  },

  // 第七地方: わすれられた祭りの跡(37〜42階)
  {
    id: "menkaburikozo",
    name: "めんかぶりこぞう",
    model: "tsubute",
    maxHp: 42,
    atk: 26,
    def: 12,
    exp: 52,
    ai: "ambush",
    minFloor: 37,
    weight: 4,
    inflicts: { kind: "confuse", chance: 0.25, turns: 3 },
  },
  {
    id: "kazaridaruma",
    name: "かざりだるま",
    model: "honegarami",
    maxHp: 80,
    atk: 24,
    def: 26,
    exp: 56,
    ai: "guard",
    minFloor: 37,
    weight: 3,
  },

  // 第八地方: めざめの前庭(43〜48階)
  {
    id: "yumemayoinokage",
    name: "ゆめまよいの影",
    // mimicAs: "barrel" はデータ上の設定に留め、実際のモデルはタルの
    // 見た目までは再現しない(既存モンスターモデルの流用。アーカイブ注記参照)
    model: "madoromi",
    maxHp: 46,
    atk: 28,
    def: 14,
    exp: 60,
    ai: "mimic",
    mimicAs: "barrel",
    minFloor: 43,
    weight: 4,
  },
  {
    id: "yorishironozankyo",
    name: "ヨリシロの残響",
    model: "honegarami",
    maxHp: 160,
    atk: 45,
    def: 32,
    exp: 150,
    ai: "melee",
    minFloor: 43,
    weight: 1,
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
