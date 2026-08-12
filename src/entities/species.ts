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
    fieldSkill: "squeeze",
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
    fieldSkill: "leap",
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
    fieldSkill: "break",
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

  // ---- plan/companion-evolution.md: 夢あわせで成熟した先の姿 ----
  // 新規3Dモデルは今回のスコープでは制作せず、進化前と地続きの既存モデルを
  // 流用する。野生では出現させない(minFloorを到達不能な値にして
  // speciesForDepthの対象から外す。成熟でしか出会えない姿として扱う)
  {
    // ガジリねずみ(不安)+ホネガラミ(古い記憶)の夢あわせを重ねて育った姿。
    // 不安を乗り越え、その場を守れるようになる(coward→guard)
    id: "ishizuenezumi",
    name: "いしずえねずみ",
    model: "gajiri",
    maxHp: 24,
    atk: 11,
    def: 9,
    exp: 20,
    ai: "guard",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
  },
  {
    // ぷるん同士の夢あわせを重ねて育った姿。被弾軽減の特性(みをまもる)が
    // 常時発動になる(ゆるがぬからだ)
    id: "tokoshiepurun",
    name: "とこしえのぷるん",
    model: "purun",
    maxHp: 22,
    atk: 9,
    def: 6,
    exp: 18,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
  },
  {
    // ぷるん(まどろみの余韻)+マドロミダケ(眠気そのもの)の夢あわせを
    // 重ねて育った姿。攻撃に眠り付与が乗るようになる
    id: "yumemirupurun",
    name: "ゆめみるぷるん",
    model: "purun",
    maxHp: 20,
    atk: 9,
    def: 4,
    exp: 18,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    inflicts: { kind: "sleep", chance: 0.2, turns: 3 },
  },

  // ---- plan/companion-evolution-expansion.md: 地方ごとの成熟系統 ----
  // 各地方の代表2種(片方を軸、もう片方を繰り返し糧に)から育つ、
  // その地方だけの隠れた最終形態。新規3Dモデルは制作せず、進化前と
  // 地続きの既存モデルを流用する(plan/companion-evolution.mdと同じ方針)
  {
    // モヤウツボ(霧)+ワスレガニ(忘れられた思い出)の夢あわせを重ねて
    // 育った姿。姿がかすみ、相手の攻撃を避けやすくなる
    id: "kasumiutsubo",
    name: "かすみウツボ",
    model: "tsubute",
    maxHp: 42,
    atk: 19,
    def: 9,
    exp: 32,
    ai: "ambush",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    evadeChance: 0.15,
  },
  {
    // ユメクイモグラ(眠気を食む)+ホロホロチョウ(まどろみの群れ)の
    // 夢あわせを重ねて育った姿。攻撃に眠りが確定でまとわりつく
    id: "nemurimogura",
    name: "ねむりモグラ",
    model: "gajiri",
    maxHp: 52,
    atk: 23,
    def: 11,
    exp: 42,
    ai: "burrow",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    fieldSkill: "dig",
    inflicts: { kind: "sleep", chance: 1, turns: 3 },
  },
  {
    // ヨロイムカデ(古い記憶の重み)+オイテケボシ(置いていかれる恐れ)の
    // 夢あわせを重ねて育った姿。防御が上がり、被弾のたびに攻撃者へ
    // ダメージを返す。「置いていかれる」恐れを鎧に変える
    id: "yoroioiteke",
    name: "ヨロイオイテケ",
    model: "honegarami",
    maxHp: 72,
    atk: 24,
    def: 22,
    exp: 54,
    ai: "guard",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    counterDamageRatio: 0.25,
  },
  {
    // しずくうお(こらえた涙)+うるみぐま(こらえ抜く力)の夢あわせを
    // 重ねて育った姿。HPが減るほど攻撃力が上がる
    id: "namidaguma",
    name: "なみだぐま",
    model: "tsubute",
    maxHp: 36,
    atk: 21,
    def: 9,
    exp: 32,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    lowHpAtkBonusMax: 0.5,
  },
  {
    // やまびこぎつね(声の実体)+こだまうさぎ(響きを追う小さな生き物)の
    // 夢あわせを重ねて育った姿。攻撃が2回まで反響するように連続発動する
    id: "kodamagitsune",
    name: "こだまぎつね",
    model: "gajiri",
    maxHp: 60,
    atk: 29,
    def: 13,
    exp: 68,
    ai: "ranged",
    range: 5,
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    alertsFloorOnSight: true,
    echoAttackChance: 0.3,
  },
  {
    // めんかぶりこぞう(祭りの影絵)+かざりだるま(祭りの高揚)の夢あわせを
    // 重ねて育った姿。状態異常を受けなくなる。祭りの高揚が正気を保たせる
    id: "matsurinonushi",
    name: "まつりのぬし",
    model: "tsubute",
    maxHp: 63,
    atk: 31,
    def: 16,
    exp: 78,
    ai: "ambush",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    inflicts: { kind: "confuse", chance: 0.25, turns: 3 },
    statusImmune: true,
  },

  // ---- plan/region-bosses.md: 地方ボス ----
  // 野生出現テーブルには乗せず(minFloor: Infinity、weight: 0)、
  // REGION_BOSS_FLOORS の階でだけ専用に配置する
  {
    // 第一地方: うたたねの参道(design/regions.md 1〜6階)。
    // ぷるんが大きくなりすぎた姿。単純な単一フェーズの、チュートリアル的な最初のボス
    id: "oonebosuke",
    name: "おおねぼすけ",
    model: "purun",
    maxHp: 30,
    atk: 11,
    def: 4,
    exp: 40,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: { message: "大きく身をかがめた", multiplier: 2, cooldownTurns: 3 },
    bossGuaranteedDrop: "oonebosukeDust",
  },
  {
    // 第二地方: 忘れ潮の湿地(design/regions.md 7〜12階)。巨大なツブテガエル。
    // HPが半分を切ると深みタイルに身を潜める2フェーズ制(plan/region-boss-nushigaeru.md)
    id: "nushigaeru",
    name: "ヌシガエル",
    model: "tsubute",
    maxHp: 68,
    atk: 20,
    def: 8,
    exp: 55,
    ai: "ranged",
    range: 4,
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: {
      message: "水面が大きく揺れた",
      multiplier: 2,
      cooldownTurns: 3,
      activateBelowHpRatio: 0.5,
    },
    bossGuaranteedDrop: "nushigaeruUroko",
    hidesInQuagmire: true,
  },
  {
    // 第三地方: まどろみの茸林(design/regions.md 13〜18階)。巨大なマドロミダケ。
    // 大技は隣接攻撃ではなく、自分のいる部屋全体への睡眠放出(plan/region-boss-oomadoromi.md)
    id: "oomadoromi",
    name: "オオマドロミ",
    model: "madoromi",
    maxHp: 82,
    atk: 22,
    def: 12,
    exp: 65,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: {
      message: "身体中から胞子が立ちのぼりはじめた",
      multiplier: 1,
      cooldownTurns: 4,
      effect: "aoeSleep",
    },
    bossGuaranteedDrop: "oomadoromiHoushi",
  },
  {
    // 第四地方: 骨積みの回廊(design/regions.md 19〜24階)。無数のホネガラミが
    // 積み重なってできた巨体。防御特化。大技は隣接攻撃ではなく、自分のいる
    // 部屋全体への封じ(seal)放出(plan/region-boss-honezuka.md)
    id: "honezukaNoNushi",
    name: "ホネヅカのぬし",
    model: "honegarami",
    maxHp: 96,
    atk: 24,
    def: 40,
    exp: 75,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: {
      message: "古い骨がガタガタと震えはじめた",
      multiplier: 1,
      cooldownTurns: 5,
      effect: "aoeSeal",
    },
    bossGuaranteedDrop: "honezukaKotsuban",
  },
  {
    // 第五地方: なみだの滝つぼ(design/regions.md 25〜30階)。滝つぼの底に
    // 長く沈んだ、古い悲しみが形を取った巨体。大技は隣接攻撃ではなく、
    // 自分のいる部屋の外周へ一時的に奔流を呼び込む(plan/region-boss-fuchinonushi.md)
    id: "fuchiNoNushi",
    name: "淵の主",
    model: "honegarami",
    maxHp: 114,
    atk: 29,
    def: 23,
    exp: 85,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: {
      message: "あたりの水面が渦を巻きはじめた",
      multiplier: 1,
      cooldownTurns: 4,
      effect: "summonTorrent",
    },
    bossGuaranteedDrop: "fuchiNoNushiNoUroko",
  },
  {
    // 第六地方: こだまの尾根(design/regions.md 31〜36階)。物音がよく響く
    // 尾根に棲み着いた、繰り返す記憶そのもの。大技は状態異常でも地形でも
    // なく、HPを共有する分身を2体まで呼び出す(plan/region-boss-kodamanonushi.md)
    id: "kodamaNoNushi",
    name: "こだまの主",
    model: "gajiri",
    maxHp: 76,
    atk: 31,
    def: 13,
    exp: 95,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: {
      message: "声がいくつにも重なって聞こえはじめた",
      multiplier: 1,
      cooldownTurns: 4,
      effect: "summonEcho",
    },
    bossGuaranteedDrop: "kodamaNoKakera",
  },
  {
    // 第七地方: わすれられた祭りの跡(design/regions.md 37〜42階)。かつての
    // 賑わいの記憶が歪んでできた、祭りの呼び込みのような姿の異形。大技は
    // 本体そっくりの幻影を3体呼び出す「見世物の入れ替わり」
    // (plan/region-boss-misemonononushi.md)
    id: "misemonoNoNushi",
    name: "見世物のぬし",
    model: "honegarami",
    maxHp: 152,
    atk: 31,
    def: 34,
    exp: 105,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: {
      message: "呼び込みの声がいくつにも分かれて聞こえた",
      multiplier: 1,
      cooldownTurns: 5,
      effect: "summonMirror",
    },
    bossGuaranteedDrop: "misemonoNoOmen",
  },
  {
    // 第八地方: めざめの前庭(design/regions.md 43〜48階)。近道屋が打ち込んだ
    // 杭が、ヨリシロの夢と混ざり合ってできた異形。表の寝穴・最後のボス。
    // 大技(groundSpikes)は唯一、床そのものに前兆(crackWarning)が
    // 表示されるタイプ(plan/region-boss-horikuinonushi.md)
    id: "horikuiNoNushi",
    name: "掘り杭の主",
    model: "honegarami",
    maxHp: 304,
    atk: 59,
    def: 42,
    exp: 120,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    isRegionBoss: true,
    bossTelegraph: {
      message: "足もとの地面がひび割れはじめた",
      multiplier: 1,
      cooldownTurns: 4,
      effect: "groundSpikes",
    },
    bossGuaranteedDrop: "horikuiNoKuiSaki",
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
    fieldSkill: "dig",
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
    fieldSkill: "squeeze",
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
    fieldSkill: "break",
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
    fieldSkill: "leap",
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
    fieldSkill: "break",
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
    fieldSkill: "squeeze",
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
    fieldSkill: "break",
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

/**
 * 地方ボス(plan/region-bosses.md)。表の寝穴(MAIN_CAVE_ID)で、その階の
 * 地方の最終階(6階目)にだけ専用に配置する種族id。design/regions.mdの
 * 8地方(6階ごと、48階)は`plan/region-expansion.md`で実装済み。
 * 表の寝穴の全8地方ぶん、実装済み
 */
export const REGION_BOSS_FLOORS: Readonly<Record<number, string>> = {
  6: "oonebosuke",
  12: "nushigaeru",
  18: "oomadoromi",
  24: "honezukaNoNushi",
  30: "fuchiNoNushi",
  36: "kodamaNoNushi",
  42: "misemonoNoNushi",
  48: "horikuiNoNushi",
};

/**
 * 地方ボスを地方の順番どおりに並べたもの(plan/hidden-dungeon.mdの
 * 腕試しの間で使う)。REGION_BOSS_FLOORSの値と同じ集合だが、
 * 表の寝穴の具体的な階数とは切り離した「出現順」だけの一覧にする
 */
export const REGION_BOSS_ORDER: readonly string[] = [
  "oonebosuke",
  "nushigaeru",
  "oomadoromi",
  "honezukaNoNushi",
  "fuchiNoNushi",
  "kodamaNoNushi",
  "misemonoNoNushi",
  "horikuiNoNushi",
];
