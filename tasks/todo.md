# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**Memory & Persistence — Week 1 COMPLETE**

All three tracks delivered. 185/185 tests passing. Pushed to main 2026-03-09.

---

## Backlog (Phase 2+, next week)

- [ ] Magic link authentication (send OTP to email, return JWT)
- [ ] `POST /api/conversations` — create conversation, link to user
- [ ] `POST /api/conversations/{id}/messages` — persist each chat turn
- [ ] `GET /api/conversations/{ticker}` — restore history from DB on page load
- [ ] Server-side prompt assembly (pnBuildSystemPrompt port) — Phase 5

---

## Completed

### Track A — Within-Session Memory Fix (2026-03-09)
- [x] **A1** — `conversations` restored from `sessionStorage` on module init (IIFE with try/catch)
- [x] **A2** — Persisted on every push (user message and assistant response write sites)
- [x] **A3** — sessionStorage cleared on conversation reset
- [x] **A4** — Verified: 2 BHP messages survived full page reload. 124/124 Vitest pass.

### Track B — Security Hardening (2026-03-09)
- [x] **B1** — CORS: `allow_origins=["*"]` → `allow_origins=config.ALLOWED_ORIGINS`
- [x] **B2** — `_sanitise_system_prompt()`: 6000-char cap (HTTP 400), strips 7 injection markers, logs WARNING
- [x] **B3** — Both `custom_system_prompt` and `system_prompt` sanitised before `effective_system` is built
- [x] **B4** — Deployed to Railway. Health check confirmed. GitHub Pages chat functional.

### Track C — Database Foundation (2026-03-09)
- [x] **C1** — `api/migrations/001_initial.sql`: users, conversations, messages tables + 4 indexes
- [x] **C2** — `api/db.py`: asyncpg pool singleton, run_migrations(), close_pool(), no-op when DATABASE_URL unset
- [x] **C3** — `api/main.py` lifespan() wired: pre-warm on startup, close on shutdown
- [x] **C4** — `DATABASE_URL = os.getenv("DATABASE_URL", "")` added to `api/config.py`
- [x] **C5** — `asyncpg>=0.29.0` added to `requirements.txt`
- [x] **C6** — `docs/runbooks/railway-postgres-setup.md` written

---

## Review Notes

### Known constraints
- `system_prompt`/`custom_system_prompt` cannot be removed in Phase 0 -- personalisation
  depends on it. Sanitise only. Full removal is Phase 5.
- Railway filesystem is ephemeral -- PostgreSQL must be the Railway add-on, not a file.
- `asyncpg` is a C extension with prebuilt Linux wheels -- Railway build should install cleanly.
  Verify first Railway build log after push to confirm.
- `chat.js` uses `var` (classic script convention per project style). Preserved throughout Track A.
