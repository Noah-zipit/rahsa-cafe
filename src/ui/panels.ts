import Phaser from 'phaser';
import { sfx } from '../systems/audio';
import { Recipe, Quality, SHOP_ITEMS, ShopState } from '../game/data';

// ---------- shared panel chrome ----------
export function makePanel(scene: Phaser.Scene, w: number, h: number, title: string) {
  const cx = scene.cameras.main.width / 2, cy = scene.cameras.main.height / 2;
  const root = scene.add.container(cx, cy).setDepth(200).setScrollFactor(0);
  const dim = scene.add.rectangle(0, 0, 4000, 4000, 0x000000, 0.55).setInteractive();
  const box = scene.add.image(0, 0, 'panel').setDisplaySize(w, h);
  const titleT = scene.add.text(0, -h / 2 + 34, title, {
    fontFamily: 'monospace', fontSize: '26px', color: '#fff7e8', fontStyle: 'bold',
  }).setOrigin(0.5);
  const close = scene.add.text(w / 2 - 34, -h / 2 + 30, 'X', {
    fontFamily: 'monospace', fontSize: '26px', color: '#ffb3a0', fontStyle: 'bold',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  root.add([dim, box, titleT, close]);
  return { root, close, w, h };
}

function btn(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string,
  cb: () => void, color = 0x4fae5a, fontSize = 18): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const r = scene.add.rectangle(0, 0, w, h, color).setStrokeStyle(3, 0x1d2f1a);
  const t = scene.add.text(0, 0, label, {
    fontFamily: 'monospace', fontSize: `${fontSize}px`, color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5);
  c.add([r, t]);
  r.setInteractive({ useHandCursor: true })
    .on('pointerover', () => r.setAlpha(0.85))
    .on('pointerout', () => r.setAlpha(1))
    .on('pointerdown', (p: Phaser.Input.Pointer) => { p.event.stopPropagation(); sfx.click(); cb(); });
  return c;
}

// ---------- cooking: recipe book + timing minigame ----------
export class CookPanel {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;
  // minigame state
  private mg: {
    marker: Phaser.GameObjects.Rectangle; pos: number; dir: number; speed: number;
    pw: number; gw: number; barW: number; active: boolean; recipe: Recipe;
  } | null = null;

  constructor(scene: Phaser.Scene) { this.scene = scene; }
  get open() { return !!this.root; }

  private params: { recipes: Recipe[]; stoveLevel: number; onCook: (r: Recipe, q: Quality) => void } | null = null;

  show(recipes: Recipe[], stoveLevel: number, onCook: (r: Recipe, q: Quality) => void, onClose: () => void) {
    this.hide();
    const { root, close } = makePanel(this.scene, 640, 520, 'Recipe Book');
    this.root = root;
    close.on('pointerdown', () => { this.hide(); onClose(); });
    this.params = { recipes, stoveLevel, onCook };
    this.renderList();
  }

  private renderList() {
    const root = this.root, p = this.params;
    if (!root || !p) return;
    root.each((child: Phaser.GameObjects.GameObject) => {
      if ((child as any).getData && (child as any).getData('mg') === 'list') child.destroy();
    });
    const list = this.scene.add.container(-290, -190).setData('mg', 'list');
    root.add(list);
    p.recipes.forEach((r, i) => {
      const y = i * 74;
      const row = this.scene.add.container(0, y);
      const icon = this.scene.add.image(-250, 0, r.icon).setDisplaySize(52, 52);
      const name = this.scene.add.text(-215, -18, r.name, {
        fontFamily: 'monospace', fontSize: '19px', color: '#fff7e8', fontStyle: 'bold',
      });
      const desc = this.scene.add.text(-215, 6, `${r.desc}  (${r.price}c)`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#d9c49a',
      });
      const b = btn(this.scene, 235, 0, 110, 44, 'Cook', () => this.startMinigame(r, p.stoveLevel, p.onCook));
      row.add([icon, name, desc, b]);
      list.add(row);
    });
    if (!p.recipes.length) {
      list.add(this.scene.add.text(0, 60, 'No recipes yet — buy some in the shop!', {
        fontFamily: 'monospace', fontSize: '17px', color: '#d9c49a',
      }).setOrigin(0.5));
    }
  }

  private startMinigame(recipe: Recipe, stoveLevel: number, onCook: (r: Recipe, q: Quality) => void) {
    if (!this.root) return;
    // Clear recipe list, keep chrome.
    this.root.each((child: Phaser.GameObjects.GameObject) => {
      if ((child as any).getData && (child as any).getData('mg') === 'list') child.destroy();
    });
    const layer = this.scene.add.container(0, 0).setData('mg', 'list');
    this.root.add(layer);
    sfx.sizzle();

    layer.add(this.scene.add.text(0, -170, 'Cook: ' + recipe.name, {
      fontFamily: 'monospace', fontSize: '24px', color: '#fff7e8', fontStyle: 'bold',
    }).setOrigin(0.5));
    layer.add(this.scene.add.image(-240, -170, recipe.icon).setDisplaySize(56, 56));
    layer.add(this.scene.add.text(0, -120, 'Tap STOP when the marker is in the green!', {
      fontFamily: 'monospace', fontSize: '16px', color: '#d9c49a',
    }).setOrigin(0.5));

    const barW = 480, barH = 44, bx = 0, by = -20;
    const pw = 0.10 + stoveLevel * 0.035;   // perfect fraction
    const gw = 0.34 + stoveLevel * 0.05;     // good fraction
    const bar = this.scene.add.rectangle(bx, by, barW, barH, 0x8a5a3b).setStrokeStyle(4, 0x3d2412);
    const good = this.scene.add.rectangle(bx, by, barW * gw, barH - 8, 0xe8c93d);
    const perf = this.scene.add.rectangle(bx, by, barW * pw, barH - 8, 0x4fae5a);
    const marker = this.scene.add.rectangle(bx - barW / 2, by, 8, barH + 10, 0xffffff).setStrokeStyle(2, 0x222222);
    layer.add([bar, good, perf, marker]);

    const speed = Math.max(0.55, 1.5 - stoveLevel * 0.28); // sweeps per second (fraction)
    this.mg = { marker, pos: 0, dir: 1, speed, pw, gw, barW, active: true, recipe };

    const stopB = btn(this.scene, 0, 120, 220, 64, 'STOP', () => this.stopMinigame(onCook), 0xd94f3d, 26);
    layer.add(stopB);
    layer.add(this.scene.add.text(0, 190, 'Perfect = big tips. Burnt = sad guests.', {
      fontFamily: 'monospace', fontSize: '14px', color: '#8a6f4d',
    }).setOrigin(0.5));
  }

  update(_t: number, dt: number) {
    const mg = this.mg;
    if (!mg || !mg.active) return;
    mg.pos += mg.dir * mg.speed * (dt / 1000);
    if (mg.pos >= 1) { mg.pos = 1; mg.dir = -1; }
    if (mg.pos <= 0) { mg.pos = 0; mg.dir = 1; }
    mg.marker.x = -mg.barW / 2 + mg.pos * mg.barW;
  }

  stopMinigame(onCook?: (r: Recipe, q: Quality) => void) {
    const mg = this.mg;
    if (!mg || !mg.active) return;
    mg.active = false;
    const d = Math.abs(mg.pos - 0.5);
    const q: Quality = d <= mg.pw / 2 ? 'perfect' : d <= mg.gw / 2 ? 'good' : 'burnt';
    if (q === 'perfect') sfx.perfect(); else if (q === 'good') sfx.serve(); else sfx.angry();
    const cb = onCook || (() => {});
    // Flash result, then back to recipe list.
    if (this.root) {
      const f = this.scene.add.text(0, -20, q.toUpperCase() + '!', {
        fontFamily: 'monospace', fontSize: '54px', fontStyle: 'bold',
        color: q === 'perfect' ? '#ffd94d' : q === 'good' ? '#9fe870' : '#c98a5a',
        stroke: '#3d2412', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(210);
      this.root.add(f);
      this.scene.time.delayedCall(700, () => {
        f.destroy();
        this.mg = null;
        cb(mg.recipe, q);
        this.renderList();
      });
    } else { this.mg = null; cb(mg.recipe, q); }
  }

  get minigameActive() { return !!this.mg?.active; }

  hide() {
    this.mg = null;
    if (this.root) { this.root.destroy(true); this.root = null; }
  }
}

// ---------- shop ----------
export class ShopPanel {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;
  constructor(scene: Phaser.Scene) { this.scene = scene; }
  get open() { return !!this.root; }

  show(getCoins: () => number, shop: ShopState, onBuy: (id: string) => string | null, onClose: () => void) {
    this.hide();
    const { root, close } = makePanel(this.scene, 720, 600, 'Expand the Cafe');
    this.root = root;
    this.getCoins = getCoins;
    close.on('pointerdown', () => { this.hide(); onClose(); });
    this.render(getCoins(), shop, onBuy, onClose);
  }
  private getCoins: () => number = () => 0;

  private render(coins: number, shop: ShopState, onBuy: (id: string) => string | null, onClose: () => void) {
    if (!this.root) return;
    const root = this.root;
    root.each((c: Phaser.GameObjects.GameObject) => {
      if ((c as any).getData && (c as any).getData('shop') === 'list') c.destroy();
    });
    const layer = this.scene.add.container(0, 0).setData('shop', 'list');
    root.add(layer);
    layer.add(this.scene.add.text(0, -222, `Coins: ${coins}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffd94d', fontStyle: 'bold',
    }).setOrigin(0.5));

    const items = SHOP_ITEMS;
    const cols = 2, cw = 330, rh = 100;
    items.forEach((it, i) => {
      const cx = -cw / 2 + (i % cols) * cw;
      const cy = -160 + Math.floor(i / cols) * rh;
      const cell = this.scene.add.container(cx, cy);
      const icon = this.scene.add.image(-135, 0, it.icon).setDisplaySize(52, 52);
      const name = this.scene.add.text(-105, -36, it.name, {
        fontFamily: 'monospace', fontSize: '16px', color: '#fff7e8', fontStyle: 'bold',
      });
      const desc = this.scene.add.text(-105, -14, it.desc, {
        fontFamily: 'monospace', fontSize: '12px', color: '#d9c49a', wordWrap: { width: 150 },
      });
      const st = this.scene.add.text(-105, 32, it.label(shop), {
        fontFamily: 'monospace', fontSize: '13px', color: '#9fe870',
      });
      cell.add([icon, name, desc, st]);
      const maxed = it.maxed(shop);
      const price = it.price(shop);
      const can = !maxed && coins >= price;
      const b = btn(this.scene, 105, 0, 96, 42, maxed ? 'MAX' : `${price}c`,
        () => {
          const err = onBuy(it.id);
          if (err) { sfx.angry(); st.setText(err).setColor('#ff9a8a'); }
          else { sfx.buy(); this.render(this.getCoins(), shop, onBuy, onClose); }
        }, maxed ? 0x555555 : can ? 0x4fae5a : 0x8a6a3b, 15);
      cell.add(b);
      layer.add(cell);
    });
  }

  hide() { if (this.root) { this.root.destroy(true); this.root = null; } }
}

// ---------- pause ----------
export function showPause(scene: Phaser.Scene, onResume: () => void, onQuit: () => void) {
  const { root, close } = makePanel(scene, 420, 360, 'Paused');
  const mk = (y: number, label: string, cb: () => void) =>
    root.add(btn(scene, 0, y, 260, 54, label, () => { root.destroy(true); cb(); }, 0x6b4423, 20));
  close.on('pointerdown', () => { root.destroy(true); onResume(); });
  mk(-40, 'Resume', onResume);
  mk(40, 'Save & Title', onQuit);
}

// ---------- day summary ----------
export interface DayStats {
  day: number; earned: number; served: number; happy: number; angry: number;
  roomIncome: number; rep: number; coins: number;
}
export function showDaySummary(scene: Phaser.Scene, s: DayStats, onNext: () => void) {
  const { root } = makePanel(scene, 560, 480, `Day ${s.day} complete`);
  const lines = [
    `Guests served: ${s.served}`,
    `Happy: ${s.happy}   Walked out: ${s.angry}`,
    `Coins earned today: ${s.earned}`,
    `Room income overnight: +${s.roomIncome}`,
    `Reputation: ${s.rep}`,
    `Coin purse: ${s.coins}`,
  ];
  lines.forEach((l, i) => root.add(scene.add.text(0, -160 + i * 40, l, {
    fontFamily: 'monospace', fontSize: '19px', color: '#fff7e8',
  }).setOrigin(0.5)));
  root.add(btn(scene, 0, 170, 280, 56, `Start Day ${s.day + 1}`, () => { root.destroy(true); onNext(); }, 0x4fae5a, 20));
  sfx.dayEnd();
}
