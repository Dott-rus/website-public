(() => {
  const SITE_STATE_CACHE_KEY = 'dott-site-state';
  const SITE_STATE_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const presenceRoot = document.getElementById('presence-status');
  const presenceText = document.getElementById('presence-text');
  const visitorCounter = document.getElementById('visitor-counter');
  if (!presenceRoot && !visitorCounter) return;

  const statusLabels = {
    online: 'Online',
    away: 'Away',
    offline: 'Offline',
    unknown: 'Unknown',
  };

  function relativeTime(timestamp) {
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function renderPresence(presence) {
    if (!presenceRoot || !presenceText) return;
    const status = statusLabels[presence?.status] ? presence.status : 'unknown';
    const parts = [statusLabels[status]];
    if (status === 'offline' && presence?.lastSeen) {
      parts.push(`last seen ${relativeTime(presence.lastSeen)}`);
    }
    if (presence?.device) parts.push(presence.device);

    presenceRoot.dataset.status = status;
    presenceText.textContent = parts.join(' · ');
  }

  function renderVisitors(visitors) {
    if (!visitorCounter || !Number.isSafeInteger(visitors) || visitors < 0) return;
    visitorCounter.textContent = `visitor no. ${String(visitors).padStart(6, '0')}`;
  }

  function restoreCachedState() {
    try {
      const cached = JSON.parse(localStorage.getItem(SITE_STATE_CACHE_KEY));
      if (
        !cached
        || !cached.value
        || !Number.isFinite(cached.savedAt)
        || Date.now() - cached.savedAt > SITE_STATE_CACHE_MAX_AGE
      ) return false;
      renderPresence(cached.value.presence);
      renderVisitors(cached.value.visitors);
      return true;
    } catch {
      return false;
    }
  }

  function cacheState(value) {
    try {
      localStorage.setItem(SITE_STATE_CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        value,
      }));
    } catch {
      // The live endpoint remains usable when storage is unavailable.
    }
  }

  const restoredState = restoreCachedState();

  fetch('/api/site', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Site state returned ${response.status}`);
      return response.json();
    })
    .then((data) => {
      cacheState(data);
      renderPresence(data.presence);
      renderVisitors(data.visitors);
    })
    .catch(() => {
      if (!restoredState) renderPresence({ status: 'unknown' });
    });
})();
