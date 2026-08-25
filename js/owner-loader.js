(() => {
  'use strict';

  const SESSION_KEY = 'owner_access_token_session';
  const LOCAL_KEY = 'owner_access_token';
  const form = document.getElementById('cms-access-form');
  const input = document.getElementById('cms-token');
  const remember = document.getElementById('cms-remember');
  const forget = document.getElementById('cms-forget');
  const result = document.getElementById('cms-access-result');
  if (!form || !input || !remember || !forget || !result) return;

  let token = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(LOCAL_KEY) || '';
  remember.checked = Boolean(localStorage.getItem(LOCAL_KEY));

  const show = (state, text) => {
    result.dataset.state = state;
    result.textContent = text;
  };

  async function open(candidate) {
    token = String(candidate || '').trim();
    if (!token) return;
    show('loading', 'Checking…');
    try {
      const response = await fetch('/api/owner-app?v=2', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'force-cache',
      });
      if (!response.ok) throw new Error('Access denied');
      const source = await response.text();
      if (remember.checked) {
        localStorage.setItem(LOCAL_KEY, token);
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, token);
        localStorage.removeItem(LOCAL_KEY);
      }
      input.value = '';
      window.__OWNER_ACCESS_TOKEN__ = token;
      const script = document.createElement('script');
      script.textContent = source;
      document.body.append(script);
      show('success', 'Open.');
      form.hidden = true;
    } catch (error) {
      show('error', error.message || 'Access denied');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    open(input.value || token);
  });

  forget.addEventListener('click', () => {
    token = '';
    delete window.__OWNER_ACCESS_TOKEN__;
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LOCAL_KEY);
    input.value = '';
    remember.checked = false;
    show('', '');
  });

  if (token) open(token);
})();
