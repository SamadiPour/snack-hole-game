/**
 * Prop catalogue. Dimensions are in metres at scale 1: w = length along local +X (forward),
 * d = depth along Z, h = height. Footprint radius, cash value and XP are derived from them so
 * the geometry builders in render/props.ts only have to respect these extents.
 */
import { SIZE, VALUE } from './balance';
import { COSMOS_TYPES } from './cosmos/objects';

export type GulpSet =
  | 'street'
  | 'nature'
  | 'people'
  | 'park'
  | 'vehicles'
  | 'buildings'
  | 'farm'
  | 'harbor'
  | 'airport'
  | 'spaceport'
  | 'moon'
  /** Cosmos props: never in the Gulpedia (Cosmos books nothing into the main game). */
  | 'cosmos';

export interface ObjTypeDef {
  id: string;
  name: string;
  w: number;
  d: number;
  h: number;
  set: GulpSet;
  /** Extra value multiplier for special props. */
  valueMul?: number;
  /** Hovering props sit above the ground (UFO). */
  hover?: number;
  /**
   * Solid body that smaller props must not be placed inside and wanderers walk around:
   * 'box' uses w x d, 'round' a circle of diameter min(w, d). Open shapes (planes, cranes,
   * trees) leave it unset.
   */
  solid?: 'box' | 'round';
  /** Big set piece: swallowing one near your size limit gets the slow-mo celebration. */
  landmark?: boolean;
  /** Shines with its own light (stars, photons): drawn mostly unlit. */
  glow?: boolean;
}

const T = (
  id: string,
  name: string,
  w: number,
  d: number,
  h: number,
  set: GulpSet,
  extra: Partial<ObjTypeDef> = {},
): ObjTypeDef => ({ id, name, w, d, h, set, ...extra });

export const OBJECT_TYPES: ObjTypeDef[] = [
  // Street furniture
  T('cone', 'Traffic Cone', 0.5, 0.5, 0.75, 'street'),
  T('hydrant', 'Fire Hydrant', 0.45, 0.45, 0.85, 'street'),
  T('trash', 'Trash Can', 0.6, 0.6, 1.0, 'street'),
  T('mailbox', 'Mailbox', 0.5, 0.45, 1.25, 'street'),
  T('sign', 'Stop Sign', 0.4, 0.4, 2.4, 'street'),
  T('lamp', 'Street Lamp', 0.4, 0.4, 4.5, 'street'),
  T('bench', 'Bench', 1.8, 0.7, 0.9, 'street'),
  T('barrier', 'Road Barrier', 1.8, 0.4, 1.0, 'street'),
  T('phonebooth', 'Phone Booth', 1.0, 1.0, 2.4, 'street', { solid: 'box' }),
  T('busstop', 'Bus Shelter', 3.2, 1.4, 2.6, 'street'),
  T('kiosk', 'Newsstand', 2.4, 2.0, 2.6, 'street', { solid: 'box' }),

  // Nature
  T('flower', 'Flower Pot', 0.8, 0.8, 0.7, 'nature'),
  T('rock', 'Rock', 0.9, 0.8, 0.6, 'nature'),
  T('bush', 'Bush', 1.2, 1.2, 1.0, 'nature'),
  T('tree', 'Oak Tree', 2.6, 2.6, 5.0, 'nature'),
  T('pine', 'Pine Tree', 2.2, 2.2, 6.0, 'nature'),
  T('palm', 'Palm Tree', 2.4, 2.4, 6.5, 'nature'),

  // People & pets
  T('person', 'Pedestrian', 0.5, 0.45, 1.8, 'people'),
  T('dog', 'Dog', 0.9, 0.35, 0.6, 'people'),
  T('worker', 'Dock Worker', 0.5, 0.45, 1.8, 'people'),
  T('pilot', 'Pilot', 0.5, 0.45, 1.85, 'people'),

  // Park
  T('gnome', 'Garden Gnome', 0.3, 0.3, 0.5, 'park', { valueMul: 3 }),
  T('picnic', 'Picnic Table', 2.0, 1.6, 0.8, 'park'),
  T('slide', 'Slide', 3.2, 1.0, 2.2, 'park'),
  T('swing', 'Swing Set', 3.4, 1.8, 2.4, 'park'),
  T('statue', 'Statue', 2.0, 2.0, 4.5, 'park', { valueMul: 1.5, solid: 'box', landmark: true }),
  T('fountain', 'Fountain', 4.0, 4.0, 2.5, 'park', { solid: 'round', landmark: true }),

  // Vehicles
  T('bike', 'Bicycle', 1.7, 0.5, 1.1, 'vehicles'),
  T('car', 'Car', 4.2, 1.9, 1.5, 'vehicles', { solid: 'box' }),
  T('taxi', 'Taxi', 4.3, 1.9, 1.7, 'vehicles', { solid: 'box' }),
  T('van', 'Van', 4.8, 2.1, 2.3, 'vehicles', { solid: 'box' }),
  T('icecream', 'Ice Cream Truck', 5.0, 2.2, 2.8, 'vehicles', { valueMul: 1.5, solid: 'box', landmark: true }),
  T('truck', 'Box Truck', 8.0, 2.6, 3.4, 'vehicles', { solid: 'box', landmark: true }),
  T('schoolbus', 'School Bus', 9.0, 2.5, 3.0, 'vehicles', { solid: 'box', landmark: true }),
  T('bus', 'City Bus', 10.0, 2.6, 3.2, 'vehicles', { solid: 'box', landmark: true }),

  // Buildings
  T('shed', 'Garden Shed', 2.6, 2.2, 2.4, 'buildings', { solid: 'box' }),
  T('house', 'Cottage', 7.0, 6.5, 6.0, 'buildings', { solid: 'box', landmark: true }),
  T('house2', 'Family House', 8.0, 7.0, 8.5, 'buildings', { solid: 'box', landmark: true }),
  T('shop', 'Corner Shop', 9.0, 7.0, 5.0, 'buildings', { solid: 'box', landmark: true }),
  T('gasstation', 'Gas Station', 12.0, 9.0, 5.0, 'buildings', { solid: 'box', landmark: true }),
  T('apartment', 'Apartment Block', 12.0, 10.0, 18.0, 'buildings', { solid: 'box', landmark: true }),
  T('office', 'Office Tower', 14.0, 14.0, 30.0, 'buildings', { solid: 'box', landmark: true }),
  T('townhall', 'Town Hall', 22.0, 16.0, 18.0, 'buildings', { valueMul: 1.5, solid: 'box', landmark: true }),
  T('skyscraper', 'Skyscraper', 16.0, 16.0, 55.0, 'buildings', { solid: 'box', landmark: true }),
  T('glasstower', 'Glass Tower', 18.0, 18.0, 75.0, 'buildings', { solid: 'box', landmark: true }),
  T('megatower', 'Mega Tower', 26.0, 26.0, 120.0, 'buildings', { valueMul: 1.5, solid: 'box', landmark: true }),

  // Farm
  T('chicken', 'Chicken', 0.5, 0.35, 0.5, 'farm'),
  T('pumpkin', 'Pumpkin', 0.7, 0.7, 0.5, 'farm'),
  T('pig', 'Pig', 1.2, 0.7, 0.8, 'farm'),
  T('sheep', 'Sheep', 1.3, 0.8, 1.0, 'farm'),
  T('fence', 'Fence', 3.0, 0.2, 1.1, 'farm'),
  T('haybale', 'Hay Bale', 1.6, 1.6, 1.2, 'farm'),
  T('scarecrow', 'Scarecrow', 1.6, 0.4, 2.4, 'farm'),
  T('corn', 'Corn Patch', 1.6, 1.6, 2.4, 'farm'),
  T('cow', 'Cow', 2.2, 0.9, 1.6, 'farm'),
  T('horse', 'Horse', 2.2, 0.7, 1.9, 'farm'),
  T('tractor', 'Tractor', 3.6, 2.0, 2.6, 'farm', { solid: 'box' }),
  T('greenhouse', 'Greenhouse', 10.0, 6.0, 4.0, 'farm', { solid: 'box', landmark: true }),
  T('silo', 'Silo', 5.0, 5.0, 14.0, 'farm', { solid: 'round', landmark: true }),
  T('watertower', 'Water Tower', 6.0, 6.0, 16.0, 'farm', { solid: 'round', landmark: true }),
  T('windmill', 'Windmill', 6.0, 6.0, 15.0, 'farm', { solid: 'round', landmark: true }),
  T('farmhouse', 'Farmhouse', 9.0, 8.0, 8.0, 'farm', { solid: 'box', landmark: true }),
  T('barn', 'Big Red Barn', 12.0, 9.0, 9.0, 'farm', { solid: 'box', landmark: true }),

  // Harbor
  T('seagull', 'Seagull', 0.6, 0.4, 0.4, 'harbor'),
  T('barrel', 'Barrel', 0.7, 0.7, 1.0, 'harbor'),
  T('buoy', 'Buoy', 0.8, 0.8, 1.2, 'harbor'),
  T('crate', 'Crate', 1.2, 1.2, 1.2, 'harbor'),
  T('fishstall', 'Fish Stall', 3.0, 2.4, 2.6, 'harbor', { solid: 'box' }),
  T('forklift', 'Forklift', 2.6, 1.3, 2.4, 'harbor'),
  T('boat', 'Rowboat', 5.0, 2.0, 1.8, 'harbor'),
  T('container', 'Shipping Container', 6.0, 2.4, 2.6, 'harbor', { solid: 'box' }),
  T('fishingboat', 'Fishing Boat', 9.0, 3.4, 4.5, 'harbor', { solid: 'box', landmark: true }),
  T('lighthouse', 'Lighthouse', 6.0, 6.0, 22.0, 'harbor', { valueMul: 1.5, solid: 'round', landmark: true }),
  T('yacht', 'Yacht', 14.0, 4.5, 5.0, 'harbor', { solid: 'box', landmark: true }),
  T('crane', 'Gantry Crane', 10.0, 10.0, 28.0, 'harbor', { landmark: true }),
  T('warehouse', 'Warehouse', 20.0, 14.0, 9.0, 'harbor', { solid: 'box', landmark: true }),
  T('cargoship', 'Cargo Ship', 60.0, 12.0, 14.0, 'harbor', { valueMul: 1.5, solid: 'box', landmark: true }),

  // Airport
  T('runwaylight', 'Runway Light', 0.3, 0.3, 0.4, 'airport'),
  T('suitcase', 'Suitcase', 0.6, 0.3, 0.8, 'airport'),
  T('windsock', 'Windsock', 0.4, 0.4, 4.0, 'airport'),
  T('luggagecart', 'Luggage Cart', 2.4, 1.4, 1.2, 'airport'),
  T('stairtruck', 'Stair Truck', 5.0, 2.2, 3.5, 'airport', { solid: 'box' }),
  T('radar', 'Radar Dish', 4.0, 4.0, 6.0, 'airport', { landmark: true }),
  T('fueltruck', 'Fuel Truck', 8.0, 2.6, 3.0, 'airport', { solid: 'box' }),
  T('smallplane', 'Prop Plane', 8.0, 9.0, 2.8, 'airport', { landmark: true }),
  T('controltower', 'Control Tower', 8.0, 8.0, 32.0, 'airport', { solid: 'box', landmark: true }),
  T('hangar', 'Hangar', 24.0, 20.0, 12.0, 'airport', { solid: 'box', landmark: true }),
  T('jet', 'Jet Liner', 30.0, 28.0, 9.0, 'airport', { landmark: true }),
  T('terminal', 'Terminal', 50.0, 22.0, 14.0, 'airport', { valueMul: 1.5, solid: 'box', landmark: true }),
  T('jumbo', 'Jumbo Jet', 45.0, 44.0, 13.0, 'airport', { valueMul: 1.5, landmark: true }),

  // Spaceport
  T('hardhat', 'Hard Hat', 0.45, 0.4, 0.3, 'spaceport'),
  T('engineer', 'Engineer', 0.5, 0.45, 1.8, 'spaceport'),
  T('satellite', 'Satellite', 1.6, 1.0, 1.2, 'spaceport', { valueMul: 1.5 }),
  T('gator', 'Alligator', 2.6, 0.8, 0.5, 'spaceport'),
  T('balloon', 'Weather Balloon', 2.0, 2.0, 6.0, 'spaceport'),
  T('buggy', 'Crew Buggy', 2.6, 1.4, 1.7, 'spaceport'),
  T('rocketengine', 'Rocket Engine', 2.2, 2.2, 3.0, 'spaceport', { valueMul: 1.5 }),
  T('capsule', 'Space Capsule', 3.6, 3.6, 3.2, 'spaceport', { valueMul: 1.5, solid: 'round' }),
  T('astrovan', 'Astrovan', 6.2, 2.4, 3.0, 'spaceport', { solid: 'box' }),
  T('cryotank', 'Fuel Sphere', 9.0, 9.0, 10.0, 'spaceport', { solid: 'round', landmark: true }),
  T('rocketstage', 'Rocket Stage', 20.0, 4.6, 5.0, 'spaceport', { solid: 'box', landmark: true }),
  T('launchtower', 'Launch Tower', 10.0, 10.0, 60.0, 'spaceport', { solid: 'box', landmark: true }),
  T('telescope', 'Radio Telescope', 18.0, 18.0, 20.0, 'spaceport', { landmark: true }),
  T('moonrocket', 'Moon Rocket', 12.0, 12.0, 115.0, 'spaceport', { solid: 'round', landmark: true }),
  T('missioncontrol', 'Mission Control', 34.0, 22.0, 12.0, 'spaceport', { solid: 'box', landmark: true }),
  T('shuttle', 'Space Shuttle', 37.0, 24.0, 17.0, 'spaceport', { landmark: true }),
  T('crawler', 'Crawler', 40.0, 35.0, 8.0, 'spaceport', { solid: 'box', landmark: true }),
  T('rockethall', 'Rocket Hall', 52.0, 42.0, 60.0, 'spaceport', { solid: 'box', landmark: true }),

  // Moon base
  T('moonrock', 'Moon Rock', 1.0, 0.9, 0.6, 'moon'),
  T('flag', 'Flag', 1.0, 0.1, 2.2, 'moon', { valueMul: 2 }),
  T('astronaut', 'Astronaut', 0.7, 0.6, 1.9, 'moon'),
  T('alienplant', 'Alien Plant', 1.2, 1.2, 1.8, 'moon', { valueMul: 1.5 }),
  T('crystal', 'Space Crystal', 2.0, 2.0, 3.5, 'moon', { valueMul: 2 }),
  T('cheese', 'Moon Cheese', 3.0, 3.0, 1.6, 'moon', { valueMul: 3 }),
  T('boulder', 'Boulder', 4.0, 3.5, 3.0, 'moon', { solid: 'round' }),
  T('solarpanel', 'Solar Panel', 4.0, 2.4, 1.6, 'moon'),
  T('rover', 'Moon Rover', 3.4, 2.4, 2.0, 'moon', { solid: 'box' }),
  T('dish', 'Satellite Dish', 4.0, 4.0, 5.0, 'moon'),
  T('lander', 'Lunar Lander', 7.0, 7.0, 6.0, 'moon', { solid: 'round', landmark: true }),
  T('rocket', 'Rocket', 6.0, 6.0, 38.0, 'moon', { valueMul: 1.5, solid: 'round', landmark: true }),
  T('ufo', 'UFO', 10.0, 10.0, 3.0, 'moon', { valueMul: 2.5, hover: 4, landmark: true }),
  T('dome', 'Habitat Dome', 12.0, 12.0, 6.0, 'moon', { solid: 'round', landmark: true }),
  T('bigdome', 'Biodome', 22.0, 22.0, 11.0, 'moon', { solid: 'round', landmark: true }),
  T('moonbase', 'Moon Base HQ', 36.0, 36.0, 16.0, 'moon', { valueMul: 1.5, solid: 'round', landmark: true }),

  ...COSMOS_TYPES,
];

/** The props the Gulpedia lists: every classic set, without the Cosmos props. */
export const GULPEDIA_TYPES: ObjTypeDef[] = OBJECT_TYPES.filter((t) => t.set !== 'cosmos');

export const TYPE_INDEX: Record<string, number> = {};
OBJECT_TYPES.forEach((t, i) => (TYPE_INDEX[t.id] = i));

export function typeId(id: string): number {
  const i = TYPE_INDEX[id];
  if (i === undefined) throw new Error(`Unknown object type ${id}`);
  return i;
}

/** Footprint radius: generous fraction of the half diagonal, at least 12% of the height. */
export function footprintOf(t: ObjTypeDef, scale = 1): number {
  const diag = Math.hypot(t.w, t.d);
  return Math.max(0.425 * diag, 0.12 * t.h) * scale;
}

/** Half extents of a solid prop: box (hw along local X, hd along Z) or round (radius hw). */
export interface SolidShape {
  round: boolean;
  hw: number;
  hd: number;
}

export function solidShape(t: ObjTypeDef, scale = 1): SolidShape | null {
  if (!t.solid) return null;
  if (t.solid === 'round') {
    const r = (Math.min(t.w, t.d) / 2) * scale;
    return { round: true, hw: r, hd: r };
  }
  return { round: false, hw: (t.w / 2) * scale, hd: (t.d / 2) * scale };
}

/** Distance from point (px, pz) to a solid placed at (x, z) with yaw `rot`; 0 when inside. */
export function distToSolid(s: SolidShape, x: number, z: number, rot: number, px: number, pz: number): number {
  const dx = px - x;
  const dz = pz - z;
  if (s.round) return Math.max(0, Math.hypot(dx, dz) - s.hw);
  // Inverse of the render yaw (three.js rotation about +Y).
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  return Math.hypot(Math.max(0, Math.abs(lx) - s.hw), Math.max(0, Math.abs(lz) - s.hd));
}

export function baseValueOf(t: ObjTypeDef, scale = 1): number {
  const f = footprintOf(t, scale);
  const h = t.h * scale;
  return Math.max(1, Math.round(VALUE.coef * Math.pow(f, VALUE.exp) * (1 + h / VALUE.heightDiv) * (t.valueMul ?? 1)));
}

export function xpOf(t: ObjTypeDef, scale = 1): number {
  return Math.pow(footprintOf(t, scale), SIZE.objXpExp);
}

export const SET_NAMES: Record<GulpSet, string> = {
  street: 'Street Furniture',
  nature: 'Nature',
  people: 'People & Pets',
  park: 'Park Life',
  vehicles: 'Vehicles',
  buildings: 'Buildings',
  farm: 'Farmyard',
  harbor: 'Harbor',
  airport: 'Airport',
  spaceport: 'Spaceport',
  moon: 'Moon Base',
  cosmos: 'Cosmos',
};
