/* sw.js - WEBZ v2 PWA
   Static shell caching + offline fallback.
   - Navigations: network-first, fallback to cached index.html
   - Static assets: cache-first, ignoring query strings (e.g. ?v=20260128_2)
*/
const CACHE_PREFIX = "webzv2-cache-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // same-origin only
  if (url.origin !== self.location.origin) return;

  // navigation/page loads
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", res.clone()));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  const isStatic = ["style", "script", "image", "font"].includes(req.destination);
  if (!isStatic) return;

  // ignore query strings for caching
  const cacheKey = "." + url.pathname;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const res = await fetch(req);
      if (res && res.ok) cache.put(cacheKey, res.clone());
      return res;
    })
  );
});
