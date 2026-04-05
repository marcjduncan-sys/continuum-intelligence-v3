// @vitest-environment jsdom

describe('api-config', () => {
  afterEach(() => {
    delete window.CHAT_API_URL;
    vi.resetModules();
  });

  it('returns production URL when hostname is not localhost', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('continuumintelligence.ai', 'https:')).toBe(
      'https://api.continuumintelligence.ai'
    );
  });

  it('returns empty string for localhost', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('localhost', 'https:')).toBe('');
  });

  it('returns empty string for 127.0.0.1', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('127.0.0.1', 'https:')).toBe('');
  });

  it('returns empty string for file:// protocol', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('', 'file:')).toBe('');
  });

  it('returns production URL for github.io', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('marcjduncan-sys.github.io', 'https:')).toBe(
      'https://api.continuumintelligence.ai'
    );
  });

  it('returns production URL for pages.dev', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('ci-app.pages.dev', 'https:')).toBe(
      'https://api.continuumintelligence.ai'
    );
  });

  it('respects window.CHAT_API_URL override', async () => {
    const { _resolveApiBase } = await import('./api-config.js');
    expect(_resolveApiBase('localhost', 'https:', 'https://custom-api.example.com')).toBe(
      'https://custom-api.example.com'
    );
  });
});
