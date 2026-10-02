import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharCustom, Recipe } from './data';

// ---------- palette ----------
export const PAL = {
  wood: 0x9e6530, woodDark: 0x6f4525, woodTrim: 0x53301a,
  wall: 0xf3d3a0, cream: 0xfff3dd,
  rug: 0xb04038, plant: 0x4fae5a, plantDark: 0x357a3e,
  metal: 0x9aa0a8, metalDark: 0x555b63,
  stoveTop: 0x2e2a28,
};

export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.0, flatShading: true, ...opts });
}
function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt: number, rb: number, h: number, color: number, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function sph(r: number, color: number, ws = 10, hs = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- GLB model loading ----------
const loader = new GLTFLoader();
const modelCache = new Map<string, THREE.Group>();

export function loadModel(name: string): Promise<THREE.Group> {
  const hit = modelCache.get(name);
  if (hit) return Promise.resolve(hit.clone(true));
  // Test-harness fallback: models embedded as data URIs (file:// runs).
  const bundle = (window as unknown as { __GLB_BUNDLE?: Record<string, string> }).__GLB_BUNDLE;
  const url = bundle?.[name] ?? `models/${name}.glb`;
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const g = gltf.scene;
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const m = o as THREE.Mesh;
            const mm = m.material as THREE.MeshStandardMaterial;
            if (mm && 'roughness' in mm) { mm.roughness = Math.max(mm.roughness, 0.7); }
          }
        });
        modelCache.set(name, g);
        resolve(g.clone(true));
      },
      undefined,
      (e) => reject(e),
    );
  });
}

/** Scale a model so its height becomes targetH, with its base at y=0 and centered on xz. */
export function normalizeModel(g: THREE.Object3D, targetH: number): THREE.Object3D {
  const b = new THREE.Box3().setFromObject(g);
  const size = b.getSize(new THREE.Vector3());
  if (size.y > 0.0001) {
    const s = targetH / size.y;
    g.scale.multiplyScalar(s);
  }
  const b2 = new THREE.Box3().setFromObject(g);
  const c = b2.getCenter(new THREE.Vector3());
  g.position.x -= c.x; g.position.z -= c.z;
  g.position.y -= b2.min.y;
  return g;
}

// ---------- procedural low-poly character (cute chibi) ----------
export type CharMood = 'normal' | 'impatient' | 'happy' | 'angry';
export interface CharParts {
  group: THREE.Group;
  legL: THREE.Mesh; legR: THREE.Mesh;
  armL: THREE.Group; armR: THREE.Group;
  body: THREE.Group;
  hairMeshes: THREE.Object3D[];
  /** Guest mood drives idle/walk flavor (foot-tap, bounce, shake). */
  mood: CharMood;
  /** Player-only: play the stirring animation (near an active stove). */
  stir: boolean;
  /** Player-only: arms raised holding a dish overhead. */
  carryPose: boolean;
  setAppearance(c: CharCustom): void;
  updateWalk(t: number, moving: boolean): void;
}

const GUEST_PALETTES: CharCustom[] = [
  { skin: 0xf6c99b, hairStyle: 0, hairColor: 0x2b1d16, shirt: 0x3d7dd9 },
  { skin: 0xe8a96f, hairStyle: 1, hairColor: 0x6b4423, shirt: 0xd94f3d },
  { skin: 0xc07f45, hairStyle: 2, hairColor: 0x2b1d16, shirt: 0x4fae5a },
  { skin: 0xf6c99b, hairStyle: 3, hairColor: 0xd9a441, shirt: 0x9b59d0 },
  { skin: 0x7d4b26, hairStyle: 0, hairColor: 0x111111, shirt: 0xe08a2d },
  { skin: 0xe8a96f, hairStyle: 1, hairColor: 0xa83232, shirt: 0x3fbdb2 },
];
export function guestPalette(i: number): CharCustom {
  return GUEST_PALETTES[i % GUEST_PALETTES.length];
}

function buildHair(style: number, color: number): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  // Cap over the crown.
  const cap = sph(0.315, color, 12, 10); cap.scale.set(1, 0.72, 1); cap.position.y = 0.10;
  parts.push(cap);
  // Fringe across the forehead (all styles).
  for (let i = -2; i <= 2; i++) {
    const f = box(0.11, 0.09, 0.06, color, i * 0.105, 0.185, 0.225);
    f.rotation.z = -i * 0.08;
    parts.push(f);
  }
  // Side locks framing the face.
  for (const sx of [-1, 1]) {
    const lock = box(0.09, 0.2, 0.09, color, sx * 0.27, -0.02, 0.1);
    parts.push(lock);
  }
  if (style === 1) { // long
    const back = box(0.42, 0.52, 0.13, color, 0, -0.16, -0.24); parts.push(back);
    for (const sx of [-1, 1]) {
      const strand = box(0.1, 0.42, 0.1, color, sx * 0.24, -0.12, -0.12); parts.push(strand);
    }
  } else if (style === 2) { // curly
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const c = sph(0.115, color, 8, 6);
      c.position.set(Math.cos(a) * 0.26, 0.12 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.26);
      parts.push(c);
    }
    const top = sph(0.13, color, 8, 6); top.position.set(0, 0.3, 0); parts.push(top);
  } else if (style === 3) { // ponytail
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 6, 10), mat(0xd94f3d));
    tie.position.set(0.1, 0.22, -0.26); tie.rotation.x = 0.5; tie.castShadow = true;
    parts.push(tie);
    const tail = cyl(0.075, 0.05, 0.4, color, 8); tail.position.set(0.14, 0.02, -0.36); tail.rotation.x = 0.55;
    parts.push(tail);
    const tip = sph(0.06, color, 8, 6); tip.position.set(0.16, -0.16, -0.46); parts.push(tip);
  }
  return parts;
}

export function makeCharacter(c: CharCustom, staff = false): CharParts {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const blinkOff = Math.random() * 10;

  // Shoes.
  const shoeGeo = new THREE.BoxGeometry(0.15, 0.1, 0.24);
  const shoeMat = mat(0x4a3220);
  const shL = new THREE.Mesh(shoeGeo, shoeMat); shL.position.set(-0.11, 0.05, 0.03);
  const shR = new THREE.Mesh(shoeGeo, shoeMat); shR.position.set(0.11, 0.05, 0.03);
  shL.castShadow = shR.castShadow = true;
  // Legs (pants).
  const legGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.24, 8);
  const legMat = mat(0x5a4632);
  const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.11, 0.2, 0);
  const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.11, 0.2, 0);
  legL.castShadow = legR.castShadow = true;
  // Torso (shirt) — rounded capsule.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.2, 6, 10), mat(c.shirt));
  torso.position.y = 0.5; torso.castShadow = true;
  // Staff apron.
  let apron: THREE.Mesh | null = null;
  if (staff) {
    apron = box(0.32, 0.36, 0.05, 0xf6efdd, 0, 0.48, 0.19);
    const bib = box(0.2, 0.16, 0.05, 0xf6efdd, 0, 0.72, 0.15);
    body.add(apron, bib);
  }
  // Arms (pivot at shoulder).
  const armL = new THREE.Group(); armL.position.set(-0.27, 0.62, 0);
  const armR = new THREE.Group(); armR.position.set(0.27, 0.62, 0);
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.16, 4, 8);
  const aL = new THREE.Mesh(armGeo, mat(c.shirt)); aL.position.y = -0.13; aL.castShadow = true;
  const aR = new THREE.Mesh(armGeo, mat(c.shirt)); aR.position.y = -0.13; aR.castShadow = true;
  const hL = sph(0.065, c.skin, 8, 6); hL.position.y = -0.28;
  const hR = sph(0.065, c.skin, 8, 6); hR.position.y = -0.28;
  armL.add(aL, hL); armR.add(aR, hR);
  // Big chibi head.
  const head = sph(0.3, c.skin, 14, 12); head.position.y = 1.02;
  // Eyes.
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.35 });
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.105, 1.07, 0.265);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.105, 1.07, 0.265);
  // Blush cheeks.
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xf0978a, roughness: 1 });
  const bL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), blushMat);
  bL.scale.set(1, 0.7, 0.5); bL.position.set(-0.175, 0.99, 0.225);
  const bR = bL.clone(); bR.position.x = 0.175;
  // Smile.
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 6, 12, Math.PI), eyeMat);
  smile.position.set(0, 0.975, 0.255); smile.rotation.z = Math.PI;
  // Hair.
  const hairAnchor = new THREE.Group(); hairAnchor.position.y = 1.02;
  let hairMeshes = buildHair(c.hairStyle, c.hairColor);
  hairMeshes.forEach((m) => hairAnchor.add(m));

  body.add(shL, shR, legL, legR, torso, armL, armR, head, eL, eR, bL, bR, smile, hairAnchor);
  group.userData.height = 1.32;

  const parts: CharParts = {
    group, legL, legR, armL, armR, body, hairMeshes,
    mood: 'normal' as CharMood,
    stir: false,
    carryPose: false,
    setAppearance(nc: CharCustom) {
      (torso.material as THREE.MeshStandardMaterial).color.setHex(nc.shirt);
      (head.material as THREE.MeshStandardMaterial).color.setHex(nc.skin);
      (hL.material as THREE.MeshStandardMaterial).color.setHex(nc.skin);
      (hR.material as THREE.MeshStandardMaterial).color.setHex(nc.skin);
      (aL.material as THREE.MeshStandardMaterial).color.setHex(nc.shirt);
      (aR.material as THREE.MeshStandardMaterial).color.setHex(nc.shirt);
      parts.hairMeshes.forEach((m) => { hairAnchor.remove(m); });
      parts.hairMeshes = buildHair(nc.hairStyle, nc.hairColor);
      parts.hairMeshes.forEach((m) => hairAnchor.add(m));
    },
    updateWalk(t: number, moving: boolean) {
      // Cute blink every few seconds.
      const bl = (t + blinkOff) % 3.9;
      const eyeS = bl < 0.12 ? 0.12 : 1;
      eL.scale.y = eyeS; eR.scale.y = eyeS;
      const mood = parts.mood;
      // Carrying pose: both arms raised overhead holding the dish.
      if (parts.carryPose && !moving) {
        armL.rotation.x = -2.75; armR.rotation.x = -2.75;
        armL.rotation.z = 0.25; armR.rotation.z = -0.25;
      }
      // Stirring at the stove: right arm circles, body leans in.
      if (parts.stir) {
        const st = t * 9;
        armR.rotation.x = -1.15 + Math.sin(st) * 0.35;
        armR.rotation.z = -0.3 + Math.cos(st) * 0.25;
        armL.rotation.x = -0.5; armL.rotation.z = 0.2;
        body.rotation.x = 0.14;
        body.position.y = Math.abs(Math.sin(st * 0.5)) * 0.02;
        return;
      }
      if (moving) {
        // Snappy walk: quick steps, springy bounce, body roll.
        const s = Math.sin(t * 13);
        const c = Math.cos(t * 13);
        legL.rotation.x = s * 0.85; legR.rotation.x = -s * 0.85;
        if (!parts.carryPose) { armL.rotation.x = -s * 0.7; armR.rotation.x = s * 0.7; }
        armL.rotation.z = 0.14; armR.rotation.z = -0.14;
        body.position.y = Math.abs(c) * 0.075;
        body.rotation.x = 0.1;
        body.rotation.z = s * 0.045;
        head.rotation.y = 0; head.rotation.z = -s * 0.03;
      } else if (mood === 'happy') {
        // Joyful bounce when served well.
        const b = Math.abs(Math.sin(t * 7));
        body.position.y = b * 0.16;
        armL.rotation.x = -2.4; armR.rotation.x = -2.4; // arms up!
        armL.rotation.z = 0.35; armR.rotation.z = -0.35;
        legL.rotation.x *= 0.8; legR.rotation.x *= 0.8;
        body.rotation.z = Math.sin(t * 7) * 0.06;
        head.rotation.z = 0;
      } else if (mood === 'angry') {
        // Trembling with rage.
        body.position.x = Math.sin(t * 30) * 0.03;
        armL.rotation.x = 0.3; armR.rotation.x = 0.3;
        armL.rotation.z = 0.5; armR.rotation.z = -0.5;
        body.rotation.z = Math.sin(t * 30) * 0.02;
        head.rotation.z = 0;
      } else {
        // Idle: gentle bob + sway + occasional look-around.
        const b = Math.sin(t * 2.3 + blinkOff);
        legL.rotation.x *= 0.8; legR.rotation.x *= 0.8;
        body.position.y = b * 0.028;
        body.rotation.x = 0;
        body.rotation.z = Math.sin(t * 1.7 + blinkOff) * 0.02;
        if (!parts.carryPose) { armL.rotation.x = b * 0.07; armR.rotation.x = -b * 0.07; }
        armL.rotation.z = 0.1; armR.rotation.z = -0.1;
        head.rotation.z = Math.sin(t * 1.3 + blinkOff) * 0.05;
        // look around every few seconds
        const lk = (t + blinkOff * 2) % 5.2;
        head.rotation.y = lk < 1.1 ? Math.sin((lk / 1.1) * Math.PI) * 0.55 : 0;
        // impatient foot-tap when patience is low
        if (mood === 'impatient') {
          const tap = Math.sin(t * 16);
          legR.rotation.x = Math.abs(tap) * 0.5;
          body.position.y += Math.abs(tap) * 0.03;
          armL.rotation.z = 0.3; armR.rotation.z = -0.3;
        }
      }
    },
  };
  return parts;
}

// ---------- procedural food (small dishes) ----------
function bowl(color = 0xf3e6d0): THREE.Group {
  const g = new THREE.Group();
  const b = cyl(0.17, 0.11, 0.1, color, 12); b.position.y = 0.05; g.add(b);
  return g;
}
export function makeFood(id: string): THREE.Object3D {
  const g = new THREE.Group();
  if (id === 'burger' || id === 'pizza') return g; // GLB loaded by caller
  if (id === 'curry') {
    g.add(bowl());
    const cur = cyl(0.14, 0.14, 0.03, 0xe08a2d, 12); cur.position.y = 0.1; g.add(cur);
    const rice = sph(0.06, 0xfff7e8); rice.scale.y = 0.6; rice.position.y = 0.12; g.add(rice);
  } else if (id === 'noodles') {
    g.add(bowl(0xd94f3d));
    const n = cyl(0.14, 0.14, 0.035, 0xe8c93d, 12); n.position.y = 0.1; g.add(n);
    for (const [x, z] of [[-0.05, 0.03], [0.04, -0.04], [0.02, 0.05]] as const) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 10), mat(0xc9932b));
      s.rotation.x = Math.PI / 2; s.position.set(x, 0.12, z); s.castShadow = true; g.add(s);
    }
  } else if (id === 'tea') {
    const cup = cyl(0.09, 0.07, 0.13, 0xf3e6d0, 12); cup.position.y = 0.065; g.add(cup);
    const tea = cyl(0.075, 0.075, 0.02, 0x8a5a2b, 12); tea.position.y = 0.12; g.add(tea);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 10, Math.PI), mat(0xf3e6d0));
    hd.position.set(0.1, 0.07, 0); hd.rotation.z = -Math.PI / 2; hd.castShadow = true; g.add(hd);
    const sau = cyl(0.12, 0.12, 0.02, 0xe8d9b8, 12); sau.position.y = 0.01; g.add(sau);
  } else if (id === 'soup') {
    g.add(bowl());
    const s = cyl(0.14, 0.14, 0.03, 0xd94f3d, 12); s.position.y = 0.1; g.add(s);
  } else if (id === 'salad') {
    g.add(bowl(0x9fc6e8));
    for (const [x, y, z] of [[0, 0.12, 0], [-0.06, 0.11, 0.04], [0.06, 0.11, -0.03], [0.01, 0.14, -0.05]] as const) {
      const l = sph(0.05, 0x4fae5a, 8, 6); l.position.set(x, y, z); g.add(l);
    }
  } else if (id === 'cake') {
    const c = cyl(0.12, 0.12, 0.1, 0x6b4423, 12); c.position.y = 0.05; g.add(c);
    const top = cyl(0.12, 0.12, 0.03, 0xe88aa0, 12); top.position.y = 0.11; g.add(top);
    const ch = sph(0.03, 0xd94f3d); ch.position.y = 0.15; g.add(ch);
  } else if (id === 'fishcurry') {
    g.add(bowl());
    const cur = cyl(0.14, 0.14, 0.03, 0xc9552b, 12); cur.position.y = 0.1; g.add(cur);
    const fish = sph(0.07, 0xe8a13d); fish.scale.set(1.4, 0.55, 0.8); fish.position.y = 0.12; g.add(fish);
    const herb = sph(0.025, 0x4fae5a, 6, 5); herb.position.set(0.05, 0.14, 0.03); g.add(herb);
  } else if (id === 'omelette') {
    const plate = cyl(0.17, 0.17, 0.025, 0xfff6e6, 14); plate.position.y = 0.015; g.add(plate);
    const om = sph(0.13, 0xe8b93d); om.scale.set(1.25, 0.5, 0.9); om.position.y = 0.06; g.add(om);
    const fold = box(0.2, 0.03, 0.1, 0xd9942b, 0.02, 0.1, 0); fold.rotation.y = 0.4; g.add(fold);
    const herb = sph(0.022, 0x4fae5a, 6, 5); herb.position.set(-0.05, 0.12, 0.05); g.add(herb);
  } else if (id === 'meatpie') {
    const plate = cyl(0.17, 0.17, 0.025, 0xfff6e6, 14); plate.position.y = 0.015; g.add(plate);
    const pie = cyl(0.12, 0.13, 0.09, 0xd9942b, 12); pie.position.y = 0.07; g.add(pie);
    for (const rz of [-0.5, 0, 0.5]) {
      const strip = box(0.26, 0.015, 0.045, 0xe8b93d, 0, 0.12, 0); strip.rotation.y = rz; g.add(strip);
    }
  } else if (id === 'fishchips') {
    const tray = box(0.3, 0.05, 0.2, 0xc9a06a, 0, 0.025, 0); g.add(tray);
    const fish = box(0.16, 0.06, 0.1, 0xe8b93d, -0.05, 0.08, 0); fish.rotation.y = 0.3; g.add(fish);
    for (let i = 0; i < 3; i++) {
      const chip = box(0.035, 0.035, 0.14, 0xf5d67a, 0.08, 0.07 + i * 0.012, -0.04 + i * 0.045);
      chip.rotation.y = 0.15 * i; g.add(chip);
    }
  }
  return g;
}

// ---------- canvas textures ----------
function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Seeded pseudo-random for stable textures.
function rnd(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function woodFloorTexture(): THREE.CanvasTexture {
  const R = rnd(7);
  return canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = '#8a5627'; ctx.fillRect(0, 0, 512, 512);
    const tones = ['#8a5627', '#9c6a33', '#96612e', '#a5733a', '#7e4f24', '#935f2b'];
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = r * 64;
      ctx.fillStyle = tones[Math.floor(R() * tones.length)];
      ctx.fillRect(0, y, 512, 64);
      // subtle per-plank brightness patches
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = `rgba(${R() > 0.5 ? '255,214,150' : '50,28,10'},${0.05 + R() * 0.06})`;
        ctx.fillRect(R() * 512, y, 60 + R() * 120, 64);
      }
      ctx.fillStyle = 'rgba(50,28,10,0.6)'; ctx.fillRect(0, y, 512, 3);
      const off = (r * 197) % 512;
      ctx.fillRect(off, y, 3, 64); ctx.fillRect((off + 256) % 512, y, 3, 64);
      // grain
      ctx.strokeStyle = 'rgba(60,32,12,0.3)'; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const gy = y + 10 + i * 11;
        ctx.beginPath(); ctx.moveTo(0, gy);
        ctx.bezierCurveTo(150, gy + 4, 350, gy - 4, 512, gy + 2); ctx.stroke();
      }
      // a knot on some planks
      if (R() > 0.55) {
        const kx = R() * 512, ky = y + 20 + R() * 24;
        ctx.strokeStyle = 'rgba(60,32,12,0.55)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(kx, ky, 9, 6, 0.3, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(60,32,12,0.5)';
        ctx.beginPath(); ctx.ellipse(kx, ky, 3.5, 2.5, 0.3, 0, 7); ctx.fill();
      }
    }
  });
}

export function tileTexture(): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (ctx) => {
    const n = 4, s = 256 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#e9d3ae' : '#c96f4a';
      ctx.fillRect(x * s, y * s, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x * s + 4, y * s + 4, s - 8, 10);
    }
    ctx.strokeStyle = 'rgba(90,58,34,0.6)'; ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(256, i * s); ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function ginghamTexture(c1 = '#c96058', c2 = '#f7ead2'): THREE.CanvasTexture {
  return canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = c2; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = c1; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(i * 32, 0, 16, 128);
      ctx.fillRect(0, i * 32, 128, 16);
    }
    ctx.globalAlpha = 1;
  });
}

export function rugTexture(c1 = '#b04038', c2 = '#e8c93d'): THREE.CanvasTexture {
  return canvasTex(256, 256, (ctx) => {
    const rings: [number, string][] = [[124, c1], [104, c2], [84, c1], [64, '#f3e6d0'], [44, c1], [26, c2]];
    for (const [r, col] of rings) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(128, 128, r, 0, 7); ctx.fill();
    }
  });
}

export function grassTexture(): THREE.CanvasTexture {
  const R = rnd(21);
  const t = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#6da055'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const g = 130 + Math.floor(R() * 70);
      ctx.fillStyle = `rgba(${g - 45},${g},${g - 75},0.55)`;
      const s = 2 + R() * 5;
      ctx.fillRect(R() * 256, R() * 256, s, s * 0.6);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  return t;
}

export function awningTexture(): THREE.CanvasTexture {
  const t = canvasTex(256, 64, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#f7ead2' : '#c96058';
      ctx.fillRect(i * 32, 0, 32, 64);
    }
    ctx.fillStyle = 'rgba(90,58,34,0.25)'; ctx.fillRect(0, 52, 256, 12);
  });
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1);
  return t;
}

/** Painted view for the window: sunny hills, a tree, birds. */
export function windowViewTexture(): THREE.CanvasTexture {
  return canvasTex(256, 192, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 192);
    sky.addColorStop(0, '#8fc3e8'); sky.addColorStop(0.7, '#cfe8f5'); sky.addColorStop(1, '#fff3d6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = '#ffdf8a';
    ctx.beginPath(); ctx.arc(200, 44, 24, 0, 7); ctx.fill();
    ctx.fillStyle = '#8fbf6a';
    ctx.beginPath(); ctx.moveTo(0, 150);
    ctx.quadraticCurveTo(70, 100, 140, 140); ctx.quadraticCurveTo(200, 170, 256, 130);
    ctx.lineTo(256, 192); ctx.lineTo(0, 192); ctx.fill();
    ctx.fillStyle = '#6aa84f';
    ctx.beginPath(); ctx.moveTo(0, 170); ctx.quadraticCurveTo(90, 130, 180, 165);
    ctx.quadraticCurveTo(220, 180, 256, 165); ctx.lineTo(256, 192); ctx.lineTo(0, 192); ctx.fill();
    // tree
    ctx.fillStyle = '#6b4423'; ctx.fillRect(46, 120, 10, 34);
    ctx.fillStyle = '#4fae5a';
    ctx.beginPath(); ctx.arc(51, 108, 24, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(34, 118, 15, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(68, 118, 15, 0, 7); ctx.fill();
    // birds
    ctx.strokeStyle = '#5a6a7a'; ctx.lineWidth = 3;
    for (const [x, y] of [[120, 50], [150, 66]] as const) {
      ctx.beginPath(); ctx.arc(x - 7, y, 7, 3.4, 5.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 7, y, 7, 3.5, 6.0); ctx.stroke();
    }
  });
}

/** Small framed painting: simple landscape variants. */
export function paintingTexture(variant: number): THREE.CanvasTexture {
  return canvasTex(128, 96, (ctx) => {
    const skies = ['#a8d0e8', '#f5c98a', '#c9b8e8'];
    ctx.fillStyle = skies[variant % 3]; ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = ['#7fae5f', '#c98a4a', '#6a9a8a'][variant % 3];
    ctx.beginPath(); ctx.moveTo(0, 70);
    ctx.quadraticCurveTo(40, 45, 80, 62); ctx.quadraticCurveTo(105, 72, 128, 60);
    ctx.lineTo(128, 96); ctx.lineTo(0, 96); ctx.fill();
    ctx.fillStyle = '#ffdf8a'; ctx.beginPath(); ctx.arc(96, 24, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#4fae5a'; ctx.beginPath(); ctx.arc(30, 60, 12, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(28, 66, 4, 10);
  });
}

/** Chalkboard menu. */
export function menuBoardTexture(): THREE.CanvasTexture {
  return canvasTex(256, 192, (ctx) => {
    ctx.fillStyle = '#3a2f28'; ctx.fillRect(0, 0, 256, 192);
    ctx.strokeStyle = '#8a5f36'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 246, 182);
    ctx.fillStyle = '#f3e6d0'; ctx.textAlign = 'center';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.fillText('~ MENU ~', 128, 44);
    ctx.font = '20px Georgia, serif'; ctx.textAlign = 'left';
    const rows: [string, string][] = [
      ['Curry Rice', '12c'], ['Noodle Bowl', '10c'], ['Masala Tea', '6c'],
      ['Cafe Burger', '16c'], ['Choco Cake', '14c'],
    ];
    rows.forEach(([n, p], i) => {
      const y = 76 + i * 24;
      ctx.fillText(n, 26, y);
      ctx.textAlign = 'right'; ctx.fillText(p, 230, y); ctx.textAlign = 'left';
    });
  });
}

// ---------- AI-generated dish icons (user-approved 2026-10-03) ----------
// Crisp appetizing PNGs in public/icons/. Preloaded once at startup; the
// hand-drawn canvas icons below remain as offline fallback.
const ICON_URLS: Record<string, string> = {
  curry: './icons/dish-curry.webp', noodles: './icons/dish-noodles.webp',
  burger: './icons/dish-burger.webp', pizza: './icons/dish-pizza.webp',
  tea: './icons/dish-tea.webp', soup: './icons/dish-soup.webp',
  salad: './icons/dish-salad.webp', cake: './icons/dish-cake.webp',
  fishcurry: './icons/dish-fishcurry.webp', omelette: './icons/dish-omelette.webp',
  meatpie: './icons/dish-meatpie.webp', fishchips: './icons/dish-fishchips.webp',
};
const iconImgs = new Map<string, HTMLImageElement>();
export function preloadIcons(): Promise<void> {
  const jobs = Object.entries(ICON_URLS).map(([id, url]) => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { iconImgs.set(id, img); resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  }));
  return Promise.all(jobs).then(() => undefined);
}
export function dishIconImage(id: string): HTMLImageElement | undefined {
  return iconImgs.get(id);
}

// Dish icon drawn into the order bubble (simple, readable).
export function drawDishIcon(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number) {
  ctx.save(); ctx.translate(cx, cy);
  const u = s / 64;
  ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(90,58,34,0.85)';
  const circle = (x: number, y: number, r: number, fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, 7); ctx.fill(); ctx.stroke();
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill; ctx.fillRect(x * u, y * u, w * u, h * u); ctx.strokeRect(x * u, y * u, w * u, h * u);
  };
  if (id === 'burger') {
    ctx.fillStyle = '#e8b96a'; ctx.beginPath(); ctx.arc(0, -8 * u, 22 * u, Math.PI, 0); ctx.fill(); ctx.stroke();
    // sesame
    ctx.fillStyle = '#fff3dd';
    for (const [x, y] of [[-10, -16], [2, -20], [12, -14]] as const) { ctx.beginPath(); ctx.arc(x * u, y * u, 2.2 * u, 0, 7); ctx.fill(); }
    rect(-22, -8, 44, 7, '#4fae5a');
    rect(-22, -1, 44, 9, '#8a5a3b');
    ctx.fillStyle = '#e8b96a'; ctx.beginPath(); ctx.arc(0, 8 * u, 22 * u, 0, Math.PI); ctx.fill(); ctx.stroke();
  } else if (id === 'pizza') {
    ctx.fillStyle = '#e8b96a'; ctx.beginPath(); ctx.moveTo(-20 * u, -16 * u); ctx.lineTo(20 * u, -16 * u); ctx.lineTo(0, 20 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d94f3d';
    for (const [x, y] of [[-8, -8], [8, -6], [0, 4]] as const) circle(x, y, 4.5, '#d94f3d');
    ctx.fillStyle = '#f3e6d0';
    for (const [x, y] of [[-2, -10], [6, 2]] as const) { ctx.beginPath(); ctx.arc(x * u, y * u, 2.4 * u, 0, 7); ctx.fill(); }
  } else if (id === 'tea') {
    rect(-14, -14, 28, 30, '#f3e6d0');
    rect(-11, -11, 22, 8, '#8a5a2b');
    ctx.strokeStyle = '#f3e6d0'; ctx.lineWidth = 5 * u;
    ctx.beginPath(); ctx.arc(16 * u, 2 * u, 8 * u, -1.2, 1.2); ctx.stroke();
    // steam
    ctx.strokeStyle = 'rgba(150,150,150,0.8)'; ctx.lineWidth = 2.5 * u;
    ctx.beginPath(); ctx.moveTo(-4 * u, -20 * u); ctx.quadraticCurveTo(-8 * u, -26 * u, -4 * u, -32 * u); ctx.stroke();
  } else if (id === 'cake') {
    rect(-18, -6, 36, 22, '#6b4423');
    rect(-18, -14, 36, 10, '#e88aa0');
    circle(0, -18, 6, '#d94f3d');
    ctx.fillStyle = '#fff3dd';
    for (const x of [-9, 0, 9]) { ctx.fillRect((x - 1.5) * u, -12 * u, 3 * u, 6 * u); }
  } else if (id === 'salad') {
    ctx.fillStyle = '#9fc6e8'; ctx.beginPath(); ctx.arc(0, 4 * u, 20 * u, 0, Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4fae5a';
    for (const [x, y] of [[-8, -6], [6, -8], [0, -2]] as const) circle(x, y, 8, '#4fae5a');
    circle(4, -10, 3.5, '#d94f3d');
  } else { // bowls: curry / noodles / soup
    const soupCol = id === 'curry' ? '#e08a2d' : id === 'noodles' ? '#e8c93d' : '#d94f3d';
    ctx.fillStyle = '#f3e6d0'; ctx.beginPath(); ctx.arc(0, 2 * u, 22 * u, 0, Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = soupCol; ctx.beginPath(); ctx.arc(0, -2 * u, 17 * u, Math.PI, 0); ctx.fill();
    if (id === 'curry') circle(-6, -6, 7, '#fff7e8');
    if (id === 'noodles') {
      ctx.strokeStyle = '#c9932b'; ctx.lineWidth = 3 * u;
      for (const [x, y] of [[-4, -4], [5, -8]] as const) { ctx.beginPath(); ctx.arc(x * u, y * u, 5 * u, 0, 7); ctx.stroke(); }
    }
  }
  ctx.restore();
}

// Small icon for shop rows that aren't dishes.
export function drawShopIcon(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number) {
  ctx.save(); ctx.translate(cx, cy);
  const u = s / 64;
  ctx.fillStyle = '#8a5f36'; ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 3 * u;
  if (id === 'table') {
    ctx.fillRect(-20 * u, -6 * u, 40 * u, 8 * u);
    ctx.fillRect(-16 * u, 2 * u, 5 * u, 18 * u);
    ctx.fillRect(11 * u, 2 * u, 5 * u, 18 * u);
    ctx.fillStyle = '#c96058'; ctx.fillRect(-20 * u, -10 * u, 40 * u, 5 * u);
  } else if (id === 'stove' || id === 'station') {
    ctx.fillStyle = '#e8a13d'; ctx.fillRect(-18 * u, -4 * u, 36 * u, 24 * u);
    ctx.strokeRect(-18 * u, -4 * u, 36 * u, 24 * u);
    ctx.fillStyle = '#2e2a28';
    for (const [x, y] of [[-9, 2], [9, 2], [-9, 12], [9, 12]] as const) {
      ctx.beginPath(); ctx.arc(x * u, y * u, 5 * u, 0, 7); ctx.fill();
    }
    if (id === 'station') { ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-12 * u, -16 * u, 24 * u, 10 * u); }
  } else if (id === 'room') {
    ctx.fillStyle = '#b9834f'; ctx.fillRect(-14 * u, -20 * u, 28 * u, 40 * u);
    ctx.strokeRect(-14 * u, -20 * u, 28 * u, 40 * u);
    ctx.fillStyle = '#d9a441'; ctx.beginPath(); ctx.arc(8 * u, 2 * u, 3.5 * u, 0, 7); ctx.fill();
  } else if (id === 'decor') {
    ctx.fillStyle = '#b0603c';
    ctx.beginPath(); ctx.moveTo(-10 * u, 20 * u); ctx.lineTo(10 * u, 20 * u); ctx.lineTo(7 * u, 4 * u); ctx.lineTo(-7 * u, 4 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4fae5a';
    ctx.beginPath(); ctx.arc(0, -6 * u, 12 * u, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-9 * u, 0, 8 * u, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(9 * u, 0, 8 * u, 0, 7); ctx.fill();
  } else {
    drawDishIcon(ctx, 'curry', 0, 0, s);
  }
  ctx.restore();
}

export function bubbleTexture(recipe: Recipe): THREE.CanvasTexture {
  return canvasTex(192, 224, (ctx) => {
    // soft shadow
    ctx.fillStyle = 'rgba(40,20,8,0.25)';
    ctx.beginPath(); ctx.roundRect(12, 14, 168, 158, 26); ctx.fill();
    // white bubble
    ctx.fillStyle = '#fffdf6';
    ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(8, 8, 176, 158, 26); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(72, 164); ctx.lineTo(120, 164); ctx.lineTo(96, 208); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // inner highlight
    ctx.strokeStyle = 'rgba(232,161,61,0.5)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(18, 18, 156, 138, 20); ctx.stroke();
    // dish icon: crisp PNG in a circular badge, canvas fallback if not loaded
    const img = iconImgs.get(recipe.id);
    if (img) {
      ctx.save();
      ctx.beginPath(); ctx.arc(96, 88, 54, 0, 7); ctx.clip();
      ctx.drawImage(img, 42, 34, 108, 108);
      ctx.restore();
      ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(96, 88, 54, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(96, 88, 48, -2.4, -1.2); ctx.stroke();
    } else {
      drawDishIcon(ctx, recipe.id, 96, 88, 112);
    }
  });
}

export function makeBubble(recipe: Recipe): { sprite: THREE.Sprite; bar: THREE.Mesh; group: THREE.Group } {
  const group = new THREE.Group();
  const tex = bubbleTexture(recipe);
  const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(sm);
  sprite.scale.set(1.05, 1.225, 1);
  sprite.renderOrder = 50;
  group.add(sprite);
  // patience bar
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.13), mat(0x3d2412, { roughness: 1 }));
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.08), mat(0x4fae5a, { roughness: 1 }));
  barFg.position.z = 0.005;
  const bar = new THREE.Group(); bar.add(barBg, barFg); bar.position.y = -0.78;
  group.add(bar);
  group.userData.barFg = barFg;
  return { sprite, bar: barFg as unknown as THREE.Mesh, group };
}

export function setPatience(barFg: THREE.Object3D, frac: number) {
  const f = Math.max(0.001, Math.min(1, frac));
  barFg.scale.x = f;
  barFg.position.x = -0.47 * (1 - f);
  const m = (barFg as THREE.Mesh).material as THREE.MeshStandardMaterial;
  m.color.setHex(f > 0.5 ? 0x4fae5a : f > 0.25 ? 0xe8c93d : 0xd94f3d);
}

// ---------- decor builders ----------
export function rugMesh(r: number, c1 = 0xb04038, c2 = 0xe8c93d): THREE.Mesh {
  const tex = rugTexture(
    '#' + c1.toString(16).padStart(6, '0'),
    '#' + c2.toString(16).padStart(6, '0'),
  );
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 0.025, 24),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
  );
  m.receiveShadow = true;
  return m;
}

/** Hanging pendant lamp: cord + shade + warm glowing bulb. No real light (perf). */
export function pendantLamp(): THREE.Group {
  const g = new THREE.Group();
  const cord = cyl(0.02, 0.02, 1.1, 0x3d2412, 6); cord.position.y = 2.85; cord.castShadow = false; g.add(cord);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.3, 0.28, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xc96058, roughness: 0.8, side: THREE.DoubleSide }),
  );
  shade.position.y = 2.25; shade.castShadow = true; g.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffc46a, emissiveIntensity: 1.6 }),
  );
  bulb.position.y = 2.16; g.add(bulb);
  // warm pool of light on the table below
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.83; g.add(pool);
  registerSway(g, 0.035, 0.85); // gentle sway — alive, not static
  return g;
}

/** Tiny flower vase centerpiece for tables. */
export function tableCenterpiece(): THREE.Group {
  const g = new THREE.Group();
  const vase = cyl(0.05, 0.07, 0.14, 0x9fc6e8, 8); vase.position.y = 0.07; g.add(vase);
  const stem = cyl(0.012, 0.012, 0.16, 0x357a3e, 6); stem.position.y = 0.2; stem.castShadow = false; g.add(stem);
  const bloom = sph(0.05, 0xe88aa0, 8, 6); bloom.position.y = 0.3; g.add(bloom);
  return g;
}

export function pottedPlant(): THREE.Group {
  const g = new THREE.Group();
  const pot = cyl(0.16, 0.12, 0.24, 0xb0603c, 10); pot.position.y = 0.12; g.add(pot);
  const soil = cyl(0.14, 0.14, 0.03, 0x4a3220, 10); soil.position.y = 0.25; g.add(soil);
  const trunk = cyl(0.03, 0.04, 0.3, 0x6b4423, 6); trunk.position.y = 0.4; g.add(trunk);
  for (const [x, y, z, r] of [[0, 0.68, 0, 0.22], [-0.14, 0.58, 0.08, 0.15], [0.14, 0.6, -0.06, 0.16]] as const) {
    const leaf = sph(r, PAL.plant, 8, 6); leaf.position.set(x, y, z); leaf.scale.y = 1.25; g.add(leaf);
  }
  return g;
}

function lowPolyTree(s = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = cyl(0.14 * s, 0.2 * s, 1.1 * s, 0x6b4423, 7); trunk.position.y = 0.55 * s; g.add(trunk);
  const blobs: [number, number, number, number][] = [
    [0, 1.5, 0, 0.85], [-0.5, 1.2, 0.2, 0.55], [0.5, 1.25, -0.15, 0.6],
  ];
  for (const [x, y, z, r] of blobs) {
    const b = sph(r * s, PAL.plant, 8, 6); b.position.set(x * s, y * s, z * s); g.add(b);
  }
  return g;
}

export function wallShelf(): THREE.Group {
  const g = new THREE.Group();
  const shelf = box(1.1, 0.08, 0.35, PAL.wood, 0, 0, 0); g.add(shelf);
  // jars
  for (const [x, c] of [[-0.3, 0xd9a441], [0, 0x9fc6e8], [0.3, 0xb0603c]] as const) {
    const jar = cyl(0.09, 0.09, 0.22, c, 8); jar.position.set(x, 0.15, 0); g.add(jar);
    const lid = cyl(0.1, 0.1, 0.04, PAL.woodDark, 8); lid.position.set(x, 0.28, 0); g.add(lid);
  }
  return g;
}

// ---------- inn room vignette ----------
/** One cozy rentable room: bed with blanket + pillow, bedside lamp, rug. */
export function buildInnRoom(): THREE.Group {
  const g = new THREE.Group();
  // Bed frame + headboard.
  g.add(box(1.9, 0.22, 1.0, PAL.woodDark, 0, 0.22, 0));
  g.add(box(0.12, 0.85, 1.0, PAL.woodTrim, 0.92, 0.55, 0));
  for (const [x, z] of [[-0.85, -0.42], [-0.85, 0.42], [0.85, -0.42], [0.85, 0.42]] as const) {
    g.add(box(0.12, 0.22, 0.12, PAL.woodTrim, x, 0.11, z));
  }
  // Mattress + blanket + pillows.
  g.add(box(1.78, 0.18, 0.92, 0xfff6e6, 0, 0.42, 0));
  const blanket = box(1.05, 0.2, 0.94, 0xc96058, -0.32, 0.44, 0); g.add(blanket);
  const fold = box(0.22, 0.22, 0.94, 0xe8a13d, 0.28, 0.44, 0); g.add(fold);
  for (const sz of [-1, 1]) {
    const p = box(0.34, 0.13, 0.36, 0xffffff, 0.66, 0.55, sz * 0.24);
    p.rotation.z = -0.12; g.add(p);
  }
  // Bedside table + lamp.
  g.add(box(0.42, 0.42, 0.42, PAL.wood, -0.15, 0.21, 0.78));
  const lb = cyl(0.05, 0.08, 0.1, PAL.woodTrim, 8); lb.position.set(-0.15, 0.47, 0.78); g.add(lb);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.14, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffc46a, emissiveIntensity: 1.2, roughness: 0.9 }),
  );
  shade.position.set(-0.15, 0.6, 0.78); shade.castShadow = true; g.add(shade);
  // Rug under the bed.
  const rug = rugMesh(0.9, 0x9b59d0, 0xe8c93d);
  rug.position.set(0, 0.012, 0); g.add(rug);
  // Folded towel on the bed.
  g.add(box(0.3, 0.07, 0.24, 0x9fc6e8, -0.3, 0.56, 0));
  return g;
}

/** Low wooden divider marking the inn nook + hanging INN sign. */
export function innDivider(): THREE.Group {
  const g = new THREE.Group();
  const wall = box(0.16, 1.55, 3.3, 0xe8d3a8, 0, 0.775, 0); g.add(wall);
  g.add(box(0.24, 0.1, 3.4, PAL.woodTrim, 0, 1.6, 0));
  g.add(box(0.24, 0.14, 3.4, PAL.woodDark, 0, 0.07, 0));
  // hanging sign
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 96;
  const sx = sc.getContext('2d')!;
  sx.fillStyle = '#6b4423'; sx.fillRect(0, 0, 256, 96);
  sx.fillStyle = '#ffe9b8'; sx.font = 'bold 52px Georgia, serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
  sx.fillText('· INN ·', 128, 50);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38),
    new THREE.MeshStandardMaterial({ map: st, roughness: 0.9 }));
  sign.position.set(-0.1, 1.15, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
  const c1 = cyl(0.015, 0.015, 0.22, 0x3d2412, 6); c1.position.set(-0.1, 1.42, -0.3); g.add(c1);
  const c2 = cyl(0.015, 0.015, 0.22, 0x3d2412, 6); c2.position.set(-0.1, 1.42, 0.3); g.add(c2);
  return g;
}

// ---------- room ----------
export function buildRoom(scene: THREE.Scene) {
  const g = new THREE.Group();
  // Floor 14 x 10.6 with varied wood planks.
  const floorTex = woodFloorTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3.5, 2.5);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.2, 10.6),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
  );
  floor.position.y = -0.1; floor.receiveShadow = true;
  g.add(floor);

  // Kitchen tile zone (back strip).
  const tileTex = tileTexture();
  tileTex.repeat.set(7, 1.6);
  const tile = new THREE.Mesh(
    new THREE.PlaneGeometry(13.8, 2.7),
    new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.85 }),
  );
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(0, 0.006, -3.95);
  tile.receiveShadow = true;
  g.add(tile);

  // Back wall + side walls (dollhouse: front open).
  const wallMat = mat(PAL.wall);
  const back = box(14, 3.4, 0.3, PAL.wall, 0, 1.7, -5.15); back.material = wallMat;
  const left = box(0.3, 3.4, 10.6, PAL.wall, -7.05, 1.7, 0); left.material = wallMat;
  const right = box(0.3, 3.4, 10.6, PAL.wall, 7.05, 1.7, 0); right.material = wallMat;
  // Wainscot + baseboards + crown trim.
  const trimB = box(14, 0.55, 0.34, PAL.woodDark, 0, 0.275, -5.15);
  const trimL = box(0.34, 0.55, 10.6, PAL.woodDark, -7.05, 0.275, 0);
  const trimR = box(0.34, 0.55, 10.6, PAL.woodDark, 7.05, 0.275, 0);
  const railB = box(14, 0.09, 0.36, PAL.woodTrim, 0, 0.6, -5.14);
  const beam = box(14.4, 0.35, 0.5, PAL.woodTrim, 0, 3.35, -5.1);
  g.add(back, left, right, trimB, trimL, trimR, railB, beam);

  // Big warm rug in the middle of the cafe.
  const bigRug = rugMesh(1.7, 0xb04038, 0xe8c93d);
  bigRug.position.set(0, 0.012, 0.9);
  g.add(bigRug);

  // Rug near door.
  const rug = rugMesh(1.0, 0xc96058, 0xf3e6d0);
  rug.position.set(0, 0.012, 4.3);
  g.add(rug);

  // Hanging sign on back wall.
  const sign = new THREE.Group();
  const board = box(2.6, 0.85, 0.12, PAL.woodTrim, 0, 0, 0);
  const boardIn = box(2.3, 0.6, 0.14, 0x8a5f36, 0, 0, 0);
  sign.add(board, boardIn);
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128;
  const sx = sc.getContext('2d')!;
  sx.fillStyle = '#8a5f36'; sx.fillRect(0, 0, 512, 128);
  sx.fillStyle = '#fff3dd'; sx.font = 'bold 64px Georgia, serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
  sx.fillText('Rahsa Cafe', 256, 64);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: st, roughness: 0.9 }));
  face.position.z = 0.075; sign.add(face);
  sign.position.set(0, 2.5, -4.95);
  g.add(sign);

  // Window on back wall with a painted view.
  const win = new THREE.Group();
  const frame = box(1.9, 1.55, 0.1, PAL.woodTrim, 0, 0, 0);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.28),
    new THREE.MeshStandardMaterial({ map: windowViewTexture(), roughness: 0.6 }));
  view.position.z = 0.055;
  const cross1 = box(1.62, 0.08, 0.12, PAL.woodTrim, 0, 0, 0.02);
  const cross2 = box(0.08, 1.28, 0.12, PAL.woodTrim, 0, 0, 0.02);
  const sill = box(2.1, 0.1, 0.3, PAL.woodDark, 0, -0.82, 0.08);
  // little plant on the sill
  const sillPlant = pottedPlant(); sillPlant.scale.setScalar(0.55); sillPlant.position.set(0.6, -0.77, 0.1);
  win.add(frame, view, cross1, cross2, sill, sillPlant);
  win.position.set(-5.2, 1.95, -4.98);
  g.add(win);

  // Framed paintings on the back wall.
  const paintings: [number, number, number][] = [[-2.6, 2.1, 0], [2.7, 2.05, 1], [5.4, 2.2, 2]];
  for (const [px, py, v] of paintings) {
    const pg = new THREE.Group();
    pg.add(box(0.95, 0.75, 0.07, PAL.woodTrim, 0, 0, 0));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6),
      new THREE.MeshStandardMaterial({ map: paintingTexture(v), roughness: 0.9 }));
    art.position.z = 0.04; pg.add(art);
    pg.position.set(px, py, -4.96);
    g.add(pg);
  }

  // Chalkboard menu near the counter (right side of back wall).
  const menu = new THREE.Group();
  menu.add(box(1.7, 1.3, 0.07, PAL.woodTrim, 0, 0, 0));
  const menuFace = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12),
    new THREE.MeshStandardMaterial({ map: menuBoardTexture(), roughness: 0.95 }));
  menuFace.position.z = 0.045; menu.add(menuFace);
  menu.position.set(3.6, 2.0, -4.96);
  menu.rotation.z = 0.02;
  g.add(menu);

  // Wall clock.
  const clockG = new THREE.Group();
  const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20),
    new THREE.MeshStandardMaterial({ color: 0xfff6e6, roughness: 0.8 }));
  clockFace.rotation.x = Math.PI / 2; clockG.add(clockFace);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 20), mat(PAL.woodTrim));
  clockG.add(rim);
  const handH = box(0.035, 0.16, 0.02, 0x3d2412, 0, 0.06, 0.045);
  const handM = box(0.025, 0.24, 0.02, 0x3d2412, 0.05, 0.08, 0.045);
  handM.rotation.z = -0.9;
  clockG.add(handH, handM);
  clockG.position.set(-1.2, 2.5, -4.95);
  g.add(clockG);

  // (no awning: keep the front open so the play area stays fully visible)

  // Corner plants (fixed, always there).
  for (const [px, pz] of [[-6.3, 4.3], [6.3, -4.3]] as const) {
    const p = pottedPlant(); p.position.set(px, 0, pz); g.add(p);
  }

  scene.add(g);
  return g;
}

/** Warm sandstone paving for the city plaza. */
export function pavingTexture(): THREE.CanvasTexture {
  const R = rnd(31);
  const t = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#b99a6e'; ctx.fillRect(0, 0, 256, 256);
    const tones = ['#b99a6e', '#c4a678', '#ae8f63', '#bfa071', '#b39468'];
    const n = 4, s = 256 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = tones[Math.floor(R() * tones.length)];
      // offset rows like real pavers
      const ox = (y % 2) * s * 0.5;
      ctx.fillRect(x * s - s + ox, y * s, s, s);
      ctx.fillRect(x * s + ox, y * s, s, s);
      // speckle
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(${R() > 0.5 ? '255,240,210' : '80,58,34'},${0.05 + R() * 0.08})`;
        ctx.fillRect(x * s + R() * s, y * s + R() * s, 2 + R() * 4, 2 + R() * 3);
      }
    }
    ctx.strokeStyle = 'rgba(74,52,30,0.55)'; ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(256, i * s); ctx.stroke();
      for (let y = 0; y < n; y++) {
        const ox = (y % 2) * s * 0.5;
        ctx.beginPath(); ctx.moveTo(((i * s + ox) % 256 + 256) % 256, y * s); ctx.lineTo(((i * s + ox) % 256 + 256) % 256, (y + 1) * s); ctx.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 14);
  return t;
}

/** Circular medallion pattern for the plaza center. */
export function medallionTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (ctx) => {
    const rings: [number, string][] = [
      [126, '#a8825a'], [112, '#c4a678'], [96, '#8f6a42'], [80, '#c4a678'],
      [64, '#b04038'], [48, '#e8c93d'], [32, '#b04038'], [16, '#e8c93d'],
    ];
    for (const [r, col] of rings) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(128, 128, r, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(74,52,30,0.4)'; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(128, 128);
      ctx.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126); ctx.stroke();
    }
  });
}

/** Street lamp: dark pole, warm glowing lantern, pool of light below. No real light (perf). */
export function streetLamp(): THREE.Group {
  const g = new THREE.Group();
  const pole = cyl(0.07, 0.1, 3.2, 0x3d3428, 8); pole.position.y = 1.6; g.add(pole);
  const cap = sph(0.12, 0x3d3428, 8, 6); cap.position.y = 3.25; g.add(cap);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.42, 6, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x3d3428, roughness: 0.8, side: THREE.DoubleSide }));
  cage.position.y = 2.95; g.add(cage);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffb84d, emissiveIntensity: 2.2 }));
  bulb.position.y = 2.95; g.add(bulb);
  const lid = cyl(0.2, 0.26, 0.08, 0x3d3428, 6); lid.position.y = 3.2; g.add(lid);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20),
    new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.14, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02; g.add(pool);
  // register gentle flicker handled by updateAmbient
  registerFlicker(bulb, 2.2);
  return g;
}

/** Stone planter with bright flowers. Leaf blobs registered for rustle. */
export function flowerPlanter(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.1, 0.5, 1.1, 0x9a8a76, 0, 0.25, 0));
  g.add(box(1.2, 0.08, 1.2, 0x8a7a66, 0, 0.53, 0));
  const soil = box(0.95, 0.06, 0.95, 0x4a3220, 0, 0.55, 0); g.add(soil);
  const R = rnd(5);
  const leaves = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const l = sph(0.16, i % 2 ? PAL.plant : PAL.plantDark, 7, 6);
    l.position.set((R() - 0.5) * 0.7, 0.68 + R() * 0.15, (R() - 0.5) * 0.7);
    leaves.add(l);
  }
  const flowerCols = [0xe88aa0, 0xe8c93d, 0xd94f3d, 0xf3e6d0, 0x9b59d0];
  for (let i = 0; i < 5; i++) {
    const st = cyl(0.02, 0.02, 0.3, PAL.plantDark, 5);
    st.position.set((R() - 0.5) * 0.8, 0.75, (R() - 0.5) * 0.8);
    st.castShadow = false; g.add(st);
    const f = sph(0.075, flowerCols[i % flowerCols.length], 8, 6);
    f.position.set(st.position.x, 0.93, st.position.z); g.add(f);
    const c = sph(0.03, 0xe8c93d, 6, 5); c.position.set(st.position.x, 0.97, st.position.z); g.add(c);
  }
  g.add(leaves);
  g.userData.rustle = leaves;
  registerSway(leaves, 0.05, 2.4, 'x'); // leaves rustle
  return g;
}

/** Simple wooden bench. */
export function bench(): THREE.Group {
  const g = new THREE.Group();
  for (const dz of [-0.18, 0.18]) {
    g.add(box(1.8, 0.07, 0.16, 0x8a5f36, 0, 0.45, dz));
  }
  g.add(box(1.8, 0.35, 0.07, 0x8a5f36, 0, 0.72, -0.3));
  for (const dx of [-0.75, 0.75]) {
    g.add(box(0.09, 0.45, 0.5, 0x5a3a22, dx, 0.225, 0));
  }
  return g;
}

/** Neighboring town building: pastel front with warm windows, door, awning. */
export function townBuilding(w: number, h: number, color: number, awningCol = '#c96058'): THREE.Group {
  const g = new THREE.Group();
  const d = 7;
  const body = box(w, h, d, color, 0, h / 2, 0); g.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, Math.max(w, d) * 0.72, h * 0.28, 4),
    mat(0x7a4a2e));
  roof.position.y = h + h * 0.13; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
  g.add(box(w + 0.5, 0.25, d + 0.5, 0x8a5f36, 0, h - 0.1, 0));
  // windows with warm glow
  const rows = Math.max(1, Math.floor((h - 2.4) / 2.4));
  const cols = Math.max(2, Math.floor(w / 2.4));
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffc46a, emissiveIntensity: 0.9, roughness: 0.6 });
  const frameMat = mat(0x5a3a22);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = (c - (cols - 1) / 2) * 2.4;
      const wy = 3.1 + r * 2.4;
      const fr = box(1.1, 1.3, 0.1, 0x5a3a22, wx, wy, d / 2 + 0.02); g.add(fr);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.05), winMat);
      win.position.set(wx, wy, d / 2 + 0.08); g.add(win);
      const bar = box(0.06, 1.05, 0.03, 0x5a3a22, wx, wy, d / 2 + 0.09); g.add(bar);
    }
  }
  // door + awning
  g.add(box(1.3, 2.1, 0.12, 0x5a3a22, 0, 1.05, d / 2 + 0.02));
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 5), 1.1),
    new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.9, side: THREE.DoubleSide }));
  awn.position.set(0, 2.75, d / 2 + 0.55); awn.rotation.x = -0.5; g.add(awn);
  return g;
}

/** Market stall: posts, striped awning, counter, produce crates, MARKET sign. */
export function buildMarketStall(): THREE.Group {
  const g = new THREE.Group();
  // posts
  for (const [px, pz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]] as const) {
    const p = cyl(0.07, 0.08, 2.5, 0x6b4423, 8); p.position.set(px, 1.25, pz); g.add(p);
  }
  // awning
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6),
    new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.9, side: THREE.DoubleSide }));
  awn.position.set(0, 2.62, 0); awn.rotation.x = -0.18; awn.castShadow = true; g.add(awn);
  // counter
  g.add(box(2.9, 0.85, 0.9, 0x8a5f36, 0, 0.425, 0.35));
  g.add(box(3.0, 0.08, 1.0, 0x6b4423, 0, 0.9, 0.35));
  // produce crates on the counter
  const produce: [number, number][] = [
    [0xd94f3d, -1.0], [0xe8a13d, -0.35], [0x4fae5a, 0.3], [0xe8c93d, 0.95],
  ];
  for (const [col, px] of produce) {
    g.add(box(0.55, 0.22, 0.55, 0x9a6a3a, px, 1.05, 0.35));
    for (let i = 0; i < 4; i++) {
      const v = sph(0.09, col, 7, 6);
      v.position.set(px - 0.14 + (i % 2) * 0.28, 1.22, 0.25 + Math.floor(i / 2) * 0.22);
      g.add(v);
    }
  }
  // crates stacked beside
  g.add(box(0.7, 0.5, 0.7, 0x9a6a3a, -1.9, 0.25, 0.6));
  g.add(box(0.6, 0.4, 0.6, 0x8a5f36, -1.85, 0.7, 0.55));
  const ap = sph(0.1, 0xd94f3d, 7, 6); ap.position.set(-1.85, 0.98, 0.55); g.add(ap);
  // hanging MARKET sign
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 80;
  const sx = sc.getContext('2d')!;
  sx.fillStyle = '#6b4423'; sx.fillRect(0, 0, 256, 80);
  sx.fillStyle = '#ffe9b8'; sx.font = 'bold 40px Georgia, serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
  sx.fillText('· MARKET ·', 128, 42);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47),
    new THREE.MeshStandardMaterial({ map: st, roughness: 0.9, side: THREE.DoubleSide }));
  sign.position.set(0, 2.1, 1.05); g.add(sign);
  const c1 = cyl(0.015, 0.015, 0.3, 0x3d2412, 6); c1.position.set(-0.5, 2.45, 1.05); g.add(c1);
  const c2 = cyl(0.015, 0.015, 0.3, 0x3d2412, 6); c2.position.set(0.5, 2.45, 1.05); g.add(c2);
  // warm bulb under the awning
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffc46a, emissiveIntensity: 1.8 }));
  bulb.position.set(0, 2.3, 0.3); g.add(bulb);
  registerFlicker(bulb, 1.8);
  return g;
}

/** Hotel frontage that never occludes the dollhouse interior.
 * The locked 40° diorama camera looks over the open front: any tall wall at the
 * front plane bisects the play area (verified against every gameplay sightline).
 * So the hotel reads as a low fascia band with the RAHSA HOTEL sign + side
 * awnings at the front, plus a rooftop sign behind the building that sits above
 * every interior sightline. */
export function buildHotelFacade(): THREE.Group {
  const g = new THREE.Group();
  // Low fascia band across the front opening (y 3.35–3.8). Sightline math at the
  // locked camera angle: clears the stoves, tables, beds, counter and door.
  g.add(box(14.4, 0.45, 0.35, 0xf0d9ae, 0, 3.575, 5.32));
  g.add(box(14.5, 0.1, 0.4, 0x8a5f36, 0, 3.32, 5.32)); // trim under the band
  // RAHSA HOTEL sign on the band.
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 80;
  const sx = sc.getContext('2d')!;
  sx.fillStyle = '#6b4423'; sx.fillRect(0, 0, 512, 80);
  sx.strokeStyle = '#e8a13d'; sx.lineWidth = 5; sx.strokeRect(6, 6, 500, 68);
  sx.fillStyle = '#ffe9b8'; sx.font = 'bold 44px Georgia, serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
  sx.fillText('RAHSA HOTEL', 256, 42);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.375),
    new THREE.MeshStandardMaterial({ map: st, roughness: 0.85 }));
  sign.position.set(0, 3.575, 5.52); g.add(sign);
  // Side awnings under the band (kept clear of the front-table sightlines).
  for (const wx of [-6.6, 6.6]) {
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8),
      new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.9, side: THREE.DoubleSide }));
    awn.position.set(wx, 3.05, 5.6); awn.rotation.x = -0.45; g.add(awn);
  }
  // Rooftop sign behind the building: y 5.8–7 at z=-7.2 sits above every
  // interior sightline, so it can never hide gameplay.
  for (const px of [-2.2, 2.2]) {
    const pole = cyl(0.06, 0.08, 2.6, 0x6b4423, 8); pole.position.set(px, 4.6, -7.2); g.add(pole);
  }
  const rc = document.createElement('canvas'); rc.width = 512; rc.height = 128;
  const rx = rc.getContext('2d')!;
  rx.fillStyle = '#6b4423'; rx.fillRect(0, 0, 512, 128);
  rx.strokeStyle = '#e8a13d'; rx.lineWidth = 6; rx.strokeRect(8, 8, 496, 112);
  rx.fillStyle = '#ffe9b8'; rx.font = 'bold 56px Georgia, serif'; rx.textAlign = 'center'; rx.textBaseline = 'middle';
  rx.fillText('RAHSA HOTEL', 256, 66);
  const rt = new THREE.CanvasTexture(rc); rt.colorSpace = THREE.SRGBColorSpace;
  const rsign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15),
    new THREE.MeshStandardMaterial({
      map: rt, roughness: 0.85, side: THREE.DoubleSide,
      emissive: 0xffc46a, emissiveIntensity: 0.22, emissiveMap: rt,
    }));
  rsign.position.set(0, 6.4, -7.2); g.add(rsign);
  return g;
}

/** Outdoor world: city square. No more countryside grass. */
export function buildEnvironment(scene: THREE.Scene) {
  // Gradient sky dome (vertex colors — no UV ambiguity).
  const skyGeo = new THREE.SphereGeometry(70, 24, 16);
  const pos = skyGeo.attributes.position;
  const colors: number[] = [];
  const top = new THREE.Color(0x5b9bd5);
  const mid = new THREE.Color(0xd4e4ea);
  const bot = new THREE.Color(0xffd9a0);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 70;
    if (y >= 0) tmp.copy(mid).lerp(top, Math.pow(y, 0.7));
    else tmp.copy(mid).lerp(bot, Math.min(1, -y * 1.6));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  // Paving-stone plaza ground.
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(46, 40),
    new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 1 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.21;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Medallion in front of the cafe + stone walkway from the door.
  const med = new THREE.Mesh(new THREE.CircleGeometry(3.1, 32),
    new THREE.MeshStandardMaterial({ map: medallionTexture(), roughness: 1 }));
  med.rotation.x = -Math.PI / 2; med.position.set(0, -0.19, 8.6); med.receiveShadow = true;
  scene.add(med);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.6),
    new THREE.MeshStandardMaterial({ color: 0xc4a678, roughness: 1 }));
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.19, 5.6); walk.receiveShadow = true;
  scene.add(walk);

  // Street lamps around the plaza.
  for (const [lx, lz] of [[-6.5, 9.5], [6.5, 9.5], [-11.5, 3.5], [11.5, 3.5], [-4, 13.5], [4, 13.5]] as const) {
    const lamp = streetLamp();
    lamp.position.set(lx, -0.2, lz);
    scene.add(lamp);
  }

  // Planters with flowers.
  for (const [px, pz, ry] of [[-3.4, 6.0, 0.3], [3.4, 6.0, -0.2], [-12, 8.6, 0.5], [12, 8.6, -0.4], [-9, 12.5, 0.1], [9, 12.5, 0.2]] as const) {
    const pl = flowerPlanter();
    pl.position.set(px, -0.2, pz); pl.rotation.y = ry;
    scene.add(pl);
  }

  // Benches facing the cafe.
  for (const [bx, bz] of [[-5.5, 12.8], [5.5, 12.8]] as const) {
    const b = bench();
    b.position.set(bx, -0.2, bz); b.rotation.y = Math.PI;
    scene.add(b);
  }

  // Neighboring town buildings around the square.
  const towns: [number, number, number, number, number, number][] = [
    // x, z, w, h, color, awningTint
    [-21, 3, 10, 9, 0xf3e2c2, 0xc96058],
    [21, 1, 12, 11, 0xe0a080, 0x3d7dd9],
    [-16, -13, 9, 8, 0xa8c69a, 0xe8a13d],
    [16, -13, 11, 10, 0x9ab8d0, 0xc96058],
    [0, -20, 14, 12, 0xf0d9a0, 0x4fae5a],
    [-25, -7, 8, 7, 0xe8b8a8, 0x9b59d0],
    [25, -9, 9, 8, 0xa8d0c0, 0xe8a13d],
  ];
  for (const [tx, tz, w, h, col] of towns) {
    const b = townBuilding(w, h, col);
    b.position.set(tx, -0.2, tz);
    b.rotation.y = Math.atan2(tx, tz); // face the square
    scene.add(b);
  }

  // The hotel's own proper facade above the dollhouse opening.
  scene.add(buildHotelFacade());
}

export function setupLights(scene: THREE.Scene) {
  const hemi = new THREE.HemisphereLight(0xffe8c8, 0x7a5a3a, 1.18);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.8);
  sun.position.set(-6, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
  sun.shadow.camera.far = 34;
  sun.shadow.bias = -0.002;
  scene.add(sun);
  // Warm interior fill.
  const fill = new THREE.PointLight(0xffb46a, 16, 17, 1.6);
  fill.position.set(0, 2.8, 1.5);
  scene.add(fill);
  // Extra warm glow over the dining area.
  const dine = new THREE.PointLight(0xffc98a, 10, 13, 1.7);
  dine.position.set(0, 2.6, 2.2);
  scene.add(dine);
}

// ---------- camera: same ANGLE always, distance adapts to aspect ----------
// The diorama angle is locked (user-approved). Pan + zoom move the same rig.
const CAM_LOOK = new THREE.Vector3(0, 0, -0.9);
const CAM_DIR = new THREE.Vector3(0, 12.6, 14.7).normalize(); // fixed diorama angle
const BASE_DIST = new THREE.Vector3(0, 12.6, 14.7).length();
const FIT_HALF_W = 8.9; // room (14 wide) + margin, in world units at lookAt depth

export interface CamRig { panX: number; panZ: number; zoom: number }
export const camRig: CamRig = { panX: 0, panZ: 0, zoom: 1 };
const PAN_LIMIT_X = 7, PAN_LIMIT_Z = 5;
const ZOOM_MIN = 0.62, ZOOM_MAX = 1.75;

/** Pan the camera target on the ground plane (world units). Clamped so the building never leaves view. */
export function panCamera(dx: number, dz: number) {
  camRig.panX = Math.max(-PAN_LIMIT_X, Math.min(PAN_LIMIT_X, camRig.panX + dx));
  camRig.panZ = Math.max(-PAN_LIMIT_Z, Math.min(PAN_LIMIT_Z, camRig.panZ + dz));
}
/** Multiply zoom, clamped. */
export function zoomCamera(f: number) {
  camRig.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camRig.zoom * f));
}
export function resetCameraView() { camRig.panX = 0; camRig.panZ = 0; camRig.zoom = 1; }

export function setupCamera(aspect: number, scene?: THREE.Scene): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.1, 220);
  frameCamera(cam, scene ?? null, aspect);
  return cam;
}

/** Refit the fixed-angle camera so the room fills the screen on any aspect. Applies pan + zoom. */
export function frameCamera(cam: THREE.PerspectiveCamera, scene: THREE.Scene | null, aspect: number) {
  cam.aspect = aspect;
  const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * aspect;
  let d = BASE_DIST;
  if (halfW * d < FIT_HALF_W) d = FIT_HALF_W / halfW; // zoom out (portrait) — angle unchanged
  d *= camRig.zoom;
  const look = new THREE.Vector3(CAM_LOOK.x + camRig.panX, CAM_LOOK.y, CAM_LOOK.z + camRig.panZ);
  cam.position.copy(look).addScaledVector(CAM_DIR, d);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
  if (scene && scene.fog instanceof THREE.Fog) {
    const k = d / BASE_DIST;
    scene.fog.near = 26 * k;
    scene.fog.far = 52 * k;
  }
}

// ---------- ambient life: sway, butterflies, clouds, steam, reactions ----------
// Cheap procedural animation. All lists are module-level; clearAmbient() resets
// them when a new scene is built (title attract -> game).

interface SwayItem { o: THREE.Object3D; amp: number; speed: number; ph: number; axis: 'x' | 'z' }
const swayList: SwayItem[] = [];
export function registerSway(o: THREE.Object3D, amp: number, speed: number, axis: 'x' | 'z' = 'z') {
  swayList.push({ o, amp, speed, ph: Math.random() * 10, axis });
}
interface FlickerItem { bulb: THREE.Mesh; base: number; ph: number }
const flickerList: FlickerItem[] = [];
export function registerFlicker(bulb: THREE.Mesh, base = 1.8) {
  flickerList.push({ bulb, base, ph: Math.random() * 10 });
}

interface Butterfly { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; cx: number; cz: number; ph: number; col: number }
const butterflies: Butterfly[] = [];
interface Cloud { g: THREE.Group; speed: number }
const clouds: Cloud[] = [];

function softCircleTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
}
function heartTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (ctx) => {
    ctx.fillStyle = '#f06080';
    ctx.beginPath();
    ctx.moveTo(32, 54);
    ctx.bezierCurveTo(4, 32, 8, 10, 24, 10);
    ctx.bezierCurveTo(29, 10, 32, 15, 32, 18);
    ctx.bezierCurveTo(32, 15, 35, 10, 40, 10);
    ctx.bezierCurveTo(56, 10, 60, 32, 32, 54);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(22, 22, 6, 0, 7); ctx.fill();
  });
}
function stormTexture(): THREE.CanvasTexture {
  return canvasTex(96, 96, (ctx) => {
    ctx.fillStyle = '#4a4a5e';
    for (const [x, y, r] of [[34, 34, 20], [54, 28, 24], [68, 40, 17], [46, 44, 20]] as const) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#e8c93d';
    ctx.beginPath();
    ctx.moveTo(52, 52); ctx.lineTo(40, 78); ctx.lineTo(50, 78); ctx.lineTo(42, 94);
    ctx.lineTo(60, 70); ctx.lineTo(50, 70); ctx.closePath(); ctx.fill();
  });
}

interface SteamP { s: THREE.Sprite; life: number; max: number }
const steamPool: SteamP[] = [];
let steamTex: THREE.CanvasTexture | null = null;
interface ReactFx { s: THREE.Sprite; life: number; max: number; kind: 'hearts' | 'angry'; baseY: number; ph: number }
const reactFx: ReactFx[] = [];
let heartTex: THREE.CanvasTexture | null = null;
let stormTex: THREE.CanvasTexture | null = null;

export function clearAmbient() {
  swayList.length = 0; flickerList.length = 0;
  butterflies.length = 0; clouds.length = 0;
  for (const p of steamPool) p.s.parent?.remove(p.s);
  steamPool.length = 0;
  for (const r of reactFx) r.s.parent?.remove(r.s);
  reactFx.length = 0;
}

export function initAmbientLife(scene: THREE.Scene) {
  clearAmbient();
  steamTex = steamTex ?? softCircleTexture();
  heartTex = heartTex ?? heartTexture();
  stormTex = stormTex ?? stormTexture();
  // steam pool (shared sprites)
  for (let i = 0; i < 22; i++) {
    const sm = new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(sm);
    s.scale.set(0.3, 0.3, 1);
    s.visible = false;
    scene.add(s);
    steamPool.push({ s, life: 99, max: 1 });
  }
  // butterflies over the plaza
  const bcols = [0xe88aa0, 0x9b59d0, 0xe8c93d];
  const spots: [number, number][] = [[-6, 10], [7, 8], [0, 13]];
  spots.forEach(([cx, cz], i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.09, 4, 6), mat(0x3d3428));
    body.rotation.x = Math.PI / 2; g.add(body);
    const wmat = new THREE.MeshBasicMaterial({ color: bcols[i], side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const wlGeo = new THREE.PlaneGeometry(0.16, 0.12); wlGeo.translate(-0.08, 0, 0); // pivot at body
    const wrGeo = new THREE.PlaneGeometry(0.16, 0.12); wrGeo.translate(0.08, 0, 0);
    const wl = new THREE.Mesh(wlGeo, wmat);
    const wr = new THREE.Mesh(wrGeo, wmat);
    g.add(wl, wr);
    g.position.set(cx, 1.6, cz);
    scene.add(g);
    butterflies.push({ g, wl, wr, cx, cz, ph: i * 2.1, col: bcols[i] });
  });
  // drifting clouds
  const cmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, fog: false });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const n = 3 + (i % 2);
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(2.2 + (j % 3), 10, 8), cmat);
      b.position.set(j * 2.6 - n, (j % 2) * 0.9, (j % 3) * 0.8);
      b.scale.y = 0.55;
      g.add(b);
    }
    g.position.set(-50 + i * 28, 24 + (i % 3) * 3, -18 - (i % 2) * 12);
    scene.add(g);
    clouds.push({ g, speed: 0.35 + (i % 3) * 0.15 });
  }
}

/** Puff of steam at a world position (stoves, hot dishes). */
export function emitSteam(x: number, y: number, z: number) {
  const p = steamPool.find((q) => q.life >= q.max);
  if (!p) return;
  p.life = 0; p.max = 0.9 + Math.random() * 0.5;
  p.s.visible = true;
  p.s.position.set(x + (Math.random() - 0.5) * 0.15, y, z + (Math.random() - 0.5) * 0.15);
}

/** Floating reaction: hearts (happy) or storm cloud (angry) above a character. */
export function spawnReaction(scene: THREE.Scene, kind: 'hearts' | 'angry', x: number, y: number, z: number) {
  if (!heartTex || !stormTex) return;
  const n = kind === 'hearts' ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const sm = new THREE.SpriteMaterial({
      map: kind === 'hearts' ? heartTex : stormTex, transparent: true, depthTest: false,
    });
    const s = new THREE.Sprite(sm);
    const sc = kind === 'hearts' ? 0.28 : 0.7;
    s.scale.set(sc, sc, 1);
    s.position.set(x + (Math.random() - 0.5) * 0.5, y + (kind === 'angry' ? 0.35 : 0), z);
    s.renderOrder = 60;
    scene.add(s);
    reactFx.push({ s, life: -i * 0.14, max: kind === 'hearts' ? 1.3 : 1.6, kind, baseY: s.position.y, ph: Math.random() * 6 });
  }
}

/** Gold ring marker for VIP guests. */
export function makeVipRing(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8a13d, emissive: 0xa86a10, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.35 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07),
      new THREE.MeshStandardMaterial({ color: 0xd94f3d, emissive: 0x7a1e10, emissiveIntensity: 0.5, roughness: 0.3 }));
    gem.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    g.add(gem);
  }
  return g;
}

export function updateAmbient(t: number, dt: number) {
  for (const s of swayList) {
    if (s.axis === 'z') s.o.rotation.z = Math.sin(t * s.speed + s.ph) * s.amp;
    else s.o.rotation.x = Math.sin(t * s.speed + s.ph) * s.amp;
  }
  for (const f of flickerList) {
    const m = f.bulb.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = f.base * (0.92 + 0.08 * Math.sin(t * 7 + f.ph) * Math.sin(t * 13 + f.ph));
  }
  for (const b of butterflies) {
    const px = b.cx + Math.sin(t * 0.32 + b.ph) * 3.2;
    const pz = b.cz + Math.cos(t * 0.24 + b.ph * 1.7) * 2.8;
    const py = 1.7 + Math.sin(t * 0.8 + b.ph) * 0.45;
    const dx = px - b.g.position.x, dz = pz - b.g.position.z;
    b.g.position.set(px, py, pz);
    if (Math.hypot(dx, dz) > 0.001) b.g.rotation.y = Math.atan2(dx, dz);
    const flap = Math.sin(t * 18 + b.ph) * 0.9;
    b.wl.rotation.y = flap; b.wr.rotation.y = -flap;
  }
  for (const c of clouds) {
    c.g.position.x += c.speed * dt;
    if (c.g.position.x > 60) c.g.position.x = -60;
  }
  for (const p of steamPool) {
    if (p.life >= p.max) { p.s.visible = false; continue; }
    p.life += dt;
    const f = p.life / p.max;
    p.s.position.y += dt * 0.75;
    p.s.position.x += Math.sin(t * 3 + p.life * 8) * dt * 0.2;
    const sc = 0.25 + f * 0.55;
    p.s.scale.set(sc, sc, 1);
    (p.s.material as THREE.SpriteMaterial).opacity = 0.5 * (1 - f);
  }
  for (let i = reactFx.length - 1; i >= 0; i--) {
    const r = reactFx[i];
    r.life += dt;
    if (r.life < 0) { r.s.visible = false; continue; }
    r.s.visible = true;
    const f = r.life / r.max;
    if (f >= 1) { r.s.parent?.remove(r.s); reactFx.splice(i, 1); continue; }
    if (r.kind === 'hearts') {
      r.s.position.y = r.baseY + f * 0.9;
      (r.s.material as THREE.SpriteMaterial).opacity = 1 - f;
    } else {
      r.s.position.x += Math.sin(t * 22 + r.ph) * dt * 0.35; // angry shake
      (r.s.material as THREE.SpriteMaterial).opacity = f < 0.15 ? f / 0.15 : 1 - Math.max(0, (f - 0.6) / 0.4);
    }
  }
}

// ---------- furniture placement helpers ----------
export interface Placed { obj: THREE.Object3D; obstacle: { x: number; z: number; r: number } | null }

export async function placeGLB(name: string, targetH: number, x: number, z: number, rotY = 0): Promise<Placed> {
  const g = await loadModel(name);
  normalizeModel(g, targetH);
  g.position.x += x; g.position.z += z;
  g.rotation.y = rotY;
  return { obj: g, obstacle: null };
}
