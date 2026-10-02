import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharCustom, Recipe } from './data';

// ---------- palette ----------
export const PAL = {
  wood: 0xb9834f, woodDark: 0x8a5f36, woodTrim: 0x6b4423,
  wall: 0xf0dfc0, cream: 0xfff3dd,
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

// ---------- procedural low-poly character ----------
export interface CharParts {
  group: THREE.Group;
  legL: THREE.Mesh; legR: THREE.Mesh;
  armL: THREE.Group; armR: THREE.Group;
  body: THREE.Group;
  hairMeshes: THREE.Object3D[];
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
  const cap = sph(0.25, color); cap.scale.set(1, 0.72, 1); cap.position.y = 0.06;
  parts.push(cap);
  if (style === 1) { // long
    const back = box(0.34, 0.42, 0.14, color, 0, -0.14, -0.2); parts.push(back);
  } else if (style === 2) { // curly
    for (const [x, y, z] of [[-0.16, 0.2, 0], [0.16, 0.2, 0], [0, 0.24, -0.12], [-0.1, 0.2, 0.14], [0.1, 0.2, 0.14]] as const) {
      const c = sph(0.1, color); c.position.set(x, y, z); parts.push(c);
    }
  } else if (style === 3) { // ponytail
    const tail = cyl(0.07, 0.05, 0.34, color, 8); tail.position.set(0, -0.05, -0.26); tail.rotation.x = 0.5; parts.push(tail);
  }
  return parts;
}

export function makeCharacter(c: CharCustom): CharParts {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Legs.
  const legGeo = new THREE.CylinderGeometry(0.085, 0.095, 0.3, 8);
  const legL = new THREE.Mesh(legGeo, mat(0x5a4632)); legL.position.set(-0.11, 0.15, 0);
  const legR = new THREE.Mesh(legGeo, mat(0x5a4632)); legR.position.set(0.11, 0.15, 0);
  legL.castShadow = legR.castShadow = true;
  // Body (shirt).
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.3, 6, 10), mat(c.shirt));
  torso.position.y = 0.62; torso.castShadow = true;
  // Arms (pivot at shoulder).
  const armL = new THREE.Group(); armL.position.set(-0.3, 0.78, 0);
  const armR = new THREE.Group(); armR.position.set(0.3, 0.78, 0);
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.22, 4, 8);
  const aL = new THREE.Mesh(armGeo, mat(c.shirt)); aL.position.y = -0.16; aL.castShadow = true;
  const aR = new THREE.Mesh(armGeo, mat(c.shirt)); aR.position.y = -0.16; aR.castShadow = true;
  const hL = sph(0.07, c.skin); hL.position.y = -0.34;
  const hR = sph(0.07, c.skin); hR.position.y = -0.34;
  armL.add(aL, hL); armR.add(aR, hR);
  // Head.
  const head = sph(0.24, c.skin, 12, 10); head.position.y = 1.08;
  // Eyes.
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const eyeMat = mat(0x2b1d16, { roughness: 0.4 });
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.09, 1.12, 0.2);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.09, 1.12, 0.2);
  // Hair.
  const hairAnchor = new THREE.Group(); hairAnchor.position.y = 1.08;
  let hairMeshes = buildHair(c.hairStyle, c.hairColor);
  hairMeshes.forEach((m) => hairAnchor.add(m));

  body.add(legL, legR, torso, armL, armR, head, eL, eR, hairAnchor);
  group.userData.height = 1.32;

  const parts: CharParts = {
    group, legL, legR, armL, armR, body, hairMeshes,
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
      if (moving) {
        const s = Math.sin(t * 11);
        legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7;
        armL.rotation.x = -s * 0.55; armR.rotation.x = s * 0.55;
        body.position.y = Math.abs(Math.cos(t * 11)) * 0.05;
        body.rotation.x = 0.06;
      } else {
        legL.rotation.x *= 0.8; legR.rotation.x *= 0.8;
        armL.rotation.x *= 0.8; armR.rotation.x *= 0.8;
        body.position.y *= 0.8; body.rotation.x *= 0.8;
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

export function woodFloorTexture(): THREE.CanvasTexture {
  return canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = '#a5713f'; ctx.fillRect(0, 0, 512, 512);
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = r * 64;
      ctx.fillStyle = r % 2 ? '#9c6839' : '#ab7743';
      ctx.fillRect(0, y, 512, 64);
      ctx.fillStyle = 'rgba(60,35,15,0.55)'; ctx.fillRect(0, y, 512, 3);
      // plank seams
      const off = (r * 197) % 512;
      ctx.fillRect(off, y, 3, 64); ctx.fillRect((off + 256) % 512, y, 3, 64);
      // grain
      ctx.strokeStyle = 'rgba(70,40,18,0.25)'; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const gy = y + 10 + i * 11;
        ctx.beginPath(); ctx.moveTo(0, gy);
        ctx.bezierCurveTo(150, gy + 4, 350, gy - 4, 512, gy + 2); ctx.stroke();
      }
    }
  });
}

// Dish icon drawn into the order bubble (simple, readable).
export function drawDishIcon(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number) {
  ctx.save(); ctx.translate(cx, cy);
  const u = s / 64;
  if (id === 'burger') {
    ctx.fillStyle = '#e8b96a'; ctx.beginPath(); ctx.arc(0, -8 * u, 22 * u, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#4fae5a'; ctx.fillRect(-22 * u, -8 * u, 44 * u, 7 * u);
    ctx.fillStyle = '#8a5a3b'; ctx.fillRect(-22 * u, -1 * u, 44 * u, 9 * u);
    ctx.fillStyle = '#e8b96a'; ctx.beginPath(); ctx.arc(0, 8 * u, 22 * u, 0, Math.PI); ctx.fill();
  } else if (id === 'pizza') {
    ctx.fillStyle = '#e8b96a'; ctx.beginPath(); ctx.moveTo(-20 * u, -16 * u); ctx.lineTo(20 * u, -16 * u); ctx.lineTo(0, 20 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d94f3d';
    for (const [x, y] of [[-8, -8], [8, -6], [0, 4]] as const) { ctx.beginPath(); ctx.arc(x * u, y * u, 4.5 * u, 0, 7); ctx.fill(); }
  } else if (id === 'tea') {
    ctx.fillStyle = '#f3e6d0'; ctx.fillRect(-14 * u, -14 * u, 28 * u, 30 * u);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-11 * u, -11 * u, 22 * u, 8 * u);
    ctx.strokeStyle = '#f3e6d0'; ctx.lineWidth = 5 * u;
    ctx.beginPath(); ctx.arc(16 * u, 2 * u, 8 * u, -1.2, 1.2); ctx.stroke();
  } else if (id === 'cake') {
    ctx.fillStyle = '#6b4423'; ctx.fillRect(-18 * u, -6 * u, 36 * u, 22 * u);
    ctx.fillStyle = '#e88aa0'; ctx.fillRect(-18 * u, -14 * u, 36 * u, 10 * u);
    ctx.fillStyle = '#d94f3d'; ctx.beginPath(); ctx.arc(0, -18 * u, 6 * u, 0, 7); ctx.fill();
  } else if (id === 'salad') {
    ctx.fillStyle = '#9fc6e8'; ctx.beginPath(); ctx.arc(0, 4 * u, 20 * u, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#4fae5a';
    for (const [x, y] of [[-8, -6], [6, -8], [0, -2]] as const) { ctx.beginPath(); ctx.arc(x * u, y * u, 8 * u, 0, 7); ctx.fill(); }
  } else { // bowls: curry / noodles / soup
    const soupCol = id === 'curry' ? '#e08a2d' : id === 'noodles' ? '#e8c93d' : '#d94f3d';
    ctx.fillStyle = '#f3e6d0'; ctx.beginPath(); ctx.arc(0, 2 * u, 22 * u, 0, Math.PI); ctx.fill();
    ctx.fillStyle = soupCol; ctx.beginPath(); ctx.arc(0, -2 * u, 17 * u, Math.PI, 0); ctx.fill();
    if (id === 'curry') { ctx.fillStyle = '#fff7e8'; ctx.beginPath(); ctx.arc(-6 * u, -6 * u, 7 * u, 0, 7); ctx.fill(); }
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
  return canvasTex(128, 150, (ctx) => {
    // white bubble
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 5;
    ctx.beginPath();
    const r = 18;
    ctx.roundRect(4, 4, 120, 108, r); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(48, 112); ctx.lineTo(80, 112); ctx.lineTo(64, 140); ctx.closePath();
    ctx.fill(); ctx.stroke();
    drawDishIcon(ctx, recipe.id, 64, 58, 76);
  });
}

export function makeBubble(recipe: Recipe): { sprite: THREE.Sprite; bar: THREE.Mesh; group: THREE.Group } {
  const group = new THREE.Group();
  const tex = bubbleTexture(recipe);
  const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(sm);
  sprite.scale.set(1.05, 1.23, 1);
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

// ---------- room ----------
export function buildRoom(scene: THREE.Scene) {
  const g = new THREE.Group();
  // Floor 14 x 10.
  const floorTex = woodFloorTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3.5, 2.5);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.2, 10.6),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
  );
  floor.position.y = -0.1; floor.receiveShadow = true;
  g.add(floor);

  // Back wall + side walls (dollhouse: front open).
  const wallMat = mat(PAL.wall);
  const back = box(14, 3.4, 0.3, PAL.wall, 0, 1.7, -5.15); back.material = wallMat;
  const left = box(0.3, 3.4, 10.6, PAL.wall, -7.05, 1.7, 0); left.material = wallMat;
  const right = box(0.3, 3.4, 10.6, PAL.wall, 7.05, 1.7, 0); right.material = wallMat;
  // Wainscot trim.
  const trimB = box(14, 0.5, 0.34, PAL.woodDark, 0, 0.25, -5.15);
  const trimL = box(0.34, 0.5, 10.6, PAL.woodDark, -7.05, 0.25, 0);
  const trimR = box(0.34, 0.5, 10.6, PAL.woodDark, 7.05, 0.25, 0);
  // Top beam.
  const beam = box(14.4, 0.35, 0.5, PAL.woodTrim, 0, 3.35, -5.1);
  g.add(back, left, right, trimB, trimL, trimR, beam);

  // Rug near door.
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.03, 20), mat(PAL.rug));
  rug.position.set(0, 0.015, 4.2); rug.receiveShadow = true; g.add(rug);
  const rugIn = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.035, 20), mat(0xc96058));
  rugIn.position.set(0, 0.015, 4.2); rugIn.receiveShadow = true; g.add(rugIn);

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
  sign.position.set(0, 2.45, -4.95);
  g.add(sign);

  // Window on back wall (warm light feel).
  const win = new THREE.Group();
  const frame = box(1.7, 1.4, 0.1, PAL.woodTrim, 0, 0, 0);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffd98a, emissiveIntensity: 0.7, roughness: 0.4 }));
  glass.position.z = 0.06;
  const cross1 = box(1.4, 0.08, 0.12, PAL.woodTrim, 0, 0, 0.02);
  const cross2 = box(0.08, 1.1, 0.12, PAL.woodTrim, 0, 0, 0.02);
  win.add(frame, glass, cross1, cross2);
  win.position.set(-5.2, 1.9, -4.98);
  g.add(win);

  scene.add(g);
  return g;
}

export function setupLights(scene: THREE.Scene) {
  const hemi = new THREE.HemisphereLight(0xfff2dd, 0x8a6a4a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
  sun.position.set(-6, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.002;
  scene.add(sun);
  // Warm interior fill.
  const fill = new THREE.PointLight(0xffc98a, 12, 16, 1.6);
  fill.position.set(0, 2.8, 1.5);
  scene.add(fill);
}

export function setupCamera(aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
  cam.position.set(0, 12.6, 13.8);
  cam.lookAt(0, 0, -0.9);
  return cam;
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

export function roomDoor(): THREE.Group {
  const g = new THREE.Group();
  const frame = box(0.9, 1.9, 0.14, PAL.woodTrim, 0, 0.95, 0); g.add(frame);
  const door = box(0.72, 1.72, 0.16, PAL.wood, 0, 0.9, 0); g.add(door);
  const knob = sph(0.045, 0xd9a441, 8, 6); knob.position.set(0.24, 0.9, 0.1); g.add(knob);
  const plaque = box(0.4, 0.16, 0.18, 0x3d2412, 0, 1.62, 0); g.add(plaque);
  return g;
}
