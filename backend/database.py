"""
In-memory job store with JSON persistence.
"""

import json
import uuid
import logging
from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime
import os

from models import ProductInput, GeneratedContent, JobProgress, JobStatus

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


def create_job(sku_ids: List[str], category: str, brand_type: str) -> str:
    job_id = str(uuid.uuid4())[:8].upper()
    _jobs[job_id] = {
        "job_id":     job_id,
        "status":     JobStatus.PENDING.value,
        "category":   category,
        "brand_type": brand_type,
        "total":      len(sku_ids),
        "processed":  0,
        "sku_ids":    sku_ids,
        "results":    {},
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


def store_result(job_id: str, result: GeneratedContent):
    if job_id not in _jobs:
        return
    _jobs[job_id]["results"][result.sku_id] = result.model_dump()
    _jobs[job_id]["processed"] = len(_jobs[job_id]["results"]) + len(_jobs[job_id]["errors"])
    _persist()


def store_error(job_id: str, sku_id: str, error: str):
    if job_id not in _jobs:
        return
    _jobs[job_id]["errors"].append({"sku_id": sku_id, "error": error})
    _jobs[job_id]["processed"] = len(_jobs[job_id]["results"]) + len(_jobs[job_id]["errors"])
    _persist()


def get_job_progress(job_id: str) -> Optional[JobProgress]:
    job = _jobs.get(job_id)
    if not job:
        return None
    return JobProgress(
        job_id=job_id,
        status=JobStatus(job["status"]),
        total=job["total"],
        processed=job["processed"],
        results=[GeneratedContent(**v) for v in job["results"].values()],
        errors=job["errors"],
    )


def update_result(job_id: str, sku_id: str, updates: dict):
    if job_id in _jobs and sku_id in _jobs[job_id]["results"]:
        _jobs[job_id]["results"][sku_id].update(updates)
        _persist()


def store_products(job_id: str, products: List[ProductInput]):
    _products[job_id] = [p.model_dump() for p in products]
    _persist()


def get_products(job_id: str) -> List[ProductInput]:
    return [ProductInput(**p) for p in _products.get(job_id, [])]


def get_product(job_id: str, sku_id: str) -> Optional[ProductInput]:
    return next((p for p in get_products(job_id) if p.sku_id == sku_id), None)
