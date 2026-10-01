const CACHE_NAME = "smart-irrigation-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  // Never persist farmer records, session responses, or Next.js server data.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;
  // Next.js chunk URLs can be reused across development builds. Always fetch
  // them from the current server so an older cached auth gate cannot persist.
  if (url.pathname.startsWith("/_next/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest")) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request)));
});

self.addEventListener("push", (event) => {
  let payload = { title: "FieldWise", body: "You have a new farm update.", url: "/" };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch { if (event.data) payload.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: payload.url || "/" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
