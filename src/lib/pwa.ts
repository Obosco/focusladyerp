// Service worker registration + update prompt. Client-only; no-ops during SSR.
import { toast } from "sonner";

const SW_URL = "/sw.js";
const INSTALL_DISMISSED_KEY = "flb-erp-install-dismissed";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
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

function collectSameOriginUrls() {
  const urls = new Set<string>([`${location.origin}/`, location.href.split("#")[0]]);
  for (const entry of performance.getEntriesByType("resource")) {
    try {
      const url = new URL(entry.name);
      if (url.origin !== location.origin) continue;
      if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icon-")) {
        urls.add(url.href);
      }
    } catch {
      // ignore malformed resource names
    }
  }
  return [...urls];
}

function precacheLoadedAssets() {
  if (!("serviceWorker" in navigator)) return;
  const send = () => {
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "CACHE_URLS", urls: collectSameOriginUrls() });
    });
  };
  if (document.readyState === "complete") send();
  else window.addEventListener("load", send, { once: true });
}

function promptToReload(waiting: ServiceWorker) {
  toast("A new version is available", {
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
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
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        promptToReload(installing);
      }
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void registration.update();
  });
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;

  const register = () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => {
        watchForUpdates(registration);
        precacheLoadedAssets();
      })
      .catch((error) => console.error("[pwa] Service worker registration failed", error));
  };

  if (document.readyState === "complete" || document.readyState === "interactive") register();
  else window.addEventListener("DOMContentLoaded", register, { once: true });
}
