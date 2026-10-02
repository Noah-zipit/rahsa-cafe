import Phaser from 'phaser';
import { sfx } from '../systems/audio';
import { CharCustom, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS } from '../game/data';
import { defaultSave, saveSave } from '../systems/save';

const W = 960, H = 640;

// Builds a layered character container from part spritesheets + tints.
// Each part is a 10-frame strip (0-3 idle, 4-9 walk); frame 0 shown by default.
export function buildCharacter(
  scene: Phaser.Scene, c: CharCustom, scale = 1,
): Phaser.GameObjects.Container {
  const cont = scene.add.container(0, 0);
  const pants = scene.add.sprite(0, 0, 'part_pants', 0).setTint(0x5a4632);
  const shirt = scene.add.sprite(0, 0, 'part_shirt', 0).setTint(c.shirt);
  const skin = scene.add.sprite(0, 0, 'part_skin', 0).setTint(c.skin);
  const hair = scene.add.sprite(0, 0, 'part_hair' + c.hairStyle, 0).setTint(c.hairColor);
  cont.add([pants, skin, shirt, hair]);
  cont.setScale(scale);
  (cont as any).setAppearance = (nc: CharCustom) => {
    shirt.setTint(nc.shirt);
    skin.setTint(nc.skin);
    hair.setTint(nc.hairColor);
    const nh = scene.add.sprite(0, 0, 'part_hair' + nc.hairStyle, 0).setTint(nc.hairColor);
    const idx = cont.getIndex(hair);
    cont.remove(hair); hair.destroy();
    cont.addAt(nh, idx);
    (cont as any).hairImg = nh;
    (cont as any).partSprites = [pants, skin, shirt, nh];
  };
  (cont as any).hairImg = hair;
  (cont as any).partSprites = [pants, skin, shirt, hair];
  return cont;
}

function swatchRow(
  scene: Phaser.Scene, x: number, y: number, label: string, colors: number[],
  current: number, onPick: (i: number) => void,
): { refresh: (cur: number) => void } {
  const cont = scene.add.container(x, y);
  cont.add(scene.add.text(-300, 0, label, {
    fontFamily: 'monospace', fontSize: '20px', color: '#fff7e8',
  }).setOrigin(0, 0.5));
  const cells: Phaser.GameObjects.Rectangle[] = [];
  colors.forEach((col, i) => {
    const r = scene.add.rectangle(-140 + i * 56, 0, 44, 44, col).setStrokeStyle(3, 0x3d2412);
    r.setInteractive({ useHandCursor: true }).on('pointerdown', () => { sfx.click(); onPick(i); });
    cells.push(r); cont.add(r);
  });
  return {
    refresh(cur: number) {
      cells.forEach((r, i) => r.setStrokeStyle(i === cur ? 5 : 3, i === cur ? 0xffd94d : 0x3d2412));
    },
  };
}

function cycleRow(
  scene: Phaser.Scene, x: number, y: number, label: string, count: number,
  current: number, names: string[], onPick: (i: number) => void,
): { refresh: (cur: number) => void } {
  const cont = scene.add.container(x, y);
  cont.add(scene.add.text(-300, 0, label, {
    fontFamily: 'monospace', fontSize: '20px', color: '#fff7e8',
  }).setOrigin(0, 0.5));
  const name = scene.add.text(0, 0, names[current], {
    fontFamily: 'monospace', fontSize: '20px', color: '#ffd94d',
  }).setOrigin(0.5);
  const mk = (dx: number, ch: string, d: number) => {
    const t = scene.add.text(dx, 0, ch, {
      fontFamily: 'monospace', fontSize: '30px', color: '#fff7e8', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    t.on('pointerdown', () => { sfx.click(); onPick((current + d + count) % count); });
    return t;
  };
  cont.add([name, mk(-90, '<', -1), mk(90, '>', 1)]);
  return { refresh(cur: number) { current = cur; name.setText(names[cur]); } };
}

export class CustomizeScene extends Phaser.Scene {
  private char: CharCustom = { skin: SKIN_TONES[0], hairStyle: 0, hairColor: HAIR_COLORS[0], shirt: SHIRT_COLORS[0] };
  private skinIdx = 0; private hairIdx = 0; private hairColIdx = 0; private shirtIdx = 0;

  constructor() { super('customize'); }

  create() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x241610);
    // Floor hint.
    for (let i = 0; i < 20; i++) for (let j = 0; j < 14; j++) {
      this.add.image(i * 48, j * 48, (i + j) % 2 ? 'tile_floor' : 'tile_floor2')
        .setOrigin(0).setDisplaySize(48, 48).setAlpha(0.5);
    }

    this.add.text(W / 2, 60, 'Meet your innkeeper', {
      fontFamily: 'monospace', fontSize: '34px', color: '#fff7e8', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Preview on a rug.
    this.add.image(220, 380, 'tile_rug').setDisplaySize(200, 200).setDepth(1);
    const preview = buildCharacter(this, this.char, 2.2);
    preview.setPosition(220, 350);
    preview.setDepth(2);
    this.add.image(220, 470, 'shadow').setScale(2.4, 1.4).setDepth(1);
    for (const sp of (preview as any).partSprites as Phaser.GameObjects.Sprite[]) {
      sp.play(sp.texture.key + '_idle');
    }

    const apply = () => {
      this.char = { skin: SKIN_TONES[this.skinIdx], hairStyle: this.hairIdx, hairColor: HAIR_COLORS[this.hairIdx], shirt: SHIRT_COLORS[this.shirtIdx] };
      (preview as any).setAppearance(this.char);
    };

    const r1 = swatchRow(this, 640, 200, 'Skin', SKIN_TONES, 0, i => { this.skinIdx = i; apply(); r1.refresh(i); });
    const r2 = cycleRow(this, 640, 280, 'Hair', 4, 0, ['Crop', 'Long', 'Curly', 'Ponytail'], i => { this.hairIdx = i; apply(); r2.refresh(i); });
    const r3 = swatchRow(this, 640, 360, 'Hair color', HAIR_COLORS, 0, i => { this.hairColIdx = i; apply(); r3.refresh(i); });
    const r4 = swatchRow(this, 640, 440, 'Shirt', SHIRT_COLORS, 0, i => { this.shirtIdx = i; apply(); r4.refresh(i); });
    [r1, r2, r3, r4].forEach((r, i) => r.refresh([this.skinIdx, this.hairIdx, this.hairColIdx, this.shirtIdx][i]));

    const mkBtn = (x: number, y: number, label: string, cb: () => void, primary = false) => {
      const c = this.add.container(x, y);
      const r = this.add.rectangle(0, 0, 260, 54, primary ? 0x4fae5a : 0x6b4423).setStrokeStyle(4, 0x3d2412);
      const t = this.add.text(0, 0, label, {
        fontFamily: 'monospace', fontSize: '22px', color: '#fff7e8', fontStyle: 'bold',
      }).setOrigin(0.5);
      c.add([r, t]);
      r.setInteractive({ useHandCursor: true })
        .on('pointerover', () => r.setFillStyle(primary ? 0x5fbf6a : 0x7d5228))
        .on('pointerout', () => r.setFillStyle(primary ? 0x4fae5a : 0x6b4423))
        .on('pointerdown', () => { sfx.click(); cb(); });
    };

    mkBtn(360, 580, 'Back', () => this.scene.start('title'));
    mkBtn(660, 580, 'Open the Cafe', () => {
      const s = defaultSave();
      s.char = { ...this.char };
      saveSave(s);
      this.scene.start('game', { fresh: true });
    }, true);
  }
}
