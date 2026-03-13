import os

import anthropic
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
_DEFAULT_ORIGINS = (
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

NOTEBOOKLM_GOLD_NOTEBOOK_ID = os.getenv("NOTEBOOKLM_GOLD_NOTEBOOK_ID", "")
NOTEBOOKLM_AUTH_JSON = os.getenv("NOTEBOOKLM_AUTH_JSON", "")

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret")
BATCH_SECRET = os.getenv("BATCH_SECRET", "")
INSIGHTS_SECRET = os.getenv("INSIGHTS_SECRET", "")
PRICE_DRIVERS_SECRET = os.getenv("PRICE_DRIVERS_SECRET", "")

# GitHub PAT with repo write scope -- used by add_stock() to commit new
# ticker scaffolds so data persists across Railway redeployments.
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
JWT_EXPIRY_DAYS = int(os.getenv("JWT_EXPIRY_DAYS", "30"))

# Email (SMTP) -- for OTP delivery. Optional: falls back to log-only if unset.
EMAIL_FROM = os.getenv("EMAIL_FROM", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

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
