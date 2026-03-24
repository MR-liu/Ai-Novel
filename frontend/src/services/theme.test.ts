import { beforeEach, describe, expect, it } from "vitest";

import { applyThemeState, readThemePreference, readThemeState, resolveThemeFamily, themeStorageKey, writeThemeMode } from "./theme";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function createLocalStorageMock(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function createDocumentMock() {
  const classes = new Set<string>();
  return {
    documentElement: {
      dataset: {} as Record<string, string>,
      classList: {
        add: (name: string) => {
          classes.add(name);
        },
        remove: (name: string) => {
          classes.delete(name);
        },
        contains: (name: string) => classes.has(name),
      },
    },
  };
}

describe("theme service", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createLocalStorageMock(),
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: createDocumentMock(),
    });
  });

  it("resolves theme family from app mode", () => {
    expect(resolveThemeFamily("focus")).toBe("focus-paper");
    expect(resolveThemeFamily("studio")).toBe("studio-ledger");
    expect(resolveThemeFamily("unset")).toBe("focus-paper");
    expect(resolveThemeFamily(null)).toBe("focus-paper");
  });

  it("reads persisted theme mode and derives family from mode", () => {
    localStorage.setItem(themeStorageKey(), JSON.stringify({ mode: "dark" }));

    expect(readThemePreference()).toEqual({ mode: "dark" });
    expect(readThemeState("studio")).toEqual({
      family: "studio-ledger",
      mode: "dark",
    });
  });

  it("falls back to light mode when no preference is stored", () => {
    expect(readThemePreference()).toBeNull();
    expect(readThemeState("focus")).toEqual({
      family: "focus-paper",
      mode: "light",
    });
  });

  it("applies theme family and mode to the document root", () => {
    applyThemeState({ family: "studio-ledger", mode: "dark" });

    expect(document.documentElement.dataset.theme).toBe("studio-ledger");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    applyThemeState({ family: "focus-paper", mode: "light" });

    expect(document.documentElement.dataset.theme).toBe("focus-paper");
    expect(document.documentElement.dataset.themeMode).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("writes theme mode using the current root theme family", () => {
    document.documentElement.dataset.theme = "studio-ledger";

    writeThemeMode("dark");

    expect(readThemePreference()).toEqual({ mode: "dark" });
    expect(document.documentElement.dataset.theme).toBe("studio-ledger");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
