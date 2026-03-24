import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WritingDrawerHeader, WritingDrawerSection } from "./WritingDrawerWorkbench";

describe("WritingDrawerWorkbench", () => {
  it("renders drawer header with meta cards and actions", () => {
    const html = renderToStaticMarkup(
      <WritingDrawerHeader
        titleId="drawer-title"
        kicker="作者工作台"
        title="生成前检查"
        description="用于查看真正会送进模型的内容。"
        meta={[
          { label: "模式", value: "替换生成" },
          { label: "状态", value: "已启用覆盖文本", tone: "warning" },
        ]}
        actions={<button type="button">关闭</button>}
        callout={<div>先检查，再生成。</div>}
      />,
    );

    expect(html).toContain("作者工作台");
    expect(html).toContain('id="drawer-title"');
    expect(html).toContain("生成前检查");
    expect(html).toContain("替换生成");
    expect(html).toContain("已启用覆盖文本");
    expect(html).toContain("先检查，再生成。");
    expect(html).toContain("关闭");
  });

  it("renders drawer section title, copy and body", () => {
    const html = renderToStaticMarkup(
      <WritingDrawerSection kicker="资料与校验" title="参考资料预览" copy="先看命中的资料，再决定是否看 JSON。">
        <button type="button">刷新</button>
      </WritingDrawerSection>,
    );

    expect(html).toContain("资料与校验");
    expect(html).toContain("参考资料预览");
    expect(html).toContain("先看命中的资料，再决定是否看 JSON。");
    expect(html).toContain("刷新");
  });
});
