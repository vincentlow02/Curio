import type { UiLocale } from "../locales";

const LOCALE_STORAGE_KEY = "curio-ui-locale";
type LocaleStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): LocaleStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoredLocale(storage: LocaleStorage | null = browserStorage()): UiLocale | null {
  try {
    const value = storage?.getItem(LOCALE_STORAGE_KEY);
    return value === "en" || value === "zh" || value === "ja" ? value : null;
  } catch {
    return null;
  }
}

export function persistLocale(locale: UiLocale, storage: LocaleStorage | null = browserStorage()): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Keep the in-memory locale active when browser storage is unavailable.
  }
}
