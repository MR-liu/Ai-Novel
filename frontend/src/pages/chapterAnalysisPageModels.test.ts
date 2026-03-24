import { describe, expect, it } from "vitest";

import type { MemoryAnnotation } from "../components/chapterAnalysis/types";
import type { ContinuityRevisionQueueItem } from "../services/continuityRevisionQueue";

import {
  buildChapterAnalysisActiveTaskSummary,
  buildChapterAnalysisSavedReviewAction,
  buildChapterAnalysisRevisionReturnCallout,
  filterChapterAnalysisRevisionQueue,
  getChapterAnalysisRevisionProgressBadge,
  parseChapterAnalysisRevisionReturnStatus,
  resolveChapterAnalysisAutoFocus,
  resolveChapterAnalysisQueueNavigation,
  resolveChapterAnalysisReturnTarget,
} from "./chapterAnalysisPageModels";

const ANNOTATIONS: MemoryAnnotation[] = [
  {
    id: "ann-1",
    type: "character_state",
    title: "人物状态冲突",
    content: "她说自己没有失眠。",
    importance: 0.8,
    position: 10,
    length: 8,
    tags: [],
    metadata: {},
  },
  {
    id: "ann-2",
    type: "foreshadow",
    title: "伏笔未兑现",
    content: "戒指去向被忘记了。",
    importance: 0.6,
    position: 30,
    length: 6,
    tags: [],
    metadata: {},
  },
];

describe("chapterAnalysisPageModels", () => {
  it("returns the matching annotation and whether it can scroll in正文", () => {
    expect(resolveChapterAnalysisAutoFocus(ANNOTATIONS, "ann-1", new Set(["ann-1"]))).toEqual({
      annotation: ANNOTATIONS[0],
      shouldScroll: true,
    });
    expect(resolveChapterAnalysisAutoFocus(ANNOTATIONS, "ann-2", new Set(["ann-1"]))).toEqual({
      annotation: ANNOTATIONS[1],
      shouldScroll: false,
    });
  });

  it("returns null when annotationId is missing or unknown", () => {
    expect(resolveChapterAnalysisAutoFocus(ANNOTATIONS, null, new Set(["ann-1"]))).toEqual({
      annotation: null,
      shouldScroll: false,
    });
    expect(resolveChapterAnalysisAutoFocus(ANNOTATIONS, "missing", new Set(["ann-1"]))).toEqual({
      annotation: null,
      shouldScroll: false,
    });
  });

  it("picks the next queue target after completing a reviewed item", () => {
    const queue: ContinuityRevisionQueueItem[] = [
      {
        id: "ann-1",
        source: "analysis",
        chapterId: "c1",
        title: "人物状态冲突",
        type: "character_state",
        excerpt: "她明明已经失眠。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:00:00.000Z",
        progressStatus: null,
        progressUpdatedAt: null,
      },
      {
        id: "ann-2",
        source: "analysis",
        chapterId: "c1",
        title: "伏笔断裂",
        type: "foreshadow",
        excerpt: "戒指去向被忘了。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:01:00.000Z",
        progressStatus: null,
        progressUpdatedAt: null,
      },
      {
        id: "ann-3",
        source: "analysis",
        chapterId: "c1",
        title: "设定事实冲突",
        type: "plot_point",
        excerpt: "出发时间前后对不上。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:02:00.000Z",
        progressStatus: null,
        progressUpdatedAt: null,
      },
    ];

    expect(resolveChapterAnalysisReturnTarget(queue, "ann-2")?.id).toBe("ann-3");
    expect(resolveChapterAnalysisReturnTarget(queue, "ann-3")?.id).toBe("ann-2");
    expect(resolveChapterAnalysisReturnTarget(queue, "missing")).toBeNull();
  });

  it("derives queue navigation around the active item", () => {
    const queue: ContinuityRevisionQueueItem[] = [
      {
        id: "ann-1",
        source: "analysis",
        chapterId: "c1",
        title: "人物状态冲突",
        type: "character_state",
        excerpt: "她明明已经失眠。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:00:00.000Z",
        progressStatus: null,
        progressUpdatedAt: null,
      },
      {
        id: "ann-2",
        source: "analysis",
        chapterId: "c1",
        title: "伏笔断裂",
        type: "foreshadow",
        excerpt: "戒指去向被忘了。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:01:00.000Z",
        progressStatus: null,
        progressUpdatedAt: null,
      },
      {
        id: "ann-3",
        source: "analysis",
        chapterId: "c1",
        title: "设定事实冲突",
        type: "plot_point",
        excerpt: "出发时间前后对不上。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:02:00.000Z",
        progressStatus: null,
        progressUpdatedAt: null,
      },
    ];

    expect(resolveChapterAnalysisQueueNavigation(queue, "ann-2")).toEqual({
      activeIndex: 1,
      total: 3,
      previousId: "ann-1",
      nextId: "ann-3",
    });
    expect(resolveChapterAnalysisQueueNavigation(queue, "missing")).toEqual({
      activeIndex: -1,
      total: 3,
      previousId: null,
      nextId: null,
    });
  });

  it("builds an author-facing task summary for unmapped and queued items", () => {
    expect(
      buildChapterAnalysisActiveTaskSummary({
        annotation: ANNOTATIONS[0],
        validIds: new Set<string>(),
        isQueued: true,
        queueTotal: 3,
        queueActiveIndex: 1,
        hasNextQueuedItem: true,
        progressStatus: "saved",
      }),
    ).toEqual(
      expect.objectContaining({
        tone: "warning",
        title: "先把这条问题重新落回正文或来源",
        badges: expect.arrayContaining([
          expect.objectContaining({ key: "queue", value: "第 2 / 3 条" }),
          expect.objectContaining({ key: "progress", value: "已保存待复核" }),
        ]),
      }),
    );
  });

  it("builds a review-first summary for done items and a high-priority summary for important items", () => {
    const doneAnnotation: MemoryAnnotation = {
      ...ANNOTATIONS[0],
      metadata: { done: true },
    };
    const importantSummary = buildChapterAnalysisActiveTaskSummary({
      annotation: ANNOTATIONS[0],
      validIds: new Set<string>(["ann-1"]),
      isQueued: false,
      queueTotal: 0,
      queueActiveIndex: -1,
      hasNextQueuedItem: false,
      progressStatus: null,
    });
    const doneSummary = buildChapterAnalysisActiveTaskSummary({
      annotation: doneAnnotation,
      validIds: new Set<string>(["ann-1"]),
      isQueued: true,
      queueTotal: 2,
      queueActiveIndex: 0,
      hasNextQueuedItem: true,
      progressStatus: "dirty",
    });

    expect(importantSummary).toEqual(
      expect.objectContaining({
        tone: "warning",
        title: "建议优先处理这条高影响问题",
      }),
    );
    expect(doneSummary).toEqual(
      expect.objectContaining({
        tone: "info",
        title: "这条更适合做复核，不是第一轮重写",
      }),
    );
  });

  it("parses and formats revision return status callouts", () => {
    expect(parseChapterAnalysisRevisionReturnStatus("saved")).toBe("saved");
    expect(parseChapterAnalysisRevisionReturnStatus("dirty")).toBe("dirty");
    expect(parseChapterAnalysisRevisionReturnStatus("other")).toBeNull();

    expect(buildChapterAnalysisRevisionReturnCallout("saved")).toEqual({
      tone: "info",
      title: "这条刚在写作页改过并保存",
      copy: "现在最适合做一次快速复核，确认正文和记忆事实已经重新对齐，再决定是否继续下一条。",
    });
    expect(buildChapterAnalysisRevisionReturnCallout("dirty")).toEqual({
      tone: "warning",
      title: "这条刚从写作页带回，但修改还没保存",
      copy: "你已经开始改这一条了，但当前稿面还有未保存内容。先在这里快速复核判断，再回写作页保存会更稳。",
    });
    expect(buildChapterAnalysisRevisionReturnCallout("unchanged")).toBeNull();
    expect(getChapterAnalysisRevisionProgressBadge("saved")).toEqual({
      label: "已保存待复核",
      tone: "info",
    });
    expect(getChapterAnalysisRevisionProgressBadge("dirty")).toEqual({
      label: "未保存改动",
      tone: "warning",
    });
    expect(getChapterAnalysisRevisionProgressBadge(null)).toBeNull();
  });

  it("filters revision queue by progress status and reports whether active item remains visible", () => {
    const queue: ContinuityRevisionQueueItem[] = [
      {
        id: "ann-1",
        source: "analysis",
        chapterId: "c1",
        title: "人物状态冲突",
        type: "character_state",
        excerpt: "她明明已经失眠。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:00:00.000Z",
        progressStatus: "dirty",
        progressUpdatedAt: "2026-03-17T00:03:00.000Z",
      },
      {
        id: "ann-2",
        source: "analysis",
        chapterId: "c1",
        title: "伏笔断裂",
        type: "foreshadow",
        excerpt: "戒指去向被忘了。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:01:00.000Z",
        progressStatus: "saved",
        progressUpdatedAt: "2026-03-17T00:04:00.000Z",
      },
      {
        id: "ann-3",
        source: "analysis",
        chapterId: "c1",
        title: "设定事实冲突",
        type: "plot_point",
        excerpt: "出发时间前后对不上。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:02:00.000Z",
        progressStatus: null,
        progressUpdatedAt: null,
      },
    ];

    expect(filterChapterAnalysisRevisionQueue({ queue, filter: "all", activeId: "ann-3" })).toEqual({
      filter: "all",
      items: queue,
      counts: { all: 3, dirty: 1, saved: 1 },
      activeInView: true,
    });
    expect(filterChapterAnalysisRevisionQueue({ queue, filter: "dirty", activeId: "ann-2" })).toEqual({
      filter: "dirty",
      items: [queue[0]],
      counts: { all: 3, dirty: 1, saved: 1 },
      activeInView: false,
    });
  });

  it("builds a sequential saved-review action only for active saved items inside saved view", () => {
    const queue: ContinuityRevisionQueueItem[] = [
      {
        id: "ann-1",
        source: "analysis",
        chapterId: "c1",
        title: "人物状态冲突",
        type: "character_state",
        excerpt: "她明明已经失眠。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:00:00.000Z",
        progressStatus: "dirty",
        progressUpdatedAt: "2026-03-17T00:03:00.000Z",
      },
      {
        id: "ann-2",
        source: "analysis",
        chapterId: "c1",
        title: "伏笔断裂",
        type: "foreshadow",
        excerpt: "戒指去向被忘了。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:01:00.000Z",
        progressStatus: "saved",
        progressUpdatedAt: "2026-03-17T00:04:00.000Z",
      },
      {
        id: "ann-4",
        source: "analysis",
        chapterId: "c1",
        title: "设定事实冲突",
        type: "plot_point",
        excerpt: "出发时间前后对不上。",
        hasExcerpt: true,
        createdAt: "2026-03-17T00:02:00.000Z",
        progressStatus: "saved",
        progressUpdatedAt: "2026-03-17T00:05:00.000Z",
      },
    ];

    expect(
      buildChapterAnalysisSavedReviewAction({
        filter: "saved",
        activeId: "ann-2",
        activeProgressStatus: "saved",
        visibleQueue: [queue[1], queue[2]],
      }),
    ).toEqual({
      label: "复核完成并继续下一条",
      completionMessage: "已复核当前条目，已切到下一条待复核项",
      nextTargetId: "ann-4",
    });

    expect(
      buildChapterAnalysisSavedReviewAction({
        filter: "all",
        activeId: "ann-2",
        activeProgressStatus: "saved",
        visibleQueue: queue,
      }),
    ).toBeNull();
    expect(
      buildChapterAnalysisSavedReviewAction({
        filter: "saved",
        activeId: "ann-1",
        activeProgressStatus: "dirty",
        visibleQueue: [queue[1], queue[2]],
      }),
    ).toBeNull();
  });
});
