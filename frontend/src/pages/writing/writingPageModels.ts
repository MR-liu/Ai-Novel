import { buildStudioSystemPath } from "../../lib/projectRoutes";
import type { ContinuityRevisionProgressStatus } from "../../services/continuityRevisionQueue";
import type { ChapterStatus } from "../../types";

export type ChapterAutoUpdatesTriggerResult = {
  tasks: Record<string, string | null>;
  chapter_token: string | null;
};

export const CHAPTER_LIST_SIDEBAR_WIDTH_CLASS = "w-[280px]" as const;

function hasMeaningfulText(value: string | null | undefined): boolean {
  return Boolean(String(value || "").trim());
}

export function pickFirstProjectTaskId(tasks: Record<string, string | null> | null | undefined): string | null {
  if (!tasks) return null;
  for (const value of Object.values(tasks)) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function buildWritingTaskCenterHref(projectId: string, chapterId?: string | null): string {
  const params = new URLSearchParams();
  if (chapterId) params.set("chapterId", chapterId);
  const base = buildStudioSystemPath(projectId, "tasks");
  return `${base}${params.toString() ? `?${params.toString()}` : ""}`;
}

export function buildProjectTaskCenterHref(projectId?: string, projectTaskId?: string | null): string | null {
  if (!projectId || !projectTaskId) return null;
  return `${buildStudioSystemPath(projectId, "tasks")}?project_task_id=${encodeURIComponent(projectTaskId)}`;
}

export function buildBatchTaskCenterHref(projectId?: string, projectTaskId?: string | null): string | null {
  return buildProjectTaskCenterHref(projectId, projectTaskId);
}

export function summarizeWritingPlan(plan: string | null | undefined, maxLength = 92): string {
  const trimmed = String(plan || "").replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "还没有填写本章要点。先用一句话写清这一章要发生什么，后面的起草、校对和连续性检查都会更稳。";
  }
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export type WritingWorkbenchNextStepInput = {
  status: ChapterStatus | null | undefined;
  dirty: boolean;
  hasPlan: boolean;
  hasContent: boolean;
  generating: boolean;
  saving: boolean;
  autoUpdatesTriggering: boolean;
  continuityRevisionActive: boolean;
  continuityRevisionProgressStatus: ContinuityRevisionProgressStatus | null | undefined;
};

export function getWritingWorkbenchNextStep(input: WritingWorkbenchNextStepInput): {
  title: string;
  description: string;
} {
  if (input.generating) {
    return {
      title: "等待这一轮生成完成",
      description: "先让当前草稿落稳，再决定是继续扩写、局部改写，还是进入校对。",
    };
  }
  if (input.saving) {
    return {
      title: "等待保存完成",
      description: "保存结束后再切章节、进校对或做连续性更新，能减少上下文错位。",
    };
  }
  if (input.autoUpdatesTriggering) {
    return {
      title: "等待连续性更新任务创建",
      description: "系统正在把本章的定稿变更送往后续更新链路，稍后可去任务中心查看。",
    };
  }
  if (input.continuityRevisionActive && input.continuityRevisionProgressStatus === "dirty") {
    return {
      title: "先保存当前连续性修订",
      description: "这一条已经开始改，但稿面还有未保存内容。先保存，再回连续性台复核会更稳。",
    };
  }
  if (input.dirty) {
    return {
      title: "先保存这一轮修改",
      description: "保存后再去校对、连续性更新或继续生成，会更稳，也更容易回看变更。",
    };
  }
  if (input.continuityRevisionActive && input.continuityRevisionProgressStatus === "saved") {
    return {
      title: "回连续性台复核这一条",
      description: "当前连续性修订已经保存，适合立刻回连续性台确认正文和记忆是否重新对齐。",
    };
  }
  if (input.continuityRevisionActive) {
    return {
      title: "先处理当前连续性问题",
      description: "这次写作是从连续性台带回来的修订。优先改顺这一条，再决定是否继续扩写。",
    };
  }
  if (!input.hasPlan) {
    return {
      title: "先补本章要点",
      description: "一句话写清这章要发生什么，AI 起草、资料召回和你自己的判断都会更稳定。",
    };
  }
  if (!input.hasContent) {
    return {
      title: "开始起草正文",
      description: "可以自己起笔，也可以先让 AI 给出一个骨架，然后再按你的节奏接管。",
    };
  }
  if (input.status === "done") {
    return {
      title: "进入校对或连续性更新",
      description: "本章已定稿，适合去通读节奏、检查伏笔，并把新事实同步到长期资料。",
    };
  }
  if (input.status === "planned") {
    return {
      title: "把这一章推进到草稿",
      description: "现在要点和正文已经有了雏形，可以继续扩写，等主线稳定后再定稿。",
    };
  }
  return {
    title: "继续扩写并准备校对",
    description: "当这一章的主冲突和节奏基本稳定后，就可以切到校对页做通读检查。",
  };
}

export type WritingReadinessItem = {
  key: "plan" | "content" | "summary";
  title: string;
  ready: boolean;
  summary: string;
};

export function getWritingWorkbenchReadinessItems(
  plan: string | null | undefined,
  content: string | null | undefined,
  summary: string | null | undefined,
): WritingReadinessItem[] {
  return [
    {
      key: "plan",
      title: "要点",
      ready: hasMeaningfulText(plan),
      summary: hasMeaningfulText(plan) ? "要点已整理" : "要点待补充",
    },
    {
      key: "content",
      title: "正文",
      ready: hasMeaningfulText(content),
      summary: hasMeaningfulText(content) ? "正文已有草稿" : "正文尚未起笔",
    },
    {
      key: "summary",
      title: "摘要",
      ready: hasMeaningfulText(summary),
      summary: hasMeaningfulText(summary) ? "摘要已记录" : "摘要可稍后补",
    },
  ];
}

export function getWritingWorkbenchReadiness(plan: string | null | undefined, content: string | null | undefined, summary: string | null | undefined): string[] {
  return getWritingWorkbenchReadinessItems(plan, content, summary).map((item) => item.summary);
}

export function getWritingWorkbenchRuntimeNote(input: {
  generating: boolean;
  autoUpdatesTriggering: boolean;
  batchProgressText: string;
}): string | null {
  if (input.generating) return "AI 正在接续写作，你可以先观察正文走向，再决定是否继续追加。";
  if (input.autoUpdatesTriggering) return "系统正在创建连续性更新任务，适合稍后去任务中心确认结果。";
  if (input.batchProgressText) return `批量生成仍在推进${input.batchProgressText}，如需排查可打开任务中心。`;
  return null;
}

export function getWritingWorkbenchMainActionGroup(input: {
  hasActiveChapter: boolean;
  hasChapters: boolean;
  hasContent: boolean;
  status: ChapterStatus | null | undefined;
  dirty: boolean;
  saving: boolean;
  continuityRevisionActive: boolean;
  continuityRevisionHasExcerpt: boolean;
  continuityRevisionProgressStatus: ContinuityRevisionProgressStatus | null | undefined;
}): WritingWorkbenchMainActionGroup {
  if (!input.hasActiveChapter) {
    return input.hasChapters
      ? {
          title: "先进入要写的章节",
          copy: "先从目录打开这一轮要处理的章节，再决定是继续写正文还是补一版草稿。",
          actions: [
            { key: "open_chapter_list", label: "打开章节目录", tone: "primary" },
            { key: "create_chapter", label: "新建章节", tone: "secondary" },
          ],
        }
      : {
          title: "先创建第一章",
          copy: "当前还没有章节可推进。先建一章，把故事主线落到可写的容器里。",
          actions: [{ key: "create_chapter", label: "新建章节", tone: "primary" }],
        };
  }

  if (input.continuityRevisionActive && input.continuityRevisionProgressStatus === "dirty") {
    return {
      title: "先保存这条连续性修订",
      copy: "当前问题已经开始修改，但稿面还没保存。先落盘，再回连续性台复核最稳。",
      actions: [
        { key: "save_chapter", label: "保存当前修订", tone: "primary" },
        { key: "return_to_continuity", label: "回连续性台", tone: "secondary" },
      ],
    };
  }

  if (input.continuityRevisionActive && input.continuityRevisionProgressStatus === "saved") {
    return {
      title: "先回连续性台复核",
      copy: "这一条连续性修订已经保存，下一步更适合确认正文和记忆是否重新对齐。",
      actions: [
        { key: "return_to_continuity", label: "回连续性台复核", tone: "primary" },
        { key: "open_review", label: "进入校对", tone: "secondary" },
      ],
    };
  }

  if (input.continuityRevisionActive) {
    return {
      title: "先把当前连续性问题改顺",
      copy: "这是从连续性台带回来的修订任务。优先处理这一条，再决定要不要继续扩写。",
      actions: input.continuityRevisionHasExcerpt
        ? [
            { key: "locate_continuity_excerpt", label: "定位引用句", tone: "primary" },
            { key: "return_to_continuity", label: "回连续性台", tone: "secondary" },
          ]
        : [{ key: "return_to_continuity", label: "回连续性台", tone: "secondary" }],
    };
  }

  if (input.saving || input.dirty) {
    return {
      title: "先保存这一轮写作",
      copy: "当前稿面还有变更待落盘。先保存，再决定是否起草下一段或进入校对。",
      actions: [
        { key: "save_chapter", label: "保存章节", tone: "primary" },
        { key: "open_review", label: "进入校对", tone: "secondary" },
      ],
    };
  }

  if (!input.hasContent) {
    return {
      title: "先起一版正文",
      copy: "这章还没有可读正文。可以自己起笔，也可以先让 AI 给出一版骨架。",
      actions: [{ key: "open_ai_generate", label: "AI 起草", tone: "primary" }],
    };
  }

  if (input.status === "done") {
    return {
      title: "进入校对并同步后续",
      copy: "这一章已经定稿，适合去通读收口，或把变化同步到连续性链路。",
      actions: [
        { key: "open_review", label: "进入校对", tone: "primary" },
        { key: "open_memory_update", label: "连续性更新", tone: "secondary" },
      ],
    };
  }

  return {
    title: "继续推进正文主线",
    copy: "当前主任务仍然是继续写这一章。辅助入口按需打开，不要让工具打断主稿推进。",
    actions: [
      { key: "open_ai_generate", label: "AI 起草", tone: "secondary" },
      { key: "open_review", label: "进入校对", tone: "secondary" },
    ],
  };
}

export function getWritingWorkbenchResearchSection(input: {
  hasActiveChapter: boolean;
  hasContent: boolean;
  generating: boolean;
  continuityRevisionActive: boolean;
  continuityRevisionProgressStatus: ContinuityRevisionProgressStatus | null | undefined;
}): WritingWorkbenchSupportSection {
  if (!input.hasActiveChapter) {
    return {
      title: "先打开章节再做校验",
      copy: "研究和校验最好围绕具体章节展开。先进入一章，再决定要不要看上下文或生成前检查。",
      actions: [{ key: "open_chapter_list", label: "打开章节目录", tone: "primary" }],
    };
  }

  if (input.continuityRevisionActive) {
    return {
      title:
        input.continuityRevisionProgressStatus === "saved" ? "复核前先补看上下文" : "需要时再补看上下文",
      copy:
        input.continuityRevisionProgressStatus === "saved"
          ? "这条连续性修订已经保存；如果回连续性台前还想确认来源，可以先看参考资料或生成记录。"
          : "当前更应该先把问题句改顺；如果拿不准，再打开参考资料预览或生成记录核对来源。",
      actions: [
        { key: "open_context_preview", label: "参考资料预览", tone: "primary" },
        { key: "open_history", label: "生成记录", tone: "secondary" },
      ],
    };
  }

  if (!input.hasContent) {
    return {
      title: "起草前先核对上下文",
      copy: "准备交给 AI 之前，先看生成前检查和参考资料，会比直接点生成更稳。",
      actions: [
        { key: "open_prompt_inspector", label: "生成前检查", tone: "primary" },
        { key: "open_context_preview", label: "参考资料预览", tone: "secondary" },
      ],
    };
  }

  if (input.generating) {
    return {
      title: "生成前后都从这里校验",
      copy: "这一轮生成正在推进。需要判断上下文是否偏移时，优先看生成记录和参考资料。",
      actions: [
        { key: "open_history", label: "生成记录", tone: "primary" },
        { key: "open_context_preview", label: "参考资料预览", tone: "secondary" },
      ],
    };
  }

  return {
    title: "先核对参考资料和生成前上下文",
    copy: "当正文已经有内容时，最常用的校验仍是先看参考资料，再决定要不要打开生成前检查或历史记录。",
    actions: [
      { key: "open_context_preview", label: "参考资料预览", tone: "primary" },
      { key: "open_prompt_inspector", label: "生成前检查", tone: "secondary" },
      { key: "open_history", label: "生成记录", tone: "secondary" },
    ],
  };
}

export function getWritingWorkbenchContinuitySection(input: {
  hasActiveChapter: boolean;
  status: ChapterStatus | null | undefined;
  dirty: boolean;
  autoUpdatesTriggering: boolean;
  batchProgressText: string;
  continuityRevisionActive: boolean;
  continuityRevisionProgressStatus: ContinuityRevisionProgressStatus | null | undefined;
}): WritingWorkbenchSupportSection {
  if (!input.hasActiveChapter) {
    return {
      title: "这些能力要围绕章节落地",
      copy: "连续性同步、任务和伏笔都最好挂在具体章节上。先打开章节，再决定是否进入这些底层工具。",
      actions: [{ key: "open_chapter_list", label: "打开章节目录", tone: "primary" }],
    };
  }

  if (input.autoUpdatesTriggering || input.batchProgressText) {
    return {
      title: "先确认后台任务有没有落地",
      copy: "当前有后台任务在跑。下一步最值得先看任务中心，再决定要不要继续做连续性同步或更深排查。",
      actions: [
        { key: "open_task_center", label: "任务中心", tone: "primary" },
        { key: "open_studio_tools", label: "打开工作台抽屉", tone: "secondary" },
      ],
    };
  }

  if (input.continuityRevisionActive) {
    return {
      title:
        input.continuityRevisionProgressStatus === "saved" ? "先回连续性台确认，再决定是否同步" : "先完成当前修订，再处理全局同步",
      copy:
        input.continuityRevisionProgressStatus === "saved"
          ? "这条问题已经改完并保存，先回连续性台确认没有新偏移，再决定是否做连续性更新。"
          : "当前还在处理具体问题句，更底层的同步和任务先放后，避免把注意力拉散。",
      actions: [
        { key: "return_to_continuity", label: "回连续性台", tone: "primary" },
        { key: "open_task_center", label: "任务中心", tone: "secondary" },
      ],
    };
  }

  if (input.status === "done" && !input.dirty) {
    return {
      title: "把定稿变化同步到全局",
      copy: "这一章已经定稿，最适合现在去做连续性更新、看伏笔闭环和确认后台任务有没有真正落地。",
      actions: [
        { key: "open_memory_update", label: "连续性更新", tone: "primary" },
        { key: "open_foreshadow", label: "伏笔面板", tone: "secondary" },
        { key: "open_task_center", label: "任务中心", tone: "secondary" },
      ],
    };
  }

  return {
    title: "底层同步和任务先放在后面",
    copy: "当前仍在草稿推进阶段。真正定稿后再做连续性更新和任务确认，通常更省来回返工。",
    actions: [
      { key: "open_foreshadow", label: "伏笔面板", tone: "secondary" },
      { key: "open_task_center", label: "任务中心", tone: "secondary" },
      { key: "open_studio_tools", label: "打开工作台抽屉", tone: "secondary" },
    ],
  };
}

export type WritingContinuityRevisionChecklistItem = {
  key: "locate" | "revise" | "save";
  title: string;
  done: boolean;
  hint: string;
};

export type WritingContinuityRevisionQueueNavInput = Array<{
  id: string;
  isActive: boolean;
}>;

export type WritingContinuityRevisionQueueNavigation = {
  activeIndex: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
};

export type WritingContinuityRevisionProgressBadge = {
  label: string;
  tone: "info" | "warning";
};

export type WritingContinuityRevisionQueueSummary = {
  total: number;
  dirtyCount: number;
  savedCount: number;
};

export type WritingWorkbenchMainActionKey =
  | "create_chapter"
  | "open_chapter_list"
  | "save_chapter"
  | "open_ai_generate"
  | "open_review"
  | "return_to_continuity"
  | "locate_continuity_excerpt"
  | "open_memory_update"
  | "open_context_preview"
  | "open_prompt_inspector"
  | "open_history"
  | "open_foreshadow"
  | "open_task_center"
  | "open_studio_tools";

export type WritingWorkbenchMainActionItem = {
  key: WritingWorkbenchMainActionKey;
  label: string;
  tone: "primary" | "secondary";
};

export type WritingWorkbenchMainActionGroup = {
  title: string;
  copy: string;
  actions: WritingWorkbenchMainActionItem[];
};

export type WritingWorkbenchSupportSection = {
  title: string;
  copy: string;
  actions: WritingWorkbenchMainActionItem[];
};

export function getWritingContinuityRevisionChecklist(input: {
  hasExcerpt: boolean;
  located: boolean;
  draftChanged: boolean;
  dirty: boolean;
}): WritingContinuityRevisionChecklistItem[] {
  const locateDone = input.hasExcerpt ? input.located : true;

  return [
    {
      key: "locate",
      title: input.hasExcerpt ? "先回到问题句" : "先确认问题位置",
      done: locateDone,
      hint: input.hasExcerpt
        ? locateDone
          ? "已经定位过引用句，可以直接沿着这段正文继续修。"
          : "先定位到引用句，再改正文会更稳。"
        : "当前没有可直接定位的引用句，先按标题和类型判断这一处该怎么改。",
    },
    {
      key: "revise",
      title: "开始改这一段正文",
      done: input.draftChanged,
      hint: input.draftChanged
        ? input.dirty
          ? "你已经开始修订，但这轮改动还没保存。"
          : "这一轮修订已经写回正文。"
        : "先把冲突句改顺，再决定是否继续扩写后文。",
    },
    {
      key: "save",
      title: "保存这一轮修订",
      done: input.draftChanged && !input.dirty,
      hint:
        input.draftChanged && !input.dirty
          ? "当前稿面已经保存，可以回连续性台复核。"
          : input.draftChanged
            ? "先保存当前稿面，再回连续性台复核会更稳。"
            : "还没有新的改动需要保存。",
      },
  ];
}

export function getWritingContinuityRevisionProgressBadge(
  status: ContinuityRevisionProgressStatus | null | undefined,
): WritingContinuityRevisionProgressBadge | null {
  switch (status) {
    case "dirty":
      return { label: "未保存改动", tone: "warning" };
    case "saved":
      return { label: "已保存待复核", tone: "info" };
    default:
      return null;
  }
}

export function summarizeWritingContinuityRevisionQueue(
  items: Array<{ progressStatus: ContinuityRevisionProgressStatus | null | undefined }>,
): WritingContinuityRevisionQueueSummary {
  return {
    total: items.length,
    dirtyCount: items.filter((item) => item.progressStatus === "dirty").length,
    savedCount: items.filter((item) => item.progressStatus === "saved").length,
  };
}

export function getWritingContinuityRevisionQueueNavigation(
  items: WritingContinuityRevisionQueueNavInput,
): WritingContinuityRevisionQueueNavigation {
  const activeIndex = items.findIndex((item) => item.isActive);
  return {
    activeIndex,
    total: items.length,
    previousId: activeIndex > 0 ? items[activeIndex - 1]?.id ?? null : null,
    nextId: activeIndex >= 0 ? items[activeIndex + 1]?.id ?? null : null,
  };
}
