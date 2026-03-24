import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { FeedbackDisclosure } from "../components/ui/Feedback";
import { useToast } from "../components/ui/toast";
import { ApiError, sanitizeFilename } from "../services/apiClient";
import {
  createGlossaryTerm,
  deleteGlossaryTerm,
  exportAllGlossaryTerms,
  listGlossaryTerms,
  rebuildGlossaryTerms,
  type GlossaryTerm,
  updateGlossaryTerm,
} from "../services/glossaryApi";

type GlossaryForm = {
  term: string;
  aliasesText: string;
  enabled: boolean;
};

const EMPTY_FORM: GlossaryForm = {
  term: "",
  aliasesText: "",
  enabled: true,
};

function parseAliases(raw: string): string[] {
  const items = raw
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(items)).slice(0, 50);
}

function formatAliases(aliases: string[]): string {
  return aliases.join(", ");
}

function humanizeOrigin(origin: string): string {
  return origin === "auto" ? "自动生成" : "手工维护";
}

function humanizeSourceType(sourceType: string): string {
  switch (sourceType) {
    case "chapter":
      return "章节";
    case "import":
      return "导入文档";
    default:
      return sourceType;
  }
}

export function GlossaryPage() {
  const { projectId } = useParams();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const [query, setQuery] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<GlossaryForm>(EMPTY_FORM);
  const [rebuildConfig, setRebuildConfig] = useState({
    includeChapters: true,
    includeImports: true,
    maxTermsPerSource: 60,
  });

  const selectedTerm = useMemo(
    () => terms.find((item) => item.id === selectedId) ?? null,
    [selectedId, terms],
  );
  const enabledCount = useMemo(() => terms.filter((item) => item.enabled === 1).length, [terms]);
  const autoCount = useMemo(() => terms.filter((item) => item.origin === "auto").length, [terms]);
  const searchStateLabel = query.trim() ? `当前筛到 ${terms.length} 条术语` : `当前显示 ${terms.length} 条术语`;
  const editorStateLabel = selectedTerm ? `正在编辑：${selectedTerm.term}` : "当前准备新建术语";

  const loadTerms = useCallback(
    async (nextSelectedId?: string | null) => {
      if (!projectId) return;
      setLoading(true);
      try {
        const nextTerms = await listGlossaryTerms({
          projectId,
          q: query,
          includeDisabled,
          limit: 200,
        });
        setTerms(nextTerms);
        const preferredId = nextSelectedId === undefined ? selectedId : nextSelectedId;
        const preferred = nextTerms.find((item) => item.id === preferredId) ?? null;
        if (preferred) {
          setSelectedId(preferred.id);
          setForm({
            term: preferred.term,
            aliasesText: formatAliases(preferred.aliases),
            enabled: preferred.enabled === 1,
          });
          return;
        }
        setSelectedId(null);
        setForm(EMPTY_FORM);
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setLoading(false);
      }
    },
    [includeDisabled, projectId, query, selectedId, toast],
  );

  useEffect(() => {
    void loadTerms();
  }, [loadTerms]);

  const startCreate = useCallback(() => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  }, []);

  const selectTerm = useCallback((term: GlossaryTerm) => {
    setSelectedId(term.id);
    setForm({
      term: term.term,
      aliasesText: formatAliases(term.aliases),
      enabled: term.enabled === 1,
    });
  }, []);

  const saveTerm = useCallback(async () => {
    if (!projectId || saving) return;
    const term = form.term.trim();
    if (!term) {
      toast.toastWarning("术语不能为空");
      return;
    }

    setSaving(true);
    try {
      const body = {
        term,
        aliases: parseAliases(form.aliasesText),
        enabled: form.enabled ? 1 : 0,
      };
      const next =
        selectedId == null
          ? await createGlossaryTerm(projectId, body)
          : await updateGlossaryTerm(projectId, selectedId, body);
      toast.toastSuccess(selectedId == null ? "已创建术语" : "已保存术语");
      await loadTerms(next.id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setSaving(false);
    }
  }, [form.aliasesText, form.enabled, form.term, loadTerms, projectId, saving, selectedId, toast]);

  const removeTerm = useCallback(async () => {
    if (!projectId || !selectedId || deleting) return;
    setDeleting(true);
    try {
      await deleteGlossaryTerm(projectId, selectedId);
      toast.toastSuccess("已删除术语");
      await loadTerms(null);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setDeleting(false);
    }
  }, [deleting, loadTerms, projectId, selectedId, toast]);

  const downloadExport = useCallback(async () => {
    if (!projectId || exporting) return;
    setExporting(true);
    try {
      const exported = await exportAllGlossaryTerms(projectId);
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: "application/json;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${sanitizeFilename(`glossary_${projectId}`) || "glossary"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.toastSuccess("已导出术语表 JSON");
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setExporting(false);
    }
  }, [exporting, projectId, toast]);

  const runRebuild = useCallback(async () => {
    if (!projectId || rebuilding) return;
    setRebuilding(true);
    try {
      const result = await rebuildGlossaryTerms(projectId, {
        include_chapters: rebuildConfig.includeChapters,
        include_imports: rebuildConfig.includeImports,
        max_terms_per_source: rebuildConfig.maxTermsPerSource,
      });
      toast.toastSuccess(
        `术语重建完成：新增 ${result.created}，合并 ${result.updated}，候选 ${result.terms}`,
      );
      await loadTerms(selectedId);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setRebuilding(false);
    }
  }, [loadTerms, projectId, rebuildConfig.includeChapters, rebuildConfig.includeImports, rebuildConfig.maxTermsPerSource, rebuilding, selectedId, toast]);

  return (
    <ToolContent className="grid gap-4">
      <EditorialHero
        kicker="术语卷宗"
        title="把称呼、专有名词和别名先统一好，后面写作时才不容易前后打架。"
        subtitle="术语表适合沉淀世界观名词、组织称谓、地点别名和固定叫法。手工维护和自动提取的术语都会参与后续检索与上下文整理。"
        items={[
          { key: "terms", label: "当前术语", value: `${terms.length} 条` },
          { key: "enabled", label: "启用中的术语", value: `${enabledCount} 条` },
          { key: "auto", label: "自动提取", value: `${autoCount} 条` },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-secondary" disabled={loading} onClick={() => void loadTerms()} type="button">
            刷新
          </button>
          <button className="btn btn-secondary" disabled={exporting} onClick={() => void downloadExport()} type="button">
            {exporting ? "导出中…" : "导出 JSON"}
          </button>
          <button className="btn btn-primary" onClick={startCreate} type="button">
            新建术语
          </button>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{searchStateLabel}</span>
          <span className="manuscript-chip">{includeDisabled ? "包含已停用术语" : "默认隐藏已停用术语"}</span>
          <span className="manuscript-chip">{editorStateLabel}</span>
        </div>
      </section>

      <section className="review-track-panel">
        <div className="editorial-kicker">怎么维护术语卷宗</div>
        <div className="mt-3 max-w-3xl text-sm leading-7 text-subtext">
          先统一主称呼，再补别名和启用状态。术语页最适合处理那些会在正文里反复出现、但最容易前后叫法飘掉的名称。
        </div>
        <div className="review-track-grid">
          <div className="review-track-card is-emphasis">
            <div className="review-track-label">先补什么</div>
            <div className="review-track-value">主称呼</div>
            <div className="review-track-copy">优先统一角色称谓、组织名、地点名和世界观专有名词。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">什么时候重建</div>
            <div className="review-track-value">写完一批新内容后</div>
            <div className="review-track-copy">导入了资料或刚写完多个章节时，再跑自动重建更能补到漏项。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">写完后去哪</div>
            <div className="review-track-value">写作或通读</div>
            <div className="review-track-copy">术语稳定后，回正文继续写；如果担心旧章节叫法不一，再去通读或细读复查。</div>
          </div>
        </div>
      </section>

      <section className="author-workbench-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="author-workbench-kicker">术语工作台</div>
            <div className="mt-2 text-sm leading-7 text-subtext">
              左侧先筛选和浏览术语，右侧再统一编辑称呼、别名和启用状态。自动术语也可以在这里手工修正。
            </div>
          </div>
          <div className="text-xs text-subtext">建议优先统一主称呼，再补别名。</div>
        </div>

        <div className="dossier-grid mt-4">
          <div className="dossier-list-shell">
            <div className="author-workbench-panel">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">搜索术语或别名</span>
                  <input
                    className="input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void loadTerms();
                      }
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    className="checkbox"
                    checked={includeDisabled}
                    onChange={(event) => setIncludeDisabled(event.target.checked)}
                    type="checkbox"
                  />
                  包含已停用
                </label>
                <button className="btn btn-secondary" disabled={loading} onClick={() => void loadTerms()} type="button">
                  搜索
                </button>
              </div>

              <FeedbackDisclosure
                className="dossier-side-note"
                summaryClassName="px-0 py-0 text-sm text-ink"
                bodyClassName="pt-3"
                title="高级：自动补术语"
              >
                <div className="mt-3 grid gap-3">
                  <div className="text-xs leading-6 text-subtext">
                    当你刚导入了新资料、写完一批章节，或者觉得已有术语漏得比较多时，可以用这里重新提取候选术语，再回来逐条校正。
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      className="checkbox"
                      checked={rebuildConfig.includeChapters}
                      onChange={(event) =>
                        setRebuildConfig((prev) => ({ ...prev, includeChapters: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    包含章节
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      className="checkbox"
                      checked={rebuildConfig.includeImports}
                      onChange={(event) =>
                        setRebuildConfig((prev) => ({ ...prev, includeImports: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    包含导入文档
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-subtext">每个来源最多提取术语数</span>
                    <input
                      className="input"
                      min={1}
                      max={200}
                      type="number"
                      value={rebuildConfig.maxTermsPerSource}
                      onChange={(event) => {
                        const next = Number.parseInt(event.currentTarget.value, 10);
                        setRebuildConfig((prev) => ({
                          ...prev,
                          maxTermsPerSource: Number.isFinite(next) ? Math.max(1, Math.min(next, 200)) : 60,
                        }));
                      }}
                    />
                  </label>
                  <div className="flex justify-end">
                    <button className="btn btn-secondary" disabled={rebuilding} onClick={() => void runRebuild()} type="button">
                      {rebuilding ? "重建中…" : "执行重建"}
                    </button>
                  </div>
                </div>
              </FeedbackDisclosure>
            </div>

            <div className="author-workbench-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="author-workbench-kicker">术语书架</div>
                  <div className="author-workbench-copy">先确认当前叫法，再决定是修改现有术语还是新增一条手工术语。</div>
                </div>
                <div className="dossier-chip-row mt-0">
                  <span className="manuscript-chip">{searchStateLabel}</span>
                  <span className="manuscript-chip">{includeDisabled ? "包含已停用" : "默认隐藏已停用"}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
              {loading ? <div className="text-xs text-subtext">加载中…</div> : null}
              {!loading && terms.length === 0 ? (
                <div className="dossier-empty text-sm text-subtext">
                  当前没有匹配的术语。可以直接在右侧创建一个新术语，或执行自动重建。
                </div>
              ) : null}
              {terms.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    className={active ? "dossier-card is-active" : "dossier-card"}
                    onClick={() => selectTerm(item)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="dossier-card-title truncate">{item.term}</div>
                        <div className="mt-1 text-xs text-subtext">
                          {humanizeOrigin(item.origin)} · {item.enabled === 1 ? "启用中" : "已停用"}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-subtext">{item.aliases.length} 个别名</div>
                    </div>
                    {item.aliases.length > 0 ? (
                      <div className="dossier-card-copy text-xs">别名：{item.aliases.join("、")}</div>
                    ) : null}
                    {item.sources.length > 0 ? (
                      <div className="dossier-chip-row">
                        {item.sources.slice(0, 4).map((source, index) => (
                          <span key={`${source.source_type}:${source.source_id}:${index}`} className="manuscript-chip">
                            {humanizeSourceType(source.source_type)}
                            {source.label ? ` · ${source.label}` : ""}
                          </span>
                        ))}
                        {item.sources.length > 4 ? <span>+{item.sources.length - 4}</span> : null}
                      </div>
                    ) : null}
                    <div className="mt-2 text-[11px] text-subtext">最近更新：{item.updated_at ?? "未知"}</div>
                  </button>
                );
              })}
              </div>
            </div>
          </div>

          <div className="author-workbench-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="author-workbench-kicker">{selectedTerm ? "术语编辑台" : "新建术语条目"}</div>
                <div className="mt-2 text-sm leading-7 text-subtext">
                  {selectedTerm
                    ? `来源：${humanizeOrigin(selectedTerm.origin)}。建议先确认主称呼，再补别名和启用状态。`
                    : "手工术语会被长期保留；自动提取的术语也可以在这里改成你真正想保留的叫法。"}
                </div>
              </div>
              {selectedTerm ? (
                <button
                  className="btn btn-ghost text-accent hover:bg-accent/10"
                  disabled={deleting}
                  onClick={() => void removeTerm()}
                  type="button"
                >
                  {deleting ? "删除中…" : "删除"}
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-subtext">术语</span>
                <input
                  className="input"
                  value={form.term}
                  onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-subtext">别名（逗号或换行分隔）</span>
                <textarea
                  className="textarea atelier-content min-h-[140px]"
                  value={form.aliasesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, aliasesText: event.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                  type="checkbox"
                />
                启用该术语
              </label>
            </div>

            {selectedTerm ? (
              <div className="dossier-side-note mt-4 grid gap-2 text-xs text-subtext">
                <div>更新时间：{selectedTerm.updated_at ?? "unknown"}</div>
                <div>来源数：{selectedTerm.sources.length}</div>
                {selectedTerm.sources.length > 0 ? (
                  <div className="grid gap-1">
                    {selectedTerm.sources.map((source, index) => (
                      <div key={`${source.source_type}:${source.source_id}:${index}`}>
                        {humanizeSourceType(source.source_type)} · {source.label || source.source_id}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="btn btn-secondary" onClick={startCreate} type="button">
                清空表单
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={() => void saveTerm()} type="button">
                {saving ? "保存中…" : selectedTerm ? "保存修改" : "创建术语"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </ToolContent>
  );
}
