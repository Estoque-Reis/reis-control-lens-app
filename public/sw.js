// Minimal Service Worker for PWA installability
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Ignora chamadas de autenticação do Firebase para evitar problemas de rede em PWAs
  if (event.request.url.includes('identitytoolkit.googleapis.com') || 
      event.request.url.includes('securetoken.googleapis.com')) {
    return;
  }
  
  // No-op pass-through para o resto
  event.respondWith(fetch(event.request));
});
