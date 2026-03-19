import json
import os

import anthropic
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
_DEFAULT_ORIGINS = (
    "https://app.continuumintelligence.ai,"
    "https://marcjduncan-sys.github.io,"
    "http://localhost:3000,"
    "http://localhost:5000,"
    "http://localhost:5173"
)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip()
]
CI_API_KEY = os.getenv("CI_API_KEY", "").strip()
PORT = int(os.getenv("PORT", "8000"))
INDEX_HTML_PATH = os.path.realpath(os.getenv(
    "INDEX_HTML_PATH",
    os.path.join(os.path.dirname(__file__), "..", "dist", "index.html"),
))
# Project root directory — used to locate data/ and other assets
PROJECT_ROOT = os.path.realpath(os.getenv(
    "PROJECT_ROOT",
    os.path.join(os.path.dirname(__file__), ".."),
))
# Built frontend directory (Vite output)
DIST_DIR = os.path.realpath(os.getenv(
    "DIST_DIR",
    os.path.join(os.path.dirname(__file__), "..", "dist"),
))
MAX_PASSAGES = 12
MAX_CONVERSATION_TURNS = 20
HISTORY_TOKEN_BUDGET = int(os.getenv("HISTORY_TOKEN_BUDGET", "8000"))

CHAT_MAX_TOKENS = int(os.getenv("CHAT_MAX_TOKENS", "2048"))

# Gemini (Google) — specialist analysis
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Embedding model (Phase 7: Memory Selection & Ranking)
EMBEDDING_MODEL = "text-embedding-004"

DATABASE_URL = os.getenv("DATABASE_URL", "")

# ---------------------------------------------------------------------------
# Gold agent -- hybrid: NotebookLM primary, Gemini local corpus fallback.
# NotebookLM requires NOTEBOOKLM_AUTH_JSON (browser cookies, expire ~2 weeks)
# and NOTEBOOKLM_GOLD_NOTEBOOK_ID. When auth expires, the agent falls back
# to Gemini processing of local files in data/gold-corpus/{TICKER}/.
# ---------------------------------------------------------------------------

NOTEBOOKLM_GOLD_NOTEBOOK_ID = os.getenv("NOTEBOOKLM_GOLD_NOTEBOOK_ID", "").strip()
NOTEBOOKLM_AUTH_JSON = os.getenv("NOTEBOOKLM_AUTH_JSON", "").strip()

# Per-ticker notebook IDs.
# Primary source: data/config/notebooklm-notebooks.json committed to the repo.
# Optional override: NOTEBOOKLM_TICKER_NOTEBOOKS env var (JSON dict) — any key
# present in the env var takes precedence over the file (useful for secrets or
# temporary overrides without committing).
# When a new gold stock is added, just add a line to the JSON file and push.
_nlm_notebooks_file = os.path.realpath(
    os.path.join(os.path.dirname(__file__), "..", "data", "config", "notebooklm-notebooks.json")
)
try:
    with open(_nlm_notebooks_file, "r", encoding="utf-8") as _fh:
        _nlm_file_map: dict = {
            k: v for k, v in json.load(_fh).items()
            if not k.startswith("_")  # skip _comment / _format metadata keys
        }
except Exception:
    _nlm_file_map = {}

_nlm_ticker_map_raw = os.getenv("NOTEBOOKLM_TICKER_NOTEBOOKS", "{}")
try:
    _nlm_env_map: dict = json.loads(_nlm_ticker_map_raw)
except Exception:
    _nlm_env_map = {}

# Merge: file is the base, env var takes precedence (allows Railway overrides).
NOTEBOOKLM_TICKER_NOTEBOOKS: dict = {**_nlm_file_map, **_nlm_env_map}

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret")
BATCH_SECRET = os.getenv("BATCH_SECRET", "")
INSIGHTS_SECRET = os.getenv("INSIGHTS_SECRET", "")
PRICE_DRIVERS_SECRET = os.getenv("PRICE_DRIVERS_SECRET", "")

# ---------------------------------------------------------------------------
# Production secrets check — fail loud on Railway if secrets are insecure
# ---------------------------------------------------------------------------


def check_production_secrets() -> None:
    """Raise RuntimeError if running on Railway with insecure/missing secrets."""
    is_railway = (
        os.getenv("RAILWAY_ENVIRONMENT") is not None
        or os.getenv("RAILWAY_SERVICE_NAME") is not None
    )

    if not is_railway:
        return

    insecure: list[str] = []
    if JWT_SECRET == "dev-insecure-secret":
        insecure.append("JWT_SECRET")
    if not BATCH_SECRET:
        insecure.append("BATCH_SECRET")
    if not INSIGHTS_SECRET:
        insecure.append("INSIGHTS_SECRET")
    if not PRICE_DRIVERS_SECRET:
        insecure.append("PRICE_DRIVERS_SECRET")

    if insecure:
        raise RuntimeError(
            f"Production secrets not configured: {', '.join(insecure)}. "
            "Set these environment variables before deploying to Railway."
        )


check_production_secrets()

# GitHub PAT with repo write scope -- used by add_stock() to commit new
# ticker scaffolds so data persists across Railway redeployments.
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
JWT_EXPIRY_DAYS = int(os.getenv("JWT_EXPIRY_DAYS", "30"))

# Email -- OTP delivery via Resend HTTP API. Optional: falls back to log-only if unset.
EMAIL_FROM = os.getenv("EMAIL_FROM", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()

# ---------------------------------------------------------------------------
# Shared Anthropic client (singleton with timeout)
# ---------------------------------------------------------------------------

_anthropic_client: anthropic.Anthropic | None = None


def get_anthropic_client() -> anthropic.Anthropic:
    """Return the shared Anthropic client singleton (300s timeout)."""
    global _anthropic_client
    if _anthropic_client is None:
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY not configured")
        _anthropic_client = anthropic.Anthropic(
            api_key=ANTHROPIC_API_KEY,
            timeout=300.0,
        )
    return _anthropic_client
