# Continuum Intelligence -- Gold Companies Agent

**Status:** Phase 3 validation in progress
**Notebook ID:** `62589a28-c3a6-4b65-b737-266a6d4394e3`

**Current objective:** validate extraction quality, basis reconciliation, and provenance before Phase 4 backend automation.

**Phase 4 blocker:** the agent must produce complete, auditable mining data for both producer and developer cases.

---

## Setup (one-time)

```bash
# 1. Install
uv tool install notebooklm-mcp-cli

# 2. Verify install (expect: nlm, notebooklm-mcp, notebooklm-mcp-auth)
uv tool list | grep notebooklm

# 3. Authenticate (opens Chrome)
nlm login

# 4. Verify auth
nlm login --check

# 5. Wire to Claude Code
claude mcp add --scope user notebooklm-mcp notebooklm-mcp

# 6. Verify in Claude Code
# Run /mcp -- expect notebooklm-mcp listed with 29 tools

# 7. Create corpus notebook (already done)
# nlm notebook create "ASX Gold Companies Research"
# Notebook ID: 62589a28-c3a6-4b65-b737-266a6d4394e3 (already set in gold_agent_prompt.md)
```

---

## Target Universe

### Live pilot coverage

| Ticker | Company | Profile |
|--------|---------|---------|
| NST | Northern Star Resources | Major producer (~1.6Moz/year) |
| EVN | Evolution Mining | Major producer (~700koz/year) |
| RRL | Regis Resources | Mid-tier producer (~450koz/year) |
| WAF | West African Resources | Mid-tier producer |
| SBM | St Barbara | Mid-tier producer |

### Historical validation cases

| Ticker | Company | Note |
|--------|---------|------|
| DEG | De Grey Mining | Acquired by NST, May 2025 |
| GOR | Gold Road Resources | Acquired and delisted, Nov 2025 |

Historical cases are retained for edge-case testing only (null handling, pre-production schemas). Do not treat them as live coverage.

---

## Minimum Corpus Requirements Per Company

Do not run analysis unless the corpus contains, at minimum, for the company being analysed:

1. Latest annual report
2. Latest quarterly production report
3. Latest Ore Reserves and Mineral Resources statement
4. Latest investor presentation or production/guidance presentation
5. At least 2 recent ASX announcements relevant to guidance, capex, operations, or project development

A raw source count is not a sufficient quality threshold. Coverage by document type matters more than the number of files.

### Source ingestion

```bash
# Add by URL (ASX announcements)
nlm source add 62589a28-c3a6-4b65-b737-266a6d4394e3 --url "https://www.asx.com.au/asxpdf/..."

# Add local PDF
nlm source add 62589a28-c3a6-4b65-b737-266a6d4394e3 --file "./NST_FY24_Annual_Report.pdf"

# Check what's loaded
nlm notebook list --full
```

### Corpus verification queries

Run these after ingestion for each company:

```bash
GOLD_ID=62589a28-c3a6-4b65-b737-266a6d4394e3

# Asset-level extraction
nlm notebook query $GOLD_ID "List all assets, ownership percentages, jurisdictions, and mining methods."

# Reserve and resource detail
nlm notebook query $GOLD_ID "Extract the latest reserve and resource table including grade, ounces, and mine life by asset."

# Production and cost (annual)
nlm notebook query $GOLD_ID "Extract latest annual production and AISC by asset and group."

# Production and cost (quarterly)
nlm notebook query $GOLD_ID "Extract latest quarterly production and AISC by asset and group."

# Balance sheet and commitments
nlm notebook query $GOLD_ID "Extract net debt, liquidity, debt maturities, and major capex commitments."

# Schema completeness
nlm notebook query $GOLD_ID "Identify all fields required by the agent schema that are absent from the corpus."
```

---

## Data Integrity Warnings

Gold-company disclosures frequently contain multiple valid values for the same metric. Before accepting any output, check for the following:

- **Attributable vs 100%-owned** production and reserves
- **Continuing operations vs total group** metrics
- **Reserve grade vs mined grade vs processed grade**
- **Annual figures vs quarterly run-rate** figures
- **Asset-level AISC distorted by copper or other by-product credits**

The agent must not choose silently between conflicting values. If basis is unclear, it must surface the conflict and preserve both values in evidence.

---

## Running an Analysis Session

In Claude Code with the NotebookLM MCP active:

```
Analyse Northern Star Resources (NST) using the gold companies NotebookLM corpus
[notebook ID: 62589a28-c3a6-4b65-b737-266a6d4394e3].

Follow the gold agent system prompt at agents/gold_agent_prompt.md.

Return structured JSON matching the CI v3 data contract.
```

---

## Validation Gate (Phase 3 -> Phase 4)

All of the following must pass before Phase 4 begins:

1. NST produces valid JSON and complete asset-level extraction
2. EVN produces valid JSON, reconciles basis conflicts correctly, and cites source sections
3. One developer case produces valid JSON with correct null handling for producer-only metrics
4. Ownership percentages are correct for all non-100% assets
5. Information gaps are explicitly listed where the corpus is silent
6. No silent conflicts remain between annual report, quarterly, and reserve statement values

Passing JSON syntax alone is not sufficient. The output must also be complete, auditable, and basis-consistent.

---

## Stop Conditions

Do not run a company analysis if any of the following are missing:

- Latest annual report
- Latest quarterly production report
- Latest reserve/resource statement

If one of these is absent, return a corpus completeness warning instead of a full analysis.

---

## Auth Maintenance

Google session cookies expire every 2-4 weeks. When `nlm login --check` fails:

```bash
nlm login   # Re-authenticates via Chrome
```

For the Railway headless path (Phase 4): after re-auth, export updated cookies:

```bash
# Export to env var format for Railway dashboard
cat ~/.notebooklm/storage_state.json | base64
# Paste the output into NOTEBOOKLM_AUTH_JSON in Railway dashboard
```

## MCP Context Window

The NotebookLM MCP loads 29 tools. Toggle off when not doing gold analysis:

```
@notebooklm-mcp   # toggles the MCP on/off in Claude Code
```

---

## Phase 4: Railway Backend (Deferred)

`agents/gold_agent.py` will be created after Phase 3 validation. It uses `notebooklm-py` (headless Python client, no MCP) for the automated Railway path. The system prompt in `gold_agent_prompt.md` is shared between both the interactive (MCP) and automated paths.
