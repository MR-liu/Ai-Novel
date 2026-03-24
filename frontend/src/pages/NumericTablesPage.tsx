import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState, FeedbackStateCard } from "../components/ui/Feedback";
import { TablesPanelInline } from "../components/writing/TablesPanel";
import { useToast } from "../components/ui/toast";
import { copyText } from "../lib/copyText";
import { buildStudioSystemPath } from "../lib/projectRoutes";
import { UI_COPY } from "../lib/uiCopy";
import { ApiError, apiJson } from "../services/apiClient";

type ProjectTable = {
  id: string;
  project_id: string;
  table_key: string;
  name: string;
  row_count?: number;
  updated_at?: string | null;
};

export function NumericTablesPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const pid = String(projectId || "");

  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tables, setTables] = useState<ProjectTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>("");

  const [focus, setFocus] = useState<string>("");
  const [scheduling, setScheduling] = useState(false);
  const [lastTaskId, setLastTaskId] = useState<string>("");

  const selectedTable = useMemo(() => tables.find((t) => t.id === selectedTableId) ?? null, [selectedTableId, tables]);
  const currentTableLabel = selectedTable ? `${selectedTable.name}（${selectedTable.table_key}）` : "尚未选择表格";
  const currentFocusLabel = focus.trim() || "未设置更新重点";

  const loadTables = useCallback(async () => {
    if (!pid) return;
    setTablesLoading(true);
    setTablesError(null);
    try {
      const res = await apiJson<{ tables: ProjectTable[] }>(`/api/projects/${pid}/tables?include_schema=false`);
      const next = Array.isArray(res.data?.tables) ? res.data.tables : [];
      setTables(next);
      setSelectedTableId((prev) => {
        if (prev && next.some((t) => t.id === prev)) return prev;
        return next[0]?.id ?? "";
      });
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setTablesError(`${err.message} (${err.code})${err.requestId ? ` 请求 ID（request_id）:${err.requestId}` : ""}`);
    } finally {
      setTablesLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    if (!pid) return;
    void loadTables();
  }, [loadTables, pid]);

  const scheduleAiUpdate = useCallback(async () => {
    if (!pid) return;
    const tableId = selectedTableId.trim();
    if (!tableId) {
      toast.toastError("请先选择一个表格");
      return;
    }
    setScheduling(true);
    try {
      const res = await apiJson<{ task_id: string; chapter_id?: string | null; table_id?: string | null }>(
        `/api/projects/${pid}/tables/${encodeURIComponent(tableId)}/ai_update`,
        {
          method: "POST",
          body: JSON.stringify({ focus: focus.trim() || null }),
        },
      );
      const taskId = String(res.data?.task_id || "").trim();
      if (taskId) setLastTaskId(taskId);
      toast.toastSuccess("已创建 AI 更新任务", res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setScheduling(false);
    }
  }, [focus, pid, selectedTableId, toast]);

  if (!pid)
    return (
      <ToolContent>
        <FeedbackStateCard
          tone="danger"
          kicker="表格资料"
          title="当前无法打开表格资料"
          description="缺少 `projectId`，请从具体项目进入后再查看和维护结构化资料。"
        />
      </ToolContent>
    );

  return (
    <ToolContent className="grid gap-4">
      <EditorialHero
        kicker="表格资料"
        title={UI_COPY.nav.numericTables}
        subtitle="把金钱、时间、等级、库存、组织状态等适合结构化维护的信息集中放在这里。它服务于作者资料管理，不是后台系统页。"
        items={[
          { key: "selected", label: "当前选中", value: currentTableLabel },
          { key: "focus", label: "更新重点", value: currentFocusLabel },
          { key: "task", label: "最近任务", value: lastTaskId || "还没有创建更新任务" },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          {lastTaskId ? (
            <Link
              className="btn btn-secondary"
              to={`${buildStudioSystemPath(pid, "tasks")}?project_task_id=${encodeURIComponent(lastTaskId)}`}
            >
              查看最近任务
            </Link>
          ) : (
            <Link className="btn btn-secondary" to={buildStudioSystemPath(pid, "tasks")}>
              打开任务中心
            </Link>
          )}
          <button className="btn btn-secondary" onClick={() => void loadTables()} type="button">
            刷新表列表
          </button>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{tables.length} 张表</span>
          <span className="manuscript-chip">{selectedTable ? `已选：${selectedTable.name}` : "等待选择表格"}</span>
          <span className="manuscript-chip">{lastTaskId ? "可回到任务中心追踪结果" : "尚未创建任务"}</span>
        </div>
      </section>

      <FeedbackDisclosure
        className="studio-header-panel"
        summaryClassName="text-sm text-subtext hover:text-ink"
        bodyClassName="pt-3"
        title="AI 辅助更新"
      >
        <div className="mt-3 grid gap-3">
          <div className="grid gap-1 text-sm text-subtext">
            <div>点击后会创建一个后台任务，你可以在任务中心查看结果、失败重试和后续变更。</div>
            <div>任务成功后只会产出待采纳的变更建议，不会让 AI 直接改写表格资料。</div>
          </div>

          <div className="grid gap-2 lg:grid-cols-[1fr,2fr]">
            <label className="grid gap-1">
              <div className="text-xs text-subtext">目标表</div>
              <select
                className="select"
                id="numeric_tables_select_table"
                name="numeric_tables_select_table"
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                aria-label="选择目标表 (numeric_tables_select_table)"
              >
                <option value="" disabled>
                  {tablesLoading ? "加载中..." : tablesError ? "加载失败" : "请选择"}
                </option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.table_key})
                  </option>
                ))}
              </select>
              {tablesError ? (
                <FeedbackCallout className="mt-2" tone="danger" title="表格列表加载失败">
                  {tablesError}
                </FeedbackCallout>
              ) : null}
              {!tablesLoading && !tablesError && tables.length === 0 ? (
                <FeedbackEmptyState
                  className="mt-2"
                  variant="compact"
                  title="还没有可更新的表格"
                  description="先在下方创建一张表，再回来用 AI 辅助补充或校对结构化资料。"
                />
              ) : null}
            </label>

            <label className="grid gap-1">
              <div className="text-xs text-subtext">更新重点（可选）</div>
              <textarea
                className="textarea min-h-[88px]"
                id="numeric_tables_ai_focus"
                name="numeric_tables_ai_focus"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="例如：根据最新章节更新金币与装备数量；不要捏造"
                aria-label="AI 更新重点 (numeric_tables_ai_focus)"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => void scheduleAiUpdate()}
              disabled={scheduling || !selectedTableId}
              aria-label="创建 AI 更新任务 (numeric_tables_ai_schedule)"
              type="button"
            >
              {scheduling ? "创建中..." : `创建资料更新任务${selectedTable ? `：${selectedTable.name}` : ""}`}
            </button>

            {lastTaskId ? (
              <>
                <Link
                  className="btn btn-secondary"
                  to={`${buildStudioSystemPath(pid, "tasks")}?project_task_id=${encodeURIComponent(lastTaskId)}`}
                >
                  打开任务中心（定位本次任务）
                </Link>
                <button
                  className="btn btn-secondary"
                  onClick={() => void copyText(lastTaskId, { title: "复制失败：请手动复制任务 ID（task_id）" })}
                  type="button"
                >
                  复制任务 ID
                </button>
              </>
            ) : null}
          </div>
        </div>
      </FeedbackDisclosure>

      <TablesPanelInline projectId={pid} />
    </ToolContent>
  );
}
