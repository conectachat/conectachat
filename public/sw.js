// ConectaChat Service Worker — PWA-1
// IMPORTANTE: este SW NÃO faz cache de assets (rede sempre), para NUNCA servir
// uma versão velha do app. As notificações push entram no PWA-2/PWA-3.
const SW_VERSION = "2026-06-21-1";

self.addEventListener("install", () => {
  // Ativa a versão nova imediatamente.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Assume o controle das abas abertas assim que ativa.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Passagem direta pela rede (sem cache). O handler precisa existir para o app
  // ser instalável; aqui ele intencionalmente NÃO intercepta nada, evitando
  // qualquer risco de versão presa em cache.
});
