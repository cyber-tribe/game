/**
 * アニメーション付きモデル(主人公・モンスター・村人)の身長の基準値
 * (単位はモデル座標、バインドポーズのY方向バウンディングボックス高)。
 *
 * モデル間の体格差はデザイン上の決定(例: おおねぼすけはガルドの2倍格)
 * なのに、ビルドの座標いじりで気づかず伸び縮みしても誰も止められなかった。
 * tests/models.test.ts がこの表と実測を±5%で突き合わせ、無断の変化を
 * 失敗にする(回帰ガード)。
 *
 * **意図して体格を変えるPRでは、この表の該当行を新しい実測値に更新する。**
 * 失敗メッセージに実測値がそのまま出るので、その値を書き写せばよい。
 */
export const MODEL_HEIGHT_BASELINE: Record<string, number> = {
  akubitokage: 0.262,
  ashiatodori: 0.267,
  chouchinokuri: 0.263,
  fuchiNoNushi: 0.787,
  fuku: 0.798,
  gajiri: 0.12,
  garudo: 0.97,
  gendo: 0.948,
  hajimeNoYume: 0.906,
  honedatami: 0.561,
  honegarami: 0.839,
  honezukaNoNushi: 0.864,
  honezukanotsukai: 0.284,
  horikuiNoNushi: 1.795,
  horoholocho: 0.145,
  houshitobi: 0.471,
  ishizuenezumi: 0.457,
  ito: 0.778,
  kaerukodama: 0.313,
  kageboushi: 0.366,
  kasumiutsubo: 0.235,
  katakunagani: 0.281,
  kazaridaruma: 0.608,
  kinokootoko: 0.919,
  kirimizuchi: 0.694,
  kodamaNoNushi: 0.661,
  kodamagitsune: 0.407,
  kodamagumo: 0.262,
  kodamausagi: 0.296,
  mabutamushi: 0.114,
  madoromi: 0.458,
  madoromigumo: 0.278,
  matsurinonushi: 0.316,
  mazarinezumi: 0.397,
  menkaburikozo: 0.284,
  misemonoNoNushi: 1.332,
  mizukagami: 0.284,
  mogurabaa: 0.608,
  mouhitotsunokage: 0.216,
  moyautsubo: 0.297,
  nadakaze: 0.205,
  nakimushi: 0.192,
  namidaguma: 0.391,
  nebosukegaeru: 0.342,
  nedayamabiko: 0.602,
  nemurimogura: 0.347,
  nukarumigani: 0.288,
  nushigaeru: 0.711,
  oitekeboshi: 0.312,
  okiyo: 0.698,
  oomadoromi: 0.665,
  oonebosuke: 0.836,
  otama: 0.807,
  otone: 0.798,
  pochi: 0.547,
  purun: 0.3,
  shioresakura: 0.225,
  shizukuuo: 0.221,
  subetenopurun: 0.33,
  surigarasu: 0.218,
  tokoshiepurun: 0.348,
  tsubute: 0.432,
  urumiguma: 0.589,
  wasurebone: 0.583,
  wasuregani: 0.618,
  wasuremizuchi: 0.285,
  wataamenoobake: 0.481,
  yaguramori: 0.469,
  yamabikogitsune: 0.345,
  yamabikooni: 0.93,
  yorishironozankyo: 1.007,
  yoroimukade: 0.58,
  yoroioiteke: 0.892,
  yoseatsume: 0.235,
  yumekuimogura: 0.321,
  yumemayoinokage: 0.331,
  yumemirupurun: 0.402,
};

/**
 * 接地検査(最下端が z≈0 を割らない)の例外。地面より下へ意図して
 * はみ出しているモデルだけを、理由つきでここへ登録する。
 */
export const SINK_EXCEPTIONS: Record<string, string> = {
  wataamenoobake: "裾が地面へ溶け込む幽体の演出で、意図して床下まで伸ばしている",
};
