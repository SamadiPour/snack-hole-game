/** Child process for lib/pool.ts: reads {id, job} lines, runs each job, writes {id, result}. */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { RoundModel, type ModelFile } from './lib/model';
import { applyParams } from './lib/params';
import type { Job } from './lib/pool';
import { play } from './lib/progress';
import { runRound } from './lib/round';

const models = new Map<string, RoundModel>();
const load = (path: string) => {
  let m = models.get(path);
  if (!m) models.set(path, (m = new RoundModel(JSON.parse(readFileSync(path, 'utf8')) as ModelFile)));
  return m;
};

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  const { id, job } = JSON.parse(line) as { id: number; job: Job };
  try {
    let result: unknown;
    if (job.kind === 'round') {
      applyParams(job.params);
      result = runRound(job.spec);
    } else result = play(job.spec, job.model ? load(job.model) : null);
    process.stdout.write(`${JSON.stringify({ id, result })}\n`);
  } catch (err) {
    process.stdout.write(`${JSON.stringify({ id, error: err instanceof Error ? err.stack : String(err) })}\n`);
  }
});
