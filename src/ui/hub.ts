import { MAPS } from '../config/balance';
import { mapDef, mapMaxLevel, roundTimeFor, startLevel } from '../core/economy';
import { formatCash, formatNumber, formatPercent } from '../core/format';
import type { SaveData } from '../core/save';
import type { Card } from './cards';
import { h, setText, toggleClass } from './dom';
import { TABS, renderTab, type HubApi, type TabId } from './tabs';

/** Between-rounds screen: top bar, big Play button and the tabbed shop panel. */
export class Hub {
  readonly root: HTMLDivElement;
  private cash: HTMLDivElement;
  private dm: HTMLDivElement;
  private tabBar: HTMLDivElement;
  private content: HTMLDivElement;
  private playMap: HTMLDivElement;
  private playInfo: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private cards: Card[] = [];
  private tab: TabId = 'upgrades';
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private dirty = true;
  private acc = 0;
  private lastCash = -1;
  /** What the player last clicked in the panel: a rebuild keeps its card at the same place on screen. */
  private pressed: Element | null = null;
  onPlay: (() => void) | null = null;
  onSettings: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private api: HubApi,
  ) {
    this.cash = h('div', { class: 'top-cash' });
    this.dm = h('div', { class: 'top-dm' });
    const settings = h('button', { class: 'icon-btn', title: 'Settings', 'aria-label': 'Settings', onclick: () => this.onSettings?.() }, '⚙️');
    this.tabBar = h('div', { class: 'tab-bar', role: 'tablist', 'aria-label': 'Shop' });
    // Focusable as a fallback target, so focus never drops to <body> when the panel rebuilds.
    this.content = h('div', { class: 'tab-content', role: 'tabpanel', tabindex: '-1' });
    this.content.addEventListener('click', (e) => (this.pressed = e.target instanceof Element ? e.target : null), true);
    this.playMap = h('div', { class: 'play-map' });
    this.playInfo = h('div', { class: 'play-info' });
    this.playBtn = h('button', { class: 'play-btn', onclick: () => this.onPlay?.() }, h('span', { class: 'play-icon' }, '▶'), 'PLAY');
    this.root = h(
      'div',
      { class: 'hub hidden' },
      h(
        'div',
        { class: 'topbar' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-hole' }), h('span', { class: 'brand-text' }, 'Snack Hole')),
        h('div', { class: 'top-stats' }, h('div', { class: 'top-cash-wrap' }, this.cash), this.dm),
        settings,
      ),
      h('div', { class: 'play-area' }, this.playMap, this.playBtn, this.playInfo),
      h('div', { class: 'panel' }, this.tabBar, this.content),
    );
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    toggleClass(this.root, 'hidden', !on);
    if (on) this.dirty = true;
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  markDirty(): void {
    this.dirty = true;
  }

  selectTab(id: TabId): void {
    this.tab = id;
    this.pressed = null;
    this.api.save.flags[`tab_${id}`] = true;
    this.dirty = true;
  }

  /**
   * Rebuilding replaces every button. Focus moves to the same tab or the same position in the
   * panel afterwards; otherwise it would drop to <body>, where Enter / Space start a round.
   * The card the player pressed (or focused) stays where it was on screen, even when a purchase
   * changed the height of text above it, so the panel does not jump under the pointer.
   */
  private rebuild(): void {
    const s = this.api.save;
    const focused = document.activeElement;
    const focusTab = focused instanceof HTMLElement && this.tabBar.contains(focused) ? focused.dataset.tab : undefined;
    const panelButtons = () => [...this.content.querySelectorAll<HTMLElement>('button, select, input')];
    const focusIndex = focused instanceof HTMLElement && this.content.contains(focused) ? panelButtons().indexOf(focused) : -2;
    this.tabBar.innerHTML = '';
    this.tabButtons.clear();
    const visible = TABS.filter((t) => t.visible(s));
    if (!visible.some((t) => t.id === this.tab)) this.tab = 'upgrades';
    s.flags.tab_upgrades = true;
    if (this.tab) s.flags[`tab_${this.tab}`] = true;
    for (const t of visible) {
      const isNew = !s.flags[`tab_${t.id}`];
      const b = h(
        'button',
        {
          class: `tab-btn ${t.id === this.tab ? 'on' : ''}`,
          title: t.name,
          role: 'tab',
          'aria-label': isNew ? `${t.name} (new)` : t.name,
          'aria-selected': String(t.id === this.tab),
          'data-tab': t.id,
          onclick: () => this.selectTab(t.id),
        },
        h('span', { class: 'tab-icon' }, t.icon),
        h('span', { class: 'tab-name' }, t.name),
        isNew ? h('span', { class: 'tab-new' }, 'NEW') : null,
      );
      this.tabButtons.set(t.id, b);
      this.tabBar.appendChild(b);
    }
    const top = (el: Element) => el.getBoundingClientRect().top - this.content.getBoundingClientRect().top;
    const body = this.content.firstElementChild;
    let anchor = this.pressed ?? (focusIndex >= 0 ? focused : null);
    while (anchor && anchor.parentElement !== body) anchor = anchor.parentElement;
    const anchorIndex = anchor && body ? [...body.children].indexOf(anchor) : -1;
    const anchorTop = anchor ? top(anchor) : 0;
    const scroll = this.content.scrollTop;
    this.content.innerHTML = '';
    this.cards = [];
    this.content.appendChild(renderTab(this.tab, this.api, this.cards));
    // Fill the live text first: restoring the scroll into a panel that is still short (the
    // Singularity hero is empty until its first update) clamps it.
    for (const c of this.cards) c.update();
    this.content.scrollTop = scroll;
    const again = anchorIndex >= 0 ? this.content.firstElementChild?.children[anchorIndex] : undefined;
    if (again) this.content.scrollTop += top(again) - anchorTop;
    this.pressed = null;
    this.dirty = false;
    if (focusTab) (this.tabButtons.get(focusTab as TabId) ?? this.tabButtons.get(this.tab))?.focus({ preventScroll: true });
    else if (focusIndex >= -1) {
      const items = panelButtons();
      (items[Math.min(Math.max(0, focusIndex), items.length - 1)] ?? this.content).focus({ preventScroll: true });
    }
  }

  /** Keeps tab visibility in sync as cash crosses unlock thresholds. */
  private visibleSignature(): string {
    const s = this.api.save;
    return TABS.filter((t) => t.visible(s))
      .map((t) => t.id)
      .join(',');
  }

  private lastSig = '';

  update(dt: number): void {
    if (!this.visible) return;
    const s = this.api.save;
    const sig = this.visibleSignature();
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.dirty = true;
    }
    if (this.dirty) {
      this.rebuild();
      this.lastCash = -1;
    }
    this.acc += dt;
    if (this.acc < 0.1 && s.cash === this.lastCash) return;
    this.acc = 0;
    this.lastCash = s.cash;
    setText(this.cash, formatCash(s.cash));
    setText(this.dm, s.dmTotal > 0 || s.dm > 0 ? `🌑 ${formatNumber(s.dm)} DM` : '');
    toggleClass(this.dm, 'hidden', !(s.dmTotal > 0 || s.dm > 0));
    const m = mapDef(s.selectedMap);
    setText(this.playMap, `${m.icon} ${m.name}`);
    const first = s.stats.rounds === 0;
    const start = startLevel(s);
    const maxed = start >= mapMaxLevel(s.selectedMap) ? ' (max)' : '';
    setText(
      this.playInfo,
      first
        ? `${roundTimeFor(s)}s · steer with mouse, touch or WASD`
        : `${roundTimeFor(s)}s · start size ${start + 1}${maxed} · ${goalText(s)}`,
    );
    for (const c of this.cards) c.update();
  }
}

/** Size goal for the selected map, or the best % once the next map is unlocked. */
function goalText(s: SaveData): string {
  const i = MAPS.findIndex((m) => m.id === s.selectedMap);
  const m = MAPS[i];
  const next = MAPS[i + 1];
  if (next && !s.maps[next.id]) return `goal size ${m.goal + 1} (best ${s.mapLevel[m.id] + 1})`;
  return `best ${formatPercent(s.mapBest[m.id])}${s.map100[m.id] ? ' ✅' : ''}`;
}
