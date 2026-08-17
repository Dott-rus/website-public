(() => {
  const form = document.getElementById('owner-setup-form');
  const tokenInput = document.getElementById('owner-token');
  const result = document.getElementById('owner-setup-result');
  if (!form || !tokenInput || !result) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    tokenInput.value = '';
    if (!token) return;

    const button = form.querySelector('button');
    button.disabled = true;
    result.dataset.state = 'loading';
    result.textContent = 'Checking token...';

    try {
      const response = await fetch('/api/owner', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'same-origin',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request returned ${response.status}`);

      result.dataset.state = 'success';
      result.textContent = data.removedFromCount
        ? 'Done. This browser was also removed from the existing count.'
        : 'Done. This browser will not be counted.';
    } catch (error) {
      result.dataset.state = 'error';
      result.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
