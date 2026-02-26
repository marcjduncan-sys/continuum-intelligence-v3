import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
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

# Gemini (Google) — specialist analysis
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
