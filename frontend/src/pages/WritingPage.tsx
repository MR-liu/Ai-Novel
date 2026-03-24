import { Suspense } from "react";

import { WizardNextBar } from "../components/atelier/WizardNextBar";
import { ToolContent } from "../components/layout/AppShell";
import { UnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";

import { lazyPage } from "./lazyPage";
import {
  WritingChapterListDrawer,
  WritingStreamFloatingCard,
  WritingWorkspace,
} from "./writing/WritingPageSections";
import { WRITING_PAGE_COPY } from "./writing/writingPageCopy";
import { useWritingPageState } from "./writing/useWritingPageState";

const LazyWritingPageOverlays = lazyPage(() => import("./writing/WritingPageOverlays"), (mod) => mod.WritingPageOverlays);

export function WritingPage() {
  const state = useWritingPageState();

  if (state.loading) {
    return <ToolContent className="text-subtext">{WRITING_PAGE_COPY.loading}</ToolContent>;
  }

  return (
    <ToolContent className="grid gap-4 pb-24">
      {state.showUnsavedGuard ? <UnsavedChangesGuard when={state.dirty} /> : null}
      <WritingWorkspace {...state.workspaceProps} />
      <WritingChapterListDrawer {...state.chapterListDrawerProps} />
      {state.hasVisibleOverlays ? (
        <Suspense fallback={null}>
          <LazyWritingPageOverlays {...state.overlaysProps} />
        </Suspense>
      ) : null}
      <WritingStreamFloatingCard {...state.streamFloatingProps} />
      <WizardNextBar {...state.wizardBarProps} />
    </ToolContent>
  );
}
