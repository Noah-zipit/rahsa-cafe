import { Recipe, ShopItem, CharCustom, RECIPES, SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS, QUALITY_MULT } from './game/data';
import { SaveData } from './systems/save';
import { drawDishIcon, drawShopIcon } from './game/three';
import { HudState, SummaryData } from './game/sim';
import { sfx } from './systems/audio';

export function hex(h: number) { return '#' + h.toString(16).padStart(6, '0'); }

function el(tag: string, cls: string, html = '') {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function dishIconCanvas(id: string, size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  drawDishIcon(ctx, id, size / 2, size / 2, size * 0.9);
  return cv;
}

export function shopIconCanvas(itemId: string, size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  drawShopIcon(ctx, itemId, size / 2, size / 2, size * 0.9);
  return cv;
}

export class UI {
  root: HTMLElement;
  private panelLayer!: HTMLElement;
  private toastLayer!: HTMLElement;
  private hudEl: HTMLElement | null = null;
  private hudDay!: HTMLElement; private hudClock!: HTMLElement;
  private hudCoins!: HTMLElement; private hudRep!: HTMLElement;
  private clockLabel!: HTMLElement;
  private promptEl!: HTMLElement; private actionBtn!: HTMLButtonElement;
  private joyBase!: HTMLElement; private joyKnob!: HTMLElement;
  private joyVec = { x: 0, z: 0 };
  private joyActive = false;
  private titleEl: HTMLElement | null = null;
  private customEl: HTMLElement | null = null;

  onShop: () => void = () => {};
  onPause: () => void = () => {};
  onAction: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = '';
    this.panelLayer = el('div', 'panel-layer');
    this.toastLayer = el('div', 'toast-layer');
    this.root.append(this.panelLayer, this.toastLayer);
  }

  get joystick() { return this.joyVec; }

  // ---------------- title ----------------
  showTitle(hasSave: boolean, onNew: () => void, onContinue: () => void) {
    this.hideTitle();
    const t = el('div', 'title-screen');
    t.innerHTML = `
      <div class="title-card">
        <div class="title-emoji">☕</div>
        <h1>Rahsa Cafe</h1>
        <p class="tagline">A cozy 3D cafe &amp; inn</p>
        <div class="title-btns"></div>
        <p class="hint">WASD / joystick to walk · E / tap button to interact</p>
      </div>`;
    const btns = t.querySelector('.title-btns')!;
    const mk = (label: string, cb: () => void, primary = false) => {
      const b = el('button', 'btn' + (primary ? ' primary' : ''), label);
      b.onclick = () => { sfx.click(); cb(); };
      btns.appendChild(b);
    };
    if (hasSave) mk('Continue', onContinue, true);
    mk(hasSave ? 'New Game' : 'Start Cooking', onNew, !hasSave);
    this.root.appendChild(t);
    this.titleEl = t;
  }
  hideTitle() { this.titleEl?.remove(); this.titleEl = null; }

  // ---------------- customization ----------------
  showCustomize(char: CharCustom, onChange: (c: CharCustom) => void, onDone: () => void) {
    this.hideCustomize();
    const c = el('div', 'custom-screen');
    c.innerHTML = `<div class="custom-panel">
      <h2>Meet the Chef</h2>
      <div class="custom-rows"></div>
      <button class="btn primary big">Open the Cafe →</button>
    </div>`;
    const rows = c.querySelector('.custom-rows')!;
    const cur = { ...char };
    const swatchRow = (label: string, colors: number[], get: () => number, set: (v: number) => void) => {
      const row = el('div', 'custom-row');
      row.appendChild(el('div', 'custom-label', label));
      const sw = el('div', 'swatches');
      colors.forEach((col) => {
        const s = el('button', 'sw' + (get() === col ? ' sel' : ''));
        s.style.background = hex(col);
        s.onclick = () => { sfx.click(); set(col); onChange({ ...cur }); refresh(); };
        sw.appendChild(s);
      });
      row.appendChild(sw);
      return row;
    };
    const styleNames = ['Crop', 'Long', 'Curly', 'Ponytail'];
    const styleRow = el('div', 'custom-row');
    styleRow.appendChild(el('div', 'custom-label', 'Hair style'));
    const styleBtns = el('div', 'swatches');
    HAIR_STYLES.forEach((st, i) => {
      const b = el('button', 'sw wide' + (cur.hairStyle === st ? ' sel' : ''), styleNames[i] ?? `S${i}`);
      b.onclick = () => { sfx.click(); cur.hairStyle = st; onChange({ ...cur }); refresh(); };
      styleBtns.appendChild(b);
    });
    styleRow.appendChild(styleBtns);
    const refresh = () => { this.showCustomize(cur, onChange, onDone); };
    rows.append(
      swatchRow('Skin', SKIN_TONES, () => cur.skin, (v) => (cur.skin = v)),
      styleRow,
      swatchRow('Hair color', HAIR_COLORS, () => cur.hairColor, (v) => (cur.hairColor = v)),
      swatchRow('Shirt', SHIRT_COLORS, () => cur.shirt, (v) => (cur.shirt = v)),
    );
    (c.querySelector('.btn.primary') as HTMLButtonElement).onclick = () => { sfx.click(); onDone(); };
    this.root.appendChild(c);
    this.customEl = c;
  }
  hideCustomize() { this.customEl?.remove(); this.customEl = null; }

  // ---------------- HUD ----------------
  showHud() {
    if (this.hudEl) return;
    const h = el('div', 'hud');
    h.innerHTML = `
      <div class="hud-left">
        <div class="hud-day">Day 1</div>
        <div class="clockbar"><div class="clockfill"></div><div class="clocklabel">0:00</div></div>
      </div>
      <div class="hud-right">
        <div class="hud-coins">🪙 0</div>
        <div class="hud-rep">⭐ 0</div>
        <button class="btn small" data-a="shop">🛒 Shop</button>
        <button class="btn small" data-a="pause">⏸</button>
      </div>`;
    (h.querySelector('[data-a="shop"]') as HTMLButtonElement).onclick = () => { sfx.click(); this.onShop(); };
    (h.querySelector('[data-a="pause"]') as HTMLButtonElement).onclick = () => { sfx.click(); this.onPause(); };
    this.hudDay = h.querySelector('.hud-day')!;
    this.hudClock = h.querySelector('.clockfill')!;
    this.hudCoins = h.querySelector('.hud-coins')!;
    this.hudRep = h.querySelector('.hud-rep')!;
    const clockLabel = h.querySelector('.clocklabel') as HTMLElement;

    // prompt + action button
    this.promptEl = el('div', 'prompt hidden');
    this.actionBtn = el('button', 'action-btn hidden', 'Interact') as HTMLButtonElement;
    this.actionBtn.onclick = () => this.onAction();

    // joystick (touch)
    this.joyBase = el('div', 'joy hidden');
    this.joyKnob = el('div', 'joy-knob');
    this.joyBase.appendChild(this.joyKnob);
    this.bindJoystick();

    this.root.append(h, this.promptEl, this.actionBtn, this.joyBase);
    this.hudEl = h;
    this.clockLabel = clockLabel;
    if ('ontouchstart' in window) this.joyBase.classList.remove('hidden');
  }

  private bindJoystick() {
    let pid = -1;
    const setKnob = (dx: number, dz: number) => {
      const r = 52;
      const len = Math.hypot(dx, dz);
      const cl = len > r ? r / len : 1;
      this.joyKnob.style.transform = `translate(${dx * cl}px, ${dz * cl}px)`;
      this.joyVec.x = (dx * cl) / r;
      this.joyVec.z = (dz * cl) / r;
    };
    this.joyBase.addEventListener('pointerdown', (e) => {
      pid = e.pointerId;
      this.joyActive = true;
      this.joyBase.setPointerCapture(pid);
      const rc = this.joyBase.getBoundingClientRect();
      setKnob(e.clientX - (rc.left + rc.width / 2), e.clientY - (rc.top + rc.height / 2));
    });
    this.joyBase.addEventListener('pointermove', (e) => {
      if (!this.joyActive || e.pointerId !== pid) return;
      const rc = this.joyBase.getBoundingClientRect();
      setKnob(e.clientX - (rc.left + rc.width / 2), e.clientY - (rc.top + rc.height / 2));
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1; this.joyActive = false;
      this.joyVec.x = 0; this.joyVec.z = 0;
      this.joyKnob.style.transform = 'translate(0px,0px)';
    };
    this.joyBase.addEventListener('pointerup', end);
    this.joyBase.addEventListener('pointercancel', end);
  }

  setHud(s: HudState) {
    if (!this.hudEl) return;
    this.hudDay.textContent = `Day ${s.day}`;
    this.hudClock.style.width = `${Math.min(100, s.clockFrac * 100)}%`;
    this.clockLabel.textContent = s.timeLabel;
    this.hudCoins.textContent = `🪙 ${s.coins}`;
    this.hudRep.textContent = `⭐ ${s.rep}`;
  }

  setPrompt(label: string | null, action: string | null) {
    if (label) { this.promptEl.textContent = label; this.promptEl.classList.remove('hidden'); }
    else this.promptEl.classList.add('hidden');
    if (action) { this.actionBtn.textContent = action; this.actionBtn.classList.remove('hidden'); }
    else this.actionBtn.classList.add('hidden');
  }

  hideHud() {
    this.hudEl?.remove(); this.hudEl = null;
    this.promptEl?.remove(); this.actionBtn?.remove(); this.joyBase?.remove();
  }

  // ---------------- panels ----------------
  private openPanel(title: string): { body: HTMLElement; close: () => void; panel: HTMLElement } {
    this.closePanel();
    const p = el('div', 'panel-wrap');
    p.innerHTML = `<div class="panel"><div class="panel-head"><h2>${title}</h2><button class="btn small x">✕</button></div><div class="panel-body"></div></div>`;
    const body = p.querySelector('.panel-body') as HTMLElement;
    const close = () => { p.remove(); };
    (p.querySelector('.x') as HTMLButtonElement).onclick = () => { sfx.click(); close(); (this as { onPanelClose: () => void }).onPanelClose?.(); };
    p.addEventListener('pointerdown', (e) => { if (e.target === p) { close(); (this as { onPanelClose: () => void }).onPanelClose?.(); } });
    this.panelLayer.appendChild(p);
    return { body, close, panel: p };
  }
  onPanelClose: () => void = () => {};
  closePanel() { this.panelLayer.innerHTML = ''; }

  // ---- cook: recipe list -> timing minigame ----
  showCook(recipes: Recipe[], stoveLevel: number, onDone: (r: Recipe, q: 'perfect' | 'good' | 'burnt') => void, onClose: () => void) {
    this.onPanelClose = onClose;
    const { body, close } = this.openPanel('🍳 Recipe Book');
    const list = el('div', 'recipe-list');
    recipes.forEach((r) => {
      const row = el('button', 'recipe-row');
      row.append(dishIconCanvas(r.id, 52));
      const mid = el('div', 'recipe-mid', `<b>${r.name}</b><span>${r.price}c · ${r.time}s</span>`);
      row.append(mid);
      row.onclick = () => { sfx.click(); this.cookMinigame(body, close, r, stoveLevel, onDone); };
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  private cookMinigame(body: HTMLElement, close: () => void, r: Recipe, stoveLevel: number,
      onDone: (r: Recipe, q: 'perfect' | 'good' | 'burnt') => void) {
    body.innerHTML = '';
    const wrap = el('div', 'minigame');
    const lvl = Math.max(0, stoveLevel - 1); // stoveLevel is 1..3
    const perfectR = 0.05 + lvl * 0.02;
    const goodR = 0.15 + lvl * 0.035;
    wrap.innerHTML = `
      <div class="mg-head"></div>
      <div class="mg-bar">
        <div class="mg-zone good" style="left:${(0.5 - goodR) * 100}%;width:${goodR * 2 * 100}%"></div>
        <div class="mg-zone perfect" style="left:${(0.5 - perfectR) * 100}%;width:${perfectR * 2 * 100}%"></div>
        <div class="mg-marker"></div>
      </div>
      <div class="mg-hint">Stop in the <b class="gold">gold</b> for PERFECT (${QUALITY_MULT.perfect}× pay)</div>
      <button class="btn primary big">STOP</button>`;
    wrap.querySelector('.mg-head')!.append(dishIconCanvas(r.id, 56), el('b', '', r.name));
    body.appendChild(wrap);
    const marker = wrap.querySelector('.mg-marker') as HTMLElement;
    const stopBtn = wrap.querySelector('.btn') as HTMLButtonElement;
    let pos = 0, dir = 1, done = false;
    const speed = 1.35; // full sweeps per second (0→1)
    let last = performance.now();
    const tick = (now: number) => {
      if (done) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      pos += dir * speed * dt;
      if (pos >= 1) { pos = 1; dir = -1; }
      if (pos <= 0) { pos = 0; dir = 1; }
      marker.style.left = `${pos * 100}%`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const stop = () => {
      if (done) return; done = true;
      const d = Math.abs(pos - 0.5);
      const q = d <= perfectR ? 'perfect' : d <= goodR ? 'good' : 'burnt';
      if (q === 'perfect') sfx.perfect(); else if (q === 'burnt') sfx.angry(); else sfx.serve();
      close();
      onDone(r, q);
    };
    stopBtn.onclick = stop;
  }

  // ---- shop ----
  showShop(items: ShopItem[], save: SaveData,
      onBuy: (it: ShopItem) => boolean, onClose: () => void) {
    this.onPanelClose = onClose;
    const { body, close } = this.openPanel('🛒 Expand the Cafe');
    const render = () => {
      body.innerHTML = '';
      const coins = el('div', 'shop-coins', `🪙 ${save.coins} coins`);
      const grid = el('div', 'shop-grid');
      items.forEach((it) => {
        const maxed = it.maxed(save);
        const cost = it.price(save);
        const card = el('div', 'shop-card' + (maxed ? ' maxed' : ''));
        if (it.icon.startsWith('food_')) {
          const iconId = RECIPES[parseInt(it.icon.slice(5), 10)]?.id ?? 'burger';
          card.append(dishIconCanvas(iconId, 44));
        } else {
          card.append(shopIconCanvas(it.id, 44));
        }
        const info = el('div', 'shop-info',
          `<b>${it.name}</b><span>${it.desc}</span>`);
        card.append(info);
        const btn = el('button', 'btn small' + (maxed || save.coins < cost ? ' disabled' : ''),
          maxed ? 'MAX' : `${cost}c`);
        if (!maxed && save.coins >= cost) {
          (btn as HTMLButtonElement).onclick = () => { if (onBuy(it)) { sfx.buy(); render(); } };
        }
        card.append(btn);
        grid.appendChild(card);
      });
      body.append(coins, grid);
    };
    render();
    void close;
  }

  // ---- pause ----
  showPause(onResume: () => void, onQuit: () => void, muted: boolean, onMute: () => boolean) {
    const { body, close } = this.openPanel('⏸ Paused');
    this.onPanelClose = onResume;
    const mk = (label: string, cb: () => void, primary = false) => {
      const b = el('button', 'btn block' + (primary ? ' primary' : ''), label);
      b.onclick = () => { sfx.click(); cb(); };
      body.appendChild(b);
    };
    mk('Resume', () => { close(); onResume(); }, true);
    const muteBtn = el('button', 'btn block', muted ? '🔊 Sound: off' : '🔊 Sound: on');
    muteBtn.onclick = () => { const m = onMute(); muteBtn.textContent = m ? '🔊 Sound: off' : '🔊 Sound: on'; };
    body.appendChild(muteBtn);
    body.appendChild(el('div', 'howto',
      `<b>How to play</b><br>Guests walk in and order — cook at the stove, pick up the dish at the counter, serve the right table before patience runs out. Earn coins, buy upgrades in the shop, survive the day.`));
    mk('Save & Title', () => { close(); onQuit(); });
  }

  // ---- day summary ----
  showSummary(d: SummaryData, onNext: () => void) {
    const { body, close } = this.openPanel(`🌙 Day ${d.day} Complete`);
    let advanced = false;
    const next = () => { if (advanced) return; advanced = true; this.closePanel(); onNext(); };
    this.onPanelClose = next;
    body.innerHTML = `
      <div class="summary">
        <div class="sum-row"><span>Guests served</span><b>${d.served}</b></div>
        <div class="sum-row"><span>Food revenue</span><b>+${d.revenue}c</b></div>
        <div class="sum-row"><span>Room income</span><b>+${d.roomsIncome}c</b></div>
        <div class="sum-row"><span>Angry walkouts</span><b>${d.angry}</b></div>
        <div class="sum-row total"><span>Reputation</span><b>⭐ ${d.rep}</b></div>
        <div class="sum-row total"><span>Coins</span><b>🪙 ${d.coins}</b></div>
      </div>`;
    const b = el('button', 'btn primary big block', `Start Day ${d.day + 1} →`);
    b.onclick = () => { sfx.click(); next(); };
    body.appendChild(b);
    void close;
  }

  toast(text: string) {
    const t = el('div', 'toast', text);
    this.toastLayer.appendChild(t);
    setTimeout(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2200);
  }
}
