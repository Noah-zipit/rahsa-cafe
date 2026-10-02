import Phaser from 'phaser';

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
    void barBg;

    const A = 'assets/';
    // Tiles.
    for (const k of ['tile_floor', 'tile_floor2', 'tile_walltop', 'tile_wall',
      'tile_door', 'tile_rug', 'tile_stone', 'tile_grass']) {
      this.load.image(k, A + k + '.png');
    }
    // Furniture.
    for (const k of ['furn_table_round', 'furn_table_sq', 'furn_chair', 'furn_stove',
      'furn_counter', 'furn_serve', 'furn_plant', 'furn_shelf']) {
      this.load.image(k, A + k + '.png');
    }
    // Food.
    for (let i = 0; i < 8; i++) this.load.image('food_' + i, A + 'food_' + i + '.png');
    // Sign + title.
    this.load.image('sign_blank', A + 'sign_blank.png');
    this.load.image('title_bg', A + 'title_bg.png');
    // Guests: static frame + walk strip.
    for (let i = 0; i < 6; i++) {
      this.load.image('guest_' + i, A + 'guest_' + i + '.png');
      this.load.spritesheet('guest_' + i + '_walk', A + 'guest_' + i + '_walk.png', {
        frameWidth: 64, frameHeight: 64,
      });
    }
    // Player parts: 10 frames each (0-3 idle, 4-9 walk), 64x64.
    for (const k of ['part_skin', 'part_shirt', 'part_pants',
      'part_hair0', 'part_hair1', 'part_hair2', 'part_hair3']) {
      this.load.spritesheet(k, A + k + '.png', { frameWidth: 64, frameHeight: 64 });
    }
  }

  create() {
    // Walk / idle anims for guests.
    for (let i = 0; i < 6; i++) {
      const walkKey = 'guest_' + i + '_walk';
      const nFrames = this.textures.get(walkKey).frameTotal;
      this.anims.create({
        key: 'gwalk' + i, frames: this.anims.generateFrameNumbers(walkKey, { start: 0, end: nFrames - 1 }),
        frameRate: 8, repeat: -1,
      });
    }
    // Walk / idle anims for player parts (frames 0-3 idle, 4-9 walk).
    const partKeys = ['part_skin', 'part_shirt', 'part_pants',
      'part_hair0', 'part_hair1', 'part_hair2', 'part_hair3'];
    for (const k of partKeys) {
      this.anims.create({
        key: k + '_idle', frames: this.anims.generateFrameNumbers(k, { start: 0, end: 3 }),
        frameRate: 4, repeat: -1,
      });
      this.anims.create({
        key: k + '_walk', frames: this.anims.generateFrameNumbers(k, { start: 4, end: 9 }),
        frameRate: 10, repeat: -1,
      });
    }

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
