"""
モデリング共通基盤。

Blender を GUI ではなく Python から動かしているだけで、やっていることは
通常のモデリングと変わらない。キャラクターは「関節の位置と太さ」を定義して
Skin モディファイアで皮を張り、サブディビジョンで滑らかにする。これは Blender で
生物のベースメッシュを作るときの定石で、結果は継ぎ目のない一枚のメッシュになる。

小物のような硬い形状は bmesh で直接ポリゴンを組む。

    joints = {...}   関節の座標
    radii  = {...}   その関節での太さ
    bones  = [...]   関節をつなぐ骨
        ↓  build_skinned()
    一枚の連続したメッシュ
        ↓  build_armature() + 自動ウェイト
    動かせるキャラクター
        ↓  add_action()
    待機 / 歩行 / 攻撃 / 被弾 / 消滅
        ↓  export_glb()
    public/models/*.glb
"""

from __future__ import annotations

import math
import os
from typing import Iterable, Sequence

# bpy を最初に読み込む。bmesh と mathutils は bpy が初期化されて初めて import できる
import bpy  # isort: skip
import bmesh  # isort: skip
from mathutils import Euler, Vector  # isort: skip

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(REPO_ROOT, "public", "models")
PREVIEW_DIR = os.path.join(REPO_ROOT, "tools", "preview")


# --------------------------------------------------------------------------- 基本

def reset_scene() -> None:
    """まっさらなシーンから作り始める。前のモデルの残骸を持ち越さない。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.06, 0.09, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = world


def srgb_to_linear(c: float) -> float:
    """
    Blender のベースカラーはリニア値。カラーピッカーで見慣れた sRGB の数値を
    そのまま書くと、描画結果は明るく色あせて見える。指定はすべて sRGB で行い、
    ここで変換する。
    """
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_material(name: str, color, roughness: float = 0.7, metallic: float = 0.0,
                  emission: float = 0.0) -> bpy.types.Material:
    """Principled BSDF のマテリアルを1つ作る。color は 0〜1 の sRGB。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    r, g, b = (srgb_to_linear(c) for c in color)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        bsdf.inputs["Emission Color"].default_value = (r, g, b, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def assign_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def assign_materials_by_region(obj: bpy.types.Object, mats: Sequence[bpy.types.Material],
                               classify) -> None:
    """
    一枚のメッシュを部位ごとに塗り分ける。classify は面の中心座標を受け取って
    マテリアルの番号を返す。肌・服・ズボンのように地続きの体を色分けするのに使う。
    """
    obj.data.materials.clear()
    for mat in mats:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = classify(poly.center)


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# --------------------------------------------------------------------------- 左右対称

def mirrored(joints: dict[str, Sequence[float]]) -> dict[str, Vector]:
    """
    名前が .L で終わる関節から .R を自動生成する。
    Mirror モディファイアだと中心線の頂点が重なって荒れるので、
    最初から左右ぶんの関節を持たせてしまう。
    """
    out: dict[str, Vector] = {}
    for name, pos in joints.items():
        v = Vector(pos)
        out[name] = v
        if name.endswith(".L"):
            out[name[:-2] + ".R"] = Vector((-v.x, v.y, v.z))
    return out


def mirrored_radii(radii: dict[str, float]) -> dict[str, float]:
    out: dict[str, float] = {}
    for name, r in radii.items():
        out[name] = r
        if name.endswith(".L"):
            out[name[:-2] + ".R"] = r
    return out


def mirrored_bones(bones: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for a, b in bones:
        out.append((a, b))
        if a.endswith(".L") or b.endswith(".L"):
            out.append((a[:-2] + ".R" if a.endswith(".L") else a,
                        b[:-2] + ".R" if b.endswith(".L") else b))
    return out


# --------------------------------------------------------------------------- キャラの造形

def build_skinned(
    name: str,
    joints: dict[str, Vector],
    bones: Sequence[tuple[str, str]],
    radii: dict[str, float],
    root: str,
    subsurf: int = 2,
    smooth: bool = True,
) -> bpy.types.Object:
    """
    関節をつないだ骨組みに Skin モディファイアで皮を張り、
    サブディビジョンで丸めて一枚の連続メッシュにする。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    order = list(joints.keys())
    index = {n: i for i, n in enumerate(order)}
    mesh.from_pydata([joints[n] for n in order], [(index[a], index[b]) for a, b in bones], [])
    mesh.update()

    skin = obj.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = smooth
    layer = mesh.skin_vertices[0].data
    for n, i in index.items():
        r = radii.get(n, 0.1)
        layer[i].radius = (r, r)
    layer[index[root]].use_root = True

    if subsurf > 0:
        sub = obj.modifiers.new("sub", "SUBSURF")
        sub.levels = subsurf
        sub.render_levels = subsurf

    activate(obj)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    if smooth:
        activate(obj)
        bpy.ops.object.shade_smooth()
    return obj


def uv_sphere(name: str, center, radius: float, segments: int = 24, rings: int = 16,
              scale=(1.0, 1.0, 1.0)) -> bpy.types.Object:
    """目玉や実など、丸いものを1つ作る。"""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    activate(obj)
    bpy.ops.object.shade_smooth()
    return obj


# --------------------------------------------------------------------------- 小物の造形

def box(name: str, center, size, bevel: float = 0.0, bevel_segments: int = 2,
        subsurf: int = 0) -> bpy.types.Object:
    """面取りした直方体。壁や箱状の小物に使う。"""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            offset=bevel,
            segments=bevel_segments,
            affect="EDGES",
            profile=0.5,
        )
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()

    if subsurf > 0:
        activate(obj)
        sub = obj.modifiers.new("sub", "SUBSURF")
        sub.levels = subsurf
        bpy.ops.object.modifier_apply(modifier="sub")
    return obj


def cylinder(name: str, center, radius: float, depth: float, segments: int = 20,
             axis: str = "Z", bevel: float = 0.0, smooth: bool = True) -> bpy.types.Object:
    """
    円柱。smooth=False にすると側面の平らな面がそのまま見える。
    面数を落としたうえでフラットにすると、樽の板張りのような表現になる。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=depth,
    )
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                        offset=bevel, segments=2, affect="EDGES", profile=0.5)
    if axis == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Euler((0, math.radians(90), 0)).to_matrix())
    elif axis == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Euler((math.radians(90), 0, 0)).to_matrix())
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        activate(obj)
        bpy.ops.object.shade_smooth()
    return obj


def cone(name: str, center, radius_bottom: float, radius_top: float, depth: float,
         segments: int = 20) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius_bottom, radius2=radius_top, depth=depth)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    activate(obj)
    bpy.ops.object.shade_smooth()
    return obj


def join(objs: Sequence[bpy.types.Object], name: str) -> bpy.types.Object:
    """複数オブジェクトを1つに統合する。マテリアルはスロットとして保たれる。"""
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    result.name = name
    result.data.name = name
    return result


# --------------------------------------------------------------------------- リグ

def build_armature(
    name: str,
    joints: dict[str, Vector],
    bones: Sequence[tuple[str, str]],
    mesh_obj: bpy.types.Object,
    root: str,
) -> bpy.types.Object:
    """
    関節をそのままボーンにしてアーマチュアを組み、自動ウェイトでメッシュを結びつける。
    骨の名前は「親関節-子関節」。アニメーション定義側ではこの名前を使う。
    """
    armature = bpy.data.armatures.new(name + "_arm")
    arm_obj = bpy.data.objects.new(name + "_arm", armature)
    bpy.context.collection.objects.link(arm_obj)

    activate(arm_obj)
    bpy.ops.object.mode_set(mode="EDIT")
    created: dict[str, bpy.types.EditBone] = {}
    for parent, child in bones:
        bone = armature.edit_bones.new(bone_name(parent, child))
        bone.head = joints[parent]
        bone.tail = joints[child]
        created[bone_name(parent, child)] = bone

    # 根本の関節から複数の骨が出ている場合(胴と両脚など)、最初の1本を幹として扱い
    # 残りをそこにぶら下げる。こうしないと骨がばらばらの根になってしまう。
    trunk_key = next(
        (bone_name(p, c) for p, c in bones if p == root),
        None,
    )

    for parent, child in bones:
        key = bone_name(parent, child)
        bone = created[key]
        # 親関節を自分の子として持つ骨があれば、それが素直な親
        upstream = next((bone_name(p2, c2) for p2, c2 in bones if c2 == parent), None)
        if upstream is not None:
            bone.parent = created[upstream]
            bone.use_connect = True
        elif trunk_key is not None and key != trunk_key:
            bone.parent = created[trunk_key]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    return arm_obj


def bone_name(parent: str, child: str) -> str:
    return f"{parent}-{child}"


# --------------------------------------------------------------------------- アニメーション

# 1クリップぶんのキーフレーム。
#   frames: [(フレーム番号, {ボーン名: (回転XYZ度) または {'rot':..., 'loc':...}}), ...]
Pose = dict[str, object]
Keyframe = tuple[int, Pose]


def add_action(arm_obj: bpy.types.Object, name: str, keyframes: Sequence[Keyframe]) -> None:
    """
    ポーズをキーフレームに焼いてアクションを作り、NLA トラックに積む。
    glTF は NLA に積まれたアクションをそれぞれ別のクリップとして書き出してくれる。
    """
    activate(arm_obj)
    bpy.ops.object.mode_set(mode="POSE")

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    if arm_obj.animation_data is None:
        arm_obj.animation_data_create()
    arm_obj.animation_data.action = action

    # クリップごとに前のポーズが残らないよう、毎回リセットしてから打つ
    for frame, pose in keyframes:
        bpy.context.scene.frame_set(frame)
        reset_pose(arm_obj)
        for bone_key, value in pose.items():
            pbone = arm_obj.pose.bones.get(bone_key)
            if pbone is None:
                raise KeyError(f"{arm_obj.name} にボーン '{bone_key}' がない: "
                               f"{[b.name for b in arm_obj.pose.bones]}")
            rot = value if isinstance(value, (tuple, list)) else value.get("rot", (0, 0, 0))
            pbone.rotation_mode = "XYZ"
            pbone.rotation_euler = Euler([math.radians(a) for a in rot])
            if isinstance(value, dict):
                if "loc" in value:
                    pbone.location = Vector(value["loc"])
                if "scale" in value:
                    pbone.scale = Vector(value["scale"])
        for pbone in arm_obj.pose.bones:
            pbone.keyframe_insert("rotation_euler", frame=frame)
            pbone.keyframe_insert("location", frame=frame)
            pbone.keyframe_insert("scale", frame=frame)

    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(keyframes[0][0]), action)
    strip.name = name
    arm_obj.animation_data.action = None

    bpy.ops.object.mode_set(mode="OBJECT")


def reset_pose(arm_obj: bpy.types.Object) -> None:
    for pbone in arm_obj.pose.bones:
        pbone.rotation_mode = "XYZ"
        pbone.rotation_euler = Euler((0, 0, 0))
        pbone.location = Vector((0, 0, 0))
        pbone.scale = Vector((1, 1, 1))


# --------------------------------------------------------------------------- 書き出し

def bake_ao_to_vertex_colors(obj: bpy.types.Object, samples: int = 64, distance: float = 0.25) -> None:
    """
    AO(環境遮蔽)をカラー属性 'ao' に焼く(plan/game/archive/ao-vertex-color-bake.md)。
    UVアンラップ不要。肋骨の隙間・耳の付け根・装甲の継ぎ目のような近距離の
    遮蔽だけを拾い、単色ベタ塗りに陰影の密度を足す。export_glb() から
    全モデル共通で呼ぶので、個々のモデルスクリプト側の変更は要らない。
    """
    mesh = obj.data
    if "ao" not in mesh.color_attributes:
        mesh.color_attributes.new("ao", type="BYTE_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = mesh.color_attributes["ao"]

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.render.bake.target = "VERTEX_COLORS"
    scene.world.light_settings.distance = distance

    bpy.ops.object.select_all(action="DESELECT")
    activate(obj)
    bpy.ops.object.bake(type="AO")


def export_glb(name: str, objs: Sequence[bpy.types.Object]) -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)
    path = os.path.join(MODEL_DIR, f"{name}.glb")

    for o in objs:
        if o.type == "MESH":
            bake_ao_to_vertex_colors(o)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        # 既定の"MATERIAL"は、マテリアルのノードツリーがカラー属性を
        # 参照していないと書き出さない。AOは見た目の演算(three.js側の
        # vertexColors)に回すだけでBlenderのマテリアルには繋いでいないため、
        # アクティブなカラー属性を無条件で書き出す"ACTIVE"にする
        export_vertex_color="ACTIVE",
    )
    return path


# --------------------------------------------------------------------------- プレビュー

def render_preview(name: str, objs: Sequence[bpy.types.Object], samples: int = 48,
                   size=(420, 520), yaw: float = 34.0, pitch: float = 11.0,
                   zoom: float = 1.05) -> str:
    """
    造形を目で確かめるための静止画。三点照明で形が読み取れるようにし、
    カメラは対象のバウンディングボックスに合わせて自動で引く。
    """
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    path = os.path.join(PREVIEW_DIR, f"{name}.png")

    # アクションを積んだあとだと NLA が効いて最後のポーズで固まってしまうので、
    # プレビューのあいだだけトラックを黙らせて素立ちに戻す
    muted = []
    for obj in objs:
        if obj.type != "ARMATURE" or obj.animation_data is None:
            continue
        for track in obj.animation_data.nla_tracks:
            if not track.mute:
                track.mute = True
                muted.append(track)
        obj.animation_data.action = None
        activate(obj)
        bpy.ops.object.mode_set(mode="POSE")
        reset_pose(obj)
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    lo, hi = bounds(objs)
    center = (lo + hi) * 0.5
    extent = max((hi - lo).length, 0.5)
    distance = extent * zoom + 1.2

    yaw_r = math.radians(yaw)
    pitch_r = math.radians(pitch)
    offset = Vector((
        math.sin(yaw_r) * math.cos(pitch_r),
        -math.cos(yaw_r) * math.cos(pitch_r),
        math.sin(pitch_r) + 0.25,
    )) * distance

    bpy.ops.object.camera_add(location=center + offset)
    cam = bpy.context.object
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 60

    # キーライト・フィルライト・リムライトの三点
    add_sun(center + Vector((3, -4, 6)), center, 2.4)
    add_area(center + Vector((-3.5, -2.5, 1.5)), center, 40.0, size=4.0)
    add_area(center + Vector((0.5, 4.0, 2.5)), center, 26.0, size=3.0)

    # 床。影が落ちると立体感が分かりやすい
    floor = box("preview_floor", (center.x, center.y, lo.z - 0.02), (8, 8, 0.02))
    assign_material(floor, make_material("preview_floor_mat", (0.16, 0.17, 0.2), roughness=0.9))

    scene = bpy.context.scene
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    # 既定の AgX は色を大きく寝かせるので、マテリアルに指定した色をそのまま確認できるよう
    # プレビューでは標準の変換にする
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

    # 後始末。プレビュー用の小道具を書き出しに混ぜない
    for obj in (cam, floor):
        bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    for track in muted:
        track.mute = False
    return path


def add_sun(location: Vector, target: Vector, energy: float) -> None:
    bpy.ops.object.light_add(type="SUN", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.angle = math.radians(15)
    light.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()


def add_area(location: Vector, target: Vector, energy: float, size: float) -> None:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.size = size
    light.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()


def bounds(objs: Sequence[bpy.types.Object]) -> tuple[Vector, Vector]:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        if obj.type not in {"MESH"}:
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, world.x), min(lo.y, world.y), min(lo.z, world.z)))
            hi = Vector((max(hi.x, world.x), max(hi.y, world.y), max(hi.z, world.z)))
    if lo.x > hi.x:
        return Vector((0, 0, 0)), Vector((1, 1, 1))
    return lo, hi


def tri_count(objs: Sequence[bpy.types.Object]) -> int:
    total = 0
    for obj in objs:
        if obj.type != "MESH":
            continue
        for poly in obj.data.polygons:
            total += max(1, len(poly.vertices) - 2)
    return total
