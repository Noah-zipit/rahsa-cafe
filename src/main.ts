import * as THREE from 'three';
import './style.css';
import { UI } from './ui';
import { CafeSim, SummaryData } from './game/sim';
import { makeCharacter, setupLights, frameCamera, panCamera, zoomCamera, resetCameraView, CharParts } from './game/three';
import { loadSave, saveSave, clearSave, defaultSave } from './systems/save';
import { sfx } from './systems/audio';
import { RECIPES, RECIPE_MAP, SHOP_ITEMS, ING_MAP, CharCustom } from './game/data';

const root = document.getElementById('game')!;

const ui = new UI(root); // NOTE: UI clears #game, so create it before the canvas

const renderer = new THREE.WebGLRenderer({ antialias: true });
// ---------- dynamic resolution: native device pixels first, fps governor as guard ----------
// Render at the full native devicePixelRatio (no more 1.5x mobile cap that made
// everything blurry). If the GPU can't hold ~50fps, step down through fractions
// of native; step back up when there's sustained headroom.
const nativeDpr = Math.min(window.devicePixelRatio || 1, 3);
const DPR_RUNGS = [1, 0.85, 0.7, 0.55]; // fractions of nativeDpr
let dprRung = 0;
function applyDpr() {
  renderer.setPixelRatio(Math.max(1, nativeDpr * DPR_RUNGS[dprRung]));
}
applyDpr();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
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
    openCook() {}, openShop() {}, openMarket() {}, openPause() {},
    openSummary() { sim?.nextDay(); },
    toast() {}, banner() {}, fx() {},
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
  scene.background = new THREE.Color(0x6b4a2e);
  scene.fog = new THREE.Fog(0x6b4a2e, 8, 22);
  setupLights(scene);
  // warm wooden stage
  const stageTex = new THREE.CanvasTexture((() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d')!;
    cx.fillStyle = '#a5713f'; cx.fillRect(0, 0, 128, 128);
    cx.strokeStyle = 'rgba(70,40,18,0.4)'; cx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { cx.beginPath(); cx.moveTo(0, i * 32); cx.lineTo(128, i * 32); cx.stroke(); }
    return cv;
  })());
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.25, 0.14, 28),
    new THREE.MeshStandardMaterial({ map: stageTex, roughness: 0.9 }),
  );
  disc.position.y = -0.07; disc.receiveShadow = true;
  scene.add(disc);
  // soft backdrop glow disc behind the character
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.22, fog: false }),
  );
  glow.position.set(0, 1.1, -1.2);
  scene.add(glow);
  const char = makeCharacter(save.char, true); // staff apron, matches in-game player
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
      ui.showCook(unlocked, S.stoveLevel, { ...S.save.pantry },
        (r, q) => S.finishCookSelect(r, q),
        () => S.cancelCook());
      void stoveIdx;
    },
    openShop: () => {
      ui.showShop(SHOP_ITEMS, S.save, (it) => S.buy(it), () => { S.paused = false; });
    },
    openMarket: () => {
      ui.showMarket(
        () => ({ coins: S.save.coins, pantry: { ...S.save.pantry } }),
        (id, qty) => S.buyIngredient(id, qty),
        () => { S.paused = false; },
      );
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
    banner: (t, s) => ui.banner(t, s),
    fx: (k, x, y, z) => ui.fx(k, x, y, z),
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
  if (sim && activeCamera === sim.camera) { frameCamera(sim.camera, sim.scene, a); }
  if (preview && activeCamera === preview.camera) { preview.camera.aspect = a; preview.camera.updateProjectionMatrix(); }
});

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let fpsEma = 60, lastGovT = performance.now(), upCooldownUntil = 0;
function governDpr(now: number, dt: number) {
  const fps = 1 / Math.max(dt, 1e-3);
  fpsEma += (fps - fpsEma) * 0.05;
  if (now - lastGovT < 2500) return;
  if (fpsEma < 47 && dprRung < DPR_RUNGS.length - 1) {
    dprRung++; applyDpr(); lastGovT = now; upCooldownUntil = now + 8000;
  } else if (fpsEma > 57 && dprRung > 0 && now > upCooldownUntil) {
    dprRung--; applyDpr(); lastGovT = now;
  }
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  governDpr(performance.now(), dt);
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

// ---------------- camera pan / zoom + tap-to-move ----------------
// Diorama angle stays exactly as approved; the rig pans (drag) and dollies (zoom).
// Tap = interact, drag = pan — disambiguated by movement threshold. The joystick
// is a UI overlay above the canvas, so it always keeps priority over camera drags.
const camPointers = new Map<number, { x: number; y: number }>();
let camMode: 'none' | 'tap' | 'pan' | 'pinch' = 'none';
let pinchDist = 0;
let downX = 0, downY = 0, downButton = 0;
let lastTapAt = 0;

const canvas = () => renderer.domElement;
canvas().style.touchAction = 'none';
canvas().addEventListener('contextmenu', (e) => e.preventDefault());

function gameCam() {
  return mode === 'game' && sim && activeCamera === sim.camera ? sim.camera : null;
}

canvas().addEventListener('wheel', (e) => {
  const cam = gameCam();
  if (!cam || !sim) return;
  e.preventDefault();
  zoomCamera(e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

canvas().addEventListener('pointerdown', (e) => {
  camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (camPointers.size === 2) {
    camMode = 'pinch';
    const [a, b] = [...camPointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  } else if (camPointers.size === 1) {
    camMode = 'tap';
    downX = e.clientX; downY = e.clientY; downButton = e.button;
  }
});

canvas().addEventListener('pointermove', (e) => {
  if (!camPointers.has(e.pointerId)) return;
  const cam = gameCam();
  const prev = camPointers.get(e.pointerId)!;
  if (camMode === 'pinch' && camPointers.size === 2) {
    camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...camPointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (cam && sim && pinchDist > 0) zoomCamera(d / pinchDist);
    pinchDist = d;
  } else if (camMode === 'tap' || camMode === 'pan') {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (camMode === 'tap' && moved > 12) camMode = 'pan';
    if (camMode === 'pan') {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      // Desktop pans with right/middle-drag; touch pans with any one-finger drag.
      const mayPan = e.pointerType !== 'mouse' || downButton === 1 || downButton === 2;
      if (cam && sim && mayPan) panCamera(-dx * 0.022, dy * 0.022);
      camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }
});

function handleTap(cx: number, cy: number) {
  if (mode !== 'game' || !sim || sim.paused) return;
  const now = performance.now();
  if (now - lastTapAt < 300 && sim) { resetCameraView(); lastTapAt = 0; return; }
  lastTapAt = now;
  const rect = renderer.domElement.getBoundingClientRect();
  const nx = ((cx - rect.left) / rect.width) * 2 - 1;
  const ny = -((cy - rect.top) / rect.height) * 2 + 1;
  const target = sim.pickInteractable(nx, ny);
  if (target) {
    const pt = sim.interactPoint(target);
    sim.tapMoveTo(pt.x, pt.z, target);
    return;
  }
  // Tap on the ground: walk there.
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(nx, ny), sim.camera);
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const p = new THREE.Vector3();
  if (rc.ray.intersectPlane(ground, p)) sim.tapMoveTo(p.x, p.z);
}

const endCamPointer = (e: PointerEvent) => {
  const wasTap = camMode === 'tap';
  camPointers.delete(e.pointerId);
  if (wasTap && camPointers.size === 0) handleTap(e.clientX, e.clientY);
  if (camPointers.size === 0) camMode = 'none';
  else if (camPointers.size === 1) {
    camMode = 'tap';
    const [p] = [...camPointers.values()];
    downX = p.x; downY = p.y;
  }
};
canvas().addEventListener('pointerup', endCamPointer);
canvas().addEventListener('pointercancel', endCamPointer);

// World → screen projection for UI juice (coin fly, hearts).
ui.worldToScreen = (x: number, y: number, z: number) => {
  if (!activeCamera) return null;
  const v = new THREE.Vector3(x, y, z).project(activeCamera);
  if (v.z > 1) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height };
};

// ---------------- debug hooks ----------------
(window as unknown as { __rahsa: unknown }).__rahsa = {
  get sim() { return sim; },
  get mode() { return mode; },
  spawnGuest: (recipe?: string) => sim?.spawnGuest(recipe),
  spawnVip: (recipe?: string) => sim?.spawnGuest(recipe, true),
  spawnCritic: () => sim?.spawnCritic(),
  triggerRush: () => { if (sim) { sim.rushT = 45; sim.rushFired = [true, true]; ui.banner('🍽️ Lunch Rush!', 'Guests are pouring in — +20% tips for 45s'); } },
  buy: (id: string, qty = 1) => sim?.buyIngredient(id, qty),
  pantry: () => (sim ? { ...sim.save.pantry } : null),
  missing: (id: string) => sim?.missingFor(RECIPE_MAP[id]),
  zoom: (f: number) => zoomCamera(f),
  pan: (dx: number, dz: number) => panCamera(dx, dz),
  resetCam: () => resetCameraView(),
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
    guests: sim.guests.map((g) => ({ state: g.state, recipe: g.recipe.id, patience: Math.round(g.patience), vip: g.vip, critic: g.critic })),
    dishes: sim.dishes.map((d) => d.dish.recipe.id),
    carrying: sim.player.carry?.recipe.id ?? null,
    cooks: sim.cooks.length,
    dayT: Math.round(sim.dayT),
    rush: sim.rushT > 0, rushT: Math.round(sim.rushT),
    pantry: { ...sim.save.pantry },
    recipes: [...sim.save.recipes],
  } : null,
  startGame,
};

showTitle();
loop();
