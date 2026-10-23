import type { MapId } from '../config/balance';
import { mapDef, startLevel, type SingularityPreview } from '../core/economy';
import { formatCash, formatDuration, formatNumber, formatPercent, formatRate } from '../core/format';
import type { AbilitySide, Quality, SaveData, Settings } from '../core/save';
import type { EndReason } from '../core/world';
import { h } from './dom';

let layer: HTMLDivElement | null = null;

function host(): HTMLDivElement {
  if (!layer) {
    layer = h('div', { class: 'modal-layer' });
    document.getElementById('ui')!.appendChild(layer);
  }
  return layer;
}

export interface ModalHandle {
  el: HTMLDivElement;
  close: () => void;
}

interface OpenModal {
  box: HTMLDivElement;
  close: () => void;
  dismissable: boolean;
  openedAt: number;
}

/** Open modals, top-most last. Esc and focus trapping act on the top one. */
const stack: OpenModal[] = [];
let modalIds = 0;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
/** A dialog that holds focus itself (results) ignores Enter / gamepad A for this long after opening. */
const BOX_ACTIVATE_DELAY = 600;

/**
 * Enter or gamepad A: presses the focused control, or the dialog's primary button when the dialog
 * box itself has focus (once it has been open for a moment, so a late Dash press cannot skip it).
 */
export function activateFocused(): void {
  const el = document.activeElement as HTMLElement | null;
  const top = stack[stack.length - 1];
  if (top && el === top.box) {
    if (performance.now() - top.openedAt >= BOX_ACTIVATE_DELAY) top.box.querySelector<HTMLElement>('.btn.primary')?.click();
  } else el?.click();
}

// Esc closes the top-most dismissable modal; Tab cycles focus inside it (focus trap).
document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    if (top.dismissable) top.close();
    // Handled here either way, so game shortcuts never act on an Esc meant for a dialog.
    e.preventDefault();
    e.stopImmediatePropagation();
  } else if (e.key === 'Enter' && document.activeElement === top.box) {
    e.preventDefault();
    activateFocused();
  } else if (e.key === 'Tab') {
    const items = [...top.box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = top.box.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }
});

/**
 * Dialog box over a dimmed backdrop. It takes focus (the first `.primary` button, else the first
 * control), traps Tab inside, closes on Esc and backdrop clicks when dismissable, and hands focus
 * back to whatever had it before.
 */
export function modal(content: HTMLElement, opts: { cls?: string; dismissable?: boolean; onClose?: () => void; focusBox?: boolean } = {}): ModalHandle {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: `modal ${opts.cls ?? ''}`, role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, content);
  const title = box.querySelector('h2, .res-title');
  if (title) {
    title.id ||= `modal-title-${++modalIds}`;
    box.setAttribute('aria-labelledby', title.id);
  }
  backdrop.appendChild(box);
  host().appendChild(backdrop);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  requestAnimationFrame(() => backdrop.classList.add('show'));
  const first = opts.focusBox ? null : (box.querySelector<HTMLElement>('.btn.primary') ?? box.querySelector<HTMLElement>(FOCUSABLE));
  (first ?? box).focus({ preventScroll: true });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    // The box goes dead to clicks and focus while it fades, so a double click never runs an action
    // twice. The backdrop stays hit-testable and swallows that click (close() is now a no-op), so it
    // never falls through to the hub's buy buttons underneath.
    box.inert = true;
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 250);
    // Return focus to the opener, or to the dialog now on top.
    const next = stack[stack.length - 1];
    if (next) next.box.focus({ preventScroll: true });
    else if (opener?.isConnected) opener.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
    opts.onClose?.();
  };
  const entry: OpenModal = { box, close, dismissable: opts.dismissable !== false, openedAt: performance.now() };
  stack.push(entry);
  if (opts.dismissable !== false) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  }
  return { el: box, close };
}

/** Message with one button. Not dismissable when it has an action of its own. */
export function infoDialog(title: string, body: string, button = 'OK', onClick?: () => void): ModalHandle {
  const m = modal(
    h(
      'div',
      null,
      h('h2', null, title),
      h('p', { class: 'modal-text' }, body),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            if (onClick) onClick();
            else m.close();
          },
        },
        button,
      ),
    ),
    { dismissable: !onClick },
  );
  return m;
}

export function anyModalOpen(): boolean {
  return !!layer && layer.childElementCount > 0;
}

export interface PauseInfo {
  timeLeft: number;
  cash: number;
  mapName: string;
  /** Casual Tour round: seconds played and share of the map eaten (it has no timer or cash). */
  tour: { played: number; percent: number } | null;
  onSettings: () => void;
  onQuit: () => void;
}

/** Mid-round pause menu. Closing it (button, backdrop, Esc) resumes via `onClose`. */
export function showPause(info: PauseInfo, onClose: () => void): ModalHandle {
  const t = info.tour;
  const m = modal(
    h(
      'div',
      { class: 'pause' },
      h('h2', null, '⏸ Paused'),
      h(
        'p',
        { class: 'modal-text' },
        t
          ? `${info.mapName} · ${formatDuration(t.played)} played · ${formatPercent(t.percent)} eaten`
          : `${info.mapName} · ${formatDuration(Math.ceil(info.timeLeft))} left · ${formatCash(info.cash)} so far`,
      ),
      h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Resume'),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => info.onSettings() }, 'Settings'),
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              m.close();
              info.onQuit();
            },
          },
          t ? 'Leave map' : 'End round',
        ),
      ),
      h(
        'p',
        { class: 'set-hint' },
        t ? 'Press Esc to resume. Leaving keeps your best size and %, but the map starts over next time.' : 'Press Esc to resume. Ending early keeps the cash you ate.',
      ),
    ),
    { cls: 'pause-modal', onClose },
  );
  return m;
}

export function confirmDialog(title: string, body: string, yes: string, onYes: () => void, danger = false): void {
  const m = modal(
    h(
      'div',
      null,
      h('h2', null, title),
      h('p', { class: 'modal-text' }, body),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
        h(
          'button',
          {
            class: `btn ${danger ? 'danger' : 'primary'}`,
            onclick: () => {
              m.close();
              onYes();
            },
          },
          yes,
        ),
      ),
    ),
  );
}

/** How long the Singularity's reset button must be held, and how long a first Enter / gamepad press keeps it armed. */
const HOLD_MS = 1200;
const ARM_MS = 4000;

/**
 * Button that runs `onDone` only after a mouse or touch press held for HOLD_MS. A click that is no
 * pointer press (Enter, Space, gamepad A) arms it instead, and a second one while armed runs it.
 */
function holdButton(label: string, onDone: () => void): HTMLButtonElement {
  const fill = h('span', { class: 'hold-fill' });
  const text = h('span', { class: 'hold-text' }, label);
  let start = 0;
  let raf = 0;
  let armedUntil = 0;
  let timer = 0;
  const say = (msg: string, ms: number) => {
    text.textContent = msg;
    clearTimeout(timer);
    timer = window.setTimeout(() => (text.textContent = label), ms);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    start = 0;
    fill.style.transform = '';
  };
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / HOLD_MS);
    fill.style.transform = `scaleX(${t})`;
    if (t < 1) raf = requestAnimationFrame(tick);
    else {
      stop();
      onDone();
    }
  };
  return h(
    'button',
    {
      class: 'btn danger hold-btn',
      onpointerdown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        stop();
        start = performance.now();
        raf = requestAnimationFrame(tick);
      },
      onpointerup: stop,
      onpointerleave: stop,
      onpointercancel: stop,
      // A long press on touch screens would open the context menu.
      oncontextmenu: (e: Event) => e.preventDefault(),
      onclick: (e: MouseEvent) => {
        // A pointer press let go too early (a held one has already closed the dialog).
        if (e.detail > 0) return say('Keep holding to reset', 1500);
        const now = performance.now();
        if (now < armedUntil) return onDone();
        armedUntil = now + ARM_MS;
        say('Press again to reset', ARM_MS);
      },
    },
    fill,
    text,
  );
}

/**
 * Singularity confirm: a table of what the run has now and what the next one starts with, and a
 * reset button that has to be held, so a stray click cannot cost a whole run.
 */
export function singularityDialog(save: SaveData, p: SingularityPreview, onConfirm: () => void): void {
  const a = p.after;
  const mapName = (id: MapId) => mapDef(id).name;
  // good: the change helps the player (green); false costs them (red); undefined is neither.
  const rows: { label: string; now: string; after: string; good?: boolean }[] = [
    { label: 'Start size', now: String(startLevel(save) + 1), after: String(startLevel(a) + 1), good: false },
    { label: 'Map', now: mapName(save.selectedMap), after: mapName(a.selectedMap), good: false },
    { label: 'Cash', now: formatCash(save.cash), after: formatCash(a.cash), good: false },
    { label: 'Upgrades', now: `${p.upgradeLevels} levels`, after: '0 levels', good: false },
    { label: 'Helpers', now: String(save.helpers), after: String(a.helpers), good: false },
    { label: 'Abilities', now: String(p.abilities.length), after: '0', good: false },
    { label: 'Permanent cash bonus', now: `x${formatRate(p.keptMult)}`, after: `x${formatRate(p.keptMultAfter)}`, good: true },
    { label: 'Dark Matter', now: formatNumber(save.dm), after: formatNumber(a.dm), good: true },
    { label: 'Tier', now: String(save.tier), after: String(a.tier) },
  ];
  const m = modal(
    h(
      'div',
      { class: 'sing-confirm' },
      h('h2', null, `Reset this run for +${formatNumber(p.dm)} Dark Matter?`),
      h(
        'table',
        { class: 'compare' },
        h('thead', null, h('tr', null, h('th', null), h('th', null, 'Now'), h('th', null, 'After'))),
        h(
          'tbody',
          null,
          ...rows
            .filter((r) => r.now !== r.after)
            .map((r) => h('tr', null, h('td', null, r.label), h('td', null, r.now), h('td', { class: r.good === undefined ? '' : r.good ? 'gain' : 'lose' }, r.after))),
        ),
      ),
      h('p', { class: 'modal-text' }, 'Your next run starts small but grows faster: the cash bonus applies to every round.'),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Keep playing'),
        holdButton('Hold to reset', () => {
          m.close();
          onConfirm();
        }),
      ),
    ),
  );
}

export interface RoundResult {
  cash: number;
  helperCash: number;
  /** Paid for finishing early; included in `cash`. */
  timeBonus: number;
  endReason: EndReason;
  eaten: number;
  /** Golden props swallowed. */
  gold: number;
  biggestName: string;
  biggestImg: string;
  percent: number;
  bestPercent: boolean;
  completed: boolean;
  combo: number;
  bestCombo: boolean;
  level: number;
  bestRound: boolean;
  discoveries: { name: string; img: string }[];
  mapName: string;
}

/** End-of-round summary with a counting-up cash total. */
export function showResults(r: RoundResult, onContinue: () => void): void {
  const cashEl = h('div', { class: 'res-cash' }, '$0');
  const stat = (label: string, value: string, isNew = false) =>
    h('div', { class: 'res-stat' }, h('div', { class: 'res-label' }, label), h('div', { class: 'res-value' }, value, isNew ? h('span', { class: 'new-badge' }, 'NEW BEST') : null));
  const disc =
    r.discoveries.length > 0
      ? h(
          'div',
          { class: 'res-disc' },
          h('div', { class: 'res-label' }, `New in Gulpedia (${r.discoveries.length})`),
          h('div', { class: 'res-chips' }, ...r.discoveries.slice(0, 12).map((d) => h('div', { class: 'chip' }, d.img ? h('img', { src: d.img, alt: '' }) : null, d.name))),
        )
      : null;
  const content = h(
    'div',
    { class: 'results' },
    h('div', { class: 'res-title' }, r.endReason === 'cleared' ? '🍽️ MAP CLEARED!' : r.endReason === 'snackedOut' ? '😋 ALL SNACKED OUT!' : "TIME'S UP!"),
    h('div', { class: 'res-sub' }, r.mapName),
    r.endReason === 'snackedOut' ? h('div', { class: 'res-hint' }, 'Everything left is too big. Upgrade Starting Size to come back bigger.') : null,
    cashEl,
    r.timeBonus > 0 ? h('div', { class: 'res-small' }, `incl. ${formatCash(r.timeBonus)} time bonus for finishing early`) : null,
    r.helperCash > 0 ? h('div', { class: 'res-small' }, `incl. ${formatCash(r.helperCash)} from helper holes`) : null,
    h(
      'div',
      { class: 'res-grid' },
      h('div', { class: 'res-stat big' }, h('div', { class: 'res-label' }, 'Biggest bite'), h('div', { class: 'res-biggest' }, r.biggestImg ? h('img', { src: r.biggestImg, alt: '' }) : null, r.biggestName || '—')),
      stat('Map eaten', formatPercent(r.percent), r.bestPercent),
      stat('Best combo', `×${r.combo}`, r.bestCombo),
      stat('Objects', `${formatNumber(r.eaten)}${r.gold > 0 ? ` · ✨${r.gold}` : ''}`),
      stat('Size reached', String(r.level + 1)),
    ),
    r.completed ? h('div', { class: 'res-bonus' }, '+25% permanent cash bonus for clearing this map!') : null,
    disc,
    h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Continue'),
  );
  // Focus stays on the box: Space and gamepad A are Dash, and a late press must not skip the results.
  const m = modal(content, { cls: 'results-modal', dismissable: false, onClose: onContinue, focusBox: true });
  // Count-up animation.
  const start = performance.now();
  const dur = 900;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    cashEl.textContent = `+${formatCash(r.cash * e)}`;
    if (t < 1) requestAnimationFrame(tick);
    else if (r.bestRound) cashEl.appendChild(h('span', { class: 'new-badge' }, 'RECORD'));
  };
  requestAnimationFrame(tick);
}

export interface TourResult {
  mapName: string;
  cleared: boolean;
  /** Seconds played. */
  time: number;
  percent: number;
  level: number;
  combo: number;
  eaten: number;
  biggestName: string;
  biggestImg: string;
  /** Stars on this map now, and how many of them this round earned. */
  stars: number;
  newStars: number;
  /** Size goal (0-based) and par time in seconds: what the first and third star ask for. */
  goal: number;
  par: number;
  bestLevel: boolean;
  bestPercent: boolean;
  bestTime: boolean;
  /** Map this round opened in the Tour. */
  opened: { name: string; icon: string } | null;
  /** The next map, offered as the next stop once it is open. */
  next: { name: string; icon: string } | null;
}

/** End of a casual Tour round: stars, records and the way on to the next map. */
export function showTourResults(r: TourResult, onTour: () => void, onNext: (() => void) | null): void {
  const stat = (label: string, value: string, isNew = false) =>
    h('div', { class: 'res-stat' }, h('div', { class: 'res-label' }, label), h('div', { class: 'res-value' }, value, isNew ? h('span', { class: 'new-badge' }, 'NEW BEST') : null));
  const stars = [0, 1, 2].map((i) => h('span', { class: i >= r.stars ? '' : i >= r.stars - r.newStars ? 'on new' : 'on' }, '★'));
  let after = onTour;
  const content = h(
    'div',
    { class: 'results' },
    h('div', { class: 'res-title' }, r.cleared ? '🍽️ MAP CLEARED!' : '😋 NICE SNACKING!'),
    h('div', { class: 'res-sub' }, `${r.mapName} · Casual Tour`),
    h('div', { class: 'res-stars', role: 'img', 'aria-label': `${r.stars} of 3 stars` }, ...stars),
    h('div', { class: 'res-small' }, `★ Reach size ${r.goal + 1} · ★ Clear the map · ★ Clear it within ${formatDuration(r.par)}`),
    r.opened ? h('div', { class: 'res-bonus' }, `${r.opened.icon} ${r.opened.name} is open!`) : null,
    h(
      'div',
      { class: 'res-grid' },
      h('div', { class: 'res-stat big' }, h('div', { class: 'res-label' }, 'Biggest bite'), h('div', { class: 'res-biggest' }, r.biggestImg ? h('img', { src: r.biggestImg, alt: '' }) : null, r.biggestName || '—')),
      stat(r.cleared ? 'Clear time' : 'Time played', formatDuration(r.time), r.bestTime),
      stat('Map eaten', formatPercent(r.percent), r.bestPercent),
      stat('Size reached', String(r.level + 1), r.bestLevel),
      stat('Best combo', `×${r.combo}`),
      stat('Objects', formatNumber(r.eaten)),
    ),
    onNext && r.next
      ? h(
          'div',
          { class: 'modal-actions' },
          h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Tour'),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                after = onNext;
                m.close();
              },
            },
            `Next: ${r.next.icon} ${r.next.name} ▶`,
          ),
        )
      : h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Continue'),
  );
  // Focus stays on the box, as on the round results: a late Space or gamepad A must not skip it.
  const m = modal(content, { cls: 'results-modal', dismissable: false, onClose: () => after(), focusBox: true });
}

/** The Tour's finish line: every map's goal reached, or every star earned. */
export function showTourComplete(r: { perfect: boolean; stars: number; maxStars: number; cleared: number; maps: number }, onClose: () => void): void {
  const stat = (label: string, value: string) => h('div', { class: 'res-stat' }, h('div', { class: 'res-label' }, label), h('div', { class: 'res-value' }, value));
  const m = modal(
    h(
      'div',
      { class: 'results' },
      h('div', { class: 'offline-icon' }, r.perfect ? '🌟' : '🏆'),
      h('div', { class: 'res-title' }, r.perfect ? 'PERFECT TOUR!' : 'TOUR COMPLETE!'),
      h(
        'p',
        { class: 'modal-text' },
        r.perfect ? 'Every star on every map. There is nothing left to swallow.' : 'From a speck in Sunny Suburb to swallowing the Moon Base.',
      ),
      h('div', { class: 'res-grid' }, stat('Stars', `★ ${r.stars} of ${r.maxStars}`), stat('Maps cleared', `${r.cleared} of ${r.maps}`)),
      r.perfect ? null : h('div', { class: 'res-hint' }, 'Clear every map within par for all the stars.'),
      h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Continue'),
    ),
    { cls: 'results-modal', dismissable: false, onClose, focusBox: true },
  );
}

export function showOffline(seconds: number, credited: number, earned: number, capped: boolean): void {
  const m = modal(
    h(
      'div',
      { class: 'offline' },
      h('div', { class: 'offline-icon' }, '🌙'),
      h('h2', null, 'While you were away'),
      h('p', { class: 'modal-text' }, `You were gone for ${formatDuration(seconds)}. Your hole kept snacking${capped ? ` (capped at ${formatDuration(credited)})` : ''}.`),
      h('div', { class: 'res-cash' }, `+${formatCash(earned)}`),
      h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Collect'),
    ),
  );
}

export interface SettingsApi {
  settings: Settings;
  apply: () => void;
  reset: () => void;
  exportSave: () => string;
  /** False when the text is not a save; otherwise asks to confirm and calls `done` once imported. */
  importSave: (s: string, done: () => void) => boolean;
  /** When the backup (the save replaced by the last import, restore or reset) was made, if any. */
  backupTime: () => number | null;
  restoreBackup: (done: () => void) => void;
}

const QUALITY_LABELS: Record<Quality, string> = { auto: 'Auto', high: 'High', low: 'Low (faster)' };
const SIDE_LABELS: Record<AbilitySide, string> = { right: 'Right', left: 'Left' };

export function showSettings(api: SettingsApi): void {
  const s = api.settings;
  const quality = h('select', { 'aria-label': 'Graphics quality' }, ...Object.entries(QUALITY_LABELS).map(([v, label]) => h('option', { value: v }, label))) as HTMLSelectElement;
  quality.value = s.quality;
  quality.addEventListener('change', () => {
    s.quality = quality.value as Quality;
    api.apply();
  });
  const side = h('select', { 'aria-label': 'Ability buttons' }, ...Object.entries(SIDE_LABELS).map(([v, label]) => h('option', { value: v }, label))) as HTMLSelectElement;
  side.value = s.abilitySide;
  side.addEventListener('change', () => {
    s.abilitySide = side.value as AbilitySide;
    api.apply();
  });
  const backupAt = api.backupTime();
  const toggle = (label: string, key: keyof Settings) => {
    const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
    input.checked = Boolean(s[key]);
    input.addEventListener('change', () => {
      (s as unknown as Record<string, unknown>)[key] = input.checked;
      api.apply();
    });
    return h('label', { class: 'set-row' }, h('span', null, label), input);
  };
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05' }) as HTMLInputElement;
  vol.value = String(s.volume);
  vol.addEventListener('input', () => {
    s.volume = Number(vol.value);
    api.apply();
  });
  const io = h('textarea', { class: 'save-io', rows: '3', placeholder: 'Paste a save here to import' }) as HTMLTextAreaElement;
  const m = modal(
    h(
      'div',
      { class: 'settings' },
      h('h2', null, 'Settings'),
      h('label', { class: 'set-row' }, h('span', null, 'Volume'), vol),
      toggle('Mute all', 'muted'),
      toggle('Music', 'tunes'),
      toggle('Ambient sound', 'music'),
      toggle('Scientific notation', 'scientific'),
      h('label', { class: 'set-row' }, h('span', null, 'Graphics quality'), quality),
      toggle('Shadows', 'shadows'),
      toggle('Screen shake', 'shake'),
      toggle('Floating numbers', 'floaters'),
      // Same query as the CSS that moves the buttons: touch laptops count too.
      matchMedia('(any-pointer: coarse)').matches ? h('label', { class: 'set-row' }, h('span', null, 'Ability buttons'), side) : null,
      h('div', { class: 'set-sub' }, 'Save data'),
      io,
      h(
        'div',
        { class: 'modal-actions wrap' },
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              io.value = api.exportSave();
              io.select();
            },
          },
          'Export',
        ),
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              const ok = api.importSave(io.value.trim(), () => m.close());
              io.classList.toggle('bad', !ok);
              io.setAttribute('aria-invalid', String(!ok));
            },
          },
          'Import',
        ),
        backupAt !== null
          ? h('button', { class: 'btn ghost', title: `Backup from ${new Date(backupAt).toLocaleString()}`, onclick: () => api.restoreBackup(() => m.close()) }, 'Restore backup')
          : null,
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () =>
              confirmDialog(
                'Reset save?',
                'This wipes ALL progress, including Dark Matter, trophies and skins. Restore backup in Settings can bring it back until the next import or reset.',
                'Reset everything',
                () => {
                  m.close();
                  api.reset();
                },
                true,
              ),
          },
          'Reset save',
        ),
      ),
      import.meta.env.DEV ? h('p', { class: 'set-hint' }, 'Tip: press ` (backtick) for the debug panel.') : null,
      h('button', { class: 'btn primary', onclick: () => m.close() }, 'Done'),
    ),
  );
}
