// Workstation JSON payload schema validator
// Pure JS validator; no external dependencies

const VERDICT_RATINGS = new Set(['Strong Buy', 'Accumulate', 'Hold', 'Reduce', 'Sell']);
const SKEW_OPTIONS = new Set(['Strong upside', 'Moderate upside', 'Balanced', 'Moderate downside', 'Strong downside']);
const WATCHLIST_SEVERITIES = new Set(['High', 'Medium', 'Low', 'Supportive']);
const EVIDENCE_CATEGORIES = new Set(['Observed', 'Inference', 'Tripwire']);
const EVIDENCE_QUALITIES = new Set(['High quality', 'Needs market proof', 'Directional', 'Critical']);
const RISK_IMPACTS = new Set(['High', 'Medium', 'Low']);
const RISK_PROBABILITIES = new Set(['High', 'Medium', 'Low-Medium', 'Low']);
const REVISION_DIRECTIONS = new Set(['positive', 'negative', 'neutral']);
const SCENARIO_STYLES = new Set(['bull', 'base', 'bear', 'stretch', 'stress']);
const CHAT_ROLES = new Set(['analyst', 'pm', 'strategist']);
const TAG_COLOURS = new Set(['blue', 'green', 'red', 'amber', 'violet']);

const REQUIRED_TOP_LEVEL_FIELDS = [
  'schema_version',
  'generated_at',
  'identity',
  'verdict',
  'decision_strip',
  'summary',
  'watchlist',
  'thesis',
  'scenarios',
  'valuation',
  'risks',
  'evidence',
  'revisions',
  'deep_research',
  'quality',
  'chat_seed',
];

/**
 * Check if a string contains unbalanced or disallowed HTML tags.
 * Returns warnings for other tags, errors for unbalanced strong tags.
 * @param {string} text
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateInlineHtml(text) {
  if (!text || typeof text !== 'string') {
    return { valid: true, warnings: [] };
  }

  const warnings = [];

  // Count strong tags
  const strongOpenCount = (text.match(/<strong>/g) || []).length;
  const strongCloseCount = (text.match(/<\/strong>/g) || []).length;

  if (strongOpenCount !== strongCloseCount) {
    return {
      valid: false,
      warnings: [`Unbalanced <strong> tags: ${strongOpenCount} open, ${strongCloseCount} close`],
    };
  }

  // Find all HTML tags
  const allTags = text.match(/<[^>]+>/g) || [];

  // Check for disallowed tags (anything other than strong)
  for (const tag of allTags) {
    if (tag !== '<strong>' && tag !== '</strong>') {
      warnings.push(`Disallowed HTML tag found: ${tag}. Only <strong> and </strong> are permitted.`);
    }
  }

  return { valid: true, warnings };
}

/**
 * Validate scenario probability distribution.
 * Sum must equal 1.00 (tolerance 0.001).
 * Base case must be 0.35-0.55.
 * Non-base scenarios must not exceed 0.30.
 * @param {array} scenarios
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateScenarioProbabilities(scenarios) {
  const errors = [];

  if (!Array.isArray(scenarios)) {
    errors.push('Scenarios must be an array');
    return { valid: false, errors };
  }

  if (scenarios.length < 3 || scenarios.length > 5) {
    errors.push(`Scenarios must contain 3-5 items, got ${scenarios.length}`);
    return { valid: false, errors };
  }

  let sum = 0;
  let baseCount = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];

    if (!s || typeof s !== 'object') {
      errors.push(`Scenario at index ${i} is not an object`);
      continue;
    }

    if (typeof s.probability !== 'number') {
      errors.push(`Scenario at index ${i} has invalid probability: expected number, got ${typeof s.probability}`);
      continue;
    }

    if (s.probability < 0.01 || s.probability > 0.99) {
      errors.push(`Scenario at index ${i} probability ${s.probability} outside range [0.01, 0.99]`);
    }

    sum += s.probability;

    if (s.style === 'base') {
      baseCount += 1;
      if (s.probability < 0.35 || s.probability > 0.55) {
        errors.push(`Base case scenario probability ${s.probability} outside range [0.35, 0.55]`);
      }
    } else {
      if (s.probability > 0.30) {
        errors.push(`Non-base scenario "${s.style}" has probability ${s.probability} exceeding max 0.30`);
      }
    }
  }

  if (Math.abs(sum - 1.0) > 0.001) {
    errors.push(`Scenario probabilities sum to ${sum.toFixed(3)}, not 1.0 (tolerance 0.001)`);
  }

  if (baseCount !== 1) {
    errors.push(`Expected exactly 1 base case scenario, found ${baseCount}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate entire workstation payload against schema.
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateWorkstationPayload(payload) {
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a non-null object');
    return { valid: false, errors, warnings };
  }

  // Check required top-level fields
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in payload)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // schema_version
  if (payload.schema_version !== '1.0.0') {
    errors.push(`schema_version must be "1.0.0", got "${payload.schema_version}"`);
  }

  // identity
  if (payload.identity && typeof payload.identity === 'object') {
    const ticker = payload.identity.ticker;
    if (!ticker || typeof ticker !== 'string' || ticker.length === 0 || ticker.length > 6) {
      errors.push(`identity.ticker must be non-empty string, max 6 chars; got "${ticker}"`);
    }
  }

  // verdict
  if (payload.verdict && typeof payload.verdict === 'object') {
    const { rating, skew, confidence_pct } = payload.verdict;

    if (!VERDICT_RATINGS.has(rating)) {
      errors.push(`verdict.rating must be one of ${Array.from(VERDICT_RATINGS).join(', ')}; got "${rating}"`);
    }

    if (!SKEW_OPTIONS.has(skew)) {
      errors.push(`verdict.skew must be one of ${Array.from(SKEW_OPTIONS).join(', ')}; got "${skew}"`);
    }

    if (typeof confidence_pct !== 'number' || !Number.isInteger(confidence_pct) || confidence_pct < 0 || confidence_pct > 100) {
      errors.push(`verdict.confidence_pct must be integer 0-100; got ${confidence_pct}`);
    }
  }

  // scenarios
  if (Array.isArray(payload.scenarios)) {
    const scenarioErrors = validateScenarioProbabilities(payload.scenarios);
    errors.push(...scenarioErrors.errors);

    for (let i = 0; i < payload.scenarios.length; i++) {
      const s = payload.scenarios[i];
      if (s && typeof s === 'object') {
        if (!SCENARIO_STYLES.has(s.style)) {
          errors.push(`scenarios[${i}].style must be one of ${Array.from(SCENARIO_STYLES).join(', ')}; got "${s.style}"`);
        }
      }
    }
  } else if (payload.scenarios !== undefined) {
    errors.push('scenarios must be an array');
  }

  // watchlist
  if (Array.isArray(payload.watchlist)) {
    if (payload.watchlist.length < 3 || payload.watchlist.length > 5) {
      errors.push(`watchlist must contain 3-5 items, got ${payload.watchlist.length}`);
    }
    for (let i = 0; i < payload.watchlist.length; i++) {
      const item = payload.watchlist[i];
      if (item && typeof item === 'object') {
        if (!WATCHLIST_SEVERITIES.has(item.severity)) {
          errors.push(`watchlist[${i}].severity must be one of ${Array.from(WATCHLIST_SEVERITIES).join(', ')}; got "${item.severity}"`);
        }
      }
    }
  } else if (payload.watchlist !== undefined) {
    errors.push('watchlist must be an array');
  }

  // evidence
  if (payload.evidence && typeof payload.evidence === 'object' && Array.isArray(payload.evidence.items)) {
    for (let i = 0; i < payload.evidence.items.length; i++) {
      const item = payload.evidence.items[i];
      if (item && typeof item === 'object') {
        if (!EVIDENCE_CATEGORIES.has(item.category)) {
          errors.push(`evidence.items[${i}].category must be one of ${Array.from(EVIDENCE_CATEGORIES).join(', ')}; got "${item.category}"`);
        }
        if (!EVIDENCE_QUALITIES.has(item.quality)) {
          errors.push(`evidence.items[${i}].quality must be one of ${Array.from(EVIDENCE_QUALITIES).join(', ')}; got "${item.quality}"`);
        }
      }
    }
  }

  // risks
  if (payload.risks && typeof payload.risks === 'object' && Array.isArray(payload.risks.items)) {
    for (let i = 0; i < payload.risks.items.length; i++) {
      const item = payload.risks.items[i];
      if (item && typeof item === 'object') {
        if (!RISK_IMPACTS.has(item.impact)) {
          errors.push(`risks.items[${i}].impact must be one of ${Array.from(RISK_IMPACTS).join(', ')}; got "${item.impact}"`);
        }
        if (!RISK_PROBABILITIES.has(item.probability)) {
          errors.push(`risks.items[${i}].probability must be one of ${Array.from(RISK_PROBABILITIES).join(', ')}; got "${item.probability}"`);
        }
      }
    }
  }

  // revisions
  if (payload.revisions && typeof payload.revisions === 'object' && Array.isArray(payload.revisions.items)) {
    for (let i = 0; i < payload.revisions.items.length; i++) {
      const item = payload.revisions.items[i];
      if (item && typeof item === 'object') {
        if (!REVISION_DIRECTIONS.has(item.direction)) {
          errors.push(`revisions.items[${i}].direction must be one of ${Array.from(REVISION_DIRECTIONS).join(', ')}; got "${item.direction}"`);
        }
      }
    }
  }

  // chat_seed
  if (payload.chat_seed && typeof payload.chat_seed === 'object' && Array.isArray(payload.chat_seed.messages)) {
    for (let i = 0; i < payload.chat_seed.messages.length; i++) {
      const msg = payload.chat_seed.messages[i];
      if (msg && typeof msg === 'object') {
        if (!CHAT_ROLES.has(msg.role)) {
          errors.push(`chat_seed.messages[${i}].role must be one of ${Array.from(CHAT_ROLES).join(', ')}; got "${msg.role}"`);
        }
        if (msg.tag && typeof msg.tag === 'object') {
          if (!TAG_COLOURS.has(msg.tag.colour)) {
            errors.push(`chat_seed.messages[${i}].tag.colour must be one of ${Array.from(TAG_COLOURS).join(', ')}; got "${msg.tag.colour}"`);
          }
        }
      }
    }
  }

  // Check for empty strings in required string fields
  const stringFields = [
    'summary',
    'decision_strip',
    'thesis',
  ];

  for (const fieldName of stringFields) {
    const val = payload[fieldName];
    if (val === '') {
      errors.push(`Required string field "${fieldName}" contains empty string. Use "Data absent from source" instead.`);
    }
  }

  // Validate inline HTML in certain text fields
  const htmlCheckFields = ['summary', 'decision_strip', 'thesis'];
  for (const fieldName of htmlCheckFields) {
    const val = payload[fieldName];
    if (typeof val === 'string') {
      const htmlResult = validateInlineHtml(val);
      if (!htmlResult.valid) {
        errors.push(...htmlResult.warnings);
      }
      if (htmlResult.warnings && htmlResult.warnings.length > 0) {
        warnings.push(...htmlResult.warnings);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
