/*
 * Focus Lady Bra ERP — service worker.
 *
 * Caching rules, by request kind:
 *   /assets/*        cache-first  — content-hashed by Vite, so a URL never changes meaning.
 *   icons, manifest  stale-while-revalidate — same path across deploys, refresh in background.
 *   navigations      stale-while-revalidate — serve the last shell immediately, refresh it in
 *                    the background. Offline falls back to /offline.html.
 *   everything else  bypassed — /_serverFn/* calls, non-GET, Supabase and Google requests
 *                    must never be served from cache.
 */

const VERSION = "v2";
const ASSET_CACHE = `flb-erp-assets-${VERSION}`;
const SHELL_CACHE = `flb-erp-shell-${VERSION}`;
const CURRENT_CACHES = [ASSET_CACHE, SHELL_CACHE];

const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-32.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
      try {
        const res = await fetch(new Request("/", { cache: "reload" }));
        if (res && res.ok) await cache.put(new Request("/"), res.clone());
      } catch {
        // Offline installs still succeed with offline.html
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
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "CACHE_URLS" && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheUrls(event.data.urls));
  }
});

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

function isPrecachedStatic(url) {
  return PRECACHE_URLS.includes(url.pathname);
}

function persist(event, cacheName, request, response) {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.put(request, response)));
}

async function cacheUrls(urls) {
  const assetCache = await caches.open(ASSET_CACHE);
  const shellCache = await caches.open(SHELL_CACHE);
  await Promise.all(
    urls.map(async (href) => {
      let url;
      try {
        url = new URL(href, self.location.origin);
      } catch {
        return;
      }
      if (url.origin !== self.location.origin) return;
      if (url.pathname.startsWith("/_serverFn/") || url.pathname.startsWith("/api/")) return;

      const cache = isHashedAsset(url) ? assetCache : shellCache;
      const request = new Request(url.href);
      if (await cache.match(request)) return;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response);
      } catch {
        // Ignore individual failures so one 404 cannot block the rest.
      }
    }),
  );
}

async function cacheFirst(event) {
  const { request } = event;
  const cached = await caches.match(request, { cacheName: ASSET_CACHE });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) persist(event, ASSET_CACHE, request, response.clone());
    return response;
  } catch (error) {
    const fallback = await caches.match(request);
    if (fallback) return fallback;
    throw error;
  }
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
  const cached = await cache.match(event.request);
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
    event.waitUntil(network);
    return cached;
  }

  const response = await network;
  if (response && response.ok) return response;
  return (
    (await cache.match(OFFLINE_URL)) ||
    new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
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
