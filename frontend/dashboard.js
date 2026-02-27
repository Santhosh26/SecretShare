// dashboard.js — Dashboard page logic

(async function () {
  const user = await initPage();

  if (!user) {
    window.location.href = '/login';
    return;
  }

  const dashboardLoading = document.getElementById('dashboard-loading');
  const emptyState = document.getElementById('empty-state');
  const tableWrap = document.getElementById('secrets-table-wrap');
  const tbody = document.getElementById('secrets-tbody');
  const cardsContainer = document.getElementById('secrets-cards');

  try {
    const data = await apiGet('/api/dashboard/secrets');
    const secrets = data.secrets || [];

    dashboardLoading.style.display = 'none';

    if (secrets.length === 0) {
      emptyState.style.display = '';
      return;
    }

    tableWrap.style.display = '';
    renderTable(secrets, tbody);
    renderCards(secrets, cardsContainer);
  } catch (err) {
    dashboardLoading.style.display = 'none';
    emptyState.style.display = '';
    emptyState.querySelector('.empty-state__text').textContent =
      'Failed to load your secrets. Please try again.';
  }

  function safeStatus(status) {
    const allowed = ['pending', 'viewed', 'expired'];
    return allowed.includes(status) ? status : 'unknown';
  }

  function renderTable(secrets, container) {
    container.innerHTML = secrets.map((s) => {
      const status = safeStatus(s.status);
      const badgeClass = `badge--${status}`;
      const pulseClass = status === 'pending' ? 'pulse' : '';
      const statusLink = `/status/${encodeURIComponent(s.id)}`;

      return `
        <tr>
          <td class="secret-id-cell" title="${escapeHtml(s.id)}">${escapeHtml(s.id.slice(0, 8))}...</td>
          <td><span class="badge ${badgeClass} ${pulseClass}">${escapeHtml(status)}</span>${s.passwordProtected ? ' <span title="Password protected" style="font-size:0.75rem;">&#128274;</span>' : ''}</td>
          <td style="font-size:0.75rem; color:var(--text-muted)">${formatShortDate(s.createdAt)}</td>
          <td style="font-size:0.75rem; color:var(--text-muted)">${formatShortDate(s.expiresAt)}</td>
          <td style="font-size:0.75rem; color:var(--text-muted)">${s.viewedAt ? formatShortDate(s.viewedAt) : '—'}${s.viewerCountry ? ` <span title="Viewer country">${escapeHtml(s.viewerCountry)}</span>` : ''}</td>
          <td><a href="${statusLink}" class="btn btn--secondary btn--small" style="font-size:0.6875rem; padding:4px 8px;">Status</a></td>
        </tr>`;
    }).join('');
  }

  function renderCards(secrets, container) {
    container.innerHTML = secrets.map((s) => {
      const status = safeStatus(s.status);
      const badgeClass = `badge--${status}`;
      const pulseClass = status === 'pending' ? 'pulse' : '';

      return `
        <div class="dashboard-card">
          <div class="dashboard-card__header">
            <span class="dashboard-card__id">${escapeHtml(s.id.slice(0, 12))}...</span>
            <span class="badge ${badgeClass} ${pulseClass}">${escapeHtml(status)}</span>
          </div>
          <div class="dashboard-card__details">
            <span>Created: ${formatShortDate(s.createdAt)}</span>
            <span>Expires: ${formatShortDate(s.expiresAt)}</span>
            ${s.viewedAt ? `<span>Viewed: ${formatShortDate(s.viewedAt)}${s.viewerCountry ? ` (${escapeHtml(s.viewerCountry)})` : ''}</span>` : ''}
            ${s.passwordProtected ? '<span>&#128274; Password protected</span>' : ''}
          </div>
          <a href="/status/${encodeURIComponent(s.id)}" style="display:block; margin-top:8px; font-size:0.75rem;">View status</a>
        </div>`;
    }).join('');
  }

  function formatShortDate(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
})();
