"""
AI content generation — multi-provider (Gemini + Claude).

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
from typing import Optional, List

from google import genai
from google.genai import types as genai_types
from dotenv import load_dotenv
from langfuse import observe, get_client

from models import ProductInput, GeneratedContent, CategoryType, ProviderType
from prompts import (
    build_system_instruction,
    build_system_instruction_3versions,
    build_user_content,
    build_regenerate_section_prompt,
    pick_best_example,
)

load_dotenv()
logger = logging.getLogger(__name__)

_MACHINE_NAME = os.getenv("MACHINE_NAME", "unknown")

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
        max_output_tokens=8192,
        response_mime_type="application/json",
    )

    if is_thinking_model:
        config_kwargs["thinking_config"] = genai_types.ThinkingConfig(thinking_budget=0)

    return genai_types.GenerateContentConfig(**config_kwargs)


@observe(as_type="generation")
def _call_gemini(system_instruction: str, user_content: str) -> str:
    client = _get_client()
    config = _build_config()
    config.system_instruction = system_instruction

    lf = get_client()
    lf.update_current_generation(
        model=_MODEL_NAME,
        input={"system": system_instruction, "user": user_content},
        metadata={"machine": _MACHINE_NAME},
    )

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

    usage = getattr(response, "usage_metadata", None)
    usage_details: dict = {}
    if usage:
        if (v := getattr(usage, "prompt_token_count", None)) is not None:
            usage_details["input"] = v
        if (v := getattr(usage, "candidates_token_count", None)) is not None:
            usage_details["output"] = v
        if (v := getattr(usage, "total_token_count", None)) is not None:
            usage_details["total"] = v

    lf.update_current_generation(output=text, usage_details=usage_details or None)
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


@observe()
async def generate_sku_content(
    product: ProductInput,
    category: CategoryType,
    system_instruction: str,       # pre-built once per batch
    retries: int = 2,
) -> GeneratedContent:
    user_content = build_user_content(product)

    get_client().update_current_span(
        name=f"generate_sku_{product.sku_id}",
        input={"sku_id": product.sku_id, "category": category.value},
        metadata={"machine": _MACHINE_NAME},
    )

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


@observe()
async def regenerate_section(
    product: ProductInput,
    current_content: dict,
    section: str,
    category: CategoryType,
) -> dict:
    get_client().update_current_span(
        name=f"regenerate_{section}_{product.sku_id}",
        input={"sku_id": product.sku_id, "section": section, "category": category.value},
        metadata={"machine": _MACHINE_NAME},
    )

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


@observe()
async def generate_sku_content_3versions(
    product: ProductInput,
    category: CategoryType,
    system_instruction: str,
    retries: int = 2,
) -> List[GeneratedContent]:
    """Generate 3 versions via Gemini using the 3-version prompt."""
    user_content = build_user_content(product)

    get_client().update_current_span(
        name=f"generate_sku_3v_{product.sku_id}",
        input={"sku_id": product.sku_id, "category": category.value},
        metadata={"machine": _MACHINE_NAME},
    )

    for attempt in range(retries + 1):
        try:
            text = await asyncio.to_thread(_call_gemini, system_instruction, user_content)
            raw = _extract_json(text)
            versions = raw.get("versions", [])
            if not versions:
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


@observe()
async def generate_batch(
    products: list,
    category: CategoryType,
    gold_examples: list = [],
    on_progress=None,
    provider: ProviderType = ProviderType.CLAUDE,
) -> list:
    """
    Build the system instruction ONCE for the entire batch.
    Pick the single most relevant gold example based on the dominant room/type in the batch.
    Every SKU in the batch reuses the same system_instruction — only product data changes.

    For Claude provider: delegates to claude_generator.generate_batch_claude.
    For Gemini provider: uses 3-version prompt.
    Returns list of lists: [[v1,v2,v3], ...] per SKU.
    """
    if provider == ProviderType.CLAUDE:
        from claude_generator import generate_batch_claude
        return await generate_batch_claude(products, category, gold_examples, on_progress)

    # Gemini path
    get_client().update_current_span(
        name="generate_batch",
        input={"count": len(products), "category": category.value, "provider": provider.value},
        metadata={"machine": _MACHINE_NAME},
    )

    dominant_room = _dominant(p.room for p in products)
    dominant_type = _dominant(p.product_type for p in products)

    example = pick_best_example(gold_examples, room=dominant_room, product_type=dominant_type)
    system_instruction = build_system_instruction_3versions(category, example)

    logger.info(
        f"Gemini batch of {len(products)} | category={category.value} | "
        f"room={dominant_room} | example={'yes: ' + example['sku'] if example else 'none'}"
    )

    semaphore = asyncio.Semaphore(5)

    async def _one(product):
        async with semaphore:
            versions = await generate_sku_content_3versions(product, category, system_instruction)
            if on_progress:
                await on_progress(product.sku_id, versions)
            return versions

    return await asyncio.gather(*[_one(p) for p in products])


def _dominant(values) -> Optional[str]:
    """Return the most common non-None value from an iterable."""
    from collections import Counter
    counts = Counter(v for v in values if v)
    return counts.most_common(1)[0][0] if counts else None
