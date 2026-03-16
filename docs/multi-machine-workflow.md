# Multi-Machine Development Workflow

## Environment Structure

All code repositories live in `C:\Dev\` on every development machine, outside OneDrive. OneDrive is for documents only, never for code.

```
C:\Dev\
  continuum-intelligence-v3\     # Main repo (GitHub Pages + Railway)
  <other-repos>\                 # Future repos follow the same pattern

OneDrive\
  Continuum\                     # Documents, specs, design briefs (no code)
```

## Why Not OneDrive for Code

- OneDrive's file sync conflicts with file watchers (Vite, nodemon, tsc --watch)
- Rapid successive writes cause silent sync conflicts and data loss
- `git log --all` throws mmap errors on OneDrive-backed repos
- Lock files and node_modules create sync noise and performance issues

## Syncing Between Machines

Use git as the sole sync mechanism for code:

```bash
# Before starting work on any machine
cd C:\Dev\continuum-intelligence-v3
git pull --rebase origin main

# After completing work
git add <files>
git commit -m "descriptive message"
git push origin main
```

There is no staging environment. Every push goes directly to production (GitHub Pages for frontend, Railway for backend). Verify the GitHub Actions run succeeds after pushing.

## Pre-Push Checklist

1. `npx vitest run` -- all tests pass
2. `npx vite build` -- production build succeeds
3. `git pull --rebase origin main` -- sync with automated commits
4. `git push origin main`
5. Verify GitHub Actions deploy at https://github.com/marcjduncan-sys/continuum-intelligence-v3/actions
6. Verify Railway health: `curl https://imaginative-vision-production-16cb.up.railway.app/api/health`

## Claude Code Configuration

Claude Code sessions use `C:\Dev\continuum-intelligence-v3` as the working directory. The `.claude/` directory in the repo root contains:

- `launch.json` -- Vite dev server configuration
- `settings.json` -- tool permissions
- `hooks/` -- pre-push safety checks

## Secrets

Never commit secrets. API keys live in:

- **Railway dashboard** -- for backend environment variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, etc.)
- **GitHub Secrets** -- for GitHub Actions workflows only
- **Local env** -- not used; dev server proxies to Railway production API
