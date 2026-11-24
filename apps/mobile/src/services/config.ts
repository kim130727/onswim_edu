import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/**
 * Resolves the API base URL cleanly across:
 * 1. Vite dev server (`http://localhost:3000` with `/api` proxy -> `""`)
 * 2. Production web (`/student/` on Django or port 3000 Nginx -> `""` / same-origin)
 * 3. Capacitor native WebView (Android/iOS -> `VITE_CAPACITOR_API_BASE_URL` or fallback)
 */
export function resolveApiBaseUrl(): string {
  if (Capacitor.isNativePlatform()) {
    const capUrl = (import.meta.env.VITE_CAPACITOR_API_BASE_URL ?? "").trim();
    if (capUrl && capUrl !== "same-origin") {
      return capUrl.replace(/\/+$/, "");
    }
    const envUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
    if (envUrl && envUrl !== "same-origin") {
      return envUrl.replace(/\/+$/, "");
    }
    return Capacitor.getPlatform() === "android"
      ? "http://10.0.2.2:8000"
      : "http://127.0.0.1:8000";
  }

  const webUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (!webUrl || webUrl === "same-origin") {
    return "";
  }
  return webUrl.replace(/\/+$/, "");
}

/**
 * Opens external URLs in the system browser on Capacitor native apps
 * and in a new tab on web, keeping internal app routes inside the SPA.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
