"""
Prompt architecture (two-part, built separately):

  build_system_instruction(category, example)
      → style voice + at most 1 gold example
      → built ONCE per batch, reused for every SKU

  build_user_content(product)
      → product data only
      → built per SKU

  pick_best_example(gold_examples, room, product_type)
      → selects the single most relevant gold example by proximity:
         1. exact room + product_type match
         2. room match only
         3. first available example
         4. None  (no examples yet)
"""

from typing import Optional, Dict
from models import ProductInput, CategoryType


# ── Voice by category ──────────────────────────────────────────────────────────

_VOICE = {
    CategoryType.HOME: (
        "You write product content for Durian Furniture — one of India's most trusted premium "
        "home furniture brands. Your writing is precise, confident, and evocative. You describe "
        "what a piece actually does and how it actually feels to live with — never vague, never "
        "hype. Be specific: name the material, the mechanism, the colour. "
        "Never invent facts that are not in the product data."
    ),
    CategoryType.OFFICE: (
        "You write product content for Durian's Office Furniture range. Your writing is "
        "authoritative and benefit-led. Speak to buyers who care about ergonomics, load capacity, "
        "and durability. Name the mechanism, the material, the measurement. No puffery."
    ),
    CategoryType.CUSTOM: (
        "You write product content for Durian's Full Home Customization service. Invite the "
        "customer into a design journey — warm, curatorial, confident. Emphasise how pieces "
        "relate to each other and to the room. "
        "The phrase 'this is a starting point, not the limit' captures the spirit."
    ),
}

# ── Output schema (static, included once in system instruction) ────────────────

_OUTPUT_SCHEMA = """\
Return ONLY a valid JSON object with exactly these keys. No explanation, no markdown.

{
  "design_story":            "1 paragraph, 65-70 words. Open: '[Name] has been designed for those who…'. Specific about materials, mechanism, and the experience of owning it.",
  "what_you_need_to_know":   "5 numbered points. Each: a Title Case headline (3-6 words) on its own line, then 2-3 sentences of factual detail. Total 110-120 words. Example:\\n1. Gets Better With Age\\n[2-3 sentences]\\n2. …",
  "wyli_icon_text":          "~25 words. Line 1: a 4-6 word punchy headline. Line 2: 1-2 supporting sentences. Example:\\nA Purchase That Appreciates\\nTop-grain leather does not wear out — it wears in.",
  "w_icon_1":                "3-5 word feature badge (most important material/structural feature)",
  "w_icon_2":                "3-5 word feature badge (durability or quality)",
  "w_icon_3":                "3-5 word feature badge (comfort, function, or mechanism)",
  "w_icon_4":                "3-5 word feature badge (fourth distinct selling point)",
  "small_description":       "15-20 words. Plain summary for category pages — what it is and one key differentiator.",
  "meta_keywords":           "8-10 comma-separated SEO keywords: product type, material, brand, style, use case."
}"""


# ── Gold example formatter (single example only) ──────────────────────────────

def _format_example(example: Optional[Dict]) -> str:
    if not example:
        return ""
    lines = [
        "\n=== APPROVED STYLE EXAMPLE — match this quality and tone exactly ===\n",
        f"Category: {example.get('category', '')} | SKU: {example.get('sku', '')}",
    ]
    if example.get("design_story"):
        lines.append(f"\nDesign Story:\n{example['design_story']}")
    if example.get("what_you_need_to_know"):
        lines.append(f"\nWhat You Need to Know:\n{example['what_you_need_to_know']}")
    if example.get("wyli_icon_text"):
        lines.append(f"\nWhy You Will Love It:\n{example['wyli_icon_text']}")
    lines.append("")
    return "\n".join(lines)


# ── Public: pick the best single gold example ─────────────────────────────────

def pick_best_example(
    gold_examples: list,
    room: Optional[str] = None,
    product_type: Optional[str] = None,
) -> Optional[Dict]:
    """
    Returns the single most relevant gold example:
      1. Exact room + product_type match
      2. Room match only
      3. First available
      4. None
    """
    if not gold_examples:
        return None

    room_l       = (room or "").lower()
    type_l       = (product_type or "").lower()

    # Score each example
    def _score(ex: Dict) -> int:
        cat = (ex.get("category") or "").lower()
        if room_l and type_l and room_l in cat and type_l in cat:
            return 2
        if room_l and room_l in cat:
            return 1
        return 0

    best = max(gold_examples, key=_score)
    return best if best else gold_examples[0]


# ── Public: build system instruction (once per batch) ─────────────────────────

def build_system_instruction(
    category: CategoryType,
    example: Optional[Dict] = None,
) -> str:
    """
    Combines: voice + output schema + optional single gold example.
    Built once per batch. Passed as system_instruction to every API call.
    """
    voice = _VOICE.get(category, _VOICE[CategoryType.HOME])
    example_block = _format_example(example)
    return f"{voice}\n\n{_OUTPUT_SCHEMA}\n{example_block}"


# ── Public: build user content (per SKU) ──────────────────────────────────────

def build_user_content(product: ProductInput) -> str:
    """
    Product data only — no style guide, no examples.
    This is the only part that changes per SKU.
    """
    lines = ["=== PRODUCT DATA ==="]

    def add(label, val):
        if val and str(val).strip():
            lines.append(f"{label}: {val}")

    add("SKU",               product.sku_id)
    add("Product Name",      product.product_name)
    add("Room / Category",   product.room)
    add("Type",              product.product_type)
    add("Origin",            "Imported" if product.imported else ("Made in India" if product.imported is False else None))
    add("Primary Material",  product.primary_material)
    add("Filling Material",  product.filling_material)
    add("Upholstery Type",   product.upholstery_type)
    add("Leg Material",      product.leg_material)
    add("Finish",            product.finish)
    add("Primary Color",     product.primary_color)
    add("Secondary Color",   product.secondary_color)
    add("Style",             product.style)
    add("Mechanism",         product.mechanism)
    add("Function",          product.function)
    add("Configuration",     product.configuration)
    add("Dimensions",        product.dimensions)

    mm_parts = []
    if product.width_mm:  mm_parts.append(f"W: {product.width_mm} mm")
    if product.depth_mm:  mm_parts.append(f"D: {product.depth_mm} mm")
    if product.height_mm: mm_parts.append(f"H: {product.height_mm} mm")
    if mm_parts:
        lines.append(f"Dimensions (mm): {' × '.join(mm_parts)}")

    add("Net Weight",        product.net_weight)
    add("Max Load Capacity", product.max_load_capacity)
    add("Warranty",          product.warranty)
    add("Care Instructions", product.care_instructions)

    if product.existing_bullet_points:
        lines.append(f"Existing Bullet Points (reference only):\n{product.existing_bullet_points[:400]}")

    lines.append("\nGenerate content for this product only. Use facts above. Do not invent.")
    return "\n".join(lines)


# ── Public: build regenerate-section prompt ───────────────────────────────────

def build_regenerate_section_prompt(
    product: ProductInput,
    current_content: dict,
    section: str,
) -> str:
    """User content for regenerating a single section."""
    product_data = build_user_content(product)
    current_val  = current_content.get(section, "")

    section_schemas = {
        "design_story":           '{"design_story": "…"}  — 65-70 words, one paragraph.',
        "what_you_need_to_know":  '{"what_you_need_to_know": "…"}  — 5 numbered points, 110-120 words.',
        "wyli_icon_text":         '{"wyli_icon_text": "…"}  — ~25 words, headline + 1-2 sentences.',
        "w_icon_1":               '{"w_icon_1": "…"}  — 3-5 word badge.',
        "w_icon_2":               '{"w_icon_2": "…"}  — 3-5 word badge.',
        "w_icon_3":               '{"w_icon_3": "…"}  — 3-5 word badge.',
        "w_icon_4":               '{"w_icon_4": "…"}  — 3-5 word badge.',
        "small_description":      '{"small_description": "…"}  — 15-20 words.',
        "meta_keywords":          '{"meta_keywords": "…"}  — 8-10 comma-separated keywords.',
    }
    schema = section_schemas.get(section, f'{{"{section}": "…"}}')

    return f"""{product_data}

=== CURRENT VERSION (user wants a better one) ===
{section}: {current_val}

Write a fresh, improved version of "{section}" only. Different angle from the current version.
Return ONLY: {schema}"""


# ── 3-version system instruction ─────────────────────────────────────────────

_OUTPUT_SCHEMA_3VERSIONS = """\
Return ONLY a valid JSON object with a "versions" key containing an array of exactly 3 distinct variations.
Each variation has the same keys. Make each version genuinely different — vary tone, angle, and emphasis. No markdown, no explanation.

{
  "versions": [
    {
      "design_story":            "1 paragraph, 65-70 words. Open: '[Name] has been designed for those who…'. Specific about materials, mechanism, and the experience of owning it.",
      "what_you_need_to_know":   "5 numbered points. Each: a Title Case headline (3-6 words) on its own line, then 2-3 sentences of factual detail. Total 110-120 words.",
      "wyli_icon_text":          "~25 words. Line 1: a 4-6 word punchy headline. Line 2: 1-2 supporting sentences.",
      "w_icon_1":                "3-5 word feature badge (most important material/structural feature)",
      "w_icon_2":                "3-5 word feature badge (durability or quality)",
      "w_icon_3":                "3-5 word feature badge (comfort, function, or mechanism)",
      "w_icon_4":                "3-5 word feature badge (fourth distinct selling point)",
      "small_description":       "15-20 words. Plain summary for category pages — what it is and one key differentiator.",
      "meta_keywords":           "8-10 comma-separated SEO keywords: product type, material, brand, style, use case."
    },
    { "...version 2 — different angle/tone..." },
    { "...version 3 — different angle/tone..." }
  ]
}"""


def build_system_instruction_3versions(
    category: CategoryType,
    example: Optional[Dict] = None,
) -> str:
    voice = _VOICE.get(category, _VOICE[CategoryType.HOME])
    example_block = _format_example(example)
    return f"{voice}\n\n{_OUTPUT_SCHEMA_3VERSIONS}\n{example_block}"


# ── Combine & polish prompt ──────────────────────────────────────────────────

def build_combine_prompt(selections: dict, product) -> str:
    """
    Build a prompt for Claude to harmonize mix-matched fields and generate HTML preview.
    selections: dict of field_name → field_value (already resolved from version indices)
    """
    fields_text = "\n".join(f"  {k}: {v}" for k, v in selections.items() if v)

    product_lines = []
    if product.product_name:
        product_lines.append(f"Product: {product.product_name}")
    if product.sku_id:
        product_lines.append(f"SKU: {product.sku_id}")
    if product.room:
        product_lines.append(f"Category: {product.room}")
    if product.product_type:
        product_lines.append(f"Type: {product.product_type}")
    product_context = "\n".join(product_lines)

    return f"""You are a content editor for Durian Furniture, India's premium furniture brand.

Below are content fields selected from different generated variations for a single product. They may have slightly different tones or angles since they come from different versions.

=== PRODUCT CONTEXT ===
{product_context}

=== SELECTED FIELDS ===
{fields_text}

Your tasks:
1. HARMONIZE: Polish these fields so they read as a cohesive set — consistent tone, no contradictions, smooth flow. Keep the factual content intact, only adjust voice/style for consistency. Minimal changes preferred.
2. HTML PREVIEW: Generate a beautiful, self-contained HTML preview of this product content. Design a modern product-page layout with:
   - Clean, elegant typography (use system fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)
   - A warm color palette (stone/amber tones with brand accent #8B6914)
   - Good visual hierarchy: Design Story as hero, WYNI as feature grid, WYLI as callout, icons as badges
   - Responsive layout, max-width 800px, centered
   - All CSS inline or in a <style> tag within the HTML
   - The HTML should be completely self-contained (no external resources)

Return ONLY valid JSON:
{{
  "polished_content": {{
    "design_story": "...",
    "what_you_need_to_know": "...",
    "wyli_icon_text": "...",
    "w_icon_1": "...",
    "w_icon_2": "...",
    "w_icon_3": "...",
    "w_icon_4": "...",
    "small_description": "...",
    "meta_keywords": "..."
  }},
  "html_preview": "<html>...</html>"
}}"""


# ── Collection prompt (custom line) ──────────────────────────────────────────

def build_collection_user_content(
    collection_name: str,
    theme: str,
    products: list,
) -> str:
    product_lines = "\n".join(
        f"  - {p.product_name or p.sku_id} ({p.product_type or p.room or 'Furniture'})"
        for p in products
    )
    return f"""=== COLLECTION DATA ===
Collection Name: {collection_name}
Design Theme / Colour Palette: {theme}
Included Pieces ({len(products)}):
{product_lines}

Write collection-level content — not about individual pieces, but the collection as a whole.
Emphasise design cohesion, the colour story, and personalisation freedom.
"This is a starting point, not the limit." Return ONLY valid JSON."""
