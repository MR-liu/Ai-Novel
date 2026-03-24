import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "user-e2e";
const PROJECT_ID = "project-e2e";
const OUTLINE_ID = "outline-e2e";
const CHAPTER_ID = "chapter-e2e-1";
const PROJECT_TASK_ID = "task-auto-update-e2e";
const NOW = "2026-03-25T10:00:00Z";

function buildOkPayload<T>(data: T, requestId = "req-e2e") {
  return {
    ok: true,
    data,
    request_id: requestId,
  };
}

function buildSettings(projectId: string) {
  const defaultQueryPreprocessing = {
    enabled: false,
    tags: [],
    exclusion_rules: [],
    index_ref_enhance: false,
  };

  return {
    project_id: projectId,
    world_setting: "",
    style_guide: "",
    constraints: "",
    context_optimizer_enabled: true,
    auto_update_worldbook_enabled: true,
    auto_update_characters_enabled: true,
    auto_update_story_memory_enabled: true,
    auto_update_graph_enabled: true,
    auto_update_vector_enabled: true,
    auto_update_search_enabled: true,
    auto_update_fractal_enabled: true,
    auto_update_tables_enabled: true,
    query_preprocessing: null,
    query_preprocessing_default: defaultQueryPreprocessing,
    query_preprocessing_effective: defaultQueryPreprocessing,
    query_preprocessing_effective_source: "project",
    vector_rerank_enabled: false,
    vector_rerank_method: null,
    vector_rerank_top_k: null,
    vector_rerank_provider: "",
    vector_rerank_base_url: "",
    vector_rerank_model: "",
    vector_rerank_timeout_seconds: null,
    vector_rerank_hybrid_alpha: null,
    vector_rerank_has_api_key: false,
    vector_rerank_masked_api_key: "",
    vector_rerank_effective_enabled: false,
    vector_rerank_effective_method: "disabled",
    vector_rerank_effective_top_k: 20,
    vector_rerank_effective_source: "default",
    vector_rerank_effective_provider: "",
    vector_rerank_effective_base_url: "",
    vector_rerank_effective_model: "",
    vector_rerank_effective_timeout_seconds: 30,
    vector_rerank_effective_hybrid_alpha: 0.5,
    vector_rerank_effective_has_api_key: false,
    vector_rerank_effective_masked_api_key: "",
    vector_rerank_effective_config_source: "default",
    vector_embedding_provider: "",
    vector_embedding_base_url: "",
    vector_embedding_model: "",
    vector_embedding_azure_deployment: "",
    vector_embedding_azure_api_version: "",
    vector_embedding_sentence_transformers_model: "",
    vector_embedding_has_api_key: false,
    vector_embedding_masked_api_key: "",
    vector_embedding_effective_provider: "",
    vector_embedding_effective_base_url: "",
    vector_embedding_effective_model: "",
    vector_embedding_effective_azure_deployment: "",
    vector_embedding_effective_azure_api_version: "",
    vector_embedding_effective_sentence_transformers_model: "",
    vector_embedding_effective_has_api_key: false,
    vector_embedding_effective_masked_api_key: "",
    vector_embedding_effective_disabled_reason: null,
    vector_embedding_effective_source: "default",
  };
}

function createMockState() {
  return {
    user: {
      id: USER_ID,
      display_name: "E2E 用户",
      is_admin: false,
    },
    llmPreset: {
      project_id: PROJECT_ID,
      provider: "openai",
      base_url: null,
      model: "gpt-5-mini",
      temperature: 0.8,
      top_p: null,
      max_tokens: 1800,
      max_tokens_limit: 3200,
      max_tokens_recommended: 1800,
      context_window_limit: 128000,
      presence_penalty: null,
      frequency_penalty: null,
      top_k: null,
      stop: [],
      timeout_seconds: 60,
      extra: {},
    },
    project: null as null | {
      id: string;
      owner_user_id: string;
      active_outline_id: string | null;
      llm_profile_id: string | null;
      name: string;
      genre: string | null;
      logline: string | null;
      created_at: string;
      updated_at: string;
    },
    outline: {
      id: OUTLINE_ID,
      project_id: PROJECT_ID,
      title: "主线大纲",
      content_md: "",
      structure: { chapters: [] as Array<{ number: number; title: string; beats: string[] }> },
      created_at: NOW,
      updated_at: NOW,
    },
    chapters: [] as Array<{
      id: string;
      project_id: string;
      outline_id: string;
      number: number;
      title: string;
      plan: string;
      content_md: string;
      summary: string;
      status: "planned" | "drafting" | "done";
      updated_at: string;
    }>,
    projectTasks: [] as Array<{
      id: string;
      project_id: string;
      actor_user_id: string;
      kind: string;
      status: string;
      idempotency_key: string;
      error_type: string | null;
      error_message: string | null;
      timings: Record<string, unknown>;
      params: Record<string, unknown>;
      result: Record<string, unknown>;
      error: null;
    }>,
  };
}

function buildProjects(state: ReturnType<typeof createMockState>) {
  return state.project ? [state.project] : [];
}

function buildProjectSummaryItems(state: ReturnType<typeof createMockState>) {
  if (!state.project) return [];
  return [
    {
      project: state.project,
      settings: buildSettings(state.project.id),
      characters_count: 0,
      outline_content_md: state.outline.content_md,
      outline_content_len: state.outline.content_md.length,
      outline_content_truncated: false,
      chapters_total: state.chapters.length,
      chapters_done: state.chapters.filter((chapter) => chapter.status === "done").length,
      llm_preset: {
        provider: state.llmPreset.provider,
        model: state.llmPreset.model,
      },
      llm_profile_has_api_key: true,
    },
  ];
}

function buildOutlineList(state: ReturnType<typeof createMockState>) {
  return [
    {
      id: state.outline.id,
      title: state.outline.title,
      created_at: state.outline.created_at,
      updated_at: state.outline.updated_at,
      has_chapters: state.chapters.length > 0,
    },
  ];
}

function buildChapterMetaList(state: ReturnType<typeof createMockState>) {
  return state.chapters.map((chapter) => ({
    id: chapter.id,
    project_id: chapter.project_id,
    outline_id: chapter.outline_id,
    number: chapter.number,
    title: chapter.title,
    status: chapter.status,
    updated_at: chapter.updated_at,
    has_plan: Boolean(chapter.plan.trim()),
    has_summary: Boolean(chapter.summary.trim()),
    has_content: Boolean(chapter.content_md.trim()),
  }));
}

function buildGeneratedOutlineResult() {
  return {
    outline_md: `# 雨城迷踪\n\n## 第 1 章 雨夜来信\n- 林秋在雨夜收到一封匿名来信\n- 她决定独自赴约，先摸清来信者的真实目的\n\n## 第 2 章 河岸追踪\n- 线索把林秋带到废弃河岸仓库\n- 她发现失踪案和旧城档案之间有直接关联\n`,
    chapters: [
      {
        number: 1,
        title: "雨夜来信",
        beats: ["林秋在雨夜收到匿名来信", "她决定独自赴约摸清真相"],
      },
      {
        number: 2,
        title: "河岸追踪",
        beats: ["线索把林秋带到旧仓库", "失踪案与旧城档案正式连上"],
      },
    ],
    raw_output: "{\"outline_md\":\"雨城迷踪\"}",
  };
}

async function fulfillJson(route: Route, data: unknown, requestId = "req-e2e") {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    json: buildOkPayload(data, requestId),
  });
}

function readJsonBody(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function bumpProjectUpdatedAt(state: ReturnType<typeof createMockState>, timestamp: string) {
  if (!state.project) return;
  state.project.updated_at = timestamp;
}

async function installApiMocks(page: Page, state: ReturnType<typeof createMockState>) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method().toUpperCase();

    if (pathname === "/api/auth/user" && method === "GET") {
      await fulfillJson(route, {
        user: state.user,
        session: { expire_at: 1_775_000_000 },
      });
      return;
    }

    if (pathname === "/api/health" && method === "GET") {
      await fulfillJson(route, {
        status: "ok",
        version: "e2e",
        queue_backend: "inline",
        effective_backend: "inline",
        redis_ok: true,
        rq_queue_name: "default",
      });
      return;
    }

    if (pathname === "/api/projects" && method === "GET") {
      await fulfillJson(route, { projects: buildProjects(state) });
      return;
    }

    if (pathname === "/api/projects/summary" && method === "GET") {
      await fulfillJson(route, { items: buildProjectSummaryItems(state) });
      return;
    }

    if (pathname === "/api/llm_profiles" && method === "GET") {
      await fulfillJson(route, { profiles: [] }, "req-llm-profiles");
      return;
    }

    if (pathname === "/api/projects" && method === "POST") {
      const body = readJsonBody(route);
      state.project = {
        id: PROJECT_ID,
        owner_user_id: USER_ID,
        active_outline_id: OUTLINE_ID,
        llm_profile_id: null,
        name: String(body.name ?? "未命名项目"),
        genre: typeof body.genre === "string" ? body.genre : null,
        logline: typeof body.logline === "string" ? body.logline : null,
        created_at: NOW,
        updated_at: NOW,
      };
      state.outline = {
        ...state.outline,
        project_id: PROJECT_ID,
        content_md: "",
        structure: { chapters: [] },
        updated_at: NOW,
      };
      await fulfillJson(route, { project: state.project }, "req-create-project");
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}` && method === "GET") {
      await fulfillJson(route, { project: state.project });
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}` && method === "PUT") {
      const body = readJsonBody(route);
      if (state.project && typeof body.active_outline_id === "string") {
        state.project.active_outline_id = body.active_outline_id;
      }
      bumpProjectUpdatedAt(state, "2026-03-25T10:05:00Z");
      await fulfillJson(route, { project: state.project }, "req-update-project");
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/settings` && method === "GET") {
      await fulfillJson(route, { settings: buildSettings(PROJECT_ID) });
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/outline` && method === "GET") {
      await fulfillJson(route, { outline: state.outline });
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/outline` && method === "PUT") {
      const body = readJsonBody(route);
      state.outline = {
        ...state.outline,
        content_md: String(body.content_md ?? ""),
        structure: (body.structure as typeof state.outline.structure | undefined) ?? state.outline.structure,
        updated_at: "2026-03-25T10:10:00Z",
      };
      bumpProjectUpdatedAt(state, state.outline.updated_at);
      await fulfillJson(route, { outline: state.outline }, "req-save-outline");
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/outline/generate` && method === "POST") {
      await fulfillJson(route, buildGeneratedOutlineResult(), "req-generate-outline");
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/llm_preset` && method === "GET") {
      await fulfillJson(route, { llm_preset: state.llmPreset });
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/characters` && method === "GET") {
      await fulfillJson(route, { characters: [] });
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/outlines` && method === "GET") {
      await fulfillJson(route, { outlines: buildOutlineList(state) });
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/batch_generation_tasks/active` && method === "GET") {
      await fulfillJson(route, { task: null, items: [] });
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/chapters/bulk_create` && method === "POST") {
      const body = readJsonBody(route);
      const chapters = Array.isArray(body.chapters) ? body.chapters : [];
      state.chapters = chapters.map((chapter, index) => {
        const item = chapter as Record<string, unknown>;
        return {
          id: `${CHAPTER_ID}-${index + 1}`,
          project_id: PROJECT_ID,
          outline_id: OUTLINE_ID,
          number: Number(item.number ?? index + 1),
          title: String(item.title ?? `第 ${index + 1} 章`),
          plan: String(item.plan ?? ""),
          content_md: "",
          summary: "",
          status: "planned" as const,
          updated_at: "2026-03-25T10:15:00Z",
        };
      });
      bumpProjectUpdatedAt(state, "2026-03-25T10:15:00Z");
      await fulfillJson(route, { chapters: state.chapters }, "req-bulk-create-chapters");
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/chapters/meta` && method === "GET") {
      const chapters = buildChapterMetaList(state);
      await fulfillJson(route, {
        chapters,
        next_cursor: null,
        has_more: false,
        returned: chapters.length,
        total: chapters.length,
      });
      return;
    }

    if (pathname === `/api/chapters/${CHAPTER_ID}-1` && method === "GET") {
      await fulfillJson(route, { chapter: state.chapters[0] ?? null });
      return;
    }

    if (pathname === `/api/chapters/${CHAPTER_ID}-1` && method === "PUT") {
      const body = readJsonBody(route);
      const current = state.chapters[0];
      if (!current) throw new Error("无法更新不存在的章节");
      state.chapters[0] = {
        ...current,
        title: typeof body.title === "string" ? body.title : current.title,
        plan: typeof body.plan === "string" ? body.plan : current.plan,
        content_md: typeof body.content_md === "string" ? body.content_md : current.content_md,
        summary: typeof body.summary === "string" ? body.summary : current.summary,
        status:
          body.status === "planned" || body.status === "drafting" || body.status === "done"
            ? body.status
            : current.status,
        updated_at: "2026-03-25T10:20:00Z",
      };
      bumpProjectUpdatedAt(state, state.chapters[0].updated_at);
      await fulfillJson(route, { chapter: state.chapters[0] }, "req-save-chapter");
      return;
    }

    if (pathname === `/api/chapters/${CHAPTER_ID}-1/trigger_auto_updates` && method === "POST") {
      state.projectTasks = [
        {
          id: PROJECT_TASK_ID,
          project_id: PROJECT_ID,
          actor_user_id: USER_ID,
          kind: "chapter_auto_update_bundle",
          status: "queued",
          idempotency_key: "chapter-e2e-auto-update",
          error_type: null,
          error_message: null,
          timings: {},
          params: { chapter_id: `${CHAPTER_ID}-1` },
          result: {
            change_set_id: "change-set-e2e-1",
            change_set_status: "proposed",
          },
          error: null,
        },
      ];
      await fulfillJson(
        route,
        {
          tasks: {
            story_memory: PROJECT_TASK_ID,
            vector: null,
          },
          chapter_token: "chapter-token-e2e",
        },
        "req-trigger-auto-updates",
      );
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/tasks` && method === "GET") {
      await fulfillJson(route, { items: state.projectTasks, next_before: null }, "req-project-tasks");
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/memory_change_sets` && method === "GET") {
      await fulfillJson(route, { items: [], next_before: null }, "req-memory-change-sets");
      return;
    }

    if (pathname === `/api/projects/${PROJECT_ID}/memory_tasks` && method === "GET") {
      await fulfillJson(route, { items: [], next_before: null }, "req-memory-tasks");
      return;
    }

    if (pathname === `/api/tasks/${PROJECT_TASK_ID}` && method === "GET") {
      await fulfillJson(route, state.projectTasks[0] ?? null, "req-project-task-detail");
      return;
    }

    if (pathname === `/api/tasks/${PROJECT_TASK_ID}/runtime` && method === "GET") {
      await fulfillJson(
        route,
        {
          run: state.projectTasks[0] ?? null,
          timeline: [],
          checkpoints: [],
          steps: [],
          artifacts: [],
          batch: null,
        },
        "req-project-task-runtime",
      );
      return;
    }

    throw new Error(`未处理的 API 请求：${method} ${pathname}${url.search}`);
  });
}

test("作者主链路 smoke：新建项目 -> 生成大纲 -> 进入写作 -> 触发自动更新 -> 查看任务中心", async ({ page }) => {
  const state = createMockState();

  await page.addInitScript(
    ({ userId }) => {
      const authUserKey = "ainovel::auth::user_id";
      localStorage.setItem(authUserKey, userId);
      localStorage.setItem(`ainovel::app_mode::${userId}`, "studio");
      localStorage.setItem("ainovel::app_mode::local-user", "studio");

      class MockEventSource implements EventSource {
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSED = 2;

        readonly CONNECTING = MockEventSource.CONNECTING;
        readonly OPEN = MockEventSource.OPEN;
        readonly CLOSED = MockEventSource.CLOSED;
        readonly url: string;
        readonly withCredentials = false;
        readyState = MockEventSource.CONNECTING;
        onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
        onmessage: ((this: EventSource, ev: MessageEvent<string>) => unknown) | null = null;
        onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
        listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

        constructor(url: string | URL) {
          this.url = String(url);
          window.setTimeout(() => {
            this.readyState = MockEventSource.OPEN;
            this.onopen?.call(this, new Event("open"));
            const snapshot = new MessageEvent("snapshot", {
              data: JSON.stringify({
                type: "snapshot",
                project_id: "project-e2e",
                cursor: 1,
                active_tasks: [],
              }),
            });
            this.dispatchEvent(snapshot);
          }, 0);
        }

        addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
          if (!listener) return;
          const current = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
          current.add(listener);
          this.listeners.set(type, current);
        }

        removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
          if (!listener) return;
          this.listeners.get(type)?.delete(listener);
        }

        dispatchEvent(event: Event): boolean {
          const listeners = this.listeners.get(event.type);
          if (listeners) {
            for (const listener of listeners) {
              if (typeof listener === "function") listener.call(this, event);
              else listener.handleEvent(event);
            }
          }
          if (event.type === "message" && event instanceof MessageEvent) {
            this.onmessage?.call(this, event as MessageEvent<string>);
          }
          return true;
        }

        close() {
          this.readyState = MockEventSource.CLOSED;
        }
      }

      Object.defineProperty(window, "EventSource", {
        configurable: true,
        writable: true,
        value: MockEventSource,
      });
    },
    { userId: USER_ID },
  );

  await installApiMocks(page, state);

  await page.goto("/");

  await page.getByRole("button", { name: "新建项目" }).click();
  const createDialog = page.getByRole("dialog", { name: "创建项目" });
  await createDialog.locator('[name="name"]').fill("雨城测试项目");
  await createDialog.locator('[name="genre"]').fill("悬疑");
  await createDialog.locator('[name="logline"]').fill("一封匿名来信把主角拖进旧城失踪案。");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/projects") && response.request().method() === "POST"),
    createDialog.getByRole("button", { name: "创建" }).click(),
  ]);

  await page.goto(`/projects/${PROJECT_ID}/outline`);
  await expect(page.getByRole("button", { name: "AI 生成大纲" })).toBeVisible();

  await page.getByRole("button", { name: "AI 生成大纲" }).click();
  const outlineDialog = page.getByRole("dialog", { name: "AI 生成大纲" });
  await outlineDialog.locator('[name="chapter_count"]').fill("2");
  await outlineDialog.locator('[name="tone"]').fill("冷峻悬疑");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/projects/${PROJECT_ID}/outline/generate`)),
    outlineDialog.getByRole("button", { name: "生成" }).click(),
  ]);
  await expect(outlineDialog.getByText("生成结果预览")).toBeVisible();

  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/projects/${PROJECT_ID}/outline`) && response.request().method() === "PUT"),
    outlineDialog.getByRole("button", { name: "覆盖当前大纲并保存" }).click(),
  ]);

  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/projects/${PROJECT_ID}/chapters/bulk_create`)),
    (async () => {
      await page.getByRole("button", { name: "从大纲创建章节骨架" }).click();
      await page.getByRole("dialog", { name: "从大纲创建章节骨架？" }).getByRole("button", { name: "创建" }).click();
    })(),
  ]);
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}/write$`));

  const contentEditor = page.locator('textarea[name="content_md"]');
  await expect(contentEditor).toBeVisible();
  await contentEditor.fill("林秋走进雨夜的旧巷，决定先按匿名信上的地址赴约。");
  await expect(page.getByRole("button", { name: "保存并同步故事资料" })).toBeEnabled();

  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/chapters/${CHAPTER_ID}-1/trigger_auto_updates`)),
    page.getByRole("button", { name: "保存并同步故事资料" }).click(),
  ]);
  await expect(page.getByText("已保存并创建无感更新任务")).toBeVisible();

  await page.goto(`/projects/${PROJECT_ID}/studio/system/tasks`);
  await expect(page.getByText("项目任务", { exact: true })).toBeVisible();
  await expect(page.getByText("chapter_auto_update_bundle")).toBeVisible();
  await expect(page.getByLabel("taskcenter_projecttask_live_status")).toContainText("Project SSE: connected");
});
