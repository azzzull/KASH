type PwaUpdateDetail = {
  registration: ServiceWorkerRegistration;
};

declare global {
  interface WindowEventMap {
    "kash:pwa-update-ready": CustomEvent<PwaUpdateDetail>;
  }
}

function notifyUpdateReady(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent("kash:pwa-update-ready", { detail: { registration } }));
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting) {
        notifyUpdateReady(registration);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            notifyUpdateReady(registration);
          }
        });
      });
    });
  });
}
