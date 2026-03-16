# Durian AI — Content Studio

AI-powered product copywriting for Durian Furniture's e-commerce catalog.
Generates **Design Story**, **What You Need to Know**, **Why You Will Love It**, and **W Icon badges** for every SKU — matched to the tone and quality of hand-approved examples.

---

## How It Works

| Input | Output |
|---|---|
| `Main Consolidated file.xlsx` (Sheet1, 2,290+ SKUs) | **Design Story** — 65–70 word evocative paragraph |
| `MiracleAi.xlsx` (13 gold examples auto-loaded) | **What You Need to Know** — 5 numbered points |
| — | **Why You Will Love It** — 25-word marketing hook |
| — | **W Icon 1–4** — short feature badge labels |
| — | Small Description + Meta Keywords |

Gold examples from `MiracleAi.xlsx` are injected as few-shot prompts so every generation matches the customer-approved style.

---

## Project Structure

```
Durian/
├── backend/
│   ├── main.py            FastAPI app (all endpoints)
│   ├── ingestion.py       Excel parser (Consolidated file + MiracleAi)
│   ├── generator.py       Gemini API calls
│   ├── prompts.py         Prompt templates (MiracleAi-aligned)
│   ├── feedback_store.py  Gold examples store
│   ├── database.py        In-memory job store (JSON-persisted)
│   ├── models.py          Pydantic data models
│   ├── requirements.txt   Python dependencies
│   └── .env.example       Environment variable template
├── frontend/
│   └── src/               React + Vite + Tailwind
├── Main Consolidated file.xlsx   ← INPUT: product data
├── MiracleAi.xlsx                ← GOLD EXAMPLES: approved content
└── README.md
```

---

## Setup

### 1. Get a Gemini API Key
Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and create a free API key.

### 2. Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Run the API server
uvicorn main:app --reload --port 8000
```

The server starts at **http://localhost:8000**.  
On startup it auto-loads the 13 gold examples from `MiracleAi.xlsx`.  
API docs at **http://localhost:8000/docs**.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Usage

1. **Upload** — Drag and drop `Main Consolidated file.xlsx` (or any batch export).  
   Select category (Home / Office / Custom) and brand voice (Durian / Pure).

2. **Generate** — Click "Generate Content". The system processes all SKUs in parallel (max 5 concurrent Gemini calls).

3. **Review** — Browse the SKU list. For each product, review:
   - Design Story
   - What You Need to Know
   - Why You Will Love It
   - W Icon 1–4
   - Small Description + Meta Keywords

4. **Edit** — Click the pencil icon on any section to edit in place. Click the circular arrow to regenerate just that section.

5. **Like** — Thumbs up any output you love. It's saved as a gold example and used to improve all future generations in that session.

6. **Approve** — Click "Approve" on any SKU you're happy with.

7. **Export** — Download as **JSON** (for CMS import) or **CSV** (for spreadsheet review). Filter to approved-only if needed.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (required) | — |
| `GEMINI_MODEL` | Model name | `gemini-1.5-pro` |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173` |
| `DATA_DIR` | Where jobs and gold examples are stored | `./data` |
| `MIRACLE_AI_PATH` | Path to MiracleAi.xlsx for seeding | `../MiracleAi.xlsx` |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check + API key status |
| `POST` | `/api/upload` | Parse Excel, preview products |
| `POST` | `/api/upload-and-generate` | Upload + start generation in one step |
| `GET` | `/api/jobs/{job_id}` | Poll job progress and results |
| `PATCH` | `/api/content` | Save edits or approve a SKU |
| `POST` | `/api/regenerate` | Regenerate full SKU or single section |
| `POST` | `/api/feedback` | Like/dislike (saves gold examples) |
| `GET` | `/api/export/{job_id}` | Download results as JSON or CSV |
| `POST` | `/api/seed-examples` | Upload additional MiracleAi-format files |

---

## Content Format Reference

### Design Story
> 1 paragraph, 65–70 words.  
> Opens with: *"[Name] has been designed for those who…"*  
> Factual, evocative, specific about materials and experience.

### What You Need to Know
> 5 numbered points.  
> Each has a **Title Case headline** on its own line, followed by 2–3 detail sentences.  
> Total ~110–120 words.

### Why You Will Love It
> ~25 words.  
> **Bold Tagline Headline** on line 1, then 1–2 supporting sentences.

### W Icon Badges
> 4 badges, 3–5 words each.  
> Short, label-like feature callouts for the product card.
