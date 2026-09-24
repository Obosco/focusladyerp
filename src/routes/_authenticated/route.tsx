import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const session = await getAuthSession();
    if (session.required && !session.email) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.pathname + location.searchStr },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
