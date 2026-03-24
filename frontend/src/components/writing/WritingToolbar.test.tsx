import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WritingToolbar } from "./WritingToolbar";

describe("WritingToolbar", () => {
  it("renders dynamic main action title, copy and actions", () => {
    const html = renderToStaticMarkup(
      <WritingToolbar
        appMode="studio"
        outlines={[
          {
            id: "outline-1",
            title: "主线大纲",
            has_chapters: true,
            created_at: "2026-03-17 18:00:00",
            updated_at: "2026-03-17 18:00:00",
          },
        ]}
        activeOutlineId="outline-1"
        chaptersCount={5}
        aiGenerateDisabled={false}
        saveDisabled={false}
        saveLabel="保存"
        onSwitchOutline={() => undefined}
        onOpenChapterList={() => undefined}
        onOpenAiGenerate={() => undefined}
        onCreateChapter={() => undefined}
        onSaveChapter={() => undefined}
        onOpenReview={() => undefined}
        onOpenStudioTools={() => undefined}
        mainActionTitle="先回连续性台复核"
        mainActionCopy="这一条已经保存，适合先确认正文和记忆是否重新对齐。"
        mainActions={[
          { key: "return_to_continuity", label: "回连续性台复核", tone: "primary", onClick: () => undefined },
          { key: "open_review", label: "进入校对", tone: "secondary", onClick: () => undefined },
        ]}
      />,
    );

    expect(html).toContain("先回连续性台复核");
    expect(html).toContain("这一条已经保存，适合先确认正文和记忆是否重新对齐。");
    expect(html).toContain("回连续性台复核");
    expect(html).toContain("进入校对");
    expect(html).toContain("更多写作动作");
    expect(html).toContain("当前大纲");
    expect(html).toContain("目录");
    expect(html).toContain("作者工作台");
  });

  it("opens compact disclosure by default when outline is not ready for writing", () => {
    const html = renderToStaticMarkup(
      <WritingToolbar
        appMode="focus"
        outlines={[
          {
            id: "outline-1",
            title: "待接章节大纲",
            has_chapters: false,
            created_at: "2026-03-17 18:00:00",
            updated_at: "2026-03-17 18:00:00",
          },
        ]}
        activeOutlineId="outline-1"
        chaptersCount={0}
        aiGenerateDisabled={false}
        saveDisabled={false}
        saveLabel="保存"
        onSwitchOutline={() => undefined}
        onOpenChapterList={() => undefined}
        onOpenAiGenerate={() => undefined}
        onCreateChapter={() => undefined}
        onSaveChapter={() => undefined}
        onOpenReview={() => undefined}
        mainActions={[{ key: "create_chapter", label: "新建章节", tone: "primary", onClick: () => undefined }]}
      />,
    );

    expect(html).toContain("更多写作动作");
    expect(html).toContain('open=""');
    expect(html).toContain("待接章节");
    expect(html).toContain("当前大纲");
  });
});
