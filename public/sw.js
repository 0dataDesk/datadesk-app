self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(self.registration.showNotification(data.title || 'dataDesk', {
    body: data.body || 'Tienes una incidencia de checado pendiente.'
  }))
})
