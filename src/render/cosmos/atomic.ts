import type * as THREE from 'three';
import { G, bond, nucleus, shells, type Shell } from './kit';

const RING = 0x7fb8ff;
const OXY = 0xff4d4d;
const HYD = 0xf4f7ff;
const CARB = 0x3a3f4a;

/** A Bohr-model atom of radius `R` (outer shell) resting on the ground. */
function atom(R: number, p: number, n: number, nr: number, list: Shell[], ring = RING, proton?: number, neutron?: number): THREE.BufferGeometry {
  const g = new G();
  nucleus(g, p, n, nr, 0, R, 0, proton, neutron);
  shells(g, list, 0, R, 0, ring);
  return g.build();
}

export const ATOMIC_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  alpha: () => {
    const g = new G();
    nucleus(g, 2, 2, 0.34, 0, 0.62, 0);
    return g.build();
  },
  hydrogen: () => atom(1.15, 1, 0, 0.26, [{ R: 1.1, electrons: 1, rx: 0.25, rz: 0.1 }], 0xa8d4ff),
  helium: () =>
    atom(1.25, 2, 2, 0.22, [
      { R: 1.2, electrons: 2, rx: 0.2, rz: 0.15 },
      { R: 1.2, electrons: 0, rx: 0.2, rz: -0.6 },
    ], 0xc2b0ff),
  carbon: () =>
    atom(1.55, 6, 6, 0.17, [
      { R: 0.85, electrons: 2, rx: 0.3, rz: 0.4 },
      { R: 1.5, electrons: 4, rx: 0.15, rz: -0.2 },
    ], 0x9fe0a8),
  oxygen: () =>
    atom(1.65, 8, 8, 0.16, [
      { R: 0.85, electrons: 2, rx: -0.3, rz: 0.35 },
      { R: 1.6, electrons: 6, rx: 0.2, rz: 0.15 },
    ], 0xffa3a3),
  iron: () =>
    atom(2.05, 13, 15, 0.16, [
      { R: 0.75, electrons: 2, rx: 0.4, rz: 0.2 },
      { R: 1.15, electrons: 8, rx: -0.25, rz: 0.3 },
      { R: 1.6, electrons: 14, rx: 0.2, rz: -0.25 },
      { R: 2.0, electrons: 2, rx: 0.1, rz: 0.1 },
    ], 0xd0a080, 0xff6a4d, 0x9aa3b5),
  goldatom: () => {
    const g = new G();
    const R = 2.35;
    nucleus(g, 20, 24, 0.17, 0, R, 0, 0xffd23d, 0xe0a820);
    shells(g, [
      { R: 0.8, electrons: 2, rx: 0.35, rz: 0.25 },
      { R: 1.15, electrons: 8, rx: -0.3, rz: 0.2 },
      { R: 1.5, electrons: 18, rx: 0.2, rz: -0.3 },
      { R: 1.85, electrons: 18, rx: -0.15, rz: -0.1 },
      { R: 2.3, electrons: 1, rx: 0.12, rz: 0.2 },
    ], 0, R, 0, 0xffe27a, 0xfff6c0, 0.13);
    return g.build();
  },
  water: () => {
    const g = new G();
    // Oxygen with two hydrogens at 104.5 degrees.
    const o: [number, number, number] = [0, 0.62, 0];
    const half = (104.5 / 2) * (Math.PI / 180);
    const h1: [number, number, number] = [Math.cos(half) * 0.72, 0.62 + Math.sin(half) * 0.4, Math.sin(half) * 0.25];
    const h2: [number, number, number] = [-Math.cos(half) * 0.72, 0.62 + Math.sin(half) * 0.4, Math.sin(half) * 0.25];
    g.sphere(0.6, o[0], o[1], o[2], OXY, 14, 9);
    g.sphere(0.36, h1[0], h1[1], h1[2], HYD, 12, 8).sphere(0.36, h2[0], h2[1], h2[2], HYD, 12, 8);
    return g.build();
  },
  o2: () => {
    const g = new G();
    g.sphere(0.55, -0.55, 0.55, 0, OXY, 14, 9).sphere(0.55, 0.55, 0.55, 0, OXY, 14, 9);
    bond(g, [-0.3, 0.55, 0.12], [0.3, 0.55, 0.12], 0.08, 0xffd0d0);
    return g.build();
  },
  co2: () => {
    const g = new G();
    g.sphere(0.5, 0, 0.5, 0, CARB, 14, 9);
    g.sphere(0.48, -1.0, 0.5, 0, OXY, 14, 9).sphere(0.48, 1.0, 0.5, 0, OXY, 14, 9);
    bond(g, [-0.6, 0.5, 0], [0.6, 0.5, 0], 0.09, 0xd8d8e0);
    return g.build();
  },
};
