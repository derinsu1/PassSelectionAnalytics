.PHONY: install frontend-build app test test-backend test-frontend lint typecheck

install:
	uv sync --all-groups
	pnpm --dir frontend install --frozen-lockfile

frontend-build:
	pnpm --dir frontend build

app: install frontend-build
	PYTHONPATH=backend/src .venv/bin/uvicorn pass_selection.api:app --host 127.0.0.1 --port 5001

test: test-backend test-frontend

test-backend:
	PYTHONPATH=backend/src .venv/bin/python -m pytest

test-frontend:
	pnpm --dir frontend test

lint:
	.venv/bin/ruff check backend/src backend/tests

typecheck:
	pnpm --dir frontend typecheck
