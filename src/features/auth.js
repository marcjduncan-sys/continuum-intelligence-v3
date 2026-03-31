/**
 * auth.js -- User identity and authentication
 *
 * Guest mode: device UUID (localStorage) for anonymous trial users.
 * OTP + JWT: email -> 6-digit code -> 30-day JWT.
 *
 * Sets window.CI_AUTH for consumption by chat.js and other features.
 */

import { API_BASE } from '../lib/api-config.js';

// ============================================================
// CONFIG
// ============================================================

const AUTH_API_BASE = API_BASE + '/api/auth';

const GUEST_ID_KEY = 'ci_guest_id';
const TOKEN_KEY    = 'ci_auth_token';

// ============================================================
// GUEST UUID
// ============================================================

function getGuestId() {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
}

// ============================================================
// JWT STORAGE
// ============================================================

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

function getCurrentUser() {
    const token = getToken();
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            clearToken();
            return null;
        }
        return { id: payload.sub, email: payload.email };
    } catch (e) {
        clearToken(); // discard corrupted token rather than leaving it in localStorage
        return null;
    }
}

// ============================================================
// MODAL
// ============================================================

let _modal = null;

function _getOrCreateModal() {
    if (_modal) return _modal;

    _modal = document.createElement('div');
    _modal.id = 'ci-auth-modal';
    _modal.innerHTML = `
        <div class="ci-auth-overlay" id="ci-auth-overlay">
            <div class="ci-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="ci-auth-title">
                <button class="ci-auth-close" id="ci-auth-close" aria-label="Close">&times;</button>
                <h2 class="ci-auth-title" id="ci-auth-title">Save your research history</h2>
                <p class="ci-auth-desc">Enter your email to receive a one-time access code.</p>
                <div id="ci-auth-step-email" class="ci-auth-step">
                    <input type="email" id="ci-auth-email" placeholder="your@email.com" autocomplete="email" />
                    <button class="ci-auth-btn" id="ci-auth-send-btn">Send code</button>
                    <p class="ci-auth-error" id="ci-auth-email-error"></p>
                </div>
                <div id="ci-auth-step-code" class="ci-auth-step" hidden>
                    <p class="ci-auth-hint">Enter the 6-digit code sent to <strong id="ci-auth-email-hint"></strong></p>
                    <input type="text" id="ci-auth-code" placeholder="123456" maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
                    <button class="ci-auth-btn" id="ci-auth-verify-btn">Verify</button>
                    <p class="ci-auth-error" id="ci-auth-code-error"></p>
                    <button class="ci-auth-link" id="ci-auth-back-btn">Use a different email</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(_modal);

    const style = document.createElement('style');
    style.textContent = `
        #ci-auth-modal { position: fixed; inset: 0; z-index: 9999; }
        .ci-auth-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; }
        .ci-auth-dialog { background: var(--bg-card, #1a1a2e); border: 1px solid var(--border, #2e2e4a); border-radius: 12px; padding: 2rem; width: min(420px, 90vw); position: relative; color: var(--text, #e0e0f0); }
        .ci-auth-close { position: absolute; top: 0.75rem; right: 0.75rem; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: inherit; line-height: 1; }
        .ci-auth-title { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 600; }
        .ci-auth-desc, .ci-auth-hint { margin: 0 0 1rem; font-size: 0.9rem; opacity: 0.7; }
        #ci-auth-step-email input, #ci-auth-step-code input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.75rem; background: var(--bg, #0f0f1a); border: 1px solid var(--border, #2e2e4a); border-radius: 6px; color: inherit; font-size: 1rem; margin-bottom: 0.75rem; }
        .ci-auth-btn { width: 100%; padding: 0.65rem; background: var(--accent, #4f6ef7); border: none; border-radius: 6px; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
        .ci-auth-btn:disabled { opacity: 0.5; cursor: default; }
        .ci-auth-error { color: #e55; font-size: 0.85rem; margin: 0.5rem 0 0; min-height: 1.2em; }
        .ci-auth-link { background: none; border: none; color: var(--accent, #4f6ef7); cursor: pointer; font-size: 0.85rem; padding: 0; margin-top: 0.75rem; text-decoration: underline; }
    `;
    document.head.appendChild(style);

    document.getElementById('ci-auth-close').addEventListener('click', hideAuthModal);
    document.getElementById('ci-auth-overlay').addEventListener('click', function(e) {
        if (e.target === this) hideAuthModal();
    });
    document.getElementById('ci-auth-send-btn').addEventListener('click', _handleSendCode);
    document.getElementById('ci-auth-email').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') _handleSendCode();
    });
    document.getElementById('ci-auth-verify-btn').addEventListener('click', _handleVerifyCode);
    document.getElementById('ci-auth-code').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') _handleVerifyCode();
    });
    document.getElementById('ci-auth-back-btn').addEventListener('click', function() {
        document.getElementById('ci-auth-step-code').hidden = true;
        document.getElementById('ci-auth-step-email').hidden = false;
        document.getElementById('ci-auth-email-error').textContent = '';
    });

    return _modal;
}

async function _handleSendCode() {
    const email = (document.getElementById('ci-auth-email').value || '').trim();
    const errorEl = document.getElementById('ci-auth-email-error');
    const btn = document.getElementById('ci-auth-send-btn');

    if (!email || !email.includes('@')) {
        errorEl.textContent = 'Please enter a valid email address.';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';
    errorEl.textContent = '';

    try {
        const res = await fetch(AUTH_API_BASE + '/request-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (!res.ok) throw new Error('Server error');
        document.getElementById('ci-auth-email-hint').textContent = email;
        document.getElementById('ci-auth-step-email').hidden = true;
        document.getElementById('ci-auth-step-code').hidden = false;
        document.getElementById('ci-auth-code-error').textContent = '';
        document.getElementById('ci-auth-code').focus();
    } catch (e) {
        errorEl.textContent = 'Could not send code. Please try again.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send code';
    }
}

async function _handleVerifyCode() {
    const email = (document.getElementById('ci-auth-email').value || '').trim();
    const code  = (document.getElementById('ci-auth-code').value || '').trim();
    const errorEl = document.getElementById('ci-auth-code-error');
    const btn = document.getElementById('ci-auth-verify-btn');

    if (code.length !== 6) {
        errorEl.textContent = 'Please enter the 6-digit code.';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Verifying...';
    errorEl.textContent = '';

    try {
        const res = await fetch(AUTH_API_BASE + '/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code, guest_id: getGuestId() })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Invalid code');
        }
        const data = await res.json();
        setToken(data.token);
        console.log('[Auth] Logged in as', data.user.email);
        hideAuthModal();
        window.dispatchEvent(new CustomEvent('ci:auth:login', { detail: data.user }));
    } catch (e) {
        errorEl.textContent = e.message || 'Verification failed. Please try again.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify';
    }
}

export function showAuthModal() {
    const modal = _getOrCreateModal();
    modal.style.display = '';
    document.getElementById('ci-auth-step-email').hidden = false;
    document.getElementById('ci-auth-step-code').hidden = true;
    document.getElementById('ci-auth-email-error').textContent = '';
    document.getElementById('ci-auth-code-error').textContent = '';
    const emailInput = document.getElementById('ci-auth-email');
    if (emailInput) emailInput.focus();
}

export function hideAuthModal() {
    if (_modal) _modal.style.display = 'none';
}

// ============================================================
// INIT
// ============================================================

function _bindSignInBtn() {
    const btn = document.getElementById('ciSignInBtn');
    if (!btn) return;
    const user = getCurrentUser();
    if (user) {
        btn.textContent = user.email.split('@')[0];
        btn.classList.add('authenticated');
    }
    btn.addEventListener('click', showAuthModal);
}

export function initAuth() {
    // Inject sign-in button styles immediately so the nav button is styled before
    // the auth modal is ever opened (modal styles are injected lazily in _getOrCreateModal).
    const btnStyle = document.createElement('style');
    btnStyle.textContent = '.ci-signin-btn { background: none; border: 1px solid var(--border, #2e2e4a); border-radius: 6px; color: var(--text, #e0e0f0); font-size: 0.8rem; padding: 0.3rem 0.7rem; cursor: pointer; white-space: nowrap; } .ci-signin-btn:hover { background: var(--bg-card, #1a1a2e); } .ci-signin-btn.authenticated { color: var(--accent, #4f6ef7); }';
    document.head.appendChild(btnStyle);

    getGuestId(); // mint UUID on first visit

    window.addEventListener('ci:auth:login', function(e) {
        const btn = document.getElementById('ciSignInBtn');
        if (btn) {
            btn.textContent = e.detail.email.split('@')[0];
            btn.classList.add('authenticated');
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bindSignInBtn);
    } else {
        _bindSignInBtn();
    }

    window.CI_AUTH = {
        getGuestId,
        getToken,
        setToken,
        clearToken,
        getCurrentUser,
        showAuthModal,
        hideAuthModal,
    };

    console.log('[Auth] Initialised, guest:', getGuestId(), '| authenticated:', !!getCurrentUser());
}
