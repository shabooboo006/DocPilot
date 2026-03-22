# DocPilot

AI 驱动的 Vibe Writing 平台。像 Vibe Coding 写代码一样，用自然语言对话编辑 `.docx` 文档，并支持对招标文件做结构化提取和交互式分析。

## 功能

- **文档编辑**：基于 [SuperDoc](https://github.com/superdoc-dev/superdoc) 的真实 `.docx` 编辑器
- **AI 对话**：右侧聊天窗口用自然语言指挥 AI 修改文档
- **建议模式 / 直接编辑**：建议模式以 Track Changes 形式展示 AI 的修改，直接编辑模式立即生效
- **文档管理**：上传 `.docx`、新建空白文档、下载文档
- **招标分析**：点击工具栏「招标分析」，由 backend 内嵌的 CrewAI 团队提取关键信息，并驱动驾驶舱和 Manus 风格过程流

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + TypeScript + SuperDoc + Tailwind CSS + Zustand |
| 后端 | FastAPI + Python 3.11+ + LiteLLM + CrewAI + uv |
| 协同服务 | Node.js + Fastify + Yjs + `@superdoc-dev/superdoc-yjs-collaboration` |
| 存储 | MinIO（S3 兼容，自托管） |

## 项目结构

```text
DocPilot/
├── frontend/          # React 前端
├── backend/           # FastAPI 后端（含 CrewAI 招标提取团队）
├── collab-server/     # Yjs 协同服务（Node.js）
├── docs/              # 设计文档
├── .env.example       # 环境变量模板
└── Makefile           # 常用命令
```

## 前置要求

- **Node.js** >= 18
- **Python** >= 3.11
- **uv**：`curl -LsSf https://astral.sh/uv/install.sh | sh`
- **MinIO**：本地或远程实例，需要 Access Key 和 Secret Key
- **LLM API**：任意 OpenAI-compatible 接口

## 开发环境搭建

### 1. 克隆项目

```bash
git clone <repo-url>
cd DocPilot
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# MinIO 存储
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=docpilot-documents
MINIO_USE_SSL=false

# LLM / CrewAI（支持任意 OpenAI-compatible 接口）
LITELLM_MODEL=gpt-4o
LITELLM_API_KEY=sk-xxx
LITELLM_API_BASE=
CREWAI_VERBOSE=false

# Tambo（可选，启用招标驾驶舱中的 Generative UI）
VITE_TAMBO_API_KEY=
```

说明：

- backend 内部直接创建 CrewAI 团队，不再依赖额外 sidecar 服务
- CrewAI 复用 `LITELLM_MODEL / LITELLM_API_KEY / LITELLM_API_BASE`
- 如果没有 `LITELLM_API_KEY`，招标分析会在 backend 内返回明确配置错误

### 3. 安装依赖

```bash
make install
```

等价于：

```bash
cd collab-server && npm install
cd frontend && npm install
cd backend && uv venv && uv sync
```

### 4. 启动开发服务

需要打开 **三个终端**：

**终端 1 - 协同服务**（端口 6350）

```bash
make dev-collab
```

**终端 2 - 后端 API**（端口 6800）

```bash
make dev-backend
```

**终端 3 - 前端**（端口 6173）

```bash
make dev-frontend
```

### 5. 打开浏览器

访问 [http://localhost:6173](http://localhost:6173)

## 使用说明

| 操作 | 方法 |
|------|------|
| 上传文档 | 点击工具栏「上传文档」，选择 `.docx` 文件 |
| 新建文档 | 点击工具栏「新建文档」 |
| AI 对话 | 在右侧聊天框输入指令，按 Enter 或点击「发送」 |
| 切换编辑模式 | 工具栏点击「建议模式 / 直接编辑」切换 |
| 下载文档 | 工具栏点击「下载」 |
| 招标分析 | 点击工具栏「招标分析」，触发 backend 内嵌 CrewAI 团队执行提取 |

## 运行测试

```bash
cd backend && uv run pytest
cd frontend && npm run lint
cd frontend && npm run build
```

## API 文档

后端启动后访问：

- Swagger UI：[http://localhost:6800/docs](http://localhost:6800/docs)
- ReDoc：[http://localhost:6800/redoc](http://localhost:6800/redoc)

## 架构说明

```text
浏览器
  │
  ├─ HTTP ──→ FastAPI (6800)        # 文档 CRUD、AI Agent WebSocket、招标分析 API
  │               │
  │               ├─ LiteLLM ──→ LLM API
  │               └─ CrewAI Crew    # backend 内嵌招标提取团队
  │
  └─ WebSocket ──→ Fastify (6350)   # Yjs 实时协同
                      │
                      └─ MinIO      # .docx 文档持久化存储
```

前端通过两条连接工作：

- **Yjs WebSocket**（→ 协同服务 6350）：同步编辑器文档状态
- **Chat WebSocket**（→ 后端 6800）：与 AI Agent 通信；AI 修改文档同样通过 Yjs 同步回编辑器

招标分析通过 backend 内部链路工作：

- **Tender Analysis Crew**（backend 内部）：顺序执行 `inventory / core_facts / timeline / requirements / risk_review`
- **Tender Analysis Events**（backend → frontend WebSocket）：前端展示 Manus 风格纵向步骤卡片流

## 招标分析排查

如果点击「招标分析」后失败，优先检查：

1. `make dev-backend` 是否正常启动
2. `.env` 中 `LITELLM_API_KEY` 是否存在
3. `.env` 中 `LITELLM_API_BASE` 是否可达
4. `collab-server` 是否已启动，否则 backend 无法读取 SuperDoc 文档上下文

常见错误：

- `未配置 LITELLM_API_KEY，无法启动 CrewAI 招标提取团队。`
  - 说明 backend 没拿到 LLM 凭证
- `无法连接 SuperDoc executor`
  - 说明 `collab-server` 没启动，或 `SUPERDOC_EXECUTOR_URL` 配错
- LLM provider 4xx / 5xx
  - 说明上游模型配置、鉴权或兼容接口有问题

## 设计文档

详见 [docs/](docs/README.md)。
