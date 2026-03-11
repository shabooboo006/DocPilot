.PHONY: install dev-collab dev-backend dev-frontend dev

install:
	cd collab-server && npm install
	cd frontend && npm install
	cd backend && uv venv && uv sync

dev-collab:
	cd collab-server && npm run dev

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 6800

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "请在三个终端分别运行:"
	@echo "  make dev-collab"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"
