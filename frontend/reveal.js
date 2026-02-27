// reveal.js — Reveal secret page logic

(async function () {
  await initPage();

  // Parse URL: /s/:id#key
  const pathMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{22})$/);
  const keyString = window.location.hash.slice(1); // Remove the '#'

  if (!pathMatch || !keyString) {
    showError('Invalid secret link. Please check the URL and try again.');
    return;
  }

  const secretId = pathMatch[1];

  // DOM refs
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

  revealBtn.addEventListener('click', handleReveal);

  // Enter key on password field
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleReveal();
  });

  async function handleReveal() {
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

        // If password-protected, show password field and wait for input
        if (encryptedData.passwordProtected) {
          passwordSection.style.display = '';
          revealLoading.classList.remove('visible');
          revealBtn.disabled = false;
          revealBtn.textContent = 'Decrypt';
          passwordInput.focus();

          // Only proceed if we already have a password entered
          if (!passwordInput.value) {
            return;
          }
        }
      }

      // Decrypt
      let plaintext;
      if (encryptedData.passwordProtected) {
        const password = passwordInput.value;
        if (!password) {
          showToast('Please enter the password', true);
          revealBtn.disabled = false;
          revealLoading.classList.remove('visible');
          passwordInput.focus();
          return;
        }

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
    preReveal.style.display = 'none';
    errorState.style.display = '';
    errorMessage.textContent = msg;
  }
})();
