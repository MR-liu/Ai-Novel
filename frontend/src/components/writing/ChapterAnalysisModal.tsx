import { useId } from "react";

import { Modal } from "../ui/Modal";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../ui/Feedback";

import type { ChapterAnalyzeResult } from "./types";

function compactPreview(text: string | null | undefined, limit = 120): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

export function ChapterAnalysisModal(props: {
  open: boolean;
  analysisLoading: boolean;
  rewriteLoading: boolean;
  applyLoading: boolean;
  analysisFocus: string;
  setAnalysisFocus: (value: string) => void;
  analysisResult: ChapterAnalyzeResult | null;
  rewriteInstruction: string;
  setRewriteInstruction: (value: string) => void;
  onClose: () => void;
  onAnalyze: () => void;
  onApplyAnalysisToMemory: () => void;
  onLocateInEditor: (excerpt: string) => void;
  onRewriteFromAnalysis: () => void;
}) {
  const busy = props.analysisLoading || props.rewriteLoading || props.applyLoading;
  const titleId = useId();
  const analysis = props.analysisResult?.analysis;
  const hooks = analysis?.hooks ?? [];
  const foreshadows = analysis?.foreshadows ?? [];
  const plotPoints = analysis?.plot_points ?? [];
  const suggestions = analysis?.suggestions ?? [];
  const warningCount = props.analysisResult?.warnings?.length ?? 0;
  const highPriorityCount = suggestions.filter((item) => String(item.priority ?? "").trim()).length;

  return (
    <Modal
      open={props.open}
      onClose={busy ? undefined : props.onClose}
      panelClassName="surface max-w-4xl p-6"
      ariaLabelledBy={titleId}
    >
      <div className="mt-4 grid gap-3">
        <section className="research-guide-panel">
          <div className="studio-cluster-header">
            <div>
              <div className="studio-cluster-title" id={titleId}>
                章节分析
              </div>
              <div className="studio-cluster-copy">
                分析与重写只会写入生成记录；保存到记忆库会写入长期记忆，不会直接改章节正文。
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {props.analysisResult?.generation_run_id ? (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void navigator.clipboard.writeText(props.analysisResult?.generation_run_id ?? "")}
                  type="button"
                >
                  复制本次分析编号
                </button>
              ) : null}
              <button
                className="btn btn-secondary btn-sm"
                aria-label="关闭"
                onClick={props.onClose}
                disabled={busy}
                type="button"
              >
                关闭
              </button>
            </div>
          </div>

          <div className="studio-overview-grid">
            <div className="studio-overview-card is-emphasis">
              <div className="studio-overview-label">当前阶段</div>
              <div className="studio-overview-value">
                {props.analysisResult ? "已拿到分析结果" : props.analysisLoading ? "分析中" : "等待首次分析"}
              </div>
              <div className="studio-overview-copy">
                先看本章摘要和问题数量，再决定要不要深入看四类细项或直接进入重写。
              </div>
            </div>
            <div className="studio-overview-card">
              <div className="studio-overview-label">下一步建议</div>
              <div className="studio-overview-value">
                {props.analysisResult ? "先审阅再保存或重写" : "先设定分析重点"}
              </div>
              <div className="studio-overview-copy">
                {props.analysisResult
                  ? "如果摘要方向不对，先重新分析；如果方向对，再保存到记忆库或按建议重写。"
                  : "分析重点越具体，后面的建议越容易用于改稿。"}
              </div>
            </div>
          </div>

          <label className="mt-4 grid gap-1">
            <span className="text-xs text-subtext">分析重点（可选）</span>
            <input
              className="input"
              value={props.analysisFocus}
              onChange={(e) => props.setAnalysisFocus(e.target.value)}
              disabled={busy}
              placeholder="例如：钩子/伏笔回收、节奏、人物动机、逻辑矛盾…"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={props.onAnalyze} type="button">
              {props.analysisLoading ? "分析中..." : props.analysisResult ? "重新分析" : "开始分析"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={!props.analysisResult || busy}
              onClick={props.onApplyAnalysisToMemory}
              type="button"
            >
              {props.applyLoading ? "保存中..." : "保存到记忆库"}
            </button>
          </div>
        </section>

        {props.analysisResult ? (
          <div className="grid gap-4">
            {props.analysisResult.parse_error?.message ? (
              <FeedbackCallout tone="danger" title="分析结果解析失败">
                <div>解析失败：{props.analysisResult.parse_error.message}</div>
                {props.analysisResult.parse_error.hint ? (
                  <div className="mt-1 text-xs text-subtext">建议：{props.analysisResult.parse_error.hint}</div>
                ) : null}
              </FeedbackCallout>
            ) : null}

            {props.analysisResult.warnings && props.analysisResult.warnings.length > 0 ? (
              <FeedbackCallout tone="warning" title="分析过程包含提醒">
                {props.analysisResult.warnings.join("；")}
              </FeedbackCallout>
            ) : null}

            <div className="result-overview-grid lg:grid-cols-4">
              <div className="result-overview-card is-emphasis">
                <div className="result-overview-label">本章摘要</div>
                <div className="result-overview-value">{compactPreview(analysis?.chapter_summary, 96)}</div>
                <div className="result-overview-copy">摘要用于先判断分析方向是否正确。</div>
              </div>
              <div className="result-overview-card">
                <div className="result-overview-label">结构命中</div>
                <div className="result-overview-value">
                  钩子 {hooks.length} / 伏笔 {foreshadows.length} / 情节点 {plotPoints.length}
                </div>
                <div className="result-overview-copy">这三类更适合判断本章有没有“铺而不收”或“收而不够”。</div>
              </div>
              <div className="result-overview-card">
                <div className="result-overview-label">修改建议</div>
                <div className="result-overview-value">
                  {suggestions.length} 条{highPriorityCount ? ` / ${highPriorityCount} 条带优先级` : ""}
                </div>
                <div className="result-overview-copy">建议数量多时，先看带优先级的项。</div>
              </div>
              <div className="result-overview-card">
              <div className="result-overview-label">执行状态</div>
              <div className="result-overview-value">
                {warningCount ? `${warningCount} 条提醒` : "无额外提醒"}
              </div>
              <div className="result-overview-copy">
                  本次分析编号: {props.analysisResult.generation_run_id || "（空）"}
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <FeedbackDisclosure
                title={`钩子（${hooks.length}）`}
                className="drawer-workbench-disclosure"
                summaryClassName="text-xs text-subtext hover:text-ink"
                bodyClassName="pt-3"
              >
                {hooks.length === 0 ? (
                  <FeedbackEmptyState variant="compact" title="当前没有钩子命中" description="这章可能更偏铺垫或收束。" />
                ) : (
                  <div className="grid gap-2">
                    {hooks.map((item, idx) => (
                      <div key={idx} className="drawer-workbench-subcard">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink">{compactPreview(item.note, 80)}</div>
                            <div className="mt-1 text-xs leading-5 text-subtext">
                              {compactPreview(item.excerpt, 120)}
                            </div>
                          </div>
                          {item.excerpt ? (
                            <button
                              className="btn btn-ghost px-2 py-1 text-xs"
                              onClick={() => props.onLocateInEditor(item.excerpt ?? "")}
                              type="button"
                            >
                              定位
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </FeedbackDisclosure>

              <FeedbackDisclosure
                title={`伏笔（${foreshadows.length}）`}
                className="drawer-workbench-disclosure"
                summaryClassName="text-xs text-subtext hover:text-ink"
                bodyClassName="pt-3"
              >
                {foreshadows.length === 0 ? (
                  <FeedbackEmptyState variant="compact" title="当前没有伏笔命中" description="如果你预期这里有埋点，建议重新分析确认是否漏识别。" />
                ) : (
                  <div className="grid gap-2">
                    {foreshadows.map((item, idx) => (
                      <div key={idx} className="drawer-workbench-subcard">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink">{compactPreview(item.note, 80)}</div>
                            <div className="mt-1 text-xs leading-5 text-subtext">
                              {compactPreview(item.excerpt, 120)}
                            </div>
                          </div>
                          {item.excerpt ? (
                            <button
                              className="btn btn-ghost px-2 py-1 text-xs"
                              onClick={() => props.onLocateInEditor(item.excerpt ?? "")}
                              type="button"
                            >
                              定位
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </FeedbackDisclosure>

              <FeedbackDisclosure
                title={`情节点（${plotPoints.length}）`}
                className="drawer-workbench-disclosure"
                summaryClassName="text-xs text-subtext hover:text-ink"
                bodyClassName="pt-3"
              >
                {plotPoints.length === 0 ? (
                  <FeedbackEmptyState variant="compact" title="当前没有情节点命中" description="这章可能更偏过渡，或需要更具体的分析重点。" />
                ) : (
                  <div className="grid gap-2">
                    {plotPoints.map((item, idx) => (
                      <div key={idx} className="drawer-workbench-subcard">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink">
                              {(item.beat ?? "").trim() || "（未命名情节点）"}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-subtext">
                              {compactPreview(item.excerpt, 140)}
                            </div>
                          </div>
                          {item.excerpt ? (
                            <button
                              className="btn btn-ghost px-2 py-1 text-xs"
                              onClick={() => props.onLocateInEditor(item.excerpt ?? "")}
                              type="button"
                            >
                              定位
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </FeedbackDisclosure>

              <FeedbackDisclosure
                title={`修改建议（${suggestions.length}）`}
                className="drawer-workbench-disclosure"
                summaryClassName="text-xs text-subtext hover:text-ink"
                bodyClassName="pt-3"
              >
                {suggestions.length === 0 ? (
                  <FeedbackEmptyState variant="compact" title="当前没有修改建议" description="说明这次分析没有给出明确改动项，或输入重点过宽。" />
                ) : (
                  <div className="grid gap-2">
                    {suggestions.map((item, idx) => (
                      <div key={idx} className="drawer-workbench-subcard">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink">
                              {(item.title ?? "").trim() || "建议"}
                              {(item.priority ?? "").trim() ? (
                                <span className="ml-2 text-xs text-subtext">({item.priority})</span>
                              ) : null}
                            </div>
                            {item.issue ? <div className="mt-2 text-sm text-ink">问题：{item.issue}</div> : null}
                            {item.recommendation ? (
                              <div className="mt-2 text-sm text-ink">建议：{item.recommendation}</div>
                            ) : null}
                            <div className="mt-2 text-xs leading-5 text-subtext">
                              {compactPreview(item.excerpt, 140)}
                            </div>
                          </div>
                          {item.excerpt ? (
                            <button
                              className="btn btn-ghost px-2 py-1 text-xs"
                              onClick={() => props.onLocateInEditor(item.excerpt ?? "")}
                              type="button"
                            >
                              定位
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </FeedbackDisclosure>
            </div>

            {analysis?.overall_notes ? (
              <FeedbackDisclosure
                title="总体备注"
                className="drawer-workbench-disclosure"
                summaryClassName="text-xs text-subtext hover:text-ink"
                bodyClassName="pt-3"
              >
                <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
                  {analysis.overall_notes}
                </pre>
              </FeedbackDisclosure>
            ) : null}

            <FeedbackDisclosure
              title="查看完整分析输出（高级）"
              className="drawer-workbench-disclosure"
              summaryClassName="text-xs text-subtext hover:text-ink"
              bodyClassName="pt-3"
            >
              <pre className="drawer-workbench-codeblock mt-2 text-xs text-ink">
                {props.analysisResult.raw_output ?? ""}
              </pre>
            </FeedbackDisclosure>
          </div>
        ) : (
          <FeedbackEmptyState
            variant="compact"
            title="还没有分析结果"
            description="可以先填写分析重点，再开始分析。本次结果只会写入生成记录，不会直接修改正文。"
          />
        )}

        <div className="panel p-4">
          <div className="studio-cluster-header">
            <div>
              <div className="studio-cluster-title">按建议重写（覆盖编辑器正文）</div>
              <div className="studio-cluster-copy">
                只有当你已经确认分析方向是对的，再进入这一步。重写结果会直接回写编辑器，但不会自动保存。
              </div>
            </div>
            <div className="studio-cluster-meta">{props.analysisResult ? "可执行" : "需先完成分析"}</div>
          </div>
          <div className="result-overview-grid lg:grid-cols-3">
            <div className="result-overview-card is-emphasis">
              <div className="result-overview-label">当前状态</div>
              <div className="result-overview-value">{props.analysisResult ? "已可按建议重写" : "请先完成分析"}</div>
              <div className="result-overview-copy">没有分析结果时，重写按钮会保持禁用。</div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">应用方式</div>
              <div className="result-overview-value">覆盖编辑器正文</div>
              <div className="result-overview-copy">不会自动保存，执行后仍需 Ctrl/Cmd+S。</div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">推荐顺序</div>
              <div className="result-overview-value">先定位，再重写</div>
              <div className="result-overview-copy">先用上面的定位按钮确认问题位置，再决定是否整体重写。</div>
            </div>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">重写指令（可选）</span>
            <input
              className="input"
              value={props.rewriteInstruction}
              onChange={(e) => props.setRewriteInstruction(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-subtext">重写结果不会自动保存，记得 Ctrl/Cmd+S 保存。</div>
            <button
              className="btn btn-primary"
              disabled={!props.analysisResult || busy}
              onClick={props.onRewriteFromAnalysis}
              type="button"
            >
              {props.rewriteLoading ? "重写中..." : "按建议重写并应用"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
