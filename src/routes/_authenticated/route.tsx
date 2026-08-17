import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isSessionExpired, signOutClean, touchSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session || isSessionExpired()) {
      if (data.session) await signOutClean();
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    touchSession();
    return { session: data.session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const events = ["click", "keydown", "mousemove", "scroll"];
    const onActivity = () => touchSession();
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const interval = window.setInterval(async () => {
      if (isSessionExpired()) {
        await signOutClean();
        navigate({ to: "/auth", replace: true });
      }
    }, 60_000);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth", replace: true });
    });

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(interval);
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return <Outlet />;
}
