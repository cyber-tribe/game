import * as THREE from "three";

/**
 * ダンジョン(`Renderer`)とモデルのエンジン内プレビュー
 * (`tools/preview-harness.ts`、plan/models/archive/engine-preview-snapshots.md)
 * で共有する描画設定。「ゲーム側の絵作りを変えたらプレビューも同じ絵になる」を
 * 保つため、値の二重定義をここへ集約する。
 */

/**
 * 色調グレーディング(plan/game/post-processing-stack.md)。彩度を少し上げ、
 * 暗部にわずかな青みを足し、画面端を薄く暗くする。外部LUT画像は使わず、
 * 「アセットはコードから生成する」方針に合わせて小さな自作シェーダーにする。
 */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.08 },
    shadowTint: { value: new THREE.Vector3(0.02, 0.03, 0.05) },
    vignetteStrength: { value: 0.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform vec3 shadowTint;
    uniform float vignetteStrength;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 graded = mix(vec3(luma), texel.rgb, saturation);
      // 暗部だけ青みを足す(明るい部分ほど寄与が小さくなるよう二乗で減衰)
      float shadowAmount = (1.0 - luma) * (1.0 - luma);
      graded += shadowTint * shadowAmount;
      // 画面端をわずかに暗くする
      float dist = length(vUv - 0.5) * 2.0;
      graded *= 1.0 - vignetteStrength * dist * dist;
      gl_FragColor = vec4(graded, texel.a);
    }
  `,
};

/** ブルーム(strength, radius, threshold)。UnrealBloomPassのコンストラクタ引数の順 */
export const BLOOM_PARAMS = { strength: 0.35, radius: 0.4, threshold: 0.9 } as const;

/** トーンマッピング */
export const TONE_MAPPING = THREE.ACESFilmicToneMapping;
export const TONE_MAPPING_EXPOSURE = 0.98;

/** ダンジョンの主光源(影を落とす1灯)と環境光の色・強さ */
export const KEY_LIGHT_COLOR = 0xaec2f5;
export const KEY_LIGHT_INTENSITY = 0.85;
export const AMBIENT_LIGHT_COLOR = 0x6674a0;
export const AMBIENT_LIGHT_INTENSITY = 1.7;

/**
 * フィル光(plan/models/archive/scene-fill-light-discipline.md)。
 * キーと同じ寒色系(洞窟の底を沈ませる意図を壊さない)、強さはキーの
 * 約35%(受け入れ基準3の白飛び・黒潰れの目安「30〜40%」の中間)
 */
export const FILL_LIGHT_COLOR = 0xaec2f5;
export const FILL_LIGHT_INTENSITY = KEY_LIGHT_INTENSITY * 0.35;

/** 松明の代わり。プレイヤーに付いてまわる暖色の光の色 */
export const PLAYER_LIGHT_COLOR = 0xffd2a6;

/** カメラの画角(度) */
export const CAMERA_FOV = 46;
