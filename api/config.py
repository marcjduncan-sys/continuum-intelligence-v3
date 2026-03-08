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

DATABASE_URL = os.getenv("DATABASE_URL", "")

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
