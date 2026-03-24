# ainovel（demo）

在线演示： https://demo.ainovel.de

一个用于小说创作与项目管理的 Web Demo：前端 React + 后端 FastAPI。

支持多 Provider LLM（OpenAI / OpenAI-compatible、Anthropic Claude、Google Gemini），并提供写作流式生成、知识库/记忆管理、RAG/向量检索、图谱/搜索与导入导出等能力。

## 目录结构

- `frontend/`：Web UI（Vite）
- `backend/`：API 服务（FastAPI）

## 功能概览（节选）

### 写作工作流

- 项目与设定：项目向导、世界观/风格/约束配置
- 大纲与章节：大纲/章节的 SSE 流式生成与应用、章节预览与阅读、章节分析
- 批量生成：后台批量生成任务（可取消/重试），生成记录与调试包
- 导入/导出：项目 Bundle（JSON）导入导出与 Markdown 导出

### 知识库与记忆

- 世界书：条目 CRUD、批量更新/删除、导入/导出、自动更新任务
- 角色与术语：角色卡管理、术语表（Glossary）与重建
- 故事记忆：Story memories、伏笔（open loops）管理与闭环
- 结构化记忆：变更集（apply/rollback）、自动/半自动提议与落库
- 数值表：表/行管理、默认种子、AI 更新

### 检索与分析

- RAG：文档导入与切分、KB 管理、ingest/rebuild/query、embedding/rerank dry-run；向量后端支持 `pgvector`/`Chroma`
- Graph：关系查询与自动更新任务
- 搜索：项目内搜索

### Prompt 与模型

- LLM 配置：项目级 LLM preset + 用户级 LLM profiles；API Key 加密存储、日志与接口输出脱敏（仅返回 `has_api_key` / `masked_api_key`）
- Prompt Presets：预设与 blocks、预览、导入/导出、重置为默认
- 写作风格：内置风格 presets，支持设置项目默认风格

### 多用户与工程化

- 账号体系：本地注册/登录、管理员用户管理、可选 LinuxDo OIDC 登录
- 后台任务：Docker Compose 默认启用 Redis + `rq_worker`（任务中心可查看/重试/取消）
- 可观测性：后端 JSON 日志 + `X-Request-Id`；关键操作可追踪

## 快速部署（Docker Compose，推荐）

前置：安装 Docker Engine + Docker Compose v2。

1) 准备环境变量（不要提交到 git）：

```bash
cp .env.docker.example .env.docker
# 至少修改 AUTH_ADMIN_PASSWORD（>= 8 位）
```

2) 启动：

```bash
docker compose --env-file .env.docker up -d --build
docker compose ps
```

3) 访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`（API 前缀 `/api`；前端容器会反代 `/api/`）

生产环境建议（不对外暴露 Postgres/Redis 端口）：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker up -d --build
```

常用命令：

```bash
docker compose logs -f backend
docker compose logs -f rq_worker
docker compose down            # 保留数据卷
docker compose down -v         # 删除数据卷（不可恢复）
```

数据持久化卷：

- `postgres_data`：Postgres 数据
- `app_data`：应用数据（例如 `/data/chroma`、`/data/secrets`）

## 本地开发（可选）

### 后端（SQLite）

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --workers 1 --port 8000
```

说明：

- SQLite 模式仅支持单 worker；需要多 worker/后台任务队列时，使用 Docker Compose（Postgres + Redis + `rq_worker`）。
- SQLite 模式下避免长事务（尤其是 LLM 调用期间不要持有 DB 事务）。

### 前端

```bash
cd frontend
npm install
npm run dev
```

## 配置提示（最小）

- 管理员：由 `AUTH_ADMIN_USER_ID` / `AUTH_ADMIN_PASSWORD` 在“首次初始化空数据库”时写入；后续修改 env 不会自动重置既有密码（需要新数据卷才会重新初始化）。
- LLM：在页面「Prompts」里填写 provider / base_url / api_key；服务端日志会对 key 做脱敏。
- 外部 Postgres：需支持 `pgvector`（`CREATE EXTENSION vector`）；否则可将 `VECTOR_BACKEND=chroma`。
- 可选 OIDC：`LINUXDO_OIDC_*`（见 `docker-compose.yml` 与 `.env.docker.example`）。

## 安全

- 上线前务必修改默认密码，并确保 `.env.docker` 不入库。
- 生产环境请使用 `APP_ENV=prod`，并关闭/清空 `AUTH_DEV_FALLBACK_USER_ID`（避免 dev_fallback 带来的鉴权绕过风险）。

## 开源许可证

本项目采用 MIT License 开源，详见根目录 [LICENSE](./LICENSE)。

你可以在遵守 MIT 条款的前提下自由使用、修改和分发本项目；分发时请保留原始版权声明与许可证文本。

说明：

- 仓库内如包含第三方依赖/资源，其版权与许可证以各自上游声明为准。
- 本项目按 MIT 条款以 “AS IS” 方式提供，不提供任何明示或暗示担保。
