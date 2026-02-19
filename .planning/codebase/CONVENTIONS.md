# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- **Scripts:** `kebab-case.js` (e.g., `fetch-live-prices.js`, `validate-coverage.js`, `update-prices.js`)
  - Location: `scripts/` directory
  - Pattern: Descriptive verb-noun combinations

- **Modules:** `camelCase.js` (e.g., `weighting.js`, `engine.js`, `evidence.js`)
  - Location: `js/dne/` and `scripts/lib/`
  - Pattern: Noun-based naming representing functionality

- **Test files:** `*.test.js` (e.g., `data-integrity.test.js`, `html-structure.test.js`)
  - Location: `tests/` directory
  - Pattern: Matches component name + `.test` suffix

**Functions:**
- **Named functions:** `camelCase` throughout (e.g., `loadJSON()`, `recalculateSurvival()`, `getActiveTickers()`)
- **Module-level private functions:** `camelCase` with internal organization by purpose (e.g., sections marked with `// ─── Comment ────`)
- **Event handlers:** `camelCase` imperative (e.g., `init()`, `handleClick()`)
- **Boolean predicates:** `is*` or `has*` pattern (e.g., `hasFreshness`, `allOk`)

**Variables:**
- **Module-level constants:** `SCREAMING_SNAKE_CASE` (e.g., `DIAGNOSTICITY_WEIGHTS`, `HYPOTHESIS_IDS`, `DATA_BASE_URL`)
- **Local variables:** `camelCase` (e.g., `stock`, `ticker`, `rules`, `allEvidence`)
- **Configuration objects:** `camelCase` (e.g., `config`, `analysisConfig`, `baseWeights`)
- **Loop counters:** Single letter or `i`, `j` in nested loops

**Types & Objects:**
- **Constructor/object literals:** `PascalCase` when used as constructors or significant objects (rare - mostly used lowercase for data objects)
- **Data attributes:** `snake_case` for storage attributes (e.g., `weighted_inconsistency`, `survival_score`, `last_updated`, `hypothesis_impact`)
- **JSON properties:** `snake_case` when representing database/persistent storage, `camelCase` when representing object properties

## Code Style

**Formatting:**
- **Indentation:** 2 spaces (observed in all source files and tests)
- **Line length:** No strict limit enforced; code varies from 80-120 characters
- **Semicolons:** Always used at end of statements
- **Quotes:** Single quotes `'` preferred in configuration and JSDoc comments, but file reading uses appropriate quotes

**Linting:**
- **Tool:** ESLint v8.56.0
- **Config:** Minimal configuration; no `.eslintrc` in root (uses defaults via npm)
- **Script:** Run with `npm run lint` (checks `scripts/` directory only)
- **Auto-fix:** `npm run lint:fix` available for automatic fixes
- **Excluded:** `extract-stock-data.js` and `refactor-stock-data.js` not linted

**Formatting conventions observed:**
- No Prettier config; manual formatting follows consistent style
- Spacing: Single blank line between functions, double blank lines between logical sections
- Function spacing: Blank line before function declaration

## Import Organization

**Order:**
1. Node.js built-ins (`fs`, `path`, `https`)
2. External dependencies (`@anthropic-ai/sdk`)
3. Local modules (`./lib/registry`, `./scripts/*`)

**Path Aliases:**
- No TypeScript aliases used
- Relative paths used consistently (`../`, `./`)
- Root-relative paths via `path.join(__dirname, ...)`

**Pattern examples from codebase:**
```javascript
const fs = require('fs');
const path = require('path');
const https = require('https');
const { loadRegistry, getActiveTickers } = require('./lib/registry');
```

**Module exports:**
- CommonJS pattern throughout: `module.exports = { funcA, funcB }`
- Named exports preferred over default exports
- Single object export with multiple named properties (registry.js pattern)

## Error Handling

**Patterns:**
- **Try-catch blocks:** Used for async operations and JSON parsing
  - Located in `app.js` loadJSON function and similar operations
  - Catches broad error types; logs to console with context prefix

- **Null/undefined checks:** Explicit checks before operations
  - Example: `if (!stock)`, `if (!config)`, `if (allEvidence.length === 0)`
  - Pattern: Guard clauses at function start

- **Validation:** Early return pattern for validation failures
  - Returns `null` or skips processing if preconditions unmet
  - Example in `app.js`: Returns early if `DNE_TICKER` not set

- **Promise handling:** `.then()/.catch()` and `async/await` mixed
  - Modern: `await Promise.all()` with try-catch
  - Legacy: `httpGet()` returns Promise with explicit resolve/reject

**Logging & errors:**
- Prefix convention: `[DNE]` for Dynamic Narrative Engine modules
- Levels: `console.error()`, `console.warn()`, `console.log()`
- No error recovery — errors logged and execution continues or returns null

## Logging

**Framework:** `console` API (no logging library)

**Patterns:**
- **Prefix pattern:** `[Component] message` (e.g., `[DNE]`, `[Coverage]`)
- **Log levels:**
  - `console.error()` — Failures, missing data
  - `console.warn()` — Missing configuration or non-critical issues
  - `console.log()` — Initialization messages, progress, debug info

- **Context inclusion:** Include ticker, status, or operation details
  - Example: `[DNE] Failed to load ${url}: ${err}`
  - Example: `[DNE] Ready — ${ticker} | Dominant: ${stock.dominant}`

**When to log:**
- Module initialization and bootstrap (`init()` in app.js)
- External API calls and authentication (Yahoo Finance session)
- Data validation and coverage checking
- State changes and narrative flips
- Errors and warnings during processing

## Comments

**When to Comment:**
- File-level documentation: JSDoc-style block at top describing module purpose
- Complex algorithms: Inline comments explaining scoring logic (e.g., survival calculation)
- Non-obvious variable usage: Especially for domain-specific concepts
- Section markers: ASCII art dividers for logical groupings

**JSDoc/TSDoc:**
- **File headers:** Full JSDoc block describing module purpose and dependencies
  - Example: `engine.js` describes scoring logic and includes `@param` for main functions

- **Function documentation:** JSDoc for public/exported functions
  - Includes `@param` with type and description
  - Includes `@returns` with type
  - Example from `weighting.js`: Clear parameter descriptions for `pearsonCorrelation(x, y)`

- **Inline comments:** Used for complex logic and algorithm steps
  - ASCII dividers (`// ─── Section Name ────`)
  - Not used for obvious code (good variable names are preferred)

**Pattern examples:**
```javascript
/**
 * Load a JSON file via fetch.
 *
 * @param {string} url  Relative or absolute URL
 * @returns {Object|null}
 */
async function loadJSON(url) {
```

## Function Design

**Size:** Generally 20-60 lines for main functions; utility functions 5-20 lines

**Parameters:**
- Single parameter for major operations (e.g., `recalculateSurvival(stock)`)
- Options object pattern not used; parameters passed individually
- Return values via mutation (e.g., `stock` mutated in place) or new object

**Return Values:**
- **Void/side-effect:** Functions mutate parent object (e.g., `recalculateSurvival()` mutates `stock`)
- **Data return:** Pure functions return computed values (e.g., `pearsonCorrelation()` returns number)
- **Null as error:** Functions return `null` on failure (e.g., `loadJSON()` returns `null` on HTTP error)
- **Promise:** Async functions return Promises (explicitly in callbacks or implicit in `async/await`)

**Patterns:**
- Guard clauses at function start for validation
- Early returns for edge cases and errors
- Iterative loops for collection processing (not functional programming patterns)

## Module Design

**Exports:**
- **CommonJS:** All modules use `module.exports`
- **Named exports:** Multiple functions exported as object properties
  - Example: `registry.js` exports `{ loadRegistry, getActiveTickers, ... }`
- **No default exports:** Consistent use of named exports

**Barrel Files:** Not used; direct imports from modules

**Module boundaries:**
- **scripts/lib/registry.js:** Central configuration reader (single source of truth)
- **js/dne/\*.js:** Domain-specific modules with narrow responsibility (engine, weighting, evidence, etc.)
- **scripts/\*.js:** Standalone executable scripts; each is a separate concern

**Global variables (browser):**
- Used in browser context for DNE initialization: `window.DNE_TICKER`, `window.DNE_STOCK`, `window.DNE_RULES`
- Pattern: Set externally, read by app.js initialization
- Also stores functions: `window.saveStockData`

**Coupling:**
- Tight coupling to shared data structures (stock object shape)
- Loose coupling between scripts (each reads registry independently)
- Browser modules communicate via global `window` object and DOM manipulation

## Project-Specific Patterns

**Stock data object shape:**
- Contains: `ticker`, `hypotheses`, `evidence`, `price_history`, `weighting`, `dominant`, `confidence`, `alert_state`
- Used throughout: Passed between functions, mutated with updated scores
- Persisted to: `data/stocks/${ticker}.json`

**Hypothesis scoring:**
- Four hypothesis tiers: `T1` (Growth), `T2` (Base), `T3` (Risk), `T4` (Disruption)
- Each has: `survival_score`, `weighted_inconsistency`, `status`, `label`
- Computation: Based on evidence diagnosticity and time-decay

**Evidence classification:**
- Types: Editorial, Price Signals
- Ratings per hypothesis: `CONSISTENT`, `INCONSISTENT`, `NEUTRAL`
- Weight levels: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

---

*Convention analysis: 2026-02-19*
