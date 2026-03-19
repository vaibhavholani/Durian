# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Durian AI Content Studio — an AI-powered product copywriting system for Durian Furniture's e-commerce catalog. Generates 5 content types (Design Story, What You Need to Know, Why You Will Love It, W Icon Badges, Small Description + Meta Keywords) for 2,290+ SKUs using few-shot style guidance from gold examples.

## Development Commands

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Vite dev server @ localhost:5173, proxies /api to :8000
npm run build    # Production bundle to dist/
```

Both servers must run simultaneously. Vite proxies `/api/*` to the backend.

### Dependencies
- Backend: `pip install -r requirements.txt` (or `poetry install` via pyproject.toml)
- Frontend: `npm install`

## Architecture

### Backend (FastAPI + Python 3.11+)

- **main.py** — All FastAPI routes (upload, generate, job polling, combine, regenerate, feedback, export)
- **models.py** — Pydantic schemas (ProductInput, GeneratedContent, Job, etc.)
- **database.py** — In-memory job store with JSON file persistence (`data/jobs.json`)
- **generator.py** — Gemini API integration, batch generation with retry logic
- **claude_generator.py** — Claude API integration (primary provider), combine & polish functionality
- **prompts.py** — System instructions per category (HOME/OFFICE/CUSTOM), few-shot gold examples, output JSON schemas
- **ingestion.py** — Excel parser using fixed column indices (row 7 = headers, row 8+ = data)
- **feedback_store.py** — Gold examples persistence (`data/gold_examples.json`), like/dislike handling

### Frontend (React 18 + Vite + Zustand + Tailwind)

**Pages (route flow):**
1. `/` → UploadPage — Category/brand/provider selection + Excel file upload
2. `/generating/:jobId` → GeneratingPage — Polls job status every 2.5s
3. `/review/:jobId` → ReviewPage — Two-pane layout (SKU list + version picker)
4. `/export/:jobId` → ExportPage — JSON/CSV download with approval filter

**State:** Zustand store (`src/store/index.js`) manages uploaded products, job tracking, version selections (mix-match across 3 versions per field), and local edits (optimistic UI).

**API client:** `src/api/client.js` — Axios instance with 120s timeout.

### Data Flow

Excel Upload → Parse (openpyxl, fixed columns) → Create Job → Async batch AI generation (max 5 concurrent via semaphore) → Store results in jobs.json → Frontend polls for progress → Review with 3-version mix-match → Optional combine & polish via Claude → Export JSON/CSV

### AI Generation

- **Dual provider:** Claude (primary, recommended) or Gemini (fallback), selectable at upload
- **3 versions per SKU** in a single API call; users mix-match fields across versions
- **Gold examples:** One best-match example (by room + product_type proximity) injected as few-shot context per batch
- **Combine & Polish:** POST `/api/combine` sends mixed selections to Claude for harmonization + HTML preview
- **Regenerate:** POST `/api/regenerate` for single field or full SKU re-generation

### Persistence

All state is file-based (no database):
- `backend/data/jobs.json` — Job metadata + all generated results
- `backend/data/gold_examples.json` — Liked items + seeded examples from MiracleAi.xlsx

## Environment Variables

Required in `backend/.env` (see `.env.example`):
```
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
AI_PROVIDER=claude|gemini
```

Optional: `CLAUDE_MODEL`, `GEMINI_MODEL`, `CORS_ORIGINS`, `DATA_DIR`, `MIRACLE_AI_PATH`, Langfuse keys.

## Key Design Decisions

- Gold examples are auto-seeded from `../MiracleAi.xlsx` on backend startup
- Excel parsing uses hardcoded column indices (not header names) — changes to the Consolidated file format require updating `ingestion.py`
- Langfuse integration for AI call observability (model, tokens, latency)
- Frontend brand colors: stone grays + amber (#c4832a) theme defined in `tailwind.config.js`
