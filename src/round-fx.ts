import { MAPS, SIZE, TOUR, type MapId } from './config/balance';
import { OBJECT_TYPES } from './config/objects';
import type { Audio } from './audio/audio';
import * as eco from './core/economy';
import { formatCash } from './core/format';
import type { RoundSettlement } from './core/round';
import type { SaveData } from './core/save';
import { nextTourMap, tourStarTotal, type TourSettlement } from './core/tour';
import type { EventId, World, WObj } from './core/world';
import { reducedMotion } from './render/motion';
import type { GameRenderer } from './render/scene';
import { cachedThumb, thumbFor } from './render/thumbs';
import { showResults, showTourComplete, showTourResults } from './ui/dialogs';
import { h } from './ui/dom';
import type { Hud } from './ui/hud';
import { toast } from './ui/toast';

export type GameState = 'hub' | 'round' | 'results';

/** Seconds of landmark slow-motion. */
const SLOWMO = 1.1;

const EVENT_TEXT: Record<EventId, [string, string]> = {
  rush: ['🚗 RUSH HOUR!', 'Traffic is pouring in'],
  ufo: ['🛸 UFO FLY-BY!', 'Grab the golden drops'],
  stampede: ['🐄 STAMPEDE!', 'Here comes the herd'],
};

export interface FeedbackDeps {
  renderer: GameRenderer;
  audio: Audio;
  hud: Hud;
  /** The current save (replaced by a Singularity, import, restore or reset). */
  save: () => SaveData;
  state: () => GameState;
  /** The round's `end` event. */
  onEnd: () => void;
}

/**
 * Turns the World's events into what the player sees and hears each frame: particles, sounds,
 * banners, floaters, toasts, screen shake and landmark slow-motion. Also presents the end of a
 * round (map unlocks, fanfare, results screen).
 */
export class RoundFeedback {
  private floatersThisFrame = 0;
  /** The combo multiplier reached its cap this streak (plays one flourish, then stays quiet). */
  private comboMaxed = false;
  /** Landmark celebration: slow-motion seconds left, cooldown, and banner hold. */
  private slowmo = 0;
  private landmarkCd = 0;
  private landmarkBannerUntil = 0;
  /** Prop types first swallowed this round (the save's Gulpedia only counts them when it ends). */
  private readonly roundDiscoveries = new Set<number>();

  constructor(private readonly d: FeedbackDeps) {}

  /** A new round starts. */
  newRound(): void {
    this.roundDiscoveries.clear();
  }

  /** Simulation speed for this frame. Landmark slow-motion drops to 30% speed and eases back over SLOWMO seconds. */
  timeScale(realDt: number, paused: boolean): number {
    let timeScale = 1;
    if (this.slowmo > 0 && !paused) {
      this.slowmo = Math.max(0, this.slowmo - realDt);
      const k = 1 - this.slowmo / SLOWMO;
      timeScale = 0.3 + 0.7 * k * k;
    }
    if (this.landmarkCd > 0) this.landmarkCd -= realDt;
    return timeScale;
  }

  /** Screen shake, unless the player turned it off or prefers reduced motion. */
  shake(amount: number): void {
    if (this.d.save().settings.shake && !reducedMotion()) this.d.renderer.shake(amount);
  }

  /** Full-screen white flash (Singularity), unless the player prefers reduced motion. */
  flash(): void {
    if (reducedMotion()) return;
    const el = h('div', { class: 'flash' });
    document.getElementById('ui')!.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  /** Toasts for the maps a finished round unlocked. */
  mapsUnlocked(ids: readonly MapId[]): void {
    for (const id of ids) {
      const m = eco.mapDef(id);
      toast(`${m.name} unlocked!`, m.sizeOffset ? `A bigger world: you start ${m.sizeOffset} sizes smaller here.` : 'Everything is worth more here.', { icon: m.icon });
    }
  }

  /** A Tour round reached its goal and opened the next map. */
  tourOpened(id: MapId): void {
    const m = eco.mapDef(id);
    this.d.hud.banner('NEXT MAP OPEN!', `${m.icon} ${m.name}`);
    toast(`${m.name} is open!`, 'Keep eating, or leave from the pause menu and head there.', { icon: m.icon });
  }

  /** The results screen for a settled Tour round. `opened` is the map the round opened, if any. */
  showTourResults(w: World, r: TourSettlement, opened: MapId | null, onTour: () => void, onNext: (() => void) | null): void {
    // A cleared map already played the big fanfare when it happened.
    if (!r.cleared) this.d.audio.fanfare();
    const m = eco.mapDef(w.cfg.mapId);
    const next = nextTourMap(m.id);
    const biggest = w.biggest;
    const place = (id: MapId) => ({ name: eco.mapDef(id).name, icon: eco.mapDef(id).icon });
    showTourResults(
      {
        mapName: m.name,
        cleared: r.cleared,
        time: w.endedAt || w.time,
        percent: w.percentEaten,
        level: w.main.level,
        combo: w.comboBest,
        eaten: w.eaten,
        biggestName: biggest ? OBJECT_TYPES[biggest.t].name : '',
        biggestImg: biggest ? thumbFor(biggest.t, biggest.tint) : '',
        stars: r.stars,
        newStars: r.stars - r.starsBefore,
        goal: m.goal,
        par: TOUR.par[m.id],
        bestLevel: r.bestLevel,
        bestPercent: r.bestPercent,
        bestTime: r.bestTime,
        opened: opened ? place(opened) : null,
        next: next ? place(next.id) : null,
      },
      onTour,
      onNext,
    );
  }

  /** The celebration for finishing the Tour (`perfect`: for earning every star). */
  tourComplete(perfect: boolean, onClose: () => void): void {
    const t = this.d.save().tour;
    this.d.audio.fanfare(true);
    this.flash();
    this.shake(1);
    showTourComplete(
      { perfect, stars: tourStarTotal(this.d.save()), maxStars: MAPS.length * 3, cleared: MAPS.filter((m) => t.bestClear[m.id] > 0).length, maps: MAPS.length },
      onClose,
    );
  }

  /** The results screen for a settled round, with the end fanfare. */
  showRoundResults(w: World, r: RoundSettlement, onContinue: () => void): void {
    // A cleared map already played the big fanfare when it happened.
    if (!r.cleared) this.d.audio.fanfare();
    const biggest = w.biggest;
    showResults(
      {
        cash: r.total,
        helperCash: w.helperCash,
        timeBonus: w.timeBonus,
        endReason: w.endReason ?? 'timeUp',
        eaten: w.eaten + w.helperEaten,
        gold: w.goldEaten,
        biggestName: biggest ? OBJECT_TYPES[biggest.t].name : '',
        biggestImg: biggest ? thumbFor(biggest.t, biggest.tint) : '',
        percent: w.percentEaten,
        bestPercent: r.bestPercent,
        completed: r.completed,
        combo: w.comboBest,
        bestCombo: r.bestCombo,
        level: w.main.level,
        bestRound: r.bestRound,
        discoveries: r.discovered.map((t) => ({ name: OBJECT_TYPES[t].name, img: thumbFor(t) })),
        mapName: eco.mapDef(w.cfg.mapId).name,
      },
      onContinue,
    );
  }

  handleEvents(w: World): void {
    const { renderer, audio, hud } = this.d;
    const state = this.d.state();
    const inRound = state === 'round' || state === 'results';
    this.floatersThisFrame = 0;
    for (const e of w.events) {
      switch (e.k) {
        case 'eat': {
          const hole = w.holes[e.hole];
          const big = e.o.f >= 3;
          renderer.particles.swallowBurst(hole.x, hole.z, hole.r, e.hole === 0 ? renderer.skinColor : '#a8f0ff', Math.round(3 + e.o.f * 3), big);
          if (!inRound) break;
          audio.gulp(e.o.f);
          if (e.hole === 0) {
            this.onMainEat(w, e.o, e.cash);
            this.comboSound(w, e.combo);
          } else if (this.d.save().settings.floaters && this.floatersThisFrame < 2 && hud.floaterCount < 30) {
            const p = renderer.project(e.o.x, e.o.h, e.o.z);
            if (p) hud.floater(p.x, p.y, `+${formatCash(e.cash)}`, 'helper', 0.75);
          }
          if (big) this.shake(Math.min(1, e.o.f / (w.main.r * 3)));
          break;
        }
        case 'level': {
          if (!inRound) break;
          const hole = w.main;
          renderer.particles.ringBurst(hole.x, hole.z, hole.baseR, renderer.skinColor);
          renderer.pulseHole(1);
          audio.levelUp();
          const unlocked = this.newlyEdible(w, e.level);
          const max = e.level >= w.cfg.maxLevel;
          // Keep a fresh LANDMARK! banner on screen; the level-up shows as a floater instead.
          if (performance.now() < this.landmarkBannerUntil) {
            const p = renderer.project(hole.x, 0, hole.z);
            if (p) hud.floater(p.x, p.y - 90, max ? 'MAX SIZE!' : `SIZE ${e.level + 1}!`, 'combo', 1.2);
          } else if (max) hud.banner('MAX SIZE', `Size ${e.level + 1}: the biggest you get on this map`, 'small');
          else hud.banner(`SIZE ${e.level + 1}`, unlocked ? `Now you can eat: ${unlocked}` : '', 'small');
          break;
        }
        case 'comboEnd':
          this.comboMaxed = false;
          if (inRound && e.n >= 15 && this.d.save().settings.floaters) {
            const p = renderer.project(w.main.x, 0, w.main.z);
            if (p) hud.floater(p.x, p.y - 60, `COMBO ×${e.n}!`, 'combo', 1.3);
          }
          break;
        case 'ability':
          audio.ability(e.id);
          this.d.save().stats.abilitiesUsed++;
          if (e.id === 'mega') renderer.pulseHole(1.5);
          if (e.id === 'dash') {
            renderer.dashBurst(w);
            this.shake(0.35);
          }
          break;
        case 'event':
          if (inRound && e.on) {
            audio.eventStinger(e.id);
            const [title, sub] = EVENT_TEXT[e.id];
            hud.banner(title, sub);
          }
          break;
        case 'tick':
          audio.tick(e.s);
          break;
        case 'timeUp':
          hud.hideHint();
          // A casual round only stops this way when the player leaves the map.
          if (w.cfg.casual) break;
          audio.whistle();
          hud.banner("TIME'S UP!", '', 'big');
          break;
        case 'cleared':
          hud.hideHint();
          audio.fanfare(true);
          this.shake(1);
          hud.banner('MAP CLEARED!', 'You ate absolutely everything', 'big');
          break;
        case 'snackedOut':
          hud.hideHint();
          audio.whistle();
          hud.banner('ALL SNACKED OUT!', `Nothing left your size${e.bonusFrac > 0 ? ` · Time bonus +${Math.round(e.bonusFrac * 100)}%` : ''}`, 'big');
          break;
        case 'end':
          this.d.onEnd();
          break;
      }
    }
  }

  /**
   * Combo chimes climb every 5 swallows; past the top of the scale only every 25th rings, and
   * once the multiplier is capped one flourish plays and the streak goes quiet.
   */
  private comboSound(w: World, combo: number): void {
    if (combo <= 1) this.comboMaxed = false;
    if (this.comboMaxed) return;
    if (combo > 1 && w.comboMultiplier >= w.cfg.comboCap - 1e-9) {
      this.comboMaxed = true;
      this.d.audio.comboMax();
      if (this.d.save().settings.floaters) {
        const p = this.d.renderer.project(w.main.x, 0, w.main.z);
        if (p) this.d.hud.floater(p.x, p.y - 70, 'MAX COMBO!', 'combo', 1.2);
      }
      return;
    }
    if (combo < 5 || combo % 5 !== 0) return;
    const step = combo / 5;
    if (step <= 10 || combo % 25 === 0) this.d.audio.combo(Math.min(step, 10));
  }

  private onMainEat(w: World, o: WObj, cash: number): void {
    const { renderer, audio, hud } = this.d;
    const s = this.d.save();
    const t = o.t;
    const f = o.f;
    const casual = w.cfg.casual;
    if (o.gold) {
      audio.goldDing();
      renderer.particles.swallowBurst(w.main.x, w.main.z, w.main.r, '#ffd23d', 16, true);
    }
    // Casual rounds pay no cash, so they show no cash floaters.
    if (!casual && s.settings.floaters && (o.gold || (this.floatersThisFrame < 4 && hud.floaterCount < 40))) {
      this.floatersThisFrame++;
      const p = renderer.project(o.x, Math.min(o.h, 4), o.z);
      if (p) {
        const scale = Math.min(2.2, 0.85 + Math.log10(1 + f) * 0.9) * (o.gold ? 1.25 : 1);
        hud.floater(p.x, p.y, `${o.gold ? '✨ ' : ''}+${formatCash(cash)}`, o.gold ? 'gold' : w.combo >= 25 ? 'hot' : '', scale);
      }
    }
    this.maybeLandmark(w, o, cash);
    if (!casual) hud.bumpCash();
    renderer.pulseHole(Math.min(1, 0.25 + f / w.main.r));
    const id = OBJECT_TYPES[t].id;
    if (casual) this.roundDiscoveries.add(t);
    else if (!s.gulpedia[id] && !this.roundDiscoveries.has(t)) {
      this.roundDiscoveries.add(t);
      toast(`New: ${OBJECT_TYPES[t].name}`, 'Added to the Gulpedia', { img: cachedThumb(t) || undefined, icon: '✨', kind: 'gulp', ms: 2200 });
    }
  }

  /**
   * Landmarks get two tiers. The first one of a kind ever (new to the Gulpedia) gets the full
   * moment: slow-motion, camera pull-back, dust, rumble and a banner. Later ones near your size
   * limit get a light version (dust, rumble, shake) that does not interrupt play. Casual rounds
   * book nothing into the Gulpedia, so there the first of a kind in the round gets the full moment.
   */
  private maybeLandmark(w: World, o: WObj, cash: number): void {
    const { renderer, audio } = this.d;
    const def = OBJECT_TYPES[o.t];
    if (!def.landmark || this.d.state() !== 'round') return;
    const firstEver = (w.cfg.casual || !this.d.save().gulpedia[def.id]) && !this.roundDiscoveries.has(o.t);
    if (firstEver) {
      this.landmarkCd = 2.5;
      this.slowmo = SLOWMO;
      this.landmarkBannerUntil = performance.now() + 1500;
      renderer.landmarkBurst(w, o.f, true);
      this.shake(0.9);
      audio.landmark(o.f, true);
      this.d.hud.banner('NEW LANDMARK!', w.cfg.casual ? def.name : `${o.gold ? '✨ Golden ' : ''}${def.name} · +${formatCash(cash)}`);
      return;
    }
    if (this.landmarkCd > 0 || o.f < 0.55 * SIZE.fit * w.main.r) return;
    this.landmarkCd = 2.5;
    renderer.landmarkBurst(w, o.f, false);
    this.shake(0.5);
    audio.landmark(o.f, false);
  }

  /** Names of prop types that just became edible at this level (for the level-up banner). */
  private newlyEdible(w: World, level: number): string {
    const fitNow = SIZE.fit * eco.radiusForLevel(level);
    const fitBefore = SIZE.fit * eco.radiusForLevel(level - 1);
    const names = new Set<string>();
    for (const o of w.objects) {
      if (o.event) continue;
      if (o.f <= fitNow && o.f > fitBefore) names.add(OBJECT_TYPES[o.t].name);
    }
    return [...names].slice(0, 3).join(', ');
  }
}
