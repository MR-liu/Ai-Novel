import { List, Wand2 } from "lucide-react";

import type { AppMode } from "../../contexts/AppModeContext";
import { WRITING_DISCLOSURE_COPY } from "../../pages/writing/writingPageCopy";
import type { OutlineListItem } from "../../types";
import { WritingCompactDisclosure } from "./WritingCompactDisclosure";

type ToolbarAction = {
  key: string;
  label: string;
  tone: "primary" | "secondary";
  disabled?: boolean;
  onClick: () => void;
};

function pickPrimaryToolbarAction(actions: ToolbarAction[]): {
  primary: ToolbarAction;
  secondary: ToolbarAction[];
} | null {
  if (actions.length === 0) return null;

  const primaryIndex = actions.findIndex((action) => action.tone === "primary" && !action.disabled);
  const firstEnabledIndex = actions.findIndex((action) => !action.disabled);
  const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : firstEnabledIndex >= 0 ? firstEnabledIndex : 0;

  return {
    primary: actions[resolvedPrimaryIndex],
    secondary: actions.filter((_, index) => index !== resolvedPrimaryIndex),
  };
}

export function WritingToolbar(props: {
  appMode: AppMode;
  outlines: OutlineListItem[];
  activeOutlineId: string;
  chaptersCount: number;
  aiGenerateDisabled: boolean;
  saveDisabled: boolean;
  saveLabel: string;
  onSwitchOutline: (outlineId: string) => void;
  onOpenChapterList: () => void;
  onOpenAiGenerate: () => void;
  onCreateChapter: () => void;
  onSaveChapter: () => void;
  onOpenReview: () => void;
  onOpenStudioTools?: () => void;
  mainActionTitle?: string;
  mainActionCopy?: string;
  mainActions?: ToolbarAction[];
}) {
  const studioMode = props.appMode === "studio";
  const activeOutline = props.outlines.find((outline) => outline.id === props.activeOutlineId) ?? null;
  const mainActions: ToolbarAction[] = props.mainActions ?? [
    { key: "create_chapter", label: "新建章节", tone: "secondary" as const, onClick: props.onCreateChapter },
    { key: "open_ai_generate", label: "AI 起草", tone: "secondary" as const, onClick: props.onOpenAiGenerate, disabled: props.aiGenerateDisabled },
    { key: "save_chapter", label: props.saveLabel, tone: "secondary" as const, onClick: props.onSaveChapter, disabled: props.saveDisabled },
    { key: "open_review", label: "进入校对", tone: "primary" as const, onClick: props.onOpenReview },
  ];
  const mobileMainActions = pickPrimaryToolbarAction(mainActions);
  const mobileOutlineCopy = activeOutline
    ? activeOutline.has_chapters
      ? "这份大纲已经接上章节，可以直接继续推进。"
      : "这份大纲还没接章节，适合先建章。"
    : "先选定当前要写的大纲，再继续主稿。";
  const mobileToolbarDisclosureOpen = !activeOutline || !activeOutline.has_chapters || props.chaptersCount === 0;

  return (
    <div className="writing-toolbar-shell">
      <div className="writing-toolbar-summary">
        <div className="writing-toolbar-summary-kicker">写作导航</div>
        <div className="writing-toolbar-summary-title">
          {activeOutline ? `当前使用「${activeOutline.title}」` : "先选择一个大纲"}
        </div>
        <div className="writing-toolbar-summary-copy">
          {activeOutline
            ? activeOutline.has_chapters
              ? "这份大纲已经接上章节，可以继续沿着主线推进。"
              : "这份大纲还没有接上章节，适合先建章或用 AI 起一个骨架。"
            : "大纲决定这一轮写作主线；切换后，目录和主稿都会跟着变化。"}
        </div>
        <div className="writing-toolbar-cluster min-w-0 hidden flex-1 lg:flex">
          <span className="writing-toolbar-label">当前大纲</span>
          <select
            className="select w-auto min-w-[180px] max-w-full"
            name="active_outline_id"
            value={props.activeOutlineId}
            onChange={(e) => props.onSwitchOutline(e.target.value)}
          >
            {props.outlines.map((outline) => (
              <option key={outline.id} value={outline.id}>
                {outline.title}
                {outline.has_chapters ? "（已有章节）" : ""}
              </option>
            ))}
          </select>
          <span className="manuscript-chip">共 {props.chaptersCount} 章</span>
          {activeOutline ? (
            <span className="manuscript-chip">{activeOutline.has_chapters ? "已接章节" : "待接章节"}</span>
          ) : null}
        </div>

        <div className="writing-toolbar-mobile-compact lg:hidden">
          <div className="writing-toolbar-mobile-summary">
            <div className="writing-toolbar-mobile-title">{activeOutline ? activeOutline.title : "先选择一个大纲"}</div>
            <div className="writing-toolbar-mobile-copy">{mobileOutlineCopy}</div>
            <div className="writing-toolbar-mobile-chip-row">
              <span className="manuscript-chip">共 {props.chaptersCount} 章</span>
              {activeOutline ? (
                <span className="manuscript-chip">{activeOutline.has_chapters ? "已接章节" : "待接章节"}</span>
              ) : null}
            </div>
          </div>

          <div className="writing-toolbar-mobile-strip">
            <button className="btn btn-secondary" onClick={props.onOpenChapterList} type="button">
              <List size={16} />
              目录
            </button>
            {mobileMainActions ? (
              <button
                className={mobileMainActions.primary.tone === "primary" ? "btn btn-primary" : "btn btn-secondary"}
                onClick={mobileMainActions.primary.onClick}
                disabled={mobileMainActions.primary.disabled}
                type="button"
              >
                {mobileMainActions.primary.key === "open_ai_generate" ? <Wand2 size={16} /> : null}
                {mobileMainActions.primary.label}
              </button>
            ) : null}
            {studioMode ? (
              <button className="btn btn-secondary" onClick={props.onOpenStudioTools} type="button">
                作者工作台
              </button>
            ) : null}
          </div>

          <WritingCompactDisclosure
            title={WRITING_DISCLOSURE_COPY.toolbarMoreActions}
            defaultOpen={mobileToolbarDisclosureOpen}
            className="writing-toolbar-mobile-disclosure"
          >
            <div className="writing-toolbar-mobile-disclosure-grid">
              <label className="writing-toolbar-mobile-select-card">
                <span className="writing-toolbar-label">当前大纲</span>
                <select
                  className="select w-full"
                  name="active_outline_id_mobile"
                  value={props.activeOutlineId}
                  onChange={(e) => props.onSwitchOutline(e.target.value)}
                >
                  {props.outlines.map((outline) => (
                    <option key={outline.id} value={outline.id}>
                      {outline.title}
                      {outline.has_chapters ? "（已有章节）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {mobileMainActions?.secondary.length ? (
                <div className="writing-toolbar-mobile-disclosure-actions">
                  {mobileMainActions.secondary.map((action) => (
                    <button
                      key={action.key}
                      className={action.tone === "primary" ? "btn btn-primary" : "btn btn-secondary"}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      type="button"
                    >
                      {action.key === "open_ai_generate" ? <Wand2 size={16} /> : null}
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </WritingCompactDisclosure>
        </div>

        <div className="hidden lg:flex writing-toolbar-mobile-strip">
          <button className="btn btn-secondary" onClick={props.onOpenChapterList} type="button">
            <List size={16} />
            目录
          </button>
          {studioMode ? (
            <button className="btn btn-secondary" onClick={props.onOpenStudioTools} type="button">
              作者工作台
            </button>
          ) : null}
        </div>
      </div>

      <div className="hidden lg:flex writing-toolbar-actions-shell">
        <div className="writing-toolbar-cluster">
          <span className="writing-toolbar-label">{props.mainActionTitle ?? "写作主线"}</span>
          {props.mainActionCopy ? <span className="basis-full text-xs leading-5 text-subtext">{props.mainActionCopy}</span> : null}
          {mainActions.map((action) => (
            <button
              key={action.key}
              className={action.tone === "primary" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={action.onClick}
              disabled={action.disabled}
              type="button"
            >
              {action.key === "open_chapter_list" ? <List size={16} /> : null}
              {action.key === "open_ai_generate" ? <Wand2 size={16} /> : null}
              {action.label}
            </button>
          ))}
        </div>
        {studioMode ? (
          <div className="writing-toolbar-cluster hidden lg:flex">
            <span className="writing-toolbar-label">工作台</span>
            <button className="btn btn-secondary" onClick={props.onOpenStudioTools} type="button">
              作者工作台
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
