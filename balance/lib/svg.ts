/**
 * Static SVG charts for the balance report: line, dot (one row per category) and horizontal bar
 * charts, linear or log axes. Colours are the reference data-viz palette (validated: the first
 * three slots pass all-pairs CVD checks in both modes), defined as CSS variables with a dark-mode
 * override, so the files follow the viewer's theme. Every mark carries a <title> tooltip, and
 * series are named by a legend plus direct labels.
 */

const W = 760;
const PAD = { l: 64, r: 120, t: 46, b: 64 };

const STYLE = `<style>
.c{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--bad:#d03b3b;--good:#0ca30c;}
@media (prefers-color-scheme:dark){.c{--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;}}
.c text{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;fill:var(--ink2);font-size:11px}
.c .t{fill:var(--ink);font-size:14px;font-weight:600}.c .st{fill:var(--muted);font-size:11px}
.c .tick{fill:var(--muted);font-variant-numeric:tabular-nums}.c .lab{fill:var(--ink2);font-size:11px}
.c .g{stroke:var(--grid);stroke-width:1}.c .ax{stroke:var(--axis);stroke-width:1}
</style>`;

export const slot = (i: number) => `var(--s${(i % 6) + 1})`;

export interface Axis {
  label: string;
  log?: boolean;
  min?: number;
  max?: number;
  /** Tick formatter. */
  fmt?: (v: number) => string;
}

export function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${+(v / 1e12).toPrecision(3)}T`;
  if (a >= 1e9) return `${+(v / 1e9).toPrecision(3)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toPrecision(3)}K`;
  if (a >= 10 || a === 0) return `${Math.round(v)}`;
  return `${+v.toPrecision(2)}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Scale {
  map: (v: number) => number;
  ticks: number[];
}

function scale(ax: Axis, lo: number, hi: number, a: number, b: number): Scale {
  if (ax.log) {
    const l0 = Math.floor(Math.log10(Math.max(1e-12, ax.min ?? lo)));
    const l1 = Math.ceil(Math.log10(Math.max(1e-12, ax.max ?? hi)));
    const span = Math.max(1, l1 - l0);
    const every = Math.ceil(span / 7);
    const ticks: number[] = [];
    for (let e = l0; e <= l1; e += every) ticks.push(10 ** e);
    return { map: (v) => a + ((Math.log10(Math.max(v, 10 ** l0)) - l0) / span) * (b - a), ticks };
  }
  const min = ax.min ?? Math.min(0, lo);
  const max = ax.max ?? hi;
  const raw = (max - min) / 6 || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  const t0 = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = t0; t <= max + 1e-9; t += step) ticks.push(+t.toPrecision(12));
  const top = Math.max(max, ticks[ticks.length - 1] ?? max);
  return { map: (v) => a + ((v - min) / (top - min || 1)) * (b - a), ticks };
}

function frame(h: number, title: string, subtitle: string, body: string, legend: { name: string; color: string }[]): string {
  const leg = legend.length >= 2 ? legend.map((s, i) => `<g transform="translate(${PAD.l + i * 150},${h - 8})"><rect width="12" height="4" y="-4" rx="2" fill="${s.color}"/><text x="18">${esc(s.name)}</text></g>`).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" class="c" role="img" aria-label="${esc(title)}">${STYLE}<rect width="${W}" height="${h}" fill="var(--surface)"/>
<text class="t" x="${PAD.l}" y="20">${esc(title)}</text><text class="st" x="${PAD.l}" y="35">${esc(subtitle)}</text>${body}${leg}</svg>`;
}

export interface LineSeries {
  name: string;
  color?: string;
  points: [number, number][];
  dashed?: boolean;
  /** Hide the per-point hover targets (very long series). */
  noDots?: boolean;
}

export interface LineOpts {
  title: string;
  subtitle: string;
  x: Axis;
  y: Axis;
  series: LineSeries[];
  /** Vertical markers (x, label). */
  marks?: { x: number; label: string }[];
  /** Horizontal band (target range) drawn behind the lines. */
  band?: [number, number];
  height?: number;
  /** Draw points only (no connecting line). */
  scatter?: boolean;
}

export function lineChart(o: LineOpts): string {
  const h = o.height ?? 360;
  const all = o.series.flatMap((s) => s.points).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (!o.y.log || y > 0));
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x0 = PAD.l;
  const x1 = W - PAD.r;
  const y0 = h - PAD.b;
  const y1 = PAD.t + 6;
  const sx = scale(o.x, Math.min(...xs), Math.max(...xs), x0, x1);
  const sy = scale(o.y, Math.min(...ys, ...(o.band ?? [])), Math.max(...ys, ...(o.band ?? [])), y0, y1);
  const fx = o.x.fmt ?? fmtNum;
  const fy = o.y.fmt ?? fmtNum;
  let body = '';
  if (o.band) {
    const a = sy.map(o.band[1]);
    const b = sy.map(o.band[0]);
    body += `<rect x="${x0}" y="${Math.min(a, b)}" width="${x1 - x0}" height="${Math.abs(b - a)}" fill="var(--good)" opacity="0.08"><title>target ${fy(o.band[0])}–${fy(o.band[1])}</title></rect>`;
  }
  for (const t of sy.ticks) body += `<line class="g" x1="${x0}" x2="${x1}" y1="${sy.map(t)}" y2="${sy.map(t)}"/><text class="tick" x="${x0 - 6}" y="${sy.map(t) + 4}" text-anchor="end">${fy(t)}</text>`;
  for (const t of sx.ticks) body += `<text class="tick" x="${sx.map(t)}" y="${y0 + 16}" text-anchor="middle">${fx(t)}</text>`;
  body += `<line class="ax" x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}"/>`;
  body += `<text class="lab" x="${(x0 + x1) / 2}" y="${y0 + 32}" text-anchor="middle">${esc(o.x.label)}</text>`;
  body += `<text class="lab" transform="translate(14,${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle">${esc(o.y.label)}</text>`;
  for (const m of o.marks ?? []) {
    const x = sx.map(m.x);
    body += `<line x1="${x}" x2="${x}" y1="${y1}" y2="${y0}" stroke="var(--axis)" stroke-dasharray="3 3"/><text class="tick" x="${x + 3}" y="${y1 + 8}" font-size="10">${esc(m.label)}</text>`;
  }
  const labels: { y: number; text: string; color: string }[] = [];
  o.series.forEach((s, i) => {
    const color = s.color ?? slot(i);
    const pts = s.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (!o.y.log || y > 0)).map(([x, y]) => [sx.map(x), sy.map(y), x, y]);
    if (!pts.length) return;
    if (!o.scatter) body += `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ''} points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}"/>`;
    if (o.scatter || (!s.noDots && pts.length <= 400))
      for (const p of pts)
        body += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${o.scatter ? 3.5 : 6}" fill="${o.scatter ? color : 'transparent'}" ${o.scatter ? 'stroke="var(--surface)" stroke-width="1.5"' : ''}><title>${esc(s.name)}: ${fx(p[2])} → ${fy(p[3])}</title></circle>`;
    const last = pts[pts.length - 1];
    if (o.series.length <= 6 && !o.scatter) labels.push({ y: last[1], text: s.name, color });
  });
  // Direct labels at the right edge, nudged apart.
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
  for (const l of labels) body += `<rect x="${x1 + 6}" y="${l.y - 2}" width="8" height="4" rx="2" fill="${l.color}"/><text x="${x1 + 18}" y="${l.y + 4}" class="lab">${esc(l.text)}</text>`;
  return frame(h, o.title, o.subtitle, body, o.series.map((s, i) => ({ name: s.name, color: s.color ?? slot(i) })));
}

export interface DotOpts {
  title: string;
  subtitle: string;
  x: Axis;
  rows: string[];
  /** One series per entry; values[i] belongs to rows[i] (NaN = none). */
  series: { name: string; values: number[]; color?: string }[];
  band?: [number, number];
  /** Text after a row's label (e.g. "stall"). */
  notes?: string[];
}

export function dotChart(o: DotOpts): string {
  const rowH = 26;
  const left = 170;
  const h = PAD.t + 10 + o.rows.length * rowH + 64;
  const vals = o.series.flatMap((s) => s.values).filter((v) => Number.isFinite(v) && (!o.x.log || v > 0));
  const x0 = left;
  const x1 = W - 40;
  // The band's lower edge joins the scale; an open-ended upper edge is clipped to the plot.
  const sx = scale(o.x, Math.min(...vals, ...(o.band ? [o.band[0]] : [])), Math.max(...vals, ...(o.band ? [o.band[0]] : [])), x0, x1);
  const fx = o.x.fmt ?? fmtNum;
  const top = PAD.t + 10;
  const bottom = top + o.rows.length * rowH;
  let body = '';
  if (o.band) {
    const a = Math.max(x0, sx.map(o.band[0]));
    const b = Math.min(x1, sx.map(o.band[1]));
    if (b > a) body += `<rect x="${a}" y="${top}" width="${b - a}" height="${bottom - top}" fill="var(--good)" opacity="0.08"><title>target ${fx(o.band[0])}–${fx(o.band[1])}</title></rect>`;
  }
  for (const t of sx.ticks) body += `<line class="g" x1="${sx.map(t)}" x2="${sx.map(t)}" y1="${top}" y2="${bottom}"/><text class="tick" x="${sx.map(t)}" y="${bottom + 14}" text-anchor="middle">${fx(t)}</text>`;
  body += `<text class="lab" x="${(x0 + x1) / 2}" y="${bottom + 30}" text-anchor="middle">${esc(o.x.label)}</text>`;
  o.rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    body += `<text class="lab" x="${left - 10}" y="${y + 4}" text-anchor="end">${esc(r)}${o.notes?.[i] ? ` ${esc(o.notes[i])}` : ''}</text>`;
    const present = o.series.map((s) => s.values[i]).filter((v) => Number.isFinite(v));
    if (present.length > 1) body += `<line x1="${sx.map(Math.min(...present))}" x2="${sx.map(Math.max(...present))}" y1="${y}" y2="${y}" stroke="var(--axis)" stroke-width="2"/>`;
    o.series.forEach((s, k) => {
      const v = s.values[i];
      if (!Number.isFinite(v) || (o.x.log && v <= 0)) return;
      body += `<circle cx="${sx.map(v)}" cy="${y}" r="5" fill="${s.color ?? slot(k)}" stroke="var(--surface)" stroke-width="2"><title>${esc(r)} · ${esc(s.name)}: ${fx(v)}</title></circle>`;
    });
  });
  return frame(h, o.title, o.subtitle, body, o.series.map((s, i) => ({ name: s.name, color: s.color ?? slot(i) })));
}

export interface BarOpts {
  title: string;
  subtitle: string;
  x: Axis;
  rows: string[];
  values: number[];
  /** Colour per row (default series 1); e.g. var(--bad) for violations. */
  colors?: string[];
  /** Vertical reference line. */
  ref?: { x: number; label: string };
}

export function barChart(o: BarOpts): string {
  const rowH = 24;
  const left = 170;
  const top = PAD.t + 10;
  const bottom = top + o.rows.length * rowH;
  const h = bottom + 40;
  const vals = o.values.filter(Number.isFinite);
  const x0 = left;
  const x1 = W - 70;
  const sx = scale(o.x, Math.min(0, ...vals), Math.max(...vals, o.ref?.x ?? 0), x0, x1);
  const fx = o.x.fmt ?? fmtNum;
  let body = '';
  for (const t of sx.ticks) body += `<line class="g" x1="${sx.map(t)}" x2="${sx.map(t)}" y1="${top}" y2="${bottom}"/><text class="tick" x="${sx.map(t)}" y="${bottom + 14}" text-anchor="middle">${fx(t)}</text>`;
  body += `<text class="lab" x="${(x0 + x1) / 2}" y="${bottom + 30}" text-anchor="middle">${esc(o.x.label)}</text>`;
  const base = sx.map(o.x.log ? (sx.ticks[0] ?? 1) : 0);
  o.rows.forEach((r, i) => {
    const y = top + i * rowH;
    const v = o.values[i];
    body += `<text class="lab" x="${left - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(r)}</text>`;
    if (!Number.isFinite(v)) {
      body += `<text class="tick" x="${base + 4}" y="${y + rowH / 2 + 4}">n/a</text>`;
      return;
    }
    const xe = sx.map(v);
    body += `<rect x="${Math.min(base, xe)}" y="${y + 5}" width="${Math.max(2, Math.abs(xe - base))}" height="${rowH - 10}" rx="3" fill="${o.colors?.[i] ?? slot(0)}"><title>${esc(r)}: ${fx(v)}</title></rect><text class="tick" x="${Math.max(base, xe) + 5}" y="${y + rowH / 2 + 4}">${fx(v)}</text>`;
  });
  if (o.ref) {
    const x = sx.map(o.ref.x);
    body += `<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${bottom}" stroke="var(--ink2)" stroke-dasharray="4 3"/><text class="tick" x="${x + 4}" y="${top - 6}">${esc(o.ref.label)}</text>`;
  }
  return frame(h, o.title, o.subtitle, body, []);
}
