import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OutlineListItem } from "../../types";
import { WritingStudioToolsDrawer, WritingWorkspace, type WritingStudioToolsDrawerProps, type WritingWorkspaceProps } from "./WritingPageSections";

const noop = () => undefined;

function buildStudioToolsDrawerProps(
  overrides: Partial<WritingStudioToolsDrawerProps> = {},
): WritingStudioToolsDrawerProps {
  return {
    open: true,
    batchProgressText: "",
    hasActiveChapter: true,
    hasChapters: true,
    hasPlan: true,
    activeChapterStatus: "drafting",
    hasContent: true,
    loadingChapter: false,
    dirty: false,
    generating: false,
    saving: false,
    autoUpdatesTriggering: false,
    continuityRevisionActive: false,
    continuityRevisionHasExcerpt: false,
    continuityRevisionProgressStatus: null,
    onClose: () => undefined,
    onOpenChapterList: () => undefined,
    onCreateChapter: () => undefined,
    onOpenBatch: () => undefined,
    onOpenHistory: () => undefined,
    onOpenAiGenerate: () => undefined,
    onSaveChapter: () => undefined,
    onOpenReview: () => undefined,
    onOpenPromptInspector: () => undefined,
    onOpenContextPreview: () => undefined,
    onOpenMemoryUpdate: () => undefined,
    onOpenForeshadow: () => undefined,
    onOpenTables: () => undefined,
    onOpenTaskCenter: () => undefined,
    onLocateContinuityRevision: () => undefined,
    onReturnToContinuityReview: () => undefined,
    ...overrides,
  };
}

function buildWritingWorkspaceProps(options?: {
  appMode?: "focus" | "studio";
  continuitySaved?: boolean;
  batchProgressText?: string;
}): WritingWorkspaceProps {
  const appMode = options?.appMode ?? "studio";
  const continuitySaved = options?.continuitySaved ?? false;
  const outline: OutlineListItem = {
    id: "outline-1",
    title: "主线大纲",
    has_chapters: true,
    created_at: "2026-03-17 18:00:00",
    updated_at: "2026-03-17 18:00:00",
  };

  return {
    toolbarProps: {
      appMode,
      outlines: [outline],
      activeOutlineId: outline.id,
      chaptersCount: 2,
      aiGenerateDisabled: false,
      saveDisabled: false,
      saveLabel: "保存",
      onSwitchOutline: noop,
      onOpenAiGenerate: noop,
      onCreateChapter: noop,
      onSaveChapter: noop,
      onOpenReview: noop,
      onOpenStudioTools: noop,
    },
    workbenchProps: {
      batchProgressText: options?.batchProgressText ?? "",
      onOpenPromptInspector: noop,
      onOpenContextPreview: noop,
      onOpenHistory: noop,
      onOpenMemoryUpdate: noop,
      onOpenForeshadow: noop,
      onOpenTaskCenter: noop,
      onOpenStudioTools: noop,
    },
    chapterListProps: {
      chapters: [
        {
          id: "chapter-1",
          project_id: "project-1",
          outline_id: outline.id,
          number: 1,
          title: "第一章",
          status: "drafting",
          updated_at: "2026-03-17 18:00:00",
          has_plan: true,
          has_summary: false,
          has_content: true,
        },
      ],
      activeId: "chapter-1",
      onSelectChapter: noop,
      onOpenDrawer: noop,
    },
    editorProps: {
      appMode,
      activeChapter: {
        id: "chapter-1",
        project_id: "project-1",
        outline_id: outline.id,
        number: 1,
        title: "第一章",
        status: continuitySaved ? "done" : "drafting",
        updated_at: "2026-03-17 18:00:00",
        plan: "主角决定离开故乡。",
        content_md: "正文已经起草。",
        summary: "主角准备出发。",
      },
      hasChapters: true,
      form: {
        title: "第一章",
        plan: "主角决定离开故乡。",
        content_md: "正文已经起草。",
        summary: "主角准备出发。",
        status: continuitySaved ? "done" : "drafting",
      },
      dirty: false,
      isDoneReadonly: false,
      loadingChapter: false,
      generating: false,
      saving: false,
      autoUpdatesTriggering: false,
      continuityRevision: continuitySaved
        ? {
            id: "revision-1",
            title: "设定冲突",
            typeLabel: "连续性",
            excerpt: "正文片段",
            hasExcerpt: true,
            progressStatus: "saved",
          }
        : null,
      continuityRevisionChecklist: [],
      continuityRevisionQueue: continuitySaved
        ? [{ id: "revision-1", title: "设定冲突", typeLabel: "连续性", isActive: true, progressStatus: "saved" }]
        : [],
      continuityRevisionQueueNavigation: {
        activeIndex: continuitySaved ? 0 : -1,
        total: continuitySaved ? 1 : 0,
        previousId: null,
        nextId: null,
      },
      returnToContinuityAfterComplete: false,
      contentEditorTab: "edit",
      onContentEditorTabChange: noop,
      onTitleChange: noop,
      onStatusChange: noop,
      onPlanChange: noop,
      onContentChange: noop,
      onSummaryChange: noop,
      onContentTextareaRef: noop,
      onOpenAnalysis: noop,
      onOpenChapterTrace: noop,
      onOpenChapterList: noop,
      onCreateChapter: noop,
      onDeleteChapter: noop,
      onSaveAndTriggerAutoUpdates: noop,
      onSaveChapter: noop,
      onReopenDrafting: noop,
      onLocateContinuityRevision: noop,
      onReturnToContinuityReview: noop,
      onDismissContinuityRevision: noop,
      onActivateContinuityRevisionQueueItem: noop,
      onRemoveContinuityRevisionQueueItem: noop,
      onActivatePreviousContinuityRevision: noop,
      onActivateNextContinuityRevision: noop,
      onCompleteContinuityRevisionAndAdvance: noop,
      onReturnToContinuityAfterCompleteChange: noop,
    },
  };
}

describe("WritingStudioToolsDrawer", () => {
  it("renders chapter guidance when no active chapter is selected", () => {
    const html = renderToStaticMarkup(
      <WritingStudioToolsDrawer
        {...buildStudioToolsDrawerProps({
          hasActiveChapter: false,
          hasChapters: true,
          hasPlan: false,
          activeChapterStatus: null,
          hasContent: false,
        })}
      />,
    );

    expect(html).toContain("本章工作台");
    expect(html).toContain("当前章节");
    expect(html).toContain("未选择章节");
    expect(html).toContain("现在先做什么");
    expect(html).toContain("先进入要写的章节");
    expect(html).toContain("先打开章节再做校验");
    expect(html).toContain("这些能力要围绕章节落地");
    expect(html).toContain("打开章节目录");
    expect(html).toContain("更多回看动作");
    expect(html).toContain("更多资料检查");
  });

  it("renders continuity review guidance when a revision has been saved", () => {
    const html = renderToStaticMarkup(
      <WritingStudioToolsDrawer
        {...buildStudioToolsDrawerProps({
          activeChapterStatus: "done",
          continuityRevisionActive: true,
          continuityRevisionHasExcerpt: true,
          continuityRevisionProgressStatus: "saved",
        })}
      />,
    );

    expect(html).toContain("稿面状态");
    expect(html).toContain("已保存");
    expect(html).toContain("连续性");
    expect(html).toContain("待复核");
    expect(html).toContain("回连续性台复核这一条");
    expect(html).toContain("回连续性台复核");
    expect(html).toContain("进入校对");
    expect(html).toContain("复核前先补看上下文");
    expect(html).toContain("先回连续性台确认，再决定是否同步");
    expect(html).toContain("更多回看动作");
    expect(html).toContain("更多资料检查");
    expect(html).toContain("更多连续性处理");
    expect(html).toContain("参考资料预览");
    expect(html).toContain("生成记录");
    expect(html).toContain("任务中心");
    expect(html).toContain("表格面板");
  });

  it("prioritizes task center guidance when batch work is running", () => {
    const html = renderToStaticMarkup(
      <WritingStudioToolsDrawer
        {...buildStudioToolsDrawerProps({
          batchProgressText: "（2/5）",
          saving: true,
          continuityRevisionActive: true,
          continuityRevisionProgressStatus: "saved",
        })}
      />,
    );

    expect(html).toContain("批量任务 （2/5）");
    expect(html).toContain("稿面状态");
    expect(html).toContain("保存中");
    expect(html).toContain("先确认后台任务有没有落地");
    expect(html).toContain("任务中心");
  });
});

describe("WritingWorkspace", () => {
  it("renders mobile workflow rail in studio mode", () => {
    const html = renderToStaticMarkup(
      <WritingWorkspace {...buildWritingWorkspaceProps({ appMode: "studio", continuitySaved: true, batchProgressText: "（1/3）" })} />,
    );

    expect(html).toContain("本章进度详情");
    expect(html).toContain("本章准备度");
    expect(html).toContain("待复核 1 条");
    expect(html).toContain("更多正文操作");
    expect(html).toContain("分析");
    expect(html).toContain("标注回溯");
    expect(html).toContain("保存并同步故事资料");
    expect(html).toContain("写前准备");
    expect(html).toContain("已定事实");
    expect(html).toContain("写作阶段");
    expect(html).toContain("校验阶段");
    expect(html).toContain("连续性阶段");
    expect(html).toContain("更多写作动作");
    expect(html).toContain("更多资料检查");
    expect(html).toContain("更多连续性处理");
    expect(html).toContain("批量任务");
  });

  it("does not render mobile workflow rail in focus mode", () => {
    const html = renderToStaticMarkup(<WritingWorkspace {...buildWritingWorkspaceProps({ appMode: "focus" })} />);

    expect(html).toContain("本章进度详情");
    expect(html).toContain("更多正文操作");
    expect(html).not.toContain("保存并同步故事资料");
    expect(html).not.toContain("写作阶段");
    expect(html).not.toContain("校验阶段");
    expect(html).not.toContain("连续性阶段");
  });
});
