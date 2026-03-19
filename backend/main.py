"""
FastAPI application.
On startup: seeds gold examples from MiracleAi.xlsx if present.
"""

import os
import csv
import json
import asyncio
import logging
import tempfile
from io import StringIO
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv

from models import (
    CategoryType, BrandType, ProviderType, GenerationRequest, FeedbackRequest,
    RegenerateRequest, UpdateContentRequest, CombineRequest, JobStatus,
)
from ingestion import parse_consolidated_excel, get_column_mapping_report
from generator import generate_batch, regenerate_section
from feedback_store import (
    add_gold_example, get_gold_examples, get_all_gold_examples,
    seed_from_miracle_ai,
)
import database as db

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Durian AI Content Studio",
    description="AI-powered product copy for Durian Furniture",
    version="2.0.0",
)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup: seed MiracleAi gold examples ─────────────────────────────────────

@app.on_event("startup")
def _startup():
    # Look for MiracleAi.xlsx next to the backend directory
    candidates = [
        Path("../MiracleAi.xlsx"),
        Path("./MiracleAi.xlsx"),
        Path(os.getenv("MIRACLE_AI_PATH", "../MiracleAi.xlsx")),
    ]
    for path in candidates:
        if path.exists():
            seed_from_miracle_ai(str(path))
            logger.info(f"Gold examples seeded from {path}")
            break
    else:
        logger.info("MiracleAi.xlsx not found at startup — gold examples not seeded.")


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "gemini_api_key_configured": bool(os.getenv("GEMINI_API_KEY")),
        "anthropic_api_key_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
        "gold_examples_loaded": len(get_all_gold_examples()),
    }


# ── Upload ─────────────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload the Main Consolidated file. Returns parsed products + column mapping report.
    Does NOT start generation — use /api/generate after previewing.
    """
    _check_ext(file.filename)
    tmp_path = await _save_temp(file)
    try:
        products = parse_consolidated_excel(tmp_path)
        col_report = get_column_mapping_report(tmp_path)
    except Exception as e:
        raise HTTPException(422, f"Failed to parse file: {e}")
    finally:
        os.unlink(tmp_path)

    if not products:
        raise HTTPException(422, "No products found in the file.")

    return {
        "product_count": len(products),
        "products": [p.model_dump() for p in products],
        "column_mapping": col_report,
    }


@app.post("/api/upload-and-generate")
async def upload_and_generate(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: CategoryType = Query(CategoryType.HOME),
    brand_type: BrandType = Query(BrandType.DURIAN),
    provider: ProviderType = Query(ProviderType.CLAUDE),
):
    """Upload + immediately start generation for all SKUs in one call."""
    _check_ext(file.filename)
    tmp_path = await _save_temp(file)
    try:
        products = parse_consolidated_excel(tmp_path)
        col_report = get_column_mapping_report(tmp_path)
    except Exception as e:
        raise HTTPException(422, f"Failed to parse file: {e}")
    finally:
        os.unlink(tmp_path)

    if not products:
        raise HTTPException(422, "No products found.")

    sku_ids = [p.sku_id for p in products]
    job_id = db.create_job(
        sku_ids=sku_ids, category=category.value,
        brand_type=brand_type.value, provider=provider.value,
    )
    db.store_products(job_id, products)

    req = GenerationRequest(
        sku_ids=sku_ids, category=category,
        brand_type=brand_type, provider=provider,
    )
    background_tasks.add_task(_run_job, job_id=job_id, request=req)

    return {
        "job_id": job_id,
        "status": "processing",
        "total": len(products),
        "products": [p.model_dump() for p in products],
        "column_mapping": col_report,
    }


# ── Attach product data to an existing job (two-step flow) ────────────────────

@app.post("/api/jobs/{job_id}/products")
async def attach_products(job_id: str, file: UploadFile = File(...)):
    if not db.get_job(job_id):
        raise HTTPException(404, "Job not found.")
    _check_ext(file.filename)
    tmp_path = await _save_temp(file)
    try:
        products = parse_consolidated_excel(tmp_path)
    except Exception as e:
        raise HTTPException(422, str(e))
    finally:
        os.unlink(tmp_path)
    db.store_products(job_id, products)
    return {"job_id": job_id, "products_stored": len(products)}


# ── Generate ───────────────────────────────────────────────────────────────────

@app.post("/api/generate")
async def start_generation(request: GenerationRequest, background_tasks: BackgroundTasks):
    if not request.sku_ids:
        raise HTTPException(400, "No SKU IDs provided.")
    job_id = db.create_job(
        sku_ids=request.sku_ids,
        category=request.category.value,
        brand_type=request.brand_type.value,
        provider=request.provider.value,
    )
    background_tasks.add_task(_run_job, job_id=job_id, request=request)
    return {"job_id": job_id, "status": "pending", "total": len(request.sku_ids)}


async def _run_job(job_id: str, request: GenerationRequest):
    db.update_job_status(job_id, JobStatus.PROCESSING)
    products = db.get_products(job_id)
    if not products:
        db.update_job_status(job_id, JobStatus.FAILED)
        db.store_error(job_id, "ALL", "No product data attached to this job.")
        return

    selected = [p for p in products if p.sku_id in request.sku_ids]
    if not selected:
        db.update_job_status(job_id, JobStatus.FAILED)
        return

    # Fetch gold examples once — generator picks the best single one for the batch
    room = selected[0].room or ""
    gold = get_gold_examples(category=room, limit=10)

    async def on_progress(sku_id, versions):
        """Callback: versions is a list of GeneratedContent (3 versions)."""
        if isinstance(versions, list):
            # Check if any version has an error
            if len(versions) == 1 and versions[0].error:
                db.store_error(job_id, sku_id, versions[0].error)
            else:
                db.store_versions(job_id, sku_id, versions)
        else:
            # Backward compat: single result
            if versions.error:
                db.store_error(job_id, sku_id, versions.error)
            else:
                db.store_result(job_id, versions)

    try:
        await generate_batch(
            products=selected,
            category=request.category,
            gold_examples=gold,
            on_progress=on_progress,
            provider=request.provider,
        )
        db.update_job_status(job_id, JobStatus.COMPLETED)
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        db.update_job_status(job_id, JobStatus.FAILED)


# ── Job status / results ───────────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    progress = db.get_job_progress(job_id)
    if not progress:
        raise HTTPException(404, "Job not found.")
    return progress.model_dump()


@app.get("/api/jobs")
def list_jobs():
    return db.list_jobs()


# ── Update & approve ──────────────────────────────────────────────────────────

@app.patch("/api/content")
def update_content(request: UpdateContentRequest):
    if not db.get_job(request.job_id):
        raise HTTPException(404, "Job not found.")
    updates = dict(request.updates)
    if request.approved is not None:
        updates["approved"] = request.approved
    db.update_result(request.job_id, request.sku_id, updates)
    return {"ok": True}


# ── Combine (mix-match + polish) ─────────────────────────────────────────────

@app.post("/api/combine")
async def combine_versions(request: CombineRequest):
    """
    Takes field-level version selections, resolves the actual content,
    sends to Claude for harmonization + HTML preview generation.
    """
    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found.")

    sku_result = db.get_sku_result(request.job_id, request.sku_id)
    if not sku_result:
        raise HTTPException(404, "SKU result not found.")

    versions = sku_result.get("versions", [])
    if not versions:
        raise HTTPException(422, "No versions available for this SKU.")

    product = db.get_product(request.job_id, request.sku_id)
    if not product:
        raise HTTPException(404, "Product not found.")

    # Resolve selections: field → actual value from the selected version
    content_fields = [
        "design_story", "what_you_need_to_know", "wyli_icon_text",
        "w_icon_1", "w_icon_2", "w_icon_3", "w_icon_4",
        "small_description", "meta_keywords",
    ]
    resolved = {}
    for field in content_fields:
        version_idx = request.selections.get(field, 0)
        version_idx = min(version_idx, len(versions) - 1)
        resolved[field] = versions[version_idx].get(field, "")

    from claude_generator import combine_and_polish
    result = await combine_and_polish(resolved, product)

    if "error" in result:
        raise HTTPException(500, result["error"])

    polished = result.get("polished_content", {})
    html = result.get("html_preview", "")

    # Add sku_id to polished content for storage
    polished["sku_id"] = request.sku_id

    db.store_combined(request.job_id, request.sku_id, polished, html)

    return {
        "polished_content": polished,
        "html_preview": html,
    }


# ── Regenerate ────────────────────────────────────────────────────────────────

@app.post("/api/regenerate")
async def regenerate(request: RegenerateRequest):
    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    product = db.get_product(request.job_id, request.sku_id)
    if not product:
        raise HTTPException(404, "Product not found.")

    # Get current content from combined or first version
    sku_result = db.get_sku_result(request.job_id, request.sku_id)
    current = {}
    if sku_result:
        if sku_result.get("combined"):
            current = sku_result["combined"]
        elif sku_result.get("versions"):
            current = sku_result["versions"][0]

    provider = job.get("provider", "claude")

    if request.section:
        if provider == "claude":
            from claude_generator import regenerate_section_claude
            updates = await regenerate_section_claude(
                product=product,
                current_content=current,
                section=request.section,
                category=request.category,
            )
        else:
            updates = await regenerate_section(
                product=product,
                current_content=current,
                section=request.section,
                category=request.category,
            )
        if "error" in updates:
            raise HTTPException(500, updates["error"])
        db.update_result(request.job_id, request.sku_id, updates)
        return {"sku_id": request.sku_id, "section": request.section, "updates": updates}
    else:
        # Full regeneration
        if provider == "claude":
            from claude_generator import generate_sku_content_claude
            from prompts import build_system_instruction_3versions, pick_best_example
            room = product.room or ""
            gold = get_gold_examples(category=room, limit=3)
            example = pick_best_example(gold, room=product.room, product_type=product.product_type)
            system = build_system_instruction_3versions(request.category, example)
            versions = await generate_sku_content_claude(product, request.category, system)
            if len(versions) == 1 and versions[0].error:
                raise HTTPException(500, versions[0].error)
            db.store_versions(request.job_id, request.sku_id, versions)
            return {
                "sku_id": request.sku_id,
                "versions": [v.model_dump() for v in versions],
            }
        else:
            from generator import generate_sku_content
            room = product.room or ""
            gold = get_gold_examples(category=room, limit=3)
            from prompts import build_system_instruction, pick_best_example
            example = pick_best_example(gold, room=product.room, product_type=product.product_type)
            system = build_system_instruction(request.category, example)
            result = await generate_sku_content(product, request.category, system)
            if result.error:
                raise HTTPException(500, result.error)
            db.store_result(request.job_id, result)
            return result.model_dump()


# ── Feedback ──────────────────────────────────────────────────────────────────

@app.post("/api/feedback")
def submit_feedback(request: FeedbackRequest):
    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    db.update_result(request.job_id, request.sku_id, {"liked": request.liked})
    if request.liked:
        add_gold_example(
            content_dict=request.content.model_dump(),
            category=job.get("category", ""),
        )
    return {"ok": True, "liked": request.liked}


@app.get("/api/gold-examples")
def list_gold_examples():
    return get_all_gold_examples()


# ── Export ────────────────────────────────────────────────────────────────────

@app.get("/api/export/{job_id}")
def export_results(
    job_id: str,
    format: str = Query("json", enum=["json", "csv"]),
    approved_only: bool = Query(False),
):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")

    # Extract the best content per SKU (combined if available, else version[0])
    results = []
    for sku_id, val in job["results"].items():
        if isinstance(val, dict) and "versions" in val:
            if val.get("combined"):
                results.append(val["combined"])
            elif val.get("versions"):
                results.append(val["versions"][0])
        else:
            results.append(val)

    if approved_only:
        results = [r for r in results if r.get("approved")]
    if not results:
        raise HTTPException(422, "No results to export.")

    if format == "json":
        return JSONResponse(
            content=results,
            headers={"Content-Disposition": f"attachment; filename=durian_{job_id}.json"},
        )

    # CSV
    output = StringIO()
    fieldnames = [
        "sku_id", "design_story", "what_you_need_to_know", "wyli_icon_text",
        "w_icon_1", "w_icon_2", "w_icon_3", "w_icon_4",
        "small_description", "meta_keywords", "approved",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(results)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=durian_{job_id}.csv"},
    )


# ── Seed gold examples manually ───────────────────────────────────────────────

@app.post("/api/seed-examples")
async def seed_examples(file: UploadFile = File(...)):
    """Upload a MiracleAi-format file to add more gold examples."""
    _check_ext(file.filename)
    tmp_path = await _save_temp(file)
    try:
        seed_from_miracle_ai(tmp_path)
    except Exception as e:
        raise HTTPException(422, str(e))
    finally:
        os.unlink(tmp_path)
    return {"ok": True, "total_examples": len(get_all_gold_examples())}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_ext(filename: str):
    if not filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(400, "Only .xlsx, .xls, or .csv files are supported.")


async def _save_temp(file: UploadFile) -> str:
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        return tmp.name
