import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Badge } from "../../components/ui/Badge";
import { FeedbackCallout, FeedbackEmptyState } from "../../components/ui/Feedback";
import { containsPinyinMatch, preloadPinyinSupport, shouldPreloadPinyinSupport, tokenizeSearch } from "../../lib/pinyin";
import type { KnowledgeBase, VectorRagResult } from "./types";

function highlightText(text: string, tokens: string[]): ReactNode {
  const raw = String(text ?? "");
  if (!raw) return raw;
  if (!tokens.length) return raw;

  const lower = raw.toLowerCase();
  const active = tokens.map((t) => String(t || "").toLowerCase()).filter((t) => t.length > 0 && lower.includes(t));
  if (!active.length) return raw;

  const uniq = [...new Set(active)].sort((a, b) => b.length - a.length);
  const out: ReactNode[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    let bestIdx = -1;
    let bestToken = "";
    for (const t of uniq) {
      const idx = lower.indexOf(t, cursor);
      if (idx < 0) continue;
      if (bestIdx < 0 || idx < bestIdx || (idx === bestIdx && t.length > bestToken.length)) {
        bestIdx = idx;
        bestToken = t;
      }
    }
    if (bestIdx < 0) {
      out.push(raw.slice(cursor));
      break;
    }
    if (bestIdx > cursor) out.push(raw.slice(cursor, bestIdx));
    const seg = raw.slice(bestIdx, bestIdx + bestToken.length);
    out.push(
      <mark key={`${bestIdx}:${bestToken}:${cursor}`} className="rounded bg-warning/20 px-0.5 text-ink">
        {seg}
      </mark>,
    );
    cursor = bestIdx + bestToken.length;
  }

  return <>{out}</>;
}

export function RagKnowledgeBasePanel(props: {
  projectId: string | undefined;
  kbLoading: boolean;
  kbOrderDirty: boolean;
  loadKbs: () => Promise<void>;
  saveKbOrder: () => Promise<void>;
  selectedKbIds: string[];
  queryResult: VectorRagResult | null;
  kbs: KnowledgeBase[];
  kbDraftById: Record<string, Pick<KnowledgeBase, "name" | "enabled" | "weight">>;
  kbDirtyById: Record<string, boolean>;
  kbDragId: string | null;
  setKbDragId: (id: string | null) => void;
  moveKb: (fromKbId: string, toKbId: string) => void;
  updateKbDraft: (kbId: string, patch: Partial<Pick<KnowledgeBase, "name" | "enabled" | "weight">>) => void;
  kbSaveLoadingId: string | null;
  kbDeleteLoadingId: string | null;
  saveKb: (kbId: string) => Promise<void>;
  deleteKb: (kbId: string) => Promise<void>;
  kbCreateName: string;
  setKbCreateName: (name: string) => void;
  kbCreateLoading: boolean;
  createKb: () => Promise<void>;
  toggleKbSelected: (kbId: string) => void;
}) {
  const {
    createKb,
    deleteKb,
    kbCreateLoading,
    kbCreateName,
    kbDeleteLoadingId,
    kbDirtyById,
    kbDragId,
    kbDraftById,
    kbLoading,
    kbOrderDirty,
    kbSaveLoadingId,
    kbs,
    loadKbs,
    moveKb,
    projectId,
    queryResult,
    saveKb,
    saveKbOrder,
    selectedKbIds,
    setKbCreateName,
    setKbDragId,
    toggleKbSelected,
    updateKbDraft,
  } = props;

  const [kbSearchText, setKbSearchText] = useState("");
  const [pinyinVersion, setPinyinVersion] = useState(0);
  const kbTokens = useMemo(() => tokenizeSearch(kbSearchText), [kbSearchText]);

  useEffect(() => {
    if (
      !shouldPreloadPinyinSupport(
        kbTokens,
        kbs.map((kb) => {
          const draft = kbDraftById[kb.kb_id] ?? { name: kb.name };
          return `${kb.kb_id} ${draft.name ?? ""}`;
        }),
      )
    ) {
      return;
    }
    let cancelled = false;
    void preloadPinyinSupport().then((loaded) => {
      if (!cancelled && loaded) {
        setPinyinVersion((prev) => prev + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [kbDraftById, kbTokens, kbs]);

  const kbSearchMeta = useMemo(() => {
    const tokens = kbTokens;
    const metaById = new Map<string, { pinyinHit: boolean }>();
    if (!tokens.length) return { list: kbs, metaById, tokens };

    const list = kbs.filter((kb) => {
      const draft = kbDraftById[kb.kb_id] ?? { name: kb.name, enabled: kb.enabled, weight: kb.weight };
      const haystackId = String(kb.kb_id ?? "").toLowerCase();
      const haystackName = String(draft.name ?? "").toLowerCase();
      const combined = `${kb.kb_id} ${draft.name ?? ""}`;
      let pinyinHit = false;

      const ok = tokens.every((t) => {
        if (haystackId.includes(t)) return true;
        if (haystackName.includes(t)) return true;
        const m = containsPinyinMatch(combined, t);
        if (!m.matched) return false;
        pinyinHit = true;
        return true;
      });
      if (ok) metaById.set(kb.kb_id, { pinyinHit });
      return ok;
    });

    return { list, metaById, tokens };
  }, [kbDraftById, kbTokens, kbs, pinyinVersion]);

  const filteredKbs = kbSearchMeta.list;
  const enabledCount = kbs.filter((kb) => Boolean((kbDraftById[kb.kb_id] ?? kb).enabled)).length;
  const dirtyCount = kbs.filter((kb) => Boolean(kbDirtyById[kb.kb_id])).length;
  const querySelectedCount = queryResult?.kbs?.selected?.length ?? 0;
  const nextStepText = !kbs.length
    ? "先创建第一份资料库，再决定哪些资料要参与检索。"
    : selectedKbIds.length === 0
      ? "当前没有手动指定查询资料库，系统会默认使用已启用的资料库。"
      : "先确认哪些资料库参与本次查询，再决定是否调整顺序、权重或启用状态。";

  return (
    <div
      className="mt-6 rounded-atelier border border-border bg-surface p-4"
      role="region"
      aria-label="知识库 (rag_kb_section)"
    >
      <div className="studio-cluster-header">
        <div>
          <div className="text-sm font-medium text-ink">资料编排台</div>
          <div className="mt-1 text-xs leading-6 text-subtext">{nextStepText}</div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            disabled={!projectId || kbLoading}
            onClick={() => void loadKbs()}
            type="button"
          >
            {kbLoading ? "加载中…" : "刷新资料库"}
          </button>
          <button
            className="btn btn-primary"
            disabled={!projectId || kbLoading || !kbOrderDirty}
            onClick={() => void saveKbOrder()}
            type="button"
          >
            保存排序
          </button>
        </div>
      </div>

      <div className="studio-overview-grid lg:grid-cols-3">
        <div className="studio-overview-card is-emphasis">
          <div className="studio-overview-label">资料库范围</div>
          <div className="studio-overview-value">{kbs.length} 份资料库</div>
          <div className="studio-overview-copy">其中已启用 {enabledCount} 份。先确认哪些资料库值得长期参与检索，再处理顺序和权重。</div>
        </div>
        <div className="studio-overview-card">
          <div className="studio-overview-label">查询参与</div>
          <div className="studio-overview-value">
            手动选中 {selectedKbIds.length} / 实际使用 {querySelectedCount || 0}
          </div>
          <div className="studio-overview-copy">“手动选中”是这次准备参与查询的范围，“实际使用”来自上次真实查询结果。</div>
        </div>
        <div className="studio-overview-card">
          <div className="studio-overview-label">待保存修改</div>
          <div className="studio-overview-value">{dirtyCount} 项字段修改</div>
          <div className="studio-overview-copy">{kbOrderDirty ? "资料库排序也有未保存变更。" : "当前排序没有未保存变更。"}</div>
        </div>
      </div>

      <FeedbackCallout className="mt-4" title="使用建议">
        先决定哪些资料库要参与查询，再调顺序和权重。顺序更像“优先审阅顺序”，权重更像“让这份资料更容易被命中”。
      </FeedbackCallout>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs text-subtext">查找资料库（支持拼音/首字母）</span>
          <input
            className="input"
            value={kbSearchText}
            onChange={(e) => setKbSearchText(e.target.value)}
            aria-label="rag_kb_search"
            placeholder="例如：主线设定 / zhuxian / zx"
          />
          <div className="text-[11px] text-subtext">可匹配资料库 ID 和名称；拼音匹配失败时会自动回退为普通包含匹配。</div>
        </label>
        <div className="flex items-end justify-end text-xs text-subtext">当前显示 {filteredKbs.length}/{kbs.length} 份资料库</div>
      </div>

      <div className="mt-3 grid gap-2">
        {kbs.length ? (
          filteredKbs.length ? (
            filteredKbs.map((kb) => {
              const draft = kbDraftById[kb.kb_id] ?? { name: kb.name, enabled: kb.enabled, weight: kb.weight };
              const dirty = Boolean(kbDirtyById[kb.kb_id]);
              const perKb = queryResult?.kbs?.per_kb?.[kb.kb_id];
              const counts = perKb?.counts;
              const isDragging = kbDragId === kb.kb_id;
              const meta = kbSearchMeta.metaById.get(kb.kb_id) ?? { pinyinHit: false };
              const querySelected = Boolean(queryResult?.kbs?.selected?.includes(kb.kb_id));

              return (
                <div
                  key={kb.kb_id}
                  className={
                    isDragging
                      ? "rounded-atelier border border-border bg-canvas p-3 opacity-80"
                      : "rounded-atelier border border-border bg-canvas p-3"
                  }
                  draggable
                  onDragStart={() => setKbDragId(kb.kb_id)}
                  onDragEnd={() => setKbDragId(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={() => {
                    if (!kbDragId) return;
                    moveKb(kbDragId, kb.kb_id);
                    setKbDragId(null);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-ink">
                          {highlightText(draft.name || kb.name || kb.kb_id, kbSearchMeta.tokens)}
                        </div>
                        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-subtext">
                          {highlightText(kb.kb_id, kbSearchMeta.tokens)}
                        </span>
                        {meta.pinyinHit ? (
                          <span className="rounded border border-border bg-surface px-1 py-0.5 text-[10px] text-subtext">
                            拼音匹配
                          </span>
                        ) : null}
                        {selectedKbIds.includes(kb.kb_id) ? (
                          <Badge tone="accent">本次查询已选中</Badge>
                        ) : null}
                        {querySelected ? (
                          <Badge tone="info">上次查询实际参与</Badge>
                        ) : null}
                        {dirty ? (
                          <Badge tone="warning">有未保存修改</Badge>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-subtext">
                        <div>排序位次：{kb.order}</div>
                        <div>启用状态：{Boolean(draft.enabled) ? "已启用" : "已停用"}</div>
                        <div>当前权重：{String(draft.weight)}</div>
                        {counts ? (
                          <div>
                            上次查询命中：{counts.candidates_total} 候选 / {counts.final_selected} 最终片段
                          </div>
                        ) : (
                          <div>尚未产生查询命中统计</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-primary"
                        disabled={!projectId || kbSaveLoadingId === kb.kb_id || !dirty}
                        onClick={() => void saveKb(kb.kb_id)}
                        aria-label={`保存 KB ${kb.kb_id}`}
                        type="button"
                      >
                        {kbSaveLoadingId === kb.kb_id ? "保存中…" : dirty ? "保存" : "已保存"}
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={
                          !projectId ||
                          kbDeleteLoadingId === kb.kb_id ||
                          Boolean(draft.enabled) ||
                          kb.kb_id === "default"
                        }
                        onClick={() => void deleteKb(kb.kb_id)}
                        aria-label={`删除 KB ${kb.kb_id}`}
                        type="button"
                      >
                        {kbDeleteLoadingId === kb.kb_id ? "删除中…" : "删除"}
                      </button>
                    </div>
                  </div>

                  <div className="studio-overview-grid mt-4 lg:grid-cols-3">
                    <div className="studio-overview-card is-emphasis">
                      <div className="studio-overview-label">排序与启用</div>
                      <div className="studio-overview-value">位次 {kb.order} · {Boolean(draft.enabled) ? "已启用" : "已停用"}</div>
                      <div className="studio-overview-copy">顺序决定优先审阅次序，启用状态决定这份资料库是否参与默认查询。</div>
                    </div>
                    <div className="studio-overview-card">
                      <div className="studio-overview-label">查询命中</div>
                      <div className="studio-overview-value">
                        {counts ? `${counts.candidates_total} 候选 / ${counts.final_selected} 最终片段` : "暂无查询统计"}
                      </div>
                      <div className="studio-overview-copy">
                        {querySelected ? "这份资料库实际参与了上次查询。" : "上次查询未实际使用这份资料库。"}
                      </div>
                    </div>
                    <div className="studio-overview-card">
                      <div className="studio-overview-label">当前控制</div>
                      <div className="studio-overview-value">权重 {String(draft.weight)}</div>
                      <div className="studio-overview-copy">
                        {selectedKbIds.includes(kb.kb_id) ? "本次查询已手动选中。" : "当前未手动选中，将按默认启用状态参与。"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="grid gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs text-subtext">资料库名称</span>
                        <input
                          className="input"
                          value={draft.name}
                          onChange={(e) => updateKbDraft(kb.kb_id, { name: e.target.value })}
                          aria-label={`KB 名称 ${kb.kb_id}`}
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            className="checkbox"
                            type="checkbox"
                            checked={selectedKbIds.includes(kb.kb_id)}
                            onChange={() => toggleKbSelected(kb.kb_id)}
                            aria-label={`选择 KB ${kb.kb_id}`}
                          />
                          参与本次查询
                        </label>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            className="checkbox"
                            type="checkbox"
                            checked={Boolean(draft.enabled)}
                            onChange={(e) => updateKbDraft(kb.kb_id, { enabled: e.target.checked })}
                            aria-label={`启用 KB ${kb.kb_id}`}
                          />
                          启用这份资料库
                        </label>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs text-subtext">参考权重</span>
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={String(draft.weight ?? 1)}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (!Number.isFinite(next)) return;
                            updateKbDraft(kb.kb_id, { weight: next });
                          }}
                          aria-label={`KB 权重 ${kb.kb_id}`}
                        />
                      </label>
                      <div className="text-[11px] leading-5 text-subtext">权重越高，检索时越容易优先保留来自这份资料库的片段；如果只是临时参考，通常不需要把权重调得太高。</div>
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] leading-5 text-subtext">
                    操作建议：先选中真正参与本次查询的资料库，再处理启用状态和权重。只有在你确认结构已经稳定时，再去保存排序。
                  </div>
                </div>
              );
            })
          ) : (
            <FeedbackEmptyState
              variant="compact"
              className="rounded-atelier border border-dashed border-border bg-canvas px-4 py-5"
              title="没有找到匹配的资料库"
              description="可以试试用名称、ID 或拼音缩写搜索，或者先清空筛选看看完整列表。"
            />
          )
        ) : (
          <FeedbackEmptyState
            variant="compact"
            className="rounded-atelier border border-dashed border-border bg-canvas px-4 py-5"
            title="当前还没有资料库"
            description="系统通常会自动准备 default；如果当前项目结构更复杂，也可以在下方创建更适合的新资料库。"
          />
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <label className="grid gap-1 sm:col-span-3">
          <span className="text-xs text-subtext">新资料库名称</span>
          <input
            className="input"
            value={kbCreateName}
            onChange={(e) => setKbCreateName(e.target.value)}
            aria-label="kb_create_name"
            placeholder="例如：主线设定 / 角色采访 / 旧稿摘录"
          />
        </label>
        <div className="flex items-end">
          <button
            className="btn btn-primary w-full"
            disabled={!projectId || kbCreateLoading}
            onClick={() => void createKb()}
            aria-label="创建 KB (rag_kb_create)"
            type="button"
          >
            {kbCreateLoading ? "创建中…" : "创建资料库"}
          </button>
        </div>
      </div>
    </div>
  );
}
