from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class CategoryType(str, Enum):
    HOME = "home"
    OFFICE = "office"
    CUSTOM = "custom"


class BrandType(str, Enum):
    DURIAN = "durian"
    PURE = "pure"


class ProviderType(str, Enum):
    CLAUDE = "claude"
    GEMINI = "gemini"


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ProductInput(BaseModel):
    """
    Mapped from Main Consolidated file.xlsx – Sheet1 (header at row 7, data from row 8).
    Captures all fields relevant to content generation.
    """
    sku_id: str
    product_name: Optional[str] = None

    # Category hierarchy
    room: Optional[str] = None            # col[0]  – "Room"   e.g. Living, Bedroom, Office
    product_type: Optional[str] = None    # col[2]  – "L3 / Type"  e.g. Reclining Sofas

    # Origin
    imported: Optional[bool] = None       # col[8]  – "Domestic/Imported"

    # Existing content (may already be filled – used as context, not the target)
    existing_small_description: Optional[str] = None  # col[12]
    existing_design_story: Optional[str] = None        # col[14]
    existing_meta_keywords: Optional[str] = None       # col[16]
    existing_bullet_points: Optional[str] = None       # col[18]

    # Materials & finish
    primary_color: Optional[str] = None        # col[22]
    secondary_color: Optional[str] = None      # col[23]
    finish: Optional[str] = None               # col[31]
    primary_material: Optional[str] = None     # col[32]
    filling_material: Optional[str] = None     # col[37]
    upholstery_type: Optional[str] = None      # col[38]
    leg_material: Optional[str] = None         # col[46]

    # Configuration & size
    configuration: Optional[str] = None       # col[55]
    dimensions: Optional[str] = None          # col[63] – Product Size
    net_weight: Optional[str] = None          # col[64]
    width_mm: Optional[str] = None            # col[75]
    depth_mm: Optional[str] = None            # col[76]
    height_mm: Optional[str] = None           # col[77]
    max_load_capacity: Optional[str] = None   # col[92]

    # Function & mechanism
    mechanism: Optional[str] = None           # col[96]
    function: Optional[str] = None            # col[97]

    # Other attributes
    warranty: Optional[str] = None            # col[106]
    style: Optional[str] = None               # col[108]
    care_instructions: Optional[str] = None   # col[114]

    # Existing W Icons (already filled in the Excel for some SKUs)
    w_icon_1: Optional[str] = None            # col[127]
    w_icon_2: Optional[str] = None            # col[128]
    w_icon_3: Optional[str] = None            # col[129]
    w_icon_4: Optional[str] = None            # col[130]

    raw_row: Dict[str, Any] = Field(default_factory=dict)


class GeneratedContent(BaseModel):
    """
    Mirrors the three output columns in MiracleAi.xlsx plus W Icon 1-4 from the Consolidated file.
    Also includes a short description and meta keywords for SEO.
    """
    sku_id: str

    # ── Primary outputs (matching MiracleAi.xlsx format) ──────────────────────
    design_story: Optional[str] = None
    # 1 paragraph, 65-70 words.
    # Tone: "X has been designed for those who…" – factual, evocative, specific.

    what_you_need_to_know: Optional[str] = None
    # 5-6 numbered points with bold headlines + 2-3 detail sentences each.
    # Total ~110-120 words.
    # Format: "1. HEADLINE\nDetail sentence. Detail sentence."

    wyli_icon_text: Optional[str] = None
    # "Why You Will Love It" — ~25 words.
    # Format: "Bold Tagline Headline\nOne or two supporting sentences."

    # ── W Icon badges (3-5 words each, fill 4 slots) ─────────────────────────
    w_icon_1: Optional[str] = None
    w_icon_2: Optional[str] = None
    w_icon_3: Optional[str] = None
    w_icon_4: Optional[str] = None

    # ── Supplementary outputs ─────────────────────────────────────────────────
    small_description: Optional[str] = None     # 15-20 words, plain product summary
    meta_keywords: Optional[str] = None         # comma-separated SEO keywords

    # ── Status ────────────────────────────────────────────────────────────────
    liked: Optional[bool] = None
    approved: bool = False
    error: Optional[str] = None


class GenerationRequest(BaseModel):
    sku_ids: List[str]
    category: CategoryType = CategoryType.HOME
    brand_type: BrandType = BrandType.DURIAN
    provider: ProviderType = ProviderType.CLAUDE


class FeedbackRequest(BaseModel):
    sku_id: str
    job_id: str
    liked: bool
    content: GeneratedContent


class RegenerateRequest(BaseModel):
    job_id: str
    sku_id: str
    category: CategoryType = CategoryType.HOME
    brand_type: BrandType = BrandType.DURIAN
    section: Optional[str] = None


class UpdateContentRequest(BaseModel):
    job_id: str
    sku_id: str
    updates: Dict[str, Any]
    approved: Optional[bool] = None


class CombineRequest(BaseModel):
    job_id: str
    sku_id: str
    selections: Dict[str, int]  # field name → version index (0-2)


class SKUResult(BaseModel):
    versions: List[GeneratedContent] = Field(default_factory=list)
    combined: Optional[GeneratedContent] = None
    html_preview: Optional[str] = None


class JobProgress(BaseModel):
    job_id: str
    status: JobStatus
    total: int
    processed: int
    results: List[SKUResult] = Field(default_factory=list)
    errors: List[Dict[str, str]] = Field(default_factory=list)
