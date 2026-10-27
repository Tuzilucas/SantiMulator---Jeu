/**
 * Service worker d’An’doSim — gabarit.
 *
 * Ce fichier n'est pas servi tel quel : au `vite build`, le greffon `pwa`
 * (tools/vite-pwa.mjs) remplace les marqueurs ci-dessous et écrit dist/sw.js.
 * La version change dès qu'un fichier du build change, ce qui déclenche la
 * mise à jour et le nettoyage des anciens caches.
 *
 * Stratégies :
 *  - ressources du build (JS, CSS, polices, icônes, manifeste) : précachées à
 *    l'installation, servies depuis le cache (leurs noms sont hachés) ;
 *  - navigation (la page) : la page de la version active, en cache — le jeu
 *    se lance hors ligne, et une version ne change qu'à son activation.
 * Rien n'est chargé d'un autre site (TEC-0-03) : les polices font partie du build.
 *
 * Mise à jour (TEC-0-39) : une nouvelle version s'installe en arrière-plan puis
 * **attend**. Elle ne prend la main que lorsque la page le lui demande
 * (message `activer`, envoyé par src/pwa.ts à l'écran titre, aucune journée en
 * cours) ou quand tous les onglets du jeu sont fermés. La page en cours garde
 * donc l'ancienne version et son cache jusqu'au bout : ses morceaux chargés à
 * la demande (musique, scènes) restent disponibles, même hors ligne.
 */
const VERSION = '0f96424f391f';
/** Numéro de version du jeu (package.json), annoncé à la page avant la mise à jour. */
const APP_VERSION = '2.1.0';
const PRECACHE_URLS = [
  "./assets/automation-D48rn0UV.js",
  "./assets/autoscene-DyeNSnCI.js",
  "./assets/index-CkGitsjl.js",
  "./assets/index-DePzCex5.css",
  "./assets/inter-latin-400-normal-C38fXH4l.woff2",
  "./assets/inter-latin-500-normal-Cerq10X2.woff2",
  "./assets/inter-latin-600-normal-LgqL8muc.woff2",
  "./assets/inter-latin-700-normal-Yt3aPRUw.woff2",
  "./assets/machinescene-CBlQeuj6.js",
  "./assets/monde-ClmInTyU.js",
  "./assets/music-CFkL0EcI.js",
  "./assets/paquet-bulles-B2BIQQI1.js",
  "./assets/paquet-mails-BfiCIO5c.js",
  "./assets/paquet-openspace-CuoDOju6.js",
  "./assets/pixelify-sans-latin-400-normal-DLrIX9QE.woff2",
  "./assets/pixelify-sans-latin-600-normal-Dd_Dy7u5.woff2",
  "./assets/pixelify-sans-latin-700-normal-D3Xxx3QE.woff2",
  "./assets/portrait-KfucCoNe.js",
  "./assets/textes-B-GEyC88.js",
  "./assets/vt323-latin-400-normal-wDgJuOC9.woff2",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./index.html",
  "./jaquette-dos.png",
  "./jaquette.png",
  "./manifest.webmanifest",
  "./polices/OFL.txt"
];

const PREFIX = 'santimulator-';
const PRECACHE = `${PREFIX}app-${VERSION}`;
/** Première visite sans cache : au-delà, la page réseau est abandonnée. */
const NAV_TIMEOUT_MS = 3000;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const INDEX_URL = scopeUrl('./index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS.map(scopeUrl));
      // Pas de skipWaiting ici : la nouvelle version attend que la page la demande.
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'activer') void self.skipWaiting();
  else if (data === 'version' && event.source) event.source.postMessage({ type: 'version', version: APP_VERSION });
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Les anciens caches du jeu (y compris celui des polices Google des versions 1.0 à 1.4) partent.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== PRECACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});

/**
 * La page vient du cache de la version active : elle va toujours avec ses
 * scripts (pas de nouvelle page sur d'anciens scripts, ni l'inverse). Le
 * réseau ne sert qu'à la toute première visite, ou si le cache a été vidé.
 */
async function navigate(req) {
  const cache = await caches.open(PRECACHE);
  const cached = (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) ?? (await cache.match(INDEX_URL, { ignoreVary: true }));
  if (cached) return cached;
  try {
    return await withTimeout(fetch(req), NAV_TIMEOUT_MS);
  } catch {
    return Response.error();
  }
}

/**
 * Ressources du build : le cache, sinon le réseau (sans mise en cache des inconnues).
 * ignoreVary : un script module porte l'en-tête Origin, et un serveur qui répond « Vary: Origin »
 * ferait rater le cache (noms hachés : aucun risque de confusion).
 */
async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true, ignoreVary: true, cacheName: PRECACHE });
  return cached ?? fetch(req);
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
