/**
 * Small random forest for the fitted Layer A model. A prediction is a weighted set of training
 * rounds (each tree's leaf, weighted 1 / leaf size / trees), so any statistic of those rounds can
 * be read off it: mean log cash, P(end size >= goal), median time to a level, or one sampled round.
 * Splits minimise the summed variance of the (standardised) targets.
 */
import { Rng } from '../../src/core/rng';

export interface ForestOptions {
  trees?: number;
  minLeaf?: number;
  /** Features tried per split (default: ceil(d / 2)). */
  mtry?: number;
  maxDepth?: number;
  /** Share of rows each tree is grown on (sampled without replacement). */
  sampleFrac?: number;
  seed?: number;
}

/** Flat tree: node i is a split when feat[i] >= 0, else a leaf whose rows are rows[start..end). */
export interface Tree {
  feat: number[];
  thr: number[];
  left: number[];
  right: number[];
  start: number[];
  end: number[];
  rows: number[];
}

export interface Forest {
  trees: Tree[];
  nRows: number;
}

export function fitForest(X: number[][], Y: number[][], opts: ForestOptions = {}): Forest {
  const n = X.length;
  const d = X[0].length;
  const k = Y[0].length;
  const nTrees = opts.trees ?? 60;
  const minLeaf = opts.minLeaf ?? 4;
  const mtry = opts.mtry ?? Math.ceil(d / 2);
  const maxDepth = opts.maxDepth ?? 20;
  const frac = opts.sampleFrac ?? 0.7;
  const rng = new Rng(opts.seed ?? 1);
  // Standardise targets so each counts equally in the split score.
  const mu = Array.from({ length: k }, (_, j) => Y.reduce((a, y) => a + y[j], 0) / n);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(Y.reduce((a, y) => a + (y[j] - mu[j]) ** 2, 0) / n) || 1);
  const Z = Y.map((y) => y.map((v, j) => (v - mu[j]) / sd[j]));

  const trees: Tree[] = [];
  for (let t = 0; t < nTrees; t++) {
    const all = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    const sample = all.slice(0, Math.max(minLeaf * 2, Math.floor(n * frac)));
    const tree: Tree = { feat: [], thr: [], left: [], right: [], start: [], end: [], rows: [] };
    const grow = (idx: number[], depth: number): number => {
      const node = tree.feat.length;
      tree.feat.push(-1);
      tree.thr.push(0);
      tree.left.push(-1);
      tree.right.push(-1);
      tree.start.push(0);
      tree.end.push(0);
      const split = depth < maxDepth && idx.length >= 2 * minLeaf ? bestSplit(idx) : null;
      if (!split) {
        tree.start[node] = tree.rows.length;
        for (const i of idx) tree.rows.push(i);
        tree.end[node] = tree.rows.length;
        return node;
      }
      tree.feat[node] = split.f;
      tree.thr[node] = split.thr;
      const l = idx.filter((i) => X[i][split.f] <= split.thr);
      const r = idx.filter((i) => X[i][split.f] > split.thr);
      tree.left[node] = grow(l, depth + 1);
      tree.right[node] = grow(r, depth + 1);
      return node;
    };
    const bestSplit = (idx: number[]): { f: number; thr: number } | null => {
      const m = idx.length;
      const feats = rng.shuffle(Array.from({ length: d }, (_, i) => i)).slice(0, mtry);
      const totS = new Float64Array(k);
      const totQ = new Float64Array(k);
      for (const i of idx) for (let j = 0; j < k; j++) {
        totS[j] += Z[i][j];
        totQ[j] += Z[i][j] ** 2;
      }
      let parent = 0;
      for (let j = 0; j < k; j++) parent += totQ[j] - (totS[j] * totS[j]) / m;
      let best: { f: number; thr: number } | null = null;
      let bestScore = parent * (1 - 1e-6);
      const ls = new Float64Array(k);
      const lq = new Float64Array(k);
      for (const f of feats) {
        const order = [...idx].sort((a, b) => X[a][f] - X[b][f]);
        ls.fill(0);
        lq.fill(0);
        for (let p = 0; p < m - 1; p++) {
          const i = order[p];
          for (let j = 0; j < k; j++) {
            ls[j] += Z[i][j];
            lq[j] += Z[i][j] ** 2;
          }
          const nl = p + 1;
          const nr = m - nl;
          if (nl < minLeaf || nr < minLeaf) continue;
          const a = X[order[p]][f];
          const b = X[order[p + 1]][f];
          if (a === b) continue;
          let score = 0;
          for (let j = 0; j < k; j++) {
            const rs = totS[j] - ls[j];
            score += lq[j] - (ls[j] * ls[j]) / nl + (totQ[j] - lq[j]) - (rs * rs) / nr;
          }
          if (score < bestScore) {
            bestScore = score;
            best = { f, thr: (a + b) / 2 };
          }
        }
      }
      return best;
    };
    grow(sample, 0);
    trees.push(tree);
  }
  return { trees, nRows: n };
}

/** Training rows and their weights (summing to 1) for a feature vector. */
export function neighbours(forest: Forest, x: number[]): { rows: number[]; w: number[] } {
  const acc = new Map<number, number>();
  const per = 1 / forest.trees.length;
  for (const t of forest.trees) {
    let node = 0;
    while (t.feat[node] >= 0) node = x[t.feat[node]] <= t.thr[node] ? t.left[node] : t.right[node];
    const size = t.end[node] - t.start[node];
    for (let p = t.start[node]; p < t.end[node]; p++) {
      const r = t.rows[p];
      acc.set(r, (acc.get(r) ?? 0) + per / size);
    }
  }
  return { rows: [...acc.keys()], w: [...acc.values()] };
}
