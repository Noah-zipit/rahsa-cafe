import Phaser from 'phaser';
import { sfx } from '../systems/audio';
import {
  RECIPES, Recipe, Quality, QUALITY_MULT,
  DAY_LENGTH, TABLE_SPOTS, STOVE_SPOTS, ROOM_SPOTS, DECOR_SPOTS, ROOM_NIGHTLY,
  ShopState,
} from '../game/data';
import { SaveData, loadSave, saveSave, defaultSave } from '../systems/save';
import { buildCharacter } from './CustomizeScene';
import { CookPanel, ShopPanel, showPause, showDaySummary } from '../ui/panels';

const W = 960, H = 640;
const FLOOR = { x0: 48, y0: 96, x1: 912, y1: 576 };
const DOOR = { x: 480, y: 610 };

interface Table {
  x: number; y: number;
  img: Phaser.GameObjects.Image;
  guest: Guest | null;
}
interface Dish { recipe: Recipe; quality: Quality; }
type GuestState = 'entering' | 'waiting' | 'eating' | 'leaving';

class Guest {
  c: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Container;
  patFill: Phaser.GameObjects.Rectangle;
  order!: Recipe;
  patience = 0; maxPatience = 80;
  state: GuestState = 'entering';
  paidQuality: Quality = 'good';
  waypoints: { x: number; y: number }[] = [];
  speed = 105;
  table: Table;
  eatT = 0;
  paidFrac = 1;

  constructor(scene: Phaser.Scene, table: Table, order: Recipe) {
    this.table = table;
    this.order = order;
    const gi = Phaser.Math.Between(0, 5);
    this.img = scene.add.image(0, 0, 'guest_' + gi).setDisplaySize(56, 84);
    scene.add.existing(this.img);
    this.c = scene.add.container(DOOR.x, DOOR.y + 30, [this.img]);
    this.c.setDepth(DOOR.y);
    // Order bubble.
    this.bubble = scene.add.container(0, -78);
    const b = scene.add.image(0, 0, 'bubble').setDisplaySize(62, 78);
    const dish = scene.add.image(0, -10, order.icon).setDisplaySize(40, 40);
    const pbg = scene.add.rectangle(0, 30, 56, 8, 0x3d2412);
    this.patFill = scene.add.rectangle(-26, 30, 52, 5, 0x4fae5a).setOrigin(0, 0.5);
    this.bubble.add([b, dish, pbg, this.patFill]);
    this.bubble.setVisible(false);
    this.c.add(this.bubble);
    this.waypoints = [
      { x: DOOR.x, y: 540 },
      { x: table.x, y: 540 },
      { x: table.x, y: table.y + 54 },
    ];
    this.maxPatience = 70 + Math.random() * 25;
    this.patience = this.maxPatience;
  }

  sit() {
    this.state = 'waiting';
    this.bubble.setVisible(true);
    sfx.pop();
  }

  update(dt: number, scene: GameScene) {
    const s = dt / 1000;
    if (this.state === 'entering' || this.state === 'leaving') {
      const wp = this.waypoints[0];
      if (!wp) { this.finishWalk(scene); return; }
      const dx = wp.x - this.c.x, dy = wp.y - this.c.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) { this.waypoints.shift(); return; }
      const step = Math.min(d, this.speed * s);
      this.c.x += (dx / d) * step;
      this.c.y += (dy / d) * step;
      this.img.setFlipX(dx < -2);
      this.c.setDepth(this.c.y);
      // walk bob
      this.img.y = Math.sin(performance.now() / 90) * 2.5;
    } else if (this.state === 'waiting') {
      this.img.y = Math.sin(performance.now() / 500 + this.c.x) * 1.5;
      this.patience -= s;
      const f = Math.max(0, this.patience / this.maxPatience);
      this.patFill.setScale(Math.max(0.001, f), 1);
      this.patFill.setFillStyle(f > 0.5 ? 0x4fae5a : f > 0.25 ? 0xe8c93d : 0xd94f3d);
      if (this.patience <= 0) scene.guestAngry(this);
    } else if (this.state === 'eating') {
      this.img.y = Math.abs(Math.sin(performance.now() / 160)) * -3;
      this.eatT -= s;
      if (this.eatT <= 0) scene.guestPaid(this);
    }
  }

  private finishWalk(scene: GameScene) {
    this.img.y = 0;
    if (this.state === 'entering') this.sit();
    else scene.removeGuest(this);
  }

  destroy() { this.c.destroy(true); }
}

interface Obstacle { x: number; y: number; w: number; h: number; }

export class GameScene extends Phaser.Scene {
  private save!: SaveData;
  private player!: Phaser.GameObjects.Container;
  private carriedImg!: Phaser.GameObjects.Image;
  private tables: Table[] = [];
  private guests: Guest[] = [];
  private obstacles: Obstacle[] = [];
  private counterDishes: Dish[] = [];
  private counterImgs: Phaser.GameObjects.GameObject[] = [];
  private carrying: Dish | null = null;
  private coins = 0; private rep = 50; private day = 1;
  private timeLeft = DAY_LENGTH; private spawnT = 3;
  private paused = false; private dayOver = false;
  private stats = { earned: 0, served: 0, happy: 0, angry: 0 };
  private cookPanel!: CookPanel;
  private shopPanel!: ShopPanel;
  private hud!: Phaser.GameObjects.Container;
  private coinText!: Phaser.GameObjects.Text;
  private repText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;
  private clockBar!: Phaser.GameObjects.Rectangle;
  private promptText!: Phaser.GameObjects.Text;
  private actionBtn!: Phaser.GameObjects.Container;
  private actionLabel!: Phaser.GameObjects.Text;
  private actionBg!: Phaser.GameObjects.Arc;
  private target: { type: 'stove' | 'counter' | 'table'; table?: Table } | null = null;
  private joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  private joyG!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stoveImgs: Phaser.GameObjects.Image[] = [];
  private toastT: Phaser.GameObjects.Text | null = null;

  constructor() { super('game'); }

  create(data: { fresh?: boolean }) {
    this.save = loadSave() || defaultSave();
    if (data.fresh) this.save = loadSave() || defaultSave();
    this.coins = this.save.coins; this.rep = this.save.rep; this.day = this.save.day;
    this.stats = { earned: 0, served: 0, happy: 0, angry: 0 };
    this.paused = false; this.dayOver = false;
    this.timeLeft = DAY_LENGTH; this.spawnT = 2.5;
    this.tables = []; this.guests = []; this.obstacles = [];
    this.counterDishes = []; this.counterImgs = []; this.carrying = null;
    this.stoveImgs = [];

    this.buildRoom();
    this.buildPlayer();
    this.buildHUD();
    this.buildInput();

    this.cookPanel = new CookPanel(this);
    this.shopPanel = new ShopPanel(this);

    // Debug hooks for automated verification.
    (window as any).__rahsa = {
      spawnGuest: () => this.dbgSpawnGuest(),
      cookDish: (id: string, q: Quality) => this.onCookDone(RECIPES.find(r => r.id === id)!, q),
      pickup: () => this.pickupDish(),
      serve: () => this.dbgServe(),
      teleport: (x: number, y: number) => this.player.setPosition(x, y),
      cookOpen: () => this.cookPanel.open,
      mgActive: () => this.cookPanel.minigameActive,
      state: () => ({
        coins: this.coins, rep: this.rep, day: this.day,
        guests: this.guests.length,
        waiting: this.guests.filter(g => g.state === 'waiting').length,
        counter: this.counterDishes.length,
        carrying: !!this.carrying,
      }),
    };
  }

  // ---------------- room ----------------
  private buildRoom() {
    // Floor.
    for (let x = FLOOR.x0; x < FLOOR.x1; x += 48) {
      for (let y = FLOOR.y0; y < FLOOR.y1; y += 48) {
        const tx = Math.floor(x / 48), ty = Math.floor(y / 48);
        this.add.image(x, y, (tx + ty) % 2 ? 'tile_floor' : 'tile_floor2')
          .setOrigin(0).setDisplaySize(48, 48).setDepth(0);
      }
    }
    // Walls: top + sides + bottom.
    for (let x = 0; x < W; x += 48) {
      this.add.image(x, 16, 'tile_walltop').setOrigin(0).setDisplaySize(48, 64).setDepth(1);
      this.add.image(x, 576, 'tile_wall').setOrigin(0).setDisplaySize(48, 64).setDepth(1);
    }
    for (let y = 64; y < 576; y += 48) {
      this.add.image(0, y, 'tile_wall').setOrigin(0).setDisplaySize(48, 48).setDepth(1);
      this.add.image(912, y, 'tile_wall').setOrigin(0).setDisplaySize(48, 48).setDepth(1);
    }
    // Door on bottom wall.
    this.add.image(DOOR.x - 40, 584, 'tile_door').setDisplaySize(80, 56).setDepth(2);
    // Rug under door.
    this.add.image(DOOR.x, 540, 'tile_rug').setDisplaySize(120, 60).setDepth(0.5);

    // Hanging sign on top wall (below the HUD bar).
    this.add.image(480, 78, 'sign_blank').setDisplaySize(120, 103).setDepth(50);
    this.add.text(480, 74, 'Rahsa Cafe', {
      fontFamily: 'monospace', fontSize: '15px', color: '#fff7e8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);

    // Kitchen counter (decorative) + serving counter.
    const kc = this.add.image(520, 140, 'furn_counter').setDisplaySize(220, 90).setDepth(140);
    this.obstacles.push({ x: 410, y: 95, w: 220, h: 90 });
    const sc = this.add.image(770, 150, 'furn_serve').setDisplaySize(170, 100).setDepth(150);
    this.obstacles.push({ x: 685, y: 100, w: 170, h: 100 });
    this.add.text(770, 205, 'PICK UP', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffd94d', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(151);

    // Stoves.
    for (let i = 0; i < this.save.stations; i++) this.addStove(i);

    // Tables.
    for (let i = 0; i < this.save.tables; i++) this.addTable(i);

    // Decor.
    for (let i = 0; i < this.save.decor; i++) this.addDecor(i);
    // Rooms.
    for (let i = 0; i < this.save.rooms; i++) this.addRoom(i);
    void kc; void sc;
  }

  private addStove(i: number) {
    const p = STOVE_SPOTS[i];
    const img = this.add.image(p.x, p.y, 'furn_stove').setDisplaySize(96, 96).setDepth(p.y);
    this.stoveImgs.push(img);
    this.obstacles.push({ x: p.x - 44, y: p.y - 40, w: 88, h: 80 });
    this.add.text(p.x, p.y + 56, 'COOK', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd94d', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(p.y + 1);
  }

  private addTable(i: number) {
    const p = TABLE_SPOTS[i];
    const img = this.add.image(p.x, p.y, i % 2 ? 'furn_table_sq' : 'furn_table_round')
      .setDisplaySize(104, 104).setDepth(p.y);
    this.add.image(p.x, p.y - 62, 'furn_chair').setDisplaySize(44, 44).setDepth(p.y - 62);
    this.add.image(p.x, p.y + 62, 'furn_chair').setDisplaySize(44, 44).setDepth(p.y + 62);
    this.tables.push({ x: p.x, y: p.y, img, guest: null });
    this.obstacles.push({ x: p.x - 48, y: p.y - 34, w: 96, h: 68 });
  }

  private addDecor(i: number) {
    const p = DECOR_SPOTS[i];
    this.add.image(p.x, p.y, p.k).setDisplaySize(64, 76).setDepth(p.y);
  }

  private addRoom(i: number) {
    const p = ROOM_SPOTS[i];
    this.add.image(p.x, p.y, 'tile_door').setDisplaySize(44, 62).setDepth(60);
  }

  // ---------------- player ----------------
  private buildPlayer() {
    this.player = buildCharacter(this, this.save.char, 0.13);
    this.player.setPosition(480, 470).setDepth(470);
    this.carriedImg = this.add.image(0, -72, 'food_0').setDisplaySize(40, 40).setVisible(false);
    this.player.add(this.carriedImg);
  }

  // ---------------- HUD ----------------
  private txtBtn(x: number, y: number, w: number, h: number, label: string, cb: () => void, color = 0x6b4423) {
    const c = this.add.container(x, y).setDepth(300);
    const r = this.add.rectangle(0, 0, w, h, color).setStrokeStyle(3, 0x3d2412);
    const t = this.add.text(0, 0, label, {
      fontFamily: 'monospace', fontSize: '17px', color: '#fff7e8', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add([r, t]);
    r.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation(); sfx.click(); cb();
    });
    return c;
  }

  private buildHUD() {
    this.hud = this.add.container(0, 0).setDepth(300);
    const bar = this.add.rectangle(0, 0, W, 46, 0x2a1a0e).setOrigin(0).setAlpha(0.92);
    this.dayText = this.add.text(16, 23, `Day ${this.day}`, {
      fontFamily: 'monospace', fontSize: '19px', color: '#fff7e8', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.add.rectangle(150, 23, 170, 14, 0x3d2412).setOrigin(0, 0.5);
    this.clockBar = this.add.rectangle(152, 23, 166, 10, 0xffd94d).setOrigin(0, 0.5);
    this.coinText = this.add.text(380, 23, '', {
      fontFamily: 'monospace', fontSize: '19px', color: '#ffd94d', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.repText = this.add.text(560, 23, '', {
      fontFamily: 'monospace', fontSize: '19px', color: '#ff9ec6', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.hud.add([bar, this.dayText, this.clockBar, this.coinText, this.repText]);
    this.txtBtn(770, 23, 100, 34, 'Shop', () => this.openShop());
    this.txtBtn(892, 23, 56, 34, 'II', () => this.pauseGame());
    this.refreshHUD();

    // Action button (touch) bottom-right.
    this.actionBtn = this.add.container(872, 548).setDepth(310).setVisible(false);
    this.actionBg = this.add.circle(0, 0, 46, 0x4fae5a).setStrokeStyle(4, 0x1d2f1a).setAlpha(0.9);
    this.actionLabel = this.add.text(0, 0, 'Cook', {
      fontFamily: 'monospace', fontSize: '19px', color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.actionBg.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation(); this.tryInteract();
    });
    this.actionBtn.add([this.actionBg, this.actionLabel]);
    this.promptText = this.add.text(872, 486, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#fff7e8', fontStyle: 'bold',
      stroke: '#3d2412', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(310).setVisible(false);
  }

  private refreshHUD() {
    this.coinText.setText(`${this.coins}c`);
    this.repText.setText(`♥ ${this.rep}`);
    this.dayText.setText(`Day ${this.day}`);
  }

  // ---------------- input ----------------
  private buildInput() {
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
      kb.on('keydown-ESC', () => this.pauseGame());
    }
    this.joyG = this.add.graphics().setDepth(305);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.ensure();
      if (this.paused || this.cookPanel.open || this.shopPanel.open) return;
      if (p.x < W * 0.62 && p.y > 60 && !this.joy.active) {
        this.joy = { active: true, id: p.id, ox: p.x, oy: p.y, dx: 0, dy: 0 };
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.joy.active || p.id !== this.joy.id) return;
      let dx = p.x - this.joy.ox, dy = p.y - this.joy.oy;
      const d = Math.hypot(dx, dy), max = 52;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      this.joy.dx = dx / max; this.joy.dy = dy / max;
    });
    const endJoy = (p: Phaser.Input.Pointer) => {
      if (this.joy.active && p.id === this.joy.id) this.joy.active = false;
    };
    this.input.on('pointerup', endJoy);
    this.input.on('pointerupoutside', endJoy);
  }

  private drawJoy() {
    this.joyG.clear();
    if (!this.joy.active) return;
    this.joyG.fillStyle(0xffffff, 0.18);
    this.joyG.fillCircle(this.joy.ox, this.joy.oy, 48);
    this.joyG.fillStyle(0xffffff, 0.4);
    this.joyG.fillCircle(this.joy.ox + this.joy.dx * 48, this.joy.oy + this.joy.dy * 48, 22);
  }

  // ---------------- update ----------------
  update(_t: number, dt: number) {
    if (this.paused) return;
    const s = Math.min(dt / 1000, 0.05);

    // Day timer.
    if (!this.dayOver) {
      this.timeLeft -= s;
      this.clockBar.setScale(Math.max(0.001, this.timeLeft / DAY_LENGTH), 1);
      if (this.timeLeft <= 0) { this.endDay(); return; }
    }

    // Spawning.
    this.spawnT -= s;
    if (this.spawnT <= 0 && !this.dayOver) {
      const interval = 13 - (this.rep / 100) * 7;
      this.spawnT = interval * (0.8 + Math.random() * 0.5);
      this.spawnGuest();
    }

    this.movePlayer(s);
    for (const gu of [...this.guests]) gu.update(dt, this);
    this.scanInteract();
    this.drawJoy();
    this.cookPanel.update(_t, dt);

    // Keyboard interact.
    if (this.input.keyboard && !this.cookPanel.open && !this.shopPanel.open) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
        this.tryInteract();
      }
    } else if (this.cookPanel.minigameActive && this.input.keyboard) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) {
        this.cookPanel.stopMinigame();
      }
    }
  }

  private movePlayer(s: number) {
    let vx = 0, vy = 0;
    if (this.joy.active) { vx = this.joy.dx; vy = this.joy.dy; }
    if (this.keys) {
      if (this.keys.A.isDown || this.keys.LEFT.isDown) vx -= 1;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) vx += 1;
      if (this.keys.W.isDown || this.keys.UP.isDown) vy -= 1;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) vy += 1;
    }
    const d = Math.hypot(vx, vy);
    const p = this.player as unknown as Phaser.GameObjects.Container & { x: number; y: number };
    if (d > 0.12) {
      const sp = 235 * Math.min(1, d);
      let nx = p.x + (vx / Math.max(1, d)) * sp * s;
      let ny = p.y + (vy / Math.max(1, d)) * sp * s;
      nx = Phaser.Math.Clamp(nx, FLOOR.x0 + 16, FLOOR.x1 - 16);
      ny = Phaser.Math.Clamp(ny, FLOOR.y0 + 30, FLOOR.y1 - 14);
      // Obstacle push-out (circle r=15).
      for (const o of this.obstacles) {
        const cx = Phaser.Math.Clamp(nx, o.x, o.x + o.w);
        const cy = Phaser.Math.Clamp(ny, o.y, o.y + o.h);
        const ddx = nx - cx, ddy = ny - cy;
        const dd = Math.hypot(ddx, ddy);
        if (dd < 15) {
          if (dd > 0.01) { nx = cx + (ddx / dd) * 15; ny = cy + (ddy / dd) * 15; }
          else { ny = o.y + o.h + 15; }
        }
      }
      p.x = nx; p.y = ny;
      p.setDepth(ny);
      const parts = (p as any).list as Phaser.GameObjects.Image[];
      if (vx < -0.1) parts.forEach(i => i.setFlipX(true));
      else if (vx > 0.1) parts.forEach(i => i.setFlipX(false));
      p.y += 0; // depth already set
      const bobY = Math.sin(performance.now() / 110) * 2;
      parts.forEach(i => { if (i !== this.carriedImg) i.y = bobY; });
    } else {
      const parts = (p as any).list as Phaser.GameObjects.Image[];
      parts.forEach(i => { if (i !== this.carriedImg) i.y = 0; });
    }
  }

  // ---------------- guests ----------------
  private spawnGuest(forceOrder?: Recipe) {
    const free = this.tables.filter(t => !t.guest);
    if (!free.length || this.guests.length >= this.tables.length) return;
    const table = free[Math.floor(Math.random() * free.length)];
    const unlocked = RECIPES.filter(r => this.save.recipes.includes(r.id));
    const order = forceOrder || unlocked[Math.floor(Math.random() * unlocked.length)];
    const g = new Guest(this, table, order);
    table.guest = g;
    this.guests.push(g);
  }

  guestAngry(g: Guest) {
    if (g.state !== 'waiting') return;
    g.state = 'leaving';
    g.bubble.setVisible(false);
    g.waypoints = [{ x: DOOR.x, y: 540 }, { x: DOOR.x, y: DOOR.y + 30 }];
    if (g.table.guest === g) g.table.guest = null;
    this.rep = Math.max(0, this.rep - 3);
    this.stats.angry++;
    sfx.angry();
    this.popup(g.c.x, g.c.y - 110, 'Too slow!', '#ff9a8a');
    this.toast('A guest stormed out. (-3 rep)');
    this.refreshHUD();
  }

  guestPaid(g: Guest) {
    if (g.state !== 'eating') return;
    const frac = Math.max(0, g.patience / g.maxPatience);
    const pay = Math.round(g.order.price * QUALITY_MULT[g.paidQuality] * (0.75 + 0.5 * frac));
    this.coins += pay;
    this.stats.earned += pay;
    this.stats.served++; this.stats.happy++;
    this.save.servedTotal++;
    this.rep = Math.min(100, this.rep + (g.paidQuality === 'perfect' ? 2 : 1));
    sfx.coin(); sfx.happy();
    this.popup(g.c.x, g.c.y - 110, `+${pay}c`, '#ffd94d');
    g.state = 'leaving';
    g.waypoints = [{ x: DOOR.x, y: 540 }, { x: DOOR.x, y: DOOR.y + 30 }];
    if (g.table.guest === g) g.table.guest = null;
    this.refreshHUD();
  }

  removeGuest(g: Guest) {
    this.guests = this.guests.filter(x => x !== g);
    g.destroy();
  }

  // ---------------- interaction ----------------
  private dist(ax: number, ay: number, bx: number, by: number) {
    return Math.hypot(ax - bx, ay - by);
  }

  private scanInteract() {
    if (this.cookPanel.open || this.shopPanel.open || this.dayOver) {
      this.setPrompt(null); return;
    }
    const px = this.player.x, py = this.player.y;
    // Serve first.
    if (this.carrying) {
      for (const t of this.tables) {
        const g = t.guest;
        if (g && g.state === 'waiting' && this.dist(px, py, t.x, t.y) < 110) {
          if (g.order.id === this.carrying.recipe.id) { this.setPrompt({ type: 'table', table: t }, 'Serve'); return; }
          this.setPrompt(null, 'Wrong dish!'); return;
        }
      }
      this.setPrompt(null); return;
    }
    // Pick up from serving counter.
    if (this.counterDishes.length && this.dist(px, py, 770, 190) < 120) {
      this.setPrompt({ type: 'counter' }, 'Take dish'); return;
    }
    // Cook at a stove.
    for (const st of this.stoveImgs) {
      if (this.dist(px, py, st.x, st.y + 30) < 100) { this.setPrompt({ type: 'stove' }, 'Cook'); return; }
    }
    this.setPrompt(null);
  }

  private setPrompt(t: { type: 'stove' | 'counter' | 'table'; table?: Table } | null, label = '') {
    this.target = t;
    const show = !!t || !!label;
    this.actionBtn.setVisible(!!t);
    this.promptText.setVisible(show);
    if (t) { this.actionLabel.setText(label); this.promptText.setText(label + '  [E]'); }
    else if (label) { this.promptText.setText(label); }
  }

  private tryInteract() {
    if (!this.target || this.paused || this.dayOver) return;
    if (this.target.type === 'stove') this.openCook();
    else if (this.target.type === 'counter') this.pickupDish();
    else if (this.target.type === 'table' && this.target.table) this.serveDish(this.target.table);
  }

  private openCook() {
    const unlocked = RECIPES.filter(r => this.save.recipes.includes(r.id));
    this.cookPanel.show(unlocked, this.save.stoveLevel, (r, q) => this.onCookDone(r, q), () => undefined);
  }

  private onCookDone(recipe: Recipe, quality: Quality) {
    if (this.counterDishes.length >= 6) {
      this.toast('Counter is full — serve dishes first!');
      return;
    }
    this.counterDishes.push({ recipe, quality });
    this.renderCounter();
    this.toast(`${recipe.name} ready (${quality})!`);
  }

  private renderCounter() {
    this.counterImgs.forEach(i => i.destroy());
    this.counterImgs = [];
    this.counterDishes.forEach((d, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const img = this.add.image(720 + col * 50, 130 + row * 42, d.recipe.icon)
        .setDisplaySize(40, 40).setDepth(152);
      const q = this.add.circle(736 + col * 50, 116 + row * 42, 7,
        d.quality === 'perfect' ? 0xffd94d : d.quality === 'good' ? 0x9fe870 : 0x8a5a3b).setDepth(153);
      this.counterImgs.push(img, q);
    });
  }

  private pickupDish() {
    if (this.carrying || !this.counterDishes.length) return;
    const d = this.counterDishes.shift()!;
    this.carrying = d;
    this.carriedImg.setTexture(d.recipe.icon).setVisible(true);
    this.renderCounter();
    sfx.pickup();
  }

  private serveDish(table: Table) {
    const g = table.guest;
    if (!g || g.state !== 'waiting' || !this.carrying) return;
    if (g.order.id !== this.carrying.recipe.id) { this.toast(`They ordered ${g.order.name}!`); return; }
    g.paidQuality = this.carrying.quality;
    g.paidFrac = Math.max(0, g.patience / g.maxPatience);
    g.state = 'eating';
    g.eatT = 3.5;
    g.bubble.setVisible(false);
    this.carrying = null;
    this.carriedImg.setVisible(false);
    sfx.serve();
    this.popup(table.x, table.y - 80, g.paidQuality === 'perfect' ? 'Perfect!' : 'Served!', '#9fe870');
  }

  // ---------------- shop ----------------
  private openShop() {
    if (this.shopPanel.open || this.dayOver) return;
    const shop: ShopState = {
      tables: this.save.tables, stations: this.save.stations, stoveLevel: this.save.stoveLevel,
      recipes: this.save.recipes, rooms: this.save.rooms, decor: this.save.decor,
    };
    this.shopPanel.show(() => this.coins, shop, id => this.doBuy(id, shop), () => undefined);
  }

  private doBuy(id: string, shop: ShopState): string | null {
    return this.applyBuy(id, shop);
  }

  private applyBuy(id: string, shop: ShopState): string | null {
    const fail = (m: string) => m;
    if (id === 'table') {
      if (shop.tables >= 6) return fail('Max tables reached');
      const price = 80 + (shop.tables - 2) * 60;
      if (this.coins < price) return fail('Not enough coins');
      this.coins -= price; shop.tables++; this.save.tables++;
      this.addTable(shop.tables - 1);
    } else if (id === 'station') {
      if (shop.stations >= 2) return fail('Max stations reached');
      if (this.coins < 150) return fail('Not enough coins');
      this.coins -= 150; shop.stations++; this.save.stations++;
      this.addStove(shop.stations - 1);
    } else if (id === 'stove') {
      if (shop.stoveLevel >= 3) return fail('Max level reached');
      const price = 90 + shop.stoveLevel * 60;
      if (this.coins < price) return fail('Not enough coins');
      this.coins -= price; shop.stoveLevel++; this.save.stoveLevel++;
    } else if (id === 'room') {
      if (shop.rooms >= 3) return fail('Max rooms reached');
      const price = 200 + shop.rooms * 100;
      if (this.coins < price) return fail('Not enough coins');
      this.coins -= price; shop.rooms++; this.save.rooms++;
      this.addRoom(shop.rooms - 1);
      this.toast('Guest room opened upstairs!');
    } else if (id === 'decor') {
      if (shop.decor >= 5) return fail('Fully decorated');
      const price = 40 + shop.decor * 30;
      if (this.coins < price) return fail('Not enough coins');
      this.coins -= price; shop.decor++; this.save.decor++;
      this.rep = Math.min(100, this.rep + 4);
      this.addDecor(shop.decor - 1);
    } else if (id.startsWith('recipe_')) {
      const rid = id.slice(7);
      const r = RECIPES.find(x => x.id === rid)!;
      if (shop.recipes.includes(rid)) return fail('Already known');
      if (this.coins < r.cost) return fail('Not enough coins');
      this.coins -= r.cost; shop.recipes.push(rid); this.save.recipes.push(rid);
      this.toast(`New recipe: ${r.name}!`);
    } else return fail('Unknown item');
    this.refreshHUD();
    this.persist();
    return null;
  }

  // ---------------- day cycle ----------------
  private endDay() {
    this.dayOver = true;
    this.cookPanel.hide(); this.shopPanel.hide();
    const roomIncome = this.save.rooms * ROOM_NIGHTLY;
    this.coins += roomIncome;
    const s = {
      day: this.day, earned: this.stats.earned, served: this.stats.served,
      happy: this.stats.happy, angry: this.stats.angry,
      roomIncome, rep: this.rep, coins: this.coins,
    };
    this.persist();
    showDaySummary(this, s, () => this.startNextDay());
  }

  private startNextDay() {
    this.day++;
    this.save.day = this.day;
    this.timeLeft = DAY_LENGTH;
    this.dayOver = false;
    this.stats = { earned: 0, served: 0, happy: 0, angry: 0 };
    // Clear guests.
    for (const g of this.guests) { if (g.table.guest === g) g.table.guest = null; g.destroy(); }
    this.guests = [];
    this.refreshHUD();
    this.persist();
  }

  private pauseGame() {
    if (this.dayOver || this.paused) return;
    this.paused = true;
    showPause(this, () => { this.paused = false; }, () => {
      this.persist();
      this.scene.start('title');
    });
  }

  // ---------------- helpers ----------------
  private persist() {
    this.save.coins = this.coins; this.save.rep = this.rep; this.save.day = this.day;
    saveSave(this.save);
  }

  private toast(msg: string) {
    if (this.toastT) this.toastT.destroy();
    this.toastT = this.add.text(W / 2, H - 90, msg, {
      fontFamily: 'monospace', fontSize: '17px', color: '#fff7e8', fontStyle: 'bold',
      backgroundColor: '#3d2412', padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setDepth(400);
    this.time.delayedCall(2200, () => { this.toastT?.destroy(); this.toastT = null; });
  }

  private popup(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '20px', color, fontStyle: 'bold',
      stroke: '#3d2412', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(350);
    this.tweens.add({
      targets: t, y: y - 44, alpha: 0, duration: 1100, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ---------------- debug hooks ----------------
  private dbgSpawnGuest() {
    const free = this.tables.filter(t => !t.guest);
    if (!free.length) return 'no-table';
    const order = RECIPES.find(r => r.id === 'curry')!;
    const g = new Guest(this, free[0], order);
    free[0].guest = g;
    this.guests.push(g);
    // Fast-forward the walk.
    g.waypoints = [];
    g.c.setPosition(free[0].x, free[0].y + 54).setDepth(free[0].y + 54);
    g.sit();
    return 'ok';
  }

  private dbgServe() {
    const g = this.guests.find(x => x.state === 'waiting');
    if (!g) return 'no-waiting-guest';
    if (!this.carrying) return 'not-carrying';
    g.order = this.carrying.recipe; // test-only: align order
    this.serveDish(g.table);
    return 'ok';
  }
}
