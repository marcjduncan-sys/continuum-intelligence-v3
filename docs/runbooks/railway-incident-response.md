# Runbook: Railway Incident Response

Use this runbook when the Railway backend is unresponsive, returning errors, or producing incorrect results.

---

## Step 1 — Confirm the incident

```bash
curl https://imaginative-vision-production-16cb.up.railway.app/api/health
```

**Expected:** `{"status": "ok"}` with HTTP 200.
**If timeout or 5xx:** Railway is down or starting up. Proceed to Step 2.
**If 401/403:** API key issue. Check environment variables (Step 4).
**If 200 but chat/refresh broken:** Logic error. Check logs (Step 3).

---

## Step 2 — Check Railway dashboard

1. Log into [railway.app](https://railway.app) and open the project
2. Check the **Deployments** tab -- confirm the latest deployment succeeded
3. If the latest deployment failed, check the build logs for errors (usually a missing env var or a pip dependency issue)
4. If the latest deployment succeeded but the service is not responding, click **Restart**

---

## Step 3 — Check logs

In the Railway dashboard, open **Logs** for the running service. Filter for:

- `ERROR` or `CRITICAL` -- indicates an unhandled exception in the FastAPI app
- `RuntimeError: ANTHROPIC_API_KEY not configured` -- missing env var (see Step 4)
- `FileNotFoundError` on `data/research/TICKER.json` -- `dist/` was not built or `INDEX_HTML_PATH` is wrong
- `RateLimitExceeded` -- Anthropic or Gemini API rate limit hit during batch refresh; wait and retry

---

## Step 4 — Check environment variables

In the Railway dashboard, open **Variables**. Confirm all required variables are set (from `api/config.py`):

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | App will not start without this |
| `GEMINI_API_KEY` | Yes | Specialist analysis fails without this |
| `CI_API_KEY` | No | Blank disables auth (dev mode) |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-4-6` |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-flash` |
| `ALLOWED_ORIGINS` | No | Defaults include GitHub Pages + localhost |

If a variable was recently rotated or deleted, add it back and redeploy.

---

## Step 5 — Check `dist/` build

Railway runs `npm run build` as part of its deploy. If this failed silently:

1. In Railway dashboard, check build logs for `vite build` errors
2. If `dist/` is missing, Railway cannot serve the frontend or locate `data/research/`
3. Fix: push a commit that triggers a clean Railway redeploy

---

## Step 6 — In-flight job loss

If a refresh or batch job was running during a Railway restart, the job record is lost (in-memory only). The frontend poller will eventually time out. The user will see an error.

Resolution: trigger the refresh again from the UI. There is no state to recover.

---

## Step 7 — Escalation

If Railway is down at the infrastructure level (not a code or config issue):
- Check [Railway status page](https://status.railway.app) for incidents
- The frontend degrades gracefully: research chat is unavailable, but all pre-loaded research data (from GitHub Pages + localStorage cache) remains accessible
- Users can still read all existing reports; they cannot trigger refreshes or use the analyst panel

---

## Notes

- Railway redeploys on every push to `main` via `.github/workflows/deploy.yml`. If a recent push broke the API, revert the commit and push again.
- Research data written to Railway's disk is ephemeral. A redeploy resets `dist/data/research/` to the git state at deploy time. This is expected behaviour, not data loss.
