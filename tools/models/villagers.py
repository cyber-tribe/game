"""
村人NPC。ネンネ村に立っている、戦わない人たち。

`plan/game/village-interiors.md`(建物の中を作り込み、村人を3Dで立たせる)
のために、村人1人につき1体のモデルを作る。モンスターと違って戦闘には
出ないので、クリップは待機と会話の2本だけ(`CLIPS`)。

村人はいずれも「ガルドと同じ人型」で、違うのは体つき・服・小道具だけ
なので、このモジュールは前半を**共通基盤**、後半を**村人1人ずつのブロック**
という構成にしてある。

    ┌ 共通基盤 ─────────────────────────────────┐
    │ Proportions   体つきの指定(背丈・幅・太さ・頭身・腰の曲がり)  │
    │ humanoid()    ガルドの関節表をその体つきに変形して返す         │
    │ build_base()  変形した関節から素体メッシュを作る               │
    │ garment_classifier()  肌/上衣/下衣/靴/かぶりもの の塗り分け    │
    │ finish()      小物を統合してアーマチュアを組む                 │
    │ idle_clip() / talk_clip()  村人共通の2クリップのひな形         │
    └───────────────────────────────────────────┘

## 村人をもう1人足すには(2手)

1. 「村人ごと」の区切り以降に、その村人だけのブロックを1つ足す。
   既存のブロック(モグラ婆)をまるごと真似ればよい。
   `build_<名前>()` と `<名前>_animations()` の2関数を、他の村人の
   コードに一切触れずに書く。
2. 末尾の `VILLAGERS` に1行足す。

`tools/build_models.py` と `src/modelList.ts` の `VILLAGER_MODELS` にも
それぞれ1行ずつ足りているか確認する(前者はこのモジュール全体を
まとめて拾うので追記不要。後者は村人名の1行を足す)。

ブロックを独立させてあるのは、村人8人を別々のPRで並行して足しても
衝突がこの1行だけで済むようにするため。

## 村人を足すときに踏みやすい落とし穴

- **クリップは `idle` と `talk` の2本ちょうど。** `make()` が本数と名前を
  検査して、違っていればビルドを失敗させる。三角形数の目安は既存モデルと
  同じ1,800〜7,500。
- **同じ色の部品は1つのマテリアルを使い回す。** glTF はマテリアル1つに
  つきプリミティブ(=描画呼び出し)を1つ作る。`palette()` で色を一式
  作ってから配る。
- **`C.box()` / `C.uv_sphere()` は頂点を動かすだけで、オブジェクトの原点は
  ワールド原点に残る。** 置いてから `rotation_euler` を与えると原点まわりに
  回って遠くへ飛ぶ。原点で作る → 回す → `location` で置く、の順にする。
- **トゥーンシェーディングとAOベイクは共通基盤が面倒を見る**
  (`plan/game/archive/toon-shading-pipeline.md` は読み込み側、
  `plan/game/archive/ao-vertex-color-bake.md` は `C.export_glb()` 側)。
  村人側では何もしない。
- **動きの緩急は規約に従う**(`plan/game/archive/
  animation-quality-guidelines.md`)。`idle_clip()` / `talk_clip()` に
  二次揺れ(頭の遅れ追従)とタメ・ツメを織り込んであるので、ひな形を
  使うかぎり自動的に満たせる。

Blender では -Y が正面。glTF に書き出すと +Z 正面になる。
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import common as C
import garudo
from mathutils import Vector

# =========================================================================== 共通基盤

# 村人が持つクリップ。戦わないので待機と会話の2本だけに揃える
# (src/modelList.ts の VILLAGER_CLIPS と対になっている)
CLIPS = ("idle", "talk")

# ボーン名。`common.build_armature()` が「親関節-子関節」で名付けるので、
# ガルドの関節表を流用している村人は全員この名前を共有する
SPINE = "hip-chest"          # 腰から胸(体幹の主役)
CHEST = "chest-neck"         # 胸から首
NECK = "neck-head"           # 首から頭(うなずき)
SKULL = "head-crown"
ARM_L, ARM_R = "chest-shoulder.L", "chest-shoulder.R"          # 上腕
FORE_L, FORE_R = "shoulder.L-elbow.L", "shoulder.R-elbow.R"    # 前腕
HAND_L, HAND_R = "elbow.L-hand.L", "elbow.R-hand.R"            # 手先
LEG_L, LEG_R = "hip-thigh.L", "hip-thigh.R"
SHIN_L, SHIN_R = "thigh.L-knee.L", "thigh.R-knee.R"
FOOT_L, FOOT_R = "knee.L-foot.L", "knee.R-foot.R"

# 腰から上。Proportions.stoop はこの一群を腰の位置を軸に前へ倒す。
# 腕も胸にぶら下がっているので一緒に倒れ、肩だけが前に出た猫背になる
UPPER_BODY = ("chest", "neck", "head", "crown", "shoulder.L", "elbow.L", "hand.L")

# 塗り分けのマテリアル番号。garudo.classify_body と同じ並びに揃えてある
SKIN, TOP, BOTTOM, SHOE, CAP = 0, 1, 2, 3, 4


@dataclass(frozen=True)
class Proportions:
    """
    ガルドの関節表(`garudo.JOINTS_HALF` / `RADII_HALF`)をどう変形して
    その村人の体つきにするか。すべて倍率で、既定値(1.0)がガルドそのもの。

    height  背丈。ガルドの全高およそ0.95に掛かる
    width   左右方向。肩幅・脚の間隔・関節の太さに掛かる
    girth   関節の太さだけをさらに増減する(width とは独立)
    torso   胴(hip・chest)の太さだけをさらに増減する。着ぶくれ・恰幅
    head    頭の大きさ。首から上を首の位置を軸に伸縮し、太さにも掛かる
    stoop   腰の曲がり(度)。正で前かがみ、負で反り気味
    """

    height: float = 1.0
    width: float = 1.0
    girth: float = 1.0
    torso: float = 1.0
    head: float = 1.0
    stoop: float = 0.0


def humanoid(prop: Proportions) -> tuple[dict[str, Vector], dict[str, float], list]:
    """
    ガルドの人型の関節表を Proportions のとおりに変形して返す。

    関節名・骨のつなぎ方はガルドのまま変えない(村人はどれもこの
    アーマチュアを共有する。`plan/models/model-*.md`の「関節名・ボーン構成は
    流用する」)。変わるのは座標と太さだけ。
    """
    hip_z = garudo.JOINTS_HALF["hip"][2] * prop.height
    neck_z = garudo.JOINTS_HALF["neck"][2] * prop.height
    angle = math.radians(prop.stoop)

    joints_half: dict[str, tuple[float, float, float]] = {}
    for name, (x, y, z) in garudo.JOINTS_HALF.items():
        x, y, z = x * prop.width, y * prop.width, z * prop.height
        if name in ("head", "crown"):
            # 首を軸に頭だけ伸縮する。頭身(頭の相対的な大きさ)の調整
            z = neck_z + (z - neck_z) * prop.head
        if name in UPPER_BODY and angle != 0.0:
            # 腰(hip)を軸に上体を前へ回す。-Y が正面なので、前傾で y は減る
            dz = z - hip_z
            y, z = y - math.sin(angle) * dz, hip_z + math.cos(angle) * dz
        joints_half[name] = (x, y, z)

    radii_half: dict[str, float] = {}
    for name, r in garudo.RADII_HALF.items():
        r *= prop.width * prop.girth
        if name in ("hip", "chest"):
            r *= prop.torso
        if name in ("head", "crown"):
            r *= prop.head
        radii_half[name] = r

    return C.mirrored(joints_half), C.mirrored_radii(radii_half), garudo.BONES


def build_base(name: str, prop: Proportions, subsurf: int = 2):
    """素体(一枚の連続メッシュ)を作る。返り値は (メッシュ, 関節, 骨)。"""
    joints, radii, bones = humanoid(prop)
    body = C.build_skinned(name, joints, bones, radii, root="hip", subsurf=subsurf)
    return body, joints, bones


def garment_classifier(joints: dict[str, Vector], *, hem: float | None = None,
                       shoe: float | None = None, collar: float | None = None,
                       cuff: float | None = None, cap: float | None = None,
                       cap_slope: float = 0.0):
    """
    素体を 肌/上衣/下衣/靴/かぶりもの に塗り分ける関数を作って返す。
    `C.assign_materials_by_region()` に渡して使う。

    しきい値を省略すると、その村人の関節位置から素直な値を選ぶ。服の丈を
    変えたいときだけ明示する(裾を長くする村人は hem を下げる、など)。

    hem     ここより下が下衣(ズボン・裾)
    shoe    ここより下が靴
    collar  ここより上が肌(首から上)
    cuff    体の中心からこれ以上離れた低い位置は肌(手先)
    cap     ここより上がかぶりもの(髪・頭巾・鉢巻き)。省略で無し
    cap_slope
            かぶりものの生え際の傾き。正で前(-Y)側のしきい値が上がり、
            後頭部側が下がる = 後ろに長く、額を出した髪型になる
    """
    hem_z = joints["hip"].z * 0.86 if hem is None else hem
    shoe_z = joints["foot.L"].z + 0.055 * joints["crown"].z if shoe is None else shoe
    collar_z = joints["neck"].z - 0.015 if collar is None else collar
    cuff_x = abs(joints["elbow.L"].x) * 1.05 if cuff is None else cuff
    chest_z = joints["chest"].z
    head_y = joints["head"].y

    def classify(center) -> int:
        z, x = center.z, abs(center.x)
        if cap is not None and z > cap - cap_slope * (center.y - head_y):
            return CAP
        if z < shoe_z:
            return SHOE
        if z < hem_z:
            return BOTTOM
        if x > cuff_x and z < chest_z:
            return SKIN  # 袖から出た手先
        if z > collar_z:
            return SKIN  # 首から上
        return TOP

    return classify


def finish(name: str, body, extras: list, joints: dict[str, Vector], bones):
    """小物を素体に統合してアーマチュアを組む。返り値は (書き出す物, アーマチュア)。"""
    mesh = C.join([body] + list(extras), name)
    armature = C.build_armature(name, joints, bones, mesh, root="hip")
    return [mesh, armature], armature


# ---------------------------------------------------------------- 顔と小物の部品
#
# どの部品も、色ではなく**出来合いのマテリアル**を受け取る。glTF では
# マテリアル1つにつきプリミティブ(=描画呼び出し)が1つ増えるので、
# 同じ色の部品は1つのマテリアルを使い回す(`palette()` 参照)。


def palette(prefix: str, colors: dict[str, tuple], roughness: float = 0.85) -> dict:
    """
    その村人の色を、名前つきのマテリアル一式にしてまとめて作る。

        mats = palette("mogurabaa", {"skin": (...), "cloak": (...)}, ...)
        C.assign_material(nose, mats["skin"])

    値は色のタプル、または (色, roughness) のタプル。
    """
    out = {}
    for key, value in colors.items():
        color, rough = value if isinstance(value[0], (tuple, list)) else (value, roughness)
        out[key] = C.make_material(f"{prefix}_{key}", color, roughness=rough)
    return out


def eye_slit(name: str, center, width: float, material, tilt: float = 0.0) -> object:
    """
    細く閉じ気味の目。丸い眼球ではなく、線1本で「閉じている」と読ませる。
    tilt は度で、正で目尻が下がる(困り顔・好々爺の記号)。
    """
    slit = C.box(name, (0.0, 0.0, 0.0), (width, width * 0.35, width * 0.22),
                 bevel=width * 0.09)
    # 原点で作ってから回して置く。`C.box` は頂点を移動させるだけでオブジェクトの
    # 原点はワールド原点のままなので、先に動かしてから回すと遠くへ飛んでいく
    slit.rotation_euler = (0.0, math.radians(tilt), 0.0)
    slit.location = Vector(center)
    C.assign_material(slit, material)
    return slit


def fluff_ring(name: str, center, radius: float, blob: float, material,
               count: int = 9, squash: float = 0.85) -> list:
    """
    もこもこの襟。小さな球を輪に並べるだけで、毛皮・綿入れの手触りが出る。
    襟・袖口・裾のどこにでも使える。
    """
    c = Vector(center)
    mat = material
    out = []
    for i in range(count):
        a = 2.0 * math.pi * i / count
        ball = C.uv_sphere(
            f"{name}{i}", c + Vector((math.cos(a) * radius, math.sin(a) * radius, 0.0)),
            blob, segments=10, rings=7, scale=(1.0, 1.0, squash),
        )
        C.assign_material(ball, mat)
        out.append(ball)
    return out


def staff(name: str, top, length: float, thickness: float, material,
          knob: float = 1.9, lean: float = 0.0) -> list:
    """握りの位置(top)から下へ伸びる杖。頭に握りのこぶを付ける。"""
    t = Vector(top)
    mat = material
    shaft = C.cylinder(name, t + Vector((0.0, 0.0, -length * 0.5)), thickness, length,
                       segments=10)
    C.assign_material(shaft, mat)
    head = C.uv_sphere(f"{name}_knob", t, thickness * knob, segments=12, rings=8,
                       scale=(1.0, 1.0, 0.8))
    C.assign_material(head, mat)
    parts = [shaft, head]
    if lean != 0.0:
        for part in parts:
            part.rotation_euler = (math.radians(lean), 0.0, 0.0)
    return parts


# ---------------------------------------------------------------- クリップのひな形

def _merge(frames: list, extra: dict[int, dict] | None) -> list:
    """ひな形のキーフレームに、村人ごとの味付け(extra)を重ねる。"""
    if not extra:
        return frames
    out, used = [], set()
    for kf in frames:
        frame, pose = kf[0], dict(kf[1])
        if frame in extra:
            pose.update(extra[frame])
            used.add(frame)
        out.append((frame, pose, *kf[2:]))
    # ひな形に無いフレームは部分キーとして足す(他のボーンには触らない)
    for frame, pose in extra.items():
        if frame not in used:
            out.append((frame, dict(pose), {"partial": True}))
    out.sort(key=lambda kf: kf[0])
    return out


def idle_clip(*, length: int = 36, breath: float = 2.5, arm: float = 4.0,
              head_lag: int = 2, extra: dict[int, dict] | None = None) -> list:
    """
    村人共通の待機のひな形。ゆっくりした呼吸を体幹に置き、頭を head_lag
    フレーム遅らせて追従させる(`plan/game/archive/
    animation-quality-guidelines.md`の二次揺れ。ガルドの idle と同じ作り)。

    breath  呼吸の振れ幅(度)。小さいほど落ち着いて見える
    arm     腕の開き(度)。手に何か持っている側は extra で上書きする
    extra   {フレーム番号: ポーズ} の味付け。ひな形と同じフレーム番号なら
            そのキーに混ぜ、違う番号なら部分キーとして足す
    """
    mid = length // 2
    frames = [
        (1, {SPINE: (0, 0, 0), NECK: (0, 0, 0), ARM_L: (0, 0, arm), ARM_R: (0, 0, -arm)}),
        (mid, {SPINE: (breath, 0, 0),
               ARM_L: (-breath * 1.6, 0, arm + 2.5), ARM_R: (-breath * 1.6, 0, -(arm + 2.5))}),
        (mid + head_lag, {NECK: (-breath, 0, 0)}, {"partial": True}),
        (length, {SPINE: (0, 0, 0), ARM_L: (0, 0, arm), ARM_R: (0, 0, -arm)}),
        (length + head_lag, {NECK: (0, 0, 0)}, {"partial": True}),
    ]
    return _merge(frames, extra)


def talk_clip(*, length: int = 30, nod: float = 13.0, lean: float = 3.5, arm: float = 4.0,
              head_lag: int = 2, extra: dict[int, dict] | None = None) -> list:
    """
    村人共通の会話のひな形。話しかけられて一拍応えるうなずき。

    規約どおりの4段構成にしてある: タメ(わずかに顔を上げる)→
    ツメ(LINEAR で鋭くうなずく)→ 行き過ぎ(あごが行き過ぎて戻る)→
    ゆっくり戻り。頭は体幹より head_lag フレーム遅れて動く。

    nod  うなずきの深さ(度)。NECK の正回転が「あごを引く」向き
    """
    frames = [
        (1, {SPINE: (0, 0, 0), NECK: (0, 0, 0), ARM_L: (0, 0, arm), ARM_R: (0, 0, -arm)}),
        (6, {SPINE: (-lean, 0, 0)}, {"interp": "LINEAR"}),
        (6 + head_lag, {NECK: (-nod * 0.30, 0, 0)}, {"partial": True}),
        (10, {SPINE: (lean, 0, 0)}),
        (10 + head_lag, {NECK: (nod, 0, 0)}, {"partial": True, "interp": "LINEAR"}),
        (14, {SPINE: (lean * 0.35, 0, 0)}),
        (14 + head_lag, {NECK: (nod * 0.55, 0, 0)}, {"partial": True}),
        (length, {SPINE: (0, 0, 0), ARM_L: (0, 0, arm), ARM_R: (0, 0, -arm)}),
        (length + head_lag, {NECK: (0, 0, 0)}, {"partial": True}),
    ]
    return _merge(frames, extra)


# =========================================================================== 村人ごと
#
# ここから下は1人1ブロック。他の村人のブロックには触れずに足し引きできる。


# ---------------------------------------------------------------- モグラ婆

# 小柄で腰の曲がった老婆。全高はガルドの約7割(頭ひとつぶん低い)。
# 目が悪い設定を、丸い眼球ではなく細く閉じた線の目で表す
MOGURABAA = Proportions(height=0.70, width=0.80, girth=1.02, torso=1.30,
                        head=1.05, stoop=25.0)

MOGURABAA_SKIN = (0.79, 0.67, 0.55)
MOGURABAA_CLOAK = (0.46, 0.38, 0.29)      # もこもこした外套。土の色
MOGURABAA_HEM = (0.34, 0.29, 0.24)        # 外套の裾。一段暗い岩の色
MOGURABAA_APRON = (0.63, 0.58, 0.48)      # 倉庫番の前掛け。使い込んだ生成り
MOGURABAA_SHOE = (0.27, 0.23, 0.19)
MOGURABAA_HAIR = (0.78, 0.76, 0.71)       # 白髪
MOGURABAA_FLUFF = (0.53, 0.45, 0.35)      # 襟の毛羽立ち。外套より少し明るく


def build_mogurabaa():
    """
    ガルドの育ての親、樽守りの師匠。倉庫の薄暗がりに馴染む茶〜灰でまとめ、
    背丈・腰の曲がり・細い目・杖の4点で「小柄な老婆」と読ませる。
    """
    name = "mogurabaa"
    body, joints, bones = build_base(name, MOGURABAA)

    crown = joints["crown"]
    head = joints["head"]
    neck = joints["neck"]
    hip = joints["hip"]
    hand_r = joints["hand.R"]

    # 色は一式まとめて作り、同じ色の部品で使い回す(描画呼び出しを増やさない)
    mats = palette("mogurabaa", {
        "skin": (MOGURABAA_SKIN, 0.72),
        "cloak": (MOGURABAA_CLOAK, 0.88),
        "hem": (MOGURABAA_HEM, 0.88),
        "shoe": (MOGURABAA_SHOE, 0.70),
        "hair": (MOGURABAA_HAIR, 0.90),
        "apron": (MOGURABAA_APRON, 0.85),
        "fluff": (MOGURABAA_FLUFF, 0.92),
        "eye": ((0.13, 0.11, 0.11), 0.30),
        "wood": ((0.32, 0.22, 0.14), 0.78),
    })

    # 外套は裾を長く取り、脚をほとんど隠す。頭の上は白髪
    C.assign_materials_by_region(
        body,
        [mats["skin"], mats["cloak"], mats["hem"], mats["shoe"], mats["hair"]],
        garment_classifier(
            joints,
            hem=hip.z * 0.72,
            collar=neck.z - 0.005,
            cap=head.z + 0.062,
            cap_slope=0.55,
        ),
    )

    extras: list = []

    # 顔。前傾しているぶん顔は下を向くので、正面(-Y)側やや下に置く
    face_y = head.y - 0.104
    for side in (-1.0, 1.0):
        extras.append(eye_slit(
            f"mogurabaa_eye{side}", (0.049 * side, face_y - 0.006, head.z + 0.010),
            width=0.058, material=mats["eye"], tilt=11.0 * side,
        ))
        # 太く垂れた白い眉。細い目と合わせて年齢を出す
        brow = C.box(f"mogurabaa_brow{side}", (0.0, 0.0, 0.0),
                     (0.050, 0.019, 0.013), bevel=0.005)
        brow.rotation_euler = (0.0, math.radians(12.0 * side), 0.0)
        brow.location = Vector((0.049 * side, face_y + 0.012, head.z + 0.041))
        C.assign_material(brow, mats["hair"])
        extras.append(brow)

    nose = C.uv_sphere("mogurabaa_nose", (0.0, face_y - 0.014, head.z - 0.026), 0.034,
                       segments=14, rings=10, scale=(0.85, 1.30, 0.80))
    C.assign_material(nose, mats["skin"])
    extras.append(nose)

    # 後ろで結んだ白髪の団子
    bun = C.uv_sphere("mogurabaa_bun", (0.0, head.y + 0.108, crown.z - 0.012), 0.052,
                      segments=14, rings=10, scale=(1.0, 0.9, 0.85))
    C.assign_material(bun, mats["hair"])
    extras.append(bun)

    # もこもこの襟。首まわりを一周させると外套の厚みが一目で分かる
    extras += fluff_ring("mogurabaa_collar", (0.0, neck.y + 0.012, neck.z - 0.012),
                         radius=0.104, blob=0.043, material=mats["fluff"], count=10)

    # 外套の裾。細い脚を覆って、床に向かって広がる釣鐘形にする
    skirt_top, skirt_bottom = hip.z + 0.028, joints["foot.L"].z + 0.012
    skirt = C.cone("mogurabaa_skirt", (0.0, 0.0, (skirt_top + skirt_bottom) * 0.5),
                   radius_bottom=0.152, radius_top=0.118,
                   depth=skirt_top - skirt_bottom, segments=20)
    C.assign_material(skirt, mats["hem"])
    extras.append(skirt)

    # 倉庫番の前掛け。腰から下げた1枚の布。裾に向かって広がる外套に沿わせる
    apron = C.box("mogurabaa_apron", (0.0, -0.122, (skirt_top + skirt_bottom) * 0.5 + 0.006),
                  (0.150, 0.026, skirt_top - skirt_bottom - 0.036), bevel=0.010)
    for vert in apron.data.vertices:
        vert.co.y -= (skirt_top - vert.co.z) * 0.14  # 下ほど前へ張り出す
    C.assign_material(apron, mats["apron"])
    extras.append(apron)
    # 前掛けの紐。腰を一周させる
    belt = C.cylinder("mogurabaa_belt", (0.0, 0.0, skirt_top - 0.006), 0.145, 0.028,
                      segments=20)
    C.assign_material(belt, mats["apron"])
    extras.append(belt)

    # 短い杖。右手の握りから床まで。自動ウェイトで前腕の骨に付くので、
    # 会話で杖を持ち直す動きにそのまま追従する
    extras += staff("mogurabaa_staff", (hand_r.x - 0.012, hand_r.y - 0.034, hand_r.z + 0.052),
                    length=hand_r.z + 0.052, thickness=0.014, material=mats["wood"],
                    knob=2.0)

    return finish(name, body, extras, joints, bones)


def mogurabaa_animations():
    """
    idle: 杖に寄りかかって、ゆっくり息をするだけ。杖を持つ右腕はほぼ止め、
          左腕と体幹だけが小さく動く。頭は2フレーム遅れて追従する。
    talk: うなずきながら杖を握り直す。ひな形のうなずきに、右の前腕を
          持ち上げて戻す動きを重ねている。
    """
    still_right = {ARM_R: (0, 0, -1.5), FORE_R: (-6, 0, 0)}
    return [
        ("idle", idle_clip(length=44, breath=1.6, arm=3.0, head_lag=3, extra={
            1: still_right,
            22: {**still_right, FORE_R: (-7.5, 0, 0)},
            44: still_right,
        })),
        ("talk", talk_clip(length=32, nod=15.0, lean=2.8, arm=3.0, extra={
            1: still_right,
            6: {ARM_R: (0, 0, -3.0), FORE_R: (-13, 0, 0)},   # 杖を持ち上げる
            10: {ARM_R: (0, 0, -1.0), FORE_R: (-3, 0, 0)},   # 突き直す
            14: {ARM_R: (0, 0, -1.8), FORE_R: (-6, 0, 0)},
            32: still_right,
        })),
    ]


# ---------------------------------------------------------------- 樽転がしのゲンド

# 村人で一番大きい。ガルドの1.2倍の背丈(頭ひとつぶん高い)に、
# 肩幅と手足の太さを足して「がっしりした中年の職人」にする。
# 頭は少し小さめ(head=0.92)。子どもっぽさが抜けて大人の頭身になる
GENDO = Proportions(height=1.20, width=1.10, girth=1.16, torso=1.12,
                    head=0.92, stoop=-3.0)

GENDO_SKIN = (0.80, 0.58, 0.42)        # 炉の前で灼けた肌
GENDO_SHIRT = (0.78, 0.42, 0.20)       # 暖色の作務衣。炉の明かりに映える
GENDO_TROUSERS = (0.33, 0.24, 0.19)    # 焦げ茶のズボン
GENDO_LEATHER = (0.24, 0.15, 0.10)     # 革前掛けと革靴。一番濃い焦げ茶
GENDO_HAIR = (0.26, 0.20, 0.16)        # 黒に近い焦げ茶
GENDO_BAND = (0.86, 0.35, 0.16)        # ねじり鉢巻き。差し色の朱
GENDO_WOOD = (0.62, 0.45, 0.27)        # 木槌の柄。祠木の色
GENDO_MALLET = (0.45, 0.31, 0.18)      # 木槌の頭。打ち込んで色が濃くなった木


def build_gendo():
    """
    村の樽細工職人。背丈・太い腕・革前掛け・ねじり鉢巻き・木槌の5点で
    「工房の主」と読ませる。配色は焦げ茶を土台に、朱の鉢巻きと暖色の
    作務衣を差して炉の明かりに映えるようにする。
    """
    name = "gendo"
    body, joints, bones = build_base(name, GENDO)

    head = joints["head"]
    chest = joints["chest"]
    hip = joints["hip"]
    knee = joints["knee.L"]
    hand_r = joints["hand.R"]

    # 色は一式まとめて作り、同じ色の部品で使い回す(描画呼び出しを増やさない)。
    # 靴は革前掛けと同じ革なので、素体の塗り分けでも同じマテリアルを渡す
    mats = palette("gendo", {
        "skin": (GENDO_SKIN, 0.68),
        "shirt": (GENDO_SHIRT, 0.86),
        "trousers": (GENDO_TROUSERS, 0.88),
        "leather": (GENDO_LEATHER, 0.55),
        "hair": (GENDO_HAIR, 0.90),
        "band": (GENDO_BAND, 0.84),
        "eye": ((0.11, 0.09, 0.09), 0.30),
        "wood": (GENDO_WOOD, 0.80),
        "mallet": (GENDO_MALLET, 0.72),
    })

    # 袖はまくり上げてある(cuff を内側に寄せて、肘から先を肌にする)。
    # 太い腕を見せるのが職人らしさの要
    C.assign_materials_by_region(
        body,
        [mats["skin"], mats["shirt"], mats["trousers"], mats["leather"], mats["hair"]],
        garment_classifier(
            joints,
            hem=hip.z * 0.92,
            cuff=abs(joints["elbow.L"].x) * 0.72,
            cap=head.z + 0.070,
            cap_slope=0.30,
        ),
    )

    extras: list = []

    # 顔。まっすぐ前(-Y)を見ている
    face_y = head.y - 0.150
    for side in (-1.0, 1.0):
        # 眼球は白目を作らず黒目だけ。トゥーンの塗りでも潰れずに残る
        eye = C.uv_sphere(f"gendo_eye{side}", (0.061 * side, face_y + 0.004, head.z + 0.012),
                          0.026, segments=14, rings=10, scale=(1.0, 0.75, 1.15))
        C.assign_material(eye, mats["eye"])
        extras.append(eye)
        # 太くて真っ直ぐな眉。目尻を上げて頑固そうな顔にする
        brow = C.box(f"gendo_brow{side}", (0.0, 0.0, 0.0),
                     (0.062, 0.022, 0.017), bevel=0.006)
        brow.rotation_euler = (0.0, math.radians(-9.0 * side), 0.0)
        brow.location = Vector((0.062 * side, face_y + 0.018, head.z + 0.052))
        C.assign_material(brow, mats["hair"])
        extras.append(brow)
        # 口ひげ。中年の職人らしさが一気に出る
        tache = C.box(f"gendo_tache{side}", (0.0, 0.0, 0.0),
                      (0.040, 0.022, 0.015), bevel=0.005)
        tache.rotation_euler = (0.0, math.radians(13.0 * side), 0.0)
        tache.location = Vector((0.026 * side, face_y + 0.020, head.z - 0.066))
        C.assign_material(tache, mats["hair"])
        extras.append(tache)

    # 大きな鼻
    nose = C.uv_sphere("gendo_nose", (0.0, face_y - 0.006, head.z - 0.036), 0.040,
                       segments=14, rings=10, scale=(0.95, 1.25, 0.85))
    C.assign_material(nose, mats["skin"])
    extras.append(nose)

    # あごひげ。あごの下に短く生やす
    beard = C.uv_sphere("gendo_beard", (0.0, head.y - 0.074, head.z - 0.140), 0.062,
                        segments=12, rings=9, scale=(1.0, 0.95, 0.52))
    C.assign_material(beard, mats["hair"])
    extras.append(beard)

    # ねじり鉢巻き。額を一周させる。小球を輪に並べる部品を流用すると
    # 布をねじった凹凸がそのまま出る。
    # 半径は頭の半幅(0.138)より内側に取って地肌へ食い込ませる。外に出すと
    # 頭から浮いた輪に見える。玉は小さく数を増やすほど「ねじった布」に近づく
    band_z = head.z + 0.092
    extras += fluff_ring("gendo_band", (0.0, head.y, band_z),
                         radius=0.130, blob=0.028, material=mats["band"],
                         count=12, squash=0.72)
    # 後ろの結び目と、垂らした端
    knot = C.uv_sphere("gendo_knot", (0.0, head.y + 0.130, band_z + 0.004), 0.042,
                       segments=12, rings=8, scale=(1.0, 0.9, 0.8))
    C.assign_material(knot, mats["band"])
    extras.append(knot)
    for side in (-1.0, 1.0):
        tail = C.uv_sphere(f"gendo_bandtail{side}", (0.0, 0.0, 0.0), 0.030,
                           segments=10, rings=8, scale=(0.55, 0.65, 1.9))
        tail.rotation_euler = (math.radians(24.0), 0.0, 0.0)
        tail.location = Vector((0.030 * side, head.y + 0.134, band_z - 0.066))
        C.assign_material(tail, mats["band"])
        extras.append(tail)

    # 革前掛け。胸から膝の上まで届く1枚革。上ほど幅が狭い(胸当て)。
    # 胴の前面は胸から腰までほぼ垂直(y≒-0.152)なので、革も垂直に垂らし、
    # 背面が体に少し食い込む位置に置く。前へ逃がすと体から浮いた板に見える
    apron_top, apron_bottom = chest.z + 0.034, knee.z + 0.120
    apron_h = apron_top - apron_bottom
    apron = C.box("gendo_apron", (0.0, -0.166, (apron_top + apron_bottom) * 0.5),
                  (0.268, 0.030, apron_h), bevel=0.012)
    for vert in apron.data.vertices:
        t = (vert.co.z - apron_bottom) / apron_h        # 0=裾 1=胸
        vert.co.x *= 1.0 - 0.42 * max(0.0, t - 0.45) / 0.55
    C.assign_material(apron, mats["leather"])
    extras.append(apron)

    # 前掛けの肩紐。胸当ての上端から肩を越えて後ろへ回る
    for side in (-1.0, 1.0):
        strap = C.box(f"gendo_strap{side}", (0.0, 0.0, 0.0), (0.052, 0.330, 0.026),
                      bevel=0.008)
        strap.rotation_euler = (math.radians(-13.0), 0.0, 0.0)
        strap.location = Vector((0.116 * side, -0.075,
                                 joints["shoulder.L"].z + 0.052))
        C.assign_material(strap, mats["leather"])
        extras.append(strap)

    # 腰の革帯。前掛けを締めている
    belt = C.cylinder("gendo_belt", (0.0, 0.0, hip.z + 0.030), 0.188, 0.052, segments=22)
    C.assign_material(belt, mats["leather"])
    extras.append(belt)

    # 木槌。右手に握らせる。未決事項だった「別メッシュ(手ボーン追従)にするか」は
    # **本体と一体**で決着。素体に統合すれば自動ウェイトで前腕の骨に付き、
    # talk の「木槌を掲げる」動きにそのまま追従する。ボーンを増やすと村人ごとに
    # アーマチュアが変わって共通基盤の利点が消えてしまう
    # 体の幅(腰で半幅0.29)より外、かつ前掛けより前に出す。胴に寄せると
    # 腕と前掛けの陰に入って、職人の目印である木槌が読めなくなる
    grip = Vector((hand_r.x - 0.048, hand_r.y - 0.098, hand_r.z + 0.010))
    shaft = C.cylinder("gendo_haft", grip + Vector((0.0, 0.0, 0.030)), 0.019, 0.260,
                       segments=10)
    C.assign_material(shaft, mats["wood"])
    extras.append(shaft)
    head_c = grip + Vector((0.0, 0.0, 0.170))
    mallet = C.cylinder("gendo_mallet", head_c, 0.058, 0.150, segments=12, axis="X",
                        bevel=0.010)
    C.assign_material(mallet, mats["mallet"])
    extras.append(mallet)

    return finish(name, body, extras, joints, bones)


def gendo_animations():
    """
    idle: 腕組みでどっしり立つ。呼吸は浅く、たまに肩を回して(28〜44
          フレーム)固まって見えないようにする。木槌は右手にあるので、
          右腕は左腕の上に浅く重ねる程度に留める。
    talk: 木槌を軽く掲げて応える。ひな形のうなずきに、右腕を持ち上げて
          ゆっくり下ろす動きを重ねている。
    """
    # 腕組み。前腕(elbow-hand)を大きく折り、上腕(shoulder-elbow)を
    # 少し前へ出して胸の前で組む。右は木槌を持つぶん浅い
    folded = {
        ARM_L: (4, 0, 1.5), ARM_R: (4, 0, -1.5),
        FORE_L: (-20, 0, 0), FORE_R: (-16, 0, 0),
        HAND_L: (-64, 0, 0), HAND_R: (-52, 0, 0),
    }

    def shrug(lift: float, open_: float) -> dict:
        return {ARM_L: (-lift, 0, 1.5 + open_), ARM_R: (-lift, 0, -(1.5 + open_))}

    return [
        ("idle", idle_clip(length=52, breath=1.4, arm=1.5, head_lag=3, extra={
            1: folded,
            26: folded,
            52: folded,
            # 肩を回す。上げる(28)→ 後ろへ開く(34)→ 落とす(40)→ 戻る(46)
            28: shrug(5.0, 2.0),
            34: shrug(7.5, 5.0),
            40: shrug(1.5, 3.0),
            46: dict(folded),
        })),
        ("talk", talk_clip(length=34, nod=12.0, lean=3.0, arm=1.5, extra={
            1: folded,
            6: {**folded, ARM_R: (-6, 0, -2.5), HAND_R: (-64, 0, 0)},   # タメ
            10: {ARM_R: (-20, 0, -5.0), FORE_R: (-24, 0, 0), HAND_R: (-78, 0, 0)},
            14: {ARM_R: (-14, 0, -4.0), FORE_R: (-20, 0, 0), HAND_R: (-70, 0, 0)},
            34: folded,
        })),
    ]


# ---------------------------------------------------------------- 子守りのフク

# 村人で一番横幅がある。背丈はガルドとほぼ同じ(height=0.98)なのに、
# 胴(torso)と関節の太さ(girth)を大きく取って「横に伸びた」体型にする。
# stoop はごくわずか。腹の重みで少しだけ前に傾いている程度に留める
# (モグラ婆のような老いた猫背にはしない)
FUKU = Proportions(height=0.98, width=1.16, girth=1.18, torso=1.30,
                   head=1.00, stoop=4.0)

FUKU_SKIN = (0.89, 0.72, 0.58)         # 薄橙。ねむり小屋の薄暗がりで浮く明るさ
FUKU_ROBE = (0.94, 0.75, 0.55)         # 寝間着。肌より一段濃い薄橙
FUKU_WRAP = (0.19, 0.23, 0.40)         # 夜色の腹掛け。この配色の要
FUKU_TROUSERS = (0.33, 0.34, 0.47)     # 下衣。腹掛けより明るい夜色
FUKU_SHOE = (0.24, 0.26, 0.36)         # 布靴。一番暗い夜色
FUKU_HAIR = (0.35, 0.30, 0.27)         # 白いものが混じりはじめた中年の髪
FUKU_WOOD = (0.56, 0.39, 0.23)         # 抱えたタルの板
FUKU_HOOP = (0.39, 0.35, 0.29)         # タルの箍(たが)。小さいので鉄より木箍らしく

# 胴の断面。素体を実測した値で、腰(t=0)から胸(t=1)までを4等分してある。
# 数字は (半幅x, 前後の中心y, 前後の半径y)。この村人は胴が太いので、布を
# 「体の前に板で置く」と横から見たときに浮いて見える。腹掛けはこの断面に
# 沿わせて巻きつける
FUKU_TORSO_PROFILE = (
    (0.00, 0.279, -0.023, 0.176),   # 腰
    (0.25, 0.300, -0.021, 0.209),
    (0.50, 0.299, -0.012, 0.217),   # 腹の一番出たところ
    (0.75, 0.288, +0.001, 0.203),
    (1.00, 0.247, -0.001, 0.176),   # 胸
)


def _profile_at(t: float) -> tuple[float, float, float]:
    """FUKU_TORSO_PROFILE を線形に補間して (半幅, 中心y, 半径y) を返す。"""
    pts = FUKU_TORSO_PROFILE
    t = min(max(t, 0.0), 1.0)
    for (t0, *a), (t1, *b) in zip(pts, pts[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return tuple(p + (q - p) * k for p, q in zip(a, b))
    return tuple(pts[-1][1:])


def _belly_wrap(name: str, joints: dict[str, Vector], bottom: float, top: float,
                material, margin: float = 0.014):
    """
    腹掛け。円筒を素体の断面(FUKU_TORSO_PROFILE)に合わせて潰し、
    体の表面から margin だけ浮かせた布にする。t は腰〜胸で測った比率なので、
    丈(bottom/top)を変えても断面の当てはめはずれない。
    """
    hip_z, chest_z = joints["hip"].z, joints["chest"].z
    height = top - bottom
    wrap = C.cylinder(name, (0.0, 0.0, (top + bottom) * 0.5), 1.0, height, segments=20)
    for vert in wrap.data.vertices:
        rx, cy, ry = _profile_at((vert.co.z - hip_z) / (chest_z - hip_z))
        vert.co.x *= rx + margin
        vert.co.y = cy + vert.co.y * (ry + margin)
    C.assign_material(wrap, material)
    return wrap


def _cradle_barrel(name: str, center, tilt: float, wood, hoop) -> list:
    """
    赤子のように抱える小さなタル。面を12に落としたフラットシェーディングで
    板を並べた樽に見せるのは、道具のタル(`props.py`)と同じ作り。
    寸法も材質も別物(道具のタルは半径0.245、これはその半分以下)なので、
    メッシュは流用せずこの村人のパレットで作り直している。
    """
    length, radius = 0.212, 0.094
    parts = []

    body = C.cylinder(f"{name}_body", (0.0, 0.0, 0.0), radius, length,
                      segments=12, axis="X", smooth=False)
    for vert in body.data.vertices:
        # 中央を膨らませて樽の腹を出す
        bulge = 1.0 + 0.15 * math.cos(vert.co.x / length * math.pi)
        vert.co.y *= bulge
        vert.co.z *= bulge
    C.assign_material(body, wood)
    parts.append(body)

    for i, x in enumerate((-0.054, 0.054)):
        band = C.cylinder(f"{name}_hoop{i}", (x, 0.0, 0.0), radius * 1.13, 0.022,
                          segments=14, axis="X")
        C.assign_material(band, hoop)
        parts.append(band)

    # 上蓋。腕に抱かれた側の端に付けて、赤子の頭のように見せる
    lid = C.cylinder(f"{name}_lid", (length * 0.5 + 0.010, 0.0, 0.0), radius * 1.05,
                     0.026, segments=12, axis="X", smooth=False)
    C.assign_material(lid, wood)
    parts.append(lid)

    for part in parts:
        part.rotation_euler = (0.0, math.radians(tilt), 0.0)
        part.location = Vector(center)
    return parts


def _bind_to_bone(mesh, materials, bone: str) -> None:
    """
    指定したマテリアルの面に属する頂点を、その骨だけに100%付け直す。

    自動ウェイトは小道具の頂点を「近い骨に少しずつ」配ってしまう。杖や木槌の
    ような細い棒なら目立たないが、タルのようなかたまりだと腕を畳んだだけで
    箍(たが)と胴が別々の骨に引かれて捻れ、ばらばらに散る。抱えたタルは
    体幹と一緒に動けばよいので、剛体として体幹の骨に付け直してしまう。

    マテリアルで拾っているのは、タルの木と箍がこの村人でタルにしか
    使われていないため(`palette()` で色を一意にしてある)。
    """
    names = {m.name for m in materials}
    slots = {i for i, m in enumerate(mesh.data.materials) if m is not None and m.name in names}
    verts = set()
    for poly in mesh.data.polygons:
        if poly.material_index in slots:
            verts.update(poly.vertices)
    verts = list(verts)
    target = mesh.vertex_groups.get(bone)
    if target is None:
        target = mesh.vertex_groups.new(name=bone)
    for group in mesh.vertex_groups:
        if group.name != bone:
            group.remove(verts)
    target.add(verts, 1.0, "REPLACE")


def build_fuku():
    """
    ねむり小屋の番人。横幅・垂れ目・二重あご・抱えたタルの4点で
    「ふくよかで眠たげな子守り」と読ませる。配色は薄橙の寝間着に
    夜色の腹掛けを重ね、暖かい薄暗がりの中で腹掛けだけが沈んで見えるようにする。
    """
    name = "fuku"
    body, joints, bones = build_base(name, FUKU)

    head = joints["head"]
    neck = joints["neck"]
    chest = joints["chest"]
    hip = joints["hip"]

    mats = palette("fuku", {
        "skin": (FUKU_SKIN, 0.70),
        "robe": (FUKU_ROBE, 0.88),
        "wrap": (FUKU_WRAP, 0.82),
        "trousers": (FUKU_TROUSERS, 0.86),
        "shoe": (FUKU_SHOE, 0.72),
        "hair": (FUKU_HAIR, 0.90),
        "eye": ((0.13, 0.11, 0.12), 0.30),
        "wood": (FUKU_WOOD, 0.84),
        "hoop": (FUKU_HOOP, 0.70),
    })

    # 寝間着なので裾は長め(hem を膝の上まで下げる)、袖も長め(cuff を外へ
    # 寄せて手先だけ肌にする)。薄橙を体の大半に回して、夜色は腹掛けと
    # 脚まわりだけの差し色に留める。
    # 髪は cap_slope を強めに取って額を広く出す(中年の生え際)
    C.assign_materials_by_region(
        body,
        [mats["skin"], mats["robe"], mats["trousers"], mats["shoe"], mats["hair"]],
        garment_classifier(
            joints,
            hem=hip.z * 0.58,
            cuff=abs(joints["elbow.L"].x) * 1.10,
            collar=neck.z + 0.010,
            cap=head.z + 0.086,
            cap_slope=0.62,
        ),
    )

    extras: list = []

    # 顔。まっすぐ前(-Y)を向いているが、目はほとんど閉じている
    face_y = head.y - 0.152
    for side in (-1.0, 1.0):
        # 垂れ目。丸い眼球を作らず線1本にすると「半分眠っている」と読める。
        # tilt は正で目尻が下がる
        extras.append(eye_slit(
            f"fuku_eye{side}", (0.064 * side, face_y - 0.004, head.z + 0.012),
            width=0.062, material=mats["eye"], tilt=17.0 * side,
        ))
        # 八の字の眉。目より上に離して置く(同じ高さに置くと目とぶつかって
        # 一本の太い線に潰れる)
        brow = C.box(f"fuku_brow{side}", (0.0, 0.0, 0.0),
                     (0.052, 0.020, 0.013), bevel=0.005)
        brow.rotation_euler = (0.0, math.radians(15.0 * side), 0.0)
        brow.location = Vector((0.062 * side, face_y + 0.014, head.z + 0.062))
        C.assign_material(brow, mats["hair"])
        extras.append(brow)
        # ふくらんだ頬。顔の丸みは体の丸みと揃えておく。
        # 顔の表面は実測で z=0.66 あたりが y≒-0.165 なので、そこから
        # わずかに前へ出す(奥に置くと頭に呑まれて何も見えない)
        cheek = C.uv_sphere(f"fuku_cheek{side}", (0.080 * side, head.y - 0.084,
                                                  head.z - 0.046), 0.046,
                            segments=12, rings=9, scale=(0.95, 0.85, 0.82))
        C.assign_material(cheek, mats["skin"])
        extras.append(cheek)

    nose = C.uv_sphere("fuku_nose", (0.0, face_y - 0.008, head.z - 0.024), 0.038,
                       segments=14, rings=10, scale=(0.95, 1.15, 0.90))
    C.assign_material(nose, mats["skin"])
    extras.append(nose)

    # 半分開いた口。小さな横長の穴で「ぽかんと寝ぼけている」を出す。
    # あご先はここから急に細るので、これ以上下げると顔から外れる
    mouth = C.uv_sphere("fuku_mouth", (0.0, head.y - 0.132, head.z - 0.062), 0.026,
                        segments=12, rings=8, scale=(1.25, 0.55, 0.75))
    C.assign_material(mouth, mats["eye"])
    extras.append(mouth)

    # 二重あご。あご先と首のあいだに肉を一段落とす。横幅と並んで
    # 「ふくよか」を一番はっきり伝える部品。首(半径0.085)より太い輪を
    # あごの前へずらして置くと、たるんだ肉として読める
    for i, (z, radius, y) in enumerate(((neck.z + 0.040, 0.100, head.y - 0.062),
                                        (neck.z + 0.002, 0.114, head.y - 0.050))):
        chin = C.uv_sphere(f"fuku_chin{i}", (0.0, y, z), radius,
                           segments=14, rings=9, scale=(1.0, 0.94, 0.44))
        C.assign_material(chin, mats["skin"])
        extras.append(chin)

    # 寝癖。後頭部の髪を一房だけ跳ねさせる。
    # 原点で作る → 回す → location で置く(先に置いてから回すと飛んでいく)
    tuft = C.uv_sphere("fuku_tuft", (0.0, 0.0, 0.0), 0.026,
                       segments=10, rings=8, scale=(0.62, 0.80, 1.55))
    tuft.rotation_euler = (math.radians(-52.0), 0.0, 0.0)
    tuft.location = Vector((0.026, head.y + 0.108, joints["crown"].z - 0.030))
    C.assign_material(tuft, mats["hair"])
    extras.append(tuft)

    # 夜色の腹掛け。腹の一番出たところを帯のように覆う。上下に薄橙の
    # 寝間着を残して、夜色が体を覆い尽くさないようにする
    extras.append(_belly_wrap("fuku_wrap", joints, hip.z + 0.006, chest.z - 0.026,
                              mats["wrap"]))
    # 腹掛けの肩紐。肩の上を越えて前から後ろへ回す。これが無いと
    # 腹掛けではなく腹巻きに見える。肩の頂点は実測で z≒0.62・x≒0.14
    for side in (-1.0, 1.0):
        strap = C.box(f"fuku_strap{side}", (0.0, 0.0, 0.0), (0.044, 0.300, 0.022),
                      bevel=0.007)
        strap.rotation_euler = (math.radians(12.0), 0.0, 0.0)
        strap.location = Vector((0.146 * side, -0.016,
                                 joints["shoulder.L"].z + 0.082))
        C.assign_material(strap, mats["wrap"])
        extras.append(strap)

    # 抱えたタル。腹の棚に載せ、左(+X)の端を持ち上げて赤子を抱く角度にする。
    # 未決事項だった「道具のタルのメッシュを流用できるか」は**流用しない**で決着。
    # `props._barrel_lid` が道具のタルの寸法を直に参照していて縮小できないうえ、
    # 流用すると木・鉄輪で4つマテリアルが増えて描画呼び出しが増えてしまう。
    # 作りの決まり(12面フラットの板張り+箍)だけを揃えて作り直す
    # 高さは自動ウェイトの実測で決めてある。ここより下げるとタルが前腕の骨に
    # 引っ張られ、抱きかかえのポーズで箍(たが)だけが顔まで伸びてしまう。
    # 胸の高さまで上げると胴の骨(hip-chest / chest-neck / chest-shoulder)に
    # ほぼ収まり、腕をどう畳んでもタルの形が崩れない
    extras += _cradle_barrel("fuku_barrel", (0.0, -0.262, chest.z - 0.029),
                             tilt=-15.0, wood=mats["wood"], hoop=mats["hoop"])

    objs, armature = finish(name, body, extras, joints, bones)
    # タルは体幹の骨に剛体で付け直す。idle の揺らしは SPINE を回すので、
    # これで「抱えたタルごと体を揺らしてあやす」動きになる
    _bind_to_bone(objs[0], (mats["wood"], mats["hoop"]), SPINE)
    return objs, armature


# 抱きかかえた腕。上腕(FORE_*)を前へ振り出し、前腕(HAND_*)を大きく
# 折り曲げてタルの下に回す。両クリップの土台になるので1か所にまとめる
# 角度は実測で決めてある。この体型は腕が短く、手先(elbow-hand の先)は
# どうポーズを取っても y=-0.21 より前へは届かない。タルの背面が
# y≒-0.184 に来るように置いてあるので、手はタルの後ろ下に添う
FUKU_CRADLE = {
    ARM_L: (-3, 0, 3.0), ARM_R: (-3, 0, -3.0),
    FORE_L: (-42, 0, 10), FORE_R: (-42, 0, -10),
    HAND_L: (-46, 0, 12), HAND_R: (-46, 0, -12),
}


def _cradle(*diffs: dict) -> dict:
    """抱きかかえた腕を土台に、指定した骨だけ差し替えたポーズを作る。"""
    pose = dict(FUKU_CRADLE)
    for diff in diffs:
        pose.update(diff)
    return pose


def fuku_animations():
    """
    idle: 抱えたタルを左右にゆっくり揺らしてあやす。体幹のひねり(SPINE の
          Z回転)と横倒し(Y回転)を、呼吸より長い周期で往復させる。
          頭は3フレーム遅れて追従し、あやす向きと逆に傾く(赤子を覗き込む首)。
    talk: 「しーっ」と右手の人差し指を口元へ立ててから応じる。右腕だけ
          抱きかかえから外して口元まで上げ、うなずいたあとタルへ戻す。
          左腕はタルを抱えたまま動かさない。
    """
    # 揺らしの片道。腰から上を傾けると、腹の前のタルも一緒に振れる。
    # pitch はひな形の呼吸(SPINE の X回転)。上書きで消さないよう混ぜ直す
    def sway(k: float, pitch: float = 0.0) -> dict:
        return _cradle({
            SPINE: (pitch, 5.0 * k, 3.5 * k),
            FORE_L: (-42, 0, 10 - 2.5 * k),
            FORE_R: (-42, 0, -10 - 2.5 * k),
        })

    # 口元へ立てた指。上腕を大きく振り上げ、前腕を内へひねって手先を
    # 顔の中心(x≒0)へ寄せる。ひねりを足さないと手が耳の横で止まる
    hush = {ARM_R: (-9, 0, -5.0), FORE_R: (-98, 0, 36), HAND_R: (-72, 0, -14)}

    return [
        # 68フレームは共通のひな形(36)の倍近い。眠たげな村人なので、
        # 呼吸も揺らしも他の村人より目に見えて遅くする
        ("idle", idle_clip(length=68, breath=1.2, arm=3.0, head_lag=3, extra={
            1: sway(1.0),
            18: sway(0.0, 1.2),
            34: sway(-1.0, 1.2),
            51: sway(0.0),
            68: sway(1.0),
            # 頭は揺らしと逆へ傾けて、腕の中を覗き込んでいるようにする
            4: {NECK: (2.0, -2.5, -2.0)},
            21: {NECK: (2.5, 0.0, 0.0)},
            37: {NECK: (2.0, 2.5, 2.0)},
            54: {NECK: (2.5, 0.0, 0.0)},
            71: {NECK: (2.0, -2.5, -2.0)},
        })),
        ("talk", talk_clip(length=44, nod=10.0, lean=2.4, arm=3.0, head_lag=3, extra={
            1: _cradle(),
            # タメ。指を口元へ持っていく手前で少し引く
            6: _cradle({ARM_R: (-4, 0, -4.0), FORE_R: (-36, 0, -16),
                        HAND_R: (-40, 0, -14)}),
            # ツメ。「しーっ」と一気に立てる
            10: _cradle(hush),
            14: _cradle(hush),
            # うなずきの間は指を立てたまま
            26: _cradle(hush),
            # ゆっくりタルへ戻す
            36: _cradle({ARM_R: (-6, 0, -4.0), FORE_R: (-62, 0, 8),
                         HAND_R: (-56, 0, -12)}),
            44: _cradle(),
        })),
    ]


# ---------------------------------------------------------------- ポチ

# 村の子供。全高0.492 = ガルド(0.849)のおよそ6割で、そのぶん頭を大きく取って
# 頭身を下げる(全高がおよそ頭3つぶん)。stoop は猫背ではなく「前のめり」。
# じっとしていられない子の重心を前に置く
POCHI = Proportions(height=0.56, width=0.84, girth=0.97, torso=1.16,
                    head=1.14, stoop=9.0)

POCHI_SKIN = (0.93, 0.76, 0.58)       # 日に焼ける前の子供の肌。ガルドより明るい
POCHI_COAT = (0.95, 0.68, 0.13)       # 山吹。村で一番彩度の高い上着
POCHI_TRIM = (0.78, 0.45, 0.08)       # 上着の襟・袖口・裾。山吹を一段濃くした縁
POCHI_PANTS = (0.56, 0.78, 0.31)      # 若草。半ズボン
POCHI_SHOE = (0.44, 0.31, 0.20)
POCHI_HAIR = (0.35, 0.23, 0.15)       # 栗色。寝ぐせで跳ねている


def _face_point(head, azim: float, elev: float, depth: float):
    """
    頭を球とみなして、その球面上に顔の部品を置くための座標を返す。

    頭の中心(head)から方位 azim(度、正で右)・仰角 elev(度)の向きへ
    depth だけ進んだ点。ポチの素体は半径およそ0.105のほぼ真球なので、
    depth に「表面までの距離 - 部品の半径 + 出したい高さ」を渡せば、
    部品の裏側が必ず頭の中に埋まる。

    z だけを見て y を当て推量すると、目のように大きい部品は端が頭の
    輪郭からはみ出して飛び出し目になる。向きで置けばそれが起きない。
    """
    a, e = math.radians(azim), math.radians(elev)
    return Vector(head) + Vector((
        math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)
    )) * depth


def _cowlick(name: str, base, length: float, thickness: float,
             tilt_x: float, tilt_y: float, material) -> object:
    """
    寝ぐせの毛束。根元(base)から生えて先が細くなる角。

    原点で作る → 回す → 置く、の順。`C.cone` は頂点を動かすだけで
    オブジェクトの原点はワールド原点に残るので、置いてから回すと飛んでいく。
    根元が原点に来るように作れば、回転が「生え際を軸に傾ける」になる。
    """
    tuft = C.cone(name, (0.0, 0.0, length * 0.5), radius_bottom=thickness,
                  radius_top=thickness * 0.16, depth=length, segments=8)
    tuft.rotation_euler = (math.radians(tilt_x), math.radians(tilt_y), 0.0)
    tuft.location = Vector(base)
    C.assign_material(tuft, material)
    return tuft


def build_pochi():
    """
    村の子供。「小さい・頭が大きい・お下がりのだぶだぶな上着・半ズボンから
    出た素足・寝ぐせ」の5点で読ませる。前のめりの立ち姿と丸く大きい目で、
    村の中で一番元気な存在に見せる。
    """
    name = "pochi"
    body, joints, bones = build_base(name, POCHI)

    crown = joints["crown"]
    head = joints["head"]
    neck = joints["neck"]
    chest = joints["chest"]
    hip = joints["hip"]
    knee = joints["knee.L"]
    elbow_l = joints["elbow.L"]
    hand_l = joints["hand.L"]

    mats = palette("pochi", {
        "skin": (POCHI_SKIN, 0.68),
        "coat": (POCHI_COAT, 0.82),
        "trim": (POCHI_TRIM, 0.82),
        "pants": (POCHI_PANTS, 0.86),
        "shoe": (POCHI_SHOE, 0.70),
        "hair": (POCHI_HAIR, 0.88),
        "eye": ((0.12, 0.10, 0.11), 0.25),
        "white": ((0.97, 0.96, 0.93), 0.30),
    })

    # 上着は腰まで届くお下がり(hem を下げる)。袖も長めにして手先を
    # 少しだけ出す(cuff を広げると、袖から出る肌の範囲が狭まる)。
    #
    # cap / cap_slope は素体を測って決めた。頭は半径およそ0.107の球で、
    # z=0.303〜0.492 を占める。傾きを強く取ると、額を出したまま
    # 側頭部と後頭部だけを深く覆える(0.108 は頭の中心から顔の表面まで):
    #   前: 0.416 + 0.42*0.108 = 0.461   横: 0.416   後ろ: 0.371
    # おでこは広く残しつつ、横と後ろは髪で覆ったおかっぱ寄りの髪型になる
    base_classify = garment_classifier(
        joints,
        hem=hip.z * 0.80,
        cuff=abs(elbow_l.x) * 1.08,
        collar=neck.z - 0.004,
        cap=head.z + 0.006,
        cap_slope=0.42,
    )
    bare_leg_z = knee.z + 0.006

    # 首から上を肌にするしきい値は高さだけを見るので、そのままだと
    # 肩の丸みの上側(首と同じ高さにある)まで肌になり、襟から肩へ素肌の帯が
    # 渡ってしまう。頭の中心から 0.122 より遠い襟より上 = 肩なので上着に戻す
    # (頭も首も中心から 0.12 以内に収まる。手は襟より下なので巻き込まない)
    collar_z = neck.z - 0.004

    def classify(center) -> int:
        slot = base_classify(center)
        if slot == BOTTOM and center.z < bare_leg_z:
            return SKIN  # 半ズボンから出た素足。膝から下は肌
        if slot == SKIN and center.z > collar_z and (center - head).length > 0.122:
            return TOP   # 襟の高さで頭から離れているところ = 肩。上着で覆う
        return slot

    C.assign_materials_by_region(
        body,
        [mats["skin"], mats["coat"], mats["pants"], mats["shoe"], mats["hair"]],
        classify,
    )

    extras: list = []

    # 顔。部品はすべて `_face_point()` で頭の球面上に置く。表面までの距離は
    # 素体にレイを飛ばして測った(向き → 半径):
    #   目 (35,-6)→0.1049  眉 (30,+22)→0.1049  鼻 (0,-22)→0.0952
    #   口 (0,-52)→0.0797
    # 縦は 眉 > 目 > 鼻 > 口 の順に、隣どうしが数ミリ空くよう詰めてある。
    # 目は大きいが球のまま頭に埋め込むので、飛び出して見えることはない
    for side in (-1.0, 1.0):
        eye_dir = (35.0 * side, -6.0)
        eye_at = _face_point(head, *eye_dir, 0.084)
        white = C.uv_sphere(f"pochi_eyewhite{side}", eye_at, 0.029, segments=16, rings=12)
        C.assign_material(white, mats["white"])
        # 瞳は白目より 0.019 だけ外へ。白目の球面から少しだけ顔を出す
        pupil = C.uv_sphere(f"pochi_pupil{side}", _face_point(head, *eye_dir, 0.103),
                            0.0165, segments=14, rings=10)
        C.assign_material(pupil, mats["eye"])
        # 瞳のハイライト。白目と同じマテリアルを使い回すので描画は増えない。
        # 白目の中心から半径ぶん外(=球面上)に置く
        glint = C.uv_sphere(f"pochi_glint{side}",
                            _face_point(eye_at, 46.0 * side, 14.0, 0.028),
                            0.0065, segments=10, rings=7)
        C.assign_material(glint, mats["white"])
        # 短くつり上がった眉。元気の記号
        brow = C.box(f"pochi_brow{side}", (0.0, 0.0, 0.0), (0.034, 0.015, 0.008), bevel=0.004)
        brow.rotation_euler = (0.0, math.radians(-12.0 * side), 0.0)
        brow.location = _face_point(head, 30.0 * side, 22.0, 0.103)
        C.assign_material(brow, mats["hair"])
        extras += [white, pupil, glint, brow]

    # 小さな鼻と、開いた口。ガルドの大きな鼻と対にして子供っぽさを出す
    nose = C.uv_sphere("pochi_nose", _face_point(head, 0.0, -22.0, 0.0885), 0.014,
                       segments=12, rings=9, scale=(0.95, 1.05, 0.75))
    C.assign_material(nose, mats["skin"])
    extras.append(nose)
    mouth = C.uv_sphere("pochi_mouth", _face_point(head, 0.0, -52.0, 0.0727), 0.023,
                        segments=14, rings=10, scale=(1.35, 0.48, 0.42))
    C.assign_material(mouth, mats["eye"])
    extras.append(mouth)

    # 寝ぐせ。跳ねた毛束を頭の上と後ろに散らす。1本だけ長いのを後ろへ
    hair_top = crown.z - 0.012
    for tuft_name, base, length, thick, tx, ty in (
        ("pochi_tuft_a", (0.0, crown.y + 0.018, hair_top), 0.098, 0.032, 34.0, 0.0),
        ("pochi_tuft_b", (0.052, crown.y - 0.014, hair_top - 0.016), 0.086, 0.026, 20.0, -52.0),
        ("pochi_tuft_c", (-0.056, crown.y + 0.010, hair_top - 0.022), 0.078, 0.024, -10.0, 56.0),
        ("pochi_tuft_d", (0.014, crown.y + 0.060, hair_top - 0.060), 0.104, 0.030, 96.0, -12.0),
    ):
        extras.append(_cowlick(tuft_name, base, length, thick, tx, ty, mats["hair"]))

    # だぶだぶの上着。素体の塗り分けだけでは「体に色が付いている」だけで
    # 一枚羽織って見えないので、腰まわりに素体より太い裾広がりの筒をかぶせ、
    # 襟・裾・袖口を一段濃い縁で締める。
    #
    # 太さは素体を測って決めた。腰の表面はおよそ半径0.091、太ももが左右に
    # 張り出して0.111、首まわりは0.089。上着はそれより少しだけ外側に置く
    # (離しすぎると浮き輪に見える)
    hem_z = hip.z * 0.80
    coat_top = chest.z - 0.020
    coat = C.cone("pochi_coat", (0.0, 0.0, (hem_z + coat_top) * 0.5),
                  radius_bottom=0.126, radius_top=0.094,
                  depth=coat_top - hem_z, segments=20)
    C.assign_material(coat, mats["coat"])
    extras.append(coat)

    collar = C.cone("pochi_collar", (0.0, 0.0, neck.z - 0.016),
                    radius_bottom=0.120, radius_top=0.100, depth=0.034, segments=18)
    C.assign_material(collar, mats["trim"])
    extras.append(collar)

    hem = C.cylinder("pochi_hem", (0.0, 0.0, hem_z + 0.004), 0.130, 0.016, segments=20)
    C.assign_material(hem, mats["trim"])
    extras.append(hem)

    # 半ズボンの裾。若草がここにしか出ないと面積が足りないので、
    # 腿に輪を1つずつ足して「短い緑のズボン」をはっきりさせる
    for side in (-1.0, 1.0):
        band = C.cylinder(f"pochi_shorts{side}", (0.070 * side, 0.0, bare_leg_z + 0.008),
                          0.058, 0.016, segments=14)
        C.assign_material(band, mats["pants"])
        extras.append(band)

    # 袖口。前腕にかぶせた輪。自動ウェイトで前腕の骨に付いて腕に追従する
    for side in (-1.0, 1.0):
        cx = elbow_l.x + (hand_l.x - elbow_l.x) * 0.62
        cy = elbow_l.y + (hand_l.y - elbow_l.y) * 0.62
        cz = elbow_l.z + (hand_l.z - elbow_l.z) * 0.62
        cuff = C.uv_sphere(f"pochi_cuff{side}", (cx * side, cy, cz), 0.050,
                           segments=14, rings=10, scale=(1.0, 1.0, 0.55))
        C.assign_material(cuff, mats["trim"])
        extras.append(cuff)

    return finish(name, body, extras, joints, bones)


def pochi_animations():
    """
    idle: じっとしていられない子。体を左右に揺らし、頭が遅れてついてくる。
          ひな形の呼吸(前後)に、腰の左右の振り(SPINE のロール)を重ねた。
    talk: 両手を上げて跳ねる。沈み込む(タメ)→ 跳ぶ → 着地でつぶれる →
          戻る、の順。ひな形のうなずきはそのまま生きているので、跳ねながら
          うなずく形になる。

    腕を上げるのは ARM_* の**X回転**。ガルドから受け継いだ待機の
    「腕を開く」は Z 回転だが、そちらは大きく回すと腕が背中側へ回り込む。
    上腕(ARM)を大きく回すと肩が内側へ入り、腕が胴(半径0.109)と大きな頭に
    埋もれて手先しか見えなくなる。上げるのは主に前腕(FORE)にして、上腕は
    少しだけ添える。実測: ARM x=+16・FORE x=+100・HAND x=-32 で
    肘 (x=±0.12, z=0.41)、手先 (x=±0.20, z=0.40) と、どちらも胴より外に出る。
    """
    # このアーマチュアには腰より上の親骨が無いので、跳ねは体そのものを
    # 持ち上げるのではなく SPINE(腰→胸)を骨の長さ方向へずらして出す。
    # 骨の長さがおよそ0.10しかないので、ずらす量は0.024までに抑えてある
    sway = 5.5   # 腰の左右の振れ幅(度)
    return [
        ("idle", idle_clip(length=40, breath=2.2, arm=5.0, head_lag=3, extra={
            1: {SPINE: (0, 0, 0)},
            10: {SPINE: (1.1, 0, sway), ARM_L: (0, 0, 7.5), ARM_R: (0, 0, -3.0)},
            13: {NECK: (-0.8, 0, -sway * 0.45)},          # 頭は3フレーム遅れて逆に傾く
            20: {SPINE: (2.2, 0, 0)},
            30: {SPINE: (1.1, 0, -sway), ARM_L: (0, 0, 3.0), ARM_R: (0, 0, -7.5)},
            33: {NECK: (-0.8, 0, sway * 0.45)},
            40: {SPINE: (0, 0, 0)},
        })),
        ("talk", talk_clip(length=34, nod=12.0, lean=3.0, arm=5.0, extra={
            1: {SPINE: {"rot": (0, 0, 0), "loc": (0, 0, 0)},
                LEG_L: (0, 0, 0), LEG_R: (0, 0, 0)},
            # タメ。少し沈んで腕を後ろへ引く
            6: {SPINE: {"rot": (-3.0, 0, 0), "loc": (0, -0.016, 0)},
                ARM_L: (-10, 0, 0), ARM_R: (-10, 0, 0),
                FORE_L: (-18, 0, 0), FORE_R: (-18, 0, 0),
                LEG_L: (6, 0, 0), LEG_R: (6, 0, 0),
                SHIN_L: (-10, 0, 0), SHIN_R: (-10, 0, 0)},
            # 跳ぶ。両手は頭より上、脚は縮めて浮かせる
            10: {SPINE: {"rot": (3.0, 0, 0), "loc": (0, 0.032, 0)},
                 ARM_L: (16, 0, 0), ARM_R: (16, 0, 0),
                 FORE_L: (100, 0, 0), FORE_R: (100, 0, 0),
                 HAND_L: (-32, 0, 0), HAND_R: (-32, 0, 0),
                 LEG_L: (14, 0, 0), LEG_R: (14, 0, 0),
                 SHIN_L: (-20, 0, 0), SHIN_R: (-20, 0, 0)},
            # 着地。行き過ぎてつぶれる
            14: {SPINE: {"rot": (1.0, 0, 0), "loc": (0, -0.014, 0)},
                 ARM_L: (10, 0, 0), ARM_R: (10, 0, 0),
                 FORE_L: (58, 0, 0), FORE_R: (58, 0, 0),
                 HAND_L: (-18, 0, 0), HAND_R: (-18, 0, 0),
                 LEG_L: (8, 0, 0), LEG_R: (8, 0, 0),
                 SHIN_L: (-12, 0, 0), SHIN_R: (-12, 0, 0)},
            # 反動でもう一度小さく伸び上がってから戻る
            20: {SPINE: {"rot": (-1.2, 0, 0), "loc": (0, 0.008, 0)},
                 ARM_L: (4, 0, 0), ARM_R: (4, 0, 0),
                 FORE_L: (22, 0, 0), FORE_R: (22, 0, 0),
                 HAND_L: (-6, 0, 0), HAND_R: (-6, 0, 0),
                 LEG_L: (0, 0, 0), LEG_R: (0, 0, 0),
                 SHIN_L: (0, 0, 0), SHIN_R: (0, 0, 0)},
            34: {SPINE: {"rot": (0, 0, 0), "loc": (0, 0, 0)}},
        })),
    ]


# ---------------------------------------------------------------- 目覚めたおたま

# 第二章で眠り病から救出される若い村人。長い眠りから覚めたばかり、を
# 「色」だけでなく**輪郭と姿勢**で読ませるのがこの村人の要:
#   1. 肩に掛けたかいまき(綿入りの寝具)で、肩から腰までを丸く大きくする
#   2. わずかな猫背と、そこから伸びる細い脚で「まだ立ち慣れていない」体
#   3. 寝癖の房が頭の輪郭を左右非対称に崩す
OTAMA = Proportions(height=0.97, width=0.90, girth=0.96, torso=1.00,
                    head=1.10, stoop=12.0)

OTAMA_SKIN = (0.87, 0.76, 0.71)       # 長く眠っていた、血の気の薄い肌
OTAMA_WEAR = (0.71, 0.70, 0.72)       # 寝間着。薄鼠
OTAMA_BOTTOM = (0.52, 0.51, 0.54)     # 下衣。薄鼠を一段沈めた色
OTAMA_SHOE = (0.36, 0.34, 0.35)
OTAMA_HAIR = (0.31, 0.26, 0.27)       # 寝癖の黒髪。わずかに桜を含ませる
OTAMA_KAIMAKI = (0.76, 0.57, 0.59)    # かいまき本体。くすんだ桜色
OTAMA_LINING = (0.56, 0.40, 0.43)     # かいまきの裏地と縁。一段濃い桜鼠
OTAMA_COTTON = (0.90, 0.85, 0.85)     # 襟からのぞく綿


def build_otama():
    """
    眠り病から目覚めたばかりの村人。肩に掛けたかいまきで上半身を
    まるく大きくし、そこから細い脚と半目の顔をのぞかせる。
    """
    name = "otama"
    body, joints, bones = build_base(name, OTAMA)

    head = joints["head"]
    neck = joints["neck"]
    chest = joints["chest"]
    hip = joints["hip"]
    knee = joints["knee.L"]
    shoulder = joints["shoulder.L"]

    mats = palette("otama", {
        "skin": (OTAMA_SKIN, 0.74),
        "wear": (OTAMA_WEAR, 0.88),
        "bottom": (OTAMA_BOTTOM, 0.88),
        "shoe": (OTAMA_SHOE, 0.70),
        "hair": (OTAMA_HAIR, 0.86),
        "kaimaki": (OTAMA_KAIMAKI, 0.93),   # 綿入れなので艶を持たせない
        "lining": (OTAMA_LINING, 0.90),
        "cotton": (OTAMA_COTTON, 0.95),
        "eye": ((0.15, 0.13, 0.14), 0.30),
    })

    # 寝間着の裾は膝の下。cuff を細く取って前腕から先を素肌にする(袖の
    # 境目が腕を縦に切ると、目立つ階段状の縫い目になってしまうため)。
    # 生え際の塗り分けは、この下で被せる髪の殻の裏当てとして残しておく
    C.assign_materials_by_region(
        body,
        [mats["skin"], mats["wear"], mats["bottom"], mats["shoe"], mats["hair"]],
        garment_classifier(
            joints,
            hem=knee.z - 0.014,
            collar=neck.z - 0.012,
            cuff=0.148,
            cap=head.z + 0.045,
            cap_slope=0.50,
        ),
    )

    extras: list = []

    # ---- 髪。塗り分けだけで生え際を作ると、面の中心で判定するぶん輪郭が
    # 階段状にギザつく。頭より一回り大きい殻を後ろへずらして被せると、
    # 顔の側は頭蓋の内側に潜って見えなくなり、生え際がなめらかに出る
    hair = C.uv_sphere("otama_hair", (0.0, head.y + 0.015, head.z + 0.045), 1.0,
                       segments=16, rings=11, scale=(0.122, 0.108, 0.098))
    C.assign_material(hair, mats["hair"])
    extras.append(hair)

    # ---- 顔。半目(まぶたが重く垂れて、下に細い線だけがのぞく)
    face_y = head.y - 0.098
    for side in (-1.0, 1.0):
        eye_x = 0.052 * side
        extras.append(eye_slit(
            f"otama_eye{side}", (eye_x, face_y - 0.004, head.z + 0.010),
            width=0.060, material=mats["eye"], tilt=6.0 * side,
        ))
        # 垂れた上まぶた。目の線より**細く**した肌色の庇をすぐ上にかぶせる。
        # 線より太いと化粧のように浮くので、幅も厚みも目の線に負けさせる
        lid = C.box(f"otama_lid{side}", (0.0, 0.0, 0.0),
                    (0.054, 0.026, 0.015), bevel=0.005)
        lid.rotation_euler = (0.0, math.radians(9.0 * side), 0.0)
        lid.location = Vector((eye_x, face_y + 0.010, head.z + 0.024))
        C.assign_material(lid, mats["skin"])
        extras.append(lid)

        # 眉。細く短く、目尻側を下げて、力の抜けた寝起きの顔にする
        brow = C.box(f"otama_brow{side}", (0.0, 0.0, 0.0),
                     (0.036, 0.012, 0.006), bevel=0.002)
        brow.rotation_euler = (0.0, math.radians(8.0 * side), 0.0)
        brow.location = Vector((eye_x, face_y + 0.012, head.z + 0.044))
        C.assign_material(brow, mats["hair"])
        extras.append(brow)

    nose = C.uv_sphere("otama_nose", (0.0, face_y - 0.008, head.z - 0.020), 0.021,
                       segments=12, rings=8, scale=(0.85, 1.15, 0.85))
    C.assign_material(nose, mats["skin"])
    extras.append(nose)

    # 半分開いた口。まだ寝ぼけている記号として、閉じずに小さく開けておく
    mouth = C.box("otama_mouth", (0.0, face_y - 0.002, head.z - 0.052),
                  (0.026, 0.014, 0.013), bevel=0.005)
    C.assign_material(mouth, mats["eye"])
    extras.append(mouth)

    # ---- 寝癖。頭の輪郭を左右非対称に崩す。放射状に立てると剣山になるので、
    # 「片側だけ」に寄せて、寝押しで潰れた側と跳ねた側を作る
    skull = Vector((0.0, head.y + 0.015, head.z + 0.045))
    for i, (direction, length, thick) in enumerate((
        ((0.46, 0.68, 0.57), 0.084, 0.032),    # 左後ろへ大きく跳ねた一房
        ((0.78, 0.56, 0.28), 0.062, 0.026),    # その根元から分かれた小さな房
        ((-0.20, 0.90, 0.38), 0.054, 0.024),   # 後頭部の寝押し跡
    )):
        d = Vector(direction).normalized()
        tuft = C.cone(f"otama_tuft{i}", (0.0, 0.0, 0.0),
                      radius_bottom=thick, radius_top=thick * 0.34,
                      depth=length, segments=8)
        # 原点で作る → 回す → 置く。先に置いてから回すと原点まわりに飛ぶ
        tuft.rotation_euler = Vector((0.0, 0.0, 1.0)).rotation_difference(d).to_euler()
        tuft.location = skull + d * (0.086 + length * 0.28)
        C.assign_material(tuft, mats["hair"])
        extras.append(tuft)

    # 割れた前髪。幅も角度も高さも違う房を3つ額に垂らす。一枚の板にすると
    # 眉の上に黒い帯が渡ってしまうので、房ごとに分けて隙間から額を見せる
    for i, (px, tilt, width, pz) in enumerate((
        (-0.048, 21.0, 0.042, 0.082),
        (-0.004, -13.0, 0.036, 0.068),
        (+0.046, 7.0, 0.032, 0.078),
    )):
        bang = C.box(f"otama_bang{i}", (0.0, 0.0, 0.0), (width, 0.034, 0.040),
                     bevel=0.008)
        bang.rotation_euler = (0.0, math.radians(tilt), 0.0)
        bang.location = Vector((px, head.y - 0.092, head.z + pz))
        C.assign_material(bang, mats["hair"])
        extras.append(bang)

    # ---- かいまき。肩に掛けた綿入りの寝具。この村人の輪郭の主役。
    #
    # 板や筒で作ると、寝具ではなく看板か合羽に見えてしまった。綿入れは
    # 角のない塊なので、**まるい塊をいくつも重ねて**上半身をぼってりと
    # 大きくし、胸の中央だけ空けて寝間着をのぞかせる。腕は寝具の外側に
    # 出して、前で寝具を抱えている形にする。
    # 塊は左右で対にせず、肩・背・腰・前の4段に分ける。左右一対の丸みを
    # 胸の高さに置くと体つきの記号に見えてしまうので、前は1つにまとめる
    for tag, (cx, cy, cz), face, (sx, sy, sz) in (
        ("shoulderL", (+0.118, chest.y + 0.004, shoulder.z - 0.008), "kaimaki",
         (0.106, 0.086, 0.098)),
        ("shoulderR", (-0.118, chest.y + 0.004, shoulder.z - 0.008), "kaimaki",
         (0.106, 0.086, 0.098)),
        ("back", (0.000, chest.y + 0.062, chest.z - 0.030), "kaimaki",
         (0.144, 0.068, 0.110)),
        ("clutch", (0.000, chest.y - 0.062, hip.z + 0.106), "kaimaki",
         (0.138, 0.058, 0.094)),   # 胸の下で抱え込んだ分
        # 腰の下で裏返って垂れた裾。ここだけ裏地の色にすると、綿の塊ではなく
        # 「めくれた掛け布団を掛けている」と読める
        ("tail", (0.000, chest.y + 0.056, hip.z + 0.034), "lining",
         (0.134, 0.058, 0.090)),
    ):
        blob = C.uv_sphere(f"otama_kaimaki_{tag}", (cx, cy, cz), 1.0,
                           segments=12, rings=8, scale=(sx, sy, sz))
        C.assign_material(blob, mats[face])
        extras.append(blob)

    # 襟からのぞく綿。首のうしろ寄りに一周させると、綿入れの厚みが出つつ
    # あごの下に白い玉が居座らない
    extras += fluff_ring("otama_cotton", (0.0, neck.y + 0.008, neck.z - 0.028),
                         radius=0.082, blob=0.024, material=mats["cotton"], count=8)

    # 寝間着の帯。腰の一本で、丸い上半身と細い脚を区切る
    belt = C.cylinder("otama_belt", (0.0, 0.0, hip.z + 0.030), 0.108, 0.028,
                      segments=18)
    C.assign_material(belt, mats["lining"])
    extras.append(belt)

    return finish(name, body, extras, joints, bones)


def otama_animations():
    """
    idle: ゆっくりした呼吸。長い周期の後半で、こっくりと船を漕いで
          はっと持ち上げる(あごが落ちる → 急に戻る → 少し行き過ぎて戻る)。
    talk: 話しかけられて目を開き、背筋を伸ばしてからうなずく。
          ひな形のタメ(6f)・ツメ(8f)にそのまま「はっとする」動きを乗せる。
    """
    # かいまきの前を軽く押さえた手。腕はほとんど開かない
    hold = {ARM_L: (0, 0, 2.0), ARM_R: (0, 0, -2.0),
            FORE_L: (-14, 0, 0), FORE_R: (-14, 0, 0)}
    doze = {SPINE: (4.0, 0, 0), NECK: (13.0, 0, 0)}
    return [
        ("idle", idle_clip(length=64, breath=1.8, arm=2.0, head_lag=3, extra={
            1: hold,
            32: {**hold, FORE_L: (-15.5, 0, 0), FORE_R: (-15.5, 0, 0)},
            # 船を漕ぐ。ゆっくり落ちて、急に戻す
            40: {SPINE: (1.6, 0, 0)},
            43: {NECK: (5.0, 0, 0)},
            48: {**doze, ARM_L: (0, 0, 1.0), ARM_R: (0, 0, -1.0)},
            51: {SPINE: (-1.2, 0, 0)},                  # はっと戻る
            53: {NECK: (-4.0, 0, 0)},                   # 行き過ぎ
            58: {SPINE: (0, 0, 0), NECK: (1.5, 0, 0)},  # ゆっくり収まる
            64: hold,
        })),
        ("talk", talk_clip(length=34, nod=12.0, lean=3.2, arm=2.0, extra={
            # 話しかけられた瞬間はまだ寝ぼけている
            1: {**hold, **doze},
            6: {SPINE: (-6.0, 0, 0)},                   # 背筋を伸ばす(ツメ)
            8: {NECK: (-8.0, 0, 0)},                    # はっと顔を上げる
            10: {SPINE: (3.2, 0, 0), ARM_L: (0, 0, 3.0), ARM_R: (0, 0, -3.0)},
            34: hold,
        })),
    ]


# =========================================================================== 登録

# 名前 → (造形関数, アニメーション関数)。村人を足すときはここに1行。
# `tools/build_models.py` がこの辞書をそのまま拾う
VILLAGERS = {
    "mogurabaa": (build_mogurabaa, mogurabaa_animations),
    "gendo": (build_gendo, gendo_animations),
    "fuku": (build_fuku, fuku_animations),
    "pochi": (build_pochi, pochi_animations),
    "otama": (build_otama, otama_animations),
}


def make(name: str):
    build_fn, anim_fn = VILLAGERS[name]
    objs, armature = build_fn()
    clips = anim_fn()
    got = tuple(clip_name for clip_name, _ in clips)
    if got != CLIPS:
        raise ValueError(f"{name}: 村人のクリップは {CLIPS} に揃える(今は {got})")
    for clip_name, keyframes in clips:
        C.add_action(armature, clip_name, keyframes)
    return objs


if __name__ == "__main__":
    import sys

    for target in sys.argv[1:] or list(VILLAGERS):
        C.reset_scene()
        objs = make(target)
        print(f"{target}: 三角形 {C.tri_count(objs)}")
        C.render_preview(target, objs)
        C.export_glb(target, objs)
