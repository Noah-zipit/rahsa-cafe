import * as THREE from 'three';
import {
  RECIPES, RECIPE_MAP, SHOP_ITEMS, QUALITY_MULT,
  TABLE_SPOTS, STOVE_SPOTS, DECOR_SPOTS, KITCHEN_POS, COUNTER_POS, ROOM_SPOTS,
  ROOM_NIGHTLY, GUEST_SPAWN, PLAYER_START, FLOOR_BOUNDS, DAY_LENGTH,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  Recipe, ShopItem, CharCustom,
} from './data';
import {
  buildRoom, buildEnvironment, setupLights, setupCamera, placeGLB, makeCharacter, makeFood,
  makeBubble, setPatience, pottedPlant, wallShelf, buildInnRoom, innDivider,
  rugMesh, pendantLamp, tableCenterpiece, ginghamTexture, preloadIcons,
  CharParts, loadModel, normalizeModel,
} from './three';
import { sfx } from '../systems/audio';
import { SaveData, loadSave, saveSave, defaultSave } from '../systems/save';

export interface HudState { day: number; coins: number; rep: number; clockFrac: number; timeLabel: string }
export interface SummaryData {
  day: number; revenue: number; served: number; angry: number;
  roomsIncome: number; rep: number; coins: number;
}
export interface SimHooks {
  hud(s: HudState): void;
  prompt(label: string | null, action: string | null): void;
  openCook(stoveIdx: number): void;
  openShop(): void;
  openPause(): void;
  openSummary(d: SummaryData): void;
  toast(text: string): void;
}

export interface InteractTarget { kind: 'stove' | 'counter' | 'table'; idx: number }

interface Dish { recipe: Recipe; quality: 'perfect' | 'good' | 'burnt' }
interface Cook { recipe: Recipe; remaining: number; total: number; quality: 'perfect' | 'good' | 'burnt'; barFg: THREE.Object3D; group: THREE.Group }
interface GuestEnt {
  parts: CharParts; x: number; z: number;
  state: 'entering' | 'toTable' | 'ordering' | 'eating' | 'leaving';
  wp: { x: number; z: number }[];
  tableIdx: number; recipe: Recipe;
  patience: number; maxPatience: number;
  eatT: number; angry: boolean;
  bubble: THREE.Group | null; barFg: THREE.Object3D | null;
  tableFood: THREE.Object3D | null;
  phase: number;
}
interface TableEnt { idx: number; x: number; z: number; group: THREE.Group; guest: GuestEnt | null }

const PLAYER_SPEED = 3.1;
const GUEST_SPEED = 1.55;

export class CafeSim {
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  hooks!: SimHooks;
  save: SaveData = loadSave() ?? defaultSave();
  input = { x: 0, z: 0 };
  paused = true;
  ready = false;

  player!: { parts: CharParts; x: number; z: number; carry: Dish | null; carryMesh: THREE.Group | null };
  tables: TableEnt[] = [];
  guests: GuestEnt[] = [];
  cooks: Cook[] = [];
  dishes: { dish: Dish; mesh: THREE.Group }[] = [];
  obstacles: { x: number; z: number; r: number }[] = [];
  counterGroup!: THREE.Group;
  stoveBars: { group: THREE.Group; barFg: THREE.Object3D }[] = [];
  decorGroup = new THREE.Group();
  roomsGroup = new THREE.Group();
  stoveLevelFx: THREE.Object3D[] = [];

  dayT = 0;
  spawnT = 2.5;
  interactT = 0;
  target: InteractTarget | null = null;
  dayStats = { revenue: 0, served: 0, angry: 0 };
  elapsed = 0;
  private hudT = 0;

  constructor() {
    this.scene.background = new THREE.Color(0x201510);
    this.scene.fog = new THREE.Fog(0x201510, 26, 46);
  }

  get stations() { return this.save.stations; }
  get stoveLevel() { return this.save.stoveLevel; }
  get tableCount() { return this.save.tables; }

  async init(aspect: number) {
    await preloadIcons(); // crisp AI dish icons for order bubbles
    this.camera = setupCamera(aspect, this.scene);
    buildRoom(this.scene);
    buildEnvironment(this.scene);
    setupLights(this.scene);
    this.scene.add(this.decorGroup, this.roomsGroup);

    // Inn nook divider (front-right corner).
    const div = innDivider();
    div.position.set(4.35, 0, 3.4);
    this.scene.add(div);
    this.obstacles.push(
      { x: 4.35, z: 2.1, r: 0.55 },
      { x: 4.35, z: 3.4, r: 0.55 },
      { x: 4.35, z: 4.7, r: 0.55 },
    );

    // Kitchen furniture.
    const stoveA = await placeGLB('stove', 1.05, STOVE_SPOTS[0].x, STOVE_SPOTS[0].z);
    const stoveB = await placeGLB('stove', 1.05, STOVE_SPOTS[1].x, STOVE_SPOTS[1].z);
    const sink = await placeGLB('sink', 1.0, KITCHEN_POS.sink.x, KITCHEN_POS.sink.z, Math.PI);
    const cab = await placeGLB('cabinet', 1.05, KITCHEN_POS.cabinet.x, KITCHEN_POS.cabinet.z, Math.PI);
    const cabD = await placeGLB('cabinet_drawer', 1.05, KITCHEN_POS.drawer.x, KITCHEN_POS.drawer.z, Math.PI);
    const fridge = await placeGLB('fridge', 1.5, KITCHEN_POS.fridge.x, KITCHEN_POS.fridge.z, Math.PI);
    for (const p of [stoveA, stoveB, sink, cab, cabD, fridge]) this.scene.add(p.obj);
    this.obstacles.push(
      { x: STOVE_SPOTS[0].x, z: STOVE_SPOTS[0].z, r: 0.75 },
      { x: STOVE_SPOTS[1].x, z: STOVE_SPOTS[1].z, r: 0.75 },
      { x: KITCHEN_POS.sink.x, z: KITCHEN_POS.sink.z, r: 0.7 },
      { x: KITCHEN_POS.cabinet.x, z: KITCHEN_POS.cabinet.z, r: 0.7 },
      { x: KITCHEN_POS.fridge.x, z: KITCHEN_POS.fridge.z, r: 0.7 },
    );

    // Serving counter (pickup).
    this.counterGroup = new THREE.Group();
    const bar = await placeGLB('bar', 0.95, 0, 0);
    this.counterGroup.add(bar.obj);
    this.counterGroup.position.set(COUNTER_POS.x, 0, COUNTER_POS.z);
    this.scene.add(this.counterGroup);
    this.obstacles.push({ x: COUNTER_POS.x, z: COUNTER_POS.z, r: 1.0 });

    // Cooking progress bars above stoves.
    for (const s of STOVE_SPOTS) {
      const g = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x3d2412, transparent: true, opacity: 0.85, depthTest: false }));
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.07),
        new THREE.MeshBasicMaterial({ color: 0xe8a13d, transparent: true, opacity: 0.95, depthTest: false }));
      fg.position.z = 0.001;
      g.add(bg, fg);
      g.position.set(s.x, 1.65, s.z);
      g.visible = false;
      g.renderOrder = 40;
      this.scene.add(g);
      this.stoveBars.push({ group: g, barFg: fg });
    }

    // Tables.
    for (let i = 0; i < this.tableCount; i++) await this.addTable(i);

    // Decor + rooms from save.
    for (let i = 0; i < this.save.decor; i++) this.addDecor(i);
    for (let i = 0; i < this.save.rooms; i++) this.addRoom(i);
    if (this.save.stoveLevel >= 2) this.addStoveFx();
    if (this.save.stations > 1) this.addStationFx();

    // Player (staff apron).
    const parts = makeCharacter(this.save.char, true);
    parts.group.position.set(PLAYER_START.x, 0, PLAYER_START.z);
    this.scene.add(parts.group);
    this.player = { parts, x: PLAYER_START.x, z: PLAYER_START.z, carry: null, carryMesh: null };

    this.ready = true;
    this.paused = false;
    this.pushHud();
  }

  async addTable(i: number) {
    const s = TABLE_SPOTS[i];
    const g = new THREE.Group();
    // Round patterned rug under the table.
    const rug = rugMesh(1.3, i % 2 ? 0xb04038 : 0x3d7dd9, 0xe8c93d);
    rug.position.y = 0.012;
    g.add(rug);
    const isRound = i % 2 === 1;
    const t = await placeGLB(isRound ? 'table_round' : 'table_small', 0.78, 0, 0);
    g.add(t.obj);
    for (const side of [-1, 1]) {
      const c = await placeGLB('chair', 0.85, side * 0.95, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      c.obj.position.z = 0;
      g.add(c.obj);
    }
    // gingham tablecloth
    const clothTex = ginghamTexture(i % 2 ? '#c96058' : '#3d7dd9');
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.04, 12),
      new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.95 }));
    cloth.position.y = 0.795; cloth.castShadow = true;
    g.add(cloth);
    // flower centerpiece
    const center = tableCenterpiece();
    center.position.y = 0.815;
    g.add(center);
    // pendant lamp hanging above
    const lamp = pendantLamp();
    g.add(lamp);
    g.position.set(s.x, 0, s.z);
    this.scene.add(g);
    this.tables.push({ idx: i, x: s.x, z: s.z, group: g, guest: null });
    this.obstacles.push({ x: s.x, z: s.z, r: 0.85 });
  }

  addDecor(i: number) {
    const s = DECOR_SPOTS[i % DECOR_SPOTS.length];
    const g = new THREE.Group();
    if (i % 2 === 0) g.add(pottedPlant());
    else {
      const sh = wallShelf();
      sh.position.set(s.x, 1.7, -4.9);
      sh.rotation.y = 0;
      this.decorGroup.add(sh);
      return;
    }
    g.position.set(s.x, 0, s.z);
    this.decorGroup.add(g);
  }

  addRoom(i: number) {
    const s = ROOM_SPOTS[i % ROOM_SPOTS.length];
    const room = buildInnRoom();
    room.position.set(s.x, 0, s.z);
    this.roomsGroup.add(room);
    this.obstacles.push({ x: s.x, z: s.z, r: 1.0 });
  }

  addStoveFx() {
    for (const s of STOVE_SPOTS) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.22, 12),
        new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.5, metalness: 0.4, flatShading: true }));
      pot.position.set(s.x - 0.15, 1.12, s.z);
      pot.castShadow = true;
      this.scene.add(pot);
      this.stoveLevelFx.push(pot);
    }
  }

  addStationFx() {
    // extend the counter visually
    const ext = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x8a5f36, roughness: 0.9, flatShading: true }));
    ext.position.set(COUNTER_POS.x - 1.25, 0.45, COUNTER_POS.z);
    ext.castShadow = true; ext.receiveShadow = true;
    this.scene.add(ext);
    this.stoveLevelFx.push(ext);
  }

  // ---------- save/persist ----------
  persist() { saveSave(this.save); }

  // ---------- HUD ----------
  pushHud() {
    const m = Math.floor(this.dayT / 60), s = Math.floor(this.dayT % 60);
    this.hooks.hud({
      day: this.save.day, coins: this.save.coins, rep: this.save.rep,
      clockFrac: this.dayT / DAY_LENGTH,
      timeLabel: `${m}:${s.toString().padStart(2, '0')}`,
    });
  }

  // ---------- interaction ----------
  scanInteract() {
    const p = this.player;
    const found: { t: InteractTarget | null } = { t: null };
    let bestD = 1.9;
    const consider = (kind: InteractTarget['kind'], idx: number, x: number, z: number) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; found.t = { kind, idx }; }
    };
    STOVE_SPOTS.forEach((s, i) => consider('stove', i, s.x, s.z));
    consider('counter', 0, COUNTER_POS.x, COUNTER_POS.z);
    for (const t of this.tables) consider('table', t.idx, t.x, t.z);
    this.target = found.t;
    const best = found.t;
    if (!best) { this.hooks.prompt(null, null); return; }
    if (best.kind === 'stove') {
      this.hooks.prompt(
        this.dishes.length >= this.stations ? 'Counter is full' : 'Stove — cook a dish',
        this.dishes.length >= this.stations ? null : 'Cook');
    } else if (best.kind === 'counter') {
      if (this.player.carry) this.hooks.prompt('Carrying ' + this.player.carry.recipe.name, null);
      else if (this.dishes.length) this.hooks.prompt('Pick up ' + this.dishes[this.dishes.length - 1].dish.recipe.name, 'Pick up');
      else this.hooks.prompt('Counter is empty — cook at the stove', null);
    } else {
      const t = this.tables[best.idx];
      const g = t.guest;
      if (!g || g.state !== 'ordering') { this.hooks.prompt(null, null); return; }
      if (this.player.carry && this.player.carry.recipe.id === g.recipe.id)
        this.hooks.prompt('Serve ' + g.recipe.name, 'Serve');
      else if (this.player.carry)
        this.hooks.prompt(`They want ${g.recipe.name} — wrong dish`, null);
      else {
        const onCounter = this.dishes.some((d) => d.dish.recipe.id === g.recipe.id);
        this.hooks.prompt(onCounter ? `${g.recipe.name} is on the counter` : `Cook ${g.recipe.name} at the stove`, null);
      }
    }
  }

  doInteract() {
    const t = this.target;
    if (!t || this.paused) return;
    sfx.click();
    if (t.kind === 'stove') {
      if (this.dishes.length >= this.stations) { this.hooks.toast('Counter is full — serve dishes first'); return; }
      this.paused = true;
      this.hooks.openCook(t.idx);
    } else if (t.kind === 'counter') {
      if (this.player.carry || !this.dishes.length) return;
      const d = this.dishes.pop()!;
      this.scene.remove(d.mesh);
      this.player.carry = d.dish;
      this.attachCarry();
      sfx.pickup();
      this.layoutDishes();
    } else {
      const tbl = this.tables[t.idx];
      const g = tbl.guest;
      if (g && g.state === 'ordering' && this.player.carry && this.player.carry.recipe.id === g.recipe.id) {
        this.serve(g);
      }
    }
  }

  async attachCarry() {
    if (this.player.carryMesh) { this.player.parts.group.remove(this.player.carryMesh); this.player.carryMesh = null; }
    if (!this.player.carry) return;
    const mesh = await this.foodMesh(this.player.carry.recipe.id);
    mesh.position.y = 1.72;
    this.player.parts.group.add(mesh);
    this.player.carryMesh = mesh as THREE.Group;
  }

  async foodMesh(id: string): Promise<THREE.Group> {
    if (id === 'burger' || id === 'pizza') {
      const g = await loadModel(id);
      normalizeModel(g, 0.34);
      const wrap = new THREE.Group(); wrap.add(g);
      return wrap;
    }
    return makeFood(id) as THREE.Group;
  }

  serve(g: GuestEnt) {
    const dish = this.player.carry!;
    const frac = Math.max(0, g.patience / g.maxPatience);
    const pay = Math.round(dish.recipe.price * QUALITY_MULT[dish.quality] * (0.75 + 0.5 * frac));
    this.save.coins += pay;
    this.save.rep = Math.min(100, this.save.rep + (dish.quality === 'perfect' ? 2 : 1));
    this.dayStats.revenue += pay; this.dayStats.served++;
    this.player.carry = null;
    if (this.player.carryMesh) { this.player.parts.group.remove(this.player.carryMesh); this.player.carryMesh = null; }
    g.state = 'eating'; g.eatT = 3.5;
    if (g.bubble) { this.scene.remove(g.bubble); g.bubble = null; }
    this.foodMesh(dish.recipe.id).then((m) => {
      const t = this.tables[g.tableIdx];
      m.position.set(t.x, 0.82, t.z - 0.15);
      this.scene.add(m);
      g.tableFood = m;
    });
    if (dish.quality === 'perfect') sfx.perfect(); else sfx.serve();
    setTimeout(() => sfx.coin(), 250);
    this.hooks.toast(`+${pay}c ${dish.quality === 'perfect' ? 'Perfect!' : dish.quality === 'burnt' ? 'Burnt…' : 'Served'}`);
    this.persist();
    this.pushHud();
  }

  layoutDishes() {
    this.dishes.forEach((d, i) => {
      const n = this.dishes.length;
      d.mesh.position.set(COUNTER_POS.x + (i - (n - 1) / 2) * 0.55, 1.02, COUNTER_POS.z - 0.1);
    });
  }

  // ---------- cooking ----------
  beginCook(recipe: Recipe, quality: 'perfect' | 'good' | 'burnt') {
    const total = recipe.time;
    const bar = this.stoveBars.find((b) => !b.group.visible) ?? this.stoveBars[0];
    bar.group.visible = true;
    (bar.barFg as THREE.Mesh).scale.x = 0.01;
    (bar.barFg as THREE.Mesh).position.x = -0.42;
    this.cooks.push({ recipe, remaining: total, total, quality, barFg: bar.barFg, group: bar.group });
    sfx.sizzle();
  }

  finishCookSelect(recipe: Recipe, quality: 'perfect' | 'good' | 'burnt') {
    this.beginCook(recipe, quality);
    this.paused = false;
  }

  completeCook(c: Cook) {
    c.group.visible = false;
    const dish: Dish = { recipe: c.recipe, quality: c.quality };
    this.foodMesh(c.recipe.id).then((m) => {
      this.scene.add(m);
      this.dishes.push({ dish, mesh: m as THREE.Group });
      this.layoutDishes();
    });
    sfx.pop();
  }

  cancelCook() { this.paused = false; }

  // ---------- guests ----------
  spawnGuest(forceRecipe?: string) {
    const free = this.tables.filter((t) => !t.guest);
    if (!free.length) return null;
    const table = free[Math.floor(Math.random() * free.length)];
    const unlocked = RECIPES.filter((r) => this.save.recipes.includes(r.id));
    const recipe = forceRecipe ? RECIPE_MAP[forceRecipe]
      : unlocked[Math.floor(Math.random() * unlocked.length)];
    const parts = makeCharacter({
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      hairStyle: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      shirt: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
    });
    const side = table.idx % 2 === 0 ? 1 : -1;
    const chairPos = { x: table.x, z: table.z + side * 0.95 };
    parts.group.position.set(GUEST_SPAWN.x, 0, GUEST_SPAWN.z);
    this.scene.add(parts.group);
    const maxPatience = 70 + Math.random() * 25;
    const g: GuestEnt = {
      parts, x: GUEST_SPAWN.x, z: GUEST_SPAWN.z,
      state: 'entering',
      wp: [{ x: 0, z: 4.4 }, chairPos],
      tableIdx: table.idx, recipe,
      patience: maxPatience, maxPatience,
      eatT: 0, angry: false,
      bubble: null, barFg: null, tableFood: null,
      phase: Math.random() * 10,
    };
    table.guest = g;
    this.guests.push(g);
    return g;
  }

  seatGuest(g: GuestEnt) {
    g.state = 'ordering';
    g.parts.group.rotation.y = Math.PI; // face table (-z if chair on +z side)
    const table = this.tables[g.tableIdx];
    const side = table.idx % 2 === 0 ? 1 : -1;
    g.parts.group.rotation.y = side > 0 ? Math.PI : 0;
    const { group, bar } = makeBubble(g.recipe);
    group.position.set(g.x, 2.05, g.z);
    this.scene.add(group);
    g.bubble = group; g.barFg = bar as unknown as THREE.Object3D;
    sfx.pop();
  }

  guestLeave(g: GuestEnt, angry: boolean) {
    g.state = 'leaving'; g.angry = angry;
    if (g.bubble) { this.scene.remove(g.bubble); g.bubble = null; }
    if (g.tableFood) { this.scene.remove(g.tableFood); g.tableFood = null; }
    g.wp = [{ x: 0, z: 4.4 }, { x: GUEST_SPAWN.x, z: GUEST_SPAWN.z }];
    if (angry) {
      this.save.rep = Math.max(0, this.save.rep - 3);
      this.dayStats.angry++;
      sfx.angry();
      this.hooks.toast('Guest left angry! -3 rep');
      this.persist(); this.pushHud();
    }
  }

  removeGuest(g: GuestEnt) {
    this.scene.remove(g.parts.group);
    const t = this.tables[g.tableIdx];
    if (t.guest === g) t.guest = null;
    this.guests.splice(this.guests.indexOf(g), 1);
  }

  updateGuest(g: GuestEnt, dt: number) {
    g.phase += dt;
    const moveToward = (tx: number, tz: number, speed: number) => {
      const dx = tx - g.x, dz = tz - g.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) return true;
      const step = Math.min(d, speed * dt);
      g.x += (dx / d) * step; g.z += (dz / d) * step;
      g.parts.group.rotation.y = Math.atan2(dx, dz);
      g.parts.updateWalk(g.phase, true);
      return false;
    };
    if (g.state === 'entering' || g.state === 'toTable') {
      g.parts.updateWalk(g.phase, true);
      if (moveToward(g.wp[0].x, g.wp[0].z, GUEST_SPEED)) {
        g.wp.shift();
        if (!g.wp.length) {
          this.seatGuest(g);
        } else if (g.state === 'entering') {
          g.state = 'toTable';
        }
      }
    } else if (g.state === 'ordering') {
      g.parts.updateWalk(g.phase, false);
      g.patience -= dt;
      if (g.barFg) setPatience(g.barFg, g.patience / g.maxPatience);
      if (g.bubble) g.bubble.position.y = 2.05 + Math.sin(g.phase * 2.2) * 0.05;
      if (g.patience <= 0) this.guestLeave(g, true);
    } else if (g.state === 'eating') {
      g.parts.updateWalk(g.phase, false);
      g.eatT -= dt;
      if (g.eatT <= 0) { sfx.happy(); this.guestLeave(g, false); }
    } else if (g.state === 'leaving') {
      g.parts.updateWalk(g.phase, true);
      if (moveToward(g.wp[0].x, g.wp[0].z, GUEST_SPEED * 1.15)) {
        g.wp.shift();
        if (!g.wp.length) this.removeGuest(g);
      }
    }
    g.parts.group.position.set(g.x, 0, g.z);
  }

  // ---------- shop ----------
  buy(item: ShopItem): boolean {
    const s = this.save;
    if (item.maxed(s)) return false;
    const cost = item.price(s);
    if (s.coins < cost) return false;
    s.coins -= cost;
    sfx.buy();
    const id = item.id;
    if (id === 'table') { s.tables++; void this.addTable(s.tables - 1); }
    else if (id === 'station') { s.stations++; this.addStationFx(); }
    else if (id === 'stove') { s.stoveLevel++; if (s.stoveLevel === 2) this.addStoveFx(); }
    else if (id.startsWith('recipe_')) { s.recipes.push(id.slice(7)); }
    else if (id === 'decor') { this.addDecor(s.decor); s.decor++; s.rep = Math.min(100, s.rep + 4); }
    else if (id === 'room') { this.addRoom(s.rooms); s.rooms++; }
    this.persist(); this.pushHud();
    return true;
  }

  // ---------- day cycle ----------
  endDay() {
    this.paused = true;
    const roomsIncome = this.save.rooms * ROOM_NIGHTLY;
    this.save.coins += roomsIncome;
    const d: SummaryData = {
      day: this.save.day, revenue: this.dayStats.revenue, served: this.dayStats.served,
      angry: this.dayStats.angry, roomsIncome, rep: this.save.rep, coins: this.save.coins,
    };
    sfx.dayEnd();
    this.persist();
    this.hooks.openSummary(d);
  }

  nextDay() {
    this.save.day++;
    this.dayT = 0;
    this.dayStats = { revenue: 0, served: 0, angry: 0 };
    this.spawnT = 2;
    for (const g of [...this.guests]) this.removeGuest(g);
    this.persist();
    this.paused = false;
    this.pushHud();
  }

  // ---------- main update ----------
  update(dt: number) {
    if (!this.ready || this.paused) return;
    this.elapsed += dt;
    const t = this.elapsed;

    // Player movement.
    const p = this.player;
    const mx = this.input.x, mz = this.input.z;
    const moving = Math.hypot(mx, mz) > 0.12;
    if (moving) {
      const sp = PLAYER_SPEED * dt;
      p.x += mx * sp; p.z += mz * sp;
      p.parts.group.rotation.y = Math.atan2(mx, mz);
    }
    // Clamp + obstacles.
    p.x = Math.max(FLOOR_BOUNDS.x0, Math.min(FLOOR_BOUNDS.x1, p.x));
    p.z = Math.max(FLOOR_BOUNDS.z0, Math.min(FLOOR_BOUNDS.z1, p.z));
    for (const o of this.obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r && d > 0.001) { p.x = o.x + (dx / d) * o.r; p.z = o.z + (dz / d) * o.r; }
    }
    p.parts.group.position.set(p.x, 0, p.z);
    p.parts.updateWalk(t, moving);
    if (p.carryMesh) p.carryMesh.position.y = 1.72 + Math.sin(t * 3) * 0.03;

    // Interact scan.
    this.interactT -= dt;
    if (this.interactT <= 0) { this.interactT = 0.15; this.scanInteract(); }

    // Spawning.
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 13 - (this.save.rep / 100) * 7;
      if (this.tables.some((tb) => !tb.guest)) this.spawnGuest();
    }

    // Guests.
    for (const g of [...this.guests]) this.updateGuest(g, dt);

    // Cooking.
    for (const c of [...this.cooks]) {
      c.remaining -= dt;
      const f = 1 - Math.max(0, c.remaining) / c.total;
      (c.barFg as THREE.Mesh).scale.x = Math.max(0.01, f);
      (c.barFg as THREE.Mesh).position.x = -0.42 * (1 - f);
      if (c.remaining <= 0) {
        this.cooks.splice(this.cooks.indexOf(c), 1);
        this.completeCook(c);
      }
    }

    // Day timer.
    this.dayT += dt;
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.5; this.pushHud(); }
    if (this.dayT >= DAY_LENGTH) this.endDay();
  }

  setAppearance(c: CharCustom) {
    this.save.char = { ...c };
    this.player.parts.setAppearance(c);
    this.persist();
  }
}
// (quality is passed straight into beginCook by the minigame; no stash needed)
