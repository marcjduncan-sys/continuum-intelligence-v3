# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**NotebookLM Gold Companies Agent — Pilot**

Goal: Wire notebooklm-mcp-cli into Claude Code, build an ASX gold equities research corpus,
and establish the agent workflow. Additive only -- zero changes to CI v3 frontend or Railway backend
until Phase 4 (gated on Phase 3 validation).

---

## Gold Agent Phases

### Phase 1 — Install and Wire MCP (USER ACTION REQUIRED)

These steps require a terminal session and browser access. Claude Code cannot run them.

- [x] **1A** — Install: `uv tool install notebooklm-mcp-cli` (v0.4.4)
- [x] **1B** — Verify install: two executables present: `nlm`, `notebooklm-mcp` (no notebooklm-mcp-auth in v0.4.4)
- [x] **1C** — Authenticate: pre-existing valid session found (marcjduncan@gmail.com)
- [x] **1D** — Verify auth: `PYTHONIOENCODING=utf-8 nlm login --check` passes (Unicode workaround needed on Windows)
- [x] **1E** — Wire to Claude Code: `claude mcp add --scope user notebooklm-mcp notebooklm-mcp` -- done
- [ ] **1F** — Verify in Claude Code: `/mcp` -- notebooklm-mcp listed with 29 tools (manual check)
- [x] **1G** — Create notebook: ID `62589a28-c3a6-4b65-b737-266a6d4394e3`
- [x] **1H** — Notebook ID set in `agents/gold_agent_prompt.md` and `agents/README.md`
- [x] **1I** — Verify: empty notebook returns INVALID_ARGUMENT on query -- expected, not a bug

### Phase 2 — Source Ingestion (COMPLETE)

**Pilot universe revised**: DEG acquired by NST (May 2025), GOR acquired and delisted (Nov 2025).
Replacements: WAF (West African Resources, Burkina Faso jurisdiction risk) and SBM (St Barbara, turnaround thesis).

**Note**: stbarbara.com.au is Cloudflare-protected -- NotebookLM cannot ingest from it directly.
Use ASX announcement server URLs (announcements.asx.com.au) for all SBM documents.

- [x] **2A -- NST** (4 sources ingested)
  - Q2 FY26 Quarterly (Dec 2025) -- `62cebc69-a2b4-4d71-8e13-bb5ae8b40a12`
  - H1 FY26 Half Year Report -- `13e69329-d5c7-4723-a8eb-e86012d8d5aa`
  - FY25 Annual Report -- `e1273eaf-5421-44a1-8af6-07c580742913`
  - 1H FY26 Financial Results Summary -- `df9aafc6-367f-4cb5-9bd2-570a822b6c89`

- [x] **2B -- EVN** (3 sources ingested)
  - December 2024 Quarterly -- `db2fdb7f-c741-4cc5-ad62-9ab6f098d99a`
  - FY25 Annual Report -- `ef76f042-f3b0-450c-bb37-7584afb71e5b`
  - September 2025 Quarterly -- `a61da5f4-c29c-4562-af00-3f540ace8731`

- [x] **2C -- RRL** (2 sources ingested; Dec 2025 quarterly PDF not publicly accessible)
  - FY25 Annual Report -- `d12d61ae-e3f5-4029-b2d3-fcff8ac1bbad`
  - H1 December 2024 Report -- `a4acf9c1-4c45-4658-b986-ea98a2de53cc`

- [x] **2D -- WAF** (3 sources ingested)
  - December 2025 Quarterly -- `d994081c-5bf1-4a35-a786-a4d6f7116126`
  - September 2025 Quarterly -- `a29a622d-e321-41a5-848d-678f01fd21a0`
  - H1 2025 Financial Report -- `ecf36664-bb95-46eb-9264-54f49ee6485c`

- [x] **2E -- SBM** (3 sources ingested; all via announcements.asx.com.au)
  - H1 FY26 (ASX 20260216) -- `2930b579-c5a0-4526-95a5-80073aab97fa`
  - September 2025 Quarterly (ASX 20251031) -- `9162ab54-bbce-4109-baad-b2cbc08a0c3b`
  - FY25 Annual Report (ASX 20251001) -- `a43c9fc8-7be0-4602-b75b-e55e0fc42bfd`

- [x] **2F** -- Corpus answers all 3 test queries with grounded citations
  - NST: AISC A$2,600-2,800/oz; FY26 guidance 1,600-1,700koz (revised down from 1,700-1,850koz)
  - EVN: Net debt A$1,016.5m at 30 Jun 2025, reduced to A$659m by Sep 2025 (gearing 11%)
  - WAF: Burkina Faso demands additional 35% of Kiaka SA; Kiaka 95,155oz in 2025; AISC US$1,561/oz Q4

### Phase 3 -- Agent Analysis Sessions (CLAUDE RUNS)

- [x] **3A** -- Create `agents/` directory and `agents/gold_agent_prompt.md` with full system prompt
- [x] **3B** -- Notebook ID confirmed and set (no placeholder -- ID baked in at creation)
- [x] **3C** -- Run first analysis session: NST in Claude Code with MCP active
  - Output: agents/output/NST_20260310.json; skew_score 60 (moderate upside; KCGM transformation credible but FY26 peak-cost year with two guidance misses)
- [ ] **3D** -- Run second: EVN (different cost profile from NST -- stress-tests metrics extraction)
- [ ] **3E** -- Run third: WAF (Burkina Faso jurisdiction risk -- tests non-Australian asset handling)
  - Note: SBM is the alternate if WAF corpus proves too thin for full analysis
- [ ] **3F** -- Validate all prose fields against CI content standards (no em dashes, claims quantified,
               monitoring trigger time-bound, information_gaps populated)
- [ ] **3G** -- Validation gate: all 3 companies produce valid JSON matching data contract

### Phase 4 -- Railway Backend Integration (DEFERRED -- gated on 3G)

Do not start until Phase 3 validation gate passes.

- [ ] **4A** -- Create `agents/gold_agent.py` (headless backend path using notebooklm-py + Claude API)
- [ ] **4B** -- Add `/api/agents/gold/{ticker}` endpoint to `api/main.py`
- [ ] **4C** -- Add `notebooklm-py` to `requirements.txt`
- [ ] **4D** -- Add Railway env vars: `NOTEBOOKLM_AUTH_JSON`, `NOTEBOOKLM_GOLD_NOTEBOOK_ID`
- [ ] **4E** -- Test endpoint; confirm Railway healthcheck passes
- [ ] **4F** -- Push to main; verify GitHub Actions and Railway deploy

---

## Parallel Workstream -- Phase 2 Auth

Blocked on Railway action (not Claude's work):

- [ ] **Step 0** -- Open Railway dashboard, provision PostgreSQL add-on, confirm `DATABASE_URL` injected
- [ ] **Step 1** -- Add `JWT_SECRET` (32-char hex) to Railway dashboard
- [ ] **Step 2** -- Add SMTP env vars (EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
- [ ] **Step 3** -- Verify: first chat message persists across reload (C4 from previous plan)

---

## Backlog (Post-Gold Pilot)

- [ ] Technical analysis agent (no NotebookLM; needs market data API)
- [ ] Rates/property/banks agent (second NotebookLM notebook)
- [ ] Mandatory login enforcement (flip config flag in auth.py)
- [ ] Server-side prompt assembly (pnBuildSystemPrompt port) -- Phase 5

---

## Review Notes

### Gold agent constraints
- Zero changes to index.html, src/, or existing CI v3 frontend code until Phase 4
- Auth: Google session cookies last 2-4 weeks. Set calendar reminder to rotate NOTEBOOKLM_AUTH_JSON
- MCP adds 29 tools to context window. Toggle off when not doing gold analysis
- Free tier: ~50 NotebookLM queries/day. Monitor during validation sprint
- Phase 4 uses notebooklm-py (headless, no MCP) for Railway automation path

### Ingestion gotchas (learned during Phase 2)
- stbarbara.com.au (SBM) is Cloudflare-protected. NotebookLM fetches the challenge page and
  marks it "ready" with title "Attention Required! | Cloudflare". Always use announcements.asx.com.au
  for SBM documents. Check source title after ingestion -- if it contains "Cloudflare", delete and re-add.
- wcsecure.weblink.com.au is accessible to NotebookLM. Good fallback for WAF and RRL documents.
- yourir.info provides direct PDF links for EVN documents.
- RRL December 2025 quarterly PDF is not publicly accessible (403 across all known hosts).
  H1 December 2024 substituted.
