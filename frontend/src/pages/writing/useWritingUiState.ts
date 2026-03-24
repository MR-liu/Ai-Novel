import { useEffect, useRef, useState } from "react";

import type { AppMode } from "../../contexts/AppModeContext";

export type AutoGenerateNextRequest = {
  chapterId: string;
  mode: "replace" | "append";
};

export function useWritingUiState(appMode: AppMode) {
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const [contentEditorTab, setContentEditorTab] = useState<"edit" | "preview">("edit");
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoGenerateNextRef = useRef<AutoGenerateNextRequest | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [studioToolsOpen, setStudioToolsOpen] = useState(false);
  const [promptInspectorOpen, setPromptInspectorOpen] = useState(false);
  const [postEditCompareOpen, setPostEditCompareOpen] = useState(false);
  const [contentOptimizeCompareOpen, setContentOptimizeCompareOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const [memoryUpdateOpen, setMemoryUpdateOpen] = useState(false);
  const [foreshadowOpen, setForeshadowOpen] = useState(false);
  const [autoUpdatesTriggering, setAutoUpdatesTriggering] = useState(false);

  useEffect(() => {
    if (appMode !== "studio") setStudioToolsOpen(false);
  }, [appMode]);

  return {
    chapterListOpen,
    setChapterListOpen,
    contentEditorTab,
    setContentEditorTab,
    contentTextareaRef,
    autoGenerateNextRef,
    aiOpen,
    setAiOpen,
    studioToolsOpen,
    setStudioToolsOpen,
    promptInspectorOpen,
    setPromptInspectorOpen,
    postEditCompareOpen,
    setPostEditCompareOpen,
    contentOptimizeCompareOpen,
    setContentOptimizeCompareOpen,
    tablesOpen,
    setTablesOpen,
    contextPreviewOpen,
    setContextPreviewOpen,
    memoryUpdateOpen,
    setMemoryUpdateOpen,
    foreshadowOpen,
    setForeshadowOpen,
    autoUpdatesTriggering,
    setAutoUpdatesTriggering,
  };
}
