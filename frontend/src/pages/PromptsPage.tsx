import { Link, useParams } from "react-router-dom";

import { WizardNextBar } from "../components/atelier/WizardNextBar";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { LlmPresetPanel } from "../components/prompts/LlmPresetPanel";
import { FeedbackStateCard } from "../components/ui/Feedback";
import { UnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { copyText } from "../lib/copyText";
import { buildProjectWritePath, buildStudioAiPath } from "../lib/projectRoutes";

import { AI_WORKBENCH_COPY } from "./aiWorkbenchModels";
import { PromptsVectorRagSection } from "./prompts/PromptsVectorRagSection";
import { usePromptsPageState } from "./prompts/usePromptsPageState";

function PromptsPageSkeleton() {
  return (
    <div className="grid gap-6 pb-24" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载模型配置…</span>
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="skeleton h-6 w-44" />
            <div className="skeleton h-4 w-72" />
          </div>
          <div className="skeleton h-9 w-40" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-28 w-full sm:col-span-2" />
        </div>
      </div>
      <div className="panel p-6">
        <div className="skeleton h-5 w-40" />
        <div className="mt-3 grid gap-2">
          <div className="skeleton h-4 w-80" />
          <div className="skeleton h-4 w-72" />
        </div>
      </div>
    </div>
  );
}

function PromptsPageErrorState(props: { message: string; code: string; requestId?: string; onRetry: () => void }) {
  return (
    <div className="grid gap-6 pb-24">
      <FeedbackStateCard
        tone="danger"
        title="加载失败"
        description={`${props.message} (${props.code})`}
        meta={
          props.requestId ? (
            <>
              <span>request_id: {props.requestId}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void copyText(props.requestId!, { title: "复制 request_id" })}
                type="button"
              >
                复制 request_id
              </button>
            </>
          ) : null
        }
        actions={
          <button className="btn btn-primary" onClick={props.onRetry} type="button">
            重试
          </button>
        }
      />
    </div>
  );
}

export function PromptsPage() {
  const state = usePromptsPageState();
  const { projectId } = useParams();

  if (state.loading) return <PromptsPageSkeleton />;

  if (state.blockingLoadError) {
    return (
      <PromptsPageErrorState
        message={state.blockingLoadError.message}
        code={state.blockingLoadError.code}
        requestId={state.blockingLoadError.requestId}
        onRetry={() => void state.reloadAll()}
      />
    );
  }

  return (
    <div className="studio-shell pb-24">
      {state.dirty && state.outletActive ? <UnsavedChangesGuard when={state.dirty} /> : null}

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">项目级生成策略台</div>
            <div className="studio-cluster-copy">
              先把模型、连接状态和检索策略调稳定，再去改模板或片段蓝图。这样你更容易分清问题出在连接、资料链路，还是提示内容本身。
            </div>
          </div>
          <div className="studio-cluster-meta">{state.dirty ? "有未保存配置" : "配置可继续调整"}</div>
        </div>

        <div className="manuscript-status-list mt-4">
          <span className="manuscript-chip">当前层级：项目级方向盘</span>
          <span className="manuscript-chip">{state.dirty ? "有未保存项目策略" : "项目策略已同步"}</span>
          <span className="manuscript-chip">先稳连接与检索，再改模板或片段</span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="text-sm text-ink">这一页适合先做什么</div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              先确认默认模型、能力连接和检索链路有没有准备好。只有这些底座稳定后，模板微调和蓝图拆解才更容易看出真实效果。
            </div>
            <div className="mt-3 manuscript-status-list">
              <span className="manuscript-chip">适合校准底座</span>
              <span className="manuscript-chip">不适合直接改片段顺序</span>
              <span className="manuscript-chip">影响范围通常大于单一模板</span>
            </div>
          </div>

          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="text-sm text-ink">当前最合适的下一步</div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              {state.dirty
                ? "如果你刚改了模型或检索策略，建议先保存并做一次小范围验证，再决定是否进入模板库或蓝图台继续细调。"
                : "如果连接和检索都已经稳定，下一步更适合进入模板库沉淀稳态文案，或进入蓝图台细调片段，最后回写作页验证真实效果。"}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {projectId ? (
                <Link className="btn btn-secondary" to={buildStudioAiPath(projectId, "templates")}>
                  去模板库整理稳态文案
                </Link>
              ) : null}
              <button className="btn btn-secondary" onClick={state.goToPromptStudio} type="button">
                去蓝图台细调片段
              </button>
              {projectId ? (
                <Link className="btn btn-secondary" to={buildProjectWritePath(projectId)}>
                  回写作页验证效果
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="surface p-3">
            <div className="text-xs text-subtext">本页</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合处理项目级方向</div>
            <div className="mt-1 text-xs leading-5 text-subtext">模型、连接、检索策略和默认边界都在这里。它更像方向盘，不是手术台。</div>
          </div>
          <div className="surface p-3">
            <div className="text-xs text-subtext">模板库</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合沉淀稳定任务文案</div>
            <div className="mt-1 text-xs leading-5 text-subtext">当你只是想调整某类任务的默认开场、结构或约束时，先去模板库会更轻松。</div>
          </div>
          <div className="surface p-3">
            <div className="text-xs text-subtext">蓝图编排台</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合拆解片段与注入顺序</div>
            <div className="mt-1 text-xs leading-5 text-subtext">当你开始关心哪一段说明在生效、哪些任务该命中时，再进入蓝图台更合适。</div>
          </div>
        </div>
      </section>

      <section className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">连接、能力与检索链路</div>
            <div className="studio-cluster-copy">
              按“模型连接、向量与检索、Prompt 编排”的顺序推进，会比同时改所有东西更容易定位问题。
            </div>
          </div>
        </div>
        <LlmPresetPanel {...state.llmPresetPanelProps} />
        <PromptsVectorRagSection {...state.vectorRagSectionProps} />
      </section>

      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">
            {state.dirty
              ? "当前有未保存的项目级策略，建议先保存，再继续向模板库或蓝图台下钻。"
              : "项目级方向已相对稳定，接下来更适合去模板库沉淀稳态文案，或去蓝图台拆解片段。"}
          </div>
          <div className="text-xs text-subtext">
            记法可以很简单：本页管“全局方向”，模板库管“常用任务文案”，蓝图台管“片段级拼装与检查”。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {projectId ? (
            <Link className="btn btn-secondary" to={buildStudioAiPath(projectId, "templates")}>
              去模板库
            </Link>
          ) : null}
          <button className="btn btn-secondary" onClick={state.goToPromptStudio} type="button">
            去蓝图编排台
          </button>
        </div>
      </section>

      <ResearchWorkbenchPanel eyebrow="当前 AI 路径" {...AI_WORKBENCH_COPY["project-strategy"]} />

      <div className="text-xs text-subtext">快捷键：Ctrl/Cmd + S 保存（仅保存 LLM 配置）</div>

      <WizardNextBar {...state.wizardBarProps} />
    </div>
  );
}
