import { UI_COPY } from "../../lib/uiCopy";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../components/ui/Feedback";
import {
  formatRerankMethodLabel,
  formatVectorContentSourceLabel,
  formatVectorSourceLabel,
} from "../../lib/vectorRagCopy";
import type { ProjectSettings } from "../../types";
import { safeJson } from "./utils";

function formatEffectiveRerankSummary(settings: ProjectSettings) {
  return `${settings.vector_rerank_effective_enabled ? "当前已启用正式排序" : "当前尚未启用正式排序"}；方式：${formatRerankMethodLabel(
    settings.vector_rerank_effective_method,
  )}；候选数：${settings.vector_rerank_effective_top_k}；配置来源：${formatVectorSourceLabel(
    settings.vector_rerank_effective_source,
  )}。`;
}

function formatExperimentModeLabel(mode: "disabled" | "order" | "weights") {
  if (mode === "order") return "按资料优先顺序验证";
  if (mode === "weights") return "按资料权重验证";
  return "关闭实验";
}

function formatHybridAlphaHint(alpha: number) {
  if (alpha >= 0.8) return "更保守，优先保留原始顺序。";
  if (alpha >= 0.45) return "折中观察，适合先小步比较差异。";
  return "更激进，更相信重排后的新顺序。";
}

export function RagAdvancedDebugPanel(props: {
  projectId: string | undefined;
  debugOpen: boolean;
  setDebugOpen: (open: boolean) => void;
  settingsQuery: { data: ProjectSettings | null | undefined; loading: boolean; refresh: () => void };
  busy: boolean;
  rerankEnabled: boolean;
  setRerankEnabled: (enabled: boolean) => void;
  rerankMethod: string;
  setRerankMethod: (method: string) => void;
  rerankTopK: number;
  setRerankTopK: (topK: number) => void;
  rerankHybridAlpha: number;
  setRerankHybridAlpha: (alpha: number) => void;
  superSortMode: "disabled" | "order" | "weights";
  setSuperSortMode: (mode: "disabled" | "order" | "weights") => void;
  superSortOrderText: string;
  setSuperSortOrderText: (text: string) => void;
  superSortWeights: { worldbook: number; outline: number; chapter: number };
  setSuperSortWeights: (next: { worldbook: number; outline: number; chapter: number }) => void;
  rerankSaving: boolean;
  applyRerank: () => Promise<void>;
  ingestResult: unknown;
  rebuildResult: unknown;
}) {
  const {
    applyRerank,
    busy,
    debugOpen,
    ingestResult,
    projectId,
    rebuildResult,
    rerankEnabled,
    rerankMethod,
    rerankSaving,
    rerankTopK,
    rerankHybridAlpha,
    setRerankHybridAlpha,
    superSortMode,
    setSuperSortMode,
    superSortOrderText,
    setSuperSortOrderText,
    superSortWeights,
    setSuperSortWeights,
    setDebugOpen,
    setRerankEnabled,
    setRerankMethod,
    setRerankTopK,
    settingsQuery,
  } = props;

  const effectiveSummary = settingsQuery.data ? formatEffectiveRerankSummary(settingsQuery.data) : "还没有加载当前生效配置";
  const nextStepText = settingsQuery.data
    ? "只有在命中顺序明显不对、需要验证排序策略时，才建议进入这里做实验。"
    : "先刷新配置，确认当前生效参数，再决定要不要调整。";
  const experimentStatus = rerankSaving ? "正在保存这轮实验参数" : "当前沿用已保存的实验参数";
  const ingestStatus = ingestResult ? "最近已有入库结果可复查" : "还没有新的入库结果";
  const rebuildStatus = rebuildResult ? "最近已有重建结果可复查" : "还没有新的重建结果";

  return (
    <FeedbackDisclosure
      className="mt-6 rounded-atelier border border-border bg-surface p-4"
      summaryClassName="px-0 py-0 text-sm font-medium text-ink"
      bodyClassName="pt-4"
      title="排序实验台"
      open={debugOpen}
      onToggle={setDebugOpen}
    >
      <div className="grid gap-4">
        <section className="manuscript-status-band">
          <div className="grid gap-1">
            <div className="text-sm text-ink">{nextStepText}</div>
            <div className="text-xs text-subtext">
              这一区域更适合做“排序是否合理”“排序会不会更稳”“入库/重建有没有异常”这类实验，不适合作为日常写作主界面。
            </div>
          </div>
          <div className="manuscript-status-list">
            <span className="manuscript-chip">当前实验状态：{experimentStatus}</span>
            <span className="manuscript-chip">入库结果：{ingestStatus}</span>
            <span className="manuscript-chip">重建结果：{rebuildStatus}</span>
          </div>
        </section>

        <FeedbackCallout title="使用建议">
          使用建议：先在上方“检索验证台”确认确实存在排序问题，再来这里小步调整。否则很容易把“资料本身不对”误判成“排序参数不对”。
        </FeedbackCallout>

        <section className="panel p-4">
          <div className="studio-cluster-header">
            <div>
              <div className="studio-cluster-title">排序实验</div>
              <div className="studio-cluster-copy">
                用于测试候选资料在进入最终结果前，是否需要再做一轮排序。适合处理“明明有相关资料，但排序老是不靠前”的问题。
              </div>
            </div>
            <button
              className="btn btn-secondary"
              disabled={!projectId || settingsQuery.loading || busy}
              onClick={() => void settingsQuery.refresh()}
              type="button"
            >
              {settingsQuery.loading ? "加载中…" : "刷新配置"}
            </button>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">当前正式配置</div>
              <div className="mt-2 text-xs leading-6 text-subtext">{effectiveSummary}</div>
            </div>
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">本轮实验方案</div>
              <div className="mt-2 text-sm text-ink">{formatRerankMethodLabel(rerankMethod, rerankMethod)}</div>
              <div className="mt-1 text-xs leading-6 text-subtext">这轮会观察前 {rerankTopK} 条候选资料的顺序变化。</div>
            </div>
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">排序保守度</div>
              <div className="mt-2 text-sm text-ink">{rerankHybridAlpha}</div>
              <div className="mt-1 text-xs leading-6 text-subtext">{formatHybridAlphaHint(rerankHybridAlpha)}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
              <input
                className="checkbox"
                type="checkbox"
                checked={rerankEnabled}
                onChange={(e) => setRerankEnabled(e.target.checked)}
                disabled={rerankSaving || settingsQuery.loading}
              />
              在检索验证时启用这轮排序实验
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-subtext">实验方式</span>
              <select
                className="select"
                value={rerankMethod}
                onChange={(e) => setRerankMethod(e.target.value)}
                disabled={rerankSaving || settingsQuery.loading}
              >
                <option value="auto">{formatRerankMethodLabel("auto")}</option>
                <option value="rapidfuzz_token_set_ratio">
                  {formatRerankMethodLabel("rapidfuzz_token_set_ratio")}
                </option>
                <option value="token_overlap">{formatRerankMethodLabel("token_overlap")}</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-subtext">参与排序的候选数</span>
              <input
                className="input"
                type="number"
                min={1}
                max={1000}
                value={rerankTopK}
                onChange={(e) => {
                  const next = Math.floor(Number(e.target.value));
                  if (!Number.isFinite(next)) return;
                  setRerankTopK(Math.max(1, Math.min(1000, next)));
                }}
                disabled={rerankSaving || settingsQuery.loading}
              />
            </label>
            <label className="grid gap-1 sm:col-span-3">
              <span className="text-xs text-subtext">排序保守度（0 更相信新排序；1 更保留原顺序；只影响这里的验证请求）</span>
              <input
                className="input"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={rerankHybridAlpha}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setRerankHybridAlpha(Math.max(0, Math.min(1, next)));
                }}
                disabled={busy}
              />
            </label>
            <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
              <button
                className="btn btn-primary"
                disabled={!projectId || rerankSaving || settingsQuery.loading}
                onClick={() => void applyRerank()}
                type="button"
              >
                {rerankSaving ? "保存中…" : "应用排序实验"}
              </button>
              <div className="text-[11px] leading-5 text-subtext">
                风险：这会影响后续检索排序表现。更适合一次只改一个参数，然后回到上方用真实问题重新验证。
              </div>
            </div>
          </div>
        </section>

        <section className="panel p-4">
          <div className="studio-cluster-header">
            <div>
              <div className="studio-cluster-title">排序策略实验</div>
              <div className="studio-cluster-copy">
                这里只影响查询调试请求，适合临时验证“世界书是不是应该永远优先于章节”“某类资料是不是该更重”这类假设。
              </div>
            </div>
            <div className="studio-cluster-meta">不直接改变正式默认策略</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 sm:col-span-3">
              <span className="text-xs text-subtext">验证方式</span>
              <select
                className="select"
                value={superSortMode}
                onChange={(e) => setSuperSortMode(e.target.value as "disabled" | "order" | "weights")}
                disabled={busy}
              >
                <option value="disabled">{formatExperimentModeLabel("disabled")}</option>
                <option value="order">{formatExperimentModeLabel("order")}</option>
                <option value="weights">{formatExperimentModeLabel("weights")}</option>
              </select>
            </label>

            {superSortMode === "order" ? (
              <label className="grid gap-1 sm:col-span-3">
                <span className="text-xs text-subtext">资料优先顺序（逗号分隔）</span>
                <input
                  className="input"
                  value={superSortOrderText}
                  onChange={(e) => setSuperSortOrderText(e.target.value)}
                  placeholder="worldbook,outline,chapter"
                  disabled={busy}
                />
                <span className="text-[11px] leading-5 text-subtext">
                  可用值：worldbook（{formatVectorContentSourceLabel("worldbook")}）、outline（
                  {formatVectorContentSourceLabel("outline")}）、chapter（{formatVectorContentSourceLabel("chapter")}）。
                </span>
              </label>
            ) : null}

            {superSortMode === "weights" ? (
              <>
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{formatVectorContentSourceLabel("worldbook")}权重</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={0.1}
                    value={superSortWeights.worldbook}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      setSuperSortWeights({ ...superSortWeights, worldbook: Math.max(0, next) });
                    }}
                    disabled={busy}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{formatVectorContentSourceLabel("outline")}权重</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={0.1}
                    value={superSortWeights.outline}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      setSuperSortWeights({ ...superSortWeights, outline: Math.max(0, next) });
                    }}
                    disabled={busy}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{formatVectorContentSourceLabel("chapter")}权重</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={0.1}
                    value={superSortWeights.chapter}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      setSuperSortWeights({ ...superSortWeights, chapter: Math.max(0, next) });
                    }}
                    disabled={busy}
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="mt-3 rounded-atelier border border-border bg-canvas p-3 text-xs leading-6 text-subtext">
            当前验证方式：{formatExperimentModeLabel(superSortMode)}。
            {superSortMode === "order" && superSortOrderText
              ? ` 顺序草案：${superSortOrderText
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .map((item) => formatVectorContentSourceLabel(item, item))
                  .join("、") || "尚未填写"}。`
              : null}
          </div>

          <div className="mt-3 text-[11px] leading-5 text-subtext">
            使用建议：只有在你已经确认“资料本身是对的，但来源优先级明显不合理”时，再做这类实验。否则更值得先回去整理资料库和检索范围。
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-4">
            <div className="studio-cluster-header">
              <div>
                <div className="text-sm font-medium text-ink">{UI_COPY.rag.ingestResultTitle}</div>
                <div className="mt-1 text-xs leading-6 text-subtext">这里记录最近一次资料入库的原始结果，适合在“明明导入了资料却查不到”时回看。</div>
              </div>
            </div>
            {ingestResult ? (
              <pre className="mt-3 max-h-80 overflow-auto text-[11px] leading-4 text-subtext">{safeJson(ingestResult)}</pre>
            ) : (
              <FeedbackEmptyState
                variant="compact"
                className="mt-3 rounded-atelier border border-dashed border-border bg-canvas"
                title="还没有入库结果"
                description={`点击“${UI_COPY.rag.ingest}”后，这里会出现原始入库结果。`}
              />
            )}
          </section>

          <section className="panel p-4">
            <div className="studio-cluster-header">
              <div>
                <div className="text-sm font-medium text-ink">{UI_COPY.rag.rebuildResultTitle}</div>
                <div className="mt-1 text-xs leading-6 text-subtext">这里记录最近一次索引重建的原始结果，适合排查“索引重建后还是命中异常”的情况。</div>
              </div>
            </div>
            {rebuildResult ? (
              <pre className="mt-3 max-h-80 overflow-auto text-[11px] leading-4 text-subtext">{safeJson(rebuildResult)}</pre>
            ) : (
              <FeedbackEmptyState
                variant="compact"
                className="mt-3 rounded-atelier border border-dashed border-border bg-canvas"
                title="还没有重建结果"
                description={`点击“${UI_COPY.rag.rebuild}”后，这里会出现原始重建结果。`}
              />
            )}
          </section>
        </div>
      </div>
    </FeedbackDisclosure>
  );
}
