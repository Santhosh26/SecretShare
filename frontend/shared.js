// shared.js — Auth state, API helpers, copy-to-clipboard, toast notifications

const API_BASE = '';  // Same origin

// --- Auth State ---

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      return data.user || null;
    }
  } catch {
    // Not logged in or auth endpoint not ready
  }
  return null;
}

function renderNav(user) {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  if (user) {
    nav.innerHTML = `
      <span class="nav__user">${escapeHtml(user.name)}</span>
      <a href="/dashboard" class="nav__link">Dashboard</a>
      <a href="#" class="nav__link" id="logout-link">Sign out</a>
    `;
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        });
        window.location.reload();
      });
    }
  } else {
    nav.innerHTML = `
      <a href="/login" class="nav__link">Sign in</a>
    `;
  }
}

// --- API Helpers ---

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Something went wrong. Please try again.');
  }
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Something went wrong. Please try again.');
  }
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// --- Copy to Clipboard ---

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied!');
    return true;
  } catch {
    // Fallback for HTTP or older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Copied!');
      return true;
    } catch {
      showToast('Failed to copy', true);
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// --- Toast Notifications ---

function showToast(message, isError) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  if (isError) {
    toast.style.borderColor = 'var(--error)';
    toast.style.color = 'var(--error)';
  } else {
    toast.style.borderColor = '';
    toast.style.color = '';
  }
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}

// --- Utility ---

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function generateClientId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return SecretCrypto.base64urlEncode(bytes);
}

// --- Init Nav on Load ---

async function initPage() {
  const user = await checkAuth();
  renderNav(user);
  return user;
}
