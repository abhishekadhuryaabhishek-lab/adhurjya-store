(function() {
  const coi = {
    shouldRegister: () => !window.crossOriginIsolated,
    doReload: () => window.location.reload(),
    quiet: false,
  };

  const n = navigator;

  if (coi.shouldRegister()) {
    if (window.isSecureContext && n.serviceWorker) {
      n.serviceWorker.register(window.document.currentScript.src)
        .then(registration => {
          if (!coi.quiet) console.log("COOP/COEP Service Worker registered.");
          if (registration.active && !n.serviceWorker.controller) {
            coi.doReload();
          }
        });
    }
  }

  if (n.serviceWorker) {
    n.serviceWorker.addEventListener("controllerchange", () => {
      if (!coi.quiet) console.log("COOP/COEP Service Worker controllerchange, reloading.");
      coi.doReload();
    });
  }
})();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 0) return response;
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
      .catch((e) => console.error(e))
  );
});
