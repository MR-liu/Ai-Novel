import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { FeedbackStateCard } from "../components/ui/Feedback";
import { Modal } from "../components/ui/Modal";
import { ProgressBar } from "../components/ui/ProgressBar";
import { useConfirm } from "../components/ui/confirm";
import { useToast } from "../components/ui/toast";
import { useProjects } from "../contexts/projects";
import { buildProjectHomePath, buildProjectWritePath } from "../lib/projectRoutes";
import { UI_COPY } from "../lib/uiCopy";
import { ApiError, apiJson } from "../services/apiClient";
import { computeWizardProgressFromSummary } from "../services/wizard";
import type { Project, ProjectSummaryItem } from "../types";
import { DASHBOARD_AUTHOR_FLOW, DASHBOARD_START_GUIDE, getLaunchPadSummary } from "./dashboardModels";

type CreateProjectForm = {
  name: string;
  genre: string;
  logline: string;
};

type WizardSummary = {
  percent: number;
  nextTitle: string | null;
  nextHref: string | null;
};

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "暂无更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function DashboardPage() {
  const { projects, loading, error, refresh } = useProjects();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateProjectForm>({ name: "", genre: "", logline: "" });

  const sorted = useMemo(() => [...projects].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [projects]);
  const recommendedProject = sorted[0] ?? null;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "夜深了";
    if (hour < 12) return "早上好";
    if (hour < 18) return "下午好";
    return "晚上好";
  }, []);

  const [wizardByProjectId, setWizardByProjectId] = useState<Record<string, WizardSummary>>({});
  const [wizardLoadingByProjectId, setWizardLoadingByProjectId] = useState<Record<string, boolean>>({});
  const recommendedWizard = recommendedProject ? wizardByProjectId[recommendedProject.id] : null;
  const recommendedWizardLoading = recommendedProject ? Boolean(wizardLoadingByProjectId[recommendedProject.id]) : false;
  const readyProjectCount = useMemo(
    () => Object.values(wizardByProjectId).filter((wizard) => wizard.percent >= 100).length,
    [wizardByProjectId],
  );
  const launchPadSummary = useMemo(
    () => getLaunchPadSummary(sorted.length, readyProjectCount),
    [readyProjectCount, sorted.length],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (sorted.length === 0) {
        setWizardByProjectId({});
        setWizardLoadingByProjectId({});
        return;
      }

      setWizardLoadingByProjectId(Object.fromEntries(sorted.map((p) => [p.id, true])));
      try {
        const res = await apiJson<{ items: ProjectSummaryItem[] }>(`/api/projects/summary`);
        if (cancelled) return;

        const summaryByProjectId = Object.fromEntries(res.data.items.map((it) => [it.project.id, it]));
        const nextWizardByProjectId: Record<string, WizardSummary> = {};
        for (const p of sorted) {
          const summary = summaryByProjectId[p.id];
          if (!summary) continue;
          const progress = computeWizardProgressFromSummary({
            project: summary.project,
            settings: summary.settings,
            characters_count: summary.characters_count,
            outline_content_md: summary.outline_content_md,
            chapters_total: summary.chapters_total,
            chapters_done: summary.chapters_done,
            llm_preset: summary.llm_preset,
            llm_profile_has_api_key: summary.llm_profile_has_api_key,
          });

          nextWizardByProjectId[p.id] = {
            percent: progress.percent,
            nextTitle: progress.nextStep?.title ?? null,
            nextHref: progress.nextStep?.href ?? null,
          };
        }
        setWizardByProjectId(nextWizardByProjectId);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setWizardLoadingByProjectId(Object.fromEntries(sorted.map((p) => [p.id, false])));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sorted]);

  const enterProject = useCallback(
    (p: Project) => {
      const wizard = wizardByProjectId[p.id];
      if (!wizard) {
        navigate(buildProjectHomePath(p.id, "setup"));
        return;
      }
      navigate(wizard.percent >= 100 ? buildProjectWritePath(p.id) : buildProjectHomePath(p.id, "setup"));
    },
    [navigate, wizardByProjectId],
  );

  const primaryCta = useMemo(() => {
    if (!recommendedProject) {
      return {
        label: "创建第一个项目",
        onClick: () => setCreateOpen(true),
      };
    }

    if (recommendedWizardLoading) {
      return {
        label: "读取项目状态...",
        onClick: () => undefined,
        disabled: true,
      };
    }

    if (recommendedWizard?.percent && recommendedWizard.percent >= 100) {
      return {
        label: "继续写作",
        onClick: () => navigate(buildProjectWritePath(recommendedProject.id)),
      };
    }

    if (recommendedWizard?.nextHref) {
      return {
        label: recommendedWizard.nextTitle ? `继续：${recommendedWizard.nextTitle}` : "继续开工",
        onClick: () => navigate(recommendedWizard.nextHref ?? ""),
      };
    }

    return {
      label: "打开最近项目",
      onClick: () => enterProject(recommendedProject),
    };
  }, [enterProject, navigate, recommendedProject, recommendedWizard, recommendedWizardLoading]);
  const recommendedUpdatedLabel = recommendedProject ? formatDateLabel(recommendedProject.updated_at) : "暂无最近项目";

  return (
    <div className="author-workbench-shell pb-16">
      <section className="author-workbench-hero">
        <div className="author-workbench-grid xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div className="min-w-0">
            <div className="author-workbench-kicker">作者启动台</div>
            <div className="author-workbench-title">{greeting}，把注意力放回你的故事，而不是放回工具本身。</div>
            <div className="author-workbench-copy">
              {recommendedProject
                ? `当前最适合继续的是「${recommendedProject.name}」。你可以直接续写，也可以先回到项目桌面确认今天最值得推进的那一步。`
                : "从创建第一个项目开始。项目建好后，这里会自动告诉你下一步最值得做什么。"}
            </div>
            <div className="author-workbench-chip-row">
              <span className="manuscript-chip">{launchPadSummary.projectLabel}</span>
              <span className="manuscript-chip">{launchPadSummary.readyLabel}</span>
              <span className="manuscript-chip">{launchPadSummary.shelfLabel}</span>
            </div>
            <div className="author-workbench-actions">
              <button className="btn btn-primary" disabled={primaryCta.disabled} onClick={primaryCta.onClick} type="button">
                {primaryCta.label}
              </button>
              <button className="btn btn-secondary" onClick={() => setCreateOpen(true)} type="button">
                新建项目
              </button>
            </div>
          </div>

          <div className="author-workbench-metric-grid">
            <div className="author-workbench-metric-card is-emphasis">
              <div className="author-workbench-metric-label">最近项目</div>
              <div className="author-workbench-metric-value">{recommendedProject ? recommendedProject.name : "尚无"}</div>
              <div className="author-workbench-metric-copy">{recommendedProject ? `更新于 ${recommendedUpdatedLabel}` : "创建第一部作品后，这里会开始显示最近继续的项目。"}</div>
            </div>
            <div className="author-workbench-metric-card">
              <div className="author-workbench-metric-label">书架数量</div>
              <div className="author-workbench-metric-value">{sorted.length}</div>
              <div className="author-workbench-metric-copy">按最近更新排序，方便你从最近一部作品接着写。</div>
            </div>
            <div className="author-workbench-metric-card">
              <div className="author-workbench-metric-label">可直接续写</div>
              <div className="author-workbench-metric-value">{readyProjectCount}</div>
              <div className="author-workbench-metric-copy">已经打通主链路、可以直接进入写作台继续推进的项目数量。</div>
            </div>
          </div>
        </div>
      </section>

      <div className="launchpad-feature-grid">
        <section className="author-workbench-panel is-emphasis">
          <div className="author-workbench-kicker">继续创作</div>
          {recommendedProject ? (
            <>
              <div className="author-workbench-title">{recommendedProject.name}</div>
              <div className="author-workbench-copy">
                {recommendedProject.logline?.trim() || "还没有一句话梗概。可以先把正文往前推，等主线更清楚后再回来补。"}
              </div>
              <div className="author-workbench-chip-row">
                <span className="manuscript-chip">{recommendedProject.genre ? `类型：${recommendedProject.genre}` : "未填写类型"}</span>
                <span className="manuscript-chip">更新于 {recommendedUpdatedLabel}</span>
                <span className="manuscript-chip">
                  {recommendedWizardLoading ? "读取项目状态..." : recommendedWizard?.nextTitle ? `建议先做：${recommendedWizard.nextTitle}` : "主线已打通"}
                </span>
              </div>
              <div className="author-workbench-actions">
                <button className="btn btn-primary" disabled={primaryCta.disabled} onClick={primaryCta.onClick} type="button">
                  {primaryCta.label}
                </button>
                <button className="btn btn-secondary" onClick={() => enterProject(recommendedProject)} type="button">
                  打开项目桌面
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigate(buildProjectHomePath(recommendedProject.id, "settings"))}
                  type="button"
                >
                  项目设置
                </button>
              </div>
              <div className="launchpad-progress-card">
                {recommendedWizardLoading ? (
                  <div className="text-sm text-subtext">读取项目状态...</div>
                ) : recommendedWizard ? (
                  <>
                    <div className="flex items-center justify-between gap-3 text-xs text-subtext">
                      <span>完成度：{recommendedWizard.percent}%</span>
                      <span className="truncate">
                        {recommendedWizard.nextTitle ? `下一步：${recommendedWizard.nextTitle}` : "主线闭环已经跑通"}
                      </span>
                    </div>
                    <ProgressBar ariaLabel="当前项目完成度" className="mt-2" value={recommendedWizard.percent} />
                  </>
                ) : (
                  <div className="text-sm text-subtext">还没有计算出下一步，先打开项目看看。</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="author-workbench-title">先创建第一部作品</div>
              <div className="author-workbench-copy">
                项目建好后，这里会开始显示最近作品、下一步建议和整条作者主线，让你每次回来都能直接接上创作。
              </div>
              <div className="author-workbench-actions">
                <button className="btn btn-primary" onClick={() => setCreateOpen(true)} type="button">
                  创建第一个项目
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="author-workbench-stack">
          <div className="author-workbench-panel">
            <div className="workbench-rail-section">
              <div className="author-workbench-kicker">今天适合怎么开始</div>
              <div className="author-workbench-bullet-list mt-0">
                {DASHBOARD_START_GUIDE.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            </div>
            <div className="workbench-rail-divider" />
            <div className="workbench-rail-section">
              <div className="author-workbench-kicker">作者视角下的主线</div>
              <div className="author-workbench-bullet-list mt-0">
                {DASHBOARD_AUTHOR_FLOW.map((item, index) => (
                  <div key={item}>
                    {index + 1}. {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && projects.length === 0 ? (
            <FeedbackStateCard
              tone="danger"
              title="项目加载失败"
              description={error.message}
              meta={
                error.requestId ? (
                  <>
                    {UI_COPY.common.requestIdLabel}: <span className="font-mono">{error.requestId}</span>
                  </>
                ) : null
              }
              actions={
                <button className="btn btn-secondary" onClick={() => void refresh()} type="button">
                  重试
                </button>
              }
            />
          ) : null}
        </aside>
      </div>

      <section className="author-workbench-panel">
        <div className="launchpad-shelf-head">
          <div className="min-w-0">
            <div className="author-workbench-kicker">最近项目书架</div>
            <div className="author-workbench-copy">
              这里按最近更新排序列出你的项目。你可以把它当作作品书架，也可以把它当作进入下一次写作的门厅。
            </div>
          </div>
          <div className="author-workbench-chip-row mt-0">
            <span className="manuscript-chip">{launchPadSummary.projectLabel}</span>
            <span className="manuscript-chip">{launchPadSummary.shelfLabel}</span>
          </div>
        </div>

        {loading ? (
          <div className="launchpad-project-grid mt-4">
            <div className="skeleton h-40 w-full" />
            <div className="skeleton h-40 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="author-workbench-copy mt-4">
            新建一个项目后，这里会开始形成你的最近书架，并自动告诉你哪一部作品最适合继续。
          </div>
        ) : (
          <div className="launchpad-project-grid mt-4">
            {sorted.map((p) => {
              const wizard = wizardByProjectId[p.id];
              const wizardLoading = wizardLoadingByProjectId[p.id];
              const isRecommended = recommendedProject?.id === p.id;

              return (
                <div
                  key={p.id}
                  className={clsx("launchpad-project-card", isRecommended && "is-featured")}
                  onClick={() => enterProject(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      enterProject(p);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="launchpad-project-header">
                    <div className="min-w-0">
                      <div className="truncate font-content text-2xl text-ink">{p.name}</div>
                      <div className="launchpad-project-meta">
                        <span className="manuscript-chip">{p.genre ? `类型：${p.genre}` : "未填写类型"}</span>
                        <span className="manuscript-chip">更新于 {formatDateLabel(p.updated_at)}</span>
                      </div>
                    </div>
                    <div className="launchpad-project-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(buildProjectHomePath(p.id, "setup"));
                        }}
                        type="button"
                      >
                        开工
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-accent hover:bg-accent/10"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm.confirm({
                            title: "删除项目？",
                            description: "该操作会删除项目及其设定/角色/章节/生成记录，且不可恢复。",
                            confirmText: "删除",
                            danger: true,
                          });
                          if (!ok) return;
                          try {
                            await apiJson<Record<string, never>>(`/api/projects/${p.id}`, { method: "DELETE" });
                            await refresh();
                            toast.toastSuccess("已删除");
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
                  </div>

                  <div className="author-workbench-copy">
                    {p.logline?.trim() || "还没有一句话梗概。你可以先进入项目主页补上它。"}
                  </div>

                  {wizardLoading ? (
                    <div className="launchpad-progress-card">
                      <div className="text-xs text-subtext">读取项目进度...</div>
                    </div>
                  ) : wizard ? (
                    <div className="launchpad-progress-card">
                      <div className="flex items-center justify-between gap-3 text-xs text-subtext">
                        <span>完成度：{wizard.percent}%</span>
                        <span className="truncate">{wizard.nextTitle ? `下一步：${wizard.nextTitle}` : "可继续写作"}</span>
                      </div>
                      <ProgressBar ariaLabel={`${p.name} 完成度`} className="mt-2" value={wizard.percent} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} panelClassName="surface max-w-lg p-6" ariaLabel="创建项目">
        <div className="font-content text-2xl text-ink">创建项目</div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-subtext">项目名</span>
            <input className="input" name="name" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">类型（可选）</span>
            <input className="input" name="genre" value={form.genre} onChange={(e) => setForm((v) => ({ ...v, genre: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">一句话梗概（可选）</span>
            <textarea
              className="textarea"
              name="logline"
              rows={3}
              value={form.logline}
              onChange={(e) => setForm((v) => ({ ...v, logline: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => setCreateOpen(false)} type="button">
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={creating || !form.name.trim()}
            onClick={async () => {
              setCreating(true);
              try {
                const res = await apiJson<{ project: Project }>("/api/projects", {
                  method: "POST",
                  body: JSON.stringify({
                    name: form.name.trim(),
                    genre: form.genre.trim() || undefined,
                    logline: form.logline.trim() || undefined,
                  }),
                });
                await refresh();
                toast.toastSuccess("创建成功");
                setCreateOpen(false);
                setForm({ name: "", genre: "", logline: "" });
                navigate(buildProjectHomePath(res.data.project.id, "settings"));
              } catch (err) {
                const apiErr = err as ApiError;
                toast.toastError(`${apiErr.message} (${apiErr.code})`, apiErr.requestId);
              } finally {
                setCreating(false);
              }
            }}
            type="button"
          >
            创建
          </button>
        </div>
      </Modal>
    </div>
  );
}
