#!/usr/bin/env python3
"""Rahsa Cafe art build: Anokolisa Pixel Crawler + CC0 Food Icons -> public/assets.

Outputs final per-key PNGs (no chroma-key slicing). All sources are artist-made,
permissively licensed (see CREDITS).
"""
from PIL import Image, ImageDraw
import numpy as np
import os, colorsys

SRC = '/tmp/mostowo/public/assets/tilesets/pixel-crawler'
FOOD = '/tmp/food'
OUT = '/home/hatch/workspace/rahsa-cafe/public/assets'
os.makedirs(OUT, exist_ok=True)

def load(p):
    return Image.open(p).convert('RGBA')

def save(im, name):
    p = os.path.join(OUT, name)
    im.save(p)
    print(f'{im.size[0]:4}x{im.size[1]:<4} {name}')

def crop_save(src, box, name):
    save(load(src).crop(box), name)

def gray(im):
    """Luminance grayscale preserving alpha (for tinting)."""
    a = np.array(im)
    rgb = a[:, :, :3].astype(float)
    lum = (0.299*rgb[:,:,0] + 0.587*rgb[:,:,1] + 0.114*rgb[:,:,2]).astype(np.uint8)
    out = np.zeros_like(a)
    out[:,:,0] = lum; out[:,:,1] = lum; out[:,:,2] = lum; out[:,:,3] = a[:,:,3]
    return Image.fromarray(out)

def white_base(im):
    """White base preserving alpha (for tinting)."""
    a = np.array(im)
    out = np.full_like(a, 255); out[:,:,3] = a[:,:,3]
    return Image.fromarray(out)

def silhouette_bounds(im):
    a = np.array(im); m = a[:,:,3] > 10
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max()+1, ys.max()+1

# ---------------------------------------------------------------- tiles
WALLS = f'{SRC}/Environment/Structures/Buildings/Interior/Interior_Walls_01.png'
# Floor tiles are ~100px plus-shapes at bottom of Interior_Walls_01 (y 300-400).
# Wood planks tile centered ~ (50,350); herringbone ~ (250,350); stone ~ (150,350).
crop_save(WALLS, (26, 326, 74, 374), 'tile_floor.png')      # wood planks 48x48
crop_save(WALLS, (205, 322, 253, 370), 'tile_floor2.png')   # herringbone 48x48
crop_save(WALLS, (126, 326, 174, 374), 'tile_stone.png')    # stone 48x48
# Grass: clean 48x48 from Floors_Tiles top-left.
crop_save(f'{SRC}/Environment/Tilesets/Floors_Tiles.png', (16, 136, 64, 184), 'tile_grass.png')

# Walls: build from wood plank texture. Top wall 48x64 with trim, side wall 48x64.
wood = load(WALLS).crop((26, 326, 74, 374))
walltop = Image.new('RGBA', (48, 64), (0,0,0,0))
walltop.paste(wood.resize((48,48), Image.NEAREST), (0,0))
# darker wainscot strip at bottom of top-wall
px = walltop.load()
for y in range(48, 64):
    for x in range(48):
        r,g,b,a = wood.resize((48,48), Image.NEAREST).load()[x, (y-48) % 48]
        px[x,y] = (int(r*0.55), int(g*0.45), int(b*0.4), 255)
# top trim highlight
for x in range(48):
    px[x,0] = (122, 84, 50, 255); px[x,1] = (96, 64, 38, 255)
save(walltop, 'tile_walltop.png')
wall = Image.new('RGBA', (48, 64), (0,0,0,0))
wall.paste(wood.resize((48,48), Image.NEAREST).transpose(Image.ROTATE_90), (0,8))
save(wall, 'tile_wall.png')

# Door, rug.
PROPS = f'{SRC}/Environment/Structures/Buildings/Interior/Interior_Props_01.png'
crop_save(PROPS, (132, 197, 178, 258), 'tile_door.png')     # wooden door 46x61
crop_save(PROPS, (336, 318, 416, 368), 'tile_rug.png')      # green rug ~80x50

# ---------------------------------------------------------------- furniture
crop_save(PROPS, (80, 7, 112, 42), 'furn_table_round.png')  # round table 32x35
crop_save(PROPS, (185, 0, 235, 65), 'furn_table_sq.png')    # blue cloth table 50x65
crop_save(PROPS, (67, 34, 78, 58), 'furn_chair.png')        # wooden chair 11x24
crop_save(PROPS, (116, 0, 140, 48), 'furn_stove.png')       # dark stove 24x48
crop_save(PROPS, (112, 178, 221, 256), 'furn_serve.png')     # bar counter 109x78
# Kitchen counter: low drawer cabinet from Furniture.png.
crop_save(f'{SRC}/Environment/Props/Static/Furniture.png', (40, 40, 120, 80), 'furn_counter.png')
# Potted plant.
crop_save(PROPS, (14, 348, 52, 384), 'furn_plant.png')
# Shelf: tall wooden wardrobe from Furniture.png.
crop_save(f'{SRC}/Environment/Props/Static/Furniture.png', (0, 42, 38, 110), 'furn_shelf.png')

# ---------------------------------------------------------------- food (CC0 Food Icons, OGA)
def hue_shift_bowl(src_path, target_hue, name):
    im = load(src_path); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a = px[x,y]
            if a > 10 and g > r+15 and g > b+5:
                h,l,s = colorsys.rgb_to_hls(r/255, g/255, b/255)
                r2,g2,b2 = colorsys.hls_to_rgb(target_hue, min(0.55,l), s)
                px[x,y] = (int(r2*255), int(g2*255), int(b2*255), a)
    save(im, name)

SALAD = f'{FOOD}/jet/32x32/salad.png'
hue_shift_bowl(SALAD, 0.07, 'food_0.png')   # curry rice (orange bowl)
hue_shift_bowl(SALAD, 0.13, 'food_1.png')   # noodle bowl (yellow bowl)
crop_save(f'{FOOD}/tkp/32x32/burger.png', (0,0,32,32), 'food_2.png')
crop_save(f'{FOOD}/tkp/32x32/pizza.png', (0,0,32,32), 'food_3.png')
crop_save(SALAD, (0,0,32,32), 'food_4.png')                  # garden salad
hue_shift_bowl(SALAD, 0.0, 'food_5.png')    # tomato soup (red bowl)
crop_save(f'{FOOD}/bc16/32x32/pastry/cake_chocolate_round.png', (0,0,32,32), 'food_6.png')
# Masala tea: pick an amber fleurman tea.
crop_save(f'{FOOD}/flm/32x32/tea_04.png', (0,0,32,32), 'food_7.png')

print('tiles/furniture/food done')

# ---------------------------------------------------------------- guests
# guest_N.png = idle frame 0 (static key); guest_N_walk.png = walk strip spritesheet.
def build_guest(name, idle_sheet, walk_sheet, fw, walk_frames, outbase, x2=False):
    idle = load(idle_sheet); walk = load(walk_sheet)
    if x2:
        idle = idle.resize((idle.width*2, idle.height*2), Image.NEAREST)
        walk = walk.resize((walk.width*2, walk.height*2), Image.NEAREST)
        fw *= 2
    save(idle.crop((0, 0, fw, fw)), f'{outbase}.png')
    strip = Image.new('RGBA', (fw*walk_frames, fw), (0,0,0,0))
    for i in range(walk_frames):
        strip.paste(walk.crop((i*fw, 0, (i+1)*fw, fw)), (i*fw, 0))
    save(strip, f'{outbase}_walk.png')

CIT = f"{SRC}/Entities/Npc's/Citizen_F"
build_guest('g0', f'{CIT}/Peasant_A/Idle/Idle-Sheet.png', f'{CIT}/Peasant_A/Walk/Walk-Sheet.png',
            64, 6, 'guest_0')
build_guest('g1', f'{CIT}/Tavern_A/Idle/Idle_Side-Sheet.png', f'{CIT}/Tavern_A/Walk/Walk_Side-Sheet.png',
            64, 6, 'guest_1')
NPC = f"{SRC}/Entities/Npc's"
build_guest('g2', f"{NPC}/Knight/Idle/Idle-Sheet.png", f"{NPC}/Knight/Run/Run-Sheet.png",
            32, 12, 'guest_2', x2=True)
build_guest('g3', f"{NPC}/Rogue/Idle/Idle-Sheet.png", f"{NPC}/Rogue/Run/Run-Sheet.png",
            32, 12, 'guest_3', x2=True)
build_guest('g4', f"{NPC}/Wizzard/Idle/Idle-Sheet.png", f"{NPC}/Wizzard/Run/Run-Sheet.png",
            32, 12, 'guest_4', x2=True)

# guest_5: Peasant_A palette variant (ash-blonde hair, rust shirt, tan pants).
def remap(im, mapping, thresh=60):
    a = np.array(im); out = a.copy()
    rgb = a[:,:,:3].astype(int)
    for src, dst in mapping:
        s = np.array(src); d = np.array(dst)
        dist = np.abs(rgb - s).sum(axis=2)
        m = (dist < thresh) & (a[:,:,3] > 10)
        for c in range(3):
            out[:,:,c] = np.where(m, d[c], out[:,:,c])
    return Image.fromarray(out)

PEA_I = f'{CIT}/Peasant_A/Idle/Idle-Sheet.png'
PEA_W = f'{CIT}/Peasant_A/Walk/Walk-Sheet.png'
pea_map = [
    ((57,86,75),(150,110,70)), ((51,68,62),(130,95,60)), ((41,54,49),(110,80,50)),  # hair teal->blonde-brown
    ((20,31,27),(60,45,30)), ((32,44,40),(90,70,45)),
    ((255,252,230),(200,90,70)), ((219,194,184),(170,70,55)),  # shirt white->rust
    ((95,72,51),(70,55,40)), ((62,44,28),(50,38,28)),          # pants brown->darker
]
for src_p, frames, tag in [(PEA_I, 4, 'idle'), (PEA_W, 6, 'walk')]:
    im = load(src_p); im = remap(im, pea_map)
    im.save(f'/tmp/pea5_{tag}.png')
build_guest('g5', '/tmp/pea5_idle.png', '/tmp/pea5_walk.png', 64, 6, 'guest_5')

print('guests done')

# ---------------------------------------------------------------- player parts
# 10 frames each (4 idle side + 6 walk side), 64x64. White/gray bases for tinting.
BA = f'{SRC}/Entities/Characters/Body_A/Animations'
idle_s = load(f'{BA}/Idle_Base/Idle_Side-Sheet.png')
walk_s = load(f'{BA}/Walk_Base/Walk_Side-Sheet.png')
frames = [idle_s.crop((i*64,0,(i+1)*64,64)) for i in range(4)] + \
         [walk_s.crop((i*64,0,(i+1)*64,64)) for i in range(6)]

def bands(im):
    """Return (head_y0,head_y1, torso_y0,torso_y1, legs_y0,legs_y1) for a frame."""
    a = np.array(im); m = a[:,:,3] > 10
    ys = np.where(m.any(axis=1))[0]
    t, b = ys.min(), ys.max()+1
    h = b - t
    return (t, int(t+h*0.46), int(t+h*0.46), int(t+h*0.76), int(t+h*0.76), b)

def band_mask(im, y0, y1):
    a = np.array(im)
    m = (a[:,:,3] > 10)
    sel = np.zeros_like(m); sel[y0:y1, :] = m[y0:y1, :]
    out = np.zeros_like(a); out[sel] = a[sel]
    return Image.fromarray(out)

def make_hair(im, y0, y1, style):
    """Procedural hair cap derived from head geometry. White base for tint."""
    a = np.array(im)
    head = (a[:,:,3] > 10)
    # head x-bounds within band
    sub = head[y0:y1, :]
    xs = np.where(sub.any(axis=0))[0]
    if len(xs) == 0: return Image.new('RGBA', (64,64), (0,0,0,0))
    xl, xr = xs.min(), xs.max()
    hh = y1 - y0
    out = Image.new('RGBA', (64,64), (0,0,0,0))
    px = out.load()
    cx = (xl+xr)//2
    for x in range(max(0,xl-3), min(64,xr+4)):
        # depth profile by style; facing right => back is left
        backness = max(0.0, (cx - x) / max(1,(cx-xl+3)))
        if style == 0:   # Crop: straight fringe
            depth = 0.48
        elif style == 1: # Long: fringe + long back
            depth = 0.48 + backness*0.85
        elif style == 2: # Curly: scalloped fringe
            depth = 0.55 + 0.10*np.sin(x*1.7)
        else:            # Ponytail: crop + tail handled below
            depth = 0.44
        yt = y0 - 4
        yb = int(y0 + hh*min(depth, 1.35))
        for y in range(max(0,yt), min(64,yb)):
            shade = 255 if y < yb-2 else 205
            px[x,y] = (shade, shade, shade, 255)
    if style == 3:  # ponytail blob at back
        for y in range(y0+2, min(64, y0+hh+10)):
            for x in range(max(0,xl-9), xl-1):
                dx, dy = (x-(xl-5)), (y-(y0+6))
                if dx*dx+dy*dy < 16:
                    px[x,y] = (255,255,255,255)
    return out

parts = {'skin': [], 'shirt': [], 'pants': [], 'hair0': [], 'hair1': [], 'hair2': [], 'hair3': []}
for im in frames:
    hy0,hy1, ty0,ty1, ly0,ly1 = bands(im)
    parts['skin'].append(gray(band_mask(im, hy0, hy1)))
    parts['shirt'].append(gray(band_mask(im, ty0, ty1)))
    parts['pants'].append(gray(band_mask(im, ly0, ly1)))
    for s in range(4):
        parts['hair'+str(s)].append(make_hair(im, hy0, hy1, s))

for name, imgs in parts.items():
    sheet = Image.new('RGBA', (64*10, 64), (0,0,0,0))
    for i, im in enumerate(imgs):
        sheet.paste(im, (i*64, 0), im)
    save(sheet, f'part_{name}.png')

print('player parts done')

# ---------------------------------------------------------------- sign & title
# Hanging wooden sign, composed from pack wood.
wood = load(WALLS).crop((26, 326, 74, 374)).resize((120, 104), Image.NEAREST)
sign = Image.new('RGBA', (120, 104), (0,0,0,0))
sign.paste(wood, (0,0))
d = ImageDraw.Draw(sign)
d.rectangle([0,0,119,103], outline=(61,36,18,255), width=6)
d.rectangle([6,6,113,97], outline=(140,100,60,255), width=2)
# chains
for cx in (28, 92):
    d.line([(cx,0),(cx,10)], fill=(40,40,44,255), width=3)
    d.ellipse([cx-4,8,cx+4,16], outline=(40,40,44,255), width=2)
save(sign, 'sign_blank.png')

# Title bg: compose a cozy cafe interior 960x640 from pack art, then dim.
bg = Image.new('RGBA', (960, 640), (26,18,10,255))
floor = load(os.path.join(OUT, 'tile_floor.png'))
for x in range(0, 960, 48):
    for y in range(96, 640, 48):
        bg.paste(floor, (x, y))
wt = load(os.path.join(OUT, 'tile_walltop.png'))
for x in range(0, 960, 48):
    bg.paste(wt, (x, 32))
# furniture vignettes
def stamp(name, x, y, scale=3):
    im = load(os.path.join(OUT, name))
    im = im.resize((im.width*scale, im.height*scale), Image.NEAREST)
    bg.paste(im, (x-im.width//2, y-im.height//2), im)
stamp('furn_table_round.png', 240, 320, 4)
stamp('furn_table_sq.png', 700, 330, 3)
stamp('furn_serve.png', 480, 180, 2)
stamp('furn_plant.png', 880, 540, 3)
stamp('furn_plant.png', 80, 540, 3)
stamp('furn_stove.png', 120, 200, 3)
# warm dim + vignette
ov = Image.new('RGBA', (960,640), (20,10,5,110))
bg = Image.alpha_composite(bg, ov)
save(bg, 'title_bg.png')

print('ALL DONE')
