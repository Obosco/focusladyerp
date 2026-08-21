// Service worker registration + update prompt. Client-only; no-ops during SSR.
import { toast } from "sonner";

const SW_URL = "/sw.js";
const INSTALL_DISMISSED_KEY = "flb-erp-install-dismissed";

// Chrome fires this instead of showing its own banner; without a handler the only
// affordance is the small install icon in the omnibox, which people never notice.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari reports standalone mode here rather than through display-mode.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function offerInstall(deferred: BeforeInstallPromptEvent) {
  if (localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;

  toast("Install Focus Lady Bra ERP", {
    description: "Run it as a desktop app — opens instantly, even on a slow connection.",
    duration: Infinity,
    action: {
      label: "Install",
      onClick: async () => {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        // Only a refusal is remembered; an accepted prompt never fires again anyway.
        if (outcome === "dismissed") localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
      },
    },
    cancel: {
      label: "Not now",
      onClick: () => localStorage.setItem(INSTALL_DISMISSED_KEY, "1"),
    },
  });
}

export function watchInstallPrompt() {
  if (typeof window === "undefined" || isInstalled()) return;

  const stash = window as Window & { __flbInstallEvent?: BeforeInstallPromptEvent | null };

  // The head script may have caught the event already, before React hydrated.
  if (stash.__flbInstallEvent) offerInstall(stash.__flbInstallEvent);
  else
    window.addEventListener("flb:installable", () => offerInstall(stash.__flbInstallEvent!), {
      once: true,
    });

  window.addEventListener("appinstalled", () => {
    localStorage.removeItem(INSTALL_DISMISSED_KEY);
    toast.success("Focus Lady Bra ERP installed");
  });
}

function promptToReload(waiting: ServiceWorker) {
  toast("A new version is available", {
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
        // controllerchange fires once the waiting worker takes over; reload then so
        // the fresh document is served by the new worker rather than the old one.
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => window.location.reload(),
          { once: true },
        );
        waiting.postMessage("SKIP_WAITING");
      },
    },
  });
}

function watchForUpdates(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    promptToReload(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      // An existing controller means this is an update, not the very first install.
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        promptToReload(installing);
      }
    });
  });
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;

  const register = () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then(watchForUpdates)
      .catch((error) => console.error("[pwa] Service worker registration failed", error));
  };

  // Registering after load keeps the worker's install off the critical path.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
