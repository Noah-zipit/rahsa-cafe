import * as THREE from 'three';
import {
  RECIPES, RECIPE_MAP, SHOP_ITEMS, QUALITY_MULT, INGREDIENTS, ING_MAP,
  TABLE_SPOTS, STOVE_SPOTS, DECOR_SPOTS, KITCHEN_POS, COUNTER_POS, ROOM_SPOTS,
  ROOM_NIGHTLY, GUEST_SPAWN, PLAYER_START, FLOOR_BOUNDS, DAY_LENGTH,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  VIP_CHANCE, VIP_MIN_PRICE, VIP_TIP_MULT, VIP_PATIENCE_MULT,
  RUSH_TIMES, RUSH_DURATION, RUSH_SPAWN_DIV, RUSH_TIP_MULT,
  CRITIC_WINDOW, CRITIC_REP_WIN, CRITIC_REP_LOSE,
  MARKET_POS, MARKET_INTERACT_R,
  Recipe, ShopItem, CharCustom, Ingredient,
} from './data';
import {
  buildRoom, buildEnvironment, buildMarketStall, setupLights, setupCamera, placeGLB, makeCharacter, makeFood,
  makeBubble, setPatience, pottedPlant, wallShelf, buildInnRoom, innDivider,
  rugMesh, pendantLamp, tableCenterpiece, ginghamTexture, preloadIcons,
  initAmbientLife, updateAmbient, emitSteam, spawnReaction, makeVipRing,
  CharParts, loadModel, normalizeModel,
} from './three';
import { sfx } from '../systems/audio';
import { SaveData, loadSave, saveSave, defaultSave } from '../systems/save';

export interface HudState {
  day: number; coins: number; rep: number; clockFrac: number; timeLabel: string;
  pantry: Record<string, number>;
  rush: boolean;
}
export interface SummaryData {
  day: number; revenue: number; served: number; angry: number;
  roomsIncome: number; rep: number; coins: number;
  vips: number; criticNote: string | null;
}
export interface SimHooks {
  hud(s: HudState): void;
  prompt(label: string | null, action: string | null): void;
  openCook(stoveIdx: number): void;
  openShop(): void;
  openMarket(): void;
  openPause(): void;
  openSummary(d: SummaryData): void;
  toast(text: string): void;
  banner(title: string, sub: string): void;
  /** Screen-space juice: coin flies to HUD / hearts float up at a world position. */
  fx(kind: 'coin' | 'hearts', x: number, y: number, z: number): void;
}

export interface InteractTarget { kind: 'stove' | 'counter' | 'table' | 'market'; idx: number }

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
  vip: boolean; critic: boolean;
  vipRing: THREE.Group | null;
  bubbleAge: number; // for order-bubble pop-in
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
  dayStats = { revenue: 0, served: 0, angry: 0, vips: 0 };
  // Rush hours + food critic (expansion).
  rushT = 0; // seconds left in the active rush, 0 = none
  rushFired: boolean[] = [];
  criticSpawned = false;
  criticT = 0; // scheduled dayT for today's critic
  criticResult: 'great' | 'ok' | 'bad' | null = null;
  // Market.
  marketStall: THREE.Group | null = null;
  vendor: CharParts | null = null;
  moveTarget: { x: number; z: number } | null = null; // tap-to-move
  pendingAuto: InteractTarget | null = null; // auto-interact on arrival
  serveFlourishT = 0;
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
    initAmbientLife(this.scene); // butterflies, clouds, steam pool
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
    stoveA.obj.userData.pickTarget = { kind: 'stove', idx: 0 };
    stoveB.obj.userData.pickTarget = { kind: 'stove', idx: 1 };
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
    this.counterGroup.userData.pickTarget = { kind: 'counter', idx: 0 };
    this.scene.add(this.counterGroup);
    this.obstacles.push({ x: COUNTER_POS.x, z: COUNTER_POS.z, r: 1.0 });

    // Market stall out in the city square + vendor NPC.
    const stall = buildMarketStall();
    stall.position.set(MARKET_POS.x, -0.2, MARKET_POS.z);
    stall.rotation.y = 0.5; // face the cafe
    stall.userData.pickTarget = { kind: 'market', idx: 0 };
    this.scene.add(stall);
    this.marketStall = stall;
    this.obstacles.push({ x: MARKET_POS.x, z: MARKET_POS.z, r: 1.6 });
    const vendor = makeCharacter({ skin: 0xc07f45, hairStyle: 2, hairColor: 0xd9a441, shirt: 0x4fae5a }, true);
    vendor.group.position.set(MARKET_POS.x + 0.4, -0.2, MARKET_POS.z - 1.15);
    vendor.group.rotation.y = Math.PI + 0.5;
    this.scene.add(vendor.group);
    this.vendor = vendor;

    // Schedule today's incognito food critic.
    this.criticT = CRITIC_WINDOW[0] + Math.random() * (CRITIC_WINDOW[1] - CRITIC_WINDOW[0]);
    this.rushFired = RUSH_TIMES.map(() => false);

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
    g.userData.pickTarget = { kind: 'table', idx: i };
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

  // ---------- pantry / market ----------
  /** Units missing (empty = can cook). */
  missingFor(r: Recipe): string[] {
    return r.needs.filter((id: string) => (this.save.pantry[id] ?? 0) <= 0);
  }
  pantryHas(r: Recipe): boolean { return this.missingFor(r).length === 0; }
  consumePantry(r: Recipe) {
    for (const id of r.needs) this.save.pantry[id] = Math.max(0, (this.save.pantry[id] ?? 0) - 1);
    this.persist();
  }
  buyIngredient(id: string, qty: number): boolean {
    const ing = ING_MAP[id];
    if (!ing || qty <= 0) return false;
    const cost = ing.price * qty;
    if (this.save.coins < cost) return false;
    this.save.coins -= cost;
    this.save.pantry[id] = (this.save.pantry[id] ?? 0) + qty;
    sfx.buy();
    this.persist(); this.pushHud();
    return true;
  }

  // ---------- tap-to-move / tap-to-interact ----------
  /** Raycast the scene for a tagged interactable (stove/counter/table/market). */
  pickInteractable(nx: number, ny: number): InteractTarget | null {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hits = rc.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const tag = o.userData.pickTarget as InteractTarget | undefined;
        if (tag) return tag;
        o = o.parent;
      }
    }
    return null;
  }
  /** A walkable point near an interactable where the player should stand. */
  interactPoint(t: InteractTarget): { x: number; z: number } {
    if (t.kind === 'market') return { x: MARKET_POS.x + 1.77, z: MARKET_POS.z - 0.68 };
    if (t.kind === 'counter') return { x: COUNTER_POS.x, z: COUNTER_POS.z + 1.3 };
    if (t.kind === 'stove') { const s = STOVE_SPOTS[t.idx]; return { x: s.x + 0.9, z: s.z + 1.1 }; }
    const tb = this.tables[t.idx];
    const side = tb.idx % 2 === 0 ? 1 : -1;
    return { x: tb.x, z: tb.z + side * 1.3 };
  }
  /** Walk to a point; optionally auto-interact on arrival. */
  tapMoveTo(x: number, z: number, auto?: InteractTarget | null) {
    const cx = Math.max(FLOOR_BOUNDS.x0, Math.min(FLOOR_BOUNDS.x1, x));
    const cz = Math.max(FLOOR_BOUNDS.z0, Math.min(FLOOR_BOUNDS.z1, z));
    this.moveTarget = { x: cx, z: cz };
    this.pendingAuto = auto ?? null;
  }

  // ---------- HUD ----------
  pushHud() {
    const m = Math.floor(this.dayT / 60), s = Math.floor(this.dayT % 60);
    this.hooks.hud({
      day: this.save.day, coins: this.save.coins, rep: this.save.rep,
      clockFrac: this.dayT / DAY_LENGTH,
      timeLabel: `${m}:${s.toString().padStart(2, '0')}`,
      pantry: { ...this.save.pantry },
      rush: this.rushT > 0,
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
    // Market stall out in the square (generous radius; closest target wins).
    {
      const d = Math.hypot(p.x - MARKET_POS.x, p.z - MARKET_POS.z);
      if (d < MARKET_INTERACT_R && (found.t === null || d < bestD)) {
        bestD = d; found.t = { kind: 'market', idx: 0 };
      }
    }
    this.target = found.t;
    const best = found.t;
    if (!best) { this.hooks.prompt(null, null); return; }
    if (best.kind === 'market') {
      this.hooks.prompt('🧺 Market — buy ingredients', 'Market');
      return;
    }
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
      this.player.parts.carryPose = true;
      this.attachCarry();
      sfx.pickup();
      this.layoutDishes();
    } else if (t.kind === 'market') {
      this.paused = true;
      this.hooks.openMarket();
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
    let pay = dish.recipe.price * QUALITY_MULT[dish.quality] * (0.75 + 0.5 * frac);
    if (g.vip) pay *= VIP_TIP_MULT;
    if (this.rushT > 0) pay *= RUSH_TIP_MULT;
    pay = Math.round(pay);
    this.save.coins += pay;
    let repGain = dish.quality === 'perfect' ? 2 : 1;
    if (g.vip) { repGain += 1; this.dayStats.vips++; }
    // The incognito food critic judges the meal.
    if (g.critic) {
      if (dish.quality === 'perfect' && frac > 0.5) {
        this.criticResult = 'great';
        this.save.rep = Math.min(100, this.save.rep + CRITIC_REP_WIN);
        this.hooks.banner('⭐ Glowing review!', 'The critic loved it. +' + CRITIC_REP_WIN + ' rep');
      } else if (dish.quality !== 'burnt') {
        this.criticResult = 'ok';
        this.save.rep = Math.min(100, this.save.rep + 4);
        this.hooks.toast('The critic nods approvingly. +4 rep');
      } else {
        this.criticResult = 'bad';
        this.save.rep = Math.max(0, this.save.rep + CRITIC_REP_LOSE);
        this.hooks.banner('💥 Scathing review!', 'The critic hated it. ' + CRITIC_REP_LOSE + ' rep');
      }
    } else {
      this.save.rep = Math.min(100, this.save.rep + repGain);
    }
    this.dayStats.revenue += pay; this.dayStats.served++;
    this.player.carry = null;
    this.player.parts.carryPose = false;
    if (this.player.carryMesh) { this.player.parts.group.remove(this.player.carryMesh); this.player.carryMesh = null; }
    g.state = 'eating'; g.eatT = 3.5;
    g.parts.mood = 'happy';
    if (g.bubble) { this.scene.remove(g.bubble); g.bubble = null; }
    if (g.vipRing) { this.scene.remove(g.vipRing); g.vipRing = null; }
    // Juice: hearts burst, coin flies to the HUD, little serving flourish.
    const t = this.tables[g.tableIdx];
    spawnReaction(this.scene, 'hearts', t.x, 1.9, t.z);
    this.hooks.fx('coin', t.x, 1.2, t.z);
    if (dish.quality === 'perfect') this.hooks.fx('hearts', t.x, 1.6, t.z);
    this.serveFlourishT = 0.45;
    this.foodMesh(dish.recipe.id).then((m) => {
      const t2 = this.tables[g.tableIdx];
      m.position.set(t2.x, 0.82, t2.z - 0.15);
      this.scene.add(m);
      g.tableFood = m;
    });
    if (dish.quality === 'perfect') sfx.perfect(); else sfx.serve();
    setTimeout(() => sfx.coin(), 250);
    const vipTag = g.vip ? '🌟 VIP ' : '';
    this.hooks.toast(`+${pay}c ${vipTag}${dish.quality === 'perfect' ? 'Perfect!' : dish.quality === 'burnt' ? 'Burnt…' : 'Served'}`);
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
  /** Returns false when the pantry is missing ingredients (nothing started). */
  beginCook(recipe: Recipe, quality: 'perfect' | 'good' | 'burnt'): boolean {
    const missing = this.missingFor(recipe);
    if (missing.length) {
      this.hooks.toast('Missing: ' + missing.map((id) => `${ING_MAP[id].emoji} ${ING_MAP[id].name}`).join(', '));
      sfx.angry();
      return false;
    }
    this.consumePantry(recipe);
    const total = recipe.time;
    const bar = this.stoveBars.find((b) => !b.group.visible) ?? this.stoveBars[0];
    bar.group.visible = true;
    (bar.barFg as THREE.Mesh).scale.x = 0.01;
    (bar.barFg as THREE.Mesh).position.x = -0.42;
    this.cooks.push({ recipe, remaining: total, total, quality, barFg: bar.barFg, group: bar.group });
    sfx.sizzle();
    return true;
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
  spawnGuest(forceRecipe?: string, forceVip = false, forceCritic = false) {
    const free = this.tables.filter((t) => !t.guest);
    if (!free.length) return null;
    const table = free[Math.floor(Math.random() * free.length)];
    const unlocked = RECIPES.filter((r) => this.save.recipes.includes(r.id));
    let vip = forceVip;
    if (!forceCritic && !vip && this.save.day >= 2 && this.save.rep >= 55 && Math.random() < VIP_CHANCE) vip = true;
    const pool = vip
      ? unlocked.filter((r) => r.price >= VIP_MIN_PRICE)
      : unlocked;
    const recipe = forceRecipe ? RECIPE_MAP[forceRecipe]
      : (pool.length ? pool : unlocked)[Math.floor(Math.random() * (pool.length ? pool : unlocked).length)];
    const critic = forceCritic;
    const parts = critic
      ? makeCharacter({ skin: 0xe8a96f, hairStyle: 0, hairColor: 0x8a8a8a, shirt: 0x2b2b33 })
      : vip
        ? makeCharacter({ skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)], hairStyle: 3, hairColor: 0xd9a441, shirt: 0x9b59d0 })
        : makeCharacter({
          skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
          hairStyle: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
          hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
          shirt: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
        });
    const side = table.idx % 2 === 0 ? 1 : -1;
    const chairPos = { x: table.x, z: table.z + side * 0.95 };
    parts.group.position.set(GUEST_SPAWN.x, 0, GUEST_SPAWN.z);
    parts.group.userData.pickTarget = { kind: 'table', idx: table.idx }; // tap guest = tap table
    this.scene.add(parts.group);
    let maxPatience = 70 + Math.random() * 25;
    if (vip) maxPatience *= VIP_PATIENCE_MULT;
    const g: GuestEnt = {
      parts, x: GUEST_SPAWN.x, z: GUEST_SPAWN.z,
      state: 'entering',
      wp: [{ x: 2.5, z: 6.4 }, { x: 0.6, z: 4.6 }, chairPos],
      tableIdx: table.idx, recipe,
      patience: maxPatience, maxPatience,
      eatT: 0, angry: false,
      bubble: null, barFg: null, tableFood: null,
      phase: Math.random() * 10,
      vip, critic, vipRing: null, bubbleAge: 0,
    };
    table.guest = g;
    this.guests.push(g);
    return g;
  }

  spawnCritic() {
    const g = this.spawnGuest(undefined, false, true);
    if (g) {
      this.criticSpawned = true;
      this.hooks.toast('🎩 A distinguished guest has arrived…');
    }
  }

  seatGuest(g: GuestEnt) {
    g.state = 'ordering';
    g.parts.mood = 'normal';
    g.parts.group.rotation.y = Math.PI; // face table (-z if chair on +z side)
    const table = this.tables[g.tableIdx];
    const side = table.idx % 2 === 0 ? 1 : -1;
    g.parts.group.rotation.y = side > 0 ? Math.PI : 0;
    const { group, bar } = makeBubble(g.recipe);
    group.position.set(g.x, 2.05, g.z);
    group.scale.setScalar(0.01); // pop-in animation
    this.scene.add(group);
    g.bubble = group; g.barFg = bar as unknown as THREE.Object3D;
    g.bubbleAge = 0;
    // VIPs get a floating gold ring.
    if (g.vip && !g.vipRing) {
      const ring = makeVipRing();
      ring.position.set(g.x, 2.6, g.z);
      this.scene.add(ring);
      g.vipRing = ring;
      this.hooks.banner('🌟 VIP guest!', 'A VIP has arrived — serve them well for big tips');
      sfx.vip();
    }
    sfx.pop();
  }

  guestLeave(g: GuestEnt, angry: boolean) {
    g.state = 'leaving'; g.angry = angry;
    if (g.bubble) { this.scene.remove(g.bubble); g.bubble = null; }
    if (g.tableFood) { this.scene.remove(g.tableFood); g.tableFood = null; }
    if (g.vipRing) { this.scene.remove(g.vipRing); g.vipRing = null; }
    g.wp = [{ x: 0.6, z: 4.6 }, { x: 2.5, z: 6.4 }, { x: GUEST_SPAWN.x, z: GUEST_SPAWN.z }];
    if (angry) {
      g.parts.mood = 'angry';
      spawnReaction(this.scene, 'angry', g.x, 1.9, g.z);
      const repLoss = g.vip ? 8 : g.critic ? 8 : 3;
      this.save.rep = Math.max(0, this.save.rep - repLoss);
      this.dayStats.angry++;
      sfx.angry();
      if (g.critic) {
        this.criticResult = 'bad';
        this.hooks.banner('💥 The critic walked out!', 'A scathing review is coming. -8 rep');
      } else {
        this.hooks.toast(`${g.vip ? 'VIP left angry' : 'Guest left angry'}! -${repLoss} rep`);
      }
      this.persist(); this.pushHud();
    }
  }

  removeGuest(g: GuestEnt) {
    this.scene.remove(g.parts.group);
    if (g.vipRing) this.scene.remove(g.vipRing);
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
      g.patience -= dt;
      const frac = g.patience / g.maxPatience;
      if (g.barFg) setPatience(g.barFg, frac);
      // Bubble pop-in + gentle bob.
      if (g.bubble) {
        g.bubbleAge = Math.min(1, g.bubbleAge + dt * 4);
        const e = 1 + 2.7 * Math.pow(g.bubbleAge - 1, 3) + 1.7 * Math.pow(g.bubbleAge - 1, 2); // easeOutBack
        g.bubble.scale.setScalar(Math.max(0.01, e));
        g.bubble.position.y = 2.05 + Math.sin(g.phase * 2.2) * 0.05;
      }
      // Mood: storm cloud when patience drops low.
      if (frac < 0.32 && g.parts.mood !== 'impatient') {
        g.parts.mood = 'impatient';
        spawnReaction(this.scene, 'angry', g.x, 1.9, g.z);
      }
      g.parts.updateWalk(g.phase, false);
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
    if (g.vipRing) {
      g.vipRing.position.set(g.x, 2.6 + Math.sin(g.phase * 3) * 0.08, g.z);
      g.vipRing.rotation.y += dt * 2.2;
    }
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
    // Critic reveal in the day summary.
    let criticNote: string | null = null;
    if (this.criticSpawned) {
      if (this.criticResult === 'great') criticNote = '⭐ That distinguished guest was the FOOD CRITIC — and they loved it! (Big rep boost)';
      else if (this.criticResult === 'ok') criticNote = '🎩 That distinguished guest was the FOOD CRITIC — a solid review. (+4 rep)';
      else if (this.criticResult === 'bad') criticNote = '💥 That distinguished guest was the FOOD CRITIC — a scathing review. (-8 rep)';
      else criticNote = '🎩 The food critic visited today… and left unnoticed.';
    }
    const d: SummaryData = {
      day: this.save.day, revenue: this.dayStats.revenue, served: this.dayStats.served,
      angry: this.dayStats.angry, roomsIncome, rep: this.save.rep, coins: this.save.coins,
      vips: this.dayStats.vips, criticNote,
    };
    sfx.dayEnd();
    this.persist();
    this.hooks.openSummary(d);
  }

  nextDay() {
    this.save.day++;
    this.dayT = 0;
    this.dayStats = { revenue: 0, served: 0, angry: 0, vips: 0 };
    this.spawnT = 2;
    this.rushT = 0;
    this.rushFired = RUSH_TIMES.map(() => false);
    this.criticSpawned = false;
    this.criticResult = null;
    this.criticT = CRITIC_WINDOW[0] + Math.random() * (CRITIC_WINDOW[1] - CRITIC_WINDOW[0]);
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

    // Player movement (tap-to-move target takes priority over joystick).
    const p = this.player;
    let mx = this.input.x, mz = this.input.z;
    if (Math.hypot(mx, mz) > 0.15) this.moveTarget = null; // joystick/keyboard cancels tap-to-move
    if (this.moveTarget) {
      const dx = this.moveTarget.x - p.x, dz = this.moveTarget.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        this.moveTarget = null;
        if (this.pendingAuto) { this.target = this.pendingAuto; this.pendingAuto = null; this.doInteract(); }
      } else {
        mx = dx / d; mz = dz / d;
      }
    }
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
    // Stirring at an active stove, or a little flourish right after serving.
    const nearActiveStove = this.cooks.length > 0 &&
      STOVE_SPOTS.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 2.0);
    p.parts.stir = nearActiveStove && !moving;
    if (this.serveFlourishT > 0) {
      this.serveFlourishT -= dt;
      p.parts.group.rotation.y += dt * 12; // happy little spin
      p.parts.group.position.y = Math.sin((1 - this.serveFlourishT / 0.45) * Math.PI) * 0.18;
    } else {
      p.parts.group.position.y = 0;
    }
    p.parts.updateWalk(t, moving);
    if (p.carryMesh) p.carryMesh.position.y = 1.72 + Math.sin(t * 3) * 0.03;

    // Interact scan.
    this.interactT -= dt;
    if (this.interactT <= 0) { this.interactT = 0.15; this.scanInteract(); }

    // Rush hours: scheduled windows, spawn rate doubles + tip bonus.
    RUSH_TIMES.forEach((rt, i) => {
      if (!this.rushFired[i] && this.dayT >= rt) {
        this.rushFired[i] = true;
        this.rushT = RUSH_DURATION;
        const name = rt < 90 ? 'Lunch Rush!' : 'Dinner Rush!';
        this.hooks.banner(`🍽️ ${name}`, 'Guests are pouring in — +20% tips for 45s');
        sfx.rush();
      }
    });
    if (this.rushT > 0) {
      this.rushT -= dt;
      if (this.rushT <= 0) { this.rushT = 0; this.hooks.toast('Rush hour is over.'); }
    }

    // Incognito food critic, once per day.
    if (!this.criticSpawned && this.dayT >= this.criticT) this.spawnCritic();

    // Spawning (rush doubles the rate).
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = (13 - (this.save.rep / 100) * 7) / (this.rushT > 0 ? RUSH_SPAWN_DIV : 1);
      if (this.tables.some((tb) => !tb.guest) && this.dayT < DAY_LENGTH - 12) this.spawnGuest();
    }

    // Guests.
    for (const g of [...this.guests]) this.updateGuest(g, dt);

    // Cooking + stove steam.
    for (const c of [...this.cooks]) {
      c.remaining -= dt;
      const f = 1 - Math.max(0, c.remaining) / c.total;
      (c.barFg as THREE.Mesh).scale.x = Math.max(0.01, f);
      (c.barFg as THREE.Mesh).position.x = -0.42 * (1 - f);
      if (Math.random() < 0.25) {
        const s = STOVE_SPOTS[this.cooks.indexOf(c) % STOVE_SPOTS.length];
        emitSteam(s.x, 1.45, s.z);
      }
      if (c.remaining <= 0) {
        this.cooks.splice(this.cooks.indexOf(c), 1);
        this.completeCook(c);
      }
    }
    // Fresh hot dishes on the counter give off a little steam too.
    for (const d of this.dishes) {
      if (Math.random() < 0.06) {
        const wp = new THREE.Vector3();
        d.mesh.getWorldPosition(wp);
        emitSteam(wp.x, wp.y + 0.15, wp.z);
      }
    }
    // Vendor idle animation.
    if (this.vendor) this.vendor.updateWalk(t, false);

    // Ambient world life: lamps sway, butterflies, clouds, steam, reactions.
    updateAmbient(t, dt);

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
