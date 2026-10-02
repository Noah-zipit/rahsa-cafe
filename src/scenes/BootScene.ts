import Phaser from 'phaser';

// Chroma-key threshold for the magenta sheet backgrounds.
function isKey(r: number, g: number, b: number, a: number) {
  return a > 10 && r > 150 && g < 120 && b > 150;
}

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const w = this.cameras.main.width, h = this.cameras.main.height;
    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x1a0f0a);
    bg.setDepth(-10);
    const barBg = this.add.rectangle(w / 2, h / 2 + 40, 320, 18, 0x3a2a1a).setOrigin(0.5);
    const bar = this.add.rectangle(w / 2 - 160, h / 2 + 40, 0, 18, 0xe08a2d).setOrigin(0, 0.5);
    const label = this.add.text(w / 2, h / 2, 'Brewing Rahsa Cafe...', {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5e6c8',
    }).setOrigin(0.5);
    this.load.on('progress', (p: number) => { bar.width = 320 * p; });
    this.load.on('complete', () => label.setText('Ready!'));

    this.load.image('sheet_tiles', 'assets/rahsa-tiles.webp');
    this.load.image('sheet_furniture', 'assets/rahsa-furniture.webp');
    this.load.image('sheet_food', 'assets/rahsa-food.webp');
    this.load.image('sheet_guests', 'assets/rahsa-guests.webp');
    this.load.image('sheet_parts', 'assets/rahsa-player-parts.webp');
    this.load.image('sheet_sign', 'assets/rahsa-sign.webp');
    this.load.image('title_bg', 'assets/rahsa-title-bg.webp');
  }

  private sliceSheet(sheetKey: string, cols: number, rows: number, names: string[]) {
    const src = this.textures.get(sheetKey).getSourceImage() as HTMLImageElement;
    const cw = Math.floor(src.width / cols);
    const ch = Math.floor(src.height / rows);
    names.forEach((name, i) => {
      if (!name) return;
      const cx = (i % cols) * cw;
      const cy = Math.floor(i / cols) * ch;
      if (this.textures.exists(name)) this.textures.remove(name);
      const tex = this.textures.createCanvas(name, cw, ch);
      if (!tex) return;
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch);
      try {
        const img = ctx.getImageData(0, 0, cw, ch);
        const d = img.data;
        for (let p = 0; p < d.length; p += 4) {
          if (isKey(d[p], d[p + 1], d[p + 2], d[p + 3])) d[p + 3] = 0;
        }
        ctx.putImageData(img, 0, 0);
      } catch { /* cross-origin taint — ignore */ }
      tex.refresh();
    });
  }

  private keySingle(sheetKey: string, outKey: string, crop?: { x: number; y: number; w: number; h: number }) {
    const src = this.textures.get(sheetKey).getSourceImage() as HTMLImageElement;
    const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0;
    const sw = crop ? crop.w : src.width, sh = crop ? crop.h : src.height;
    if (this.textures.exists(outKey)) this.textures.remove(outKey);
    const tex = this.textures.createCanvas(outKey, sw, sh);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    try {
      const img = ctx.getImageData(0, 0, sw, sh);
      const d = img.data;
      for (let p = 0; p < d.length; p += 4) {
        if (isKey(d[p], d[p + 1], d[p + 2], d[p + 3])) d[p + 3] = 0;
      }
      ctx.putImageData(img, 0, 0);
    } catch { /* ignore */ }
    tex.refresh();
  }

  create() {
    this.sliceSheet('sheet_tiles', 4, 2, [
      'tile_floor', 'tile_floor2', 'tile_walltop', 'tile_wall',
      'tile_door', 'tile_rug', 'tile_stone', 'tile_grass',
    ]);
    this.sliceSheet('sheet_furniture', 4, 2, [
      'furn_table_round', 'furn_table_sq', 'furn_chair', 'furn_stove',
      'furn_counter', 'furn_serve', 'furn_plant', 'furn_shelf',
    ]);
    this.sliceSheet('sheet_food', 4, 2, [
      'food_0', 'food_1', 'food_2', 'food_3',
      'food_4', 'food_5', 'food_6', 'food_7',
    ]);
    this.sliceSheet('sheet_guests', 3, 2, [
      'guest_0', 'guest_1', 'guest_2',
      'guest_3', 'guest_4', 'guest_5',
    ]);
    this.sliceSheet('sheet_parts', 4, 2, [
      'part_skin', 'part_shirt', 'part_pants', '',
      'part_hair0', 'part_hair1', 'part_hair2', 'part_hair3',
    ]);
    this.keySingle('sheet_sign', 'sign_blank', { x: 70, y: 530, w: 1236, h: 1060 });

    // White order bubble (drawn once, reused).
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 64, 64, 14);
    g.fillTriangle(28, 64, 40, 64, 34, 76);
    g.lineStyle(3, 0x5a3a22, 1);
    g.strokeRoundedRect(0, 0, 64, 64, 14);
    g.generateTexture('bubble', 64, 80);
    g.destroy();

    // Soft round shadow blob.
    const g2 = this.add.graphics();
    g2.fillStyle(0x000000, 0.25);
    g2.fillEllipse(0, 0, 56, 18);
    g2.generateTexture('shadow', 56, 18);
    g2.destroy();

    // Wooden panel texture for UI.
    const g3 = this.add.graphics();
    g3.fillStyle(0x6b4423, 1);
    g3.fillRoundedRect(0, 0, 64, 64, 10);
    g3.lineStyle(4, 0x3d2412, 1);
    g3.strokeRoundedRect(2, 2, 60, 60, 8);
    g3.generateTexture('panel', 64, 64);
    g3.destroy();

    this.scene.start('title');
  }
}
