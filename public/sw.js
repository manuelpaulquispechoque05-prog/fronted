// Service Worker para notificaciones Push.
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { titulo: 'StudySync', cuerpo: '' };
  event.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.cuerpo,
      icon: '/favicon.ico',
      badge: '/favicon.ico'
    })
  );
});

// Al hacer clic en la notificación, abre o enfoca la app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
