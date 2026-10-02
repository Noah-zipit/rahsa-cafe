export interface Recipe {
  id: string;
  name: string;
  price: number; // base coins
  icon: string; // texture key
  cost: number; // shop unlock price, 0 = starter
  desc: string;
  time: number; // cook time, seconds
  needs: string[]; // ingredient ids consumed per cook
}

export interface Ingredient {
  id: string;
  name: string;
  emoji: string;
  price: number; // market price per unit
}

export const INGREDIENTS: Ingredient[] = [
  { id: 'tomato', name: 'Tomato',    emoji: '🍅', price: 3 },
  { id: 'cheese', name: 'Cheese',    emoji: '🧀', price: 4 },
  { id: 'flour',  name: 'Flour',     emoji: '🌾', price: 3 },
  { id: 'rice',   name: 'Rice',      emoji: '🍚', price: 3 },
  { id: 'herbs',  name: 'Herbs',     emoji: '🌿', price: 2 },
  { id: 'meat',   name: 'Meat',      emoji: '🥩', price: 6 },
  { id: 'fish',   name: 'Fish',      emoji: '🐟', price: 6 },
  { id: 'potato', name: 'Potato',    emoji: '🥔', price: 3 },
  { id: 'egg',    name: 'Egg',       emoji: '🥚', price: 2 },
  { id: 'choco',  name: 'Chocolate', emoji: '🍫', price: 5 },
];
export const ING_MAP: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
export const PANTRY_START = 4; // units of each ingredient on a fresh save

export const RECIPES: Recipe[] = [
  { id: 'curry',   name: 'Curry Rice',   price: 12, icon: 'food_0', cost: 0,  desc: 'House special. Warm and hearty.', time: 8,  needs: ['rice', 'herbs', 'meat'] },
  { id: 'noodles', name: 'Noodle Bowl',  price: 10, icon: 'food_1', cost: 0,  desc: 'Slurpy comfort in a bowl.', time: 7,  needs: ['flour', 'egg', 'herbs'] },
  { id: 'tea',     name: 'Masala Tea',   price: 6,  icon: 'food_7', cost: 0,  desc: 'Spiced, steaming, perfect.', time: 5,  needs: ['herbs'] },
  { id: 'soup',    name: 'Tomato Soup',  price: 9,  icon: 'food_5', cost: 45, desc: 'Slow-simmered classic.', time: 9,  needs: ['tomato', 'potato'] },
  { id: 'salad',   name: 'Garden Salad', price: 11, icon: 'food_4', cost: 50, desc: 'Crisp and fresh.', time: 6,  needs: ['tomato', 'herbs', 'egg'] },
  { id: 'burger',  name: 'Cafe Burger',  price: 16, icon: 'food_2', cost: 60, desc: 'Juicy, stacked high.', time: 10, needs: ['meat', 'cheese', 'flour'] },
  { id: 'cake',    name: 'Choco Cake',   price: 14, icon: 'food_6', cost: 70, desc: 'A sweet finish.', time: 12, needs: ['flour', 'egg', 'choco'] },
  { id: 'pizza',   name: 'Woodfire Pizza', price: 18, icon: 'food_3', cost: 80, desc: 'Blistered and bubbly.', time: 14, needs: ['flour', 'cheese', 'tomato'] },
  { id: 'fishcurry', name: 'Fish Curry', price: 20, icon: 'food_8', cost: 0,  desc: 'Coastal heat, coconut warmth.', time: 12, needs: ['fish', 'rice', 'herbs'] },
  { id: 'omelette',  name: 'Cheese Omelette', price: 13, icon: 'food_9', cost: 0,  desc: 'Fluffy, golden, melty.', time: 7,  needs: ['egg', 'cheese', 'herbs'] },
  { id: 'meatpie',   name: 'Meat Pie',   price: 19, icon: 'food_10', cost: 90, desc: 'Flaky lattice, rich filling.', time: 13, needs: ['flour', 'meat', 'potato'] },
  { id: 'fishchips', name: 'Fish & Chips', price: 17, icon: 'food_11', cost: 85, desc: 'Crispy catch, golden chips.', time: 11, needs: ['fish', 'potato'] },
];

// ---------- expansion: VIPs, rush hours, food critic ----------
export const VIP_CHANCE = 0.12;          // per spawn, once day >= 2 and rep >= 55
export const VIP_MIN_PRICE = 13;         // VIPs only order dishes this pricey or more
export const VIP_TIP_MULT = 1.5;         // pay multiplier for VIPs
export const VIP_PATIENCE_MULT = 0.7;    // VIPs are impatient
export const RUSH_TIMES = [55, 125];     // dayT seconds: lunch + dinner rush
export const RUSH_DURATION = 45;
export const RUSH_SPAWN_DIV = 2;         // spawn interval halved during rush
export const RUSH_TIP_MULT = 1.2;
export const CRITIC_WINDOW: [number, number] = [50, 110]; // dayT window for the critic visit
export const CRITIC_REP_WIN = 8;
export const CRITIC_REP_LOSE = -8;

// Market stall position in the city square (front-left of the cafe).
export const MARKET_POS = { x: -8.2, z: 7.6 };
export const MARKET_INTERACT_R = 2.2;

export type Quality = 'perfect' | 'good' | 'burnt';
export const QUALITY_MULT: Record<Quality, number> = { perfect: 1.5, good: 1.0, burnt: 0.6 };
export const QUALITY_COLOR: Record<Quality, number> = { perfect: 0xffd94d, good: 0x9fe870, burnt: 0x8a5a3b };
export const RECIPE_MAP: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export interface CharCustom {
  skin: number;      // tint color
  hairStyle: number; // 0-3
  hairColor: number; // tint color
  shirt: number;     // tint color
}

export const SKIN_TONES = [0xf6c99b, 0xe8a96f, 0xc07f45, 0x7d4b26];
export const HAIR_STYLES = [0, 1, 2, 3];
export const HAIR_COLORS = [0x2b1d16, 0x6b4423, 0xd9a441, 0xa83232, 0x3f7d6b];
export const SHIRT_COLORS = [0xd94f3d, 0x3d7dd9, 0x4fae5a, 0x9b59d0, 0xe08a2d, 0x3fbdb2];

export const DAY_LENGTH = 180; // seconds per day
export const START_COINS = 60;
export const START_REP = 50;

export interface ShopDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  maxed: (s: ShopState) => boolean;
  price: (s: ShopState) => number;
  label: (s: ShopState) => string;
}

export interface ShopState {
  tables: number;
  stations: number;
  stoveLevel: number; // 1..3
  recipes: string[];
  rooms: number;
  decor: number;
}
// Alias used by the UI/sim layers.
export type ShopItem = ShopDef;

// 3D world layout (meters). x: -7..7, z: -5 (back/kitchen) .. +5 (front/door).
export const TABLE_SPOTS = [
  { x: -3.4, z: -0.6 }, { x: 3.4, z: -0.6 },
  { x: -3.4, z: 2.4 }, { x: 3.4, z: 2.4 },
  { x: 0, z: -0.6 }, { x: 0, z: 2.4 },
];
export const MAX_TABLES = 6;
export const MAX_STATIONS = 2;
export const MAX_STOVE = 3;
export const MAX_ROOMS = 3;
export const MAX_DECOR = 5;
export const DECOR_SPOTS = [
  { x: -6.2, z: -4.0 }, { x: 6.2, z: -4.0 },
  { x: -6.2, z: 3.6 }, { x: 6.2, z: 3.6 },
  { x: 0, z: -4.4 },
];
export const STOVE_SPOTS = [{ x: -4.6, z: -3.9 }, { x: -2.8, z: -3.9 }];
export const COUNTER_POS = { x: 4.8, z: -2.2 }; // serving counter (dish pickup)
export const KITCHEN_POS = {
  sink: { x: 0.6, z: -4.0 },
  cabinet: { x: 2.4, z: -4.15 },
  fridge: { x: 4.4, z: -4.0 },
  drawer: { x: -0.8, z: -4.15 },
};
export const ROOM_SPOTS = [{ x: 5.55, z: 2.2 }, { x: 5.55, z: 3.3 }, { x: 5.55, z: 4.35 }];
export const ROOM_NIGHTLY = 25;
export const DOOR_POS = { x: 0, z: 5.4 };
export const GUEST_SPAWN = { x: 6, z: 12 };
export const PLAYER_START = { x: 0, z: 3.4 };
// Plaza bounds: the player can walk out the front into the city square (market!).
export const FLOOR_BOUNDS = { x0: -10, x1: 10, z0: -4.6, z1: 10 };

export const SHOP_ITEMS: ShopDef[] = [
  {
    id: 'table', name: 'Dining Table', desc: 'Seat one more guest at a time.', icon: 'furn_table_round',
    maxed: s => s.tables >= MAX_TABLES,
    price: s => 80 + (s.tables - 2) * 60,
    label: s => `${s.tables}/${MAX_TABLES} tables`,
  },
  {
    id: 'station', name: 'Cooking Station', desc: 'A second stove. Cook two dishes back to back.', icon: 'furn_stove',
    maxed: s => s.stations >= MAX_STATIONS,
    price: () => 150,
    label: s => `${s.stations}/${MAX_STATIONS} stations`,
  },
  {
    id: 'stove', name: 'Stove Upgrade', desc: 'Steadier heat: the cooking minigame gets easier.', icon: 'furn_stove',
    maxed: s => s.stoveLevel >= MAX_STOVE,
    price: s => 90 + s.stoveLevel * 60,
    label: s => `Level ${s.stoveLevel}/${MAX_STOVE}`,
  },
  {
    id: 'room', name: 'Guest Room', desc: `Rentable room upstairs. Earns ${ROOM_NIGHTLY} coins every night.`, icon: 'tile_door',
    maxed: s => s.rooms >= MAX_ROOMS,
    price: s => 200 + s.rooms * 100,
    label: s => `${s.rooms}/${MAX_ROOMS} rooms`,
  },
  {
    id: 'decor', name: 'Cozy Decor', desc: 'Plants and shelves. Guests love it: +4 reputation.', icon: 'furn_plant',
    maxed: s => s.decor >= MAX_DECOR,
    price: s => 40 + s.decor * 30,
    label: s => `${s.decor}/${MAX_DECOR} placed`,
  },
  ...RECIPES.filter(r => r.cost > 0).map(r => ({
    id: 'recipe_' + r.id, name: r.name + ' Recipe', desc: r.desc + ` Sells for ${r.price} coins.`, icon: r.icon,
    maxed: s => s.recipes.includes(r.id),
    price: () => r.cost,
    label: () => 'New dish',
  } as ShopDef)),
];
