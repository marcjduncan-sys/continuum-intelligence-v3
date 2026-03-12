# Expand Hero Section Graphs

Reclaim wasted space around the POSITION IN RANGE bar graph in the HERO section.
The bar is 12px tall inside 82px of padding, and the container is 1240px in a 1528px space.

## Files: 2 (CSS only, no JS changes)

---

## 1. `src/styles/tokens.css` — Line 53

Widen global max-width from 1240px to 1480px.

```css
/* BEFORE */
--max-width: 1240px;

/* AFTER */
--max-width: 1480px;
```

> NOTE: This is a global token used by nav, section-inners, and all *-inner containers.
> > If you want hero-only expansion, skip this and add a scoped override instead:
> > > `.rh-spec-section .report-hero-inner { max-width: 1480px; }`
> > >
> > > ---
> > >
> > > ## 2. `src/styles/report.css` — Lines 127–214
> > >
> > > ### A. Section label (line 128): 0.55rem → 0.65rem
> > >
> > > ```css
> > > .rh-spec-label {
> > >     font-size: 0.65rem;       /* was 0.55rem */
> > >     font-weight: 700;
> > >     letter-spacing: 0.12em;
> > >     text-transform: uppercase;
> > >     color: var(--text-muted);
> > >     margin-bottom: var(--space-xs);
> > >     display: inline;
> > > }
> > > ```
> > >
> > > ### B. Position block bottom padding (line 150): space-lg → space-xl
> > >
> > > ```css
> > > .rh-position-range { padding-bottom: var(--space-xl); }
> > > ```
> > >
> > > ### C. Bar wrapper (lines 151–156): more room, remove !important, allow overflow
> > >
> > > ```css
> > > .pir-bar-wrap {
> > >     position: relative;
> > >     margin-top: var(--space-md);
> > >     padding: 32px 0 52px;     /* was 25px 0 45px !important */
> > >     overflow: visible;         /* was hidden */
> > > }
> > > ```
> > >
> > > ### D. Bar itself (lines 157–163): taller, wider, remove !important
> > >
> > > ```css
> > > .pir-bar {
> > >     position: relative;
> > >     height: 20px;              /* was 12px !important */
> > >     background: linear-gradient(to right, var(--signal-red), var(--signal-amber), var(--signal-green));
> > >     border-radius: 10px;       /* was 6px */
> > >     margin: 0 8px;             /* was 0 16px */
> > > }
> > > ```
> > >
> > > ### E. World markers (lines 164–169): reposition for taller bar
> > >
> > > ```css
> > > .pir-world {
> > >     position: absolute;
> > >     transform: translateX(-50%);
> > >     text-align: center;
> > >     top: 22px;                 /* was 14px !important */
> > > }
> > > ```
> > >
> > > ### F. World ticks (lines 170–179): taller ticks, remove !important
> > >
> > > ```css
> > > .pir-world-tick {
> > >     position: absolute;
> > >     top: -22px;                /* was -14px !important */
> > >     left: 50%;
> > >     transform: translateX(-50%);
> > >     width: 1.5px;              /* was 1px */
> > >     height: 22px;              /* was 14px !important */
> > >     background: rgba(138,154,184,0.45);
> > >     margin: 0;
> > > }
> > > ```
> > >
> > > ### G. World price labels (lines 180–186): larger font
> > >
> > > ```css
> > > .pir-world-price {
> > >     font-family: var(--font-data);
> > >     font-size: 0.8rem;        /* was 0.7rem */
> > >     font-weight: 600;
> > >     color: var(--text-secondary);
> > >     white-space: nowrap;
> > > }
> > > ```
> > >
> > > ### H. World scenario labels (lines 187–192): larger font
> > >
> > > ```css
> > > .pir-world-label {
> > >     font-size: 0.68rem;       /* was 0.58rem */
> > >     color: var(--text-muted);
> > >     white-space: nowrap;
> > >     margin-top: 3px;           /* was 2px */
> > > }
> > > ```
> > >
> > > ### I. Current price marker (lines 193–201): reposition higher
> > >
> > > ```css
> > > .pir-current {
> > >     position: absolute;
> > >     transform: translateX(-50%);
> > >     top: -30px;                /* was -24px !important */
> > >     text-align: center;
> > >     display: flex;
> > >     flex-direction: column-reverse;
> > >     align-items: center;
> > > }
> > > ```
> > >
> > > ### J. Current dot (lines 202–206): larger
> > >
> > > ```css
> > > .pir-current-dot {
> > >     font-size: 0.85rem;       /* was 0.7rem */
> > >     color: var(--accent-teal);
> > >     line-height: 1;
> > > }
> > > ```
> > >
> > > ### K. Current price label (lines 207–214): larger font
> > >
> > > ```css
> > > .pir-current-label {
> > >     font-family: var(--font-data);
> > >     font-size: 0.85rem;       /* was 0.72rem */
> > >     font-weight: 700;
> > >     color: var(--accent-teal);
> > >     white-space: nowrap;
> > >     margin-bottom: 3px;        /* was 2px */
> > > }
> > > ```
> > >
> > > ---
> > >
> > > ## Quick-reference change table
> > >
> > > | Property | Before | After |
> > > |---|---|---|
> > > | `--max-width` | 1240px | 1480px |
> > > | `.pir-bar` height | 12px !important | 20px |
> > > | `.pir-bar` margin | 0 16px | 0 8px |
> > > | `.pir-bar` radius | 6px | 10px |
> > > | `.pir-bar-wrap` padding | 25px 0 45px !important | 32px 0 52px |
> > > | `.pir-bar-wrap` overflow | hidden | visible |
> > > | `.pir-world` top | 14px !important | 22px |
> > > | `.pir-world-tick` height/top | 14px/-14px !important | 22px/-22px |
> > > | `.pir-current` top | -24px !important | -30px |
> > > | `.rh-spec-label` font | 0.55rem | 0.65rem |
> > > | All label fonts | 0.58–0.72rem | 0.68–0.85rem |
> > >
> > > ## Post-edit
> > >
> > > Run `npm run build` and redeploy.
