// src/lib/api-config.js
//
// Centralised API base URL for all src/ modules.
// Single source of truth for production URL and environment detection.
// During migration, only this file changes (plus non-module files
// that cannot import ES modules).

const PRODUCTION_URL = 'https://api.continuumintelligence.ai';

/**
 * Resolve the API base URL given hostname, protocol, and optional override.
 * Exported for testing; consumers should use API_BASE directly.
 */
export function _resolveApiBase(hostname, protocol, chatApiUrlOverride) {
  if (chatApiUrlOverride) return chatApiUrlOverride;
  if (protocol === 'file:') return '';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') return '';
  return PRODUCTION_URL;
}

export const API_BASE = _resolveApiBase(
  window.location.hostname,
  window.location.protocol,
  window.CHAT_API_URL
);
