import { queryOptions, type QueryClient } from "@tanstack/react-query";

export const ERP_CACHE_TTL = {
  products: 3 * 60_000,
  customers: 3 * 60_000,
  suppliers: 3 * 60_000,
  categories: 10 * 60_000,
  dashboard: 45_000,
  analytics: 45_000,
  stock: 45_000,
  default: 30_000,
};

const inFlight = new Map<string, Promise<unknown>>();

export function dedupeRequest<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const request = loader().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, request);
  return request as Promise<T>;
}

export function createErpQueryOptions<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = ERP_CACHE_TTL.default,
) {
  return queryOptions({
    queryKey: ["erp", key],
    queryFn: () => dedupeRequest(key, loader),
    staleTime: ttlMs,
    gcTime: ttlMs + 60_000,
    retry: (count, error) => {
      if (count >= 2) return false;
      return error instanceof Error ? /Google Sheets|network|fetch/i.test(error.message) : true;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}

export async function refreshErpData(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ["erp"] });
  await queryClient.refetchQueries({ queryKey: ["erp"], type: "active" });
}

export function getLastSyncStamp() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem("flb-last-sync");
  return value ? Number(value) : null;
}

export function setLastSyncStamp(timestamp = Date.now()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("flb-last-sync", String(timestamp));
}

export function getLastSyncLabel() {
  const stamp = getLastSyncStamp();
  if (!stamp) return "Never synced";
  return new Date(stamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
