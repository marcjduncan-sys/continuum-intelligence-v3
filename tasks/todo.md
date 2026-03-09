# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**Phase 2 — User Identity + Conversation Persistence**

Goal: Conversations survive browser closes. Guest mode for marketing trial. OTP + JWT auth for
returning users. Mandatory login enforcement deferred to Phase 3 (one config flag).

---

## Phase 2 Tracks

### Step 0 — Railway PostgreSQL verification (manual)
- [ ] Open Railway dashboard, confirm `DATABASE_URL` is injected into the service environment
- [ ] If absent: New > Database > Add PostgreSQL
- [ ] Verify health endpoint returns healthy after any redeploy

### Track A — Auth Backend
- [x] **A1** — `api/migrations/002_auth.sql`: otp_tokens table + guest_id column on conversations
- [x] **A2** — `api/db.py`: update `run_migrations()` to apply all `*.sql` files in order; add upsert_user, save_otp, verify_otp, get_user_by_id helpers
- [x] **A3** — `api/config.py`: add JWT_SECRET, JWT_EXPIRY_DAYS, EMAIL_FROM, SMTP_* env vars
- [x] **A4** — `requirements.txt`: add PyJWT>=2.8.0, aiosmtplib>=3.0.0
- [x] **A5** — `api/email_service.py`: async SMTP send, graceful no-op if SMTP not configured
- [x] **A6** — `api/auth.py`: POST /request-otp, POST /verify-otp, GET /me endpoints
- [x] **A7** — `api/main.py`: register auth router at `/api/auth`

### Track B — Conversation Persistence Backend
- [x] **B1** — `api/db.py`: add create_conversation, append_message, get_conversation_by_ticker helpers
- [x] **B2** — `api/conversations.py`: POST /api/conversations, POST /api/conversations/{id}/messages, GET /api/conversations/{ticker}
- [x] **B3** — `api/main.py`: register conversations router at `/api/conversations`

### Track C — Frontend Integration
- [x] **C1** — `src/features/auth.js`: guest UUID, JWT storage, two-step OTP modal
- [x] **C2** — `src/main.js`: import and init auth module
- [x] **C3** — `src/features/chat.js`: inject auth header, persist turns to DB, restore history on init
- [ ] **C4** — Verify: send message, reload page, history reappears (requires Railway PostgreSQL + env vars)

---

## Backlog (Phase 3+)

- [ ] Mandatory login enforcement (flip one config flag in auth.py)
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
