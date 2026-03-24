import { useCallback, useMemo } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../components/ui/Feedback";
import type { LLMProfile, LLMProvider, LLMTaskCatalogItem } from "../../types";
import { describeLlmProvider, formatLlmProviderModel } from "./llmProviderCopy";
import { describeModelListState, deriveLlmModuleAccessState, type LlmModuleAccessState } from "./llmConnectionState";
import type { LlmForm, LlmModelListState } from "./types";

type TaskModuleView = {
  task_key: string;
  label: string;
  group: string;
  description: string;
  llm_profile_id: string | null;
  form: LlmForm;
  dirty: boolean;
  saving: boolean;
  deleting: boolean;
  modelList: LlmModelListState;
};

type Props = {
  llmForm: LlmForm;
  setLlmForm: Dispatch<SetStateAction<LlmForm>>;
  presetDirty: boolean;
  saving: boolean;
  testing: boolean;
  capabilities: {
    max_tokens_limit: number | null;
    max_tokens_recommended: number | null;
    context_window_limit: number | null;
  } | null;
  onTestConnection: () => void;
  onSave: () => void;
  mainModelList: LlmModelListState;
  onReloadMainModels: () => void;

  profiles: LLMProfile[];
  selectedProfileId: string | null;
  onSelectProfile: (profileId: string | null) => void;
  profileName: string;
  onChangeProfileName: (value: string) => void;
  profileBusy: boolean;
  onCreateProfile: () => void;
  onUpdateProfile: () => void;
  onDeleteProfile: () => void;

  apiKey: string;
  onChangeApiKey: (value: string) => void;
  onSaveApiKey: () => void;
  onClearApiKey: () => void;

  taskModules: TaskModuleView[];
  addableTasks: LLMTaskCatalogItem[];
  selectedAddTaskKey: string;
  onSelectAddTaskKey: (taskKey: string) => void;
  onAddTaskModule: () => void;
  onTaskProfileChange: (taskKey: string, profileId: string | null) => void;
  onTaskFormChange: (taskKey: string, updater: (prev: LlmForm) => LlmForm) => void;
  taskTesting: Record<string, boolean>;
  onTestTaskConnection: (taskKey: string) => void;
  taskApiKeyDrafts: Record<string, string>;
  onTaskApiKeyDraftChange: (taskKey: string, value: string) => void;
  taskProfileBusy: Record<string, boolean>;
  onSaveTaskApiKey: (taskKey: string) => void;
  onClearTaskApiKey: (taskKey: string) => void;
  onSaveTask: (taskKey: string) => void;
  onDeleteTask: (taskKey: string) => void;
  onReloadTaskModels: (taskKey: string) => void;
};

type ModuleEditorProps = {
  moduleId: string;
  legacyMainFieldNames?: boolean;
  title: string;
  subtitle: string;
  form: LlmForm;
  setForm: (updater: (prev: LlmForm) => LlmForm) => void;
  saving: boolean;
  dirty: boolean;
  capabilities: {
    max_tokens_limit: number | null;
    max_tokens_recommended: number | null;
    context_window_limit: number | null;
  } | null;
  modelList: LlmModelListState;
  modelListHelpText: string;
  headerActions: ReactNode;
};

function RemoteStateNotice(props: { state: LlmModuleAccessState; className?: string }) {
  const toneClass =
    props.state.tone === "success" ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10";
  const titleClass = props.state.tone === "success" ? "text-success" : "text-warning";
  return (
    <div className={`rounded-atelier border p-3 ${toneClass}${props.className ? ` ${props.className}` : ""}`}>
      <div className={`text-xs font-medium ${titleClass}`}>{props.state.title}</div>
      <div className="mt-1 text-[11px] text-subtext">{props.state.detail}</div>
    </div>
  );
}

function getJsonParseErrorPosition(message: string): number | null {
  const m = message.match(/\bposition\s+(\d+)\b/i);
  if (!m) return null;
  const pos = Number(m[1]);
  return Number.isFinite(pos) ? pos : null;
}

function getLineAndColumnFromPosition(text: string, position: number): { line: number; column: number } | null {
  if (!Number.isFinite(position) || position < 0 || position > text.length) return null;
  const before = text.slice(0, position);
  const parts = before.split(/\r?\n/);
  const line = parts.length;
  const column = parts[parts.length - 1].length + 1;
  return { line, column };
}

function validateExtraJson(
  raw: string,
): { ok: true; value: unknown } | { ok: false; message: string; position?: number; line?: number; column?: number } {
  const trimmed = (raw ?? "").trim();
  const effective = trimmed ? raw : "{}";
  try {
    return { ok: true, value: JSON.parse(effective) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const position = getJsonParseErrorPosition(message);
    const lc = position !== null ? getLineAndColumnFromPosition(effective, position) : null;
    return {
      ok: false,
      message,
      ...(position !== null ? { position } : {}),
      ...(lc ? lc : {}),
    };
  }
}

function maxTokensHint(
  caps: {
    max_tokens_limit: number | null;
    max_tokens_recommended: number | null;
    context_window_limit: number | null;
  } | null,
): string {
  if (!caps) return "";
  const parts: string[] = [];
  if (caps.max_tokens_recommended) parts.push(`推荐 ${caps.max_tokens_recommended}`);
  if (caps.max_tokens_limit) parts.push(`上限 ${caps.max_tokens_limit}`);
  if (caps.context_window_limit) parts.push(`上下文 ${caps.context_window_limit}`);
  return parts.join(" · ");
}

function ModuleEditor(props: ModuleEditorProps) {
  const fieldName = useCallback(
    (key: string) => (props.legacyMainFieldNames ? key : `${props.moduleId}_${key}`),
    [props.legacyMainFieldNames, props.moduleId],
  );
  const extraValidation = useMemo(() => validateExtraJson(props.form.extra), [props.form.extra]);
  const extraErrorText = extraValidation.ok
    ? ""
    : `extra JSON 无效${extraValidation.line ? `（第 ${extraValidation.line} 行，第 ${extraValidation.column ?? 1} 列）` : ""}：${extraValidation.message}`;
  const tokenHint = maxTokensHint(props.capabilities);
  const responsesProvider =
    props.form.provider === "openai_responses" || props.form.provider === "openai_responses_compatible";

  const onFormatExtra = useCallback(() => {
    const parsed = validateExtraJson(props.form.extra);
    if (!parsed.ok) return;
    props.setForm((v) => ({
      ...v,
      extra: JSON.stringify(parsed.value, null, 2),
    }));
  }, [props]);

  return (
    <section className="surface border border-border p-4" aria-label={props.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="text-base font-semibold text-ink">{props.title}</div>
          <div className="text-xs text-subtext">{props.subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{props.headerActions}</div>
      </div>

      <FeedbackCallout className="mt-4 text-xs" title="什么时候该调这里">
        这一组设置决定“模型从哪里来、怎么回答、允许思考多深”。如果你只是想改文案或片段顺序，不必在这里久留。
      </FeedbackCallout>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs text-subtext">模型来源（provider）</span>
          <select
            className="select"
            name={fieldName("provider")}
            value={props.form.provider}
            disabled={props.saving}
            onChange={(e) =>
              props.setForm((v) => ({
                ...v,
                provider: e.target.value as LLMProvider,
                max_tokens: "",
                text_verbosity: "",
                reasoning_effort: "",
                anthropic_thinking_enabled: false,
                anthropic_thinking_budget_tokens: "",
                gemini_thinking_budget: "",
                gemini_include_thoughts: false,
              }))
            }
          >
            <option value="openai">OpenAI 官方对话（openai）</option>
            <option value="openai_responses">OpenAI 官方 Responses（openai_responses）</option>
            <option value="openai_compatible">通用 OpenAI 对话接口（openai_compatible）</option>
            <option value="openai_responses_compatible">
              通用 OpenAI Responses 接口（openai_responses_compatible）
            </option>
            <option value="anthropic">Anthropic Claude（anthropic）</option>
            <option value="gemini">Google Gemini（gemini）</option>
          </select>
          <div className="text-[11px] text-subtext">
            当前：{describeLlmProvider(props.form.provider)}。只有使用通用接口、本地中转服务或其他中转服务时，通常才需要单独填写服务地址。
          </div>
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-subtext">模型名称（model）</span>
          <input
            className="input"
            list={`${props.moduleId}_models`}
            name={fieldName("model")}
            disabled={props.saving}
            value={props.form.model}
            onChange={(e) => props.setForm((v) => ({ ...v, model: e.target.value }))}
          />
          <datalist id={`${props.moduleId}_models`}>
            {props.modelList.options.map((option) => (
              <option key={`${props.moduleId}-${option.id}`} value={option.id}>
                {option.display_name}
              </option>
            ))}
          </datalist>
          <div className="text-[11px] text-subtext">{props.modelListHelpText}</div>
        </label>

        <label className="grid gap-1 md:col-span-2">
          <span className="text-xs text-subtext">服务地址（base_url）</span>
          <input
            className="input"
            disabled={props.saving}
            name={fieldName("base_url")}
            placeholder={
              props.form.provider === "openai_compatible" || props.form.provider === "openai_responses_compatible"
                ? "https://your-gateway.example.com/v1"
                : undefined
            }
            value={props.form.base_url}
            onChange={(e) => props.setForm((v) => ({ ...v, base_url: e.target.value }))}
          />
          <div className="text-[11px] text-subtext">
            OpenAI 官方接口和通用 OpenAI 接口常见形式是带 `/v1` 的地址；Anthropic Claude 与 Google Gemini 通常只需要主机地址。
          </div>
        </label>
      </div>

      <FeedbackDisclosure
        className="mt-4 rounded-atelier border border-border/60 bg-canvas px-4 py-3"
        summaryClassName="px-0 py-0 text-sm font-medium text-ink"
        bodyClassName="pt-3"
        open={props.dirty}
        title="高级参数与推理细节（只在需要时调整）"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-xs text-subtext">temperature</span>
            <input
              className="input"
              value={props.form.temperature}
              onChange={(e) => props.setForm((v) => ({ ...v, temperature: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">top_p</span>
            <input
              className="input"
              value={props.form.top_p}
              onChange={(e) => props.setForm((v) => ({ ...v, top_p: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">输出长度（max_tokens / max_output_tokens）</span>
            <input
              className="input"
              value={props.form.max_tokens}
              onChange={(e) => props.setForm((v) => ({ ...v, max_tokens: e.target.value }))}
            />
            {tokenHint ? <div className="text-[11px] text-subtext">{tokenHint}</div> : null}
          </label>

          {props.form.provider === "openai" || props.form.provider === "openai_compatible" ? (
            <>
              <label className="grid gap-1">
                <span className="text-xs text-subtext">presence_penalty</span>
                <input
                  className="input"
                  value={props.form.presence_penalty}
                  onChange={(e) => props.setForm((v) => ({ ...v, presence_penalty: e.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-subtext">frequency_penalty</span>
                <input
                  className="input"
                  value={props.form.frequency_penalty}
                  onChange={(e) => props.setForm((v) => ({ ...v, frequency_penalty: e.target.value }))}
                />
              </label>
            </>
          ) : (
            <label className="grid gap-1">
              <span className="text-xs text-subtext">top_k</span>
              <input
                className="input"
                value={props.form.top_k}
                onChange={(e) => props.setForm((v) => ({ ...v, top_k: e.target.value }))}
              />
            </label>
          )}

          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs text-subtext">停止词（stop，逗号分隔）</span>
            <input
              className="input"
              value={props.form.stop}
              onChange={(e) => props.setForm((v) => ({ ...v, stop: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">超时秒数（timeout_seconds）</span>
            <input
              className="input"
              value={props.form.timeout_seconds}
              onChange={(e) => props.setForm((v) => ({ ...v, timeout_seconds: e.target.value }))}
            />
          </label>

          {(props.form.provider === "openai" || props.form.provider === "openai_compatible" || responsesProvider) && (
            <label className="grid gap-1">
              <span className="text-xs text-subtext">推理强度（reasoning effort）</span>
              <select
                className="select"
                value={props.form.reasoning_effort}
                onChange={(e) => props.setForm((v) => ({ ...v, reasoning_effort: e.target.value }))}
              >
                <option value="">（默认）</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
          )}

          {responsesProvider && (
            <label className="grid gap-1">
              <span className="text-xs text-subtext">文字展开程度（text verbosity）</span>
              <select
                className="select"
                value={props.form.text_verbosity}
                onChange={(e) => props.setForm((v) => ({ ...v, text_verbosity: e.target.value }))}
              >
                <option value="">（默认）</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
          )}

          {props.form.provider === "anthropic" && (
            <>
              <label className="flex items-center gap-2 md:col-span-1">
                <input
                  checked={props.form.anthropic_thinking_enabled}
                  onChange={(e) => props.setForm((v) => ({ ...v, anthropic_thinking_enabled: e.target.checked }))}
                  type="checkbox"
                />
                <span className="text-sm text-ink">启用深度思考</span>
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-subtext">思考预算（thinking.budget_tokens）</span>
                <input
                  className="input"
                  placeholder="例如 1024"
                  value={props.form.anthropic_thinking_budget_tokens}
                  onChange={(e) => props.setForm((v) => ({ ...v, anthropic_thinking_budget_tokens: e.target.value }))}
                />
              </label>
            </>
          )}

          {props.form.provider === "gemini" && (
            <>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-subtext">思考预算（thinkingConfig.thinkingBudget）</span>
                <input
                  className="input"
                  placeholder="例如 1024"
                  value={props.form.gemini_thinking_budget}
                  onChange={(e) => props.setForm((v) => ({ ...v, gemini_thinking_budget: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  checked={props.form.gemini_include_thoughts}
                  onChange={(e) => props.setForm((v) => ({ ...v, gemini_include_thoughts: e.target.checked }))}
                  type="checkbox"
                />
                <span className="text-sm text-ink">返回思考内容（includeThoughts）</span>
              </label>
            </>
          )}

          <label className="grid gap-1 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-subtext">扩展参数（extra JSON，高级）</span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={props.saving || !extraValidation.ok}
                onClick={onFormatExtra}
                type="button"
              >
                一键格式化
              </button>
            </div>
            <textarea
              className="textarea atelier-mono"
              rows={6}
              value={props.form.extra}
              onChange={(e) => props.setForm((v) => ({ ...v, extra: e.target.value }))}
            />
            <div className="text-[11px] text-subtext">
              这里只建议放少量 provider 专属扩展项；常见推理参数优先使用上面的结构化控件。
            </div>
            {extraErrorText ? (
              <FeedbackCallout className="text-xs" tone="warning" title="扩展参数 JSON 需要修正">
                {extraErrorText}
              </FeedbackCallout>
            ) : null}
          </label>
        </div>
      </FeedbackDisclosure>
    </section>
  );
}

export function LlmPresetPanel(props: Props) {
  const selectedProfile = props.selectedProfileId
    ? (props.profiles.find((p) => p.id === props.selectedProfileId) ?? null)
    : null;
  const mainAccessState = useMemo(
    () =>
      deriveLlmModuleAccessState({
        scope: "main",
        moduleProvider: props.llmForm.provider,
        selectedProfile,
      }),
    [props.llmForm.provider, selectedProfile],
  );
  const mainModelListHelpText = useMemo(
    () => describeModelListState(props.mainModelList, mainAccessState),
    [mainAccessState, props.mainModelList],
  );
  const taskOverrideCount = props.taskModules.length;
  const selectedProfileName = selectedProfile?.name ?? "未绑定";

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-content text-xl text-ink">模型与调用底座</div>
          <div className="mt-1 text-xs text-subtext">
            主调用模块决定项目默认怎么调用模型；任务覆盖只在个别流程里单独换模型或参数。
          </div>
        </div>
      </div>

      <div className="manuscript-status-list mt-4">
        <span className="manuscript-chip">主调用：{describeLlmProvider(props.llmForm.provider)}</span>
        <span className="manuscript-chip">任务覆盖：{taskOverrideCount} 项</span>
        <span className="manuscript-chip">主连接档案：{selectedProfileName}</span>
      </div>

      <FeedbackCallout className="mt-4 text-xs" title="怎么理解这一页">
        记法可以很简单：主调用模块管“默认怎么调用”，任务覆盖管“哪些流程要例外”，连接档案库管“这些配置共用哪套访问密钥和地址”。
      </FeedbackCallout>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="surface p-3">
          <div className="text-xs text-subtext">主调用模块</div>
          <div className="mt-2 text-sm font-semibold text-ink">适合设定项目默认模型与参数</div>
          <div className="mt-1 text-xs leading-5 text-subtext">大多数任务都会先走这里。只有当某个流程明显需要例外时，才建议继续往下加任务覆盖。</div>
        </div>
        <div className="surface p-3">
          <div className="text-xs text-subtext">任务覆盖</div>
          <div className="mt-2 text-sm font-semibold text-ink">适合给特定流程单独换模型</div>
          <div className="mt-1 text-xs leading-5 text-subtext">例如章节生成、大纲生成或分析任务。如果没有明确理由，尽量别让覆盖越来越多。</div>
        </div>
        <div className="surface p-3">
          <div className="text-xs text-subtext">连接档案库</div>
          <div className="mt-2 text-sm font-semibold text-ink">适合沉淀可复用的连接与访问密钥</div>
          <div className="mt-1 text-xs leading-5 text-subtext">把常用网关、模型和访问密钥存成档案，能减少重复输入，也方便多个任务共用同一套连接。</div>
        </div>
      </div>

      <div className="mt-4">
        <RemoteStateNotice state={mainAccessState} className="mb-3" />
        <ModuleEditor
          moduleId="main-module"
          legacyMainFieldNames
          title="主调用模块"
          subtitle="所有未单独覆盖的任务都会使用这里的模型来源、模型名和参数。"
          form={props.llmForm}
          setForm={props.setLlmForm}
          saving={props.saving || props.profileBusy}
          dirty={props.presetDirty}
          capabilities={props.capabilities}
          modelList={props.mainModelList}
          modelListHelpText={mainModelListHelpText}
          headerActions={
            <>
              <button
                className="btn btn-secondary"
                disabled={props.mainModelList.loading || props.saving || Boolean(mainAccessState.actionReason)}
                onClick={props.onReloadMainModels}
                title={mainAccessState.actionReason ?? undefined}
                type="button"
              >
                {props.mainModelList.loading ? "刷新中…" : "刷新可用模型"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={props.testing || props.profileBusy || Boolean(mainAccessState.actionReason)}
                onClick={props.onTestConnection}
                title={mainAccessState.actionReason ?? undefined}
                type="button"
              >
                {props.testing ? "检查中…" : "检查连接"}
              </button>
              <button
                className="btn btn-primary"
                disabled={!props.presetDirty || props.saving}
                onClick={props.onSave}
                type="button"
              >
                保存主设置
              </button>
            </>
          }
        />
      </div>

      <div className="mt-6 rounded-atelier border border-border/70 bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <div className="text-sm font-semibold text-ink">任务级模型覆盖</div>
            <div className="text-xs text-subtext">
              只在某个流程确实需要“例外模型”时才新增。每个覆盖都可绑定独立连接档案，未绑定时会回退主调用模块。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="select min-w-[240px]"
              value={props.selectedAddTaskKey}
              onChange={(e) => props.onSelectAddTaskKey(e.target.value)}
              disabled={props.addableTasks.length === 0 || props.profileBusy}
            >
              <option value="">选择要单独覆盖的写作任务</option>
              {props.addableTasks.map((task) => (
                <option key={task.key} value={task.key}>
                  [{task.group}] {task.label}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={!props.selectedAddTaskKey || props.profileBusy}
              onClick={props.onAddTaskModule}
              type="button"
            >
              新增任务覆盖
            </button>
          </div>
        </div>

        <div className="manuscript-status-list mt-4">
          <span className="manuscript-chip">覆盖模块：{taskOverrideCount}</span>
          <span className="manuscript-chip">{taskOverrideCount ? "优先保持少量、明确的例外" : "当前全部流程都走主调用模块"}</span>
        </div>

        {props.taskModules.length === 0 ? (
          <FeedbackEmptyState
            className="mt-4 rounded-atelier border border-dashed border-border"
            variant="compact"
            title="当前没有任务级覆盖"
            description="所有流程都会走主调用模块，这通常也是最容易维护的状态。"
          />
        ) : (
          <div className="mt-4 grid gap-4">
            {props.taskModules.map((task) => {
              const boundProfile = task.llm_profile_id
                ? (props.profiles.find((p) => p.id === task.llm_profile_id) ?? null)
                : null;
              const taskAccessState = deriveLlmModuleAccessState({
                scope: "task",
                moduleProvider: task.form.provider,
                selectedProfile,
                boundProfile,
              });
              const effectiveProfile = taskAccessState.effectiveProfile;
              const taskModelListHelpText = describeModelListState(task.modelList, taskAccessState);
              const testing = Boolean(props.taskTesting[task.task_key]);
              const profileBusy = Boolean(props.taskProfileBusy[task.task_key]);
              const taskBusy = task.saving || task.deleting || profileBusy;
              const taskUiLocked = taskBusy || testing;
              return (
                <div className="rounded-atelier border border-border/70 bg-canvas p-3" key={task.task_key}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="grid gap-1">
                      <div className="text-sm font-semibold text-ink">
                        [{task.group}] {task.label}
                      </div>
                      <div className="text-xs text-subtext">{task.description}</div>
                      <div className="text-[11px] text-subtext">任务键：{task.task_key}，这条覆盖只影响当前流程。</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {task.dirty ? (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">未保存</span>
                      ) : null}
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={task.modelList.loading || taskUiLocked || Boolean(taskAccessState.actionReason)}
                        onClick={() => props.onReloadTaskModels(task.task_key)}
                        title={taskAccessState.actionReason ?? undefined}
                        type="button"
                      >
                        {task.modelList.loading ? "刷新中…" : "刷新模型"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={taskUiLocked || props.profileBusy || Boolean(taskAccessState.actionReason)}
                        onClick={() => props.onTestTaskConnection(task.task_key)}
                        title={taskAccessState.actionReason ?? undefined}
                        type="button"
                      >
                        {testing ? "检查中…" : "检查连接"}
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!task.dirty || taskUiLocked}
                        onClick={() => props.onSaveTask(task.task_key)}
                        type="button"
                      >
                        {task.saving ? "保存中..." : "保存覆盖"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-accent hover:bg-accent/10"
                        disabled={taskUiLocked}
                        onClick={() => props.onDeleteTask(task.task_key)}
                        type="button"
                      >
                        {task.deleting ? "删除中..." : "删除覆盖"}
                      </button>
                    </div>
                  </div>

                  <RemoteStateNotice state={taskAccessState} className="mb-3" />

                  <div className="mb-3 grid gap-1">
                    <span className="text-xs text-subtext">为该任务绑定连接档案</span>
                    <select
                      className="select"
                      value={task.llm_profile_id ?? ""}
                      onChange={(e) => props.onTaskProfileChange(task.task_key, e.target.value || null)}
                      disabled={taskUiLocked}
                    >
                      <option value="">（回退主连接档案）</option>
                      {props.profiles.map((profile) => (
                        <option key={`${task.task_key}-${profile.id}`} value={profile.id}>
                          {profile.name} · {formatLlmProviderModel(profile.provider, profile.model)}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-subtext">
                      选择后，这个任务会优先使用该连接档案里的访问密钥和模型信息；留空表示继承项目主连接档案。
                    </div>
                    {effectiveProfile ? (
                      <>
                        <div className="text-[11px] text-subtext">
                          当前生效连接档案：{effectiveProfile.name}（{formatLlmProviderModel(effectiveProfile.provider, effectiveProfile.model)}）
                          {!boundProfile ? "，来源：主连接档案回退" : "，来源：任务绑定档案"}
                          {effectiveProfile.has_api_key
                            ? `，已保存访问密钥：${effectiveProfile.masked_api_key ?? "（已保存）"}`
                            : "，尚未保存访问密钥"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <input
                            className="input flex-1 min-w-[220px]"
                            disabled={taskUiLocked}
                            placeholder={
                              boundProfile
                                ? "输入这条任务覆盖绑定档案的新访问密钥（会影响共用这份档案的任务）"
                                : "输入主连接档案的新访问密钥（会影响回退到主连接档案的任务）"
                            }
                            type="password"
                            value={props.taskApiKeyDrafts[task.task_key] ?? ""}
                            onChange={(e) => props.onTaskApiKeyDraftChange(task.task_key, e.target.value)}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={taskUiLocked || !(props.taskApiKeyDrafts[task.task_key] ?? "").trim()}
                            onClick={() => props.onSaveTaskApiKey(task.task_key)}
                            type="button"
                          >
                            保存访问密钥
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={taskUiLocked || !effectiveProfile.has_api_key}
                            onClick={() => props.onClearTaskApiKey(task.task_key)}
                            type="button"
                          >
                            清除访问密钥
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-subtext">
                        当前没有可用的连接档案可回退，请先为这条任务覆盖绑定档案，或先设置主连接档案。
                      </div>
                    )}
                  </div>

                  <ModuleEditor
                    moduleId={`task-${task.task_key}`}
                    title="该任务的模型参数"
                    subtitle="这里只影响这个任务；没有单独改动的地方会回退主调用模块。"
                    form={task.form}
                    setForm={(updater) => props.onTaskFormChange(task.task_key, updater)}
                    saving={taskUiLocked}
                    dirty={task.dirty}
                    capabilities={null}
                    modelList={task.modelList}
                    modelListHelpText={taskModelListHelpText}
                    headerActions={<></>}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="surface mt-6 p-4">
        <div className="text-sm text-ink">连接档案库（后端保存）</div>
        <div className="mt-2 text-xs leading-6 text-subtext">
          这里保存的是可复用的连接档案。你可以把常用网关、模型和访问密钥绑在一起，供主调用模块或任务覆盖重复使用。
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-subtext">选择主连接档案</span>
            <select
              className="select"
              name="profile_select"
              value={props.selectedProfileId ?? ""}
              disabled={props.profileBusy}
              onChange={(e) => props.onSelectProfile(e.target.value ? e.target.value : null)}
            >
              <option value="">（未绑定连接档案）</option>
              {props.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatLlmProviderModel(p.provider, p.model)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 sm:col-span-1">
            <span className="text-xs text-subtext">新建档案名</span>
            <input
              className="input"
              disabled={props.profileBusy}
              name="profile_name"
              value={props.profileName}
              onChange={(e) => props.onChangeProfileName(e.target.value)}
              placeholder="例如：主网关"
            />
          </label>
        </div>

        {selectedProfile ? (
          <div className="mt-3 text-xs text-subtext">
            当前主连接档案：{selectedProfile.name}（{formatLlmProviderModel(selectedProfile.provider, selectedProfile.model)}）
          </div>
        ) : (
          <div className="mt-3 text-xs text-subtext">
            当前主连接档案：未绑定。若任务覆盖也没有绑定连接档案，就无法真正调用模型。
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-secondary px-3 py-2 text-xs"
            disabled={props.profileBusy}
            onClick={props.onCreateProfile}
            type="button"
          >
            保存为新档案
          </button>
          <button
            className="btn btn-secondary px-3 py-2 text-xs"
            disabled={props.profileBusy || !props.selectedProfileId}
            onClick={props.onUpdateProfile}
            type="button"
          >
            更新当前档案
          </button>
          <button
            className="btn btn-ghost px-3 py-2 text-xs text-accent hover:bg-accent/10"
            disabled={props.profileBusy || !props.selectedProfileId}
            onClick={props.onDeleteProfile}
            type="button"
          >
            删除当前档案
          </button>
        </div>
      </div>

      <div className="surface mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink">访问密钥（API Key，后端加密保存）</div>
          <button
            className="btn btn-secondary px-3 py-2 text-xs"
            disabled={!props.selectedProfileId || props.profileBusy || !selectedProfile?.has_api_key}
            onClick={props.onClearApiKey}
            type="button"
          >
            清除访问密钥
          </button>
        </div>
        <div className="mt-2 text-xs text-subtext">
          {mainAccessState.stage === "ready"
            ? `已就绪：${selectedProfile?.masked_api_key ?? "（已保存）"}。现在可以刷新模型列表并做连接检查。`
            : mainAccessState.stage === "missing_key"
              ? "已绑定连接档案，但还没有保存访问密钥。保存后才能刷新模型列表并做连接检查。"
              : mainAccessState.stage === "missing_profile"
                ? "请先选择或新建一个连接档案，再保存访问密钥。"
                : "当前模块的模型来源与已绑定连接档案不一致；先统一两边，再保存或测试。"}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="input flex-1"
            placeholder="输入新的访问密钥（API Key，已保存值不会回显）"
            name="api_key"
            type="password"
            value={props.apiKey}
            onChange={(e) => props.onChangeApiKey(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={!props.selectedProfileId || props.profileBusy || !props.apiKey.trim()}
            onClick={props.onSaveApiKey}
            type="button"
          >
            保存访问密钥
          </button>
        </div>
      </div>
    </section>
  );
}
