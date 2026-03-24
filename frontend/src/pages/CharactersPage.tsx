import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { WizardNextBar } from "../components/atelier/WizardNextBar";
import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { FeedbackEmptyState, FeedbackStateCard } from "../components/ui/Feedback";
import { Drawer } from "../components/ui/Drawer";
import { useConfirm } from "../components/ui/confirm";
import { useToast } from "../components/ui/toast";
import { useAutoSave } from "../hooks/useAutoSave";
import { useProjectData } from "../hooks/useProjectData";
import { useWizardProgress } from "../hooks/useWizardProgress";
import { copyText } from "../lib/copyText";
import { ApiError, apiJson } from "../services/apiClient";
import { markWizardProjectChanged } from "../services/wizard";
import type { Character } from "../types";

type CharacterForm = {
  name: string;
  role: string;
  profile: string;
  notes: string;
};

export function CharactersPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const wizard = useWizardProgress(projectId);
  const refreshWizard = wizard.refresh;
  const bumpWizardLocal = wizard.bumpLocal;

  const [loadError, setLoadError] = useState<null | { message: string; code: string; requestId?: string }>(null);

  const charactersQuery = useProjectData<Character[]>(projectId, async (id) => {
    try {
      const res = await apiJson<{ characters: Character[] }>(`/api/projects/${id}/characters`);
      setLoadError(null);
      return res.data.characters;
    } catch (e) {
      if (e instanceof ApiError) {
        setLoadError({ message: e.message, code: e.code, requestId: e.requestId });
      } else {
        setLoadError({ message: "请求失败", code: "UNKNOWN_ERROR" });
      }
      throw e;
    }
  });
  const characters = useMemo(() => charactersQuery.data ?? [], [charactersQuery.data]);
  const loading = charactersQuery.loading;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const queuedSaveRef = useRef<null | { silent: boolean; close: boolean; snapshot?: CharacterForm }>(null);
  const wizardRefreshTimerRef = useRef<number | null>(null);
  const [baseline, setBaseline] = useState<CharacterForm | null>(null);
  const [form, setForm] = useState<CharacterForm>({ name: "", role: "", profile: "", notes: "" });
  const [searchText, setSearchText] = useState("");

  const filteredCharacters = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter((c) => {
      const name = String(c.name ?? "").toLowerCase();
      const role = String(c.role ?? "").toLowerCase();
      return name.includes(q) || role.includes(q);
    });
  }, [characters, searchText]);

  const dirty = useMemo(() => {
    if (!baseline) return false;
    return (
      form.name !== baseline.name ||
      form.role !== baseline.role ||
      form.profile !== baseline.profile ||
      form.notes !== baseline.notes
    );
  }, [baseline, form]);
  const profiledCount = useMemo(
    () => characters.filter((character) => String(character.profile ?? "").trim()).length,
    [characters],
  );
  const drawerStateLabel = drawerOpen
    ? editing
      ? `正在编辑：${editing.name || "未命名角色"}`
      : "正在创建新角色"
    : "当前未打开角色编辑台";
  const searchStateLabel = searchText.trim()
    ? `筛选后显示 ${filteredCharacters.length}/${characters.length} 位角色`
    : `当前显示全部 ${characters.length} 位角色`;

  const load = charactersQuery.refresh;
  const setCharacters = charactersQuery.setData;

  useEffect(() => {
    return () => {
      if (wizardRefreshTimerRef.current !== null) window.clearTimeout(wizardRefreshTimerRef.current);
    };
  }, []);

  const openNew = () => {
    setEditing(null);
    const next = { name: "", role: "", profile: "", notes: "" };
    setForm(next);
    setBaseline(next);
    setDrawerOpen(true);
  };

  const openEdit = (c: Character) => {
    setEditing(c);
    const next = {
      name: c.name ?? "",
      role: c.role ?? "",
      profile: c.profile ?? "",
      notes: c.notes ?? "",
    };
    setForm(next);
    setBaseline(next);
    setDrawerOpen(true);
  };

  const closeDrawer = async () => {
    if (dirty) {
      const ok = await confirm.confirm({
        title: "放弃未保存修改？",
        description: "关闭后未保存内容会丢失。你可以先点击“保存”再关闭。",
        confirmText: "放弃",
        cancelText: "取消",
        danger: true,
      });
      if (!ok) return;
    }
    setDrawerOpen(false);
  };

  const saveCharacter = useCallback(
    async (opts?: { silent?: boolean; close?: boolean; snapshot?: CharacterForm }) => {
      if (!projectId) return false;
      const silent = Boolean(opts?.silent);
      const close = Boolean(opts?.close);
      const snapshot = opts?.snapshot ?? form;
      if (!snapshot.name.trim()) return false;

      if (savingRef.current) {
        queuedSaveRef.current = { silent, close, snapshot };
        return false;
      }

      const scheduleWizardRefresh = () => {
        if (wizardRefreshTimerRef.current !== null) window.clearTimeout(wizardRefreshTimerRef.current);
        wizardRefreshTimerRef.current = window.setTimeout(() => void refreshWizard(), 1200);
      };

      savingRef.current = true;
      setSaving(true);
      try {
        const res = !editing
          ? await apiJson<{ character: Character }>(`/api/projects/${projectId}/characters`, {
              method: "POST",
              body: JSON.stringify({
                name: snapshot.name.trim(),
                role: snapshot.role.trim() || null,
                profile: snapshot.profile || null,
                notes: snapshot.notes || null,
              }),
            })
          : await apiJson<{ character: Character }>(`/api/characters/${editing.id}`, {
              method: "PUT",
              body: JSON.stringify({
                name: snapshot.name.trim(),
                role: snapshot.role.trim() || null,
                profile: snapshot.profile || null,
                notes: snapshot.notes || null,
              }),
            });

        const saved = res.data.character;
        setEditing(saved);
        setCharacters((prev) => {
          const list = prev ?? [];
          const idx = list.findIndex((c) => c.id === saved.id);
          if (idx >= 0) return list.map((c) => (c.id === saved.id ? saved : c));
          return [saved, ...list];
        });

        const nextBaseline: CharacterForm = {
          name: saved.name ?? "",
          role: saved.role ?? "",
          profile: saved.profile ?? "",
          notes: saved.notes ?? "",
        };
        setBaseline(nextBaseline);
        setForm((prev) => {
          if (
            prev.name === snapshot.name &&
            prev.role === snapshot.role &&
            prev.profile === snapshot.profile &&
            prev.notes === snapshot.notes
          ) {
            return nextBaseline;
          }
          return prev;
        });

        markWizardProjectChanged(projectId);
        bumpWizardLocal();
        if (silent) scheduleWizardRefresh();
        else await refreshWizard();
        if (!silent) toast.toastSuccess("已保存");
        if (close) setDrawerOpen(false);
        return true;
      } catch (err) {
        const apiErr = err as ApiError;
        toast.toastError(`${apiErr.message} (${apiErr.code})`, apiErr.requestId);
        return false;
      } finally {
        setSaving(false);
        savingRef.current = false;
        if (queuedSaveRef.current) {
          const queued = queuedSaveRef.current;
          queuedSaveRef.current = null;
          void saveCharacter({ silent: queued.silent, close: queued.close, snapshot: queued.snapshot });
        }
      }
    },
    [bumpWizardLocal, editing, form, projectId, refreshWizard, setCharacters, toast],
  );

  useAutoSave({
    enabled: drawerOpen && Boolean(projectId) && Boolean(baseline),
    dirty,
    delayMs: 900,
    getSnapshot: () => ({ ...form }),
    onSave: async (snapshot) => {
      await saveCharacter({ silent: true, close: false, snapshot });
    },
    deps: [editing?.id ?? "", form.name, form.role, form.profile, form.notes],
  });

  return (
    <ToolContent className="grid gap-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <EditorialHero
        kicker="角色卷宗"
        title="先把关键人物立起来，再让后续大纲和写作更稳定地围着他们运转。"
        subtitle="角色页适合沉淀人物定位、动机、关系和待补信息。这里的信息会在后续生成、检索和连续性检查中反复被拿来参考。"
        items={[
          { key: "count", label: "角色数量", value: `${characters.length} 位` },
          { key: "profiled", label: "已写人物档案", value: `${profiledCount} 位` },
          { key: "state", label: "当前状态", value: drawerStateLabel },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={openNew} type="button">
            新增角色
          </button>
          <button className="btn btn-secondary" onClick={() => void load()} type="button">
            刷新列表
          </button>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{searchStateLabel}</span>
          <span className="manuscript-chip">{drawerOpen ? "编辑台已打开" : "浏览模式"}</span>
          <span className="manuscript-chip">建议先补主角、反派和关键同伴</span>
        </div>
      </section>

      <section className="review-track-panel">
        <div className="editorial-kicker">怎么建立角色卷宗</div>
        <div className="mt-3 max-w-3xl text-sm leading-7 text-subtext">
          先把关键人物立起来，再补他们之间的纠缠、动机和待定信息。人物档案不是设定仓库，而是帮助你在后续写作里持续记住“这个人是谁、想要什么”。
        </div>
        <div className="review-track-grid">
          <div className="review-track-card is-emphasis">
            <div className="review-track-label">先补什么</div>
            <div className="review-track-value">主角与关键关系</div>
            <div className="review-track-copy">优先写主角、反派、导师和关键同伴，先让核心关系网稳定下来。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">建议怎么写</div>
            <div className="review-track-value">定位 + 档案 + 备注</div>
            <div className="review-track-copy">定位负责快速筛选，档案负责长期一致性，备注用来装待补信息和时间线提醒。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">写完后去哪</div>
            <div className="review-track-value">大纲或写作</div>
            <div className="review-track-copy">角色关系稳定后，通常回到大纲补桥段，或直接去写作页推进正文。</div>
          </div>
        </div>
      </section>

      <section className="author-workbench-panel">
        <div className="dossier-grid">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-subtext">搜索角色（姓名 / 定位）</span>
              <input
                className="input"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="例如：主角、导师、某个角色名"
                aria-label="角色搜索"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm text-subtext">
              <span>{searchStateLabel}</span>
              {searchText.trim() ? (
                <button className="btn btn-ghost px-3 py-2 text-xs" onClick={() => setSearchText("")} type="button">
                  清空搜索
                </button>
              ) : null}
            </div>
          </div>

          <div className="dossier-side-note text-sm text-subtext">
            这页最适合写“角色是谁、想要什么、和谁纠缠、哪里还没定”。人物档案写得越清楚，后续章节生成越不容易跑偏。
          </div>
        </div>
      </section>

      {loading && charactersQuery.data === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="panel p-6">
              <div className="skeleton h-5 w-24" />
              <div className="mt-3 grid gap-2">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && charactersQuery.data === null && loadError ? (
        <FeedbackStateCard
          tone="danger"
          title="加载失败"
          description={`${loadError.message} (${loadError.code})`}
          meta={
            loadError.requestId ? (
              <>
                <span>request_id: {loadError.requestId}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void copyText(loadError.requestId!, { title: "复制 request_id" })}
                  type="button"
                >
                  复制 request_id
                </button>
              </>
            ) : null
          }
          actions={
            <button className="btn btn-primary" onClick={() => void load()} type="button">
              重试
            </button>
          }
        />
      ) : null}

      {!loading && !loadError && characters.length === 0 ? (
        <FeedbackEmptyState
          kicker="当前状态"
          title="角色库还是空的"
          description="建议先创建 3-5 个关键角色，例如主角、反派、关键同伴或导师，再进入大纲和写作。这样故事里的关系网络会更早稳定下来。"
          actions={
            <button className="btn btn-primary" onClick={openNew} type="button">
              新增角色
            </button>
          }
        />
      ) : null}

      {!loading && !loadError && characters.length > 0 && filteredCharacters.length === 0 ? (
        <FeedbackEmptyState
          kicker="搜索结果"
          title="没有匹配的角色"
          description="尝试修改搜索关键词，或者清空搜索后重新浏览全部角色。"
          actions={
            <button className="btn btn-secondary" onClick={() => setSearchText("")} type="button">
              清空搜索
            </button>
          }
        />
      ) : null}

      {filteredCharacters.length > 0 ? (
        <section className="author-workbench-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="author-workbench-kicker">角色书架</div>
              <div className="author-workbench-copy">先浏览角色定位，再打开单条档案继续补人物动机、关系和待定信息。</div>
            </div>
            <div className="dossier-chip-row mt-0">
              <span className="manuscript-chip">{searchStateLabel}</span>
              <span className="manuscript-chip">{profiledCount} 位已写档案</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCharacters.map((c) => (
              <div
                key={c.id}
                className="dossier-card"
                onClick={() => openEdit(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEdit(c);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="dossier-card-title truncate">{c.name}</div>
                    <div className="mt-1 text-xs text-subtext">{c.role ?? "未填写角色定位"}</div>
                  </div>
                  <button
                    className="btn btn-danger-soft px-3 py-2 text-xs"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm.confirm({
                        title: "删除角色？",
                        description: "该角色将从项目中移除。",
                        confirmText: "删除",
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        await apiJson<Record<string, never>>(`/api/characters/${c.id}`, { method: "DELETE" });
                        if (projectId) markWizardProjectChanged(projectId);
                        bumpWizardLocal();
                        toast.toastSuccess("已删除");
                        await load();
                        await refreshWizard();
                      } catch (err) {
                        const apiErr = err as ApiError;
                        toast.toastError(`${apiErr.message} (${apiErr.code})`, apiErr.requestId);
                      }
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
                <div className="dossier-chip-row">
                  <span className="manuscript-chip">{c.profile?.trim() ? "已写人物档案" : "缺少人物档案"}</span>
                  <span className="manuscript-chip">{c.notes?.trim() ? "有补充备注" : "暂无补充备注"}</span>
                </div>
                {c.profile ? <div className="dossier-card-copy line-clamp-4">{c.profile}</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={() => void closeDrawer()}
        panelClassName="h-full w-full max-w-xl border-l border-border bg-canvas p-6 shadow-sm"
        ariaLabel={editing ? "编辑角色" : "新增角色"}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-content text-2xl text-ink">{editing ? "人物档案编辑台" : "新建人物档案"}</div>
            <div className="mt-1 text-xs text-subtext">
              {saving ? "保存中..." : dirty ? "有未保存修改" : "当前内容已同步"}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => void closeDrawer()} type="button">
              关闭
            </button>
            <button
              className="btn btn-primary"
              disabled={saving || !form.name.trim()}
              onClick={() => void saveCharacter({ silent: false, close: true })}
              type="button"
            >
              保存并关闭
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1">
            <span className="text-xs text-subtext">姓名</span>
            <input
              className="input"
              name="name"
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              placeholder="例如：林默"
            />
            <div className="text-[11px] text-subtext">建议使用读者容易记住的短名；后续会用于检索与生成。</div>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">角色定位</span>
            <input
              className="input"
              name="role"
              value={form.role}
              onChange={(e) => setForm((v) => ({ ...v, role: e.target.value }))}
              placeholder="例如：主角 / 反派 / 关键 NPC"
            />
            <div className="text-[11px] text-subtext">用于快速筛选；可以写“主角/反派/导师/同伴/路人”等。</div>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">人物档案</span>
            <textarea
              className="textarea atelier-content"
              name="profile"
              rows={8}
              value={form.profile}
              onChange={(e) => setForm((v) => ({ ...v, profile: e.target.value }))}
              placeholder="外貌、性格、动机、关系、口癖、成长线…"
            />
            <div className="text-[11px] text-subtext">用于生成时的角色一致性；可按条目写，更易复用。</div>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">备注</span>
            <textarea
              className="textarea atelier-content"
              name="notes"
              rows={6}
              value={form.notes}
              onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
              placeholder="出场章节、禁忌、时间线、待补信息…"
            />
            <div className="text-[11px] text-subtext">记录未定稿/待补充信息，避免混进人物档案造成误导。</div>
          </label>
        </div>
      </Drawer>

      <WizardNextBar
        projectId={projectId}
        currentStep="characters"
        progress={wizard.progress}
        loading={wizard.loading}
        primaryAction={
          wizard.progress.nextStep?.key === "characters" ? { label: "本页：新增角色", onClick: openNew } : undefined
        }
      />
    </ToolContent>
  );
}
