# モンスター種族名の英訳ぐろっさり

## 経緯

`design/localization.md` の「固有名詞の翻訳方針」節は、モンスター種族名
(生態・性質に由来する名前)について「音をそのままローマ字化せず、同じ
手触りの英語オノマトペ・意訳に置き換える」方針だけを定め、**「具体的な
訳語一覧は本文書の対象外とし、翻訳担当が世界観(`design/world.md`)を
踏まえて別途決める」**と明記して先送りしていた。また
`design/flavor-details.md` の「未決事項」節も、言葉遊び・語感に頼った
表現の翻訳は「別途検討が要る」と釘を刺しており、モンスター名はその
筆頭格にあたる。本文書は、この2箇所が空けていた穴──`src/entities/species.ts`
に定義された全種族の英訳案そのもの──を埋めるためのものである。

## 訳語の方針

`design/world.md` を踏まえ、以下を判断基準にして訳語を選んだ。

- **世界観のトーン**: 「重く暗いホラーではなく、素朴で温かい、少し
  可笑しみのある田舎の民話」という基調(`design/world.md` トーン節)から
  外れないこと。壮大なepic-fantasy調の単語(Lord, Doom, ~のOverlord 等)や
  Pokémon風の派手なポルトマントー造語は避け、**Cornish/English folk-tale
  に出てきそうな、素朴な複合語・童謡(nursery rhyme)寄りの語感**を狙った。
- **逐語訳・単純ローマ字化はしない**: `design/localization.md` が明示的に
  禁じている通り、`purun`→`Purun` のような音写はせず、擬態語・オノマトペ・
  生態のイメージを汲んだ意訳語に置き換えた。
- **二語複合の名前は、英語でも二語(または一語の合成語)で両方の要素を
  拾う**: 例えば「なみだぐま」(涙+くま)のような合成名は、`Tearbear` の
  ように英語側でも両方の要素が読み取れる形を優先した。無理に一語へ
  詰め込むより自然さが崩れる場合は、二語の複合フレーズのままにした。
- **実在の商業タイトルの固有名詞は参照しない**: 「スリガラス」
  (すりガラスの語呂とすり=盗みの掛詞)のような言葉遊びも、似た響きの
  既存の商業タイトル名を連想させないよう、日本語の意味・仕掛けの
  ほうを起点にゼロから英語の語呂を組み直した。
- **地方・系統ごとの語根を意識的に揃えた**: `species.ts` 自体が
  「やまびこぎつね」「こだまぎつね」「こだまうさぎ」「こだまぐも」の
  ように語根(やまびこ/こだま)を地方内で使い回しているため、英訳でも
  `Holler-` `Echo-` のような語根を対応する種族間で揃え、進化・上位種の
  関係が英語名からも見えるようにした(例: `Ironshell Centipede` →
  進化形 `Rearguard Ironshell`)。
- **意味を伝えるべき固有名詞(ヨリシロ等)は本文書の対象外**だが、
  「ヨリシロの残響」のように種族名に組み込まれているものについては、
  この1件に限り仮訳(`the Old Sleeper`)を当てて名前を組み立てた。
  ヨリシロ自体の正式な訳語決定は別途行う必要がある(未決事項を参照)。

## 種族名一覧

### 基本ロスター(第一〜第三地方をまたぐ初期6種)

`species.ts` の配列冒頭、専用の区切りコメントが付く前の6種。

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| ぷるん | purun | Squidge | 英俗語squidgy(柔らかくふるふるした)そのものの手触りを一語に |
| ガジリねずみ | gajiri | Gnawmouse | かじる(gnaw)仕草をそのまま複合語に、臆病さは別途AI表記で補う |
| ツブテガエル | tsubute | Slingfrog | つぶてを投げる(遠距離攻撃)動作を「sling」で端的に |
| マドロミダケ | madoromi | Snoozecap | まどろみ+キノコの傘(cap)。眠らせる茸という機能も一語で伝わる |
| ホネガラミ | honegarami | Bonetangle | 骨+絡みつくをそのまま合成語に。鈍重でほとんど動かない質感も残した |
| スリガラス | surigarasu | Pilferpane | pilfer(こそ泥)+windowpane(すりガラスの窓)で、すり+ガラスの掛詞を語形で再現 |

### 夢あわせで成熟した先の姿(companion-evolution)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| いしずえねずみ | ishizuenezumi | Cornerstone Mouse | 礎(いしずえ)をそのまま英語化。守りに転じたねずみの語感を保った |
| とこしえのぷるん | tokoshiepurun | Everlasting Squidge | Squidge一族の語根を継ぎつつ「とこしえ」を素直に形容詞化 |
| ゆめみるぷるん | yumemirupurun | Dreaming Squidge | 同上。夢を見る、を現在分詞でシンプルに |

### 地方ごとの成熟系統(companion-evolution-expansion)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| かすみウツボ | kasumiutsubo | Haze Moray | もやウツボ(Mist Moray)の一段上、かすみをhazeで差別化しつつウツボ系統を継続 |
| ねむりモグラ | nemurimogura | Deepsleep Mole | ユメクイモグラ(Dreameater Mole)の完成形として、確定睡眠の強さをdeepで表現 |
| ヨロイオイテケ | yoroioiteke | Rearguard Ironshell | ヨロイムカデ(Ironshell)の語根を継ぎ、「置いていかれる恐れ→守りに転じる」をrearguardで |
| なみだぐま | namidaguma | Tearbear | 課題例そのものの二語複合。涙+くまが両方とも英語からそのまま読み取れる |
| こだまぎつね | kodamagitsune | Echofox | やまびこぎつね(Hollerfox)の完成形。攻撃が反響する仕様に合わせechoに統一 |
| まつりのぬし | matsurinonushi | Festival Elder | 「ぬし」系ボスと訳語を揃え、祭りの高揚が正気を保たせる主という語感を保った |

### 地方ボス(region-bosses)

「ぬし」は劇場的なLord/Kingではなく、**村の古老・長老**を思わせる
`Elder` に統一した。荘厳になりすぎず、素朴な民話のトーンに合う。

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| おおねぼすけ | oonebosuke | Old Sluggard | ねぼすけ=sluggard(英語の古い言い回しで「大寝坊」)。チュートリアルらしい親しみやすさを残した |
| ヌシガエル | nushigaeru | Marsh Elder | ぬし=Elder統一。カエルらしさはflavorで補い、湿地の主という語感を優先 |
| オオマドロミ | oomadoromi | Old Snoozecap | マドロミダケ(Snoozecap)がそのまま巨大化した、というOld+の連続性 |
| ホネヅカのぬし | honezukaNoNushi | Boneyard Elder | ホネヅカ=骨の山をそのままboneyardに。つかい(Boneyard Runner)と対で成立 |
| 淵の主 | fuchiNoNushi | Pool Elder | 淵=深い水たまり(pool)。古い悲しみが沈む静けさを損なわない範囲で簡潔に |
| こだまの主 | kodamaNoNushi | Echo Elder | 分身を呼ぶ大技(summonEcho)と直結する訳語にした |
| 見世物のぬし | misemonoNoNushi | Sideshow Elder | 見世物=sideshow(見世物小屋の英語表現)。幻影を呼ぶ演出と語感が合う |
| 掘り杭の主 | horikuiNoNushi | Palisade Elder | 掘り杭=地面に打ち込んだ杭の列(palisade)。地面が割れる大技と符合する |

### 地方別の新種(monster-compendium)

#### 第二地方: 忘れ潮の湿地(7〜12階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| モヤウツボ | moyautsubo | Mist Moray | もや=mist。湿地に潜むウツボの朧げな質感をそのまま |
| ワスレガニ | wasuregani | Forget-me-not Crab | 「忘れる」×「わすれな草(forget-me-not)」の掛詞で、少し可笑しみのある語呂に |

#### 第三地方: まどろみの茸林(13〜18階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| ユメクイモグラ | yumekuimogura | Dreameater Mole | 夢を食う、をそのまま複合語に。ねむりモグラの前段として語根を継ぐ |
| ホロホロチョウ | horoholocho | Slumbermoth | ホロホロという擬態語の柔らかさをmoth(蛾)+slumberで再現。群れ(swarm)の質感も残した |

#### 第四地方: 骨積みの回廊(19〜24階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| ヨロイムカデ | yoroimukade | Ironshell Centipede | 鎧をironshellに。ヨロイオイテケの前段として語根を継ぐ |
| オイテケボシ | oitekeboshi | Trailing Wisp | 「置いていかれる」恐れを、後をついてくる灯り(will-o'-the-wisp)のイメージに翻案 |

#### 第五地方: なみだの滝つぼ(25〜30階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| しずくうお | shizukuuo | Teardrop Fish | しずく=涙のひとしずくを直訳的に。なみだぐまの前段として涙の語根を継ぐ |
| うるみぐま | urumiguma | Brimming Bear | 潤み(涙で目が潤う)をbrimming(あふれそうな)で。ふさぎ込んだ様子も残る語感 |

#### 第六地方: こだまの尾根(31〜36階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| やまびこぎつね | yamabikogitsune | Hollerfox | やまびこ=山に向かって叫ぶ(holler)+その木霊。こだま系統と語根を書き分けた |
| こだまうさぎ | kodamausagi | Echobun | こだま(echo)+うさぎ(bunny)のポルトマントー。童謡っぽい軽さを狙った |

#### 第七地方: わすれられた祭りの跡(37〜42階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| めんかぶりこぞう | menkaburikozo | Maskling | 面をかぶった小僧、を「mask」+縮小辞「-ling」でいたずら小僧らしく |
| かざりだるま | kazaridaruma | Dusty Roly-poly | roly-poly(起き上がりこぼしを指す英語の民間語)+dusty(埃をかぶった=忘れられた)で置き換え |

#### 第八地方: めざめの前庭(43〜48階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| ゆめまよいの影 | yumemayoinokage | Wayward Shade | 夢に迷う、をwayward(道に迷う、わがままの意も併せ持つ)で。タルに化ける不穏さを残した |
| ヨリシロの残響 | yorishironozankyo | Sleeper's Echo | ヨリシロ=仮訳the Old Sleeper(未決、後述)の残響をechoで。本体の記憶そのものという重みを保った |

### 60種化・追加種族(monster-roster-expansion-species)

#### 第一地方: うたたねの参道(1〜6階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| あくびとかげ | akubitokage | Yawnlizard | あくび(yawn)+とかげ(lizard)をそのまま合成語に。可笑しみを一番素直に残せた例 |
| まぶたむし | mabutamushi | Eyelid Midge | まぶた(eyelid)+群れる小虫(midge、英語の田舎でよく使われる語)でswarmの質感も伝える |

#### 第二地方: 忘れ潮の湿地(7〜12階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| きりみずち | kirimizuchi | Mistwyrm | 霧(mist)+みずち(水霊、英語のwyrm=素朴な蛇竜語で意訳)。道しるべの朧げさも残した |
| ぬかるみがに | nukarumigani | Mireclaw | ぬかるみ(mire)+爪(claw)。足を取られて力強くなる質感を一語に |
| あしあとどり | ashiatodori | Trackpecker | 足跡(track)をついばむ(peck)鳥、という群れの小鳥らしい動作を残した |
| わすれみずち | wasuremizuchi | Forgetwyrm | きりみずち(Mistwyrm)と同系統の語根を継ぎつつ、忘れられた側面をforgetで対比 |

#### 第三地方: まどろみの茸林(13〜18階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| きのこおとこ | kinokootoko | Toadstool Man | きのこ=toadstool(英語民話でおなじみのキノコ語)。人型に育った素朴さを保つ |
| ほうしとび | houshitobi | Sporeflit | 胞子(spore)が舞い散る様子をflit(ひらひら飛ぶ)で一語に |
| まどろみぐも | madoromigumo | Snoozeweb | まどろみ(snooze)+蜘蛛の巣(web)。マドロミダケ系統の語根を継いだ |
| ねぼすけがえる | nebosukegaeru | Snoozehop Frog | ツブテガエル(Slingfrog)の遠い親戚として「跳ねる(hop)」を残しつつ寝ぼすけ気質を強調 |

#### 第四地方: 骨積みの回廊(19〜24階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| ホネダタミ | honedatami | Bonestack | 積み重なった骨、を素直にstackで。ホネガラミ(Bonetangle)系統の語根を継ぐ |
| わすれぼね | wasurebone | Forgetbone | 忘れられた骨、を一語に。わすれ系統(Forget-me-not Crab, Forgetwyrm)と語感を揃えた |
| かたくなガニ | katakunagani | Grudgecrab | 意固地な古い意地を「grudge(根に持つ恨み)」+crabで。盗みの性質ともつながる語感 |
| ホネヅカのつかい | honezukanotsukai | Boneyard Runner | ホネヅカのぬし(Boneyard Elder)に仕える使者、をrunner(使い走り)で対に |

#### 第五地方: なみだの滝つぼ(25〜30階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| なだかぜ | nadakaze | Sniffling Wind | 涙を誘う風、を「すすり泣くような風」としてsniffling(鼻をすする)で少し可笑しみを添えた |
| しおれざくら | shioresakura | Witherblossom | しおれる(wither)+花(blossom)。瀕死で力が増す様と儚さを両立 |
| みずかがみ | mizukagami | Watermirror | 水面に映る、をそのまま複合語に。アイテムに化けるmimicの質感と合わせやすい |
| なきむし | nakimushi | Crybug | 泣き虫(crybaby)そのものの語感を残しつつ、虫(bug)を足して群れの小ささを強調 |

#### 第六地方: こだまの尾根(31〜36階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| こだまぐも | kodamagumo | Echoweb | こだま(echo)+蜘蛛の巣(web)。まどろみぐも(Snoozeweb)と対になる語形 |
| やまびこおに | yamabikooni | Holler-ogre | やまびこぎつね(Hollerfox)の呼び声で目覚める鬼、として語根を継いだ |
| かえるこだま | kaerukodama | Bouncefrog | かえる=蛙/返る(跳ね返す)の掛詞を、bounce(跳ね返す、カウンター技とも一致)+frogで再現 |
| ねだやまびこ | nedayamabiko | Rootholler | 根を張った(root)+やまびこ(holler)。尾根に根付いた古い響きという定住感を残した |

#### 第七地方: わすれられた祭りの跡(37〜42階)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| かげぼうし | kageboushi | Shadowplay | 影絵芝居(shadow play)の忘れ物、という由来をそのまま名前に |
| わたあめのおばけ | wataamenoobake | Candyfloss Ghost | わたあめ=candyfloss(英国式の綿あめ表現)。Cornish/English民話寄りの語感を狙った例 |
| やぐらもり | yaguramori | Belfry Haunt | 祭りの櫓をbelfry(鐘楼・見張り台)に翻案し、住み着いた霊をhauntで |
| ちょうちんおくり | chouchinokuri | Fading Lantern | 消えかけた祭りの灯り、をそのまま形容詞+名詞に |

#### 第八地方: めざめの前庭(43〜48階、エリート個体)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| すべてのぷるん | subetenopurun | Boundless Squidge | 全地方の記憶を併せ持つ集大成として「すべて」をboundless(際限のない)に意訳 |
| まざりねずみ | mazarinezumi | Mingle-mouse | 混ざる(mingle)+ねずみ。ガジリねずみ系統(Gnawmouse)の語尾を継いだ |
| よせあつめ | yoseatsume | Hodgepodge | 「寄せ集め」にほぼそのまま対応する英語の慣用句。ロスター唯一のエリート群れに合う軽さ |
| もうひとつのかげ | mouhitotsunokage | Othershade | ゆめまよいの影(Wayward Shade)の対をなす個体として、語根shadeを継いだ |

### 真の目覚め(true-awakening、隠し最終局面)

| 日本語名 | id | 英訳案 | 訳の狙い(一言) |
|---|---|---|---|
| はじめの夢 | hajimeNoYume | The First Dream | 言葉遊びより意味の重さを優先し、素直な直訳にとどめた(方針の「意味を伝えたい固有名詞」に近い性質のため) |

## 対象外

本文書が扱うのは `src/entities/species.ts` のモンスター種族名
(`Species.name`)のみ。アイテム名・地方名・NPC名・`flavorText` や
NPCせりふプールなどの言葉遊び部分は対象外とする。
`design/localization.md` の優先順位でもこれらは「次点」「後回しでよい」
に分かれており、種族名だけを先に固めることで
`src/i18n/en.ts`(`design/localization.md` が示す構造)の設計を
先に進められるようにするのが狙い。

## 未決事項

- 本文書はあくまで `src/i18n/en.ts` に将来入る内容の**たたき台**であり、
  拘束力はない。実際にshipする前に、ネイティブ英語話者による通し
  チェック(語呂の自然さ・下品な意味への誤読がないか等)を別途挟む
  必要がある。
- 「ヨリシロの残響」(`yorishironozankyo`)の英訳は、`design/localization.md`
  の方針2(意味を伝えたい固有名詞)にあたる「ヨリシロ」自体の訳語が
  未決定のため、本文書内でのみ通用する仮訳 `the Old Sleeper` を使って
  組み立てた。ヨリシロ本体の正式な英訳は、本文書のスコープ外の
  固有名詞群として別途決定すること。
- 特に自信が持てず、訳語の再検討余地があると感じたもの:
  - `surigarasu` → `Pilferpane`: 「すりガラス」×「すり(盗み)」という
    日本語の掛詞を英語側でどこまで再現できているか怪しい。もっと
    素直に伝わる訳語があるかもしれない。
  - `nadakaze` → `Sniffling Wind`: 「なだ」の由来(何の略・掛詞か)を
    確証できないまま「涙を誘う風」という説明文だけを頼りに意訳した。
  - `kirimizuchi` / `wasuremizuchi` → `Mistwyrm` / `Forgetwyrm`:
    「みずち」を wyrm(蛇竜)に寄せたが、水霊という原義からは
    やや離れる可能性がある。
  - `nushigaeru` → `Marsh Elder`: 「ぬし」系ボスとの統一を優先した結果、
    名前から「カエル」であることが読み取れなくなった。ボス個別の
    見た目・演出上、種族名にカエルを残すべきか判断が割れうる。
  - `yoroioiteke` → `Rearguard Ironshell`: 二語+複合語でやや長い。
    英語のモンスター名として座りが良いか、短縮案とあわせて要検討。
