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
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll() is all-or-nothing; one 404 would abort the whole install.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
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

async function networkFirstNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    if (response.ok) persist(event, SHELL_CACHE, event.request, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(event.request)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
    );
  }
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
