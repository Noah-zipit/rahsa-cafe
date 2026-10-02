import { CharCustom, START_COINS, START_REP } from '../game/data';

export interface SaveData {
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
}

const KEY = 'rahsa-cafe-save-v1';

export function defaultSave(): SaveData {
  return {
    coins: START_COINS, rep: START_REP, day: 1,
    tables: 2, stations: 1, stoveLevel: 1,
    recipes: ['curry', 'noodles', 'tea'],
    rooms: 0, decor: 0,
    char: { skin: 0xf6c99b, hairStyle: 0, hairColor: 0x2b1d16, shirt: 0xd94f3d },
    servedTotal: 0,
  };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.coins !== 'number') return null;
    return { ...defaultSave(), ...d };
  } catch { return null; }
}

export function saveSave(d: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
