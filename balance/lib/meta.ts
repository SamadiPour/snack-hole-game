/** Run metadata recorded in every data file and report: git commit and whether the tree was dirty. */
import { execSync } from 'node:child_process';

export function gitCommit(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain -- src', { encoding: 'utf8' }).trim() ? '+dirty-src' : '';
    return sha + dirty;
  } catch {
    return 'unknown';
  }
}

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
