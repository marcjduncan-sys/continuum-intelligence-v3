# Continuum

Dual-track AI platform by DH Capital Partners: **Continuum Compliance** (aged care, childcare) and **Project Trinity** (AI agent system for portfolio managers with three-layer personalisation).

## Directory
```
ADMIN/           # Sensitive legal docs — DO NOT modify
Compliance/      # Product materials by vertical (Aged Care, Childcare, Shared)
Project Trinity/ # Specs, prototypes, graphics, platform docs
STRATEGY/        # Board papers, strategy briefings
tasks/           # Agent rewrite specs (30-76KB each) — see tasks/CLAUDE.md
scripts/         # Python & PowerShell automation — see scripts/CLAUDE.md
```

## Tech Stack
- Python (python-docx) · PowerShell · React 18 · HTML/CSS/JS
- React prototypes (`Project Trinity/Concepts/`): hooks-based, Intersection Observer, CSS Grid/Flexbox, self-contained HTML exports alongside JSX

## Commands
```bash
python scripts/generate_docx.py input.md output.docx                    # DH Capital DOCX (default)
python scripts/generate_docx.py input.md output.docx --brand cc         # Continuum Compliance DOCX
powershell -ExecutionPolicy Bypass -File scripts/<name>.ps1              # PowerShell
```

## Brand

### DH Capital Partners
Navy #1B2A4A · Gold #C9A96E · Dark Grey #2C2C2C · Calibri/Calibri Light

### Continuum Compliance
Deep Teal #1A5F6C · Midnight Teal #0E3A42 · Calm Sage #4A9E7E · Charcoal #2D3440
Plus Jakarta Sans (fallback: Calibri) · Source Serif 4 (long-form)
Brand assets: `Compliance/Brand/` · Logo files: `Compliance/Brand/logo/`

## File Naming
`Description Date.ext` (date DDMMYYYY) · versions: `v1`, `v2` · agent specs: `agent-name-rewrite.md`

## Workflow
- **All slash commands inherit** the base instruction set from `.claude/commands/_base-instructions.md` — apply its tone, thinking discipline, and output standards to every response triggered by a `/project:` command
- **Plan first.** Use Plan Mode before implementing anything non-trivial
- **Branch per feature.** Create a branch before making changes — never work directly on master
- **Commit after each completed task step** with descriptive messages
- **Tag before refactoring.** `git tag working-<feature>` before restructuring anything that works
- **Use /clear between unrelated tasks** to keep context clean
- **Delegate research to subagents** — keep the main conversation focused
- **When compacting, preserve:** current task state, file paths being worked on, architectural decisions made this session
- Generate markdown first, then convert to DOCX via generate_docx.py
- For complex builds, use the **interview-me** pattern: ask probing questions about edge cases and tradeoffs before writing a spec, then execute from the spec in a clean session

## Do Not
- Modify files in `ADMIN/` or legal docs in `Compliance/` without explicit instruction
- Read files >100KB in a single operation — use offset/limit
- Write to the same file in rapid succession (OneDrive sync conflicts)
- Inline agent spec content — @reference `tasks/` files instead
- Read large PNGs (8MB+) in `STRATEGY/` or `Graphics/`
- Run unscoped investigations — always specify which files/directories to examine
