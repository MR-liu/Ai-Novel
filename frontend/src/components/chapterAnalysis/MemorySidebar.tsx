import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { filterAnnotationsByLens, type AnnotationLens } from "./annotationLens";
import { buildAnnotationRevisionQueueSeed } from "./revisionQueueDrafts";
import type { ApiError } from "../../services/apiClient";
import { upsertContinuityRevisionQueueItems } from "../../services/continuityRevisionQueue";
import type { StoryMemory } from "../../services/storyMemoryApi";
import {
  createStoryMemory,
  deleteStoryMemory,
  markStoryMemoryDone,
  mergeStoryMemories,
  updateStoryMemory,
} from "../../services/storyMemoryApi";
import { UI_COPY } from "../../lib/uiCopy";
import { Drawer } from "../ui/Drawer";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../ui/Feedback";
import { useConfirm } from "../ui/confirm";
import { useToast } from "../ui/toast";
import { WritingDrawerHeader, WritingDrawerSection } from "../writing/WritingDrawerWorkbench";
import {
  countAnnotationsInScope,
  filterAnnotationsByQuery,
  filterAnnotationsByScope,
  getAnnotationPriority,
  isAnnotationDone,
  type MemoryPriorityReason,
  type MemoryListScope,
} from "./memorySidebarFilters";
import type { MemoryAnnotation } from "./types";
import { labelForAnnotationType, sortKeyForAnnotationType } from "./types";

function normalizeTitle(annotation: MemoryAnnotation): string {
  const title = (annotation.title ?? "").trim();
  if (title) return title;
  const content = (annotation.content ?? "").trim();
  if (content) return content.slice(0, 60);
  return "（无标题）";
}

function compactPreview(text: string | null | undefined, limit = 96): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function normalizeSearchQuery(query: string): string {
  return String(query ?? "")
    .trim()
    .toLowerCase();
}

function buildSearchPreview(text: string | null | undefined, query: string, limit = 140): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";

  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return compactPreview(normalized, limit);

  const lower = normalized.toLowerCase();
  const matchIndex = lower.indexOf(normalizedQuery);
  if (matchIndex < 0 || normalized.length <= limit) return compactPreview(normalized, limit);

  const desiredStart = Math.max(0, matchIndex - Math.floor((limit - normalizedQuery.length) * 0.4));
  const start = Math.min(desiredStart, Math.max(0, normalized.length - limit));
  const end = Math.min(normalized.length, start + limit);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

function renderHighlightedText(text: string, query: string): ReactNode {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return text;

  const lower = text.toLowerCase();
  const pieces: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = lower.indexOf(normalizedQuery, cursor);
    if (matchIndex < 0) {
      pieces.push(text.slice(cursor));
      break;
    }
    if (matchIndex > cursor) {
      pieces.push(text.slice(cursor, matchIndex));
    }
    pieces.push(
      <mark
        key={`${matchIndex}-${cursor}`}
        className="rounded bg-accent/10 px-0.5 text-ink shadow-[inset_0_-1px_0_rgb(var(--color-accent)/0.15)]"
      >
        {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>,
    );
    cursor = matchIndex + normalizedQuery.length;
  }

  return pieces;
}

function priorityReasonLabel(reason: MemoryPriorityReason): string {
  switch (reason) {
    case "unmapped":
      return "未定位";
    case "open":
      return "待处理";
    case "important":
      return "高重要度";
    default:
      return reason;
  }
}

function buildPriorityLeadCopy(args: { lensLabel: string; reasons: MemoryPriorityReason[]; valid: boolean; done: boolean }) {
  const reasons = args.reasons.map(priorityReasonLabel);
  const reasonSummary = reasons.length > 0 ? reasons.join("、") : "当前筛选";

  if (!args.valid) {
    return `这条命中目前还回不到正文，建议优先补齐或合并，避免线索继续悬空。当前焦点来自：${args.lensLabel} · ${reasonSummary}。`;
  }
  if (args.done) {
    return `这条命中已经标记完成，更适合做复核而不是第一轮处理。当前焦点来自：${args.lensLabel} · ${reasonSummary}。`;
  }
  return `它在当前视角里最值得先看，适合作为第一轮核对入口。当前焦点来自：${args.lensLabel} · ${reasonSummary}。`;
}

type StoryMemoryForm = {
  memory_type: string;
  title: string;
  content: string;
  tags_raw: string;
  importance_score: number;
  text_position: number;
  text_length: number;
};

function parseTags(raw: string): string[] {
  const tokens = String(raw || "")
    .split(/[\n,，;；]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 80) break;
  }
  return out;
}

function joinTags(tags: string[] | null | undefined): string {
  return (tags ?? []).filter(Boolean).join("\n");
}

function toForm(a: MemoryAnnotation | null): StoryMemoryForm {
  return {
    memory_type: String(a?.type ?? "plot_point") || "plot_point",
    title: String(a?.title ?? ""),
    content: String(a?.content ?? ""),
    tags_raw: joinTags(a?.tags ?? []),
    importance_score: Number.isFinite(a?.importance) ? Number(a?.importance) : 0.0,
    text_position: Number.isFinite(a?.position) ? Number(a?.position) : -1,
    text_length: Number.isFinite(a?.length) ? Number(a?.length) : 0,
  };
}

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "chapter_summary", label: labelForAnnotationType("chapter_summary") },
  { value: "hook", label: labelForAnnotationType("hook") },
  { value: "foreshadow", label: labelForAnnotationType("foreshadow") },
  { value: "plot_point", label: labelForAnnotationType("plot_point") },
  { value: "character_state", label: labelForAnnotationType("character_state") },
  { value: "other", label: "其他" },
];

const SCOPE_OPTIONS: Array<{ value: MemoryListScope; label: string; hint: string }> = [
  { value: "all", label: "全部", hint: "保留当前类型过滤后的全部条目" },
  { value: "actionable", label: "待处理", hint: "只看还没标记完成的条目" },
  { value: "unmapped", label: "未定位", hint: "只看暂时无法回正文定位的条目" },
];

export function MemorySidebar(props: {
  projectId?: string;
  chapterId?: string | null;
  content?: string;
  annotations: MemoryAnnotation[];
  validIds: Set<string>;
  annotationLens: AnnotationLens;
  activeAnnotationId?: string | null;
  hoveredAnnotationIds?: string[];
  onSelect: (annotation: MemoryAnnotation) => void;
  onAnnotationLensChange?: (lens: AnnotationLens) => void;
  onHoverAnnotationIdsChange?: (ids: string[]) => void;
  onRefresh?: () => Promise<void> | void;
  onSetActiveAnnotationId?: (id: string | null) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const lensedAnnotations = useMemo(
    () => filterAnnotationsByLens(props.annotations, props.annotationLens),
    [props.annotationLens, props.annotations],
  );
  const lensLabel = props.annotationLens === "all" ? "全部命中" : labelForAnnotationType(props.annotationLens);

  const allTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of lensedAnnotations) {
      counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort(
        (a, b) => sortKeyForAnnotationType(a.type) - sortKeyForAnnotationType(b.type) || a.type.localeCompare(b.type),
      );
  }, [lensedAnnotations]);

  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(() => new Set(allTypes.map((t) => t.type)));
  const [scope, setScope] = useState<MemoryListScope>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const prevAllTypesRef = useRef<Set<string>>(new Set(allTypes.map((t) => t.type)));
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const itemRefsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const prevTypes = prevAllTypesRef.current;
    const nextTypes = new Set(allTypes.map((t) => t.type));
    prevAllTypesRef.current = nextTypes;

    const newlyAdded: string[] = [];
    for (const t of nextTypes) {
      if (!prevTypes.has(t)) newlyAdded.push(t);
    }
    if (!newlyAdded.length) return;

    setEnabledTypes((prev) => {
      const out = new Set(prev);
      for (const t of newlyAdded) out.add(t);
      return out;
    });
  }, [allTypes]);

  const effectiveEnabledTypes = useMemo(
    () => (props.annotationLens === "all" ? enabledTypes : new Set(allTypes.map((type) => type.type))),
    [allTypes, enabledTypes, props.annotationLens],
  );

  const filteredByType = useMemo(
    () => lensedAnnotations.filter((annotation) => effectiveEnabledTypes.has(annotation.type)),
    [effectiveEnabledTypes, lensedAnnotations],
  );

  const scopeCounts = useMemo(
    () => ({
      all: filteredByType.length,
      actionable: countAnnotationsInScope(filteredByType, props.validIds, "actionable"),
      unmapped: countAnnotationsInScope(filteredByType, props.validIds, "unmapped"),
    }),
    [filteredByType, props.validIds],
  );

  const filteredByScope = useMemo(
    () => filterAnnotationsByScope(filteredByType, props.validIds, scope),
    [filteredByType, props.validIds, scope],
  );

  const filtered = useMemo(() => {
    const out = filterAnnotationsByQuery(filteredByScope, searchQuery);
    out.sort(
      (a, b) => sortKeyForAnnotationType(a.type) - sortKeyForAnnotationType(b.type) || b.importance - a.importance,
    );
    return out;
  }, [filteredByScope, searchQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, MemoryAnnotation[]>();
    for (const a of filtered) {
      const list = map.get(a.type) ?? [];
      list.push(a);
      map.set(a.type, list);
    }
    return Array.from(map.entries()).sort(
      (a, b) => sortKeyForAnnotationType(a[0]) - sortKeyForAnnotationType(b[0]) || a[0].localeCompare(b[0]),
    );
  }, [filtered]);

  const invalidCount = lensedAnnotations.filter((annotation) => !props.validIds.has(annotation.id)).length;
  const visibleCount = filtered.length;
  const enabledTypeCount = effectiveEnabledTypes.size;
  const hiddenByScopeCount = filteredByType.length - filteredByScope.length;
  const scopeLabel = SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? "全部";
  const hiddenBySearchCount = filteredByScope.length - filtered.length;
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasTypeFilter =
    props.annotationLens === "all" && allTypes.some(({ type }) => !enabledTypes.has(type));
  const hoveredIds = props.hoveredAnnotationIds ?? [];
  const priorityItems = useMemo(() => {
    const ranked = filtered
      .map((annotation) => ({
        annotation,
        ...getAnnotationPriority({ annotation, validIds: props.validIds }),
      }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => b.score - a.score || b.annotation.importance - a.annotation.importance || a.annotation.id.localeCompare(b.annotation.id));

    return ranked.slice(0, 3);
  }, [filtered, props.validIds]);
  const priorityLead = priorityItems[0] ?? null;
  const priorityLeadValid = priorityLead ? props.validIds.has(priorityLead.annotation.id) : false;
  const priorityLeadDone = priorityLead ? isAnnotationDone(priorityLead.annotation) : false;
  const priorityLeadSelected = priorityLead ? props.activeAnnotationId === priorityLead.annotation.id : false;
  const emptyStateTitle = hasSearchQuery
    ? "当前搜索没有找到匹配条目"
    : scope !== "all"
      ? `当前范围里没有「${scopeLabel}」条目`
      : props.annotationLens !== "all"
        ? `专题「${lensLabel}」里暂时没有条目`
        : hasTypeFilter
          ? "当前类型过滤后没有条目"
          : "暂无记忆";
  const emptyStateDescription = hasSearchQuery
    ? "可以先清空搜索，再继续用专题、工作范围或类型过滤缩小排查范围。"
    : scope !== "all"
      ? "当前工作范围已经被缩得比较窄了。先放宽范围，通常更容易找回这一轮要处理的线索。"
      : props.annotationLens !== "all"
        ? "这一专题当前没有可处理条目。可以先退出专题回到全量视角，再决定下一轮要扫哪一类。"
        : hasTypeFilter
          ? "当前类型开关已经把列表过滤空了。恢复类型后，可以重新决定要保留哪一组。"
          : "请先在写作页分析并保存到记忆库，再回到这里做逐条治理。";

  const active = useMemo(() => {
    const id = props.activeAnnotationId;
    if (!id) return null;
    return props.annotations.find((a) => a.id === id) ?? null;
  }, [props.activeAnnotationId, props.annotations]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryAnnotation | null>(null);
  const [form, setForm] = useState<StoryMemoryForm>(() => toForm(null));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSources, setMergeSources] = useState<Set<string>>(() => new Set());
  const [mergeSaving, setMergeSaving] = useState(false);
  const mergeSavingRef = useRef(false);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(toForm(null));
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback(() => {
    if (!active) return;
    setEditing(active);
    setForm(toForm(active));
    setEditorOpen(true);
  }, [active]);

  const closeEditor = useCallback(() => {
    if (savingRef.current) return;
    setEditorOpen(false);
  }, []);

  const saveStoryMemory = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法保存");
      return;
    }
    if (!String(form.content || "").trim()) {
      toast.toastWarning("内容不能为空");
      return;
    }
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const memoryType = String(form.memory_type || "").trim() || "plot_point";
      const body = {
        chapter_id: props.chapterId ?? null,
        memory_type: memoryType,
        title: form.title.trim() ? form.title.trim() : null,
        content: String(form.content || ""),
        importance_score: Number.isFinite(form.importance_score) ? Number(form.importance_score) : 0.0,
        tags: parseTags(form.tags_raw),
        text_position: Number.isFinite(form.text_position) ? Number(form.text_position) : -1,
        text_length: Number.isFinite(form.text_length) ? Math.max(0, Number(form.text_length)) : 0,
        is_foreshadow: memoryType === "foreshadow",
      };

      let saved: StoryMemory;
      if (editing) saved = await updateStoryMemory(projectId, editing.id, body);
      else saved = await createStoryMemory(projectId, body);

      toast.toastSuccess(editing ? "已保存剧情记忆" : "已新增剧情记忆");
      props.onSetActiveAnnotationId?.(saved.id);
      await props.onRefresh?.();
      setEditorOpen(false);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`保存失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    editing,
    form.content,
    form.importance_score,
    form.memory_type,
    form.tags_raw,
    form.text_length,
    form.text_position,
    form.title,
    props,
    toast,
  ]);

  const deleteSelected = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法删除");
      return;
    }
    if (!active) return;
    const ok = await confirm.confirm({
      title: "删除该条剧情记忆？",
      description: `将删除「${normalizeTitle(active)}」。此操作不可撤销。`,
      confirmText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await deleteStoryMemory(projectId, active.id);
      toast.toastSuccess("已删除剧情记忆");
      props.onSetActiveAnnotationId?.(null);
      await props.onRefresh?.();
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`删除失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      setSaving(false);
    }
  }, [active, confirm, props, toast]);

  const toggleDone = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法操作");
      return;
    }
    if (!active) return;
    const done = isAnnotationDone(active);

    setSaving(true);
    try {
      await markStoryMemoryDone(projectId, active.id, !done);
      toast.toastSuccess(!done ? "已标记完成" : "已取消完成");
      await props.onRefresh?.();
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`操作失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      setSaving(false);
    }
  }, [active, props, toast]);

  const openMerge = useCallback(() => {
    if (!active) return;
    setMergeSources(new Set());
    setMergeOpen(true);
  }, [active]);

  const closeMerge = useCallback(() => {
    if (mergeSavingRef.current) return;
    setMergeOpen(false);
  }, []);

  const mergeCandidates = useMemo(() => {
    if (!active) return [];
    const out = props.annotations.filter((a) => a.id !== active.id);
    out.sort(
      (a, b) => sortKeyForAnnotationType(a.type) - sortKeyForAnnotationType(b.type) || b.importance - a.importance,
    );
    return out;
  }, [active, props.annotations]);

  const applyMerge = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法合并");
      return;
    }
    if (!active) return;
    const sourceIds = Array.from(mergeSources);
    if (sourceIds.length === 0) {
      toast.toastWarning("请先选择要合并的条目");
      return;
    }
    const ok = await confirm.confirm({
      title: "确认合并？",
      description: `将把 ${sourceIds.length} 条剧情记忆合并到「${normalizeTitle(active)}」，并删除被合并条目。`,
      confirmText: "合并",
      cancelText: "取消",
    });
    if (!ok) return;

    if (mergeSavingRef.current) return;
    mergeSavingRef.current = true;
    setMergeSaving(true);
    try {
      await mergeStoryMemories(projectId, { targetId: active.id, sourceIds });
      toast.toastSuccess("已合并剧情记忆");
      setMergeOpen(false);
      setMergeSources(new Set());
      props.onSetActiveAnnotationId?.(active.id);
      await props.onRefresh?.();
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`合并失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      mergeSavingRef.current = false;
      setMergeSaving(false);
    }
  }, [active, confirm, mergeSources, props, toast]);

  const selectedInfo = useMemo(() => {
    if (!active) return null;
    const done = isAnnotationDone(active);
    const valid = props.validIds.has(active.id);
    return { done, valid };
  }, [active, props.validIds]);
  const selectedActionHint = useMemo(() => {
    if (!active) return "先从上方列表选择一条命中，再决定是编辑、完成、合并还是删除。";
    if (!selectedInfo?.valid) return "当前条目还没法在正文中定位，更适合先编辑内容或与其他记忆合并。";
    if (selectedInfo.done) return "这条记忆已完成，通常只需要复核或在必要时取消完成。";
    return "这条记忆可直接回正文定位，适合先核对上下文，再决定是否标记完成或编辑。";
  }, [active, selectedInfo]);
  const activeType = active?.type ?? null;
  const activeVisible = active ? filtered.some((annotation) => annotation.id === active.id) : false;
  const editorModeLabel = editing ? "编辑现有记忆" : "新建记忆";
  const editorAnchorStatus =
    Number.isFinite(form.text_position) && form.text_position >= 0 && Number.isFinite(form.text_length) && form.text_length > 0
      ? "已设置定位"
      : "回溯定位";
  const editorTagsCount = useMemo(() => parseTags(form.tags_raw).length, [form.tags_raw]);
  const mergeTargetTitle = active ? normalizeTitle(active) : "（未选择）";
  const mergeSelectedCount = mergeSources.size;
  const resetTypeFilters = useCallback(() => {
    setEnabledTypes(new Set(allTypes.map((item) => item.type)));
  }, [allTypes]);
  const queuePriorityItems = useCallback(() => {
    if (!props.projectId || !props.chapterId || priorityItems.length === 0) return;
    const drafts = priorityItems.map(({ annotation }) => {
      const seed = buildAnnotationRevisionQueueSeed(annotation, props.content ?? "", props.validIds);
      return {
        id: seed.id,
        chapterId: props.chapterId!,
        title: seed.title,
        type: seed.type,
        excerpt: seed.excerpt,
        hasExcerpt: seed.hasExcerpt,
      };
    });
    upsertContinuityRevisionQueueItems(props.projectId, props.chapterId, drafts);
    toast.toastSuccess(`已把 ${drafts.length} 条优先问题加入修订队列`);
  }, [priorityItems, props.chapterId, props.content, props.projectId, props.validIds, toast]);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set<string>();
      for (const [type, list] of groups) {
        if (prev.has(type) || activeType === type || list.length <= 4) {
          next.add(type);
        }
      }
      return next;
    });
  }, [activeType, groups]);

  useEffect(() => {
    if (!props.activeAnnotationId) return;
    const target = itemRefsRef.current.get(props.activeAnnotationId);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [filtered, openGroups, props.activeAnnotationId]);

  return (
    <aside className="min-w-0 grid gap-3" aria-label="story_memory_sidebar">
      <section className="research-guide-panel">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">{UI_COPY.chapterAnalysis.storyMemoryTitle}</div>
            <div className="studio-cluster-copy">
              这里负责把正文命中、长期记忆和后续治理动作放到同一侧栏里。先筛选，再选中，再处理。
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={openCreate}
            disabled={saving}
            aria-label="story_memory_create"
          >
            新增剧情记忆
          </button>
        </div>

        <div className="studio-overview-grid">
          <div className="studio-overview-card is-emphasis">
            <div className="studio-overview-label">当前范围</div>
            <div className="studio-overview-value">
              可见 {visibleCount} / 全部 {lensedAnnotations.length}
            </div>
            <div className="studio-overview-copy">
              {hasSearchQuery
                ? `搜索“${searchQuery.trim()}”后剩余 ${visibleCount} 条命中。`
                : invalidCount > 0
                  ? `其中 ${invalidCount} 条暂未定位到正文。`
                  : "当前所有条目都可正常进入核对流程。"}
            </div>
          </div>
          <div className="studio-overview-card">
            <div className="studio-overview-label">过滤状态</div>
            <div className="studio-overview-value">
              {enabledTypeCount} 个类型 · {scopeLabel}
            </div>
            <div className="studio-overview-copy">
              先用类型缩小范围，再切工作范围；
              {hiddenByScopeCount > 0 ? `范围过滤隐藏了 ${hiddenByScopeCount} 条。` : "当前没有范围过滤隐藏项。"}
              {hasSearchQuery ? ` 搜索额外隐藏了 ${hiddenBySearchCount} 条。` : ""}
            </div>
          </div>
          <div className="studio-overview-card">
            <div className="studio-overview-label">下一步</div>
            <div className="studio-overview-value">{active ? "继续处理当前条目" : "先选择一条命中"}</div>
            <div className="studio-overview-copy">{selectedActionHint}</div>
          </div>
        </div>

        {props.annotationLens !== "all" ? (
          <FeedbackCallout
            className="mt-4 text-xs"
            title={`侧栏已同步到专题：${lensLabel}`}
            actions={
              <button className="btn btn-ghost px-2 py-1 text-xs" type="button" onClick={() => props.onAnnotationLensChange?.("all")}>
                查看全部
              </button>
            }
          >
            当前右侧只显示 {lensedAnnotations.length} 条同类条目，方便和正文专题扫描保持同一视角。建议先把这一类看完，再切回全部继续横向排查。
          </FeedbackCallout>
        ) : null}

        <FeedbackCallout className="mt-4 text-xs" title="侧记说明">
          {UI_COPY.chapterAnalysis.storyMemorySubtitle}
        </FeedbackCallout>

        <div className="mt-3 flex flex-wrap gap-2">
          {allTypes.map((t) => {
            const enabled = enabledTypes.has(t.type);
            return (
              <button
                key={t.type}
                className={clsx("btn btn-ghost px-2 py-1 text-xs", enabled ? "bg-canvas text-ink" : "text-subtext")}
                type="button"
                onClick={() => {
                  setEnabledTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.type)) next.delete(t.type);
                    else next.add(t.type);
                    if (next.size === 0) return new Set([t.type]);
                    return next;
                  });
                }}
                aria-pressed={enabled}
                title={enabled ? "点击取消过滤" : "点击启用过滤"}
              >
                {labelForAnnotationType(t.type)}
                <span className="ml-1 text-subtext">· {t.count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-2">
          <div className="drawer-workbench-chip-row">
            <span>工作范围</span>
            <span>先缩到当前最值得处理的一批，再逐条治理。</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SCOPE_OPTIONS.map((option) => {
              const selected = scope === option.value;
              const count = scopeCounts[option.value];
              return (
                <button
                  key={option.value}
                  className={clsx(
                    "btn btn-ghost px-2 py-1 text-xs",
                    selected ? "bg-canvas text-ink" : "text-subtext",
                  )}
                  type="button"
                  onClick={() => setScope(option.value)}
                  aria-pressed={selected}
                  title={option.hint}
                >
                  {option.label}
                  <span className="ml-1 text-subtext">· {count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <div className="drawer-workbench-chip-row">
            <span>侧栏搜索</span>
            <span>支持标题、内容、标签和类型词，适合在长文里快速找回一条线索。</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-[220px] flex-1">
              <span className="sr-only">搜索当前命中条目</span>
              <input
                className="input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索标题、内容、标签或类型…"
                aria-label="story_memory_search"
              />
            </label>
            <button
              className="btn btn-ghost px-2 py-1 text-xs"
              type="button"
              onClick={() => setSearchQuery("")}
              disabled={!hasSearchQuery}
            >
              清空搜索
            </button>
          </div>
          {active && !activeVisible ? (
            <FeedbackCallout className="text-xs" tone="warning" title="当前条目被过滤了">
              当前选中条目还在工作台里，但它不在这组筛选结果中。可以清空搜索或调整过滤范围后再回列表继续核对。
            </FeedbackCallout>
          ) : null}
        </div>

        {priorityItems.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {priorityLead ? (
              <FeedbackCallout
                className="text-xs"
                tone={!priorityLeadValid ? "warning" : "info"}
                title={props.annotationLens === "all" ? "建议先从这条开始" : `当前专题建议先看这条`}
                actions={
                  <button
                    className={clsx(
                      "btn px-2 py-1 text-xs",
                      priorityLeadSelected ? "btn-secondary" : "btn-primary",
                    )}
                    type="button"
                    onClick={() => props.onSelect(priorityLead.annotation)}
                  >
                    {priorityLeadSelected ? "已锁定当前条目" : "定位首条风险"}
                  </button>
                }
              >
                <div className="font-medium text-ink">{normalizeTitle(priorityLead.annotation)}</div>
                <div className="mt-1">
                  {buildPriorityLeadCopy({
                    lensLabel,
                    reasons: priorityLead.reasons,
                    valid: priorityLeadValid,
                    done: priorityLeadDone,
                  })}
                </div>
              </FeedbackCallout>
            ) : null}
            <div className="drawer-workbench-chip-row">
              <span>{props.annotationLens === "all" ? "优先检查" : `${lensLabel}专题优先检查`}</span>
              <span>这几条是当前视角里最值得先看的入口，适合先定第一轮顺序，再逐条深入处理。</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-secondary px-2 py-1 text-xs"
                type="button"
                onClick={queuePriorityItems}
                disabled={!props.projectId || !props.chapterId || priorityItems.length === 0}
              >
                把这 {priorityItems.length} 条加入修订队列
              </button>
            </div>
            <div className="grid gap-2">
              {priorityItems.map((item, index) => {
                const selected = props.activeAnnotationId === item.annotation.id;
                return (
                  <button
                    key={item.annotation.id}
                    className={clsx(
                      "ui-transition-fast w-full rounded-atelier border px-3 py-3 text-left",
                      selected ? "border-accent bg-canvas" : "border-border bg-surface hover:bg-canvas",
                    )}
                    type="button"
                    onClick={() => props.onSelect(item.annotation)}
                    onMouseEnter={() => props.onHoverAnnotationIdsChange?.([item.annotation.id])}
                    onMouseLeave={() => props.onHoverAnnotationIdsChange?.([])}
                    onFocus={() => props.onHoverAnnotationIdsChange?.([item.annotation.id])}
                    onBlur={() => props.onHoverAnnotationIdsChange?.([])}
                    aria-label={`priority_memory_item:${normalizeTitle(item.annotation)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-subtext">
                            #{index + 1}
                          </span>
                          <div className="truncate text-sm font-semibold text-ink">{normalizeTitle(item.annotation)}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.reasons.map((reason) => (
                            <span
                              key={`${item.annotation.id}-${reason}`}
                              className={clsx(
                                "rounded-full border px-2 py-0.5 text-[11px]",
                                reason === "unmapped" && "border-accent/30 bg-accent/10 text-ink",
                                reason === "open" && "border-warning/30 bg-warning/10 text-ink",
                                reason === "important" && "border-info/30 bg-info/10 text-ink",
                              )}
                            >
                              {priorityReasonLabel(reason)}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-xs leading-5 text-subtext">{compactPreview(item.annotation.content, 120)}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-subtext">
                        <div>优先分 {item.score}</div>
                        <div className="mt-1">权重 {(item.annotation.importance * 10).toFixed(1)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel p-3">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">命中列表</div>
            <div className="studio-cluster-copy">
              默认按类型分组。先挑一组展开，再选具体条目；悬停会先和正文轻联动，点击才会真正锁定当前焦点。
            </div>
          </div>
          <div className="studio-cluster-meta">{visibleCount} 条可见</div>
        </div>

        {groups.length === 0 ? (
          <FeedbackEmptyState
            className="mt-4 rounded-atelier border border-border bg-canvas p-4"
            variant="compact"
            title={emptyStateTitle}
            description={emptyStateDescription}
            actions={
              hasSearchQuery || scope !== "all" || props.annotationLens !== "all" || hasTypeFilter ? (
                <div className="flex flex-wrap gap-2">
                  {hasSearchQuery ? (
                    <button className="btn btn-secondary px-2 py-1 text-xs" type="button" onClick={() => setSearchQuery("")}>
                      清空搜索
                    </button>
                  ) : null}
                  {scope !== "all" ? (
                    <button className="btn btn-secondary px-2 py-1 text-xs" type="button" onClick={() => setScope("all")}>
                      查看全部范围
                    </button>
                  ) : null}
                  {props.annotationLens !== "all" ? (
                    <button
                      className="btn btn-secondary px-2 py-1 text-xs"
                      type="button"
                      onClick={() => props.onAnnotationLensChange?.("all")}
                    >
                      退出专题
                    </button>
                  ) : null}
                  {hasTypeFilter ? (
                    <button className="btn btn-secondary px-2 py-1 text-xs" type="button" onClick={resetTypeFilters}>
                      恢复类型
                    </button>
                  ) : null}
                </div>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-4 grid gap-3">
            {groups.map(([type, list]) => (
              <FeedbackDisclosure
                key={type}
                open={hasSearchQuery ? true : openGroups.has(type)}
                onToggle={(open) => {
                  setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (open) next.add(type);
                    else next.delete(type);
                    return next;
                  });
                }}
                className="drawer-workbench-disclosure"
                summaryClassName="text-xs text-subtext hover:text-ink"
                bodyClassName="pt-3"
                title={`${labelForAnnotationType(type)} · ${list.length}`}
              >
                <div className="grid gap-2">
                  {list.map((a) => {
                    const selected = props.activeAnnotationId === a.id;
                    const hovered = hoveredIds.includes(a.id);
                    const valid = props.validIds.has(a.id);
                    const done = isAnnotationDone(a);
                    const previewText = buildSearchPreview(a.content, searchQuery, 140);
                    return (
                      <button
                        key={a.id}
                        ref={(el) => {
                          if (el) itemRefsRef.current.set(a.id, el);
                          else itemRefsRef.current.delete(a.id);
                        }}
                        className={clsx(
                          "ui-transition-fast w-full rounded-atelier border px-3 py-3 text-left",
                          selected ? "border-accent bg-canvas" : "border-border bg-canvas hover:bg-surface",
                          hovered && !selected && "ring-1 ring-accent/20 bg-accent/5",
                          !valid && "opacity-75",
                        )}
                        type="button"
                        onClick={() => props.onSelect(a)}
                        onMouseEnter={() => props.onHoverAnnotationIdsChange?.([a.id])}
                        onMouseLeave={() => props.onHoverAnnotationIdsChange?.([])}
                        onFocus={() => props.onHoverAnnotationIdsChange?.([a.id])}
                        onBlur={() => props.onHoverAnnotationIdsChange?.([])}
                        aria-label={`story_memory_item:${normalizeTitle(a)}`}
                        title={valid ? "点击定位到正文" : "未定位：无法在正文中高亮"}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold text-ink">
                                {renderHighlightedText(normalizeTitle(a), searchQuery)}
                              </div>
                              {done ? (
                                <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-ink">
                                  已完成
                                </span>
                              ) : null}
                              {!valid ? (
                                <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-ink">
                                  未定位
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs leading-5 text-subtext">{renderHighlightedText(previewText, searchQuery)}</div>
                          </div>
                          <div className="shrink-0 text-right text-xs text-subtext">
                            <div>权重 {(a.importance * 10).toFixed(1)}</div>
                            <div className="mt-1">{selected ? "当前选中" : hovered ? "正在联动" : "点击核对"}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </FeedbackDisclosure>
            ))}
          </div>
        )}
      </section>

      <section className="panel p-3">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">当前条目工作台</div>
            <div className="studio-cluster-copy">
              选中后在这里集中做编辑、完成、合并和删除，不需要在列表里来回找按钮。
            </div>
          </div>
          <div className="studio-cluster-meta">{active ? "已选中条目" : "等待选择"}</div>
        </div>

        <div className="result-overview-grid mt-4 lg:grid-cols-3">
          <div className="result-overview-card is-emphasis">
            <div className="result-overview-label">当前条目</div>
            <div className="result-overview-value">{active ? normalizeTitle(active) : "请先选择条目"}</div>
            <div className="result-overview-copy">{selectedActionHint}</div>
          </div>
          <div className="result-overview-card">
            <div className="result-overview-label">定位状态</div>
            <div className="result-overview-value">
              {active ? (selectedInfo?.valid ? "可定位正文" : "未定位到正文") : "等待选择"}
            </div>
            <div className="result-overview-copy">
              {active ? `类型：${labelForAnnotationType(active.type)}` : "选中后会显示当前类型和状态。"}
            </div>
          </div>
          <div className="result-overview-card">
            <div className="result-overview-label">完成状态</div>
            <div className="result-overview-value">
              {active ? (selectedInfo?.done ? "已完成" : "待处理") : "等待选择"}
            </div>
            <div className="result-overview-copy">
              {active ? `重要度 ${(active.importance * 10).toFixed(1)}` : "完成后仍可继续编辑或取消完成。"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <div className="min-w-0">
            <div className="text-xs text-subtext">{active ? "已选中" : "未选择"}</div>
            <div className="mt-1 truncate text-sm text-ink">
              {active ? normalizeTitle(active) : "请先在上方选择条目"}
            </div>
            {active ? (
              <div className="mt-1 text-[11px] text-subtext">
                类型：{labelForAnnotationType(active.type)} · 重要度：{(active.importance * 10).toFixed(1)} ·{" "}
                {selectedInfo?.valid ? "可定位" : "未定位"}
                {selectedInfo?.done ? " · 已完成" : ""}
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-subtext">
                提示：点击上方条目可定位到正文，并在此处进行编辑/合并/完成标记/删除。
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary px-3 py-1 text-xs"
              type="button"
              onClick={openEdit}
              disabled={!active || saving}
              aria-label="story_memory_edit"
            >
              编辑
            </button>
            <button
              className="btn btn-secondary px-3 py-1 text-xs"
              type="button"
              onClick={toggleDone}
              disabled={!active || saving}
              aria-label="story_memory_toggle_done"
            >
              {selectedInfo?.done ? "取消完成" : "标记完成"}
            </button>
            <button
              className="btn btn-secondary px-3 py-1 text-xs"
              type="button"
              onClick={openMerge}
              disabled={!active || saving || props.annotations.length < 2}
              aria-label="story_memory_merge"
            >
              合并
            </button>
            <button
              className="btn btn-danger px-3 py-1 text-xs"
              type="button"
              onClick={() => void deleteSelected()}
              disabled={!active || saving}
              aria-label="story_memory_delete"
            >
              删除
            </button>
          </div>
        </div>
      </section>

      <Drawer
        open={editorOpen}
        onClose={closeEditor}
        panelClassName="h-full w-full max-w-[860px] border-l border-border bg-surface shadow-sm"
        ariaLabel={editing ? "编辑剧情记忆" : "新增剧情记忆"}
      >
        <div className="p-4">
          <div className="grid gap-4">
            <WritingDrawerHeader
              kicker="剧情记忆"
              title={editing ? "编辑剧情记忆" : "新增剧情记忆"}
              description={saving ? "保存中..." : "先写清这条记忆要被后续哪些章节复用，再补标签、重要度和定位信息。"}
              meta={[
                { label: "当前模式", value: editorModeLabel },
                { label: "类型", value: labelForAnnotationType(form.memory_type) },
                { label: "定位方式", value: editorAnchorStatus, tone: editorAnchorStatus === "已设置定位" ? "success" : "warning" },
              ]}
              actions={
                <>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={closeEditor}
                    disabled={saving}
                    aria-label="story_memory_close"
                  >
                    关闭
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void saveStoryMemory()}
                    disabled={saving || !form.content.trim()}
                    aria-label="story_memory_save"
                  >
                    保存
                  </button>
                </>
              }
              callout={
                <div className="text-sm leading-6 text-subtext">
                  这一步不会改正文，只会更新后续可检索、可复用的剧情记忆条目。拿不准定位时，可以先把内容写清，定位信息后补。
                </div>
              }
            />

            <WritingDrawerSection
              kicker="核心内容"
              title="先定义这条记忆是什么"
              copy="标题负责快速识别，内容负责后续检索命中。作者视角下，内容是否具体通常比字段是否齐全更重要。"
            >
              <div className="result-overview-grid">
                <div className="result-overview-card is-emphasis">
                  <div className="result-overview-label">当前标题</div>
                  <div className="result-overview-value">{form.title.trim() || "尚未填写标题"}</div>
                  <div className="result-overview-copy">标题建议写成一句能快速认出的事实或变化。</div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">内容长度</div>
                  <div className="result-overview-value">{form.content.trim().length} 字</div>
                  <div className="result-overview-copy">内容过短时，后续检索和人工核对都会更吃力。</div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">标签数量</div>
                  <div className="result-overview-value">{editorTagsCount} 个</div>
                  <div className="result-overview-copy">标签适合补充人物、时间线或伏笔阶段，不适合替代正文内容。</div>
                </div>
              </div>

              <div className="mt-3 grid gap-4">
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">类型</span>
                  <select
                    className="select"
                    value={form.memory_type}
                    onChange={(e) => setForm((v) => ({ ...v, memory_type: e.target.value }))}
                    aria-label="story_memory_type"
                    disabled={saving}
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-subtext">标题（可选）</span>
                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
                    placeholder="例如：主角发现异常线索"
                    disabled={saving}
                    aria-label="story_memory_title"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-subtext">内容</span>
                  <textarea
                    className="textarea atelier-content"
                    rows={10}
                    value={form.content}
                    onChange={(e) => setForm((v) => ({ ...v, content: e.target.value }))}
                    placeholder="写下可复用、可检索的剧情记忆条目…"
                    disabled={saving}
                    aria-label="story_memory_content"
                  />
                </label>
              </div>
            </WritingDrawerSection>

            <WritingDrawerSection
              kicker="检索辅助"
              title="标签和重要度"
              copy="标签适合帮助你筛查同类记忆，重要度则告诉系统和你自己这条记忆值不值得优先处理。"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">标签（可选，每行一个）</span>
                  <textarea
                    className="textarea"
                    rows={6}
                    value={form.tags_raw}
                    onChange={(e) => setForm((v) => ({ ...v, tags_raw: e.target.value }))}
                    placeholder="例如：伏笔\n人物状态\n时间线"
                    disabled={saving}
                    aria-label="story_memory_tags"
                  />
                </label>
                <div className="grid gap-3">
                <div className="drawer-workbench-subcard">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">重要度</div>
                  <div className="mt-2 text-sm leading-6 text-subtext">
                      侧栏显示会把 `0~1` 换算成 `0~10`。如果这条记忆会反复影响角色状态或主线，建议提高重要度。
                  </div>
                    <label className="mt-3 grid gap-1">
                      <span className="text-xs text-subtext">重要度（0~1）</span>
                      <input
                        className="input"
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={Number.isFinite(form.importance_score) ? form.importance_score : 0}
                        onChange={(e) => setForm((v) => ({ ...v, importance_score: Number(e.target.value) }))}
                        disabled={saving}
                        aria-label="story_memory_importance"
                      />
                    </label>
                    <div className="mt-2 text-xs text-subtext">当前显示权重：{(form.importance_score * 10).toFixed(1)}</div>
                  </div>
                </div>
              </div>
            </WritingDrawerSection>

            <WritingDrawerSection
              kicker="高级"
              title="回溯定位"
              copy="定位起点和定位长度只用于帮助系统更准确地把记忆回映到正文。没有把握时，先留空更稳。"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">定位起点（position）</span>
                  <input
                    className="input"
                    type="number"
                    value={Number.isFinite(form.text_position) ? form.text_position : -1}
                    onChange={(e) => setForm((v) => ({ ...v, text_position: Number(e.target.value) }))}
                    disabled={saving}
                    aria-label="story_memory_position"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">定位长度（length）</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={Number.isFinite(form.text_length) ? form.text_length : 0}
                    onChange={(e) => setForm((v) => ({ ...v, text_length: Number(e.target.value) }))}
                    disabled={saving}
                    aria-label="story_memory_length"
                  />
                </label>
              </div>
              <FeedbackCallout className="mt-3 text-xs" title="定位说明">
                position / length 用于“回溯定位”。若不确定可留空（-1/0），系统会尝试用内容片段做兜底定位。
              </FeedbackCallout>
            </WritingDrawerSection>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={mergeOpen}
        onClose={closeMerge}
        panelClassName="h-full w-full max-w-[860px] border-l border-border bg-surface shadow-sm"
        ariaLabel="合并剧情记忆"
      >
        <div className="p-4">
          <div className="grid gap-4">
            <WritingDrawerHeader
              kicker="剧情记忆"
              title="合并剧情记忆"
              description="把重复、过细或意义相近的条目收束到一个目标里。被合并的来源条目会被删除，所以先确认目标条目足够稳定。"
              meta={[
                { label: "目标条目", value: mergeTargetTitle },
                { label: "候选数量", value: String(mergeCandidates.length) },
                { label: "已选来源", value: String(mergeSelectedCount), tone: mergeSelectedCount > 0 ? "warning" : "default" },
              ]}
              actions={
                <>
                  <button className="btn btn-secondary" type="button" onClick={closeMerge} disabled={mergeSaving}>
                    关闭
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void applyMerge()}
                    disabled={mergeSaving || mergeSources.size === 0 || !active}
                    aria-label="story_memory_merge_apply"
                  >
                    合并
                  </button>
                </>
              }
              callout={
                <FeedbackCallout className="text-sm" tone="warning" title="合并后会删除来源条目">
                  建议先读一遍目标条目，确保它能承接来源条目的关键信息，再执行合并。
                </FeedbackCallout>
              }
            />

            <WritingDrawerSection
              kicker="目标检查"
              title="先确认目标条目是否合适"
              copy="如果目标条目本身还不够完整，建议先回编辑抽屉补内容，再回来合并。"
            >
              <div className="result-overview-grid">
                <div className="result-overview-card is-emphasis">
                  <div className="result-overview-label">当前目标</div>
                  <div className="result-overview-value">{mergeTargetTitle}</div>
                  <div className="result-overview-copy">
                    {active ? compactPreview(active.content, 120) : "当前没有选中目标条目。"}
                  </div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">当前选择</div>
                  <div className="result-overview-value">{mergeSelectedCount} 条来源</div>
                  <div className="result-overview-copy">至少选择 1 条来源后，合并按钮才会启用。</div>
                </div>
                <div className="result-overview-card">
                  <div className="result-overview-label">处理原则</div>
                  <div className="result-overview-value">保留主条目，吸收来源</div>
                  <div className="result-overview-copy">更像“归并”而不是“拼接”；目标条目应该承担最终语义。</div>
                </div>
              </div>
            </WritingDrawerSection>

            <WritingDrawerSection
              kicker="来源选择"
              title="勾选要并入的条目"
              copy="优先合并重复、粒度过细或内容高度重叠的条目。不要一次性合太多不相关内容。"
            >
              {mergeCandidates.length === 0 ? (
                <FeedbackEmptyState
                  variant="compact"
                  title="当前章节没有可合并的其他条目"
                  description="至少需要一个目标条目和其他来源条目，才能执行合并。"
                />
              ) : (
                <div className="grid gap-2">
                  {mergeCandidates.map((a) => {
                    const checked = mergeSources.has(a.id);
                    return (
                      <label
                        key={a.id}
                        className={clsx(
                          "drawer-workbench-subcard flex cursor-pointer items-start gap-3",
                          checked ? "border-accent" : "",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setMergeSources((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(a.id);
                              else next.delete(a.id);
                              return next;
                            });
                          }}
                          aria-label={`story_memory_merge_source:${normalizeTitle(a)}`}
                          disabled={mergeSaving}
                          className="checkbox mt-1"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold text-ink">{normalizeTitle(a)}</div>
                            <div className="text-xs text-subtext">{labelForAnnotationType(a.type)}</div>
                          </div>
                          <div className="mt-2 text-xs leading-5 text-subtext">{compactPreview(a.content, 160)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </WritingDrawerSection>
          </div>
        </div>
      </Drawer>
    </aside>
  );
}
