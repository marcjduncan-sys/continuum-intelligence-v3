// Report footer, PDF download, and scroll spy

import { formatDateAEST } from '../../lib/format.js';

export function renderReportFooter(data) {
  const footer = data.footer || {};
  return '<div class="report-footer-section">' +
    '<div class="rf-inner">' +
      '<div class="rf-disclaimer-text">' + (footer.disclaimer || '') + '</div>' +
      '<div class="rf-meta-row">' +
        '<div class="rf-brand">Contin<span class="brand-green">uu</span>m Inte<span class="brand-green">ll</span>igence</div>' +
        '<div class="rf-meta-item">ID: ' + (data.reportId || '') + '</div>' +
        '<div class="rf-meta-item">Mode: Narrative Intelligence</div>' +
        '<div class="rf-meta-item">Domains: ' + (footer.domainCount || 0) + '</div>' +
        '<div class="rf-meta-item">Hypotheses: ' + (footer.hypothesesCount || 0) + '</div>' +
        '<div class="rf-meta-item">' + (data.date ? formatDateAEST(data.date) : '') + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function renderPDFDownload(data) {
  const t = data.ticker;
  return '<div class="report-download-section">' +
    '<div class="report-download-inner">' +
      '<div class="report-download-title">Download Research Report</div>' +
      '<div class="report-download-subtitle">' + data.company + ' (' + data.ticker + '.AX) &mdash; ' + formatDateAEST(data.date) + '</div>' +
      '<div class="report-download-buttons">' +
        '<button class="btn-pdf-download institutional" onclick="generatePDFReport(\'' + t + '\', \'institutional\')">' +
          '<span class="btn-pdf-label">Institutional Report <span class="btn-pdf-spinner"></span></span>' +
          '<span class="btn-pdf-sub">Full ACH analysis with evidence matrix</span>' +
        '</button>' +
        '<button class="btn-pdf-download retail" onclick="generatePDFReport(\'' + t + '\', \'retail\')">' +
          '<span class="btn-pdf-label">Investor Briefing <span class="btn-pdf-spinner"></span></span>' +
          '<span class="btn-pdf-sub">2-page briefing: ranges, narrative &amp; analysis</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function setupScrollSpy(pageId) {
  const page = document.getElementById(pageId);
  if (!page) return;
  const navLinks = page.querySelectorAll('.section-nav a');
  const sections = [];
  navLinks.forEach(link => {
    const targetId = link.getAttribute('href');
    if (targetId && targetId.startsWith('#')) {
      const section = document.getElementById(targetId.slice(1));
      if (section) sections.push({ link, section });
    }
  });

  if (sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const match = sections.find(s => s.section === entry.target);
        if (match) match.link.classList.add('active');
      }
    });
  }, {
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  });

  sections.forEach(s => observer.observe(s.section));
}
