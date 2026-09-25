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
  toast("Update available", {
    description: "A newer Focus Lady ERP version is ready. Update now to refresh to the latest build.",
    duration: Infinity,
    action: {
      label: "Update now",
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

async function checkForOnlineUpdates() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !navigator.onLine) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.update();
    }
  } catch (error) {
    console.warn("[pwa] Update check failed", error);
  }
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
    if (document.visibilityState === "visible") {
      void checkForOnlineUpdates();
      void registration.update();
    }
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
        void checkForOnlineUpdates();
        precacheLoadedAssets();
      })
      .catch((error) => console.error("[pwa] Service worker registration failed", error));
  };

  if (document.readyState === "complete" || document.readyState === "interactive") register();
  else window.addEventListener("DOMContentLoaded", register, { once: true });
}

export function watchChunkLoadFailure() {
  if (typeof window === "undefined") return;

  let handled = false;
  const reloadKey = "flb-erp-chunk-reload-attempted";

  const recover = async () => {
    if (handled) return;
    handled = true;

    const alreadyRetried = sessionStorage.getItem(reloadKey) === "1";
    if (alreadyRetried) {
      toast.error(
        "The app could not load the latest version. Please refresh the page or check your connection.",
        { duration: 8000 },
      );
      return;
    }

    sessionStorage.setItem(reloadKey, "1");

    try {
      if (navigator.onLine) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
      }

      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("flb-erp-"))
          .map((name) => caches.delete(name)),
      );

      window.location.reload();
    } catch (error) {
      console.error("[pwa] Chunk reload recovery failed", error);
      sessionStorage.removeItem(reloadKey);
      toast.error(
        "The app could not finish loading the latest deployment. Please refresh the page or try again in a moment.",
        { duration: 8000 },
      );
    }
  };

  const isChunkIssue = (value: string) =>
    /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(value);

  window.addEventListener(
    "error",
    (event) => {
      const message = event.message || "";
      if (!isChunkIssue(message)) return;
      event.preventDefault();
      void recover();
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (!isChunkIssue(reason)) return;
      event.preventDefault();
      void recover();
    },
    true,
  );
}

