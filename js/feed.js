(() => {
  'use strict';

  const stream = document.getElementById('feed-stream');
  const filters = Array.from(document.querySelectorAll('[data-feed-filter]'));
  const status = document.getElementById('feed-result-status');
  if (!stream || !filters.length || !status) return;

  const entries = Array.from(stream.querySelectorAll('[data-feed-type]'));
  const knownFilters = new Set(filters.map((button) => button.dataset.feedFilter));
  const query = new URLSearchParams(window.location.search);
  const initialFilter = knownFilters.has(query.get('type')) ? query.get('type') : 'all';

  function applyFilter(type, updateUrl = true) {
    let visible = 0;
    entries.forEach((entry) => {
      const show = type === 'all' || entry.dataset.feedType === type;
      entry.hidden = !show;
      if (show) visible += 1;
    });

    filters.forEach((button) => {
      const active = button.dataset.feedFilter === type;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const activeLabel = filters
      .find((button) => button.dataset.feedFilter === type)
      ?.textContent.replace(/\s+\d+\s*$/, '').trim() || 'Everything';
    status.textContent = type === 'all'
      ? `${visible} signals in the stream.`
      : `${visible} ${activeLabel.toLowerCase()} signal${visible === 1 ? '' : 's'}.`;

    if (!updateUrl) return;
    const nextUrl = new URL(window.location.href);
    if (type === 'all') nextUrl.searchParams.delete('type');
    else nextUrl.searchParams.set('type', type);
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => applyFilter(button.dataset.feedFilter));
  });

  applyFilter(initialFilter, false);
})();
