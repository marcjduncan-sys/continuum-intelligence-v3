import { renderHealthBanner } from './home-health-banner.js';

describe('renderHealthBanner', () => {
  it('returns empty string when completeness >= 95%', () => {
    const bs = { succeeded: 38, totalTickers: 40, status: 'complete' };
    expect(renderHealthBanner(bs, 40)).toBe('');
  });

  it('returns empty string when completeness is exactly 95%', () => {
    const bs = { succeeded: 19, totalTickers: 20, status: 'complete' };
    expect(renderHealthBanner(bs, 20)).toBe('');
  });

  it('renders amber warning banner at 90% completeness', () => {
    const bs = { succeeded: 36, totalTickers: 40, status: 'complete' };
    const html = renderHealthBanner(bs, 40);
    expect(html).toContain('health-banner--warning');
    expect(html).not.toContain('health-banner--critical');
  });

  it('renders critical banner at 80% completeness', () => {
    const bs = { succeeded: 32, totalTickers: 40, status: 'complete' };
    const html = renderHealthBanner(bs, 40);
    expect(html).toContain('health-banner--critical');
  });

  it('shows refreshed count in banner message', () => {
    const bs = { succeeded: 34, totalTickers: 40, status: 'complete' };
    const html = renderHealthBanner(bs, 40);
    expect(html).toContain('34 / 40 refreshed');
  });

  it('includes show affected names button', () => {
    const bs = { succeeded: 30, totalTickers: 40, status: 'complete' };
    const html = renderHealthBanner(bs, 40);
    expect(html).toContain('Show affected names');
    expect(html).toContain('data-health-action="show-failed"');
  });

  it('returns empty string when batch status is unknown', () => {
    const bs = { succeeded: 0, totalTickers: 40, status: 'unknown' };
    expect(renderHealthBanner(bs, 40)).toBe('');
  });

  it('returns empty string when batchStatus is null', () => {
    expect(renderHealthBanner(null, 40)).toBe('');
  });

  it('returns empty string when totalTickers is 0', () => {
    const bs = { succeeded: 0, totalTickers: 0, status: 'complete' };
    expect(renderHealthBanner(bs, 0)).toBe('');
  });
});
