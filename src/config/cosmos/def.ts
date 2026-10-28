import type { ObjTypeDef } from '../objects';

/** A Cosmos prop type: dimensions in game units at scale 1 (see config/objects.ts), set 'cosmos'. */
export const C = (id: string, name: string, w: number, d: number, h: number, extra: Partial<ObjTypeDef> = {}): ObjTypeDef => ({
  id,
  name,
  w,
  d,
  h,
  set: 'cosmos',
  ...extra,
});
