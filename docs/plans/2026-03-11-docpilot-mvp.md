# DocPilot MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the DocPilot MVP — a web-based AI-driven .docx editor with chat-driven document editing, using SuperDoc + Yjs + FastAPI + React.

**Architecture:** Three services (React frontend, Node.js Yjs collab server, Python FastAPI backend) communicate via WebSocket. The backend runs an AI agentic loop using LiteLLM + SuperDoc Python SDK, connected to the same Yjs collaboration room as the frontend editor. Documents are stored in MinIO.

**Tech Stack:** React 18 + Vite + TypeScript + SuperDoc + Tailwind CSS | FastAPI + LiteLLM + superdoc-sdk + boto3 | Fastify + @superdoc-dev/superdoc-yjs-collaboration + minio

**Spec:** `docs/architecture/overview.md`

---

## File Structure

```
DocPilot/
├── .env.example
├── .gitignore
├── Makefile
├── collab-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts              # Fastify entry, WebSocket endpoint
│   │   ├── config.ts             # Environment config
│   │   └── storage.ts            # MinIO read/write adapter
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI entry, CORS, router registration
│   │   ├── config.py             # Settings via pydantic-settings
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── documents.py      # REST: upload, create, download, delete, info
│   │   │   └── chat.py           # WebSocket: /ws/chat/{document_id}
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── document_service.py   # MinIO CRUD operations
│   │   │   ├── superdoc_service.py   # SuperDoc SDK session management
│   │   │   └── agent_service.py      # LiteLLM agentic loop
│   │   └── models/
│   │       ├── __init__.py
│   │       └── schemas.py            # Pydantic models
│   └── tests/
│       ├── __init__.py
│       ├── test_config.py
│       ├── test_document_service.py
│       └── test_agent_service.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── hooks/
│   │   │   ├── useDocumentStore.ts
│   │   │   ├── useChatStore.ts
│   │   │   └── useWebSocket.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   ├── Toolbar.tsx
│   │   │   │   └── StatusBar.tsx
│   │   │   ├── editor/
│   │   │   │   ├── EditorPanel.tsx
│   │   │   │   └── useSuperdoc.ts
│   │   │   └── chat/
│   │   │       ├── ChatPanel.tsx
│   │   │       ├── MessageList.tsx
│   │   │       ├── MessageBubble.tsx
│   │   │       ├── ToolCallIndicator.tsx
│   │   │       └── ChatInput.tsx
```

---

## Chunk 1: Project Scaffolding

### Task 1: Initialize project root files

**Files:**
- Create: `.env.example`
- Create: `.gitignore`
- Create: `Makefile`

- [ ] **Step 1: Create `.env.example`**

```bash
# .env.example

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=docpilot-documents
MINIO_USE_SSL=false

# LiteLLM
LITELLM_MODEL=gpt-4o
LITELLM_API_KEY=sk-xxx
LITELLM_API_BASE=

# Service Ports
FRONTEND_PORT=5173
COLLAB_SERVER_PORT=3050
BACKEND_PORT=8000
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/

# Environment
.env

# Build
dist/
build/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Create `Makefile`**

```makefile
.PHONY: install dev-collab dev-backend dev-frontend dev

install:
	cd collab-server && npm install
	cd frontend && npm install
	cd backend && uv sync

dev-collab:
	cd collab-server && npm run dev

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "请在三个终端分别运行:"
	@echo "  make dev-collab"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"
```

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore Makefile
git commit -m "chore: add project root files (.env.example, .gitignore, Makefile)"
```

---

### Task 2: Initialize collab-server project

**Files:**
- Create: `collab-server/package.json`
- Create: `collab-server/tsconfig.json`

- [ ] **Step 1: Initialize collab-server package**

```bash
cd collab-server
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
cd collab-server
npm install @superdoc-dev/superdoc-yjs-collaboration fastify @fastify/websocket minio dotenv
npm install -D typescript @types/node tsx
```

- [ ] **Step 3: Create `collab-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Update `collab-server/package.json` scripts**

Ensure the `scripts` section contains:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "type": "module"
}
```

- [ ] **Step 5: Commit**

```bash
git add collab-server/
git commit -m "chore: initialize collab-server project with dependencies"
```

---

### Task 3: Initialize backend project

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "docpilot-backend"
version = "0.1.0"
description = "DocPilot FastAPI backend"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "websockets>=14",
    "litellm>=1.60",
    "superdoc-sdk",
    "boto3>=1.35",
    "python-multipart>=0.0.18",
    "pydantic-settings>=2.7",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8",
    "pytest-asyncio>=0.24",
    "httpx>=0.28",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.backends"
```

- [ ] **Step 2: Create `__init__.py` files**

Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`.

- [ ] **Step 3: Install dependencies**

```bash
cd backend
uv sync
```

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "chore: initialize backend project with dependencies"
```

---

### Task 4: Initialize frontend project

**Files:**
- Create: `frontend/` (via Vite scaffold)

- [ ] **Step 1: Scaffold React project with Vite**

```bash
npm create vite@latest frontend -- --template react-ts
```

If the directory already exists, scaffold into a temp dir and move files.

- [ ] **Step 2: Install additional dependencies**

```bash
cd frontend
npm install superdoc yjs y-websocket zustand
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Tailwind CSS**

In `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
})
```

In `frontend/src/index.css`, replace content with:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Verify frontend starts**

```bash
cd frontend && npm run dev
```

Expected: Vite dev server starts on port 5173. Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "chore: initialize frontend project with React + Vite + Tailwind + SuperDoc"
```

---

## Chunk 2: Collab Server

### Task 5: Implement collab-server config

**Files:**
- Create: `collab-server/src/config.ts`

- [ ] **Step 1: Create config module**

```typescript
// collab-server/src/config.ts
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.COLLAB_SERVER_PORT || '3050', 10),
  minio: {
    endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
    port: parseInt(process.env.MINIO_ENDPOINT?.split(':')[1] || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'docpilot-documents',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add collab-server/src/config.ts
git commit -m "feat(collab): add config module with MinIO and port settings"
```

---

### Task 6: Implement collab-server MinIO storage adapter

**Files:**
- Create: `collab-server/src/storage.ts`

- [ ] **Step 1: Create storage adapter**

```typescript
// collab-server/src/storage.ts
import { Client } from 'minio';
import { config } from './config.js';

const minioClient = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(config.minio.bucket);
  if (!exists) {
    await minioClient.makeBucket(config.minio.bucket);
    console.log(`Created bucket: ${config.minio.bucket}`);
  }
}

export async function loadDocument(documentId: string): Promise<Buffer> {
  const key = `documents/${documentId}/current.docx`;
  const stream = await minioClient.getObject(config.minio.bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function saveDocument(documentId: string, data: Buffer): Promise<void> {
  const key = `documents/${documentId}/current.docx`;
  await minioClient.putObject(config.minio.bucket, key, data);
}
```

- [ ] **Step 2: Commit**

```bash
git add collab-server/src/storage.ts
git commit -m "feat(collab): add MinIO storage adapter for document load/save"
```

---

### Task 7: Implement collab-server main entry

**Files:**
- Create: `collab-server/src/index.ts`

- [ ] **Step 1: Create main server**

```typescript
// collab-server/src/index.ts
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { CollaborationBuilder } from '@superdoc-dev/superdoc-yjs-collaboration';
import { config } from './config.js';
import { ensureBucket, loadDocument, saveDocument } from './storage.js';

const fastify = Fastify({ logger: true });

await fastify.register(websocketPlugin);

const collaboration = new CollaborationBuilder()
  .withName('DocPilot Collaboration')
  .withDebounce(2000)
  .onLoad(async ({ documentId }) => {
    try {
      const doc = await loadDocument(documentId);
      return doc;
    } catch (err: any) {
      if (err.code === 'NoSuchKey') {
        fastify.log.warn(`Document ${documentId} not found in MinIO, starting empty`);
        return null;
      }
      throw err;
    }
  })
  .onAutoSave(async ({ documentId, document }) => {
    await saveDocument(documentId, document);
    fastify.log.info(`Auto-saved document ${documentId}`);
  })
  .build();

fastify.register(async (app) => {
  app.get('/doc/:documentId', { websocket: true }, (socket, request) => {
    const { documentId } = request.params as { documentId: string };
    collaboration.welcome(socket, request);
  });
});

fastify.get('/health', async () => ({ status: 'ok' }));

async function start() {
  await ensureBucket();
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
}

start();
```

Note: The `CollaborationBuilder` API may differ slightly from what's shown above. Consult `@superdoc-dev/superdoc-yjs-collaboration` docs and adjust `onLoad`/`onAutoSave` callback signatures as needed. The key pattern is: load docx from MinIO on room open, save back on auto-save.

- [ ] **Step 2: Verify collab-server starts**

First copy `.env.example` to `.env` and fill in real MinIO credentials. Then:

```bash
cd collab-server && npm run dev
```

Expected: Server starts on port 3050, logs "Server listening at http://0.0.0.0:3050". Verify health check:

```bash
curl http://localhost:3050/health
# {"status":"ok"}
```

- [ ] **Step 3: Commit**

```bash
git add collab-server/src/index.ts
git commit -m "feat(collab): implement Yjs collaboration server with Fastify + WebSocket"
```

---

## Chunk 3: Backend — Config & Document Service

### Task 8: Implement backend config

**Files:**
- Create: `backend/app/config.py`

- [ ] **Step 1: Create config with pydantic-settings**

```python
# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "docpilot-documents"
    minio_use_ssl: bool = False

    # LiteLLM
    litellm_model: str = "gpt-4o"
    litellm_api_key: str = ""
    litellm_api_base: str = ""

    # Services
    collab_server_url: str = "ws://localhost:3050"
    backend_port: int = 8000

    model_config = {"env_file": "../.env", "env_file_encoding": "utf-8"}


settings = Settings()
```

- [ ] **Step 2: Write test**

```python
# backend/tests/test_config.py
import os
from app.config import Settings


def test_settings_defaults():
    s = Settings(
        _env_file=None,
        minio_endpoint="localhost:9000",
        litellm_api_key="test-key",
    )
    assert s.minio_bucket == "docpilot-documents"
    assert s.collab_server_url == "ws://localhost:3050"
    assert s.backend_port == 8000
```

- [ ] **Step 3: Run test**

```bash
cd backend && uv run pytest tests/test_config.py -v
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat(backend): add config module with pydantic-settings"
```

---

### Task 9: Implement Pydantic schemas

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/schemas.py`

- [ ] **Step 1: Create schemas**

```python
# backend/app/models/schemas.py
from pydantic import BaseModel


class DocumentInfo(BaseModel):
    document_id: str
    name: str
    size: int | None = None


class DocumentCreateResponse(BaseModel):
    document_id: str
    name: str


class ChatMessage(BaseModel):
    type: str
    content: str = ""
    tool: str = ""
    status: str = ""
    description: str = ""
    result: dict | None = None
    message: str = ""
    streaming: bool = False
```

- [ ] **Step 2: Create empty `__init__.py`**

Create `backend/app/models/__init__.py` (empty file).

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/
git commit -m "feat(backend): add Pydantic request/response schemas"
```

---

### Task 10: Implement document service (MinIO CRUD)

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/document_service.py`
- Create: `backend/tests/test_document_service.py`

- [ ] **Step 1: Create document service**

```python
# backend/app/services/document_service.py
import uuid
import io
import boto3
from botocore.config import Config as BotoConfig
from app.config import settings


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=f"{'https' if settings.minio_use_ssl else 'http'}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name="us-east-1",
    )


s3 = _get_s3_client()
BUCKET = settings.minio_bucket


def ensure_bucket():
    try:
        s3.head_bucket(Bucket=BUCKET)
    except Exception:
        s3.create_bucket(Bucket=BUCKET)


def generate_id() -> str:
    return uuid.uuid4().hex[:12]


def upload_document(filename: str, file_data: bytes) -> str:
    document_id = generate_id()
    original_key = f"documents/{document_id}/original.docx"
    current_key = f"documents/{document_id}/current.docx"
    s3.put_object(Bucket=BUCKET, Key=original_key, Body=file_data)
    s3.put_object(Bucket=BUCKET, Key=current_key, Body=file_data)
    # Store metadata
    meta_key = f"documents/{document_id}/meta.json"
    import json
    meta = json.dumps({"name": filename, "document_id": document_id})
    s3.put_object(Bucket=BUCKET, Key=meta_key, Body=meta.encode())
    return document_id


def create_blank_document(name: str) -> str:
    document_id = generate_id()
    # Create a minimal valid .docx - superdoc can handle empty docs
    # For now, store an empty placeholder; superdoc collab server will create the doc
    current_key = f"documents/{document_id}/current.docx"
    # We don't upload a file — the collab server's onLoad will return null
    # and superdoc will create a blank document in the Yjs room
    meta_key = f"documents/{document_id}/meta.json"
    import json
    meta = json.dumps({"name": name, "document_id": document_id})
    s3.put_object(Bucket=BUCKET, Key=meta_key, Body=meta.encode())
    return document_id


def get_document_info(document_id: str) -> dict:
    meta_key = f"documents/{document_id}/meta.json"
    import json
    resp = s3.get_object(Bucket=BUCKET, Key=meta_key)
    return json.loads(resp["Body"].read())


def download_document(document_id: str) -> bytes:
    key = f"documents/{document_id}/current.docx"
    resp = s3.get_object(Bucket=BUCKET, Key=key)
    return resp["Body"].read()


def delete_document(document_id: str):
    # List and delete all objects under the document prefix
    prefix = f"documents/{document_id}/"
    response = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    if "Contents" in response:
        for obj in response["Contents"]:
            s3.delete_object(Bucket=BUCKET, Key=obj["Key"])
```

- [ ] **Step 2: Write test (mocked S3)**

```python
# backend/tests/test_document_service.py
from unittest.mock import patch, MagicMock
import json


@patch("app.services.document_service.s3")
def test_upload_document(mock_s3):
    from app.services.document_service import upload_document
    doc_id = upload_document("test.docx", b"fake-docx-content")
    assert len(doc_id) == 12
    assert mock_s3.put_object.call_count == 3  # original + current + meta


@patch("app.services.document_service.s3")
def test_get_document_info(mock_s3):
    from app.services.document_service import get_document_info
    meta = json.dumps({"name": "test.docx", "document_id": "abc123"})
    mock_s3.get_object.return_value = {
        "Body": MagicMock(read=MagicMock(return_value=meta.encode()))
    }
    info = get_document_info("abc123")
    assert info["name"] == "test.docx"


@patch("app.services.document_service.s3")
def test_create_blank_document(mock_s3):
    from app.services.document_service import create_blank_document
    doc_id = create_blank_document("New Document")
    assert len(doc_id) == 12
    # Should only store meta (no docx file for blank docs)
    assert mock_s3.put_object.call_count == 1
```

- [ ] **Step 3: Run tests**

```bash
cd backend && uv run pytest tests/test_document_service.py -v
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ backend/tests/test_document_service.py
git commit -m "feat(backend): implement document service with MinIO CRUD operations"
```

---

### Task 11: Implement document REST API router

**Files:**
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/documents.py`

- [ ] **Step 1: Create documents router**

```python
# backend/app/routers/documents.py
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from app.services import document_service
from app.models.schemas import DocumentCreateResponse, DocumentInfo

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentCreateResponse)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are accepted")
    data = await file.read()
    document_id = document_service.upload_document(file.filename, data)
    return DocumentCreateResponse(document_id=document_id, name=file.filename)


@router.post("/create", response_model=DocumentCreateResponse)
async def create_document(name: str = "Untitled"):
    document_id = document_service.create_blank_document(name)
    return DocumentCreateResponse(document_id=document_id, name=name)


@router.get("/{document_id}/info", response_model=DocumentInfo)
async def get_document_info(document_id: str):
    try:
        info = document_service.get_document_info(document_id)
        return DocumentInfo(**info)
    except Exception:
        raise HTTPException(status_code=404, detail="Document not found")


@router.get("/{document_id}/download")
async def download_document(document_id: str):
    try:
        data = document_service.download_document(document_id)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={document_id}.docx"},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Document not found")


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    document_service.delete_document(document_id)
    return {"status": "deleted"}
```

- [ ] **Step 2: Create empty `__init__.py`**

Create `backend/app/routers/__init__.py` (empty file).

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/
git commit -m "feat(backend): add document REST API endpoints (upload, create, download, delete)"
```

---

### Task 12: Implement FastAPI main entry

**Files:**
- Create: `backend/app/main.py`

- [ ] **Step 1: Create FastAPI app**

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import documents
from app.services.document_service import ensure_bucket

app = FastAPI(title="DocPilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)


@app.on_event("startup")
async def startup():
    ensure_bucket()


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Verify backend starts**

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

Expected: Server starts. Verify:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(backend): add FastAPI main entry with CORS and document router"
```

---

## Chunk 4: Backend — AI Agent

### Task 13: Implement SuperDoc service (SDK session management)

**Files:**
- Create: `backend/app/services/superdoc_service.py`

- [ ] **Step 1: Create superdoc service**

```python
# backend/app/services/superdoc_service.py
from superdoc import SuperDoc
from app.config import settings


class SuperDocService:
    def __init__(self):
        self.sessions: dict[str, SuperDoc] = {}

    async def get_session(self, document_id: str, suggest: bool = True) -> SuperDoc:
        if document_id not in self.sessions:
            sd = SuperDoc()
            await sd.doc.open(
                collabUrl=f"{settings.collab_server_url}/doc/{document_id}",
                collabDocumentId=document_id,
                defaultChangeMode="tracked" if suggest else "default",
                user={"name": "DocPilot AI", "email": "ai@docpilot.local"},
            )
            self.sessions[document_id] = sd
        return self.sessions[document_id]

    async def close_session(self, document_id: str):
        if document_id in self.sessions:
            await self.sessions[document_id].doc.close()
            del self.sessions[document_id]

    async def switch_mode(self, document_id: str, suggest: bool):
        await self.close_session(document_id)
        await self.get_session(document_id, suggest=suggest)

    def get_tools(self, session: SuperDoc, provider: str = "openai"):
        return session.choose_tools(provider=provider)

    def dispatch_tool(self, session: SuperDoc, tool_call):
        return session.dispatch_tool(tool_call)


superdoc_service = SuperDocService()
```

Note: The exact `SuperDoc` Python SDK API may differ. Consult the `superdoc-sdk` package docs for accurate method signatures. Key methods to verify: `doc.open()`, `choose_tools()`, `dispatch_tool()`. Adjust imports and method calls as needed.

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/superdoc_service.py
git commit -m "feat(backend): add SuperDoc service for SDK session management"
```

---

### Task 14: Implement AI agent service (agentic loop)

**Files:**
- Create: `backend/app/services/agent_service.py`

- [ ] **Step 1: Create agent service**

```python
# backend/app/services/agent_service.py
import json
import litellm
from fastapi import WebSocket
from app.config import settings
from app.services.superdoc_service import superdoc_service

SYSTEM_PROMPT = """你是 DocPilot AI 文档助手。用户会要求你编辑当前打开的 .docx 文档。

你的能力：
- 查找和修改文档内容（文字、格式、结构）
- 创建表格、列表、标题、分节等结构元素
- 插入图片、链接、目录
- 管理批注和修订标记
- 调整页面布局、页眉页脚

工作原则：
- 先用 get_document_text 了解文档当前内容，再执行修改
- 批量修改时合并到单次 apply_mutations 调用（减少 tool call 次数）
- 修改完成后简要告知用户做了什么
- 如果用户意图不明确，先询问而不是猜测
"""

MAX_TOOL_ROUNDS = 100


async def run_agent_loop(
    document_id: str,
    user_message: str,
    chat_history: list[dict],
    ws: WebSocket,
    suggest: bool = True,
):
    session = await superdoc_service.get_session(document_id, suggest=suggest)
    tools = superdoc_service.get_tools(session)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(chat_history)
    messages.append({"role": "user", "content": user_message})

    for round_num in range(MAX_TOOL_ROUNDS):
        try:
            response = await litellm.acompletion(
                model=settings.litellm_model,
                messages=messages,
                tools=tools,
                api_key=settings.litellm_api_key,
                api_base=settings.litellm_api_base or None,
            )
        except Exception as e:
            await ws.send_json({"type": "error", "message": f"LLM 调用失败: {str(e)}"})
            return

        choice = response.choices[0]

        # If no tool calls, send final text response
        if not choice.message.tool_calls:
            content = choice.message.content or ""
            await ws.send_json({
                "type": "ai_message",
                "content": content,
                "streaming": False,
            })
            return

        # Process tool calls
        messages.append(choice.message.model_dump())

        for tool_call in choice.message.tool_calls:
            tool_name = tool_call.function.name
            tool_args = json.loads(tool_call.function.arguments)

            await ws.send_json({
                "type": "tool_call",
                "tool": tool_name,
                "status": "executing",
                "description": f"正在执行 {tool_name}...",
            })

            try:
                result = superdoc_service.dispatch_tool(session, tool_call)
                result_str = json.dumps(result) if isinstance(result, (dict, list)) else str(result)

                await ws.send_json({
                    "type": "tool_result",
                    "tool": tool_name,
                    "status": "success",
                    "result": result,
                })
            except Exception as e:
                result_str = f"Error: {str(e)}"
                await ws.send_json({
                    "type": "tool_result",
                    "tool": tool_name,
                    "status": "error",
                    "result": {"error": str(e)},
                })

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result_str,
            })

    # If we exhausted all rounds
    await ws.send_json({
        "type": "ai_message",
        "content": "操作步骤过多，已停止。请尝试更简单的指令。",
        "streaming": False,
    })
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/agent_service.py
git commit -m "feat(backend): implement AI agent service with LiteLLM agentic loop"
```

---

### Task 15: Implement chat WebSocket router

**Files:**
- Create: `backend/app/routers/chat.py`

- [ ] **Step 1: Create chat WebSocket endpoint**

```python
# backend/app/routers/chat.py
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services import agent_service
from app.services.superdoc_service import superdoc_service

router = APIRouter()

# In-memory chat history per document (MVP, no persistence)
chat_histories: dict[str, list[dict]] = {}


@router.websocket("/ws/chat/{document_id}")
async def chat_websocket(ws: WebSocket, document_id: str):
    await ws.accept()

    if document_id not in chat_histories:
        chat_histories[document_id] = []

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)

            if data["type"] == "user_message":
                content = data["content"]
                chat_histories[document_id].append({
                    "role": "user",
                    "content": content,
                })

                suggest = data.get("suggest", True)

                await agent_service.run_agent_loop(
                    document_id=document_id,
                    user_message=content,
                    chat_history=chat_histories[document_id][:-1],
                    ws=ws,
                    suggest=suggest,
                )

            elif data["type"] == "set_suggest_mode":
                suggest = data.get("suggest", True)
                await superdoc_service.switch_mode(document_id, suggest)
                await ws.send_json({
                    "type": "ai_message",
                    "content": f"已切换到{'建议' if suggest else '直接编辑'}模式",
                    "streaming": False,
                })

    except WebSocketDisconnect:
        await superdoc_service.close_session(document_id)
        if document_id in chat_histories:
            del chat_histories[document_id]
```

- [ ] **Step 2: Register chat router in main.py**

Add to `backend/app/main.py`:

```python
from app.routers import documents, chat

# ... existing code ...
app.include_router(chat.router)
```

- [ ] **Step 3: Verify backend starts with both routers**

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

Expected: Server starts without import errors. Check docs at http://localhost:8000/docs — should show document endpoints and health.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/chat.py backend/app/main.py
git commit -m "feat(backend): add chat WebSocket endpoint with agent loop integration"
```

---

## Chunk 5: Frontend — Core Layout & Editor

### Task 16: Set up frontend types and API service

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/services/api.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// frontend/src/types/index.ts

export interface DocumentInfo {
  document_id: string;
  name: string;
  size?: number;
}

export interface DocumentCreateResponse {
  document_id: string;
  name: string;
}

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'system';
  content?: string;
  toolCall?: ToolCallInfo;
  error?: string;
  timestamp: number;
}

export interface ToolCallInfo {
  tool: string;
  status: 'executing' | 'success' | 'error';
  description?: string;
  result?: Record<string, unknown>;
}

export interface ChatWsMessage {
  type: 'user_message' | 'ai_message' | 'tool_call' | 'tool_result' | 'error' | 'set_suggest_mode';
  content?: string;
  tool?: string;
  status?: string;
  description?: string;
  result?: Record<string, unknown>;
  message?: string;
  streaming?: boolean;
  suggest?: boolean;
}
```

- [ ] **Step 2: Create API service**

```typescript
// frontend/src/services/api.ts

const API_BASE = 'http://localhost:8000';

export async function uploadDocument(file: File): Promise<{ document_id: string; name: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function createDocument(name: string = 'Untitled'): Promise<{ document_id: string; name: string }> {
  const res = await fetch(`${API_BASE}/api/documents/create?name=${encodeURIComponent(name)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Create failed');
  return res.json();
}

export async function getDocumentInfo(documentId: string): Promise<{ document_id: string; name: string }> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/info`);
  if (!res.ok) throw new Error('Not found');
  return res.json();
}

export function getDownloadUrl(documentId: string): string {
  return `${API_BASE}/api/documents/${documentId}/download`;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/ frontend/src/services/
git commit -m "feat(frontend): add TypeScript types and API service layer"
```

---

### Task 17: Implement Zustand stores

**Files:**
- Create: `frontend/src/hooks/useDocumentStore.ts`
- Create: `frontend/src/hooks/useChatStore.ts`

- [ ] **Step 1: Create document store**

```typescript
// frontend/src/hooks/useDocumentStore.ts
import { create } from 'zustand';

interface DocumentState {
  documentId: string | null;
  documentName: string;
  suggestMode: boolean;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected';
  setDocument: (id: string, name: string) => void;
  setSuggestMode: (mode: boolean) => void;
  setConnectionStatus: (status: DocumentState['connectionStatus']) => void;
  clearDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documentId: null,
  documentName: '',
  suggestMode: true,
  connectionStatus: 'idle',
  setDocument: (id, name) => set({ documentId: id, documentName: name }),
  setSuggestMode: (mode) => set({ suggestMode: mode }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  clearDocument: () => set({ documentId: null, documentName: '', connectionStatus: 'idle' }),
}));
```

- [ ] **Step 2: Create chat store**

```typescript
// frontend/src/hooks/useChatStore.ts
import { create } from 'zustand';
import type { Message } from '../types';

interface ChatState {
  messages: Message[];
  isAIThinking: boolean;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  updateToolCallStatus: (toolName: string, status: string, result?: Record<string, unknown>) => void;
  setAIThinking: (thinking: boolean) => void;
  appendToLastAIMessage: (content: string) => void;
  clearMessages: () => void;
}

let messageId = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isAIThinking: false,
  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: String(++messageId), timestamp: Date.now() },
      ],
    })),
  updateToolCallStatus: (toolName, status, result) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].toolCall?.tool === toolName && messages[i].toolCall?.status === 'executing') {
          messages[i] = {
            ...messages[i],
            toolCall: { ...messages[i].toolCall!, status: status as any, result },
          };
          break;
        }
      }
      return { messages };
    }),
  setAIThinking: (thinking) => set({ isAIThinking: thinking }),
  appendToLastAIMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const lastAI = messages.findLast((m) => m.role === 'ai');
      if (lastAI) {
        lastAI.content = (lastAI.content || '') + content;
      }
      return { messages };
    }),
  clearMessages: () => set({ messages: [], isAIThinking: false }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useDocumentStore.ts frontend/src/hooks/useChatStore.ts
git commit -m "feat(frontend): add Zustand stores for document and chat state"
```

---

### Task 18: Implement SuperDoc editor hook and panel

**Files:**
- Create: `frontend/src/components/editor/useSuperdoc.ts`
- Create: `frontend/src/components/editor/EditorPanel.tsx`

- [ ] **Step 1: Create useSuperdoc hook**

```typescript
// frontend/src/components/editor/useSuperdoc.ts
import { useEffect, useRef } from 'react';
import { SuperDoc } from 'superdoc';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import 'superdoc/style.css';

const COLLAB_URL = 'ws://localhost:3050';

export function useSuperdoc(documentId: string | null) {
  const superdocRef = useRef<SuperDoc | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setConnectionStatus = useDocumentStore((s) => s.setConnectionStatus);

  useEffect(() => {
    if (!documentId || !containerRef.current) return;

    setConnectionStatus('connecting');

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(COLLAB_URL, documentId, ydoc);

    provider.on('sync', (synced: boolean) => {
      if (!synced) return;

      setConnectionStatus('connected');

      superdocRef.current = new SuperDoc({
        selector: containerRef.current!,
        documentMode: 'editing',
        user: {
          name: '用户',
          email: 'user@docpilot.local',
        },
        modules: {
          collaboration: { ydoc, provider },
        },
      });
    });

    provider.on('connection-close', () => {
      setConnectionStatus('disconnected');
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
      provider.destroy();
      ydoc.destroy();
    };
  }, [documentId, setConnectionStatus]);

  return { containerRef, superdocRef };
}
```

- [ ] **Step 2: Create EditorPanel component**

```tsx
// frontend/src/components/editor/EditorPanel.tsx
import { useSuperdoc } from './useSuperdoc';
import { useDocumentStore } from '../../hooks/useDocumentStore';

export function EditorPanel() {
  const documentId = useDocumentStore((s) => s.documentId);
  const { containerRef } = useSuperdoc(documentId);

  if (!documentId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
        上传或新建一个文档开始编辑
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div ref={containerRef} className="h-full" />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/editor/
git commit -m "feat(frontend): add SuperDoc editor panel with Yjs collaboration"
```

---

### Task 19: Implement layout components

**Files:**
- Create: `frontend/src/components/layout/MainLayout.tsx`
- Create: `frontend/src/components/layout/Toolbar.tsx`
- Create: `frontend/src/components/layout/StatusBar.tsx`

- [ ] **Step 1: Create MainLayout (resizable split pane)**

```tsx
// frontend/src/components/layout/MainLayout.tsx
import { useState, useCallback, useRef } from 'react';

interface MainLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function MainLayout({ left, right }: MainLayoutProps) {
  const [splitPercent, setSplitPercent] = useState(65);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(Math.max(percent, 30), 80));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div style={{ width: `${splitPercent}%` }} className="flex">
        {left}
      </div>
      <div
        className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors"
        onMouseDown={onMouseDown}
      />
      <div style={{ width: `${100 - splitPercent}%` }} className="flex">
        {right}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Toolbar**

```tsx
// frontend/src/components/layout/Toolbar.tsx
import { useRef } from 'react';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';
import { uploadDocument, createDocument, getDownloadUrl } from '../../services/api';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { documentId, documentName, suggestMode, setDocument, setSuggestMode, clearDocument } =
    useDocumentStore();
  const clearMessages = useChatStore((s) => s.clearMessages);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadDocument(file);
      clearMessages();
      setDocument(result.document_id, result.name);
    } catch (err) {
      alert('上传失败');
    }
    e.target.value = '';
  };

  const handleCreate = async () => {
    try {
      const result = await createDocument('新文档');
      clearMessages();
      setDocument(result.document_id, result.name);
    } catch (err) {
      alert('创建失败');
    }
  };

  const handleDownload = () => {
    if (!documentId) return;
    window.open(getDownloadUrl(documentId), '_blank');
  };

  return (
    <div className="h-12 bg-gray-800 text-white flex items-center px-4 gap-3">
      <span className="font-semibold text-lg mr-4">DocPilot</span>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleUpload}
      />
      <button
        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
        onClick={() => fileInputRef.current?.click()}
      >
        上传文档
      </button>

      <button
        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
        onClick={handleCreate}
      >
        新建文档
      </button>

      {documentId && (
        <>
          <button
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            onClick={handleDownload}
          >
            下载
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-300">{documentName}</span>
            <button
              className={`px-3 py-1 rounded text-sm ${
                suggestMode ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-500'
              }`}
              onClick={() => setSuggestMode(!suggestMode)}
            >
              {suggestMode ? '建议模式' : '直接编辑'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create StatusBar**

```tsx
// frontend/src/components/layout/StatusBar.tsx
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';

export function StatusBar() {
  const { connectionStatus, documentId } = useDocumentStore();
  const isAIThinking = useChatStore((s) => s.isAIThinking);

  const statusColor = {
    idle: 'bg-gray-400',
    connecting: 'bg-yellow-400',
    connected: 'bg-green-400',
    disconnected: 'bg-red-400',
  }[connectionStatus];

  return (
    <div className="h-6 bg-gray-800 text-gray-400 flex items-center px-4 text-xs gap-4">
      <div className="flex items-center gap-1">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span>{connectionStatus === 'idle' ? '未连接' : connectionStatus}</span>
      </div>
      {isAIThinking && <span className="text-yellow-300">AI 处理中...</span>}
      {documentId && <span className="ml-auto">ID: {documentId}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/
git commit -m "feat(frontend): add layout components (MainLayout, Toolbar, StatusBar)"
```

---

## Chunk 6: Frontend — Chat Panel

### Task 20: Implement Chat WebSocket hook

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Create WebSocket hook**

```typescript
// frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from './useChatStore';
import { useDocumentStore } from './useDocumentStore';
import type { ChatWsMessage } from '../types';

const WS_BASE = 'ws://localhost:8000';

export function useChatWebSocket(documentId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const { addMessage, updateToolCallStatus, setAIThinking } = useChatStore();
  const suggestMode = useDocumentStore((s) => s.suggestMode);

  useEffect(() => {
    if (!documentId) return;

    const socket = new WebSocket(`${WS_BASE}/ws/chat/${documentId}`);
    ws.current = socket;

    socket.onmessage = (event) => {
      const data: ChatWsMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'ai_message':
          setAIThinking(false);
          addMessage({ role: 'ai', content: data.content || '' });
          break;
        case 'tool_call':
          addMessage({
            role: 'system',
            toolCall: {
              tool: data.tool || '',
              status: 'executing',
              description: data.description,
            },
          });
          break;
        case 'tool_result':
          updateToolCallStatus(data.tool || '', data.status || 'success', data.result);
          break;
        case 'error':
          setAIThinking(false);
          addMessage({ role: 'system', error: data.message });
          break;
      }
    };

    socket.onclose = () => {
      ws.current = null;
    };

    return () => {
      socket.close();
      ws.current = null;
    };
  }, [documentId, addMessage, updateToolCallStatus, setAIThinking]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      addMessage({ role: 'user', content });
      setAIThinking(true);
      ws.current.send(
        JSON.stringify({
          type: 'user_message',
          content,
          suggest: suggestMode,
        })
      );
    },
    [addMessage, setAIThinking, suggestMode]
  );

  const switchMode = useCallback(
    (suggest: boolean) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      ws.current.send(JSON.stringify({ type: 'set_suggest_mode', suggest }));
    },
    []
  );

  return { sendMessage, switchMode };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useWebSocket.ts
git commit -m "feat(frontend): add Chat WebSocket hook for AI communication"
```

---

### Task 21: Implement chat UI components

**Files:**
- Create: `frontend/src/components/chat/ChatInput.tsx`
- Create: `frontend/src/components/chat/MessageBubble.tsx`
- Create: `frontend/src/components/chat/ToolCallIndicator.tsx`
- Create: `frontend/src/components/chat/MessageList.tsx`
- Create: `frontend/src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Create ChatInput**

```tsx
// frontend/src/components/chat/ChatInput.tsx
import { useState, useRef } from 'react';
import { useChatStore } from '../../hooks/useChatStore';

interface ChatInputProps {
  onSend: (message: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [value, setValue] = useState('');
  const isAIThinking = useChatStore((s) => s.isAIThinking);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isAIThinking) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 p-3">
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
          placeholder={isAIThinking ? 'AI 处理中...' : '输入消息...'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isAIThinking}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          onClick={handleSend}
          disabled={!value.trim() || isAIThinking}
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MessageBubble**

```tsx
// frontend/src/components/chat/MessageBubble.tsx
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-600 text-white rounded-lg px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'ai') {
    return (
      <div className="flex justify-start mb-3">
        <div className="bg-gray-100 text-gray-800 rounded-lg px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  // System messages (errors)
  if (message.error) {
    return (
      <div className="flex justify-center mb-3">
        <div className="bg-red-50 text-red-600 rounded-lg px-4 py-2 text-xs">
          {message.error}
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: Create ToolCallIndicator**

```tsx
// frontend/src/components/chat/ToolCallIndicator.tsx
import type { Message } from '../../types';

interface ToolCallIndicatorProps {
  message: Message;
}

export function ToolCallIndicator({ message }: ToolCallIndicatorProps) {
  const tc = message.toolCall;
  if (!tc) return null;

  const statusIcon = {
    executing: '⏳',
    success: '✓',
    error: '✗',
  }[tc.status];

  const statusColor = {
    executing: 'text-yellow-600 bg-yellow-50',
    success: 'text-green-600 bg-green-50',
    error: 'text-red-600 bg-red-50',
  }[tc.status];

  return (
    <div className={`flex justify-start mb-2`}>
      <div className={`rounded px-3 py-1.5 text-xs font-mono ${statusColor}`}>
        {statusIcon} {tc.tool} {tc.description ? `— ${tc.description}` : ''}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create MessageList**

```tsx
// frontend/src/components/chat/MessageList.tsx
import { useEffect, useRef } from 'react';
import { useChatStore } from '../../hooks/useChatStore';
import { MessageBubble } from './MessageBubble';
import { ToolCallIndicator } from './ToolCallIndicator';

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {messages.length === 0 && (
        <div className="text-center text-gray-400 text-sm mt-8">
          开始和 AI 对话来编辑文档
        </div>
      )}
      {messages.map((msg) =>
        msg.toolCall ? (
          <ToolCallIndicator key={msg.id} message={msg} />
        ) : (
          <MessageBubble key={msg.id} message={msg} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 5: Create ChatPanel**

```tsx
// frontend/src/components/chat/ChatPanel.tsx
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatWebSocket } from '../../hooks/useWebSocket';

export function ChatPanel() {
  const documentId = useDocumentStore((s) => s.documentId);
  const { sendMessage } = useChatWebSocket(documentId);

  return (
    <div className="flex-1 flex flex-col bg-white border-l border-gray-200">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">AI 助手</h2>
      </div>
      <MessageList />
      {documentId ? (
        <ChatInput onSend={sendMessage} />
      ) : (
        <div className="p-4 text-center text-gray-400 text-sm border-t">
          请先打开一个文档
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/
git commit -m "feat(frontend): add chat UI components (ChatPanel, MessageList, MessageBubble, ChatInput, ToolCallIndicator)"
```

---

## Chunk 7: Frontend — App Assembly & Integration

### Task 22: Wire up App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx` (if needed)

- [ ] **Step 1: Replace App.tsx**

```tsx
// frontend/src/App.tsx
import { Toolbar } from './components/layout/Toolbar';
import { MainLayout } from './components/layout/MainLayout';
import { StatusBar } from './components/layout/StatusBar';
import { EditorPanel } from './components/editor/EditorPanel';
import { ChatPanel } from './components/chat/ChatPanel';

export default function App() {
  return (
    <div className="h-screen flex flex-col">
      <Toolbar />
      <MainLayout
        left={<EditorPanel />}
        right={<ChatPanel />}
      />
      <StatusBar />
    </div>
  );
}
```

- [ ] **Step 2: Ensure main.tsx renders App**

```tsx
// frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: Build succeeds without TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat(frontend): wire up App with Toolbar, Editor, Chat, and StatusBar"
```

---

### Task 23: End-to-end smoke test

This is a manual integration test to verify all three services work together.

- [ ] **Step 1: Copy and fill `.env`**

```bash
cp .env.example .env
# Edit .env with real MinIO credentials and LLM API key
```

- [ ] **Step 2: Start all three services**

Terminal 1:
```bash
make dev-collab
```
Expected: "Server listening at http://0.0.0.0:3050"

Terminal 2:
```bash
make dev-backend
```
Expected: "Uvicorn running on http://0.0.0.0:8000"

Terminal 3:
```bash
make dev-frontend
```
Expected: "Local: http://localhost:5173"

- [ ] **Step 3: Test document upload flow**

1. Open http://localhost:5173
2. Click "上传文档", select a .docx file
3. Verify: document renders in the editor panel
4. Verify: StatusBar shows "connected"

- [ ] **Step 4: Test document create flow**

1. Click "新建文档"
2. Verify: blank document appears in editor
3. Type some text manually
4. Verify: text appears in editor

- [ ] **Step 5: Test AI chat flow**

1. With a document open, type in the chat: "帮我在文档开头加一个标题：测试文档"
2. Verify: Chat shows tool call indicators
3. Verify: Document updates with the new title (as tracked change if in suggest mode)
4. Verify: AI responds with confirmation message

- [ ] **Step 6: Test suggest mode toggle**

1. Click "建议模式" button to switch to "直接编辑"
2. Send another chat message
3. Verify: changes apply directly without tracked changes

- [ ] **Step 7: Test download**

1. Click "下载"
2. Verify: .docx file downloads and opens correctly in Word/LibreOffice

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete DocPilot MVP — AI-driven docx editor with chat interface"
```

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| 1 | Tasks 1-4 | Project scaffolding (root files, 3 project initializations) |
| 2 | Tasks 5-7 | Collab server (config, MinIO storage, Fastify + Yjs) |
| 3 | Tasks 8-12 | Backend document service (config, schemas, MinIO CRUD, REST API, FastAPI entry) |
| 4 | Tasks 13-15 | Backend AI agent (SuperDoc SDK, agentic loop, chat WebSocket) |
| 5 | Tasks 16-19 | Frontend core (types, API, stores, SuperDoc editor, layout) |
| 6 | Tasks 20-21 | Frontend chat (WebSocket hook, chat UI components) |
| 7 | Tasks 22-23 | Integration (App assembly, end-to-end smoke test) |

**Total: 23 tasks, 7 chunks**

**Key risk:** The SuperDoc Python SDK (`superdoc-sdk`) is in alpha. Method signatures for `doc.open()`, `choose_tools()`, `dispatch_tool()` may differ from the design docs. When implementing Tasks 13-14, consult the actual SDK package documentation and adjust accordingly. The core pattern (open session → get tools → dispatch tool calls → Yjs syncs) should remain the same.
