# Continuum Intelligence -- Agents

This directory contains agent system prompts and (from Phase 4) backend agent modules.

---

## Gold Companies Agent

**Status:** Setup complete. Corpus ingestion (Phase 2) is the next step.

**Notebook ID:** `62589a28-c3a6-4b65-b737-266a6d4394e3`

### Setup (one-time)

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

### Source Ingestion

Minimum 15 sources across NST, EVN, DEG, GOR, RRL before running analysis.

```bash
# Add by URL (ASX announcements)
nlm source add 62589a28-c3a6-4b65-b737-266a6d4394e3 --url "https://www.asx.com.au/asxpdf/..."

# Add local PDF
nlm source add 62589a28-c3a6-4b65-b737-266a6d4394e3 --file "./NST_FY24_Annual_Report.pdf"

# Check what's loaded
nlm notebook list --full
```

Corpus verification queries (run after each batch):
```bash
GOLD_ID=62589a28-c3a6-4b65-b737-266a6d4394e3
nlm notebook query $GOLD_ID "What is Northern Star's current AISC per ounce and annual production guidance?"
nlm notebook query $GOLD_ID "What are the key risks to De Grey Mining's Hemi project development timeline?"
nlm notebook query $GOLD_ID "What is Evolution Mining's net debt position and capex guidance for FY25?"
```

### Running an Analysis Session

In Claude Code with the NotebookLM MCP active:

```
Analyse Northern Star Resources (NST) using the gold companies NotebookLM corpus
[notebook ID: 62589a28-c3a6-4b65-b737-266a6d4394e3].

Follow the gold agent system prompt at agents/gold_agent_prompt.md.

Return structured JSON matching the CI v3 data contract.
```

### Auth Maintenance

Google session cookies expire every 2-4 weeks. When `nlm login --check` fails:

```bash
nlm login   # Re-authenticates via Chrome
```

For Railway headless path (Phase 4): after re-auth, export updated cookies:

```bash
# Export to env var format for Railway dashboard
cat ~/.notebooklm/storage_state.json | base64
# Paste the output into NOTEBOOKLM_AUTH_JSON in Railway dashboard
```

### MCP Context Window

The NotebookLM MCP loads 29 tools. Toggle off when not doing gold analysis:

```
@notebooklm-mcp   # toggles the MCP on/off in Claude Code
```

---

## Target Universe (Pilot)

| Ticker | Company | Profile |
|--------|---------|---------|
| NST | Northern Star Resources | Major producer (~1.6Moz/year) |
| EVN | Evolution Mining | Major producer (~700koz/year) |
| DEG | De Grey Mining | Developer (Hemi, ~530koz/year target) |
| GOR | Gold Road Resources | Producer/royalty (Gruyere JV) |
| RRL | Regis Resources | Mid-tier producer (~450koz/year) |

Three profile types (major producer, mid-tier producer, developer) stress-test the
framework before extending coverage to the broader CI v3 gold universe.

---

## Validation Gate (Phase 3 -> Phase 4)

All three of the following must pass before Phase 4 (Railway backend) begins:

1. NST produces valid JSON matching the data contract
2. EVN produces valid JSON (different cost profile -- tests metrics extraction range)
3. DEG produces valid JSON (pre-production developer -- tests null handling for AISC)

All prose fields must comply with CI content standards: no em dashes, all claims quantified,
monitoring trigger is time-bound and specific, information_gaps populated where corpus is silent.

---

## Phase 4: Railway Backend (Deferred)

`agents/gold_agent.py` will be created after Phase 3 validation. It uses `notebooklm-py`
(headless Python client, no MCP) for the automated Railway path. The system prompt in
`gold_agent_prompt.md` is shared between both the interactive (MCP) and automated paths.
