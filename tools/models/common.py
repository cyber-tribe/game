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

import colorsys
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


def linear_to_srgb(c: float) -> float:
    """`srgb_to_linear`の逆関数。`bake_ao_to_texture`が使う: `make_material`が
    Base Colorに保持しているのはリニア値だが、ベイクしたテクスチャの
    ピクセルバッファはBlenderの保存/glTF書き出し時にsRGB符号化として
    そのまま扱われる(再エンコードされない)。リニア値のまま掛け合わせると、
    書き出し後にglTFローダー側でsRGB→リニアのデコードがもう一段掛かり、
    二重にガンマがかかって暗部が破綻する(実機playtestで発覚)。"""
    c = max(0.0, min(1.0, c))
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def make_material(name: str, color, roughness: float = 0.7, metallic: float = 0.0,
                  emission: float = 0.0, alpha: float = 1.0) -> bpy.types.Material:
    """
    Principled BSDF のマテリアルを1つ作る。color は 0〜1 の sRGB。

    alpha < 1.0 で半透明になる。glTFにはalphaMode=BLENDとして書き出され、
    エンジン側のトゥーン変換(src/view/assets.ts)がtransparent/opacityを
    引き継ぐので、ゲーム内でも半透明で描画される(ぷるんの体など)。
    """
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
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        # Blenderのバージョンで属性名が異なるため両対応(glTF出力の
        # alphaMode判定に使われる)
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
    return mat


RGB = tuple[float, float, float]


def _hue_lerp(h: float, target: float, t: float) -> float:
    """
    色相環(0〜1が一周)を最短経路でtだけ進める。単純な `h + (target-h)*t`
    は、例えば赤(h≈0)から紫(h≈0.72)へ寄せたいときに遠回り(黄→緑→水色
    経由)してしまう。差分を一度 -0.5〜0.5 に畳んでから進めることで、
    常に円環上の近い方(この例だと赤→マゼンタ→紫)を通るようにする。
    """
    delta = (target - h + 0.5) % 1.0 - 0.5
    return (h + delta * t) % 1.0


def shade_tint(color: RGB, amount: float = 0.35) -> RGB:
    """
    影の色(plan/models/archive/visual-quality-uplift.md施策B「色相シフトの
    規律」)。単に暗くするのではなく、色相を青紫方向(HSVで約260度)へ
    寄せながら明度を落とす。上質なスタイライズドでは「影は寒色へ」ずらす
    のが定石で、単色の濃淡だけより画面に深みが出る。

    `amount`は0(元色のまま)〜1(青紫へ強く寄る)。
    """
    h, s, v = colorsys.rgb_to_hsv(*color)
    h = _hue_lerp(h, 0.72, amount * 0.5)
    s = min(1.0, s * (1 + amount * 0.15))
    v = v * (1 - amount * 0.5)
    return colorsys.hsv_to_rgb(h, s, v)


def highlight_tint(color: RGB, amount: float = 0.35) -> RGB:
    """
    ハイライトの色(`shade_tint`と対になる「光は暖色へ」)。色相を黄橙方向
    (HSVで約40度)へ寄せながら明度を上げ、彩度をわずかに落とす
    (白飛びに寄せず、色味を残したまま明るくするため)。
    """
    h, s, v = colorsys.rgb_to_hsv(*color)
    h = _hue_lerp(h, 0.11, amount * 0.5)
    s = s * (1 - amount * 0.2)
    v = min(1.0, v * (1 + amount * 0.4) + amount * 0.1)
    return colorsys.hsv_to_rgb(h, s, v)


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

def loft(name: str, rings, segments: int = 16, smooth: bool = True,
         cap_top: bool = True, cap_bottom: bool = True) -> "bpy.types.Object":
    """
    断面リング(z昇順の (z, rx, ry, cx, cy))を積み、側面を貼った回転体風
    メッシュを作る。設定画の三面図から「高さzでの横幅rx(正面図)・
    奥行きry(側面図)・中心のずれ」を測ってそのまま並べられるのが利点
    (ガルドの専用メッシュ化で確立した手法の共有版。設定画ベースの
    再設計キャラはこれで部位を組む)。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    angles = [i * math.tau / segments for i in range(segments)]
    ring_verts = []
    for z, rx, ry, cx, cy in rings:
        ring_verts.append([
            bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
            for a in angles
        ])
    for lower_ring, upper_ring in zip(ring_verts, ring_verts[1:]):
        for i in range(segments):
            bm.faces.new((lower_ring[i], lower_ring[(i + 1) % segments],
                          upper_ring[(i + 1) % segments], upper_ring[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(ring_verts[0])))
    if cap_top:
        bm.faces.new(ring_verts[-1])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


def curve_tube(name: str, points, radii, resolution: int = 4,
               bevel_resolution: int = 1) -> "bpy.types.Object":
    """
    ベジェカーブ+点ごとの半径テーパーの管。曲がりながら先細る形
    (尻尾・髪の房・ひげ等)を数点の制御点だけで作れる
    (ガルドの髪で確立した手法の共有版)。メッシュへ変換して返す。
    """
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 1.0
    curve.bevel_resolution = bevel_resolution
    curve.resolution_u = resolution
    curve.fill_mode = "FULL"
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, co, r in zip(spline.bezier_points, points, radii):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.radius = r
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


# ------------------------------------------- スカルプト+テクスチャ焼き込み
# plan/models/archive/sculpt-texture-pipeline.md。「高密度に彫る→ゲーム用へ削減→
# 細部はテクスチャに描く」のMeshy式を自前実装した共有ヘルパー群

def sculpt_merge(name: str, objs, voxel: float = 0.004,
                 out_voxel: float | None = None) -> "bpy.types.Object":
    """
    部位プリミティブ群をリメッシュで1つの連続メッシュへ融合する。
    join だけでは残る継ぎ目・貫通が消え、彫刻のように滑らかにつながる。
    voxelは形を融合する解像度、out_voxelは出力メッシュの解像度
    (ゲーム用の目標三角形数に合わせて粗くする。Noneならvoxelのまま)。
    出力は均一な四角形主体のトポロジなので、Decimateの細長三角形による
    シルエット荒れが起きない。
    """
    merged = join(objs, name)
    activate(merged)
    # 法線を外向きへ揃えてからリメッシュする。方式は旧Remeshモディファイア
    # (SMOOTH)を使う: bpy.ops.object.voxel_remesh()はスキンモディファイア
    # 由来の自己交差を含む入力で表面が穴だらけになった(実測)のに対し、
    # SMOOTHモードは滑らかな外皮を安定して生成し、
    # use_remove_disconnectedが微小断片も除去してくれる
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    lo, hi = bounds([merged])
    extent = max(hi[i] - lo[i] for i in range(3))
    depth = max(6, min(9, math.ceil(math.log2(max(extent / voxel, 2.0)))))
    mod = merged.modifiers.new("remesh", "REMESH")
    mod.mode = "SMOOTH"
    mod.octree_depth = depth
    mod.use_remove_disconnected = True
    bpy.ops.object.modifier_apply(modifier="remesh")
    # SMOOTHの出力は非多様体エッジを残す(実測323本)ので、清浄になった
    # 外皮へ改めてボクセルリメッシュを重ねて完全な多様体にする
    # (OpenVDBは自己交差の無い入力なら常に多様体を出力する)
    merged.data.remesh_voxel_size = out_voxel or voxel
    bpy.ops.object.voxel_remesh()
    # 法線を外向きに揃える(QuadriFlowは向きの不整合を拒否する)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # リメッシュは入力の自己交差から内部の泡・微小片を残すことがある
    # (計測: ツブテガエルで最大シェル1つ+48個の断片)。外皮である
    # 最大の連結成分だけを残す
    bm = bmesh.new()
    bm.from_mesh(merged.data)
    bm.verts.ensure_lookup_table()
    seen: set[int] = set()
    components: list[list] = []
    for v in bm.verts:
        if v.index in seen:
            continue
        comp = []
        stack = [v]
        while stack:
            cur = stack.pop()
            if cur.index in seen:
                continue
            seen.add(cur.index)
            comp.append(cur)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in seen:
                    stack.append(other)
        components.append(comp)
    if len(components) > 1:
        largest = max(components, key=len)
        doomed = [v for comp in components if comp is not largest for v in comp]
        bmesh.ops.delete(bm, geom=doomed, context="VERTS")
        bm.to_mesh(merged.data)
    bm.free()
    for poly in merged.data.polygons:
        poly.use_smooth = True
    return merged


def decimate_to(obj: "bpy.types.Object", target_tris: int) -> None:
    """三角形数が目標以下になるまでDecimate(collapse)をかける。"""
    activate(obj)
    current = len(obj.data.loop_triangles) or sum(
        max(len(p.vertices) - 2, 1) for p in obj.data.polygons)
    if current <= target_tris:
        return
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = target_tris / current
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="dec")
    for poly in obj.data.polygons:
        poly.use_smooth = True


def quad_remesh(obj: "bpy.types.Object", target_faces: int) -> None:
    """
    QuadriFlowで均一な四角形トポロジへ再構成する(Meshyの
    Smart Topology相当)。Decimate(collapse)は細長い三角形を量産して
    シルエットが折り紙状に荒れるため、彫刻式パイプラインの削減は
    こちらを使う。入力は多様体であること(sculpt_mergeの出力は満たす)。

    QuadriFlowの事前検査(object_remesh.ccのmesh_is_manifold_consistent)
    は「compare_v3v3(頂点, 頂点, 1e-4f)」で零長エッジを判定する。距離では
    なく**各成分の差が1e-4未満**という絶対値の閾値なので、0.5ユニット級の
    キャラクターをボクセルリメッシュした出力に混ざる微小エッジ(実測3本)が
    1本でもあると、メッシュ全体が「manifold/consistent normalsでない」と
    いう紛らわしい警告で拒否される。事前に2e-4で溶接して微小エッジを
    畳んでおく(0.2mm相当。形状影響は事実上ゼロ)。
    """
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=2e-4)
    bpy.ops.object.mode_set(mode="OBJECT")
    result = bpy.ops.object.quadriflow_remesh(target_faces=target_faces)
    if "FINISHED" not in result:
        raise RuntimeError(
            f"{obj.name}: QuadriFlowが{result}を返した。微小エッジ溶接後も"
            "拒否される場合は、メッシュを一時的に拡大してから再挑戦する"
        )
    for poly in obj.data.polygons:
        poly.use_smooth = True


def smart_uv(obj: "bpy.types.Object") -> None:
    """Smart UV Projectで全面を展開する(ハードサーフェス向け)。"""
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")


def organic_uv(obj: "bpy.types.Object", axis: int = 2) -> None:
    """
    有機的な閉曲面向けのUV展開。法線の指定軸成分の符号が変わる稜線へ
    シームを引いて2枚に開き、角度ベースunwrap+pack_islandsで
    重なりなしに詰める。Smart UV Projectの微小島化(実測1,649島)も、
    平行投影の裏表衝突(triplanar_uvの弱点)も起こらない。
    axisは「模様の目立つ面をシームが横切らない」向きを選ぶ:
    既定のz(赤道)は背中に模様がある四足姿勢向け、y(前後split)は
    正面の顔・腹に模様がある直立姿勢向け。
    """
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    import bmesh as _bmesh
    bm = _bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    # 素の面法線で符号を取ると、凹凸でうねる面では境界付近の符号が
    # 細かく反転してUV島が数百の断片に割れる(断片の縁で膨張ハローが
    # 混ざり模様がちらつく)。法線を隣接面と平滑化してから符号を取り、
    # シームを1本の綺麗な稜線にする
    normals = {f.index: f.normal.copy() for f in bm.faces}
    for _ in range(8):
        smoothed = {}
        for f in bm.faces:
            acc = normals[f.index].copy()
            for e in f.edges:
                for f2 in e.link_faces:
                    if f2.index != f.index:
                        acc += normals[f2.index]
            if acc.length_squared > 1e-16:
                acc.normalize()
            smoothed[f.index] = acc
        normals = smoothed
    for e in bm.edges:
        lf = e.link_faces
        e.seam = len(lf) == 2 and \
            (normals[lf[0].index][axis] >= 0) != (normals[lf[1].index][axis] >= 0)
    bm.to_mesh(mesh)
    bm.free()
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.002)
    bpy.ops.uv.pack_islands(margin=0.015)
    bpy.ops.object.mode_set(mode="OBJECT")


def triplanar_uv(obj: "bpy.types.Object") -> None:
    """
    有機的な閉曲面向けの決定的なUV展開。Smart UV Projectは丸い体を
    数百〜数千の微小島に割り、低解像度テクスチャで模様が混線する
    (ツブテガエルで実測1,649島)。ここでは面の支配法線軸(±x/±y/±z)で
    6グループに分け、それぞれを3×2の矩形セルへ平行投影する。
    島は必ず6個以下で重ならない。裏表の重なりは同一セル内で起こり得るが、
    bake_albedoの色は3D位置から決まるため、近い色の領域同士なら無害。
    """
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active.data
    lo = Vector((min(v.co.x for v in mesh.vertices),
                 min(v.co.y for v in mesh.vertices),
                 min(v.co.z for v in mesh.vertices)))
    hi = Vector((max(v.co.x for v in mesh.vertices),
                 max(v.co.y for v in mesh.vertices),
                 max(v.co.z for v in mesh.vertices)))
    span = Vector((max(hi.x - lo.x, 1e-6), max(hi.y - lo.y, 1e-6),
                   max(hi.z - lo.z, 1e-6)))
    pad = 0.012
    for poly in mesh.polygons:
        n = poly.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        cell = axis * 2 + (1 if n[axis] < 0 else 0)
        col, row = cell % 3, cell // 3
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if axis == 0:
                u, w = (co.y - lo.y) / span.y, (co.z - lo.z) / span.z
            elif axis == 1:
                u, w = (co.x - lo.x) / span.x, (co.z - lo.z) / span.z
            else:
                u, w = (co.x - lo.x) / span.x, (co.y - lo.y) / span.y
            uv[li].uv = (
                (col + pad + u * (1.0 - 2 * pad)) / 3.0,
                (row + pad + w * (1.0 - 2 * pad)) / 2.0,
            )


def bake_albedo(obj: "bpy.types.Object", color_fn, size: int = 512,
                name: str = "albedo") -> "bpy.types.Image":
    """
    UV三角形を走査し、テクセルごとに3D位置を復元して
    color_fn(位置Vector, 面法線Vector)->(r,g,b) を評価、アルベド画像に
    描く。口の線・斑点・まだら等の「表面の模様」はジオメトリではなく
    ここで描く(浮きようがない)。領域の塗り分けには位置だけでなく
    面法線を使うこと(凹凸でうねる表面では位置のしきい値がテクセル
    単位で反転し、境界が市松にちらつく。法線は面ごとに一定なので
    境界が面の縁で綺麗に切れる)。
    UV島の外周は数px膨張させ、縮小表示時の継ぎ目の黒縁を防ぐ。
    """
    import numpy as np
    mesh = obj.data
    uv = mesh.uv_layers.active.data
    mesh.calc_loop_triangles()
    px = np.zeros((size, size, 4), dtype=np.float32)
    filled = np.zeros((size, size), dtype=bool)
    for tri in mesh.loop_triangles:
        uvs = [uv[li].uv for li in tri.loops]
        pos = [mesh.vertices[vi].co for vi in tri.vertices]
        tn = (pos[1] - pos[0]).cross(pos[2] - pos[0])
        if tn.length_squared > 1e-16:
            tn.normalize()
        xs = [u.x * size for u in uvs]
        ys = [u.y * size for u in uvs]
        x0, x1, x2 = xs
        y0, y1, y2 = ys
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-12:
            continue
        for py in range(max(0, int(min(ys))), min(size - 1, int(max(ys)) + 1) + 1):
            for pxi in range(max(0, int(min(xs))), min(size - 1, int(max(xs)) + 1) + 1):
                cx, cy = pxi + 0.5, py + 0.5
                l0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / d
                l1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / d
                l2 = 1.0 - l0 - l1
                if l0 < -0.08 or l1 < -0.08 or l2 < -0.08:
                    continue
                p = pos[0] * max(l0, 0.0) + pos[1] * max(l1, 0.0) + pos[2] * max(l2, 0.0)
                r, g, b = color_fn(p, tn)
                px[py, pxi] = (r, g, b, 1.0)
                filled[py, pxi] = True
    # 島の外周を膨張(未塗りの隣接テクセルへ色を広げる)
    for _ in range(4):
        grown = filled.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src_f = np.roll(filled, (dy, dx), axis=(0, 1))
            src_c = np.roll(px, (dy, dx), axis=(0, 1))
            take = src_f & ~grown
            px[take] = src_c[take]
            grown |= take
        filled = grown
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def make_textured_material(name: str, image: "bpy.types.Image",
                           roughness: float = 0.8) -> "bpy.types.Material":
    """Base Colorへ画像を接続した材質。エンジンのトゥーン変換はmapを引き継ぐ。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


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


def gem(name: str, center, radius: float, subdivisions: int = 1,
       scale=(1.0, 1.0, 1.0)) -> bpy.types.Object:
    """
    正二十面体ベースの結晶。面取りせずフラットシェードのまま使うと、
    丸い体表面に角のある硬い面を作る記号になる
    (plan/models/archive/silhouette-hard-surface-parts.md)。
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
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

    # 自動ウェイト(Bone Heat)は部品の多いメッシュで解を出せないことが
    # あり、しかも同じコードでも実行ごとに失敗数が変わる。無ウェイトの
    # 頂点はポーズ中に置き去りになり、全滅するとglTF書き出しがスキンを
    # 丸ごと落とす。ここで必ず救済しておく(preflight_checkが検査する)
    fix_orphan_weights(mesh_obj, joints, bones)
    return arm_obj


def fix_orphan_weights(
    mesh_obj: bpy.types.Object,
    joints: dict[str, Vector],
    bones: Sequence[tuple[str, str]],
) -> None:
    """
    どのボーンにも属さない頂点を、近い2本のボーンへ距離の逆二乗で按分して
    割り当てる(最寄り1本の剛体割り当てだと関節でちぎれて見えるため)。
    """
    segments = []
    for parent, child in bones:
        name = bone_name(parent, child)
        vg = mesh_obj.vertex_groups.get(name)
        if vg is None:
            vg = mesh_obj.vertex_groups.new(name=name)
        segments.append((vg, Vector(joints[parent]), Vector(joints[child])))

    def seg_dist(p: Vector, a: Vector, b: Vector) -> float:
        ab = b - a
        if ab.length_squared == 0.0:
            return (p - a).length
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (p - (a + ab * t)).length

    orphans = 0
    for v in mesh_obj.data.vertices:
        if any(g.weight > 0.001 for g in v.groups):
            continue
        ranked = sorted(segments, key=lambda s: seg_dist(v.co, s[1], s[2]))[:2]
        dists = [max(seg_dist(v.co, a, b), 1e-4) for _, a, b in ranked]
        inv = [1.0 / (d * d) for d in dists]
        total = sum(inv)
        for (vg, _, _), w in zip(ranked, inv):
            vg.add([v.index], w / total, "REPLACE")
        orphans += 1
    if orphans:
        print(f"  自動ウェイトの取りこぼし {orphans} 頂点を近傍ボーンへ按分した")


def bone_name(parent: str, child: str) -> str:
    return f"{parent}-{child}"


def parent_to_bone(obj: bpy.types.Object, armature: bpy.types.Object, bone: str) -> None:
    """
    obj をアーマチュアの特定ボーンへ剛体で追従させる(スキンウェイトを持たない
    「ボーンへの親化」)。目のような、変形せず頭の動きにそのまま追従するだけの
    部品に使う(plan/models/archive/eye-blink-liveliness.md)。現在のワールド
    変換は保たれる(keep_transform)。
    """
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    armature.data.bones.active = armature.data.bones[bone]
    bpy.ops.object.parent_set(type="BONE", keep_transform=True)


def mark_for_pin(obj: bpy.types.Object, group_name: str | None = None) -> str:
    """
    新しく作った硬い部品のオブジェクトに、印用の頂点グループを1つ付ける
    (plan/models/archive/silhouette-hard-surface-parts.md)。本体へjoin()
    すると自動ウェイト計算で複数ボーンに割れてしまう恐れがある部品(肩・膝
    など可動域の大きい位置)に使う。join()後、この印を頼りに
    `pin_weight_to_bone` が頂点を特定できる。

    group_name省略時は obj.name をそのまま使う。戻り値はグループ名
    (join()後にそのまま`pin_weight_to_bone`へ渡せる)。
    """
    name = group_name or obj.name
    vg = obj.vertex_groups.new(name=name)
    vg.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    return name


def pin_weight_to_bone(obj: bpy.types.Object, group_name: str, bone_name: str) -> None:
    """
    `mark_for_pin`で印を付けた頂点を、単一ボーンへウェイト1.0で固定する
    (plan/models/archive/silhouette-hard-surface-parts.md)。join()後の
    自動ウェイト計算は、関節をまたぐ位置にある頂点が複数ボーンにブレンド
    され、曲げたときに硬い部品自体がゴム的に歪む恐れがある。この関数は
    build_armature()(自動ウェイト計算)の"後"に呼ぶこと。印用の頂点グループ
    自体は用済みになるのでここで削除する。
    """
    marker = obj.vertex_groups.get(group_name)
    if marker is None:
        return
    marker_index = marker.index
    target = [v.index for v in obj.data.vertices
             if any(g.group == marker_index and g.weight > 0 for g in v.groups)]

    bone_group = obj.vertex_groups.get(bone_name)
    if bone_group is None:
        bone_group = obj.vertex_groups.new(name=bone_name)

    for vidx in target:
        for g in list(obj.data.vertices[vidx].groups):
            group = obj.vertex_groups[g.group]
            if group.name != bone_name:
                group.remove([vidx])
        bone_group.add([vidx], 1.0, "REPLACE")

    obj.vertex_groups.remove(marker)


# --------------------------------------------------------------------------- アニメーション

# 1クリップぶんのキーフレーム。
#   frames: [(フレーム番号, {ボーン名: (回転XYZ度) または {'rot':..., 'loc':...}}), ...]
#   末尾に3つ目の要素としてオプション辞書を足せる(plan/game/archive/
#   animation-quality-guidelines.md):
#     {"partial": True}   このフレームでは pose に載っているボーンだけに
#                         キーを打つ(reset_poseもしない)。他のボーンは
#                         前後の自分のキーからそのまま補間される。
#                         尻尾・耳のような末端をずらして打つ「二次揺れ」に使う。
#     {"interp": "LINEAR" | "BEZIER" | "VECTOR"}
#                         このフレームで打ったキーの補間を指定する。
#                         "VECTOR"はBlenderの補間モードではなくハンドル種別
#                         なので、interpolationは"BEZIER"のままハンドルだけ
#                         VECTORにする(直線的だが前後のキーとなじむ)。
#                         省略時は既定のBEZIER(既存の全クリップと同じ挙動)。
Pose = dict[str, object]
KeyframeOptions = dict[str, object]
Keyframe = tuple[int, Pose] | tuple[int, Pose, KeyframeOptions]


def secondary_delay_frames(length_ratio: float) -> int:
    """
    二次揺れ(plan/game/archive/secondary-motion-delay-convention.md)の
    遅延フレーム数を、部位の長さの比から機械的に決める。

    length_ratio: 対象パーツ(尻尾・耳・房紐・帯など、胴から生えて先端が
    自由に動く付属肢)の長さ(根本から先端までの各セグメント長の合計)を、
    胴の基準長(root〜chest、rootが既にchestなら胴の主要な1ボーン=
    chestに隣接する幹の骨の長さ)で割った比。長く垂れたものほど遅れて
    追従する、という実際の物理の近似(単振り子の周期は長さの平方根に
    比例する、を簡略化した目安)。

    腕・脚のような主要な可動部位(遅延ではなく別の役割の関節)は対象外
    (呼び出し側でそもそも渡さない)。

    しきい値はパイロット5体の実測(garudo/honegaramiの頭の遅れ=
    2フレーム、比0.60〜0.67。gajiriの尻尾の遅れ=3フレーム、比2.39)と
    整合するよう決めてある(計画書の初期案0.15/0.35は概算だったため、
    実測との突き合わせで調整した):

    - 1.0未満(頭のように基準長に近いかそれより短い付属肢): 2フレーム
    - 1.0以上3.0未満(標準的な尻尾・帯・房紐): 3フレーム
    - 3.0以上(長い尻尾・垂れ幕・長い帯): 4フレーム

    上限は4フレームに留める(それ以上遅らせると本体の動きから浮いて見える)。
    """
    if length_ratio < 1.0:
        return 2
    if length_ratio < 3.0:
        return 3
    return 4


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
    # (partialフレームはこの限りでない。下記参照)
    for kf in keyframes:
        frame, pose = kf[0], kf[1]
        options: KeyframeOptions = kf[2] if len(kf) > 2 else {}
        partial = bool(options.get("partial", False))
        interp = options.get("interp")

        bpy.context.scene.frame_set(frame)
        if not partial:
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

        # partialのときは pose に載っているボーンだけにキーを打つ。
        # 載っていないボーンは触らない(reset_poseもしていないので、
        # そのボーン自身の前後のキーから補間された今の値がそのまま残る)
        target_names = list(pose.keys()) if partial else [b.name for b in arm_obj.pose.bones]
        for bone_name in target_names:
            pbone = arm_obj.pose.bones[bone_name]
            pbone.keyframe_insert("rotation_euler", frame=frame)
            pbone.keyframe_insert("location", frame=frame)
            pbone.keyframe_insert("scale", frame=frame)

        if interp is not None:
            _set_keyframe_interpolation(action, frame, target_names, interp)

    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(keyframes[0][0]), action)
    strip.name = name
    arm_obj.animation_data.action = None
    bpy.ops.object.mode_set(mode="OBJECT")


def _action_fcurves(action: bpy.types.Action) -> list:
    """
    Blender 4.x以降のレイヤー化アクション(action.layers[].strips[].
    channelbags[].fcurves)と、旧式アクション(action.fcurves)の両方に対応する。
    """
    if getattr(action, "is_action_legacy", True):
        return list(action.fcurves)
    fcurves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                fcurves.extend(channelbag.fcurves)
    return fcurves


def _set_keyframe_interpolation(action: bpy.types.Action, frame: int,
                                 bone_names: Sequence[str], interp: str) -> None:
    mode = "BEZIER" if interp == "VECTOR" else interp
    handle = "VECTOR" if interp == "VECTOR" else None
    paths = set()
    for bone_name in bone_names:
        for prop in ("rotation_euler", "location", "scale"):
            paths.add(f'pose.bones["{bone_name}"].{prop}')
    for fc in _action_fcurves(action):
        if fc.data_path not in paths:
            continue
        for kp in fc.keyframe_points:
            if abs(kp.co.x - frame) < 0.5:
                kp.interpolation = mode
                if handle:
                    kp.handle_left_type = handle
                    kp.handle_right_type = handle


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


def bake_ao_to_texture(obj: bpy.types.Object, size: int = 24, samples: int = 64,
                       distance: float = 0.25) -> None:
    """
    AOをテクスチャに焼く(plan/models/archive/texture-pipeline-adoption.md)。
    `bake_ao_to_vertex_colors`のテクスチャ版で、UVアンラップが要る。

    obj が持つマテリアルスロットすべてに、それぞれ専用の小さい画像
    (size×size)を1枚ずつ割り当てる。bake()は1回の呼び出しで、面ごとの
    マテリアル割り当てに応じて対応する画像へ書き分けてくれるため、
    ガルドの`assign_materials_by_region`のような1枚のメッシュを
    複数マテリアルで塗り分けた構成でも、マテリアルの数だけbakeを
    繰り返す必要はない。

    焼いたAOは白黒そのまま(頂点カラー版と同じ)なので、各マテリアルの
    元のBase Color値を直接ここでピクセル単位に掛け合わせ、
    「色×AO」を1枚のテクスチャに合成してからBase Colorへ繋ぎ直す
    (three.js側で頂点カラーが`material.color`に掛かるのと同じ多重合成を、
    ここではBlender側で先に計算してしまう。three.jsのmapは
    material.colorに掛かるので、そちらは白(1,1,1)のBase Colorを保ち、
    テクスチャに色・陰影のすべてを持たせる)。
    """
    mesh = obj.data
    if len(mesh.uv_layers) == 0:
        activate(obj)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.03)
        bpy.ops.object.mode_set(mode="OBJECT")

    baked: list[tuple[bpy.types.Material, bpy.types.Image, tuple[float, float, float]]] = []
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or mat in [m for m, _, _ in baked]:
            continue
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        # Base Colorはリニア値(make_material参照)。ベイク画像のピクセルは
        # sRGB符号化として書き出されるため、掛け合わせる前にsRGBへ戻す
        base_color = tuple(linear_to_srgb(c) for c in bsdf.inputs["Base Color"].default_value[:3])
        image = bpy.data.images.new(f"{mat.name}_tex", width=size, height=size, alpha=False)
        tex_node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex_node.image = image
        mat.node_tree.nodes.active = tex_node
        tex_node.select = True
        baked.append((mat, image, base_color))

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.render.bake.target = "IMAGE_TEXTURES"
    scene.render.bake.margin = max(2, size // 8)
    scene.world.light_settings.distance = distance

    bpy.ops.object.select_all(action="DESELECT")
    activate(obj)
    bpy.ops.object.bake(type="AO")

    for mat, image, base_color in baked:
        pixels = list(image.pixels[:])
        r, g, b = base_color
        for i in range(0, len(pixels), 4):
            pixels[i] *= r
            pixels[i + 1] *= g
            pixels[i + 2] *= b
        image.pixels[:] = pixels

        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        tex_node = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image is image)
        mat.node_tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])


def _hash01(x: float, y: float, seed: float = 0.0) -> float:
    """xy(+seed)から[0,1)の疑似乱数を1つ決定的に作る(定番のsin-fractハッシュ)。"""
    n = math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453
    return n - math.floor(n)


def bake_procedural_detail(obj: bpy.types.Object, patterns: dict[str, str],
                           strength: float = 0.18, scale: float = 6.0) -> None:
    """
    織り目・傷擦れ・毛羽立ちの手続き的な描き込みを、`bake_ao_to_texture`が
    既に焼いたテクスチャへ乗算で足し込む(plan/models/archive/
    texture-painted-detail.md)。**`bake_ao_to_texture`の"後"に呼ぶこと**
    (対象マテリアルのBase Colorが既にテクスチャへ繋がっている前提。
    繋がっていないマテリアル名は黙って無視する)。

    `patterns`は{マテリアル名: "weave"(織り目) | "scratch"(傷・擦れ) |
    "fuzz"(毛羽立ち) | "fur"(毛並みの流れ方向)}。強さ(コントラスト)は
    `strength`で±の振れ幅として
    与える(0.18なら明度が0.82〜1.18倍の範囲で揺れる)。トゥーンの4階調
    シェーディングと衝突しないよう控えめにする狙いで、既定値は小さめ。

    Cyclesのシェーダーノード(ノイズ等)をEmission経由でベイクする方式は、
    `bpy.ops.object.bake()`がオブジェクトの全マテリアルを一括処理する
    仕様のため対象外マテリアルの本物のテクスチャまで巻き込んでしまい
    (かつ「読みながら同じ画像へ書く」経路は循環依存としてBlenderに
    弾かれ黒になる)、実装コストの割に頑丈さを欠くと判断した。
    `bake_ao_to_texture`と同じ「Pythonでピクセル配列を直接書く」方式を
    模様の生成にも使い、対象マテリアルの画像だけを直接書き換える
    (他マテリアルのベイク結果には一切触れないので、この種の事故が
    構造的に起きない)。
    """
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or mat.name not in patterns:
            continue
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        links = bsdf.inputs["Base Color"].links
        if not links or links[0].from_node.type != "TEX_IMAGE":
            continue  # bake_ao_to_texture未実行(焼き込み先のテクスチャが無い)
        image = links[0].from_node.image
        if image is None:
            continue

        pattern = patterns[mat.name]
        width, height = image.size
        seed = float(sum(image.name.encode()))  # マテリアルごとに模様の位相をずらす
        pixels = list(image.pixels[:])
        for y in range(height):
            for x in range(width):
                i = (y * width + x) * 4
                r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
                if r < 0.02 and g < 0.02 and b < 0.02:
                    continue  # UVアイランド外の余白はそのまま(bake_ao_to_textureと同じ判定)

                if pattern == "weave":
                    # 縦横に交差する細い糸目の線を格子状に敷く(布目らしく
                    # くっきり読めるよう、なめらかな波ではなく線そのものにする)
                    thread = max(0.0, math.cos(x / scale * 2 * math.pi))
                    thread = max(thread, max(0.0, math.cos(y / scale * 2 * math.pi)))
                    value = thread ** 3
                elif pattern == "scratch":
                    # 粗いセルごとにハッシュ値を1つ割り当て、パッチ状の擦れにする
                    cell_x, cell_y = math.floor(x / scale), math.floor(y / scale)
                    value = _hash01(cell_x, cell_y, seed)
                elif pattern == "fur":
                    # 斜め方向へ流れる細い毛筋(plan/models/archive/
                    # flagship-model-program.mdの種族固有識別子)。weaveの
                    # 格子と違い1方向だけの縞にし、縞と縞の間に細かいノイズを
                    # 足して、毛が同じ向きへ流れつつ1本ずつ揃っていない
                    # 質感にする
                    along = (x * 0.35 + y * 0.94) / scale  # 斜め方向への流れ
                    strand = max(0.0, math.cos(along * 2 * math.pi)) ** 4
                    value = 0.7 * strand + 0.3 * _hash01(x, y, seed)
                else:  # fuzz
                    # 画素ごとに独立した細かいノイズで、毛羽立ちの粗い粒立ちにする
                    value = _hash01(x, y, seed)

                factor = 1.0 + (value * 2.0 - 1.0) * strength
                pixels[i] = r * factor
                pixels[i + 1] = g * factor
                pixels[i + 2] = b * factor
        image.pixels[:] = pixels


def preflight_check(name: str, objs: Sequence[bpy.types.Object]) -> None:
    """
    エクスポート前のメッシュ検査(plan/models/garudo-quality-uplift.md
    実装項目1)。

    - **孤児ウェイト**(どのボーンにも属さない頂点)が1つでもあれば失敗。
      Bone Heatの取りこぼしはtests/models.test.tsのglb検査でも捕まるが、
      ビルド時に止めた方が原因のメッシュ名まで言える。
    - **非多様体エッジ**は数えて報告だけする。ロフト部品の開いた縁や
      重なり合う殻を持つ従来モデルが多数あり、一律の失敗にはできない。
      彫刻パイプラインのメッシュ(ボクセルリメッシュ出力)は0件が期待値
      なので、増えていたら作り直しの兆候として読む。
    """
    for obj in objs:
        if obj.type != "MESH":
            continue
        has_armature = any(m.type == "ARMATURE" for m in obj.modifiers)
        if has_armature and obj.vertex_groups:
            orphans = 0
            for v in obj.data.vertices:
                if sum(g.weight for g in v.groups) < 1e-4:
                    orphans += 1
            if orphans:
                raise RuntimeError(
                    f"{name}/{obj.name}: どのボーンにも属さない頂点が{orphans}個ある。"
                    "_fix_orphan_weights系の救済を通してからエクスポートする"
                )

        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bad = sum(1 for e in bm.edges if len(e.link_faces) not in (0, 2))
        bm.free()
        if bad:
            print(f"  [preflight] {name}/{obj.name}: 非多様体エッジ {bad}件")


def export_glb(name: str, objs: Sequence[bpy.types.Object], flat: bool = False) -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)
    path = os.path.join(MODEL_DIR, f"{name}.glb")

    preflight_check(name, objs)

    # キャラクター(flat=True)はアニメ調の方針(plan/models/archive/
    # anime-look-art-direction.md)で、焼き込み陰影を一切持たずトゥーン階調
    # だけで陰影を付ける。地形・小物・建物(flat=False)は現行どおり、
    # UVを持たないメッシュに近距離のAOを頂点カラーへ焼く
    if not flat:
        for o in objs:
            # bake_ao_to_textureを通した(UVを持つ)メッシュは既にAOを合成
            # 済みのテクスチャがBase Colorに繋がっているため、頂点カラーの
            # AOを重ねて焼くと二重に暗くなる。UVの有無で判別する
            if o.type == "MESH" and len(o.data.uv_layers) == 0:
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
        # カスタムプロパティ(parent_to_boneで付けるまばたき対象の印など)を
        # glTFのextrasとして書き出す(plan/models/archive/eye-blink-liveliness.md)。
        # 既定はFalseで、今のところ付けているモデルは無いので実害はない
        export_extras=True,
    )
    return path


# --------------------------------------------------------------------------- プレビュー

def _mute_to_rest(objs: Sequence[bpy.types.Object]) -> list:
    """
    アクションを積んだあとだと NLA が効いて最後のポーズで固まってしまうので、
    レンダーのあいだだけトラックを黙らせて素立ちに戻す。戻り値の黙らせた
    トラック一覧を、後で mute=False に戻す。
    """
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
    return muted


def render_preview(name: str, objs: Sequence[bpy.types.Object], samples: int = 48,
                   size=(420, 520), yaw: float = 34.0, pitch: float = 11.0,
                   zoom: float = 1.05) -> str:
    """
    造形を目で確かめるための静止画。三点照明で形が読み取れるようにし、
    カメラは対象のバウンディングボックスに合わせて自動で引く。
    """
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    path = os.path.join(PREVIEW_DIR, f"{name}.png")

    muted = _mute_to_rest(objs)

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


def render_silhouette(name: str, objs: Sequence[bpy.types.Object], view: str = "front",
                      size: int = 400) -> str:
    """
    平行投影・黒塗りのシルエットレンダー(plan/models/
    2d-turnaround-first-workflow.mdの受け入れ基準2)。三面図
    (design/characters/<名前>/turnarounds/)のSVGを黒塗りにした画像との
    重ね合わせ照合に使う。出力は tools/preview/silhouettes/<名前>-
    <view>.png。

    view="front"は-Y方向(character-design-language.mdの正面)、
    "side"は+X方向(mirrored()で.L側が+Xなので、この向きで見ると
    体の左半身が見える側面図になる)から平行投影で見る。
    """
    silhouette_dir = os.path.join(PREVIEW_DIR, "silhouettes")
    os.makedirs(silhouette_dir, exist_ok=True)
    path = os.path.join(silhouette_dir, f"{name}-{view}.png")

    muted = _mute_to_rest(objs)

    lo, hi = bounds(objs)
    center = (lo + hi) * 0.5
    extent = max((hi - lo).x, (hi - lo).y, (hi - lo).z, 0.5)

    cam_dir = Vector((0, -1, 0)) if view == "front" else Vector((1, 0, 0))
    cam_loc = center - cam_dir * (extent * 2)

    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = extent * 1.15
    cam.rotation_euler = (center - cam_loc).to_track_quat("-Z", "Y").to_euler()

    # 陰影・光源に依存しない純黒(Emission)へ全マテリアルを差し替える。
    # 元のマテリアル割り当ては後で復元する
    black_mat = bpy.data.materials.new("silhouette_black")
    black_mat.use_nodes = True
    bsdf = black_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        black_mat.node_tree.nodes.remove(bsdf)
    emit = black_mat.node_tree.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    output = black_mat.node_tree.nodes["Material Output"]
    black_mat.node_tree.links.new(emit.outputs["Emission"], output.inputs["Surface"])

    original_mats: dict[str, list] = {}
    for obj in objs:
        if obj.type != "MESH":
            continue
        original_mats[obj.name] = list(obj.data.materials)
        obj.data.materials.clear()
        obj.data.materials.append(black_mat)

    world = bpy.context.scene.world
    bg_input = world.node_tree.nodes["Background"].inputs["Color"]
    original_bg = tuple(bg_input.default_value)
    bg_input.default_value = (1.0, 1.0, 1.0, 1.0)

    scene = bpy.context.scene
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

    # 後始末。元のマテリアル・背景・アクションへ戻す
    for obj in objs:
        if obj.name not in original_mats:
            continue
        obj.data.materials.clear()
        for mat in original_mats[obj.name]:
            obj.data.materials.append(mat)
    bg_input.default_value = original_bg
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.materials.remove(black_mat)
    for track in muted:
        track.mute = False
    return path


def render_turnaround(name: str, objs: Sequence[bpy.types.Object], samples: int = 24,
                      view_size: tuple[int, int] = (300, 380)) -> str:
    """
    正面・側面・背面のシェーデッド3面を左からこの順で1枚に並べた
    コンタクトシート(plan/models/garudo-quality-uplift.md 実装項目2)。
    平行投影・素立ちで、三面図との突き合わせや承認レビューの定型提示物に
    使う。出力は tools/preview/turnaround/<名前>.png。
    """
    import numpy as np

    out_dir = os.path.join(PREVIEW_DIR, "turnaround")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")

    muted = _mute_to_rest(objs)

    lo, hi = bounds(objs)
    center = (lo + hi) * 0.5
    extent = max((hi - lo).x, (hi - lo).y, (hi - lo).z, 0.3)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    width, height = view_size
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.film_transparent = False

    floor = box("turnaround_floor", (center.x, center.y, lo.z - 0.02), (8, 8, 0.02))
    assign_material(floor, make_material("turnaround_floor_mat", (0.16, 0.17, 0.2), roughness=0.9))

    # キャラクターの顔は-Yを向く(character-design-language.md)。
    # ベクトルは「中心から見たカメラの位置」: 正面ビューはカメラを-Y側に
    # 置いて顔を写す。側面は-X側(=.R半身が写る。render_silhouetteの
    # side と同じ側)、背面は+Y側
    views = [("front", Vector((0, -1, 0))),
             ("side", Vector((-1, 0, 0))),
             ("back", Vector((0, 1, 0)))]
    tiles = []
    tmp_paths = []
    up = Vector((0, 0, 1))
    for view, to_camera in views:
        cam_loc = center + to_camera * (extent * 2.2)
        bpy.ops.object.camera_add(location=cam_loc)
        cam = bpy.context.object
        cam.data.type = "ORTHO"
        # sensor_fitの既定AUTOでは、ortho_scaleは解像度の長い方に対応する。
        # 縦長タイルなので高さ・幅どちらでも収まるよう少し余裕を持たせる
        cam.data.ortho_scale = extent * 1.25
        cam.rotation_euler = (center - cam_loc).to_track_quat("-Z", "Y").to_euler()
        scene.camera = cam

        # 三点照明をカメラごとに組み直す(固定光源だと背面ビューが逆光になる)
        back = to_camera
        right = up.cross(back)
        add_sun(center + back * 4 + right * -2 + up * 5, center, 2.4)
        add_area(center + back * 3 + right * 2.5 + up * 1.0, center, 40.0, size=4.0)
        add_area(center - back * 4 + up * 2.5, center, 26.0, size=3.0)

        tmp = os.path.join(out_dir, f".{name}-{view}.tmp.png")
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        tmp_paths.append(tmp)

        img = bpy.data.images.load(tmp)
        px = np.empty(width * height * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        tiles.append(px.reshape(height, width, 4))
        bpy.data.images.remove(img)

        bpy.data.objects.remove(cam, do_unlink=True)
        for obj in list(bpy.data.objects):
            if obj.type == "LIGHT":
                bpy.data.objects.remove(obj, do_unlink=True)

    sheet = np.concatenate(tiles, axis=1)
    out = bpy.data.images.new(f"{name}_turnaround", width=width * 3, height=height)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)

    for tmp in tmp_paths:
        os.remove(tmp)
    bpy.data.objects.remove(floor, do_unlink=True)
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
