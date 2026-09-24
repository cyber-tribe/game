"""
あしあとどりの**設定画とモデルの比較画像**を作る。

    python3 tools/ashiatodori_compare.py

中間ファイル(`tools/preview/silhouettes/<名前>-{gate,shade}-*.png`)は
合計 4.6MB あり、40秒で作り直せるのでコミットしない(.gitignore 済み)。

出力(tools/preview/):
    ashiatodori-vs-sheet.png     設定画(上)と実機レンダー(下)を三面で並べる
    ashiatodori_anatomygate.png  実寸シルエットの重ね合わせと IoU
    ashiatodori-96px.png         ゲーム表示サイズでの読み取り judgement

判定の作法(handbook 4-58 / reading-at-game-size 1):

* **倍率は「全高 0.267m」ただ1つ。** 部位ごとに合わせ直さない。
* 位置合わせは物理的な基準で ―― 縦は接地(z=0)、正面/背面は
  マスク全体の外接箱の中心、側面は**最前点**(嘴の先)。
* 設定画の霧は体ではないので、マスクから落とす(明るい側を色相で切る。
  handbook 4-102)。

シルエットは固定の平行投影(±210mm)で撮る。`C.render_silhouette` は
モデル自身の外接箱に合わせて画角を決めるので、**版を跨いで同じ倍率に
ならず**、この用途には使えない。撮影は bpy が要るので
`tools/venv/bin/python` を自分で呼び直す(この仮想環境には PIL が無く、
逆に素の python3 には bpy が無いため、import は関数の中に置いてある)。
"""
from __future__ import annotations

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "plan", "models", "reference-ashiatodori-sheet.png")
PREVIEW = os.path.join(ROOT, "tools", "preview")
SIL_DIR = os.path.join(PREVIEW, "silhouettes")
GLB = os.path.join(ROOT, "public", "models", "ashiatodori.glb")
VENV_PY = os.path.join(ROOT, "tools", "venv", "bin", "python")

NAME = "ashiatodori"
HEIGHT_MM = 267.0

# 設定画の三面図の枠(暗い連結成分の外接箱で実測)
VIEWS = {"front": (585, 118, 730, 342),
         "side": (769, 130, 992, 340),
         "back": (1040, 141, 1187, 345)}
MARGIN = 14
UPSCALE = 7

# 固定の平行投影。±210mm を 1200px で撮る
SIZE = 1200
ORTHO = 0.420
PX_M = ORTHO / SIZE
CZ = 0.134                      # カメラの注視点の高さ(m)

LOW_BAND = 0.28                 # 下から何割を「脚と地面の気配だけ」とみなすか
LOW_LUM = 135.0


# --------------------------------------------------------------- 撮影(bpy)
def render_silhouettes() -> None:
    """固定 ortho の黒塗りシルエットを3面分撮る(bpy が要る)。"""
    import bpy
    from mathutils import Vector
    sys.path.insert(0, os.path.join(ROOT, "tools", "models"))
    import common as C
    import ashiatodori as A

    os.makedirs(SIL_DIR, exist_ok=True)
    C.reset_scene()
    parts = A.build_blockout()
    objs = A.blockout_objects(parts)
    lo, hi = C.bounds(objs)
    print(f"[{NAME}] 素の寸法 高さ {(hi.z - lo.z) * 1000:.1f}mm "
          f"幅 {(hi.x - lo.x) * 1000:.1f} 奥行き {(hi.y - lo.y) * 1000:.1f} "
          f"三角形 {C.tri_count(objs)}")
    center = Vector((0.0, 0.0, CZ))
    black = bpy.data.materials.new("sil_black")
    black.use_nodes = True
    nt = black.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (0, 0, 0, 1)
    nt.links.new(emit.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    sc = bpy.context.scene
    world = sc.world.node_tree.nodes["Background"].inputs["Color"]
    old_bg = tuple(world.default_value)
    world.default_value = (1, 1, 1, 1)
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 4
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.film_transparent = False
    keep = {}
    for o in objs:
        if o.type == "MESH":
            keep[o.name] = list(o.data.materials)
            o.data.materials.clear()
            o.data.materials.append(black)
    for view, to_cam in (("front", Vector((0, -1, 0))),
                         ("side", Vector((-1, 0, 0))),
                         ("back", Vector((0, 1, 0)))):
        cam_loc = center + to_cam * 1.2
        bpy.ops.object.camera_add(location=cam_loc)
        cam = bpy.context.object
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ORTHO
        cam.rotation_euler = (center - cam_loc).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sc.render.filepath = os.path.join(SIL_DIR, f"{NAME}-gate-{view}.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
    for o in objs:
        if o.name in keep:
            o.data.materials.clear()
            for m in keep[o.name]:
                o.data.materials.append(m)
    world.default_value = old_bg

    # 同じカメラで**テクスチャ付き**も撮る。設定画と同じ倍率・同じ位置の
    # グリッドに載るので、並べたときに部位の高さがそのまま比べられる
    C.reset_scene()
    A.build()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.film_transparent = True
    up = Vector((0, 0, 1))
    for view, to_cam in (("front", Vector((0, -1, 0))),
                         ("side", Vector((-1, 0, 0))),
                         ("back", Vector((0, 1, 0)))):
        cam_loc = center + to_cam * 1.2
        bpy.ops.object.camera_add(location=cam_loc)
        cam = bpy.context.object
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ORTHO
        cam.rotation_euler = (center - cam_loc).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        # 三点照明をカメラごとに組み直す(`C.render_turnaround` と同じ値)。
        # 固定光源だと背面ビューが逆光になり、骸だけ白く飛ぶ
        lights = []
        right = up.cross(to_cam)
        for make, loc, power, size in (
                (C.add_sun, center + to_cam * 4 + right * -2 + up * 5, 2.4, None),
                (C.add_area, center + to_cam * 3 + right * 2.5 + up * 1.0, 40.0, 4.0),
                (C.add_area, center - to_cam * 4 + up * 2.5, 26.0, 3.0)):
            make(loc, center, power) if size is None else make(loc, center, power,
                                                               size=size)
            lights.append(bpy.context.object)
        sc.render.filepath = os.path.join(SIL_DIR, f"{NAME}-shade-{view}.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
        for lt in lights:
            bpy.data.objects.remove(lt, do_unlink=True)
    print(f"[{NAME}] シルエットと陰影 -> {SIL_DIR}")


# --------------------------------------------------------- 設定画のマスク
def panel(view: str):
    import numpy as np
    from PIL import Image
    x0, y0, x1, y1 = VIEWS[view]
    im = Image.open(SHEET).convert("RGB").crop(
        (x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN))
    im = im.resize((im.width * UPSCALE, im.height * UPSCALE), Image.LANCZOS)
    return np.asarray(im).astype(np.float32)


def sheet_mask(view: str):
    """体(骸+嘴+羽+脚)のマスクと、接地・頭頂の行。

    紙は明るく暖色、霧は明るく青紫、骸は明るいが暖色、羽は暗い紫。
    明度だけでは骸と霧が切れないので、**明るい側は G-B で**切る
    (handbook 4-102)。足元は霧が地面いっぱいに描かれていて脚と繋がるので、
    下から 28% の帯だけは「暗い」を足して脚だけ残す(handbook 4-34)。
    """
    import numpy as np
    from scipy import ndimage
    a = panel(view)
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    gb = a[..., 1] - a[..., 2]
    m = (lum < 198.0) & ~((lum > 172.0) & (gb < 5.0))
    rows = np.nonzero((lum < 95).sum(1) >= 3)[0]
    top, ground = rows.min(), rows.max()
    cut = int(ground - LOW_BAND * (ground - top + 1))
    m[cut:, :] &= lum[cut:, :] < LOW_LUM
    m[ground + 1:, :] = False
    m[:top, :] = False
    lab, n = ndimage.label(m, np.ones((3, 3), bool))
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = np.argsort(sizes)[::-1][:3]      # 体 + 脚2本
        big = sizes[keep].max()
        m = np.isin(lab, [k + 1 for k in keep if sizes[k] > big * 0.02])
    return ndimage.binary_fill_holes(m), a, top, ground


# ------------------------------------------------------------ Anatomy Gate
def row_of_z(z):
    return SIZE / 2 - (z - CZ) / PX_M


def _band_center(m, z0, z1):
    import numpy as np
    r0, r1 = int(row_of_z(z1)), int(row_of_z(z0))
    xs = np.nonzero(m[max(0, r0):max(1, r1)].any(0))[0]
    return (xs.min() + xs.max()) / 2 if len(xs) else m.shape[1] / 2


def _front_edge(m, z0, z1):
    import numpy as np
    r0, r1 = int(row_of_z(z1)), int(row_of_z(z0))
    xs = np.nonzero(m[max(0, r0):max(1, r1)].any(0))[0]
    return xs.max() if len(xs) else m.shape[1] / 2


def sheet_rgb_on_model_grid(view: str, dx: int):
    """設定画の**絵**を、マスクと同じ変換でモデルのグリッドへ載せる。

    倍率は全高 0.267m だけ、縦は接地合わせ、横は `dx`(マスクで決めた値)。
    こうして並べると、頭の高さも嘴の長さも**定規なしで**比べられる。
    """
    import numpy as np
    from PIL import Image
    sm, a, top, ground = sheet_mask(view)
    if view == "side":
        sm, a = sm[:, ::-1], a[:, ::-1]
    k = (HEIGHT_MM / 1000.0 / (ground - top + 1)) / PX_M
    w, h = int(round(a.shape[1] * k)), int(round(a.shape[0] * k))
    rgb = np.asarray(Image.fromarray(a.astype("uint8")).resize((w, h), Image.LANCZOS))
    al = np.asarray(Image.fromarray((sm * 255).astype("uint8")).resize(
        (w, h), Image.BILINEAR))
    out = np.zeros((SIZE, SIZE, 4), np.uint8)
    dy = int(round(row_of_z(0.0))) - int(round(ground * k))
    ys, xs = np.mgrid[0:h, 0:w]
    ys2, xs2 = ys + dy, xs + dx
    ok = (ys2 >= 0) & (ys2 < SIZE) & (xs2 >= 0) & (xs2 < SIZE)
    out[ys2[ok], xs2[ok], :3] = rgb[ys[ok], xs[ok]]
    out[ys2[ok], xs2[ok], 3] = al[ys[ok], xs[ok]]
    return out


def masks_on_model_grid(view: str):
    """設定画とモデルのマスクを、同じ実寸グリッドへ載せて返す。"""
    import numpy as np
    from PIL import Image
    sm, _a, top, ground = sheet_mask(view)
    if view == "side":
        sm = sm[:, ::-1]                # 設定画の側面は左向き、モデルは鼻が右
    k = (HEIGHT_MM / 1000.0 / (ground - top + 1)) / PX_M
    im = Image.fromarray((sm * 255).astype("uint8")).resize(
        (int(round(sm.shape[1] * k)), int(round(sm.shape[0] * k))), Image.BILINEAR)
    r = np.asarray(im) > 127
    S = np.zeros((SIZE, SIZE), bool)
    ys, xs = np.nonzero(r)
    ys2 = ys + int(round(row_of_z(0.0))) - int(round(ground * k))
    ok = (ys2 >= 0) & (ys2 < SIZE) & (xs >= 0) & (xs < SIZE)
    S[ys2[ok], xs[ok]] = True
    M = np.asarray(Image.open(
        os.path.join(SIL_DIR, f"{NAME}-gate-{view}.png")).convert("L")) < 128
    if view == "side":
        dx = _front_edge(M, 0.110, 0.200) - _front_edge(S, 0.110, 0.200)
    else:
        dx = _band_center(M, 0.0, 0.30) - _band_center(S, 0.0, 0.30)
    return np.roll(S, int(round(dx)), 1), M, int(round(dx))


# --------------------------------------------------------------- 組み立て
JP_FONT = "/etc/alternatives/fonts-japanese-gothic.ttf"


def label(im, text, xy=(10, 7), size=17, fill=(238, 238, 246)):
    from PIL import ImageDraw, ImageFont
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype(JP_FONT, size)
    except OSError:
        f = None
    d.text(xy, text, fill=fill, font=f)
    return im


def sheet_cell(view, height):
    import numpy as np
    from PIL import Image
    a = panel(view).astype("uint8")
    lum = np.asarray(Image.fromarray(a).convert("L")).astype(float)
    rows = np.nonzero((lum < 95).sum(1) >= 3)[0]
    cols = np.nonzero((lum < 95).sum(0) >= 3)[0]
    im = Image.fromarray(a).crop((cols.min(), rows.min(), cols.max() + 1, rows.max() + 1))
    return im.resize((max(1, round(im.width * height / im.height)), height), Image.LANCZOS)


def engine_cell(frame, height):
    """実機(turntable)の 1 コマを切り出す。0=正面 1=45° 2=側面 4=背面。"""
    import numpy as np
    from PIL import Image
    turn = Image.open(os.path.join(PREVIEW, "turntable", f"{NAME}.png")).convert("RGB")
    w = turn.width // 6
    c = turn.crop((frame * w, 0, (frame + 1) * w, turn.height))
    a = np.asarray(c).astype(float)
    bg = np.median(a[:30].reshape(-1, 3), 0)
    m = np.abs(a - bg).sum(2) > 26
    ys, xs = np.nonzero(m)
    c = c.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return c.resize((max(1, round(c.width * height / c.height)), height), Image.LANCZOS)


def _engine_native_height():
    """turntable の3コマの素の高さの最大値。ここまでなら拡大しない。"""
    import numpy as np
    from PIL import Image
    turn = Image.open(os.path.join(PREVIEW, "turntable", f"{NAME}.png")).convert("RGB")
    w = turn.width // 6
    hs = []
    for frame in (0, 2, 4):
        a = np.asarray(turn.crop((frame * w, 0, (frame + 1) * w, turn.height))
                       ).astype(float)
        bg = np.median(a[:30].reshape(-1, 3), 0)
        ys = np.nonzero((np.abs(a - bg).sum(2) > 26).any(1))[0]
        hs.append(int(ys.max() - ys.min() + 1))
    return max(hs)


def strip(tops, bots, cell_h, pad, bg, head):
    from PIL import Image
    W = max(sum(i.width + pad for i in tops), sum(i.width + pad for i in bots)) + pad
    cv = Image.new("RGB", (W, cell_h * 2 + pad * 3 + head), bg)
    for row, ims in ((head + pad, tops), (head + pad * 2 + cell_h, bots)):
        x = pad
        for im in ims:
            cv.paste(im, (x, row))
            x += im.width + pad
    return cv


def build_vs_sheet():
    """設定画とモデルを**同じ倍率・同じ位置**で上下に並べる。

    以前は実機 turntable のコマを切り出して高さを揃えていたが、それだと
    「全高だけ合った2枚」になり、頭の高さや嘴の長さの差が読めなかった。
    固定 ortho で撮って設定画も同じグリッドへ載せれば、並べるだけで
    部位のずれがそのまま見える。
    """
    import numpy as np
    from PIL import Image
    cells = []
    for view, jp in (("front", "正面"), ("side", "側面"), ("back", "背面")):
        S, M, dx = masks_on_model_grid(view)
        sheet = sheet_rgb_on_model_grid(view, dx)
        model = np.asarray(Image.open(
            os.path.join(SIL_DIR, f"{NAME}-shade-{view}.png")).convert("RGBA"))
        ys, xs = np.nonzero(S | M)
        pad = 24
        box = (max(0, xs.min() - pad), max(0, ys.min() - pad),
               min(SIZE, xs.max() + pad), min(SIZE, ys.max() + pad))
        pair = []
        for layer in (sheet, model):
            im = Image.fromarray(layer, "RGBA").crop(box)
            bg = Image.new("RGBA", im.size, (34, 34, 40, 255))
            pair.append(Image.alpha_composite(bg, im).convert("RGB"))
        col = Image.new("RGB", (pair[0].width, pair[0].height * 2 + 4), (60, 60, 70))
        col.paste(pair[0], (0, 0))
        col.paste(pair[1], (0, pair[0].height + 4))
        label(col, jp, (8, 6), 20)
        label(col, jp + "(モデル)", (8, pair[0].height + 10), 20)
        cells.append(col)
    gap, head = 14, 26
    W = sum(c.width for c in cells) + gap * (len(cells) + 1)
    H = max(c.height for c in cells) + head + gap
    cv = Image.new("RGB", (W, H), (34, 34, 40))
    x = gap
    for c in cells:
        cv.paste(c, (x, head))
        x += c.width + gap
    label(cv, f"{NAME}  設定画(上)とモデル(下)  "
              f"**倍率は全高 {HEIGHT_MM / 1000:.3f}m のみ・接地合わせ**なので、"
              "高さと位置はそのまま比べられる")
    cv = cv.resize((round(cv.width * 0.66), round(cv.height * 0.66)), Image.LANCZOS)
    p = os.path.join(PREVIEW, f"{NAME}-vs-sheet.png")
    cv.save(p)
    return p


def build_96px():
    from PIL import Image
    H = 96
    tops = [sheet_cell(v, H) for v in ("front", "side", "back")]
    bots = [engine_cell(i, H) for i in (0, 1, 2, 4)]
    cv = strip(tops, bots, H, 12, (30, 32, 42), 0)
    cv = cv.resize((cv.width * 3, cv.height * 3), Image.NEAREST)
    out = Image.new("RGB", (cv.width, cv.height + 30), (30, 32, 42))
    out.paste(cv, (0, 30))
    label(out, "96px 判定  上=設定画(正面/側面/背面)  下=実機(正面/45°/側面/背面)",
          (12, 9))
    p = os.path.join(PREVIEW, f"{NAME}-96px.png")
    out.save(p)
    return p


def build_anatomy_gate():
    import numpy as np
    from PIL import Image
    cells, scores = [], {}
    for view, jp in (("front", "front 正面"), ("side", "side 側面"), ("back", "back 背面")):
        S, M, _dx = masks_on_model_grid(view)
        v = (S & M).sum() / max(1, (S | M).sum())
        scores[view] = v
        rgb = np.full((SIZE, SIZE, 3), 24, np.uint8)
        rgb[..., 0] = np.where(S, 226, 24)
        rgb[..., 2] = np.where(M, 226, 24)
        rgb[..., 1] = np.where(S & M, 116, 24)
        im = Image.fromarray(rgb).resize((460, 460), Image.LANCZOS)
        label(im, f"{jp}  IoU {v:.3f}", (8, 6))
        cells.append(im)
    gate = Image.new("RGB", (460 * 3, 486), (24, 24, 24))
    for i, im in enumerate(cells):
        gate.paste(im, (i * 460, 26))
    label(gate, "Anatomy Gate  赤=設定画 / 青=モデル / 紫=一致  "
                f"(倍率は全高 {HEIGHT_MM / 1000:.3f}m のみ。"
                "位置は接地と、正面/背面は外接箱の中心・側面は最前点で合わせる)")
    p = os.path.join(PREVIEW, f"{NAME}_anatomygate.png")
    gate.save(p)
    return p, scores


def main() -> int:
    stale = [v for v in VIEWS
             if not os.path.exists(os.path.join(SIL_DIR, f"{NAME}-gate-{v}.png"))
             or (os.path.exists(GLB)
                 and os.path.getmtime(os.path.join(SIL_DIR, f"{NAME}-gate-{v}.png"))
                 < os.path.getmtime(GLB))]
    if stale:
        if not os.path.exists(VENV_PY):
            print(f"シルエットが古い({stale})。{VENV_PY} が無いので撮り直せない")
            return 1
        print(f"シルエットを撮り直す({', '.join(stale)})")
        subprocess.run([VENV_PY, os.path.abspath(__file__), "--render"], check=True)
    turn = os.path.join(PREVIEW, "turntable", f"{NAME}.png")
    if os.path.exists(GLB) and os.path.exists(turn) \
            and os.path.getmtime(turn) < os.path.getmtime(GLB):
        print(f"注意: {os.path.relpath(turn, ROOT)} が .glb より古い。"
              f"96px 判定は実機の現状を映していない ―― "
              f"`npm run dev &` のうえで `MODELS={NAME} npm run turntable` を先に")
    out = [build_vs_sheet(), build_96px()]
    gate, scores = build_anatomy_gate()
    out.append(gate)
    print("Anatomy Gate  " + "  ".join(f"{k} {v:.3f}" for k, v in scores.items()))
    for p in out:
        print("  ->", os.path.relpath(p, ROOT))
    return 0


if __name__ == "__main__":
    if "--render" in sys.argv:
        render_silhouettes()
    else:
        sys.exit(main())
