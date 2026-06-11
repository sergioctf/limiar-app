/**
 * Limiar Service Worker — push notifications only (no offline cache)
 * Served at /sw.js — registered by PushNotificationSetup component
 */

const APP_NAME = "Limiar";

// ── Push event: show notification ────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: APP_NAME, body: event.data.text() };
  }

  const title   = payload.title || APP_NAME;
  const options = {
    body:    payload.body    || "",
    icon:    payload.icon    || "/api/icons/192",
    badge:   "/api/icons/96",
    tag:     payload.tag     || "limiar-default",
    data:    { url: payload.url || "/" },
    vibrate: [200, 100, 200],
    actions: payload.actions || [],
    silent:  false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click: open / focus the app ─────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Offline cache ─────────────────────────────────────────────────────────────

const CACHE_NAME  = "limiar-cache-v2";
const OFFLINE_URL = "/offline";

// Precached on install so the offline fallback always works
const PRECACHE_URLS = [OFFLINE_URL, "/manifest.json", "/limiar_icone_app.png"];

// Data endpoints worth serving stale when offline (GET only)
const CACHEABLE_API_PATHS = [
  "/api/coach/weekly-plan",
  "/api/coach/full-analysis",
  "/api/performance-tests",
  "/api/friends",
];

// Static assets: hashed Next.js chunks, fonts and images are immutable
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/api/icons/") ||
    /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Non-GET (and cross-origin POSTs etc.): let the browser handle natively
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1. Page navigations: network-first → cached page → offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(request))
              || (await cache.match(OFFLINE_URL))
              || new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  // 2. Static assets: stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 3. Selected data APIs: network-first with cache fallback
  if (CACHEABLE_API_PATHS.some((path) => url.pathname.includes(path))) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.status === 200) cache.put(request, response.clone());
            return response;
          })
          .catch(async () =>
            (await cache.match(request))
              || new Response(JSON.stringify({ offline: true }), {
                   status: 503,
                   headers: { "Content-Type": "application/json" },
                 })
          )
      )
    );
    return;
  }

  // 4. Everything else: untouched (browser default)
});

// ── Install / activate ────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {}) // precache failures must not block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => clients.claim())
  );
});
