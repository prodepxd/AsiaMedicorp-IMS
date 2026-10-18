const CACHE_PREFIX = "asia-medicorp-ims-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL_URL = new URL("./", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.add(new Request(APP_SHELL_URL, { cache: "reload" }))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);

  // Never cache Supabase/API traffic, cross-origin requests, or requests outside this app.
  if (
    url.origin !== scopeUrl.origin ||
    !url.href.startsWith(self.registration.scope) ||
    /\/(rest\/v1|auth\/v1|functions\/v1|storage\/v1)(\/|$)/i.test(url.pathname)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) return response;
          // Persist the shell before completing the navigation response.
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(APP_SHELL_URL, response.clone()))
            .then(() => response);
        })
        .catch(async () => {
          const cached = await caches.match(APP_SHELL_URL);
          return cached || Response.error();
        })
    );
    return;
  }

  // Cache only static assets; never cache arbitrary data or API responses.
  if (!["script", "style", "image", "font"].includes(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok || response.type !== "basic") return response;
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .then(() => response);
      });
    })
  );
});
