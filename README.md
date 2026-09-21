# IP Exchange Tool — Backend

FastAPI + Postgres(pgvector) + Redis. Modular monolith: each domain
(auth, patents, verification, search, ai, deals, notifications) is a
self-contained package under `app/`, so two people can build
different modules without touching the same files.

## Local setup

```bash
# 1. Start infra (Postgres + Redis only — ~650MB combined)
docker compose up -d

# 2. Python env
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Config
cp .env.example .env          # fill in DATABASE_URL if you changed defaults

# 4. Run
uvicorn app.main:app --reload
```

Check it worked: `curl http://localhost:8000/health`

## 8GB RAM machine — keep it lean

- Only run `docker compose up` when actively coding backend. `docker compose down`
  when you switch to frontend-only work.
- Don't run a local LLM/embedding model (no Ollama, no local
  sentence-transformers). AI calls are cloud API requests — see
  `app/ai/` once Phase 5 lands.
- One `uvicorn --reload` process is enough; don't also run the
  Next.js dev server and Docker Desktop's GUI dashboard if you're
  feeling the squeeze — the CLI (`docker compose`) is lighter.

## Module ownership

See the project plan for who owns which package this phase. Rule of
thumb: if you're not the owner of a package, don't edit its files —
open an issue/message instead. `app/main.py` and `docker-compose.yml`
are shared files — coordinate before touching them.
