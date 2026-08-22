import { useEffect, useState } from "react";

// A tiny, unobtrusive install button that appears when the beforeinstallprompt event
// is available. This complements the toast-based prompt and provides a persistent
// visible affordance on desktop and Android Chrome.

export default function InstallButton() {
  const [deferred, setDeferred] = useState<any | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stash = window as Window & { __flbInstallEvent?: any | null };
    // If the head script already grabbed it put it on window.__flbInstallEvent
    if (stash.__flbInstallEvent) {
      setDeferred(stash.__flbInstallEvent);
      setVisible(true);
    }

    function onInstallable() {
      setDeferred(stash.__flbInstallEvent);
      setVisible(true);
    }

    window.addEventListener("flb:installable", onInstallable);

    window.addEventListener("appinstalled", () => {
      setVisible(false);
    });

    return () => window.removeEventListener("flb:installable", onInstallable);
  }, []);

  if (!visible || !deferred) return null;

  return (
    <div style={{ position: "fixed", right: 16, bottom: 84, zIndex: 9999 }}>
      <button
        onClick={async () => {
          try {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            // If dismissed, leave (the toast code handles remembering a dismissal).
          } catch (e) {
            // ignore
          }
        }}
        aria-label="Install FocusLadyERP"
        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg"
      >
        Install FocusLadyERP
      </button>
    </div>
  );
}
