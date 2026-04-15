// COME Food Tours — Service Worker

const CACHE = "come-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Network-first fetch handler — required for PWA installability in Chrome.
// Falls back to cache for offline support on static assets.
self.addEventListener("fetch", (event) => {
  // Only handle GET requests; skip cross-origin requests.
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (
          response.ok &&
          (url.pathname.startsWith("/_next/static/") ||
           url.pathname.endsWith(".png") ||
           url.pathname.endsWith(".ico"))
        ) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
