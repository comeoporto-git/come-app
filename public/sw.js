// COME Food Tours — Service Worker
// Minimal SW required for PWA installability on Android.
// iOS "Add to Home Screen" works via the manifest + apple meta tags alone.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});
