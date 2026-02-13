/* sw.js - WEBZ v2 PWA
   Static shell caching + offline fallback.
   - Navigations: network-first, fallback to cached index.html
   - Scripts/styles: network-first with cache fallback (so updates actually land)
   - Images/fonts: cache-first, ignoring query strings to keep the cache tidy
*/
const CACHE_PREFIX = "webzv2-cache-";
// Cache version. Bump when SW behavior changes.
const CACHE_NAME = CACHE_PREFIX + "v2";
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

  // Scripts/styles: network-first so you actually get updates (and ?v=... works).
  if (req.destination === "script" || req.destination === "style") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (_) {
          const cached = await cache.match(req);
          if (cached) return cached;
          throw _;
        }
      })
    );
    return;
  }

  // Images/fonts: cache-first, and ignore query strings to keep the cache tidy.
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
