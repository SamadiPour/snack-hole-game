/*
 * Snack Hole service worker: makes the game installable and playable offline.
 * Template: vite.config.ts fills in the cache names and the precache list at build time and
 * writes the result to dist/sw.js. Dev builds never register it (src/pwa.ts).
 *
 * - The page (navigations) is network-first, so a new deploy shows up on the next load and the
 *   cached copy only serves when offline.
 * - Hashed build files and the music never change under the same URL, so they are cache-first.
 *   Music is cached on first play (not precached: 6.2 MB) in its own cache, named after a hash of
 *   the music files, so it survives game updates until a track changes.
 */
const CACHE = '__CACHE__';
const MUSIC_CACHE = '__MUSIC_CACHE__';
const PRECACHE = __PRECACHE__;
const scope = self.registration.scope;
const page = new URL('./', scope).href;
// Module scripts are CORS requests and servers often send `Vary: Origin` / `Accept-Encoding`, so
// match by URL alone or nothing precached would ever be found.
const match = (req) => caches.match(req, { ignoreVary: true, ignoreSearch: req === page });

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: 'reload' skips the HTTP cache, so a deploy within its max-age never stores old files.
      .then((c) => c.addAll(PRECACHE.map((p) => new Request(new URL(p, scope).href, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('snack-hole-') && k !== CACHE && k !== MUSIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(scope)) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only the game page itself becomes the offline page (not an icon or the manifest opened in a tab).
          const isPage = new URL(req.url).pathname === new URL(page).pathname && (res.headers.get('content-type') ?? '').includes('text/html');
          if (res.ok && isPage) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(page, copy));
          }
          return res;
        })
        .catch(() => match(page).then((hit) => hit ?? Response.error())),
    );
    return;
  }
  const path = new URL(req.url).pathname;
  const music = path.includes('/music/');
  if (!music && !path.includes('/assets/') && !PRECACHE.some((p) => new URL(p, scope).pathname === path)) return;
  event.respondWith(
    match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(music ? MUSIC_CACHE : CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
