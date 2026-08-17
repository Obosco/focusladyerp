// Client-side session hygiene: "remember me" + automatic idle expiry.
import { supabase } from "@/integrations/supabase/client";

const REMEMBER_KEY = "flb-erp-remember";
const LAST_ACTIVE_KEY = "flb-erp-last-active";
const TAB_KEY = "flb-erp-tab-open";

// Sessions expire after 30 minutes of inactivity.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  sessionStorage.setItem(TAB_KEY, "1");
  touchSession();
}

export function isRemembered() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

export function touchSession() {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

export function isSessionExpired() {
  if (typeof window === "undefined") return false;
  // Not remembered + browser/tab restarted → require a fresh login.
  if (!isRemembered() && !sessionStorage.getItem(TAB_KEY)) return true;
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
  if (!last) return false;
  return Date.now() - last > IDLE_TIMEOUT_MS;
}

export async function signOutClean() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(LAST_ACTIVE_KEY);
    sessionStorage.removeItem(TAB_KEY);
  }
  await supabase.auth.signOut();
}
