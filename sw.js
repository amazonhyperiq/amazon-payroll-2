const CACHE_NAME = 'amazon-advances-v13';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.jpg',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Supabase/CDN requests must stay online and are not cached by this worker.
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return response;
    }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});


self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'سلف الموظفين';
  const options = {
    body: data.body || 'تم تحديث نظام السلف',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: './' },
    tag: data.tag || (data.event_id ? `amazon-advances-${data.event_id}` : `amazon-advances-${Date.now()}`)
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    const target = new URL('./', self.location.origin).href;
    for (const client of list) {
      if ('focus' in client) { client.focus(); return; }
    }
    return clients.openWindow(target);
  }));
});
