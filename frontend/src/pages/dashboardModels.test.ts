import { describe, expect, it } from "vitest";

import { DASHBOARD_AUTHOR_FLOW, DASHBOARD_START_GUIDE, getLaunchPadSummary } from "./dashboardModels";

describe("dashboardModels", () => {
  it("keeps stable author-start guidance", () => {
    expect(DASHBOARD_START_GUIDE).toEqual([
      "如果脑子里已经有下一章，就直接继续写作。",
      "如果忘了自己写到哪，先看项目主页和下一步建议。",
      "如果人物、设定或称呼开始打架，再去故事资料和校对轨道。",
    ]);
  });

  it("keeps stable author flow order", () => {
    expect(DASHBOARD_AUTHOR_FLOW).toEqual([
      "项目主页：确认现在卡在哪。",
      "故事资料：补设定、统一称呼。",
      "大纲 / 写作：推进正文。",
      "校对：通读、细读、核连续性。",
      "发布：导出阅读稿或项目快照。",
    ]);
  });

  it("formats launch pad summary text", () => {
    expect(getLaunchPadSummary(0, 0)).toEqual({
      projectLabel: "还没有项目",
      readyLabel: "暂时没有进入持续写作状态的项目",
      shelfLabel: "新建项目后，这里会开始形成你的最近书架",
    });
    expect(getLaunchPadSummary(3, 2)).toEqual({
      projectLabel: "共 3 个项目",
      readyLabel: "2 个项目可直接继续写作",
      shelfLabel: "最近书架按最近更新排序",
    });
  });
});
