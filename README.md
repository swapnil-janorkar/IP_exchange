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

## Deal, NDA, and document-sharing workflow

- An authenticated organisation creates a deal by calling `POST /deals` with a
  listed `patent_id` (the Express Interest action). The innovator who owns the
  patent becomes the seller.
- The seller uploads the NDA for that deal using `POST /documents/upload` with
  `doc_type=nda` and the deal's `deal_id`. The platform does not supply or
  invent NDA terms.
- Each deal party reviews the uploaded NDA and calls `POST /deals/{deal_id}/nda/sign`.
  The API records each account's assent, signing time, and SHA-256 document hash.
- Before both parties sign, only the NDA can be listed or downloaded through
  the deal. After both signatures, `GET /deals/{deal_id}/documents` exposes the
  deal documents and all documents attached to the patent; downloads remain
  deal-scoped through `/deals/{deal_id}/documents/{document_id}/download`.
- This is recorded in-app assent, not a third-party e-signature integration.
