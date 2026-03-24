import type { ComponentProps } from "react";

import { AiGenerateDrawer } from "../../components/writing/AiGenerateDrawer";
import { BatchGenerationModal } from "../../components/writing/BatchGenerationModal";
import { ChapterAnalysisModal } from "../../components/writing/ChapterAnalysisModal";
import { ContentOptimizeCompareDrawer } from "../../components/writing/ContentOptimizeCompareDrawer";
import { ContextPreviewDrawer } from "../../components/writing/ContextPreviewDrawer";
import { CreateChapterDialog } from "../../components/writing/CreateChapterDialog";
import { ForeshadowDrawer } from "../../components/writing/ForeshadowDrawer";
import { GenerationHistoryDrawer } from "../../components/writing/GenerationHistoryDrawer";
import { MemoryUpdateDrawer } from "../../components/writing/MemoryUpdateDrawer";
import { PostEditCompareDrawer } from "../../components/writing/PostEditCompareDrawer";
import { PromptInspectorDrawer } from "../../components/writing/PromptInspectorDrawer";
import { TablesPanel } from "../../components/writing/TablesPanel";

import { WritingStudioToolsDrawer, type WritingStudioToolsDrawerProps } from "./WritingWorkspace";

export type WritingPageOverlaysProps = {
  studioToolsDrawerProps: WritingStudioToolsDrawerProps;
  createChapterDialogProps: ComponentProps<typeof CreateChapterDialog>;
  batchGenerationModalProps: ComponentProps<typeof BatchGenerationModal>;
  chapterAnalysisModalProps: ComponentProps<typeof ChapterAnalysisModal>;
  aiGenerateDrawerProps: ComponentProps<typeof AiGenerateDrawer>;
  postEditCompareDrawerProps: ComponentProps<typeof PostEditCompareDrawer>;
  contentOptimizeCompareDrawerProps: ComponentProps<typeof ContentOptimizeCompareDrawer>;
  promptInspectorDrawerProps: ComponentProps<typeof PromptInspectorDrawer>;
  contextPreviewDrawerProps: ComponentProps<typeof ContextPreviewDrawer>;
  tablesPanelProps: ComponentProps<typeof TablesPanel>;
  memoryUpdateDrawerProps: ComponentProps<typeof MemoryUpdateDrawer>;
  foreshadowDrawerProps: ComponentProps<typeof ForeshadowDrawer>;
  generationHistoryDrawerProps: ComponentProps<typeof GenerationHistoryDrawer>;
};

export function WritingPageOverlays(props: WritingPageOverlaysProps) {
  return (
    <>
      <WritingStudioToolsDrawer {...props.studioToolsDrawerProps} />
      <CreateChapterDialog {...props.createChapterDialogProps} />
      <BatchGenerationModal {...props.batchGenerationModalProps} />
      <ChapterAnalysisModal {...props.chapterAnalysisModalProps} />
      <AiGenerateDrawer {...props.aiGenerateDrawerProps} />
      <PostEditCompareDrawer {...props.postEditCompareDrawerProps} />
      <ContentOptimizeCompareDrawer {...props.contentOptimizeCompareDrawerProps} />
      <PromptInspectorDrawer {...props.promptInspectorDrawerProps} />
      <ContextPreviewDrawer {...props.contextPreviewDrawerProps} />
      <TablesPanel {...props.tablesPanelProps} />
      <MemoryUpdateDrawer {...props.memoryUpdateDrawerProps} />
      <ForeshadowDrawer {...props.foreshadowDrawerProps} />
      <GenerationHistoryDrawer {...props.generationHistoryDrawerProps} />
    </>
  );
}
