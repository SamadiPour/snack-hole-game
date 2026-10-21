/**
 * Runs Layer A rounds and Layer B playthroughs in parallel child processes (one per core).
 * Children are balance/worker.ts started with the parent's tsx loader, as scripts/sim.ts does for
 * its seeds. Jobs and results travel as JSON lines over stdin / stdout. A WorkerPool can be kept
 * open across many batches (the tuner), so each child loads the round model once.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { PlayResult, PlaySpec } from './progress';
import type { RoundResult, RoundSpec } from './round';

const WORKER = fileURLToPath(new URL('../worker.ts', import.meta.url));

export type Job = { kind: 'round'; spec: RoundSpec; params?: Record<string, number> } | { kind: 'play'; spec: PlaySpec; model?: string };

export interface PoolOptions {
  workers?: number;
  /** Called after each finished job with (done, total). */
  progress?: (done: number, total: number) => void;
}

type Child = ChildProcessByStdio<Writable, Readable, null>;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class WorkerPool {
  private readonly children: Child[] = [];
  private readonly idle: Child[] = [];
  private readonly queue: { id: number; job: Job; p: Pending }[] = [];
  private readonly busy = new Map<number, Pending>();
  private nextId = 0;

  constructor(n = availableParallelism() - 1) {
    for (let c = 0; c < Math.max(1, n); c++) {
      const child = spawn(process.execPath, [...process.execArgv, WORKER], { stdio: ['pipe', 'pipe', 'inherit'] });
      this.children.push(child);
      this.idle.push(child);
      createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
        if (!line.startsWith('{')) return;
        const msg = JSON.parse(line) as { id: number; result?: unknown; error?: string };
        const p = this.busy.get(msg.id);
        this.busy.delete(msg.id);
        this.idle.push(child);
        if (msg.error) p?.reject(new Error(`job ${msg.id}: ${msg.error}`));
        else p?.resolve(msg.result);
        this.pump();
      });
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) for (const p of this.busy.values()) p.reject(new Error(`worker exited with ${code}`));
      });
    }
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const child = this.idle.pop()!;
      const { id, job, p } = this.queue.shift()!;
      this.busy.set(id, p);
      child.stdin.write(`${JSON.stringify({ id, job })}\n`);
    }
  }

  run<R>(jobs: Job[], progress?: (done: number, total: number) => void): Promise<R[]> {
    let done = 0;
    return Promise.all(
      jobs.map(
        (job) =>
          new Promise<R>((resolve, reject) => {
            this.queue.push({
              id: this.nextId++,
              job,
              p: {
                resolve: (v) => {
                  progress?.(++done, jobs.length);
                  resolve(v as R);
                },
                reject,
              },
            });
            this.pump();
          }),
      ),
    );
  }

  close(): void {
    for (const c of this.children) c.stdin.end();
  }
}

export async function runJobs<R>(jobs: Job[], opts: PoolOptions = {}): Promise<R[]> {
  if (!jobs.length) return [];
  const pool = new WorkerPool(Math.min(opts.workers ?? availableParallelism() - 1, jobs.length));
  try {
    return await pool.run<R>(jobs, opts.progress);
  } finally {
    pool.close();
  }
}

export const runRounds = (specs: RoundSpec[], opts?: PoolOptions) => runJobs<RoundResult>(specs.map((spec) => ({ kind: 'round', spec })), opts);
export const runPlays = (specs: PlaySpec[], model: string | undefined, opts?: PoolOptions) =>
  runJobs<PlayResult>(specs.map((spec) => ({ kind: 'play', spec, model })), opts);
