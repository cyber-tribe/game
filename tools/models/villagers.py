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


# =========================================================================== 登録

# 名前 → (造形関数, アニメーション関数)。村人を足すときはここに1行。
# `tools/build_models.py` がこの辞書をそのまま拾う
VILLAGERS = {
    "mogurabaa": (build_mogurabaa, mogurabaa_animations),
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
