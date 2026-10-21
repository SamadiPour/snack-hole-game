import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const hash = (...parts: (string | Buffer)[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex').slice(0, 10);
};

/**
 * PWA build step: writes dist/sw.js from src/service-worker.js with the precache list (every
 * build file plus the public files except music) and versioned cache names. Also fills in the
 * absolute site URL for social preview tags (`SITE_URL`, set by the Pages workflow; local builds
 * fall back to the base path).
 */
function pwa(): Plugin {
  let base = '/';
  return {
    name: 'snack-hole-pwa',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', process.env.SITE_URL ?? base);
    },
    generateBundle(_, bundle) {
      const publicFiles = readdirSync('public', { withFileTypes: true })
        // og.jpg is only for link previews; the game never loads it.
        .filter((f) => f.isFile() && !f.name.startsWith('.') && f.name !== 'og.jpg')
        .map((f) => f.name);
      const precache = ['./', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...publicFiles].sort();
      const template = readFileSync('src/service-worker.js', 'utf8');
      // Build files carry a content hash in their names; public files (icons, manifest) do not.
      const publicContents = publicFiles.sort().map((f) => readFileSync(`public/${f}`));
      const music = readdirSync('public/music')
        .sort()
        .map((f) => readFileSync(`public/music/${f}`));
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__CACHE__', `snack-hole-${hash(template, ...precache, ...publicContents)}`)
          .replace('__MUSIC_CACHE__', `snack-hole-music-${hash(...music)}`)
          .replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

/**
 * Dev server only: appends each round the `?log` calibration logger posts (src/dev/roundLog.ts) as
 * one JSON line to balance/calibration/rounds.jsonl, where the balance tools read it.
 */
function balanceLog(): Plugin {
  return {
    name: 'snack-hole-balance-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__balance/log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const line = JSON.stringify(JSON.parse(body));
            mkdirSync('balance/calibration', { recursive: true });
            appendFileSync('balance/calibration/rounds.jsonl', `${line}\n`);
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [pwa(), balanceLog()],
  // Only this repo's tests (not copies in git worktrees under .claude/).
  test: { include: ['tests/**/*.test.ts'] },
  server: { port: 5101, strictPort: true },
  preview: { port: 5101, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // three.js in its own chunk: game updates do not invalidate the browser's cached copy.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
