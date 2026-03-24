import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "../../components/ui/Badge";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/toast";
import { buildProjectWritePath, buildStudioResearchPath, buildStudioSystemPath } from "../../lib/projectRoutes";
import { ApiError, apiJson } from "../../services/apiClient";

type EntityRow = {
  id: string;
  entity_type: string;
  name: string;
  deleted_at?: string | null;
};

type RelationRow = {
  id: string;
  relation_type: string;
  from_entity_id: string;
  to_entity_id: string;
  description_md?: string | null;
  deleted_at?: string | null;
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
  entities?: EntityRow[];
  relations?: RelationRow[];
  evidence?: EvidenceRow[];
};

type MemoryUpdateProposeResponse = {
  idempotent: boolean;
  change_set?: { id: string; request_id?: string | null };
  items?: unknown[];
};

type MemoryUpdateApplyResponse = {
  idempotent: boolean;
  change_set?: { id: string };
  warnings?: Array<{ code?: string; message?: string; item_id?: string }>;
};

const RECOMMENDED_RELATION_TYPES = [
  "related_to",
  "family",
  "romance",
  "friend",
  "ally",
  "enemy",
  "mentor",
  "student",
  "leader_of",
  "member_of",
  "owes",
  "betrayed",
  "protects",
] as const;

function safeRandomUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // ignore
  }

  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function summarizeEvidenceSources(evidence: EvidenceRow[]): string {
  if (!evidence.length) return "暂无";
  const counts = new Map<string, number>();
  for (const item of evidence) {
    const key = String(item.source_type || "unknown");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, value]) => `${key}:${value}`)
    .join(" | ");
}

function compactQuotePreview(text: string | null | undefined, limit = 72): string {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

export function CharacterRelationsView(props: {
  projectId: string;
  chapterId?: string;
  focusRelationId?: string | null;
  includeDeleted: boolean;
  onRequestId: (value: string | null) => void;
}) {
  const { projectId, chapterId, focusRelationId, includeDeleted, onRequestId } = props;
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [lastChangeSetId, setLastChangeSetId] = useState<string>("");

  const [characters, setCharacters] = useState<EntityRow[]>([]);
  const [relations, setRelations] = useState<RelationRow[]>([]);

  const [evidenceOpen, setEvidenceOpen] = useState<Record<string, boolean>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<Record<string, boolean>>({});
  const [evidenceByRelationId, setEvidenceByRelationId] = useState<Record<string, EvidenceRow[]>>({});

  const characterIdToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of characters) map.set(String(c.id), String(c.name || ""));
    return map;
  }, [characters]);
  const activeRelationCount = useMemo(
    () => relations.filter((relation) => !relation.deleted_at).length,
    [relations],
  );
  const deletedRelationCount = useMemo(
    () => relations.filter((relation) => Boolean(relation.deleted_at)).length,
    [relations],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entityParams = new URLSearchParams();
      entityParams.set("table", "entities");
      entityParams.set("q", "character");
      entityParams.set("limit", "200");
      if (includeDeleted) entityParams.set("include_deleted", "true");

      const relationParams = new URLSearchParams();
      relationParams.set("table", "relations");
      relationParams.set("limit", "200");
      if (includeDeleted) relationParams.set("include_deleted", "true");

      const [entitiesRes, relationsRes] = await Promise.all([
        apiJson<StructuredMemoryResponse>(`/api/projects/${projectId}/memory/structured?${entityParams.toString()}`),
        apiJson<StructuredMemoryResponse>(`/api/projects/${projectId}/memory/structured?${relationParams.toString()}`),
      ]);
      onRequestId(relationsRes.request_id ?? entitiesRes.request_id ?? null);

      const rawEntities = (entitiesRes.data?.entities ?? []) as EntityRow[];
      const activeChars = rawEntities
        .filter((e) => (e.entity_type || "").trim() === "character" && (includeDeleted || !e.deleted_at))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN"));
      setCharacters(activeChars);

      const charIdSet = new Set(activeChars.map((e) => String(e.id)));
      const charIdToName = new Map(activeChars.map((e) => [String(e.id), String(e.name || "")] as const));

      const rawRelations = (relationsRes.data?.relations ?? []) as RelationRow[];
      const filteredRelations = rawRelations
        .filter((r) => {
          if (!includeDeleted && r.deleted_at) return false;
          return charIdSet.has(String(r.from_entity_id)) && charIdSet.has(String(r.to_entity_id));
        })
        .sort((a, b) => {
          const aKey = `${charIdToName.get(String(a.from_entity_id)) || ""}|${a.relation_type || ""}|${charIdToName.get(String(a.to_entity_id)) || ""}|${a.id}`;
          const bKey = `${charIdToName.get(String(b.from_entity_id)) || ""}|${b.relation_type || ""}|${charIdToName.get(String(b.to_entity_id)) || ""}|${b.id}`;
          return aKey.localeCompare(bKey, "zh-Hans-CN");
        });
      setRelations(filteredRelations);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      onRequestId(err.requestId ?? null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, onRequestId, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [createFromId, setCreateFromId] = useState("");
  const [createToId, setCreateToId] = useState("");
  const [createType, setCreateType] = useState<string>("related_to");
  const [createDesc, setCreateDesc] = useState("");

  useEffect(() => {
    if (!characters.length) return;
    setCreateFromId((prev) => prev || String(characters[0].id));
    setCreateToId((prev) => prev || String(characters[Math.min(1, characters.length - 1)].id));
  }, [characters]);

  const runChangeSet = useCallback(
    async (opts: { title: string; ops: unknown[] }) => {
      if (!chapterId) {
        toast.toastWarning("当前缺少章节上下文。请从写作页进入当前章节后，再回来写入关系变更。");
        return;
      }
      setSaving(true);
      try {
        const proposeRes = await apiJson<MemoryUpdateProposeResponse>(`/api/chapters/${chapterId}/memory/propose`, {
          method: "POST",
          body: JSON.stringify({
            schema_version: "memory_update_v1",
            idempotency_key: `ui-graph-${safeRandomUUID().slice(0, 12)}`,
            title: opts.title,
            ops: opts.ops,
          }),
        });
        onRequestId(proposeRes.request_id ?? null);
        const changeSetId = proposeRes.data?.change_set?.id;
        if (!changeSetId) throw new Error("change_set_id missing");

        const applyRes = await apiJson<MemoryUpdateApplyResponse>(`/api/memory_change_sets/${changeSetId}/apply`, {
          method: "POST",
        });
        onRequestId(applyRes.request_id ?? null);

        const warnings = applyRes.data?.warnings ?? [];
        if (warnings.length) toast.toastWarning(`已应用，但还有 ${warnings.length} 条提醒`, applyRes.request_id);
        else toast.toastSuccess("已应用关系变更", applyRes.request_id);

        setLastChangeSetId(String(changeSetId));
        setEvidenceByRelationId({});
        setEvidenceOpen({});
        await refresh();
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        onRequestId(err.requestId ?? null);
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setSaving(false);
      }
    },
    [chapterId, onRequestId, refresh, toast],
  );

  const rollbackLastChangeSet = useCallback(async () => {
    const id = lastChangeSetId.trim();
    if (!id) return;
    setRollingBack(true);
    try {
      const res = await apiJson<{ idempotent?: boolean; change_set?: { id: string } }>(
        `/api/memory_change_sets/${encodeURIComponent(id)}/rollback`,
        { method: "POST" },
      );
      onRequestId(res.request_id ?? null);
      toast.toastSuccess("已回滚最近变更集", res.request_id);
      setEvidenceByRelationId({});
      setEvidenceOpen({});
      setEditingId(null);
      await refresh();
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      onRequestId(err.requestId ?? null);
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setRollingBack(false);
    }
  }, [lastChangeSetId, onRequestId, refresh, toast]);

  const createRelation = useCallback(async () => {
    const fromId = createFromId.trim();
    const toId = createToId.trim();
    if (!fromId || !toId) {
      toast.toastWarning("请先选定关系两端的人物");
      return;
    }
    const relType = (createType || "related_to").trim() || "related_to";
    const relId = safeRandomUUID();
    await runChangeSet({
      title: "UI: 维护人物关系（relations upsert）",
      ops: [
        {
          op: "upsert",
          target_table: "relations",
          target_id: relId,
          after: {
            from_entity_id: fromId,
            to_entity_id: toId,
            relation_type: relType,
            description_md: createDesc.trim() || null,
          },
        },
      ],
    });
    setCreateDesc("");
  }, [createDesc, createFromId, createToId, createType, runChangeSet, toast]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => relations.find((r) => String(r.id) === String(editingId)) ?? null,
    [editingId, relations],
  );
  const [editFromId, setEditFromId] = useState("");
  const [editToId, setEditToId] = useState("");
  const [editType, setEditType] = useState("");
  const [editDesc, setEditDesc] = useState("");

  useEffect(() => {
    if (!editing) return;
    setEditFromId(String(editing.from_entity_id));
    setEditToId(String(editing.to_entity_id));
    setEditType(String(editing.relation_type || "related_to"));
    setEditDesc(String(editing.description_md || ""));
  }, [editing]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const relId = String(editing.id);
    const relType = (editType || "related_to").trim() || "related_to";
    await runChangeSet({
      title: "UI: 编辑人物关系（relations upsert）",
      ops: [
        {
          op: "upsert",
          target_table: "relations",
          target_id: relId,
          after: {
            from_entity_id: editFromId.trim(),
            to_entity_id: editToId.trim(),
            relation_type: relType,
            description_md: editDesc.trim() || null,
          },
        },
      ],
    });
    setEditingId(null);
  }, [editDesc, editFromId, editToId, editType, editing, runChangeSet]);

  const deleteRelation = useCallback(
    async (relId: string) => {
      if (!relId) return;
      await runChangeSet({
        title: "UI: 删除人物关系（relations delete）",
        ops: [{ op: "delete", target_table: "relations", target_id: String(relId) }],
      });
      if (String(editingId) === String(relId)) setEditingId(null);
    },
    [editingId, runChangeSet],
  );

  const toggleEvidence = useCallback(
    async (relId: string) => {
      const nextOpen = !evidenceOpen[relId];
      setEvidenceOpen((prev) => ({ ...prev, [relId]: nextOpen }));
      if (!nextOpen) return;
      if (evidenceByRelationId[relId]) return;

      setEvidenceLoading((prev) => ({ ...prev, [relId]: true }));
      try {
        const params = new URLSearchParams();
        params.set("table", "evidence");
        params.set("q", relId);
        params.set("limit", "80");
        if (includeDeleted) params.set("include_deleted", "true");
        const res = await apiJson<StructuredMemoryResponse>(
          `/api/projects/${projectId}/memory/structured?${params.toString()}`,
        );
        onRequestId(res.request_id ?? null);
        const evs = ((res.data?.evidence ?? []) as EvidenceRow[]).filter(
          (ev) => String(ev.source_id || "") === String(relId) && (includeDeleted || !ev.deleted_at),
        );
        setEvidenceByRelationId((prev) => ({ ...prev, [relId]: evs }));
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        onRequestId(err.requestId ?? null);
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setEvidenceLoading((prev) => ({ ...prev, [relId]: false }));
      }
    },
    [evidenceByRelationId, evidenceOpen, includeDeleted, onRequestId, projectId, toast],
  );

  useEffect(() => {
    const rid = String(focusRelationId || "").trim();
    if (!rid) return;
    if (!relations.some((r) => String(r.id) === rid)) return;
    setEditingId(rid);
    if (!evidenceOpen[rid]) void toggleEvidence(rid);
  }, [evidenceOpen, focusRelationId, relations, toggleEvidence]);

  return (
    <div className="grid gap-3">
      <section className="research-guide-panel">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">关系概览与写入状态</div>
            <div className="studio-cluster-copy">
              先确认当前人物关系数量、是否带着章节上下文打开，以及最近一次关系改动能不能继续回滚。
            </div>
          </div>
          <div className="studio-cluster-meta">{loading ? "刷新中" : `${relations.length} 条关系`}</div>
        </div>

        <div className="studio-overview-grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="studio-overview-card is-emphasis">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="studio-overview-label">当前关系范围</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void refresh()}
                  disabled={loading}
                  type="button"
                >
                  {loading ? "刷新..." : "刷新"}
                </button>
                <Link
                  className="btn btn-secondary btn-sm"
                  to={buildStudioResearchPath(projectId, "graph")}
                  aria-label="structured_character_relations_open_graph"
                >
                  去图谱页
                </Link>
              </div>
            </div>
            <div className="studio-overview-value">人物 {characters.length} · 有效关系 {activeRelationCount}</div>
            <div className="studio-overview-copy">
              这里只展示人物与人物之间的关系，适合把图谱命中结果落到人物关系层，再继续补证据、回滚或微调。
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtext">
              <span className="rounded-full border border-border px-2 py-1 text-ink">人物 {characters.length}</span>
              <span className="rounded-full border border-border px-2 py-1 text-ink">有效关系 {activeRelationCount}</span>
              {includeDeleted ? (
                <span className="rounded-full border border-border px-2 py-1 text-ink">含已删除 {deletedRelationCount}</span>
              ) : null}
            </div>
          </div>

          <div className="studio-overview-card">
            <div className="studio-overview-label">写入与回滚</div>
            <div className="studio-overview-value">{chapterId ? "当前可直接写入关系变更" : "当前缺少章节上下文"}</div>
            {!chapterId ? (
              <FeedbackCallout className="mt-2 text-xs" tone="warning" title="当前缺少章节上下文">
                当前没有绑定章节，所以创建、编辑、删除都会被禁用。建议从{" "}
                <Link className="underline" to={buildProjectWritePath(projectId)}>
                  写作页
                </Link>{" "}
                进入当前章节后再返回这里。
              </FeedbackCallout>
            ) : (
              <FeedbackCallout className="mt-2 text-xs" title="当前可以直接写入关系变更">
                当前已绑定章节，可以直接把人物关系修改写入连续性更新变更集。
              </FeedbackCallout>
            )}
            {lastChangeSetId ? (
              <div className="mt-3 rounded-atelier border border-border bg-surface p-3 text-xs">
                <div className="text-subtext">
                  最近变更集：<span className="font-mono text-ink">{lastChangeSetId}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link className="btn btn-secondary btn-sm" to={buildStudioSystemPath(projectId, "tasks")}>
                    打开任务中心
                  </Link>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void rollbackLastChangeSet()}
                    aria-label="structured_character_relations_rollback_last"
                    disabled={saving || rollingBack}
                    type="button"
                  >
                    {rollingBack ? "回滚中..." : "回滚最近变更集"}
                  </button>
                </div>
              </div>
            ) : (
              <FeedbackEmptyState
                className="mt-3"
                variant="compact"
                title="本次会话还没有新的关系变更集"
                description="当你创建、编辑或删除人物关系后，这里会显示最近一次可回滚的变更集。"
              />
            )}
            {error ? (
              <FeedbackCallout className="mt-3 text-xs" tone="danger" title="人物关系加载失败">
                {error.message} ({error.code}) {error.requestId ? `| 定位编号: ${error.requestId}` : ""}
              </FeedbackCallout>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">新增关系</div>
            <div className="studio-cluster-copy">
              先选定人物对，再补关系类型和一句描述。推荐先写稳定的角色关系，避免把瞬时情绪写成长期关系。
            </div>
          </div>
          <div className="studio-cluster-meta">{chapterId ? "可直接写入" : "需先进入章节"}</div>
        </div>
        {characters.length === 0 ? (
          <FeedbackEmptyState
            className="mt-4 rounded-atelier border border-border bg-canvas p-3"
            title="还没有可用的人物实体"
            description="可以先回到正文、世界书或图谱抽取链路，让角色进入底层实体后再维护人物关系。"
          />
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="grid gap-1">
            <span className="text-xs text-subtext">关系起点</span>
            <select
              className="select"
              id="structured_character_relations_create_from"
              name="structured_character_relations_create_from"
              value={createFromId}
              onChange={(e) => setCreateFromId(e.target.value)}
              aria-label="structured_character_relations_create_from"
              disabled={!chapterId || saving}
            >
              <option value="">（请选择）</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-subtext">关系类型</span>
            <input
              className="input"
              value={createType}
              onChange={(e) => setCreateType(e.target.value)}
              aria-label="structured_character_relations_create_type"
              list="structured_relation_types"
              disabled={!chapterId || saving}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-subtext">关系终点</span>
            <select
              className="select"
              id="structured_character_relations_create_to"
              name="structured_character_relations_create_to"
              value={createToId}
              onChange={(e) => setCreateToId(e.target.value)}
              aria-label="structured_character_relations_create_to"
              disabled={!chapterId || saving}
            >
              <option value="">（请选择）</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              className="btn btn-primary w-full"
              onClick={() => void createRelation()}
              aria-label="structured_character_relations_create_submit"
              disabled={!chapterId || saving}
              type="button"
            >
              {saving ? "写入中..." : "新增关系"}
            </button>
          </div>
        </div>
        <datalist id="structured_relation_types">
          {RECOMMENDED_RELATION_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <label className="mt-3 grid gap-1">
          <span className="text-xs text-subtext">补充描述（可选）</span>
          <textarea
            className="textarea"
            rows={2}
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            aria-label="structured_character_relations_create_desc"
            disabled={!chapterId || saving}
          />
        </label>
      </section>

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">关系列表与证据</div>
            <div className="studio-cluster-copy">
              先浏览当前关系列表，再决定是直接编辑、删除，还是展开证据看看这条关系是否有足够依据。
            </div>
          </div>
          <div className="studio-cluster-meta">
            人物 {characters.length} · {includeDeleted ? "包含已删除关系" : "仅看有效关系"}
          </div>
        </div>
        {!relations.length && !loading ? (
          <FeedbackEmptyState
            className="mt-4 rounded-atelier border border-border bg-canvas p-3"
            title="还没有人物关系"
            description="可以先新增一条基础关系，或回到图谱页看看是否已经抽出了可用的关系线索。"
          />
        ) : null}
        <div className="mt-4 grid gap-2">
          {relations.map((r) => {
            const relId = String(r.id);
            const fromName = characterIdToName.get(String(r.from_entity_id)) || String(r.from_entity_id);
            const toName = characterIdToName.get(String(r.to_entity_id)) || String(r.to_entity_id);
            const relType = String(r.relation_type || "related_to");
            const isEditing = relId === String(editingId || "");
            const isFocused = relId === String(focusRelationId || "");
            const open = !!evidenceOpen[relId];
            const evLoading = !!evidenceLoading[relId];
            const ev = evidenceByRelationId[relId] ?? null;
            const evidenceSourceSummary = ev?.length ? summarizeEvidenceSources(ev) : "等待加载";
            const latestEvidenceAt =
              ev?.length && ev.some((item) => Boolean(item.created_at))
                ? [...ev]
                    .map((item) => item.created_at || "")
                    .filter(Boolean)
                    .sort()
                    .at(-1) ?? null
                : null;

            return (
              <div
                key={relId}
                className={
                  "rounded-atelier border bg-surface p-3 " +
                  (isFocused ? "border-accent/50 ring-1 ring-accent/20" : "border-border")
                }
                aria-label={`structured_character_relation_${relId}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
                      {fromName} --({relType})→ {toName}
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-subtext">
                        {relType}
                      </span>
                      {isFocused ? (
                        <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-ink">
                          当前聚焦
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] text-subtext">{relId}</div>
                    {r.deleted_at ? (
                      <div className="mt-1">
                        <Badge tone="warning">已删除于 {r.deleted_at}</Badge>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditingId(isEditing ? null : relId)}
                      aria-label={`structured_character_relation_edit_${relId}`}
                      disabled={!chapterId || saving}
                      type="button"
                    >
                      {isEditing ? "取消编辑" : "编辑"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void deleteRelation(relId)}
                      aria-label={`structured_character_relation_delete_${relId}`}
                      disabled={!chapterId || saving}
                      type="button"
                    >
                      删除
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void toggleEvidence(relId)}
                      aria-label={`structured_character_relation_toggle_evidence_${relId}`}
                      type="button"
                    >
                      {open ? "收起证据" : ev ? `展开证据 (${ev.length})` : "展开证据"}
                    </button>
                  </div>
                </div>

                {r.description_md ? (
                  <div className="mt-2 whitespace-pre-wrap text-sm text-subtext">{r.description_md}</div>
                ) : null}

                {isEditing ? (
                  <div className="mt-3 grid gap-3 rounded-atelier border border-border bg-canvas p-3">
                    <div className="text-xs text-subtext">编辑这条关系</div>
                    <div className="grid gap-3 lg:grid-cols-4">
                      <label className="grid gap-1">
                        <span className="text-xs text-subtext">关系起点</span>
                        <select
                          className="select"
                          id="structured_character_relations_edit_from"
                          name="structured_character_relations_edit_from"
                          value={editFromId}
                          onChange={(e) => setEditFromId(e.target.value)}
                          aria-label="structured_character_relations_edit_from"
                          disabled={!chapterId || saving}
                        >
                          <option value="">（请选择）</option>
                          {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs text-subtext">关系类型</span>
                        <input
                          className="input"
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          list="structured_relation_types"
                          aria-label="structured_character_relations_edit_type"
                          disabled={!chapterId || saving}
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs text-subtext">关系终点</span>
                        <select
                          className="select"
                          id="structured_character_relations_edit_to"
                          name="structured_character_relations_edit_to"
                          value={editToId}
                          onChange={(e) => setEditToId(e.target.value)}
                          aria-label="structured_character_relations_edit_to"
                          disabled={!chapterId || saving}
                        >
                          <option value="">（请选择）</option>
                          {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-end">
                        <button
                          className="btn btn-primary w-full"
                          onClick={() => void saveEdit()}
                          aria-label="structured_character_relations_edit_submit"
                          disabled={!chapterId || saving}
                          type="button"
                        >
                          {saving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </div>
                    <label className="grid gap-1">
                      <span className="text-xs text-subtext">补充描述（可选）</span>
                      <textarea
                        className="textarea"
                        rows={2}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        aria-label="structured_character_relations_edit_desc"
                        disabled={!chapterId || saving}
                      />
                    </label>
                  </div>
                ) : null}

                {open ? (
                  <div className="mt-3 rounded-atelier border border-border bg-canvas p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-subtext">关联证据</div>
                      <div className="text-[11px] text-subtext">
                        {evLoading ? "加载中..." : ev ? `共 ${ev.length} 条` : "未加载"}
                      </div>
                    </div>
                    {!evLoading ? (
                      <div className="result-overview-grid mt-3 lg:grid-cols-3">
                        <div className="result-overview-card is-emphasis">
                          <div className="result-overview-label">证据数量</div>
                          <div className="result-overview-value">{ev?.length ?? 0}</div>
                          <div className="result-overview-copy">
                            先看数量是否合理，再决定要不要逐条细读证据内容。
                          </div>
                        </div>
                        <div className="result-overview-card">
                          <div className="result-overview-label">来源分布</div>
                          <div className="result-overview-value">{evidenceSourceSummary}</div>
                          <div className="result-overview-copy">
                            用这个摘要判断证据主要来自正文、图谱还是其他导入来源。
                          </div>
                        </div>
                        <div className="result-overview-card">
                          <div className="result-overview-label">最近证据时间</div>
                          <div className="result-overview-value">{latestEvidenceAt || "未记录"}</div>
                          <div className="result-overview-copy">
                            如果证据很旧或完全缺失，优先回正文或图谱链路继续补证据。
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {evLoading ? <div className="mt-2 text-xs text-subtext">加载中...</div> : null}
                    {!evLoading && ev && ev.length === 0 ? (
                      <FeedbackEmptyState
                        className="mt-2"
                        variant="compact"
                        title="这条关系还没有证据"
                        description="如果你想确认这条关系是否有依据，可以回到图谱查询、正文或世界资料里继续补证据。"
                      />
                    ) : null}
                    {!evLoading && ev && ev.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        {ev.map((item) => (
                          <FeedbackDisclosure
                            key={String(item.id)}
                            className="evidence-summary-card"
                            summaryClassName="text-xs text-subtext hover:text-ink"
                            bodyClassName="pt-3"
                            title={
                              <div
                                className="evidence-summary-title"
                                aria-label={`structured_character_relation_evidence_${relId}_${String(item.id)}`}
                              >
                                <div className="min-w-0">
                                  <div className="text-xs text-ink">
                                    {item.source_type}:{item.source_id ?? "-"}
                                  </div>
                                  <div className="evidence-summary-copy">{compactQuotePreview(item.quote_md)}</div>
                                </div>
                                <div className="text-[11px] text-subtext">{item.created_at ?? "-"}</div>
                              </div>
                            }
                          >
                            <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-[11px] leading-5 text-subtext">
                              {item.quote_md || "（空）"}
                            </pre>
                          </FeedbackDisclosure>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
