import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isInstalled, type BeforeInstallPromptEvent } from "@/lib/pwa";

export default function InstallButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || isInstalled()) return;
    const stash = window as Window & { __flbInstallEvent?: BeforeInstallPromptEvent | null };

    const sync = () => {
      if (stash.__flbInstallEvent) setDeferred(stash.__flbInstallEvent);
    };

    sync();
    window.addEventListener("flb:installable", sync);
    window.addEventListener("appinstalled", () => setDeferred(null));
    return () => window.removeEventListener("flb:installable", sync);
  }, []);

  if (!deferred) return null;

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "default"}
      size="sm"
      className={className}
      aria-label="Install Focus Lady Bra ERP"
      onClick={async () => {
        try {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        } catch {
          // User closed the native prompt.
        }
      }}
    >
      <Download className="h-4 w-4" />
      {compact ? "Install app" : "Install Focus Lady Bra ERP"}
    </Button>
  );
}
