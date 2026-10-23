import { ABILITIES, AUTOSAVE_SECONDS, MAPS, SKINS, type AbilityId, type DmUpgradeId, type MapId, type UpgradeId } from './config/balance';
import { Audio } from './audio/audio';
import { checkAchievements } from './core/achievements';
import { Bot } from './core/bot';
import * as eco from './core/economy';
import { setScientific } from './core/format';
import { generateMap } from './core/mapgen';
import { settleRound, summarizeRound } from './core/round';
import { encodeSaveText, serialize, type SaveData } from './core/save';
import { nextTourMap, openNextTourMap, settleTour, tourRoundConfig } from './core/tour';
import { World } from './core/world';
import { devFlags } from './dev/flags';
import { SaveStore } from './persistence';
import { GameRenderer } from './render/scene';
import { pauseThumbs, prewarmThumbs } from './render/thumbs';
import { RoundFeedback, type GameState } from './round-fx';
import { applySettings, openSettingsDialog } from './settings-flow';
import type { DebugPanel } from './ui/debug';
import { activateFocused, anyModalOpen, infoDialog, showOffline, showPause, singularityDialog, type ModalHandle } from './ui/dialogs';
import { showFatal } from './ui/fatal';
import { Hub } from './ui/hub';
import { Hud } from './ui/hud';
import { Input, PAD } from './ui/input';
import type { HubApi } from './ui/tabs';
import { toast } from './ui/toast';

/** Consecutive failing frames before the game stops and shows an error screen. */
const MAX_FAILED_FRAMES = 30;

export class Game implements HubApi {
  save: SaveData;
  readonly renderer: GameRenderer;
  readonly audio = new Audio();
  readonly input: Input;
  readonly hud: Hud;
  readonly hub: Hub;
  /** Developer panel (backtick); only exists in dev builds. */
  debug: DebugPanel | null = null;
  private state: GameState = 'hub';
  private world: World | null = null;
  private bot = new Bot(0.8);
  /** Time warp (debug panel and smoke tests). */
  warp = 1;
  private saveTimer = 0;
  private last = performance.now();
  private hubRestart = 0;
  private hiddenAt = 0;
  /** Map the current Tour round opened, for its results screen. */
  private tourOpened: MapId | null = null;
  /** Open pause menu during a round; the simulation is frozen while set. */
  private pauseMenu: ModalHandle | null = null;
  private frameMs = 0;
  private simMs = 0;
  private readonly store = new SaveStore();
  /** Per-frame round feedback: sounds, particles, banners, floaters, shake and slow-motion. */
  private readonly fx: RoundFeedback;
  /** Shown while the WebGL context is lost. */
  private gpuNotice: ModalHandle | null = null;
  private failedFrames = 0;
  private crashed = false;

  constructor() {
    this.save = this.store.load();
    setScientific(this.save.settings.scientific);
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ui = document.getElementById('ui')!;
    this.renderer = new GameRenderer(canvas, this.currentSkin());
    this.renderer.setShadows(this.save.settings.shadows);
    this.renderer.setQuality(this.save.settings.quality);
    this.input = new Input(canvas);
    this.hud = new Hud(ui);
    this.hub = new Hub(ui, this);
    const { renderer, audio, hud } = this;
    this.fx = new RoundFeedback({ renderer, audio, hud, save: () => this.save, state: () => this.state, onEnd: () => this.onRoundEnd() });
    // Dev only: the import and the whole panel are dropped from release builds.
    if (import.meta.env.DEV) void import('./ui/debug').then((m) => (this.debug = new m.DebugPanel(ui, m.debugApiFor(this))));

    this.hub.onPlay = () => this.play();
    this.hub.onSettings = () => this.openSettings();
    this.hud.onAbility = (id) => this.useAbility(id);
    this.hud.onPause = () => this.pause();
    this.input.onAbility = (slot) => this.useAbility(ABILITIES[slot].id);
    this.input.onPadButton = (b) => this.onPadButton(b);
    this.input.onKey = (key) => {
      if (key === '`' || key === '~') this.debug?.toggle();
      if (key === 'Escape' && this.state === 'hub' && !anyModalOpen()) this.openSettings();
      // With a dialog open (the pause menu included) dialogs.ts handles Esc and stops it reaching here.
      if (key === 'Escape' && this.state === 'round' && !anyModalOpen()) this.pause();
      if ((key === 'Enter' || key === ' ') && this.state === 'hub' && !anyModalOpen() && document.activeElement === document.body) this.play();
    };

    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // pagehide (not beforeunload) also fires on mobile and keeps the page eligible for bfcache.
    window.addEventListener('pagehide', () => this.persist());
    this.store.watchOtherTabs(() => this.pause(true));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    canvas.addEventListener('webglcontextlost', () => this.onContextLost());
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());
    applySettings(this.save.settings, this.audio, this.renderer);
  }

  // ------------------------------------------------------------------ lifecycle
  start(): void {
    const now = Date.now();
    const off = eco.computeOffline(this.save, now);
    this.enterHub();
    this.creditOffline(off);
    this.store.reportUnreadable();
    this.grantAchievements();
    // Store the credited offline time now, so a quick reload cannot pay it twice.
    this.persist();
    requestAnimationFrame((t) => this.frame(t));
  }

  private onVisibility(): void {
    if (this.crashed) return;
    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.pause(true);
      this.audio.setHidden(true);
      this.persist();
    } else if (this.hiddenAt) {
      this.audio.setHidden(false);
      // Tab was in the background: treat it like offline time (unless another tab took over).
      if (!this.store.stale) this.creditOffline(eco.computeOffline({ ...this.save, lastSeen: this.hiddenAt }, Date.now()));
      this.hiddenAt = 0;
      this.last = performance.now();
    }
  }

  private creditOffline(off: eco.OfflineResult): void {
    if (!(off.earned > 0)) return;
    eco.earn(this.save, off.earned);
    showOffline(off.awaySeconds, off.creditedSeconds, off.earned, off.awaySeconds > off.creditedSeconds);
  }

  /**
   * Saves now; false when this tab has stopped saving or the browser refused the write. A round
   * only counts once it ends, so a tab closed (or killed) mid-round keeps nothing from it.
   */
  persist(): boolean {
    if (this.store.stale) return false;
    this.save.lastSeen = Date.now();
    return this.store.write(this.save);
  }

  private onContextLost(): void {
    this.pause(true);
    this.gpuNotice ??= infoDialog('Graphics paused', 'The graphics card reset. The game will continue as soon as the picture comes back.', 'Reload', () =>
      location.reload(),
    );
  }

  private onContextRestored(): void {
    this.gpuNotice?.close();
    this.gpuNotice = null;
  }

  /**
   * Replaces the whole save (import, restore, reset), keeping the old one as the backup. When the
   * backup cannot be stored nothing is replaced, so the old save is never lost: returns false.
   */
  private replaceSave(next: SaveData): boolean {
    if (!this.store.writeBackup(this.save)) return false;
    this.save = next;
    applySettings(this.save.settings, this.audio, this.renderer);
    this.renderer.setSkin(this.currentSkin());
    this.grantAchievements();
    this.hub.selectTab('upgrades');
    this.enterHub();
    this.persist();
    return true;
  }

  private currentSkin() {
    return SKINS.find((s) => s.id === this.save.skin) ?? SKINS[0];
  }

  // ------------------------------------------------------------------ states
  private setState(st: GameState): void {
    this.state = st;
    document.body.classList.toggle('in-round', st !== 'hub');
    pauseThumbs(st === 'round');
  }

  private enterHub(): void {
    this.resume();
    this.setState('hub');
    this.input.enabled = false;
    this.input.reset();
    this.hud.show(false);
    this.hub.show(true);
    this.startDemo();
    this.audio.setAmbient(this.hubMap());
    this.audio.setMusicMode('hub');
  }

  /** The map PLAY starts: the selected Tour map in Tour mode, else the selected map. */
  private hubMap(): MapId {
    return this.save.tour.active ? this.save.tour.selectedMap : this.save.selectedMap;
  }

  /** Attract mode behind the hub: a bot-driven hole roams the map PLAY starts. */
  private startDemo(): void {
    const mapId = this.hubMap();
    const cfg = this.save.tour.active ? tourRoundConfig(mapId) : eco.buildRoundConfig(this.save, mapId);
    cfg.startLevel = Math.max(5, cfg.startLevel + 3);
    cfg.helpers = 0;
    cfg.cashMult = 0;
    this.world = new World(generateMap(mapId), cfg, { demo: true, seed: devFlags.seed ?? (Date.now() & 0xffff) });
    this.renderer.setWorld(this.world);
    this.hubRestart = 0;
    prewarmThumbs(new Set(this.world.objects.map((o) => o.t)));
  }

  play(): void {
    if (this.state !== 'hub' || anyModalOpen()) return;
    if (this.save.tour.active) this.startTour(this.save.tour.selectedMap);
    else this.begin(() => eco.buildRoundConfig(this.save));
  }

  /** Starts a casual Tour round on an open Tour map, selecting it for the hub's next PLAY. */
  private startTour(id: MapId): void {
    if (!this.save.tour.maps[id]) return;
    this.save.tour.selectedMap = id;
    this.begin(() => tourRoundConfig(id));
  }

  private begin(config: () => eco.RoundConfig): void {
    // A half-started round has no way out, so any error here stops the game with the error screen.
    try {
      this.startRound(config());
    } catch (err) {
      console.error(err);
      this.crash(err);
    }
  }

  private startRound(cfg: eco.RoundConfig): void {
    this.audio.unlock();
    this.audio.click();
    this.setState('round');
    this.hub.show(false);
    this.world = new World(generateMap(cfg.mapId), cfg, { seed: devFlags.seed ?? (Date.now() & 0xffffff) + 1 });
    this.renderer.setWorld(this.world);
    this.hud.setup(this.world);
    this.hud.show(true);
    this.input.enabled = true;
    this.fx.newRound();
    this.tourOpened = null;
    const map = eco.mapDef(cfg.mapId);
    // The Tour can be a player's first round ever: it gets the steering tip then.
    const firstEver = this.save.stats.rounds === 0 && MAPS.every((m) => this.save.tour.bestPct[m.id] === 0);
    const steer = matchMedia('(pointer: coarse)').matches ? '👆 Drag anywhere to steer the hole' : '🖱️ Point where you want to go (or use WASD / arrows)';
    if (cfg.casual) {
      const next = nextTourMap(cfg.mapId);
      this.hud.banner('GO!', `${map.name} · Casual Tour`);
      if (firstEver) this.hud.hint(steer, 9);
      else this.hud.hint(next && !this.save.tour.maps[next.id] ? `🎯 Reach size ${map.goal + 1} to open ${next.name}` : '🍽️ No timer: eat it all at your own pace', 6);
    } else if (firstEver) {
      this.hud.banner('EAT!', 'Swallow anything smaller than the hole');
      this.hud.hint(steer, 9);
    } else {
      this.hud.banner('GO!', map.name);
      if (this.save.stats.rounds === 1) this.hud.hint('Bigger hole = bigger snacks. Keep eating to grow!', 5);
      else if (cfg.abilities.dash.level > 0 && this.save.stats.abilitiesUsed === 0) this.hud.hint('⚡ Press Space or tap the ability button to Dash', 6);
      else this.hud.hideHint();
    }
    this.audio.setAmbient(cfg.mapId);
    this.audio.setMusicMode('round');
  }

  /** Opens the pause menu mid-round; `silent` skips the click (tab hidden, GPU reset, other tab). */
  pause(silent = false): void {
    const w = this.world;
    if (this.state !== 'round' || this.pauseMenu || !w || !w.running) return;
    this.input.enabled = false;
    this.input.reset();
    if (!silent) this.audio.click();
    this.audio.setMusicMode('paused');
    this.pauseMenu = showPause(
      {
        timeLeft: w.timeLeft,
        cash: w.cash,
        mapName: eco.mapDef(w.cfg.mapId).name,
        tour: w.cfg.casual ? { played: w.time, percent: w.percentEaten } : null,
        onSettings: () => this.openSettings(),
        onQuit: () => {
          if (this.world === w && w.running) w.timeLeft = 0;
        },
      },
      () => this.resume(),
    );
  }

  resume(): void {
    const menu = this.pauseMenu;
    if (!menu) return;
    this.pauseMenu = null;
    menu.close();
    if (this.state === 'round') {
      this.input.enabled = true;
      this.audio.setMusicMode('round');
    }
  }

  /** The round's `end` event. A failed end-of-round would leave the game stuck without a results screen. */
  private onRoundEnd(): void {
    if (this.state !== 'round') return;
    try {
      this.endRound();
    } catch (err) {
      console.error(err);
      this.crash(err);
    }
  }

  private endRound(): void {
    const w = this.world!;
    this.setState('results');
    this.input.enabled = false;
    this.input.reset();
    if (w.cfg.casual) {
      const r = settleTour(this.save, summarizeRound(w));
      this.persist();
      const next = nextTourMap(w.cfg.mapId);
      // Finishing the Tour (or its last star) gets its own celebration after the results.
      const then = (go: () => void) => (r.finished || r.perfect ? () => this.fx.tourComplete(r.perfect, go) : go);
      const onNext = next && this.save.tour.maps[next.id] ? then(() => this.startTour(next.id)) : null;
      this.fx.showTourResults(w, r, this.tourOpened ?? r.opened, then(() => this.enterHub()), onNext);
      return;
    }
    const r = settleRound(this.save, summarizeRound(w));
    this.fx.mapsUnlocked(r.unlockedMaps);
    this.grantAchievements();
    this.persist();
    this.fx.showRoundResults(w, r, () => this.enterHub());
  }

  // ------------------------------------------------------------------ frame
  /**
   * The next frame is requested before this one runs, so one exception cannot stop the loop. A
   * frame that keeps failing stops the game with an error screen instead of a silent freeze.
   */
  private frame(now: number): void {
    if (this.crashed) return;
    requestAnimationFrame((t) => this.frame(t));
    try {
      this.tick(now);
      this.failedFrames = 0;
    } catch (err) {
      console.error(err);
      if (++this.failedFrames >= MAX_FAILED_FRAMES) this.crash(err);
    }
  }

  private crash(err: unknown): void {
    this.crashed = true;
    let saved = false;
    try {
      saved = this.persist();
    } catch (e) {
      console.error(e);
    }
    // Nothing here may throw: the frame loop has stopped, so the error screen is the only way out.
    let save = '';
    try {
      this.audio.setHidden(true);
      save = encodeSaveText(serialize(this.save));
    } catch (e) {
      console.error(e);
    }
    const progress = saved ? 'Your progress is saved.' : save ? 'Your latest progress could not be saved: use Copy save to keep it.' : 'Your latest progress could not be saved.';
    showFatal('Snack Hole hit a problem', `The game stopped because of an error: ${err instanceof Error ? err.message : String(err)}. ${progress}`, [
      { label: 'Reload', onClick: () => location.reload() },
      ...(save ? [{ label: 'Copy save', onClick: () => void navigator.clipboard?.writeText(save) }] : []),
    ]);
  }

  private tick(now: number): void {
    const t0 = performance.now();
    // Before reading any state: a button can start a round or pause it.
    this.input.pollGamepad();
    const realDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const paused = this.pauseMenu !== null;
    const timeScale = this.fx.timeScale(realDt, paused);
    const dt = paused ? 0 : realDt * this.warp * timeScale;
    const s = this.save;
    if (!paused) s.stats.playSeconds += realDt;

    const w = this.world;
    if (w && !paused) {
      if (this.state === 'round') w.input = this.input.vector();
      else if (this.state === 'hub') w.input = this.bot.steer(w, dt);
      // Sub-step so time warp stays stable.
      const steps = Math.min(8, Math.max(1, Math.ceil(dt / 0.034)));
      const ts = performance.now();
      for (let i = 0; i < steps; i++) w.step(dt / steps);
      try {
        this.fx.handleEvents(w);
      } finally {
        // Drop the batch even when a handler throws, so one bad event never replays every frame.
        w.events.length = 0;
      }
      if (this.state === 'round' && w.cfg.casual) this.noteTourGoal(w);
      this.simMs += (performance.now() - ts - this.simMs) * 0.05;
      if (this.state === 'hub') {
        this.hubRestart += dt;
        // A big hole can pass 35% within a second; never restart sooner than 45 s.
        if ((w.percentEaten > 0.35 && this.hubRestart > 45) || this.hubRestart > 240) this.startDemo();
      }
    }
    this.renderer.noteFrame(realDt);
    this.renderer.render(paused ? 0 : realDt * timeScale, this.world, this.state === 'hub' ? 'hub' : 'round');
    if (w && this.state !== 'hub') this.hud.update(w, paused ? 0 : realDt);
    this.hub.update(realDt);
    this.audio.endFrame();

    this.saveTimer += realDt;
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.persist();
      this.grantAchievements();
    }
    if (this.debug?.open) this.debug.refresh();
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.05;
  }

  /** Opens the next Tour map the moment the round reaches the goal, so leaving the tab keeps it. */
  private noteTourGoal(w: World): void {
    const opened = openNextTourMap(this.save, w.cfg.mapId, w.main.level);
    if (!opened) return;
    this.tourOpened = opened;
    this.fx.tourOpened(opened);
    this.persist();
  }

  /**
   * Gamepad buttons. Dialogs: A presses the focused button, B or Start closes (like Esc). Hub: A or
   * Start plays. Round: A / RB Dash, X / LB Vortex, Y / RT Mega Mouth, Start pauses.
   */
  private onPadButton(b: number): void {
    if (anyModalOpen()) {
      if (b === PAD.a) activateFocused();
      else if (b === PAD.b || b === PAD.start) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (this.state === 'hub' && (b === PAD.a || b === PAD.start)) this.play();
    else if (this.state === 'round') {
      if (b === PAD.start) this.pause();
      else if (b === PAD.a || b === PAD.rb) this.useAbility('dash');
      else if (b === PAD.x || b === PAD.lb) this.useAbility('vortex');
      else if (b === PAD.y || b === PAD.rt) this.useAbility('mega');
    }
  }

  useAbility(id: AbilityId): void {
    if (this.state !== 'round' || !this.world) return;
    if (!this.world.useAbility(id) && this.world.cfg.abilities[id].level > 0) this.audio.deny();
  }

  // ------------------------------------------------------------------ purchases
  private afterPurchase(ok: boolean, structural = false): void {
    if (ok) {
      this.audio.buy();
      this.grantAchievements();
      if (structural) this.hub.markDirty();
    } else this.audio.deny();
  }

  buyUpgrade(id: UpgradeId): void {
    const before = this.save.upgrades[id];
    const firstEver = Object.values(this.save.upgrades).every((v) => v === 0);
    const got = eco.buyUpgrade(this.save, id, 1);
    this.afterPurchase(got > 0, firstEver || before + got >= eco.upgradeDef(id).max);
  }

  buyHelper(): void {
    this.afterPurchase(eco.buyHelper(this.save), true);
  }

  buyHelperLevel(): void {
    this.afterPurchase(eco.buyHelperLevel(this.save));
  }

  buyAbility(id: AbilityId): void {
    const was = this.save.abilities[id];
    const ok = eco.buyAbility(this.save, id);
    this.afterPurchase(ok, was === 0);
    if (ok && was === 0) toast(`${eco.abilityDef(id).name} unlocked!`, `Press ${eco.abilityDef(id).key} during a round.`, { icon: eco.abilityDef(id).icon });
  }

  selectMap(id: MapId): void {
    if (!this.save.maps[id] || this.state !== 'hub') return;
    this.save.selectedMap = id;
    this.afterHubMapChange();
  }

  selectTourMap(id: MapId): void {
    if (!this.save.tour.maps[id] || this.state !== 'hub' || id === this.save.tour.selectedMap) return;
    this.save.tour.selectedMap = id;
    this.afterHubMapChange();
  }

  /** The Classic / Tour switch above PLAY. */
  setTourMode(on: boolean): void {
    if (this.state !== 'hub' || this.save.tour.active === on) return;
    this.save.tour.active = on;
    this.afterHubMapChange();
  }

  /** The map behind the hub follows what PLAY starts. */
  private afterHubMapChange(): void {
    this.audio.click();
    this.startDemo();
    this.audio.setAmbient(this.hubMap());
    this.hub.markDirty();
  }

  buyDm(id: DmUpgradeId): void {
    this.afterPurchase(eco.buyDmUpgrade(this.save, id), true);
  }

  buySkin(id: string): void {
    const sk = SKINS.find((s) => s.id === id);
    if (!sk || sk.achievement || this.save.skins.includes(id) || this.save.dm < sk.cost) {
      this.audio.deny();
      return;
    }
    this.save.dm -= sk.cost;
    this.save.skins.push(id);
    this.afterPurchase(true, true);
    this.equipSkin(id);
  }

  equipSkin(id: string): void {
    if (!this.save.skins.includes(id)) return;
    this.save.skin = id;
    this.renderer.setSkin(this.currentSkin());
    this.audio.click();
    this.hub.markDirty();
  }

  prestige(): void {
    const preview = eco.singularityPreview(this.save);
    if (preview.dm <= 0) {
      this.audio.deny();
      return;
    }
    singularityDialog(this.save, preview, () => this.doPrestige());
  }

  private doPrestige(): void {
    this.save = eco.applyPrestige(this.save);
    this.audio.singularity();
    this.fx.shake(1.5);
    this.grantAchievements();
    this.persist();
    this.fx.flash();
    this.hub.selectTab('singularity');
    this.enterHub();
  }

  private grantAchievements(): void {
    for (const a of checkAchievements(this.save)) {
      this.audio.achievement();
      toast(`🏆 ${a.name}`, `${a.desc} (+2% cash)${a.skin ? ' · new skin!' : ''}`, { icon: a.icon, kind: 'ach' });
      this.hub.markDirty();
    }
  }

  // ------------------------------------------------------------------ settings
  openSettings(): void {
    openSettingsDialog({
      save: () => this.save,
      onChange: () => {
        applySettings(this.save.settings, this.audio, this.renderer);
        this.hub.markDirty();
      },
      replaceSave: (next) => this.replaceSave(next),
      readBackup: () => this.store.readBackup(),
    });
  }

  // ------------------------------------------------------------------ debug
  /** Read-only snapshot for the debug panel and smoke tests. */
  get debugState() {
    return { state: this.state, world: this.world, save: this.save, frameMs: this.frameMs, simMs: this.simMs, syncMs: this.renderer.syncMs };
  }
}
