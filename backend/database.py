"""
In-memory job store with JSON persistence.
Supports 3-version results per SKU with optional combined result and HTML preview.
"""

import json
import uuid
import logging
from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime
import os

from models import ProductInput, GeneratedContent, JobProgress, JobStatus, SKUResult

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
_JOBS_FILE = _DATA_DIR / "jobs.json"

_jobs: Dict[str, dict] = {}
_products: Dict[str, List[dict]] = {}


def _load():
    global _jobs, _products
    if not _JOBS_FILE.exists():
        return
    try:
        with open(_JOBS_FILE) as f:
            data = json.load(f)
            _jobs = data.get("jobs", {})
            _products = data.get("products", {})
    except Exception as e:
        logger.error(f"Failed to load jobs: {e}")


def _persist():
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with open(_JOBS_FILE, "w") as f:
            json.dump({"jobs": _jobs, "products": _products}, f, indent=2, default=str)
    except Exception as e:
        logger.error(f"Failed to persist: {e}")


_load()


def create_job(sku_ids: List[str], category: str, brand_type: str, provider: str = "claude") -> str:
    job_id = str(uuid.uuid4())[:8].upper()
    _jobs[job_id] = {
        "job_id":     job_id,
        "status":     JobStatus.PENDING.value,
        "category":   category,
        "brand_type": brand_type,
        "provider":   provider,
        "total":      len(sku_ids),
        "processed":  0,
        "sku_ids":    sku_ids,
        "results":    {},   # sku_id → {"versions": [...], "combined": null, "html_preview": null}
        "errors":     [],
        "created_at": datetime.utcnow().isoformat(),
    }
    _persist()
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)


def list_jobs() -> List[dict]:
    return sorted(_jobs.values(), key=lambda j: j.get("created_at", ""), reverse=True)


def update_job_status(job_id: str, status: JobStatus):
    if job_id in _jobs:
        _jobs[job_id]["status"] = status.value
        _persist()


def store_versions(job_id: str, sku_id: str, versions: List[GeneratedContent]):
    """Store 3 versions for a SKU."""
    if job_id not in _jobs:
        return
    _jobs[job_id]["results"][sku_id] = {
        "versions": [v.model_dump() for v in versions],
        "combined": None,
        "html_preview": None,
    }
    _jobs[job_id]["processed"] = len(_jobs[job_id]["results"]) + len(_jobs[job_id]["errors"])
    _persist()


def store_result(job_id: str, result: GeneratedContent):
    """Backward-compatible: store a single result as version[0]."""
    if job_id not in _jobs:
        return
    existing = _jobs[job_id]["results"].get(result.sku_id)
    if existing and isinstance(existing, dict) and "versions" in existing:
        existing["versions"] = [result.model_dump()]
    else:
        _jobs[job_id]["results"][result.sku_id] = {
            "versions": [result.model_dump()],
            "combined": None,
            "html_preview": None,
        }
    _jobs[job_id]["processed"] = len(_jobs[job_id]["results"]) + len(_jobs[job_id]["errors"])
    _persist()


def store_combined(job_id: str, sku_id: str, combined: dict, html_preview: str):
    """Store the combined/polished result and HTML preview for a SKU."""
    if job_id not in _jobs or sku_id not in _jobs[job_id]["results"]:
        return
    _jobs[job_id]["results"][sku_id]["combined"] = combined
    _jobs[job_id]["results"][sku_id]["html_preview"] = html_preview
    _persist()


def store_error(job_id: str, sku_id: str, error: str):
    if job_id not in _jobs:
        return
    _jobs[job_id]["errors"].append({"sku_id": sku_id, "error": error})
    _jobs[job_id]["processed"] = len(_jobs[job_id]["results"]) + len(_jobs[job_id]["errors"])
    _persist()


def _migrate_result(sku_id: str, val: dict) -> dict:
    """Migrate old single-result format to new versions format."""
    if "versions" in val:
        return val
    # Old format: flat GeneratedContent dict
    return {
        "versions": [val],
        "combined": None,
        "html_preview": None,
    }


def get_job_progress(job_id: str) -> Optional[JobProgress]:
    job = _jobs.get(job_id)
    if not job:
        return None

    sku_results = []
    for sku_id, val in job["results"].items():
        migrated = _migrate_result(sku_id, val)
        versions = [GeneratedContent(**v) for v in migrated["versions"]]
        combined = GeneratedContent(**migrated["combined"]) if migrated.get("combined") else None
        sku_results.append(SKUResult(
            versions=versions,
            combined=combined,
            html_preview=migrated.get("html_preview"),
        ))

    return JobProgress(
        job_id=job_id,
        status=JobStatus(job["status"]),
        total=job["total"],
        processed=job["processed"],
        results=sku_results,
        errors=job["errors"],
    )


def update_result(job_id: str, sku_id: str, updates: dict):
    """Update fields on the combined result, or version[0] if no combined exists."""
    if job_id not in _jobs or sku_id not in _jobs[job_id]["results"]:
        return
    entry = _jobs[job_id]["results"][sku_id]
    entry = _migrate_result(sku_id, entry)
    _jobs[job_id]["results"][sku_id] = entry

    if entry.get("combined"):
        entry["combined"].update(updates)
    elif entry["versions"]:
        entry["versions"][0].update(updates)
    _persist()


def get_sku_result(job_id: str, sku_id: str) -> Optional[dict]:
    """Get the raw result entry for a SKU (with versions, combined, html_preview)."""
    job = _jobs.get(job_id)
    if not job or sku_id not in job["results"]:
        return None
    return _migrate_result(sku_id, job["results"][sku_id])


def store_products(job_id: str, products: List[ProductInput]):
    _products[job_id] = [p.model_dump() for p in products]
    _persist()


def get_products(job_id: str) -> List[ProductInput]:
    return [ProductInput(**p) for p in _products.get(job_id, [])]


def get_product(job_id: str, sku_id: str) -> Optional[ProductInput]:
    return next((p for p in get_products(job_id) if p.sku_id == sku_id), None)
