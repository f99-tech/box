const CACHE = "ringbeat-pages-v4";
const PRECACHE = [
  "./",
  "./index.html",
  "./app.css",
  "./data.js",
  "./fights.js",
  "./app.js",
  "./manifest.json",
  "./hero.jpg",
  "./poster.jpg",
  "./gloves.jpg",
  "./spar.jpg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./bell.wav",
  "./bell-triple.wav",
  "./clapper.wav",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((hit) => {
      const net = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => hit || caches.match("./index.html"));
      return net.catch(() => hit || caches.match("./index.html"));
    }),
  );
});
