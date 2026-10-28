const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

let useScientific = false;

export function setScientific(on: boolean): void {
  useScientific = on;
}

function sig3(m: number): string {
  if (m < 10) return m.toFixed(2);
  if (m < 100) return m.toFixed(1);
  return m.toFixed(0);
}

/**
 * Formats a number for display: 999, 1.23K, 45.6M, 7.89B ... Qi, then scientific (1.23e21).
 * Values below 1000 are floored to whole numbers.
 */
export function formatNumber(n: number, sci: boolean = useScientific): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (n < 0) return '-' + formatNumber(-n, sci);
  if (n < 1000) return Math.floor(n).toString();
  let exp = Math.floor(Math.log10(n));
  if (sci || exp >= SUFFIXES.length * 3) {
    let m = n / Math.pow(10, exp);
    if (Number(m.toFixed(2)) >= 10) {
      m /= 10;
      exp += 1;
    }
    return `${m.toFixed(2)}e${exp}`;
  }
  let tier = Math.floor(exp / 3);
  let m = n / Math.pow(1000, tier);
  let s = sig3(m);
  if (Number(s) >= 1000) {
    tier += 1;
    if (tier >= SUFFIXES.length) return formatNumber(n, true);
    m = n / Math.pow(1000, tier);
    s = sig3(m);
  }
  return s + SUFFIXES[tier];
}

/** Like formatNumber but keeps decimals for small values (rates such as 0.42/s). */
export function formatRate(n: number, sci: boolean = useScientific): string {
  if (Number.isFinite(n) && n >= 0 && n < 100) {
    if (n === 0) return '0';
    return n < 10 ? n.toFixed(2) : n.toFixed(1);
  }
  return formatNumber(n, sci);
}

export function formatCash(n: number): string {
  return '$' + formatNumber(n);
}

/** 65 -> "1:05", 3725 -> "1h 02m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export function formatPercent(frac: number, digits = 1): string {
  const p = Math.max(0, frac) * 100;
  if (p >= 99.95 && p < 100) return (99.9).toFixed(digits) + '%';
  return p.toFixed(digits) + '%';
}

const LIGHT_YEAR = 9.4607e15;
const AU = 1.496e11;
/** Length units from the biggest down, with the share of a unit from which each is used. */
const LENGTHS: [number, string, number][] = [
  [LIGHT_YEAR, 'ly', 0.1],
  [AU, 'AU', 0.1],
  [1e3, 'km', 1],
  [1, 'm', 1],
  [1e-2, 'cm', 1],
  [1e-3, 'mm', 1],
  [1e-6, 'µm', 1],
  [1e-9, 'nm', 1],
  [1e-12, 'pm', 1],
  [1e-15, 'fm', 1],
  [1e-18, 'am', 0],
];

/** A real length for Cosmos, from attometres to light years: "3.2 nm", "870 km", "12,000 ly". */
export function formatLength(m: number): string {
  const [u, name] = LENGTHS.find(([unit, , from]) => m >= unit * from) ?? LENGTHS[LENGTHS.length - 1];
  const v = m / u;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${name}`;
}
