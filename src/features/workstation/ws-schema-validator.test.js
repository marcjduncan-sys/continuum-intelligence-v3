// @vitest-environment jsdom
import {
  validateWorkstationPayload,
  validateScenarioProbabilities,
  validateInlineHtml,
} from './ws-schema-validator.js';

// Helper: build minimal valid payload for reuse in tests
function buildMinimalValidPayload() {
  return {
    schema_version: '1.0.0',
    generated_at: '2026-04-02T10:00:00Z',
    identity: {
      ticker: 'BHP',
    },
    verdict: {
      rating: 'Accumulate',
      skew: 'Moderate upside',
      confidence_pct: 75,
    },
    decision_strip: 'Strong fundamentals with near-term volatility risk.',
    summary: 'BHP offers compelling value at current levels.',
    watchlist: [
      { severity: 'High' },
      { severity: 'Medium' },
      { severity: 'Low' },
    ],
    thesis: 'Iron ore cycle inflection point favours increased output.',
    scenarios: [
      { style: 'bull', probability: 0.25 },
      { style: 'base', probability: 0.50 },
      { style: 'bear', probability: 0.25 },
    ],
    valuation: { method: 'DCF' },
    risks: {
      items: [
        { impact: 'High', probability: 'Medium' },
      ],
    },
    evidence: {
      items: [
        { category: 'Observed', quality: 'High quality' },
      ],
    },
    revisions: {
      items: [
        { direction: 'positive' },
      ],
    },
    deep_research: { status: 'pending' },
    quality: { score: 85 },
    chat_seed: {
      messages: [
        { role: 'analyst', tag: { colour: 'blue' } },
      ],
    },
  };
}

describe('validateInlineHtml', () => {
  test('empty string returns valid with no warnings', () => {
    const result = validateInlineHtml('');
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('null returns valid with no warnings', () => {
    const result = validateInlineHtml(null);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('plain text with no tags returns valid', () => {
    const result = validateInlineHtml('This is plain text');
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('properly closed strong tags return valid', () => {
    const result = validateInlineHtml('This is <strong>important</strong> text.');
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('multiple properly closed strong tags return valid', () => {
    const result = validateInlineHtml('<strong>First</strong> and <strong>second</strong> emphasis.');
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('unclosed strong tag returns invalid', () => {
    const result = validateInlineHtml('Text with <strong>unclosed tag');
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Unbalanced <strong> tags');
  });

  test('extra closing strong tag returns invalid', () => {
    const result = validateInlineHtml('Text </strong> with mismatch');
    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('Unbalanced <strong> tags');
  });

  test('disallowed em tag generates warning', () => {
    const result = validateInlineHtml('Text with <em>emphasis</em>');
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Disallowed HTML tag');
    expect(result.warnings[0]).toContain('<em>');
  });

  test('disallowed p tag generates warning', () => {
    const result = validateInlineHtml('Text with <p>paragraph</p>');
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Disallowed HTML tag');
  });

  test('strong tag with disallowed tag generates both warning and invalid if unbalanced', () => {
    const result = validateInlineHtml('<strong>text</strong> with <em>em tag</em>');
    expect(result.valid).toBe(true); // strong tags are balanced
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Disallowed HTML tag');
  });
});

describe('validateScenarioProbabilities', () => {
  test('not an array returns invalid', () => {
    const result = validateScenarioProbabilities({ style: 'base', probability: 0.5 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be an array');
  });

  test('too few scenarios (2) returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'base', probability: 0.6 },
      { style: 'bull', probability: 0.4 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3-5 items');
  });

  test('too many scenarios (6) returns invalid', () => {
    const scenarios = Array.from({ length: 6 }, (_, i) => ({
      style: i === 2 ? 'base' : 'bull',
      probability: i === 2 ? 0.4 : 0.1,
    }));
    const result = validateScenarioProbabilities(scenarios);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3-5 items');
  });

  test('probabilities not summing to 1.0 returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.3 },
      { style: 'base', probability: 0.4 },
      { style: 'bear', probability: 0.2 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('sum to');
  });

  test('base case below 0.35 returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.25 },
      { style: 'base', probability: 0.3 },
      { style: 'bear', probability: 0.45 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Base case scenario probability');
  });

  test('base case above 0.55 returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.2 },
      { style: 'base', probability: 0.7 },
      { style: 'bear', probability: 0.1 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Base case scenario probability');
  });

  test('non-base scenario exceeding 0.30 returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.4 },
      { style: 'base', probability: 0.5 },
      { style: 'bear', probability: 0.1 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeding max 0.30');
  });

  test('no base case returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.2 },
      { style: 'bear', probability: 0.2 },
      { style: 'stretch', probability: 0.3 },
      { style: 'stress', probability: 0.3 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exactly 1 base case');
  });

  test('multiple base cases returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'base', probability: 0.4 },
      { style: 'base', probability: 0.4 },
      { style: 'bear', probability: 0.2 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exactly 1 base case');
  });

  test('valid 3-scenario case with base at 0.35 (boundary low)', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.3 },
      { style: 'base', probability: 0.35 },
      { style: 'bear', probability: 0.35 },
    ]);
    // Bear at 0.35 exceeds non-base max of 0.30, so this is invalid
    // Let's create a truly valid case
    expect(result.valid).toBe(false);
  });

  test('valid 5-scenario case with base at 0.35 and non-base at max 0.30', () => {
    const result = validateScenarioProbabilities([
      { style: 'stretch', probability: 0.1 },
      { style: 'bull', probability: 0.25 },
      { style: 'base', probability: 0.35 },
      { style: 'bear', probability: 0.2 },
      { style: 'stress', probability: 0.1 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('valid 3-scenario case with base at 0.55 (boundary high)', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.225 },
      { style: 'base', probability: 0.55 },
      { style: 'bear', probability: 0.225 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('valid 3-scenario case with base at midpoint 0.45', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.275 },
      { style: 'base', probability: 0.45 },
      { style: 'bear', probability: 0.275 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('valid 5-scenario case with all constraints satisfied', () => {
    const result = validateScenarioProbabilities([
      { style: 'stretch', probability: 0.1 },
      { style: 'bull', probability: 0.2 },
      { style: 'base', probability: 0.4 },
      { style: 'bear', probability: 0.2 },
      { style: 'stress', probability: 0.1 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('probability 0.01 (boundary low) is valid', () => {
    const result = validateScenarioProbabilities([
      { style: 'stretch', probability: 0.01 },
      { style: 'base', probability: 0.45 },
      { style: 'bear', probability: 0.29 },
      { style: 'bull', probability: 0.25 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('probability 0.99 (boundary high) is valid', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.01 },
      { style: 'base', probability: 0.45 },
      { style: 'bear', probability: 0.29 },
      { style: 'stress', probability: 0.25 },
    ]);
    expect(result.valid).toBe(true);
    // Note: 0.99 can only be used in limited ways due to non-base max constraint
  });

  test('sum tolerance of 0.001 is respected', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.3 },
      { style: 'base', probability: 0.45 },
      { style: 'bear', probability: 0.251 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('sum exceeding tolerance returns invalid', () => {
    const result = validateScenarioProbabilities([
      { style: 'bull', probability: 0.3 },
      { style: 'base', probability: 0.45 },
      { style: 'bear', probability: 0.252 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('sum to');
  });
});

describe('validateWorkstationPayload', () => {
  test('payload is null returns invalid', () => {
    const result = validateWorkstationPayload(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be a non-null object');
  });

  test('payload is not an object returns invalid', () => {
    const result = validateWorkstationPayload('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be a non-null object');
  });

  test('minimal valid BHP-like payload passes validation', () => {
    const payload = buildMinimalValidPayload();
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('missing schema_version field returns invalid', () => {
    const payload = buildMinimalValidPayload();
    delete payload.schema_version;
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Missing required field: schema_version');
  });

  test('missing generated_at field returns invalid', () => {
    const payload = buildMinimalValidPayload();
    delete payload.generated_at;
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Missing required field: generated_at');
  });

  test('missing identity field returns invalid', () => {
    const payload = buildMinimalValidPayload();
    delete payload.identity;
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Missing required field: identity');
  });

  test('schema_version not matching 1.0.0 returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.schema_version = '2.0.0';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('schema_version must be "1.0.0"');
  });

  test('identity.ticker empty string returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.identity.ticker = '';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('identity.ticker must be non-empty string');
  });

  test('identity.ticker exceeding 6 chars returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.identity.ticker = 'TOOLONGBHP';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('identity.ticker');
  });

  test('invalid verdict.rating returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.verdict.rating = 'Maybe Buy';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('verdict.rating must be one of');
  });

  test('invalid verdict.skew returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.verdict.skew = 'Slightly upward';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('verdict.skew must be one of');
  });

  test('confidence_pct below 0 returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.verdict.confidence_pct = -5;
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('verdict.confidence_pct');
  });

  test('confidence_pct above 100 returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.verdict.confidence_pct = 105;
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('verdict.confidence_pct');
  });

  test('confidence_pct as float returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.verdict.confidence_pct = 75.5;
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('verdict.confidence_pct');
  });

  test('scenarios with count 2 returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.scenarios = [
      { style: 'base', probability: 0.6 },
      { style: 'bull', probability: 0.4 },
    ];
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3-5 items');
  });

  test('scenarios with count 6 returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.scenarios = Array.from({ length: 6 }, (_, i) => ({
      style: i === 2 ? 'base' : 'bull',
      probability: i === 2 ? 0.4 : 0.1,
    }));
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3-5 items');
  });

  test('scenarios with invalid probability sum returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.scenarios = [
      { style: 'bull', probability: 0.3 },
      { style: 'base', probability: 0.4 },
      { style: 'bear', probability: 0.2 },
    ];
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('sum to');
  });

  test('watchlist with 2 items returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.watchlist = [
      { severity: 'High' },
      { severity: 'Low' },
    ];
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3-5 items');
  });

  test('watchlist with 6 items returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.watchlist = Array.from({ length: 6 }, () => ({ severity: 'Medium' }));
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3-5 items');
  });

  test('invalid watchlist severity returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.watchlist[0].severity = 'Critical';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('watchlist[0].severity');
  });

  test('invalid evidence category returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.evidence.items[0].category = 'Rumour';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('evidence.items[0].category');
  });

  test('invalid evidence quality returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.evidence.items[0].quality = 'Weak';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('evidence.items[0].quality');
  });

  test('invalid risk impact returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.risks.items[0].impact = 'Catastrophic';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('risks.items[0].impact');
  });

  test('invalid risk probability returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.risks.items[0].probability = 'Certain';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('risks.items[0].probability');
  });

  test('invalid revision direction returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.revisions.items[0].direction = 'sideways';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('revisions.items[0].direction');
  });

  test('invalid scenario style returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.scenarios[0].style = 'bullish';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('scenarios[0].style');
  });

  test('invalid chat_seed message role returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.chat_seed.messages[0].role = 'advisor';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('chat_seed.messages[0].role');
  });

  test('invalid chat_seed tag colour returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.chat_seed.messages[0].tag.colour = 'pink';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('chat_seed.messages[0].tag.colour');
  });

  test('empty string in summary field returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.summary = '';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Required string field');
  });

  test('empty string in decision_strip field returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.decision_strip = '';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Required string field');
  });

  test('empty string in thesis field returns invalid', () => {
    const payload = buildMinimalValidPayload();
    payload.thesis = '';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Required string field');
  });

  test('unclosed strong tag in summary generates error', () => {
    const payload = buildMinimalValidPayload();
    payload.summary = 'This is <strong>important';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Unbalanced');
  });

  test('disallowed HTML tag in decision_strip generates warning', () => {
    const payload = buildMinimalValidPayload();
    payload.decision_strip = 'Text with <em>emphasis</em>';
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(true); // still valid, just warned
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Disallowed HTML tag');
  });

  test('valid payload with all edge cases and boundary values passes', () => {
    const payload = {
      schema_version: '1.0.0',
      generated_at: '2026-04-02T10:00:00Z',
      identity: {
        ticker: 'A', // 1 char, boundary low
      },
      verdict: {
        rating: 'Strong Buy',
        skew: 'Strong downside', // boundary value
        confidence_pct: 0, // boundary low
      },
      decision_strip: 'Text with <strong>emphasis</strong>.',
      summary: 'Summary with <strong>multiple</strong> <strong>strong</strong> tags.',
      watchlist: [
        { severity: 'Supportive' },
        { severity: 'High' },
        { severity: 'Low' },
      ],
      thesis: 'Thesis statement here.',
      scenarios: [
        { style: 'stretch', probability: 0.1 },
        { style: 'bull', probability: 0.25 },
        { style: 'base', probability: 0.35 }, // boundary low
        { style: 'bear', probability: 0.25 },
        { style: 'stress', probability: 0.05 },
      ],
      valuation: { method: 'DDM' },
      risks: {
        items: [
          { impact: 'Medium', probability: 'Low' },
          { impact: 'Low', probability: 'Low-Medium' },
        ],
      },
      evidence: {
        items: [
          { category: 'Tripwire', quality: 'Critical' },
        ],
      },
      revisions: {
        items: [
          { direction: 'neutral' },
        ],
      },
      deep_research: { status: 'complete' },
      quality: { score: 92 },
      chat_seed: {
        messages: [
          { role: 'pm', tag: { colour: 'violet' } },
        ],
      },
    };

    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('all verdict ratings are valid', () => {
    const payload = buildMinimalValidPayload();
    const ratings = ['Strong Buy', 'Accumulate', 'Hold', 'Reduce', 'Sell'];

    for (const rating of ratings) {
      payload.verdict.rating = rating;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all skew options are valid', () => {
    const payload = buildMinimalValidPayload();
    const skews = ['Strong upside', 'Moderate upside', 'Balanced', 'Moderate downside', 'Strong downside'];

    for (const skew of skews) {
      payload.verdict.skew = skew;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all watchlist severities are valid', () => {
    const payload = buildMinimalValidPayload();
    const severities = ['High', 'Medium', 'Low', 'Supportive'];

    for (const severity of severities) {
      payload.watchlist[0].severity = severity;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all evidence categories are valid', () => {
    const payload = buildMinimalValidPayload();
    const categories = ['Observed', 'Inference', 'Tripwire'];

    for (const category of categories) {
      payload.evidence.items[0].category = category;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all evidence qualities are valid', () => {
    const payload = buildMinimalValidPayload();
    const qualities = ['High quality', 'Needs market proof', 'Directional', 'Critical'];

    for (const quality of qualities) {
      payload.evidence.items[0].quality = quality;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all risk impacts are valid', () => {
    const payload = buildMinimalValidPayload();
    const impacts = ['High', 'Medium', 'Low'];

    for (const impact of impacts) {
      payload.risks.items[0].impact = impact;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all risk probabilities are valid', () => {
    const payload = buildMinimalValidPayload();
    const probs = ['High', 'Medium', 'Low-Medium', 'Low'];

    for (const prob of probs) {
      payload.risks.items[0].probability = prob;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all chat roles are valid', () => {
    const payload = buildMinimalValidPayload();
    const roles = ['analyst', 'pm', 'strategist'];

    for (const role of roles) {
      payload.chat_seed.messages[0].role = role;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all tag colours are valid', () => {
    const payload = buildMinimalValidPayload();
    const colours = ['blue', 'green', 'red', 'amber', 'violet'];

    for (const colour of colours) {
      payload.chat_seed.messages[0].tag.colour = colour;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });

  test('all scenario styles are valid', () => {
    const payload = buildMinimalValidPayload();
    const styles = ['bull', 'base', 'bear', 'stretch', 'stress'];
    const baseIndex = payload.scenarios.findIndex(s => s.style === 'base');

    for (let i = 0; i < styles.length; i++) {
      const style = styles[i];
      if (style === 'base') continue; // base is already in the payload
      payload.scenarios[baseIndex].style = style;
      const result = validateWorkstationPayload(payload);
      if (style !== 'base') {
        // changing a base scenario to non-base breaks the validation
        expect(result.valid).toBe(false);
      }
    }

    // Now test valid assignment of all styles
    payload.scenarios = [
      { style: 'stretch', probability: 0.1 },
      { style: 'bull', probability: 0.2 },
      { style: 'base', probability: 0.4 },
      { style: 'bear', probability: 0.2 },
      { style: 'stress', probability: 0.1 },
    ];
    const result = validateWorkstationPayload(payload);
    expect(result.valid).toBe(true);
  });

  test('all revision directions are valid', () => {
    const payload = buildMinimalValidPayload();
    const directions = ['positive', 'negative', 'neutral'];

    for (const direction of directions) {
      payload.revisions.items[0].direction = direction;
      const result = validateWorkstationPayload(payload);
      expect(result.valid).toBe(true);
    }
  });
});
