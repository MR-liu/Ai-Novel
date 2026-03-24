import { getAnnotationPriority, isAnnotationDone } from "../components/chapterAnalysis/memorySidebarFilters";
import { labelForAnnotationType, type MemoryAnnotation } from "../components/chapterAnalysis/types";
import type {
  ContinuityRevisionProgressStatus,
  ContinuityRevisionQueueItem,
} from "../services/continuityRevisionQueue";

export type ChapterAnalysisRevisionQueueNavigation = {
  activeIndex: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
};

export type ChapterAnalysisRevisionQueueFilter = "all" | "dirty" | "saved";

export type ChapterAnalysisRevisionReturnStatus = "unchanged" | "dirty" | "saved";

export type ChapterAnalysisActiveTaskSummary = {
  tone: "info" | "warning";
  title: string;
  summary: string;
  badges: Array<{ key: string; label: string; value: string }>;
  sections: Array<{ key: string; label: string; title: string; copy: string }>;
};

export type ChapterAnalysisRevisionReturnCallout = {
  tone: "info" | "warning";
  title: string;
  copy: string;
};

export type ChapterAnalysisRevisionProgressBadge = {
  label: string;
  tone: "info" | "warning";
};

export type ChapterAnalysisSavedReviewAction = {
  label: string;
  completionMessage: string;
  nextTargetId: string | null;
};

export type ChapterAnalysisRevisionQueueFilterSummary = {
  filter: ChapterAnalysisRevisionQueueFilter;
  items: ContinuityRevisionQueueItem[];
  counts: Record<ChapterAnalysisRevisionQueueFilter, number>;
  activeInView: boolean;
};

export function resolveChapterAnalysisAutoFocus(
  annotations: MemoryAnnotation[],
  annotationId: string | null,
  validIds: Set<string>,
): { annotation: MemoryAnnotation | null; shouldScroll: boolean } {
  if (!annotationId) {
    return { annotation: null, shouldScroll: false };
  }

  const annotation = annotations.find((item) => item.id === annotationId) ?? null;
  return {
    annotation,
    shouldScroll: Boolean(annotation && validIds.has(annotation.id)),
  };
}

export function resolveChapterAnalysisReturnTarget(
  queue: ContinuityRevisionQueueItem[],
  completedId: string,
): ContinuityRevisionQueueItem | null {
  const currentIndex = queue.findIndex((item) => item.id === completedId);
  const nextItems = queue.filter((item) => item.id !== completedId);

  return (currentIndex >= 0 ? nextItems[currentIndex] : null) ?? (currentIndex > 0 ? nextItems[currentIndex - 1] : null) ?? null;
}

export function resolveChapterAnalysisQueueNavigation(
  queue: ContinuityRevisionQueueItem[],
  activeId: string | null,
): ChapterAnalysisRevisionQueueNavigation {
  const activeIndex = activeId ? queue.findIndex((item) => item.id === activeId) : -1;
  return {
    activeIndex,
    total: queue.length,
    previousId: activeIndex > 0 ? queue[activeIndex - 1]?.id ?? null : null,
    nextId: activeIndex >= 0 && activeIndex < queue.length - 1 ? queue[activeIndex + 1]?.id ?? null : null,
  };
}

export function parseChapterAnalysisRevisionReturnStatus(
  value: string | null | undefined,
): ChapterAnalysisRevisionReturnStatus | null {
  switch (value) {
    case "unchanged":
    case "dirty":
    case "saved":
      return value;
    default:
      return null;
  }
}

export function getChapterAnalysisRevisionProgressBadge(
  status: ContinuityRevisionProgressStatus | null,
): ChapterAnalysisRevisionProgressBadge | null {
  switch (status) {
    case "dirty":
      return { label: "未保存改动", tone: "warning" };
    case "saved":
      return { label: "已保存待复核", tone: "info" };
    default:
      return null;
  }
}

export function filterChapterAnalysisRevisionQueue(args: {
  queue: ContinuityRevisionQueueItem[];
  filter: ChapterAnalysisRevisionQueueFilter;
  activeId: string | null;
}): ChapterAnalysisRevisionQueueFilterSummary {
  const counts: Record<ChapterAnalysisRevisionQueueFilter, number> = {
    all: args.queue.length,
    dirty: args.queue.filter((item) => item.progressStatus === "dirty").length,
    saved: args.queue.filter((item) => item.progressStatus === "saved").length,
  };

  const items =
    args.filter === "all" ? args.queue : args.queue.filter((item) => item.progressStatus === args.filter);
  const activeInView = Boolean(args.activeId && items.some((item) => item.id === args.activeId));

  return {
    filter: args.filter,
    items,
    counts,
    activeInView,
  };
}

export function buildChapterAnalysisSavedReviewAction(args: {
  filter: ChapterAnalysisRevisionQueueFilter;
  activeId: string | null;
  activeProgressStatus: ContinuityRevisionProgressStatus | null;
  visibleQueue: ContinuityRevisionQueueItem[];
}): ChapterAnalysisSavedReviewAction | null {
  if (args.filter !== "saved") return null;
  if (args.activeProgressStatus !== "saved") return null;
  if (!args.activeId) return null;
  if (!args.visibleQueue.some((item) => item.id === args.activeId)) return null;

  const nextTarget = resolveChapterAnalysisReturnTarget(args.visibleQueue, args.activeId);
  return {
    label: "复核完成并继续下一条",
    completionMessage: nextTarget ? "已复核当前条目，已切到下一条待复核项" : "已复核当前条目，当前复核视图已处理完",
    nextTargetId: nextTarget?.id ?? null,
  };
}

function formatImportanceLabel(importance: number): string {
  if (importance >= 0.85) return "高";
  if (importance >= 0.6) return "中";
  return "常规";
}

function formatQueueLabel(args: { isQueued: boolean; queueTotal: number; activeIndex: number }): string {
  if (!args.queueTotal) return "未入队";
  if (!args.isQueued) return `未入队 / 共 ${args.queueTotal} 条`;
  if (args.activeIndex >= 0) return `第 ${args.activeIndex + 1} / ${args.queueTotal} 条`;
  return `已入队 / 共 ${args.queueTotal} 条`;
}

export function buildChapterAnalysisActiveTaskSummary(args: {
  annotation: MemoryAnnotation | null;
  validIds: Set<string>;
  isQueued: boolean;
  queueTotal: number;
  queueActiveIndex: number;
  hasNextQueuedItem: boolean;
  progressStatus: ContinuityRevisionProgressStatus | null;
}): ChapterAnalysisActiveTaskSummary | null {
  const annotation = args.annotation;
  if (!annotation) return null;

  const valid = args.validIds.has(annotation.id);
  const done = isAnnotationDone(annotation);
  const priority = getAnnotationPriority({ annotation, validIds: args.validIds });

  const badges = [
    { key: "type", label: "类型", value: labelForAnnotationType(annotation.type) },
    { key: "importance", label: "重要度", value: formatImportanceLabel(annotation.importance) },
    {
      key: "queue",
      label: "修订队列",
      value: formatQueueLabel({
        isQueued: args.isQueued,
        queueTotal: args.queueTotal,
        activeIndex: args.queueActiveIndex,
      }),
    },
  ];
  const progressBadge = getChapterAnalysisRevisionProgressBadge(args.progressStatus);
  if (progressBadge) {
    badges.push({ key: "progress", label: "最近修订", value: progressBadge.label });
  }

  if (!valid) {
    return {
      tone: "warning",
      title: "先把这条问题重新落回正文或来源",
      summary: "当前命中还没有稳定映射到正文。先确认它到底对应哪一句、是否需要补正文落点或合并重复记忆，再回写作会更稳。",
      badges,
      sections: [
        {
          key: "why",
          label: "为什么先看它",
          title: "还没真正落到正文",
          copy: "如果问题连正文位置都不稳定，越早改稿越容易越改越偏。",
        },
        {
          key: "action",
          label: "现在该做什么",
          title: "先核来源，再决定怎么修",
          copy: "先看右侧条目内容和来源，再决定是补正文、改记忆，还是直接合并条目。",
        },
        {
          key: "finish",
          label: "处理完成算什么",
          title: "至少能明确落点",
          copy: args.isQueued
            ? "这条问题至少要能明确落到正文或被确认不需要改稿，之后再回写作继续队列会更顺。"
            : "这条问题至少要能明确落到正文或被确认不需要改稿，避免把悬空问题继续带回写作页。",
        },
      ],
    };
  }

  if (done) {
    return {
      tone: "info",
      title: "这条更适合做复核，不是第一轮重写",
      summary: "该命中已经标记完成。现在更适合确认正文高亮和记忆事实是否仍然一致，而不是立刻大改。",
      badges,
      sections: [
        {
          key: "why",
          label: "为什么现在看它",
          title: "检查是否又漂了",
          copy: "章节被多次修改后，原本已完成的问题也可能再次失衡，所以需要复核。",
        },
        {
          key: "action",
          label: "现在该做什么",
          title: "先回高亮快速通读",
          copy: "先看正文高亮是否仍然和这条记忆一致，没有新冲突再决定是否进入下一条。",
        },
        {
          key: "finish",
          label: "处理完成算什么",
          title: args.hasNextQueuedItem ? "稳定后切到下一条" : "稳定后回到写作推进",
          copy: args.hasNextQueuedItem
            ? "确认没有新的偏移后，就可以继续切到队列里的下一条问题。"
            : "确认没有新的偏移后，就可以回写作页继续推进章节，不必在这里停太久。",
        },
      ],
    };
  }

  if (priority.reasons.includes("important")) {
    return {
      tone: "warning",
      title: "建议优先处理这条高影响问题",
      summary: "这条命中的重要度较高，越晚处理，越容易把后续正文和设定一起带偏。",
      badges,
      sections: [
        {
          key: "why",
          label: "为什么先看它",
          title: "影响范围更大",
          copy: "高重要度的问题通常会牵动人物状态、剧情推进或设定事实，拖得越久越难回收。",
        },
        {
          key: "action",
          label: "现在该做什么",
          title: "先改冲突句，再补周边",
          copy: "优先回到正文高亮把核心冲突句改顺，再决定是否需要补记忆或同步其他段落。",
        },
        {
          key: "finish",
          label: "处理完成算什么",
          title: args.hasNextQueuedItem ? "修完就切下一条" : "修完就能回写作推进",
          copy: args.hasNextQueuedItem
            ? "把核心冲突修顺后，可以直接回写作页继续处理下一条，保持节奏不要断。"
            : "把核心冲突修顺后，就可以回写作页继续推进正文，不必在这里停留过久。",
        },
      ],
    };
  }

  return {
    tone: "info",
    title: "这条已经可以直接进入正文修订",
    summary: "当前条目能够稳定回到正文，适合现在处理。先改顺这处，再决定是否继续扩写或切下一条。",
    badges,
    sections: [
      {
        key: "why",
        label: "为什么看它",
        title: "上下文已经够完整",
        copy: "它能回到具体高亮位置，判断成本更低，适合作为当前这一轮的修订入口。",
      },
      {
        key: "action",
        label: "现在该做什么",
        title: "先对照高亮再改稿",
        copy: "先看正文高亮和右侧条目，再决定是只改这一句，还是连着周边段落一起顺一遍。",
      },
      {
        key: "finish",
        label: "处理完成算什么",
        title: args.hasNextQueuedItem ? "确认稳定后继续下一条" : "确认稳定后回到写作",
        copy: args.hasNextQueuedItem
          ? "确认这条已经顺了之后，可以直接继续队列里的下一条。"
          : "确认这条已经顺了之后，就可以回写作页继续推进正文主线。",
      },
    ],
  };
}

export function buildChapterAnalysisRevisionReturnCallout(
  status: ChapterAnalysisRevisionReturnStatus | null,
): ChapterAnalysisRevisionReturnCallout | null {
  switch (status) {
    case "dirty":
      return {
        tone: "warning",
        title: "这条刚从写作页带回，但修改还没保存",
        copy: "你已经开始改这一条了，但当前稿面还有未保存内容。先在这里快速复核判断，再回写作页保存会更稳。",
      };
    case "saved":
      return {
        tone: "info",
        title: "这条刚在写作页改过并保存",
        copy: "现在最适合做一次快速复核，确认正文和记忆事实已经重新对齐，再决定是否继续下一条。",
      };
    case "unchanged":
    default:
      return null;
  }
}
