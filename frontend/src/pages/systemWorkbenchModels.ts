import type { StudioSystemTab } from "../lib/projectRoutes";

type SystemWorkbenchSummary = {
  title: string;
  text: string;
  focusValue: string;
  focusCopy: string;
  nextValue: string;
  nextCopy: string;
  cautionValue: string;
  cautionCopy: string;
};

export const SYSTEM_WORKBENCH_COPY: Record<StudioSystemTab, SystemWorkbenchSummary> = {
  tasks: {
    title: "先判断系统是卡住了，还是只是还在跑",
    text: "任务中心最适合回答三件事：有没有任务失败、有没有任务积压、最近一次写作或自动更新到底有没有真正落地。",
    focusValue: "失败任务、运行中任务和待应用变更",
    focusCopy: "先看失败和运行中的条目，再决定是否继续深入到具体详情、运行时或变更集。",
    nextValue: "定位后回对应业务页验证结果",
    nextCopy: "任务中心不是终点，查清楚后通常要回写作页、连续性底座或资料页确认最终效果。",
    cautionValue: "别把内部状态当成最终用户结果",
    cautionCopy: "任务显示 done 不代表作者体验一定正确，仍要回到正文或资料页做一次实际核对。",
  },
  "structured-memory": {
    title: "先确定要治理的是哪一层底层记忆",
    text: "连续性底座页更像一张故事状态总账，适合排查实体、关系、事件、伏笔和证据到底被系统记成了什么。",
    focusValue: "当前视图、表范围和筛选后的记录集",
    focusCopy: "先缩小到正确表和正确关键词，再做选择或批量操作，能明显减少误删和误判。",
    nextValue: "确认范围后再批量治理或打开连续性更新",
    nextCopy: "如果已经选中记录，下一步更适合先复制批量指令，再回到连续性更新继续处理。",
    cautionValue: "这是底层治理台，不是普通资料页",
    cautionCopy: "批量删除、标记和关系修正会直接影响记忆底座，操作前最好先确认章节和范围。",
  },
  fractal: {
    title: "先判断长期记忆当前到底用了哪一种摘要",
    text: "长期记忆页的核心不是重建按钮本身，而是帮你看清现在注入给生成模型的长期摘要是否稳定、是否可信。",
    focusValue: "当前采用策略与两版预览差异",
    focusCopy: "先看系统是用确定性摘要还是 LLM 摘要，再比较两版内容到底漏了什么、漂了什么。",
    nextValue: "比较后再决定是否重建或保留现状",
    nextCopy: "只有当摘要覆盖度或风格确实有问题时，再重建会更有针对性。",
    cautionValue: "不要把更灵活误认为一定更好",
    cautionCopy: "LLM 摘要更像作者笔记，但也更容易受模型波动影响；稳定性仍要靠你抽样验证。",
  },
};
