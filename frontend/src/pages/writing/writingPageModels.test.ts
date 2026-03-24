import { describe, expect, it } from "vitest";

import {
  buildBatchTaskCenterHref,
  buildProjectTaskCenterHref,
  buildWritingTaskCenterHref,
  getWritingContinuityRevisionChecklist,
  getWritingContinuityRevisionProgressBadge,
  getWritingContinuityRevisionQueueNavigation,
  getWritingWorkbenchContinuitySection,
  getWritingWorkbenchMainActionGroup,
  getWritingWorkbenchNextStep,
  getWritingWorkbenchReadiness,
  getWritingWorkbenchReadinessItems,
  getWritingWorkbenchResearchSection,
  getWritingWorkbenchRuntimeNote,
  pickFirstProjectTaskId,
  summarizeWritingContinuityRevisionQueue,
  summarizeWritingPlan,
} from "./writingPageModels";

describe("writingPageModels", () => {
  it("picks the first non-empty task id", () => {
    expect(pickFirstProjectTaskId(null)).toBeNull();
    expect(pickFirstProjectTaskId({ a: null, b: "  ", c: "task-1" })).toBe("task-1");
  });

  it("builds stable task center links", () => {
    expect(buildWritingTaskCenterHref("p1")).toBe("/projects/p1/studio/system/tasks");
    expect(buildWritingTaskCenterHref("p1", "c1")).toBe("/projects/p1/studio/system/tasks?chapterId=c1");
    expect(buildProjectTaskCenterHref("p1", "task-1")).toBe(
      "/projects/p1/studio/system/tasks?project_task_id=task-1",
    );
    expect(buildBatchTaskCenterHref("p1", "task-1")).toBe("/projects/p1/studio/system/tasks?project_task_id=task-1");
    expect(buildBatchTaskCenterHref("p1", null)).toBeNull();
  });

  it("summarizes plan and readiness for the workbench", () => {
    expect(summarizeWritingPlan("  ")).toContain("还没有填写本章要点");
    expect(summarizeWritingPlan("这是一个很长的章节计划".repeat(20), 12)).toMatch(/…$/);
    expect(getWritingWorkbenchReadiness("有计划", "", "摘要")).toEqual(["要点已整理", "正文尚未起笔", "摘要已记录"]);
    expect(getWritingWorkbenchReadinessItems("有计划", "", "摘要")).toEqual([
      { key: "plan", title: "要点", ready: true, summary: "要点已整理" },
      { key: "content", title: "正文", ready: false, summary: "正文尚未起笔" },
      { key: "summary", title: "摘要", ready: true, summary: "摘要已记录" },
    ]);
  });

  it("suggests the next best step based on current writing state", () => {
    expect(
      getWritingWorkbenchNextStep({
        status: "drafting",
        dirty: false,
        hasPlan: false,
        hasContent: false,
        generating: false,
        saving: false,
        autoUpdatesTriggering: false,
        continuityRevisionActive: false,
        continuityRevisionProgressStatus: null,
      }),
    ).toEqual({
      title: "先补本章要点",
      description: "一句话写清这章要发生什么，AI 起草、资料召回和你自己的判断都会更稳定。",
    });

    expect(
      getWritingWorkbenchNextStep({
        status: "done",
        dirty: false,
        hasPlan: true,
        hasContent: true,
        generating: false,
        saving: false,
        autoUpdatesTriggering: false,
        continuityRevisionActive: false,
        continuityRevisionProgressStatus: null,
      }).title,
    ).toBe("进入校对或连续性更新");
  });

  it("prioritizes continuity revision flow when deriving the next step", () => {
    expect(
      getWritingWorkbenchNextStep({
        status: "drafting",
        dirty: true,
        hasPlan: true,
        hasContent: true,
        generating: false,
        saving: false,
        autoUpdatesTriggering: false,
        continuityRevisionActive: true,
        continuityRevisionProgressStatus: "dirty",
      }),
    ).toEqual({
      title: "先保存当前连续性修订",
      description: "这一条已经开始改，但稿面还有未保存内容。先保存，再回连续性台复核会更稳。",
    });

    expect(
      getWritingWorkbenchNextStep({
        status: "drafting",
        dirty: false,
        hasPlan: true,
        hasContent: true,
        generating: false,
        saving: false,
        autoUpdatesTriggering: false,
        continuityRevisionActive: true,
        continuityRevisionProgressStatus: "saved",
      }),
    ).toEqual({
      title: "回连续性台复核这一条",
      description: "当前连续性修订已经保存，适合立刻回连续性台确认正文和记忆是否重新对齐。",
    });
  });

  it("formats runtime notes for active writing operations", () => {
    expect(getWritingWorkbenchRuntimeNote({ generating: true, autoUpdatesTriggering: false, batchProgressText: "" })).toBe(
      "AI 正在接续写作，你可以先观察正文走向，再决定是否继续追加。",
    );
    expect(
      getWritingWorkbenchRuntimeNote({ generating: false, autoUpdatesTriggering: false, batchProgressText: "（2/5）" }),
    ).toBe("批量生成仍在推进（2/5），如需排查可打开任务中心。");
  });

  it("builds an author-facing continuity revision checklist", () => {
    expect(
      getWritingContinuityRevisionChecklist({
        hasExcerpt: true,
        located: false,
        draftChanged: false,
        dirty: false,
      }),
    ).toEqual([
      {
        key: "locate",
        title: "先回到问题句",
        done: false,
        hint: "先定位到引用句，再改正文会更稳。",
      },
      {
        key: "revise",
        title: "开始改这一段正文",
        done: false,
        hint: "先把冲突句改顺，再决定是否继续扩写后文。",
      },
      {
        key: "save",
        title: "保存这一轮修订",
        done: false,
        hint: "还没有新的改动需要保存。",
      },
    ]);

    expect(
      getWritingContinuityRevisionChecklist({
        hasExcerpt: true,
        located: true,
        draftChanged: true,
        dirty: true,
      }).map((item) => item.done),
    ).toEqual([true, true, false]);

    expect(
      getWritingContinuityRevisionChecklist({
        hasExcerpt: false,
        located: false,
        draftChanged: true,
        dirty: false,
      }).map((item) => item.hint),
    ).toEqual([
      "当前没有可直接定位的引用句，先按标题和类型判断这一处该怎么改。",
      "这一轮修订已经写回正文。",
      "当前稿面已经保存，可以回连续性台复核。",
    ]);
  });

  it("derives previous and next ids for the active revision queue item", () => {
    expect(
      getWritingContinuityRevisionQueueNavigation([
        { id: "a", isActive: false },
        { id: "b", isActive: true },
        { id: "c", isActive: false },
      ]),
    ).toEqual({
      activeIndex: 1,
      total: 3,
      previousId: "a",
      nextId: "c",
    });

    expect(
      getWritingContinuityRevisionQueueNavigation([
        { id: "a", isActive: false },
        { id: "b", isActive: false },
      ]),
    ).toEqual({
      activeIndex: -1,
      total: 2,
      previousId: null,
      nextId: null,
    });
  });

  it("formats continuity revision progress badges and queue summary", () => {
    expect(getWritingContinuityRevisionProgressBadge("dirty")).toEqual({
      label: "未保存改动",
      tone: "warning",
    });
    expect(getWritingContinuityRevisionProgressBadge("saved")).toEqual({
      label: "已保存待复核",
      tone: "info",
    });
    expect(getWritingContinuityRevisionProgressBadge(null)).toBeNull();

    expect(
      summarizeWritingContinuityRevisionQueue([
        { progressStatus: "dirty" },
        { progressStatus: "saved" },
        { progressStatus: "saved" },
        { progressStatus: null },
      ]),
    ).toEqual({
      total: 4,
      dirtyCount: 1,
      savedCount: 2,
    });
  });

  it("derives state-aware main action groups for the studio workbench", () => {
    expect(
      getWritingWorkbenchMainActionGroup({
        hasActiveChapter: false,
        hasChapters: true,
        hasContent: false,
        status: null,
        dirty: false,
        saving: false,
        continuityRevisionActive: false,
        continuityRevisionHasExcerpt: false,
        continuityRevisionProgressStatus: null,
      }),
    ).toEqual({
      title: "先进入要写的章节",
      copy: "先从目录打开这一轮要处理的章节，再决定是继续写正文还是补一版草稿。",
      actions: [
        { key: "open_chapter_list", label: "打开章节目录", tone: "primary" },
        { key: "create_chapter", label: "新建章节", tone: "secondary" },
      ],
    });

    expect(
      getWritingWorkbenchMainActionGroup({
        hasActiveChapter: true,
        hasChapters: true,
        hasContent: true,
        status: "drafting",
        dirty: true,
        saving: false,
        continuityRevisionActive: true,
        continuityRevisionHasExcerpt: true,
        continuityRevisionProgressStatus: "dirty",
      }),
    ).toEqual({
      title: "先保存这条连续性修订",
      copy: "当前问题已经开始修改，但稿面还没保存。先落盘，再回连续性台复核最稳。",
      actions: [
        { key: "save_chapter", label: "保存当前修订", tone: "primary" },
        { key: "return_to_continuity", label: "回连续性台", tone: "secondary" },
      ],
    });

    expect(
      getWritingWorkbenchMainActionGroup({
        hasActiveChapter: true,
        hasChapters: true,
        hasContent: true,
        status: "done",
        dirty: false,
        saving: false,
        continuityRevisionActive: false,
        continuityRevisionHasExcerpt: false,
        continuityRevisionProgressStatus: null,
      }),
    ).toEqual({
      title: "进入校对并同步后续",
      copy: "这一章已经定稿，适合去通读收口，或把变化同步到连续性链路。",
      actions: [
        { key: "open_review", label: "进入校对", tone: "primary" },
        { key: "open_memory_update", label: "连续性更新", tone: "secondary" },
      ],
    });
  });

  it("derives dynamic research and continuity support sections", () => {
    expect(
      getWritingWorkbenchResearchSection({
        hasActiveChapter: true,
        hasContent: false,
        generating: false,
        continuityRevisionActive: false,
        continuityRevisionProgressStatus: null,
      }),
    ).toEqual({
      title: "起草前先核对上下文",
      copy: "准备交给 AI 之前，先看生成前检查和参考资料，会比直接点生成更稳。",
      actions: [
        { key: "open_prompt_inspector", label: "生成前检查", tone: "primary" },
        { key: "open_context_preview", label: "参考资料预览", tone: "secondary" },
      ],
    });

    expect(
      getWritingWorkbenchResearchSection({
        hasActiveChapter: true,
        hasContent: true,
        generating: false,
        continuityRevisionActive: true,
        continuityRevisionProgressStatus: "saved",
      }),
    ).toEqual({
      title: "复核前先补看上下文",
      copy: "这条连续性修订已经保存；如果回连续性台前还想确认来源，可以先看参考资料或生成记录。",
      actions: [
        { key: "open_context_preview", label: "参考资料预览", tone: "primary" },
        { key: "open_history", label: "生成记录", tone: "secondary" },
      ],
    });

    expect(
      getWritingWorkbenchContinuitySection({
        hasActiveChapter: true,
        status: "done",
        dirty: false,
        autoUpdatesTriggering: false,
        batchProgressText: "",
        continuityRevisionActive: false,
        continuityRevisionProgressStatus: null,
      }),
    ).toEqual({
      title: "把定稿变化同步到全局",
      copy: "这一章已经定稿，最适合现在去做连续性更新、看伏笔闭环和确认后台任务有没有真正落地。",
      actions: [
        { key: "open_memory_update", label: "连续性更新", tone: "primary" },
        { key: "open_foreshadow", label: "伏笔面板", tone: "secondary" },
        { key: "open_task_center", label: "任务中心", tone: "secondary" },
      ],
    });

    expect(
      getWritingWorkbenchContinuitySection({
        hasActiveChapter: true,
        status: "drafting",
        dirty: true,
        autoUpdatesTriggering: false,
        batchProgressText: "",
        continuityRevisionActive: true,
        continuityRevisionProgressStatus: "dirty",
      }),
    ).toEqual({
      title: "先完成当前修订，再处理全局同步",
      copy: "当前还在处理具体问题句，更底层的同步和任务先放后，避免把注意力拉散。",
      actions: [
        { key: "return_to_continuity", label: "回连续性台", tone: "primary" },
        { key: "open_task_center", label: "任务中心", tone: "secondary" },
      ],
    });
  });
});
