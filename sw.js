// Service worker RIVAL: caché offline del cascarón de la app, notificaciones y push (FCM opcional).
const VERSION = "rival-v2";
const SHELL = [
  "./", "./index.html", "./admin.html", "./insumos.html",
  "./css/base.css", "./css/index.css", "./css/admin.css",
  "./js/firebase.js", "./js/core/ui.js", "./js/core/auth.js", "./js/core/membership.js", "./js/core/push.js",
  "./js/index.js", "./js/insumos.js", "./js/admin/main.js",
  "./assets/img/logo.svg", "./assets/img/icon-192.png", "./assets/img/icon-512.png", "./assets/img/badge-96.png",
  "./assets/img/hero.jpg", "./assets/img/hero-mobile.jpg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Red primero para archivos propios (siempre la versión más nueva), caché como respaldo sin conexión.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "./";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const path = new URL(target, location.href).pathname;
    const hit = all.find((c) => new URL(c.url).pathname === path);
    if (hit) return hit.focus();
    return self.clients.openWindow(target);
  })());
});

// Push de Firebase Cloud Messaging (solo si se configuró VAPID_KEY + la Cloud Function opcional).
self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data?.json() || {}; } catch { p = { notification: { title: "RIVAL", body: e.data?.text() } }; }
  const n = p.notification || {}, d = p.data || {};
  const title = n.title || d.title || "RIVAL";
  e.waitUntil(self.registration.showNotification(title, {
    body: n.body || d.body || "",
    tag: d.tag || "rival",
    renotify: true,
    icon: "assets/img/icon-192.png",
    badge: "assets/img/badge-96.png",
    data: { url: d.url || p.fcmOptions?.link || "./insumos.html" },
  }));
});
