(() => {
  const MOSCOW = 'Europe/Moscow';
  const localDate = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: MOSCOW, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).reduce((out, part) => (out[part.type] = part.value, out), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const shiftDate = (date, delta) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10);
  };
  const dayMeta = (date) => {
    const value = new Date(`${date}T12:00:00Z`);
    return {
      weekday: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(value).toUpperCase(),
      month: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(value).toUpperCase(),
      monthLong: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(value),
      day: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit' }).format(value),
    };
  };

  const today = localDate();
  const picker = document.querySelector('[data-day-picker]');
  const list = document.querySelector('[data-days-list]');
  const index = document.querySelector('.days-index');
  const monthPicker = document.querySelector('[data-days-month]');
  const archive = document.querySelector('[data-days-archive]');
  const feedback = document.querySelector('[data-days-feedback]');
  const narrow = window.matchMedia('(max-width: 767px)');
  if (!list || !index) return;

  // A static build can outlive midnight. Keep the new live day separate from the archive.
  const staleBody = list.querySelector('[data-live-day]');
  if (staleBody?.closest('[data-day-entry]').dataset.dayEntry !== today) {
    if (staleBody) {
      const staleEntry = staleBody.closest('[data-day-entry]');
      staleBody.removeAttribute('data-live-day');
      staleBody.querySelector('.day-live-note')?.remove();
      const state = staleEntry.querySelector('[data-day-state]');
      if (state) { state.textContent = staleEntry.dataset.dayEntry.slice(0, 4); state.classList.remove('is-live'); }
      const weekday = staleEntry.querySelector('[data-day-weekday]');
      if (weekday) weekday.textContent = dayMeta(staleEntry.dataset.dayEntry).weekday;
      const staleLinkTitle = index.querySelector(`[data-day-link="${staleEntry.dataset.dayEntry}"] strong`);
      if (staleLinkTitle) staleLinkTitle.textContent = dayMeta(staleEntry.dataset.dayEntry).weekday;
    }
    if (!list.querySelector(`[data-day-entry="${today}"]`)) {
      const date = new Date(today + 'T12:00:00Z');
      const title = new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'long', timeZone:'UTC'}).format(date);
      const entry = document.createElement('article');
      entry.className = 'day-entry'; entry.id = `day-${today}`; entry.dataset.dayEntry = today;
      entry.setAttribute('aria-labelledby', `title-${today}`);
      entry.innerHTML = `<header class="day-heading"><div class="day-kicker"><span data-day-weekday>Today</span><span class="day-state is-live" data-day-state>● LIVE</span></div><h2 id="title-${today}" tabindex="-1"><time datetime="${today}">${title}</time></h2><p class="day-overview" data-day-overview>live</p></header><div class="day-body" data-live-day><p class="day-live-note">[live] collecting today</p><section class="day-section"><div class="day-digest"><div class="day-empty" data-live-empty><span aria-hidden="true">· · ·</span><p>Nothing recorded yet.</p><small></small></div></div></section></div>`;
      list.prepend(entry);
      const link = document.createElement('a');
      link.className = 'days-index-row'; link.href = `#day-${today}`; link.dataset.dayLink = today;
      link.innerHTML = `<span class="days-index-number">${dayMeta(today).day}</span><span class="days-index-copy"><strong>Today</strong><small>live</small></span>`;
      index.prepend(link);
    }
    if (monthPicker && ![...monthPicker.options].some(option => option.value === today.slice(0,7))) {
      monthPicker.prepend(new Option(dayMeta(today).monthLong, today.slice(0,7)));
    }
    if (picker) picker.max = today;
  }
  const entries = [...list.querySelectorAll('[data-day-entry]')].sort((a,b)=>b.dataset.dayEntry.localeCompare(a.dataset.dayEntry));
  const links = [...index.querySelectorAll('[data-day-link]')];
  let selected = today;
  function showMonth(month) {
    if (monthPicker) monthPicker.value = month;
    links.forEach(link => { link.hidden = link.dataset.dayLink.slice(0,7) !== month; });
  }
  function select(date, updateUrl = true, focus = false) {
    const target = entries.find(entry => entry.dataset.dayEntry === date);
    if (!target) {
      if (feedback) feedback.textContent = 'No entry for this date.';
      return false;
    }
    selected = date;
    entries.forEach(entry => {
      entry.hidden = entry !== target;
      entry.classList.toggle('is-selected', entry === target);
    });
    links.forEach(link => {
      const active = link.dataset.dayLink === date;
      link.classList.toggle('is-selected', active);
      if (active) link.setAttribute('aria-current', 'date'); else link.removeAttribute('aria-current');
    });
    if (picker) picker.value = date;
    if (feedback) feedback.textContent = '';
    showMonth(date.slice(0,7));
    const position = entries.indexOf(target);
    document.querySelector('[data-day-step="1"]')?.toggleAttribute('disabled', position === entries.length - 1);
    document.querySelector('[data-day-step="-1"]')?.toggleAttribute('disabled', position === 0);
    document.querySelector('[data-days-today]')?.toggleAttribute('disabled', date === today);
    if (updateUrl) history.pushState(null, '', `#day-${date}`);
    if (narrow.matches && archive) archive.open = false;
    if (focus) target.querySelector('h2')?.focus({preventScroll:true});
    return true;
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-day-link]');
    if (link) { event.preventDefault(); select(link.dataset.dayLink, true, narrow.matches); }
    const step = event.target.closest('[data-day-step]');
    if (step && !step.disabled) {
      const position = entries.findIndex(entry => entry.dataset.dayEntry === selected);
      const target = entries[position + Number(step.dataset.dayStep)];
      if (target) select(target.dataset.dayEntry);
    }
    if (event.target.closest('[data-days-today]')) select(today);
  });
  monthPicker?.addEventListener('change', () => {
    const target = entries.find(entry => entry.dataset.dayEntry.startsWith(monthPicker.value));
    if (target) select(target.dataset.dayEntry);
  });
  picker?.addEventListener('change', () => select(picker.value));
  const syncHash = () => {
    const date = location.hash.match(/^#day-(\d{4}-\d{2}-\d{2})$/)?.[1];
    if (!select(date || today, false)) select(today, false);
  };
  window.addEventListener('popstate', syncHash);
  window.addEventListener('hashchange', syncHash);
  const syncArchive = () => { if (archive) archive.open = !narrow.matches; };
  narrow.addEventListener('change', syncArchive);
  syncArchive();
  syncHash();


  function enhanceGames(scope = document) {
    scope.querySelectorAll('span.day-game-insight').forEach(game => {
      const details = document.createElement('details');
      details.className = game.className + ' day-game-disclosure';
      const summary = document.createElement('summary');
      const image = game.querySelector(':scope > img, :scope > .day-game-chess-cover');
      if (image) summary.append(image);
      const title = game.querySelector('.day-game-title-row') || game.querySelector('.day-game-insight-body > strong');
      if (title) summary.append(title);
      const label = document.createElement('span');
      label.className = 'day-game-expand'; label.textContent = '[stats]';
      summary.append(label);
      const body = document.createElement('div'); body.className = 'day-game-details';
      game.querySelectorAll('.day-game-section, .day-game-insight-stats').forEach(stat => body.append(stat));
      details.append(summary, body); game.replaceWith(details);
    });
  }
  enhanceGames();
  const root = document.querySelector('[data-live-day]');
  if (!root) return;

  const digest = root.querySelector('.day-digest');
  const initialEmpty = digest?.querySelector('.day-empty');
  if (initialEmpty) initialEmpty.dataset.liveEmpty = '';
  const clearLiveEmpty = () => digest?.querySelector('[data-live-empty]')?.remove();

  setInterval(() => {
    if (localDate() !== today) location.reload();
  }, 60_000);

  function upsertLiveRow(kind, text) {
    let row = digest?.querySelector(`[data-live-yami="${kind}"], [data-kind="${kind}"]`);
    if (!text) { row?.remove(); return; }
    if (!row) {
      row = document.createElement('fieldset');
      row.dataset.liveYami = kind;
      digest?.prepend(row);
    }
    row.className = `day-media-row day-media-section ${kind === 'gaming' ? 'day-media-section-games' : kind === 'podcasts' ? 'day-media-section-podcasts' : 'day-media-section-watch'}`;
    const expanded = [...row.querySelectorAll('details[open]')].map(el => el.querySelector('strong')?.textContent);
    row.innerHTML = text;
    enhanceGames(row);
    row.querySelectorAll('details').forEach(el => { el.open = expanded.includes(el.querySelector('strong')?.textContent); });
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
    const progress = kind === 'podcast' && Number(item.total) > 0 ? Math.min(100, Math.max(0, Math.round(Number(item.position || 0) / Number(item.total) * 100))) : null;
    return `<span class="day-media-item day-media-${kind}">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="day-media-copy"><span>${escapeHtml(item.title || '?')}</span>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}${meta ? `<small>${escapeHtml(meta)}</small>` : ''}${progress !== null ? `<span class=\"day-podcast-progress\" aria-hidden=\"true\"><i style=\"width:${progress}%\"></i></span>` : ''}</span></span>`;
  }

  function podcastMeta(item = {}) {
    const bits = [];
    const minutes = Number(item.minutes || 0);
    const position = Number(item.position || 0);
    const total = Number(item.total || 0);
    if (minutes > 0) bits.push(`${Math.round(minutes)}m`);
    if (item.finished) bits.push('finished');
    else if (total > 0 && position >= 0) bits.push(`${Math.min(100, Math.max(0, Math.round(position / total * 100)))}%`);
    return bits.join(' · ');
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

    if (item.provider === 'lichess' && Array.isArray(item.matches)) {
      const insights = item.insights && typeof item.insights === 'object' ? item.insights : {};
      const stats = Object.entries(insights).map(([label, value]) => `<span class="day-game-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('');
      const matches = item.matches.map((match, index) => {
        const id = String(match.id || '');
        const url = /^\w{8}$/.test(id) ? `https://lichess.org/${id}` : '';
        const result = ({win:'W', loss:'L', draw:'D'})[match.result] || '?';
        const delta = Number.isFinite(match.ratingDiff) ? ` · ${match.ratingDiff >= 0 ? '+' : ''}${match.ratingDiff}` : '';
        const meta = [match.color, match.speed, match.rated ? `rated${delta}` : 'casual', `vs ${match.opponent || 'Guest'}`].filter(Boolean).join(' · ');
        return `<span class="day-game-stat"><small>${index + 1} · ${escapeHtml(result)} · ${escapeHtml(meta)}</small><b>${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)} ↗</a>` : escapeHtml(id)}</b></span>`;
      }).join('');
      return `<span class="day-game-insight day-game-lichess"><span class="day-game-chess-cover" aria-hidden="true">♞</span><span class="day-game-insight-body"><span class="day-game-title-row"><strong>Lichess</strong><small>${[item.minutes ? `${Math.round(item.minutes)}m` : '', `${item.plays || item.matches.length} games`].filter(Boolean).join(' · ')}</small></span><span class="day-game-section"><span class="day-game-section-label">SUMMARY</span><span class="day-game-stat-grid">${stats}</span></span><span class="day-game-section"><span class="day-game-section-label">GAMES</span><span class="day-game-stat-grid">${matches}</span></span></span></span>`;
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

  const liveSummary = { games: 0, watched: 0, podcasts: 0, plays: 0 };
  function updateOverview() {
    const bits = [];
    if (liveSummary.games) bits.push(`${liveSummary.games} game${liveSummary.games === 1 ? '' : 's'}`);
    if (liveSummary.watched) bits.push(`${liveSummary.watched} watched`);
    if (liveSummary.podcasts) bits.push(`${liveSummary.podcasts} podcast${liveSummary.podcasts === 1 ? '' : 's'}`);
    if (liveSummary.plays) bits.push(`${liveSummary.plays} listens`);
    if (bits.length) {
      const summary = root.closest('[data-day-entry]')?.querySelector('[data-day-overview]');
      if (summary) summary.textContent = bits.join(' · ');
    }
  }

  function renderYami(data) {
    const gaming = Array.isArray(data?.gaming) ? data.gaming : [];
    const watching = Array.isArray(data?.watching) ? data.watching : [];
    const podcasts = Array.isArray(data?.podcasts) ? data.podcasts : [];
    if (gaming.length || watching.length || podcasts.length) clearLiveEmpty();
    liveSummary.games = gaming.length; liveSummary.watched = watching.length; liveSummary.podcasts = podcasts.length; updateOverview();

    const supported = gaming.filter((item) => item.supported === true || Number(item.plays || 0) > 0 || (item.insights && typeof item.insights === 'object'));
    const generic = gaming.filter((item) => !supported.includes(item));
    const games = `${supported.length ? `<span class="day-game-supported-grid">${supported.map(gameItem).join('')}</span>` : ''}${generic.length ? `<span class="day-game-generic-grid">${generic.map(gameItem).join('')}</span>` : ''}`;
    upsertLiveRow('gaming', gaming.length ? `<legend>Played</legend><span class="day-media-items day-game-groups">${games}</span>` : '');

    upsertLiveRow('watching', watching.length ? `<legend>Watched</legend><span class="day-media-items">${watching.map((x) => mediaItem(x, watchedMeta(x), '', 'poster')).join('')}</span>` : '');

    upsertLiveRow('podcasts', podcasts.length ? `<legend>Podcasts</legend><span class="day-media-items">${podcasts.map((x) => mediaItem(x, podcastMeta(x), x.podcast || '', 'podcast')).join('')}</span>` : '');
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
      liveSummary.plays = listens.length; updateOverview();
      clearLiveEmpty();
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
      if (!quiet) { quiet=document.createElement('fieldset'); quiet.className='day-quiet'; root.querySelector('.day-digest')?.append(quiet); }
      quiet.innerHTML=`<legend>Listened</legend> ${listens.length} plays <small>· ${tracks.size} tracks · ${artists.size} artists</small>`;
      const digest=root.querySelector('.day-digest');
      streaks.sort((a,b)=>b.count-a.count).slice(0,3).forEach((s)=>{ const el=document.createElement('fieldset'); el.className='day-media-row day-music'; el.innerHTML=`<legend>On repeat</legend><span class="day-media-items">${mediaItem(s, `×${s.count}${s.kind==='album'?' tracks':''}`, s.artist)}</span>`; digest?.insertBefore(el, quiet); });
    }).catch(() => {});
})();
