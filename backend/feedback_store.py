"""
Gold examples store.
Liked content is persisted as few-shot examples.
MiracleAi.xlsx examples are seeded on startup.
"""

import json
import logging
from pathlib import Path
from typing import List, Dict
import os

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
_STORE_FILE = _DATA_DIR / "gold_examples.json"
_MAX_EXAMPLES = 30


def _load() -> List[Dict]:
    if not _STORE_FILE.exists():
        return []
    try:
        with open(_STORE_FILE) as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load gold examples: {e}")
        return []


def _save(examples: List[Dict]):
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with open(_STORE_FILE, "w") as f:
            json.dump(examples, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save gold examples: {e}")


# ── Public API ─────────────────────────────────────────────────────────────────

def seed_from_miracle_ai(file_path: str):
    """
    Load MiracleAi.xlsx and persist all its entries as gold examples.
    Safe to call multiple times — skips duplicates by SKU.
    """
    from ingestion import load_miracle_ai_examples
    try:
        examples = load_miracle_ai_examples(file_path)
        existing = _load()
        existing_skus = {e.get("sku") for e in existing}
        new = [e for e in examples if e.get("sku") not in existing_skus]
        if new:
            combined = existing + new
            if len(combined) > _MAX_EXAMPLES:
                combined = combined[-_MAX_EXAMPLES:]
            _save(combined)
            logger.info(f"Seeded {len(new)} gold examples from MiracleAi.xlsx")
        else:
            logger.info("MiracleAi gold examples already seeded — skipping.")
    except Exception as e:
        logger.error(f"Failed to seed from MiracleAi: {e}")


def add_gold_example(content_dict: Dict, category: str):
    """Save a liked content item as a gold example."""
    examples = _load()
    entry = {
        "category":  category,
        "sku":       content_dict.get("sku_id", ""),
        "design_story":          content_dict.get("design_story"),
        "what_you_need_to_know": content_dict.get("what_you_need_to_know"),
        "wyli_icon_text":        content_dict.get("wyli_icon_text"),
    }
    existing_skus = {e.get("sku") for e in examples}
    if entry["sku"] in existing_skus:
        return
    examples.append(entry)
    if len(examples) > _MAX_EXAMPLES:
        examples = examples[-_MAX_EXAMPLES:]
    _save(examples)


def get_gold_examples(category: str = None, limit: int = 3) -> List[Dict]:
    """Retrieve relevant gold examples, preferring category matches."""
    all_ex = _load()
    if category:
        cat_lower = category.lower()
        matched = [e for e in all_ex if cat_lower in (e.get("category") or "").lower()]
        rest    = [e for e in all_ex if e not in matched]
        ordered = matched + rest
    else:
        ordered = all_ex
    return ordered[:limit]


def get_all_gold_examples() -> List[Dict]:
    return _load()


def remove_gold_example(sku: str):
    examples = [e for e in _load() if e.get("sku") != sku]
    _save(examples)
