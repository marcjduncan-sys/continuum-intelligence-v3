# Panel Inventory -- Prototype vs Live

## Methodology

For each prototype file, recorded whether a chat/panel/sidebar appears on the right side
of the workstation grid, and compared to the live app panel state.

---

## Per-Page Panel Inventory

### 01-index.html (Home / Research)
- **Panel**: NONE
- **Layout**: 2-col (content-col + right-rail via `.workstation`)
- **Right col**: Static `.right-rail` with Alerts & Signals, Conviction Snapshot, Watchlist cards
- **Chat panel**: ABSENT
- **Live status**: MATCHES -- `.analyst-panel` and `.pm-panel` are `display:none` on non-report pages via shell.css

### 02-stock-detail.html (Stock Detail / Report)
- **Panel**: PRESENT -- inline `<aside class="chat-panel">` with 3 tabs (Analyst, PM, Strategist)
- **Panel width**: 520px (from `.workstation` grid: `minmax(0,1fr) 520px`)
- **Panel background**: `var(--surface)` (light/white)
- **Panel header**: AI Research Intelligence eyebrow, "Research Analyst" title, EWP context tag
- **Panel tabs**: Analyst (active, blue), PM (amber), Strategist (violet)
- **Chat panel**: PRESENT in right column of workstation grid
- **Live status**: MATCHES -- `renderChatPanel()` renders inline `.chat-panel` in report workstation grid

### 03-portfolio.html (Portfolio Intelligence)
- **Panel**: PRESENT -- inline `<aside class="chat-panel">` with 3 tabs, PM tab active
- **Panel width**: 520px
- **Panel background**: `var(--surface)` (light)
- **Context tag**: "Alpha Fund I · A$284.6M" (amber)
- **Live status**: DIVERGES -- live app hides `.analyst-panel`/`.pm-panel` on non-report pages; no inline chat panel rendered

### 04-comparator.html (Thesis Comparator)
- **Panel**: PRESENT -- inline `<aside class="chat-panel">` with 3 tabs, Analyst tab active
- **Panel width**: 520px
- **Panel background**: `var(--surface)` (light)
- **Context tag**: blue
- **Live status**: DIVERGES -- no inline chat panel; legacy panels hidden

### 05-deep-research.html (Deep Research)
- **Panel**: PRESENT -- inline `<aside class="chat-panel">` with 3 tabs
- **Panel width**: 520px
- **Live status**: DIVERGES -- no inline chat panel

### 06-pm-dashboard.html (PM Dashboard)
- **Panel**: PRESENT -- inline `<aside class="chat-panel">` with 3 tabs, Analyst tab active
- **Panel width**: 520px
- **Live status**: DIVERGES -- no inline chat panel

### 07-journal.html (Analyst Journal)
- **Panel**: PRESENT -- inline `<aside class="chat-panel">` with 3 tabs, Analyst tab active
- **Panel width**: 520px
- **Live status**: DIVERGES -- no inline chat panel

### 08-personalisation.html (Settings)
- **Panel**: NONE
- **Layout**: Single-column with `.settings-layout` (220px nav + content)
- **No capability strip** shown in prototype
- **Live status**: MATCHES for layout; strip present in live (not in prototype)

### 09-about.html (About)
- **Panel**: NONE
- **Layout**: Full-width with `manifesto-hero` + `page-body`
- **No capability strip** shown in prototype
- **Live status**: MATCHES

---

## Legacy Panel Discipline (shell.css rules)

Existing rules in `src/styles/shell.css` (lines 396-406):

```css
body:not([data-route-type="report"]) .analyst-panel,
body:not([data-route-type="report"]) .pm-panel,
body:not([data-route-type="report"]) .econ-panel,
body:not([data-route-type="report"]) .ap-fab,
body:not([data-route-type="report"]) .pm-fab { display: none !important; }

body:not([data-route-type="report"]).analyst-panel-open { padding-right: 0 !important; }
```

These rules correctly hide legacy overlay panels on all non-report pages.

---

## Divergences Requiring Future Work

The following pages have prototype-defined inline chat panels that the live app
does not render. These require JS changes to each page to add the chat panel HTML:

- `#portfolio` -- PM-tab inline chat panel
- `#thesis-comparator` -- Analyst-tab inline chat panel
- `#deep-research` -- Analyst-tab inline chat panel (on per-stock deep research pages)
- `#pm-dashboard` -- Analyst-tab inline chat panel
- `#analyst-journal` -- Analyst-tab inline chat panel

These are tracked as outstanding deviations in the visual parity report.
The live app's `.analyst-panel` overlay is functional on report pages.
