# DocPilot

AI 驱动的 Vibe Writing 平台。像 Vibe Coding 写代码一样，用自然语言对话编辑 `.docx` 文档。

## 功能

- **文档编辑**：基于 [SuperDoc](https://github.com/superdoc-dev/superdoc) 的富文本 `.docx` 编辑器
- **AI 对话**：在右侧聊天窗口用自然语言指挥 AI 修改文档
- **建议模式 / 直接编辑**：建议模式以 Track Changes 形式展示 AI 的修改，直接编辑模式立即生效
- **文档管理**：上传 `.docx`、新建空白文档、下载文档
- **实时协同预留**：基于 Yjs CRDT，架构支持后续多人协作扩展

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + TypeScript + SuperDoc + Tailwind CSS + Zustand |
| 后端 | FastAPI + Python 3.11+ + LiteLLM + uv |
| 协同服务 | Node.js + Fastify + Yjs + `@superdoc-dev/superdoc-yjs-collaboration` |
| 存储 | MinIO（S3 兼容，自托管） |

## 项目结构

```
DocPilot/
├── frontend/          # React 前端
├── backend/           # FastAPI 后端
├── collab-server/     # Yjs 协同服务（Node.js）
├── docs/              # 设计文档
├── .env.example       # 环境变量模板
└── Makefile           # 常用命令
```

## 前置要求

- **Node.js** >= 18
- **Python** >= 3.11
- **uv**（Python 包管理器）：`curl -LsSf https://astral.sh/uv/install.sh | sh`
- **MinIO**：本地或远程实例，需要 Access Key 和 Secret Key
- **LLM API**：OpenAI-compatible 接口（OpenAI、Azure OpenAI、本地 Ollama 等）

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

编辑 `.env`，填入实际配置：

```env
# MinIO 存储
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=docpilot-documents
MINIO_USE_SSL=false

# LLM（支持任意 OpenAI-compatible 接口）
LITELLM_MODEL=gpt-4o
LITELLM_API_KEY=sk-xxx
LITELLM_API_BASE=          # 留空使用 OpenAI 官方；填写自定义地址如 http://localhost:11434/v1
```

### 3. 安装依赖

```bash
make install
```

等价于：
```bash
cd collab-server && npm install
cd frontend && npm install
cd backend && uv sync
```

### 4. 启动开发服务

需要打开**三个终端**分别运行：

**终端 1 — 协同服务**（端口 3050）
```bash
make dev-collab
```
启动成功提示：`Server listening at http://0.0.0.0:3050`

**终端 2 — 后端 API**（端口 8000）
```bash
make dev-backend
```
启动成功提示：`Uvicorn running on http://0.0.0.0:8000`

**终端 3 — 前端**（端口 5173）
```bash
make dev-frontend
```
启动成功提示：`Local: http://localhost:5173`

### 5. 打开浏览器

访问 [http://localhost:5173](http://localhost:5173)

## 使用说明

| 操作 | 方法 |
|------|------|
| 上传文档 | 点击工具栏「上传文档」，选择 `.docx` 文件 |
| 新建文档 | 点击工具栏「新建文档」 |
| AI 对话 | 在右侧聊天框输入指令，按 Enter 或点击「发送」 |
| 切换编辑模式 | 工具栏点击「建议模式 / 直接编辑」切换 |
| 下载文档 | 工具栏点击「下载」 |

### AI 指令示例

```
帮我在文档开头加一个标题：季度总结报告
把第二段改成更正式的语气
在文档末尾插入一个表格，三列：姓名、部门、职位
把所有"公司"替换成"本公司"
```

## 运行测试

```bash
cd backend && uv run pytest
```

## API 文档

后端启动后访问：

- Swagger UI：[http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc：[http://localhost:8000/redoc](http://localhost:8000/redoc)

## 架构说明

```
浏览器
  │
  ├─ HTTP ──→ FastAPI (8000)        # 文档 CRUD、AI Agent WebSocket
  │               │
  │               └─ LiteLLM ──→ LLM API
  │
  └─ WebSocket ──→ Fastify (3050)   # Yjs 实时协同
                      │
                      └─ MinIO      # .docx 文档持久化存储
```

前端通过两条独立连接工作：
- **Yjs WebSocket**（→ 协同服务 3050）：同步编辑器文档状态
- **Chat WebSocket**（→ 后端 8000）：与 AI Agent 通信；AI 修改文档同样通过 Yjs 同步回编辑器

## 设计文档

详见 [docs/](docs/README.md)，包含架构设计、前后端技术方案、AI Agent 设计等。
