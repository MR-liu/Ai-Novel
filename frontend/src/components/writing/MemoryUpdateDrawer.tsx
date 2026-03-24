import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { buildStudioSystemPath } from "../../lib/projectRoutes";
import { UI_COPY } from "../../lib/uiCopy";
import { ApiError, apiJson } from "../../services/apiClient";
import { Drawer } from "../ui/Drawer";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../ui/Feedback";
import { useToast } from "../ui/toast";
import { WritingDrawerHeader, WritingDrawerSection } from "./WritingDrawerWorkbench";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  chapterId?: string;
};

type MemoryChangeSet = {
  id: string;
  project_id: string;
  actor_user_id?: string | null;
  generation_run_id?: string | null;
  request_id?: string | null;
  idempotency_key: string;
  title?: string | null;
  summary_md?: string | null;
  status: string;
  created_at?: string | null;
  applied_at?: string | null;
  rolled_back_at?: string | null;
};

type MemoryChangeSetItem = {
  id: string;
  item_index: number;
  target_table: string;
  target_id?: string | null;
  op: string;
  before_json?: string | null;
  after_json?: string | null;
  evidence_ids_json?: string | null;
};

type ProposeResult = {
  idempotent: boolean;
  change_set: MemoryChangeSet;
  items: MemoryChangeSetItem[];
};

type ApplyResult = {
  idempotent: boolean;
  change_set: MemoryChangeSet;
  warnings: Array<{ code?: string; message?: string; item_id?: string }>;
};

type StructuredEntity = {
  id: string;
  entity_type: string;
  name: string;
  deleted_at?: string | null;
};

type StructuredMemory = {
  entities: StructuredEntity[];
  counts?: Record<string, number>;
};

const EXAMPLE_OPS = JSON.stringify(
  [
    {
      op: "upsert",
      target_table: "entities",
      after: { entity_type: "character", name: "Alice", summary_md: "主角", attributes: { age: 18 } },
    },
  ],
  null,
  2,
);

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const raw = (text || "").trim();
  if (!raw) return { ok: false, error: "请输入底层指令（JSON）" };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "底层指令解析失败" };
  }
}

function toOpsPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const ops = (value as Record<string, unknown>).ops;
    if (Array.isArray(ops)) return ops;
  }
  return [];
}

function humanStatus(status: string): string {
  if (status === "proposed") return "待应用";
  if (status === "applied") return "已应用";
  if (status === "rolled_back") return "已回滚";
  if (status === "failed") return "失败";
  return status || "未知";
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function removeIdField(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const o = { ...(value as Record<string, unknown>) };
  delete o.id;
  return o;
}

function safeParseJsonField(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function MemoryUpdateDrawer(props: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const { chapterId, onClose, open, projectId } = props;
  const titleId = useId();
  const copy = UI_COPY.writing.memoryUpdateDrawer;
  const [inputJson, setInputJson] = useState(EXAMPLE_OPS);
  const [autoFocus, setAutoFocus] = useState("");

  const [proposeLoading, setProposeLoading] = useState(false);
  const [proposeError, setProposeError] = useState<ApiError | null>(null);
  const [proposeResult, setProposeResult] = useState<ProposeResult | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<ApiError | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [lastApplyChangeSetId, setLastApplyChangeSetId] = useState<string | null>(null);

  const [structuredLoading, setStructuredLoading] = useState(false);
  const [structuredError, setStructuredError] = useState<ApiError | null>(null);
  const [structured, setStructured] = useState<StructuredMemory | null>(null);

  useEffect(() => {
    if (!open) return;
    setProposeError(null);
    setApplyError(null);
    setStructuredError(null);
  }, [open]);

  useEffect(() => {
    if (!proposeResult) return;
    const next: Record<string, boolean> = {};
    for (const item of proposeResult.items ?? []) next[item.id] = true;
    setAccepted(next);
  }, [proposeResult]);

  const groups = useMemo(() => {
    const items = proposeResult?.items ?? [];
    const out = new Map<string, MemoryChangeSetItem[]>();
    for (const item of items) {
      const key = item.target_table || "unknown";
      const list = out.get(key) ?? [];
      list.push(item);
      out.set(key, list);
    }
    return Array.from(out.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [proposeResult]);
  const proposedItemCount = proposeResult?.items.length ?? 0;
  const acceptedCount = useMemo(
    () => (proposeResult?.items ?? []).filter((item) => accepted[item.id] !== false).length,
    [accepted, proposeResult],
  );
  const structuredCountSummary = useMemo(() => {
    if (!structured) return "待刷新";
    if (!structured.counts || Object.keys(structured.counts).length === 0) return "暂无统计";
    return Object.entries(structured.counts)
      .map(([key, value]) => `${key}:${value}`)
      .join(" | ");
  }, [structured]);

  const runPropose = useCallback(async () => {
    if (!chapterId) {
      toast.toastError("请先选择章节");
      return;
    }
    setProposeLoading(true);
    setProposeError(null);
    setApplyResult(null);
    setApplyError(null);
    try {
      const parsed = safeJsonParse(inputJson);
      if (!parsed.ok)
        throw new ApiError({ code: "INVALID_JSON", message: parsed.error, requestId: "local", status: 0 });
      const ops = toOpsPayload(parsed.value);
      if (!ops.length)
        throw new ApiError({
          code: "INVALID_OPS",
          message: "底层指令需要是操作数组，或包含 ops 字段。",
          requestId: "local",
          status: 0,
        });

      const idempotencyKey = `memupd-${crypto.randomUUID().slice(0, 12)}`;
      const req = {
        schema_version: "memory_update_v1",
        idempotency_key: idempotencyKey,
        title: "连续性更新（校验）",
        ops,
      };

      const res = await apiJson<ProposeResult>(`/api/chapters/${chapterId}/memory/propose`, {
        method: "POST",
        body: JSON.stringify(req),
      });
      setProposeResult(res.data);
      toast.toastSuccess("已生成建议");
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setProposeError(err);
    } finally {
      setProposeLoading(false);
    }
  }, [chapterId, inputJson, toast]);

  const runAutoPropose = useCallback(async () => {
    if (!chapterId) {
      toast.toastError("请先选择章节");
      return;
    }
    setProposeLoading(true);
    setProposeError(null);
    setApplyResult(null);
    setApplyError(null);
    try {
      const idempotencyKey = `memupd-auto-${crypto.randomUUID().slice(0, 12)}`;
      const res = await apiJson<ProposeResult>(`/api/chapters/${chapterId}/memory/propose/auto`, {
        method: "POST",
        body: JSON.stringify({ idempotency_key: idempotencyKey, focus: autoFocus.trim() || null }),
      });
      setProposeResult(res.data);
      toast.toastSuccess("已生成建议");
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setProposeError(err);
    } finally {
      setProposeLoading(false);
    }
  }, [autoFocus, chapterId, toast]);

  const runApplyAccepted = useCallback(async () => {
    if (!chapterId) {
      toast.toastError("请先选择章节");
      return;
    }
    if (!proposeResult) {
      toast.toastError(copy.missingProposeHint);
      return;
    }
    const acceptedItems = (proposeResult.items ?? []).filter((item) => accepted[item.id] !== false);
    if (!acceptedItems.length) {
      toast.toastError("没有可应用的条目（当前都未勾选）");
      return;
    }

    setApplyLoading(true);
    setApplyError(null);
    try {
      const ops = acceptedItems.map((item) => {
        const evidenceIds = safeParseJsonField(item.evidence_ids_json);
        if (item.op === "delete") {
          const base: Record<string, unknown> = {
            op: "delete",
            target_table: item.target_table,
            target_id: item.target_id,
          };
          if (Array.isArray(evidenceIds) && evidenceIds.length) base.evidence_ids = evidenceIds;
          return base;
        }
        const afterRaw = safeParseJsonField(item.after_json);
        const after = removeIdField(afterRaw);
        const base: Record<string, unknown> = {
          op: "upsert",
          target_table: item.target_table,
          target_id: item.target_id,
          after,
        };
        if (Array.isArray(evidenceIds) && evidenceIds.length) base.evidence_ids = evidenceIds;
        return base;
      });

      const idempotencyKey = `memupd-${crypto.randomUUID().slice(0, 12)}`;
      const proposeReq = {
        schema_version: "memory_update_v1",
        idempotency_key: idempotencyKey,
        title: "连续性更新（已应用）",
        ops,
      };
      const proposed = await apiJson<ProposeResult>(`/api/chapters/${chapterId}/memory/propose`, {
        method: "POST",
        body: JSON.stringify(proposeReq),
      });
      const changeSetId = proposed.data?.change_set?.id;
      if (!changeSetId) {
        throw new ApiError({
          code: "BAD_RESPONSE",
          message: "缺少 change_set.id",
          requestId: proposed.request_id,
          status: 200,
        });
      }
      setLastApplyChangeSetId(changeSetId);

      const applied = await apiJson<ApplyResult>(`/api/memory_change_sets/${changeSetId}/apply`, { method: "POST" });
      setApplyResult(applied.data);
      toast.toastSuccess("已应用变更");
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setApplyError(err);
    } finally {
      setApplyLoading(false);
    }
  }, [accepted, chapterId, proposeResult, toast]);

  const retryApply = useCallback(async () => {
    if (!lastApplyChangeSetId) {
      toast.toastError("没有可重试的变更集编号");
      return;
    }
    setApplyLoading(true);
    setApplyError(null);
    try {
      const applied = await apiJson<ApplyResult>(`/api/memory_change_sets/${lastApplyChangeSetId}/apply`, {
        method: "POST",
      });
      setApplyResult(applied.data);
      toast.toastSuccess("已重新应用变更");
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setApplyError(err);
    } finally {
      setApplyLoading(false);
    }
  }, [lastApplyChangeSetId, toast]);

  const refreshStructured = useCallback(async () => {
    if (!projectId) {
      toast.toastError("缺少 projectId");
      return;
    }
    setStructuredLoading(true);
    setStructuredError(null);
    try {
      const res = await apiJson<StructuredMemory>(`/api/projects/${projectId}/memory/structured`, {
        method: "GET",
      });
      setStructured(res.data);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setStructuredError(err);
    } finally {
      setStructuredLoading(false);
    }
  }, [projectId, toast]);

  const openTaskCenter = useCallback(() => {
    if (!projectId) return;
    const qs = new URLSearchParams();
    if (chapterId) qs.set("chapterId", chapterId);
    const base = buildStudioSystemPath(projectId, "tasks");
    navigate(`${base}${qs.toString() ? `?${qs.toString()}` : ""}`);
    onClose();
  }, [chapterId, navigate, onClose, projectId]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      panelClassName="h-full w-full max-w-[860px] overflow-hidden border-l border-border bg-surface shadow-sm"
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-auto p-4">
          <div className="grid gap-4">
            <WritingDrawerHeader
              titleId={titleId}
              kicker="连续性更新"
              title={copy.title}
              description={copy.subtitle}
              meta={[
                {
                  label: "章节上下文",
                  value: chapterId ? "已绑定" : "未选择",
                  tone: chapterId ? "success" : "warning",
                },
                {
                  label: "建议条目",
                  value: proposeResult ? `${acceptedCount}/${proposedItemCount} 已接受` : "等待生成",
                },
                {
                  label: "结构化校验",
                  value: structuredCountSummary,
                },
              ]}
              actions={
                <>
                  <button className="btn btn-secondary" disabled={!projectId} onClick={openTaskCenter} type="button">
                    任务中心
                  </button>
                  <button className="btn btn-secondary" aria-label="关闭" onClick={onClose} type="button">
                    关闭
                  </button>
                </>
              }
              callout={
                <div className="text-sm leading-6 text-subtext">
                  先拿到一版连续性建议，再只保留你认可的条目，最后应用并刷新结构化记忆确认是否真正落库。
                </div>
              }
            />

            <WritingDrawerSection
              kicker="STEP 1"
              title={copy.step1}
              copy="先走一键生成建议，再按需切到底层指令（JSON）手动修正。这样首屏先给你结果，不要求一开始就写完整变更指令。"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="drawer-workbench-subcard">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">快速路径</div>
                  <div className="mt-2 text-sm font-semibold text-ink">{copy.quickPathTitle}</div>
                  <div className="mt-2 text-sm leading-6 text-subtext">
                    {copy.step1Hint} 可先填写一个关注点，让系统更聚焦这次要整理的人物、关系或事件。
                  </div>
                  <label className="mt-3 block text-xs text-subtext">
                    {copy.focusLabel}
                    <input
                      className="input mt-1 w-full"
                      aria-label="memory_update_focus"
                      name="memory_update_focus"
                      value={autoFocus}
                      onChange={(e) => setAutoFocus(e.target.value)}
                      placeholder={copy.focusPlaceholder}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className="btn btn-primary"
                      onClick={() => void runAutoPropose()}
                      disabled={proposeLoading}
                      type="button"
                    >
                      {proposeLoading ? copy.proposing : copy.autoPropose}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => void runPropose()}
                      disabled={proposeLoading}
                      type="button"
                    >
                      {proposeLoading ? copy.proposing : copy.propose}
                    </button>
                  </div>
                </div>

                <div className="drawer-workbench-subcard">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">高级路径</div>
                  <div className="mt-2 text-sm font-semibold text-ink">{copy.jsonLabel}</div>
                  <div className="mt-2 text-sm leading-6 text-subtext">
                    {copy.inputHint} 适合手工重放、微调字段或验证连续性更新结果。
                  </div>
                  <textarea
                    className="textarea mt-3 min-h-40 w-full font-mono text-xs"
                    aria-label="memory_update_json"
                    name="memory_update_json"
                    value={inputJson}
                    onChange={(e) => setInputJson(e.target.value)}
                  />
                </div>
              </div>

              {proposeError ? (
                <FeedbackCallout className="mt-3" tone="danger" title={copy.proposeFailed}>
                  <div className="text-xs">
                    {proposeError.message} ({proposeError.code}){" "}
                    {proposeError.requestId ? `| 定位编号: ${proposeError.requestId}` : ""}
                  </div>
                </FeedbackCallout>
              ) : null}
            </WritingDrawerSection>

            {proposeResult ? (
              <WritingDrawerSection
                kicker="STEP 2"
                title={copy.step2}
                copy="先看建议范围和接受比例，再展开某一组看前后对比。这样不会一进来就被全部底层细节淹没。"
              >
                <div className="result-overview-grid">
                  <div className="result-overview-card is-emphasis">
                    <div className="result-overview-label">审阅状态</div>
                    <div className="result-overview-value">{humanStatus(proposeResult.change_set.status)}</div>
                    <div className="result-overview-copy">{copy.reviewTitle}</div>
                  </div>
                  <div className="result-overview-card">
                    <div className="result-overview-label">接受比例</div>
                    <div className="result-overview-value">
                      {acceptedCount}/{proposedItemCount}
                    </div>
                    <div className="result-overview-copy">取消勾选的条目不会进入应用阶段。</div>
                  </div>
                  <div className="result-overview-card">
                    <div className="result-overview-label">变更集</div>
                    <div className="result-overview-value">{proposeResult.change_set.id}</div>
                    <div className="result-overview-copy">
                      {proposeResult.change_set.request_id
                        ? `定位编号: ${proposeResult.change_set.request_id}`
                        : "后续应用或重试时会继续复用这一组变更。"}
                    </div>
                  </div>
                </div>

                {groups.length === 0 ? (
                  <FeedbackEmptyState
                    className="mt-3"
                    variant="compact"
                    title="这次没有可审阅的变更条目"
                    description="如果建议已成功但条目为空，通常表示输入操作没有产生可落库的连续性更新。"
                  />
                ) : (
                  <div className="mt-3 grid gap-3">
                    {groups.map(([table, items]) => (
                      <FeedbackDisclosure
                        key={table}
                        defaultOpen
                        className="drawer-workbench-disclosure"
                        summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                        bodyClassName="pt-3"
                        title={`${table}（${items.length}）`}
                      >
                        <div className="grid gap-2">
                          {items.map((item) => {
                            const before = safeParseJsonField(item.before_json);
                            const after = safeParseJsonField(item.after_json);
                            const evidenceIds = safeParseJsonField(item.evidence_ids_json);
                            const evidenceCount = Array.isArray(evidenceIds) ? evidenceIds.length : 0;
                            return (
                              <div key={item.id} className="drawer-workbench-subcard text-xs">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 text-ink">
                                      <label className="flex items-center gap-2">
                                        <input
                                          className="checkbox"
                                          type="checkbox"
                                          checked={accepted[item.id] !== false}
                                          onChange={(e) =>
                                            setAccepted((prev) => ({ ...prev, [item.id]: e.target.checked }))
                                          }
                                        />
                                        {copy.accept}
                                      </label>
                                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-subtext">
                                        #{item.item_index}
                                      </span>
                                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-subtext">
                                        {item.op}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-sm font-semibold text-ink">
                                      {item.target_table}
                                      {item.target_id ? ` | ${item.target_id}` : ""}
                                    </div>
                                    <div className="mt-1 text-[11px] text-subtext">
                                      {evidenceCount ? `关联证据 ${evidenceCount} 条` : "当前未附带证据 ID"}
                                    </div>
                                  </div>
                                </div>

                                <FeedbackDisclosure
                                  className="drawer-workbench-disclosure mt-3"
                                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                                  bodyClassName="pt-3"
                                  title={copy.diffPreview}
                                >
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                      <div className="text-[11px] text-subtext">{copy.before}</div>
                                      <pre className="drawer-workbench-codeblock mt-2">
                                        {safeJsonStringify(before) || "null"}
                                      </pre>
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-subtext">{copy.after}</div>
                                      <pre className="drawer-workbench-codeblock mt-2">
                                        {safeJsonStringify(after) || "null"}
                                      </pre>
                                    </div>
                                  </div>
                                </FeedbackDisclosure>
                              </div>
                            );
                          })}
                        </div>
                      </FeedbackDisclosure>
                    ))}
                  </div>
                )}
              </WritingDrawerSection>
            ) : null}

            <WritingDrawerSection
              kicker="STEP 3"
              title={copy.step3}
              copy="只有建议通过审阅后才进入应用。应用失败时会保留变更集编号，方便你直接重试。"
            >
              <div className="result-overview-grid">
                <div className="result-overview-card is-emphasis">
                  <div className="result-overview-label">当前状态</div>
                  <div className="result-overview-value">
                    {applyResult ? humanStatus(applyResult.change_set.status) : "等待应用"}
                  </div>
                  <div className="result-overview-copy">{copy.step3Hint}</div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">最近应用</div>
                  <div className="result-overview-value">
                    {applyResult ? applyResult.change_set.id : lastApplyChangeSetId || "尚未应用"}
                  </div>
                  <div className="result-overview-copy">
                    {applyResult?.idempotent ? "这次返回的是重复提交保护结果。" : "失败时会复用最近变更集编号重试。"}
                  </div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">下一步</div>
                  <div className="result-overview-value">{proposeResult ? "应用已接受条目" : "先生成建议"}</div>
                  <div className="result-overview-copy">
                    {!proposeResult ? copy.missingProposeHint : "应用后再刷新结构化记忆，确认事实已经同步。"}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-secondary"
                  onClick={() => void runApplyAccepted()}
                  disabled={applyLoading || !proposeResult}
                  type="button"
                >
                  {applyLoading ? copy.applying : copy.applyAccepted}
                </button>
                {!proposeResult ? <div className="text-xs text-subtext">{copy.missingProposeHint}</div> : null}
              </div>

              {applyError ? (
                <FeedbackCallout
                  className="mt-3"
                  tone="danger"
                  title={copy.applyFailed}
                  actions={
                    <button
                      className="btn btn-secondary"
                      onClick={() => void retryApply()}
                      disabled={applyLoading}
                      type="button"
                    >
                      {copy.retryApply}
                    </button>
                  }
                >
                  {applyError.message} ({applyError.code}){" "}
                  {applyError.requestId ? `| 定位编号: ${applyError.requestId}` : ""}
                  {lastApplyChangeSetId ? <div className="mt-1">变更集编号: {lastApplyChangeSetId}</div> : null}
                </FeedbackCallout>
              ) : null}

              {applyResult ? (
                <div className="mt-3">
                  <div className="text-sm text-ink">{copy.applyResultTitle}</div>
                  <div className="mt-1 text-xs text-subtext">变更集编号: {applyResult.change_set.id}</div>
                  {applyResult.warnings?.length ? (
                    <FeedbackDisclosure
                      className="drawer-workbench-disclosure mt-3"
                      summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                      bodyClassName="pt-3"
                      title={`${copy.warnings}（${applyResult.warnings.length}）`}
                    >
                      <pre className="drawer-workbench-codeblock mt-2">{safeJsonStringify(applyResult.warnings)}</pre>
                    </FeedbackDisclosure>
                  ) : (
                    <div className="mt-2 text-xs text-subtext">{copy.warningsZero}</div>
                  )}
                </div>
              ) : null}
            </WritingDrawerSection>

            <WritingDrawerSection
              kicker="VERIFY"
              title="结构化资料校验"
              copy="这里只保留落库确认所需的信息：先看统计，再按需展开实体样本，不把全部底层内容平铺到首屏。"
            >
              <div className="result-overview-grid">
                <div className="result-overview-card is-emphasis">
                  <div className="result-overview-label">当前统计</div>
                  <div className="result-overview-value">{structuredCountSummary}</div>
                  <div className="result-overview-copy">应用后点击刷新，确认结构化事实是否同步更新。</div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">实体样本</div>
                  <div className="result-overview-value">{structured?.entities?.length ?? 0}</div>
                  <div className="result-overview-copy">这里只预览前 12 条，避免抽屉继续向下拉长。</div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">校验动作</div>
                  <div className="result-overview-value">{structuredLoading ? "刷新中…" : "手动刷新"}</div>
                  <div className="result-overview-copy">
                    没有 projectId 时无法刷新；没有结果时默认显示等待校验。
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-secondary"
                  onClick={() => void refreshStructured()}
                  disabled={structuredLoading}
                  type="button"
                >
                  {structuredLoading ? "刷新..." : "刷新"}
                </button>
              </div>

              {structuredError ? (
                <FeedbackCallout className="mt-3" tone="danger" title="结构化记忆刷新失败">
                  {structuredError.message} ({structuredError.code}) | 定位编号: {structuredError.requestId}
                </FeedbackCallout>
              ) : null}

              {structured ? (
                <FeedbackDisclosure
                  className="drawer-workbench-disclosure mt-3"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  bodyClassName="pt-3"
                  title={`查看实体样本（${Math.min((structured.entities ?? []).length, 12)}）`}
                >
                  <div className="grid gap-2">
                    {(structured.entities ?? []).slice(0, 12).map((entity) => (
                      <div key={entity.id} className="drawer-workbench-subcard text-xs">
                        <div className="text-ink">
                          {entity.entity_type}:{entity.name}
                        </div>
                        <div className="mt-1 text-subtext">
                          {entity.deleted_at ? `已删除于: ${entity.deleted_at}` : "当前有效"}
                        </div>
                      </div>
                    ))}
                    {(structured.entities ?? []).length === 0 ? <div className="text-xs text-subtext">实体数: 0</div> : null}
                  </div>
                </FeedbackDisclosure>
              ) : (
                <div className="mt-3 text-xs text-subtext">提示：应用后点“刷新”确认结构化事实已落库。</div>
              )}
            </WritingDrawerSection>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
