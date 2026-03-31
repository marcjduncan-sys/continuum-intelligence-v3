"""
Canonical configuration for Continuum Intelligence v3 backend.

ALL environment variables are read here and nowhere else.
Any os.getenv() call outside this file is a bug.

Variables are grouped by purpose. Each variable documents:
- Whether it is required (R) or optional (O)
- Its default value
- What it controls

Required (R) vars cause a startup failure in production (Fly.io) if missing.
Optional (O) vars log a warning but allow startup to continue.
"""

import json
import logging
import os
import sys

import anthropic
from dotenv import load_dotenv

load_dotenv()

_logger = logging.getLogger(__name__)


def _getenv_with_deprecation(primary: str, legacy: str, default: str = "") -> str:
    """Read env var, falling back to a deprecated name with a warning."""
    val = os.getenv(primary, "")
    if val:
        return val.strip()
    legacy_val = os.getenv(legacy, "")
    if legacy_val:
        _logger.warning(
            "Env var '%s' is deprecated; rename to '%s'", legacy, primary
        )
        return legacy_val.strip()
    return default

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
_DEFAULT_ORIGINS = (
    "https://app.continuumintelligence.ai,"
    "https://marcjduncan-sys.github.io,"
    "https://continuum-intelligence-v3.pages.dev,"
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
MAX_PASSAGES = 12
MAX_CONVERSATION_TURNS = 20
HISTORY_TOKEN_BUDGET = int(os.getenv("HISTORY_TOKEN_BUDGET", "8000"))

CHAT_MAX_TOKENS = int(os.getenv("CHAT_MAX_TOKENS", "2048"))

# Gemini (Google) — specialist analysis
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Embedding model (Phase 7: Memory Selection & Ranking)
EMBEDDING_MODEL = "gemini-embedding-001"

DATABASE_URL = os.getenv("DATABASE_URL", "")

# ---------------------------------------------------------------------------
# External data providers (Phase: Data Source Expansion)
# ---------------------------------------------------------------------------

# EODHD — financial statements, analyst estimates, insider transactions (paid)
EODHD_API_KEY = os.getenv("EODHD_API_KEY", "").strip()
EODHD_BASE_URL = "https://eodhd.com/api"

# Alpha Vantage — financial statement cross-validation (free, 25 req/day)  [O]
# Legacy name: ALPHA_VANTAGE
ALPHA_VANTAGE_API_KEY = _getenv_with_deprecation(
    "ALPHA_VANTAGE_API_KEY", "ALPHA_VANTAGE"
)

# Finnhub — US peer analyst estimates, insider sentiment (free tier, US only)  [O]
# Legacy name: FINNHUB_API
FINNHUB_API_KEY = _getenv_with_deprecation("FINNHUB_API_KEY", "FINNHUB_API")

# Twelve Data — pre-calculated technical indicators (free, 800 req/day)  [O]
TWELVE_DATA_API_KEY = os.getenv("TWELVE_DATA_API_KEY", "").strip()

# FRED — US economic data (free tier, 120 req/min)  [O]
FRED_API_KEY = os.getenv("FRED_API_KEY", "").strip()

# EIA — US energy data (free tier, 100 req/sec)  [O]
# Legacy name: EIA_API
EIA_API_KEY = _getenv_with_deprecation("EIA_API_KEY", "EIA_API")

# ACLED — conflict event data (OAuth)  [O]
ACLED_USERNAME = os.getenv("ACLED_USERNAME", "").strip()
ACLED_PASSWORD = os.getenv("ACLED_PASSWORD", "").strip()

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

# NotebookLM query limits for Analyst Chat integration
NOTEBOOKLM_CONTEXT_MAX_CHARS = int(os.getenv("NOTEBOOKLM_CONTEXT_MAX_CHARS", "6000"))
NOTEBOOKLM_QUERY_TIMEOUT_SECONDS = int(os.getenv("NOTEBOOKLM_QUERY_TIMEOUT_SECONDS", "60"))

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret")
BATCH_SECRET = os.getenv("BATCH_SECRET", "")
INSIGHTS_SECRET = os.getenv("INSIGHTS_SECRET", "")
PRICE_DRIVERS_SECRET = os.getenv("PRICE_DRIVERS_SECRET", "")
OPS_SECRET = os.getenv("OPS_SECRET", "")

# ---------------------------------------------------------------------------
# Monitoring  [O]
# ---------------------------------------------------------------------------

SENTRY_DSN = os.getenv("SENTRY_DSN", "")

# ---------------------------------------------------------------------------
# Feature flags  [O]
# ---------------------------------------------------------------------------

ENABLE_PM = os.getenv("ENABLE_PM", "true").lower() == "true"
ECONOMIST_PM_BRIDGE_ENABLED = os.getenv(
    "ECONOMIST_PM_BRIDGE_ENABLED", "true"
).lower() in ("true", "1", "yes")

# ---------------------------------------------------------------------------
# GitHub, email, JWT  [O unless noted]
# ---------------------------------------------------------------------------

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
JWT_EXPIRY_DAYS = int(os.getenv("JWT_EXPIRY_DAYS", "30"))

# Email -- OTP delivery via Resend HTTP API. Optional: falls back to log-only if unset.
EMAIL_FROM = os.getenv("EMAIL_FROM", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()

# ---------------------------------------------------------------------------
# Production environment detection
# ---------------------------------------------------------------------------


def _is_production() -> bool:
    """Detect production environment (Fly.io or Railway)."""
    return bool(
        os.getenv("FLY_ALLOC_ID")
        or os.getenv("RAILWAY_ENVIRONMENT")
        or os.getenv("RAILWAY_SERVICE_NAME")
    )


IS_PRODUCTION = _is_production()

# ---------------------------------------------------------------------------
# Startup validation -- fail loud in production if secrets/keys are missing
# ---------------------------------------------------------------------------


def check_production_secrets() -> None:
    """Raise RuntimeError in production with insecure/missing secrets."""
    if not IS_PRODUCTION:
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
    if not OPS_SECRET:
        insecure.append("OPS_SECRET")

    if insecure:
        raise RuntimeError(
            f"Production secrets not configured: {', '.join(insecure)}. "
            "Set these environment variables before deploying."
        )


def validate_config() -> None:
    """Validate all configuration at startup.

    In production: fail for missing required vars.
    In dev: warn for missing required vars.
    """
    required = {
        "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
        "DATABASE_URL": DATABASE_URL,
        "GEMINI_API_KEY": GEMINI_API_KEY,
    }
    missing = [k for k, v in required.items() if not v]

    if IS_PRODUCTION and missing:
        print(
            f"FATAL: Missing required environment variables: {', '.join(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)
    elif missing:
        for k in missing:
            _logger.warning("Config: %s not set (required in production)", k)


check_production_secrets()
validate_config()

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
