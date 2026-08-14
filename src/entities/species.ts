import type { Species } from "../core/types";

/** 真の目覚め(隠し最終局面、plan/true-awakening.md)「はじめの夢」のspeciesId */
export const HAJIME_NO_YUME_ID = "hajimeNoYume";

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
    // 小ネタ・遊び心(plan/flavor-and-dialogue.md): ゆっくり揺れる
    idleSpeedMul: 0.6,
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
    // 最初の階をぷるんだけにする(plan/tutorial-floor-easing.md): 1階目は
    // ぷるん1種だけと戦って操作に慣れる区間にするため、2階からに引き上げる
    minFloor: 2,
    weight: 8,
    fieldSkill: "squeeze",
    // 小ネタ・遊び心(plan/flavor-and-dialogue.md): きょろきょろ、忙しない
    idleSpeedMul: 1.4,
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
    // 小ネタ・遊び心(plan/flavor-and-dialogue.md): ほとんど動かない
    idleSpeedMul: 0.3,
  },
  {
    // plan/shops-and-thieves.md: 近道屋の強欲さが夢に映り込んでできた、
    // 寄生的な夢のかけら。専用モデル(plan/models/archive/model-surigarasu.md)
    id: "surigarasu",
    name: "スリガラス",
    model: "surigarasu",
    maxHp: 8,
    atk: 4,
    def: 1,
    exp: 10,
    ai: "thief",
    minFloor: 5,
    weight: 4,
  },

  // ---- plan/companion-evolution.md: 夢あわせで成熟した先の姿 ----
  // 野生では出現させない(minFloorを到達不能な値にしてspeciesForDepthの
  // 対象から外す。成熟でしか出会えない姿として扱う)。ishizuenezumi以外は
  // 新規3Dモデルを制作せず、進化前と地続きの既存モデルを流用する
  {
    // ガジリねずみ(不安)+ホネガラミ(古い記憶)の夢あわせを重ねて育った姿。
    // 不安を乗り越え、その場を守れるようになる(coward→guard)。
    // 専用モデル(低い重心・厚い甲羅、plan/models/archive/model-ishizuenezumi.md)
    id: "ishizuenezumi",
    name: "いしずえねずみ",
    model: "ishizuenezumi",
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
    // 専用モデル(plan/models/archive/model-tokoshiepurun.md)
    model: "tokoshiepurun",
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
    // 専用モデル(plan/models/archive/model-kasumiutsubo.md)
    model: "kasumiutsubo",
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
    // 専用モデル(plan/models/archive/model-nemurimogura.md)
    model: "nemurimogura",
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
    // 専用モデル(plan/models/archive/model-namidaguma.md)
    model: "namidaguma",
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
    model: "kodamagitsune",
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
    model: "matsurinonushi",
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
    // 専用モデル(plan/models/archive/model-oonebosuke.md)
    model: "oonebosuke",
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
    // 専用モデル(plan/models/archive/model-nushigaeru.md)
    model: "nushigaeru",
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
    // 専用モデル(plan/models/archive/model-oomadoromi.md)
    model: "oomadoromi",
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
    model: "honezukaNoNushi",
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
    model: "fuchiNoNushi",
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
    model: "kodamaNoNushi",
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
    model: "misemonoNoNushi",
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
    // 専用モデル(plan/models/archive/model-horikuiNoNushi.md)
    model: "horikuiNoNushi",
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
    // 専用モデル(plan/models/archive/model-moyautsubo.md)
    model: "moyautsubo",
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
    model: "horoholocho",
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
    // 専用モデル(plan/models/archive/model-oitekeboshi.md)
    model: "oitekeboshi",
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
    // こぼれ落ちる涙のしずくそのもの。専用モデル(plan/models/archive/model-shizukuuo.md)
    id: "shizukuuo",
    name: "しずくうお",
    model: "shizukuuo",
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
    // ふさぎ込んだ古い悲しみ。専用モデル(plan/models/archive/model-urumiguma.md)
    id: "urumiguma",
    name: "うるみぐま",
    model: "urumiguma",
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
    // 響いて返ってくる声そのもの。専用モデル(plan/models/archive/model-yamabikogitsune.md)
    id: "yamabikogitsune",
    name: "やまびこぎつね",
    model: "yamabikogitsune",
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
    model: "kodamausagi",
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
    // 出し物の陰に潜む悪戯。専用モデル(plan/models/archive/model-menkaburikozo.md)
    id: "menkaburikozo",
    name: "めんかぶりこぞう",
    model: "menkaburikozo",
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
    // 飾られたまま忘れられた縁起物。専用モデル(plan/models/archive/model-kazaridaruma.md)
    id: "kazaridaruma",
    name: "かざりだるま",
    model: "kazaridaruma",
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
    // 見た目までは再現しない。専用モデル(plan/models/archive/model-yumemayoinokage.md)
    model: "yumemayoinokage",
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
    // ヨリシロ自身の記憶そのもの。専用モデル(plan/models/archive/model-yorishironozankyo.md)
    id: "yorishironozankyo",
    name: "ヨリシロの残響",
    model: "yorishironozankyo",
    maxHp: 160,
    atk: 45,
    def: 32,
    exp: 150,
    ai: "melee",
    minFloor: 43,
    weight: 1,
  },

  // ---- plan/monster-roster-expansion-species.md: 60種化・追加種族 ----
  // 新規3Dモデルは今回のスコープでも制作せず、既存5種のモデルを流用する
  // (surigarasuと同じ考え方)。数値はdesign/balance-philosophy.mdの
  // 「1地方(6階)あたり実効戦力1.3〜1.5倍」を目安に、地方内の既存種族から補間した

  // 第一地方: うたたねの参道(design/regions.md 1〜6階)。控えめに+2。
  // plan/archive/tutorial-floor-easing.mdの方針どおり、1階目には出さずminFloor2から
  {
    // あくびの合間に紛れ込んだ影。専用モデル(plan/models/archive/model-akubitokage.md)
    id: "akubitokage",
    name: "あくびとかげ",
    model: "akubitokage",
    maxHp: 6,
    atk: 3,
    def: 0,
    exp: 4,
    ai: "coward",
    minFloor: 2,
    weight: 9,
  },
  {
    // 閉じかけた瞼の隙間に湧く小さな夢。この作品最初のswarm。専用モデル(plan/models/archive/model-mabutamushi.md)
    id: "mabutamushi",
    name: "まぶたむし",
    model: "mabutamushi",
    maxHp: 5,
    atk: 3,
    def: 0,
    exp: 3,
    ai: "swarm",
    minFloor: 2,
    weight: 6,
    swarmSize: [2, 3],
  },

  // 第二地方: 忘れ潮の湿地(design/regions.md 7〜12階)。+4
  {
    // 霧を纏う、忘れられかけた道しるべ。専用モデルkirimizuchiを使う
    id: "kirimizuchi",
    name: "きりみずち",
    model: "kirimizuchi",
    maxHp: 20,
    atk: 11,
    def: 4,
    exp: 18,
    ai: "ranged",
    range: 4,
    minFloor: 7,
    weight: 5,
    // 深みタイルの上にいると射程が伸びる(ai.ts effectiveRangedRange参照)
    rangeBonusOnQuagmire: 2,
  },
  {
    // 足を取られた思い出。専用モデル(plan/models/archive/model-nukarumigani.md)
    id: "nukarumigani",
    name: "ぬかるみがに",
    model: "nukarumigani",
    // 「深みタイル上では動きが遅くなる代わりに攻撃力が上がる」は地形連動の
    // 移動速度変化まで実装せず、常時やや高めのatkに寄せる簡略化とした(アーカイブ注記参照)
    maxHp: 30,
    atk: 16,
    def: 10,
    exp: 24,
    ai: "melee",
    minFloor: 8,
    weight: 5,
  },
  {
    id: "ashiatodori",
    name: "あしあとどり",
    model: "ashiatodori",
    maxHp: 10,
    atk: 8,
    def: 2,
    exp: 8,
    ai: "swarm",
    minFloor: 7,
    weight: 5,
    swarmSize: [3, 4],
  },
  {
    // すっかり忘れられた水霊。専用モデル(plan/models/archive/model-wasuremizuchi.md)
    id: "wasuremizuchi",
    name: "わすれみずち",
    model: "wasuremizuchi",
    // 「触れられると深みタイルへ逃げ込む」は逃走先をquagmireへ誘導する
    // 経路選択までは実装せず、既存coward(瀕死で離脱)のまま簡略化した(アーカイブ注記参照)
    maxHp: 16,
    atk: 9,
    def: 3,
    exp: 14,
    ai: "coward",
    minFloor: 9,
    weight: 4,
  },

  // 第三地方: まどろみの茸林(design/regions.md 13〜18階)。+4
  {
    // 眠気を吸い込んで育った茸そのものが人の形に育ったもの。専用モデル
    id: "kinokootoko",
    name: "きのこおとこ",
    model: "kinokootoko",
    maxHp: 34,
    atk: 19,
    def: 9,
    exp: 32,
    ai: "melee",
    minFloor: 13,
    weight: 5,
    // 眠りの胞子で満ちた部屋(Room.spored)では攻撃力が上がる(game.ts attack参照)
    atkMulInSporedRoom: 0.25,
  },
  {
    // 舞い散る胞子の化身。専用モデル(houshitobi)
    id: "houshitobi",
    name: "ほうしとび",
    model: "houshitobi",
    maxHp: 20,
    atk: 14,
    def: 5,
    exp: 20,
    ai: "ranged",
    range: 4,
    minFloor: 14,
    weight: 4,
    inflicts: { kind: "sleep", chance: 0.15, turns: 3 },
  },
  {
    // まどろみの隙間に糸を張る蜘蛛。専用モデル(tools/models/monsters.py)
    id: "madoromigumo",
    name: "まどろみぐも",
    model: "madoromigumo",
    maxHp: 26,
    atk: 17,
    def: 7,
    exp: 26,
    ai: "ambush",
    // 特技ふいのいちげき(ambushStrike)はモヤウツボと同系統。
    // NATIVE_SKILL_BY_SPECIES(entities/skills.ts)側で紐づける
    minFloor: 14,
    weight: 4,
  },
  {
    // ツブテガエルの遠い親戚。専用モデル(plan/models/archive/model-nebosukegaeru.md)
    id: "nebosukegaeru",
    name: "ねぼすけがえる",
    model: "nebosukegaeru",
    maxHp: 22,
    atk: 13,
    def: 6,
    exp: 22,
    ai: "coward",
    minFloor: 15,
    weight: 4,
    // 攻撃を受けると跳ねて反撃する。ヨロイオイテケと同じcounterDamageRatioを流用
    counterDamageRatio: 0.2,
  },

  // 第四地方: 骨積みの回廊(design/regions.md 19〜24階)。+4
  {
    // 積み重なった記憶の重み。専用モデル(plan/archive/model-honedatami.md)
    id: "honedatami",
    name: "ホネダタミ",
    model: "honedatami",
    // 「倒すと素材を多く落とす」は種族ごとのドロップ量を変える仕組みが
    // 存在しないため実装せず、guardらしい高め耐久のみで表現した(アーカイブ注記参照)
    maxHp: 56,
    atk: 22,
    def: 20,
    exp: 42,
    ai: "guard",
    minFloor: 19,
    weight: 4,
  },
  {
    // 誰のものかも忘れられた骨。honegaramiモデルを流用する
    id: "wasurebone",
    name: "わすれぼね",
    // 専用モデル(plan/models/archive/model-wasurebone.md)
    model: "wasurebone",
    // 「倒されると近くの骨系モンスターの攻撃力を上げる」は種族横断の
    // on-death連携が必要になり本文書の規模を超えるため実装せず、
    // 素の非力なcowardとした(アーカイブ注記参照)
    maxHp: 24,
    atk: 14,
    def: 8,
    exp: 26,
    ai: "coward",
    minFloor: 19,
    weight: 4,
  },
  {
    // 意固地になった古い意地。スリガラスの上位種なので同じgajiriモデルを流用する
    id: "katakunagani",
    name: "かたくなガニ",
    // 専用モデル(plan/models/archive/model-katakunagani.md)
    model: "katakunagani",
    maxHp: 20,
    atk: 15,
    def: 8,
    exp: 30,
    ai: "thief",
    minFloor: 21,
    weight: 3,
  },
  {
    // ホネヅカのぬしに仕える小さな使い。専用モデル(plan/models/archive/model-honezukanotsukai.md)
    id: "honezukanotsukai",
    name: "ホネヅカのつかい",
    model: "honezukanotsukai",
    maxHp: 28,
    atk: 18,
    def: 8,
    exp: 34,
    ai: "ranged",
    // オイテケボシ(range4)より射程は短い
    range: 2,
    minFloor: 22,
    weight: 4,
    drainsSatiety: true,
  },

  // 第五地方: なみだの滝つぼ(design/regions.md 25〜30階)。+4
  {
    // 涙を誘う風。専用モデル(plan/models/archive/model-nadakaze.md)
    id: "nadakaze",
    name: "なだかぜ",
    model: "nadakaze",
    maxHp: 26,
    atk: 17,
    def: 7,
    exp: 26,
    ai: "ranged",
    range: 4,
    minFloor: 25,
    weight: 4,
    // 奔流タイルの近くで射程が伸びる(ai.ts effectiveRangedRange参照)
    rangeBonusNearTorrent: 2,
  },
  {
    // 涙で色あせた花。purunモデルを流用する
    id: "shioresakura",
    name: "しおれざくら",
    model: "shioresakura",
    // 「攻撃を受けるたびわずかに弱る」の持続ダウンは実装せず、瀕死になると
    // 攻撃力が上がる後半だけをlowHpAtkBonusMax(なみだぐまと同じ仕組み)で実装した
    // (アーカイブ注記参照)。専用モデル(plan/models/archive/model-shioresakura.md)
    maxHp: 30,
    atk: 18,
    def: 6,
    exp: 28,
    ai: "melee",
    minFloor: 26,
    weight: 4,
    lowHpAtkBonusMax: 0.3,
  },
  {
    // 水面に映る古い姿。ゆめまよいの影と同系統なので同じmadoromiモデルを流用する
    id: "mizukagami",
    name: "みずかがみ",
    model: "mizukagami",
    maxHp: 34,
    atk: 20,
    def: 9,
    exp: 30,
    ai: "mimic",
    // タルではなくアイテムに擬態する水辺版(mimicAsはデータのみで見た目までは再現しない)。
    // 専用モデル(plan/models/archive/model-mizukagami.md)
    mimicAs: "item",
    minFloor: 27,
    weight: 3,
  },
  {
    // 泣きやまない小さな夢。tsubuteモデルを流用する
    id: "nakimushi",
    name: "なきむし",
    model: "nakimushi",
    // 「倒されるたび残りの個体の攻撃力が上がる」は群れ内の連携バフの
    // 仕組みが必要になるため実装せず、swarmとしての基本挙動のみとした
    // (アーカイブ注記参照)。専用モデル(plan/models/archive/model-nakimushi.md)
    maxHp: 16,
    atk: 13,
    def: 5,
    exp: 18,
    ai: "swarm",
    minFloor: 25,
    weight: 4,
    swarmSize: [3, 4],
  },

  // 第六地方: こだまの尾根(design/regions.md 31〜36階)。+4
  {
    id: "kodamagumo",
    name: "こだまぐも",
    model: "kodamagumo",
    maxHp: 16,
    atk: 15,
    def: 6,
    exp: 20,
    ai: "swarm",
    minFloor: 31,
    weight: 4,
    swarmSize: [3, 4],
  },
  {
    // 声そのものが実体化した鬼。専用モデル(plan/models/archive/model-yamabikooni.md)
    id: "yamabikooni",
    name: "やまびこおに",
    model: "yamabikooni",
    // やまびこぎつねのalertsFloorOnSightで自動的に呼び起こされる(このspecies自体に追加のフィールドは不要)
    maxHp: 52,
    atk: 28,
    def: 14,
    exp: 50,
    ai: "melee",
    minFloor: 32,
    weight: 3,
  },
  {
    // 跳ね返る声を追いかける小さな生き物。専用モデル(plan/models/archive/model-kaerukodama.md)
    id: "kaerukodama",
    name: "かえるこだま",
    model: "kaerukodama",
    maxHp: 30,
    atk: 17,
    def: 8,
    exp: 28,
    ai: "coward",
    minFloor: 31,
    weight: 4,
    // 追い詰めると跳ねて反撃する
    counterDamageRatio: 0.2,
  },
  {
    // 尾根に根を張った古い響き。専用モデル(plan/models/archive/model-nedayamabiko.md)
    id: "nedayamabiko",
    name: "ねだやまびこ",
    model: "nedayamabiko",
    // 「周囲の物音を増幅して他を呼び寄せる」は汎用の物音システムが無いため、
    // 既存のalertsFloorOnSight(視認した瞬間フロア中に気づかせる)で近似した(アーカイブ注記参照)
    maxHp: 46,
    atk: 20,
    def: 16,
    exp: 32,
    ai: "guard",
    minFloor: 33,
    weight: 3,
    alertsFloorOnSight: true,
  },

  // 第七地方: わすれられた祭りの跡(design/regions.md 37〜42階)。+4
  {
    // 祭りの影絵芝居の忘れ物。専用モデル(plan/models/archive/model-kageboushi.md)
    id: "kageboushi",
    name: "かげぼうし",
    model: "kageboushi",
    maxHp: 38,
    atk: 24,
    def: 10,
    exp: 48,
    ai: "ambush",
    minFloor: 37,
    weight: 4,
    inflicts: { kind: "sleep", chance: 0.2, turns: 3 },
  },
  {
    // 甘い匂いに誘われる夢。専用モデル(plan/models/archive/model-wataamenoobake.md)
    id: "wataamenoobake",
    name: "わたあめのおばけ",
    model: "wataamenoobake",
    // 「触れると幻を残して逃げる」は計画書自身が「演出のみ、実害の分裂はしない」と
    // 明記しているため、素のcowardのまま実装した
    maxHp: 26,
    atk: 15,
    def: 6,
    exp: 30,
    ai: "coward",
    minFloor: 37,
    weight: 4,
  },
  {
    // 祭りの櫓に住み着いた古い霊。専用モデル(plan/models/archive/model-yaguramori.md)
    id: "yaguramori",
    name: "やぐらもり",
    model: "yaguramori",
    maxHp: 36,
    atk: 22,
    def: 10,
    exp: 44,
    ai: "ranged",
    range: 5,
    minFloor: 38,
    weight: 3,
  },
  {
    // 消えかけた祭りの灯り。専用モデル(plan/models/archive/model-chouchinokuri.md)
    id: "chouchinokuri",
    name: "ちょうちんおくり",
    model: "chouchinokuri",
    // 「倒すと周囲が一瞬照らされ視界が広がる」は視界演出フックが必要になるため
    // 実装せず、swarmとしての基本挙動のみとした(アーカイブ注記参照)
    maxHp: 18,
    atk: 14,
    def: 6,
    exp: 22,
    ai: "swarm",
    minFloor: 37,
    weight: 4,
    swarmSize: [3, 4],
  },

  // 第八地方: めざめの前庭(design/regions.md 43〜48階)。+4。エリート個体
  {
    // 全地方の記憶が混ざり合ったぷるん。purunモデルを流用する
    id: "subetenopurun",
    name: "すべてのぷるん",
    // 専用モデル(plan/models/archive/model-subetenopurun.md)
    model: "subetenopurun",
    // マドロミダケ(眠り付与)となみだぐま(瀕死で攻撃力上昇)を薄く併せ持つ集大成として実装した
    maxHp: 56,
    atk: 30,
    def: 16,
    exp: 70,
    ai: "melee",
    minFloor: 43,
    weight: 3,
    inflicts: { kind: "sleep", chance: 0.12, turns: 2 },
    lowHpAtkBonusMax: 0.15,
  },
  {
    // ガジリねずみといしずえねずみが混ざった姿。gajiriモデルを流用する
    id: "mazarinezumi",
    name: "まざりねずみ",
    // 専用モデル(plan/models/archive/model-mazarinezumi.md)
    model: "mazarinezumi",
    maxHp: 60,
    atk: 34,
    def: 12,
    exp: 72,
    ai: "guard",
    minFloor: 44,
    weight: 3,
  },
  {
    // 様々な地方の残響が寄り集まった群れ。この作品唯一のエリートswarm。gajiriモデルを流用する
    id: "yoseatsume",
    name: "よせあつめ",
    model: "gajiri",
    // 「群れの中に複数種族の性質が混在する」は群れが単一speciesという
    // populate.tsの前提を超えるため実装せず、通常のswarmとした(アーカイブ注記参照)
    maxHp: 24,
    atk: 20,
    def: 8,
    exp: 40,
    ai: "swarm",
    minFloor: 43,
    weight: 3,
    swarmSize: [3, 4],
  },
  {
    // ゆめまよいの影のもう一つの姿。同じmadoromiモデルを流用する
    id: "mouhitotsunokage",
    name: "もうひとつのかげ",
    // 専用モデル(plan/models/archive/model-mouhitotsunokage.md)
    model: "mouhitotsunokage",
    maxHp: 48,
    atk: 29,
    def: 15,
    exp: 62,
    ai: "mimic",
    // タルではなくアイテムに擬態する対をなす個体
    mimicAs: "item",
    minFloor: 45,
    weight: 3,
  },

  // 真の目覚め(隠し最終局面、plan/true-awakening.md)。ヨリシロがいちばん
  // 最初に見た夢が、ひとり分の姿を取ったもの。REGION_BOSS_ORDER・
  // SaveData.defeatedRegionBossesが前提とする「地方ボス8体」には含めない
  // (isRegionBossは立てない)。この一体だけは倒しても通常のkillActor
  // (討伐・ドロップ・経験値)処理へ進まず、専用の締めくくりイベントに
  // 分岐する(src/game.tsのtrueAwakeningEnding)
  {
    id: HAJIME_NO_YUME_ID,
    name: "はじめの夢",
    model: "hajimeNoYume",
    maxHp: 260,
    atk: 50,
    def: 38,
    // 倒してもtrueAwakeningEnding(killActorを経由しない)に分岐するため、
    // expは実際には付与されない。型上必須なので0を置く
    exp: 0,
    ai: "melee",
    minFloor: Number.POSITIVE_INFINITY,
    weight: 0,
    bossTelegraph: {
      message: "同じ夢が、いくつも重なって見えはじめた",
      multiplier: 1,
      cooldownTurns: 4,
      effect: "summonEcho",
    },
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

/** 地方ボス(plan/region-bosses.md)。夢あわせの糧にすると、通常個体の何体分の経験値換算になるか */
export const REGION_BOSS_FOOD_VALUE_MULTIPLIER = 3;

/**
 * 夢あわせ(plan/monster-fusion.md)。糧にした種族の経験値換算倍率。
 * 地方ボスは通常個体3体分になる(仲間にする体験を、単なる効率アイテムに
 * しないための特別ルール)
 */
export function foodValueMultiplier(species: Species): number {
  return species.isRegionBoss ? REGION_BOSS_FOOD_VALUE_MULTIPLIER : 1;
}

/**
 * 地方ボス(plan/region-bosses.md)。表の寝穴(MAIN_CAVE_ID)で、その階の
 * 地方の最終階(6階目)にだけ専用に配置する種族id。design/regions.mdの
 * 8地方(6階ごと、48階)は`plan/region-expansion.md`で実装済み。
 * 単一の情報源は entities/regions.ts の REGIONS(adr/0012参照)。
 * 既存の呼び出し側(このモジュールからimportしているファイル)を
 * 変更せずに済むよう、ここでは re-export するだけにする
 */
export { REGION_BOSS_FLOORS, REGION_BOSS_ORDER } from "./regions";
