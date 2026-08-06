# Build the browser application separately so its build tooling is not part of
# the runtime image.
FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN npm install --global pnpm@9.15.9 && pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build


# The API reads the committed application tables and tracking data directly
# from /app, then serves the built frontend at the same origin.
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
COPY backend/ ./backend/

RUN pip install --no-cache-dir uv==0.12.2 \
    && uv sync --frozen --no-dev

COPY data/ ./data/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

CMD ["sh", "-c", "uvicorn pass_selection.api:app --host 0.0.0.0 --port \"${PORT:-8080}\""]
