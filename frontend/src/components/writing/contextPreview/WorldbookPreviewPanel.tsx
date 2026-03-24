import { UI_COPY } from "../../../lib/uiCopy";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../ui/Feedback";
import type { MemoryContextPack } from "../types";
import { WritingDrawerSection } from "../WritingDrawerWorkbench";

type WorldbookLog = {
  note: string | null;
  budget_char_limit: number | null;
  budget_source: string | null;
  token_estimate: number | null;
  triggered_count: number | null;
  truncated: boolean | null;
};

function extractWorldbookLog(logs: unknown[]): WorldbookLog | null {
  const list = Array.isArray(logs) ? logs : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    if (String(o.section ?? "") !== "worldbook") continue;
    const budgetRaw = o.budget_char_limit;
    const budgetCharLimit = typeof budgetRaw === "number" ? budgetRaw : Number(budgetRaw);
    const tokenRaw = o.token_estimate;
    const tokenEstimate = typeof tokenRaw === "number" ? tokenRaw : Number(tokenRaw);
    const triggeredCountRaw = o.triggered_count;
    const triggeredCount = typeof triggeredCountRaw === "number" ? triggeredCountRaw : Number(triggeredCountRaw);
    return {
      note: typeof o.note === "string" ? o.note : null,
      budget_char_limit: Number.isFinite(budgetCharLimit) ? budgetCharLimit : null,
      budget_source: typeof o.budget_source === "string" ? o.budget_source : null,
      token_estimate: Number.isFinite(tokenEstimate) ? tokenEstimate : null,
      triggered_count: Number.isFinite(triggeredCount) ? triggeredCount : null,
      truncated: typeof o.truncated === "boolean" ? o.truncated : null,
    };
  }
  return null;
}

export function WorldbookPreviewPanel(props: {
  effectivePack: MemoryContextPack;
  worldbookPreview: { triggered: unknown[]; textMd: string; truncated: boolean };
}) {
  const { effectivePack, worldbookPreview } = props;
  const sectionRaw = (effectivePack.worldbook ?? {}) as Record<string, unknown>;
  const enabled = Boolean(sectionRaw.enabled);
  const disabledReason = typeof sectionRaw.disabled_reason === "string" ? sectionRaw.disabled_reason : null;
  const log = extractWorldbookLog(effectivePack.logs);

  return (
    <WritingDrawerSection
      kicker="世界设定"
      title="确认这一章到底命中了哪些世界书条目"
      copy="先看触发数量和命中原因，再看最终注入正文。没有命中时，通常是关键词、别名或常驻条目策略不匹配。"
    >
      <div className="drawer-workbench-subcard">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink">
          <span>{UI_COPY.writing.worldbookSectionTitle}</span>
          <span className="drawer-workbench-chip-row">
            <span>
              {UI_COPY.worldbook.previewTriggeredPrefix}
              {worldbookPreview.triggered.length}
              {UI_COPY.worldbook.previewTriggeredSuffix}
            </span>
            {enabled ? (
              <span className="inline-flex rounded-atelier bg-success/10 px-2 py-0.5 text-success">已启用</span>
            ) : (
              <span className="inline-flex rounded-atelier bg-warning/10 px-2 py-0.5 text-warning">
                已关闭：{disabledReason ?? "未知原因"}
              </span>
            )}
            {log?.budget_char_limit != null ? (
              <span>
                预算:{log.budget_char_limit}
                {log.budget_source ? `（${log.budget_source}）` : ""}
              </span>
            ) : null}
            {log?.token_estimate != null ? <span>字量估算≈{log.token_estimate}</span> : null}
            {worldbookPreview.truncated ? (
              <span className="inline-flex rounded-atelier bg-warning/10 px-2 py-0.5 text-warning">
                {UI_COPY.worldbook.previewTruncated}
              </span>
            ) : null}
          </span>
        </div>

        {enabled && worldbookPreview.triggered.length === 0 ? (
          <FeedbackCallout className="mt-2" tone="warning" title="本次没有命中世界书条目">
            请检查本章计划或生成指令里的关键词是否覆盖条目关键词或别名，或者把关键条目标记为常驻
            （constant），让它每次都固定带入。
          </FeedbackCallout>
        ) : null}
      </div>

      <FeedbackDisclosure
        className="drawer-workbench-disclosure mt-3"
        summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
        title={UI_COPY.worldbook.previewTriggeredList}
      >
        <div className="mt-3 grid gap-2">
          {worldbookPreview.triggered.length === 0 ? (
            <FeedbackEmptyState
              variant="compact"
              kicker="命中列表"
              title="暂无触发条目"
              description={UI_COPY.worldbook.previewNoTriggered}
            />
          ) : (
            worldbookPreview.triggered.map((t) => {
              if (!t || typeof t !== "object") return null;
              const o = t as Record<string, unknown>;
              const id = String(o.id ?? "");
              const title = String(o.title ?? "");
              const reason = String(o.reason ?? "");
              const matchSourceRaw = o.match_source;
              const matchSource = typeof matchSourceRaw === "string" ? matchSourceRaw : "";
              const matchValueRaw = o.match_value;
              const matchValue = typeof matchValueRaw === "string" ? matchValueRaw : "";
              const priority = String(o.priority ?? "");
              const displayReason =
                reason || (matchSource ? (matchValue ? `${matchSource}:${matchValue}` : matchSource) : "");
              return (
                  <div key={id || title} className="drawer-workbench-subcard text-xs">
                    <div className="truncate text-ink">{title || id}</div>
                    <div className="mt-1 text-subtext">
                      {displayReason}
                    {priority ? ` | 优先级:${priority}` : ""}
                    </div>
                  </div>
                );
            })
          )}
        </div>
      </FeedbackDisclosure>

      <FeedbackDisclosure
        className="drawer-workbench-disclosure mt-3"
        summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
        title={UI_COPY.worldbook.previewText}
      >
        <pre className="drawer-workbench-codeblock mt-3">
          {worldbookPreview.textMd || UI_COPY.worldbook.previewTextEmpty}
        </pre>
      </FeedbackDisclosure>

      <FeedbackDisclosure
        className="drawer-workbench-disclosure mt-3"
        summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
        title={UI_COPY.writing.contextPreviewRawPack}
      >
        <div className="mt-3 text-xs text-subtext">需要深挖排查时再看这份底层记录，首选仍然是上面的命中列表和注入正文。</div>
        <pre className="drawer-workbench-codeblock mt-3">{JSON.stringify(effectivePack ?? null, null, 2)}</pre>
      </FeedbackDisclosure>
    </WritingDrawerSection>
  );
}
