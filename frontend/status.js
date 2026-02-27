// status.js — Status page logic

(async function () {
  await initPage();

  const pathMatch = window.location.pathname.match(/^\/status\/([A-Za-z0-9_-]{22})$/);
  if (!pathMatch) {
    showStatus('unknown');
    return;
  }

  const secretId = pathMatch[1];
  const statusLoading = document.getElementById('status-loading');
  const statusDisplay = document.getElementById('status-display');

  try {
    const data = await apiGet(`/api/secrets/${secretId}/status`);
    statusLoading.style.display = 'none';
    statusDisplay.style.display = '';
    renderStatus(data, statusDisplay);
  } catch {
    statusLoading.style.display = 'none';
    statusDisplay.style.display = '';
    showStatus('unknown');
  }

  function renderStatus(data, container) {
    const { status, createdAt, expiresAt, viewedAt, viewerCountry } = data;

    let icon, title, detail, badgeClass;

    switch (status) {
      case 'pending':
        icon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>`;
        title = 'Waiting to be viewed';
        detail = 'Your secret is encrypted and ready. The recipient has not opened it yet.';
        badgeClass = 'badge--pending';
        break;
      case 'viewed':
        icon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8888ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        title = 'Secret has been viewed';
        detail = 'The recipient opened and decrypted your secret. The encrypted data has been permanently destroyed.';
        badgeClass = 'badge--viewed';
        break;
      case 'expired':
        icon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        title = 'Secret expired';
        detail = 'This secret was never viewed and has been automatically deleted.';
        badgeClass = 'badge--expired';
        break;
      default:
        icon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        title = 'Status unavailable';
        detail = 'This secret was not found. It may have already been viewed, expired, or never existed.';
        badgeClass = 'badge--unknown';
    }

    let html = `
      <div class="status-card__icon">${icon}</div>
      <h2 class="status-card__title">${escapeHtml(title)}</h2>
      <p class="status-card__detail">${escapeHtml(detail)}</p>
      <span class="badge ${badgeClass} ${status === 'pending' ? 'pulse' : ''}" style="margin-top:8px; align-self:center;">${escapeHtml(status || 'unknown')}</span>
    `;

    if (createdAt || expiresAt || viewedAt) {
      html += '<div class="status-card__meta">';
      if (createdAt) {
        html += `
          <div class="status-card__meta-row">
            <span class="status-card__meta-label">Created</span>
            <span class="status-card__meta-value">${formatDate(createdAt)}</span>
          </div>`;
      }
      if (expiresAt) {
        html += `
          <div class="status-card__meta-row">
            <span class="status-card__meta-label">Expires</span>
            <span class="status-card__meta-value">${formatDate(expiresAt)}</span>
          </div>`;
      }
      if (viewedAt) {
        html += `
          <div class="status-card__meta-row">
            <span class="status-card__meta-label">Viewed</span>
            <span class="status-card__meta-value">${formatDate(viewedAt)}</span>
          </div>`;
      }
      if (viewerCountry) {
        html += `
          <div class="status-card__meta-row">
            <span class="status-card__meta-label">Viewer location</span>
            <span class="status-card__meta-value">${escapeHtml(viewerCountry)}</span>
          </div>`;
      }
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function showStatus(status) {
    const statusLoading = document.getElementById('status-loading');
    const statusDisplay = document.getElementById('status-display');
    statusLoading.style.display = 'none';
    statusDisplay.style.display = '';
    renderStatus({ status }, statusDisplay);
  }
})();
