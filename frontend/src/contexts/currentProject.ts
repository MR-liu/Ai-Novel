import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

import type { Project } from "../types";

export type CurrentProjectError = {
  code: string;
  message: string;
  requestId: string;
  status: number;
};

export type CurrentProjectState = {
  project: Project | null;
  loading: boolean;
  error: CurrentProjectError | null;
  refresh: () => Promise<void>;
  setProject: Dispatch<SetStateAction<Project | null>>;
};

export const CurrentProjectContext = createContext<CurrentProjectState | null>(null);

export function useCurrentProject(): CurrentProjectState {
  const ctx = useContext(CurrentProjectContext);
  if (!ctx) throw new Error("useCurrentProject must be used within CurrentProjectProvider");
  return ctx;
}
