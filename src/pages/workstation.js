// Workstation page module
// Handles routing, data loading, rendering, and post-render hooks for the
// #workstation-{TICKER} route.

import { renderWorkstation } from '../features/workstation/workstation.js';
import { loadWorkstationData } from '../data/loader.js';
import { getWorkstation } from '../lib/state.js';

/**
 * Initialise workstation subsystem.
 * Called by boot system after DataLoader completes.
 * Currently a no-op; live price patching is set up per-navigation in
 * renderWorkstationPage(). Reserved for future global listeners.
 */
export function initWorkstationPage() {
  // No-op: workstation subsystem registered for boot sequencing.
  // Per-ticker initialisation happens in renderWorkstationPage().
}

/**
 * Render the workstation page for a given ticker into its container.
 * Called by the router on #workstation-{TICKER} navigation.
 *
 * @param {string} ticker
 * @param {HTMLElement} container
 * @param {function} onRendered - Called after successful render
 */
export function renderWorkstationPage(ticker, container, onRendered) {
  if (!container) return;

  // Show loading spinner
  container.innerHTML =
    '<div class="ws-loading">Loading workstation for ' + ticker + '...</div>';

  // If already in state, render immediately
  const existing = getWorkstation(ticker);
  if (existing) {
    container.innerHTML = renderWorkstation(existing);
    initWorkstationHooks(container, ticker);
    if (onRendered) onRendered();
    return;
  }

  // Load from file
  loadWorkstationData(ticker, function(data) {
    if (!data) {
      container.innerHTML =
        '<div class="ws-error">No workstation data available for ' + ticker +
        '. <a href="#home" style="color:var(--blue)">Return home</a></div>';
      return;
    }
    container.innerHTML = renderWorkstation(data);
    initWorkstationHooks(container, ticker);
    if (onRendered) onRendered();
  });
}

/**
 * Set up post-render interactive hooks on a rendered workstation page.
 * Called after innerHTML is set. All hooks use event delegation.
 *
 * @param {HTMLElement} container
 * @param {string} ticker
 */
export function initWorkstationHooks(container, ticker) {
  if (!container) return;

  // Deep research expand/collapse
  const toggleBtn = container.querySelector('[data-toggle="deep-research"]');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      const overflow = container.querySelector('.ws-deep-research__overflow');
      if (!overflow) return;
      const isCollapsed = overflow.dataset.collapsed === 'true';
      overflow.dataset.collapsed = isCollapsed ? 'false' : 'true';
      toggleBtn.textContent = isCollapsed ? 'Show less' : 'Show more';
    });
  }

  // Chat thread filter tabs
  container.addEventListener('click', function(e) {
    const filterBtn = e.target.closest('.ws-chat__filter');
    if (!filterBtn) return;

    // Update active tab
    container.querySelectorAll('.ws-chat__filter').forEach(function(btn) {
      btn.classList.remove('ws-chat__filter--active');
    });
    filterBtn.classList.add('ws-chat__filter--active');

    // Filter messages
    const thread = filterBtn.dataset.thread;
    container.querySelectorAll('.ws-chat-msg').forEach(function(msg) {
      if (thread === 'all' || msg.dataset.thread === thread) {
        msg.style.display = '';
      } else {
        msg.style.display = 'none';
      }
    });
  });

  // Scroll spy: highlight active section in subnav
  const sections = container.querySelectorAll('.ws-section');
  const navLinks = container.querySelectorAll('.ws-subnav__link');
  if (sections.length > 0 && navLinks.length > 0) {
    const observer = new IntersectionObserver(
      function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach(function(link) {
              link.classList.toggle('active', link.getAttribute('href') === '#' + id);
            });
          }
        });
      },
      { threshold: 0.15 }
    );
    sections.forEach(function(section) { observer.observe(section); });
  }
}
