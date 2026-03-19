"""
AI content generation using Anthropic Claude.

Mirrors the Gemini generator interface but uses Claude API.
Supports 3-version generation in a single call and content combining/polishing.
"""

import os
import json
import asyncio
import re
import logging
from typing import Optional, List

import anthropic
from dotenv import load_dotenv

from models import ProductInput, GeneratedContent, CategoryType
from prompts import (
    build_system_instruction_3versions,
    build_user_content,
    build_regenerate_section_prompt,
    build_combine_prompt,
    pick_best_example,
    build_system_instruction,
)

load_dotenv()
logger = logging.getLogger(__name__)

_MODEL_NAME = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5-20241022")
_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set. Add it to backend/.env")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


def _call_claude(system: str, user: str) -> str:
    client = _get_client()
    response = client.messages.create(
        model=_MODEL_NAME,
        max_tokens=8192,
        temperature=0.75,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return response.content[0].text


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object in response.")
    return json.loads(text[start:end])


def _parse_content(raw: dict, sku_id: str) -> GeneratedContent:
    return GeneratedContent(
        sku_id=sku_id,
        design_story=raw.get("design_story"),
        what_you_need_to_know=raw.get("what_you_need_to_know"),
        wyli_icon_text=raw.get("wyli_icon_text"),
        w_icon_1=raw.get("w_icon_1"),
        w_icon_2=raw.get("w_icon_2"),
        w_icon_3=raw.get("w_icon_3"),
        w_icon_4=raw.get("w_icon_4"),
        small_description=raw.get("small_description"),
        meta_keywords=raw.get("meta_keywords"),
    )


async def generate_sku_content_claude(
    product: ProductInput,
    category: CategoryType,
    system_instruction: str,
    retries: int = 2,
) -> List[GeneratedContent]:
    """Generate 3 versions of content for a single SKU in one API call."""
    user_content = build_user_content(product)

    for attempt in range(retries + 1):
        try:
            text = await asyncio.to_thread(_call_claude, system_instruction, user_content)
            raw = _extract_json(text)
            versions = raw.get("versions", [])
            if not versions:
                # Fallback: maybe the model returned a single version
                return [_parse_content(raw, product.sku_id)]
            return [_parse_content(v, product.sku_id) for v in versions[:3]]
        except json.JSONDecodeError as e:
            logger.warning(f"[{product.sku_id}] JSON parse error attempt {attempt+1}: {e}")
            if attempt == retries:
                return [GeneratedContent(sku_id=product.sku_id, error=f"JSON parse failed: {e}")]
            await asyncio.sleep(1.5 ** attempt)
        except Exception as e:
            logger.error(f"[{product.sku_id}] Error attempt {attempt+1}: {e}")
            if attempt == retries:
                return [GeneratedContent(sku_id=product.sku_id, error=str(e))]
            await asyncio.sleep(2 ** attempt)

    return [GeneratedContent(sku_id=product.sku_id, error="Unknown failure.")]


async def regenerate_section_claude(
    product: ProductInput,
    current_content: dict,
    section: str,
    category: CategoryType,
) -> dict:
    from feedback_store import get_gold_examples
    gold = get_gold_examples(category=product.room or "", limit=2)
    example = pick_best_example(gold, room=product.room, product_type=product.product_type)
    system = build_system_instruction(category, example)
    user = build_regenerate_section_prompt(product, current_content, section)

    try:
        text = await asyncio.to_thread(_call_claude, system, user)
        return _extract_json(text)
    except Exception as e:
        logger.error(f"Regenerate '{section}' failed: {e}")
        return {"error": str(e)}


async def combine_and_polish(
    selections: dict,
    product: ProductInput,
) -> dict:
    """
    Takes mix-matched field selections and sends to Claude for harmonization + HTML preview.
    Returns {"polished_content": {...9 fields...}, "html_preview": "<html>..."}
    """
    system = (
        "You are a content editor and HTML designer for Durian Furniture. "
        "Return only valid JSON as instructed. No markdown fences, no explanation."
    )
    user = build_combine_prompt(selections, product)

    try:
        text = await asyncio.to_thread(_call_claude, system, user)
        result = _extract_json(text)
        return {
            "polished_content": result.get("polished_content", {}),
            "html_preview": result.get("html_preview", ""),
        }
    except Exception as e:
        logger.error(f"Combine and polish failed: {e}")
        return {"error": str(e)}


async def generate_batch_claude(
    products: list,
    category: CategoryType,
    gold_examples: list = [],
    on_progress=None,
) -> list:
    """
    Generate 3 versions per SKU using Claude.
    Returns list of lists: [[v1,v2,v3], [v1,v2,v3], ...]
    """
    from collections import Counter

    def _dominant(values):
        counts = Counter(v for v in values if v)
        return counts.most_common(1)[0][0] if counts else None

    dominant_room = _dominant(p.room for p in products)
    dominant_type = _dominant(p.product_type for p in products)

    example = pick_best_example(gold_examples, room=dominant_room, product_type=dominant_type)
    system_instruction = build_system_instruction_3versions(category, example)

    logger.info(
        f"Claude batch of {len(products)} | category={category.value} | "
        f"room={dominant_room} | example={'yes: ' + example['sku'] if example else 'none'}"
    )

    semaphore = asyncio.Semaphore(5)

    async def _one(product):
        async with semaphore:
            versions = await generate_sku_content_claude(product, category, system_instruction)
            if on_progress:
                await on_progress(product.sku_id, versions)
            return versions

    return await asyncio.gather(*[_one(p) for p in products])
