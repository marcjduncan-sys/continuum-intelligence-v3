// source-upload.js -- Upload zone for external research documents
// Stream C: Research Intelligence Graph (BEAD-006)

import { API_BASE } from '../lib/api-config.js';
import { formatPrice } from '../lib/format.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

const DOC_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" width="32" height="32">' +
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
  '<polyline points="14 2 14 8 20 8"/>' +
  '<line x1="16" y1="13" x2="8" y2="13"/>' +
  '<line x1="16" y1="17" x2="8" y2="17"/>' +
  '<polyline points="10 9 9 9 8 9"/>' +
  '</svg>';

const DELETE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
  '</svg>';

/**
 * Validate a File object before upload.
 * @param {File} file
 * @returns {{ valid: boolean, error: string }}
 */
export function validateFile(file) {
  if (!file) return { valid: false, error: 'No file selected.' };

  const name = file.name || '';
  const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (ALLOWED_EXTENSIONS.indexOf(ext) === -1) {
    return { valid: false, error: 'Unsupported file type: \'' + ext + '\'. Supported formats: PDF, DOCX, TXT, MD.' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds 10MB limit (' + formatPrice(file.size / (1024 * 1024), 1) + 'MB).' };
  }

  return { valid: true, error: '' };
}

/**
 * Render the upload zone HTML for a ticker.
 * @param {string} ticker
 * @returns {string} HTML string
 */
export function renderSourceUploadZone(ticker) {
  const id = ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    '<div class="src-upload-zone" id="src-upload-' + id + '">' +

      '<div class="src-upload-idle">' +
        '<div class="src-upload-icon">' + DOC_ICON_SVG + '</div>' +
        '<div class="src-upload-text">' +
          '<span class="src-upload-primary">Drop a research document here</span>' +
          '<span class="src-upload-secondary">or <button type="button" class="src-upload-browse">browse files</button></span>' +
          '<span class="src-upload-formats">PDF, DOCX, TXT, or MD (max 10MB)</span>' +
        '</div>' +
        '<input type="file" class="src-upload-input" accept=".pdf,.docx,.txt,.md" style="display:none">' +
      '</div>' +

      '<div class="src-upload-form" style="display:none">' +
        '<div class="src-upload-file-info">' +
          '<span class="src-upload-file-name"></span>' +
          '<button type="button" class="src-upload-file-remove" title="Remove file">' + DELETE_ICON_SVG + '</button>' +
        '</div>' +
        '<label class="src-upload-label">Source name' +
          '<input type="text" class="src-upload-source-name" placeholder="e.g. Macquarie, Goldman Sachs, My Notes">' +
        '</label>' +
        '<label class="src-upload-label">Type' +
          '<select class="src-upload-source-type">' +
            '<option value="broker">Broker research</option>' +
            '<option value="internal">Internal notes</option>' +
            '<option value="other">Other</option>' +
          '</select>' +
        '</label>' +
        '<label class="src-upload-label">Research date (optional)' +
          '<input type="date" class="src-upload-date">' +
        '</label>' +
        '<div class="src-upload-actions">' +
          '<button type="button" class="src-upload-cancel">Cancel</button>' +
          '<button type="button" class="src-upload-submit" disabled>Upload &amp; Analyse</button>' +
        '</div>' +
      '</div>' +

      '<div class="src-upload-progress" style="display:none">' +
        '<div class="src-upload-progress-bar"><div class="src-upload-progress-fill"></div></div>' +
        '<div class="src-upload-status">Uploading...</div>' +
      '</div>' +

      '<div class="src-upload-error" style="display:none">' +
        '<div class="src-upload-error-msg"></div>' +
        '<button type="button" class="src-upload-retry">Try again</button>' +
      '</div>' +

    '</div>'
  );
}

/**
 * Build auth headers for API calls (mirrors chat.js pattern).
 * @returns {{ headers: object, guestId: string|null }}
 */
function buildAuthHeaders() {
  const headers = { 'X-API-Key': window.CI_API_KEY || '' };
  const token = window.CI_AUTH && window.CI_AUTH.getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let guestId = null;
  if (!token && window.CI_AUTH && window.CI_AUTH.getGuestId) {
    guestId = window.CI_AUTH.getGuestId();
  }
  return { headers, guestId };
}

/**
 * Initialise event listeners on the upload zone.
 * Call AFTER the HTML has been inserted into the DOM.
 * @param {string} ticker
 * @param {function} onUploadComplete - Callback with (sourceData) on success
 */
export function initSourceUpload(ticker, onUploadComplete) {
  const id = ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
  const zone = document.getElementById('src-upload-' + id);
  if (!zone) return;

  const idleEl = zone.querySelector('.src-upload-idle');
  const formEl = zone.querySelector('.src-upload-form');
  const progressEl = zone.querySelector('.src-upload-progress');
  const errorEl = zone.querySelector('.src-upload-error');
  const fileInput = zone.querySelector('.src-upload-input');
  const browseBtn = zone.querySelector('.src-upload-browse');
  const fileNameEl = zone.querySelector('.src-upload-file-name');
  const fileRemoveBtn = zone.querySelector('.src-upload-file-remove');
  const sourceNameInput = zone.querySelector('.src-upload-source-name');
  const sourceTypeSelect = zone.querySelector('.src-upload-source-type');
  const dateInput = zone.querySelector('.src-upload-date');
  const cancelBtn = zone.querySelector('.src-upload-cancel');
  const submitBtn = zone.querySelector('.src-upload-submit');
  const retryBtn = zone.querySelector('.src-upload-retry');
  const progressFill = zone.querySelector('.src-upload-progress-fill');
  const statusText = zone.querySelector('.src-upload-status');
  const errorMsg = zone.querySelector('.src-upload-error-msg');

  let selectedFile = null;

  function showState(state) {
    idleEl.style.display = state === 'idle' ? '' : 'none';
    formEl.style.display = state === 'form' ? '' : 'none';
    progressEl.style.display = state === 'progress' ? '' : 'none';
    errorEl.style.display = state === 'error' ? '' : 'none';
    if (state === 'idle') {
      zone.classList.remove('src-upload-zone--dragover');
    }
  }

  function resetToIdle() {
    selectedFile = null;
    sourceNameInput.value = '';
    sourceTypeSelect.selectedIndex = 0;
    dateInput.value = '';
    submitBtn.disabled = true;
    fileInput.value = '';
    showState('idle');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    showState('error');
  }

  function handleFileSelect(file) {
    const result = validateFile(file);
    if (!result.valid) {
      showError(result.error);
      return;
    }
    selectedFile = file;
    fileNameEl.textContent = file.name;
    showState('form');
    sourceNameInput.focus();
  }

  // Source name input enables/disables submit
  sourceNameInput.addEventListener('input', function() {
    submitBtn.disabled = !sourceNameInput.value.trim();
  });

  // Browse button
  browseBtn.addEventListener('click', function(e) {
    e.preventDefault();
    fileInput.click();
  });

  // File input change
  fileInput.addEventListener('change', function() {
    if (fileInput.files && fileInput.files[0]) {
      handleFileSelect(fileInput.files[0]);
    }
  });

  // Drag-drop
  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('src-upload-zone--dragover');
  });

  zone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('src-upload-zone--dragover');
  });

  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('src-upload-zone--dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  // File remove
  fileRemoveBtn.addEventListener('click', function() { resetToIdle(); });

  // Cancel
  cancelBtn.addEventListener('click', function() { resetToIdle(); });

  // Retry
  retryBtn.addEventListener('click', function() { resetToIdle(); });

  // Submit
  submitBtn.addEventListener('click', function() {
    if (!selectedFile || !sourceNameInput.value.trim()) return;

    showState('progress');
    progressFill.style.width = '0%';
    statusText.textContent = 'Uploading...';

    // Simulate progress stages since the API is a single request
    const stages = [
      { pct: '30%', text: 'Uploading...', delay: 0 },
      { pct: '55%', text: 'Extracting text...', delay: 2000 },
      { pct: '80%', text: 'Analysing against hypotheses...', delay: 5000 }
    ];
    const timers = [];
    stages.forEach(function(stage) {
      timers.push(setTimeout(function() {
        progressFill.style.width = stage.pct;
        statusText.textContent = stage.text;
      }, stage.delay));
    });

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('ticker', ticker);
    formData.append('source_name', sourceNameInput.value.trim());
    formData.append('source_type', sourceTypeSelect.value);
    if (dateInput.value) formData.append('document_date', dateInput.value);

    const auth = buildAuthHeaders();
    // Do NOT set Content-Type -- browser sets multipart boundary automatically
    const fetchHeaders = {};
    if (auth.headers['X-API-Key']) fetchHeaders['X-API-Key'] = auth.headers['X-API-Key'];
    if (auth.headers['Authorization']) fetchHeaders['Authorization'] = auth.headers['Authorization'];
    if (auth.guestId) formData.append('guest_id', auth.guestId);

    fetch(API_BASE + '/api/sources/upload', {
      method: 'POST',
      headers: fetchHeaders,
      body: formData
    })
    .then(function(res) {
      if (!res.ok) {
        return res.json().then(function(body) {
          throw new Error(body.detail || 'Upload failed (HTTP ' + res.status + ')');
        }).catch(function(parseErr) {
          if (parseErr.message && parseErr.message !== 'Upload failed') throw parseErr;
          throw new Error('Upload failed (HTTP ' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function(data) {
      timers.forEach(clearTimeout);
      progressFill.style.width = '100%';
      statusText.textContent = 'Done';
      setTimeout(function() {
        resetToIdle();
        if (onUploadComplete) onUploadComplete(data);
      }, 600);
    })
    .catch(function(err) {
      timers.forEach(clearTimeout);
      showError(err.message || 'Upload failed. Please try again.');
    });
  });
}