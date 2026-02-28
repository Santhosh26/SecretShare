// reveal.js — Reveal secret page logic

(async function () {
  // Parse URL: /s/:id#key
  const pathMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{22})$/);
  const keyString = window.location.hash.slice(1); // Remove the '#'

  if (!pathMatch || !keyString) {
    showError('Invalid secret link. Please check the URL and try again.');
    return;
  }

  const secretId = pathMatch[1];

  // DOM refs
  const statusChecking = document.getElementById('status-checking');
  const preReveal = document.getElementById('pre-reveal');
  const revealBtn = document.getElementById('reveal-btn');
  const revealLoading = document.getElementById('reveal-loading');
  const passwordSection = document.getElementById('password-section');
  const passwordInput = document.getElementById('reveal-password');
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const revealedState = document.getElementById('revealed-state');
  const secretContent = document.getElementById('secret-content');
  const copySecretBtn = document.getElementById('copy-secret-btn');

  let encryptedData = null; // Cache the blob after atomic burn for password retries
  let attempts = 0;
  let isPasswordProtected = false;

  // Phase 1: Pre-check status before burning
  try {
    const res = await fetch(`/api/secrets/${secretId}/status`);
    const statusData = await res.json();

    if (statusData.status === 'viewed') {
      showError('This secret has already been viewed and destroyed.');
      return;
    }

    if (statusData.status === 'expired') {
      showError('This secret has expired.');
      return;
    }

    if (statusData.status === 'unknown') {
      showError('Secret not found. It may have already been viewed or never existed.');
      return;
    }

    // Status is 'pending' — show the reveal UI
    isPasswordProtected = !!statusData.passwordProtected;

    statusChecking.style.display = 'none';
    preReveal.style.display = '';

    if (isPasswordProtected) {
      passwordSection.style.display = '';
      revealBtn.textContent = 'Decrypt';
      passwordInput.focus();
    }
  } catch {
    showError('Failed to check secret status. Please try again.');
    return;
  }

  // Phase 2: Burn and decrypt on button click
  revealBtn.addEventListener('click', handleReveal);

  // Enter key on password field
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleReveal();
  });

  async function handleReveal() {
    // If password-protected, require password before burning
    if (isPasswordProtected) {
      const password = passwordInput.value;
      if (!password) {
        showToast('Please enter the password', true);
        passwordInput.focus();
        return;
      }
    }

    revealBtn.disabled = true;
    revealLoading.classList.add('visible');

    try {
      // Fetch encrypted blob (atomic burn — only works once)
      if (!encryptedData) {
        const res = await fetch(`/api/secrets/${secretId}`, { credentials: 'include' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Secret not found or already viewed.');
        }
        encryptedData = await res.json();
      }

      // Decrypt
      let plaintext;
      if (encryptedData.passwordProtected) {
        const password = passwordInput.value;

        try {
          plaintext = await SecretCrypto.decryptWithPassword(
            encryptedData.encrypted,
            keyString,
            password,
            encryptedData.salt,
            secretId
          );
        } catch {
          attempts++;
          revealLoading.classList.remove('visible');
          revealBtn.disabled = false;
          passwordInput.value = '';
          passwordInput.focus();

          if (attempts >= 3) {
            showToast('Incorrect password. Please double-check and try again.', true);
          } else {
            showToast('Incorrect password.', true);
          }
          return;
        }
      } else {
        const key = await SecretCrypto.importKey(keyString);
        plaintext = await SecretCrypto.decrypt(encryptedData.encrypted, key, secretId);
      }

      // Show the secret
      preReveal.style.display = 'none';
      revealedState.style.display = '';
      secretContent.textContent = plaintext;

      // Copy handler
      copySecretBtn.addEventListener('click', () => {
        copyToClipboard(plaintext);
      });

    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      revealLoading.classList.remove('visible');
    }
  }

  function showError(msg) {
    statusChecking.style.display = 'none';
    preReveal.style.display = 'none';
    errorState.style.display = '';
    errorMessage.textContent = msg;
  }
})();
