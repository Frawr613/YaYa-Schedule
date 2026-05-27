const CACHE_NAME = "yaya-schedule-v86";
const ASSETS = [
  "./",
  "./index.html",
  "./preview.html",
  "./README.md",
  "./styles.css",
  "./app-layers.js",
  "./platform-bridge.js",
  "./ui-modules.js",
  "./theme-modules.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-cartoon.png",
  "./icons/icon-minimal.png",
  "./icons/icon-transparent.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const refresh = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
