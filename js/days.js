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

  function renderYami(data) {
    const gaming = Array.isArray(data?.gaming) ? data.gaming : [];
    const watching = Array.isArray(data?.watching) ? data.watching : [];
    upsertLiveRow('gaming', gaming.length ? `<span class="day-key">PLAYED</span> ${gaming.map((x) => `${escapeHtml(x.title)}${x.minutes ? ` <small>${Math.round(x.minutes)}m</small>` : ''}`).join(', ')}` : '');
    upsertLiveRow('watching', watching.length ? `<span class="day-key">WATCHED</span> ${watching.map((x) => `${escapeHtml(x.title)}${x.episodes ? ` <small>${x.episodes} ep${x.episodes === 1 ? '' : 's'}</small>` : ''}`).join(', ')}` : '');
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
      for (const kind of ['track','album']) {
        let start=0;
        for (let i=1;i<=normalized.length;i++) {
          const key=(x)=>kind==='track'?`${x.artist}\n${x.track}`:x.album;
          if (i<normalized.length && key(normalized[i]) && key(normalized[i])===key(normalized[start])) continue;
          const count=i-start, threshold=kind==='track'?3:4;
          if (key(normalized[start]) && count>=threshold) streaks.push({kind,count,title:kind==='track'?normalized[start].track:normalized[start].album});
          start=i;
        }
      }
      let quiet=root.querySelector('.day-quiet');
      if (!quiet) { quiet=document.createElement('div'); quiet.className='day-quiet'; root.querySelector('.day-digest')?.append(quiet); }
      quiet.innerHTML=`<span class="day-key">LISTENED</span> ${listens.length} plays <small>· ${tracks.size} tracks · ${artists.size} artists</small>`;
      const digest=root.querySelector('.day-digest');
      streaks.sort((a,b)=>b.count-a.count).slice(0,3).forEach((s)=>{ const el=document.createElement('div'); el.innerHTML=`<span class="day-key">MUSIC</span> ${escapeHtml(s.title)} <small>×${s.count}${s.kind==='album'?' tracks':''}</small>`; digest?.insertBefore(el, quiet); });
    }).catch(() => {});
})();
