/** Standard gamepad mapping: A, B, X, Y, LB, RB, LT, RT, then Start at 9 and the d-pad at 12–15. */
export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;
const STICK_DEADZONE = 0.2;

/**
 * Steering input. Mouse: direction from screen centre to the pointer. Touch: virtual joystick
 * from where the finger went down. Keyboard (WASD / arrows) overrides everything, then a
 * gamepad's left stick or d-pad. Keys are read by physical position (`KeyboardEvent.code`), so
 * WASD works on AZERTY and other layouts too.
 * Output is a world-space vector: screen right = +X, screen up = -Z, magnitude 0..1.
 */
export class Input {
  private keys = new Set<string>();
  private pad: Gamepad | null = null;
  private padDown: boolean[] = [];
  private mouse: { x: number; y: number } | null = null;
  private readonly surface: HTMLElement;
  private touchId: number | null = null;
  private touchOrigin = { x: 0, y: 0 };
  private touchCur = { x: 0, y: 0 };
  private joy: HTMLDivElement;
  private knob: HTMLDivElement;
  enabled = false;
  onAbility: ((slot: number) => void) | null = null;
  onKey: ((key: string) => void) | null = null;
  /** A gamepad button went down (see PAD); fires whether or not steering is enabled. */
  onPadButton: ((button: number) => void) | null = null;

  constructor(surface: HTMLElement) {
    this.surface = surface;
    this.joy = document.createElement('div');
    this.joy.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.joy.appendChild(this.knob);
    document.body.appendChild(this.joy);

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const c = e.code;
      this.keys.add(c);
      if (this.enabled && !e.repeat) {
        if (c === 'Space' || c === 'Digit1' || c === 'Numpad1') this.onAbility?.(0);
        if (c === 'Digit2' || c === 'Numpad2') this.onAbility?.(1);
        if (c === 'Digit3' || c === 'Numpad3') this.onAbility?.(2);
      }
      if (this.enabled && (c === 'Space' || c.startsWith('Arrow'))) e.preventDefault();
      this.onKey?.(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse = null;
    });

    surface.addEventListener('pointermove', (e) => {
      if (this.pointerLocked) {
        // Under pointer lock the cursor is fixed, so build a virtual position from relative moves.
        const m = this.mouse ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        this.mouse = {
          x: Math.min(window.innerWidth, Math.max(0, m.x + e.movementX)),
          y: Math.min(window.innerHeight, Math.max(0, m.y + e.movementY)),
        };
      } else if (e.pointerType === 'mouse') {
        this.mouse = { x: e.clientX, y: e.clientY };
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.pointerLocked) this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    });
    surface.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.pointerLocked) this.mouse = null;
    });
    document.addEventListener('mouseleave', () => {
      if (!this.pointerLocked) this.mouse = null;
    });

    surface.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled || this.touchId !== null) return;
        const t = e.changedTouches[0];
        this.touchId = t.identifier;
        this.touchOrigin = { x: t.clientX, y: t.clientY };
        this.touchCur = { ...this.touchOrigin };
        this.updateJoystick(true);
        e.preventDefault();
      },
      { passive: false },
    );
    surface.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.touchId) {
            this.touchCur = { x: t.clientX, y: t.clientY };
            this.updateJoystick(true);
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId) {
          this.touchId = null;
          this.updateJoystick(false);
        }
      }
    };
    surface.addEventListener('touchend', end);
    surface.addEventListener('touchcancel', end);
  }

  /** True while the pointer is captured by the game surface. */
  get pointerLocked(): boolean {
    return document.pointerLockElement === this.surface;
  }

  /**
   * Captures the mouse on desktop so it cannot leave the game (Esc releases it). Steering then
   * uses relative moves against a virtual cursor clamped to the viewport. Silently does nothing
   * where pointer lock is unsupported or blocked, e.g. an iframe without allow="pointer-lock".
   */
  lock(): void {
    if (this.pointerLocked || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    try {
      const request = this.surface.requestPointerLock() as Promise<void> | void;
      if (request) request.catch(() => {});
    } catch {
      // No pointer lock: the CSS cursor hiding still applies.
    }
  }

  unlock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  private joyRadius(): number {
    return Math.min(70, Math.min(window.innerWidth, window.innerHeight) * 0.14);
  }

  private updateJoystick(show: boolean): void {
    this.joy.style.display = show && this.enabled ? 'block' : 'none';
    if (!show) return;
    const R = this.joyRadius();
    this.joy.style.left = `${this.touchOrigin.x}px`;
    this.joy.style.top = `${this.touchOrigin.y}px`;
    this.joy.style.width = this.joy.style.height = `${R * 2}px`;
    let dx = this.touchCur.x - this.touchOrigin.x;
    let dy = this.touchCur.y - this.touchOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  /** Reads the first connected gamepad; call once per frame before vector(). */
  pollGamepad(): void {
    let pads: readonly (Gamepad | null)[] = [];
    try {
      // Throws SecurityError where a Permissions-Policy blocks gamepads (e.g. an embedding iframe).
      if (typeof navigator.getGamepads === 'function') pads = navigator.getGamepads();
    } catch {
      // No pad.
    }
    this.pad = null;
    for (const p of pads) {
      if (p?.connected) {
        this.pad = p;
        break;
      }
    }
    const buttons = this.pad?.buttons ?? [];
    for (let i = 0; i < buttons.length; i++) {
      const down = buttons[i].pressed;
      if (down && !this.padDown[i]) this.onPadButton?.(i);
      this.padDown[i] = down;
    }
    if (!this.pad) this.padDown.length = 0;
  }

  /** Gamepad steering: d-pad, else the left stick past its deadzone (rescaled to 0..1). */
  private padVector(): { x: number; z: number } | null {
    const p = this.pad;
    if (!p) return null;
    const b = (i: number) => (p.buttons[i]?.pressed ? 1 : 0);
    const dx = b(PAD.right) - b(PAD.left);
    const dz = b(PAD.down) - b(PAD.up);
    if (dx || dz) {
      const m = Math.hypot(dx, dz);
      return { x: dx / m, z: dz / m };
    }
    const ax = p.axes[0] ?? 0;
    const az = p.axes[1] ?? 0;
    const d = Math.hypot(ax, az);
    if (d < STICK_DEADZONE) return null;
    const m = Math.min(1, (d - STICK_DEADZONE) / (1 - STICK_DEADZONE));
    return { x: (ax / d) * m, z: (az / d) * m };
  }

  vector(): { x: number; z: number } {
    if (!this.enabled) return { x: 0, z: 0 };
    let kx = 0;
    let kz = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz += 1;
    if (kx || kz) {
      const m = Math.hypot(kx, kz);
      return { x: kx / m, z: kz / m };
    }
    const pad = this.padVector();
    if (pad) return pad;
    if (this.touchId !== null) {
      const R = this.joyRadius();
      const dx = this.touchCur.x - this.touchOrigin.x;
      const dy = this.touchCur.y - this.touchOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d < R * 0.12) return { x: 0, z: 0 };
      const m = Math.min(1, d / (R * 0.8));
      return { x: (dx / d) * m, z: (dy / d) * m };
    }
    if (this.mouse) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = this.mouse.x - cx;
      const dy = this.mouse.y - cy;
      const d = Math.hypot(dx, dy);
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      if (d < minDim * 0.035) return { x: 0, z: 0 };
      const m = Math.min(1, d / (minDim * 0.24));
      return { x: (dx / d) * m, z: (dy / d) * m };
    }
    return { x: 0, z: 0 };
  }

  reset(): void {
    this.touchId = null;
    this.updateJoystick(false);
  }
}
