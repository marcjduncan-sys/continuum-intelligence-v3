# BEAD-020: NotebookLM Registry Gap -- Execution Plan

**Date:** 2026-04-02
**Severity:** Critical (53% of coverage universe has no corpus context in Analyst Chat)
**Registry:** Bug Family 10 (Silent Integration Degradation)

---

## Problem

24 of 45 tickers have no NotebookLM notebook registered. Zero tickers have persisted `notebookCorpus` in their research JSON. The Analyst Chat silently degrades to prompt-only mode (no curated research context) for every affected ticker, returning "meaningful gap" responses when NotebookLM has rich data available.

## Root Cause

Fire-and-forget provisioning with no reconciliation loop. Auto-provisioning only ran at AddStock time and startup scaffold retry. Both silently skip on auth expiry with no periodic retry.

## Files Changed (4 files)

| File | Change |
|------|--------|
| `api/notebook_context.py` | Added `ensure_all_notebooks()` function. Added WARNING logs to `run_deep_extraction()` and `query_notebook_batch()` when no notebook found (previously silent `return {}`). |
| `api/main.py` | Added startup task (`_ensure_notebooks_startup`, 120s delay). Added periodic loop (`_notebook_provision_loop`, every 6h). Added 2 admin endpoints: `POST /api/notebooks/ensure-all`, `POST /api/notebooks/sync-registry`. |
| `api/refresh.py` | Added WARNING logs to Track 6 in both batch and single refresh paths when corpus extraction returns empty. |
| `docs/recurring-issues-registry.md` | Added BEAD-020 entry and new Bug Family 10 (Silent Integration Degradation). |

---

## Claude Code Execution Sequence

### Phase 1: Commit and Deploy

```bash
cd /path/to/continuum-intelligence-v3
git pull --rebase origin main

# Verify changes
python3 -c "import ast; [ast.parse(open(f).read()) for f in ['api/notebook_context.py','api/main.py','api/refresh.py']]; print('ALL OK')"
bash scripts/check-config-drift.sh
npm run test:unit

# Commit
git add api/notebook_context.py api/main.py api/refresh.py docs/recurring-issues-registry.md
git commit -m "fix: add automated NotebookLM notebook provisioning and eliminate silent degradation

BEAD-020: 24 of 45 tickers had no notebook registered. Analyst Chat
silently lost all corpus context for those tickers. Root cause was
fire-and-forget provisioning with no reconciliation loop.

Changes:
- ensure_all_notebooks() cross-references research files vs DB registry
- Startup provisioning (120s delay) + periodic retry (every 6h)
- Admin endpoints: POST /api/notebooks/ensure-all, sync-registry
- WARNING logs at all silent-skip points (was return {} with no log)
- New Bug Family 10 in recurring issues registry"

git pull --rebase origin main
npm run test:unit
git push origin main
```

### Phase 2: Verify Fly.io Deploy

Wait for GitHub Actions to trigger Fly.io deploy (changes touch `api/`).

```bash
# Confirm deploy succeeded
curl https://api.continuumintelligence.ai/api/health
# or
curl https://ci-api.fly.dev/api/health
```

### Phase 3: Reset Auth and Provision All Notebooks

**PREREQUISITE:** Run `Get NotebookLM Auth.bat` from Desktop first to get fresh cookies deployed to Fly.io.

```bash
# 1. Reset auth state on the running server
curl -X POST https://api.continuumintelligence.ai/api/notebooklm/reset-auth \
  -H "X-API-Key: $CI_API_KEY"

# 2. Provision all missing notebooks (this will take several minutes)
# Runs sequentially with 5s pause between each ticker
curl -X POST https://api.continuumintelligence.ai/api/notebooks/ensure-all \
  -H "X-API-Key: $CI_API_KEY"

# 3. Verify provisioning status
curl https://api.continuumintelligence.ai/api/notebooks/status \
  -H "X-API-Key: $CI_API_KEY"

# 4. Check for any still-pending
curl https://api.continuumintelligence.ai/api/notebooks/pending \
  -H "X-API-Key: $CI_API_KEY"

# 5. Sync DB registry to JSON fallback
curl -X POST https://api.continuumintelligence.ai/api/notebooks/sync-registry \
  -H "X-API-Key: $CI_API_KEY"
```

### Phase 4: Trigger Immediate Batch Refresh with force_corpus

**Do not wait until 02:00 AEDT.** Trigger refreshes immediately to populate `notebookCorpus` for all tickers.

```bash
# Trigger refresh for each ticker with force_corpus=true
# Do these in batches of 3-5 to respect Fly.io memory limits
# Priority tickers first (the ones you actively use for analysis)

for TICKER in GNP BHP CBA FMG QAN RIO; do
  echo "Refreshing $TICKER..."
  curl -X POST "https://api.continuumintelligence.ai/api/refresh/$TICKER?force_corpus=true" \
    -H "X-API-Key: $CI_API_KEY"
  echo ""
  sleep 30  # Wait for each to complete before starting next
done

# Then the rest in batches
for TICKER in 360 CNI EVN FPH IPX LNW MIN MSB MYX NST OCL ORI PYC REA RFG RMC SNX SOL STO WAF; do
  echo "Refreshing $TICKER..."
  curl -X POST "https://api.continuumintelligence.ai/api/refresh/$TICKER?force_corpus=true" \
    -H "X-API-Key: $CI_API_KEY"
  echo ""
  sleep 30
done

# Also refresh the 22 already-registered tickers that have no persisted corpus
for TICKER in AMC ASB CSL DRO DXS GMG GYG HRZ MQG NAB OBM PME SIG WDS WIA WOR WOW WTC XRO; do
  echo "Refreshing $TICKER..."
  curl -X POST "https://api.continuumintelligence.ai/api/refresh/$TICKER?force_corpus=true" \
    -H "X-API-Key: $CI_API_KEY"
  echo ""
  sleep 30
done
```

### Phase 5: Verify End-to-End

```bash
# 1. Check that notebookCorpus is now populated in research JSONs
# Pick a few tickers and check
for TICKER in GNP BHP CBA; do
  echo "--- $TICKER ---"
  python3 -c "
import json
with open('data/research/$TICKER.json') as f:
    d = json.load(f)
nc = d.get('notebookCorpus', {})
print('Has corpus:', bool(nc.get('_extractedAt')))
print('Dimensions:', nc.get('_dimensionsPopulated', 0))
print('Extracted at:', nc.get('_extractedAt', 'NONE'))
"
done

# 2. Test Analyst Chat for GNP management question
# Ask: "Tell me about GNP management. Performance track record and governance record?"
# Verify it now returns substantive data about insider sales, remuneration, governance

# 3. Check Fly.io logs for [NotebookSync] entries confirming the startup task ran
# and for Track 6 WARNING logs (these should now appear when corpus is missing,
# instead of silent skips)
```

---

## Verification Checklist

- [ ] All 45 tickers have notebook IDs in `GET /api/notebooks/status`
- [ ] `GET /api/notebooks/pending` returns empty list
- [ ] JSON fallback file has all 45 entries (after sync-registry)
- [ ] At least 5 priority tickers have `notebookCorpus._extractedAt` in research JSON
- [ ] Analyst Chat for GNP returns substantive management data
- [ ] Fly.io logs show `[NotebookSync] Startup: all tickers have notebooks`
- [ ] Fly.io logs show Track 6 WARNING logs for any tickers still missing corpus (not silent)

---

## Ongoing Monitoring

After this fix, the system self-heals:

- **Every startup:** `ensure_all_notebooks()` runs 120s after boot
- **Every 6 hours:** periodic loop retries any missing/failed notebooks
- **Every refresh:** Track 6 now logs WARNING if corpus is empty (visible in Sentry/Fly.io logs)
- **Auth expiry:** still blocks provisioning (unavoidable), but next run after auth reset catches everything missed

The only manual step that remains is running `Get NotebookLM Auth.bat` every 1-2 weeks when cookies expire.
