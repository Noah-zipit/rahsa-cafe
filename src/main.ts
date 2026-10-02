import * as THREE from 'three';
import './style.css';
import { UI } from './ui';
import { CafeSim, SummaryData } from './game/sim';
import { makeCharacter, setupLights, CharParts } from './game/three';
import { loadSave, saveSave, clearSave, defaultSave } from './systems/save';
import { sfx } from './systems/audio';
import { RECIPES, RECIPE_MAP, SHOP_ITEMS, CharCustom } from './game/data';

const root = document.getElementById('game')!;
const isMobile = matchMedia('(pointer: coarse)').matches;

const ui = new UI(root); // NOTE: UI clears #game, so create it before the canvas

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
root.appendChild(renderer.domElement);
const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<div class="load-card">☕<br>Brewing the cafe…</div>';
root.appendChild(loading);
const showLoading = (v: boolean) => loading.classList.toggle('hidden', !v);

let activeScene: THREE.Scene | null = null;
let activeCamera: THREE.Camera | null = null;
let sim: CafeSim | null = null;
let preview: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; char: CharParts } | null = null;
let mode: 'title' | 'customize' | 'game' = 'title';
let muted = false;

// ---------------- screens ----------------
async function showTitle() {
  mode = 'title';
  showLoading(true);
  ui.hideHud(); ui.hideCustomize(); ui.closePanel();
  sim = new CafeSim();
  sim.hooks = {
    hud() {}, prompt() {},
    openCook() {}, openShop() {}, openPause() {},
    openSummary() { sim?.nextDay(); },
    toast() {},
  };
  await sim.init(window.innerWidth / window.innerHeight);
  sim.paused = false; // attract mode: the cafe runs itself behind the title
  activeScene = sim.scene;
  activeCamera = sim.camera;
  showLoading(false);
  ui.showTitle(loadSave() !== null, () => {
    clearSave();
    showCustomize();
  }, () => {
    startGame();
  });
}

function showCustomize() {
  mode = 'customize';
  ui.hideTitle(); ui.hideHud(); ui.closePanel();
  const save = loadSave() ?? defaultSave();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1a10);
  scene.fog = new THREE.Fog(0x2a1a10, 8, 20);
  setupLights(scene);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x8a5f36, roughness: 0.9 }),
  );
  disc.position.y = -0.06; disc.receiveShadow = true;
  scene.add(disc);
  const char = makeCharacter(save.char);
  scene.add(char.group);
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.35, 2.9);
  camera.lookAt(0, 0.85, 0);
  preview = { scene, camera, char };
  activeScene = scene;
  activeCamera = camera;
  let current: CharCustom = { ...save.char };
  ui.showCustomize(save.char, (c: CharCustom) => {
    current = { ...c };
    char.setAppearance(c);
  }, () => {
    const s = loadSave() ?? defaultSave();
    s.char = { ...current };
    saveSave(s);
    startGame();
  });
}

async function startGame() {
  mode = 'game';
  showLoading(true);
  ui.hideTitle(); ui.hideCustomize(); ui.closePanel();
  preview = null;
  sim = new CafeSim();
  const S = sim;
  S.hooks = {
    hud: (s) => ui.setHud(s),
    prompt: (label, action) => ui.setPrompt(label, action),
    openCook: (stoveIdx) => {
      const unlocked = RECIPES.filter((r) => S.save.recipes.includes(r.id));
      ui.showCook(unlocked, S.stoveLevel,
        (r, q) => S.finishCookSelect(r, q),
        () => S.cancelCook());
      void stoveIdx;
    },
    openShop: () => {
      ui.showShop(SHOP_ITEMS, S.save, (it) => S.buy(it), () => { S.paused = false; });
    },
    openPause: () => {
      ui.showPause(
        () => { S.paused = false; },
        () => { S.persist(); showTitle(); },
        muted,
        () => { muted = sfx.toggleMute(); return muted; },
      );
    },
    openSummary: (d: SummaryData) => ui.showSummary(d, () => S.nextDay()),
    toast: (t) => ui.toast(t),
  };
  ui.onShop = () => { S.paused = true; S.hooks.openShop(); };
  ui.onPause = () => { S.paused = true; S.hooks.openPause(); };
  ui.onAction = () => S.doInteract();
  await S.init(window.innerWidth / window.innerHeight);
  activeScene = S.scene;
  activeCamera = S.camera;
  ui.showHud();
  S.pushHud();
  showLoading(false);
}

// ---------------- input ----------------
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (mode === 'game' && sim && (e.key.toLowerCase() === 'e' || e.key === ' ')) sim.doInteract();
  if (mode === 'game' && sim && e.key === 'Escape') {
    if (sim.paused) { sim.paused = false; ui.closePanel(); }
    else { sim.paused = true; sim.hooks.openPause(); }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function pollKeys() {
  if (mode !== 'game' || !sim) return;
  let x = 0, z = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) z -= 1;
  if (keys.has('s') || keys.has('arrowdown')) z += 1;
  const jx = ui.joystick.x, jz = ui.joystick.z;
  if (Math.hypot(jx, jz) > 0.15) { x = jx; z = jz; }
  const len = Math.hypot(x, z);
  sim.input.x = len > 1 ? x / len : x;
  sim.input.z = len > 1 ? z / len : z;
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const a = window.innerWidth / window.innerHeight;
  if (sim && activeCamera === sim.camera) { sim.camera.aspect = a; sim.camera.updateProjectionMatrix(); }
  if (preview && activeCamera === preview.camera) { preview.camera.aspect = a; preview.camera.updateProjectionMatrix(); }
});

// ---------------- main loop ----------------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  pollKeys();
  if (mode === 'title' && sim) sim.update(dt);
  if (mode === 'game' && sim) sim.update(dt);
  if (mode === 'customize' && preview) {
    preview.char.group.rotation.y += dt * 0.9;
    preview.char.updateWalk(performance.now() / 1000, false);
  }
  if (activeScene && activeCamera) renderer.render(activeScene, activeCamera);
}

// ---------------- audio unlock + mute ----------------
window.addEventListener('pointerdown', () => sfx.ensure(), { once: true });

// ---------------- debug hooks ----------------
(window as unknown as { __rahsa: unknown }).__rahsa = {
  get sim() { return sim; },
  get mode() { return mode; },
  spawnGuest: (recipe?: string) => sim?.spawnGuest(recipe),
  cook: (id: string, q: 'perfect' | 'good' | 'burnt' = 'good') => {
    const r = RECIPE_MAP[id]; if (sim && r) sim.finishCookSelect(r, q);
  },
  pickup: () => {
    const S = sim; if (!S || S.player.carry || !S.dishes.length) return;
    const d = S.dishes.pop()!; S.scene.remove(d.mesh);
    S.player.carry = d.dish; S.attachCarry(); S.layoutDishes();
  },
  serve: () => {
    const S = sim; if (!S) return 'no sim';
    const g = S.guests.find((gg) => gg.state === 'ordering'); if (!g) return 'no guest ordering';
    if (!S.player.carry || S.player.carry.recipe.id !== g.recipe.id) return 'wrong dish: guest wants ' + g.recipe.id;
    S.serve(g); return 'served';
  },
  teleport: (x: number, z: number) => { if (sim) { sim.player.x = x; sim.player.z = z; } },
  interact: () => sim?.doInteract(),
  state: () => sim ? {
    mode, coins: sim.save.coins, rep: sim.save.rep, day: sim.save.day,
    guests: sim.guests.map((g) => ({ state: g.state, recipe: g.recipe.id, patience: Math.round(g.patience) })),
    dishes: sim.dishes.map((d) => d.dish.recipe.id),
    carrying: sim.player.carry?.recipe.id ?? null,
    cooks: sim.cooks.length,
    dayT: Math.round(sim.dayT),
  } : null,
  startGame,
};

showTitle();
loop();
