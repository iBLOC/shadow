/// <reference lib="webworker" />

/**
 * Shadow PWA service worker.
 *
 * Strategy:
 * - **App shell** (HTML, JS, CSS) — stale-while-revalidate
 * - **Prefrontal API** (`/v1/*`, `/api/*`) — network-first, falls
 *   back to cached read-only endpoints (`GET /v1/models`, `GET /.well-known/agent.json`)
 *   so the Discovery page still shows cached peer data offline.
 * - **Cross-origin** (Google Fonts, Tauri assets) — cache-first
 *   with 30-day TTL.
 */

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = 'shadow-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

const APP_SHELL = ['./', './index.html', './manifest.web.json'];

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Prefrontal API: network-first, cached fallback for GET-only
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/.well-known/')) {
    event.respondWith(networkFirstWithCache(req, RUNTIME_CACHE));
    return;
  }

  // Same-origin app shell: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
  }
});

async function cacheFirst(req: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    return new Response('offline', { status: 503 });
  }
}

async function networkFirstWithCache(
  req: Request,
  cacheName: string,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: { message: 'offline', type: 'network_error' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function staleWhileRevalidate(
  req: Request,
  cacheName: string,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((resp) => {
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    })
    .catch(() => cached ?? new Response('offline', { status: 503 }));
  return cached ?? fetchPromise;
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

export {};
