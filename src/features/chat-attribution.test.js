
// Test the source attribution logic extracted from chat.js rendering.
// Since chat.js uses module-scoped state and DOM manipulation, we test
// the attribution logic in isolation.

/**
 * Replicate the attribution logic from chat.js source rendering.
 * @param {object} s - source object with optional source_origin
 * @returns {{ isUserSource: boolean, originLabel: string, cssClass: string }}
 */
function getAttribution(s) {
  const isUserSource = s.source_origin && s.source_origin.indexOf('user') === 0;
  const originLabel = isUserSource
    ? s.source_origin.replace('user:', '').trim() + ' (uploaded)'
    : 'Continuum Research';
  const cssClass = isUserSource ? ' ap-source-user' : ' ap-source-platform';
  return { isUserSource: isUserSource, originLabel: originLabel, cssClass: cssClass };
}

describe('chat source attribution', function() {

  it('platform source renders "Continuum Research" label', function() {
    const attr = getAttribution({ source_origin: 'platform' });
    expect(attr.isUserSource).toBe(false);
    expect(attr.originLabel).toBe('Continuum Research');
  });

  it('user source renders "{name} (uploaded)" label', function() {
    const attr = getAttribution({ source_origin: 'user:Macquarie' });
    expect(attr.isUserSource).toBe(true);
    expect(attr.originLabel).toBe('Macquarie (uploaded)');
  });

  it('source without source_origin (backward compat) renders platform label', function() {
    const attr = getAttribution({});
    expect(attr.isUserSource).toBeFalsy();
    expect(attr.originLabel).toBe('Continuum Research');
  });

  it('source with null source_origin renders platform label', function() {
    const attr = getAttribution({ source_origin: null });
    expect(attr.isUserSource).toBeFalsy();
    expect(attr.originLabel).toBe('Continuum Research');
  });

  it('user source has ap-source-user CSS class', function() {
    const attr = getAttribution({ source_origin: 'user:Goldman Sachs' });
    expect(attr.cssClass).toContain('ap-source-user');
  });

  it('platform source has ap-source-platform CSS class', function() {
    const attr = getAttribution({ source_origin: 'platform' });
    expect(attr.cssClass).toContain('ap-source-platform');
  });

  it('handles user source with spaces in name', function() {
    const attr = getAttribution({ source_origin: 'user:Morgan Stanley' });
    expect(attr.originLabel).toBe('Morgan Stanley (uploaded)');
  });

  it('handles user source with empty name after prefix', function() {
    const attr = getAttribution({ source_origin: 'user:' });
    expect(attr.originLabel).toContain('(uploaded)');
    expect(attr.isUserSource).toBeTruthy();
  });
});
