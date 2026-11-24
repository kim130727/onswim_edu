import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export const AUTH_TOKEN_KEY = "modu_math_auth_token_v1";
export const AUTH_USER_KEY = "modu_math_auth_user_v1";
export const LOCALE_KEY = "modu_math_locale_v1";

export async function getStorageItem(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key, value });
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota errors in restricted contexts.
  }
}

export async function removeStorageItem(key: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key });
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

export function assignmentStorageKey(
  baseUrl: string,
  userId: number | string,
  assignmentId: number,
  itemId: number,
  kind: "draft" | "pending",
): string {
  const scope = encodeURIComponent(`${baseUrl}|${userId}`);
  return `modu_assignment_v1:${scope}:${assignmentId}:${itemId}:${kind}`;
}
