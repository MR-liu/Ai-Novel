# AI Novel 项目全量功能与链路评估

更新日期：2026-03-15

## 1. 评估口径与事实基线

- 事实源优先级：`代码 > 测试 > 迁移 > 部署配置 > README`
- 本轮范围：只读评估，不改业务代码，不做运行态写入验证
- 前端页面入口：`29` 个
- 前端显式业务路由别名：`/projects/:projectId/glossary`，实际重定向到 `/projects/:projectId/search`
- 后端路由模块：`32` 个
- 后端实际 REST/SSE 接口：`168` 个
- 说明：之前的 `185` 是粗扫结果，混入了 `APIRouter` 声明与非接口噪音；按装饰器净计数后为 `168`
- 核心模型文件：`33` 个
- 服务模块文件：`61` 个
- 队列执行通道：`4` 类
- 队列通道分别为：`batch_generation`、`import_task`、`memory_task`、`project_task`
- `project_task` 之下的业务任务类型：`search_rebuild`、`worldbook_auto_update`、`characters_auto_update`、`plot_auto_update`、`vector_rebuild`、`table_ai_update`、`graph_auto_update`、`fractal_rebuild`
- `memory_task` 的子类型：`vector_rebuild`、`graph_update`、`fractal_rebuild`
- 运行时追踪型任务：`batch_generation_orchestrator`，它是 `ProjectTask.kind`，用于批量生成运行态展示，不由 `project_task` worker 直接执行

## 2. 技术栈与外部依赖

- 前端：React 19、React Router 7、Vite 7、Vitest、Tailwind、Framer Motion
- 后端：FastAPI、SQLAlchemy、Alembic
- 数据库：开发可用 SQLite；推荐/生产为 Postgres
- 向量：`pgvector` 或 `Chroma`
- 队列：Redis + RQ，开发可降级为 inline worker
- 模型 Provider：OpenAI、OpenAI-compatible、Anthropic、Gemini
- 认证：本地账号密码；可选 LinuxDo OIDC
- 观测：JSON 日志、`X-Request-Id`、任务事件流、健康检查、任务 watchdog
- 容器部署：`docker-compose.yml` 默认包含 `postgres`、`redis`、`backend`、`rq_worker`、`frontend`

## 3. 页面总表

| 页面 | 路由 | 页面定位 | 核心动作 | 主要接口 / 上下游 |
| --- | --- | --- | --- | --- |
| LoginPage | `/login` | 登录入口 | 本地登录、OIDC 登录入口 | `/api/auth/providers`、`/api/auth/local/login`、`/api/auth/oidc/linuxdo/start`；下游 Dashboard |
| RegisterPage | `/register` | 注册入口 | 本地注册、OIDC 登录入口 | `/api/auth/providers`、`/api/auth/local/register`、`/api/auth/oidc/linuxdo/start`；下游 Dashboard |
| DashboardPage | `/` | 项目首页 | 拉项目摘要、创建项目、删除项目、继续最近项目 | `/api/projects`、`/api/projects/summary`、`DELETE /api/projects/{id}`；上游 Auth，下游 Wizard/Writing |
| AdminUsersPage | `/admin/users` | 管理员后台 | 查用户、建用户、禁用用户、重置密码 | `/api/auth/admin/users*`；管理功能 |
| ProjectWizardPage | `/projects/:projectId/wizard` | 开工向导 | 检查进度、自动生成大纲、批量建章节骨架 | `/api/projects/{id}/settings`、`/characters`、`/outline`、`/llm_preset`、`/llm_profiles`、`/outline/generate`、`/outlines`、章节 bulk create |
| SettingsPage | `/projects/:projectId/settings` | 项目配置中心 | 改项目基本信息、世界观/风格/约束、自动更新总开关、成员协作、向量与 query preprocessing 配置 | `/api/projects/{id}`、`/settings`、`/memberships`、`/graph/query`、向量 dry-run |
| CharactersPage | `/projects/:projectId/characters` | 角色卡管理 | 角色 CRUD | `/api/projects/{id}/characters`、`/api/characters/{id}` |
| OutlinePage | `/projects/:projectId/outline` | 大纲工作台 | 当前大纲读取/保存、多版本管理、AI 生成、SSE 流式生成、切换 active outline | `/api/projects/{id}/outline`、`/outlines`、`/outline/generate`、`/outline/generate-stream`、`PUT /api/projects/{id}` |
| WritingPage | `/projects/:projectId/writing` | 主写作工作台 | 章节列表、章节 CRUD、章节生成、流式生成、计划生成、后编辑采纳、内容优化、批量生成、分析、记忆更新、上下文预览、触发自动更新 | `/api/projects/{id}/outlines`、`/chapters*`、`/generate`、`/generate-stream`、`/generate-precheck`、`/plan`、`/post_edit_adoption`、`/trigger_auto_updates`、`/generation_runs*`、`/batch_generation_tasks`、`/analyze`、`/rewrite`、`/analysis/apply` |
| TaskCenterPage | `/projects/:projectId/tasks` | 任务中心 | 看 health、看 task SSE、看 ProjectTask/MemoryTask/ChangeSet、重试、取消、apply/rollback | `/api/health`、`/api/projects/{id}/task-events/stream`、`/tasks*`、`/memory_tasks*`、`/memory_change_sets*` |
| StructuredMemoryPage | `/projects/:projectId/structured-memory` | 结构化记忆底座 | 看实体/关系/证据、按章节提议变更、apply/rollback | `/api/projects/{id}/memory/structured`、`/api/chapters/{id}/memory/propose`、`/api/memory_change_sets/{id}/apply`、`/rollback` |
| NumericTablesPage | `/projects/:projectId/numeric-tables` | 数值表工作台 | 看表列表、触发表级 AI 更新 | `/api/projects/{id}/tables`、`/api/projects/{id}/tables/{table_id}/ai_update` |
| ForeshadowsPage | `/projects/:projectId/foreshadows` | 伏笔闭环页 | 查看 open loops、标记 resolve | `/api/projects/{id}/story_memories/foreshadows/open_loops`、`/resolve` |
| ChapterAnalysisPage | `/projects/:projectId/chapter-analysis` | 章节分析视图 | 加载章节与 annotations，查看记忆标注 | `/api/chapters/{id}`、`/api/chapters/{id}/annotations` |
| PreviewPage | `/projects/:projectId/preview` | 章节预览页 | 只读浏览章节、筛选 done、跳转 Reader/Editor | 依赖章节 meta/detail；上游 Writing，下游 Reader |
| ChapterReaderPage | `/projects/:projectId/reader` | 阅读 + 记忆侧栏 | 阅读章节、按章节调用记忆预览侧栏 | `/api/chapters/{id}`、`/api/projects/{id}/memory/preview` |
| PromptsPage | `/projects/:projectId/prompts` | 模型与任务配置页 | 项目级 preset、用户级 profile、任务级 preset、模型能力探测、模型列表、连接测试、向量 embedding/rerank dry-run | `/api/projects/{id}/llm_preset`、`/api/llm_profiles*`、`/api/projects/{id}/llm_task_presets*`、`/api/llm_capabilities`、`/api/llm_models`、`/api/llm/test`、`/settings`、向量 dry-run |
| PromptStudioPage | `/projects/:projectId/prompt-studio` | Prompt 预设编辑器 | 预设 CRUD、block CRUD、排序、导入导出、预览 | `/api/projects/{id}/prompt_presets*`、`/api/prompt_presets/{id}*`、`/api/prompt_blocks/{id}*`、`/api/projects/{id}/prompt_preview` |
| PromptTemplatesPage | `/projects/:projectId/prompt-templates` | Prompt 模板资源页 | 资源查看、全量导入导出、reset 默认、预览 | `/api/projects/{id}/prompt_presets`、`/prompt_preset_resources`、`/prompt_presets/{id}/export`、`/reset_to_default`、`/projects/{id}/prompt_preview` |
| ExportPage | `/projects/:projectId/export` | 导出页 | 下载 Markdown | `/api/projects/{id}/export/markdown` |
| WorldBookPage | `/projects/:projectId/worldbook` | 世界书工作台 | 条目 CRUD、批量更新/删除、复制、导入导出、preview trigger、手动触发 auto update、失败任务重试 | `/api/projects/{id}/worldbook_entries*`、`/preview_trigger`、`/tasks` |
| GraphPage | `/projects/:projectId/graph` | 图谱查询页 | 图谱查询、手动触发图谱自动更新 | `/api/projects/{id}/graph/query`、`/graph/auto_update` |
| FractalPage | `/projects/:projectId/fractal` | 分形记忆调试页 | 拉取 fractal context、重建 fractal | `/api/projects/{id}/fractal`、`/fractal/rebuild` |
| StylesPage | `/projects/:projectId/styles` | 写作风格页 | 读取内置/自定义风格、CRUD、自定义项目默认风格 | `/api/writing_styles*`、`/api/projects/{id}/writing_style_default` |
| RagPage | `/projects/:projectId/rag` | RAG/向量调试页 | KB 管理、status、ingest、rebuild、query、rerank 配置 | `/api/projects/{id}/vector/kbs*`、`/vector/status`、`/ingest`、`/rebuild`、`/query`、`/settings` |
| ImportPage | `/projects/:projectId/import` | 导入页 | 上传源文档、看切分 chunk、重试导入、把导入提案落为世界书或故事记忆 | `/api/projects/{id}/imports*`、`/chunks`、`/retry`、`/worldbook_entries/import_all`、`/story_memories/import_all` |
| SearchPage | `/projects/:projectId/search` | 项目内搜索引擎 | 按来源搜索、分页、跳转结果 | `/api/projects/{id}/search/query`；兼作 glossary 路由别名的落点 |
| NotFoundPage | `*` | 404 页面 | 提示无效路由 | 无业务接口 |
| RouteErrorPage | 路由错误边界 | 错误页 | 展示 lazy load / loader / action 错误 | 无业务接口 |

补充说明：

- `WorldBookPage`、`WritingPage`、`PromptsPage`、`TaskCenterPage` 的大量动作由子 Hook/Drawer 实现，不在顶层页面文件直写 API
- `PreviewPage` 和 `ChapterReaderPage` 是只读/半只读视图，不直接承载写操作
- `SearchPage` 实际承担了 glossary 路由别名落点，但并不等价于完整术语表管理页

## 4. 后端接口总表

### auth（13）

分类：用户功能 + 管理接口 + 会话支撑 + 隐藏 API

- 会话与登录：`GET /api/auth/user`、`GET /api/auth/providers`、`POST /api/auth/local/login`、`POST /api/auth/local/register`、`POST /api/auth/refresh`、`POST /api/auth/logout`
- OIDC：`GET /api/auth/oidc/linuxdo/start`、`GET /api/auth/oidc/linuxdo/callback`
- 管理员接口：`GET /api/auth/admin/users`、`POST /api/auth/admin/users`、`POST /api/auth/admin/users/{target_user_id}/disable`、`POST /api/auth/admin/users/{target_user_id}/password/reset`
- 隐藏 API：`POST /api/auth/password/change`，测试覆盖存在，但前台没有明确入口

### projects（11）

分类：用户功能 + 协作功能 + 隐藏 API

- 项目列表与摘要：`GET /api/projects`、`GET /api/projects/summary`
- 项目 CRUD：`POST /api/projects`、`GET /api/projects/{project_id}`、`PUT /api/projects/{project_id}`、`DELETE /api/projects/{project_id}`
- 协作成员：`GET /api/projects/{project_id}/memberships`、`POST /api/projects/{project_id}/memberships`、`PUT /api/projects/{project_id}/memberships/{target_user_id}`、`DELETE /api/projects/{project_id}/memberships/{target_user_id}`
- 隐藏 API：`POST /api/projects/import_bundle`，前台未见显式入口

### settings（2）

分类：用户功能

- `GET /api/projects/{project_id}/settings`
- `PUT /api/projects/{project_id}/settings`

### characters（4）

分类：用户功能

- `GET /api/projects/{project_id}/characters`
- `POST /api/projects/{project_id}/characters`
- `PUT /api/characters/{character_id}`
- `DELETE /api/characters/{character_id}`

### outline（4）

分类：用户功能 + SSE

- 当前 active outline：`GET /api/projects/{project_id}/outline`、`PUT /api/projects/{project_id}/outline`
- 大纲生成：`POST /api/projects/{project_id}/outline/generate`
- 大纲流式生成：`POST /api/projects/{project_id}/outline/generate-stream`

### outlines（5）

分类：用户功能

- `GET /api/projects/{project_id}/outlines`
- `POST /api/projects/{project_id}/outlines`
- `GET /api/projects/{project_id}/outlines/{outline_id}`
- `PUT /api/projects/{project_id}/outlines/{outline_id}`
- `DELETE /api/projects/{project_id}/outlines/{outline_id}`

### chapters（13）

分类：用户功能 + SSE + 自动更新入口

- 元数据与详情：`GET /api/projects/{project_id}/chapters/meta`、`GET /api/projects/{project_id}/chapters`、`GET /api/chapters/{chapter_id}`
- CRUD：`POST /api/projects/{project_id}/chapters`、`POST /api/projects/{project_id}/chapters/bulk_create`、`PUT /api/chapters/{chapter_id}`、`DELETE /api/chapters/{chapter_id}`
- 生成与规划：`POST /api/chapters/{chapter_id}/plan`、`POST /api/chapters/{chapter_id}/generate-precheck`、`POST /api/chapters/{chapter_id}/generate`、`POST /api/chapters/{chapter_id}/generate-stream`
- 后处理：`POST /api/chapters/{chapter_id}/post_edit_adoption`
- 自动更新手动触发：`POST /api/chapters/{chapter_id}/trigger_auto_updates`

### chapter_analysis（4）

分类：用户功能

- `POST /api/chapters/{chapter_id}/analyze`
- `POST /api/chapters/{chapter_id}/rewrite`
- `POST /api/chapters/{chapter_id}/analysis/apply`
- `GET /api/chapters/{chapter_id}/annotations`

### batch_generation（8）

分类：用户功能 + 队列任务控制

- 创建与查看：`POST /api/projects/{project_id}/batch_generation_tasks`、`GET /api/projects/{project_id}/batch_generation_tasks/active`、`GET /api/batch_generation_tasks/{task_id}`
- 运行控制：`POST /api/batch_generation_tasks/{task_id}/pause`、`/resume`、`/retry_failed`、`/skip_failed`、`/cancel`

### prompts（17）

分类：用户功能

- 预设列表与资源：`GET /api/projects/{project_id}/prompt_presets`、`GET /api/projects/{project_id}/prompt_preset_resources`
- 预设 CRUD：`POST /api/projects/{project_id}/prompt_presets`、`GET /api/prompt_presets/{preset_id}`、`PUT /api/prompt_presets/{preset_id}`、`POST /api/prompt_presets/{preset_id}/reset_to_default`、`DELETE /api/prompt_presets/{preset_id}`
- block CRUD：`POST /api/prompt_presets/{preset_id}/blocks`、`PUT /api/prompt_blocks/{block_id}`、`POST /api/prompt_blocks/{block_id}/reset_to_default`、`DELETE /api/prompt_blocks/{block_id}`、`POST /api/prompt_presets/{preset_id}/blocks/reorder`
- 导入导出与预览：`GET /api/prompt_presets/{preset_id}/export`、`POST /api/projects/{project_id}/prompt_presets/import`、`GET /api/projects/{project_id}/prompt_presets/export_all`、`POST /api/projects/{project_id}/prompt_presets/import_all`、`POST /api/projects/{project_id}/prompt_preview`

### llm_preset（2）

分类：用户功能

- `GET /api/projects/{project_id}/llm_preset`
- `PUT /api/projects/{project_id}/llm_preset`

### llm_task_presets（3）

分类：用户功能

- `GET /api/projects/{project_id}/llm_task_presets`
- `PUT /api/projects/{project_id}/llm_task_presets/{task_key}`
- `DELETE /api/projects/{project_id}/llm_task_presets/{task_key}`

### llm_profiles（4）

分类：用户功能

- `GET /api/llm_profiles`
- `POST /api/llm_profiles`
- `PUT /api/llm_profiles/{profile_id}`
- `DELETE /api/llm_profiles/{profile_id}`

### llm_models（1）

分类：支撑接口

- `GET /api/llm_models`，供模型下拉与 provider/model 兼容性提示使用

### llm_capabilities（1）

分类：支撑接口

- `GET /api/llm_capabilities`，供 Prompt 页能力探测与 token/window 提示使用

### llm（1）

分类：用户功能 / 调试功能

- `POST /api/llm/test`，Prompt 页“测试连接/测试调用”使用

### worldbook（11）

分类：用户功能 + 任务入口

- 列表与 CRUD：`GET /api/projects/{project_id}/worldbook_entries`、`POST /api/projects/{project_id}/worldbook_entries`、`PUT /api/worldbook_entries/{entry_id}`、`DELETE /api/worldbook_entries/{entry_id}`
- 自动更新与触发预览：`POST /api/projects/{project_id}/worldbook_entries/auto_update`、`POST /api/projects/{project_id}/worldbook_entries/preview_trigger`
- 导入导出：`GET /api/projects/{project_id}/worldbook_entries/export_all`、`POST /api/projects/{project_id}/worldbook_entries/import_all`
- 批量操作：`POST /api/projects/{project_id}/worldbook_entries/bulk_update`、`/bulk_delete`、`/duplicate`

### glossary（6）

分类：隐藏用户功能 API

- `GET /api/projects/{project_id}/glossary_terms`
- `GET /api/projects/{project_id}/glossary_terms/export_all`
- `POST /api/projects/{project_id}/glossary_terms`
- `PUT /api/projects/{project_id}/glossary_terms/{term_id}`
- `DELETE /api/projects/{project_id}/glossary_terms/{term_id}`
- `POST /api/projects/{project_id}/glossary_terms/rebuild`
- 说明：后端能力完整，但当前前端没有独立 Glossary 管理页

### story_memory（6）

分类：用户功能

- `GET /api/projects/{project_id}/story_memories`
- `POST /api/projects/{project_id}/story_memories`
- `PUT /api/projects/{project_id}/story_memories/{story_memory_id}`
- `DELETE /api/projects/{project_id}/story_memories/{story_memory_id}`
- `POST /api/projects/{project_id}/story_memories/merge`
- `POST /api/projects/{project_id}/story_memories/{story_memory_id}/mark_done`

### memory（15）

分类：用户功能 + 结构化记忆 + 隐藏 API

- 记忆读取：`GET /api/projects/{project_id}/memory/retrieve`、`POST /api/projects/{project_id}/memory/preview`
- 结构化记忆：`GET /api/projects/{project_id}/memory/structured`
- 故事记忆导入/伏笔：`POST /api/projects/{project_id}/story_memories/import_all`、`GET /api/projects/{project_id}/story_memories/foreshadows/open_loops`、`POST /api/projects/{project_id}/story_memories/foreshadows/{story_memory_id}/resolve`
- 变更集提议与应用：`POST /api/chapters/{chapter_id}/memory/propose`、`POST /api/chapters/{chapter_id}/memory/propose/auto`、`POST /api/projects/{project_id}/tables/change_sets/propose`、`POST /api/memory_change_sets/{change_set_id}/apply`、`POST /api/memory_change_sets/{change_set_id}/rollback`
- 变更集与任务查询：`GET /api/projects/{project_id}/memory_change_sets`、`GET /api/projects/{project_id}/memory_tasks`、`GET /api/memory_tasks/{task_id}`、`POST /api/memory_tasks/{task_id}/retry`
- 说明：`memory/retrieve` 与 `tables/change_sets/propose` 当前没有明确前台直连入口，属于隐藏/内部能力

### tables（11）

分类：用户功能

- 表与 schema：`GET /api/projects/{project_id}/tables`、`POST /api/projects/{project_id}/tables/seed_defaults`、`POST /api/projects/{project_id}/tables`、`GET /api/projects/{project_id}/tables/{table_id}`、`PUT /api/projects/{project_id}/tables/{table_id}`、`DELETE /api/projects/{project_id}/tables/{table_id}`
- 行 CRUD：`GET /api/projects/{project_id}/tables/{table_id}/rows`、`POST /api/projects/{project_id}/tables/{table_id}/rows`、`PUT /api/projects/{project_id}/tables/{table_id}/rows/{row_id}`、`DELETE /api/projects/{project_id}/tables/{table_id}/rows/{row_id}`
- AI 更新：`POST /api/projects/{project_id}/tables/{table_id}/ai_update`

### vector（12）

分类：高级用户功能 + 调试功能 + 隐藏 API

- 状态与执行：`POST /api/projects/{project_id}/vector/status`、`/ingest`、`/rebuild`、`/query`
- 调试 dry-run：`POST /api/projects/{project_id}/vector/embeddings/dry-run`、`/rerank/dry-run`
- KB 管理：`GET /api/projects/{project_id}/vector/kbs`、`POST /api/projects/{project_id}/vector/kbs`、`PUT /api/projects/{project_id}/vector/kbs/{kb_id}`、`POST /api/projects/{project_id}/vector/kbs/reorder`、`DELETE /api/projects/{project_id}/vector/kbs/{kb_id}`
- 隐藏 API：`POST /api/projects/{project_id}/vector/purge`，当前前台未见按钮

### graph（2）

分类：用户功能

- `POST /api/projects/{project_id}/graph/query`
- `POST /api/projects/{project_id}/graph/auto_update`

### fractal（2）

分类：高级调试功能

- `GET /api/projects/{project_id}/fractal`
- `POST /api/projects/{project_id}/fractal/rebuild`

### search（1）

分类：用户功能 / 高级搜索

- `POST /api/projects/{project_id}/search/query`

### import_export（5）

分类：用户功能

- `GET /api/projects/{project_id}/imports`
- `POST /api/projects/{project_id}/imports`
- `GET /api/projects/{project_id}/imports/{document_id}`
- `GET /api/projects/{project_id}/imports/{document_id}/chunks`
- `POST /api/projects/{project_id}/imports/{document_id}/retry`

### export（2）

分类：用户功能 + 隐藏 API

- `GET /api/projects/{project_id}/export/markdown`，前台已接入
- `GET /api/projects/{project_id}/export/bundle`，当前前台未见显式入口

### tasks（6）

分类：运维/调试功能 + 用户任务控制

- SSE 事件流：`GET /api/projects/{project_id}/task-events/stream`
- ProjectTask 查询：`GET /api/projects/{project_id}/tasks`、`GET /api/tasks/{task_id}`、`GET /api/tasks/{task_id}/runtime`
- 控制动作：`POST /api/tasks/{task_id}/retry`、`POST /api/tasks/{task_id}/cancel`

### generation_runs（3）

分类：调试与溯源

- `GET /api/projects/{project_id}/generation_runs`
- `GET /api/generation_runs/{run_id}`
- `GET /api/generation_runs/{run_id}/debug_bundle`

### writing_styles（7）

分类：用户功能

- `GET /api/writing_styles/presets`
- `GET /api/writing_styles`
- `POST /api/writing_styles`
- `PUT /api/writing_styles/{style_id}`
- `DELETE /api/writing_styles/{style_id}`
- `GET /api/projects/{project_id}/writing_style_default`
- `PUT /api/projects/{project_id}/writing_style_default`

### mcp（2）

分类：隐藏调试能力

- `GET /api/mcp/tools`
- `POST /api/mcp/runs/{run_id}/replay`
- 说明：前台无直连页面，且当前实现只注册 `mock.echo`、`mock.sleep`、`mock.fail` 三个 mock 工具

### health（1）

分类：运维接口

- `GET /api/health`
- 说明：返回的不仅是存活状态，还包含队列/worker 健康信息

## 5. 领域实体与关系

### 5.1 身份与权限

- `User`：系统用户
- `UserPassword`：本地密码凭据
- `AuthExternalAccount`：外部 OIDC 账号映射
- `ProjectMembership`：项目成员与角色
- `UserActivityStat`：在线/活跃统计
- `UserUsageStat`：使用统计

关系说明：

- `User` 可拥有多个 `Project`
- `User` 可通过 `ProjectMembership` 参与别人的项目
- `User` 可绑定本地密码和外部账号

### 5.2 项目核心

- `Project`：项目主实体，含名称、题材、logline、active outline、绑定 llm profile
- `ProjectSettings`：世界观、风格、约束、自动更新开关、query preprocessing、向量配置
- `ProjectDefaultStyle`：项目默认写作风格

### 5.3 写作生产线

- `Outline`：大纲版本
- `Chapter`：章节正文、计划、摘要、状态
- `Character`：角色卡
- `WritingStyle`：风格预设/自定义风格
- `GenerationRun`：LLM 调用与输出留痕
- `BatchGenerationTask`、`BatchGenerationTaskItem`：批量生成主任务与子项

关系说明：

- `Project` 关联多个 `Outline`
- `Project.active_outline_id` 决定当前写作上下文
- `Outline` 关联多个 `Chapter`
- `GenerationRun` 关联 `Project`，可选关联 `Chapter`
- `BatchGenerationTask` 关联多个 `BatchGenerationTaskItem`，并可挂接一个运行态 `ProjectTask`

### 5.4 Prompt 与模型配置

- `LLMPreset`：项目级默认模型配置
- `LLMProfile`：用户级模型档案，API Key 加密存储
- `LLMTaskPreset`：任务级模型覆盖
- `PromptPreset`：Prompt 预设
- `PromptBlock`：Prompt block 片段

### 5.5 知识、记忆、图谱

- `WorldBookEntry`：世界书条目
- `GlossaryTerm`：术语表条目
- `StoryMemory`：故事记忆 / 伏笔 / 记忆条目
- `FractalMemory`：分形记忆结果
- `StructuredMemory`：以 `MemoryEntity`、`MemoryRelation`、`MemoryEvent`、`MemoryForeshadow`、`MemoryEvidence` 为核心的一组结构化表
- `MemoryTask`：结构化记忆变更应用后的异步重建任务

关系说明：

- `StoryMemory` 负责开放性记忆和伏笔闭环
- `StructuredMemory` 负责可追溯、可 apply/rollback 的结构化事实层
- `FractalMemory` 是面向长篇上下文的聚合结果层

### 5.6 检索、导入、搜索

- `KnowledgeBase`：项目 KB 配置
- `ProjectSourceDocument`、`ProjectSourceDocumentChunk`：导入文档与 chunk
- `SearchIndex`：项目搜索索引

关系说明：

- 导入文档可被切分为 chunks
- chunks 可被写入向量后端
- 搜索与向量都共享项目内容源

### 5.7 任务与运维

- `ProjectTask`：后台业务任务
- `ProjectTaskEvent`：任务事件流水

关系说明：

- `ProjectTask` 用于承载 auto update、索引重建、图谱更新等后台工作
- `ProjectTaskEvent` 驱动 Task Center 的 EventSource 实时流

## 6. 异步系统与后台任务

### 6.1 执行通道

| 通道 | 触发位置 | 执行者 | 结果落点 | 前台可见位置 |
| --- | --- | --- | --- | --- |
| Outline SSE | OutlinePage | 后端 `outline/generate-stream` | 流式文本、最终 outline 结果 | OutlinePage |
| Chapter SSE | WritingPage | 后端 `chapters/{id}/generate-stream` | 流式文本、生成结果、GenerationRun | WritingPage |
| Task EventSource | TaskCenter / Writing 批量生成浮层 | `/api/projects/{id}/task-events/stream` | `ProjectTaskEvent` snapshot + event 增量 | TaskCenter、BatchGenerationModal |
| Queue `batch_generation` | Writing 批量生成 | `run_batch_generation_task` | `BatchGenerationTask`、`BatchGenerationTaskItem`、关联 `ProjectTask` runtime | WritingPage、TaskCenter |
| Queue `import_task` | ImportPage 上传/重试 | `run_import_task` | `ProjectSourceDocument`、`Chunk`、向量写入结果 | ImportPage |
| Queue `memory_task` | Structured Memory apply 后 | `run_memory_task` | `MemoryTask.result_json`、向量/分形 | TaskCenter |
| Queue `project_task` | 章节 done 自动更新或手动触发 | `run_project_task` | `ProjectTask`、`ProjectTaskEvent`、业务结果表 | TaskCenter、WorldBookPage、WritingPage |
| Watchdog/Heartbeat | app lifespan | `start_project_task_watchdog` + heartbeat thread | 失败超时任务、补发孤儿 queued 任务 | TaskCenter health/runtime |
| GenerationRun 留痕 | 生成/分析/Prompt/MCP | `run_store.write_generation_run` | `generation_runs` | Writing、TaskCenter、debug bundle |

### 6.2 业务任务清单

| 任务 | 谁触发 | 何时触发 | 执行逻辑 | 结果落点 | 用户在哪看 |
| --- | --- | --- | --- | --- | --- |
| `batch_generation` | WritingPage | 用户开启批量生成 | 逐章执行 plan/generate/post-edit/content-optimize 流程 | `BatchGenerationTask*`、`GenerationRun`、章节内容 | WritingPage、TaskCenter |
| `batch_generation_orchestrator` | 批量生成服务 | 创建批量任务时 | 只做运行态 checkpoint/事件承载 | `ProjectTask(kind=batch_generation_orchestrator)` | TaskCenter runtime |
| `import_task` | ImportPage | 上传文档或重试导入 | 切分 chunk、构建 worldbook/story memory 提案、向量 ingest | `ProjectSourceDocument*`、向量结果 | ImportPage |
| `project_task:worldbook_auto_update` | 章节定稿、WorldBookPage 手动触发 | chapter done 或手动点触发 | 基于章节/上下文推导 worldbook 变更并落库 | `WorldBookEntry`、`GenerationRun`、`ProjectTask` | WorldBookPage、TaskCenter |
| `project_task:characters_auto_update` | 章节定稿 | chapter done | 依据章节更新角色卡 | `Character`、`GenerationRun`、`ProjectTask` | CharactersPage、TaskCenter |
| `project_task:plot_auto_update` | 章节定稿 | chapter done | 生成剧情分析、故事记忆、伏笔等内容 | `StoryMemory`、`PlotAnalysis`、`GenerationRun`、`ProjectTask` | Foreshadows、ChapterAnalysis、TaskCenter |
| `project_task:vector_rebuild` | 章节定稿、RAG 手动 rebuild | 内容变更后 | 重建项目向量索引，可按 KB 拆分 | 向量后端、`ProjectSettings.last_vector_build_at` | RagPage、TaskCenter |
| `project_task:search_rebuild` | 章节定稿 | 内容变更后 | 重建项目搜索索引 | `SearchIndex` | SearchPage、TaskCenter |
| `project_task:table_ai_update` | 章节定稿或手动表级 AI 更新 | chapter done / NumericTablesPage | 推导数值表变更集并应用 | `ProjectTableRow`、`GenerationRun`、`ProjectTask` | NumericTablesPage、TaskCenter |
| `project_task:graph_auto_update` | 章节定稿或 Graph 手动触发 | chapter done / GraphPage | 生成结构化记忆变更并更新图谱相关层 | `StructuredMemory`、`GenerationRun`、`ProjectTask` | GraphPage、StructuredMemory、TaskCenter |
| `project_task:fractal_rebuild` | 章节定稿、FractalPage 手动 rebuild | 内容变更后 | 重建 fractal memory | `FractalMemory`、`ProjectTask` | FractalPage、TaskCenter |
| `memory_task:vector_rebuild` | Structured Memory apply 后 | 变更集 apply | 让结构化记忆相关内容重新写入向量层 | 向量后端、`MemoryTask` | TaskCenter |
| `memory_task:graph_update` | Structured Memory apply 后 | 变更集 apply | 当前实现直接 skip，图上下文在 query 时实时计算 | `MemoryTask.result_json` | TaskCenter |
| `memory_task:fractal_rebuild` | Structured Memory apply 后 | 变更集 apply | 基于结构化变更重建 fractal | `FractalMemory`、`MemoryTask` | TaskCenter、FractalPage |

### 6.3 章节定稿后的自动更新总线

`Chapter status -> done` 后，系统会根据项目设置按需调度：

- `vector_rebuild`
- `search_rebuild`
- `worldbook_auto_update`
- `characters_auto_update`
- `plot_auto_update`
- `table_ai_update`
- `graph_auto_update`
- `fractal_rebuild`

这些任务都有幂等 key、事件流、retry/cancel/watchdog 机制。

## 7. 端到端链路图谱

### 7.1 主用户链路

- 认证/会话 -> `Login/Register/AuthContext` -> `auth/*` -> `User/UserPassword/AuthExternalAccount + session cookie` -> 进入 Dashboard -> 管理入口是 AdminUsersPage
- 仪表盘/项目创建 -> Dashboard 新建项目 -> `POST /api/projects` -> `Project`（及其默认关联配置） -> 下游进入 Wizard 或 Writing
- 开工向导 -> Wizard 拉取 settings/characters/outline/llm_preset/profile -> 用户可一键 `outline/generate + outlines create + chapters bulk_create` -> 落 `Outline/Chapter` -> 下游进入 Writing
- 项目设定/角色 -> Settings/Characters -> `projects/{id}`、`settings`、`characters` -> 改 `Project/ProjectSettings/Character` -> 给 Outline/Writing/Prompts 提供上下文
- 模型与 Prompt 配置 -> Prompts/PromptStudio/PromptTemplates/Styles -> `llm_preset / llm_profiles / llm_task_presets / prompts / writing_styles` -> 落 `LLMPreset/LLMProfile/LLMTaskPreset/PromptPreset/PromptBlock/WritingStyle` -> 下游给 outline generate、chapter generate、auto update 使用
- 大纲生成与版本管理 -> OutlinePage -> `outline/generate` 或 `outline/generate-stream` -> `Outline` 版本化 -> `PUT /api/projects/{id}` 变更 active outline -> 下游到 Writing
- 章节创建/编辑/流式生成 -> WritingPage -> `chapters CRUD + plan + generate + generate-stream + post_edit_adoption` -> 写 `Chapter`、留 `GenerationRun` -> UI 展示内容对比、历史、prompt inspector
- 分析/重写/采纳 -> WritingPage/ChapterAnalysisPage -> `analyze / rewrite / analysis/apply` -> 写 `GenerationRun`、annotation/分析结果、可采纳回章节 -> 下游到 Reader/Preview/TaskCenter
- 定稿后自动更新总线 -> `PUT /api/chapters/{id}` 改 done 或 `trigger_auto_updates` -> 创建 `ProjectTask` -> worker 落库到 worldbook/character/story memory/tables/search/vector/fractal/structured memory -> TaskCenter 监控
- 预览/阅读 -> PreviewPage/ReaderPage -> 读 `chapters meta/detail + memory/preview` -> 无主实体写入 -> 提供跨章节阅读与记忆侧栏
- 导出 -> ExportPage -> `export/markdown` -> 生成文件下载 -> 无持久写入

### 7.2 知识与记忆链路

- 世界书手工链路 -> WorldBookPage/ImportPage -> `worldbook_entries CRUD/import/export/bulk_*` -> `WorldBookEntry` -> Search/RAG/Reader/Prompt 上下文消费
- 世界书自动链路 -> 章节 done / WorldBook 手动触发 -> `worldbook_entries/auto_update` 或调度 `worldbook_auto_update` -> `WorldBookEntry + GenerationRun + ProjectTask` -> WorldBookPage/TaskCenter 可见
- 角色卡链路 -> CharactersPage 手工 CRUD 或 `characters_auto_update` -> `Character` -> Outline/Writing/Prompt 使用
- 故事记忆链路 -> Story memory CRUD/merge/mark_done + plot auto update -> `StoryMemory` -> ForeshadowsPage、SearchPage、Reader 记忆侧栏使用
- 伏笔链路 -> `story_memories/foreshadows/open_loops` -> resolve -> `StoryMemory` 状态变化 -> ForeshadowsPage 可视化闭环
- 结构化记忆链路 -> StructuredMemoryPage / graph/table auto update -> `memory/propose` -> `MemoryChangeSet` -> `apply/rollback` -> 更新 `MemoryEntity/Relation/Event/Foreshadow/Evidence` -> 触发 `MemoryTask`
- 分形链路 -> 章节 done、StructuredMemory apply、FractalPage 手动 rebuild -> `rebuild_fractal_memory` -> `FractalMemory` -> FractalPage/Reader/上下文服务使用

### 7.3 检索与分析链路

- 导入文档 -> ImportPage 上传 -> `POST /api/projects/{id}/imports` -> `ProjectSourceDocument` -> `import_task` 切 chunk -> `ProjectSourceDocumentChunk`
- 导入后二次应用 -> ImportPage -> `worldbook_entries/import_all` 或 `story_memories/import_all` -> 把导入提案写成 `WorldBookEntry` 或 `StoryMemory`
- 向量知识库 -> RagPage -> `vector/kbs CRUD + status + ingest + rebuild + query` -> `KnowledgeBase + 向量后端 + ProjectSettings` -> RAG 检索、ContextPreview、Prompt 配置 dry-run 共享
- 搜索引擎 -> SearchPage -> `search/query` -> `SearchIndex` 命中 chapter/outline/worldbook/character/story_memory/source_document/project_table_row/memory_* 等来源 -> 跳转到目标页
- 图谱链路 -> GraphPage -> `graph/query` + `graph/auto_update` -> 查询 `StructuredMemory` 或发起更新任务 -> GraphPage/StructuredMemoryPage/TaskCenter 联动

### 7.4 后台与运维链路

- Task Center -> `health + task-events/stream + tasks + memory_tasks + change_sets` -> 聚合 `ProjectTask/ProjectTaskEvent/MemoryTask/MemoryChangeSet` -> 用户可重试、取消、apply、rollback
- Runtime 追踪 -> `tasks/{id}/runtime` -> 聚合 ProjectTask 事件、关联运行 artifact -> TaskCenter runtime panel 可看详细状态
- Generation 调试 -> Writing 历史抽屉 / TaskCenter -> `generation_runs/{id}`、`debug_bundle` -> 获取 prompt/output/error/request_id
- MCP 回放 -> `mcp/runs/{run_id}/replay` -> 复用 `GenerationRun(type=mcp_tool)` 参数重放 -> 产出新的 generation run -> 当前无前台页
- Health -> `/api/health` -> 返回 app version + queue/worker 状态 -> TaskCenter banner 读取

## 8. 测试与迁移反查出的非显性能力

- Provider 兼容：测试覆盖 OpenAI、OpenAI Responses、Anthropic、Gemini 的额外参数、重试与 thinking 配置
- 流式细节：测试覆盖 outline/chapter streaming、keepalive、早断、协议错误、重连容错
- 安全：测试覆盖日志脱敏、secrets redaction、settings API key redaction、request size limit、schema fail-closed、security guard
- 配置：测试覆盖 CORS prod guard、database URL 归一化、env 合同、SQLite datetime 兼容
- 任务系统：测试覆盖 inline queue、RQ、watchdog reconcile、SSE endpoint、retry/cancel、队列缺失补偿
- Auto update 合同：测试覆盖 worldbook、graph、table、plot、memory update 的 parse/apply/error detail 合同
- 数据迁移：alembic 持续演进出多大纲、LLM profiles 密钥加密、Prompt presets、向量配置、结构化记忆、成员协作、搜索索引、任务事件等能力
- 运维：`scripts/` 里有 worker 启动、SQLite->Postgres 迁移、LLM profile secrets 迁移、质量闸门、项目只读检查等脚本

## 9. 隐藏能力、实现漂移与潜在漏项

### 9.1 已确认的隐藏能力

- Glossary 后端 API 完整存在，但前端没有独立术语表页面
- 项目 bundle 导入 `POST /api/projects/import_bundle` 存在，但主界面没有显式入口
- Bundle 导出 `GET /api/projects/{id}/export/bundle` 存在，但 ExportPage 当前只显式使用 Markdown 导出
- `POST /api/auth/password/change` 存在，但前台没有明确账号安全页
- `POST /api/projects/{id}/vector/purge` 存在，但 RagPage 未见清理按钮
- `GET /api/projects/{id}/memory/retrieve` 存在，但前台主要走 `memory/preview`
- `POST /api/projects/{id}/tables/change_sets/propose` 存在，但没有独立表级 change set 工作台
- MCP 路由存在，但当前仅是 mock tool 基础设施

### 9.2 README 与代码的主要差异

- README 高层提到“术语表（Glossary）与重建”，代码实现确实存在，但 UI 未以独立页面暴露
- README 没有强调“项目成员协作 / RBAC / 管理员用户页”，但代码与测试已完整支持
- README 没有强调“Task watchdog / heartbeat / orphan requeue / queue health”，但这是任务系统的重要实现细节
- README 没有强调“Prompt task presets、vector embedding/rerank dry-run、query preprocessing”，代码里已经是重要配置面
- README 没有强调 `MCP replay`、`generation debug bundle` 这类调试能力

### 9.3 当前可见的产品/实现风险

- `SearchPage` 虽然可搜 `story_memory`、`source_document`、`memory_relation`，但跳转逻辑未完整实现，用户可能只能收到“暂不支持跳转”提示
- `Glossary` 已有独立 API，却被前端路由并到 Search，功能发现性较差
- `MCP` 名义上存在“tools/replay”，但当前工具集合仅 mock，若当作正式集成能力会造成误判
- `batch_generation` 同时维护 `BatchGenerationTask` 与运行态 `ProjectTask(kind=batch_generation_orchestrator)`，对运维理解有一定门槛
- `memory_task:graph_update` 当前是 skip 语义，不是真正 rebuild；若只看任务名容易误判

## 10. 结论

- 这是一个以“长篇小说写作生产线”为主轴的项目，核心闭环已经完整覆盖：认证、项目、设定、角色、Prompt、模型、大纲、章节生成、分析、自动更新、预览、导出
- 真正的系统重心不只在写作页，而是“写作页 + 任务中心 + 结构化记忆 + 世界书/图谱/向量检索”四层协作
- 项目已经明显超出普通 CRUD 应用，具备多队列、多上下文层、多落库层、多调试入口的工程复杂度
- 如果后续还要继续深挖，建议下一轮补“运行态验证报告”，重点验证 `chapter done -> 全链路 auto update`、`RAG ingest/query`、`Search 跳转一致性`、`bundle import/export` 四条链路
