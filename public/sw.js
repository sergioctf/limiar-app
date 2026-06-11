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

// ── Fetch: cache-first for API calls, network-first for pages ────────────────

const CACHE_NAME = "limiar-cache-v1";

// Data endpoints to cache (GET only)
const CACHEABLE_API_PATHS = [
  "/api/coach/weekly-plan",
  "/api/coach/full-analysis",
  "/api/performance-tests",
];

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only cache GET requests
  if (request.method !== "GET") {
    event.respondWith(fetch(request));
    return;
  }

  // Cache API calls for performance data
  if (CACHEABLE_API_PATHS.some(path => url.pathname.includes(path))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(request)
          .then(response => {
            // Cache successful responses
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // On network error, fall back to cache
            return cache.match(request) || new Response("Offline — cached data not available", { status: 503 });
          })
      )
    );
    return;
  }

  // For all other requests, let the browser handle it normally
  event.respondWith(fetch(request).catch(() => new Response("", { status: 503 })));
});

// ── Install / activate: skip waiting so new SW takes over immediately ────────

self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});
