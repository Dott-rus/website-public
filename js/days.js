(() => {
  const entries = [...document.querySelectorAll('[data-day-entry]')];
  const strip = document.querySelector('[data-days-strip]');
  const picker = document.querySelector('[data-day-picker]');

  function select(date, updateUrl = true) {
    const target = document.querySelector(`[data-day-entry="${CSS.escape(date)}"]`);
    if (!target) return false;
    entries.forEach((entry) => entry.classList.toggle('is-selected', entry === target));
    document.querySelectorAll('[data-day-link]').forEach((link) => link.classList.toggle('is-selected', link.dataset.dayLink === date));
    if (picker) picker.value = date;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (updateUrl) history.replaceState(null, '', `#day-${date}`);
    return true;
  }

  document.addEventListener('click', (event) => {
    const open = event.target.closest('[data-day-open]');
    if (open) select(open.dataset.dayOpen);
    const link = event.target.closest('[data-day-link]');
    if (link) { event.preventDefault(); select(link.dataset.dayLink); }
  });
  picker?.addEventListener('change', () => select(picker.value));

  const hashDate = location.hash.match(/^#day-(\d{4}-\d{2}-\d{2})$/)?.[1];
  if (hashDate) select(hashDate, false);
  else document.querySelector('[data-day-entry].is-selected')?.dataset.dayEntry && select(document.querySelector('[data-day-entry].is-selected').dataset.dayEntry, false);

  const root = document.querySelector('[data-live-day]');
  if (!root) return;

  const digest = root.querySelector('.day-digest');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  function upsertLiveRow(kind, text) {
    let row = digest?.querySelector(`[data-live-yami="${kind}"]`);
    if (!text) { row?.remove(); return; }
    if (!row) {
      row = document.createElement('div');
      row.dataset.liveYami = kind;
      digest?.prepend(row);
    }
    row.innerHTML = text;
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  }

  function coverOf(item = {}) { return item.cover || item.image || item.poster || item.thumbnail || item.artwork || item.coverUrl || item.imageUrl || item.posterUrl || ''; }
  function watchedMeta(item = {}) {
    const watched = Array.isArray(item.watched) ? item.watched : [];
    if (!watched.length) return item.episodes ? `${item.episodes} ep${Number(item.episodes) === 1 ? '' : 's'}` : '';
    const seasons = new Map();
    for (const entry of watched) {
      const season = Number(entry?.season);
      const episode = Number(entry?.episode);
      if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;
      if (!seasons.has(season)) seasons.set(season, []);
      seasons.get(season).push(episode);
    }
    const ranges = (values) => {
      const nums = [...new Set(values)].sort((a,b)=>a-b);
      const parts = [];
      for (let i=0;i<nums.length;) {
        let j=i; while (j+1<nums.length && nums[j+1]===nums[j]+1) j++;
        parts.push(i===j ? `E${nums[i]}` : `E${nums[i]}–E${nums[j]}`);
        i=j+1;
      }
      return parts.join(', ');
    };
    const detail = [...seasons.entries()].sort((a,b)=>a[0]-b[0]).map(([season, episodes])=>`S${season} · ${ranges(episodes)}`).join(' / ');
    return detail || (item.episodes ? `${item.episodes} ep${Number(item.episodes) === 1 ? '' : 's'}` : '');
  }

  function mediaItem(item, meta = '', subtitle = '', kind = 'music') {
    const cover = coverOf(item);
    return `<span class="day-media-item day-media-${kind}">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="day-media-copy"><span>${escapeHtml(item.title || '?')}</span>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</span></span>`;
  }

  function gameItem(item = {}) {
    const hasInsights = item.supported === true || Number(item.plays || 0) > 0 || (item.insights && typeof item.insights === 'object');
    if (!hasInsights) {
      const achievements = Number(item.achievements || item.achievementsUnlocked || 0);
      const meta = [item.minutes ? `${Math.round(item.minutes)}m` : '', achievements ? `+${achievements} ach` : ''].filter(Boolean).join(' · ');
      return mediaItem(item, meta, '', 'game');
    }

    const cover = coverOf(item);
    const title = item.title || '?';
    const summary = [item.minutes ? `${Math.round(item.minutes)}m` : '', Number(item.plays || 0) > 0 ? `${Number(item.plays)} plays` : ''].filter(Boolean).join(' · ');
    if (title === 'osu!') {
      const insights = item.insights && typeof item.insights === 'object' ? item.insights : {};
      const standardOrder = ['global rank', 'pp', 'best', 'PBs'];
      const standard = standardOrder.filter((label) => insights[label] !== null && insights[label] !== undefined && insights[label] !== '').map((label) => `<span class="day-game-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(insights[label])}</b></span>`).join('');
      const ranked = item.rankedPlay && typeof item.rankedPlay === 'object' ? Object.entries(item.rankedPlay).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => `<span class="day-game-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('') : '';
      return `<span class="day-game-insight day-game-osu">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="day-game-insight-body"><span class="day-game-title-row"><strong>${escapeHtml(title)}</strong>${summary ? `<small>${escapeHtml(summary)}</small>` : ''}</span><span class="day-game-section"><span class="day-game-section-label">STANDARD</span><span class="day-game-stat-grid">${standard || '<small class="day-game-muted">collecting telemetry</small>'}</span></span>${ranked ? `<span class="day-game-section"><span class="day-game-section-label">RANKED PLAY</span><span class="day-game-stat-grid">${ranked}</span></span>` : ''}</span></span>`;
    }

    const stats = [];
    if (item.minutes) stats.push(`${Math.round(item.minutes)}m played`);
    if (Number(item.plays || 0) > 0) stats.push(`${Number(item.plays)} plays`);
    if (item.insights && typeof item.insights === 'object') {
      for (const [label, value] of Object.entries(item.insights)) {
        if (value !== null && value !== undefined && value !== '') stats.push(`${label}: ${value}`);
      }
    }
    return `<span class="day-game-insight">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="day-game-insight-body"><strong>${escapeHtml(title)}</strong><span class="day-game-insight-stats">${stats.map((stat) => `<small>${escapeHtml(stat)}</small>`).join('')}</span></span></span>`;
  }

  function renderYami(data) {
    const gaming = Array.isArray(data?.gaming) ? data.gaming : [];
    const watching = Array.isArray(data?.watching) ? data.watching : [];

    const supported = gaming.filter((item) => item.supported === true || Number(item.plays || 0) > 0 || (item.insights && typeof item.insights === 'object'));
    const generic = gaming.filter((item) => !supported.includes(item));
    const games = `${supported.length ? `<span class="day-game-supported-grid">${supported.map(gameItem).join('')}</span>` : ''}${generic.length ? `<span class="day-game-generic-grid">${generic.map(gameItem).join('')}</span>` : ''}`;
    upsertLiveRow('gaming', gaming.length ? `<span class="day-key">PLAYED</span><span class="day-media-items day-game-groups">${games}</span>` : '');

    upsertLiveRow('watching', watching.length ? `<span class="day-key">WATCHED</span><span class="day-media-items">${watching.map((x) => mediaItem(x, watchedMeta(x), '', 'poster')).join('')}</span>` : '');
  }

  async function refreshYami() {
    try {
      const response = await fetch(`https://yume.somedott.space/api/days/${today}`, { cache: 'no-store' });
      if (!response.ok) return;
      renderYami(await response.json());
    } catch {}
  }

  refreshYami();
  setInterval(refreshYami, 60_000);

  const USER = 'somedott';
  const start = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(start).reduce((a,p)=>(a[p.type]=p.value,a),{});
  const minTs = Math.floor(Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00+03:00`) / 1000);
  fetch(`https://api.listenbrainz.org/1/user/${USER}/listens?min_ts=${minTs}&count=1000`)
    .then((r) => r.ok ? r.json() : Promise.reject())
    .then((data) => {
      const listens = data?.payload?.listens || [];
      if (!listens.length) return;
      const tracks = new Set(), artists = new Set();
      const normalized = listens.slice().sort((a,b)=>(a.listened_at||0)-(b.listened_at||0)).map((x) => {
        const m=x.track_metadata||{}; tracks.add(`${m.artist_name}\n${m.track_name}`); artists.add(m.artist_name||'');
        return { track:m.track_name||'?', artist:m.artist_name||'?', album:m.release_name||'' };
      });
      const streaks=[];
      for (const kind of ['track']) {
        let start=0;
        for (let i=1;i<=normalized.length;i++) {
          const key=(x)=>kind==='track'?`${x.artist}\n${x.track}`:x.album;
          if (i<normalized.length && key(normalized[i]) && key(normalized[i])===key(normalized[start])) continue;
          const count=i-start, threshold=kind==='track'?3:4;
          if (key(normalized[start]) && count>=threshold) streaks.push({kind,count,title:kind==='track'?normalized[start].track:normalized[start].album,artist:normalized[start].artist,cover:normalized[start].cover});
          start=i;
        }
      }
      let quiet=root.querySelector('.day-quiet');
      if (!quiet) { quiet=document.createElement('div'); quiet.className='day-quiet'; root.querySelector('.day-digest')?.append(quiet); }
      quiet.innerHTML=`<span class="day-key">LISTENED</span> ${listens.length} plays <small>· ${tracks.size} tracks · ${artists.size} artists</small>`;
      const digest=root.querySelector('.day-digest');
      streaks.sort((a,b)=>b.count-a.count).slice(0,3).forEach((s)=>{ const el=document.createElement('div'); el.className='day-media-row'; el.innerHTML=`<span class="day-key">MUSIC</span><span class="day-media-items">${mediaItem(s, `×${s.count}${s.kind==='album'?' tracks':''}`, s.artist)}</span>`; digest?.insertBefore(el, quiet); });
    }).catch(() => {});
})();
