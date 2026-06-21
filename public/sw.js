// ConectaChat Service Worker — PWA-3
// NÃO faz cache (rede sempre). Agora também recebe e exibe notificações push.
const SW_VERSION = "2026-06-21-2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Passagem direta pela rede (sem cache).
});

// Recebe o push e mostra a notificação.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ConectaChat";
  const options = {
    body: data.body || "Você tem uma nova mensagem.",
    icon: "/conectachat-192.png",
    badge: "/conectachat-192.png",
    tag: data.tag || "conectachat",
    renotify: true,
    data: { url: data.url || "/inbox" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação: foca uma aba aberta ou abre o app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
