// app.js — Create secret page logic

(async function () {
  // DOM refs
  const secretInput = document.getElementById('secret-input');
  const sizeCounter = document.getElementById('size-counter');
  const ttlSelect = document.getElementById('ttl-select');
  const passwordToggle = document.getElementById('password-toggle');
  const passwordField = document.getElementById('password-field');
  const passwordInput = document.getElementById('password-input');
  const createBtn = document.getElementById('create-btn');
  const loading = document.getElementById('loading');
  const createForm = document.getElementById('create-form');
  const result = document.getElementById('result');
  const shareLink = document.getElementById('share-link');
  const statusLink = document.getElementById('status-link');
  const copyShareBtn = document.getElementById('copy-share-btn');
  const copyStatusBtn = document.getElementById('copy-status-btn');
  const createAnotherBtn = document.getElementById('create-another-btn');

  const MAX_SIZE = 50000; // 50KB of text characters

  // --- Size counter ---
  secretInput.addEventListener('input', () => {
    const len = secretInput.value.length;
    sizeCounter.textContent = `${len.toLocaleString()} / 50,000 characters`;
    sizeCounter.className = 'size-counter';
    if (len > MAX_SIZE) {
      sizeCounter.classList.add('size-counter--error');
    } else if (len > MAX_SIZE * 0.9) {
      sizeCounter.classList.add('size-counter--warn');
    }
    createBtn.disabled = len === 0 || len > MAX_SIZE;
  });

  // --- Password toggle ---
  passwordToggle.addEventListener('change', () => {
    passwordField.classList.toggle('visible', passwordToggle.checked);
    if (!passwordToggle.checked) {
      passwordInput.value = '';
    }
  });

  // --- Create secret ---
  createBtn.addEventListener('click', handleCreate);

  // Enter key to create
  secretInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      handleCreate();
    }
  });

  async function handleCreate() {
    const plaintext = secretInput.value.trim();
    if (!plaintext || plaintext.length > MAX_SIZE) return;

    const password = passwordToggle.checked ? passwordInput.value : '';
    if (passwordToggle.checked && !password) {
      showToast('Please enter a password', true);
      passwordInput.focus();
      return;
    }
    if (passwordToggle.checked && password.length < 8) {
      showToast('Password must be at least 8 characters', true);
      passwordInput.focus();
      return;
    }

    // Disable UI
    createBtn.disabled = true;
    loading.classList.add('visible');

    try {
      // 1. Generate client-side ID
      const secretId = generateClientId();

      // 2. Generate encryption key
      const { key, keyString } = await SecretCrypto.generateKey();

      // 3. Encrypt
      let encrypted, salt;
      if (password) {
        const result = await SecretCrypto.encryptWithPassword(
          plaintext, key, password, secretId
        );
        encrypted = result.encrypted;
        salt = result.salt;
      } else {
        encrypted = await SecretCrypto.encrypt(plaintext, key, secretId);
      }

      // 4. Store via API
      const ttl = parseInt(ttlSelect.value, 10);
      await apiPost('/api/secrets', {
        id: secretId,
        encrypted,
        salt,
        passwordProtected: !!password,
        ttl,
      });

      // 5. Build links
      const origin = window.location.origin;
      const shareUrl = `${origin}/s/${secretId}#${keyString}`;
      const statusUrl = `${origin}/status/${secretId}`;

      // 6. Show result
      shareLink.textContent = shareUrl;
      shareLink.title = shareUrl;
      statusLink.textContent = statusUrl;
      statusLink.title = statusUrl;

      createForm.style.display = 'none';
      result.classList.add('visible');

      // Clear sensitive data from DOM
      secretInput.value = '';
      passwordInput.value = '';
      sizeCounter.textContent = '0 / 50,000 characters';

      // Copy handlers
      copyShareBtn.onclick = () => copyToClipboard(shareUrl);
      copyStatusBtn.onclick = () => copyToClipboard(statusUrl);
    } catch (err) {
      showToast(err.message || 'Something went wrong. Please try again.', true);
      createBtn.disabled = false;
    } finally {
      loading.classList.remove('visible');
    }
  }

  // --- Create another ---
  createAnotherBtn.addEventListener('click', () => {
    result.classList.remove('visible');
    createForm.style.display = '';
    createBtn.disabled = true;
    secretInput.focus();
  });
})();
