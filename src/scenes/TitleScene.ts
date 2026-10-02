import Phaser from 'phaser';
import { sfx } from '../systems/audio';
import { loadSave } from '../systems/save';

const W = 960, H = 640;

export class TitleScene extends Phaser.Scene {
  constructor() { super('title'); }

  create() {
    sfx.ensure();
    const bg = this.add.image(W / 2, H / 2, 'title_bg');
    const s = Math.max(W / bg.width, H / bg.height);
    bg.setScale(s);
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0f0a, 0.45);

    // Hanging sign with the cafe name.
    const sign = this.add.image(W / 2, 140, 'sign_blank').setDisplaySize(310, 266);
    this.add.text(W / 2, 128, 'RAHSA CAFE', {
      fontFamily: 'monospace', fontSize: '34px', color: '#fff7e8',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(W / 2, 160, 'est. 2026', {
      fontFamily: 'monospace', fontSize: '15px', color: '#e8c98a',
    }).setOrigin(0.5);
    this.tweens.add({ targets: sign, angle: 1.6, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(W / 2, 250, 'A cozy cafe & inn sim', {
      fontFamily: 'monospace', fontSize: '20px', color: '#f5e6c8',
    }).setOrigin(0.5);

    const hasSave = !!loadSave();
    const mkBtn = (y: number, label: string, cb: () => void) => {
      const c = this.add.container(W / 2, y);
      const r = this.add.rectangle(0, 0, 300, 56, 0x6b4423).setStrokeStyle(4, 0x3d2412);
      const t = this.add.text(0, 0, label, {
        fontFamily: 'monospace', fontSize: '24px', color: '#fff7e8', fontStyle: 'bold',
      }).setOrigin(0.5);
      c.add([r, t]);
      r.setInteractive({ useHandCursor: true })
        .on('pointerover', () => r.setFillStyle(0x7d5228))
        .on('pointerout', () => r.setFillStyle(0x6b4423))
        .on('pointerdown', () => { sfx.click(); cb(); });
      return c;
    };

    mkBtn(360, hasSave ? 'Continue' : 'New Game', () => {
      if (hasSave) this.scene.start('game', { fresh: false });
      else this.scene.start('customize');
    });
    if (hasSave) {
      mkBtn(432, 'New Game', () => this.scene.start('customize'));
    }

    this.add.text(W / 2, 560, 'Seat guests - Cook their orders - Serve with a smile\nEarn coins, expand your cafe, open guest rooms upstairs', {
      fontFamily: 'monospace', fontSize: '16px', color: '#d9c49a', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);

    this.add.text(W / 2, 612, 'touch / mouse / WASD + E', {
      fontFamily: 'monospace', fontSize: '13px', color: '#8a6f4d',
    }).setOrigin(0.5);
  }
}
