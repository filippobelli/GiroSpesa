// GiroSpesa service worker: keeps the app usable in the supermarket without signal.
// Pages: network first, cached copy when offline. Static assets: cache first.
const CACHE = 'girospesa-shell-v1';
const SHELL = ['/', '/login', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => undefined)))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache first, so the app keeps its look offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase & co. go straight to the network
  if (url.pathname.startsWith('/auth/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
        return res;
      }).catch(() => caches.match(url.pathname).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
  }
});

// The page sends the assets it already loaded, so the first visit is enough to work offline.
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.type === 'precache' ? event.data.urls : null;
  if (Array.isArray(urls)) caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => undefined)))));
});
