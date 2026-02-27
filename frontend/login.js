// login.js — Login page logic

(async function () {
  // Check if already logged in
  const user = await checkAuth();
  if (user) {
    window.location.href = '/dashboard';
    return;
  }

  // Show error from OAuth redirect
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) {
    const banner = document.getElementById('error-banner');
    const messages = {
      access_denied: 'Access was denied. Please try again.',
      invalid_request: 'Invalid request. Please try again.',
      invalid_state: 'Session expired. Please try signing in again.',
      token_exchange_failed: 'Authentication failed. Please try again.',
      userinfo_failed: 'Could not retrieve your profile. Please try again.',
    };
    banner.textContent = messages[error] || 'Something went wrong. Please try again.';
    banner.style.display = '';
  }
})();
