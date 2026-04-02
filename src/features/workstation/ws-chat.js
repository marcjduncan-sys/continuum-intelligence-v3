/**
 * Workstation Section Renderer: Research Discussion (Chat Panel)
 * Pure function. No DOM. No state imports. Returns an HTML string.
 *
 * Renders a static snapshot of the chat_seed data as the right-column
 * chat panel. Interactive tab filtering is wired up post-render by the
 * page module; this renderer emits the correct structure and data attributes.
 */

import { sanitiseInlineHtml } from './ws-computed.js';

/**
 * Escape plain text for safe use in HTML text nodes and attributes.
 *
 * @param {string|null|undefined} val
 * @returns {string}
 */
function escapeText(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the stats bar (3 key stats above the filter tabs).
 *
 * @param {Array<{label: string, value: string}>} stats
 * @returns {string}
 */
function renderStatsBar(stats) {
  if (!Array.isArray(stats) || stats.length === 0) return '';

  const statsHtml = stats.map(stat =>
    '<div class="ws-chat__stat">' +
      '<span class="ws-chat__stat-label">' + escapeText(stat.label) + '</span>' +
      '<span class="ws-chat__stat-value">' + escapeText(stat.value) + '</span>' +
    '</div>'
  ).join('');

  return '<div class="ws-chat__stats">' + statsHtml + '</div>';
}

/**
 * Derive unique thread labels from messages in order of first appearance.
 *
 * @param {Array<{thread_label: string}>} messages
 * @returns {string[]}
 */
function deriveUniqueThreadLabels(messages) {
  const seen = new Set();
  const labels = [];
  for (const msg of messages) {
    const label = msg.thread_label;
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/**
 * Render the thread filter tabs.
 *
 * @param {string[]} threadLabels - Unique thread labels in order of first appearance.
 * @returns {string}
 */
function renderFilterTabs(threadLabels) {
  const allTab = '<button class="ws-chat__filter ws-chat__filter--active" data-thread="all">All</button>';

  const labelTabs = threadLabels.map(label =>
    '<button class="ws-chat__filter" data-thread="' + escapeText(label) + '">' +
      escapeText(label) +
    '</button>'
  ).join('');

  return '<div class="ws-chat__filters">' + allTab + labelTabs + '</div>';
}

/**
 * Render an optional thread_box instruction block.
 *
 * @param {{ title: string, instruction: string }|null|undefined} threadBox
 * @returns {string}
 */
function renderThreadBox(threadBox) {
  if (!threadBox) return '';

  return (
    '<div class="ws-chat-msg__thread-box">' +
      '<div class="ws-chat-msg__thread-box-title">' + escapeText(threadBox.title) + '</div>' +
      '<div class="ws-chat-msg__thread-box-instruction">' + sanitiseInlineHtml(threadBox.instruction) + '</div>' +
    '</div>'
  );
}

/**
 * Render a single chat message.
 *
 * @param {{ role: string, timestamp: string, tag: {text: string, colour: string}, thread_label: string, body: string, thread_box?: object }} msg
 * @returns {string}
 */
function renderMessage(msg) {
  const role = escapeText(msg.role || '');
  const threadLabel = escapeText(msg.thread_label || '');
  const timestamp = escapeText(msg.timestamp || '');
  const tagText = escapeText((msg.tag && msg.tag.text) || '');
  const tagColour = escapeText((msg.tag && msg.tag.colour) || '');
  const bodyHtml = sanitiseInlineHtml(msg.body || '');
  const threadBoxHtml = renderThreadBox(msg.thread_box);

  return (
    '<div class="ws-chat-msg ws-chat-msg--' + role + '" data-thread="' + threadLabel + '">' +
      '<div class="ws-chat-msg__header">' +
        '<span class="ws-chat-msg__role ws-chat-msg__role--' + role + '">' + role + '</span>' +
        '<span class="ws-chat-msg__tag ws-chat-msg__tag--' + tagColour + '">' + tagText + '</span>' +
        '<span class="ws-chat-msg__time">' + timestamp + '</span>' +
      '</div>' +
      '<div class="ws-chat-msg__body">' + bodyHtml + '</div>' +
      threadBoxHtml +
    '</div>'
  );
}

/**
 * Render the suggested question block.
 *
 * @param {string|null|undefined} question
 * @returns {string}
 */
function renderSuggestedQuestion(question) {
  if (!question) return '';

  return (
    '<div class="ws-chat__suggested">' +
      '<p class="ws-chat__suggested-label">Ask about this stock</p>' +
      '<button class="ws-chat__suggested-btn">' + escapeText(question) + '</button>' +
    '</div>'
  );
}

/**
 * Render the Research Discussion chat panel.
 *
 * This is a static render of the chat_seed data. Interactive tab filtering
 * is handled by post-render JS hooks; the renderer emits data-thread
 * attributes on each message for that purpose.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsChat(data) {
  if (!data || !data.chat_seed) {
    return (
      '<aside class="ws-chat" id="ws-chat">' +
        '<div class="ws-chat__header">' +
          '<h3 class="ws-chat__title">Research Discussion</h3>' +
        '</div>' +
        '<p class="ws-chat__empty">Discussion data unavailable.</p>' +
      '</aside>'
    );
  }

  const seed = data.chat_seed;
  const stats = Array.isArray(seed.stats) ? seed.stats : [];
  const messages = Array.isArray(seed.messages) ? seed.messages : [];
  const threadLabels = deriveUniqueThreadLabels(messages);

  const statsHtml = renderStatsBar(stats);
  const filtersHtml = renderFilterTabs(threadLabels);
  const messagesHtml = messages.map(renderMessage).join('');
  const suggestedHtml = renderSuggestedQuestion(seed.suggested_question);

  return (
    '<aside class="ws-chat" id="ws-chat">' +
      '<div class="ws-chat__header">' +
        '<h3 class="ws-chat__title">Research Discussion</h3>' +
      '</div>' +
      statsHtml +
      filtersHtml +
      '<div class="ws-chat__messages">' +
        messagesHtml +
      '</div>' +
      suggestedHtml +
    '</aside>'
  );
}
