/* Service Worker for Push Notifications */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push messages
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Herinnering!', body: event.data && event.data.text ? event.data.text() : '' };
  }

  const title = payload.title || 'Herinnering!';
  const body = payload.body || '';
  const icon = payload.icon || 'images/calendar.png';
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      data,
      // optional actions
      actions: [
        { action: 'open', title: 'Openen' },
        { action: 'dismiss', title: 'Sluiten' }
      ]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  if (action === 'dismiss') return;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Try to focus an existing tab
      for (const client of allClients) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }
      // Or open a new one
      if (self.clients.openWindow) {
        await self.clients.openWindow('./');
      }
    })()
  );
});

// Allow foreground page to request a test notification via postMessage (no push required)
self.addEventListener('message', (event) => {
  const { type, title, options } = event.data || {};
  if (type === 'show-notification') {
    self.registration.showNotification(title || 'Herinnering!', options || {});
  }
});
