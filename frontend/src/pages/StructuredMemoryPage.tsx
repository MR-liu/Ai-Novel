import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { DebugDetails, DebugPageShell } from "../components/atelier/DebugPageShell";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { Badge } from "../components/ui/Badge";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState, FeedbackStateCard } from "../components/ui/Feedback";
import { Drawer } from "../components/ui/Drawer";
import { RequestIdBadge } from "../components/ui/RequestIdBadge";
import { useToast } from "../components/ui/toast";
import { MemoryUpdateDrawer } from "../components/writing/MemoryUpdateDrawer";
import { useProjectData } from "../hooks/useProjectData";
import {
  buildProjectReviewPath,
  buildProjectWritePath,
  buildStoryBiblePath,
  buildStudioSystemPath,
} from "../lib/projectRoutes";
import { UI_COPY } from "../lib/uiCopy";
import { ApiError, apiJson } from "../services/apiClient";
import { CharacterRelationsView } from "./structuredMemory/CharacterRelationsView";
import { SYSTEM_WORKBENCH_COPY } from "./systemWorkbenchModels";

type TableName = "entities" | "relations" | "events" | "foreshadows" | "evidence";
type ViewMode = "table" | "character_relations";

type Counts = Record<TableName, number>;

type EntityRow = {
  id: string;
  entity_type: string;
  name: string;
  summary_md?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
};

type RelationRow = {
  id: string;
  relation_type: string;
  from_entity_id: string;
  to_entity_id: string;
  description_md?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
};

type EventRow = {
  id: string;
  chapter_id?: string | null;
  event_type: string;
  title?: string | null;
  content_md?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
};

type ForeshadowRow = {
  id: string;
  chapter_id?: string | null;
  resolved_at_chapter_id?: string | null;
  title?: string | null;
  content_md?: string | null;
  resolved: number;
  deleted_at?: string | null;
  updated_at?: string | null;
};

type EvidenceRow = {
  id: string;
  source_type: string;
  source_id?: string | null;
  quote_md?: string | null;
  deleted_at?: string | null;
  created_at?: string | null;
};

type StructuredMemoryResponse = {
  counts: Counts;
  cursor: Partial<Record<TableName, string | null>>;
  entities?: EntityRow[];
  relations?: RelationRow[];
  events?: EventRow[];
  foreshadows?: ForeshadowRow[];
  evidence?: EvidenceRow[];
};

type PageData = {
  table: TableName;
  q: string;
  include_deleted: boolean;
  counts: Counts;
  cursor: string | null;
  items: Array<Record<string, unknown>>;
};

const STRUCTURED_TABLE_LABELS: Record<TableName, string> = {
  entities: UI_COPY.structuredMemory.tabs.entities,
  relations: UI_COPY.structuredMemory.tabs.relations,
  events: UI_COPY.structuredMemory.tabs.events,
  foreshadows: UI_COPY.structuredMemory.tabs.foreshadows,
  evidence: UI_COPY.structuredMemory.tabs.evidence,
};

const STRUCTURED_TABLE_DESCRIPTIONS: Record<TableName, string> = {
  entities: "查看人物、地点、组织等实体名和摘要，确认故事里的关键对象是否被稳定识别。",
  relations: "核对人物与实体之间的关系链，适合追查谁和谁发生了怎样的连接。",
  events: "检查重要事件是否被抽取，并确认标题、类型与摘要有没有跑偏。",
  foreshadows: "集中查看伏笔是否仍未解决，以及哪些伏笔已经被系统标记为完成。",
  evidence: "回看底层证据片段，确认记忆底座引用的原文是否准确、是否需要回修。",
};

function tableLabel(t: TableName): string {
  return STRUCTURED_TABLE_LABELS[t] ?? t;
}

function safeSnippet(text: string | null | undefined, max = 80): string {
  const s = String(text || "")
    .replaceAll("\n", " ")
    .trim();
  if (!s) return "-";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toCountMap(value: unknown): Counts {
  const base: Counts = { entities: 0, relations: 0, events: 0, foreshadows: 0, evidence: 0 };
  if (!value || typeof value !== "object") return base;
  const o = value as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      base[key as TableName] = v;
    }
  }
  return base;
}

function toRowItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") as Array<
    Record<string, unknown>
  >;
}

function readStringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return String(value);
}

function readTextField(row: Record<string, unknown>, key: string): string | null | undefined {
  const value = row[key];
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return value;
  return String(value);
}

function readBoolField(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

export function StructuredMemoryPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const chapterId = searchParams.get("chapterId") || undefined;
  const initialView: ViewMode = searchParams.get("view") === "character-relations" ? "character_relations" : "table";
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const focusRelationId = String(searchParams.get("relationId") || "").trim() || null;

  const [activeTable, setActiveTable] = useState<TableName>("entities");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  const [memoryUpdateOpen, setMemoryUpdateOpen] = useState(false);
  const [bulkOpsOpen, setBulkOpsOpen] = useState(false);

  const loader = useCallback(
    async (id: string): Promise<PageData> => {
      const params = new URLSearchParams();
      params.set("table", activeTable);
      if (includeDeleted) params.set("include_deleted", "true");
      if (queryText.trim()) params.set("q", queryText.trim());
      params.set("limit", "50");

      try {
        const res = await apiJson<StructuredMemoryResponse>(
          `/api/projects/${id}/memory/structured?${params.toString()}`,
        );
        setRequestId(res.request_id ?? null);
        const data = res.data as unknown as StructuredMemoryResponse;
        const counts = toCountMap(data.counts);
        const cursor = (data.cursor?.[activeTable] ?? null) as string | null;
        const items = toRowItems(data[activeTable]);

        return { table: activeTable, q: queryText.trim(), include_deleted: includeDeleted, counts, cursor, items };
      } catch (e) {
        if (e instanceof ApiError) setRequestId(e.requestId ?? null);
        throw e;
      }
    },
    [activeTable, includeDeleted, queryText],
  );

  const pageQuery = useProjectData(projectId, loader);
  const refresh = pageQuery.refresh;

  useEffect(() => {
    if (!projectId) return;
    void refresh();
  }, [activeTable, includeDeleted, projectId, queryText, refresh]);

  const counts = useMemo(
    () => pageQuery.data?.counts ?? { entities: 0, relations: 0, events: 0, foreshadows: 0, evidence: 0 },
    [pageQuery.data?.counts],
  );
  const cursor = pageQuery.data?.cursor ?? null;
  const items = useMemo(() => pageQuery.data?.items ?? [], [pageQuery.data?.items]);
  const activeScopeTitle = viewMode === "table" ? tableLabel(activeTable) : "人物关系";
  const activeScopeDescription =
    viewMode === "table"
      ? STRUCTURED_TABLE_DESCRIPTIONS[activeTable]
      : "只查看 character 实体之间的关系，适合手工修正人物连线、补证据或回滚最近一次关系改动。";
  const activeScopeMeta =
    viewMode === "table" ? `${counts[activeTable] ?? 0} 条记录` : `${counts.relations ?? 0} 条关系`;
  const visibleRecordCount = viewMode === "table" ? counts[activeTable] ?? 0 : counts.relations ?? 0;
  const totalRecordCount =
    counts.entities + counts.relations + counts.events + counts.foreshadows + counts.evidence;
  const querySummary = queryText.trim() || "尚未缩小具体治理范围";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const nextActionText =
    viewMode === "character_relations"
      ? "先核对人物关系和证据，再决定是否进入人物关系编辑或回写连续性。"
      : selectedIds.length > 0
        ? "已选中记录，下一步更适合生成批量操作指令或打开连续性更新。"
        : queryText.trim()
          ? "先确认筛出的记录是不是这次要整理的范围，再决定是否做批量操作。"
          : "先选中正确表，再用关键词把治理范围缩小到足够安全。";

  const loadMore = useCallback(async () => {
    if (!projectId) return;
    if (!cursor) return;
    const params = new URLSearchParams();
    params.set("table", activeTable);
    if (includeDeleted) params.set("include_deleted", "true");
    if (queryText.trim()) params.set("q", queryText.trim());
    params.set("before", cursor);
    params.set("limit", "50");

    try {
      const res = await apiJson<StructuredMemoryResponse>(
        `/api/projects/${projectId}/memory/structured?${params.toString()}`,
      );
      setRequestId(res.request_id ?? null);
      const data = res.data as unknown as StructuredMemoryResponse;
      const nextItems = toRowItems(data[activeTable]);
      const nextCursor = (data.cursor?.[activeTable] ?? null) as string | null;
      pageQuery.setData((prev) => {
        const prevCounts = prev?.counts ?? counts;
        return {
          table: activeTable,
          q: queryText.trim(),
          include_deleted: includeDeleted,
          counts: toCountMap(data.counts) ?? prevCounts,
          cursor: nextCursor,
          items: [...(prev?.items ?? []), ...nextItems],
        };
      });
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setRequestId(err.requestId ?? null);
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    }
  }, [activeTable, counts, cursor, includeDeleted, pageQuery, projectId, queryText, toast]);

  const generatedDeleteOpsJson = useMemo(() => {
    if (selectedIds.length === 0) return "";
    const ops = selectedIds.map((id) => ({ op: "delete", target_table: activeTable, target_id: id }));
    return safeJsonStringify(ops);
  }, [activeTable, selectedIds]);

  const generatedResolvedOpsJson = useMemo(() => {
    if (activeTable !== "foreshadows" || selectedIds.length === 0) return "";
    const ops = selectedIds.map((id) => ({
      op: "upsert",
      target_table: "foreshadows",
      target_id: id,
      after: { resolved: 1 },
    }));
    return safeJsonStringify(ops);
  }, [activeTable, selectedIds]);

  const copyText = useCallback(
    async (text: string, label: string) => {
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        toast.toastSuccess(`已复制 ${label}`);
      } catch {
        toast.toastWarning(`复制失败，请手动复制下方底层指令（JSON）（${label}）`);
      }
    },
    [toast],
  );

  const toggleSelected = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      const next = Array.from(set);
      if (next.length === 0) setBulkOpsOpen(false);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const ids = items.map((row) => readStringField(row, "id")).filter(Boolean);
    setSelectedIds(ids);
  }, [items]);

  const clearSelected = useCallback(() => {
    setBulkOpsOpen(false);
    setSelectedIds([]);
  }, []);

  const applySearch = useCallback(() => {
    setBulkOpsOpen(false);
    setSelectedIds([]);
    setQueryText(searchText.trim());
  }, [searchText]);

  if (!projectId)
    return (
      <FeedbackStateCard
        tone="danger"
        kicker="连续性底座"
        title="当前无法打开连续性底座"
        description="缺少项目上下文，请从具体项目进入后再查看实体、关系、事件、伏笔和证据记录。"
      />
    );

  return (
    <DebugPageShell
      eyebrow="系统与任务"
      title="连续性底座"
      description="把实体、关系、事件、伏笔和证据收进一层连续性记录面板，帮助你核对故事结构到底写进了什么。"
      whenToUse="排查连续性更新、图谱抽取或记忆注入为什么不对，或者要批量整理连续性记录时。"
      outcome="你会看到每类连续性记录的数量、内容和操作入口，并能继续进入人物关系编辑。"
      risk="这里面向高级整理和排障，批量操作会影响连续性记录，应用前最好先确认范围。"
      actions={
        <>
          <button className="btn btn-secondary" onClick={() => void pageQuery.refresh()} type="button">
            刷新
          </button>
          {selectedIds.length > 0 ? (
            <button className="btn btn-secondary" onClick={() => setBulkOpsOpen(true)} type="button">
              批量操作 ({selectedIds.length})
            </button>
          ) : null}
          <button
            className="btn btn-secondary"
            disabled={!chapterId}
            title={chapterId ? undefined : "建议从写作页带上当前章节再打开，后续应用会更顺"}
            onClick={() => setMemoryUpdateOpen(true)}
            type="button"
          >
            连续性更新
          </button>
        </>
      }
    >
      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{nextActionText}</div>
          <div className="text-xs text-subtext">
            建议顺序：先决定视图和表范围，再筛选记录，最后才做批量整理或连续性更新。
          </div>
        </div>
        <div className="manuscript-status-list">
          <span className="manuscript-chip">当前视图：{viewMode === "table" ? "数据表" : "人物关系"}</span>
          <span className="manuscript-chip">当前范围：{activeScopeTitle}</span>
          <span className="manuscript-chip">范围内记录：{visibleRecordCount}</span>
          <span className="manuscript-chip">底座总记录：{totalRecordCount}</span>
          <span className="manuscript-chip">已选条目：{selectedIds.length}</span>
          <span className="manuscript-chip">{includeDeleted ? "包含已删除记录" : "仅看有效记录"}</span>
          <span className="manuscript-chip max-w-[260px] truncate" title={querySummary}>
            当前筛选：{querySummary}
          </span>
        </div>
      </section>

      <ResearchWorkbenchPanel eyebrow="当前系统路径" {...SYSTEM_WORKBENCH_COPY["structured-memory"]} variant="compact" />

      <section className="research-guide-panel">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">治理范围与工作视图</div>
            <div className="studio-cluster-copy">
              先决定你是在看连续性记录，还是直接整理人物关系；再决定是否包含已删除记录和要看的具体表。
            </div>
          </div>
          <div className="studio-cluster-meta">{viewMode === "table" ? "数据清单模式" : "人物关系模式"}</div>
        </div>

        {projectId ? (
          <FeedbackCallout className="mt-4 text-sm" title="使用提醒">
            本页是图谱底座数据（实体/关系/事件/伏笔/证据）。金钱/时间/等级/资源等数值状态请到{" "}
            <Link className="underline" to={buildStoryBiblePath(projectId, "tables")}>
              {UI_COPY.nav.numericTables}
            </Link>
            。
          </FeedbackCallout>
        ) : null}

        <div className="studio-overview-grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="studio-overview-card is-emphasis">
            <div className="studio-overview-label">工作视图</div>
            <div className="studio-overview-value">先选治理方式</div>
            <div className="studio-overview-copy">数据表适合看连续性记录，人物关系适合直接精修角色连线。先选对模式，再开始筛选和批量整理。</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                className={`btn ${viewMode === "table" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => {
                  setBulkOpsOpen(false);
                  setSelectedIds([]);
                  setViewMode("table");
                }}
                aria-label="structured_view_table"
                type="button"
              >
                数据表
              </button>
              <button
                className={`btn ${viewMode === "character_relations" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => {
                  setBulkOpsOpen(false);
                  setSelectedIds([]);
                  setViewMode("character_relations");
                }}
                aria-label="structured_view_character_relations"
                type="button"
              >
                人物关系
              </button>
            </div>

            {viewMode === "table" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(["entities", "relations", "events", "foreshadows", "evidence"] as const).map((t) => (
                  <button
                    key={t}
                    className={`btn ${activeTable === t ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      setBulkOpsOpen(false);
                      setSelectedIds([]);
                      setActiveTable(t);
                    }}
                    aria-label={`${t}（${tableLabel(t)}） (structured_tab_${t})`}
                    type="button"
                  >
                    {tableLabel(t)} <span className="text-xs opacity-80">({counts[t] ?? 0})</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs leading-6 text-subtext">
                该视图只用于编辑人物关系，会过滤到 `entity_type=character` 的关系链，并支持继续补证据或回滚最近改动。
              </div>
            )}
          </div>

          <div className="studio-overview-card">
            <div className="studio-overview-label">当前范围</div>
            <div className="studio-overview-value">{activeScopeTitle}</div>
            <div className="studio-overview-copy">{activeScopeDescription}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtext">
              <span className="rounded-full border border-border px-2 py-1 text-ink">{activeScopeTitle}</span>
              <span>{activeScopeMeta}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <RequestIdBadge requestId={requestId} />
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => {
                    setBulkOpsOpen(false);
                    setSelectedIds([]);
                    setIncludeDeleted(e.target.checked);
                  }}
                  aria-label="structured_include_deleted"
                  type="checkbox"
                />
                {UI_COPY.structuredMemory.includeDeleted}
              </label>
            </div>
          </div>
        </div>

        {viewMode === "table" ? (
          <div className="mt-4 rounded-atelier border border-border bg-canvas p-3">
            <div className="studio-cluster-header">
              <div>
                <div className="text-sm text-ink">查询与选择</div>
                <div className="mt-1 text-xs leading-6 text-subtext">
                  先用关键词缩小范围，再决定要不要选择当前页记录生成批量操作指令。
                </div>
              </div>
              <div className="studio-cluster-meta">
                {selectedIds.length > 0 ? `已选 ${selectedIds.length} 条` : `${counts[activeTable] ?? 0} 条记录`}
              </div>
            </div>
            <label className="mt-4 grid gap-1">
              <span className="text-xs text-subtext">搜索（q）</span>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  aria-label="structured_search"
                  placeholder="Alice"
                />
                <button className="btn btn-secondary" onClick={applySearch} type="button">
                  搜索
                </button>
              </div>
            </label>

            {selectedIds.length > 0 ? (
              <div className="mt-3 text-xs text-subtext">
                已选择 <span className="text-ink">{selectedIds.length}</span> 条（{tableLabel(activeTable)}
                ）。可点击右上角“批量操作”生成指令，并继续进入连续性更新。
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {viewMode === "table" ? (
        <>
          <section className="panel p-4">
            <div className="studio-cluster-header">
              <div>
                <div className="studio-cluster-title">连续性记录</div>
                <div className="studio-cluster-copy">
                  浏览当前表里的连续性记录，先看摘要和状态，再决定是否需要批量整理或回到写作链路重新生成。
                </div>
              </div>
              <div className="studio-cluster-meta">{cursor ? "可继续加载更多" : "当前已到末尾"}</div>
            </div>

            <div className="mt-4 rounded-atelier border border-border bg-canvas p-3">
              {pageQuery.loading ? <div className="text-sm text-subtext">加载中...</div> : null}
              {!pageQuery.loading && items.length === 0 ? (
                <FeedbackEmptyState
                  variant="compact"
                  title="当前范围下还没有记录"
                  description="可以换一个表、调整筛选词，或切到人物关系模式继续排查连续性底座。"
                />
              ) : null}

              {items.length > 0 ? (
                <div className="mt-2 overflow-auto rounded-atelier border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-surface text-xs text-subtext">
                      <tr>
                        <th className="w-10 p-2">
                          <button
                            className="btn btn-secondary btn-icon"
                            onClick={selectAll}
                            type="button"
                            aria-label="structured_select_all"
                          >
                            ✓
                          </button>
                        </th>
                        <th className="p-2">主字段</th>
                        <th className="p-2">摘要</th>
                        <th className="p-2">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => {
                        const id = readStringField(row, "id");
                        const deletedAt = readStringField(row, "deleted_at");
                        const checked = selectedSet.has(id);

                        let primary = id;
                        let summary = "-";
                        if (activeTable === "entities") {
                          primary = `${readStringField(row, "entity_type")}:${readStringField(row, "name")}`;
                          summary = safeSnippet(readTextField(row, "summary_md"));
                        } else if (activeTable === "relations") {
                          primary = `${readStringField(row, "relation_type")}:${readStringField(row, "from_entity_id")}→${readStringField(row, "to_entity_id")}`;
                          summary = safeSnippet(readTextField(row, "description_md"));
                        } else if (activeTable === "events") {
                          primary = `${readStringField(row, "event_type")}:${readStringField(row, "title") || id}`;
                          summary = safeSnippet(readTextField(row, "content_md"));
                        } else if (activeTable === "foreshadows") {
                          primary = `${readBoolField(row, "resolved") ? "已解决" : "未解决"}:${readStringField(row, "title") || id}`;
                          summary = safeSnippet(readTextField(row, "content_md"));
                        } else if (activeTable === "evidence") {
                          primary = `${readStringField(row, "source_type")}:${readStringField(row, "source_id") || "-"}`;
                          summary = safeSnippet(readTextField(row, "quote_md"));
                        }

                        return (
                          <tr key={id} className="border-t border-border">
                            <td className="p-2">
                              <input
                                className="checkbox"
                                aria-label={`structured_select_${id}`}
                                checked={checked}
                                onChange={(e) => toggleSelected(id, e.target.checked)}
                                type="checkbox"
                              />
                            </td>
                            <td className="p-2">
                              <div className="truncate text-ink">{primary}</div>
                              <div className="mt-1 truncate text-[11px] text-subtext">{id}</div>
                            </td>
                            <td className="p-2">
                              <div className="max-w-[520px] truncate text-subtext">{summary}</div>
                            </td>
                            <td className="p-2">
                              {deletedAt ? (
                                <Badge tone="danger">已删除</Badge>
                              ) : (
                                <Badge tone="success">正常</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {cursor ? (
                <div className="mt-3 flex justify-center">
                  <button className="btn btn-secondary" onClick={() => void loadMore()} type="button">
                    加载更多
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <div className="studio-cluster">
            <div className="studio-cluster-header">
              <div>
                <div className="studio-cluster-title">批量整理与使用说明</div>
                <div className="studio-cluster-copy">
                  只有在你明确知道要删除、标记解决或手工修补连续性记录时，再展开高级说明和批量操作。
                </div>
              </div>
            </div>

            <DebugDetails title={UI_COPY.help.title}>
              <div className="grid gap-2 text-xs text-subtext">
                <div>{UI_COPY.structuredMemory.usageHint}</div>
                <div>{UI_COPY.structuredMemory.exampleHint}</div>
                {projectId ? (
                  <div>
                    常用入口：从{" "}
                    <Link className="underline" to={buildProjectWritePath(projectId)}>
                      写作页
                    </Link>{" "}
                    或{" "}
                    <Link className="underline" to={buildProjectReviewPath(projectId, "analysis")}>
                      章节分析
                    </Link>{" "}
                    触发“连续性更新”，再在{" "}
                    <Link className="underline" to={buildStudioSystemPath(projectId, "tasks")}>
                      任务中心
                    </Link>{" "}
                    追踪变更集和任务状态。
                  </div>
                ) : null}
                <div>{UI_COPY.structuredMemory.bulkOpsHint}</div>
                <div className="text-amber-700 dark:text-amber-300">{UI_COPY.structuredMemory.bulkOpsRisk}</div>
              </div>
            </DebugDetails>
          </div>

          <Drawer
            open={bulkOpsOpen}
            onClose={() => setBulkOpsOpen(false)}
            ariaLabelledBy="structured_bulk_ops_title"
            panelClassName="h-full w-full max-w-[860px] overflow-hidden border-l border-border bg-surface shadow-sm"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink" id="structured_bulk_ops_title">
                    批量操作
                  </div>
                  <div className="mt-0.5 truncate text-xs text-subtext">
                    已选择 {selectedIds.length} 条（{tableLabel(activeTable)}）
                  </div>
                </div>
                <button
                  className="btn btn-secondary"
                  aria-label="关闭"
                  onClick={() => setBulkOpsOpen(false)}
                  type="button"
                >
                  关闭
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {selectedIds.length === 0 ? (
                  <FeedbackEmptyState
                    variant="compact"
                    title="还没有选中任何条目"
                    description="先在左侧记录表里勾选要整理的对象，再回来生成删除或标记已解决的操作指令。"
                  />
                ) : (
                  <div className="grid gap-3">
                    <div className="rounded-atelier border border-border bg-surface p-3">
                      <div className="text-xs text-subtext">1）选择条目</div>
                      <div className="mt-1 text-sm text-ink">
                        已选择 {selectedIds.length} 条（{tableLabel(activeTable)}）
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button className="btn btn-secondary" onClick={selectAll} type="button">
                          全选当前页
                        </button>
                        <button className="btn btn-secondary" onClick={clearSelected} type="button">
                          清空选择
                        </button>
                      </div>
                    </div>

                    <div className="rounded-atelier border border-border bg-surface p-3">
                      <div className="text-xs text-subtext">2）生成指令</div>
                      <div className="mt-1 text-xs text-subtext">删除指令：{selectedIds.length} 条</div>
                      {activeTable === "foreshadows" ? (
                        <div className="mt-1 text-xs text-subtext">标记已解决指令：{selectedIds.length} 条（可选）</div>
                      ) : null}
                    </div>

                    <div className="rounded-atelier border border-border bg-surface p-3">
                      <div className="text-xs text-subtext">3）复制并打开连续性更新</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="btn btn-secondary"
                          onClick={() => void copyText(generatedDeleteOpsJson, "删除指令")}
                          type="button"
                        >
                          {UI_COPY.structuredMemory.copyDeleteOps}
                        </button>
                        {activeTable === "foreshadows" ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => void copyText(generatedResolvedOpsJson, "标记已解决指令")}
                            type="button"
                          >
                            {UI_COPY.structuredMemory.copyResolvedOps}
                          </button>
                        ) : null}
                        <button
                          className="btn btn-secondary"
                          disabled={!chapterId}
                          title={chapterId ? undefined : "建议从写作页带上当前章节再打开，后续应用会更顺"}
                          onClick={() => {
                            setBulkOpsOpen(false);
                            setMemoryUpdateOpen(true);
                          }}
                          type="button"
                        >
                          打开连续性更新
                        </button>
                      </div>

                      <FeedbackDisclosure
                        className="mt-3 rounded-atelier border border-border bg-canvas px-3 py-2"
                        summaryClassName="text-xs text-ink"
                        bodyClassName="pt-3"
                        title="查看底层指令（高级）"
                      >
                        <div className="mt-3 grid gap-2">
                          <div className="text-xs text-subtext">{UI_COPY.structuredMemory.deleteOpsLabel}</div>
                          <textarea
                            className="textarea font-mono text-xs"
                            readOnly
                            rows={Math.min(10, Math.max(3, selectedIds.length + 1))}
                            value={generatedDeleteOpsJson}
                          />
                          {activeTable === "foreshadows" ? (
                            <>
                              <div className="text-xs text-subtext">{UI_COPY.structuredMemory.resolvedOpsLabel}</div>
                              <textarea
                                className="textarea font-mono text-xs"
                                readOnly
                                rows={Math.min(10, Math.max(3, selectedIds.length + 1))}
                                value={generatedResolvedOpsJson}
                              />
                            </>
                          ) : null}
                        </div>
                      </FeedbackDisclosure>

                      <FeedbackCallout className="mt-3 text-xs" tone="warning" title="批量治理前确认范围">
                        <div>{UI_COPY.structuredMemory.bulkOpsHint}</div>
                        <div className="mt-1">{UI_COPY.structuredMemory.bulkOpsRisk}</div>
                      </FeedbackCallout>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Drawer>
        </>
      ) : (
        <div className="studio-cluster">
          <div className="studio-cluster-header">
            <div>
              <div className="studio-cluster-title">人物关系编辑</div>
              <div className="studio-cluster-copy">
                这里聚焦角色之间的连线、关系描述和证据，适合从图谱或写作结果回到人物关系层做精修。
              </div>
            </div>
            <div className="studio-cluster-meta">仅人物关系</div>
          </div>
          <CharacterRelationsView
            projectId={projectId}
            chapterId={chapterId}
            focusRelationId={focusRelationId}
            includeDeleted={includeDeleted}
            onRequestId={setRequestId}
          />
        </div>
      )}

      <MemoryUpdateDrawer
        open={memoryUpdateOpen}
        onClose={() => setMemoryUpdateOpen(false)}
        projectId={projectId}
        chapterId={chapterId}
      />
    </DebugPageShell>
  );
}
