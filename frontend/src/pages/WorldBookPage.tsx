import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import {
  WorldBookAutoUpdateSection,
  WorldBookEditorDrawer,
  WorldBookEntriesSection,
  WorldBookImportDrawer,
  WorldBookPageActionsBar,
  WorldBookPreviewPanel,
} from "./worldbook/WorldBookPageSections";
import { useWorldBookPageState } from "./worldbook/useWorldBookPageState";

export function WorldBookPage() {
  const state = useWorldBookPageState();
  const filteredCount = state.actionsBarProps.filteredCount;
  const totalCount = state.actionsBarProps.totalCount;
  const lastTask = state.autoUpdateSectionProps.task;
  const autoUpdateStatus = lastTask ? lastTask.status : "尚未运行";

  return (
    <ToolContent className="grid gap-4">
      <EditorialHero
        kicker="世界资料卷宗"
        title="把设定、地点、规则和背景资料整理成随写随查的参考册。"
        subtitle="世界书适合承接那些会长期影响剧情的资料。你可以手工维护词条，也可以在写完章节后触发自动补充，再决定是否采纳更新结果。"
        items={[
          {
            key: "entries",
            label: "当前词条",
            value: `${filteredCount}${filteredCount === totalCount ? " 条可见" : ` / ${totalCount} 条`}`,
          },
          { key: "status", label: "自动补充状态", value: autoUpdateStatus },
          {
            key: "flow",
            label: "当前工作方式",
            value: "先管理词条，再用右侧预览确认本章会命中哪些资料。",
          },
        ]}
      />

      <section className="studio-header-panel">
        <div className="editorial-kicker">现在可以怎么用</div>
        <div className="mt-3 text-sm leading-7 text-subtext">
          左侧先整理词条和筛选结果，右侧用命中预览验证当前章节会不会抓到正确资料；如果想让系统根据新章节补充世界资料，再使用自动补充任务。
        </div>
      </section>

      <section className="manuscript-status-band">
        <div className="manuscript-status-list">
          <span className="manuscript-chip">
            当前可见 {filteredCount}
            {filteredCount === totalCount ? " 条资料" : ` / 全部 ${totalCount} 条`}
          </span>
          <span className="manuscript-chip">自动补充：{autoUpdateStatus}</span>
          <span className="manuscript-chip">建议先整理词条，再跑命中预览</span>
        </div>
      </section>

      <section className="review-track-panel">
        <div className="editorial-kicker">怎么维护世界资料卷宗</div>
        <div className="mt-3 max-w-3xl text-sm leading-7 text-subtext">
          世界书最适合装那些会长期影响剧情判断的资料，比如地点、规则、组织和常驻设定。先整理词条，再用命中预览确认写作时真能抓到它们。
        </div>
        <div className="review-track-grid">
          <div className="review-track-card is-emphasis">
            <div className="review-track-label">先补什么</div>
            <div className="review-track-value">规则与地点</div>
            <div className="review-track-copy">优先补那些会被后续章节频繁引用、最容易写崩的世界规则和地点设定。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">怎么确认生效</div>
            <div className="review-track-value">命中预览</div>
            <div className="review-track-copy">新增重要资料后，先跑一次命中预览，确认作者在写作时真的会拿到它。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">什么时候自动补充</div>
            <div className="review-track-value">写完新章节后</div>
            <div className="review-track-copy">章节刚推进完、世界设定有明显扩展时，再让系统提出补充建议通常最有效。</div>
          </div>
        </div>
      </section>

      <section className="author-workbench-panel">
        <WorldBookPageActionsBar {...state.actionsBarProps} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="grid gap-4">
          <WorldBookEntriesSection {...state.entriesSectionProps} />
          <WorldBookAutoUpdateSection {...state.autoUpdateSectionProps} />
        </div>

        <div className="grid gap-4">
          <div className="author-workbench-panel">
            <WorldBookPreviewPanel {...state.pagePreviewPanelProps} />
          </div>
          <div className="dossier-side-note text-sm text-subtext">
            预览命中只帮助你判断“这一段写作会带上哪些资料”，不会改动任何词条。建议在新增重要设定后跑一次预览，确认作者真正会在写作时拿到它。
          </div>
        </div>
      </div>

      <WorldBookImportDrawer {...state.importDrawerProps} />
      <WorldBookEditorDrawer {...state.editorDrawerProps} />
    </ToolContent>
  );
}
