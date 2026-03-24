import { getCurrentUserId } from "./currentUser";
import { storageKey } from "./storageKeys";

export type ThemeFamily = "focus-paper" | "studio-ledger";
export type ThemeMode = "light" | "dark";

export type ThemePreference = {
  mode: ThemeMode;
};

export type ThemeState = {
  family: ThemeFamily;
  mode: ThemeMode;
};

export function themeStorageKey(userId: string = getCurrentUserId()): string {
  return storageKey("theme", userId);
}

export function resolveThemeFamily(mode: "focus" | "studio" | "unset" | null | undefined): ThemeFamily {
  return mode === "studio" ? "studio-ledger" : "focus-paper";
}

export function readThemePreference(): ThemePreference | null {
  const raw = localStorage.getItem(themeStorageKey());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { mode?: unknown };
    return parsed.mode === "dark" || parsed.mode === "light" ? { mode: parsed.mode } : null;
  } catch {
    return null;
  }
}

export function readThemeState(mode: "focus" | "studio" | "unset" | null | undefined): ThemeState {
  return {
    family: resolveThemeFamily(mode),
    mode: readThemePreference()?.mode ?? "light",
  };
}

export function writeThemeMode(
  mode: ThemeMode,
  family: ThemeFamily = (document.documentElement.dataset.theme as ThemeFamily | undefined) ?? "focus-paper",
): void {
  localStorage.setItem(themeStorageKey(), JSON.stringify({ mode }));
  applyThemeState({ family, mode });
}

export function applyThemeState(state: ThemeState): void {
  const root = document.documentElement;
  root.dataset.theme = state.family;
  root.dataset.themeMode = state.mode;
  if (state.mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}
