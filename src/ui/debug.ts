import { ABILITIES, HELPERS, MAPS } from '../config/balance';
import * as eco from '../core/economy';
import { formatCash } from '../core/format';
import type { Game } from '../game';
import { showOffline } from './dialogs';
import { h } from './dom';

export interface DebugApi {
  addCash: (n: number) => void;
  multCash: (m: number) => void;
  addDm: (n: number) => void;
  setWarp: (w: number) => void;
  getWarp: () => number;
  unlockAll: () => void;
  endRound: () => void;
  grow: (levels: number) => void;
  /** Cosmos: jump to the next realm (or the finale on the last). */
  nextRealm: () => void;
  simulateOffline: (hours: number) => void;
  info: () => string;
}

/** Developer panel (backtick). Hidden by default. */
export class DebugPanel {
  readonly root: HTMLDivElement;
  private infoEl: HTMLPreElement;
  private warpBtns: HTMLButtonElement[] = [];

  constructor(
    parent: HTMLElement,
    private api: DebugApi,
  ) {
    const btn = (label: string, fn: () => void) => h('button', { class: 'dbg-btn', onclick: fn }, label);
    this.infoEl = h('pre', { class: 'dbg-info' });
    const warp = h('div', { class: 'dbg-row' }, h('span', null, 'Time warp'));
    for (const w of [1, 10, 100]) {
      const b = btn(`x${w}`, () => {
        api.setWarp(w);
        this.refresh();
      });
      this.warpBtns.push(b);
      warp.appendChild(b);
    }
    this.root = h(
      'div',
      { class: 'debug hidden' },
      h('div', { class: 'dbg-title' }, 'DEBUG (`)'),
      h('div', { class: 'dbg-row' }, btn('+$1K', () => api.addCash(1e3)), btn('+$1M', () => api.addCash(1e6)), btn('+$1B', () => api.addCash(1e9)), btn('Cash x10', () => api.multCash(10))),
      h('div', { class: 'dbg-row' }, btn('+10 DM', () => api.addDm(10)), btn('+100 DM', () => api.addDm(100)), btn('Unlock all', () => api.unlockAll())),
      warp,
      h('div', { class: 'dbg-row' }, btn('+5 size', () => api.grow(5)), btn('End round', () => api.endRound()), btn('Offline 2h', () => api.simulateOffline(2))),
      h('div', { class: 'dbg-row' }, btn('Next realm', () => api.nextRealm())),
      this.infoEl,
    );
    parent.appendChild(this.root);
  }

  toggle(): void {
    this.root.classList.toggle('hidden');
    this.refresh();
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  refresh(): void {
    const w = this.api.getWarp();
    this.warpBtns.forEach((b, i) => b.classList.toggle('on', [1, 10, 100][i] === w));
    this.infoEl.textContent = this.api.info();
  }
}

/** Cheats and stats for the panel. Lives here (not in Game) so release builds drop it entirely. */
export function debugApiFor(game: Game): DebugApi {
  const st = () => game.debugState;
  return {
    addCash: (n) => eco.earn(game.save, n),
    multCash: (m) => eco.earn(game.save, game.save.cash * (m - 1)),
    addDm: (n) => {
      game.save.dm += n;
      game.save.dmTotal += n;
      game.hub.markDirty();
    },
    setWarp: (w) => (game.warp = w),
    getWarp: () => game.warp,
    unlockAll: () => {
      const s = game.save;
      for (const m of MAPS) s.maps[m.id] = true;
      for (const a of ABILITIES) s.abilities[a.id] = Math.max(1, s.abilities[a.id]);
      s.helpers = Math.max(s.helpers, HELPERS.countCosts.length);
      s.runCash = Math.max(s.runCash, 1e7);
      game.hub.markDirty();
    },
    endRound: () => {
      const { world, state } = st();
      if (world && state === 'round') world.timeLeft = 0.01;
    },
    grow: (n) => {
      const { world, state } = st();
      if (world && state === 'round') for (let i = 0; i < n; i++) world.gainXp(eco.xpForLevel(world.main.level));
    },
    nextRealm: () => game.cosmosSkip(),
    simulateOffline: (hours) => {
      const off = eco.computeOffline({ ...game.save, lastSeen: Date.now() - hours * 3600e3 }, Date.now());
      eco.earn(game.save, off.earned);
      showOffline(off.awaySeconds, off.creditedSeconds, off.earned, off.awaySeconds > off.creditedSeconds);
    },
    info: () => {
      const s = game.save;
      const { state, world, frameMs, simMs, syncMs } = st();
      return [
        `state ${state}  warp x${game.warp}`,
        `cash ${formatCash(s.cash)}  run ${formatCash(s.runCash)}`,
        `offline ${formatCash(eco.offlineRate(s))}/h  mult x${eco.globalCashMult(s).toFixed(2)}  tier ${s.tier}  DM gain ${eco.dmGain(s)}`,
        `rounds ${s.stats.rounds}  play ${(s.stats.playSeconds / 60).toFixed(1)} min`,
        `frame JS ${frameMs.toFixed(2)} ms (sim ${simMs.toFixed(2)} ms, sync ${syncMs.toFixed(2)} ms)`,
        world ? `objs ${world.objects.length}  movers ${world.movers.length}  R ${world.main.r.toFixed(2)}` : '',
      ].join('\n');
    },
  };
}
