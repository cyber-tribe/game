# 硬い部品の骨固定 ― 確認リスト(完了記録)

`plan/models/archive/hard-part-bone-pinning-audit.md`の受け入れ基準3
(残りの種の優先順位付けリスト)。当初は次のセッションへの引き継ぎ
候補リストとして書いたが、同じセッション内で候補をすべて確認・
修正できたため、完了記録として残す。

## 確認方法

`common.render_preview`はプレビューのたびにポーズをリセットしてしまう
ため、これを迂回して任意のアクション・フレームで直接レンダーする:

```python
C.reset_scene()
objs, armature = monsters.build_XXX()
for clip_name, keyframes in monsters.XXX_animations():
    C.add_action(armature, clip_name, keyframes)
armature.animation_data.action = bpy.data.actions.get("die")
bpy.context.scene.frame_set(22)  # dieの崩れきった付近のフレーム
bpy.context.view_layer.update()
# render_previewのカメラ・ライト設定部分だけを手動で複製してレンダーする
```

崩れ落ちた本体から硬い部品だけが元の高さに浮いて残っていれば、
その部品には`mark_for_pin`/`pin_weight_to_bone`が要る。

## 確認・修正した種

- **かたくなガニの鋏**(`katakuna_pincer`/`katakuna_clawL`/
  `katakuna_clawR`): 目柄の確認過程で新たに発見。`hipF.{L,R}-
  footF.{L,R}`へ固定。
- **まぶたむし**(元の調査で「要確認」): 背の甲殻(`mabuta_shell`)が
  実測で同じ症状を確認。`body-head`へ固定。
- **淵の主**: 肩から垂れる藻(`fuchi_kelp0〜2`)を`chest-shoulder.L`へ
  固定。
- **見世物のぬし**: 肩から生える祭りの櫓一式(`misemono_yagura_*`、
  柱4本・板2枚・傾いだ最上段・幟)を`chest-shoulder.L`へまとめて固定。
- **こだまの主**: 左の雲状の膨らみの空洞(`kodamanonushi_echo_hole`)を
  `chest-hip`、非対称の目(`kodamanonushi_echoeye_*`)を`chest-neck`へ
  固定。
- **ヌシガエル**: 背の睡蓮と葦(`nushigaeru_lily`/`nushigaeru_reed*`)を
  `chest-hip`へ固定。
- **オオマドロミ**: 側面の小さな傘(`oomadoromi_bud_stem`/
  `oomadoromi_bud_cap`)を`root-stem`へ固定。傘の裏の空洞
  (`oomadoromi_gill`)は中心軸上でどの姿勢でも位置がほぼ変わらない
  ため見送った(低リスクと判断)。
- **おおねぼすけ**: 肩の掛け布団(`oonebosuke_blanket`/
  `oonebosuke_blanket_fold`)を`base-mid`へ固定。
- **掘り杭の主**: 入り口に局在する裂け目・木片(`horikui_tear`/
  `horikui_shard*`)は`chest-neck`へ固定した。**体を貫く杭本体
  (`horikui_stake`/`horikui_stake_tip`)は単一ボーンへの固定を見送った**
  ―― hip〜crownの全域を貫く特殊な部品で、単一ボーンへ固定すると
  特定の関節の回転だけで不自然に振れてしまう。杭は「動かず体だけが
  軋む」表現とも解釈できるため、自動ウェイト計算(複数ボーンへ緩く
  またがる)のまま残す判断とした。

## 対象外(このリストでは扱わない)

- 上記以外の残り種(装飾が関節から離れた場所にあり、目視で
  問題なさそうなもの)は、今回は個別確認しない。何か違和感の
  報告があれば都度この手法で確認する
