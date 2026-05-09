// Service Worker — DTC BTC Sniper
const CACHE_NAME = 'dtc-sniper-v2';
const ASSETS = [
  './', './index.html', './css/style.css',
  './js/indicators.js', './js/bot.js',
  './js/ui.js', './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('binance.com')) return; // Never cache API
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'DTC Sniper', body: 'Signal update' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './assets/icon.png',
      badge: './assets/icon.png',
      tag: 'dtc-signal',
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: 'view', title: '👀 View Signal' },
        { action: 'dismiss', title: '✕ Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action !== 'dismiss') {
    e.waitUntil(clients.openWindow('./'));
  }
});
