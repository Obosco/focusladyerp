import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (count, error) => {
          if (count >= 2) return false;
          if (!(error instanceof Error)) return true;
          if (/RESOURCE_EXHAUSTED|quota|rate[ -]?limit|HTTP 429/i.test(error.message)) {
            return false;
          }
          return /Google Sheets|network|fetch/i.test(error.message);
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
