// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWsChat } from './ws-chat.js';
import bhpFixture from '../../../data/workstation/BHP.json';

// ============================================================================
// renderWsChat -- guard clauses
// ============================================================================

describe('renderWsChat -- guard clauses', () => {
  it('returns fallback aside element when data is null', () => {
    const html = renderWsChat(null);
    expect(html).toContain('class="ws-chat"');
    expect(html).toContain('id="ws-chat"');
    expect(html).toContain('ws-chat__empty');
  });

  it('returns fallback aside element when data is undefined', () => {
    const html = renderWsChat(undefined);
    expect(html).toContain('ws-chat__empty');
  });

  it('returns fallback aside element when chat_seed property is missing', () => {
    const html = renderWsChat({ identity: { ticker: 'XYZ' } });
    expect(html).toContain('ws-chat__empty');
  });

  it('fallback still includes Research Discussion title', () => {
    const html = renderWsChat(null);
    expect(html).toContain('Research Discussion');
  });
});

// ============================================================================
// renderWsChat -- structure
// ============================================================================

describe('renderWsChat -- structure', () => {
  it('renders an aside element with class ws-chat and id ws-chat', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('<aside class="ws-chat" id="ws-chat">');
  });

  it('renders the Research Discussion heading inside ws-chat__header', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat__header');
    expect(html).toContain('ws-chat__title');
    expect(html).toContain('Research Discussion');
  });

  it('renders ws-chat__messages container', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('class="ws-chat__messages"');
  });

  it('renders ws-chat__suggested block', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat__suggested');
    expect(html).toContain('Ask about this stock');
  });
});

// ============================================================================
// renderWsChat -- stats bar
// ============================================================================

describe('renderWsChat -- stats bar', () => {
  it('renders ws-chat__stats container', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('class="ws-chat__stats"');
  });

  it('renders all 3 stats from BHP fixture', () => {
    const html = renderWsChat(bhpFixture);
    const statCount = (html.match(/class="ws-chat__stat"/g) || []).length;
    expect(statCount).toBe(3);
  });

  it('renders Accumulate stat value', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('Accumulate');
  });

  it('renders Current posture stat label', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('Current posture');
  });

  it('renders all 3 stat labels from BHP fixture', () => {
    const html = renderWsChat(bhpFixture);
    bhpFixture.chat_seed.stats.forEach(stat => {
      expect(html).toContain(escapeForTest(stat.label));
      expect(html).toContain(escapeForTest(stat.value));
    });
  });

  it('skips stats bar when stats array is empty', () => {
    const data = { chat_seed: { stats: [], messages: [], suggested_question: '' } };
    const html = renderWsChat(data);
    expect(html).not.toContain('ws-chat__stats');
  });
});

// ============================================================================
// renderWsChat -- filter tabs
// ============================================================================

describe('renderWsChat -- filter tabs', () => {
  it('renders ws-chat__filters container', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('class="ws-chat__filters"');
  });

  it('renders All tab as first filter with data-thread="all"', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('data-thread="all"');
    expect(html).toContain('ws-chat__filter--active');
  });

  it('All tab has active modifier class', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat__filter ws-chat__filter--active');
  });

  it('renders unique thread labels as filter tabs for BHP fixture', () => {
    const html = renderWsChat(bhpFixture);
    // BHP has 6 messages. Derive unique thread_labels in order:
    // "Copper mix shift", "Risk budget", "China stimulus", "Framework", "De-risk condition", "Final view"
    const expectedLabels = [
      'Copper mix shift',
      'Risk budget',
      'China stimulus',
      'Framework',
      'De-risk condition',
      'Final view'
    ];
    expectedLabels.forEach(label => {
      expect(html).toContain('data-thread="' + label + '"');
    });
  });

  it('does not render duplicate thread label tabs', () => {
    // Both messages share the same thread_label
    const data = {
      chat_seed: {
        stats: [],
        messages: [
          { role: 'analyst', timestamp: '09:00', tag: { text: 'T', colour: 'blue' }, thread_label: 'Theme A', body: 'First.' },
          { role: 'pm', timestamp: '09:05', tag: { text: 'T', colour: 'amber' }, thread_label: 'Theme A', body: 'Second.' }
        ],
        suggested_question: ''
      }
    };
    const html = renderWsChat(data);
    // "Theme A" should appear as a tab button only once (plus as data-thread on messages)
    const tabMatches = html.match(/data-thread="Theme A"/g) || [];
    // One occurrence on the filter tab, two occurrences on the messages
    expect(tabMatches.length).toBe(3);
  });
});

// ============================================================================
// renderWsChat -- messages
// ============================================================================

describe('renderWsChat -- messages', () => {
  it('renders all 6 messages from BHP fixture', () => {
    const html = renderWsChat(bhpFixture);
    const msgCount = (html.match(/class="ws-chat-msg /g) || []).length;
    expect(msgCount).toBe(6);
  });

  it('renders analyst role class on analyst messages', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat-msg--analyst');
  });

  it('renders pm role class on PM messages', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat-msg--pm');
  });

  it('renders strategist role class on strategist messages', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat-msg--strategist');
  });

  it('renders role label in ws-chat-msg__role span', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat-msg__role--analyst');
    expect(html).toContain('ws-chat-msg__role--pm');
  });

  it('sets data-thread attribute on each message', () => {
    const html = renderWsChat(bhpFixture);
    // Each message should carry a data-thread attribute
    bhpFixture.chat_seed.messages.forEach(msg => {
      expect(html).toContain('data-thread="' + msg.thread_label + '"');
    });
  });

  it('renders tag colour modifier class on message tag span', () => {
    const html = renderWsChat(bhpFixture);
    // First message has tag colour "blue"
    expect(html).toContain('ws-chat-msg__tag--blue');
    // Second message has tag colour "amber"
    expect(html).toContain('ws-chat-msg__tag--amber');
  });

  it('renders timestamp in ws-chat-msg__time span', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat-msg__time');
    expect(html).toContain('09:14');
  });

  it('renders message body via sanitiseInlineHtml (strong tags preserved)', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat-msg__body');
    expect(html).toContain('<strong>');
    expect(html).toContain('</strong>');
  });

  it('strips script tags from message body', () => {
    const data = {
      chat_seed: {
        stats: [],
        messages: [
          {
            role: 'analyst',
            timestamp: '09:00',
            tag: { text: 'T', colour: 'blue' },
            thread_label: 'Theme',
            body: 'Clean text. <script>evil()</script> More text.'
          }
        ],
        suggested_question: ''
      }
    };
    const html = renderWsChat(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('evil()');
  });

  it('renders thread_box for PM message that has one', () => {
    const html = renderWsChat(bhpFixture);
    // Second BHP message (PM, 09:21) has a thread_box
    expect(html).toContain('ws-chat-msg__thread-box');
    expect(html).toContain('ws-chat-msg__thread-box-title');
    expect(html).toContain('PM instruction');
    expect(html).toContain('ws-chat-msg__thread-box-instruction');
    expect(html).toContain('Increase only if China hard data confirms demand');
  });

  it('does not render thread_box when message has no thread_box', () => {
    const data = {
      chat_seed: {
        stats: [],
        messages: [
          {
            role: 'analyst',
            timestamp: '09:00',
            tag: { text: 'T', colour: 'blue' },
            thread_label: 'Theme',
            body: 'Some text.'
          }
        ],
        suggested_question: ''
      }
    };
    const html = renderWsChat(data);
    expect(html).not.toContain('ws-chat-msg__thread-box');
  });

  it('renders empty messages container when messages array is empty', () => {
    const data = { chat_seed: { stats: [], messages: [], suggested_question: '' } };
    const html = renderWsChat(data);
    expect(html).toContain('ws-chat__messages');
    expect(html).not.toContain('ws-chat-msg');
  });
});

// ============================================================================
// renderWsChat -- suggested question
// ============================================================================

describe('renderWsChat -- suggested question', () => {
  it('renders suggested question text in button', () => {
    const html = renderWsChat(bhpFixture);
    expect(html).toContain('ws-chat__suggested-btn');
    expect(html).toContain(bhpFixture.chat_seed.suggested_question);
  });

  it('does not render suggested block when suggested_question is absent', () => {
    const data = { chat_seed: { stats: [], messages: [] } };
    const html = renderWsChat(data);
    expect(html).not.toContain('ws-chat__suggested');
  });

  it('does not render suggested block when suggested_question is empty string', () => {
    const data = { chat_seed: { stats: [], messages: [], suggested_question: '' } };
    const html = renderWsChat(data);
    expect(html).not.toContain('ws-chat__suggested');
  });
});

// ============================================================================
// renderWsChat -- XSS safety
// ============================================================================

describe('renderWsChat -- XSS safety', () => {
  it('escapes stat label to prevent XSS', () => {
    const data = {
      chat_seed: {
        stats: [{ label: '<img onerror="x">', value: 'safe' }],
        messages: [],
        suggested_question: ''
      }
    };
    const html = renderWsChat(data);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes thread_label in data attribute to prevent injection', () => {
    const data = {
      chat_seed: {
        stats: [],
        messages: [
          {
            role: 'analyst',
            timestamp: '09:00',
            tag: { text: 'T', colour: 'blue' },
            thread_label: '" onload="evil()',
            body: 'Text.'
          }
        ],
        suggested_question: ''
      }
    };
    const html = renderWsChat(data);
    expect(html).not.toContain('onload="evil()');
  });
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Minimal escaping to build expected strings matching escapeText output.
 * Only used in test assertions, not in the module under test.
 *
 * @param {string} val
 * @returns {string}
 */
function escapeForTest(val) {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
