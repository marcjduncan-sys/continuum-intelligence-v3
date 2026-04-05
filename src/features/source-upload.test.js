// @vitest-environment jsdom
import { renderSourceUploadZone, validateFile } from './source-upload.js';

describe('source-upload', function() {

  describe('renderSourceUploadZone', function() {
    it('returns HTML with correct ticker in IDs', function() {
      const html = renderSourceUploadZone('ASB');
      expect(html).toContain('id="src-upload-asb"');
      expect(html).toContain('src-upload-zone');
    });

    it('contains all four state containers', function() {
      const html = renderSourceUploadZone('WDS');
      expect(html).toContain('src-upload-idle');
      expect(html).toContain('src-upload-form');
      expect(html).toContain('src-upload-progress');
      expect(html).toContain('src-upload-error');
    });

    it('contains file input with correct accept attribute', function() {
      const html = renderSourceUploadZone('CBA');
      expect(html).toContain('accept=".pdf,.docx,.txt,.md"');
    });

    it('contains source type dropdown options', function() {
      const html = renderSourceUploadZone('BHP');
      expect(html).toContain('value="broker"');
      expect(html).toContain('value="internal"');
      expect(html).toContain('value="other"');
    });
  });

  describe('validateFile', function() {
    it('rejects null file', function() {
      const result = validateFile(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No file');
    });

    it('rejects files over 10MB', function() {
      const file = { name: 'big.pdf', size: 11 * 1024 * 1024 };
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10MB');
    });

    it('rejects unsupported extensions', function() {
      const file = { name: 'data.xlsx', size: 1000 };
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.xlsx');
    });

    it('accepts .pdf files under 10MB', function() {
      const file = { name: 'research.pdf', size: 5 * 1024 * 1024 };
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBe('');
    });

    it('accepts .docx files', function() {
      const file = { name: 'notes.docx', size: 2000 };
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts .txt files', function() {
      const file = { name: 'notes.txt', size: 500 };
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts .md files', function() {
      const file = { name: 'readme.md', size: 300 };
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('rejects files with no extension', function() {
      const file = { name: 'noext', size: 500 };
      const result = validateFile(file);
      expect(result.valid).toBe(false);
    });
  });
});
