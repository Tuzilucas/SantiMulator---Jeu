/**
 * Service worker de SantiMulator — gabarit.
 *
 * Ce fichier n'est pas servi tel quel : au `vite build`, le greffon `pwa`
 * (tools/vite-pwa.mjs) remplace les trois marqueurs ci-dessous et écrit
 * dist/sw.js. La version change dès qu'un fichier du build change, ce qui
 * déclenche la mise à jour et le nettoyage des anciens caches.
 *
 * Stratégies :
 *  - ressources du build (JS, CSS, icônes, manifeste) : précachées à
 *    l'installation, servies depuis le cache (leurs noms sont hachés) ;
 *  - navigation (la page) : réseau d'abord avec délai court, sinon la page
 *    en cache — le jeu se lance hors ligne ;
 *  - polices Google : « stale-while-revalidate » dans un cache à part,
 *    préchauffé à l'installation pour qu'un premier lancement hors ligne
 *    garde la bonne typographie.
 */
const VERSION = 'bcf6e021aa5c';
const PRECACHE_URLS = [
  "./assets/autoscene-CthaICs6.js",
  "./assets/index-EjDv9MAR.js",
  "./assets/index-UI5DOS1X.css",
  "./assets/machinescene-DPJpiseD.js",
  "./assets/music-CW-sv54d.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./index.html",
  "./jaquette-dos.png",
  "./jaquette.png",
  "./manifest.webmanifest"
];
const FONT_CSS_URLS = ["https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=VT323&family=Inter:wght@400;500;600;700&display=swap"];

const PREFIX = 'santimulator-';
const PRECACHE = `${PREFIX}app-${VERSION}`;
const FONTS = `${PREFIX}polices-v1`;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
/** Au-delà, une page réseau trop lente cède la place à la copie en cache. */
const NAV_TIMEOUT_MS = 3000;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const INDEX_URL = scopeUrl('./index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS.map(scopeUrl));
      // Polices : au mieux, sans bloquer l'installation hors ligne.
      await warmFonts().catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, FONTS]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});

/** Réseau d'abord (avec délai), puis la page précachée. */
async function navigate(req) {
  const cache = await caches.open(PRECACHE);
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch {
    const cached = (await cache.match(req, { ignoreSearch: true })) ?? (await cache.match(INDEX_URL));
    return cached ?? Response.error();
  }
}

/** Ressources du build : le cache, sinon le réseau (sans mise en cache des inconnues). */
async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true, cacheName: PRECACHE });
  return cached ?? fetch(req);
}

/** Répond depuis le cache tout de suite et rafraîchit en arrière-plan. */
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(FONTS);
  const cached = await cache.match(req, { ignoreVary: true });
  const refresh = fetch(req)
    .then(async (res) => {
      // Les réponses opaques (feuille CSS chargée sans CORS) sont acceptées.
      if (res.ok || res.type === 'opaque') await cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) ?? Response.error();
}

/** Télécharge les feuilles de polices et les fichiers qu'elles citent. */
async function warmFonts() {
  const cache = await caches.open(FONTS);
  await Promise.all(
    FONT_CSS_URLS.map(async (cssUrl) => {
      const res = await fetch(cssUrl, { mode: 'cors' });
      if (!res.ok) return;
      const css = await res.clone().text();
      await cache.put(cssUrl, res);
      const files = [...css.matchAll(/url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^)'"]+)\1\)/g)].map((m) => m[2]);
      await Promise.all(
        files.map(async (f) => {
          if (await cache.match(f, { ignoreVary: true })) return;
          const r = await fetch(f, { mode: 'cors' });
          if (r.ok) await cache.put(f, r);
        }),
      );
    }),
  );
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('délai dépassé')), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}
