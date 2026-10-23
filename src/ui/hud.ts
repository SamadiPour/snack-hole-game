import { ABILITIES, type AbilityId } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { levelToEat, mapDef } from '../core/economy';
import { formatCash, formatDuration, formatPercent } from '../core/format';
import type { World } from '../core/world';
import { h, setText, toggleClass } from './dom';

interface AbilityButton {
  id: AbilityId;
  el: HTMLButtonElement;
  cd: HTMLDivElement;
  label: HTMLDivElement;
}

/**
 * In-round overlay: timer, size badge, cash, combo meter, ability buttons, floaters, banners. A
 * casual Tour round has no timer or cash: the timer counts up and the cash pill shows the size goal.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private timer: HTMLDivElement;
  private sizeRing: HTMLDivElement;
  private sizeNum: HTMLDivElement;
  private snack: HTMLDivElement;
  private cash: HTMLDivElement;
  private pct: HTMLDivElement;
  private combo: HTMLDivElement;
  private comboText: HTMLDivElement;
  private comboMult: HTMLDivElement;
  private comboBar: HTMLDivElement;
  private abilityBar: HTMLDivElement;
  private abilities: AbilityButton[] = [];
  private floaterLayer: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private hintTimer = 0;
  private pool: HTMLDivElement[] = [];
  private shownCash = 0;
  private casual = false;
  onAbility: ((id: AbilityId) => void) | null = null;
  onPause: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.timer = h('div', { class: 'hud-timer' }, '1:00');
    this.sizeNum = h('div', { class: 'size-num' }, '1');
    this.sizeRing = h('div', { class: 'size-ring' }, this.sizeNum);
    this.snack = h('div', { class: 'size-snack' });
    this.cash = h('div', { class: 'hud-cash' }, '$0');
    this.pct = h('div', { class: 'hud-pct' }, '0% eaten');
    const pauseBtn = h('button', { class: 'icon-btn hud-pause', title: 'Pause (Esc)', 'aria-label': 'Pause' }, '⏸');
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    // Opens on click, not pointerdown: a tap's click lands on whatever is under the finger by then,
    // which would be the menu's backdrop, and that closes the menu at once.
    pauseBtn.addEventListener('click', () => this.onPause?.());
    this.comboText = h('div', { class: 'combo-text' });
    this.comboMult = h('div', { class: 'combo-mult' });
    this.comboBar = h('div', { class: 'combo-bar-fill' });
    this.combo = h('div', { class: 'hud-combo' }, this.comboText, this.comboMult, h('div', { class: 'combo-bar' }, this.comboBar));
    this.abilityBar = h('div', { class: 'hud-abilities' });
    this.floaterLayer = h('div', { class: 'floaters' });
    this.bannerEl = h('div', { class: 'banner', role: 'status', 'aria-live': 'polite' });
    this.hintEl = h('div', { class: 'hud-hint hidden' });
    this.root = h(
      'div',
      { class: 'hud hidden' },
      h('div', { class: 'hud-top' }, h('div', { class: 'hud-size' }, this.sizeRing, h('div', { class: 'size-info' }, h('div', { class: 'size-label' }, 'SIZE'), this.snack)), this.timer, h('div', { class: 'hud-right' }, this.cash, this.pct, pauseBtn)),
      this.combo,
      this.abilityBar,
      this.floaterLayer,
      this.bannerEl,
      this.hintEl,
    );
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    toggleClass(this.root, 'hidden', !on);
  }

  setup(world: World): void {
    this.shownCash = 0;
    this.casual = world.cfg.casual;
    this.abilityBar.innerHTML = '';
    this.abilities = [];
    for (const a of ABILITIES) {
      if (world.cfg.abilities[a.id].level <= 0) continue;
      const cd = h('div', { class: 'ab-cd' });
      const label = h('div', { class: 'ab-key' }, a.key.split(' / ').pop()!);
      const el = h('button', { class: 'ab-btn', title: `${a.name} (${a.key})`, 'aria-label': `${a.name} (${a.key})` }, h('div', { class: 'ab-icon', 'aria-hidden': 'true' }, a.icon), cd, label);
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onAbility?.(a.id);
      });
      el.addEventListener('click', (e) => {
        if (e.detail === 0) this.onAbility?.(a.id);
      });
      this.abilityBar.appendChild(el);
      this.abilities.push({ id: a.id, el, cd, label });
    }
    toggleClass(this.combo, 'active', false);
    this.bannerEl.className = 'banner';
  }

  /** Coaching tip at the bottom of the screen; hides itself after `seconds`. */
  hint(text: string, seconds = 7): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this.hintTimer = seconds;
  }

  hideHint(): void {
    this.hintTimer = 0;
    this.hintEl.classList.add('hidden');
  }

  update(world: World, dt: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hideHint();
    }
    const t = world.timeLeft;
    setText(this.timer, this.casual ? formatDuration(world.endedAt || world.time) : formatDuration(Math.ceil(t)));
    toggleClass(this.timer, 'urgent', !this.casual && t <= 10 && world.running);
    const lvl = world.main.level;
    setText(this.sizeNum, String(lvl + 1));
    const p = Math.round(world.levelProgress * 100);
    this.sizeRing.style.setProperty('--p', `${p}%`);
    const next = world.nextSnack();
    setText(
      this.snack,
      next ? `Next: ${OBJECT_TYPES[next.t].name} @ ${levelToEat(next.f) + 1}` : world.atMaxSize ? 'Max size! Eat everything!' : 'Eat everything!',
    );

    if (this.casual) {
      const goal = mapDef(world.cfg.mapId).goal;
      setText(this.cash, `${lvl >= goal ? '✅' : '🎯'} Size ${goal + 1}`);
    } else {
      // Count-up cash display.
      this.shownCash += (world.cash - this.shownCash) * Math.min(1, dt * 10);
      if (world.cash - this.shownCash < 0.5) this.shownCash = world.cash;
      setText(this.cash, formatCash(this.shownCash));
    }
    setText(this.pct, `${formatPercent(world.percentEaten)} eaten`);

    const c = world.combo;
    toggleClass(this.combo, 'active', c >= 3);
    if (c >= 3) {
      setText(this.comboText, `COMBO ×${c}`);
      const capped = world.comboMultiplier >= world.cfg.comboCap - 1e-9;
      setText(this.comboMult, this.casual ? '' : `cash ×${world.comboMultiplier.toFixed(2)}${capped ? ' · MAX' : ''}`);
      this.comboBar.style.transform = `scaleX(${Math.max(0, world.comboTimer / world.cfg.comboWindow)})`;
      toggleClass(this.combo, 'hot', c >= 25);
    }

    for (const b of this.abilities) {
      const st = world.abilities[b.id];
      const cfg = world.cfg.abilities[b.id];
      const frac = st.cd > 0 ? st.cd / cfg.cooldown : 0;
      b.cd.style.setProperty('--cd', `${Math.round(frac * 360)}deg`);
      toggleClass(b.el, 'ready', frac <= 0 && world.running);
      toggleClass(b.el, 'active', st.active > 0);
      setText(b.label, st.cd > 0 ? String(Math.ceil(st.cd)) : (ABILITIES.find((a) => a.id === b.id)!.key.split(' / ').pop() ?? ''));
    }
  }

  bumpCash(): void {
    this.cash.classList.remove('bump');
    void this.cash.offsetWidth;
    this.cash.classList.add('bump');
  }

  floater(x: number, y: number, text: string, cls = '', scale = 1): void {
    let el = this.pool.pop();
    if (!el) el = h('div', { class: 'floater' });
    el.className = `floater ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--s', String(scale));
    this.floaterLayer.appendChild(el);
    const done = () => {
      el!.removeEventListener('animationend', done);
      el!.remove();
      if (this.pool.length < 60) this.pool.push(el!);
    };
    el.addEventListener('animationend', done);
  }

  get floaterCount(): number {
    return this.floaterLayer.childElementCount;
  }

  banner(text: string, sub = '', cls = ''): void {
    this.bannerEl.innerHTML = '';
    this.bannerEl.append(h('div', { class: 'banner-main' }, text), sub ? h('div', { class: 'banner-sub' }, sub) : '');
    this.bannerEl.className = 'banner';
    void this.bannerEl.offsetWidth;
    this.bannerEl.className = `banner show ${cls}`;
  }
}
