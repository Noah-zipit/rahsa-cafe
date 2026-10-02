import { CharCustom, START_COINS, START_REP, INGREDIENTS, PANTRY_START } from '../game/data';

export interface SaveData {
  version: 2;
  coins: number;
  rep: number;
  day: number;
  tables: number;
  stations: number;
  stoveLevel: number;
  recipes: string[];
  rooms: number;
  decor: number;
  char: CharCustom;
  servedTotal: number;
  pantry: Record<string, number>; // ingredient id -> units
}

const KEY_V2 = 'rahsa-cafe-save-v2';
const KEY_V1 = 'rahsa-cafe-save-v1'; // legacy (pre-market) save

export function defaultPantry(): Record<string, number> {
  const p: Record<string, number> = {};
  for (const i of INGREDIENTS) p[i.id] = PANTRY_START;
  return p;
}

export function defaultSave(): SaveData {
  return {
    version: 2,
    coins: START_COINS, rep: START_REP, day: 1,
    tables: 2, stations: 1, stoveLevel: 1,
    recipes: ['curry', 'noodles', 'tea', 'fishcurry', 'omelette'],
    rooms: 0, decor: 0,
    char: { skin: 0xf6c99b, hairStyle: 0, hairColor: 0x2b1d16, shirt: 0xd94f3d },
    servedTotal: 0,
    pantry: defaultPantry(),
  };
}

export function loadSave(): SaveData | null {
  try {
    // Current format.
    const raw2 = localStorage.getItem(KEY_V2);
    if (raw2) {
      const d = JSON.parse(raw2);
      if (typeof d.coins !== 'number') return null;
      return { ...defaultSave(), ...d, version: 2 as const, pantry: { ...defaultPantry(), ...(d.pantry ?? {}) } };
    }
    // Migrate a v1 save (pre-market): keep progress, grant a starter pantry.
    // Old v1 saves must never crash the new build — migrate, don't drop.
    const raw1 = localStorage.getItem(KEY_V1);
    if (raw1) {
      const d = JSON.parse(raw1);
      if (typeof d.coins !== 'number') return null;
      const migrated: SaveData = {
        ...defaultSave(), ...d,
        version: 2 as const,
        recipes: Array.isArray(d.recipes) && d.recipes.length ? d.recipes : defaultSave().recipes,
        pantry: defaultPantry(),
      };
      // New free recipes are granted on migration so old players aren't behind.
      for (const id of ['fishcurry', 'omelette']) {
        if (!migrated.recipes.includes(id)) migrated.recipes.push(id);
      }
      saveSave(migrated);
      try { localStorage.removeItem(KEY_V1); } catch { /* ignore */ }
      return migrated;
    }
    return null;
  } catch { return null; }
}

export function saveSave(d: SaveData) {
  try { localStorage.setItem(KEY_V2, JSON.stringify(d)); } catch { /* ignore */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY_V2); localStorage.removeItem(KEY_V1); } catch { /* ignore */ }
}
