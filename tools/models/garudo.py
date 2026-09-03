"""
主人公「ガルド」― 見習い樽守り。

新しい2D設定画(design/characters/garudo/generated/garudo-sheet.png、
ユーザー提供・2026-09-01)の三面図を寸法源に、彫刻+テクスチャ焼き込み
パイプライン(plan/models/archive/sculpt-texture-pipeline.md)で組む。
ブロックアウト承認(2026-09-01「良さそうです!」)済みの体型配分。

方針(plan/models/archive/garudo-quality-uplift.md 実装項目8):

- **約5.2頭身のゲーム内比率を直接組む**。旧版の「7頭身写実→チビ化」の
  二段変換は廃止(設定画側がゲーム内比率になった)。全高0.97ユニットは
  従来と同じ(身長回帰ガード・他キャラとの体格バランス維持)。
- **有機部は1つに融合**: 頭・首・胴・袖・前腕・腰・脚・裾を
  sculpt_merge(target_tris指定)で連続メッシュにし、塗り分け
  (シャツ生成り/素肌/青灰ズボン)と顔(口・鼻・眉)・
  シャツの前立てを384²アルベドへ焼き込む。境界は球・カプセルの
  距離場(知見8)。
- **手は素手と手袋を別々に作り、手袋を装着した状態で組む**。どちらも
  融合に入れない(ボクセル3.8mmでは指の隙間が消え、融合の膨らみで
  素手が手袋を突き抜ける)。同じ骨格から革の厚みぶん太らせて作るので
  手袋は必ず素手を包む(組み立て時に`C.encloses`で検査する)。
- **硬い部品は別ジオメトリのままピンで剛体追従**: 樽板エプロン
  (背中±60°が開いた240°巻き、フラットシェードの板+たが)・
  背負い樽(タルの小道具と同じ12面フラットの造形言語)・ベルト・
  肩ひも・腰布(赤)・ブーツ。
- **目は顔に沿うパッチ1枚+描いた目**(hand-painted-standard.md 規約2:
  眼球を3Dオブジェクトとして顔に載せない)。まばたき機構は維持
  (blinkカスタムプロパティ)。髪は房を重ねた塊で頭ボーンへ剛体追従。
- 設定画に武器は無い(手は自然な人の手+革手袋)。

Blender では -Y を正面として組む。glTF に書き出すとこれが +Z 正面になり、
Three.js 側で rotation.y = 0 が「南向き」に対応する。
関節名(JOINTS/BONES)とアニメーション5クリップは従来のまま維持する。
"""

from __future__ import annotations

import json
import math
import os

# common が bpy を読み込む。mathutils は bpy の読み込み後でないと import できない
import bmesh
import bpy
import common as C
import props
from mathutils import Vector

NAME = "garudo"

# 三面図の採寸: 全高425px(頭頂521〜足の裏937)を0.97ユニットへ正規化。
# 1px = 0.002282。以下の座標はすべてこの換算で三面図から読んだ値
JOINTS_HALF = {
    "hip": (0.0, 0.0, 0.46),
    "chest": (0.0, -0.004, 0.68),
    "neck": (0.0, 0.0, 0.775),
    "head": (0.0, -0.004, 0.878),
    "crown": (0.0, 0.0, 0.955),
    "shoulder.L": (0.078, 0.0, 0.742),
    "elbow.L": (0.165, 0.004, 0.600),
    # 手のボーンは**手首**(手袋の折り返しの内側)。以前は手のひらの
    # 中にあり、手首の回転軸として使えなかった
    "hand.L": (0.2013, -0.004, 0.5190),
    "thigh.L": (0.066, 0.0, 0.42),
    "knee.L": (0.078, 0.0, 0.27),
    "foot.L": (0.090, -0.02, 0.04),
}

BONES_HALF = [
    ("hip", "chest"),
    ("chest", "neck"),
    ("neck", "head"),
    ("head", "crown"),
    ("chest", "shoulder.L"),
    ("shoulder.L", "elbow.L"),
    ("elbow.L", "hand.L"),
    ("hip", "thigh.L"),
    ("thigh.L", "knee.L"),
    ("knee.L", "foot.L"),
]

JOINTS = C.mirrored(JOINTS_HALF)
BONES = C.mirrored_bones(BONES_HALF)

# 配色は設定画のカラーパレットから採る
SKIN = (0.93, 0.80, 0.66)
SKIN_SHADE = (0.82, 0.64, 0.50)
# 耳。**シルエットはメッシュ、内部構造はテクスチャ**で作る。
# 肌と同じベタ色にすると「肌色の突起」にしか見えず、横顔でのっぺりする。
# 耳輪(外周の隆起)を中間影、耳穴をもう1段暗くするだけで、脳は
# 「肌が露出している」ではなく「ここに耳という構造物がある」と読む
# **耳の地の色はSKINのまま**。茶系へ寄せると、髪との境目を色の分類
# 問題にしてしまう(外部評価 第5回)。茶に寄せるほど「耳が髪に見える」
# 判定は通るが、UV補間・ベイク・縮小のたびに髪色と肌色が混ざる。
# 耳は「茶色い領域」ではなく「肌色の立体+内部の影」
EAR_HELIX = (0.95, 0.82, 0.68)     # 耳輪。隆起なので肌より少し明るい
EAR_RIDGE = (0.82, 0.65, 0.51)     # 対耳輪。耳輪と耳甲介の間の稜線
EAR_CONCHA = (0.70, 0.52, 0.41)    # 耳甲介。窪みなので一段暗い
EAR_EDGE = (0.62, 0.45, 0.36)      # 耳の外周の落ち影。設定画の輪郭線の役
EAR_CANAL = (0.54, 0.37, 0.31)     # 耳穴。さらに暗い赤茶(黒にはしない)
EAR_LOBE = (0.90, 0.73, 0.64)      # 耳たぶ。ごくわずかな赤み

# 耳の外形(側面から見た雫形)。上が少し広く、下(耳たぶ)は細い。
# 厚みは薄い ―― デフォルメの顔では耳は主役ではなく、こめかみ〜横髪〜頬の
# 境界を成立させる**基準点**。厚くすると取っ手のように見える
#   (z, 半厚x, 半奥行きy, 中心y)
# 耳の断面(z, 半厚x, 半奥行きy, 中心y)。**融合しないので薄く作れる。**
# 融合していたころは voxel 3.8mm に潰されないよう半厚を4mm(=厚さ8mm)
# にしていたが、それでも出てくるのは+2〜3mmの尾根で、耳の形は残らな
# かった。独立オブジェクトなら半厚2mmの板がそのまま出る
EAR_RINGS = (
    (0.8095, 0.0005, 0.0024, 0.0088),
    (0.8145, 0.0009, 0.0062, 0.0093),
    (0.8205, 0.0014, 0.0088, 0.0098),
    (0.8280, 0.0018, 0.0112, 0.0101),
    (0.8350, 0.0020, 0.0128, 0.0099),
    (0.8420, 0.0018, 0.0124, 0.0094),
    (0.8480, 0.0012, 0.0092, 0.0088),
    (0.8515, 0.0004, 0.0034, 0.0083),
)
SHIRT = (0.88, 0.84, 0.73)          # 生成りのシャツ
SHIRT_LINE = (0.74, 0.69, 0.58)     # 前立て・ボタンの線
TROUSERS = (0.35, 0.41, 0.49)       # 青灰のズボン(新設定画で深緑から変更)
LEATHER = (0.42, 0.28, 0.16)        # 革(ベルト・手袋・靴)
# Hair Cap(地肌隠し)は頭の断面をこれだけ膨らませるだけ。輪郭は毛束が作る
HAIR_CAP_OVER = 0.004
# 毛束の法線を**その毛束自身の丸み**へ寄せる強さ。強くすると面の
# 切り替わりは目立たなくなるが、髪全体が平たく明るくなって色が抜ける
# (実測: 0.70にしたら髪が肌と判定される画素が増え、肌IoUの到達率が
# 97%→91%へ落ちた)。髪全体を1つの球へ寄せるのは別の話で、あれは
# ヘルメットになるのでやらない
# 背面・3/4背面で、毛束の隙間から Hair Cap が見えてよい割合の上限。
# capは地肌を隠す土台であって、**見せる面ではない**
CAP_EXPOSED_MAX = 0.30
HAIR_NORMAL_BLEND = 0.35
HAIR_CAP_TOP = 0.970
HAIR = (0.33, 0.25, 0.185)          # 茶色の無造作な髪(設定画の髪の平均色を実測)
CLOTH = (0.60, 0.20, 0.15)          # 腰布(赤)
APRON_WOOD = props.BARREL_WOOD      # 樽板エプロン(実物の樽と同色で統一)
HOOP = props.BARREL_IRON            # たが(鉄輪)

# 顔まわりの基準。**設定画の正面図をピクセル実測して決めた値**
# (1px=0.002282、z=(937-y)*0.002282)。頭を球で作ると設定画と別人になる
# (実測: 設定画の顔は目の高さで半幅0.071→あご0.023へ絞る卵形。球で
# 作ると髪込みのシルエット幅を頭蓋に使うことになり、あごの無い団子顔)
CHIN_Z = 0.762          # あご先(顔QAの実測)
EYE_Z = 0.8460          # 目の中心の高さ(顔QAの実測)
EYE_X = 0.0317          # 顔の中心から目の中心まで(顔QAの実測)
BROW_Z = 0.870          # 眉(顔QAの実測。目パッチ上端0.8612のすぐ上)
MOUTH_Z = 0.800
NOSE_Z = 0.828
SKULL_TOP_Z = 0.970

# 目まわりの造作を置くための、顔の前面に当てた楕円体(頭ロフトの
# 目の高さ付近と一致させてある)
FACE_C = Vector((0.0, 0.010, 0.852))
FACE_R = Vector((0.0770, 0.079, 0.086))

# 頭のロフト断面(z, rx, ry, cx, cy)。正面図の幅と側面図の奥行きから
HEAD_RINGS = [
    # 正面図の**露出した肌の輪郭**を高さごとに実測して合わせた
    # (tools/compare_face.py の肌マスク。設定画の顎は模型より遥かに
    # 細く、z0.782で43mm・z0.790で68.5mmしかない)。
    # 奥行きryは側面図で裏を取ってある: 顎の高さで設定画88.5mm対
    # 旧モデル102mm(幅の比0.83と奥行きの比0.87がほぼ一致したので、
    # rxとryを同じ率で絞る)
    (0.762, 0.014, 0.021, 0.0, 0.006),
    (0.778, 0.021, 0.033, 0.0, 0.007),
    (0.790, 0.0343, 0.045, 0.0, 0.008),
    (0.802, 0.0460, 0.055, 0.0, 0.009),
    (0.812, 0.0570, 0.063, 0.0, 0.0095),
    (0.824, 0.0695, 0.073, 0.0, 0.010),
    (0.848, 0.0755, 0.078, 0.0, 0.010),
    (0.872, 0.0775, 0.080, 0.0, 0.010),
    (0.898, 0.0760, 0.079, 0.0, 0.011),
    # 頭頂は髪の輪郭から逆算する。設定画の髪はz0.950で103.5mmしかなく、
    # Hair Cap(頭+4mm)がそれを超えてはいけない
    (0.924, 0.0670, 0.072, 0.0, 0.012),
    (0.948, 0.0480, 0.052, 0.0, 0.013),
    (0.962, 0.0330, 0.037, 0.0, 0.014),
    (0.970, 0.0130, 0.015, 0.0, 0.014),
]


# ---- 手(素手)と手袋 ----
# 設定画の正面図から実測(革の領域と肌の領域を色で分けて高さごとに測った)。
#   素肌の前腕は z0.533 で終わり、そこから下は手袋の折り返し
#   手袋の折り返し: z0.505〜0.538、幅44mm(腕の傾き29.7°ぶん補正して直径38mm)
#   手: z0.425〜0.505、幅60mm。手首から指先まで107mm(うち指が半分)
# **素手と手袋は同じ骨格から作る**。手袋は革の厚みぶん太らせただけの
# もので、別々に形を書くと「手袋が手に入っていない」事故になる
HAND_WRIST_L = Vector((0.2013, -0.004, 0.5190))   # 手首の中心(=手のボーン)
HAND_DIR = Vector((0.529, -0.060, -0.849))        # 手首→指先(+x側)
HAND_LENGTH = 0.107                                # 手首から中指の先まで
HAND_PALM_FRAC = 0.55                              # うち手のひらの割合
LEATHER_T = 0.0022                                 # 革の厚み

# 指(並びの位置, 長さ, 根元半径, 先半径, 手前への曲げ, 外への開き)。
# 並びの位置は内側(親指側)が負。設定画では人差し指〜中指が長く、
# 小指が短い。**付け根は寄せて先を開く**(平行に並べると熊手に見える)
FINGERS = (
    (-0.0130, 0.0420, 0.0058, 0.0046, 0.0050, -0.20),
    (-0.0044, 0.0460, 0.0060, 0.0048, 0.0062, -0.07),
    (0.0044, 0.0430, 0.0058, 0.0046, 0.0060, 0.07),
    (0.0130, 0.0350, 0.0052, 0.0042, 0.0046, 0.20),
)
# 手のひら(手首→指の付け根)の半幅・半厚
PALM_HALF_W = (0.0175, 0.0218, 0.0242)
PALM_HALF_T = (0.0110, 0.0108, 0.0100)


def _hand_frame(side: float):
    """
    片手の座標系。(手首, 指の付け根, 手の向き, 指を並べる向き, 手の甲の法線)

    手の甲がほぼ前(-y)を向くAポーズなので、手のひらの法線を+y起点に取り、
    そこから指の並ぶ向きを外積で決める。**向きを外積で決める**のが要点で、
    座標を直接書くと手のひらと指の面がねじれる
    """
    arm = Vector((HAND_DIR.x * side, HAND_DIR.y, HAND_DIR.z))
    arm.normalize()
    palm_n = Vector((0.0, 1.0, 0.0))
    palm_n = palm_n - arm * arm.dot(palm_n)
    palm_n.normalize()
    spread = arm.cross(palm_n) * side          # 外側(小指側)が正
    spread.normalize()
    wrist = Vector((HAND_WRIST_L.x * side, HAND_WRIST_L.y, HAND_WRIST_L.z))
    knuckle = wrist + arm * (HAND_LENGTH * HAND_PALM_FRAC)
    return wrist, knuckle, arm, spread, palm_n


def _hand_parts(side: float, grow: float, prefix: str) -> list:
    """
    片手ぶんの部品(手のひら・指4本・親指)。

    grow=0 が素手、grow=革の厚み が手袋。**同じ関数から両方を作る**ので、
    手袋は必ず素手を包む。
    """
    wrist, knuckle, arm, spread, palm_n = _hand_frame(side)
    mid = wrist + arm * (HAND_LENGTH * HAND_PALM_FRAC * 0.55)
    parts = [C.tapered_slab(
        f"{prefix}_palm{side:+.0f}",
        [wrist - arm * grow, mid, knuckle + arm * grow],
        [w + grow for w in PALM_HALF_W], [t + grow for t in PALM_HALF_T],
        spread, segments=12)]
    for i, (off, length, r0, r1, bend, fan) in enumerate(FINGERS):
        base = knuckle + spread * off - arm * 0.004
        dir_f = (arm + spread * fan).normalized()
        curl = palm_n * -bend            # 指は手のひら側(甲の逆)へ曲がる
        tip = base + dir_f * (length + grow) + curl * 1.5
        mid_p = base + dir_f * (length * 0.55) + curl * 0.55
        # **両端とも grow ぶん伸ばす**。半径だけ太らせると、根元と先の
        # 蓋が素手と同じ平面に来て「手袋の面の上に素手の面がある」状態に
        # なる(装着の検査が指と親指で落ちた実測)
        parts.append(C.curve_tube(
            f"{prefix}_finger{side:+.0f}_{i}",
            [tuple(base - dir_f * grow), tuple(mid_p), tuple(tip)],
            [r0 + grow, (r0 + r1) * 0.5 + grow, r1 + grow]))
    # 親指。内側(spreadの負)に離れて付き、手前(-y)へ出る
    t0 = wrist + arm * 0.014 - spread * 0.021 + palm_n * -0.005
    t1 = t0 + arm * 0.019 - spread * 0.008 + palm_n * -0.011
    t2 = t1 + arm * 0.018 - spread * 0.004 + palm_n * -0.012
    tdir = (t1 - t0).normalized()
    parts.append(C.curve_tube(
        f"{prefix}_thumb{side:+.0f}",
        [tuple(t0 - tdir * grow), tuple(t1), tuple(t2 + tdir * grow)],
        [0.0068 + grow, 0.0058 + grow, 0.0044 + grow]))
    return parts


def _glove_cuff(side: float):
    """手袋の折り返し。**前腕との継ぎ目をこれが隠す**ので必ず腕へ被せる"""
    wrist, _knuckle, arm, _spread, _palm_n = _hand_frame(side)
    pts = [wrist - arm * 0.002, wrist - arm * 0.016,
           wrist - arm * 0.032, wrist - arm * 0.046]
    return C.curve_tube(f"garudo_cuff{side:+.0f}", [tuple(p) for p in pts],
                        [0.0215, 0.0198, 0.0190, 0.0176])


def _hand_dist(pos: Vector, side: float, grow: float = 0.0):
    """
    手(または手袋)の表面までのおおよその距離と、指ごとの距離。

    造形と塗りで**同じ骨格**を使う(別々に持つと、指の間の線が
    ジオメトリの指とずれる)。
    """
    wrist, knuckle, arm, spread, palm_n = _hand_frame(side)
    mid = wrist + arm * (HAND_LENGTH * HAND_PALM_FRAC * 0.55)
    d = _seg_dist(pos, wrist, knuckle) - (PALM_HALF_W[1] * 0.8 + grow)
    fingers = []
    for off, length, r0, r1, bend, fan in FINGERS:
        base = knuckle + spread * off - arm * 0.004
        dir_f = (arm + spread * fan).normalized()
        curl = palm_n * -bend
        tip = base + dir_f * (length + grow) + curl * 1.5
        mid_p = base + dir_f * (length * 0.55) + curl * 0.55
        fd = min(_seg_dist(pos, base, mid_p), _seg_dist(pos, mid_p, tip)) \
            - ((r0 + r1) * 0.5 + grow)
        fingers.append(fd)
        d = min(d, fd)
    t0 = wrist + arm * 0.016 - spread * 0.019 + palm_n * -0.004
    t2 = t0 + arm * 0.039 - spread * 0.007 + palm_n * -0.019
    d = min(d, _seg_dist(pos, t0, t2) - (0.0052 + grow))
    return d, fingers


# ---- 顔のデカール(design/characters/garudo/face.svg をラスタライズしたもの) ----
# 目・眉・鼻・口・頬は**SVGが唯一の情報源**。Pythonの数値で描くのをやめ、
# 2Dデザインとして独立に編集できるようにした(plan/models/archive/garudo-face-qa.md)。
# SVGの座標系は顔一致QAのウィンドウと同一なので、QAが出す「◯mmずれ」が
# そのままSVGの座標編集になる(1 SVG単位 = 0.5mm)。
FACE_DECAL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "design", "characters", "garudo", "generated", "garudo-face-decal.png")
DECAL_PPU = 6000.0   # face.svgを--scale=3で焼いた画素密度
# face.svgは**まばたきの3状態を横に並べた1枚**(open / half / closed)。
# 同じ(x, z)へ状態ぶんの横オフセットを足して引く
DECAL_STATES = ("open", "half", "closed")
# 顔を本体から切り離す球(この中の面が顔のマテリアルになる)。
# **頭全体ではなく前面だけ**にする。頭全体を1枚に取ると、後頭部が
# タイルの大半を占めて顔の密度が半分になる(実測: 3,911→1,980 texels/unit、
# 肌IoUが0.82→0.74へ落ちた)
FACE_ISLAND_C = (0.0, -0.030, 0.852)
FACE_ISLAND_R = 0.098
FACE_ISLAND_MAX_Y = 0.004     # ここより後ろ(裏側)は顔に含めない
# 顔のアトラス1コマの解像度。顔の幅155mmに対し768pxで約5px/mm
FACE_TEX = 768
DECAL_STATE_DX = 0.32
DECAL_X0 = -0.16
DECAL_Z1 = 1.02
_decal_cache: list = []


def _face_decal():
    """デカール画像を(高さ, 幅, 4)のfloat配列で返す(上起点)"""
    if not _decal_cache:
        import numpy as np
        img = bpy.data.images.load(FACE_DECAL_PATH)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        _decal_cache.append(px.reshape(h, w, 4)[::-1])
    return _decal_cache[0]


def _decal_sample(x: float, z: float, state: int = 0):
    """
    モデル座標(x, z)でデカールを引く。(r, g, b, a)。範囲外はa=0。

    **双一次補間**で引く。最近傍(int()で切り捨て)だと、顔テクスチャの
    密度を上げてもデカールの画素の階段がそのまま出る。ついでに切り捨ては
    半画素ぶん常に手前へずれる(実測: x=0.030がfloat32では0.0299999に
    なり、隣の画素を引いて色が変わった)
    """
    dec = _face_decal()
    h, w = dec.shape[:2]
    fx = (x - DECAL_X0 + state * DECAL_STATE_DX) * DECAL_PPU - 0.5
    fy = (DECAL_Z1 - z) * DECAL_PPU - 0.5
    x0, y0 = math.floor(fx), math.floor(fy)
    if x0 < 0 or y0 < 0 or x0 + 1 >= w or y0 + 1 >= h:
        return (0.0, 0.0, 0.0, 0.0)
    tx, ty = fx - x0, fy - y0
    p = (dec[y0, x0] * (1 - tx) + dec[y0, x0 + 1] * tx) * (1 - ty) \
        + (dec[y0 + 1, x0] * (1 - tx) + dec[y0 + 1, x0 + 1] * tx) * ty
    return (float(p[0]), float(p[1]), float(p[2]), float(p[3]))


def _over(base, x: float, z: float, state: int = 0, fade: float = 1.0):
    """デカールを肌などの下地へ重ねる。fadeで薄める(横顔で消すため)"""
    r, g, b, a = _decal_sample(x, z, state)
    a *= max(0.0, min(1.0, fade))
    if a <= 0.004:
        return base
    return (base[0] + (r - base[0]) * a,
            base[1] + (g - base[1]) * a,
            base[2] + (b - base[2]) * a)


def _atlas_h(images, name: str):
    """画像を横に並べて1枚にする(まばたきの状態アトラス)"""
    import numpy as np
    tiles = []
    for im in images:
        w, h = im.size
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        tiles.append(px.reshape(h, w, 4))
    out = np.concatenate(tiles, axis=1)
    for im in images:
        bpy.data.images.remove(im)
    img = bpy.data.images.new(name, width=out.shape[1], height=out.shape[0])
    img.pixels.foreach_set(out.ravel())
    return img


def _arc_loft(name: str, rings, open_half_deg: float = 60.0,
              segments: int = 20, smooth: bool = True):
    """
    背中側(+Y、90°)を±open_half_deg開けた弧のロフト。樽板エプロンと
    そのたがに使う。リングはcommon.loftと同じ(z, rx, ry, cx, cy)。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    a0 = math.radians(90 + open_half_deg)
    a1 = math.radians(90 - open_half_deg + 360)
    angles = [a0 + (a1 - a0) * i / segments for i in range(segments + 1)]
    ring_verts = []
    for z, rx, ry, cx, cy in rings:
        ring_verts.append([bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
                           for a in angles])
    for lower, upper in zip(ring_verts, ring_verts[1:]):
        for i in range(segments):
            bm.faces.new((lower[i], lower[i + 1], upper[i + 1], upper[i]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


def _smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def _seg_dist(p: Vector, a: Vector, b: Vector) -> float:
    ab = b - a
    if ab.length_squared == 0.0:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def _lerp3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _h01(x: float, y: float = 0.0) -> float:
    """決定的な擬似乱数(0〜1)。板ごとの色差・擦れの散らしに使う"""
    return (math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1.0


def _shade(color, f: float):
    return (min(1.0, color[0] * f), min(1.0, color[1] * f), min(1.0, color[2] * f))


# ---- 手描きテクスチャ(handbook/hand-painted-standard.md 規約3) ----
# いずれも3D位置から描くので、UV島の割れ方に依存しない

APRON_HOOP_Z = (0.265, 0.390, 0.505)

# 背負い樽。**軸は縦**(設定画の背面図・側面図の実測)。
# 断面は楕円で、背面図で幅220mm・側面図で奥行き130mm(照合して120mmへ)。
# 前面(y小)を
# 背中へ付けたいので、リングの中心cyは奥行きに合わせて動かす
BARREL_FRONT_Y = 0.070          # 樽の前面(融合ボディの背中の外)
BARREL_RINGS = (
    # (z, 半幅rx, 半奥行ry)
    (0.5385, 0.083, 0.043),
    (0.5600, 0.098, 0.053),
    (0.6000, 0.108, 0.059),
    (0.6550, 0.111, 0.060),
    (0.7000, 0.109, 0.058),
    (0.7400, 0.104, 0.055),
    (0.7748, 0.084, 0.042),
)
BARREL_HOOP_Z = (0.550, 0.602, 0.706, 0.758)   # たが4本(背面図で実測)
BARREL_PLUG_Z = 0.6552                          # 栓(背面図の中央の突起)
BARREL_SEGMENTS = 14


def _apron_color(pos: Vector, normal: Vector):
    """樽板エプロン: 板ごとの色差+上明るく下暗く+たが直下の影+
    縁の明るい線+木目+擦れ"""
    deg = math.degrees(math.atan2(pos.y - 0.006, pos.x)) % 360.0
    t_arc = ((deg - 200.0) % 360.0) / 140.0
    idx = max(0, min(8, int(t_arc * 9)))
    f = 0.94 + 0.12 * _h01(idx * 12.9898)
    tz = max(0.0, min(1.0, (pos.z - 0.235) / (0.530 - 0.235)))
    f *= 0.84 + 0.26 * tz
    for hz in APRON_HOOP_Z:
        d = hz - 0.009 - pos.z
        if 0.0 < d < 0.022:
            f *= 0.72 + 0.28 * _smoothstep(0.0, 0.022, d)
    edge = abs(t_arc * 9 - idx - 0.5) * 2.0
    if edge > 0.80:
        f *= 1.10
    if math.sin(deg * 9.0 + _h01(idx * 7.0) * 6.28) > 0.75:
        f *= 0.93
    if _h01(round(deg * 1.3), round(pos.z * 90)) > 0.965:
        f *= 1.15
    return _shade(APRON_WOOD, f)


def _barrel_ring(z: float):
    """高さzでの樽の断面(rx, ry, cy)"""
    rings = BARREL_RINGS
    z = max(rings[0][0], min(rings[-1][0], z))
    for (z0, rx0, ry0), (z1, rx1, ry1) in zip(rings, rings[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / max(1e-9, z1 - z0)
            rx = rx0 + (rx1 - rx0) * t
            ry = ry0 + (ry1 - ry0) * t
            return rx, ry, BARREL_FRONT_Y + ry
    rx, ry = rings[-1][1], rings[-1][2]
    return rx, ry, BARREL_FRONT_Y + ry


def _barrel_color(pos: Vector, normal: Vector):
    """
    背負い樽(**軸は縦**)。板は縦に並び、たがは横に走る。
    板ごとの色差+上を明るく+たが直下の影+板の合わせ目の明るい線。
    """
    rx, ry, cy = _barrel_ring(pos.z)
    if pos.z > BARREL_RINGS[-1][0] - 0.004 and normal.z > 0.5:
        return _shade((0.50, 0.34, 0.20), 1.06)         # 天面(鏡板)
    if pos.z < BARREL_RINGS[0][0] + 0.004 and normal.z < -0.5:
        return _shade((0.50, 0.34, 0.20), 0.84)         # 底
    # 栓(背面の中央に突き出た飲み口)
    if (pos - Vector((0.0, cy + ry, BARREL_PLUG_Z))).length < 0.020 \
            and pos.y > cy + ry * 0.90:
        return _shade((0.44, 0.30, 0.18), 1.0)
    # 板は軸(z)まわりに並ぶ
    step = 360.0 / BARREL_SEGMENTS
    deg = math.degrees(math.atan2(pos.y - cy, pos.x)) % 360.0
    idx = int(deg / step)
    f = 0.94 + 0.12 * _h01(idx * 3.71)
    f *= 0.86 + 0.26 * max(0.0, min(1.0, (pos.z - 0.535) / 0.240))
    for hz in BARREL_HOOP_Z:                            # たがの真下の影
        d = pos.z - (hz - 0.012)
        if -0.014 < d < 0.0:
            f *= 0.78 + 0.22 * _smoothstep(-0.014, 0.0, d)
    if abs((deg % step) - step * 0.5) / (step * 0.5) > 0.86:
        f *= 1.10                                       # 板の合わせ目
    if math.sin(pos.z * 90.0 + idx) > 0.8:
        f *= 0.94                                       # 木目
    return _shade(APRON_WOOD, f)


def _boot_color(pos: Vector, normal: Vector):
    """
    ブーツ: 靴底とヒールは濃く、甲は明るく、履き口の折り返しに線、
    正面に編み上げの紐とハトメ。座標はブーツのローカル(原点=足の中心、
    -Yがつま先、z0が接地)
    """
    if pos.z < 0.020:
        return (0.24, 0.17, 0.11)                     # 靴底
    if pos.y > 0.030 and pos.z < 0.048:
        return (0.28, 0.20, 0.13)                     # ヒール
    f = 0.90 + 0.20 * max(0.0, min(1.0, (pos.z - 0.02) / 0.16))
    d_toe = (pos - Vector((0.0, -0.090, 0.030))).length
    f *= 1.0 + 0.18 * (1.0 - _smoothstep(0.02, 0.055, d_toe))   # つま先の明るみ
    if 0.156 < pos.z < 0.182:
        f *= 1.12                                     # 履き口の折り返し
    if pos.y < -0.020 and abs(pos.x) < 0.016 and 0.050 < pos.z < 0.150:
        k = (pos.z - 0.050) / 0.024
        if abs(k - round(k)) < 0.17:
            f *= 0.68                                 # 紐
            if abs(abs(pos.x) - 0.013) < 0.003:
                f *= 1.60                             # ハトメ
    return _shade((0.46, 0.31, 0.18), f)


_HAIR_TABLE: list = []
# 毛束の中心線。塗り(_hair_color)が「どの毛束のどこか」を知るために使う
_HAIR_SPINES: list = []


def _hair_table():
    """毛束の定義(design/characters/garudo/hair-clumps.json)を読む"""
    if not _HAIR_TABLE:
        path = os.path.join(os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__)))),
            "design", "characters", "garudo", "hair-clumps.json")
        with open(path, encoding="utf-8") as fh:
            _HAIR_TABLE.append(json.load(fh))
    return _HAIR_TABLE[0]


def _ear_at(z: float):
    """高さzでの耳の断面(中心y, 半奥行きy)。色を引くのにも使う"""
    if z <= EAR_RINGS[0][0] or z >= EAR_RINGS[-1][0]:
        return None
    for (z0, _rx0, ry0, cy0), (z1, _rx1, ry1, cy1) in zip(EAR_RINGS, EAR_RINGS[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / max(1e-9, z1 - z0)
            return (cy0 + (cy1 - cy0) * t, ry0 + (ry1 - ry0) * t)
    return None


EAR_COLS = 14          # 断面を刻む列数(耳の前後方向)


def _ear_relief(off: float):
    """
    耳の断面の起伏。offは耳の中心からの正規化距離(0=中心, 1=縁)。
    返すのは (外側のxオフセット, 内側のxオフセット)。

    **耳輪(縁の隆起)を塗りではなく形で出す。** 楕円断面のロフトは
    必ず中央が厚く縁が薄いレンズになるので、耳輪の稜線が作れなかった。

    外へ張り出せる量は**設定画の顔の最大幅**で頭打ちになる。設定画の
    その高さの一番外側は耳そのものなので、耳を大きく出すと顔が横に
    広がる。張り出しは2mm弱に留め、**耳甲介を内側へ彫る**ことで
    5mm近い起伏を稼ぐ
    """
    ridge = math.exp(-((off - 0.70) / 0.17) ** 2)      # 耳輪の峰
    keep = 1.0 - _smoothstep(0.78, 1.00, off)          # 縁で起伏を消す
    edge = -0.0016 * _smoothstep(0.78, 1.00, off)      # 縁は頭へ潜り込ませる
    outer = (0.0012 + 0.0024 * ridge) * keep + edge
    inner = -0.0012 * keep + edge                       # 裏側(頭に隠れる)
    return outer, inner


def _ear_sections(sign: float):
    """耳のメッシュ断面。頭の断面へ沿わせ、起伏を _ear_relief で乗せる"""
    ry_max = max(r[2] for r in EAR_RINGS)
    out = []
    for z, _unused, ry, cy in EAR_RINGS:
        rxh, ryh, cyh = _head_at(z)
        # **前後に細い段ほど深く埋める**(上端と耳たぶ=付け根)
        sink = 0.0022 * (1.0 - ry / ry_max)
        outer_pts, inner_pts = [], []
        for j in range(EAR_COLS + 1):
            t = -1.0 + 2.0 * j / EAR_COLS
            y = cy + t * ry
            # **耳は頭の曲面に沿わせ、起伏はその上に乗せる。**
            # 段ごとに1つのxしか持たないと、板は前後にまっすぐなのに頭は
            # 丸いので、耳の中央だけ頭とほぼ同じ高さになり、耳輪の稜線
            # 2本だけが覗く「切れ込み」に見えた(実測)
            u = (y - cyh) / max(1e-9, ryh)
            base = rxh * math.sqrt(max(0.0, 1.0 - u * u)) - sink
            o, i = _ear_relief(abs(t))
            outer_pts.append((sign * (base + o), y, z))
            inner_pts.append((sign * (base + i), y, z))
        # 閉じた断面にする(外側を端から端まで、裏側を折り返して戻る)
        out.append(outer_pts + inner_pts[EAR_COLS - 1:0:-1])
    return out


def _ear_shadow(pos: Vector):
    """
    **頭側**に描く耳の落ち影。耳は別オブジェクトなので、頭のテクスチャが
    持つのはこの影だけ。

    広いグラデーションにすると頬に溶けて耳の在処が消える。設定画で耳を
    耳として読ませているのは輪郭線なので、その役を細い帯が担う。
    """
    sec = _ear_at(pos.z)
    if sec is None or abs(pos.x) < 0.045:
        return None
    cy, ry = sec
    off = abs(pos.y - cy) / max(1e-6, ry)
    if not (0.85 < off < 1.32):
        return None
    t = 1.0 - abs(off - 1.06) / 0.24
    return _lerp3(SKIN, EAR_EDGE, 0.80 * max(0.0, min(1.0, t)))


def _ear_color(pos: Vector, normal: Vector):
    """耳オブジェクトのアルベド。内部構造をここで描く"""
    return _ear_paint(pos) or SKIN


def _ear_paint(pos: Vector):
    """
    耳の内部構造を**テクスチャで**描く(plan/models/garudo-ear-as-anchor.md)。

    デフォルメの顔では、耳を細かく彫刻するより
    **シルエットはメッシュ・内部構造はテクスチャ**が合っている。
    描くのは3つだけ ―― 外形は肌、耳輪は茶系の中間影、耳穴はもう1段暗い影。
    耳たぶにわずかな赤み。溝は彫らない。

    耳と周囲の肌を同じベタ色にすると「肌が露出している」に見える。
    1段暗い色が入るだけで「ここに耳という構造物がある」と読める。
    張り出しは融合後で2〜3mmしかないので、**読ませるのは陰影の仕事**。
    耳の外側にも接地影を敷いて、頬から切り離す。
    """
    sec = _ear_at(pos.z)
    if sec is None:
        return None
    cy, ry = sec
    off = abs(pos.y - cy) / max(1e-6, ry)          # 0=耳の中央, 1=外周
    # 耳穴。耳の中ほどのやや前寄り、小さい面積
    canal = math.hypot((pos.y - (cy - 0.0035)) / 0.0060,
                       (pos.z - 0.8305) / 0.0080)
    if canal < 1.0:
        return _lerp3(EAR_CANAL, EAR_CONCHA, min(1.0, max(0.0, (canal - 0.5) / 0.5)))
    # **耳輪は隆起なので明るく、内側へ入るほど暗い。**
    # 逆にすると(輪を暗く・中を明るく)立体が反転して読めず、ただの
    # 浅いへこみに見えた(実測: 肌色へ戻した1回目)。また耳甲介を
    # 耳の内側いっぱいに広げると、稜線が無くなって一枚の窪みになり、
    # 傷のように見えた(2回目)。**輪・稜線・窪みの3段**にする
    if off > 0.60:
        base = _lerp3(EAR_RIDGE, EAR_HELIX, min(1.0, (off - 0.60) / 0.18))
    elif off > 0.30:
        base = _lerp3(EAR_CONCHA, EAR_RIDGE, min(1.0, (off - 0.30) / 0.18))
    else:
        base = EAR_CONCHA
    # 耳たぶは**上書きではなく色味を足すだけ**。ベタで返していたときは、
    # 耳の下半分から耳輪・耳甲介の段が丸ごと消えて、明るい三角形の
    # 板に見えた(実測)
    lobe = _smoothstep(0.8215, 0.8140, pos.z)
    return _lerp3(base, EAR_LOBE, 0.30 * lobe)


def _head_at(z: float):
    """高さzでの頭の断面(rx, ry, cy)。HEAD_RINGSを線形で引く"""
    rings = HEAD_RINGS
    z = max(rings[0][0], min(rings[-1][0], z))
    for (z0, rx0, ry0, _cx0, cy0), (z1, rx1, ry1, _cx1, cy1) in zip(rings, rings[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / max(1e-9, z1 - z0)
            return (rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t,
                    cy0 + (cy1 - cy0) * t)
    return (rings[-1][1], rings[-1][2], rings[-1][4])


def _scalp_point(az_deg: float, z: float):
    """
    頭の表面の点。方位角は0が正面(-y)、+が+x側。

    毛束の根元をこれで置くと、**必ず頭皮の上から生える**。座標を直接
    書くと頭から浮いた根元や埋まった根元ができる
    """
    rx, ry, cy = _head_at(z)
    a = math.radians(az_deg)
    return Vector((rx * math.sin(a), cy - ry * math.cos(a), z))


def _cap_z0(az_deg: float) -> float:
    """
    Hair Capの下端(方位角ごと)。

    **capは輪郭も生え際も作ってはいけない。** 額の前でcapを低くすると、
    毛束の隙間から見えるはずの額がcapで塞がれる。実測(設定画)では
    額の露出は最高 z=0.898 まで上がるので、正面のcapはそれより上で切る。
    横〜後頭部は毛束の隙間から地肌が見えるのを防ぐため低くする。
    **後ろは襟足まで下ろす。** z0.848で切っていたら、真横から見たときに
    そこが水平な段になり、下の地肌が露出していた(実測: 4方向レンダー)。
    """
    a = abs(((az_deg + 180.0) % 360.0) - 180.0)
    table = ((0.0, 0.906), (40.0, 0.902), (60.0, 0.878), (75.0, 0.845),
             (110.0, 0.822), (150.0, 0.818), (180.0, 0.818))
    for (a0, z0), (a1, z1) in zip(table, table[1:]):
        if a0 <= a <= a1:
            t = (a - a0) / (a1 - a0)
            return z0 + (z1 - z0) * t
    return table[-1][1]


def _hair_cap():
    """
    地肌を隠すためだけの土台。**シルエットは絶対に作らせない。**

    以前の `h_base` は z0.91〜0.965 でそれ自体が輪郭になっており、
    それが「ヘルメット」の正体だった。ここでは頭の断面を
    HAIR_CAP_OVER(数mm)だけ膨らませるに留め、輪郭は毛束に任せる。

    下端は方位角ごとに変える(`_cap_z0`)。リングを積む `C.loft` では
    高さが方位角に依存する形を作れないので、ここだけ直接組む。
    正面の下端がそのまま**生え際**になる。
    """
    segments, rows = 28, 6
    mesh = bpy.data.meshes.new("h_cap")
    obj = bpy.data.objects.new("h_cap", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    cols = []
    for i in range(segments):
        az = 360.0 * i / segments - 180.0
        z0 = _cap_z0(az)
        col = []
        for r in range(rows):
            t = (r / (rows - 1)) ** 0.85
            z = z0 + (HAIR_CAP_TOP - z0) * t
            p = _scalp_point(az, z)
            rx, ry, _cy = _head_at(z)
            a = math.radians(az)
            n = Vector((math.sin(a) / rx, -math.cos(a) / ry, 0.0))
            n.normalize()
            # 下端は頭皮に着地させる。膨らませたまま切ると、後頭部で
            # capの縁が**段(棚)**として見える(実測: 背面レンダー)
            col.append(bm.verts.new(
                p + n * HAIR_CAP_OVER * min(1.0, 0.12 + r / 2.0)))
        cols.append(col)
    for i in range(segments):
        j = (i + 1) % segments
        for r in range(rows - 1):
            bm.faces.new((cols[i][r], cols[j][r], cols[j][r + 1], cols[i][r + 1]))
    bm.faces.new([c[-1] for c in cols])
    bm.faces.new(list(reversed([c[0] for c in cols])))  # 下端(頭の中で見えない)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def _hair_lock_from(lock: dict):
    """
    **頭を回り込む1本の毛束**(plan/models/garudo-side-hair-volume.md)。

    正面図・側面図をそれぞれ別の殻にすると、3/4から見たときに
    「髪型」ではなく**複数方向から貼った殻**に見える。横髪は
    分け目→こめかみ→耳の前→頬 と3D空間を回り込む1つの物体なので、
    中心線をそのまま3Dで持つ。

    左右は鏡像にしない。分け目があるので設定画の輪郭が左右で9〜14mm違い
    (z880で -88 対 +98)、鏡像にすると必ず片側がはみ出す。

    各点は**部位**で置く ―― 方位角(0が正面、+が+x側)と高さ。
    `_scalp_point` で頭皮の上に落としてから `lift` だけ外へ浮かせるので、
    毛束は必ず頭に沿って回る。断面の向きは頭皮の法線で決まる。

    幅と厚みは点ごとに変える。一律だと「太いソーセージ」か「カード」の
    どちらかにしかならない(根元 薄い → 中間 厚い → 毛先 薄い)。
    """
    s = int(lock.get("sign", 1))
    pts, ws, ts, ns = [], [], [], []
    for p in lock["points"]:
        az = float(p["az"]) * s
        z = float(p["z"])
        rx, ry, _cy = _head_at(z)
        a = math.radians(az)
        n = Vector((math.sin(a) / rx, -math.cos(a) / ry, 0.0))
        n.normalize()
        pts.append(_scalp_point(az, z) + n * float(p["lift"]))
        ns.append(n)
        ws.append(float(p["w"]))
        ts.append(float(p["t"]))
    obj = C.clump_volume(f"h_{lock['name']}", pts, ws, ts, ns, segments=10)
    _HAIR_SPINES.append((pts, max(0.006, max(ws))))
    C.spherize_normals(obj, tuple(pts[0].lerp(pts[-1], 0.5)),
                       radius=None, strength=HAIR_NORMAL_BLEND)
    return obj


def _hair_side_from(major: dict, s: int):
    """
    側面図からなぞった毛束1本(左右へ鏡像で1つずつ作る)。

    輪郭は (y, z) ―― 奥行きと高さ。横位置 x は頭の楕円断面から取り、
    頭の前後端では潰れないように下限を敷く(側面図の輪郭は頭より前後へ
    はみ出すので、そのまま解くと x=0 になって顔の真ん中に板が立つ)。

    正面図と背面図だけで毛束を作ると、**横顔だけ滑らかな塊**になる。
    """
    outline = [(float(y), float(z)) for y, z in major["path_xz"]]
    lift = float(major["lift"])
    frac = float(major.get("xfrac", 0.70))
    root = major["root"]

    def depth(y: float, z: float) -> float:
        rx, ry, cy = _head_at(z)
        c = max(-1.0, min(1.0, (cy - y) / max(1e-6, ry)))
        wide = rx * math.sqrt(max(0.0, 1.0 - c * c))
        far = math.hypot(y - root[0], z - root[1])
        out = max(wide * frac, rx * 0.45) + lift * (0.30 + 0.70 * min(1.0, far / 0.040))
        return s * out

    obj = C.clump_shell(f"h_{major['name']}{'L' if s > 0 else 'R'}", outline, depth,
                        half_thick=float(major["thick"]), ramp=0.022,
                        cuts=int(major.get("cuts", 1)), plane="yz")
    order = sorted(outline, key=lambda p: math.hypot(p[0] - root[0], p[1] - root[1]))
    spine = [Vector((depth(root[0], root[1]), root[0], root[1]))]
    for k in range(4):
        part = order[len(order) * k // 4: max(1, len(order) * (k + 1) // 4)]
        if not part:
            continue
        my = sum(p[0] for p in part) / len(part)
        mz = sum(p[1] for p in part) / len(part)
        spine.append(Vector((depth(my, mz), my, mz)))
    half = sum(min((Vector((0.0, y, z)) - Vector((0.0, q.y, q.z))).length
                   for q in spine) for y, z in outline) / max(1, len(outline))
    _HAIR_SPINES.append((spine, max(0.006, half)))
    C.spherize_normals(obj, tuple(spine[0].lerp(spine[-1], 0.5)),
                       radius=None, strength=HAIR_NORMAL_BLEND)
    return obj


_HAIR_XZ_CACHE = None


def _hair_xz_polys():
    """正面から見た毛束の輪郭(x,z)。デカールの塗り止めに使う"""
    global _HAIR_XZ_CACHE
    if _HAIR_XZ_CACHE is None:
        t = _hair_table()
        _HAIR_XZ_CACHE = [[(float(x), float(z)) for x, z in m["path_xz"]]
                          for m in list(t["major"]) + list(t.get("aux", []))
                          if m.get("side") != "back" and m.get("path_xz")]
    return _HAIR_XZ_CACHE


def _in_hair_xz(x: float, z: float) -> bool:
    """(x,z)が正面の毛束の輪郭の中か(交差数で判定)"""
    for poly in _hair_xz_polys():
        inside = False
        n = len(poly)
        for i in range(n):
            x0, z0 = poly[i]
            x1, z1 = poly[(i + 1) % n]
            if (z0 > z) != (z1 > z) and \
                    x < x0 + (x1 - x0) * (z - z0) / (z1 - z0):
                inside = not inside
        if inside:
            return True
    return False


def _hair_major_from(major: dict):
    """
    主要毛束1本。**設定画からなぞった輪郭をそのまま形にする**
    (plan/models/archive/garudo-hair-clumps.md 第2次改訂)。

    中心線+幅で作る従来の毛束では、設定画に描かれている毛束の
    輪郭 ―― 前髪が2つに割れた毛先、シルエットの尖り、房と房の切れ込み
    ―― を作れなかった。正面図でなぞった閉じた輪郭 `path_xz` を入力に
    すると、**正面のシルエットは定義により設定画と一致する**。

    y(奥行き)は頭の楕円断面から取り、根元から離れるほど `lift` だけ
    前へ浮かせる。輪郭は正面図から取ったものなので、奥行きの責任は
    こちら側にある。
    """
    outline = [(float(x), float(z)) for x, z in major["path_xz"]]
    root = Vector((major["root"][0], 0.0, major["root"][1]))
    lift = float(major["lift"])
    # 背面図からなぞった毛束は、同じ x,z のまま**頭の裏側**へ置く
    # (`tools/trace_hair_clumps.py --back` が背面図を左右反転して
    #  モデル座標へ揃えているので、輪郭は正面と同じ書き方でよい)
    back = major.get("side") == "back"

    def depth(x: float, z: float) -> float:
        rx, ry, cy = _head_at(z)
        a = math.asin(max(-1.0, min(1.0, x / max(1e-6, rx))))
        far = math.hypot(x - root.x, z - root.z)
        out = (ry * math.cos(a) + lift * (0.30 + 0.70 * min(1.0, far / 0.040)))
        return cy + out if back else cy - out

    # 内部の分割は1回で足りる。**輪郭は間引き前の点列がそのまま境界に
    # なる**ので、シルエットは分割数に依らない。2回にすると毛束だけで
    # 14,936三角形になり、モデル全体の予算(24,000)を超える
    obj = C.clump_shell(f"h_{major['name']}", outline, depth,
                        half_thick=float(major["thick"]), ramp=0.022,
                        cuts=int(major.get("cuts", 1)))
    # 塗り(_hair_color)が「根元から毛先へ」を知るための中心線。輪郭の
    # 点を根元からの距離で4つの帯に分け、帯ごとの重心をつなぐ
    order = sorted(outline, key=lambda p: math.hypot(p[0] - root.x, p[1] - root.z))
    spine = [root.copy()]
    bands = 4
    for k in range(bands):
        part = order[len(order) * k // bands: max(1, len(order) * (k + 1) // bands)]
        if not part:
            continue
        mx = sum(p[0] for p in part) / len(part)
        mz = sum(p[1] for p in part) / len(part)
        spine.append(Vector((mx, depth(mx, mz), mz)))
    spine[0] = Vector((root.x, depth(root.x, root.z), root.z))
    # 塗りが「毛束の縁」を出すには、中心線からの距離を**その毛束の太さで
    # 割る**必要がある。輪郭から作る毛束は幅が20〜80mmと差が大きく、
    # 距離をmmのまま使うと大きい毛束が全面まっ黒になる
    # (実測: crown_Lのモデル側の髪判定が78%まで落ちた)
    half = sum(min((Vector((x, 0.0, z)) - Vector((q.x, 0.0, q.z))).length
                   for q in spine) for x, z in outline) / max(1, len(outline))
    _HAIR_SPINES.append((spine, max(0.006, half)))
    C.spherize_normals(obj, tuple(spine[0].lerp(spine[-1], 0.5)),
                       radius=None, strength=HAIR_NORMAL_BLEND)
    return obj


def _hair_along(pos: Vector):
    """
    点がどの毛束のどこか。(根元→毛先の進み t, 中心線からの距離) を返す。

    毛束の構造を**塗りにも使う**ための関数。以前は
    `sin(方位角*16)` の縞を髪全体に掛けていたが、これは毛束の位置と
    無関係なので、せっかく毛束を作っても「縞のヘルメット」に見える。

    返すのは (中心線からの距離をその毛束の太さで割った比,
    根元からの長さ, 毛先までの長さ)。
    **割合ではなく長さ**で返すのが要点。割合で根元を暗くすると、
    長い襟足の毛束が半分まで暗くなり、後頭部に横一本の帯が出る
    (実測: 背面レンダー)。
    """
    best = (1e9, 0.0, 1.0)
    for spine, half in _HAIR_SPINES:
        total = sum((b - a).length for a, b in zip(spine, spine[1:])) or 1e-9
        run = 0.0
        for a, b in zip(spine, spine[1:]):
            d = b - a
            ll = d.length_squared or 1e-12
            u = max(0.0, min(1.0, (pos - a).dot(d) / ll))
            q = a + d * u
            dist = (pos - q).length / half     # **その毛束の太さで割る**
            if dist < best[0]:
                along = run + d.length * u
                best = (dist, along, total - along)
            run += d.length
    return best[0], best[1], best[2]


def _hair_color(pos: Vector, normal: Vector):
    """
    髪: 毛束ごとに「根元が暗い・中央が基本色・上面が明るい・毛先が暗い」。

    設定画の髪は1本ずつの毛ではなく**毛束の塊**で塗られている。細い縞を
    引くのではなく、毛束の中心線に沿った弱い階調と、中心線から離れる
    ほど暗くする陰りで、毛束の境界を出す。
    """
    dist, from_root, to_tip = _hair_along(pos)
    f = 1.0
    f *= 0.79 + 0.32 * _smoothstep(0.0, 0.026, from_root)  # 根元が暗い
    f *= 1.0 - 0.26 * _smoothstep(0.030, 0.0, to_tip)      # 毛先が暗い
    f *= 1.0 - 0.30 * _smoothstep(0.55, 1.15, dist)        # 毛束の縁
    f *= 0.96 + 0.32 * max(0.0, min(1.0, (pos.z - 0.82) / 0.16))  # 上ほど明るい
    f *= 1.0 + 0.16 * max(0.0, normal.z) - 0.20 * max(0.0, -normal.z)
    if pos.y > 0.055:
        f *= 0.90                                          # 後頭部
    # **暗い側に床を敷く。** 掛け算を重ねると最悪 0.28 まで落ち、髪が
    # ほぼ黒い塊になる。設定画の髪は中間調で、黒くなるのは輪郭線だけ。
    # 黒い塊は顔一致QAの目の検出も壊す(暗部の連結成分が眉・髪と
    # 繋がって「目」として拾われる。実測: 目尻が+7.5mm外へ飛んだ)
    return _shade(HAIR, max(0.62, f))


def _eye_texture(size: int = 128) -> "bpy.types.Image":
    """
    目のイラストを1枚描く(UV円板いっぱい)。左右のパッチで共用する。
    上まぶたを太く、虹彩は濃い縁+暖色の芯、瞳、ハイライト2粒。
    """
    import numpy as np

    ny, nx = np.mgrid[0:size, 0:size]
    # 円板の内側を(-1,1)に正規化。+yが上
    x = (nx + 0.5) / size * 2.0 - 1.0
    y = (ny + 0.5) / size * 2.0 - 1.0
    aa = 2.5 / size  # アンチエイリアスの幅(テクセル数ぶん)

    def smooth(edge0, edge1, v):
        t = np.clip((v - edge0) / (edge1 - edge0), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    def ellipse(cx, cy, rx, ry):
        """内側=1、外側=0の滑らかなマスク"""
        d = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
        return 1.0 - smooth(1.0 - aa * 2.0, 1.0 + aa * 2.0, d)

    px = np.zeros((size, size, 4), dtype=np.float32)
    px[..., 3] = 1.0

    def paint(mask, color):
        m = mask[..., None]
        px[..., :3] = px[..., :3] * (1.0 - m) + np.array(color, dtype=np.float32) * m

    def almond(cx, cy, rx, ry_up, ry_down=None, power=1.65):
        """
        角の尖ったアーモンド形(超楕円)。アニメの目の輪郭。
        上下で半径を変えられる: 設定画の目は**目頭・目尻が縦の中心より
        上**にあり(実測: корner z847.8に対し上瞼858・下瞼830)、
        下まぶたが深く垂れる形をしている
        """
        ry_down = ry_up if ry_down is None else ry_down
        ry = np.where(y >= cy, ry_up, ry_down)
        d = (np.abs((x - cx) / rx) ** power + np.abs((y - cy) / ry) ** power) ** (1.0 / power)
        return 1.0 - smooth(1.0 - aa * 2.0, 1.0 + aa * 2.0, d)

    LINE = (0.12, 0.075, 0.055)
    # パッチの外周には肌を残し(顔と法線を揃えてあるので継ぎ目が出ない)、
    # その内側にアーモンド形の目を1枚の絵として描く
    px[..., :3] = np.array(SKIN, dtype=np.float32)
    paint(almond(0.0, 0.09, 0.94, 0.52, 0.90), LINE)             # 目の輪郭線
    paint(almond(0.0, 0.03, 0.86, 0.44, 0.80), (0.97, 0.96, 0.94))  # 白目
    paint(ellipse(0.0, -0.14, 0.50, 0.56), (0.30, 0.18, 0.10))   # 虹彩の縁
    paint(ellipse(0.0, -0.16, 0.38, 0.43), (0.62, 0.38, 0.17))   # 虹彩(暖色)
    paint(ellipse(0.0, -0.17, 0.17, 0.19), (0.10, 0.065, 0.05))  # 瞳
    paint(ellipse(-0.22, 0.06, 0.16, 0.15), (1.0, 1.0, 1.0))     # ハイライト大
    paint(ellipse(0.20, -0.42, 0.085, 0.08), (1.0, 1.0, 1.0))    # ハイライト小
    # 上まぶた(太い線)。虹彩の上を少し隠すとアニメの目になる
    lid = almond(0.0, 0.09, 0.94, 0.52, 0.90) * \
        (1.0 - almond(0.0, -0.10, 0.92, 0.50, 0.88))
    paint(lid, LINE)

    img = bpy.data.images.new("garudo_eye_tex", size, size, alpha=False)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def _hand_color(pos: Vector, normal: Vector):
    """
    素手(手袋の下)。爪・指の分かれ目・関節の陰。

    手袋を脱がせた状態でもそのまま使えるように塗る。**見えないから
    適当でよい、にしない**(手袋を外す表現を足すときに作り直しになる)
    """
    side = 1.0 if pos.x >= 0 else -1.0
    wrist, knuckle, arm, spread, palm_n = _hand_frame(side)
    f = 1.0
    f *= 1.0 + 0.06 * max(0.0, -normal.dot(palm_n))      # 甲は明るい
    f *= 1.0 - 0.10 * max(0.0, normal.dot(palm_n))       # 手のひらは暗い
    d, fingers = _hand_dist(pos, side)
    near = sorted(fingers)
    if len(near) > 1 and near[1] - near[0] < 0.0018 and near[0] < 0.005:
        f *= 0.86                                        # 指の分かれ目
    # 爪(甲側の指先)
    for i, (off, length, r0, r1, bend, fan) in enumerate(FINGERS):
        base = knuckle + spread * off - arm * 0.004
        tip = base + (arm + spread * fan).normalized() * length \
            + palm_n * (-bend * 1.5)
        if (pos - (tip - arm * 0.006 - palm_n * 0.002)).length < 0.0034 \
                and normal.dot(palm_n) < -0.1:
            return _shade(SKIN, 1.06)
    if (pos - wrist).dot(arm) < 0.004:
        f *= 0.94                                        # 手首側を少し暗く
    return _shade(SKIN, f)


def _glove_color(pos: Vector, normal: Vector):
    """
    手袋(別ジオメトリ)。革の陰影・指の分かれ目の線・折り返しの段・
    甲の明るみ・手首のリベット。

    **手袋を本体の距離場で塗るのをやめた。** 以前は融合ボディの表面を
    「手のひらの球からの距離」で手袋色に塗っていたので、指の隙間が
    ボクセルで埋まり(実測: 3.8mmボクセルでは4mmの隙間が消える)、
    線を描いてごまかしていた。手袋を別ジオメトリにすると隙間が残る
    """
    side = 1.0 if pos.x >= 0 else -1.0
    wrist, knuckle, arm, spread, palm_n = _hand_frame(side)
    along = (pos - wrist).dot(arm)
    f = 1.0
    # 甲(palm_n の逆側)を明るく、手のひら側を暗く
    f *= 1.0 + 0.10 * max(0.0, -normal.dot(palm_n)) \
        - 0.12 * max(0.0, normal.dot(palm_n))
    # 指の付け根(ナックル)の張り
    f *= 1.0 + 0.12 * (1.0 - _smoothstep(0.010, 0.030, (pos - knuckle).length))
    if along < 0.0:
        # 折り返し。下端に段(縫い目)、上へ向かって少し暗く
        f *= 0.92 - 0.12 * _smoothstep(-0.004, -0.040, along)
        if -0.008 < along < -0.003:
            f *= 0.72                                   # 折り返しの縁の線
        # 甲側のリベット
        rivet = (pos - (wrist - arm * 0.026 - palm_n * 0.019)).length
        if rivet < 0.005:
            return _shade(HOOP, 1.0 + 0.2 * (1.0 - rivet / 0.005))
    else:
        _d, fingers = _hand_dist(pos, side, LEATHER_T)
        near = sorted(fingers)
        if len(near) > 1 and near[1] - near[0] < 0.0022 and near[0] < 0.006:
            f *= 0.60                                   # 指の分かれ目
        # 甲の腱の線(付け根から手首へ)
        lateral = abs((pos - wrist).dot(spread))
        if normal.dot(palm_n) < -0.3 and 0.012 < along < 0.048:
            for t in (-0.011, 0.0, 0.011):
                if abs(lateral - abs(t)) < 0.0012 and t <= 0:
                    f *= 0.94
    return _shade(LEATHER, f)


def _body_color(pos: Vector, normal: Vector, state: int = 0):
    """
    融合ボディの塗り分け(距離場)+顔・前立ての焼き込み。
    優先順: 素肌(頭・前腕・手) > ズボン(ベルトより下) > シャツ。
    しきい値の段差はベルト・エプロン・ブーツの実体ジオメトリの陰に隠れる。

    **手袋はここでは塗らない。** 手袋は別ジオメトリ(garudo_glove)で、
    この下にある手は素肌のまま。
    """
    return _body_color_no_hand(pos, normal, state)


def _body_color_no_hand(pos: Vector, normal: Vector, state: int = 0):
    """手袋より後ろの塗り分け(素肌・ズボン・シャツ)"""
    # 素肌: 首から上(頭はロフトの卵形なので球の距離場は使えない。
    # 胴の肩口がz0.782なので、この高さで切れば首と頭だけが残る)+
    # 前腕のカプセル(袖まくりの先)
    skin_field = _smoothstep(0.760, 0.772, pos.z)
    for s in (1.0, -1.0):
        d_fore = _seg_dist(pos, Vector((0.165 * s, 0.004, 0.594)),
                           Vector((HAND_WRIST_L.x * s, HAND_WRIST_L.y,
                                   HAND_WRIST_L.z)))
        skin_field = max(skin_field, 1.0 - _smoothstep(0.030, 0.038, d_fore))
        # 手(手袋の下の素手)。**手袋を脱がせても手として成立する**
        d_hand, _f = _hand_dist(pos, s)
        skin_field = max(skin_field, 1.0 - _smoothstep(0.002, 0.008, d_hand))
    if skin_field > 0.5:
        # 顔はアニメの文法で「描く」(参照スクリーンショットの指摘対応)。
        # 太い上まぶたの線・意思のある眉・口の線+下唇の影・鼻の点。
        # 高密度化した顔UV島(organic_uvのboost)が細い線を支える。
        # 面法線のガードは使わない(縁テクセルで判定が明滅して線が
        # 点描に割れた実測。後頭部の同じxz帯は髪ジオメトリが覆うので、
        # 素の距離場だけで安全に引ける)
        # 生え際より上と後頭部は髪色で塗る(房の隙間から地肌が覗かない)
        if pos.z > 0.900 and pos.y > -0.060:
            return HAIR
        if pos.y > 0.045 and pos.z > 0.800:
            return HAIR
        if pos.y < 0.014:
            # 目・眉・鼻・口・頬はSVGのデカールから引く
            # (design/characters/garudo/face.svg が唯一の情報源)。
            # **目も顔テクスチャそのものに描く**。まばたきは顔の島だけを
            # 3コマのアトラスにしてUVをずらして切り替える。目のためだけに
            # 板を貼ると、材質・解像度・法線が本体とずれて「顔に板が
            # 乗っている」ように見えた(第6段階の顛末)
            # **顔のデカールは正面図の投影**なので、横を向いた面に
            # そのまま乗せると目や眉が頬・耳へ引き伸ばされて貼りつく
            # (実測: 3/4のレンダーで頬に目の形の染みが出た)。
            # 位置でなだらかに薄める(法線で切ると縁テクセルで判定が
            # 明滅して線が点描に割れる)
            # **顔のデカールは正面図の平面投影**なので、正面から傾いた面
            # ほど横へ引き伸ばされて貼りつく。伸び率は面の向きで決まる
            # (1/|法線のy成分|)ので、**法線で薄める**のが素直。
            #
            # xで薄めると頬の階調まで消えて頬が明るい肌一色になり、肌IoUの
            # 到達率が98%→93%へ落ちた。奥行き(y)で薄めると、頬は正面を
            # 向いているのに深さは浅いので効かず、横顔で目の形の染みが
            # 残った。**外側だからでも奥だからでもなく、傾いているから**薄める
            #
            # ただし薄める範囲は**引き伸ばしが破綻する角度だけ**に絞る。
            # 0.30〜0.65で薄めると頬(法線y≈0.5)まで巻き込んで到達率が
            # 96%→94%へ落ちた。伸び率は0.30で3.3倍・0.10で10倍なので、
            # 頬を残して染みだけ消せるのはこの帯。
            #
            # 使う法線は**メッシュの法線ではなく頭の断面楕円から出した
            # 解析法線**。融合後のメッシュ法線は面ごとに飛ぶので、
            # そのまま閾値で切ると境界がぎざぎざの島に割れる
            # (実測: 頬に波打った斑ができた)。楕円の法線なら分割数に
            # よらず滑らかなので、境界も滑らかに出る。
            #
            # 帯を 0.30〜0.55 まで広げると横顔の引き伸ばしはほぼ消えるが、
            # 正面図でも頬の外側(方位角75〜90°)は傾いているので階調が
            # 抜け、肌IoUが 0.802→0.783(到達率97%→95%)へ落ちた。
            # **平面投影である限りこのトレードオフは消えない** ―― 本当の
            # 解決は顔テクスチャをUV基準で描き直すことで、それは別件
            rx, ry, cy = _head_at(pos.z)
            nx, ny = pos.x / (rx * rx), (pos.y - cy) / (ry * ry)
            fade = _smoothstep(0.10, 0.28, -ny / max(1e-9, math.hypot(nx, ny)))
            # **髪は塗りではなく毛束で出す**(外部評価 第5回)。
            # デカールは設定画の顔を明度で量子化してまるごと写すので、
            # **髪も一緒に描かれている**。それを肌のテクスチャへ焼くと、
            #
            #   * 面が傾いた頬の外側では上の fade が半分だけ効いて薄まり、
            #   * 平面投影なので奥行き方向へ引き伸ばされ、
            #
            # 「輪郭のぼやけた薄い髪の幽霊」になる。しかもこれは正面の
            # IoUでは捕まらない ―― **幽霊が設定画と一致するので指標は
            # 上がる**。材質IDで数え直すと、窓の中に7,582pxあった。
            #
            # なぞった毛束の輪郭の中は毛束ジオメトリの担当なので塗らない。
            # 材質の境目はジオメトリが決め、材質の内側だけを絵で描く
            if _in_hair_xz(pos.x, pos.z):
                fade = 0.0
            painted = _over(SKIN, pos.x, pos.z, state, fade)
            if painted != SKIN:
                return painted

        # 顔の描き込み陰影(規約3)。トゥーン階調に頼らず、絵として
        # 「この面は少し暗い」を焼き込む: 前髪の落ち影・こめかみ・
        # あご下・首。照明が変わっても顔の立体が壊れない
        shade = 0.0
        shade = max(shade, 0.55 * _smoothstep(0.900, 0.930, pos.z))       # 前髪の影
        shade = max(shade, 0.30 * _smoothstep(0.050, 0.072, abs(pos.x)))  # こめかみ
        shade = max(shade, 0.45 * (1.0 - _smoothstep(0.762, 0.800, pos.z)))  # あご下
        # 首の影。**zだけで段を作ると、あごを横切る水平な継ぎ目**が
        # 顔に出る(実測: 口の高さに顔幅いっぱいの境目)。首はあごの
        # 奥(+y)にあるので、yでも絞ってなだらかに落とす
        shade = max(shade, 0.50 * _smoothstep(0.800, 0.775, pos.z)
                    * _smoothstep(-0.020, 0.004, pos.y))
        shade = max(shade, 0.25 * _smoothstep(0.010, 0.050, pos.y))       # 後頭部側
        # 耳は別オブジェクトなので、頭側に残すのは**耳の落ち影だけ**。
        # 耳の内部(耳輪・耳甲介・耳穴)は耳自身のテクスチャが持つ
        ear = _ear_shadow(pos)
        if ear is not None:
            return ear
        return _lerp3(SKIN, SKIN_SHADE, min(0.75, shade))

    # ズボン(ベルトより下)。膝の明るみ・裾だまりの折れ皺・尻の落ち影
    if pos.z < 0.545:
        f = 1.0
        f *= 0.90 + 0.12 * max(0.0, min(1.0, (pos.z - 0.15) / 0.40))
        for s in (1.0, -1.0):
            d = (pos - Vector((0.069 * s, -0.048, 0.285))).length
            f *= 1.0 + 0.10 * (1.0 - _smoothstep(0.015, 0.038, d))
        if pos.z < 0.205 and math.sin(pos.z * 240.0 + pos.x * 60.0) > 0.55:
            f *= 0.88
        if pos.z > 0.50 and pos.y > 0.02:
            f *= 0.93
        return _shade(TROUSERS, f)

    # シャツ。前立て+ボタン+胸の明るみ+裾・脇の落ち影+布の折れ
    if normal.y < -0.2 and abs(pos.x) < 0.0026 and 0.695 < pos.z < 0.764:
        return SHIRT_LINE
    for bz in (0.742, 0.718):
        if (pos - Vector((0.0, -0.062, bz))).length < 0.0045:
            return SHIRT_LINE
    # 袖まくりの折り返し帯(肘の少し上)をわずかに濃く
    for s in (1.0, -1.0):
        d = (pos - Vector((0.112 * s, 0.004, 0.622))).length
        if d < 0.036:
            return _lerp3(SHIRT, SHIRT_LINE, 0.45)
    f = 1.0
    f *= 0.93 + 0.10 * max(0.0, min(1.0, (pos.z - 0.545) / 0.20))   # 胸を明るく
    if pos.z > 0.760:
        f *= 0.92                                                   # 襟もとの影
    for s in (1.0, -1.0):
        d = (pos - Vector((0.078 * s, 0.0, 0.700))).length          # 脇の落ち影
        f *= 1.0 - 0.10 * (1.0 - _smoothstep(0.012, 0.034, d))
        # 布の折れ(ベルトから胸へ抜ける柔らかい皺)
        d = _seg_dist(pos, Vector((0.045 * s, -0.058, 0.575)),
                      Vector((0.020 * s, -0.062, 0.640)))
        f *= 1.0 - 0.07 * (1.0 - _smoothstep(0.004, 0.011, d))
    return _shade(SHIRT, f)


def build() -> tuple[list, object]:
    leather_mat = C.make_material("garudo_leather", LEATHER, roughness=0.75)
    hoop_mat = C.make_material("garudo_hoop", HOOP, roughness=0.45, metallic=0.7)
    cloth_mat = C.make_material("garudo_cloth", CLOTH, roughness=0.9)
    skirt_mat = C.make_material("garudo_skirt", (0.38, 0.43, 0.50), roughness=0.9)

    # ================= 有機部(融合してテクスチャで塗り分け) =================
    organic = []
    organic.append(C.loft("g_head", HEAD_RINGS))
    organic.append(C.cylinder("g_neck", (0, 0.008, 0.782), 0.024, 0.055))
    organic.append(C.loft("g_torso", [
        (0.535, 0.085, 0.055, 0.0, 0.0),
        (0.600, 0.092, 0.058, 0.0, 0.0),
        (0.680, 0.100, 0.062, 0.0, 0.0),
        (0.744, 0.100, 0.060, 0.0, 0.0),
        (0.752, 0.068, 0.044, 0.0, 0.0),
        (0.766, 0.034, 0.028, 0.0, 0.0),
    ]))
    for s in (1, -1):
        # 袖(肘まで。まくり口は少し太い)→ 前腕(素肌)→ 手(素手)
        # 袖は肘へ向かって細くなる。肩と手首は合っているのに肘の高さ
        # (z0.644)だけ外側が13.7mm出ていた
        organic.append(C.curve_tube(f"g_sleeve{s}",
                                    [(s * 0.078, 0.0, 0.744), (s * 0.100, 0.004, 0.690),
                                     (s * 0.165, 0.004, 0.604)],
                                    [0.030, 0.027, 0.024]))
        # 前腕は**手首(z0.519)で終える**。設定画の素肌の前腕は z0.533 で
        # 終わり、そこから下は手袋の折り返しに隠れる。以前は z0.460 まで
        # 伸びていて、前腕が50mm長く手が短かった
        organic.append(C.curve_tube(
            f"g_fore{s}",
            [(s * 0.165, 0.004, 0.604),
             (s * HAND_WRIST_L.x, HAND_WRIST_L.y, HAND_WRIST_L.z)],
            [0.021, 0.011]))
    # 腰(尻の量感)+脚+裾のたくれ
    organic.append(C.loft("g_seat", [
        (0.42, 0.086, 0.054, 0.0, 0.002),
        (0.50, 0.090, 0.057, 0.0, 0.002),
        (0.55, 0.086, 0.056, 0.0, 0.0),
    ]))
    for s in (1, -1):
        # 脚は**下へ行くほど外へ・細く**。設定画の正面図で、すねの中心は
        # x80mm・幅50mmしかない(モデルは中心66mm・幅88mmだった)。
        # 外側の輪郭は合っていて内側だけ30〜57mm食い込んでおり、
        # 脚の間の空きが埋まっていた
        organic.append(C.curve_tube(f"g_leg{s}",
                                    [(s * 0.066, 0.0, 0.44), (s * 0.074, 0.0, 0.30),
                                     (s * 0.080, 0.0, 0.21)],
                                    [0.038, 0.032, 0.028]))
        # ズボンの裾だまり。円柱だと下端まで太いままで、設定画では
        # z0.191で半幅50mm・z0.172で40mmと絞れている
        organic.append(C.loft(f"g_cuff{s}", [
            (0.148, 0.036, 0.034, s * 0.078, 0.0),
            (0.170, 0.042, 0.040, s * 0.075, 0.0),
            (0.192, 0.049, 0.046, s * 0.071, 0.0),
            (0.210, 0.045, 0.042, s * 0.069, 0.0),
        ]))

    # 入力はすべてクリーンな閉プリミティブなのでSMOOTH段階を飛ばす
    # (SMOOTHのremove_disconnectedは交差しているだけの頭を切り捨てた)
    # ボクセルは指(直径12〜16mm)が潰れない細かさが要る。6mmだと
    # 指が手のひらへ吸われてミトンに戻る。上限を主人公だけ広げたので
    # 三角形も増やせる(tests/models.test.ts の予算表)
    body = C.sculpt_merge(NAME, organic, voxel=0.0038, target_tris=9000,
                          clean_input=True)
    # 直立キャラ: 前後split(顔をシームが横切らない)。頭部を独立島に
    # 切り出して2.5倍へ拡大し、「テクスチャの絵」として描き込む顔に
    # 十分なテクセル密度を寄せる(商用トゥーンRPGの顔はほぼテクスチャで
    # 成立しているという指摘への対応)
    # 顔のテクセル密度を上げ、目パッチとの差を詰める。顔が0.9px/mm・
    # パッチが5.3px/mmだと、ぼけた顔の上に鋭い目のシールが貼ってある
    # ように見える(レンダリングで目だけ板に見えた一因)。
    # glbは700KBまでなので本体テクスチャは512のまま、**UVの取り分**で
    # 稼ぐ(実測: boost 2.5→5.0 で顔 894→1212 texels/unit。6.0まで
    # 上げても1232で頭打ちになり、他の島の最低密度だけが落ちる)
    # 顔は**本体とは別のマテリアル**にする。まばたきで
    # open / half / closed を切り替えるため、顔の島だけを3コマ横に
    # 並べたアトラスにしたいから。目のためだけに板を貼るのはやめた
    # (材質・解像度・法線が本体とずれて「顔に板が乗って」見えた)
    C.organic_uv(body, axis=1, boost=(FACE_ISLAND_C, FACE_ISLAND_R, 1.0, FACE_ISLAND_MAX_Y))
    C.uv_report(body, size=1024, regions={"face": (FACE_ISLAND_C, 0.09)})
    face_polys = C.split_material_region(body, FACE_ISLAND_C, FACE_ISLAND_R,
                                        max_y=FACE_ISLAND_MAX_Y)
    if not face_polys:
        raise RuntimeError("顔の島を切り出せなかった")
    body_img = C.bake_albedo(body, _body_color, size=1024,
                             name="garudo_albedo", material_index=0)
    tiles = [C.bake_albedo(body, (lambda k: lambda p, n: _body_color(p, n, k))(k),
                           size=FACE_TEX, name=f"garudo_face_{st}",
                           material_index=1)
             for k, st in enumerate(DECAL_STATES)]
    face_img = _atlas_h(tiles, "garudo_face_atlas")
    # 顔の島のUVを左端のコマへ詰める。実行時はoffset.xに k/3 を足すだけで
    # 状態が切り替わる(three.jsは uv*repeat + offset)
    uv = body.data.uv_layers.active.data
    for poly in body.data.polygons:
        if poly.material_index == 1:
            for li in poly.loop_indices:
                uv[li].uv[0] /= len(DECAL_STATES)
    body.data.materials[0] = C.make_textured_material("garudo_body", body_img,
                                                      roughness=0.8)
    body.data.materials[1] = C.make_textured_material("garudo_face", face_img,
                                                      roughness=0.8)
    # まばたきの指定はノードのextrasで運ぶ(src/view/blink.ts)
    body["blink"] = "eyelid"
    body["blinkTiles"] = len(DECAL_STATES)
    body["blinkMaterial"] = "garudo_face"
    # 顔まわりの法線を頭中心の球へ寄せ、頬の変な影を消す(規約4)
    C.spherize_normals(body, tuple(FACE_C), radius=0.115, strength=1.0)

    parts_list = [body]  # joinする部品(bodyのUV・材質は維持される)
    pinned = []          # (グループ名, ボーン名)

    def add(obj, mat, pin_bone=None):
        C.assign_material(obj, mat)
        if pin_bone:
            C.mark_for_pin(obj)
            pinned.append((obj.name, pin_bone))
        parts_list.append(obj)
        return obj


    # まばたきが成立する条件を組み立て時に確かめる:
    # **状態によって顔の色が変わること**。デカールの状態切り替えが
    # 効いていないと、見た目は正常なのにまばたきだけ静かに止まる
    probe = Vector((EYE_X, -0.060, EYE_Z))
    n = Vector((0.0, -1.0, 0.0))
    assert _body_color(probe, n, 0) != _body_color(probe, n, 2), \
        "目の位置で open と closed の色が同じ(まばたきが効かない)"

    # ================= 髪(立体的な大きな毛束) =================
    # plan/models/archive/garudo-hair-clumps.md。板(_hair_card)と頭皮に沿う殻
    # (_hair_shell)をやめ、3層に分ける:
    #
    #   Hair Cap  →  Major Clumps  →  Painted Detail
    #   (地肌隠し)     (シルエット)      (毛の流れ)
    #
    # 毛束は design/characters/garudo/hair-clumps.json から読む。
    # 毛先は設定画から実測した値(tools/trace_hair_clumps.py)。
    cap = _hair_cap()
    by_name: dict = {}

    def _keep(obj, name):
        by_name[name] = obj
        return obj

    front_clumps = [_keep(_hair_major_from(m), m["name"])
                    for m in _hair_table()["major"]]
    # 主要毛束の間(髪の面積の約3割)は補助の毛束で埋める。輪郭の作りは
    # 同じで、浮かせる量を小さくして主要毛束の**下**に敷く
    front_clumps += [_keep(_hair_major_from(m), m["name"])
                     for m in _hair_table().get("aux", [])]
    # 後頭部。輪郭は設定画の**背面図**からなぞる。ここを作らないと、
    # 正面だけ毛束・後ろは滑らかな椀という「半分だけヘルメット」になる
    back_clumps = [_keep(_hair_major_from(m), m["name"])
                   for m in _hair_table().get("major_back", [])]
    # 横髪。**投影ごとの殻をやめ、頭を回り込む1本の毛束にする**
    # (plan/models/garudo-side-hair-volume.md)。側面専用の
    # clump_shell(plane="yz") は使わない
    side_locks = [_keep(_hair_lock_from(m), m["name"])
                  for m in _hair_table().get("major_3d", [])]
    clumps = front_clumps + back_clumps + side_locks

    # **3/4から見た重なり順を機械で確かめる**(仕様の受け入れ基準4)。
    # 設定画に3/4図は無いのでIoUでは測れない。前髪 > 横髪 > 後頭部の
    # 順になっていれば「板が何枚も無関係に重なっている」事故は防げる。
    # 0°(正面)と45°(3/4)の両方で見る
    # 順序を見るのは**額にかかる前髪**と**こめかみの毛束**と**後頭部**。
    # 「主要毛束」全部を前髪として数えると、頭頂の板や跳ねまで入って
    # 意味を成さない(実測: そう数えたら15%になった)
    fringe = [by_name[n] for n in ("fringe_L", "fringe_R", "aux_part")
              if n in by_name]
    rear = back_clumps
    for ang in (0.0, 45.0):
        a = math.radians(ang)
        d = Vector((math.sin(a), math.cos(a), 0.0))
        for label, fg, bg in (("前髪>横髪", fringe, side_locks),
                              ("横髪>後頭部", side_locks, rear)):
            if not fg or not bg:
                continue
            rate, rays = C.depth_order(fg, bg, d, cell=0.003)
            if rays < 150:
                continue                   # 重なりが無ければ順序も無い
            print(f"  [hair] {ang:.0f}° {label} {rate:.0%} ({rays}本)")
            assert rate >= 0.85, \
                f"{ang:.0f}°で{label}の重なり順が崩れている({rate:.0%})"
    # **capが輪郭を作っていないことを機械で確かめる。** 目で見ても
    # 「髪の塊」にしか見えず気付けない(旧h_baseがそうだった)
    # capは後頭部では表面そのものでよい(仕様2-5)が、**輪郭を作っては
    # いけない**。高さごとに「capより毛束の方が外にあるか」で見る。
    # 面の包含(silhouette_inside)で見ると後頭部が常に外れて判定に
    # ならなかった(実測: 側面33.6%・上面26.1%)
    # **capが「見えている面」になっていないかも測る。** 輪郭を作って
    # いなくても、毛束の隙間からcapが広く見えていれば、そこは
    # 「毛束の集まり」ではなく**つるつるの球**に見える(実測: 背面図の
    # 髪は毛先の尖りが並ぶのに、モデルの後頭部は球に板を貼った見た目)
    for ang in (135.0, 180.0):
        a = math.radians(ang)
        d = Vector((math.sin(a), math.cos(a), 0.0))
        rate, hits = C.visible_fraction([cap], clumps, d, cell=0.003)
        if hits < 100:
            continue
        print(f"  [hair] {ang:.0f}° capが露出している割合 {rate:.0%}")
        assert rate <= CAP_EXPOSED_MAX, \
            f"{ang:.0f}°でHair Capが露出しすぎ({rate:.0%})。"\
            f"後頭部が毛束ではなく球に見える"
    over_x = C.wider_than([cap], clumps, axis=0, min_width=0.045)
    over_y = C.wider_than([cap], clumps, axis=1, min_width=0.045)
    print(f"  [hair] capが輪郭を作る高さ 正面{over_x:.0%} 側面{over_y:.0%}")
    # 残る2段(z0.940/0.948)は**頭そのものが設定画より6mm大きい**ため
    # (顔一致QAの「髪の最大幅の高さz」参照。plan/models/archive/garudo-face-qa.md
    # の残差詰めで頭頂を絞ると消える)。髪側の問題ではないので許容する
    # 残る2段(z0.940/0.948)は**頭そのものが設定画より6mm大きい**ため
    # (顔一致QAの「髪の最大幅の高さz」。plan/models/archive/garudo-face-qa.md の
    # 残差詰めで頭頂を絞れば消える)。髪側の問題ではないので許容する
    # 側面が高いのは正しい(仕様2-5: 後頭部の中央はCap主体)。
    # 見るのは正面。ここが0でないと「輪郭を作るのは毛先」になっていない
    assert over_x < 0.05, f"Hair Capが正面の輪郭を作っている({over_x:.0%})"

    # ================= 耳(独立オブジェクト) =================
    # **耳は頭へ融合しない。** sculpt_merge(voxel 3.8mm)は薄い板を
    # +2〜3mmの尾根へ潰すので、耳の形そのものが残らない。融合を外すと
    # 半厚2mmの板がそのまま出るうえ、材質の境目=ジオメトリの境目に
    # なるので、頭のテクスチャへ耳の色を焼く必要も無くなる。
    # 中ほどは頭へ食い込ませ、前後の縁だけが頭から離れる置き方にする
    # **細い段ほど深く埋める。** 耳の板は一段ごとに1つのxしか持てないが、
    # 頭は前後に丸いので、前後へ細くなる段(上端と耳たぶ)は同じxだと
    # 頭の表面を突き抜けて**継ぎ目の線**になる(実測: 耳の下から線が
    # 1本伸びた)。前後に広い段=張り出す段、細い段=付け根、と考える
    ears = [C.section_loft(f"g_ear{s:+.0f}", _ear_sections(s))
            for s in (1.0, -1.0)]

    # **耳は横髪の位置決めガイド。** 耳単体を豪華にするより、正面・側面・
    # 3/4での見え方(可視率)が設定画の重なりに合っているかを見る
    # (plan/models/garudo-ear-as-anchor.md)。耳は独立オブジェクトなので
    # そのまま測れる
    ear_hi = C.bounds(ears)[1]
    hair_hi = max(abs(C.bounds(clumps)[0].x), C.bounds(clumps)[1].x)
    # 上1/3だけの板は測るためだけに作ってすぐ捨てる
    top = C.loft("ear_top_probe", [(z, rx, ry, -(_head_at(z)[0] - 0.0005), cy)
                                   for z, rx, ry, cy in EAR_RINGS if z >= 0.8450])
    seen, seen_top = {}, {}
    for ang in (0.0, 45.0, 90.0):
        a = math.radians(ang)
        d = Vector((math.sin(a), math.cos(a), 0.0))
        seen[ang] = C.visible_fraction(ears, clumps + [cap], d, cell=0.0015)[0]
        seen_top[ang] = C.visible_fraction([top], clumps + [cap], d, cell=0.0015)[0]
        print(f"  [ear] {ang:.0f}° 耳が見える割合 {seen[ang]:.0%}"
              f"(上1/3は {seen_top[ang]:.0%})")
    bpy.data.objects.remove(top, do_unlink=True)
    # 帯は設定画から決める。**正面では耳はかなり見えている** ―― 肌の外端が
    # z852で54.5mm・z848で77.0mmと一段で飛ぶので、隠れるのは上端だけ。
    # 側面では逆にこめかみの毛束が上端と外側を覆う
    assert 0.40 <= seen[0.0] <= 0.90, f"正面の耳の見え方が不自然({seen[0.0]:.0%})"
    # **外部評価の受け入れ条件そのまま**(側面で耳の60〜80%が読める)。
    # 0.50〜0.90に緩めていたせいで、実際には55%しか見えず「耳」ではなく
    # 「縦の切れ込み」に見える状態を通していた。見た目を目で判断して
    # 直そうとする前に、まず基準を評価の言葉どおりに締める
    assert 0.60 <= seen[90.0] <= 0.80, f"側面で耳が読めない({seen[90.0]:.0%})"
    # 3/4は正面と側面の間に入るはず(角度に対して単調)
    assert seen[90.0] - 0.05 <= seen[45.0] <= seen[0.0] + 0.05, \
        f"3/4の耳の見え方が正面・側面の間に無い({seen[45.0]:.0%})"
    # **耳の上1/3は横髪に隠す。** 耳全体を見せるより設定画の
    # 「髪の隙間から見える耳」に合う
    assert seen_top[45.0] <= 0.35, \
        f"3/4でこめかみの毛束が耳の上を覆っていない({seen_top[45.0]:.0%})"
    # 耳の外端が髪の最大シルエットを超えると、頭部の横幅が妙に広く見える
    assert abs(ear_hi.x) <= hair_hi + 1e-4, \
        f"耳の外端({abs(ear_hi.x)*1000:.1f}mm)が髪({hair_hi*1000:.1f}mm)より外にある"
    # **耳の内側の影が肌と分離して見えること。** 同じベタ色だと
    # 「肌が露出している」に見え、1段暗い色が入ると「構造物がある」と読める
    # 頬は頭のテクスチャ、耳穴は**耳のテクスチャ**から引く(耳を別材質へ
    # 分けたので、同じ関数からは取れない)
    cheek = _body_color(Vector((0.055, -0.020, 0.836)), Vector((1, 0, 0)), 0)
    canal = _ear_color(Vector((0.070, 0.0065, 0.8305)), Vector((1, 0, 0)))
    gap = max(cheek) - max(canal)
    print(f"  [ear] 頬と耳穴の明度差 {gap:.2f}")
    assert gap >= 0.25, f"耳の内側が肌と分離していない(明度差{gap:.2f})"

    ear = C.join(ears, "garudo_ear")
    # **耳の法線も頭の球へ寄せる**(規約4)。本体には掛けてあるので、耳
    # だけ素のスムーズシェーディングだと、下half分が鋭いハイライトの
    # 三角形に光って「ヒレ」に見えた(実測: 分離した1回目)。耳の凹凸は
    # 塗りで描いているので、法線は頭と揃えてよい
    C.spherize_normals(ear, tuple(FACE_C), radius=0.16, strength=0.85)
    C.smart_uv(ear)
    ear_img = C.bake_albedo(ear, _ear_color, size=128, name="garudo_ear_tex")
    C.assign_material(ear, C.make_textured_material("garudo_ear", ear_img,
                                                    roughness=0.8))

    hair = C.join([cap] + clumps, "garudo_hair")
    # 髪も手描き: 上を明るく・房の流れの筋(3D位置から描くのでSmart UVの
    # 島割れは問題にならない)。法線は頭の球へ寄せ、板の重なりの
    # デコボコ陰影を抑える(規約4)
    C.smart_uv(hair)
    hair_img = C.bake_albedo(hair, _hair_color, size=256, name="garudo_hair_tex")
    C.assign_material(hair, C.make_textured_material("garudo_hair", hair_img,
                                                     roughness=0.8))
    # **髪全体を1つの球へ寄せる法線補正はしない。** 顔には有効だが、髪に
    # 掛けるとせっかく毛束を作っても一枚の丸いヘルメットのように光る。
    # 法線は毛束ごとに整えてある(_hair_major_from の中で、その毛束の
    # 中心線を軸とする円柱へ寄せる)

    # ================= ベルト+バックル+肩ひも(剛体) =================
    add(C.loft("garudo_belt", [
        (0.545, 0.088, 0.058, 0.0, 0.0),
        (0.568, 0.088, 0.058, 0.0, 0.0),
    ]), leather_mat, pin_bone="hip-chest")
    add(C.box("garudo_buckle", (0, -0.0585, 0.5565), (0.030, 0.010, 0.024)),
        hoop_mat, pin_bone="hip-chest")
    # 肩ひも。融合ボディはボクセルぶん(≈5mm)膨らむので、胸の前は
    # y≈-0.070まで出して表面に乗せる
    for s in (-1.0, 1.0):
        strap = C.curve_tube(f"garudo_strap{s}",
                             [(s * 0.045, 0.098, 0.68), (s * 0.050, 0.032, 0.760),
                              (s * 0.052, -0.034, 0.757), (s * 0.051, -0.0700, 0.662),
                              (s * 0.049, -0.0640, 0.575)],
                             [0.0095, 0.0105, 0.0105, 0.010, 0.0095], resolution=6)
        add(strap, leather_mat, pin_bone="hip-chest")
        clasp = C.box(f"garudo_clasp{s}", (0.051 * s, -0.0705, 0.660),
                      (0.016, 0.007, 0.012))
        add(clasp, hoop_mat, pin_bone="hip-chest")

    # ============ エプロン(前=樽板、側面〜背面=灰色の布) ============
    # 設定画の側面図で判明した構造: **木の板は前面だけ**で、その後ろに
    # 灰色の布が腰から膝下まで360°垂れている(側面の奥行きは布が作る)。
    # 木を全周に回すと側面の奥行きが足りず(実測-64px)、背面も別物になる
    # 灰色の布は**木の板より下まで垂れる**。設定画では板のエプロンが
    # z0.235で終わったあとも、布が幅280mmでz0.20あたりまで続く
    # (実測: z0.231で設定画278mm・旧モデル208mm)
    cloth_rings = [
        (0.186, 0.126, 0.094, 0.0, 0.016),
        (0.235, 0.143, 0.107, 0.0, 0.015),
        (0.390, 0.132, 0.105, 0.0, 0.012),
        (0.530, 0.104, 0.082, 0.0, 0.008),
    ]
    skirt = C.loft("garudo_skirt", cloth_rings, segments=20, cap_top=False,
                   cap_bottom=False)
    add(skirt, skirt_mat, pin_bone="hip-chest")

    apron_rings = [
        (0.235, 0.172, 0.122, 0.0, 0.008),
        (0.390, 0.148, 0.110, 0.0, 0.006),
        (0.530, 0.110, 0.086, 0.0, 0.002),
    ]
    # 木の板は正面140°(200°〜340°)だけに並べる
    n_staves = 9
    stave_objs = []
    for i in range(n_staves):
        a0 = math.radians(200) + math.radians(140) * (i / n_staves)
        a1 = math.radians(200) + math.radians(140) * ((i + 1) / n_staves)
        gap = (a1 - a0) * 0.07
        mesh = bpy.data.meshes.new(f"garudo_stave{i}")
        obj = bpy.data.objects.new(f"garudo_stave{i}", mesh)
        bpy.context.collection.objects.link(obj)
        bm = bmesh.new()
        ring_verts = []
        for z, rx, ry, cx, cy in apron_rings:
            ring_verts.append([bm.verts.new((cx + rx * math.cos(a),
                                             cy + ry * math.sin(a), z))
                               for a in (a0 + gap, a1 - gap)])
        for lower, upper in zip(ring_verts, ring_verts[1:]):
            bm.faces.new((lower[0], lower[1], upper[1], upper[0]))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        stave_objs.append(obj)
    apron = C.join(stave_objs, "garudo_apron")
    C.smart_uv(apron)
    apron_img = C.bake_albedo(apron, _apron_color, size=256, name="garudo_apron_tex")
    C.assign_material(apron, C.make_textured_material("garudo_apron", apron_img,
                                                      roughness=0.85))
    C.mark_for_pin(apron)
    pinned.append((apron.name, "hip-chest"))
    parts_list.append(apron)
    # たが(鉄輪)3段。板より少し外へ、正面だけ。
    # **板の断面をその高さで引く**。以前は3段とも板の一番下のリング
    # (rx0.172)を使っていたので、上の段ほどたがが板から浮き、
    # z0.265では10mmはみ出していた(実測: 高さ0.270で+20mm)
    def _apron_ring(z):
        for (z0, rx0, ry0, _cx0, cy0), (z1, rx1, ry1, _cx1, cy1) in zip(
                apron_rings, apron_rings[1:]):
            if z0 <= z <= z1:
                u = (z - z0) / (z1 - z0)
                return (rx0 + (rx1 - rx0) * u, ry0 + (ry1 - ry0) * u,
                        cy0 + (cy1 - cy0) * u)
        return apron_rings[-1][1], apron_rings[-1][2], apron_rings[-1][4]

    for z in APRON_HOOP_Z:
        rx, ry, cy = _apron_ring(z)
        rx += 0.003
        ry += 0.003
        band = _arc_loft(f"garudo_apron_hoop{z}", [
            (z - 0.009, rx, ry, 0.0, cy),
            (z + 0.009, rx, ry, 0.0, cy),
        ], open_half_deg=108.0, segments=16)
        add(band, hoop_mat, pin_bone="hip-chest")

    # ================= 腰布(赤)。左腰でベルトから覗く =================
    knot = C.uv_sphere("garudo_knot", (0.086, -0.012, 0.535), 0.017,
                       scale=(1.0, 0.8, 0.75))
    add(knot, cloth_mat, pin_bone="hip-chest")
    tail = C.box("garudo_cloth_tail", (0.090, -0.008, 0.487), (0.026, 0.013, 0.085),
                 bevel=0.005)
    tail.rotation_euler = (math.radians(4), math.radians(-10), math.radians(6))
    add(tail, cloth_mat, pin_bone="hip-chest")

    # ================= 背負い樽(軸は縦) =================
    # **以前は軸を前後に寝かせていた(誤り)。** 「側面図でたがが縦に
    # 走る・背面図は円い鏡板」と読んでいたが、拡大して見直すと側面図も
    # 背面図も「板が縦・たがが横・中央がふくらむ」縦置きの樽で、背面に
    # あるのは鏡板ではなく**栓(飲み口)**だった。
    # 断面は楕円(幅220mm×奥行き120mm)。背中へ密着させるため前面のyを
    # 固定し、奥行きに合わせて中心を後ろへずらす
    barrel = C.loft("garudo_barrel",
                    [(z, rx, ry, 0.0, BARREL_FRONT_Y + ry)
                     for z, rx, ry in BARREL_RINGS],
                    segments=BARREL_SEGMENTS, smooth=False)
    # 栓(背面の中央)。樽の背面へ水平に突き出す
    prx, pry, pcy = _barrel_ring(BARREL_PLUG_Z)
    plug = C.cylinder("garudo_bplug", (0.0, pcy + pry + 0.006, BARREL_PLUG_Z),
                      0.015, 0.020, segments=10, axis="Y")
    barrel = C.join([barrel, plug], "garudo_barrel")
    C.smart_uv(barrel)
    barrel_img = C.bake_albedo(barrel, _barrel_color, size=256, name="garudo_barrel_tex")
    C.assign_material(barrel, C.make_textured_material("garudo_barrel", barrel_img,
                                                       roughness=0.85))
    C.mark_for_pin(barrel)
    pinned.append((barrel.name, "hip-chest"))
    parts_list.append(barrel)
    # たが4本。軸が縦なので**横に走る**(設定画の背面図どおり)
    for i, hz in enumerate(BARREL_HOOP_Z):
        rings = []
        for dz in (-0.010, 0.010):
            rx, ry, cy = _barrel_ring(hz + dz)
            rings.append((hz + dz, rx + 0.004, ry + 0.004, 0.0, cy))
        add(C.loft(f"garudo_bhoop{i}", rings, segments=BARREL_SEGMENTS,
                   smooth=False), hoop_mat, pin_bone="hip-chest")

    # ================= 手袋(素手の上から装着) =================
    # 設定画の手袋は指の分かれた革手袋。**融合ボディに含めない**のが要点で、
    # ボクセル(3.8mm)で融合すると指の隙間が埋まってヘラになる。
    # 素手と同じ骨格から革の厚みぶん太らせて作り、手のボーンへ剛体で
    # 追従させる。前腕との継ぎ目は折り返しが隠す
    for s in (1.0, -1.0):
        bone = C.bone_name("elbow.L" if s > 0 else "elbow.R",
                           "hand.L" if s > 0 else "hand.R")
        # **素手も融合ボディに入れない。** ボクセル(3.8mm)で融合すると
        # 指の隙間が埋まってヘラになるうえ、融合で表面が数mm膨らんで
        # 手袋を突き抜ける(実測: 指だけ素肌色で出た)
        hand_parts = _hand_parts(s, 0.0, "garudo_hand")
        glove_parts = _hand_parts(s, LEATHER_T, "garudo_glove") + [_glove_cuff(s)]
        # **装着できているかを機械で確かめる。** 手袋の色で塗られるので、
        # 素手が手袋を突き抜けていても見た目では気付けない
        out = C.encloses(hand_parts, glove_parts, margin=0.0004)
        if out >= 0.005:
            for o in hand_parts:
                bad = C.encloses([o], glove_parts, margin=0.0004)
                print(f"    [glove] {o.name}: はみ出し {bad:.1%}")
        assert out < 0.005, f"素手が手袋からはみ出している({out:.1%})"
        hand = C.join(hand_parts, f"garudo_hand{s:+.0f}")
        C.smart_uv(hand)
        hand_img = C.bake_albedo(hand, _hand_color, size=96,
                                 name=f"garudo_hand_tex{s:+.0f}")
        C.assign_material(hand, C.make_textured_material(
            f"garudo_hand{s:+.0f}", hand_img, roughness=0.62))
        C.mark_for_pin(hand)
        pinned.append((hand.name, bone))
        parts_list.append(hand)

        glove = C.join(glove_parts, f"garudo_glove{s:+.0f}")
        C.smart_uv(glove)
        glove_img = C.bake_albedo(glove, _glove_color, size=128,
                                  name=f"garudo_glove_tex{s:+.0f}")
        C.assign_material(glove, C.make_textured_material(
            f"garudo_glove{s:+.0f}", glove_img, roughness=0.75))
        C.mark_for_pin(glove)
        pinned.append((glove.name, bone))
        parts_list.append(glove)

    # ================= ブーツ(編み上げ・革の実体形状) =================
    # 箱+円柱では「レゴの足」になる(実測の指摘)。かかと→土踏まず→
    # つま先で幅と高さが変わるロフトを寝かせて足の実体を作り、その下に
    # 靴底の板、後ろにヒール、上に履き口の折り返しを重ねる
    for s, bone in ((1.0, "knee.L-foot.L"), (-1.0, "knee.R-foot.R")):
        parts = []
        # 足(かかと→つま先)。ロフトは+Z方向に積むので、寝かせて
        # 「長さ=前後・ロフトのry=高さ」にする。**回転と位置はjoinの前に
        # 焼き込む**(C.joinは先頭オブジェクトの変換を引き継ぐため、
        # あとから回転を上書きすると他の部品が裏返る実測)
        # 設定画は編み上げの作業靴で、**一番広いのは丸く張り出した
        # つま先**(足首ではない)。正面95%の高さで設定画209px・
        # モデル178pxと43mm足りなかったのは、つま先が細かったため
        # 足の幅。設定画の正面図で接地の高さの靴の幅は99mm(半幅50mm)。
        # 以前は半幅72mmあり、28°の開きと合わせて156mmになっていた
        shoe = C.loft(f"garudo_shoe{s}", [
            (0.000, 0.032, 0.026, 0.0, 0.028),
            (0.022, 0.040, 0.034, 0.0, 0.032),
            (0.060, 0.043, 0.036, 0.0, 0.030),
            (0.100, 0.044, 0.032, 0.0, 0.026),
            (0.132, 0.043, 0.026, 0.0, 0.021),
            (0.156, 0.035, 0.019, 0.0, 0.017),
            (0.166, 0.021, 0.012, 0.0, 0.015),
        ], segments=14)
        shoe.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        shoe.location = (0.0, 0.045, 0.0)
        C.activate(shoe)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(shoe)
        # 靴底(前へ少しはみ出す板)+ヒール
        # 靴底は**甲より小さく**する。箱の角が回転して靴の丸みより外へ
        # はみ出し、接地面に平たいツバが出ていた(重ねると足元だけ
        # 一直線に青が伸びる)
        parts.append(C.box(f"garudo_sole{s}", (0.0, -0.012, 0.009),
                           (0.072, 0.186, 0.018), bevel=0.006))
        parts.append(C.box(f"garudo_heel{s}", (0.0, 0.034, 0.021),
                           (0.062, 0.054, 0.026), bevel=0.005))
        # すね(履き口へ細くなる)+折り返し
        # すねは円錐(直線)ではなくロフト。足首側だけ張り出す形にしないと、
        # ブーツの高さ(正面95%)を合わせるとすね(88%)が太くなる
        # すねは足より**内側**に立つ。設定画の正面図で、足の中心はx106mm
        # なのにすねの中心は82mm(実測)。ブーツは1つの剛体なので、
        # 内側へ寄せるぶんをローカル座標のcxで持たせる
        parts.append(C.loft(f"garudo_shaft{s}", [
            (0.046, 0.040, 0.048, -0.006 * s, 0.004),
            (0.068, 0.033, 0.042, -0.012 * s, 0.004),
            (0.110, 0.028, 0.038, -0.018 * s, 0.004),
            (0.159, 0.027, 0.036, -0.020 * s, 0.004),
        ], segments=14))
        parts.append(C.cylinder(f"garudo_cuff{s}", (-0.020 * s, 0.004, 0.166),
                                0.036, 0.026, segments=14))
        boot = C.join(parts, f"garudo_boot{s}")
        # つま先を外へ開く(設定画の立ち方)
        boot.rotation_euler = (0.0, 0.0, math.radians(14.0 * s))
        boot.location = (s * 0.100, -0.010, 0.0)
        C.smart_uv(boot)
        boot_img = C.bake_albedo(boot, _boot_color, size=128,
                                 name=f"garudo_boot_tex{s}")
        C.assign_material(boot, C.make_textured_material(f"garudo_boot{s}", boot_img,
                                                         roughness=0.8))
        C.mark_for_pin(boot)
        pinned.append((boot.name, bone))
        parts_list.append(boot)

    # ================= 結合・リグ =================
    mesh = C.join(parts_list, NAME)
    armature = C.build_armature(NAME, JOINTS, BONES, mesh, root="hip")
    # 腕・脚チェーンのロールをワールドXへ整列(Xキー=前後スイングの保証。
    # 既定計算では不定で、内側へ巻き込む貫通不具合の原因になった)
    C.activate(armature)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in armature.data.edit_bones:
        if any(part in eb.name for part in
               ("shoulder", "elbow", "hand", "thigh", "knee", "foot")):
            y_axis = (eb.tail - eb.head).normalized()
            x_target = (Vector((1.0, 0.0, 0.0)) - y_axis * y_axis.x).normalized()
            eb.align_roll(x_target.cross(y_axis))
    bpy.ops.object.mode_set(mode="OBJECT")
    C.parent_to_bone(hair, armature, "neck-head")
    C.parent_to_bone(ear, armature, "neck-head")
    for group_name, bone in pinned:
        C.pin_weight_to_bone(mesh, group_name, bone)
    return [mesh, armature, hair, ear], armature


def animations() -> list[tuple[str, list]]:
    """
    待機・歩行・攻撃・被弾・消滅の5クリップ。角度は度で指定する。

    plan/game/archive/animation-quality-guidelines.mdの規約に沿って、
    タメ・ツメ(LINEAR補間による鋭い動き)・頭の遅れ追従(二次揺れ)を
    足してある。骨名は従来のまま(角度は骨の回転なので比率に依存しない)。
    """
    hipc = "hip-chest"
    spine = "chest-neck"
    neck = "neck-head"
    # 腕のスイングは上腕ボーン(支点=肩関節)、肘の曲げは前腕ボーン
    # (支点=肘)。chest-shoulderは鎖骨方向のほぼ水平なボーンで、前後
    # スイングの軸になれない(ロール整列とあわせて貫通不具合の修正)。
    # ロール整列後の軸系: X=前後(負が前)・Z=内外(Lは負が外、Rは正が外)
    armL, armR = "shoulder.L-elbow.L", "shoulder.R-elbow.R"
    foreL, foreR = "elbow.L-hand.L", "elbow.R-hand.R"
    # 脚のスイングは大腿ボーン(支点=股関節)、膝の曲げはすねボーン
    # (支点=膝)。hip-thighは骨盤の斜めコネクタで前後スイングの軸に
    # なれない(腕と同じ構造の不具合。ロール整列とあわせて修正)。
    # ロール整列後の軸系: X=前後(負が前・正が後ろ)
    legL, legR = "thigh.L-knee.L", "thigh.R-knee.R"
    shinL, shinR = "knee.L-foot.L", "knee.R-foot.R"

    head_delay = C.secondary_delay_frames(
        (Vector(JOINTS_HALF["head"]) - Vector(JOINTS_HALF["neck"])).length
        / (Vector(JOINTS_HALF["chest"]) - Vector(JOINTS_HALF["hip"])).length
    )
    idle = [
        (1, {hipc: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4), neck: (0, 0, 0)}),
        (18, {hipc: (2.5, 0, 0), armL: (-5, 0, -7), armR: (-5, 0, 7)}),
        (18 + head_delay, {neck: (-2.5, 0, 0)}, {"partial": True}),
        (36, {hipc: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4)}),
        (36 + head_delay, {neck: (0, 0, 0)}, {"partial": True}),
    ]

    # 歩行: 接地時(f1/f15)は前脚(-24)がほぼ伸び(すね4)、後脚(+24)が
    # 蹴り出しでやや曲がる(すね12)。通過時(f8/f22)は前へ運ぶ脚の膝を
    # 大きく畳み(すね40)、軸脚は伸びたまま。腰は通過時に沈む(bob)
    walk = [
        (1, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (12, 0, 0), shinR: (4, 0, 0),
             armL: (-15, 0, -4), armR: (15, 0, 4), hipc: (3, 0, 0)}),
        (8, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (40, 0, 0), shinR: (5, 0, 0),
             armL: (0, 0, -4), armR: (0, 0, 4), hipc: {"rot": (6, 0, 0), "loc": (0, -0.012, 0)}}),
        (15, {legL: (-24, 0, 0), legR: (24, 0, 0), shinL: (4, 0, 0), shinR: (12, 0, 0),
              armL: (15, 0, -4), armR: (-15, 0, 4), hipc: (3, 0, 0)}),
        (22, {legL: (0, 0, 0), legR: (0, 0, 0), shinL: (5, 0, 0), shinR: (40, 0, 0),
              armL: (0, 0, -4), armR: (0, 0, 4), hipc: {"rot": (6, 0, 0), "loc": (0, -0.012, 0)}}),
        (29, {legL: (24, 0, 0), legR: (-24, 0, 0), shinL: (12, 0, 0), shinR: (4, 0, 0),
              armL: (-15, 0, -4), armR: (15, 0, 4), hipc: (3, 0, 0)}),
    ]

    attack = [
        (1, {hipc: (0, 0, 0), armR: (0, 0, 4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
        (7, {hipc: (-12, 0, -10), armR: (-112, 0, 22), foreR: (-38, 0, 0), neck: (8, 0, 0)},
         {"interp": "LINEAR"}),
        (10, {hipc: (18, 0, 12), armR: (64, 0, -8), foreR: (14, 0, 0), neck: (-12, 0, 0)}),
        (12, {hipc: (14, 0, 9), armR: (52, 0, -6), foreR: (8, 0, 0), neck: (-8, 0, 0)}),
        (22, {hipc: (0, 0, 0), armR: (0, 0, 4), foreR: (0, 0, 0), neck: (0, 0, 0)}),
    ]

    hit = [
        (1, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4)},
         {"interp": "LINEAR"}),
        (3, {hipc: (-20, 0, 0), neck: (-14, 0, 0), armL: (-18, 0, -22), armR: (-18, 0, 22)}),
        (14, {hipc: (0, 0, 0), neck: (0, 0, 0), armL: (0, 0, -4), armR: (0, 0, 4)}),
    ]

    die = [
        (1, {hipc: (0, 0, 0), neck: (0, 0, 0), legL: (0, 0, 0), legR: (0, 0, 0)},
         {"interp": "LINEAR"}),
        (8, {hipc: (-28, 0, 0), neck: (-18, 0, 0), legL: (10, 0, 0), legR: (8, 0, 0),
             shinL: (14, 0, 0), shinR: (10, 0, 0),
             armL: (-40, 0, -30), armR: (-40, 0, 30)}),
        (22, {hipc: (-82, 0, 0), neck: (-30, 0, 0), legL: (26, 0, 0), legR: (20, 0, 0),
              shinL: (34, 0, 0), shinR: (28, 0, 0),
              armL: (-70, 0, -46), armR: (-70, 0, 46)}),
        (26, {hipc: (-76, 0, 0), neck: (-26, 0, 0), legL: (22, 0, 0), legR: (17, 0, 0),
              shinL: (30, 0, 0), shinR: (24, 0, 0),
              armL: (-64, 0, -42), armR: (-64, 0, 42)}),
    ]

    return [("idle", idle), ("walk", walk), ("attack", attack), ("hit", hit), ("die", die)]


def make():
    objs, armature = build()
    for clip_name, keyframes in animations():
        C.add_action(armature, clip_name, keyframes)
    return objs


if __name__ == "__main__":
    C.reset_scene()
    objs = make()
    print("三角形数:", C.tri_count(objs))
    C.render_preview(NAME, objs)
    C.export_glb(NAME, objs, flat=True)
    print("done")
