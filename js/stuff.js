(() => {
  'use strict';

  const filters = Array.from(document.querySelectorAll('[data-stuff-filter]'));
  const items = Array.from(document.querySelectorAll('[data-stuff-status]'));
  const groups = Array.from(document.querySelectorAll('[data-stuff-group]'));
  const status = document.getElementById('stuff-result-status');
  if (!filters.length || !items.length || !groups.length || !status) return;

  const knownFilters = new Set(filters.map((button) => button.dataset.stuffFilter));
  const query = new URLSearchParams(window.location.search);
  const initialFilter = knownFilters.has(query.get('status'))
    ? query.get('status')
    : 'all';

  function applyFilter(selected, updateUrl = true) {
    let visible = 0;
    items.forEach((item) => {
      const show = selected === 'all' || item.dataset.stuffStatus === selected;
      item.hidden = !show;
      if (show) visible += 1;
    });

    groups.forEach((group) => {
      group.hidden = !group.querySelector('[data-stuff-status]:not([hidden])');
    });

    filters.forEach((button) => {
      const active = button.dataset.stuffFilter === selected;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    status.textContent = `${visible} item${visible === 1 ? '' : 's'} shown.`;
    if (!updateUrl) return;

    const nextUrl = new URL(window.location.href);
    if (selected === 'all') nextUrl.searchParams.delete('status');
    else nextUrl.searchParams.set('status', selected);
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => applyFilter(button.dataset.stuffFilter));
  });

  applyFilter(initialFilter, false);
})();
