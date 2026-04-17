const CACHE = 'seelotse-v117';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './xlsx.min.js',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

// Diese externen API-Hosts liefern Live-Daten — nie aus dem Cache bedienen
const API_HOSTS = [
  'www.pegelonline.wsv.de',
  'api.brightsky.dev',
  'overpass-api.de',
  'overpass.openstreetmap.fr',
  'api.open-meteo.com',
  'openweathermap.org',
  'api.met.no',
  'aisstream.io',
  'workers.dev',
  'corsproxy.io',
  'api.allorigins.win',
  'www.bsh.de',
  'gezeitenvorhersage.bsh.de',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Externe Live-APIs: immer frisch vom Netz laden, niemals cachen
  if (API_HOSTS.some(h => url.hostname.includes(h))) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Alles andere (App-Dateien + Karten-Tiles): Cache-First
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
      .catch(() => caches.match('./index.html'))
  );
});
