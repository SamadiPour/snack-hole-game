/**
 * CMA-ES (Hansen's (mu/mu_w, lambda) variant with rank-one and rank-mu updates) for minimising a
 * noisy loss over a box. Works in a normalised space; the caller maps [0, 1] to parameter ranges.
 * Out-of-box candidates are evaluated at the clipped point plus a quadratic penalty.
 */
import { Rng } from '../../src/core/rng';

export interface CmaState {
  n: number;
  lambda: number;
  mean: number[];
  sigma: number;
  gen: number;
}

export class CMAES {
  readonly n: number;
  readonly lambda: number;
  readonly mu: number;
  private readonly w: number[];
  private readonly mueff: number;
  private readonly cc: number;
  private readonly cs: number;
  private readonly c1: number;
  private readonly cmu: number;
  private readonly ds: number;
  private readonly chiN: number;
  mean: number[];
  sigma: number;
  private C: number[][];
  private B: number[][];
  private D: number[];
  private pc: number[];
  private ps: number[];
  gen = 0;
  private readonly rng: Rng;

  constructor(x0: number[], sigma0: number, opts: { lambda?: number; seed?: number } = {}) {
    const n = x0.length;
    this.n = n;
    this.lambda = opts.lambda ?? 4 + Math.floor(3 * Math.log(n));
    this.mu = Math.floor(this.lambda / 2);
    const raw = Array.from({ length: this.mu }, (_, i) => Math.log(this.mu + 0.5) - Math.log(i + 1));
    const sum = raw.reduce((a, b) => a + b, 0);
    this.w = raw.map((x) => x / sum);
    this.mueff = 1 / this.w.reduce((a, b) => a + b * b, 0);
    this.cc = (4 + this.mueff / n) / (n + 4 + (2 * this.mueff) / n);
    this.cs = (this.mueff + 2) / (n + this.mueff + 5);
    this.c1 = 2 / ((n + 1.3) ** 2 + this.mueff);
    this.cmu = Math.min(1 - this.c1, (2 * (this.mueff - 2 + 1 / this.mueff)) / ((n + 2) ** 2 + this.mueff));
    this.ds = 1 + 2 * Math.max(0, Math.sqrt((this.mueff - 1) / (n + 1)) - 1) + this.cs;
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.mean = [...x0];
    this.sigma = sigma0;
    this.C = eye(n);
    this.B = eye(n);
    this.D = Array(n).fill(1);
    this.pc = Array(n).fill(0);
    this.ps = Array(n).fill(0);
    this.rng = new Rng(opts.seed ?? 1);
  }

  private gauss(): number {
    const u = Math.max(1e-12, this.rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng.next());
  }

  /** Draws lambda candidates (unclipped). */
  ask(): number[][] {
    const out: number[][] = [];
    for (let k = 0; k < this.lambda; k++) {
      const z = Array.from({ length: this.n }, () => this.gauss());
      const y = this.B.map((row) => row.reduce((a, b, j) => a + b * this.D[j] * z[j], 0));
      out.push(this.mean.map((m, i) => m + this.sigma * y[i]));
    }
    return out;
  }

  /** Updates from candidates and their losses (lower is better). */
  tell(xs: number[][], fs: number[]): void {
    const n = this.n;
    const order = fs.map((f, i) => [f, i] as [number, number]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    const old = this.mean;
    const ys = order.slice(0, this.mu).map((i) => xs[i].map((x, j) => (x - old[j]) / this.sigma));
    const yw = Array(n).fill(0);
    ys.forEach((y, k) => y.forEach((v, j) => (yw[j] += this.w[k] * v)));
    this.mean = old.map((m, j) => m + this.sigma * yw[j]);
    // C^-1/2 yw = B D^-1 B' yw
    const bt = this.B[0].map((_, j) => this.B.reduce((a, row, i) => a + row[j] * yw[i], 0));
    const invsq = this.B.map((row) => row.reduce((a, b, j) => a + (b * bt[j]) / this.D[j], 0));
    const csn = Math.sqrt(this.cs * (2 - this.cs) * this.mueff);
    this.ps = this.ps.map((p, j) => (1 - this.cs) * p + csn * invsq[j]);
    const psNorm = Math.hypot(...this.ps);
    this.gen++;
    const hs = psNorm / Math.sqrt(1 - (1 - this.cs) ** (2 * this.gen)) < (1.4 + 2 / (n + 1)) * this.chiN ? 1 : 0;
    const ccn = Math.sqrt(this.cc * (2 - this.cc) * this.mueff);
    this.pc = this.pc.map((p, j) => (1 - this.cc) * p + hs * ccn * yw[j]);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let rmu = 0;
        ys.forEach((y, k) => (rmu += this.w[k] * y[i] * y[j]));
        this.C[i][j] = (1 - this.c1 - this.cmu) * this.C[i][j] + this.c1 * (this.pc[i] * this.pc[j] + (1 - hs) * this.cc * (2 - this.cc) * this.C[i][j]) + this.cmu * rmu;
      }
    this.sigma *= Math.exp((this.cs / this.ds) * (psNorm / this.chiN - 1));
    const { vectors, values } = jacobiEigen(this.C);
    this.B = vectors;
    this.D = values.map((v) => Math.sqrt(Math.max(1e-20, v)));
  }
}

function eye(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

/** Eigen-decomposition of a symmetric matrix (cyclic Jacobi). Columns of `vectors` are eigenvectors. */
export function jacobiEigen(A0: number[][]): { values: number[]; vectors: number[][] } {
  const n = A0.length;
  const A = A0.map((r) => [...r]);
  const V = eye(n);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-30) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p];
          const akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k];
          const aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}
