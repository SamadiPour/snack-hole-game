import {
  ABILITIES,
  DM_UPGRADES,
  HELPERS,
  MAPS,
  MAP_COMPLETE_BONUS,
  PRESTIGE,
  SKINS,
  TOUR,
  UPGRADES,
  type AbilityId,
  type DmUpgradeId,
  type MapId,
  type UpgradeId,
} from '../config/balance';
import { OBJECT_TYPES, SET_NAMES, type GulpSet } from '../config/objects';
import { ACHIEVEMENTS } from '../core/achievements';
import {
  abilityCooldown,
  abilityCost,
  abilityDuration,
  megaScale,
  fixedPriceScale,
  priceScale,
  cashBreakdown,
  completedSets,
  dmForLifetime,
  dmGainAt,
  dmGrowth,
  dmLevel,
  dmUpgradeCost,
  gulpSetTypes,
  headStartCash,
  helperCountCost,
  helperLevelCost,
  helperRadius,
  isAbilityVisible,
  isUpgradeVisible,
  lifetimeForDm,
  mapLockReason,
  mapMaxLevel,
  prestigeUnlocked,
  singularityDmMult,
  singularityPreview,
  tierDmMult,
  tierUpReady,
  upgradeCost,
  upgradeEffectText,
  type SingularityPreview,
} from '../core/economy';
import { formatCash, formatDuration, formatNumber, formatPercent, formatRate } from '../core/format';
import type { SaveData } from '../core/save';
import { tourComplete, tourLockReason, tourStars, tourStartLevel } from '../core/tour';
import { thumbInto } from '../render/thumbs';
import { card, lockedCard, section, type Card } from './cards';
import { h, setText } from './dom';

export interface HubApi {
  save: SaveData;
  buyUpgrade(id: UpgradeId): void;
  buyHelper(): void;
  buyHelperLevel(): void;
  buyAbility(id: AbilityId): void;
  selectMap(id: MapId): void;
  selectTourMap(id: MapId): void;
  setTourMode(on: boolean): void;
  buyDm(id: DmUpgradeId): void;
  prestige(): void;
  buySkin(id: string): void;
  equipSkin(id: string): void;
}

export type TabId = 'upgrades' | 'helpers' | 'abilities' | 'maps' | 'singularity' | 'gulpedia' | 'trophies' | 'skins';

export interface TabDef {
  id: TabId;
  icon: string;
  name: string;
  visible: (s: SaveData) => boolean;
}

export const TABS: TabDef[] = [
  { id: 'upgrades', icon: '⭕', name: 'Upgrades', visible: () => true },
  { id: 'helpers', icon: '👯', name: 'Helpers', visible: (s) => s.runCash >= HELPERS.unlockAt * 0.6 || s.helpers > 0 || s.stats.prestiges > 0 },
  { id: 'abilities', icon: '⚡', name: 'Abilities', visible: (s) => s.runCash >= ABILITIES[0].unlockAt * 0.6 || s.stats.prestiges > 0 },
  { id: 'maps', icon: '🗺️', name: 'Maps', visible: (s) => s.stats.rounds >= 2 || s.stats.prestiges > 0 },
  { id: 'singularity', icon: '🕳️', name: 'Singularity', visible: (s) => s.maps.farm || s.stats.prestiges > 0 },
  { id: 'gulpedia', icon: '📖', name: 'Gulpedia', visible: (s) => s.stats.rounds >= 1 },
  { id: 'trophies', icon: '🏆', name: 'Trophies', visible: (s) => s.achievements.length > 0 },
  { id: 'skins', icon: '🎨', name: 'Skins', visible: (s) => s.skins.length > 1 || s.stats.prestiges > 0 },
];

const cost = (n: number) => formatCash(n);

function upgradesTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  // First-run tip only. It must not call upgrades "permanent": a Singularity resets them.
  if (s.stats.rounds >= 1 && s.stats.prestiges === 0 && Object.values(s.upgrades).every((v) => v === 0)) {
    root.appendChild(h('div', { class: 'tip' }, '💡 Upgrades carry over to every round. Buy one, then hit PLAY to go again!'));
  }
  let teaser = false;
  for (const d of UPGRADES) {
    if (!isUpgradeVisible(s, d)) {
      if (!teaser) {
        teaser = true;
        root.appendChild(lockedCard(d.icon, d.name, `Earn ${cost(d.unlockAt)} total to unlock.`));
      }
      continue;
    }
    const c = card({
      icon: d.icon,
      title: d.name,
      desc: d.desc,
      level: () => `Lv ${s.upgrades[d.id]}/${d.max}`,
      effect: () => {
        const lvl = s.upgrades[d.id];
        if (lvl >= d.max) return `${upgradeEffectText(d.id, lvl)} (max)`;
        return `${upgradeEffectText(d.id, lvl)} → ${upgradeEffectText(d.id, lvl + 1)}`;
      },
      button: {
        label: () => '+1',
        cost: () => cost(upgradeCost(d.id, s.upgrades[d.id], priceScale(s))),
        can: () => s.upgrades[d.id] < d.max && s.cash >= upgradeCost(d.id, s.upgrades[d.id], priceScale(s)),
        onClick: () => api.buyUpgrade(d.id),
        doneText: () => (s.upgrades[d.id] >= d.max ? 'MAXED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  return root;
}

function helpersTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Helper Holes', 'Mini holes that roam during rounds and eat small props for you.'));
  if (s.runCash < HELPERS.unlockAt && s.helpers === 0) {
    root.appendChild(lockedCard('👯', 'Helper Holes', `Earn ${cost(HELPERS.unlockAt)} total to unlock.`));
    return root;
  }
  const count = card({
    icon: '🕳️',
    title: 'Helper Holes',
    desc: `Each one roams during rounds and eats small props for ${Math.round(HELPERS.roundCashShare * 100)}% of their value.`,
    level: () => `${s.helpers}/${HELPERS.countCosts.length}`,
    effect: () => `${s.helpers} → ${Math.min(HELPERS.countCosts.length, s.helpers + 1)} helpers`,
    button: {
      label: () => '+1',
      cost: () => cost(helperCountCost(s.helpers, fixedPriceScale(s))),
      can: () => s.cash >= helperCountCost(s.helpers, fixedPriceScale(s)),
      onClick: () => api.buyHelper(),
      doneText: () => (s.helpers >= HELPERS.countCosts.length ? 'MAXED' : null),
    },
  });
  cards.push(count);
  root.appendChild(count.el);
  if (s.helpers > 0) {
    const lvl = card({
      icon: '📶',
      title: 'Helper Training',
      desc: 'Bigger helpers eat bigger props.',
      level: () => `Lv ${s.helperLevel}/${HELPERS.levelMax}`,
      effect: () => {
        const q = dmLevel(s, 'quantumHelpers');
        return `radius ${helperRadius(s.helperLevel, q).toFixed(2)}m → ${helperRadius(s.helperLevel + 1, q).toFixed(2)}m`;
      },
      button: {
        label: () => '+1',
        cost: () => cost(helperLevelCost(s.helperLevel, fixedPriceScale(s))),
        can: () => s.cash >= helperLevelCost(s.helperLevel, fixedPriceScale(s)),
        onClick: () => api.buyHelperLevel(),
        doneText: () => (s.helperLevel >= HELPERS.levelMax ? 'MAXED' : null),
      },
    });
    cards.push(lvl);
    root.appendChild(lvl.el);
  }
  return root;
}

function abilitiesTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Abilities', 'Use during rounds with the keys shown or the on-screen buttons.'));
  let teaser = false;
  for (const a of ABILITIES) {
    if (!isAbilityVisible(s, a)) {
      if (!teaser) {
        teaser = true;
        root.appendChild(lockedCard(a.icon, a.name, `Earn ${cost(a.unlockAt)} total to reveal.`));
      }
      continue;
    }
    const c = card({
      icon: a.icon,
      title: a.name,
      desc: `${a.desc} Key: ${a.key}.`,
      level: () => (s.abilities[a.id] > 0 ? `Lv ${s.abilities[a.id]}/${a.maxLevel}` : 'Locked'),
      effect: () => {
        const l = s.abilities[a.id];
        const size = (lv: number) => (a.id === 'mega' ? `+${Math.round((megaScale(lv) - 1) * 100)}%, ` : '');
        if (l === 0) return `${size(1)}${abilityDuration(a.id, 1).toFixed(1)}s, every ${abilityCooldown(a.id, 1).toFixed(0)}s`;
        const now = `${size(l)}${abilityDuration(a.id, l).toFixed(1)}s / ${abilityCooldown(a.id, l).toFixed(1)}s cd`;
        if (l >= a.maxLevel) return now;
        return `${now} → ${size(l + 1)}${abilityDuration(a.id, l + 1).toFixed(1)}s / ${abilityCooldown(a.id, l + 1).toFixed(1)}s`;
      },
      button: {
        label: () => (s.abilities[a.id] === 0 ? 'Unlock' : '+1'),
        cost: () => cost(abilityCost(a.id, s.abilities[a.id], fixedPriceScale(s))),
        can: () => s.cash >= abilityCost(a.id, s.abilities[a.id], fixedPriceScale(s)),
        onClick: () => api.buyAbility(a.id),
        doneText: () => (s.abilities[a.id] >= a.maxLevel ? 'MAXED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  return root;
}

function mapsTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Maps', `Reach the size goal on a map to unlock the next one. Eat 100% of a map for a permanent +${MAP_COMPLETE_BONUS * 100}% cash bonus.`));
  MAPS.forEach((m, i) => {
    if (!s.maps[m.id]) {
      root.appendChild(lockedCard(m.icon, m.name, `${mapLockReason(s, m.id) ?? 'Play a round to unlock'}.`));
      return;
    }
    const next = MAPS[i + 1];
    const max = mapMaxLevel(m.id);
    const c = card({
      icon: m.icon,
      title: m.name,
      cls: s.selectedMap === m.id ? 'selected' : '',
      desc: `${m.blurb}${m.sizeOffset ? ` A bigger world: you start ${m.sizeOffset} sizes smaller here.` : ''}`,
      level: () => (s.map100[m.id] ? '✅ 100%' : `best ${formatPercent(s.mapBest[m.id])}`),
      effect: () =>
        next && !s.maps[next.id]
          ? `Goal: size ${m.goal + 1} (best ${s.mapLevel[m.id] + 1}) → ${next.name}`
          : `Best size ${Math.min(s.mapLevel[m.id], max) + 1} · max ${max + 1}`,
      button: {
        label: () => 'Select',
        cost: () => '',
        can: () => true,
        onClick: () => api.selectMap(m.id),
        doneText: () => (s.selectedMap === m.id ? 'PLAYING' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  });
  return root;
}

/** Filled and empty stars, out of 3. */
export function starText(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

/** The hub panel in Tour mode: every Tour map with its stars and records, in place of the shop tabs. */
export function tourPanel(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const t = s.tour;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(
    section(
      tourComplete(s) ? 'Casual Tour 🏆' : 'Casual Tour',
      'No timer, no shop, no cash: start small and grow on each map at your own pace. Reach the size goal to open the next map. Stars: reach the goal, clear the map, clear it within par.',
    ),
  );
  for (const m of MAPS) {
    if (!t.maps[m.id]) {
      root.appendChild(lockedCard(m.icon, m.name, `${tourLockReason(s, m.id)}.`));
      continue;
    }
    const c = card({
      icon: m.icon,
      title: m.name,
      cls: t.selectedMap === m.id ? 'selected' : '',
      desc: `${m.blurb} You start at size ${tourStartLevel(m.id) + 1}.`,
      level: () => starText(tourStars(s, m.id)),
      effect: () => {
        const goal = `Goal size ${m.goal + 1} · par ${formatDuration(TOUR.par[m.id])}`;
        if (t.bestPct[m.id] <= 0) return goal;
        const clear = t.bestClear[m.id] > 0 ? `, cleared in ${formatDuration(t.bestClear[m.id])}` : '';
        return `${goal} · best size ${t.bestLevel[m.id] + 1}, ${formatPercent(t.bestPct[m.id])}${clear}`;
      },
      button: {
        label: () => 'Select',
        cost: () => '',
        can: () => true,
        onClick: () => api.selectTourMap(m.id),
        doneText: () => (t.selectedMap === m.id ? 'SELECTED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  return root;
}

/** The Singularity panel's "Resets" and "You keep" lists, with this run's numbers. */
function singularityLedger(s: SaveData, p: SingularityPreview): { resets: [string, string][]; keeps: [string, string][] } {
  const list = (names: string[]) => (names.length ? names.join(', ') : 'none');
  const keepMaps = dmLevel(s, 'wormhole') > 0;
  const resets: [string, string][] = [
    ['Cash', formatCash(s.cash)],
    ['Upgrades', p.upgradeLevels ? `${p.upgradeLevels} levels` : 'none'],
    ['Helpers', s.helpers ? `${s.helpers}${s.helperLevel ? ` (Lv ${s.helperLevel})` : ''}` : 'none'],
    ['Abilities', list(p.abilities.map((id) => ABILITIES.find((a) => a.id === id)!.name))],
  ];
  if (!keepMaps) resets.push(['Unlocked maps', list(p.lostMaps.map((id) => MAPS.find((m) => m.id === id)!.name))]);
  const keeps: [string, string][] = [
    ['Permanent cash bonus', `x${formatRate(p.keptMult)} → x${formatRate(p.keptMultAfter)}`],
    ['Dark Matter', `${formatNumber(s.dm)} → ${formatNumber(p.after.dm)}`],
    ...(keepMaps ? [['Unlocked maps', 'Wormhole'] as [string, string]] : []),
    ['Trophies', `${s.achievements.length}/${ACHIEVEMENTS.length}`],
    ['Gulpedia', `${Object.keys(s.gulpedia).length}/${OBJECT_TYPES.length}`],
    ['DM tree, skins, 100% maps, records', ''],
  ];
  return { resets, keeps };
}

function ledgerRows(title: string, rows: [string, string][]): HTMLElement[] {
  return [h('div', { class: 'ledger-title' }, title), ...rows.map(([k, v]) => h('div', { class: 'ledger-row' }, h('span', null, k), v ? h('b', null, v) : null))];
}

function singularityTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  const gain = h('div', { class: 'sing-gain' });
  const sub = h('div', { class: 'sing-sub' });
  const bar = h('div', { class: 'progress-fill' });
  const barText = h('div', { class: 'progress-text' });
  const resets = h('div', { class: 'ledger lose' });
  const keeps = h('div', { class: 'ledger keep' });
  const btn = h('button', { class: 'sing-btn', onclick: () => api.prestige() }, 'Reset run for Dark Matter');
  const info = h('div', { class: 'sing-info' });
  root.append(
    h('div', { class: 'sing-hero' }, h('div', { class: 'sing-orb' }), gain, sub, h('div', { class: 'progress' }, bar, barText), resets, keeps, btn, info),
  );
  let ledgerKey = '';
  cards.push({
    el: gain,
    update: () => {
      const p = singularityPreview(s);
      const dm = p.dm;
      const unlocked = prestigeUnlocked(s);
      if (!unlocked) gain.textContent = `Unlock ${MAPS.find((m) => m.id === PRESTIGE.unlockMap)!.name} to collapse`;
      else if (dm > 0) {
        const pct = s.dmTotal > 0 ? ` (+${Math.round((dm / s.dmTotal) * 100)}%)` : '';
        gain.textContent = `+${formatNumber(dm)} Dark Matter${pct}`;
      } else gain.textContent = 'Not enough mass yet';
      const keepMaps = dmLevel(s, 'wormhole') > 0;
      setText(
        sub,
        dm > 0
          ? `Restart ${keepMaps ? 'this run' : `from ${MAPS.find((m) => m.id === p.after.selectedMap)!.name}`} with a bigger permanent cash bonus.`
          : 'A Singularity restarts your run for Dark Matter, a permanent cash bonus.',
      );
      const ledger = singularityLedger(s, p);
      const key = JSON.stringify(ledger);
      if (key !== ledgerKey) {
        ledgerKey = key;
        resets.replaceChildren(...ledgerRows('Resets this run', ledger.resets));
        keeps.replaceChildren(...ledgerRows('You keep', ledger.keeps));
      }
      setText(btn, dm > 0 ? `Reset run for +${formatNumber(dm)} DM` : 'Reset run for Dark Matter');
      // Progress toward the next whole DM from the lifetime-cash formula, which the multipliers
      // can turn into several.
      const have = dmForLifetime(s.lifetimeCash);
      const next = lifetimeForDm(have + 1);
      const prev = lifetimeForDm(have);
      const frac = Math.min(1, Math.max(0, (s.lifetimeCash - prev) / (next - prev)));
      bar.style.width = `${(frac * 100).toFixed(1)}%`;
      const step = dmGainAt(s, have + 1) - dmGainAt(s, have);
      barText.textContent = `${formatCash(s.lifetimeCash)} / ${formatCash(next)} lifetime for ${step > 1 ? `+${formatNumber(step)} DM` : 'the next DM'}`;
      btn.disabled = dm <= 0;
      const worth = dm > 0 && s.dmClaimed > 0 && dmGrowth(s) >= PRESTIGE.goodGain ? ' Good time to collapse.' : '';
      const tier = s.tier > 0 || tierUpReady(s) ? ` Tier ${s.tier}${tierUpReady(s) ? ` → ${s.tier + 1} on collapse (${s.tier < PRESTIGE.tierSizeCap ? 'bigger world, ' : ''}x${PRESTIGE.tierScale} payouts and prices, DM x${tierDmMult(s.tier + 1).toFixed(1)})` : ''}.` : '';
      // The next map that waits on Singularities: the reason to collapse at all.
      const gate = MAPS.find((m) => m.needsSingularities > s.stats.prestiges);
      const gateText = gate ? ` ${gate.name} needs ${gate.needsSingularities} Singularit${gate.needsSingularities === 1 ? 'y' : 'ies'}${s.stats.prestiges > 0 ? ` (you have ${s.stats.prestiges})` : ''}.` : '';
      const sMult = singularityDmMult(s.stats.prestiges);
      const growth = sMult > 1 ? ` Your Singularities raise DM gains x${formatRate(sMult)}.` : '';
      info.textContent = `Each DM ever earned gives +${PRESTIGE.bonusPerDm * 100}% cash forever (you have ${formatNumber(s.dmTotal)}).${headStartCash(s) > 0 ? ` Head Start gives ${formatCash(headStartCash(s))}.` : ''}${growth}${gateText}${worth}${tier}`;
    },
  });
  root.appendChild(section('Dark Matter Tree', `Unspent: ${formatNumber(s.dm)} DM`));
  for (const d of DM_UPGRADES) {
    const c = card({
      icon: d.icon,
      title: d.name,
      desc: d.desc,
      level: () => `Lv ${dmLevel(s, d.id)}/${d.max}`,
      button: {
        label: () => '+1',
        cost: () => `${formatNumber(dmUpgradeCost(d.id, dmLevel(s, d.id)))} DM`,
        can: () => s.dm >= dmUpgradeCost(d.id, dmLevel(s, d.id)),
        onClick: () => api.buyDm(d.id),
        doneText: () => (dmLevel(s, d.id) >= d.max ? 'MAXED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  const b = cashBreakdown(s);
  root.appendChild(section('Cash multiplier', `x${formatRate(b.total)} total`));
  root.appendChild(
    h(
      'div',
      { class: 'breakdown' },
      ...[
        ['Cash Value upgrade', b.upgrade],
        ['Dark Matter', b.darkMatter],
        ['Event Horizon', b.eventHorizon],
        ['Achievements', b.achievements],
        ['Gulpedia sets', b.sets],
        ['100% maps', b.maps],
      ].map(([k, v]) => h('div', { class: 'bd-row' }, h('span', null, String(k)), h('b', null, `x${formatRate(v as number)}`))),
    ),
  );
  return root;
}

function gulpediaTab(api: HubApi): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  const found = Object.keys(s.gulpedia).length;
  const done = completedSets(s);
  root.appendChild(section('Gulpedia', `${found}/${OBJECT_TYPES.length} discovered · ${done.length} sets complete (+5% cash each)`));
  const sets = [...new Set(OBJECT_TYPES.map((t) => t.set))] as GulpSet[];
  for (const set of sets) {
    const ids = gulpSetTypes(set);
    const have = ids.filter((id) => (s.gulpedia[id] ?? 0) > 0).length;
    const grid = h('div', { class: 'gulp-grid' });
    for (const id of ids) {
      const t = OBJECT_TYPES.findIndex((o) => o.id === id);
      const n = s.gulpedia[id] ?? 0;
      const def = OBJECT_TYPES[t];
      grid.appendChild(
        h(
          'div',
          { class: `gulp-item ${n > 0 ? '' : 'unknown'}`, title: n > 0 ? `${def.name} — eaten ${formatNumber(n)}` : 'Not discovered yet' },
          n > 0 ? thumbInto(h('img', { alt: def.name }), t) : h('div', { class: 'gulp-q' }, '?'),
          h('div', { class: 'gulp-name' }, n > 0 ? def.name : '???'),
          n > 0 ? h('div', { class: 'gulp-count' }, `×${formatNumber(n)}`) : null,
        ),
      );
    }
    root.append(h('div', { class: `gulp-set ${have === ids.length ? 'complete' : ''}` }, h('div', { class: 'gulp-set-title' }, `${SET_NAMES[set]} ${have}/${ids.length}${have === ids.length ? ' ✅' : ''}`), grid));
  }
  return root;
}

function trophiesTab(api: HubApi): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Trophies', `${s.achievements.length}/${ACHIEVEMENTS.length} · each gives +2% cash`));
  const grid = h('div', { class: 'ach-grid' });
  for (const a of ACHIEVEMENTS) {
    const got = s.achievements.includes(a.id);
    grid.appendChild(
      h(
        'div',
        { class: `ach ${got ? 'got' : ''}`, title: a.desc },
        h('div', { class: 'ach-icon' }, got ? a.icon : '🔒'),
        h('div', { class: 'ach-name' }, a.name),
        h('div', { class: 'ach-desc' }, a.desc + (a.skin ? ' (unlocks a skin)' : '')),
      ),
    );
  }
  root.appendChild(grid);
  return root;
}

function skinsTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Hole Skins', 'Cosmetic rim glows and swirl patterns.'));
  for (const sk of SKINS) {
    const owned = s.skins.includes(sk.id);
    const swatch = h('div', { class: 'skin-swatch', style: `--rim:${sk.rim};--glow:${sk.glow};--swirl:${sk.swirlColor}` });
    const c = card({
      icon: swatch,
      title: sk.name,
      desc: owned ? `Swirl: ${sk.swirl}` : sk.achievement ? `Unlock: ${ACHIEVEMENTS.find((a) => a.id === sk.achievement)?.name ?? 'achievement'}` : `${sk.cost} Dark Matter`,
      button: {
        label: () => (s.skins.includes(sk.id) ? 'Equip' : 'Buy'),
        cost: () => (s.skins.includes(sk.id) ? '' : `${sk.cost} DM`),
        can: () => s.skins.includes(sk.id) || (sk.cost > 0 && !sk.achievement && s.dm >= sk.cost),
        onClick: () => (s.skins.includes(sk.id) ? api.equipSkin(sk.id) : api.buySkin(sk.id)),
        doneText: () => (s.skin === sk.id ? 'EQUIPPED' : !s.skins.includes(sk.id) && sk.achievement ? 'LOCKED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  return root;
}

export function renderTab(id: TabId, api: HubApi, cards: Card[]): HTMLElement {
  switch (id) {
    case 'upgrades':
      return upgradesTab(api, cards);
    case 'helpers':
      return helpersTab(api, cards);
    case 'abilities':
      return abilitiesTab(api, cards);
    case 'maps':
      return mapsTab(api, cards);
    case 'singularity':
      return singularityTab(api, cards);
    case 'gulpedia':
      return gulpediaTab(api);
    case 'trophies':
      return trophiesTab(api);
    case 'skins':
      return skinsTab(api, cards);
  }
}
