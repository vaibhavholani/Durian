"""
AI content generation using Google Gemini.

Prompt architecture:
  system_instruction  — style voice + at most 1 gold example (selected once per batch by
                        room/product_type proximity). Constant across all SKUs in a batch.
  user content        — product data only. Changes per SKU.

This means gold examples are resolved once per batch, not injected into every call.
"""

import os
import json
import asyncio
import re
import logging
from typing import Optional

from google import genai
from google.genai import types as genai_types
from dotenv import load_dotenv

from models import ProductInput, GeneratedContent, CategoryType
from prompts import (
    build_system_instruction,
    build_user_content,
    build_regenerate_section_prompt,
    pick_best_example,
)

load_dotenv()
logger = logging.getLogger(__name__)

_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set. Add it to backend/.env")
        _client = genai.Client(api_key=api_key)
    return _client


def _build_config() -> genai_types.GenerateContentConfig:
    """
    thinking_budget=0  — disables reasoning chain for gemini-2.5-flash.
                         Content generation doesn't benefit from it; disabling it
                         makes responses faster and avoids token waste.
    response_mime_type — forces raw JSON output, no markdown fences.
    max_output_tokens  — 4096 is enough for the full structured output.
    """
    is_thinking_model = "2.5" in _MODEL_NAME or "think" in _MODEL_NAME.lower()

    config_kwargs: dict = dict(
        temperature=0.75,
        top_p=0.95,
        max_output_tokens=4096,
        response_mime_type="application/json",
    )

    if is_thinking_model:
        config_kwargs["thinking_config"] = genai_types.ThinkingConfig(thinking_budget=0)

    return genai_types.GenerateContentConfig(**config_kwargs)


def _call_gemini(system_instruction: str, user_content: str) -> str:
    client = _get_client()
    config = _build_config()
    config.system_instruction = system_instruction

    response = client.models.generate_content(
        model=_MODEL_NAME,
        contents=user_content,
        config=config,
    )
    text = response.text or ""
    if not text:
        for cand in (response.candidates or []):
            for part in (cand.content.parts or []):
                if not getattr(part, "thought", False) and part.text:
                    text += part.text
    return text


def _extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown fences if model ignores response_mime_type
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


async def generate_sku_content(
    product: ProductInput,
    category: CategoryType,
    system_instruction: str,       # pre-built once per batch
    retries: int = 2,
) -> GeneratedContent:
    user_content = build_user_content(product)

    for attempt in range(retries + 1):
        try:
            text = await asyncio.to_thread(_call_gemini, system_instruction, user_content)
            raw = _extract_json(text)
            return _parse_content(raw, product.sku_id)
        except json.JSONDecodeError as e:
            logger.warning(f"[{product.sku_id}] JSON parse error attempt {attempt+1}: {e}")
            if attempt == retries:
                return GeneratedContent(sku_id=product.sku_id, error=f"JSON parse failed: {e}")
            await asyncio.sleep(1.5 ** attempt)
        except Exception as e:
            logger.error(f"[{product.sku_id}] Error attempt {attempt+1}: {e}")
            if attempt == retries:
                return GeneratedContent(sku_id=product.sku_id, error=str(e))
            await asyncio.sleep(2 ** attempt)

    return GeneratedContent(sku_id=product.sku_id, error="Unknown failure.")


async def regenerate_section(
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
        text = await asyncio.to_thread(_call_gemini, system, user)
        return _extract_json(text)
    except Exception as e:
        logger.error(f"Regenerate '{section}' failed: {e}")
        return {"error": str(e)}


async def generate_batch(
    products: list,
    category: CategoryType,
    gold_examples: list = [],
    on_progress=None,
) -> list:
    """
    Build the system instruction ONCE for the entire batch.
    Pick the single most relevant gold example based on the dominant room/type in the batch.
    Every SKU in the batch reuses the same system_instruction — only product data changes.
    """
    # Determine the dominant room + product_type in this batch
    dominant_room = _dominant(p.room for p in products)
    dominant_type = _dominant(p.product_type for p in products)

    example = pick_best_example(gold_examples, room=dominant_room, product_type=dominant_type)
    system_instruction = build_system_instruction(category, example)

    logger.info(
        f"Batch of {len(products)} | category={category.value} | "
        f"room={dominant_room} | example={'yes: ' + example['sku'] if example else 'none'}"
    )

    semaphore = asyncio.Semaphore(5)

    async def _one(product):
        async with semaphore:
            result = await generate_sku_content(product, category, system_instruction)
            if on_progress:
                await on_progress(product.sku_id, result)
            return result

    return await asyncio.gather(*[_one(p) for p in products])


def _dominant(values) -> Optional[str]:
    """Return the most common non-None value from an iterable."""
    from collections import Counter
    counts = Counter(v for v in values if v)
    return counts.most_common(1)[0][0] if counts else None
