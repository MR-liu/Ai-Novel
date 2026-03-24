import { useEffect, useRef } from "react";

import { useProjectData } from "../../hooks/useProjectData";
import { apiJson } from "../../services/apiClient";
import { getWizardProjectChangedAt } from "../../services/wizard";
import type { Character, LLMPreset, Outline, OutlineListItem } from "../../types";

type WritingLoaded = {
  outlines: OutlineListItem[];
  outline: Outline;
  preset: LLMPreset;
  characters: Character[];
};

export function useWritingProjectQueryState(args: {
  projectId?: string;
  outletActive: boolean;
  dirty: boolean;
  refreshChapters: () => Promise<unknown>;
  refreshWizard: () => Promise<unknown>;
}) {
  const lastProjectChangedAtRef = useRef<string | null>(null);
  const writingQuery = useProjectData<WritingLoaded>(args.projectId, async (id) => {
    const [outlineRes, presetRes, charactersRes] = await Promise.all([
      apiJson<{ outline: Outline }>(`/api/projects/${id}/outline`),
      apiJson<{ llm_preset: LLMPreset }>(`/api/projects/${id}/llm_preset`),
      apiJson<{ characters: Character[] }>(`/api/projects/${id}/characters`),
    ]);
    const outlinesRes = await apiJson<{ outlines: OutlineListItem[] }>(`/api/projects/${id}/outlines`);
    return {
      outlines: outlinesRes.data.outlines,
      outline: outlineRes.data.outline,
      preset: presetRes.data.llm_preset,
      characters: charactersRes.data.characters,
    };
  });

  const refreshWriting = writingQuery.refresh;

  useEffect(() => {
    if (!args.projectId) {
      lastProjectChangedAtRef.current = null;
      return;
    }
    lastProjectChangedAtRef.current = getWizardProjectChangedAt(args.projectId);
  }, [args.projectId]);

  useEffect(() => {
    if (!args.projectId || !args.outletActive || args.dirty) return;
    const changedAt = getWizardProjectChangedAt(args.projectId);
    if ((changedAt ?? null) === (lastProjectChangedAtRef.current ?? null)) return;
    lastProjectChangedAtRef.current = changedAt;
    void refreshWriting();
    void args.refreshChapters();
    void args.refreshWizard();
  }, [args.dirty, args.outletActive, args.projectId, args.refreshChapters, args.refreshWizard, refreshWriting]);

  return {
    outlines: writingQuery.data?.outlines ?? [],
    outline: writingQuery.data?.outline ?? null,
    preset: writingQuery.data?.preset ?? null,
    characters: writingQuery.data?.characters ?? [],
    refreshWriting,
  };
}
