/*
 * Focus Lady Bra ERP — service worker.
 *
 * Caching rules, by request kind:
 *   /assets/*        cache-first  — content-hashed by Vite, so a URL never changes meaning.
 *   icons, manifest  stale-while-revalidate — same path across deploys, refresh in background.
 *   navigations      network-first, falling back to the cached shell then /offline.html.
 *                    HTML must stay fresh: a stale document can point at asset hashes that
 *                    no longer exist on the current deployment.
 *   everything else  bypassed — /_serverFn/* calls, non-GET, Supabase and Google requests
 *                    must never be served from cache.
 */

const VERSION = "v1";
const ASSET_CACHE = `flb-erp-assets-${VERSION}`;
const SHELL_CACHE = `flb-erp-shell-${VERSION}`;
const CURRENT_CACHES = [ASSET_CACHE, SHELL_CACHE];

const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Precache known static assets and attempt to fetch the app shell ('/') so the
  // app can start instantly on repeat visits. Installation should not fail the
  // whole worker if one resource is missing, so swallow individual errors.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => undefined)),
      );
      try {
        // Attempt to cache the app shell (root HTML). If network unavailable, skip.
        const res = await fetch(new Request("/", { cache: "reload" }));
        if (res && res.ok) await cache.put(new Request("/"), res.clone());
      } catch (e) {
        // ignore failures — offline installs will still succeed with offline.html
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("flb-erp-") && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

function isPrecachedStatic(url) {
  return PRECACHE_URLS.includes(url.pathname);
}

// Cache writes are handed to waitUntil so the worker is not torn down mid-put once
// the response has already been handed back to the page.
function persist(event, cacheName, request, response) {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.put(request, response)));
}

async function cacheFirst(event) {
  const { request } = event;
  const cached = await caches.match(request, { cacheName: ASSET_CACHE });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) persist(event, ASSET_CACHE, request, response.clone());
  return response;
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cached = await caches.match(request, { cacheName: SHELL_CACHE });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) persist(event, SHELL_CACHE, request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  if (response) return response;
  throw new Error(`Unavailable offline: ${request.url}`);
}

// For fast startup and snappy repeat visits: respond with the cached app shell
// immediately when available, but update it from network in the background
// (stale-while-revalidate). If nothing is cached yet, fall back to network-first.
async function networkFirstNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  // Try to return cached document immediately
  const cached = await cache.match(event.request);
  // Kick off a network fetch to update the cache in background
  const network = (async () => {
    try {
      const preloaded = await event.preloadResponse;
      const response = preloaded || (await fetch(event.request));
      if (response && response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      return undefined;
    }
  })();

  if (cached) {
    // Return cached immediately and try to update quietly
    event.waitUntil(network);
    return cached;
  }

  // No cached response — wait for network and fall back to offline page
  const response = await network;
  if (response && response.ok) return response;
  return (
    (await cache.match(OFFLINE_URL)) || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Range requests need byte-range handling the Cache API does not do for us.
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_serverFn/")) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(event));
    return;
  }

  if (isPrecachedStatic(url)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
