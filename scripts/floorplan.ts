// Top-down floor plans of the maps: the painted ground only, or with every prop's footprint on top
// (solid bodies outlined, open shapes faint, movers pink). Grid lines every 20 m; the ring is the start.
// Usage: npx tsx scripts/floorplan.ts [--props] [--out dir] [mapId...]
// Writes <out>/floor-<id>[-props].png, by default into screenshots/.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { MAPS, type MapId } from '../src/config/balance';
import { OBJECT_TYPES, solidShape, typeId } from '../src/config/objects';
import { generateMap } from '../src/core/mapgen';
import type { MapData, Paint } from '../src/core/mapgen/builder';

const args = process.argv.slice(2);
const props = args.includes('--props');
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : 'screenshots';
const only = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1)) as MapId[];
const ids = only.length ? only : MAPS.map((m) => m.id);
const PX = 1000;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function paintSvg(p: Paint): string {
  if (p.k === 'rect') {
    const rot = p.r ? ` transform="rotate(${(p.r * 180) / Math.PI} ${p.x} ${p.z})"` : '';
    return `<rect x="${p.x - p.w / 2}" y="${p.z - p.d / 2}" width="${p.w}" height="${p.d}" fill="${p.c}"${rot}/>`;
  }
  if (p.k === 'circle') return `<circle cx="${p.x}" cy="${p.z}" r="${p.r}" fill="${p.c}"/>`;
  const r = (p.r0 + p.r1) / 2;
  return `<circle cx="${p.x}" cy="${p.z}" r="${r}" fill="none" stroke="${p.c}" stroke-width="${p.r1 - p.r0}"/>`;
}

function propSvg(m: MapData): string {
  const parts: string[] = [];
  for (const s of m.spawns) {
    const def = OBJECT_TYPES[typeId(s.type)];
    const shape = solidShape(def, s.scale);
    const fill = s.move ? '#ff2d6f' : hex(s.tint === 0xffffff ? 0x222222 : s.tint);
    const stroke = 'stroke="#000" stroke-opacity="0.5" stroke-width="0.15" fill-opacity="0.75"';
    if (shape && !shape.round) {
      // Same rotation convention as distToSolid: +X forward, rot turns it towards -Z.
      const deg = (-s.rot * 180) / Math.PI;
      parts.push(`<rect x="${s.x - shape.hw}" y="${s.z - shape.hd}" width="${shape.hw * 2}" height="${shape.hd * 2}" fill="${fill}" ${stroke} transform="rotate(${deg} ${s.x} ${s.z})"/>`);
    } else if (shape) {
      parts.push(`<circle cx="${s.x}" cy="${s.z}" r="${shape.hw}" fill="${fill}" ${stroke}/>`);
    } else {
      const deg = (-s.rot * 180) / Math.PI;
      const w = def.w * s.scale;
      const d = def.d * s.scale;
      parts.push(`<rect x="${s.x - w / 2}" y="${s.z - d / 2}" width="${w}" height="${d}" fill="${fill}" fill-opacity="0.45" stroke="${fill}" stroke-width="0.2" transform="rotate(${deg} ${s.x} ${s.z})"/>`);
    }
  }
  return parts.join('');
}

function svgOf(m: MapData): string {
  const h = m.half;
  const body = [
    `<rect x="${-h}" y="${-h}" width="${m.size}" height="${m.size}" fill="${m.base}"/>`,
    ...m.paint.map(paintSvg),
    props ? propSvg(m) : '',
    `<circle cx="${m.start.x}" cy="${m.start.z}" r="3" fill="none" stroke="#000" stroke-width="1"/>`,
  ].join('');
  // Grid every 20 m to read coordinates off the image.
  let grid = '';
  for (let v = -Math.floor(h / 20) * 20; v <= h; v += 20) {
    grid += `<line x1="${v}" y1="${-h}" x2="${v}" y2="${h}" stroke="#000" stroke-opacity="${v === 0 ? 0.35 : 0.1}" stroke-width="0.3"/>`;
    grid += `<line x1="${-h}" y1="${v}" x2="${h}" y2="${v}" stroke="#000" stroke-opacity="${v === 0 ? 0.35 : 0.1}" stroke-width="0.3"/>`;
    grid += `<text x="${v + 0.8}" y="${-h + 4}" font-size="3.2" fill="#000" fill-opacity="0.6">${v}</text>`;
    grid += `<text x="${-h + 0.8}" y="${v - 0.8}" font-size="3.2" fill="#000" fill-opacity="0.6">${v}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="${-h} ${-h} ${m.size} ${m.size}">${body}${grid}</svg>`;
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: PX, height: PX } });
for (const id of ids) {
  const m = generateMap(id);
  await page.setContent(`<body style="margin:0">${svgOf(m)}</body>`);
  const path = `${out}/floor-${id}${props ? '-props' : ''}.png`;
  await page.screenshot({ path });
  console.log(path, `${m.size} m`, `${m.paint.length} paint`, `${m.spawns.length} props`);
}
await browser.close();
