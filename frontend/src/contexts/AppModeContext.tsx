import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { getCurrentUserId } from "../services/currentUser";
import { storageKey } from "../services/storageKeys";
import { applyThemeState, readThemeState } from "../services/theme";

export type AppMode = "focus" | "studio";
export type ModeSelectionState = "unset" | AppMode;

type AppModeApi = {
  mode: AppMode | null;
  selectionState: ModeSelectionState;
  setMode: (mode: AppMode) => void;
};

const AppModeContext = createContext<AppModeApi | null>(null);

function appModeStorageKey(userId: string): string {
  return storageKey("app_mode", userId);
}

function readSelectionState(userId: string): ModeSelectionState {
  const raw = localStorage.getItem(appModeStorageKey(userId));
  if (raw === "focus" || raw === "studio") return raw;
  return "unset";
}

export function AppModeProvider(props: { children: React.ReactNode }) {
  const auth = useAuth();
  const userId = auth.user?.id ?? getCurrentUserId();
  const [selectionState, setSelectionState] = useState<ModeSelectionState>(() => readSelectionState(userId));

  useEffect(() => {
    setSelectionState(readSelectionState(userId));
  }, [userId]);

  useEffect(() => {
    applyThemeState(readThemeState(selectionState));
  }, [selectionState]);

  const setMode = (mode: AppMode) => {
    localStorage.setItem(appModeStorageKey(userId), mode);
    setSelectionState(mode);
  };

  const value = useMemo<AppModeApi>(
    () => ({
      mode: selectionState === "unset" ? null : selectionState,
      selectionState,
      setMode,
    }),
    [selectionState],
  );

  return <AppModeContext.Provider value={value}>{props.children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeApi {
  const value = useContext(AppModeContext);
  if (!value) throw new Error("useAppMode must be used within AppModeProvider");
  return value;
}
