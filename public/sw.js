/* ANSHA PWA service worker — public shell only. Never cache admin, API, or auth. */
const VERSION = 'ansha-pwa-v1.4.0';
const PRECACHE = [
  '/',
  '/offline',
  '/favicon.ico',
  '/icons/favicon-48.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function shouldBypass(url) {
  if (url.origin !== self.location.origin) return true;
  const path = url.pathname;
  if (path.startsWith('/admin')) return true;
  if (path.startsWith('/api')) return true;
  if (path.startsWith('/portal')) return true;
  if (path.startsWith('/verify/')) return true;
  if (path.startsWith('/auth')) return true;
  return false;
}

function isStaticAsset(url) {
  const path = url.pathname;
  return (
    path.startsWith('/icons/') ||
    path.startsWith('/images/') ||
    path.startsWith('/brands/') ||
    path.startsWith('/_next/static/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const cached = await caches.match('/offline');
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'ANSHA TRADING',
    body: 'New update from ANSHA',
    url: '/',
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // keep defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'ANSHA TRADING', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
