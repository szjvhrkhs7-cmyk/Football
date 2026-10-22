const CACHE = 'pulse-v1.7.7';
const APP_SHELL = ['./', './index.html', './styles.css?v=1.7.7', './light.css?v=1.7.7', './unplanned.css?v=1.7.7', './unplanned.js?v=1.7.7', './app.js?v=1.7.7', './loans.js?v=1.7.7', './vendor/supabase-2.45.4.js', './manifest.webmanifest?v=1.7.7', './icon.svg?v=1.7.7', './logo-mark.svg?v=1.7.7', './apple-touch-icon-v3.png', './icon-192-v3.png', './icon-512-v3.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  // Activate on the next launch: never replace code underneath an open form.
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pulse-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  if (event.request.mode === 'navigate') {
    // An auth callback URL must never enter the cache with its query tokens.
    event.respondWith(caches.match('./index.html').then(cached => cached || fetch(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => new Response('Нет подключения', { status: 503 }));
    })
  );
});
