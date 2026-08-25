export function ownerApp() {
  const MIRA = 'https://mira.somedott.space';
  const API = `${MIRA}/api/v1`;
  const OWNER = 'Dott';
  const REPO = 'website';
  const BRANCH = 'v2';

  const privateRoot = document.getElementById('owner-private-root');
  if (!privateRoot) return;
  privateRoot.innerHTML = `
<section id="owner-cms" class="owner-cms">
<nav class="owner-tabs" aria-label="Content editors"><button type="button" class="owner-tab is-active" data-owner-tab="feed" aria-pressed="true">Feed</button><button type="button" class="owner-tab" data-owner-tab="stuff" aria-pressed="false">Stuff</button><button type="button" class="owner-tab" data-owner-tab="tracks" aria-pressed="false">Tracks</button></nav>
<section data-owner-panel="feed"><fieldset><legend>Add feed entry</legend><form id="feed-form" class="owner-form"><label>Type <select name="type" required><option value="life">Life</option><option value="site">Site</option><option value="project">Project</option><option value="photo">Photo</option><option value="note">Note</option><option value="collection">Collection</option></select></label><label>Title <input name="title" maxlength="140" required></label><label>Body <textarea name="body" rows="5" required></textarea></label><div class="owner-grid-2"><label>Link <input name="href"></label><label>Link label <input name="linkLabel" maxlength="80"></label></div><div class="owner-grid-2"><label>Date <input name="date" type="datetime-local"></label><label>ID <input name="id" pattern="[a-z0-9-]+"></label></div><button type="submit">Add to feed</button></form><p id="feed-result" class="owner-result" aria-live="polite"></p></fieldset></section>
<section data-owner-panel="stuff" hidden><fieldset><legend>Stuff</legend><div class="owner-button-row owner-toolbar"><label>Group <select id="stuff-group"></select></label><button id="stuff-reload" type="button" class="owner-button-secondary">Reload</button><button id="stuff-add" type="button">+ Add item</button></div><div id="stuff-items" class="owner-item-list"></div><p id="stuff-result" class="owner-result" aria-live="polite"></p></fieldset></section>
<section data-owner-panel="tracks" hidden><fieldset><legend>Tracks</legend><div class="owner-button-row owner-toolbar"><label>Track <select id="track-select"></select></label><button id="tracks-reload" type="button" class="owner-button-secondary">Reload</button><button id="track-new" type="button">+ New track</button></div><form id="track-form" class="owner-form" hidden><input type="hidden" name="filename"><div class="owner-grid-2"><label>Slug <input name="slug" required></label><label>Title <input name="title" required></label></div><div class="owner-grid-2"><label>Artist <input name="artist" required></label><label>Album <input name="album" required></label></div><div class="owner-grid-2"><label>Released <input name="released" type="date"></label><label>Duration <input name="duration"></label></div><div class="owner-grid-2"><label>Spotify track ID <input name="spotifyTrackId"></label><label>Cover filename <input name="cover"></label></div><label>Description <textarea name="description" rows="5" required></textarea></label><label class="owner-check"><input name="draft" type="checkbox"> Draft</label><button type="submit">Save track</button></form><p id="track-result" class="owner-result" aria-live="polite"></p></fieldset></section>
</section>
  `;

  const token = window.__OWNER_ACCESS_TOKEN__ || '';
  if (!token) return;

  const setResult = (element, state, text) => {
    element.dataset.state = state;
    element.textContent = text;
  };

  function authHeaders(extra = {}) {
    return {
      Accept: 'application/json',
      Authorization: `token ${token}`,
      ...extra,
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: authHeaders(options.headers || {}),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const message = data?.message || data?.error || `Mira returned ${response.status}`;
      throw new Error(message);
    }
    return data;
  }

  function decodeBase64(value) {
    const bytes = Uint8Array.from(atob(String(value || '').replace(/\s/g, '')), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  async function yaml(operation, payload) {
    const response = await fetch('/api/owner-app?v=2', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operation, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `YAML request returned ${response.status}`);
    return data;
  }

  async function getFile(path) {
    const data = await api(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(BRANCH)}`);
    const parsed = await yaml('parse', { source: decodeBase64(data.content) });
    return { data: parsed.value, sha: data.sha, raw: data };
  }

  async function saveFile(path, value, sha, message, create = false) {
    const serialized = await yaml('stringify', { value });
    const body = {
      branch: BRANCH,
      message,
      content: encodeBase64(serialized.source),
    };
    if (sha) body.sha = sha;
    const method = create ? 'POST' : 'PUT';
    return api(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponentPath(path)}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function encodeURIComponentPath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function makeId(type) {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    return `${type}-${stamp}`;
  }

  document.querySelectorAll('[data-owner-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.ownerTab;
      document.querySelectorAll('[data-owner-tab]').forEach((item) => {
        const active = item.dataset.ownerTab === selected;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      document.querySelectorAll('[data-owner-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.ownerPanel !== selected;
      });
    });
  });

  // Feed
  const feedForm = document.getElementById('feed-form');
  const feedResult = document.getElementById('feed-result');
  feedForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = feedForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setResult(feedResult, 'loading', 'Loading current feed from Mira...');
    try {
      const current = await getFile('content/feed.yaml');
      const form = new FormData(feedForm);
      const type = String(form.get('type') || '').trim();
      const href = String(form.get('href') || '').trim();
      const dateInput = String(form.get('date') || '').trim();
      const entry = {
        id: String(form.get('id') || '').trim() || makeId(type),
        type,
        date: dateInput ? new Date(dateInput).toISOString() : new Date().toISOString(),
        title: String(form.get('title') || '').trim(),
        body: String(form.get('body') || '').trim(),
      };
      if (href) {
        entry.href = href;
        entry.linkLabel = String(form.get('linkLabel') || '').trim() || 'Open';
      }
      if (!/^[a-z0-9-]+$/.test(entry.id)) throw new Error('ID must contain only lowercase letters, numbers and hyphens');
      if (current.data.some((item) => item.id === entry.id)) throw new Error(`Feed ID ${entry.id} already exists`);
      const next = [entry, ...current.data];
      const saved = await saveFile('content/feed.yaml', next, current.sha, `Add feed entry: ${entry.title}`);
      feedForm.reset();
      setResult(feedResult, 'success', `Saved to Mira · ${saved.commit?.sha?.slice(0, 8) || 'commit created'}`);
    } catch (error) {
      setResult(feedResult, 'error', error.message);
    } finally {
      button.disabled = false;
    }
  });

  // Stuff
  const stuffGroup = document.getElementById('stuff-group');
  const stuffItems = document.getElementById('stuff-items');
  const stuffResult = document.getElementById('stuff-result');
  const stuffReload = document.getElementById('stuff-reload');
  const stuffAdd = document.getElementById('stuff-add');
  let stuffDocument = null;
  let stuffSha = '';

  async function loadStuff() {
    setResult(stuffResult, 'loading', 'Loading Stuff from Mira...');
    try {
      const file = await getFile('content/collections.yaml');
      stuffDocument = file.data;
      stuffSha = file.sha;
      stuffGroup.replaceChildren(...stuffDocument.groups.map((group) => new Option(group.title, group.id)));
      renderStuffGroup();
      setResult(stuffResult, 'success', `Loaded ${stuffDocument.groups.reduce((n, group) => n + group.items.length, 0)} items.`);
    } catch (error) {
      setResult(stuffResult, 'error', error.message);
    }
  }

  function renderStuffGroup() {
    if (!stuffDocument) return;
    const group = stuffDocument.groups.find((item) => item.id === stuffGroup.value) || stuffDocument.groups[0];
    if (!group) return;
    stuffGroup.value = group.id;
    stuffItems.replaceChildren(...group.items.map((item, index) => makeStuffEditor(group, item, index)));
  }

  function makeStuffEditor(group, item, index) {
    const details = document.createElement('details');
    details.className = 'owner-item-card';
    const summary = document.createElement('summary');
    summary.textContent = `${item.title} · ${stuffDocument.statuses.find((s) => s.id === item.status)?.label || item.status}`;
    details.append(summary);

    const form = document.createElement('form');
    form.className = 'owner-form';
    form.innerHTML = `
      <label>Title <input name="title" required></label>
      <label>Meta <input name="meta" required></label>
      <label>Status <select name="status"></select></label>
      <label>Note <textarea name="note" rows="3"></textarea></label>
      <div class="owner-grid-2"><label>Cover <input name="cover"></label><label>Link <input name="href"></label></div>
      <div class="owner-button-row"><button type="submit">Save item</button><button type="button" class="owner-button-danger" data-delete>Delete</button></div>`;
    form.elements.title.value = item.title || '';
    form.elements.meta.value = item.meta || '';
    form.elements.note.value = item.note || '';
    form.elements.cover.value = item.cover || '';
    form.elements.href.value = item.href || '';
    const statusSelect = form.elements.status;
    stuffDocument.statuses.forEach((status) => statusSelect.add(new Option(status.label, status.id)));
    statusSelect.value = item.status;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const fresh = await getFile('content/collections.yaml');
        const freshGroup = fresh.data.groups.find((candidate) => candidate.id === group.id);
        if (!freshGroup || !freshGroup.items[index] || freshGroup.items[index].title !== item.title) {
          throw new Error('Stuff changed since it was loaded. Reload before saving.');
        }
        const nextItem = {
          title: form.elements.title.value.trim(),
          meta: form.elements.meta.value.trim(),
          status: statusSelect.value,
        };
        for (const key of ['note', 'cover', 'href']) {
          const value = form.elements[key].value.trim();
          if (value) nextItem[key] = value;
        }
        freshGroup.items[index] = nextItem;
        fresh.data.updatedAt = new Date().toISOString().slice(0, 10);
        const saved = await saveFile('content/collections.yaml', fresh.data, fresh.sha, `Update Stuff: ${nextItem.title}`);
        setResult(stuffResult, 'success', `Saved ${nextItem.title} · ${saved.commit?.sha?.slice(0, 8) || 'commit created'}`);
        await loadStuff();
      } catch (error) {
        setResult(stuffResult, 'error', error.message);
      } finally {
        button.disabled = false;
      }
    });

    form.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!confirm(`Delete ${item.title} from Stuff?`)) return;
      try {
        const fresh = await getFile('content/collections.yaml');
        const freshGroup = fresh.data.groups.find((candidate) => candidate.id === group.id);
        if (!freshGroup || !freshGroup.items[index] || freshGroup.items[index].title !== item.title) {
          throw new Error('Stuff changed since it was loaded. Reload before deleting.');
        }
        freshGroup.items.splice(index, 1);
        fresh.data.updatedAt = new Date().toISOString().slice(0, 10);
        const saved = await saveFile('content/collections.yaml', fresh.data, fresh.sha, `Remove Stuff: ${item.title}`);
        setResult(stuffResult, 'success', `Removed ${item.title} · ${saved.commit?.sha?.slice(0, 8) || 'commit created'}`);
        await loadStuff();
      } catch (error) {
        setResult(stuffResult, 'error', error.message);
      }
    });

    details.append(form);
    return details;
  }

  stuffGroup?.addEventListener('change', renderStuffGroup);
  stuffReload?.addEventListener('click', loadStuff);
  stuffAdd?.addEventListener('click', async () => {
    if (!stuffDocument) return;
    const group = stuffDocument.groups.find((item) => item.id === stuffGroup.value);
    if (!group) return;
    const title = prompt('New item title:')?.trim();
    if (!title) return;
    try {
      const fresh = await getFile('content/collections.yaml');
      const freshGroup = fresh.data.groups.find((candidate) => candidate.id === group.id);
      freshGroup.items.push({ title, meta: 'not set', status: 'not-set' });
      fresh.data.updatedAt = new Date().toISOString().slice(0, 10);
      const saved = await saveFile('content/collections.yaml', fresh.data, fresh.sha, `Add Stuff: ${title}`);
      setResult(stuffResult, 'success', `Added ${title} · ${saved.commit?.sha?.slice(0, 8) || 'commit created'}`);
      await loadStuff();
      const cards = stuffItems.querySelectorAll('details');
      cards[cards.length - 1]?.setAttribute('open', '');
    } catch (error) {
      setResult(stuffResult, 'error', error.message);
    }
  });

  // Tracks
  const trackSelect = document.getElementById('track-select');
  const trackForm = document.getElementById('track-form');
  const trackResult = document.getElementById('track-result');
  const tracksReload = document.getElementById('tracks-reload');
  const trackNew = document.getElementById('track-new');
  let trackFiles = [];
  let activeTrackSha = '';
  let creatingTrack = false;

  async function loadTracks() {
    setResult(trackResult, 'loading', 'Loading tracks from Mira...');
    try {
      const list = await api(`/repos/${OWNER}/${REPO}/contents/content/tracks?ref=${encodeURIComponent(BRANCH)}`);
      trackFiles = Array.isArray(list) ? list.filter((item) => item.type === 'file' && item.name.endsWith('.yaml')) : [];
      trackSelect.replaceChildren(new Option('Choose a track…', ''), ...trackFiles.map((file) => new Option(file.name, file.name)));
      trackForm.hidden = true;
      setResult(trackResult, 'success', `Loaded ${trackFiles.length} track files.`);
    } catch (error) {
      setResult(trackResult, 'error', error.message);
    }
  }

  async function openTrack(filename) {
    if (!filename) { trackForm.hidden = true; return; }
    try {
      const file = await getFile(`content/tracks/${filename}`);
      activeTrackSha = file.sha;
      creatingTrack = false;
      const track = file.data;
      for (const name of ['slug', 'title', 'artist', 'album', 'released', 'duration', 'spotifyTrackId', 'cover', 'description']) {
        trackForm.elements[name].value = track[name] ?? '';
      }
      trackForm.elements.filename.value = filename;
      trackForm.elements.draft.checked = Boolean(track.draft);
      trackForm.hidden = false;
      setResult(trackResult, 'success', `Editing ${filename}`);
    } catch (error) {
      setResult(trackResult, 'error', error.message);
    }
  }

  trackSelect?.addEventListener('change', () => openTrack(trackSelect.value));
  tracksReload?.addEventListener('click', loadTracks);
  trackNew?.addEventListener('click', () => {
    creatingTrack = true;
    activeTrackSha = '';
    trackForm.reset();
    trackForm.elements.artist.value = 'someDott';
    trackForm.elements.draft.checked = true;
    trackForm.elements.filename.value = '';
    trackForm.hidden = false;
    setResult(trackResult, '', 'New track. It starts as a draft.');
  });

  trackForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = trackForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const track = {};
      for (const name of ['slug', 'title', 'artist', 'album', 'released', 'duration', 'spotifyTrackId', 'cover', 'description']) {
        track[name] = trackForm.elements[name].value.trim();
      }
      track.draft = trackForm.elements.draft.checked;
      const currentFilename = trackForm.elements.filename.value;
      const filename = currentFilename || `${track.slug.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')}.yaml`;
      if (!filename || filename === '.yaml') throw new Error('Slug is required for a new track');

      let sha = activeTrackSha;
      if (!creatingTrack) {
        const fresh = await getFile(`content/tracks/${filename}`);
        if (fresh.sha !== activeTrackSha) throw new Error('Track changed since it was loaded. Reload it before saving.');
        sha = fresh.sha;
      }
      const saved = await saveFile(`content/tracks/${filename}`, track, sha, `${creatingTrack ? 'Add' : 'Update'} track: ${track.title}`, creatingTrack);
      creatingTrack = false;
      activeTrackSha = saved.content?.sha || sha;
      trackForm.elements.filename.value = filename;
      setResult(trackResult, 'success', `Saved ${track.title} · ${saved.commit?.sha?.slice(0, 8) || 'commit created'}`);
      await loadTracks();
      trackSelect.value = filename;
      await openTrack(filename);
    } catch (error) {
      setResult(trackResult, 'error', error.message);
    } finally {
      button.disabled = false;
    }
  });

  Promise.allSettled([loadStuff(), loadTracks()]);
}
